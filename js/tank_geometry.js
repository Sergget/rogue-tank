'use strict';

const ARMOR = {
  hull:   { front:110, side:38, rear:26 },
  turret: { front:140, side:50, rear:24 }
};
// 跳弹角 / 身高统一收口到 js/tank_rules.js（特性5：机制参数集中化）
const BOUNCE_ANGLE = RULES.ballistics.bounceAngle;
const HEIGHTS = RULES.heights;

function getPartZRange(tank, partKey) {
  const h = HEIGHTS[tank.heightClass];
  if (partKey === 'hull') return { zMin: 0, zMax: h.hull };
  if (partKey === 'turret') return { zMin: h.hull, zMax: h.hull + h.turret };
  return { zMin: 0, zMax: 1.0 };
}

function getGunHeight(tank) {
  const h = HEIGHTS[tank.heightClass];
  return h.hull + h.turret * 0.5;
}

function partCorners(cx,cy,angle,halfL,halfW){
  const local = [ [halfL,-halfW], [halfL,halfW], [-halfL,halfW], [-halfL,-halfW] ]; // FL,FR,RR,RL
  return local.map(([dx,dy])=>{
    const r = rotate(dx,dy,angle);
    return { x: cx+r.x, y: cy+r.y };
  });
}
function partEdges(corners, angle){
  const names = ['front','right','rear','left'];
  const localNormals = [ [1,0],[0,1],[-1,0],[0,-1] ];
  const edges = [];
  for(let i=0;i<4;i++){
    const a = corners[i], b = corners[(i+1)%4];
    const n = rotate(localNormals[i][0], localNormals[i][1], angle);
    edges.push({ name:names[i], a,b, nx:n.x, ny:n.y, faceKey: (names[i]==='left'||names[i]==='right') ? 'side' : names[i] });
  }
  return edges;
}

const HULL_PROTRUSION = 0.5;
function hullPoly(t){
  if (t.hullSpec) return t.hullSpec;
  const L = t.hullLen/2, W = t.hullWid/2, tip = W*HULL_PROTRUSION;
  return {
    verts: [ [L,-W], [L+tip,0], [L,W], [-L,W], [-L,-W] ],
    faces: ['front','front','side','rear','side']
  };
}

function turretPoly(t){
  if (t.turretSpec) return t.turretSpec;
  const L = t.turLen/2, W = t.turWid/2;
  return {
    verts: [ [L*0.95,-W*0.82], [L*0.95,W*0.82], [L*0.05,W*0.96], [-L*0.95,W*0.92], [-L*0.95,-W*0.92], [L*0.05,-W*0.96] ],
    faces: ['front','front','side','rear','side','front']
  };
}

// hasTurret was removed from the tank format: every tank now has a rotating turret, and its
// traverse freedom is controlled purely by `traverseLimit` (180° = full 360° rotation). The
// legacy `hasTurret === false` branch is kept only for backward compat with old JSON entries.
function superstructureAngle(t){ return (t.hasTurret === false) ? t.hullAngle : t.turretAngle; }
function superstructureLabel(t){ return (t.hasTurret === false) ? '战斗室' : '炮塔'; }

function polyCorners(cx,cy,angle, poly){
  return poly.verts.map(([dx,dy])=>{ const r = rotate(dx,dy,angle); return { x: cx+r.x, y: cy+r.y }; });
}

function polyEdges(corners, poly){
  let gx=0, gy=0; for(const c of corners){ gx+=c.x; gy+=c.y; } gx/=corners.length; gy/=corners.length;
  const edges = [];
  const n = corners.length;
  for(let i=0;i<n;i++){
    const a = corners[i], b = corners[(i+1)%n];
    const ex = b.x-a.x, ey = b.y-a.y;
    const c1x = ey,  c1y = -ex;
    const c2x = -ey, c2y = ex;
    const mx = (a.x+b.x)/2, my = (a.y+b.y)/2;
    const out1 = c1x*(mx-gx) + c1y*(my-gy);
    let nx, ny;
    if(out1 >= 0){ nx=c1x; ny=c1y; } else { nx=c2x; ny=c2y; }
    const len = Math.hypot(nx,ny) || 1;
    const face = poly.faces[i];
    edges.push({ a, b, nx:nx/len, ny:ny/len, faceKey: face, name: face });
  }
  return edges;
}

function raycastTank(ox,oy,dx,dy, tank){
  const pOff = turretPivot(tank);
  const turCx = pOff.x;
  const turCy = pOff.y;
  const parts = [
    { key:'turret', cx:turCx, cy:turCy, angle:superstructureAngle(tank), poly:turretPoly(tank) },
    { key:'hull',   cx:tank.x, cy:tank.y, angle:tank.hullAngle, poly:hullPoly(tank) }
  ];
  
  const hits = [];
  for(const p of parts){
    const corners = polyCorners(p.cx,p.cy,p.angle, p.poly);
    const edges = polyEdges(corners, p.poly);
    let best = null;
    for(const e of edges){
      const hit = segRayIntersect(ox,oy,dx,dy, e.a.x,e.a.y, e.b.x,e.b.y);
      if(hit && hit.t>0.001 && (!best || hit.t < best.t)){
        best = { t:hit.t, s:hit.s, edge:e };
      }
    }
    if(best){
      const px = ox+dx*best.t, py = oy+dy*best.t;
      hits.push({ part:p.key, edgeName:best.edge.name, faceKey:best.edge.faceKey, nx:best.edge.nx, ny:best.edge.ny, s:best.s, x:px, y:py, t:best.t });
    }
  }
  return hits.length > 0 ? hits : null;
}

