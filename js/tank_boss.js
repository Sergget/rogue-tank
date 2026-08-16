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
const BOSS_WEAKSPOT_KEYS = ['driver', 'ammo', 'engine', 'gunner', 'loader', 'commander', 'track'];

// 掉落卡牌稀有度（loot.cardRarity）
const LOOT_RARITIES = ['common', 'rare', 'epic', 'legendary'];

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
  // 满血出生（configureTank 可能重置 hp；boss 以 stats.maxHp 为准）
  if (t.stats && t.stats.maxHp) { t.maxHp = t.stats.maxHp; t.hp = t.stats.maxHp; }
  t.isBoss = true;
  t.boss = boss;
  t.stageId = null;
  t.scale = boss.scale || 1;
  if (boss.stages && boss.stages.length) applyBossStage(t, boss.stages[0]);
  return t;
}

// 应用阶段：移除上一阶段 modifiers（source=boss-stage:<旧id>）→ 记录新阶段 → 叠加 onEnter.modifiers。
function applyBossStage(entity, stage) {
  if (entity.stageId && entity.stageId !== stage.id && typeof removeModifierBySource === 'function') {
    removeModifierBySource(entity, 'boss-stage:' + entity.stageId);
  }
  entity.stageId = stage.id;
  const mods = (stage.onEnter && stage.onEnter.modifiers) || [];
  for (const m of mods) {
    if (typeof addModifier === 'function') {
      addModifier(entity, { stat: m.stat, mode: m.mode, value: m.value, source: 'boss-stage:' + stage.id, scope: 'run' });
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

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    BOSS_WEAKSPOT_KEYS,
    LOOT_RARITIES,
    validateBoss,
    validateBossStage,
    bossStageFor,
    bossStageIndex,
    bossInStage,
    makeBossEntity,
    applyBossStage,
    updateBossStage
  };
}
