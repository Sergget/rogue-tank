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
  const def = weapons.getWeaponDefaults('primary', 'autocannon');
  ok(def.reloadMult === 0.25 && def.damageMult === 0.2 && def.penMult === 0.85 &&
     def.heatPerShot === 10 && def.coolPerSec === 15 && def.heatMax === 100 && def.overheatLock === 2.0,
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

// ---- 2) 新主动技能测试 (super_fire_control & super_speed) ----
{
  const t = model.makeTank({ team: 'player' });
  t.cardEffects = [
    { type: 'ability', key: 'super_fire_control', cardId: 'c1' },
    { type: 'ability', key: 'super_speed', cardId: 'c2' }
  ];

  const baseSpreadMult = t.stats.spreadMult;
  const baseMaxSpeed = t.stats.maxSpeed;

  // 触发超级火控
  const res1 = abilities.tryActivateAbility(t, 'super_fire_control', {});
  ok(res1.ok === true, 'super_fire_control 激活成功');
  ok(close(t.stats.spreadMult, baseSpreadMult * 0.3), 'super_fire_control 散布倍率生效 (×0.3)');
  ok(close(t.abilityCdT, RULES.abilities.super_fire_control.cooldown), 'super_fire_control 冷却设置正确');

  // 触发超级速度
  t.abilityCdT = 0; // 清除冷却以测试下一个
  const res2 = abilities.tryActivateAbility(t, 'super_speed', {});
  ok(res2.ok === true, 'super_speed 激活成功');
  ok(close(t.stats.maxSpeed, baseMaxSpeed * 1.5), 'super_speed 极速倍率生效 (×1.5)');
  ok(close(t.abilityCdT, RULES.abilities.super_speed.cooldown), 'super_speed 冷却设置正确');
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

  testTank.cardEffects = [{ type: 'ability', key: 'super_speed', cardId: 'x' }];
  const trig = testWindow.__TEST__.triggerSkill(testTank, 'super_speed');
  ok(trig.ok === true, 'window.__TEST__.triggerSkill 钩子正常');
}

console.log('test-rework-r1: 完成所有检查');
if (fails === 0) console.log('test-rework-r1: 全部通过');
else console.error(`test-rework-r1: ${fails} 项失败`);
process.exit(fails === 0 ? 0 : 1);
