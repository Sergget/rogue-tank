// 浏览器自动化测试（R-1/R-2/R-3 专项冒烟）：在真实 Edge (channel=msedge, headless) 中
// 验证 tank_bench.html 的技能/召唤物/特种弹药交互与 tank_mvp.html 稳定性。
// 用法: node scripts/test-browser-r3.cjs
'use strict';
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright-core');

const ROOT = path.join(__dirname, '..');
const DEFAULT_PORT = 8000;
const ALT_PORT = 8123;
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
  // 404 资源请求是常见噪音（缺失的装饰性 assets/图片），与既有 test-browser-smoke.cjs 同策略：过滤掉。
  return errs.filter(e => !String(e).includes('Failed to load resource'));
}

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

    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const benchErrors = [];
    page.on('console', m => { if (m.type() === 'error') benchErrors.push(m.text()); });
    page.on('pageerror', e => benchErrors.push('PAGEERROR: ' + e.message));

    // ---- 1. 装甲测试台（tank_bench.html）加载与交互验证 ----
    await page.goto(`${base}/tank_bench.html`, { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(1000);

    check('tank_bench.html 正常加载无 console error', realErrorsOf(benchErrors).length === 0, `errors=${JSON.stringify(realErrorsOf(benchErrors))}`);

    // 验证 R-1/R-2/R-3 扩展面板 DOM 元素存在
    const panelBtns = await page.evaluate(() => ({
      skillFireCtrl: !!document.getElementById('skillFireCtrlBtn'),
      skillSpeed: !!document.getElementById('skillSpeedBtn'),
      spawnTurret: !!document.getElementById('spawnTurretBtn'),
      spawnMine: !!document.getElementById('spawnMineBtn'),
      spawnCover: !!document.getElementById('spawnCoverBtn'),
    }));
    check('测试台具备 R-1/R-2/R-3 面板控制按钮', Object.values(panelBtns).every(Boolean), JSON.stringify(panelBtns));

    // 点击主动技能按钮
    await page.evaluate(() => {
      document.getElementById('skillFireCtrlBtn').click();
      document.getElementById('skillSpeedBtn').click();
    });
    await page.waitForTimeout(200);

    // 点击战术部署按钮（固定炮塔 / 地雷 / 掩体）
    const deployRes = await page.evaluate(() => {
      const before = (window.deployables && window.deployables.length) || 0;
      document.getElementById('spawnTurretBtn').click();
      document.getElementById('spawnMineBtn').click();
      document.getElementById('spawnCoverBtn').click();
      const after = (window.deployables && window.deployables.length) || 0;
      return { before, after };
    });
    check('战术部署物生成（炮塔/地雷/掩体注册进 deployables）', deployRes.after === deployRes.before + 3, `count: ${deployRes.before} -> ${deployRes.after}`);

    // 弹种切换（解耦轮：测试台与正式游戏对齐 — 鼠标点击弹种格 + Q/E 环形循环；
    // 数字键 1~N 直选已摘除，改为点击 data-ammo 格验证 APFSDS/HEC 两条 R-3 弹种路径）
    await page.evaluate(() => {
      const cell = document.querySelector('#ammoIndicator [data-ammo="apfsds"]');
      if (cell) cell.click();
    });
    await page.waitForTimeout(150);
    const ammo5 = await page.evaluate(() => {
      const el = document.getElementById('ammoIndicator');
      return { text: el ? el.textContent : '' };
    });
    check('点击弹种格切换至 APFSDS（鼠标选择路径）', ammo5.text.includes('APFSDS'), ammo5.text);

    await page.evaluate(() => {
      const cell = document.querySelector('#ammoIndicator [data-ammo="blast_he"]');
      if (cell) cell.click();
    });
    await page.waitForTimeout(150);
    const ammo6 = await page.evaluate(() => {
      const el = document.getElementById('ammoIndicator');
      return { text: el ? el.textContent : '' };
    });
    check('点击弹种格切换至 BLAST_HE（2026-09-14 hec 移除后由 blast_he 接替）', ammo6.text.includes('HE-OP') || ammo6.text.includes('超压榴弹'), ammo6.text);

    // Q 键环形循环（与正式游戏同语义：font-weight:700 的格子为当前激活弹种）
    const qRes = await page.evaluate(() => {
      const cells = Array.from(document.querySelectorAll('#ammoIndicator [data-ammo]'));
      const active = cells.find(c => c.style.fontWeight === '700');
      return { active: active ? active.getAttribute('data-ammo') : null, total: cells.length };
    });
    await page.keyboard.press('q');
    await page.waitForTimeout(150);
    const qRes2 = await page.evaluate(() => {
      const cells = Array.from(document.querySelectorAll('#ammoIndicator [data-ammo]'));
      const active = cells.find(c => c.style.fontWeight === '700');
      return { active: active ? active.getAttribute('data-ammo') : null };
    });
    check('Q 键环形切换弹种（与正式游戏同语义）',
      qRes.active && qRes2.active && qRes.active !== qRes2.active,
      `${qRes.active} -> ${qRes2.active} (total=${qRes.total})`);

    // 测试开火（空格键）生成炮弹
    await page.keyboard.press('Space');
    await page.waitForTimeout(300);

    check('交互后测试台保持无 JS 抛错', realErrorsOf(benchErrors).length === 0, `errors=${JSON.stringify(realErrorsOf(benchErrors))}`);

    // ---- 2. 正式游戏页（tank_mvp.html）基本加载验证 ----
    const mvpErrors = [];
    const mvpPage = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    mvpPage.on('console', m => { if (m.type() === 'error') mvpErrors.push(m.text()); });
    mvpPage.on('pageerror', e => mvpErrors.push('PAGEERROR: ' + e.message));

    await mvpPage.goto(`${base}/tank_mvp.html`, { waitUntil: 'load', timeout: 30000 });
    await mvpPage.waitForTimeout(1500);

    const mvpBoot = await mvpPage.evaluate(() => ({
      hasCanvas: !!document.getElementById('c'),
      homeVisible: document.getElementById('homeScreen').style.display !== 'none'
    }));
    check('tank_mvp.html 正常进入 Home 初始态', mvpBoot.hasCanvas && mvpBoot.homeVisible, JSON.stringify(mvpBoot));
    check('tank_mvp.html 无 console error', realErrorsOf(mvpErrors).length === 0, `errors=${JSON.stringify(realErrorsOf(mvpErrors))}`);

    await mvpPage.close();
    await page.close();

    console.log('=== RESULT ===');
    if (FAILS.length === 0) {
      console.log('ALL PASS');
      process.exit(0);
    } else {
      console.error(`FAILED (${FAILS.length}):`, FAILS.join(', '));
      process.exit(1);
    }
  } catch (err) {
    console.error('EXCEPTION:', err);
    process.exit(2);
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (child) {
      try { process.kill(child.pid); } catch (_) {}
    }
  }
})();
