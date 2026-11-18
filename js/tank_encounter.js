'use strict';
// js/tank_encounter.js — G1「完整 3~5 分钟遭遇」波次状态机（纯逻辑，无 entities / covers / DOM 依赖）
//
// 职责边界（务必遵守，越界就会与页面接线冲突）：
//   · 本模块**只做**状态机与 spawn 提案：读 ctx、算出坐标、产出事件；
//   · **生成实体**（spawnTank）、**演出**、**进攻意志**（aiEngaged / lastKnownPlayerPos 的写入）
//     全部归页面（tank_3d.html）。模块碰都不碰 entities。
//   · 参数唯一口径是 `RULES.encounter`（js/tank_rules.js），本模块在创建时快照一次。
//
// 为什么必须有「进攻意志」（写在模块头以防回潮，jd 版思考见 RULES.encounter 注释）：
//   js/tank_ai.js 的 AI 激活门控要求敌人「距离 ≤ aiTriggerDist(默认 RULES.ai.triggerDistBase=700)
//   **且**有 LoS」才置 aiEngaged=true；未激活时只做 patrol 原地微摆（几乎不移动）。
//   ⇒ 波次敌人若不在 spawn 时被强制 aiEngaged=true，玩家一龟缩这局就永远打不完。
//   本模块用 `intel` 事件把「刷新节奏」告诉页面，由页面每 intelInterval 秒把敌人
//   lastKnownPlayerPos 刷到玩家真实位置（语义：进攻方指挥部持续更新你的方位）。
//
// 调用方式（页面接线）：
//   const enc = createEncounter({ seed, rules });          // rules 可省，缺省吃全局 RULES.encounter
//   const events = updateEncounter(enc, dt, ctx);          // 每帧一次，返回本帧事件数组（可能是 []）
//
// 节拍模式（2026-10-30 防线式波次，用户裁定）：
//   mode:'timed'（缺省）= telegraph → wave → breather(定时) → 下一波。切片 tank_3d.html 用它。
//   mode:'lines'        = telegraph → wave → lineHold(等玩家推进) → 下一波。标准模式正式局用它。
//     创建时传 lineXs:防线 x 升序数组（页面按 node.encounterAnchors 每组取平均 x）；
//     清波后停在 lineHold，直到 ctx.playerPos.x ≥ 当前防线 x − cfg.lineAdvanceMargin
//     才发下一波 telegraph。防线全清（最后一波清掉）即 victory——与 timed 相同。
//     lineXs 缺省时退化为「清波即发」不软锁。breather 事件在 lines 模式下 seconds=0，
//     页面按同一分支回血/补员（字段同构）。
//     **「波 i 绑定哪道防线」的唯一数据源是 `encounterLineXFor(enc, waveIndex)`**（2026-10-30）：
//     风险在于页面自己也算了一遍（`waveIdx % lineCount` 与导演的 `min(i, len-1)`
//     在波数 > 防线数时必然分叉 ⇒ 敌人落在防线 A、节拍等玩家推进到防线 B）。现统一为：
//     每进一波 telegraph 时算一次写进 `enc.boundLineX`，并由 telegraph/spawn 事件的
//     `lineX` 字段外发——页面只读事件，**不要再任何一侧重算**。
//
// 页面如何消费 `spawn` 提案（模块不代劳）：
//   for (const u of ev.units) {
//     const e = spawnTank({ id, team:'enemy', x:u.x, y:u.y, hullAngle:u.hullAngle,
//                           turretAngle:u.hullAngle, heightClass:u.cls });   // cls 直通 heightClass
//     e.aiEngaged = true;                                                   // 进攻意志（必写，否则玩家龟缩即无限局）
//     e.lastKnownPlayerPos = { x:player.x, y:player.y };                     // 首帧就给一次方位
//   }
// 收到 `intel` 时对所有活着的波次敌人重刷 lastKnownPlayerPos；收到 `breather` 时按
// repairPct 回血、按 reinforce 补友军。模块只告诉页面「什么时候做」，不做任何写实体动作。
//
// 消费方：tank_3d.html（唯一接线方）、scripts/test-encounter.js（回归）。

/**
 * 阶段全集。终局两态（victory / defeat）也是合法 phase，便于页面 switch。
 */
const ENCOUNTER_PHASES = ['telegraph', 'wave', 'breather', 'lineHold', 'victory', 'defeat', 'settlement'];

// 防线驱动模式（mode:'lines'）的缺省推进余量（px）。
// rationale：与 RULES.encounter.lineAdvanceMargin 同值；仅当 RULES 没给该键时的兜底。
const LINE_ADVANCE_MARGIN_FALLBACK = 400;

/** 缺省配置：仅当页面/测试既没传 rules、进程里也没有全局 RULES.encounter 时才落到这套值。 */
const ENCOUNTER_DEFAULTS = {
  enabled: true,
  telegraphSeconds: 2.0,
  breatherSeconds: 12,
  breatherRepairPct: 0.30,
  reinforceMinAllies: 1,
  minSpawnDist: 600,
  maxSpawnDist: 900,
  SPAWN_DIST_HARD_FLOOR: 380,
  spawnTries: 40,
  intelInterval: 6,
  waves: [],
};

/** 缺省种子：未显式给 seed 时的固定值——宁可「每次一样」，也不要隐式随机。 */
const ENCOUNTER_SEED_FALLBACK = 20261028;

/**
 * 归一化后的配置快照（创建时冻结一份，运行期不回头读 RULES）。
 * @typedef {{
 *   enabled:boolean, telegraphSeconds:number, breatherSeconds:number, breatherRepairPct:number,
 *   reinforceMinAllies:number, minSpawnDist:number, maxSpawnDist:number, SPAWN_DIST_HARD_FLOOR:number,
 *   spawnTries:number, intelInterval:number, lineAdvanceMargin:number,
 *   waves:Array<{id:string, label:string, units:Array<{cls:string, bearing:number, count:number}>}>
 * }} EncounterConfig
 *
 * 注意：`entryReactSeconds` / `playerHpScale` **不在**这份快照里 —— 它们是页面接线参数
 * （写 aiReactT / 缩放玩家 maxHp），模块一行都不读，塞进来只会造成「只写不读」的假消费。
 */

/**
 * 输出事件。type 之外的字段按 type 取用，见文件头「事件表」。
 * @typedef {{
 *   type:string, wave?:number, waveId?:string, waveLabel?:string, seconds?:number, bearings?:number[],
 *   units?:Array<{cls:string, x:number, y:number, hullAngle:number, bearing:number}>,
 *   elapsed?:number, repairPct?:number, reinforce?:number,
 *   stats?:{seconds:number, kills:number, wavesCleared:number},
 *   lineX?:number|null   // telegraph / spawn：本波绑定防线的 x（2026-10-30，见 encounterLineXFor）
 * }} EncounterEvent
 */

// 出生点相对战场边界的内缩边距（px）。
// rationale：贴边生成的敌人会被后续 de border 判定/movement clamp 卡住（半截身子在场外），
// 40px ≈ 一辆 medium 车宽，保证「生成即完整入场」。
const SPAWN_EDGE_MARGIN = 40;

// 同组内相邻单位的横向铺开间距（px）。
// rationale：同一 bearing 上多个单位若只沿射线按距离差分布，会叠成一列甚至重合
// （再被 resolveTankCollisions 硬推开，视觉上车从地里弹出来）。90px ≈ 1.3 倍车宽，
// 直接生成疏散横队。
const UNIT_SPREAD_PX = 90;

