'use strict';
// js/tank_perf.js — 性能层（纯逻辑，无 DOM / 无 Canvas 依赖）
//
// 两块，互不依赖：
//   ① R0 性能采样（2026-10-27）：逐帧记录 update / draw 耗时，供页面 `__TEST__.perf()` 与
//      `scripts/browser-baseline.cjs` 的渲染基线一并采集。只采样，不改任何游戏状态。
//   ② G1 性能预算与降级（2026-10-28，本文件下半段）：`createGovernor` / `updateGovernor` /
//      `getTierConfig` —— 用帧时间 EMA 驱动 high→mid→deck 逐级降级与保守回升，参数全部来自
//      `RULES.perf`（js/tank_rules.js）。governor 只产出「本帧该用哪档配置」，不碰渲染器、
//      不碰粒子数组、不碰 canvas —— 真实接线（改 canvas 尺寸 / 裁剪 particles / 丢弃老炮弹 /
//      节流静态几何重建）留在页面，见文件末尾的接线说明。
//
// 本模块必须确定性：**禁止 Math.random**（同一串帧时间序列必须给出同一串档位序列，
// 否则测试不可复现、问题不可定位）。

/**
 * @typedef {{count:number, p50:number, p95:number, max:number, mean:number}} MsStats
 */

/**
 * 对一组毫秒样本求统计量。
 * @param {ArrayLike<number>} values 样本数组（可含未使用的尾部槽位）
 * @param {number} count 有效样本数
 * @returns {MsStats}
 */
function summarizeMs(values, count) {
  const n = Math.max(0, Math.min((count | 0), values ? values.length : 0));
  if (!n) return { count: 0, p50: 0, p95: 0, max: 0, mean: 0 };
  const a = [];
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const v = values[i];
    const ms = (typeof v === 'number' && isFinite(v) && v >= 0) ? v : 0;
    a.push(ms);
    sum += ms;
  }
  a.sort((x, y) => x - y);
  const pick = p => a[Math.min(n - 1, Math.max(0, Math.ceil(p * n) - 1))];
  return {
    count: n,
    p50: round3(pick(0.5)),
    p95: round3(pick(0.95)),
    max: round3(a[n - 1]),
    mean: round3(sum / n),
  };
}

function round3(v) {
  return Math.round(v * 1000) / 1000;
}

/**
 * 环形缓冲：每帧一次 `frame(updateMs, drawMs)`。
 * @param {number} [capacity] 保留帧数（默认 240；≤0 钳到 1）
 */
function createPerfRing(capacity) {
  const req = (typeof capacity === 'number' && isFinite(capacity)) ? Math.floor(capacity) : 240;
  const cap = Math.max(1, req);
  const upd = new Float64Array(cap);
  const drw = new Float64Array(cap);
  let n = 0;   // 有效样本数（≤ cap）
  let i = 0;   // 下一个写入槽位
  const sanitize = v => (typeof v === 'number' && isFinite(v) && v >= 0) ? v : 0;

  return {
    capacity: cap,
    /**
     * 记录一帧。耗时非法（NaN/负数/缺失）按 0 计，不污染统计。
     * @param {number} updateMs
     * @param {number} drawMs
     */
    frame(updateMs, drawMs) {
      upd[i] = sanitize(updateMs);
      drw[i] = sanitize(drawMs);
      i = (i + 1) % cap;
      if (n < cap) n++;
    },
    reset() { n = 0; i = 0; },
    /**
     * @returns {{frames:number, update:MsStats, draw:MsStats}}
     */
    stats() {
      return {
        frames: n,
        update: summarizeMs(upd, n),
        draw: summarizeMs(drw, n),
      };
    },
  };
}

// ============================================================================
// ② G1 性能预算与自适应降级（2026-10-28）
// ----------------------------------------------------------------------------
// 降级优先级（与 RULES.perf 头注释同口径）：分辨率 > 粒子预算（先氛围后战斗反馈）> 静态几何节流。
// **绝不降级**：模拟步长（固定 1/120）、输入采样、HUD 刷新频率、炮弹碰撞判定、AI 决策频率。
//   governor 手上一根模拟层的线都没有，物理上做不到降这些——这是设计上的硬保证，不是约定。
// ============================================================================

/** 档位名，下标即 `gov.level`（0=high / 1=mid / 2=deck）。降级 = level+1，回升 = level−1，**只能逐级**。 */
const TIER_ORDER = ['high', 'mid', 'deck'];

