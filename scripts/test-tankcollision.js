// 坦克⇄坦克碰撞回归测试（ISSUES #12：交叉鬼畜抖动 / 幽灵穿模 / 速度振荡）。
// 模拟 tank_mvp.html 主循环：driveTank → resolveTankCollisions。
// 运行：node scripts/test-tankcollision.js
'use strict';

const U = require('../js/tank_utils.js');
const R = require('../js/tank_rules.js');
global.TAU = U.TAU; global.norm = U.norm; global.rotate = U.rotate;
global.segRayIntersect = U.segRayIntersect; global.partCorners = U.partCorners;
global.partEdges = U.partEdges; global.reflectDir = U.reflectDir;
global.RULES = R.RULES;
global.HEIGHTS = require('../js/tank_geometry.js').HEIGHTS;
const CV = require('../js/tank_cover.js');
global.getCoverUnderTank = CV.getCoverUnderTank;
global.resolveCoverCollisions = CV.resolveCoverCollisions;
global.COVER_TIERS = CV.COVER_TIERS;
global.obbMTV = CV.obbMTV;
global.obbMTVs = CV.obbMTVs;
CV.covers.length = 0;   // 空战场，只测坦克⇄坦克
const MD = require('../js/tank_model.js');
global.makeTank = MD.makeTank;
global.debuffTurnRate = MD.debuffTurnRate;
global.debuffSpeedRate = MD.debuffSpeedRate;
global.normalizeBarrel = require('../js/tank_halfgeom.js').normalizeBarrel;
const EN = require('../js/tank_entity.js');
global.entities = EN.entities; global.spawnTank = EN.spawnTank;
global.advanceTracks = EN.advanceTracks; global.clamp = EN.clamp;
const MV = require('../js/tank_move.js');
global.driveTank = MV.driveTank;

