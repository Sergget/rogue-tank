// test-boss.js — Boss 系统测试（Node 端，Pure Logic）
// 运行：node scripts/test-boss.js
'use strict';

// 运行时函数（makeBossEntity/applyBossStage/updateBossStage）引用全局 addModifier/removeModifierBySource
global.addModifier = (t, m) => { t.modifiers = t.modifiers || []; t.modifiers.push(m); return t; };
global.removeModifierBySource = (t, s) => { t.modifiers = (t.modifiers || []).filter(m => m.source !== s); };

const {
  BOSS_WEAKSPOT_KEYS,
  validateBoss,
  validateBossStage,
  bossStageFor,
  bossStageIndex,
  bossInStage,
  makeBossEntity,
  applyBossStage,
  updateBossStage
} = require('../js/tank_boss.js');

let fails = 0;
function ok(cond, label) {
  if (cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}`); fails++; }
}

const boss = {
  id: 'b1', name: 'B',
  stages: [
    { id: 'p1', hpFrom: 1.0, hpTo: 0.6, weakspots: ['ammo'] },
    { id: 'p2', hpFrom: 0.6, hpTo: 0.2, weakspots: ['engine'] },
    { id: 'p3', hpFrom: 0.2, hpTo: 0.0, weakspots: [] }
  ],
  loot: { score: 500, cardRarity: 'legendary', cards: 3 }
};

// 1) 合法 boss
ok(validateBoss(boss).length === 0, '合法 boss 无错误');

// 2) 阶段判定
ok(bossStageFor(boss, 1.0).id === 'p1', '满血 → p1');
ok(bossStageFor(boss, 0.6).id === 'p2', '0.6 → p2（边界归下段）');
ok(bossStageFor(boss, 0.2).id === 'p3', '0.2 → p3');
ok(bossStageFor(boss, 0.0).id === 'p3', '0 → p3');
ok(bossStageFor(boss, 0.99).id === 'p1', '0.99 → p1');
ok(bossStageIndex(boss, 0.5) === 1, '索引正确');
ok(bossInStage(boss, 0.3, 'p2') === true && bossInStage(boss, 0.3, 'p3') === false, 'bossInStage 正确');

// 3) 校验：非法阶段
ok(validateBossStage({ id: 'x', hpFrom: 0.5, hpTo: 0.5 }, 0).length > 0, 'hpFrom 不大于 hpTo 报错');
ok(validateBossStage({ id: 'x', hpFrom: 1.5, hpTo: 0.5 }, 0).length > 0, '阈值越界报错');
ok(validateBossStage({ id: 'x', hpFrom: 1, hpTo: 0.5, weakspots: ['nope'] }, 0).length > 0, '非法 weakspot 报错');

// 4) 校验：阶段不连续 / 首末阈值
const bad1 = { id: 'x', name: 'X', stages: [{ id: 'p1', hpFrom: 0.9, hpTo: 0.4 }, { id: 'p2', hpFrom: 0.4, hpTo: 0.0 }] };
ok(validateBoss(bad1).length > 0, '首阶段 hpFrom ≠ 1 报错');
const bad2 = { id: 'x', name: 'X', stages: [{ id: 'p1', hpFrom: 1, hpTo: 0.5 }, { id: 'p2', hpFrom: 0.6, hpTo: 0.0 }] };
ok(validateBoss(bad2).some(e => e.includes('不衔接')), '阶段阈值不衔接报错');
const bad3 = { id: 'x', name: 'X', stages: [{ id: 'p1', hpFrom: 1, hpTo: 0.4 }] };
ok(validateBoss(bad3).length > 0, '末阶段 hpTo ≠ 0 报错');

// 5) loot 校验
ok(validateBoss({ id: 'x', name: 'X', stages: [{ id: 'p1', hpFrom: 1, hpTo: 0 }], loot: { cardRarity: 'mythic' } }).length > 0, '非法 loot.cardRarity 报错');

// 6) 枚举
ok(BOSS_WEAKSPOT_KEYS.includes('track') && BOSS_WEAKSPOT_KEYS.includes('ammo'), '弱点枚举含履带/弹药架');

// 7) 运行时：makeBossEntity + 阶段切换（fake env + addModifier shim）
const bossDef = {
  id: 'b1', name: 'B', tankId: 'dummy', scale: 1.8,
  stages: [
    { id: 'p1', hpFrom: 1.0, hpTo: 0.6, onEnter: { modifiers: [{ stat: 'armor.hull.front', mode: 'add', value: 80 }] } },
    { id: 'p2', hpFrom: 0.6, hpTo: 0.2, onEnter: { modifiers: [{ stat: 'turnRate', mode: 'mult', value: 2 }] } },
    { id: 'p3', hpFrom: 0.2, hpTo: 0.0, onEnter: { modifiers: [] } }
  ],
  loot: { score: 500, cardRarity: 'legendary', cards: 3 }
};
let spawnCount = 0;
const env = {
  spawnTank(spec) { spawnCount++; return Object.assign({ id: spec.id, team: spec.team, x: spec.x, y: spec.y, hullAngle: spec.hullAngle, modifiers: [], hp: 1000, maxHp: 1000, stats: { maxHp: 1000 } }, spec); },
  configureTank() {}
};
const bossEntity = makeBossEntity(bossDef, env);
ok(spawnCount === 1 && bossEntity.isBoss === true && bossEntity.boss === bossDef, 'makeBossEntity 生成带元数据实体');
ok(bossEntity.stageId === 'p1' && bossEntity.modifiers.length === 1 && bossEntity.modifiers[0].value === 80, '首阶段 modifiers 已应用');
ok(bossEntity.hp === 1000 && bossEntity.maxHp === 1000, 'boss 满血出生（stats.maxHp）');

// 阶段切换：hp 降到 0.6 以下 → p2，旧 p1 modifier 移除、新 p2 modifier 叠加
bossEntity.hp = 500;  // ratio 0.5
const r = updateBossStage(bossEntity);
ok(r.changed === true && r.from === 'p1' && r.to === 'p2', '跨阶段触发（p1→p2）');
ok(bossEntity.stageId === 'p2' && bossEntity.modifiers.length === 1 && bossEntity.modifiers[0].stat === 'turnRate', '旧阶段 modifier 已移除、新阶段已叠加');
// 同阶段不重复触发
const r2 = updateBossStage(bossEntity);
ok(r2.changed === false, '同阶段不重复触发');
// 末阶段
bossEntity.hp = 100;  // ratio 0.1
const r3 = updateBossStage(bossEntity);
ok(r3.to === 'p3' && bossEntity.modifiers.length === 0, '末阶段 modifiers 为空');

console.log('test-boss: 完成所有检查');
if (fails === 0) console.log('test-boss: 全部通过');
else console.error(`test-boss: ${fails} 项失败`);
process.exit(fails === 0 ? 0 : 1);
