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
// 冷却：**按技能独立冷却池** t.abilityCds[key]（秒，#C4c 2026-09-17 用户裁定「按技能独立冷却」
//   取代旧共享单字段 t.abilityCdT——此前 artillery/shield/overdrive/deploy_cover/super_fire_control/
//   super_speed 六个运行时能力共用一个冷却，超装填与炮击互相顶冷却）。激活成功即写
//   t.abilityCds[key] = RULES.abilities[key].reload|cooldown（artillery 用 reload，其余用
//   cooldown）；冷却期内 tryActivateAbility 一律拒绝 {ok:false, reason:'cooldown'}。逐帧递减由
//   接线层主循环调用 updateAbilityCds(t, dt)（同一池也承载 innate 键，天然统一）。
//   旧 updateAbilityCd（共享字段 t.abilityCdT）保留为废弃兼容助手，生产接线不再调用。
//
// 修理箱/医疗包（innate 内置能力，键 'repair'/'medkit'）：开局自带、无需卡牌持有检查
//   （绕过 hasAbility）。冷却走同一独立冷却池 t.abilityCds = { repair?, medkit?, extinguish? }
//   （秒），与运行时能力键互不串扰（按 key 隔离）；有效冷却 = (t.abilityBaseCd &&
//   t.abilityBaseCd[key]) || 45（mvp/node-map 把商店减免注入 abilityBaseCd，未注入时
//   回退基础 45s）。逐帧递减由接线层调用 updateAbilityCds(t, dt)；未接入时
//   tryActivateAbility 的 cooldown 判断天然容错（冷却永不结束而已，不报错）。
//   repair 效果：清 trackBroken/immobT + debuffs 中 engine/ammo/breech 模块键并 refreshStats；
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
let _spawnDeployableCover = (typeof spawnDeployableCover === 'function') ? spawnDeployableCover : null;

// 本模块支持的运行时能力键（其余 ABILITY_KEYS 如 smoke/recon 属烟幕/侦察等
// 其他系统，不在本入口分发范围）
const ABILITY_KEYS_RUNTIME = ['artillery', 'overdrive', 'shield', 'super_fire_control', 'super_speed', 'deploy_cover'];

// innate 内置能力键：开局自带、绕过卡牌持有检查（独立冷却池 t.abilityCds）
const ABILITY_KEYS_INNATE = ['repair', 'medkit', 'extinguish'];

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

// 聚合能力参数（读取 RULES 基础配置 + 收集 tank.cardEffects 中的 params 覆写）
function computeAbilityConfig(t, key) {
  const cfg = abilitiesConfig();
  const base = (cfg && cfg[key]) ? Object.assign({}, cfg[key]) : {};
  if (!t || !Array.isArray(t.cardEffects)) return base;
  for (let i = 0; i < t.cardEffects.length; i++) {
    const ef = t.cardEffects[i];
    if (ef && ef.type === 'ability' && ef.key === key && ef.params && typeof ef.params === 'object') {
      Object.assign(base, ef.params);
    }
  }
  return base;
}

// 持有查询：tank.cardEffects 是否含 {type:'ability', key}
function hasAbility(t, key) {
  return !!(t && t.cardEffects && t.cardEffects.some(function (ef) {
    return ef && ef.type === 'ability' && ef.key === key;
  }));
}

// 逐帧递减共享冷却（秒），归零钳制。
// 【废弃】#C4c（2026-09-17）起运行时能力改走按技能独立池 t.abilityCds（updateAbilityCds），
// 本函数仅为旧调用方/测试保留的兼容助手——生产接线（mvp 主循环）已不再调用。
function updateAbilityCd(t, dt) {
  if (dt <= 0 || !t || !(t.abilityCdT > 0)) return;
  t.abilityCdT = Math.max(0, t.abilityCdT - dt);
}

