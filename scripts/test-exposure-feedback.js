// test-exposure-feedback.js — 玩家侧暴露度反馈（P0，2026-10-27）回归
//
// 背景（用户「这个机制感觉不对但说不清哪里」的诊断结论）：
//   隐蔽机制在**判定层**是通的（确实把敌方首次激活距离从 700 压到 380~660px），
//   但玩家侧**零反馈**——不知道当前隐蔽值、不知道是否已被发现、不知道附近有谁在警戒。
//   ⇒ 系统「能算」但玩家「看不懂」。P0 的职责就是补这条可读性链路。
//
// 本测试锁住三条纪律：
//   ① **纯增量**：本机制不得改变任何 AI 判定（触发距离 / 视线 / 命中）——只读不写。
//   ② **口径同源**：读数必须与 tank_ai.js 的 enterDCamo 同源（不得出现「HUD 一套、
//      机制另一套」的两套口径——ISSUES #Z2 的教训）。
//   ③ **事实优先**：分档主判据是「是否已被发现」这个二值事实，连续量（距离比）只作次要参考。
//
// 覆盖：
//   A) 有效触发距离口径（与 tank_ai.js enterDCamo 逐项对齐）
//   B) 分档判据（hidden / exposed / detected 三档 + 边界值）
//   C) 负向断言：Boss 不计入、友军不计入、死亡实体不计入、symmetric 关闭时敌方不吃隐蔽
//   D) 读数连续性：静止 > 行驶 > 疾驰 的暴露度单调性
'use strict';

require('../js/tank_rules.js');
require('../js/tank_utils.js');
const U = require('../js/tank_utils.js');
const RULES_MOD = require('../js/tank_rules.js');
global.RULES = RULES_MOD.RULES;
global.TAU = U.TAU;
global.rotate = U.rotate;
global.partCorners = U.partCorners;
global.distToSegment = U.distToSegment;
global.segRayIntersect = U.segRayIntersect;
global.partEdges = U.partEdges;
global.norm = U.norm;
global.angDiff = U.angDiff;
global.reflectDir = U.reflectDir;
global.simNow = U.simNow; global.setSimNow = U.setSimNow;

const COVER = require('../js/tank_cover.js');
global.COVER_TIERS = COVER.COVER_TIERS;
global.covers = COVER.covers;
global.getCoverUnderTank = COVER.getCoverUnderTank;
global.smokeClouds = COVER.smokeClouds;
const G = require('../js/tank_geometry.js');
global.polyCorners = G.polyCorners;
global.coverCorners = COVER.coverCorners;
global.camouflageDistanceMultiplier = COVER.camouflageDistanceMultiplier;
global.camouflageValue = COVER.camouflageValue;

const EX = require('../js/tank_exposure.js');
const { exposureFor, playerEffectiveTriggerDist, EXPOSURE_HIDDEN_RATIO, EXPOSURE_DETECTED_RATIO } = EX;

