'use strict';

// tank_halfgeom.js — shared half-form polygon geometry (tank_designer.html).
// Local convention matches tank_mvp.html: +x = forward, +y = left. Shapes are authored as the
// y<=0 ("right") half; the y>0 half is generated automatically by mirroring across the x-axis
// (the hull/turret centerline). This guarantees every shape is left-right symmetric, which is
// true of every real tank silhouette and removes a whole class of "oops the two sides don't
// match" bugs from hand-authored JSON.
//
// Pure logic only — no DOM / canvas — so the same geometry code can be unit-tested in Node.
// rotate / distToSegment are provided globally by tank_utils.js (tank_rules→utils load first).
//
//   buildFullVerts(half)                        — half -> full closed polygon vertex list
//   buildFullFacesWithFlags(half, ...)          — half + seam faces -> full faces + primary flags
//   buildFullFaces(half, ...)                   — same, faces only
//   defaultHull() / defaultTurret()             — default shapes (half-form)
//   halfFromFull(verts, faces)                  — best-effort reverse conversion
//   recenterPoly(poly)                          — shift half so the full silhouette is bbox-centered
//   normalizeBarrel(b)                          — normalize a barrel spec (new or legacy format)

const CENTER_EPS = 1e-4;
function onCenterline(p){ return Math.abs(p[1]) < CENTER_EPS; }
function mirrorPt(p){ return [p[0], -p[1]]; }
function pointsEqual(a,b){ return Math.abs(a[0]-b[0])<CENTER_EPS && Math.abs(a[1]-b[1])<CENTER_EPS; }

// half -> full closed polygon vertex list (mirrors the half across y=0, dropping duplicate seam verts)
function buildFullVerts(half){
  if(half.length===0) return [];
  const full = half.map(p=>p.slice());
  const revMirror = half.slice().reverse().map(mirrorPt);
  if(revMirror.length && pointsEqual(revMirror[0], full[full.length-1])) revMirror.shift();
  if(revMirror.length && pointsEqual(revMirror[revMirror.length-1], full[0])) revMirror.pop();
  return full.concat(revMirror);
}
// half + halfFaces (n-1 internal edges) + seam faces -> full faces array, index-aligned with buildFullVerts().
// Also returns a parallel `primary` boolean array: true for edges the user actually controls (the
// half-chain edges, clickable on canvas, plus the two seam edges, editable from the sidebar list);
// false for the mirrored-chain edges, which just copy their counterpart's value and aren't independently editable.
function buildFullFacesWithFlags(half, getHalfFace, frontSeamFace, rearSeamFace){
  const n = half.length;
  if(n===0) return { faces:[], primary:[] };
  const touchesFront = onCenterline(half[0]);
  const touchesRear = onCenterline(half[n-1]);
  const chain = []; for(let i=0;i<n-1;i++) chain.push(getHalfFace(i));
  const faces = chain.slice();
  const primary = chain.map(()=>true);
  if(!touchesRear){ faces.push(rearSeamFace); primary.push(true); }
  const mchain = chain.slice().reverse();
  faces.push(...mchain); primary.push(...mchain.map(()=>false));
  if(!touchesFront){ faces.push(frontSeamFace); primary.push(true); }
  return { faces, primary };
}
function buildFullFaces(half, getHalfFace, frontSeamFace, rearSeamFace){
  return buildFullFacesWithFlags(half, getHalfFace, frontSeamFace, rearSeamFace).faces;
}

// ================= default shapes (half-form, right side y<=0) =================
// Reconstructed from tank_mvp.html's hullPoly()/turretPoly() at hullLen=64/hullWid=38/turLen=34/turWid=36 —
// mirroring these halves reproduces the exact same full polygons the prototype currently hardcodes.
function defaultHull(){
  return {
    half: [[41.5,0], [32,-19], [-32,-19]],        // tip -> front-right -> rear-right
    halfFaces: ['front','side'],                   // tip-FR, FR-RR
    frontSeamFace: 'front', rearSeamFace: 'rear',   // rear seam is the flat rear plate
    armor: { front:110, side:38, rear:26 }
  };
}
function defaultTurret(){
  return {
    half: [[16.15,-14.76], [0.85,-17.28], [-16.15,-16.56]], // front-right -> mid-right -> rear-right
    halfFaces: ['front','side'],
    frontSeamFace: 'front', rearSeamFace: 'rear',
    armor: { front:140, side:50, rear:24 },
    pivot: { dx:8, dy:0 },
    axis: { dx:0, dy:0 }   // 炮塔自身旋转轴（本地帧内），经归一化后恒为 (0,0)；与车体 pivot 概念分离
  };
}

// ================= face helpers =================
function getFace(faces, i){ return faces[i] || 'side'; }
function setFace(faces, i, val){ faces[i] = val; }
function nextFace(f){ return f==='front' ? 'side' : f==='side' ? 'rear' : 'front'; }

// Import accepts either the full-polygon export format, OR a half-form save (verts/faces already
// expressed as {half, halfFaces, frontSeamFace, rearSeamFace}) so re-loading a previous export
// round-trips losslessly. Full-form import derives a half by taking every vertex with y<=0 in
// order — this is a best-effort reconstruction and assumes the source was actually symmetric.
// If the input full polygon is oriented counter-clockwise (CCW, signed area > 0), it is reversed
// to enforce standard CW (front -> right side -> rear) order.
function polygonSignedArea(pts){
  let a = 0;
  for(let i=0;i<pts.length;i++){
    const p1 = pts[i], p2 = pts[(i+1)%pts.length];
    a += (p1[0]*p2[1] - p2[0]*p1[1]);
  }
  return a * 0.5;
}

