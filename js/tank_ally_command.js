'use strict';
// js/tank_ally_command.js — A0 友军指挥（纯逻辑，无 DOM / 无 Canvas 依赖）
//
// 职责（docs/specs/combat/ally-command.md §3.1）：
//   1. 把玩家命令解析为不可歧义的任务快照，校验目标存活 / 敌我 / 区域可达；
//   2. 为每辆友军维护 {order, issuer, targetId, anchor, issuedAt, phase, reason}；
//   3. 向 AI 决策与击发入口提供**同一个权威目标**（禁止 focus 时暗换最近敌人）；
//   4. 目标死亡 / 命令替换 / 节点清理时显式失效，不留悬空实体引用。
//
// 命令：follow / move / focus（2026-10-27 用户裁定简化，原六命令作废）
// 阶段：moving / holding / blocked
//
// 消费方：
//   · js/tank_ai.js 的 aiDecide → allyCommandDecide（有任务时）
//   · tank_battle.html 的开火目标 → allyFireTargetFor
//   · tank_battle.html / tank_3d.html 的输入与 HUD

/**
 * @typedef {{order:string, issuer:string, targetId:string|null, anchor:{x:number,y:number}|null, issuedAt:number, phase:string, reason:string|null}} AllyOrder
 * @typedef {{entities?:any[], world?:{w:number,h:number}|null, player?:any, allyCommand?:object|null, hasLoS?:Function, isLethal?:Function, frozen?:boolean, rng?:Function, now?:number}} AllyCtx
 */

/** 三命令（2026-10-27 用户裁定简化：原六命令设计作废，见 specs/combat/ally-command.md）。 */
const ALLY_ORDERS = ['follow', 'move', 'focus'];

/** 任务阶段。blocked 是「仍在尝试但当前受阻」的显式状态，不等于失败删除。 */
const ALLY_PHASES = ['moving', 'holding', 'blocked'];

/** 命令转盘：按住 Z 打开，按鼠标方向选择（屏幕坐标：y 向下）。 */
const ALLY_RADIAL = [
  { order: 'follow', angle: -Math.PI / 2 },   // 上
  { order: 'move', angle: Math.PI / 6 },      // 右下
  { order: 'focus', angle: Math.PI * 5 / 6 }, // 左下
];

/** 缺省参数（RULES.allyCommand 优先）。 */
const ALLY_DEFAULTS = {
  enabled: true,
  maxAllies: 4,
  arriveRadius: 70,
  formationSpacing: 110,
  autoEngageRange: 460,
  stuckSeconds: 4,
  stuckSpeed: 8,
  retargetSeconds: 3,
  aimTolerance: 0.12,
  countByMode: { standard: 2, survival: 2, boss: 1 },
  allyTankId: 'panzer-IV',
};

/**
 * 合并 RULES.allyCommand 与缺省值。
 * @param {object} [override] 测试注入
 * @returns {typeof ALLY_DEFAULTS}
 */
function allyCommandConfig(override) {
  const base = (typeof RULES !== 'undefined' && RULES && RULES.allyCommand) || {};
  return Object.assign({}, ALLY_DEFAULTS, base, override || {});
}

function initialPhase() {
  return 'moving';
}

/**
 * 创建任务快照。anchor / targetId 由调用方按命令类型提供。
 * @param {string} order 三命令之一
 * @param {{issuer?:string, targetId?:string|null, anchor?:{x:number,y:number}|null, issuedAt?:number}} [opts]
 * @returns {AllyOrder}
 */
function createAllyOrder(order, opts) {
  const o = opts || {};
  const anchor = o.anchor && isFinite(o.anchor.x) && isFinite(o.anchor.y)
    ? { x: Number(o.anchor.x), y: Number(o.anchor.y) }
    : null;
  return {
    order,
    issuer: o.issuer || 'player',
    targetId: (typeof o.targetId === 'string' && o.targetId) ? o.targetId : null,
    anchor,
    issuedAt: isFinite(o.issuedAt) ? Number(o.issuedAt) : 0,
    phase: initialPhase(),
    reason: null,
  };
}

