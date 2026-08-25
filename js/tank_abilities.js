'use strict';

// tank_abilities.js — 主动能力统一入口（P-17 子目标 3 阶段 2：纯逻辑层）。
// 纯逻辑模块：无 DOM / Canvas 依赖，Node 可测（module.exports 底部导出）。
//
// tryActivateAbility(t, key, ctx) 按 key 分发：
//   artillery  战术炮击（需 ctx.target {x,y}）→ 委托 js/tank_strike.js callStrike
//   shield     战术护盾（需 ctx.dir 或 ctx.omni）→ 委托 js/tank_shield.js applyShield
//   overdrive  超级装填（无目标）→ addTimedModifier({stat:'reload', mode:'mult',
//              value:RULES.abilities.overdrive.reloadMult, source:'ability:overdrive'})
//
// 持有检查：tank.cardEffects 含 {type:'ability', key} 才可激活（applyCardEffects 把
//   非 modifier 效果入队，见 js/tank_cards.js）；无卡 → {ok:false, reason:'no-ability'}。
//   maxStacks 语义：同 key 多张卡只影响「可用性」（有即可用），不叠加效果——能力效果
//   来自 RULES.abilities 固定参数，卡牌数量不增强数值（与 modifier 卡叠加规则区分）。
//
// 冷却：单字段 t.abilityCdT（秒，**所有能力共享**——同一时刻至多一个主动能力处于
//   冷却中；由接线层主循环逐帧调用 updateAbilityCd(t, dt) 递减）。激活成功即置
//   t.abilityCdT = RULES.abilities[key].reload|cooldown（artillery 用 reload，其余用
//   cooldown）；冷却期内 tryActivateAbility 一律拒绝 {ok:false, reason:'cooldown'}。
//
// 修理箱/医疗包（innate 内置能力，键 'repair'/'medkit'）：开局自带、无需卡牌持有检查
//   （绕过 hasAbility）。冷却走**独立字段池** t.abilityCds = { repair?, medkit? }（秒），
//   与 G/H/V 共享的 abilityCdT 互不干扰；有效冷却 = (t.abilityBaseCd &&
//   t.abilityBaseCd[key]) || 45（mvp/node-map 把商店减免注入 abilityBaseCd，未注入时
//   回退基础 45s）。逐帧递减由接线层调用 updateAbilityCds(t, dt)；未接入时
//   tryActivateAbility 的 cooldown 判断天然容错（冷却永不结束而已，不报错）。
//   repair 效果：清 trackBroken/immobT + debuffs 中 engine/ammo 模块键并 refreshStats；
//   弹药架殉爆（ammoBlew=true）不可修（保留殉爆与 ammo debuff），其余照常修复且激活成功。
//   medkit 效果：清 debuffs 中 gunner/loader/commander/driver 四类乘员键并 refreshStats。
//
// overdrive 细节（决策）：激活时立即清零 t.reloadT（「爆发装填」语义——当前装填
//   立即打完；RULES 注释即「主动爆发装填」）。持续 duration 秒内新开火设置的
//   reloadT = stats.reload × 0.45（fireTank 读 stats.reload，见 tank_mvp.html），
//   已装填中的倒计时因清零而不再受旧速影响；到期后由 refreshStats（addModifier 触发）
//   剪除 timed 修饰器，装填恢复原速。重复激活先 removeModifierBySource 去旧（防叠乘）。
//
// 依赖解析：浏览器端为共享脚本全局函数；Node 端经 export 块 require 兜底赋值
// （与 tank_model.js 的 _normalizeTankModules / tank_shield.js 的 _angDiff 同款）。

let _callStrike = (typeof callStrike === 'function') ? callStrike : null;
let _applyShield = (typeof applyShield === 'function') ? applyShield : null;
let _addTimedModifier = (typeof addTimedModifier === 'function') ? addTimedModifier : null;
let _removeModifierBySource = (typeof removeModifierBySource === 'function') ? removeModifierBySource : null;
let _refreshStats = (typeof refreshStats === 'function') ? refreshStats : null;

// 本模块支持的运行时能力键（其余 ABILITY_KEYS 如 smoke/recon 属烟幕/侦察等
// 其他系统，不在本入口分发范围）
const ABILITY_KEYS_RUNTIME = ['artillery', 'overdrive', 'shield'];

