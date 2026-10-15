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
  const tw = (opts.trackWidth || 7) / scale;
  const offsetExtra = (opts.trackOffset || 0) / scale;
  const cxm = (minX+maxX)/2, cym = (minY+maxY)/2;
  const yTop = cym - W - tw/2 - offsetExtra, yBot = cym + W + tw/2 + offsetExtra;
  const x0 = cxm - L*0.98, x1 = cxm + L*0.98;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle||0);
  ctx.scale(scale, scale);
  // #TEX2-2026-10-15: 履带重做 —— 不再是圆角矩形条，画独立履带节 + 中央导向齿 + 端部弧形
  for(const yc of [yTop, yBot]){
    // 履带基体（深色）
    ctx.fillStyle = paintShade(color, -58);
    // 主体：胶囊形（两端半圆，模拟主动轮/诱导轮弧度）
    ctx.beginPath();
    const r = tw/2;
    ctx.moveTo(x0 + r, yc - r);
    ctx.lineTo(x1 - r, yc - r);
    ctx.arc(x1 - r, yc, r, -Math.PI/2, Math.PI/2);
    ctx.lineTo(x0 + r, yc + r);
    ctx.arc(x0 + r, yc, r, Math.PI/2, Math.PI*1.5);
    ctx.closePath(); ctx.fill();
    // 外缘高光
    ctx.strokeStyle = paintShade(color, -20); ctx.lineWidth = 1;
    ctx.stroke();
    // 独立履带节：横向分隔线（随 phase 滚动）
    const pitch = 7;
    const off = -((phase || 0) % pitch);
    ctx.strokeStyle = paintShade(color, -34); ctx.lineWidth = 1.2;
    for(let x = x0 + r + off; x < x1 - r; x += pitch){
      ctx.beginPath(); ctx.moveTo(x, yc - r + 1); ctx.lineTo(x, yc + r - 1); ctx.stroke();
    }
    // 履带节防滑齿（每节中央横条）
    ctx.strokeStyle = paintShade(color, 10); ctx.lineWidth = 1.6;
    for(let x = x0 + r + off + pitch/2; x < x1 - r; x += pitch){
      ctx.beginPath(); ctx.moveTo(x, yc - r + 1.5); ctx.lineTo(x, yc + r - 1.5); ctx.stroke();
    }
    // 中央导向齿（一排小凸起）
    ctx.fillStyle = paintShade(color, -30);
    for(let x = x0 + r + off + pitch*0.25; x < x1 - r; x += pitch){
      ctx.beginPath(); ctx.arc(x, yc, 1.1, 0, Math.PI*2); ctx.fill();
    }
  }
  ctx.restore();
}

// ---------- turret shadow ----------
// Soft elliptical shadow projected onto the hull deck, offset by `ox,oy` (local units) to simulate
// a light source from above. Drawn BEFORE the turret so the turret paints over it.
// 阴影偏移方向先按 worldAng（车体朝向）旋转：光在战场里方向固定，炮塔自转不应改变阴影方向。
function paintTurretShadow(ctx, verts, cx, cy, angle, scale, ox, oy, worldAng){
  const { minX, maxX, minY, maxY } = paintBounds(verts);
  const W = (maxY-minY)/2;
  let offX = ox||0, offY = oy||0;
  if(worldAng){
    const r = { x: Math.cos(worldAng)*offX - Math.sin(worldAng)*offY,
                y: Math.sin(worldAng)*offX + Math.cos(worldAng)*offY };
    offX = r.x; offY = r.y;
  }
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle||0);
  ctx.scale(scale, scale);
  // 1) 软环境阴影（2026-10-05 加深，便于炮塔/车体区分）
  ctx.save();
  ctx.translate(offX, offY);
  const rx = W*1.05, ry = W*0.85;
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
  ctx.save();
  ctx.translate(offX, offY);
  ctx.fillStyle = 'rgba(0,0,0,0.36)';
  paintBeginLocal(ctx, verts);
  ctx.fill();
  ctx.restore();
  ctx.restore();
}

