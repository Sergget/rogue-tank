'use strict';

// tank_cards.js — 卡牌系统（数据驱动，P-09 / DEVELOPMENT.md §2.13）。
// 纯逻辑模块：无 DOM / Canvas 依赖，Node 可测（module.exports 底部导出）。
//
// 定位（§2.4 已定型）：卡牌 = 局内节点间三选一的「改装/战术强化」，不是手牌指令。
// 效果分类型：modifier（直接走 base/modifiers/stats 管道，立即生效）/ ammo（弹种改造）/
// ability（主动装置）/ passive（特殊被动）/ drone（伴随浮游炮）/ economy（经济，M10 落地）。
// 拟真主题、拒绝魔幻：卡牌围绕装甲/穿深/装填/机动/散布/视野/弹种/乘员展开。
//
// 数据来源：cards/<id>.json 一型一文件（与 tanks/ 同惯例），浏览器经 /api/cards 聚合，
// Node 测试用 require 本地聚合。validateCard 是唯一 schema 来源；content_designer 与
// validate-content.js 共用同一套校验。

// ---------- 枚举与白名单（唯一 schema 来源） ----------

const CARD_RARITIES = ['common', 'rare', 'epic', 'legendary'];
const RARITY_WEIGHTS = { common: 50, rare: 30, epic: 15, legendary: 5 };

// 5 大流派标签（构筑方向，卡牌可多标签；后续流派构筑/加成按此聚合）
const CARD_TAGS = ['重甲', '狙击', '机动', '爆破', '支援'];

// 可作用 stat 白名单（与 tank_model.js computeStats 对齐；armor 用路径 armor.<part>[.<face>]）
const MODIFIER_STATS = [
  'penetration', 'damage', 'reload', 'shellSpeed', 'maxSpeed', 'turnRate', 'turretTurnRate',
  'maxHp', 'weight', 'enginePower', 'trackLock', 'ammoMult', 'crewMult',
  'dotRatioMult', 'dotDurationMult', 'spreadMult', 'aimSpeed'
];

// 弹种改造：key = 弹种（RULES.ammoTypes 14 键，弹种链 2026-09-13；hec 已移除 2026-09-14）
const AMMO_KEYS = ['ap', 'apcr', 'apds', 'apfsds', 'apfsds_ad', 'he', 'heat', 'heatfs', 'tandem_heat', 'heavy_tandem_heat', 'aphe', 'hesh', 'proximity_he', 'blast_he'];
const AMMO_FIELDS = ['pen', 'dmg', 'speed'];

// 主动装置（ability，运行时在对应里程碑接入按键触发；schema 先行）
const ABILITY_KEYS = ['repair', 'extinguish', 'recon', 'track_repair', 'artillery', 'overdrive', 'shield', 'deploy_cover'];

// 无人机种类（drone）：scout=侦察指示（视口外敌军位置箭头）/ striker=近身自动索敌打击。
// kind 缺失时兼容旧数据（默认 striker，伴随浮游炮语义）。
const DRONE_KINDS = ['scout', 'striker'];

// 特殊被动（passive：非数值修饰器的机制性被动）
const PASSIVE_KEYS = ['reactive_armor', 'angle_boost', 'overmatch', 'spall_liner', 'commander_sight'];

// 经济效果（M10 落地；schema 先行）
const ECONOMY_FIELDS = ['scoreMul', 'shopDiscount', 'startScore', 'reviveCount'];

// 副武器槽位与类型（R-1 / 阶段四）；主武器类型（阶段七 7.3）与 RULES.weaponTypes 对齐
const WEAPON_SLOTS = ['primary', 'secondary'];
const WEAPON_SECONDARY_TYPES = ['mortar', 'missile', 'rocket', 'mine_layer', 'turret'];
const WEAPON_PRIMARY_TYPES = ['standard', 'autocannon', 'double_barrel', 'railgun'];
const ALL_WEAPON_TYPES = WEAPON_SECONDARY_TYPES.concat(WEAPON_PRIMARY_TYPES);

