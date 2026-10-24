// test-alert-indicator.js — 敌方警戒状态 UI 指示（? / !）回归：#P2 2026-10-24
//
// 需求（用户）：「为敌人的警戒状态添加 ui 指示，如问号等」
// 裁定：① 显示范围 = **仅视口内敌人**（复用 drawTank 的 aabbInView 剔除）；
//       ② 语义 = **两档**：问号 = 怀疑/搜寻，感叹号 = 已发现并锁定。
//
// 覆盖：
//   1) alertIndicatorFor 纯逻辑归并（engaged / alert / null 三态 × 全部 aiState × alertLevel）
//   2) 负向断言：patrol / stunned / 死亡 / 非敌方 / Boss 一律不显示（不打扰画面）
//   3) drawAlertIndicator 绘制行为（mock ctx：圆形底衬 + 字形 + 虚线差异）
//   4) 视口内约束的来源：drawTank 的 aabbInView 剔除仍在（负向：不得移除）
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

const BD = require('../js/tank_battledraw.js');
const { alertIndicatorFor, drawAlertIndicator } = BD;

let fails = 0;
function ok(cond, label) {
  if (cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}`); fails++; }
}
function section(t) { console.log(`\n== ${t} ==`); }

function mkEnemy(over) {
  return Object.assign({
    x: 100, y: 100, hullLen: 64, hullWid: 38, hullAngle: 0,
    hp: 100, maxHp: 100, team: 'enemy',
    aiState: 'patrol', alertLevel: 0, aiEngaged: false, aiTier: 0
  }, over || {});
}

// ============================================================ 1) 归并逻辑
section('alertIndicatorFor 归并逻辑');
{
  // 感叹号：已发现并锁定
  ok(alertIndicatorFor(mkEnemy({ aiEngaged: true, aiState: 'skirmish', alertLevel: 3 })) === 'engaged',
    'aiEngaged + skirmish → engaged（感叹号）');
  ok(alertIndicatorFor(mkEnemy({ aiEngaged: true, aiState: 'charge', alertLevel: 3 })) === 'engaged',
    'charge → engaged');
  ok(alertIndicatorFor(mkEnemy({ aiEngaged: true, aiState: 'hold', alertLevel: 3 })) === 'engaged',
    'hold（驻守射击）→ engaged');
  ok(alertIndicatorFor(mkEnemy({ aiEngaged: true, aiState: 'react', alertLevel: 3 })) === 'engaged',
    'react（已发现、正在起转）→ engaged（已锁定语义）');
  ok(alertIndicatorFor(mkEnemy({ alertLevel: 3, aiState: 'patrol' })) === 'engaged',
    'alertLevel=3 → engaged（即使 aiState 未及切换）');

  // 问号：怀疑 / 搜寻
  ok(alertIndicatorFor(mkEnemy({ aiState: 'suspicious', alertLevel: 1 })) === 'alert',
    'suspicious → alert（问号）');
  ok(alertIndicatorFor(mkEnemy({ aiState: 'search', alertLevel: 0 })) === 'alert',
    'search（朝记忆点搜索）→ alert（问号）');
  ok(alertIndicatorFor(mkEnemy({ aiState: 'patrol', alertLevel: 1 })) === 'alert',
    'alertLevel=1（闻声但尚未切 state）→ alert');
}

// ============================================================ 2) 不显示的情形
section('不显示（负向断言）');
{
  ok(alertIndicatorFor(mkEnemy({ aiState: 'patrol', alertLevel: 0 })) === null,
    '纯巡逻 → null（不显示）');
  ok(alertIndicatorFor(mkEnemy({ aiState: 'stunned', alertLevel: 3 })) === null,
    'stunned（硬直）→ null（不表达警戒）');
  ok(alertIndicatorFor(mkEnemy({ hp: 0 })) === null, '已死 → null');
  ok(alertIndicatorFor(mkEnemy({ hp: -5 })) === null, 'hp 为负 → null');
  ok(alertIndicatorFor(mkEnemy({ team: 'player', aiEngaged: true, aiState: 'skirmish' })) === null,
    '玩家 → null（只画敌方）');
  ok(alertIndicatorFor(mkEnemy({ team: 'ally', aiEngaged: true, aiState: 'skirmish' })) === null,
    '友军 → null');
  ok(alertIndicatorFor(mkEnemy({ isBoss: true, aiEngaged: true, aiState: 'skirmish' })) === null,
    'Boss → null（有独立血条/阶段 UI，不叠加）');
  ok(alertIndicatorFor(null) === null && alertIndicatorFor(undefined) === null,
    'null/undefined → null（不抛错）');
  // 缺字段的老实体：不崩、按 calm 处理
  ok(alertIndicatorFor({ team: 'enemy', hp: 10 }) === null,
    '缺 aiState/alertLevel 的老实体 → null（不抛错）');
}

// ============================================================ 3) 绘制行为
section('drawAlertIndicator 绘制行为');
{
  // mock ctx：记录调用
  function mkCtx() {
    const calls = [];
    const rec = (n) => (...a) => { calls.push({ n, a }); };
    return {
      calls,
      save: rec('save'), restore: rec('restore'),
      beginPath: rec('beginPath'), arc: rec('arc'), fill: rec('fill'), stroke: rec('stroke'),
      fillText: rec('fillText'), setLineDash: rec('setLineDash'),
      fillRect: rec('fillRect'), moveTo: rec('moveTo'), lineTo: rec('lineTo'),
      _fillStyle: null, _strokeStyle: null, _font: null,
      set fillStyle(v) { this._fillStyle = v; calls.push({ n: 'fillStyle', a: [v] }); },
      get fillStyle() { return this._fillStyle; },
      set strokeStyle(v) { this._strokeStyle = v; calls.push({ n: 'strokeStyle', a: [v] }); },
      get strokeStyle() { return this._strokeStyle; },
      set font(v) { this._font = v; calls.push({ n: 'font', a: [v] }); },
      get font() { return this._font; },
      lineWidth: 1, textAlign: 'left', textBaseline: 'alphabetic'
    };
  }

  // ⚠️ 字形**用路径绘制而非 fillText**：mini-canvas 的 fillText 是空实现，
  //    早期版本用 fillText ⇒ 两种状态的像素数完全相同（假绿），且真机字体缺失时不可见。
  //    因此这里断言「绘制调用形态」+（下一节）真实光栅化像素差异。

  // engaged：实线描边 + 矩形竖条字形
  {
    const ctx = mkCtx();
    drawAlertIndicator(ctx, mkEnemy({ aiEngaged: true, aiState: 'skirmish', alertLevel: 3 }));
    ok(ctx.calls.filter(c => c.n === 'fillRect').length >= 1,
      'engaged 用路径画感叹号竖条（fillRect，非 fillText）');
    ok(!ctx.calls.some(c => c.n === 'fillText'),
      'engaged 不依赖 fillText（字体无关）');
    const dashes = ctx.calls.filter(c => c.n === 'setLineDash').map(c => c.a[0]);
    ok(dashes.every(d => d.length === 0), 'engaged 描边为实线');
    ok(ctx.calls.some(c => c.n === 'arc'), '画了底衬圆');
  }

  // alert：虚线描边 + 弧线字形
  {
    const ctx = mkCtx();
    drawAlertIndicator(ctx, mkEnemy({ aiState: 'suspicious', alertLevel: 1 }));
    ok(!ctx.calls.some(c => c.n === 'fillText'),
      'alert 不依赖 fillText（字体无关）');
    const strokes = ctx.calls.filter(c => c.n === 'stroke').length;
    ok(strokes >= 2, `alert 用描边笔画画问号（stroke 调用 ${strokes} 次）`);
    const dashes = ctx.calls.filter(c => c.n === 'setLineDash').map(c => c.a[0]);
    ok(dashes.some(d => d.length > 0), 'alert 描边用虚线（弱化，不抢焦点）');
  }

  // 不显示：零绘制
  {
    const ctx = mkCtx();
    drawAlertIndicator(ctx, mkEnemy({ aiState: 'patrol', alertLevel: 0 }));
    ok(ctx.calls.length === 0, '纯巡逻不产生任何绘制调用（零开销）');
  }

  // save/restore 配对（不污染后续绘制状态）
  {
    const ctx = mkCtx();
    drawAlertIndicator(ctx, mkEnemy({ aiEngaged: true, aiState: 'skirmish', alertLevel: 3 }));
    const saves = ctx.calls.filter(c => c.n === 'save').length;
    const restores = ctx.calls.filter(c => c.n === 'restore').length;
    ok(saves === restores && saves > 0, `save/restore 配对（${saves}/${restores}）`);
  }
}

// ============================================================ 3b) 真实光栅化（防假绿）
section('真实光栅化：两种状态的像素形态必须不同');
{
  const { createMiniCanvas } = require('./lib/mini-canvas.js');
  /** 在 200×200 画布上绘制并返回图像数据 */
  function render(t) {
    const cv = createMiniCanvas(200, 200);
    // createMiniCanvas 返回的垫片对象与 DOM Canvas 形状不同（无参 getContext），
    // 这里按运行时实际形态断言类型，避免 tsc 报「Expected 0 arguments」。
    const ctx = /** @type {any} */ (cv).getContext('2d');
    BD.drawAlertIndicator(ctx, t);
    return ctx.getImageData(0, 0, 200, 200).data;
  }
  function opaqueCount(d) {
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] !== 0) n++;
    return n;
  }
  function diffCount(a, b) {
    let n = 0;
    for (let i = 0; i < a.length; i += 4) {
      if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2] || a[i + 3] !== b[i + 3]) n++;
    }
    return n;
  }
  const base = { x: 100, y: 100, hullLen: 64, hullWid: 38, hullAngle: 0, hp: 100,
                 maxHp: 100, team: 'enemy', aiTier: 0 };
  const dPatrol = render({ ...base, aiState: 'patrol', alertLevel: 0 });
  const dAlert = render({ ...base, aiState: 'suspicious', alertLevel: 1 });
  const dEngaged = render({ ...base, aiState: 'skirmish', alertLevel: 3, aiEngaged: true });

  ok(opaqueCount(dPatrol) === 0, '纯巡逻：0 个不透明像素（真的没画）');
  ok(opaqueCount(dAlert) > 50, `怀疑态：画出 ${opaqueCount(dAlert)} 个不透明像素（图标真实可见）`);
  ok(opaqueCount(dEngaged) > 50, `锁定态：画出 ${opaqueCount(dEngaged)} 个不透明像素`);

  // 关键：两档的字形必须真的有差异（早期用 fillText 时此处为 0 = 假绿）
  const glyphDiff = diffCount(dAlert, dEngaged);
  ok(glyphDiff > 10,
    `问号 vs 感叹号字形像素差异 ${glyphDiff} 个（>10 证明字形真实不同，非仅颜色差异）`);

  // 颜色也必须不同（问号黄 / 感叹号红）
  let alertRed = 0, engagedRed = 0;
  for (let i = 0; i < dAlert.length; i += 4) {
    if (dAlert[i + 3] > 128 && dAlert[i] > 200 && dAlert[i + 2] < 120) alertRed++;
    if (dEngaged[i + 3] > 128 && dEngaged[i] > 200 && dEngaged[i + 2] < 120) engagedRed++;
  }
  ok(alertRed > 0, `怀疑态含黄色像素（${alertRed}）`);
  ok(engagedRed > 0, `锁定态含红色像素（${engagedRed}）`);
}

// ============================================================ 4) 视口约束来源
section('显示范围 = 仅视口内（复用 drawTank 的 aabbInView）');
{
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'tank_battle.html'), 'utf8');
  ok(/aabbInView\(cam,\s*t\.x,\s*t\.y,\s*t\.hullLen,\s*t\.hullWid\)\)\s*return/.test(src),
    'battle 页 drawTank 前仍有 aabbInView 视口剔除（负向：不得移除，否则会泄露视口外情报）');
  const bdSrc = require('fs').readFileSync(require('path').join(__dirname, '..', 'js', 'tank_battledraw.js'), 'utf8');
  ok(/drawAlertIndicator\(ctx,\s*t\)/.test(bdSrc), 'drawTankHud 已接入 drawAlertIndicator');
}

console.log(fails ? `\n${fails} 项失败` : '\n全部通过');
process.exitCode = fails ? 1 : 0;
