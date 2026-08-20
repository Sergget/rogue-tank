'use strict';

// tank_flow.js — 全局游戏流程状态机（P-08 / DEVELOPMENT.md §6 条目 6 捆绑前置）。
// 纯逻辑模块：无 DOM / Canvas 依赖，Node 可测（module.exports 底部导出）。
// 职责：管理单局游戏的场景状态流转 —— 节点图(map) → 节点战斗(battle) → 结算
// (settlement) → 节点间卡牌/商店(reward) → 下一节点 / 阵亡(gameover)。
// 战斗循环只是其中一个状态（battle）；其余状态由 UI 层消费（见 UI 界面层约定，
// DEVELOPMENT.md §5.1）。死亡/复活（M8）与局外商店（M10）接入时在此扩展状态。

// 合法状态集合（transition 的唯一约束来源）
const FLOW_STATES = ['map', 'battle', 'settlement', 'reward', 'gameover'];

// 允许的转移表：from → to 白名单（未知转移抛错，防流程失控）
const FLOW_TRANSITIONS = {
  map:        ['battle'],
  battle:     ['settlement', 'gameover', 'map'],  // 结算 = 敌全灭/通关；gameover = 阵亡（复活耗尽）；map = 放弃节点/重开
  settlement: ['reward', 'map'],            // 正常 → 卡牌/商店；无奖励（最后一关后）→ 回到节点图
  reward:     ['battle', 'map'],            // 选完 → 下一节点；节点链走完 → 回到节点图（一局结束）
  gameover:   ['map']                       // 阵亡 → 重新开始（复活系统 M8 接入后扩展）
};

/**
 * 创建流程状态机实例。
 * @returns {any} flow —— { state, prev, payload, runId, _watchers }
 */
function createFlow() {
  return {
    state: 'map',
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
 */
function restartRun(flow) {
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
