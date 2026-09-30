'use strict';

// tank_camera.js — 摄像机跟随 + 视口 AABB 剔除（P-08 / DEVELOPMENT.md §6 条目 6）。
// 纯逻辑模块：无 DOM / Canvas 依赖，Node 可测（module.exports 底部导出）。
// 职责：维护摄像机状态（视口中心/尺寸/缩放/世界边界），跟随目标（玩家）平滑移动并
// 钳制在世界边界内；提供 世界↔屏幕 坐标换算与「世界 AABB 是否进入视口」的剔除查询，
// 供绘制层（mvp / 小地图）按视口跳过不可见元素。
//
// 坐标约定：
//   - 世界坐标 = 节点地图坐标（covers/entities 所在坐标系）；
//   - 屏幕坐标 = canvas 像素（视口中心 = 屏幕中心）；
//   - cam.x/cam.y = 世界坐标下视口中心的坐标；cam.vw/cam.vh = 视口尺寸（屏幕 px）。

/**
 * 创建摄像机状态。
 * @param {any} [opts] 选项（vw/vh/zoom/bounds；#26：宽松类型，避免 checkJs 误报）
 * @returns {any} 摄像机状态
 */
function createCamera(opts) {
  opts = opts || {};
  // P-39 缩放参数：优先取调用方显式值，缺省回退 RULES.camera，再兜底硬编码。
  const rc = (typeof RULES !== 'undefined' && RULES.camera) || {};
  const zoom0 = opts.zoom || 1;
  return {
    x: (opts.bounds ? opts.bounds.w : opts.vw || 960) / 2,
    y: (opts.bounds ? opts.bounds.h : opts.vh || 600) / 2,
    vw: opts.vw || 960,
    vh: opts.vh || 600,
    zoom: zoom0,
    targetZoom: zoom0,                       // 阻尼收敛目标（updateCamera 内平滑趋近）
    minZoom: opts.minZoom || rc.minZoom || 0.8,
    maxZoom: opts.maxZoom || rc.maxZoom || 1.3,
    bounds: opts.bounds || null,
    // #E12：鼠标外延量（世界 px），由 updateCameraLead 逐帧更新；updateCamera 叠加到跟随目标上
    leadX: 0,
    leadY: 0
  };
}

/**
 * 设置缩放目标（P-39）：钳制到 [minZoom,maxZoom] 后写入 cam.targetZoom，
 * 实际 cam.zoom 由 updateCamera 指数阻尼平滑趋近。返回钳制后的目标值。
 * @param {any} cam 摄像机状态
 * @param {number} target 目标缩放
 * @returns {number} 钳制后的目标缩放
 */
function setZoom(cam, target) {
  const t = Number(target) || 1;
  const lo = cam.minZoom || 0.8, hi = cam.maxZoom || 1.3;
  cam.targetZoom = Math.max(lo, Math.min(hi, t));
  return cam.targetZoom;
}

/**
 * 相机跟随：视口中心平滑逼近目标（指数阻尼），并钳制在世界边界内
 * （节点比视口小 → 居中；比视口大 → 边缘不露出世界外）。
 * @param {any} cam 摄像机状态（就地修改）
 * @param {any} target 目标（如玩家坦克 { x, y }）
 * @param {number} dt 秒
 * @param {any} [opts] 选项（opts.lerp 跟随阻尼系数 0~1，默认 4）
 */
