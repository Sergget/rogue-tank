// test-ally-command.js — A0（2026-10-27）友军指挥纯逻辑回归（三命令简化版）。
// 2026-10-27 用户裁定：六命令简化为 follow / move / focus：
//   follow = 跟随玩家 + 随机攻击可攻击目标；move = 前往指定位置 + 攻击最近可攻击目标；
//   focus  = 跟随玩家或在指定位置射击任务目标（目标死亡不暗换）。
// 覆盖：快照/校验/目标权威/下发/队形/状态机/决策/上下文/转盘选择/编队规格。
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

// ① 配置与命令集
{
  const cfg = A.allyCommandConfig();
  ok(!!R.RULES.allyCommand, 'RULES.allyCommand 存在（配置唯一口径）');
  ok(cfg.autoEngageRange === R.RULES.allyCommand.autoEngageRange, '配置从 RULES 读取');
  ok(A.ALLY_ORDERS.join('/') === 'follow/move/focus', `三命令（${A.ALLY_ORDERS.join('/')}）`);
  ok(!('hold' in R.RULES.allyCommand) && !('flankOffset' in R.RULES.allyCommand), '六命令遗留配置已删除');
}

// ② 快照与初始阶段
{
  const o = A.createAllyOrder('move', { anchor: { x: 100, y: 200 }, issuedAt: 5 });
  ok(o.phase === 'moving' && o.anchor.x === 100 && o.issuedAt === 5, '任务快照字段完整，初始 moving');
  ok(A.createAllyOrder('focus', { targetId: 'e1' }).phase === 'moving', 'focus 初始 moving');
  ok(A.createAllyOrder('follow').phase === 'moving', 'follow 初始 moving');
}

// ③ 校验
{
  const ents = [enemy('e1', 500, 500), { id: 'f1', team: 'ally', x: 0, y: 0, hp: 100 }];
  const ctx = { entities: ents, world, isLethal: (x, y) => x > 1500 };
  ok(!A.validateAllyOrder(/** @type {any} */ ({ order: 'nope' }), ctx).ok, '未知命令拒绝');
  ok(!A.validateAllyOrder(/** @type {any} */ ({ order: 'hold' }), ctx).ok, '旧命令 hold 拒绝');
  ok(A.validateAllyOrder(A.createAllyOrder('focus', { targetId: 'e1' }), ctx).ok, 'focus 存活敌人通过');
  ok(A.validateAllyOrder(A.createAllyOrder('focus', { targetId: 'nope' }), ctx).reason === 'target-missing', '目标不存在 → target-missing');
  ok(A.validateAllyOrder(A.createAllyOrder('focus', { targetId: 'f1' }), ctx).reason === 'target-not-enemy', '友军目标 → target-not-enemy');
  ok(A.validateAllyOrder(A.createAllyOrder('focus', { targetId: 'e1' }), { entities: [enemy('e1', 0, 0, 0)] }).reason === 'target-dead', '死亡目标 → target-dead');
  ok(A.validateAllyOrder(A.createAllyOrder('move', { anchor: { x: 10, y: 10 } }), ctx).ok, '地图内锚点通过');
  ok(A.validateAllyOrder(A.createAllyOrder('move', { anchor: { x: -5, y: 10 } }), ctx).reason === 'anchor-out-of-bounds', '越界锚点拒绝');
  ok(A.validateAllyOrder(A.createAllyOrder('move', { anchor: { x: 1600, y: 10 } }), ctx).reason === 'anchor-lethal', '致命水域锚点拒绝');
  ok(A.validateAllyOrder(A.createAllyOrder('move'), ctx).reason === 'anchor-missing', 'move 缺锚点拒绝');
  ok(A.validateAllyOrder(A.createAllyOrder('follow'), ctx).ok, 'follow 无需目标/锚点');
  ok(A.validateAllyOrder(A.createAllyOrder('focus', { targetId: 'e1', anchor: { x: 100, y: 100 } }), ctx).ok,
     'focus 可带锚点（在指定位置射击）');
}

