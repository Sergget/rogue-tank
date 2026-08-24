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
  transition,
  restartRun
} = require('../js/tank_flow.js');
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
const allInvalidTargets = {
  home:       ['map', 'battle', 'settlement', 'reward', 'gameover'],
  loadout:    ['battle', 'settlement', 'reward', 'gameover', 'loadout'],
  shop:       ['battle', 'settlement', 'reward', 'gameover', 'shop'],
  map:        ['settlement', 'reward', 'gameover', 'map', 'home', 'loadout', 'shop'],
  battle:     ['reward', 'battle', 'home', 'loadout', 'shop'],
  settlement: ['battle', 'settlement', 'gameover', 'loadout', 'shop'],   // P-34：home 移出非法集（settlement→home 终局回首页）
  reward:     ['settlement', 'gameover', 'reward', 'home', 'loadout', 'shop'],
  gameover:   ['battle', 'settlement', 'reward', 'gameover', 'loadout', 'shop']
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

// 8) gameover 路径与 restartRun 边缘（多次连续 restartRun）
transition(flow3, 'settlement');
transition(flow3, 'reward');
transition(flow3, 'battle');
transition(flow3, 'gameover');
ok(flow3.state === 'gameover', 'battle→gameover 转移成功');

transition(flow3, 'map');
ok(flow3.state === 'map', 'gameover→map 转移成功');

// 在 map 状态连续 restartRun
const flow4 = createFlow();
const startRunId = flow4.runId;
restartRun(flow4);
restartRun(flow4);
restartRun(flow4);
ok(flow4.state === 'map', '连续 restartRun 保持在 map 状态');
ok(flow4.runId === startRunId + 3, '连续 restartRun 正确递增 runId');

// 从非 map 状态 restartRun
transition(flow4, 'battle');
restartRun(flow4);
ok(flow4.state === 'map' && flow4.prev === 'battle', '从 battle 状态 restartRun 退回 map');

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

restartRun(flowCombat);
resetGameState();
ok(flowCombat.state === 'map', 'gameover 后 restartRun 成功回到 map 状态');
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

// 16) restartRun 局外 no-op：不抛错、不进 map、runId 不变、返回当前 runId
const flowOutHome = createFlow('home');
const homeRunIdBefore = flowOutHome.runId;
let outNoopThrew = false;
try { restartRun(flowOutHome); } catch (e) { outNoopThrew = true; }
ok(!outNoopThrew, 'restartRun 在 home 态不抛错');
ok(flowOutHome.state === 'home' && flowOutHome.prev === null && flowOutHome.runId === homeRunIdBefore, 'restartRun 在 home 态 no-op：停留 home、不进 map、runId 不变');
ok(restartRun(flowOutHome) === homeRunIdBefore, 'restartRun 在 home 态返回当前 runId');

const flowOutShop = createFlow('home');
transition(flowOutShop, 'loadout');
transition(flowOutShop, 'shop');
restartRun(flowOutShop);
ok(flowOutShop.state === 'shop', 'restartRun 在 shop 态（经 loadout）同样 no-op 停留原地');

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

// restartRun 在 pause 态：直接调用被白名单拦截（pause 无 map 出路，不静默改变状态）；恢复 battle 后行为正常回 map
const flowPauseRestart = createFlow();
transition(flowPauseRestart, 'battle');
transition(flowPauseRestart, 'pause');
let pauseRestartThrew = false;
try { restartRun(flowPauseRestart); } catch (e) { pauseRestartThrew = true; }
ok(pauseRestartThrew && flowPauseRestart.state === 'pause' && flowPauseRestart.runId === 0,
   'restartRun 在 pause 态被白名单拦截：抛错且不静默改变状态/runId');
const flowPause2 = createFlow();
transition(flowPause2, 'battle');
transition(flowPause2, 'pause');
transition(flowPause2, 'battle');   // 恢复后重开
restartRun(flowPause2);
ok(flowPause2.state === 'map' && flowPause2.prev === 'battle', 'pause 恢复 battle 后 restartRun 正常退回 map');

console.log('test-flow: 完成所有检查');
if (fails === 0) console.log('test-flow: 全部通过');
else console.error(`test-flow: ${fails} 项失败`);
process.exit(fails === 0 ? 0 : 1);
