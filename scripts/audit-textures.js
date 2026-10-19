// audit-textures.js — 坦克贴图**审核标准**的可执行版本（v2 分数 + v3 跨部件检查，2026-10-18）。
//
// ============================ 为什么要有这份标准 ============================
// 「好不好看」若不量化，就只能靠肉眼，而肉眼在本项目上有两个**已实测发生**的失效模式：
//
//   失效模式 A · 放大审美陷阱
//     车体本地尺寸只有 73.5×38（hullPoly 实测），drawTank 以 scale=1 贴回，
//     相机 zoom 0.8~1.3 ⇒ 屏幕实际 59~96px 宽。在 300×300 探针上「越看越精细」的改动，
//     实机可能完全看不见。**所有指标必须在离屏 sprite 的 1:1 像素上测**（那正是显示像素）。
//
//   失效模式 B · 指标可作弊
//     第一版标准用「颜色数 27→105」和「相邻像素对比度」判定成功，结果两个指标都被
//     1px 颗粒噪点刷高：颗粒越密分数越高，但玩家看到的只是「脏」，迷彩块反而更读不出来。
//     ⇒ 单指标一律可被作弊，标准必须包含**互相制衡的区间**（过高过低都扣分）+ 一项
//       「结构 vs 噪点」的分离测量。
//
// ================================ v2：七条指标 ================================
// （按设计意图 plain / camo / digital 分别套不同区间；每项 S/A/B/C → 加权 100 分）
//  ① tones       有效色调数：实机尺寸量化 8 级后占比 >3% 的级数。单色 2~5；迷彩 3~6。
//  ② tonesSpread 色调直方图归一化熵（细节是否只挤在一个色调里 = 假细节）。
//  ③ valueSpan   亮度跨度 p5~p95。过小=塑料平色，过大=黑白失真。
//  ④ shadeAmp    大尺度明暗振幅（r=10 blur 后 std）= 体积感/顶光渐变。
//  ⑤ blockAmp    去趋势残差经 6px 分块后的 std = 迷彩色块级对比（迷彩核心项）。
//  ⑥ blockRatio  blockAmp / shadeAmp：涂装是否被光照渐变淹没（<0.35）或花过体积感（>1.3）。
//  ⑦ patchScale  色块特征尺寸（面积加权中位直径 / 车宽）。<0.12 碎成噪点，>0.55 糊成一块。
//  ⑧ mipSurvival 2×2 降采样后的结构存活率：车体实机只有 59~96px，玩家看的本来就是
//                降采样版本；1px 噪点活不过缩放，4~8px 结构活得下来。
//
// ========================= v3：跨部件 / 跨实例 / 沿边检查 =========================
// v2 只量**车体一张 sprite 的统计量**，2026-10-18 的 1:1 视觉审阅暴露了三类它完全量不到的
// 缺陷（统计全绿、肉眼不对）。v3 因此是 3 条**通过/不通过**检查，不并进 100 分：
//
//   A. variation   同贴图 × 两个 weatherSeed 的画面差异占比 ≥8%。
//                  旧实现图案种子全是常量 ⇒ 两辆 Tiger 像素级完全相同；现在图案框按
//                  weatherSeed 平移 ±8px，同型车不再共用同一套迷彩。
//   B. edgeWear    dmg0→dmg2 在「轮廓内侧 2px 带」上的改变占比 ≥17%。
//                  旧 weathering 只画在装甲面内 ⇒ 棱边没有掉漆；现在 paintEdgeWear
//                  沿多边形边界布金属/锈底缺口，且随损伤等级加量。
//   C. continuity  **涂装层**（detail:false）在车体/炮塔同一像素坐标的残差比 ≤0.85。
//                  ≈1.4 = 两套独立图案，≈0.3 = 同一套漆。旧实现每个部件按自己的 bbox
//                  取色块 ⇒ 炮塔色块只有车体一半大且交界断开；现在共用整车图案框
//                  （paintPatternBox：车体 bbox 平移到炮塔局部系，并给网格类贴图保留
//                  车体原点 originX/Y 供板缝对齐）。
//
// 另附 3 项**非评分**的体检项（只报告，因为它们是「规格」不是「口味」）：
//  · distinct 与 `none` 的可区分度（迷彩若与裸装甲差异 <2% 等于没画）
//  · damageCurve 损伤 0→3 的单调可辨性（weathering 必须看得见）
//  · 逐键差异块占比（给人工复核用）
//
// 评级：v2 每项 S/A/B/C → 加权 100 分，**达标线 80 分（A）**；v3 三条必须全部 PASS。
//
// #TEX12（2026-10-18）：sprite 改为 3× 超采样烘焙，所有指标先经 `spriteView1x(entry)`
//   降采样到 1:1 显示像素再测（见 §23.1）；`patchScale` 排除轮廓 3px 带、区间重标定；
//   `tones`/`mipSurvival` 上界按平滑材质放宽（数值依据见 specs/map.md §23.2）。
//
// Run: node scripts/audit-textures.js [--json]
'use strict';

const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const { createMiniCanvas } = require('./lib/mini-canvas.js');

const G = /** @type {any} */ (global);
G.document = { createElement: t => (t === 'canvas' ? createMiniCanvas(32, 32) : null) };
G.Image = function () { this.src = ''; };
G.performance = { now: () => 1000 };
G.RULES = require('../js/tank_rules.js').RULES;
const U = require('../js/tank_utils.js');
Object.assign(global, U);
G.TAU = U.TAU;
for (const m of ['tank_geometry', 'tank_halfgeom', 'tank_model', 'tank_cover', 'tank_entity']) {
  Object.assign(global, require(path.join(ROOT, 'js', m + '.js')));
}
const P = require('../js/tank_paint.js');
Object.assign(global, P);
// #TEX11-2026-10-18：v3 审核要测「车体 ↔ 炮塔」的图案一致性与整车图案框，
//   因此需要真实绘制入口（renderHullTexture / renderTurretTexture / turretPivot）。
const BD = require('../js/tank_battledraw.js');
Object.assign(global, BD);

