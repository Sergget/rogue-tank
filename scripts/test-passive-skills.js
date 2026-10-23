// test-passive-skills.js — 被动技能槽（2026-10-23 用户裁定）Node 行为测试。
// 运行：node scripts/test-passive-skills.js
//
// 用户裁定原文：「增加被动技能槽，在 ui 中显示（含冷却时间）。将修理、医疗、灭火、应急护盾等
// 不需要操作生效的卡牌都移动到『被动技能』卡牌类别中，被动技能槽属于坦克属性，无法通过升级增减，
// 默认 2 个，后续再获取需要和主动技能一样选择顶替。火力、装甲、血量、机动的数据直接升级不加入
// 『被动技能』的范畴。」
//
// 覆盖：
//   1) isPassiveSkillCard 判定口径（passive / drone / innate 强化卡 = 被动；modifier 火力装甲
//      血量机动 / ammo / weapon / economy / runtime 主动技能 = 非被动）
//   2) passiveSlotMax 唯一口径（RULES.abilities.passiveSlotsMax = 2，升级不可增减）
//   3) ownedPassiveCardIds / passiveSlotState / passiveSlotsFull 槽位视图
//   4) removePassiveCard 顶替撤除（修饰器 + cardEffects + applyCount 全清、stats 回落）
//   5) 真实卡池逐个分类扫描（修理/灭火/应急护盾/摆角/成员内衬/超口径/防崩落/湿式弹药架/无人机）
'use strict';

const fs = require('fs');
const path = require('path');
const U = require('../js/tank_utils.js');
global.TAU = U.TAU;
const RULES_MOD = require('../js/tank_rules.js');
global.RULES = RULES_MOD.RULES;
const MD = require('../js/tank_model.js');
global.addModifier = MD.addModifier;
global.refreshStats = MD.refreshStats;
global.removeModifierBySource = MD.removeModifierBySource;
const cardsMod = require('../js/tank_cards.js');

