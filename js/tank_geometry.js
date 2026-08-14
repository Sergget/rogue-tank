'use strict';

const ARMOR = RULES.defaultArmor || {
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

// partCorners & partEdges are provided globally by tank_utils.js

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
    // 体内发射（ISSUES #18）：原点在部件多边形内部/贴边时，取「进入边」为命中面——
    // 即射线沿反向穿出多边形的边（t≤0.001 且 d·n<0，|t| 最小者）。炮口伸入敌方
    // 车体时弹丸出生点已在装甲内侧，若不恢复进入边，只会命中远侧出射边（正面贴脸
    // 被结算成后部模块：弹药架/发动机/车长，等效厚度与跳弹法线全错）。
    // 原点是否在体内的判定用「出射边距离」：出射边（d·n>0）须在 ≥0.001 前方——
    // 跳弹后弹丸贴面外飞（原点恰在出射边上、t≈0）不会误触发，直接继续飞行。
    let entry = null;
    let exitT = Infinity;
    for(const e of edges){
      const hit = segRayIntersect(ox,oy,dx,dy, e.a.x,e.a.y, e.b.x,e.b.y);
      if(!hit) continue;
      const dn = dx*e.nx + dy*e.ny;
      if(hit.t > 0.001){
        if(!best || hit.t < best.t){
          best = { t:hit.t, s:hit.s, edge:e };
        }
      } else if(hit.t <= 0.001 && dn < 0){
        // 进入边候选：t≤0.001 的交点中，射线沿外法线反向进入（d·n<0）且最靠近原点者
        if(!entry || hit.t > entry.t){
          entry = { t:hit.t, s:hit.s, edge:e };
        }
      } else if(dn > 0 && hit.t < exitT){
        exitT = hit.t;   // 出射边候选（全部 d·n>0 交点中最小者；位置不限）
      }
    }
    if(entry && exitT >= 0.001){
      // 原点确在多边形内部（或恰贴进入边向内入射）→ 命中进入边：t 归零表示弹丸当前
      // 已与该面接触（逐帧窗口/整条射线窗口都按"本位置即命中"处理），位置取进入点
      // （炮管贯穿装甲的真实交点，模块归属/特效/入射角都按该面结算）。
      const px = ox+dx*entry.t, py = oy+dy*entry.t;
      hits.push({ part:p.key, edgeName:entry.edge.name, faceKey:entry.edge.faceKey,
                  nx:entry.edge.nx, ny:entry.edge.ny, s:entry.s, x:px, y:py, t:0, inside:true });
    } else if(best){
      const px = ox+dx*best.t, py = oy+dy*best.t;
      hits.push({ part:p.key, edgeName:best.edge.name, faceKey:best.edge.faceKey, nx:best.edge.nx, ny:best.edge.ny, s:best.s, x:px, y:py, t:best.t });
    }
  }
  return hits.length > 0 ? hits : null;
}

// 多部位命中时选择"本步长内唯一生效"的命中：
// 炮塔是车体上层的独立构件，同一条弹道先后穿过同一平面覆盖区时炮塔应优先被命中；
// 未命中炮塔时取最靠近的第一处命中。minT/maxT 限定在炮弹以 step 推进的区间内。
// inside 命中（ISSUES #18 体内发射恢复的进入边，t=0）视为本位置即接触：不受 minT 排除。
function bestTankHit(hits, minT, maxT){
  if(!hits) return null;
  const cand = hits.filter(function(h){ return (h.t > (minT||0.001) || h.inside) && h.t <= (maxT === undefined ? Infinity : maxT); });
  if(cand.length === 0) return null;
  const tur = cand.filter(function(h){ return h.part === 'turret'; });
  if(tur.length){
    tur.sort(function(a,b){ return a.t - b.t; });
    return tur[0];
  }
  cand.sort(function(a,b){ return a.t - b.t; });
  return cand[0];
}