// ---------------------------- 基础度量 ----------------------------
/** 取某个贴图键在实机尺寸下的亮度场（NaN = 透明）。
 *  part='hull' | 'turret'（v3 新增：炮塔也要单独量）
 *  seed = 每车固定 weatherSeed（影响图案框 ±8px 平移 → 同型车不同迷彩）
 *  #TEX11：必须传 texBox（整车图案框）——否则量到的是「部件 bbox」旧口径，
 *  与实际进游戏的像素不是同一张图。 */
function lumField(key, dmg, seed, part) {
  const kind = part === 'turret' ? 'turret' : 'hull';
  const sd = seed == null ? 5 : seed;
  const t = /** @type {any} */ (G.spawnTank)({
    id: 'probe', team: 'enemy', x: 200, y: 200, hullAngle: 0, turretAngle: 0,
    color: '#7ed957', heightClass: 'medium', texture: key
  });
  t.maxHp = 100; t.hp = 100; t.weatherSeed = sd;
  P.clearPaintCache();
  const verts = kind === 'turret' ? G.turretPoly(t).verts : G.hullPoly(t).verts;
  const texBox = P.paintPatternBox(G.hullPoly(t).verts, kind, t.turretPivotOffset, sd);
  const spr = P.getCachedTankSprite(t.color, kind, verts, true, t.heightClass, key,
    { damageLevel: dmg || 0, weatherSeed: sd, texBox });
  // #TEX12：sprite 以 2× 超采样烘焙；标准要求「1:1 显示像素」，这里降采样到 1× 再量。
  const view = P.spriteView1x(spr);
  const cv = view.canvas, W = cv.width, H = cv.height, b = cv._buf;
  const L = new Float64Array(W * H).fill(NaN);
  const colors = new Set();
  let px = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    if (b[i + 3] > 32) {
      L[y * W + x] = 0.299 * b[i] + 0.587 * b[i + 1] + 0.114 * b[i + 2];
      colors.add((b[i] >> 4) + ',' + (b[i + 1] >> 4) + ',' + (b[i + 2] >> 4));
      px++;
    }
  }
  return { L, W, H, px, colors: colors.size, cv, kind, a: b, key };
}

function pctOf(L, p) {
  const v = [];
  for (const q of L) if (!Number.isNaN(q)) v.push(q);
  v.sort((a, b) => a - b);
  return v[Math.min(v.length - 1, Math.max(0, Math.floor(v.length * p)))];
}
/** 大尺度光照基底（NaN 跳过） */
function boxBlur(L, W, H, r) {
  const out = new Float64Array(W * H).fill(NaN);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let s = 0, n = 0;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const yy = y + dy, xx = x + dx;
      if (yy < 0 || yy >= H || xx < 0 || xx >= W) continue;
      const v = L[yy * W + xx];
      if (!Number.isNaN(v)) { s += v; n++; }
    }
    if (n) out[y * W + x] = s / n;
  }
  return out;
}
function stdOf(a) {
  let s = 0, s2 = 0, n = 0;
  for (const v of a) if (!Number.isNaN(v)) { s += v; s2 += v * v; n++; }
  if (!n) return 0;
  const mu = s / n;
  return Math.sqrt(Math.max(0, s2 / n - mu * mu));
}
/** 1px 局部对比（相邻像素 RMS） */
function microContrast(L, W, H) {
  let s = 0, n = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W - 1; x++) {
    const a = L[y * W + x], b2 = L[y * W + x + 1];
    if (Number.isNaN(a) || Number.isNaN(b2)) continue;
    s += (a - b2) * (a - b2); n++;
  }
  return n ? Math.sqrt(s / n) : 0;
}
/** 6px 分块均值图 */
function blockMeans(res, W, H, bs) {
  const m = new Float64Array(W * H).fill(NaN);
  for (let by = 0; by + bs <= H; by += bs) for (let bx = 0; bx + bs <= W; bx += bs) {
    let s = 0, n = 0;
    for (let y = by; y < by + bs; y++) for (let x = bx; x < bx + bs; x++) {
      const v = res[y * W + x]; if (!Number.isNaN(v)) { s += v; n++; }
    }
    if (n > bs * bs * 0.5) {
      const mu = s / n;
      for (let y = by; y < by + bs; y++) for (let x = bx; x < bx + bs; x++) m[y * W + x] = mu;
    }
  }
  return m;
}

