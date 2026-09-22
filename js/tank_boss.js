'use strict';

// tank_boss.js — Boss 系统（数据驱动，P-09 / DEVELOPMENT.md §2.14）。
// 纯逻辑模块：无 DOM / Canvas 依赖，Node 可测（module.exports 底部导出）。
//
// 定位（贴 FTL 多阶段 Boss + Into the Breach 弱点机制，DEVELOPMENT.md §2.14）：
// Boss = 特殊坦克配置（几何/装甲/机动）+ 数据驱动多阶段机制——阶段由血量阈值划分，
// 每阶段可声明不同行为、弱点模块（weakspots）与进入时触发的 modifier 变化；击败后掉落。
// 阶段切换的「行为脚本」为声明式描述 + 可选的 onEnter modifiers，具体行为参数在接入层
// （AI/Boss 控制器）消费；本模块只负责 schema、校验、阶段判定与掉落。

// 弱点模块枚举（与 tank_model.js moduleFromHit 的模块 key 一致，另加 track 履带）
const BOSS_WEAKSPOT_KEYS = ['driver', 'ammo', 'engine', 'gunner', 'loader', 'commander', 'track', 'breech'];

// 掉落卡牌稀有度（loot.cardRarity）
// #E13（2026-09-20）：新增「神话」档（在传奇之上），与 tank_cards.CARD_RARITIES 同序。
const LOOT_RARITIES = ['common', 'rare', 'epic', 'legendary', 'mythic'];

// #91 顶层行为风格枚举（boss.behavior.style）——数据驱动差异化打法，
// 运行时由 updateBossBehavior 消费；stages[].ai.mode 枚举保持不变（AI 接战锁定在 tank_ai.js）。
const BOSS_BEHAVIOR_STYLES = ['command', 'fortify', 'crush', 'skirmish_long', 'weave'];

// ---------- 校验 ----------

// 校验单个 Boss，返回错误字符串数组（空数组 = 合法）。
function validateBoss(boss) {
  const errs = [];
  if (!boss || typeof boss !== 'object') return ['boss 不是对象'];
  if (!boss.id || typeof boss.id !== 'string') errs.push('id 缺失/非字符串');
  if (!boss.name || typeof boss.name !== 'string') errs.push('name 缺失');
  if (!Array.isArray(boss.stages) || boss.stages.length < 1) {
    errs.push('stages 应为非空数组');
  } else {
    for (let i = 0; i < boss.stages.length; i++) {
      errs.push(...validateBossStage(boss.stages[i], i));
    }
    // 阶段阈值连续性：首段 hpFrom=1、末段 hpTo=0、相邻首尾衔接
    const s = boss.stages;
    if (s[0].hpFrom !== 1) errs.push('首阶段 hpFrom 应为 1');
    if (s[s.length - 1].hpTo !== 0) errs.push('末阶段 hpTo 应为 0');
    for (let i = 0; i < s.length - 1; i++) {
      if (s[i].hpTo !== s[i + 1].hpFrom) errs.push(`阶段 ${i} 与 ${i + 1} 阈值不衔接（${s[i].hpTo} ≠ ${s[i + 1].hpFrom}）`);
    }
  }
  if (boss.loot !== undefined) {
    if (typeof boss.loot !== 'object') errs.push('loot 应为对象');
    else {
      if (boss.loot.score !== undefined && (typeof boss.loot.score !== 'number' || boss.loot.score < 0)) errs.push('loot.score 应为非负数');
      if (boss.loot.cardRarity !== undefined && !LOOT_RARITIES.includes(boss.loot.cardRarity)) errs.push(`loot.cardRarity 非法: ${boss.loot.cardRarity}`);
      if (boss.loot.cards !== undefined && (!Number.isInteger(boss.loot.cards) || boss.loot.cards < 0)) errs.push('loot.cards 应为非负整数');
    }
  }
  if (boss.summons !== undefined) {
    if (!Array.isArray(boss.summons)) errs.push('summons 应为数组');
    else for (const sm of boss.summons) {
      if (!sm || typeof sm.tankId !== 'string') errs.push('summons 项缺 tankId');
    }
  }
  // 可选 boss 调参块（默认取自 RULES.boss.tuning，由各 boss 文件覆盖）
  if (boss.tuning !== undefined) {
    if (!boss.tuning || typeof boss.tuning !== 'object' || Array.isArray(boss.tuning)) {
      errs.push('tuning 应为对象');
    } else {
      const TUN_KEYS = ['hpMul', 'moveMul', 'turnMul', 'turretTurnMul', 'shellMul', 'fireRateMul', 'dmgMul', 'penMul'];
      for (const k of TUN_KEYS) {
        if (boss.tuning[k] !== undefined && typeof boss.tuning[k] !== 'number') {
          errs.push(`tuning.${k} 应为数值`);
        }
      }
    }
  }
  // #91 顶层行为块（可选）：style 白名单 + 子结构数值合法性（递归校验）。
  if (boss.behavior !== undefined) {
    errs.push(...validateBossBehavior(boss.behavior));
  }
  return errs;
}

function validateBossStage(stage, idx) {
  const errs = [];
  const p = `stages[${idx}]`;
  if (!stage || typeof stage !== 'object') return [`${p}: 不是对象`];
  if (!stage.id || typeof stage.id !== 'string') errs.push(`${p}: 缺 id`);
  if (typeof stage.hpFrom !== 'number' || typeof stage.hpTo !== 'number') {
    errs.push(`${p}: hpFrom/hpTo 应为数值`);
  } else if (!(stage.hpFrom > stage.hpTo)) {
    errs.push(`${p}: hpFrom 应大于 hpTo（${stage.hpFrom} vs ${stage.hpTo}）`);
  }
  if (stage.hpFrom < 0 || stage.hpTo < 0 || stage.hpFrom > 1 || stage.hpTo > 1) {
    errs.push(`${p}: 阈值应在 [0,1]`);
  }
  if (stage.weakspots !== undefined) {
    if (!Array.isArray(stage.weakspots)) errs.push(`${p}: weakspots 应为数组`);
    else for (const w of stage.weakspots) if (!BOSS_WEAKSPOT_KEYS.includes(w)) errs.push(`${p}: weakspot 非法 ${w}`);
  }
  // 阶段 AI 行为（可选，P-51）：mode ∈ hold/charge/skirmish；params 若存在必须是对象（接入层消费）。
  if (stage.ai !== undefined) {
    if (!stage.ai || typeof stage.ai !== 'object' || Array.isArray(stage.ai)) {
      errs.push(`${p}: ai 应为对象`);
    } else {
      const AI_MODES = ['hold', 'charge', 'skirmish'];
      if (!AI_MODES.includes(stage.ai.mode)) errs.push(`${p}: ai.mode 非法 ${stage.ai.mode}`);
      if (stage.ai.params !== undefined && (typeof stage.ai.params !== 'object' || Array.isArray(stage.ai.params))) {
        errs.push(`${p}: ai.params 应为对象`);
      }
    }
  }
  return errs;
}