// 鼠标径向部位选择（玩家意图）：沿无散布瞄准线把鼠标投影到炮口同线上，
// 与目标最近命中距离比较——更远 → 'turret'（上部），更近 → 'hull'，死区内 → 'auto'。
// hits 来自 raycastTank（每个部位一条最近命中）；margin 为死区半径（px）。
function aimPartPreference(ox, oy, ux, uy, mouseX, mouseY, hits, margin){
  if(!hits) return 'auto';
  let tNear = Infinity;
  for(const h of hits){ if(h.t < tNear) tNear = h.t; }
  if(!isFinite(tNear)) return 'auto';
  const mt = (mouseX - ox) * ux + (mouseY - oy) * uy;
  if(mt > tNear + margin) return 'turret';
  if(mt < tNear - margin) return 'hull';
  return 'auto';
}

// 按偏好选择命中部位：pref='hull' 且存在车体命中 → 取车体；其余（含 'auto'）保持炮塔优先。
// 与 bestTankHit 的差异仅在有两条命中（车体+炮塔）时的取舍；'auto' 即为原默认行为。
function bestHitForPref(hits, minT, maxT, pref){
  if(!hits) return null;
  const cand = hits.filter(function(h){ return (h.t > (minT||0.001) || h.inside) && h.t <= (maxT === undefined ? Infinity : maxT); });
  if(cand.length === 0) return null;
  const tur = cand.filter(function(h){ return h.part === 'turret'; });
  const hu  = cand.filter(function(h){ return h.part === 'hull'; });
if(pref === 'hull' && hu.length) return hu[0];
  if(tur.length) return tur[0];
  return cand[0];
}

// 实弹逐帧命中判定（与预测面板/半高掩体判决同源）：本帧先探测是否与目标相触
// （任一部位进入步长窗口 (0.001, step]）；相触后 pref='turret'/'hull' 沿整条射线
// （Infinity 窗口）选择，避免"车体面先入窗而炮塔面在窗外"截胡明确意图
// （正对入射时车体→炮塔沿射线间距约 17px，高刷屏/dt 抖动/慢弹速下 step < 间距即触发，
// 见 ISSUES #14）；'auto' 保持旧逐帧窗口行为——窗口内炮塔优先，否则取最近命中。
function shellPartHit(hits, step, pref){
  if(!hits) return null;
  // inside 命中（体内发射恢复的进入边，t=0）：弹丸当前已在接触面上 → 相触成立
  const contact = hits.some(function(h){ return h.t <= step && (h.inside || h.t > 0.001); });
  if(!contact) return null;
  if(pref && pref !== 'auto') return bestHitForPref(hits, 0.001, Infinity, pref);
  return bestHitForPref(hits, 0.001, step, 'auto');
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

// ================= 线段挂载模块系统（设计器「模块 Modules」编辑） =================
// 扁平 6 类模块（RULES.modules.keys；履带 track 不在其中——履带碰撞盒由车体极前/极后端
// 自动派生，见 moduleFromHit 的 trackBound 判定），每类可挂载多处；每处放置挂在一条车体/炮塔
// 全形边（含前/后接缝边与跨中轴镜像伙伴）上：
//   - p.x / p.y   = 所挂边中点（主边）的作者帧坐标（turret 作者帧 = 导出帧，含 axis 偏移前）
//   - p.len       = 模块沿该边覆盖的长度比例，∈[lenMin,1]
//   - p.off       = 带中心相对边中点的沿边偏移比例：带中心位置 c = 0.5+off，off ∈ [±(1-len)/2]
//   - p.mirror    = 是否同时生成跨中轴镜像伙伴边的带（false = 仅主边单侧）
// 边匹配容差 0.5（设计器保存时中点已 0.1 取整，round-trip 恒稳定）。
const MODULE_MATCH_TOL = 0.5;
const MOD_EPS = 1e-4;

// 结构清洗：扁平格式 { key: [placement, ...] }；旧 v2 格式（{hull:{key:{x,y,len}}, turret:{...}}）
// 迁移为扁平放置（off=0、mirror=true，坐标帧同导出帧）。
// x/y 0.1 取整，len/off 0.01 取整并钳制；只保留 RULES.modules.keys 已知键。
// null/undefined/非对象 → null（旧数据无 modules 字段必须得到 null，moduleFromHit 走 zones 退化）。
function normalizeTankModules(m){
  if(!m || typeof m !== 'object' || Array.isArray(m)) return null;
  const MOD = RULES.modules;
  const LEN_MIN = (MOD && MOD.lenMin !== undefined) ? MOD.lenMin : 0.05;
  const r10 = v => Math.round(v*10)/10;
  const r100 = v => Math.round(v*100)/100;
  const clean = (p, part) => {
    if(!p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.len)) return null;
    const len = Math.max(LEN_MIN, Math.min(1, p.len));
    // off 先四舍五入到 0.01 再钳制到「lim 的 0.01 步进下界」：lim 本身可能不可用 0.01 表示
    // （如 len=0.35 → lim=0.325），先钳后舍会得到 0.33 > lim 的越界值（2026-08-12 修复）
    const lim = (1-len)/2;
    const offMax = Math.floor(lim*100 + 1e-9)/100;
    const offRaw = Number.isFinite(p.off) ? Math.round(p.off*100)/100 : 0;
    const off = Math.max(-offMax, Math.min(offMax, offRaw));
    return { part, x: r10(p.x), y: r10(p.y), len: r100(len), off, mirror: p.mirror !== false };
  };
  const FLAT = (MOD && Array.isArray(MOD.keys)) ? MOD.keys : [];
  const out = {};
  for(const key of FLAT){
    const src = m[key];
    if(!Array.isArray(src)) continue;
    const list = src.map(p => clean(p, (p && (p.part==='hull'||p.part==='turret')) ? p.part : 'hull')).filter(Boolean);
    if(list.length) out[key] = list;
  }
  // 旧 v2 格式迁移：仅当扁平键一个都没有、且存在 hull/turret 分区对象时触发
  if(!Object.keys(out).length &&
     ((m.hull && typeof m.hull === 'object' && !Array.isArray(m.hull)) ||
      (m.turret && typeof m.turret === 'object' && !Array.isArray(m.turret)))){
    const LEG = (MOD && MOD.legacyPartKeys) || {};
    for(const part of ['hull','turret']){
      const src = m[part];
      if(!src || typeof src !== 'object' || Array.isArray(src)) continue;
      for(const key of (LEG[part] || [])){
        const c = clean(src[key], part);
        if(c) (out[key] = out[key] || []).push(c);
      }
    }
  }
  return Object.keys(out).length ? out : null;
}

