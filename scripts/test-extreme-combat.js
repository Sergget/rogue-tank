// ============================================================================
// 战斗/物理子系统「极端但合法」压力测试（EXTREME-BUT-VALID）。
// 覆盖 js/tank_physics.js（impactGeometry / resolveHit / applyModuleDamage）
// 在极端角度、极端装甲厚度、极端穿深/伤害/HP、模块致命效果、无敌与边界值下
// 的行为。全部使用合法输入（不做 0 宽/0 长车体炮塔——那属不合理数据，已按
// 用户要求排除），断言与代码逐行一致（严格 > 判定、Math.round 取整、随机
// 倍率 [0.85,1.15] 的边界都用上下界校验）。
// 运行：node scripts/test-extreme-combat.js
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
// P 导出：reflectDir / impactGeometry / resolveHit / applyModuleDamage

let fails = 0;
function ok(cond, label) {
  if (cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}`); fails++; }
}

// ---------- 辅助：极端测试专用构造（不引入 0 宽/0 长几何） ----------
function degToRad(d){ return d*Math.PI/180; }
function mkShell(o){
  return Object.assign({
    x:0, y:0, dx:1, dy:0, pen:120, dmg:34,
    shooter:null, bounced:false, canBounce:true
  }, o);
}
function mkTarget(over){
  return makeTank(Object.assign({
    id:null, team:'enemy', x:0, y:0, hullAngle:0, turretAngle:0
  }, over));
}
// 命中构造（部分部位可换弹道方向）：hullLen=64 → halfL=32
const HIT_FRONT = { part:'hull', faceKey:'front', x:32, y:0, nx:1, ny:0, edgeName:'front' };
const HIT_REAR  = { part:'hull', faceKey:'rear',  x:-32, y:0, nx:-1, ny:0, edgeName:'rear' };
const HIT_AMMO_SIDE = { part:'hull', faceKey:'side', x:10, y:-10, nx:1, ny:0, edgeName:'side' };  // P-49: t=(41.5−10)/73.5≈0.43 ∈ 弹药段 [0.1,0.5)
// P-49 概率分区：模块命中改为区内随机抽取 → 用固定值替换 Math.random 保证断言确定性
//（0.2=弹药段抽中 ammo / 0.1=发动机段抽中 engine / 0.9=任何区均落余量 null）
function withDice(v, fn){ const orig = Math.random; Math.random = () => v; try { return fn(); } finally { Math.random = orig; } }
const HIT_TRACK_SIDE = { part:'hull', faceKey:'side', x:31, y:0, nx:1, ny:0, edgeName:'side' };   // |rx|=0.969>0.78 → 履带

// ============================================================================
// 0) 常量一致性：极端用例建立在正确的机制常量上
// ============================================================================
ok(BOUNCE_ANGLE === RULES.ballistics.bounceAngle, 'BOUNCE_ANGLE 常量与 RULES.ballistics.bounceAngle 同源');
ok(Math.abs(BOUNCE_ANGLE - 70*Math.PI/180) < 1e-15, 'BOUNCE_ANGLE = 70°（跳弹阈值）');
ok(HEIGHTS.medium.hull === RULES.heights.medium.hull && HEIGHTS.heavy.turret === RULES.heights.heavy.turret,
  'HEIGHTS 与 RULES.heights 同源');

// ============================================================================
// 1) impactGeometry 极端角度：正入射 → 等效厚度≈名义厚度；擦过跳弹角（69.9°）
//    → 厚度/cos(θ) 的巨大放大；θ 单调性
// ============================================================================
{
  const t = mkTarget({});
  const g0 = P.impactGeometry(mkShell({ dx:1, dy:0 }), HIT_FRONT, t);
  ok(Math.abs(g0.theta) < 1e-12 && Math.abs(g0.eff - 110) < 1e-9,
    `θ≈0°（正入射）：theta=0、eff=名义厚度 110（got eff=${g0.eff})`);
  const g2 = P.impactGeometry(mkShell({ dx:Math.cos(degToRad(2)), dy:Math.sin(degToRad(2)) }), HIT_FRONT, t);
  ok(Math.abs(g2.theta - degToRad(2)) < 1e-12 && Math.abs(g2.eff - 110/Math.cos(degToRad(2))) < 1e-6,
    `θ=2°（近正入射）：eff≈厚度/cos(2°)≈110.07（got ${g2.eff.toFixed(3)}）`);
  const g69 = P.impactGeometry(mkShell({ dx:Math.cos(degToRad(69.9)), dy:Math.sin(degToRad(69.9)) }), HIT_FRONT, t);
  ok(Math.abs(g69.eff - 110/Math.cos(degToRad(69.9))) < 1e-3,
    `θ=69.9°（跳弹角下缘擦边）：eff≈厚度/cos(θ)≈320（got ${g69.eff.toFixed(2)}）`);
  ok(g69.eff > 300 && g69.eff < 340, '擦过角度 → 等效厚度放大约 2.9 倍（未达跳弹角）');
  let prevEff = -Infinity;
  for(const a of [0, 30, 45, 60, 69.9]){
    const g = P.impactGeometry(mkShell({ dx:Math.cos(degToRad(a)), dy:Math.sin(degToRad(a)) }), HIT_FRONT, t);
    ok(g.eff > prevEff, `θ 单调递增: θ=${a}° eff=${g.eff.toFixed(3)} > 前值 ${prevEff.toFixed(3)}`);
    prevEff = g.eff;
  }
}

// ============================================================================
// 2) impactGeometry 极端装甲厚度：1 / 1000 / 1e6 下 θ=0 与 θ=60° 的等效厚度
// ============================================================================
{
  for(const T of [1, 1000, 1e6]){
    const t = mkTarget({ base: { armor: { hull:{front:T, side:38, rear:26}, turret:{front:140, side:50, rear:24} } } });
    const g0 = P.impactGeometry(mkShell({ dx:1, dy:0 }), HIT_FRONT, t);
    ok(Math.abs(g0.eff - T) < 1e-6*Math.max(1,T), `厚度=${T}: θ=0 → eff=厚度（got ${g0.eff}）`);
    const g60 = P.impactGeometry(mkShell({ dx:Math.cos(degToRad(60)), dy:Math.sin(degToRad(60)) }), HIT_FRONT, t);
    ok(Math.abs(g60.eff - T/Math.cos(degToRad(60))) < 1e-6*T,
      `厚度=${T}: θ=60° → eff=厚度/cos(60°)=2×厚度（got ${g60.eff.toFixed(2)}）`);
  }
}

// ============================================================================
// 3) resolveHit 角度 BLOCK：θ 刚过 70° 且 allowBounce=false → BLOCK（不跳弹）
// ============================================================================
{
  const res = P.resolveHit(mkShell({ dx:Math.cos(degToRad(70.5)), dy:Math.sin(degToRad(70.5)), pen:1e9 }),
    mkTarget({}), HIT_FRONT, false);
  ok(res.outcome === 'BLOCK' && res.cls === 'BLOCK',
    'θ=70.5°>70° 且 allowBounce=false → BLOCK（过陡未击穿，不跳弹）');
  ok(res.text.indexOf('未击穿') >= 0, 'BLOCK 文案含「未击穿」');
  ok(res.part === 'hull' && res.faceKey === 'front' && res.hitPoint.x === HIT_FRONT.x, 'BLOCK 记录命中部位与命中点');
}

// ============================================================================
// 4) resolveHit BOUNCE：θ>70° 且 allowBounce=true → 反射方向/位置/bounced 标记
// ============================================================================
{
  const t = mkTarget({});
  const sh = mkShell({ dx:Math.cos(degToRad(70.5)), dy:Math.sin(degToRad(70.5)), pen:1e9 });
  const res = P.resolveHit(sh, t, HIT_FRONT, true);
  ok(res.outcome === 'BOUNCE' && res.cls === 'BOUNCE', 'θ=70.5° + allowBounce → BOUNCE');
  const r = P.reflectDir(Math.cos(degToRad(70.5)), Math.sin(degToRad(70.5)), HIT_FRONT.nx, HIT_FRONT.ny);
  ok(Math.abs(sh.dx - r.x) < 1e-9 && Math.abs(sh.dy - r.y) < 1e-9, '跳弹后 shell.dx/dy = 反射方向');
  ok(Math.abs(sh.dx + Math.cos(degToRad(70.5))) < 1e-12 && Math.abs(sh.dy - Math.sin(degToRad(70.5))) < 1e-12,
    '法线(1,0) 反射：x 分量反号、y 分量不变');
  ok(sh.bounced === true, 'shell.bounced=true');
  ok(sh.canBounce === false, 'shell.canBounce=false（禁二次跳弹标记）');
  ok(sh.x === HIT_FRONT.x && sh.y === HIT_FRONT.y, '跳弹后 shell 停靠命中点');
  ok(res.hitPoint.x === HIT_FRONT.x && res.hitPoint.y === HIT_FRONT.y, 'hitPoint 记录命中点');
  ok(Math.abs(res.bounceAngle - Math.atan2(sh.dy, sh.dx)) < 1e-12, 'bounceAngle 与反射后航向一致');
}

// ============================================================================
// 5) 反射对合 + 二次跳弹行为：reflectDir 两次=原方向；resolveHit 只查 allowBounce
//    形参（canBounce 由调用方 tank_mvp.html:919 传 s.canBounce 控制）
// ============================================================================
{
  const n = { x:1, y:0 };
  const d0 = { x:Math.cos(degToRad(63)), y:Math.sin(degToRad(63)) };
  const r1 = P.reflectDir(d0.x, d0.y, n.x, n.y);
  const r2 = P.reflectDir(r1.x, r1.y, n.x, n.y);
  ok(Math.abs(r2.x-d0.x) < 1e-12 && Math.abs(r2.y-d0.y) < 1e-12, '反射两次 = 原方向（对合，轴法线）');
  const n2 = { x:Math.cos(degToRad(40)), y:Math.sin(degToRad(40)) };
  const s1 = P.reflectDir(d0.x, d0.y, n2.x, n2.y);
  const s2 = P.reflectDir(s1.x, s1.y, n2.x, n2.y);
  ok(Math.abs(s2.x-d0.x) < 1e-12 && Math.abs(s2.y-d0.y) < 1e-12, '反射两次 = 原方向（斜法线）');
  const sh = mkShell({ dx:Math.cos(degToRad(72)), dy:Math.sin(degToRad(72)), pen:1e9 });
  const first = P.resolveHit(sh, mkTarget({}), HIT_FRONT, true);
  ok(first.outcome === 'BOUNCE' && sh.canBounce === false, '第一次 θ=72° → 跳弹且 canBounce=false');
  const second = P.resolveHit(sh, mkTarget({}), HIT_FRONT, true);
  ok(second.outcome === 'BOUNCE',
    'canBounce=false 后仍传 allowBounce=true → 仍跳弹（防二次跳弹由调用方按 canBounce 传参实现，非函数内检查）');
}

// ============================================================================
// 6) 穿深边界 + 极端穿深：eff==pen 精确相等（θ=0）→ PEN（严格 > 才 BLOCK）；
//    eff 略超 pen → BLOCK；pen=0 / 1e9 / NaN
// ============================================================================
{
  const resEq = P.resolveHit(mkShell({ dx:1, dy:0, pen:110, dmg:1 }), mkTarget({}), HIT_FRONT, true);
  ok(resEq.outcome === 'PEN', 'eff==pen 精确相等（θ=0: eff=110=pen）→ PEN（判定为严格 >）');
  const resOv = P.resolveHit(mkShell({ dx:1, dy:0, pen:109 }), mkTarget({}), HIT_FRONT, true);
  ok(resOv.outcome === 'BLOCK' && resOv.cls === 'BLOCK', 'eff(110) 略大于 pen(109) → BLOCK');
  const res0 = P.resolveHit(mkShell({ dx:1, dy:0, pen:0 }), mkTarget({}), HIT_FRONT, true);
  ok(res0.outcome === 'BLOCK', 'pen=0 → 任何正等效厚度都 BLOCK');
  const resBig = P.resolveHit(mkShell({ dx:1, dy:0, pen:1e9, dmg:1 }), mkTarget({}), HIT_FRONT, true);
  ok(resBig.outcome === 'PEN', 'pen=1e9 → 必击穿 PEN');
  let threw = false, resNaN = null;
  try { resNaN = P.resolveHit(mkShell({ dx:1, dy:0, pen:NaN, dmg:1 }), mkTarget({}), HIT_FRONT, true); }
  catch(e){ threw = true; }
  ok(!threw && resNaN && typeof resNaN.outcome === 'string',
    'pen=NaN → 不崩溃（NaN 比较恒 false 落入击穿分支，鲁棒性守卫；NaN 属非法输入）');
}

// ============================================================================
// 7) 极端伤害：dmg=1e9 击杀（hp 钳 0）、弹药架殉爆、dmg=0 / dmg=0.001 不扣血
// ============================================================================
{
  const tK = mkTarget({});
  const resK = withDice(0.9, () => P.resolveHit(mkShell({ dx:1, dy:0, pen:200, dmg:1e9 }), tK, HIT_FRONT, true));
  ok(resK.outcome === 'PEN', 'dmg=1e9 击穿');
  ok(tK.hp === 0, 'dmg=1e9 → hp 钳制到 0（击杀）');
  ok(tK.ammoBlew === false, '车体正面击杀（余量无模块）→ 不殉爆');

  const tA = mkTarget({});
  const resA = withDice(0.2, () => P.resolveHit(mkShell({ dx:1, dy:0, pen:200, dmg:1e9 }), tA, HIT_AMMO_SIDE, true));
  ok(tA.hp === 0 && tA.ammoBlew === true, '弹药架致命命中 → ammoBlew=true');
  ok(tA.fireT === RULES.fire.fireVisualSeconds, '殉爆 → fireT=视觉燃烟时长');
  ok(tA.blowHitPoint && tA.blowHitPoint.x === 10 && tA.blowHitPoint.y === -10, '殉爆点记录命中点');
  ok(resA.cls === 'CRIT', '殉爆 → cls=CRIT');

  const t0 = mkTarget({});
  withDice(0.9, () => P.resolveHit(mkShell({ dx:1, dy:0, pen:200, dmg:0 }), t0, HIT_FRONT, true));
  ok(t0.hp === 100, 'dmg=0 → hp 不变');
  const tT = mkTarget({});
  withDice(0.9, () => P.resolveHit(mkShell({ dx:1, dy:0, pen:200, dmg:0.001 }), tT, HIT_FRONT, true));
  ok(tT.hp === tT.maxHp, 'dmg=0.001 → Math.round 取整为 0 → hp 不变');
}

// ============================================================================
// 8) 模块伤害极端：履带断（immobT=trackLock）、发动机起火（DOT/fireT/debuff）、
//    弹药架致死殉爆、弹药架未死 debuff
// ============================================================================
{
  const tTr = mkTarget({});
  const resTr = P.resolveHit(mkShell({ dx:1, dy:0, pen:200, dmg:10 }), tTr, HIT_TRACK_SIDE, true);
  ok(resTr.outcome === 'PEN' && tTr.trackBroken === true, '履带命中 → trackBroken=true');
  ok(tTr.immobT === tTr.stats.trackLock && tTr.immobT === RULES.modules.trackLockDefault,
    `履带锁定 immobT=${tTr.immobT}s = trackLock（默认 ${RULES.modules.trackLockDefault}s）`);
  ok(tTr.trackFxPoint && tTr.trackFxPoint.x === 31, '履带断点记录');

  const tEn = mkTarget({});
  const shEn = mkShell({ dx:-1, dy:0, pen:200, dmg:34, shooter:mkTarget({ team:'player' }) });
  const resEn = withDice(0.1, () => P.resolveHit(shEn, tEn, HIT_REAR, true)); // 后部面 t=1 ∈ 发动机段 [0.5,1]，0.1<0.40 抽中 engine
  ok(resEn.outcome === 'PEN', '发动机命中（车体后部）→ 击穿');
  ok(tEn.dotDps > 0 && tEn.dotSeconds === RULES.fire.dotSeconds,
    `发动机起火 DOT: dps=${tEn.dotDps.toFixed(2)}>0、dotSeconds=${tEn.dotSeconds}s=${RULES.fire.dotSeconds}`);
  ok(tEn.dotT === tEn.dotSeconds && tEn.fireT === RULES.fire.fireVisualSeconds, 'dotT/fireT 计时器设置');
  ok(tEn.debuffs.engine === RULES.modules.debuffSeconds, '发动机未死 → engine debuff 8s');

  const tAk = mkTarget({ base: { maxHp: 10 } });
  const resAk = withDice(0.2, () => P.resolveHit(mkShell({ dx:1, dy:0, pen:200, dmg:34 }), tAk, HIT_AMMO_SIDE, true));
  ok(tAk.hp === 0 && tAk.ammoBlew === true, '低血量（maxHp=10）弹药架致命 → 殉爆');

  const tAm = mkTarget({ base: { maxHp: 1e6 } });
  withDice(0.2, () => P.resolveHit(mkShell({ dx:1, dy:0, pen:200, dmg:10 }), tAm, HIT_AMMO_SIDE, true));
  ok(tAm.debuffs.ammo === RULES.modules.debuffSeconds && tAm.ammoBlew === false,
    '弹药架未死 → ammo debuff 8s、不殉爆');
}

// ============================================================================
// 9) 无敌：target.invuln=true → 掉血 0、hp 不变、结果 cls='PEN'
// ============================================================================
{
  const tI = mkTarget({ invuln: true });
  const hp0 = tI.hp;
  const resI = P.resolveHit(mkShell({ dx:1, dy:0, pen:200, dmg:1e9 }), tI, HIT_FRONT, true);
  ok(tI.hp === hp0, 'invuln=true → 掉血为 0、hp 不变');
  ok(resI.outcome === 'PEN' && resI.cls === 'PEN', 'invuln → 结果仍为 PEN（靶车无敌，cls=PEN）');
}

// ============================================================================
// 10) HP 极端：maxHp=1e6 扣血范围正确；maxHp=1 一击必杀/殉爆；已摧毁目标再命中
// ============================================================================
{
  const tH = mkTarget({ base: { maxHp: 1e6 } });
  ok(tH.maxHp === 1e6 && tH.hp === 1e6, 'maxHp=1e6 → hp=1e6');
  const resH = withDice(0.9, () => P.resolveHit(mkShell({ dx:1, dy:0, pen:200, dmg:34 }), tH, HIT_FRONT, true)); // 余量无模块倍率
  const lo = 1e6 - Math.round(34*1.15), hi = 1e6 - Math.round(34*0.85);
  ok(tH.hp >= lo && tH.hp <= hi, `dmg=34×随机倍率[0.85,1.15] → 扣血∈[${lo},${hi}]（hp=${tH.hp}）`);

  const t1 = mkTarget({ base: { maxHp: 1 } });
  P.resolveHit(mkShell({ dx:1, dy:0, pen:200, dmg:34 }), t1, HIT_FRONT, true);
  ok(t1.hp === 0, 'maxHp=1 → 一击必杀 hp=0');
  const t1a = mkTarget({ base: { maxHp: 1 } });
  withDice(0.2, () => P.resolveHit(mkShell({ dx:1, dy:0, pen:200, dmg:34 }), t1a, HIT_AMMO_SIDE, true));
  ok(t1a.hp === 0 && t1a.ammoBlew === true, 'maxHp=1 弹药架命中 → 殉爆');

  const tD = mkTarget({});
  tD.hp = 0;
  const resD = P.resolveHit(mkShell({ dx:1, dy:0, pen:200, dmg:1e9 }), tD, HIT_FRONT, true);
  ok(resD.outcome === 'PEN' && tD.hp === 0, '已摧毁目标再命中 → 不掉血、不崩溃');
}

// ============================================================================
// 11) 身高极端（中/重两端）：getPartZRange / getGunHeight 有限且单调
// ============================================================================
{
  const mid = mkTarget({ heightClass:'medium' });
  const hvy = mkTarget({ heightClass:'heavy' });
  const zh = G.getPartZRange(hvy, 'hull');
  const zt = G.getPartZRange(hvy, 'turret');
  ok(zh.zMin === 0 && zh.zMax === HEIGHTS.heavy.hull, 'getPartZRange(hull): z∈[0, 车体高]');
  ok(zt.zMin === HEIGHTS.heavy.hull && zt.zMax === HEIGHTS.heavy.hull + HEIGHTS.heavy.turret,
    'getPartZRange(turret): z∈[车体高, 总高]');
  ok(G.getGunHeight(hvy) > G.getGunHeight(mid), '重坦炮管高度 > 中坦（身高合法两端）');
}

// ============================================================================
// 12) P-16 弹种：HEAT/HE 表结构与系数 / 不跳弹 / HEAT 1.4×穿深 / HE 未击穿残余爆轰 /
//     HE 范围溅射（entities 全局注册表）/ AP·APCR 跳弹回归
// ============================================================================
{
  // 12.1) RULES.ammoTypes 表：heat/he 字段与系数（ap/apcr 不动）
  const T = R.RULES.ammoTypes;
  ok(T.heat && T.heat.label === 'HEAT', 'ammoTypes.heat 存在且 label=HEAT');
  ok(T.heat.pen === 1.4 && T.heat.speed === 0.8 && T.heat.dmg === 1.0,
    `heat 系数: pen 1.4 / speed 0.8 / dmg 1.0（got ${T.heat.pen}/${T.heat.speed}/${T.heat.dmg}）`);
  ok(T.heat.spread === 1.2, 'heat 系数: spread 1.2（×散布，fireTank 消费）');
  ok(T.heat.noBounce === true && !T.heat.splashRadius, 'heat: noBounce=true 且无 splashRadius');
  ok(T.he && T.he.label === 'HE', 'ammoTypes.he 存在且 label=HE');
  ok(T.he.pen === 0.7 && T.he.speed === 0.95 && T.he.dmg === 1.0,
    `he 系数: pen 0.7 / speed 0.95 / dmg 1.0（got ${T.he.pen}/${T.he.speed}/${T.he.dmg}）`);
  ok(T.he.noBounce === true && T.he.splashRadius === 90,
    `he: noBounce=true 且 splashRadius=90（got ${T.he.splashRadius}）`);
  ok(T.ap.pen === 1.0 && T.apcr.pen === 1.2 && !T.ap.noBounce && !T.apcr.noBounce,
    'ap/apcr 未动（pen 1.0/1.2、无 noBounce）');
}

// 12.2) HEAT 大角度不跳弹：θ=75° + allowBounce=true → 不 BOUNCE（pen 极大 → PEN），
//       shell 不被反射、canBounce 不消耗
{
  const t = mkTarget({});
  const sh = mkShell({ ammoKey:'heat', dx:Math.cos(degToRad(75)), dy:Math.sin(degToRad(75)), pen:1e9 });
  const res = P.resolveHit(sh, t, HIT_FRONT, true);
  ok(res.outcome === 'PEN', 'HEAT θ=75° 大角度 + allowBounce → 不跳弹、直接击穿');
  ok(sh.bounced === false && sh.canBounce === true,
    'HEAT 不跳弹：bounced=false、canBounce 保持 true（未消耗二次跳弹标记）');
  ok(Math.abs(sh.dx - Math.cos(degToRad(75))) < 1e-9 && Math.abs(sh.dy - Math.sin(degToRad(75))) < 1e-9,
    'HEAT 不跳弹：shell.dx/dy 未被反射');
}

// 12.3) HEAT 1.4× 穿深系数：模拟 fireTank 的 shell.pen = stats.penetration × ammo.pen。
//       基准穿深 100：AP(×1.0)=100 < 正面 110 → BLOCK；HEAT(×1.4)=140 > 110 → PEN
{
  const basePen = 100;
  const apPen = basePen * R.RULES.ammoTypes.ap.pen;
  const heatPen = basePen * R.RULES.ammoTypes.heat.pen;
  ok(apPen === 100 && heatPen === 140, `fireTank 穿深公式: AP=${apPen}、HEAT=${heatPen}（×1.4）`);
  const rAp = P.resolveHit(mkShell({ ammoKey:'ap', dx:1, dy:0, pen:apPen }), mkTarget({}), HIT_FRONT, true);
  ok(rAp.outcome === 'BLOCK', '基准穿深 100 的 AP → 正面 110 未击穿（对照）');
  const rHeat = P.resolveHit(mkShell({ ammoKey:'heat', dx:1, dy:0, pen:heatPen }), mkTarget({}), HIT_FRONT, true);
  ok(rHeat.outcome === 'PEN', 'HEAT ×1.4=140 > 正面 110 → 击穿（1.4× 系数生效）');
}

// 12.4) HE 大角度不跳弹：θ=75° + allowBounce=true → 不 BOUNCE；pen 极大 → PEN 且带 splash 元数据
{
  const t = mkTarget({});
  const sh = mkShell({ ammoKey:'he', dx:Math.cos(degToRad(75)), dy:Math.sin(degToRad(75)), pen:1e9, dmg:100 });
  const res = P.resolveHit(sh, t, HIT_FRONT, true);
  ok(res.outcome === 'PEN', 'HE θ=75° 大角度 + allowBounce → 不跳弹、直接击穿');
  ok(sh.bounced === false, 'HE 不跳弹：shell.bounced=false');
  ok(res.splash && res.splash.radius === 90, 'HE 击穿 → res.splash.radius = splashRadius(90)');
}

// 12.5) HE 未击穿残余爆轰：确定性公式 dmg × max(0.25, 0.5 × pen/eff)
{
  const dmg = 100;
  // eff=110（正面 θ=0）、pen=80：ratio = max(0.25, 0.5×80/110) ≈ 0.3636 → dmg=round(100×0.3636)=36
  const t = mkTarget({});
  const res = P.resolveHit(mkShell({ ammoKey:'he', dx:1, dy:0, pen:80, dmg }), t, HIT_FRONT, true);
  const ratio = Math.max(0.25, 0.5 * 80 / 110);
  const expect = Math.round(dmg * ratio);
  ok(res.outcome === 'BLOCK', 'HE pen=80 < eff=110 → 未击穿 BLOCK');
  ok(res.dmg === expect && res.dmg > 0,
    `残余爆轰 dmg=${res.dmg} = round(100×${ratio.toFixed(4)})（>0 且公式可验）`);
  ok(t.hp === 100 - expect, `未击穿爆轰扣血: hp=${t.hp}（100−${expect}）`);
  ok(res.text.indexOf('残余扣血') >= 0, 'BLOCK 文案含残余扣血说明');
  ok(res.splash && res.splash.radius === 90, 'HE 未击穿 → res.splash.radius = 90（爆轰照常）');

  // 地板：pen=20 → ratio = max(0.25, 0.5×20/110≈0.0909) = 0.25 → dmg=round(100×0.25)=25
  const t2 = mkTarget({});
  const res2 = withDice(0.9, () => P.resolveHit(mkShell({ ammoKey:'he', dx:1, dy:0, pen:20, dmg }), t2, HIT_FRONT, true));
  ok(res2.dmg === 25 && t2.hp === 75, `厚甲地板: ratio 钳到 0.25 → dmg=25、hp=75（got ${res2.dmg}/${t2.hp}）`);

  // 无敌目标：残余爆轰不扣血
  const tI = mkTarget({ invuln: true });
  const resI = P.resolveHit(mkShell({ ammoKey:'he', dx:1, dy:0, pen:80, dmg }), tI, HIT_FRONT, true);
  ok(resI.dmg === 0 && tI.hp === 100, 'HE 残余爆轰对无敌目标：dmg=0、hp 不变');
}

// 12.6) HE 范围溅射：命中点对周围实体衰减伤害（entities 全局注册表，主目标排除）
{
  const dmg = 100;
  // 命中点 = HIT_FRONT.x=32（溅射中心 32,0）；splashRadius=90
  const main = mkTarget({ x:0, y:0, base:{ maxHp: 1000 } });   // 主目标：只吃击穿伤害（85~115）
  const near = mkTarget({ x:77, y:0 });                        // 距中心 45 → falloff 0.5 → round(100×0.5×0.5)=25
  const edge = mkTarget({ x:122, y:0 });                       // 距中心 90 = 半径 → falloff 0 → 0 伤害
  const far  = mkTarget({ x:123, y:0 });                       // 距中心 91 > 90 → 无伤害
  global.entities = [main, near, edge, far];
  const res = withDice(0.9, () => P.resolveHit(mkShell({ ammoKey:'he', dx:1, dy:0, pen:1e9, dmg }), main, HIT_FRONT, true)); // 余量无模块倍率
  ok(res.outcome === 'PEN', 'HE 击穿主目标（溅射场景）');
  ok(near.hp === 75, `副目标近（45px）衰减扣 25 → hp=75（got ${near.hp}）`);
  ok(edge.hp === 100, `副目标边缘（90px=半径）falloff=0 → 不掉血（got ${edge.hp}）`);
  ok(far.hp === 100, `半径外（91px）→ 不掉血（got ${far.hp}）`);
  ok(main.hp >= 885 && main.hp <= 915,
    `主目标不重复吃溅射（只吃击穿伤害 85~115，hp=${main.hp}∈[885,915]）`);
  delete global.entities;
}

// 12.7) AP/APCR 回归：带 ammoKey 的普通弹种大角度仍跳弹（noBounce 仅 heat/he）
{
  const sh = mkShell({ ammoKey:'ap', dx:Math.cos(degToRad(72)), dy:Math.sin(degToRad(72)), pen:1e9 });
  const res = P.resolveHit(sh, mkTarget({}), HIT_FRONT, true);
  ok(res.outcome === 'BOUNCE' && sh.bounced === true, 'AP θ=72° + allowBounce → 仍跳弹（回归，行为不变）');
  const sh2 = mkShell({ ammoKey:'apcr', dx:Math.cos(degToRad(72)), dy:Math.sin(degToRad(72)), pen:1e9 });
  const res2 = P.resolveHit(sh2, mkTarget({}), HIT_FRONT, true);
  ok(res2.outcome === 'BOUNCE', 'APCR θ=72° + allowBounce → 仍跳弹（回归）');
}

console.log(fails === 0 ? '\nAll extreme-combat checks passed.' : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);