// 装甲路径：part ∈ hull/turret，face ∈ front/side/rear
const ARMOR_PARTS = ['hull', 'turret'];
const ARMOR_FACES = ['front', 'side', 'rear'];

// 效果类型：type 决定 params 的校验 schema
const CARD_EFFECT_TYPES = ['modifier', 'ammo', 'ability', 'passive', 'drone', 'economy', 'weapon'];

// ---------- 校验 ----------

// 校验单张卡，返回错误字符串数组（空数组 = 合法）。
function validateCard(card) {
  const errs = [];
  if (!card || typeof card !== 'object') return ['card 不是对象'];
  if (!card.id || typeof card.id !== 'string') errs.push('id 缺失/非字符串');
  if (!card.name || typeof card.name !== 'string') errs.push('name 缺失');
  if (!CARD_RARITIES.includes(card.rarity)) errs.push(`rarity 非法: ${card.rarity}（应为 ${CARD_RARITIES.join('/')}）`);
  if (card.tags !== undefined) {
    if (!Array.isArray(card.tags)) errs.push('tags 应为数组');
    else for (const t of card.tags) if (!CARD_TAGS.includes(t)) errs.push(`tag 非法: ${t}`);
  }
  if (!Array.isArray(card.effects) || card.effects.length === 0) {
    errs.push('effects 应为非空数组');
  } else {
    for (let i = 0; i < card.effects.length; i++) {
      errs.push(...validateCardEffect(card.effects[i], `effects[${i}]`));
    }
  }
  if (card.maxStacks !== undefined && (!Number.isInteger(card.maxStacks) || card.maxStacks < 1)) {
    errs.push('maxStacks 应为正整数');
  }
  return errs;
}

// 校验单个效果对象
function validateCardEffect(ef, path) {
  const errs = [];
  if (!ef || typeof ef !== 'object') return [`${path}: effect 不是对象`];
  if (!CARD_EFFECT_TYPES.includes(ef.type)) return [`${path}: 未知效果类型 ${ef.type}`];
  const p = `${path}(${ef.type})`;
  switch (ef.type) {
    case 'modifier':
      if (typeof ef.stat !== 'string') errs.push(`${p}: 缺 stat`);
      else if (!MODIFIER_STATS.includes(ef.stat) && !isArmorPath(ef.stat)) errs.push(`${p}: stat 非法 ${ef.stat}`);
      if (ef.mode !== 'add' && ef.mode !== 'mult') errs.push(`${p}: mode 应为 add/mult`);
      if (typeof ef.value !== 'number' || !Number.isFinite(ef.value)) errs.push(`${p}: value 应为有限数值`);
      break;
    case 'ammo':
      if (!AMMO_KEYS.includes(ef.key)) errs.push(`${p}: key 非法 ${ef.key}`);
      if (!AMMO_FIELDS.includes(ef.field)) errs.push(`${p}: field 非法 ${ef.field}`);
      if (ef.mode !== 'add' && ef.mode !== 'mult') errs.push(`${p}: mode 应为 add/mult`);
      if (typeof ef.value !== 'number' || !Number.isFinite(ef.value)) errs.push(`${p}: value 应为有限数值`);
      break;
    case 'ability':
      if (!ABILITY_KEYS.includes(ef.key)) errs.push(`${p}: key 非法 ${ef.key}`);
      if (ef.params !== undefined && (typeof ef.params !== 'object' || Array.isArray(ef.params) || ef.params === null)) {
        errs.push(`${p}: params 应为对象`);
      }
      // #A28：requiresAbility 可选——声明本卡为「主动技能 upgrade 卡」，抽取期必须已持有该能力
      //（语义由 cardEligible 消费，见 §「武器/能力资格过滤」）。显式白名单校验：拼写错误
      //（如 'artilery'）会让资格过滤静默失效，进而把升级卡发给未持有基础能力的玩家。
      if (ef.requiresAbility !== undefined && !ABILITY_KEYS.includes(ef.requiresAbility)) {
        errs.push(`${p}: requiresAbility 非法 ${ef.requiresAbility}（应为 ${ABILITY_KEYS.join('/')} 之一）`);
      }
      break;
    case 'passive':
      if (!PASSIVE_KEYS.includes(ef.key)) errs.push(`${p}: key 非法 ${ef.key}`);
      if (ef.value !== undefined && (typeof ef.value !== 'number' || !Number.isFinite(ef.value))) errs.push(`${p}: value 应为有限数值`);
      break;
    case 'drone':
      // kind 可缺省（旧数据兼容，运行时默认 striker）；提供时必须在白名单内
      if (ef.kind !== undefined && !DRONE_KINDS.includes(ef.kind)) errs.push(`${p}: kind 非法 ${ef.kind}（应为 ${DRONE_KINDS.join('/')}）`);
      break;
    case 'economy':
      if (!ECONOMY_FIELDS.includes(ef.field)) errs.push(`${p}: field 非法 ${ef.field}`);
      if (typeof ef.value !== 'number' || !Number.isFinite(ef.value)) errs.push(`${p}: value 应为有限数值`);
      break;
    case 'weapon':
      if (!ef.action || (ef.action !== 'install' && ef.action !== 'upgrade')) errs.push(`${p}: action 应为 install/upgrade`);
      if (ef.slot !== undefined && !WEAPON_SLOTS.includes(ef.slot)) errs.push(`${p}: slot 非法 ${ef.slot}`);
      if (ef.weaponType && !ALL_WEAPON_TYPES.includes(ef.weaponType)) errs.push(`${p}: weaponType 非法 ${ef.weaponType}`);
      if (ef.statOverrides && (typeof ef.statOverrides !== 'object' || Array.isArray(ef.statOverrides))) errs.push(`${p}: statOverrides 应为对象`);
      break;
  }
  return errs;
}

