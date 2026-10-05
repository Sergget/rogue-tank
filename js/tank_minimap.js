'use strict';

// tank_minimap.js — 小地图绘制层（P-08 / DEVELOPMENT.md §6 条目 6；C 档 batch 1 小地图条带化）。
// 遵循 tank_fx/tank_battledraw 惯例：ctx 显式传参、无 DOM 依赖；布局/换算为纯函数
// （Node 可测），drawMinimap 只做纯绘制。消费方（mvp）每帧在屏幕空间调用。
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
 * 绘制小地图。屏幕空间调用（摄像机变换之外）。
 * @param {CanvasRenderingContext2D} ctx
 * @param {any} opts 绘制选项（#26：宽松类型，避免 checkJs 对属性访问误报）：
 *   opts.world 世界尺寸 { w, h }；opts.cam 摄像机（读 viewBounds）；
 *   opts.x/opts.y/opts.w/opts.h 小地图框（屏幕 px）；opts.covers 掩体列表；
 *   opts.entities 实体列表；opts.alpha 面板背景不透明度，默认 0.55
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

  // 掩体点（soft/bush 淡，solid/graduated/其余 亮）
  // P-40 地形抽象：按 tierGroup 编码——liquid 系(水/河)蓝、ground 系(泥)褐点、
  // structure 新地形(rock/intact/ruined)实心方块；其余 tier 维持旧配色。
  if (opts.covers) {
    for (const c of opts.covers) {
      if (c.hp <= 0) continue;
      const p = worldToMinimap(layout, c.x, c.y);
      const tg = (typeof COVER_TIERS !== 'undefined' && COVER_TIERS[c.tier]) ? COVER_TIERS[c.tier].tierGroup : null;
      let dot = (c.tier === 'soft' || c.tier === 'bush') ? 1 : 1.6;
      let color = (c.tier === 'full' || c.tier === 'barricade') ? 'rgba(210,180,120,0.95)'
                : (c.tier === 'tree' || c.tier === 'fallen') ? 'rgba(120,160,90,0.9)'
                : 'rgba(200,200,200,0.55)';
      if (tg === 'liquid') { dot = 2.2; color = 'rgba(64,156,225,0.95)'; }
      else if (tg === 'ground') { dot = 2.2; color = 'rgba(140,102,52,0.9)'; }
      else if (tg === 'structure' && (c.tier === 'rock' || c.tier === 'intact' || c.tier === 'ruined')) { dot = 2.4; color = 'rgba(190,190,185,0.95)'; }
      ctx.fillStyle = color;
      ctx.fillRect(opts.x + p.x - dot / 2, opts.y + p.y - dot / 2, dot, dot);
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
    worldRectToMinimap
  };
}