// 校验 boss.behavior（#91）：style ∈ BOSS_BEHAVIOR_STYLES；barrage/contact/charge 参数数值合法。
function validateBossBehavior(b) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) return ['behavior 应为对象'];
  const errs = [];
  const num = (v) => typeof v === 'number' && isFinite(v);
  if (!BOSS_BEHAVIOR_STYLES.includes(b.style)) errs.push(`behavior.style 非法 ${b.style}`);
  if (b.barrage !== undefined) {
    if (!b.barrage || typeof b.barrage !== 'object' || Array.isArray(b.barrage)) {
      errs.push('behavior.barrage 应为对象');
    } else {
      const g = b.barrage;
      if (g.shots !== undefined && (!Number.isInteger(g.shots) || g.shots < 1)) errs.push('behavior.barrage.shots 应为正整数');
      for (const k of ['delay', 'interval', 'radius', 'dmgMult']) {
        if (g[k] !== undefined && (!num(g[k]) || g[k] <= 0)) errs.push(`behavior.barrage.${k} 应为正数`);
      }
    }
  }
  if (b.contact !== undefined) {
    if (!b.contact || typeof b.contact !== 'object' || Array.isArray(b.contact)) {
      errs.push('behavior.contact 应为对象');
    } else {
      const c = b.contact;
      if (c.dmg !== undefined && (!num(c.dmg) || c.dmg < 0)) errs.push('behavior.contact.dmg 应为非负数');
      if (c.knockback !== undefined && (!num(c.knockback) || c.knockback < 0)) errs.push('behavior.contact.knockback 应为非负数');
      if (c.cd !== undefined && (!num(c.cd) || c.cd <= 0)) errs.push('behavior.contact.cd 应为正数');
    }
  }
  for (const k of ['chargeInterval', 'chargeSpeed']) {
    if (b[k] !== undefined && (!num(b[k]) || b[k] <= 0)) errs.push(`behavior.${k} 应为正数`);
  }
  return errs;
}

// ---------- 阶段判定 ----------

// 由血量比例（0~1）判定当前阶段（返回阶段对象；比例越界时钳制到首/末阶段）。
function bossStageFor(boss, hpRatio) {
  const stages = boss.stages;
  const r = Math.max(0, Math.min(1, hpRatio));
  for (const st of stages) {
    if (r > st.hpTo) return st; // 落在 [hpTo, hpFrom) 区间（hpFrom 严格大于 hpTo，边界 hpFrom 属于本段）
  }
  return stages[stages.length - 1];
}

// 当前阶段索引（用于阶段切换检测与日志）
function bossStageIndex(boss, hpRatio) {
  return boss.stages.indexOf(bossStageFor(boss, hpRatio));
}

// 是否仍在指定阶段 id（方便接入层做「进入阶段 X」的一次性触发）
function bossInStage(boss, hpRatio, stageId) {
  const st = bossStageFor(boss, hpRatio);
  return st && st.id === stageId;
}

// 当前阶段对象（非 Boss/无数据返回 null）。
// 用 hp/maxHp 计算血量比例（防护除零/缺失），再经 bossStageFor 判定。
function bossCurrentStage(entity) {
  if (!entity || !entity.boss || !Array.isArray(entity.boss.stages) || entity.boss.stages.length === 0) return null;
  const hpRatio = (typeof entity.hp === 'number' && entity.maxHp > 0) ? entity.hp / entity.maxHp : 0;
  return bossStageFor(entity.boss, hpRatio);
}

// 命中模块是否为当前阶段弱点（moduleKey 用 moduleFromHit 的 key；'track' 已在 BOSS_WEAKSPOT_KEYS）。
// 非 Boss 实体 / 无 stages 数据一律返回 false。
function isWeakspotHit(entity, moduleKey) {
  if (!entity || !entity.boss || !Array.isArray(entity.boss.stages)) return false;
  const st = bossCurrentStage(entity);
  return !!(st && Array.isArray(st.weakspots) && st.weakspots.includes(moduleKey));
}

// ---------- 运行时：Boss 实体生成与阶段触发 ----------