// 凸四边形内含判定（四边叉积同号；边界算命中）
function pointInQuad(px, py, quad){
  const n = quad.length;
  if(n < 3) return false;
  let sign = 0;
  for(let i=0;i<n;i++){
    const A = quad[i], B = quad[(i+1)%n];
    const cross = (B[0]-A[0])*(py-A[1]) - (B[1]-A[1])*(px-A[0]);
    if(Math.abs(cross) < 1e-9) continue;
    const s = cross > 0 ? 1 : -1;
    if(sign === 0) sign = s;
    else if(sign !== s) return false;
  }
  return true;
}

// 生成单条全形边的模块带形四边形 [A2, B2, B2+in, A2+in]（作者帧坐标）：
// 边按 len 以"带中心 c=0.5+off"为对称中心收窄（off 为沿边偏移比例），再沿"指向质心的
// 内法线"平移 bandDepth。quad 为顶点数组。
function moduleBandForEdge(verts, edgeIdx, gx, gy, len, depth, off){
  const n = verts.length;
  const A = verts[edgeIdx], B = verts[(edgeIdx+1)%n];
  const o = Number.isFinite(off) ? Math.max(-0.5, Math.min(0.5, off)) : 0;
  const c = 0.5 + o;
  const shiftA = Math.max(0, c - len/2);
  const shiftB = Math.min(1, c + len/2);
  const A2 = [A[0]+(B[0]-A[0])*shiftA, A[1]+(B[1]-A[1])*shiftA];
  const B2 = [B[0]+(A[0]-B[0])*(1-shiftB), B[1]+(A[1]-B[1])*(1-shiftB)];
  const ex = B[0]-A[0], ey = B[1]-A[1];
  const c1x = ey, c1y = -ex;
  const c2x = -ey, c2y = ex;
  const mx = (A[0]+B[0])/2, my = (A[1]+B[1])/2;
  const out1 = c1x*(mx-gx) + c1y*(my-gy);
  const nx = out1 >= 0 ? -c1x : -c2x;   // 取反 = 指向质心（向内）
  const ny = out1 >= 0 ? -c1y : -c2y;
  const l = Math.hypot(nx, ny) || 1;
  const ix = nx/l*depth, iy = ny/l*depth;
  return [ [A2[0],A2[1]], [B2[0],B2[1]], [B2[0]+ix,B2[1]+iy], [A2[0]+ix,A2[1]+iy] ];
}

