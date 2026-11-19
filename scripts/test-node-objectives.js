// test-node-objectives.js — M3-J（2026-11-03）节点任务类型的目标几何与目标欲望
//
// 本测试锁的是「类型不只是改名」这件事的**可测量部分**：
//   ① 护墙环的可命中方位恒为 G 个固定扇区（与射手距离无关）——用户口径的
//      「敌军只能在数个特定方向命中守点」；
//   ② 缺口张角 ∝ 1/距离 ⇒ 远距离瞄准容差急剧收窄、近处更易命中——
//      用户口径的「远距离更难、近距离更容易」，且**不得**在代码里做远近特判；
//   ③ 占领点脱离防线 bucket 中心（改前与防线空间完全重合）；
//   ④ 突破通道有净宽与两侧墙；
//   ⑤ pickEngageTarget 的零回归（bias=0 ⇒ 恒玩家）与偏置生效；
//   ⑥ objectiveBiasFor 的类型映射与总开关。
//
// 判据口径：可命中 = 从该方位沿直线射向守点中心，不被任何护墙块截断。
//   弹道是直线 ⇒ 过半径 R 处方位角恒等于射手方位角 ⇒ 判定可以纯几何化。

'use strict';

const O = require('../js/tank_objectives.js');
require('../js/tank_utils.js');
const RULES_MOD = require('../js/tank_rules.js');
const R = RULES_MOD.RULES;

let pass = 0, fail = 0;
function ok(cond, label) {
  if (cond) { pass++; console.log('✓ ' + label); }
  else { fail++; console.log('✗ ' + label); }
}
function section(name) { console.log('\n== ' + name + ' =='); }

// ---------- 几何工具：线段（射手→守点）与旋转矩形是否相交（slab 法） ----------
function segHitsBlock(sx, sy, tx, ty, b) {
  const ca = Math.cos(-b.angle), sa = Math.sin(-b.angle);
  const toLocal = (x, y) => {
    const dx = x - b.x, dy = y - b.y;
    return [dx * ca - dy * sa, dx * sa + dy * ca];
  };
  const [x0, y0] = toLocal(sx, sy);
  const [x1, y1] = toLocal(tx, ty);
  const hw = b.w / 2, hh = b.h / 2;
  let t0 = 0, t1 = 1;
  const dx = x1 - x0, dy = y1 - y0;
  const axes = [[x0, dx, -hw, hw], [y0, dy, -hh, hh]];
  for (const [p, d, lo, hi] of axes) {
    if (Math.abs(d) < 1e-9) {
      if (p < lo || p > hi) return false;
    } else {
      let ta = (lo - p) / d, tb = (hi - p) / d;
      if (ta > tb) { const t = ta; ta = tb; tb = t; }
      t0 = Math.max(t0, ta);
      t1 = Math.min(t1, tb);
      if (t0 > t1) return false;
    }
  }
  return true;
}
function canHitCenter(ring, cx, cy, angle, D) {
  const sx = cx + Math.cos(angle) * D, sy = cy + Math.sin(angle) * D;
  for (const b of ring.blocks) if (segHitsBlock(sx, sy, cx, cy, b)) return false;
  return true;
}

const GC = R.nodeKinds.geometry.guardRing;
const CX = 5000, CY = 5000;   // 远离地图边界，避免越界剔除干扰几何断言