// 生成 Boss 实体。env 注入（浏览器传 spawnTank/applyTankConfig；Node 测试传 fake）：
//   env.spawnTank(spec)      —— 生成基础实体（spec 含 id/team/x/y/hullAngle/turretAngle/heightClass）
//   env.configureTank(t, id) —— 应用 tanks/<id>.json 配置（含重置 hp 到满血）
// 返回带 boss 元数据 + 已应用首阶段 modifiers 的实体。
function makeBossEntity(boss, env) {
  const t = env.spawnTank({
    id: 'boss_' + boss.id,
    team: 'enemy',
    x: 0, y: 0,
    hullAngle: Math.PI, turretAngle: Math.PI,
    heightClass: 'heavy'
  });
  if (typeof env.configureTank === 'function') env.configureTank(t, boss.tankId || 'dummy');
  // (a) 几何缩放：让 boss.scale 真正生效（此前是死字段）。
  // 注意：不缩放 t.barrel.len，炮管长度已随 turret 尺寸（turLen）缩放。
  const s = boss.scale || 1;
  if (s !== 1) {
    t.hullLen *= s; t.hullWid *= s;
    t.turLen *= s;  t.turWid *= s;
    if (t.hullSpec)   t.hullSpec.verts   = t.hullSpec.verts.map(([x,y]) => [x*s, y*s]);
    if (t.turretSpec) t.turretSpec.verts = t.turretSpec.verts.map(([x,y]) => [x*s, y*s]);
    // #B6：整体替换为全新对象，绝不原地写（t.turretPivotOffset / anchors[k] 可能仍与
    // 共享的 tanks/*.json spec 同引用——原地 *= 会把 ×s 永久写回配置缓存，使后续所有
    // 同型实体（含玩家）跨节点累积前移）。
    if (t.turretPivotOffset) {
      t.turretPivotOffset = { dx: (t.turretPivotOffset.dx || 0) * s, dy: (t.turretPivotOffset.dy || 0) * s };
    }
    if (t.anchors) {
      const na = {};
      for (const k in t.anchors) {
        const a = t.anchors[k];
        na[k] = (a && typeof a === 'object') ? { dx: (a.dx || 0) * s, dy: (a.dy || 0) * s } : a;
      }
      t.anchors = na;
    }
    if (t.trackWidth  !== undefined) t.trackWidth  *= s;
    if (t.trackOffset !== undefined) t.trackOffset *= s;
  }
  // (b) Boss 调参：偏离同难度普通单位（血厚/伤害高/射速快，但机动/弹速低）。
  // 难度基线由另一 specialist 稍后调用 applyDifficultyMults 叠加（并重置满血）。
  const tun = boss.tuning || (RULES.boss && RULES.boss.tuning) || {};
  const map = { maxHp:'hpMul', maxSpeed:'moveMul', turnRate:'turnMul',
                turretTurnRate:'turretTurnMul', shellSpeed:'shellMul',
                reload:'fireRateMul', damage:'dmgMul' };
  for (const stat in map) if (tun[map[stat]] !== undefined)
    addModifier(t, { stat, mode:'mult', value: tun[map[stat]], source:'boss-base', scope:'run' });
  // #91 Boss 基础穿深增益：tun.penMul（boss 级覆盖）→ RULES.boss.tuning.penMul（tank-model 提供）→ 缺省 1.4。
  const penMul = tun.penMul !== undefined ? tun.penMul
    : (RULES.boss && RULES.boss.tuning && RULES.boss.tuning.penMul !== undefined ? RULES.boss.tuning.penMul : 1.4);
  addModifier(t, { stat:'penetration', mode:'mult', value: penMul, source:'boss-base', scope:'run' });
  // 满血出生（configureTank 可能重置 hp；boss 以 stats.maxHp 为准）
  if (t.stats && t.stats.maxHp) { t.maxHp = t.stats.maxHp; t.hp = t.stats.maxHp; }
  t.isBoss = true;
  t.boss = boss;
  t.stageId = null;
  t.scale = boss.scale || 1;
  // #91 行为风格：顶层 behavior 存到实体（AI 接入层 / updateBossBehavior 消费）+ 初始化行为计时器。
  if (boss.behavior && typeof boss.behavior === 'object') {
    t.bossStyle = boss.behavior.style || null;
    t.bossBehavior = boss.behavior;
    if (boss.behavior.barrage) t.barrageCdT = boss.behavior.barrage.interval || 0; // 首轮炮击延迟 = interval
    t.chargeTimerT = boss.behavior.chargeInterval || 0;                            // weave 首次冲刺前摇
    t.contactCdT = 0;                                                              // 碾压接触无初始冷却
  }
  // (c) 出生即交战：无限 trigger 半径 + 已 engaged，防被玩家放风筝（node-map boss 快路径始终追击）。
  t.aiTriggerDist = (RULES.boss && RULES.boss.tuning && RULES.boss.tuning.engageDist) || 99999;
  t.aiEngaged = true;
  t.aiState = 'chase';
  // #E9（2026-09-20）：开场「展开/预热」窗口——期间炮塔持续扫描（有可读动作），不站桩。
  const openCfg = (RULES.boss && RULES.boss) || {};
  t.bossOpeningT = openCfg.openingSeconds !== undefined ? openCfg.openingSeconds : 1.6;
  t.bossHitReactT = 0;
  t.bossHitReactCdT = 0;
  t.bossLaserCdT = openCfg.laser && openCfg.laser.chargeSeconds !== undefined ? openCfg.laser.chargeSeconds * 2 : 5;
  t.bossSummonWavesDone = [];
  if (boss.stages && boss.stages.length) applyBossStage(t, boss.stages[0]);
  return t;
}

// 应用阶段：移除上一阶段 modifiers（source=boss-stage:<旧id>）→ 记录新阶段 → 叠加 onEnter.modifiers。
// #E9（2026-09-20）：阶段机动类倍率受 RULES.boss.stageSpeedCapMul 上限约束——
// 用户反馈「残血后行动速度太快」：bosses/*.json 各阶段 onEnter 的 maxSpeed/turnRate/turretTurnRate
// 倍率过猛，这里对「相对 boss 基准」的连乘结果做硬上限（超限即钳到上限）。
function applyBossStage(entity, stage) {
  if (entity.stageId && entity.stageId !== stage.id && typeof removeModifierBySource === 'function') {
    removeModifierBySource(entity, 'boss-stage:' + entity.stageId);
  }
  entity.stageId = stage.id;
  entity.stageAI = stage.ai || null; // 当前阶段 AI 行为（接入层消费；旧阶段切换时自然覆盖）
  const caps = (RULES.boss && RULES.boss.stageSpeedCapMul) || {};
  const capKey = { maxSpeed: 'maxSpeed', turnRate: 'turnRate', turretTurnRate: 'turretTurnRate' };
  const mods = (stage.onEnter && stage.onEnter.modifiers) || [];
  for (const m of mods) {
    if (typeof addModifier === 'function') {
      let value = m.value;
      // 只钳「乘性机动增强」：mode==='mult' 且值 >1 且属于被约束的属性
      if (m.mode === 'mult' && typeof value === 'number' && value > 1 && capKey[m.stat] && caps[m.stat] !== undefined) {
        value = Math.min(value, caps[m.stat]);
      }
      addModifier(entity, { stat: m.stat, mode: m.mode, value: value, source: 'boss-stage:' + stage.id, scope: 'run' });
    }
  }
}

// 按当前血量比例判定阶段；跨阶段时自动 applyBossStage，返回 { changed, from, to, stage }。
function updateBossStage(entity) {
  if (!entity.boss || !entity.boss.stages || entity.boss.stages.length === 0) return { changed: false, stage: null };
  const hpRatio = entity.maxHp > 0 ? entity.hp / entity.maxHp : 0;
  const stage = bossStageFor(entity.boss, hpRatio);
  if (stage.id !== entity.stageId) {
    const from = entity.stageId;
    applyBossStage(entity, stage);
    return { changed: true, from: from, to: stage.id, stage: stage };
  }
  return { changed: false, stage: stage };
}

