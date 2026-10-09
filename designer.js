(() => {
const canvas = document.getElementById('editor-canvas');
const ctx = canvas.getContext('2d');
// 高分屏（devicePixelRatio > 1）下按物理像素建后备缓冲，并用 setTransform 保持全部绘图逻辑
// 沿用 CSS 像素坐标（命中测试/坐标读数均为 CSS px，无需改动）；避免画布被浏览器放大导致画面模糊。
let canvasDpr = 1;
function resize(){
  canvasDpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(canvas.clientWidth * canvasDpr));
  canvas.height = Math.max(1, Math.round(canvas.clientHeight * canvasDpr));
  ctx.setTransform(canvasDpr, 0, 0, canvasDpr, 0, 0);
  render();
}
window.addEventListener('resize', resize);

// ================= geometry / mirror helpers =================
// Local convention matches tank_mvp.html: +x = forward, +y = left. We only ever let the user edit
// the y<=0 ("right") half of a polygon; the y>0 half is generated automatically by mirroring across
// the x-axis (the hull/turret centerline). Shared helper functions (buildFullVerts, buildFullFaces,
// defaultHull, defaultTurret, halfFromFull, recenterPoly, normalizeBarrel, etc.) are loaded from
// js/tank_halfgeom.js.

// 正 n 边形炮塔形状预设：以原点（=炮塔旋转中心）为外接圆圆心，顶点按 -x 方向顺时针落位，
// n∈[3,8]。`flatFront`=true 时绕起点偏移 半步角，使最前方落在"边中点"上（齐边朝前），否则落在
// "顶点"上（尖角朝前）。两种朝向的图形都以车体中轴线(y=0)为对称轴，可直接提取右半侧半形。
function turretRegularPreset(n, R, flatFront){
  const step = 2*Math.PI/n;
  const start = flatFront ? step/2 : 0;
  const pts = [];
  for(let k=0;k<n;k++){
    const a = start - k*step;
    pts.push({ a, x:R*Math.cos(a), y:R*Math.sin(a) });
  }
  const halfPts = pts.filter(p=>p.y <= CENTER_EPS);
  const r1 = v=>Math.round(v*10)/10;
  const half = halfPts.map(p=>[r1(p.x), r1(p.y)]);
  const halfFaces = [];
  for(let k=0;k<halfPts.length-1;k++){
    const midA = (halfPts[k].a + halfPts[k+1].a)/2;
    const mx = R*Math.cos(midA);
    halfFaces.push(Math.abs(mx) < 1e-6 ? 'side' : (mx > 0 ? 'front' : 'rear'));
  }
  return {
    half,
    halfFaces,
    frontSeamFace: 'front',
    rearSeamFace: 'rear',
    armor: state.turret.armor,
    pivot: state.turret.pivot
  };
}

// ================= state =================
let state = {
   id:'new_tank', traverseLimit:180,
   maxSpeed:120, turnRate:2.0, turretTurnRate:2.2,
   hp:100, penetration:120, damage:34, reload:1.3, heightClass:'medium',
   spreadMult: 1, aimSpeed: 0.15,
   trackWidth: 8, trackOffset: 0,
   texture: 'none', // 表面纹理（TEXTURE_DEFS 键：none/armor_plate/weld_seam/rust/camo/camo_dunkelgelb/paint_panzergrau/camo_nato/paint_soviet）
   sprite: defaultSprite(), // 整车精灵（AI 生成贴图）：{ enabled, hull:{img,scale,dx,dy,rot}, turret:{img,scale,dx,dy,rot,pivot:[px,py]} }
   // 仅设计器画布叠加显示，不写入存档。
   // #L7：默认关闭——未对齐（或贴图带残留白底）时叠加会直接盖住多边形，让「顶点/装甲」
   // 编辑变得无法判读；对齐时由用户显式勾选「画布显示精灵」。
   spritePreview: false,
   hull: defaultHull(),
   turret: defaultTurret(),
   barrel: { len:120, width:18, muzzle:'none', evac:{ style:'ring', pos:30 }, jacket:{ len:0, pos:45 }, mantlet:{ style:'none', pos:0, width:40 } },
   // 覆盖体编辑状态 - 用于 #78 不规则掩体顶点编辑
   currentCover: {
     verts: [],           // 世界空间顶点数组 [[x1,y1], [x2,y2], ...]
     tier: 'rock',        // 默认掩体类型
     closed: false        // 是否为闭合多边形（至少3个顶点）
   }
};

// gun barrel / mantlet presets 已下沉为配置模块 js/tank_presets.js（BARREL_PRESETS / MANTLE_PRESETS）

// ================= state =================
let mode = 'hull'; // 'hull' | 'turret' | 'pivot' | 'preview' | 'cover'
let viewScale = 5;
let drag = null;
let selected = null; // { poly:'hull'|'turret', index }
let selectedCoverVertex = null; // { index } for cover vertex selection
let hoverEdge = null;   // { poly, index } edge under cursor (canvas highlight)
let selectedEdge = null; // { poly, index, seam:'front'|'rear' } edge chosen in list/canvas
let snapToGrid = false;
let previewAngle = 0;
let trackPhase = 0; // scrolling track animation phase for edit modes (driven at fixed rate)
// 编辑列表选中项（驱动面板显隐）：'hull' | 'turret' | 'modules' | 'appearance'
let editTab = 'hull';
// 部件可见性开关（纯编辑辅助，不写入任何导出/JSON）：隐藏的部件不渲染、不参与画布命中
let partVisible = { hull: true, turret: true };
const HIT_R = 9, EDGE_HIT_R = 8;
const ZOOM_MIN = 0.3, ZOOM_MAX = 8;

function hullCenter(){ return { x: canvas.clientWidth/2, y: canvas.clientHeight/2 }; }
function turretCenter(){ const c = hullCenter(); return { x: c.x + state.turret.pivot.dx*viewScale, y: c.y + state.turret.pivot.dy*viewScale }; }
// 炮塔坐标系点 -> 屏幕世界坐标点
// 炮塔坐标系：原点 (0,0) 为炮塔基础几何原点；
// 炮塔的座圈圆心横坐标为 axis.dx，纵坐标始终为 0；
// 车体的座圈圆心坐标为 pivot (pivot.dx, pivot.dy)。
function turretToScreen(localPt, angle){
  const hc = hullCenter();
  const ringX = hc.x + state.turret.pivot.dx * viewScale;
  const ringY = hc.y + (state.turret.pivot.dy || 0) * viewScale;
  const ax = (state.turret.axis && state.turret.axis.dx) || 0;
  
  // 局部点相对于炮塔座圈圆心 (ax, 0) 的偏移向量
  const relX = localPt[0] - ax;
  const relY = localPt[1] - 0;
  
  if (angle) {
    const r = rotate(relX, relY, angle);
    return { x: ringX + r.x * viewScale, y: ringY + r.y * viewScale };
  }
  return { x: ringX + relX * viewScale, y: ringY + relY * viewScale };
}
function getCanvasPos(e){ const r = canvas.getBoundingClientRect(); return { x: e.clientX-r.left, y: e.clientY-r.top }; }
function toScreen(center, local, angle){
  const p = angle ? rotate(local[0],local[1],angle) : { x:local[0], y:local[1] };
  return { x: center.x + p.x*viewScale, y: center.y + p.y*viewScale };
}
function toLocal(center, sx, sy){ return [ (sx-center.x)/viewScale, (sy-center.y)/viewScale ]; }

const FACE_COLOR = { front:'#ff5c4d', side:'#5cc8ff', rear:'#b98aff' };

// ================= hit testing for turret / hull =================
function findVertexHit(poly, center, sx, sy){
  for(let i=0;i<poly.half.length;i++){
    const w = toScreen(center, poly.half[i]);
    if(Math.hypot(sx-w.x, sy-w.y) <= HIT_R) return i;
  }
  return -1;
}
function findVertexHitForTurret(poly, sx, sy){
  for(let i=0;i<poly.half.length;i++){
    const w = turretToScreen(poly.half[i], mode==='preview' ? previewAngle : 0);
    if(Math.hypot(sx-w.x, sy-w.y) <= HIT_R) return i;
  }
  return -1;
}
function findEdgeHitForTurret(poly, sx, sy){
  const n = poly.half.length;
  if(n<2) return -1;
  const ang = mode==='preview' ? previewAngle : 0;
  for(let i=0;i<n-1;i++){
    const a = turretToScreen(poly.half[i], ang), b = turretToScreen(poly.half[i+1], ang);
    if(distToSegment(sx,sy,a.x,a.y,b.x,b.y) <= EDGE_HIT_R) return i;
  }
  return -1;
}
function findEdgeMidpointHitForTurret(poly, sx, sy){
  const n = poly.half.length;
  if(n<2) return -1;
  const ang = mode==='preview' ? previewAngle : 0;
  for(let i=0;i<n-1;i++){
    const a = turretToScreen(poly.half[i], ang), b = turretToScreen(poly.half[i+1], ang);
    const mx = (a.x+b.x)/2, my = (a.y+b.y)/2;
    if(Math.hypot(sx-mx, sy-my) <= EDGE_HIT_R) return i;
  }
  return -1;
}
function findEdgeHit(poly, center, sx, sy){
  const n = poly.half.length;
  if(n<2) return -1;
  for(let i=0;i<n-1;i++){
    const a = toScreen(center, poly.half[i]), b = toScreen(center, poly.half[i+1]);
    if(distToSegment(sx,sy,a.x,a.y,b.x,b.y) <= EDGE_HIT_R) return i;
  }
  return -1;
}
// Edge-midpoint hit (used to cycle an edge's armor classification front→side→rear).
function findEdgeMidpointHit(poly, center, sx, sy){
  const n = poly.half.length;
  if(n<2) return -1;
  for(let i=0;i<n-1;i++){
    const a = toScreen(center, poly.half[i]), b = toScreen(center, poly.half[i+1]);
    const mx = (a.x+b.x)/2, my = (a.y+b.y)/2;
    if(Math.hypot(sx-mx, sy-my) <= EDGE_HIT_R) return i;
  }
  return -1;
}
// 接缝边（前/后板）命中：mirror(v0)↔v0 为前接缝、v(n-1)↔mirror(v(n-1)) 为后接缝（均为中心线上的
// 竖直段，跨 y=0，与全形闭合边中的接缝段一致）。返回 { seam:'front'|'rear', nearMid:bool } 或 null；
// nearMid = 点击落在接缝中点附近（与内部边一致：中点点击 = 循环切换装甲面，非中点 = 插入顶点）。
// 接缝边参与画布命中（findEdgeHit* 只遍历半形链内部边 i<n-1，接缝恒 miss → 恒追加的根因）。
function findSeamHitAtScreen(part, sx, sy){
  const poly = state[part];
  const n = poly.half.length;
  if(n<2) return null;
  const ang = mode==='preview' ? previewAngle : 0;
  const toS = (part==='turret') ? (pt => turretToScreen(pt, ang)) : (pt => toScreen(hullCenter(), pt));
  const segs = [];
  if(!onCenterline(poly.half[0])){
    const A = toS(mirrorPt(poly.half[0])), B = toS(poly.half[0]);
    segs.push({ seam:'front', ax:A.x, ay:A.y, bx:B.x, by:B.y });
  }
  if(!onCenterline(poly.half[n-1])){
    const A = toS(poly.half[n-1]), B = toS(mirrorPt(poly.half[n-1]));
    segs.push({ seam:'rear', ax:A.x, ay:A.y, bx:B.x, by:B.y });
  }
  for(const s of segs){
    if(distToSegment(sx, sy, s.ax, s.ay, s.bx, s.by) <= EDGE_HIT_R){
      const mx = (s.ax+s.bx)/2, my = (s.ay+s.by)/2;
      return { seam: s.seam, nearMid: Math.hypot(sx-mx, sy-my) <= EDGE_HIT_R };
    }
  }
  return null;
}

// ================= hit testing for cover vertices =================
function findCoverVertexHit(cover, sx, sy){
  if(!cover || !cover.verts) return -1;
  for(let i=0; i<cover.verts.length; i++){
    const [vx, vy] = cover.verts[i];
    if(Math.hypot(sx-vx, sy-vy) <= HIT_R) return i;
  }
  return -1;
}
function findCoverEdgeMidpointHit(cover, sx, sy){
  if(!cover || !cover.verts || cover.verts.length < 2) return -1;
  const verts = cover.verts;
  const n = verts.length;
  // If polygon has >=3 vertices, check closing edge too
  const limit = n >= 3 ? n : n - 1;
  for(let i=0; i<limit; i++){
    const [ax, ay] = verts[i];
    const [bx, by] = verts[(i+1)%n];
    const mx = (ax+bx)/2, my = (ay+by)/2;
    if(Math.hypot(sx-mx, sy-my) <= EDGE_HIT_R) return i;
  }
  return -1;
}

// ================= mouse interaction =================
canvas.addEventListener('mousedown', e=>{
  const {x:sx,y:sy} = getCanvasPos(e);
  // 部件可见性：隐藏的部件不接受任何画布编辑（顶点/边/座圈/新增顶点）
  if((mode==='hull' && !partVisible.hull) || (mode==='turret' && !partVisible.turret)){
    pushHint('该部件已隐藏 — 在「部件可见」中重新显示后再编辑');
    return;
  }
  if(mode==='hull'){
    // 车体模式：先测试是否点击车体上的炮塔座圈圆心 (pivot) 标记
    const hc = hullCenter();
    const ringCenter = {
      x: hc.x + state.turret.pivot.dx * viewScale,
      y: hc.y + (state.turret.pivot.dy || 0) * viewScale
    };
    if(Math.hypot(sx - ringCenter.x, sy - ringCenter.y) <= 16){
      drag = { poly:'hullPivot', moved:false, downX:sx, downY:sy };
      return;
    }
    const poly = state.hull;
    const vi = findVertexHit(poly, hc, sx, sy);
    if(vi>=0){
      drag = { poly:'hull', index:vi, moved:false, downX:sx, downY:sy };
      selectVertex('hull', vi);
      return;
    }
    drag = { poly:'hull', index:-1, moved:false, downX:sx, downY:sy, isNew:true };
  } else if(mode==='turret'){
    // 炮塔模式：测试是否按住”炮塔座圈圆心”十字标记 (axis.dx, 0)
    const ax = (state.turret.axis && state.turret.axis.dx) || 0;
    const axisPos = turretToScreen([ax, 0], 0);
    if(Math.hypot(sx - axisPos.x, sy - axisPos.y) <= 16){
      drag = { poly:'turretAxis', moved:false, downX:sx, downY:sy };
      return;
    }
    const poly = state.turret;
    const vi = findVertexHitForTurret(poly, sx, sy);
    if(vi>=0){
      drag = { poly:'turret', index:vi, moved:false, downX:sx, downY:sy };
      selectVertex('turret', vi);
      return;
    }
    drag = { poly:'turret', index:-1, moved:false, downX:sx, downY:sy, isNew:true };
  } else if(mode==='pivot'){
    drag = { poly:'hullPivot', moved:false, downX:sx, downY:sy };
  } else if(mode==='cover'){
    // 掩体模式：世界坐标顶点编辑
    const cover = state.currentCover;
    const vi = findCoverVertexHit(cover, sx, sy);
    if(vi>=0){
      drag = { poly:'cover', index:vi, moved:false, downX:sx, downY:sy };
      selectCoverVertex(vi);
      return;
    }
    // 点击边中点插入顶点
    const mid = findCoverEdgeMidpointHit(cover, sx, sy);
    if(mid>=0){
      const newPt = [ Math.round(sx*10)/10, Math.round(sy*10)/10 ];
      cover.verts.splice(mid+1, 0, newPt);
      selectCoverVertex(mid+1);
      render();
      return;
    }
    // 点击空白处添加新顶点
    drag = { poly:'cover', index:-1, moved:false, downX:sx, downY:sy, isNew:true };
  }
});
window.addEventListener('mousemove', e=>{
  const {x:sx,y:sy} = getCanvasPos(e);
  updateReadout(sx,sy);
  if(mode==='preview' && !drag){ updatePreviewAim(sx,sy); render(); return; }
  if(!drag){
    // hover highlight: closest editable half-chain edge under the cursor
    // 部件可见性：隐藏部件的边/带不参与 hover 高亮
    if(mode==='hull'){
      if(!partVisible.hull){ if(hoverEdge){ hoverEdge = null; render(); } return; }
      const poly = state.hull;
      const ei = poly.half.length>=2 ? findEdgeHit(poly, hullCenter(), sx, sy) : -1;
      const key = ei>=0 ? 'hull:'+ei : null;
      const cur = hoverEdge ? hoverEdge.poly+':'+hoverEdge.index : null;
      if(key !== cur){ hoverEdge = ei>=0 ? { poly:'hull', index:ei } : null; render(); }
    } else if(mode==='turret'){
      if(!partVisible.turret){ if(hoverEdge){ hoverEdge = null; render(); } return; }
      const poly = state.turret;
      const ei = poly.half.length>=2 ? findEdgeHitForTurret(poly, sx, sy) : -1;
      const key = ei>=0 ? 'turret:'+ei : null;
      const cur = hoverEdge ? hoverEdge.poly+':'+hoverEdge.index : null;
      if(key !== cur){ hoverEdge = ei>=0 ? { poly:'turret', index:ei } : null; render(); }
    return;
  }
  if(Math.hypot(sx-drag.downX, sy-drag.downY) > 3) drag.moved = true;
  if(!drag.moved) return;
  } else if(drag.poly==='hullPivot'){
    // 拖动车体上的炮塔座圈圆心 (pivot)：可修改 dx 和 dy
    const c = hullCenter();
    const [lx, ly] = toLocal(c, sx, sy);
    let dx = lx, dy = ly;
    if(snapToGrid){ dx = Math.round(dx); dy = Math.round(dy); }
    state.turret.pivot.dx = Math.round(dx*10)/10;
    state.turret.pivot.dy = Math.round(dy*10)/10;
    syncArmorInputsFromState();
    render();
  } else if(drag.poly==='turretAxis'){
    // 拖动炮塔上的炮塔座圈圆心 (axis)：纵坐标强制为 0，仅修改横坐标 dx
    const hc = hullCenter();
    const ringX = hc.x + state.turret.pivot.dx * viewScale;
    const axOld = (state.turret.axis && state.turret.axis.dx) || 0;
    const ddx = (sx - drag.downX) / viewScale;
    let newAx = axOld - ddx;
    if(snapToGrid) newAx = Math.round(newAx);
    state.turret.axis.dx = Math.round(newAx*10)/10;
    state.turret.axis.dy = 0; // 纵坐标始终为 0
    drag.downX = sx;
    syncRingInputs();
    render();
  } else if(drag.index>=0){
    if(drag.poly==='hull'){
      let [lx,ly] = toLocal(hullCenter(), sx, sy);
      if(snapToGrid){ lx = Math.round(lx); ly = Math.round(ly); }
      acceptVertex('hull', drag.index, constrainVertex('hull', drag.index, lx, ly));
    } else if(drag.poly==='turret'){
      // 拖动炮塔顶点：用 turretToScreen 的逆算法，反推本地坐标 lx, ly
      const hc = hullCenter();
      const ringX = hc.x + state.turret.pivot.dx * viewScale;
      const ringY = hc.y + (state.turret.pivot.dy||0) * viewScale;
      const ax = (state.turret.axis && state.turret.axis.dx) || 0;
      let lx = (sx - ringX)/viewScale + ax;
      let ly = (sy - ringY)/viewScale;
      if(snapToGrid){ lx = Math.round(lx); ly = Math.round(ly); }
      acceptVertex('turret', drag.index, constrainVertex('turret', drag.index, lx, ly));
    } else if(drag.poly==='cover'){
      // 拖动掩体顶点（世界坐标）
      let wx = sx, wy = sy;
      if(snapToGrid){ wx = Math.round(wx); wy = Math.round(wy); }
      state.currentCover.verts[drag.index] = [Math.round(wx*10)/10, Math.round(wy*10)/10];
      syncSelectedCoverInputs();
    }
    syncSelectedInputs();
  }
  render();
});
window.addEventListener('mouseup', e=>{
  if(!drag) return;
  const {x:sx,y:sy} = getCanvasPos(e);
  if(!drag.moved){
    if(drag.poly==='hullPivot'){
      const c = hullCenter();
      const [lx, ly] = toLocal(c, sx, sy);
      state.turret.pivot.dx = Math.round(lx);
      state.turret.pivot.dy = Math.round(ly);
      syncRingInputs();
    } else if(drag.poly==='turretAxis'){
      pushHint('拖拽“炮塔座圈圆心”标记可调整旋转轴在炮塔上的横坐标 (axis.dx, y 轴锁死 0)');
    } else if(drag.index>=0){
      selectVertex(drag.poly, drag.index);
    } else if(drag.isNew){
      const poly = state[drag.poly];
      const snapH = poly.half.slice(), snapF = poly.halfFaces.slice();
      if(drag.poly==='hull'){
        const center = hullCenter();
        const mid = poly.half.length>=2 ? findEdgeMidpointHit(poly, center, sx, sy) : -1;
        if(mid>=0){
          const nxt = nextFace(getFace(poly.halfFaces, mid));
          setFace(poly.halfFaces, mid, nxt);
          selectedEdge = { poly: 'hull', index: mid };
          pushHint(`车体边 #${mid} 装甲 → ${nxt}`);
        } else {
          const ei = poly.half.length>=2 ? findEdgeHit(poly, center, sx, sy) : -1;
          // 接缝边（前/后板）命中：跨中心线，须先于 y≤0 检查（点击其 y>0 半段同样有效）
          const sh = findSeamHitAtScreen('hull', sx, sy);
          let [lx,ly] = toLocal(center, sx, sy);
          if(snapToGrid){ lx = Math.round(lx); ly = Math.round(ly); }
          if(sh){
            if(sh.nearMid){
              // 接缝中点 → 循环切换接缝装甲面（与内部边行为一致）
              const nxt = nextFace(sh.seam==='front' ? poly.frontSeamFace : poly.rearSeamFace);
              if(sh.seam==='front') poly.frontSeamFace = nxt; else poly.rearSeamFace = nxt;
              selectedEdge = { poly: 'hull', seam: sh.seam };
              pushHint(`车体接缝(${sh.seam==='front'?'前':'后'}) 装甲 → ${nxt}`);
            } else {
              // 插入顶点：新边继承接缝装甲面；y 取镜像（点击接缝 y>0 半段 → 顶点落在镜像侧对应位置）
              const newPt = [ Math.round(lx*10)/10, Math.round(-Math.abs(ly)*10)/10 ];
              if(sh.seam==='front'){
                // 前接缝 → 链头插入：新边 v(new)→v(旧0) 继承 frontSeamFace，新前接缝保持原面
                poly.half.splice(0, 0, newPt);
                poly.halfFaces.splice(0, 0, poly.frontSeamFace);
                selectVertex('hull', 0);
              } else {
                // 后接缝 → 链尾追加：新边继承 rearSeamFace，新后接缝保持原面
                poly.half.push(newPt);
                poly.halfFaces.push(poly.rearSeamFace);
                selectVertex('hull', poly.half.length-1);
              }
            }
          } else if(ly > 2/viewScale){
            pushHint('请在中心线一侧 (y ≤ 0) 绘制，另一侧会自动镜像生成');
          } else if(ei>=0){
            const newPt = [ Math.round(lx*10)/10, Math.round(Math.min(0,ly)*10)/10 ];
            poly.half.splice(ei+1, 0, newPt);
            poly.halfFaces.splice(ei, 0, getFace(poly.halfFaces, ei));
            selectVertex('hull', ei+1);
          } else {
            const newPt = [ Math.round(lx*10)/10, Math.round(Math.min(0,ly)*10)/10 ];
            poly.half.push(newPt);
            poly.halfFaces.push('side'); // 空白追加：新边按侧装甲计（保证 halfFaces = half.length-1）
            selectVertex('hull', poly.half.length-1);
          }
        }
      } else if(drag.poly==='turret'){
        const hc = hullCenter();
        const ringX = hc.x + state.turret.pivot.dx * viewScale;
        const ringY = hc.y + (state.turret.pivot.dy||0) * viewScale;
        const ax = (state.turret.axis && state.turret.axis.dx) || 0;
        const mid = poly.half.length>=2 ? findEdgeMidpointHitForTurret(poly, sx, sy) : -1;
        if(mid>=0){
          const nxt = nextFace(getFace(poly.halfFaces, mid));
          setFace(poly.halfFaces, mid, nxt);
          selectedEdge = { poly: 'turret', index: mid };
          pushHint(`炮塔边 #${mid} 装甲 → ${nxt}`);
        } else {
          const ei = poly.half.length>=2 ? findEdgeHitForTurret(poly, sx, sy) : -1;
          // 接缝边（前/后板）命中：跨中心线，须先于 y≤0 检查（点击其 y>0 半段同样有效）
          const sh = findSeamHitAtScreen('turret', sx, sy);
          let lx = (sx - ringX)/viewScale + ax;
          let ly = (sy - ringY)/viewScale;
          if(snapToGrid){ lx = Math.round(lx); ly = Math.round(ly); }
          if(sh){
            if(sh.nearMid){
              // 接缝中点 → 循环切换接缝装甲面（与内部边行为一致）
              const nxt = nextFace(sh.seam==='front' ? poly.frontSeamFace : poly.rearSeamFace);
              if(sh.seam==='front') poly.frontSeamFace = nxt; else poly.rearSeamFace = nxt;
              selectedEdge = { poly: 'turret', seam: sh.seam };
              pushHint(`炮塔接缝(${sh.seam==='front'?'前':'后'}) 装甲 → ${nxt}`);
            } else {
              // 插入顶点：新边继承接缝装甲面；y 取镜像（点击接缝 y>0 半段 → 顶点落在镜像侧对应位置）
              const newPt = [ Math.round(lx*10)/10, Math.round(-Math.abs(ly)*10)/10 ];
              if(sh.seam==='front'){
                // 前接缝 → 链头插入：新边 v(new)→v(旧0) 继承 frontSeamFace，新前接缝保持原面
                poly.half.splice(0, 0, newPt);
                poly.halfFaces.splice(0, 0, poly.frontSeamFace);
                selectVertex('turret', 0);
              } else {
                // 后接缝 → 链尾追加：新边继承 rearSeamFace，新后接缝保持原面
                poly.half.push(newPt);
                poly.halfFaces.push(poly.rearSeamFace);
                selectVertex('turret', poly.half.length-1);
              }
            }
          } else if(ly > 2/viewScale){
            pushHint('请在中心线一侧 (y ≤ 0) 绘制，另一侧会自动镜像生成');
          } else if(ei>=0){
            const newPt = [ Math.round(lx*10)/10, Math.round(Math.min(0,ly)*10)/10 ];
            poly.half.splice(ei+1, 0, newPt);
            poly.halfFaces.splice(ei, 0, getFace(poly.halfFaces, ei));
            selectVertex('turret', ei+1);
          } else {
            const newPt = [ Math.round(lx*10)/10, Math.round(Math.min(0,ly)*10)/10 ];
            poly.half.push(newPt);
            poly.halfFaces.push('side'); // 空白追加：新边按侧装甲计（保证 halfFaces = half.length-1）
            selectVertex('turret', poly.half.length-1);
          }
        }
      } else if(drag.poly==='cover'){
        // 掩体空白增加顶点
        const cover = state.currentCover;
        let wx = sx, wy = sy;
        if(snapToGrid){ wx = Math.round(wx); wy = Math.round(wy); }
        const newPt = [ Math.round(wx*10)/10, Math.round(wy*10)/10 ];
        cover.verts.push(newPt);
        selectCoverVertex(cover.verts.length-1);
        pushHint(`掩体添加顶点 #${cover.verts.length-1}`);
      }
      // P-49 重量闸门：新增顶点使派生重量突破 80t 上限 → 撤销本次新增（仅针对坦克部件）
      if(drag.poly !== 'cover' && derivedWeightT() > RULES.parameterLimits.weight.max + 1e-9){
        state[drag.poly].half = snapH; state[drag.poly].halfFaces = snapF;
        clearSelection();
        pushHint('已达 80t 设计上限 — 新增顶点会继续增加派生重量，已撤销', 3000);
      }
    }
  }
  drag = null;
  render();
  renderEdgeLists();
});
canvas.addEventListener('wheel', e=>{
  e.preventDefault();
  const factor = e.deltaY < 0 ? 1.1 : 1/1.1;
  viewScale = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, viewScale*factor));
  updateZoomReadout();
  render();
}, { passive:false });