// 是否装甲路径：armor.hull / armor.hull.front / armor.turret.side 等
function isArmorPath(stat) {
  const parts = String(stat).split('.');
  if (parts[0] !== 'armor') return false;
  if (parts.length === 2) return ARMOR_PARTS.includes(parts[1]);
  if (parts.length === 3) return ARMOR_PARTS.includes(parts[1]) && ARMOR_FACES.includes(parts[2]);
  return false;
}

// 聚合校验一组卡（含 id 唯一性），返回 { errors: [{id, errs}], duplicates: [id] }
function validateCardSet(cards) {
  const byId = {};
  const errors = [];
  const duplicates = [];
  for (const c of cards) {
    if (byId[c.id]) { duplicates.push(c.id); continue; }
    byId[c.id] = c;
    const errs = validateCard(c);
    if (errs.length) errors.push({ id: c.id, errs });
  }
  return { errors, duplicates };
}

// ---------- 应用效果 ----------

// 卡牌已叠加次数（支持修饰器卡与纯机制卡统计）
function cardStackCount(tank, cardId) {
  if (!tank) return 0;
  const modCount = (tank.modifiers || []).filter(m => m && m.source === 'card:' + cardId).length;
  if (modCount > 0) return modCount;
  return (tank.cardEffects || []).filter(e => e && e.cardId === cardId).length;
}

