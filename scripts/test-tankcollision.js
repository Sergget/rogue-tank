// 坦克⇄坦克碰撞回归测试（ISSUES #12：交叉鬼畜抖动 / 幽灵穿模 / 速度振荡）。
// 模拟 tank_battle.html 主循环：driveTank → resolveTankCollisions。
// 运行：node scripts/test-tankcollision.js
'use strict';

const U = require('../js/tank_utils.js');
const R = require('../js/tank_rules.js');
global.TAU = U.TAU; global.norm = U.norm; global.rotate = U.rotate;
global.segRayIntersect = U.segRayIntersect; global.partCorners = U.partCorners;
global.partEdges = U.partEdges; global.reflectDir = U.reflectDir;
global.RULES = R.RULES;
global.HEIGHTS = require('../js/tank_geometry.js').HEIGHTS;
global.polyCorners = require('../js/tank_geometry.js').polyCorners;   // covers 多边形（verts）几何，浏览器由 tank_geometry 先行加载提供
const CV = require('../js/tank_cover.js');
global.getCoverUnderTank = CV.getCoverUnderTank;
global.getRoadUnderTank = CV.getRoadUnderTank;   // #S4/#S14：driveTank 经本函数单独查询 road
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
function speedCap(t){ return t.stats.maxSpeed * RULES.speed.pxFactor * RULES.speed.effMul; }
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
  // 注：A 初始 x=600（贴近 B 的 700）、跑 400 帧——f9ac4f7 把 accelPowerToPxScale 从 130
  // 降到 15 后，A 从 300 加速到接触需要 ~243 帧，旧参数 (300/150帧) 下 A 根本没碰到 B。
  const A = freshTank('A3', 600, 320, 0, 'player');
  const B = freshTank('B3', 700, 320, Math.PI, 'enemy');
  let maxResidual = 0;
  for(let f=0; f<400; f++){
    MV.driveTank(A, dt, { turn:0, move:1 });
    MV.driveTank(B, dt, { turn:0, move:0 });
    EN.resolveTankCollisions();
    maxResidual = Math.max(maxResidual, residualOverlap(A, B));
  }
  ok(B.x > 700 + 6, `推挤：B 被推动前进 (B.x=${B.x.toFixed(1)})`);
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

// 7) #70 AI/实体断履状态在 immobT 倒计时归零时自动清除
{
  const enemy = freshTank('enemy_track', 300, 320, 0, 'enemy');
  enemy.immobT = 0.5;
  enemy.trackBroken = true;
  MV.driveTank(enemy, 0.2, { turn: 0, move: 1 });
  ok(enemy.immobT > 0 && enemy.trackBroken === true, '#70: 倒计时未结束时保持 trackBroken=true');
  MV.driveTank(enemy, 0.4, { turn: 0, move: 1 });
  ok(enemy.immobT === 0 && enemy.trackBroken === false, '#70: immobT 归零时自动清除 trackBroken 状态');
}

