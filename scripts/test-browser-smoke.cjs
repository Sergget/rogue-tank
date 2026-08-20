// 浏览器冒烟测试（P-26 工具链）：在真实浏览器（系统 Edge，channel=msedge，无头）内
// 验证 tank_mvp.html 的 ISSUES #22/#23/#24 修复行为。由 `npm run test:browser` 触发。
// P-15 起扩展为双页冒烟：正式游戏页（tank_mvp.html）验证极简 HUD/面板切换/弹种/飘字
// 与「恒无 dummy」；装甲测试台页（tank_bench.html）验证靶场元素独立保留。
//
// 关键点：
// - 依赖 playwright-core（项目 devDependency，无浏览器下载；channel=msedge 复用系统 Edge）。
// - 服务自管理：先探测 127.0.0.1:8000 —— 若为本项目 server.js（/api/tanks 返回 JSON）则复用；
//   若被非本项目服务占用则用 PORT=8123 拉起；否则直接在 8000 拉起。退出时 kill 自拉起的子进程。
// - tank_mvp.html 主脚本是 IIFE（flow/cam/run/shells/canvas 闭包私有，evaluate 访问不到），
//   通过注入主世界脚本包装全局函数（generateRun/transition/viewBounds/resolveHit）截获闭包对象。
//
// 用法: node scripts/test-browser-smoke.cjs
// 退出码: 0=全过 / 1=断言失败 / 2=脚本异常
'use strict';
const http = require('http');
const os = require('os');
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

// ---- 服务探测：短超时 http.get，返回是否收到任意 HTTP 响应 ----
function probeOk(url, timeoutMs = 1200) {
  return new Promise(resolve => {
    const req = http.get(url, res => { res.resume(); resolve(true); });
    req.setTimeout(timeoutMs, () => { req.destroy(); resolve(false); });
    req.on('error', () => resolve(false));
  });
}

// ---- 判断端口是否为本项目服务：/api/tanks 应返回可解析 JSON ----
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

// ---- 拉起 server.js 并轮询就绪（最多 ~10s），失败时打印服务日志 ----
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

