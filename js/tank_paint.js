// tank_paint.js — shared procedural tank rendering (classic script, loads over file://).
// Single source of truth for rolling tracks + top-down hull/turret textures, shared by
// tank_mvp.html and tank_designer.html. All functions are platform-independent: they take an
// explicit ctx, local-coordinate polygon verts, and a pose, so each caller supplies its own
// geometry (mvp model vs designer half-polys) and colors.
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
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle||0);
  ctx.scale(scale, scale);
  // track bodies
  ctx.strokeStyle = paintShade(color, -52); ctx.lineWidth = tw; ctx.lineCap='butt';
  ctx.beginPath(); ctx.moveTo(cxm-L*0.98, yTop); ctx.lineTo(cxm+L*0.98, yTop); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cxm-L*0.98, yBot); ctx.lineTo(cxm+L*0.98, yBot); ctx.stroke();
  // outer edge highlight
  ctx.strokeStyle = paintShade(color, -22); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(cxm-L*0.98, yTop - tw/2); ctx.lineTo(cxm+L*0.98, yTop - tw/2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cxm-L*0.98, yBot + tw/2); ctx.lineTo(cxm+L*0.98, yBot + tw/2); ctx.stroke();
  // rolling links (dash offset scroll)
  const pitch = 8;
  ctx.strokeStyle = paintShade(color, 6); ctx.lineWidth = tw+1;
  ctx.setLineDash([pitch*0.55, pitch*0.45]);
  ctx.lineDashOffset = -((phase||0) % pitch);
  ctx.beginPath(); ctx.moveTo(cxm-L*0.98, yTop); ctx.lineTo(cxm+L*0.98, yTop); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cxm-L*0.98, yBot); ctx.lineTo(cxm+L*0.98, yBot); ctx.stroke();
  ctx.setLineDash([]);
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
  ctx.translate(offX, offY);
  const rx = W*1.0, ry = W*0.8;
  const grad = ctx.createRadialGradient(0,0,0, 0,0,rx);
  grad.addColorStop(0, 'rgba(0,0,0,0.5)');
  grad.addColorStop(0.55, 'rgba(0,0,0,0.34)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI*2);
  ctx.fill();
  // faint hard footprint so the shadow reads as a cast, not just a dark blob under the turret
  ctx.strokeStyle='rgba(0,0,0,0.12)'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.ellipse(0,0,W*0.92,W*0.74,0,0,Math.PI*2); ctx.stroke();
  ctx.restore();
}

// ---------- top-down textures ----------
// paintPartTexture(ctx, verts, cx, cy, angle, scale, color, kind, opts)
//   kind : 'hull' | 'turret'
//   opts : { faded?:boolean, detail?:boolean }
//     faded  — edit modes: faint base paint only (keeps vertex/edge editing readable)
//     detail — full texture (deck plate, grilles, hatch, etc.); skipped when faded
// Local-unit geometry; clip to the part polygon, then stamp simplified top-down details.
function paintPartTexture(ctx, verts, cx, cy, angle, scale, color, kind, opts){
  opts = opts || {};
  const { minX, maxX, minY, maxY } = paintBounds(verts);
  const L = (maxX-minX)/2, W = (maxY-minY)/2;
  const cxm = (minX+maxX)/2, cym = (minY+maxY)/2;
  const isHull = kind === 'hull';
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle||0);
  ctx.scale(scale, scale);
  paintClipLocal(ctx, verts);
  // base paint
  ctx.fillStyle = paintShade(color, isHull ? -18 : -6);
  if(opts.faded) ctx.globalAlpha = 0.5;
  ctx.fillRect(minX-2, minY-2, (maxX-minX)+4, (maxY-minY)+4);
  ctx.globalAlpha = 1;
  if(!opts.faded && opts.detail !== false){
    if(isHull){
      // inset deck plate (sealed perimeter)
      ctx.strokeStyle = paintShade(color, 4); ctx.lineWidth = 1.5;
      paintBeginLocal(ctx, verts.map(([vx,vy]) => [cxm + (vx-cxm)*0.74, cym + (vy-cym)*0.74]));
      ctx.stroke();
      // center ridge
      ctx.strokeStyle = paintShade(color, 8); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(cxm, cym - W*0.72); ctx.lineTo(cxm, cym + W*0.72); ctx.stroke();
      // rear engine grilles (near minX, engine deck)
      ctx.strokeStyle = paintShade(color, 14); ctx.lineWidth = 2.5;
      for(const gy of [cym - W*0.34, cym, cym + W*0.34]){
        ctx.beginPath(); ctx.moveTo(minX+1, gy); ctx.lineTo(minX + (maxX-minX)*0.38, gy); ctx.stroke();
      }
      // front glacis chevrons (front = +x, near maxX)
      ctx.strokeStyle = paintShade(color, 16); ctx.lineWidth = 1.5;
      for(const fx of [maxX - L*0.22, maxX - L*0.08]){
        ctx.beginPath(); ctx.moveTo(fx, cym - W*0.5); ctx.lineTo(fx + L*0.12, cym); ctx.lineTo(fx, cym + W*0.5); ctx.stroke();
      }
    } else {
      // commander cupola(s) — class icon on the turret/fighting room RIGHT side:
      //   turretless (fixed casemate) or heavy tank → 2 cupolas in a row (并列);
      //   medium tank → 1 cupola. Positioned on the right side (local +y).
      const cupolas = (opts.heightClass === 'heavy' || opts.hasTurret === false) ? 2 : 1;
      const cupCy = cym + W*0.44;
      ctx.fillStyle = paintShade(color, -28);
      if(cupolas === 1){
        ctx.beginPath(); ctx.arc(cxm - L*0.08, cupCy, W*0.15, 0, Math.PI*2); ctx.fill();
      } else {
        ctx.beginPath(); ctx.arc(cxm - L*0.30, cupCy, W*0.14, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(cxm + L*0.18, cupCy, W*0.14, 0, Math.PI*2); ctx.fill();
      }
      // cupola rim(s)
      ctx.strokeStyle = paintShade(color, 18); ctx.lineWidth = 1;
      if(cupolas === 1){
        ctx.beginPath(); ctx.arc(cxm - L*0.08, cupCy, W*0.15 + 1.5, 0, Math.PI*2); ctx.stroke();
      } else {
        ctx.beginPath(); ctx.arc(cxm - L*0.30, cupCy, W*0.14 + 1.5, 0, Math.PI*2); ctx.stroke();
        ctx.beginPath(); ctx.arc(cxm + L*0.18, cupCy, W*0.14 + 1.5, 0, Math.PI*2); ctx.stroke();
      }
      // gunner sight (front-right)
      ctx.strokeStyle = paintShade(color, 18); ctx.lineWidth = 1.5;
      ctx.strokeRect(maxX - (maxX-minX)*0.45, cym + W*0.08, W*0.5, W*0.18);
    }
  }
  ctx.restore();
}