let fails = 0;
function ok(cond, label) {
  if (cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}`); fails++; }
}
function section(t) { console.log(`\n== ${t} ==`); }

const R = RULES_MOD.RULES;
const VMAX = 120 * R.speed.pxFactor * R.speed.effMul;   // 实机满油门 px/s

function mkPlayer(over) {
  return Object.assign({
    x: 0, y: 0, speed: 0, team: 'player', vehicleClass: 'medium',
    hullLen: 60, hullWid: 38, hp: 100, stats: { maxSpeed: 120 },
  }, over || {});
}
function mkEnemy(over) {
  return Object.assign({
    x: 500, y: 0, team: 'enemy', hp: 100, aiEngaged: false,
    alertLevel: 0, aiState: 'patrol', aiTriggerDist: 700,
  }, over || {});
}

// ============================================================ A) 有效触发距离口径
section('A) 有效触发距离：与 tank_ai.js enterDCamo 同源');

{
  const p = mkPlayer({ speed: 0 });
  const e = mkEnemy({ x: 500 });
  const r = playerEffectiveTriggerDist(p, [e]);
  const camoMul = COVER.camouflageDistanceMultiplier(p);
  ok(r.base === 700, `基线取实体 aiTriggerDist(700) → ${r.base}`);
  ok(Math.abs(r.dist - 700 * camoMul) < 1e-6,
    `有效距离 = enterD × camoMul = ${(700 * camoMul).toFixed(1)}px（实得 ${r.dist.toFixed(1)}）`);
  ok(Math.abs(r.ratio - camoMul) < 1e-9, `ratio = 有效距离 ÷ 基线 = ${r.ratio.toFixed(3)}`);
}

{
  // 无敌方时回退基线，且不抛错
  const r = playerEffectiveTriggerDist(mkPlayer(), []);
  ok(r && r.base === 700 && r.source === 'base', '无敌方 ⇒ 回退 triggerDistBase(700)');
  ok(playerEffectiveTriggerDist(null, []) === null, 'player 为 null ⇒ 返回 null（不抛错）');
}

{
  // 难度缩放：aiTriggerDist 更大的敌方 ⇒ 有效距离更长（更危险）
  const p = mkPlayer({ speed: 0 });
  const near = playerEffectiveTriggerDist(p, [mkEnemy({ x: 200, aiTriggerDist: 700 })]);
  const far  = playerEffectiveTriggerDist(p, [mkEnemy({ x: 200, aiTriggerDist: 1120 })]);
  ok(far.dist > near.dist, `难度高（aiTriggerDist 1120）的有效距离 ${far.dist.toFixed(0)} > 难度低 ${near.dist.toFixed(0)}`);
}

{
  // 取最近敌方而非最远敌方（对玩家而言「最危险的那台」决定暴露程度）
  const p = mkPlayer({ speed: 0 });
  const list = [mkEnemy({ x: 900, aiTriggerDist: 1120 }), mkEnemy({ x: 100, aiTriggerDist: 700 })];
  const r = playerEffectiveTriggerDist(p, list);
  ok(r.base === 700, '取最近敌方的 aiTriggerDist（900px 那台不参与）');
}

// ============================================================ B) 分档判据
section('B) 分档判据：hidden / exposed / detected');

{
  // 静止 + 裸地 + 无敌人关注 ⇒ 中坦 camo 0.6 ⇒ ratio 0.625 ≤ 0.72 ⇒ hidden
  const p = mkPlayer({ speed: 0 });
  const r = exposureFor(p, [mkEnemy({ x: 500 })]);
  ok(r.level === 'hidden', `静止中坦（ratio ${r.ratio.toFixed(3)}）⇒ ${r.level}`);
  ok(r.label === '隐蔽' && r.tone === 'safe', `标签/色调：${r.label}/${r.tone}`);
  ok(r.spotted === false && r.watchers === 0, '未被察觉');
}

{
  // 疾驰 ⇒ camo 0.2 ⇒ ratio 0.833 > 0.72 ⇒ exposed
  const p = mkPlayer({ speed: VMAX });
  const r = exposureFor(p, [mkEnemy({ x: 500 })]);
  ok(r.level === 'exposed', `疾驰中坦（ratio ${r.ratio.toFixed(3)}）⇒ ${r.level}`);
}

{
  // 事实优先：任一敌方已接战 ⇒ detected，**无论距离比多低**
  const p = mkPlayer({ speed: 0 });   // 静止 ⇒ ratio 0.625（hidden 区间）
  const r = exposureFor(p, [mkEnemy({ x: 500, aiEngaged: true })]);
  ok(r.level === 'detected', `已接战 ⇒ ${r.level}（距离比 ${r.ratio.toFixed(3)} 仍不改变结论）`);
  ok(r.spotted === true && r.watchers === 1, `spotted=${r.spotted} watchers=${r.watchers}`);
}

{
  // alertLevel 3（受击惊醒）同样算「已锁定」
  const r = exposureFor(mkPlayer({ speed: 0 }), [mkEnemy({ x: 500, alertLevel: 3 })]);
  ok(r.level === 'detected', `alertLevel=3 ⇒ ${r.level}`);
}

{
  // 有敌人在搜索（aiState='search'）⇒ 至少 exposed，不显示「隐蔽」
  const r = exposureFor(mkPlayer({ speed: 0 }), [mkEnemy({ x: 500, aiState: 'search', alertLevel: 1 })]);
  ok(r.level === 'exposed', `敌人在搜索 ⇒ ${r.level}（不显示隐蔽）`);
  ok(r.suspect === 1, `suspect=${r.suspect}`);
}

{
  // 阈值边界：ratio 恰好等于阈值时的归类
  const p = mkPlayer({ speed: 0 });
  const e = mkEnemy({ x: 500 });
  const raw = playerEffectiveTriggerDist(p, [e]);
  ok(Math.abs(EXPOSURE_HIDDEN_RATIO - 0.72) < 1e-9, `hidden 阈值 = ${EXPOSURE_HIDDEN_RATIO}`);
  ok(Math.abs(EXPOSURE_DETECTED_RATIO - 1.00) < 1e-9, `detected 阈值 = ${EXPOSURE_DETECTED_RATIO}`);
  ok(raw.ratio <= EXPOSURE_HIDDEN_RATIO, `静止中坦 ratio ${raw.ratio.toFixed(3)} ≤ 0.72（落在 hidden 边界内）`);
}

// ============================================================ C) 负向断言
section('C) 负向断言：Boss / 友军 / 死亡实体 / 对称化开关');

{
  const r = exposureFor(mkPlayer({ speed: 0 }), [mkEnemy({ x: 500, isBoss: true, aiEngaged: true })]);
  ok(r.watchers === 0, 'Boss 不计入 watchers（Boss 独立观瞄，不吃玩家隐蔽）');
}

{
  const r = exposureFor(mkPlayer({ speed: 0 }), [mkEnemy({ x: 500, team: 'ally' })]);
  ok(r.watchers === 0 && r.suspect === 0, '友军不计入（team 过滤）');
}

{
  const r = exposureFor(mkPlayer({ speed: 0 }), [mkEnemy({ x: 500, hp: 0, aiEngaged: true })]);
  ok(r.watchers === 0, '死亡敌人不计入');
}

{
  // 对称化关闭（现行口径）⇒ 敌方隐蔽值不影响玩家暴露度读数
  ok(R.camouflage.symmetric === false, 'RULES.camouflage.symmetric 缺省 false');
  const p = mkPlayer({ speed: 0 });
  const withCamoEnemy = exposureFor(p, [mkEnemy({ x: 500, vehicleClass: 'light' })]);
  const plain = exposureFor(p, [mkEnemy({ x: 500 })]);
  ok(withCamoEnemy.effDist === plain.effDist,
    `symmetric 关闭 ⇒ 敌方隐蔽不改变玩家有效距离（${withCamoEnemy.effDist.toFixed(1)} = ${plain.effDist.toFixed(1)}）`);
}

{
  // 纯增量纪律：本模块不得改写任何实体字段
  const p = mkPlayer({ speed: 0 });
  const e = mkEnemy({ x: 500 });
  const before = JSON.stringify({ p:{ aiEngaged:p.aiEngaged, alertLevel:p.alertLevel, x:p.x, speed:p.speed },
                                  e:{ aiEngaged:e.aiEngaged, alertLevel:e.alertLevel, x:e.x, aiTriggerDist:e.aiTriggerDist } });
  exposureFor(p, [e]);
  const after = JSON.stringify({ p:{ aiEngaged:p.aiEngaged, alertLevel:p.alertLevel, x:p.x, speed:p.speed },
                                 e:{ aiEngaged:e.aiEngaged, alertLevel:e.alertLevel, x:e.x, aiTriggerDist:e.aiTriggerDist } });
  ok(before === after, '调用 exposureFor 后实体状态零改写（纯读）');
}

// ============================================================ D) 读数连续性
section('D) 暴露度单调性：静止 > 行驶 > 疾驰');

{
  const e = mkEnemy({ x: 500 });
  const idle  = exposureFor(mkPlayer({ speed: 0 }),       [e]);
  const move  = exposureFor(mkPlayer({ speed: VMAX * 0.4 }), [e]);
  const sprint= exposureFor(mkPlayer({ speed: VMAX }),    [e]);
  ok(idle.ratio < move.ratio && move.ratio < sprint.ratio,
    `ratio 递增（隐蔽越低越危险）：静止 ${idle.ratio.toFixed(3)} < 行驶 ${move.ratio.toFixed(3)} < 疾驰 ${sprint.ratio.toFixed(3)}`);
  // ⚠️ 方向：camo 越高 ⇒ 有效发现距离**越短**（越安全）⇒ 静止 camo 0.6 最高 ⇒ 有效距离最短。
  ok(idle.effDist < move.effDist && move.effDist < sprint.effDist,
    `有效距离递增（越暴露越容易被发现）：静止 ${idle.effDist.toFixed(0)} < 行驶 ${move.effDist.toFixed(0)} < 疾驰 ${sprint.effDist.toFixed(0)}`);
  ok(idle.level === 'hidden' && sprint.level === 'exposed',
    `分档：静止=${idle.level} 疾驰=${sprint.level}`);
}

{
  // 开火惩罚：刚开火 ⇒ camo 暴跌 ⇒ 有效距离拉长 ⇒ 暴露度上升
  const e = mkEnemy({ x: 500 });
  const before = exposureFor(mkPlayer({ speed: 0 }), [e]);
  const after  = exposureFor(mkPlayer({ speed: 0, lastFireAt: U.simNow() }), [e]);
  ok(after.effDist > before.effDist,
    `刚开火 ⇒ 有效距离拉长（${before.effDist.toFixed(0)} → ${after.effDist.toFixed(0)}）`);
  ok(after.ratio > before.ratio, `ratio 上升（${before.ratio.toFixed(3)} → ${after.ratio.toFixed(3)}）`);
}

// ============================================================ E) 接线契约
section('E) 页面接线契约：battle 与 3D 都必须有暴露度读数出口');

{
  const fs = require('fs');
  const path = require('path');
  const battle = fs.readFileSync(path.join(__dirname, '..', 'tank_battle.html'), 'utf8');
  const threeD = fs.readFileSync(path.join(__dirname, '..', 'tank_3d.html'), 'utf8');

  ok(/tank_exposure\.js/.test(battle), 'battle 页加载 js/tank_exposure.js');
  ok(/tank_exposure\.js/.test(threeD), '3D 页加载 js/tank_exposure.js');

  ok(/id="exposureHud"/.test(battle), 'battle 页存在 #exposureHud 容器');
  ok(/id="exposureHud"/.test(threeD), '3D 页存在 #exposureHud 容器');
  ok(/exposureFor\s*\(/.test(battle), 'battle 页调用 exposureFor');
  ok(/exposureFor\s*\(/.test(threeD), '3D 页调用 exposureFor');
}

console.log(`\n${fails === 0 ? 'ALL PASS' : 'FAILURES: ' + fails}`);
if (fails > 0) process.exitCode = 1;