// 应用卡牌效果到坦克。modifier 走 addModifier 立即生效；其余类型挂到 tank.cardEffects 供
// 对应里程碑（弹种/主动装置/被动/浮游炮/经济）消费。ctx 可注入自定义处理（测试/编辑器用）。
// 返回已应用的效果数组。
function applyCardEffects(tank, card, ctx) {
  // maxStacks 最终防线 (#A23 d)：拒绝「已叠到上限」的卡牌再应用——按「应用次数」`_cardApplyCount` 计数，
  // 而非 cardStackCount（后者对 modifier 卡计数的是修饰器条数，会误判多效果卡的上限）。
  // 语义（ISSUE #A23 定案）：
  //   - ammo 弹种升级卡豁免：chain 链路本身幂等且允许「首次 no-op（前驱未携）→ 次次真正替换」，
  //     （见 test-cards apfsds 链测试）；不按此防线截断。
  //   - modifier/weapon/ability/drone/passive/economy：仅允许应用 ≤ maxStacks 次，第 maxStacks+1 次拒绝。
  if (tank && !tank._cardApplyCount) tank._cardApplyCount = {};
  const isAmmoCard = card && Array.isArray(card.effects) && card.effects.every(e => !e || e.type === 'ammo');
  if (card && card.maxStacks && !isAmmoCard && tank && (tank._cardApplyCount[card.id] || 0) >= card.maxStacks) return [];

  const applied = [];
  for (const ef of card.effects) {
    if (ef.type === 'modifier') {
      addModifier(tank, { stat: ef.stat, mode: ef.mode, value: ef.value, source: 'card:' + card.id, scope: 'run' });   // 卡牌=单局（run 结束清除）
      applied.push(ef);
    } else {
      if (!tank.cardEffects) tank.cardEffects = [];
      tank.cardEffects.push(Object.assign({}, ef, { cardId: card.id }));
      applied.push(ef);

      // 阶段四 4b / #A22：weapon 安装 / 升级（#A22 单槽不变量：删除 secondarySlots/activeSecondaryIndex 双槽路径）
      if (ef.type === 'weapon' && tank) {
        if (!tank.weapons) {
          tank.weapons = { primary: { type: 'standard', stats: {} }, secondary: { type: 'none', stats: {} } };
        }
        const slot = ef.slot || 'secondary';
        const wType = ef.weaponType || ef.typeKey;
        const action = ef.action;
        if (slot === 'primary') {
          if (!tank.weapons.primary) tank.weapons.primary = { type: 'standard', stats: {} };
          if (action === 'install') {
            if (wType) tank.weapons.primary.type = wType;
            if (ef.statOverrides && typeof ef.statOverrides === 'object') {
              tank.weapons.primary.stats = Object.assign({}, tank.weapons.primary.stats || {}, ef.statOverrides);
            }
            tank.weapons.primary._spec = null;
            tank._dbState = null;   // 2026-09-15 W4：主武器换装后双管状态重置
          } else if (action === 'upgrade') {
            // upgrade：仅当 weapons.primary.type===wType 时合并 statOverrides 并清缓存
            if (wType && tank.weapons.primary.type === wType && ef.statOverrides && typeof ef.statOverrides === 'object') {
              tank.weapons.primary.stats = Object.assign({}, tank.weapons.primary.stats || {}, ef.statOverrides);
              tank.weapons.primary._spec = null;
              tank._dbState = null;
            }
            // type!==wType → no-op，不写入
          }
        } else {
          // secondary：统一 weapons.secondary 单槽
          if (!tank.weapons.secondary) tank.weapons.secondary = { type: 'none', stats: {} };
          if (action === 'install') {
            // 仅当 secondary.type==='none'/'undefined' 时写入；槽已有其他类型 → no-op（effect 仍入 cardEffects）
            if (wType && (tank.weapons.secondary.type === 'none' || tank.weapons.secondary.type === undefined)) {
              const defStats = (typeof getWeaponDefaults === 'function') ? getWeaponDefaults('secondary', wType) : {};
              tank.weapons.secondary = {
                type: wType,
                stats: Object.assign({}, defStats, ef.statOverrides || {})
              };
            }
          } else if (action === 'upgrade') {
            // 仅当 secondary.type===wType 时合并 statOverrides；type 不匹配 → no-op
            if (wType && tank.weapons.secondary.type === wType && ef.statOverrides && typeof ef.statOverrides === 'object') {
              tank.weapons.secondary.stats = Object.assign({}, tank.weapons.secondary.stats || {}, ef.statOverrides);
              if (tank.weapons.secondary._spec) tank.weapons.secondary._spec = null;
            }
          }
        }
      }

      // 弹种链 2026-09-13 + 2026-09-15 用户修订：升级替换语义 —— 弹种升级卡把 loadout 槽位内的
      // 「链上直系前驱」原地替换（PLAN.md 阶段六）。链表（用户定案三链）：
      //   KE：      ap→apcr→apds→apfsds→apfsds_ad
      //   HE 榴弹链：he→aphe→hesh→proximity_he(he-vt)→blast_he(he-op)
      //   HEAT 链： he→heat→heatfs→tandem_heat(t-heat)→heavy_tandem_heat(ht-heat)
      // HE 双分支（he→heat / he→aphe）：首条分支升级「先新增」弹种并保留 he（用户裁定）；
      // 第二条分支到达时再把 he 槽替换为第二条分支的弹种；之后按各链直系前驱继续替换。
      // 禁止跳级（用户裁定）：直系前驱不在 loadout 时本效果不新增、不替换首槽（无操作）。
      // replaceAmmo 字段仍可显式指定被替换者；未指定时按链上直接后继自动演变。
      // 阶段六 6.3：链上升级成功时把目标弹种写入 tank.unlockedAmmo（解锁标记，接线层负责持久化）。
      if (ef.type === 'ammo' && tank && Array.isArray(tank.ammoLoadout)) {
        const CHAIN = (typeof RULES !== 'undefined' && RULES.ammoChain) ? RULES.ammoChain : null;
        const pred = ef.replaceAmmo || (CHAIN && CHAIN[ef.key]) || null;   // 直系前驱
        let applied = false;
        if (pred) {
          const idx = tank.ammoLoadout.indexOf(pred);
          if (idx >= 0 && !tank.ammoLoadout.includes(ef.key)) {
            // HE 双分支：首条分支新增保留 he；槽满（第二条分支）把 he 槽替换为该分支弹种
            if (pred === 'he' && tank.ammoLoadout.length < 3) {
              tank.ammoLoadout.push(ef.key);
            } else {
              tank.ammoLoadout[idx] = ef.key;
              if (tank.ammoKey === pred) tank.ammoKey = ef.key;
            }
            applied = true;
          }
          // pred 不在 loadout（或目标已在 loadout）→ 禁止跳级 / 幂等：无操作
        }
        if (applied) {
          if (!Array.isArray(tank.unlockedAmmo)) tank.unlockedAmmo = ['ap', 'he'];
          if (tank.unlockedAmmo.indexOf(ef.key) < 0) tank.unlockedAmmo.push(ef.key);   // 解锁目标弹种
        }
      }
    }
  }
  // #A23 d：非 ammo 且带 maxStacks 的卡牌，记录一次「应用」（供下次拒绝超限）
  if (card && card.maxStacks && !isAmmoCard && tank) {
    tank._cardApplyCount[card.id] = (tank._cardApplyCount[card.id] || 0) + 1;
  }
  return applied;
}

