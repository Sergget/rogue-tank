'use strict';
// js/tank_scene3d.js — R1 场景几何（纯函数，无 WebGL / DOM 依赖）
//
// 把现有二维世界（node / covers / tanks / shells / particles）转成 3D 三角形批。
// 只负责几何与颜色；上传与绘制在 js/tank_render3d.js。
// 坐标：世界 (x, y) → 3D (x, height, y)，Y 轴朝上。
//
// **视觉参数**（层高/配色）只服务 R1 画面，不参与任何判定；游戏数值仍以 RULES 为准。

/** 各 tier 的 3D 视觉参数（高度 px / 颜色 RGBA 0..1）。未知 tier 走 default。 */
const TIER_VIS = {
  full: { h: 110, c: [0.52, 0.47, 0.40, 1] },
  wall: { h: 80, c: [0.48, 0.44, 0.38, 1] },
  wall_breakable: { h: 80, c: [0.50, 0.45, 0.38, 1] },
  perm_block: { h: 120, c: [0.40, 0.40, 0.42, 1] },
  building: { h: 150, c: [0.56, 0.50, 0.42, 1] },
  intact: { h: 100, c: [0.55, 0.50, 0.44, 1] },
  ruined: { h: 55, c: [0.42, 0.37, 0.31, 1] },
  rock: { h: 80, c: [0.46, 0.46, 0.48, 1] },
  tree: { h: 150, c: [0.18, 0.42, 0.18, 1] },
  bush: { h: 34, c: [0.22, 0.46, 0.20, 1] },
  fallen: { h: 22, c: [0.30, 0.32, 0.20, 1] },
  stump: { h: 16, c: [0.38, 0.30, 0.20, 1] },
  rubble: { h: 14, c: [0.36, 0.33, 0.29, 1] },
  bridge: { h: 12, c: [0.42, 0.40, 0.36, 1] },
  water: { h: 0, c: [0.14, 0.34, 0.55, 0.78] },
  river: { h: 0, c: [0.14, 0.34, 0.55, 0.82] },
  mud: { h: 0, c: [0.28, 0.24, 0.18, 0.9] },
  road: { h: 0, c: [0.24, 0.23, 0.21, 1] },
  default: { h: 60, c: [0.45, 0.44, 0.40, 1] },
};

/** 平地层（水/泥/路）的绘制高度，避免与地面 z-fighting。 */
const FLAT_Y = { road: 0.8, mud: 1.2, water: 1.6, river: 1.6, bridge: 2.0 };

const TEAM_COLOR = {
  player: [0.30, 0.62, 0.30, 1],
  ally: [0.28, 0.52, 0.62, 1],
  enemy: [0.62, 0.28, 0.24, 1],
};

function tierVisual(tier) {
  return TIER_VIS[tier] || TIER_VIS.default;
}

/**
 * 掩体的世界 x/z 多边形（矩形或 verts；verts 支持多段嵌套）。
 * @param {any} c cover 实例
 * @returns {{x:number,y:number}[][]} 每个子多边形一组点
 */
function coverPolygons(c) {
  if (!c) return [];
  const ang = c.angle || 0;
  const ca = Math.cos(ang), sa = Math.sin(ang);
  const toWorld = (lx, ly) => ({ x: c.x + lx * ca - ly * sa, y: c.y + lx * sa + ly * ca });
  const vs = c.verts;
  if (vs && Array.isArray(vs) && vs.length) {
    const nested = Array.isArray(vs[0]) && Array.isArray(vs[0][0]);
    const parts = nested ? vs : [vs];
    return parts
      .filter(poly => Array.isArray(poly) && poly.length >= 3)
      .map(poly => poly.map(p => toWorld(p[0], p[1])));
  }
  const hw = (c.w || 0) / 2, hh = (c.h || 0) / 2;
  return [[toWorld(-hw, -hh), toWorld(hw, -hh), toWorld(hw, hh), toWorld(-hw, hh)]];
}

function isFlatTier(tier) {
  return tier === 'road' || tier === 'mud' || tier === 'water' || tier === 'river' || tier === 'bridge';
}

/**
 * 构建静态场景（地面 + 路网 + 水/泥 + 地物）。
 * @param {{node:any, covers:any[], build?:any}} opts
 *   node 需含 {w,h,biome}；build 可注入 createMeshBuilder（Node 测试）
 * @returns {number[]} 顶点数据（10 floats/vertex）
 */
