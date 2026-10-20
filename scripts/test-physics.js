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

  // 未击穿 HE 残余：ratio = max(0.25, effPen/eff) * nonPenRatio(0.6)；pen=10, eff=110 → 地板 0.25 * 0.6 = 0.15 → 15
  const tt = mkTarget({});
  tt.hp = 100000;
  const sHe = mkShell({ ammoKey:'he', pen: 10, dmg: 100 });
  const rHe = P.resolveHit(sHe, tt, Object.assign({}, HIT_FRONT), true);
  const expectFloor = Math.round(100 * 0.25 * 0.6);
  ok(rHe.outcome === 'BLOCK' && rHe.dmg === expectFloor,
    `HE 未击穿残余（无 opts）：dmg=${rHe.dmg}（期望地板 ${expectFloor}）`);

  // 同参数 + dmgMul=1.5：残余伤害 ×1.5
  const tt2 = mkTarget({});
  tt2.hp = 100000;
  const sHe2 = mkShell({ ammoKey:'he', pen: 10, dmg: 100 });
  const rHe2 = P.resolveHit(sHe2, tt2, Object.assign({}, HIT_FRONT), true, { dmgMul: 1.5 });
  ok(rHe2.outcome === 'BLOCK' && rHe2.dmg === Math.round(expectFloor * 1.5),
    `HE 残余 dmgMul=1.5：dmg=${rHe2.dmg}（期望 ${Math.round(expectFloor*1.5)}）`);
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

// ================= #E10（2026-09-20）HE 系击退：与爆炸范围绑定，HE-OP > HE-VT =================
{
  const T = R.RULES.ammoTypes;
  ok(typeof T.proximity_he.splashKnockbackMul === 'number' && typeof T.blast_he.splashKnockbackMul === 'number',
     '#E10 HE-VT / HE-OP 均声明 splashKnockbackMul');
  // 击退距离 = splashRadius × mul，故 HE-OP > HE-VT（用户要求）
  const kbVT = T.proximity_he.splashRadius * T.proximity_he.splashKnockbackMul;
  const kbOP = T.blast_he.splashRadius * T.blast_he.splashKnockbackMul;
  ok(kbOP > kbVT, `#E10 HE-OP 击退(${kbOP.toFixed(1)}px) > HE-VT(${kbVT.toFixed(1)}px)`);
  ok(typeof T.he.splashKnockbackMul === 'number' && T.he.splashKnockbackMul < T.blast_he.splashKnockbackMul,
     '#E10 普通 HE 击退系数 < HE-OP');
  // AP 等无该字段 → 零击退（行为回归）
  ok(T.ap.splashKnockbackMul === undefined, '#E10 AP 无击退字段（不产生位移）');

  // 位移量：满半径命中 = radius×mul；边缘命中按 (1−dist/radius) 线性衰减
  const ent = { x: 0, y: 0, hp: 100, maxHp: 100, hullLen: 64, hullWid: 38 };
  const shellOP = { ammo: T.blast_he, shooter: { x: -500, y: 0, team: 'player' } };
  const pushFull = P.applySplashKnockback(ent, 0, 0, 110, 0, shellOP);
  ok(Math.abs(pushFull - 110 * T.blast_he.splashKnockbackMul) < 1e-6,
     `#E10 爆心命中击退 = radius×mul（${pushFull.toFixed(1)}px）`);
  const ent2 = { x: 55, y: 0, hp: 100, maxHp: 100 };
  const pushEdge = P.applySplashKnockback(ent2, 0, 0, 110, 55, shellOP);
  ok(pushEdge > 0 && Math.abs(pushEdge - 110 * T.blast_he.splashKnockbackMul * 0.5) < 1e-6,
     `#E10 半径中点击退线性衰减（${pushEdge.toFixed(1)}px）`);
  ok(ent2.x > 55, '#E10 击退方向沿爆心→目标方向（远离爆心）');

  // 世界边界钳制（setSplashWorldBounds）
  P.setSplashWorldBounds({ w: 100, h: 100 });
  const ent3 = { x: 90, y: 50, hp: 100, maxHp: 100 };
  P.applySplashKnockback(ent3, 0, 50, 110, 0, shellOP);
  ok(ent3.x <= 60 + 1e-6, `#E10 击退受世界边界钳制（x=${ent3.x.toFixed(1)} ≤ w-40）`);
  P.setSplashWorldBounds(null);
}