/**
 * 取 RULES.perf 块。契约签名是 `createGovernor({ rules })`，没钉死 rules 是整份 RULES 还是
 * 只有 perf 子块（页面两种写法都自然），这里两种都收；都没有就当场抛——静默用默认值会让
 * 「参数没生效」变成一类永远查不出来的 bug。
 * @param {any} rules
 * @returns {any}
 */
function perfBlockOf(rules) {
  const p = (rules && rules.perf) ? rules.perf : rules;
  if (!p || !p.tiers || !p.tiers.high) {
    throw new Error('tank_perf: 缺少 RULES.perf（请先加载 js/tank_rules.js）');
  }
  return p;
}

/**
 * @typedef {Object} Governor
 * @property {string} tier     生效档位名 'high' | 'mid' | 'deck'（页面按它取配置 / 显示 HUD）
 * @property {number} level    0=high / 1=mid / 2=deck
 * @property {number|null} emaMs 帧时间 EMA（毫秒）；**null = 还没采到有效帧**
 * @property {number} holdT    升降后的锁定期剩余（秒），>0 时不升降
 * @property {number} dropT    超预算累计时长（秒），达到 dropAfterSeconds 触发降级
 * @property {number} raiseT   富余累计时长（秒），达到 raiseAfterSeconds 触发回升
 * @property {number} changes  累计升降次数（测试与 HUD 用）
 * @property {any} perf        RULES.perf 的引用（内部字段：updateGovernor 的阈值来源，页面不必读）
 */

/**
 * 建档。只读参数、不改规则。
 * @param {{rules?: any, startTier?: string}} [opts]
 * @returns {Governor}
 */
function createGovernor(opts) {
  const o = opts || {};
  const perf = perfBlockOf(o.rules);
  let level = TIER_ORDER.indexOf(o.startTier || perf.startTier);
  if (level < 0) level = Math.max(0, TIER_ORDER.indexOf(perf.startTier));
  return {
    tier: TIER_ORDER[level],
    level,
    emaMs: null,          // 首帧直接取 frameMs（null 而不是 0，才能区分「没采到」与「0ms」）
    holdT: 0,
    dropT: 0,
    raiseT: 0,
    changes: 0,
    perf,
  };
}

/**
 * 每帧调用一次。`dtSeconds` 是**上一帧的真实帧时间（秒）**，不是模拟步长、不是 timescale 缩放后的值。
 *
 * 门控逻辑：
 *   ① emaMs = emaAlpha*frameMs + (1-emaAlpha)*emaMs（首帧直接取 frameMs）
 *   ② emaMs > dropAboveMs 持续 dropAfterSeconds → level+1（deck 封顶），重置计时
 *   ③ emaMs < raiseBelowMs 持续 raiseAfterSeconds → level−1（**只有 level>0 才回升**，逐级）
 *   ④ 任何一次升降后 holdT = minTierHoldSeconds，锁定期内不升降
 *   ⑤ dtSeconds 异常（≤0 / 非有限 / >1s，如切后台回来）**直接忽略本帧**：不污染 EMA、不推进计时
 *
 * @param {Governor} gov
 * @param {number} dtSeconds 上一帧真实帧时间（秒）
 * @returns {{tier:string, changed:boolean, level:number, emaMs:number|null}}
 */
function updateGovernor(gov, dtSeconds) {
  const perf = gov.perf;
  const prevTier = gov.tier;

  // ⑤ 异常帧忽略。切后台回来 rAF 会给出 2~30s 的 delta，若照收会让 EMA 瞬间爆表并在
  //    回到前台的第一秒就误判降级——玩家看到的是「我只是切了个标签页，画质就糊了」。
  if (typeof dtSeconds !== 'number' || !isFinite(dtSeconds) || dtSeconds <= 0 || dtSeconds > 1) {
    return { tier: gov.tier, changed: false, level: gov.level, emaMs: gov.emaMs };
  }

  const frameMs = dtSeconds * 1000;
  gov.emaMs = gov.emaMs === null
    ? frameMs
    : perf.emaAlpha * frameMs + (1 - perf.emaAlpha) * gov.emaMs;

  if (gov.holdT > 0) gov.holdT = Math.max(0, gov.holdT - dtSeconds);

  // 计时器是饱和计数器：达到阈值后不再增长（避免长时间卡在低档时堆出一个巨大的数）。
  gov.dropT = gov.emaMs > perf.dropAboveMs
    ? Math.min(perf.dropAfterSeconds, gov.dropT + dtSeconds)
    : 0;
  gov.raiseT = gov.emaMs < perf.raiseBelowMs
    ? Math.min(perf.raiseAfterSeconds, gov.raiseT + dtSeconds)
    : 0;

  if (gov.holdT <= 0) {
    if (gov.dropT >= perf.dropAfterSeconds && gov.level < TIER_ORDER.length - 1) {
      gov.level++;
      gov.changes++;
      gov.holdT = perf.minTierHoldSeconds;
      gov.dropT = 0;
      gov.raiseT = 0;
      gov.tier = TIER_ORDER[gov.level];
    } else if (gov.raiseT >= perf.raiseAfterSeconds && gov.level > 0) {
      // 只有真降过级（level>0）才回升：开局就是 high 时 raiseT 会一直满着，
      // 不设这道闸的话「level−1」就能把 level 压成负数。
      gov.level--;
      gov.changes++;
      gov.holdT = perf.minTierHoldSeconds;
      gov.dropT = 0;
      gov.raiseT = 0;
      gov.tier = TIER_ORDER[gov.level];
    }
  }

  return {
    tier: gov.tier,
    changed: gov.tier !== prevTier,
    level: gov.level,
    emaMs: gov.emaMs,
  };
}