function buildStaticScene(opts) {
  const o = opts || /** @type {any} */ ({});
  const node = o.node || { w: 2000, h: 1200, biome: 'grass' };
  const covers = Array.isArray(o.covers) ? o.covers : [];
  const b = o.build || createMeshBuilder();
  const biomeColor = BIOME_COLOR[node.biome] || BIOME_COLOR.grass;

  // 世界外的暗色地台：相机视野大于节点时不留纯黑空洞（只影响观感，不是可玩区域）
  b.ground(-3000, -3000, node.w + 3000, node.h + 3000, -2, [0.10, 0.12, 0.09, 1]);
  // 地面（略低于所有平地层）
  b.ground(0, 0, node.w, node.h, 0, biomeColor);

  // 先画平地层（路/泥/水），再画立体地物
  for (const c of covers) {
    if (!c || c.hp <= 0) continue;
    if (!isFlatTier(c.tier)) continue;
    const y = FLAT_Y[c.tier] !== undefined ? FLAT_Y[c.tier] : 1;
    const col = tierVisual(c.tier).c;
    for (const poly of coverPolygons(c)) b.extrude(poly, y, 0.01, col);
  }

  for (const c of covers) {
    if (!c || c.hp <= 0) continue;
    if (isFlatTier(c.tier)) continue;
    const vis = tierVisual(c.tier);
    const polys = coverPolygons(c);
    if (c.tier === 'tree' || c.tier === 'bush') {
      for (const poly of polys) {
        const cx = poly.reduce((s, p) => s + p.x, 0) / poly.length;
        const cz = poly.reduce((s, p) => s + p.y, 0) / poly.length;
        const r = Math.max(14, Math.min(c.w || 40, c.h || 40) * 0.45);
        b.cone(cx, 0, cz, r, vis.h, 8, vis.c);
        // 树干
        b.box(cx, 0, cz, r * 0.28, vis.h * 0.28, r * 0.28, [0.30, 0.22, 0.14, 1]);
      }
      continue;
    }
    for (const poly of polys) b.extrude(poly, 0, vis.h, vis.c);
  }
  return b.data;
}

const BIOME_COLOR = {
  grass: [0.22, 0.30, 0.17, 1],
  snow: [0.78, 0.80, 0.84, 1],
  desert: [0.62, 0.55, 0.36, 1],
  swamp: [0.20, 0.26, 0.18, 1],
  urban: [0.32, 0.31, 0.29, 1],
  default: [0.24, 0.30, 0.20, 1],
};

/**
 * 把 hullPoly/turretPoly 的局部顶点（{verts:[...]} 或点数组）转到世界坐标。
 * @param {any} spec
 * @param {number} cx
 * @param {number} cy
 * @param {number} angle
 * @returns {{x:number,y:number}[]}
 */
function polyToWorld(spec, cx, cy, angle) {
  if (!spec) return [];
  const vs = Array.isArray(spec) ? spec : (Array.isArray(spec.verts) ? spec.verts : []);
  const ca = Math.cos(angle || 0), sa = Math.sin(angle || 0);
  return vs.map(p => {
    const lx = Array.isArray(p) ? p[0] : p.x;
    const ly = Array.isArray(p) ? p[1] : p.y;
    return { x: cx + lx * ca - ly * sa, y: cy + lx * sa + ly * ca };
  });
}

/**
 * 单辆坦克的动态几何（车体 + 炮塔 + 炮管）。
 * @param {any} t 实体
 * @param {{hullPoly?:Function, turretPoly?:Function, gunRoot?:Function}} [fns]
 */
function buildTankMesh(t, fns) {
  const f = fns || {};
  const hullFn = f.hullPoly || (typeof hullPoly === 'function' ? hullPoly : null);
  const turretFn = f.turretPoly || (typeof turretPoly === 'function' ? turretPoly : null);
  const b = createMeshBuilder();
  if (!hullFn) return b.data;
  const base = TEAM_COLOR[t.team] || TEAM_COLOR.enemy;
  const hull = polyToWorld(hullFn(t), t.x, t.y, t.hullAngle || 0);
  if (hull.length >= 3) b.extrude(hull, 0, 26, base);
  const turret = turretFn ? polyToWorld(turretFn(t), t.x, t.y, t.turretAngle || 0) : null;
  if (turret && turret.length >= 3) b.extrude(turret, 26, 16, [base[0] * 1.1, base[1] * 1.1, base[2] * 1.1, 1]);
  // 炮管：从炮塔中心沿 turretAngle 伸出
  const len = (t.hullLen || 70) * 0.55;
  const bx = t.x + Math.cos(t.turretAngle || 0) * len * 0.55;
  const bz = t.y + Math.sin(t.turretAngle || 0) * len * 0.55;
  b.box(bx, 30, bz, len, 5, 5, [0.25, 0.25, 0.24, 1], -(t.turretAngle || 0));
  return b.data;
}

/**
 * 炮弹（小方块）与粒子（烟尘）。
 * @param {any[]} shells
 * @param {any[]} particles {x,y,z,life,maxLife,size,color?}
 */
function buildDynamicFx(shells, particles) {
  const b = createMeshBuilder();
  for (const s of (Array.isArray(shells) ? shells : [])) {
    if (!s) continue;
    b.box(s.x, 24 + (s.z || 0), s.y, 6, 3, 6, [0.95, 0.85, 0.45, 1], -(s.angle || 0));
  }
  for (const p of (Array.isArray(particles) ? particles : [])) {
    const a = Math.max(0, Math.min(1, p.life / (p.maxLife || 1)));
    const c = p.color || [0.35, 0.35, 0.34];
    b.box(p.x, p.z || 18, p.y, p.size || 10, p.size || 10, p.size || 10, [c[0], c[1], c[2], a * 0.55]);
  }
  return b.data;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    TIER_VIS,
    FLAT_Y,
    TEAM_COLOR,
    BIOME_COLOR,
    tierVisual,
    coverPolygons,
    polyToWorld,
    isFlatTier,
    buildStaticScene,
    buildTankMesh,
    buildDynamicFx,
  };
}
