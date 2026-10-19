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

// #E13（2026-09-20 用户裁定）：新增「神话」稀有度（在传奇之上）——「交替装填系统」升入该档。
// 序号即强度序：common < rare < epic < legendary < mythic（Boss 保底池 / 卡池权重 / 保底过滤均按此序）。
const CARD_RARITIES = ['common', 'rare', 'epic', 'legendary', 'mythic'];
const RARITY_WEIGHTS = { common: 50, rare: 30, epic: 15, legendary: 4.5, mythic: 0.5 };

// 5 大流派标签（构筑方向，卡牌可多标签；后续流派构筑/加成按此聚合）
const CARD_TAGS = ['重甲', '狙击', '机动', '爆破', '支援'];

// 可作用 stat 白名单（与 tank_model.js computeStats 对齐；armor 用路径 armor.<part>[.<face>]）
// #N3（2026-10-10 升级覆盖面对账）：补入 3 个 computeStats 产物键——
//   motionSpreadMul（独立运动三扩，D3 #A1/#A3 解耦；此前仅局内商店 steady_mount 可写）、
//   fireControlCrit / loaderAmmoCrit（P-49 模块命中概率修正通道，computeStats 注释原
//   文「玩家侧可随卡牌/技能升级增强」，但三通道全空缺——死升级通道，本轮补卡+补商店项）。
const MODIFIER_STATS = [
  'penetration', 'damage', 'reload', 'shellSpeed', 'maxSpeed', 'turnRate', 'turretTurnRate',
  'maxHp', 'weight', 'enginePower', 'trackLock', 'ammoMult', 'crewMult',
  'dotRatioMult', 'dotDurationMult', 'spreadMult', 'aimSpeed',
  'motionSpreadMul', 'fireControlCrit', 'loaderAmmoCrit'
];

// 弹种改造：key = 弹种（RULES.ammoTypes 14 键，弹种链 2026-09-13；hec 已移除 2026-09-14）
const AMMO_KEYS = ['ap', 'apcr', 'apds', 'apfsds', 'apfsds_ad', 'he', 'heat', 'heatfs', 'tandem_heat', 'heavy_tandem_heat', 'aphe', 'hesh', 'proximity_he', 'blast_he'];
const AMMO_FIELDS = ['pen', 'dmg', 'speed'];

// 主动装置（ability，运行时在对应里程碑接入按键触发；schema 先行）
// #G（2026-09-21）：+ super_fire_control / super_speed / aps——runtime 技能键全集（与
// tank_abilities.ABILITY_KEYS_RUNTIME 及 skillHotkey DISPATCH 对齐；medkit 为 innate 键）
// 2026-09-23 A 档：剔除死效果键 recon / track_repair（两者无任何激活路径，对应 5 张卡已删除，
// 见 DEVELOPMENT.md §4.35）——本白名单现恒等于「innate 3 键 + runtime 7 键」，无死键。
// #U40（2026-10-19）：innate 子集单列——cardEligible 的 #U18 已持去重对 innate 键豁免
// （repair_kit / support_extinguisher 是固有技能的纯强化卡，玩家开局「已持有」该键，
//  去重会误杀；判定口径与 js/tank_abilities.js ABILITY_KEYS_INNATE 一致，本地复制防循环依赖）。
const ABILITY_KEYS_INNATE_LOCAL = ['repair', 'medkit', 'extinguish'];
const ABILITY_KEYS = ['repair', 'medkit', 'extinguish', 'artillery', 'overdrive', 'shield', 'deploy_cover', 'super_fire_control', 'super_speed', 'aps',
  // #W-I（2026-10-19）：榴弹炮曲射模式切换（toggle；运行时键与 tank_abilities.js ABILITY_KEYS_RUNTIME 同步）
  'howitzer_mode'];
// 无人机种类（drone）：scout=侦察指示（视口外敌军位置箭头）/ striker=近身自动索敌打击。
// kind 缺失时兼容旧数据（默认 striker，伴随浮游炮语义）。
const DRONE_KINDS = ['scout', 'striker'];

// 特殊被动（passive：非数值修饰器的机制性被动）
// #J3（2026-09-30）：`commander_sight`（车长潜望镜/观瞄镜）随**视野距离系统整体退役**而删除 ——
//   该键的唯一消费者是 mvp 的可视圆半径，视野下线后无任何效果通道，留着即死效果卡
//   （同 2026-09-23 A 档 `recon`/`track_repair` 处置）。视野卡面「+15%/+25% 观测距离」不再存在。
const PASSIVE_KEYS = ['reactive_armor', 'angle_boost', 'overmatch', 'spall_liner',
  // #W-H（2026-10-19）：模块级防御减伤（消费方 js/tank_physics.js 的 getMultForKey）
  'wet_ammo_rack',   // 湿式弹药架：弹药架受伤 -30%
  'crew_liner'];     // 成员内衬：成员（crew 6 键）受伤 -20%

// 经济效果（M10 落地；schema 先行）
const ECONOMY_FIELDS = ['scoreMul', 'shopDiscount', 'startScore', 'reviveCount'];

// 副武器槽位与类型（R-1 / 阶段四）；主武器类型（阶段七 7.3）与 RULES.weaponTypes 对齐
const WEAPON_SLOTS = ['primary', 'secondary'];
// #U39（2026-10-18）：补入 `missile_wire`——它一直在 RULES.weaponTypes.secondary 与
//   WEAPON_DEFAULTS.secondary / fireActiveSecondary 的 wire 分支里，却漏在本白名单外，
//   导致任何针对线导导弹的 weapon 卡都会被 validateCardEffect 判「weaponType 非法」。
const WEAPON_SECONDARY_TYPES = ['mortar', 'missile', 'missile_wire', 'rocket', 'mine_layer', 'turret'];
// #W-I（2026-10-19）：howitzer 为**模式**而非独立武器类型——不进卡牌武器白名单
//   （安装/升级卡不会引用它），仅作为 WEAPON_DEFAULTS.primary 的参数载体 +
//   `t._howitzerMode` 运行时标记（js/tank_abilities.js 的挂载卡切换）。
const WEAPON_PRIMARY_TYPES = ['standard', 'autocannon', 'double_barrel', 'railgun', 'clip'];
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
      // #G：statOverrides 值必须为有限数值 / 布尔 / "+N" 相对增量字符串（mergeStatOverrides 消费）
      if (ef.statOverrides && typeof ef.statOverrides === 'object' && !Array.isArray(ef.statOverrides)) {
        for (const k of Object.keys(ef.statOverrides)) {
          const v = ef.statOverrides[k];
          if (typeof v === 'boolean') continue;
          const isRel = typeof v === 'string' && /^\+\d+(\.\d+)?$/.test(v);
          if (typeof v !== 'number' || !Number.isFinite(v)) {
            if (!isRel) errs.push(`${p}: statOverrides.${k} 应为有限数值/布尔或 "+N" 增量`);
          }
        }
      }
      break;
  }
  return errs;
}