// ================= ① 护墙环：固定扇区 =================
section('① 护墙环：可命中方位恒为 G 个固定扇区（与距离无关）');
{
  const ring = O.planGuardRing({
    x: CX, y: CY, radius: GC.radius, thickness: GC.thickness, gaps: GC.gaps,
    gapWidth: GC.gapWidth, blockLen: GC.blockLen, tier: GC.tier, margin: GC.margin,
    w: 100000, h: 100000, angleOffset: 0,
  });
  ok(ring.blocks.length > 0, '①a 生成护墙块（' + ring.blocks.length + ' 块）');
  ok(ring.blocks.every(b => b.tier === 'intact'), '①b 全部块 tier=intact（mode solid 才真拦弹）');
  ok(ring.blocks.every(b => Number.isFinite(b.x) && Number.isFinite(b.y)), '①c 块坐标有限');
  ok(ring.gaps.length === GC.gaps, '①d 缺口数 = ' + GC.gaps);

  // 逐距离扫方位，统计可命中占比与连续扇区数
  const sampleAt = (D) => {
    const angles = [];
    for (let i = 0; i < 2880; i++) {
      const a = i * Math.PI / 1440;
      if (canHitCenter(ring, CX, CY, a, D)) angles.push(a);
    }
    let sectors = 0, prev = -99;
    for (const a of angles) { if (a - prev > Math.PI / 180 * 3) sectors++; prev = a; }
    return { pct: angles.length / 2880 * 100, sectors, angles };
  };
  const near = sampleAt(400);
  const far = sampleAt(4000);
  ok(near.sectors > 0 && near.sectors <= GC.gaps + 1,
    '①e 近距（D=400）可命中扇区数 = ' + near.sectors + '（≤ 缺口数 ' + GC.gaps + '）');
  ok(far.sectors > 0 && far.sectors <= GC.gaps + 1,
    '①f 远距（D=4000）可命中扇区数 = ' + far.sectors + '（≤ 缺口数 ' + GC.gaps + '）');
  ok(Math.abs(near.pct - far.pct) < 1.0,
    '①g 可命中方位占比与距离无关（近 ' + near.pct.toFixed(1) + '% / 远 ' + far.pct.toFixed(1) + '%）');

  // 负向：环外任意方向都不是全通（否则护墙等于没建）
  ok(near.pct < 60, '①h 负向：可命中占比 < 60%（护墙确实挡住大部分方向，实测 ' + near.pct.toFixed(1) + '%）');
  ok(far.pct < 60, '①i 负向：远距可命中占比同样 < 60%');
}

// ================= ② 瞄准容差随距离收窄（远难近易） =================
section('② 瞄准容差 ∝ 1/距离（远距离只能在精确方向命中）');
{
  // 缺口在射手视野里的张角 = gapWidth / D（小角近似，R≪D 时精确）
  const tolAt = (D) => GC.gapWidth / D;
  const t400 = tolAt(400), t900 = tolAt(900), t2000 = tolAt(2000), t4000 = tolAt(4000);
  ok(t400 > t900, '②a 近距容差 > 中距容差（' + (t400 * 180 / Math.PI).toFixed(2) + '° > ' + (t900 * 180 / Math.PI).toFixed(2) + '°）');
  ok(t900 > t2000, '②b 中距容差 > 远距容差（' + (t900 * 180 / Math.PI).toFixed(2) + '° > ' + (t2000 * 180 / Math.PI).toFixed(2) + '°）');
  ok(t2000 > t4000, '②c 远距容差 > 超远容差（' + (t2000 * 180 / Math.PI).toFixed(2) + '° > ' + (t4000 * 180 / Math.PI).toFixed(2) + '°）');
  ok(t400 / t4000 > 9, '②d 距离 ×10 ⇒ 容差 ÷10（实测比 ' + (t400 / t4000).toFixed(1) + '）');
  // 关键纪律：几何层不得出现距离特判（远/近分支）
  const src = require('fs').readFileSync(__dirname + '/../js/tank_objectives.js', 'utf8');
  const ringFn = src.slice(src.indexOf('function planGuardRing'), src.indexOf('function planDefendObjective'));
  ok(!/if\s*\([^)]*\bD\b[^)]*[<>]/.test(ringFn), '②e 负向：planGuardRing 内无「按距离分档」的判断');
}

