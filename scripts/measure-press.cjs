'use strict';

// measure-press.cjs — MS1 压迫探针（§4.164 B0 数据工具，不含断言，只打印数字）
//
// 为什么需要它：#AB11「敌人压到约 630px 就停下对射」已经被三次用「某一时刻的距离快照」
//   验收过、三次都判错（§4.157 / §4.160 / §4.161）。缺的不是数字，是**这一帧为什么没位移**。
//   本探针每帧一行记录：到玩家最近距离 / 径向净推进 / 车体速度 / 正前方阻挡的掩体 tier /
//   本帧碰撞推出量模长（`_pushN`）。B3 的硬断言（minDist ≤340px、净推进 > 0）以本脚本
//   打印的数字为唯一来源。
//
// 与 `scripts/diagnose-ai-crowd.js` 的区别（关键）：
//   那个探针的自述写着「决策层探针，不含碰撞/掩体」，位移只有 turn/move 的最小积分，
//   **物理层整层缺失**——所以它永远看不到「决策层 move=1、实体速度 0、顶着墙排队」这一幕，
//   也就把 #AB11 的主因（物理拥堵）漏掉了。本探针走**真 `driveTank`**（含
//   `resolveCoverCollisions` 与 `applyWallSlide`）+ 真 `resolveTankCollisions`。
//
// 纪律（踩过的坑，别再踩）：
//   · **行进判定只认掩体几何**：`frontBlockTier()` 绝不查 `entities`。§4.160 拿
//     `spawnBlockedWhy`（出生点判定，把实体自身也算障碍）当「前方能不能走」，误判了整轮。
//     本文件里实体只参与「距离/角色」，不参与任何阻挡判定。
//   · **确定性**：`Math.random` 与 `AI._maneuverSetRng` 同时换成种子 RNG，模拟时钟用
//     `setSimNow` 注入并逐帧推进 ⇒ 同 seed 两次逐帧摘要必须完全一致（由 test-ai-press.js 锁）。
//   · **页面接线要照抄，不要"简化"**：`tank_3d.html` 的 `refreshEnemyIntel()` 每
//     `RULES.encounter.intelInterval` 秒刷一次玩家方位。缺这一步，失去视线的敌人会按 #E8
//     的激活门控退回 patrol 并**永久站桩**（实测 seed=20261027@900px：一辆车 2400 帧零位移）
//     —— 那是探针伪影，不是游戏行为。
//
// 已知观察（不是本探针的缺陷，交 B2/B3 参考）：
//   `resolveTankCollisions` 不认识掩体，贴墙车队互相推开时会把同伴顶进墙里，最坏 ≈1.8px；
//   下一帧 `driveTank` 会解算掉（`unrecoverablePenFrames` 恒为 0 ⇒ 不是真穿模）。
//   所以「末帧穿透」这一列不能当穿模红线用，红线是「再解算一次仍消不掉」。
//
// 用法：
//   node scripts/measure-press.cjs            # 默认场景（3 辆 medium / 出生 830px / 20s / dt=1/120）
//   PRESS_SECONDS=30 node scripts/measure-press.cjs
//   PRESS_SEED=20261027 node scripts/measure-press.cjs   # 换掩体布局复核（病是图相关的）
//   PRESS_TRACE=1 node scripts/measure-press.cjs   # 逐帧明细（每 0.5s 一行）
//
// 输出（基线口径见 docs/ISSUES.md #AB11 与 docs/PLAN.md §2.8 B0）：
//   最小距离 / 平台期起点 / 后 5s 均值 / 每辆车的径向净推进与静止帧占比 /
//   正前方阻挡帧占比 / 碰撞帧数 / 推出量与穿透的同步情况。

const U = require('../js/tank_utils.js');
const RULES_MOD = require('../js/tank_rules.js');
const RULES = RULES_MOD.RULES;