// #G（2026-09-21）：upgrade 卡 statOverrides 的合并语义——数值直接覆盖；字符串 "+N"（如 "+1"）
// 表示在**当前值**上增量（扩容弹夹等「每张 +1、可叠多次」的升级卡必需，纯覆盖值叠两次会退回同值）。
function mergeStatOverrides(stats, overrides) {
  const merged = Object.assign({}, stats || {});
  for (const k of Object.keys(overrides || {})) {
    const v = overrides[k];
    if (typeof v === 'string' && v[0] === '+') {
      const base = (typeof merged[k] === 'number') ? merged[k] : 0;
      const d = parseFloat(v.slice(1));
      merged[k] = base + (Number.isFinite(d) ? d : 0);
    } else {
      merged[k] = v;
    }
  }
  return merged;
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

// 武器缺省表惰性取值（浏览器 = tank_weapons.js 先行加载的全局；Node = require 兜底）。
// #J2（2026-09-30）：抽成共用解析器，供**主武器**换装重置基线与副武器安装共用，
// 避免两处各自实现一遍依赖解析（tank_cards 位于 tank_weapons 之前，必须惰性）。
function _weaponDefaultsResolver() {
  let getWD = (typeof getWeaponDefaults === 'function') ? getWeaponDefaults : null;
  if (!getWD && typeof require !== 'undefined') {
    try { getWD = require('./tank_weapons.js').getWeaponDefaults; } catch (e) { getWD = null; }
  }
  return getWD;
}

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
  //   - #U44（2026-10-19，用户反馈「出现过但不再持有的武器/技能应可再次出现」）：**安装类卡豁免**——
  //     weapon install 与 ability 基础卡的「重复」由调用方按当前持有状态判定（不在持 = 可再拿回），
  //     这里不再按历史计数一刀切（否则换掉双联后永远拿不回来）。幂等性由各 install 分支自身保证
  //     （同型 install 为 no-op、同 key ability 重复入 cardEffects 无副作用）。
  if (tank && !tank._cardApplyCount) tank._cardApplyCount = {};
  const isAmmoCard = card && Array.isArray(card.effects) && card.effects.every(e => !e || e.type === 'ammo');
  if (card && card.maxStacks && !isAmmoCard && !_isSwapBackCard(card) && tank
      && (tank._cardApplyCount[card.id] || 0) >= card.maxStacks) return [];

  // #G（2026-09-21）：按序施加日志——modifier 卡只写 tank.modifiers（source 'card:<id>'）、
  // 其余卡只写 tank.cardEffects，两份数据都不含「跨类型施加顺序」。开发者面板的「−1」回滚
  // （tank_devpanel.js rollbackDevCard）需要**完整施加序列**做「清空后按原序重放」，
  // 旧实现只取 cardEffects ⇒ 任意一次 −1 会把 96 张纯 modifier 卡的效果永久抹掉。
  // 本日志与 _cardApplyCount 同生命周期（clearCardsFromTank / removeRunModifiers 一并清空）。
  if (tank) {
    if (!Array.isArray(tank._cardApplyLog)) tank._cardApplyLog = [];
    tank._cardApplyLog.push(card.id);
  }

  const applied = [];
  for (const ef of card.effects) {
    if (ef.type === 'modifier') {
      addModifier(tank, { stat: ef.stat, mode: ef.mode, value: ef.value, source: 'card:' + card.id, scope: 'run' });   // 卡牌=单局（run 结束清除）
      applied.push(ef);
    } else {
      if (!tank.cardEffects) tank.cardEffects = [];
      // #U43（2026-10-19）：条目额外带 `cardName` —— Boss 进场简报要把「改装」读成卡牌中文名，
      //   而简报是纯函数（js/tank_boss.js bossBriefing，不持有卡池）。原条目只有 cardId，
      //   页面侧就得再拿卡池反查一次；把名字随条目带走，纯逻辑层自足。
      tank.cardEffects.push(Object.assign({}, ef, { cardId: card.id, cardName: card.name }));
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
            // #J2（2026-09-30 用户反馈「获得电磁炮后再获得其他主炮，会继承可穿透弹药特性」）：
            //   **换型安装必须重置 stats 基线**。旧实现 `Object.assign({}, 旧 stats, overrides)`
            //   把旧武器的专有键一并带进新武器 —— 最典型的是 railgun 的 `pierce`/`pierceDmgMul`
            //   （js/tank_fire.js firePrimaryShell 据此赋予弹体贯穿能力），于是装上任何其他主炮
            //   后仍能贯穿两辆坦克。同型安装走原合并语义（幂等，不丢 tanks/*.json 自定义数值）。
            const prevType = tank.weapons.primary.type;
            if (wType && wType !== prevType){
              const getWD = _weaponDefaultsResolver();
              tank.weapons.primary.stats = getWD ? getWD('primary', wType) : {};
              tank._dbState = null;   // 双管/弹夹等旧型专有状态一并复位
              tank._clipState = null;
            }
            if (wType) tank.weapons.primary.type = wType;
            if (ef.statOverrides && typeof ef.statOverrides === 'object') {
              tank.weapons.primary.stats = Object.assign({}, tank.weapons.primary.stats || {}, ef.statOverrides);
            }
            tank.weapons.primary._spec = null;
            tank._dbState = null;   // 2026-09-15 W4：主武器换装后双管状态重置
            tank._clipState = null; // #G（2026-09-21）：主武器换装后弹夹状态重置
          } else if (action === 'upgrade') {
            // upgrade：仅当 weapons.primary.type===wType 时合并 statOverrides 并清缓存
            if (wType && tank.weapons.primary.type === wType && ef.statOverrides && typeof ef.statOverrides === 'object') {
              tank.weapons.primary.stats = mergeStatOverrides(tank.weapons.primary.stats, ef.statOverrides);
              tank.weapons.primary._spec = null;
              tank._dbState = null;
              tank._clipState = null;   // #G：扩容卡改变 clipSize → 弹夹状态重建
            }
            // type!==wType → no-op，不写入
          }
        } else {
          // secondary：统一 weapons.secondary 单槽
          if (!tank.weapons.secondary) tank.weapons.secondary = { type: 'none', stats: {} };
          if (action === 'install') {
            // #B8（2026-09-16 用户裁定）：副武器安装卡**替换**已装副武器——非同型（含 none）
            // 直接覆盖写入（旧武器的升级卡效果挂在 cardEffects 内按类型判定，替换后自动失格，
            // 旧 upgrade 卡的 cardEffects 条目保留不清，见 cardEligible upgrade 分支的动态判定）；
            // 同型重复 install → 幂等 no-op（防同一张卡重复应用时重置装填/规格缓存）。
            const curType = tank.weapons.secondary.type;
            if (wType && (curType === 'none' || curType === undefined || curType !== wType)) {
              // getWeaponDefaults 惰性取值（#J2：抽为共用解析器 _weaponDefaultsResolver）
              const getWD = _weaponDefaultsResolver();
              const defStats = getWD ? getWD('secondary', wType) : {};
              tank.weapons.secondary = {
                type: wType,
                stats: Object.assign({}, defStats, ef.statOverrides || {})
              };
              if (typeof tank.secondaryReloadT === 'number') tank.secondaryReloadT = 0;   // 换装后装填立即就绪
              // 换装清理：锁定状态（missile）与旧武器派生状态一并复位
              tank._missileLock = null;
              // #J4（2026-09-30）：`_missileActivated` 也必须复位 —— 它是**开关态**，换掉导弹后
              // 主循环的 `type === 'missile'` 门控只是不再推进它，标志位本身仍为 true；
              // 之后若再装回导弹，会在玩家没有按 F 的情况下**凭空恢复激活并自动索敌/发射**。
              tank._missileActivated = false;
              tank._missileHintT = 0;
              tank._missileHintShown = false;
            }
          } else if (action === 'upgrade') {
            // 仅当 secondary.type===wType 时合并 statOverrides；type 不匹配 → no-op
            if (wType && tank.weapons.secondary.type === wType && ef.statOverrides && typeof ef.statOverrides === 'object') {
              tank.weapons.secondary.stats = mergeStatOverrides(tank.weapons.secondary.stats, ef.statOverrides);
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
      //
      // #U40（2026-10-19 用户反馈「获取新弹种的卡和弹药参数升级的卡搞混淆了」）：**升级替换
      // 只对「升级效果」触发**——判定口径（三处同源，isAmmoUpgradeCard / drawCardChoices 链过滤
      // 与此处一致）：① 效果显式带 replaceAmmo；② 旧式无 field 的纯演变效果（阶段六遗留数据兼容）。
      // **带 field 的调校效果不再按 CHAIN 回退推断前驱**——旧实现让 demo_apcr_round（APCR 穿深
      // +20%）、sniper_sabot_round、he_overpressure、heat_composite_pen、sniper_apcbc、
      // sniper_hard_core 这类纯数值卡在「前驱在 loadout」时被误当换弹卡，把玩家槽位里的
      // AP 原地改名成 APCR/HEAT 等（隐形换弹：弹种变了、卡面只承诺 +数值），且这批卡
      // maxStacks 2~4 可反复触发。现行：调校效果只调数值，绝不改 loadout 弹种组成。
      if (ef.type === 'ammo' && tank && Array.isArray(tank.ammoLoadout)) {
        const CHAIN = (typeof RULES !== 'undefined' && RULES.ammoChain) ? RULES.ammoChain : null;
        const pred = ef.replaceAmmo
          || (!ef.field && CHAIN && CHAIN[ef.key])
          || null;   // 直系前驱（仅升级效果推断；调校效果恒 null）
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
      // economy：经济效果（M10 落地）——run 作用域，直接修改 tank 运行期字段
      // #U40（2026-10-19）：scoreMul 语义修复——卡面「结算得分 +15%」= ×1.15，旧实现
      //   (tank.runScoreMul||1) × (1+value) 把 value=1.15 算成 ×2.15（value 字段口径本就是
      //   「最终乘数」，与 ECONOMY_FIELDS 消费方 tank_mvp 结算链约定一致）。接线（mvp
      //   finishNode / finishSurvivalWave / 击杀计分）：runScoreMultiplier(t) 聚合后应用。
      if (ef.type === 'economy' && tank) {
        if (ef.field === 'reviveCount') {
          // 战场救护协议：复活次数 +1（run 作用域，叠加到 player.revives；mvp pickCard 即时回算）
          tank.runReviveBonus = (tank.runReviveBonus | 0) + (ef.value | 0);
        } else if (ef.field === 'scoreMul') {
          // 结算得分乘数：value 即最终乘数（1.15 = +15%），多卡直接叠乘
          tank.runScoreMul = (tank.runScoreMul || 1) * ef.value;
        } else if (ef.field === 'startScore') {
          tank.runStartScore = (tank.runStartScore | 0) + (ef.value | 0);
        }
        // shopDiscount 为局内商店折扣（0.1 = −10% 价格），消费方 runShopPriceFor 调用方
        // （mvp buyRunShopItem 经 runShopDiscount(tank) 取聚合折扣）
      }
    }
  }

  // #A23 d：非 ammo 且带 maxStacks 的卡牌，记录一次「应用」（供下次拒绝超限）
  if (card && card.maxStacks && !isAmmoCard && tank) {
    tank._cardApplyCount[card.id] = (tank._cardApplyCount[card.id] || 0) + 1;
  }
  // #W-G（2026-10-19）：应急护盾（原 reactive_armor）获得时冷却清零 —— 立即可用。
  //   低血触发判定在 tank_mvp.html 主循环；冷却时长见 emergencyShieldCooldown。
  if (tank && Array.isArray(tank.cardEffects) && tank.cardEffects.some(e => e && e.type === 'passive' && e.key === 'reactive_armor')) {
    tank._emergencyShieldCd = 0;
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

// #U44（2026-10-19）：该卡是否为「可以换回来」的卡——安装类 weapon 卡与 ability 基础卡。
//   · weapon install：换回旧武器是合法构筑操作（其资格由当前 weapons.*.type 动态判定）。
//   · ability 基础卡（无 requiresAbility）：重复获得无意义的是「已持有该技能」，
//     而「曾经有过、现在没有」应允许再拿（其资格由 owned.abilities 动态判定）。
//   · ability 升级卡（requiresAbility）与 weapon upgrade 仍按 maxStacks 截断（叠加有上限）。
//   · 其它类型（modifier/ammo/passive/drone/economy）不受影响。
function _isSwapBackCard(card) {
  if (!card || !Array.isArray(card.effects)) return false;
  const weaponEfs = card.effects.filter(ef => ef && ef.type === 'weapon');
  if (weaponEfs.length) return weaponEfs.every(ef => ef.action === 'install');
  const abilEfs = card.effects.filter(ef => ef && ef.type === 'ability');
  if (abilEfs.length) return abilEfs.every(ef => !ef.requiresAbility);
  return false;
}

// 检查卡牌是否对玩家当前状态合法（武器/能力资格 + maxStacks draw-time）。
// 纯函数：不修改任何输入。owned = { abilities: string[], primaryWeapon: string,
//   secondaryWeapon: string, cards?: { [id]: count } }；
//   缺 primaryWeapon 时当 'standard'，缺 secondaryWeapon 时当 undefined。
// 规则：
//   - weapon 效果 action install: primary → eligible if (owned.primaryWeapon||'standard') !== weaponType；
//     secondary → eligible if owned.secondaryWeapon !== weaponType（#B8：非同型=替换资格，none=正常安装，
//     同型重复=拒绝）；
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
  // #U44（2026-10-19 用户反馈「出现过、但不再持有的主、副武器、技能似乎就不再出现了，可以再次出现，
  //   允许玩家再次选择」）：**maxStacks 只该约束「当前确实还在生效」的卡**。
  //   旧实现只按 `_cardApplyCount` 的历史计数截断 ⇒ 玩家换掉双联火炮后双联安装卡仍被永久排除，
  //   换掉某个技能后技能卡也不再出现——即「曾经拿过」= 永久拉黑，与构筑自由相悖。
  //   现行：**安装类卡（weapon install / ability 基础卡）的重复资格由「当前是否持有该型/该技能」决定**
  //   （下面的 weapon/ability 分支已按 owned.primaryWeapon/secondaryWeapon/abilities 动态判定），
  //   maxStacks 对它们不再额外截断；「换回来」是合法操作（applyCardEffects 的 install 是幂等覆盖）。
  //   升级卡与 modifier/ammo/passive/drone/economy 保持原口径（叠加有上限，重复无收益）。
  if (cardsOwned && card.maxStacks && (cardsOwned[card.id] || 0) >= card.maxStacks && !_isSwapBackCard(card)) {
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
          // #B8（2026-09-16 用户裁定）：非同型 = 替换资格（放行）；同型重复 = 拒绝（幂等无意义）。
          // none/未装 → 正常安装资格。
          if (secondaryW === wType) return false;
        } else if (action === 'upgrade') {
          if (secondaryW !== wType) return false;
        }
      }
    }
    if (ef.type === 'ability') {
      if (ef.requiresAbility && abil.indexOf(ef.requiresAbility) < 0) return false;
      // #U18（2026-10-17）：**已持有的技能卡不再重复提供**——若本卡安装的 ability 键玩家已持有，
      //   且本卡不是「对该能力的升级」（无 requiresAbility 声明），则再抽到毫无收益（能力已在），
      //   却仍会占掉一个三选一位（用户实测「已有的技能卡似乎也会重复提供备选」）。
      //   保留 requiresAbility 卡（它们是基础能力的增强，抽到有意义）。仅在调用方传入
      //   owned.abilities 时生效；未传则保持旧行为（零影响）。
      // #U40（2026-10-19）：**innate 键豁免去重**——repair/medkit/extinguish 是开局固有键
      //   （ABILITY_KEYS_INNATE，与 js/tank_abilities.js 同源），不占技能槽、其卡（repair_kit /
      //   support_extinguisher）是**纯强化**（修复量/冷却改写，tank_abilities 按 cardId 消费），
      //   「已持有」不构成去重理由——否则 #U18 之后这两张卡永远抽不到，而强化本身并未生效
      //   （用户反馈「只生效一次入反应装甲显然不合理」同批次的死卡问题）。
      if (!ef.requiresAbility && ABILITY_KEYS_INNATE_LOCAL.indexOf(ef.key) < 0 && ef.key && abil.indexOf(ef.key) >= 0) return false;
    }
    // #U20（2026-10-16）：**属性达限过滤**——modifier 卡的下一级会突破 RULES.parameterLimits 时判不合格。
    //   原实现缺失此层：装填/极速/散布等属性触顶后，对应升级卡仍进三选一，选中后无收益（用户实测）。
    //   判定口径与商店侧一致（复用 js/tank_economy.js 的 runShopLimitBlocked 同款比较逻辑），
    //   仅在调用方传入 owned.stats（当前聚合属性）时生效；未传则保持旧行为（零影响）。
    if (ef.type === 'modifier' && ef.stat && o.stats) {
      const lim = _plBoundary(ef.stat);
      if (lim) {
        const cur = _plStatVal(o.stats, ef.stat);
        if (typeof cur === 'number') {
          const next = (ef.mode === 'mult') ? cur * ef.value : cur + ef.value;
          if (lim.min !== undefined && next < lim.min - 1e-9) return false;
          if (lim.max !== undefined && next > lim.max + 1e-9) return false;
        }
      }
    }
    // #U22（2026-10-16）：**「取最高」类被动不得重复提供低档**——overmatch/spall_liner 等被动
    //   在结算时按「取最强一个」（js/tank_physics.js passiveValues + min/max），故玩家已持有
    //   更强的同键被动时，再来一张弱档毫无收益（占卡位）。此处比较同键已持值与本卡值：
    //   本卡不比已持更强 → 不合格。仅对已知「取最高」语义的键生效（白名单见 _BEST_ONLY_PASSIVE_KEYS）。
    if (ef.type === 'passive' && _BEST_ONLY_PASSIVE_KEYS[ef.key] !== undefined && Array.isArray(o.cardEffects)) {
      const held = o.cardEffects.filter(e => e && e.type === 'passive' && e.key === ef.key)
        .map(e => e.value).filter(v => typeof v === 'number' && Number.isFinite(v));
      if (held.length && typeof ef.value === 'number') {
        // 方向由键决定（与 js/tank_physics.js passiveValues 的取值口径一致）：
        //   spall_liner → 取 min（减伤乘数，越小越强）；overmatch → 取 max（碾压阈值，越大越强）。
        // 本卡不比已持更优 ⇒ 不合格（选中亦无收益，徒占卡位）。
        const best = (_BEST_ONLY_PASSIVE_KEYS[ef.key] === 'max')
          ? Math.max.apply(null, held) : Math.min.apply(null, held);
        const stronger = (_BEST_ONLY_PASSIVE_KEYS[ef.key] === 'max')
          ? (ef.value > best + 1e-9) : (ef.value < best - 1e-9);
        if (!stronger) return false;
      }
    }
  }
  return true;
}

