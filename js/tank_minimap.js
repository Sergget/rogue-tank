'use strict';

// tank_minimap.js — 小地图绘制层（P-08 / DEVELOPMENT.md §6 条目 6）。
// 遵循 tank_fx/tank_battledraw 惯例：ctx 显式传参、无 DOM 依赖；布局/换算为纯函数
// （Node 可测），drawMinimap 只做纯绘制。消费方（mvp）每帧在屏幕空间调用。
//
// 小地图内容（§6 条目 6）：世界边界、掩体点、玩家/敌军/据点标记、摄像机视口矩形
// （已探索区域为 M6 简化实现：整图可见，探索迷雾为后续可选项）。

/**
 * 小地图布局换算（纯函数）：
 * 世界 (0,0)~(worldW,worldH) 按等比缩放居中放进 (mmW×mmH) 的小地图框内。
 * @returns {{ scale:number, ox:number, oy:number }} 世界→小地图：mm = world*scale + o
 */
function minimapLayout(worldW, worldH, mmW, mmH) {
  const scale = Math.min(mmW / worldW, mmH / worldH);
  const ox = (mmW - worldW * scale) / 2;
  const oy = (mmH - worldH * scale) / 2;
  return { scale: scale, ox: ox, oy: oy };
}

/**
 * 世界坐标 → 小地图像素（纯函数）。
 * @returns {{x:number, y:number}}
 */
function worldToMinimap(layout, wx, wy) {
  return { x: layout.ox + wx * layout.scale, y: layout.oy + wy * layout.scale };
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
 * @param {object} opts
 * @param {object} opts.world 世界尺寸 { w, h }
 * @param {object} opts.cam 摄像机（读 viewBounds，需 tank_camera.js 已加载）
 * @param {number} opts.x 小地图框左上角（屏幕 px）
 * @param {number} opts.y 小地图框左上角（屏幕 px）
 * @param {number} opts.w 小地图框宽（px）
 * @param {number} opts.h 小地图框高（px）
 * @param {object[]} [opts.covers] 掩体列表（画点）
 * @param {object[]} [opts.entities] 实体列表（按 team 画标记）
 * @param {number} [opts.alpha] 面板背景不透明度，默认 0.55
 */
function drawMinimap(ctx, opts) {
  const world = opts.world;
  const layout = minimapLayout(world.w, world.h, opts.w, opts.h);
  const alpha = opts.alpha !== undefined ? opts.alpha : 0.55;

  // 面板底 + 边框
  ctx.save();
  ctx.fillStyle = `rgba(10,12,14,${alpha})`;
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 1;
  ctx.fillRect(opts.x, opts.y, opts.w, opts.h);
  ctx.strokeRect(opts.x + 0.5, opts.y + 0.5, opts.w - 1, opts.h - 1);

  // 世界边界
  const wb = worldToMinimap(layout, 0, 0);
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.strokeRect(opts.x + wb.x, opts.y + wb.y, world.w * layout.scale, world.h * layout.scale);

  // 掩体点（soft/bush 淡，solid/graduated/其余 亮）
  if (opts.covers) {
    for (const c of opts.covers) {
      if (c.hp <= 0) continue;
      const p = worldToMinimap(layout, c.x, c.y);
      const dot = (c.tier === 'soft' || c.tier === 'bush') ? 1 : 1.6;
      ctx.fillStyle = (c.tier === 'full' || c.tier === 'barricade') ? 'rgba(210,180,120,0.95)'
                    : (c.tier === 'tree' || c.tier === 'fallen') ? 'rgba(120,160,90,0.9)'
                    : 'rgba(200,200,200,0.55)';
      ctx.fillRect(opts.x + p.x - dot / 2, opts.y + p.y - dot / 2, dot, dot);
    }
  }

  // 实体标记：玩家绿 / 友军蓝 / 敌军红
  if (opts.entities) {
    for (const e of opts.entities) {
      if (e.hp <= 0) continue;
      const p = worldToMinimap(layout, e.x, e.y);
      ctx.fillStyle = e.team === 'player' ? '#7ed957'
                    : e.team === 'ally' ? '#5cc8ff'
                    : '#ff5c5c';
      const r = (e.team === 'player') ? 3 : 2.2;
      ctx.beginPath();
      ctx.arc(opts.x + p.x, opts.y + p.y, r, 0, 6.2832);
      ctx.fill();
    }
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
