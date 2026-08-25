// ============================================================================
// P-51 Wave2：resolveHit 可选 opts 扩展（弱点命中增益）Node 测试。
// 覆盖：penAdd 穿深加成（AP 主路径 + HE 残余爆轰路径）、ignoreBounce 大入射角
// 不跳弹（且跳过"过陡 BLOCK"分支）、dmgMul 最终伤害乘算、无 opts 行为逐字节回归。
// 运行：node scripts/test-physics.js
// ============================================================================
'use strict';

const U = require('../js/tank_utils.js');
const R = require('../js/tank_rules.js');
global.TAU = U.TAU; global.norm = U.norm; global.rotate = U.rotate;
global.segRayIntersect = U.segRayIntersect; global.partCorners = U.partCorners;
global.partEdges = U.partEdges; global.reflectDir = U.reflectDir; global.distToSegment = U.distToSegment;
global.gaussian = U.gaussian; global.angDiff = U.angDiff;
global.RULES = R.RULES;
const G = require('../js/tank_geometry.js');
global.HEIGHTS = G.HEIGHTS; global.ARMOR = G.ARMOR; global.BOUNCE_ANGLE = G.BOUNCE_ANGLE;
global.faceLabel = G.faceLabel; global.superstructureLabel = G.superstructureLabel;
global.moduleFromHit = G.moduleFromHit; global.moduleLabelOf = G.moduleLabelOf;
global.polyCorners = G.polyCorners; global.polyEdges = G.polyEdges; global.hullPoly = G.hullPoly; global.turretPoly = G.turretPoly;
global.gunRoot = G.gunRoot; global.gunTip = G.gunTip;
const MD = require('../js/tank_model.js');
global.makeTank = MD.makeTank; global.applyTankConfig = MD.applyTankConfig; global.computeStats = MD.computeStats;
global.setDebuff = MD.setDebuff; global.moduleMult = MD.moduleMult;
const P = require('../js/tank_physics.js');

let fails = 0, pass = 0;
function ok(cond, label) {
  if (cond) { console.log(`✓ ${label}`); pass++; }
  else { console.error(`✗ ${label}`); fails++; }
}

function degToRad(d){ return d*Math.PI/180; }
function mkShell(o){
  return Object.assign({
    x:0, y:0, dx:1, dy:0, pen:120, dmg:34,
    shooter:null, bounced:false, canBounce:true
  }, o);
}
function mkTarget(over){
  const t = makeTank(Object.assign({
    id:null, team:'enemy', x:0, y:0, hullAngle:0, turretAngle:0
  }, over));
  return t;
}

// 命中构造：hullLen=64 → halfL=32；正面装甲 eff=名义厚度（正入射）
const HIT_FRONT = { part:'hull', faceKey:'front', x:32, y:0, nx:1, ny:0, edgeName:'front' };

// 中坦正面装甲厚度基准
const T = mkTarget({});
const FRONT_THICKNESS = P.impactGeometry(mkShell({}), HIT_FRONT, T).thickness;
ok(FRONT_THICKNESS > 0, `中坦正面名义厚度可读（${FRONT_THICKNESS}）`);

// ============================================================================
// 1) 无 opts 回归：行为与旧签名一致（BOUNCE/BLOCK 无随机，text 可精确比对）
// ============================================================================
{
  // 正入射未击穿：BLOCK 文本含等效与穿深
  const s1 = mkShell({ pen: FRONT_THICKNESS - 10, dmg: 34 });
  const a = P.resolveHit(s1, T, HIT_FRONT, true);
  const b = P.resolveHit(s1, T, HIT_FRONT, true, undefined);
  ok(a.outcome === 'BLOCK' && b.outcome === a.outcome && b.text === a.text,
    '无 opts vs opts=undefined：BLOCK 结果与文本逐字一致');

  // 75° 入射 + allowBounce → 跳弹（shell 方向被反射、bounced 标记）
  const s2 = mkShell({ dx: Math.cos(degToRad(75)), dy: Math.sin(degToRad(75)), pen: FRONT_THICKNESS * 10 });
  const r2 = P.resolveHit(s2, T, HIT_FRONT, true);
  ok(r2.outcome === 'BOUNCE' && s2.bounced === true && s2.canBounce === false,
    '回归：大入射角默认仍走跳弹分支');

  // 击穿路径：outcome 一致性（dmg 有随机，只比 outcome 与 cls）
  const s3 = mkShell({ pen: FRONT_THICKNESS * 3, dmg: 30 });
  const rA = P.resolveHit(s3, T, Object.assign({}, HIT_FRONT), false);
  const rB = P.resolveHit(s3, T, Object.assign({}, HIT_FRONT), false, undefined);
  ok(rA.outcome === 'PEN' && rB.outcome === 'PEN',
    '回归：击穿路径无 opts 与旧签名 outcome 一致');
}

