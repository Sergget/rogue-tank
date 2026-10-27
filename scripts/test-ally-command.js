// test-ally-command.js — A0（2026-10-27）友军指挥纯逻辑回归。
// 覆盖：六命令快照 / 校验 / 目标权威（focus 不暗换最近敌人）/ 下发与整批拒绝 /
//   状态机（到达转驻守、撤退完成转跟随、侧袭到位转集火、目标丢失 blocked、卡死检测）/
//   决策输出（瞄准、开火、前往）/ 队形偏移 / 上下文默认命令。
// 运行：node scripts/test-ally-command.js
'use strict';

const U = require('../js/tank_utils.js');
const R = require('../js/tank_rules.js');
global.TAU = U.TAU;
global.RULES = R.RULES;
global.angDiff = U.angDiff;
const A = require('../js/tank_ally_command.js');

let fails = 0;
function ok(cond, label){
  if(cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}`); fails++; }
}

function enemy(id, x, y, hp){
  return { id, team: 'enemy', x, y, hp: hp === undefined ? 100 : hp };
}
function ally(id, x, y){
  return { id, team: 'ally', x, y, hp: 100, hullAngle: 0, turretAngle: 0, reloadT: 0 };
}
const world = { w: 2000, h: 1200 };

// ① RULES 配置已接线
{
  const cfg = A.allyCommandConfig();
  ok(!!R.RULES.allyCommand, 'RULES.allyCommand 存在（配置唯一口径）');
  ok(cfg.autoEngageRange === R.RULES.allyCommand.autoEngageRange, '配置从 RULES 读取');
  ok(A.ALLY_ORDERS.length === 6, `六命令（${A.ALLY_ORDERS.join('/')}）`);
}

// ② 快照与初始阶段
{
  const o = A.createAllyOrder('hold', { anchor: { x: 100, y: 200 }, issuedAt: 5 });
  ok(o.phase === 'holding' && o.anchor.x === 100 && o.issuedAt === 5, 'hold 初始阶段 = holding');
  ok(A.createAllyOrder('retreat').phase === 'retreating', 'retreat 初始阶段 = retreating');
  ok(A.createAllyOrder('flank', { targetId: 'e1' }).phase === 'flanking', 'flank 初始阶段 = flanking');
  ok(A.createAllyOrder('focus', { targetId: 'e1' }).phase === 'moving', 'focus 初始阶段 = moving');
}

// ③ 校验
{
  const ents = [enemy('e1', 500, 500), { id: 'f1', team: 'ally', x: 0, y: 0, hp: 100 }];
  const ctx = { entities: ents, world, isLethal: (x, y) => x > 1500 };
  ok(!A.validateAllyOrder(/** @type {any} */ ({ order: 'nope' }), ctx).ok, '未知命令拒绝');
  ok(A.validateAllyOrder(A.createAllyOrder('focus', { targetId: 'e1' }), ctx).ok, 'focus 存活敌人通过');
  ok(A.validateAllyOrder(A.createAllyOrder('focus', { targetId: 'nope' }), ctx).reason === 'target-missing', '目标不存在 → target-missing');
  ok(A.validateAllyOrder(A.createAllyOrder('focus', { targetId: 'f1' }), ctx).reason === 'target-not-enemy', '友军目标 → target-not-enemy');
  ok(A.validateAllyOrder(A.createAllyOrder('focus', { targetId: 'e1' }), { entities: [enemy('e1', 0, 0, 0)] }).reason === 'target-dead', '死亡目标 → target-dead');
  ok(A.validateAllyOrder(A.createAllyOrder('move', { anchor: { x: 10, y: 10 } }), ctx).ok, '地图内锚点通过');
  ok(A.validateAllyOrder(A.createAllyOrder('move', { anchor: { x: -5, y: 10 } }), ctx).reason === 'anchor-out-of-bounds', '越界锚点拒绝');
  ok(A.validateAllyOrder(A.createAllyOrder('move', { anchor: { x: 1600, y: 10 } }), ctx).reason === 'anchor-lethal', '致命水域锚点拒绝');
  ok(A.validateAllyOrder(A.createAllyOrder('move'), ctx).reason === 'anchor-missing', '缺锚点拒绝');
  ok(A.validateAllyOrder(A.createAllyOrder('follow'), ctx).ok, 'follow 无需目标/锚点');
}

// ④ 目标权威：focus 只认任务目标，不暗换最近敌人
{
  const near = enemy('near', 100, 100);
  const far = enemy('far', 800, 800);
  const ents = [near, far];
  const a = ally('a1', 0, 0);
  const ctx = { entities: ents, allyCommand: {} };
  a._allyOrder = A.createAllyOrder('focus', { targetId: 'far' });
  ok(A.allyFireTargetFor(a, ctx) === far, 'focus 锁定远处的指定目标（不是最近的）');
  far.hp = 0;
  ok(A.allyFireTargetFor(a, ctx) === null, '任务目标死亡 → null（不暗换最近敌人）');
  a._allyOrder = A.createAllyOrder('follow');
  ok(A.allyFireTargetFor(a, ctx) === near, 'follow 允许自主反击最近敌人');
  near.hp = 0;
  ok(A.allyFireTargetFor(a, ctx) === null, '自主反击无目标 → null');
}

// ⑤ 下发：全体 / 单车 / 整批拒绝 / 锚点钳制
{
  const a1 = ally('a1', 0, 0), a2 = ally('a2', 50, 0);
  const ents = [a1, a2, enemy('e1', 500, 500)];
  const ctx = { entities: ents, world };
  let res = A.issueAllyCommand([a1, a2], { order: 'focus', targetId: 'e1' }, ctx);
  ok(res.issued.length === 2 && !res.reason, '全体 focus 下发成功');
  ok(a1._allyOrder.targetId === 'e1' && a2._allyOrder.targetId === 'e1', '两车任务一致');
  res = A.issueAllyCommand([a1, a2], { order: 'move', anchor: { x: 9999, y: 5000 } }, ctx);
  ok(res.issued.length === 2 && a1._allyOrder.anchor.x === 2000 && a1._allyOrder.anchor.y === 1200,
     '越界锚点被钳制到世界内而非拒绝');
  res = A.issueAllyCommand([a1, a2], { order: 'focus', targetId: 'nope' }, ctx);
  ok(res.issued.length === 0 && res.rejected.length === 2 && res.reason === 'target-missing',
     '校验失败整批拒绝（不做部分下发）');
  ok(a1._allyOrder.order === 'move', '拒绝时不覆盖既有任务');
  res = A.issueAllyCommand([a1, a2], { order: 'hold', anchor: { x: 10, y: 10 }, single: 'a2' }, ctx);
  ok(res.issued.length === 1 && res.issued[0].allyId === 'a2', '单车命令只作用于指定友军');
  A.clearAllAllyOrders([a1, a2], 'test');
  ok(!a1._allyOrder && !a2._allyOrder, 'clearAllAllyOrders 清空');
}

// ⑥ 队形偏移
{
  const back = A.allyFormationOffset(0, 2, 'follow', 100, 0);
  ok(back.x < 0 && Math.abs(back.y) > 0, 'follow 偏移在车体后方且左右分开');
  const right = A.allyFormationOffset(1, 2, 'follow', 100, 0);
  ok(right.y > 0 && back.y < 0, '两车间左右分列');
  const ring = A.allyFormationOffset(0, 2, 'hold', 100, 0);
  ok(Math.abs(Math.hypot(ring.x, ring.y) - 55) < 1e-6, 'hold 环形分散半径 = spacing×0.55');
}

// ⑦ 状态机
{
  const a = ally('a1', 0, 0);
  const ctx = { entities: [enemy('e1', 500, 0)], world, player: { x: 0, y: 0, hullAngle: 0 } };

  a._allyOrder = A.createAllyOrder('move', { anchor: { x: 10, y: 0 } });
  let ev = A.updateAllyOrder(a, 0.1, ctx);
  ok(ev && ev.type === 'phase' && a._allyOrder.order === 'hold', 'move 到达 → 转 hold（事件）');

  a._allyOrder = A.createAllyOrder('retreat', { anchor: { x: 5, y: 0 } });
  ev = A.updateAllyOrder(a, 0.1, ctx);
  ok(ev && a._allyOrder.order === 'follow' && ev.reason === 'retreat-done', 'retreat 到达 → 转 follow');

  a.x = 300; a.y = 0;
  a._allyOrder = A.createAllyOrder('flank', { targetId: 'e1' });
  ev = A.updateAllyOrder(a, 0.1, ctx);
  ok(ev && a._allyOrder.order === 'focus' && ev.reason === 'flank-arrived', 'flank 进入交战带 → 转 focus');

  const dead = { id: 'e2', team: 'enemy', x: 0, y: 0, hp: 0 };
  a._allyOrder = A.createAllyOrder('focus', { targetId: 'e2' });
  ev = A.updateAllyOrder(a, 0.1, { entities: [dead], world });
  ok(ev && ev.type === 'blocked' && ev.reason === 'target-lost', 'focus 目标死亡 → blocked/target-lost');

  // 卡死：位置不动超过 stuckSeconds
  const b = ally('b1', 100, 100);
  b._allyOrder = A.createAllyOrder('move', { anchor: { x: 1000, y: 100 } });
  let blocked = null;
  for(let i = 0; i < 60 && !blocked; i++) blocked = A.updateAllyOrder(b, 0.1, { entities: [], world });
  ok(blocked && blocked.reason === 'stuck', '长时间无位移 → blocked/stuck');
}

// ⑧ 决策输出
{
  const a = ally('a1', 0, 0);
  const t = enemy('e1', 400, 0);
  const ctx = { entities: [t], player: { x: 0, y: 0, hullAngle: 0 }, allyCommand: {} };
  a._allyOrder = A.createAllyOrder('focus', { targetId: 'e1' });
  let d = A.allyCommandDecide(a, ctx);
  ok(d.turretDesired === 0 && d.fire === true, '对准 + 装填好 → 开火');
  a.reloadT = 1;
  d = A.allyCommandDecide(a, ctx);
  ok(d.fire === false, '装填中不开火');
  a.reloadT = 0;
  a.turretAngle = Math.PI;   // 背对
  a.hullAngle = Math.PI;
  d = A.allyCommandDecide(a, ctx);
  ok(d.fire === false && d.move === 0, '炮塔未对准不开火（先转向）');

  // 距离远超交战带 → 朝目标推进
  a.turretAngle = 0; a.hullAngle = 0;
  const far = enemy('e2', 1500, 0);
  a._allyOrder = A.createAllyOrder('focus', { targetId: 'e2' });
  d = A.allyCommandDecide(a, { entities: [far], allyCommand: {} });
  ok(d.move === 1, '目标在交战带外 → 前进');

  // move 到锚点
  a.x = 0; a.y = 0;
  a._allyOrder = A.createAllyOrder('move', { anchor: { x: 600, y: 0 } });
  d = A.allyCommandDecide(a, { entities: [], allyCommand: {} });
  ok(d.move === 1 && d.turn === 0, 'move 朝锚点直行');

  // 已在锚点附近 → 原地
  a.x = 595; a.y = 0;
  d = A.allyCommandDecide(a, { entities: [], allyCommand: {} });
  ok(d.move === 0, '到达半径内不再推进');
}

// ⑨ 上下文默认命令
{
  const p = { id: 'player', team: 'player' };
  ok(A.defaultOrderForContext(enemy('e', 0, 0), p) === 'focus', '光标敌人 → focus');
  ok(A.defaultOrderForContext(null, p) === 'move', '光标地面 → move');
  ok(A.defaultOrderForContext(p, p) === 'follow', '光标自身 → follow');
  const spec = A.buildCommandSpec({ hitEntity: enemy('e', 0, 0), player: p, mouse: { x: 9, y: 9 } });
  ok(spec.order === 'focus' && spec.targetId === 'e', 'buildCommandSpec：focus 带 targetId');
  const spec2 = A.buildCommandSpec({ hitEntity: null, player: p, mouse: { x: 9, y: 9 } });
  ok(spec2.order === 'move' && spec2.anchor.x === 9, 'buildCommandSpec：move 带锚点');
}

// ⑩ 编队规格（battle 与 tank_3d 共用）
{
  const node = { index: 0, w: 2000, h: 1200, playerSpawn: { x: 300, y: 300 } };
  const std = A.allySquadSpecs(node, 'standard');
  ok(std.length === 2 && std.every(s => s.team === 'ally' && s.isAllySquad), '标准模式 2 辆友军规格');
  ok(std[0]._allyIndex === 0 && std[1]._allyCount === 2, '编队序号/总数注入');
  ok(std.every(s => s.x >= 20 && s.y >= 20 && s.x <= node.w - 20 && s.y <= node.h - 20), '出生点钳制在世界内');
  ok(A.allySquadSpecs(node, 'boss').length === 1, 'Boss 模式 1 辆');
  ok(A.allySquadSpecs(node, 'unknown').length === 0, '未知模式 0 辆');
  ok(A.allySquadSpecs(node, 'standard', { enabled: false }).length === 0, 'enabled=false 关闭');
  const edge = A.allySquadSpecs({ index: 0, w: 200, h: 200, playerSpawn: { x: 5, y: 5 } }, 'standard');
  ok(edge.every(s => s.x >= 20 && s.y >= 20), '贴边出生点也被钳到 20px 内');
}

process.exitCode = fails ? 1 : 0;
if(fails) console.error(`\n${fails} 项失败`);
else console.log('\n全部通过');