// ---------- 弹种改造计算 (P-27) ----------

// 计算特定坦克在特定弹种上的最终配置（含 cardEffects 弹种改造）
// #A13 语义定案（2026-08-26）：mode:'mult' 作用于弹种倍率刻度（base 即 RULES.ammoTypes[key]
// 的比率），mode:'add' 在乘算之后以字段自然单位追加（pen=mm / dmg=伤害数值 / speed=px/s）：
//   最终属性 = 坦克基础值(base stat) × Π(mult) + Σ(add)
// 弹种链换算语义（2026-09-13，用户定案）：add 量按**弹种基准倍率**换算后生效与显示——
// 「基础穿深 +10mm」卡在 apds（pen 1.4）上实际 +14mm，卡牌/状态面板一律显示换算后值。
//   cfg[field+'Add'] = Σ(add) × base[field]（换算在 add pass 内完成，消费方零改动）。
// mult 聚合沿用全局加法语义 1 + Σ(value−1)（#97，与 computeStats 对齐）；多条聚合钳 ≥0。
function computeAmmoConfig(shooter, ammoKey) {
  const key = ammoKey || (shooter && shooter.ammoKey) || 'ap';
  const rules = (typeof RULES !== 'undefined' && RULES.ammoTypes) ? RULES.ammoTypes : {};
  const base = rules[key] || rules.ap || { pen: 1, dmg: 1, speed: 1, spread: 1 };
  const cfg = Object.assign({}, base);

  const effects = (shooter && Array.isArray(shooter.cardEffects)) ? shooter.cardEffects : [];
  // mult pass：按 field 分组加法聚合，一次应用（#97）
  const agg = new Map();
  for (const ef of effects) {
    if (!ef || ef.type !== 'ammo' || ef.key !== key || ef.mode !== 'mult') continue;
    if (ef.field !== 'pen' && ef.field !== 'dmg' && ef.field !== 'speed') continue;
    let e = agg.get(ef.field);
    if (!e) { e = { mul: 1, count: 0 }; agg.set(ef.field, e); }
    e.mul += ef.value - 1; e.count++;
  }
  for (const [field, e] of agg) {
    const mul = e.count > 1 ? Math.max(0, e.mul) : e.mul;
    const val = typeof cfg[field] === 'number' ? cfg[field] : 1;
    cfg[field] = val * mul;
  }
  // add pass（#A13 → 弹种链换算）：乘算之后追加；追加量按弹种基准倍率换算
  //（+10mm 基础穿深 × apds pen1.4 = +14mm）。base[field] 缺省 1（ap 基准卡不换算）。
  for (const ef of effects) {
    if (!ef || ef.type !== 'ammo' || ef.key !== key || ef.mode !== 'add') continue;
    if (ef.field === 'pen' || ef.field === 'dmg' || ef.field === 'speed') {
      const addKey = ef.field + 'Add';
      const scale = (typeof base[ef.field] === 'number') ? base[ef.field] : 1;
      cfg[addKey] = (typeof cfg[addKey] === 'number' ? cfg[addKey] : 0) + ef.value * scale;
    }
  }
  // 倍率部分钳 ≥0；追加量为自然单位（可负），非负钳制由消费方在最终值上执行
  if (typeof cfg.pen === 'number') cfg.pen = Math.max(0, cfg.pen);
  if (typeof cfg.dmg === 'number') cfg.dmg = Math.max(0, cfg.dmg);
  if (typeof cfg.speed === 'number') cfg.speed = Math.max(0, cfg.speed);

  // 软上限（P-19 → 弹种链 2026-09-13 扩展）：作用于全部 HE 家族溅射弹种（splashRadius>0）——
  // 上限 = 该弹种基础倍率 × 全局系数（RULES.ammoTypeCap）。#A13：作用点——软上限作用于最终值
  // （含 add 追加量）。有坦克 stats 时把 add 折算成等效倍率参与钳制；无 stats（纯单测环境）
  // 退化为仅钳倍率部分。
  if (RULES && RULES.ammoTypeCap && base && base.splashRadius > 0) {
    const FIELD_STAT = { pen: 'penetration', dmg: 'damage', speed: 'shellSpeed' };
    for (const field of ['pen', 'dmg', 'speed']) {
      const baseR = base[field] === undefined ? 1 : base[field];
      const cap = baseR * (RULES.ammoTypeCap[field] !== undefined ? RULES.ammoTypeCap[field] : 99);
      const addKey = field + 'Add';
      const statName = FIELD_STAT[field];
      const sVal = (shooter && shooter.stats && typeof shooter.stats[statName] === 'number' && shooter.stats[statName] > 0)
        ? shooter.stats[statName] : null;
      let finalRatio = (typeof cfg[field] === 'number' ? cfg[field] : baseR)
        + (sVal !== null && typeof cfg[addKey] === 'number' ? cfg[addKey] / sVal : 0);
      if (finalRatio > cap) {
        const k = cap / finalRatio;
        if (typeof cfg[field] === 'number') cfg[field] *= k;
        if (typeof cfg[addKey] === 'number') cfg[addKey] *= k;
      }
    }
  }

  return cfg;
}

