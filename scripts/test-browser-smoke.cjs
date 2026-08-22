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
        window.__shellHits = [];   // 特性4 §2.2：玩家炮弹命中采样（shell.ammoKey 契约）
        window.generateRun = function(...a){ const r = origGen.apply(this, a); window.__lastRun = r; return r; };
        window.transition = function(f, ...a){ window.__flow = f; return origTrans.apply(this, [f, ...a]); };
        window.viewBounds = function(c, ...a){ window.__cam = c; return origVB.apply(this, [c, ...a]); };
        window.resolveHit = function(s, t, h, ab){
          const r = origHit.apply(this, [s, t, h, ab]);
          if (s && s.shooter && s.shooter.id === 'player')
            window.__shellHits.push({ key: s.ammoKey || null });
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

    // ---- M10 局外主链路：Home 新建存档 → Loadout 选坦克+弹药 → 出击进节点图 → 点节点进 battle ----
    // 初始态断言走纯 DOM（flow 对象要等第一次 transition 才被包装器截获，首页启动无转移）
    const boot = await page.evaluate(() => ({
      homeVisible: document.getElementById('homeScreen').style.display !== 'none',
      otherHidden: ['loadoutScreen','shopScreen','mapScreen'].every(id => document.getElementById(id).style.display === 'none'),
      overlayVisible: document.getElementById('flowOverlay').style.display !== 'none'
    }));
    console.log('=== M10 启动态 ===', JSON.stringify(boot));
    check('M10 初始为 Home 态（首页覆盖层可见）', boot.homeVisible && boot.otherHidden && boot.overlayVisible, JSON.stringify(boot));

    await page.evaluate(() => document.getElementById('homeCreateBtn').click());
    await page.waitForTimeout(200);
    const slotCount = await page.evaluate(() => document.querySelectorAll('#homeSlotList .slot-row').length);
    check('M10 新建存档出现槽位卡', slotCount >= 1, `slots=${slotCount}`);

    await page.evaluate(() => document.querySelector('#homeSlotList .slot-row .enter-btn').click());
    await page.waitForFunction(() => window.__dbg && window.__dbg.flow && window.__dbg.flow.state === 'loadout', { timeout: 5000 });
    // 等坦克列表异步就绪（fetch /api/tanks → renderLoadout 刷卡片）
    await page.waitForFunction(() => document.querySelectorAll('#loadTankList .tank-card').length > 0, { timeout: 10000 });
    const loadoutInfo = await page.evaluate(() => ({
      tankCards: document.querySelectorAll('#loadTankList .tank-card').length,
      ammoBoxes: document.querySelectorAll('#loadAmmoList input[type=checkbox]').length
    }));
    check('M10 Loadout 列出坦克卡片与弹药复选框', loadoutInfo.tankCards > 0 && loadoutInfo.ammoBoxes >= 4, JSON.stringify(loadoutInfo));

    // 选定第一辆坦克 + 勾选前三种弹药；第 4 种应被上限拒绝（勾选态回退）
    const sel = await page.evaluate(() => {
      document.querySelector('#loadTankList .tank-card').click();
      const boxes = [...document.querySelectorAll('#loadAmmoList input[type=checkbox]')];
      boxes[0].click(); boxes[1].click(); boxes[2].click();
      const before = boxes.filter(b => b.checked).length;
      if (boxes[3]) { boxes[3].click(); }
      const after = boxes.filter(b => b.checked).length;
      return {
        before, after,
        selectedCard: !!document.querySelector('#loadTankList .tank-card.selected'),
        startDisabled: document.getElementById('loadStartBtn').disabled
      };
    });
    console.log('=== M10 整备选择 ===', JSON.stringify(sel));
    check('M10 坦克卡片点击选定', sel.selectedCard);
    check('M10 弹药 ≤3 上限生效', sel.before === 3 && sel.after === 3, JSON.stringify(sel));
    check('M10 校验通过后出击按钮可用', !sel.startDisabled);

    // Shop 界面冒烟：整备 ⇄ 商店往返（新档 0 点：升级卡应全置灰、复活按钮应禁用）
    await page.evaluate(() => document.getElementById('loadShopBtn').click());
    await page.waitForFunction(() => window.__dbg && window.__dbg.flow && window.__dbg.flow.state === 'shop', { timeout: 5000 });
    const shopInfo = await page.evaluate(() => ({
      visible: document.getElementById('shopScreen').style.display !== 'none',
      points: document.getElementById('shopPoints').textContent,
      cards: document.querySelectorAll('#shopUpgradeList .shop-card').length,
      offCards: document.querySelectorAll('#shopUpgradeList .shop-card.off').length,
      reviveBtnDisabled: !!document.querySelector('#shopReviveRow button[disabled]'),
      defCount: UPGRADE_DEFS.length
    }));
    console.log('=== M10 商店 ===', JSON.stringify(shopInfo));
    check('M10 Shop 渲染升级卡且 0 点全置灰（含复活项禁用）',
      shopInfo.visible && shopInfo.cards === shopInfo.defCount && shopInfo.defCount > 0 &&
      shopInfo.offCards === shopInfo.cards && shopInfo.reviveBtnDisabled, JSON.stringify(shopInfo));
    await page.evaluate(() => document.getElementById('shopLoadoutBtn').click());
    await page.waitForFunction(() => window.__dbg && window.__dbg.flow && window.__dbg.flow.state === 'loadout', { timeout: 5000 });

    await page.evaluate(() => document.getElementById('loadStartBtn').click());
    await page.waitForFunction(() => window.__dbg && window.__dbg.flow && window.__dbg.flow.state === 'map', { timeout: 10000 });
    check('M10 出击 → 节点图渲染节点链', await page.evaluate(() =>
      window.__dbg.flow.state === 'map' && document.querySelectorAll('#mapList .node-row').length >= 3));

    await page.evaluate(() => document.querySelector('#mapList .node-row').click());
    await page.waitForFunction(() => window.__dbg && window.__dbg.flow && window.__dbg.flow.state === 'battle', { timeout: 10000 });

    // M10 出击写档断言：active 槽持久化 selectedTankId/ammoLoadout/runs，且作用于 player 实体
    const savedProf = await page.evaluate(() => {
      const meta = JSON.parse(localStorage.getItem('rogue-tank-saves-meta'));
      const prof = JSON.parse(localStorage.getItem('rogue-tank-save:' + meta.activeSaveId));
      const p = entities.find(e => e.id === 'player');
      return {
        selectedTankId: prof.selectedTankId, ammoLen: prof.ammoLoadout.length, runs: prof.stats.runs,
        playerAmmoLoadout: p.ammoLoadout ? p.ammoLoadout.length : -1, playerRevives: p.revives,
        reviveBase: RULES.revive.baseRevives
      };
    });
    console.log('=== M10 出击写档 ===', JSON.stringify(savedProf));
    check('M10 selectedTankId 持久化并作用于 player 实体',
      typeof savedProf.selectedTankId === 'string' && savedProf.playerAmmoLoadout === 3, JSON.stringify(savedProf));
    check('M10 局数统计随出击递增', savedProf.runs >= 1, `runs=${savedProf.runs}`);
    check('M10 复活次数 = 基础值（无加购时）', savedProf.playerRevives === savedProf.reviveBase,
      `revives=${savedProf.playerRevives} base=${savedProf.reviveBase}`);

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

    // ---- 特性4 §2.2 出战配备索引切换：数字键 1/2/3 → ammoLoadout[i]，Q 环形循环 ----
    // 旧断言（按 2/3/4 断言固定 APCR/HE/HEAT 直选）已随全局直选一起退役：
    // 战斗内弹种由 loadout 决定，断言全部按 player.ammoLoadout 内容动态推导。
    const readAmmoHud = () => page.evaluate(() => {
      const p = entities.find(e => e.id === 'player');
      const cells = [...document.querySelectorAll('#ammoIndicator .ammo-cell')];
      return {
        count: cells.length,
        labels: cells.map(c => c.querySelector('.label').textContent),
        expectLabels: p.ammoLoadout.map(k => RULES.ammoTypes[k].label),
        activeIdx: cells.findIndex(c => c.classList.contains('active')),
        loadout: p.ammoLoadout.slice(),
        idx: p.currentAmmoIndex,
        ammoKey: p.ammoKey
      };
    });

    await page.keyboard.press('1');
    await page.waitForTimeout(150);
    let a = await readAmmoHud();
    console.log('=== 弹药槽位组（按 1）===', JSON.stringify(a));
    check('(c) 弹药组 HUD 格数 === ammoLoadout.length(≤3)',
      a.count === a.loadout.length && a.loadout.length >= 1 && a.loadout.length <= 3,
      `cells=${a.count} loadout=${JSON.stringify(a.loadout)}`);
    check('(c) 各格标签/顺序按配备渲染', JSON.stringify(a.labels) === JSON.stringify(a.expectLabels),
      `labels=${JSON.stringify(a.labels)} expect=${JSON.stringify(a.expectLabels)}`);
    check('(a) 按 1 → 高亮/索引/ammoKey 对齐 loadout[0]',
      a.activeIdx === 0 && a.idx === 0 && a.ammoKey === a.loadout[0],
      `active=${a.activeIdx} idx=${a.idx} key=${a.ammoKey} loadout[0]=${a.loadout[0]}`);

    await page.keyboard.press('2');
    await page.waitForTimeout(120);
    a = await readAmmoHud();
    check('(a) 按 2 → 对齐 loadout[1]', a.activeIdx === 1 && a.idx === 1 && a.ammoKey === a.loadout[1],
      `active=${a.activeIdx} idx=${a.idx} key=${a.ammoKey} loadout[1]=${a.loadout[1]}`);

    await page.keyboard.press('3');
    await page.waitForTimeout(120);
    a = await readAmmoHud();
    const lastIdx = a.loadout.length - 1;
    check('(a) 按 3 → 对齐 loadout[末位]', a.activeIdx === lastIdx && a.idx === lastIdx && a.ammoKey === a.loadout[lastIdx],
      `active=${a.activeIdx} idx=${a.idx} key=${a.ammoKey} last=${lastIdx}`);

    await page.keyboard.press('4');   // 第 4 槽未配备（上限 3）：按键无效果
    await page.waitForTimeout(120);
    a = await readAmmoHud();
    check('(b) 按 4（未配备槽）无效果',
      a.activeIdx === lastIdx && a.idx === lastIdx && a.ammoKey === a.loadout[lastIdx],
      `active=${a.activeIdx} idx=${a.idx} key=${a.ammoKey}`);

    await page.keyboard.press('q');   // Q 环形循环：末位 → 回绕槽 0
    await page.waitForTimeout(120);
    a = await readAmmoHud();
    check('Q 环形循环回绕到槽 0', a.activeIdx === 0 && a.idx === 0 && a.ammoKey === a.loadout[0],
      `active=${a.activeIdx} idx=${a.idx} key=${a.ammoKey}`);

    // ---- (d) 开火后炮弹携带所选槽位 ammoKey ----
    // shells 数组在主脚本 IIFE 内不可直接采样，改经 resolveHit 包装器记录玩家命中弹的
    // shell.ammoKey（P-16 契约字段）。敌人放到玩家右侧固定距离 + 鼠标移到其屏幕位置，
    // 炮塔每帧追踪 mouseWorld 自然对准；Space 按住跨多个 rAF 帧（keys[' '] 为轮询采样）。
    await page.keyboard.press('3');   // 切到末位弹种再开火
    await page.waitForTimeout(120);
    a = await readAmmoHud();
    const firedExpect = a.ammoKey;
    const mark = await page.evaluate(() => window.__shellHits.length);
    let firedKey = null;
    for(let i = 0; i < 6 && firedKey === null; i++){
      const placed = await page.evaluate(() => {
        const p = entities.find(e => e.id === 'player');
        const en = entities.find(e => e.team === 'enemy' && e.hp > 0) || entities.find(e => e.team === 'enemy');
        if(!(p && en)) return null;
        en.x = p.x + 220; en.y = p.y;
        en.hp = en.stats.maxHp; en.reloadT = 0; en.immobT = 0;
        p.reloadT = 0; p.immobT = 0;   // 清装填，保证本帧可开火
        return { x: en.x, y: en.y };
      });
      if(!placed) break;
      const scr = await page.evaluate(([wx, wy]) => {
        const s = worldToScreen(window.__dbg.cam, wx, wy); return [s.x, s.y];
      }, [placed.x, placed.y]);
      await page.mouse.move(scr[0], scr[1]);
      await page.waitForTimeout(i === 0 ? 800 : 300);   // 首次给炮塔足够转向时间
      await page.keyboard.down(' ');
      await page.waitForTimeout(140);
      await page.keyboard.up(' ');
      await page.waitForTimeout(500);                   // 等炮弹飞完 ~220px 触发 resolveHit
      firedKey = await page.evaluate(m => {
        const rec = window.__shellHits.slice(m)[0];
        return rec ? rec.key : null;
      }, mark);
    }
    check('(d) 开火命中弹携带所选槽位 ammoKey', firedKey !== null && firedKey === firedExpect,
      `fired=${firedKey} expect=${firedExpect}`);
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