// ---------- top-down textures ----------
// P-15 坦克纹理叠层（§2.10 定型）：多边形 clip + 平铺图案叠层，灰度/半透明图案保持 t.color 主色。
// TEXTURE_DEFS 为数据驱动定义（name + draw(ctx, bbox)），bbox={minX,minY,maxX,maxY}（local 坐标，
// 调用时已 clip 到部件多边形）。炮管/附件/特效保持程序化（§2.10）。
const TEXTURE_DEFS = {
  none: { name: '无', draw: null },
  armor_plate: { name: '装甲板纹', draw: (ctx, b) => {
      ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 1;
      const s = 14;
      for(let x = Math.ceil(b.minX/s)*s; x <= b.maxX; x += s){ ctx.beginPath(); ctx.moveTo(x, b.minY); ctx.lineTo(x, b.maxY); ctx.stroke(); }
      for(let y = Math.ceil(b.minY/s)*s; y <= b.maxY; y += s){ ctx.beginPath(); ctx.moveTo(b.minX, y); ctx.lineTo(b.maxX, y); ctx.stroke(); }
  }},
  weld_seam: { name: '焊缝', draw: (ctx, b) => {
      ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = 2;
      const s = 12;
      for(let y = b.minY+3; y <= b.maxY-3; y += s){ ctx.beginPath(); ctx.moveTo(b.minX+2, y); ctx.lineTo(b.maxX-2, y); ctx.stroke(); }
  }},
  rust: { name: '锈蚀', draw: (ctx, b) => {
      ctx.fillStyle = 'rgba(120,70,30,0.20)';
      const w = b.maxX-b.minX, h = b.maxY-b.minY;
      for(let i=0;i<8;i++){
        const rx = b.minX + ((i*137)%101)/101*w, ry = b.minY + ((i*73)%97)/97*h;
        ctx.beginPath(); ctx.ellipse(rx, ry, 3+(i%3), 2+(i%2), 0, 0, Math.PI*2); ctx.fill();
      }
  }},
  camo: { name: '迷彩', draw: (ctx, b) => {
      const w = b.maxX-b.minX, h = b.maxY-b.minY;
      const blobs = [[0.15,0.2,0.35,0.30],[0.62,0.14,0.30,0.26],[0.40,0.70,0.40,0.30],[0.82,0.60,0.30,0.28]];
      for(const [fx,fy,fw,fh] of blobs){
        ctx.fillStyle = 'rgba(30,40,25,0.25)';
        ctx.beginPath(); ctx.ellipse(b.minX+fx*w, b.minY+fy*h, fw*w, fh*h, 0.6, 0, Math.PI*2); ctx.fill();
      }
  }},
  // 2026-10-05 历史涂装：二战德军深黄底（Dunkelgelb）+ 橄榄绿/红棕不规则色块
  // base = 车体实色（队伍色不再参与车体填充，见 paintPartTextureDirect）
  camo_dunkelgelb: { name: '深黄迷彩', base: '#b89a55', draw: (ctx, b) => {
      const w = b.maxX-b.minX, h = b.maxY-b.minY;
      const green = [[0.18,0.22,0.30,0.26],[0.66,0.62,0.34,0.30],[0.45,0.10,0.24,0.20]];
      ctx.fillStyle = 'rgba(86,96,52,0.55)';
      for(const [fx,fy,fw,fh] of green){
        ctx.beginPath(); ctx.ellipse(b.minX+fx*w, b.minY+fy*h, fw*w, fh*h, 0.5, 0, Math.PI*2); ctx.fill();
      }
      const brown = [[0.60,0.16,0.28,0.22],[0.14,0.68,0.30,0.26],[0.82,0.40,0.22,0.24]];
      ctx.fillStyle = 'rgba(128,66,40,0.55)';
      for(const [fx,fy,fw,fh] of brown){
        ctx.beginPath(); ctx.ellipse(b.minX+fx*w, b.minY+fy*h, fw*w, fh*h, -0.4, 0, Math.PI*2); ctx.fill();
      }
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
  }},
  // 2026-10-05 历史涂装：北约三色迷彩（绿底 + 棕/黑色块）
  camo_nato: { name: '北约三色迷彩', base: '#5c6b40', draw: (ctx, b) => {
      const w = b.maxX-b.minX, h = b.maxY-b.minY;
      const brown = [[0.16,0.60,0.34,0.28],[0.68,0.14,0.30,0.24]];
      ctx.fillStyle = 'rgba(96,68,44,0.55)';
      for(const [fx,fy,fw,fh] of brown){
        ctx.beginPath(); ctx.ellipse(b.minX+fx*w, b.minY+fy*h, fw*w, fh*h, 0.7, 0, Math.PI*2); ctx.fill();
      }
      const black = [[0.42,0.30,0.26,0.22],[0.78,0.66,0.28,0.24],[0.10,0.14,0.22,0.20]];
      ctx.fillStyle = 'rgba(26,26,24,0.50)';
      for(const [fx,fy,fw,fh] of black){
        ctx.beginPath(); ctx.ellipse(b.minX+fx*w, b.minY+fy*h, fw*w, fh*h, -0.6, 0, Math.PI*2); ctx.fill();
      }
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
  }}
};