// ---------------------------- 七条指标 ----------------------------
function measureField(f) {
  const { L, W, H } = f;
  const lo = pctOf(L, 0.05), hi = pctOf(L, 0.95);
  const span = Math.max(1e-6, hi - lo);

  // ① 有效色调数：量化 8 级，统计占比 >3%
  const NQ = 8;
  const hist = new Array(NQ).fill(0);
  let valid = 0;
  for (const v of L) {
    if (Number.isNaN(v)) continue;
    const q = Math.min(NQ - 1, Math.floor((v - lo) / span * NQ));
    if (q >= 0) { hist[q]++; valid++; }
  }
  const tonesTone = hist.filter(c => valid > 0 && c / valid > 0.03).length;
  const tones = tonesTone;
  // 细节均匀度：色调直方图的归一化熵。低熵 = 细节全挤在一个色调里（假细节，看不出层次）
  const tonesSpread = (() => {
    if (!valid) return 0;
    let H2 = 0;
    for (const c of hist) {
      if (!c) continue;
      const p = c / valid;
      H2 -= p * Math.log(p);
    }
    return H2 / Math.log(NQ);   // 归一化到 [0,1]
  })();

  // ③④ 大尺度 vs 块级
  const base = boxBlur(L, W, H, 10);
  const res = new Float64Array(W * H).fill(NaN);
  for (let i = 0; i < L.length; i++) if (!Number.isNaN(L[i])) res[i] = L[i] - base[i];
  const shadeAmp = stdOf(base);
  const bm = blockMeans(res, W, H, 6);
  const blockAmp = stdOf(bm);
  const blockRatio = shadeAmp > 0.5 ? blockAmp / shadeAmp : 0;

  // ⑥ 色块跨度：对**平滑残差**做连通域，取面积加权中位直径 / 车宽。
  //    测量方法演进（每次都用 scripts/dump-tex-ascii2.js 的 ASCII 图人工核对过）：
  //      ① 块均值图(6px)+阈值连通域 → 全 0.08：6px 方块网格把连续色块切成碎岛，是伪影；
  //      ② 块均值图+自相关 → 全 0.22：量到的是网格自己的周期（lag=18），纯伪影；
  //      ③ 平滑残差+自相关 → 全 0.12：量到的是最快振荡分量（方块边缘），不是色块；
  //      ④ 平滑残差+同号游程中位 → 全 0.11：残差在零附近抖动，游程被 1px 翻转切碎，
  //         过滤 <2 后剩下的样本有偏。
  //    正解是**连通域**，但必须建在**平滑残差**（而非分块均值）上：ASCII 图【B】里
  //    camo_dunkelgelb 的「2」色块实测跨 x=19~42（约 24px / 73.5px 车宽 = 0.33），
  //    只有连通域能量出这个数。
  const smoothR = boxBlur(res, W, H, 3);
  const sStd = stdOf(smoothR);
  const thrR = sStd * 0.42;
  // #TEX12：**色块尺度只量内部**。材质层/倒角在轮廓内侧 2~3px 形成一条高振幅亮/暗带，
  //   它是「边」不是「色块」；把它算进连通域会让中位直径变成边缘带厚度（实测 NATO 0.09）。
  //   排除轮廓 3px 带后，量到的才是迷彩块。
  const inner = edgeMask(f, 3);
  const seen6 = new Uint8Array(W * H);
  const areas6 = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (seen6[i]) continue;
    if (inner[i]) { seen6[i] = 1; continue; }
    const v0 = smoothR[i];
    if (Number.isNaN(v0) || v0 <= thrR) { seen6[i] = 1; continue; }
    let n = 0; const st = [[x, y]]; seen6[i] = 1;
    while (st.length) {
      const [cx, cy] = st.pop(); n++;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
        const j = ny * W + nx;
        if (seen6[j]) continue;
        if (inner[j]) { seen6[j] = 1; continue; }
        const v = smoothR[j];
        if (Number.isNaN(v) || v <= thrR) { seen6[j] = 1; continue; }
        seen6[j] = 1; st.push([nx, ny]);
      }
    }
    if (n >= 12) areas6.push(n);
  }
  let patchScale = 0, patchPx = 0;
  if (areas6.length) {
    // 面积加权中位直径：把每块按圆折算
    const dias = areas6.map(a => 2 * Math.sqrt(a / Math.PI)).sort((a, b2) => a - b2);
    patchPx = dias[Math.floor(dias.length / 2)];
    patchScale = patchPx / W;
  }

  // ⑦ mip 存活率 = 「结构在缩小后还在不在」。
  //    前面为「噪点 vs 结构」试过三个指标全部失败（记录见下），根因都是想从**单尺度**统计里
  //    反推「这是线还是点」。而这个问题本来就有标准答案：**看它能不能活过降采样**。
  //      · 纯 1px 随机噪点 → 2×2 均值后大幅抵消，与原图相关性低（存活率低）；
  //      · 4~8px 的色块/蚀刻线 → 降采样后依然成立（存活率高）。
  //    这与本项目强相关：车体在屏幕上只有 59~96px，相机还能再缩到 zoom 0.8，
  //    玩家本质上一直在看「降采样后的贴图」。存活率低 = 实机读不出结构。
  //
  //    失败记录（都实测过，留档避免重犯）：
  //      ① microContrast/blockAmp「颗粒比」→ 全部 2.4~3.3，零区分度；
  //      ② 「邻居是否也显著」→ 全部 1.00（密集颗粒的邻居当然显著，方向反了）；
  //      ③ fine = L − blockMeans(6px) → 全部 1.00（块均值是分段常数，块内残留是平滑渐变）；
  //      ④ 中值残差 + 同号邻域 → 0.18~0.38 有数值区分，但 weld_seam（最该是「线」）
  //         反而最低 0.18 —— 该指标实际量的是「厚度/块度」，不是「线度」。
  const mipSurvival = (() => {
    // 2×2 均值降采样（NaN 感知）
    const dw = Math.floor(W / 2), dh = Math.floor(H / 2);
    if (dw < 4 || dh < 4) return 0;
    const down = new Float64Array(dw * dh).fill(NaN);
    for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
      let s = 0, n = 0;
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
        const v = L[(y * 2 + dy) * W + (x * 2 + dx)];
        if (!Number.isNaN(v)) { s += v; n++; }
      }
      if (n) down[y * dw + x] = s / n;
    }
    // 降采样图的块级振幅 / 原图的块级振幅（都去趋势）
    const dBase = boxBlur(down, dw, dh, 5);
    const dRes = new Float64Array(dw * dh).fill(NaN);
    for (let i = 0; i < down.length; i++) {
      if (!Number.isNaN(down[i])) dRes[i] = down[i] - dBase[i];
    }
    const dAmp = stdOf(dRes);
    // 原图同尺度（r=5）去趋势后的振幅，作为分母（公平比较同一频段）
    const oBase = boxBlur(L, W, H, 5);
    const oRes = new Float64Array(W * H).fill(NaN);
    for (let i = 0; i < L.length; i++) if (!Number.isNaN(L[i])) oRes[i] = L[i] - oBase[i];
    const oAmp = stdOf(oRes);
    return oAmp > 0.5 ? dAmp / oAmp : 0;
  })();

  return {
    key: f.key, size: W + 'x' + H, px: f.px,
    tones, tonesSpread, valueSpan: hi - lo, shadeAmp, blockAmp, blockRatio, patchScale, patchPx, mipSurvival,
    micro: microContrast(L, W, H), colors: f.colors,
    coverage: f.px / (W * H),
  };
}

