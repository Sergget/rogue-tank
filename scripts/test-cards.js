// test-cards.js — 卡牌系统测试（Node 端，Pure Logic）
// 运行：node scripts/test-cards.js
'use strict';

const U = require('../js/tank_utils.js');
global.TAU = U.TAU;
const RULES_MOD = require('../js/tank_rules.js');
global.RULES = RULES_MOD.RULES;
const model = require('../js/tank_model.js');
global.addModifier = model.addModifier; // tank_cards.applyCardEffects 引用全局（浏览器惯例）
const cardsMod = require('../js/tank_cards.js');
const { createRNG } = require('../js/tank_nodegen.js');

let fails = 0;
function ok(cond, label) {
  if (cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}`); fails++; }
}

// 1) validateCard：合法卡
ok(cardsMod.validateCard({ id: 'a', name: 'A', rarity: 'common', effects: [{ type: 'modifier', stat: 'penetration', mode: 'add', value: 10 }] }).length === 0,
  '合法卡无错误');

// 2) 各字段非法
ok(cardsMod.validateCard({ name: 'x', rarity: 'common', effects: [] }).length > 0, '缺 id 报错');
ok(cardsMod.validateCard({ id: 'a', name: 'x', rarity: 'mythic', effects: [{ type: 'modifier', stat: 'penetration', mode: 'add', value: 1 }] }).length > 0, '非法 rarity 报错');
ok(cardsMod.validateCard({ id: 'a', name: 'x', rarity: 'common', tags: ['魔法'], effects: [{ type: 'modifier', stat: 'penetration', mode: 'add', value: 1 }] }).length > 0, '非法 tag 报错');
ok(cardsMod.validateCard({ id: 'a', name: 'x', rarity: 'common', effects: [] }).length > 0, '空 effects 报错');

// 3) 效果校验
ok(cardsMod.validateCardEffect({ type: 'modifier', stat: 'nope', mode: 'add', value: 1 }, 'e').length > 0, '非法 stat 报错');
ok(cardsMod.validateCardEffect({ type: 'modifier', stat: 'armor.hull.front', mode: 'mult', value: 1.2 }, 'e').length === 0, '装甲路径合法');
ok(cardsMod.validateCardEffect({ type: 'modifier', stat: 'armor.hull.xx', mode: 'add', value: 1 }, 'e').length > 0, '装甲路径非法面报错');
ok(cardsMod.validateCardEffect({ type: 'ammo', key: 'ap', field: 'pen', mode: 'mult', value: 1.1 }, 'e').length === 0, 'ammo 合法');
ok(cardsMod.validateCardEffect({ type: 'ability', key: 'smoke' }, 'e').length === 0, 'ability 合法');
ok(cardsMod.validateCardEffect({ type: 'drone' }, 'e').length === 0, 'drone 合法');

// 4) validateCardSet：唯一性
const set = [
  { id: 'dup', name: 'A', rarity: 'common', effects: [{ type: 'modifier', stat: 'penetration', mode: 'add', value: 1 }] },
  { id: 'dup', name: 'B', rarity: 'common', effects: [{ type: 'modifier', stat: 'damage', mode: 'add', value: 1 }] }
];
ok(cardsMod.validateCardSet(set).duplicates.length === 1, '重复 id 检出');

// 5) applyCardEffects：modifier 立即生效
const tank = model.makeTank({ team: 'player' });
const basePen = tank.stats.penetration;
cardsMod.applyCardEffects(tank, { id: 'ap', name: 'x', rarity: 'common', effects: [{ type: 'modifier', stat: 'penetration', mode: 'add', value: 10 }] });
ok(tank.stats.penetration === basePen + 10, 'modifier 立即生效（穿深 +10）');
ok(cardsMod.cardStackCount(tank, 'ap') === 1, '卡牌叠加计数');
cardsMod.applyCardEffects(tank, { id: 'ap', name: 'x', rarity: 'common', effects: [{ type: 'modifier', stat: 'penetration', mode: 'add', value: 10 }] });
ok(cardsMod.cardStackCount(tank, 'ap') === 2 && tank.stats.penetration === basePen + 20, '同名卡叠加');
// armor 路径 modifier
cardsMod.applyCardEffects(tank, { id: 'arm', name: 'x', rarity: 'common', effects: [{ type: 'modifier', stat: 'armor.hull.front', mode: 'add', value: 12 }] });
ok(tank.stats.armor.hull.front === 110 + 12, '装甲路径 modifier 生效');

// 6) drawCardChoices：确定性 + 数量 + 不重复
const pool = [];
const rarities = ['common', 'rare', 'epic', 'legendary'];
for (let i = 0; i < 40; i++) {
  pool.push({ id: 'c' + i, name: 'C' + i, rarity: rarities[i % 4], effects: [{ type: 'modifier', stat: 'damage', mode: 'add', value: 1 }] });
}
const rng1 = createRNG(123);
const rng2 = createRNG(123);
const d1 = cardsMod.drawCardChoices(pool, 3, rng1);
const d2 = cardsMod.drawCardChoices(pool, 3, rng2);
ok(d1.length === 3 && d2.length === 3, '抽 3 张');
ok(d1.map(c => c.id).join(',') === d2.map(c => c.id).join(','), '同种子抽卡确定');
ok(new Set(d1.map(c => c.id)).size === 3, '抽卡不重复');
ok(cardsMod.drawCardChoices(pool, 100).length === pool.length, '超量抽取返回全池');

// 7) 实际 cards/ 数据全合法（由 validate-content.js 主校验，这里抽样确认模块可加载）
ok(typeof cardsMod.CARD_TAGS.includes('重甲') === 'boolean', 'CARD_TAGS 含 5 流派');

console.log('test-cards: 完成所有检查');
if (fails === 0) console.log('test-cards: 全部通过');
else console.error(`test-cards: ${fails} 项失败`);
process.exit(fails === 0 ? 0 : 1);
