// test-movement-braking.js — #AA4（2026-10-24 用户裁定「刹车是独立系统」）制动/滑行模型回归。
// 覆盖：① brake 与 enginePower/weight 脱钩 ② 泥潭/河流滑行距离不再按 1/passability 放大
// ③ 公路豁免同时豁免附着损失 ④ 地形减速乘子指数插值（进出地形不阶跃）⑤ 卡牌可改善制动
// ⑥ parameterLimits.brake 双向钳制（含「零制动 → 无限滑行」下限护栏）
// 运行：node scripts/test-movement-braking.js
'use strict';

const U = require('../js/tank_utils.js');
const R = require('../js/tank_rules.js');
global.TAU = U.TAU; global.norm = U.norm;
global.rotate = U.rotate; global.segRayIntersect = U.segRayIntersect;
global.partCorners = U.partCorners; global.partEdges = U.partEdges;
global.reflectDir = U.reflectDir;
global.RULES = R.RULES;
const CV = require('../js/tank_cover.js');
global.getCoverUnderTank = CV.getCoverUnderTank;
global.getRoadUnderTank = CV.getRoadUnderTank;
global.resolveCoverCollisions = CV.resolveCoverCollisions;
global.COVER_TIERS = CV.COVER_TIERS;
CV.covers.length = 0;
const MD = require('../js/tank_model.js');
global.makeTank = MD.makeTank;
global.debuffTurnRate = MD.debuffTurnRate;
global.debuffSpeedRate = MD.debuffSpeedRate;
const EN = require('../js/tank_entity.js');
global.entities = EN.entities;
global.advanceTracks = EN.advanceTracks;
global.clamp = EN.clamp;
const MV = require('../js/tank_move.js');

let fails = 0;
function ok(cond, label){
  if(cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}`); fails++; }
}

const dt = 1/60;
const BASE_BRAKE = R.RULES.speed.brakeBasePx;

function freshTank(id, over){
  const base = Object.assign({ maxSpeed: 120, turnRate: 2.0, enginePower: 900, weight: 300 }, over || {});
  return makeTank({ id, team: 'player', x: 400, y: 400, hullAngle: 0,
    hullLen: 64, hullWid: 38, base });
}

function clearCovers(){
  CV.covers.length = 0; CV.invalidateCoverGrid();
}
function putCover(tier){
  clearCovers();
  CV.covers.push({ x: 400, y: 400, w: 20000, h: 200, angle: 0, tier, hp: Infinity });
  CV.invalidateCoverGrid();
}

// 从 v0 松键滑行到静止，返回位移（px）
function coastDistance(t, v0, maxFrames){
  t.speed = v0;
  const x0 = t.x;
  let n = 0;
  while(Math.abs(t.speed) > 1e-6 && n < maxFrames){
    MV.driveTank(t, dt, { turn: 0, move: 0 });
    n++;
  }
  return { dist: Math.abs(t.x - x0), frames: n, stopped: Math.abs(t.speed) <= 1e-6 };
}

const V0 = 200;
const MAXF = 600;

// ---------- 1) brake 与马力脱钩（旧口径 brake = P/W × 15 × 2.2，dummy 只有 panzer-IV 的 1/3.2）----------
{
  clearCovers();
  const strong = freshTank('mb-strong', { enginePower: 2400, weight: 40 });   // P/W = 60
  const weak   = freshTank('mb-weak',   { enginePower: 300,  weight: 100 });  // P/W = 3
  ok(Math.abs(strong.stats.brake - BASE_BRAKE) < 1e-4 && Math.abs(weak.stats.brake - BASE_BRAKE) < 1e-4,
     `#AA4: 高低马力车 stats.brake 同为 brakeBasePx(${BASE_BRAKE})（strong=${strong.stats.brake}, weak=${weak.stats.brake}）`);
  ok(strong.stats.accel > weak.stats.accel * 5,
     `#AA4: accel 仍由 P/W 驱动（strong=${strong.stats.accel.toFixed(0)} vs weak=${weak.stats.accel.toFixed(0)}）`);
  const ds = coastDistance(strong, V0, MAXF);
  const dw = coastDistance(weak, V0, MAXF);
  ok(ds.stopped && dw.stopped, '#AA4: 两车均在限帧内停住');
  const ratio = dw.dist / ds.dist;
  ok(Math.abs(ratio - 1) < 0.02,
     `#AA4: 滑行距离不再随马力变化（strong=${ds.dist.toFixed(2)}px vs weak=${dw.dist.toFixed(2)}px，比值 ${ratio.toFixed(3)}）`);
}

// ---------- 2) 泥潭滑行距离不再按 1/passability 放大（旧口径 2.5×）----------
let normalDist = 0;
{
  clearCovers();
  const t = freshTank('mb-plain');
  const r = coastDistance(t, V0, MAXF);
  normalDist = r.dist;
  ok(r.stopped, `基准：普通地面滑行 ${r.dist.toFixed(2)}px（${r.frames} 帧）`);
}
{
  putCover('mud');
  const t = freshTank('mb-mud');
  ok(CV.getCoverUnderTank(t) && CV.getCoverUnderTank(t).tier === 'mud', '#AA4: mud 掩体命中');
  const r = coastDistance(t, V0, MAXF);
  const grip = R.RULES.coverTiers.mud.brakeGrip;
  const expect = 1 / grip;
  const ratio = r.dist / normalDist;
  ok(r.stopped, `#AA4: 泥潭中能停住（${r.dist.toFixed(2)}px，${r.frames} 帧）`);
  ok(Math.abs(ratio - expect) < 0.08,
     `#AA4: 泥潭滑行 = 普通地面 ÷ brakeGrip(=${grip}) = ${expect.toFixed(2)}×，实测 ${ratio.toFixed(2)}×（旧口径 2.5×）`);
  ok(ratio < 2.0, `#AA4: 泥潭滑行距离显著低于旧口径 2.5×（实测 ${ratio.toFixed(2)}×）`);
}
{
  putCover('river');
  const t = freshTank('mb-river');
  const r = coastDistance(t, V0, MAXF);
  const ratio = r.dist / normalDist;
  ok(Math.abs(ratio - 1 / R.RULES.coverTiers.river.brakeGrip) < 0.08,
     `#AA4: 河流滑行同泥潭口径（实测 ${ratio.toFixed(2)}×，期望 ${(1 / R.RULES.coverTiers.river.brakeGrip).toFixed(2)}×）`);
}