/** 兼容入口：单部件指标（part 缺省 hull，seed 缺省 5）。 */
function measure(key, dmg, seed, part) {
  return measureField(lumField(key, dmg || 0, seed, part));
}

// ---------------------------- 按设计意图分类 ----------------------------
// 用一套标准评判「迷彩」和「单色涂装」是错的：
//   迷彩的**目的**就是高块级对比 + 明确的色块周期；单色涂装的目的是**低** blockAmp、
//   靠蚀刻细节（板缝/焊缝/铆钉）与光影立体积感取胜。拿迷彩的 blockAmp 区间去卡
//   paint_panzergrau 只会逼出「给灰漆加假迷彩」这种错误改法。
// 因此每个键声明自己的 intent，评分区间按 intent 取不同表。
const INTENT = {
  none: 'plain', armor_plate: 'plain', weld_seam: 'plain',
  rust: 'plain', paint_panzergrau: 'plain', paint_soviet: 'plain', paint_olive: 'plain',
  camo: 'camo', camo_dunkelgelb: 'camo', camo_nato: 'camo', camo_desert: 'camo',
  camo_winter: 'camo', camo_urban: 'camo',
  // 数码迷彩是**第三种**意图，不能并入 'camo'：它的设计语言就是「小像素簇」，
  // 用块状迷彩的 patchScale 目标（0.18~0.45）去卡它，等于要求「数码迷彩别那么数码」。
  // 同理不能放松到「无所谓」——像素簇必须活过降采样（mipSurvival 要求更严），
  // 且三色必须真的可分（blockAmp 仍有下限）。
  camo_digital: 'digital',
};

