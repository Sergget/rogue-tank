'use strict';

// measure-perception.cjs — 感知 / 隐蔽数值探针（数据工具，不含断言，只打印数字）
//
// 为什么需要它：#AB18「`LOS_HULL_Z` 在生产代码零调用」的结论在 docs/ISSUES.md 里只有文字，
//   没有可复现的射线对照。本脚本把三件事一次跑出来，用来复核 #AB18 的三条候选裁定
//   （① 维持现状 + 改文档措辞 / ② 仅「主动隐蔽」时降档到车体口径 / ③ 分部位可见性）：
//     §1 各 tier 高度 vs 视线分档阈值（谁挡炮塔、谁只挡车体）
//     §2 玩家隐蔽值 → 敌方有效触发距离（八种状态的实际数字）
//     §3 同一射线「AI 实际调用（不传 targetZ）」与「传 LOS_HULL_Z」的结果差 —— #AB18 的核心证据
//     §4 玩家侧反馈通道现状（2026-10-29 复核：暴露度 HUD 已落地，见 §4.169）
//
// 纪律（踩过的坑）：
//   · **模拟时钟注入** `setSimNow(0)`：开火惩罚窗口读的是模拟时钟，不注入则两次运行结果不同
//     （旧版一次性探针读真实时钟，`刚开火` 那一行每次都可能落到窗口内外）。
//   · **只读**：不写任何实体字段、不进 `entities`；唯一副作用是往 `covers` 塞一个临时灌木，
//     末尾 `resetCovers()` 清掉。
//   · **不改判定**：本脚本不参与 `npm test`，数字变了不等于缺陷——先看 `docs/ISSUES.md` #AB18
//     的裁定状态再决定是否要改代码。
//
// 用法：node scripts/measure-perception.cjs
// 输出：§1~§4 的表格。结论归口 `docs/ISSUES.md` #AB18 与 `specs/combat/hud-ui.md`。

const U = require('../js/tank_utils.js');
const RULES_MOD = require('../js/tank_rules.js');
const RULES = RULES_MOD.RULES;

// 加载约定照 scripts/test-vision-stealth-p1.js：RULES 必须先进全局再 require 依赖模块
global.RULES = RULES;
global.TAU = U.TAU;
global.partCorners = U.partCorners;
global.distToSegment = U.distToSegment;
global.segRayIntersect = U.segRayIntersect;
global.norm = U.norm;
global.angDiff = U.angDiff;
global.rotate = U.rotate;
global.simNow = U.simNow;
global.setSimNow = U.setSimNow;

const COVER = require('../js/tank_cover.js');
global.COVER_TIERS = COVER.COVER_TIERS;
global.covers = COVER.covers;
global.getCoverUnderTank = COVER.getCoverUnderTank;

const G = require('../js/tank_geometry.js');
global.polyCorners = G.polyCorners;
global.coverCorners = COVER.coverCorners;

// 确定性：把模拟时钟钉在 0，开火惩罚窗口与「刚开火」用例可复现
U.setSimNow(0);

const R = RULES;

// ---------- §1 各 tier 高度 vs 视线分档阈值 ----------
console.log('=== 1) 各 tier 高度 vs 视线分档阈值 ===');
console.log(`LOS_EYE_Z(观察者)=${COVER.LOS_EYE_Z}  LOS_TARGET_Z(看炮塔)=${COVER.LOS_TARGET_Z}  LOS_HULL_Z(看车体)=${COVER.LOS_HULL_Z}`);
console.log('  判据：hasLineOfSight 用 needZ = min(eyeZ, targetZ)，coverHeight ≥ needZ 才挡');
const tiers = R.coverTiers || {};
for (const k of Object.keys(tiers)) {
  const t = tiers[k];
  if (!t.vision) continue;
  const h = t.height;
  const blkTurret = h >= COVER.LOS_TARGET_Z;
  const blkHull = h >= COVER.LOS_HULL_Z;
  console.log(`  ${k.padEnd(16)} h=${String(h).padEnd(5)} 挡炮塔视线=${blkTurret ? '是' : '否'}  挡车体视线=${blkHull ? '是' : '否'}`);
}

