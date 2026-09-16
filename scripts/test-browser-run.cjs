// 浏览器集成测试（C 环节）：真实 run 链路验证 —— 合法存档出击 → map → battle，
// 验证 2b7d281 弹种三槽(数字键1/2/3) + Q/E 环形轮换（2026-09-14 定案 E=下一发/Q=上一发） + 卡牌直系演变(replaceAmmo) 在
// tank_mvp.html 实际页面中的接线，以及 G/H/V 能力入口不抛错。
// 用法: node scripts/test-browser-run.cjs
'use strict';
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright-core');

const ROOT = path.join(__dirname, '..');
const DEFAULT_PORT = 8000;
const ALT_PORT = 8124;
const BASE_PROBE = `http://127.0.0.1:${DEFAULT_PORT}/`;
const API_PROBE = `http://127.0.0.1:${DEFAULT_PORT}/api/tanks`;

const FAILS = [];
function check(name, cond, detail) {
  const ok = !!cond;
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${detail ? ' | ' + detail : ''}`);
  if (!ok) FAILS.push(name);
}

function probeOk(url, timeoutMs = 1200) {
  return new Promise(resolve => {
    const req = http.get(url, res => { res.resume(); resolve(true); });
    req.setTimeout(timeoutMs, () => { req.destroy(); resolve(false); });
    req.on('error', () => resolve(false));
  });
}

function probeOurApi(url, timeoutMs = 1500) {
  return new Promise(resolve => {
    const req = http.get(url, res => {
      let body = '';
      res.on('data', c => { body += c; });
      res.on('end', () => { try { JSON.parse(body); resolve(true); } catch { resolve(false); } });
    });
    req.setTimeout(timeoutMs, () => { req.destroy(); resolve(false); });
    req.on('error', () => resolve(false));
  });
}

function startServer(port) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['server.js'], {
      cwd: ROOT,
      env: { ...process.env, PORT: String(port) },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let log = '';
    child.stdout.on('data', d => { log += d; });
    child.stderr.on('data', d => { log += d; });
    const url = `http://127.0.0.1:${port}/api/tanks`;
    const deadline = Date.now() + 10000;
    const poll = async () => {
      if (await probeOurApi(url, 800)) { resolve(child); return; }
      if (child.exitCode !== null) { reject(new Error(`server.js exited early (code ${child.exitCode})\n${log}`)); return; }
      if (Date.now() > deadline) { reject(new Error(`server.js not ready on :${port} within 10s\n${log}`)); return; }
      setTimeout(poll, 500);
    };
    poll();
  });
}

function realErrorsOf(errs) {
  return errs.filter(e => !String(e).includes('Failed to load resource'));
}

