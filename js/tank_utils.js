'use strict';

const TAU = Math.PI * 2;

function norm(a) {
  a = a % TAU;
  if (a < 0) a += TAU;
  return a;
}

function angDiff(a, b) {
  let d = norm(a - b);
  if (d > Math.PI) d -= TAU;
  return d;
}

function gaussian(sigma) {
  if (!sigma || sigma <= 0) return 0;
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  let val = sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
  // 95% 置信区间截断与重分布（2σ 边界）：
  // 标准高斯分布约有 4.55% 概率散布在 ±2σ 之外。
  // 若随机结果落在 2σ（95%）之外，则在 [-2σ, 2σ] 夹角内均匀重新分布，确保 100% 炮弹落在瞄准夹角内
  const limit = 2 * sigma;
  if (Math.abs(val) > limit) {
    val = (Math.random() * 2 - 1) * limit;
  }
  return val;
}

function rotate(dx, dy, theta) {
  return {
    x: dx * Math.cos(theta) - dy * Math.sin(theta),
    y: dx * Math.sin(theta) + dy * Math.cos(theta)
  };
}

function distToSegment(px, py, ax, ay, bx, by) {
  const abx = bx - ax, aby = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / ((abx * abx + aby * aby) || 1)));
  const cx = ax + abx * t, cy = ay + aby * t;
  return Math.hypot(px - cx, py - cy);
}

function segRayIntersect(ox, oy, dx, dy, ax, ay, bx, by) {
  const ex = bx - ax, ey = by - ay;
  const denom = dx * ey - dy * ex;
  if (Math.abs(denom) < 1e-9) return null;
  const t = ((ax - ox) * ey - (ay - oy) * ex) / denom;
  const s = ((ax - ox) * dy - (ay - oy) * dx) / denom;
  if (s >= 0 && s <= 1) return { t, s };
  return null;
}

function partCorners(cx, cy, angle, halfL, halfW) {
  const local = [ [halfL, -halfW], [halfL, halfW], [-halfL, halfW], [-halfL, -halfW] ]; // FL, FR, RR, RL
  return local.map(([dx, dy]) => {
    const r = rotate(dx, dy, angle);
    return { x: cx + r.x, y: cy + r.y };
  });
}

function partEdges(corners, angle) {
  const names = ['front', 'right', 'rear', 'left'];
  const localNormals = [ [1, 0], [0, 1], [-1, 0], [0, -1] ];
  const edges = [];
  for (let i = 0; i < 4; i++) {
    const a = corners[i], b = corners[(i + 1) % 4];
    const n = rotate(localNormals[i][0], localNormals[i][1], angle);
    edges.push({
      name: names[i],
      a,
      b,
      nx: n.x,
      ny: n.y,
      faceKey: (names[i] === 'left' || names[i] === 'right') ? 'side' : names[i]
    });
  }
  return edges;
}

function reflectDir(dx, dy, nx, ny) {
  const dot = dx * nx + dy * ny;
  return { x: dx - 2 * dot * nx, y: dy - 2 * dot * ny };
}

// 确定性折线「闪电/电弧」路径（#U38，2026-10-18）。
//   · 起点 (x0,y0)，沿 ang 方向总长 len，横向随机偏移上限 amp，共 segs 段。
//   · 抖动由**纯哈希**派生（同一 (seed, i) 恒得同一值）：绘制期不含 Math.random，
//     因此同一帧重绘逐字节一致（特效确定性硬约束，见 docs/specs/combat.md §6）。
//   · 返回点数组（含起点），调用方自行 stroke —— 不碰任何 canvas/DOM 状态。
//   · 两端收敛到轴线（0 振幅），中段最大，视觉上是「电弧贴在同一条血管上」而不是乱线。
function lightningPath(x0, y0, ang, len, amp, segs, seed) {
  const n = Math.max(2, Math.round(segs || 5));
  const s = (seed || 0) * 1000;
  const hash = (i) => {
    let v = Math.imul(Math.round((s + i * 37.13) * 1000) | 0, 0x9E3779B1);
    v = Math.imul(v ^ (v >>> 15), 0x85EBCA77);
    v = Math.imul(v ^ (v >>> 13), 0xC2B2AE3D);
    return ((v ^ (v >>> 16)) >>> 0) / 4294967296;
  };
  const ca = Math.cos(ang || 0), sa = Math.sin(ang || 0);
  // 法线（-sin, cos）
  const nx = -sa, ny = ca;
  const pts = [{ x: x0, y: y0 }];
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    // 端点收敛：sin(πt) 在 t=0/1 处为 0，中段最大
    const taper = Math.sin(Math.PI * t);
    const off = (hash(i) - 0.5) * 2 * (amp || 0) * taper;
    // 沿程也带一点非均匀推进（电弧不是等距折线）
    const along = t + (i < n ? (hash(i + 101) - 0.5) * 0.16 : 0);
    pts.push({ x: x0 + ca * len * along + nx * off, y: y0 + sa * len * along + ny * off });
  }
  return pts;
}

// Export for Node.js if running in test environment
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    TAU,
    norm,
    angDiff,
    gaussian,
    rotate,
    distToSegment,
    segRayIntersect,
    partCorners,
    partEdges,
    reflectDir,
    lightningPath
  };
}