// ④ 目标权威
{
  const near = enemy('near', 100, 100);
  const far = enemy('far', 800, 800);
  const a = ally('a1', 0, 0);
  a._allyOrder = A.createAllyOrder('focus', { targetId: 'far' });
  ok(A.allyFireTargetFor(a, { entities: [near, far], allyCommand: {} }) === far,
     'focus 锁定远处的指定目标（不是最近的）');
  far.hp = 0;
  ok(A.allyFireTargetFor(a, { entities: [near, far], allyCommand: {} }) === null,
     'focus 目标死亡 → null（不暗换最近敌人）');

  // follow：可攻击目标中随机，且目标保持 retargetSeconds（防逐帧重掷甩炮塔）
  const e1 = enemy('e1', 100, 0), e2 = enemy('e2', 200, 0);
  const farAway = enemy('e3', 9999, 0);
  const ents = [e1, e2, farAway];
  a._allyOrder = A.createAllyOrder('follow');
  a._autoTargetId = null;
  ok(A.allyFireTargetFor(a, { entities: ents, allyCommand: {}, rng: () => 0, now: 0 }) === e1, 'follow 随机目标（rng=0 → 第一个）');
  ok(A.allyFireTargetFor(a, { entities: ents, allyCommand: {}, rng: () => 0.999, now: 1000 }) === e1, '随机目标在保持期内不重掷');
  ok(A.allyFireTargetFor(a, { entities: ents, allyCommand: {}, rng: () => 0.999, now: 5000 }) === e2, '超过 retargetSeconds 后重新随机');
  ok(A.allyFireTargetFor(a, { entities: ents, allyCommand: {}, rng: () => 0.999, now: 6000 }) !== farAway, '超出射程的敌人不入选');

  // move：最近可攻击（忽略随机）
  a._allyOrder = A.createAllyOrder('move', { anchor: { x: 0, y: 0 } });
  a._autoTargetId = null;
  ok(A.allyFireTargetFor(a, { entities: ents, allyCommand: {}, rng: () => 0.999, now: 7000 }) === e1, 'move 攻击最近可攻击目标（忽略随机）');

  // LoS 过滤
  const ctxLoS = { entities: ents, allyCommand: {}, hasLoS: (x1, y1, x2, y2) => x2 < 150 };
  ok(A.allyFireTargetFor(a, ctxLoS) === e1, '无视线目标被过滤');
}

// ⑤ 下发：全体 / 整批拒绝 / 锚点钳制 / focus 锚点继承
{
  const a1 = ally('a1', 0, 0), a2 = ally('a2', 50, 0);
  const ents = [a1, a2, enemy('e1', 500, 500)];
  const ctx = { entities: ents, world };
  let res = A.issueAllyCommand([a1, a2], { order: 'focus', targetId: 'e1' }, ctx);
  ok(res.issued.length === 2 && !res.reason, '全体 focus 下发成功');
  ok(a1._allyOrder.anchor === null, 'focus 无锚点 → 跟随玩家');

  A.issueAllyCommand([a1, a2], { order: 'move', anchor: { x: 300, y: 200 } }, ctx);
  ok(a1._allyOrder.order === 'move' && a1._allyOrder.anchor.x === 300, 'move 锚点记录');
  A.issueAllyCommand([a1, a2], { order: 'focus', targetId: 'e1' }, ctx);
  ok(a1._allyOrder.order === 'focus' && a1._allyOrder.anchor && a1._allyOrder.anchor.x === 300,
     'focus 继承上一 move 的锚点（在指定位置射击）');

  res = A.issueAllyCommand([a1, a2], { order: 'move', anchor: { x: 9999, y: 5000 } }, ctx);
  ok(res.issued.length === 2 && a1._allyOrder.anchor.x === 2000 && a1._allyOrder.anchor.y === 1200,
     '越界锚点被钳制到世界内而非拒绝');
  res = A.issueAllyCommand([a1, a2], { order: 'focus', targetId: 'nope' }, ctx);
  ok(res.issued.length === 0 && res.rejected.length === 2 && res.reason === 'target-missing',
     '校验失败整批拒绝（不做部分下发）');
  ok(a1._allyOrder.order === 'move', '拒绝时不覆盖既有任务');
  A.clearAllAllyOrders([a1, a2], 'test');
  ok(!a1._allyOrder && !a2._allyOrder, 'clearAllAllyOrders 清空');
}

// ⑥ 队形偏移
{
  const back = A.allyFormationOffset(0, 2, 'follow', 100, 0);
  ok(back.x < 0 && Math.abs(back.y) > 0, 'follow 偏移在车体后方且左右分开');
  const right = A.allyFormationOffset(1, 2, 'follow', 100, 0);
  ok(right.y > 0 && back.y < 0, '两车间左右分列');
  const ring = A.allyFormationOffset(0, 2, 'move', 100, 0);
  ok(Math.abs(Math.hypot(ring.x, ring.y) - 55) < 1e-6, '锚点站位环形分散半径 = spacing×0.55');
}