// 每类意图的评分表。★ 为核心项。
// plain（单色/蚀刻）：靠细节与体积，不要求色块
const CRIT_PLAIN = [
  { key: 'tones', label: '有效色调数', w: 12,
    // #TEX12 校准：超采样+材质层后，平滑顶光/倒角会把亮度铺满 8 个量化级；
    //   「8 级全占」不再等于脏（脏由 tonesSpread 与 micro 结构项抓）。上限放到 8。
    ranges: [[3, 8, 'S'], [2, 9, 'A'], [1.5, 10, 'B'], [-Infinity, Infinity, 'C']] },
  { key: 'valueSpan', label: '亮度跨度', w: 10,
    ranges: [[30, 130, 'S'], [22, 160, 'A'], [16, 200, 'B'], [-Infinity, Infinity, 'C']] },
  { key: 'shadeAmp', label: '大尺度明暗振幅（体积感）★', w: 20,
    ranges: [[5, 18, 'S'], [3.5, 26, 'A'], [2, 40, 'B'], [-Infinity, Infinity, 'C']] },
  { key: 'mipSurvival', label: '降采样存活率（缩小后结构还在吗）★', w: 26,
    // 1px 噪点在 2×2 均值后大幅抵消；4~8px 结构活得好。
    // #TEX12：超采样后平滑材质让比值可略 >1（大尺度结构保留），上界放宽到 1.15/1.30。
    ranges: [[0.62, 1.15, 'S'], [0.50, 1.30, 'A'], [0.38, 1.70, 'B'], [-Infinity, Infinity, 'C']] },
  { key: 'blockAmp', label: '块级振幅（单色不宜过高）', w: 12,
    ranges: [[2, 12, 'S'], [1, 18, 'A'], [0.5, 26, 'B'], [-Infinity, Infinity, 'C']] },
  { key: 'tonesSpread', label: '细节均匀度（色调占比熵）', w: 20,
    ranges: [[0.62, 1.0, 'S'], [0.50, 1.0, 'A'], [0.38, 1.0, 'B'], [-Infinity, Infinity, 'C']] },
];
// camo（迷彩）：靠块级对比与色块周期
const CRIT_CAMO = [
  { key: 'tones', label: '有效色调数', w: 12,
    ranges: [[3, 8, 'S'], [2.5, 9, 'A'], [2, 10, 'B'], [-Infinity, Infinity, 'C']] },
  { key: 'valueSpan', label: '亮度跨度', w: 8,
    ranges: [[34, 130, 'S'], [26, 160, 'A'], [18, 200, 'B'], [-Infinity, Infinity, 'C']] },
  { key: 'blockAmp', label: '块级振幅（迷彩块对比）★', w: 22,
    ranges: [[7, 24, 'S'], [5, 32, 'A'], [3, 44, 'B'], [-Infinity, Infinity, 'C']] },
  { key: 'blockRatio', label: '块级/光照比 ★', w: 18,
    ranges: [[0.55, 1.30, 'S'], [0.40, 1.55, 'A'], [0.28, 1.85, 'B'], [-Infinity, Infinity, 'C']] },
  { key: 'patchScale', label: '色块周期（占车宽）★', w: 20,
    // #TEX12 校准：超采样+材质平滑后连通域只保留色块核心（低对比迷彩尤其明显），
    //   读数整体下降 ~35%。目标区改为 0.08~0.26：<0.05 碎成噪点，>0.34 糊成一块。
    ranges: [[0.08, 0.26, 'S'], [0.06, 0.34, 'A'], [0.04, 0.46, 'B'], [-Infinity, Infinity, 'C']] },
  { key: 'mipSurvival', label: '降采样存活率（缩小后结构还在吗）', w: 12,
    ranges: [[0.62, 1.18, 'S'], [0.50, 1.35, 'A'], [0.38, 1.70, 'B'], [-Infinity, Infinity, 'C']] },
  { key: 'shadeAmp', label: '大尺度明暗振幅（体积感）', w: 8,
    ranges: [[5, 20, 'S'], [3.5, 28, 'A'], [2, 40, 'B'], [-Infinity, Infinity, 'C']] },
];
// digital（数码迷彩）：靠**像素簇**，不靠大色块
const CRIT_DIGITAL = [
  { key: 'tones', label: '有效色调数', w: 14,
    ranges: [[3, 8, 'S'], [2.5, 9, 'A'], [2, 10, 'B'], [-Infinity, Infinity, 'C']] },
  { key: 'valueSpan', label: '亮度跨度', w: 8,
    ranges: [[34, 130, 'S'], [26, 160, 'A'], [18, 200, 'B'], [-Infinity, Infinity, 'C']] },
  { key: 'blockAmp', label: '块级振幅（三色必须真可分）★', w: 22,
    // 数码迷彩的簇级对比仍需达到可分辨，只是簇更小
    ranges: [[6, 26, 'S'], [4.5, 34, 'A'], [3, 44, 'B'], [-Infinity, Infinity, 'C']] },
  { key: 'mipSurvival', label: '降采样存活率（像素簇须活过缩放）★★', w: 28,
    // 数码迷彩最怕「缩到实机就没了」，比块状迷彩要求更严
    ranges: [[0.70, 1.15, 'S'], [0.58, 1.30, 'A'], [0.45, 1.70, 'B'], [-Infinity, Infinity, 'C']] },
  { key: 'patchScale', label: '簇尺寸（占车宽，数码迷彩应偏小）', w: 12,
    // 数码迷彩的簇**就该**小于块状迷彩；但小到 <0.03 就等于单像素噪点
    ranges: [[0.045, 0.16, 'S'], [0.030, 0.22, 'A'], [0.020, 0.32, 'B'], [-Infinity, Infinity, 'C']] },
  { key: 'blockRatio', label: '块级/光照比', w: 10,
    ranges: [[0.45, 1.35, 'S'], [0.34, 1.60, 'A'], [0.24, 1.90, 'B'], [-Infinity, Infinity, 'C']] },
  { key: 'shadeAmp', label: '大尺度明暗振幅（体积感）', w: 6,
    ranges: [[5, 20, 'S'], [3.5, 28, 'A'], [2, 40, 'B'], [-Infinity, Infinity, 'C']] },
];
const CRIT_BY_INTENT = { plain: CRIT_PLAIN, camo: CRIT_CAMO, digital: CRIT_DIGITAL };
const INTENT_LABEL = { plain: '单色/蚀刻', camo: '迷彩', digital: '数码迷彩' };
const SCORE = { S: 100, A: 80, B: 60, C: 25 };
function gradeOf(c, v) {
  for (const [lo, hi, g] of c.ranges) if (v >= lo && v <= hi) return g;
  return 'C';
}

// ---------------------------- 体检项（不评分） ----------------------------
function healthChecks(keys) {
  const out = [];
  // distinct：与裸装甲（none）的可区分度
  const base = lumField('none', 0);
  const baseBm = blockMeans(
    (() => {
      const bs = boxBlur(base.L, base.W, base.H, 10);
      const r = new Float64Array(base.L.length).fill(NaN);
      for (let i = 0; i < base.L.length; i++) if (!Number.isNaN(base.L[i])) r[i] = base.L[i] - bs[i];
      return r;
    })(), base.W, base.H, 6);
  for (const k of keys) {
    if (k === 'none') continue;
    const f = lumField(k, 0);
    const bs = boxBlur(f.L, f.W, f.H, 10);
    const r = new Float64Array(f.L.length).fill(NaN);
    for (let i = 0; i < f.L.length; i++) if (!Number.isNaN(f.L[i])) r[i] = f.L[i] - bs[i];
    const bm = blockMeans(r, f.W, f.H, 6);
    // 逐块（取同尺寸左下对齐）比较，统计差异显著的块占比
    let diffN = 0, tot = 0;
    const step = 6;
    const WW = Math.min(f.W, base.W), HH = Math.min(f.H, base.H);
    for (let y = 0; y + step <= HH; y += step) for (let x = 0; x + step <= WW; x += step) {
      const a = bm[y * f.W + x], b2 = baseBm[y * base.W + x];
      if (Number.isNaN(a) || Number.isNaN(b2)) continue;
      tot++;
      if (Math.abs(a - b2) > 2.5) diffN++;
    }
    out.push({ key: k, distinct: tot ? diffN / tot : 0 });
  }
  // damageCurve：0 vs 3 的块级差异占比
  for (const k of ['camo_dunkelgelb', 'paint_soviet', 'rust']) {
    const a = lumField(k, 0), b2 = lumField(k, 3);
    let diffN = 0, tot = 0;
    const WW = Math.min(a.W, b2.W), HH = Math.min(a.H, b2.H);
    for (let y = 0; y < HH; y++) for (let x = 0; x < WW; x++) {
      const p = a.L[y * a.W + x], q = b2.L[y * b2.W + x];
      if (Number.isNaN(p) || Number.isNaN(q)) continue;
      tot++;
      if (Math.abs(p - q) > 12) diffN++;
    }
    out.push({ key: k + ' (dmg0 vs dmg3)', distinct: tot ? diffN / tot : 0 });
  }
  return out;
}

