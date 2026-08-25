// 极端模型测试 — test-extreme-model.js
// 极端但合法的坦克 数据/配置/模型（js/tank_model.js）压力测试：
// computeStats / makeTank / addModifier 家族 / applyTankConfig / SPREAD·motionSigma·updateSigma /
// 模块 debuff 五倍率 / tankKmh / moduleMult 的 极大·极小·零值 输入。
// 约束：不测试 0 宽 / 0 长 车体·炮塔（只测 1px 极薄合法形）。
// 运行：node scripts/test-extreme-model.js
'use strict';

const U = require('../js/tank_utils.js');
const R = require('../js/tank_rules.js');
global.TAU = U.TAU; global.norm = U.norm; global.rotate = U.rotate;
global.segRayIntersect = U.segRayIntersect; global.partCorners = U.partCorners;
global.partEdges = U.partEdges; global.reflectDir = U.reflectDir; global.distToSegment = U.distToSegment;
global.gaussian = U.gaussian; global.angDiff = U.angDiff;
global.RULES = R.RULES;
// applyTankConfig 内引用自由变量 normalizeBarrel（浏览器端全局函数）；
// Node 端必须先把 tank_halfgeom 的同一实现挂到 global（与 test-tankcollision.js 一致）。
global.normalizeBarrel = require('../js/tank_halfgeom.js').normalizeBarrel;
const MD = require('../js/tank_model.js');
global.makeTank = MD.makeTank; global.applyTankConfig = MD.applyTankConfig; global.computeStats = MD.computeStats;
global.addModifier = MD.addModifier; global.addTimedModifier = MD.addTimedModifier;
global.removeModifierBySource = MD.removeModifierBySource; global.refreshStats = MD.refreshStats;
global.motionSigma = MD.motionSigma; global.updateSigma = MD.updateSigma;
global.setDebuff = MD.setDebuff; global.tickDebuffs = MD.tickDebuffs;
global.moduleMult = MD.moduleMult; global.debuffSpread = MD.debuffSpread;
global.debuffReloadRate = MD.debuffReloadRate; global.debuffTurnRate = MD.debuffTurnRate;
global.debuffSpeedRate = MD.debuffSpeedRate; global.tankKmh = MD.tankKmh;
global.SPREAD = MD.SPREAD;

const DB = RULES.modules;   // 模块倍率 / 时长
const SP = SPREAD;          // 散布参数（== RULES.spread）