// ---------- 武器/能力资格过滤 (#A23) ----------

// 检查卡牌是否对玩家当前状态合法（武器/能力资格 + maxStacks draw-time）。
// 纯函数：不修改任何输入。owned = { abilities: string[], primaryWeapon: string,
//   secondaryWeapon: string, cards?: { [id]: count } }；
//   缺 primaryWeapon 时当 'standard'，缺 secondaryWeapon 时当 undefined。
// 规则：
//   - weapon 效果 action install: primary → eligible if (owned.primaryWeapon||'standard') !== weaponType；
//     secondary → eligible if !owned.secondaryWeapon || owned.secondaryWeapon==='none'；
//     action upgrade: primary → eligible if (owned.primaryWeapon||'standard') === weaponType；
//     secondary → eligible if owned.secondaryWeapon === weaponType；
//     任一 weapon 效果 ineligible → 卡牌 ineligible。
//   - ability 效果：若 ef.requiresAbility 存在则判 owned.abilities 包含之。
//   - slot secondary 但 action 缺 / weapon 缺 weaponType → ineligible（防御性）。
//   - maxStacks draw-time: 若 owned.cards && card.maxStacks && (owned.cards[card.id]||0) >= card.maxStacks → ineligible。
//   - 无 weapon/ability 效果（modifier/ammo/passive/drone/economy）→ eligible（ammo 交给 chain 过滤）。
function cardEligible(card, owned) {
  if (!card || !Array.isArray(card.effects)) return true;
  const o = (owned && typeof owned === 'object') ? owned : {};
  const abil = Array.isArray(o.abilities) ? o.abilities : [];
  const primaryW = o.primaryWeapon || 'standard';
  const secondaryW = o.secondaryWeapon;
  const cardsOwned = o.cards;

  // maxStacks draw-time
  if (cardsOwned && card.maxStacks && (cardsOwned[card.id] || 0) >= card.maxStacks) {
    return false;
  }

  for (const ef of card.effects) {
    if (!ef) continue;
    if (ef.type === 'weapon') {
      const slot = ef.slot || 'secondary';
      const wType = ef.weaponType || ef.typeKey;
      const action = ef.action;
      // defensive: secondary with missing action or weaponType → ineligible
      if (slot === 'secondary' && (!action || !wType)) return false;
      if (slot === 'primary' && wType && action) {
        if (action === 'install') {
          if (primaryW === wType) return false;
        } else if (action === 'upgrade') {
          if (primaryW !== wType) return false;
        }
      } else if (slot === 'secondary') {
        if (action === 'install') {
          if (secondaryW && secondaryW !== 'none') return false;
        } else if (action === 'upgrade') {
          if (secondaryW !== wType) return false;
        }
      }
    }
    if (ef.type === 'ability') {
      if (ef.requiresAbility && abil.indexOf(ef.requiresAbility) < 0) return false;
    }
  }
  return true;
}