// #U20：RULES.parameterLimits 按点分路径取边界（armor.hull.front 等）；无界/未配置 → null
function _plBoundary(path){
  if (typeof RULES === 'undefined' || !RULES.parameterLimits) return null;
  return String(path).split('.').reduce((o, k) => (o == null ? undefined : o[k]), RULES.parameterLimits) || null;
}

// #U20：从当前聚合属性按点分路径取现值
function _plStatVal(stats, path){
  if (!stats || typeof stats !== 'object') return undefined;
  return String(path).split('.').reduce((o, k) => (o == null ? undefined : o[k]), stats);
}

// #U22：「取最优 Only」语义的被动键 → 结算侧取值方向（见 js/tank_physics.js passiveValues 消费点）。
//   spall_liner：整车减伤乘数 → 取 min（越小越强）；overmatch：超口径碾压阈值系数 → 取 max（越大越强）。
//   两张卡定义了同键不同档位，故低档/同档在已持有更优时无收益，应被 cardEligible 滤除。
const _BEST_ONLY_PASSIVE_KEYS = { spall_liner: 'min', overmatch: 'max' };

// #W-G（2026-10-19 用户裁定）：「反应装甲」改名为「**应急护盾**」，机制重做为
//   「HP < 10% 时自动生成 1 个持续 10s 的护盾，冷却 90s，可由卡牌升级缩短、最少 60s」。
//   —— 与 #U40 的「命中驱动拦截 + 60s 再充能」是**不同机制**，旧语义已整体替换。
//
//   唯一口径：RULES.cards.emergencyShield（triggerHpRatio / durationSeconds /
//   cooldownSeconds / cooldownMinSeconds / shieldHp）。RULES 缺失时用内置缺省。
//
//   本文件负责「冷却时长」与「冷却计时递减」；实际的低血触发判定在 tank_mvp.html 主循环
//   （需要 player.hp / maxHp 与 applyShield，而那些是页面层职责）。
//
//   卡牌升级：通过 `t._emergencyShieldCdDelta`（秒，负值=缩短）叠加，钳到 cooldownMinSeconds。

