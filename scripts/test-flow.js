// test-flow.js — 全局游戏流程状态机测试（Node 端，Pure Logic）
// 运行：node scripts/test-flow.js
'use strict';

const {
  FLOW_STATES,
  FLOW_TRANSITIONS,
  createFlow,
  watchFlow,
  transition,
  restartRun
} = require('../js/tank_flow.js');

let fails = 0;
function ok(cond, label) {
  if (cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}`); fails++; }
}

// 1) 初始状态
const flow = createFlow();
ok(flow.state === 'map' && flow.prev === null, '初始状态 map');

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

// 3) 非法转移抛错（护栏）
let threw = false;
try { transition(flow, 'reward'); } catch (e) { threw = true; }
ok(threw, 'battle→reward 非法转移抛错（battle 只能去 settlement/gameover/map）');
threw = false;
try { transition(flow, '不存在'); } catch (e) { threw = true; }
ok(threw, '未知状态抛错');

// 4) watcher 通知与取消
const flow2 = createFlow();
const seen = [];
const unwatch = watchFlow(flow2, (state, payload, prev) => seen.push([state, prev]));
transition(flow2, 'battle');
transition(flow2, 'settlement');
ok(seen.length === 2 && seen[0][0] === 'battle' && seen[1][0] === 'settlement', 'watcher 收到全部转移');
ok(seen[1][1] === 'battle', 'watcher 收到 prev');
unwatch();
transition(flow2, 'reward');
ok(seen.length === 2, 'unwatch 后不再通知');

// 5) watcher 抛错不中断状态机
const flow3 = createFlow();
watchFlow(flow3, () => { throw new Error('ui boom'); });
transition(flow3, 'battle');
ok(flow3.state === 'battle', 'watcher 异常被吞、状态机继续');

// 6) gameover 路径：battle → gameover → map
transition(flow3, 'settlement');
transition(flow3, 'reward');
transition(flow3, 'battle');
transition(flow3, 'gameover');
ok(flow3.state === 'gameover', 'battle→gameover');
transition(flow3, 'map');
ok(flow3.state === 'map', 'gameover→map');

// 7) restartRun：runId 自增并回到 map
const flow4 = createFlow();
transition(flow4, 'battle');
const runIdBefore = flow4.runId;
restartRun(flow4);
ok(flow4.state === 'map' && flow4.runId > runIdBefore, 'restartRun 回到 map 且 runId 自增');

// 8) 转移表完整性：每状态至少一条出路（map 可进 battle；gameover 可回 map）
for (const s of FLOW_STATES) {
  ok(FLOW_TRANSITIONS[s] && Array.isArray(FLOW_TRANSITIONS[s]), `转移表含 ${s}`);
}

console.log('test-flow: 完成所有检查');
if (fails === 0) console.log('test-flow: 全部通过');
else console.error(`test-flow: ${fails} 项失败`);
process.exit(fails === 0 ? 0 : 1);
