'use strict';

// tank_assets.js — M0 贴图资产层（P-06 / DEVELOPMENT.md §2.10）。
// 地图元素（soft/barricade/stump/rubble/bush/tree/fallen）的程序化贴图注册表 + 浏览器
// Image 加载器 + 离屏烘焙缓存。双通道：
//   1. 图片通道：assets/<key>.png（及 <key>_canopy.png）存在 → drawAsset 直接 drawImage；
//   2. 程序化通道：无图/未加载 → 调用 ASSET_DEFS[key].bake 程序化绘制，首次按
//      「key + 尺寸」离屏烘焙进 ASSET_CACHE（沿用 js/tank_paint.js PAINT_CACHE 思路），
//      后续 drawImage——视觉与 tank_battledraw.js 原程序化画法一致、file:// 兼容、零依赖。
//
// 注册表（ASSET_DEFS）为纯数据 + 纯函数，可 Node 测；document/canvas/Image 只在函数体内、
// 以 typeof document !== 'undefined' 守卫（Node 加载安全）。
//
// 设计约定：
//   - bake(ctx, cov) 把元素画在以 (cov.x, cov.y) 为中心的 cov.w×cov.h 范围上——与
//     tank_battledraw.js 原分支逐字一致（坐标/颜色/线宽不变）。烘焙精灵按角度无关处理：
//     原画法对 soft/barricade/stump/rubble/bush/tree/fallen 均不随 cov.angle 旋转
//     （soft 的 boxPath 原按 coverCorners 旋转——bake 以 angle 0 的 partCorners 矩形等价，
//     mvp 全部掩体 angle 0，视觉零变化），drawAsset 的 angle 参数为接口预留、暂不旋转。
//   - bakeCanopy(ctx, cov)：树冠/灌木叶片层（原 drawFoliage 的 bush/tree/fallen 画法），
//     由 drawFoliage 在坦克之上调用 drawAssetCanopy 形成视线遮挡——两层分离保证层级不变。
//   - 锚点契约（anchorX/anchorY 与 canopyAnchorX/canopyAnchorY）：导出/替换图片时，
//     精灵内"掩体中心"应位于 (anchorX, anchorY) 像素处（bake.html 预览会标出实测锚点）。
//   - soft/barricade 的显示色（fill/stroke）经 tierStyle 取 RULES.coverTiers 单一来源，
//     无 RULES 环境（Node 单测）回退字面量。

// ---------- 注册表（纯数据 + 纯函数，无 DOM） ----------

// 显示样式单一来源：RULES.coverTiers（浏览器经 js/tank_cover.js 的 COVER_TIERS 全局）。
// bake 内 soft/barricade 的 fill/stroke 从这里取；无 RULES/COVER_TIERS 时回退字面量。
function tierStyle(key){
  if(typeof RULES !== 'undefined' && RULES.coverTiers) return RULES.coverTiers[key] || null;
  if(typeof COVER_TIERS !== 'undefined') return COVER_TIERS[key] || null;
  return null;
}

