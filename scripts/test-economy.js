// test-economy.js — 经济与存档测试（Node 端，Pure Logic）
// 运行：node scripts/test-economy.js
'use strict';

const RULES_MOD = require('../js/tank_rules.js');
global.RULES = RULES_MOD.RULES;
global.addModifier = (t, m) => { t.modifiers = t.modifiers || []; t.modifiers.push(m); return t; };
const eco = require('../js/tank_economy.js');

let fails = 0;
function ok(cond, label) {
  if (cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}`); fails++; }
}

// 1) 存档默认值 + 归一化
const def = eco.defaultProfile();
ok(def.version === RULES_MOD.RULES.economy.saveVersion && def.points === 0 && typeof def.upgrades === 'object', 'defaultProfile 结构');
ok(eco.normalizeProfile(null).points === 0, 'null profile → 默认');
ok(eco.normalizeProfile({ version: 999 }).points === 0, '版本不匹配 → 默认（防脏数据）');
const p2 = eco.normalizeProfile({ version: 1, points: 100, upgrades: { pen_up: 3, bogus: 5 }, stats: { runs: 2, kills: 7 } });
ok(p2.points === 100 && p2.upgrades.pen_up === 3, '合法字段保留');
ok(p2.upgrades.bogus === undefined, '未知升级 id 剔除');
ok(p2.stats.kills === 7, '统计保留');

// 2) 存档读写（fake storage）
const store = { m: {}, getItem(k){ return this.m[k]; }, setItem(k, v){ this.m[k] = v; } };
ok(eco.loadProfile(store).points === 0, '空存储 → 默认');
const prof = { version: 1, points: 55, upgrades: { dmg_up: 2 }, stats: { runs: 1, kills: 3 } };
eco.saveProfile(store, prof);
const loaded = eco.loadProfile(store);
ok(loaded.points === 55 && loaded.upgrades.dmg_up === 2, 'save→load 往返');

// 3) 得分转化 + 击杀得分
ok(eco.scoreToPoints(100) === 10, '100 分 → 10 点（10%）');
ok(eco.scoreToPoints(123, 0.1) === 12, '123 分 → 12 点（向下取整）');
ok(eco.killScore() === 20, '击杀得分 20');

// 4) 升级购买
const prof2 = eco.defaultProfile();
prof2.points = 100;
ok(eco.upgradeLevel(prof2, 'pen_up') === 0, '初始等级 0');
ok(eco.canBuyUpgrade(prof2, 'pen_up') === true, '点数足够可买');
ok(eco.buyUpgrade(prof2, 'pen_up') === true && prof2.points === 70, '购买扣点 30');
ok(eco.upgradeLevel(prof2, 'pen_up') === 1, '等级 +1');
ok(eco.buyUpgrade(prof2, 'bogus') === false, '未知 id 购买失败');
// 满级不可买
prof2.upgrades.pen_up = 5;
ok(eco.canBuyUpgrade(prof2, 'pen_up') === false, '满级不可买');

// 5) applyUpgrades：永久升级应用（permanent scope，每级叠一层）
const tank = { modifiers: [], stats: {}, base: {} };
const prof3 = { version: 1, points: 0, upgrades: { pen_up: 3, hp_up: 2 } };
const applied = eco.applyUpgrades(tank, prof3);
ok(applied === 5, '应用 3+2=5 层');
ok(tank.modifiers.length === 5 && tank.modifiers.every(m => m.scope === 'permanent'), 'permanent scope');
ok(tank.modifiers.filter(m => m.source === 'upgrade:pen_up').length === 3, 'pen_up 3 层');
ok(tank.modifiers.filter(m => m.source === 'upgrade:hp_up').length === 2, 'hp_up 2 层');

console.log('test-economy: 完成所有检查');
if (fails === 0) console.log('test-economy: 全部通过');
else console.error(`test-economy: ${fails} 项失败`);
process.exit(fails === 0 ? 0 : 1);
