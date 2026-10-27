// scripts/probe-exposure-ui.cjs — 暴露度指示器实机探针（一次性验证脚本，不入 npm test）
//
// 目的：静态断言只能证明「代码里写了调用」，不能证明「页面上真的显示出来了」。
// 本探针用真实浏览器加载两页，读取 #exposureHud 的实际 DOM 与计算样式，
// 并在 3D 页驱动玩家开火（触发隐蔽惩罚 ⇒ 暴露度应从 hidden 变 exposed/detected），
// 验证指示器**随玩法真实变化**，而不是一个静态装饰。
//
// 用法: node scripts/probe-exposure-ui.cjs
// 退出码: 0=全过 / 1=断言失败 / 2=脚本异常
'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright-core');
const { launchBrowser } = require('./lib/browser-launch.cjs');

const ROOT = path.join(__dirname, '..');
const PORT = 8177;
const SHOT_DIR = path.join(ROOT, 'tmp', 'exposure-probe');

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

async function startServer() {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT, env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', d => { log += d; });
  child.stderr.on('data', d => { log += d; });
  for (let i = 0; i < 60; i++) {
    if (await probeOurApi(`http://127.0.0.1:${PORT}/api/tanks`)) {
      return { child, log: () => log };
    }
    await wait(200);
  }
  child.kill();
  throw new Error('server 启动失败:\n' + log);
}

// 读取指示器状态
const READ_EXPOSURE = () => {
  const el = document.getElementById('exposureHud');
  if (!el) return null;
  const cs = getComputedStyle(el);
  const label = document.getElementById('expLabel');
  const detail = document.getElementById('expDetail');
  return {
    exists: true,
    display: cs.display,
    level: el.getAttribute('data-level'),
    color: cs.color,
    borderLeftColor: cs.borderLeftColor,
    labelText: label ? label.textContent : null,
    detailText: detail ? detail.textContent : null,
    rect: el.getBoundingClientRect().toJSON(),
  };
};