function updatePreviewAim(sx,sy){
  const tc = turretCenter();
  let ang = Math.atan2(sy-tc.y, sx-tc.x);
  // 射界限制：仅当射界 < 180° 时炮塔受限于车体中线左右 ±射界；180° 表示 360° 全向旋转
  if(state.traverseLimit < 180){
    const limit = state.traverseLimit * Math.PI/180;
    let rel = Math.atan2(Math.sin(ang), Math.cos(ang));
    rel = Math.max(-limit, Math.min(limit, rel));
    ang = rel;
  }
  previewAngle = ang;
}

let hintTimer=null;
function pushHint(msg, ms){
  const el = document.getElementById('hint');
  const base = el.dataset.base || '';
  el.textContent = msg;
  clearTimeout(hintTimer);
  hintTimer = setTimeout(()=>{ el.textContent = base; }, ms || 1600);
}
function updateReadout(sx,sy){
  const el = document.getElementById('coordReadout');
  const center = mode==='turret' ? turretCenter() : hullCenter();
  const [lx,ly] = toLocal(center, sx, sy);
  el.textContent = `局部坐标 (${mode==='pivot'?'相对车体中心':mode}): ${lx.toFixed(1)}, ${ly.toFixed(1)}`;
}
function updateZoomReadout(){ document.getElementById('zoomReadout').textContent = `缩放: ${Math.round(viewScale*100)}%`; }

