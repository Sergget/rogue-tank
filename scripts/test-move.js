// test-move.js — driveTank 倒车转向倒置开关（P-35）最小 Node 断言。
// 运行：node scripts/test-move.js
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
global.getRoadUnderTank = CV.getRoadUnderTank;   // #S4/#S14：driveTank 经本函数单独查询 road
global.resolveCoverCollisions = CV.resolveCoverCollisions;
global.COVER_TIERS = CV.COVER_TIERS;
CV.covers.length = 0;   // 空战场：无掩体干扰，只测运动学
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

function freshTank(id){
  return makeTank({ id, team: 'player', x: 400, y: 400, hullAngle: 0,
    hullLen: 64, hullWid: 38,
    base: { maxSpeed: 120, turnRate: 2.0, enginePower: 900, weight: 300 } });
}

const dt = 1/60;

// 1) 默认关闭：倒车（move<0）+ 转向 → 车头角与前进时同号（旧行为不变）
{
  const fwd = freshTank('mv-fwd'), rev = freshTank('mv-rev');
  MV.driveTank(fwd, dt, { turn: 1, move: 1 });
  MV.driveTank(rev, dt, { turn: 1, move: -1 });
  ok(Math.sign(rev.hullAngle) === Math.sign(fwd.hullAngle) && rev.hullAngle > 0,
     `默认关闭：turn 不随 move<0 翻转（fwd=${fwd.hullAngle.toFixed(5)}, rev=${rev.hullAngle.toFixed(5)}）`);
}

// 2) 显式开启 + move<0：turn 符号翻转
{
  const a = freshTank('mv-inv-on'), b = freshTank('mv-inv-off');
  const optsOn = { turn: 1, move: -1, invertTurnWhenReversing: true };
  MV.driveTank(a, dt, optsOn);
  MV.driveTank(b, dt, { turn: 1, move: -1 });   // 未开开关对照
  ok(a.hullAngle < 0 && Math.abs(a.hullAngle) > 0,
     `开启后倒车转向倒置：hullAngle=${a.hullAngle.toFixed(5)} < 0`);
  ok(Math.sign(a.hullAngle) === -Math.sign(b.hullAngle), '开启后与未开启方向相反（符号翻转）');
}

// 3) 开启但前进/停止：不受影响
{
  const t = freshTank('mv-inv-fwd');
  MV.driveTank(t, dt, { turn: 1, move: 1, invertTurnWhenReversing: true });
  ok(t.hullAngle > 0, '开启开关但前进：转向不翻转');
  const t2 = freshTank('mv-inv-stop');
  MV.driveTank(t2, dt, { turn: 1, move: 0, invertTurnWhenReversing: true });
  ok(t2.hullAngle > 0, '开启开关但原地转向（move=0）：不翻转');
}

// 4) 原地转向回归：trackPhase 保持有限数（ISSUES #14 回归护栏）
{
  const t = freshTank('mv-track');
  MV.driveTank(t, dt, { turn: 1, move: -1, invertTurnWhenReversing: true });
  ok(Number.isFinite(t.trackPhase), `trackPhase 为有限数（${t.trackPhase}）`);
}

// 5) #S4 + #S14（2026-10-14）：road 被 getCoverUnderTank 跳过，driveTank 改走
//    getRoadUnderTank 单独查询——公路加速生效，且道路屏蔽下层 river 减速。
{
  CV.covers.length = 0; CV.invalidateCoverGrid();
  CV.covers.push({ x: 400, y: 400, w: 20000, h: 100, angle: 0, tier: 'river', hp: Infinity });
  CV.covers.push({ x: 400, y: 400, w: 20000, h: 100, angle: 0, tier: 'road', hp: Infinity });
  const t = freshTank('mv-road');
  ok(CV.getRoadUnderTank(t) && CV.getRoadUnderTank(t).tier === 'road', '#S4: getRoadUnderTank 命中 road');
  ok(!CV.getCoverUnderTank(t) || CV.getCoverUnderTank(t).tier !== 'road', '#S4: getCoverUnderTank 仍跳过 road');
  for (let i = 0; i < 180; i++) MV.driveTank(t, dt, { turn: 0, move: 1 });
  const kmhFactor = (R.RULES.speed && R.RULES.speed.kmhFactor) || 0.4;
  const bonusPx = 10 / kmhFactor;
  ok(t.roadBonus > bonusPx * 0.9, `#S4: 公路加速生效（roadBonus=${t.roadBonus.toFixed(1)}≈${bonusPx.toFixed(1)}px/s）`);
  for (let i = 0; i < 600; i++) MV.driveTank(t, dt, { turn: 0, move: 1 });
  const vRoad = Math.abs(t.speed);
  // 对照：同位置纯 river（无 road）——速度应显著更低（0.4 减速）
  CV.covers.length = 0; CV.invalidateCoverGrid();
  CV.covers.push({ x: 400, y: 400, w: 20000, h: 100, angle: 0, tier: 'river', hp: Infinity });
  const t2 = freshTank('mv-river');
  for (let i = 0; i < 600; i++) MV.driveTank(t2, dt, { turn: 0, move: 1 });
  const vRiver = Math.abs(t2.speed);
  ok(vRoad > vRiver * 1.8, `#S14: 道路屏蔽 river 减速（road上 ${vRoad.toFixed(0)}px/s vs 纯river ${vRiver.toFixed(0)}px/s）`);
  CV.covers.length = 0; CV.invalidateCoverGrid();
}

console.log('test-move: 完成所有检查');
if (fails === 0) console.log('test-move: 全部通过');
else console.error(`test-move: ${fails} 项失败`);
process.exit(fails === 0 ? 0 : 1);
