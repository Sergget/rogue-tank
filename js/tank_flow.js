'use strict';

// tank_flow.js — 全局游戏流程状态机（P-08 / DEVELOPMENT.md §6 条目 6 捆绑前置）。
// 纯逻辑模块：无 DOM / Canvas 依赖，Node 可测（module.exports 底部导出）。
// 职责：管理单局游戏的场景状态流转 —— 节点图(map) → 节点战斗(battle) → 结算
// (settlement) → 节点间卡牌/商店(reward) → 下一节点 / 阵亡(gameover)。
// 战斗循环只是其中一个状态（battle）；其余状态由 UI 层消费（见 UI 界面层约定，
// DEVELOPMENT.md §5.1）。死亡/复活（M8）与局外商店（M10）接入时在此扩展状态。
// M10 扩展：新增局外三态 —— home(首页/存档选择，顶层入口)、loadout(出战整备)、
// shop(永久升级商店)，构成 home → loadout ⇄ shop → map 的局外闭环
// （docs/PLAN.md 特性 3 §3.2 流程状态机完整流转）。

// 合法状态集合（transition 的唯一约束来源）
const FLOW_STATES = [
  'home', 'loadout', 'shop',               // M10 局外三态（home 为顶层入口，位于 map 之前）
  'map', 'battle', 'pause',                // P-35：pause = 战斗内 ESC 暂停/设置面板（仅可从 battle 进入）
  'settlement', 'reward', 'gameover'
];

// 局外状态集合（尚未开始一局 run）：restartRun 对其为 no-op（见 restartRun JSDoc）
const FLOW_OUTRUN_STATES = ['home', 'loadout', 'shop'];

// 允许的转移表：from → to 白名单（未知转移抛错，防流程失控）
const FLOW_TRANSITIONS = {
  // —— M10 局外闭环 ——
  home:       ['loadout', 'home'],              // 选择存档 → 出战整备；home→home 自环 = 同界面切换存档后刷新
  loadout:    ['shop', 'map', 'home'],          // 确认配置直接出击 → 节点图；进强化整备 → 商店；返回首页
  shop:       ['map', 'loadout', 'home'],       // 购买完毕出击 → 节点图；回整备微调；回首页
  // —— 局内一局流程（P-08；P-35 增 pause）——
  map:        ['battle'],
  battle:     ['settlement', 'gameover', 'map', 'pause'],  // 结算 = 敌全灭/通关；gameover = 阵亡（复活耗尽）；map = 放弃节点/重开；pause = ESC 暂停
  // pause→battle = 继续战斗（恢复现场，UI 层不得重新实体化节点）；pause→settlement = 「终止游戏并结算」（voluntaryEnd，
  // P-34 将消费该入口做终局结算语义）
  pause:      ['battle', 'settlement'],
  // settlement→home = 终局结算（voluntaryEnd 主动终止）后回首页；settlement→reward/map = 普通节点结算流转
  settlement: ['reward', 'map', 'home'],
  reward:     ['battle', 'map'],            // 选完 → 下一节点；节点链走完 → 回到节点图（一局结束）
  gameover:   ['map', 'home']               // 阵亡 → 快速重开（重新开始）；或回首页（M10）
};

/**
 * 创建流程状态机实例。
 * @param {string} [initialState='map'] 初始状态（缺省 'map' 保持向后兼容；局外 UI 入口传 'home'）
 * @returns {any} flow —— { state, prev, payload, runId, _watchers }
 */
function createFlow(initialState) {
  const init = initialState !== undefined ? initialState : 'map';
  if (!FLOW_STATES.includes(init)) {
    throw new Error(`tank_flow: 未知初始状态 "${init}"`);
  }
  return {
    state: init,
    prev: null,
    payload: null,          // 进入当前状态时携带的数据（如 { nodeIndex } / { score }）
    runId: 0,               // 一局一 id（每次回到 map 重新开局时自增）
    _watchers: []           // 转移监听器：[fn(state, payload, prev)]
  };
}

/**
 * 注册转移监听器；返回取消函数。
 */
function watchFlow(flow, fn) {
  flow._watchers.push(fn);
  return function unwatch() {
    const i = flow._watchers.indexOf(fn);
    if (i >= 0) flow._watchers.splice(i, 1);
  };
}

/**
 * 状态转移。非法目标 / 未在白名单内的转移抛错（测试与 UI 接线的护栏）。
 * @param {any} flow 流程状态机实例
 * @param {string} next 目标状态（FLOW_STATES 之一）
 * @param {*} [payload] 附加数据
 */
function transition(flow, next, payload) {
  if (!FLOW_STATES.includes(next)) {
    throw new Error(`tank_flow: 未知状态 "${next}"`);
  }
  const allowed = FLOW_TRANSITIONS[flow.state] || [];
  if (!allowed.includes(next)) {
    throw new Error(`tank_flow: 非法转移 ${flow.state} → ${next}`);
  }
  flow.prev = flow.state;
  flow.state = next;
  flow.payload = payload !== undefined ? payload : null;
  for (const fn of flow._watchers) {
    try { fn(next, flow.payload, flow.prev); } catch (e) { /* UI 层异常不中断状态机 */ }
  }
}

/**
 * 重新开局：回到节点图、runId 自增（供 UI 重置局内状态）。已在地图态时仅自增 runId。
 *
 * 局外约定（M10）：从 home / loadout / shop 等「局外状态」调用时为 no-op ——
 * 一局尚未开始（还没进入过 map），重开无意义：既不抛错也不进入 map，
 * 仅原样返回当前 runId；其余状态（map/battle/settlement/reward/gameover）行为不变。
 */
function restartRun(flow) {
  if (FLOW_OUTRUN_STATES.includes(flow.state)) {
    return flow.runId;
  }
  if (flow.state === 'map') {
    flow.runId++;
    return;
  }
  transition(flow, 'map', { runId: flow.runId + 1 });
  flow.runId = flow.payload ? flow.payload.runId : flow.runId;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    FLOW_STATES,
    FLOW_TRANSITIONS,
    createFlow,
    watchFlow,
    transition,
    restartRun
  };
}