// 应急护盾的当前冷却时长（秒）——含卡牌升级折扣，钳到下限。
function emergencyShieldCooldown(t) {
  const cfg = (typeof RULES !== 'undefined' && RULES.cards && RULES.cards.emergencyShield) || {};
  const base = (typeof cfg.cooldownSeconds === 'number') ? cfg.cooldownSeconds : 90;
  const min = (typeof cfg.cooldownMinSeconds === 'number') ? cfg.cooldownMinSeconds : 60;
  const delta = (t && typeof t._emergencyShieldCdDelta === 'number') ? t._emergencyShieldCdDelta : 0;
  return Math.max(min, base + delta);
}

// 应急护盾配置的其余字段（供 mvp 主循环读取，避免在多处硬编码）
function emergencyShieldConfig() {
  const cfg = (typeof RULES !== 'undefined' && RULES.cards && RULES.cards.emergencyShield) || {};
  return {
    triggerHpRatio: (typeof cfg.triggerHpRatio === 'number') ? cfg.triggerHpRatio : 0.10,
    durationSeconds: (typeof cfg.durationSeconds === 'number') ? cfg.durationSeconds : 10,
    shieldHp: (typeof cfg.shieldHp === 'number') ? cfg.shieldHp : 150
  };
}

// 冷却计时器逐帧递减（mvp 主循环调用）。减到 0 即可再次触发。
function updateEmergencyShieldRearm(t, dt) {
  if (!t || dt <= 0) return;
  if (t._emergencyShieldCd > 0) {
    t._emergencyShieldCd = Math.max(0, t._emergencyShieldCd - dt);
  }
}

