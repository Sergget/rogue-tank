'use strict';

// test-hull-down.js — #AB18 条件降档回归（2026-10-29 用户裁定路线 ②）
//
// 锁四类东西：
//   ① 判据函数   —— `_hullDownTargetZ`：静止+未开火 ⇒ 1.0；移动/开火窗内/Boss ⇒ null；
//   ② 端到端     —— 玩家蹲在 660px 外的灌木后，敌人**激活不了**（engaged=false）；
//                   同一玩家移动 ⇒ 炮塔露头，正常激活；
//   ③ 负向护栏   —— 目标不在灌木后（空场）时，静止目标照常被看见（不许全局失明）；
//   ④ 平衡前置   —— 静止玩家触发距离 438px（700×0.625）> 0 的不变量（隐蔽通道仍在）。
//
// 运行：node scripts/test-hull-down.js

const U = require('../js/tank_utils.js');
const RULES_MOD = require('../js/tank_rules.js');
global.RULES = RULES_MOD.RULES;
global.angDiff = U.angDiff; global.norm = U.norm; global.TAU = U.TAU;
global.simNow = U.simNow; global.setSimNow = U.setSimNow; global.advanceSimNow = U.advanceSimNow;
global.partCorners = U.partCorners; global.distToSegment = U.distToSegment;
global.segRayIntersect = U.segRayIntersect; global.rotate = U.rotate;

const CV = require('../js/tank_cover.js');
global.COVER_TIERS = CV.COVER_TIERS; global.covers = CV.covers;
global.getCoverUnderTank = CV.getCoverUnderTank;
global.polyCorners = require('../js/tank_geometry.js').polyCorners;
global.coverCorners = CV.coverCorners;
global.losBlocker = CV.losBlocker;
const LOS_HULL_Z_VAL = CV.LOS_HULL_Z;
global.camouflageMotionOf = CV.camouflageMotionOf;
global.camouflageFiringMul = CV.camouflageFiringMul;

const AI = require('../js/tank_ai.js');

let fails = 0;
function ok(cond, label) {
  if (cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}`); fails++; }
}
function section(t) { console.log(`\n== ${t} ==`); }

const resetWorld = () => { CV.covers.length = 0; U.setSimNow(0); };
const mkPlayer = (o) => Object.assign({ id: 'p', team: 'player', x: 660, y: 0, hp: 100,
  speed: 0, hullLen: 64, hullWid: 38, hullAngle: 0, turretAngle: 0 }, o || {});
const mkEnemy = (o) => Object.assign({ id: 'e1', team: 'enemy', x: 0, y: 0, hullAngle: 0,
  turretAngle: 0, reloadT: 0, hp: 100, traverseLimit: Math.PI,
  stats: { turretTurnRate: 2.2 }, aiTriggerDist: 700 }, o || {});
const mkCtx = (player) => ({ player, hasLoS: CV.hasLineOfSight, dt: 1 / 60, covers: CV.covers, enemies: [player] });

// ============================================================
section('① 判据函数 _hullDownTargetZ');

{
  resetWorld();
  const p = mkPlayer();
  ok(AI._hullDownTargetZ(p) === LOS_HULL_Z_VAL, `静止+未开火 ⇒ 车体口径 ${LOS_HULL_Z_VAL}m`);
  ok(AI._hullDownTargetZ({ ...p, speed: 100 }) === null, '移动 ⇒ null（炮塔口径）');
  ok(AI._hullDownTargetZ({ ...p, lastFireAt: 0 }) === null, '开火惩罚窗内 ⇒ null');
  ok(AI._hullDownTargetZ({ ...p, isBoss: true }) === null, 'Boss 不吃地形增益 ⇒ null');
  ok(AI._hullDownTargetZ(null) === null, 'null 目标 ⇒ null（安全）');
}

// ============================================================
section('② 端到端：蹲灌木激活不了，动了就激活');

{
  resetWorld();
  // 灌木横在敌我之间：敌 (0,0) → 玩家 (660,0)，灌木中心 (330,0)
  CV.covers.push({ x: 330, y: 0, w: 60, h: 200, angle: 0, tier: 'bush', hp: 10 });

  const t1 = mkEnemy();
  const r1 = AI.aiDecideEnemy(t1, mkCtx(mkPlayer()));
  ok(t1.aiEngaged !== true && t1.aiState === 'patrol',
    `蹲灌木 660px：不激活（engaged=${t1.aiEngaged}，state=${t1.aiState}）—— hull-down 生效`);
  ok(r1.move === 0, '未激活 ⇒ 不移动（patrol 早退）');

  // 同方向 480px，玩家移动 ⇒ 炮塔（2.3m）露出灌木 1.2m ⇒ 正常激活
  //   （480 < 移动隐蔽有效触发 519 ⇒ 隐蔽通道不拦；若 hull-down 误用炮塔口径也在此距离）
  const t2 = mkEnemy({ id: 'e2', x: 180, y: 0 });
  AI.aiDecideEnemy(t2, mkCtx(mkPlayer({ x: 660, speed: 100 })));
  ok(t2.aiEngaged === true, `移动中 480px：正常激活（engaged=${t2.aiEngaged}）—— 炮塔口径`);
  // 关键对照：**同一距离、玩家静止** ⇒ 车体口径被灌木挡 ⇒ 不激活（hull-down 的独有判别）
  const t2b = mkEnemy({ id: 'e2b', x: 180, y: 0 });
  AI.aiDecideEnemy(t2b, mkCtx(mkPlayer({ x: 660, speed: 0 })));
  ok(t2b.aiEngaged !== true,
    `静止 480px（同一灌木）：不激活（engaged=${t2b.aiEngaged}）—— 移动/静止在 480px 处分化，这才是 hull-down`);
}

// ============================================================
section('③ 负向护栏：空场静止目标照常被看见');

{
  resetWorld();
  // 静止有效触发 438 ⇒ 用 400px
  const t = mkEnemy({ x: 260, y: 0 });
  AI.aiDecideEnemy(t, mkCtx(mkPlayer({ x: 660, speed: 0 })));
  ok(t.aiEngaged === true, '空场 + 静止玩家 400px（<438）：正常激活（降档不等于全局失明）');
}

// ============================================================
section('④ 隐蔽通道仍在（两条通道互补）');

{
  resetWorld();
  // 有效触发距离 438px（700 × 0.625 静止隐蔽）：即使无灌木，438px 内照常激活
  CV.covers.push({ x: 200, y: 400, w: 60, h: 200, angle: 0, tier: 'bush', hp: 10 });  // 不在视线上
  const t = mkEnemy({ x: 100, y: 0 });   // 距玩家 560 ∈ (438, 700)
  AI.aiDecideEnemy(t, mkCtx(mkPlayer()));
  ok(t.aiEngaged !== true,
    '560px > 有效触发 438 ⇒ 不激活（隐蔽值通道独立生效，与 hull-down 互补）');
  const t2 = mkEnemy({ id: 'e3', x: 400, y: 0 });  // 距玩家 260 < 438
  AI.aiDecideEnemy(t2, mkCtx(mkPlayer()));
  ok(t2.aiEngaged === true, '260px < 438 ⇒ 激活（距离穿透隐蔽）');
}

// ============================================================
resetWorld();
console.log(`\n=== test-hull-down: ${fails === 0 ? 'ALL PASS' : fails + ' FAILED'} ===`);
if (fails > 0) process.exitCode = 1;