let fails = 0;
function ok(cond, label) {
  if (cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}`); fails++; }
}

function loadCards() {
  const dir = path.join(__dirname, '../cards');
  const out = {};
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.json'))) {
    try {
      const spec = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      if (spec && spec.id) out[spec.id] = spec;
    } catch (e) { /* 忽略坏文件（validate-content 负责报错） */ }
  }
  return out;
}
const CARDS = loadCards();

function freshTank() {
  const t = MD.makeTank({
    id: 'ptank', name: 'P', team: 'player',
    hull: { pts: [[-20,-14],[20,-14],[20,14],[-20,14]] },
    turret: { pts: [[-10,-8],[10,-8],[10,8],[-10,8]] },
    base: { maxHp: 1000, armor: { hull: { front: 100, side: 80, rear: 60 }, turret: { front: 90, side: 70, rear: 50 } } }
  });
  t.cardEffects = [];
  t.modifiers = [];
  t._cardApplyCount = {};
  t._cardApplyLog = [];
  if (typeof MD.refreshStats === 'function') MD.refreshStats(t);
  return t;
}

// ---------- 1) 判定口径 ----------
console.log('\n== 1) isPassiveSkillCard 判定口径 ==');
{
  // 被动技能（应为 true）
  const expectPassive = [
    'repair_kit',              // ability/repair（固有技能强化）
    'support_extinguisher',    // ability/extinguish（固有技能强化）
    'reactive_armor',          // passive reactive_armor（应急护盾）
    'angle_boost',             // passive angle_boost
    'crew_liner',              // passive crew_liner
    'demo_overmatch_shell',    // passive overmatch
    'spall_liner',             // passive spall_liner
    'support_spall_liner',     // passive spall_liner
    'wet_ammo_rack',           // passive wet_ammo_rack
    'sniper_overmatch_shot',   // passive overmatch
    'escort_drone'             // drone striker（伴随无人机）
  ];
  const missing = expectPassive.filter(id => !CARDS[id]);
  ok(missing.length === 0, `1a 被动技能卡全部存在于卡池${missing.length ? ` — 缺失 ${missing.join(',')}` : ''}`);
  for (const id of expectPassive) {
    if (!CARDS[id]) continue;
    ok(cardsMod.isPassiveSkillCard(CARDS[id]) === true, `1a ${id} 判定为被动技能卡`);
  }

  // 非被动（应为 false）：火力/装甲/血量/机动直接升级 + ammo + weapon + economy + runtime 主动技能
  const expectActive = [
    'reload_speed_1',            // modifier 火力（装填）
    'aim_speed_1',               // modifier 火力（瞄准）
    'hull_hp_boost_1',           // modifier 血量
    'hull_armor_front_1',        // modifier 装甲
    'mobile_gearbox',            // modifier 机动
    'ap_ammo',                   // modifier 穿深
    'ammo_upgrade_apcr',         // ammo
    'weapon_secondary_missile',  // weapon
    'support_logistics',         // economy
    'artillery_strike',          // ability/artillery（runtime 主动技能）
    'tactical_shield',           // ability/shield（runtime 主动技能）
    'super_reload',              // ability/overdrive
    'ability_deploy_cover',      // ability/deploy_cover
    'ability_aps'                // ability/aps
  ];
  const missingA = expectActive.filter(id => !CARDS[id]);
  ok(missingA.length === 0, `1b 对照卡存在${missingA.length ? ` — 缺失 ${missingA.join(',')}` : ''}`);
  for (const id of expectActive) {
    if (!CARDS[id]) continue;
    ok(cardsMod.isPassiveSkillCard(CARDS[id]) === false, `1b ${id} 不属于被动技能（${CARDS[id].effects[0].type}）`);
  }
}

// ---------- 2) 槽上限：每辆坦克固定数量（车型配置），非升级项 ----------
console.log('\n== 2) passiveSlotMax：每车固定数量（车型配置） ==');
{
  ok(cardsMod.passiveSlotMax(null) === 2, '2a 无实例/未配置时回退默认 2 格');
  ok(RULES.abilities.passiveSlotsMax === 2, '2b RULES.abilities.passiveSlotsMax === 2（缺省基准）');
  // 车型配置决定槽位数（用户裁定「每辆坦克固定数量，后期高等级坦克会赋予更多」）
  const light = { id: 'lt', passiveSlots: 2 };
  const heavy = { id: 'ht', passiveSlots: 3 };
  ok(cardsMod.passiveSlotMax(light) === 2, '2c 轻/中型坦克配置 2 格');
  ok(cardsMod.passiveSlotMax(heavy) === 3, '2d 重坦配置 3 格（高等级坦克赋予更多）');
  // 真实车型文件已带 passiveSlots
  const tanksDir = path.join(__dirname, '../tanks');
  const tankFiles = fs.readdirSync(tanksDir).filter(f => f.endsWith('.json'));
  const noSlot = [];
  for (const f of tankFiles) {
    const spec = JSON.parse(fs.readFileSync(path.join(tanksDir, f), 'utf8'));
    if (typeof spec.passiveSlots !== 'number') noSlot.push(f);
  }
  ok(noSlot.length === 0, `2e 全部 ${tankFiles.length} 份车型配置均声明 passiveSlots${noSlot.length ? ` — 缺 ${noSlot.join(',')}` : ''}`);
  // 升级路径不触碰槽位：商店/永久升级树里不得出现 passive 槽扩容项
  const eco = require('../js/tank_economy.js');
  const defs = (eco.UPGRADE_DEFS || []).filter(u => /passive/i.test(u.id || ''));
  ok(defs.length === 0, `2f 永久升级树无被动槽扩容项（命中 ${defs.length} 条）——槽位是车型属性、非升级项`);
  const runDefs = (eco.RUN_SHOP_DEFS || []).filter(u => /passive/i.test(u.id || ''));
  ok(runDefs.length === 0, `2g 局内商店无被动槽扩容项（命中 ${runDefs.length} 条）`);
}

// ---------- 3) 槽位视图 ----------
console.log('\n== 3) ownedPassiveCardIds / passiveSlotState / passiveSlotsFull ==');
{
  const t = freshTank();
  ok(cardsMod.ownedPassiveCardIds(t).length === 0, '3a 无卡时槽为空');
  ok(cardsMod.passiveSlotsFull(t) === false, '3b 无卡时未满');

  cardsMod.applyCardEffects(t, CARDS.reactive_armor);
  MD.refreshStats(t);
  let st = cardsMod.passiveSlotState(t);
  ok(st.used === 1 && st.free === 1 && st.max === 2, `3c 一张被动卡占 1 格（used=${st.used} free=${st.free} max=${st.max}）`);
  ok(cardsMod.passiveSlotsFull(t) === false, '3d 1/2 未满');

  cardsMod.applyCardEffects(t, CARDS.angle_boost);
  MD.refreshStats(t);
  st = cardsMod.passiveSlotState(t);
  ok(st.used === 2 && st.free === 0, `3e 两张被动卡占满 2 格（used=${st.used} free=${st.free}）`);
  ok(cardsMod.passiveSlotsFull(t) === true, '3f 2/2 已满 —— 新被动卡需顶替');

  // 非被动卡不占被动槽
  cardsMod.applyCardEffects(t, CARDS.reload_speed_1);
  MD.refreshStats(t);
  ok(cardsMod.passiveSlotState(t).used === 2, '3g modifier（火力）卡不占被动槽');

  // 同卡多效果只占 1 格（去重）
  const t2 = freshTank();
  const droneCard = { id: 'multi_drone_test', name: '双机编队', rarity: 'epic', maxStacks: 1,
    effects: [{ type: 'drone', kind: 'striker' }, { type: 'drone', kind: 'striker' }] };
  cardsMod.applyCardEffects(t2, droneCard);
  ok(cardsMod.ownedPassiveCardIds(t2).length === 1, '3h 同卡多效果只占 1 格（去重）');
}

// ---------- 4) 顶替撤除 ----------
console.log('\n== 4) removePassiveCard 顶替撤除 ==');
{
  const t = freshTank();
  cardsMod.applyCardEffects(t, CARDS.hull_hp_boost_1);   // modifier 卡（非被动，验证不被误清）
  MD.refreshStats(t);
  const hpBoosted = t.stats.maxHp;
  ok(hpBoosted > 1000, `4a 前置：血量卡生效（maxHp ${hpBoosted}）`);

  cardsMod.applyCardEffects(t, CARDS.reactive_armor);
  MD.refreshStats(t);
  ok(cardsMod.ownedPassiveCardIds(t).indexOf('reactive_armor') >= 0, '4b 应急护盾占槽');

  const removed = cardsMod.removePassiveCard(t, 'reactive_armor');
  MD.refreshStats(t);
  ok(removed === true, '4c removePassiveCard 返回 true');
  ok(cardsMod.ownedPassiveCardIds(t).indexOf('reactive_armor') < 0, '4d 撤除后不再占槽');
  ok(!(t.cardEffects || []).some(e => e && e.cardId === 'reactive_armor'), '4e cardEffects 条目已清');
  ok(!(t._cardApplyCount || {}).reactive_armor, '4f applyCount 计数已清（该卡可再次被抽到）');
  ok(t.stats.maxHp === hpBoosted, '4g 其它卡效果不受影响（血量卡仍在）');
  ok(cardsMod.cardEligible(CARDS.reactive_armor, { abilities: [], cards: t._cardApplyCount }) === true,
    '4h 顶替后该被动卡重新合格（可再抽到）');

  // 修饰器型被动卡（若将来有 modifier+passive 混合卡）也能清干净
  const t3 = freshTank();
  cardsMod.applyCardEffects(t3, CARDS.spall_liner);
  ok(cardsMod.ownedPassiveCardIds(t3).length === 1, '4i 防崩落内衬占槽');
  cardsMod.removePassiveCard(t3, 'spall_liner');
  ok(cardsMod.ownedPassiveCardIds(t3).length === 0, '4j 撤除后槽空');
}

// ---------- 5) 卡池分类扫描 ----------
console.log('\n== 5) 真实卡池分类扫描 ==');
{
  const passiveIds = [];
  const activeAbilityIds = [];
  for (const id of Object.keys(CARDS)) {
    const c = CARDS[id];
    if (!Array.isArray(c.effects) || c.effects.length === 0) continue;
    if (c.enabled === false) continue;                  // 2026-10-23：停用卡不计入分类统计
    if (cardsMod.isPassiveSkillCard(c)) passiveIds.push(id);
    if (c.effects.some(e => e && e.type === 'ability' && ['artillery', 'overdrive', 'shield', 'deploy_cover', 'aps'].indexOf(e.key) >= 0)) {
      activeAbilityIds.push(id);
    }
  }
  console.log(`  被动技能卡 ${passiveIds.length} 张：${passiveIds.sort().join(', ')}`);
  console.log(`  主动技能卡 ${activeAbilityIds.length} 张：${activeAbilityIds.sort().join(', ')}`);
  ok(passiveIds.length >= 9, `5a 被动技能卡数量合理（${passiveIds.length} ≥ 9）`);
  // 两类不得交叉（除 repair_kit/support_extinguisher 是 innate 强化卡，只属被动）
  const cross = passiveIds.filter(id => activeAbilityIds.indexOf(id) >= 0);
  ok(cross.length === 0, `5b 被动 / 主动技能集不交叉${cross.length ? ` — 交叉 ${cross.join(',')}` : ''}`);
  // 全部 passive 效果卡必须被判定为被动技能（停用卡不计）
  const passiveEffCards = Object.keys(CARDS).filter(id =>
    CARDS[id].enabled !== false
    && Array.isArray(CARDS[id].effects) && CARDS[id].effects.some(e => e && e.type === 'passive'));
  const leaked = passiveEffCards.filter(id => passiveIds.indexOf(id) < 0);
  ok(leaked.length === 0, `5c 全 ${passiveEffCards.length} 张 passive 效果卡均归入被动技能${leaked.length ? ` — 漏 ${leaked.join(',')}` : ''}`);
  // 全部 drone 卡必须被判定为被动技能（停用卡不计——scout_drone 已于 2026-10-23 删除）
  const droneCards = Object.keys(CARDS).filter(id =>
    CARDS[id].enabled !== false
    && Array.isArray(CARDS[id].effects) && CARDS[id].effects.some(e => e && e.type === 'drone'));
  const droneLeak = droneCards.filter(id => passiveIds.indexOf(id) < 0);
  ok(droneLeak.length === 0, `5d 全 ${droneCards.length} 张无人机卡均归入被动技能${droneLeak.length ? ` — 漏 ${droneLeak.join(',')}` : ''}`);
  // modifier 卡绝不进入被动集（火力/装甲/血量/机动/装填/散布…）
  const modifierLeak = passiveIds.filter(id => {
    const efs = (CARDS[id].effects || []).filter(Boolean);
    return efs.length > 0 && efs.every(e => e.type === 'modifier');
  });
  ok(modifierLeak.length === 0, `5e 纯 modifier 卡未混入被动技能集${modifierLeak.length ? ` — 误入 ${modifierLeak.join(',')}` : ''}`);

  // ---------- 5f) 侦查无人机已删除（2026-10-23 用户裁定） ----------
  const scout = CARDS.scout_drone;
  ok(!scout || scout.enabled === false, '5f 侦查无人机卡已停用（enabled:false）');
  // 停用卡在任何抽取路径都不可达
  let scoutDrawn = 0;
  for (let i = 0; i < 300; i++) {
    const picks = cardsMod.drawCardChoices(Object.values(CARDS), 5, {
      owned: { abilities: [], secondaryWeapon: 'none', primaryWeapon: 'standard', cards: {} }
    });
    if (picks.some(c => c && c.id === 'scout_drone')) scoutDrawn++;
  }
  ok(scoutDrawn === 0, `5g 300 轮抽取零次抽到侦查无人机（实测 ${scoutDrawn} 次）`);
  // 停用卡也不被 cardEligible 放行
  ok(cardsMod.cardEligible({ id: 'x', effects: [{ type: 'passive', key: 'angle_boost', value: 5 }], enabled: false }, {}) === false,
    '5h cardEligible 拒绝 enabled:false 卡');
}

// ---------- 6) 导弹越障 / 攻顶参数与卡牌 ----------
console.log('\n== 6) 导弹越障 / 攻顶（2026-10-23 用户裁定）==');
{
  const m = RULES.missiles;
  ok(m.wire.overflyChance === 1.0, '6a 线导导弹默认可越过低矮掩体（overflyChance = 1）');
  ok(m.lock.overflyChance === 0.5, '6b 锁定导弹仅 50% 概率越过掩体（overflyChance = 0.5）');
  ok(Math.abs(m.wire.turnRate - 2.5) < 1e-9 && Math.abs(m.lock.turnRate - 2.0) < 1e-9,
    `6c 拐弯能力已削弱（wire ${m.wire.turnRate} / lock ${m.lock.turnRate}，原 4.5 / 3.5）`);
  ok(m.topAttack && m.topAttack.dmgScale === 0.6, '6d 攻顶伤害基准 60%');
  ok(m.topAttack.useThinnestArmor === true, '6e 攻顶穿甲判定按最薄装甲');

  // 低矮掩体标记：直线掩体/沙袋/树可越；建筑/岩石不可
  const T = RULES.coverTiers;
  ok(T.wall.missileOverfly === true, '6f 直线掩体可被导弹越过');
  ok(T.wall_breakable.missileOverfly === true, '6g 沙袋掩体可被导弹越过');
  ok(T.tree.missileOverfly === true, '6h 树木可被导弹越过');
  ok(!T.building.missileOverfly, '6i 建筑不可越过');
  ok(!T.rock.missileOverfly, '6j 岩石不可越过');
  ok(!T.perm_block.missileOverfly, '6k 永久掩体不可越过');

  // 攻顶升级卡存在且挂对武器型
  ok(cardsMod.isPassiveSkillCard(CARDS.weapon_secondary_missile_top_attack) === false, '6l 攻顶卡是 weapon 升级卡（非被动技能）');
  const taLock = CARDS.weapon_secondary_missile_top_attack;
  const taWire = CARDS.weapon_secondary_missile_wire_top_attack;
  ok(!!taLock && taLock.effects[0].weaponType === 'missile' && taLock.effects[0].statOverrides.topAttack === true,
    '6m 锁定式攻顶升级卡存在（weaponType=missile, topAttack=true）');
  ok(!!taWire && taWire.effects[0].weaponType === 'missile_wire' && taWire.effects[0].statOverrides.topAttack === true,
    '6n 线导式攻顶升级卡存在（weaponType=missile_wire, topAttack=true）');

  // statOverrides 合并：topAttack 布尔值写入武器 stats
  const t = freshTank();
  t.weapons = { primary: { type: 'standard', stats: {} }, secondary: { type: 'missile', stats: { reload: 12, damage: 140 } } };
  cardsMod.applyCardEffects(t, taLock);
  ok(t.weapons.secondary.stats.topAttack === true, '6o 攻顶卡写入 weapons.secondary.stats.topAttack');
}

console.log(`\ntest-passive-skills: ${fails === 0 ? '全部通过' : fails + ' 项失败'}`);
process.exitCode = fails ? 1 : 0;