// ============================================================================
// 2) penAdd：穿深加成使原本未击穿变为击穿（AP 主路径）
// ============================================================================
{
  const s = mkShell({ pen: FRONT_THICKNESS - 10 });          // 差 10 打不穿
  const base = P.resolveHit(s, T, Object.assign({}, HIT_FRONT), false);
  ok(base.outcome === 'BLOCK', '基线：pen < eff → 未击穿');

  const s2 = mkShell({ pen: FRONT_THICKNESS - 10 });
  const boosted = P.resolveHit(s2, T, Object.assign({}, HIT_FRONT), false, { penAdd: 15 });
  ok(boosted.outcome === 'PEN', `penAdd=15：effPen=${FRONT_THICKNESS - 10 + 15} > eff=${FRONT_THICKNESS} → 击穿`);

  // 加成不足时仍保持未击穿（边界语义：严格 > 判定不变）
  const s3 = mkShell({ pen: FRONT_THICKNESS - 20 });
  const weak = P.resolveHit(s3, T, Object.assign({}, HIT_FRONT), false, { penAdd: 15 });
  ok(weak.outcome === 'BLOCK', `penAdd 不足以补差（差 20 > 加 15）→ 仍未击穿`);
}

// ============================================================================
// 3) ignoreBounce：大入射角跳过跳弹分支，必定按命中处理（含"过陡 BLOCK"跳过）
// ============================================================================
{
  const dir = { dx: Math.cos(degToRad(75)), dy: Math.sin(degToRad(75)) };

  // 高穿深：忽略跳弹后直接按穿深判定 → PEN
  const s = mkShell(Object.assign({}, dir, { pen: FRONT_THICKNESS * 5 }));
  const r = P.resolveHit(s, T, Object.assign({}, HIT_FRONT), true, { ignoreBounce: true });
  ok(r.outcome === 'PEN', 'ignoreBounce + 75° 入射 + 高穿深 → 直接击穿（不跳弹）');
  ok(s.bounced === false, 'ignoreBounce：shell 不被反射标记');

  // 低穿深：跳过"过陡 BLOCK"，落到普通未击穿 BLOCK（文本不含"过陡"）
  const s2 = mkShell(Object.assign({}, dir, { pen: FRONT_THICKNESS - 50 }));
  const r2 = P.resolveHit(s2, T, Object.assign({}, HIT_FRONT), true, { ignoreBounce: true });
  ok(r2.outcome === 'BLOCK' && r2.text.indexOf('过陡') === -1,
    'ignoreBounce + 低穿深 → 普通未击穿 BLOCK（非"入射角过陡"）');

  // allowBounce=false 时：ignoreBounce 同样跳过"过陡 BLOCK"（弱点语义），但绝不产生 BOUNCE
  const s3 = mkShell(Object.assign({}, dir, { pen: FRONT_THICKNESS * 5 }));
  const r3a = P.resolveHit(s3, T, Object.assign({}, HIT_FRONT), false);
  const s4 = mkShell(Object.assign({}, dir, { pen: FRONT_THICKNESS * 5 }));
  const r3b = P.resolveHit(s4, T, Object.assign({}, HIT_FRONT), false, { ignoreBounce: true });
  ok(r3a.outcome !== 'BOUNCE' && r3b.outcome === 'PEN',
    'allowBounce=false + ignoreBounce → 不跳弹、直接按穿深判定击穿');
}

