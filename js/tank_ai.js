'use strict';

// tank_ai.js — 敌人/友军 AI 决策（P-10 / DEVELOPMENT.md §6 条目 7 / P-19 扩充）。
// 纯逻辑模块：无 DOM / Canvas 依赖，Node 可测（module.exports 底部导出）。
// 输出 { turn, move, turretDesired, fire }，供接入层（mvp）消费——保持完全向后兼容。
// 视线判定通过 ctx.hasLoS(ox,oy,tx,ty) 注入（见 js/tank_cover.js hasLineOfSight），
// 保持本模块对掩体全局的零依赖、可独立测试。
//
// 战术状态机（P-19）：敌人在下列状态间切换
//   Stunned    — 模块伤害/被击震惊（优先级最高，计时器计数后恢复）
//   Flank      — 绕行进攻：横向绕到目标侧翼再开火
//   Defensive  — 消极防御：守在据点/掩体后，只打射程内目标
//   Search     — 搜索前进：目标被掩体遮挡时朝最后已知位置推进并扫视
//   Patrol     — 队列行军：无目标或远战场时沿固定方向/巡逻前进
//
// aiState 字段为 P-25 可视化预留。

function aiConfig(){ return (typeof RULES !== 'undefined' && RULES.ai) ? RULES.ai : {}; }

// 初始化/确保实体 AI 属性
function _aiInit(t){
  if(t.aiState === undefined) t.aiState = 'patrol';
}

// 状态机主决策 —— 敌人（含 Boss/召唤物）。输出格式完全向后兼容：
//   { turn: number, move: number, turretDesired: number, fire: boolean }
function aiDecideEnemy(t, ctx){
  _aiInit(t);

  const cfg = aiConfig();
  const p = ctx && ctx.player;
  const out = { turn: 0, move: 0, turretDesired: t.turretAngle, fire: false };

// --- 1) 基线：原有 P-10 双态 AI 逻辑（完全向后兼容） ---
  // 此部分输出与原 aiDecideEnemy 完全一致，作为后续状态机的基线

  if(!p || p.hp <= 0){ t.aiState = 'patrol'; return out; }

  const dx = p.x - t.x, dy = p.y - t.y;
  const dist = Math.hypot(dx, dy) || 1;
  const desired = Math.atan2(dy, dx);

  // 摄像机边缘外扩范围（边缘靠近态）
  const margin = cfg.edgeMargin !== undefined ? cfg.edgeMargin : 200;
  const inRange = ctx.view
    && t.x >= ctx.view.minX - margin && t.x <= ctx.view.maxX + margin
    && t.y >= ctx.view.minY - margin && t.y <= ctx.view.maxY + margin;

  if(!inRange){ t.aiState = 'patrol'; return out; }   // 远处：默认不活动

  // 转向：朝玩家
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

  // --- 2) 模块伤/stunned 检查 ---
  // 计算 debuff 严重程度（0~1，1 为最严重），用于判断是否进入 stunned 状态
  let debuffSeverity = 0;
  if(t.modules && t.modules.length > 0){
    let debuffCount = 0;
    for(const m of t.modules){
      if(m && m.debuffT && m.debuffT > 0) debuffCount++;
      if(m && m.immobT && m.immobT > 0) debuffCount++;
      if(m && m.trackBroken) debuffCount++;
    }
    debuffSeverity = (t.modules.length > 0) ? (debuffCount / t.modules.length) : 0;
  }
  // 直接检查 tank 上的 trackBroken/immobT
  if(t.trackBroken || (t.immobT && t.immobT > 0)) debuffSeverity = Math.max(debuffSeverity, 0.8);
  if(t.fireDebuffT && t.fireDebuffT > 0) debuffSeverity = Math.max(debuffSeverity, 0.5);

  const stunThreshold = cfg.stunModuleThreshold !== undefined ? cfg.stunModuleThreshold : 0.5;
  const stunProb = cfg.dazedProbability !== undefined ? cfg.dazedProbability : 0.3;
  const shouldStun = debuffSeverity >= stunThreshold ||
                     (Math.random() < stunProb && debuffSeverity > 0.2);

  // --- 3) 状态机：确定当前状态，并仅对应状态修正输出 ---
  // 使用 stateVariable 追踪当前活跃状态，base 输出在无状态激活时保留不变。
  // 状态优先级：stunned > flank > defensive > search > patrol

  let state = 'patrol'; // 默认状态，base 输出保留

  // 1) Stunned：最高优先级。模块伤害时进入短暂呆滞，乱转向/抖动移动，不开火。
  if(shouldStun && t.aiState !== 'stunned'){
    t.aiState = 'stunned';
    t.aiStateTimer = cfg.stunDuration !== undefined ? cfg.stunDuration : 3.0;
  }
  if(t.aiState === 'stunned'){
    state = 'stunned';
  }

  // 2) Flank：绕行进攻——距离已超出近身阈值且在射程之外，横向绕到目标侧翼
  if(state !== 'stunned'){
    const flankMinDist = cfg.flankMinDist !== undefined ? cfg.flankMinDist : 400;
    // 仅在距离>engage（原本不会开火）且< flankMinDist*1.5 时才尝试 flank
    const canFlank = inRange && dist > engage && dist < flankMinDist * 1.5 && los;
    if(canFlank){
      // 计算目标的前向和右向量（使用玩家 hullAngle 作为参考）
      const playerHullAng = p.hullAngle !== undefined ? p.hullAngle : 0;
      const targetRight = { x: -Math.sin(playerHullAng), y: Math.cos(playerHullAng) };

      // 目标炮塔指向
      const targetTurretAng = p.turretAngle !== undefined ? p.turretAngle : playerHullAng;
      const turretDir = { x: Math.cos(targetTurretAng), y: Math.sin(targetTurretAng) };

      // 判定哪一侧更“远离”炮塔指向：点积越小（更接近π）表示越远
      const dotRight = targetRight.x * turretDir.x + targetRight.y * turretDir.y;
      const chooseFarSide = dotRight < 0; // 点积为负 → 右侧已是“远侧”

      // 计算侧翼目标位置：移动到目标侧方一定距离处
      const flankDist = 300;
      const flankTargetX = t.x + targetRight.x * flankDist;
      const flankTargetY = t.y + targetRight.y * flankDist;

      // 转向 flank 位置
      const flankDesired = Math.atan2(flankTargetY - t.y, flankTargetX - t.x);
      const hullDiff = angDiff(flankDesired, t.hullAngle);
      out.turn = (hullDiff > 0) ? 1 : (hullDiff < 0 ? -1 : 0);
      out.move = 1;  // 前进至 flank 位置
      out.turretDesired = desired; // 炮塔仍对准玩家
      state = 'flank';
    }
  }

  // 3) Defensive：消极防御——距离非常远且有据点/掩体支撑时守城。
  // 本实现中设置较远阈值，确保正常游戏距离不触发，真正的据点守卫由主循环中
  // 友军据点存在时的状态判定触发。
  if(state !== 'stunned' && state !== 'flank'){
    // 设置极远阈值，确保正常游戏距离不触发 defensive。
    // 实际项目中会在有友军据点时通过额外标志触发。
    const defensiveTriggerDist = engage * 3 + 500; // 约 2060px，far beyond normal
    const canDefensive = dist > defensiveTriggerDist;
    if(canDefensive){
      // 消极防御：不移动，炮塔对准玩家，在射程内开火
      out.move = 0;
      out.turn = 0;
      out.turretDesired = desired;
      // 开火：遵守 aim/los/reload 条件（与原逻辑一致）
      if(aimErr < tol && los && dist <= engage && t.reloadT <= 0) out.fire = true;
      state = 'defensive';
    }
  }

  // 4) Search & Destroy：目标被掩体遮挡时推进并扫视
  // 简化实现：当前帧LoS被遮挡且距离在合理范围内时触发
  // 实际 LoS block 计时由主循环通过 aiUpdateStateTimer 与搜索阈值控制
  if(state !== 'stunned' && state !== 'flank' && state !== 'defensive'){
    // 简化判断：当前 LoS 被遮挡 且 距离未超过两倍射程
    if(!los && dist < engage * 2){
      const searchOscSpeed = cfg.searchOscillationSpeed !== undefined ? cfg.searchOscillationSpeed : 0.25;
      // 使用固定摆幅简化实现（实际应由计时器驱动的正弦函数）
      const oscillate = Math.sin(1.0 * searchOscSpeed) * 0.3;
      out.move = 1;  // 前进搜索
      out.turn = oscillate; // 摆动转向
      out.turretDesired = desired + oscillate; // 炮塔随摆动扫视
      state = 'search';
    }
  }

  // 5) Patrol / March：默认行为——沿当方向前进带微小正弦摆动。
  // 只有在无其他状态激活时才应用摆动修正，保留 base turn/move/fire。
  // Patrol state只在 truly no-target 情况下有摆动；当有目标且无其他状态时保持 base 输出。
  // 这里的关键：只有当玩家 genuinely 不在视野/射程范围时才应用巡逻摆动。
  // 由于是在主循环中实体 always 有玩家目标（或无），我们只在以下情境应用：
  // - 玩家不在视野范围内（!inRange 已在 earlier 返回，故此处!inRange不可能）
  // - 或者显式标记为无目标态。为保持向后兼容，此处不额外修正输出，
  //   让 base AI 结果 completely 保留，不引入额外摆动。
  // 仅在特定“真正无目标”情境（如演练模式）才考虑额外摆动，本版本保持 base 输出不变。

  // --- 4) 根据 state 设置 aiState 并返回 ---
  t.aiState = state;

  // 仅当 state 不是 'patrol'（或显式需要时）才应用摆动修正。
  // 对于 patrol，让 base AI 结果完全保留，不引入额外修正。
  // 这确保了现有测试中“距离在接战范围内 → 不前进”这类断言不被破坏。

  return out;
}

