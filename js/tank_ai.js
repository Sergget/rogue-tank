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

// P-46 类别化敌军：按实体类别取行为档案覆盖（RULES.ai.classProfiles）。
// 类别来源：t.tankClass（materializeNode 注入，缺省按 heightClass 启发式回退）。
// 纯函数、可单测：未知类别回退空 profile（medium 基线零修正）。
function aiClassForTank(t){
  const cfg = aiConfig();
  const map = (typeof cfg.classProfiles === 'object' && cfg.classProfiles) ? cfg.classProfiles : {};
  let cls = (t && (t.tankClass || t.class));
  if(!cls){
    // 启发式回退：heavy 车体按重型，轻量无显式标记时视作 medium（保持旧行为零漂移）
    cls = (t && t.heightClass === 'heavy') ? 'heavy' : 'medium';
  }
  return map[cls] || {};
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

// #E7（2026-09-20）反应延迟计算：基线 + 距离项（越远/越接近触发边界越慢）× 档位乘子 × 随机抖动。
// #E7 反应延迟说明：仅对「正式对局生成的敌军」生效（tank_map.makeNode 打标 aiReactEnabled=true），
// 这样 bench/单元测试的裸实体保持原有即时响应语义，避免把「生成期属性」混进决策单测。
function _reactionSeconds(t, cfg, prof, dist, enterD){
  const base = cfg.reactionSecondsBase !== undefined ? cfg.reactionSecondsBase : 1.15;
  const maxS = cfg.reactionSecondsMax !== undefined ? cfg.reactionSecondsMax : 1.9;
  const ratio = (enterD > 0) ? Math.max(0, Math.min(1, dist / enterD)) : 0;
  let s = base + (maxS - base) * ratio * 0.5;
  s *= (prof && prof.reactionMul) || 1;
  const jitter = cfg.reactionJitter !== undefined ? cfg.reactionJitter : 0.25;
  s *= 1 + (Math.random() * 2 - 1) * jitter;
  return Math.max(0.2, s);
}

// #E8（2026-09-20）engage 状态传播：某敌人首次进入接战时，把「已接战 + 已知玩家位置」
// 传播给半径 engagePropagateRadius 内的友邻（按 engagePropagateChance 概率），
// 每跳半径衰减 0.7、最多 2 跳（避免一处暴露唤醒全图）。被传播者各自按反应延迟行动。
function _propagateEngage(t, ctx, cfg){
  const r0 = cfg.engagePropagateRadius !== undefined ? cfg.engagePropagateRadius : 420;
  const chance = cfg.engagePropagateChance !== undefined ? cfg.engagePropagateChance : 0.7;
  const list = (ctx && Array.isArray(ctx.enemies)) ? ctx.enemies : null;
  if(!list || !list.length) return 0;
  const px = (ctx && ctx.player && Number.isFinite(ctx.player.x)) ? ctx.player.x : t.x;
  const py = (ctx && ctx.player && Number.isFinite(ctx.player.y)) ? ctx.player.y : t.y;
  const visited = new Set([t]);
  let frontier = [{ e: t, r: r0 }];
  let count = 0;
  for(let hop = 0; hop < 2; hop++){
    const next = [];
    for(const node of frontier){
      for(const e of list){
        if(!e || visited.has(e) || e.hp <= 0) continue;
        if(e.team !== 'enemy' || e.isBoss) continue;
        if(Math.hypot(e.x - node.e.x, e.y - node.e.y) > node.r) continue;
        if(Math.random() > chance) continue;
        visited.add(e);
        e.aiEngaged = true;
        e.lastKnownPlayerPos = { x: px, y: py };
        if(e.aiReactEnabled === true) {
          e.aiReactT = _reactionSeconds(e, cfg, aiTierProfile(e.aiTier), node.r, Math.max(1, node.r));
        }
        count++;
        next.push({ e: e, r: node.r * 0.7 });
      }
    }
    frontier = next;
    if(!frontier.length) break;
  }
  return count;
}

// 交战带分档键：优先用实体声明的类别（tankClass/class），
// 缺省时按 classProfiles 的来源（aiClassForTank 的启发式）回退。
function _engageBandKey(t, clsProf){
  if(t && t.tankClass) return t.tankClass;
  if(t && t.class) return t.class;
  // aiClassForTank 的启发式：heavy 车体按重型，其余 medium
  return (t && t.heightClass === 'heavy') ? 'heavy' : 'medium';
}

// #N（2026-10-01）交战距离带 + 群体分离力 + flank 侧翼站位 + 装填脱离。
// 与 #M 机动层的关系：#M 负责「怎么走」（轨迹随机化），本组负责「走到哪、谁去、
// 与同伴保持多远」——两者在 aiDecideEnemy 内按顺序叠加。

// --- #N1 交战距离带：取代单点 engageRange ---
// 改前是「dist>engage 前进 / dist<close(200px) 退」，形成 200~520px 全静止的夹逼结构，
// 且 close=200 与车体尺度同量级 ⇒ 退让常被物理互推立刻抵消。改为按类别分档的 [min,max] 区间。
// 返回 { min, max }；engageBand.enabled=false 或配置缺失时回退旧单点语义
//   （min = closeRange, max = engage），保证开关可完整回退。
function _engageBand(t, cfg, engage, bandKey){
  const c = (cfg && cfg.engageBand) || {};
  const close = cfg.closeRange !== undefined ? cfg.closeRange : 200;
  if(c.enabled === false){
    return { min: close, max: engage };
  }
  const bands = c.classBands || {};
  const pick = (bandKey && bands[bandKey]) || c.defaultBand || { minRatio: 0.42, maxRatio: 1.10 };
  const minR = Number.isFinite(pick.minRatio) ? pick.minRatio : 0.42;
  const maxR = Number.isFinite(pick.maxRatio) ? pick.maxRatio : 1.10;
  let min = engage * minR, max = engage * maxR;
  // 保证 min < max（配置写反时不产生死区）
  if(min >= max){ const tmp = min; min = max; max = tmp; }
  // 下界不小于「车体尺度 + 余量」：退让距离小于车长时会被物理互推抵消
  const floorDist = Math.max(60, (t.hullLen || 40) * 2.2);
  if(min < floorDist) min = floorDist;
  return { min: min, max: max };
}

// --- #N4 群体分离力：反「挤成肉球」---
// 物理碰撞 resolveTankCollisions 只会沿连线把敌人推开，靠内侧那辆被直接推向玩家；
// 决策层先叠一层斥力（在移动输出上产生侧向 turn 分量），让它们彼此错开而非叠在一处。
// 返回 -1/0/+1 的转向偏置，供调用方叠加到 out.turn。
function _separationTurn(t, ctx, desired){
  const cfg = aiConfig();
  const c = cfg.separation || {};
  if(c.enabled === false) return 0;
  const radius = Number.isFinite(c.radius) ? c.radius : 180;
  const strength = Number.isFinite(c.strength) ? c.strength : 1;
  const pFactor = Number.isFinite(c.playerFactor) ? c.playerFactor : 0.7;
  const list = (ctx && Array.isArray(ctx.enemies)) ? ctx.enemies : null;
  if(!list || !list.length) return 0;
  // 累加斥力向量（世界系）：单位方向 × 权重
  let ax = 0, ay = 0;
  for(const e of list){
    if(!e || e === t || e.hp <= 0) continue;
    const dx = t.x - e.x, dy = t.y - e.y;
    const d = Math.hypot(dx, dy);
    if(d <= 0 || d >= radius) continue;
    // 越近斥力越强（线性衰减到边界为 0）
    ax += (dx / d) * (1 - d / radius);
    ay += (dy / d) * (1 - d / radius);
  }
  // 玩家斥力（避免围成一圈贴脸）
  const p = ctx && ctx.player;
  if(p && p.hp > 0){
    const dx = t.x - p.x, dy = t.y - p.y;
    const d = Math.hypot(dx, dy);
    // 玩家斥力半径另有更近的倍数（RULES.ai.separation.playerRadiusMul，缺省 0.6 ⇒ 108px）
    const pRadiusMul = Number.isFinite(c.playerRadiusMul) ? c.playerRadiusMul : 0.6;
    const pRadius = radius * pRadiusMul;
    if(d > 0 && d < pRadius){
      ax += (dx / d) * (1 - d / pRadius) * pFactor;
      ay += (dy / d) * (1 - d / pRadius) * pFactor;
    }
  }
  const mag = Math.hypot(ax, ay);
  if(mag < 1e-6) return 0;
  // 斥力方向换算成相对「朝玩家」方向的左右偏置：同向 → turn=+1，反向 → turn=-1
  const sepAngle = Math.atan2(ay, ax);
  const rel = angDiff(sepAngle, desired);
  const bias = rel * Math.min(1, mag * 2) * strength;
  return bias > 0.35 ? 1 : (bias < -0.35 ? -1 : 0);
}

// --- #N3 flank 侧翼站位点 ---
// 改前目标是「自身 + targetRight×300」每帧重算的横向平移（目标点恒在自身右侧 300px，
// 于是原地绕圈），且窗口被 flankMinDist×1.5×flankBias 反向掐死（heavy 上限 360 < engage≈478
// 恒不触发、spg bias=0 被排除）。现改为：以玩家为圆心、按**方位角扇区 + 半径**
// 求出的世界坐标站位点，并配到达判定 ⇒ 真正绕到玩家侧翼。
// bearing 为「玩家→敌人」方位角；side=±1 决定绕向哪一侧。
// flankRadius 由调用方按「交战带外沿 × radiusRatio」算出（**必须落在交战带外**，
//   否则 flank 会把敌人带进带内侧，与 press 交替形成棘轮内移 —— 见 RULES.ai.flankRewrite）。
function _flankStation(p, bearing, flankRadius, side, cfg, seedKey){
  const c = cfg || {};
  const secMin = Number.isFinite(c.sectorMin) ? c.sectorMin : 1.05;
  const secMax = Number.isFinite(c.sectorMax) ? c.sectorMax : 2.10;
  const r = Number.isFinite(flankRadius) ? flankRadius : 520;
  // 扇区角按稳定键取值（避免逐帧抖动导致站位点乱跳）
  const key = (seedKey !== undefined && seedKey !== null) ? String(seedKey) : String(p.id);
  let h = 2166136261 >>> 0;
  for(let i = 0; i < key.length; i++){ h ^= key.charCodeAt(i); h = (h * 16777619) >>> 0; }
  const frac = (h % 10000) / 10000;
  const sector = secMin + (secMax - secMin) * frac;
  const ang = bearing + side * sector;
  return { x: p.x + Math.cos(ang) * r, y: p.y + Math.sin(ang) * r };
}

// flank 站位半径：以**交战带外沿**为基准放大，自动适配各档次（light/heavy/spg 的带宽度不同）。
function _flankRadius(band, cfg){
  const c = cfg || {};
  const mul = Number.isFinite(c.radiusRatio) ? c.radiusRatio : 1.15;
  // radiusRatio 语义 = 相对交战带外沿的倍数（<1 会把敌人带进带内侧 ⇒ 棘轮内移）
  const m = Math.max(1.02, mul);
  return (band && Number.isFinite(band.max) ? band.max : 520) * m;
}

// --- #N6 装填脱离：退到掩体背弹面 ---
// 扩展 #76 C6 的 coverSeek（原条件：重甲 + 血量<60%）。此处在装填期放宽到轻中坦，
// 使「装填中」成为一条独立的战术退避通道，而不是在开阔地互相点名。
// 返回目标点 { x, y } 或 null（无可用掩体 → 调用方静默落回原行为）。
function _retreatReloadSpot(t, p, dist, ctx, cfg){
  const cfgA = aiConfig();
  const c = cfgA.retreatReload || {};
  if(c.enabled === false) return null;
  const minD = Number.isFinite(c.minDist) ? c.minDist : 300;
  const maxD = Number.isFinite(c.maxDist) ? c.maxDist : 760;
  if(dist < minD || dist > maxD) return null;      // 太近（来不及退）/ 太远（没必要退）
  const hpGate = Number.isFinite(c.hpGate) ? c.hpGate : 0;
  if(hpGate > 0){
    const hpRatio = (t.maxHp > 0) ? (t.hp / t.maxHp) : 1;
    if(hpRatio >= hpGate) return null;
  }
  const covers = (ctx && Array.isArray(ctx.covers)) ? ctx.covers : [];
  if(!covers.length) return null;
  const radius = Number.isFinite(c.coverRadius) ? c.coverRadius : 620;
  const margin = Number.isFinite(c.standoffMargin) ? c.standoffMargin : 45;
  // 取「半径内最近且能挡弹的掩体」，站到其背对玩家的一侧
  let best = null, bestD = Infinity;
  for(const cv of covers){
    if(!cv || cv.hp <= 0) continue;
    if(cv.tier !== 'full' && cv.tier !== 'building' && cv.tier !== 'intact' &&
       cv.tier !== 'ruined' && cv.tier !== 'rock' && cv.tier !== 'tree') continue;
    const d = Math.hypot(cv.x - t.x, cv.y - t.y);
    if(d <= radius && d < bestD){ bestD = d; best = cv; }
  }
  if(!best) return null;
  const toP = Math.hypot(p.x - best.x, p.y - best.y) || 1;
  const ux = (p.x - best.x) / toP, uy = (p.y - best.y) / toP;
  const halfDepth = Math.min(best.w || 40, best.h || 40) / 2;
  return { x: best.x - ux * (halfDepth + margin), y: best.y - uy * (halfDepth + margin) };
}

// #M（2026-10-01）接战机动随机化：脚本抽取 + 执行。
// 设计目标（用户反馈「敌人全部尝试贴近玩家」）：
//   单个敌人接近玩家时不再一律直冲，而是按「机动脚本」行动——脚本一次性随机决定
//   机动类型（直线/斜线/曲线/弧线绕行/后撤）、偏角、行程距离与短停时长；
//   走完（或超时/到达重掷距离）后重掷 ⇒ 轨迹与接近节奏不可预测，形成多样化的接战表现。
// 两个纯函数、可独立单测：
//   _maneuverRoll(rng, cfg)              → 新脚本（确定性：rng 注入）
//   _applyManeuver(t, mv, dt, desired)   → { turn, move, aimTolMul }（推进脚本状态）

// 机动脚本字段（挂在 t._mv 上）：
//   mode    — direct | slant | curve | arc | retreat
//   side    — ±1，偏角方向（curve 用它决定偏角渐变方向）
//   angle   — 当前偏角（rad，相对「指向玩家」方向）
//   sweep   — curve 的总偏角变化量（带符号），arc 的固定绕行角
//   dist    — 本脚本的目标行程（px）
//   traveled— 已行进距离（px），达到 dist 即重掷
//   t       — 本脚本已耗时（秒），超过 reRollTimeMax 即重掷
//   hold    — 是否处于短停（短停中不重掷、不换模式）
//   holdT   — 短停剩余秒数
//   aimTolMul — 开火容差乘子（短停结束**当帧**取峰值、随后回常规 ⇒ 开火节奏错开）
const _MV_MODES = ['direct', 'slant', 'curve', 'arc', 'retreat'];

// 可注入 RNG（测试用固定序列 → 确定性验证）。
// 注意：缺省值必须「惰性求值」——若在此处直接存 Math.random 引用，
// 测试/调试对 Math.random 的临时替换将无法影响本层（引用已被提前捕获）。
const _MV_RNG = { value: null };
const _mvRng = () => (typeof _MV_RNG.value === 'function') ? _MV_RNG.value : Math.random;
function _maneuverSetRng(fn){ _MV_RNG.value = (typeof fn === 'function') ? fn : null; }

// 按权重表抽一个机动类型。权重缺省/非法一律回退 direct（保证纯直冲回退路径）。
// reloadGap 为真时叠加「装填期偏置」权重：direct 压低、slant/arc 抬高。
function _maneuverPickMode(rng, cfg, reloadGap){
  const w = (cfg && cfg.weights) || {};
  const g = (cfg && cfg.reloadGapWeights) || {};
  const weightOf = (m) => {
    if(reloadGap && Number.isFinite(g[m])) return g[m];
    const v = Number.isFinite(w[m]) ? w[m] : (m === 'direct' ? 1 : 0);
    return v;
  };
  let total = 0;
  for(const m of _MV_MODES){
    const v = weightOf(m);
    if(v > 0) total += v;
  }
  if(total <= 0) return 'direct';
  let r = rng() * total;
  for(const m of _MV_MODES){
    const v = weightOf(m);
    if(v <= 0) continue;
    r -= v;
    if(r <= 0) return m;
  }
  return 'direct';
}

const _mvRand = (rng, a, b) => {
  const lo = Number.isFinite(a) ? a : 0;
  const hi = Number.isFinite(b) ? b : lo;
  if(hi <= lo) return lo;
  return lo + rng() * (hi - lo);
};

// 抽取一个机动脚本。rng 必传（测试注入确定性 rng，正式走 Math.random）。
// reloadGap 为真时提高 slant/arc 权重、压低 direct 权重 ⇒ 装填期偏侧向躲避机动
// （承接旧 #88 sideSwing 的玩法意图，见 _maneuverReloadGap）。
function _maneuverRoll(rng, cfg, reloadGap){
  const r = typeof rng === 'function' ? rng : Math.random;
  const c = cfg || {};
  const mode = _maneuverPickMode(r, c, reloadGap);
  const side = r() < 0.5 ? -1 : 1;
  const mv = { mode: mode, side: side, angle: 0, sweep: 0, dist: Infinity,
               traveled: 0, t: 0, hold: false, holdT: 0, aimTolMul: 1 };
  if(mode === 'slant'){
    mv.angle = side * _mvRand(r, c.slantAngleMin, c.slantAngleMax);
  } else if(mode === 'curve'){
    mv.angle = side * _mvRand(r, c.curveAngleMin, c.curveAngleMax);
    // sweep 与起始偏角反号 ⇒ 偏角必然穿过 0，轨迹呈 S 形回正到玩家方向（而非单向甩开）
    mv.sweep = -side * _mvRand(r, c.curveSweepMin, c.curveSweepMax);
  } else if(mode === 'arc'){
    mv.angle = side * _mvRand(r, c.arcAngleMin, c.arcAngleMax);
    mv.sweep = 0;
  } else if(mode === 'retreat'){
    mv.dist = _mvRand(r, c.retreatDistMin, c.retreatDistMax);
    // 后撤有独立时限（不跑到反方向太久）
    mv.tMax = _mvRand(r, c.retreatMinT, c.retreatMaxT);
  }
  return mv;
}

// 推进脚本状态一个时间步，返回本帧的行进输出。**同时驱动脚本生命周期**
// （重掷 / 进入短停 / 短停结束），使调用方只需每帧调用一次。
//   out.turn  — 朝「指向玩家 + 当前偏角」转向（±1）
//   out.move  — 前进 / 后退 / 短停时 0（装填期偏置下为 creep 微速）
//   out.aimTolMul — 开火容差乘子（短停结束当帧的放宽峰值，随即回常规，错开开火节奏）
// 说明：短停期间仍可开火（炮塔照常锁敌）——这正是「行进时/短停后开火」两个节奏的来源。
// reloadGap 为真（装填前段）时进入「偏置」：优先侧向机动 + 微速蠕行，
//   取代旧 #88 sideSwing 在普通敌人上的表现（装填期侧摆躲避），见 RULES.ai.maneuver.reloadGap。
// 禁用（cfg.enabled===false）时返回 keepMove 原值 ⇒ 完全退回旧直冲语义。
function _applyManeuver(t, mv, dt, desired, cfg, keepMove, reloadGap){
  const c = cfg || {};
  const out = { turn: 0, move: 0, aimTolMul: 1 };
  if(!c.enabled || !mv){ out.move = keepMove !== undefined ? keepMove : 0; return out; }
  const step = Number.isFinite(dt) && dt > 0 ? dt : (1/60);
  const rng = _mvRng();

  // --- 短停：倒计时结束后重掷脚本，并给一个放宽的开火窗口（开火节奏错开）---
  if(mv.hold){
    mv.holdT -= step;
    if(mv.holdT <= 0){
      // 短停结束：本帧给峰值开火容差，并立刻重掷下一段脚本
      const resumeMul = Number.isFinite(c.resumeAimTolMul) ? c.resumeAimTolMul : 1.8;
      out.aimTolMul = resumeMul;
      const nm = _maneuverRoll(rng, c, reloadGap);
      nm.px = t.x; nm.py = t.y;
      t._mv = nm;
      return out;
    }
    out.move = 0;
    out.turn = 0;          // 短停不摆车体（原地驻停，炮塔仍锁敌）
    return out;
  }

  // --- 偏角演化：curve 在本帧内沿 sweep 线性推进（曲线行进）---
  if(mv.sweep !== 0) mv.angle += mv.sweep * step;
  mv.t += step;

  // --- 行进距离累计（用真实位移，含外部碰撞/避水修正后的结果）---
  if(Number.isFinite(t.x) && Number.isFinite(t.y) && Number.isFinite(mv.px) && Number.isFinite(mv.py)){
    mv.traveled += Math.hypot(t.x - mv.px, t.y - mv.py);
  }
  mv.px = t.x; mv.py = t.y;

  // 转向：朝偏角后的期望方向（direct 模式偏角 0 ⇒ 恒朝玩家，等价旧直冲）
  const heading = desired + mv.angle;
  const hDiff = angDiff(heading, t.hullAngle);
  out.turn = hDiff > 0.05 ? 1 : (hDiff < -0.05 ? -1 : 0);

  // 移动：retreat 反向拉开，其余前进；装填前段压为微速蠕行（替代 #88 侧摆的 move 微降）
  if(mv.mode === 'retreat') out.move = -1;
  else out.move = reloadGap ? ((Number.isFinite(c.reloadGapCreep) ? c.reloadGapCreep : 0.35)) : 1;

  // --- 重掷判定：到达行程距离 / 超时 / 后撤时限 ---
  const rerollDist = Number.isFinite(c.reRollDist) ? c.reRollDist : 90;
  const rerollT = Number.isFinite(c.reRollTimeMax) ? c.reRollTimeMax : 4.5;
  if(mv.traveled >= rerollDist || mv.t >= rerollT || (Number.isFinite(mv.tMax) && mv.t >= mv.tMax)){
    // 按概率进入短停：短停中不动但可开火，给玩家「喘息 + 被打」的可读节奏
    if(_maneuverShouldHold(rng, c)){
      mv.hold = true;
      mv.holdT = _mvRand(rng, c.holdMin, c.holdMax);
      out.move = 0;
      out.turn = 0;
    } else {
      const nm = _maneuverRoll(rng, c, reloadGap);
      nm.px = t.x; nm.py = t.y;
      t._mv = nm;
    }
  }
  return out;
}

// 装填前段判定（#M）：reloadT 超过装填时长 × reloadGapFrac ⇒ 处于「装填期机动偏置」。
// 与旧 #88 sideSwingReloadFrac 同一门槛语义，保持「装填前段才有躲避机动」的既有手感。
function _maneuverReloadGap(t, cfg){
  const c = cfg || {};
  const reloadDur = (t.stats && typeof t.stats.reload === 'number' && t.stats.reload > 0) ? t.stats.reload : 4;
  const frac = Number.isFinite(c.reloadGapFrac) ? c.reloadGapFrac : 0.3;
  return (t.reloadT || 0) > reloadDur * frac;
}

// 判断一个脚本是否应结束后进入短停（holdChance 概率）。
function _maneuverShouldHold(rng, cfg){
  const c = cfg || {};
  const r = typeof rng === 'function' ? rng : Math.random;
  const chance = Number.isFinite(c.holdChance) ? c.holdChance : 0.35;
  return r() < chance;
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

  if(!p || p.hp <= 0){ t.aiState = 'patrol'; t.aiEngaged = false; t._mv = null; return out; }

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
  // P-46：类别行为档案叠加——tier(档位) × class(类别) 乘性合成，类别只带非中性覆盖
  const prof = aiTierProfile(t.aiTier);
  const clsProf = aiClassForTank(t);
  const merged = Object.assign({}, prof, {
    engageMul: (prof.engageMul || 1) * (clsProf.engageMul !== undefined ? clsProf.engageMul : 1),
    aimTolMul: (prof.aimTolMul || 1) * (clsProf.aimTolMul !== undefined ? clsProf.aimTolMul : 1),
    stunResist: !!(prof.stunResist || clsProf.stunResist)
  });
  const profEff = merged;
  const engage = _effectiveEngage(t, cfg, profEff);
  const tol = (cfg.aimTolerance !== undefined ? cfg.aimTolerance : 0.12) * (profEff.aimTolMul || 1);
  // 类别行为开关（供移动/flank 分支消费）
  const clsFlankBias = (clsProf.flankBias !== undefined) ? clsProf.flankBias : 1;
  const clsMoveLock = !!clsProf.moveLock;
  const clsKeepRange = !!clsProf.keepRange;

  // --- 激活触发（#E8 修订）：距离达标 **且** 有视线 ---
  // 有效触发距离：实体字段 aiTriggerDist（生成时按难度算好，见 tank_map.js
  // triggerDistForDifficulty）优先，缺省回退 RULES.ai.triggerDistBase。
  // 滞回防抖：进入阈值 = 有效触发距离；脱离阈值 = 进入阈值 × triggerHysteresis。
  const baseTrig = cfg.triggerDistBase !== undefined ? cfg.triggerDistBase : 700;
  const hyst = cfg.triggerHysteresis !== undefined ? cfg.triggerHysteresis : 1.25;
  const trigDist = (t.aiTriggerDist && t.aiTriggerDist > 0) ? t.aiTriggerDist : baseTrig;
  const enterD = trigDist, exitD = trigDist * hyst;
  if(t.aiEngaged === undefined) t.aiEngaged = false;

  // LoS 评估：激活门控与开火判定共用（patrol 早退路径也做一次射线；有 ctx.hasLoS 缺省 true）
  const los = ctx.hasLoS ? ctx.hasLoS(t.x, t.y, p.x, p.y) : true;
  // #E8：全高掩体（建筑/岩石/树，tier.vision===true）遮挡视线时，敌人不再「进入范围就行动」。
  // 受击/友邻告警（alertEntity 置 aiEngaged + lastKnownPlayerPos）不受此门控限制。
  const needLoS = cfg.engageRequiresLoS !== false;

  if(!t.aiEngaged){
    const inRange = dist <= enterD;
    const canSee = (!needLoS || los) || !!t.lastKnownPlayerPos;
    if(!(inRange && canSee)){
      // #76 C5：激活门控外的 patrol 早退不再全零——微摆动摆头（远处敌人不死板）
      t.aiState = 'patrol';
      out.turn = _patrolWanderTurn(t, ctx);
      if(!t.isBoss) return out;                       // ISSUE 21b：Boss 不回 patrol，继续追击
    } else {
      // 首次进入接战：#E7 设置反应延迟 + #E8 向附近友邻传播 engage 状态
      t.aiEngaged = true;
      if(t.aiReactEnabled === true && !t.isBoss) {
        t.aiReactT = _reactionSeconds(t, cfg, profEff, dist, enterD);
      }
      _propagateEngage(t, ctx, cfg);
    }
  } else if(dist > exitD){                                   // 滞回带内保持接战，超出才脱离
    // 警觉记忆（被击中/友邻告警）：持有 lastKnownPlayerPos 时即使超出滞回带也保持
    // 接战——朝记忆点 search 推进，直到到达附近或重新获得视线后清除（见 LoS/search 分支）。
    if(!t.lastKnownPlayerPos){
      t.aiEngaged = false;
      t.aiState = 'patrol';
      t._mv = null;   // #M：脱离接战即丢弃机动脚本，下次接战重新抽取（避免沿用陈旧偏角）
      out.turn = _patrolWanderTurn(t, ctx);   // #76 C5：同上，脱离接战后微摆动
      if(!t.isBoss) return out;                       // ISSUE 21b：Boss 不回 patrol，继续追击
    }
  }
  t.aiEngaged = true;

  // #E7（2026-09-20）：反应延迟——首次获得目标后先「察觉/起转」，其间只转炮塔、不移动不开火。
  // 受击惊醒（alertEntity）把剩余延迟 ×reactionAlertMul，因此被打醒的敌人明显更快但不瞬发。
  // Boss 不受反应延迟限制（其开场预热由 RULES.boss.openingSeconds 单独承担）。
  if(t.aiReactT > 0){
    const rdt = Number.isFinite(ctx.dt) ? ctx.dt : 1 / 60;
    t.aiReactT = Math.max(0, t.aiReactT - rdt);
    if(!t.isBoss){
      out.turretDesired = desired;   // 炮塔缓慢起转（有可读动作）
      out.move = 0;
      out.fire = false;
      t.aiState = 'react';
      return out;
    }
  }

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

  // 移动：先算「接近意图」（作为机动层基准），再由 #M 机动脚本改写轨迹方向。
  // #N1：接近/脱离的判据由单点 engage/close 改为**按类别分档的交战带** [min,max]。
  const close = cfg.closeRange !== undefined ? cfg.closeRange : 200;
  const band = _engageBand(t, cfg, engage, _engageBandKey(t, clsProf));
  let baseMove = 0;
  if(clsKeepRange && !t.isBoss){
    const hold = band.max * 0.9;   // 定距车：保持在带外沿
    if(dist < hold) baseMove = -1;
    else if(dist > band.max) baseMove = 1;
    else baseMove = 0;
  } else if(dist > band.max) baseMove = 1;                       // 超出带外沿 → 接近
  else if(dist < band.min) baseMove = (t.isBoss || clsMoveLock) ? 0 : -1;   // 进入带内沿 → 脱离（Boss 不后撤；P-46 heavy 绝不后撤）
  else baseMove = 0;                                             // 带内 → 驻停

  // #N3/N2：flank 角色走侧翼站位；press 角色按交战带行动；hold 角色原地驻守。
  const role = (t.aiRole === 'flank') ? 'flank' : (t.aiRole === 'hold' ? 'hold' : 'press');
  if(role === 'hold' && !t.isBoss){
    baseMove = 0;                     // hold：不主动接近
  }

  // #M 接战机动随机化：懒分配脚本 → 每帧推进 → 覆盖 turn/move 并回收开火容差乘子。
  // 不启用：Boss 与定距车（spg keepRange）、hold 角色（本就原地）、带内驻停者。
  // #M 接战机动随机化：懒分配脚本 → 每帧推进 → 覆盖 turn/move 并回收开火容差乘子。
  // 适用边界（#N 修订）：**仅「接近」时**（baseMove > 0）随机化轨迹。
  //   脱离（baseMove < 0）与驻停（=0）必须保持确定性——
  //   ⚠ 缺陷记录：初版仅在 baseMove===0 时保护，导致 baseMove=-1 的退让被机动层的
  //     move=+1 覆盖 ⇒ 敌军「退着退着又贴上来」（由 diagnose-ai-crowd.js 探针实测暴露：
  //     近身圈内敌人数 0.46 → 2.62 恶化）。现收窄为只接管接近。
  const mnvCfg = cfg.maneuver || {};
  const maneuverOn = mnvCfg.enabled !== false && !t.isBoss && !clsKeepRange &&
                     role === 'press' && baseMove > 0;
  // 装填前段 ⇒ 机动进入「装填期偏置」（侧向躲避 + 微速蠕行），承接旧 #88 侧摆意图。
  const reloadGap = maneuverOn ? _maneuverReloadGap(t, mnvCfg) : false;
  // #N 修订：旧微行为（#88 sideSwing / #83 peek / #83 repos）的生效边界。
  //   ⚠ 缺陷记录：初版用「!maneuverOn」做守卫，而 maneuverOn 依赖 baseMove/role（逐帧变化）
  //   ⇒ **驻停/脱离帧 !maneuverOn 为真，旧 repos 重新接管 move** 并随机覆盖成 ±1，
  //   把退让与驻停直接翻成「朝玩家冲」——由 diagnose-ai-crowd.js 探针实测暴露
  //   （末帧明细见 e3：press 角色却停在 131px，远小于带内沿 218px）。
  //   现改为**静态判据**：只有「不参与 #M/#N 新体系」的实体（Boss、SPG 定距车、
  //   或整体关闭机动层）才走旧微行为，其余一律由 交战带 + 角色 + 机动层 决定。
  const legacyMicroOn = t.isBoss || clsKeepRange || mnvCfg.enabled === false;
  let aimTolMul = 1;
  if(maneuverOn){
    if(!t._mv){
      t._mv = _maneuverRoll(_mvRng(), mnvCfg, reloadGap);
      t._mv.px = t.x; t._mv.py = t.y;
    }
    const mvOut = _applyManeuver(t, t._mv, ctx && ctx.dt, desired, mnvCfg, baseMove, reloadGap);
    out.turn = mvOut.turn;
    out.move = mvOut.move;
    aimTolMul = mvOut.aimTolMul;
  } else {
    out.turn = hullDiff > 0.05 ? 1 : (hullDiff < -0.05 ? -1 : 0);
    out.move = baseMove;
  }
  const tolEff = tol * aimTolMul;

  // #N3：flank 角色驶向侧翼站位（取代改前的每帧横向平移），到位即转 press。
  // ⚠ 缺陷记录：初版每帧用「当前玩家→敌人方位角」重算站位点 —— 敌人一移动方位角就变，
  //   目标点随之绕玩家旋转，敌人等于在追一个**绕自己转的点**，实测呈螺旋内收，
  //   最终贴到交战带内沿（由 diagnose-ai-crowd.js 探针暴露：press 角色却停在 273px）。
  //   现改为**进入 flank 时锁定一次站位点**（t._flankTarget），敌人直线驶向定点，
  //   到达或角色变更即清除 —— 这才是「绕到侧翼站位」的正确语义。
  if(role === 'flank' && !t.isBoss){
    const fcfg = cfg.flankRewrite || {};
    if(fcfg.enabled !== false && los){
      if(!t._flankTarget){
        const bearing = Math.atan2(t.y - p.y, t.x - p.x);     // 玩家→敌人方位角（仅入场取一次）
        const side = t._flankSide || (t._flankSide = (String(t.id || 'e').charCodeAt(0) % 2) ? -1 : 1);
        t._flankTarget = _flankStation(p, bearing, _flankRadius(band, fcfg), side, fcfg, t.id);
      }
      const station = t._flankTarget;
      const arrive = Number.isFinite(fcfg.arriveDist) ? fcfg.arriveDist : 70;
      const dStation = Math.hypot(station.x - t.x, station.y - t.y);
      if(dStation > arrive){
        const flankHeading = Math.atan2(station.y - t.y, station.x - t.x);
        out.turn = angDiff(flankHeading, t.hullAngle) > 0.05 ? 1
                 : (angDiff(flankHeading, t.hullAngle) < -0.05 ? -1 : 0);
        out.move = 1;
      } else {
        t.aiRole = 'press';       // 到位：转入压上
        t._flankTarget = null;
        out.move = 0;
      }
      out.turretDesired = desired;   // 炮塔全程锁敌（绕行中仍可还击）
    }
  } else if(t._flankTarget){
    t._flankTarget = null;           // 角色不再是 flank → 清除锁定站位点（下次进入重新锁定）
  }

  // #N4：群体分离力 —— 在转向输出上叠加侧向偏置，使同伴彼此错开而非叠成一团。
  // ⚠ 边界（探针实测修订）：**只对 press 的压上机动生效**。若叠加到 flank 的定点机动上，
  //   转向被反复改写会使敌人无法进入站位点到位圈（arriveDist），于是持续 move=1 螺旋
  //   内收、最终贴到玩家身上（diagnose-ai-crowd.js 实测：近身圈内敌人数恶化到 2.4）。
  if(out.move !== 0 && role === 'press' && cfg.separation && cfg.separation.enabled !== false){
    const sep = _separationTurn(t, ctx, desired);
    if(sep !== 0) out.turn = (out.turn === 0) ? sep : out.turn;
  }

  // #N6：装填脱离 —— 装填期中距离退到掩体背弹面（扩展 #76 C6 coverSeek 的触发面）。
  let rrArrive = false;
  if(!t.isBoss && t.reloadT > 0){
    const spot = _retreatReloadSpot(t, p, dist, ctx, cfg);
    if(spot){
      const d = Math.hypot(spot.x - t.x, spot.y - t.y);
      if(d > 60){
        const h = Math.atan2(spot.y - t.y, spot.x - t.x);
        out.turn = angDiff(h, t.hullAngle) > 0.05 ? 1 : (angDiff(h, t.hullAngle) < -0.05 ? -1 : 0);
        out.move = 1;
      } else {
        out.move = 0;
        rrArrive = true;          // 已就位：原地还击
      }
      out.turretDesired = desired;
    }
  }

  // 开火：炮塔大致对准 + 视线畅通（触发段已算好 los）+ 装填好 + 在接战距离内
  // tol 已按档位 aimTolMul 收紧（#76 B），并按 #M 短停结束窗口放宽（错开开火节奏）
  const aimErr = Math.abs(angDiff(t.turretAngle, desired));
  let canFire = (aimErr < tolEff && los && dist <= band.max && t.reloadT <= 0);
  // #N2：hold 角色走「有把握的射界」门控（远距离纯待机，近距离放宽容差）。
  // holdGate 由 js/tank_ai_squad.js 提供；单独 require 本模块（Node 单测）时缺失 → 跳过门控。
  if(canFire && role === 'hold' && !t.isBoss && !rrArrive && typeof holdGate === 'function'){
    const hg = holdGate(t, dist, tol, p);
    canFire = hg.fire;
  }
  if(canFire) out.fire = true;

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
                        + (profEff.stunResist ? 0.2 : 0);   // #76 B：抗晕档阈值上调（含类别 heavy 抗晕）
  const stunProb = (cfg.dazedProbability !== undefined ? cfg.dazedProbability : 0.3)
                   * (profEff.stunResist ? 0.5 : 1);          // #76 B：抗晕档随机 daze 概率减半
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

  // 2) Flank：绕行进攻（旧实现）。
  // #N3 起由上方「flank 角色 → 侧翼站位」接管（真正的绕后站位 + 到达判定），
  // 本分支仅在 flankRewrite.enabled=false 时作为**回退路径**保留：
  // 旧逻辑的窗口被 flankMinDist×1.5×flankBias 反向掐死（heavy 恒不触发、spg 被排除），
  // 且目标点是「自身 + targetRight×flankDist」每帧重算的横向平移，非绕后站位。
  const flankRewritten = (cfg.flankRewrite || {}).enabled !== false;
  if(state !== 'stunned' && !flankRewritten){
    const flankMinDist = cfg.flankMinDist !== undefined ? cfg.flankMinDist : 400;
    // 仅在距离>engage（原本不会开火）且< flankMinDist×1.5×flankBias 时才尝试 flank；P-46 类别侧向倾向调制
    const canFlank = dist > engage && dist < flankMinDist * 1.5 * Math.max(0, clsFlankBias) && los
                     && clsFlankBias > 0;
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
  if(state === 'patrol' && legacyMicroOn && ctx && Number.isFinite(ctx.dt)){
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
  if(state === 'patrol' && legacyMicroOn && ctx && Number.isFinite(ctx.dt)){
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

// --- 绕水转向（2026-09-14 水域行为重做） ---
// 水域不再硬阻断（passability 0.4 + 完全浸入溺毙 8s），AI 必须主动绕开：
// 在决策输出 (turn, move) 上叠加避水修正——
//   1. 前向探点（t 位置沿 hullAngle 前进 waterProbeDist）入水且任一侧探点为干地
//      → turn 转向干地侧（覆盖原 turn，move 保持前进 = 沿岸绕行）；
//   2. 前向 + 双侧探点全水 → move=0 停驶（防 AI 直冲水域自杀溺毙）；
//   3. 前向干地 → 输出原样返回（零行为漂移）。
// 探点是否"入水"由 ctx.covers 注入 + 本模块内置 point-in-OBB 测试（纯函数、可单测）；
// covers 缺失 / tier 表缺失时原样返回（不引入行为变化）。
function applyWaterAvoidance(t, out, ctx){
  if(!out || out.move <= 0) return out;                       // 停车/倒车不探
  const coversArr = (ctx && Array.isArray(ctx.covers)) ? ctx.covers : null;
  if(!coversArr || !coversArr.length) return out;
  const cfg = aiConfig();
  const probeDist = cfg.waterProbeDist !== undefined ? cfg.waterProbeDist : 140;
  const probeAng = cfg.waterProbeAngle !== undefined ? cfg.waterProbeAngle : 0.6;
  // 入水判定：点位于任一 water/river tier 覆盖的 OBB（或 collisionVerts 多边形）内
  const isWaterAt = (x, y) => {
    for(const c of coversArr){
      if(!c || c.hp <= 0) continue;
      if(c.tier !== 'water' && c.tier !== 'river') continue;
      if(c.verts || c.collisionVerts){
        // 局部多边形点测（与 tank_map.pointInCoverPoly 同构，本模块自包含）
        const vs = c.collisionVerts || c.verts;
        const dx = x - c.x, dy = y - c.y;
        const ang = -(c.angle || 0);
        const ca = Math.cos(ang), sa = Math.sin(ang);
        const lx = dx * ca - dy * sa, ly = dx * sa + dy * ca;
        let inside = false;
        for(let i = 0, j = vs.length - 1; i < vs.length; j = i++){
          const xi = vs[i][0], yi = vs[i][1], xj = vs[j][0], yj = vs[j][1];
          if(((yi > ly) !== (yj > ly)) && (lx < (xj - xi) * (ly - yi) / (yj - yi) + xi)) inside = !inside;
        }
        if(inside) return true;
      } else {
        const dx = x - c.x, dy = y - c.y;
        const ang = -(c.angle || 0);
        const ca = Math.cos(ang), sa = Math.sin(ang);
        const lx = dx * ca - dy * sa, ly = dx * sa + dy * ca;
        if(Math.abs(lx) <= (c.w || 0) / 2 && Math.abs(ly) <= (c.h || 0) / 2) return true;
      }
    }
    return false;
  };
  const fx = Math.cos(t.hullAngle), fy = Math.sin(t.hullAngle);
  const px = -fy, py = fx;                                    // 车体右侧法向
  const ahead = { x: t.x + fx * probeDist, y: t.y + fy * probeDist };
  if(!isWaterAt(ahead.x, ahead.y)) return out;                // 前路干燥：不干预
  const leftPt  = { x: t.x + (fx * Math.cos(-probeAng) - fy * Math.sin(-probeAng)) * probeDist,
                    y: t.y + (fx * Math.sin(-probeAng) + fy * Math.cos(-probeAng)) * probeDist };
  const rightPt = { x: t.x + (fx * Math.cos(probeAng) - fy * Math.sin(probeAng)) * probeDist,
                    y: t.y + (fx * Math.sin(probeAng) + fy * Math.cos(probeAng)) * probeDist };
  const leftFree = !isWaterAt(leftPt.x, leftPt.y);
  const rightFree = !isWaterAt(rightPt.x, rightPt.y);
  if(leftFree && !rightFree){ out.turn = -1; }                // 左干 → 左转
  else if(rightFree && !leftFree){ out.turn = 1; }            // 右干 → 右转
  else if(!leftFree && !rightFree){ out.move = 0; }           // 三向全水 → 停驶
  // 两侧都干：保持原 turn（朝目标方向本身就在绕），仅防直冲（已满足：前向有水会持续修正）
  return out;
}

// 通用分发：ally 走消极防御，其余（enemy/Boss/召唤物）走多态状态机。
// 敌对决策输出统一叠加绕水修正（2026-09-14：水域能淹死 AI，寻路必须绕开）。
function aiDecide(t, ctx){
  if(t.team === 'ally') return aiDecideAlly(t, ctx);
  return applyWaterAvoidance(t, aiDecideEnemy(t, ctx), ctx);
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
// 2026-09-14 定案（任何伤害来源被击中即转换状态）：Boss 处于 hold 消极驻守阶段时
//   被命中 → 立即解除 stageAI 驻守覆盖，回落主动状态机（追击/搜索玩家）。
// 返回 true 表示该实体被警觉。
function alertEntity(t, srcX, srcY){
  if(!t || t.team !== 'enemy' || t.isDrone || t.hp <= 0) return false;
  t.aiEngaged = true;
  t.lastKnownPlayerPos = { x: srcX, y: srcY };
  // #E7（2026-09-20）：被打醒的敌人反应更快（剩余反应延迟 ×reactionAlertMul），但不瞬发。
  if(t.aiReactT > 0){
    const cfg = aiConfig();
    const mul = cfg.reactionAlertMul !== undefined ? cfg.reactionAlertMul : 0.5;
    t.aiReactT *= mul;
  }
  if(t.aiState === 'stunned'){
    t.aiState = 'patrol';       // 被击中立即惊醒（不给免疫窗——免疫窗只在自然苏醒后授予）
    t.aiStateTimer = 0;
  }
  // Boss hold 驻守被打破：被击中即放弃原地驻守，转入主动追击/搜索
  if(t.isBoss && t.stageAI && t.stageAI.mode === 'hold'){
    t.stageAI = null;
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
  module.exports = { aiConfig, aiTierProfile, aiClassForTank, aiDecideEnemy, aiDecideAlly, aiDecide, aiUpdateStateTimer, alertEntity, propagateAlert, applyWaterAvoidance, _passiveDefend, _bossStageAIModes, _reactionSeconds, _propagateEngage, _maneuverRoll, _applyManeuver, _maneuverShouldHold, _maneuverPickMode, _maneuverSetRng, _MV_MODES, _engageBand, _engageBandKey, _separationTurn, _flankStation, _flankRadius, _retreatReloadSpot, _maneuverReloadGap };
}