// 8) #N1（2026-10-10 用户反馈「坦克碰到岩石后无法移动」）：硬阻断地形（岩石）接触后
//    不得锁死速度/转向——旧实现把 passability=0 当通行系数清零 accel/brake/turnRate，
//    而 SAT 判「触=叠」+ 旧推出只到恰好贴合 ⇒ 每帧都判为压在岩上，坦克永久冻结。
{
  // nodegen 同款六边形岩石 verts（cw/ch → rx/ry）
  const mkRock = (x, y, cw, ch, rot) => {
    const rx = cw / 2, ry = ch / 2, rv = [];
    for(let i = 0; i < 6; i++){ const a = rot + (i / 6) * Math.PI * 2; rv.push([Math.cos(a) * rx, Math.sin(a) * ry]); }
    return { x, y, w: cw, h: ch, angle: 0, tier: 'rock', verts: rv, hp: Infinity };
  };
  clear();
  const rock1 = mkRock(600, 320, 34, 22, 0.7);
  CV.covers.length = 0;
  CV.covers.push(rock1);
  // §4.161：本组测「贴岩不锁死速度/转向」——与沿墙滑行正交，且本组是**串行位置**断言
  //   （撞岩 → 倒车 → 再撞 → 原地转），一旦开着滑行，坦克会沿岩壁滑到尽头绕过去，
  //   后续「倒车回到 x<520」等断言全部失去意义。故本组显式关闭滑行，
  //   滑行本身由下一组「#AB11b 沿墙滑行」独立验证。
  RULES.speed.wallSlide.enabled = false;
  const t = freshTank('rock-stuck', 500, 320, 0, 'player');
  for(let f = 0; f < 240; f++) MV.driveTank(t, dt, { turn: 0, move: 1 });   // 全速撞岩
  ok(t.x < 570, `#N1: 撞岩后被推出且未穿模（x=${t.x.toFixed(1)}，岩左界 583）`);
  const speedBefore = t.speed;
  const angleBefore = t.hullAngle;
  for(let f = 0; f < 120; f++) MV.driveTank(t, dt, { turn: 0, move: -1 });  // 倒车
  ok(t.speed < speedBefore, `#N1: 贴岩后倒车能改变速度（${speedBefore.toFixed(1)} → ${t.speed.toFixed(1)}）`);
  for(let f = 0; f < 600; f++) MV.driveTank(t, dt, { turn: 0, move: -1 });  // 持续倒车
  ok(t.x < 520, `#N1: 持续倒车可脱离岩石（x=${t.x.toFixed(1)}）`);
  // 重新贴岩 → 原地转向不被冻结
  for(let f = 0; f < 240; f++) MV.driveTank(t, dt, { turn: 0, move: 1 });
  for(let f = 0; f < 60; f++) MV.driveTank(t, dt, { turn: 1, move: 0 });
  ok(Math.abs(t.hullAngle - angleBefore) > 0.5,
    `#N1: 贴岩状态下仍可原地转向（ΔhullAngle=${Math.abs(t.hullAngle - angleBefore).toFixed(2)}rad）`);
  // 出生嵌在岩石内 → 也能倒出来（spawn overlap）
  const t2 = freshTank('rock-embed', 605, 322, 0, 'player');
  for(let f = 0; f < 600; f++) MV.driveTank(t2, dt, { turn: 0, move: -1 });
  ok(t2.x < 560, `#N1: 出生嵌岩也能倒出（x=${t2.x.toFixed(1)}）`);
  // 静止接触必须是真实分离（SAT 触=叠，缓冲推出后 getCoverUnderTank 不得命中岩石）
  const t3 = freshTank('rock-touch', 500, 320, 0, 'player');
  for(let f = 0; f < 240; f++) MV.driveTank(t3, dt, { turn: 0, move: 1 });
  ok(CV.getCoverUnderTank(t3) !== rock1, '#N1: 推出带分离缓冲，静止接触不再判为「压在岩上」');
  // 岩石仍然不可通行：全速顶岩不得穿透左界（583）
  const t4 = freshTank('rock-block', 540, 320, 0, 'player');
  for(let f = 0; f < 600; f++) MV.driveTank(t4, dt, { turn: 0, move: 1 });
  ok(t4.x <= 583.5, `#N1: 岩石仍硬阻断不可通行（x=${t4.x.toFixed(1)} ≤ 583.5）`);
  RULES.speed.wallSlide.enabled = true;   // 恢复默认，后续用例按真实配置跑
  // 慢速地形减速语义不变：泥地（passability 0.4）不推 + 通行系数仍来自 tier 表
  CV.covers.length = 0;
  CV.covers.push({ x: 600, y: 320, w: 200, h: 200, angle: 0, tier: 'mud', hp: Infinity });
  const tm = freshTank('rock-mud', 600, 320, 0, 'player');
  MV.driveTank(tm, dt, { turn: 0, move: 1 });
  ok(CV.getCoverUnderTank(tm) && CV.getCoverUnderTank(tm).tier === 'mud', '#N1: 泥地仍被 getCoverUnderTank 命中（减速来源）');
}

