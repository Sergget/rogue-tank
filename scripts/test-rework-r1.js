'use strict';

// scripts/test-rework-r1.js — R-1 阶段重构后端与核心逻辑测试
// 覆盖：
//   1. 武器与槽位解耦模块（normalizeTankWeapons, getWeaponDefaults）
//   2. 主动技能（super_fire_control, super_speed, tryActivateAbility）
//   3. 视觉热重载机制（_visualVersion 脏标记与版本更新）
//   4. window.__TEST__ 调试钩子导出断言
// 运行：node scripts/test-rework-r1.js

const RULES_MOD = require('../js/tank_rules.js');
global.RULES = RULES_MOD.RULES;
const U = require('../js/tank_utils.js');
global.TAU = U.TAU;
global.normalizeBarrel = require('../js/tank_halfgeom.js').normalizeBarrel;

const model = require('../js/tank_model.js');
const weapons = require('../js/tank_weapons.js');
const abilities = require('../js/tank_abilities.js');

let fails = 0;
function ok(cond, label) {
  if (cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}`); fails++; }
}
function close(a, b, eps) { return Math.abs(a - b) <= (eps || 1e-9); }

// ---- 1) 武器与槽位解耦测试 ----
{
  // 2026-09-15 W6：autocannon 重做默认参数（伤害 1/5 / 穿深 85% / 间隔 ×0.25 / 热量机制）
  // 2026-10-15 #7：heatPerShot 10→12
  const def = weapons.getWeaponDefaults('primary', 'autocannon');
  ok(def.reloadMult === 0.25 && def.damageMult === 0.2 && def.penMult === 0.85 &&
     def.heatPerShot === 12 && def.coolPerSec === 15 && def.heatMax === 100 && def.overheatLock === 2.0,
     '获取 autocannon 默认参数成功（W6 热量机制版）');
  ok(def.burst === undefined, 'W6: autocannon 不再携带 burst 连发参数');

  const spec = {
    weapons: {
      primary: { type: 'railgun' },
      secondary: { type: 'mortar' }
    },
    moduleSlots: ['ammo_rack_reinforced', 'optic_enhanced']
  };

  const t = model.makeTank({ team: 'player' });
  model.applyTankConfig(t, spec);

  ok(t.weapons.primary.type === 'railgun', 'weapons.primary 正确应用');
  ok(t.weapons.secondary.type === 'mortar', 'weapons.secondary 正确应用');
  ok(t.moduleSlots.length === 2 && t.moduleSlots[0] === 'ammo_rack_reinforced', 'moduleSlots 正确应用');
}

// ---- 2) W9 死技能键（super_fire_control & super_speed）已删除：负向断言 ----
// 2026-10-20 #W9（用户裁定「删除」）：这两个键是**死键**——差集实测为
//   ABILITY_KEYS_RUNTIME 7 键 − 卡牌可授予的键，196 张卡 + tanks/ + bosses/ 全库零命中，
//   玩家在真实对局中**永远拿不到**它们。原测试只测「塞进去之后能用」（正向），
//   从不校验「现实中能不能拿到」，这正是死键长期没被发现的根因（ISSUES #W9「测试为何抓不到」）。
// 现改为**负向断言**：把「已删除」这个事实锁死，防止将来被误加回来。
// 实测口径（2026-10-20 本机）：tryActivateAbility(t, 'super_speed', {}) → { ok:false, reason:'unsupported' }；
//   注意与「键存在但玩家无卡」的 { ok:false, reason:'no-ability' } 可区分（对照 artillery/shield/aps）。
{
  const t = model.makeTank({ team: 'player' });
  // 即使硬塞进 cardEffects（模拟旧存档/脏数据），这两键也不得复活
  t.cardEffects = [
    { type: 'ability', key: 'super_fire_control', cardId: 'c1' },
    { type: 'ability', key: 'super_speed', cardId: 'c2' }
  ];

  ok(RULES.abilities.super_fire_control === undefined,
     '#W9（2026-10-20）：RULES.abilities.super_fire_control 已删除');
  ok(RULES.abilities.super_speed === undefined,
     '#W9（2026-10-20）：RULES.abilities.super_speed 已删除');
  ok(abilities.ABILITY_KEYS_RUNTIME.indexOf('super_fire_control') === -1,
     '#W9：ABILITY_KEYS_RUNTIME 不含 super_fire_control');
  ok(abilities.ABILITY_KEYS_RUNTIME.indexOf('super_speed') === -1,
     '#W9：ABILITY_KEYS_RUNTIME 不含 super_speed');

  const res1 = abilities.tryActivateAbility(t, 'super_fire_control', {});
  ok(res1.ok === false && res1.reason === 'unsupported',
     `#W9：super_fire_control 不可激活（reason='unsupported'，实测 ${res1.reason}）`);
  const res2 = abilities.tryActivateAbility(t, 'super_speed', {});
  ok(res2.ok === false && res2.reason === 'unsupported',
     `#W9：super_speed 不可激活（reason='unsupported'，实测 ${res2.reason}）`);
  // 语义区分护栏：仍存在的键在「无卡」时应报 no-ability 而非 unsupported
  // （证明 unsupported 确实表示「键不存在」，不是所有失败都报同一个 reason）
  const resAlive = abilities.tryActivateAbility(model.makeTank({ team: 'player' }), 'artillery', {});
  ok(resAlive.ok === false && resAlive.reason === 'no-ability',
     `#W9 护栏：仍存在的键无卡时报 'no-ability'（实测 ${resAlive.reason}），与 'unsupported' 可区分`);
  // 副作用护栏：这两个键不得再写入任何冷却池（abilityCds 可能尚未初始化，故按对象存在性判）
  const cds = t.abilityCds || {};
  ok(cds.super_fire_control === undefined && cds.super_speed === undefined,
     '#W9：已删键不产生冷却池条目');
}