function updateCamera(cam, target, dt, opts) {
  const lerp = (opts && opts.lerp) || 4;
  const k = 1 - Math.exp(-lerp * (dt || 0));
  // P-39 缩放阻尼：cam.zoom 平滑趋近 cam.targetZoom（默认比位置跟随更快收敛）。
  if (cam.targetZoom != null && cam.targetZoom !== cam.zoom) {
    const zk = 1 - Math.exp(-((opts && opts.zoomLerp) || 10) * (dt || 0));
    cam.zoom += (cam.targetZoom - cam.zoom) * zk;
    // 收敛后贴合，避免无限小数漂移
    if (Math.abs(cam.targetZoom - cam.zoom) < 1e-4) cam.zoom = cam.targetZoom;
  }
  if (target) {
    // #E12（2026-09-20）：摄像机随鼠标向外延伸——在跟随目标中心的基础上叠加「朝鼠标方向的
    // 构图前移量」，使朝向鼠标一侧的可见范围更大（瞄准/引导线导导弹时更舒服）。
    // 延伸距离 = RULES.vision.radius × mouseLeadRatio × 归一化鼠标偏移（0~1），
    // 再按 cam.zoom 反向补偿（zoomComp，默认开）——缩放不改变世界侧外延量。
    // 由 updateCameraLead 逐帧更新 cam.leadX/leadY（阻尼收敛，切线时平滑）。
    const lx = (cam.leadX || 0), ly = (cam.leadY || 0);
    cam.x += (target.x + lx - cam.x) * k;
    cam.y += (target.y + ly - cam.y) * k;
  }
  clampCamera(cam);
}

// #E12（2026-09-20）鼠标外延量更新：screenX/screenY 为鼠标屏幕坐标（视口中心为屏幕中心）。
// 返回更新后的 {leadX, leadY}（同时写回 cam）。与视野半径绑定，zoom 反向补偿。
// 缺 RULES.camera.mouseLeadRatio 时为零外延（行为与旧版一致）。
function updateCameraLead(cam, screenX, screenY, dt) {
  const rc = (typeof RULES !== 'undefined' && RULES.camera) || {};
  const ratio = rc.mouseLeadRatio !== undefined ? rc.mouseLeadRatio : 0.30;
  const vR = (typeof RULES !== 'undefined' && RULES.vision && RULES.vision.radius) || 900;
  const maxLead = vR * ratio;
  const hw = Math.max(1, (cam.vw || 960) / 2);
  const hh = Math.max(1, (cam.vh || 600) / 2);
  // 归一化偏移（0~1，越靠屏幕边缘越大）；对角方向按向量长度钳到 1
  let nx = (screenX - hw) / hw;
  let ny = (screenY - hh) / hh;
  const nlen = Math.hypot(nx, ny);
  if (nlen > 1) { nx /= nlen; ny /= nlen; }
  const zoomComp = rc.mouseLeadZoomComp !== false ? (1 / Math.max(0.2, cam.zoom || 1)) : 1;
  const tx = nx * maxLead * zoomComp;
  const ty = ny * maxLead * zoomComp;
  const lk = 1 - Math.exp(-((rc.leadLerp !== undefined ? rc.leadLerp : 5)) * (dt || 0));
  cam.leadX = (cam.leadX || 0) + (tx - (cam.leadX || 0)) * lk;
  cam.leadY = (cam.leadY || 0) + (ty - (cam.leadY || 0)) * lk;
  return { leadX: cam.leadX, leadY: cam.leadY };
}

