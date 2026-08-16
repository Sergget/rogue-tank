'use strict';

// tank_ai.js — 敌人/友军 AI 决策（P-10 / DEVELOPMENT.md §6 条目 7）。
// 纯逻辑模块：无 DOM / Canvas 依赖，Node 可测（module.exports 底部导出）。
// 输出 { turn, move, turretDesired, fire }，供接入层（mvp）消费：
//   - turn/move → driveTank(t, dt, {turn, move})（车体转向/移动，见 js/tank_move.js）
//   - turretDesired → 接入层逐帧逼近 t.turretAngle（炮塔转速限制）
//   - fire → 接入层调 fireTank(t, target, 'auto')（复用 shell 管线）
// 视线判定通过 ctx.hasLoS(ox,oy,tx,ty) 注入（见 js/tank_cover.js hasLineOfSight），
// 保持本模块对掩体全局的零依赖、可独立测试。
//
// 双态行为（§2.2）：摄像机范围内主动（索敌/接近/开火）；范围外默认不活动，
// 仅贴近摄像机边缘（视口外扩 RULES.ai.edgeMargin）的一批主动靠近。第一版敌人不主动找掩体
// （开放问题 1）。

function aiConfig(){ return (typeof RULES !== 'undefined' && RULES.ai) ? RULES.ai : {}; }

// 敌人（含 Boss）决策。
// ctx: { player, view:{minX,minY,maxX,maxY}, hasLoS(ox,oy,tx,ty) }
function aiDecideEnemy(t, ctx){
  const cfg = aiConfig();
  const p = ctx && ctx.player;
  const out = { turn: 0, move: 0, turretDesired: t.turretAngle, fire: false };
  if(!p || p.hp <= 0) return out;

  const dx = p.x - t.x, dy = p.y - t.y;
  const dist = Math.hypot(dx, dy) || 1;
  const desired = Math.atan2(dy, dx);

  // 摄像机边缘外扩范围（边缘靠近态触发宽度，开放问题 2）
  const margin = cfg.edgeMargin !== undefined ? cfg.edgeMargin : 200;
  const inRange = ctx.view
    && t.x >= ctx.view.minX - margin && t.x <= ctx.view.maxX + margin
    && t.y >= ctx.view.minY - margin && t.y <= ctx.view.maxY + margin;

  if(!inRange) return out;   // 远处：默认不活动

  // 车体转向：朝玩家
  const hullDiff = angDiff(desired, t.hullAngle);
  if(hullDiff > 0.05) out.turn = 1;
  else if(hullDiff < -0.05) out.turn = -1;
  out.turretDesired = desired;

  // 移动：保持距离（远则进，太近则退）
  const engage = cfg.engageRange !== undefined ? cfg.engageRange : 520;
  const close = cfg.closeRange !== undefined ? cfg.closeRange : 200;
  if(dist > engage) out.move = 1;
  else if(dist < close) out.move = -1;

  // 开火：炮塔大致对准 + 视线畅通 + 装填好 + 在接战距离内
  const tol = cfg.aimTolerance !== undefined ? cfg.aimTolerance : 0.12;
  const aimErr = Math.abs(angDiff(t.turretAngle, desired));
  const los = ctx.hasLoS ? ctx.hasLoS(t.x, t.y, p.x, p.y) : true;
  if(aimErr < tol && los && dist <= engage && t.reloadT <= 0) out.fire = true;

  return out;
}

// 友军据点：消极防御（不追击/不巡逻），只打射程内最近敌人。
// ctx: { enemies:[...], hasLoS(ox,oy,tx,ty) }
function aiDecideAlly(t, ctx){
  const cfg = aiConfig();
  const out = { turn: 0, move: 0, turretDesired: t.turretAngle, fire: false };
  const targets = ((ctx && ctx.enemies) || []).filter(e => e.hp > 0);
  let best = null, bestD = Infinity;
  for(const e of targets){
    const d = Math.hypot(e.x - t.x, e.y - t.y);
    if(d < bestD){ bestD = d; best = e; }
  }
  const range = cfg.allyEngageRange !== undefined ? cfg.allyEngageRange : 460;
  if(best && bestD <= range){
    const desired = Math.atan2(best.y - t.y, best.x - t.x);
    out.turretDesired = desired;
    const tol = cfg.aimTolerance !== undefined ? cfg.aimTolerance : 0.12;
    const aimErr = Math.abs(angDiff(t.turretAngle, desired));
    const los = ctx.hasLoS ? ctx.hasLoS(t.x, t.y, best.x, best.y) : true;
    if(aimErr < tol && los && t.reloadT <= 0) out.fire = true;
  }
  return out;
}

// 通用分发：ally 走消极防御，其余（enemy/Boss/召唤物）走双态敌对。
function aiDecide(t, ctx){
  if(t.team === 'ally') return aiDecideAlly(t, ctx);
  return aiDecideEnemy(t, ctx);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { aiConfig, aiDecideEnemy, aiDecideAlly, aiDecide };
}