// 逐帧递减独立冷却池 t.abilityCds（运行时能力键 + innate 键统一，各键归零钳制）。
// #C4c（2026-09-17）：六类运行时能力的冷却也写入本池（按 key 隔离），接线层（mvp 主循环）逐帧调用。
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
    delete d.breech;   // P-49 炮闩受损（无法开火）属机械损伤 → 修理箱可修
    if (!blew) delete d.ammo;
    if (_refreshStats) _refreshStats(t);
    // 恢复 10% 最大耐久
    const maxHp = (t.stats && t.stats.maxHp) || t.maxHp || 100;
    if (t.hp > 0) t.hp = Math.min(maxHp, t.hp + maxHp * 0.10);
    t.abilityCds[key] = innateBaseCd(t, key);
    return { ok: true, key: key, repairedAmmoRack: !blew };
  }
  if (key === 'medkit') {
    const d = (t.debuffs = t.debuffs || {});
    MEDKIT_CREW_KEYS.forEach(function (k) { delete d[k]; });
    if (_refreshStats) _refreshStats(t);
    // 恢复 10% 最大耐久
    const maxHp = (t.stats && t.stats.maxHp) || t.maxHp || 100;
    if (t.hp > 0) t.hp = Math.min(maxHp, t.hp + maxHp * 0.10);
    t.abilityCds[key] = innateBaseCd(t, key);
    return { ok: true, key: key };
  }
  if (key === 'extinguish') {
    // #C6（2026-09-17 修复）：前置判定改读**真实起火状态 dotT**（发动机起火链路写入
    //   dotT/dotDps/dotSeconds/fireT/debuffs.engine，见 tank_physics resolveHit engine 分支；
    //   旧判定读 fireDebuffT，但该字段生产代码无任何写入路径 → 灭火器恒 'no-fire' 死功能）。
    //   扑灭时连带清 dotDps/dotSeconds/fireT 与 debuffs.engine（用户裁定；发动机模块损伤
    //   本体按既有语义仍属修理箱范围）。
    if (!(t.dotT > 0)) return { ok: false, reason: 'no-fire' };
    t.dotT = 0;
    t.dotDps = 0;
    t.dotSeconds = 0;
    t.fireT = 0;
    if (t.debuffs) delete t.debuffs.engine;
    if (t._dotAcc !== undefined) t._dotAcc = 0;
    if (t._dotTxt !== undefined) t._dotTxt = 0;
    if (_refreshStats) _refreshStats(t);
    t.abilityCds[key] = innateBaseCd(t, key);
    return { ok: true, key: key };
  }
  return { ok: false, reason: 'unsupported' };
}

