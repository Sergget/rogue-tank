'use strict';

// tank_ai_squad.js — 敌军攻守分工协调器（#N2 / DEVELOPMENT.md §4.44）。
// 纯逻辑模块：无 DOM / Canvas 依赖，Node 可测（module.exports 底部导出）。
//
// 问题（#N2）：改前节点内所有敌人各自独立决策，全部可同时向玩家推进
//   ——`aiDecideEnemy` 各自算出 `dist > engage → move=1`，结果是「一拥而上」，
//   玩家无法选择威胁优先级，也没有侧翼与牵制的层次。
//
// 定位：为同一节点内的敌军分配**角色**（role），角色只表达「这一辆该干什么」，
//   具体怎么走仍由 `js/tank_ai.js` 的机动层/交战带执行。本模块**不做寻路**，
//   不产生位移，只写 t.aiRole。
//
// 三种角色：
//   press —— 主动压上（名额有限，近处优先）
//   flank —— 侧翼绕行（名额有限，走 #N3 的侧翼站位）
//   hold  —— 原地驻守/掩护，只打有把握的射界，不主动接近
//
// 名额（pressSlots）按难度：base + floor(diff × pressSlotsPerDiff)，硬钳 pressSlotsMax。
// 若存活敌人少于名额数，则全部为 press（不制造无意义的 hold）。
//
// 重分配节流：每 reassignInterval 秒重算一次并写入角色 —— 若逐帧重算，
//   敌人在 press/flank 之间反复横跳会读作「抽搐」。节流期间沿用上次角色。

// 内部状态（模块级，非全局实体表）：按节点键缓存。
// 结构：{ pressSlots, timer, roles: Map<entity, role>, diff }
let _squadState = null;

function squadConfig(){ return (typeof RULES !== 'undefined' && RULES.ai && RULES.ai.squad) ? RULES.ai.squad : {}; }
function flankConfig(){ return (typeof RULES !== 'undefined' && RULES.ai && RULES.ai.flankRewrite) ? RULES.ai.flankRewrite : {}; }

// 重置协调器状态（切节点 / 复位时由接入层调用，避免跨节点串用名额）。
function resetSquad(){ _squadState = null; }

// 计算本节点可用的 press 名额。
// diff 可选（缺省 0）；敌人数量很少时名额自动收敛到实际存活数。
function pressSlotsFor(cfg, diff, aliveCount){
  const c = cfg || {};
  const base = Number.isFinite(c.pressSlotsBase) ? c.pressSlotsBase : 2;
  const per = Number.isFinite(c.pressSlotsPerDiff) ? c.pressSlotsPerDiff : 1.5;
  const cap = Number.isFinite(c.pressSlotsMax) ? c.pressSlotsMax : 4;
  const d = Number.isFinite(diff) ? Math.max(0, Math.min(1, diff)) : 0;
  let n = base + Math.floor(d * per);
  if(n < 1) n = 1;
  if(n > cap) n = cap;
  // 存活数 ≤ 名额 ⇒ 全员 press（不制造无意义 hold）
  if(Number.isFinite(aliveCount) && aliveCount < n) n = Math.max(1, aliveCount);
  return n;
}

// 候选评分：距离玩家越近、当前有视线、血量越健康，越优先拿到 press 名额。
// loS 布尔转 0/1；dist 越近分越高（1 - dist/参考距离，钳到 [0,1]）。
// 参考距离取触发距离量级（700px），超出即 0 分。
function candidateScore(e, player, cfg, hasLoS){
  const c = cfg || {};
  const w = c.scoreWeights || { dist: 1.0, los: 1.2, hp: 0.4 };
  const dx = player.x - e.x, dy = player.y - e.y;
  const dist = Math.hypot(dx, dy);
  const distScore = Math.max(0, 1 - dist / 700);
  const los = hasLoS ? 1 : 0;
  const hpRatio = (e.maxHp > 0) ? (e.hp / e.maxHp) : 1;
  return (w.dist || 0) * distScore + (w.los || 0) * los + (w.hp || 0) * hpRatio;
}

