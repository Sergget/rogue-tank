'use strict';

// tank_battledraw.js — mvp 战斗场景绘制层（坦克/断履带/焦黑车体/起火/炮弹/掩体/树冠/车型标志）。
// 仿 tank_fx.js 先例：每个 draw 函数显式接收 ctx（tank_paint.js 约定），不触碰 DOM。
// 测试台专用块（drawRange/addRangeShot/AMMO_KEYS/RANGE_*）留在 tank_mvp.html 不拆。
//
// 全局依赖（tank_paint.js，经 <script> 先加载）：paintShade/paintTracks/paintPartTexture/
//   paintTurretShadow/DECORATION_DEFS/paintRivets/paintWeathering。
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
// 车体实色（历史涂装 base；无 base 回退队伍色）——炮管/炮盾/副炮塔等金属件取自实色
function tankBodyCol(t){ return (typeof tankBodyColor === 'function') ? tankBodyColor(t.color, t.texture) : t.color; }
// 履带统一深钢色（不再按队伍染色）
const TRACK_STEEL = '#42454b';
// rolling tank tracks under the hull, driven by t.trackPhase
function drawTracks(ctx, t){
  paintTracks(ctx, hullPoly(t).verts, t.x, t.y, t.hullAngle, 1, TRACK_STEEL, t.trackPhase||0, { trackWidth: t.trackWidth || 8, trackOffset: t.trackOffset || 0 });
}
// hull top-down paint.
function renderHullTexture(ctx, t){
  // #TEX-2026-10-15: 动态损伤分级（hp 越低 weathering 越重）+ 每车固定 weathering seed
  const maxHp = (t.maxHp && t.maxHp > 0) ? t.maxHp : 100;
  const hpRatio = Math.max(0, Math.min(1, (t.hp || 0) / maxHp));
  const damageLevel = hpRatio > 0.75 ? 0 : hpRatio > 0.5 ? 1 : hpRatio > 0.25 ? 2 : 3;
  paintPartTexture(ctx, hullPoly(t).verts, t.x, t.y, t.hullAngle, 1, t.color, 'hull',
    { detail:true, texture: t.texture, damageLevel, weatherSeed: t.weatherSeed || 1,
      appearance: t.appearance || undefined });
}
// turret top-down paint.
function renderTurretTexture(ctx, cx, cy, angle, t){
  paintPartTexture(ctx, turretPoly(t).verts, cx, cy, angle, 1, t.color, 'turret',
    { detail:true, heightClass: t.heightClass, texture: t.texture,
      appearance: t.appearance || undefined });
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
    ctx.strokeStyle = paintShade(TRACK_STEEL, -58); ctx.lineWidth = tw*0.9; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(gapX - tw*1.2, hangY); ctx.lineTo(gapX + tw*0.3, hangY); ctx.stroke();
    ctx.strokeStyle = paintShade(TRACK_STEEL, -12); ctx.lineWidth = 1.2; ctx.setLineDash([3,4]); ctx.lineDashOffset = -((t.trackPhase||0)%7);
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
    // 2026-09-15 W6：autocannon 炮弹尺寸跟随 fxScale 缩小（更细炮管的视觉跟随；其他武器 fxScale=1）
    const sv = (typeof s.fxScale === 'number' && s.fxScale > 0) ? s.fxScale : 1;
    const _L = L * sv, _W = W * sv, _tailLen = tailLen * sv;
    ctx.save();
    let drawX = s.x, drawY = s.y, scale = 1;
    if(s.isArc && s.totalDist > 0){
      const p = Math.min(1, s.dist / s.totalDist);
      const z = Math.sin(p * Math.PI) * Math.min(120, s.totalDist * 0.35);
      drawY -= z;
      scale = 1 + z / 90;
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(s.x, s.y, W * 1.5, W * 0.75, ang, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    ctx.translate(drawX, drawY);
    ctx.rotate(ang);
    ctx.scale(scale, scale);
    // 拖尾（沿 -x 渐隐短线）
    ctx.globalCompositeOperation = 'lighter';
    const tg = ctx.createLinearGradient(-_tailLen, 0, 0, 0);
    tg.addColorStop(0, 'rgba(255,255,255,0)');
    tg.addColorStop(1, tail);
    ctx.strokeStyle = tg; ctx.lineWidth = 3 * sv; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(-_tailLen, 0); ctx.lineTo(0, 0); ctx.stroke();
    // 弹体：尖头朝 +x（飞行方向）
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(_L/2, 0);
    ctx.lineTo(-_L/2, -_W/2);
    ctx.lineTo(-_L/2 - 2, 0);
    ctx.lineTo(-_L/2, _W/2);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(_L/2, 0); ctx.lineTo(-_L/2, -_W/2); ctx.lineTo(-_L/2 - 2, 0); ctx.lineTo(-_L/2, _W/2); ctx.closePath(); ctx.stroke();
    // 弹头亮点
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath(); ctx.arc(_L*0.3, 0, 1.3 * sv, 0, TAU); ctx.fill();
    ctx.restore();
  }
}

// #U8（2026-10-16 新增）：河流整链绘制——把沿程铺开的一串段 OBB 还原为**单条中心线折线**，
// 用圆角连接的粗折线一次描边（先岸影后河色），彻底消除段间鳞片/砖块接缝与「双轨」线。
// rects 须为同一条河（同 groupId）的段，按沿程顺序传入。河色取 tier.fill（唯一口径
// RULES.coverTiers[tier].fill）。宽取各段短边的中位数（河宽沿程平滑变化，取中位避免端点收分影响）。
function drawRiverChain(ctx, rects, tier){
  if(!rects || rects.length < 2) return false;
  const wid = medianSegWidth(rects);
  if(!(wid > 0)) return false;
  const bankW = 6;   // 岸影外露宽度（px）
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(rects[0].x, rects[0].y);
  for(let i = 1; i < rects.length; i++) ctx.lineTo(rects[i].x, rects[i].y);
  // 第 1 遍：岸影（深色、加大线宽）
  ctx.strokeStyle = 'rgba(20,50,80,0.38)';
  ctx.lineWidth = wid + bankW * 2;
  ctx.stroke();
  // 第 2 遍：河色（盖住岸影内半，只留外侧窄边 = 岸影）
  ctx.strokeStyle = (tier && tier.fill) || '#3578a8';
  ctx.lineWidth = wid;
  ctx.stroke();
  ctx.restore();
  return true;
}

// 段短边中位数（河宽估计；偶数取中间两者均值）。
// #U24（2026-10-17 用户反馈「河流生效位置和贴图错位」）：**不能取 min(w,h)**。
//   strip 河段的几何是 `w = 沿程长度`（dist×1.25）、`h = 河宽`（thick×收分系数），
//   `angle` 又恰好是**沿程方向**——所以绘制时的「横向」是 h 而不是 min(w,h)。
//   实测 290/290 段的 min(w,h) 都是 h，但真实河宽中位数 190px 而 min 中位数只有 149px
//   （短段 w≈101 < h），逐段取 min 会让线的粗细在 101~205px 之间抖动，河面忽宽忽窄、
//   与物理判定（真实宽度恒为 h）对不上。正确口径：横向 = 段自身的短轴 = h。
function medianSegWidth(rects){
  const ws = rects.map(r => (r.h > 0 ? r.h : Math.min(r.w || 0, r.h || 0)))
    .filter(w => w > 0).sort((a, b) => a - b);
  if(!ws.length) return 0;
  const m = ws.length >> 1;
  return ws.length % 2 ? ws[m] : (ws[m - 1] + ws[m]) / 2;
}

// 河流段沿程排序：段沿曲线单向铺开，需按**真实走向**排序（非包围盒宽高）。
// #U8b（2026-10-17 修复）：原实现按「包围盒 x 极差 vs y 极差」择轴——对竖直河流（x 几乎不变、
//   y 跨全图）会误判为「按 x 排序」，导致段被乱序连线，河流被画成锯齿/方块串（实测
//   strip-river-0 的段 x 极差仅数百、y 极差 2000+，却因包围盒整体偏宽而按 x 排）。
//   现改为**主成分方向（PCA）投影排序**：对段中心做协方差，取主轴后按投影值排序，
//   对横/竖/斜向河流一律正确。
function orderRiverSegs(segs){
  if(!segs || segs.length < 2) return segs || [];
  const n = segs.length;
  let mx = 0, my = 0;
  for(const s of segs){ mx += s.x; my += s.y; }
  mx /= n; my /= n;
  let sxx = 0, syy = 0, sxy = 0;
  for(const s of segs){
    const dx = s.x - mx, dy = s.y - my;
    sxx += dx * dx; syy += dy * dy; sxy += dx * dy;
  }
  // 主轴：协方差矩阵最大特征向量方向（2×2 解析解）
  const tr = sxx + syy, det = sxx * syy - sxy * sxy;
  const disc = Math.sqrt(Math.max(0, tr * tr / 4 - det));
  const l1 = tr / 2 + disc;
  // 特征向量 (l1 - syy, sxy)（sxy≠0 时）；退化情形回退坐标轴
  let ax, ay;
  if(Math.abs(sxy) > 1e-9){ ax = l1 - syy; ay = sxy; }
  else { if(sxx >= syy){ ax = 1; ay = 0; } else { ax = 0; ay = 1; } }
  const len = Math.hypot(ax, ay) || 1;
  ax /= len; ay /= len;
  return segs.slice().sort((a, b) => ((a.x - mx) * ax + (a.y - my) * ay) - ((b.x - mx) * ax + (b.y - my) * ay));
}

// 水流 streak（浅色短线，横向偏移与相位由位置 hash 确定性派生；沿流向缓慢漂移）。
// 与河流主体分离导出，供调用方在整链描边后单独叠加（Node 生图时无 performance → 相位 0）。
function drawCoverWaterStreak(ctx, cov){
  const rects = (typeof coverSegRects === 'function') ? coverSegRects(cov) : [cov];
  const _now = (typeof performance !== 'undefined' && performance.now) ? performance.now() / 1000 : 0;
  const _h1 = function (n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
  for(const r of rects){
    const _ra = r.angle || 0, _rx = Math.cos(_ra), _ry = Math.sin(_ra);
    const _nx = -_ry, _ny = _rx; // 法向
    const _segLen = Math.max(r.w || 0, r.h || 0);
    const _halfW = Math.min(r.w || 0, r.h || 0) / 2;
    const _seed = (r.x || 0) * 0.37 + (r.y || 0) * 0.73;
    for (let _k = 0; _k < 3; _k++) {
      const _lat = (_h1(_seed + _k * 7.3) - 0.5) * 1.1 * _halfW;      // 横向偏移
      const _ph = _h1(_seed + _k * 13.7);                             // 纵向相位 0~1
      const _drift = ((_ph + _now * 0.03) % 1 - 0.5) * _segLen * 0.7; // 缓慢漂移
      const _sl = _segLen * (0.10 + _h1(_seed + _k * 3.1) * 0.10);    // streak 长
      const _cx = r.x + _rx * _drift + _nx * _lat;
      const _cy = r.y + _ry * _drift + _ny * _lat;
      ctx.strokeStyle = 'rgba(220,240,255,' + (0.22 + _h1(_seed + _k * 5.9) * 0.18).toFixed(2) + ')';
      ctx.lineWidth = 1.6 + _h1(_seed + _k * 9.2) * 1.4;
      ctx.beginPath();
      ctx.moveTo(_cx - _rx * _sl, _cy - _ry * _sl);
      ctx.lineTo(_cx + _rx * _sl, _cy + _ry * _sl);
      ctx.stroke();
    }
  }
}

// 地面投影（#U11，2026-10-17 用户需求「建筑、树木需要有淡淡的阴影」）。
// 统一光源假定自左上方，影子落在右下（+x,+y），与坦克炮塔影（paintTurretShadow 的
// 默认偏移）方向一致。只给「立在地上、有体积」的元素投影——建筑/岩石/残骸/植被；
// 水/河/泥/道路等贴地平面与纯装饰件不投影。
// 两层叠加做出软边：近层深、远层淡，零模糊开销（避免 shadowBlur 的逐帧模糊成本）。
//   box / rubble-box / rock-poly → 轮廓多边形投影（按 verts 或 OBB 角点）
//   tree / bush / fallen         → 椭圆投影（树按树冠半径，与 drawAssetCanopy 的 R 同源）
//   soft / barricade / stump     → 细长/小件，只在脚下垫一层很淡的接触影
function drawCoverShadow(ctx, cov){
  const tier = COVER_TIERS && COVER_TIERS[cov.tier];
  if(!tier) return;
  const st = tier.draw;
  // 贴地/平面类（road/mud/water/water-chain/bridge-deck）不投影：早退避免逐段 save/restore
  if(st === 'road' || st === 'mud' || st === 'water' || st === 'water-chain' || st === 'bridge-deck') return;
  const w = cov.w || 24, h = cov.h || 24;
  const ang = cov.angle || 0;   // 防御：angle 缺失时 coverCorners 会得 NaN，投影直接消失
  ctx.save();
  if(st === 'box' || st === 'rubble-box' || st === 'rock-poly'){
    // 建筑/岩石/残骸：偏移轮廓。偏移量随体量微增（大体块影子更长），上限 26px ——
    // nodeScale=3 下建筑世界尺寸 150~450px，固定 12px 偏移在体量旁几乎看不出方向感。
    const off = Math.min(26, 6 + Math.max(w, h) * 0.08);
    // coverCorners 直接用 cov.angle（undefined→NaN 会让整个投影消失），缺省补 0
    const c = (cov.angle === undefined || cov.angle === null)
      ? coverCorners(Object.assign({}, cov, { angle: 0 }))
      : coverCorners(cov);
    const silhouette = (dx, dy, alpha) => {
      ctx.beginPath();
      ctx.moveTo(c[0].x + dx, c[0].y + dy);
      for(let i = 1; i < c.length; i++) ctx.lineTo(c[i].x + dx, c[i].y + dy);
      ctx.closePath();
      ctx.fillStyle = `rgba(0,0,0,${alpha})`;
      ctx.fill();
    };
    silhouette(off, off * 1.15, 0.16);            // 远层：淡
    silhouette(off * 0.55, off * 0.62, 0.20);     // 近层：深（接触影）
  } else if(st === 'tree'){
    // 树冠投影：树冠绘制半径 R = max(w,h)*1.4*0.85（见 tank_assets ASSET_DEFS.tree.bakeCanopy），
    // 影子半径取 0.92R，略偏右下，模拟斜射光下的落影。
    const R = Math.max(w, h) * 1.4 * 0.85 * 0.92;
    const dy = 4 + Math.min(10, R * 0.16);
    ctx.fillStyle = 'rgba(0,0,0,0.10)';
    ctx.beginPath(); ctx.ellipse(cov.x + dy * 0.7, cov.y + dy, R, R * 0.82, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.beginPath(); ctx.ellipse(cov.x + dy * 0.35, cov.y + dy * 0.5, R * 0.78, R * 0.62, 0, 0, TAU); ctx.fill();
  } else if(st === 'bush' || st === 'fallen'){
    const rx = w * 0.42, ry = h * 0.42;
    const dy = 2 + Math.min(6, Math.max(w, h) * 0.08);
    ctx.fillStyle = 'rgba(0,0,0,0.09)';
    ctx.beginPath(); ctx.ellipse(cov.x + dy * 0.6, cov.y + dy, rx, ry, (cov.angle || 0), 0, TAU); ctx.fill();
  } else if(st === 'soft' || st === 'barricade' || st === 'stump'){
    const dy = 2;
    ctx.fillStyle = 'rgba(0,0,0,0.10)';
    ctx.beginPath();
    ctx.ellipse(cov.x + dy * 0.5, cov.y + dy, Math.max(w, 8) * 0.42, Math.max(h, 6) * 0.42,
      (cov.angle || 0), 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

// 地图元素分层绘制（§2.7）：box=矩形掩体（含标签）保持程序化；soft/barricade/stump/rubble/
// bush/tree/fallen 走资产层（js/tank_assets.js：ASSET_DEFS 注册表 + drawAsset——有图
// drawImage / 无图烘焙缓存，画法与旧内联分支逐字一致）。树冠叶片（bush/tree/fallen 的上层
// 叶片）由 drawFoliage 在坦克之上调用 drawAssetCanopy 形成视线遮挡。
// road（#87）：地面类扁平条带，由 mvp 按 tierGroup='ground' 垫底绘制，不遮单位。
function drawCover(ctx, cov){
  const tier = COVER_TIERS[cov.tier];
  // #U11：先落地面投影，再画实体（两层软边影，见 drawCoverShadow）
  drawCoverShadow(ctx, cov);
  if(tier.draw === 'box'){
    const c = coverCorners(cov);
    ctx.beginPath(); ctx.moveTo(c[0].x,c[0].y);
    for(let i=1;i<c.length;i++) ctx.lineTo(c[i].x,c[i].y);
    ctx.closePath();
    ctx.fillStyle = tier.fill; ctx.fill();
    ctx.strokeStyle = tier.stroke; ctx.lineWidth=2; ctx.stroke();
    // #1（2026-10-16）：建筑屋顶参考真实人字坡屋顶——屋脊线 + 两坡明暗 + 瓦片横纹 + 屋檐。
    // 全部确定性（坐标 hash），不动包围盒。
    const _bx = cov.x, _by = cov.y, _bw = cov.w || 40, _bh = cov.h || 40;
    const _bang = cov.angle || 0;
    const _bh1 = function (n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
    const _bseed = _bx * 0.913 + _by * 0.717;
    // #1（2026-10-16）：多种屋顶样式（按 hash 选择）：0=人字坡，1=平顶，2=四坡顶
    const _roofStyle = Math.floor(_bh1(_bseed + 3.1) * 3);
    ctx.save();
    ctx.translate(_bx, _by); ctx.rotate(_bang);
    const _hw = _bw / 2, _hh = _bh / 2;
    if (_roofStyle === 1) {
      // —— 平顶：女儿墙 + 屋面机房/水箱 ——
      ctx.fillStyle = 'rgba(120,110,100,0.95)';  // 屋面
      ctx.fillRect(-_hw, -_hh, _hw * 2, _hh * 2);
      // 女儿墙（内收边框）
      ctx.strokeStyle = 'rgba(80,70,60,1.0)'; ctx.lineWidth = 4;
      ctx.strokeRect(-_hw + 2, -_hh + 2, _hw * 2 - 4, _hh * 2 - 4);
      ctx.strokeStyle = 'rgba(160,150,135,0.6)'; ctx.lineWidth = 1.5;
      ctx.strokeRect(-_hw + 6, -_hh + 6, _hw * 2 - 12, _hh * 2 - 12);
      // 屋面机房
      const _mx = (_bh1(_bseed + 11.7) - 0.5) * _hw * 0.8;
      const _my = (_bh1(_bseed + 23.3) - 0.5) * _hh * 0.8;
      const _mw2 = Math.min(22, _hw * 0.35), _mh2 = Math.min(16, _hh * 0.3);
      ctx.fillStyle = 'rgba(95,88,80,1.0)';
      ctx.fillRect(_mx - _mw2/2, _my - _mh2/2, _mw2, _mh2);
      ctx.fillStyle = 'rgba(70,65,58,1.0)';
      ctx.fillRect(_mx - _mw2/2, _my - _mh2/2, _mw2, 3);  // 阴影边
      // 水箱/通风管
      const _vx = (_bh1(_bseed + 37.9) - 0.5) * _hw * 1.2;
      const _vy = (_bh1(_bseed + 41.2) - 0.5) * _hh * 1.2;
      ctx.fillStyle = 'rgba(110,120,130,1.0)';
      ctx.beginPath(); ctx.arc(_vx, _vy, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(80,88,96,1.0)';
      ctx.beginPath(); ctx.arc(_vx, _vy, 5, Math.PI, Math.PI * 2); ctx.fill();
    } else if (_roofStyle === 2) {
      // —— 四坡顶：中心点 + 四面坡 ——
      const _cx0 = 0, _cy0 = 0;
      // 四个三角形坡面（上/下/左/右，明暗不同）
      ctx.fillStyle = 'rgba(128,84,58,0.95)';  // 上（深）
      ctx.beginPath(); ctx.moveTo(-_hw, -_hh); ctx.lineTo(_hw, -_hh); ctx.lineTo(_cx0, _cy0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(148,98,66,0.95)';  // 下（浅）
      ctx.beginPath(); ctx.moveTo(-_hw, _hh); ctx.lineTo(_hw, _hh); ctx.lineTo(_cx0, _cy0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(138,91,62,0.95)';  // 左（中）
      ctx.beginPath(); ctx.moveTo(-_hw, -_hh); ctx.lineTo(-_hw, _hh); ctx.lineTo(_cx0, _cy0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(118,78,54,0.95)';  // 右（中深）
      ctx.beginPath(); ctx.moveTo(_hw, -_hh); ctx.lineTo(_hw, _hh); ctx.lineTo(_cx0, _cy0); ctx.closePath(); ctx.fill();
      // 脊线（四条）
      ctx.strokeStyle = 'rgba(70,42,28,1.0)'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(-_hw, -_hh); ctx.lineTo(_cx0, _cy0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(_hw, -_hh); ctx.lineTo(_cx0, _cy0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-_hw, _hh); ctx.lineTo(_cx0, _cy0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(_hw, _hh); ctx.lineTo(_cx0, _cy0); ctx.stroke();
      // 中心宝顶
      ctx.fillStyle = 'rgba(90,55,40,1.0)';
      ctx.fillRect(_cx0 - 4, _cy0 - 4, 8, 8);
    } else {
    // —— 人字坡屋顶（默认） ——
    // 屋脊方向：沿长边（_bw >= _bh 时屋脊横向，否则纵向）
    const _ridgeH = _bw >= _bh;
    const _rl = _ridgeH ? _hw : _hh;  // 屋脊半长
    const _rw = _ridgeH ? _hh : _hw;  // 坡面半宽
    // 屋檐：外扩 6% 的深色底
    ctx.fillStyle = 'rgba(45,25,18,0.85)';
    if (_ridgeH) ctx.fillRect(-_hw * 1.06, -_hh * 1.06, _hw * 2.12, _hh * 2.12);
    else ctx.fillRect(-_hw * 1.06, -_hh * 1.06, _hw * 2.12, _hh * 2.12);
    // 两坡：向阳面稍浅、背阴面稍深（微妙明暗，色差收敛）
    const _slopeLight = 'rgba(148,98,66,0.95)';
    const _slopeDark = 'rgba(128,84,58,0.95)';
    if (_ridgeH) {
      // 上坡（背阴，深）
      ctx.fillStyle = _slopeDark;
      ctx.fillRect(-_hw, -_hh, _hw * 2, _hh);
      // 下坡（向阳，浅）
      ctx.fillStyle = _slopeLight;
      ctx.fillRect(-_hw, 0, _hw * 2, _hh);
    } else {
      // 左坡（向阳，浅）
      ctx.fillStyle = _slopeLight;
      ctx.fillRect(-_hw, -_hh, _hw, _hh * 2);
      // 右坡（背阴，深）
      ctx.fillStyle = _slopeDark;
      ctx.fillRect(0, -_hh, _hw, _hh * 2);
    }
    // 屋脊线：深色脊
    ctx.fillStyle = 'rgba(70,42,28,1.0)';
    if (_ridgeH) ctx.fillRect(-_hw, -2.5, _hw * 2, 5);
    else ctx.fillRect(-2.5, -_hh, 5, _hh * 2);
    ctx.strokeStyle = 'rgba(255,220,180,0.25)'; ctx.lineWidth = 1;
    if (_ridgeH) { ctx.beginPath(); ctx.moveTo(-_hw, -1.5); ctx.lineTo(_hw, -1.5); ctx.stroke(); }
    else { ctx.beginPath(); ctx.moveTo(-1.5, -_hh); ctx.lineTo(-1.5, _hh); ctx.stroke(); }
    // 瓦片横纹：沿坡面方向的等距线（确定性间距）
    ctx.strokeStyle = 'rgba(60,35,22,0.35)'; ctx.lineWidth = 1;
    const _tileStep = 9;
    if (_ridgeH) {
      for (let _ty = _tileStep; _ty < _hh; _ty += _tileStep) {
        ctx.beginPath(); ctx.moveTo(-_hw, -_ty); ctx.lineTo(_hw, -_ty); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-_hw, _ty); ctx.lineTo(_hw, _ty); ctx.stroke();
      }
      // 瓦片竖缝（错缝，deterministic 偏移）
      for (let _tx = -_hw + 6; _tx < _hw; _tx += 12) {
        const _off = (_bh1(_bseed + _tx) - 0.5) * 6;
        ctx.beginPath(); ctx.moveTo(_tx + _off, -_hh); ctx.lineTo(_tx + _off, 0); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(_tx - _off, 0); ctx.lineTo(_tx - _off, _hh); ctx.stroke();
      }
    } else {
      for (let _tx = _tileStep; _tx < _hw; _tx += _tileStep) {
        ctx.beginPath(); ctx.moveTo(-_tx, -_hh); ctx.lineTo(-_tx, _hh); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(_tx, -_hh); ctx.lineTo(_tx, _hh); ctx.stroke();
      }
      for (let _ty = -_hh + 6; _ty < _hh; _ty += 12) {
        const _off = (_bh1(_bseed + _ty) - 0.5) * 6;
        ctx.beginPath(); ctx.moveTo(-_hw, _ty + _off); ctx.lineTo(0, _ty + _off); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, _ty - _off); ctx.lineTo(_hw, _ty - _off); ctx.stroke();
      }
    }
    // 烟囱：1~2 个 deterministic 位置
    const _nChim = 1 + Math.floor(_bh1(_bseed + 7.3) * 2);
    ctx.fillStyle = 'rgba(90,55,40,1.0)';
    for (let _ci = 0; _ci < _nChim; _ci++) {
      const _cx = (_bh1(_bseed + _ci * 13.7) - 0.5) * _hw * 1.2;
      const _cy = (_bh1(_bseed + _ci * 29.1) - 0.5) * _hh * 1.2;
      const _cs = Math.min(8, Math.min(_hw, _hh) * 0.18);
      ctx.fillRect(_cx - _cs/2, _cy - _cs/2, _cs, _cs);
      ctx.fillStyle = 'rgba(40,25,18,1.0)';
      ctx.fillRect(_cx - _cs/2, _cy - _cs/2, _cs, 2);
      ctx.fillStyle = 'rgba(90,55,40,1.0)';
    }
    }  // end 人字坡 else
    ctx.restore();
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
    // #R1 河面连续绘制（2026-10-13）：同组河段在数据层仍逐段落盘（连续性审计口径），
    // 渲染层不再逐段描边——半透明 fill + 每段 stroke 是「一段一段矩形叠加」观感的根因
    // （重叠区 alpha 二次叠加变深 + 每段 1.5px 描边形成网格线）。现改为不透明底色填充
    // （重叠同色无缝合并）+ 无描边 + 沿长轴单线高光；段间 25% 搭接保证外缘台阶为数 px 级。
    const rects = (typeof coverSegRects === 'function') ? coverSegRects(cov) : [cov];
    // #U8（2026-10-16 修复）：河流改由调用方按 groupId 合并整条链后一次性绘制
    //   （mvp 的 drawRiverChain 调用点）。本分支仅作**单段/退化回退**：dev 随机场或无 groupId
    //   的孤立水段走这里。原缺陷：每段沿长轴两侧各画一条 rgba(20,50,80,0.28) 深色线且画在
    //   fill 之后，段段相连后合成两条贯穿全程的平行粗线（用户实测「像铁轨一样」）。
    if(!drawRiverChain(ctx, rects, tier)){
      // 退化（<2 段）：直接填充矩形并描岸影，保证水域一定可见
      for(const r of rects){
        const rc = partCorners(r.x, r.y, r.angle||0, r.w/2, r.h/2);
        ctx.beginPath(); ctx.moveTo(rc[0].x,rc[0].y);
        for(let i=1;i<rc.length;i++) ctx.lineTo(rc[i].x,rc[i].y);
        ctx.closePath();
        ctx.strokeStyle = 'rgba(20,50,80,0.38)'; ctx.lineWidth = 12; ctx.stroke();
        ctx.fillStyle = tier.fill || '#3578a8'; ctx.fill();
      }
    }
    drawCoverWaterStreak(ctx, cov);
  } else if(tier.draw === 'water'){
    // ISSUE 3：水域可见——半透明蓝 blob（verts 多边形或矩形回退），区别于地形绿/褐/灰
    const c = coverCorners(cov);
    ctx.beginPath(); ctx.moveTo(c[0].x,c[0].y);
    for(let i=1;i<c.length;i++) ctx.lineTo(c[i].x,c[i].y);
    ctx.closePath();
    ctx.fillStyle = 'rgba(60,110,150,0.55)'; ctx.fill();
    ctx.strokeStyle = 'rgba(150,200,230,0.7)'; ctx.lineWidth=1.5; ctx.stroke();
    // 涟漪高光：质心向外的浅弧（确定性，无需 rng）
    let gx=0, gy=0; for(const p of c){ gx+=p.x; gy+=p.y; } gx/=c.length; gy/=c.length;
    ctx.strokeStyle = 'rgba(180,220,245,0.45)'; ctx.lineWidth=1;
    ctx.beginPath();
    ctx.arc(gx, gy, Math.min(cov.w, cov.h)*0.28, 0.4, Math.PI*0.9);
    ctx.stroke();
  } else if(tier.draw === 'bridge-deck'){
    // #R1 桥面绘制（2026-10-13）：与 road 同款沥青底（路面语言连续）+ 两侧护栏线 +
    // 桥向中线虚线（沿桥向=长边，白虚线），去 box 文本标签；mvp 把 bridge 画在河面之上。
    const c = coverCorners(cov);
    ctx.beginPath(); ctx.moveTo(c[0].x,c[0].y);
    for(let i=1;i<c.length;i++) ctx.lineTo(c[i].x,c[i].y);
    ctx.closePath();
    ctx.fillStyle = tier.fill || '#5a5750'; ctx.fill();
    ctx.strokeStyle = tier.stroke || '#33312c'; ctx.lineWidth=2; ctx.stroke();
    ctx.save();
    ctx.translate(cov.x, cov.y);
    ctx.rotate(cov.angle || 0);
    const hl = Math.max(cov.w, cov.h) / 2, hw = Math.min(cov.w, cov.h) / 2;
    ctx.strokeStyle = 'rgba(235,220,170,0.75)'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-hl*0.92, -hw*0.78); ctx.lineTo(hl*0.92, -hw*0.78);
    ctx.moveTo(-hl*0.92, hw*0.78); ctx.lineTo(hl*0.92, hw*0.78);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(240,235,210,0.65)'; ctx.lineWidth = 2;
    ctx.setLineDash([14,10]);
    ctx.beginPath(); ctx.moveTo(-hl*0.92, 0); ctx.lineTo(hl*0.92, 0); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  } else if(tier.draw === 'road'){
    // #87 村庄道路：扁平沥青条带（tierGroup='ground' → mvp 地面图层垫底绘制，
    // 画在坦克之下不遮单位；tank_bench 全掩体先于坦克绘制，同样垫底）。
    // 深灰沥青 + 边缘浅描边 + 中线虚线（虚线沿长轴、无随机相位，确定性）。
    const c = coverCorners(cov);
    ctx.beginPath(); ctx.moveTo(c[0].x,c[0].y);
    for(let i=1;i<c.length;i++) ctx.lineTo(c[i].x,c[i].y);
    ctx.closePath();
    ctx.fillStyle = tier.fill || '#3c3c3e'; ctx.fill();
    ctx.strokeStyle = 'rgba(210,205,190,0.35)'; ctx.lineWidth=1.5; ctx.stroke();
    // 中线虚线（沿条带长轴方向）
    ctx.save();
    ctx.translate(cov.x, cov.y);
    ctx.rotate(cov.angle || 0);
    ctx.strokeStyle = 'rgba(225,220,195,0.55)'; ctx.lineWidth = 2;
    ctx.setLineDash([12,10]);
    ctx.beginPath();
    if(cov.w >= cov.h){ ctx.moveTo(-cov.w*0.46, 0); ctx.lineTo(cov.w*0.46, 0); }
    else { ctx.moveTo(0, -cov.h*0.46); ctx.lineTo(0, cov.h*0.46); }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  } else if(typeof ASSET_DEFS !== 'undefined' && ASSET_DEFS[tier.draw]){
    // 资产层：soft/barricade/stump/rubble/bush/tree/fallen（依赖 js/tank_assets.js 先加载）
    drawAsset(ctx, tier.draw, cov.x, cov.y, cov.w, cov.h, cov.angle||0);
  } else {
    // 兜底渲染逻辑：资产缺失或未知 drawStyle 时，绘制半透明彩色框，确保物理存在即视觉可见
    const c = coverCorners(cov);
    ctx.beginPath(); ctx.moveTo(c[0].x,c[0].y);
    for(let i=1;i<c.length;i++) ctx.lineTo(c[i].x,c[i].y);
    ctx.closePath();
    ctx.fillStyle = tier.fill || 'rgba(128,128,128,0.5)'; ctx.fill();
    ctx.strokeStyle = tier.stroke || '#888'; ctx.lineWidth=1.5; ctx.stroke();
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
    // #1（2026-10-16）：雪地积雪树——白色树冠
    if (cov.variant === 'snowy' && cov.tier === 'tree') {
      ctx.save();
      ctx.translate(cov.x, cov.y);
      ctx.fillStyle = 'rgba(235,242,246,0.92)';
      ctx.strokeStyle = 'rgba(200,215,225,0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, 0, cov.w * 0.55, cov.h * 0.55, 0, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      // 积雪高光
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath();
      ctx.ellipse(-cov.w * 0.15, -cov.h * 0.15, cov.w * 0.3, cov.h * 0.25, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      continue;
    }
    if(typeof ASSET_DEFS !== 'undefined' && ASSET_DEFS[tier.draw] && ASSET_DEFS[tier.draw].bakeCanopy){
      drawAssetCanopy(ctx, tier.draw, cov.x, cov.y, cov.w, cov.h);
    }
  }
}

// ---------- 整车精灵替换通道（四层：履带/车体/炮塔/炮管） ----------
// spriteBarrelImages(t): 按主武器类型返回炮管图片数组（双管返回两张）。
//   standard/clip → 优先本车专用 imgVehicle（#L4：此前 imgHummel/imgPanzerIV 是死配置），
//   无则回退 imgStandard；autocannon → imgAutocannon；railgun → imgRailgun；
//   double_barrel → 两张同一来源图（横向偏移绘制）。
function spriteBarrelImages(t){
  const sp = t.sprite, b = (sp && sp.barrel) || {};
  const type = (t.weapons && t.weapons.primary && t.weapons.primary.type) || 'standard';
  const std = b.imgVehicle || b.imgStandard || 'assets/tanks/barrels/barrel-standard.png';
  const ac  = b.imgAutocannon || 'assets/tanks/barrels/barrel-autocannon.png';
  const rg  = b.imgRailgun || 'assets/tanks/barrels/barrel-railgun.png';
  let paths;
  if(type === 'autocannon') paths = [ac];
  else if(type === 'railgun') paths = [rg];
  else paths = [std];
  if(type === 'double_barrel') paths = [std, std];
  return paths.map(p => spriteImage(p)).filter(Boolean);
}
// spriteReady(t): 精灵已启用且四层图片都已加载完成。
function spriteReady(t){
  const sp = t.sprite;
  if(!sp || !sp.enabled) return false;
  const hi = spriteImage(sp.hull && sp.hull.img);
  const ti = spriteImage(sp.turret && sp.turret.img);
  if(!(hi && hi.complete && hi.naturalWidth && ti && ti.complete && ti.naturalWidth)) return false;
  const trk = spriteImage(sp.track && sp.track.img);
  if(!(trk && trk.complete && trk.naturalWidth)) return false;
  const bis = spriteBarrelImages(t);
  if(!bis.length) return false;
  for(const bi of bis){ if(!(bi.complete && bi.naturalWidth)) return false; }
  return true;
}
// drawSpriteTracks(ctx, t): 四层管线 Layer 0 —— 滚动履带条（车体之下）。
// 左右各一条 track-links.png 平铺带，随 hullAngle 旋转，用 t.trackPhase 滚动。
// 相位口径：滚动周期 = 整幅贴图宽度（track-links.png 宽 2548px 恰为 13×196px 链节周期的
// 整数倍，整幅首尾无缝）——不硬编码 196，换贴图后相位仍与平铺栅格自洽。
// 方向：与程序化 paintTracks 同源（该处 lineDashOffset = -phase，链节随 phase 增大向 +x 移动），
// 故此处同样取 +phase，否则两通道对同一 trackPhase 反向滚动。
function drawSpriteTracks(ctx, t){
  const sp = t.sprite, tr = (sp && sp.track) || {};
  const img = spriteImage(tr.img || 'assets/tanks/track-links.png');
  if(!img || !img.complete || !img.naturalWidth) return;
  const tw = t.trackWidth || 8;
  const s = (tr.scale > 0) ? tr.scale : tw / img.naturalHeight;
  const W = (t.hullWid || 30) / 2;
  const trackOff = t.trackOffset || 0;
  const L = t.hullLen || 60;
  const dx = tr.dx || 0, dy = tr.dy || 0;
  const tileLen = img.naturalWidth * s;
  const phase = (((t.trackPhase || 0) % tileLen) + tileLen) % tileLen;
  ctx.save();
  ctx.translate(t.x, t.y);
  ctx.rotate(t.hullAngle || 0);
  for(const dir of [-1, 1]){
    const cy = dir * (W + trackOff + tw / 2) + dy;
    const x0 = dx - L / 2, x1 = dx + L / 2;
    const y0 = cy - tw / 2, y1 = cy + tw / 2;
    ctx.save();
    ctx.beginPath(); ctx.rect(x0, y0, x1 - x0, y1 - y0); ctx.clip();
    const drawH = img.naturalHeight * s;
    const yImg = cy - drawH / 2;
    for(let x = x0 + phase - tileLen; x < x1; x += tileLen){
      ctx.drawImage(img, x, yImg, tileLen, drawH);
    }
    ctx.restore();
  }
  ctx.restore();
}
// drawSpriteBarrel(ctx, t, img, lateralOff): 四层管线 Layer 3 —— 炮管贴图。
// 炮管尾端 pivot 对准「座圈中心 + 炮塔局部 (mountDx-embed, mountDy+lateralOff)」旋转 turretAngle，
// 长度按 t.barrel.len（% turLen）缩放，带开火后座（复用 recoilT 逻辑）。
function drawSpriteBarrel(ctx, t, img, lateralOff){
  const sp = t.sprite, b = (sp && sp.barrel) || {};
  if(!img || !img.complete || !img.naturalWidth) return;
  const mountDx = +b.mountDx || 0, mountDy = +b.mountDy || 0;
  const embed = (b.embed !== undefined && b.embed !== null && b.embed !== '') ? +b.embed : 2;
  const scaleMult = +b.scaleMult || 1;
  const _bSpec = t.barrel || { len: 120 };
  let barrelLen = (t.turLen || 34) * Math.max(0, Math.min(3, (_bSpec.len || 120) / 100));
  const wtype = (t.weapons && t.weapons.primary && t.weapons.primary.type) || 'standard';
  if(wtype === 'autocannon'){
    const _ac = (t.weapons.primary.stats) || {};
    barrelLen *= (typeof _ac.barrelLenMult === 'number') ? _ac.barrelLenMult : 0.8;
  }
  const scale = barrelLen / img.naturalWidth * scaleMult;
  const _recoilT = t.recoilT || 0;
  let recoilOff = 0;
  if(_recoilT > 0){
    const _rc = Math.min(1, Math.max(0, _recoilT / 0.08));
    recoilOff = 5 * Math.sin(Math.PI * _rc);
  }
  const ang = superstructureAngle(t);
  const pOff = turretPivot(t);
  const r = rotate(mountDx - embed, mountDy + (lateralOff || 0), ang);
  const bx = pOff.x + r.x - Math.cos(ang) * recoilOff;
  const by = pOff.y + r.y - Math.sin(ang) * recoilOff;
  paintPartSprite(ctx, img, bx, by, ang, 1, scale, 0, 0, 0, [0, img.naturalHeight / 2]);
}
// drawTankSprite(ctx, t): 用 AI 生成的四层精灵替换程序化绘制。
// Layer 0 履带（滚动）→ Layer 1 车体（对准坦克原点、随 hullAngle）→
// Layer 2 炮塔（pivot 对准座圈中心、随炮塔角）→ Layer 3 炮管（武器类型切换、双管偏移、后座）。
// 对齐参数由设计器写入 tanks/<id>.json `sprite`。
function drawTankSprite(ctx, t){
  const sp = t.sprite, h = sp.hull || {}, s = sp.turret || {};
  const hi = spriteImage(h.img), ti = spriteImage(s.img);
  // 地面软阴影（精灵无烘焙阴影，补一块）
  ctx.save();
  ctx.translate(t.x, t.y);
  ctx.rotate(t.hullAngle || 0);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(0, 0, hi.naturalWidth*(h.scale||0)*0.52, hi.naturalHeight*(h.scale||0)*0.52, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
  drawSpriteTracks(ctx, t);
  paintPartSprite(ctx, hi, t.x, t.y, t.hullAngle, 1, h.scale, h.dx, h.dy, h.rot);

  // 与程序化分支保持层级：断履带/副炮塔/座圈/起火辉光都位于主炮塔下方（#L1）。
  if(t.trackBroken) drawBrokenTracks(ctx, t);
  drawSecondaryTurret(ctx, t);
  const pOff = turretPivot(t);
  drawTurretRing(ctx, t, pOff.x, pOff.y);
  if(t.fireT>0) drawFireGlow(ctx, t);

  if(t.hasTurret !== false){
    // 与程序化分支同源的炮塔投影阴影（此前精灵分支只有车体地面软阴影，炮塔层次感偏平）。
    paintTurretShadow(ctx, turretPoly(t).verts, pOff.x, pOff.y, superstructureAngle(t), 1, 2.5, 3.5, t.hullAngle);
    paintPartSprite(ctx, ti, pOff.x, pOff.y, superstructureAngle(t), 1,
      s.scale, s.dx, s.dy, s.rot, s.pivot);
    if(!t.ammoBlew){
      const wtype = (t.weapons && t.weapons.primary && t.weapons.primary.type) || 'standard';
      const imgs = spriteBarrelImages(t);
      if(wtype === 'double_barrel' && imgs.length >= 2){
        const gap = (+((sp.barrel || {}).gap) > 0) ? +sp.barrel.gap : 3.7;
        drawSpriteBarrel(ctx, t, imgs[0], -gap / 2);
        drawSpriteBarrel(ctx, t, imgs[1], gap / 2);
      } else if(imgs.length){
        drawSpriteBarrel(ctx, t, imgs[0], 0);
      }
    }
  }
}

function drawTank(ctx, t){
  const pOff = turretPivot(t);
  const turCx = pOff.x;
  const turCy = pOff.y;
  const bCol = tankBodyCol(t);   // 车体实色：炮管/炮盾等金属件取自实色，队伍色只留描边

  // 整车精灵替换通道（tanks/<id>.json `sprite.enabled`，设计器对齐后开启）：
  // 图片未就绪/殉爆飞头时回退程序化绘制，保证首帧与极端状态不穿帮。
  // 注意（#L1）：精灵只替换「车体/炮塔/炮管/履带」这四层画法，**不得**吞掉断履带、
  // 起火辉光、副炮塔、射界射线、附件与世界内血条——它们在两个分支中共用同一段收尾绘制。
  if(t.sprite && t.sprite.enabled && !t.ammoBlew && spriteReady(t)){
    drawTankSprite(ctx, t);
    // 精灵主体已在 drawTankSprite 内按程序化层级绘制断履带/副炮塔/座圈/起火辉光；
    // 这里仅绘制主体之上的通用提示与 HUD。
    drawTraverseRays(ctx, t, turCx, turCy);
    drawAttachments(ctx, t, turCx, turCy);
    drawTankHud(ctx, t);
    return;
  }

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
  // 2026-10-05：亮色队伍描边太丑 → 改暗色勾线（队伍识别走血条/小地图）
  ctx.strokeStyle = 'rgba(15,15,18,0.60)'; ctx.lineWidth=2; ctx.stroke();

  // 履带被击断：断开处 + 脱落履带节 + 撕裂金属
  if(t.trackBroken) drawBrokenTracks(ctx, t);

  // PLAN §8.1.2：副炮塔（turret 型副武器）——车体后部独立小炮塔，主炮塔之前绘制（层级在下）
  if(!t.ammoBlew) drawSecondaryTurret(ctx, t);

  // turret ring (on the hull, under the turret)
  drawTurretRing(ctx, t, turCx, turCy);

   // 弹药架殉爆后炮塔被掀飞（飞头），炮塔/炮管全部不再绘制；车体焦黑 + 炽热
   if(t.ammoBlew){ drawCharredHull(ctx, t); if(t.fireT>0) drawFireGlow(ctx, t); }
   if(!t.ammoBlew){
   // 阴影方向固定在世界方向（投影用 t.hullAngle），炮塔自转不改变阴影方向
   if(t.fireT>0) drawFireGlow(ctx, t);
   paintTurretShadow(ctx, turretPoly(t).verts, turCx, turCy, superstructureAngle(t), 1, 2.5, 3.5, t.hullAngle);

   const structureAngle = superstructureAngle(t);
   const tPoly = turretPoly(t);
   const tc = polyCorners(turCx,turCy,structureAngle, tPoly);
   renderTurretTexture(ctx, turCx, turCy, structureAngle, t);
  ctx.beginPath();
  ctx.moveTo(tc[0].x,tc[0].y);
  for(let i=1;i<tc.length;i++) ctx.lineTo(tc[i].x,tc[i].y);
  ctx.closePath();
  // 2026-10-05：亮色队伍描边太丑 → 改暗色勾线
  ctx.strokeStyle = 'rgba(15,15,18,0.60)'; ctx.lineWidth=1.5; ctx.stroke();

  // 炮塔转动射界：±traverseLimit 左右极限射线（仅当射界 < 180° 时有限制；180° = 360° 全向旋转）
  drawTraverseRays(ctx, t, turCx, turCy);

   // Barrel: 炮管根部接在炮塔前缘（=旋转中心 + 前缘偏移 turretFrontDist），长度按设计器口径
   // = 炮塔长 × (len/100)。与 gunRoot() 完全同轴，炮塔转动时根部随前缘一起走，不再从炮塔中心/尾部伸出。
   const barrelRayDx = Math.cos(t.turretAngle), barrelRayDy = Math.sin(t.turretAngle);
   // 2026-09-15 W6：autocannon 专用炮管外观（用户裁定）——更细（barrelWidthMult）略短（barrelLenMult），
   // 不绘制炮管护套/制退器/抽烟器（muzzle/evac/jacket 强制禁用）；mantlet 炮盾保留。
   const _isAc = !!(t.weapons && t.weapons.primary && t.weapons.primary.type === 'autocannon');
   const _bSpec0 = t.barrel || { len: 120, width: 18, muzzle: 'none', evacPos: 55 };
   const bSpec = _isAc
     ? Object.assign({}, _bSpec0, { muzzle: 'none', evac: { style: 'none' }, jacket: { len: 0 } })
     : _bSpec0;
   const barrelPct = Math.max(0, Math.min(3, (bSpec.len || 120) / 100));
   let barrelLen = t.turLen * barrelPct;
   const frontOff = turretFrontDist(t);
   let barrelWid = Math.max(3, t.turWid * ((bSpec.width || 18)/100) * 0.5);
   if(_isAc){
     const _acSpec = (t.weapons.primary && t.weapons.primary.stats) || {};
     barrelLen *= (typeof _acSpec.barrelLenMult === 'number') ? _acSpec.barrelLenMult : 0.8;
     barrelWid = Math.max(2, barrelWid * ((typeof _acSpec.barrelWidthMult === 'number') ? _acSpec.barrelWidthMult : 0.6));
   }
   const perpX = -barrelRayDy, perpY = barrelRayDx;

   // 开火后坐回弹（纯视觉）：recoilT 从 0.08 衰减到 0 时 sin(π·progress) 从 0 升到顶再回 0，
   // 形成「出击→回弹」。仅平移视觉炮管（baseX/baseY 全局后移），炮盾/护套/制退器均随 baseX/baseY
   // 自然跟随，避免「炮管后坐但制退器留在原地」穿帮。不改 gunRoot()/gunTip() 判定坐标。
   const _recoilT = t.recoilT || 0;
   const RECOIL_PX = 5;
   const _recoilMag = RECOIL_PX * (barrelWid / 18);
   let recoilOff = 0;
   if(_recoilT > 0){
     const _rc = Math.min(1, Math.max(0, _recoilT / 0.08));
     recoilOff = _recoilMag * Math.sin(Math.PI * _rc);
   }
   const baseX = turCx + barrelRayDx*frontOff - barrelRayDx*recoilOff;
   const baseY = turCy + barrelRayDy*frontOff - barrelRayDy*recoilOff;
   const endX = baseX + barrelRayDx*barrelLen, endY = baseY + barrelRayDy*barrelLen;

   // 2026-09-15 W4：双管并排——主武器 double_barrel 时炮盾上并排绘制 2 根炮管（左右各偏移），
   // 偏移量与 firePrimaryShell 的弹道横向偏移同源（barrelWid × barrelOffset × 0.5，管 0 左 / 管 1 右）。
   const _isDb = !!(t.weapons && t.weapons.primary && t.weapons.primary.type === 'double_barrel');
   let _dbOff = 0;
   if(_isDb){
     const _dbSpec = (t.weapons.primary && t.weapons.primary.stats) || {};
     const _dbMult = (typeof _dbSpec.barrelOffset === 'number') ? _dbSpec.barrelOffset : 1.85;
     _dbOff = barrelWid * _dbMult * 0.5;
   }
   const _tubeOffsets = _isDb ? [-_dbOff, _dbOff] : [0];
   // 电磁炮：双轨并排（两根导轨中间留空，一眼可辨）——程序化绘制，与游戏像素风格一致
   const _isRail = !!(t.weapons && t.weapons.primary && t.weapons.primary.type === 'railgun');
   // main barrel tube(s)（双管并排 / 单管居中 / 电磁炮双轨）
   for(const _toff of _tubeOffsets){
     const _tx = baseX + perpX*_toff, _ty = baseY + perpY*_toff;
     const _ex = endX + perpX*_toff, _ey = endY + perpY*_toff;
     if(_isRail){
       // 双轨：上下各一根细轨，中间镂空；青色能量线点缀
       const _railOff = Math.max(2, barrelWid * 0.28);
       const _railW = Math.max(1.5, barrelWid * 0.22);
       for(const _ro of [-_railOff, _railOff]){
         const _rx0 = _tx + perpX*_ro, _ry0 = _ty + perpY*_ro;
         const _rx1 = _ex + perpX*_ro, _ry1 = _ey + perpY*_ro;
         ctx.strokeStyle = shade(bCol, -45); ctx.lineWidth = _railW;
         ctx.lineCap = 'round';
         ctx.beginPath(); ctx.moveTo(_rx0, _ry0); ctx.lineTo(_rx1, _ry1); ctx.stroke();
       }
       // 轨间青色能量线（细，扁平无发光）
       ctx.strokeStyle = 'rgba(64,200,220,0.85)'; ctx.lineWidth = Math.max(1, barrelWid*0.12);
       ctx.beginPath(); ctx.moveTo(_tx, _ty); ctx.lineTo(_ex, _ey); ctx.stroke();
     } else {
       ctx.strokeStyle = shade(bCol, -45); ctx.lineWidth = barrelWid;
       ctx.lineCap = 'round';
       ctx.beginPath(); ctx.moveTo(_tx, _ty); ctx.lineTo(_ex, _ey); ctx.stroke();
       // barrel highlight
       ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = Math.max(1, barrelWid*0.4);
       ctx.beginPath(); ctx.moveTo(_tx, _ty); ctx.lineTo(_ex, _ey); ctx.stroke();
     }
   }

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
      const dark = shade(bCol, -30), dark2 = shade(bCol, -14), edge = 'rgba(255,255,255,0.22)';
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

   // #E13（2026-09-20）：双管时，炮管附件（护套 jacket / 制退器 muzzle brake / 抽烟器 evac）
   // 必须**逐管**绘制——否则两根炮管只有中线上一套附件，观感与几何都穿模。
   // _tubeBase = 每根管子的基准点（根部/口部），单管时退化为原基准（行为不变）。
   const _tubeBase = _tubeOffsets.map(function(o){
     return { bx: baseX + perpX*o, by: baseY + perpY*o, ex: endX + perpX*o, ey: endY + perpY*o };
   });

   // bore evacuator bulge at configured position (styles: none/ring/bulb/slotted/long)
   const evc = (bSpec.evac && bSpec.evac.style) ? bSpec.evac
     : (bSpec.evacPos !== undefined ? { style: bSpec.evacPos > 0 ? 'ring' : 'none', pos: bSpec.evacPos } : { style: 'none', pos: 30 });
   if(evc.style && evc.style !== 'none'){
    for(const _tb of _tubeBase){
      const ex = _tb.bx + barrelRayDx*(evc.pos/100)*barrelLen;
      const ey = _tb.by + barrelRayDy*(evc.pos/100)*barrelLen;
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
    }

   // muzzle brake at the end（#E13：逐管绘制）
   if(bSpec.muzzle && bSpec.muzzle !== 'none'){
    for(const _tb of _tubeBase){
      const mx = _tb.ex, my = _tb.ey;
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
   }
   // 炮管护套 jacket: thicker rectangle sleeve over part of the barrel (len>0 → active)
   // #E13（2026-09-20）：逐管绘制护套（双管时两根炮管各自带护套，与制退器/抽烟器同源）。
   const jk = bSpec.jacket || { len: 0, pos: 45 };
   if((jk.len || 0) > 0){
      const jkS = Math.max(0, Math.min(90, jk.pos || 45))/100*barrelLen;
      const jkE = Math.min(100, (jk.pos || 45) + (jk.len || 0))/100*barrelLen;
      for(const _tb of _tubeBase){
        const ax = _tb.bx + barrelRayDx*jkS, ay = _tb.by + barrelRayDy*jkS;
        ctx.save(); ctx.translate(ax, ay); ctx.rotate(t.turretAngle);
        ctx.fillStyle = shade(bCol, -18); ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 1;
        ctx.fillRect(0, -barrelWid*0.85, Math.max(1, jkE-jkS), barrelWid*1.7);
        ctx.strokeRect(0, -barrelWid*0.85, Math.max(1, jkE-jkS), barrelWid*1.7);
        ctx.restore();
      }
   }
   ctx.lineCap = 'butt';
   } // end turret/barrel block (skipped when the ammo rack blew the turret off)

  // ---- draw attachments ----
  drawAttachments(ctx, t, turCx, turCy);

  // ---- 世界内 HUD（血条 / 车型徽标 / 敌方 Lv.X）----
  drawTankHud(ctx, t);
}

// 炮塔座圈虚线（画在车体上、炮塔之下）。两条绘制通道共用（#L1）。
function drawTurretRing(ctx, t, turCx, turCy){
  if(t.ammoBlew) return;
  ctx.save();
  ctx.translate(turCx, turCy);
  ctx.strokeStyle = 'rgba(15,15,18,0.40)'; ctx.lineWidth = 1.5;
  ctx.setLineDash([3,3]);
  ctx.beginPath(); ctx.arc(0, 0, t.turWid*0.5, 0, TAU); ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

// 炮塔转动射界指示：±traverseLimit 左右极限射线（仅当射界 < π 时绘制；π = 360° 全向旋转）。
// 程序化与精灵两条绘制通道共用（#L1：精灵分支此前会吞掉该提示）。
function drawTraverseRays(ctx, t, turCx, turCy){
  if(!(t.traverseLimit < Math.PI)) return;
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

// 附件（shield/drone）绘制：绑定到车体/炮塔/gun_root 锚点。两条绘制通道共用（#L1）。
function drawAttachments(ctx, t, turCx, turCy){
  if(t.ammoBlew || !Array.isArray(t.attachments)) return;
  t.attachments.forEach(att => {
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
    // #TEX-2026-10-15: 装饰件可用 _decoDx/_decoDy 直接指定 local 坐标（不占用 anchors）
    const dx = (att._decoDx !== undefined) ? att._decoDx : anchor.dx;
    const dy = (att._decoDy !== undefined) ? att._decoDy : anchor.dy;
    const r = rotate(dx, dy, baseAngle);
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
    } else if (typeof DECORATION_DEFS !== 'undefined' && DECORATION_DEFS[att.type]) {
      // #TEX-2026-10-15: 程序化装饰件（toolbox/spareTrack/jerryCan/log/shovel/camoNet）
      DECORATION_DEFS[att.type](ctx, att.scale || 1);
    }
    ctx.restore();
  });
}

// 世界内 HUD：血条（未满血或敌方时显示）+ 重/中型车型徽标 + 敌方等级 Lv.X。
// 两条绘制通道共用（#L1：精灵分支此前在血条之前 return，导致开启精灵后血量完全不可见）。
function drawTankHud(ctx, t){
  // 血条阈值用实例 maxHp（t.maxHp 由 makeTank/applyHp 同步），stats.maxHp 可能是旧的塔载默认值
  const maxHp = (t.maxHp && t.maxHp > 0) ? t.maxHp : (t.stats?.maxHp || 100);
  const isEnemy = t.team === 'enemy';
  if(!((t.hp < maxHp || isEnemy) && t.hp > 0)) return;
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

  // 敌方等级标示 (Lv.X)
  if(isEnemy){
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = 'bold 9px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`Lv.${(t.aiTier || 0) + 1}`, bx + barW + 5, by + barH);
  }
}

// ======================= PLAN §8.1.2 副炮塔（secondary turret）绘制 =======================
// 副武器类型为 turret 时，在车体后部绘制一座独立的小炮塔（带独立 secondaryTurretAngle 炮管）。
// 纯位姿计算抽成 secondaryTurretPose（Node 可测），绘制层只消费位姿。
// 位置：车体尾后偏移（hullAngle 反向 hullLen*0.28），炮管长 = hullWid*0.55。
function secondaryTurretPose(t){
  if(!t || !t.weapons || !t.weapons.secondary || t.weapons.secondary.type !== 'turret') return null;
  const hullLen = t.hullLen || 120, hullWid = t.hullWid || 38;
  const back = hullLen * 0.28;
  const px = t.x - Math.cos(t.hullAngle || 0) * back;
  const py = t.y - Math.sin(t.hullAngle || 0) * back;
  const angle = (typeof t.secondaryTurretAngle === 'number') ? t.secondaryTurretAngle : (t.hullAngle || 0);
  return { x: px, y: py, angle: angle, radius: Math.max(5, hullWid * 0.30), barrelLen: hullWid * 0.55 };
}

function drawSecondaryTurret(ctx, t){
  const pose = secondaryTurretPose(t);
  if(!pose) return false;
  if(t.ammoBlew) return false;   // 殉爆掀飞炮塔后不绘制
  const r = pose.radius;
  // 底座阴影 + 环形座圈
  ctx.save();
  ctx.translate(pose.x, pose.y);
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath(); ctx.arc(2, 3, r, 0, TAU); ctx.fill();
  ctx.fillStyle = shade(tankBodyCol(t), -22);
  ctx.strokeStyle = 'rgba(15,15,18,0.60)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill(); ctx.stroke();
  // 独立转向的炮管
  ctx.rotate(pose.angle);
  ctx.strokeStyle = shade(tankBodyCol(t), -10); ctx.lineWidth = Math.max(2, r * 0.5); ctx.lineCap = 'butt';
  ctx.beginPath(); ctx.moveTo(r * 0.2, 0); ctx.lineTo(pose.barrelLen, 0); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.16)'; ctx.lineWidth = Math.max(1, r * 0.18);
  ctx.beginPath(); ctx.moveTo(r * 0.4, -r * 0.12); ctx.lineTo(pose.barrelLen * 0.9, -r * 0.12); ctx.stroke();
  ctx.restore();
  return true;
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
  const palFor = (b) => biomes[b] || { base: '#3d4630', alt: ['#353d29', '#46503a'] };
  const vb = opts.viewBounds;
  if (!vb || !(vb.maxX > vb.minX) || !(vb.maxY > vb.minY)) return;

  const x0 = vb.minX, y0 = vb.minY, w = vb.maxX - vb.minX, h = vb.maxY - vb.minY;
  // #U3（2026-10-17）：原 LCG 流（`next()`）已随色斑改为世界格 hash 而移除——
  //   其唯一用途是生成视口相对色斑（缺陷根源）。底色/gradient 不需要随机数。

  // #1（2026-10-16）：多 biome——按 x 区段分别填充底色，交界处渐变过渡
  const zones = opts.biomeZones;
  const TRANS_W = 260;  // 过渡带半宽（px）
  ctx.save();
  if (zones && zones.length) {
    for (let zi = 0; zi < zones.length; zi++) {
      const z = zones[zi];
      const zx0 = Math.max(x0, z.x0), zx1 = Math.min(x0 + w, z.x1);
      if (zx1 <= zx0) continue;
      ctx.fillStyle = palFor(z.biome).base;
      ctx.fillRect(zx0, y0, zx1 - zx0, h);
    }
    // 交界渐变：每对相邻区段在边界处画 TRANS_W*2 宽的线性渐变
    for (let zi = 0; zi + 1 < zones.length; zi++) {
      const bx = zones[zi].x1;  // 交界 x
      const gx0 = Math.max(x0, bx - TRANS_W), gx1 = Math.min(x0 + w, bx + TRANS_W);
      if (gx1 <= gx0) continue;
      const cA = palFor(zones[zi].biome).base, cB = palFor(zones[zi + 1].biome).base;
      const grad = ctx.createLinearGradient(gx0, 0, gx1, 0);
      grad.addColorStop(0, cA);
      grad.addColorStop(1, cB);
      ctx.fillStyle = grad;
      ctx.fillRect(gx0, y0, gx1 - gx0, h);
    }
  } else {
    const pal = palFor(opts.biome);
    ctx.fillStyle = pal.base;
    ctx.fillRect(x0, y0, w, h);
  }
  // 色斑：用主 biome（或首区段）的 alt 色
  const pal = palFor((zones && zones.length ? zones[0].biome : opts.biome));
  const alts = (pal.alt && pal.alt.length) ? pal.alt : [pal.base];

  // #U3（2026-10-17 修复）：色斑改为**世界坐标锚定**——原实现以视口为基准生成
  //   （`x0 + next()*w`），视口每移动一点整组色斑随之平移，观感上「地面纹理跟着玩家走」。
  //   现改为按固定世界格（CELL）铺开：每格的色斑数量/位置/尺寸/角度全部由「格坐标 + seed」
  //   经 hash 派生（不用 LCG 流，避免顺序依赖），与视口无关 ⇒ 相机移动时色斑纹丝不动。
  //   只绘制与视口相交的格，成本与格数成正比（与视口面积成正比，同原实现）。
  const CELL = 640;                        // 世界格边长（px）
  const baseSeed = _groundSeedHash(opts.seed);
  const gx0 = Math.floor(x0 / CELL) - 1, gx1 = Math.floor((x0 + w) / CELL) + 1;
  const gy0 = Math.floor(y0 / CELL) - 1, gy1 = Math.floor((y0 + h) / CELL) + 1;
  // 格内确定性 hash（同格同值；与遍历顺序无关）
  const cellHash = (gx, gy, k) => {
    let n = baseSeed ^ Math.imul(gx | 0, 0x9E3779B1) ^ Math.imul(gy | 0, 0x85EBCA77) ^ Math.imul(k | 0, 0xC2B2AE3D);
    n = Math.imul(n ^ (n >>> 15), 0x2545F491);
    n = Math.imul(n ^ (n >>> 13), 0x27D4EB2F);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };

  ctx.beginPath(); ctx.rect(x0, y0, w, h); ctx.clip();   // 色斑裁剪在视口区内
  for (let gy = gy0; gy <= gy1; gy++) {
    for (let gx = gx0; gx <= gx1; gx++) {
      const n = 3 + Math.floor(cellHash(gx, gy, 0) * 4);   // 每格 3~6 个斑（密覆视口，无缝无重叠感）
      const cxs = gx * CELL, cys = gy * CELL;
      for (let i = 0; i < n; i++) {
        const cx = cxs + cellHash(gx, gy, i * 6 + 1) * CELL;
        const cy = cys + cellHash(gx, gy, i * 6 + 2) * CELL;
        const rw = CELL * (0.10 + cellHash(gx, gy, i * 6 + 3) * 0.16);
        const rh = rw * (0.45 + cellHash(gx, gy, i * 6 + 4) * 0.5);
        const rot = cellHash(gx, gy, i * 6 + 5) * Math.PI;
        ctx.globalAlpha = 0.06 + cellHash(gx, gy, i * 6 + 6) * 0.06;  // alpha ≤0.12 低频色斑
        ctx.fillStyle = alts[Math.floor(cellHash(gx, gy, i * 6 + 3) * alts.length) % alts.length];
        ctx.beginPath();
        ctx.ellipse(cx, cy, rw, rh, rot, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.globalAlpha = 1;
  // #U11（2026-10-17 用户需求）：biome 地面**材质纹理**——在底色与低频色斑之上叠一层
  //   细密、世界锚定的程序化纹理（纯 canvas，零资产，与 `assets/` 为空的设计一致）。
  //   按 biome 分别绘制：草地→短划草丛；雪地→细碎雪粒 + 微弱风纹；沙漠→沙纹涟漪；
  //   泥地→深色湿斑；城镇→横向铺装线。全部用 cellHash 派生（同格同值、随相机移动不动）。
  drawGroundTexture(ctx, opts, { x0, y0, w, h, baseSeed });
  ctx.restore();
}

// 地面材质纹理（#U11）。opts 同 drawGround；box 为视口世界矩形；seed 为基哈希。
// 每个 biome 用一套「图元」：位置/角度/尺寸/透明度全部由世界格 hash 派生，确定性且不随视口漂移。
// 支持 biomeZones：按区段分别取样式（strip 节点一根横向世界会跨多个 biome），
// 区段裁剪与 drawGround 的底色填充同口径（同一 z.x0/z.x1）。
function drawGroundTexture(ctx, opts, box){
  const { x0, y0, w, h, baseSeed } = box;
  const zones = opts.biomeZones;
  if(zones && zones.length){
    for(let i = 0; i < zones.length; i++){
      const zx0 = Math.max(x0, zones[i].x0), zx1 = Math.min(x0 + w, zones[i].x1);
      if(zx1 <= zx0) continue;
      _paintGroundTexture(ctx, zones[i].biome, baseSeed, zx0, y0, zx1 - zx0, h);
    }
    return;
  }
  _paintGroundTexture(ctx, opts.biome, baseSeed, x0, y0, w, h);
}

// 单 biome 的纹理落笔（drawGroundTexture 的内层实现，按矩形区段裁剪）。
function _paintGroundTexture(ctx, biome, baseSeed, x0, y0, w, h){
  const style = {
    // #U11 调色：纹理色必须与底色拉开 ≥12 个灰阶，否则在 0.35~0.85 的 globalAlpha 叠加后
    //   合成为「看不出有纹理」（实测 steppe/desert/mudland/concrete 首版全部踩到这个坑）。
    meadow:   { cell: 26,  n: 3, col: 'rgba(150,180,96,0.30)',  shape: 'blade' },
    snow:     { cell: 22,  n: 4, col: 'rgba(255,255,255,0.34)', shape: 'speck' },
    desert:   { cell: 40,  n: 2, col: 'rgba(170,136,74,0.42)',  shape: 'dune' },
    steppe:   { cell: 30,  n: 3, col: 'rgba(92,76,40,0.45)',    shape: 'blade' },
    mudland:  { cell: 34,  n: 2, col: 'rgba(38,28,18,0.42)',    shape: 'patch' },
    concrete: { cell: 48,  n: 2, col: 'rgba(176,180,186,0.45)', shape: 'pave' }
  }[biome];
  if(!style || !(w > 0) || !(h > 0)) return;
  const CELL = style.cell;
  // 独立于色斑的 hash 通道（用不同乘子避免与色斑完全同位）
  const h1 = (gx, gy, k) => {
    let n = baseSeed ^ Math.imul(gx | 0, 0x27D4EB2F) ^ Math.imul(gy | 0, 0x165667B1) ^ Math.imul(k | 0, 0x9E3779B1);
    n = Math.imul(n ^ (n >>> 15), 0x85EBCA77);
    n = Math.imul(n ^ (n >>> 13), 0xC2B2AE3D);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  const gx0 = Math.floor(x0 / CELL) - 1, gx1 = Math.floor((x0 + w) / CELL) + 1;
  const gy0 = Math.floor(y0 / CELL) - 1, gy1 = Math.floor((y0 + h) / CELL) + 1;
  ctx.save();
  ctx.beginPath(); ctx.rect(x0, y0, w, h); ctx.clip();
  ctx.fillStyle = style.col;
  ctx.strokeStyle = style.col;
  for (let gy = gy0; gy <= gy1; gy++) {
    for (let gx = gx0; gx <= gx1; gx++) {
      const n = 1 + Math.floor(h1(gx, gy, 0) * style.n);
      for (let i = 0; i < n; i++) {
        const b = i * 5;
        const px = gx * CELL + h1(gx, gy, b + 1) * CELL;
        const py = gy * CELL + h1(gx, gy, b + 2) * CELL;
        const s = 0.5 + h1(gx, gy, b + 3);
        ctx.globalAlpha = 0.35 + h1(gx, gy, b + 4) * 0.5;
        if (style.shape === 'blade') {
          // 草丛短划：斜向 3~7px
          const ang = -1.2 + h1(gx, gy, b + 5) * 0.8;
          const len = 3 + s * 4;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(px + Math.cos(ang) * len, py + Math.sin(ang) * len);
          ctx.stroke();
        } else if (style.shape === 'speck') {
          // 雪粒：1~2px 小点
          ctx.beginPath();
          ctx.arc(px, py, 0.6 + s * 0.9, 0, Math.PI * 2);
          ctx.fill();
        } else if (style.shape === 'dune') {
          // 沙纹：横向短弧
          const rw = 8 + s * 10;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.ellipse(px, py, rw, rw * 0.28, 0, Math.PI * 0.15, Math.PI * 0.85);
          ctx.stroke();
        } else if (style.shape === 'patch') {
          // 湿斑：暗色小椭圆
          ctx.beginPath();
          ctx.ellipse(px, py, 4 + s * 7, 3 + s * 5, h1(gx, gy, b + 5) * Math.PI, 0, Math.PI * 2);
          ctx.fill();
        } else if (style.shape === 'pave') {
          // 铺装线：短横向直线
          const len = 14 + s * 18;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(px - len / 2, py);
          ctx.lineTo(px + len / 2, py);
          ctx.stroke();
        }
      }
    }
  }
  ctx.globalAlpha = 1;
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
    drawRiverChain,        // #U8：河流整链描边（调用方按 groupId 合并后单次调用）
    drawCoverWaterStreak,  // #U8：水流 streak 叠加（整链描边后逐段调用）
    orderRiverSegs,        // #U8：河流段沿程排序
    drawCoverShadow,       // #U11：地图元素地面投影
    drawGroundTexture,     // #U11：biome 地面材质纹理
    drawFoliage,
    drawClassBadge,
    drawGround,
    secondaryTurretPose,
    drawSecondaryTurret,
    // 两条绘制通道共用的收尾视觉（#L1）：炮塔座圈 / 射界射线 / 附件 / 世界内 HUD
    drawTurretRing,
    drawTraverseRays,
    drawAttachments,
    drawTankHud
  };
}