// ================= 2026-09-20 #E9：Boss 修订（用户反馈批次） =================
// 1) 分波次召唤：boss.summons 不再一次性投放，按血量阈值分波（见 bossSummonWave）。
// 2) 早期行动：开场 openingSeconds 内炮塔持续扫描（有可读动作），不站桩。
// 3) 受击反馈：命中触发短暂顿挫（timed maxSpeed 乘子）+ 炮塔抖动（见 triggerBossHitReact）。
// 4) 残血减速：applyBossStage 对阶段机动倍率施加上限（RULES.boss.stageSpeedCapMul）。
// 5) 蓄能激光：updateBossLaser —— 蓄能期炮塔转速大幅下降 + 炮线警示带；射击期持续掉血。

// 单点光束命中判定：点到射线段的距离是否 ≤ 半宽
function _beamDist(px, py, ox, oy, ux, uy, len) {
  const wx = px - ox, wy = py - oy;
  let t = wx * ux + wy * uy;
  t = Math.max(0, Math.min(len, t));
  return Math.hypot(px - (ox + ux * t), py - (oy + uy * t));
}

// #G（2026-09-21）默认召唤池回退：正式 Boss（带 id 的 bosses/*.json）若漏写 summons，
// 旧实现直接 `return null` ⇒ 整场**永不召唤任何敌人**（用户反馈「部分 boss 没有召唤敌人」的
// 根因之一：siege_fort / sniper / twin_track 三个 Boss 无 summons 字段）。
// 现行口径：list 为空且该实体是正式 Boss → 使用 cfg.defaultPool（单一 dummy 单位 ×3 波），
// 保证「每个 Boss 至少有随从」这条设计不变量；非正式 Boss（单测裸实体）保持不召唤。
function _summonListFallback(t, cfg) {
  const pool = Array.isArray(cfg.defaultPool) ? cfg.defaultPool : null;
  if (!pool || !pool.length) return [];
  const waves = cfg.defaultWaves !== undefined ? cfg.defaultWaves : 3;
  // 波次阈值：首波开场即触发（hpFrom 1.0），其余沿用默认 hpFrom（0.5 / 0.25 段）
  const def = cfg.hpFrom || [0.75, 0.5, 0.25];
  const out = [];
  for (let i = 0; i < waves; i++) {
    const src = pool[i % pool.length];
    out.push(Object.assign({}, src, {
      hpFrom: (i === 0) ? 1.0 : (def[i] !== undefined ? def[i] : 0.25)
    }));
  }
  return out;
}

// #G（2026-09-21）激光期炮塔转速压制（幂等）——蓄能期与射击期共用同一 source。
// 旧实现（#E9）每帧直接 `addModifier(×chargeTurretTurnMul)`，而 computeStats 的 mult 通道是
// #H4（2026-09-21 用户裁定）：激光期炮塔**固定角速度直驱**，取代 #G 的 timed 乘数方案。
// 乘数方案的两处缺陷（用户实测「boss 发射激光时炮塔又不转动了」）：
//   ① Boss 基础 turretTurnRate 先经 tuning（moveMul/turretTurnMul ≈ ×0.6）与难度乘子压低，
//      再乘 laserTurnMul 0.15~0.18 ⇒ 实际角速度 ≈ 0.05 rad/s 量级，肉眼近似冻结；
//   ② AI 接入层每帧仍按 turretDesired 驱动炮塔（与乘子叠加，效果不可预测）。
// 现行口径：激光期（蓄能+射击）由 updateBossLaser **直接推进 t.turretAngle**，角速度取
// `RULES.boss.laser.laserTurnSpeed`（固定 rad/s，不受 modifier/难度影响）；同时置
// `t.bossLaserHoldTurret = true`——接入层（mvp 主循环）据此**跳过 AI 转炮**，两个系统不打架。
// 转向差（与 tank_utils.angDiff 同公式，本地实现——本模块保持零依赖纯逻辑约定）
function _laserAngDiff(target, current) {
  const TAU2 = Math.PI * 2;
  let d = (target - current) % TAU2;
  if (d > Math.PI) d -= TAU2;
  if (d < -Math.PI) d += TAU2;
  return d;
}
// 转向目标 = 目标实体方向（opts.target / opts.turretDesired），到向即停（不越过目标来回摆）。
function _turnTurretToward(t, targetAngle, dt) {
  const cfg = (RULES.boss && RULES.boss.laser) || {};
  const speed = cfg.laserTurnSpeed !== undefined ? cfg.laserTurnSpeed : 0.55;
  const maxStep = speed * dt;
  const diff = _laserAngDiff(targetAngle, t.turretAngle || 0);
  t.turretAngle = (t.turretAngle || 0) + Math.max(-maxStep, Math.min(maxStep, diff));
}

// #I2（2026-09-21 用户裁定「虚线框要反映阻挡」）：新增 _laserBeamBlockDist——沿光束方向
// 求最近全高掩体的**入口距离**（Liang-Barsky 射线×OBB），供伤害截断与绘制层截断共用。
// 阻挡判据与 _laserBlockedByCover 相同：tierGroup:'structure' 且 vision（building/full/
// intact/rock/ruined——确定性挡弹的全高类）。灌木/树/水/泥/路/栅栏/残骸不阻挡。
// 返回光束（炮口 bx,by 沿 angle 方向长 length）被最近全高掩体截断的距离；无阻挡返回 length。
function _laserBeamBlockDist(bx, by, angle, length, coversList) {
  const cfg = (RULES.boss && RULES.boss.laser) || {};
  if (cfg.blockByFullCover === false) return length;
  const list = Array.isArray(coversList) ? coversList : [];
  const tiers = (typeof RULES !== 'undefined' && RULES.coverTiers) ? RULES.coverTiers : null;
  const ex = bx + Math.cos(angle) * length, ey = by + Math.sin(angle) * length;
  let best = length;
  for (const cov of list) {
    if (!cov || (cov.hp !== undefined && cov.hp <= 0)) continue;
    const tier = tiers ? tiers[cov.tier] : null;
    if (!tier || tier.tierGroup !== 'structure' || !tier.vision) continue;
    // 射线段 (bx,by)→(ex,ey) 变换到掩体局部系（中心在原点），Liang-Barsky 求**入口 t**
    const ca = Math.cos(-(cov.angle || 0)), sa = Math.sin(-(cov.angle || 0));
    const lx0 = (bx - cov.x) * ca - (by - cov.y) * sa, ly0 = (bx - cov.x) * sa + (by - cov.y) * ca;
    const lx1 = (ex - cov.x) * ca - (ey - cov.y) * sa, ly1 = (ex - cov.x) * sa + (ey - cov.y) * ca;
    const dx = lx1 - lx0, dy = ly1 - ly0;
    const hw = (cov.w || 0) / 2, hh = (cov.h || 0) / 2;
    let t0 = 0, t1 = 1, ok = true;
    const clips = [[-dx, lx0 + hw], [dx, hw - lx0], [-dy, ly0 + hh], [dy, hh - ly0]];
    for (const [p, q] of clips) {
      if (p === 0) { if (q < 0) { ok = false; break; } continue; }
      const r = q / p;
      if (p < 0) { if (r > t1) { ok = false; break; } if (r > t0) t0 = r; }
      else { if (r < t0) { ok = false; break; } if (r < t1) t1 = r; }
    }
    if (ok && t0 >= 0 && t0 <= 1 && t0 * length < best) best = t0 * length;
  }
  return best;
}
// （#I2：原 #H4 的逐目标 _laserBlockedByCover 已被光束级 _laserBeamBlockDist 截断口径取代——
//   blockDist 同时供伤害判定与蓄能虚线/光束绘制截断，二者严格一致。）