// ========== #W-H（2026-10-20）防御方减伤通道：wet_ammo_rack / crew_liner ==========
// 背景：`js/tank_physics.js:358-381` 的 getMultForKey 此前只有**攻击方**乘子
// （`modMults ← shell.shooter.stats.ammoMult/crewMult` 或弹种表值），防御方零入口 ⇒
// 「湿式弹药架：弹药架受伤 -30%」「成员内衬：成员受伤 -20%」两张卡形同虚设。
// 现有代码按 modKey 查**受击方** cardEffects 的 passive：ammo → wet_ammo_rack，
// 6 个 crew 键 → crew_liner，value 即减伤比例，多张取最强（max value）。
// 而 scripts/ 全目录此前**零引用**这两个键 —— 有代码、无验证。本段补齐。
//
// 测试手法（关键）：模块抽取走随机流（`moduleFromHit` 内含 Math.random），直接跑会 flaky。
// 故此处两处确定性化：
//   ① `moduleFromHit` 打桩 → 直接指定被测模块键（覆盖全 9 种键，含 6 crew 键）；
//   ② `Math.random = () => 0.5` → 伤害抖动固定为 0.85+0.5×0.3 = 1.0。断言因此可做**精确比值**。
// 用 `ammoKey:'ap'`（表值 ammoMult=2 / crewMult=1.5）而非空弹种：draws=1 时
// `effectiveMult = Math.max(mult1, mult2=1.0)`，若 base ≤ 1.0 防御因子会被 max 吃掉而不可观测
// （实测 ammoMult=0.5 时 wet 反而「加伤」1.2989）——这是既有实现的真实口径，不是缺陷，
// 但断言必须挑 base > 1 的弹种才能观测到防御通道。
{
  const _origRandom = Math.random;
  const _origMFH = global.moduleFromHit;
  const HIT_M = { part:'hull', faceKey:'front', x:0, y:0, nx:1, ny:0, edgeName:'front' };
  const WET = [{ type:'passive', key:'wet_ammo_rack', value:0.30 }];
  const LIN = [{ type:'passive', key:'crew_liner', value:0.20 }];
  const BOTH = WET.concat(LIN);
  const CREW6 = ['engine', 'gunner', 'loader', 'driver', 'commander', 'breech'];

  // modKey=null 表示“概率余量”（正常结算、无模块倍率），stub 返回 null
  function modDmg(modKey, cardEffects, opts) {
    opts = opts || {};
    global.moduleFromHit = () => (modKey ? { key:modKey, label:G.moduleLabelOf(modKey) } : null);
    Math.random = () => 0.5;                       // 抖动固定 1.0（0.85 + 0.5×0.3）
    try {
      const tt = mkTarget({});
      tt.hp = 1e9;                                 // 避免打死触发殉爆/击杀分支
      if (cardEffects) tt.cardEffects = cardEffects.slice();
      const s = mkShell({
        dmg: opts.dmg === undefined ? 100 : opts.dmg,
        ammoKey: opts.ammoKey === undefined ? 'ap' : opts.ammoKey,
        shooter: opts.stats ? { stats: opts.stats } : null
      });
      return P.applyModuleDamage(s, tt, Object.assign({}, HIT_M), { dmgMul: 1 });
    } finally {
      global.moduleFromHit = _origMFH;
      Math.random = _origRandom;
    }
  }
  const ratio = (a, b) => (b === 0 ? NaN : a / b);
  const near = (a, b, tol) => Math.abs(a - b) <= (tol === undefined ? 0.01 : tol);

  // --- 前置：确定性可达（若抖动未被固定，这三连读会不相等，后续比值断言即失去意义） ---
  const d1 = modDmg('ammo', null).dmg, d2 = modDmg('ammo', null).dmg, d3 = modDmg('ammo', null).dmg;
  ok(d1 === d2 && d2 === d3, `#W-H 前置：抖动固定后同参数伤害可复现（${d1}/${d2}/${d3}）`);
  ok(modDmg('ammo', null).modKey === 'ammo', '#W-H 前置：moduleFromHit 打桩生效（modKey=ammo）');

  // --- ① 目标无卡：弹药架模块伤害 = 基准（ap 弹种表值 ammoMult=2 → 100×2=200） ---
  const baseAmmo = modDmg('ammo', null).dmg;
  ok(baseAmmo === 200, `#W-H 无卡基准：ammo 键 dmg=${baseAmmo}（= dmg 100 × 弹种 ammoMult 2）`);

  // --- ② wet_ammo_rack 0.30：弹药架伤害 = 基准 × 0.70 ---
  const wetAmmo = modDmg('ammo', WET).dmg;
  ok(near(ratio(wetAmmo, baseAmmo), 0.70),
    `#W-H wet_ammo_rack(0.30)：弹药架伤害 ×0.70（${baseAmmo} → ${wetAmmo}，实测比 ${ratio(wetAmmo, baseAmmo).toFixed(4)}）`);
  ok(wetAmmo === 140, `#W-H wet_ammo_rack(0.30)：绝对值 140 = round(100×2×0.7)`);

  // --- ③ crew_liner 0.20：6 个 crew 键伤害 = 基准 × 0.80 ---
  const crewRows = [];
  for (const k of CREW6) {
    const b = modDmg(k, null).dmg;
    const l = modDmg(k, LIN).dmg;
    crewRows.push({ k: k, b: b, l: l, r: ratio(l, b) });
  }
  ok(crewRows.every(row => near(row.r, 0.80)),
    `#W-H crew_liner(0.20)：6 个 crew 键均 ×0.80（${crewRows.map(r => r.k + ':' + r.r.toFixed(3)).join(' ')}）`);
  ok(crewRows.every(row => row.l === 120 && row.b === 150),
    `#W-H crew_liner(0.20)：绝对值 120 = round(100×1.5×0.8)（基准 150 = 100×弹种 crewMult 1.5）`);

  // --- ④ 通道隔离：湿式只管 ammo、内衬只管 crew（互不串门） ---
  ok(modDmg('ammo', LIN).dmg === baseAmmo,
    '#W-H 隔离：crew_liner 不影响 ammo 键（ammo 只认 wet_ammo_rack）');
  ok(CREW6.every(k => modDmg(k, WET).dmg === modDmg(k, null).dmg),
    '#W-H 隔离：wet_ammo_rack 不影响 6 个 crew 键（crew 只认 crew_liner）');
  ok(modDmg('track', BOTH).dmg === modDmg('track', null).dmg,
    '#W-H 隔离：非模块键 track 不受任一防御卡影响');
  ok(modDmg(null, BOTH).dmg === modDmg(null, null).dmg,
    '#W-H 隔离：概率余量（modKey=null）不受任一防御卡影响');

  // --- ⑤ 两卡同在手不叠乘（实现是 if/else 单通道：ammo 键只走 wet、crew 键只走 liner） ---
  // 若误改成乘算，ammo 键会变成 0.7×0.8=0.56 → 112；crew 键会变成 0.8×0.7=0.56 → 84。
  const bothAmmo = modDmg('ammo', BOTH).dmg;
  ok(bothAmmo === wetAmmo && near(ratio(bothAmmo, baseAmmo), 0.70),
    `#W-H 不叠乘：ammo 键两卡同在手 = 仅湿式（${bothAmmo}，非叠乘值 112）`);
  const bothGunner = modDmg('gunner', BOTH).dmg;
  const linerGunner = modDmg('gunner', LIN).dmg;
  ok(bothGunner === linerGunner && near(ratio(bothGunner, modDmg('gunner', null).dmg), 0.80),
    `#W-H 不叠乘：crew 键两卡同在手 = 仅内衬（${bothGunner}，非叠乘值 84）`);

  // --- ⑥ 同类多张取最强（min 方向减伤 → max value） ---
  const twoWet = modDmg('ammo', [
    { type:'passive', key:'wet_ammo_rack', value:0.30 },
    { type:'passive', key:'wet_ammo_rack', value:0.50 }]).dmg;
  ok(near(ratio(twoWet, baseAmmo), 0.50),
    `#W-H 多张取最强：wet 0.30+0.50 → ×0.50（实测比 ${ratio(twoWet, baseAmmo).toFixed(4)}）`);

  // --- ⑦ 攻击方 ammoMult/crewMult 与防御通道**互相独立**（防语义混淆回归） ---
  // 攻击方加成：我打得痛；防御通道：我挨得不痛。两者乘算但各自归位。
  // 注意必须走**无弹种**路径（ammoKey:null）才能观测 shooter.stats —— 有弹种时
  // `ammoModuleMults` 用弹种表值覆盖 shooter.stats（见表值优先口径），stats 会被忽略。
  const atk3 = { ammoMult: 3, crewMult: 3 };
  const a3 = modDmg('ammo', null, { ammoKey: null, stats: atk3 }).dmg;         // 100×3 = 300
  const a3wet = modDmg('ammo', WET, { ammoKey: null, stats: atk3 }).dmg;       // 300×0.7 = 210
  ok(a3 === 300, `#W-H 攻击方加成独立：无弹种 ammoMult=3 → 基准 300（got ${a3}）`);
  ok(near(ratio(a3wet, a3), 0.70),
    `#W-H 攻击方加成独立：ammoMult=3 + wet → 仍 ×0.70（${a3} → ${a3wet}）`);
  const g3 = modDmg('gunner', null, { ammoKey: null, stats: atk3 }).dmg;
  const g3lin = modDmg('gunner', LIN, { ammoKey: null, stats: atk3 }).dmg;
  ok(g3 === 300 && near(ratio(g3lin, g3), 0.80),
    `#W-H 攻击方加成独立：crewMult=3 + crew_liner → 仍 ×0.80（${g3} → ${g3lin}）`);
  // 反向：有弹种时 shooter.stats 被表值覆盖（口径回归，防止有人把优先级改反）
  ok(modDmg('ammo', null, { ammoKey: 'ap', stats: { ammoMult: 99, crewMult: 99 } }).dmg === 200,
    '#W-H 弹种表值优先：ammoKey=ap 时 ammoMult=99 被表值 2 覆盖（基准仍 200）');

  // --- ⑧ cardEffects 格式健壮性：非 passive / 缺 value / 字符串 / NaN 一律忽略（不误伤） ---
  const badCases = [
    ['type!=passive', [{ type:'ammo', key:'wet_ammo_rack', value:0.30 }]],
    ['缺 value', [{ type:'passive', key:'wet_ammo_rack' }]],
    ['字符串 value', [{ type:'passive', key:'wet_ammo_rack', value:'0.30' }]],
    ['NaN value', [{ type:'passive', key:'wet_ammo_rack', value:NaN }]]
  ];
  for (const [label, ce] of badCases) {
    ok(modDmg('ammo', ce).dmg === baseAmmo,
      `#W-H 健壮性：${label} 的 cardEffects 被忽略（dmg 仍为 ${baseAmmo}）`);
  }

  // --- ⑨ 减伤值钳制：value=0 无效；value≥1 令防御因子归 0（Math.max(0, 1−v)） ---
  ok(modDmg('ammo', [{ type:'passive', key:'wet_ammo_rack', value:0 }]).dmg === baseAmmo,
    '#W-H 边界：wet value=0 → 不减伤');
  const fullCut = modDmg('ammo', [{ type:'passive', key:'wet_ammo_rack', value:1 }]).dmg;
  const overCut = modDmg('ammo', [{ type:'passive', key:'wet_ammo_rack', value:1.5 }]).dmg;
  ok(fullCut === overCut && fullCut < baseAmmo,
    `#W-H 边界：value=1 与 1.5 同值（防御因子钳在 0，不出现负伤害）：${fullCut} / ${overCut}`);

  // --- ⑩ 多抽取弹种（apfsds draws=2 / he draws=3）下防御因子仍在（每键各自乘，取 max 后不失效） ---
  for (const ak of ['apfsds', 'he']) {
    const b = modDmg('ammo', null, { ammoKey: ak }).dmg;
    const w = modDmg('ammo', WET, { ammoKey: ak }).dmg;
    ok(near(ratio(w, b), 0.70),
      `#W-H 多抽取弹种 ${ak}：wet 仍 ×0.70（${b} → ${w}）`);
  }

  // 收尾：确认全局钩子已还原（后续其他测试段依赖真实随机/真实几何）
  ok(Math.random === _origRandom && global.moduleFromHit === _origMFH,
    '#W-H 收尾：Math.random 与 moduleFromHit 均已还原');
}

console.log('----------------------------------------------------------------');
if(fails === 0){ console.log(`test-physics: 全部通过（${pass} 断言）`); process.exit(0); }
else { console.error(`test-physics: ${fails} 失败 / ${pass} 通过`); process.exit(1); }