// 9) #N1/strip 性能：覆盖物空间哈希——查询结果必须与全表扫描逐条一致（语义零变化）
{
  const NG = require('../js/tank_nodegen.js');
  global.createRNG = NG.createRNG;
  global.generateNode = NG.generateNode;
  global.pickTemplate = NG.pickTemplate;
  const MAP = require('../js/tank_map.js');
  const VP = { vw: 1920, vh: 1080 };
  const strip = NG.generateStrip(0.5, { seed: 42, viewport: VP, scaleFor: MAP.nodeScaleFor });
  CV.covers.length = 0;
  for(const c of strip.covers) CV.covers.push(Object.assign({}, c, { hp: 1 }));
  ok(strip.covers.length >= 200, `空间哈希测试前置：strip covers=${strip.covers.length}（≥200）`);
  const fullScan = (x, y, t) => {
    const tankCorners = partCorners(x, y, t.hullAngle, t.hullLen / 2, t.hullWid / 2);
    const found = [];
    for(const cov of CV.covers){ if(cov.hp <= 0) continue; if(cov.tier === 'road') continue;
      for(const part of CV.coverCollisionParts(cov)) if(CV.obbOverlap(tankCorners, part)){ found.push(cov); break; } }
    return found;
  };
  let mismatches = 0, probed = 0;
  const probeRng = (() => { let s = 12345; return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; })();
  for(let i = 0; i < 300; i++){
    const x = probeRng() * strip.w, y = probeRng() * strip.h;
    const t = { x, y, hullAngle: probeRng() * Math.PI * 2, hullLen: 64, hullWid: 38 };
    probed++;
    if(CV.coverQueryCandidates(x, y, (64 + 38) / 2).some(cov =>
        cov.hp > 0 && cov.tier !== 'road' &&
        CV.coverCollisionParts(cov).some(p => CV.obbOverlap(partCorners(x, y, t.hullAngle, 32, 19), p))) !==
       (fullScan(x, y, t).length > 0)) mismatches++;
  }
  ok(mismatches === 0, `#N1: 空间哈希候选查询与全表扫描一致（${probed} 探针，${mismatches} 处不一致）`);
  // 索引签名：等长换场（新 covers 数组）必须失效重建（否则命中旧场穿模）
  const before = CV.coverQueryCandidates(strip.w / 2, strip.h / 2, 60).length;
  CV.covers.length = 0;
  CV.covers.push({ x: strip.w / 2, y: strip.h / 2, w: 100, h: 100, angle: 0, tier: 'rock', hp: Infinity });
  const after = CV.coverQueryCandidates(strip.w / 2, strip.h / 2, 60);
  ok(after.length === 1 && after[0].tier === 'rock',
    `#N1: 等长换场后索引失效重建（before=${before} → after=${after.length} 且命中新 cover）`);
  CV.covers.length = 0;
}