// 主入口：为本节点存活敌人分配角色。就地写 t.aiRole，返回角色统计。
// ctx: { enemies:[存活敌对实体], player, hasLoS(ox,oy,tx,ty), dt, diff }
//   enemies 已由调用方过滤 hp>0（与 tank_ai.js 的 ctx.enemies 同口径）。
// 返回：{ press, flank, hold, pressSlots } —— 供 dev 面板/调试读取。
function updateSquad(ctx){
  const cfg = squadConfig();
  const fcfg = flankConfig();
  const enemies = (ctx && Array.isArray(ctx.enemies)) ? ctx.enemies.filter(e => e && e.hp > 0) : [];
  const player = (ctx && ctx.player) || null;
  const dt = (ctx && Number.isFinite(ctx.dt)) ? ctx.dt : (1/60);

  // 关闭开关或无可分配对象 ⇒ 全员 press（回退旧行为），并清状态。
  if(cfg.enabled === false || !enemies.length || !player){
    for(const e of enemies) e.aiRole = 'press';
    if(!enemies.length) resetSquad();
    return { press: enemies.length, flank: 0, hold: 0, pressSlots: enemies.length };
  }

  // 惰性初始化 / 节点切换（敌人集合整体换血时重置状态，避免沿用旧名额与角色）
  const st = _squadState || { pressSlots: 0, timer: 0, roles: new Map(), diff: 0 };
  const prevAlive = st.roles.size;
  st.timer -= dt;
  const rosterChanged = (prevAlive > 0 && enemies.length !== prevAlive);
  if(!_squadState || rosterChanged){ st.roles.clear(); st.timer = 0; }
  st.diff = Number.isFinite(ctx.diff) ? ctx.diff : st.diff;
  _squadState = st;

  const slots = pressSlotsFor(cfg, st.diff, enemies.length);
  st.pressSlots = slots;
  // flank 名额：与 press 不重叠，从剩余敌人里取（不超过 fcfg.sideSlots 与剩余人数）
  const flankSlots = Math.max(0, Math.min(
    Number.isFinite(fcfg.sideSlots) ? fcfg.sideSlots : 1,
    enemies.length - slots
  ));

  const needAssign = (st.timer <= 0) || rosterChanged || !enemies.every(e => st.roles.has(e));
  if(needAssign){
    st.timer = Number.isFinite(cfg.reassignInterval) ? cfg.reassignInterval : 0.6;
    const hasLoS = (ctx && typeof ctx.hasLoS === 'function') ? ctx.hasLoS : null;
    // 角色粘性（#N 实测修订）：上一轮已担任 press 的实体获得评分加成，使其更难被挤下名额。
    // ⚠ 缺陷记录：初版无粘性时，角色每 0.6s 按距离重排 ⇒ 同一辆敌人在 press/flank 间反复
    //   横跳；由于 flank 会驱车奔向站位点，形成「当 flank 时内移、转 press 后驻停」的
    //   **棘轮效应**，使敌军逐次逼近玩家（探针实测 700 → 395 → 273px）。
    const stickiness = Number.isFinite(cfg.roleStickiness) ? cfg.roleStickiness : 0.2;
    const prevRoles = st.roles;
    // 按评分降序；平局用实体 id 稳定排序（同分不抖动）
    const scored = enemies.map(e => {
      let s = candidateScore(e, player, cfg, hasLoS ? hasLoS(e.x, e.y, player.x, player.y) : true);
      if(stickiness > 0 && prevRoles.get(e) === 'press') s += stickiness;
      return { e: e, s: s };
    });
    scored.sort((a, b) => (b.s - a.s) || (String(a.e.id) < String(b.e.id) ? -1 : 1));

    const next = new Map();
    let i = 0;
    for(const it of scored){
      if(i < slots){ next.set(it.e, 'press'); i++; }
      else if(flankSlots > 0 && i < slots + flankSlots){ next.set(it.e, 'flank'); i++; }
      else next.set(it.e, 'hold');
    }
    st.roles = next;
  }

  // 写回实体（节流期间沿用上次角色）
  const stat = { press: 0, flank: 0, hold: 0, pressSlots: slots };
  for(const e of enemies){
    let role = st.roles.get(e);
    if(!role){ role = 'press'; st.roles.set(e, role); }   // 新入场实体先给 press，下个节拍再细分
    e.aiRole = role;
    if(role === 'flank') stat.flank++;
    else if(role === 'hold') stat.hold++;
    else stat.press++;
  }
  return stat;
}