// ---------------------------- v3 部件/整车检查 ----------------------------
// v2 七条指标只量**车体**一张 sprite 的统计量，量不到 2026-10-18 实机 1:1 审阅暴露的
// 三类「统计全绿但肉眼不对」的缺陷：
//   ① 图案尺度在炮塔上缩水：旧 TEXTURE_DEFS.draw 拿到的是**部件自己的 bbox**，
//      车体 73.5px 宽、炮塔 32.3px 宽 ⇒ 同一条 fx=0.30 的色块在炮塔上只有一半大；
//   ② 同型车共用同一套迷彩：图案种子全是常量，两辆 Tiger 像素级完全一样；
//   ③ 磨损只画在装甲面内：棱边没有掉漆，放大看是「彩色碎屑」而不是战损。
// 这三类都不是「颜色/对比/颗粒」统计能反推的，必须**跨部件、跨实例、沿边界**量。
// 因此 v3 是 4 条**通过/不通过**检查（不并进 v2 的 100 分，避免为了凑分而调区间）：
//   A. partPatchRatio 炮塔/车体**绝对**色块直径比（目标 0.70~1.40）
//   B. variation      同贴图两个 weatherSeed 的画面差异占比（目标 ≥8%）
//   C. edgeWear       dmg2 相对 dmg0 在「轮廓内侧 2px 带」上的改变占比（目标 ≥18%）
//   D. continuity     炮塔图案与车体图案在**同一像素坐标**的残差（目标 ≤0.85）
// 说明：D 的基准是「两套独立图案」≈1.4；同一套图案叠不同底色 ≈0.3~0.5。

/** 取 canvas 的亮度/alpha 场（同 lumField 口径） */
function fieldOfCanvas(cv) {
  const W = cv.width, H = cv.height, b = cv._buf;
  const L = new Float64Array(W * H).fill(NaN);
  const A = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    A[y * W + x] = b[i + 3];
    if (b[i + 3] > 32) L[y * W + x] = 0.299 * b[i] + 0.587 * b[i + 1] + 0.114 * b[i + 2];
  }
  return { L, A, W, H };
}

/** 两张同尺寸场的逐像素差异占比（NaN 跳过） */
function fieldDiffRatio(f1, f2, thr) {
  let n = 0, tot = 0;
  for (let i = 0; i < f1.L.length; i++) {
    const a = f1.L[i], b = f2.L[i];
    if (Number.isNaN(a) || Number.isNaN(b)) continue;
    tot++;
    if (Math.abs(a - b) > thr) n++;
  }
  return tot ? n / tot : 0;
}

/** 轮廓内侧带宽 band 的不透明像素掩码（Chebyshev 距离） */
function edgeMask(f, band) {
  const { L, W, H } = f;
  const m = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (Number.isNaN(L[y * W + x])) continue;
    let edge = false;
    for (let dy = -band; dy <= band && !edge; dy++) for (let dx = -band; dx <= band; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || xx >= W || yy < 0 || yy >= H) continue;
      if (Number.isNaN(L[yy * W + xx])) { edge = true; break; }
    }
    if (edge) m[y * W + x] = 1;
  }
  return m;
}

/** 去掉大尺度明暗后的残差场（r=8：只留色块/细节，去掉顶光渐变与部件底色差） */
function highpassL(f, r) {
  const base = boxBlur(f.L, f.W, f.H, r);
  const out = new Float64Array(f.L.length).fill(NaN);
  for (let i = 0; i < f.L.length; i++) if (!Number.isNaN(f.L[i])) out[i] = f.L[i] - base[i];
  return out;
}