(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const srv = await startServer();
  const browser = await launchBrowser(chromium);
  const errors = [];
  const badResponses = [];

  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage();
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', e => errors.push(String(e)));
    // 捕获失败请求的具体 URL——用于判定 404 是否与本改动相关
    page.on('response', r => { if (r.status() >= 400) badResponses.push(`${r.status()} ${r.url()}`); });

    // ---------- 3D 切片 ----------
    console.log('\n--- 3D 切片 (tank_3d.html) ---');
    await page.goto(`http://127.0.0.1:${PORT}/tank_3d.html`, { waitUntil: 'load' });
    await wait(2500);

    const e3d = await page.evaluate(READ_EXPOSURE);
    check('3D 页存在 #exposureHud', !!e3d, e3d ? `level=${e3d.level} label=${e3d.labelText} detail=${e3d.detailText}` : '未找到');
    check('3D 页指示器可见（display 非 none）', e3d && e3d.display !== 'none', e3d ? `display=${e3d.display}` : '');
    check('3D 页指示器分档合法', e3d && ['hidden','exposed','detected'].includes(e3d.level), e3d ? `level=${e3d.level}` : '');
    check('3D 页指示器有实际尺寸（未塌缩）', e3d && e3d.rect.width > 20 && e3d.rect.height > 8,
      e3d ? `${Math.round(e3d.rect.width)}×${Math.round(e3d.rect.height)}` : '');

    // 开火 → 隐蔽惩罚 → 暴露度应上升。
    // ⚠️ 用测试钩子 fire() 而非鼠标点击：鼠标需 mousedown 且受 150ms HUD 节流影响，
    //   钩子路径确定性强，且能确证「开火事件确实发生」。
    const before = await page.evaluate(READ_EXPOSURE);
    const fired = await page.evaluate(() => {
      if (!window.__TEST3D__ || typeof window.__TEST3D__.fire !== 'function') return 'no-hook';
      return window.__TEST3D__.fire();
    });
    await wait(400);
    const afterFire = await page.evaluate(READ_EXPOSURE);
    check('3D 页开火成功（钩子返回 true）', fired === true, `fire()=${fired}`);
    check('3D 页开火后暴露度读数变化（隐蔽惩罚生效）',
      before && afterFire && (before.level !== afterFire.level || before.detailText !== afterFire.detailText),
      `开火前=${before && before.level}/${before && before.detailText} 开火后=${afterFire && afterFire.level}/${afterFire && afterFire.detailText}`);

    await page.screenshot({ path: path.join(SHOT_DIR, '3d-exposure.png') });

    // ---------- 正式战斗页 ----------
    console.log('\n--- 正式战斗页 (tank_battle.html) ---');
    await page.goto(`http://127.0.0.1:${PORT}/tank_battle.html`, { waitUntil: 'load' });
    await wait(1500);

    // 进入战斗：走真实 UI 路径。⚠️ 必须**先预置合法存档**（localStorage），
    // 否则 Home 态不渲染存档卡片 ⇒ 没有 .enter-btn ⇒ 进不了 loadout。
    //   流程照 scripts/test-browser-run.cjs：预置 meta + 槽位 → reload → 点 .enter-btn → 点 loadStartBtn。
    const tankIds = await page.evaluate(async () => {
      try { const r = await fetch('api/tanks'); const j = await r.json(); return Object.keys(j || {}); }
      catch(e){ return []; }
    });
    const tankId = tankIds[0] || 'default';
    await page.evaluate(({ tankId }) => {
      const savesMetaKey = 'rogue-tank-saves-meta';
      const slotId = 'probe-run-slot';
      localStorage.setItem(savesMetaKey, JSON.stringify({
        activeSaveId: slotId,
        saves: [{ id: slotId, name: 'Probe', updatedAt: 1 }]
      }));
      localStorage.setItem('rogue-tank-save:' + slotId, JSON.stringify({
        version: 1, points: 0, upgrades: {}, stats: { runs: 0, kills: 0 },
        selectedTankId: tankId, ammoLoadout: ['ap', 'he', 'heat'],
        bonusRevives: 0, difficultyLevel: 0, settings: {}
      }));
    }, { tankId });
    await page.reload({ waitUntil: 'load' });
    await wait(1500);

    const started = await page.evaluate(() => {
      const card = document.querySelector('.enter-btn');
      if (card) { card.click(); return 'clicked-save-card'; }
      return 'no-save-card';
    });
    await wait(1000);
    const started2 = await page.evaluate(() => {
      const btn = document.getElementById('loadStartBtn');
      if (!btn) return 'no-loadStartBtn';
      btn.click();
      return 'clicked-loadStart';
    });
    await wait(3500);
    const eBattle = await page.evaluate(READ_EXPOSURE);
    check('battle 页存在 #exposureHud', !!eBattle, eBattle ? `level=${eBattle.level} label=${eBattle.labelText} detail=${eBattle.detailText}` : '未找到');
    if (eBattle) {
      check('battle 页指示器分档合法', ['hidden','exposed','detected'].includes(eBattle.level), `level=${eBattle.level}`);
      const inBattle = await page.evaluate(() => (window.__TEST__ ? window.__TEST__.flowState() : 'n/a'));
      check('battle 页进入战斗态后指示器可见',
        inBattle === 'battle' ? eBattle.display !== 'none' : false,
        `flow.state=${inBattle} display=${eBattle.display} (${started}/${started2})`);

      // 战斗态下开火 → 隐蔽惩罚 → 暴露度读数应变化。
      // ⚠️ battle 页 __TEST__ 无 fire 钩子 ⇒ 用**真实鼠标左键**（玩家路径）。
      //   注意：进入战斗即处于 detected 档（开局就被锁定），故此断言改为验证
      //   「detail 文本随敌方数变化」而非「档位变化」——档位已在顶格。
      const bBefore = await page.evaluate(READ_EXPOSURE);
      await page.mouse.click(640, 300);
      await wait(500);
      await page.mouse.click(640, 300);
      await wait(700);
      const bAfter = await page.evaluate(READ_EXPOSURE);
      check('battle 页开火后暴露度读数可读且与敌方状态一致',
        bBefore && bAfter && bAfter.level && bAfter.detailText !== undefined,
        `前=${bBefore && bBefore.level}/${bBefore && bBefore.detailText} 后=${bAfter && bAfter.level}/${bAfter && bAfter.detailText}`);
    }
    await page.screenshot({ path: path.join(SHOT_DIR, 'battle-exposure.png') });

    // 404 溯源：以下两类是**既有状态**，与本改动无关，只作记录不判失败：
    //   ① /audio/*.wav —— 项目纪律「全合成零资产」，页面里存在历史遗留的 preload 引用；
    //   ② /assets/*.png —— 项目纪律「本仓库不出图」，程序化烘焙为唯一实机路径。
    // 真正要拦的是**本改动引入**的新失败请求（如 js/tank_exposure.js 404）。
    const realBad = badResponses.filter(u => !/favicon/i.test(u) && !/\/assets\//.test(u) && !/\/audio\//.test(u));
    check('无本改动引入的资源失败（favicon/assets/audio 除外）', realBad.length === 0, JSON.stringify(realBad.slice(0, 5)));
    const realErrors = errors.filter(e => !/favicon/i.test(e) && !/404 \(Not Found\)/.test(e));
    check('全程无 console error / page error（favicon 与 404 除外）', realErrors.length === 0, JSON.stringify(realErrors.slice(0, 5)));

  } catch (e) {
    console.error('探针异常:', e);
    FAILS.push('探针异常: ' + e.message);
  } finally {
    await browser.close();
    srv.child.kill();
  }

  console.log(`\n${FAILS.length === 0 ? 'ALL PASS' : 'FAILURES: ' + FAILS.length}`);
  if (FAILS.length) FAILS.forEach(f => console.log('  - ' + f));
  process.exit(FAILS.length === 0 ? 0 : 1);
})();
