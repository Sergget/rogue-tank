// tank_paint.js — shared procedural tank rendering (classic script, loads over file://).
// Single source of truth for rolling tracks + top-down hull/turret textures, shared by
// tank_mvp.html and tank_designer.html. All functions are platform-independent: they take an
// explicit ctx, local-coordinate polygon verts, and a pose, so each caller supplies its own
// geometry (mvp model vs designer half-polys) and colors.
'use strict';
//
// Design note: kept as a plain script (NOT an ES module) so both prototypes keep working when
// opened directly via file:// without a local server. Names are prefixed to avoid clashing with
// each prototype's own globals; each HTML file keeps thin wrappers with the names it already uses.

// ---------- color ----------
// shade(hex, pct): lighten (+) or darken (-) a hex color by a percentage; returns a CSS color.
function paintShade(hex, pct){
  if(!hex) return 'rgba(90,90,90,1)';
  let h = hex.replace('#','');
  if(h.length===3) h = h.split('').map(c=>c+c).join('');
  const r = parseInt(h.substr(0,2),16), g = parseInt(h.substr(2,2),16), b = parseInt(h.substr(4,2),16);
  const f = 1 + (pct||0)/100;
  const cl = v => Math.max(0, Math.min(255, Math.round(v*f)));
  return `rgba(${cl(r)},${cl(g)},${cl(b)},1)`;
}

// ---------- geometry helpers ----------
// local bounding box of a polygon part (verts: [ [dx,dy], ... ]); front/local space = +x
function paintBounds(verts){
  let minX=Infinity, maxX=-Infinity, minY=Infinity, maxY=-Infinity;
  for(const [vx,vy] of verts){
    if(vx<minX)minX=vx; if(vx>maxX)maxX=vx; if(vy<minY)minY=vy; if(vy>maxY)maxY=vy;
  }
  return { minX, maxX, minY, maxY };
}
// begin a closed path from local verts (caller owns ctx transform)
function paintBeginLocal(ctx, verts){
  ctx.beginPath();
  for(let i=0;i<verts.length;i++){
    const [vx,vy] = verts[i];
    if(i===0) ctx.moveTo(vx,vy); else ctx.lineTo(vx,vy);
  }
  ctx.closePath();
}
// begin + clip to the closed local polygon (after caller's translate/rotate)
function paintClipLocal(ctx, verts){
  paintBeginLocal(ctx, verts);
  ctx.clip();
}

// ---------- rolling tracks ----------
// Two track strips along the hull's local +x axis with scrolling "grouser" links.
// Local-unit geometry; `scale` keeps stroke widths pixel-consistent when the caller zooms.
//   verts  : hull polygon verts (local coords)
//   cx,cy  : hull world position; angle: hull rotation
//   scale  : 1 in mvp, viewScale in designer
//   color  : base color (t.color or designer's neutral paint)
//   phase  : scrolling offset (t.trackPhase or a time-driven value)
function paintTracks(ctx, verts, cx, cy, angle, scale, color, phase, opts){
  opts = opts || {};
  const { minX, maxX, minY, maxY } = paintBounds(verts);
  const L = (maxX-minX)/2, W = (maxY-minY)/2;
  // #3（2026-10-15）：trackWidth/trackOffset 是模型单位，不除以 scale。
  // 此前除以 scale 导致设计器（scale≠1）与游戏（scale=1）履带位置不一致。
  const tw = opts.trackWidth || 7;
  const offsetExtra = opts.trackOffset || 0;
  const cxm = (minX+maxX)/2, cym = (minY+maxY)/2;
  const yTop = cym - W - tw/2 - offsetExtra, yBot = cym + W + tw/2 + offsetExtra;
  const x0 = cxm - L*0.98, x1 = cxm + L*0.98;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle||0);
  ctx.scale(scale, scale);
  // #3（2026-10-15）：履带改回矩形（用户要求：不要圆角/胶囊形）
  // #TEX11-2026-10-18：履带细节重做。旧实现的「防滑齿 +10%、导向齿 −30%」在 1:1 下
  //   变成**一条等距的亮灰点阵**（10 倍图里就是上/下两条 LED 虚线），是整车最显眼的
  //   程序化痕迹。现改为真实履带的明暗关系：深色基体 + 上缘受光细线 + 每节暗缝 +
  //   短横向花纹（比基体略亮，但远低于旧 +10%），导向齿压暗。
  for(const yc of [yTop, yBot]){
    const r = tw/2;
    // 履带基体（深色矩形）
    ctx.fillStyle = paintShade(color, -62);
    ctx.fillRect(x0, yc - r, x1 - x0, tw);
    // 上缘受光 / 下缘蔽光（与车体顶光同向）
    ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(x0, yc - r + 0.4); ctx.lineTo(x1, yc - r + 0.4); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.moveTo(x0, yc + r - 0.4); ctx.lineTo(x1, yc + r - 0.4); ctx.stroke();
    // 外缘描边（矩形）
    ctx.strokeStyle = paintShade(color, -28); ctx.lineWidth = 1;
    ctx.strokeRect(x0, yc - r, x1 - x0, tw);
    // 独立履带节：横向分隔线（随 phase 滚动）
    const pitch = 7;
    const off = -((phase || 0) % pitch);
    ctx.strokeStyle = paintShade(color, -44); ctx.lineWidth = 1;
    for(let x = x0 + off; x < x1; x += pitch){
      ctx.beginPath(); ctx.moveTo(x, yc - r + 0.7); ctx.lineTo(x, yc + r - 0.7); ctx.stroke();
    }
    // 履带板花纹：每节一条短横纹（比基体略亮，制造金属起伏而非点阵）
    ctx.fillStyle = paintShade(color, -14);
    for(let x = x0 + off + pitch*0.5; x < x1; x += pitch){
      ctx.fillRect(x - 1.2, yc - 1.1, 2.6, 1.1);
    }
    // 中央导向齿：压暗的小方块（旧版是亮圆点，1:1 下连成虚线）
    ctx.fillStyle = paintShade(color, -52);
    for(let x = x0 + off + pitch*0.25; x < x1; x += pitch){
      ctx.fillRect(x - 0.6, yc + 0.4, 1.2, 1.5);
    }
  }
  ctx.restore();
}

// ---------- turret shadow ----------
// Soft elliptical shadow projected onto the hull deck, offset by `ox,oy` (local units) to simulate
// a light source from above. Drawn BEFORE the turret so the turret paints over it.
//
// #TEX8-2026-10-18 修复（光源方向被旋转两次）：
//   光在战场里是**全局固定**的：影子永远朝右下（+x,+y），与地图元素投影
//   （drawCoverShadow 的固定 +x/+y 偏移）同向。所以 (ox,oy) 必须当作**世界向量**，
//   而炮塔多边形是在 R(angle) 的局部坐标系里画、平移也在该系内生效：
//     R(angle)·(u,v) = (ox,oy)   ⇒   (u,v) = R(−angle)·(ox,oy)
//   旧实现按 worldAng（车体朝向）旋转 (ox,oy)，恰好把影子绑在车体朝向上；
//   又因为平移发生在已旋转的局部系，等于再转一次。净效果 R(angle)·R(worldAng)·off，
//   实测 hull=0、turret 0→90° 时影方位从 54° 摆到 144°，同屏出现两个光源。
//   worldAng 参数保留仅为兼容既有调用点签名，**不再参与偏移计算**。
function paintTurretShadow(ctx, verts, cx, cy, angle, scale, ox, oy, worldAng){
  const { minX, maxX, minY, maxY } = paintBounds(verts);
  const W = (maxY-minY)/2;
  let offX = ox||0, offY = oy||0;
  {
    // 只补偿「局部系 − 世界系」的差：−angle。worldAng 不影响光向（见上）。
    const comp = -(angle || 0);
    if(comp){
      const r = { x: Math.cos(comp)*offX - Math.sin(comp)*offY,
                  y: Math.sin(comp)*offX + Math.cos(comp)*offY };
      offX = r.x; offY = r.y;
    }
  }
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle||0);
  ctx.scale(scale, scale);
  // 1) 软环境阴影（2026-10-05 加深，便于炮塔/车体区分）
  //    #TEX8-2026-10-18：单层径向渐变 → 三层同心（外扩 + 主层 + 内核），零模糊开销的软边；
  //    真实俯视投影是「靠近遮挡体边缘锐、远离渐散」，单层渐变两端都太软，边界糊在车体上。
  ctx.save();
  ctx.translate(offX, offY);
  const rx = W*1.05, ry = W*0.85;
  const halo = ctx.createRadialGradient(0,0,rx*0.55, 0,0,rx*1.22);
  halo.addColorStop(0, 'rgba(0,0,0,0.20)');
  halo.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = halo;
  ctx.beginPath(); ctx.ellipse(0, 0, rx*1.22, ry*1.22, 0, 0, Math.PI*2); ctx.fill();
  const grad = ctx.createRadialGradient(0,0,0, 0,0,rx);
  grad.addColorStop(0, 'rgba(0,0,0,0.55)');
  grad.addColorStop(0.6, 'rgba(0,0,0,0.30)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI*2);
  ctx.fill();
  ctx.restore();
  // 2) 硬投影：炮塔剪影按偏移量平移填充（2026-10-05 新增）——炮塔边缘在车体上
  //    投出清晰可辨的形状，玩家一眼区分炮塔与车体
  //    #TEX8：单层 0.36 → 两层（外扩 0.16 + 主体 0.34），近体锐利、外缘渐淡
  ctx.save();
  ctx.translate(offX * 1.35, offY * 1.35);
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  paintBeginLocal(ctx, verts);
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.translate(offX, offY);
  ctx.fillStyle = 'rgba(0,0,0,0.34)';
  paintBeginLocal(ctx, verts);
  ctx.fill();
  ctx.restore();
  ctx.restore();
}

// ---------- top-down textures ----------
// P-15 坦克纹理叠层（§2.10 定型）：多边形 clip + 平铺图案叠层，灰度/半透明图案保持 t.color 主色。
// TEXTURE_DEFS 为数据驱动定义（name + draw(ctx, bbox)），bbox={minX,minY,maxX,maxY}（local 坐标，
// 调用时已 clip 到部件多边形）。炮管/附件/特效保持程序化（§2.10）。