function findEntity(entities, id) {
  if (!Array.isArray(entities) || !id) return null;
  for (const e of entities) {
    if (e && e.id === id) return e;
  }
  return null;
}

/**
 * 校验任务在当前世界是否可执行。**只读**，不修改任务。
 * @param {AllyOrder} order createAllyOrder 产物
 * @param {AllyCtx} ctx
 * @returns {{ok:boolean, reason:string|null}}
 */
function validateAllyOrder(order, ctx) {
  const c = ctx || {};
  if (!order || ALLY_ORDERS.indexOf(order.order) < 0) {
    return { ok: false, reason: 'unknown-order' };
  }
  if (order.order === 'focus') {
    const t = findEntity(c.entities, order.targetId);
    if (!t) return { ok: false, reason: 'target-missing' };
    if (t.hp <= 0) return { ok: false, reason: 'target-dead' };
    if (t.team !== 'enemy') return { ok: false, reason: 'target-not-enemy' };
  }
  if (order.order === 'move' || (order.order === 'focus' && order.anchor)) {
    const a = order.anchor;
    if (!a) return { ok: false, reason: 'anchor-missing' };
    if (c.world && (a.x < 0 || a.y < 0 || a.x > c.world.w || a.y > c.world.h)) {
      return { ok: false, reason: 'anchor-out-of-bounds' };
    }
    if (typeof c.isLethal === 'function' && c.isLethal(a.x, a.y)) {
      return { ok: false, reason: 'anchor-lethal' };
    }
  }
  return { ok: true, reason: null };
}

/**
 * 解析任务的目标实体（**不做最近敌人回退**）。
 * @param {AllyOrder|null} order
 * @param {any[]} entities
 * @returns {any|null}
 */
function resolveAllyTarget(order, entities) {
  if (!order || order.order !== 'focus') return null;
  const t = findEntity(entities, order.targetId);
  if (!t || t.hp <= 0 || t.team !== 'enemy') return null;
  return t;
}

/**
 * 可攻击目标：射程内、存活、且有视线（ctx.hasLoS 缺省视为可见）。
 * @param {any} ally
 * @param {any} ctx
 * @param {number} range
 * @returns {any[]}
 */
function attackableTargets(ally, ctx, range) {
  const c = ctx || {};
  const list = [];
  if (!Array.isArray(c.entities)) return list;
  const maxD = isFinite(range) ? range : ALLY_DEFAULTS.autoEngageRange;
  for (const e of c.entities) {
    if (!e || e.team !== 'enemy' || e.hp <= 0) continue;
    if (Math.hypot(e.x - ally.x, e.y - ally.y) > maxD) continue;
    if (typeof c.hasLoS === 'function' && !c.hasLoS(ally.x, ally.y, e.x, e.y)) continue;
    list.push(e);
  }
  return list;
}

