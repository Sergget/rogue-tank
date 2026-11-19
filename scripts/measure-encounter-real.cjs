'use strict';

// scripts/measure-encounter-real.cjs — MS2/C2：正式局遭遇时长测量（数据工具，无断言）
//
// 测什么：encounter 节点（波次导演投送）在**带卡牌/商店通道的真局**里一场遭遇多久。
//   与 3D 切片版 `measure-encounter.cjs` 的区别：走 tank_battle.html 的完整 run 链路
//   （存档 → 整备 → 出击 → 节点），玩家有正式血量/卡牌/永久升级，敌人吃 entityMults
//   难度乘子——这是 MS2 门 ①「带卡牌/商店的真局 180~300s」的唯一测量口径。
//
// 驱动方式（与 test-browser-run 同款进入序列）：
//   localStorage 预置存档 → 选择进入 → START → battle；
//   探针玩家 = 自动瞄准最近敌人 + 100ms 击发尝试（两个独立 interval，measure-encounter 教训）。
//   每 0.5s 采样：导演 phase / 波次 / 场上敌人 / 玩家血量 / 击杀 / 最近敌距。
//   结局 = 导演 phase 变 victory/defeat，或玩家死亡（defeat）。
//
// 用法：
//   node scripts/measure-encounter-real.cjs              # 默认 CAP 300s，节点 0
//   CAP=180 NODE=1 node scripts/measure-encounter-real.cjs
//
// 输出：采样摘要 + 时长分解（telegraph/wave/breather 占比）+ 结局。无断言不挂链。

const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright-core');
const { launchBrowser } = require('./lib/browser-launch.cjs');

const ROOT = path.join(__dirname, '..');
const DEFAULT_PORT = 8000;
const ALT_PORT = 8141;
const CAP_S = Number(process.env.CAP) || 300;
const NODE_INDEX = Number(process.env.NODE) || 0;
// 2026-11-19（M3-J 校准）：`KIND` 把「单类型试玩入口」接到测量链上。
//   `KIND` 为空 ⇒ 裸 URL，与改前逐字节一致（默认关闭态零行为变更）。
//   填 `defend` / `capture` / `breakthrough` ⇒ 走 `?nodeKinds=all&forceKind=<kind>`
//   （`js/tank_rules.js:2273 applyNodeKindsUrlOverride`，只影响 RULES 开关，不改默认值）。
//   填 `auto` ⇒ 只加 `?nodeKinds=all`，按 share 自然抽样。
const KIND = String(process.env.KIND || '').trim();
const NODE_KINDS_QUERY = !KIND ? '' : (KIND === 'auto' ? '?nodeKinds=all' : `?nodeKinds=all&forceKind=${encodeURIComponent(KIND)}`);
// 2026-11-19（M3-J 校准）：`SEED` 固定本次 run 的地图种子。
//   不填 ⇒ 页面 `nextRunSeed()` 走默认随机（与改前逐字节一致）。
//   填了 ⇒ 在开始新 run 之前调 `__TEST__.setSeed(n)`（一次性消费，`tank_battle.html:10560`）。
//   校准必须有固定 seed：否则「3 次实测」测的是 3 张不同的地图，读数无法归因到参数。
const SEED = (process.env.SEED === undefined || process.env.SEED === '') ? null : Number(process.env.SEED);
// 2026-11-19（M3-J 校准第二轮）：探针的**类型感知推进策略**与存活手段。
//   首轮实测暴露的结构性缺陷：三种类型的胜利路径完全不同（defend = 守点不被毁 /
//   capture = 站进圈读条拔满 / breakthrough = 冲到 exitX），而旧探针一律「冲向最近敌人并开火」⇒
//   capture 的 captureDone 恒 0、breakthrough 的 reachedExit 恒 false，两型的核心胜利路径
//   **从未被驱动过一次**；读数只能证明「玩家在 3 敌集火下 19~43s 会死」，与类型参数无关。
//   `PLAN=auto`（默认）= 瞄准最近敌人（不还手必死，时长读数会退化成存活时间）+ 按类型选推进目标；
//   `PLAN=nearest`   = 回退旧行为（追最近敌人），仅供对照。
//   `HEAL=0` 关闭自动回血。默认开：校准要测「内容量/时长」，玩家中途死亡会让每个参数都读成
//   「存活时间」，与参数本身无关。开启时汇总里会明示「玩家不死（自动回血）」。
const PLAN = String(process.env.PLAN || 'auto').trim() === 'nearest' ? 'nearest' : 'auto';
const HEAL = String(process.env.HEAL === undefined ? '1' : process.env.HEAL).trim() !== '0';
// 2026-11-19（M3-J 校准）：`FIRE=0` 关掉玩家的左键连发，用于**归因**——
//   defend 实测「敌方开火 15~22 发，守点耐久却掉了 60」⇒ 差额必须找到来源。
//   最可疑的是玩家自己：探针守在守点旁 90px 开火，炮弹被守点（tier building）截停后
//   `js/tank_fire.js:1434` 会对任何 `Number.isFinite(hp)` 的掩体扣 1 点 ⇒ 玩家在打自己的目标。
//   关掉玩家火力再跑一次，若守点掉血回落到「敌方发数」量级，即证实。
//   仅影响测量，不改生产代码。
const FIRE = String(process.env.FIRE === undefined ? '1' : process.env.FIRE).trim() !== '0';
const wait = ms => new Promise(r => setTimeout(r, ms));

function probeOurApi(url, timeoutMs = 1200) {
  return new Promise(resolve => {
    const req = http.get(url, res => { res.resume(); resolve(true); });
    req.setTimeout(timeoutMs, () => { req.destroy(); resolve(false); });
    req.on('error', () => resolve(false));
  });
}

function startServer(port) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['server.js'], {
      cwd: ROOT, env: Object.assign({}, process.env, { PORT: String(port) }), stdio: 'ignore'
    });
    child.on('error', reject);
    setTimeout(() => resolve(child), 900);
  });
}

async function ensureServer() {
  if (await probeOurApi(`http://127.0.0.1:${DEFAULT_PORT}/api/tanks`)) {
    return { base: `http://127.0.0.1:${DEFAULT_PORT}`, child: null };
  }
  return { base: `http://127.0.0.1:${ALT_PORT}`, child: await startServer(ALT_PORT) };
}