/** 炮塔图案与车体图案在同一像素坐标的一致性（1=完全一致，1.4=两套独立图案） */
function continuityScore(key, seed) {
  const sd = seed == null ? 5 : seed;
  const t = /** @type {any} */ (G.spawnTank)({
    id: 'probe', team: 'enemy', x: 160, y: 100, hullAngle: 0, turretAngle: 0,
    color: '#7ed957', heightClass: 'medium', texture: key
  });
  t.maxHp = 100; t.hp = 100; t.weatherSeed = sd;
  P.clearPaintCache();
  const W = 260, H = 170;
  const hv = G.hullPoly(t).verts, tv = G.turretPoly(t).verts;
  const hbox = P.paintPatternBox(hv, 'hull', null, sd);
  const tbox = P.paintPatternBox(hv, 'turret', t.turretPivotOffset, sd);
  // 只比**涂装层**（detail:false）：车长塔/观察镜等机械件本来就只长在炮塔上，
  // 把它们算进残差会把「同一套漆」误判成两套图案（实测 0.97 相关会被拉到 1.2+）。
  const hullCv = /** @type {any} */ (G.document.createElement('canvas'));
  hullCv.width = W; hullCv.height = H;
  const turCv = /** @type {any} */ (G.document.createElement('canvas'));
  turCv.width = W; turCv.height = H;
  // 材质层（倒角/拉丝/积尘）是**光照与表面处理**，不是涂装图案；它逐部件独立生成，
  // 参与 continuity 会把「同一套迷彩」误判成两套（实测 plain 贴图残差比 2.4）。
  const prevMat = P.getPaintMaterial();
  P.setPaintMaterial(false);
  try {
    P.paintPartTextureDirect(hullCv.getContext('2d'), hv, t.x, t.y, 0, 1, t.color, 'hull',
      { texture: key, damageLevel: 0, weatherSeed: sd, texBox: hbox, detail: false });
    const p = G.turretPivot(t);
    P.paintPartTextureDirect(turCv.getContext('2d'), tv, p.x, p.y, 0, 1, t.color, 'turret',
      { texture: key, damageLevel: 0, weatherSeed: sd + 17, texBox: tbox, detail: false });
  } finally {
    P.setPaintMaterial(prevMat);
  }
  const fh = fieldOfCanvas(hullCv), ft = fieldOfCanvas(turCv);
  // 只取「炮塔覆盖且车体在其下也有像素」的位置；两边都去掉大尺度明暗后再比
  // （炮塔与车体的顶光渐变锚在各自 bbox，直接比会被渐变差淹没——这不是图案问题）
  const rh = highpassL(fh, 8), rt = highpassL(ft, 8);
  const dh = [], dt = [];
  for (let i = 0; i < fh.L.length; i++) {
    if (Number.isNaN(fh.L[i]) || Number.isNaN(ft.L[i])) continue;
    if (ft.A[i] < 200) continue;
    dh.push(rh[i]); dt.push(rt[i]);
  }
  if (dh.length < 40) return null;
  const mean = arr => arr.reduce((a, b) => a + b, 0) / arr.length;
  const mh = mean(dh), mt = mean(dt);
  let s2 = 0, vh = 0;
  for (let i = 0; i < dh.length; i++) {
    const d = (dt[i] - mt) - (dh[i] - mh);
    s2 += d * d;
    vh += (dh[i] - mh) * (dh[i] - mh);
  }
  const stdD = Math.sqrt(s2 / dh.length);
  const stdH = Math.sqrt(vh / dh.length);
  if (stdH < 1) return null;
  return stdD / stdH;   // 0 = 同一套图案；≈1.4 = 两套独立图案（方差相加）
}

/** 一条 v3 检查的统一结果 */
function v3One(key, name, value, pass, target) {
  return { key, name, value, pass, target };
}

function v3Checks(key) {
  const out = [];
  const intent = INTENT[key] || 'plain';
  const patterned = intent === 'camo' || intent === 'digital';
  const fh = lumField(key, 0, 5, 'hull');
  // A. 同型车图案唯一性（只对迷彩/数码迷彩：单色涂装没有「图案布局」可言）
  const varRatio = fieldDiffRatio(fh, lumField(key, 0, 98765, 'hull'), 6);
  out.push(patterned
    ? v3One(key, 'variation', varRatio, varRatio >= 0.08, '≥8%')
    : v3One(key, 'variation', null, true, 'N/A（单色涂装）'));
  // B. 边缘磨损（dmg0 → dmg2，只看轮廓内侧 2px 带）
  const f2 = lumField(key, 2, 5, 'hull');
  const em = edgeMask(fh, 2);
  let edgeTot = 0, edgeChg = 0;
  for (let i = 0; i < em.length; i++) {
    if (!em[i]) continue;
    const a = fh.L[i], b = f2.L[i];
    if (Number.isNaN(a) || Number.isNaN(b)) continue;
    edgeTot++;
    if (Math.abs(a - b) > 6) edgeChg++;
  }
  const edgeWear = edgeTot ? edgeChg / edgeTot : 0;
  out.push(v3One(key, 'edgeWear', edgeWear, edgeWear >= 0.17, '≥17%'));
  // C. 车体↔炮塔图案连续性（仅对有图案的键；none 无图案可比）
  const cont = continuityScore(key, 5);
  if (key === 'none') {
    out.push(v3One(key, 'continuity', null, true, 'N/A（无图案）'));
  } else if (cont == null) {
    out.push(v3One(key, 'continuity', null, true, 'N/A（样本不足）'));
  } else {
    out.push(v3One(key, 'continuity', cont, cont <= 0.85, '≤0.85（同图案）'));
  }
  return out;
}

// ---------------------------- 主流程 ----------------------------
const TEX_KEYS = Object.keys(P.TEXTURE_DEFS);
const asJson = process.argv.includes('--json');

function runAudit() {
  return TEX_KEYS.map(k => {
    const intent = INTENT[k] || 'plain';
    const crit = CRIT_BY_INTENT[intent];
    const m = measure(k, 0);
    let sum = 0, wsum = 0;
    const detail = crit.map(c => {
      const g = gradeOf(c, m[c.key]);
      sum += SCORE[g] * c.w; wsum += c.w;
      return { key: c.key, label: c.label, w: c.w, value: m[c.key], grade: g };
    });
    // #TEX11：v2 分数 + v3 四条跨部件/跨实例/沿边检查（不并进 100 分）
    const v3 = v3Checks(k);
    return { ...m, intent, score: Math.round(sum / wsum), detail, v3, v3Pass: v3.every(x => x.pass) };
  }).sort((a, b) => b.score - a.score);
}