// ================= selected-vertex numeric editor =================
function selectCoverVertex(index){
  selectedCoverVertex = { index };
  selected = null; // Clear tank vertex selection
  syncSelectedCoverInputs();
}
function syncSelectedCoverInputs(){
  const xEl = document.getElementById('c-x'), yEl = document.getElementById('c-y');
  if(!selectedCoverVertex || !state.currentCover.verts[selectedCoverVertex.index]) return;
  const p = state.currentCover.verts[selectedCoverVertex.index];
  xEl.value = Math.round(p[0]);
  yEl.value = Math.round(p[1]);
}
function selectVertex(poly, index){
  selected = { poly, index };
  selectedCoverVertex = null; // Clear cover vertex selection
  syncSelectedInputs();
}
function clearSelection(){
  selected = null;
  selectedCoverVertex = null;
  syncSelectedInputs();
}
function syncSelectedInputs(){
  const xEl = document.getElementById('v-x'), yEl = document.getElementById('v-y');
  const delBtn = document.getElementById('deleteVertBtn');
  const info = document.getElementById('selInfo');
  if(!selected || !state[selected.poly] || !state[selected.poly].half[selected.index]){
    selected = null;
    xEl.disabled = true; yEl.disabled = true; delBtn.disabled = true;
    xEl.value=''; yEl.value='';
    info.innerHTML = '未选中顶点 — 点击画布上一个顶点即可选中并精确编辑坐标';
    return;
  }
  const p = state[selected.poly].half[selected.index];
  xEl.disabled = false; yEl.disabled = false; delBtn.disabled = false;
  xEl.value = p[0]; yEl.value = p[1];
  info.innerHTML = `已选中：<b>${selected.poly==='hull'?'车体':'炮塔'}</b> 顶点 #${selected.index}`;
}
document.getElementById('v-x').addEventListener('input', ()=>{
  if(!selected) return;
  const v = parseFloat(document.getElementById('v-x').value);
  if(Number.isNaN(v)) return;
  const px_ = selected.poly, ix_ = selected.index;
  if(!acceptVertex(px_, ix_, constrainVertex(px_, ix_, v, state[px_].half[ix_][1]))) syncSelectedInputs();
  render();
});
document.getElementById('v-y').addEventListener('input', ()=>{
  if(!selected) return;
  let v = parseFloat(document.getElementById('v-y').value);
  if(Number.isNaN(v)) return;
  if(v>0){ v=0; document.getElementById('v-y').value = 0; pushHint('Y 已钳制为 0（不能越过中心线到镜像侧）'); }
  const py_ = selected.poly, iy_ = selected.index;
  if(!acceptVertex(py_, iy_, constrainVertex(py_, iy_, state[py_].half[iy_][0], v))) syncSelectedInputs();
  render();
});
function deleteSelectedVertex(){
  if(!selected) return;
  const poly = state[selected.poly];
  if(poly.half.length<=2){ pushHint('每侧至少保留 2 个顶点'); return; }
  poly.half.splice(selected.index,1);
  // halfFaces has length half.length-1 (one entry per internal edge); drop the entry that most
  // directly corresponded to the deleted vertex, if one exists. Any resulting misalignment is
  // harmless — getFace() falls back to 'side' and the sidebar edge list lets the user re-check
  // classifications immediately after a deletion.
  if(selected.index < poly.halfFaces.length) poly.halfFaces.splice(selected.index,1);
  else if(poly.halfFaces.length>0) poly.halfFaces.pop();
  clearSelection();
  render(); renderEdgeLists();
}
function deleteSelectedCoverVertex(){
  if(!selectedCoverVertex) return;
  const cover = state.currentCover;
  if(cover.verts.length<=2){ pushHint('掩体至少保留 2 个顶点'); return; }
  cover.verts.splice(selectedCoverVertex.index,1);
  selectedCoverVertex = null;
  render();
}
document.getElementById('deleteVertBtn').addEventListener('click', deleteSelectedVertex);
// keyboard: Delete/Backspace removes the selected vertex; arrows nudge it 1px; Esc clears selection
window.addEventListener('keydown', e=>{
  if(e.key === 'Escape'){
    clearSelection(); selectedEdge = null;
    render(); renderEdgeLists();
    return;
  }
  if(selected){
    if(e.key==='Delete' || e.key==='Backspace'){
      e.preventDefault(); deleteSelectedVertex(); return;
    }
    const step = snapToGrid ? 1 : 0.5;
    let dx=0, dy=0;
    if(e.key==='ArrowLeft') dx = -step;
    else if(e.key==='ArrowRight') dx = step;
    else if(e.key==='ArrowUp') dy = -step;
    else if(e.key==='ArrowDown') dy = step;
    if(dx || dy){
      e.preventDefault();
      const p = state[selected.poly].half[selected.index];
      acceptVertex(selected.poly, selected.index, constrainVertex(selected.poly, selected.index, p[0]+dx, p[1]+dy));
      syncSelectedInputs(); render();
    }
  }
  if(selectedCoverVertex){
    if(e.key==='Delete' || e.key==='Backspace'){
      e.preventDefault(); deleteSelectedCoverVertex(); return;
    }
    const step = snapToGrid ? 1 : 0.5;
    let dx=0, dy=0;
    if(e.key==='ArrowLeft') dx = -step;
    else if(e.key==='ArrowRight') dx = step;
    else if(e.key==='ArrowUp') dy = -step;
    else if(e.key==='ArrowDown') dy = step;
    if(dx || dy){
      e.preventDefault();
      const idx = selectedCoverVertex.index;
      const p = state.currentCover.verts[idx];
      const wx = Math.round((p[0]+dx)*10)/10;
      const wy = Math.round((p[1]+dy)*10)/10;
      state.currentCover.verts[idx] = [wx, wy];
      syncSelectedCoverInputs(); render();
    }
  }
});
document.getElementById('copyCoverJsonBtn').addEventListener('click', ()=>{
  const cover = state.currentCover;
  const tier = document.getElementById('c-tier').value;
  const jsonStr = JSON.stringify({
    tier: tier,
    verts: cover.verts
  }, null, 2);
  navigator.clipboard.writeText(jsonStr).then(()=>{
    pushHint('已将掩体 JSON 复制到剪贴板！', 2500);
  }).catch(err => {
    prompt('请复制掩体 JSON:', jsonStr);
  });
});
document.getElementById('c-tier').addEventListener('change', (e)=>{
  state.currentCover.tier = e.target.value;
  render();
});

// ================= mode switching（编辑列表驱动：editTab 控制面板显隐，mode 控制画布） =================
const HINTS = {
  hull: '点击空白添加车体顶点（仅限 y≤0 一侧）· 拖动顶点移动 · 点击”车体座圈圆心”标记或在侧栏编辑 pivot (X,Y) 可调整座圈在车体上的相对安装位置',
  turret: '点击空白添加炮塔顶点（仅限 y≤0 一侧）· 拖动顶点移动 · 点击”炮塔座圈圆心”标记或在侧栏编辑 axis.dx 可调整座圈在炮塔中的相对横坐标（y 轴固定为 0）· 炮管及附件锚定在前缘装甲交点',
  preview: '移动鼠标预览炮塔瞄准方向；射界 = 180° 时炮塔 360° 全向旋转，低于 180° 时将受限在 ±射界 内',
  appearance: '外观件编辑：炮管预设（长度/粗细/制退器/抽烟器/护套）、炮盾、履带外观均为整车外观参数；画布处于预览模式，移动鼠标可旋转炮塔查看效果',
  cover: '掩体顶点编辑：点击空白添加顶点（世界坐标）· 拖动顶点移动 · 点击边中点插入顶点 · Delete/Backspace 删除选中顶点 · 选择”掩体种类”设置类型'
};
// 面板显隐：panel-<tab> 类命中当前 editTab 的面板显示，其余隐藏；顶点编辑按钮仅在车体/炮塔/掩体条目可用
function updatePanelVisibility(){
  document.querySelectorAll('.panel-hull, .panel-turret, .panel-appearance, .panel-cover').forEach(el=>{
    el.style.display = el.classList.contains('panel-'+editTab) ? '' : 'none';
  });
  const vertEdit = (editTab==='hull' || editTab==='turret' || editTab==='cover');
  document.getElementById('undoVertBtn').disabled = !vertEdit;
  document.getElementById('clearPolyBtn').disabled = !vertEdit;
}
// 列表条目高亮 = editTab；「预览瞄准」为独立视图辅助（高亮由 mode==='preview' 决定，不影响条目状态）
function updateModeButtons(){
  document.querySelectorAll('.edit-tab-btn').forEach(b=>b.classList.remove('active'));
  const tabBtn = document.getElementById('mode'+editTab[0].toUpperCase()+editTab.slice(1));
  if(tabBtn) tabBtn.classList.add('active');
  document.getElementById('modePreview').classList.toggle('active', mode==='preview');
}
function setMode(m){
  mode = m;
  clearSelection();
  selectedCoverVertex = null;
  hoverEdge = null;
  // 列表条目 ↔ 画布模式同步：hull/turret/modules/cover 条目直接切换对应编辑模式；preview 不改变条目
  if(m==='hull' || m==='turret' || m==='modules' || m==='cover') editTab = m;
  updateModeButtons();
  const hintEl = document.getElementById('hint');
  hintEl.textContent = HINTS[m] || '';
  hintEl.dataset.base = hintEl.textContent;
  updatePanelVisibility();
  render();
}
document.getElementById('modeHull').addEventListener('click', ()=>setMode('hull'));
document.getElementById('modeTurret').addEventListener('click', ()=>setMode('turret'));
document.getElementById('modeCover').addEventListener('click', ()=>setMode('cover'));
document.getElementById('modeAppearance').addEventListener('click', ()=>{
  // 外观件条目：面板切到外观件组，画布进入预览模式（无顶点编辑目标，便于查看炮管/炮盾/履带效果）
  editTab = 'appearance';
  mode = 'preview';
  clearSelection();
  hoverEdge = null;
  updateModeButtons();
  const hintEl = document.getElementById('hint');
  hintEl.textContent = HINTS.appearance;
  hintEl.dataset.base = HINTS.appearance;
  updatePanelVisibility();
  render();
});
document.getElementById('modePreview').addEventListener('click', ()=>setMode('preview'));

// ================= 部件可见性（纯编辑辅助，不写入导出/JSON） =================
function setPartVisible(part, vis){
  partVisible[part] = vis;
  document.getElementById('partVis' + (part==='hull' ? 'Hull' : 'Turret') + 'Btn').classList.toggle('active', vis);
  // 隐藏当前编辑目标部件 → 切到模块条目（防止画布交互落空）；另一侧仍可正常挂载/选择/拖拽
  if(!vis){
    pushHint((part==='hull' ? '车体' : '炮塔') + '已隐藏 — 不渲染、不参与命中；点击「部件可见」重新显示', 2200);
  }
  render();
}
document.getElementById('partVisHullBtn').addEventListener('click', ()=>{
  // 至少保留一个部件可见（避免画布完全空白）
  if(partVisible.hull && !partVisible.turret){ pushHint('至少保留一个部件可见'); return; }
  setPartVisible('hull', !partVisible.hull);
});
document.getElementById('partVisTurretBtn').addEventListener('click', ()=>{
  if(partVisible.turret && !partVisible.hull){ pushHint('至少保留一个部件可见'); return; }
  setPartVisible('turret', !partVisible.turret);
});

// ================= zoom controls =================
document.getElementById('zoomInBtn').addEventListener('click', ()=>{ viewScale=Math.min(ZOOM_MAX,viewScale*1.2); updateZoomReadout(); render(); });
document.getElementById('zoomOutBtn').addEventListener('click', ()=>{ viewScale=Math.max(ZOOM_MIN,viewScale/1.2); updateZoomReadout(); render(); });
document.getElementById('zoomResetBtn').addEventListener('click', ()=>{ viewScale=1; updateZoomReadout(); render(); });

// ================= vertex/polygon bulk ops =================
document.getElementById('undoVertBtn').addEventListener('click', ()=>{
  // 编辑列表驱动后：撤销目标 = 当前条目（车体/炮塔）；其余条目下按钮已禁用
  const target = (editTab==='hull'||editTab==='turret') ? editTab : 'hull';
  const poly = state[target];
  if(poly.half.length<=2){ pushHint('每侧至少保留 2 个顶点'); return; }
  poly.half.pop(); poly.halfFaces.pop();
  clearSelection();
  render(); renderEdgeLists();
});
document.getElementById('clearPolyBtn').addEventListener('click', ()=>{
  const target = (editTab==='hull'||editTab==='turret') ? editTab : 'hull';
  if(!confirm(`清空当前「${target==='hull'?'车体':'炮塔'}」多边形，重新绘制？`)) return;
  state[target].half = [];
  state[target].halfFaces = [];
  clearSelection();
  render(); renderEdgeLists();
});
document.getElementById('resetDefaultBtn').addEventListener('click', ()=>{
  if(!confirm('重置车体与炮塔为默认形状？（会丢失当前编辑内容）')) return;
  state.hull = defaultHull();
  state.turret = defaultTurret();
  clearSelection();
  syncArmorInputsFromState();
  render(); renderEdgeLists();
});
// ----------------- turret own center vs rotation axis (issue #1 fix) -----------------
// 炮塔自身旋转中心（本地帧内的轴点，=多边型原点）与"炮塔自身几何中心（包围盒中心）"是两个
// 独立概念；后者偏离轴点时，旋转会让炮塔甩尾。该工具把两者对齐（平移多边形），并提供实时
// 偏离读数与画布标记，避免手写数据把旋转中心带偏到炮塔尾部。
function turretOwnCenter(){
  const full = buildFullVerts(state.turret.half);
  if(full.length < 2) return { cx:0, cy:0 };
  let minX=Infinity, maxX=-Infinity, minY=Infinity, maxY=-Infinity;
  for(const [vx,vy] of full){
    if(vx<minX)minX=vx; if(vx>maxX)maxX=vx; if(vy<minY)minY=vy; if(vy>maxY)maxY=vy;
  }
  return { cx:(minX+maxX)/2, cy:(minY+maxY)/2, minX, maxX, minY, maxY };
}
function updateAxisDevReadout(){
  const el = document.getElementById('axisDevReadout');
  if(!el) return;
  const { cx, cy } = turretOwnCenter();
  // 甩尾距离 = 炮塔自身中心 (bbox 中心) 与炮塔自身旋转中心 (axis) 的距离
  const dev = Math.hypot((state.turret.axis.dx||0) - cx, (state.turret.axis.dy||0) - cy);
  el.textContent = dev.toFixed(1);
}
function syncRingInputs(){
  const pdxEl = document.getElementById('t-pivotDx');
  const pdyEl = document.getElementById('t-pivotDy');
  const adxEl = document.getElementById('t-axisDx');
  const adyEl = document.getElementById('t-axisDy');
  if(pdxEl) pdxEl.value = (state.turret.pivot && state.turret.pivot.dx) || 0;
  if(pdyEl) pdyEl.value = (state.turret.pivot && state.turret.pivot.dy) || 0;
  if(adxEl) adxEl.value = (state.turret.axis && state.turret.axis.dx) || 0;
  if(adyEl){ adyEl.value = 0; adyEl.disabled = true; }
}

['t-pivotDx', 't-pivotDy'].forEach(id => {
  const el = document.getElementById(id);
  if(!el) return;
  el.addEventListener('input', () => {
    const v = parseFloat(el.value);
    if(Number.isNaN(v)) return;
    if(!state.turret.pivot) state.turret.pivot = { dx:0, dy:0 };
    if(id === 't-pivotDx') state.turret.pivot.dx = v;
    else state.turret.pivot.dy = v;
    render();
  });
});

const adxEl = document.getElementById('t-axisDx');
if(adxEl){
  adxEl.addEventListener('input', () => {
    const v = parseFloat(adxEl.value);
    if(Number.isNaN(v)) return;
    if(!state.turret.axis) state.turret.axis = { dx:0, dy:0 };
    state.turret.axis.dx = v;
    state.turret.axis.dy = 0;
    render();
  });
}

function syncArmorInputsFromState(){
  document.getElementById('a-hull-front').value = state.hull.armor.front;
  document.getElementById('a-hull-side').value = state.hull.armor.side;
  document.getElementById('a-hull-rear').value = state.hull.armor.rear;
  document.getElementById('a-turret-front').value = state.turret.armor.front;
  document.getElementById('a-turret-side').value = state.turret.armor.side;
  document.getElementById('a-turret-rear').value = state.turret.armor.rear;
  syncRingInputs();
}
// P-49 装甲输入：逐输入框独立更新（不再整组回读），先按 parameterLimits 钳制，
// 再过 80t 派生重量闸门——厚度只允许加到临界值（二分求解），超限提示「已达 80t 设计上限」。
const ARMOR_INPUT_MAP = {
  'a-hull-front':   ['hull','front','车体正面'],
  'a-hull-side':    ['hull','side','车体侧面'],
  'a-hull-rear':    ['hull','rear','车体后部'],
  'a-turret-front': ['turret','front','炮塔正面'],
  'a-turret-side':  ['turret','side','炮塔侧面'],
  'a-turret-rear':  ['turret','rear','炮塔后部']
};
Object.keys(ARMOR_INPUT_MAP).forEach(id=>{
  const [part, face, label] = ARMOR_INPUT_MAP[id];
  document.getElementById(id).addEventListener('input', ()=>{
    const el = document.getElementById(id);
    const v = parseFloat(el.value);
    if(Number.isNaN(v)){ updateArmorSelReadout(); return; }
    const lim = RULES.parameterLimits.armor[part][face];
    let c = limClamp(v, lim);
    if(c !== v) pushHint(label+'='+v+'mm 超出参数极限，已钳制到 ['+lim.min+', '+lim.max+']mm', 2600);
    const tMax = Math.floor(maxArmorThicknessAtWeightCap(part, face)*10)/10;
    if(c > tMax){
      c = tMax;
      pushHint('已达 80t 设计上限 — '+label+' 只能设到 '+tMax+'mm', 3000);
    }
    state[part].armor[face] = c;
    el.value = c;
    updateArmorSelReadout(); updateWeightReadout();
  });
});

