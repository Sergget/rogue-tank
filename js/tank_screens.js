// @ts-nocheck
'use strict';

// tank_screens.js — 覆盖层纯逻辑视图模型（P-29）
// 职责：把 Home/Loadout/Shop/Map/Settlement/DeathShop 等覆盖层的
//       “界面状态与渲染数据组装”抽为零 DOM 依赖的纯函数，返回 viewModel。
//       DOM 接线留在 tank_battle.html 薄包装层（事件监听与 class 名不变）。
// 依赖：全局 RULES（仅读 speed.kmhFactor / ammoTypes / economy.reviveCost，回退默认值）
//       全局 UPGRADE_DEFS（可选传入，未传入时尝试读全局）
// 加载顺序：tank_rules.js → tank_economy.js / tank_flow.js 之后、内联脚本之前
// 双端导出：浏览器全局 + Node module.exports

// 覆盖层屏幕 id 全集（hideAllScreens 的遍历清单）。**必须与 tank_battle.html 里实际存在的
// #xxxScreen 元素一一对应**：2026-10-29 HOME 与 LOADOUT 合并成一屏后 `#loadoutScreen` 元素
// 已删除，清单里残留它会让 `document.getElementById(...).style` 拿到 null 抛错——
// 而那次抛错发生在 initMenu 里，整页在首屏就死了（用户反馈「选模式后进不去游戏」）。
// 流程状态 `loadout` 仍然保留（tank_flow 白名单），它现在复用 homeScreen，不是屏幕。
const SCREENS = ['mapScreen','settleScreen','rewardScreen','gameoverScreen','homeScreen','shopScreen','pauseScreen'];

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

function deploymentReady(profile, tankListData){  return !!(profile && profile.selectedTankId && tankListData && tankListData[profile.selectedTankId]) &&
         Array.isArray(profile.ammoLoadout) && profile.ammoLoadout.length >= 1;
}

function _loadoutHint(profile, tankListData){
  if(!profile || !profile.selectedTankId) return '请选择一辆出战坦克。';
  if(!tankListData || !tankListData[profile.selectedTankId]) return '所选坦克不在当前 tanks/ 列表中，请重新选择。';
  if(!(profile.ammoLoadout || []).length) return '请至少选配 1 种弹药。';
  return `已选弹种 ${(profile.ammoLoadout).length}/3 · 配置在出击时写入存档。`;
}

// 永久升级总览行（首页存档卡片）：遍历 profile.upgrades 非零项，按 UPGRADE_DEFS 顺序拼名称。
// 特殊消费项（repair_kit_cd/medkit_cd 等 stat 为空的 def）同样展示——它们是玩家可感知的成长。
function upgradesOverviewLine(prof, upgradeDefs){
  const defs = Array.isArray(upgradeDefs) ? upgradeDefs
    : ((typeof UPGRADE_DEFS !== 'undefined' && Array.isArray(UPGRADE_DEFS)) ? UPGRADE_DEFS : []);
  const ups = (prof && prof.upgrades && typeof prof.upgrades === 'object') ? prof.upgrades : {};
  const parts = [];
  for(const d of defs){
    const lv = ups[d.id] | 0;
    if(lv > 0) parts.push(`${d.name} Lv${lv}`);
  }
  return parts.length ? `永久升级：${parts.join(' · ')}` : '';
}