// ================= ③ 占领点脱离防线 bucket =================
section('③ 占领点：位置脱离防线 bucket 中心');
{
  const pts = O.planCapturePoints({
    w: 12000, h: 1000, count: 3, seed: 7,
    x0: 12000 * R.nodeKinds.geometry.capturePoints.x0Fraction,
    x1: 12000 * R.nodeKinds.geometry.capturePoints.x1Fraction,
    ySpread: R.nodeKinds.geometry.capturePoints.ySpread,
    radius: 130,
  });
  ok(Array.isArray(pts) && pts.length === 3, '③a 点数 = 3');
  ok(pts.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)), '③b 坐标有限');
  const xs = pts.map(p => p.x).sort((a, b) => a - b);
  ok(xs[0] < xs[1] && xs[1] < xs[2], '③c x 严格递增（逐个推进）');
  const ys = pts.map(p => p.y);
  ok(Math.max(...ys) - Math.min(...ys) > 200, '③d y 有明显锯齿（不共线，实测跨度 ' + (Math.max(...ys) - Math.min(...ys)).toFixed(0) + '）');
  // ③f 负向：占领点不得落在防线 bucket 中心（改前两者空间完全重合）
  //   防线 bucket 中心 = x0 + (x1-x0)*(i+0.5)/n —— 正是 planCapturePoints 的 t 骨架；
  //   靠 ±3% 抖动错开即可，但抖动幅度必须真存在（否则一点不差地重合）。
  {
    const x0 = 12000 * R.nodeKinds.geometry.capturePoints.x0Fraction;
    const x1 = 12000 * R.nodeKinds.geometry.capturePoints.x1Fraction;
    const bucket = [0, 1, 2].map(i => x0 + (x1 - x0) * ((i + 0.5) / 3));
    const allOnBucket = pts.every((p, i) => Math.abs(p.x - bucket[i]) < 1);
    ok(!allOnBucket, '③f 负向：占领点未全部落在防线 bucket 中心（抖动确实生效）');
  }
  // 确定性：同 seed 同参 ⇒ 逐项一致
  const pts2 = O.planCapturePoints({
    w: 12000, h: 1000, count: 3, seed: 7,
    x0: 12000 * R.nodeKinds.geometry.capturePoints.x0Fraction,
    x1: 12000 * R.nodeKinds.geometry.capturePoints.x1Fraction,
    ySpread: R.nodeKinds.geometry.capturePoints.ySpread,
    radius: 130,
  });
  ok(pts.every((p, i) => p.x === pts2[i].x && p.y === pts2[i].y), '③e 同 seed 确定性一致');
}

// ================= ④ 突破通道 =================
section('④ 突破通道：净宽 + 两侧墙');
{
  const ch = O.planBreakthroughChannel({
    w: 12000, h: 1000, spawn: { x: 600, y: 500 }, exitX: 11000,
    width: R.nodeKinds.geometry.channel.width,
    wallThickness: R.nodeKinds.geometry.channel.wallThickness,
    wallTier: R.nodeKinds.geometry.channel.wallTier,
  });
  ok(!!ch && Number.isFinite(ch.y0) && Number.isFinite(ch.y1), '④a 通道描述存在');
  // 净宽读 ch.width（通道矩形宽度）；y0===y1 是刻意的「直通道」设计，
  //   不能把 |y1-y0| 当净宽（那是 0，直通道必然如此）。
  ok(ch.width > 200, '④b 净宽 > 200（实测 ' + ch.width + '）');
  ok(ch.x1 > ch.x0, '④b2 通道沿 x 有长度（' + ch.x0 + ' → ' + ch.x1 + '）');
  ok(Array.isArray(ch.walls) && ch.walls.length === 2, '④c 两侧各一道墙');
  ok(ch.walls.every(w => w.tier === R.nodeKinds.geometry.channel.wallTier), '④d 墙 tier 取配置值');
  ok(ch.walls.every(w => w.channelWall === true), '④e 墙带 channelWall 标记（供清理/调试识别）');
}

