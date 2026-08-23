// @ts-nocheck
'use strict';

// tank_screens.js — 覆盖层纯逻辑视图模型（P-29）
// 职责：把 Home/Loadout/Shop/Map/Settlement/DeathShop 等覆盖层的
//       “界面状态与渲染数据组装”抽为零 DOM 依赖的纯函数，返回 viewModel。
//       DOM 接线留在 tank_mvp.html 薄包装层（事件监听与 class 名不变）。
// 依赖：全局 RULES（仅读 speed.kmhFactor / ammoTypes / economy.reviveCost，回退默认值）
//       全局 UPGRADE_DEFS（可选传入，未传入时尝试读全局）
// 加载顺序：tank_rules.js → tank_economy.js / tank_flow.js 之后、内联脚本之前
// 双端导出：浏览器全局 + Node module.exports

const SCREENS = ['mapScreen','settleScreen','rewardScreen','gameoverScreen','homeScreen','loadoutScreen','shopScreen'];

function formatStamp(ms){
  const d = new Date(ms || 0);
  const p2 = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

function tankSummary(spec){
  const kmhFactor = (typeof RULES !== 'undefined' && RULES.speed && typeof RULES.speed.kmhFactor === 'number') ? RULES.speed.kmhFactor : 0.5;
  const kmh = Math.round((spec.maxSpeed !== undefined ? spec.maxSpeed : 120) * kmhFactor);
  const front = (spec.armor && spec.armor.hull && spec.armor.hull.front !== undefined) ? spec.armor.hull.front
              : ((spec.hull && spec.hull.armor && spec.hull.armor.front !== undefined) ? spec.hull.armor.front : 110);
  const hp = (spec.hp !== undefined) ? spec.hp : ((spec.maxHp !== undefined) ? spec.maxHp : 100);
  const pen = spec.penetration !== undefined ? spec.penetration : 120;
  return `极速 ${kmh}km/h · 耐久 ${hp} · 正面 ${front}mm · 穿深 ${pen}mm`;
}

function deploymentReady(profile, tankListData){
  return !!(profile && profile.selectedTankId && tankListData && tankListData[profile.selectedTankId]) &&
         Array.isArray(profile.ammoLoadout) && profile.ammoLoadout.length >= 1;
}

function _loadoutHint(profile, tankListData){
  if(!profile || !profile.selectedTankId) return '请选择一辆出战坦克。';
  if(!tankListData || !tankListData[profile.selectedTankId]) return '所选坦克不在当前 tanks/ 列表中，请重新选择。';
  if(!(profile.ammoLoadout || []).length) return '请至少选配 1 种弹药。';
  return `已选弹种 ${(profile.ammoLoadout).length}/3 · 配置在出击时写入存档。`;
}

function buildHomeViewModel(opts){
  opts = opts || {};
  const slots = Array.isArray(opts.slots) ? opts.slots : [];
  const activeId = opts.activeId || null;
  const renamingSlotId = opts.renamingSlotId || null;
  const deleteArmSlotId = opts.deleteArmSlotId || null;
  const slotProfileOf = opts.slotProfileOf;
  const empty = slots.length === 0;
  const rows = slots.map(s => {
    let prof = null;
    if(typeof slotProfileOf === 'function'){
      try{ prof = slotProfileOf(s.id); }catch(e){ prof = null; }
    } else if(slotProfileOf && typeof slotProfileOf === 'object'){
      prof = slotProfileOf[s.id] || null;
    }
    const active = s.id === activeId;
    const renamingInput = renamingSlotId === s.id;
    const showDeleteConfirm = deleteArmSlotId === s.id;
    const runs = prof && prof.stats && typeof prof.stats.runs === 'number' ? prof.stats.runs : 0;
    const kills = prof && prof.stats && typeof prof.stats.kills === 'number' ? prof.stats.kills : 0;
    const points = prof && typeof prof.points === 'number' ? prof.points : 0;
    const meta = `局数 ${runs} · 击杀 ${kills} · 点数 ${points} · ${formatStamp(s.updatedAt)}`;
    return {
      id: s.id,
      name: s.name,
      active,
      badge: active,
      meta,
      renamingInput,
      showDeleteConfirm,
      updatedAt: s.updatedAt,
      stats: prof ? prof.stats : { runs:0, kills:0 },
      points
    };
  });
  return { empty, rows };
}

function buildLoadoutViewModel(opts){
  opts = opts || {};
  const profile = opts.profile || { selectedTankId: null, ammoLoadout: [] };
  const tankListData = opts.tankListData || null;
  const ammoTypes = opts.ammoTypes || (typeof RULES !== 'undefined' && RULES.ammoTypes) || {};
  const ready = deploymentReady(profile, tankListData);
  const hint = _loadoutHint(profile, tankListData);
  const ids = tankListData ? Object.keys(tankListData).sort() : [];
  const tankCards = ids.map(id => ({
    id,
    summary: tankSummary(tankListData[id]),
    selected: profile.selectedTankId === id
  }));
  const emptyTankList = ids.length === 0;
  const ammoRows = Object.keys(ammoTypes).map(key => {
    const a = ammoTypes[key];
    const bits = [`穿深×${a.pen}`, `伤害×${a.dmg}`, `弹速×${a.speed}`];
    if(a.noBounce) bits.push('无跳弹');
    if(a.splashRadius) bits.push(`溅射${a.splashRadius}px`);
    return {
      key,
      label: a.label,
      color: a.color,
      bits: bits.join(' · '),
      bitsArr: bits,
      checked: (profile.ammoLoadout || []).indexOf(key) >= 0
    };
  });
  return { tankCards, ammoRows, hint, ready, emptyTankList };
}

function buildShopViewModel(opts){
  opts = opts || {};
  const profile = opts.profile || { points: 0, upgrades: {}, bonusRevives: 0 };
  const upgradeDefs = opts.upgradeDefs || (typeof UPGRADE_DEFS !== 'undefined' ? UPGRADE_DEFS : []);
  const economyRules = opts.economyRules || (typeof RULES !== 'undefined' && RULES.economy) || {};
  const reviveCost = economyRules.reviveCost !== undefined ? economyRules.reviveCost : 40;
  const pointsText = `商店点数 POINTS ▸ ${profile.points | 0}`;
  function lvOf(id){ return (profile.upgrades && profile.upgrades[id]) | 0; }
  const upgrades = upgradeDefs.map(u => {
    const lv = lvOf(u.id);
    const maxed = lv >= u.maxLevel;
    const can = !maxed && (profile.points | 0) >= u.cost;
    const costText = maxed ? '已满级' : u.cost + ' 点';
    const lvText = maxed ? 'MAX' : `Lv ${lv}/${u.maxLevel}`;
    return { id: u.id, name: u.name, desc: u.desc, lv, maxLevel: u.maxLevel, cost: u.cost, maxed, can, costText, lvText };
  });
  const revive = { cost: reviveCost, can: (profile.points | 0) >= reviveCost, bonus: profile.bonusRevives | 0 };
  return { pointsText, upgrades, revive };
}

function buildMapListViewModel(opts){
  opts = opts || {};
  const run = opts.run || null;
  const currentNodeIndex = opts.currentNodeIndex !== undefined ? opts.currentNodeIndex : null;
  const runFinished = !!opts.runFinished;
  if(!run || !Array.isArray(run.nodes)){
    return { rows: [], hintText: runFinished ? '🎉 全链通关！点「开始新的一局」再战。' : '线性推进：每个节点是独立战场，难度随推进上升。清除全部敌军即通关；友军据点存活可获结算加成（§4.5）。阵亡耗尽复活次数即结束本局。', finished: runFinished, empty: true };
  }
  const rows = run.nodes.map((n, i) => ({
    index: i,
    mark: currentNodeIndex === i ? '▶' : '',
    name: n.template ? n.template.name : `节点${i + 1}`,
    meta: `敌军 ${n.enemies ? n.enemies.length : 0} · ${n.outpost ? '有据点' : '无据点'} · ${n.w}×${n.h}`,
    diffText: `难度 ${((n.difficulty || 0) * 100).toFixed(0)}%`,
    current: currentNodeIndex === i
  }));
  const hintText = runFinished
    ? '🎉 全链通关！点「开始新的一局」再战。'
    : '线性推进：每个节点是独立战场，难度随推进上升。清除全部敌军即通关；友军据点存活可获结算加成（§4.5）。阵亡耗尽复活次数即结束本局。';
  return { rows, hintText, finished: runFinished, empty: false };
}

function buildDeathShopViewModel(opts){
  opts = opts || {};
  const profile = opts.profile || { points: 0, upgrades: {}, bonusRevives: 0 };
  const upgradeDefs = opts.upgradeDefs || (typeof UPGRADE_DEFS !== 'undefined' ? UPGRADE_DEFS : []);
  const reviveCost = opts.reviveCost !== undefined ? opts.reviveCost : ((typeof RULES !== 'undefined' && RULES.economy && RULES.economy.reviveCost) || 40);
  const base = buildShopViewModel({ profile, upgradeDefs, economyRules: { reviveCost } });
  const header = `死亡后商店 · 点数 ${profile.points | 0}`;
  return { header, pointsText: base.pointsText, upgrades: base.upgrades, revive: base.revive };
}

function buildSettlementViewModel(opts){
  opts = opts || {};
  const score = opts.score || null;
  const clearMs = opts.clearMs || 0;
  const bossLoot = opts.bossLoot || null;
  if(!score) return { rows: [] };
  const rows = [];
  rows.push({ k: '基础奖励', v: String(score.base) });
  if(Array.isArray(score.bonuses)){
    for(const b of score.bonuses) rows.push({ k: b.label, v: `+${b.amount}` });
  }
  if(bossLoot && bossLoot.score) rows.push({ k: 'Boss 战利品', v: `+${bossLoot.score}` });
  rows.push({ k: '通关用时', v: `${(clearMs / 1000).toFixed(1)}s` });
  rows.push({ k: '本节点得分', v: String(score.total), total: true });
  return { rows };
}

// 浏览器全局暴露（供 tank_mvp.html 薄包装调用；同时保持顶层标识符可直接访问）
if(typeof window !== 'undefined'){
  window.TankScreens = {
    SCREENS,
    formatStamp,
    tankSummary,
    deploymentReady,
    buildHomeViewModel,
    buildLoadoutViewModel,
    buildShopViewModel,
    buildMapListViewModel,
    buildDeathShopViewModel,
    buildSettlementViewModel
  };
  window.SCREENS = SCREENS;
  window.formatStamp = formatStamp;
  window.tankSummary = tankSummary;
  window.deploymentReady = deploymentReady;
  window.buildHomeViewModel = buildHomeViewModel;
  window.buildLoadoutViewModel = buildLoadoutViewModel;
  window.buildShopViewModel = buildShopViewModel;
  window.buildMapListViewModel = buildMapListViewModel;
  window.buildDeathShopViewModel = buildDeathShopViewModel;
  window.buildSettlementViewModel = buildSettlementViewModel;
  // tankSummary / deploymentReady 可能已被 mvp 内联同名覆盖，薄包装层优先用 TankScreens.*
}

if(typeof module !== 'undefined' && module.exports){
  module.exports = {
    SCREENS,
    formatStamp,
    tankSummary,
    deploymentReady,
    buildHomeViewModel,
    buildLoadoutViewModel,
    buildShopViewModel,
    buildMapListViewModel,
    buildDeathShopViewModel,
    buildSettlementViewModel
  };
}