// 分波次召唤（#E9）：按 hpFrom 阈值触发；难度越高单波敌数越多。返回 null 表示本帧无波次。
function bossSummonWave(t, difficulty) {
  const cfg = (RULES.boss && RULES.boss.summonWaves) || {};
  if (cfg.enabled === false || !t || !t.isBoss || !t.boss) return null;
  let list = Array.isArray(t.boss.summons) ? t.boss.summons : [];
  // #G：召唤池为空时按默认池回退（仅正式 Boss——单测裸实体不注入 boss.id）。
  if (!list.length && t.boss.id) list = _summonListFallback(t, cfg);
  if (!list.length) return null;
  const hpRatio = (t.maxHp > 0) ? t.hp / t.maxHp : 0;
  const tol = cfg.tolerance !== undefined ? cfg.tolerance : 0.02;
  const def = cfg.hpFrom || [0.75, 0.5, 0.25];
  if (!Array.isArray(t.bossSummonWavesDone)) t.bossSummonWavesDone = [];
  for (let i = 0; i < list.length; i++) {
    if (t.bossSummonWavesDone.indexOf(i) >= 0) continue;
    const thr = (typeof list[i].hpFrom === 'number') ? list[i].hpFrom
      : (def[i] !== undefined ? def[i] : (1 - (i + 1) / (list.length + 1)));
    if (hpRatio > thr + tol) continue;
    t.bossSummonWavesDone.push(i);
    const diffNorm = Math.max(0, Math.min(1, (typeof difficulty === 'number') ? difficulty : 0.5));
    const mul = 1 + (((cfg.countDiffMul !== undefined ? cfg.countDiffMul : 1.6)) - 1) * diffNorm;
    const base = (list[i].count !== undefined) ? list[i].count : 1;
    return {
      waveIndex: i,
      tankId: list[i].tankId,
      count: Math.max(1, Math.round(base * mul)),
      radiusMin: cfg.spawnRadiusMin !== undefined ? cfg.spawnRadiusMin : 160,
      radiusMax: cfg.spawnRadiusMax !== undefined ? cfg.spawnRadiusMax : 320
    };
  }
  return null;
}

// 受击反馈（#E9）：命中的短促顿挫 —— timed maxSpeed 乘子 + 炮塔抖动窗口（渲染层消费）。
function triggerBossHitReact(t, weak) {
  if (!t || !t.isBoss || t.hp <= 0) return false;
  const cfg = (RULES.boss && RULES.boss.hitReact) || {};
  if (cfg.enabled === false) return false;
  if ((t.bossHitReactCdT || 0) > 0) return false;
  t.bossHitReactCdT = cfg.cooldown !== undefined ? cfg.cooldown : 0.45;
  const base = cfg.seconds !== undefined ? cfg.seconds : 0.35;
  t.bossHitReactT = weak ? base * 1.6 : base;
  t.bossHitReactWeak = !!weak;
  if (typeof addModifier === 'function') {
    addModifier(t, {
      stat: 'maxSpeed', mode: 'mult',
      value: cfg.slowMul !== undefined ? cfg.slowMul : 0.35,
      source: 'boss-hitreact', scope: 'timed',
      expiresAt: Date.now() + ((cfg.stunSlowSeconds !== undefined ? cfg.stunSlowSeconds : 0.25) * 1000)
    });
  }
  return true;
}

