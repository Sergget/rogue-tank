'use strict';

// tank_minimap.js — 小地图绘制层（P-08 / DEVELOPMENT.md §6 条目 6；C 档 batch 1 小地图条带化）。
// 遵循 tank_fx/tank_battledraw 惯例：ctx 显式传参、无 DOM 依赖；布局/换算为纯函数
// （Node 可测），drawMinimap 只做纯绘制。消费方（battle）每帧在屏幕空间调用。
//
// 小地图内容（§6 条目 6）：世界边界、掩体点、玩家/敌军/据点标记、摄像机视口矩形
// （已探索区域为 M6 简化实现：整图可见，探索迷雾为后续可选项）。
//
// C 档 batch 1（2026-10-05）：横向条带布局（specs/map.md §14.4）。
// strip 节点（≈10 屏 × 2.2 屏）按旧等比适配会退化成 ~20px 细线（PLAN §3.6 风险 #5）。
// 本布局按世界宽高比自适应：常规节点保持等比适配（行为零变化）；宽高比超过阈值
// 的世界启用条带模式——横向占满小地图框、纵向按 STRIP_Y_BOOST 拉伸后垂直居中。
// 条带模式下纵向为示意性（不保真），横向（推进轴）保真：小地图此时首先是
// 「推进进度条 + 视口窗口」，而非战术精确图。

// 条带阈值：世界宽高比超过此值启用横向条带布局
const STRIP_ASPECT_THRESHOLD = 2.5;
// 条带纵向拉伸系数：条带模式下 sy = min(mmH/worldH, sx * STRIP_Y_BOOST)
const STRIP_Y_BOOST = 2.5;

// ---- 公路（2026-10-18 小地图公路/补给）：整链多边形上小地图 ----
// 道路 cover 自 cde3bc3 起是「整链连续多边形」：c.w/c.h 只是整条链的外接 bbox、
// c.angle 恒为 0（`_emitRoadChain` 出口），真实路面形状在 c.verts——**局部坐标**，
// 加 c.x/c.y 才是世界系（口径见 tank_nodegen.js `_emitRoadChain` / `roadCoversToSegments`
// 与 tank_cover.js `coverCorners`）。旧实现把 road 归入 tierGroup='ground' 按 bbox 中心
// 画一个 2.2px 点 ⇒ 一条横贯 17000px 的公路在小地图上只有一个点，读不出走向。
// 现按多边形逐点换算填充；strip 布局 sx≠sy，故**每个世界点都必须单独过
// worldToMinimap**，不能用统一 scale 自算。
const ROAD_FILL = 'rgba(150,148,142,0.9)';
// 多边形最少顶点数：低于此值视为退化（旧 OBB 段无 verts / 采样过短的链）→ 回退画点
const ROAD_POLY_MIN_VERTS = 6;
// 补给点标记边长（小地图 px）：170×120 框内一眼可辨，且明显大于实体圆点（r ≤ 3）
const SUPPLY_MARK_SIZE = 5;

/**
 * 小地图布局换算（纯函数）：
 * 常规世界：(0,0)~(worldW,worldH) 按等比缩放居中放进 (mmW×mmH) 框（与旧行为一致）。
 * 条带世界（worldW/worldH > stripThreshold）：横向占满框宽，纵向拉伸后垂直居中。
 * @param {any} [opts] 可选：{ stripThreshold, stripYBoost }（缺省用模块常量）
 * @returns {{ scale:number, sx:number, sy:number, ox:number, oy:number, strip:boolean }}
 *   世界→小地图：mm = world*s{x,y} + o；scale = sx（兼容旧调用方）
 */
function minimapLayout(worldW, worldH, mmW, mmH, opts) {
  opts = opts || {};
  const threshold = opts.stripThreshold !== undefined ? opts.stripThreshold : STRIP_ASPECT_THRESHOLD;
  const yBoost = opts.stripYBoost !== undefined ? opts.stripYBoost : STRIP_Y_BOOST;
  if (worldW / worldH <= threshold) {
    const scale = Math.min(mmW / worldW, mmH / worldH);
    const ox = (mmW - worldW * scale) / 2;
    const oy = (mmH - worldH * scale) / 2;
    return { scale: scale, sx: scale, sy: scale, ox: ox, oy: oy, strip: false };
  }
  const sx = mmW / worldW;
  const sy = Math.min(mmH / worldH, sx * yBoost);
  return { scale: sx, sx: sx, sy: sy, ox: 0, oy: (mmH - worldH * sy) / 2, strip: true };
}

