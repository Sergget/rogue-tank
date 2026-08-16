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

// 弹种改造：key = 弹种（RULES.ammoTypes），field = 可改字段
const AMMO_KEYS = ['ap', 'apcr', 'he'];
const AMMO_FIELDS = ['pen', 'dmg', 'speed'];

// 主动装置（ability，运行时在对应里程碑接入按键触发；schema 先行）
const ABILITY_KEYS = ['smoke', 'repair', 'extinguish', 'recon', 'track_repair'];

// 特殊被动（passive：非数值修饰器的机制性被动）
const PASSIVE_KEYS = ['reactive_armor', 'angle_boost', 'overmatch', 'spall_liner', 'commander_sight'];

// 经济效果（M10 落地；schema 先行）
const ECONOMY_FIELDS = ['scoreMul', 'shopDiscount', 'startScore', 'reviveCount'];

// 装甲路径：part ∈ hull/turret，face ∈ front/side/rear
const ARMOR_PARTS = ['hull', 'turret'];
const ARMOR_FACES = ['front', 'side', 'rear'];

// 效果类型：type 决定 params 的校验 schema
const CARD_EFFECT_TYPES = ['modifier', 'ammo', 'ability', 'passive', 'drone', 'economy'];

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
      break;
    case 'passive':
      if (!PASSIVE_KEYS.includes(ef.key)) errs.push(`${p}: key 非法 ${ef.key}`);
      if (ef.value !== undefined && (typeof ef.value !== 'number' || !Number.isFinite(ef.value))) errs.push(`${p}: value 应为有限数值`);
      break;
    case 'drone':
      break;
    case 'economy':
      if (!ECONOMY_FIELDS.includes(ef.field)) errs.push(`${p}: field 非法 ${ef.field}`);
      if (typeof ef.value !== 'number' || !Number.isFinite(ef.value)) errs.push(`${p}: value 应为有限数值`);
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

// 卡牌已叠加次数（同名卡按 source `card:<id>` 统计）
function cardStackCount(tank, cardId) {
  return (tank.modifiers || []).filter(m => m.source === 'card:' + cardId).length;
}

// 应用卡牌效果到坦克。modifier 走 addModifier 立即生效；其余类型挂到 tank.cardEffects 供
// 对应里程碑（弹种/主动装置/被动/浮游炮/经济）消费。ctx 可注入自定义处理（测试/编辑器用）。
// 返回已应用的效果数组。
function applyCardEffects(tank, card, ctx) {
  const applied = [];
  for (const ef of card.effects) {
    if (ef.type === 'modifier') {
      addModifier(tank, { stat: ef.stat, mode: ef.mode, value: ef.value, source: 'card:' + card.id, scope: 'run' });   // 卡牌=单局（run 结束清除）
      applied.push(ef);
    } else {
      if (!tank.cardEffects) tank.cardEffects = [];
      tank.cardEffects.push(Object.assign({}, ef, { cardId: card.id }));
      applied.push(ef);
    }
  }
  return applied;
}

// ---------- 抽卡 ----------

// 按稀有度权重抽取 n 张不重复卡。pool 为卡数组。rng 为 createRNG 实例（可选）。
function drawCardChoices(pool, n, rng) {
  const count = n || 3;
  const r = rng || Math.random;
  const usable = (pool || []).slice();
  if (usable.length <= count) return usable.slice();
  const picked = [];
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
    PASSIVE_KEYS,
    ECONOMY_FIELDS,
    ARMOR_PARTS,
    ARMOR_FACES,
    CARD_EFFECT_TYPES,
    validateCard,
    validateCardEffect,
    validateCardSet,
    isArmorPath,
    applyCardEffects,
    cardStackCount,
    drawCardChoices,
    weightedRarity
  };
}