/**
 * 本帧生效的档位配置。页面拿它去改 canvas 尺寸 / 裁剪粒子 / 迁就炮弹上限 / 节流静态几何重建。
 * `name` 是档位名（HUD 显示与日志用）。
 * @param {Governor} gov
 * @param {any} [rules] 传则用传入的 RULES(.perf)，省略则用 governor 建档时的那份
 * @returns {{resolutionScale:number, particleCap:number, dustIntervalS:number, maxShells:number, staticRebuildIntervalS:number, name:string}}
 */
function getTierConfig(gov, rules) {
  const perf = rules ? perfBlockOf(rules) : gov.perf;
  const name = perf.tiers[gov.tier] ? gov.tier : perf.startTier;
  const t = perf.tiers[name];
  return {
    resolutionScale: t.resolutionScale,
    particleCap: t.particleCap,
    dustIntervalS: t.dustIntervalS,
    maxShells: t.maxShells,
    staticRebuildIntervalS: t.staticRebuildIntervalS,
    name,
  };
}

// ----------------------------------------------------------------------------
// 页面接线说明（tank_3d.html，不属于本模块的写域，仅供接线方对照）
//
// 1. 帧时间来源：喂 **rAF 的原始 delta**，不是页面里被钳过的那份、也不是 timeScale 缩放后的
//    那份。`loop()` 现有写法是 `dt = (now-last)/1000; if(dt>0.2) dt=0.2; ...; dt*=timeScale;`
//    —— 要在钳位**之前**留一份 rawDt 给 governor；喂钳位后的值会让「切后台回来」退化成
//    0.2s（<1s，不被忽略）并白白推进降级计时，喂 timescale 后的值在结算冻结时会变成 0（被当异常帧丢掉）。
// 2. 调用时机：`render()` 之后、`requestAnimationFrame` 之前调一次 `updateGovernor(gov, rawDt)`。
//    这样返回的 tier 作用于**下一帧**的 render，不会出现「本帧已经用旧尺寸画完，却按新档位裁剪粒子」的半帧状态。
// 3. 分辨率：`canvas.width = Math.round(baseW * cfg.resolutionScale)`（baseW/baseH 是 `?w=&h=` 那
//    份覆盖值或视口尺寸）。只在 `changed` 为 true 时改，改完必须让渲染器重设 viewport——
//    canvas 尺寸变化会重分配绘图缓冲，本身有一帧 hitch（这正是 minTierHoldSeconds 存在的理由）。
// 4. 粒子：`particles.length > cfg.particleCap` 时先从**扬尘**入手（降级时 dustIntervalS 已经
//    自动变稀），再按「最老先丢」裁到 cap——最老的粒子通常是短寿命的扬尘，丢它几乎不可感知。
// 5. 炮弹：`shells.length > cfg.maxShells` 时丢最老的（`shells.shift()`）：炮弹在飞 0.5~1.5s 后
//    已远离炮口、飞向背景，丢它不可感知。
// 6. 静态几何节流：`staticRebuildT >= cfg.staticRebuildIntervalS` 才重建 staticMesh
//    （high 0.25 / mid 0.40 / deck 0.60，见 RULES.perf.tiers.*.staticRebuildIntervalS）。
//    不要在页面里另写一份数值表——档位映射的唯一来源是 RULES。
// ============================================================================

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    summarizeMs,
    createPerfRing,
    // G1 性能预算与降级
    TIER_ORDER,
    createGovernor,
    updateGovernor,
    getTierConfig,
  };
}