// innate 内置能力键：开局自带、绕过卡牌持有检查（独立冷却池 t.abilityCds）
const ABILITY_KEYS_INNATE = ['repair', 'medkit'];

// innate 有效冷却（秒）：mvp/node-map 把商店减免注入 t.abilityBaseCd[key]；未注入回退 45
const INNATE_BASE_CD_FALLBACK = 45;

// medkit 清除的四类乘员 debuff 键（与 MODULE_LABELS 乘员键对齐）
const MEDKIT_CREW_KEYS = ['gunner', 'loader', 'commander', 'driver'];

function abilitiesConfig() {
  return (typeof RULES !== 'undefined' && RULES.abilities) ? RULES.abilities : {};
}

function _d(cfg, key, fallback) {
  return (cfg && cfg[key] !== undefined) ? cfg[key] : fallback;
}

// 能力冷却时长：artillery 用 reload，overdrive/shield 用 cooldown
function _cooldownFor(cfg, key) {
  const c = (cfg && cfg[key]) || {};
  return c.reload !== undefined ? c.reload : (c.cooldown !== undefined ? c.cooldown : 0);
}

// 持有查询：tank.cardEffects 是否含 {type:'ability', key}
function hasAbility(t, key) {
  return !!(t && t.cardEffects && t.cardEffects.some(function (ef) {
    return ef && ef.type === 'ability' && ef.key === key;
  }));
}

// 逐帧递减共享冷却（秒），归零钳制
function updateAbilityCd(t, dt) {
  if (dt <= 0 || !t || !(t.abilityCdT > 0)) return;
  t.abilityCdT = Math.max(0, t.abilityCdT - dt);
}

// 逐帧递减 innate 独立冷却池 t.abilityCds（repair/medkit），各键归零钳制；
// 与 updateAbilityCd（G/H/V 共享 abilityCdT）互不干扰。接线层（mvp 主循环）需逐帧调用。
function updateAbilityCds(t, dt) {
  if (dt <= 0 || !t || !t.abilityCds) return;
  for (const k in t.abilityCds) {
    if (t.abilityCds[k] > 0) t.abilityCds[k] = Math.max(0, t.abilityCds[k] - dt);
  }
}

// innate 有效冷却：优先 t.abilityBaseCd[key]（mvp/node-map 注入的商店减免值）
function innateBaseCd(t, key) {
  const v = t && t.abilityBaseCd ? t.abilityBaseCd[key] : undefined;
  return (typeof v === 'number' && v > 0) ? v : INNATE_BASE_CD_FALLBACK;
}

// innate 激活（repair/medkit）：绕过 hasAbility；独立冷却池；冷却期内拒绝 'cooldown'
function _tryActivateInnate(t, key) {
  t.abilityCds = t.abilityCds || {};
  if ((t.abilityCds[key] || 0) > 0) {
    return { ok: false, reason: 'cooldown', cd: t.abilityCds[key] };
  }
  if (key === 'repair') {
    // 弹药架殉爆不可修：保留 ammoBlew 与 ammo debuff，其余照常修复、激活仍成功
    const blew = !!t.ammoBlew;
    t.trackBroken = false;
    t._trackFx = false;   // 复位一次性视觉标记：下次履带被击断可重新触发破片特效
    t.immobT = 0;
    const d = (t.debuffs = t.debuffs || {});
    delete d.engine;
    if (!blew) delete d.ammo;
    if (_refreshStats) _refreshStats(t);
    t.abilityCds[key] = innateBaseCd(t, key);
    return { ok: true, key: key, repairedAmmoRack: !blew };
  }
  if (key === 'medkit') {
    const d = (t.debuffs = t.debuffs || {});
    MEDKIT_CREW_KEYS.forEach(function (k) { delete d[k]; });
    if (_refreshStats) _refreshStats(t);
    t.abilityCds[key] = innateBaseCd(t, key);
    return { ok: true, key: key };
  }
  return { ok: false, reason: 'unsupported' };
}