// #TEX6-2026-10-18：贴图微观质感工具
//   ① `_texGrain` 表面颗粒——俯视 0.5~1.5px 的明暗碎点，抵消「大块纯色 = 塑料感」；
//   ② `_texPatch` 硬边迷彩色块——真实迷彩是喷涂模板的**硬边**多边形，旧实现全是椭圆，
//      放大看像「水彩晕染」，是本次贴图质量最明显的一处短板。
//   两者位置都由**固定种子哈希**派生（不用 Math.random），同纹理每次烘焙像素一致，
//   满足「同 seed 同结果」约定，也让离屏缓存可安全复用。
function _texRand(seed, i){
  let h = Math.imul((seed | 0) ^ (i | 0), 0x9E3779B1);
  h = Math.imul(h ^ (h >>> 15), 0x85EBCA77);
  h = Math.imul(h ^ (h >>> 13), 0xC2B2AE3D);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function _texGrain(ctx, b, count, colDark, colLight, seed){
  const w = b.maxX - b.minX, h = b.maxY - b.minY;
  if(!(w > 0) || !(h > 0)) return;
  ctx.fillStyle = colDark;
  for(let i = 0; i < count; i++){
    const x = b.minX + _texRand(seed, i * 3 + 1) * w;
    const y = b.minY + _texRand(seed, i * 3 + 2) * h;
    const s = 0.5 + _texRand(seed, i * 3 + 3) * 1.1;
    ctx.fillRect(x, y, s, s);
  }
  if(colLight){
    ctx.fillStyle = colLight;
    for(let i = 0; i < count * 0.6; i++){
      const x = b.minX + _texRand(seed + 977, i * 3 + 1) * w;
      const y = b.minY + _texRand(seed + 977, i * 3 + 2) * h;
      const s = 0.5 + _texRand(seed + 977, i * 3 + 3) * 0.9;
      ctx.fillRect(x, y, s, s);
    }
  }
}
// rgba 颜色乘透明度（迷彩喷涂边缘的 overspray 用；非 rgba 颜色原样返回）
function _texFade(col, f){
  const m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/.exec(col);
  if(!m) return col;
  const a = Math.max(0, Math.min(1, (m[4] === undefined ? 1 : parseFloat(m[4])) * f));
  return `rgba(${m[1]},${m[2]},${m[3]},${a.toFixed(3)})`;
}
// 硬边色块：每个 patch = 中心(0~1) + 半径(0~1) + 顶点数 + 旋转，顶点半径带哈希抖动。
//
// #TEX11-2026-10-18：从「一块硬边七边形」升级为**喷涂出来的迷彩块**，三处改动：
//   ① 主块 + 1 个偏移 lobe（只在块够大时加）：真实迷彩是相互咬合的分叉形状，
//      单个凸多边形放大看是「贴纸」，两个错位块叠起来才有成片涂装的咬合感；
//   ② 边缘 overspray：同色 alpha×0.30 的 1px 描边 + 沿边缘散落的小点——喷枪边缘
//      不是矢量硬边，实机 1:1 下这层过渡决定「像涂装」还是「像 UI 色块」；
//   ③ 顶点抖动幅度 0.72~1.14 → 0.66~1.20，形状更不规则。
function _texPatch(ctx, b, fx, fy, fw, fh, rot, verts, col, seed, i0){
  const w = b.maxX - b.minX, h = b.maxY - b.minY;
  const cxp = b.minX + fx * w, cyp = b.minY + fy * h;
  const rx = fw * w, ry = fh * h;
  const poly = (ox, oy, sx, sy, n, seed2) => {
    ctx.beginPath();
    for(let k = 0; k < n; k++){
      const a = rot + (k / n) * Math.PI * 2;
      const wob = 0.66 + _texRand(seed2, i0 * 31 + k) * 0.54;
      const px = cxp + ox + Math.cos(a) * rx * sx * wob;
      const py = cyp + oy + Math.sin(a) * ry * sy * wob;
      if(k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  };
  // ① 主块
  ctx.fillStyle = col;
  poly(0, 0, 1, 1, verts, seed);
  ctx.fill();
  // ② lobe：够大的块才分叉（<7px 的块再分叉会碎成噪点）
  if(rx * 2 > 7 && ry * 2 > 5){
    const la = _texRand(seed, i0 * 53 + 7) * Math.PI * 2;
    const ld = 0.42 + _texRand(seed, i0 * 53 + 11) * 0.30;
    const ls = 0.46 + _texRand(seed, i0 * 53 + 13) * 0.22;
    poly(Math.cos(la) * rx * ld, Math.sin(la) * ry * ld, ls, ls,
         Math.max(5, verts - 1), seed + 211);
    ctx.fill();
  }
  // ③ overspray：1px 同色低透明度描边 + 边缘散点
  ctx.strokeStyle = _texFade(col, 0.30);
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = _texFade(col, 0.45);
  const nDots = Math.max(3, Math.round((rx + ry) * 0.62));
  for(let k = 0; k < nDots; k++){
    const a = rot + (k / nDots) * Math.PI * 2 + _texRand(seed, i0 * 71 + k) * 0.6;
    const rr = 1.02 + _texRand(seed + 37, i0 * 71 + k) * 0.30;
    const px = cxp + Math.cos(a) * rx * rr;
    const py = cyp + Math.sin(a) * ry * rr;
    ctx.fillRect(px - 0.35, py - 0.35, 0.8, 0.8);
  }
}

// #TEX11-2026-10-18：**贴图坐标系必须锚在车体上，而不是各部件自己的包围盒上**。
//   旧实现 TEXTURE_DEFS.draw 拿到的是「本部件的 bbox」：车体宽 73.5px、炮塔宽 32.3px，
//   同一条 fx=0.30 的规则在车体上画出 22px 的色块、在炮塔上只有 10px——
//   实机 2 倍图里一眼能看出「炮塔迷彩比车体细一档」，且色块在炮塔/车体交界处断开。
//   真实涂装是整车喷的：色块尺寸以 **车体** 为基准，跨部件处图案连续。
//   做法：炮塔的贴图 bbox 用车体 bbox 平移到炮塔局部系（减掉座圈偏移），
//   于是同一份图案在两块上落在同一世界位置（炮塔转正时无缝衔接）。
//   再叠一个**每车固定**的图案平移（weatherSeed 派生）：同型多车不再共用同一套迷彩，
//   但同一辆车每帧/每次烘焙像素完全一致。weatherSeed 已在 sprite 缓存键里。
function paintPatternBox(hullVerts, kind, pivotOffset, seed){
  const hb = paintBounds(hullVerts);
  let ox = 0, oy = 0;
  if(kind === 'turret'){
    // 与 turretPivot() 同口径：未配置时缺省座圈前移 8px（旧版本只在有 spec 时才有
    // turretPivotOffset，缺省实体漏了这一步会让测得的图案框与实机错开 8px）
    const po = pivotOffset || { dx: 8, dy: 0 };
    ox = po.dx || 0; oy = po.dy || 0;
  }
  const s = (seed | 0) || 1;
  // ±8px / ±5px 的整车图案平移：足以让同型车的迷彩色块位置不同，又不至于跑到部件外
  const jx = (_texRand(s, 991) - 0.5) * 16;
  const jy = (_texRand(s, 997) - 0.5) * 10;
  // originX/originY = 车体原点在本部件局部系里的坐标（炮塔为 −座圈偏移）。
  // 网格类贴图（装甲板/焊缝）必须按这个原点对齐——否则 14px 网格在炮塔上会
  // 错开 (pivot mod 14)，车体/炮塔的板缝接不上。
  return { minX: hb.minX - ox + jx, minY: hb.minY - oy + jy,
           maxX: hb.maxX - ox + jx, maxY: hb.maxY - oy + jy,
           originX: -ox, originY: -oy };
}

const TEXTURE_DEFS = {
  none: { name: '无', draw: null },
  armor_plate: { name: '装甲板纹', draw: (ctx, b) => {
      // #TEX10-2026-10-18：本贴图此前**几乎等于裸装甲**——audit 实测与 `none` 的
      // 差异块占比只有 1.5%。根因是全部笔画都压在 grid 线上（1px、alpha 0.18/0.10），
      // 而车体实机只有 73.5×38，14px 网格在 73px 宽上只有 ~5 条线，1px 线又会被
      // paintShade 渐变和颗粒淹没。
      // 现改为「真装甲板」而不是「网格线」：
      //   ① 板缝用 2px（原先 1px）并加深到 0.26，保证实机可见；
      //   ② 每块板内加**倒角高光**（板缘内侧 1px 亮线），这是装甲板最核心的识别特征；
      //   ③ 板中心加极淡的亮度偏移，模拟各板不是同一块钢；
      //   ④ 交错板缝（相邻行错开半个格），避免读成「方格纸」。
      const s = 14;
      // #TEX11：网格原点锚在车体原点（originX/Y），炮塔上的板缝才能与车体接上
      const gox = b.originX || 0, goy = b.originY || 0;
      const x0 = Math.ceil((b.minX - gox) / s) * s + gox;
      const y0 = Math.ceil((b.minY - goy) / s) * s + goy;
      // ③ 每块板的独立明度（交错棋盘，极淡）
      for (let x = x0 - s; x <= b.maxX; x += s) {
        for (let y = y0 - s; y <= b.maxY; y += s) {
          const even = (Math.round((x - x0) / s) + Math.round((y - y0) / s)) % 2 === 0;
          ctx.fillStyle = even ? 'rgba(255,255,255,0.022)' : 'rgba(0,0,0,0.026)';
          ctx.fillRect(x, y, s, s);
        }
      }
      // ① 板缝（2px 深缝）
      ctx.strokeStyle = 'rgba(0,0,0,0.26)'; ctx.lineWidth = 2;
      for (let x = x0; x <= b.maxX; x += s) {
        ctx.beginPath(); ctx.moveTo(x, b.minY); ctx.lineTo(x, b.maxY); ctx.stroke();
      }
      for (let y = y0; y <= b.maxY; y += s) {
        ctx.beginPath(); ctx.moveTo(b.minX, y); ctx.lineTo(b.maxX, y); ctx.stroke();
      }
      // ② 板缘倒角高光（缝的 +1px 内侧亮线）
      ctx.strokeStyle = 'rgba(255,255,255,0.16)'; ctx.lineWidth = 1;
      for (let x = x0 + 2; x <= b.maxX; x += s) {
        ctx.beginPath(); ctx.moveTo(x, b.minY); ctx.lineTo(x, b.maxY); ctx.stroke();
      }
      for (let y = y0 + 2; y <= b.maxY; y += s) {
        ctx.beginPath(); ctx.moveTo(b.minX, y); ctx.lineTo(b.maxX, y); ctx.stroke();
      }
      _texGrain(ctx, b, 40, 'rgba(0,0,0,0.14)', 'rgba(255,255,255,0.10)', 13);
  }},
  weld_seam: { name: '焊缝', draw: (ctx, b) => {
      ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = 2;
      const s = 12;
      const gox = b.originX || 0, goy = b.originY || 0;
      for(let y = b.minY+3; y <= b.maxY-3; y += s){ ctx.beginPath(); ctx.moveTo(b.minX+2, y); ctx.lineTo(b.maxX-2, y); ctx.stroke(); }
      // #TEX6：焊缝鱼鳞纹——沿缝的短弧，让「一条黑线」变成可辨认的焊道
      // #TEX11：鱼鳞相位按车体原点对齐（炮塔与车体焊道连续）
      ctx.strokeStyle = 'rgba(255,255,255,0.13)'; ctx.lineWidth = 1;
      const ax0 = Math.ceil((b.minX + 4 - gox) / 4) * 4 + gox;
      for(let y = b.minY+3; y <= b.maxY-3; y += s){
        for(let x = ax0; x < b.maxX - 4; x += 4){
          ctx.beginPath(); ctx.arc(x, y, 2.1, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
        }
      }
      _texGrain(ctx, b, 26, 'rgba(0,0,0,0.12)', null, 27);
  }},
  rust: { name: '锈蚀', draw: (ctx, b) => {
      ctx.fillStyle = 'rgba(120,70,30,0.20)';
      const w = b.maxX-b.minX, h = b.maxY-b.minY;
      for(let i=0;i<8;i++){
        const rx = b.minX + ((i*137)%101)/101*w, ry = b.minY + ((i*73)%97)/97*h;
        ctx.beginPath(); ctx.ellipse(rx, ry, 3+(i%3), 2+(i%2), 0, 0, Math.PI*2); ctx.fill();
      }
      // #TEX6：锈斑内核（更深）+ 锈水流痕（沿 +y 方向的细长渐淡条）
      ctx.fillStyle = 'rgba(88,46,18,0.26)';
      for(let i=0;i<8;i++){
        const rx = b.minX + ((i*137)%101)/101*w, ry = b.minY + ((i*73)%97)/97*h;
        ctx.beginPath(); ctx.ellipse(rx, ry, 1.4+(i%2)*0.8, 1.1+(i%2)*0.6, 0, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = 'rgba(104,58,26,0.14)';
        ctx.fillRect(rx - 0.8, ry, 1.6, 5 + (i % 4) * 3.5);
        ctx.fillStyle = 'rgba(88,46,18,0.26)';
      }
      _texGrain(ctx, b, 30, 'rgba(70,40,16,0.20)', null, 41);
  }},
  camo: { name: '迷彩', draw: (ctx, b) => {
      const blobs = [[0.15,0.2,0.35,0.30],[0.62,0.14,0.30,0.26],[0.40,0.70,0.40,0.30],[0.82,0.60,0.30,0.28]];
      // #TEX6：椭圆 → 硬边多边形色块
      let pi = 0;
      for(const [fx,fy,fw,fh] of blobs){
        _texPatch(ctx, b, fx, fy, fw, fh, pi * 0.7, 7, 'rgba(30,40,25,0.28)', 61, pi++);
      }
      _texGrain(ctx, b, 34, 'rgba(0,0,0,0.13)', 'rgba(255,255,255,0.08)', 67);
  }},
  // 2026-10-05 历史涂装：二战德军深黄底（Dunkelgelb）+ 橄榄绿/红棕不规则色块
  // base = 车体实色（队伍色不再参与车体填充，见 paintPartTextureDirect）
  camo_dunkelgelb: { name: '深黄迷彩', base: '#b89a55', draw: (ctx, b) => {
      const green = [[0.18,0.22,0.30,0.26],[0.66,0.62,0.34,0.30],[0.45,0.10,0.24,0.20]];
      let gi = 0;
      for(const [fx,fy,fw,fh] of green){
        _texPatch(ctx, b, fx, fy, fw, fh, 0.5 + gi * 0.6, 7, 'rgba(86,96,52,0.55)', 73, gi++);
      }
      const brown = [[0.60,0.16,0.28,0.22],[0.14,0.68,0.30,0.26],[0.82,0.40,0.22,0.24]];
      let bi = 0;
      for(const [fx,fy,fw,fh] of brown){
        _texPatch(ctx, b, fx, fy, fw, fh, -0.4 + bi * 0.5, 6, 'rgba(128,66,40,0.55)', 79, bi++);
      }
      // #TEX6：喷涂颗粒 + 色块边缘的高光描边（模拟涂料厚度差）
      _texGrain(ctx, b, 44, 'rgba(60,44,24,0.14)', 'rgba(255,240,200,0.10)', 83);
  }},
  // 2026-10-05 历史涂装：德军装甲灰（Panzergrau）单色 + 细微明暗变化
  paint_panzergrau: { name: '装甲灰', base: '#4a4e54', draw: (ctx, b) => {
      const w = b.maxX-b.minX, h = b.maxY-b.minY;
      const dark = [[0.30,0.75,0.44,0.18],[0.72,0.25,0.30,0.16]];
      ctx.fillStyle = 'rgba(38,40,44,0.20)';
      for(const [fx,fy,fw,fh] of dark){
        ctx.beginPath(); ctx.ellipse(b.minX+fx*w, b.minY+fy*h, fw*w, fh*h, 0.2, 0, Math.PI*2); ctx.fill();
      }
      const light = [[0.25,0.20,0.36,0.16],[0.68,0.70,0.34,0.16]];
      ctx.fillStyle = 'rgba(140,144,150,0.14)';
      for(const [fx,fy,fw,fh] of light){
        ctx.beginPath(); ctx.ellipse(b.minX+fx*w, b.minY+fy*h, fw*w, fh*h, -0.2, 0, Math.PI*2); ctx.fill();
      }
      // #TEX6：单色涂装的灵魂是微观起伏——颗粒 + 少量掉漆露底
      _texGrain(ctx, b, 50, 'rgba(24,26,30,0.16)', 'rgba(186,190,196,0.10)', 91);
      ctx.fillStyle = 'rgba(96,98,102,0.30)';
      for(let i = 0; i < 5; i++){
        const px = b.minX + _texRand(93, i * 2 + 1) * w;
        const py = b.minY + _texRand(93, i * 2 + 2) * h;
        ctx.beginPath(); ctx.ellipse(px, py, 1.6 + (i % 3) * 0.9, 1.2 + (i % 2) * 0.7, i * 0.8, 0, Math.PI * 2); ctx.fill();
      }
  }},
  // 2026-10-05 历史涂装：北约三色迷彩（绿底 + 棕/黑色块）
  camo_nato: { name: '北约三色迷彩', base: '#5c6b40', draw: (ctx, b) => {
      const brown = [[0.16,0.60,0.34,0.28],[0.68,0.14,0.30,0.24]];
      let bi = 0;
      for(const [fx,fy,fw,fh] of brown){
        _texPatch(ctx, b, fx, fy, fw, fh, 0.7 + bi * 0.5, 7, 'rgba(96,68,44,0.55)', 101, bi++);
      }
      const black = [[0.42,0.30,0.26,0.22],[0.78,0.66,0.28,0.24],[0.10,0.14,0.22,0.20]];
      let ki = 0;
      for(const [fx,fy,fw,fh] of black){
        _texPatch(ctx, b, fx, fy, fw, fh, -0.6 + ki * 0.4, 6, 'rgba(26,26,24,0.50)', 103, ki++);
      }
      _texGrain(ctx, b, 40, 'rgba(20,24,16,0.14)', 'rgba(220,228,200,0.08)', 107);
  }},
  // 2026-10-05 历史涂装：苏军保护绿单色 + 细微明暗变化
  paint_soviet: { name: '苏军绿', base: '#5e7038', draw: (ctx, b) => {
      const w = b.maxX-b.minX, h = b.maxY-b.minY;
      const dark = [[0.32,0.72,0.42,0.18],[0.70,0.28,0.32,0.16]];
      ctx.fillStyle = 'rgba(48,60,34,0.20)';
      for(const [fx,fy,fw,fh] of dark){
        ctx.beginPath(); ctx.ellipse(b.minX+fx*w, b.minY+fy*h, fw*w, fh*h, 0.2, 0, Math.PI*2); ctx.fill();
      }
      const light = [[0.24,0.22,0.36,0.16],[0.66,0.68,0.34,0.16]];
      ctx.fillStyle = 'rgba(116,130,78,0.14)';
      for(const [fx,fy,fw,fh] of light){
        ctx.beginPath(); ctx.ellipse(b.minX+fx*w, b.minY+fy*h, fw*w, fh*h, -0.2, 0, Math.PI*2); ctx.fill();
      }
      // #TEX6：颗粒 + 泥渍（下缘更脏，符合俯视光照习惯）
      _texGrain(ctx, b, 46, 'rgba(34,44,24,0.16)', 'rgba(190,204,150,0.09)', 113);      ctx.fillStyle = 'rgba(74,60,38,0.18)';
      for(let i = 0; i < 6; i++){
        const px = b.minX + _texRand(127, i * 2 + 1) * w;
        const py = b.minY + (0.55 + _texRand(127, i * 2 + 2) * 0.45) * h;
        ctx.beginPath(); ctx.ellipse(px, py, 2.2 + (i % 3), 1.6 + (i % 2), 0, 0, Math.PI * 2); ctx.fill();
      }
  }},
  // #3（2026-10-15）：新增 5 种纹理预设
  camo_desert: { name: '沙漠迷彩', base: '#c2a86b', draw: (ctx, b) => {
      let i = 0;
      for(const [fx,fy,fw,fh] of [[0.25,0.3,0.4,0.2],[0.65,0.65,0.35,0.18]]){
        _texPatch(ctx, b, fx, fy, fw, fh, 0.3 + i * 0.7, 7, 'rgba(160,130,80,0.28)', 131, i++);
      }
      let j = 0;
      for(const [fx,fy,fw,fh] of [[0.4,0.7,0.3,0.15],[0.75,0.25,0.28,0.14]]){
        _texPatch(ctx, b, fx, fy, fw, fh, -0.3 + j * 0.6, 6, 'rgba(220,200,150,0.20)', 137, j++);
      }
      _texGrain(ctx, b, 40, 'rgba(120,96,54,0.15)', 'rgba(250,238,200,0.12)', 139);
  }},
  camo_winter: { name: '冬季迷彩', base: '#d8d8d4', draw: (ctx, b) => {
      const w = b.maxX-b.minX, h = b.maxY-b.minY;
      // #TEX10-2026-10-18：本贴图此前**几乎不可见**，实测原因：
      //   base 亮度 216（近白），白块 rgba(255,255,255,0.35) 叠上去落色 229 —— 只差 13。
      //   冬白涂装要读得出来，必须靠**更暗的底色透出**（"斑驳掉漆"）而不是靠"更白"。
      //   现改为：① 4 块硬边**深灰**掉漆区（亮度差 −40 级别）作为主要骨架；
      //          ② 只有 1 块纯白高光块（在原底色上已接近白，故用低 alpha 小面积）；
      //          ③ 灰色斑点沿掉漆区边缘聚集（真实掉漆是从边角扩散的）。
      let i = 0;
      // ① 深色掉漆/污渍区（骨架）：alpha 0.30~0.38，亮度差约 −45
      for(const [fx,fy,fw,fh,rot] of [[0.16,0.30,0.26,0.30,0.4],[0.52,0.62,0.30,0.26,-0.7],
                                      [0.74,0.16,0.22,0.24,1.1],[0.34,0.80,0.20,0.18,0.2]]){
        _texPatch(ctx, b, fx, fy, fw, fh, rot, 7, 'rgba(112,112,108,0.38)', 149, i++);
      }
      // ② 少量纯白高光（原底色已 216，白块只做微弱提亮，不承担结构）
      _texPatch(ctx, b, 0.62, 0.34, 0.15, 0.14, 0.6, 8, 'rgba(255,255,255,0.55)', 151, i++);
      _texPatch(ctx, b, 0.12, 0.66, 0.12, 0.12, -0.4, 7, 'rgba(255,255,255,0.45)', 152, i++);
      // ③ 掉漆区边缘的深斑（贴边聚集，不是均匀撒点）
      ctx.fillStyle = 'rgba(96,96,94,0.26)';
      for(let k = 0; k < 9; k++){
        const px = b.minX + (0.14 + _texRand(153, k * 3 + 1) * 0.72) * w;
        const py = b.minY + (0.20 + _texRand(153, k * 3 + 2) * 0.62) * h;
        ctx.beginPath(); ctx.ellipse(px, py, 1.6 + _texRand(153, k * 3 + 3) * 2.2,
                                    1.2 + _texRand(153, k * 3 + 1) * 1.6, k, 0, Math.PI * 2); ctx.fill();
      }
      _texGrain(ctx, b, 34, 'rgba(120,120,116,0.20)', 'rgba(255,255,255,0.26)', 157);
  }},
  camo_urban: { name: '城市迷彩', base: '#6b6f72', draw: (ctx, b) => {
      const w = b.maxX-b.minX, h = b.maxY-b.minY;
      // #TEX10-2026-10-18：本贴图此前是 5 个深 `fillRect` + 4 个浅 `fillRect`，问题有两层：
      //   ① **轴对齐矩形**在俯视坦克上非常出戏——车体是菱形/箭头多边形，矩形块贴上去像
      //      UI 色块而不是涂装；
      //   ② 深块 alpha 0.35 只差 −21、浅块 0.20 只差 +16，低于车体自身光照渐变（shadeAmp 8.15），
      //      实机被渐变淹没（audit 实测 patchScale 0.08）。
      //   现改为硬边多边形（与其它迷彩统一用 _texPatch）、拉开明度差到 −34 / +30、
      //   并让深块沿车身长轴分布（城市迷彩在真车上也是顺车体走向的条状）。
      let i = 0;
      // 深块：4 块，跨度 0.20~0.30（约 15~22px / 73px 车宽），alpha 0.52 → 亮度差约 −38
      for(const [fx,fy,fw,fh,rot] of [[0.14,0.26,0.22,0.28,0.3],[0.42,0.18,0.26,0.24,-0.5],
                                      [0.68,0.44,0.24,0.26,0.8],[0.30,0.70,0.28,0.22,-0.2]]){
        _texPatch(ctx, b, fx, fy, fw, fh, rot, 6, 'rgba(44,46,50,0.52)', 163, i++);
      }
      // 浅块：3 块，与深块错开相位，alpha 0.50 → 亮度差约 +36
      for(const [fx,fy,fw,fh,rot] of [[0.26,0.42,0.20,0.22,0.6],[0.56,0.66,0.22,0.24,-0.3],
                                      [0.76,0.24,0.18,0.20,1.0]]){
        _texPatch(ctx, b, fx, fy, fw, fh, rot, 6, 'rgba(198,202,206,0.50)', 167, i++);
      }
      _texGrain(ctx, b, 42, 'rgba(30,32,34,0.16)', 'rgba(232,236,240,0.12)', 163);
  }},
  paint_olive: { name: '橄榄绿', base: '#5a6238', draw: (ctx, b) => {
      const w = b.maxX-b.minX, h = b.maxY-b.minY;
      ctx.fillStyle = 'rgba(70,78,45,0.2)';
      ctx.fillRect(b.minX+0.2*w, b.minY+0.3*h, 0.6*w, 0.4*h);
      // #TEX6：单色橄榄绿补齐层次（暗部 + 颗粒 + 少量磨损亮点）
      ctx.fillStyle = 'rgba(52,60,32,0.18)';
      ctx.fillRect(b.minX+0.05*w, b.minY+0.62*h, 0.9*w, 0.26*h);
      _texGrain(ctx, b, 44, 'rgba(38,44,24,0.16)', 'rgba(178,186,132,0.09)', 167);
  }},
  camo_digital: { name: '数码迷彩', base: '#5c6650', draw: (ctx, b) => {
      const w = b.maxX-b.minX, h = b.maxY-b.minY;
      // #TEX10-2026-10-18：本贴图此前**在实机尺寸下读成一片纯色**，三处量化原因：
      //   ① 18×18 网格 ⇒ 单元 2.56px。车体实机只有 73.5×38 世界像素，2.56px 的格子
      //      已经是"单像素噪点"级别，相机的 0.8 缩放会直接把它平均掉；
      //   ② 三个颜色的 alpha 太低：色2 rgba(120,125,95,0.22) 与底色只差 **+5**、
      //      色3 rgba(70,76,56,0.20) 只差 **−5**，等于没画；
      //   ③ 三套 `% 5 / % 7 / % 11` 的散点规则互相独立，没有形成数码迷彩的
      //      "成簇像素块"结构，只是在底色上撒了点。
      //   现改为：网格回到 **10×10**（单元 4.6px，正好是"能存活过降采样"的最小簇），
      //   三色明度差拉到 −24 / +22 / −12，并且用**簇生长**（每簇 2~5 个相邻格）
      //   取代散点，这才是数码迷彩的真实形态。
      const N = 10, ss = Math.min(w, h) / N;
      const COLS = [
        { col: 'rgba(38,44,32,0.52)',  seed: 173, ratio: 0.26, cluster: 4 },  // 最暗：−24
        { col: 'rgba(132,138,104,0.44)', seed: 179, ratio: 0.20, cluster: 3 }, // 最亮：+22
        { col: 'rgba(78,86,62,0.40)',  seed: 181, ratio: 0.16, cluster: 3 }   // 中间：−12
      ];
      const occ = new Uint8Array(N * N);
      let ci = 0;
      for(const { col, seed, ratio, cluster } of COLS){
        ctx.fillStyle = col;
        // 目标格数 = 总格 × ratio；用簇生长铺满，避免散点
        const targetCells = Math.round(N * N * ratio);
        let placed = 0, tries = 0;
        while(placed < targetCells && tries < 400){
          tries++;
          const sx = Math.floor(_texRand(seed, tries * 3) * N);
          const sy = Math.floor(_texRand(seed, tries * 3 + 1) * N);
          if(occ[sy * N + sx]) continue;
          const size = 2 + Math.floor(_texRand(seed, tries * 3 + 2) * cluster);
          let cx = sx, cy = sy;
          for(let k = 0; k < size && placed < targetCells; k++){
            if(cx < 0 || cx >= N || cy < 0 || cy >= N) break;
            if(!occ[cy * N + cx]){
              ctx.fillRect(b.minX + cx * ss, b.minY + cy * ss, ss + 0.4, ss + 0.4); // +0.4 消缝
              occ[cy * N + cx] = 1; placed++;
            }
            // 走向：优先横向延伸（数码迷彩多为横向簇），偶尔转折
            if(_texRand(seed, tries * 7 + k) < 0.62) cx++; else cy++;
          }
        }
        ci++;
      }
      _texGrain(ctx, b, 30, 'rgba(26,30,22,0.14)', 'rgba(200,208,180,0.08)', 173);
  }},
};

// 车体实色：TEXTURE_DEFS 的 base（历史涂装）优先，否则回退队伍色 color。
// 2026-10-05 起车体不再按队伍整车染色（红/绿底 + 迷彩叠层显脏）；队伍识别走
// 描边/履带/血条/小地图标记，车体保持历史涂装。
function tankBodyColor(color, texture) {
  const d = texture && TEXTURE_DEFS[texture];
  return (d && d.base) || color;
}

// Offscreen Canvas Cache for procedural tank sprites to optimize render performance
// #TEX9-2026-10-18：加上限 + 真 LRU。
//   键里加了 d/w/appearance 后，单个坦克可产生的条目从 1 条抬到 4~12 条（damageLevel 4 档
//   × weatherSeed 若干 × 外观件组合），而全仓库**没有任何** clearPaintCache() 调用点 →
//   长局里条目单调增长且永不淘汰（旧版实测已能复现 12 条同像素炮塔条目）。
//   这里给个足够大的上限并按 Map 插入序做 LRU（命中 move-to-tail），保证视觉零变化的前提下
//   内存有界。上限取 512：≈ 5 车型 × 2 部件 × 12 变体 + 余量，实机远达不到。
const PAINT_CACHE = new Map();
const MAX_PAINT_CACHE_SIZE = 512;
// #TEX12-2026-10-18：**超采样烘焙**。旧实现按 1:1 烘焙 73×38 的车体 sprite，再被
//   相机 zoom 0.8~1.3 缩放——相机 >1 时是在放大一张 1× 位图，边缘/迷彩边缘全是
//   硬像素，这就是「纯像素风」观感的根因。现改为 3× 烘焙（约 246×138），绘制时
//   以 1/3× 双线性降采样贴回：边缘获得抗锯齿，迷彩 overspray/磨损细点能落到
//   亚像素级，同时仍只占一张缓存位图（内存 9×，典型 <100 条 ≈ 20MB 峰值）。
let SPRITE_SCALE = 3;
function getSpriteScale() { return SPRITE_SCALE; }
function setSpriteScale(s) {
  SPRITE_SCALE = Math.max(1, Math.min(4, Math.round(s) || 3));
  clearPaintCache();
}
// 材质层开关（#TEX12）：默认开；调参/对照图可经 setPaintMaterial(false) 关掉。
// 烘焙缓存不区分此开关，切换时必须 clearPaintCache()（setter 已代劳）。
let PAINT_MATERIAL = true;
function setPaintMaterial(on) {
  PAINT_MATERIAL = !!on;
  clearPaintCache();
}
function getPaintMaterial() { return PAINT_MATERIAL; }
function clearPaintCache() {
  PAINT_CACHE.clear();
}

// #TEX4-2026-10-18：缓存键必须覆盖**所有影响像素**的入参。
//   旧键只含 bodyCol/kind/hasTurret/heightClass/texture/顶点，导致两条错误的共享：
//     ① damageLevel / weatherSeed 被丢弃 → renderHullTexture 每帧算出的损伤分级永远不生效
//        （全血与残血车体共用「出厂」sprite，weathering 划痕/锈斑/掉漆在实机里是死代码）；
//     ② appearance（车长塔/发动机舱外观件）被丢弃 → tanks/*.json 的 cupola/engineDeck
//        样式（low/standard/panoramic、compact/rearGrille）被静默忽略，全部画成内置默认件。
//   现在键里带上 damageLevel / weatherSeed / appearance 签名，不同外观各自独立烘焙。
function _appearanceKey(appearance){
  if(!appearance) return 'none';
  // 只取影响绘制的字段（style/dx/dy/mirror），按固定顺序拼接，避免 JSON 键序抖动
  const one = (a) => (a && typeof a === 'object')
    ? `${a.style || ''},${a.dx || 0},${a.dy || 0},${a.mirror ? 1 : 0}` : '';
  const cup = appearance.cupola;
  const cupPart = Array.isArray(cup) ? cup.map(one).join(';') : one(cup);
  return `c[${cupPart}]e[${one(appearance.engineDeck)}]`;
}
function getCachedTankSprite(color, kind, verts, hasTurret, heightClass, texture, extra) {
  const ex = extra || {};
  // 缓存键用车体实色（历史涂装下同纹理跨队伍共享同一 sprite）
  const bodyCol = tankBodyColor(color, texture);
  const damageLevel = ex.damageLevel | 0;
  const weatherSeed = ex.weatherSeed | 0;
  const appKey = _appearanceKey(ex.appearance);
  // #TEX11：图案框（整车坐标，见 paintPatternBox）影响每一块迷彩的位置/尺寸 ⇒ 必须进缓存键。
  const tb = ex.texBox;
  const texKey = tb ? `p${tb.minX.toFixed(1)},${tb.minY.toFixed(1)},${tb.maxX.toFixed(1)},${tb.maxY.toFixed(1)}` : 'p-';
  const cacheKey = `${bodyCol}_${kind}_${hasTurret}_${heightClass}_${texture||'none'}_d${damageLevel}_w${weatherSeed}_${appKey}_${texKey}_${verts.map(v => `${v[0].toFixed(1)},${v[1].toFixed(1)}`).join('|')}`;
  if (PAINT_CACHE.has(cacheKey)) {
    const hit = PAINT_CACHE.get(cacheKey);
    // 命中即移到队尾（真 LRU；Map 迭代序 = 插入序）
    PAINT_CACHE.delete(cacheKey);
    PAINT_CACHE.set(cacheKey, hit);
    return hit;
  }
  
  // Calculate bounding box in local space
  const { minX, maxX, minY, maxY } = paintBounds(verts);
  const w = Math.ceil(maxX - minX) + 8;
  const h = Math.ceil(maxY - minY) + 8;
  const cx = -minX + 4;
  const cy = -minY + 4;
  const S = SPRITE_SCALE;

  const canvas = document.createElement('canvas');
  canvas.width = w * S;
  canvas.height = h * S;
  const ctx = canvas.getContext('2d');

  // Paint the texture once onto this offscreen canvas at local scale S（超采样烘焙）
  paintPartTextureDirect(ctx, verts, cx * S, cy * S, 0, S, color, kind, {
    detail: true, hasTurret, heightClass, texture,
    damageLevel, weatherSeed, appearance: ex.appearance, texBox: ex.texBox
  });

  const cacheEntry = { canvas, cx: cx * S, cy: cy * S, w: w * S, h: h * S, scale: S };
  while (PAINT_CACHE.size >= MAX_PAINT_CACHE_SIZE) {
    const firstKey = PAINT_CACHE.keys().next().value;
    if (firstKey === undefined) break;
    PAINT_CACHE.delete(firstKey);
  }
  PAINT_CACHE.set(cacheKey, cacheEntry);
  return cacheEntry;
}

// #TEX12：把超采样缓存降采样到 **1:1 显示像素**，供验收/测试/审计使用。
//   运行时**不走这里**（直接 drawImage 2× 位图让浏览器双线性缩小）；此函数用于：
//   ① audit-textures 的「所有指标必须在 1:1 像素上测」；② test-render 的像素断言；
//   ③ 任何需要「玩家实际看到的那一张」的离线工具。
//   Node 的 mini-canvas 没有高质量 drawImage 降采样，因此整数倍时用 alpha 预乘的
//   盒式平均自己算；浏览器路径回退到 drawImage（带 imageSmoothing）。
function spriteView1x(entry) {
  if (entry.view1x) return entry.view1x;
  const S = entry.scale || SPRITE_SCALE;
  const src = /** @type {any} */ (entry.canvas), sw = src.width, sh = src.height;
  const dw = Math.round(sw / S), dh = Math.round(sh / S);
  const cv = document.createElement('canvas');
  cv.width = dw; cv.height = dh;
  const ctx = cv.getContext('2d');
  const dst = /** @type {any} */ (cv);
  if (S === Math.round(S) && src._buf && dst._buf) {
    const sb = src._buf, db = dst._buf;
    const n = S * S;
    for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let yy = 0; yy < S; yy++) for (let xx = 0; xx < S; xx++) {
        const sx = Math.min(sw - 1, x * S + xx), sy = Math.min(sh - 1, y * S + yy);
        const i = (sy * sw + sx) * 4;
        const sa = sb[i + 3];
        r += sb[i] * sa; g += sb[i + 1] * sa; b += sb[i + 2] * sa; a += sa;
      }
      const di = (y * dw + x) * 4;
      if (a > 0) { db[di] = r / a; db[di + 1] = g / a; db[di + 2] = b / a; }
      db[di + 3] = a / n;
    }
  } else {
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(src, 0, 0, dw, dh);
  }
  entry.view1x = { canvas: cv, w: dw, h: dh, cx: entry.cx / S, cy: entry.cy / S, scale: 1 };
  return entry.view1x;
}

// Internal drawing function that does the actual work on a context (offscreen or direct)
function paintPartTextureDirect(ctx, verts, cx, cy, angle, scale, color, kind, opts) {
  opts = opts || {};
  const { minX, maxX, minY, maxY } = paintBounds(verts);
  const L = (maxX-minX)/2, W = (maxY-minY)/2;
  const cxm = (minX+maxX)/2, cym = (minY+maxY)/2;
  const isHull = kind === 'hull';
  // 车体实色（历史涂装 base 优先）；细节线条/阴影一律取自实色，队伍色只留给描边与标记
  const bodyCol = tankBodyColor(color, opts.texture);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle||0);
  ctx.scale(scale, scale);
  paintClipLocal(ctx, verts);
  // base paint（#TEX12：车体底色抬亮一档 -18 → -12；配合超采样/材质层后
  //   旧的暗底会把迷彩读成「湿泥」，而顶光渐变已在底部补了阴影）
  ctx.fillStyle = paintShade(bodyCol, isHull ? -12 : -6);
  if(opts.faded) ctx.globalAlpha = 0.5;
  ctx.fillRect(minX-2, minY-2, (maxX-minX)+4, (maxY-minY)+4);
  ctx.globalAlpha = 1;
  // 纹理叠层（P-27 接线）：clip 内、base 填充后，灰度/半透明图案平铺在部件多边形上，
  // 保持 bodyCol 主色；opts.texture 缺失/'none'/未知键 → 跳过（数据驱动 TEXTURE_DEFS）。
  const texDef = opts.texture && TEXTURE_DEFS[opts.texture];
  if(texDef && texDef.draw && !opts.faded){
    // #TEX11：texture 使用**整车图案框**（opts.texBox，车体局部系），而不是本部件 bbox；
    //   未提供时退化为旧行为（部件 bbox），保证设计器/旧调用点不炸。
    texDef.draw(ctx, opts.texBox || { minX, minY, maxX, maxY });
  }
  // 顶光 + 底阴（2026-10-05 体积感）：柔和纵向渐变，clip 内
  if(!opts.faded){
    const grad = ctx.createLinearGradient(0, minY, 0, maxY);
    grad.addColorStop(0, 'rgba(255,255,255,0.10)');
    grad.addColorStop(0.55, 'rgba(255,255,255,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.20)');
    ctx.fillStyle = grad;
    ctx.fillRect(minX-2, minY-2, (maxX-minX)+4, (maxY-minY)+4);
    // #TEX12：材质层——把「平涂色块」变成有厚度的喷漆钢板。
    //   ① 边缘倒角：浅色/深色渐变描边（在 clip 内只显示内侧一半），给棱边高光与阴影；
    //   ② 拉丝：沿车体长轴的极淡长划痕（轧制钢板/漆面流平的方向性）；
    //   ③ 细颗粒：比贴图自带的 grain 更密更淡，超采样后成为亚像素级漆面颗粒；
    //   ④ 积尘：下缘暖色渐变（车体比炮塔重）。
    // 全部在离屏烘焙期一次完成，运行时零成本。
    if(PAINT_MATERIAL) paintMaterialPass(ctx, verts, minX, maxX, minY, maxY, W, L, isHull, opts.weatherSeed || 1);
  }
  // #TEX11-2026-10-18：边缘磨损（掉漆露金属 + 锈迹拖尾）。真实战车的磨损集中在
  //   车体棱边/炮塔外缘（乘员踩踏、树丛刮擦、沙尘冲击），而不是均匀撒在装甲面上。
  //   旧 weathering 把划痕/锈斑画在**面内随机位置**，放大看像彩色碎屑；
  //   这里沿多边形边界内侧 1.4~3.6px 布点，并随损伤等级加量。画在机械件之前（底漆层）。
  if(!opts.faded && opts.detail !== false){
    paintEdgeWear(ctx, verts, isHull, minX, maxX, W, L, opts.damageLevel || 0, opts.weatherSeed || 1);
  }
  if(!opts.faded && opts.detail !== false){
    if(isHull){
      // #TEX-2026-10-15: 铆钉排（甲板边缘）+ weathering（损伤分级，opts.damageLevel 0~3）
      paintRivets(ctx, cxm, cym, minX, maxX, W, L, bodyCol);
      if(opts.damageLevel > 0){
        paintWeathering(ctx, cxm, cym, minX, maxX, W, L, opts.damageLevel, opts.weatherSeed || 1);
      }      // inset deck plate (sealed perimeter)
      ctx.strokeStyle = paintShade(bodyCol, 4); ctx.lineWidth = 1.5;
      paintBeginLocal(ctx, verts.map(([vx,vy]) => [cxm + (vx-cxm)*0.74, cym + (vy-cym)*0.74]));
      ctx.stroke();
      // center ridge
      ctx.strokeStyle = paintShade(bodyCol, 8); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(cxm, cym - W*0.72); ctx.lineTo(cxm, cym + W*0.72); ctx.stroke();
      // #TEX3: 发动机舱外观件覆盖 —— appearance.engineDeck 存在时用预设样式+手动位置，跳过内置
      const _engApp = opts.appearance && opts.appearance.engineDeck;
      if(_engApp && _engApp.style && _engApp.style !== 'none'){
        paintAppearancePart(ctx, 'engineDeck', _engApp.style,
          cxm + (_engApp.dx || 0), cym + (_engApp.dy || 0), 1, bodyCol, { mirror: !!_engApp.mirror });
      } else if(!_engApp || _engApp.style !== 'none'){
      // #TEX2-2026-10-15: 发动机舱重做 —— 百叶窗散热器 + 排气管 + 检修舱盖
      // 散热器格栅：两组百叶窗（深色底 + 亮色叶片线）
      for(const gy of [cym - W*0.34, cym + W*0.34]){
        const gx0 = minX + L*0.06, gx1 = minX + L*0.42;
        ctx.fillStyle = paintShade(bodyCol, -34);
        ctx.fillRect(gx0, gy - W*0.13, gx1 - gx0, W*0.26);
        ctx.strokeStyle = paintShade(bodyCol, 15); ctx.lineWidth = 0.9;
        for(let lx = gx0 + 2; lx < gx1 - 1; lx += 3.2){
          ctx.beginPath(); ctx.moveTo(lx, gy - W*0.11); ctx.lineTo(lx, gy + W*0.11); ctx.stroke();
        }
        ctx.strokeStyle = paintShade(bodyCol, -46); ctx.lineWidth = 1.2;
        ctx.strokeRect(gx0, gy - W*0.13, gx1 - gx0, W*0.26);
      }
      // 中央检修舱盖（两扇对开）
      const hx0 = minX + L*0.48, hx1 = minX + L*0.78;
      ctx.strokeStyle = paintShade(bodyCol, -26); ctx.lineWidth = 1.2;
      ctx.strokeRect(hx0, cym - W*0.30, hx1 - hx0, W*0.60);
      ctx.beginPath(); ctx.moveTo((hx0+hx1)/2, cym - W*0.30); ctx.lineTo((hx0+hx1)/2, cym + W*0.30); ctx.stroke();
      // 舱盖把手
      ctx.fillStyle = paintShade(bodyCol, 20);
      ctx.fillRect((hx0+hx1)/2 - 3, cym - 1, 2.4, 2);
      ctx.fillRect((hx0+hx1)/2 + 0.6, cym - 1, 2.4, 2);
      // 排气管：尾部两侧（深色管体 + 管口）
      for(const ey of [cym - W*0.52, cym + W*0.52]){
        const ex0 = minX + 1, ex1 = minX + L*0.20;
        ctx.fillStyle = paintShade(bodyCol, -40);
        ctx.beginPath();
        ctx.ellipse((ex0+ex1)/2, ey, (ex1-ex0)/2, 2.2, 0, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#141416';
        ctx.beginPath(); ctx.ellipse(ex0 + 1.5, ey, 1.6, 1.8, 0, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = paintShade(bodyCol, 10); ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.ellipse((ex0+ex1)/2, ey, (ex1-ex0)/2, 2.2, 0, 0, Math.PI*2); ctx.stroke();
      }
      } // end #TEX3 engineDeck 内置分支
      // 驾驶员舱盖（前左）+ 航向机枪球座（前右）
      const dhx = maxX - L*0.30;
      ctx.fillStyle = 'rgba(0,0,0,0.16)';
      ctx.beginPath(); ctx.arc(dhx + 0.7, cym - W*0.42 + 0.9, W*0.145, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = paintShade(bodyCol, -18);
      ctx.beginPath(); ctx.arc(dhx, cym - W*0.42, W*0.13, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = paintShade(bodyCol, 12); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(dhx, cym - W*0.42, W*0.13, 0, Math.PI*2); ctx.stroke();
      // 驾驶员周视镜（3 块）
      ctx.fillStyle = paintShade(bodyCol, 20);
      for(let k = -1; k <= 1; k++){
        ctx.fillRect(dhx + k*3.4 - 1, cym - W*0.42 - W*0.13 - 2.2, 1.6, 1.4);
      }
      // 机枪球座
      ctx.fillStyle = paintShade(bodyCol, -26);
      ctx.beginPath(); ctx.arc(dhx, cym + W*0.42, W*0.10, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#1a1a1e';
      ctx.beginPath(); ctx.arc(dhx, cym + W*0.42, W*0.045, 0, Math.PI*2); ctx.fill();
      // front glacis chevrons (front = +x, near maxX)
      ctx.strokeStyle = paintShade(bodyCol, 10); ctx.lineWidth = 1.5;
      for(const fx of [maxX - L*0.22, maxX - L*0.08]){
        ctx.beginPath(); ctx.moveTo(fx, cym - W*0.5); ctx.lineTo(fx + L*0.12, cym); ctx.lineTo(fx, cym + W*0.5); ctx.stroke();
      }
    } else {
      // #TEX8-2026-10-18：炮塔也要吃损伤 weathering。
      //   旧实现 `paintWeathering` 被 `if(isHull)` 包住，炮塔永远是「出厂漆」——
      //   残血时车体锈迹斑斑、炮塔锃亮如新，是长时间在实机里可见却无人报的缺陷
      //   （scripts/test-tanks.js 只断言「不抛错」，测不出来）。
      //   画在车长塔/瞄具之前：磨损是底漆层，机械件应覆盖在磨损之上。
      if(opts.damageLevel > 0 && !opts.faded){
        paintWeathering(ctx, cxm, cym, minX, maxX, W, L, opts.damageLevel, opts.weatherSeed || 1);
      }
      // #TEX3: 车长塔外观件覆盖 —— appearance.cupola 存在时用预设样式+手动位置，跳过内置
      // #3（2026-10-15）：cupola 支持数组（多个不同样式）
      const _cupApp = opts.appearance && opts.appearance.cupola;
      const _cupList = Array.isArray(_cupApp) ? _cupApp : (_cupApp ? [_cupApp] : []);
      const _hasCup = _cupList.some(c => c && c.style && c.style !== 'none');
      if(_hasCup){
        for(const _cup of _cupList){
          if(!_cup || !_cup.style || _cup.style === 'none') continue;
          paintAppearancePart(ctx, 'cupola', _cup.style,
            cxm + (_cup.dx || 0), cym + (_cup.dy || 0), 1, bodyCol, { mirror: !!_cup.mirror });
        }
      } else if(!_cupApp || _cupApp.style !== 'none'){
      // #TEX2-2026-10-15: 车长塔重做 —— 装甲围圈 + 周视镜环 + 对开舱盖 + 提手
      const cupolas = (opts.heightClass === 'heavy' || opts.hasTurret === false) ? 2 : 1;
      const cupCy = cym - W*0.44;
      const cupolaAt = (ccx, cr) => {
        // #TEX12：投影——舱盖是凸起件，左上受光 ⇒ 右下投影。与整车光源同向。
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.beginPath(); ctx.arc(ccx + 0.9, cupCy + 1.2, cr * 1.06, 0, Math.PI*2); ctx.fill();
        // 基座（深色）
        ctx.fillStyle = paintShade(bodyCol, -30);
        ctx.beginPath(); ctx.arc(ccx, cupCy, cr, 0, Math.PI*2); ctx.fill();
        // 装甲围圈（亮边）
        ctx.strokeStyle = paintShade(bodyCol, 16); ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(ccx, cupCy, cr, 0, Math.PI*2); ctx.stroke();
        // 周视镜：8 块小镜环绕
        ctx.fillStyle = paintShade(bodyCol, 22);
        for(let k = 0; k < 8; k++){
          const a = k * Math.PI/4;
          const px = ccx + Math.cos(a) * cr * 0.72, py = cupCy + Math.sin(a) * cr * 0.72;
          ctx.beginPath(); ctx.arc(px, py, cr*0.115, 0, Math.PI*2); ctx.fill();
        }
        // 对开舱盖：中线 + 两扇
        ctx.fillStyle = paintShade(bodyCol, -12);
        ctx.beginPath(); ctx.arc(ccx, cupCy, cr*0.52, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = paintShade(bodyCol, -38); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(ccx, cupCy, cr*0.52, 0, Math.PI*2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(ccx - cr*0.52, cupCy); ctx.lineTo(ccx + cr*0.52, cupCy); ctx.stroke();
        // 舱盖提手
        ctx.strokeStyle = paintShade(bodyCol, 18); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(ccx, cupCy - cr*0.26, cr*0.16, Math.PI, 0); ctx.stroke();
        ctx.beginPath(); ctx.arc(ccx, cupCy + cr*0.26, cr*0.16, 0, Math.PI); ctx.stroke();
      };
      if(cupolas === 1){
        cupolaAt(cxm - L*0.08, W*0.17);
      } else {
        cupolaAt(cxm - L*0.30, W*0.15);
        cupolaAt(cxm + L*0.18, W*0.15);
      }      // 炮手瞄具（前右）：镜座 + 镜片
      const sx = maxX - (maxX-minX)*0.45, sy = cym + W*0.08, sw = W*0.5, sh = W*0.18;
      ctx.fillStyle = 'rgba(0,0,0,0.16)';
      ctx.fillRect(sx + 0.8, sy + 1.0, sw, sh);
      ctx.fillStyle = paintShade(bodyCol, -24);
      ctx.fillRect(sx, sy, sw, sh);
      ctx.strokeStyle = paintShade(bodyCol, 12); ctx.lineWidth = 1;
      ctx.strokeRect(sx, sy, sw, sh);
      ctx.fillStyle = '#1a2530';
      ctx.fillRect(sx + sw*0.2, sy + sh*0.25, sw*0.6, sh*0.5);
      // 装填手舱盖（后右小圆）
      ctx.fillStyle = 'rgba(0,0,0,0.14)';
      ctx.beginPath(); ctx.arc(cxm + L*0.32 + 0.7, cym + W*0.40 + 0.9, W*0.125, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = paintShade(bodyCol, -20);
      ctx.beginPath(); ctx.arc(cxm + L*0.32, cym + W*0.40, W*0.11, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = paintShade(bodyCol, 10); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(cxm + L*0.32, cym + W*0.40, W*0.11, 0, Math.PI*2); ctx.stroke();
      } // end #TEX3 cupola 内置分支
    }
  }
  ctx.restore();
}

// --- 程序化装饰件库（2026-10-15 #TEX：回归程序化，替代 AI 精灵）---
// 材质层（#TEX12-2026-10-18）：在涂装之上、机械件之下，给「平涂色块」补上喷漆钢板的
// 物理质感。顺序很关键——它必须盖住迷彩（统一材质），又必须被铆钉/舱盖压住。
//   ① 倒角：渐变描边（左上受光→右下蔽光），clip 内只露内侧一半 ⇒ 棱边有厚度的暗示；
//   ② 拉丝：沿车体长轴的长而淡的明暗线（轧制方向/漆面流平）；
//   ③ 细颗粒：亚像素级漆面颗粒，超采样降采样后不闪、不脏；
//   ④ 积尘：下缘暖色渐变（车体比炮塔重）。
function paintMaterialPass(ctx, verts, minX, maxX, minY, maxY, W, L, isHull, seed){
  const w = maxX - minX, h = maxY - minY;
  if(!(w > 0) || !(h > 0)) return;
  const cxm = (minX + maxX) / 2, cym = (minY + maxY) / 2;
  // ① 内侧环境光遮蔽：把多边形向质心收 3 圈并描边，形成一圈 3~4px 的软暗边。
  //    比径向 vignette 贴合任意多边形轮廓（车体是箭头形，不是椭圆）。
  for(let k = 1; k <= 3; k++){
    const t = 1 - k * 0.028;
    ctx.strokeStyle = `rgba(0,0,0,${(0.14 - k * 0.025).toFixed(2)})`;
    ctx.lineWidth = 1.6;
    paintBeginLocal(ctx, verts.map(([x, y]) => [cxm + (x - cxm) * t, cym + (y - cym) * t]));
    ctx.stroke();
  }
  // ② 倒角（左上受光→右下蔽光）
  const bevel = ctx.createLinearGradient(minX, minY, maxX, maxY);
  bevel.addColorStop(0, 'rgba(255,255,255,0.26)');
  bevel.addColorStop(0.42, 'rgba(255,255,255,0)');
  bevel.addColorStop(1, 'rgba(0,0,0,0.30)');
  ctx.strokeStyle = bevel;
  ctx.lineWidth = 2.2;
  paintBeginLocal(ctx, verts);
  ctx.stroke();
  // ②b 受光侧补一条偏移亮边（左上）+ 背光侧一条偏移暗边（右下）：
  //     在 clip 内只保留内侧一半，形成真实的棱边高光/接触阴影。
  ctx.save();
  ctx.translate(-0.7, -0.7);
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1.1;
  paintBeginLocal(ctx, verts); ctx.stroke();
  ctx.restore();
  ctx.save();
  ctx.translate(0.8, 0.8);
  ctx.strokeStyle = 'rgba(0,0,0,0.16)';
  ctx.lineWidth = 1.2;
  paintBeginLocal(ctx, verts); ctx.stroke();
  ctx.restore();
  // ③ 受光面高光池：左上一个大而淡的径向亮斑，模拟漆面的宽高光
  const sheen = ctx.createRadialGradient(cxm - w*0.22, cym - h*0.24, 1, cxm - w*0.22, cym - h*0.24, Math.max(w, h)*0.55);
  sheen.addColorStop(0, 'rgba(255,255,255,0.07)');
  sheen.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(minX - 2, minY - 2, w + 4, h + 4);
  // ④ 拉丝（方向沿 +x：车体轧制/行驶方向）
  for(let i = 0; i < 26; i++){
    const y = minY + _texRand(seed + 17, i * 3 + 1) * h;
    const x0 = minX + _texRand(seed + 17, i * 3 + 2) * w * 0.8;
    const len = 5 + _texRand(seed + 17, i * 3 + 3) * w * 0.45;
    const light = _texRand(seed + 29, i) > 0.5;
    ctx.strokeStyle = light ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.045)';
    ctx.lineWidth = 0.6;
    ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(Math.min(maxX, x0 + len), y + (i % 3 - 1) * 0.35); ctx.stroke();
  }
  // ⑤ 细颗粒（面积自适应：车体 ~220 个，炮塔 ~90 个）
  const grains = Math.max(40, Math.round(w * h * 0.08));
  _texGrain(ctx, { minX, minY, maxX, maxY }, grains,
    'rgba(0,0,0,0.05)', 'rgba(255,255,255,0.045)', seed + 101);
  // ⑥ 积尘：下缘暖色（比首版收敛，避免把迷彩洗成灰雾）
  const dust = ctx.createLinearGradient(0, minY + h * 0.48, 0, maxY);
  dust.addColorStop(0, 'rgba(116,94,62,0)');
  dust.addColorStop(1, `rgba(116,94,62,${isHull ? 0.10 : 0.05})`);
  ctx.fillStyle = dust;
  ctx.fillRect(minX - 2, minY - 2, w + 4, h + 4);
}

// 边缘磨损（#TEX11-2026-10-18）：沿部件多边形边界**内侧**撒掉漆/金属亮点 + 锈迹拖尾。
// 与面内随机 weathering 的区别：位置由「边 + 沿边 t」派生，天然贴合轮廓，
// 小尺寸下读作「棱边磨白」，而不是装甲面上的彩色碎屑。
function paintEdgeWear(ctx, verts, isHull, minX, maxX, W, L, level, seed){
  if(!(level > 0) || !verts || verts.length < 3) return;
  const n = verts.length;
  let gx = 0, gy = 0;
  for(const [vx, vy] of verts){ gx += vx; gy += vy; }
  gx /= n; gy /= n;
  // 每个损伤等级 16+ 个点；车体点多于炮塔（车体棱边长）
  const count = Math.round((isHull ? 19 : 12) + level * (isHull ? 10 : 7));
  ctx.save();
  for(let i = 0; i < count; i++){
    const e = Math.floor(_texRand(seed, i * 5 + 1) * n);
    const a = verts[e], b = verts[(e + 1) % n];
    const t = 0.08 + _texRand(seed, i * 5 + 2) * 0.84;
    const px = a[0] + (b[0] - a[0]) * t;
    const py = a[1] + (b[1] - a[1]) * t;
    // 朝质心的内法线：掉漆从棱边往里扩散 1.0~3.0px
    const nx = gx - px, ny = gy - py;
    const nl = Math.hypot(nx, ny) || 1;
    const inset = 1.0 + _texRand(seed, i * 5 + 3) * 2.0;
    const x = px + nx / nl * inset;
    const y = py + ny / nl * inset;
    const sz = 0.8 + _texRand(seed, i * 5 + 4) * 1.6;
    // 掉漆的露底颜色两种：亮金属（多数）与深褐锈底（少数）——浅色车（沙漠/冬季）上
    // 只有亮金属会和底色糊在一起，必须靠深色缺口提供对比。
    const lightChip = _texRand(seed, i * 5 + 5) > 0.42;
    ctx.fillStyle = lightChip
      ? `rgba(206,204,196,${(0.34 + level * 0.08).toFixed(2)})`
      : `rgba(92,74,54,${(0.34 + level * 0.07).toFixed(2)})`;
    ctx.fillRect(x - sz / 2, y - sz / 2, sz, sz);
    // 1px 下方阴影：让缺口有深度而不是「亮点」
    ctx.fillStyle = 'rgba(16,15,12,0.30)';
    ctx.fillRect(x - sz / 2, y + sz / 2, sz, 0.8);
    // 等级 ≥2：锈水沿重力方向（+y）渗一小段
    if(level >= 2){
      ctx.fillStyle = 'rgba(112,66,30,0.24)';
      ctx.fillRect(x - 0.6, y + sz * 0.5, 1.2, 1.5 + level);
    }
  }
  // 等级 3：棱边整体稍微磨白（一层 1px 亮边，模拟漆面被磨薄）
  if(level >= 3){
    ctx.strokeStyle = 'rgba(198,194,182,0.16)';
    ctx.lineWidth = 1;
    paintBeginLocal(ctx, verts);
    ctx.stroke();
  }
  ctx.restore();
}

// 铆钉排：沿甲板边缘一圈铆钉（local 坐标系，cxm/cym 为中心）
function paintRivets(ctx, cxm, cym, minX, maxX, W, L, bodyCol){
  const rx0 = minX + L*0.06, rx1 = maxX - L*0.06;
  const ry = W*0.62;
  ctx.fillStyle = paintShade(bodyCol, -22);
  const step = Math.max(6, L*0.055);
  for(let x = rx0; x <= rx1 + 0.5; x += step){
    for(const y of [cym - ry, cym + ry]){
      ctx.beginPath(); ctx.arc(x, y, 1.1, 0, Math.PI*2); ctx.fill();
    }
  }
  // 铆钉高光点（#TEX11：+26 提亮在 1:1 下会连成一条「LED 点阵」边，压到 +14）
  ctx.fillStyle = paintShade(bodyCol, 14);
  for(let x = rx0; x <= rx1 + 0.5; x += step){
    for(const y of [cym - ry, cym + ry]){
      ctx.beginPath(); ctx.arc(x - 0.35, y - 0.35, 0.35, 0, Math.PI*2); ctx.fill();
    }
  }
}

// 确定性伪随机（装饰/weathering 用，保证同车同 seed 同结果）
function _hash2(x, y, seed){
  let h = (x*374761393 + y*668265263 + seed*974634) | 0;
  h = (h ^ (h >> 13)) | 0;
  return ((h * 1274126177) >>> 0) / 4294967295;
}

// weathering：level 0~3（0=出厂，3=重伤）。划痕/锈斑/泥点，随 level 加重。
function paintWeathering(ctx, cxm, cym, minX, maxX, W, L, level, seed){
  if(!(level > 0)) return;
  seed = seed || 1;
  const n = level * 4;
  // 划痕（浅色细线）
  ctx.strokeStyle = 'rgba(210,200,180,0.5)'; ctx.lineWidth = 0.8;
  for(let i = 0; i < n; i++){
    const x = minX + _hash2(i, 7, seed) * (maxX - minX);
    const y = cym - W*0.5 + _hash2(i, 13, seed) * W;
    const a = _hash2(i, 29, seed) * Math.PI;
    const len = 3 + _hash2(i, 41, seed) * 7;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a)*len, y + Math.sin(a)*len);
    ctx.stroke();
  }
  // 锈斑（深棕椭圆，level≥2）
  if(level >= 2){
    for(let i = 0; i < level * 3; i++){
      const x = minX + _hash2(i, 53, seed) * (maxX - minX);
      const y = cym - W*0.5 + _hash2(i, 67, seed) * W;
      // #TEX10-2026-10-18：锈斑半径原先 1.5~4.5px、alpha 0.55~0.85，在 73×38 的车体上
      // 只能盖住 ~1% 面积，audit 实测 paint_soviet 的 dmg0→dmg3 差异块仅 3.0%（等于看不见）。
      // 放大到 2.5~6.5px 并保持高 alpha，让损伤等级在小尺寸下仍然可读。
      const r = 2.5 + _hash2(i, 79, seed) * 4;
      ctx.fillStyle = `rgba(122,72,32,${0.38 + 0.17*level})`;
      ctx.beginPath(); ctx.ellipse(x, y, r, r*0.7, _hash2(i, 83, seed)*3, 0, Math.PI*2); ctx.fill();
    }
  }
  // 泥点（履带附近，level≥1）
  ctx.fillStyle = 'rgba(96,74,48,0.55)';
  for(let i = 0; i < level * 5; i++){
    const side = i % 2 === 0 ? -1 : 1;
    const x = minX + _hash2(i, 97, seed) * (maxX - minX);
    const y = cym + side * (W*0.5 + _hash2(i, 103, seed) * W*0.28);
    const r = 1 + _hash2(i, 109, seed) * 2.2;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.fill();
  }
  // 掉漆露金属（level 3：深色斑块）
  if(level >= 3){
    ctx.fillStyle = 'rgba(52,52,58,0.7)';
    for(let i = 0; i < 6; i++){
      const x = minX + _hash2(i, 127, seed) * (maxX - minX);
      const y = cym - W*0.4 + _hash2(i, 131, seed) * W*0.8;
      const r = 2 + _hash2(i, 137, seed) * 3.5;
      ctx.beginPath(); ctx.ellipse(x, y, r, r*0.6, 0, 0, Math.PI*2); ctx.fill();
    }
  }
}

// 装饰件绘制函数表：每个在原点居中绘制，s 为缩放（约坦克 local 尺寸/60）。
// 风格：深色描边 + 高对比色块，保证 60px 下可读。
// --- 外观件预设样式（2026-10-15 #TEX3：设计器外观标签）---
// 每个外观件多种预设样式；tanks/*.json 的 appearance 字段引用：
//   appearance: { cupola: { style:'standard', dx:0, dy:0, mirror:false },
//                 engineDeck: { style:'standard', dx:0, dy:0, mirror:false } }
// dx/dy 为相对默认位置的偏移（local 单位），mirror 为 Y 轴镜像。
const APPEARANCE_PRESETS = {
  cupola: {
    standard: { name: '标准车长塔', desc: '装甲围圈+8周视镜+对开舱盖' },
    low: { name: '低轮廓', desc: '无围圈矮塔+6周视镜，适合歼击车' },
    panoramic: { name: '全景塔', desc: '高围圈+10周视镜+单开大舱盖' },
    none: { name: '无', desc: '不画车长塔' },
  },
  engineDeck: {
    standard: { name: '标准发动机舱', desc: '双百叶窗散热器+检修盖+双排气管' },
    rearGrille: { name: '尾部大格栅', desc: '整块尾部格栅+单排气管，适合重型' },
    compact: { name: '紧凑型', desc: '单散热器+单排气管，适合轻型' },
    none: { name: '无', desc: '不画发动机舱细节' },
  },
};

// 外观件绘制：style 预设 + 位置偏移 + 镜像
// part: 'cupola' | 'engineDeck'；x, y 为部件锚点（local 坐标）；s 缩放；bodyCol 车体实色
function paintAppearancePart(ctx, part, style, x, y, s, bodyCol, opts){
  opts = opts || {};
  if(!style || style === 'none') return;
  ctx.save();
  ctx.translate(x, y);
  if(opts.mirror) ctx.scale(1, -1);
  ctx.scale(s, s);
  if(part === 'cupola') _paintCupolaStyle(ctx, style, bodyCol, opts);
  else if(part === 'engineDeck') _paintEngineDeckStyle(ctx, style, bodyCol, opts);
  ctx.restore();
}

function _paintCupolaStyle(ctx, style, bodyCol, opts){
  const cr = 6;  // 基准半径
  if(style === 'low'){
    // 低轮廓：矮圈+6镜
    ctx.fillStyle = paintShade(bodyCol, -26);
    ctx.beginPath(); ctx.arc(0, 0, cr*0.8, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = paintShade(bodyCol, 12); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(0, 0, cr*0.8, 0, Math.PI*2); ctx.stroke();
    ctx.fillStyle = paintShade(bodyCol, 20);
    for(let k = 0; k < 6; k++){
      const a = k * Math.PI/3;
      ctx.beginPath(); ctx.arc(Math.cos(a)*cr*0.55, Math.sin(a)*cr*0.55, cr*0.105, 0, Math.PI*2); ctx.fill();
    }
    ctx.fillStyle = paintShade(bodyCol, -10);
    ctx.beginPath(); ctx.arc(0, 0, cr*0.42, 0, Math.PI*2); ctx.fill();
  } else if(style === 'panoramic'){
    // 全景塔：高圈+10镜+大单盖
    ctx.fillStyle = paintShade(bodyCol, -32);
    ctx.beginPath(); ctx.arc(0, 0, cr*1.15, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = paintShade(bodyCol, 16); ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(0, 0, cr*1.15, 0, Math.PI*2); ctx.stroke();
    ctx.fillStyle = paintShade(bodyCol, 22);
    for(let k = 0; k < 10; k++){
      const a = k * Math.PI/5;
      ctx.beginPath(); ctx.arc(Math.cos(a)*cr*0.82, Math.sin(a)*cr*0.82, cr*0.105, 0, Math.PI*2); ctx.fill();
    }
    ctx.fillStyle = paintShade(bodyCol, -8);
    ctx.beginPath(); ctx.arc(0, 0, cr*0.62, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = paintShade(bodyCol, -40); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(0, 0, cr*0.62, 0, Math.PI*2); ctx.stroke();
  } else {
    // standard：装甲围圈+8周视镜+对开舱盖（与现有炮塔车长塔一致）
    ctx.fillStyle = paintShade(bodyCol, -30);
    ctx.beginPath(); ctx.arc(0, 0, cr, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = paintShade(bodyCol, 16); ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(0, 0, cr, 0, Math.PI*2); ctx.stroke();
    ctx.fillStyle = paintShade(bodyCol, 22);
    for(let k = 0; k < 8; k++){
      const a = k * Math.PI/4;
      ctx.beginPath(); ctx.arc(Math.cos(a)*cr*0.72, Math.sin(a)*cr*0.72, cr*0.115, 0, Math.PI*2); ctx.fill();
    }
    ctx.fillStyle = paintShade(bodyCol, -12);
    ctx.beginPath(); ctx.arc(0, 0, cr*0.52, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = paintShade(bodyCol, -38); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(0, 0, cr*0.52, 0, Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-cr*0.52, 0); ctx.lineTo(cr*0.52, 0); ctx.stroke();
  }
}

function _paintEngineDeckStyle(ctx, style, bodyCol, opts){
  if(style === 'rearGrille'){
    // 尾部大格栅：整块+横叶片
    ctx.fillStyle = paintShade(bodyCol, -36);
    ctx.fillRect(-14, -8, 28, 16);
    ctx.strokeStyle = paintShade(bodyCol, 14); ctx.lineWidth = 0.9;
    for(let ly = -6; ly <= 6; ly += 3){
      ctx.beginPath(); ctx.moveTo(-13, ly); ctx.lineTo(13, ly); ctx.stroke();
    }
    ctx.strokeStyle = paintShade(bodyCol, -48); ctx.lineWidth = 1.2;
    ctx.strokeRect(-14, -8, 28, 16);
    // 单粗排气管
    ctx.fillStyle = paintShade(bodyCol, -42);
    ctx.beginPath(); ctx.ellipse(0, 11, 7, 2.6, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#141416';
    ctx.beginPath(); ctx.ellipse(-5, 11, 2, 2.2, 0, 0, Math.PI*2); ctx.fill();
  } else if(style === 'compact'){
    // 紧凑型：单散热器+单排气管
    ctx.fillStyle = paintShade(bodyCol, -34);
    ctx.fillRect(-8, -6, 16, 12);
    ctx.strokeStyle = paintShade(bodyCol, 14); ctx.lineWidth = 0.9;
    for(let lx = -6; lx <= 6; lx += 3){
      ctx.beginPath(); ctx.moveTo(lx, -5); ctx.lineTo(lx, 5); ctx.stroke();
    }
    ctx.fillStyle = paintShade(bodyCol, -40);
    ctx.beginPath(); ctx.ellipse(0, 9, 5, 2, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#141416';
    ctx.beginPath(); ctx.ellipse(-3.5, 9, 1.4, 1.6, 0, 0, Math.PI*2); ctx.fill();
  } else {
    // standard：双百叶窗+检修盖+双排气管（与现有车体发动机舱一致，简化版）
    for(const gy of [-6, 6]){
      ctx.fillStyle = paintShade(bodyCol, -34);
      ctx.fillRect(-12, gy - 3.5, 16, 7);
      ctx.strokeStyle = paintShade(bodyCol, 14); ctx.lineWidth = 0.8;
      for(let lx = -10; lx < 2; lx += 2.8){
        ctx.beginPath(); ctx.moveTo(lx, gy - 3); ctx.lineTo(lx, gy + 3); ctx.stroke();
      }
    }
    ctx.strokeStyle = paintShade(bodyCol, -26); ctx.lineWidth = 1;
    ctx.strokeRect(6, -7, 10, 14);
    for(const ey of [-9, 9]){
      ctx.fillStyle = paintShade(bodyCol, -40);
      ctx.beginPath(); ctx.ellipse(-14, ey, 5, 2, 0, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#141416';
      ctx.beginPath(); ctx.ellipse(-17, ey, 1.5, 1.6, 0, 0, Math.PI*2); ctx.fill();
    }
  }
}

const DECORATION_DEFS = {
  // 工具箱：矩形箱体 + 盖缝线 + 提手
  toolbox(ctx, s){
    const w = 10*s, h = 5*s;
    ctx.fillStyle = '#5a4a33';
    ctx.fillRect(-w/2, -h/2, w, h);
    ctx.strokeStyle = 'rgba(15,15,18,0.7)'; ctx.lineWidth = 1;
    ctx.strokeRect(-w/2, -h/2, w, h);
    ctx.beginPath(); ctx.moveTo(-w/2, 0); ctx.lineTo(w/2, 0); ctx.stroke();
    ctx.strokeStyle = '#3a3a3e'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(-2*s, -h/2); ctx.lineTo(-2*s, -h/2 - 1.6*s);
    ctx.lineTo(2*s, -h/2 - 1.6*s); ctx.lineTo(2*s, -h/2); ctx.stroke();
  },
  // 备用履带节：4 节链条
  spareTrack(ctx, s){
    ctx.fillStyle = '#2e2e33';
    for(let i = 0; i < 4; i++){
      const x = (i - 1.5) * 3.2 * s;
      ctx.fillRect(x - 1.4*s, -2.2*s, 2.8*s, 4.4*s);
      ctx.strokeStyle = 'rgba(15,15,18,0.8)'; ctx.lineWidth = 0.8;
      ctx.strokeRect(x - 1.4*s, -2.2*s, 2.8*s, 4.4*s);
    }
    ctx.fillStyle = '#4a4a52';
    for(let i = 0; i < 4; i++){
      const x = (i - 1.5) * 3.2 * s;
      ctx.fillRect(x - 0.5*s, -1.6*s, 1*s, 3.2*s);
    }
  },
  // 油桶：矩形 + X 压纹
  jerryCan(ctx, s){
    const w = 5.5*s, h = 7*s;
    ctx.fillStyle = '#4f5b33';
    ctx.fillRect(-w/2, -h/2, w, h);
    ctx.strokeStyle = 'rgba(15,15,18,0.7)'; ctx.lineWidth = 1;
    ctx.strokeRect(-w/2, -h/2, w, h);
    ctx.beginPath();
    ctx.moveTo(-w/2+1, -h/2+1); ctx.lineTo(w/2-1, h/2-1);
    ctx.moveTo(w/2-1, -h/2+1); ctx.lineTo(-w/2+1, h/2-1);
    ctx.stroke();
    ctx.fillStyle = '#3a3a3e';
    ctx.fillRect(-1*s, -h/2 - 1.2*s, 2*s, 1.2*s);
  },
  // 圆木：横置圆柱
  log(ctx, s){
    const w = 12*s, h = 3.6*s;
    ctx.fillStyle = '#6b4e2e';
    ctx.beginPath(); ctx.ellipse(0, 0, w/2, h/2, 0, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = 'rgba(15,15,18,0.7)'; ctx.lineWidth = 1;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(60,40,20,0.6)'; ctx.lineWidth = 0.7;
    for(const dx of [-w*0.25, 0, w*0.25]){
      ctx.beginPath(); ctx.moveTo(dx, -h/2 + 0.5); ctx.lineTo(dx, h/2 - 0.5); ctx.stroke();
    }
    ctx.fillStyle = '#8a6a42';
    ctx.beginPath(); ctx.ellipse(w/2 - 0.5, 0, 1.2*s, h/2 - 0.6, 0, 0, Math.PI*2); ctx.fill();
  },
  // 工兵铲：柄 + 铲头
  shovel(ctx, s){
    ctx.strokeStyle = '#7a5c38'; ctx.lineWidth = 1.6*s; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-5*s, 0); ctx.lineTo(3*s, 0); ctx.stroke();
    ctx.fillStyle = '#565660';
    ctx.beginPath();
    ctx.moveTo(3*s, -2.2*s); ctx.lineTo(7*s, -2.2*s);
    ctx.lineTo(7*s, 2.2*s); ctx.lineTo(3*s, 2.2*s);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(15,15,18,0.7)'; ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.lineCap = 'butt';
  },
  // 伪装网：半透明网纹方块
  camoNet(ctx, s){
    const w = 11*s, h = 8*s;
    ctx.fillStyle = 'rgba(74,90,52,0.55)';
    ctx.fillRect(-w/2, -h/2, w, h);
    ctx.strokeStyle = 'rgba(40,52,28,0.7)'; ctx.lineWidth = 0.7;
    const step = 2.4*s;
    for(let x = -w/2; x <= w/2; x += step){
      ctx.beginPath(); ctx.moveTo(x, -h/2); ctx.lineTo(x, h/2); ctx.stroke();
    }
    for(let y = -h/2; y <= h/2; y += step){
      ctx.beginPath(); ctx.moveTo(-w/2, y); ctx.lineTo(w/2, y); ctx.stroke();
    }
  },
  // #3（2026-10-15）：新增 3 种杂物预设
  oilDrum(ctx, s){
    const r = 3.2*s;
    ctx.fillStyle = '#4a5a3a';
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = 'rgba(15,15,18,0.7)'; ctx.lineWidth = 0.8; ctx.stroke();
    ctx.strokeStyle = '#3a4a2e'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(0, 0, r*0.6, 0, Math.PI*2); ctx.stroke();
  },
  ropeCoil(ctx, s){
    ctx.strokeStyle = '#8a7355'; ctx.lineWidth = 1.4*s;
    for(let r = 3.5*s; r > 0.5*s; r -= 1.1*s){
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI*2); ctx.stroke();
    }
  },
  sandbag(ctx, s){
    const w = 8*s, h = 4*s;
    ctx.fillStyle = '#9a8a68';
    ctx.beginPath(); ctx.ellipse(0, 0, w/2, h/2, 0.2, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = 'rgba(15,15,18,0.6)'; ctx.lineWidth = 0.8; ctx.stroke();
    ctx.strokeStyle = 'rgba(120,105,80,0.5)'; ctx.lineWidth = 0.6;
    ctx.beginPath(); ctx.moveTo(-w/3, -h/4); ctx.lineTo(w/3, h/4); ctx.stroke();
  },
};

// paintPartTexture(ctx, verts, cx, cy, angle, scale, color, kind, opts)
//   kind : 'hull' | 'turret'
//   opts : { faded?:boolean, detail?:boolean }
//     faded  — edit modes: faint base paint only (keeps vertex/edge editing readable)
//     detail — full texture (deck plate, grilles, hatch, etc.); skipped when faded
// Local-unit geometry; clip to the part polygon, then stamp simplified top-down details.
function paintPartTexture(ctx, verts, cx, cy, angle, scale, color, kind, opts){
  opts = opts || {};
  // If we are in high performance mode (detail && !faded) and scale is constant (e.g. 1 in play), use the offscreen cache.
  // When zoomed or faded, bypass the cache to draw sharp vectors.
  if (!opts.faded && opts.detail !== false && scale === 1) {
    const entry = getCachedTankSprite(color, kind, verts, opts.hasTurret !== false, opts.heightClass, opts.texture,
      { damageLevel: opts.damageLevel, weatherSeed: opts.weatherSeed, appearance: opts.appearance, texBox: opts.texBox });
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle || 0);
    // 2× 超采样位图 → 1× 显示：缩放 1/S 后浏览器以双线性降采样
    const inv = 1 / (entry.scale || SPRITE_SCALE);
    if (inv !== 1) ctx.scale(inv, inv);
    if ('imageSmoothingEnabled' in ctx) ctx.imageSmoothingEnabled = true;
    ctx.drawImage(entry.canvas, -entry.cx, -entry.cy);
    ctx.restore();
  } else {
    paintPartTextureDirect(ctx, verts, cx, cy, angle, scale, color, kind, opts);
  }
}


// ---------- image sprite overlay (整车精灵替换通道) ----------
// spriteImage(path): 浏览器 Image 缓存（按路径）；Node/无图时返回 null。
// paintPartSprite(ctx, img, cx, cy, angle, viewScale, scale, dx, dy, rotDeg, pivot):
//   在部件中心 (cx,cy) 处绘制图片精灵。
//   scale   — 模型单位/图片像素（图片显示尺寸 = imgW*scale 模型单位）
//   dx, dy  — 部件局部帧下的偏移（模型单位，+x 为前）
//   rotDeg  — 叠加旋转（度）
//   pivot   — [px,py] 图片像素坐标的旋转中心（缺省为图片中心）；炮塔精灵用座圈中心
//   viewScale — 屏幕像素/模型单位（游戏内恒为 1）
// 返回是否实际绘制（图片未就绪时返回 false，调用方可回退程序化绘制）。
const SPRITE_CACHE = new Map();
function spriteImage(path){
  if(!path) return null;
  if(SPRITE_CACHE.has(path)) return SPRITE_CACHE.get(path);
  if(typeof Image === 'undefined' || typeof document === 'undefined'){
    SPRITE_CACHE.set(path, null);
    return null;
  }
  const img = new Image();
  img.src = path;
  SPRITE_CACHE.set(path, img);
  return img;
}
function clearSpriteCache(){
  SPRITE_CACHE.clear();
}
function paintPartSprite(ctx, img, cx, cy, angle, viewScale, scale, dx, dy, rotDeg, pivot){
  if(!img || !img.complete || !img.naturalWidth) return false;
  const s = (scale || 0) * (viewScale || 1);
  if(!(s > 0)) return false;
  const px = pivot ? pivot[0] : img.naturalWidth/2;
  const py = pivot ? pivot[1] : img.naturalHeight/2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((angle || 0) + (rotDeg || 0)*Math.PI/180);
  ctx.translate((dx || 0)*(viewScale || 1), (dy || 0)*(viewScale || 1));
  ctx.drawImage(img, -px*s, -py*s, img.naturalWidth*s, img.naturalHeight*s);
  ctx.restore();
  return true;
}

// #4（2026-10-19 用户裁定）：车长塔位置此前**只存在于绘制公式里**（见上方 `cupolaAt` 的
//   调用点），没有运行时 API。副炮塔要求「位置放在第一个车长塔上，如果没有车长塔就放在
//   炮塔旋转中心」⇒ 把该公式抽成共享纯函数，供绘制层与 `secondaryTurretPose` 共用。
//
//   口径（与绘制公式完全一致）：
//     · 重坦 或 无炮塔车型 → 2 个车长塔；否则 1 个
//     · 纵向共用 `cupCy = cym - W*0.44`（注意绘制调用里传的第二个参数是半径 cr，不是 y）
//     · 单塔 `ccx = cxm - L*0.08`；双塔第 1 个 `ccx = cxm - L*0.30`、第 2 个 `cxm + L*0.18`
//
//   @param {{verts?:number[][], heightClass?:string, hasTurret?:boolean, cupolaStyle?:string}} opts
//   @returns {{x:number,y:number}|null} 第一个车长塔的**车体局部坐标**（相对车体中心）；
//     无车长塔（样式 none / 无顶点）时返回 null，调用方回退到炮塔旋转中心。
function cupolaAnchor(opts) {
  var o = opts || {};
  if (o.cupolaStyle === 'none') return null;
  var verts = o.verts;
  if (!Array.isArray(verts) || !verts.length) return null;
  var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (var i = 0; i < verts.length; i++) {
    var v = verts[i];
    if (!v) continue;
    if (v[0] < minX) minX = v[0]; if (v[0] > maxX) maxX = v[0];
    if (v[1] < minY) minY = v[1]; if (v[1] > maxY) maxY = v[1];
  }
  if (!isFinite(minX) || !isFinite(maxX)) return null;
  var L = (maxX - minX) / 2, W = (maxY - minY) / 2;
  var cxm = (minX + maxX) / 2, cym = (minY + maxY) / 2;
  var twoCupolas = (o.heightClass === 'heavy' || o.hasTurret === false);
  var cupCy = cym - W * 0.44;
  var ccx = twoCupolas ? (cxm - L * 0.30) : (cxm - L * 0.08);
  return { x: ccx, y: cupCy };
}
if (typeof globalThis !== 'undefined') { globalThis.cupolaAnchor = cupolaAnchor; }

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    cupolaAnchor,
    paintShade,
    tankBodyColor,
    paintBounds,
    paintBeginLocal,
    paintClipLocal,
    paintTracks,
    paintTurretShadow,
    TEXTURE_DEFS,
    paintPatternBox,
    paintEdgeWear,
    PAINT_CACHE,
    clearPaintCache,
    SPRITE_SCALE,
    getSpriteScale,
    setSpriteScale,
    setPaintMaterial,
    getPaintMaterial,
    getCachedTankSprite,
    spriteView1x,
    paintPartTextureDirect,
    paintPartTexture,
    paintRivets,
    paintWeathering,
    DECORATION_DEFS,
    APPEARANCE_PRESETS,
    paintAppearancePart,
    SPRITE_CACHE,
    spriteImage,
    clearSpriteCache,
    paintPartSprite
  };
}