// 查找全形边 edgeIdx 的跨中轴镜像伙伴边（逐点镜像，容差 1e-4）；边自身在中轴线上 → -1
function findMirrorEdge(verts, edgeIdx){
  const n = verts.length;
  const A = verts[edgeIdx], B = verts[(edgeIdx+1)%n];
  if(Math.abs(A[1]) < MOD_EPS && Math.abs(B[1]) < MOD_EPS) return -1;
  for(let j=0;j<n;j++){
    const C = verts[j], D = verts[(j+1)%n];
    const m1 = Math.abs(C[0]-A[0])<MOD_EPS && Math.abs(C[1]+A[1])<MOD_EPS &&
               Math.abs(D[0]-B[0])<MOD_EPS && Math.abs(D[1]+B[1])<MOD_EPS;
    const m2 = Math.abs(C[0]-B[0])<MOD_EPS && Math.abs(C[1]+B[1])<MOD_EPS &&
               Math.abs(D[0]-A[0])<MOD_EPS && Math.abs(D[1]+A[1])<MOD_EPS;
    if(m1 || m2) return j;
  }
  return -1;
}

// 模块的带形集合（主边 + 可选镜像伙伴边各一条；顶点帧为模块所在帧）。
// `axis` 为模块帧相对顶点帧的偏移（战斗端 turret 传 tank.turretAxis，hull/设计器传 {0,0}）：
// 顶点帧边中点回推成作者帧中点后与 m.x/m.y 匹配（±0.5）。**先做直接匹配**（保持放置的
// 原始侧别，mirror=false 单侧放置不跳边），无直接匹配再回退跨轴镜像匹配（旧 y>0 数据/axis 偏移）。
// mirror=false 时仅主边一条带。返回四边形数组（每条带 = 4 个 [x,y]）。
function findModuleBands(verts, m, axis, depth){
  const bands = [];
  if(!verts || verts.length < 3 || !m || !Number.isFinite(m.x) || !Number.isFinite(m.y) || !(m.len > 0)) return bands;
  const ax = (axis && axis.dx) || 0, ay = (axis && axis.dy) || 0;
  const n = verts.length;
  const len = Math.max(0, Math.min(1, m.len));
  const off = Number.isFinite(m.off) ? Math.max(-(1-len)/2, Math.min((1-len)/2, m.off)) : 0;
  const gx = verts.reduce((s,v)=>s+v[0],0)/n, gy = verts.reduce((s,v)=>s+v[1],0)/n;
  const edgeMid = i => {
    const A = verts[i], B = verts[(i+1)%n];
    return { mx: (A[0]+B[0])/2 + ax, my: (A[1]+B[1])/2 + ay };
  };
  let mi = -1;
  for(let i=0;i<n;i++){
    const { mx, my } = edgeMid(i);
    if(Math.abs(mx - m.x) <= MODULE_MATCH_TOL && Math.abs(my - m.y) <= MODULE_MATCH_TOL){ mi = i; break; }
  }
  if(mi < 0){
    for(let i=0;i<n;i++){
      const { mx, my } = edgeMid(i);
      if(Math.abs(mx - m.x) <= MODULE_MATCH_TOL && Math.abs(my + m.y) <= MODULE_MATCH_TOL){ mi = i; break; }
    }
  }
  if(mi < 0) return bands;
  bands.push(moduleBandForEdge(verts, mi, gx, gy, len, depth, off));
  if(m.mirror !== false){
    const j = findMirrorEdge(verts, mi);
    if(j >= 0){
      // 镜像伙伴带 = 主带沿 y=0 轴的真镜像：伙伴边在链中反向遍历（镜像点沿边参数 = 1-t），
      // off 若原样复用到伙伴边会把「镜像」变成「中心对称」（带朝反方向移动）。
      bands.push(bands[0].map(pt => [pt[0], -pt[1]]));
    }
  }
  return bands;
}