// ---------- 全局注入（浏览器端这些是顶层全局；Node 侧按加载顺序补齐，照 scripts/test-tankcollision.js） ----------
global.RULES = RULES;
global.TAU = U.TAU;
global.norm = U.norm;
global.angDiff = U.angDiff;
global.rotate = U.rotate;
global.distToSegment = U.distToSegment;
global.segRayIntersect = U.segRayIntersect;
global.partCorners = U.partCorners;
global.partEdges = U.partEdges;
global.lightningPath = U.lightningPath;
global.simNow = U.simNow;
global.setSimNow = U.setSimNow;
global.advanceSimNow = U.advanceSimNow;

const GEO = require('../js/tank_geometry.js');
global.polyCorners = GEO.polyCorners;
global.HEIGHTS = GEO.HEIGHTS;

const CV = require('../js/tank_cover.js');
global.getCoverUnderTank = CV.getCoverUnderTank;
global.getRoadUnderTank = CV.getRoadUnderTank;
global.resolveCoverCollisions = CV.resolveCoverCollisions;
global.COVER_TIERS = CV.COVER_TIERS;
global.coverCorners = CV.coverCorners;
global.obbMTV = CV.obbMTV;
global.obbMTVs = CV.obbMTVs;

const MD = require('../js/tank_model.js');
global.makeTank = MD.makeTank;
global.debuffTurnRate = MD.debuffTurnRate;
global.debuffSpeedRate = MD.debuffSpeedRate;
global.normalizeBarrel = require('../js/tank_halfgeom.js').normalizeBarrel;

const EN = require('../js/tank_entity.js');
global.entities = EN.entities;
global.spawnTank = EN.spawnTank;
global.advanceTracks = EN.advanceTracks;
global.clamp = EN.clamp;

const MV = require('../js/tank_move.js');
global.driveTank = MV.driveTank;

const AI = require('../js/tank_ai.js');
const SQ = require('../js/tank_ai_squad.js');
const NG = require('../js/tank_nodegen.js');

// ---------- 场景常量（唯一口径；test-ai-press.js 复用同一份 simulate） ----------
const SCENE = {
  // 掩体布局 seed。选它的规则（可复核，不是「挑到好看为止」）：
  //   在固定候选集 {20261027(页面 SEED), 20261028, 4242, 7, 1234} × spawnDist=830 里，
  //   只有 4242 复现了 #AB11 的现场——两辆车停在 630/631px、正前方 89~97% 的帧被 wall/full
  //   挡住、且**移动帧占比 95% 却不再靠近**（顶着墙踩油门的典型签名）。
  //   其余候选给出 386~556px 的最小距离（= 病没发作）。
  //   ⇒ 结论本身就是一条交付物：**这条病是图相关的**，B3 只调接战带不可能对所有图生效。
  //   换图复核：`PRESS_SEED=20261027 node scripts/measure-press.cjs`
  nodeSeed: 4242,
  difficulty: 0.45,        // 与 tank_3d.html 的 generateNode(0.45, …) 同档
  scale: 1.8,              // 与 tank_3d.html 同档（小战场 1440×864 量级）
  enemyCount: 3,           // 首波 3 辆 medium（RULES.encounter.waves[0]）
  spawnDist: 830,          // 出生距离（px）—— #AB11 实测的入场距离量级
  spawnBearing: 0,         // 正东（RULES.encounter.waves[0].units[0].bearing）
  lateralSpread: 90,       // 同组横向铺开（= tank_encounter.js 的 UNIT_SPREAD_PX）
  dt: 1 / 120,
  seconds: 20,
  rngSeed: 12345,
  probeDist: 50,           // 正前方探测距离（px）——与 #AB11 现场采样的「前方 50px」同口径
  // 页面接线同款：tank_3d.html 的 refreshEnemyIntel() 每 `RULES.encounter.intelInterval` 秒
  //   把玩家方位刷给全部活敌（aiEngaged=true + lastKnownPlayerPos）。缺了它，失去视线的敌人
  //   会按 #E8 的激活门控退回 patrol 并**永久站桩**（实测 seed=20261027@900px：一辆车 2400 帧
  //   零位移、radial=0），那是探针伪影而不是游戏行为。
  intelRefresh: true,
};