function nearestOf(ally, list) {
  let best = null, bd = Infinity;
  for (const e of list) {
    const d = Math.hypot(e.x - ally.x, e.y - ally.y);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

/**
 * 自主交战目标：射程内最近的存活敌人（保留给测试与外部调用；follow 的随机选择见 allyFireTargetFor）。
 * @param {any} ally
 * @param {any[]} entities
 * @param {number} range
 */
function nearestThreat(ally, entities, range) {
  return nearestOf(ally, attackableTargets(ally, { entities }, range));
}

/**
 * 命令转盘选择：按鼠标相对屏幕中心的向量选命令。
 * @param {number} dx 鼠标相对中心 x（屏幕坐标，右正）
 * @param {number} dy 鼠标相对中心 y（屏幕坐标，下正）
 * @param {number} [deadZone] 中心死区（px），未离开死区返回 null
 * @returns {string|null}
 */
function radialOrderFor(dx, dy, deadZone) {
  const r = Math.hypot(dx, dy);
  if (r < (isFinite(deadZone) ? deadZone : 24)) return null;
  const a = Math.atan2(dy, dx);
  let best = null, bd = Infinity;
  for (const it of ALLY_RADIAL) {
    const d = Math.abs(Math.atan2(Math.sin(a - it.angle), Math.cos(a - it.angle)));
    if (d < bd) { bd = d; best = it.order; }
  }
  return best;
}

/**
 * **击发权威目标**：focus 只认任务目标（死亡即 null，不暗换）；
 * 其它命令允许自主反击。
 * @param {any} ally
 * @param {AllyCtx} ctx
 * @returns {any|null}
 */
function allyFireTargetFor(ally, ctx) {
  if (!ally) return null;
  const c = ctx || {};
  const order = ally._allyOrder || null;
  const cfg = allyCommandConfig(c.allyCommand);
  if (order && order.order === 'focus') {
    return resolveAllyTarget(order, c.entities);
  }
  const list = attackableTargets(ally, c, cfg.autoEngageRange);
  if (!list.length) { ally._autoTargetId = null; return null; }

  // 自动目标保持：避免 follow 的「随机目标」逐帧重掷导致炮塔来回甩
  const now = (typeof c.now === 'number') ? c.now
    : ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now());
  const sticky = list.find(e => e.id === ally._autoTargetId);
  const age = (typeof ally._autoTargetT === 'number') ? now - ally._autoTargetT : Infinity;
  if (sticky && age < cfg.retargetSeconds * 1000) return sticky;

  const next = (order && order.order === 'move')
    ? nearestOf(ally, list)
    : list[Math.floor(((typeof c.rng === 'function') ? c.rng : Math.random)() * list.length)];
  ally._autoTargetId = next ? next.id : null;
  ally._autoTargetT = now;
  return next || null;
}

/**
 * 队形偏移：follow 在玩家车体后方、move 在锚点周围环形分散。
 * @param {number} index 友军序号
 * @param {number} count 友军总数
 * @param {string} order
 * @param {number} spacing
 * @param {number} [facing] 玩家车体朝向（follow 用）
 * @returns {{x:number, y:number}}
 */
function allyFormationOffset(index, count, order, spacing, facing) {
  const n = Math.max(1, count | 0);
  const i = Math.max(0, index | 0);
  const s = isFinite(spacing) ? spacing : ALLY_DEFAULTS.formationSpacing;
  if (order === 'follow') {
    const back = s * (0.9 + 0.35 * Math.floor(i / 2));
    const side = (i % 2 === 0 ? -1 : 1) * s * 0.45 * (1 + Math.floor(i / 2));
    const a = isFinite(facing) ? facing : 0;
    return { x: -Math.cos(a) * back - Math.sin(a) * side, y: -Math.sin(a) * back + Math.cos(a) * side };
  }
  if (n === 1) return { x: 0, y: 0 };
  const ring = s * 0.55;
  const ang = (i / n) * Math.PI * 2;
  return { x: Math.cos(ang) * ring, y: Math.sin(ang) * ring };
}

/** 把任务锚点限制在世界内（越界时贴边，不静默丢弃命令）。 */
function clampAnchor(anchor, world) {
  if (!anchor) return null;
  const x = Number(anchor.x), y = Number(anchor.y);
  if (!isFinite(x) || !isFinite(y)) return null;
  if (!world) return { x, y };
  return {
    x: Math.max(0, Math.min(world.w, x)),
    y: Math.max(0, Math.min(world.h, y)),
  };
}

/**
 * 给一批友军下发同一条命令。
 * 校验失败时**整批拒绝**（不做部分下发，避免「一半人在动一半人没动」）。
 * @param {any[]} allies 友军实体
 * @param {{order:string, targetId?:string|null, anchor?:{x:number,y:number}|null, single?:string|null, issuedAt?:number, issuer?:string}} spec
 * @param {AllyCtx} ctx
 * @returns {{issued:any[], rejected:{allyId:string, reason:string}[], reason:string|null}}
 */
function issueAllyCommand(allies, spec, ctx) {
  const c = ctx || {};
  const list = (Array.isArray(allies) ? allies : []).filter(a => a && a.hp > 0);
  const targets = spec && spec.single ? list.filter(a => a.id === spec.single) : list;
  if (!targets.length) return { issued: [], rejected: [], reason: 'no-allies' };

  const order = createAllyOrder(spec.order, spec);
  if (order.anchor) order.anchor = clampAnchor(order.anchor, c.world);
  const v = validateAllyOrder(order, c);
  if (!v.ok) {
    return {
      issued: [],
      rejected: targets.map(a => ({ allyId: a.id, reason: v.reason })),
      reason: v.reason,
    };
  }
  const issued = [];
  for (const a of targets) {
    const prev = a._allyOrder || null;
    // focus 可选锚点：未显式给定时继承上一任务的锚点（「在玩家指定的位置射击目标」）；
    // 否则保持 null = 跟随玩家。
    const anchor = (spec.order === 'focus')
      ? (order.anchor || (prev && prev.anchor ? prev.anchor : null))
      : order.anchor;
    a._allyOrder = createAllyOrder(spec.order, {
      issuer: spec.issuer,
      targetId: spec.targetId,
      anchor,
      issuedAt: spec.issuedAt,
    });
    a._allyOrderProgress = { lastX: a.x, lastY: a.y, stillFor: 0 };
    a._autoTargetId = null;
    a._autoTargetT = undefined;
    issued.push({ allyId: a.id, order: spec.order, targetId: a._allyOrder.targetId, anchor: a._allyOrder.anchor });
  }
  return { issued, rejected: [], reason: null };
}

/** 清除一辆友军的任务（节点切换 / 死亡 / 手动取消）。 */
function clearAllyOrder(ally, reason) {
  if (!ally) return null;
  const had = ally._allyOrder || null;
  ally._allyOrder = null;
  ally._allyOrderProgress = null;
  if (had && reason) had.reason = reason;
  return had;
}

/** 清除全部友军任务。 */
function clearAllAllyOrders(allies, reason) {
  for (const a of (Array.isArray(allies) ? allies : [])) clearAllyOrder(a, reason);
}

/**
 * 每帧推进任务状态机。返回事件（只在状态变化时产生），由页面转成 HUD/日志。
 * @param {any} ally
 * @param {number} dt
 * @param {AllyCtx} ctx
 * @returns {{type:string, allyId:string, order:string, phase:string, reason:string|null}|null}
 */
function updateAllyOrder(ally, dt, ctx) {
  const order = ally && ally._allyOrder;
  if (!order || ally.hp <= 0) return null;
  const c = ctx || {};
  const cfg = allyCommandConfig(c.allyCommand);
  const wasPhase = order.phase;

  // ① focus 目标失效：显式 blocked，不暗换目标
  if (order.order === 'focus') {
    const t = resolveAllyTarget(order, c.entities);
    if (!t) {
      if (order.phase !== 'blocked') {
        order.phase = 'blocked';
        order.reason = 'target-lost';
        return { type: 'blocked', allyId: ally.id, order: order.order, phase: order.phase, reason: order.reason };
      }
      return null;
    }
    if (order.phase === 'blocked' && order.reason === 'target-lost') {
      order.phase = 'moving';
      order.reason = null;
    }
  }

  // ② move 到达 → holding（命令仍是 move，便于「原地射击最近目标」）
  if (order.order === 'move' && order.anchor) {
    const d = Math.hypot(order.anchor.x - ally.x, order.anchor.y - ally.y);
    if (d <= cfg.arriveRadius && order.phase !== 'holding') {
      order.phase = 'holding';
      order.reason = 'arrived';
      return { type: 'phase', allyId: ally.id, order: order.order, phase: order.phase, reason: order.reason };
    }
    if (d > cfg.arriveRadius * 1.6 && order.phase === 'holding') {
      order.phase = 'moving';
      order.reason = null;
      return { type: 'phase', allyId: ally.id, order: order.order, phase: order.phase, reason: order.reason };
    }
  }

  // ③ 卡死检测：移动阶段长时间无位移 → blocked（仍在尝试，但可读地报告）
  if (order.phase === 'moving' && !c.frozen) {
    const p = ally._allyOrderProgress || (ally._allyOrderProgress = { lastX: ally.x, lastY: ally.y, stillFor: 0 });
    const moved = Math.hypot(ally.x - p.lastX, ally.y - p.lastY);
    if (moved < cfg.stuckSpeed * Math.max(0, dt)) {
      p.stillFor += dt;
    } else {
      p.stillFor = 0;
      p.lastX = ally.x;
      p.lastY = ally.y;
    }
    if (p.stillFor >= cfg.stuckSeconds && order.phase !== 'blocked') {
      order.phase = 'blocked';
      order.reason = 'stuck';
      return { type: 'blocked', allyId: ally.id, order: order.order, phase: order.phase, reason: order.reason };
    }
  }

  if (wasPhase !== order.phase) {
    return { type: 'phase', allyId: ally.id, order: order.order, phase: order.phase, reason: order.reason };
  }
  return null;
}

/**
 * 计算友军本帧应该前往的点（null = 原地）。
 * @param {any} ally
 * @param {AllyCtx} ctx
 * @returns {{x:number, y:number}|null}
 */
function allyDesiredPoint(ally, ctx) {
  const order = ally && ally._allyOrder;
  if (!order) return null;
  const c = ctx || {};
  const cfg = allyCommandConfig(c.allyCommand);
  const idx = (typeof ally._allyIndex === 'number') ? ally._allyIndex : 0;
  const count = (typeof ally._allyCount === 'number') ? ally._allyCount : 1;

  // move，或 focus 带锚点 → 在锚点附近站位（到位后原地射击）
  if (order.order === 'move' || (order.order === 'focus' && order.anchor)) {
    if (!order.anchor) return null;
    const off = allyFormationOffset(idx, count, 'move', cfg.formationSpacing);
    const dest = { x: order.anchor.x + off.x, y: order.anchor.y + off.y };
    const d = Math.hypot(dest.x - ally.x, dest.y - ally.y);
    return d <= cfg.arriveRadius * 0.6 ? null : dest;
  }

  // follow，或 focus 无锚点 → 跟随玩家
  const p = c.player;
  if (!p) return null;
  const off = allyFormationOffset(idx, count, 'follow', cfg.formationSpacing, p.hullAngle);
  const dest = { x: p.x + off.x, y: p.y + off.y };
  const d = Math.hypot(dest.x - ally.x, dest.y - ally.y);
  return d <= cfg.arriveRadius * 0.5 ? null : dest;
}

/**
 * 任务驱动的 AI 决策（aiDecide 的友军分支调用）。
 * 输出与 aiDecideAlly 同形：{turn, move, turretDesired, fire}。
 * @param {any} ally
 * @param {any} ctx
 */
function allyCommandDecide(ally, ctx) {
  const c = ctx || {};
  const cfg = allyCommandConfig(c.allyCommand);
  const out = { turn: 0, move: 0, turretDesired: ally.turretAngle, fire: false };
  const target = allyFireTargetFor(ally, c);

  if (target) {
    const desired = Math.atan2(target.y - ally.y, target.x - ally.x);
    out.turretDesired = desired;
    const los = (typeof c.hasLoS === 'function') ? c.hasLoS(ally.x, ally.y, target.x, target.y) : true;
    const aimErr = Math.abs(angDiff(ally.turretAngle, desired));
    if (aimErr < cfg.aimTolerance && los && ally.reloadT <= 0) out.fire = true;
  }

  const dest = allyDesiredPoint(ally, c);
  if (!dest) return out;
  const dx = dest.x - ally.x, dy = dest.y - ally.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 1) return out;
  const heading = Math.atan2(dy, dx);
  const hd = angDiff(heading, ally.hullAngle);
  out.turn = hd > 0.05 ? 1 : (hd < -0.05 ? -1 : 0);
  // 车体对准目标方向才前进；大角度差先原地转向（与敌军 AI 同口径）
  out.move = Math.abs(hd) < 0.55 ? 1 : 0;
  return out;
}

