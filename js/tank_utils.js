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
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
}

function rotate(dx, dy, theta) {
  return {
    x: dx * Math.cos(theta) - dy * Math.sin(theta),
    y: dx * Math.sin(theta) + dy * Math.cos(theta)
  };
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

// Export for Node.js if running in test environment
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    TAU,
    norm,
    angDiff,
    gaussian,
    rotate,
    segRayIntersect,
    partCorners,
    partEdges,
    reflectDir
  };
}