// ================= barrel preset =================
function applyBarrelPreset(key){
   const p = BARREL_PRESETS[key];
   if(!p) return;
   state.barrel = { len:p.len, width:p.width, muzzle:p.muzzle,
     evac:{ style:p.evac.style, pos:p.evac.pos },
     jacket:{ len:p.jacket.len, pos:p.jacket.pos },
     mantlet: state.barrel.mantlet || { style:'none', pos:0, width:40 } };
   document.getElementById('barrelLen').value = p.len;
   document.getElementById('barrelWidth').value = p.width;
   document.getElementById('barrelMuzzle').value = p.muzzle;
   document.getElementById('barrelEvacStyle').value = p.evac.style;
   document.getElementById('barrelEvac').value = p.evac.pos;
   document.getElementById('jacketLen').value = p.jacket.len;
   document.getElementById('jacketPos').value = p.jacket.pos;
   render();
}
document.getElementById('barrelPreset').addEventListener('change', ()=>{
   applyBarrelPreset(document.getElementById('barrelPreset').value);
});
['barrelLen','barrelWidth'].forEach(id=>{
   document.getElementById(id).addEventListener('input', ()=>{
      state.barrel.len = parseFloat(document.getElementById('barrelLen').value)||120;
      state.barrel.width = parseFloat(document.getElementById('barrelWidth').value)||18;
      render();
   });
});
['jacketLen','jacketPos'].forEach(id=>{
   document.getElementById(id).addEventListener('input', ()=>{
      state.barrel.jacket.len = parseFloat(document.getElementById('jacketLen').value)||0;
      state.barrel.jacket.pos = parseFloat(document.getElementById('jacketPos').value)||45;
      render();
   });
});
document.getElementById('barrelEvac').addEventListener('input', ()=>{
   state.barrel.evac.pos = parseFloat(document.getElementById('barrelEvac').value)||30;
   render();
});
document.getElementById('barrelEvacStyle').addEventListener('change', ()=>{
   state.barrel.evac.style = document.getElementById('barrelEvacStyle').value;
   render();
});
function updateTrackRanges(){
  const w = parseFloat(document.getElementById('trackWidthInput').value)||8;
  const oEl = document.getElementById('trackOffsetInput');
  oEl.min = -w; oEl.max = w/2;
  state.trackWidth = w;
  state.trackOffset = Math.max(oEl.min, Math.min(oEl.max, parseFloat(oEl.value)||0));
  oEl.value = state.trackOffset;
  render();
}
['trackWidthInput'].forEach(id=>{
  document.getElementById(id).addEventListener('input', updateTrackRanges);
});
document.getElementById('trackOffsetInput').addEventListener('input', ()=>{
  const oEl = document.getElementById('trackOffsetInput');
  const w = parseFloat(document.getElementById('trackWidthInput').value)||8;
  oEl.min = -w; oEl.max = w/2;
  const v = Math.max(oEl.min, Math.min(oEl.max, parseFloat(oEl.value)||0));
  oEl.value = v;
  state.trackOffset = v;
  render();
});
document.getElementById('textureSelect').addEventListener('change', ()=>{
  state.texture = document.getElementById('textureSelect').value;
  render();
});

// ================= 整车精灵 Sprite（对齐控件） =================
function defaultSprite(){
  return {
    enabled: false,
    track:  { img:'assets/tanks/track-links.png', scale:0, dx:0, dy:0 },
    hull:   { img:'', scale:0, dx:0, dy:0, rot:0 },
    turret: { img:'', scale:0, dx:0, dy:0, rot:0, pivot:[0,0] },
    barrel: { mountDx:0, mountDy:0, embed:2, scaleMult:1, gap:3.7,
              imgStandard:'assets/tanks/barrels/barrel-standard.png',
              imgAutocannon:'assets/tanks/barrels/barrel-autocannon.png',
              imgRailgun:'assets/tanks/barrels/barrel-railgun.png' }
  };
}
// #L3：normalizeSprite* 必须**保留未知键**。此前只回填固定键并在 buildExport 只写固定键，
// 导致设计器「读取→保存」把 tanks/*.json 里的额外字段（imgHummel/imgPanzerIV/lenPxPanzerIV、
// hull.pivot、track.rot）永久删除。现在先浅拷贝原始对象，再覆盖已知键。
function normalizeSpritePart(p){
  p = p || {};
  const out = Object.assign({}, p);
  out.img = p.img || '';
  out.scale = +p.scale || 0;
  out.dx = +p.dx || 0;
  out.dy = +p.dy || 0;
  out.rot = +p.rot || 0;
  if(p.pivot) out.pivot = [+p.pivot[0] || 0, +p.pivot[1] || 0];
  return out;
}
function normalizeSpriteBarrel(p){
  p = p || {};
  const out = Object.assign({}, p);
  out.mountDx = +p.mountDx || 0;
  out.mountDy = +p.mountDy || 0;
  out.embed = (p.embed !== undefined && p.embed !== null && p.embed !== '') ? +p.embed : 2;
  out.scaleMult = +p.scaleMult || 1;
  out.gap = +p.gap || 3.7;
  out.imgStandard = p.imgStandard || 'assets/tanks/barrels/barrel-standard.png';
  out.imgAutocannon = p.imgAutocannon || 'assets/tanks/barrels/barrel-autocannon.png';
  out.imgRailgun = p.imgRailgun || 'assets/tanks/barrels/barrel-railgun.png';
  return out;
}
function normalizeSprite(data){
  data = data || {};
  const sp = defaultSprite();
  sp.enabled = !!data.enabled;
  sp.track = Object.assign(sp.track, normalizeSpritePart(data.track));
  if(!sp.track.img) sp.track.img = 'assets/tanks/track-links.png';
  sp.hull = Object.assign(sp.hull, normalizeSpritePart(data.hull));
  sp.turret = Object.assign(sp.turret, normalizeSpritePart(data.turret));
  sp.barrel = Object.assign(sp.barrel, normalizeSpriteBarrel(data.barrel));
  return sp;
}
function syncSpriteInputs(){
  const sp = state.sprite;
  document.getElementById('sp-enabled').checked = !!sp.enabled;
  document.getElementById('sp-preview').checked = !!state.spritePreview;
  document.getElementById('sp-track-img').textContent = sp.track.img || '—';
  document.getElementById('sp-track-scale').value = sp.track.scale || 0;
  document.getElementById('sp-track-dx').value = sp.track.dx || 0;
  document.getElementById('sp-track-dy').value = sp.track.dy || 0;
  document.getElementById('sp-hull-img').textContent = sp.hull.img || '—';
  document.getElementById('sp-hull-scale').value = sp.hull.scale || 0;
  document.getElementById('sp-hull-dx').value = sp.hull.dx || 0;
  document.getElementById('sp-hull-dy').value = sp.hull.dy || 0;
  document.getElementById('sp-hull-rot').value = sp.hull.rot || 0;
  document.getElementById('sp-turret-img').textContent = sp.turret.img || '—';
  document.getElementById('sp-turret-scale').value = sp.turret.scale || 0;
  document.getElementById('sp-turret-dx').value = sp.turret.dx || 0;
  document.getElementById('sp-turret-dy').value = sp.turret.dy || 0;
  document.getElementById('sp-turret-rot').value = sp.turret.rot || 0;
  document.getElementById('sp-turret-pivotx').value = (sp.turret.pivot && sp.turret.pivot[0]) || 0;
  document.getElementById('sp-turret-pivoty').value = (sp.turret.pivot && sp.turret.pivot[1]) || 0;
  document.getElementById('sp-barrel-mountdx').value = sp.barrel.mountDx || 0;
  document.getElementById('sp-barrel-mountdy').value = sp.barrel.mountDy || 0;
  document.getElementById('sp-barrel-embed').value = sp.barrel.embed;
  document.getElementById('sp-barrel-scalemult').value = sp.barrel.scaleMult || 1;
  document.getElementById('sp-barrel-gap').value = sp.barrel.gap || 3.7;
  document.getElementById('sp-barrel-imgstd').textContent = sp.barrel.imgStandard || '—';
  document.getElementById('sp-barrel-imgveh').textContent = sp.barrel.imgVehicle || '—';
  document.getElementById('sp-barrel-imgac').textContent = sp.barrel.imgAutocannon || '—';
  document.getElementById('sp-barrel-imgrg').textContent = sp.barrel.imgRailgun || '—';
  document.getElementById('sp-barrel-imgstd-in').value = sp.barrel.imgStandard || '';
  document.getElementById('sp-barrel-imgveh-in').value = sp.barrel.imgVehicle || '';
  document.getElementById('sp-barrel-imgac-in').value = sp.barrel.imgAutocannon || '';
  document.getElementById('sp-barrel-imgrg-in').value = sp.barrel.imgRailgun || '';
}
function spriteAutoAlign(){
  // 按车体/炮塔多边形包围盒长度重算缩放，清零位移与旋转（轴心保留）；
  // 履带缩放默认 = 履带宽/图片高；炮管安装点 = 炮塔前缘 + 嵌入深度（axis 归零帧）。
  const sp = state.sprite;
  for(const [part, poly] of [['hull', state.hull], ['turret', state.turret]]){
    const v = buildFullVerts(poly.half);
    if(v.length < 3 || !sp[part].img) continue;
    const img = spriteImage(sp[part].img);
    if(!img || !img.naturalWidth) continue;
    let minX=Infinity, maxX=-Infinity;
    for(const p of v){ minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); }
    sp[part].scale = +(((maxX - minX) / img.naturalWidth).toFixed(5));
    sp[part].dx = 0; sp[part].dy = 0; sp[part].rot = 0;
  }
  // 履带：图片高度对应履带宽
  {
    const img = spriteImage(sp.track.img);
    if(img && img.naturalHeight) sp.track.scale = +(((state.trackWidth || 8) / img.naturalHeight).toFixed(5));
    sp.track.dx = 0; sp.track.dy = 0;
  }
  // 炮管：安装点 = 炮塔前缘（与运行时 turretFrontDist/gunRoot 同源，口径见
  // js/tank_geometry.js frontDistFromVerts）。#L2：此前用**未减 axis** 的原始顶点 maxX×0.8，
  // 而运行时的「炮塔前缘」定义在 **axis 归零后**的局部帧上——两者不同源会让贴图炮管
  // 相对 gunRoot/gunTip（弹道起点与炮口火焰所在）系统性偏后 1.9~8.0 单位。
  // 这里把设计器作者帧换算到运行时帧（x - axis.dx）后再取前缘；embed 由用户在面板上给。
  {
    const v = buildFullVerts(state.turret.half);
    if(v.length >= 2){
      const ax = (state.turret.axis && state.turret.axis.dx) || 0;
      const runtimeVerts = v.map(p => [p[0] - ax, p[1]]);
      const front = (typeof frontDistFromVerts === 'function')
        ? frontDistFromVerts(runtimeVerts, 0)
        : runtimeVerts.reduce((m, p) => Math.max(m, p[0]), -Infinity);
      const embed = +state.sprite.barrel.embed || 0;
      sp.barrel.mountDx = +(front + embed).toFixed(2);
      sp.barrel.mountDy = 0;
    }
  }
  syncSpriteInputs();
  render();
  pushHint('已按多边形包围盒重算精灵缩放（位移/旋转清零，轴心保留）；履带/炮管已给初值（炮管安装点 = 炮塔前缘 + 嵌入深度）');
}
document.getElementById('sp-enabled').addEventListener('change', e=>{
  state.sprite.enabled = e.target.checked; render();
});
document.getElementById('sp-preview').addEventListener('change', e=>{
  state.spritePreview = e.target.checked;
  preloadSpriteImages(); // #M2：勾选瞬间预热（此刻才开始加载也不至于空白一帧）
  render();
});
for(const [id, part, key] of [
  ['sp-track-scale','track','scale'], ['sp-track-dx','track','dx'], ['sp-track-dy','track','dy'],
  ['sp-hull-scale','hull','scale'], ['sp-hull-dx','hull','dx'], ['sp-hull-dy','hull','dy'], ['sp-hull-rot','hull','rot'],
  ['sp-turret-scale','turret','scale'], ['sp-turret-dx','turret','dx'], ['sp-turret-dy','turret','dy'], ['sp-turret-rot','turret','rot'],
  ['sp-turret-pivotx','turret','pivotx'], ['sp-turret-pivoty','turret','pivoty'],
  ['sp-barrel-mountdx','barrel','mountDx'], ['sp-barrel-mountdy','barrel','mountDy'],
  ['sp-barrel-embed','barrel','embed'], ['sp-barrel-scalemult','barrel','scaleMult'], ['sp-barrel-gap','barrel','gap']
]){
  document.getElementById(id).addEventListener('change', e=>{
    const v = parseFloat(e.target.value) || 0;
    if(key === 'pivotx') state.sprite[part].pivot[0] = v;
    else if(key === 'pivoty') state.sprite[part].pivot[1] = v;
    else state.sprite[part][key] = v;
    render();
  });
}
document.getElementById('sp-autoalign').addEventListener('click', spriteAutoAlign);
// #M2：炮管贴图路径输入（含本车专用 imgVehicle）。路径变更后必须做两件事：
// ① 预热 spriteImage 缓存（首次请求才会创建 Image，否则下一帧渲染时图片未就绪 → 空白一帧）；
// ② 给 Image 挂 onload 触发一次重绘——设计器 render() 只在交互时被调用，没有逐帧循环，
//    图片异步解码完成后若无人叫醒 render，贴图永远停留在「未加载」状态（用户实测反馈）。
for(const [id, key] of [
  ['sp-barrel-imgstd-in','imgStandard'], ['sp-barrel-imgveh-in','imgVehicle'],
  ['sp-barrel-imgac-in','imgAutocannon'], ['sp-barrel-imgrg-in','imgRailgun']
]){
  document.getElementById(id).addEventListener('change', e=>{
    state.sprite.barrel[key] = e.target.value.trim();
    preloadSpriteImages();
    syncSpriteInputs();
    render();
  });
}
// 预热全部精灵图片缓存并挂载 onload 重绘（幂等：已缓存的图片不会重复创建）。
function preloadSpriteImages(){
  const sp = state.sprite;
  const paths = [sp.hull && sp.hull.img, sp.turret && sp.turret.img, sp.track && sp.track.img,
                 sp.barrel.imgVehicle, sp.barrel.imgStandard, sp.barrel.imgAutocannon, sp.barrel.imgRailgun];
  for(const p of paths){
    if(!p) continue;
    const img = spriteImage(p);
    if(img && !img.complete && !img._onloadHooked){
      img._onloadHooked = true;
      img.addEventListener('load', render, { once:true });
      img.addEventListener('error', ()=>{ pushHint('精灵贴图加载失败: ' + p, 3000); }, { once:true });
    }
  }
}
document.getElementById('barrelMuzzle').addEventListener('change', ()=>{
   state.barrel.muzzle = document.getElementById('barrelMuzzle').value;
   render();
});

// ================= regular polygon turret preset =================
document.getElementById('turretPresetApplyBtn').addEventListener('click', ()=>{
  const n = Math.max(3, Math.min(8, parseInt(document.getElementById('turretPresetN').value,10)||6));
  const R = parseFloat(document.getElementById('turretPresetR').value)||20;
  const flat = document.getElementById('turretPresetFlat').value === 'flat';
  state.turret = turretRegularPreset(n, R, flat);
  clearSelection();
  syncArmorInputsFromState();
  render(); renderEdgeLists();
  pushHint(`炮塔已替换为正${n}边形（外接圆半径 ${R}，${flat?'齐边朝前':'尖角朝前'}）`);
});

// ================= mantlet preset =================
function applyMantletPreset(key){
  const p = MANTLE_PRESETS[key];
  if(!p) return;
  state.barrel.mantlet = { style:p.style, pos:p.pos, width:p.width };
  document.getElementById('mantletPos').value = p.pos;
  document.getElementById('mantletWid').value = p.width;
  render();
}
document.getElementById('mantletPreset').addEventListener('change', ()=>{
  applyMantletPreset(document.getElementById('mantletPreset').value);
});
document.getElementById('mantletPos').addEventListener('input', ()=>{
  state.barrel.mantlet = Object.assign({style:'none',pos:0,width:40}, state.barrel.mantlet, { pos: parseFloat(document.getElementById('mantletPos').value)||0 });
  render();
});
document.getElementById('mantletWid').addEventListener('input', ()=>{
  state.barrel.mantlet = Object.assign({style:'none',pos:0,width:40}, state.barrel.mantlet, { width: parseFloat(document.getElementById('mantletWid').value)||40 });
  render();
});

