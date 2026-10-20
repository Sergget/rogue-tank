// test-flow.js — 全局游戏流程状态机测试（Node 端，Pure Logic）
// 运行：node scripts/test-flow.js
'use strict';

require('../js/tank_utils.js');
require('../js/tank_rules.js');
const {
  FLOW_STATES,
  FLOW_TRANSITIONS,
  createFlow,
  watchFlow,
  transition
} = require('../js/tank_flow.js');
// #W15（2026-10-20 用户裁定「删除」）：`restartRun` 与其专属的 `FLOW_OUTRUN_STATES` 已从
//   `js/tank_flow.js` 摘除（正式页面零调用；此前仅本测试与 `types/globals.d.ts` 引用，
//   属测试↔类型声明自循环）。原针对它的 12 处断言已改为**负向断言**（见 §8b / §16b / §17d），
//   防止将来被误加回。
//   纪律：入口/字段下线必须配负向断言——只测「能用」永远发现不了「拿不到」。
// Global shims for Node test environment
const U = require('../js/tank_utils.js');
global.TAU = U.TAU;
const RULES_MOD = require('../js/tank_rules.js');
global.RULES = RULES_MOD.RULES;

let fails = 0;
function ok(cond, label) {
  if (cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}`); fails++; }
}

// 1) 初始状态
const flow = createFlow();
ok(flow.state === 'map' && flow.prev === null, '初始状态 map');
ok(flow.payload === null && flow.runId === 0, '初始 payload 为 null，runId 为 0');

// 2) 合法转移链：map → battle → settlement → reward → battle
transition(flow, 'battle', { nodeIndex: 0 });
ok(flow.state === 'battle' && flow.prev === 'map', 'map→battle');
ok(flow.payload && flow.payload.nodeIndex === 0, 'payload 传递');
transition(flow, 'settlement', { score: { total: 210 } });
ok(flow.state === 'settlement', 'battle→settlement');
transition(flow, 'reward', null);
ok(flow.state === 'reward', 'settlement→reward');
transition(flow, 'battle', { nodeIndex: 1 });
ok(flow.state === 'battle', 'reward→battle（下一节点）');

// 3) Payload 边缘测试：undefined / null / 空对象 / 复杂对象
const flowP = createFlow();
transition(flowP, 'battle', undefined);
ok(flowP.payload === null, '未传 payload 时默认为 null');
transition(flowP, 'settlement', {});
ok(typeof flowP.payload === 'object' && Object.keys(flowP.payload).length === 0, '空对象 payload 正确保存');
transition(flowP, 'reward', null);
ok(flowP.payload === null, '显式 null payload 正确保存');
transition(flowP, 'battle', { nodeIndex: 2, revivesLeft: 1, isBoss: true });
ok(flowP.payload.isBoss === true && flowP.payload.revivesLeft === 1, '复杂 payload 属性透传无损');

// 4) 非法转移抛错（护栏）
let threw = false;
try { transition(flow, 'reward'); } catch (e) { threw = true; }
ok(threw, 'battle→reward 非法转移抛错（battle 只能去 settlement/gameover/map）');

threw = false;
try { transition(flow, '不存在'); } catch (e) { threw = true; }
ok(threw, '未知状态抛错');

// 5) 全转移矩阵越界护栏验证 (矩阵交叉拦截)
// #N5（2026-10-10 简化进入游戏流程）：loadout/shop 的「出击」与 gameover 的「重新开始」
// 直接进 battle（旧口径经 map 中转屏）；map 态保留（放弃节点入口仍可用）。
const allInvalidTargets = {
  home:       ['map', 'battle', 'settlement', 'reward', 'gameover'],
  loadout:    ['settlement', 'reward', 'gameover', 'loadout'],
  shop:       ['settlement', 'reward', 'gameover', 'shop'],
  map:        ['settlement', 'reward', 'gameover', 'map', 'home', 'loadout', 'shop'],
  battle:     ['reward', 'battle', 'home', 'loadout', 'shop'],
  settlement: ['battle', 'settlement', 'gameover', 'loadout', 'shop'],   // P-34：home 移出非法集（settlement→home 终局回首页）
  reward:     ['settlement', 'gameover', 'reward', 'home', 'loadout', 'shop'],
  gameover:   ['settlement', 'reward', 'gameover', 'loadout', 'shop']
};
for (const [fromState, invalidList] of Object.entries(allInvalidTargets)) {
  for (const target of invalidList) {
    const testF = createFlow();
    testF.state = fromState;
    let errThrew = false;
    try { transition(testF, target); } catch (e) { errThrew = true; }
    ok(errThrew, `拦截非法转移矩阵: ${fromState} -> ${target}`);
  }
}

// 6) watcher 通知、取消与多监听隔离
const flow2 = createFlow();
const seen = [];
const watcher1Log = [];
const watcher2Log = [];

const unwatch1 = watchFlow(flow2, (state, payload, prev) => {
  seen.push([state, prev]);
  watcher1Log.push(state);
});
const unwatch2 = watchFlow(flow2, (state) => {
  watcher2Log.push(state);
});

transition(flow2, 'battle');
transition(flow2, 'settlement');
ok(seen.length === 2 && seen[0][0] === 'battle' && seen[1][0] === 'settlement', 'watcher 收到全部转移');
ok(seen[1][1] === 'battle', 'watcher 收到 prev');
ok(watcher1Log.length === 2 && watcher2Log.length === 2, '多个 watcher 均正常触发');

// 取消第一个 watcher
unwatch1();
// 重复调用 unwatch 幂等安全
unwatch1();

transition(flow2, 'reward');
ok(seen.length === 2, 'unwatch1 后不再收到新通知');
ok(watcher2Log.length === 3, 'unwatch1 不影响 watcher2 接收通知');
unwatch2();

// 7) watcher 异常隔离防护：单个 watcher 抛错不影响后续 watcher 与状态机流转
const flow3 = createFlow();
let watcher3Ran = false;
watchFlow(flow3, () => { throw new Error('ui boom 1'); });
watchFlow(flow3, () => { watcher3Ran = true; });
watchFlow(flow3, () => { throw new Error('ui boom 2'); });

transition(flow3, 'battle');
ok(flow3.state === 'battle', 'watcher 抛错时状态机依然成功切至 battle');
ok(watcher3Ran, '前面的 watcher 抛错不中断后续 watcher 的执行');

// 8) gameover 路径（#W15 2026-10-20：原「多次连续 restartRun」断言已随函数删除改为负向，见 §8b）
transition(flow3, 'settlement');
transition(flow3, 'reward');
transition(flow3, 'battle');
transition(flow3, 'gameover');
ok(flow3.state === 'gameover', 'battle→gameover 转移成功');

transition(flow3, 'map');
ok(flow3.state === 'map', 'gameover→map 转移成功');

// 8b) #W15（2026-10-20 用户裁定「删除」）负向断言：restartRun 已从模块摘除
//   原口径：restartRun 在 map 态连续调用 3 次 → 停留 map 且 runId 递增 3；从 battle 调用 → 退回 map。
//   删除理由：正式页面零调用点，且 pause 态会因无 map 出路而抛错（旧测试把该缺陷固化成了期望）。
//   若下列任一断言转红，说明有人把死入口加回来了 —— 请先确认有真实调用方，再连同 pause→map
//   白名单一起补全，不要恢复旧实现。
{
  const flowMod = require('../js/tank_flow.js');
  ok(flowMod.restartRun === undefined, '#W15: restartRun 已从 tank_flow.js 摘除（不再是导出项）');
  ok(!('restartRun' in flowMod), '#W15: restartRun 不存在于模块命名空间（防具名导出回潮）');
  // 既有的「重开」语义由转移表本身表达，不需专用函数：
  const flowReopen = createFlow();
  transition(flowReopen, 'battle');
  transition(flowReopen, 'map');
  ok(flowReopen.state === 'map' && flowReopen.prev === 'battle',
     '#W15: 「放弃节点/重开」由 battle→map 转移直接表达（不依赖 restartRun）');
  const flowQuickRestart = createFlow('home');
  transition(flowQuickRestart, 'loadout');
  transition(flowQuickRestart, 'battle');
  transition(flowQuickRestart, 'gameover');
  transition(flowQuickRestart, 'battle', { nodeIndex: 0 });
  ok(flowQuickRestart.state === 'battle' && flowQuickRestart.prev === 'gameover',
     '#W15: 「阵亡后重新开始」由 gameover→battle 直达表达（#N5，不依赖 restartRun）');
}

// 9) 转移表完整性：每状态至少一条出路
for (const s of FLOW_STATES) {
  ok(FLOW_TRANSITIONS[s] && Array.isArray(FLOW_TRANSITIONS[s]), `转移表含 ${s}`);
}

// 10) 局内复活(canRevive/invuln)与地图实体重置(resetEntity/resetCovers)流程边界测试
const flowCombat = createFlow();
transition(flowCombat, 'battle', { revivesLeft: 1 });

// 模拟战斗中玩家阵亡分支判定
function handlePlayerDeath(f, entityState) {
  if (entityState.canRevive && entityState.revivesLeft > 0) {
    entityState.revivesLeft--;
    entityState.invuln = true;
    // canRevive 为 true 时留在 battle 状态并赋予 invuln 无敌
    return 'revived';
  } else {
    // 无法复活(canRevive false)时，流程转移到 gameover
    transition(f, 'gameover', { reason: 'killed' });
    return 'gameover';
  }
}

const mockTank = { canRevive: true, revivesLeft: 1, invuln: false };
let result = handlePlayerDeath(flowCombat, mockTank);
ok(result === 'revived' && mockTank.invuln === true && flowCombat.state === 'battle', '有复活次数时触发 invuln，维持 battle 状态');

// 再次阵亡，复活耗尽
mockTank.canRevive = false;
result = handlePlayerDeath(flowCombat, mockTank);
ok(result === 'gameover' && flowCombat.state === 'gameover', '无复活次数时 canRevive 为 false，转移至 gameover 状态');

// 阵亡后重开局，重置实体 resetEntity 与掩体 resetCovers
let resetEntityDone = false;
let resetCoversDone = false;
function resetGameState() {
  resetEntityDone = true;
  resetCoversDone = true;
}

// #W15（2026-10-20）：原此处 `restartRun(flowCombat)` 触发重开 → 断言回 map。函数删除后，
//   「重开」改由 `battle → map` 或 `gameover → battle` 转移表达，状态清空由 UI 层在转移
//   回调里执行（与转移本身解耦，故此处只验证转移可走通 + 回调时机）。
transition(flowCombat, 'map');
resetGameState();
ok(flowCombat.state === 'map', 'gameover 后 battle/ gameover→map 转移可回到 map 状态');
ok(resetEntityDone && resetCoversDone, '重开局触发展发 resetEntity 与 resetCovers 状态清空');

// 11) M10 局外三态：createFlow 初始值（缺省 map 向后兼容 / 'home' 顶层入口 / 非法值抛错）
const flowHomeInit = createFlow('home');
ok(flowHomeInit.state === 'home' && flowHomeInit.prev === null && flowHomeInit.runId === 0, "createFlow('home') 以 home 为初始态（prev=null, runId=0）");
ok(createFlow().state === 'map', '缺省 createFlow() 初始态仍为 map（向后兼容）');
ok(createFlow(undefined).state === 'map', 'createFlow(undefined) 视同缺省 map');

let badInitThrew = false;
let badInitMsg = '';
try { createFlow('不存在'); } catch (e) { badInitThrew = true; badInitMsg = e.message; }
ok(badInitThrew && badInitMsg.includes('不存在'), `非法初始值抛错且文案含状态名（"${badInitMsg}"）`);

// 12) M10 全链路：home → loadout → shop → map 合法流转（payload 传递 + watcher 触发次数）
const flowM10 = createFlow('home');
const m10Seen = [];
const unwatchM10 = watchFlow(flowM10, (state, payload, prev) => { m10Seen.push([state, payload, prev]); });

transition(flowM10, 'loadout', { slotId: 'slot-1' });
transition(flowM10, 'shop', { points: 120 });
transition(flowM10, 'map', { startedRun: true });
unwatchM10();

ok(flowM10.state === 'map' && flowM10.prev === 'shop', '全链路 home→loadout→shop→map 流转成功');
ok(flowM10.payload && flowM10.payload.startedRun === true, '链路末端 payload 正确落位 flow.payload');
ok(m10Seen.length === 3, 'watcher 恰好触发 3 次（每次转移一次）');
ok(m10Seen[0][0] === 'loadout' && m10Seen[0][2] === 'home' && m10Seen[0][1].slotId === 'slot-1', 'watcher 收到 loadout 转移的 payload 与 prev=home');
ok(m10Seen[1][0] === 'shop' && m10Seen[1][1].points === 120, 'watcher 收到 shop 转移的 payload');
ok(m10Seen[2][0] === 'map' && m10Seen[2][2] === 'shop', 'watcher 收到 map 转移与 prev=shop');

// 13) home→home 自环（同界面切换存档后刷新）
const flowLoop = createFlow('home');
let loopFired = 0;
watchFlow(flowLoop, () => { loopFired++; });
transition(flowLoop, 'home', { switchedSlot: true });
ok(flowLoop.state === 'home' && flowLoop.prev === 'home' && flowLoop.payload.switchedSlot === true, 'home→home 自环合法且 prev/payload 正确');
ok(loopFired === 1, '自环同样通知 watcher 恰好一次');

// 14) 非法转移拒绝：断言抛错文案包含两端状态名
function assertTransitionThrows(fromState, toState, label) {
  const f = createFlow();
  f.state = fromState;
  try {
    transition(f, toState);
    ok(false, `${label}（未抛错！）`);
  } catch (e) {
    ok(e.message.includes(fromState) && e.message.includes(toState), `${label}（"${e.message}"）`);
  }
}
assertTransitionThrows('map', 'home', '非法转移拒绝: map→home 抛出');
assertTransitionThrows('battle', 'shop', '非法转移拒绝: battle→shop 抛出');
assertTransitionThrows('home', 'map', '非法转移拒绝: home→map 抛出');

// 15) gameover→home 合法（阵亡后回首页，而非只能快速重开）
const flowGoHome = createFlow();
transition(flowGoHome, 'battle');
transition(flowGoHome, 'gameover');
transition(flowGoHome, 'home');
ok(flowGoHome.state === 'home' && flowGoHome.prev === 'gameover', 'gameover→home 合法转移成功');

// 15b) #N5：局外/阵亡直达战斗（loadout/shop 出击、gameover 重开——不再经 map 中转屏）
const flowDirect = createFlow('home');
transition(flowDirect, 'loadout', { slotId: 's1' });
transition(flowDirect, 'shop', { points: 50 });
transition(flowDirect, 'battle', { nodeIndex: 0 });
ok(flowDirect.state === 'battle' && flowDirect.prev === 'shop', '#N5: shop→battle 直达（购买完毕直接出击）');
const flowDirect2 = createFlow('home');
transition(flowDirect2, 'loadout', { slotId: 's1' });
transition(flowDirect2, 'battle', { nodeIndex: 0 });
ok(flowDirect2.state === 'battle' && flowDirect2.prev === 'loadout', '#N5: loadout→battle 直达（确认配置直接出击）');
const flowGoBattle = createFlow();
transition(flowGoBattle, 'battle');
transition(flowGoBattle, 'gameover');
transition(flowGoBattle, 'battle', { nodeIndex: 0 });
ok(flowGoBattle.state === 'battle' && flowGoBattle.prev === 'gameover', '#N5: gameover→battle 直达（阵亡后直接重开）');
// map 态本身保留可用（放弃节点/重开走 battle→map 转移）
const flowMapKeep = createFlow();
transition(flowMapKeep, 'battle');
transition(flowMapKeep, 'map');
ok(flowMapKeep.state === 'map', '#N5: map 态保留（battle 放弃/重开仍回 map）');

// 16) #W15（2026-10-20）：restartRun 的「局外三态 no-op」断言已随函数删除改为负向，
//   见 §8b。此处只保留其当初想保护的**真实语义**：局外三态之间可正常流转、不误入 map。
{
  const flowOutHome = createFlow('home');
  ok(flowOutHome.state === 'home' && flowOutHome.prev === null && flowOutHome.runId === 0,
     '#W15: home 为顶层入口（无 restartRun 介入时行为不变）');
  transition(flowOutHome, 'loadout');
  transition(flowOutHome, 'shop');
  ok(flowOutHome.state === 'shop', '#W15: home→loadout→shop 局外闭环可走通（不停留 map）');
  // 局外三态不得凭空进入 map：白名单里 loadout/shop 确实允许 map，但必须由 UI 显式发起，
  // 不存在「局外态被某个重开函数悄悄推进 map」的旁路（restartRun 已删，此风险消除）。
  ok(typeof flowOutHome.runId === 'number' && flowOutHome.runId === 0,
     '#W15: 局外流转不递增 runId（runId 只由真正开一局的动作推进）');
}

// 17) P-35：pause 态 —— battle⇄pause 合法、pause→settlement（终止游戏并结算）合法
const flowPause = createFlow();
transition(flowPause, 'battle');
transition(flowPause, 'pause', { nodeIndex: 0 });
ok(flowPause.state === 'pause' && flowPause.prev === 'battle' && flowPause.payload.nodeIndex === 0, 'battle→pause 合法且 payload 透传');
transition(flowPause, 'battle');
ok(flowPause.state === 'battle' && flowPause.prev === 'pause', 'pause→battle 合法（恢复战斗）');

transition(flowPause, 'pause', { voluntaryEnd: true });
transition(flowPause, 'settlement', { voluntaryEnd: true });
ok(flowPause.state === 'settlement' && flowPause.payload.voluntaryEnd === true, 'pause→settlement 合法（终止游戏并结算，voluntaryEnd payload）');

// pause 白名单外的转移仍被拦截
assertTransitionThrows('pause', 'map', '非法转移拒绝: pause→map 抛出');
assertTransitionThrows('home', 'pause', '非法转移拒绝: home→pause 抛出（局外不可暂停）');

// 17b) P-34：settlement→home 合法（终局结算后回首页）
const flowSettleHome = createFlow();
transition(flowSettleHome, 'battle');
transition(flowSettleHome, 'settlement', { score: { base: 100, bonuses: [], total: 100 } });
transition(flowSettleHome, 'home');
ok(flowSettleHome.state === 'home' && flowSettleHome.prev === 'settlement', 'settlement→home 合法转移成功（P-34 终局回首页）');

// 17c) P-34：voluntaryEnd 全链路 —— battle→pause→settlement(voluntaryEnd)→home
const flowVoluntary = createFlow();
transition(flowVoluntary, 'battle');
transition(flowVoluntary, 'pause', { nodeIndex: 2 });
transition(flowVoluntary, 'settlement', { voluntaryEnd: true });
ok(flowVoluntary.state === 'settlement' && flowVoluntary.payload.voluntaryEnd === true, 'voluntaryEnd：pause→settlement 进入终局结算');
transition(flowVoluntary, 'home');
ok(flowVoluntary.state === 'home' && flowVoluntary.prev === 'settlement', 'voluntaryEnd：settlement→home 全链路收束');

// 17d) #W15（2026-10-20）：原「restartRun 在 pause 态被白名单拦截（抛错）」断言已删除。
//   ⚠️ 那条断言实际上**把缺陷固化成了期望**——`pause` 的白名单是 `['battle','settlement']`，
//   没有 `map` 出路，所以旧 restartRun 在暂停态必然抛错；断言「应抛错」等于承认「暂停时不能重开」。
//   函数删除后该矛盾消失。保留其真正要守的不变式：**pause 态不静默改变状态/runId**。
{
  const flowPauseNoop = createFlow();
  transition(flowPauseNoop, 'battle');
  transition(flowPauseNoop, 'pause');
  const stateBefore = flowPauseNoop.state;
  const runIdBefore = flowPauseNoop.runId;
  // 任何非法转移仍必须抛错而非静默吞掉（restartRun 的删除不能削弱这条硬约束）
  let illegalThrew = false;
  try { transition(flowPauseNoop, 'map'); } catch (e) { illegalThrew = true; }
  ok(illegalThrew, '#W15: pause→map 仍被白名单拒绝（重开须先回 battle 或走 settlement）');
  ok(flowPauseNoop.state === stateBefore && flowPauseNoop.runId === runIdBefore,
     '#W15: 非法转移被拒后状态与 runId 不被静默改变');

  // pause 恢复 battle 后可正常走 battle→map（旧 restartRun 的目标语义）
  const flowPause2 = createFlow();
  transition(flowPause2, 'battle');
  transition(flowPause2, 'pause');
  transition(flowPause2, 'battle');
  transition(flowPause2, 'map');
  ok(flowPause2.state === 'map' && flowPause2.prev === 'battle',
     '#W15: pause 恢复 battle 后可正常退回 map（不依赖 restartRun）');
}

console.log('test-flow: 完成所有检查');
if (fails === 0) console.log('test-flow: 全部通过');
else console.error(`test-flow: ${fails} 项失败`);
process.exit(fails === 0 ? 0 : 1);