// ---------- 抽卡 ----------

// Fisher-Yates 洗牌（供展示顺序随机化；r 为 [0,1) 随机源，注入以便测试确定性）
function shufflePicked(arr, r) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
  }
  return arr;
}

// 该卡是否为「弹种链升级卡」（ammo 效果带 replaceAmmo 或链上前驱）——弹种节奏调制的对象。
// 纯弹种改造卡（无前驱，直接改 AP/HE 数值）不算升级卡，不受节奏衰减影响。
// #U40（2026-10-19）：判定口径与 applyCardEffects 替换分支同源——① 显式 replaceAmmo；
// ② 旧式无 field 的纯演变效果（阶段六遗留数据兼容）。带 field 的调校效果（如
// demo_apcr_round「APCR 穿深 +20%」）是纯数值卡，不算升级卡、不受节奏衰减、更不触发替换。
function isAmmoUpgradeCard(card) {
  if (!card || !Array.isArray(card.effects)) return false;
  const CHAIN = (typeof RULES !== 'undefined' && RULES.ammoChain) ? RULES.ammoChain : null;
  for (const ef of card.effects) {
    if (!ef || ef.type !== 'ammo') continue;
    if (ef.replaceAmmo) return true;
    if (!ef.field && CHAIN && CHAIN[ef.key] && CHAIN[ef.key] !== ef.key) return true;
  }
  return false;
}