// 蓄能激光（#E9）：idle → charge（炮塔转速 ×0.18 + 警示带）→ fire（带内持续掉血）→ cooldown。
// 返回本帧事件，供渲染层画警示带/光束：
//   { type:'laserCharge', x, y, angle, width, length, progress }
//   { type:'laserFire',   x, y, angle, width, length }
function updateBossLaser(t, dt, target, opts) {
  const evts = [];
  const cfg = (RULES.boss && RULES.boss.laser) || {};
  if (cfg.enabled === false || !t || !t.isBoss || !(dt > 0)) return evts;
  if (t.hp === undefined || t.hp <= 0) { t.bossLaserHoldTurret = false; t.bossLaserHoldMove = false; return evts; }
  const stages = (t.boss && Array.isArray(t.boss.stages)) ? t.boss.stages : [];
  const idx = Math.max(0, stages.findIndex(function (s) { return s.id === t.stageId; }));
  const ranges = cfg.ranges || [0.98];
  const hpRatio = (t.maxHp > 0) ? t.hp / t.maxHp : 0;
  let unlocked = false;
  for (let i = 0; i <= idx && i < ranges.length; i++) if (hpRatio <= ranges[i]) unlocked = true;
  if (!unlocked) { t.bossLaserHoldTurret = false; t.bossLaserHoldMove = false; t.bossLaser = null; return evts; }

  const width = cfg.width !== undefined ? cfg.width : 34;
  const length = cfg.length !== undefined ? cfg.length : 1400;
  const chargeS = cfg.chargeSeconds !== undefined ? cfg.chargeSeconds : 2.6;
  const fireS = cfg.fireSeconds !== undefined ? cfg.fireSeconds : 1.5;
  const cdBase = cfg.cooldown !== undefined ? cfg.cooldown : 9;
  const cd = Math.max(cdBase * 0.5, cdBase * (1 - 0.12 * idx));

  t.bossLaserCdT = Math.max(0, (t.bossLaserCdT || 0) - dt);
  if (!t.bossLaser) {
    if (t.bossLaserCdT > 0) { t.bossLaserHoldTurret = false; t.bossLaserHoldMove = false; return evts; }
    t.bossLaser = { phase: 'charge', t: 0 };
  }
  const L = t.bossLaser;
  L.t += dt;

  // #H4：激光期炮塔固定角速度直驱（缓慢转向目标方向，给玩家走位机会）——
  // 转向目标 = opts.turretDesired（AI 本帧期望，通常指向玩家）→ 炮线缓慢追向玩家。
  // bossLaserHoldTurret = true 供接入层跳过 AI 转炮（否则两套驱动叠加、转速不可预测）。
  // #I1（2026-09-21 用户裁定）：激光期**车体不能移动**——bossLaserHoldMove = true，
  // 接入层据此跳过 driveTank（蓄能+射击全程定桩，走位博弈完全交给玩家）。
  t.bossLaserHoldTurret = true;
  t.bossLaserHoldMove = true;
  const holdTarget = (opts && opts.turretDesired !== undefined) ? opts.turretDesired
    : (target && target.hp > 0) ? Math.atan2(target.y - t.y, target.x - t.x)
    : (t.turretAngle || 0);
  _turnTurretToward(t, holdTarget, dt);

  const ang = t.turretAngle || 0;
  const bx = t.x + Math.cos(ang) * ((t.hullLen || 64) * 0.5);
  const by = t.y + Math.sin(ang) * ((t.hullLen || 64) * 0.5);
  // 遮挡判定用的掩体表（自包含：opts.covers 注入；缺省不判遮挡——调用方注入节点 covers）
  const coversList = (opts && opts.covers) || null;
  // #I2：光束被全高掩体截断的距离（蓄能虚线 + 射击光束共用同一口径，绘制层据此截断）
  const blockDist = _laserBeamBlockDist(bx, by, ang, length, coversList);

  if (L.phase === 'charge') {
    evts.push({ type: 'laserCharge', x: bx, y: by, angle: ang, width: width, length: length,
                blockedDist: blockDist,
                progress: Math.max(0, Math.min(1, L.t / chargeS)) });
    if (L.t >= chargeS) { L.phase = 'fire'; L.t = 0; }
    return evts;
  }

  // fire：伤害循环——#H4 起做全高掩体遮挡判定；#I2 改为**光束级截断**口径：
  // blockDist = 光束被最近全高掩体截断的距离（建筑/full/intact/rock/ruined），目标沿光束
  // 投影超过 blockDist 即不掉血（光束与蓄能虚线一致地止于掩体）。灌木/栅栏等不阻挡。
  const ux = Math.cos(ang), uy = Math.sin(ang);
  const dps = (t.stats && t.stats.damage ? t.stats.damage : 40) * (cfg.dpsRatio !== undefined ? cfg.dpsRatio : 0.55);
  const ents = (opts && opts.entities) || (typeof entities !== 'undefined' ? entities : []);
  // 阵营判定：显式注入优先；否则用全局 isHostile（typeof 守卫避免 isHostile 未声明时的 TDZ）
  const hostileFn = (opts && opts.isHostile) ? opts.isHostile
    : ((typeof globalThis !== 'undefined' && typeof globalThis.isHostile === 'function') ? globalThis.isHostile : null);
  for (const e of ents) {
    if (!e || e === t || e.hp === undefined || e.hp <= 0) continue;
    if (e.invuln || e.invulnT > 0) continue;
    if (hostileFn && !hostileFn(t.team, e.team)) continue;
    const d = _beamDist(e.x, e.y, bx, by, ux, uy, length);
    if (d > width * 0.5 + Math.max(e.hullWid || 34, 24) * 0.5) continue;
    // #I2：光束级截断——目标沿光束投影超过 blockDist（最近全高掩体入口）即被建筑/岩石挡住，
    // 本帧不掉血（laserBlocked 事件）；光束与蓄能虚线一致地止于掩体。
    const proj = (e.x - bx) * ux + (e.y - by) * uy;
    if (coversList && proj > blockDist) {
      evts.push({ type: 'laserBlocked', entity: e });
      continue;
    }
    if (typeof applyDamage === 'function') applyDamage(e, dps * dt);
    else e.hp = Math.max(0, e.hp - dps * dt);
    evts.push({ type: 'laserHit', entity: e, dmg: dps * dt });
  }
  evts.push({ type: 'laserFire', x: bx, y: by, angle: ang, width: width, length: length, blockedDist: blockDist });
  if (L.t >= fireS) { t.bossLaser = null; t.bossLaserCdT = cd; t.bossLaserHoldTurret = false; t.bossLaserHoldMove = false; }
  return evts;
}

// ---------- 运行时：#91 行为风格逐帧消费（crush/weave 碾压接触 + weave 冲刺 + command 炮击压制） ----------

// weave 无显式 contact 配置时的碾压缺省（双体履带冲刺撞击手感基准）
const WEAVE_CONTACT_DEFAULTS = { dmg: 100, knockback: 240, cd: 1.5 };
// weave 冲刺时长（秒）：冲刺期给自身 maxSpeed × chargeSpeed 的 timed modifier
const WEAVE_CHARGE_SECONDS = 1.2;

/**
 * 逐帧推进 Boss 顶层行为（接线层每帧调用：updateBossBehavior(bossEntity, dt, player, opts)）。
 * @param {any} t Boss 实体（须 makeBossEntity 产物：isBoss + bossStyle + bossBehavior）
 * @param {number} dt 帧步长（秒）
 * @param {any} [target] 目标实体（通常为玩家；null/死亡则跳过全部行为）
 * @param {any} [opts] { rng?（透传 callStrike，确定性测试）, bounds?:{minX,maxX,minY,maxY}（击退世界钳制） }
 * @returns {Array<any>} 本帧事件：
 *   { type:'contact', x, y, dmg }                       —— crush/weave 碾压命中
 *   { type:'chargeStart', speedMul, durationSec }       —— weave 周期冲刺开始
 *   { type:'barrage', x, y, strikes }                   —— command 炮击轮（strikes = callStrike 落弹记录）
 */