// ---------- 抽卡 ----------

// 按稀有度权重抽取 n 张不重复卡。pool 为卡数组。optsOrRng 可为 createRNG 实例或
// { rng, ammoLoadout, owned } 配置对象。
//
// owned（2026-09-14 装备优先定案 + #A23）：{ abilities: string[], secondaryWeapon: string,
//   primaryWeapon?: string, cards?: { [id]: count } }——
//   玩家当前持有的主动技能 key 列表、副武器类型、主武器类型与已拥卡牌计数。
//   当玩家「没有任何主动技能」或「副武器为 none」时，优先保证候选中含 1 张对应装备卡
//     （ability 卡 / 副武器安装卡），避免候选全是无主之 upgrade（升级卡对未持有者语义莫名其妙）。
//   weapon/ability/maxStacks eligibility 过滤在 small-pool early return 之前执行。
function drawCardChoices(pool, n, optsOrRng) {
  const count = n || 3;
  let r = Math.random;
  let ammoLoadout = null;
  let owned = null;

  if (typeof optsOrRng === 'function') {
    r = optsOrRng;
  } else if (optsOrRng && typeof optsOrRng === 'object') {
    if (typeof optsOrRng.rng === 'function') r = optsOrRng.rng;
    if (Array.isArray(optsOrRng.ammoLoadout)) ammoLoadout = optsOrRng.ammoLoadout;
    if (optsOrRng.owned && typeof optsOrRng.owned === 'object') owned = optsOrRng.owned;
  }

  let usable = (pool || []).slice();

  // P-27: 过滤掉包含玩家未携带弹种改造的卡牌（2026-09-15 修订：升级卡按「直系前驱」资格判定，
  // 不再按目标弹种是否已携带——否则 `ammo_upgrade_*` 永远抽不到；前驱未携带则禁止跳级、不放行）
  if (ammoLoadout) {
    const CHAIN = (typeof RULES !== 'undefined' && RULES.ammoChain) ? RULES.ammoChain : null;
    usable = usable.filter(card => {
      if (!card || !Array.isArray(card.effects)) return true;
      for (const ef of card.effects) {
        if (ef && ef.type === 'ammo') {
          if (ammoLoadout.includes(ef.key)) continue;   // 已携带目标弹种（普通改造/已有升级卡）
          const pred = ef.replaceAmmo || (CHAIN && CHAIN[ef.key]) || null;
          if (!pred || !ammoLoadout.includes(pred)) return false;   // 升级卡：前驱未携带 → 不放行
        }
      }
      return true;
    });
  }

  // #A23：武器/能力资格过滤 + maxStacks draw-time 过滤（在 small-pool early return 之前执行，
  // 顺序：chain-filter → weapon/ability/maxStacks-filter → THEN early return + guarantee + weighted sample）
  if (owned) {
    usable = usable.filter(card => cardEligible(card, owned));
  }

  if (usable.length <= count) return usable.slice();

  // 2026-09-14 装备优先：无主动技能 → 保证 1 张 ability 卡；副武器 none → 保证 1 张副武器安装卡。
  const picked = [];
  const pickCardAt = (idx) => { picked.push(usable[idx]); usable.splice(idx, 1); };
  const firstIdxWhere = (pred) => {
    for (let i = 0; i < usable.length; i++) if (pred(usable[i])) return i;
    return -1;
  };
  if (owned) {
    const hasAbility = Array.isArray(owned.abilities) && owned.abilities.length > 0;
    const lacksSecondary = !owned.secondaryWeapon || owned.secondaryWeapon === 'none';
    // 索引在每次 splice 后动态求值——避免静态下标在抽走 ability 卡后错位（误把被动卡当武器卡）
    if (!hasAbility) {
      const i = firstIdxWhere(c => (c.effects || []).some(ef => ef && ef.type === 'ability'));
      if (i >= 0 && picked.length < count) pickCardAt(i);
    }
    if (lacksSecondary) {
      const j = firstIdxWhere(c => (c.effects || []).some(ef => ef && ef.type === 'weapon' && (ef.slot || 'secondary') === 'secondary'));
      if (j >= 0 && picked.length < count) pickCardAt(j);
    }
  }
  while (picked.length < count && usable.length > 0) {
    // 权重抽样：先按稀有度权重选稀有度，再在该稀有度内随机取一张
    let rarity = weightedRarity(r);
    let bucket = usable.filter(c => c.rarity === rarity);
    if (bucket.length === 0) bucket = usable;
    const idx = Math.floor(r() * bucket.length);
    const card = bucket[idx];
    picked.push(card);
    usable.splice(usable.indexOf(card), 1);
  }
  return picked;
}

function weightedRarity(r) {
  let total = 0;
  for (const k in RARITY_WEIGHTS) total += RARITY_WEIGHTS[k];
  let roll = r() * total;
  for (const k in RARITY_WEIGHTS) {
    roll -= RARITY_WEIGHTS[k];
    if (roll <= 0) return k;
  }
  return 'common';
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    CARD_RARITIES,
    RARITY_WEIGHTS,
    CARD_TAGS,
    MODIFIER_STATS,
    AMMO_KEYS,
    AMMO_FIELDS,
    ABILITY_KEYS,
    DRONE_KINDS,
    PASSIVE_KEYS,
    ECONOMY_FIELDS,
    ARMOR_PARTS,
    ARMOR_FACES,
    CARD_EFFECT_TYPES,
    WEAPON_SLOTS,
    WEAPON_SECONDARY_TYPES,
    WEAPON_PRIMARY_TYPES,
    ALL_WEAPON_TYPES,
    validateCard,
    validateCardEffect,
    validateCardSet,
    isArmorPath,
    applyCardEffects,
    cardStackCount,
    cardEligible,
    computeAmmoConfig,
    drawCardChoices,
    weightedRarity
  };
}
