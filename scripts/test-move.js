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

console.log('test-move: 完成所有检查');
if (fails === 0) console.log('test-move: 全部通过');
else console.error(`test-move: ${fails} 项失败`);
process.exit(fails === 0 ? 0 : 1);