// 车体实色：TEXTURE_DEFS 的 base（历史涂装）优先，否则回退队伍色 color。
// 2026-10-05 起车体不再按队伍整车染色（红/绿底 + 迷彩叠层显脏）；队伍识别走
// 描边/履带/血条/小地图标记，车体保持历史涂装。
function tankBodyColor(color, texture) {
  const d = texture && TEXTURE_DEFS[texture];
  return (d && d.base) || color;
}

// Offscreen Canvas Cache for procedural tank sprites to optimize render performance
const PAINT_CACHE = new Map();
function clearPaintCache() {
  PAINT_CACHE.clear();
}

function getCachedTankSprite(color, kind, verts, hasTurret, heightClass, texture) {
  // 缓存键用车体实色（历史涂装下同纹理跨队伍共享同一 sprite）
  const bodyCol = tankBodyColor(color, texture);
  const cacheKey = `${bodyCol}_${kind}_${hasTurret}_${heightClass}_${texture||'none'}_${verts.map(v => `${v[0].toFixed(1)},${v[1].toFixed(1)}`).join('|')}`;
  if (PAINT_CACHE.has(cacheKey)) {
    return PAINT_CACHE.get(cacheKey);
  }
  
  // Calculate bounding box in local space
  const { minX, maxX, minY, maxY } = paintBounds(verts);
  const w = Math.ceil(maxX - minX) + 8;
  const h = Math.ceil(maxY - minY) + 8;
  const cx = -minX + 4;
  const cy = -minY + 4;
  
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  
  // Paint the texture once onto this offscreen canvas at local scale 1
  paintPartTextureDirect(ctx, verts, cx, cy, 0, 1, color, kind, { detail: true, hasTurret, heightClass, texture });
  
  const cacheEntry = { canvas, cx, cy, w, h };
  PAINT_CACHE.set(cacheKey, cacheEntry);
  return cacheEntry;
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
  // base paint
  ctx.fillStyle = paintShade(bodyCol, isHull ? -18 : -6);
  if(opts.faded) ctx.globalAlpha = 0.5;
  ctx.fillRect(minX-2, minY-2, (maxX-minX)+4, (maxY-minY)+4);
  ctx.globalAlpha = 1;
  // 纹理叠层（P-27 接线）：clip 内、base 填充后，灰度/半透明图案平铺在部件多边形上，
  // 保持 bodyCol 主色；opts.texture 缺失/'none'/未知键 → 跳过（数据驱动 TEXTURE_DEFS）。
  const texDef = opts.texture && TEXTURE_DEFS[opts.texture];
  if(texDef && texDef.draw && !opts.faded){
    texDef.draw(ctx, { minX, minY, maxX, maxY });
  }
  // 顶光 + 底阴（2026-10-05 体积感）：柔和纵向渐变，clip 内
  if(!opts.faded){
    const grad = ctx.createLinearGradient(0, minY, 0, maxY);
    grad.addColorStop(0, 'rgba(255,255,255,0.10)');
    grad.addColorStop(0.55, 'rgba(255,255,255,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.20)');
    ctx.fillStyle = grad;
    ctx.fillRect(minX-2, minY-2, (maxX-minX)+4, (maxY-minY)+4);
  }
  if(!opts.faded && opts.detail !== false){
    if(isHull){
      // #TEX-2026-10-15: 铆钉排（甲板边缘）+ weathering（损伤分级，opts.damageLevel 0~3）
      paintRivets(ctx, cxm, cym, minX, maxX, W, L, bodyCol);
      if(opts.damageLevel > 0){
        paintWeathering(ctx, cxm, cym, minX, maxX, W, L, opts.damageLevel, opts.weatherSeed || 1);
      }
      // inset deck plate (sealed perimeter)
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
        ctx.strokeStyle = paintShade(bodyCol, 24); ctx.lineWidth = 0.9;
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
        ctx.strokeStyle = paintShade(bodyCol, 14); ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.ellipse((ex0+ex1)/2, ey, (ex1-ex0)/2, 2.2, 0, 0, Math.PI*2); ctx.stroke();
      }
      } // end #TEX3 engineDeck 内置分支
      // 驾驶员舱盖（前左）+ 航向机枪球座（前右）
      const dhx = maxX - L*0.30;
      ctx.fillStyle = paintShade(bodyCol, -18);
      ctx.beginPath(); ctx.arc(dhx, cym - W*0.42, W*0.13, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = paintShade(bodyCol, 18); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(dhx, cym - W*0.42, W*0.13, 0, Math.PI*2); ctx.stroke();
      // 驾驶员周视镜（3 块）
      ctx.fillStyle = paintShade(bodyCol, 30);
      for(let k = -1; k <= 1; k++){
        ctx.fillRect(dhx + k*3.4 - 1, cym - W*0.42 - W*0.13 - 2.4, 2, 1.8);
      }
      // 机枪球座
      ctx.fillStyle = paintShade(bodyCol, -26);
      ctx.beginPath(); ctx.arc(dhx, cym + W*0.42, W*0.10, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#1a1a1e';
      ctx.beginPath(); ctx.arc(dhx, cym + W*0.42, W*0.045, 0, Math.PI*2); ctx.fill();
      // front glacis chevrons (front = +x, near maxX)
      ctx.strokeStyle = paintShade(bodyCol, 16); ctx.lineWidth = 1.5;
      for(const fx of [maxX - L*0.22, maxX - L*0.08]){
        ctx.beginPath(); ctx.moveTo(fx, cym - W*0.5); ctx.lineTo(fx + L*0.12, cym); ctx.lineTo(fx, cym + W*0.5); ctx.stroke();
      }
    } else {
      // #TEX3: 车长塔外观件覆盖 —— appearance.cupola 存在时用预设样式+手动位置，跳过内置
      const _cupApp = opts.appearance && opts.appearance.cupola;
      if(_cupApp && _cupApp.style && _cupApp.style !== 'none'){
        paintAppearancePart(ctx, 'cupola', _cupApp.style,
          cxm + (_cupApp.dx || 0), cym + (_cupApp.dy || 0), 1, bodyCol, { mirror: !!_cupApp.mirror });
      } else if(!_cupApp || _cupApp.style !== 'none'){
      // #TEX2-2026-10-15: 车长塔重做 —— 装甲围圈 + 周视镜环 + 对开舱盖 + 提手
      const cupolas = (opts.heightClass === 'heavy' || opts.hasTurret === false) ? 2 : 1;
      const cupCy = cym - W*0.44;
      const cupolaAt = (ccx, cr) => {
        // 基座（深色）
        ctx.fillStyle = paintShade(bodyCol, -30);
        ctx.beginPath(); ctx.arc(ccx, cupCy, cr, 0, Math.PI*2); ctx.fill();
        // 装甲围圈（亮边）
        ctx.strokeStyle = paintShade(bodyCol, 22); ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(ccx, cupCy, cr, 0, Math.PI*2); ctx.stroke();
        // 周视镜：8 块小镜环绕
        ctx.fillStyle = paintShade(bodyCol, 34);
        for(let k = 0; k < 8; k++){
          const a = k * Math.PI/4;
          const px = ccx + Math.cos(a) * cr * 0.72, py = cupCy + Math.sin(a) * cr * 0.72;
          ctx.beginPath(); ctx.arc(px, py, cr*0.14, 0, Math.PI*2); ctx.fill();
        }
        // 对开舱盖：中线 + 两扇
        ctx.fillStyle = paintShade(bodyCol, -12);
        ctx.beginPath(); ctx.arc(ccx, cupCy, cr*0.52, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = paintShade(bodyCol, -38); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(ccx, cupCy, cr*0.52, 0, Math.PI*2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(ccx - cr*0.52, cupCy); ctx.lineTo(ccx + cr*0.52, cupCy); ctx.stroke();
        // 舱盖提手
        ctx.strokeStyle = paintShade(bodyCol, 28); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(ccx, cupCy - cr*0.26, cr*0.16, Math.PI, 0); ctx.stroke();
        ctx.beginPath(); ctx.arc(ccx, cupCy + cr*0.26, cr*0.16, 0, Math.PI); ctx.stroke();
      };
      if(cupolas === 1){
        cupolaAt(cxm - L*0.08, W*0.17);
      } else {
        cupolaAt(cxm - L*0.30, W*0.15);
        cupolaAt(cxm + L*0.18, W*0.15);
      }
      // 炮手瞄具（前右）：镜座 + 镜片
      const sx = maxX - (maxX-minX)*0.45, sy = cym + W*0.08, sw = W*0.5, sh = W*0.18;
      ctx.fillStyle = paintShade(bodyCol, -24);
      ctx.fillRect(sx, sy, sw, sh);
      ctx.strokeStyle = paintShade(bodyCol, 20); ctx.lineWidth = 1;
      ctx.strokeRect(sx, sy, sw, sh);
      ctx.fillStyle = '#1a2530';
      ctx.fillRect(sx + sw*0.2, sy + sh*0.25, sw*0.6, sh*0.5);
      // 装填手舱盖（后右小圆）
      ctx.fillStyle = paintShade(bodyCol, -20);
      ctx.beginPath(); ctx.arc(cxm + L*0.32, cym + W*0.40, W*0.11, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = paintShade(bodyCol, 16); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(cxm + L*0.32, cym + W*0.40, W*0.11, 0, Math.PI*2); ctx.stroke();
      } // end #TEX3 cupola 内置分支
    }
  }
  ctx.restore();
}

// --- 程序化装饰件库（2026-10-15 #TEX：回归程序化，替代 AI 精灵）---
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
  // 铆钉高光点
  ctx.fillStyle = paintShade(bodyCol, 26);
  for(let x = rx0; x <= rx1 + 0.5; x += step){
    for(const y of [cym - ry, cym + ry]){
      ctx.beginPath(); ctx.arc(x - 0.35, y - 0.35, 0.45, 0, Math.PI*2); ctx.fill();
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
      const r = 1.5 + _hash2(i, 79, seed) * 3;
      ctx.fillStyle = `rgba(122,72,32,${0.25 + 0.15*level})`;
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
    ctx.strokeStyle = paintShade(bodyCol, 18); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(0, 0, cr*0.8, 0, Math.PI*2); ctx.stroke();
    ctx.fillStyle = paintShade(bodyCol, 30);
    for(let k = 0; k < 6; k++){
      const a = k * Math.PI/3;
      ctx.beginPath(); ctx.arc(Math.cos(a)*cr*0.55, Math.sin(a)*cr*0.55, cr*0.12, 0, Math.PI*2); ctx.fill();
    }
    ctx.fillStyle = paintShade(bodyCol, -10);
    ctx.beginPath(); ctx.arc(0, 0, cr*0.42, 0, Math.PI*2); ctx.fill();
  } else if(style === 'panoramic'){
    // 全景塔：高圈+10镜+大单盖
    ctx.fillStyle = paintShade(bodyCol, -32);
    ctx.beginPath(); ctx.arc(0, 0, cr*1.15, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = paintShade(bodyCol, 24); ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(0, 0, cr*1.15, 0, Math.PI*2); ctx.stroke();
    ctx.fillStyle = paintShade(bodyCol, 36);
    for(let k = 0; k < 10; k++){
      const a = k * Math.PI/5;
      ctx.beginPath(); ctx.arc(Math.cos(a)*cr*0.82, Math.sin(a)*cr*0.82, cr*0.13, 0, Math.PI*2); ctx.fill();
    }
    ctx.fillStyle = paintShade(bodyCol, -8);
    ctx.beginPath(); ctx.arc(0, 0, cr*0.62, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = paintShade(bodyCol, -40); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(0, 0, cr*0.62, 0, Math.PI*2); ctx.stroke();
  } else {
    // standard：装甲围圈+8周视镜+对开舱盖（与现有炮塔车长塔一致）
    ctx.fillStyle = paintShade(bodyCol, -30);
    ctx.beginPath(); ctx.arc(0, 0, cr, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = paintShade(bodyCol, 22); ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(0, 0, cr, 0, Math.PI*2); ctx.stroke();
    ctx.fillStyle = paintShade(bodyCol, 34);
    for(let k = 0; k < 8; k++){
      const a = k * Math.PI/4;
      ctx.beginPath(); ctx.arc(Math.cos(a)*cr*0.72, Math.sin(a)*cr*0.72, cr*0.14, 0, Math.PI*2); ctx.fill();
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
    ctx.strokeStyle = paintShade(bodyCol, 22); ctx.lineWidth = 0.9;
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
    ctx.strokeStyle = paintShade(bodyCol, 24); ctx.lineWidth = 0.9;
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
      ctx.strokeStyle = paintShade(bodyCol, 24); ctx.lineWidth = 0.8;
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
    const entry = getCachedTankSprite(color, kind, verts, opts.hasTurret !== false, opts.heightClass, opts.texture);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle || 0);
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

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    paintShade,
    tankBodyColor,
    paintBounds,
    paintBeginLocal,
    paintClipLocal,
    paintTracks,
    paintTurretShadow,
    TEXTURE_DEFS,
    PAINT_CACHE,
    clearPaintCache,
    getCachedTankSprite,
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