// ⑦ 状态机
{
  const a = ally('a1', 0, 0);
  const ctx = { entities: [enemy('e1', 500, 0)], world, player: { x: 0, y: 0, hullAngle: 0 } };

  a._allyOrder = A.createAllyOrder('move', { anchor: { x: 10, y: 0 } });
  let ev = A.updateAllyOrder(a, 0.1, ctx);
  ok(ev && ev.type === 'phase' && a._allyOrder.order === 'move' && a._allyOrder.phase === 'holding',
     'move 到达 → holding（命令仍是 move）');

  a.x = 300; a.y = 0;
  ev = A.updateAllyOrder(a, 0.1, ctx);
  ok(ev && a._allyOrder.phase === 'moving', '离开锚点 1.6×半径 → 重新 moving');

  const dead = { id: 'e2', team: 'enemy', x: 0, y: 0, hp: 0 };
  a._allyOrder = A.createAllyOrder('focus', { targetId: 'e2' });
  ev = A.updateAllyOrder(a, 0.1, { entities: [dead], world });
  ok(ev && ev.type === 'blocked' && ev.reason === 'target-lost', 'focus 目标死亡 → blocked/target-lost');

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
  const player = { x: 0, y: 0, hullAngle: 0 };
  const ctx = { entities: [t], player, allyCommand: {} };
  a._allyOrder = A.createAllyOrder('focus', { targetId: 'e1' });
  let d = A.allyCommandDecide(a, ctx);
  ok(d.turretDesired === 0 && d.fire === true, 'focus 对准 + 装填好 → 开火');
  a.reloadT = 1;
  d = A.allyCommandDecide(a, ctx);
  ok(d.fire === false, '装填中不开火');
  a.reloadT = 0;

  // focus 无锚点：不冲向目标，而是跟随玩家
  player.x = 99; player.y = 0;
  a.x = 0; a.y = 0; a.hullAngle = 0; a.turretAngle = 0;
  d = A.allyCommandDecide(a, ctx);
  ok(d.move === 0, 'focus 无锚点且已在跟随位 → 不冲向目标');

  // move 到锚点
  a._allyOrder = A.createAllyOrder('move', { anchor: { x: 600, y: 0 } });
  d = A.allyCommandDecide(a, { entities: [], allyCommand: {} });
  ok(d.move === 1 && d.turn === 0, 'move 朝锚点直行');

  // follow 跟随玩家
  a.x = 0; a.y = 0;
  a._allyOrder = A.createAllyOrder('follow');
  d = A.allyCommandDecide(a, { entities: [], player: { x: 400, y: 0, hullAngle: 0 }, allyCommand: {} });
  ok(d.move === 1, 'follow 朝玩家队形位移动');
}

// ⑨ 上下文默认命令与 spec
{
  const p = { id: 'player', team: 'player' };
  ok(A.defaultOrderForContext(enemy('e', 0, 0), p) === 'focus', '光标敌人 → focus');
  ok(A.defaultOrderForContext(null, p) === 'move', '光标地面 → move');
  ok(A.defaultOrderForContext(p, p) === 'follow', '光标自身 → follow');
  const spec = A.buildCommandSpec({ hitEntity: enemy('e', 0, 0), player: p, mouse: { x: 9, y: 9 } });
  ok(spec.order === 'focus' && spec.targetId === 'e', 'buildCommandSpec：focus 带 targetId');
  const spec2 = A.buildCommandSpec({ hitEntity: null, player: p, mouse: { x: 9, y: 9 } });
  ok(spec2.order === 'move' && spec2.anchor.x === 9, 'buildCommandSpec：move 带锚点');
  const spec3 = A.buildCommandSpec({ order: 'follow', player: p, mouse: { x: 9, y: 9 } });
  ok(spec3.order === 'follow' && !spec3.targetId && !spec3.anchor, 'buildCommandSpec：follow 无参数');
}

// ⑩ 命令转盘选择（屏幕坐标，y 向下）
{
  ok(A.radialOrderFor(0, -100) === 'follow', '转盘上 → 跟随');
  ok(A.radialOrderFor(100, 50) === 'move', '转盘右下 → 移动');
  ok(A.radialOrderFor(-100, 50) === 'focus', '转盘左下 → 集火');
  ok(A.radialOrderFor(5, 5, 30) === null, '中心死区不选命令');
  ok(A.radialOrderFor(0, -100, 30) === 'follow', '死区外正常选择');
}

// ⑪ 编队规格（battle 与 tank_3d 共用）
{
  const node = { index: 0, w: 2000, h: 1200, playerSpawn: { x: 300, y: 300 } };
  const std = A.allySquadSpecs(node, 'standard');
  ok(std.length === 0, '标准模式不预生成友军（2026-10-27 用户裁定）');
  const surv = A.allySquadSpecs(node, 'survival');
  ok(surv.length === 2 && surv.every(s => s.team === 'ally' && s.isAllySquad), '生存模式 2 辆友军规格');
  ok(surv[0]._allyIndex === 0 && surv[1]._allyCount === 2, '编队序号/总数注入');
  ok(surv.every(s => s.x >= 20 && s.y >= 20 && s.x <= node.w - 20 && s.y <= node.h - 20), '出生点钳制在世界内');
  ok(A.allySquadSpecs(node, 'boss').length === 1, 'Boss 模式 1 辆');
  ok(A.allySquadSpecs(node, 'unknown').length === 0, '未知模式 0 辆');
  ok(A.allySquadSpecs(node, 'survival', { enabled: false }).length === 0, 'enabled=false 关闭');
  const edge = A.allySquadSpecs({ index: 0, w: 200, h: 200, playerSpawn: { x: 5, y: 5 } }, 'survival');
  ok(edge.every(s => s.x >= 20 && s.y >= 20), '贴边出生点也被钳到 20px 内');
}

process.exitCode = fails ? 1 : 0;
if(fails) console.error(`\n${fails} 项失败`);
else console.log('\n全部通过');