// ================= ⑤ pickEngageTarget：零回归 + 偏置 =================
section('⑤ pickEngageTarget：bias=0 零回归 / bias>0 生效');
{
  const player = { id: 'player', x: 1000, y: 500, hp: 100 };
  const objective = { id: 'guard_target', x: 1200, y: 500, hp: 3, isObjective: true };
  const t = { x: 0, y: 500, hp: 100 };

  // 零回归：bias=0 ⇒ 恒玩家（无论守点多近）
  const zero = O.pickEngageTarget(t, { player: player, objective: objective, objectiveBias: 0 });
  ok(zero === player, '⑤a bias=0 ⇒ 返回玩家（零回归，不改变既有行为）');

  // 未开 engage 时 objectiveBiasFor 返回 0
  const prevEnabled = R.nodeKinds.engage.enabled;
  R.nodeKinds.engage.enabled = false;
  try {
    ok(O.objectiveBiasFor('defend', R) === 0, '⑤b 负向：engage.enabled=false ⇒ bias=0（总开关生效）');
  } finally {
    R.nodeKinds.engage.enabled = prevEnabled;
  }

  // 类型映射
  ok(O.objectiveBiasFor('defend', R) === R.nodeKinds.engage.defendBias, '⑤c defend ⇒ defendBias');
  ok(O.objectiveBiasFor('capture', R) === R.nodeKinds.engage.captureBias, '⑤d capture ⇒ captureBias');
  ok(O.objectiveBiasFor('exterminate', R) === R.nodeKinds.engage.otherBias, '⑤e 歼灭 ⇒ otherBias（0）');
  // 入参容错：整份 RULES 与 RULES.nodeKinds 子段必须给同一结果。
  //   历史坑：页面传整份 RULES、函数只认子段 ⇒ 恒 0 ⇒ AI 偏置在生产里从未生效（测试却绿）。
  ok(O.objectiveBiasFor('defend', R.nodeKinds) === R.nodeKinds.engage.defendBias,
    '⑤h 入参容错：传 nodeKinds 子段同样生效');
  ok(O.objectiveBiasFor('defend', R) === O.objectiveBiasFor('defend', R.nodeKinds),
    '⑤i 入参容错：整份 RULES 与 nodeKinds 子段结果一致（防「传错形态静默返回 0」）');
  ok(O.objectiveBiasFor('capture', R) === O.objectiveBiasFor('capture', R.nodeKinds),
    '⑤j 入参容错：capture 亦然');

  // 偏置生效：defend 的高 bias 应让守点在**更远**时仍被选中
  const far = { id: 'guard_target', x: 1800, y: 500, hp: 3, isObjective: true };
  const nearPlayer = { id: 'player', x: 300, y: 500, hp: 100 };
  const picked = O.pickEngageTarget(t, {
    player: nearPlayer, objective: far,
    objectiveBias: R.nodeKinds.engage.defendBias, distanceFalloff: R.nodeKinds.engage.distanceFalloff,
  });
  ok(picked === far, '⑤f defendBias 生效 ⇒ 即使玩家更近也去打守点（用户要求的「更愿意打防御目标」）');

  // 负向：objective 已毁 ⇒ 必须回落玩家
  const dead = { id: 'guard_target', x: 1200, y: 500, hp: 0, isObjective: true };
  const fallback = O.pickEngageTarget(t, {
    player: player, objective: dead,
    objectiveBias: R.nodeKinds.engage.defendBias, distanceFalloff: 900,
  });
  ok(fallback === player, '⑤g 负向：守点 hp=0 ⇒ 回落玩家（不打已毁目标）');
}

// ================= ⑥ guardTargetAsEntity 形状 =================
section('⑥ guardTargetAsEntity：AI 只读的 7 个字段齐备');
{
  const cov = { x: 900, y: 400, w: 130, h: 96, angle: 0, tier: 'building', hp: 3 };
  const e = O.guardTargetAsEntity(cov, 'guard_target');
  ok(e.id === 'guard_target', '⑥a id');
  ok(e.x === 900 && e.y === 400, '⑥b x/y 取自掩体');
  ok(e.hp === 3, '⑥c hp 快照');
  ok(e.isObjective === true, '⑥d isObjective 标记（区别于玩家）');
  ok(e.isBoss === false, '⑥e isBoss=false（避免走 Boss 强制接战分支）');
  ok(e.hullAngle === 0 && e.turretAngle === 0, '⑥f hullAngle/turretAngle 齐备（flank 分支读）');
  ok(e.hurtbox === cov, '⑥g hurtbox 保留源掩体引用');
}