(async () => {
  let child = null;
  let browser = null;
  try {
    // ---- 服务自管理 ----
    let base = null;
    if (await probeOk(BASE_PROBE) && await probeOurApi(API_PROBE)) {
      base = `http://127.0.0.1:${DEFAULT_PORT}`;
      console.log(`[server] reuse existing: ${base}`);
    } else if (await probeOk(BASE_PROBE)) {
      base = `http://127.0.0.1:${ALT_PORT}`;
      console.log(`[server] :${DEFAULT_PORT} occupied by foreign service, spawning on :${ALT_PORT}`);
      child = await startServer(ALT_PORT);
      console.log(`[server] spawned: ${base}`);
    } else {
      base = `http://127.0.0.1:${DEFAULT_PORT}`;
      console.log(`[server] spawning on :${DEFAULT_PORT}`);
      child = await startServer(DEFAULT_PORT);
      console.log(`[server] spawned: ${base}`);
    }

    // ---- 浏览器启动：系统 Edge，无头 ----
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors = [];
    const notFound = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
    page.on('response', r => { if (r.status() === 404) notFound.push(r.url()); });

    await page.goto(`${base}/tank_mvp.html`, { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(1500);

    // ---- 主世界注入：包装全局函数，截获 IIFE 闭包内对象 ----
    await page.addScriptTag({ content: `
      (() => {
        const origGen = window.generateRun, origTrans = window.transition,
              origVB = window.viewBounds, origHit = window.resolveHit;
        window.__hits = [];
        window.generateRun = function(...a){ const r = origGen.apply(this, a); window.__lastRun = r; return r; };
        window.transition = function(f, ...a){ window.__flow = f; return origTrans.apply(this, [f, ...a]); };
        window.viewBounds = function(c, ...a){ window.__cam = c; return origVB.apply(this, [c, ...a]); };
        window.resolveHit = function(s, t, h, ab){
          const r = origHit.apply(this, [s, t, h, ab]);
          if (t && t.id === 'player') window.__hits.push({ at: performance.now(), hp: t.hp });
          return r;
        };
        window.__dbg = {
          get flow(){ return window.__flow; }, get cam(){ return window.__cam; },
          get run(){ return window.__lastRun; }, get canvas(){ return document.getElementById('c'); },
          transition: origTrans, hits: window.__hits
        };
      })();
    `});

    // ---- 开局：startRunBtn 在隐藏 overlay 内，只能 evaluate 点击 ----
    await page.evaluate(() => document.getElementById('startRunBtn').click());
    await page.waitForFunction(() => window.__dbg && window.__dbg.flow && window.__dbg.flow.state === 'battle', { timeout: 10000 });

    const info = await page.evaluate(() => {
      const es = entities || [];
      const enemy = es.filter(e => e.nodeSpawn && e.team === 'enemy' && e.hp > 0);
      const n0 = window.__dbg.run && window.__dbg.run.nodes[0];
      const cvs = window.__dbg.canvas;
      return {
        state: window.__dbg.flow.state,
        entityIds: es.map(e => e.id),
        hasDummy: es.some(e => e.id === 'dummy'),
        enemyCount: enemy.length,
        canvas: { w: cvs.width, h: cvs.height },
        camBounds: window.__dbg.cam ? { w: Math.round(window.__dbg.cam.bounds.w), h: Math.round(window.__dbg.cam.bounds.h) } : null,
        node0: n0 ? { tpl: n0.template.name, w: n0.w, h: n0.h, enemies: n0.enemies.length } : null,
        runNodes: window.__dbg.run ? window.__dbg.run.nodes.length : 0,
        seed: window.__dbg.run ? window.__dbg.run.seed : null
      };
    });

    console.log('=== 战斗态信息 ===');
    console.log(JSON.stringify(info, null, 1));

    check('#22 战斗态无 dummy', !info.hasDummy, 'entities=' + JSON.stringify(info.entityIds));
    check('#24 节点 ≥3×画布宽', info.camBounds && info.camBounds.w >= info.canvas.w * 3,
      `bounds.w=${info.camBounds && info.camBounds.w} canvas.w=${info.canvas.w}`);
    check('#24 节点 ≥3×画布高', info.camBounds && info.camBounds.h >= info.canvas.h * 3,
      `bounds.h=${info.camBounds && info.camBounds.h} canvas.h=${info.canvas.h}`);
    check('有敌军实体', info.enemyCount > 0, `enemyCount=${info.enemyCount}`);
    check('节点链 ≥3 节点', info.runNodes >= 3, `nodes=${info.runNodes} seed=${info.seed}`);

    // ---- #23 敌人开火循环：把敌人瞬移到玩家旁（距离足够近以确定为交火），
    //      多次采样装填计时（reloadT>0 出现即装填循环生效）+ 玩家被命中数增长 ----
    // Flaky 根因（2026-08-19）：随机地图种子下节点 0 可能含友军据点（outpost_0），
    // 友军 AI（消极防御，射程 460）会把低难度唯一敌人击杀 → 采样窗口内无活敌 →
    // reloads=[] → 3 项 #23 断言全挂。修复（teleport 内）：① 活敌缺失时 fallback
    // 到任意 enemy 实体（尸体不移除，hp<=0 仍留在 entities）；② 位移后 hp 拉满防
    // 采样窗口内被击杀；③ 友军据点实体 hp 置 0 排除干扰（本测试不关心结算分数）。
    const sample = () => page.evaluate(() => {
      const es = entities.filter(e => e.team === 'enemy' && e.hp > 0);
      return {
        reloads: es.map(e => Math.round(e.reloadT * 100) / 100),
        hits: window.__hits.length
      };
    });
    const teleport = (dx, dy) => page.evaluate(([dx, dy]) => {
      const p = entities.find(e => e.id === 'player');
      // ① 活敌优先；无活敌时 fallback 到尸体（队伍实体不移除，hp<=0 仍留在 entities）
      let en = entities.find(e => e.team === 'enemy' && e.hp > 0);
      if (!en) en = entities.find(e => e.team === 'enemy');
      // ③ 友军据点（消极防御，射程 460）可能击杀低难度唯一敌人：先清场再采样
      for (const a of entities) {
        if (a.team === 'ally' && a.nodeSpawn) a.hp = 0;
      }
      if (p && en) {
        en.x = p.x + dx; en.y = p.y + dy;
        en.hp = en.stats.maxHp; // ② hp 拉满，防止采样窗口内被击杀导致 reloads 为空
      }
    }, [dx, dy]);

    const tries = [[300, 0], [-300, 200], [0, -300], [350, 350]];
    let observed = { s0: null, s1: null, s2: null };
    for (const [dx, dy] of tries) {
      await teleport(dx, dy);
      const before = await sample();
      await page.waitForTimeout(3500);
      const mid = await sample();
      await page.waitForTimeout(3500);
      const end = await sample();
      observed = { s0: before, s1: mid, s2: end };
      console.log(`位移(${dx},${dy}): s0=${JSON.stringify(before)} s1=${JSON.stringify(mid)} s2=${JSON.stringify(end)}`);
      if (end.hits > 0 && (end.hits >= 2 || end.reloads.some(v => v > 0))) break;
    }

    console.log('=== 装填/命中采样（reloadT>0 出现 + 玩家被命中 => #23 修复有效）===');
    const reloadObserved = (observed.s0 && observed.s0.reloads.some(v => v > 0)) ||
                           (observed.s1 && observed.s1.reloads.some(v => v > 0)) ||
                           (observed.s2 && observed.s2.reloads.some(v => v > 0));
    check('#23 敌人开火并进入装填(reloadT>0)', reloadObserved,
      `s0=${JSON.stringify(observed.s0 && observed.s0.reloads)} s1=${JSON.stringify(observed.s1 && observed.s1.reloads)} s2=${JSON.stringify(observed.s2 && observed.s2.reloads)}`);
    check('#23 玩家被命中数增长', observed.s2 && observed.s2.hits > 0,
      `hits ${observed.s0 && observed.s0.hits} -> ${observed.s2 && observed.s2.hits}`);
    check('#23 连续开火判定(≥2 发)', observed.s2.hits >= 2 || (observed.s2.hits >= 1 && reloadObserved),
      `hits=${observed.s2 && observed.s2.hits}`);

    await page.screenshot({ path: path.join(os.tmpdir(), 'mvp_battle_smoke.png') });

    // ---- P-15 正式游戏页：极简 HUD / 面板切换 / 弹种切换 / 飘字 ----
    const hud = await page.evaluate(() => ({
      reloadWrap: !!document.getElementById('reloadWrap'),
      ammoIndicator: !!document.getElementById('ammoIndicator'),
      hintBar: !!document.getElementById('hintBar'),
      solutionPanel: !!document.getElementById('solutionPanel'),
      playerTankSelect: !!document.getElementById('playerTankSelect'),
      statusDisplay: (document.getElementById('statusPanel') || { style: {} }).style.display,
      devDisplay: (document.getElementById('devPanel') || { style: {} }).style.display
    }));
    console.log('=== P-15 极简 HUD ===', JSON.stringify(hud));
    check('游戏页保留极简 HUD（装填条/弹种/提示条）', hud.reloadWrap && hud.ammoIndicator && hud.hintBar, JSON.stringify(hud));
    check('游戏页移除靶场元素（solutionPanel/坦克选择）', !hud.solutionPanel && !hud.playerTankSelect, JSON.stringify(hud));
    check('状态/开发者面板初始隐藏', hud.statusDisplay === 'none' && hud.devDisplay === 'none', JSON.stringify(hud));

    await page.keyboard.press('Tab');
    await page.waitForTimeout(150);
    const stOpen = await page.evaluate(() => document.getElementById('statusPanel').style.display !== 'none');
    check('Tab 打开玩家状态面板', stOpen);
    await page.keyboard.press('Tab');
    await page.waitForTimeout(100);

    await page.keyboard.press('Backquote');
    await page.waitForTimeout(150);
    const devOpen = await page.evaluate(() => document.getElementById('devPanel').style.display !== 'none');
    check('` 打开开发者面板', devOpen);
    await page.keyboard.press('Backquote');
    await page.waitForTimeout(100);

    await page.keyboard.press('2');
    await page.waitForTimeout(150);
    const ammoLabel = await page.evaluate(() => document.getElementById('ammoIndicator').querySelector('.label').textContent);
    check('数字键 2 切换 APCR', ammoLabel === 'APCR', `label=${ammoLabel}`);
    await page.keyboard.press('3');
    await page.waitForTimeout(100);
    const ammoLabelHe = await page.evaluate(() => document.getElementById('ammoIndicator').querySelector('.label').textContent);
    check('数字键 3 切换 HE', ammoLabelHe === 'HE', `label=${ammoLabelHe}`);
    await page.keyboard.press('4');
    await page.waitForTimeout(100);
    const ammoLabelHeat = await page.evaluate(() => document.getElementById('ammoIndicator').querySelector('.label').textContent);
    check('数字键 4 切换 HEAT（P-16 实装）', ammoLabelHeat === 'HEAT', `label=${ammoLabelHeat}`);
    await page.keyboard.press('1');
    await page.waitForTimeout(100);

    const dmgCount = await page.evaluate(() => { spawnDmgText(100, 100, '99', 'pen'); return dmgTexts.length; });
    check('飘字生成 (spawnDmgText)', dmgCount >= 1, `dmgTexts.length=${dmgCount}`);

    // ---- 离开战斗态 → 正式游戏页 map 态恒无 dummy（#22）----
    await page.evaluate(() => window.__dbg.transition(window.__dbg.flow, 'map'));
    await page.waitForTimeout(600);
    const afterMap = await page.evaluate(() => ({
      state: window.__dbg.flow.state,
      hasDummy: (entities || []).some(e => e.id === 'dummy'),
      dummyIdx: (entities || []).findIndex(e => e.id === 'dummy')
    }));
    console.log('=== 回到地图态 ===', JSON.stringify(afterMap));
    check('#22 正式游戏页 battle/map 恒无 dummy', !afterMap.hasDummy && afterMap.dummyIdx === -1, `dummyIdx=${afterMap.dummyIdx}`);

    // ---- 控制台/页面错误（404 资源噪音过滤但单独列出）----
    const realErrors = errors.filter(e => !e.includes('Failed to load resource'));
    check('无 console/page 错误', realErrors.length === 0, JSON.stringify(realErrors.slice(0, 5)));
    console.log('404 资源请求（仅供噪音参考）:', JSON.stringify(notFound));

    // ---- P-15 装甲测试台（tank_bench.html）：独立页保留靶场元素 ----
    errors.length = 0; notFound.length = 0;
    await page.goto(`${base}/tank_bench.html`, { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(1000);
    const bench = await page.evaluate(() => {
      const es = entities || [];
      return {
        hasPlayer: es.some(e => e.id === 'player'),
        hasDummy: es.some(e => e.id === 'dummy'),
        hasStartRunBtn: !!document.getElementById('startRunBtn'),
        hasSolutionPanel: !!document.getElementById('solutionPanel'),
        hasPlayerTankSelect: !!document.getElementById('playerTankSelect'),
        hasStatusPanel: !!document.getElementById('statusPanel'),
        hasDevPanel: !!document.getElementById('devPanel'),
        hasHintBar: !!document.getElementById('hintBar')
      };
    });
    console.log('=== 装甲测试台 ===', JSON.stringify(bench));
    check('测试台有玩家+靶车实体', bench.hasPlayer && bench.hasDummy, JSON.stringify(bench));
    check('测试台无 startRunBtn（非正式游戏页）', !bench.hasStartRunBtn, JSON.stringify(bench));
    check('测试台保留 solutionPanel/坦克选择', bench.hasSolutionPanel && bench.hasPlayerTankSelect, JSON.stringify(bench));
    check('测试台无状态/开发者面板与提示条', !bench.hasStatusPanel && !bench.hasDevPanel && !bench.hasHintBar, JSON.stringify(bench));
    const benchErrors = errors.filter(e => !e.includes('Failed to load resource'));
    check('测试台无 console/page 错误', benchErrors.length === 0, JSON.stringify(benchErrors.slice(0, 5)));
    console.log('测试台 404 资源请求（仅供噪音参考）:', JSON.stringify(notFound));

    console.log('=== RESULT ===');
    console.log(FAILS.length === 0 ? 'ALL PASS' : `FAILED: ${FAILS.join(', ')}`);
  } finally {
    if (browser) { try { await browser.close(); } catch { /* ignore */ } }
    if (child && child.exitCode === null) child.kill();
  }
  process.exitCode = FAILS.length === 0 ? 0 : 1;
})().catch(e => { console.error('SCRIPT-FAIL:', e); process.exit(2); });