/**
 * 首页视图模型：真实存档行 + 预设存档行。
 *
 * 2026-10-29（用户裁定）：预设不再以「两个按钮」出现，改为存档列表里的**两条常驻条目**
 *   ——和真实档案读起来是同一个列表，但语义不同：预设行不可重命名/删除，点它等于
 *   「载入该预设并进入」，同一预设重复点会原地重置同名档案而不是越堆越多（页面负责）。
 *
 * @param {{slots?:Array, activeId?:string|null, renamingSlotId?:string|null,
 *          deleteArmSlotId?:string|null, slotProfileOf?:Function|Object,
 *          upgradeDefs?:Array,
 *          presets?:Array<{id:string,name:string,url:string,hint?:string,hasSlot?:boolean}>}} [opts]
 * @returns {{empty:boolean, rows:Array, presetRows:Array}} `empty` 只表示**没有真实存档**
 *   （预设不算档案，否则「尚无存档」的提示永远不会出现）
 */
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
      upgradesLine: upgradesOverviewLine(prof, opts.upgradeDefs),
      renamingInput,
      showDeleteConfirm,
      updatedAt: s.updatedAt,
      stats: prof ? prof.stats : { runs:0, kills:0 },
      points
    };
  });
  // 预设行：只做展示字段的归一化（id 前缀 `preset:` 保证与真实槽位 id 不可能撞车）
  const presetRows = (Array.isArray(opts.presets) ? opts.presets : [])
    .filter(p => p && typeof p.id === 'string' && p.id && typeof p.name === 'string' && p.name)
    .map(p => ({
      id: 'preset:' + p.id,
      presetId: p.id,
      name: p.name,
      url: (typeof p.url === 'string') ? p.url : '',
      hint: (typeof p.hint === 'string') ? p.hint : '',
      hasSlot: p.hasSlot === true,
    }));
  return { empty, rows, presetRows };
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
  const unlocked = Array.isArray(profile.unlockedAmmo) ? profile.unlockedAmmo : ['ap', 'he'];
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
      checked: (profile.ammoLoadout || []).indexOf(key) >= 0,
      // 阶段六 6.3：未解锁弹种置灰锁定（随链上升级卡解锁）
      locked: unlocked.indexOf(key) < 0
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

// P-35：暂停/设置面板视图模型（零 DOM）——按键绑定说明 + 设置开关状态 + 按钮定义。
// DOM 接线（ESC 切换 / checkbox 写档 / 终止结算按钮）留在 tank_battle.html 薄包装层。
function buildPausePanel(opts){
  opts = opts || {};
  const settings = (opts.settings && typeof opts.settings === 'object') ? opts.settings : {};
  const bindings = [
    { keys: 'W / A / S / D', desc: '前进 / 转向 / 倒车' },
    { keys: '鼠标 + 左键 / 空格', desc: '炮塔瞄准 · 开火' },
    { keys: '1 / 2 / 3 或 Q / 滚轮', desc: '切换弹种' },
    { keys: 'F', desc: '烟幕弹' },
    { keys: 'G', desc: '战术炮击' },
    { keys: 'H（Shift+H 全向）', desc: '护盾' },
    { keys: 'V', desc: '超装填' },
    { keys: '4', desc: '修理箱—修复受损模块' },
    { keys: '5', desc: '医疗包—救治全体成员' },
    { keys: '` 或 F12', desc: '开发者面板' },
    { keys: 'Tab', desc: '玩家状态面板' },
    { keys: 'ESC', desc: '暂停 ⇄ 继续' }
  ];
  return {
    bindings,
    settings: {
      invertReverseTurn: !!settings.invertReverseTurn,
      invertReverseTurnDesc: '倒车转向倒置：S 倒车时 A/D 转向反置（拟真履带差速）。',
      showFps: !!settings.showFps,
      showFpsLabel: '显示帧率 (FPS)',
      // 2026-10-30：瞄准器样式（用户需求：显示实时散布圈/装填进度/弹夹与双管状态；
      //   当前 UI 作为「默认」瞄准器保留，均可设置）
      aimStyle: (settings.aimStyle === 'crosshair') ? 'crosshair' : 'default',
      aimStyleDefaultLabel: '默认瞄准器（虚线瞄准线 + 散布锥 + 炮口装填环）',
      aimStyleCrosshairLabel: '精确瞄准器（鼠标处实时散布圈 + 装填进度 + 弹夹/双管状态）'
    },
    buttons: [
      { id: 'pauseResumeBtn', label: '继续 RESUME', action: 'resume' },
      { id: 'pauseControlsBtn', label: '控制 CONTROLS', action: 'toggleControls' },
      { id: 'pauseEndBtn', label: '终止游戏并结算 END & SETTLE', action: 'endRun' }
    ]
  };
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

// 浏览器全局暴露（供 tank_battle.html 薄包装调用；同时保持顶层标识符可直接访问）
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
    buildSettlementViewModel,
    buildPausePanel,
    upgradesOverviewLine
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
  window.buildPausePanel = buildPausePanel;
  // tankSummary / deploymentReady 可能已被 battle 内联同名覆盖，薄包装层优先用 TankScreens.*
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
    buildSettlementViewModel,
    buildPausePanel,
    upgradesOverviewLine
  };
}