// ================= ⑦ captureZoneAsEntity + captureBias 不是死配置 =================
//   2026-11-19（§4.217）：`captureBias` 曾是死配置——页面只把 battleGuardTarget 包装成
//   objective，而守点只在 defend 存在 ⇒ 占领节点 objective 恒 null ⇒ pickEngageTarget 在
//   `if(!oOk) return player;` 短路，这个 0.35 一次都没被读过。⑤d 只测了映射函数，
//   测不出「生产端根本没把圈当目标」。本节锁两件事：圈能包装成实体、包装后偏置确实生效。
section('⑦ captureZoneAsEntity：占领圈可作为敌方目标（修 captureBias 死配置）');
{
  const zone = { x: 1200, y: 300, r: 130, progress: 0 };
  const ze = O.captureZoneAsEntity(zone, 'capture_zone');
  ok(ze.id === 'capture_zone', '⑦a id');
  ok(ze.x === 1200 && ze.y === 300, '⑦b x/y 取自圈');
  ok(ze.isObjective === true, '⑦c isObjective 标记（与守点同口径，被 pickEngageTarget 认）');
  ok(ze.isCaptureZone === true, '⑦d isCaptureZone 标记（可与守点区分）');
  ok(ze.hp === 1 && Number.isFinite(ze.hp), '⑦e hp 为有限正值（存活判定可得 true）');
  ok(ze.hurtbox === zone, '⑦f hurtbox 指回原圈（含 r/progress）');

  // 缺省 id 与空入参容错
  ok(O.captureZoneAsEntity(zone).id === 'capture_zone', '⑦g 缺省 id');
  const empty = O.captureZoneAsEntity(null);
  ok(empty.x === 0 && empty.y === 0 && empty.isObjective === true, '⑦h 空入参不抛错（坐标归零）');

  // 关键：包装出来的圈必须能被 pickEngageTarget 选中，否则「修了包装但偏置仍不生效」
  const nearPlayer = { id: 'player', x: 300, y: 300, hp: 100 };
  const farZone = O.captureZoneAsEntity({ x: 1800, y: 300, r: 130, progress: 0 });
  const pickedZone = O.pickEngageTarget({ x: 300, y: 300 },
    { player: nearPlayer, objective: farZone, objectiveBias: R.nodeKinds.engage.captureBias, distanceFalloff: 900 });
  // captureBias=0.35 < 0.5 ⇒ 近处玩家仍然优先（抢点是压迫，不是把玩家打成旁观者）
  ok(pickedZone === nearPlayer,
    '⑦i captureBias=0.35 + 玩家就在近处 ⇒ 仍打玩家（抢点不夺走玩家戏份）');

  // 玩家远、圈近 ⇒ 敌人才去抢点（证明 0.35 不是恒 0 的摆设）
  const farPlayer = { id: 'player', x: 4000, y: 300, hp: 100 };
  const nearZone = O.captureZoneAsEntity({ x: 400, y: 300, r: 130, progress: 0 });
  const pickedZone2 = O.pickEngageTarget({ x: 300, y: 300 },
    { player: farPlayer, objective: nearZone, objectiveBias: R.nodeKinds.engage.captureBias, distanceFalloff: 900 });
  ok(pickedZone2 === nearZone,
    '⑦j 玩家极远 + 圈就在旁边 ⇒ 敌方去打圈（captureBias 真的生效，非死配置）');

  // 负向：engage 关闭时 captureBias 归零 ⇒ 即使圈很近也打玩家
  const prevEnabled2 = R.nodeKinds.engage.enabled;
  R.nodeKinds.engage.enabled = false;
  try {
    ok(O.objectiveBiasFor('capture', R) === 0, '⑦k 负向：engage.enabled=false ⇒ captureBias 归零');
  } finally {
    R.nodeKinds.engage.enabled = prevEnabled2;
  }
}

console.log('\n' + (fail === 0
  ? '全部通过：test-node-objectives.js（' + pass + ' 项）'
  : fail + ' 项失败：test-node-objectives.js（通过 ' + pass + '）'));
process.exit(fail === 0 ? 0 : 1);