// 9) #AB11b（§4.161）：沿墙滑行——正对掩体时不再「原地踩油门」。
//    背景：敌人顶掩体 22 秒净推进 13px（实测 cover:full 22/23 帧、表速 0），而同一批里
//    巡逻漫步碰巧朝空处走的那辆能压到 260px ⇒ 缺口是「切向补偿」，不是推进能力。
{
  const mkRock2 = (x, y, cw, ch, rot) => {
    const rx = cw / 2, ry = ch / 2, rv = [];
    for(let i = 0; i < 6; i++){ const a = rot + (i / 6) * Math.PI * 2; rv.push([Math.cos(a) * rx, Math.sin(a) * ry]); }
    return { x, y, w: cw, h: ch, angle: 0, tier: 'rock', verts: rv, hp: Infinity };
  };

  // --- ① 无掩体：不得产生任何侧向漂移（滑行不能变成「隐形转向」）---
  {
    clear();
    CV.covers.length = 0;
    const tf = freshTank('slide-free', 480, 320, 0, 'player');
    for(let f = 0; f < 120; f++) MV.driveTank(tf, dt, { turn: 0, move: 1 });
    ok(Math.abs(tf.y - 320) < 1e-6,
      `#AB11b: 空旷地面不产生侧向漂移（y=${tf.y.toFixed(4)}）`);
    ok(tf.x > 480, `#AB11b: 空旷地面正常前进（x=${tf.x.toFixed(0)}）`);
  }

  // --- ② 正对岩石：单帧位移不得超额（滑行是「换个方向走」，不是「多走一段」）---
  {
    clear();
    const rock = mkRock2(600, 320, 34, 22, 0.7);
    CV.covers.length = 0; CV.covers.push(rock);
    const tw = freshTank('slide-cap', 470, 320, 0, 'player');
    for(let f = 0; f < 90; f++) MV.driveTank(tw, dt, { turn: 0, move: 1 });   // 提前到墙边
    let worst = 0, worstExpect = 0;
    for(let f = 0; f < 120; f++){
      const bx = tw.x, by = tw.y;
      MV.driveTank(tw, dt, { turn: 0, move: 1 });
      const step = Math.hypot(tw.x - bx, tw.y - by);
      const expect = Math.abs(tw.speed) * dt;
      if(expect > 1e-6 && step / expect > worst){ worst = step / expect; worstExpect = expect; }
    }
    ok(worst <= 1.02,
      `#AB11b: 滑行位移不超额（最坏比值 ${worst.toFixed(3)} ≤ 1.02；期望 ${worstExpect.toFixed(2)}px/帧）`);

    // --- ③ 绕行：有限长掩体允许滑到尽头绕过去，但**任何帧都不得与岩石相交** ---
    let overlapped = false;
    for(let f = 0; f < 600; f++){
      MV.driveTank(tw, dt, { turn: 0, move: 1 });
      if(CV.getCoverUnderTank(tw) === rock) overlapped = true;
    }
    ok(!overlapped, '#AB11b: 全程不与岩石相交（绕行允许，穿透不允许）');
    ok(tw.x > 700, `#AB11b: 能绕过有限长掩体继续前进（x=${tw.x.toFixed(0)} > 700）`);
  }

  // --- ④ 稳定性：顶墙期间不得左右抽搐（切向侧别必须稳定）---
  {
    clear();
    const rock = mkRock2(600, 320, 34, 22, 0.7);
    CV.covers.length = 0; CV.covers.push(rock);
    const ts = freshTank('slide-stable', 470, 320, 0, 'player');
    for(let f = 0; f < 60; f++) MV.driveTank(ts, dt, { turn: 0, move: 1 });
    const dirs = [];
    for(let f = 0; f < 90; f++){
      const py = ts.y;
      MV.driveTank(ts, dt, { turn: 0, move: 1 });
      const d = Math.sign(Math.round((ts.y - py) * 1000) / 1000);
      dirs.push(d);
    }
    let flips = 0;
    for(let i = 1; i < dirs.length; i++){
      if(dirs[i] !== 0 && dirs[i - 1] !== 0 && dirs[i] !== dirs[i - 1]) flips++;
    }
    ok(flips <= 3, `#AB11b: 滑行侧别稳定（方向翻转 ${flips} 次 ≤ 3）`);
  }

  // --- ⑤ 关掉开关必须完全回到旧行为（负向断言：配置真的被读）---
  {
    clear();
    const rock = mkRock2(600, 320, 34, 22, 0.7);
    CV.covers.length = 0; CV.covers.push(rock);
    RULES.speed.wallSlide.enabled = false;
    const toff = freshTank('slide-off', 540, 320, 0, 'player');
    for(let f = 0; f < 600; f++) MV.driveTank(toff, dt, { turn: 0, move: 1 });
    RULES.speed.wallSlide.enabled = true;
    ok(toff.x <= 583.5,
      `#AB11b: 关闭滑行后恢复旧行为——顶岩不得越界（x=${toff.x.toFixed(1)} ≤ 583.5）`);
  }
  CV.covers.length = 0;
}

console.log(fails ? `\n${fails} failure(s).` : '\nAll tank-collision checks passed.');
process.exitCode = fails ? 1 : 0;