function updateBossBehavior(t, dt, target, opts) {
  const evts = [];
  if (!t || !t.isBoss || !t.bossBehavior || !(dt > 0)) return evts;
  if (t.hp === undefined || t.hp <= 0) return evts;
  const bb = t.bossBehavior;
  const style = t.bossStyle;
  const alive = target && target.hp !== undefined && target.hp > 0 && !(target.invuln || target.invulnT > 0);

  // --- #E9 受击反馈计时（顿挫窗口 + 冷却）---
  if (t.bossHitReactCdT > 0) t.bossHitReactCdT = Math.max(0, t.bossHitReactCdT - dt);
  if (t.bossHitReactT > 0) t.bossHitReactT = Math.max(0, t.bossHitReactT - dt);

  // --- #E9 开场预热：炮塔持续扫描（有动作、不站桩），窗口结束后进入常规阶段行为 ---
  // 直接改写 turretAngle（而非发事件），避免污染 updateBossBehavior 的事件流契约。
  if (t.bossOpeningT > 0) {
    t.bossOpeningT = Math.max(0, t.bossOpeningT - dt);
    const scanRate = (RULES.boss && RULES.boss.openingScanRate) || 0.9;
    const dir = (t.bossOpeningScanDir = t.bossOpeningScanDir || (Math.random() < 0.5 ? 1 : -1));
    t.turretAngle = (t.turretAngle || 0) + dir * scanRate * dt;
    t.bossOpeningScan = dir * scanRate;
  } else if (t.bossOpeningScan !== undefined) {
    t.bossOpeningScan = 0;
  }

  // --- weave 冲刺到期回收（timed modifier 过期后清 source，防残留叠乘） ---
  if (style === 'weave' && t.bossChargeUntil !== undefined && Date.now() >= t.bossChargeUntil) {
    if (typeof removeModifierBySource === 'function') removeModifierBySource(t, 'boss-charge');
    delete t.bossChargeUntil;
  }

  // --- #I4（2026-09-21 用户裁定「boss 几乎完全是站桩等玩家」）：Boss 随机走位层 ---
  // 周期性在玩家周围随机选点（环绕/侧移，保持交战距离），写入 t._bossMoveOverride =
  // { turn, move }；mvp AI 循环对 Boss 用该覆盖替换 aiDecide 的 d.turn/d.move（炮塔照常
  // 锁定玩家瞄准开火）——hold/skirmish/command/fortify 全部获得机动，不再站桩。
  // 豁免：crush 风格（冲撞碾压为身份，本就追人）；激光期（bossLaserHoldMove 冻结）；
  // weave 冲刺窗口（冲刺方向保持原逻辑）。
  if (alive && t.bossWander !== false && style !== 'crush' && !t.bossLaserHoldMove
      && !(style === 'weave' && t.bossChargeUntil !== undefined)) {
    const wc = (RULES.ai && RULES.ai.bossWander) || {};
    if (wc.enabled !== false) {
      const iMin = wc.intervalMin !== undefined ? wc.intervalMin : 2.2;
      const iMax = wc.intervalMax !== undefined ? wc.intervalMax : 4.6;
      const dMin = wc.distMin !== undefined ? wc.distMin : 240;
      const dMax = wc.distMax !== undefined ? wc.distMax : 520;
      const reach = wc.waypointReach !== undefined ? wc.waypointReach : 90;
      const margin = wc.clampMargin !== undefined ? wc.clampMargin : 140;
      const rngF = (opts && typeof opts.rng === 'function') ? opts.rng : Math.random;
      t._bwT = (t._bwT === undefined) ? 0 : Math.max(0, t._bwT - dt);
      const reached = t._bw ? (Math.hypot(t._bw.x - t.x, t._bw.y - t.y) < reach) : true;
      if (!t._bw || t._bwT <= 0 || reached) {
        const a = rngF() * Math.PI * 2;
        const dist = dMin + rngF() * (dMax - dMin);
        let wx = target.x + Math.cos(a) * dist, wy = target.y + Math.sin(a) * dist;
        const b = (opts && opts.bounds) || null;
        if (b) {
          if (b.minX !== undefined) wx = Math.max(b.minX + margin, Math.min(b.maxX - margin, wx));
          if (b.minY !== undefined) wy = Math.max(b.minY + margin, Math.min(b.maxY - margin, wy));
        }
        t._bw = { x: wx, y: wy };
        t._bwT = iMin + rngF() * (iMax - iMin);
      }
      const wdx = t._bw.x - t.x, wdy = t._bw.y - t.y;
      const wd = Math.hypot(wdx, wdy) || 1;
      const desiredHeading = Math.atan2(wdy, wdx);
      const hullDiff = _laserAngDiff(desiredHeading, t.hullAngle || 0);
      const turn = hullDiff > 0.06 ? 1 : (hullDiff < -0.06 ? -1 : 0);
      const move = (wd > reach * 0.6 && Math.abs(hullDiff) < 1.2) ? 1 : 0;
      t._bossMoveOverride = { turn: turn, move: move };
    } else {
      t._bossMoveOverride = null;
    }
  } else {
    t._bossMoveOverride = null;
  }

  // --- crush / weave 碾压接触 ---
  if ((style === 'crush' || style === 'weave') && alive) {
    const contact = Object.assign({}, style === 'weave' ? WEAVE_CONTACT_DEFAULTS : null, bb.contact);
    t.contactCdT = Math.max(0, (t.contactCdT || 0) - dt);
    const radSum = ((t.hullLen || 64) + (target.hullLen || 64)) / 2 * 0.8; // 两车半径和的近似
    const dx = target.x - t.x, dy = target.y - t.y;
    const dist = Math.hypot(dx, dy);
    if (dist < radSum && t.contactCdT <= 0 && contact.dmg > 0) {
      t.contactCdT = contact.cd || 1.5;
      // 伤害走全局 applyDamage 路径（与炮弹/炮击同一条结算链）
      if (typeof applyDamage === 'function') applyDamage(target, Math.round(contact.dmg));
      else if (target.hp !== undefined) target.hp = Math.max(0, target.hp - Math.round(contact.dmg));
      // 击退：沿撞击方向推 knockback px（dist≈0 时退化为 boss 朝向），按世界边界钳制
      let nx = dx / dist, ny = dy / dist;
      if (!isFinite(nx)) { nx = Math.cos(t.hullAngle || 0); ny = Math.sin(t.hullAngle || 0); }
      const kb = contact.knockback || 0;
      if (kb > 0) {
        const b = (opts && opts.bounds) || null;
        target.x += nx * kb;
        target.y += ny * kb;
        if (b) {
          if (b.minX !== undefined) target.x = Math.max(b.minX, target.x);
          if (b.maxX !== undefined) target.x = Math.min(b.maxX, target.x);
          if (b.minY !== undefined) target.y = Math.max(b.minY, target.y);
          if (b.maxY !== undefined) target.y = Math.min(b.maxY, target.y);
        }
      }
      evts.push({ type: 'contact', x: target.x, y: target.y, dmg: Math.round(contact.dmg) });
    }
    // --- weave 周期冲刺：chargeInterval 到点 → maxSpeed × chargeSpeed timed modifier（1.2s） ---
    if (style === 'weave') {
      t.chargeTimerT = (t.chargeTimerT === undefined ? bb.chargeInterval : t.chargeTimerT - dt);
      if (t.chargeTimerT <= 0 && t.bossChargeUntil === undefined) {
        t.chargeTimerT = bb.chargeInterval || 7;
        const mul = bb.chargeSpeed || 1.6;
        if (typeof addModifier === 'function') {
          addModifier(t, { stat: 'maxSpeed', mode: 'mult', value: mul,
                           source: 'boss-charge', scope: 'timed', expiresAt: Date.now() + WEAVE_CHARGE_SECONDS * 1000 });
        }
        t.bossChargeUntil = Date.now() + WEAVE_CHARGE_SECONDS * 1000;
        evts.push({ type: 'chargeStart', speedMul: mul, durationSec: WEAVE_CHARGE_SECONDS });
      }
    }
  }

  // --- command 炮击压制：t.barrageCdT 计时（首延迟 interval，之后每 interval 一轮 shots 连发） ---
  // 落点 = 玩家当前位置附近散布（callStrike 内部按 radius 圆周均匀散布 shellCount 个落弹点，
  // stagger 缺省连发）；delay/radius/dmgMult 全部经 callStrike 自定义参数传入；
  // 预警红圈由 mvp 层统一画 strikes 数据，这里只负责发数据。
  if (style === 'command' && bb.barrage && alive && typeof callStrike === 'function') {
    const br = bb.barrage;
    t.barrageCdT = (t.barrageCdT === undefined ? br.interval : t.barrageCdT - dt);
    if (t.barrageCdT <= 0) {
      t.barrageCdT = br.interval || 9;
      const created = callStrike(target.x, target.y, {
        owner: t,
        delay: br.delay,
        radius: br.radius,
        dmgMult: br.dmgMult,
        shellCount: br.shots,
        rng: (opts && opts.rng) || Math.random
      });
      evts.push({ type: 'barrage', x: target.x, y: target.y, strikes: created });
    }
  }

  return evts;
}