(async () => {
  let browser = null;
  let server = null;
  try {
    server = await ensureServer();
    browser = await launchBrowser(chromium, {
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const pageErrors = [];
    page.on('pageerror', e => pageErrors.push('PAGEERROR: ' + e.message));

    // ---- 进入序列（test-browser-run 同款）----
    // 2026-10-30 修正：键名以 tank_economy 为准（savesMetaKey='rogue-tank-saves-meta'、
    //   槽位键 = saveSlotPrefix+id = 'rogue-tank-save:'+id）。此前写成 'rt_saves_v1' /
    //   'rt_save_<id>' ⇒ 预置存档**从未被读到**，脚本一直跑在默认档上。
    const savesMetaKey = 'rogue-tank-saves-meta';
    const slotKey = 'rogue-tank-save:e2e-real';
    const slotId = 'e2e-real';
    await page.goto(`${server.base}/tank_battle.html${NODE_KINDS_QUERY}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.evaluate(({ savesMetaKey, slotKey, slotId }) => {
      localStorage.setItem(savesMetaKey, JSON.stringify({
        activeSaveId: slotId,
        saves: [{ id: slotId, name: 'E2E-Real', updatedAt: 1 }]
      }));
      localStorage.setItem(slotKey, JSON.stringify({
        version: 1, points: 0, upgrades: {}, stats: { runs: 0, kills: 0 },
        selectedTankId: 'Leapard_1', ammoLoadout: ['ap', 'he', 'heat'],
        bonusRevives: 0, difficultyLevel: 0, settings: {}
      }));
    }, { savesMetaKey, slotKey, slotId });
    // 2026-11-19：`waitUntil: 'load'` 在本页（单体 660KB + 多图/多脚本）上偶发超时——
    //   实测同一 URL 手工 GET 恒 200，但 playwright 的 `load` 事件偶有 30s 不触发（导航已完成）。
    //   本脚本在 reload 之后还要等 1.2s 并显式等 loadStartBtn，因此 `domcontentloaded` 足够：
    //   localStorage 是同步写入的，页面内联脚本在解析阶段就已读到存档。
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
    await wait(1200);
    await page.evaluate(() => { const b = document.querySelector('.enter-btn'); if (b) b.click(); });
    // 2026-11-19（M3-J 校准）：固定种子。必须插在「开始出击」之前——
    //   `__TEST__.setSeed()` 是一次性的（下一次 newRun 消费后失效），写晚了不生效。
    if (SEED !== null) {
      const seedOk = await page.evaluate((s) => {
        if (!window.__TEST__ || !window.__TEST__.setSeed) return 'no-hook';
        try { return window.__TEST__.setSeed(s); } catch (e) { return 'error: ' + (e && e.message); }
      }, SEED);
      console.log(`种子注入：SEED=${SEED} → setSeed 返回 ${seedOk}`);
      if (seedOk !== SEED) throw new Error(`setSeed 未生效（返回 ${seedOk}）`);
    }
    // 条件等待（r4 #J4 教训：固定等待在慢帧机器上会赌输时序）
    const inLoadout = await page.waitForFunction(
      () => !!document.getElementById('loadStartBtn'), null, { timeout: 8000 }
    ).then(() => true).catch(() => false);
    if (!inLoadout) throw new Error('loadout 未就绪（loadStartBtn 未出现）');
    // deploymentReady 依赖 tankListData（fetch 异步）——未就绪时点击被拒绝（CRIT 日志）
    await page.waitForFunction(
      () => { const b = document.getElementById('loadStartBtn'); return b && !b.disabled; },
      null, { timeout: 10000 }).catch(() => {});
    await page.evaluate(() => { const b = document.getElementById('loadStartBtn'); if (b) b.click(); });
    const inBattle = await page.waitForFunction(
      () => window.__TEST__ && window.__TEST__.flowState() === 'battle', null, { timeout: 25000 }
    ).then(() => true).catch(() => false);
    if (!inBattle) {
      const diag = await page.evaluate(() => ({
        flow: window.__TEST__ ? window.__TEST__.flowState() : 'no-hook',
        loadoutVisible: !!document.getElementById('loadStartBtn'),
      })).catch(() => ({ diag: 'eval-failed' }));
      throw new Error('battle 未就绪（25s 超时）——诊断: ' + JSON.stringify(diag));
    }
    await wait(1500);   // 地面烘焙 + 首帧稳定
    const flowState = await page.evaluate(() => window.__TEST__ ? window.__TEST__.flowState() : null);
    if (flowState !== 'battle') throw new Error('未进入 battle 态：' + flowState);

    // ---- 类型自证（2026-11-19 M3-J 校准）----
    // 测量「某类型节点的时长」时，最怕的是 KIND 参数没生效、实际测的是歼灭节点，
    //   数据照样打印得很漂亮但指向另一件事。所以进入 battle 后立刻读只读探针，
    //   与 KIND 请求对不上就**直接失败退出**，绝不产出可疑读数。
    //
    // 2026-11-19：`NODE` 原来是「只用于打印」的假参数（脚本从不导航），`NODE=1` 会静默测节点 0。
    //   现在改成真导航：进 battle 后若实测节点索引与请求不符，用 `__TEST__.skipToNode(n)` 重进
    //   （仅 map 态可用 ⇒ 先退到 map）。导航失败直接抛错，不允许「打印 1 实测 0」。
    async function readKindProbe() {
      return await page.evaluate(() => {
        const T = window.__TEST__;
        if (!T) return { kind: null, missing: true };
        const g = T.guardTarget ? T.guardTarget() : null;
        const cz = T.captureZones ? T.captureZones() : null;
        return {
          kind: T.nodeKind ? T.nodeKind() : null,
          encKind: (() => { try { const n = T.encounter ? T.encounter() : null; return n ? n.kind : null; } catch (e) { return null; } })(),
          nodeIndex: T.currentNodeIndex ? T.currentNodeIndex() : null,
          guardTarget: g ? { x: Math.round(g.x), y: Math.round(g.y), hp: g.hp } : null,
          captureZones: Array.isArray(cz) ? cz.length : (cz && cz.length != null ? cz.length : null),
        };
      });
    }
    let kindProbe = await readKindProbe();
    // 2026-11-19：`NODE` 原来只用于打印，脚本从不导航 ⇒ `NODE=1` 会静默测节点 0（假读数）。
    //   页面没有「battle → map」的测试钩子（`skipToNode` 仅 map 态可用），为测量去改正式页面
    //   不属于校准范围。所以这里**显式拒绝** NODE>0，而不是假装支持。
    //   M3-J 校准只需要节点 0：`forceKind=defend/capture/breakthrough` 下节点 0 就是目标类型
    //   （`js/tank_map.js:515 computeNodeKind` 的 `fkNonCombat` 只对 shop/supply/event 跳过 index 0）。
    if (NODE_INDEX > 0) {
      throw new Error(`NODE=${NODE_INDEX} 不支持：本脚本只能测节点 0（页面无 battle→map 测试钩子，`
        + `不做隐式导航以免产出假读数）。M3-J 校准用 NODE=0 即可。`);
    }
    if (kindProbe.nodeIndex !== null && kindProbe.nodeIndex !== NODE_INDEX) {
      throw new Error(`节点索引自证失败：请求 NODE=${NODE_INDEX}，实测 #${kindProbe.nodeIndex}`);
    }
    console.log(`类型自证：请求 KIND=${KIND || '(裸 URL)'} → 实测 node.kind=${kindProbe.kind}`
      + ` · 导演 kind=${kindProbe.encKind} · 节点#${kindProbe.nodeIndex}`
      + ` · 守点 ${kindProbe.guardTarget ? `有(hp=${kindProbe.guardTarget.hp})` : '无'}`
      + ` · 占领圈 ${kindProbe.captureZones == null ? '-' : kindProbe.captureZones}`);
    if (KIND && KIND !== 'auto' && kindProbe.kind !== KIND) {
      throw new Error(`KIND=${KIND} 未生效：实测 node.kind=${kindProbe.kind}（nodeKinds URL 覆盖未作用于当前节点）`);
    }

    // ---- 探针驱动：自动瞄准 + 持续开火（两个独立 interval）----
    // 2026-11-19：PLAN / HEAL 从 Node 侧传进来（evaluate 的闭包在页面里，读不到进程环境变量）。
    await page.evaluate((probeCfg) => {
      const T = window.__TEST__;
      const PLAN = probeCfg.plan, HEAL = probeCfg.heal, FIRE = probeCfg.fire;
      window.__PLAN = PLAN;
      window.__LOG = [];
      window.__DONE = null;
      // 2026-10-31：新增单调时钟起点。旧口径用 `enc.elapsed` 当采样时间轴，但玩家阵亡 →
      //   finishNode 把 battleEncounter 置 null ⇒ 之后每个采样的 t 都变 0 ⇒ total=0、
      //   打印出「固定开销 -48.8s」这种不可能的负数（2026-10-31 实测踩到）。
      //   改用页面自己的 performance.now() 单调时钟：与导演实例解耦，玩家死亡/切节点都不受影响。
      window.__T0 = performance.now();
      // 2026-10-30：开火计数改为包装 firePrimaryShell（与 test-browser-r4 同款）。
      //   旧写法数 `p._lastFireReject === null` —— 该字段只有 dev 路径才写，正式页面恒 undefined
      //   ⇒ 永远数到 0，无法区分「没开火」和「开了没打中」。
      // 2026-11-19（M3-J 校准）：**敌方对着谁开火**——「不同模式下敌方目标欲望不同」的唯一可观测证据。
      //   首版包装的是 `fireTank`（`tank_battle.html:7742` 显式调用的名字），实测三次全是 0：
      //   要么敌方 `d.fire` 从未为真（装填/LoS 门控），要么 `fireTank` 是**函数声明**、
      //   页面闭包内的调用解析到声明而非 `window.fireTank`（`js/tank_fire.js:806` 就是函数声明）。
      //   两种可能都会让「计数 0」被误读成「敌人不打守点」，所以换到已经被证实的观测点：
      //   `firePrimaryShell`（`js/tank_fire.js:211`，同一文件同一形态，但玩家那 21 次证明包装有效）。
      //   `fireTank` 内部最终走 `firePrimaryShell`（主炮）或副武器分支；主炮口径足够回答
      //   「目标欲望是否生效」，副武器口径记在 other 桶外单独不追踪（数量占比极低）。
      window.__SHOT_TARGETS = { player: 0, guard: 0, other: 0 };
      window.__SHOTS = 0;
      const origPrimary = window.firePrimaryShell;
      if (origPrimary) window.firePrimaryShell = function(sh, tgt, ...a2){
        if (sh && sh.id === 'player') window.__SHOTS++;
        try {
          if (sh && sh.team === 'enemy') {
            if (tgt && tgt.isObjective) window.__SHOT_TARGETS.guard++;
            else if (tgt && (tgt.id === 'player' || tgt === window.__TEST__.player())) window.__SHOT_TARGETS.player++;
            else window.__SHOT_TARGETS.other++;
          }
        } catch (e) { /* 分桶失败不影响开火 */ }
        return origPrimary.apply(this, [sh, tgt, ...a2]);
      };
      // 按键边沿控制（避免每帧重复 keydown）：w/a/d 三键状态机
      const keys = { w: false, a: false, d: false };
      const setKey = (k, on) => {
        if (keys[k] === on) return;
        keys[k] = on;
        window.dispatchEvent(new KeyboardEvent(on ? 'keydown' : 'keyup', { key: k, bubbles: true }));
      };
      window.__fireId = setInterval(() => {
        try {
          const p = T.player();
          if (!p || p.hp <= 0) return;
          const es = T.entities().filter(e => e.team === 'enemy' && e.hp > 0);
          // 2026-11-19（M3-J 校准第二轮）：**瞄准目标**与**推进目标**分离。
          //   首轮只有一个 `goal`：既当准星又当油门目标 ⇒ 三型的胜利路径（守点/读条/出口）
          //   从未被驱动过。现在 aim 恒为最近敌人（要还手才测得准火力），move 按类型分派。
          let aimTarget = null, bd = Infinity;
          if (es.length) {
            for (const e of es) {
              const d = Math.hypot(e.x - p.x, e.y - p.y);
              if (d < bd) { bd = d; aimTarget = e; }
            }
          }
          // 类型感知推进目标（PLAN=nearest 时退回旧行为：追最近敌人 / 下一道防线）
          const kindNow = (T.nodeKind ? T.nodeKind() : null) || 'exterminate';
          let moveGoal = null, stopNear = 600;
          if (PLAN === 'auto') {
            if (kindNow === 'defend') {
              // 守在守点旁（环内侧 90px）：既在护墙环保护下，又不挡住缺口射界。
              const g = T.guardTarget ? T.guardTarget() : null;
              if (g) { moveGoal = { x: g.x, y: g.y }; stopNear = 90; }
            } else if (kindNow === 'capture') {
              // 走向「最近的未拔满圈」，进圈即停（读条由生产逻辑自己走）。
              const zs = (T.captureZones ? T.captureZones() : null) || [];
              let best = null, bz = Infinity;
              for (const z of zs) {
                if (!z || (z.progress || 0) >= 1) continue;
                const d = Math.hypot(z.x - p.x, z.y - p.y);
                if (d < bz) { bz = d; best = z; }
              }
              if (best) { moveGoal = { x: best.x, y: best.y }; stopNear = 20; }
            } else if (kindNow === 'breakthrough') {
              // 朝出口冲。exitX 只能经 `__TEST__.nodeExitX()` 读（2026-11-19 新增）——
              //   `currentNode` 是 battle 页 IIFE 内的绑定，evaluate 里 `typeof currentNode`
              //   恒为 'undefined'，此前这一支从未生效（实测 distToExit 恒 -1、卡在 W1 不动）。
              let ex = null;
              try { ex = T.nodeExitX ? T.nodeExitX() : null; } catch (e) { ex = null; }
              if (Number.isFinite(ex)) { moveGoal = { x: ex, y: p.y }; stopNear = 60; }
            }
          }
          // 回退：无类型专用目标 → 最近敌人；无敌人 → 下一道防线锚点（2026-10-30 lineHold 修正）。
          if (!moveGoal) {
            if (aimTarget) { moveGoal = aimTarget; stopNear = 600; }
            else {
              const enc = T.encounter ? T.encounter() : null;
              const groups = T.encounterAnchors ? T.encounterAnchors() : null;
              if (enc && groups && groups.length) {
                const gi = Math.min(groups.length - 1, (enc.waveIndex || 0) + 1);
                const spots = groups[gi] || [];
                // 取该防线 y 最接近玩家的点位作为推进目标
                let sp = spots[0];
                for (const q of spots) if (Math.abs(q.y - p.y) < Math.abs(sp.y - p.y)) sp = q;
                moveGoal = { x: sp.x, y: sp.y };
                stopNear = 120;
              }
            }
          }
          const goal = aimTarget || moveGoal;   // 准星永远优先瞄敌人（要还手）
          if (!goal) return;
          // 2026-11-19（M3-J 校准）：**必须发 mousemove，不能直接写 p.turretAngle**。
          //   主循环每帧用 `mouseWorld` 重算 desired 角并覆盖 turretAngle（tank_battle.html:7287
          //   `let desired = Math.atan2(mouseWorld.y-player.y, mouseWorld.x-player.x)`），而
          //   `mouseWorld` 只在 canvas 的 mousemove 监听器里更新（:1736-1749）。
          //   改前探针写 p.turretAngle 每帧被覆盖 ⇒ 炮塔永远指向鼠标初始位置 ⇒ 玩家从不开火
          //   （这就是「守点只挨打、玩家不还手」的真因，与守点耐久无关）。
          //   现在把目标世界坐标转成屏幕坐标后派发 mousemove，让生产瞄准链自己算。
          if (es.length) {
            try {
              // 与 `screenToWorld`（js/tank_camera.js:148-150）严格互逆：
              //   sx = (wx - cam.x)·zoom + cam.vw/2，再补上 canvas 在页面内的 left/top。
              //   ⚠ 不要用 rect.width/2 —— cam.vw 是 `canvas.width`（tank_battle.html:936），
              //   若 DPR/样式尺寸不同，用 rect 会把鼠标点打偏，炮塔瞄歪 ⇒ 又变成「打不中」。
              const cv = document.querySelector('canvas');
              const r = cv.getBoundingClientRect();
              const sx = r.left + (goal.x - cam.x) * cam.zoom + cam.vw / 2;
              const sy = r.top + (goal.y - cam.y) * cam.zoom + cam.vh / 2;
              cv.dispatchEvent(new MouseEvent('mousemove', { clientX: sx, clientY: sy, bubbles: true }));
            } catch (e) { window.__AIM_ERR = (window.__AIM_ERR || 0) + 1; }
          }
          // 推进：敌人躲在防线竖墙后时原地打不到（墙挡弹）——向最近敌推进到 600px 内
          //   （600 > band.max 338 ⇒ 不干扰敌人交战带；600 < 玩家射程 1800 ⇒ 射程内）。
          //   用 keydown 'w' 模拟油门（与 measure-survival 的按键驱动同款）。
          // 2026-10-30 修复：`d` 是 for 块内声明（块作用域）——出循环即 ReferenceError，
          //   探针每次都抛异常 ⇒ 从未开火/推进（300s 无结局的真因）。改用循环外的最近距离 bd。
          // 转向 + 油门：目标方向与车体朝向夹角 >0.15rad 就先转向（a=左/-1、d=右/+1），
          //   对准后踩油门。**用 moveGoal 的距离**（而非到最近敌人的距离）决定是否继续推进——
          //   否则 defend 会一直往敌人身上撞、capture 永远走不到圈、breakthrough 永远不进门。
          const desired = Math.atan2(moveGoal.y - p.y, moveGoal.x - p.x);
          let diff = desired - p.hullAngle;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          setKey('d', diff > 0.15);
          setKey('a', diff < -0.15);
          const dMove = Math.hypot(moveGoal.x - p.x, moveGoal.y - p.y);
          const wantAdvance = dMove > stopNear;
          setKey('w', wantAdvance && Math.abs(diff) < 1.2);
          // battle 页无 __TEST__.fire —— 用左键事件驱动 mouseFireHeld（update 内每帧 tryFirePrimary）。
          //   mousedown→mousedown 按住 100ms 再 up：装填门控在 tryFirePrimary 内部，重复按下无害。
          // 2026-11-19（M3-J 校准）：`FIRE=0` 时不派发任何鼠标事件 —— 用于归因
          //   「守点掉的耐久比敌方发数多」是不是玩家自己打的（见文件头 FIRE 注释）。
          if (FIRE && !window.__mouseDown) {
            document.querySelector('canvas').dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
            window.__mouseDown = true;
            setTimeout(() => { window.dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true })); window.__mouseDown = false; }, 50);
          }
        } catch (e) { window.__FIRE_ERR = (window.__FIRE_ERR || 0) + 1; window.__FIRE_MSG = String(e && e.message); }
      }, 100);
      window.__logId = setInterval(() => {
        try {
          const T2 = window.__TEST__;
          const enc = T2.encounter ? T2.encounter() : null;
          const p = T2.player();
          const es = T2.entities().filter(e => e.team === 'enemy' && e.hp > 0);
          window.__LOG.push({
            // 2026-10-31：时间轴改用单调时钟（见 __T0 注释）——玩家阵亡后 enc 为 null 时
            //   仍能给出正确采样时刻，total 不再塌成 0。
            t: Math.round((performance.now() - (window.__T0 || 0)) / 100) / 10,
            phase: enc ? enc.phase : 'none', wave: enc ? enc.waveIndex : -1,
            // 2026-11-19（M3-J 校准）：`battleEncounter` 被清空（结算后）时 enc 变 null，
            //   旧逻辑会把它当成「卡住」。flow.state 才是真结局判据：
            //   settlement / gameover 是正常收尾，battle 才是还在打。
            flow: (() => { try { return T2.flowState ? T2.flowState() : '?'; } catch (e) { return '?'; } })(),
            waveCount: enc ? enc.waveCount : 0,
            enemies: es.length, hp: p ? Math.round(p.hp) : -1,
            maxHp: p && p.stats ? Math.round(p.stats.maxHp) : -1,
            kills: enc ? enc.kills : 0,
            // 2026-11-19（M3-J 校准）：敌方总血量——`kills` 只在 hp 归零瞬间由页面累加，
            //   若玩家「开了火但打不中」，kills 恒 0 且敌血不降，两者一起才能定性。
            enemyHpSum: es.reduce((a, e) => a + Math.max(0, Math.round(e.hp || 0)), 0),
            minDist: (es.length && p) ? Math.round(Math.min(...es.map(e => Math.hypot(e.x - p.x, e.y - p.y)))) : -1,
            // 2026-11-19（M3-J 校准）：守点血量——defend 节点应看到它下降，其它类型恒 -1/不变。
            guardHp: (() => { try { const g = T2.guardTarget ? T2.guardTarget() : null; return g ? g.hp : -1; } catch (e) { return -1; } })(),
            // 2026-11-19（M3-J 校准）：**「打不出」还是「打不到」的判别字段**。
            //   首版只记了 minDist（到玩家），无法区分「敌人没接近」与「敌人接近了但开火门恒拒」。
            //   这里补三样：① 到守点的最近距离；② 有多少敌人装填已完成（reloadT<=0）；
            //   ③ 本帧拒绝原因分布（`_lastFireReject`，B4 2026-10-29 起由 fireTank 写入）。
            //   判读：minDistG 很小但 ready 恒 0 ⇒ 装填门；ready>0 但 rejects 全是 barrel-blocked
            //   ⇒ 炮口贯穿预检被掩体挡（护墙环把敌人自己困在外面，属真实缺陷）；
            //   rejects 全为空且 shots 仍 0 ⇒ 根本没走到 fireTank（d.fire 恒假）。
            minDistG: (() => { try { const g = T2.guardTarget ? T2.guardTarget() : null; return (g && es.length) ? Math.round(Math.min(...es.map(e => Math.hypot(e.x - g.x, e.y - g.y)))) : -1; } catch (e) { return -1; } })(),
            ready: es.filter(e => !(e.reloadT > 0)).length,
            rejects: (() => { const m = {}; es.forEach(e => { const r = e._lastFireReject; if (r) m[r] = (m[r] || 0) + 1; }); return m; })(),
            // 2026-11-19（M3-J 校准）**决定性判别**：守点是一个 tier='intact' 的实体掩体，
            //   而 AI 的开火前置 `los` 走 ctx.hasLoS(t.x,t.y,p.x,p.y) —— 射线终点就在守点中心，
            //   守点自身必然出现在 findCoversOnPath 的结果里 ⇒ 恒返回 false ⇒ canFire 恒假。
            //   若此假设成立，则「敌军更愿意打防御目标」在实现上会导致**敌军完全不开火**。
            //   取「离守点最近的敌军」同时测两条视线，二者不一致即证明假设成立。
            losProbe: (() => {
              try {
                const g = T2.guardTarget ? T2.guardTarget() : null;
                if (!g || !es.length || typeof hasLineOfSight !== 'function') return null;
                const near = es.reduce((a, b) => (Math.hypot(a.x - g.x, a.y - g.y) <= Math.hypot(b.x - g.x, b.y - g.y) ? a : b));
                // 生产口径：AI 现在传 { ignore: 目标自身的 hurtbox }（§4.216 修复）。
                //   守点是实体掩体，射向它自己的射线必须忽略它自己，否则恒被自己挡死。
                //   guardTarget() 只回 {hp,x,y}，所以按坐标从 covers 里反查实体。
                const gCov = (typeof covers !== 'undefined' && covers)
                  ? covers.find(c => c && c.guardTarget) : null;
                return {
                  dG: Math.round(Math.hypot(near.x - g.x, near.y - g.y)),
                  losG: !!hasLineOfSight(near.x, near.y, g.x, g.y, covers, gCov ? { ignore: gCov } : undefined),
                  losRaw: !!hasLineOfSight(near.x, near.y, g.x, g.y, covers),
                  losP: p ? !!hasLineOfSight(near.x, near.y, p.x, p.y, covers) : null,
                };
              } catch (e) { return null; }
            })(),
            // 2026-11-19（M3-J 校准第二轮）：**三型各自的胜利路径可观测字段**。
            //   首轮读数只有「玩家什么时候死」，capture 的 captureDone 与 breakthrough 的
            //   reachedExit 全程没进过日志 ⇒ 无法证明探针真的驱动过胜利路径。
            //   captureDone：已拔满的圈数；capturePct：三圈进度均值（0..1）。
            //   distToExit：到出口的 x 距离（breakthrough 专用，其余 -1）。
            //   kind：本帧节点类型（PLAN 分派的依据，也用于事后核对读数归属）。
            kind: (() => { try { return (T2.nodeKind ? T2.nodeKind() : null) || 'exterminate'; } catch (e) { return '?'; } })(),
            captureDone: (() => {
              try {
                const zs = (T2.captureZones ? T2.captureZones() : null) || [];
                return zs.filter(z => z && (z.progress || 0) >= 1).length;
              } catch (e) { return -1; }
            })(),
            capturePct: (() => {
              try {
                const zs = (T2.captureZones ? T2.captureZones() : null) || [];
                if (!zs.length) return -1;
                const s = zs.reduce((a, z) => a + Math.max(0, Math.min(1, z.progress || 0)), 0);
                return Math.round((s / zs.length) * 1000) / 1000;
              } catch (e) { return -1; }
            })(),
            distToExit: (() => {
              try {
                if (!p) return -1;
                const ex = T.nodeExitX ? T.nodeExitX() : null;
                return Number.isFinite(ex) ? Math.round(ex - p.x) : -1;
              } catch (e) { return -1; }
            })(),
            // 2026-11-19（M3-J 校准第三轮）：capture 的「进度恒 0」必须能二分归因。
            //   读条条件是 `hasAlly && !hasEnemy`（tank_battle.html:3656-3661）：
            //     · 玩家没走进圈 ⇒ dZone 一直 > r，属于**探针没驱动**
            //     · 玩家进了圈但敌军也在圈内 ⇒ zoneEnemies > 0，属于**设计上的争夺**
            //   两者对结论的意义完全相反，只看 capturePct 分辨不出来（都会打印 0.0%）。
            //   dZone：到最近未拔满圈的距离；zoneEnemies：站在任一未拔满圈内的敌军数。
            dZone: (() => {
              try {
                if (!p) return -1;
                const zs = (T2.captureZones ? T2.captureZones() : null) || [];
                let best = Infinity;
                for (const z of zs) {
                  if (!z || (z.progress || 0) >= 1) continue;
                  const d = Math.hypot(z.x - p.x, z.y - p.y);
                  if (d < best) best = d;
                }
                return Number.isFinite(best) ? Math.round(best) : -1;
              } catch (e) { return -1; }
            })(),
            zoneEnemies: (() => {
              try {
                const zs = (T2.captureZones ? T2.captureZones() : null) || [];
                if (!zs.length) return -1;
                const es = (T2.entities ? T2.entities() : []).filter(e => e && e.team === 'enemy' && e.hp > 0);
                let n = 0;
                for (const z of zs) {
                  if (!z || (z.progress || 0) >= 1) continue;
                  for (const e of es) if (Math.hypot(e.x - z.x, e.y - z.y) <= (z.r || 130)) { n++; break; }
                }
                return n;
              } catch (e) { return -1; }
            })(),
          });
          // 2026-11-19（M3-J 校准第二轮）：自动回血（HEAL=1，默认开）。
          //   校准测的是「内容量 / 时长 / 目标欲望」，不是「玩家生存能力」。
          //   首轮三型全部在 19~43s 内 player-dead（maxHp 80，3 敌集火）⇒ 每个参数都被读成
          //   「存活时间」，与参数本身无关。回血只影响测量，不改任何生产代码。
          if (HEAL && p && p.stats && p.hp > 0 && p.hp < p.stats.maxHp) {
            p.hp = p.stats.maxHp;
            window.__HEAL_N = (window.__HEAL_N || 0) + 1;
          }
          const playerDead = p && p.hp <= 0;
          const encDone = enc && (enc.phase === 'victory' || enc.phase === 'defeat');
          if ((encDone || playerDead) && !window.__DONE) {
            window.__DONE = {
              outcome: playerDead ? 'player-dead' : enc.phase,
              // 2026-10-31：结局行也用单调时钟（enc 为 null 时旧口径会写 0，结局显示「0分0秒」）
              elapsed: (performance.now() - (window.__T0 || 0)) / 1000,
              kills: enc ? enc.kills : 0,
              waveIndex: enc ? enc.waveIndex : -1,
              waveCount: enc ? enc.waveCount : 0,
            };
            clearInterval(window.__logId); clearInterval(window.__fireId);
          }
        } catch (e) { /* 记录失败不影响主循环 */ }
      }, 500);
    }, { plan: PLAN, heal: HEAL, fire: FIRE });

    const deadline = Date.now() + CAP_S * 1000;
    let done = null;
    while (Date.now() < deadline) {
      done = await page.evaluate(() => window.__DONE);
      if (done) break;
      await wait(1000);
    }
    const log = await page.evaluate(() => window.__LOG);
    const shots = await page.evaluate(() => window.__SHOTS || 0);
    const shotTargets = await page.evaluate(() => window.__SHOT_TARGETS || { player: 0, guard: 0, other: 0 });
    const fireErr = await page.evaluate(() => ({ n: window.__FIRE_ERR || 0, msg: window.__FIRE_MSG || null }));
    const healN = await page.evaluate(() => window.__HEAL_N || 0);

    console.log(`=== 正式局遭遇测量（MS2/C2）===`);
    console.log(`节点 ${NODE_INDEX} · 类型 ${kindProbe.kind} · CAP ${CAP_S}s · 采样 ${log.length} 条 · 开火 ${shots} 次 · pageerror ${pageErrors.length} · 探针异常 ${fireErr.n}${fireErr.msg ? '（' + fireErr.msg + '）' : ''}`);
    // 2026-11-19（M3-J 校准第二轮）：探针配置自证——读数是否可信取决于这一行
    //   （HEAL 关掉时任何时长读数都只是「存活时间」，不反映类型参数）。
    console.log(`探针档位：PLAN=${PLAN}（${PLAN === 'auto' ? '类型感知推进' : '追最近敌人（旧行为）'}）`
      + ` · HEAL=${HEAL ? '开' : '关'}${HEAL ? `（回血 ${healN} 次）` : ''}`
      + ` · FIRE=${FIRE ? '开' : '关（仅推进不开火，用于归因守点伤害来源）'}`);
    // 敌方开火目标分布（M3-J「目标欲望」的可观测证据）
    {
      const T = shotTargets;
      const sum = (T.player || 0) + (T.guard || 0) + (T.other || 0);
      const pct = v => sum > 0 ? Math.round(v / sum * 100) : 0;
      console.log(`敌方开火目标：玩家 ${T.player || 0}（${pct(T.player || 0)}%）`
        + ` · 守点 ${T.guard || 0}（${pct(T.guard || 0)}%）`
        + ` · 其它 ${T.other || 0}（${pct(T.other || 0)}%）· 合计 ${sum}`);
    }
    if (pageErrors.length) console.log(pageErrors.slice(0, 5).join('\n'));

    // 2026-11-19（M3-J 校准）：玩家火力是否真的落在敌人身上。
    //   「开火 32 次 / 击杀 0」有两种可能：① 炮塔被鼠标瞄准链带着转、实际没指向目标；
    //   ② 炮弹被护墙环挡在环外（intact 不可摧毁）。玩家的开火数不能证明任何一方。
    //   判据：敌血总量是否下降。恒等于初始值 ⇒ 一发没打中。
    {
      const sums = log.map(r => r.enemyHpSum).filter(v => typeof v === 'number');
      const ks = log.map(r => r.kills).filter(v => typeof v === 'number');
      if (sums.length) {
        const firstHp = sums.find(v => v > 0) || 0;
        const minHp = Math.min(...sums);
        const maxKills = ks.length ? Math.max(...ks) : 0;
        console.log(`\n--- 玩家火力落点 ---`);
        console.log(`  敌血总量 首 ${firstHp} → 最低 ${minHp} · 击杀峰值 ${maxKills}`
          + ` · 玩家开火 ${shots} 次`);
        if (firstHp > 0 && minHp >= firstHp && maxKills === 0) {
          console.log(`  判读：⚠ 开了 ${shots} 炮但敌血纹丝不动 ⇒ 炮弹没打到敌人`
            + `（炮塔未指向目标 / 炮弹被 intact 护墙环挡在环外），不是伤害数值问题。`);
        } else if (minHp < firstHp) {
          console.log(`  判读：敌血下降 ${firstHp - minHp} ⇒ 玩家火力有效（但 ${maxKills} 杀说明清场能力不足）。`);
        }
      }
    }

    // 时长分解（按 phase 累计）
    {
      const segs = [];
      for (const r of log) {
        const key = r.phase + '#' + r.wave;
        const last = segs[segs.length - 1];
        if (last && last.key === key) last.to = r.t;
        else segs.push({ key, phase: r.phase, wave: r.wave, from: r.t, to: r.t });
      }
      const sum = {};
      for (const g of segs) {
        const d = Math.max(0, g.to - g.from);
        sum[g.phase] = (sum[g.phase] || 0) + d;
      }
      const total = log.length ? log[log.length - 1].t : 0;
      console.log('\n--- 时长分解（按 phase 累计）---');
      for (const k of Object.keys(sum)) {
        const pct = total > 0 ? Math.round(sum[k] / total * 100) : 0;
        console.log(`  ${k.padEnd(10)} ${String(sum[k].toFixed(1)).padStart(7)}s  ${String(pct).padStart(3)}%`);
      }
      const waveS = sum.wave || 0;
      console.log(`  ⇒ 真交战 ${waveS.toFixed(1)}s / 固定开销 ${(total - waveS).toFixed(1)}s / 总 ${total.toFixed(1)}s`);
    }

    // 波次时间线
    const waveSegs = [];
    for (const r of log) {
      const last = waveSegs[waveSegs.length - 1];
      if (last && last.wave === r.wave && last.phase === r.phase) last.to = r.t;
      else waveSegs.push({ wave: r.wave, phase: r.phase, from: r.t, to: r.t });
    }
    console.log('\n--- 波次时间线 ---');
    for (const g of waveSegs) {
      console.log(`  W${g.wave + 1} ${g.phase.padEnd(10)} ${g.from.toFixed(1)}s → ${g.to.toFixed(1)}s`);
    }

    // 守点血量曲线（M3-J defend 校准：用户要求「敌军更愿意打防御目标」是否真的发生）
    {
      const gh = log.map(r => r.guardHp).filter(v => typeof v === 'number' && v >= 0);
      if (gh.length) {
        const first = gh[0], last = gh[gh.length - 1], minV = Math.min(...gh);
        console.log(`\n--- 守点血量（defend 专用）---`);
        console.log(`  首 ${first} → 末 ${last} · 最低 ${minV} · 采样 ${gh.length} 条`
          + (last < first ? ' ⇒ 守点确实被打（目标欲望在起作用）' : ' ⇒ 守点未掉血（欲望可能未生效或敌人未接近）'));
      }
      // 2026-11-19（M3-J 校准）：「打不出」vs「打不到」判别
      //   只有同时看「到守点距离 / 装填就绪数 / 拒绝原因」才能定性，缺任一项都会误判。
      const dg = log.map(r => r.minDistG).filter(v => typeof v === 'number' && v >= 0);
      const rdy = log.map(r => r.ready).filter(v => typeof v === 'number');
      const rejAll = {};
      log.forEach(r => { if (r.rejects) for (const k in r.rejects) rejAll[k] = (rejAll[k] || 0) + r.rejects[k]; });
      if (dg.length || rdy.length) {
        const minDG = dg.length ? Math.min(...dg) : -1;
        const maxReady = rdy.length ? Math.max(...rdy) : -1;
        const rejKeys = Object.keys(rejAll).sort((a, b) => rejAll[b] - rejAll[a]);
        const shotTotal = (shotTargets && (shotTargets.player + shotTargets.guard + shotTargets.other)) || 0;
        console.log(`\n--- 开火门诊断（「打不出」vs「打不到」）---`);
        console.log(`  到守点最近距离 ${minDG}px · 装填就绪峰值 ${maxReady} 辆 · 已开火 ${shotTotal} 发`
          + ` · 拒绝原因 ${rejKeys.length ? rejKeys.map(k => k + '×' + rejAll[k]).join(' / ') : '（无记录）'}`);
        let verdict;
        if (shotTotal > 0) {
          // 已经打出过实弹 ⇒ 开火门是通的，不再需要找"哪一门卡住"。
          verdict = `已开火 ${shotTotal} 发 ⇒ 开火链通畅（此段无需再诊断门控）`;
        } else if (minDG < 0) verdict = '无守点，本段不适用';
        else if (minDG > 900) verdict = `敌人始终没接近守点（最近 ${minDG}px > 900 出生距）⇒ 是「打不到」，需延长窗口/改推进`;
        else if (maxReady <= 0) verdict = '敌人接近了但装填从未就绪 ⇒ 装填门';
        else if (rejKeys.includes('barrel-blocked')) verdict = '炮口贯穿预检被掩体挡 ⇒ 护墙环把射手自己困住（真实缺陷）';
        else if (!rejKeys.length) verdict = '装填就绪且无拒绝记录但仍 0 发 ⇒ d.fire 恒假（AI 决策层）';
        else verdict = '见上方拒绝原因分布';
        console.log(`  判读：${verdict}`);
      }
      // 2026-11-19（M3-J 校准）LoS 自遮挡判别：守点自身是否把「敌人→守点」的视线挡死。
      //   losP=true 而 losG=false ⇒ 敌人能看见玩家却看不见守点（守点自己挡自己）⇒
      //   目标是守点的敌人永远 canFire=false，且它连打玩家也不会（p 已被换成守点）。
      const lp = log.map(r => r.losProbe).filter(Boolean);
      if (lp.length) {
        const bothBlocked = lp.filter(x => x.losG === false && x.losP === false).length;
        const gBlockedOnly = lp.filter(x => x.losG === false && x.losP === true).length;
        const gClear = lp.filter(x => x.losG === true).length;
        console.log(`\n--- 守点视线自遮挡判别（losProbe）---`);
        // 2026-11-19（M3-J 校准第三轮）：旧判据是 `gBlockedOnly > 0` ⇒ 恒判「假设成立」。
        //   实测两次同判据给出相反结论（357 样本/守点可见 354 判「通畅」；350 样本/守点可见 103
        //   仍判「假设成立」）——**只要样本里有一条「守点被挡但玩家可见」，就无视 103 条可见样本**。
        //   现改为**按占比分档**：自遮挡的特征是「守点几乎从不可见」（修复前实测 gClear=0/57），
        //   而不是「偶尔有一条被挡」。占比阈值取 20%/80%，并单独提示 gBlockedOnly 占比（护墙环
        //   从外侧挡住在设计上是允许的，不能当缺陷）。
        const pct = n => (lp.length ? (n / lp.length * 100).toFixed(1) : '0.0');
        const gClearPct = gClear / lp.length;
        console.log(`  样本 ${lp.length} 条 · 守点可见 ${gClear}（${pct(gClear)}%）· 守点被挡但玩家可见 ${gBlockedOnly}`
          + `（${pct(gBlockedOnly)}%）· 两者皆挡 ${bothBlocked}（${pct(bothBlocked)}%）· 最近样本 dG=${lp[0].dG}px`);
        if (gClearPct >= 0.8) {
          console.log(`  判读：✅ 守点视线通畅（可见占比 ${pct(gClear)}% ≥ 80%）⇒ 自遮挡豁免已生效。`);
          if (gBlockedOnly > 0) {
            console.log(`       另有 ${pct(gBlockedOnly)}% 样本「守点被挡但玩家可见」= 护墙环从外侧挡住，`
              + `属设计允许（护墙环就是用来限制射界的），不是自遮挡回归。`);
          }
        } else if (gClearPct < 0.2) {
          console.log(`  判读：❌ 自遮挡回归 —— 守点可见占比仅 ${pct(gClear)}%（< 20%），`
            + `目标换成守点的敌人会恒不满足 canFire（连玩家也不打，因为 p 已被替换）。`);
        } else {
          console.log(`  判读：⚠ 混合（守点可见 ${pct(gClear)}%）——既非通畅也非回归，`
            + `需按「守点是否被护墙环/建筑从外侧遮挡」逐样本核查。`);
        }
      }
    }

    // 2026-11-19（M3-J 校准第二轮）：**三型胜利路径进度**。
    //   首轮读数里 capture / breakthrough 的胜利路径从未被驱动过（captureDone 恒 0、
    //   reachedExit 恒 false），却打印了漂亮的时长数字 ⇒ 静默假读数。
    //   这里把三型的「进度」显式打出来，让「没驱动」变成可见事实而不是沉默。
    {
      const ks = [...new Set(log.map(r => r.kind))];
      const last = log[log.length - 1] || {};
      console.log(`\n--- 胜利路径进度（按类型）---`);
      console.log(`  本局类型：${ks.join(' / ') || '?'}`);
      if (ks.includes('capture')) {
        const cds = log.map(r => r.captureDone).filter(v => typeof v === 'number' && v >= 0);
        const cps = log.map(r => r.capturePct).filter(v => typeof v === 'number' && v >= 0);
        const maxDone = cds.length ? Math.max(...cds) : -1;
        const maxPct = cps.length ? Math.max(...cps) : -1;
        console.log(`  capture：拔满圈数峰值 ${maxDone} · 进度峰值 ${(maxPct * 100).toFixed(1)}%`
          + (maxPct > 0 ? ' ⇒ 读条路径已被驱动' : ' ⇒ ⚠ 读条路径完全未被驱动（探针没站进圈）'));
        // 2026-11-19（M3-J 校准第三轮）：进度恒 0 时二分归因——是「没走到圈」还是「圈被敌军占住」。
        //   判据来自生产读条条件 `hasAlly && !hasEnemy`（tank_battle.html:3656-3661）。
        const dz = log.map(r => r.dZone).filter(v => typeof v === 'number' && v >= 0);
        const ze = log.map(r => r.zoneEnemies).filter(v => typeof v === 'number' && v >= 0);
        if (dz.length) {
          const minD = Math.min(...dz);
          // 占领圈半径取 `setupCaptureZones` 的硬编码 130（tank_battle.html:3645，
          //   注意不是 RULES 里的 r —— 圈半径当前未配置化）。
          const inZoneFrames = dz.filter(v => v <= 130).length;
          console.log(`  capture 站位：到最近未拔圈最近 ${minD}px · 站进圈 ${inZoneFrames}/${dz.length} 帧`
            + (inZoneFrames === 0 ? ' ⇒ 探针从未进圈（推进未生效，与读条机制无关）' : ''));
        }
        if (ze.length) {
          const blocked = ze.filter(v => v > 0).length;
          console.log(`  capture 争夺：圈内有敌军的帧 ${blocked}/${ze.length}`
            + (blocked > 0
              ? ` ⇒ 读条被敌军压制（设计如此：hasEnemy ⇒ 暂停不清零），不是探针缺陷`
              : ' ⇒ 圈内无敌军，读条应能推进（若仍为 0 则查 updateCaptureZones 调用链）'));
        }
      }
      if (ks.includes('breakthrough')) {
        // 2026-11-19：诊断加强——退出距离可能是负数（玩家已越过出口），
        //   旧写法 `filter(v >= 0)` 会把「已抵达」误判成「没读数」。这里不打过滤，原样看首末。
        const de = log.map(r => r.distToExit).filter(v => typeof v === 'number');
        if (de.length) {
          const first = de[0], minV = Math.min(...de), lastV = de[de.length - 1];
          console.log(`  breakthrough：到出口距离 首 ${first}px → 最近 ${minV}px → 末 ${lastV}px`
            + (minV < first ? ' ⇒ 确实在朝出口推进' : ' ⇒ ⚠ 未朝出口推进'));
          if (minV < 0 && !(done && done.outcome === 'victory')) {
            console.log(`  ⇒ 已越过出口（距离转负）但未见 victory ⇒ 需查 reachedExit 注入`);
          }
        } else {
          console.log(`  breakthrough：⚠ 无 distToExit 读数（-1 = 取不到 exitX）`);
        }
      }
      if (ks.includes('defend')) {
        const gh = log.map(r => r.guardHp).filter(v => typeof v === 'number' && v >= 0);
        if (gh.length) console.log(`  defend：守点血量 ${gh[0]} → ${gh[gh.length - 1]}（最低 ${Math.min(...gh)}）`);
      }
      if (last.kind && last.kind !== kindProbe.kind) {
        console.log(`  ⚠ 类型在局中变化：入口 ${kindProbe.kind} → 末态 ${last.kind}（读数可能混了两个节点）`);
      }
    }

    if (done) {
      const m = Math.floor(done.elapsed / 60), sec = Math.round(done.elapsed % 60);
      console.log(`\n结局: ${done.outcome} · 遭遇 ${m}分${sec}秒（elapsed=${done.elapsed.toFixed(1)}s）`
        + ` · 击杀 ${done.kills} · 波次 ${done.waveIndex + 1}/${done.waveCount}`);
      console.log(`对照口径：MS2 门 ① 带卡牌/商店的真局一场 180~300s。`);
      // 对照：中位血量
      const hps = log.map(r => r.hp).filter(v => v >= 0);
      if (hps.length) {
        console.log(`玩家血量 首末：${hps[0]} → ${hps[hps.length - 1]}（maxHp ${log[0].maxHp}）`);
      }
    } else {
      // 2026-11-19（M3-J 校准）：`enc` 变 null 不等于卡死——defend 守点被毁会走
      //   finishNodeObjectiveLost → transition(settlement)，此后 battleEncounter 被清，
      //   旧判据「enc.phase 恒 none」会把**正常结算**误报成卡住。以 flow.state 为准。
      const last = log[log.length - 1] || {};
      const settled = last.flow && last.flow !== 'battle';
      if (settled) {
        console.log(`\n结局: 已离开 battle（flow=${last.flow}）· ${CAP_S}s 窗口内结算完成`
          + ` · 击杀 ${last.kills} · 末态 phase=${last.phase}`);
        console.log(`说明：本次结算由节点任务失败触发（defend 守点被毁 ⇒ 低分结算，非 gameover），`
          + `或波次已清完。精确结局类型见页面上方日志。`);
      } else {
        console.log(`\n${CAP_S}s 内无结局（可能卡住；见日志末段 phase/flow）`);
        const tail = log.slice(-5);
        for (const r of tail) console.log(`  t=${r.t} ${r.phase} flow=${r.flow} W${r.wave + 1} 敌${r.enemies} hp=${r.hp}`);
        process.exitCode = 1;
      }
    }
  } catch (err) {
    console.error(err && err.stack ? err.stack : String(err));
    process.exitCode = 2;
  } finally {
    if (browser) await browser.close();
    if (server && server.child) server.child.kill();
  }
})();
