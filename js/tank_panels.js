'use strict';

// ============================================================================
// tank_panels.js — P-15/P-46/#A24 shared UI *logic* facade (layer 4/4)
//
// #A24 分层后的门面：本文件不再实现具体行为，只把「纯核心」与「DOM 适配」两层
// 重新导出，保持既有消费方（tank_mvp.html / tank_bench.html / scripts/test-panels.js）
// 的 API 与调用方式完全不变。
//
//   tank_panels_core.js — 层 1 纯核心（视图模型 / 敌人生成 / 卡牌事务 / 参数钳制）
//   tank_panels_dom.js  — 层 2 DOM 适配（makeLogSink / createLogPanel / createDevPanelController）
//   本文件              — 层 4 门面（re-export；页面控制器即层 3 在各页面内）
//
// 加载顺序（浏览器全局脚本）：tank_rules..tank_cards → tank_panels_core.js →
//   tank_panels_dom.js → tank_panels.js → 页面内联脚本。
// 双端：浏览器 = 全局脚本；Node = require()（_load 惰性 require 两子层，测试可直接 require 本文件）。
// ============================================================================

// 子层解析：Node 用 require；浏览器用已加载的全局（core/dom 先于本文件加载）。
function _load(name, globalName){
  if (typeof globalThis !== 'undefined' && globalThis[globalName]) return globalThis[globalName];
  if (typeof window !== 'undefined' && window[globalName]) return window[globalName];
  if (typeof module !== 'undefined' && module.exports){
    try { return require(name); } catch(e){}
  }
  return null;
}

var core = _load('./tank_panels_core.js', 'TankPanelsCore');
var dom = _load('./tank_panels_dom.js', 'TankPanelsDom');

// 浏览器端：核心/适配两层以「顶层函数即全局」方式加载，没有命名空间对象。
// 此时从各自模块里取函数的全局名（与 core/dom 顶层声明一致）。
function coreFn(name){
  if (core && typeof core[name] === 'function') return core[name];
  if (typeof globalThis !== 'undefined' && typeof globalThis[name] === 'function') return globalThis[name];
  if (typeof window !== 'undefined' && typeof window[name] === 'function') return window[name];
  return undefined;
}
function domFn(name){
  if (dom && typeof dom[name] === 'function') return dom[name];
  if (typeof globalThis !== 'undefined' && typeof globalThis[name] === 'function') return globalThis[name];
  if (typeof window !== 'undefined' && typeof window[name] === 'function') return window[name];
  return undefined;
}

// --- 层 1 纯核心 ---------------------------------------------------------------
var _dep = coreFn('_dep');
var applyCardToTank = coreFn('applyCardToTank');
var clearCardsFromTank = coreFn('clearCardsFromTank');
var snapshotCardTx = coreFn('snapshotCardTx');
var applyCardTx = coreFn('applyCardTx');
var rollbackCardTx = coreFn('rollbackCardTx');
var parameterClamp = coreFn('parameterClamp');
var clampParameterMap = coreFn('clampParameterMap');
var heldCardsVM = coreFn('heldCardsVM');
var activateAbilityForTest = coreFn('activateAbilityForTest');
var enemyLevelMults = coreFn('enemyLevelMults');
var spawnEnemyAt = coreFn('spawnEnemyAt');
var buildTankDataVM = coreFn('buildTankDataVM');
var describeEntityStatus = coreFn('describeEntityStatus');
var liveEnemies = coreFn('liveEnemies');

// --- 层 2 DOM 适配 -------------------------------------------------------------
var makeLogSink = domFn('makeLogSink');
var createLogPanel = domFn('createLogPanel');
var createDevPanelController = domFn('createDevPanelController');

// --- 双端导出（保持既有契约；test-panels.js 直接消费这些名字）--------------------
if (typeof module !== 'undefined' && module.exports){
  module.exports = {
    _dep: _dep,
    makeLogSink: makeLogSink,
    createLogPanel: createLogPanel,
    createDevPanelController: createDevPanelController,
    applyCardToTank: applyCardToTank,
    clearCardsFromTank: clearCardsFromTank,
    snapshotCardTx: snapshotCardTx,
    applyCardTx: applyCardTx,
    rollbackCardTx: rollbackCardTx,
    parameterClamp: parameterClamp,
    clampParameterMap: clampParameterMap,
    heldCardsVM: heldCardsVM,
    activateAbilityForTest: activateAbilityForTest,
    enemyLevelMults: enemyLevelMults,
    spawnEnemyAt: spawnEnemyAt,
    buildTankDataVM: buildTankDataVM,
    describeEntityStatus: describeEntityStatus,
    liveEnemies: liveEnemies
  };
}
