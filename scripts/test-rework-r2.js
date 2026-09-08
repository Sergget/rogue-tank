'use strict';

const assert = require('assert');
const { spawnFixedTurret, spawnMine, spawnDeployableCover, updateDeployables, clearDeployables } = require('../js/tank_deployables.js');

console.log('=== 开始 R-2 阶段自动化单元测试 (test-rework-r2.js) ===');

clearDeployables();

// 1. 固定炮塔测试
const turret = spawnFixedTurret({ x: 0, y: 0, team: 'player', range: 300, reload: 0.5 });
assert.strictEqual(turret.isFixedTurret, true, '固定炮塔标记应为 true');
assert.strictEqual(turret.maxSpeed, 0, '固定炮塔极速应为 0');

const dummyEnemy = { id: 'dummy-1', team: 'enemy', x: 100, y: 0, hp: 100 };
const entities = [turret, dummyEnemy];

// 运行一帧更新，测试炮塔瞄准与开火意图
const events1 = updateDeployables(0.1, { entities });
assert.strictEqual(events1.length, 1, '炮塔应产生开火事件');
assert.strictEqual(events1[0].type, 'fixedTurretFire', '事件类型应为 fixedTurretFire');
console.log('✓ 固定炮塔索敌与开火触发测试通过');

// 2. 地雷布撒测试
clearDeployables();
const mine = spawnMine({ x: 200, y: 200, team: 'player', armDelay: 0.1, triggerRadius: 30 });
assert.strictEqual(mine.isMine, true, '地雷标记应为 true');
assert.strictEqual(mine.armed, false, '初始应处于未激活态');

// 经过解除布防延迟
const dummyEnemy2 = { id: 'dummy-2', team: 'enemy', x: 210, y: 200, hp: 100 };
const entities2 = [mine, dummyEnemy2];

updateDeployables(0.15, { entities: entities2 }); // 超过 armDelay
assert.strictEqual(mine.armed, true, '地雷应已武装');

const events2 = updateDeployables(0.1, { entities: entities2 }); // 敌方进入范围
assert.strictEqual(events2.length, 1, '地雷应触发爆炸事件');
assert.strictEqual(events2[0].type, 'mineExplode', '事件类型应为 mineExplode');
console.log('✓ 地雷布撒与触发爆炸测试通过');

// 3. 战术护盾掩体测试
clearDeployables();
const cover = spawnDeployableCover({ x: 300, y: 300, team: 'player', shieldHp: 150, duration: 10 });
assert.strictEqual(cover.isDeployableCover, true, '战术掩体标记应为 true');
assert.strictEqual(cover.shield.hp, 150, '护盾吸收池应初始化正确');
console.log('✓ 战术护盾掩体初始化测试通过');

console.log('test-rework-r2: 完成所有检查');
console.log('test-rework-r2: 全部通过');
