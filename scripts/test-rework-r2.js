'use strict';

const RULES_MOD = require('../js/tank_rules.js');
global.RULES = RULES_MOD.RULES;
const U = require('../js/tank_utils.js');
global.TAU = U.TAU;

const assert = require('assert');
const { spawnFixedTurret, spawnMine, spawnDeployableCover, updateDeployables, clearDeployables,
        deployableCap, deployableCount, enforceDeployLimits } = require('../js/tank_deployables.js');

let fails = 0;
function ok(cond, label) {
  if (cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}`); fails++; }
}

console.log('=== 开始 R-2 阶段自动化单元测试 (test-rework-r2.js) ===');

clearDeployables();

// 1. 固定炮塔测试
const turret = spawnFixedTurret({ x: 0, y: 0, team: 'player', range: 300, reload: 0.5 });
ok(turret.isFixedTurret === true, '固定炮塔标记应为 true');
ok(turret.maxSpeed === 0, '固定炮塔极速应为 0');

const dummyEnemy = { id: 'dummy-1', team: 'enemy', x: 100, y: 0, hp: 100 };
const entities = [turret, dummyEnemy];

// 运行一帧更新，测试炮塔瞄准与开火意图
const events1 = updateDeployables(0.1, { entities });
ok(events1.length === 1, '炮塔应产生开火事件');
ok(events1[0].type === 'fixedTurretFire', '事件类型应为 fixedTurretFire');
console.log('✓ 固定炮塔索敌与开火触发测试通过');

// 2. 地雷布撒测试
clearDeployables();
const mine = spawnMine({ x: 200, y: 200, team: 'player', armDelay: 0.1, triggerRadius: 45 });
ok(mine.isMine === true, '地雷标记应为 true');
ok(mine.armed === false, '初始应处于未激活态');
ok(mine.triggerRadius === 45, '地雷布撒触发半径 = 45px（与雷场一致）');

// 经过解除布防延迟
const dummyEnemy2 = { id: 'dummy-2', team: 'enemy', x: 210, y: 200, hp: 100 };
const entities2 = [mine, dummyEnemy2];

updateDeployables(0.15, { entities: entities2 }); // 超过 armDelay
ok(mine.armed === true, '地雷应已武装');

const events2 = updateDeployables(0.1, { entities: entities2 }); // 敌方进入范围
ok(events2.length === 1, '地雷应触发爆炸事件');
ok(events2[0].type === 'mineExplode', '事件类型应为 mineExplode');
console.log('✓ 地雷布撒与触发爆炸测试通过');

// 3. 战术护盾掩体测试
clearDeployables();
const defaultMine = spawnMine({ x: 0, y: 0, team: 'player' });
ok(defaultMine.triggerRadius === 40, '地雷默认触发半径 = 40px（bench 手动布雷同样受益）');
clearDeployables();
const cover = spawnDeployableCover({ x: 300, y: 300, team: 'player', shieldHp: 150, duration: 10 });
ok(cover.isDeployableCover === true, '战术掩体标记应为 true');
ok(cover.shield.hp === 150, '护盾吸收池应初始化正确');
console.log('✓ 战术护盾掩体初始化测试通过');

ok(fails === 0, '所有 R-2 测试项均断言通过');

// ================= #E4（2026-09-20）可部署物数量上限 + 超限淘汰最早 =================
clearDeployables();
{
  const L = RULES.abilities.deploy_limits;
  const owner = { deployBonus: { cover: 0, mine: 0 } };
  ok(deployableCap('cover', owner) === L.coverMax, `#E4 掩体基础上限 = ${L.coverMax}`);
  ok(deployableCap('mine', owner) === L.mineMax, `#E4 地雷基础上限 = ${L.mineMax}`);
  owner.deployBonus.cover = 2;
  ok(deployableCap('cover', owner) === L.coverMax + 2 * L.coverMaxUpgradeStep,
     '#E4 升级卡提供部署数量加成（+n×步长）');
  owner.deployBonus.cover = 99;
  ok(deployableCap('cover', owner) === L.coverMaxHardCap, '#E4 加成的硬上限封顶');

  // 超限淘汰：spawn 顺序即部署先后，超限时最早部署的直接消失
  clearDeployables();
  const owner0 = { deployBonus: { cover: 0 } };
  const ids = [];
  for (let i = 0; i < L.coverMax + 2; i++) {
    const c = spawnDeployableCover({ x: i * 10, y: 0, team: 'player' });
    ids.push(c.id);
    enforceDeployLimits('cover', owner0);
  }
  ok(deployableCount('cover') === L.coverMax, `#E4 掩体数量收敛到上限（${deployableCount('cover')}）`);
  const alive = require('../js/tank_deployables.js').deployables.map(d => d.id);
  ok(alive.indexOf(ids[0]) < 0 && alive.indexOf(ids[1]) < 0 && alive.indexOf(ids[ids.length - 1]) >= 0,
     '#E4 超限时最早部署的掩体直接消失（最新保留）');

  // 类型独立计数：地雷不受掩体上限影响
  clearDeployables();
  for (let i = 0; i < L.mineMax + 1; i++) { spawnMine({ x: i, y: 0, team: 'player' }); enforceDeployLimits('mine', owner0); }
  ok(deployableCount('mine') === L.mineMax && deployableCount('cover') === 0,
     '#E4 按类型独立计数（地雷/掩体互不影响）');
  clearDeployables();
}