const waitFor = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  let child = null;
  let browser = null;
  try {
    let base = null;
    if (await probeOk(BASE_PROBE) && await probeOurApi(API_PROBE)) {
      base = `http://127.0.0.1:${DEFAULT_PORT}`;
      console.log(`[server] reuse existing: ${base}`);
    } else if (await probeOk(BASE_PROBE)) {
      base = `http://127.0.0.1:${ALT_PORT}`;
      child = await startServer(ALT_PORT);
      console.log(`[server] spawned: ${base}`);
    } else {
      base = `http://127.0.0.1:${DEFAULT_PORT}`;
      child = await startServer(DEFAULT_PORT);
      console.log(`[server] spawned: ${base}`);
    }

    // 取第一个坦克 id（存档 selectedTankId 需要合法值）
    const tanks = await new Promise((resolve, reject) => {
      http.get(`${base}/api/tanks`, res => {
        let body = '';
        res.on('data', c => { body += c; });
        res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
      }).on('error', reject);
    });
    const tankIds = Object.keys(tanks || {});
    check('api/tanks 返回至少 1 辆坦克', tankIds.length > 0, `count=${tankIds.length}`);
    const tankId = tankIds[0];
    const slotId = 'e2e-run-slot';
    const savesMetaKey = 'rogue-tank-saves-meta';
    const slotKey = 'rogue-tank-save:' + slotId;

    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

    // 预置合法存档（meta + 槽位），页面 loadProfile 直接读到
    await page.goto(`${base}/tank_mvp.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.evaluate(({ savesMetaKey, slotKey, slotId, tankId }) => {
      localStorage.setItem(savesMetaKey, JSON.stringify({
        activeSaveId: slotId,
        saves: [{ id: slotId, name: 'E2E-Run', updatedAt: 1 }]
      }));
      localStorage.setItem(slotKey, JSON.stringify({
        version: 1, points: 0, upgrades: {}, stats: { runs: 0, kills: 0 },
        selectedTankId: tankId, ammoLoadout: ['ap', 'he', 'heat'],
        bonusRevives: 0, difficultyLevel: 0, settings: {}
      }));
    }, { savesMetaKey, slotKey, slotId, tankId });
    await page.reload({ waitUntil: 'load', timeout: 30000 });
    await waitFor(1200);

    // Home 态：点击「选择进入」→ loadout
    const clickedEnter = await page.evaluate(() => {
      const btn = document.querySelector('.enter-btn');
      if (!btn) return false;
      btn.click();
      return true;
    });
    check('Home 显示存档卡片并可点击进入', clickedEnter);
    await waitFor(600);

    // loadout → START RUN（beginRunFromMenu → map）
    const started = await page.evaluate(() => {
      const btn = document.getElementById('loadStartBtn');
      if (!btn) return false;
      btn.click();
      return true;
    });
    check('loadout 点击 START（beginRunFromMenu）', started);
    await waitFor(800);

    const flowState = await page.evaluate(() => window.__TEST__ ? window.__TEST__.flowState() : null);
    check('出击后进入 map 态', flowState === 'map', `state=${flowState}`);

    // skipToNode(0) → battle（走状态机，实体化节点战斗）
    const battleState = await page.evaluate(() => {
      if (window.__TEST__.flowState() !== 'map') return null;
      window.__TEST__.skipToNode(0);
      return window.__TEST__.flowState();
    });
    check('skipToNode(0) 进入 battle 态', battleState === 'battle', `state=${battleState}`);
    await waitFor(500);

    const boot = await page.evaluate(() => {
      const p = window.__TEST__.player();
      return {
        ammoLoadout: (p.ammoLoadout || []).slice(),
        ammoKey: p.ammoKey,
        currentAmmoIndex: p.currentAmmoIndex
      };
    });
    check('battle 态 player.ammoLoadout = [ap,he]（2026-09-14 新局从 0 开始，开局恒 ap/he）', boot.ammoLoadout.join(',') === 'ap,he', JSON.stringify(boot));
    check('初始 ammoKey = 槽0 (ap)', boot.ammoKey === 'ap', `ammoKey=${boot.ammoKey}`);

    // 阶段六键位重排：数字键 1/2/3 不再切弹（让位技能快捷键池），Q/E 环形循环承担切弹
    await page.keyboard.press('1');
    await waitFor(80);
    let k1 = await page.evaluate(() => ({ key: window.__TEST__.player().ammoKey, idx: window.__TEST__.player().currentAmmoIndex }));
    check('数字键 1 不再切弹（技能池让位）→ ammoKey 保持 ap', k1.key === 'ap', JSON.stringify(k1));

    // 2026-09-14 用户定案反向：E = 下一发（ap → he → ap → …）
    const eCycle = [];
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('e');
      await waitFor(60);
      eCycle.push(await page.evaluate(() => window.__TEST__.player().ammoKey));
    }
    check('E 键正向轮换 3 次序列 = [he,ap,he]', eCycle.join(',') === 'he,ap,he', eCycle.join(','));

    // Q = 上一发（ap → he → ap → …）
    const qCycle = [];
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('q');
      await waitFor(60);
      qCycle.push(await page.evaluate(() => window.__TEST__.player().ammoKey));
    }
    check('Q 键反向轮换 3 次序列 = [ap,he,ap]', qCycle.join(',') === 'ap,he,ap', qCycle.join(','));

    // 卡牌直系演变：giveCard 走 applyCardEffects → 按链上直系前驱替换（2026-09-15 用户定案三链）

    // KE 链逐级：ap → apcr → apds → apfsds（sniper_apfsds_conversion 前驱=apds，跳级 ap→apfsds 已废）
    const evo1 = await page.evaluate(() => {
      const before = (window.__TEST__.player().ammoLoadout || []).slice();
      window.__TEST__.giveCard('ammo_upgrade_apcr');
      window.__TEST__.giveCard('ammo_upgrade_apds');
      window.__TEST__.giveCard('sniper_apfsds_conversion');
      const p = window.__TEST__.player();
      return { before: before.join(','), after: (p.ammoLoadout || []).join(','), ammoKey: p.ammoKey };
    });
    check('giveCard KE 链逐级：ap→apcr→apds→apfsds', evo1.before === 'ap,he' && evo1.after === 'apfsds,he', JSON.stringify(evo1));
    check('演变后当前弹种同步为 apfsds（若原为 ap）', evo1.ammoKey === 'apfsds', `ammoKey=${evo1.ammoKey}`);

    // 跳级拒绝：直接给 blast_he（前驱 proximity_he 未在 loadout）→ 不新增不替换
    const antiJump = await page.evaluate(() => {
      const loadout0 = (window.__TEST__.player().ammoLoadout || []).slice();
      window.__TEST__.giveCard('ammo_upgrade_blast_he');
      const p = window.__TEST__.player();
      return { before: loadout0.join(','), after: (p.ammoLoadout || []).join(',') };
    });
    check('giveCard blast_he 跳级被拒（前驱缺失不新增不替换）', antiJump.before === 'apfsds,he' && antiJump.after === 'apfsds,he', JSON.stringify(antiJump));

    // HE 分支逐级（2026-09-15 用户定案：he→aphe→hesh→proximity_he→blast_he）
    const evo2 = await page.evaluate(() => {
      window.__TEST__.giveCard('ammo_upgrade_aphe');      // 首条 HE 分支：新增 aphe，保留 he
      window.__TEST__.giveCard('ammo_upgrade_hesh');      // hesh 替换 aphe
      window.__TEST__.giveCard('ammo_upgrade_proximity_he'); // proximity_he 替换 hesh
      window.__TEST__.giveCard('ammo_upgrade_blast_he');  // blast_he 替换 proximity_he
      const p = window.__TEST__.player();
      return { after: (p.ammoLoadout || []).join(','), ammoKey: p.ammoKey };
    });
    check('giveCard HE 分支逐级：he→aphe→hesh→proximity_he→blast_he', evo2.after === 'apfsds,he,blast_he', JSON.stringify(evo2));

    // 能力入口 G/H/V 在 battle 态可调用（按钮存在；未持对应卡返回 reason 提示，不抛错）
    const abilityCalls = await page.evaluate(() => {
      const r = {};
      for (const id of ['btnG', 'btnH', 'btnV']) {
        const btn = document.getElementById(id);
        r[id] = btn ? 'present' : 'missing';
        if (btn) {
          try { btn.click(); r[id] = 'ok'; } catch (e) { r[id] = 'ERR:' + e.message; }
        }
      }
      return r;
    });
    check('G/H/V 能力按钮存在且点击不抛错', Object.values(abilityCalls).every(v => v === 'ok'), JSON.stringify(abilityCalls));

    const realErr = realErrorsOf(errors);
    check('全程无 console error / page error', realErr.length === 0, `errors=${JSON.stringify(realErr)}`);

    console.log('=== RESULT ===');
    if (FAILS.length === 0) { console.log('ALL PASS'); process.exit(0); }
    else { console.error(`FAILED (${FAILS.length}):`, FAILS.join(', ')); process.exit(1); }
  } catch (err) {
    console.error('EXCEPTION:', err);
    process.exit(2);
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (child) { try { process.kill(child.pid); } catch (_) {} }
  }
})();