// ---------- 3) 公路豁免同时豁免附着损失（路面盖住河流 → 刹车恢复）----------
{
  clearCovers();
  CV.covers.push({ x: 400, y: 400, w: 20000, h: 200, angle: 0, tier: 'river', hp: Infinity });
  CV.covers.push({ x: 400, y: 400, w: 20000, h: 200, angle: 0, tier: 'road', hp: Infinity });
  CV.invalidateCoverGrid();
  const t = freshTank('mb-road');
  ok(!!CV.getRoadUnderTank(t), '#AA4: road 命中');
  const r = coastDistance(t, V0, MAXF);
  const ratio = r.dist / normalDist;
  ok(Math.abs(ratio - 1) < 0.05,
     `#AA4: 公路上 brakeGrip 归 1.0，滑行距离回到基准（实测 ${ratio.toFixed(3)}×）`);
}

// ---------- 4) 地形减速乘子指数插值：进出泥潭不阶跃，转向仍瞬时 ----------
{
  clearCovers();
  const t = freshTank('mb-lerp');
  for(let i = 0; i < 240; i++) MV.driveTank(t, dt, { turn: 0, move: 1 });   // 平地跑到接近极速
  ok(Math.abs(t.terrainMul - 1) < 1e-3, `#AA4: 平地 terrainMul 收敛 1.0（实测 ${t.terrainMul.toFixed(4)}）`);
  putCover('mud');
  MV.driveTank(t, dt, { turn: 0, move: 1 });
  const oneFrame = t.terrainMul;
  ok(oneFrame > 0.85,
     `#AA4: 驶入泥潭首帧 terrainMul 仍≈1（${oneFrame.toFixed(3)}），未阶跃到 0.4`);
  for(let i = 0; i < 60; i++) MV.driveTank(t, dt, { turn: 0, move: 1 });
  ok(Math.abs(t.terrainMul - R.RULES.coverTiers.mud.passability) < 0.02,
     `#AA4: 1s 后 terrainMul 收敛到 passability(${R.RULES.coverTiers.mud.passability})（实测 ${t.terrainMul.toFixed(3)}）`);
  // 转向不插值：同一帧内 turnModifier 立即取 passability
  clearCovers();
  const a = freshTank('mb-turn-plain');
  MV.driveTank(a, dt, { turn: 1, move: 1 });
  putCover('mud');
  const b2 = freshTank('mb-turn-mud');
  MV.driveTank(b2, dt, { turn: 1, move: 1 });
  ok(Math.abs(b2.hullAngle - a.hullAngle * R.RULES.coverTiers.mud.passability) < 1e-6,
     `#AA4: 转向瞬时生效（泥潭 ${b2.hullAngle.toFixed(6)} = 平地 ${a.hullAngle.toFixed(6)} × 0.4）`);
}

// ---------- 5) 卡牌可改善制动（stat:'brake' 修饰器经 computeStats 生效于 driveTank）----------
{
  clearCovers();
  const t = freshTank('mb-card');
  MD.addModifier(t, { stat: 'brake', mode: 'mult', value: 1.5, scope: 'run' });
  ok(Math.abs(t.stats.brake - BASE_BRAKE * 1.5) < 1e-4,
     `#AA4: 卡牌 ×1.5 后 stats.brake=${t.stats.brake.toFixed(1)}`);
  const r = coastDistance(t, V0, MAXF);
  const ratio = r.dist / normalDist;
  ok(Math.abs(ratio - 1 / 1.5) < 0.06,
     `#AA4: 制动 +50% ⇒ 滑行距离 ≈ 基准 ÷1.5（实测 ${ratio.toFixed(3)}×）`);
}

// ---------- 6) parameterLimits.brake 双向钳制（下限防「零制动 → 无限滑行」）----------
{
  clearCovers();
  const pL = R.RULES.parameterLimits.brake;
  const t = freshTank('mb-floor');
  MD.addModifier(t, { stat: 'brake', mode: 'mult', value: 0, scope: 'run' });   // 想清零制动
  ok(Math.abs(t.stats.brake - pL.min) < 1e-4,
     `#AA4: 制动清零被 parameterLimits.brake.min(${pL.min}) 拦住，实测 ${t.stats.brake}`);
  const r = coastDistance(t, V0, MAXF);
  ok(r.stopped && r.frames < MAXF,
     `#AA4: 最低制动仍能在限帧内停住（${r.frames} 帧，${r.dist.toFixed(2)}px）`);
}

clearCovers();
console.log('test-movement-braking: 完成所有检查');
if (fails === 0) console.log('test-movement-braking: 全部通过');
else console.error(`test-movement-braking: ${fails} 项失败`);
process.exit(fails === 0 ? 0 : 1);
