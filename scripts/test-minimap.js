// test-minimap.js — 小地图布局换算测试（Node 端，Pure Logic）
// 运行：node scripts/test-minimap.js
// 覆盖：常规世界等比适配（回归旧行为）、条带阈值边界、条带模式横向占满/纵向拉伸/居中、
//   换算函数在条带模式下的推进轴保真、opts 自定义阈值。
'use strict';

const U = require('../js/tank_utils.js');
const RULES_MOD = require('../js/tank_rules.js');
void U; void RULES_MOD;

const {
  minimapLayout,
  worldToMinimap,
  worldRectToMinimap,
  drawMinimap
} = require('../js/tank_minimap.js');

let fails = 0;
function ok(cond, label) {
  if (cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}`); fails++; }
}
function close(a, b, eps) { return Math.abs(a - b) <= (eps || 1e-9); }

// 1) 常规世界：等比适配，行为与旧实现一致（旧公式 scale=min(mmW/w,mmH/h) 居中）
{
  const l = minimapLayout(5800, 3500, 170, 120);
  ok(l.strip === false, '方形世界不进条带模式');
  const s = Math.min(170 / 5800, 120 / 3500);
  ok(close(l.scale, s) && close(l.sx, s) && close(l.sy, s), '常规模式 sx=sy=scale=等比缩放');
  ok(close(l.ox, (170 - 5800 * s) / 2) && close(l.oy, (120 - 3500 * s) / 2), '常规模式居中偏移');
  const p = worldToMinimap(l, 0, 0);
  ok(close(p.x, l.ox) && close(p.y, l.oy), '原点映射到偏移处');
  const q = worldToMinimap(l, 5800, 3500);
  ok(close(q.x, l.ox + 5800 * s) && close(q.y, l.oy + 3500 * s), '对角映射一致');
}

// 2) 阈值边界：aspect == 2.5 不进条带，> 2.5 进
{
  const a = minimapLayout(2500, 1000, 170, 120);
  ok(a.strip === false, '宽高比恰为阈值不进条带');
  const b = minimapLayout(2600, 1000, 170, 120);
  ok(b.strip === true, '宽高比超过阈值进条带');
}

// 3) 条带世界（C 档 strip 口径：19200×2400 ≈ 8:1，框 170×120）
{
  const W = 19200, H = 2400, MW = 170, MH = 120;
  const l = minimapLayout(W, H, MW, MH);
  ok(l.strip === true, 'strip 世界进条带模式');
  const sx = MW / W;
  ok(close(l.sx, sx) && close(l.ox, 0), '横向占满框宽（ox=0, sx=mmW/worldW）');
  const sy = Math.min(MH / H, sx * 2.5);
  ok(close(l.sy, sy), '纵向按 boost 拉伸并钳制');
  ok(close(l.oy, (MH - H * sy) / 2), '条带垂直居中');
  ok(l.sy * H > 20, '条带高度可用（非细线）');
  // 推进轴保真：x=0→左缘，x=W→右缘
  const p0 = worldToMinimap(l, 0, 123);
  const p1 = worldToMinimap(l, W, 456);
  ok(close(p0.x, 0) && close(p1.x, MW), '推进轴两端精确映射到框左右缘');
  ok(p0.y >= 0 && p0.y <= MH && p1.y >= 0 && p1.y <= MH, '纵向映射落在框内');
  // 视口矩形换算一致
  const r = worldRectToMinimap(l, 1000, 500, 2920, 1580);
  const ea = worldToMinimap(l, 1000, 500), eb = worldToMinimap(l, 2920, 1580);
  ok(close(r.x, ea.x) && close(r.y, ea.y) && close(r.w, eb.x - ea.x) && close(r.h, eb.y - ea.y), '视口矩形换算一致');
}

// 4) opts 自定义阈值/boost
{
  const l = minimapLayout(3000, 1000, 170, 120, { stripThreshold: 4 });
  ok(l.strip === false, '自定义高阈值可抑制条带模式');
  const m = minimapLayout(19200, 2400, 170, 120, { stripYBoost: 1 });
  ok(close(m.sy, m.sx), 'stripYBoost=1 退化为等比条带');
}

// 5) 旧调用兼容：scale 字段保留且等于 sx
{
  const l = minimapLayout(19200, 2400, 170, 120);
  ok(l.scale === l.sx, 'scale 字段保留（兼容旧调用方）');
}

// 6) #U5：植被聚合着色——植被不再逐点，而是按小地图 4px 网格铺色块；
//    非植被（水/河/泥/建筑/岩石）仍逐点。用 mock ctx 记录 fillRect 次数与颜色。
{
  global.COVER_TIERS = {
    tree:   { tierGroup: 'foliage' },
    bush:   { tierGroup: 'foliage' },
    river:  { tierGroup: 'liquid' },
    mud:    { tierGroup: 'ground' },
    full:   { tierGroup: 'structure' },
    rock:   { tierGroup: 'structure' }
  };
  function makeCtx() {
    const rects = [];
    const noop = () => {};
    return {
      rects,
      save: noop, restore: noop, beginPath: noop, rect: noop, clip: noop,
      strokeRect: noop, arc: noop, fill: noop, stroke: noop, fillText: noop,
      moveTo: noop, lineTo: noop,
      set fillStyle(v) { this._fill = v; }, get fillStyle() { return this._fill; },
      set strokeStyle(v) { this._stroke = v; }, get strokeStyle() { return this._stroke; },
      set lineWidth(v) {}, set font(v) {}, set textAlign(v) {},
      fillRect(x, y, w, h) { rects.push({ x, y, w, h, fill: this._fill }); }
    };
  }
  // 30 棵树聚成 3 个 4px 格 → 期望 3 次绿色块；再加 2 条河 + 1 块泥 + 1 栋建筑 + 1 块岩石
  const covers = [];
  for (let i = 0; i < 30; i++) {
    covers.push({ tier: 'tree', hp: 1, x: 100 + (i % 3) * 8, y: 100 + Math.floor(i / 15) * 8, w: 24, h: 18 });
  }
  covers.push({ tier: 'river', hp: 1, x: 500, y: 100, w: 80, h: 80 });
  covers.push({ tier: 'river', hp: 1, x: 600, y: 100, w: 80, h: 80 });
  covers.push({ tier: 'mud', hp: 1, x: 700, y: 100, w: 80, h: 80 });
  covers.push({ tier: 'full', hp: 1, x: 800, y: 100, w: 80, h: 80 });
  covers.push({ tier: 'rock', hp: 1, x: 900, y: 100, w: 80, h: 80 });
  // 已毁植被不参与聚合
  covers.push({ tier: 'tree', hp: 0, x: 1200, y: 100, w: 24, h: 18 });

  const ctx = /** @type {any} */ (makeCtx());
  drawMinimap(ctx, { world: { w: 2000, h: 800 }, cam: null, x: 0, y: 0, w: 200, h: 80, covers, entities: [] });
  const body = ctx.rects.filter(r => r.w > 1 && r.h > 1 && r.x >= 0 && r.y >= 0 && r.w < 200 && r.h < 80);
  const vegRects = body.filter(r => /rgba\(150,196,108/.test(String(r.fill)));
  ok(vegRects.length > 0 && vegRects.length <= 3,
    `#U5 植被按网格聚合为色块（30 棵同一批密集树 → ${vegRects.length} 块，非 30 点）`);
  ok(vegRects.every(r => r.w <= 6 && r.h <= 6), '#U5 植被色块尺寸 = 4px 网格（不超过 6px）');
  const dots = body.filter(r => !/rgba\(150,196,108/.test(String(r.fill)));
  ok(dots.length >= 5, `#U5 非植被仍逐元素画点（水×2 + 泥 + 建筑 + 岩石 = ${dots.length}）`);
  // 面板底（整框）不计入 body 过滤后，仍应存在水量蓝点
  ok(dots.some(r => /rgba\(64,156,225/.test(String(r.fill))), '#U5 河流仍作蓝点保留');
  ok(!body.some(r => r.w > 150), '#U5 面板底不参与元素统计（无整框填充进入 body）');
}

if (fails) { console.error(`\n${fails} 项失败`); process.exit(1); }
console.log('\n全部通过');
