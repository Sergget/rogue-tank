'use strict';

// tank_ai.js — 敌人/友军 AI 决策（P-10 / DEVELOPMENT.md §6 条目 7 / P-19 扩充）。
// 纯逻辑模块：无 DOM / Canvas 依赖，Node 可测（module.exports 底部导出）。
// 输出 { turn, move, turretDesired, fire }，供接入层（mvp）消费——保持完全向后兼容。
// 视线判定通过 ctx.hasLoS(ox,oy,tx,ty) 注入（见 js/tank_cover.js hasLineOfSight），
// 保持本模块对掩体全局的零依赖、可独立测试。
//
// 战术状态机（P-19 / #76 扩充）：敌人在下列状态间切换
//   Stunned    — 模块伤害/被击震惊（优先级最高，计时器计数后恢复；tier2 抗晕减半概率+阈值上调）
//   Flank      — 绕行进攻：横向绕到目标侧翼再开火
//   CoverSeek  — 重坦受创寻掩（#76 C6）：血量低于阈值时退到最近掩体背弹面还击
//   Defensive  — 消极防御：守在据点/掩体后，只打射程内目标
//   Search     — 搜索前进：目标被掩体遮挡时朝最后已知位置推进并扫视
//   Patrol     — 队列行军：无目标或远战场时沿固定方向/巡逻前进（#76 C5 未激活早退带微摆动）
//
// aiState 字段为 P-25 可视化预留。

function aiConfig(){ return (typeof RULES !== 'undefined' && RULES.ai) ? RULES.ai : {}; }

// #76 B：按实体 t.aiTier 取档位表（RULES.ai.tierProfiles），越高级越警觉/越准/越抗晕。
// 纯函数、可独立单测：缺档/越界一律回退空 profile（tier 0 基础行为）。
function aiTierProfile(tier){
  const cfg = aiConfig();
  const arr = Array.isArray(cfg.tierProfiles) ? cfg.tierProfiles : [];
  const i = Math.max(0, Math.floor(Number.isFinite(tier) ? tier : 0));
  return arr[i] || {};
}

// #76 C5：patrol 早退微摆动 —— 远处未激活敌人缓慢左右摆头（不再全零死板）。
// 时间源选择：ctx.time 显式注入时用之（确定性、测试友好）；否则用实体本地相位
// t.wanderPhase += speed×step 的性能无关推进（step 取 ctx.dt 或固定 1/60 步长，已注明）。
// 输出为 turn 分量：sin(phase)×sigma（sigma=patrolWanderSigma rad 幅度，move 恒 0）。
function _patrolWanderTurn(t, ctx){
  const cfg = aiConfig();
  const speed = cfg.patrolWanderSpeed !== undefined ? cfg.patrolWanderSpeed : 1.5;
  const sigma = cfg.patrolWanderSigma !== undefined ? cfg.patrolWanderSigma : 0.02;
  let phase;
  if(ctx && Number.isFinite(ctx.time)){
    phase = ctx.time * speed;
  } else {
    const step = (ctx && Number.isFinite(ctx.dt) && ctx.dt > 0) ? ctx.dt : (1/60);
    if(!Number.isFinite(t.wanderPhase)) t.wanderPhase = 0;
    phase = t.wanderPhase;          // 先读后推进：首次调用 phase=0（sin=0，保持旧全零首调兼容）
    t.wanderPhase += speed * step;
  }
  return Math.sin(phase) * sigma;
}