// ================= base params =================
function syncBaseFromInputs(){
  const prevId = state.id;
  state.id = document.getElementById('t-id').value;
  // 顶部下拉同步：名称框改名时，让下拉跟随（未保存项由 populate 补带后缀的选项）
  if(prevId !== state.id) populateTankListSelect(tankListCache || {});
  state.traverseLimit = parseFloat(document.getElementById('t-traverse').value)||180;
  // P-49 参数极限：编辑即钳制到 [min,max] 并提示（钳制策略说明见文件底部区块注释）
  state.maxSpeed = clampParamInput('t-maxSpeed','maxSpeed','最大速度')||0;
  state.turnRate = clampParamInput('t-turnRate','turnRate','车体转速')||0;
  state.turretTurnRate = clampParamInput('t-turretTurnRate','turretTurnRate','炮塔转速')||0;
  state.hp = clampParamInput('t-hp','maxHp','满血 HP')||100;
  state.penetration = clampParamInput('t-penetration','penetration','穿深')||0;
  state.damage = clampParamInput('t-damage','damage','单发伤害')||0;
  state.reload = clampParamInput('t-reload','reload','装填')||0;
  state.shellSpeed = clampParamInput('t-shellSpeed','shellSpeed','弹速')||1200;
  state.weight = parseFloat(document.getElementById('t-weight').value)||300;
  state.enginePower = clampParamInput('t-enginePower','enginePower','马力')||900;
  state.heightClass = document.getElementById('t-heightClass').value || 'medium';
  state.spreadMult = clampParamInput('t-spreadMult','spreadMult','三扩系数')||1;
  state.aimSpeed = parseFloat(document.getElementById('t-aimSpeed').value)||0.15;
  render();
}
['t-id','t-traverse','t-maxSpeed','t-turnRate','t-turretTurnRate',
 't-hp','t-penetration','t-damage','t-reload','t-shellSpeed','t-weight','t-enginePower','t-heightClass',
 't-spreadMult','t-aimSpeed'].forEach(id=>{
  document.getElementById(id).addEventListener('input', syncBaseFromInputs);
  document.getElementById(id).addEventListener('change', syncBaseFromInputs);
});

// ================= edge list panel (only the editable half + seams — mirrored edges are implicit) =================
// 当前选中装甲段 → 面板读数 + 对应 mm 输入框高亮（Change: 装甲编辑面板高亮正在编辑的段）
function selectedEdgeFace(){
  if(!selectedEdge || !state[selectedEdge.poly]) return null;
  const poly = state[selectedEdge.poly];
  if(selectedEdge.seam){
    return {
      face: selectedEdge.seam==='front' ? poly.frontSeamFace : poly.rearSeamFace,
      label: selectedEdge.seam==='front' ? '前接缝' : '后接缝'
    };
  }
  if(selectedEdge.index >= poly.half.length-1) return null;
  return { face: getFace(poly.halfFaces, selectedEdge.index), label:`边 v${selectedEdge.index}→v${selectedEdge.index+1}` };
}
function updateArmorSelReadout(){
  const readouts = document.querySelectorAll('.armor-sel-readout');
  document.querySelectorAll('.armor-active').forEach(i=>i.classList.remove('armor-active'));
  if(!selectedEdge || !selectedEdgeFace()){
    readouts.forEach(el=>{ el.innerHTML = '未选择 — 点击画布边线或下方列表选择'; });
    return;
  }
  const poly = state[selectedEdge.poly];
  const sf = selectedEdgeFace();
  const mm = (poly.armor && poly.armor[sf.face] !== undefined) ? poly.armor[sf.face] : '-';
  const key = selectedEdge.poly;
  const html = `${key==='hull'?'车体':'炮塔'} · ${sf.label} · <b style="color:${FACE_COLOR[sf.face]}">${sf.face}</b> ${mm}mm`;
  readouts.forEach(el=>{ el.innerHTML = html; });
  const inp = document.getElementById(`a-${key==='hull'?'hull':'turret'}-${sf.face}`);
  if(inp) inp.classList.add('armor-active');
}
function renderEdgeLists(){
  renderEdgeListFor('hull', document.getElementById('hullEdgeList'));
  renderEdgeListFor('turret', document.getElementById('turretEdgeList'));
  updateArmorSelReadout();
}
function renderEdgeListFor(key, container){
  const poly = state[key];
  container.innerHTML = '';
  const n = poly.half.length;
  if(n<2){ container.innerHTML = '<div class="ename">（顶点不足，无边）</div>'; return; }

  const addRow = (label, faceVal, onChange, isSeam, edgeRef)=>{
    const row = document.createElement('div');
    row.className = 'edge-row' + (isSeam?' seam':'');
    const isActive = selectedEdge && selectedEdge.poly===key &&
      ((selectedEdge.seam && edgeRef.seam===selectedEdge.seam) || (selectedEdge.index!==undefined && edgeRef.index===selectedEdge.index));
    if(isActive) row.classList.add('active');
    const left = document.createElement('span');
    const dot = document.createElement('span');
    dot.className = 'face-dot'; dot.style.background = FACE_COLOR[faceVal] || '#5a5f4a';
    const lab = document.createElement('span'); lab.className='ename'; lab.textContent = label;
    left.appendChild(dot); left.appendChild(lab);
    const armorVal = document.createElement('span');
    armorVal.className = 'armor-val';
    const mm = (poly.armor && poly.armor[faceVal]) ? poly.armor[faceVal] : '';
    armorVal.textContent = mm ? mm+'mm' : '';
    const sel = document.createElement('select');
    ['front','side','rear'].forEach(f=>{
      const opt=document.createElement('option'); opt.value=f; opt.textContent=f;
      if(faceVal===f) opt.selected=true;
      sel.appendChild(opt);
    });
    sel.addEventListener('change', ()=>{ onChange(sel.value); render(); renderEdgeLists(); });
    row.appendChild(left); row.appendChild(armorVal); row.appendChild(sel);
    row.addEventListener('click', e=>{
      if(e.target === sel) return; // let the dropdown take the click
      selectedEdge = { poly:key, index:edgeRef.index, seam:edgeRef.seam };
      clearSelection();
      render(); renderEdgeLists();
    });
    container.appendChild(row);
  };

  // 面板顺序：前接缝 → 内部边（链序）→ 后接缝（按坦克朝向「前→后」排列，仅显示顺序）
  if(!onCenterline(poly.half[0])){
    addRow('接缝(前) front seam', poly.frontSeamFace, v=>{ poly.frontSeamFace=v; }, true, { seam:'front' });
  }
  for(let i=0;i<n-1;i++){
    addRow(`边 v${i}→v${i+1}`, getFace(poly.halfFaces,i), v=>setFace(poly.halfFaces,i,v), false, { index:i });
  }
  if(!onCenterline(poly.half[n-1])){
    addRow('接缝(后) rear seam', poly.rearSeamFace, v=>{ poly.rearSeamFace=v; }, true, { seam:'rear' });
  }
  // per-class summary: how many primary edges are in front/side/rear (mirrored side copies them)
  const counts = { front:0, side:0, rear:0 };
  for(let i=0;i<n-1;i++) counts[getFace(poly.halfFaces,i)]++;
  if(!onCenterline(poly.half[n-1])) counts[poly.rearSeamFace]++;
  if(!onCenterline(poly.half[0])) counts[poly.frontSeamFace]++;
  const note = document.createElement('div');
  note.className='ename'; note.style.marginTop='2px';
  note.innerHTML = `合计：<span style="color:var(--front)">前 ${counts.front}</span> · <span style="color:var(--side)">侧 ${counts.side}</span> · <span style="color:var(--rear)">后 ${counts.rear}</span><span style="opacity:.6">（镜像侧自动沿用）</span>`;
  container.appendChild(note);
}

