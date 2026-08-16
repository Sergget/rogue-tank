// test-boss.js — Boss 系统测试（Node 端，Pure Logic）
// 运行：node scripts/test-boss.js
'use strict';

const {
  BOSS_WEAKSPOT_KEYS,
  validateBoss,
  validateBossStage,
  bossStageFor,
  bossStageIndex,
  bossInStage
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

console.log('test-boss: 完成所有检查');
if (fails === 0) console.log('test-boss: 全部通过');
else console.error(`test-boss: ${fails} 项失败`);
process.exit(fails === 0 ? 0 : 1);
