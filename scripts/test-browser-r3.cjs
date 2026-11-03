// 浏览器自动化测试（R-1/R-2/R-3 专项冒烟）：在真实 Edge (channel=msedge, headless) 中
// 验证 tank_bench.html 的技能/召唤物/特种弹药交互与 tank_battle.html 稳定性。
// 用法: node scripts/test-browser-r3.cjs
'use strict';
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright-core');
const { launchBrowser } = require('./lib/browser-launch.cjs');

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

    browser = await launchBrowser(chromium);
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.bringToFront();   // 2026-11-02：整链顺序跑时防后台标签节流/失焦
    const benchErrors = [];
    page.on('console', m => { if (m.type() === 'error') benchErrors.push(m.text()); });
    page.on('pageerror', e => benchErrors.push('PAGEERROR: ' + e.message));

    // ---- 1. 装甲测试台（tank_bench.html）加载与交互验证 ----
    await page.goto(`${base}/tank_bench.html`, { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(1000);

    check('tank_bench.html 正常加载无 console error', realErrorsOf(benchErrors).length === 0, `errors=${JSON.stringify(realErrorsOf(benchErrors))}`);

    // 2026-10-21 修复（陈旧断言）：原断言「R-1/R-2/R-3 面板控制按钮」中的 5 个按钮
    //   （skillFireCtrlBtn / skillSpeedBtn / spawnTurretBtn / spawnMineBtn / spawnCoverBtn）
    //   **已于 2026-10-19 #7 用户裁定删除**（tank_bench.html:232 注释：该区块的三个部署按钮
    //   已被共享 devPanel 完全覆盖，属重复入口）；其中 super_fire_control / super_speed 两键
    //   又于 2026-10-20 #W9 整体摘除。测试未同步 ⇒ 本条恒 FAIL 且后续 evaluate 抛 null.click。
    //   现行口径：部署能力仍在（benchSpawnTurret/Mine/Cover 挂在 window，见 tank_bench.html:864-866），
    //   只是不再有独立按钮 —— 改为直接调这些 window 入口验证同一行为。
    const panelApi = await page.evaluate(() => ({
      spawnTurret: typeof window.benchSpawnTurret === 'function',
      spawnMine: typeof window.benchSpawnMine === 'function',
      spawnCover: typeof window.benchSpawnCover === 'function',
      // 反向断言：被 #7/#W9 删除的按钮**不得**回潮（重复入口）
      noLegacyBtns: !document.getElementById('skillFireCtrlBtn')
        && !document.getElementById('skillSpeedBtn')
        && !document.getElementById('spawnTurretBtn')
        && !document.getElementById('spawnMineBtn')
        && !document.getElementById('spawnCoverBtn'),
    }));
    check('测试台部署能力以 window API 暴露（#7 删除重复按钮后的现行口径）',
      panelApi.spawnTurret && panelApi.spawnMine && panelApi.spawnCover && panelApi.noLegacyBtns,
      JSON.stringify(panelApi));

    // 战术部署（固定炮塔 / 地雷 / 掩体）——走 window API
    const deployRes = await page.evaluate(() => {
      const before = (window.deployables && window.deployables.length) || 0;
      window.benchSpawnTurret();
      window.benchSpawnMine();
      window.benchSpawnCover();
      const after = (window.deployables && window.deployables.length) || 0;
      return { before, after };
    });
    check('战术部署物生成（炮塔/地雷/掩体注册进 deployables）', deployRes.after === deployRes.before + 3, `count: ${deployRes.before} -> ${deployRes.after}`);
    // #F6（2026-09-20 用户反馈）：掩体超限拒绝，保留已部署掩体
    const coverLimitRes = await page.evaluate(() => {
      const before = (window.deployables && window.deployables.length) || 0;
      window.benchSpawnCover(); // 第 2 个掩体（应成功）
      const count1 = (typeof deployableCount === 'function') ? deployableCount('cover') : 0;
      window.benchSpawnCover(); // 第 3 个掩体（应拒绝）
      const count2 = (typeof deployableCount === 'function') ? deployableCount('cover') : 0;
      const after = (window.deployables && window.deployables.length) || 0;
      return { before, after, count1, count2 };
    });
    check('#F6 掩体超限拒绝（保留已部署掩体）',
      coverLimitRes.count1 === 2 && coverLimitRes.count2 === 2 && coverLimitRes.after === coverLimitRes.before + 1,
      JSON.stringify(coverLimitRes));

    // 弹种切换（2026-11-01 改写：「和 battle 相同」）
    // 旧断言依赖 bench 底部的 14 弹种平铺条 `#ammoIndicator`（含 data-ammo 格）；
    // 该条已按用户裁定删除，改为 battle 同款 **3 槽弹种栏**（#slot1~3 + .label/.num）。
    // 因此断言语义同步改为：点击槽位切弹 + Q/E 在 loadout 内环形循环。
    // 槽内容由面板「弹种槽 Ammo Slots」配置（benchSetLoadout），这里先把槽设成
    // APFSDS / HE-OP / AP 三种，再验证两条 R-3 弹种路径可达。
    await page.evaluate(() => {
      benchSetLoadout(['apfsds', 'blast_he', 'ap']);
    });
    await page.waitForTimeout(120);

    await page.evaluate(() => {
      const btn = document.getElementById('slot1');
      if (btn) btn.click();
    });
    await page.waitForTimeout(150);
    const ammo5 = await page.evaluate(() => {
      const el = document.getElementById('slot1');
      const num = document.querySelector('#slot1 .num');
      return { text: el ? el.textContent : '', active: num ? num.textContent : '', key: player.ammoKey };
    });
    check('点击弹种槽 1 切换至 APFSDS（鼠标选择路径）',
      ammo5.text.includes('APFSDS') && ammo5.key === 'apfsds', JSON.stringify(ammo5));

    await page.evaluate(() => {
      const btn = document.getElementById('slot2');
      if (btn) btn.click();
    });
    await page.waitForTimeout(150);
    const ammo6 = await page.evaluate(() => {
      const el = document.getElementById('slot2');
      return { text: el ? el.textContent : '', key: player.ammoKey };
    });
    check('点击弹种槽 2 切换至 HE-OP（2026-09-14 hec 移除后由 blast_he 接替）',
      ammo6.text.includes('HE-OP') || ammo6.text.includes('超压榴弹'), ammo6.text);

    // Q 键环形循环（与正式游戏同语义：只在 loadout 内循环）
    const qRes = await page.evaluate(() => {
      const cells = Array.from(document.querySelectorAll('#abilityBtns .ammo-slot'));
      const active = cells.find(c => c.classList.contains('active'));
      return { active: active ? active.querySelector('.label').textContent : null, total: cells.filter(c => c.style.display !== 'none').length };
    });
    await page.keyboard.press('q');
    await page.waitForTimeout(150);
    const qRes2 = await page.evaluate(() => {
      const cells = Array.from(document.querySelectorAll('#abilityBtns .ammo-slot'));
      const active = cells.find(c => c.classList.contains('active'));
      return { active: active ? active.querySelector('.label').textContent : null };
    });
    check('Q 键环形切换弹种（与正式游戏同语义）',
      qRes.active && qRes2.active && qRes.active !== qRes2.active,
      `${qRes.active} -> ${qRes2.active} (slots=${qRes.total})`);

    // 2026-11-01：底部弹种条已删除 —— **负向断言**锁死，防止有人把 14 弹种平铺条加回来。
    const ammoBarGone = await page.evaluate(() => ({
      hasBar: !!document.getElementById('ammoIndicator'),
      hasSlots: document.querySelectorAll('#abilityBtns .ammo-slot').length,
      hasBottomHud: !!document.getElementById('benchBottomHud'),
    }));
    check('负向：底部弹种条 #ammoIndicator 已删除（不再是 14 弹种平铺）',
      !ammoBarGone.hasBar, JSON.stringify(ammoBarGone));
    check('弹种槽 = 3 个且底部 HUD 存在（battle 同款结构）',
      ammoBarGone.hasSlots === 3 && ammoBarGone.hasBottomHud, JSON.stringify(ammoBarGone));

    // #C5a：G/V 键语义与正式游戏统一——G=战术炮击（logOverlay 出现炮击日志，callStrike 链路通）
    await page.keyboard.press('g');
    await page.waitForTimeout(250);
    const gLog = await page.evaluate(() => {
      const el = document.getElementById('logOverlay');
      return el ? el.textContent : '';
    });
    check('bench G 键 = 战术炮击（与正式游戏同语义，callStrike 链路）',
      gLog.includes('炮击支援已呼叫') || gLog.includes('炮击落弹命中'),
      gLog.slice(-120));

    // 测试开火（空格键）生成炮弹
    await page.keyboard.press('Space');
    await page.waitForTimeout(300);

    check('交互后测试台保持无 JS 抛错', realErrorsOf(benchErrors).length === 0, `errors=${JSON.stringify(realErrorsOf(benchErrors))}`);

    // ---- 2. 正式游戏页（tank_battle.html）基本加载验证 ----
    const battleErrors = [];
    const battlePage = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await battlePage.bringToFront();
    battlePage.on('console', m => { if (m.type() === 'error') battleErrors.push(m.text()); });
    battlePage.on('pageerror', e => battleErrors.push('PAGEERROR: ' + e.message));

    await battlePage.goto(`${base}/tank_battle.html`, { waitUntil: 'load', timeout: 30000 });
    await battlePage.waitForTimeout(1500);

    const battleBoot = await battlePage.evaluate(() => ({
      hasCanvas: !!document.getElementById('c'),
      homeVisible: document.getElementById('homeScreen').style.display !== 'none'
    }));
    check('tank_battle.html 正常进入 Home 初始态', battleBoot.hasCanvas && battleBoot.homeVisible, JSON.stringify(battleBoot));
    check('tank_battle.html 无 console error', realErrorsOf(battleErrors).length === 0, `errors=${JSON.stringify(realErrorsOf(battleErrors))}`);

    await battlePage.close();
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
