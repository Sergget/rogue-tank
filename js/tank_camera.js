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
    minZoom: opts.minZoom || rc.minZoom || 0.5,
    maxZoom: opts.maxZoom || rc.maxZoom || 2.0,
    bounds: opts.bounds || null
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
  const lo = cam.minZoom || 0.5, hi = cam.maxZoom || 2.0;
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
    cam.x += (target.x - cam.x) * k;
    cam.y += (target.y - cam.y) * k;
  }
  clampCamera(cam);
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
    clampCamera,
    worldToScreen,
    screenToWorld,
    viewBounds,
    aabbInView
  };
}