/**
 * 世界坐标 → 小地图像素（纯函数）。
 * @returns {{x:number, y:number}}
 */
function worldToMinimap(layout, wx, wy) {
  return { x: layout.ox + wx * layout.sx, y: layout.oy + wy * layout.sy };
}

/**
 * 世界 AABB → 小地图 AABB（纯函数，视口矩形用）。
 * @returns {{x:number, y:number, w:number, h:number}}
 */
function worldRectToMinimap(layout, minX, minY, maxX, maxY) {
  const a = worldToMinimap(layout, minX, minY);
  const b = worldToMinimap(layout, maxX, maxY);
  return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
}

/**
 * 整链道路多边形 → 小地图顶点数组（纯函数）。
 *
 * 输入 cover 的 `verts` 是**局部坐标**（相对 c.x/c.y），`angle` 恒为 0（_emitRoadChain 出口）。
 * 输出每个点都单独经 worldToMinimap 换算（strip 模式 sx≠sy，不能统一 scale）。
 *
 * @param {any} layout minimapLayout 的返回值
 * @param {any} cov 道路 cover（{x,y,verts}）
 * @returns {{x:number,y:number}[]|null} 小地图顶点数组；无 verts / verts 不足（旧 OBB 段、
 *   退化短链）返回 null，调用方回退为单点绘制
 */
function roadCoverPolygonPoints(layout, cov) {
  if (!cov) return null;
  const verts = cov.verts;
  if (!Array.isArray(verts) || verts.length < ROAD_POLY_MIN_VERTS) return null;
  const cx = Number.isFinite(cov.x) ? cov.x : 0;
  const cy = Number.isFinite(cov.y) ? cov.y : 0;
  const pts = [];
  for (let i = 0; i < verts.length; i++) {
    const v = verts[i];
    if (!v || v.length < 2) continue;
    const vx = Number(v[0]), vy = Number(v[1]);
    if (!Number.isFinite(vx) || !Number.isFinite(vy)) continue;
    // 局部 → 世界（angle 恒 0，只需平移）→ 小地图（逐点，保留 sx/sy 不等比）
    pts.push(worldToMinimap(layout, cx + vx, cy + vy));
  }
  return pts.length >= ROAD_POLY_MIN_VERTS ? pts : null;
}

/**
 * 补给点标记集合（纯函数）：把世界坐标补给站换算成小地图标记矩形（生存模式）。
 *
 * 标记 = 居中的小方块（边长 SUPPLY_MARK_SIZE），另在 drawMinimap 里叠十字 + 细描边。
 * 与玩家绿点（r=3 圆）在形状与尺寸上都可区分。
 *
 * @param {any} layout minimapLayout 的返回值
 * @param {any[]|null|undefined} stations [{x,y}] 世界坐标；缺省/非数组 ⇒ 返回空数组（零回归）
 * @returns {{x:number,y:number,size:number,cx:number,cy:number}[]} 标记列表
 */
function minimapSupplyMarks(layout, stations) {
  const out = [];
  if (!Array.isArray(stations)) return out;
  for (const st of stations) {
    if (!st) continue;
    const wx = Number(st.x), wy = Number(st.y);
    if (!Number.isFinite(wx) || !Number.isFinite(wy)) continue;
    const p = worldToMinimap(layout, wx, wy);
    out.push({
      x: p.x - SUPPLY_MARK_SIZE / 2,
      y: p.y - SUPPLY_MARK_SIZE / 2,
      size: SUPPLY_MARK_SIZE,
      cx: p.x,
      cy: p.y
    });
  }
  return out;
}