function moduleLabelOf(key){
  const L = RULES.modules && RULES.modules.labels;
  return (L && L[key]) || key;
}

// 模块键允许挂载的部件（语义分类，来自 RULES.modules.legacyPartKeys）：
// driver/engine/track → hull；gunner/loader/commander → turret；ammo → 两者皆可（v2 双放置）。
// 设计器挂载与保存校验共用；未知键 → []。
function moduleAllowedParts(key){
  const LEG = (RULES.modules && RULES.modules.legacyPartKeys) || {};
  const parts = [];
  for(const part of ['hull','turret']){
    const list = LEG[part] || [];
    if(list.indexOf(key) >= 0) parts.push(part);
  }
  return parts;
}

function hasPlacedModules(mods){
  for(const k in mods){
    const v = mods[k];
    if(Array.isArray(v) ? v.length > 0 : !!v) return true;
  }
  return false;
}

// 扁平 modules 中是否存在挂在该部件（hull/turret）上的放置
function hasModulePlacementsOn(mods, part){
  if(!mods) return false;
  for(const k in mods){
    const arr = mods[k];
    if(!Array.isArray(arr)) continue;
    for(const p of arr){ if(p && p.part === part) return true; }
  }
  return false;
}

// 局部帧命中点 → 覆盖该点的模块（取 len 最小者，细分模块优先；同 len 保持 keys 顺序）。
// `mods` 为扁平 { key: [placement, ...] }；placement.part 需与 `part` 匹配。
// 无覆盖 → null（调用方回落到结构性 fallback）。
function moduleHitFromBands(verts, mods, part, axis, depth, rx, ry){
  if(!verts || verts.length < 3) return null;
  const MODS = RULES.modules || {};
  const keys = (MODS.keys && Array.isArray(MODS.keys)) ? MODS.keys : Object.keys(mods);
  let best = null, bestLen = Infinity;
  for(const key of keys){
    const list = Array.isArray(mods[key]) ? mods[key] : null;
    if(!list) continue;
    for(const m of list){
      if(!m || (m.part && m.part !== part) || !Number.isFinite(m.x) || !Number.isFinite(m.y) || !(m.len > 0)) continue;
      const bands = findModuleBands(verts, m, axis, depth);
      for(const quad of bands){
        if(pointInQuad(rx, ry, quad)){
          if(m.len < bestLen){ bestLen = m.len; best = key; }
          break;
        }
      }
    }
  }
  return best ? { key: best, label: moduleLabelOf(best) } : null;
}