// #H5（2026-09-21 用户裁定：可见距离不得写死像素、缩放必须自由）：敌方可见半径为
// **屏幕相对**——R = screenRadiusRatio × 窄半幅/zoom × 卡牌加成系数，即 R×zoom 恒定。
// 2026-09-29 #K1 修订（根因修复，见下方 visionCenter）：**取消原 bias×R 圆心偏移与收口上限 cap**。
//   旧圆心 = 玩家 + bias×R（鼠标向量被归一化 ⇒ 偏移恒 ≈189px），而摄像机另有独立外延量
//   （mouseLeadRatio，随鼠标屏幕偏移 0~1，最多 360px）——两者几乎总不相等 ⇒ **视野圆探出视口**：
//   外延 < bias×R 时向前探出（最多 189px）、外延 > bias×R 时向后探出；探出部分内的敌人
//   「视野判定可见但被 aabbInView 视口剔除 ⇒ 不渲染」 ⇒ 体感「敌人渲染距离短于视野距离」。
//   现行：圆心 ≡ 摄像机中心（visionCenter），半径 = 窄半幅/zoom ⇒ 圆**恰好内切视口** ⇒
//   渲染边界 ≡ 视野边界，且与鼠标偏移、缩放无关。卡牌加成不再被 cap 削掉（R×zoom 恒定不变）；
//   半径超过窄半幅后纵向被屏幕裁掉是 1920×1080 的几何必然，横向仍全额生效。
// @param {any} cam 摄像机状态（vw/vh/zoom）
// @param {any} [opts] { nominal=含卡牌加成的基准半径（供加成系数）, ratio=screenRadiusRatio }
// @returns {number} 有效可见半径（世界 px，恒 ≥ 1）
function visionRadiusForViewport(cam, opts) {
  const o = opts || {};
  const vcfg = (typeof RULES !== 'undefined' && RULES.vision) || {};
  const ratio = o.ratio !== undefined ? o.ratio : (vcfg.screenRadiusRatio !== undefined ? vcfg.screenRadiusRatio : 1.0);
  const nominal = o.nominal !== undefined ? o.nominal : (vcfg.radius || 900);
  const zoom = Math.max(0.2, (cam && cam.zoom) || 1);
  const vw = (cam && cam.vw) || 960, vh = (cam && cam.vh) || 600;
  const narrowHalf = Math.min(vw, vh) / 2;
  // 屏幕相对半径：R×zoom 恒定（缩放自由）；卡牌加成按与基准半径之比放大屏幕占比。
  const base = vcfg.radius || 900;
  const bonusK = base > 0 ? nominal / base : 1;
  return Math.max(1, ratio * bonusK * narrowHalf / zoom);
}

/**
 * 视野圆心（#K1，2026-09-29）：**取摄像机中心**，使视野圆内切视口 ⇒ 渲染边界 ≡ 视野边界。
 * 世界边缘摄像机被 clampCamera 钳住时（玩家远离视口中心），圆心向玩家收敛至
 * 半径×0.85 的偏移上限，**保证玩家恒在视野圆内**（贴身威胁不会因镜头被钳而不可见）。
 * @param {any} cam 摄像机（x/y）
 * @param {{x:number,y:number}} player 玩家实体
 * @param {number} radius 有效可见半径
 * @returns {{x:number, y:number}} 视野圆心（世界坐标）
 */
function visionCenter(cam, player, radius) {
  const px = (player && Number.isFinite(player.x)) ? player.x : 0;
  const py = (player && Number.isFinite(player.y)) ? player.y : 0;
  const cx = (cam && Number.isFinite(cam.x)) ? cam.x : px;
  const cy = (cam && Number.isFinite(cam.y)) ? cam.y : py;
  const dx = cx - px, dy = cy - py;
  const d = Math.hypot(dx, dy);
  const maxOff = Math.max(0, (Number.isFinite(radius) ? radius : 0) * 0.85);
  if (d <= maxOff || d < 1e-6) return { x: cx, y: cy };
  const k = maxOff / d;
  return { x: px + dx * k, y: py + dy * k };
}

/**
 * #K1 不变量校验（2026-09-29）：视野圆是否**完全落在视口内**。
 * 半径 ≤ 窄半幅/zoom 且圆心取摄像机中心 ⇒ 圆内切视口 ⇒ inside = true，即
 * 「视野判定可见」与「实际渲染（aabbInView）」边界一致 ⇒ 敌人渲染距离 ≡ 视野距离。
 * @param {any} cam 摄像机（vw/vh/zoom/x/y）
 * @param {{x:number,y:number}} center 视野圆心（世界坐标）
 * @param {number} radius 视野半径
 * @returns {{r:number, halfW:number, halfH:number, clipped:boolean, inside:boolean}}
 */
