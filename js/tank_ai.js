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

// #A17 方案2：LoS 受阻时的运行时侧向绕行（兜底层，防 AI 顶墙永久卡死）。
// 纯函数、可独立单测：取 losBlocker 提供的遮挡体侧向单位向量 (nx,ny)，
// 选 ± 侧使 AI 偏移一个试步后视线更接近恢复（复检：偏好 null > 离 AI 更远），
// 再合成「朝 heading 前进 + 侧向(s)偏移」的期望朝向，输出温和转向分量。
// 无遮挡 / losBlocker 不可用 / 目标过近 → 返回 null（调用方回退原直冲语义）。
function _losDetour(t, p, heading){
  const cfg = aiConfig();
  if(typeof losBlocker !== 'function') return null;       // 原语不可用则不动
  const blk = losBlocker(t.x, t.y, p.x, p.y);
  if(!blk) return null;                                    // 无遮挡 → 不需要绕
  const nx = blk.nx, ny = blk.ny;
  const L0 = Math.hypot(p.x - t.x, p.y - t.y) || 1;
  if(L0 < 40) return null;                                 // 过近不绕，避免抖动
  // 选 ±(nx,ny)：偏移试步后复检，取使遮挡更远 / 视线恢复的一侧
  const step = cfg.detourProbeStep !== undefined ? cfg.detourProbeStep : 60;
  const a1x = t.x + nx * step, a1y = t.y + ny * step;
  const a2x = t.x - nx * step, a2y = t.y - ny * step;
  const h1 = losBlocker(a1x, a1y, p.x, p.y);
  const h2 = losBlocker(a2x, a2y, p.x, p.y);
  const d1 = h1 ? Math.hypot(h1.point.x - a1x, h1.point.y - a1y) : Infinity;
  const d2 = h2 ? Math.hypot(h2.point.x - a2x, h2.point.y - a2y) : Infinity;
  const s = d1 >= d2 ? 1 : -1;                             // 离遮挡更远的一侧更优
  // 合成期望朝向：朝 heading（记忆点/玩家）方向 + 侧向偏移，权重收口 RULES.ai.detourLatWeight
  const w = cfg.detourLatWeight !== undefined ? cfg.detourLatWeight : 0.8;
  const hx = Math.cos(heading), hy = Math.sin(heading);
  const dxV = hx + nx * s * w, dyV = hy + ny * s * w;
  const detourHeading = Math.atan2(dyV, dxV);
  const hDiff = angDiff(detourHeading, t.hullAngle);
  const turn = hDiff > 0.05 ? 1 : (hDiff < -0.05 ? -1 : 0);
  return { turn: turn, sign: s };
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

// P-51：Boss 阶段行为模式参数表（RULES.boss.aiModes，由 js/tank_rules.js 提供）。
// 兜底内联同值三模式，保证 Node 单测不依赖 tank_rules.js 的加载时序。
function _bossStageAIModes(){
  const fb = { hold:{}, charge:{keepDist:0}, skirmish:{keepDist:640} };
  return (typeof RULES !== 'undefined' && RULES.boss && RULES.boss.aiModes) ? RULES.boss.aiModes : fb;
}

// 消极防御核心（友军据点语义，P-51 提取共用）：原地不动、炮塔锁定射程内目标，
// 对准+视线+装填满足才开火；目标不存在/超出射程 → 输出保持当前朝向、不开火。
// target 为单个实体（友军传最近敌人，Boss hold 传玩家）。
function _passiveDefend(t, ctx, target){
  const cfg = aiConfig();
  const out = { turn: 0, move: 0, turretDesired: t.turretAngle, fire: false };
  if(!target || target.hp <= 0) return out;
  const range = cfg.allyEngageRange !== undefined ? cfg.allyEngageRange : 460;
  const dx = target.x - t.x, dy = target.y - t.y;
  const d = Math.hypot(dx, dy);
  if(d > range) return out;
  const desired = Math.atan2(dy, dx);
  out.turretDesired = desired;
  const tol = cfg.aimTolerance !== undefined ? cfg.aimTolerance : 0.12;
  const aimErr = Math.abs(angDiff(t.turretAngle, desired));
  const los = ctx.hasLoS ? ctx.hasLoS(t.x, t.y, target.x, target.y) : true;
  if(aimErr < tol && los && t.reloadT <= 0) out.fire = true;
  return out;
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

  // ISSUE 21b：Boss 强制接战（永不脱离 aggro / 不丢失目标记忆）
  if(t.isBoss){
    t.aiEngaged = true;
    t.lastKnownPlayerPos = t.lastKnownPlayerPos || { x: p.x, y: p.y };
  }

  // --- 0) P-51：Boss 阶段声明式行为覆盖（仅 isBoss 且 stageAI 存在时生效） ---
  //   hold     → 复用友军消极防御语义（原地防守、射程内还击，不进主动状态机）
  //   skirmish → 与目标保持 keepDist：过近倒车（move=-1，遵循 driveTank 倒车约定）、
  //              达标即停；炮塔全程照常瞄准开火。
  //   charge / 未知 mode → 显式默认激进接敌：不加任何位移约束，直接落入下方基线
  //   主动状态机（params.keepDist=0 不产生额外约束）。
  //   非 Boss 或 stageAI 为 null → 完全不进入本分支，行为零改动。
  if(t.isBoss && t.stageAI && t.stageAI.mode){
    const modes = _bossStageAIModes();
    const mCfg = modes && typeof modes === 'object' ? modes[t.stageAI.mode] : null;

    if(t.stageAI.mode === 'hold'){
      t.aiState = 'hold';
      return _passiveDefend(t, ctx, p);
    }

    if(t.stageAI.mode === 'skirmish'){
      const fbSkirmish = (modes.skirmish && modes.skirmish.keepDist !== undefined)
        ? modes.skirmish.keepDist : 640;
      const pKeep = t.stageAI.params ? t.stageAI.params.keepDist : undefined;
      const keepDist = Number.isFinite(pKeep) ? pKeep : fbSkirmish;
      const dxB = p.x - t.x, dyB = p.y - t.y;
      const distB = Math.hypot(dxB, dyB) || 1;
      const desiredB = Math.atan2(dyB, dxB);
      const out = { turn: 0, move: 0, turretDesired: desiredB, fire: false };
      // 车体朝向目标；拉开距离用 move<0 倒车（driveTank 现有约定），不引入反向转向逻辑
      const hullDiff = angDiff(desiredB, t.hullAngle);
      if(hullDiff > 0.05) out.turn = 1;
      else if(hullDiff < -0.05) out.turn = -1;
      out.move = distB < keepDist ? -1 : 0;
      const cfgA = aiConfig();
      const tol = cfgA.aimTolerance !== undefined ? cfgA.aimTolerance : 0.12;
      const aimErr = Math.abs(angDiff(t.turretAngle, desiredB));
      const los = ctx.hasLoS ? ctx.hasLoS(t.x, t.y, p.x, p.y) : true;
      if(aimErr < tol && los && t.reloadT <= 0) out.fire = true;
      t.aiState = 'skirmish';
      return out;
    }

    // charge 及未知 mode：落回基线主动状态机（无额外处理）
  }

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
      if(!t.isBoss) return out;                       // ISSUE 21b：Boss 不回 patrol，继续追击
    }                                                   // 触发距离外：patrol 不活动
  } else if(dist > exitD){                                   // 滞回带内保持接战，超出才脱离
    // 警觉记忆（被击中/友邻告警）：持有 lastKnownPlayerPos 时即使超出滞回带也保持
    // 接战——朝记忆点 search 推进，直到到达附近或重新获得视线后清除（见 LoS/search 分支）。
    if(!t.lastKnownPlayerPos){
      t.aiEngaged = false;
      t.aiState = 'patrol';
      out.turn = _patrolWanderTurn(t, ctx);   // #76 C5：同上，脱离接战后微摆动
      if(!t.isBoss) return out;                       // ISSUE 21b：Boss 不回 patrol，继续追击
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
    // #A17 方案2：LoS 受阻时叠加温和侧向绕行（losBlocker 选 ± 侧），避免顶墙永久卡死；
    // LoS 恢复即退出本分支、回到正常接战（下方 los 为真路径）。
    const detour = _losDetour(t, p, heading);
    if(detour){
      out.turn = detour.turn;
    } else {
      const hDiff = angDiff(heading, t.hullAngle);
      out.turn = hDiff > 0.05 ? 1 : (hDiff < -0.05 ? -1 : 0);
    }
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
  else if(dist < close && !t.isBoss) out.move = -1;   // ISSUE 21b：Boss 不后撤（防 kite）

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

  // #88 装填间隙随机侧摆（基线 patrol 态专用；普通敌与 Boss 基线均适用）：
  // 装填前段（reloadT > 装填时长 × sideSwingReloadFrac，缺省 0.3）且非特殊态时，
  // 车体向随机侧向目标角（当前朝向 ± rng(sideSwingAngleMin~sideSwingAngleMax)）摆动——
  // 每次持续数秒后换向（t._swingTarget/_swingT 计时）。turn 朝目标摆、前进机动微降（0.3）；
  // 炮塔锁定与开火条件不变（不触碰 turretDesired/fire）。reloadT 归零恢复常规并清计时。
  // 注：Boss 的防风筝 move=1 覆盖（下方 ISSUE 21b）优先级更高——Boss 只摆车体方向不停驶。
  if(state === 'patrol' && ctx && Number.isFinite(ctx.dt)){
    const reloadDur = (t.stats && typeof t.stats.reload === 'number' && t.stats.reload > 0)
      ? t.stats.reload : 4;
    const frac = cfg.sideSwingReloadFrac !== undefined ? cfg.sideSwingReloadFrac : 0.3;
    const minA = cfg.sideSwingAngleMin !== undefined ? cfg.sideSwingAngleMin : 0.78;
    const maxA = cfg.sideSwingAngleMax !== undefined ? cfg.sideSwingAngleMax : 1.57;
    if(t.reloadT > reloadDur * frac){
      if(!Number.isFinite(t._swingTarget) || (t._swingT || 0) <= 0){
        const ang = minA + Math.random() * Math.max(0, maxA - minA);
        t._swingTarget = norm(t.hullAngle + ((Math.random() < 0.5) ? -ang : ang));
        t._swingT = 1.5 + Math.random() * 2.5;   // 每次数秒换一次方向
      }
      t._swingT -= ctx.dt;
      const sDiff = angDiff(t._swingTarget, t.hullAngle);
      out.turn = sDiff > 0.05 ? 1 : (sDiff < -0.05 ? -1 : 0);
      if(out.move > 0) out.move = 0.3;   // 微降机动（仅压低前进；倒车/停止语义保留）
    } else {
      t._swingTarget = undefined;
      t._swingT = 0;
    }
  }

  // ISSUE 9：接战微行为随机化（仅 engaged 基态 / 非 stunned/flank/coverSeek 生效）。
  // 通过惰性计时器在坦克上随机触发“露头偏角(peek)”与“短促走位(repos)”：
  //   - peek：触发时给 out.turn 叠加 ±peekAngleMax 的偏角持续数秒（炮塔仍锁玩家，不抑制开火）；
  //   - repos：触发时短暂改写 out.move 为 ±1 走位并加一个小转向偏置，窗口结束自动回基态。
  // 不改动 turretDesired（恒锁玩家）与开火条件，亦不触碰 aiUpdateStateTimer。
  if(state === 'patrol' && ctx && Number.isFinite(ctx.dt)){
    const peekMax = (cfg.peekAngleMax !== undefined) ? cfg.peekAngleMax : 0.5;
    const peekIV = Array.isArray(cfg.peekInterval) ? cfg.peekInterval : [3, 6];
    const reposIV = Array.isArray(cfg.reposInterval) ? cfg.reposInterval : [4, 8];
    if(t.aiPeekTimer === undefined) t.aiPeekTimer = Math.random() * (peekIV[1] - peekIV[0]) + peekIV[0];
    if(t.aiReposTimer === undefined) t.aiReposTimer = Math.random() * (reposIV[1] - reposIV[0]) + reposIV[0];
    if(t.aiPeekUntil === undefined) t.aiPeekUntil = 0;
    if(t.aiReposUntil === undefined) t.aiReposUntil = 0;
    t.aiPeekTimer -= ctx.dt;
    t.aiReposTimer -= ctx.dt;
    if(t.aiPeekUntil > 0){
      t.aiPeekUntil -= ctx.dt;
      out.turn += (t.aiPeekOffset || 0);          // 持续数秒的露头偏角（在基态转向基础上叠加）
    } else if(t.aiPeekTimer <= 0){
      t.aiPeekOffset = (Math.random() * 2 - 1) * peekMax;   // ±peekAngleMax 随机偏角
      t.aiPeekUntil = 1.5 + Math.random() * 1.5;            // 持续 1.5~3s
      t.aiPeekTimer = Math.random() * (peekIV[1] - peekIV[0]) + peekIV[0];
    }
    if(t.aiReposUntil > 0){
      t.aiReposUntil -= ctx.dt;
      out.move = (t.aiReposStrafe || 0);           // 短暂走位（±1），窗口结束自动回到基态 move
      out.turn += (t.aiReposTurnBias || 0);
    } else if(t.aiReposTimer <= 0){
      t.aiReposUntil = 0.6 + Math.random() * 0.8;  // 持续 0.6~1.4s
      t.aiReposStrafe = (Math.random() < 0.5) ? 1 : -1;
      t.aiReposTurnBias = (Math.random() * 2 - 1) * 0.3;
      t.aiReposTimer = Math.random() * (reposIV[1] - reposIV[0]) + reposIV[0];
    }
  }

  // ISSUE 21b：Boss 始终向玩家推进（覆盖任何微观走位/状态位移）
  if(t.isBoss) out.move = 1;

  return out;
}

// 友军据点：消极防御（不追击/不巡逻），只打射程内最近敌人。
// ctx: { enemies:[...], hasLoS(ox,oy,tx,ty) }
// P-51：核心语义提取为 _passiveDefend 共用（Boss hold 模式复用同一路径）。
function aiDecideAlly(t, ctx){
  const targets = ((ctx && ctx.enemies) || []).filter(e => e.hp > 0);
  let best = null, bestD = Infinity;
  for(const e of targets){
    const d = Math.hypot(e.x - t.x, e.y - t.y);
    if(d < bestD){ bestD = d; best = e; }
  }
  return _passiveDefend(t, ctx, best);
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
  module.exports = { aiConfig, aiTierProfile, aiDecideEnemy, aiDecideAlly, aiDecide, aiUpdateStateTimer, alertEntity, propagateAlert, _passiveDefend, _bossStageAIModes };
}