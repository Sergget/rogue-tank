// test-modifiers.js — 修饰器生命周期分类测试（Node 端，Pure Logic）
// 运行：node scripts/test-modifiers.js
'use strict';

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
  else { console.error(`✗ ${label}`); fails++; }
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

console.log('test-modifiers: 完成所有检查');
if (fails === 0) console.log('test-modifiers: 全部通过');
else console.error(`test-modifiers: ${fails} 项失败`);
process.exit(fails === 0 ? 0 : 1);