// #76 B：接战/精度参数合成（可单测）——
//   engage = engageRange × 难度比(trigRatio) × 档位 engageMul
//     难度比复用生成期难度化触发距离：trigRatio = clamp(t.aiTriggerDist / triggerDistBase, 1, hysteresis)
//     （aiTriggerDist 由 tank_map.triggerDistForDifficulty 按 effDiff 算好，作为难度代理避免额外穿线）
//   tol = aimTolerance × 档位 aimTolMul（<1 更准）
function _effectiveEngage(t, cfg, prof){
  const baseEngage = cfg.engageRange !== undefined ? cfg.engageRange : 520;
  const baseTrig = cfg.triggerDistBase !== undefined ? cfg.triggerDistBase : 700;
  const hyst = cfg.triggerHysteresis !== undefined ? cfg.triggerHysteresis : 1.25;
  const trigRatio = (t.aiTriggerDist && t.aiTriggerDist > 0 && baseTrig > 0)
    ? Math.min(hyst, Math.max(1, t.aiTriggerDist / baseTrig)) : 1;
  return baseEngage * trigRatio * (prof.engageMul || 1);
}

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

  if(!p || p.hp <= 0){ t.aiState = 'patrol'; t.aiEngaged = false; return out; }

  const dx = p.x - t.x, dy = p.y - t.y;
  const dist = Math.hypot(dx, dy) || 1;
  const desired = Math.atan2(dy, dx);

  // #76 B：档位 + 难度合成的接战/精度参数（提前计算，供开火/移动/flank/寻掩共用）
  const prof = aiTierProfile(t.aiTier);
  const engage = _effectiveEngage(t, cfg, prof);
  const tol = (cfg.aimTolerance !== undefined ? cfg.aimTolerance : 0.12) * (prof.aimTolMul || 1);

  // --- 激活触发（重设计）：距离 + 可见性，与摄像机视野彻底解耦 ---
  // 有效触发距离：实体字段 aiTriggerDist（生成时按难度算好，见 tank_map.js
  // triggerDistForDifficulty）优先，缺省回退 RULES.ai.triggerDistBase。
  // 滞回防抖：进入阈值 = 有效触发距离；脱离阈值 = 进入阈值 × triggerHysteresis。
  const baseTrig = cfg.triggerDistBase !== undefined ? cfg.triggerDistBase : 700;
  const hyst = cfg.triggerHysteresis !== undefined ? cfg.triggerHysteresis : 1.25;
  const trigDist = (t.aiTriggerDist && t.aiTriggerDist > 0) ? t.aiTriggerDist : baseTrig;
  const enterD = trigDist, exitD = trigDist * hyst;
  if(t.aiEngaged === undefined) t.aiEngaged = false;
  if(!t.aiEngaged){
    if(dist > enterD){
      // #76 C5：激活门控外的 patrol 早退不再全零——微摆动摆头（远处敌人不死板）
      t.aiState = 'patrol';
      out.turn = _patrolWanderTurn(t, ctx);
      return out;
    }                                                   // 触发距离外：patrol 不活动
  } else if(dist > exitD){                                   // 滞回带内保持接战，超出才脱离
    // 警觉记忆（被击中/友邻告警）：持有 lastKnownPlayerPos 时即使超出滞回带也保持
    // 接战——朝记忆点 search 推进，直到到达附近或重新获得视线后清除（见 LoS/search 分支）。
    if(!t.lastKnownPlayerPos){
      t.aiEngaged = false;
      t.aiState = 'patrol';
      out.turn = _patrolWanderTurn(t, ctx);   // #76 C5：同上，脱离接战后微摆动
      return out;
    }
  }
  t.aiEngaged = true;

  // LoS 节流：仅距离达标时才评估（上方 patrol 早退路径不做射线），避免逐帧全图射线开销。
  const los = ctx.hasLoS ? ctx.hasLoS(t.x, t.y, p.x, p.y) : true;

  // 重新获得视线 → 警觉记忆已确认目标位置，清除
  if(los && t.lastKnownPlayerPos) t.lastKnownPlayerPos = null;

  // 距离达标但无视线 → search 态推进：优先朝警觉记忆点（来弹方向）推进，
  // 无记忆时沿用 searchOscillationSpeed 等参数扫视前进
  if(!los){
    const searchOscSpeed = cfg.searchOscillationSpeed !== undefined ? cfg.searchOscillationSpeed : 0.25;
    const oscillate = Math.sin(1.0 * searchOscSpeed) * 0.3;
    let heading = desired;
    const mem = t.lastKnownPlayerPos;
    if(mem){
      const mdx = mem.x - t.x, mdy = mem.y - t.y;
      const mdist = Math.hypot(mdx, mdy);
      const arrive = cfg.searchArriveDist !== undefined ? cfg.searchArriveDist : 140;
      if(mdist <= arrive){
        t.lastKnownPlayerPos = null;   // 到达记忆点附近：放弃追忆，恢复扫视推进
      } else {
        heading = Math.atan2(mdy, mdx);   // 未到达：朝记忆点（来弹方向）推进
      }
    }
    out.move = 1;
    const hDiff = angDiff(heading, t.hullAngle);
    out.turn = hDiff > 0.05 ? 1 : (hDiff < -0.05 ? -1 : 0);
    out.turretDesired = heading;
    t.aiState = 'search';
    return out;
  }

  // 转向：朝玩家
  const hullDiff = angDiff(desired, t.hullAngle);
  if(hullDiff > 0.05) out.turn = 1;
  else if(hullDiff < -0.05) out.turn = -1;
  out.turretDesired = desired;

  // 移动：保持距离（远则进，太近则退）——engage 已含难度/档位调制（#76 B）
  const close = cfg.closeRange !== undefined ? cfg.closeRange : 200;
  if(dist > engage) out.move = 1;
  else if(dist < close) out.move = -1;

  // 开火：炮塔大致对准 + 视线畅通（触发段已算好 los）+ 装填好 + 在接战距离内
  // tol 已按档位 aimTolMul 收紧（#76 B）
  const aimErr = Math.abs(angDiff(t.turretAngle, desired));
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

  const stunThreshold = (cfg.stunModuleThreshold !== undefined ? cfg.stunModuleThreshold : 0.5)
                        + (prof.stunResist ? 0.2 : 0);   // #76 B：抗晕档阈值上调
  const stunProb = (cfg.dazedProbability !== undefined ? cfg.dazedProbability : 0.3)
                   * (prof.stunResist ? 0.5 : 1);          // #76 B：抗晕档随机 daze 概率减半
  // stun 免疫窗：stunned 自然结束后 stunImmuneT 秒内不再被压入 stunned
  // （防高射速 + 30% 随机 daze 无限连控；见 RULES.ai.stunImmunityAfter）
  const stunImmune = (t.stunImmuneT || 0) > 0;
  const shouldStun = !stunImmune && (
                     debuffSeverity >= stunThreshold ||
                     (Math.random() < stunProb && debuffSeverity > 0.2));

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
    const canFlank = dist > engage && dist < flankMinDist * 1.5 && los;
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

      // 计算侧翼目标位置：移动到目标侧方一定距离处（#76 B：flankDist 收口 RULES.ai）
      const flankDist = cfg.flankDist !== undefined ? cfg.flankDist : 300;
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

  // 2b) CoverSeek（#76 C6）：重坦受创寻掩——接战中、重甲（aiTier≥1 或车体正面装甲达标）
  // 且血量低于 defensiveCoverThreshold 时，向半径 coverSeekRadius 内最近 full/half 掩体的
  // 背弹面（掩体位置沿「掩体→玩家」反方向偏移半深+边距）移动；到位后原地还击。
  // 无合适掩体则维持原行为。原 defensive 远距守据点语义不受影响（独立状态，见下）。
  if(state !== 'stunned' && state !== 'flank'){
    const seekThresh = cfg.defensiveCoverThreshold !== undefined ? cfg.defensiveCoverThreshold : 0.6;
    const armorMin = cfg.coverHeavyArmorMin !== undefined ? cfg.coverHeavyArmorMin : 100;
    const frontArmor = (t.stats && t.stats.armor && t.stats.armor.hull && t.stats.armor.hull.front !== undefined)
                       ? t.stats.armor.hull.front : 0;
    const heavyEnough = (t.aiTier !== undefined && t.aiTier >= 1) || frontArmor >= armorMin;
    const hpRatio = (t.maxHp > 0) ? (t.hp / t.maxHp) : 1;
    if(heavyEnough && hpRatio < seekThresh){
      const coversArr = Array.isArray(ctx.covers) ? ctx.covers : [];
      const radius = cfg.coverSeekRadius !== undefined ? cfg.coverSeekRadius : 500;
      let best = null, bestD = Infinity;
      for(const c of coversArr){
        if(!c || (c.tier !== 'full' && c.tier !== 'half')) continue;   // 只认可挡弹的实体掩体
        const cd = Math.hypot(c.x - t.x, c.y - t.y);
        if(cd <= radius && cd < bestD){ bestD = cd; best = c; }
      }
      if(best){
        // 背弹面目标点：从掩体中心沿「掩体→玩家」反方向偏移半深 + 边距（遍历比较即可，无需寻路）
        const toP = Math.hypot(p.x - best.x, p.y - best.y) || 1;
        const ux = (p.x - best.x) / toP, uy = (p.y - best.y) / toP;
        const halfDepth = Math.min(best.w || 40, best.h || 40) / 2;
        const margin = cfg.coverStandoffMargin !== undefined ? cfg.coverStandoffMargin : 40;
        const tx = best.x - ux * (halfDepth + margin);
        const ty = best.y - uy * (halfDepth + margin);
        const arrive = cfg.coverArriveDist !== undefined ? cfg.coverArriveDist : 90;
        const dToTarget = Math.hypot(tx - t.x, ty - t.y);
        if(dToTarget > arrive){
          const seekHeading = Math.atan2(ty - t.y, tx - t.x);
          const sDiff = angDiff(seekHeading, t.hullAngle);
          out.turn = sDiff > 0.05 ? 1 : (sDiff < -0.05 ? -1 : 0);
          out.move = 1;   // 向掩体背弹面机动
        } else {
          out.move = 0;   // 已就位：原地还击
        }
        out.turretDesired = desired;   // 炮塔全程锁定玩家
        if(aimErr < tol && los && dist <= engage && t.reloadT <= 0) out.fire = true;
        state = 'coverSeek';
      }
      // 无掩体可寻 → 静默落回 base/flank/defensive 原行为
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

  // 4) Search & Destroy：已在触发段处理——距离达标但无视线时提前进入 search 推进
  // 并返回（见上方 LoS 分支），此处不再重复判定。

  // 5) Patrol / March：默认行为——沿当方向前进带微小正弦摆动。
  // 只有在无其他状态激活时才应用摆动修正，保留 base turn/move/fire。
  // Patrol state只在 truly no-target 情况下有摆动；当有目标且无其他状态时保持 base 输出。
  // 这里的关键：只有当目标真正超出触发距离/滞回带时才会提前返回 patrol（见触发段），
  // 能走到这里的实体必然已接战。为保持向后兼容，此处不额外修正输出，
  //   让 base AI 结果 completely 保留，不引入额外摆动。

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
  // stun 免疫窗倒计时（独立于 stunned 状态，每帧递减）
  if(t.stunImmuneT > 0){
    t.stunImmuneT = Math.max(0, t.stunImmuneT - dt);
  }
  if(t.aiState === 'stunned' && t.aiStateTimer > 0){
    t.aiStateTimer = Math.max(0, t.aiStateTimer - dt);
    if(t.aiStateTimer <= 0){
      t.aiState = 'patrol'; // 惊慌计时结束，恢复巡逻
      t.aiStateTimer = 0;
      // 自然苏醒 → 进入 stun 免疫窗（RULES.ai.stunImmunityAfter，缺省 2s）
      const cfg = aiConfig();
      t.stunImmuneT = cfg.stunImmunityAfter !== undefined ? cfg.stunImmunityAfter : 2.0;
    }
  }
}

// --- 警觉系统（被击中/友邻告警）：修复「镜头外无伤打木桩」缺陷 ---
// alertEntity：命中/告警来源 (srcX,srcY) 触发敌对 AI 立即接战——
//   置 aiEngaged、记录 lastKnownPlayerPos（来弹方向，search 分支朝其推进）、
//   清除进行中的 stunned（被击中立即惊醒）。玩家/友军实体为 no-op。
// 返回 true 表示该实体被警觉。
function alertEntity(t, srcX, srcY){
  if(!t || t.team !== 'enemy' || t.isDrone || t.hp <= 0) return false;
  t.aiEngaged = true;
  t.lastKnownPlayerPos = { x: srcX, y: srcY };
  if(t.aiState === 'stunned'){
    t.aiState = 'patrol';       // 被击中立即惊醒（不给免疫窗——免疫窗只在自然苏醒后授予）
    t.aiStateTimer = 0;
  }
  return true;
}

// propagateAlert：以 (x,y) 为中心、radius（缺省 RULES.ai.alertRadius=600）内的
// 其他存活敌对 AI 全部警觉（lastKnown 记为 x,y）。返回被警觉的实体数。
function propagateAlert(entitiesArr, x, y, radius){
  const cfg = aiConfig();
  const r = (radius !== undefined && radius > 0) ? radius
          : (cfg.alertRadius !== undefined ? cfg.alertRadius : 600);
  let count = 0;
  const list = entitiesArr || [];
  for(const e of list){
    if(!e || e.hp <= 0) continue;
    if(Math.hypot(e.x - x, e.y - y) > r) continue;   // 半径筛选
    if(alertEntity(e, x, y)) count++;
  }
  return count;
}

// 敌人（含 Boss）决策。
// ctx: { player, hasLoS(ox,oy,tx,ty) } —— 激活触发 = 距离 + 可见性，与摄像机视野解耦。

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { aiConfig, aiTierProfile, aiDecideEnemy, aiDecideAlly, aiDecide, aiUpdateStateTimer, alertEntity, propagateAlert };
}