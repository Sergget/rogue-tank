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

// #H5（2026-09-21 用户裁定：可见距离不得写死像素、缩放必须自由）：敌方可见半径重定义为
// **屏幕相对**——R = screenRadiusRatio × 窄半幅/zoom × (1+卡牌加成)，即 R×zoom 恒定：
// 敌人在屏幕上的出现位置与缩放无关，玩家自由缩放（看细节/看全局）不再被「固定像素可见距离」
// 绑架（#H2 的深度拉远与 #H1 的窄轴收口都因此失去必要性，二者降级/删除，见下）。
// 收口上限保留为几何护栏：R 仍须 ≤ 窄轴屏幕前向容量/(1+bias)（圆心偏移 bias×R 后，
// 前向边界才能落在屏幕容量内、各方向等距）。注意该上限在「窄半幅≫外延」的常见视口下
// 通常不绑定（容量 ≈ R×(1+bias) ≥ R×(1+bias)），仅极扁视口时兜底。
// @param {any} cam 摄像机状态（vw/vh/zoom）
// @param {any} [opts] { nominal=含卡牌加成的基准半径（供上限式外延项）, bias, leadRatio, leadBase, ratio=screenRadiusRatio }
// @returns {number} 有效可见半径（世界 px，恒 ≥ 1）
function visionRadiusForViewport(cam, opts) {
  const o = opts || {};
  const vcfg = (typeof RULES !== 'undefined' && RULES.vision) || {};
  const ratio = o.ratio !== undefined ? o.ratio : (vcfg.screenRadiusRatio !== undefined ? vcfg.screenRadiusRatio : 1.0);
  const nominal = o.nominal !== undefined ? o.nominal : (vcfg.radius || 900);
  const bias = Math.max(0, o.bias !== undefined ? o.bias : (vcfg.bias !== undefined ? vcfg.bias : 0.35));
  const rc = (typeof RULES !== 'undefined' && RULES.camera) || {};
  const leadRatio = o.leadRatio !== undefined ? o.leadRatio
    : (rc.mouseLeadRatio !== undefined ? rc.mouseLeadRatio : 0.30);
  // 外延基准半径：与 updateCameraLead 同源（RULES.vision.radius，**不含**卡牌加成），
  // 保证镜头外延量与收口上限使用同一口径
  const leadBase = o.leadBase !== undefined ? o.leadBase : (vcfg.radius || 900);
  const zoom = Math.max(0.2, (cam && cam.zoom) || 1);
  const vw = (cam && cam.vw) || 960, vh = (cam && cam.vh) || 600;
  const narrowHalf = Math.min(vw, vh) / 2;
  // ① 屏幕相对半径：R×zoom 恒定（缩放自由的核心）——卡牌加成按比例放大屏幕占比
  //    （nominal = RULES.vision.radius × (1+加成%)，与基准半径之比即加成系数）
  const base = vcfg.radius || 900;
  const bonusK = base > 0 ? nominal / base : 1;
  const screenRelative = ratio * bonusK * narrowHalf / zoom;
  // ② 几何护栏：前向边界 (1+bias)×R ≤ 窄轴屏幕前向容量（窄半幅/zoom + 外延/zoom）
  const screenReach = narrowHalf / zoom + (leadBase * leadRatio) / zoom;
  const cap = screenReach / (1 + bias);
  return Math.max(1, Math.min(screenRelative, cap));
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
    clampCamera,
    worldToScreen,
    screenToWorld,
    viewBounds,
    aabbInView
  };
}
