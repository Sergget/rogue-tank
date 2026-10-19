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

// 确定性伪随机（烘焙为纯函数：同 key 同序号恒得同值；探针/二次烘焙两次绘制一致，缓存安全）
function hash01(key, i){
  let h = 2166136261 >>> 0;
  const s = key + ':' + i;
  for(let k=0;k<s.length;k++){ h ^= s.charCodeAt(k); h = Math.imul(h, 16777619); }
  h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

// #TEX15-2026-10-19：不规则叶团/树冠轮廓路径（波浪多边形）——树冠、灌木、倒树树冠
// 一律不再用「多个椭圆拼贴」，改为单条连续波浪轮廓（radiusFn 提供 0..1 相对半径）。
// 只负责 beginPath + 闭合路径，fill/stroke/clip 由调用方决定；segs 越大轮廓越平滑。
// 供 tank_assets（bake）+ tank_battledraw（雪地树冠）共用，确定性无随机。
function blobPath(ctx, x, y, rx, ry, rot, radiusFn, segs){
  const n = segs || 24;
  const ca = Math.cos(rot || 0), sa = Math.sin(rot || 0);
  ctx.beginPath();
  for(let i = 0; i < n; i++){
    const t = (i / n) * TAU;
    const r = radiusFn(i, t);
    const u = Math.cos(t) * r * rx, v = Math.sin(t) * r * ry;
    const px = x + u * ca - v * sa, py = y + u * sa + v * ca;
    if(i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

// 圆角矩形路径（mini-canvas 无 roundRect/quadraticCurveTo，用 4 段 arc + 直线拼）。
// x,y = 左上角；只建路径不 fill/stroke，由调用方决定。
function roundedRectPath(ctx, x, y, w, h, r){
  const rr = Math.max(0.5, Math.min(r || 2, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.arc(x + w - rr, y + rr, rr, -Math.PI / 2, 0);
  ctx.lineTo(x + w, y + h - rr);
  ctx.arc(x + w - rr, y + h - rr, rr, 0, Math.PI / 2);
  ctx.lineTo(x + rr, y + h);
  ctx.arc(x + rr, y + h - rr, rr, Math.PI / 2, Math.PI);
  ctx.lineTo(x, y + rr);
  ctx.arc(x + rr, y + rr, rr, Math.PI, Math.PI * 1.5);
  ctx.closePath();
}

// 单只沙袋（barricade 组件）：圆角矩形袋体 + 上缘受光/下缘背光 + 横向布纹缝线 + 两端系带。
// light = 0..1（相对全局光源左上：越靠近左上越亮）。全部图元落在 w×h 内。
function sandbag(ctx, cx, cy, w, h, light){
  const r = Math.min(2.5, h * 0.30);
  // 袋底暗缘（体积下缘）
  ctx.fillStyle = 'rgba(72,56,32,0.55)';
  roundedRectPath(ctx, cx - w/2, cy - h/2 + 1.0, w, h - 1.0, r);
  ctx.fill();
  // 袋体基色（随 light 微调明暗）
  const t = 0.55 + 0.45 * light;
  const R = Math.round(148 * t + 96 * (1 - t)), G = Math.round(122 * t + 74 * (1 - t)), B = Math.round(72 * t + 44 * (1 - t));
  ctx.fillStyle = 'rgba(' + R + ',' + G + ',' + B + ',0.92)';
  roundedRectPath(ctx, cx - w/2, cy - h/2, w, h, r);
  ctx.fill();
  // 上缘受光（左上光源）
  ctx.strokeStyle = 'rgba(200,176,120,' + (0.30 + 0.30 * light).toFixed(2) + ')';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, Math.max(1, w * 0.34), Math.PI * 0.95, Math.PI * 1.55);
  ctx.stroke();
  // 下缘背光
  ctx.strokeStyle = 'rgba(58,44,26,0.5)';
  ctx.beginPath();
  ctx.arc(cx, cy + h * 0.18, Math.max(1, w * 0.34), Math.PI * 0.05, Math.PI * 0.95, true);
  ctx.stroke();
  // 横向布纹缝线（2 条）
  ctx.strokeStyle = 'rgba(96,76,48,0.45)';
  ctx.lineWidth = 0.8;
  for(let k = -1; k <= 1; k += 2){
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.34, cy + k * h * 0.12);
    ctx.lineTo(cx + w * 0.34, cy + k * h * 0.12);
    ctx.stroke();
  }
  // 两端系带结
  ctx.fillStyle = 'rgba(70,54,30,0.8)';
  for(const sx of [-1, 1]){
    ctx.beginPath();
    ctx.arc(cx + sx * w * 0.42, cy, 1.0, 0, TAU);
    ctx.fill();
  }
}


// 尺寸/锚点为各档名义尺寸（缺省导出尺寸；bake 函数本身按 cov.w/cov.h 参数化绘制）。
// 锚点 = 名义尺寸下实测内容的几何推导值（bake.html 预览显示实测值，允许 ±1~2px 容差）。
const ASSET_DEFS = {
  // 栅栏（soft）：矩形栏体 + 7 根立柱（原 drawCover soft 分支）
  soft: {
    w: 170, h: 10, anchorX: 85.75, anchorY: 5.75,
    bake(ctx, cov){
      const x = cov.x, y = cov.y, w = cov.w, h = cov.h;
      // #TEX17（2026-10-19）俯视栅栏 = 薄板墙顶面：整个 OBB 就是墙的顶。
      //   沿长轴铺木板拼缝（hash 相位），左上缘受光、右下缘背光（与建筑/岩石同一光源）；
      //   立柱/斜撑等立面元素删除——俯视图里不存在。包络仍是 w×h。
      const hh = h / 2, hw = w / 2;
      const vertical = h > w;                      // 竖放栅栏（沿 y 长轴）时拼缝沿 y
      const L = vertical ? h : w;                  // 长轴长
      const T = vertical ? w : h;                  // 厚（短轴）
      // 顶面基色（沿长轴两段明暗，模拟板面受光不均）
      const base0 = 'rgba(158,124,76,0.95)', base1 = 'rgba(140,108,66,0.95)';
      if(vertical){
        ctx.fillStyle = base0; ctx.fillRect(x - T/2, y - L/2, T, L * 0.5);
        ctx.fillStyle = base1; ctx.fillRect(x - T/2, y, T, L * 0.5);
      } else {
        ctx.fillStyle = base0; ctx.fillRect(x - L/2, y - T/2, L * 0.5, T);
        ctx.fillStyle = base1; ctx.fillRect(x, y - T/2, L * 0.5, T);
      }
      // 受光/背光长缘（俯视薄板的立体感来源：受光侧亮线 + 背光侧暗线）
      ctx.strokeStyle = 'rgba(212,182,124,0.55)'; ctx.lineWidth = 1;
      ctx.beginPath();
      if(vertical){ ctx.moveTo(x - T/2 + 0.8, y - L/2 + 1); ctx.lineTo(x - T/2 + 0.8, y + L/2 - 1); }
      else { ctx.moveTo(x - L/2 + 1, y - T/2 + 0.8); ctx.lineTo(x + L/2 - 1, y - T/2 + 0.8); }
      ctx.stroke();
      ctx.strokeStyle = 'rgba(64,46,26,0.55)';
      ctx.beginPath();
      if(vertical){ ctx.moveTo(x + T/2 - 0.8, y - L/2 + 1); ctx.lineTo(x + T/2 - 0.8, y + L/2 - 1); }
      else { ctx.moveTo(x - L/2 + 1, y + T/2 - 0.8); ctx.lineTo(x + L/2 - 1, y + T/2 - 0.8); }
      ctx.stroke();
      // 木板拼缝：沿长轴每段一条全厚缝线（hash 相位，确定性）
      const seg = Math.max(22, L * 0.16);
      const nSeg = Math.max(2, Math.round(L / seg));
      const segLen = L / nSeg;
      ctx.strokeStyle = 'rgba(74,54,30,0.6)'; ctx.lineWidth = Math.max(1, Math.min(2, T * 0.12));
      for(let i = 1; i < nSeg; i++){
        const off = -L/2 + i * segLen + (hash01('soft-seam', i) - 0.5) * segLen * 0.25;
        ctx.beginPath();
        if(vertical){ ctx.moveTo(x - T/2 + 0.5, y + off); ctx.lineTo(x + T/2 - 0.5, y + off); }
        else { ctx.moveTo(x + off, y - T/2 + 0.5); ctx.lineTo(x + off, y + T/2 - 0.5); }
        ctx.stroke();
      }
      // 木纹短划：受光侧亮、背光侧暗（hash 沿长轴分布）
      for(let i = 0; i < Math.max(4, Math.round(L / 34)); i++){
        const off = -L/2 + hash01('soft-grain', i) * L;
        const along = (hash01('soft-grain-d', i) - 0.5) * segLen * 0.7;
        const lit = hash01('soft-grain-l', i) > 0.5;
        ctx.strokeStyle = lit ? 'rgba(206,176,120,0.4)' : 'rgba(96,72,44,0.42)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        if(vertical){
          const gx = x - T/2 + 1.2 + hash01('soft-grain-x', i) * (T - 2.4);
          ctx.moveTo(gx, y + off); ctx.lineTo(gx, y + off + along);
        } else {
          const gy = y - T/2 + 1.2 + hash01('soft-grain-x', i) * (T - 2.4);
          ctx.moveTo(x + off, gy); ctx.lineTo(x + off + along, gy);
        }
        ctx.stroke();
      }
      // 外缘描边（整块薄板轮廓；用 path stroke 保证 mini-canvas/mock ctx 兼容）
      ctx.strokeStyle = 'rgba(66,48,28,0.9)'; ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.rect(x - hw, y - hh, w, h);
      ctx.stroke();
    }
  },
  // 沙袋路障（barricade）：一排堆叠椭圆 + 顶部凸袋（原 drawCover barricade 分支）
  barricade: {
    w: 64, h: 28, anchorX: 32.75, anchorY: 14.75,
    bake(ctx, cov){
      const x = cov.x, y = cov.y, w = cov.w, h = cov.h;
      // #TEX17（2026-10-19）俯视沙袋 = 堆顶面：两排错缝圆角袋顶 + 顶袋，
      //   左上受光、右下背光（与建筑/岩石同一光源）；接触影交给 drawCoverShadow。
      //   内容仍收在原 w×h 包络内。
      const W = w, H = h;
      const vertical = h > w;                       // 竖放路障时沿 y 轴排布
      const L = vertical ? h : w;                   // 排布长轴
      const T = vertical ? w : h;                   // 堆厚
      const rows = 2;                               // 俯视两排袋
      const rowT = T / rows;
      const bagLen = Math.max(14, Math.min(26, L * 0.30));
      const nPerRow = Math.max(2, Math.round(L / bagLen));
      const bLen = L / nPerRow;
      const lightAt = (u, v) => 0.5 + 0.5 * (-0.7071 * u - 0.7071 * v);   // u,v ∈ [-1,1] 相对堆中心
      // 逐排逐袋：错缝（第二排偏移半袋）
      for(let r = 0; r < rows; r++){
        const tOff = -T/2 + rowT * (r + 0.5);       // 该排在厚轴上的中心
        const shift = (r % 2) * bLen * 0.5;
        for(let i = 0; i < nPerRow; i++){
          const lOff = -L/2 + (i + 0.5) * bLen + shift;
          if(lOff - bLen/2 < -L/2 - 0.5 || lOff + bLen/2 > L/2 + 0.5) continue;  // 错缝出界袋跳过
          const u = vertical ? tOff / (T/2) : lOff / (L/2);
          const v = vertical ? lOff / (L/2) : tOff / (T/2);
          const lit = lightAt(u, v * 0.7);
          // 袋顶（圆角矩形，长短轴按排布方向）
          const bw = vertical ? rowT * 0.94 : bLen * 0.94;
          const bh = vertical ? bLen * 0.94 : rowT * 0.94;
          const cx = x + (vertical ? tOff : lOff);
          const cy = y + (vertical ? lOff : tOff);
          const t2 = 0.55 + 0.45 * lit;
          const Rc = Math.round(148 * t2 + 96 * (1 - t2)), Gc = Math.round(122 * t2 + 74 * (1 - t2)), Bc = Math.round(72 * t2 + 44 * (1 - t2));
          // 袋底暗缘（右下偏移一点）
          ctx.fillStyle = 'rgba(64,50,30,0.5)';
          roundedRectPath(ctx, cx - bw/2 + 1, cy - bh/2 + 1, bw, bh, Math.min(2.6, bh * 0.32));
          ctx.fill();
          // 袋顶基色
          ctx.fillStyle = 'rgba(' + Rc + ',' + Gc + ',' + Bc + ',0.94)';
          roundedRectPath(ctx, cx - bw/2, cy - bh/2, bw, bh, Math.min(2.6, bh * 0.32));
          ctx.fill();
          // 上缘受光弧 / 下缘背光弧（左上光源）
          ctx.strokeStyle = 'rgba(206,182,126,' + (0.28 + 0.30 * lit).toFixed(2) + ')';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(cx, cy, Math.max(1.5, Math.min(bw, bh) * 0.42), Math.PI * 0.95, Math.PI * 1.55);
          ctx.stroke();
          ctx.strokeStyle = 'rgba(58,44,26,0.45)';
          ctx.beginPath();
          ctx.arc(cx, cy, Math.max(1.5, Math.min(bw, bh) * 0.42), Math.PI * 0.05, Math.PI * 0.95, true);
          ctx.stroke();
          // 布纹短缝
          ctx.strokeStyle = 'rgba(96,76,48,0.4)';
          ctx.beginPath();
          if(vertical){ ctx.moveTo(cx - bw * 0.3, cy); ctx.lineTo(cx + bw * 0.3, cy); }
          else { ctx.moveTo(cx, cy - bh * 0.3); ctx.lineTo(cx, cy + bh * 0.3); }
          ctx.stroke();
        }
      }
      // 堆底（最下排下缘）压一条背光暗带，袋堆有厚度
      ctx.strokeStyle = 'rgba(56,42,24,0.5)'; ctx.lineWidth = 1.4;
      ctx.beginPath();
      if(vertical){ ctx.moveTo(x - T/2 + 1, y + L/2 - 1.4); ctx.lineTo(x + T/2 - 1, y + L/2 - 1.4); }
      else { ctx.moveTo(x - L/2 + 1, y + T/2 - 1.4); ctx.lineTo(x + L/2 - 1, y + T/2 - 1.4); }
      ctx.stroke();
      // 外缘描边（path stroke，mini-canvas/mock ctx 兼容）
      ctx.strokeStyle = 'rgba(66,50,28,0.85)'; ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.rect(x - w/2, y - h/2, w, h);
      ctx.stroke();
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
      // 切面细节（P3 程序化先行 2026-10-10：内外年轮 + 中心髓点 + 外圈木纹点 + 受光高光；
      // 全部收在外圈椭圆 w/2×h/2 内，不动内容包围盒/实测锚点）
      ctx.strokeStyle = 'rgba(60,40,22,0.5)';
      ctx.beginPath(); ctx.ellipse(x, y, w*0.15, h*0.15, 0, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(x, y, w*0.45, h*0.45, 0, 0, TAU); ctx.stroke();
      ctx.fillStyle = 'rgba(46,30,15,0.8)';
      ctx.beginPath(); ctx.arc(x, y, 1.5, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(150,110,70,0.4)';
      ctx.beginPath(); ctx.ellipse(x - w*0.12, y - h*0.16, w*0.16, h*0.11, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(66,44,24,0.55)';
      for(let i=0;i<8;i++){
        const a = hash01('stump-grain', i)*TAU;
        ctx.beginPath();
        ctx.arc(x + Math.cos(a)*w*0.38, y + Math.sin(a)*h*0.38, 1, 0, TAU);
        ctx.fill();
      }
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
        // 石块细节（P4 程序化先行 2026-10-10：受光高光 + 暗缝；落在石块半径内，
        // 不动内容包围盒/实测锚点 anchorX 20.04/anchorY 7.75）
        ctx.fillStyle = 'rgba(170,165,150,0.5)';
        ctx.beginPath(); ctx.arc(x+ox-0.8, y+oy-0.8, 1, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(40,38,34,0.6)';
        ctx.beginPath(); ctx.arc(x+ox+1, y+oy+1, 1, 0, TAU); ctx.fill();
      }
      // 石缝碎屑（同上：中央簇附近确定性小点，不动的旧包围盒内）
      ctx.fillStyle = 'rgba(88,84,76,0.6)';
      for(let i=0;i<3;i++){
        ctx.beginPath();
        ctx.arc(x + (hash01('rubble-chip', i*2)-0.5)*w*0.5,
                y + (hash01('rubble-chip', i*2+1)-0.5)*h*0.45, 1, 0, TAU);
        ctx.fill();
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
      // 全局光源方向（左上 → 右下），与树冠/坦克侧壁一致。
      const Lx = -0.7071, Ly = -0.7071;
      // #TEX15-2026-10-19：单条波浪叶团轮廓取代「5 正圆 + 9 椭圆」拼贴。
      // 包络仍 ≤ 0.44（旧版 5 圆最大包络），content bbox/锚点不变。
      const nb = 36;
      const rads = [];
      for(let i = 0; i < nb; i++){
        const t = (i / nb) * TAU;
        const h1 = hash01('bush-blob-a', i % 9), h2 = hash01('bush-blob-f', i);
        let r = 0.37 + 0.05 * Math.sin(t * 3 + h1 * TAU) + 0.05 * Math.sin(t * 9 + h2 * TAU);
        rads.push(Math.max(0.28, Math.min(0.44, r)));
      }
      const blob = (j) => rads[j % nb];
      // 基底：整团暗绿（旧版中心 0.34 描边圆删除——那条圆线是「椭圆感」的来源之一）
      ctx.fillStyle = 'rgba(30,52,24,0.55)';
      blobPath(ctx, x, y, w, h, 0, blob, nb);
      ctx.fill();
      // 内部叶团：5 枚不规则小团按光源明暗连续取色（不再椭圆）
      for(let i = 0; i < 5; i++){
        const a = (i / 5) * TAU + 0.6;
        const ox = Math.cos(a) * w * 0.22, oy = Math.sin(a) * h * 0.22;
        const lit = 0.5 + 0.5 * (Math.cos(a) * Lx + Math.sin(a) * Ly);
        const Rc = Math.round(58 + (108 - 58) * lit), Gc = Math.round(96 + (142 - 96) * lit), Bc = Math.round(42 + (72 - 42) * lit);
        ctx.fillStyle = 'rgba(' + Rc + ',' + Gc + ',' + Bc + ',' + (0.38 + 0.16 * lit).toFixed(2) + ')';
        blobPath(ctx, x + ox, y + oy, w * 0.20, h * 0.20, a, (j) => 0.82 + 0.18 * Math.sin(j * 2.6 + i * 1.9), 14);
        ctx.fill();
      }
      // 边缘叶团环（沿波浪轮廓内侧再叠 7 枚小团，强化参差感；明暗按方向）
      for(let i = 0; i < 7; i++){
        const a = (i / 7) * TAU + hash01('bush-lobe-a', i) * 0.3;
        const rr = rads[Math.floor((a / TAU) * nb) % nb];
        const lit = 0.5 + 0.5 * (Math.cos(a) * Lx + Math.sin(a) * Ly);
        const Rc = Math.round(70 + (110 - 70) * lit), Gc = Math.round(104 + (144 - 104) * lit), Bc = Math.round(50 + (72 - 50) * lit);
        ctx.fillStyle = 'rgba(' + Rc + ',' + Gc + ',' + Bc + ',' + (0.40 + 0.14 * lit).toFixed(2) + ')';
        blobPath(ctx, x + Math.cos(a) * w * rr * 0.82, y + Math.sin(a) * h * rr * 0.82, w * 0.11, h * 0.11, a, (j) => 0.8 + 0.2 * Math.sin(j * 3.1 + i * 2.2), 12);
        ctx.fill();
      }
      // 球面体积渐变（左上受光、右下背光），clip 在波浪轮廓内
      ctx.save();
      blobPath(ctx, x, y, w, h, 0, blob, nb);
      ctx.clip();
      const cg = ctx.createLinearGradient(x - w * 0.42, y - h * 0.42, x + w * 0.42, y + h * 0.42);
      cg.addColorStop(0, 'rgba(196,224,138,0.30)');
      cg.addColorStop(0.45, 'rgba(120,160,88,0.02)');
      cg.addColorStop(1, 'rgba(8,24,8,0.40)');
      ctx.fillStyle = cg;
      ctx.fillRect(x - w * 0.46, y - h * 0.46, w * 0.92, h * 0.92);
      ctx.restore();
      // 受光叶团（左上，两枚不规则团）
      ctx.fillStyle = 'rgba(164,196,108,0.55)';
      blobPath(ctx, x - w * 0.10, y - h * 0.16, w * 0.13, h * 0.12, -0.5, (j) => 0.85 + 0.15 * Math.sin(j * 2.9), 12);
      ctx.fill();
      ctx.fillStyle = 'rgba(198,224,132,0.40)';
      blobPath(ctx, x - w * 0.20, y - h * 0.24, w * 0.08, h * 0.07, -0.4, (j) => 0.8 + 0.2 * Math.sin(j * 3.5), 10);
      ctx.fill();
      // 右下背光团
      ctx.fillStyle = 'rgba(16,30,12,0.45)';
      blobPath(ctx, x + w * 0.14, y + h * 0.18, w * 0.16, h * 0.13, 0.4, (j) => 0.85 + 0.15 * Math.sin(j * 2.7), 12);
      ctx.fill();
      // 叶点散斑（受光侧亮、背光侧暗）
      for(let i = 0; i < 14; i++){
        const a = hash01('bush-sp', i) * TAU;
        const rad = Math.sqrt(hash01('bush-sr', i)) * 0.30;
        const lit = 0.5 + 0.5 * (Math.cos(a) * Lx + Math.sin(a) * Ly);
        ctx.fillStyle = lit > 0.55 ? 'rgba(156,188,104,0.65)' : 'rgba(38,64,28,0.55)';
        ctx.beginPath();
        ctx.arc(x + Math.cos(a) * w * rad, y + Math.sin(a) * h * rad, 0.8 + hash01('bush-ss', i) * 1.1, 0, TAU);
        ctx.fill();
      }
    }
  },
  // 树（tree）：树干（bake）+ 树冠叶片（bakeCanopy，画在坦克之上遮视线）
  tree: {
    w: 24, h: 18, anchorX: 15.15, anchorY: 15.15,
    canopyAnchorX: 39.26, canopyAnchorY: 39.26,
    bake(ctx, cov){
      const x = cov.x, y = cov.y, w = cov.w, h = cov.h;
      // 树干：圆柱受光 + 不规则轮廓（#TEX15 去正圆感）。
      const r = Math.max(w, h)*0.6;
      const s1 = hash01('tree-trunk-a', 0), s2 = hash01('tree-trunk-a', 1);
      const radFn = (j) => 0.86 + 0.10*Math.sin(j*2.7 + s1*TAU) + 0.05*Math.sin(j*6.1 + s2*TAU);
      // 底座接触影（贴地暗边）
      ctx.fillStyle = 'rgba(28,20,10,0.35)';
      ctx.beginPath(); ctx.ellipse(x + r*0.15, y + r*0.2, r*0.8, r*0.55, 0, 0, TAU); ctx.fill();
      // 圆柱渐变：左上受光 → 右下背光（填充不规则轮廓）
      const tg = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
      tg.addColorStop(0, 'rgba(96,72,40,0.95)');
      tg.addColorStop(0.45, 'rgba(62,46,26,0.94)');
      tg.addColorStop(1, 'rgba(34,24,12,0.95)');
      ctx.fillStyle = tg;
      blobPath(ctx, x, y, r, r, 0, radFn, 24);
      ctx.fill();
      // 外缘描边（不规则折线，包络仍在原 r 圆内）
      ctx.strokeStyle = 'rgba(36,26,14,1)'; ctx.lineWidth = 1.5;
      blobPath(ctx, x, y, r, r, 0, radFn, 24);
      ctx.stroke();
      // 左上受光月牙（树皮高光）
      ctx.strokeStyle = 'rgba(150,122,78,0.5)'; ctx.lineWidth = Math.max(1, r*0.16);
      ctx.beginPath(); ctx.arc(x, y, r*0.68, -2.4, -1.15); ctx.stroke();
      // 树皮纵向短纹：只铺受光半弧，背光侧保持暗
      ctx.lineWidth = Math.max(0.7, r*0.07);
      for(let i=0;i<7;i++){
        const a = -2.2 + (i/6)*1.8;
        const rr = r*(0.5 + hash01('tree-bark', i)*0.26);
        const barkLit = 0.5 + hash01('tree-bark', i+11)*0.5;
        ctx.strokeStyle = 'rgba(' + Math.round(70 + 60*barkLit) + ',' + Math.round(48 + 38*barkLit) + ',' + Math.round(30 + 22*barkLit) + ',0.55)';
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(a)*rr*0.55, y + Math.sin(a)*rr*0.55);
        ctx.lineTo(x + Math.cos(a)*rr, y + Math.sin(a)*rr);
        ctx.stroke();
      }
    },
    bakeCanopy(ctx, cov){
      const x = cov.x, y = cov.y, w = cov.w, h = cov.h;
      // #A10：冠径乘数由 1.9 降至 1.4，使树冠视觉半径更贴近逻辑 OBB（24×18），
      // 缓解"所见远大于所挡"的视觉-逻辑脱节；如需进一步收紧可继续下调或提为 RULES 参数。
      const R = Math.max(w, h)*1.4;
      // 全局光源（左上）；叶团明暗按相对光源方向取色，与冠层体积渐变同一光源
      const Lx = -0.7071, Ly = -0.7071;
      // #TEX15-2026-10-19：单条波浪树冠轮廓取代「底层圆 + 11 枚椭圆叶团环」。
      // 轮廓外沿 ≤ R*0.85（旧版最大包络），content bbox/锚点不变。
      const nb = 40;
      const rads = [];
      for(let i=0;i<nb;i++){
        const t = (i/nb)*TAU;
        const h1 = hash01('tree-blob-a', i%13), h2 = hash01('tree-blob-f', i);
        let r = 0.80 + 0.06*Math.sin(t*3 + h1*TAU) + 0.05*Math.sin(t*7 + h2*TAU);
        rads.push(Math.max(0.70, Math.min(0.85, r)));
      }
      const blob = (j) => rads[j%nb];
      // ① 底层暗腔（压住树干上缘）
      ctx.fillStyle = 'rgba(30,48,24,0.55)';
      blobPath(ctx, x, y, R, R, 0, blob, nb);
      ctx.fill();
      // ② 冠层体积渐变（clip 在波浪轮廓内）：左上受光、右下背光 + 右下自阴影
      ctx.save();
      blobPath(ctx, x, y, R, R, 0, blob, nb);
      ctx.clip();
      const cg = ctx.createLinearGradient(x - R*0.8, y - R*0.8, x + R*0.8, y + R*0.8);
      cg.addColorStop(0, 'rgba(198,228,146,0.28)');
      cg.addColorStop(0.45, 'rgba(120,160,90,0.02)');
      cg.addColorStop(1, 'rgba(6,20,6,0.40)');
      ctx.fillStyle = cg;
      ctx.fillRect(x - R, y - R, R*2, R*2);
      const dg = ctx.createRadialGradient(x + R*0.25, y + R*0.25, R*0.10, x + R*0.25, y + R*0.25, R*0.95);
      dg.addColorStop(0, 'rgba(10,24,8,0)');
      dg.addColorStop(1, 'rgba(10,24,8,0.34)');
      ctx.fillStyle = dg;
      ctx.fillRect(x - R, y - R, R*2, R*2);
      // ③ 内侧叶团明暗（沿波浪轮廓，按方向连续取色，不再 i%3 循环）
      for(let i=0;i<7;i++){
        const a = (i/7)*TAU + hash01('tree-lobe-a', i)*0.3;
        const rr = rads[Math.floor((a/TAU)*nb)%nb];
        const lit = 0.5 + 0.5*(Math.cos(a)*Lx + Math.sin(a)*Ly);
        const Rc = Math.round(66 + (96-66)*lit), Gc = Math.round(100 + (132-100)*lit), Bc = Math.round(48 + (70-48)*lit);
        ctx.fillStyle = 'rgba(' + Rc + ',' + Gc + ',' + Bc + ',' + (0.44 + 0.14*lit).toFixed(2) + ')';
        blobPath(ctx, x + Math.cos(a)*R*rr*0.74, y + Math.sin(a)*R*rr*0.74, R*0.17, R*0.17, a, (j)=>0.8 + 0.2*Math.sin(j*3.1 + i*2.2), 12);
        ctx.fill();
      }
      ctx.restore();
      // ④ 受光侧叶团（左上）
      ctx.fillStyle = 'rgba(128,168,86,0.50)';
      blobPath(ctx, x - R*0.30, y - R*0.26, R*0.34, R*0.30, -0.3, (j)=>0.85 + 0.15*Math.sin(j*2.9), 14);
      ctx.fill();
      ctx.fillStyle = 'rgba(172,206,116,0.32)';
      blobPath(ctx, x - R*0.46, y - R*0.36, R*0.13, R*0.11, -0.4, (j)=>0.8 + 0.2*Math.sin(j*3.5), 10);
      ctx.fill();
      // ⑤ 枝叶纹：短弧线表达叶片朝向（明暗按方向）
      ctx.lineWidth = Math.max(0.8, R*0.02);
      for(let i=0;i<24;i++){
        const a = hash01('tree-branch-a', i)*TAU;
        const arcLen = R*(0.07 + hash01('tree-branch-s', i)*0.06);
        const rad = (0.16 + hash01('tree-branch-r', i)*0.52)*R;
        const bx = x+Math.cos(a)*rad, by = y+Math.sin(a)*rad;
        const lit = 0.5 + 0.5*(Math.cos(a)*Lx + Math.sin(a)*Ly);
        ctx.strokeStyle = 'rgba(' + Math.round(26 + 70*lit) + ',' + Math.round(44 + 78*lit) + ',' + Math.round(22 + 40*lit) + ',' + (0.28 + 0.22*lit).toFixed(2) + ')';
        ctx.beginPath();
        ctx.arc(bx, by, arcLen, a + Math.PI*0.55, a + Math.PI*1.45);
        ctx.stroke();
      }
      // ⑥ 包络描边（波浪轮廓，取代整圆描边）
      ctx.strokeStyle = 'rgba(48,80,38,0.5)'; ctx.lineWidth = 1;
      blobPath(ctx, x, y, R, R, 0, blob, nb);
      ctx.stroke();
      // ⑦ 树冠细节：受光高光 + 深色内腔 + 叶点散斑
      for(let i=0;i<3;i++){
        const a = hash01('tree-hi', i)*TAU;
        ctx.fillStyle = 'rgba(120,160,80,0.45)';
        ctx.beginPath();
        ctx.arc(x+Math.cos(a)*R*0.3, y+Math.sin(a)*R*0.3 - R*0.12, R*0.14, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(30,50,24,0.5)';
      blobPath(ctx, x+R*0.1, y+R*0.18, R*0.30, R*0.26, 0.3, (j)=>0.85 + 0.15*Math.sin(j*2.7), 12);
      ctx.fill();
      for(let i=0;i<16;i++){
        const a = hash01('tree-sp', i)*TAU;
        const rad = Math.sqrt(hash01('tree-sr', i))*0.75;
        ctx.fillStyle = (i%3===0) ? 'rgba(126,166,84,0.6)' : 'rgba(36,60,28,0.5)';
        ctx.beginPath();
        ctx.arc(x+Math.cos(a)*R*rad, y+Math.sin(a)*R*rad, Math.max(1, R*0.035 + hash01('tree-ss', i)*R*0.03), 0, TAU);
        ctx.fill();
      }
      // ⑧ 右下暗冠缘（球体底部自阴影）
      ctx.strokeStyle = 'rgba(18,38,14,0.42)';
      ctx.lineWidth = Math.max(1.2, R*0.035);
      ctx.beginPath(); ctx.arc(x, y, R*0.72, 0.08, Math.PI*0.46); ctx.stroke();
    }
  },
  // 倒树（fallen，残骸）：横躺树干 + 枝杈 + 根部断面（bake）+ 树冠叶片（bakeCanopy）
  fallen: {
    w: 58, h: 9, anchorX: 33.55, anchorY: 7.95,
    canopyAnchorX: 1.0, canopyAnchorY: 15.9,
    bake(ctx, cov){
      const x = cov.x, y = cov.y, w = cov.w, h = cov.h;
      // 倒树：不规则原木（#TEX15 去「两段椭圆」的哑铃感）——单条波浪轮廓 + 锥度。
      // 原包围盒 = [x-L, x+L]×[y-r0, y+r0]（L=w/2，r0=h/2）不变。
      const L = w/2, r0 = Math.max(3, h*0.5), r1 = Math.max(2, h*0.3);
      const top = (u) => y - (r0 + (r1-r0)*u*0.5) * 1.0;
      const bot = (u) => y + (r0 + (r1-r0)*u*0.5) * (0.88 + 0.12*Math.sin(u*3.1 + 1.7));
      // 先垫接触影（右下方微偏移；mini-canvas 无 quadraticCurveTo，用椭圆）
      ctx.fillStyle = 'rgba(40,30,16,0.55)';
      ctx.beginPath(); ctx.ellipse(x + 1.5, y + r0*0.35, L*0.92, r0*0.55, 0, 0, TAU); ctx.fill();
      // 原木主体：单条波浪轮廓（上缘受光、下缘背光）
      const lg = ctx.createLinearGradient(0, y - r0, 0, y + r0);
      lg.addColorStop(0, 'rgba(94,68,40,0.95)');
      lg.addColorStop(0.5, 'rgba(60,44,24,0.94)');
      lg.addColorStop(1, 'rgba(30,20,10,0.95)');
      ctx.fillStyle = lg;
      ctx.beginPath();
      ctx.moveTo(x - L, top(0));
      for(let i=1;i<=24;i++){
        const u = i/24;
        const px = x - L + u*L*2;
        ctx.lineTo(px, top(u) + (i%2 ? 0.8 : -0.8) * hash01('fallen-top', i)*0.8);
      }
      for(let i=24;i>=0;i--){
        const u = i/24;
        const px = x - L + u*L*2;
        ctx.lineTo(px, bot(u) + (i%2 ? 0.8 : -0.8) * hash01('fallen-bot', i)*0.8);
      }
      ctx.closePath(); ctx.fill();
      // 外缘描边（原木轮廓）
      ctx.strokeStyle = 'rgba(36,26,14,1)'; ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x - L, top(0));
      for(let i=1;i<=24;i++){
        const u = i/24;
        ctx.lineTo(x - L + u*L*2, top(u) + (i%2 ? 0.8 : -0.8) * hash01('fallen-top', i)*0.8);
      }
      for(let i=24;i>=0;i--){
        const u = i/24;
        ctx.lineTo(x - L + u*L*2, bot(u) + (i%2 ? 0.8 : -0.8) * hash01('fallen-bot', i)*0.8);
      }
      ctx.closePath(); ctx.stroke();
      // 上缘受光细线（沿树干上轮廓）
      ctx.strokeStyle = 'rgba(142,110,68,0.55)'; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x - L, top(0));
      for(let i=1;i<=24;i++){
        const u = i/24;
        ctx.lineTo(x - L + u*L*2, top(u) - 0.8);
      }
      ctx.stroke();
      // 树皮横纹：短竖向刻痕（不画整弧——整弧在原木上读成「一串圆环」），只画上缘受光带
      ctx.lineWidth = Math.max(0.7, h*0.08);
      for(let i=0;i<9;i++){
        const tx = x - L*0.86 + (i/8)*L*1.62;
        const tr = r0 - (r0-r1)*((i/8)*0.9);
        const barkLit = 0.35 + hash01('fallen-bark', i)*0.35;
        ctx.strokeStyle = 'rgba(' + Math.round(46 + 56*barkLit) + ',' + Math.round(34 + 36*barkLit) + ',' + Math.round(20 + 20*barkLit) + ',0.55)';
        ctx.beginPath();
        ctx.moveTo(tx, y - tr*0.55);
        ctx.lineTo(tx + (hash01('fallen-bark-d', i) - 0.5)*2, y - tr*0.10);
        ctx.stroke();
      }
      // 枝杈：沿干身交替向上/向下翘起（单段折线，不是并排倒刺）
      for(let i=-2;i<=2;i++){
        const bx = x + i*L*0.38;
        const dir = (i%2===0) ? 1 : -1;
        const up = (dir > 0);
        ctx.strokeStyle = up ? 'rgba(100,74,44,0.95)' : 'rgba(44,32,16,0.95)';
        ctx.lineWidth = up ? 2 : 1.8;
        ctx.beginPath();
        ctx.moveTo(bx, y + (up ? -r0*0.2 : r0*0.2));
        ctx.lineTo(bx + dir*h*0.6, y - dir*h*0.8);
        ctx.stroke();
      }
      // 根部伐倒断面（树干左端）。
      // #12（2026-10-19 用户反馈「倒下树干的切面直接正视给了玩家，需要改为斜向的角度」）：
      //   旧实现用 `blobPath(cutX, y, r0*0.9, r0*0.9, 0, …)` 画**正圆**——在俯视 2.5D 视角下，
      //   这读作「正对镜头的圆盘」，与「树干横躺、断面朝侧上方」的直觉矛盾。
      //   现改为**斜向扁椭圆**：长轴沿树干横向（y）、短轴压扁到 0.62（透视缩短），
      //   并整体沿 +x 方向偏移一点（断面在树干端部略内收），再叠阴影/年轮/髓点。
      const cutX = x - L;
      const cutRx = Math.max(1.2, r0 * 0.55);   // 横向（沿干宽）半轴
      const cutRy = Math.max(1.6, r0 * 0.92);   // 纵向（干截面高）半轴 → 扁椭圆
      const cutRot = 0.22;                      // 轻微倾角，读作「斜切」而非正圆
      // 断面投影（右下，与整车光源同向）
      ctx.fillStyle = 'rgba(46,32,16,0.55)';
      ctx.beginPath();
      ctx.ellipse(cutX + r0 * 0.30, y + r0 * 0.26, cutRx * 0.92, cutRy * 0.92, cutRot, 0, TAU);
      ctx.fill();
      // 断面木质（渐变沿短轴方向，模拟斜切受光）
      const cutG = ctx.createLinearGradient(cutX - cutRx, y - cutRy, cutX + cutRx, y + cutRy);
      cutG.addColorStop(0, 'rgba(172,138,92,0.95)');
      cutG.addColorStop(0.5, 'rgba(126,96,60,0.95)');
      cutG.addColorStop(1, 'rgba(70,48,26,0.95)');
      ctx.fillStyle = cutG;
      ctx.beginPath(); ctx.ellipse(cutX, y, cutRx, cutRy, cutRot, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(60,40,22,0.8)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(cutX, y, cutRx, cutRy, cutRot, 0, TAU); ctx.stroke();
      // 年轮（同心扁椭圆，按 cutRot 倾斜）
      ctx.strokeStyle = 'rgba(96,70,42,0.55)'; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.ellipse(cutX, y, cutRx * 0.62, cutRy * 0.62, cutRot, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(cutX, y, cutRx * 0.30, cutRy * 0.30, cutRot, 0, TAU); ctx.stroke();
    },
    bakeCanopy(ctx, cov){
      const x = cov.x, y = cov.y, w = cov.w, h = cov.h;
      // 倒树树冠：单条波浪叶团轮廓（#TEX15），**收窄并贴回树干端部**——
      // 旧版 cx = x + w*0.32 悬在树梢外、rh = h*1.5 膨成大方块（实测 242px 原木配 130px
      // 方块冠）。现 cx = x + w*0.24（覆盖树干右端 1/3），rw = 干径向 2.2×r0、
      // rh ≈ r0*2.6，读作「树冠随干倒下」。
      const cx = x + w*0.24, cy = y;
      const rw = Math.max(8, h*1.1), rh = Math.max(6, h*1.3);
      const Lx = -0.7071, Ly = -0.7071;
      const nb = 30;
      const rads = [];
      for(let i=0;i<nb;i++){
        const t = (i/nb)*TAU;
        const h1 = hash01('fallen-blob-a', i%10), h2 = hash01('fallen-blob-f', i);
        let r = 0.88 + 0.08*Math.sin(t*3 + h1*TAU) + 0.06*Math.sin(t*8 + h2*TAU);
        rads.push(Math.max(0.80, Math.min(0.97, r)));
      }
      const blob = (j) => rads[j%nb];
      // 基底叶团
      ctx.fillStyle = 'rgba(30,52,24,0.55)';
      blobPath(ctx, cx, cy, rw, rh, 0, blob, nb);
      ctx.fill();
      // 内侧明暗叶团（按方向取色）
      for(let i=0;i<5;i++){
        const a = (i/5)*TAU + 0.5;
        const ox = Math.cos(a)*rw*0.5, oy = Math.sin(a)*rh*0.5;
        const lit = 0.5 + 0.5*(Math.cos(a)*Lx + Math.sin(a)*Ly);
        const Rc = Math.round(58 + (108-58)*lit), Gc = Math.round(96 + (142-96)*lit), Bc = Math.round(42 + (72-42)*lit);
        ctx.fillStyle = 'rgba(' + Rc + ',' + Gc + ',' + Bc + ',' + (0.42 + 0.14*lit).toFixed(2) + ')';
        blobPath(ctx, cx+ox, cy+oy, rw*0.42, rh*0.42, a, (j)=>0.82 + 0.18*Math.sin(j*2.6 + i*1.9), 12);
        ctx.fill();
      }
      // 体积渐变（clip 波浪轮廓）
      ctx.save();
      blobPath(ctx, cx, cy, rw, rh, 0, blob, nb);
      ctx.clip();
      const cg = ctx.createLinearGradient(cx - rw, cy - rh, cx + rw, cy + rh);
      cg.addColorStop(0, 'rgba(196,224,138,0.30)');
      cg.addColorStop(0.45, 'rgba(120,160,88,0.02)');
      cg.addColorStop(1, 'rgba(8,24,8,0.40)');
      ctx.fillStyle = cg;
      ctx.fillRect(cx - rw, cy - rh, rw*2, rh*2);
      ctx.restore();
      // 受光叶团（左上）
      ctx.fillStyle = 'rgba(164,196,108,0.55)';
      blobPath(ctx, cx - rw*0.30, cy - rh*0.45, rw*0.18, rh*0.20, -0.5, (j)=>0.85 + 0.15*Math.sin(j*2.9), 12);
      ctx.fill();
      // 右下暗缘
      ctx.strokeStyle = 'rgba(16,32,12,0.42)';
      ctx.lineWidth = Math.max(1, Math.min(rw, rh)*0.10);
      ctx.beginPath(); ctx.arc(cx, cy, Math.min(rw, rh)*0.85, 0.10, Math.PI*0.46); ctx.stroke();
      // 叶点散斑（受光/背光两档）
      for(let i=0;i<10;i++){
        const a = hash01('fallen-sp', i)*TAU;
        const rad = Math.sqrt(hash01('fallen-sr', i))*0.8;
        const lit = 0.5 + 0.5*(Math.cos(a)*Lx + Math.sin(a)*Ly);
        ctx.fillStyle = lit > 0.55 ? 'rgba(156,188,104,0.62)' : 'rgba(38,64,28,0.55)';
        ctx.beginPath();
        ctx.arc(cx+Math.cos(a)*rw*rad, cy+Math.sin(a)*rh*rad, 0.8 + hash01('fallen-ss', i), 0, TAU);
        ctx.fill();
      }
    }
  }
};

// ---------- 浏览器分支（Image 加载器 + 离屏烘焙缓存） ----------
// 仅函数体内访问 document/canvas/Image；typeof document 守卫保证 Node 加载与调用安全。

const ASSET_IMAGES = new Map();  // key（含 '<key>_canopy'）-> HTMLImageElement | null（null=未加载/不可用）
const ASSET_CACHE  = new Map();  // `${key}:${layer}:${qw}x${qh}` -> { canvas, ax, ay }

// #U1（2026-10-17）：**资产目录探针**——`assets/` 里没有地图元素 PNG 是**预期状态**
//   （见 assets/README.md「当前为空 = 全部走程序化 bake 占位」），但每个 key 各发一次
//   `<img>` 请求会让控制台刷满 7~14 条 404（用户反馈「boss 战控制台报错…无法进入游戏」，
//   实为噪声而非阻塞）。此处先用**单次**探测确认目录是否有资产：命中则正常逐 key 加载，
//   未命中则标记「本会话无资产」并静默跳过，控制台只剩 1 条 404（或 0 条——探测用 fetch
//   且吞掉错误）。程序化 bake 回退路径完全不变，视觉零差异。
let _assetDirHasFiles = null;     // null=未知（探测中/未探测）；true/false=结论
let _assetProbeStarted = false;

function _probeAssetDir(){
  if(_assetProbeStarted) return;
  _assetProbeStarted = true;
  if(typeof fetch !== 'function') { _assetDirHasFiles = true; return; }   // 无 fetch 环境：按有资产处理
  // 探测首个注册键（若目录为空，这一次请求即可判定；比逐 key 探测省 13 次 404）
  const probeKey = Object.keys(ASSET_DEFS)[0];
  if(!probeKey){ _assetDirHasFiles = false; return; }
  try {
    fetch('assets/' + probeKey + '.png', { method: 'HEAD' })
      .then(res => {
        _assetDirHasFiles = !!res && res.ok;
        if(_assetDirHasFiles) preloadAssets();   // 有资产才真正逐键加载
      })
      .catch(() => { _assetDirHasFiles = false; });
  } catch(e){ _assetDirHasFiles = false; }
}

// 返回已加载图片（无图/未加载/Node 环境返回 null；未加载会发起异步加载）
// #U1：探针未完成（_assetDirHasFiles === null）期间**一律返回 null**（走程序化 bake、不发请求），
//   避免「探针还在飞、drawAsset 已发起 <img>」的竞态导致 404 依旧刷屏。探针完成后若目录确有
//   资产，再逐键加载——首批几帧仍用 bake 占位（与旧行为「图片异步就绪前用 bake」一致）。
function assetImage(key){
  if(_assetDirHasFiles === null){
    _probeAssetDir();
    return null;
  }
  if(_assetDirHasFiles === false) return null;   // 目录为空 → 永久走 bake
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
//
// #TEX9-2026-10-18：淘汰策略 FIFO → 真 LRU。
//   旧实现超限时删 `ASSET_CACHE.keys().next().value`（最早**插入**的），且命中时不刷新顺序，
//   于是常用键（当前视口反复用到的 tree/bush）照样被踢；实测横向平移 1.9 次重烘焙/帧、
//   缓存长期钉在 128/128。Map 的迭代顺序即插入顺序，命中时 delete+set 即可移到队尾。
function getBakedSprite(key, w, h, layer){
  const def = ASSET_DEFS[key];
  if(!def || typeof document === 'undefined') return null;
  if(layer === 'canopy' && !def.bakeCanopy) return null;
  const qw = Math.round(w*2)/2, qh = Math.round(h*2)/2;
  const cacheKey = key + ':' + (layer || 'base') + ':' + qw + 'x' + qh;
  if(ASSET_CACHE.has(cacheKey)){
    const hit = ASSET_CACHE.get(cacheKey);
    // 命中即移到队尾（真 LRU 语义）
    ASSET_CACHE.delete(cacheKey);
    ASSET_CACHE.set(cacheKey, hit);
    return hit;
  }
  while(ASSET_CACHE.size >= MAX_ASSET_CACHE_SIZE){
    const firstKey = ASSET_CACHE.keys().next().value;
    if(firstKey === undefined) break;
    ASSET_CACHE.delete(firstKey);
  }
  const spr = bakeAssetCanvas(key, qw, qh, layer);
  if(spr) ASSET_CACHE.set(cacheKey, spr);
  return spr;
}

// 离屏烘焙：先在探针画布上画一遍，用 getImageData 量出实际内容包围盒，再按包围盒
// 精确尺寸二次烘焙（bake 为确定性纯函数，两次绘制一致）。锚点保证落在画布内（≥1px）。
//
// #TEX9-2026-10-18：探针画布自适应缩小（原固定 PAD = 2×max(w,h)+16）。
//   旧 PAD 对 tree_canopy(24×18) 是 64 → 探针 152×146 ≈ 22k px，实测单个视口
//   60~72 个尺寸键 × 2 层，整节点全量烘焙时探针像素量达 44~80 M px（168~305 MB RGBA），
//   是横向平移卡顿的主因之一（配合上面的 LRU 修复）。
//   现改为**从小 PAD 起步 + 触边重试**：内容若碰到探针边缘说明可能被裁，加倍 PAD 重画。
//   正确性由「触边即重试」保证（不会静默裁切），常见情形探针面积降 2~3×。
function bakeAssetCanvas(key, w, h, layer){
  const def = ASSET_DEFS[key];
  if(!def || typeof document === 'undefined') return null;
  if(layer === 'canopy' && !def.bakeCanopy) return null;
  const bakeFn = (layer === 'canopy') ? def.bakeCanopy : def.bake;
  const W = Math.max(1, w), H = Math.max(1, h);
  const maxDim = Math.max(W, H);
  // 探针：从 1.2×maxDim 起步，触边则加倍；上限 4×maxDim+64（远超任何现有 bake 的越界量）
  let PAD = Math.ceil(maxDim * 1.2 + 8);
  const PAD_CAP = Math.ceil(maxDim * 4 + 64);
  let minX = 0, minY = 0, maxX = -1, maxY = -1, px = 0, py = 0, pw = 0, ph = 0;
  for(;;){
    pw = Math.ceil(W) + PAD*2; ph = Math.ceil(H) + PAD*2;
    const probe = document.createElement('canvas');
    probe.width = pw; probe.height = ph;
    const pctx = probe.getContext('2d');
    px = PAD + W/2; py = PAD + H/2;
    bakeFn(pctx, { x: px, y: py, w: W, h: H });
    const data = pctx.getImageData(0, 0, pw, ph).data;
    minX = pw; minY = ph; maxX = -1; maxY = -1;
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
    // 内容贴着探针边缘 → 可能被裁，加倍重试（到上限为止）
    const touches = maxX >= 0 && (minX <= 0 || minY <= 0 || maxX >= pw - 1 || maxY >= ph - 1);
    if(!touches || PAD >= PAD_CAP) break;
    PAD = Math.min(PAD_CAP, PAD * 2);
  }
  if(maxX < 0){ // 空内容兜底：按名义尺寸矩形
    minX = PAD; minY = PAD; maxX = PAD + Math.ceil(W); maxY = PAD + Math.ceil(H);
  }
  // 锚点 = 探针中掩体中心 (px,py) 相对内容包围盒的位置。
  // #V1（2026-10-19 修复）：**不再补边**。此前 `shiftX = max(0, 1-ax0)` 会在锚点落到内容
  //   左侧/上侧之外时强行补边、把画布左边缘推到内容之外——效果是**破坏内容在画布内居中**。
  //   实测全仓只有 `fallen/canopy` 触发（ax0=-5 → shiftX=6），补边后内容只占列 6~24、
  //   画布 25 宽，内容中心 15.00 而画布中心 12.50；`prepare_covers.fit_contain` 又把内容
  //   居中放置，最终产物质心与烘焙基准差 3.06px，`test-cover-gen` 的 ±2px 验收恒红。
  //   负锚点本身是合法的：运行时 `ctx.drawImage(spr.canvas, x-spr.ax, y-spr.ay)` 只是偏移，
  //   画布外的部分由 Canvas 自动裁剪；`covers-anchor-check.py` 也明确「基准是烘焙内容质心，
  //   不是 anchor」。去掉补边后该层画布 19×22、内容中心 8.85 vs 画布中心 9.50（差 0.65）。
  const ax0 = px - minX, ay0 = py - minY;
  const cw = Math.ceil(maxX - minX + 1), ch = Math.ceil(maxY - minY + 1);
  const canvas = document.createElement('canvas');
  canvas.width = cw; canvas.height = ch;
  const ctx = canvas.getContext('2d');
  const ax = ax0, ay = ay0;
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
    hash01,
    blobPath,
    roundedRectPath,
    sandbag,
    assetImage,
    loadAssetImage,
    preloadAssets,
    getBakedSprite,
    bakeAssetCanvas,
    drawAsset,
    drawAssetCanopy
  };
}