// ================= barrel rendering =================
// 炮塔装甲多边形与对称轴 y=0 的前缘交点（最大 x 坐标），炮管根部、炮盾、护套、制退器均绑定在此点
function turretFrontX(){
  const full = buildFullVerts(state.turret.half);
  if(full.length < 2) return 0;
  let maxInterX = -Infinity;
  const n = full.length;
  for(let i=0; i<n; i++){
    const p1 = full[i], p2 = full[(i+1)%n];
    if((p1[1] <= 0 && p2[1] >= 0) || (p1[1] >= 0 && p2[1] <= 0)){
      if(Math.abs(p1[1] - p2[1]) < 1e-6){
        maxInterX = Math.max(maxInterX, p1[0], p2[0]);
      } else {
        const tVal = (0 - p1[1]) / (p2[1] - p1[1]);
        const ix = p1[0] + tVal * (p2[0] - p1[0]);
        maxInterX = Math.max(maxInterX, ix);
      }
    }
  }
  if(maxInterX === -Infinity){
    for(const p of full) maxInterX = Math.max(maxInterX, p[0]);
  }
  return maxInterX;
}
function turretBBox(){
   const full = buildFullVerts(state.turret.half);
   let minX=0, maxX=0;
   for(const [vx] of full){
      if(vx < minX) minX = vx;
      if(vx > maxX) maxX = vx;
   }
   return { minX, maxX, turLen: Math.max(1, maxX - minX) };
}
function drawDesignerBarrel(angle, scale){
   const b = state.barrel;
   const { turLen } = turretBBox();
   const frontX = turretFrontX();
   const turWid = 36; // approx turret width
   // barrel length is a % of turret length, measured FROM the front intersection of the turret armor with y=0
   const barrelLen = turLen * (b.len/100);
   const barrelWid = Math.max(3, turWid * (b.width/100) * 0.5);

   // 炮管根部完全绑定在炮塔前缘装甲与 y=0 对称轴的交点 (frontX, 0)
   const base = turretToScreen([frontX, 0], angle);
   const baseX = base.x, baseY = base.y;
   const cos = Math.cos(angle), sin = Math.sin(angle);
   const endX = baseX + cos*barrelLen*scale;
   const endY = baseY + sin*barrelLen*scale;
   const U = barrelLen*scale; // barrel screen length in px

   // box along the barrel axis: from off0..off1 px from the root, halfH = half thickness (px)
   const box = (off0, off1, halfH, fill, stroke)=>{
     const ax = baseX + cos*off0, ay = baseY + sin*off0;
     const bx = baseX + cos*off1, by = baseY + sin*off1;
     const L = Math.max(1, Math.hypot(bx-ax, by-ay));
     ctx.save();
     ctx.translate(ax, ay);
     ctx.rotate(angle);
     ctx.fillStyle = fill; ctx.lineWidth = 1;
     ctx.fillRect(0, -halfH, L, halfH*2);
     if(stroke){ ctx.strokeStyle = stroke; ctx.strokeRect(0, -halfH, L, halfH*2); }
     ctx.restore();
   };

   // main barrel tube
   ctx.strokeStyle = '#8a8a7a'; ctx.lineWidth = barrelWid*scale;
   ctx.lineCap = 'butt';
   ctx.beginPath(); ctx.moveTo(baseX, baseY); ctx.lineTo(endX, endY); ctx.stroke();
   // barrel highlight
   ctx.strokeStyle = '#b5b5a5'; ctx.lineWidth = Math.max(1, barrelWid*scale*0.4);
   ctx.beginPath(); ctx.moveTo(baseX, baseY); ctx.lineTo(endX, endY); ctx.stroke();

   // 炮盾 mantlet（纯视觉，样式 none/single/double/collar/box/winged/wedge）：
   // 位于炮管根部（可沿炮管前后偏移 pos/%），宽度按炮塔全宽百分比计算
   const mt = b.mantlet || { style:'none', pos:0, width:40 };
   if(mt.style && mt.style !== 'none'){
      const mPos = (mt.pos||0)/100 * U;
      const mW = Math.max(barrelWid*scale*1.2, turWid*Math.max(0, mt.width||40)/100*0.5*scale);
      const mdx = baseX + cos*mPos, mdy = baseY + sin*mPos;
      const d = mW*0.6;
      ctx.save(); ctx.translate(mdx, mdy); ctx.rotate(angle);
      ctx.lineWidth = 1;
      if(mt.style === 'single'){
         ctx.fillStyle = '#4a4a40'; ctx.strokeStyle = '#b5b5a5';
         ctx.fillRect(-d/2, -mW, d, mW*2); ctx.strokeRect(-d/2, -mW, d, mW*2);
      } else if(mt.style === 'double'){
         ctx.fillStyle = '#4a4a40'; ctx.strokeStyle = '#b5b5a5';
         ctx.fillRect(-d*0.6, -mW*0.85, d*0.55, mW*1.7); ctx.strokeRect(-d*0.6, -mW*0.85, d*0.55, mW*1.7);
         ctx.fillStyle = '#5c5c50';
         ctx.fillRect(d*0.1, -mW*0.58, d*0.5, mW*1.16); ctx.strokeRect(d*0.1, -mW*0.58, d*0.5, mW*1.16);
      } else if(mt.style === 'collar'){
         ctx.fillStyle = '#5a5a4a'; ctx.strokeStyle = '#b5b5a5';
         ctx.fillRect(-d*0.3, -mW, d*0.6, mW*2); ctx.strokeRect(-d*0.3, -mW, d*0.6, mW*2);
         ctx.fillStyle = '#23231c';
         ctx.fillRect(-d*0.05, -mW*0.72, d*0.1, mW*1.44);
      } else if(mt.style === 'box'){
         ctx.fillStyle = '#4a4a40'; ctx.strokeStyle = '#b5b5a5';
         ctx.fillRect(-d*0.9, -mW, d*1.8, mW*2); ctx.strokeRect(-d*0.9, -mW, d*1.8, mW*2);
         ctx.fillStyle = '#5c5c50';
         ctx.fillRect(d*0.55, -mW*0.9, d*0.2, mW*1.8);
      } else if(mt.style === 'winged'){
         ctx.fillStyle = '#4a4a40'; ctx.strokeStyle = '#b5b5a5';
         ctx.fillRect(-d*0.5, -mW*0.42, d, mW*0.84); ctx.strokeRect(-d*0.5, -mW*0.42, d, mW*0.84);
         ctx.fillRect(-d*0.5, -mW*1.1, d*0.55, mW*0.62); ctx.strokeRect(-d*0.5, -mW*1.1, d*0.55, mW*0.62);
         ctx.fillRect(-d*0.5, mW*0.48, d*0.55, mW*0.62); ctx.strokeRect(-d*0.5, mW*0.48, d*0.55, mW*0.62);
      } else if(mt.style === 'wedge'){
         ctx.fillStyle = '#4a4a40'; ctx.strokeStyle = '#b5b5a5';
         ctx.beginPath();
         ctx.moveTo(-d, -mW); ctx.lineTo(d, -mW*0.5); ctx.lineTo(d, mW*0.5); ctx.lineTo(-d, mW);
         ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      ctx.restore();
   }

   // 炮管护套 jacket: thicker rectangle sleeve over part of the barrel (len>0 → active)
   const jk = b.jacket || { len:0, pos:45 };
   const jkLen = Math.max(0, Math.min(100, jk.len||0));
   if(jkLen > 0){
      const jkS = Math.max(0, Math.min(90, jk.pos||45));
      const jkE = Math.min(100, jkS + jkLen);
      box(jkS/100*U, jkE/100*U, barrelWid*scale*0.9, '#5c5c50', '#b5b5a5');
      box(jkS/100*U, jkS/100*U + Math.max(2, barrelWid*scale*0.15), barrelWid*scale*0.98, '#3f3f36', null);
   }

   // 抽烟器 bore evacuator: styles none / ring / bulb / slotted / long
   const ev = b.evac || { style:'none', pos:30 };
   if(ev.style && ev.style !== 'none'){
      const epos = Math.max(0, Math.min(95, ev.pos||30))/100*U;
      const w = barrelWid*scale; // half-width of tube in px
      if(ev.style === 'ring'){
         box(epos - U*0.04, epos + U*0.04, w*0.72, '#5a5a4a', '#b5b5a5');
      } else if(ev.style === 'bulb'){
         ctx.save(); ctx.translate(baseX+cos*epos, baseY+sin*epos); ctx.rotate(angle);
         ctx.fillStyle = '#5a5a4a'; ctx.strokeStyle = '#b5b5a5'; ctx.lineWidth = 1;
         ctx.beginPath(); ctx.ellipse(0, 0, w*0.75, w*1.15, 0, 0, Math.PI*2);
         ctx.fill(); ctx.stroke();
         ctx.restore();
      } else if(ev.style === 'slotted'){
         box(epos - U*0.05, epos + U*0.05, w*0.8, '#4c4c40', '#b5b5a5');
         ctx.save(); ctx.translate(baseX+cos*epos, baseY+sin*epos); ctx.rotate(angle);
         ctx.fillStyle = '#1a1a14';
         ctx.fillRect(-U*0.035, -w*0.62, U*0.012, w*1.24);
         ctx.fillRect(U*0.01, -w*0.62, U*0.012, w*1.24);
         ctx.restore();
      } else if(ev.style === 'long'){
         box(epos - U*0.005, epos + U*0.12, w*0.68, '#5a5a4a', '#b5b5a5');
      }
   }

   // 制退器 muzzle brake (drawn at the muzzle tip; `mw` = tube half-width px)
   const mw = barrelWid*scale;
   if(b.muzzle && b.muzzle !== 'none'){
      if(b.muzzle === 'single'){
         box(U - mw*0.7, U + mw*0.45, mw*0.9, '#5a5a4a', '#a5a595');
      } else if(b.muzzle === 'double'){
         box(U - mw*0.4, U + mw*0.55, mw*0.95, '#5a5a4a', '#a5a595');
         ctx.save(); ctx.translate(endX, endY); ctx.rotate(angle);
         ctx.fillStyle = '#111'; ctx.fillRect(-mw*0.1, -mw*0.85, mw*0.2, mw*1.7);
         ctx.restore();
      } else if(b.muzzle === 'multi'){
         box(U - mw*0.1, U + mw*0.75, mw*0.95, '#5a5a4a', '#a5a595');
         ctx.save(); ctx.translate(endX, endY); ctx.rotate(angle);
         ctx.fillStyle = '#111';
         for(const s of [0.15, 0.45, 0.75]) ctx.fillRect(mw*s, -mw*0.85, mw*0.09, mw*1.7);
         ctx.restore();
      } else if(b.muzzle === 'slug'){
         box(U - mw*0.5, U + mw*0.6, mw*0.8, '#4c4c40', '#a5a595');
         ctx.save(); ctx.translate(endX, endY); ctx.rotate(angle);
         ctx.fillStyle = '#111';
         ctx.fillRect(0, -mw*0.8, mw*0.25, mw*0.45); ctx.fillRect(0, mw*0.35, mw*0.25, mw*0.45);
         ctx.restore();
      } else if(b.muzzle === 'pepperpot'){
         box(U - mw*0.3, U + mw*0.7, mw*0.75, '#4c4c44', '#a5a595');
         ctx.save(); ctx.translate(endX, endY); ctx.rotate(angle);
         ctx.fillStyle = '#111';
         for(const s of [-0.6, -0.2, 0.2, 0.6]) ctx.fillRect(-mw*0.5, s*mw, mw*0.2, mw*0.32);
         ctx.restore();
      } else if(b.muzzle === 'heavy_square'){
         box(U - mw*0.2, U + mw*0.8, mw*1.1, '#4c4c40', '#a5a595');
      } else if(b.muzzle === 'cylinder'){
         box(U - mw*0.6, U + mw*0.2, mw*1.0, '#54544c', '#a5a595');
         ctx.save(); ctx.translate(endX, endY); ctx.rotate(angle);
         ctx.fillStyle = '#222';
         ctx.fillRect(-mw*0.6, -mw*1.05, mw*0.9, mw*0.25);
         ctx.fillRect(-mw*0.6, mw*0.8, mw*0.9, mw*0.25);
         ctx.restore();
      }
   }
   ctx.lineCap = 'butt';
}

// ================= render =================
function drawGrid(){
  ctx.strokeStyle = 'rgba(255,255,255,0.035)'; ctx.lineWidth = 1;
  const step = 40*viewScale;
  if(step>4){
    for(let x=canvas.clientWidth/2 % step; x<canvas.clientWidth; x+=step){ ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,canvas.clientHeight); ctx.stroke(); }
    for(let y=canvas.clientHeight/2 % step; y<canvas.clientHeight; y+=step){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(canvas.clientWidth,y); ctx.stroke(); }
  }
}
// neutral base tone for the designer's procedural paint (no per-tank color exists here)
const DESIGN_PAINT = '#9aa48a';
// The paint/track code below delegates to the shared tank_paint.js module (single source of
// truth for tracks & top-down textures), keeping names the designer already uses.
function shade(hex, pct){ return paintShade(hex, pct); }
// full closed vertex list of a part, in LOCAL coords (helper retained for the designer's call sites)
function fullVertsBounds(poly){
  return { fullVerts: buildFullVerts(poly.half) };
}
// 精灵履带预览（设计器对齐用）：track-links.png 平铺滚动条，画在车体精灵之下
function drawPreviewSpriteTracks(){
  const sp = state.sprite;
  if(!state.spritePreview || !sp.track.img) return;
  const img = spriteImage(sp.track.img);
  if(!img || !img.naturalWidth) return;
  const hc = hullCenter();
  const v = buildFullVerts(state.hull.half);
  if(v.length < 3) return;
  let minX=Infinity, maxX=-Infinity, minY=Infinity, maxY=-Infinity;
  for(const p of v){ minX=Math.min(minX,p[0]); maxX=Math.max(maxX,p[0]); minY=Math.min(minY,p[1]); maxY=Math.max(maxY,p[1]); }
  const hullLen = maxX - minX, hullWid = maxY - minY;
  const tw = state.trackWidth || 8;
  const s = (sp.track.scale > 0) ? sp.track.scale : tw / img.naturalHeight;
  const trackOff = state.trackOffset || 0;
  const dx = sp.track.dx || 0, dy = sp.track.dy || 0;
  // 与局内 drawSpriteTracks 同口径：滚动周期 = 整幅贴图宽（不硬编码 196），相位向 +x 推进
  // （与程序化 paintTracks 的 lineDashOffset=-phase 同向）。
  const tileLen = img.naturalWidth * s * viewScale;
  const period = tileLen;
  const phase = (((performance.now()*0.02) % period) + period) % period;
  ctx.save();
  ctx.translate(hc.x, hc.y);
  for(const dir of [-1, 1]){
    const cy = (dir * (hullWid/2 + trackOff + tw/2) + dy) * viewScale;
    const x0 = (dx - hullLen/2) * viewScale, x1 = (dx + hullLen/2) * viewScale;
    const y0 = cy - (tw/2)*viewScale, y1 = cy + (tw/2)*viewScale;
    ctx.save();
    ctx.beginPath(); ctx.rect(x0, y0, x1-x0, y1-y0); ctx.clip();
    const drawH = img.naturalHeight * s * viewScale;
    const yImg = cy - drawH/2;
    for(let x = x0 + phase - tileLen; x < x1; x += tileLen){
      ctx.drawImage(img, x, yImg, tileLen, drawH);
    }
    ctx.restore();
  }
  ctx.restore();
}
// 精灵炮管预览（设计器对齐用）：标准炮管贴图，安装点由 mountDx/mountDy/embed 决定
function drawPreviewSpriteBarrel(turretAngle){
  const sp = state.sprite;
  if(!state.spritePreview) return;
  const img = spriteImage(sp.barrel.imgVehicle || sp.barrel.imgStandard);
  if(!img || !img.naturalWidth) return;
  const hc = hullCenter();
  const ring = { x: hc.x + state.turret.pivot.dx*viewScale, y: hc.y + (state.turret.pivot.dy||0)*viewScale };
  const b = sp.barrel;
  const mountDx = +b.mountDx || 0, mountDy = +b.mountDy || 0;
  const embed = (b.embed !== undefined && b.embed !== null && b.embed !== '') ? +b.embed : 2;
  const scaleMult = +b.scaleMult || 1;
  const tv = buildFullVerts(state.turret.half);
  let turLen = 34;
  if(tv.length >= 2){
    let minX=Infinity, maxX=-Infinity;
    for(const p of tv){ minX=Math.min(minX,p[0]); maxX=Math.max(maxX,p[0]); }
    turLen = maxX - minX;
  }
  const barrelLen = turLen * Math.max(0, Math.min(3, (state.barrel.len || 120) / 100));
  const scaleUPP = barrelLen / img.naturalWidth * scaleMult;
  const r = rotate((mountDx - embed)*viewScale, mountDy*viewScale, turretAngle);
  paintPartSprite(ctx, img, ring.x + r.x, ring.y + r.y, turretAngle, viewScale, scaleUPP, 0, 0, 0, [0, img.naturalHeight/2]);
}
// rolling track strips under the hull. `phase` scrolls the links; a slowly-changing phase animates it.
function drawDesignerTracks(phase, scale){
  const { fullVerts } = fullVertsBounds(state.hull);
  const hc = hullCenter();
  const trackW = state.trackWidth || 8;
  const trackOff = state.trackOffset || 0;
  paintTracks(ctx, fullVerts, hc.x, hc.y, 0, scale, DESIGN_PAINT, phase, { trackWidth: trackW, trackOffset: trackOff });
}
// Flat base fill — the designer intentionally does NOT render procedural textures (deck plates,
// grilles, cupolas, …) so vertex/edge/armor editing stays clean and readable. `faded` = edit modes
// (faint), otherwise slightly stronger for preview.
function paintPart(poly, center, angle, scale, opts){
  const fullVerts = buildFullVerts(poly.half);
  if(fullVerts.length < 3) return;
  const faded = !!(opts && opts.faded);
  ctx.save();
  ctx.translate(center.x, center.y);
  ctx.rotate(angle||0);
  ctx.scale(scale, scale);
  ctx.beginPath();
  fullVerts.forEach((p,i)=>{ if(i===0) ctx.moveTo(p[0],p[1]); else ctx.lineTo(p[0],p[1]); });
  ctx.closePath();
  ctx.fillStyle = paintShade(DESIGN_PAINT, poly===state.hull ? -10 : -2);
  ctx.globalAlpha = faded ? 0.4 : 0.85;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.restore();
}
function drawPolygon(poly, center, angle, opts){
  const active = opts.active;
  const fullVerts = buildFullVerts(poly.half);
  const { faces: fullFaces, primary } = buildFullFacesWithFlags(poly.half, i=>getFace(poly.halfFaces,i), poly.frontSeamFace, poly.rearSeamFace);
  const n = fullVerts.length;
  const hN = poly.half.length;
  const touchesFront = onCenterline(poly.half[0]);
  const touchesRear = onCenterline(poly.half[hN-1]);
  const isTurret = (poly === state.turret);
  const world = fullVerts.map(p => isTurret ? turretToScreen(p, angle) : toScreen(center, p, angle));
  // map a full-edge index back to the half-chain index / seam it mirrors (for highlight matching)
  function fullEdgeHalfRef(i){
    if(i < hN-1) return { index:i };
    const mstart = hN-1 + (touchesRear ? 0 : 1);
    if(!touchesRear && i === hN-1) return { seam:'rear' };
    const mlen = hN-1;
    if(i >= mstart && i < mstart+mlen) return { index: (hN-2) - (i-mstart) };
    if(!touchesFront && i === mstart+mlen) return { seam:'front' };
    return null;
  }
  if(n>=3){
    // flat paint fill (no texture) — see paintPart()
    const partOpts = {};
    if (opts.detail) partOpts.detail = true;
    if (opts.faded) partOpts.faded = true;
    
    // 整车精灵叠加（设计器对齐用）：图片就绪时替代纯色填充，描边/顶点/装甲色仍绘制以便对齐
    let spriteDrawn = false;
    if(state.spritePreview){
      const sp = state.sprite, part = sp && (isTurret ? sp.turret : sp.hull);
      if(part && part.img){
        const img = spriteImage(part.img);
        if(isTurret){
          const hc2 = hullCenter();
          const ring = { x: hc2.x + state.turret.pivot.dx*viewScale, y: hc2.y + (state.turret.pivot.dy||0)*viewScale };
          spriteDrawn = paintPartSprite(ctx, img, ring.x, ring.y, angle, viewScale, part.scale, part.dx, part.dy, part.rot, part.pivot);
        } else if(center){
          spriteDrawn = paintPartSprite(ctx, img, center.x, center.y, angle, viewScale, part.scale, part.dx, part.dy, part.rot);
        }
      }
    }
    if(!spriteDrawn){
    // Fill background path
    ctx.save();
    ctx.beginPath();
    world.forEach((p,i)=>{ if(i===0) ctx.moveTo(p.x,p.y); else ctx.lineTo(p.x,p.y); });
    ctx.closePath();
    ctx.fillStyle = paintShade(DESIGN_PAINT, poly===state.hull ? -10 : -2);
    ctx.globalAlpha = opts.faded ? 0.4 : 0.85;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();
    }

    // P-27 纹理叠层：仅预览模式（detail && !faded）下贴与 mvp 同款的 paintPartTexture 纹理，
    // 车体以 hullCenter 为原点、炮塔换算到座圈圆心 + axis 平移帧（与 turretToScreen 同帧约定）；
    // 编辑模式保持纯色填充便于看顶点/边/装甲。切换外观件下拉即时生效。
    // 精灵已绘制时跳过（AI 贴图自带涂装，不再叠程序化纹理）。
    if(!spriteDrawn && opts.detail && !opts.faded && state.texture && state.texture !== 'none'){
      const texOpts = { detail:true, texture: state.texture, heightClass: state.heightClass };
      if(isTurret){
        const ax = (state.turret.axis && state.turret.axis.dx) || 0;
        const ay = (state.turret.axis && state.turret.axis.dy) || 0;
        const hc = hullCenter();
        const ring = { x: hc.x + state.turret.pivot.dx*viewScale, y: hc.y + (state.turret.pivot.dy||0)*viewScale };
        paintPartTexture(ctx, fullVerts.map(([vx,vy]) => [vx-ax, vy-ay]), ring.x, ring.y, angle, viewScale, DESIGN_PAINT, 'turret', texOpts);
      } else {
        paintPartTexture(ctx, fullVerts, center.x, center.y, angle, viewScale, DESIGN_PAINT, 'hull', texOpts);
      }
    }

    for(let i=0;i<n;i++){
      const a = world[i], b = world[(i+1)%n];
      const editable = primary[i]; // half-chain + seam edges are user-controlled; mirrored-chain edges just copy them
      // Color outline based on face type (front/side/rear)
      const faceType = fullFaces[i] || 'side';
      ctx.strokeStyle = editable ? FACE_COLOR[faceType] : 'rgba(90,95,74,0.7)';
      ctx.lineWidth = active ? (editable?4:2.5) : 2;
      ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();
      if(active){
        const ref = fullEdgeHalfRef(i);
        const isHover = hoverEdge && ref && !ref.seam &&
          hoverEdge.poly===(poly===state.hull?'hull':'turret') && ref.index===hoverEdge.index;
        const isSel = selectedEdge && ref && selectedEdge.poly===(poly===state.hull?'hull':'turret') &&
          ((ref.seam && selectedEdge.seam===ref.seam) || (ref.index!==undefined && selectedEdge.index===ref.index));
        if(isSel || isHover){
          ctx.strokeStyle = isSel ? 'rgba(255,180,84,0.95)' : 'rgba(255,180,84,0.45)';
          ctx.lineWidth = 9;
          ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();
        }
        const mx=(a.x+b.x)/2, my=(a.y+b.y)/2;
        ctx.fillStyle = FACE_COLOR[faceType];
        ctx.font = '9px "JetBrains Mono", monospace';
        ctx.fillText(faceType, mx+4, my-4);
      }
    }
  } else if(n===2){
    ctx.strokeStyle = active ? '#5cc8ff' : 'rgba(255,255,255,0.15)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(world[0].x,world[0].y); ctx.lineTo(world[1].x,world[1].y); ctx.stroke();
  }
  // vertex handles: interactive (bright) only for the editable half; mirrored side shown as small read-only dots
  poly.half.forEach((p,i)=>{
    const w = isTurret ? turretToScreen(p, angle) : toScreen(center, p, angle);
    const isSel = active && selected && selected.poly===(poly===state.hull?'hull':'turret') && selected.index===i;
    ctx.beginPath();
    ctx.arc(w.x, w.y, active ? (isSel?7:5) : 3, 0, Math.PI*2);
    ctx.fillStyle = isSel ? '#7ed957' : (active ? '#fff' : 'rgba(255,255,255,0.3)');
    ctx.fill();
    ctx.strokeStyle = active ? '#000' : 'transparent'; ctx.lineWidth = 1; ctx.stroke();
    if(active){
      ctx.fillStyle = isSel ? '#7ed957' : 'rgba(255,255,255,0.8)';
      ctx.font = '9px "JetBrains Mono", monospace';
      ctx.fillText(`v${i}`, w.x + 6, w.y - 6);
    }
  });
  if(active){
    const mirroredHalf = poly.half.filter(p=>!onCenterline(p)).map(mirrorPt);
    mirroredHalf.forEach(p=>{
      const w = isTurret ? turretToScreen(p, angle) : toScreen(center, p, angle);
      ctx.beginPath(); ctx.arc(w.x, w.y, 3, 0, Math.PI*2);
      ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fill();
    });
  }
}