// ---------- §2 玩家隐蔽值 → 敌方有效触发距离 ----------
console.log('\n=== 2) 玩家隐蔽值 → 敌方有效触发距离 ===');
const VMAX = 120 * R.speed.pxFactor * R.speed.effMul;   // 实机满油门 px/s（stats.maxSpeed 单位 km/h）
const mk = (over) => Object.assign({
  x: 0, y: 0, vx: 0, vy: 0, speed: 0, mass: 20, vehicleClass: 'medium', team: 'player',
  hullLen: 60, hullWid: 38, hp: 100, lastFireAt: null,
  stats: { maxSpeed: 120 }
}, over || {});
const cases = [
  ['中坦 · 疾驰 · 裸地', mk({ speed: VMAX })],
  ['中坦 · 行驶 · 裸地', mk({ speed: VMAX * 0.4 })],
  ['中坦 · 静止 · 裸地', mk({ speed: 0 })],
  ['轻坦 · 静止 · 裸地', mk({ speed: 0, vehicleClass: 'light' })],
  ['重坦 · 静止 · 裸地', mk({ speed: 0, vehicleClass: 'heavy' })],
  ['中坦 · 刚开火 · 裸地', mk({ speed: 0, lastFireAt: U.simNow() })]
];
const trigBase = 700;   // RULES.ai.triggerDistBase 的展示基准
console.log(`  （实机满油门 = ${VMAX.toFixed(1)}px/s；基准触发距离 ${trigBase}px）`);
for (const [label, t] of cases) {
  const camo = COVER.camouflageValue(t);
  const mul = COVER.camouflageDistanceMultiplier(t);
  const motion = COVER.camouflageMotionOf(t);
  console.log(`  ${label.padEnd(22)} 运动档=${motion.padEnd(6)} camo=${camo.toFixed(3)} 视距倍率=${mul.toFixed(3)} 触发距离 ${trigBase}→${(trigBase * mul).toFixed(0)}px`);
}

// ---------- §3 灌木挡不挡视线（#AB18 的核心证据） ----------
console.log('\n=== 3) 灌木能否挡住视线（AI 实际调用方式 vs 传 targetZ）===');
if (typeof COVER.resetCovers === 'function') COVER.resetCovers();
COVER.covers.push({ x: 0, y: 0, w: 120, h: 120, tier: 'bush', hp: 10, angle: 0, verts: null });
const losDefault = COVER.hasLineOfSight(-100, 0, 100, 0, null);
const losHull = COVER.hasLineOfSight(-100, 0, 100, 0, null, { targetZ: COVER.LOS_HULL_Z });
console.log(`  灌木 1.2m；射线 (-100,0)→(100,0) 穿过它`);
console.log(`  AI 实际调用 hasLineOfSight(x,y,tx,ty) —— 无 targetZ ⇒ needZ=${Math.min(COVER.LOS_EYE_Z, COVER.LOS_TARGET_Z)}`);
console.log(`    结果 = ${losDefault}  ⇒ ${losDefault ? '看得见（炮塔 2.3m 露出灌木）' : '被挡住'}`);
console.log(`  同一条射线传 targetZ=LOS_HULL_Z(${COVER.LOS_HULL_Z}) ⇒ needZ=${Math.min(COVER.LOS_EYE_Z, COVER.LOS_HULL_Z)}`);
console.log(`    结果 = ${losHull}  ⇒ ${losHull ? '看得见' : '被挡住（车体 1.0m 被 1.2m 灌木遮住）'}`);
console.log(`  ⇒ 两者的差异就是 #AB18：分级机制存在，但生产侧从不走车体口径`);
if (typeof COVER.resetCovers === 'function') COVER.resetCovers();

// ---------- §4 玩家侧反馈通道现状 ----------
console.log('\n=== 4) 玩家侧反馈通道现状（2026-10-29 复核）===');
console.log('  ✅ 玩家侧暴露度指示器：已落地（§4.169 / specs/combat/hud-ui.md「玩家侧暴露度指示器」）');
console.log('     js/tank_exposure.js 的 exposureFor() 输出 隐蔽 / 暴露 / 被察觉 三档，battle 与 3D 两页均有 #exposureHud');
console.log('  ⚠️ 敌方警戒图标 alertIndicatorFor：仅 battle 页接线，3D 页仍无（R1 切片遗留）');
console.log('  ❌ 敌方视锥 / 侦测进度条：不存在');
console.log('  ❌ 被发现瞬间的专属提示：不存在（只有敌人头顶 ? / ! 的事后标记）');

console.log('\n结论以 docs/ISSUES.md #AB18 的裁定为准（维持现状 / 条件降档 / 分部位可见性）；本脚本只提供数字。');