const dt = 1/60;
const HL = 64, HW = 38;
let fails = 0;
function ok(cond, label){
  if(cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}`); fails++; }
}

function freshTank(id, x, y, hullAngle, team){
  const t = makeTank({ id, team, x, y, hullAngle, hullLen: HL, hullWid: HW,
    base: { maxSpeed: 120, turnRate: 2.0, enginePower: 900, weight: 300 } });
  EN.entities.push(t);
  return t;
}
function step(a, b){
  MV.driveTank(a, dt, { turn:0, move:1 });
  MV.driveTank(b, dt, { turn:0, move:1 });
}
function clear(){ EN.entities.length = 0; }
function speedCap(t){ return t.stats.maxSpeed * RULES.speed.pxFactor; }
// resolve 之后两车的真实残余重叠（SAT 投影深度；null=已分离→0）
function residualOverlap(a, b){
  const all = CV.obbMTVs(
    partCorners(a.x,a.y,a.hullAngle, a.hullLen/2, a.hullWid/2),
    partCorners(b.x,b.y,b.hullAngle, b.hullLen/2, b.hullWid/2));
  if(!all) return 0;
  let m = 0;
  for(const c of all) if(c.depth > m) m = c.depth;
  return m;
}

// 0) obbMTVs / obbMTV 一致性（obbMTV == 候选列表最小深度）
{
  const a = partCorners(600,320,0,HL/2,HW/2);
  const b = partCorners(600,320,Math.PI,HL/2,HW/2);
  const all = CV.obbMTVs(a,b);
  const single = CV.obbMTV(a,b);
  const minD = Math.min(...all.map(c=>c.depth));
  ok(all.length === 8 && single.depth === minD && Math.abs(single.dx) === 0 && Math.abs(single.dy) === 38,
    `obbMTVs 与 obbMTV 一致 (depth=${single.depth}, 候选=${all.length})`);
}

// 1) 对向互顶：A 向右、B 向左全速相撞 —— 不得穿模、推出轴稳定、速度有界
{
  clear();
  const A = freshTank('A1', 300, 320, 0, 'player');
  const B = freshTank('B1', 900, 320, Math.PI, 'enemy');
  let axisFlips = 0, lastAxis = null, sawContact = false;
  let maxResidual = 0, maxSpeed = 0, minGap = Infinity;
  for(let f=0; f<240; f++){
    step(A, B);
    const ax1 = A.x, ay1 = A.y, bx1 = B.x, by1 = B.y;
    EN.resolveTankCollisions();
    const pAx = A.x-ax1, pAy = A.y-ay1, pBx = B.x-bx1, pBy = B.y-by1;
    if(pAx||pAy||pBx||pBy){
      const horiz = Math.max(Math.abs(pAx), Math.abs(pBx)) > Math.max(Math.abs(pAy), Math.abs(pBy));
      const ux = horiz ? 'X' : 'Y';
      if(lastAxis && lastAxis !== ux) axisFlips++;
      lastAxis = ux;
      sawContact = true;
    }
    minGap = Math.min(minGap, Math.abs(A.x-B.x));
    maxResidual = Math.max(maxResidual, residualOverlap(A, B));
    maxSpeed = Math.max(maxSpeed, Math.abs(A.speed), Math.abs(B.speed));
  }
  ok(sawContact, '对向互顶：接触发生');
  ok(axisFlips <= 3, `对向互顶：推出轴稳定翻转≤3 (got ${axisFlips})`);
  ok(A.x < B.x, `对向互顶：未交换位置穿模 (A.x=${A.x.toFixed(0)} < B.x=${B.x.toFixed(0)})`);
  ok(maxResidual <= 0.6, `对向互顶：解析后无残余深叠 (max=${maxResidual.toFixed(2)}px)`);
  ok(minGap >= 64 - 0.6, `对向互顶：中心距保持车长余量 (min|Δx|=${minGap.toFixed(2)} ≥ 63.4)`);
  ok(maxSpeed <= speedCap(A) + 0.01, `对向互顶：速度不超上限 (max=${maxSpeed.toFixed(1)} cap=${speedCap(A)})`);
}

// 2) 垂直交叉：A 向右、B 向上，路径十字相交 —— 不得对穿、推出轴稳定
{
  clear();
  const A = freshTank('A2', 400, 320, 0, 'player');
  const B = freshTank('B2', 600, 460, -Math.PI/2, 'enemy');
  let axisFlips = 0, lastAxis = null, maxResidual = 0, maxSpeed = 0;
  for(let f=0; f<300; f++){
    step(A, B);
    const ax1 = A.x, ay1 = A.y, bx1 = B.x, by1 = B.y;
    EN.resolveTankCollisions();
    const pAx = A.x-ax1, pAy = A.y-ay1, pBx = B.x-bx1, pBy = B.y-by1;
    if(pAx||pAy||pBx||pBy){
      const horiz = Math.max(Math.abs(pAx), Math.abs(pBx)) > Math.max(Math.abs(pAy), Math.abs(pBy));
      const ux = horiz ? 'X' : 'Y';
      if(lastAxis && lastAxis !== ux) axisFlips++;
      lastAxis = ux;
    }
    maxResidual = Math.max(maxResidual, residualOverlap(A, B));
    maxSpeed = Math.max(maxSpeed, Math.abs(A.speed), Math.abs(B.speed));
  }
  ok(axisFlips <= 3, `交叉：推出轴稳定翻转≤3 (got ${axisFlips})`);
  ok(maxResidual <= 0.6, `交叉：无穿模/幽灵残留 (max residual=${maxResidual.toFixed(2)}px)`);
  ok(maxSpeed <= speedCap(A) + 0.01, `交叉：速度不超上限 (max=${maxSpeed.toFixed(1)})`);
}

// 3) 推挤：A 全速推向静止 B —— B 被推动前进，A 不穿模
{
  clear();
  const A = freshTank('A3', 300, 320, 0, 'player');
  const B = freshTank('B3', 700, 320, Math.PI, 'enemy');
  let maxResidual = 0;
  for(let f=0; f<150; f++){
    MV.driveTank(A, dt, { turn:0, move:1 });
    MV.driveTank(B, dt, { turn:0, move:0 });
    EN.resolveTankCollisions();
    maxResidual = Math.max(maxResidual, residualOverlap(A, B));
  }
  ok(B.x > 700 + 8, `推挤：B 被推动前进 (B.x=${B.x.toFixed(1)})`);
  ok(A.x < B.x, `推挤：A 未穿过 B (A.x=${A.x.toFixed(1)} < B.x=${B.x.toFixed(1)})`);
  ok(maxResidual <= 0.6, `推挤：过程中无深叠 (max=${maxResidual.toFixed(2)}px)`);
}

// 4) 对角交错（45°，最容易卡死/翻转的角碰）：不得深穿、残余重叠受控
{
  clear();
  const A = freshTank('A4', 400, 300, Math.PI/4, 'player');
  const B = freshTank('B4', 700, 340, Math.PI/4 + Math.PI, 'enemy');
  let maxResidual = 0;
  for(let f=0; f<300; f++){
    step(A, B);
    EN.resolveTankCollisions();
    maxResidual = Math.max(maxResidual, residualOverlap(A, B));
  }
  ok(maxResidual <= 0.6, `45° 斜交：无深穿残留 (max=${maxResidual.toFixed(2)}px)`);
}

// 5) 履带相位（ISSUES #14 回归）：driveTank 后 trackPhase 必须为有限数并随位移/转向累积
{
  clear();
  const A = freshTank('A5', 300, 320, 0, 'player');
  A.trackPhase = 0;
  MV.driveTank(A, dt, { turn:0, move:1 });
  ok(Number.isFinite(A.trackPhase) && A.trackPhase > 0,
    `履带相位有限且随行驶累积 (trackPhase=${A.trackPhase.toFixed(3)})`);
  const p1 = A.trackPhase;
  MV.driveTank(A, dt, { turn:1, move:0 });
  ok(Number.isFinite(A.trackPhase) && A.trackPhase > p1,
    `原地转向也推进履带相位 (${p1.toFixed(3)} -> ${A.trackPhase.toFixed(3)})`);
}

// 6) 移动散布源（ISSUES #15 回归）：motionSigma 传入 keys 时移动源生效，未传时无移动源
{
  const A = freshTank('player', 300, 320, 0, 'player');
  A.prevHullAngle = 0; A.prevTurretAngle = 0;
  const noKeys = MD.motionSigma(A, dt, undefined);
  const withKeys = MD.motionSigma(A, dt, { w:true });
  ok(Math.abs(withKeys - (RULES.spread.base + RULES.spread.moveMax)) < 1e-9,
    `传 keys（行进中）：sigma = base+moveMax (got ${withKeys.toFixed(4)})`);
  ok(Math.abs(noKeys - RULES.spread.base) < 1e-9,
    `不传 keys（静止）：sigma = base (got ${noKeys.toFixed(4)})`);
  ok(withKeys > noKeys, '移动源随 keys 生效（有 keys > 无 keys）');
}

console.log(fails ? `\n${fails} failure(s).` : '\nAll tank-collision checks passed.');
process.exitCode = fails ? 1 : 0;