let fails = 0;
function ok(cond, label){
  if(cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}`); fails++; }
}

// ========== 1) computeStats / makeTank 极端基准 ==========
{
  const base = { maxSpeed:1e6, turnRate:1e6, turretTurnRate:1e6, reload:1e6, maxHp:1e9,
    weight:300, enginePower:900, shellSpeed:1200, penetration:120, damage:34,
    armor:{ hull:{front:110,side:38,rear:26}, turret:{front:140,side:50,rear:24} } };
  const s = computeStats(base, []);
  ok(s.maxSpeed===1e6 && s.turnRate===1e6 && s.reload===1e6 && s.maxHp===1e9,
    'computeStats 极端基准 (1e6/1e6/1e6/1e9) 原样保留');
  ok(Number.isFinite(s.accel) && s.accel === 390, 'computeStats 极端基准 accel 有限 (900/300×130=390)');
  const t = makeTank({ base });
  ok(t.stats.maxSpeed===1e6 && t.stats.turnRate===1e6 && t.stats.reload===1e6 && t.stats.maxHp===1e9,
    'makeTank 极端基准 -> tank.stats 与基准一致');
  ok(t.hp === t.maxHp && t.hp === 1e9, 'makeTank hp=1e9 -> tank.hp === maxHp === 1e9');
}
{
  const t = makeTank({ base:{ maxSpeed:0, turnRate:0 } });
  ok(t.stats.maxSpeed === 0 && t.stats.turnRate === 0, '零值合法: maxSpeed/turnRate=0 原样保留');
  ok(Number.isFinite(t.stats.accel) && !Number.isNaN(t.stats.accel),
    '零值合法: weight>0 -> accel 非 NaN/非 Infinity');
  const tt = makeTank({ base:{ maxSpeed:0.001 } });
  ok(tt.stats.maxSpeed === 0.001 && Number.isFinite(tt.stats.accel),
    '微值合法: maxSpeed=0.001 保留且 accel 有限');
}

// ========== 2) accel 极端（enginePower / weight） ==========
{
  const mkbase = (w,p) => ({ maxSpeed:120, turnRate:2, turretTurnRate:2.2, penetration:120,
    damage:34, reload:1.3, maxHp:100, weight:w, enginePower:p,
    armor:{ hull:{front:1,side:1,rear:1}, turret:{front:1,side:1,rear:1} } });
  const aHuge = computeStats(mkbase(1, 1e6), []);
  ok(aHuge.accel === 1.3e8 && Number.isFinite(aHuge.accel),
    `accel: power=1e6 weight=1 -> 巨大但有限 (${aHuge.accel})`);
  const aTiny = computeStats(mkbase(1e6, 1), []);
  ok(Number.isFinite(aTiny.accel) && !Number.isNaN(aTiny.accel) && aTiny.accel > 0,
    `accel: power=1 weight=1e6 -> 趋近 0 但有限 (>0, ${aTiny.accel})`);
  const aZero = computeStats(mkbase(0, 900), []);
  ok(aZero.accel === Infinity,
    'weight=0（非法输入）: computeStats 当前行为 accel=Infinity（文档化，不崩溃）');
  const tw = makeTank({ base:{ weight:0 } });
  ok(!Number.isNaN(tw.stats.accel) && tw.stats.accel === Infinity,
    'makeTank weight=0 不崩溃（accel=Infinity，非法输入当前行为）');
}

// ========== 3) 修饰器极端（add/mult 叠加、装甲、未知 stat） ==========
{
  const t = makeTank({});
  const s0 = t.stats.maxSpeed;   // 120
  addModifier(t, { stat:'maxSpeed', mode:'add', value:1e9, source:'add1e9' });
  ok(t.stats.maxSpeed === s0 + 1e9, `modifier add +1e9 -> maxSpeed 增长 (${s0}->${t.stats.maxSpeed})`);
  addModifier(t, { stat:'maxSpeed', mode:'mult', value:0, source:'mult0' });
  ok(t.stats.maxSpeed === 0, 'modifier mult ×0 -> maxSpeed=0');
  removeModifierBySource(t, 'mult0');
  ok(t.stats.maxSpeed === s0 + 1e9, 'removeModifierBySource(mult) -> 回到 add 后值');
  removeModifierBySource(t, 'add1e9');
  ok(t.stats.maxSpeed === s0, 'removeModifierBySource(add) -> 回到基准');
  addModifier(t, { stat:'maxSpeed', mode:'mult', value:-0.5, source:'neg' });
  ok(t.stats.maxSpeed === s0 * -0.5 && Number.isFinite(t.stats.maxSpeed),
    `mult ×-0.5 -> 负 maxSpeed 当前行为无崩溃 (${t.stats.maxSpeed})`);
  removeModifierBySource(t, 'neg');
}
{
  // 两趟算法：先 add 后 mult，结果与添加顺序无关
  const t1 = makeTank({});
  addModifier(t1, { stat:'maxSpeed', mode:'add', value:100, source:'A' });
  addModifier(t1, { stat:'maxSpeed', mode:'mult', value:2, source:'B' });
  const t2 = makeTank({});
  addModifier(t2, { stat:'maxSpeed', mode:'mult', value:2, source:'B' });
  addModifier(t2, { stat:'maxSpeed', mode:'add', value:100, source:'A' });
  const expect = (120+100)*2;   // 440
  ok(t1.stats.maxSpeed === expect && t2.stats.maxSpeed === expect && t1.stats.maxSpeed === t2.stats.maxSpeed,
    `两趟算法: add/mult 顺序无关，结果=(base+100)×2=440 (got ${t1.stats.maxSpeed})`);
}
{
  const t = makeTank({});
  const before = t.stats.armor.hull.front;   // 110
  addModifier(t, { stat:'armor.hull.front', mode:'add', value:1e6, source:'arm' });
  ok(t.stats.armor.hull.front === before + 1e6,
    `armor mod add +1e6 -> hull.front 增长 (${before}->${t.stats.armor.hull.front})`);
  removeModifierBySource(t, 'arm');
  ok(t.stats.armor.hull.front === before, 'remove armor mod -> 装甲回到基准');
}
{
  const t = makeTank({});
  addModifier(t, { stat:'nonexistent.stat', mode:'add', value:5, source:'ghost' });
  ok(t.stats.maxSpeed === 120, '未知 stat 修饰器被忽略（无崩溃、不影响其他字段）');
  ok(t.modifiers.length === 1, '未知 stat 修饰器仍入列（当前行为文档化）');
}

// ========== 4) removeModifierBySource / refreshStats / 定时到期 ==========
{
  const t = makeTank({});
  const s0 = t.stats.maxSpeed;
  addModifier(t, { stat:'maxSpeed', mode:'add', value:100, source:'T1', expiresAt: Date.now() + 100000 });
  ok(t.stats.maxSpeed === s0 + 100, '定时修饰器未到期生效');
  t.modifiers[0].expiresAt = Date.now() - 1;   // 人为把到期时间拨到过去
  refreshStats(t);
  ok(t.stats.maxSpeed === s0 && t.modifiers.length === 0, 'refreshStats 剪除已到期定时修饰器');
}
{
  const t = makeTank({});
  addTimedModifier(t, { stat:'maxSpeed', mode:'add', value:100, source:'NEG' }, -1000);
  ok(t.modifiers.length === 0 && t.stats.maxSpeed === 120,
    'addTimedModifier 负时长（已到期）入列即被剪除');
}

// ========== 5) applyTankConfig 极端（hp/装甲/极薄车体/极端轴/超长炮管） ==========
{
  const t = makeTank({});
  applyTankConfig(t, {
    hp: 1e9,
    armor: { hull: { front: 1e6 } },
    barrel: { len: 1e6, width: 18 },
    hull: { verts: [[0,0],[10,0],[10,1],[0,1]], faces: ['front','side','rear','side'] },
    turret: {
      verts: [[16.15,-14.76],[0.85,-17.28],[-16.15,-16.56],[0,0]],
      faces: ['front','side','rear','side'],
      axis: { dx: 1e5, dy: 0 },
      armor: { front: 200 }
    }
  });
  ok(t.stats.maxHp === 1e9 && t.hp === 1e9 && t.maxHp === 1e9,
    'applyTankConfig hp=1e9 -> stats.maxHp/hp/maxHp 一致');
  ok(t.stats.armor.hull.front === 1e6, 'applyTankConfig armor.hull.front=1e6 -> 生效');
  ok(t.hullLen === 10 && t.hullWid === 1, '极薄合法车体 (10×1px) -> hullLen/hullWid 计算正确');
  ok(t.hullSpec.verts.every(([vx,vy]) => Number.isFinite(vx) && Number.isFinite(vy)),
    '极薄车体顶点重居中后仍有限');
  ok(t.barrel.len === 1e6 && Number.isFinite(t.barrel.len), 'barrel len=1e6 归一化后有限');
  ok(t.turretSpec.verts.every(([vx,vy]) => Number.isFinite(vx) && Number.isFinite(vy)),
    'turret axis dx=1e5 -> 顶点重居中后有限');
  ok(t.turretAxis.dx === 1e5 && t.turretAxis.dy === 0, 'turret axis 记录保留');
  ok(Number.isFinite(t.turLen) && Number.isFinite(t.turWid), 'turLen/turWid 有限');
}

// ========== 6) SPREAD / motionSigma / updateSigma 极端 ==========
{
  const t = makeTank({ id:'player', base:{ maxSpeed:120, turnRate:2, turretTurnRate:2.2 } });
  t.prevHullAngle = 0; t.prevTurretAngle = 0;
  ok(motionSigma(t, 0, {}) === SP.base, 'motionSigma dt=0 -> 直接返回基准 base');
  t.hullAngle = Math.PI; t.turretAngle = 0.5;
  const big = motionSigma(t, 1e6, {});
  ok(Number.isFinite(big) && big > SP.base, `motionSigma dt=1e6 -> 有限且含运动源贡献 (${big.toExponential(3)})`);
}
{
  const t = makeTank({ id:'player', base:{ maxSpeed:120, turnRate:1e-6, turretTurnRate:2.2 } });
  t.hullAngle = Math.PI; t.prevHullAngle = 0; t.turretAngle = 0; t.prevTurretAngle = 0;
  const sig = motionSigma(t, 1, {});
  ok(sig === SP.base + SP.hullRotMax,
    `turnRate=1e-6 + 大 hullRate -> min(1,…) 封顶 (${sig} === ${(SP.base+SP.hullRotMax).toFixed(4)})`);
}
{
  const t = makeTank({ id:'player', base:{ maxSpeed:120, spreadMult:0 } });
  t.prevHullAngle = 0; t.prevTurretAngle = 0;
  ok(motionSigma(t, 1/60, { w:true }) === SP.base, 'spreadMult=0 -> 三个运动源清零，仅剩基准');
}
{
  const t = makeTank({ id:'player', base:{ maxSpeed:120, spreadMult:1e6 } });
  t.prevHullAngle = 0; t.prevTurretAngle = 0;
  const sig = motionSigma(t, 1/60, { w:true });
  ok(Number.isFinite(sig) && sig > 1e4, `spreadMult=1e6 -> sigma 巨大但有限 (${sig.toFixed(1)})`);
}
{
  const t = makeTank({ id:'player', base:{ maxSpeed:120, spreadMult:0 } });
  updateSigma(t, 0, {});
  ok(Number.isFinite(t.sigma), 'updateSigma dt=0 -> sigma 有限');
  for(let i=0; i<200; i++) updateSigma(t, 1/60, {});
  ok(t.sigma === SP.base, 'updateSigma spreadMult=0 -> 收敛到基准 base');
}

// ========== 7) 模块 debuff 五倍率 + setDebuff 刷新 + tickDebuffs 清空 ==========
{
  const t = makeTank({});
  ok(debuffSpread(t) === 1 && debuffReloadRate(t) === 1 && debuffTurnRate(t) === 1 &&
     debuffSpeedRate(t) === 1, '无 debuff -> 五项倍率均为 1');
  setDebuff(t, 'gunner', 2);
  setDebuff(t, 'commander', 5);
  ok(debuffSpread(t) === DB.rates.spreadHurt * DB.rates.commanderDebuff,
    `炮手+车长 -> spread ×${DB.rates.spreadHurt}×${DB.rates.commanderDebuff} (=${(DB.rates.spreadHurt*DB.rates.commanderDebuff).toFixed(2)})`);
  ok(debuffReloadRate(t) === DB.rates.commanderDebuff, '无装填/弹药伤但有车长 -> reload ×commanderDebuff');
  ok(debuffTurnRate(t) === DB.rates.commanderDebuff, '无驾驶员伤但有车长 -> turn ×commanderDebuff');
  ok(debuffSpeedRate(t) === DB.rates.commanderDebuff, '无发动机伤但有车长 -> speed ×commanderDebuff');
  setDebuff(t, 'gunner', 3);
  ok(t.debuffs.gunner === 3, 'setDebuff 二次设置 -> 刷新时长不叠加');
  tickDebuffs(t, 10);
  ok(Object.keys(t.debuffs).length === 0, 'tickDebuffs dt>剩余时长 -> debuff 全部清空');
}

// ========== 8) tankKmh ==========
{
  const t0 = makeTank({ base:{ maxSpeed:0 } });
  ok(tankKmh(t0) === 0, 'maxSpeed=0 -> tankKmh=0');
  const t1 = makeTank({ base:{ maxSpeed:1e6 } });
  const k = tankKmh(t1);
  ok(k === 400000 && Number.isFinite(k), `maxSpeed=1e6 -> tankKmh=${k}（有限，kmhFactor=0.4）`);
}

// ========== 9) moduleMult 玩家 vs 敌方 ==========
{
  const pZero = makeTank({ team:'player', base:{ ammoMult:0 } });
  const pBig  = makeTank({ team:'player', base:{ ammoMult:1e6 } });
  const eBig  = makeTank({ team:'enemy',  base:{ ammoMult:1e6 } });
  // #65 修复后：typeof stats.ammoMult === 'number' 允许 0 倍率，不再 falsy 回退默认
  ok(moduleMult(pZero, 'ammo') === 0, '#65: player ammoMult=0 允许显式设为 0');
  ok(moduleMult(pBig, 'ammo') === 1e6 && Number.isFinite(moduleMult(pBig, 'ammo')),
    'player ammoMult=1e6 -> 巨大但有限');
  ok(moduleMult(eBig, 'ammo') === DB.ammo.enemy, 'enemy 忽略 stats -> 恒为 RULES 固定倍率');
  ok(moduleMult(pBig, 'gunner') === DB.crew.player, 'player crew -> stats.crewMult 默认 ×1.2');
}

console.log(fails ? `\n${fails} failure(s).` : '\nAll extreme model checks passed.');
process.exitCode = fails ? 1 : 0;