// hold 态开火门控：hold 角色只打「有把握」的射界 —— 距离在 holdFireMaxDist 内，
// 且开火容差放宽 holdFireAimTolMul 倍（远距离命中率低，放宽以保留火力存在感）。
// 返回 { fire: bool, aimTolMul } —— 调用方（tank_ai.js）用它改写 fire 与容差。
function holdGate(e, dist, baseTol, player){
  const cfg = squadConfig();
  const maxD = Number.isFinite(cfg.holdFireMaxDist) ? cfg.holdFireMaxDist : 640;
  const mul = Number.isFinite(cfg.holdFireAimTolMul) ? cfg.holdFireAimTolMul : 2.0;
  if(dist > maxD) return { fire: false, aimTolMul: 1 };   // 太远 ⇒ 纯待机
  if(!player) return { fire: false, aimTolMul: 1 };
  const desired = Math.atan2(player.y - e.y, player.x - e.x);
  const aimErr = Math.abs(angDiff(e.turretAngle, desired));
  return { fire: aimErr < baseTol * mul, aimTolMul: mul };
}

// --- #N5 视口外来袭方向提示（玩家侧信息层，2026-10-01）---
// 背景：视野距离系统 #J3 退役后，敌人「一律渲染、一律可被命中」，但绘制层仍有
//   aabbInView 视口剔除 ⇒ 视口外的敌人**不开火也看不见**，而 AI 开火判定只看
//   「距离 + 直线视野」（与视口无关）。于是玩家会被屏幕外的火力命中且无来源提示
//   ——这是「屏幕边缘被动受击」的直接机制。
// 用户裁定（2026-10-01）：**只做玩家侧提示，不给敌人加可见性门控**——保留
//   #J3「全屏可命中」口径与边缘推进的压迫感，只把「威胁方向」告知玩家。
// 本函数做纯筛选/排序（无 canvas 依赖，Node 可测）；几何绘制留在接入层
//   （mvp 用既有 worldToScreen + 边缘矩形求交，同 drawDroneIndicators 模式）。
// 入参：
//   player    — { x, y }
//   enemies   — 敌对实体数组（调用方自行过滤 team/hp，与 aiCtx 同口径）
//   viewBounds— 视口世界 AABB { minX, minY, maxX, maxY }（tank_camera.viewBounds）
//   opts      — { maxCount, rangeMul }
// 返回：[{ e, angle, dist }] —— angle 为「玩家→敌人」方位角（rad），近者优先。
// 筛选：仅「已接战（aiEngaged）」且「在视口外」且「处于可开火距离」的敌人。
//   未接战者不接近战距离，不构成即时威胁，提示它们只会制造噪音。
function threatIndicators(player, enemies, viewBounds, opts){
  const o = opts || {};
  const maxCount = Number.isFinite(o.maxCount) ? o.maxCount : 6;
  const rangeMul = Number.isFinite(o.rangeMul) ? o.rangeMul : 1.4;
  if(!player || !Array.isArray(enemies) || !enemies.length) return [];
  const base = (typeof RULES !== 'undefined' && RULES.ai && RULES.ai.engageRange) ? RULES.ai.engageRange : 520;
  const maxDist = base * rangeMul;
  const vb = viewBounds || null;
  const out = [];
  for(const e of enemies){
    if(!e || !e.hp || e.hp <= 0) continue;
    if(e.team !== 'enemy') continue;
    if(e.aiEngaged !== true) continue;          // 未接战 ⇒ 不构成即时威胁
    const dx = e.x - player.x, dy = e.y - player.y;
    const dist = Math.hypot(dx, dy);
    if(dist > maxDist) continue;                // 超出可开火距离 ⇒ 不提示
    // 视口内 ⇒ 玩家自己能看见，无需边缘箭头
    if(vb && e.x >= vb.minX && e.x <= vb.maxX && e.y >= vb.minY && e.y <= vb.maxY) continue;
    out.push({ e: e, angle: Math.atan2(dy, dx), dist: dist });
  }
  out.sort((a, b) => a.dist - b.dist);          // 近者优先（最紧迫）
  return out.slice(0, maxCount);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { squadConfig, flankConfig, resetSquad, pressSlotsFor, candidateScore, updateSquad, holdGate, threatIndicators };
}