function halfFromFull(verts, faces){
  if(!verts || !verts.length) return { half:[], halfFaces:[], frontSeamFace:'front', rearSeamFace:'rear' };
  let srcVerts = verts.map(p=>p.slice());
  let srcFaces = Array.isArray(faces) ? faces.slice() : [];
  if(polygonSignedArea(srcVerts) > 0){
    srcVerts.reverse();
    if(srcFaces.length === srcVerts.length){
      const revFaces = [];
      for(let i = srcFaces.length - 1; i >= 0; i--){
        revFaces.push(srcFaces[i]);
      }
      srcFaces = revFaces;
    }
  }

  const half = [];
  const halfFaces = [];
  for(let i=0;i<srcVerts.length;i++){
    if(srcVerts[i][1] <= CENTER_EPS){
      half.push(srcVerts[i].slice());
    }
  }
  for(let i=0;i<half.length-1;i++) halfFaces.push('side');
  // best-effort: try to recover edge classifications for consecutive half vertices from the source
  // faces array by matching endpoints; falls back to 'side' if not found.
  for(let i=0;i<half.length-1;i++){
    for(let j=0;j<srcVerts.length;j++){
      const a=srcVerts[j], b=srcVerts[(j+1)%srcVerts.length];
      if((pointsEqual(a,half[i])&&pointsEqual(b,half[i+1])) || (pointsEqual(b,half[i])&&pointsEqual(a,half[i+1]))){
        halfFaces[i] = srcFaces[j]; break;
      }
    }
  }
  let frontSeamFace='front', rearSeamFace='rear';
  if(half.length){
    const first=half[0], last=half[half.length-1];
    for(let j=0;j<srcVerts.length;j++){
      const a=srcVerts[j], b=srcVerts[(j+1)%srcVerts.length];
      if(!onCenterline(first) && ((pointsEqual(a,first)&&pointsEqual(b,mirrorPt(first)))||(pointsEqual(b,first)&&pointsEqual(a,mirrorPt(first))))) frontSeamFace = srcFaces[j];
      if(!onCenterline(last) && ((pointsEqual(a,last)&&pointsEqual(b,mirrorPt(last)))||(pointsEqual(b,last)&&pointsEqual(a,mirrorPt(last))))) rearSeamFace = srcFaces[j];
    }
  }
  return { half, halfFaces, frontSeamFace, rearSeamFace };
}
// Shift a half poly so its full silhouette is centered on its own bbox center (matching how
// tank_mvp.html's applyTankConfig centers the HULL hull). Turret polygons are NOT centered here —
// their local origin must stay exactly where `pivot` puts them.
function recenterPoly(poly){
  const full = buildFullVerts(poly.half);
  if(full.length < 2){ return poly; }
  let minX=Infinity, maxX=-Infinity, minY=Infinity, maxY=-Infinity;
  for(const [vx,vy] of full){
    if(vx<minX) minX=vx; if(vx>maxX) maxX=vx; if(vy<minY) minY=vy; if(vy>maxY) maxY=vy;
  }
  const cx = (minX+maxX)/2, cy = (minY+maxY)/2;
  poly.half = poly.half.map(([vx,vy])=>[ Math.round((vx-cx)*10)/10, Math.round((vy-cy)*10)/10 ]);
  return poly;
}
// normalize a barrel spec (new {evac:{style,pos}, jacket:{len,pos}} format OR legacy evacPos number)
function normalizeBarrel(b){
  if(!b) return { len:120, width:18, muzzle:'none', evac:{ style:'none', pos:30 }, jacket:{ len:0, pos:45 }, mantlet:{ style:'none', pos:0, width:40 } };
  let evac;
  if(b.evac && b.evac.style) evac = { style:b.evac.style, pos: b.evac.pos !== undefined ? b.evac.pos : 30 };
  else if(b.evacPos !== undefined) evac = { style: b.evacPos > 0 ? 'ring' : 'none', pos: b.evacPos };
  else evac = { style:'none', pos:30 };
  return {
    len: b.len || 120, width: b.width || 18, muzzle: b.muzzle || 'none',
    evac,
    jacket: b.jacket ? { len: b.jacket.len||0, pos: b.jacket.pos!==undefined ? b.jacket.pos : 45 } : { len:0, pos:45 },
    mantlet: b.mantlet ? { style: b.mantlet.style||'none', pos: b.mantlet.pos!==undefined ? b.mantlet.pos : 0, width: b.mantlet.width!==undefined ? b.mantlet.width : 40 } : { style:'none', pos:0, width:40 }
  };
}

if (typeof module !== 'undefined' && module.exports) {
  const U = require('./tank_utils.js');
  module.exports = {
    CENTER_EPS,
    rotate: U.rotate,
    distToSegment: U.distToSegment,
    onCenterline,
    mirrorPt,
    pointsEqual,
    buildFullVerts,
    buildFullFacesWithFlags,
    buildFullFaces,
    defaultHull,
    defaultTurret,
    getFace,
    setFace,
    nextFace,
    halfFromFull,
    recenterPoly,
    normalizeBarrel
  };
}