// 同一波内两个出生点的最小间距（px）。
// rationale：横向铺开靠的是 lateral 偏移，但当 bearing 指向战场短轴/角落时，所有候选都会被
// 边界钳制**吸到同一个角点**（1440×864 实测：东北向三个 medium 全部落到 (1400,40) 附近，
// 其中两个坐标完全相同）。到时候 resolveTankCollisions 会把它们硬推开，观感是「车从地里弹出来」。
// 70px ≈ 2 倍 medium 车宽（38px）、低于 lateral 间距 90px，够隔开又不会逼退采样。
// intelInterval 的下限（秒）：低于它时刷方位的频率比模拟步还密，等于没有；
// 取 0.5 是「一帧最多一条、且明显快于任何决策周期」的保守值（#AB4）。
const INTEL_MIN_SECONDS = 0.5;

const SPAWN_MIN_SEPARATION = 70;

// 方位可行性回退的尝试序列（rad，左右交替）。
// rationale：步长 0.35rad ≈ 20°，三档共 ±60°。20° 足够跨过「正南只剩 392px」这类短轴死角
// （转到斜向就能吃到对角距离），又不至于把「东」变成「东北」这种设计意图的改头换面；
// 左右交替是为了让回退方向可预期（先试同一侧），而不是每次被 rng 甩到不同侧。
const BEARING_FALLBACK_OFFSETS = [0, 0.35, -0.35, 0.70, -0.70, 1.05, -1.05];

// 单位分布在横向铺开基础上的抖动幅度（相对 UNIT_SPREAD_PX 的比例）。
// rationale：纯等距横队太像阅兵方阵；±25% 的抖动让它读起来是「疏散推进」而非「阵列」。
const UNIT_SPREAD_JITTER = 0.25;

// ---------------------------------------------------------------- 工具
function encNum(v, fallback) {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function encHashSeed(seed) {
  if (typeof seed === 'number' && Number.isFinite(seed)) return seed >>> 0;
  const str = String(seed === undefined || seed === null ? ENCOUNTER_SEED_FALLBACK : seed);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619) >>> 0;
  return h >>> 0;
}

/**
 * 自带 mulberry32（禁止 Math.random —— 确定性是硬需求：同 seed + 同 ctx 序列必须完全复现）。
 * 之所以不复用 tank_nodegen 的 createRNG：本模块的语义契约是「独立、无副作用、不依赖加载顺序」，
 * @param {any} seed
 * @returns {(() => number) & {range:(a:number,b:number)=>number}}
 */