// 尺寸/锚点为各档名义尺寸（缺省导出尺寸；bake 函数本身按 cov.w/cov.h 参数化绘制）。
// 锚点 = 名义尺寸下实测内容的几何推导值（bake.html 预览显示实测值，允许 ±1~2px 容差）。
const ASSET_DEFS = {
  // 栅栏（soft）：矩形栏体 + 7 根立柱（原 drawCover soft 分支）
  soft: {
    w: 170, h: 10, anchorX: 85.75, anchorY: 5.75,
    bake(ctx, cov){
      const x = cov.x, y = cov.y, w = cov.w, h = cov.h;
      // boxPath 等价（bake 恒角度无关：以 angle 0 的 partCorners 矩形代替 coverCorners）
      const c = partCorners(x, y, 0, w/2, h/2);
      ctx.beginPath(); ctx.moveTo(c[0].x,c[0].y);
      for(let i=1;i<c.length;i++) ctx.lineTo(c[i].x,c[i].y);
      ctx.closePath();
      const ts = tierStyle('soft');
      ctx.fillStyle = (ts && ts.fill) || 'rgba(150,118,70,0.4)'; ctx.fill();
      ctx.strokeStyle = (ts && ts.stroke) || '#96764a'; ctx.lineWidth=1.5; ctx.stroke();
      // 立柱
      ctx.strokeStyle = '#6b5436'; ctx.lineWidth=2;
      for(let i=-3;i<=3;i++){
        ctx.beginPath();
        ctx.arc(x + (i*w/7), y, 1.5, 0, TAU);
        ctx.stroke();
      }
    }
  },
  // 沙袋路障（barricade）：一排堆叠椭圆 + 顶部凸袋（原 drawCover barricade 分支）
  barricade: {
    w: 64, h: 28, anchorX: 32.75, anchorY: 14.75,
    bake(ctx, cov){
      const x = cov.x, y = cov.y, w = cov.w, h = cov.h;
      // 沙袋：一排堆叠椭圆 + 顶部凸袋
      ctx.fillStyle = 'rgba(150,118,66,0.85)';
      for(let i=0;i<4;i++){
        ctx.beginPath();
        ctx.ellipse(x - w/2 + (i+0.5)*w/4, y, w/10, h*0.32, 0, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(120,96,54,0.9)';
      ctx.beginPath();
      ctx.ellipse(x, y - h*0.15, w/2, h*0.22, 0, 0, TAU);
      ctx.fill();
      const ts = tierStyle('barricade');
      ctx.strokeStyle = (ts && ts.stroke) || '#9e8048'; ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.ellipse(x, y, w/2, h/2, 0, 0, TAU); ctx.stroke();
    }
  },
  // 树桩（stump）：木桩椭圆 + 年轮（原 drawCover stump 分支）
  stump: {
    w: 24, h: 18, anchorX: 12.75, anchorY: 9.75,
    bake(ctx, cov){
      const x = cov.x, y = cov.y, w = cov.w, h = cov.h;
      ctx.fillStyle = 'rgba(88,58,30,0.9)';
      ctx.beginPath(); ctx.ellipse(x, y, w/2, h/2, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(50,34,16,1)'; ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.ellipse(x, y, w/2, h/2, 0, 0, TAU); ctx.stroke();
      // 年轮
      ctx.strokeStyle = 'rgba(60,40,22,0.6)';
      ctx.beginPath(); ctx.ellipse(x, y, w*0.3, h*0.3, 0, 0, TAU); ctx.stroke();
    }
  },
  // 碎石（rubble）：5 颗碎石块（原 drawCover rubble 分支）
  rubble: {
    w: 38, h: 17, anchorX: 20.04, anchorY: 7.75,
    bake(ctx, cov){
      const x = cov.x, y = cov.y, w = cov.w, h = cov.h;
      for(let i=0;i<5;i++){
        const ox = (i%2? 1:-1)*(w*0.18 + i*2.5);
        const oy = (i<2? 1:-1)*h*0.15 + (i===4? 0 : 2);
        ctx.fillStyle = i%2 ? 'rgba(96,92,84,0.75)' : 'rgba(112,108,98,0.7)';
        ctx.beginPath(); ctx.arc(x+ox, y+oy, 2.2 + (i%3), 0, TAU); ctx.fill();
      }
    }
  },
  // 灌木丛（bush）：基底阴影（bake）+ 上层叶片（bakeCanopy，画在坦克之上遮视线）
  bush: {
    w: 56, h: 34, anchorX: 28, anchorY: 17,
    canopyAnchorX: 24.64, canopyAnchorY: 19.2,
    bake(ctx, cov){
      const x = cov.x, y = cov.y, w = cov.w, h = cov.h;
      // 灌木基底阴影（上层叶片在 bakeCanopy）
      ctx.fillStyle = 'rgba(26,40,22,0.28)';
      ctx.beginPath(); ctx.ellipse(x, y, w/2, h/2, 0, 0, TAU); ctx.fill();
    },
    bakeCanopy(ctx, cov){
      const x = cov.x, y = cov.y, w = cov.w, h = cov.h;
      for(let i=0;i<5;i++){
        const oa = (i/5)*TAU + 0.6;
        const ox = Math.cos(oa)*w*0.22, oy = Math.sin(oa)*h*0.22;
        ctx.fillStyle = i%2 ? 'rgba(70,110,50,0.5)' : 'rgba(96,130,60,0.45)';
        ctx.beginPath(); ctx.ellipse(x+ox, y+oy, w*0.22, h*0.22, oa, 0, TAU); ctx.fill();
      }
      ctx.strokeStyle = 'rgba(92,132,60,0.55)'; ctx.lineWidth=1;
      ctx.beginPath(); ctx.ellipse(x, y, w*0.34, h*0.34, 0, 0, TAU); ctx.stroke();
    }
  },
  // 树（tree）：树干（bake）+ 树冠叶片（bakeCanopy，画在坦克之上遮视线）
  tree: {
    w: 24, h: 18, anchorX: 15.15, anchorY: 15.15,
    canopyAnchorX: 39.26, canopyAnchorY: 39.26,
    bake(ctx, cov){
      const x = cov.x, y = cov.y, w = cov.w, h = cov.h;
      // 树干
      const r = Math.max(w, h)*0.6;
      ctx.fillStyle = 'rgba(58,42,24,0.92)';
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(36,26,14,1)'; ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
    },
    bakeCanopy(ctx, cov){
      const x = cov.x, y = cov.y, w = cov.w, h = cov.h;
      // #A10：冠径乘数由 1.9 降至 1.4，使树冠视觉半径更贴近逻辑 OBB（24×18），
      // 缓解"所见远大于所挡"的视觉-逻辑脱节；如需进一步收紧可继续下调或提为 RULES 参数。
      const R = Math.max(w, h)*1.4;
      ctx.fillStyle = 'rgba(44,70,32,0.62)';
      ctx.beginPath(); ctx.arc(x, y, R*0.85, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(66,104,46,0.5)';
      ctx.beginPath(); ctx.arc(x+R*0.28, y-R*0.2, R*0.5, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(x-R*0.3, y+R*0.15, R*0.45, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(48,80,38,0.6)'; ctx.lineWidth=1;
      ctx.beginPath(); ctx.arc(x, y, R*0.85, 0, TAU); ctx.stroke();
    }
  },
  // 倒树（fallen，残骸）：横躺树干 + 枝杈 + 根部断面（bake）+ 树冠叶片（bakeCanopy）
  fallen: {
    w: 58, h: 9, anchorX: 33.55, anchorY: 7.95,
    canopyAnchorX: 1.0, canopyAnchorY: 15.9,
    bake(ctx, cov){
      const x = cov.x, y = cov.y, w = cov.w, h = cov.h;
      // 倒树：横躺树干沿 cov.w 方向（锥形椭圆 + 枝杈 + 根部伐倒断面），树冠叶片在 bakeCanopy
      const L = w/2, r0 = Math.max(3, h*0.5), r1 = Math.max(2, h*0.3);
      // 树干主体（根部粗、梢部细：两段椭圆渐变）
      ctx.fillStyle = 'rgba(58,42,24,0.92)';
      ctx.beginPath(); ctx.ellipse(x + L*0.15, y, L*0.65, r0, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(66,48,26,0.9)';
      ctx.beginPath(); ctx.ellipse(x - L*0.15, y, L*0.6, r1, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(36,26,14,1)'; ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.ellipse(x, y, L, r0, 0, 0, TAU); ctx.stroke();
      // 枝杈（向上翘起的短枝）
      ctx.strokeStyle = 'rgba(66,48,26,0.9)'; ctx.lineWidth=1.5;
      for(let i=-2;i<=2;i++){
        const bx = x + i*L*0.38;
        const dir = (i%2===0) ? 1 : -1;
        ctx.beginPath(); ctx.moveTo(bx, y);
        ctx.lineTo(bx + dir*h*0.6, y - dir*h*0.8);
        ctx.stroke();
      }
      // 根部伐倒断面（树干左端圆截面 + 年轮）
      ctx.fillStyle = 'rgba(126,96,60,0.95)';
      ctx.beginPath(); ctx.arc(x - L, y, r0*0.9, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(60,40,22,0.8)'; ctx.lineWidth=1;
      ctx.beginPath(); ctx.arc(x - L, y, r0*0.9, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.arc(x - L, y, r0*0.45, 0, TAU); ctx.stroke();
    },
    bakeCanopy(ctx, cov){
      const x = cov.x, y = cov.y, w = cov.w, h = cov.h;
      // 倒树树冠：摊扁的叶片簇覆盖树干端部（灌木效果，画在坦克之上遮挡视线）
      const cx = x + w*0.32, cy = y;
      const rw = Math.max(8, w*0.3), rh = Math.max(6, h*1.5);
      for(let i=0;i<5;i++){
        const oa = (i/5)*TAU + 0.5;
        const ox = Math.cos(oa)*rw*0.55, oy = Math.sin(oa)*rh*0.55;
        ctx.fillStyle = i%2 ? 'rgba(70,110,50,0.55)' : 'rgba(96,130,60,0.5)';
        ctx.beginPath(); ctx.ellipse(cx+ox, cy+oy, rw*0.5, rh*0.5, oa, 0, TAU); ctx.fill();
      }
      ctx.strokeStyle = 'rgba(92,132,60,0.55)'; ctx.lineWidth=1;
      ctx.beginPath(); ctx.ellipse(cx, cy, rw, rh, 0, 0, TAU); ctx.stroke();
    }
  }
};

// ---------- 浏览器分支（Image 加载器 + 离屏烘焙缓存） ----------
// 仅函数体内访问 document/canvas/Image；typeof document 守卫保证 Node 加载与调用安全。

const ASSET_IMAGES = new Map();  // key（含 '<key>_canopy'）-> HTMLImageElement | null（null=未加载/不可用）
const ASSET_CACHE  = new Map();  // `${key}:${layer}:${qw}x${qh}` -> { canvas, ax, ay }

// 返回已加载图片（无图/未加载/Node 环境返回 null；未加载会发起异步加载）
function assetImage(key){
  if(!ASSET_IMAGES.has(key)) loadAssetImage(key);
  const img = ASSET_IMAGES.get(key);
  return img || null;
}

// 尝试加载 assets/<key>.png；失败/不存在时保持 null（永久回退程序化 bake）
function loadAssetImage(key){
  if(ASSET_IMAGES.has(key)) return;
  ASSET_IMAGES.set(key, null);
  if(typeof document === 'undefined') return;   // Node 安全
  const img = new Image();
  img.onload = () => { ASSET_IMAGES.set(key, img); };
  img.onerror = () => { /* 保持 null：回退 bake */ };
  img.src = 'assets/' + key + '.png';
}

// 预加载全部注册表档位（含 canopy 层 <key>_canopy.png）
function preloadAssets(){
  for(const key of Object.keys(ASSET_DEFS)){
    loadAssetImage(key);
    if(ASSET_DEFS[key].bakeCanopy) loadAssetImage(key + '_canopy');
  }
}

const MAX_ASSET_CACHE_SIZE = 128;

function clearAssetCache() {
  ASSET_CACHE.clear();
}

// 烘焙精灵缓存（key = 资产 key + 层 + 尺寸，尺寸取 0.5px 量化以限制缓存增长）。
// 返回 { canvas, ax, ay }（掩体中心位于 canvas 内 (ax, ay) 像素处）或 null。
function getBakedSprite(key, w, h, layer){
  const def = ASSET_DEFS[key];
  if(!def || typeof document === 'undefined') return null;
  if(layer === 'canopy' && !def.bakeCanopy) return null;
  const qw = Math.round(w*2)/2, qh = Math.round(h*2)/2;
  const cacheKey = key + ':' + (layer || 'base') + ':' + qw + 'x' + qh;
  if(ASSET_CACHE.has(cacheKey)) return ASSET_CACHE.get(cacheKey);
  if(ASSET_CACHE.size >= MAX_ASSET_CACHE_SIZE){
    const firstKey = ASSET_CACHE.keys().next().value;
    if(firstKey !== undefined) ASSET_CACHE.delete(firstKey);
  }
  const spr = bakeAssetCanvas(key, qw, qh, layer);
  if(spr) ASSET_CACHE.set(cacheKey, spr);
  return spr;
}

// 离屏烘焙：先在超大探针画布上画一遍，用 getImageData 量出实际内容包围盒，再按包围盒
// 精确尺寸二次烘焙（bake 为确定性纯函数，两次绘制一致）。锚点保证落在画布内（≥1px）。
function bakeAssetCanvas(key, w, h, layer){
  const def = ASSET_DEFS[key];
  if(!def || typeof document === 'undefined') return null;
  if(layer === 'canopy' && !def.bakeCanopy) return null;
  const bakeFn = (layer === 'canopy') ? def.bakeCanopy : def.bake;
  const W = Math.max(1, w), H = Math.max(1, h);
  // 探针画布：PAD 需盖过全部内容的越界（树冠叶片可到 ~1.6×max(w,h)）
  const PAD = Math.ceil(Math.max(W, H)*2 + 16);
  const pw = Math.ceil(W) + PAD*2, ph = Math.ceil(H) + PAD*2;
  const probe = document.createElement('canvas');
  probe.width = pw; probe.height = ph;
  const pctx = probe.getContext('2d');
  const px = PAD + W/2, py = PAD + H/2;
  bakeFn(pctx, { x: px, y: py, w: W, h: H });
  const imgData = pctx.getImageData(0, 0, pw, ph);
  const data = imgData.data;
  let minX = pw, minY = ph, maxX = -1, maxY = -1;
  for(let y = 0; y < ph; y++){
    const row = y*pw*4;
    for(let x = 0; x < pw; x++){
      if(data[row + x*4 + 3] !== 0){
        if(x < minX) minX = x;
        if(x > maxX) maxX = x;
        if(y < minY) minY = y;
        if(y > maxY) maxY = y;
      }
    }
  }
  if(maxX < 0){ // 空内容兜底：按名义尺寸矩形
    minX = PAD; minY = PAD; maxX = PAD + Math.ceil(W); maxY = PAD + Math.ceil(H);
  }
  // 锚点 = 探针中掩体中心 (px,py) 相对内容包围盒的位置；负锚点补边保证 ≥1px
  const ax0 = px - minX, ay0 = py - minY;
  const shiftX = Math.max(0, 1 - ax0), shiftY = Math.max(0, 1 - ay0);
  const cw = Math.ceil(maxX - minX + 1 + shiftX), ch = Math.ceil(maxY - minY + 1 + shiftY);
  const canvas = document.createElement('canvas');
  canvas.width = cw; canvas.height = ch;
  const ctx = canvas.getContext('2d');
  const ax = ax0 + shiftX, ay = ay0 + shiftY;
  bakeFn(ctx, { x: ax, y: ay, w: W, h: H });
  return { canvas, ax, ay, w: W, h: H, layer: layer || 'base' };
}

// 绘制资产基底层：有已加载图片（assets/<key>.png）→ drawImage（按实例尺寸缩放）；
// 无图/未加载 → 烘焙精灵（首次烘焙入缓存，后续 drawImage）。
// angle 为接口预留（原画法不随角度旋转，见模块头注释）；layer 仅供内部 canopy 分流。
function drawAsset(ctx, key, x, y, w, h, angle){
  drawAssetSprite(ctx, key, x, y, w, h, 'base');
}

// 绘制资产树冠/叶片层（原 drawFoliage 的 bush/tree/fallen 画法，画在坦克之上遮视线）
function drawAssetCanopy(ctx, key, x, y, w, h){
  drawAssetSprite(ctx, key, x, y, w, h, 'canopy');
}

function drawAssetSprite(ctx, key, x, y, w, h, layer){
  const def = ASSET_DEFS[key];
  if(!def) return;
  if(layer === 'canopy' && !def.bakeCanopy) return;
  if(!(w > 0)) w = def.w;
  if(!(h > 0)) h = def.h;
  const img = assetImage(layer === 'canopy' ? key + '_canopy' : key);
  if(img){
    // 图片替换通道：精灵名义尺寸 def.w×def.h → 实例尺寸 w×h，绕锚点缩放
    const sx = w / def.w, sy = h / def.h;
    const ax = (layer === 'canopy' && def.canopyAnchorX !== undefined) ? def.canopyAnchorX : def.anchorX;
    const ay = (layer === 'canopy' && def.canopyAnchorY !== undefined) ? def.canopyAnchorY : def.anchorY;
    ctx.drawImage(img, x - ax*sx, y - ay*sy, img.width*sx, img.height*sy);
    return;
  }
  const spr = getBakedSprite(key, w, h, layer);
  if(spr) ctx.drawImage(spr.canvas, x - spr.ax, y - spr.ay);
}

// 双重导出：浏览器全局脚本 + Node（测试）加载
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ASSET_DEFS,
    ASSET_CACHE,
    clearAssetCache,
    assetImage,
    loadAssetImage,
    preloadAssets,
    getBakedSprite,
    bakeAssetCanvas,
    drawAsset,
    drawAssetCanopy
  };
}
