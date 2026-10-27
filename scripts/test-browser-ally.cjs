// scripts/test-browser-ally.cjs — A0（2026-10-27）友军指挥浏览器链。
// 覆盖：编队生成 / 上下文默认命令键（Z）/ 集火目标权威（击发目标 ≡ 任务目标）/
//   目标死亡不暗换最近敌人 / 非法目标整批拒绝 / 撤退与驻守 / HUD 可读状态。
// 用法: node scripts/test-browser-ally.cjs
// 退出码: 0=全过 / 1=断言失败 / 2=脚本异常 / 86=环境拒绝 spawn
'use strict';

const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright-core');
const { launchBrowser } = require('./lib/browser-launch.cjs');

const ROOT = path.join(__dirname, '..');
const DEFAULT_PORT = 8000;
const ALT_PORT = 8123;

const FAILS = [];
function check(name, cond, detail) {
  const ok = !!cond;
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${detail ? ' | ' + detail : ''}`);
  if (!ok) FAILS.push(name);
}
const wait = ms => new Promise(r => setTimeout(r, ms));

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

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let body = '';
      res.on('data', c => { body += c; });
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

function startServer(port) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['server.js'], {
      cwd: ROOT,
      env: { ...process.env, PORT: String(port) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let log = '';
    child.stdout.on('data', d => { log += d; });
    child.stderr.on('data', d => { log += d; });
    const api = `http://127.0.0.1:${port}/api/tanks`;
    const deadline = Date.now() + 10000;
    const poll = async () => {
      if (await probeOurApi(api, 800)) { resolve(child); return; }
      if (child.exitCode !== null) { reject(new Error(`server.js exited early (${child.exitCode})\n${log}`)); return; }
      if (Date.now() > deadline) { reject(new Error(`server.js not ready\n${log}`)); return; }
      setTimeout(poll, 400);
    };
    poll();
  });
}

async function ensureServer() {
  if (await probeOurApi(`http://127.0.0.1:${DEFAULT_PORT}/api/tanks`)) {
    return { base: `http://127.0.0.1:${DEFAULT_PORT}`, child: null };
  }
  const child = await startServer(ALT_PORT);
  return { base: `http://127.0.0.1:${ALT_PORT}`, child };
}

