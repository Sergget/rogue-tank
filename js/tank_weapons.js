'use strict';

// tank_weapons.js — 武器与槽位解耦模块（R-1 阶段）
// 提供主武器（Primary Weapon）与副武器/挂载（Secondary Weapon）的数据契约、
// 属性计算与向后兼容适配。

const WEAPON_DEFAULTS = {
  primary: {
    standard:    { reloadMult: 1.0, damageMult: 1.0, penMult: 1.0, shellSpeedMult: 1.0, burst: 1 },
    autocannon:  { reloadMult: 0.3, damageMult: 0.35, penMult: 0.8, shellSpeedMult: 0.9, burst: 3 },
    double_barrel: { reloadMult: 1.4, damageMult: 1.0, penMult: 1.0, shellSpeedMult: 1.0, count: 2, stagger: 0.15 },
    railgun:     { reloadMult: 2.2, damageMult: 1.5, penMult: 2.0, shellSpeedMult: 2.5, burst: 1 },
    howitzer:    { reloadMult: 2.5, damageMult: 2.0, penMult: 0.7, shellSpeedMult: 0.7, splashRadius: 100, isArc: true, range: 500, accuracySpread: 0.04 }
  },
  secondary: {
    none:        { reload: 0, damage: 0 },
    mortar:      { range: 450, aoe: 90, reload: 8, damage: 60, isArc: true, accuracySpread: 0.05 },
    missile:     { guided: true, reload: 12, damage: 140 },
    rocket:      { count: 4, reload: 10, damage: 35 },
    mine_layer:  { duration: 30, reload: 15, damage: 100 }
  }
};

function getWeaponDefaults(category, type) {
  const cat = WEAPON_DEFAULTS[category];
  if (!cat) return {};
  return cat[type] || cat[Object.keys(cat)[0]] || {};
}

// 兼容旧坦克 JSON 转换为 weapons 结构
function normalizeTankWeapons(spec) {
  if (!spec) return { primary: { type: 'standard', stats: {} }, secondary: { type: 'none', stats: {} } };
  if (spec.weapons) {
    return {
      primary: {
        type: (spec.weapons.primary && spec.weapons.primary.type) || 'standard',
        stats: Object.assign({}, getWeaponDefaults('primary', (spec.weapons.primary && spec.weapons.primary.type) || 'standard'), spec.weapons.primary ? spec.weapons.primary.stats : {})
      },
      secondary: {
        type: (spec.weapons.secondary && spec.weapons.secondary.type) || 'none',
        stats: Object.assign({}, getWeaponDefaults('secondary', (spec.weapons.secondary && spec.weapons.secondary.type) || 'none'), spec.weapons.secondary ? spec.weapons.secondary.stats : {})
      }
    };
  }
  // Fallback for legacy specs
  return {
    primary: { type: 'standard', stats: getWeaponDefaults('primary', 'standard') },
    secondary: { type: 'none', stats: getWeaponDefaults('secondary', 'none') }
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    WEAPON_DEFAULTS,
    getWeaponDefaults,
    normalizeTankWeapons
  };
}