// 按稀有度权重抽取 n 张不重复卡。pool 为卡数组。optsOrRng 可为 createRNG 实例或
// { rng, ammoLoadout, owned } 配置对象。
//
// owned（2026-09-14 装备优先定案 + #A23）：{ abilities: string[], secondaryWeapon: string,
//   primaryWeapon?: string, cards?: { [id]: count } }——
//   玩家当前持有的主动技能 key 列表、副武器类型、主武器类型与已拥卡牌计数。
//   当玩家「没有任何主动技能」或「副武器为 none」时，优先保证候选中含 1 张对应装备卡
//     （ability 卡 / 副武器安装卡），避免候选全是无主之 upgrade（升级卡对未持有者语义莫名其妙）。
//   weapon/ability/maxStacks eligibility 过滤在 small-pool early return 之前执行。
//
// 2026-10-10 #N2（用户反馈「卡牌出现的顺序好像是固定的、弹种升级太快」）两项修正：
//   ① **展示顺序随机化**：旧实现按「装备保底 → 弹种保底 → 权重抽样」的顺序 push，
//      导致第 1 位恒为同一张 ability 卡、第 2 位恒为同一张副武器卡（实测 500/500），
//      玩家观感就是「顺序固定」。现返回前统一洗牌，保底只决定「在候选集里」不决定位置。
//   ② **弹种升级节奏**：保底概率 + 权重抽样双通道随「本局已获得的弹种升级卡数」衰减
//      （RULES.cards.ammoUpgradePace），前几节点正常供弹、链越爬越慢，不再 4~6 节点爬满链。
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
  // #U40（2026-10-19）：前驱推断口径与 applyCardEffects 替换分支同源——只有升级效果
  //（显式 replaceAmmo 或无 field 的旧式演变效果）才按 CHAIN 推断前驱做资格判定；
  // 带 field 的调校卡（demo_apcr_round 等）不参与该判定（其 key 已在 loadout 时上面一行放行，
  // 否则也只是普通改造资格问题，不再因「CHAIN 前驱不在」被整卡滤除）。
  if (ammoLoadout) {
    const CHAIN = (typeof RULES !== 'undefined' && RULES.ammoChain) ? RULES.ammoChain : null;
    usable = usable.filter(card => {
      if (!card || !Array.isArray(card.effects)) return true;
      for (const ef of card.effects) {
        if (ef && ef.type === 'ammo') {
          if (ammoLoadout.includes(ef.key)) continue;   // 已携带目标弹种（普通改造/已有升级卡）
          const pred = ef.replaceAmmo
            || (!ef.field && CHAIN && CHAIN[ef.key])
            || null;                                    // 升级卡：仅升级效果推断前驱
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

  if (usable.length <= count) return shufflePicked(usable.slice(), r);

  // 2026-09-14 装备优先：无主动技能 → 保证 1 张 ability 卡；副武器 none → 保证 1 张副武器安装卡。
  const picked = [];
  const pickCardAt = (idx) => { picked.push(usable[idx]); usable.splice(idx, 1); };
  // #N2：保底/弹种卡在候选中随机取一张（旧实现取「池内第一张」→ 每节点第 1 位都是同一张卡）
  const pickRandomWhere = (pred) => {
    const idxs = [];
    for (let i = 0; i < usable.length; i++) if (pred(usable[i])) idxs.push(i);
    if (!idxs.length) return false;
    const k = idxs[Math.floor(r() * idxs.length)];
    pickCardAt(k);
    return true;
  };
  if (owned) {
    const hasAbility = Array.isArray(owned.abilities) && owned.abilities.length > 0;
    const lacksSecondary = !owned.secondaryWeapon || owned.secondaryWeapon === 'none';
    if (!hasAbility) {
      if(picked.length < count) pickRandomWhere(c => (c.effects || []).some(ef => ef && ef.type === 'ability'));
    }
    if (lacksSecondary) {
      if(picked.length < count) pickRandomWhere(c => (c.effects || []).some(ef => ef && ef.type === 'weapon' && (ef.slot || 'secondary') === 'secondary'));
    }
  }
  // #C3（2026-09-17 用户裁定「升级卡加权/保底」路线）→ 2026-09-19 #D5 用户反馈
  // 「弹种升级速度太快」：无条件保底改**概率触发**（RULES.cards.ammoUpgradeGuaranteeChance，
  // 单次抽取独立掷骰；测试可经 opts.ammoGuaranteeChance 覆盖为 1 复现确定性保底）。
  // #N2（2026-10-10 用户再次反馈「弹种升级太快」）：概率再降 + 随本局已获弹种升级卡数衰减
  // （ammoUpgradePace），且权重抽样通道同步降权（此前只压保底、压不住自然抽样）。
  // 装备优先保底（ability/副武器）语义不变、优先级更高（先判再判弹种保底）。
  let paceFactor = 1;
  if (ammoLoadout) {
    const cfgCards = (typeof RULES !== 'undefined' && RULES.cards) ? RULES.cards : {};
    const pace = cfgCards.ammoUpgradePace || {};
    const decay = typeof pace.decay === 'number' ? pace.decay : 0.55;
    const ownedUpgrades = countOwnedAmmoUpgrades(owned, usable, pool);
    paceFactor = Math.pow(decay, ownedUpgrades);
    const baseChance = typeof cfgCards.ammoUpgradeGuaranteeChance === 'number' ? cfgCards.ammoUpgradeGuaranteeChance : 0.18;
    const chance = (optsOrRng && typeof optsOrRng === 'object' && typeof optsOrRng.ammoGuaranteeChance === 'number')
      ? optsOrRng.ammoGuaranteeChance * paceFactor
      : baseChance * paceFactor;
    // #S5（2026-10-14）：Boss 追加轮必含 1 张弹种升级（opts.guaranteeAmmoUpgrade），
    // 绕开概率掷骰与 pace 衰减；无链资格卡时 pickRandomWhere 静默返回 false，不破坏抽取。
    const forceAmmo = !!(optsOrRng && typeof optsOrRng === 'object' && optsOrRng.guaranteeAmmoUpgrade);
    if (forceAmmo || r() < chance) {
      if(picked.length < count) pickRandomWhere(c => (c.effects || []).some(ef =>
        ef && ef.type === 'ammo' && ef.replaceAmmo && !ammoLoadout.includes(ef.key)));
    }
    // #10（2026-10-15）：Boss 追加轮必含 1 张技能卡（opts.guaranteeSkillCard）
    const forceSkill = !!(optsOrRng && typeof optsOrRng === 'object' && optsOrRng.guaranteeSkillCard);
    if (forceSkill) {
      const ownedAbils = (owned && owned.abilities) || [];
      if(picked.length < count) pickRandomWhere(c => (c.effects || []).some(ef =>
        ef && ef.type === 'ability' && !ownedAbils.includes(ef.key)));
    }
  }
  // #U27（2026-10-17 用户反馈「电磁炮卡牌在 Boss 战中很难刷出来」）：
  //   Boss 追加轮必含 1 张**主武器安装卡**（opts.guaranteePrimaryInstall）——主武器只有
  //   4 张安装卡（全 epic），普通权重抽样下每轮期望出现 0.3 张，实测模拟 3 轮 0/3、
  //   6 轮 1/6（17%），玩家整个 Boss 链都摸不到换炮机会。装配优先级：主武器安装 >
  //   副武器安装（既有装备保底）> 弹种升级——「换炮」是构筑核心，应稳定可获取。
  //   已持有该型（cardEligible 已滤）或池内无货时静默跳过，不破坏抽取。
  const forcePrimary = !!(optsOrRng && typeof optsOrRng === 'object' && optsOrRng.guaranteePrimaryInstall);
  if (forcePrimary) {
    if(picked.length < count) pickRandomWhere(c => (c.effects || []).some(ef =>
      ef && ef.type === 'weapon' && (ef.slot || 'secondary') === 'primary' && ef.action === 'install'));
  }
  // #U28（2026-10-17 同反馈）：Boss 追加轮必含 1 张**副武器安装卡**——与主武器同理由。
  //   仅在玩家尚未安装副武器时保底（已装则升级卡照常走权重抽样）。
  const forceSecondary = !!(optsOrRng && typeof optsOrRng === 'object' && optsOrRng.guaranteeSecondaryInstall);
  if (forceSecondary) {
    const lacksSec = !owned || !owned.secondaryWeapon || owned.secondaryWeapon === 'none';
    if (lacksSec && picked.length < count) {
      pickRandomWhere(c => (c.effects || []).some(ef =>
        ef && ef.type === 'weapon' && (ef.slot || 'secondary') === 'secondary' && ef.action === 'install'));
    }
  }
  // 2026-10-16：Boss 追加轮稀有度保底（opts.guaranteeRarity）+ 权重覆盖（opts.rarityWeights）。
  //   用户口径：「确保至少 1 张传奇、2 张史诗，其余随意，非普通卡抽中几率调高」。
  //   沿革：2026-10-15 曾用单一 guaranteeMinRarityIdx（«至少 1 张达下限»）修 epic 整档被滤出
  //   所致的池枯竭；本次按用户要求升级为**按稀有度配比保底**，从稀到常见逐项满足。
  //   语义：每档「至少」保 N 张——已因装备/技能/弹种保底或自然命中同档则不重复追加；
  //   池内某档无可用卡（抽完 maxStacks / 资格不符）则该项静默跳过，不破坏抽取。
  const RAR = (typeof CARD_RARITIES !== 'undefined') ? CARD_RARITIES : null;
  const rarityOf = (c) => (c && typeof c.rarity === 'string') ? c.rarity : null;
  if (RAR && optsOrRng && typeof optsOrRng === 'object' && optsOrRng.guaranteeRarity) {
    const need = optsOrRng.guaranteeRarity;   // { legendary: 1, epic: 2, ... }
    // 从稀到常见满足（先占高位，避免低位保底挤掉高位名额）
    const order = RAR.slice().reverse();
    for (const rar of order) {
      const want = need[rar] | 0;
      if (want <= 0 || !RAR.includes(rar)) continue;
      for (let i = 0; i < want && picked.length < count; i++) {
        const have = picked.filter(c => rarityOf(c) === rar).length;
        if (have > i) continue;                // 该项已由其它通道命中
        pickRandomWhere(c => rarityOf(c) === rar);
      }
    }
  }
  const rarityWeights = (optsOrRng && typeof optsOrRng === 'object' && optsOrRng.rarityWeights) || null;
  while (picked.length < count && usable.length > 0) {
    // 权重抽样：先按稀有度权重选稀有度，再在该稀有度内随机取一张。
    // #N2：稀有度内抽取按卡权重——弹种升级卡乘 paceFactor（本局已获升级越多、自然出现越慢）。
    // 2026-10-16：Boss 追加轮经 rarityWeights 覆盖（压低普通、抬高稀有以上）。
    //   该档在 usable 已空时回退全池，防权重指向空桶导致死循环式空转。
    let rarity = weightedRarity(r, rarityWeights);
    let bucket = usable.filter(c => c.rarity === rarity);
    if (bucket.length === 0) {
      const weightedPool = rarityWeights ? usable.filter(c => rarityWeights[rarityOf(c)] > 0) : [];
      bucket = weightedPool.length ? weightedPool : usable;
    }
    const card = weightedPickInBucket(bucket, r, paceFactor);
    picked.push(card);
    usable.splice(usable.indexOf(card), 1);
  }
  // #N2：展示顺序随机化——保底只决定候选集成员，不决定屏幕上的位置
  return shufflePicked(picked, r);
}

// 本局已获得的弹种升级卡数量（供节奏衰减）：owned.cards 的 id 计数在 usable/pool 中
// 反查卡定义，只统计「链升级卡」（isAmmoUpgradeCard）。
function countOwnedAmmoUpgrades(owned, usable, pool) {
  if (!owned || !owned.cards) return 0;
  const byId = new Map();
  for (const c of (pool || [])) if (c && c.id) byId.set(c.id, c);
  for (const c of (usable || [])) if (c && c.id) byId.set(c.id, c);
  let n = 0;
  for (const id of Object.keys(owned.cards)) {
    const cnt = owned.cards[id] || 0;
    if (cnt > 0 && isAmmoUpgradeCard(byId.get(id))) n += cnt;
  }
  return n;
}

// 稀有度桶内加权随机取一张（权重：普通卡 1，弹种升级卡 ×paceFactor）
function weightedPickInBucket(bucket, r, paceFactor) {
  if (paceFactor >= 1 || bucket.length <= 1) return bucket[Math.floor(r() * bucket.length)];
  const weights = bucket.map(c => isAmmoUpgradeCard(c) ? Math.max(0.01, paceFactor) : 1);
  let total = 0;
  for (const w of weights) total += w;
  let roll = r() * total;
  for (let i = 0; i < bucket.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return bucket[i];
  }
  return bucket[bucket.length - 1];
}

// 按稀有度权重掷一个稀有度。weights 可覆盖缺省 RARITY_WEIGHTS（2026-10-16：Boss 追加轮
// 用 RULES.cards.bossRound.rarityWeights 提高非普通卡占比；缺省/空表回退全局权重）。
function weightedRarity(r, weights) {
  const W = (weights && Object.keys(weights).length) ? weights : RARITY_WEIGHTS;
  let total = 0;
  for (const k in W) total += W[k];
  if (!(total > 0)) return 'common';          // 权重表全 0 → 回退最普通档，防除零
  let roll = r() * total;
  for (const k in W) {
    roll -= W[k];
    if (roll <= 0) return k;
  }
  return 'common';
}

// ---------- Boss 随机武备（#U39，2026-10-18） ----------

// 从卡池里抽一组「Boss 随机武备」，返回按施加顺序排列的卡对象数组。
// 纯函数：不改任何输入、不触碰坦克状态（施加交给 applyCardEffects）。
//
// 背景：Boss 此前只有 assignBossSkills 随机技能，weapons 永远是 standard + none，
//   主/副武器安装卡与升级卡对它完全不可见（用户反馈「boss 似乎还不会随机到这些武器和升级」）。
//
// 选取规则（cfg = RULES.boss.armament）：
//   ① 主武器：以 primaryChance 掷骰，从池内 `slot=primary && action=install` 随机取 1 张；
//   ② 副武器：以 secondaryChance 掷骰，从 `slot=secondary && action=install` 随机取 1 张；
//      `turret`/`missile_wire` 等无安装卡的型别天然不会被选中（池内没有它们的安装卡）。
//   ③ 升级卡：对**已选中的主/副武器类型**，从 `action=upgrade && weaponType 匹配` 里随机取，
//      最多 upgradeMax 张；每张的抽取概率 = upgradeChance + bossNumber × upgradeChancePerBoss
//      （逐张独立掷骰，已被选中的卡不再重复）。
//   任何一步池内无货都静默跳过，不抛错、不破坏其余步骤。
function pickBossArmament(pool, opts) {
  const o = opts || {};
  const cfg = (typeof RULES !== 'undefined' && RULES.boss && RULES.boss.armament) || {};
  if (cfg.enabled === false) return [];
  const r = (typeof o.rng === 'function') ? o.rng : Math.random;
  const all = Array.isArray(pool) ? pool.filter(c => c && Array.isArray(c.effects)) : [];
  if (!all.length) return [];
  const pickFrom = (list) => list.length ? list[Math.floor(r() * list.length)] : null;
  const weaponOf = (card) => {
    const ef = (card.effects || []).find(e => e && e.type === 'weapon');
    return ef ? { slot: ef.slot || 'secondary', weaponType: ef.weaponType, action: ef.action } : null;
  };
  const out = [];
  const owned = { primary: null, secondary: null };

  // ① 主武器安装
  const pChance = (typeof cfg.primaryChance === 'number') ? cfg.primaryChance : 0.9;
  if (r() < pChance) {
    const card = pickFrom(all.filter(c => {
      const w = weaponOf(c);
      return w && w.slot === 'primary' && w.action === 'install' && w.weaponType;
    }));
    if (card) { out.push(card); owned.primary = weaponOf(card).weaponType; }
  }
  // ② 副武器安装
  const sChance = (typeof cfg.secondaryChance === 'number') ? cfg.secondaryChance : 0.7;
  if (r() < sChance) {
    const card = pickFrom(all.filter(c => {
      const w = weaponOf(c);
      return w && w.slot === 'secondary' && w.action === 'install' && w.weaponType;
    }));
    if (card) { out.push(card); owned.secondary = weaponOf(card).weaponType; }
  }
  // ③ 对应类型的升级卡
  const maxUp = (typeof cfg.upgradeMax === 'number') ? cfg.upgradeMax : 2;
  const baseChance = (typeof cfg.upgradeChance === 'number') ? cfg.upgradeChance : 0.55;
  const perBoss = (typeof cfg.upgradeChancePerBoss === 'number') ? cfg.upgradeChancePerBoss : 0.1;
  const bossNumber = (typeof o.bossNumber === 'number' && o.bossNumber > 0) ? o.bossNumber : 0;
  const chance = Math.max(0, Math.min(1, baseChance + bossNumber * perBoss));
  const used = new Set(out.map(c => c.id));
  for (let i = 0; i < maxUp; i++) {
    if (r() >= chance) continue;                     // 逐张独立掷骰：未命中就跳过该名额
    const cands = all.filter(c => {
      const w = weaponOf(c);
      if (!w || w.action !== 'upgrade' || used.has(c.id)) return false;
      return (w.slot === 'primary' && owned.primary === w.weaponType)
          || (w.slot === 'secondary' && owned.secondary === w.weaponType);
    });
    if (!cands.length) break;
    const card = pickFrom(cands);
    out.push(card);
    used.add(card.id);
  }
  return out;
}

// #U40（2026-10-19）：经济卡聚合助手（接线层专用；applyCardEffects 已写 runScoreMul，
//   shopDiscount 落在 cardEffects 内按效果条数聚合）。
//   runScoreMultiplier(t)：结算得分乘数（economy.scoreMul value 直接叠乘；缺省 1）。
//   runShopDiscount(t)：局内商店价格折扣率 0..0.5（economy.shopDiscount 各卡 value 相加，
//     上限 0.5 防御性钳制——纯折扣卡叠加不应把商店变免费；mvp buyRunShopItem 消费）。
function runScoreMultiplier(t) {
  const v = (t && typeof t.runScoreMul === 'number') ? t.runScoreMul : 1;
  return v > 0 ? v : 1;
}

function runShopDiscount(t) {
  const efs = (t && Array.isArray(t.cardEffects)) ? t.cardEffects : [];
  let d = 0;
  for (const ef of efs) {
    if (ef && ef.type === 'economy' && ef.field === 'shopDiscount' && typeof ef.value === 'number' && ef.value > 0) {
      d += ef.value;
    }
  }
  return Math.min(0.5, d);
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
    weightedRarity,
    pickBossArmament,
    isAmmoUpgradeCard,
    // #W-G（2026-10-19）：应急护盾（原 reactive_armor —— 机制已从「拦截驱动」改为「低血触发」）
    emergencyShieldCooldown,
    emergencyShieldConfig,
    updateEmergencyShieldRearm,
    // 旧名保留为别名（外部脚本/归档文档仍可能引用；语义已改为应急护盾冷却）
    reactiveArmorRecharge: emergencyShieldCooldown,
    updateReactiveArmorRearm: updateEmergencyShieldRearm,
    runScoreMultiplier,
    runShopDiscount
  };
}