function encounterRNG(seed) {
  let s = encHashSeed(seed);
  if (s === 0) s = 0x12345678;
  function rng() {
    s |= 0; s = s + 0x6D2B79F5 | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
  rng.range = function (min, max) { return min + rng() * (max - min); };
  return rng;
}

function clampNum(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

/**
 * 快照配置。优先级：显式 rules > 全局 RULES.encounter > ENCOUNTER_DEFAULTS。
 * waves 内的 bearing/cls/count 一并归一化（避免页面传 'Heavy' / 浮点 count 之类的脏数据）。
 * @param {any} [rules]
 * @returns {EncounterConfig}
 */
function resolveEncounterConfig(rules) {
  const globalish = (typeof RULES !== 'undefined' && RULES && RULES.encounter) ? RULES.encounter : null;
  const src = Object.assign({}, ENCOUNTER_DEFAULTS, globalish || {}, rules || {});
  const waves = (Array.isArray(src.waves) ? src.waves : []).map(function (w, i) {
    const ww = w || {};
    return {
      id: String(ww.id || ('W' + (i + 1))),
      label: String(ww.label || ww.id || ('第 ' + (i + 1) + ' 波')),
      units: (Array.isArray(ww.units) ? ww.units : []).map(function (u) {
        const uu = u || {};
        return {
          cls: (uu.cls === 'heavy') ? 'heavy' : 'medium',
          bearing: encNum(uu.bearing, 0),
          count: Math.max(1, Math.round(encNum(uu.count, 1))),
        };
      }),
    };
  });
  return {
    enabled: src.enabled !== false,
    telegraphSeconds: Math.max(0, encNum(src.telegraphSeconds, ENCOUNTER_DEFAULTS.telegraphSeconds)),
    breatherSeconds: Math.max(0, encNum(src.breatherSeconds, ENCOUNTER_DEFAULTS.breatherSeconds)),
    breatherRepairPct: clampNum(encNum(src.breatherRepairPct, ENCOUNTER_DEFAULTS.breatherRepairPct), 0, 1),
    reinforceMinAllies: Math.max(0, Math.round(encNum(src.reinforceMinAllies, ENCOUNTER_DEFAULTS.reinforceMinAllies))),
    minSpawnDist: Math.max(0, encNum(src.minSpawnDist, ENCOUNTER_DEFAULTS.minSpawnDist)),
    maxSpawnDist: Math.max(0, encNum(src.maxSpawnDist, ENCOUNTER_DEFAULTS.maxSpawnDist)),
    SPAWN_DIST_HARD_FLOOR: Math.max(0, encNum(src.SPAWN_DIST_HARD_FLOOR, ENCOUNTER_DEFAULTS.SPAWN_DIST_HARD_FLOOR)),
    spawnTries: Math.max(1, Math.round(encNum(src.spawnTries, ENCOUNTER_DEFAULTS.spawnTries))),
    // #AB4：intelInterval 是「防龟缩」这条生命线的唯一驱动。0 在语义上读起来像
    //   「不需要刷新」，实际是关掉 intel 事件 ⇒ 页面 refreshEnemyIntel() 永不执行 ⇒
    //   敌人只在出生那一帧拿到玩家方位 ⇒ 玩家躲着就永远打不完（且没有任何报错）。
    //   因此把 ≤0 视为**非法值**钳到最小可用间隔，而不是让它静默失效。
    intelInterval: Math.max(INTEL_MIN_SECONDS, encNum(src.intelInterval, ENCOUNTER_DEFAULTS.intelInterval)),
    // 防线驱动模式：玩家距下一防线 lineAdvanceMargin px 内触发下一波 telegraph（2026-10-30 用户裁定）。
    lineAdvanceMargin: Math.max(0, encNum(src.lineAdvanceMargin, LINE_ADVANCE_MARGIN_FALLBACK)),
    waves: waves,
  };
}

/** @returns {{minX:number,minY:number,maxX:number,maxY:number,w:number,h:number}} */
function encWorldBox(ctx) {
  const world = (ctx && ctx.world) ? ctx.world : null;
  const w = Math.max(0, encNum(world ? world.w : 0, 0));
  const h = Math.max(0, encNum(world ? world.h : 0, 0));
  const m = SPAWN_EDGE_MARGIN;
  let minX = m, maxX = w - m, minY = m, maxY = h - m;
  if (maxX < minX) { const mid = w / 2; minX = mid; maxX = mid; }   // 战场比 2×边距还窄：退化为中线
  if (maxY < minY) { const mid = h / 2; minY = mid; maxY = mid; }
  return { minX: minX, minY: minY, maxX: maxX, maxY: maxY, w: w, h: h };
}

/**
 * **方位可行性**的唯一口径：从 (x,y) 沿 bearing 射出，到矩形边界**出口点**的距离（px）。
 * 这是「该方位上还剩多少纵深」的度量——短轴方位（正南）在 1440×864 里只有 392px，
 * 一眼就能看出它养不出 600px 的出生点。
 * @returns {number} 出口距离（≥0，永远有限）
 */
function _feasibleDistance(x, y, bearing, box) {
  const bx = Math.cos(bearing), by = Math.sin(bearing);
  let t = Infinity;
  if (Math.abs(bx) > 1e-9) {
    const t1 = (box.minX - x) / bx, t2 = (box.maxX - x) / bx;
    t = Math.min(t, Math.max(t1, t2));
  }
  if (Math.abs(by) > 1e-9) {
    const t1 = (box.minY - y) / by, t2 = (box.maxY - y) / by;
    t = Math.min(t, Math.max(t1, t2));
  }
  if (!Number.isFinite(t) || t < 0) t = 0;
  return t;
}

/**
 * 方位可行性回退：预设 bearing 若养不出 minSpawnDist，就左右交替偏转找第一个养得出来的方位。
 * 全部不行时取「可行距离最大」的方位并**接受它小于 minSpawnDist**——此时横竖都贴脸，
 * 与其退回一个更差的方位，不如保住最大纵深（后续由 SPAWN_DIST_HARD_FLOOR 校正兜一层）。
 * @returns {number} 实际使用的 bearing（必须写回 unit.bearing，否则 HUD 会骗人）
 */
function resolveBearing(enc, bearing, ctx, box, px, py) {
  let best = bearing, bestD = -1;
  for (let i = 0; i < BEARING_FALLBACK_OFFSETS.length; i++) {
    const b = bearing + BEARING_FALLBACK_OFFSETS[i];
    const d = _feasibleDistance(px, py, b, box);
    if (d >= enc.cfg.minSpawnDist) return b;
    if (d > bestD) { bestD = d; best = b; }
  }
  return best;
}

/**
 * 单个单位的出生点采样：拒绝采样制，最多 spawnTries 次。
 * 过滤顺序：① 落在矩形内（构造上保证）；② 钳制后仍 ≥ minSpawnDist；③ ctx.isBlocked(x,y) 为假；
 * ④ 与本波已定点的间距 ≥ SPAWN_MIN_SEPARATION。
 * @param {number} lateral 同组内按序号给出的横向铺开量（px）
 * @param {Array<{x:number,y:number}>} taken 本波已经定下来的出生点
 */
function pickSpawnPoint(enc, bearing, lateral, ctx, box, px, py, taken) {
  const cfg = enc.cfg;
  const bx = Math.cos(bearing), by = Math.sin(bearing);
  const nx = -by, ny = bx;                                  // bearing 的逆时针垂线
  const jitter = lateral + (enc.rng() - 0.5) * UNIT_SPREAD_PX * UNIT_SPREAD_JITTER * 2;
  // 采样上限是 **maxSpawnDist（出场距离硬顶）**，不再是「战场对角」——对角会让敌人出生在 1200px 开外，
  // 玩家干等十几秒才接战，节奏当场塌陷（实测 W1 抽到 1229px）。
  const maxD = Math.max(cfg.minSpawnDist, cfg.maxSpawnDist);
  // 横向铺开会让径向距离大于沿射线的 d（勾股），所以先把沿射线上限扣掉 lateral 的分量，
  // 保证**钳制前**的径向距离已经 ≤ maxD（钳制只会更近，不会更远）。
  const dHi = Math.sqrt(Math.max(0, maxD * maxD - jitter * jitter));
  const span = Math.max(0, Math.max(cfg.minSpawnDist, dHi) - cfg.minSpawnDist);
  const tries = cfg.spawnTries;
  // 该方位的纵深可能本身就 < minSpawnDist（回退序列全部失败的极端图）。
  // 这时若还按 minSpawnDist 卡，会 100% 落到兜底点；把门槛压到**该方位的最大纵深**，
  // 让采样仍有机会产出「尽可能远」的点，而不是一律退到边界。
  const minD = Math.min(cfg.minSpawnDist, _feasibleDistance(px, py, bearing, box));
  for (let i = 0; i < tries; i++) {
    const d = cfg.minSpawnDist + enc.rng() * span;
    let x = clampNum(px + bx * d + nx * jitter, box.minX, box.maxX);
    let y = clampNum(py + by * d + ny * jitter, box.minY, box.maxY);
    if (Math.hypot(x - px, y - py) < minD) continue;              // 被边界拽进玩家怀里 ⇒ 作废重采样
    if (ctx.isBlocked && ctx.isBlocked(x, y)) continue;
    let tooClose = false;
    for (let ti = 0; ti < taken.length; ti++) {
      if (Math.hypot(taken[ti].x - x, taken[ti].y - y) < SPAWN_MIN_SEPARATION) { tooClose = true; break; }
    }
    if (tooClose) continue;
    return { x: x, y: y };
  }
  // 全部被拒 —— 沿 bearing 退到「最远的合法点」。
  //   · 上限 = maxSpawnDist（**兜底也必须守出场距离硬顶**）：契约原文只说「退到边界上的点」，
  //     但边界点可能远在 1000px 开外（实测玩家 (360,432) 时正东边界 1042px，浏览器实测 maxDist=1044
  //     就是这条路径漏出去的）。边界比 maxSpawnDist 近时仍取边界点，只有**边界更远**才往回收。
  //   · 横向铺开量在这里**仍要生效**，否则同组多个单位会叠在同一个兜底点上
  //     （实体重叠 → resolveTankCollisions 硬推开，视觉上「从地里弹出来」）。
  const tCap = Math.sqrt(Math.max(0, maxD * maxD - lateral * lateral));   // 勾股预留：径向距离 ≤ maxD
  const t = Math.min(_feasibleDistance(px, py, bearing, box), tCap);
  const fbx = clampNum(px + bx * t, box.minX, box.maxX);
  const fby = clampNum(py + by * t, box.minY, box.maxY);
  return {
    x: clampNum(fbx + nx * lateral, box.minX, box.maxX),
    y: clampNum(fby + ny * lateral, box.minY, box.maxY),
  };
}

/**
 * **整波预规划**：在 telegraph 阶段就把本波所有单位（含真实的 x/y/hullAngle/bearing）算好。
 * 存在的理由（防「HUD 骗人」回归）：telegraph.bearings 与 spawn.units 必须是**同一份数据**——
 * 若 telegraph 报的是预设方位、spawn 走的是回退后的方位，玩家按提示转向就看不到敌人，
 * 直接违反「目标可读」这条设计支柱。
 * @returns {Array<{cls:string, x:number, y:number, hullAngle:number, bearing:number}>}
 */
function planWave(enc, ctx) {
  const wave = encCurrentWave(enc);
  if (!wave) return [];
  const box = encWorldBox(ctx);
  const pp = ctx.playerPos || { x: 0, y: 0 };
  const px = encNum(pp.x, 0), py = encNum(pp.y, 0);
  const units = [];
  const taken = [];
  for (let gi = 0; gi < wave.units.length; gi++) {
    const grp = wave.units[gi];
    const bearing = resolveBearing(enc, grp.bearing, ctx, box, px, py);
    for (let k = 0; k < grp.count; k++) {
      const lateral = (k - (grp.count - 1) / 2) * UNIT_SPREAD_PX;
      const pt = pickSpawnPoint(enc, bearing, lateral, ctx, box, px, py, taken);
      taken.push(pt);
      units.push({
        cls: grp.cls,
        x: pt.x,
        y: pt.y,
        hullAngle: Math.atan2(py - pt.y, px - pt.x),
        bearing: bearing,                    // **回退后的真实方位**，覆盖预设值
      });
    }
  }
  return units;
}

/**
 * spawn 前的轻量校正（只改 x/y/hullAngle，不改 cls/bearing 的语义）。
 *   ① 朝向刷新：规划发生在 telegraph 起点，2s 预警里玩家早就换位了，炮口应指向**当前**玩家；
 *   ② 距离校正：若某点距**当前**玩家 < SPAWN_DIST_HARD_FLOOR（玩家朝提示方位冲过去了），
 *      沿「点 − 玩家」方向外推到该距离；外推量再被该方向的**剩余纵深**与 box 边界钳制
 *      （保证不出界；真推不到 380 时取几何最大值，不再折腾）。
 * @returns {Array<{cls:string, x:number, y:number, hullAngle:number, bearing:number}>} 副本（不改 enc.pending）
 */
function applySpawnGuard(units, cfg, box, px, py) {
  const floor = cfg.SPAWN_DIST_HARD_FLOOR;
  const out = [];
  for (let i = 0; i < units.length; i++) {
    const u = units[i];
    const dx = u.x - px, dy = u.y - py;
    const d = Math.hypot(dx, dy);
    const v = { cls: u.cls, x: u.x, y: u.y, bearing: u.bearing, hullAngle: Math.atan2(-dy, -dx) };
    if (d < floor && d > 1e-6) {
      const ux = dx / d, uy = dy / d;
      const t = Math.min(floor, _feasibleDistance(px, py, Math.atan2(uy, ux), box));
      if (t > d) {
        v.x = clampNum(px + ux * t, box.minX, box.maxX);
        v.y = clampNum(py + uy * t, box.minY, box.maxY);
      }
    }
    out.push(v);
  }
  return out;
}

/**
 * @typedef {{
 *   phase:string, mode:string, lineXs:number[], boundLineX:number|null, waveIndex:number, waveCount:number,
 *   timer:number, elapsed:number,
 *   kills:number, spawnedThisWave:number, emptyWave:boolean, outcome:string|null,
 *   wavesCleared:number, cfg:EncounterConfig, seed:any, rng:Function, intelTimer:number,
 *   pendingTelegraph:boolean,
 *   pending:Array<{cls:string, x:number, y:number, hullAngle:number, bearing:number}>,
 *   kind:string, objectiveAlive:boolean, objectiveFailed:boolean,
 *   captureTotal:number, captureDone:number, counterAttackFired:boolean, counterAttackAt:number,
 *   timeLimitSeconds:number,
 *   failReason?:string
 * }} EncounterState
 */

/**
 * **波 ↔ 防线绑定的唯一数据源（2026-10-30 收口，勿再分散实现）**。
 *
 * 语义：第 waveIndex 波所绑定防线的 x 坐标；`lineXs` 为空时返回 `null`（无防线可绑）。
 * 取模口径是 `min(waveIndex, len-1)`（**不是** 取模循环）——波数 > 防线数时后面的波
 * 全部钳到**最后一道防线**，而不是折回第一道：玩家是沿 +x 单向推进的，把第 5 波折回
 * x 最小的防线会让「打完第 4 波又退回去挨打」，与推进轴直接冲突。
 *
 * 为什么必须有这一个函数（rationale，写给未来的改动者看）：
 *   「波 i 落在哪道防线」此前有**两套互相独立的口径**——
 *     ① 页面侧 tank_battle.html:3289 用 `waveIdx % lineGroups.length`（取模循环）；
 *     ② 导演侧（本模块的 lineHold 段，原 558-559 行）用 `lineXs[min(waveIndex, len-1)]`（钳末）。
 *   两套口径在「波数 ≤ 防线数」时结果恰好相同（当前 standardWaves 三条原型 / 常见 3 道防线
 *   的配置下侥幸等价），所以错位是**静默**的——没有任何断言会红。
 *   失效场景：一旦波数对齐/超过防线数（页面侧本批把标准模式改为按 `node.encounterAnchors.length`
 *   = N 波），波数 > 防线数即刻分叉：取模把第 4 波折回第 1 道防线（x 最小，玩家身后已清区），
 *   而钳末把它留在第 3 道防线（x 最大，玩家正前方）。结果是 **波 i 的敌人落在防线 A，
 *   lineHold 的节拍却在等玩家推进到防线 B** —— 玩家清光了眼前的敌人却因为没走到 B 而
 *   永远等不到下一波（软锁），或者下一波在身后刷新（推进感崩塌）。
 *   两侧各自改对都没用：**口径必须收敛到一处**，页面只读事件里的 `lineX`，不再自己算。
 *
 * 防御：waveIndex 走 `Math.max(0, waveIndex | 0)`——负值/NaN/undefined 一律落到第 0 波，
 *   绝不让 `lineXs[-1]` 这种 undefined 流到页面（页面拿到 undefined 会算 NaN 的距离并静默误判）。
 *
 * @param {EncounterState} enc
 * @param {number} waveIndex
 * @returns {number|null} 该波绑定防线的 x；无防线时为 null
 */
function encounterLineXFor(enc, waveIndex) {
  if (!enc || !Array.isArray(enc.lineXs) || enc.lineXs.length === 0) return null;
  const i = Math.max(0, waveIndex | 0);
  return enc.lineXs[Math.min(i, enc.lineXs.length - 1)];
}

/**
 * 创建遭遇状态。**不产事件**（返回值只有 enc）：第一波的 telegraph 事件由首次 update 补发，
 * 这样「每波恰好一条 telegraph」的纪律只有一条代码路径，不会出现创建时+update 时的双发。
 * @param {{seed?:any, rules?:object, mode?:string, lineXs?:number[],
 *          kind?:string, captureTotal?:number, counterAttackAt?:number, timeLimitSeconds?:number}} [opts]
 *   `mode:'lines'` = 防线驱动节拍（lineHold 等玩家推进）；缺省 'timed'（切片节拍）。
 *   `lineXs` = 防线 x 数组（升序；lines 模式的下一波触发阈值）。
 *   `kind` = 节点任务类型（M3-E/F/G，2026-11-02）：'exterminate'（缺省）/ 'defend' /
 *     'capture' / 'breakthrough'。类型只换胜利条件，不新开管线。
 *   `captureTotal` = 占领点总数（kind='capture' 时生效）；`timeLimitSeconds` = 突破时限。
 * @returns {EncounterState}
 */
function createEncounter(opts) {
  const o = opts || {};
  const cfg = resolveEncounterConfig(o.rules);
  const kind = (o.kind === 'defend' || o.kind === 'capture' || o.kind === 'breakthrough')
    ? o.kind : 'exterminate';
  const enc = {
    cfg: cfg,
    // 2026-10-30 防线式波次（用户裁定）：mode:'lines' 时波间不走定时 breather，
    //   而是等玩家推进过当前防线（ctx.playerPos.x 接近/越过下一防线锚点 x）才
    //   telegraph 下一波。缺省 'timed' 保持既有 breather 节拍（tank_3d.html 不回归）。
    mode: (o.mode === 'lines') ? 'lines' : 'timed',
    // 防线 x 序列（升序）：lines 模式下页面按 node.encounterAnchors 每组取平均 x 传入。
    //   语义：waves[i] 绑定防线 lines[min(i, len-1)]；玩家 x ≥ 防线 x - lineAdvanceMargin
    //   即视为「推进过当前防线」。空数组/缺省时 lines 模式退化为「清波即发下一波」
    //   （等价于 breatherSeconds=0 的节拍，不至于软锁）。
    lineXs: (Array.isArray(o.lineXs) ? o.lineXs.map(v => encNum(v, NaN)).filter(Number.isFinite) : []).sort((a, b) => a - b),
    // 2026-10-30：当前波绑定的防线 x（波↔防线绑定单一数据源的可读镜像）。
    //   初值 null（创建时还没进任何一波），每进入某波的 telegraph 时由 enterTelegraph
    //   按该波 waveIndex 经 `encounterLineXFor` 写入。页面**只读**它/事件里的 lineX，
    //   不得自己用 `waveIdx % lineCount` 再算一遍（那正是本次收口的错位根因）。
    boundLineX: null,
    seed: (o.seed === undefined || o.seed === null) ? ENCOUNTER_SEED_FALLBACK : o.seed,
    rng: encounterRNG((o.seed === undefined || o.seed === null) ? ENCOUNTER_SEED_FALLBACK : o.seed),
    phase: 'telegraph',
    waveIndex: 0,
    waveCount: cfg.waves.length,
    timer: cfg.telegraphSeconds,
    elapsed: 0,
    kills: 0,
    spawnedThisWave: 0,
    emptyWave: false,     // #AB3：本波未生成任何单位（配置异常），按「已清」推进，避免软锁
    outcome: null,
    // --- 以下为模块内部字段（页面可读但不必依赖）---
    wavesCleared: 0,
    intelTimer: 0,
    pendingTelegraph: true,     // 首帧补发 telegraph 的标记
    pending: [],                // 本波预规划结果（telegraph 阶段算好，spawn 直接输出）
    // --- M3-E/F/G（2026-11-02）：任务类型状态（kind='exterminate' 时全部惰性）---
    kind: kind,
    objectiveAlive: true,       // defend：守点目标存活（页面每帧经 ctx.objectiveAlive 注入）
    objectiveFailed: false,     // defend：目标已被毁（胜利仍成立，但存活类 bonus 归零）
    captureTotal: Math.max(0, encNum(o.captureTotal, 0)),
    captureDone: 0,             // capture：已拔点数（页面每帧经 ctx.captureDone 注入）
    counterAttackFired: false,  // capture：50% 反冲击只发一次
    counterAttackAt: clampNum(encNum(o.counterAttackAt, 0.5), 0, 1),
    timeLimitSeconds: Math.max(0, encNum(o.timeLimitSeconds, 0)),
  };
  return enc;
}

function encCurrentWave(enc) {
  return (enc.cfg.waves && enc.waveIndex >= 0 && enc.waveIndex < enc.cfg.waves.length)
    ? enc.cfg.waves[enc.waveIndex] : null;
}

/** 进入某一波的 telegraph：**先预规划**本波点位，再发事件（bearings 取真实方位）。 */
function enterTelegraph(enc, ctx, events) {
  const wave = encCurrentWave(enc);
  enc.phase = 'telegraph';
  enc.spawnedThisWave = 0;
  enc.emptyWave = false;
  enc.pendingTelegraph = false;
  enc.pending = [];
  if (!wave) { finishEncounter(enc, events, 'victory'); return; }
  // 2026-10-30：进波的一刻就把「本波绑定哪道防线」定死，此后直到下一波都不再改。
  //   单一数据源 = encounterLineXFor(enc, waveIndex)；后续 lineHold 的推进判据与
  //   telegraph/spawn 事件的 lineX **同读这一个值**，杜绝「生成在 A、等推进到 B」的错位。
  enc.boundLineX = encounterLineXFor(enc, enc.waveIndex);
  enc.pending = planWave(enc, ctx || {});
  enc.timer = enc.cfg.telegraphSeconds;
  const bearings = [];
  for (const u of enc.pending) if (bearings.indexOf(u.bearing) < 0) bearings.push(u.bearing);
  events.push({
    type: 'telegraph',
    wave: enc.waveIndex,
    waveId: wave.id,
    waveLabel: wave.label,
    seconds: enc.cfg.telegraphSeconds,
    bearings: bearings,
    // 本波绑定防线的 x（页面消费的唯一来源；无防线/算不出时为 null）。
    lineX: enc.boundLineX,
  });
}

/**
 * 终局收割：幂等（已有 outcome 时直接忽略），并给出统一 stats。
 *
 * @param {string} [failReason] 仅 defeat 有意义——**"为什么输"必须是一等数据**。
 *   M3-J（2026-11-03）引入：defeat 有两个性质完全不同的来源，页面必须分开处理，
 *   否则其中一条必然变成软锁（见下方 objective-lost 分支的长注释）：
 *     · 'objective-lost' —— 守点被毁。**不是玩家的死**：玩家还活着、还能开、还能打完
 *        剩下的波次，只是本节点任务失败 ⇒ 页面走「低分结算」（不 gameover）。
 *     · 'player-dead' —— 玩家 hp 归零。这是既有复活/永久死亡管线的领域，导演只报信
 *        （页面沿改前行为只记日志，结算由复活链自己驱动）。
 *   缺省（undefined）= 未分类，保守按 'player-dead' 的旧口径处理，零回归。
 */
function finishEncounter(enc, events, kind, failReason) {
  if (enc.outcome) return;
  enc.outcome = kind;
  enc.phase = kind;
  enc.timer = 0;
  if (kind === 'defeat') enc.failReason = failReason || 'player-dead';
  const ev = {
    type: kind,
    stats: { seconds: enc.elapsed, kills: enc.kills, wavesCleared: enc.wavesCleared },
  };
  // M3-E/F/G（2026-11-02）：类型专属终局载荷——页面据此给结算加成/低分结算，
  //   kind='exterminate' 时不附加任何字段（与改前逐字段一致）。
  if (enc.kind === 'defend') ev.objectiveFailed = !enc.objectiveAlive;
  if (enc.kind === 'capture') ev.captureDone = enc.captureDone;
  if (enc.kind === 'breakthrough') ev.reason = (kind === 'settlement') ? 'timeout' : 'exit';
  if (kind === 'defeat') ev.failReason = enc.failReason;
  events.push(ev);
}

/**
 * 推进一帧。
 * @param {EncounterState} enc
 * @param {number} dt 秒
 * @param {{playerPos?:{x:number,y:number}, playerAlive?:boolean, enemyAlive?:number,
 *          allyAlive?:number, world?:{w:number,h:number}, isBlocked?:(x:number,y:number)=>boolean,
 *          objectiveAlive?:boolean, captureDone?:number, reachedExit?:boolean}} ctx
 * @returns {EncounterEvent[]} 本帧事件（无事件时为 []）
 */
function updateEncounter(enc, dt, ctx) {
  const events = [];
  if (!enc) return events;
  if (enc.outcome) return events;                                  // ⑤ 幂等：终局后不再产任何事件
  const c = ctx || {};
  const step = Math.max(0, encNum(dt, 0));
  enc.elapsed += step;

  if (c.playerAlive === false) {                                   // ④ 玩家阵亡：任何阶段都直接判负
    finishEncounter(enc, events, 'defeat', 'player-dead');
    return events;
  }

  // ---- M3-E/F/G 类型胜利条件（2026-11-02；kind='exterminate' 全部跳过，零回归）----
  //   放在波次机之前：类型胜利不依赖「波次清空」，而是各自的目标条件。
  if (enc.kind === 'breakthrough') {
    if (c.reachedExit === true) { finishEncounter(enc, events, 'victory'); return events; }
    if (enc.timeLimitSeconds > 0 && enc.elapsed >= enc.timeLimitSeconds) {
      events.push({ type: 'timeout', elapsed: enc.elapsed });
      finishEncounter(enc, events, 'settlement');                  // 低分结算，不是 gameover
      return events;
    }
  }
  if (enc.kind === 'capture') {
    const done = Math.max(0, Math.round(encNum(c.captureDone, enc.captureDone)));
    enc.captureDone = Math.min(done, enc.captureTotal > 0 ? enc.captureTotal : done);
    if (enc.captureTotal > 0 && enc.captureDone >= enc.captureTotal) {
      finishEncounter(enc, events, 'victory');
      return events;
    }
    if (!enc.counterAttackFired && enc.captureTotal > 0
        && enc.captureDone / enc.captureTotal >= enc.counterAttackAt) {
      enc.counterAttackFired = true;
      events.push({ type: 'counterattack', captureDone: enc.captureDone });
    }
  }
  if (enc.kind === 'defend' && c.objectiveAlive === false && enc.objectiveAlive) {
    enc.objectiveAlive = false;
    enc.objectiveFailed = true;
    events.push({ type: 'objective-lost' });
    // M3-J（2026-11-03）：守点被毁 = 本节点**失败**（用户裁定「守住这个点」是任务的
    //   唯一实质内容；改前只把存活 bonus 归零、波全清仍判胜利 ⇒ defend 与歼灭只在
    //   加分上不同，任务语义不成立）。
    //   失败语义的**关键分叉**（这是本批最容易踩的坑，务必读完再改）：
    //     · 若这里只 `finishEncounter(...,'defeat')` 而不告诉页面"为什么输"，页面
    //       `case 'defeat'` 的既有实现只记一行日志（那是给 player-dead 用的），于是
    //       battleState 不动、不结算、battleExitReady 永不置位 ⇒ **玩家把剩下的波次
    //       打完也永远出不去**（enc.outcome 幂等 → 后续 0 事件，实测 2000 帧零事件）。
    //       这不是"以后再说"的隐患，是**确定性软锁**，必须由 failReason 分开。
    //     · 守点死 ≠ 玩家死：玩家还在场上、还能打完，所以正确处置是**低分结算**
    //       （页面复用 finishNodeTimedOut 的形态），不是 gameover、不是什么都不做。
    //   开关：RULES.nodeKinds.defend.failOnObjectiveLost（[PLACEHOLDER]，缺省 true）。
    //   零回归：仅在 kind==='defend' 且开关为 true 时触发，且此处已确认状态跃迁（幂等）。
    //   注：`enc.cfg` 是 encounter 自己的配置段（resolveEncounterConfig 产出的白名单），
    //   **不含** nodeKinds —— 类型开关必须从 RULES.nodeKinds 直读。
    const dcfg = (typeof RULES !== 'undefined' && RULES.nodeKinds && RULES.nodeKinds.defend)
      ? RULES.nodeKinds.defend : null;
    const failOnLost = dcfg ? (dcfg.failOnObjectiveLost !== false) : true;
    if (failOnLost) {
      finishEncounter(enc, events, 'defeat', 'objective-lost');
      return events;
    }
  }

  const wave = encCurrentWave(enc);
  if (!wave) { finishEncounter(enc, events, 'victory'); return events; }   // 零波防御：waves 为空

  const pp = c.playerPos || { x: 0, y: 0 };
  const px = encNum(pp.x, 0), py = encNum(pp.y, 0);

  if (enc.phase === 'telegraph') {
    if (enc.pendingTelegraph) enterTelegraph(enc, c, events);      // 首帧补发（每波恰好一条）
    // enterTelegraph 在「没有可进的波」时会把遭遇直接判成 victory（防御路径）。那一步会写
    // outcome / 改写 phase / 把 timer 归零——若这里继续往下走，条件 `timer<=0` 立刻成立，
    // 同帧就会再发出 spawn/wave-empty 并把 phase 从 victory 改回 wave（自相矛盾的事件序列）。
    // 今天两个调用点都带前置守卫、这条路径不可达，但它是**错误处理**路径，留一个出口。
    if (enc.outcome) return events;
    enc.timer = Math.max(0, enc.timer - step);
    if (enc.timer <= 0) {
      const units = applySpawnGuard(enc.pending, enc.cfg, encWorldBox(c), px, py);
      enc.spawnedThisWave = units.length;
      // #AB3：本波一个点位都没生成（`waves[i].units` 写成空数组，或 planWave 因配置异常产出空 pending）。
      //   清波判定原要求 `spawnedThisWave > 0`，于是这种波**永远不满足清波、也不判负**——
      //   无敌人、无计时、无提示，玩家只能刷新页面逃生。这里打标并补一条 `wave-empty`，
      //   让流程按「本波已清」继续推进；页面据此提示配置异常，而不是把人丢在真空里。
      enc.emptyWave = units.length === 0;
      enc.phase = 'wave';
      enc.timer = 0;                                               // ① wave 阶段 timer 语义切换为「已用秒」
      enc.intelTimer = 0;
      events.push({
        type: 'spawn',
        wave: enc.waveIndex,
        waveId: wave.id,
        units: units,
        // 本波绑定防线的 x：与同波 telegraph.lineX **同源**（都取自 enterTelegraph 写下的
        // enc.boundLineX）。页面在 spawn 时用它在绑定防线上做横向排布，不要再自行取模。
        lineX: enc.boundLineX,
      });
      if (enc.emptyWave) events.push({ type: 'wave-empty', wave: enc.waveIndex, waveId: wave.id });
    }
    return events;
  }

  if (enc.phase === 'wave') {
    enc.timer += step;
    enc.intelTimer += step;
    const iv = enc.cfg.intelInterval;
    while (iv > 0 && enc.intelTimer >= iv) {                        // ⑦ 每 intelInterval 秒一条，不多不少
      enc.intelTimer -= iv;
      events.push({ type: 'intel', wave: enc.waveIndex });
    }
    const enemyAlive = Math.max(0, Math.round(encNum(c.enemyAlive, 0)));
    if (enemyAlive === 0 && (enc.spawnedThisWave > 0 || enc.emptyWave)) {   // ② 清波判定（空波按已清处理，#AB3）
      enc.wavesCleared = enc.waveIndex + 1;
      enc.pending = [];                                            // 本波点位作废（波次结束即清空）
      events.push({ type: 'wave-clear', wave: enc.waveIndex, elapsed: enc.timer });
      if (enc.waveIndex + 1 < enc.waveCount) {
        const allyAlive = Math.max(0, Math.round(encNum(c.allyAlive, 0)));
        const reinforce = Math.max(0, enc.cfg.reinforceMinAllies - allyAlive);
        if (enc.mode === 'lines') {
          // 2026-10-30 防线式波次：清波后进入 lineHold——**不倒计时**，等玩家推进。
          //   补员/回血语义与 breather 共用（页面按 type 分支处理，字段同构）。
          events.push({ type: 'breather', seconds: 0, repairPct: enc.cfg.breatherRepairPct, reinforce: reinforce });
          enc.phase = 'lineHold';
          enc.timer = 0;
        } else {
          events.push({
            type: 'breather',
            seconds: enc.cfg.breatherSeconds,
            repairPct: enc.cfg.breatherRepairPct,
            reinforce: reinforce,
          });
          enc.phase = 'breather';
          enc.timer = enc.cfg.breatherSeconds;
        }
      } else if (enc.kind === 'capture' || (enc.kind === 'breakthrough' && enc.timeLimitSeconds > 0)) {
        // M3-F/G（2026-11-02）：波次清空 ≠ 任务完成——占领/突破的胜利条件是
        //   「拔满点 / 抵达出口」，停在 lineHold 等目标条件（页面经 ctx 注入），不在此判胜。
        events.push({ type: 'breather', seconds: 0, repairPct: enc.cfg.breatherRepairPct, reinforce: 0 });
        enc.phase = 'lineHold';
        enc.timer = 0;
      } else {
        finishEncounter(enc, events, 'victory');
      }
    }
    return events;
  }

  if (enc.phase === 'lineHold') {
    // M3-F/G：波次已全部清空、但类型目标未达成（占领未拔满 / 突破未达出口）⇒ 停在原地
    //   等目标条件，不再推进波次——否则 enterTelegraph 因「无下一波」会直接判胜。
    if (enc.waveIndex + 1 >= enc.waveCount
        && (enc.kind === 'capture' || (enc.kind === 'breakthrough' && enc.timeLimitSeconds > 0))) return events;
    // 防线驱动节拍：本波绑定的防线 = encounterLineXFor(enc, waveIndex)。
    //   玩家 x ≥ 防线 x − lineAdvanceMargin ⇒ 玩家已推进到当前防线前沿 ⇒ 发下一波 telegraph。
    //   lineXs 缺省（页面没传锚点）时退化为「清波即发」——空场不软锁。
    //   ⚠ 2026-10-30：这一段原来是内联的 `lineXs[min(waveIndex, len-1)]`，与页面
    //   tank_battle.html:3289 的 `waveIdx % lineGroups.length` 构成**两套口径**（详见
    //   encounterLineXFor 的 rationale 注释）。内联表达式已删除，改走同一个函数——
    //   此后「波绑定到哪道防线」只有这一个答案，页面读事件 lineX 即可，不可能再分叉。
    const margin = enc.cfg.lineAdvanceMargin;
    const lineX = encounterLineXFor(enc, enc.waveIndex);
    if (lineX === null || px >= lineX - margin) {
      enc.waveIndex += 1;
      enterTelegraph(enc, c, events);
    }
    return events;
  }

  if (enc.phase === 'breather') {
    enc.timer = Math.max(0, enc.timer - step);
    if (enc.timer <= 0) {                                          // ③ 喘息结束：下一波或收官
      if (enc.waveIndex + 1 < enc.waveCount) {
        enc.waveIndex += 1;
        enterTelegraph(enc, c, events);
      } else {
        finishEncounter(enc, events, 'victory');
      }
    }
    return events;
  }

  return events;                                                   // 未知阶段：静默（不做猜测性转移）
}

// ============================================================================
// P2-G 守军语义兜底（2026-11-01，PLAN §2.8.3「键名契约 v2」）—— **纯逻辑层**
//
// 背景（不重写就会重演的坑，务必先读）：
//   守军语义 = 波次敌人出生时**不预写** aiEngaged / lastKnownPlayerPos，靠既有 AI 门控
//   （距离 ≤ aiTriggerDist 且 LoS）自然点亮。前置门探针 `tmp/measure-garrison-probe.cjs`
//   （EXIT=0）实测：玩家静止 60s ⇒ **0/3 激活**，原因是静止玩家
//   `camouflageDistanceMultiplier=0.625` ⇒ 有效触发距离被压到 556px（最坏组合 267px）
//   ⇒「越龟缩越隐蔽」的正反馈死循环。
//   ⇒ 用户 2026-11-01 裁定：**采纳 1（前哨车恒接战）+ 2（超时兜底注入）+ 4（出口侧解耦），
//     不动 3（不改 camo 折扣）**。本段实现的是 **方案 2**。
//
// 三条硬约束（本段的行为口径）：
//   ① **零回归**：`RULES.encounter.garrisonMode === false` 时，本段任何函数都不得产生
//      gameplay 差异——调用方的**唯一动作是「不调用」或「调用后拿到 false 什么都不做」**。
//      本段自己不读 garrisonMode（那是页面/装配层的事），但所有判定都对「关闭态」友好：
//      `seconds <= 0` ⇒ `garrisonFallbackDue` 恒 false（默认 0 = 关闭）。
//   ② **确定性**：不用挂钟。`now` 由**调用方注入**（浏览器传 `performance.now()`、
//      Node 传 `U.simNow()` 或自造累加时钟）⇒ 同 seed + 同 now 序列 ⇒ 逐字节一致。
//   ③ **不越界**：本段**只算「该不该注入」并返回一个纯描述**，写实体字段仍由页面装配段
//      执行（沿用「导演不碰 entities」的分层纪律，见文件头）。唯一的例外是
//      `garrisonFallbackApply`——它是**可选的**写操作助手，页面不调用即不写。
//
// ⚠ 探针查明的两个不可当真的字段（防踩）：
//   · `aiState` **不可当行为读**（`js/tank_ai.js:1282` 缺省 'patrol'、`:1419` 原样赋回）
//     ⇒ 判「是否已被点亮」只看 `aiEngaged`，不看 aiState。
//   · `_propagateEngage`（`js/tank_ai.js:1013`，r=420/p=0.7）会在**别的车**的 aiDecideEnemy
//     内跨实体写 aiEngaged ⇒ 逐车 engagedBefore 快照会漏记；但**本段的判定不依赖快照**，
//     它每帧只读 `e.aiEngaged` 当前值，天然免疫该问题。
// ============================================================================

/**
 * 兜底计时器状态（**外部持有**，不挂在实体上）。
 *
 * 为什么外部持有：实体字段由 `js/tank_schema.js` 的 FIELD_ROWS 管，往里加本批临时字段
 *   会污染存档/设计器；且 `spawnTank` 不写出生时间（`js/tank_entity.js:18` 只存位置快照）
 *   ⇒ 出生时刻只能由装配侧记账。外部 Map 也让「波清后整体重置」变成一行 `new Map()`。
 *
 * @typedef {Map<string|number, {bornAtMs:number, fired:boolean}>} GarrisonFallbackBook
 */

/**
 * 守军入场登记：记录出生时刻。**幂等**——已登记过的不覆盖（重复调用不会重置计时）。
 *
 * 幂等的理由：页面装配可能在「预规划」与「实际 spawn」两处都调一次；若覆盖，
 *   兜底计时会被无限推迟 ⇒ 兜底永不生效（静默失效，最难查的那种）。
 *
 * @param {GarrisonFallbackBook} book
 * @param {{id?:string|number}} entity
 * @param {{now?:number}} [clock] `now` = 毫秒
 * @returns {boolean} 本次是否新登记（false = 之前已登记过）
 */
function garrisonFallbackTrack(book, entity, clock) {
  if (!book || typeof book.set !== 'function') return false;
  if (!entity || entity.id === undefined || entity.id === null) return false;
  const now = encNum(clock && clock.now, NaN);
  if (!Number.isFinite(now)) return false;                  // 无时钟 ⇒ 拒绝记账（不静默塞 0）
  if (book.has(entity.id)) return false;
  book.set(entity.id, { bornAtMs: now, fired: false });
  return true;
}

/**
 * **兜底判定（纯函数，Node 可测）**：守军单位自入场起超过 `seconds` 秒仍未点亮 ⇒ 到期。
 *
 * 判定口径（逐条对齐 `alertEntity` 语义，见 `js/tank_ai.js:1894-1920`）：
 *   · 「已点亮」= `e.aiEngaged === true`（**不看 aiState**，理由见上方探针结论）；
 *   · 单位：**毫秒**。调用方注入的 `now` 与登记时的 `bornAtMs` 同单位；
 *   · `seconds <= 0` ⇒ **恒 false**（默认 0 = 关闭兜底，零回归）；
 *   · 已注入过的单位 ⇒ 恒 false（`fired` 幂等，不重复注入）；
 *   · 未登记 / 已死 / 时钟非法 ⇒ 恒 false（**全部拒绝，不猜**）。
 *
 * @param {{id?:string|number, hp?:number, aiEngaged?:boolean}} entity
 * @param {{now?:number, seconds?:number, book?:GarrisonFallbackBook}} [opts]
 * @returns {boolean} 是否需要注入玩家方位
 */
function garrisonFallbackDue(entity, opts) {
  const o = opts || {};
  const seconds = encNum(o.seconds, 0);
  if (!(seconds > 0)) return false;                          // 关闭态 / 非法值 ⇒ 不注入
  if (!entity || entity.id === undefined || entity.id === null) return false;
  if (typeof entity.hp === 'number' && !(entity.hp > 0)) return false;   // 已阵亡
  if (entity.aiEngaged === true) return false;               // 已点亮 ⇒ 不需要兜底
  const rec = (o.book && typeof o.book.get === 'function') ? o.book.get(entity.id) : null;
  if (!rec || rec.fired) return false;                       // 未登记 / 已注入过
  const now = encNum(o.now, NaN);
  if (!Number.isFinite(now)) return false;                   // 无注入时钟 ⇒ 拒绝（不用 Date.now 兜）
  const elapsedSec = (now - rec.bornAtMs) / 1000;
  return elapsedSec >= seconds;
}

/**
 * **兜底注入（可选写操作）**：按 `alertEntity` 语义把玩家方位写进守军单位，并标记已注入。
 *
 * 为什么字段是这四个（`aiEngaged` / `lastKnownPlayerPos` / `alertLevel` / `_threatDir`）：与
 *   `js/tank_ai.js:1894-1920` 的 `alertEntity` **逐字段对齐**——受击警觉是既有第二通道，
 *   兜底只是「用一个计时器代替那颗子弹」，注入后的行为与被打醒完全一致，不引入新行为分支。
 *
 * ⚠ `_threatDir` **必须补写**（Lead 2026-11-01 裁定 2）：它是 `tank_ai.js:1081` 的
 *   「炮塔优先指向」字段（`turretDesired = _threatDir !== undefined ? _threatDir : heading`，
 *   对准后按 `:1084` 自动清空）。**只写 `lastKnownPlayerPos` 不等价**：缺失它时炮塔要等
 *   search 推进到记忆点才转，慢一拍；而「被发现那一刻炮塔立刻转过来指着你」
 *   正是守军感最值钱的演出。
 *
 * ⚠ `_threatDir` 的**类型是弧度角，不是单位向量**（裁定原文写「单位向量」，与代码不符，
 *   此处**以代码为准**）：`tank_ai.js:1917` 写 `Math.atan2(srcY - t.y, srcX - t.x)`，
 *   消费端当角度直接比较（`:1083`）。写成 `{x,y}` 会让炮塔转向 NaN ⇒ 静默不转，最难查。
 *
 * ⚠ 不直接调用 `alertEntity`（Lead 裁定 1 确认维持）：它是 `tank_ai.js` 内部函数，且带的
 *   `reactionAlertMul` 反应延迟**恰恰应当保留**——被计时器唤醒不该比被子弹打醒更快，
 *   否则「无理由瞬间锁定」会穿透隐蔽机制的设计意图。⇒ 绕开它是对的，但字段要补齐。
 *
 * @param {{id?:string|number, hp?:number, aiEngaged?:boolean, alertLevel?:number,
 *          lastKnownPlayerPos?:{x:number,y:number}, x?:number, y?:number, _threatDir?:number}} entity
 * @param {{now?:number, playerPos?:{x:number,y:number}, book?:GarrisonFallbackBook}} [opts]
 * @returns {boolean} 是否真的写入（false = 不该写 / 写不动）
 */
function garrisonFallbackApply(entity, opts) {
  const o = opts || {};
  if (!entity || entity.id === undefined || entity.id === null) return false;
  if (typeof entity.hp === 'number' && !(entity.hp > 0)) return false;
  const p = o.playerPos;
  if (!p || !Number.isFinite(encNum(p.x, NaN)) || !Number.isFinite(encNum(p.y, NaN))) return false;
  entity.aiEngaged = true;
  entity.alertLevel = 3;
  entity.lastKnownPlayerPos = { x: encNum(p.x, 0), y: encNum(p.y, 0) };
  // 炮塔立即指向威胁（与 alertEntity 同语义：**弧度角**）。单位坐标缺失时跳过——
  //   宁可不转炮塔，也不写 NaN 让整条转向链路静默失效。
  const ex = encNum(entity.x, NaN), ey = encNum(entity.y, NaN);
  if (Number.isFinite(ex) && Number.isFinite(ey)) {
    entity._threatDir = Math.atan2(encNum(p.y, 0) - ey, encNum(p.x, 0) - ex);
  }
  const rec = (o.book && typeof o.book.get === 'function') ? o.book.get(entity.id) : null;
  if (rec) rec.fired = true;                                 // 幂等标记（无 book 时不崩）
  return true;
}

/**
 * **前哨车（vanguard）编成**：从本波单位里挑出前 `count` 辆作反冲击前锋。
 *
 * 口径（§2.8.3 裁定⑦⑧ + ⑩）：
 *   · 数量 = `min(本波总敌数, garrisonVanguard.count)`；**末波强制 0**（裁定⑩）；
 *   · 前锋**不守军化**——仍按现状语义强制 `aiEngaged=true`、恒主动压上；
 *   · 出生位 = 所属防御点 x **+ aheadOffsetPx**，**只沿 +x**（推进轴）。
 *     ⚠ 往 -x 偏移 = 在玩家背后刷怪，§4.187 实测踩过
 *     （`DEVELOPMENT-batches-2026-10.md:4948` 明写「往 -x 会从背后刷怪」）
 *     ⇒ **负值一律钳到 0**，不静默照搬。
 *
 * 纯函数：**不改入参**，返回带 `role` 与（前锋）已前出 `x` 的**新数组副本**。
 *
 * @param {Array<{cls:string, x:number, y:number, hullAngle:number, bearing:number}>} units 本波单位
 * @param {{count?:number, aheadOffsetPx?:number}} [vanguardCfg] RULES.encounter.garrisonVanguard
 * @param {{isLastWave?:boolean, world?:{w:number,h:number}, margin?:number}} [opts]
 * @returns {Array<{cls:string, x:number, y:number, hullAngle:number, bearing:number, role:'vanguard'|'garrison'}>}
 */
function garrisonAssignVanguards(units, vanguardCfg, opts) {
  const list = Array.isArray(units) ? units : [];
  const o = opts || {};
  const cfg = vanguardCfg || {};
  const want = Math.max(0, Math.round(encNum(cfg.count, 0)));
  // 末波强制 0（裁定⑩：其后无防线可出前锋）；want=0 时全员守军。
  const n = o.isLastWave === true ? 0 : Math.min(want, list.length);
  // 前出距离：负值钳 0（拒绝反向 ⇒ 绝不在玩家背后刷怪）。
  const off = Math.max(0, encNum(cfg.aheadOffsetPx, 0));
  // 前出后仍要留在场内：`maxX` = 世界宽 − 边距。
  //   ⚠ 边距缺省取 SPAWN_EDGE_MARGIN（40，同一常量）——不是 0。贴边生成会被
  //   border 判定 / movement clamp 卡住半截身子在场外（§4.187 实测教训），
  //   让调用方「忘了传 margin」就踩坑是不可接受的缺省。
  const margin = o.margin !== undefined ? encNum(o.margin, SPAWN_EDGE_MARGIN) : SPAWN_EDGE_MARGIN;
  const maxX = Number.isFinite(encNum(o.world && o.world.w, NaN))
    ? encNum(o.world.w, Infinity) - margin
    : Infinity;
  const out = [];
  for (let i = 0; i < list.length; i++) {
    // ⚠ 不要用 `list[i] || {}`：那会把类型塌成 `{}`，tsc 立刻报「x 不存在于 {}」。
    //   显式判空 + continue 同样防御脏数据，且类型保持诚实。
    const u = list[i];
    if (!u) continue;
    const isVan = i < n;
    const nx = isVan && off > 0 ? Math.min(u.x + off, maxX) : u.x;   // 前出后仍不出界
    out.push({
      cls: u.cls,
      x: nx,
      y: u.y,
      bearing: u.bearing,
      // 朝向刷新：前出后仍指向玩家（applySpawnGuard 会再刷一次，这里保证副本自洽）
      hullAngle: u.hullAngle,
      role: isVan ? 'vanguard' : 'garrison',
    });
  }
  return out;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    createEncounter,
    updateEncounter,
    resolveEncounterConfig,
    encounterRNG,
    ENCOUNTER_PHASES,
    ENCOUNTER_DEFAULTS,
    INTEL_MIN_SECONDS,
    LINE_ADVANCE_MARGIN_FALLBACK,
    SPAWN_EDGE_MARGIN,
    SPAWN_MIN_SEPARATION,
    UNIT_SPREAD_PX,
    BEARING_FALLBACK_OFFSETS,
    // 2026-10-30 P1-F：波↔防线绑定单一数据源。纯增补，既有导出一个没删（向后兼容）。
    encounterLineXFor,
    // 2026-11-01 P2-G 守军语义兜底（契约 v2 / PLAN §2.8.3）。纯增补，既有导出一个没删。
    garrisonFallbackTrack,
    garrisonFallbackDue,
    garrisonFallbackApply,
    garrisonAssignVanguards,
  };
}

// 浏览器全局导出（与既有 js/ 模块同款双导出口径）。
//   role-combat 在 tank_battle.html 里可直接用全局名；Node 侧走上面 module.exports。
//   页面侧的降级路径：`typeof garrisonFallbackDue !== 'function'` ⇒ 退回现状语义，不崩。
if (typeof globalThis !== 'undefined') {
  globalThis.garrisonFallbackTrack = garrisonFallbackTrack;
  globalThis.garrisonFallbackDue = garrisonFallbackDue;
  globalThis.garrisonFallbackApply = garrisonFallbackApply;
  globalThis.garrisonAssignVanguards = garrisonAssignVanguards;
}