// ---------- 运行时：Boss 履带断落随机自修（2026-09-23 用户裁定） ----------
// 用户反馈「boss 容易被频繁断履带、之后长时间站桩挨打」：现行为是履带被击断后 trackBroken=true
// + immobT=trackLock（缺省 8s，driveTank 内倒计时归零才恢复）。新口径：
//   · 履带断的瞬间 → 预定一个 (0, windowSeconds] 内均匀随机的决策时点；
//   · 到达决策时点 → roll chance：命中则立即修复（trackBroken=false / immobT=0），
//     未命中则保持锁定直至 trackLock 自然归零；
//   · 每次断履带独立决策（修复后再次被击断 → 重新预定新时点/新 roll）。
// 纯逻辑自包含：不动 driveTank 的锁定倒计时，只在本函数内清状态并返回事件供接入层播报。
// 返回事件数组：[{ type:'trackRepair', x, y }]
function updateBossTrackRepair(t, dt, opts) {
  const evts = [];
  if (!t || !t.isBoss || !t.boss || !(dt > 0)) return evts;
  if (t.hp === undefined || t.hp <= 0) return evts;
  const cfg = (RULES.boss && RULES.boss.trackRepair) || {};
  if (cfg.enabled === false) return evts;
  const win = cfg.windowSeconds !== undefined ? cfg.windowSeconds : 8;
  const chance = cfg.chance !== undefined ? cfg.chance : 0.4;
  // 履带处于「断」状态：trackBroken 标记 或 immobT 锁尚未走完
  const broken = !!t.trackBroken || (t.immobT !== undefined && t.immobT > 0);
  if (!broken) {
    // 未断（含锁自然归零/被修复）→ 清理残留调度，保证下次断裂重新独立决策
    delete t._trackRepairAt;
    delete t._trackRepairRoll;
    delete t._trackRepairDecided;
    return evts;
  }
  // 仅在「本次断裂事件」首次调度一次：决策完成（成功或失败）后不再重复 roll，
  // 直至履带恢复（broken→false）为止，防止 roll 失败后整帧重滚。
  if (t._trackRepairAt === undefined && !t._trackRepairDecided) {
    const rngF = (opts && typeof opts.rng === 'function') ? opts.rng : Math.random;
    t._trackRepairAt = rngF() * win;          // (0, win) 内均匀随机时点
    t._trackRepairRoll = rngF() < chance;     // 到点一次性概率判定
    t._trackRepairDecided = true;
  }
  if (t._trackRepairAt !== undefined) {
    t._trackRepairAt = Math.max(0, t._trackRepairAt - dt);
    if (t._trackRepairAt <= 0) {
      if (t._trackRepairRoll) {
        t.trackBroken = false;
        t.immobT = 0;
        if (t.speed !== undefined) t.speed = 0;
        evts.push({ type: 'trackRepair', x: t.x, y: t.y });
      }
      // 决策生效（成功修复或失败放弃）→ 清表，等待下一次断裂
      delete t._trackRepairAt;
      delete t._trackRepairRoll;
    }
  }
  return evts;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    BOSS_WEAKSPOT_KEYS,
    LOOT_RARITIES,
    validateBoss,
    validateBossStage,
    validateBossBehavior,
    BOSS_BEHAVIOR_STYLES,
    bossStageFor,
    bossStageIndex,
    bossInStage,
    makeBossEntity,
    applyBossStage,
    updateBossStage,
    updateBossBehavior,
    updateBossTrackRepair,
    bossSummonWave,
    triggerBossHitReact,
    updateBossLaser,
    bossCurrentStage,
    isWeakspotHit
  };
}