// 多部位命中时选择"本步长内唯一生效"的命中：
// 炮塔是车体上层的独立构件，同一条弹道先后穿过同一平面覆盖区时炮塔应优先被命中；
// 未命中炮塔时取最靠近的第一处命中。minT/maxT 限定在炮弹以 step 推进的区间内。
function bestTankHit(hits, minT, maxT){
  if(!hits) return null;
  const cand = hits.filter(function(h){ return h.t > (minT||0.001) && h.t <= (maxT === undefined ? Infinity : maxT); });
  if(cand.length === 0) return null;
  const tur = cand.filter(function(h){ return h.part === 'turret'; });
  if(tur.length){
    tur.sort(function(a,b){ return a.t - b.t; });
    return tur[0];
  }
  cand.sort(function(a,b){ return a.t - b.t; });
  return cand[0];
}

// 发动机是否位于车体后部：由炮塔旋转中心决定——
// 炮塔旋转中心在车体中心前部(dx>0) → 弹药架在前、发动机在后；
// 炮塔旋转中心在车体中心后部(dx<0) → 弹药架在后、发动机在前。
function engineRearOf(t){
  return ((t && t.turretPivotOffset && t.turretPivotOffset.dx) || 0) >= 0;
}
// 发动机舱的局部 x（沿车体中心线，+x 为前）
function engineLocalX(t){
  const L = Math.max(1, (t.hullLen||64)/2);
  return engineRearOf(t) ? -L*0.6 : L*0.6;
}

function moduleFromHit(tank, hit){
  const Z = RULES.modules.zones;
  if(hit.part==='turret'){
    if(hit.faceKey==='side'){
      // 炮塔侧面按命中点局部 x 分前后：前段/中段 → 炮手，后段 → 装填手
      const p = turretPivot(tank);
      const rel = rotate(hit.x - p.x, hit.y - p.y, -superstructureAngle(tank));
      const halfL = Math.max(1, (tank.turLen||34)/2);
      if(rel.x/halfL >= Z.turretLoader) return {key:'gunner', label:'炮手'};
      if(rel.x/halfL >= Z.turretAmmo) return {key:'loader', label:'装填手'};
      return {key:'ammo', label:'炮塔尾舱弹药架'};
    }
    if(hit.faceKey==='rear') return {key:'commander', label:'车长'};
    return {key:'turretHull', label:'上部结构装甲'};
  }
  if(hit.faceKey==='side'){
    // 用命中点相对车体中心的局部 x 判定前后（s 的方向因左右侧面而异，不能直接用）
    const rel = rotate(hit.x - tank.x, hit.y - tank.y, -tank.hullAngle);
    const halfL = Math.max(1, (tank.hullLen||64)/2);
    const rx = rel.x / halfL;
    // 分区（波带）：极前端/极后端 → 履带；前段 → 驾驶员；中段 → 弹药架；后段 → 发动机
    if(Math.abs(rx) > Z.trackBound) return {key:'track', label:'履带/负重轮'};
    if(rx >= Z.driverFront) return {key:'driver', label:'驾驶员'};
    if(rx >= Z.ammoRear) return {key:'ammo', label:'弹药架'};
    return {key:'engine', label:'油箱/发动机'};
  }
  if(hit.faceKey==='rear'){
    return {key:'engine', label:'发动机舱'};
  }
  return {key:'hullHull', label: hit.edgeName==='front' ? '车体正面装甲' : '车体后部装甲'};
}

function faceLabel(k){ return {front:'正面',side:'侧面',rear:'后部'}[k]||k; }

function turretPivot(t){
  const off = t.turretPivotOffset || { dx: 8, dy: 0 };
  const r = rotate(off.dx, off.dy, t.hullAngle);
  return { x: t.x + r.x, y: t.y + r.y };
}

function turretFrontDist(t){
  const poly = turretPoly(t);
  let maxF = -Infinity;
  for(const [vx, vy] of poly.verts){
    if(vx > maxF) maxF = vx;
  }
  return maxF > -Infinity ? maxF : (t.turLen/2);
}

function gunRoot(t){
  const p = turretPivot(t);
  const frontDist = turretFrontDist(t);
  return {
    x: p.x + Math.cos(t.turretAngle) * frontDist,
    y: p.y + Math.sin(t.turretAngle) * frontDist
  };
}

// Export for Node.js if running in test environment
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ARMOR,
    BOUNCE_ANGLE,
    HEIGHTS,
    getPartZRange,
    getGunHeight,
    partCorners,
    partEdges,
    HULL_PROTRUSION,
    hullPoly,
    turretPoly,
    superstructureAngle,
    superstructureLabel,
    polyCorners,
    polyEdges,
    raycastTank,
    engineRearOf,
    engineLocalX,
    moduleFromHit,
    bestTankHit,
    faceLabel,
    turretPivot,
    turretFrontDist,
    gunRoot
  };
}
