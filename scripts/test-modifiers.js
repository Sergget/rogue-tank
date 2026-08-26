// test-modifiers.js — 修饰器生命周期分类与边缘健壮性测试（Node 端，Pure Logic）
// 运行：node scripts/test-modifiers.js
'use strict';

const U = require('../js/tank_utils.js');
global.TAU = U.TAU;
const RULES_MOD = require('../js/tank_rules.js');
global.RULES = RULES_MOD.RULES;
const model = require('../js/tank_model.js');
global.addModifier = model.addModifier;
global.removeModifierBySource = model.removeModifierBySource;
const cards = require('../js/tank_cards.js');
const boss = require('../js/tank_boss.js');

let fails = 0;
function ok(cond, label) {
  if (cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}`); fails++; } // fails;
}

// 1) scope 分类：permanent（默认）/ run / timed（expiresAt）
const t = model.makeTank({ team: 'player' });
const basePen = t.stats.penetration;
model.addModifier(t, { stat: 'penetration', mode: 'add', value: 10 });                    // permanent
model.addModifier(t, { stat: 'penetration', mode: 'add', value: 20, scope: 'run' });       // run
model.addModifier(t, { stat: 'penetration', mode: 'add', value: 30, expiresAt: Date.now() + 999999 });  // timed
ok(t.modifiers.length === 3, '三个修饰器入列');
ok(t.modifiers[0].scope === 'permanent' && t.modifiers[1].scope === 'run' && t.modifiers[2].scope === 'timed', 'scope 正确分类');
ok(t.stats.penetration === basePen + 60, '先加后乘：三 add 叠加生效（+10+20+30）');

// 2) addTimedModifier 自动 timed
const t4 = model.makeTank({ team: 'player' });
model.addTimedModifier(t4, { stat: 'penetration', mode: 'add', value: 5 }, 1000);
ok(t4.modifiers[0].scope === 'timed', 'addTimedModifier 自动 scope=timed');

// 3) removeRunModifiers：清除 run，保留 permanent/timed
model.removeRunModifiers(t);
ok(t.modifiers.length === 2 && t.modifiers.every(m => m.scope !== 'run'), 'removeRunModifiers 只清 run');
ok(t.stats.penetration === basePen + 40, 'run 清除后 stats 恢复（+10+30）');

// 4) removeModifiersByScope('timed')
model.removeModifiersByScope(t, 'timed');
ok(t.modifiers.length === 1 && t.modifiers[0].scope === 'permanent', 'removeModifiersByScope 清 timed');
ok(t.stats.penetration === basePen + 10, '剩 permanent +10');

// 5) 卡牌 applyCardEffects 产出 run scope（单局）
const t2 = model.makeTank({ team: 'player' });
cards.applyCardEffects(t2, { id: 'test', effects: [{ type: 'modifier', stat: 'penetration', mode: 'add', value: 5 }] });
ok(t2.modifiers.length === 1 && t2.modifiers[0].scope === 'run', '卡牌 modifier scope=run');

// 6) Boss 阶段 modifier scope=run
const t3 = model.makeTank({ team: 'enemy' });
t3.stageId = null;
boss.applyBossStage(t3, { id: 'p1', onEnter: { modifiers: [{ stat: 'armor.hull.front', mode: 'add', value: 80 }] } });
ok(t3.modifiers.length === 1 && t3.modifiers[0].scope === 'run', 'Boss 阶段 modifier scope=run');

// 7) timed 到期剪除（refreshStats）
const t5 = model.makeTank({ team: 'player' });
model.addModifier(t5, { stat: 'penetration', mode: 'add', value: 9, expiresAt: Date.now() - 1 });  // 已过期
model.refreshStats(t5);
ok(t5.modifiers.length === 0, '过期 timed 修饰器被剪除');

// 8) 边界数值（0/负数/小数倍率修饰器）
const t6 = model.makeTank({ team: 'player' });
const baseDmg = t6.stats.damage;
model.addModifier(t6, { stat: 'damage', mode: 'add', value: 0 });
ok(t6.stats.damage === baseDmg, '0 加值修饰器不改变伤害数值');

model.addModifier(t6, { stat: 'damage', mode: 'add', value: -10 });
ok(t6.stats.damage === baseDmg - 10, '负数加值修饰器正确扣减伤害');

const t7 = model.makeTank({ team: 'player' });
model.addModifier(t7, { stat: 'maxSpeed', mode: 'mult', value: 0 });
ok(t7.stats.maxSpeed === 0, '0 乘值修饰器将最大速度降为 0');

const t8 = model.makeTank({ team: 'player' });
const baseHp = t8.stats.maxHp;
model.addModifier(t8, { stat: 'maxHp', mode: 'mult', value: 1.5 });
ok(t8.stats.maxHp === baseHp * 1.5, '小数乘值 1.5 正确放大 maxHp');

// 9) 先加后乘与多重乘值【加法聚合】（2026-08-25 用户决定 #97：mult 不再逐条相乘，
//    同一 stat 的所有 mult 聚合为 1 + Σ(value−1)：×1.5 与 ×1.2 → ×1.7 而非 ×1.8）
const t9 = model.makeTank({ team: 'player' });
const basePen9 = t9.stats.penetration;
model.addModifier(t9, { stat: 'penetration', mode: 'add', value: 30 });
model.addModifier(t9, { stat: 'penetration', mode: 'add', value: 10 });
model.addModifier(t9, { stat: 'penetration', mode: 'mult', value: 1.5 });
model.addModifier(t9, { stat: 'penetration', mode: 'mult', value: 1.2 });
const expectedPen = (basePen9 + 40) * 1.7;
ok(Math.abs(t9.stats.penetration - expectedPen) < 1e-5, '先加后乘及多重乘值加法聚合正确（×1.5+×1.2 → ×1.7）');

// 9b) 加法聚合边界：两条 ×0.85 → 0.70（而非 0.7225）；多条聚合钳 ≥0
const t9b = model.makeTank({ team: 'player' });
model.addModifier(t9b, { stat: 'damage', mode: 'mult', value: 0.85 });
model.addModifier(t9b, { stat: 'damage', mode: 'mult', value: 0.85 });
ok(Math.abs(t9b.stats.damage - t9b.base.damage * 0.70) < 1e-5, '两条 ×0.85 聚合为 ×0.70（加法聚合）');
const t9c = model.makeTank({ team: 'player' });
model.addModifier(t9c, { stat: 'maxHp', mode: 'mult', value: 0.3 });
model.addModifier(t9c, { stat: 'maxHp', mode: 'mult', value: 0.3 });
model.addModifier(t9c, { stat: 'maxHp', mode: 'mult', value: 0.3 });
ok(t9c.stats.maxHp === 0, '三条重 debuff 聚合为负时钳 ≥0（maxHp=0）');

// 9c) armor 路径同样加法聚合（同一路径两条 mult → 单次应用）
const t9d = model.makeTank({ team: 'player' });
const baseFrontD = t9d.stats.armor.hull.front;
model.addModifier(t9d, { stat: 'armor.hull.front', mode: 'mult', value: 1.2 });
model.addModifier(t9d, { stat: 'armor.hull.front', mode: 'mult', value: 1.2 });
ok(Math.abs(t9d.stats.armor.hull.front - baseFrontD * 1.4) < 1e-5, 'armor.hull.front 两条 ×1.2 聚合为 ×1.4');

// 10) 装甲修饰器（整组/单面/未知路径鲁棒性）
const t10 = model.makeTank({ team: 'player' });
const baseFront = t10.stats.armor.hull.front;
const baseSide = t10.stats.armor.hull.side;
const baseRear = t10.stats.armor.hull.rear;

model.addModifier(t10, { stat: 'armor.hull', mode: 'add', value: 20 });
ok(t10.stats.armor.hull.front === baseFront + 20 &&
   t10.stats.armor.hull.side === baseSide + 20 &&
   t10.stats.armor.hull.rear === baseRear + 20, 'armor.hull 整组装甲加值生效');

const baseTurFront = t10.stats.armor.turret.front;
model.addModifier(t10, { stat: 'armor.turret.front', mode: 'mult', value: 1.5 });
ok(t10.stats.armor.turret.front === baseTurFront * 1.5, 'armor.turret.front 单面装甲乘值生效');

model.addModifier(t10, { stat: 'armor.invalidGroup.front', mode: 'add', value: 100 });
model.addModifier(t10, { stat: 'armor.hull.invalidSide', mode: 'add', value: 100 });
ok(t10.stats.armor.hull.front === baseFront + 20, '未知装甲组/部位修饰器安全忽略，未发生报错或污染');

// 11) 未知属性与非法 mode 鲁棒性
const t11 = model.makeTank({ team: 'player' });
const speedBefore = t11.stats.maxSpeed;

model.addModifier(t11, { stat: 'unknown_attribute_xyz', mode: 'add', value: 999 });
ok(t11.stats.unknown_attribute_xyz === undefined, '未知 stat 修饰器被安全忽略');

model.addModifier(t11, { stat: 'maxSpeed', mode: 'invalid_mode', value: 500 });
ok(t11.stats.maxSpeed === speedBefore, '非法 mode 修饰器不生效');

// 12) 来源 (source) 追踪与重复移除幂等性
const t12 = model.makeTank({ team: 'player' });
model.addModifier(t12, { stat: 'penetration', mode: 'add', value: 10, source: 'item_A' });
model.addModifier(t12, { stat: 'damage', mode: 'add', value: 15, source: 'item_A' });
model.addModifier(t12, { stat: 'penetration', mode: 'add', value: 20, source: 'item_B' });

ok(t12.modifiers.length === 3, '已添加 3 个按来源标识的修饰器');

model.removeModifierBySource(t12, 'non_existent_source');
ok(t12.modifiers.length === 3, '移除不存在的 source 属于无操作 (no-op)');

model.removeModifierBySource(t12, 'item_A');
ok(t12.modifiers.length === 1 && t12.modifiers[0].source === 'item_B', '按 item_A 批量移除对应修饰器');

model.removeModifierBySource(t12, 'item_A');
ok(t12.modifiers.length === 1, '重复移除已清空 source 保持幂等');

// 13) 极限到期时间 (expiresAt) 边界测试
const t13 = model.makeTank({ team: 'player' });

model.addModifier(t13, { stat: 'reload', mode: 'add', value: -0.2, expiresAt: 0 });
model.refreshStats(t13);
ok(t13.modifiers.length === 0, 'expiresAt=0 的修饰器在 refreshStats 时立即被剪除');

model.addModifier(t13, { stat: 'reload', mode: 'add', value: -0.1, expiresAt: Infinity });
ok(t13.modifiers[0].scope === 'permanent', 'expiresAt=Infinity 自动判定为 permanent');

model.addModifier(t13, { stat: 'reload', mode: 'add', value: -0.1, expiresAt: Date.now() + 1e9 });
model.refreshStats(t13);
ok(t13.modifiers.length === 2, '未过期的 timed 修饰器在 refreshStats 后继续保留');

// 14) 机动属性 (maxSpeed / enginePower) 与坦克结构 (heightClass / RULES.modules / invuln) 校验
const t14 = model.makeTank({ team: 'player', enginePower: 1000, weight: 500, heightClass: 'heavy' });
const initialSpeed = t14.stats.maxSpeed;
model.addModifier(t14, { stat: 'maxSpeed', mode: 'add', value: 30 });
ok(t14.stats.maxSpeed === initialSpeed + 30, '修改 maxSpeed 后 stats 属性正确更新');

ok(t14.heightClass === 'heavy', '坦克 heightClass 实例属性保持正常');
ok(RULES.modules && RULES.modules.trackLockDefault !== undefined, 'RULES.modules 配置常数就位');

// 15) 模块 (modules) debuff 与无敌 (invuln) 状态修饰器边缘用例
model.setDebuff(t14, 'engine', 5);
ok(model.debuffSpeedRate(t14) === RULES.modules.rates.speedHurt, 'engine debuff 正确降低速度倍率');

model.addModifier(t14, { stat: 'invuln', mode: 'add', value: 1, scope: 'timed', expiresAt: Date.now() + 3000 });
ok(t14.modifiers.some(m => m.stat === 'invuln'), 'invuln 临时修饰器正确加入');

// 16) #61 动态马力/车重对 accel/brake 的物理联动回归
const t16 = model.makeTank({ team: 'player', enginePower: 600, weight: 30 });
const baseAccel = t16.stats.accel;
model.addModifier(t16, { stat: 'enginePower', mode: 'mult', value: 1.5 });
ok(Math.abs(t16.stats.accel - baseAccel * 1.5) < 1e-4, '#61: 升级 enginePower 后 stats.accel 联动放大 1.5 倍');
ok(Math.abs(t16.stats.brake - t16.stats.accel * 3.5) < 1e-4, '#61: stats.brake 同步联动保持 3.5 倍 accel');

// 17) #65 moduleMult 零值与类型判断
const fakeShooter = { team: 'player', stats: { ammoMult: 0, crewMult: 0 } };
ok(model.moduleMult(fakeShooter, 'ammo') === 0, '#65: 允许将 ammoMult 设为 0');
ok(model.moduleMult(fakeShooter, 'crew') === 0, '#65: 允许将 crewMult 设为 0');

// 18) D3 #A2 spreadMult 聚合下限：连续 add(-0.15) 叠加不得使 stats.spreadMult 穿越 RULES.spread.multFloor
const t18 = model.makeTank({ team: 'player' });
for(let i = 0; i < 10; i++){
  model.addModifier(t18, { stat: 'spreadMult', mode: 'add', value: -0.15, scope: 'run' });
}
ok(t18.stats.spreadMult >= RULES.spread.multFloor,
   `D3 #A2: 连续 10 条 add(-0.15) 后 stats.spreadMult=${t18.stats.spreadMult.toFixed(2)} ≥ multFloor(${RULES.spread.multFloor})`);
// mult 路径同样受下限保护（精密火控 ×0.96 与 add 混合聚合后仍钳 ≥ floor）
const t18b = model.makeTank({ team: 'player' });
model.addModifier(t18b, { stat: 'spreadMult', mode: 'add', value: -0.15, scope: 'run' });
model.addModifier(t18b, { stat: 'spreadMult', mode: 'mult', value: 0.5, scope: 'run' });
ok(t18b.stats.spreadMult >= RULES.spread.multFloor, 'D3 #A2: add+mult 混合聚合后 spreadMult 仍钳 ≥ multFloor');
// 正常区间不受钳制影响（单条 -0.15 → 0.85，高于 floor 0.2，行为不变）
const t18c = model.makeTank({ team: 'player' });
model.addModifier(t18c, { stat: 'spreadMult', mode: 'add', value: -0.15, scope: 'run' });
ok(Math.abs(t18c.stats.spreadMult - 0.85) < 1e-9, 'D3 #A2: 单条 add(-0.15) → 0.85 不受 floor 影响');

// 19) D3 #A2 motionSigma 最终生效 σ 下限：负中间值不允许外泄
global.SPREAD = model.SPREAD;
global.norm = U.norm;   // motionSigma 内部依赖 utils.norm（Node 端补全局）
const t19 = model.makeTank({ team: 'player' });
t19.stats.spreadMult = -3;   // 直接注入越界值模拟历史脏数据（正常路径已被 computeStats 钳制）
t19.prevHullAngle = t19.hullAngle; t19.prevTurretAngle = t19.turretAngle;
const sig19 = model.motionSigma(t19, 0.016, {});
ok(sig19 >= model.SPREAD.sigmaFloor && sig19 > 0,
   `D3 #A2: motionSigma 返回值 ${sig19.toFixed(4)} ≥ sigmaFloor(${model.SPREAD.sigmaFloor}) 且恒为正`);

console.log('test-modifiers: 完成所有检查');
if (fails === 0) console.log('test-modifiers: 全部通过');
else console.error(`test-modifiers: ${fails} 项失败`);
process.exit(fails === 0 ? 0 : 1);
