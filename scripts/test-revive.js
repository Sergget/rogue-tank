// test-revive.js — 死亡/复活状态机测试（Node 端，Pure Logic）
// 运行：node scripts/test-revive.js
'use strict';

const RULES_MOD = require('../js/tank_rules.js');
global.RULES = RULES_MOD.RULES;
const { createRNG } = require('../js/tank_nodegen.js');
const { findReviveSpot, pointInAnyCover, reviveTank, canRevive, reviveAt } = require('../js/tank_revive.js');

let fails = 0;
function ok(cond, label) {
  if (cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}`); fails++; }
}

// 1) findReviveSpot：无掩体 → 落在据点半径内
const outpost = { x: 1000, y: 1000 };
const rng = createRNG(42);
const spot = findReviveSpot(outpost, [], { x: 0, y: 0 }, rng);
const d = Math.hypot(spot.x - 1000, spot.y - 1000);
ok(d <= 150, `复活点在据点半径内（dist=${d.toFixed(1)}）`);

// 2) findReviveSpot：掩体包围盒避开（确定性验证多次尝试都避开 solid 掩体）
const covers = [
  { x: 1000, y: 1000, w: 120, h: 120, hp: Infinity, tier: 'full' },   // 小掩体在据点中心（半径 150 内留有环状无障碍区）
  { x: 880, y: 1000, w: 60, h: 60, hp: Infinity, tier: 'half' }
];
let allClear = true;
for (let i = 0; i < 20; i++) {
  const s = findReviveSpot(outpost, covers, { x: 0, y: 0 }, createRNG(i));
  if (pointInAnyCover(covers, s.x, s.y, 40)) { allClear = false; break; }
}
ok(allClear, '复活点避开 solid/graduated 掩体');

// 3) findReviveSpot：无据点 → 回退玩家出生点
const noOutpost = findReviveSpot(null, [], { x: 50, y: 60 }, createRNG(1));
ok(noOutpost.x === 50 && noOutpost.y === 60, '无据点 → 回退玩家出生点');

// 4) pointInAnyCover
ok(pointInAnyCover([{ x: 0, y: 0, w: 100, h: 100, hp: 1 }], 0, 0, 0) === true, '点在掩体内');
ok(pointInAnyCover([{ x: 0, y: 0, w: 100, h: 100, hp: 1 }], 200, 200, 0) === false, '点在掩体外');
ok(pointInAnyCover([{ x: 0, y: 0, w: 100, h: 100, hp: 0 }], 0, 0, 0) === false, '已毁掩体不阻挡（hp<=0 跳过）');

// 5) reviveTank：满状态 + 无敌 + 清状态
const tank = {
  hp: 0, maxHp: 100, stats: { maxHp: 100 },
  x: 0, y: 0, _dead: true, immobT: 9, dotT: 5, dotDps: 10, fireDebuffT: 3, fireT: 2,
  debuffs: { gunner: 5 }, trackBroken: true, ammoBlew: true, _blowFx: true, _trackFx: true
};
reviveTank(tank, { x: 500, y: 500 }, 3);
ok(tank.hp === 100 && tank._dead === false, '满状态复活');
ok(tank.x === 500 && tank.y === 500, '位置更新');
ok(tank.invulnT === 3, '无敌计时器 3s');
ok(tank.immobT === 0 && tank.dotT === 0 && tank.fireT === 0 && tank.trackBroken === false && tank.ammoBlew === false, 'debuff/起火/履带/殉爆 清空');
ok(Object.keys(tank.debuffs).length === 0, 'debuffs 清空');

// 6) canRevive / reviveAt：消耗次数、耗尽失败
const t2 = { hp: 0, maxHp: 100, stats: { maxHp: 100 }, revives: 2, _dead: true, x: 0, y: 0, debuffs: {}, dotT: 0 };
ok(canRevive(t2) === true, '有次数可复活');
ok(reviveAt(t2, outpost, [], { x: 0, y: 0 }, createRNG(2)) === true, 'reviveAt 成功');
ok(t2.revives === 1 && t2._dead === false && t2.hp === 100, '消耗 1 次 + 满状态');
ok(reviveAt(t2, outpost, [], { x: 0, y: 0 }, createRNG(3)) === true && t2.revives === 0, '再复活 → 0 次');
ok(canRevive(t2) === false, '次数耗尽不可复活');
ok(reviveAt(t2, outpost, [], { x: 0, y: 0 }, createRNG(4)) === false, 'reviveAt 耗尽返回 false');

console.log('test-revive: 完成所有检查');
if (fails === 0) console.log('test-revive: 全部通过');
else console.error(`test-revive: ${fails} 项失败`);
process.exit(fails === 0 ? 0 : 1);