// 绘制掩体多边形（world坐标直接绘制，无镜像）
function drawCoverPolygon(cover){
  if(!cover || !cover.verts || cover.verts.length < 2) return;
  const verts = cover.verts;
  const n = verts.length;
  const isClosed = n >= 3;
  const limit = isClosed ? n : n - 1;

  // Tier-specific colors
  const tierColors = {
    'half': { stroke: '#ff5c4d', fill: 'rgba(255,92,77,0.15)' },
    'full': { stroke: '#b98aff', fill: 'rgba(185,138,255,0.15)' },
    'bush': { stroke: '#7ed957', fill: 'rgba(126,217,87,0.15)' },
    'tree': { stroke: '#4a7c2a', fill: 'rgba(74,124,42,0.15)' },
    'soft': { stroke: '#ffb454', fill: 'rgba(255,180,84,0.1)' },
    'barricade': { stroke: '#b5553f', fill: 'rgba(181,85,63,0.15)' },
    'mud': { stroke: '#8b7355', fill: 'rgba(139,115,85,0.1)' },
    'rock': { stroke: '#8a8a7a', fill: 'rgba(138,138,122,0.15)' },
    'water': { stroke: '#356885', fill: 'rgba(53,104,133,0.2)' },
    'river': { stroke: '#356885', fill: 'rgba(53,104,133,0.2)' },
    'ruined': { stroke: '#6b6b6b', fill: 'rgba(107,107,107,0.15)' },
    'intact': { stroke: '#b5553f', fill: 'rgba(181,85,63,0.15)' }
  };
  const colors = tierColors[cover.tier] || tierColors['rock'];

  // Draw edges
  ctx.strokeStyle = colors.stroke;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for(let i=0; i<limit; i++){
    const [ax, ay] = verts[i];
    const [bx, by] = verts[(i+1)%n];
    if(i===0) ctx.moveTo(ax, ay);
    else ctx.lineTo(ax, ay);
    ctx.lineTo(bx, by);
  }
  ctx.stroke();

  // Draw fill if closed
  if(isClosed){
    ctx.fillStyle = colors.fill;
    ctx.fill();
  }

  // Draw vertices
  verts.forEach((p,i)=>{
    const isSel = selectedCoverVertex && selectedCoverVertex.index === i;
    ctx.beginPath();
    ctx.arc(p[0], p[1], isSel ? 8 : 5, 0, Math.PI*2);
    ctx.fillStyle = isSel ? '#7ed957' : '#fff';
    ctx.fill();
    ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.stroke();
    if(isSel){
      ctx.fillStyle = '#7ed957';
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillText(`v${i}`, p[0] + 8, p[1] - 8);
    }
  });

  // Draw tier label
  if(isClosed && n >= 3){
    // Calculate centroid for label
    let cx = 0, cy = 0;
    verts.forEach(p => { cx += p[0]; cy += p[1]; });
    cx /= n; cy /= n;
    ctx.fillStyle = colors.stroke;
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.fillText(cover.tier.toUpperCase(), cx - 20, cy + 4);
  }
}
function render(){
  ctx.clearRect(0,0,canvas.clientWidth,canvas.clientHeight);
  drawGrid();
  trackPhase = (trackPhase + 0.6) % 1000; // steady rolling-track scroll across static re-renders

  const hc = hullCenter();
  const tc = turretCenter(); // 车体与座圈圆心（基础参考点）

  // centerline (mirror axis) reference
  ctx.strokeStyle = 'rgba(126,217,87,0.35)'; ctx.setLineDash([4,4]); ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(hc.x, hc.y); ctx.lineTo(hc.x+120*viewScale, hc.y); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(126,217,87,0.6)'; ctx.font='10px "JetBrains Mono", monospace';
  ctx.fillText('FRONT →', hc.x+124*viewScale, hc.y+4);

  const turretAngle = (mode==='preview') ? previewAngle : 0;
  // tracks under everything (animated scroll in preview via wall-clock time)
  const fullDetail = (mode==='preview');
  const partOpts = { active:false, detail: fullDetail, faded: !fullDetail };

  // 部件可见性：隐藏的部件（含履带/炮管等其附属视觉）不渲染
  // 精灵预览开时履带改用精灵贴图（对齐用），否则走程序化履带
  // #M1 绘制顺序（2026-10-08）：必须与局内 drawTank 同层级——履带 → 车体 → 炮塔 → 炮管。
  // 此前炮塔画在车体之前，车体的精灵贴图/程序化纹理/纯色填充整块盖住炮塔（用户实测反馈）。
  if(partVisible.hull){
    if(state.spritePreview && state.sprite.track.img) drawPreviewSpriteTracks();
    else drawDesignerTracks(fullDetail ? performance.now()*0.02 : trackPhase, viewScale);
  }
  if(partVisible.hull) drawPolygon(state.hull, hc, 0, Object.assign({ active: mode==='hull' }, partOpts));
  if(partVisible.turret){
    drawPolygon(state.turret, null, turretAngle, Object.assign({ active: mode==='turret' || mode==='pivot' }, partOpts));
    if(state.spritePreview) drawPreviewSpriteBarrel(turretAngle);
  }

  // 1. 车体上的炮塔座圈圆心 (pivot) 标记位置：
  const ringCenter = {
    x: hc.x + state.turret.pivot.dx * viewScale,
    y: hc.y + (state.turret.pivot.dy || 0) * viewScale
  };

  // 2. 炮塔上的炮塔座圈圆心 (axis) 标记位置 (以 turretToScreen 计算)：
  const ax = (state.turret.axis && state.turret.axis.dx) || 0;
  const ay = (state.turret.axis && state.turret.axis.dy) || 0;
  const axisPos = turretToScreen([ax, 0], turretAngle);

  // 绘制座圈圆心 / 旋转中心标记：
  ctx.beginPath(); ctx.arc(axisPos.x, axisPos.y, (mode==='pivot'||mode==='turret')?7:4, 0, Math.PI*2);
  ctx.strokeStyle = '#ffb454'; ctx.lineWidth=2; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(axisPos.x-9,axisPos.y); ctx.lineTo(axisPos.x+9,axisPos.y);
  ctx.moveTo(axisPos.x,axisPos.y-9); ctx.lineTo(axisPos.x,axisPos.y+9); ctx.stroke();
  ctx.fillStyle = '#ffb454'; ctx.font='10px "JetBrains Mono", monospace';
  ctx.fillText(mode==='turret' ? '炮塔座圈圆心 (x)' : '座圈圆心', axisPos.x+10, axisPos.y-10);
  
  if(mode==='turret' && partVisible.turret){
    ctx.strokeStyle = 'rgba(92,200,255,0.3)'; ctx.lineWidth=1; ctx.setLineDash([3,3]);
    ctx.beginPath(); ctx.arc(axisPos.x, axisPos.y, 16, 0, Math.PI*2); ctx.stroke();
    ctx.setLineDash([]);
  }

  // 绘制炮管与附件：全套绑定在 turretToScreen([frontX, 0], turretAngle) 上（炮塔隐藏时一并隐藏）
  if(partVisible.turret) drawDesignerBarrel(turretAngle, viewScale);

  // turret's OWN center (bbox center)
  if(mode==='turret' && partVisible.turret){
    const oc = turretOwnCenter();
    const cosA = Math.cos(turretAngle), sinA = Math.sin(turretAngle);
    const wpx = tc.x + (oc.cx*cosA - oc.cy*sinA)*viewScale;
    const wpy = tc.y + (oc.cx*sinA + oc.cy*cosA)*viewScale;
    const offLocal = Math.hypot(oc.cx - ax, oc.cy - ay);
    ctx.beginPath(); ctx.arc(wpx, wpy, 4, 0, Math.PI*2);
    ctx.strokeStyle = offLocal > 0.05 ? '#5cc8ff' : 'rgba(92,200,255,0.45)'; ctx.lineWidth=2; ctx.stroke();
    ctx.fillStyle = '#5cc8ff'; ctx.font='9px "JetBrains Mono", monospace';
    ctx.fillText('炮塔自身中心', wpx+8, wpy-6);
    if(offLocal > 0.05){
      ctx.setLineDash([3,3]); ctx.strokeStyle = 'rgba(92,200,255,0.5)'; ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(axisPos.x, axisPos.y); ctx.lineTo(wpx,wpy); ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // 射界限制射线：仅当射界 < 180° 时绘制（180° = 全向旋转，无限制）；炮塔隐藏时不绘制
  if(partVisible.turret && state.traverseLimit < 180){
    const limit = state.traverseLimit * Math.PI/180;
    ctx.strokeStyle = 'rgba(255,180,84,0.35)'; ctx.setLineDash([5,5]); ctx.lineWidth=1;
    ctx.beginPath();
    ctx.moveTo(axisPos.x, axisPos.y);
    ctx.lineTo(axisPos.x+Math.cos(limit)*90*viewScale, axisPos.y+Math.sin(limit)*90*viewScale);
    ctx.moveTo(axisPos.x, axisPos.y);
    ctx.lineTo(axisPos.x+Math.cos(-limit)*90*viewScale, axisPos.y+Math.sin(-limit)*90*viewScale);
    ctx.stroke(); ctx.setLineDash([]);
  }

  // 绘制掩体多边形（world坐标直接绘制，无镜像）
  if(mode === 'cover'){
    drawCoverPolygon(state.currentCover);
  }

  updateWeightReadout();
}

// ================= P-49 参数极限校验 + 派生重量联动（tank_model.js 单一数据源） =================
// 越界处理策略：「钳制到界限并提示」——数值参数即时钳回 [min,max]；几何顶点按 hullLen/hullWid/
// turLen/turWid 上限钳制包围盒；任何增重编辑使派生重量 ≥ 80t 时拦截增量（装甲厚度只允许设到
// 临界值，顶点移动回退、新增顶点撤销）。存量 JSON 载入不做追溯校验（applyTankData 原样消费）。
function designerSpec(){
  return {
    hull: { verts: buildFullVerts(state.hull.half),
            faces: buildFullFaces(state.hull.half, i=>getFace(state.hull.halfFaces,i), state.hull.frontSeamFace, state.hull.rearSeamFace),
            armor: state.hull.armor },
    turret: { verts: buildFullVerts(state.turret.half),
              faces: buildFullFaces(state.turret.half, i=>getFace(state.turret.halfFaces,i), state.turret.frontSeamFace, state.turret.rearSeamFace),
              armor: state.turret.armor }
  };
}
function derivedWeightT(){ return deriveWeight(designerSpec()); }
function limClamp(v, lim){ return Math.max(lim.min, Math.min(lim.max, v)); }
// 数值参数输入钳制：越界写回输入框并提示
function clampParamInput(id, limKey, label){
  const lim = RULES.parameterLimits[limKey];
  const el = document.getElementById(id);
  const v = parseFloat(el.value);
  if(!lim || Number.isNaN(v)) return v;
  const c = limClamp(v, lim);
  if(c !== v){
    el.value = Math.round(c*100)/100;
    pushHint(label+'='+v+' 超出参数极限，已钳制到 ['+lim.min+', '+lim.max+']', 2600);
  }
  return c;
}
// 重量闸门：保持其他参数不变，二分求某面装甲厚度在派生重量 ≤ 上限下的最大可用值
function maxArmorThicknessAtWeightCap(part, face){
  const cap = RULES.parameterLimits.weight.max;
  const cur = state[part].armor[face];
  const test = t => {
    state[part].armor[face] = t;
    const ok = derivedWeightT() <= cap + 1e-9;
    state[part].armor[face] = cur;
    return ok;
  };
  if(test(500)) return 500;
  let lo = 0, hi = 500;
  for(let i=0;i<30;i++){ const mid = (lo+hi)/2; if(test(mid)) lo = mid; else hi = mid; }
  return lo;
}
// 只读派生读数：派生重量 + 功重比（enginePower ÷ 派生重量，t 即内部值无换算）
function updateWeightReadout(){
  const dW = derivedWeightT();
  const wEl = document.getElementById('derivedWeightReadout');
  const pEl = document.getElementById('pwRatioReadout');
  const over = dW > RULES.parameterLimits.weight.max + 1e-9;
  if(wEl) wEl.textContent = dW.toFixed(1) + ' t' + (over ? ' ⚠ 超80t（存量数据，增重编辑将被拦截）' : '');
  if(pEl){
    const ep = state.enginePower || 0;
    pEl.textContent = (dW > 0 && ep > 0) ? (ep / dW).toFixed(1) + ' hp/t' : '—';
  }
  // P-49 属性耦合链只读读数：穿深/伤害 → 装填·三扩惩罚；车体尺寸 → 可用马力上限
  updateCouplingReadout();
}
function updateCouplingReadout(){
  const rEl = document.getElementById('reloadCouplingReadout');
  const sEl = document.getElementById('spreadCouplingReadout');
  const pEl = document.getElementById('powerCouplingReadout');
  const mEl = document.getElementById('moduleSizeFactorReadout');
  const c = deriveCoupledStats ? deriveCoupledStats(buildExport()) : null;
  if(c){
    if(rEl) rEl.textContent = '×' + c.reloadMultiplier.toFixed(3);
    if(sEl) sEl.textContent = '×' + c.spreadMultiplier.toFixed(3);
    const overPower = (state.enginePower||0) > c.maxAllowedEnginePower;
    if(pEl) pEl.textContent = c.maxAllowedEnginePower + ' hp' + (overPower ? ' ⚠ 当前马力超可用上限' : '');
    if(mEl){
      const sf = c.moduleSizeFactor || 1.0;
      const tag = sf < 0.95 ? '（宽敞）' : (sf > 1.05 ? '（紧凑）' : '（标准）');
      mEl.textContent = '×' + sf.toFixed(2) + ' ' + tag;
      mEl.style.color = sf <= 1.0 ? 'var(--green)' : 'var(--amber)';
    }
  }
}
// 顶点几何约束：按全形包围盒长/宽上限钳制（半形链 |y| 对称、x 共享）
function constrainVertex(part, idx, x, y){
  const lim = RULES.parameterLimits.geometry;
  const poly = state[part];
  const lenLim = part==='hull' ? lim.hullLen.max : lim.turLen.max;
  const widLim = (part==='hull' ? lim.hullWid.max : lim.turWid.max) / 2;
  let minX = Infinity, maxX = -Infinity;
  poly.half.forEach((p,i)=>{
    if(i === idx) return;
    if(p[0] < minX) minX = p[0];
    if(p[0] > maxX) maxX = p[0];
  });
  if(minX === Infinity){ minX = x; maxX = x; }
  x = Math.min(minX + lenLim, Math.max(maxX - lenLim, x));
  y = Math.min(0, Math.min(widLim, Math.max(-widLim, y)));
  return [Math.round(x*10)/10, Math.round(y*10)/10];
}
// 试探赋值：派生重量超上限 → 回退原坐标并提示（节流），返回是否接受
let weightGateHintAt = 0;
function acceptVertex(part, idx, pt){
  const prev = state[part].half[idx];
  state[part].half[idx] = pt;
  if(derivedWeightT() > RULES.parameterLimits.weight.max + 1e-9){
    state[part].half[idx] = prev;
    const now = performance.now();
    if(now - weightGateHintAt > 800){
      weightGateHintAt = now;
      pushHint('已达 80t 设计上限 — 该编辑会继续增加派生重量，已被拦截', 2200);
    }
    return false;
  }
  return true;
}

// ================= export / import =================
function buildExport(){
   return {
     id: state.id,
     traverseLimit: state.traverseLimit,
     maxSpeed: state.maxSpeed,
     turnRate: state.turnRate,
     turretTurnRate: state.turretTurnRate,
     weight: state.weight || 300,
     enginePower: state.enginePower || 900,
     hp: state.hp,
     penetration: state.penetration,
     damage: state.damage,
     reload: state.reload,
     shellSpeed: state.shellSpeed || 1200,
     heightClass: state.heightClass,
     trackWidth: state.trackWidth,
     trackOffset: state.trackOffset,
     spreadMult: state.spreadMult,
     aimSpeed: state.aimSpeed,
     texture: state.texture,
     // 整车精灵：enabled 控制局内是否替换程序化绘制；preview 标志不写入（设计器本地）
     // #L3：以 state.sprite 的对象为底做浅拷贝（保留 imgHummel/imgPanzerIV/lenPxPanzerIV 等
     // 本面板未管理的额外键），再覆盖面板管理的字段；hull/turret/track 均对称写出 pivot/rot。
     sprite: (() => {
       const s = state.sprite;
       const part = (src) => Object.assign({}, src);
       return {
         enabled: !!s.enabled,
         track: Object.assign(part(s.track), { img: s.track.img, scale: s.track.scale, dx: s.track.dx, dy: s.track.dy, rot: s.track.rot || 0 }),
         hull: Object.assign(part(s.hull), { img: s.hull.img, scale: s.hull.scale, dx: s.hull.dx, dy: s.hull.dy, rot: s.hull.rot }),
         turret: Object.assign(part(s.turret), { img: s.turret.img, scale: s.turret.scale, dx: s.turret.dx, dy: s.turret.dy, rot: s.turret.rot, pivot: [s.turret.pivot[0], s.turret.pivot[1]] }),
         barrel: Object.assign(part(s.barrel), {
           mountDx: s.barrel.mountDx, mountDy: s.barrel.mountDy, embed: s.barrel.embed,
           scaleMult: s.barrel.scaleMult, gap: s.barrel.gap,
           imgStandard: s.barrel.imgStandard, imgAutocannon: s.barrel.imgAutocannon, imgRailgun: s.barrel.imgRailgun
         })
       };
     })(),
     barrel: {
       len: state.barrel.len,
       width: state.barrel.width,
       muzzle: state.barrel.muzzle,
       evac: { style: state.barrel.evac.style, pos: state.barrel.evac.pos },
       jacket: { len: state.barrel.jacket.len, pos: state.barrel.jacket.pos },
       mantlet: { style: state.barrel.mantlet.style, pos: state.barrel.mantlet.pos, width: state.barrel.mantlet.width }
     },
      hull: {
        verts: buildFullVerts(state.hull.half),
        faces: buildFullFaces(state.hull.half, i=>getFace(state.hull.halfFaces,i), state.hull.frontSeamFace, state.hull.rearSeamFace),
        armor: state.hull.armor
      },
        turret: {
        verts: buildFullVerts(state.turret.half),
        faces: buildFullFaces(state.turret.half, i=>getFace(state.turret.halfFaces,i), state.turret.frontSeamFace, state.turret.rearSeamFace),
        armor: state.turret.armor,
        pivot: { dx: state.turret.pivot.dx, dy: 0 },
        // axis = 炮塔自身旋转中心（旋转轴在炮塔几何内的位置）：网格顶点按原样导出、axis 实时写入，
        // 导入时不再做 -axis 平移（见 applyTankData），round-trip 恒稳定、无漂移。
        axis: { dx: state.turret.axis.dx || 0, dy: state.turret.axis.dy || 0 }
      },
   };
}
document.getElementById('tankListSaveBtn').addEventListener('click', ()=>{
  saveToTankList();
});
function applyTankData(data, opts){
  opts = opts || {};
  state.id = data.id ?? state.id;
  state.traverseLimit = data.traverseLimit ?? 180;
  state.maxSpeed = data.maxSpeed ?? state.maxSpeed;
  state.turnRate = data.turnRate ?? state.turnRate;
  state.turretTurnRate = data.turretTurnRate ?? state.turretTurnRate;
  state.weight = data.weight ?? 300;
  state.enginePower = data.enginePower ?? 900;
  state.hp = data.hp ?? state.hp;
  state.penetration = data.penetration ?? state.penetration;
  state.damage = data.damage ?? state.damage;
  state.reload = data.reload ?? state.reload;
  state.shellSpeed = data.shellSpeed ?? 1200;
  state.heightClass = data.heightClass ?? state.heightClass;
  if(data.hull){
    if(data.hull.half){
      state.hull = { half:data.hull.half, halfFaces:data.hull.halfFaces.slice(),
        frontSeamFace:data.hull.frontSeamFace||'front', rearSeamFace:data.hull.rearSeamFace||'rear',
        armor: Object.assign({front:110,side:38,rear:26}, data.hull.armor) };
      recenterPoly(state.hull);
    } else {
      const h = halfFromFull(data.hull.verts, data.hull.faces);
      state.hull = Object.assign(h, { armor: Object.assign({front:110,side:38,rear:26}, data.hull.armor) });
      recenterPoly(state.hull);
    }
  }
     if(data.turret){
       // pivot is locked to the centerline: only dx is editable, dy forced to 0
       const pivot = { dx: (data.turret.pivot && data.turret.pivot.dx !== undefined) ? data.turret.pivot.dx : 8, dy:0 };
       // turret.axis = 炮塔自身旋转中心（旋转轴在炮塔几何帧内的坐标，dx/dy 均可自由设置），
       // 与车体上的 pivot（座圈圆心锚点）分开。几何顶点按原样导入（不做 -axis 平移），
       // 绘制时由 turretDrawCenter() 偏移，保证设计器画面 == 运行时（tank_model.js 同款渲染）。
       const ax = (data.turret.axis && data.turret.axis.dx) || 0;
       const ay = (data.turret.axis && data.turret.axis.dy) || 0;
       let fullVerts, fullFaces;
       if(data.turret.verts && data.turret.faces){
         fullVerts = data.turret.verts;
         fullFaces = data.turret.faces;
       } else if(data.turret.half){
         fullVerts = buildFullVerts(data.turret.half);
         fullFaces = buildFullFaces(data.turret.half, i=>getFace(data.turret.halfFaces,i), data.turret.frontSeamFace||'front', data.turret.rearSeamFace||'rear');
       } else {
         fullVerts = buildFullVerts(state.turret.half);
         fullFaces = buildFullFaces(state.turret.half, i=>getFace(state.turret.halfFaces,i), state.turret.frontSeamFace, state.turret.rearSeamFace);
       }
        const h = halfFromFull(fullVerts, fullFaces);
        state.turret = Object.assign(h, { armor: Object.assign({front:140,side:50,rear:24}, data.turret.armor), pivot, axis: { dx: ax, dy: ay } });
     }
   if(data.barrel) state.barrel = normalizeBarrel(data.barrel);
   if(data.trackWidth !== undefined) state.trackWidth = data.trackWidth;
   if(data.trackOffset !== undefined) state.trackOffset = data.trackOffset;
   if(data.texture !== undefined && ['none','armor_plate','weld_seam','rust','camo','camo_dunkelgelb','paint_panzergrau','camo_nato','paint_soviet'].includes(data.texture)) state.texture = data.texture;
   else state.texture = 'none'; // 旧数据缺省无纹理
   state.sprite = normalizeSprite(data.sprite); // 整车精灵（无则默认关闭）
   preloadSpriteImages(); // #M2：载入即预热贴图缓存 + onload 重绘，防「首帧未就绪永远空白」
   if(data.spreadMult !== undefined) state.spreadMult = data.spreadMult;
   if(data.aimSpeed !== undefined) state.aimSpeed = data.aimSpeed;
   document.getElementById('trackWidthInput').value = state.trackWidth || 8;
   document.getElementById('trackOffsetInput').value = state.trackOffset || 0;
   document.getElementById('textureSelect').value = state.texture;
   syncSpriteInputs();
   document.getElementById('t-spreadMult').value = state.spreadMult;
   document.getElementById('t-aimSpeed').value = state.aimSpeed;
   updateTrackRanges();
   document.getElementById('t-id').value = state.id;
   document.getElementById('t-traverse').value = state.traverseLimit;
   document.getElementById('t-maxSpeed').value = state.maxSpeed;
   document.getElementById('t-turnRate').value = state.turnRate;
   document.getElementById('t-turretTurnRate').value = state.turretTurnRate;
   document.getElementById('t-weight').value = state.weight;
   document.getElementById('t-enginePower').value = state.enginePower;
   document.getElementById('t-hp').value = state.hp;
   document.getElementById('t-penetration').value = state.penetration;
   document.getElementById('t-damage').value = state.damage;
   document.getElementById('t-reload').value = state.reload;
   document.getElementById('t-shellSpeed').value = state.shellSpeed;
   document.getElementById('t-heightClass').value = state.heightClass;
   clearSelection();
   syncArmorInputsFromState();
   document.getElementById('barrelLen').value = state.barrel.len;
   document.getElementById('barrelWidth').value = state.barrel.width;
   document.getElementById('barrelMuzzle').value = state.barrel.muzzle;
   document.getElementById('barrelEvacStyle').value = state.barrel.evac.style;
   document.getElementById('barrelEvac').value = state.barrel.evac.pos;
   document.getElementById('jacketLen').value = state.barrel.jacket.len;
   document.getElementById('jacketPos').value = state.barrel.jacket.pos;
   document.getElementById('mantletPreset').value = state.barrel.mantlet.style;
   document.getElementById('mantletPos').value = state.barrel.mantlet.pos;
   document.getElementById('mantletWid').value = state.barrel.mantlet.width;
   // find matching preset to highlight it
   let matchedPreset = '';
   for(const k in BARREL_PRESETS){
      const p = BARREL_PRESETS[k];
      if(p.len===state.barrel.len && p.width===state.barrel.width && p.muzzle===state.barrel.muzzle &&
         p.evac.style===state.barrel.evac.style && p.evac.pos===state.barrel.evac.pos &&
         p.jacket.len===state.barrel.jacket.len && p.jacket.pos===state.barrel.jacket.pos){
         matchedPreset = k; break;
      }
   }
   document.getElementById('barrelPreset').value = matchedPreset;
   // 旧数据若携带 modules 字段（线段挂载模块体系已废除）：静默忽略，不报错、不写入 state
   render(); renderEdgeLists();
}

// ================= tanks/ I/O（一型一文件，js/tank_listio.js） =================
// 数据源 = tanks/ 目录（与 MVP/compare 同源），经 GET /api/tanks 聚合读取；
// 保存 = POST /api/tanks/<id> 单文件写；删除 = DELETE /api/tanks/<id>；
// 服务器不可用时降级下载 <id>.json 供手动放入 tanks/。
let tankListCache = null;
function populateTankListSelect(list){
  const sel = document.getElementById('tankListSelect');
  sel.innerHTML = '';
  const added = new Set();
  Object.keys(list).forEach(k=>{
    const opt = document.createElement('option');
    opt.value = k;
    opt.textContent = k;
    sel.appendChild(opt);
    added.add(k);
  });
  // 当前设计（含未保存的新坦克）始终出现在下拉里，避免与列表不一致造成混淆
  if(!added.has(state.id) && state.id){
    const opt = document.createElement('option');
    opt.value = state.id;
    opt.textContent = state.id + ' (未保存)';
    sel.appendChild(opt);
  }
  if(sel.options.length) sel.value = state.id;
}
// 载入 tanks/ 列表（带缓存），首次进入后直接复用。init / load 按钮 / 保存流程共用。
function loadTankListAll(then){
  if(tankListCache){ then(tankListCache); return; }
  fetchTankList(list => { tankListCache = list; then(list); });
}
function loadTankFromList(key){
  if(!tankListCache || !tankListCache[key]) return false;
  try{ applyTankData(tankListCache[key]); return true; }catch(e){ alert('载入失败: '+e.message); return false; }
}
document.getElementById('tankListLoadBtn').addEventListener('click', ()=>{
  const key = document.getElementById('tankListSelect').value;
  loadTankListAll(list=>{
    if(list && list[key]) loadTankFromList(key);
    else pushHint('请先点击「载入」刷新列表，或该条目不存在');
  });
});
document.getElementById('tankListSaveBtn').addEventListener('click', ()=>{
  saveToTankList();
});
document.getElementById('tankListNewBtn').addEventListener('click', ()=>{
  // fresh default design with a unique id — user renames it via 名称 框 then hits 保存 to add it.
  const base = state.id === 'new_tank' ? 'new_tank' : state.id.replace(/_\d+$/, '');
  let n = 1; let candidate = base + '_1';
  while(tankListCache && tankListCache[candidate]){ n++; candidate = base + '_' + n; }
  applyTankData({
    id: candidate,
    traverseLimit: 180,
    maxSpeed: 120, turnRate: 2.0, turretTurnRate: 2.2,
    hp: 100, penetration: 120, damage: 34, reload: 1.3, heightClass: 'medium',
    barrel: { len:120, width:18, muzzle:'none', evac:{ style:'ring', pos:30 }, jacket:{ len:0, pos:45 } }
    // no hull/turret keys => keeps designer default shapes
  });
  populateTankListSelect(tankListCache || {});
  pushHint('已新建坦克 "'+candidate+'" — 已在顶部下拉选中，编辑后在名称框改好名字，点击「保存」即添加到列表');
});
document.getElementById('tankListDeleteBtn').addEventListener('click', ()=>{
  const key = document.getElementById('tankListSelect').value;
  if(!tankListCache){ pushHint('尚未载入 tanks/ 列表'); return; }
  if(!(key in tankListCache)){ pushHint('列表中没有该条目'); return; }
  if(!confirm(`从 tanks/ 中删除「${key}」？`)) return;
  delete tankListCache[key];
  populateTankListSelect(tankListCache);

  deleteTank(key, ok => {
    if(ok) pushHint(`已从 tanks/ 删除 ${key}.json`);
    else pushHint(`服务器删除失败 — 请手动删除 tanks/${key}.json`);
  });
});
function saveToTankList(){
  const out = buildExport();
  if(tankListCache){ tankListCache[out.id] = out; populateTankListSelect(tankListCache); }
  // 单文件原子写（POST /api/tanks/<id>）；失败降级下载单条目
  saveTankEntry(out.id, out, ok => {
    if(ok){
      pushHint(`已保存 tanks/${out.id}.json`);
    } else {
      downloadTankFile(out.id, out);
      pushHint(`服务器保存失败，已下载 ${out.id}.json — 请手动放入 tanks/ 目录`);
    }
  });
}

// ================= init =================
syncArmorInputsFromState();
document.getElementById('barrelEvacStyle').value = state.barrel.evac.style;
document.getElementById('barrelEvac').value = state.barrel.evac.pos;
document.getElementById('jacketLen').value = state.barrel.jacket.len;
document.getElementById('jacketPos').value = state.barrel.jacket.pos;
document.getElementById('mantletPreset').value = state.barrel.mantlet.style;
document.getElementById('mantletPos').value = state.barrel.mantlet.pos;
document.getElementById('mantletWid').value = state.barrel.mantlet.width;
document.getElementById('trackWidthInput').value = state.trackWidth;
document.getElementById('textureSelect').value = state.texture;
syncSpriteInputs();
updateTrackRanges();
setMode('hull');
updateZoomReadout();
// 预先载入 tanks/ 列表，让顶部「坦克列表」下拉立即可用。
loadTankListAll(list=>{ if(list) populateTankListSelect(list); });
resize();
renderEdgeLists();
})();
