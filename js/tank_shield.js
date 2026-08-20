'use strict';

// tank_shield.js — 战术护盾（P-17 子目标 3 阶段 2：纯逻辑层）。
// 定向/全向弹道吸收护盾。纯逻辑模块：无 DOM / Canvas 依赖，Node 可测。
//
// 实体挂载字段（t.shield）：
//   { dir 定向朝向角（rad）, arc 吸收角（rad）, hp 剩余吸收量,
//     t 剩余时长（秒）, omni 全向标志 }
//
// 数据来源（RULES.abilities.shield，数据契约已落地）：
//   dirDuration 8 / omniDuration 4 / arc π/3 / absorbCap 150 / cooldown 25
//   applyShield：
//     omni → 全向：arc=2π、时长 omniDuration；
//     定向 → arc=π/3、时长 dirDuration、dir 缺省取 t.turretAngle；
//     重复施放刷新时长与 hp（吸收池重置为 absorbCap）。
//
// absorbCap 语义（本模块定）：**累计吸收上限**——护盾总吸收池 = absorbCap（150），
//   每发命中消耗池内相应量；单发伤害 ≤ 剩余池 → 全额吸收（absorbDamage 返回 0）；
//   单发超限 → 池耗尽的部分吸收、超出部分穿透（absorbDamage 返回剩余伤害）；
//   池耗尽护盾破裂（t.shield 移除，后续命中不再吸收）。

// RULES 缺省兜底（与 RULES.abilities.shield 默认值一致；RULES 缺失时行为不变）
let _angDiff = (typeof angDiff === 'function') ? angDiff : null;   // tank_utils.js（Node 端 export 块兜底）

function shieldConfig() {
  return (typeof RULES !== 'undefined' && RULES.abilities && RULES.abilities.shield)
    ? RULES.abilities.shield : {};
}

function _d(cfg, key, fallback) {
  return (cfg && cfg[key] !== undefined) ? cfg[key] : fallback;
}

// 护盾是否生效：存在 + 池未耗尽 + 时长未到
function hasShield(t) {
  return !!(t && t.shield && t.shield.hp > 0 && t.shield.t > 0);
}

/**
 * 开启护盾。opts: { dir?, omni? }
 *   omni → 全向：弧 2π、时长 omniDuration；否则定向：弧 = RULES arc、时长 dirDuration，
 *   dir 缺省取 t.turretAngle（护盾朝向炮塔，接线层如需固定朝向上传 ctx.dir）。
 * 重复施放：刷新时长与吸收池（hp = absorbCap）。
 * @returns {any} 护盾对象（已挂载 t.shield）
 */
function applyShield(t, opts) {
  const cfg = shieldConfig();
  const omni = !!(opts && opts.omni);
  const dir = (opts && opts.dir !== undefined) ? opts.dir : (t.turretAngle || 0);
  const sh = {
    dir: omni ? 0 : dir,
    arc: omni ? Math.PI * 2 : _d(cfg, 'arc', Math.PI / 3),
    hp: _d(cfg, 'absorbCap', 150),
    t: omni ? _d(cfg, 'omniDuration', 4) : _d(cfg, 'dirDuration', 8),
    omni: omni
  };
  t.shield = sh;
  return sh;
}

// 逐帧递减护盾时长，到期移除（t.shield = null）。池耗尽由 absorbDamage 移除。
function updateShield(t, dt) {
  if (dt <= 0 || !t || !t.shield) return;
  t.shield.t -= dt;
  if (t.shield.t <= 0) t.shield = null;
}

/**
 * 纯判定：炮弹入射方向（shell.dx/dy）是否落在吸收角内。
 * 全向恒吸收；定向 angDiff(入射角, dir) < arc/2（严格小于，边界角不吸收）。
 * 无护盾 / 池耗尽 / 炮弹无效 → false。
 * @returns {boolean}
 */
function shieldAbsorbs(t, shell) {
  if (!hasShield(t) || !shell) return false;
  const sh = t.shield;
  if (sh.omni) return true;
  const incoming = Math.atan2(shell.dy, shell.dx);
  return Math.abs(_angDiff(incoming, sh.dir)) < sh.arc / 2;
}

/**
 * 吸收伤害：消耗护盾吸收池，返回**剩余穿透伤害**。
 * 池耗尽 → 护盾破裂（t.shield 移除）；单发超限时超出部分穿透。
 * @returns {number} 剩余未被吸收的伤害（0 = 全额吸收）
 */
function absorbDamage(t, dmg) {
  if (!hasShield(t) || !(dmg > 0)) return dmg;
  const absorbed = Math.min(t.shield.hp, dmg);
  t.shield.hp -= absorbed;
  if (t.shield.hp <= 0) t.shield = null;   // 破裂
  return dmg - absorbed;
}

if (typeof module !== 'undefined' && module.exports) {
  // Node 测试端兜底：浏览器端 angDiff 是 tank_utils.js 的全局函数，Node 端从 require 拿同一实现
  try {
    const U = require('./tank_utils.js');
    if (!_angDiff && U && typeof U.angDiff === 'function') _angDiff = U.angDiff;
  } catch (e) { /* utils 未加载时保持 null（浏览器端不会走到这里） */ }
  module.exports = {
    shieldConfig,
    applyShield,
    updateShield,
    shieldAbsorbs,
    absorbDamage,
    hasShield
  };
}