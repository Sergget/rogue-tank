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
    if (t.turretPivotOffset) { t.turretPivotOffset.dx *= s; t.turretPivotOffset.dy *= s; }
    if (t.anchors) for (const k in t.anchors) { t.anchors[k].dx *= s; t.anchors[k].dy *= s; }
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
  if (boss.stages && boss.stages.length) applyBossStage(t, boss.stages[0]);
  return t;
}

// 应用阶段：移除上一阶段 modifiers（source=boss-stage:<旧id>）→ 记录新阶段 → 叠加 onEnter.modifiers。
function applyBossStage(entity, stage) {
  if (entity.stageId && entity.stageId !== stage.id && typeof removeModifierBySource === 'function') {
    removeModifierBySource(entity, 'boss-stage:' + entity.stageId);
  }
  entity.stageId = stage.id;
  entity.stageAI = stage.ai || null; // 当前阶段 AI 行为（接入层消费；旧阶段切换时自然覆盖）
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

  // --- weave 冲刺到期回收（timed modifier 过期后清 source，防残留叠乘） ---
  if (style === 'weave' && t.bossChargeUntil !== undefined && Date.now() >= t.bossChargeUntil) {
    if (typeof removeModifierBySource === 'function') removeModifierBySource(t, 'boss-charge');
    delete t.bossChargeUntil;
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
    bossCurrentStage,
    isWeakspotHit
  };
}