// ---------- 确定性随机源 ----------
function makeRng(seed) {
  let s = seed >>> 0;
  return function rng() {
    s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

// ---------- 行进判定：只认掩体几何，绝不查 entities ----------
/**
 * 车体沿车头方向前移 `dist` 后的扫掠框是否压在**会阻挡行进**的掩体上。
 *
 * 阻挡判据与 `resolveCoverCollisions` 同源（`passability === 0` 或 `shellBlock` 为真），
 * 因此「探针说通」与「物理层不推出」是同一个语义。
 * ⚠️ 本函数**不读 entities**——实体不是地形，把它算成障碍就是 §4.160 的错误。
 *
 * @param {any} t 实体（读 x/y/hullAngle/hullLen/hullWid）
 * @param {number} dist 前移距离（px）
 * @returns {string|null} 命中的掩体 tier；无阻挡返回 null
 */
function frontBlockTier(t, dist) {
  const hl = Number.isFinite(t.hullLen) ? t.hullLen : 64;
  const hw = Number.isFinite(t.hullWid) ? t.hullWid : 38;
  const px = t.x + Math.cos(t.hullAngle) * dist;
  const py = t.y + Math.sin(t.hullAngle) * dist;
  if (!Number.isFinite(px) || !Number.isFinite(py)) return null;
  const corners = U.partCorners(px, py, t.hullAngle, hl / 2, hw / 2);
  for (const cov of CV.coverQueryCandidates(px, py, (hl + hw) / 2 + Math.abs(dist))) {
    if (!cov || cov.hp <= 0) continue;
    if (cov.tier === 'road') continue;              // 纯地面标识，零物理（同 resolveCoverCollisions）
    const tier = CV.COVER_TIERS[cov.tier];
    if (!tier) continue;
    const blocking = tier.passability === 0 || tier.shellBlock === true || tier.shellBlock === 'single';
    if (!blocking) continue;
    for (const part of CV.coverCollisionParts(cov)) {
      if (CV.obbOverlap(corners, part)) return cov.tier;
    }
  }
  return null;
}

/**
 * 车体当前与阻挡掩体的最大穿透深度（px）。0 = 未穿透。
 * 用于锁「碰撞推出量与穿透同步」：无穿透帧 `_pushN` 必须为 0，推出后必须零残留。
 * @param {any} t
 * @returns {number}
 */
function penetrationDepth(t) {
  const hl = Number.isFinite(t.hullLen) ? t.hullLen : 64;
  const hw = Number.isFinite(t.hullWid) ? t.hullWid : 38;
  const corners = U.partCorners(t.x, t.y, t.hullAngle, hl / 2, hw / 2);
  let maxD = 0;
  for (const cov of CV.coverQueryCandidates(t.x, t.y, (hl + hw) / 2)) {
    if (!cov || cov.hp <= 0) continue;
    if (cov.tier === 'road') continue;
    const tier = CV.COVER_TIERS[cov.tier];
    if (!tier) continue;
    const blocking = tier.passability === 0 || tier.shellBlock === true || tier.shellBlock === 'single';
    if (!blocking) continue;
    for (const part of CV.coverCollisionParts(cov)) {
      const mtv = CV.obbMTV(corners, part);
      if (mtv && mtv.depth > maxD) maxD = mtv.depth;
    }
  }
  return maxD;
}

// ---------- 场景搭建 ----------
const round3 = (v) => (Number.isFinite(v) ? Math.round(v * 1000) / 1000 + 0 : NaN);

/**
 * 造带掩体的战场：`generateNode` 生成掩体并塞进 `CV.covers`（浏览器里就是全局 covers）。
 * @param {any} scene SCENE 的覆盖副本
 * @returns {{w:number,h:number,covers:number,bounds:object,spawn:{x:number,y:number}}}
 */
function buildWorld(scene) {
  CV.covers.length = 0;
  if (scene.covers !== false) {
    const gen = NG.generateNode(scene.difficulty, { seed: scene.nodeSeed, scale: scene.scale });
    for (const c of gen.covers) CV.covers.push(c);
    CV.invalidateCoverGrid();
    const spawn = { x: gen.w * 0.25, y: gen.h * 0.5 };   // 与 tank_3d.html 的 playerSpawn 同口径
    return {
      w: gen.w,
      h: gen.h,
      covers: gen.covers.length,
      bounds: { minX: 0, minY: 0, maxX: gen.w, maxY: gen.h },
      spawn,
    };
  }
  // 空场对照（`covers: false`）：同尺寸、同出生点，但一块掩体都没有。
  //   用途是给「碰撞推出量只在真碰撞帧非零」做负向对照——没有掩体时 `_pushN` 必须恒为 0。
  const gen0 = NG.generateNode(scene.difficulty, { seed: scene.nodeSeed, scale: scene.scale });
  CV.invalidateCoverGrid();
  return {
    w: gen0.w,
    h: gen0.h,
    covers: 0,
    bounds: { minX: 0, minY: 0, maxX: gen0.w, maxY: gen0.h },
    spawn: { x: gen0.w * 0.25, y: gen0.h * 0.5 },
  };
}

function mkFoe(id, x, y, hullAngle) {
  const t = EN.spawnTank({
    id, team: 'enemy', x, y,
    hullAngle, turretAngle: hullAngle,
    heightClass: 'medium',
  });
  t.tankClass = 'medium';
  // 与 tank_3d.html 的 spawnWaveUnits 同口径：波次敌人强制接战 + 已知玩家方位。
  t.aiEngaged = true;
  t.aiReactT = 0;
  return t;
}

// ---------- 主模拟 ----------
/**
 * 逐帧采样里的一辆车。
 * @typedef {{
 *   id:string, dist:number, radial:number, speed:number, ahead:string,
 *   push:number, pen:number, penSep:number, role:string
 * }} PressRow
 *
 * 逐帧采样的一帧。
 * @typedef {{
 *   f:number, t:number, minDist:number, playerSpeed:number, rows:Array<PressRow>
 * }} PressFrame
 */

/**
 * 汇总数据的形状（test-ai-press.js 直接读这些字段；缺字段应当在 typecheck 阶段就炸，
 * 而不是等到断言里读到 undefined 才发现探针没在量东西）。
 * @typedef {{
 *   seconds:number, dt:number, frames:number, spawnDist:number, probeDist:number,
 *   world:{w:number, h:number, covers:number, nodeSeed:number},
 *   minDist:number, plateauSec:number, tail5sMeanMinDist:number,
 *   radialNetBest:number, radialNetMean:number,
 *   stillShare:number, moveShare:number, blockedShare:number,
 *   collideFrames:number, penetrateFrames:number, unrecoverablePenFrames:number,
 *   penWithoutPushFrames:number, badCoordFrames:number,
 *   perFoe:Array<object>
 * }} PressSummary
 */

/**
 * 跑一次压迫场景，逐帧记录。
 * @param {object} [opts] 覆盖 SCENE 的字段（seconds / dt / spawnDist / enemyCount / covers 等）
 * @returns {{summary:PressSummary, frames:Array<PressFrame>, digest:string, world:object, foes:Array<any>, player:any}}
 */
function simulate(opts) {
  const scene = Object.assign({}, SCENE, opts || {});
  const dt = scene.dt;
  const frameCount = Math.round(scene.seconds / dt);

  // 幂等：清实体、清小队状态、清掩体
  EN.entities.length = 0;
  SQ.resetSquad();
  const world = buildWorld(scene);

  const realRandom = Math.random;
  const realSimNow = U.simNow();
  U.setSimNow(0);
  const rng = makeRng(scene.rngSeed);
  Math.random = rng;
  AI._maneuverSetRng(rng);

  const player = MD.makeTank({
    id: 'player', team: 'player', x: world.spawn.x, y: world.spawn.y,
    hullAngle: 0, turretAngle: 0, heightClass: 'medium',
  });
  player.speed = 0;
  EN.entities.push(player);

  const foes = [];
  for (let i = 0; i < scene.enemyCount; i++) {
    const lateral = (i - (scene.enemyCount - 1) / 2) * scene.lateralSpread;
    const a = scene.spawnBearing;
    const x = player.x + Math.cos(a) * scene.spawnDist - Math.sin(a) * lateral;
    const y = player.y + Math.sin(a) * scene.spawnDist + Math.cos(a) * lateral;
    const hullAngle = Math.atan2(player.y - y, player.x - x);
    const foe = mkFoe(`enemy_w0_${i}`, x, y, hullAngle);
    foe.lastKnownPlayerPos = { x: player.x, y: player.y };
    foes.push(foe);
  }

  const intelInterval = (RULES.encounter && RULES.encounter.intelInterval) || 0;
  let intelTimer = intelInterval;

  const wb = world.bounds;
  const hasLoS = (ox, oy, tx, ty) => CV.hasLineOfSight(ox, oy, tx, ty, CV.covers);
  const findCoversOnPath = (ox, oy, tx, ty) => CV.findCoversOnPath(ox, oy, tx, ty, CV.covers);

  // 逐车累计：径向净推进（每帧沿「玩家→该车」单位向量投影，绕圈不计入）、
  // 速度/阻挡/碰撞帧数
  const acc = foes.map(() => ({
    radial: 0, stillFrames: 0, moveFrames: 0, blockedFrames: 0, pushFrames: 0,
    speedSum: 0, maxSpeed: 0,
  }));
  const startDist = foes.map(f => Math.hypot(f.x - player.x, f.y - player.y));
  const lastDist = startDist.slice();      // 每辆车「最近一次真的靠近（>1px）」的帧号
  const lastImprove = foes.map(() => 0);
  let runMin = Infinity, plateauFrame = 0;  // 全程最小距离最后一次改善的帧号（= 平台期起点）
  const frames = [];
  let badCoordFrames = 0;      // 出现 NaN/Infinity 的帧数
  let penetrateFrames = 0;     // 实体分离后仍与阻挡掩体有穿透的帧数
  let penWithoutPushFrames = 0;   // 有穿透、却没记录到推出量的帧（应为 0）
  let unrecoverablePenFrames = 0; // 残留穿透再解算一次仍消不掉的帧（应为 0）

  for (let f = 0; f < frameCount; f++) {
    const alive = foes.filter(e => e.hp > 0);

    // 页面接线同款：进攻方指挥部按 intelInterval 刷新玩家方位
    if (scene.intelRefresh && intelInterval > 0) {
      intelTimer -= dt;
      if (intelTimer <= 0) {
        intelTimer += intelInterval;
        for (const e of alive) {
          e.aiEngaged = true;
          e.lastKnownPlayerPos = { x: player.x, y: player.y };
        }
      }
    }

    const ctx = {
      player,
      entities: EN.entities,
      enemies: alive,
      covers: CV.covers,
      hasLoS,
      findCoversOnPath,
      worldBounds: wb,
      dt,
      diff: scene.difficulty,
      allyCommand: RULES.allyCommand,
    };

    // 站桩玩家：不转向、不给油（松键滑行仍走 driveTank 的制动通道，与实机一致）
    MV.driveTank(player, dt, { turn: 0, move: 0, worldBounds: wb });

    SQ.updateSquad(ctx);
    const prev = alive.map(e => ({ x: e.x, y: e.y }));
    // driveTank 结束时的即时快照：推出量与「解算后是否还嵌在掩体里」必须同帧对照，
    // 不能等到 resolveTankCollisions 之后（实体分离也会挪位置，会把两种成因搅在一起）。
    const mid = [];
    for (const e of alive) {
      const out = AI.aiDecideEnemy(e, ctx);
      MV.driveTank(e, dt, { turn: out.turn, move: out.move, worldBounds: wb });
      // 炮塔朝向（页面主循环同款积分；本探针不开火，但炮塔角影响 AI 下一帧决策）
      const td = U.angDiff(out.turretDesired, e.turretAngle);
      const maxStep = (e.stats.turretTurnRate || 1) * dt;
      e.turretAngle = U.norm(e.turretAngle + Math.max(-maxStep, Math.min(maxStep, td)));

      const push = Math.hypot(e._pushNx || 0, e._pushNy || 0);
      const pen = penetrationDepth(e);
      mid.push({ push, pen });
      if (pen > 1e-9 && push <= 0) penWithoutPushFrames++;
    }
    if (typeof EN.resolveTankCollisions === 'function') EN.resolveTankCollisions();
    U.advanceSimNow(dt * 1000);

    // ---- 逐帧采样（位移已含碰撞解算，故此处是「本帧真实净位移」）----
    const rows = [];
    let minDist = Infinity;
    let frameBad = false;
    for (let i = 0; i < alive.length; i++) {
      const e = alive[i];
      const dx = e.x - player.x, dy = e.y - player.y;
      const dist = Math.hypot(dx, dy);
      if (dist < minDist) minDist = dist;
      if (dist < lastDist[i] - 1) { lastDist[i] = dist; lastImprove[i] = f; }

      // 径向净推进：位移在「玩家→该车」单位向量上的投影（负号 = 靠近）
      const ux = dist > 1e-9 ? dx / dist : 1;
      const uy = dist > 1e-9 ? dy / dist : 0;
      const radialStep = -((e.x - prev[i].x) * ux + (e.y - prev[i].y) * uy);
      const a = acc[i];
      a.radial += radialStep;

      const spd = Math.abs(e.speed || 0);
      a.speedSum += spd;
      if (spd > a.maxSpeed) a.maxSpeed = spd;
      if (spd <= 1) a.stillFrames++; else a.moveFrames++;

      const aheadTier = frontBlockTier(e, scene.probeDist);
      if (aheadTier) a.blockedFrames++;

      const m = mid[i];
      if (m.push > 0) a.pushFrames++;

      // 实体分离后的残留穿透：resolveTankCollisions 不认识掩体，会把贴墙的车推开时顶进墙里，
      // 所以「末位穿透」必须与「driveTank 刚结束时的穿透」分开记。
      const penSep = penetrationDepth(e);
      if (penSep > 1e-9) {
        penetrateFrames++;
        // 残留只允许是「等下一帧解算」：再解算一次仍消不掉 ⇒ 真穿模（属于另一个缺陷）
        const probe = {
          x: e.x, y: e.y, hullAngle: e.hullAngle,
          hullLen: e.hullLen, hullWid: e.hullWid, _pushNx: 0, _pushNy: 0,
        };
        CV.resolveCoverCollisions(probe);
        if (penetrationDepth(probe) > 1e-9) unrecoverablePenFrames++;
      }

      if (!Number.isFinite(e.x) || !Number.isFinite(e.y) || !Number.isFinite(dist)
          || !Number.isFinite(e.speed) || !Number.isFinite(radialStep)) frameBad = true;

      rows.push({
        id: e.id, dist: round3(dist), radial: round3(radialStep), speed: round3(e.speed || 0),
        ahead: aheadTier || 'none', push: round3(m.push), pen: round3(m.pen), penSep: round3(penSep),
        role: e.aiRole || '-',
      });
    }
    if (!Number.isFinite(player.x) || !Number.isFinite(player.y) || !Number.isFinite(player.speed)) frameBad = true;
    if (frameBad) badCoordFrames++;

    if (minDist < runMin - 1) { runMin = minDist; plateauFrame = f; }

    frames.push({ f, t: round3(f * dt), minDist: round3(minDist), playerSpeed: round3(player.speed || 0), rows });
  }

  Math.random = realRandom;
  AI._maneuverSetRng(null);
  U.setSimNow(realSimNow);

  // ---------- 汇总 ----------
  const perFoe = foes.map((e, i) => {
    const a = acc[i];
    const total = a.stillFrames + a.moveFrames;
    const dx = e.x - player.x, dy = e.y - player.y;
    return {
      id: e.id,
      startDist: round3(startDist[i]),
      endDist: round3(Math.hypot(dx, dy)),
      radial: round3(a.radial),
      meanSpeed: round3(total ? a.speedSum / total : 0),
      maxSpeed: round3(a.maxSpeed),
      stillShare: round3(total ? a.stillFrames / total : 0),
      blockedShare: round3(total ? a.blockedFrames / total : 0),
      pushFrames: a.pushFrames,
      stallSec: round3(lastImprove[i] * dt),   // 最后一次真的靠近的时刻（此后原地）
      lastAhead: frontBlockTier(e, scene.probeDist) || 'none',
      lastRole: e.aiRole || '-',
    };
  });

  const tailFrames = frames.filter(fr => fr.t >= scene.seconds - 5);
  const tailMean = tailFrames.length
    ? tailFrames.reduce((s, fr) => s + fr.minDist, 0) / tailFrames.length : 0;
  const allDists = frames.map(fr => fr.minDist);
  const minDist = Math.min.apply(null, allDists);
  const stillFrames = acc.reduce((s, a) => s + a.stillFrames, 0);
  const moveFrames = acc.reduce((s, a) => s + a.moveFrames, 0);
  const blockedFrames = acc.reduce((s, a) => s + a.blockedFrames, 0);
  const pushFrames = acc.reduce((s, a) => s + a.pushFrames, 0);
  const foeFrames = stillFrames + moveFrames;

  const summary = {
    seconds: scene.seconds,
    dt,
    frames: frameCount,
    spawnDist: scene.spawnDist,
    probeDist: scene.probeDist,
    world: { w: world.w, h: world.h, covers: world.covers, nodeSeed: scene.nodeSeed },
    minDist: round3(minDist),
    plateauSec: round3(plateauFrame * dt),   // 全程最小距离最后一次改善的时刻（此后即平台期）
    tail5sMeanMinDist: round3(tailMean),
    // 径向净推进：以「最后一辆仍在推进的车」为口径会漂移，故给三辆各自的值 + 三辆中的最大值
    radialNetBest: round3(Math.max.apply(null, perFoe.map(p => p.radial))),
    radialNetMean: round3(perFoe.reduce((s, p) => s + p.radial, 0) / (perFoe.length || 1)),
    stillShare: round3(foeFrames ? stillFrames / foeFrames : 0),
    moveShare: round3(foeFrames ? moveFrames / foeFrames : 0),
    blockedShare: round3(foeFrames ? blockedFrames / foeFrames : 0),
    collideFrames: pushFrames,
    penetrateFrames,
    unrecoverablePenFrames,
    penWithoutPushFrames,
    badCoordFrames,
    perFoe,
  };

  // 逐帧摘要（确定性断言的比较对象）：把每帧所有数值压成一行文本
  const digestLines = frames.map(fr => fr.f + '|' + fr.minDist + '|' + fr.playerSpeed + '|'
    + fr.rows.map(r => `${r.id}:${r.dist}:${r.radial}:${r.speed}:${r.ahead}:${r.push}:${r.pen}:${r.penSep}`).join(','));
  const digest = digestLines.join('\n');

  return { summary, frames, digest, world, foes, player };
}

// ---------- CLI ----------
function pad(s, n) { s = String(s); while (s.length < n) s += ' '; return s; }

function printReport(res) {
  const s = res.summary;
  console.log('=== MS1 压迫探针（真 driveTank + 真掩体碰撞）===');
  console.log(`场景：nodeSeed=${s.world.nodeSeed} ${s.world.w}×${s.world.h} / covers=${s.world.covers} / `
    + `${s.spawnDist}px 出生 / ${s.seconds}s / dt=${s.dt.toFixed(5)}`);
  console.log('');
  console.log(`最小距离（全程）      : ${s.minDist.toFixed(0)} px     ← 门 ① 目标 ≤340px`);
  console.log(`平台期起点            : ${s.plateauSec.toFixed(1)} s     ← 此后最小距离不再改善（>1px）`);
  console.log(`后 5s 最小距离均值    : ${s.tail5sMeanMinDist.toFixed(0)} px     ← 防「最后一帧擦过」`);
  console.log(`径向净推进（最好一辆）: ${s.radialNetBest.toFixed(1)} px     ← 门 ② 目标 > 0`);
  console.log(`径向净推进（三辆均值）: ${s.radialNetMean.toFixed(1)} px`);
  console.log(`静止帧占比            : ${(s.stillShare * 100).toFixed(1)} %（|v| ≤ 1px/s）`);
  console.log(`移动帧占比            : ${(s.moveShare * 100).toFixed(1)} %`);
  console.log(`正前方 ${s.probeDist}px 阻挡帧占比  : ${(s.blockedShare * 100).toFixed(1)} %（只认掩体几何）`);
  console.log(`碰撞推出帧数（合计）  : ${s.collideFrames}（推出量 > 0 的车·帧）`);
  console.log(`残留穿透帧数          : ${s.penetrateFrames}（实体分离顶进掩体，等下一帧解算）`);
  console.log(`  其中不可恢复        : ${s.unrecoverablePenFrames}（再解算一次仍穿透 ⇒ 必须为 0）`);
  console.log(`有穿透但无推出量      : ${s.penWithoutPushFrames}（必须为 0）`);
  console.log(`NaN/Infinity 帧数     : ${s.badCoordFrames}（必须为 0）`);
  console.log('');
  console.log('逐车明细：');
  console.log('  ' + pad('id', 13) + pad('起始', 8) + pad('末距', 8) + pad('净推进', 9)
    + pad('均速', 8) + pad('峰速', 8) + pad('静止%', 8) + pad('阻挡%', 8) + pad('碰撞帧', 8)
    + pad('末次靠近', 10) + '末帧前方');
  for (const p of s.perFoe) {
    console.log('  ' + pad(p.id, 13) + pad(p.startDist.toFixed(0), 8) + pad(p.endDist.toFixed(0), 8)
      + pad(p.radial.toFixed(1), 9) + pad(p.meanSpeed.toFixed(1), 8) + pad(p.maxSpeed.toFixed(1), 8)
      + pad((p.stillShare * 100).toFixed(0), 8) + pad((p.blockedShare * 100).toFixed(0), 8)
      + pad(p.pushFrames, 8) + pad(p.stallSec.toFixed(1) + 's', 10) + p.lastAhead);
  }
  if (process.env.PRESS_TRACE) {
    console.log('');
    console.log('逐帧明细（每 0.5s 一行）：');
    const stride = Math.round(0.5 / (s.dt));
    for (let i = 0; i < res.frames.length; i += stride) {
      const fr = res.frames[i];
      const parts = fr.rows.map(r => `${r.id.replace('enemy_w0_', '')}:${r.dist.toFixed(0)}px v=${r.speed.toFixed(0)} ahead=${r.ahead}`);
      console.log(`  t=${fr.t.toFixed(1)}s min=${fr.minDist.toFixed(0)}  ${parts.join('  ')}`);
    }
  }
}

module.exports = { simulate, frontBlockTier, penetrationDepth, SCENE };

if (require.main === module) {
  const over = {};
  const seconds = Number(process.env.PRESS_SECONDS);
  if (Number.isFinite(seconds) && seconds > 0) over.seconds = seconds;
  const seed = Number(process.env.PRESS_SEED);
  if (Number.isFinite(seed) && seed > 0) over.nodeSeed = seed;
  printReport(simulate(over));
}