/**
 * 玩家命令的上下文默认值：敌人 → focus；地面 → move；自身/空 → follow。
 * @param {any|null} hitEntity 光标下的实体
 * @param {any|null} player
 * @returns {string}
 */
function defaultOrderForContext(hitEntity, player) {
  if (hitEntity && hitEntity.team === 'enemy' && hitEntity.hp > 0) return 'focus';
  if (hitEntity && player && hitEntity.id === player.id) return 'follow';
  if (!hitEntity) return 'move';
  return 'follow';
}

/**
 * 生成命令规格（页面输入层用）：把光标命中转成 issueAllyCommand 的 spec。
 * @param {{order?:string, hitEntity?:any|null, player?:any, mouse?:{x:number,y:number}, single?:string|null, issuedAt?:number}} input
 */
function buildCommandSpec(input) {
  const i = input || {};
  const order = i.order || defaultOrderForContext(i.hitEntity, i.player);
  const spec = { order, issuedAt: i.issuedAt || 0, single: i.single || null };
  if (order === 'focus') {
    spec.targetId = i.hitEntity ? i.hitEntity.id : null;
  } else if (order === 'move') {
    spec.anchor = i.mouse ? { x: i.mouse.x, y: i.mouse.y } : null;
  }
  return spec;
}

/**
 * 生成友军编队的 spawn 规格（页面据此 spawnTank）。battle 与 tank_3d 共用。
 * @param {any} node 当前节点（需 playerSpawn/w/h/index）
 * @param {string} mode 'standard' | 'survival' | 'boss'
 * @param {object} [cfgOverride]
 * @returns {any[]}
 */
