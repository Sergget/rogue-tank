'use strict';

// tank_battledraw.js — mvp 战斗场景绘制层（坦克/断履带/焦黑车体/起火/炮弹/掩体/树冠/车型标志）。
// 仿 tank_fx.js 先例：每个 draw 函数显式接收 ctx（tank_paint.js 约定），不触碰 DOM。
// 测试台专用块（drawRange/addRangeShot/AMMO_KEYS/RANGE_*）留在 tank_mvp.html 不拆。
//
//   drawTank(ctx, t)              — 完整坦克（履带/车体/炮塔/炮管/附件/血条/车型标志）
//   drawBrokenTracks(ctx, t)      — 履带被击断的俯视表现
//   drawCharredHull(ctx, t)       — 弹药架殉爆后的焦黑车体
//   drawFireGlow(ctx, t)          — 起火坦克的炽热辉光
//   drawShells(ctx, shells)       — 飞行炮弹（弹种色拖尾 + 弹头亮点）
//   drawCover(ctx, cov)           — 掩体/地图元素分层绘制
//   drawFoliage(ctx, covers)      — 树冠/灌木叶片层（画在坦克之上形成视线遮挡）
//   drawGround(ctx, opts)         — P-36/#81 biome 地面（底色 + 种子确定性低频色斑）
//   drawClassBadge(ctx, t, x, y)  — 重/中型车型标志（六边形/五边形）

// thin wrappers delegating to the shared tank_paint.js module
function shade(hex, pct){ return paintShade(hex, pct); }
// rolling tank tracks under the hull, driven by t.trackPhase
function drawTracks(ctx, t){
  paintTracks(ctx, hullPoly(t).verts, t.x, t.y, t.hullAngle, 1, t.color, t.trackPhase||0, { trackWidth: t.trackWidth || 8, trackOffset: t.trackOffset || 0 });
}
// hull top-down paint.
function renderHullTexture(ctx, t){
  paintPartTexture(ctx, hullPoly(t).verts, t.x, t.y, t.hullAngle, 1, t.color, 'hull', { detail:true, texture: t.texture });
}
// turret top-down paint.
function renderTurretTexture(ctx, cx, cy, angle, t){
  paintPartTexture(ctx, turretPoly(t).verts, cx, cy, angle, 1, t.color, 'turret', { detail:true, heightClass: t.heightClass, texture: t.texture });
}