function moduleFromHit(tank, hit){
  const Z = RULES.modules.zones;
  const MODS = RULES.modules;
  if(hit.part==='turret'){
    // 线段挂载模块：命中点转炮塔局部帧（与 turretSpec.verts 同帧），逐模块逐带判定；
    // 无覆盖 → 上部结构装甲（结构性 fallback，不再走 zones 分区）。
    if(tank.modules && hasModulePlacementsOn(tank.modules, 'turret')){
      const p = turretPivot(tank);
      const rel = rotate(hit.x - p.x, hit.y - p.y, -superstructureAngle(tank));
      const hitMod = moduleHitFromBands(
        tank.turretSpec && tank.turretSpec.verts, tank.modules, 'turret',
        tank.turretAxis || { dx:0, dy:0 }, MODS.bandDepth.turret, rel.x, rel.y);
      if(hitMod) return hitMod;
      return {key:'turretHull', label:'上部结构装甲'};
    }
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
    // 履带碰撞盒：恒为车体极前/极后端（现有履带模型沿车体全长，其前后端即车体两端），
    // 无需挂载 track 模块——2026-08-12 设计决策（roguelike 简化：机制由规则自动派生）。
    if(Math.abs(rel.x/halfL) > Z.trackBound) return {key:'track', label:'履带/负重轮'};
  }
  if(tank.modules && hasModulePlacementsOn(tank.modules, 'hull')){
    // 线段挂载模块：命中点转车体局部帧（与 hullSpec.verts 同帧）；无覆盖 → 结构性 fallback
    // （侧面装甲 / 发动机舱 / 正面装甲）。
    const rel = rotate(hit.x - tank.x, hit.y - tank.y, -tank.hullAngle);
    const hitMod = moduleHitFromBands(
      tank.hullSpec && tank.hullSpec.verts, tank.modules, 'hull',
      { dx:0, dy:0 }, MODS.bandDepth.hull, rel.x, rel.y);
    if(hitMod) return hitMod;
    if(hit.faceKey==='rear') return {key:'engine', label:'发动机舱'};
    return {key:'hullHull', label: hit.edgeName==='front' ? '车体正面装甲' : (hit.faceKey==='side' ? '车体侧装甲' : '车体后部装甲')};
  }
  if(hit.faceKey==='side'){
    // 用命中点相对车体中心的局部 x 判定前后（s 的方向因左右侧面而异，不能直接用）
    const rel = rotate(hit.x - tank.x, hit.y - tank.y, -tank.hullAngle);
    const halfL = Math.max(1, (tank.hullLen||64)/2);
    const rx = rel.x / halfL;
    // 分区（波带）：极前端/极后端 → 履带；前段 → 驾驶员；中段 → 弹药架；后段 → 发动机
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
  if (!poly || !poly.verts || poly.verts.length < 2) return (t.turLen||34)/2;
  let maxInterX = -Infinity;
  const verts = poly.verts;
  const n = verts.length;
  for (let i = 0; i < n; i++) {
    const p1 = verts[i], p2 = verts[(i + 1) % n];
    if ((p1[1] <= 0 && p2[1] >= 0) || (p1[1] >= 0 && p2[1] <= 0)) {
      if (Math.abs(p1[1] - p2[1]) < 1e-6) {
        maxInterX = Math.max(maxInterX, p1[0], p2[0]);
      } else {
        const tVal = (0 - p1[1]) / (p2[1] - p1[1]);
        const ix = p1[0] + tVal * (p2[0] - p1[0]);
        maxInterX = Math.max(maxInterX, ix);
      }
    }
  }
  if (maxInterX === -Infinity) {
    for (const p of verts) maxInterX = Math.max(maxInterX, p[0]);
  }
  return maxInterX;
}

function gunRoot(t){
  const p = turretPivot(t);
  const frontDist = turretFrontDist(t);
  return {
    x: p.x + Math.cos(t.turretAngle) * frontDist,
    y: p.y + Math.sin(t.turretAngle) * frontDist
  };
}

function gunTip(t){
  const gr = gunRoot(t);
  const bSpec = t.barrel || { len: 120, width: 18, muzzle: 'none' };
  const barrelPct = Math.max(0, Math.min(3, (bSpec.len || 120) / 100));
  const barrelLen = (t.turLen || 34) * barrelPct;
  return {
    x: gr.x + Math.cos(t.turretAngle) * barrelLen,
    y: gr.y + Math.sin(t.turretAngle) * barrelLen
  };
}

// Export for Node.js if running in test environment
if (typeof module !== 'undefined' && module.exports) {
  const U = require('./tank_utils.js');
  module.exports = {
    ARMOR,
    BOUNCE_ANGLE,
    HEIGHTS,
    getPartZRange,
    getGunHeight,
    partCorners: U.partCorners,
    partEdges: U.partEdges,
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
    normalizeTankModules,
    pointInQuad,
    moduleBandForEdge,
    findModuleBands,
    moduleLabelOf,
    moduleAllowedParts,
    moduleHitFromBands,
    moduleFromHit,
    bestTankHit,
    aimPartPreference,
    bestHitForPref,
    shellPartHit,
    faceLabel,
    turretPivot,
    turretFrontDist,
    gunRoot,
    gunTip
  };
}