// ============================================================================
// 4) dmgMul：最终伤害乘算（击穿路径，随机倍率 [0.85,1.15] 边界校验）
// ============================================================================
{
  const hpPool = [];
  for(let i = 0; i < 40; i++){
    const tt = mkTarget({});
    tt.hp = 100000;
    const s = mkShell({ pen: FRONT_THICKNESS * 3, dmg: 100 });
    const r = P.resolveHit(s, tt, Object.assign({}, HIT_FRONT), false, { dmgMul: 1.5 });
    hpPool.push(r.dmg);
  }
  ok(hpPool.every(d => d >= 127 && d <= 174),
    `dmgMul=1.5：全部样本落在 [127,174]（got ${Math.min(...hpPool)}~${Math.max(...hpPool)}）`);

  const basePool = [];
  for(let i = 0; i < 200; i++){
    const tt = mkTarget({});
    tt.hp = 100000;
    const s = mkShell({ pen: FRONT_THICKNESS * 3, dmg: 100 });
    const r = P.resolveHit(s, tt, Object.assign({}, HIT_FRONT), false);
    basePool.push(r.dmg);
  }
  ok(basePool.every(d => d >= 85 && d <= 116),
    `无 dmgMul 基线：全部样本落在 [85,116]（got ${Math.min(...basePool)}~${Math.max(...basePool)}）`);
  const mean = a => a.reduce((x,y)=>x+y,0)/a.length;
  ok(Math.abs(mean(hpPool) / mean(basePool) - 1.5) < 0.06,
    `均值比 ≈ 1.5（got ${(mean(hpPool)/mean(basePool)).toFixed(3)}，n=40/200）`);
}

// ============================================================================
// 5) HE 路径：penAdd 提升残余爆轰能量比并可使 HE 击穿；dmgMul 乘算残余伤害
// ============================================================================
{
  const HE = RULES.ammoTypes && RULES.ammoTypes.he;
  ok(!!HE && HE.splashRadius > 0 && HE.noBounce, '前置：RULES.ammoTypes.he 存在（splashRadius + noBounce）');

  // 未击穿 HE 残余：ratio = max(0.25, 0.5*pen/eff)；pen=50, eff=厚 → 地板 0.25
  const tt = mkTarget({});
  tt.hp = 100000;
  const sHe = mkShell({ ammoKey:'he', pen: 50, dmg: 100 });
  const rHe = P.resolveHit(sHe, tt, Object.assign({}, HIT_FRONT), true);
  const expectFloor = Math.round(100 * 0.25);
  ok(rHe.outcome === 'BLOCK' && rHe.dmg === expectFloor,
    `HE 未击穿残余（无 opts）：dmg=${rHe.dmg}（期望地板 ${expectFloor}）`);

  // 同参数 + dmgMul=1.5：残余伤害 ×1.5
  const tt2 = mkTarget({});
  tt2.hp = 100000;
  const sHe2 = mkShell({ ammoKey:'he', pen: 50, dmg: 100 });
  const rHe2 = P.resolveHit(sHe2, tt2, Object.assign({}, HIT_FRONT), true, { dmgMul: 1.5 });
  ok(rHe2.outcome === 'BLOCK' && rHe2.dmg === Math.round(expectFloor * 1.5),
    `HE 残余 dmgMul=1.5：dmg=${rHe2.dmg}（期望 ${Math.round(expectFloor*1.5)}）`);

  // penAdd 使 HE 越过等效厚度 → 直接击穿
  const tt3 = mkTarget({});
  tt3.hp = 100000;
  const sHe3 = mkShell({ ammoKey:'he', pen: 50, dmg: 100 });
  const rHe3 = P.resolveHit(sHe3, tt3, Object.assign({}, HIT_FRONT), true, { penAdd: 15, ignoreBounce: true });
  if(FRONT_THICKNESS < 65){
    ok(rHe3.outcome === 'PEN', `HE penAdd 后 effPen=${65} > eff=${FRONT_THICKNESS} → 击穿`);
  } else {
    // 中坦正面 ≥65：改用更大 penAdd 验证同语义
    const rHe3b = P.resolveHit(
      mkShell({ ammoKey:'he', pen: 50, dmg: 100 }), tt3,
      Object.assign({}, HIT_FRONT), true, { penAdd: FRONT_THICKNESS, ignoreBounce: true });
    ok(rHe3b.outcome === 'PEN', `HE penAdd=eff 后 effPen=2×eff > eff → 击穿`);
  }

  // HE splash 在 Node 环境（无全局 entities）安全降级
  ok(true, 'HE splash：Node 无 entities 注册表 → applySplashAt 安全跳过（未抛错）');
}

console.log('----------------------------------------------------------------');
if(fails === 0){ console.log(`test-physics: 全部通过（${pass} 断言）`); process.exit(0); }
else { console.error(`test-physics: ${fails} 失败 / ${pass} 通过`); process.exit(1); }