// 履带被击断的俯视表现：擦除断开段 + 撕裂金属残端 + 脱落履带节。
// 所有断链效果被限制在"履带带条"范围内（车体边缘之外），不再侵入车体表面。
function drawBrokenTracks(ctx, t){
  const L = t.hullLen/2, W = t.hullWid/2;
  const tw = t.trackWidth || 8;
  const off = t.trackOffset || 0;
  const gapX = L*0.45;
  const innerY = W + off + 1;   // 履带内侧边缘（车体之外固定空出 1px）
  const outerY = W + tw + off + 1; // 履带外侧边缘
  ctx.save();
  ctx.translate(t.x, t.y);
  ctx.rotate(t.hullAngle);
  for(const dir of [-1,1]){
    const y0 = Math.min(innerY*dir, outerY*dir);
    const y1 = Math.max(innerY*dir, outerY*dir);
    // 擦除断开处的履带段（露出地面，仅限履带带条）
    ctx.fillStyle = 'rgba(16,17,13,1)';
    ctx.fillRect(gapX - tw*1.1, y0, tw*2.2, y1-y0);
    // 撕裂的金属残端（锯齿状，全部在带条内）
    ctx.strokeStyle = 'rgba(150,140,110,0.9)'; ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(gapX - tw*1.0, y0 + dir*tw*0.15);
    ctx.lineTo(gapX - tw*0.2, y0 + dir*tw*0.65);
    ctx.lineTo(gapX + tw*0.4, y0 + dir*tw*1.0);
    ctx.lineTo(gapX + tw*1.0, y0 + dir*tw*1.25);
    ctx.stroke();
    // 脱落的履带节（悬垂在断裂处带条外侧）
    const hangY = outerY*dir + dir*tw*0.9;
    ctx.strokeStyle = paintShade(t.color, -58); ctx.lineWidth = tw*0.9; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(gapX - tw*1.2, hangY); ctx.lineTo(gapX + tw*0.3, hangY); ctx.stroke();
    ctx.strokeStyle = paintShade(t.color, -12); ctx.lineWidth = 1.2; ctx.setLineDash([3,4]); ctx.lineDashOffset = -((t.trackPhase||0)%7);
    ctx.beginPath(); ctx.moveTo(gapX - tw*1.2, hangY); ctx.lineTo(gapX + tw*0.3, hangY); ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();
}
// 弹药架殉爆后的焦黑车体
function drawCharredHull(ctx, t){
  const hc = polyCorners(t.x,t.y,t.hullAngle, hullPoly(t));
  ctx.beginPath();
  ctx.moveTo(hc[0].x,hc[0].y);
  for(let i=1;i<hc.length;i++) ctx.lineTo(hc[i].x,hc[i].y);
  ctx.closePath();
  ctx.fillStyle = 'rgba(18,16,12,0.6)';
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  const r1 = rotate(6, 2, t.hullAngle);
  ctx.beginPath(); ctx.arc(t.x+r1.x, t.y+r1.y, t.hullWid*0.32, 0, TAU); ctx.fill();
  const r2 = rotate(-10, 7, t.hullAngle);
  ctx.beginPath(); ctx.arc(t.x+r2.x, t.y+r2.y, t.hullWid*0.22, 0, TAU); ctx.fill();
}
// 起火坦克的炽热辉光（叠加在车体上）
function drawFireGlow(ctx, t){
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const W = t.hullWid*0.5;
  const ex = engineLocalX(t);
  const gx = t.x + Math.cos(t.hullAngle)*(ex*0.8);
  const gy = t.y + Math.sin(t.hullAngle)*(ex*0.8);
  const flick = 0.7 + Math.random()*0.3;
  const grad = ctx.createRadialGradient(gx,gy,0, gx,gy,W*1.3);
  grad.addColorStop(0,   `rgba(255,150,45,${0.34*flick})`);
  grad.addColorStop(0.55,`rgba(255,110,35,${0.16*flick})`);
  grad.addColorStop(1,   'rgba(255,90,30,0)');
  ctx.fillStyle = grad;
  ctx.beginPath(); ctx.arc(gx, gy, W*1.3, 0, TAU); ctx.fill();
  ctx.restore();
}

// 炮弹渲染：细长尖头弹体沿飞行方向 + 弹种色拖尾 + 弹头亮点
function drawShells(ctx, shells){
  const SV = RULES.shellVisual;
  for(const s of shells){
    const ang = Math.atan2(s.dy, s.dx);
    const col  = (s.ammo && s.ammo.color) ? s.ammo.color : '#ffb454';
    const tail = (s.ammo && s.ammo.tail) ? s.ammo.tail : 'rgba(255,180,84,0.6)';
    const L = SV.length, W = SV.width, tailLen = SV.tailLen;
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(ang);
    // 拖尾（沿 -x 渐隐短线）
    ctx.globalCompositeOperation = 'lighter';
    const tg = ctx.createLinearGradient(-tailLen, 0, 0, 0);
    tg.addColorStop(0, 'rgba(255,255,255,0)');
    tg.addColorStop(1, tail);
    ctx.strokeStyle = tg; ctx.lineWidth = 3; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(-tailLen, 0); ctx.lineTo(0, 0); ctx.stroke();
    // 弹体：尖头朝 +x（飞行方向）
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(L/2, 0);
    ctx.lineTo(-L/2, -W/2);
    ctx.lineTo(-L/2 - 2, 0);
    ctx.lineTo(-L/2, W/2);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(L/2, 0); ctx.lineTo(-L/2, -W/2); ctx.lineTo(-L/2 - 2, 0); ctx.lineTo(-L/2, W/2); ctx.closePath(); ctx.stroke();
    // 弹头亮点
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath(); ctx.arc(L*0.3, 0, 1.3, 0, TAU); ctx.fill();
    ctx.restore();
  }
}

// 地图元素分层绘制（§2.7）：box=矩形掩体（含标签）保持程序化；soft/barricade/stump/rubble/
// bush/tree/fallen 走资产层（js/tank_assets.js：ASSET_DEFS 注册表 + drawAsset——有图
// drawImage / 无图烘焙缓存，画法与旧内联分支逐字一致）。树冠叶片（bush/tree/fallen 的上层
// 叶片）由 drawFoliage 在坦克之上调用 drawAssetCanopy 形成视线遮挡。
function drawCover(ctx, cov){
  const tier = COVER_TIERS[cov.tier];
  if(tier.draw === 'box'){
    const c = coverCorners(cov);
    ctx.beginPath(); ctx.moveTo(c[0].x,c[0].y);
    for(let i=1;i<c.length;i++) ctx.lineTo(c[i].x,c[i].y);
    ctx.closePath();
    ctx.fillStyle = tier.fill; ctx.fill();
    ctx.strokeStyle = tier.stroke; ctx.lineWidth=2; ctx.stroke();
    ctx.fillStyle = tier.stroke; ctx.font='10px "JetBrains Mono", monospace';
    ctx.fillText(tier.label, cov.x-24, cov.y-cov.h/2-6);
  } else if(tier.draw === 'mud'){
    // P-40 烂泥地：暗褐斑块 + 湿润高光点（高光偏移由坐标派生，确定性）
    const c = coverCorners(cov);
    ctx.beginPath(); ctx.moveTo(c[0].x,c[0].y);
    for(let i=1;i<c.length;i++) ctx.lineTo(c[i].x,c[i].y);
    ctx.closePath();
    ctx.fillStyle = tier.fill; ctx.fill();
    ctx.strokeStyle = tier.stroke; ctx.lineWidth=1.5; ctx.stroke();
    for(let i=0;i<3;i++){
      const hx = cov.x + (((cov.x + i*37) % 100)/100 - 0.5) * cov.w * 0.6;
      const hy = cov.y + (((cov.y + i*53) % 100)/100 - 0.5) * cov.h * 0.6;
      ctx.fillStyle = 'rgba(180,160,120,0.35)';
      ctx.beginPath(); ctx.arc(hx, hy, Math.max(1.5, Math.min(cov.w,cov.h)*0.06), 0, TAU); ctx.fill();
    }
  } else if(tier.draw === 'rock-poly'){
    // P-40 岩石：verts 多边形灰岩 + 棱线（无 verts 回退矩形）
    const c = coverCorners(cov);
    ctx.beginPath(); ctx.moveTo(c[0].x,c[0].y);
    for(let i=1;i<c.length;i++) ctx.lineTo(c[i].x,c[i].y);
    ctx.closePath();
    ctx.fillStyle = tier.fill; ctx.fill();
    ctx.strokeStyle = tier.stroke; ctx.lineWidth=2; ctx.stroke();
    // 棱线：各顶点向质心连浅色线，营造多面体感
    let gx=0, gy=0; for(const p of c){ gx+=p.x; gy+=p.y; } gx/=c.length; gy/=c.length;
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth=1;
    for(let i=0;i<c.length;i+=2){
      ctx.beginPath(); ctx.moveTo((c[i].x+gx)/2, (c[i].y+gy)/2); ctx.lineTo(gx, gy); ctx.stroke();
    }
  } else if(tier.draw === 'rubble-box'){
    // P-40 残破建筑（ruined）：破损轮廓 box——主体 box + 缺口锯齿线
    const c = coverCorners(cov);
    ctx.beginPath(); ctx.moveTo(c[0].x,c[0].y);
    for(let i=1;i<c.length;i++) ctx.lineTo(c[i].x,c[i].y);
    ctx.closePath();
    ctx.fillStyle = tier.fill; ctx.fill();
    ctx.strokeStyle = tier.stroke; ctx.lineWidth=2; ctx.stroke();
    // 破损轮廓：沿对角的两条锯齿裂缝
    ctx.strokeStyle = 'rgba(30,28,24,0.5)'; ctx.lineWidth=1.5;
    ctx.beginPath();
    ctx.moveTo(cov.x - cov.w*0.3, cov.y - cov.h*0.35);
    ctx.lineTo(cov.x - cov.w*0.1, cov.y - cov.h*0.05);
    ctx.lineTo(cov.x - cov.w*0.25, cov.y + cov.h*0.25);
    ctx.moveTo(cov.x + cov.w*0.32, cov.y + cov.h*0.3);
    ctx.lineTo(cov.x + cov.w*0.08, cov.y + cov.h*0.02);
    ctx.lineTo(cov.x + cov.w*0.22, cov.y - cov.h*0.28);
    ctx.stroke();
  } else if(tier.draw === 'water-chain'){
    // P-40 河流多段连通绘制：遍历 segments 单笔触连续画水面；普通单块回退自身矩形
    const rects = (typeof coverSegRects === 'function') ? coverSegRects(cov) : [cov];
    for(const r of rects){
      const rc = partCorners(r.x, r.y, r.angle||0, r.w/2, r.h/2);
      ctx.beginPath(); ctx.moveTo(rc[0].x,rc[0].y);
      for(let i=1;i<rc.length;i++) ctx.lineTo(rc[i].x,rc[i].y);
      ctx.closePath();
      ctx.fillStyle = tier.fill; ctx.fill();
      ctx.strokeStyle = tier.stroke; ctx.lineWidth=1.5; ctx.stroke();
      // 水面高光：长轴方向的浅色流线
      const long = r.w >= r.h;
      ctx.strokeStyle = 'rgba(220,240,255,0.3)'; ctx.lineWidth=1;
      ctx.beginPath();
      if(long){ ctx.moveTo(r.x - r.w*0.35, r.y); ctx.lineTo(r.x + r.w*0.35, r.y); }
      else { ctx.moveTo(r.x, r.y - r.h*0.35); ctx.lineTo(r.x, r.y + r.h*0.35); }
      ctx.stroke();
    }
  } else if(typeof ASSET_DEFS !== 'undefined' && ASSET_DEFS[tier.draw]){
    // 资产层：soft/barricade/stump/rubble/bush/tree/fallen（依赖 js/tank_assets.js 先加载）
    drawAsset(ctx, tier.draw, cov.x, cov.y, cov.w, cov.h, cov.angle||0);
  }
}

// 树冠 / 灌木叶片层：画在所有坦克之上，实现"遮挡视线"的表现（§2.7）。
// 叶片画法已下沉为 ASSET_DEFS[key].bakeCanopy（js/tank_assets.js），此处保留
// hp/vision 逐元素过滤后改走 drawAssetCanopy。
function drawFoliage(ctx, covers){
  for(const cov of covers){
    if(cov.hp === 0) continue;
    const tier = COVER_TIERS[cov.tier];
    if(tier.vision !== true) continue;
    if(typeof ASSET_DEFS !== 'undefined' && ASSET_DEFS[tier.draw] && ASSET_DEFS[tier.draw].bakeCanopy){
      drawAssetCanopy(ctx, tier.draw, cov.x, cov.y, cov.w, cov.h);
    }
  }
}

function drawTank(ctx, t){
  const pOff = turretPivot(t);
  const turCx = pOff.x;
  const turCy = pOff.y;

  // rolling tracks (under the hull)
  drawTracks(ctx, t);

  // hull — arrowhead polygon (verts: FR, tip, FL, RL, RR)
  const hPoly = hullPoly(t);
  const hc = polyCorners(t.x,t.y,t.hullAngle, hPoly);
  renderHullTexture(ctx, t);
  ctx.beginPath();
  ctx.moveTo(hc[0].x,hc[0].y);
  for(let i=1;i<hc.length;i++) ctx.lineTo(hc[i].x,hc[i].y);
  ctx.closePath();
  ctx.strokeStyle = t.color; ctx.lineWidth=2; ctx.stroke();
  // bold front: both slant edges FR->tip->FL mark the glacis/front-facing direction
  ctx.strokeStyle = t.color; ctx.lineWidth=4;
  ctx.beginPath(); ctx.moveTo(hc[0].x,hc[0].y); ctx.lineTo(hc[1].x,hc[1].y); ctx.lineTo(hc[2].x,hc[2].y); ctx.stroke();

  // 履带被击断：断开处 + 脱落履带节 + 撕裂金属
  if(t.trackBroken) drawBrokenTracks(ctx, t);

  // turret ring (on the hull, under the turret)
  if(!t.ammoBlew){
  ctx.save();
  ctx.translate(turCx, turCy);
  ctx.strokeStyle = shade(t.color, -12); ctx.lineWidth = 1.5;
  ctx.setLineDash([3,3]);
  ctx.beginPath(); ctx.arc(0, 0, t.turWid*0.5, 0, TAU); ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
  }

   // 弹药架殉爆后炮塔被掀飞（飞头），炮塔/炮管全部不再绘制；车体焦黑 + 炽热
   if(t.ammoBlew){ drawCharredHull(ctx, t); if(t.fireT>0) drawFireGlow(ctx, t); }
   if(!t.ammoBlew){
   // 阴影方向固定在世界方向（投影用 t.hullAngle），炮塔自转不改变阴影方向
   if(t.fireT>0) drawFireGlow(ctx, t);
   paintTurretShadow(ctx, turretPoly(t).verts, turCx, turCy, superstructureAngle(t), 1, 7, 9, t.hullAngle);

   const structureAngle = superstructureAngle(t);
   const tPoly = turretPoly(t);
   const tc = polyCorners(turCx,turCy,structureAngle, tPoly);
   renderTurretTexture(ctx, turCx, turCy, structureAngle, t);
  ctx.beginPath();
  ctx.moveTo(tc[0].x,tc[0].y);
  for(let i=1;i<tc.length;i++) ctx.lineTo(tc[i].x,tc[i].y);
  ctx.closePath();
  ctx.strokeStyle = t.color; ctx.lineWidth=1.5; ctx.stroke();
  // bold front cheeks (front edge of the turret/fighting room)
  ctx.strokeStyle = t.color; ctx.lineWidth=3;
  ctx.beginPath(); ctx.moveTo(tc[0].x,tc[0].y); ctx.lineTo(tc[1].x,tc[1].y); ctx.stroke();

  // 炮塔转动射界：±traverseLimit 左右极限射线（仅当射界 < 180° 时有限制；180° = 360° 全向旋转）
  if(t.traverseLimit < Math.PI){
    ctx.strokeStyle = 'rgba(255,180,84,0.32)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4,4]);
    ctx.beginPath();
    ctx.moveTo(turCx,turCy);
    ctx.lineTo(turCx+Math.cos(t.hullAngle-t.traverseLimit)*80, turCy+Math.sin(t.hullAngle-t.traverseLimit)*80);
    ctx.moveTo(turCx,turCy);
    ctx.lineTo(turCx+Math.cos(t.hullAngle+t.traverseLimit)*80, turCy+Math.sin(t.hullAngle+t.traverseLimit)*80);
    ctx.stroke();
    ctx.setLineDash([]);
  }

   // Barrel: 炮管根部接在炮塔前缘（=旋转中心 + 前缘偏移 turretFrontDist），长度按设计器口径
   // = 炮塔长 × (len/100)。与 gunRoot() 完全同轴，炮塔转动时根部随前缘一起走，不再从炮塔中心/尾部伸出。
   const barrelRayDx = Math.cos(t.turretAngle), barrelRayDy = Math.sin(t.turretAngle);
   const bSpec = t.barrel || { len: 120, width: 18, muzzle: 'none', evacPos: 55 };
   const barrelPct = Math.max(0, Math.min(3, (bSpec.len || 120) / 100));
   const barrelLen = t.turLen * barrelPct;
   const frontOff = turretFrontDist(t);
   const baseX = turCx + barrelRayDx*frontOff, baseY = turCy + barrelRayDy*frontOff;
   const endX = baseX + barrelRayDx*barrelLen, endY = baseY + barrelRayDy*barrelLen;
   const barrelWid = Math.max(3, t.turWid * ((bSpec.width || 18)/100) * 0.5);
   const perpX = -barrelRayDy, perpY = barrelRayDx;

   // main barrel tube
   ctx.strokeStyle = t.color; ctx.lineWidth = barrelWid;
   ctx.lineCap = 'round';
   ctx.beginPath(); ctx.moveTo(baseX, baseY); ctx.lineTo(endX, endY); ctx.stroke();
   // barrel highlight
   ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = Math.max(1, barrelWid*0.4);
   ctx.beginPath(); ctx.moveTo(baseX, baseY); ctx.lineTo(endX, endY); ctx.stroke();

   // 炮盾 mantlet（纯视觉，样式 none/single/double/collar/box/winged/wedge）：
   // 位于炮管根部（可沿炮管前后偏移 pos/%），宽度按炮塔全宽百分比计算；不影响任何判定。
   const mt = bSpec.mantlet || { style:'none', pos:0, width:40 };
   if(mt.style && mt.style !== 'none'){
      const mPos = (mt.pos||0)/100*barrelLen;
      const mW = Math.max(barrelWid*1.2, t.turWid*((mt.width!==undefined ? mt.width : 40)/100)*0.5);
      const mdx = baseX + barrelRayDx*mPos, mdy = baseY + barrelRayDy*mPos;
      const d = mW*0.6;
      ctx.save(); ctx.translate(mdx, mdy); ctx.rotate(t.turretAngle);
      ctx.lineWidth = 1;
      const dark = shade(t.color, -30), dark2 = shade(t.color, -14), edge = 'rgba(255,255,255,0.22)';
      if(mt.style === 'single'){
         ctx.fillStyle = dark; ctx.strokeStyle = edge;
         ctx.fillRect(-d/2, -mW, d, mW*2); ctx.strokeRect(-d/2, -mW, d, mW*2);
      } else if(mt.style === 'double'){
         ctx.fillStyle = dark; ctx.strokeStyle = edge;
         ctx.fillRect(-d*0.6, -mW*0.85, d*0.55, mW*1.7); ctx.strokeRect(-d*0.6, -mW*0.85, d*0.55, mW*1.7);
         ctx.fillStyle = dark2;
         ctx.fillRect(d*0.1, -mW*0.58, d*0.5, mW*1.16); ctx.strokeRect(d*0.1, -mW*0.58, d*0.5, mW*1.16);
      } else if(mt.style === 'collar'){
         ctx.fillStyle = dark2; ctx.strokeStyle = edge;
         ctx.fillRect(-d*0.3, -mW, d*0.6, mW*2); ctx.strokeRect(-d*0.3, -mW, d*0.6, mW*2);
         ctx.fillStyle = 'rgba(0,0,0,0.45)';
         ctx.fillRect(-d*0.05, -mW*0.72, d*0.1, mW*1.44);
      } else if(mt.style === 'box'){
         ctx.fillStyle = dark; ctx.strokeStyle = edge;
         ctx.fillRect(-d*0.9, -mW, d*1.8, mW*2); ctx.strokeRect(-d*0.9, -mW, d*1.8, mW*2);
         ctx.fillStyle = dark2;
         ctx.fillRect(d*0.55, -mW*0.9, d*0.2, mW*1.8);
      } else if(mt.style === 'winged'){
         ctx.fillStyle = dark; ctx.strokeStyle = edge;
         ctx.fillRect(-d*0.5, -mW*0.42, d, mW*0.84); ctx.strokeRect(-d*0.5, -mW*0.42, d, mW*0.84);
         ctx.fillRect(-d*0.5, -mW*1.1, d*0.55, mW*0.62); ctx.strokeRect(-d*0.5, -mW*1.1, d*0.55, mW*0.62);
         ctx.fillRect(-d*0.5, mW*0.48, d*0.55, mW*0.62); ctx.strokeRect(-d*0.5, mW*0.48, d*0.55, mW*0.62);
      } else if(mt.style === 'wedge'){
         ctx.fillStyle = dark; ctx.strokeStyle = edge;
         ctx.beginPath();
         ctx.moveTo(-d, -mW); ctx.lineTo(d, -mW*0.5); ctx.lineTo(d, mW*0.5); ctx.lineTo(-d, mW);
         ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      ctx.restore();
   }

   // bore evacuator bulge at configured position (styles: none/ring/bulb/slotted/long)
   const evc = (bSpec.evac && bSpec.evac.style) ? bSpec.evac
     : (bSpec.evacPos !== undefined ? { style: bSpec.evacPos > 0 ? 'ring' : 'none', pos: bSpec.evacPos } : { style: 'none', pos: 30 });
   if(evc.style && evc.style !== 'none'){
      const ex = baseX + barrelRayDx*(evc.pos/100)*barrelLen;
      const ey = baseY + barrelRayDy*(evc.pos/100)*barrelLen;
      const evacR = barrelWid*0.9;
      if(evc.style === 'ring' || evc.style === 'slotted'){
         ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = Math.max(2, barrelWid*0.35);
         ctx.beginPath();
         ctx.moveTo(ex + perpX*evacR, ey + perpY*evacR);
         ctx.lineTo(ex - perpX*evacR, ey - perpY*evacR);
         ctx.stroke();
         ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = Math.max(1, barrelWid*0.2);
         ctx.beginPath();
         ctx.moveTo(ex + perpX*evacR*0.7, ey + perpY*evacR*0.7);
         ctx.lineTo(ex - perpX*evacR*0.7, ey - perpY*evacR*0.7);
         ctx.stroke();
         if(evc.style === 'slotted'){
            ctx.fillStyle = 'rgba(0,0,0,0.55)';
            ctx.fillRect(ex - barrelRayDx*barrelWid*0.5 - perpX*evacR*0.35, ey - barrelRayDy*barrelWid*0.5 - perpY*evacR*0.35, barrelWid, evacR*0.7);
            ctx.fillRect(ex - barrelRayDx*barrelWid*0.5 + perpX*evacR*0.15, ey - barrelRayDy*barrelWid*0.5 + perpY*evacR*0.15, barrelWid, evacR*0.7);
         }
      } else if(evc.style === 'bulb'){
         ctx.save(); ctx.translate(ex, ey); ctx.rotate(t.turretAngle);
         ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = Math.max(1, barrelWid*0.2);
         ctx.beginPath(); ctx.ellipse(0, 0, barrelWid*0.6, barrelWid*0.95, 0, 0, TAU);
         ctx.fill(); ctx.stroke();
         ctx.restore();
      } else if(evc.style === 'long'){
         ctx.save(); ctx.translate(ex, ey); ctx.rotate(t.turretAngle);
         ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = Math.max(1, barrelWid*0.2);
         const L = barrelLen*0.12;
         ctx.fillRect(-barrelWid*0.35, -barrelWid*0.75, L, barrelWid*1.5);
         ctx.strokeRect(-barrelWid*0.35, -barrelWid*0.75, L, barrelWid*1.5);
         ctx.restore();
      }
   }

   // muzzle brake at the end
   if(bSpec.muzzle && bSpec.muzzle !== 'none'){
      const mx = endX, my = endY;
      ctx.strokeStyle = 'rgba(0,0,0,0.45)';
      if(bSpec.muzzle === 'single'){
         ctx.lineWidth = barrelWid*1.3;
         ctx.beginPath();
         ctx.moveTo(mx + perpX*barrelWid*0.8, my + perpY*barrelWid*0.8);
         ctx.lineTo(mx - perpX*barrelWid*0.8, my - perpY*barrelWid*0.8);
         ctx.stroke();
      } else if(bSpec.muzzle === 'double'){
         const bw = barrelWid*1.2;
         for(const off of [-0.5, 0.5]){
            const bx = mx + barrelRayDx*barrelWid*off;
            const by = my + barrelRayDy*barrelWid*off;
            ctx.lineWidth = barrelWid*0.7;
            ctx.beginPath();
            ctx.moveTo(bx + perpX*bw, by + perpY*bw);
            ctx.lineTo(bx - perpX*bw, by - perpY*bw);
            ctx.stroke();
         }
      } else if(bSpec.muzzle === 'multi'){
         const bw = barrelWid*1.3;
         for(const off of [-0.75, -0.25, 0.25]){
            const bx = mx + barrelRayDx*barrelWid*off;
            const by = my + barrelRayDy*barrelWid*off;
            ctx.lineWidth = barrelWid*0.5;
            ctx.beginPath();
            ctx.moveTo(bx + perpX*bw, by + perpY*bw);
            ctx.lineTo(bx - perpX*bw, by - perpY*bw);
            ctx.stroke();
         }
      } else if(bSpec.muzzle === 'slug'){
         ctx.lineWidth = barrelWid*1.1;
         ctx.beginPath(); ctx.arc(mx, my, barrelWid*0.7, t.turretAngle-Math.PI*0.4, t.turretAngle+Math.PI*0.4); ctx.stroke();
         ctx.lineWidth = Math.max(1, barrelWid*0.3);
         for(let i=0;i<3;i++){
            const a = t.turretAngle - Math.PI*0.3 + i*(Math.PI*0.6/2);
            ctx.beginPath();
            ctx.moveTo(mx, my);
            ctx.lineTo(mx + Math.cos(a)*barrelWid*0.7, my + Math.sin(a)*barrelWid*0.7);
            ctx.stroke();
         }
      } else if(bSpec.muzzle === 'pepperpot'){
         ctx.lineWidth = barrelWid*1.2;
         ctx.beginPath(); ctx.arc(mx, my, barrelWid*0.7, 0, TAU); ctx.stroke();
         ctx.lineWidth = Math.max(1, barrelWid*0.25);
         for(let i=0;i<4;i++){
            const a = t.turretAngle - Math.PI*0.5 + i*(Math.PI/2);
            ctx.beginPath();
            ctx.moveTo(mx + Math.cos(a)*barrelWid*0.7, my + Math.sin(a)*barrelWid*0.7);
            ctx.lineTo(mx + Math.cos(a)*barrelWid*0.45, my + Math.sin(a)*barrelWid*0.45);
            ctx.stroke();
         }
      } else if(bSpec.muzzle === 'heavy_square'){
         ctx.lineWidth = barrelWid*2.0;
         ctx.beginPath();
         ctx.moveTo(mx + perpX*barrelWid*1.1, my + perpY*barrelWid*1.1);
         ctx.lineTo(mx - perpX*barrelWid*1.1, my - perpY*barrelWid*1.1);
         ctx.stroke();
      } else if(bSpec.muzzle === 'cylinder'){
         ctx.save(); ctx.translate(mx, my); ctx.rotate(t.turretAngle);
         ctx.fillStyle = 'rgba(0,0,0,0.4)';
         ctx.fillRect(-barrelWid*0.8, -barrelWid*0.95, barrelWid*1.6, barrelWid*1.9);
         ctx.fillStyle = 'rgba(20,20,20,0.7)';
         ctx.fillRect(-barrelWid*0.6, -barrelWid*1.1, barrelWid*1.2, barrelWid*0.35);
         ctx.fillRect(-barrelWid*0.6, barrelWid*0.75, barrelWid*1.2, barrelWid*0.35);
         ctx.restore();
      }
   }
   // 炮管护套 jacket: thicker rectangle sleeve over part of the barrel (len>0 → active)
   const jk = bSpec.jacket || { len: 0, pos: 45 };
   if((jk.len || 0) > 0){
      const jkS = Math.max(0, Math.min(90, jk.pos || 45))/100*barrelLen;
      const jkE = Math.min(100, (jk.pos || 45) + (jk.len || 0))/100*barrelLen;
      const ax = baseX + barrelRayDx*jkS, ay = baseY + barrelRayDy*jkS;
      ctx.save(); ctx.translate(ax, ay); ctx.rotate(t.turretAngle);
      ctx.fillStyle = shade(t.color, -18); ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 1;
      ctx.fillRect(0, -barrelWid*0.85, Math.max(1, jkE-jkS), barrelWid*1.7);
      ctx.strokeRect(0, -barrelWid*0.85, Math.max(1, jkE-jkS), barrelWid*1.7);
      ctx.restore();
   }
   ctx.lineCap = 'butt';
   } // end turret/barrel block (skipped when the ammo rack blew the turret off)

  // ---- draw attachments ----
  if(!t.ammoBlew && Array.isArray(t.attachments)) t.attachments.forEach(att => {
    if(!att || !att.bindTo) return;
    let basePos = { x: t.x, y: t.y }, baseAngle = t.hullAngle;
    if (att.bindTo.startsWith('turret')) {
      basePos = { x: turCx, y: turCy };
      baseAngle = superstructureAngle(t);
    } else if (att.bindTo === 'gun_root') {
      basePos = { x: turCx, y: turCy };
      baseAngle = t.turretAngle;
    }
    
    const anchor = (t.anchors && t.anchors[att.bindTo]) ? t.anchors[att.bindTo] : { dx: 0, dy: 0 };
    const r = rotate(anchor.dx, anchor.dy, baseAngle);
    const ax = basePos.x + r.x, ay = basePos.y + r.y;
    
    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(baseAngle + (att.relativeAngle || 0));
    
    if (att.type === 'shield') {
      ctx.strokeStyle = 'rgba(92,200,255,0.6)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, att.size || 20, -Math.PI/3, Math.PI/3); ctx.stroke();
    } else if (att.type === 'drone') {
      ctx.fillStyle = t.color;
      ctx.fillRect(-4, -4, 8, 8);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.strokeRect(-4, -4, 8, 8);
    }
    ctx.restore();
  });

  // 血条阈值用实例 maxHp（t.maxHp 由 makeTank/applyHp 同步），stats.maxHp 可能是旧的塔载默认值
  const maxHp = (t.maxHp && t.maxHp > 0) ? t.maxHp : (t.stats?.maxHp || 100);
  if(t.hp < maxHp && t.hp > 0){
    const barW = 44, barH = 5;
    const bx = t.x - barW/2, by = t.y + (t.hullWid||38)/2 + 14;
    // 血条左侧重/中型标志（不遮挡坦克本体）
    drawClassBadge(ctx, t, bx - 9, by + barH/2);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(bx-1, by-1, barW+2, barH+2);
    const hpPct = Math.max(0, Math.min(1, t.hp / maxHp));
    ctx.fillStyle = t.team === 'player' ? '#7ed957' : '#ff5c4d';
    ctx.fillRect(bx, by, barW * hpPct, barH);
    ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1;
    ctx.strokeRect(bx, by, barW, barH);
  }
}

// 车型标志：六边形 = 重坦，五边形 = 中坦（显示在血条左侧）
function drawClassBadge(ctx, t, x, y){
  const n = t.heightClass === 'heavy' ? 6 : 5;
  const R0 = 6, r0 = 4;
  const cc = t.heightClass === 'heavy' ? '#ffb454' : '#5cc8ff';
  ctx.save();
  ctx.fillStyle = 'rgba(16,18,14,0.8)';
  ctx.strokeStyle = cc; ctx.lineWidth = 1.5;
  ctx.beginPath();
  for(let i = 0; i < n; i++){
    const a = -Math.PI/2 + i*(2*Math.PI/n);
    const px = x + Math.cos(a)*R0, py = y + Math.sin(a)*R0;
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  }
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = cc; ctx.globalAlpha = 0.85;
  ctx.beginPath();
  for(let i = 0; i < n; i++){
    const a = -Math.PI/2 + i*(2*Math.PI/n);
    const px = x + Math.cos(a)*r0, py = y + Math.sin(a)*r0;
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  }
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

// ======================= P-36/#81 biome 地面（drawGround） =======================
// 纯程序化零资产地面绘制：底色填充视口区 + 基于 seed 的确定性低频色斑。
// opts = { viewBounds: {minX,minY,maxX,maxY}, biome: 'concrete'|'meadow'|'steppe'|..., seed }
// 调色板来自 RULES.biomes；同 seed 同 biome 输出完全一致（LCG 确定性，不逐帧闪烁）。

// 种子哈希：数字直取；字符串 FNV-1a 压缩为 32bit 非零种子
function _groundSeedHash(seed) {
  let s;
  if (typeof seed === 'number') s = seed >>> 0;
  else {
    s = 2166136261 >>> 0;
    const str = String(seed);
    for (let i = 0; i < str.length; i++) {
      s = Math.imul(s ^ str.charCodeAt(i), 16777619) >>> 0;
    }
  }
  return s || 1;
}

function drawGround(ctx, opts) {
  opts = opts || {};
  const biomes = (typeof RULES !== 'undefined' && RULES.biomes) ? RULES.biomes : {};
  // 缺省调色板：RULES 未加载/未知 biome 时的中性草地回退
  const pal = biomes[opts.biome] || { base: '#3d4630', alt: ['#353d29', '#46503a'] };
  const vb = opts.viewBounds;
  if (!vb || !(vb.maxX > vb.minX) || !(vb.maxY > vb.minY)) return;

  const x0 = vb.minX, y0 = vb.minY, w = vb.maxX - vb.minX, h = vb.maxY - vb.minY;
  let s = _groundSeedHash(opts.seed);
  const next = () => {                       // LCG（Numerical Recipes 参数），确定性
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };

  const alts = (pal.alt && pal.alt.length) ? pal.alt : [pal.base];
  const n = 8 + Math.floor(next() * 7);      // 8~14 个大椭圆色斑

  ctx.save();
  ctx.fillStyle = pal.base;
  ctx.fillRect(x0, y0, w, h);
  ctx.beginPath(); ctx.rect(x0, y0, w, h); ctx.clip();   // 色斑裁剪在视口区内
  for (let i = 0; i < n; i++) {
    const cx = x0 + next() * w;
    const cy = y0 + next() * h;
    const rw = w * (0.10 + next() * 0.16);
    const rh = rw * (0.45 + next() * 0.5);
    const rot = next() * Math.PI;
    ctx.globalAlpha = 0.06 + next() * 0.06;  // alpha ≤0.12 低频色斑
    ctx.fillStyle = alts[Math.floor(next() * alts.length) % alts.length];
    ctx.beginPath();
    ctx.ellipse(cx, cy, rw, rh, rot, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    drawTank,
    drawBrokenTracks,
    drawCharredHull,
    drawFireGlow,
    drawShells,
    drawCover,
    drawFoliage,
    drawClassBadge,
    drawGround
  };
}