/**
 * 绘制小地图。屏幕空间调用（摄像机变换之外）。
 * @param {CanvasRenderingContext2D} ctx
 * @param {any} opts 绘制选项（#26：宽松类型，避免 checkJs 对属性访问误报）：
 *   opts.world 世界尺寸 { w, h }；opts.cam 摄像机（读 viewBounds）；
 *   opts.x/opts.y/opts.w/opts.h 小地图框（屏幕 px）；opts.covers 掩体列表；
 *   opts.entities 实体列表；opts.alpha 面板背景不透明度，默认 0.55；
 *   opts.supplyStations 可选 [{x,y}] 补给点世界坐标（生存模式；缺省不画，零回归）；
 *   opts.supplyOnCooldown 可选 boolean：补给冷却中 ⇒ 标记变灰（与世界标记同语义）
 */
function drawMinimap(ctx, opts) {
  const world = opts.world;
  const layout = minimapLayout(world.w, world.h, opts.w, opts.h);
  const alpha = opts.alpha !== undefined ? opts.alpha : 0.55;

  ctx.save();
  ctx.beginPath();
  ctx.rect(opts.x, opts.y, opts.w, opts.h);
  ctx.clip();

  // 面板底 + 边框
  ctx.fillStyle = `rgba(10,12,14,${alpha})`;
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 1;
  ctx.fillRect(opts.x, opts.y, opts.w, opts.h);
  ctx.strokeRect(opts.x + 0.5, opts.y + 0.5, opts.w - 1, opts.h - 1);

  // 世界边界
  const wb = worldToMinimap(layout, 0, 0);
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.strokeRect(opts.x + wb.x, opts.y + wb.y, world.w * layout.sx, world.h * layout.sy);

  // ---- 公路（2026-10-18 小地图公路/补给）：底图语义，必须先于建筑/植被/实体绘制 ----
  //   tier 'road' 的 cover 自 cde3bc3 起是「整链连续多边形」（verts 局部坐标 + c.x/c.y）。
  //   带 verts → 逐点经 worldToMinimap 换算后 path 填充（strip 模式 sx≠sy，绝不能统一 scale）；
  //   无 verts（旧 OBB 道路段 / 极短退化链）→ 回退为原来的单点，兼容旧数据。
  //   注意：road 不参与下方植被聚合网格（vegCells 只收 foliage）。
  if (opts.covers) {
    for (const c of opts.covers) {
      if (c.tier !== 'road') continue;
      if (c.hp <= 0) continue;
      const poly = roadCoverPolygonPoints(layout, c);
      if (poly) {
        ctx.fillStyle = ROAD_FILL;
        ctx.beginPath();
        ctx.moveTo(opts.x + poly[0].x, opts.y + poly[0].y);
        for (let i = 1; i < poly.length; i++) ctx.lineTo(opts.x + poly[i].x, opts.y + poly[i].y);
        ctx.closePath();
        ctx.fill();
        continue;
      }
      // 旧式 OBB 段（无 verts）→ 原 point 方式
      const p = worldToMinimap(layout, c.x, c.y);
      ctx.fillStyle = 'rgba(140,102,52,0.9)';
      ctx.fillRect(opts.x + p.x - 1.1, opts.y + p.y - 1.1, 2.2, 2.2);
    }
  }

  // 掩体绘制（#U5 用户裁定 B：**分区着色**）
  //   原实现逐元素画点：树/灌木数量大时小地图被打成一片噪点（用户反馈「点太多」）。
  //   现按 tierGroup 分流：
  //     · 植被（foliage：tree/bush/fallen/soft）→ 累加到**世界网格**，按格内密度铺半透明色块，
  //       密集处自然聚成「一小片绿色」，稀疏处不着色 —— 不画单点。
  //     · 其余（liquid 水/河、ground 泥、structure 建筑/岩石）→ 仍逐元素画点/方块
  //       （数量少且位置关键，保留可读性）。
  //   网格尺寸按小地图像素取（约 4 屏幕 px 一格），与世界尺寸解耦，缩放时观感稳定。
  if (opts.covers) {
    const CELL_PX = 4;                                    // 每格小地图像素
    const cellWorldX = CELL_PX / Math.max(1e-6, layout.sx);  // 换算回世界尺寸
    const cellWorldY = CELL_PX / Math.max(1e-6, layout.sy);
    const vegCells = new Map();                           // "gx,gy" -> {n, wx, wy}
    for (const c of opts.covers) {
      if (c.hp <= 0) continue;
      // 公路已在上一段按整链多边形画完（底图层）——此处跳过，避免再叠一个 ground 点。
      if (c.tier === 'road') continue;
      const tg = (typeof COVER_TIERS !== 'undefined' && COVER_TIERS[c.tier]) ? COVER_TIERS[c.tier].tierGroup : null;
      if (tg === 'foliage') {
        const gx = Math.floor(c.x / cellWorldX), gy = Math.floor(c.y / cellWorldY);
        const k = gx + ',' + gy;
        let cell = vegCells.get(k);
        if (!cell) { cell = { n: 0, sx: 0, sy: 0 }; vegCells.set(k, cell); }
        cell.n++; cell.sx += c.x; cell.sy += c.y;
        continue;
      }
      const p = worldToMinimap(layout, c.x, c.y);
      let dot = 1.6;
      let color = (c.tier === 'full' || c.tier === 'barricade') ? 'rgba(210,180,120,0.95)'
                : 'rgba(200,200,200,0.55)';
      if (tg === 'liquid') { dot = 2.2; color = 'rgba(64,156,225,0.95)'; }
      else if (tg === 'ground') { dot = 2.2; color = 'rgba(140,102,52,0.9)'; }
      else if (tg === 'structure' && (c.tier === 'rock' || c.tier === 'intact' || c.tier === 'ruined')) { dot = 2.4; color = 'rgba(190,190,185,0.95)'; }
      ctx.fillStyle = color;
      ctx.fillRect(opts.x + p.x - dot / 2, opts.y + p.y - dot / 2, dot, dot);
    }
    // 植被密度块：格内只要有植被就着色（α 随密度微增）。
    //   #U5 调校：窄幅小地图（如 strip 的 600×90）上每格覆盖上百世界 px，
    //   多株落同格的概率不高；若要求 ≥2 才画，植被几乎全被吞掉（实测仅 37/220 格达标）。
    //   现改为「有即画」——这正是用户要的「聚集处成片、零散处不着色」的效果。
    for (const cell of vegCells.values()) {
      const cx = cell.sx / cell.n, cy = cell.sy / cell.n;
      const p = worldToMinimap(layout, cx, cy);
      // #U5：小地图底为深色面板，低 α 绿在暗底上几乎不可见（实测合成后仅 68,91,53）。
      //   提高亮度与不透明度，确保「植被区」在缩小视图下仍能一眼读出。
      const a = Math.min(0.85, 0.40 + cell.n * 0.12);
      ctx.fillStyle = `rgba(150,196,108,${a.toFixed(2)})`;
      ctx.fillRect(opts.x + p.x - CELL_PX / 2, opts.y + p.y - CELL_PX / 2, CELL_PX, CELL_PX);
    }
  }

  // 实体标记：玩家绿 / 友军蓝 / 敌军红；无人机青点（P-17：随行单位，区别于坦克阵营）
  if (opts.entities) {
    for (const e of opts.entities) {
      if (e.hp <= 0) continue;
      const p = worldToMinimap(layout, e.x, e.y);
      if (e.isDrone) {
        ctx.fillStyle = '#5ce8ff';
        ctx.beginPath();
        ctx.arc(opts.x + p.x, opts.y + p.y, 1.8, 0, 6.2832);
        ctx.fill();
        continue;
      }
      ctx.fillStyle = e.team === 'player' ? '#7ed957'
                    : e.team === 'ally' ? '#5cc8ff'
                    : '#ff5c5c';
      const r = (e.team === 'player') ? 3 : 2.2;
      ctx.beginPath();
      ctx.arc(opts.x + p.x, opts.y + p.y, r, 0, 6.2832);
      ctx.fill();
    }
  }

  // ---- 补给点标记（2026-10-18，生存模式）----
  //   补给站是节点数据（currentNode.supplyStations / placeSupplyStations），此前只在世界里
  //   画标记，小地图上毫无提示 ⇒ 玩家不知道该往哪开。画法：小方块 + 十字 + 细描边，
  //   尺寸 5px（实体圆点 r≤3）+ 十字臂总长 10px ⇒ 形状与体量都与玩家绿点可区分；
  //   绿色取世界标记「补给」字样的亮薄荷绿（190,255,150），也与玩家点的 #7ed957 不同色。
  //   opts.supplyStations 缺省/非数组 ⇒ 一个都不画（零回归）。冷却中传
  //   opts.supplyOnCooldown=true ⇒ 与世界里「冷却变灰」同语义。
  if (opts.supplyStations) {
    const marks = minimapSupplyMarks(layout, opts.supplyStations);
    if (marks.length) {
      const onCd = opts.supplyOnCooldown === true;
      const fill = onCd ? 'rgba(150,150,150,0.85)' : 'rgba(190,255,150,0.95)';
      const stroke = onCd ? 'rgba(200,200,200,0.9)' : 'rgba(235,255,220,0.95)';
      for (const m of marks) {
        ctx.fillStyle = fill;
        ctx.fillRect(opts.x + m.x, opts.y + m.y, m.size, m.size);
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 1;
        ctx.strokeRect(opts.x + m.x + 0.5, opts.y + m.y + 0.5, m.size - 1, m.size - 1);
        // 十字：臂长 = size（总长 2*size），明确「补给/医疗」语义
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(opts.x + m.cx - m.size, opts.y + m.cy);
        ctx.lineTo(opts.x + m.cx + m.size, opts.y + m.cy);
        ctx.moveTo(opts.x + m.cx, opts.y + m.cy - m.size);
        ctx.lineTo(opts.x + m.cx, opts.y + m.cy + m.size);
        ctx.stroke();
      }
    }
  }

  // #K2（2026-09-29）：出口区标记——小地图上把「节点完成目标」画出来（绿色竖带 + EXIT 字样），
  // 与推进式完成条件（specs/map.md §15.10）配套，解决「完成目标和出口没有 UI 提示」。
  if (opts.exitZone) {
    const ex = Number.isFinite(opts.exitZone.x) ? opts.exitZone.x : world.w * 0.93;
    const w0 = worldToMinimap(layout, 0, 0);                       // 世界原点在小地图框内的位置
    const exr = worldToMinimap(layout, Math.max(0, Math.min(world.w, ex)), 0);
    const wpx = world.w * layout.sx, hpx = world.h * layout.sy;
    const bandX = opts.x + exr.x, bandY = opts.y + w0.y;
    ctx.save();
    ctx.fillStyle = 'rgba(126,217,87,0.22)';                       // 出口区（exitX → 右边界）
    ctx.fillRect(bandX, bandY, Math.max(2, opts.x + w0.x + wpx - bandX), hpx);
    ctx.strokeStyle = 'rgba(126,217,87,0.9)';                      // 出口线
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(bandX, bandY);
    ctx.lineTo(bandX, bandY + hpx);
    ctx.stroke();
    ctx.fillStyle = 'rgba(126,217,87,0.95)';
    ctx.font = '7px monospace';
    ctx.textAlign = 'right';
    ctx.fillText('EXIT', opts.x + w0.x + wpx - 2, bandY + 8);
    ctx.restore();
  }

  // 摄像机视口矩形
  if (opts.cam) {
    const vb = viewBounds(opts.cam);
    const vr = worldRectToMinimap(layout, vb.minX, vb.minY, vb.maxX, vb.maxY);
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 1;
    ctx.strokeRect(opts.x + vr.x, opts.y + vr.y, Math.max(2, vr.w), Math.max(2, vr.h));
  }
  ctx.restore();
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    minimapLayout,
    worldToMinimap,
    worldRectToMinimap,
    // 2026-10-18：公路整链多边形 / 补给点标记的纯换算（Node 可测）
    roadCoverPolygonPoints,
    minimapSupplyMarks,
    drawMinimap     // #U5：供 Node 生图/测试校验小地图渲染
  };
}
