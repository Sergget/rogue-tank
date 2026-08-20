'use strict';

// tank_strike.js — 战术炮击（P-17 子目标 1 阶段 2：纯逻辑层）。
// 呼叫战术支援：指定区域延迟 AOE。纯逻辑模块：无 DOM / Canvas 依赖，Node 可测。
//
// 数据来源（RULES.abilities.artillery，数据契约已落地）：
//   delay 2.5 / radius 110 / dmgMult 1.2 / shellCount 3 / maxStrikes 3 / reload 15
//
// shellCount 语义（本模块定）：单次 callStrike 在目标点 (x,y) 半径内均匀散布 shellCount
// 个落弹点，每个落弹点独立微延迟（缺省 stagger=0.15s）依次落地——「散布连射」：
//   第 i 发延迟 = delay + i × stagger（第 1 发在 delay 秒落地，与 RULES 注释
//   「从确认目标点到第一发落地」一致）；stagger:0 → 同点齐射（全部 t=delay）。
// 伤害：单发 dmg = round(owner.stats.damage × dmgMult)；落弹 AOE 同构 applySplashAt
//   衰减公式（dmg × (1 − dist/radius) × 0.5，取整），差异 = 按阵营过滤：只打 owner 的
//   敌对实体、排除 owner 自身（applySplashAt 不做阵营区分，此处按子目标语义收窄）。
//
// 数据结构：strikes 模块级数组（单一数据源，镜像 tank_cover.js smokeClouds 惯例）——
//   每项 { x, y, radius, delay, dmg, t, owner, id }。maxStrikes 上限作用于落弹点总数
//   （滚动丢弃最早，同 smokeClouds 先例）；注意默认 shellCount=3 + maxStrikes=3，
//   即一次满编呼叫恰好占满预警上限。
//
// 无敌（invuln/invulnT）与已摧毁（hp≤0）目标免疫；落弹为简化直伤——不触发
// resolveHit 的模块效果/debuff（装甲/跳弹判定由接线层在触发前自行决策，见阶段 3）。

// 模块级炮击注册表（单一数据源；浏览器端即全局，Node 端经 module.exports 引用）
const strikes = [];

let strikeSeq = 0;

function strikeConfig() {
  return (typeof RULES !== 'undefined' && RULES.abilities && RULES.abilities.artillery)
    ? RULES.abilities.artillery : {};
}

// RULES 缺省兜底（与 RULES.abilities.artillery 默认值一致；RULES 缺失时行为不变）
function _d(cfg, key, fallback) {
  return (cfg && cfg[key] !== undefined) ? cfg[key] : fallback;
}

// 阵营判定（与 tank_entity.js isHostile 同构：enemy 阵营 vs 玩家+友军阵营）
function _hostile(teamA, teamB) {
  return (teamA === 'enemy') !== (teamB === 'enemy');
}

// 单发伤害估算 = round(dmgMult × owner.stats.damage)；无 stats 回退基准 100
function strikeDamage(owner, dmgMult) {
  const base = (owner && owner.stats && owner.stats.damage > 0) ? owner.stats.damage : 100;
  return Math.round((dmgMult || 1) * base);
}

/**
 * 呼叫战术炮击：在 (x,y) 半径内散布 shellCount 个落弹点并入 strikes。
 * opts（全部可覆盖 RULES 缺省，便于接线层调参与测试确定性）：
 *   { owner?, rng?, delay?, radius?, dmgMult?, shellCount?, stagger?, maxStrikes? }
 *   owner    施放者实体（伤害基准 owner.stats.damage × dmgMult；阵营过滤依据；
 *            缺省 null → 不做阵营过滤，接线层应始终传入）
 *   rng      可注入随机函数（确定性测试）；缺省 Math.random
 *   stagger  落弹点间独立微延迟（秒）；缺省 0.15 → 散布连射；0 → 齐射
 * @returns {Array} 新建的落弹点记录（每项 {x, y, radius, delay, dmg, t, owner, id}）
 */