/**
 * 主动能力统一入口。
 * @param {any} t 实体（读 cardEffects / abilityCds / turretAngle，写 abilityCds/reloadT/shield/modifiers）
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
  // #C4c（2026-09-17）：按技能独立冷却——检查/写入均为 t.abilityCds[key]，互不顶冷却
  t.abilityCds = t.abilityCds || {};
  if ((t.abilityCds[key] || 0) > 0) return { ok: false, reason: 'cooldown', cd: t.abilityCds[key] };

  // 各分支统一在成功路径写 t.abilityCds[key]（原为共享 t.abilityCdT）
  const setCd = (k, cfgKey) => { t.abilityCds[k] = _cooldownFor({ [k]: abilityCfg }, cfgKey); };

  const abilityCfg = computeAbilityConfig(t, key);
  switch (key) {
    case 'artillery': {
      const target = ctx && ctx.target;
      if (!target || typeof target.x !== 'number' || typeof target.y !== 'number') {
        return { ok: false, reason: 'need-target' };
      }
      if (!_callStrike) return { ok: false, reason: 'strike-unavailable' };
      const strikeOpts = {
        owner: t,
        rng: ctx.rng,
        delay: abilityCfg.delay,
        radius: abilityCfg.radius,
        dmgMult: abilityCfg.dmgMult,
        shellCount: abilityCfg.shellCount,
        shape: abilityCfg.shape,
        maxStrikes: abilityCfg.maxStrikes,
        stagger: abilityCfg.stagger,
        dir: (ctx && ctx.dir !== undefined) ? ctx.dir : ((t && t.turretAngle !== undefined) ? t.turretAngle : 0)
      };
      const strikes = _callStrike(target.x, target.y, strikeOpts);
      setCd('artillery', 'artillery');
      return { ok: true, key: key, strikes: strikes, config: abilityCfg };
    }
    case 'shield': {
      if (!ctx || (ctx.omni === undefined && ctx.dir === undefined)) {
        return { ok: false, reason: 'need-dir-or-omni' };
      }
      if (!_applyShield) return { ok: false, reason: 'shield-unavailable' };
      const shield = _applyShield(t, {
        omni: !!ctx.omni,
        dir: ctx.dir,
        hp: abilityCfg.hp,
        arc: abilityCfg.arc,
        dirDuration: abilityCfg.dirDuration,
        omniDuration: abilityCfg.omniDuration
      });
      setCd('shield', 'shield');
      return { ok: true, key: key, shield: shield, config: abilityCfg };
    }
    case 'overdrive': {
      const mult = _d(abilityCfg, 'reloadMult', 0.45);
      const dur = _d(abilityCfg, 'duration', 6);
      if (_removeModifierBySource) _removeModifierBySource(t, 'ability:overdrive');   // 防重复激活叠乘
      if (_addTimedModifier) {
        _addTimedModifier(t, { stat: 'reload', mode: 'mult', value: mult, source: 'ability:overdrive' }, dur * 1000);
      }
      t.reloadT = 0;   // 爆发装填：立即打完当前装填（决策见模块头注释）
      setCd('overdrive', 'overdrive');
      return { ok: true, key: key, reloadMult: mult, duration: dur, config: abilityCfg };
    }
    case 'deploy_cover': {
      if (!_spawnDeployableCover) {
        if (typeof require !== 'undefined') {
          try { _spawnDeployableCover = require('./tank_deployables.js').spawnDeployableCover; } catch(e) {}
        }
      }
      if (!_spawnDeployableCover) return { ok: false, reason: 'deploy-cover-unavailable' };
      const hp = _d(abilityCfg, 'hp', 200);
      const shieldHp = _d(abilityCfg, 'shieldHp', 150);
      const duration = _d(abilityCfg, 'duration', 30);
      // #C4b（2026-09-17 用户裁定）：部署位置改**炮塔正前方**（读 turretAngle，取代旧车体朝向）、
      // 距离与长度参数化进 RULES.abilities.deploy_cover（dist 缺省 90 / lenMult 缺省 1.6，
      // 取代旧硬编码 dist=50 + 缺省 hullLen 50）；掩体仍旋转 90° 横在车前。
      const dist = _d(abilityCfg, 'dist', 90);
      const lenMult = _d(abilityCfg, 'lenMult', 1.6);
      const angle = (t.turretAngle !== undefined) ? t.turretAngle : (t.hullAngle || 0);
      const baseLen = t.hullLen || 50;
      const cx = t.x + Math.cos(angle) * dist;
      const cy = t.y + Math.sin(angle) * dist;
      const cover = _spawnDeployableCover({
        team: t.team,
        x: cx,
        y: cy,
        hp: hp,
        maxHp: hp,
        shieldHp: shieldHp,
        duration: duration,
        hullLen: baseLen * lenMult,
        hullAngle: angle + Math.PI / 2
      });
      setCd('deploy_cover', 'deploy_cover');
      return { ok: true, key: key, cover: cover, config: abilityCfg };
    }
    case 'super_fire_control': {
      const spreadMult = _d(abilityCfg, 'spreadMult', 0.1);
      const aimSpeedMult = _d(abilityCfg, 'aimSpeedMult', 3.0);
      const dur = _d(abilityCfg, 'duration', 8);
      if (_removeModifierBySource) _removeModifierBySource(t, 'ability:super_fire_control');
      if (_addTimedModifier) {
        _addTimedModifier(t, { stat: 'spreadMult', mode: 'mult', value: spreadMult, source: 'ability:super_fire_control' }, dur * 1000);
        _addTimedModifier(t, { stat: 'aimSpeed', mode: 'mult', value: aimSpeedMult, source: 'ability:super_fire_control' }, dur * 1000);
      }
      setCd('super_fire_control', 'super_fire_control');
      return { ok: true, key: key, spreadMult, aimSpeedMult, duration: dur, config: abilityCfg };
    }
    case 'super_speed': {
      const accelMult = _d(abilityCfg, 'accelMult', 3.0);
      const maxSpeedMult = _d(abilityCfg, 'maxSpeedMult', 1.5);
      const dur = _d(abilityCfg, 'duration', 6);
      if (_removeModifierBySource) _removeModifierBySource(t, 'ability:super_speed');
      if (_addTimedModifier) {
        _addTimedModifier(t, { stat: 'enginePower', mode: 'mult', value: accelMult, source: 'ability:super_speed' }, dur * 1000);
        _addTimedModifier(t, { stat: 'maxSpeed', mode: 'mult', value: maxSpeedMult, source: 'ability:super_speed' }, dur * 1000);
      }
      setCd('super_speed', 'super_speed');
      return { ok: true, key: key, accelMult, maxSpeedMult, duration: dur, config: abilityCfg };
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
    computeAbilityConfig,
    hasAbility,
    updateAbilityCd,
    updateAbilityCds,
    innateBaseCd,
    tryActivateAbility
  };
}