/**
 * 主动能力统一入口。
 * @param {any} t 实体（读 cardEffects / abilityCdT / turretAngle，写 abilityCdT/reloadT/shield/modifiers）
 * @param {string} key 能力键 ∈ ABILITY_KEYS_RUNTIME
 * @param {any} [ctx] { target?: {x,y}（artillery）, dir?/omni?（shield）, rng?（透传给 callStrike） }
 * @returns {any} {ok:true, key, ...载荷} 或 {ok:false, reason, ...}
 */
function tryActivateAbility(t, key, ctx) {
  if (!t) return { ok: false, reason: 'no-tank' };
  // innate（repair/medkit）优先分发：开局自带、绕过 hasAbility 卡牌持有检查、独立冷却池
  if (ABILITY_KEYS_INNATE.indexOf(key) >= 0) return _tryActivateInnate(t, key);
  if (ABILITY_KEYS_RUNTIME.indexOf(key) < 0) return { ok: false, reason: 'unsupported' };
  if (!hasAbility(t, key)) return { ok: false, reason: 'no-ability' };
  if ((t.abilityCdT || 0) > 0) return { ok: false, reason: 'cooldown', cd: t.abilityCdT };

  const cfg = abilitiesConfig();
  switch (key) {
    case 'artillery': {
      const target = ctx && ctx.target;
      if (!target || typeof target.x !== 'number' || typeof target.y !== 'number') {
        return { ok: false, reason: 'need-target' };
      }
      if (!_callStrike) return { ok: false, reason: 'strike-unavailable' };
      const strikes = _callStrike(target.x, target.y, { owner: t, rng: ctx.rng });
      t.abilityCdT = _cooldownFor(cfg, 'artillery');
      return { ok: true, key: key, strikes: strikes };
    }
    case 'shield': {
      if (!ctx || (ctx.omni === undefined && ctx.dir === undefined)) {
        return { ok: false, reason: 'need-dir-or-omni' };
      }
      if (!_applyShield) return { ok: false, reason: 'shield-unavailable' };
      const shield = _applyShield(t, { omni: !!ctx.omni, dir: ctx.dir });
      t.abilityCdT = _cooldownFor(cfg, 'shield');
      return { ok: true, key: key, shield: shield };
    }
    case 'overdrive': {
      const o = cfg.overdrive || {};
      const mult = _d(o, 'reloadMult', 0.45);
      const dur = _d(o, 'duration', 6);
      if (_removeModifierBySource) _removeModifierBySource(t, 'ability:overdrive');   // 防重复激活叠乘
      if (_addTimedModifier) {
        _addTimedModifier(t, { stat: 'reload', mode: 'mult', value: mult, source: 'ability:overdrive' }, dur * 1000);
      }
      t.reloadT = 0;   // 爆发装填：立即打完当前装填（决策见模块头注释）
      t.abilityCdT = _cooldownFor(cfg, 'overdrive');
      return { ok: true, key: key, reloadMult: mult, duration: dur };
    }
  }
  return { ok: false, reason: 'unsupported' };
}

if (typeof module !== 'undefined' && module.exports) {
  // Node 测试端兜底：浏览器端这些是共享脚本全局函数，Node 端从 require 拿同一实现
  try {
    const S = require('./tank_strike.js');
    if (!_callStrike && S && typeof S.callStrike === 'function') _callStrike = S.callStrike;
  } catch (e) { /* strike 未加载时保持 null */ }
  try {
    const SH = require('./tank_shield.js');
    if (!_applyShield && SH && typeof SH.applyShield === 'function') _applyShield = SH.applyShield;
  } catch (e) { /* shield 未加载时保持 null */ }
  try {
    const M = require('./tank_model.js');
    if (!_addTimedModifier && M && typeof M.addTimedModifier === 'function') _addTimedModifier = M.addTimedModifier;
    if (!_removeModifierBySource && M && typeof M.removeModifierBySource === 'function') _removeModifierBySource = M.removeModifierBySource;
    if (!_refreshStats && M && typeof M.refreshStats === 'function') _refreshStats = M.refreshStats;
  } catch (e) { /* model 未加载时保持 null（浏览器端不会走到这里） */ }
  module.exports = {
    ABILITY_KEYS_RUNTIME,
    ABILITY_KEYS_INNATE,
    abilitiesConfig,
    hasAbility,
    updateAbilityCd,
    updateAbilityCds,
    innateBaseCd,
    tryActivateAbility
  };
}