function allySquadSpecs(node, mode, cfgOverride) {
  const cfg = allyCommandConfig(cfgOverride);
  if (cfg.enabled === false) return [];
  const count = Math.min((cfg.countByMode && cfg.countByMode[mode]) || 0, cfg.maxAllies || 4);
  if (count <= 0 || !node || !node.playerSpawn) return [];
  const out = [];
  for (let i = 0; i < count; i++) {
    const off = allyFormationOffset(i, count, 'follow', cfg.formationSpacing, 0);
    out.push({
      id: `ally_${node.index}_${i}`,
      team: 'ally',
      x: Math.max(20, Math.min(node.w - 20, node.playerSpawn.x + off.x)),
      y: Math.max(20, Math.min(node.h - 20, node.playerSpawn.y + off.y)),
      hullAngle: 0,
      turretAngle: 0,
      heightClass: 'medium',
      isAllySquad: true,
      _allyIndex: i,
      _allyCount: count,
    });
  }
  return out;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ALLY_ORDERS,
    ALLY_PHASES,
    ALLY_RADIAL,
    ALLY_DEFAULTS,
    allyCommandConfig,
    createAllyOrder,
    validateAllyOrder,
    resolveAllyTarget,
    attackableTargets,
    nearestThreat,
    allyFireTargetFor,
    allyFormationOffset,
    clampAnchor,
    issueAllyCommand,
    clearAllyOrder,
    clearAllAllyOrders,
    updateAllyOrder,
    allyDesiredPoint,
    allyCommandDecide,
    defaultOrderForContext,
    buildCommandSpec,
    radialOrderFor,
    allySquadSpecs,
  };
}