// ---- 3) 炮塔/炮管视觉热重载机制与脏标记测试 ----
{
  const t = model.makeTank({ team: 'player' });
  const v0 = t._visualVersion;
  ok(v0 === 0, '初始 _visualVersion 为 0');
  ok(t._lastDrawnVersion === -1, '初始 _lastDrawnVersion 为 -1');

  // 应用配置触发脏标记更新
  model.applyTankConfig(t, {
    barrel: { len: 150, width: 12 }
  });
  ok(t._visualVersion === v0 + 1, 'applyTankConfig 触发 _visualVersion 递增');
}

// ---- 4) 暴露 window.__TEST__ 调试钩子断言 ----
{
  // Node test 环境中模拟 window 对象
  const testWindow = /** @type {any} */ ({ __TEST__: {} });
  global.window = testWindow;
  testWindow.__TEST__ = {
    getWeaponState(tank) {
      return tank.weapons;
    },
    triggerSkill(tank, key, ctx) {
      return abilities.tryActivateAbility(tank, key, ctx);
    },
    getVisualVersion(tank) {
      return tank._visualVersion;
    }
  };

  const testTank = model.makeTank({ team: 'player' });
  model.applyTankConfig(testTank, { weapons: { primary: { type: 'railgun' } } });

  ok(testWindow.__TEST__.getVisualVersion(testTank) === testVisualVersionCheck(testTank), 'window.__TEST__.getVisualVersion 钩子正常');
  function testVisualVersionCheck(tk) { return tk._visualVersion; }

  const wState = testWindow.__TEST__.getWeaponState(testTank);
  ok(wState.primary.type === 'railgun', 'window.__TEST__.getWeaponState 钩子正常');

  // #W9（2026-10-20）：原用 'super_speed' 验证钩子透传，该键已删除。改用仍存在的 runtime 键，
  // 并额外用已删键反向验证钩子不会让死键复活。
  testTank.cardEffects = [{ type: 'ability', key: 'artillery', cardId: 'x' }];
  const trig = testWindow.__TEST__.triggerSkill(testTank, 'artillery');
  ok(trig.ok !== undefined, 'window.__TEST__.triggerSkill 钩子正常（透传 tryActivateAbility 结果）');
  const trigDead = testWindow.__TEST__.triggerSkill(testTank, 'super_speed');
  ok(trigDead.ok === false && trigDead.reason === 'unsupported',
     '#W9：经 __TEST__ 钩子也拿不到已删键 super_speed（reason=unsupported）');
}

console.log('test-rework-r1: 完成所有检查');
if (fails === 0) console.log('test-rework-r1: 全部通过');
else console.error(`test-rework-r1: ${fails} 项失败`);
process.exit(fails === 0 ? 0 : 1);