(async () => {
  let browser = null;
  let server = null;
  try {
    server = await ensureServer();
    const tanks = await fetchJson(`${server.base}/api/tanks`);
    const tankId = Object.keys(tanks || {})[0];
    if (!tankId) throw new Error('api/tanks 为空');

    browser = await launchBrowser(chromium);
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors = [];
    page.on('console', m => {
      if (m.type() === 'error' && !String(m.text()).includes('Failed to load resource')) errors.push(m.text());
    });
    page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

    await page.goto(`${server.base}/tank_battle.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const slotId = 'e2e-ally';
    await page.evaluate(({ tankId, slotId }) => {
      localStorage.setItem('rogue-tank-saves-meta', JSON.stringify({
        activeSaveId: slotId,
        saves: [{ id: slotId, name: 'E2E-Ally', updatedAt: 1 }],
      }));
      localStorage.setItem('rogue-tank-save:' + slotId, JSON.stringify({
        version: 1, points: 0, upgrades: {}, stats: { runs: 0, kills: 0 },
        selectedTankId: tankId, ammoLoadout: ['ap', 'he', 'heat'],
        bonusRevives: 0, difficultyLevel: 0, settings: {},
      }));
    }, { tankId, slotId });
    await page.reload({ waitUntil: 'load', timeout: 30000 });
    await wait(800);

    await page.evaluate(() => document.querySelector('.enter-btn').click());
    await wait(500);
    await page.evaluate(() => document.getElementById('loadStartBtn').click());
    await page.waitForFunction(() => window.__TEST__ && window.__TEST__.flowState() === 'battle', null, { timeout: 30000 });
    await wait(1500);

    // ① 编队生成
    let allies = await page.evaluate(() => window.__TEST__.allies());
    check('标准模式生成 2 辆友军', allies.length === 2, `count=${allies.length}`);
    check('友军默认跟随', allies.every(a => a.order === 'follow'), JSON.stringify(allies.map(a => a.order)));

    // ② 选一个敌人作为集火目标（优先选离玩家较远的，确保不是「最近敌人」）
    // ② 转盘集火：把一辆敌军放到玩家视野内（大世界出生点可能不在屏幕），再按住 Z 锁定
    await page.evaluate(() => {
      const p = window.__TEST__.player();
      const e = window.__TEST__.entities().find(x => x.team === 'enemy' && x.hp > 0);
      if (e) { e.x = p.x + 180; e.y = p.y; }
    });
    await wait(150);
    const target = await page.evaluate(() => {
      const es = window.__TEST__.entities().filter(e => e.team === 'enemy' && e.hp > 0);
      for (const e of es) {
        const s = window.__TEST__.enemyScreen(e.id);
        if (s && s.x > 120 && s.x < 1160 && s.y > 100 && s.y < 620) return { id: e.id, sx: s.x, sy: s.y };
      }
      return null;
    });
    check('存在屏幕内可集火敌人', !!target, JSON.stringify(target));
    if (!target) throw new Error('没有屏幕内敌人，无法继续');

    await page.mouse.move(target.sx, target.sy);
    await wait(100);
    await page.keyboard.down('z');
    await wait(320);                                   // 打开转盘并锁定世界光标
    const wheelOpen = await page.evaluate(() => window.__TEST__.allyWheelState());
    await page.mouse.move(520, 440);                   // 左下扇区 = 集火
    await wait(100);
    const wheelFocus = await page.evaluate(() => window.__TEST__.allyWheelState());
    check('按住 Z 打开转盘且选中集火', wheelOpen.open && wheelFocus.order === 'focus', JSON.stringify(wheelFocus));
    await page.keyboard.up('z');
    await wait(200);

    allies = await page.evaluate(() => window.__TEST__.allies());
    check('转盘集火下发到全体', allies.every(a => a.order === 'focus' && a.targetId === target.id),
      JSON.stringify(allies.map(a => [a.order, a.targetId])));

    const fireTargets = await page.evaluate(() => window.__TEST__.allies().map(a => window.__TEST__.allyFireTarget(a.id)));
    check('击发权威目标 ≡ 任务目标（不按最近敌人）', fireTargets.every(id => id === target.id), JSON.stringify(fireTargets));

    // ③ 目标死亡 → 击发目标 null（不暗换最近敌人）
    await page.evaluate(tid => { const e = window.__TEST__.entities().find(x => x.id === tid); if (e) e.hp = 0; }, target.id);
    await wait(400);
    const afterDeath = await page.evaluate(() => window.__TEST__.allies().map(a => ({
      fire: window.__TEST__.allyFireTarget(a.id), phase: a.phase, reason: a.reason,
    })));
    check('目标死亡后不暗换最近敌人', afterDeath.every(a => a.fire === null), JSON.stringify(afterDeath));
    check('任务转入 blocked/target-lost', afterDeath.every(a => a.phase === 'blocked' && a.reason === 'target-lost'),
      JSON.stringify(afterDeath.map(a => [a.phase, a.reason])));

    // ④ 非法目标整批拒绝，且不覆盖既有任务
    const bad = await page.evaluate(() => window.__TEST__.issueAllyCommand({ order: 'focus', targetId: 'no_such' }));
    check('非法目标整批拒绝', bad.issued.length === 0 && bad.reason === 'target-missing', JSON.stringify(bad));

    // ⑤ 转盘移动：光标指向地面 → 右下扇区
    const pScreen = await page.evaluate(() => window.__TEST__.enemyScreen('player'));
    const gx = Math.max(120, Math.min(1160, pScreen.x + 220));
    const gy = Math.max(100, Math.min(620, pScreen.y + 60));
    await page.mouse.move(gx, gy);
    await wait(100);
    await page.keyboard.down('z');
    await wait(320);
    await page.mouse.move(760, 440);                   // 右下扇区 = 移动
    await wait(100);
    const wheelMove = await page.evaluate(() => window.__TEST__.allyWheelState());
    check('转盘选中移动', wheelMove.order === 'move', JSON.stringify(wheelMove));
    await page.keyboard.up('z');
    await wait(200);
    allies = await page.evaluate(() => window.__TEST__.allies());
    check('转盘移动下发并记录锚点', allies.every(a => a.order === 'move' && a.anchor), JSON.stringify(allies.map(a => a.anchor)));

    // ⑥ 轻按 Z = 跟随
    await page.keyboard.press('z');
    await wait(150);
    allies = await page.evaluate(() => window.__TEST__.allies());
    check('轻按 Z 下发跟随', allies.every(a => a.order === 'follow'), JSON.stringify(allies.map(a => a.order)));

    // ⑦ 命令确实驱动了车体（aiDecide → driveTank 接线）
    const before = await page.evaluate(() => window.__TEST__.allies().map(a => ({ x: a.x, y: a.y })));
    const moveRes = await page.evaluate(() => {
      const p = window.__TEST__.player();
      return window.__TEST__.issueAllyCommand({ order: 'move', anchor: { x: p.x + 320, y: p.y + 200 } });
    });
    await wait(2500);
    const after = await page.evaluate(() => window.__TEST__.allies().map(a => ({ x: a.x, y: a.y })));
    const moved = after.some((a, i) => Math.hypot(a.x - before[i].x, a.y - before[i].y) > 20);
    check('友军按命令实际移动（决策→驾驶接线）', moved,
      JSON.stringify({ res: moveRes, dist: after.map((a, i) => Math.hypot(a.x - before[i].x, a.y - before[i].y).toFixed(1)) }));

    // ⑧ HUD 可读状态
    const hud = await page.evaluate(() => {
      const el = document.getElementById('allyHud');
      return el ? { display: getComputedStyle(el).display, text: el.textContent } : null;
    });
    check('友军 HUD 可见且列出编队', !!hud && hud.display !== 'none' && /友军/.test(hud.text), JSON.stringify(hud));

    // ⑨ 键位说明包含友军命令（可发现性）
    const bindings = await page.evaluate(() => {
      const rows = window.describeBindings ? window.describeBindings({ commandWheel: true }) : [];
      return rows.map(r => r.action);
    });
    check('键位说明包含友军命令转盘', bindings.includes('commandWheel'), JSON.stringify(bindings));

    check('全程无 console error / page error', errors.length === 0, JSON.stringify(errors.slice(0, 3)));
  } catch (err) {
    console.error(err && err.stack ? err.stack : String(err));
    process.exitCode = 2;
  } finally {
    if (browser) await browser.close();
    if (server && server.child) server.child.kill();
  }
  if (!process.exitCode) {
    if (FAILS.length) { console.error(`\n${FAILS.length} 项失败`); process.exitCode = 1; }
    else console.log('\ntest-browser-ally: 全部通过');
  }
})();
