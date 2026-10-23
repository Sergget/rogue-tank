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
  // 2026-10-22（第五批，用户裁定「地雷总数不设上限，只设雷场」）：mineMax* 三键已删除，
  //   deployableCap('mine') 恒返回 Infinity ⇒ enforceDeployLimits('mine') 是 no-op。
  ok(deployableCap('mine', owner) === Infinity, '#E4 地雷不设总数上限（deployableCap 恒 Infinity）');
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

  // 类型独立计数：2026-10-22 起地雷不设上限（超出也不再淘汰最早），掩体仍按上限淘汰
  clearDeployables();
  for (let i = 0; i < 40; i++) { spawnMine({ x: i, y: 0, team: 'player' }); enforceDeployLimits('mine', owner0); }
  ok(deployableCount('mine') === 40 && deployableCount('cover') === 0,
     `#E4 地雷不设上限（布 40 枚后仍有 ${deployableCount('mine')} 枚，未被淘汰）`);
  clearDeployables();
}

// ================= 2026-10-22（第五批）地雷：不设总数上限，只设「雷场槽位」 =================
// 用户裁定：「地雷总数不设上限，只设雷场，且不需要具体计算雷数量」。
// 沿革：#E4/#J1 时期的 mineMax / mineMaxUpgradeStep / mineMaxHardCap 三键已删除；
//   雷场数量改由 RULES.abilities.deploy_limits.mineFieldMaxDeploy（1→3）控制，
//   该判定在页面层（tank_battle.html activeMineFieldSlots），不在 deployables 模块。
{
  const L = RULES.abilities.deploy_limits;
  const owner = { deployBonus: { cover: 0, mine: 0 } };
  clearDeployables();
  ok(L.mineMax === undefined && L.mineMaxHardCap === undefined && L.mineMaxUpgradeStep === undefined,
     '#J1 旧 mineMax/mineMaxHardCap/mineMaxUpgradeStep 三键已删除（负向断言）');
  ok(L.mineFieldMaxDeploy === 1 && L.mineFieldMaxDeployCap === 3,
     `#J1 雷场槽位 ${L.mineFieldMaxDeploy} → 硬上限 ${L.mineFieldMaxDeployCap}（用户裁定最多同时 3 个）`);
  // 连续布设多轮：不再有任何总量上限 ⇒ 40 枚之后仍可继续布
  for (let k = 0; k < 40; k++) spawnMine({ x: k, y: 0, team: 'player' });
  enforceDeployLimits('mine', owner);
  ok(deployableCount('mine') === 40, `#J1 布 40 枚后数量不衰减（${deployableCount('mine')} 枚）`);
  ok(deployableCap('mine', owner) === Infinity, '#J1 deployableCap(mine) 恒 Infinity（无上限）');
  clearDeployables();
}

console.log('test-rework-r2: 完成所有检查');
// 2026-10-20 task-7：原为无条件 `console.log('test-rework-r2: 全部通过')` 且**从不设置退出码**
// ⇒ 真实断言红也会 EXIT=0，`scripts/run-tests.js`（`r.status === 0` 判定）会一律记为通过
// （假绿）。现改为按 fails 给退出码 + 有条件日志，与 test-render.js / test-physics.js 一致。
console.log(fails === 0 ? 'test-rework-r2: 全部通过' : `test-rework-r2: ${fails} 项失败`);
process.exitCode = fails === 0 ? 0 : 1;