function callStrike(x, y, opts) {
  const cfg = strikeConfig();
  const owner = (opts && opts.owner) || null;
  const rng = (opts && opts.rng) || Math.random;
  const delay = (opts && opts.delay !== undefined) ? opts.delay : _d(cfg, 'delay', 2.5);
  const radius = (opts && opts.radius !== undefined) ? opts.radius : _d(cfg, 'radius', 110);
  const dmgMult = (opts && opts.dmgMult !== undefined) ? opts.dmgMult : _d(cfg, 'dmgMult', 1.2);
  const shellCount = Math.max(1, Math.floor((opts && opts.shellCount !== undefined) ? opts.shellCount : _d(cfg, 'shellCount', 3)));
  const stagger = (opts && opts.stagger !== undefined) ? opts.stagger : 0.15;
  const maxStrikes = Math.max(1, (opts && opts.maxStrikes !== undefined) ? opts.maxStrikes : _d(cfg, 'maxStrikes', 3));
  const dmg = strikeDamage(owner, dmgMult);
  const created = [];
  for (let i = 0; i < shellCount; i++) {
    const angle = rng() * Math.PI * 2;        // 圆周均匀方向
    const dist = rng() * radius;              // 半径内均匀散布
    const s = {
      x: x + Math.cos(angle) * dist,
      y: y + Math.sin(angle) * dist,
      radius: radius,
      delay: delay + i * stagger,
      dmg: dmg,
      t: delay + i * stagger,
      owner: owner,
      id: 'strike:' + (++strikeSeq)
    };
    strikes.push(s);
    created.push(s);
  }
  while (strikes.length > maxStrikes) strikes.shift();   // 上限滚动丢弃最早（同 smokeClouds）
  return created;
}

// 落弹 AOE（同构 applySplashAt 衰减公式）。按阵营过滤（只打 owner 敌对）、排除 owner、
// 无敌/已毁免疫。返回实际命中的 [{target, dmg}] 列表（事件播特效用）。
function _splash(s, entities) {
  const hits = [];
  const list = entities || [];
  for (const e of list) {
    if (!e || e === s.owner) continue;                     // 排除 owner 自身
    if (e.hp === undefined || e.hp <= 0) continue;         // 已摧毁免疫
    if (e.invuln || e.invulnT > 0) continue;               // 无敌免疫（复活无敌期）
    if (s.owner && !_hostile(e.team, s.owner.team)) continue;  // 只打 owner 敌对
    const dist = Math.hypot(e.x - s.x, e.y - s.y);
    if (dist > s.radius) continue;
    const d = Math.round(s.dmg * (1 - dist / s.radius) * 0.5);
    if (d <= 0) continue;
    e.hp = Math.max(0, e.hp - d);
    hits.push({ target: e, dmg: d });
  }
  return hits;
}

/**
 * 逐帧推进炮击：t 递减，到点（t<=0）触发落弹 AOE 并移除。
 * @param {number} dt 帧步长（秒）
 * @param {any[]} [entities] 实体列表（通常为 entities 注册表全量）
 * @param {any} [ctx] 预留上下文（接线层后续可注入筛选/结算钩子）
 * @returns {Array<{type:'strikeHit', x, y, radius, dmg, owner, hits}>} 本帧落弹事件列表
 *          （接线层播爆炸特效/音效用）
 */
function updateStrikes(dt, entities, ctx) {
  if (dt <= 0) return [];
  const events = [];
  for (let i = strikes.length - 1; i >= 0; i--) {
    const s = strikes[i];
    s.t -= dt;
    if (s.t > 0) continue;
    strikes.splice(i, 1);
    const hits = _splash(s, entities);
    events.push({ type: 'strikeHit', x: s.x, y: s.y, radius: s.radius, dmg: s.dmg, owner: s.owner, hits: hits });
  }
  return events;
}

// 当前预警中的落弹（接线层绘制预警圈用；只读约定，勿直接改动条目）
function activeStrikes() {
  return strikes;
}

// 清场（enterBattle/reset 用）。owner 缺省/null → 清空全部。返回移除数量
function clearStrikes(owner) {
  let removed = 0;
  for (let i = strikes.length - 1; i >= 0; i--) {
    if (owner === undefined || owner === null || strikes[i].owner === owner) {
      strikes.splice(i, 1);
      removed++;
    }
  }
  return removed;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    strikes,
    strikeConfig,
    callStrike,
    updateStrikes,
    activeStrikes,
    clearStrikes,
    strikeDamage
  };
}