function visionClamped(cam, center, radius) {
  const zoom = Math.max(0.2, (cam && cam.zoom) || 1);
  const halfW = ((cam && cam.vw) || 960) / 2 / zoom;
  const halfH = ((cam && cam.vh) || 600) / 2 / zoom;
  const r = Math.max(0, Number.isFinite(radius) ? radius : 0);
  const cx0 = (cam && Number.isFinite(cam.x)) ? cam.x : 0;
  const cy0 = (cam && Number.isFinite(cam.y)) ? cam.y : 0;
  const cx = (center && Number.isFinite(center.x)) ? center.x : cx0;
  const cy = (center && Number.isFinite(center.y)) ? center.y : cy0;
  const offX = Math.abs(cx - cx0), offY = Math.abs(cy - cy0);
  return {
    r: r, halfW: halfW, halfH: halfH,
    clipped: r > Math.min(halfW, halfH) + 1e-6,          // 半径超出窄半幅 ⇒ 纵向被屏幕裁掉（几何必然）
    inside: offX + r <= halfW + 1e-6 && offY + r <= halfH + 1e-6   // 圆完全在视口内
  };
}

/**
 * 立即把视口中心钳制在世界边界内（不参与跟随阻尼，考虑 cam.zoom 缩放）。
 */
function clampCamera(cam) {
  if (!cam.bounds) return;
  const w = cam.bounds.w, h = cam.bounds.h;
  const zoom = cam.zoom || 1;
  const hw = (cam.vw / 2) / zoom;
  const hh = (cam.vh / 2) / zoom;
  if (hw * 2 >= w) {
    cam.x = w / 2;                       // 视口比世界宽 → 居中
  } else {
    cam.x = Math.max(hw, Math.min(w - hw, cam.x));
  }
  if (hh * 2 >= h) {
    cam.y = h / 2;
  } else {
    cam.y = Math.max(hh, Math.min(h - hh, cam.y));
  }
}

/**
 * 世界坐标 → 屏幕坐标（视口中心 = 屏幕中心）。
 * @returns {{x:number, y:number}}
 */
function worldToScreen(cam, wx, wy) {
  return { x: (wx - cam.x) * cam.zoom + cam.vw / 2, y: (wy - cam.y) * cam.zoom + cam.vh / 2 };
}

/**
 * 屏幕坐标 → 世界坐标（鼠标拾取用）。
 * @returns {{x:number, y:number}}
 */
function screenToWorld(cam, sx, sy) {
  return { x: (sx - cam.vw / 2) / cam.zoom + cam.x, y: (sy - cam.vh / 2) / cam.zoom + cam.y };
}

/**
 * 视口在世界坐标下的 AABB（含缩放）。
 * @returns {{minX:number, minY:number, maxX:number, maxY:number}}
 */
function viewBounds(cam) {
  const hw = cam.vw / 2 / cam.zoom, hh = cam.vh / 2 / cam.zoom;
  return { minX: cam.x - hw, minY: cam.y - hh, maxX: cam.x + hw, maxY: cam.y + hh };
}

/**
 * 世界 AABB 剔除查询：以 (x,y) 为中心、w/h 为全尺寸的物体是否与视口相交。
 * @param {any} cam 摄像机状态
 * @param {number} x 中心 x
 * @param {number} y 中心 y
 * @param {number} w 全宽（px）
 * @param {number} h 全高（px）
 * @param {number} [margin] 额外外扩余量（px），默认 64 —— 物体略出视口仍保留绘制，
 *                          避免大尺寸物体（树冠/残骸/弹道特效）在边缘被硬切
 * @returns {boolean} true = 在视口内（应绘制）
 */
function aabbInView(cam, x, y, w, h, margin) {
  const m = margin !== undefined ? margin : 64;
  const vb = viewBounds(cam);
  const halfW = (w || 0) / 2 + m, halfH = (h || 0) / 2 + m;
  return x + halfW >= vb.minX && x - halfW <= vb.maxX &&
         y + halfH >= vb.minY && y - halfH <= vb.maxY;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    createCamera,
    setZoom,
    updateCamera,
    updateCameraLead,
    visionRadiusForViewport,
    visionCenter,
    visionClamped,
    clampCamera,
    worldToScreen,
    screenToWorld,
    viewBounds,
    aabbInView
  };
}