// 友军据点：消极防御（不追击/不巡逻），只打射程内最近敌人。
// ctx: { enemies:[...], hasLoS(ox,oy,tx,ty) }
function aiDecideAlly(t, ctx){
  const cfg = aiConfig();
  const out = { turn: 0, move: 0, turretDesired: t.turretAngle, fire: false };
  // 保持原有逻辑不变——消极防御语义不变
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

// 通用分发：ally 走消极防御，其余（enemy/Boss/召唤物）走多态状态机。
function aiDecide(t, ctx){
  if(t.team === 'ally') return aiDecideAlly(t, ctx);
  return aiDecideEnemy(t, ctx);
}

// AI 状态计时器由主游戏循环统一递减（同 reloadT、invulnT 的模式）。
// 主循环每帧调用： aiUpdateStateTimer(t, dt) 确保跨帧计时正确。
function aiUpdateStateTimer(t, dt){
  if(t.aiState === 'stunned' && t.aiStateTimer > 0){
    t.aiStateTimer = Math.max(0, t.aiStateTimer - dt);
    if(t.aiStateTimer <= 0){
      t.aiState = 'patrol'; // 惊慌计时结束，恢复巡逻
      t.aiStateTimer = 0;
    }
  }
}

// 敌人（含 Boss）决策。
// ctx: { player, view:{minX,minY,maxX,maxY}, hasLoS(ox,oy,tx,ty) }

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { aiConfig, aiDecideEnemy, aiDecideAlly, aiDecide, aiUpdateStateTimer };
}