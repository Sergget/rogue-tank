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
  roadCoverPolygonPoints,
  minimapSupplyMarks,
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

// 7) 2026-10-18 小地图公路/补给：整链连续性公路 → 小地图按多边形 path 填充（可读出走向），
//    不再退化成一个 ground 点。用记录式 mock ctx（记录 path 顶点 + fill 调用 + 调用顺序）。
{
  function makePathCtx() {
    const rects = [], strokes = [], fills = [], order = [];
    let path = [], closed = false;
    const noop = () => {};
    return {
      rects, strokes, fills, order,
      save: noop, restore: noop, rect: noop, clip: noop,
      arc: noop, fillText: noop,
      beginPath() { path = []; closed = false; },
      moveTo(x, y) { path.push([x, y]); },
      lineTo(x, y) { path.push([x, y]); },
      closePath() { closed = true; },
      set fillStyle(v) { this._fill = v; }, get fillStyle() { return this._fill; },
      set strokeStyle(v) { this._stroke = v; }, get strokeStyle() { return this._stroke; },
      set lineWidth(v) {}, set font(v) {}, set textAlign(v) {}, setLineDash() {},
      fillRect(x, y, w, h) { rects.push({ x, y, w, h, fill: this._fill }); order.push({ op: 'fillRect', fill: this._fill }); },
      strokeRect(x, y, w, h) { strokes.push({ x, y, w, h, stroke: this._stroke }); },
      fill() { fills.push({ fill: this._fill, pts: path.slice(), closed }); order.push({ op: 'pathFill', fill: this._fill }); },
      stroke() { order.push({ op: 'pathStroke', stroke: this._stroke }); }
    };
  }

  // 一条横贯 17000px 的整链公路：模拟 _emitRoadChain 出口——verts 为**局部坐标**，
  // c.x/c.y 为链中心（w/h 只是外接 bbox，形状全在 verts）。
  const CHAIN = [];
  const N = 60;                       // 采样点数（真实链可达上千点）
  const hw = 55;                      // 半路宽
  const chainW = 17000, chainH = 1800;
  const left = [], right = [];
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const px = t * chainW, py = 200 + Math.sin(t * Math.PI) * 900;   // 弧形走向
    const slope = Math.cos(t * Math.PI) * 900 * Math.PI / chainW;
    const len = Math.hypot(1, slope);
    const nx = -slope / len, ny = 1 / len;
    left.push([px + nx * hw, py + ny * hw]);
    right.push([px - nx * hw, py - ny * hw]);
  }
  const worldVerts = left.concat(right.reverse());
  const cx0 = chainW / 2, cy0 = chainH / 2;
  const road = {
    tier: 'road', hp: Infinity, angle: 0,
    x: cx0, y: cy0, w: chainW, h: chainH,
    verts: worldVerts.map(([vx, vy]) => [vx - cx0, vy - cy0])
  };

  const ctxA = /** @type {any} */ (makePathCtx());
  drawMinimap(ctxA, {
    world: { w: 18000, h: 2000 }, cam: null, x: 0, y: 0, w: 170, h: 120,
    covers: [road], entities: []
  });
  const roadFills = ctxA.fills.filter(f => /rgba\(150,148,142/.test(String(f.fill)));
  ok(roadFills.length === 1, `公路/补给: 整链公路按多边形填充一次（实际 ${roadFills.length} 次）`);
  ok(roadFills.length > 0 && roadFills[0].pts.length > 4,
    `公路/补给: 公路多边形路径顶点数 > 4（实际 ${roadFills.length ? roadFills[0].pts.length : 0}）`);
  ok(roadFills.length > 0 && roadFills[0].closed, '公路/补给: 公路路径闭合（closePath）');
  // 顶点必须横跨大半个框宽（能读出走向），而不是聚成一个点
  const xs = roadFills.length ? roadFills[0].pts.map(p => p[0]) : [0];
  const spanX = Math.max(...xs) - Math.min(...xs);
  ok(spanX > 100, `公路/补给: 公路横向跨度覆盖小地图大半（实际 ${spanX.toFixed(1)}px / 170px）`);
  // NOT 只有单个点：不得再有 road 的 ground 棕色 2.2px 点
  const brownDots = ctxA.rects.filter(r => /rgba\(140,102,52/.test(String(r.fill)));
  ok(brownDots.length === 0, `公路/补给: 公路不再画 ground 单点（实际 ${brownDots.length} 个）`);

  // 8) 无 verts 的旧式 OBB 道路段 → 仍按点绘制（兼容旧数据）
  const oldRoad = { tier: 'road', hp: Infinity, x: 900, y: 500, w: 400, h: 110, angle: 0.3 };
  const ctxB = /** @type {any} */ (makePathCtx());
  drawMinimap(ctxB, {
    world: { w: 18000, h: 2000 }, cam: null, x: 0, y: 0, w: 170, h: 120,
    covers: [oldRoad], entities: []
  });
  const legacyDots = ctxB.rects.filter(r => /rgba\(140,102,52/.test(String(r.fill)));
  ok(legacyDots.length === 1, `公路/补给: 无 verts 旧 OBB 段仍画点（实际 ${legacyDots.length} 点）`);
  ok(ctxB.fills.length === 0, '公路/补给: 旧 OBB 段不产生多边形填充');
  // verts 过少（退化链，< 6 点）同样回退画点
  const stubMedge = { tier: 'road', hp: Infinity, x: 900, y: 500, w: 200, h: 110, angle: 0,
    verts: [[-100, -55], [-100, 55], [100, 55], [100, -55]] };
  const ctxC = /** @type {any} */ (makePathCtx());
  drawMinimap(ctxC, {
    world: { w: 18000, h: 2000 }, cam: null, x: 0, y: 0, w: 170, h: 120,
    covers: [stubMedge], entities: []
  });
  ok(ctxC.fills.length === 0 && ctxC.rects.filter(r => /rgba\(140,102,52/.test(String(r.fill))).length === 1,
    '公路/补给: verts 不足 6 点的退化链回退画点');

  // 9) 底图语义：公路必须画在建筑/植被之前
  const structCovers = [road, { tier: 'full', hp: Infinity, x: 8000, y: 900, w: 120, h: 120, angle: 0 }];
  const ctxD = /** @type {any} */ (makePathCtx());
  drawMinimap(ctxD, {
    world: { w: 18000, h: 2000 }, cam: null, x: 0, y: 0, w: 170, h: 120,
    covers: structCovers, entities: []
  });
  const roadIdx = ctxD.order.findIndex(o => o.op === 'pathFill' && /rgba\(150,148,142/.test(String(o.fill)));
  const structIdx = ctxD.order.findIndex(o => o.op === 'fillRect' && !/rgba\(150,196,108/.test(String(o.fill)) && !/rgba\(10,12,14/.test(String(o.fill)));
  ok(roadIdx >= 0 && structIdx >= 0 && roadIdx < structIdx,
    `公路/补给: 公路先于建筑绘制（road@${roadIdx} < structure@${structIdx}）`);

  // 10) 公路不参与植被聚合网格（vegCells 只收 foliage）：公路体量再大也不出绿色块
  const ctxE = /** @type {any} */ (makePathCtx());
  drawMinimap(ctxE, {
    world: { w: 18000, h: 2000 }, cam: null, x: 0, y: 0, w: 170, h: 120,
    covers: [road], entities: []
  });
  ok(ctxE.rects.filter(r => /rgba\(150,196,108/.test(String(r.fill))).length === 0,
    '公路/补给: 公路不参与植被聚合着色（无绿色植被块）');

  // 11) strip 模式 sx≠sy：每个 vert 都必须单独经 worldToMinimap（不能用统一 scale 自算）
  {
    const stripRoad = {
      tier: 'road', hp: Infinity, angle: 0,
      x: 8500, y: 900, w: 17000, h: 1800,
      verts: [[-8500, -900], [-8500, 900], [0, 900], [8500, 900], [8500, -900], [0, -900]]
    };
    const l = minimapLayout(18000, 2000, 170, 120);
    ok(l.strip === true && Math.abs(l.sx - l.sy) > 1e-6,
      `公路/补给: 前置：strip 布局 sx≠sy（sx=${l.sx.toFixed(5)}, sy=${l.sy.toFixed(5)}）`);
    const pts = roadCoverPolygonPoints(l, stripRoad);
    ok(pts && pts.length === 6, `公路/补给: 多边形顶点全部保留（${pts ? pts.length : 0}/6）`);
    let allMatch = true;
    for (let i = 0; i < stripRoad.verts.length; i++) {
      const v = stripRoad.verts[i];
      const exp = worldToMinimap(l, stripRoad.x + v[0], stripRoad.y + v[1]);
      if (!close(pts[i].x, exp.x) || !close(pts[i].y, exp.y)) { allMatch = false; break; }
    }
    ok(allMatch, '公路/补给: 每个 vert 单独经 worldToMinimap 换算（strip 不等比下逐点正确）');
    // 反证：若误用统一 scale（只取 sx）算 y，纵向必然偏
    const wrongY = l.oy + (stripRoad.y + stripRoad.verts[1][1]) * l.sx;
    ok(Math.abs(pts[1].y - wrongY) > 1e-6, '公路/补给: 纵向未误用统一 scale（sy ≠ sx 的差异可观测）');
  }

  // 12) 补给点标记（生存模式）：数量 == 传入数量；缺省不画（零回归）
  {
    const stations = [{ x: 2000, y: 600 }, { x: 9000, y: 1200 }, { x: 15000, y: 400 }];
    ok(minimapSupplyMarks(minimapLayout(18000, 2000, 170, 120), stations).length === stations.length,
      `公路/补给: minimapSupplyMarks 数量 == 传入数量（${stations.length}）`);
    ok(minimapSupplyMarks(minimapLayout(18000, 2000, 170, 120), undefined).length === 0,
      '公路/补给: minimapSupplyMarks 缺省 ⇒ 空数组');
    ok(minimapSupplyMarks(minimapLayout(18000, 2000, 170, 120), null).length === 0,
      '公路/补给: minimapSupplyMarks null ⇒ 空数组');
    // 坏坐标跳过，不让 NaN 污染绘制
    ok(minimapSupplyMarks(minimapLayout(18000, 2000, 170, 120), [{ x: NaN, y: 1 }, { x: 10 }]).length === 0,
      '公路/补给: minimapSupplyMarks 跳过非法坐标');

    const ctxNo = /** @type {any} */ (makePathCtx());
    drawMinimap(ctxNo, { world: { w: 18000, h: 2000 }, cam: null, x: 0, y: 0, w: 170, h: 120, covers: [], entities: [] });
    const SUPPLY_FILL = /rgba\(190,255,150,0\.95\)/;
    ok(ctxNo.rects.filter(r => SUPPLY_FILL.test(String(r.fill))).length === 0,
      '公路/补给: 不传 supplyStations ⇒ 补给标记 0 个（零回归）');
    ok(ctxNo.strokes.filter(r => /rgba\(235,255,220/.test(String(r.stroke))).length === 0,
      '公路/补给: 不传 supplyStations ⇒ 无补给描边');

    const ctxYes = /** @type {any} */ (makePathCtx());
    drawMinimap(ctxYes, {
      world: { w: 18000, h: 2000 }, cam: null, x: 0, y: 0, w: 170, h: 120,
      covers: [], entities: [], supplyStations: stations
    });
    const supplyRects = ctxYes.rects.filter(r => SUPPLY_FILL.test(String(r.fill)));
    ok(supplyRects.length === stations.length,
      `公路/补给: 补给标记数量 == 传入数量（${supplyRects.length}/${stations.length}）`);
    ok(supplyRects.length > 0 && supplyRects.every(r => r.w === 5 && r.h === 5),
      '公路/补给: 补给标记为 5px 方块（170×120 框内可辨）');
    ok(ctxYes.strokes.filter(r => /rgba\(235,255,220/.test(String(r.stroke))).length === stations.length,
      '公路/补给: 每个补给标记带细描边');
    // 与玩家绿点区分：补给为方形 fillRect 5px + 十字，玩家为圆点 arc r=3。
    // 颜色也必须不同：玩家点 '#7ed957' = rgb(126,217,87)，补给用亮薄荷绿 rgb(190,255,150)。
    //   注意断言必须非空：supplyRects 若为空，every() 会无意义地返回 true。
    ok(supplyRects.length === stations.length &&
       supplyRects.every(r => !/rgba\(126,217,87/.test(String(r.fill))),
      '公路/补给: 补给标记 RGB 与玩家绿点不同色（玩家 #7ed957）');
    const ctxPlayer = /** @type {any} */ (makePathCtx());
    let playerArcs = 0;
    ctxPlayer.arc = () => { playerArcs++; };
    drawMinimap(ctxPlayer, {
      world: { w: 18000, h: 2000 }, cam: null, x: 0, y: 0, w: 170, h: 120,
      covers: [], entities: [{ x: 2000, y: 600, hp: 1, team: 'player' }],
      supplyStations: stations
    });
    ok(playerArcs === 1, `公路/补给: 玩家仍为圆点（arc 1 次），补给为方块 —— 形状可区分（arc=${playerArcs}）`);
    // 冷却中 → 灰
    const ctxCd = /** @type {any} */ (makePathCtx());
    drawMinimap(ctxCd, {
      world: { w: 18000, h: 2000 }, cam: null, x: 0, y: 0, w: 170, h: 120,
      covers: [], entities: [], supplyStations: stations, supplyOnCooldown: true
    });
    ok(ctxCd.rects.filter(r => /rgba\(150,150,150/.test(String(r.fill))).length === stations.length,
      '公路/补给: 冷却中补给标记变灰（与世界标记同语义）');
  }
}

if (fails) { console.error(`\n${fails} 项失败`); process.exit(1); }
console.log('\n全部通过');