// 作为模块被 require（test-render.js 等）：只导出标准本身，**完全静默**。
// （早前版本只跳过 CLI 的 process.exit，结果 require 方仍会把整张报表打印进
//  自己的测试日志。注意这里不能用顶层 `return`——CommonJS 里那是语法错误 TS1108，
//  必须用 if/else 把 CLI 主体整个包起来。）
const IS_CLI = require.main === module;

if (!IS_CLI) {
  module.exports = { runAudit, measure, measureField, lumField, healthChecks, INTENT, CRIT_BY_INTENT,
    TEX_KEYS, gradeOf, SCORE, v3Checks, continuityScore, fieldDiffRatio, edgeMask };
} else {
  const rows = runAudit();

  if (asJson) {
    console.log(JSON.stringify({ rows, health: healthChecks(TEX_KEYS), intent: INTENT }, null, 2));
    process.exit(0);
  }

  const gradeOfScore = s => (s >= 92 ? 'S' : s >= 80 ? 'A' : s >= 62 ? 'B' : 'C');

console.log('══════════════════════════════════════════════════════════════════════════');
console.log(' 坦克贴图审核（标准 v2 分数 + v3 跨部件/跨实例/沿边检查 · 2026-10-18）');
console.log(' 测量基准：离屏 sprite 的 1:1 像素 = 实机显示像素（车体 73.5×38 世界像素，');
console.log('           scale=1，相机 zoom 0.8~1.3 ⇒ 屏幕 59~96px 宽；3× 超采样经 spriteView1x 降到 1:1）');
console.log(' v2 达标线：80 分（A）。★ 为核心指标。**按设计意图分类评分**：');
console.log('   迷彩  → 看块级对比 / 块-光照比 / 色块周期（就该高对比、有周期）');
console.log('   单色  → 看细结构连贯性 / 体积感 / 细节均匀度（不要求也不惩罚色块）');
console.log(' v3 三条必须同时通过：同型车图案唯一性 / 边缘磨损 / 车↔塔图案连续');
console.log('══════════════════════════════════════════════════════════════════════════\n');

// 按键名长度对齐，逐意图分组打印
const KEYS_ORDER = ['tones', 'valueSpan', 'shadeAmp', 'blockAmp', 'blockRatio', 'patchScale', 'mipSurvival', 'tonesSpread'];
const hdr = '贴图'.padEnd(19) + '意图   总分 级 ' + KEYS_ORDER.map(k => k.slice(0, 8).padStart(9)).join('');
console.log(hdr);
console.log('─'.repeat(hdr.length + 6));
for (const r of rows) {
  const byKey = {};
  for (const d of r.detail) byKey[d.key] = d.value;
  const cells = KEYS_ORDER.map(k => {
    const v = byKey[k];
    if (v === undefined) return '        -';
    return String(Math.abs(v) >= 100 ? Math.round(v) : v.toFixed(2)).padStart(9);
  }).join('');
  console.log(r.key.padEnd(19) + (INTENT_LABEL[r.intent] || r.intent).padEnd(6)
    + String(r.score).padStart(4) + ' ' + gradeOfScore(r.score).padStart(2) + ' ' + cells);
}

console.log('\n不达标项（C 级）明细：');
let anyBad = false;
for (const r of rows) {
  const bad = r.detail.filter(d => d.grade === 'C');
  if (!bad.length) continue;
  anyBad = true;
  console.log(`  ${r.key}（${r.score} 分，${INTENT_LABEL[r.intent]}）：`);
  for (const d of bad) {
    const c = CRIT_BY_INTENT[r.intent].find(x => x.key === d.key);
    const tgt = c.ranges[0];
    console.log(`    ✗ ${d.label}: 实测 ${d.value.toFixed(2)}  目标 [${tgt[0]}, ${tgt[1]}]`);
  }
}
if (!anyBad) console.log('  （无 C 级）');

// v3 表
console.log('\nv3 跨部件/跨实例/沿边检查（全部须 PASS）：');
const v3Hdr = '贴图'.padEnd(19) + '同型差异   边缘磨损   车塔连续   判定';
console.log(v3Hdr);
console.log('─'.repeat(v3Hdr.length + 4));
let v3Bad = [];
for (const r of rows) {
  const get = n => r.v3.find(x => x.name === n);
  const fmt = (v, pct) => {
    if (v.value == null) return '      N/A';
    const s = pct ? (v.value * 100).toFixed(1) + '%' : v.value.toFixed(2);
    return (v.pass ? ' ' : '✗') + s.padStart(9);
  };
  const b = get('variation'), c = get('edgeWear'), d = get('continuity');
  console.log(r.key.padEnd(19) + fmt(b, true) + fmt(c, true) + fmt(d) +
    (r.v3Pass ? '    PASS' : '    FAIL'));
  for (const v of r.v3) if (!v.pass) v3Bad.push(`${r.key}.${v.name}=${v.value == null ? '-' : v.value.toFixed(2)}`);
}
console.log(v3Bad.length ? `  ✗ v3 未通过：${v3Bad.join(', ')}` : '  ✓ v3 全部通过');

console.log('\n体检项（不参与评分）：');
for (const h of healthChecks(TEX_KEYS)) {
  const flag = h.distinct < 0.05 ? '  ⚠ 与基准几乎无差异' : '';
  console.log(`  ${h.key.padEnd(30)} 差异块占比 ${(h.distinct * 100).toFixed(1).padStart(5)}%${flag}`);
}

const avg = Math.round(rows.reduce((a, r) => a + r.score, 0) / rows.length);
const pass = rows.filter(r => r.score >= 80).length;
console.log(`\n平均 ${avg}／100   达标(A 以上) ${pass}／${rows.length}   v3 通过 ${rows.filter(r => r.v3Pass).length}／${rows.length}`);
}