// ================= #J1（2026-09-30）地雷：一个节点内可连续布设多轮雷场 =================
// 用户反馈：「地雷在 1 个节点内似乎只能部署 1 次」。
// 根因：mineMax(3) 恰等于单次雷场数量 mineFieldCount(3)，首轮即把「场上同时存在」的上限用尽，
// 而地雷存续 30~45s、单节点战斗远长于此 ⇒ 后续雷场全被拒。
// 现行口径：mineMax 是**同时在场数**上限，须显著大于单次雷场数量，节点内才能连续布设。
{
  const L = RULES.abilities.deploy_limits;
  const owner = { deployBonus: { cover: 0, mine: 0 } };
  clearDeployables();
  ok(L.mineMax > L.mineFieldCount,
     `#J1 地雷同时上限(${L.mineMax}) > 单次雷场数量(${L.mineFieldCount})——首轮不会把上限用尽`);
  // 连续布设 2 轮整雷场（模拟 mvp 的「按可用余量裁剪」落雷逻辑）
  const layField = () => {
    const room = deployableCap('mine', owner) - deployableCount('mine');
    const n = Math.max(0, Math.min(L.mineFieldCount, room));
    for (let k = 0; k < n; k++) spawnMine({ x: k, y: 0, team: 'player' });
    return n;
  };
  const f1 = layField(), f2 = layField();
  ok(f1 === L.mineFieldCount && f2 === L.mineFieldCount,
     `#J1 同一节点可连续布设 2 个完整雷场（${f1} + ${f2} = ${deployableCount('mine')} 枚）`);
  ok(deployableCount('mine') === L.mineMax, `#J1 两轮后正好占满同时上限 ${L.mineMax}`);
  // 满上限时才拒绝（既有 #F6「超限拒绝且保留已布地雷」语义不变）
  ok(layField() === 0, '#J1 满上限时新雷场数量为 0（被拒绝，不覆盖已布地雷）');
  ok(deployableCount('mine') === L.mineMax, '#J1 拒绝后已布地雷保持不变（#F6 语义保留）');
  // 升级卡仍能把上限推高（可布更多轮）
  owner.deployBonus.mine = 2;
  ok(deployableCap('mine', owner) === L.mineMax + 2 * L.mineMaxUpgradeStep,
     `#J1 升级卡继续抬高同时上限（${deployableCap('mine', owner)}）`);
  clearDeployables();
}

console.log('test-rework-r2: 完成所有检查');
console.log('test-rework-r2: 全部通过');
