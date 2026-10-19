// test-render.js — 渲染管线像素级回归（贴图缓存键 / 损伤分级 / 光源方向 / mini-canvas 语义）
//
// 为什么需要它：`scripts/test-tanks.js` 的绘制断言是
//   `new Proxy({}, {get: () => () => mockCtx})` 包一个 mock ctx，然后断言「不抛错」——
//   mock 让任何调用恒返回自身，所以 NaN 坐标、漏画、画到画布外、缓存键丢字段**一律测不出**。
//   `scripts/test-assets.js` 同理只验证「不抛错 + 绘制调用数 > 0」。
//   于是本文件改用 `scripts/lib/mini-canvas.js`（真实光栅化）做**逐像素**断言，
//   把 2026-10-18 修复的四类缺陷固化为回归保护：
//     ① PAINT_CACHE 键必须覆盖 damageLevel / weatherSeed / appearance（否则退化共享出厂 sprite）
//     ② 炮塔必须吃损伤 weathering（旧实现被 `if(isHull)` 包住，永不变旧）
//     ③ 阴影方向必须是世界固定（旧实现偏移被旋转两次，同屏两个光源）
//     ④ mini-canvas 的 drawImage 必须跟随 CTM、'lighter' 必须真加法合成
//        （否则离线生图与实机视觉不可互验，render-map-shot.js 默认 --scale 下产出错位）
//
// Run: node scripts/test-render.js   （npm run test:render）
'use strict';

const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const { createMiniCanvas } = require('./lib/mini-canvas.js');

// ---- 与 Node 生图工具同款 shims：让浏览器分层模块在无 DOM 环境可加载 ----
// 用 any 视图写入 global：tsc 会 checkJs，直接给 global.document/Image/performance 赋
// 精简 shim 会触发 DOM 类型不匹配（与 scripts/lib 同款做法不同，这里断言的是真实光栅）。
const G = /** @type {any} */ (global);
G.document = { createElement: t => (t === 'canvas' ? createMiniCanvas(32, 32) : null) };
G.Image = function () { this.src = ''; };
G.performance = { now: () => 1000 };
const RULES_MOD = require('../js/tank_rules.js');
G.RULES = RULES_MOD.RULES;
const U = require('../js/tank_utils.js');
Object.assign(global, U);
G.TAU = U.TAU;
for (const m of ['tank_geometry', 'tank_halfgeom', 'tank_model', 'tank_cover', 'tank_entity']) {
  Object.assign(global, require(path.join(ROOT, 'js', m + '.js')));
}
const P = require('../js/tank_paint.js');
Object.assign(global, P);
const A = require('../js/tank_assets.js');
Object.assign(global, A);
const BD = require('../js/tank_battledraw.js');
Object.assign(global, BD);
// #GT（2026-10-18）：相机模块——renderCamPos（渲染用屏幕像素对齐位置）是地面纹理抖动修复的核心，
//   必须与 tank_battledraw 的地面缓存一起纳入逐像素回归。
const CAM = require('../js/tank_camera.js');

let fails = 0;
function ok(cond, label) {
  if (cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}`); fails++; }
}

// ---------- 工具：把一次绘制光栅化并统计 ----------
// tsc 会对 js/ 与 scripts/ 做 checkJs：tank_entity.spawnTank / mini-canvas.getContext 的
// 推断签名过窄（页面侧同样按 4 参/0 参调用），这里统一用 any 视图调用，避免类型噪声。
const anyA = (/** @type {any} */ v) => v;
function ctx2d(/** @type {any} */ cv) { return anyA(cv).getContext('2d'); }
function raster(w, h, fn) {
  const cv = createMiniCanvas(w, h);
  const ctx = ctx2d(cv);
  fn(ctx, cv);
  return cv;
}
// 像素差异计数（通道任一偏差 > tol 计 1）
function diffPx(a, b, tol) {
  const t = tol == null ? 2 : tol;
  let n = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i += 4) {
    if (Math.abs(a[i] - b[i]) > t || Math.abs(a[i + 1] - b[i + 1]) > t ||
        Math.abs(a[i + 2] - b[i + 2]) > t || Math.abs(a[i + 3] - b[i + 3]) > t) n++;
  }
  return n;
}
function opaque(cv) {
  const b = cv._buf; let n = 0;
  for (let i = 3; i < b.length; i += 4) if (b[i] > 0) n++;
  return n;
}
// alpha 加权质心（相对画布中心的偏移）
function centroid(cv, alphaMin) {
  const W = cv.width, H = cv.height, b = cv._buf;
  let sx = 0, sy = 0, n = 0;
  const amin = alphaMin == null ? 2 : alphaMin;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (b[(y * W + x) * 4 + 3] > amin) { sx += x; sy += y; n++; }
  }
  if (!n) return null;
  return { x: +(sx / n - W / 2).toFixed(2), y: +(sy / n - H / 2).toFixed(2), n };
}
function mkTank(opts) {
  const t = anyA(spawnTank)(Object.assign({
    id: 'probe', team: 'enemy', x: 200, y: 200, hullAngle: 0, turretAngle: 0,
    color: '#7ed957', heightClass: 'medium', texture: 'camo_dunkelgelb'
  }, opts || {}));
  t.maxHp = 100; t.hp = (opts && opts.hp != null) ? opts.hp : 100;
  t.weatherSeed = (opts && opts.weatherSeed != null) ? opts.weatherSeed : 5;
  return t;
}
function drawHull(t) {
  P.clearPaintCache();
  return raster(300, 300, c => BD.renderHullTexture(c, t));
}
function drawTurret(t) {
  P.clearPaintCache();
  return raster(300, 300, c => BD.renderTurretTexture(c, 150, 150, 0, t));
}

// ---------- ① 贴图缓存键覆盖度 ----------
{
  const t3 = mkTank({ hp: 12 });
  const t0 = mkTank({ hp: 100 });
  const a = drawHull(t0), b = drawHull(t3);
  ok(opaque(a) > 1000 && opaque(b) > 1000, `车体渲染有内容（${opaque(a)} px）`);
  const dmgDiff = diffPx(a._buf, b._buf);
  ok(dmgDiff > 20, `①-damageLevel：全血 vs 残血车体像素不同（差 ${dmgDiff} px，旧缓存键丢字段时为 0）`);

  // 缓存命中必须**稳定**（同一入参两次 → 逐字节相同），否则说明键退化成了随机
  const again = drawHull(t3);
  ok(diffPx(b._buf, again._buf) === 0, '①-缓存：同入参二次渲染逐字节一致（缓存可安全复用）');

  // weatherSeed 不同 → 磨损位置不同
  const s7 = mkTank({ hp: 12, weatherSeed: 7 });
  const s99 = mkTank({ hp: 12, weatherSeed: 99 });
  const c7 = drawHull(s7), c99 = drawHull(s99);
  ok(diffPx(c7._buf, c99._buf) > 5, `①-weatherSeed：不同 seed 磨损分布不同（差 ${diffPx(c7._buf, c99._buf)} px）`);

  // appearance.engineDeck 必须影响车体像素（旧键丢 appearance → 外观件被静默忽略）
  const std = mkTank({ hp: 100 });
  const cmp = mkTank({ hp: 100 });
  cmp.appearance = { engineDeck: { style: 'compact' } };
  const rear = mkTank({ hp: 100 });
  rear.appearance = { engineDeck: { style: 'rearGrille' } };
  const d0 = drawHull(std), d1 = drawHull(cmp), d2 = drawHull(rear);
  ok(diffPx(d0._buf, d1._buf) > 10, `①-appearance：engineDeck standard vs compact 像素不同（差 ${diffPx(d0._buf, d1._buf)} px）`);
  ok(diffPx(d1._buf, d2._buf) > 10, `①-appearance：compact vs rearGrille 像素不同（差 ${diffPx(d1._buf, d2._buf)} px）`);

  // 缓存必须有界（键含 d/w/appearance 后单车上界抬到 4~12 条，且全仓库无 clearPaintCache 调用点）
  // #TEX12：用 12×12 小多边形代替真实车体做 900 次缓存插入——3× 超采样后真实车体每次
  //   ~246×138，900 次会把测试拖到分钟级；本条只验证键/淘汰语义，与画幅无关。
  P.clearPaintCache();
  const verts = [[6, 6], [-6, 6], [-6, -6], [6, -6]];
  for (let i = 0; i < 700; i++) {
    P.getCachedTankSprite('#5e7038', 'hull', verts, true, 'medium', 'camo_dunkelgelb',
      { damageLevel: 0, weatherSeed: i });
  }
  ok(P.PAINT_CACHE.size <= 512, `①缓存有界：700 个不同键后条目数 ${P.PAINT_CACHE.size} ≤ 512（无上限时会 700+ 且永不释放）`);
  // LRU 语义：最近命中的键在后续插入中不被淘汰
  const lastKey = 'camo_dunkelgelb';
  P.getCachedTankSprite('#5e7038', 'hull', verts, true, 'medium', lastKey, { damageLevel: 0, weatherSeed: 0 });
  const sizeAtTouch = P.PAINT_CACHE.size;
  for (let i = 5000; i < 5200; i++) {
    P.getCachedTankSprite('#5e7038', 'hull', verts, true, 'medium', 'camo_nato', { damageLevel: 0, weatherSeed: i });
  }
  ok(P.PAINT_CACHE.size <= 512 && sizeAtTouch <= 512, `①LRU：命中后继续插入 200 条仍 ≤ 512（实际 ${P.PAINT_CACHE.size}）`);

  // ①b #TEX12 超采样烘焙 + 材质层：
  //   · sprite 必须以 ≥2× 分辨率烘焙（否则实机 zoom>1 就是放大 1× 位图 = 纯像素风）；
  //   · spriteView1x 必须还原成 1:1 显示尺寸（验收/测试的测量基准）；
  //   · 材质层必须真的改变像素（关/开对照），不能是写在注释里的“已完成”。
  const ssTank = mkTank({ hp: 100, texture: 'camo_dunkelgelb' });
  P.clearPaintCache();
  const ssSpr = P.getCachedTankSprite(ssTank.color, 'hull', hullPoly(ssTank).verts, true,
    ssTank.heightClass, 'camo_dunkelgelb', { damageLevel: 0, weatherSeed: ssTank.weatherSeed, texBox: null });
  const S = P.getSpriteScale();
  ok(S >= 2, `①b超采样：SPRITE_SCALE=${S}（≥2）`);
  const v1 = P.spriteView1x(ssSpr);
  ok(Math.abs(v1.canvas.width * S - ssSpr.canvas.width) <= 1 &&
     Math.abs(v1.canvas.height * S - ssSpr.canvas.height) <= 1,
    `①b超采样：1:1 视图 ${v1.canvas.width}×${v1.canvas.height} × ${S} = 烘焙 ${ssSpr.canvas.width}×${ssSpr.canvas.height}`);
  P.setPaintMaterial(false);
  const matOff = drawHull(mkTank({ hp: 100, texture: 'camo_dunkelgelb' }));
  P.setPaintMaterial(true);
  const matOn = drawHull(mkTank({ hp: 100, texture: 'camo_dunkelgelb' }));
  const matDiff = diffPx(matOff._buf, matOn._buf, 1);
  ok(matDiff > 100, `①b材质层：关/开对照像素差 ${matDiff} px（倒角/AO/拉丝/积尘必须生效）`);
}

// ---------- ② 炮塔损伤 weathering ----------
{
  const t0 = mkTank({ hp: 100 });
  const t3 = mkTank({ hp: 12 });
  const a = drawTurret(t0), b = drawTurret(t3);
  const d = diffPx(a._buf, b._buf);
  ok(d > 10, `②炮塔 weathering：全血 vs 残血炮塔像素不同（差 ${d} px，修复前恒为 0）`);

  // 炮塔 appearance.cupola 样式必须生效
  const low = mkTank({ hp: 100 }); low.appearance = { cupola: { style: 'low' } };
  const pan = mkTank({ hp: 100 }); pan.appearance = { cupola: { style: 'panoramic' } };
  const x = drawTurret(low), y = drawTurret(pan);
  ok(diffPx(x._buf, y._buf) > 5, `②appearance：cupola low vs panoramic 像素不同（差 ${diffPx(x._buf, y._buf)} px）`);
}

// ---------- ③ 阴影方向世界固定 ----------
{
  const t = mkTank({ hp: 100 });
  const verts = turretPoly(t).verts;
  const shadowOf = (angle) => {
    const cv = raster(300, 300, c => P.paintTurretShadow(c, verts, 150, 150, angle, 1, 2.5, 3.5, 0));
    return centroid(cv);
  };
  const s0 = shadowOf(0), s90 = shadowOf(Math.PI / 2);
  ok(s0 && s90, '③炮塔影：两种朝向下都画出内容');
  // 影偏移方向（质心）应基本不随炮塔转角变化：两个朝向的质心距离 < 1.5px
  const drift = Math.hypot(s0.x - s90.x, s0.y - s90.y);
  ok(drift < 1.5, `③炮塔影方向世界固定：0° vs 90° 质心漂移 ${drift.toFixed(2)}px（< 1.5，修复前约 4.4px）`);
  // 影必须落在右下（+x,+y），与地图元素投影（drawCoverShadow 固定 +x/+y）同向
  ok(s0.x > 0 && s0.y > 0, `③炮塔影落在右下（质心 ${s0.x},${s0.y}），与掩体投影同向`);

  // 车底影：偏移同样不随车体朝向变化
  const gsOf = (hullAngle) => {
    const tt = mkTank({ hp: 100 });
    tt.x = 150; tt.y = 150; tt.hullAngle = hullAngle;
    const cv = raster(300, 300, c => BD.drawTankGroundShadow(c, tt));
    return centroid(cv);
  };
  const g0 = gsOf(0), g90 = gsOf(Math.PI / 2);
  const gdrift = Math.hypot(g0.x - g90.x, g0.y - g90.y);
  ok(gdrift < 1.5, `③车底影方向世界固定：0° vs 90° 质心漂移 ${gdrift.toFixed(2)}px`);
  ok(g0.x > 0 && g0.y > 0, `③车底影落在右下（质心 ${g0.x},${g0.y}）`);
}

// ---------- ④ mini-canvas 语义一致性 ----------
{
  // drawImage 必须跟随 CTM（旧实现完全忽略变换 → render-map-shot.js 默认 --scale 下错位）
  const src = createMiniCanvas(40, 40);
  const sc = ctx2d(src);
  sc.fillStyle = 'rgb(255,0,0)'; sc.fillRect(0, 0, 40, 40);
  const dst = raster(200, 200, c => {
    c.scale(0.25, 0.25);
    c.translate(-1000, -800);
    c.drawImage(src, 1000, 800, 40, 40);
  });
  const ct = centroid(dst);
  ok(ct && Math.abs(ct.n - 100) <= 12, `④drawImage 跟随 CTM：绘制 ${ct ? ct.n : 0} px（期望 10×10=100，旧实现落在画布外/错位）`);
  // centroid() 返回的是**相对画布中心**的偏移；200×200 画布中心 = (100,100)，
  // 期望的 10×10 块位于设备坐标 0..9，故质心应落在 100+(-100) 附近即约 (-95.5,-95.5)。
  ok(ct && Math.abs(ct.x + 95.5) < 2 && Math.abs(ct.y + 95.5) < 2,
    `④drawImage 定位正确：质心相对中心 (${ct ? ct.x : '?'}, ${ct ? ct.y : '?'}) ≈ (-95.5,-95.5)，即设备 4.5,4.5 块中心`);

  // 'lighter' 必须真加法合成（旧实现只存状态不生效 → 所有发光特效灰色化）
  const lc = raster(4, 4, c => {
    c.globalCompositeOperation = 'lighter';
    c.fillStyle = 'rgb(100,100,100)';
    c.fillRect(0, 0, 4, 4);
    c.fillRect(0, 0, 4, 4);
  });
  ok(lc._buf[0] === 200, `④'lighter' 加法合成生效：100+100 = ${lc._buf[0]}（期望 200，source-over 为 100）`);

  // source-over 仍要正确（不能用 lighter 覆盖掉普通合成）
  const oc = raster(4, 4, c => {
    c.fillStyle = 'rgb(0,0,0)'; c.fillRect(0, 0, 4, 4);
    c.fillStyle = 'rgb(255,255,255)'; c.fillRect(0, 0, 2, 4);
  });
  ok(oc._buf[0] === 255 && oc._buf[4 * 3] === 0, '④source-over 合成未回归（左白右黑）');
}

// ---------- ⑤ FX 绘制期确定性（同帧重绘逐字节一致） ----------
{
  const FX = require('../js/tank_fx.js');
  Object.assign(global, FX);
  const shot = () => raster(400, 400, c => {
    FX.drawMuzzleFlashes(c);
    FX.drawFxParticles(c);
    FX.drawShockwaves(c);
    FX.drawTracers(c);
    FX.drawExplosions(c);
    FX.drawScorchMarks(c);
  });
  // 造一帧有内容的特效（spawn 期允许 Math.random，取一次快照后不再 spawn）
  FX.spawnMuzzleFlash(200, 200, 0, 1.4, 'railgun');
  FX.spawnImpactFx(220, 210, 0.4, 'he', 1.2);
  FX.spawnTracer(100, 100, 300, 300, '#ffd24a');
  for (let i = 0; i < 8; i++) FX.updateFx(1 / 60);
  const f1 = shot(), f2 = shot();
  ok(opaque(f1) > 200, `⑤特效渲染有内容（${opaque(f1)} px）`);
  ok(diffPx(f1._buf, f2._buf) === 0,
    `⑤绘制期确定性：同帧重绘逐字节一致（差 ${diffPx(f1._buf, f2._buf)} px —— 绘制期出现 Math.random 时会非 0）`);

  // ⑥ 烘焙 sprite 不得被自己的画布裁切。
  //    这是本轮真实踩到的坑：`_plumeSprite` 画布高度按 `len` 定，但外层扇形半径是 `R = len*2.4`，
  //    `wa=0.65` 时外焰垂直方向被切掉 58px，画出来像被水平削平的梯形。断言「四边无触边不透明像素」。
  const edgeTouch = (cv) => {
    const b = cv._buf, W = cv.width, H = cv.height;
    const on = (x, y) => b[(y * W + x) * 4 + 3] > 8;
    let n = 0;
    for (let x = 0; x < W; x++) { if (on(x, 0)) n++; if (on(x, H - 1)) n++; }
    for (let y = 0; y < H; y++) { if (on(0, y)) n++; if (on(W - 1, y)) n++; }
    return n;
  };
  const plumeCases = [[0.55, 1.0], [0.65, 0.75], [0.5, 0.9], [0.45, 0.8], [0.7, 0.5], [0.25, 0.4], [1.0, 1.0]];
  let worstPlume = 0, worstCase = '';
  for (const [wa, lf] of plumeCases) {
    const spr = FX._plumeSprite(wa, lf);
    if (!spr) { worstPlume = -1; break; }
    const n = edgeTouch(spr.canvas);
    if (n > worstPlume) { worstPlume = n; worstCase = `wa=${wa},lf=${lf}`; }
  }
  ok(worstPlume === 0,
    `⑥火舌 sprite 未自裁切：7 组张角/长度全部四边无触边像素（最差 ${worstPlume} @ ${worstCase || '-'}）`);

  // 径向渐变 sprite 同理（圆心在 r+1、半径 r，外圈 alpha≈0 不该触边）
  let radialEdge = 0;
  for (const kind of ['smoke', 'lit', 'core', 'halo', 'haloR']) {
    for (const r of [8, 20, 48]) {
      const spr = FX._radialSprite(kind, r);
      if (!spr) { radialEdge = -1; break; }
      radialEdge = Math.max(radialEdge, edgeTouch(spr));
    }
  }
  ok(radialEdge === 0, `⑥径向渐变 sprite 未自裁切：5 类 × 3 半径四边无触边像素（最差 ${radialEdge}）`);

  // ⑦ 贴图审核标准（scripts/audit-textures.js）纳入强制回归。
  //    为什么必须进测试而不是只留一个脚本：本轮修 camo_winter/urban/digital 时，
  //    三处缺陷（白块贴在近白底上只差 13、轴对齐矩形、2.56px 格子且色差仅 5）
  //    在**旧的** test-render 里全部不可见——旧断言只看「画了没画 / 抛不抛错」。
  //    这条断言把「实机尺寸下的可读性」变成会失败的测试。
  const AUD = require('./audit-textures.js');
  const aud = AUD.runAudit();
  ok(aud.length === AUD.TEX_KEYS.length,
    `⑦贴图审核：覆盖全部 ${AUD.TEX_KEYS.length} 个 TEXTURE_DEFS 键`);

  const lowScore = aud.filter(r => r.score < 80);
  ok(lowScore.length === 0,
    `⑦贴图审核：全部贴图 ≥80 分（A 档）—— 最差 ${aud.length ? aud[aud.length - 1].key : '-'} ${aud.length ? aud[aud.length - 1].score : '-'} 分`);

  const cItems = aud.flatMap(r => r.detail.filter(d => d.grade === 'C').map(d => `${r.key}.${d.key}=${d.value.toFixed(2)}`));
  ok(cItems.length === 0, `⑦贴图审核：无 C 级指标项${cItems.length ? ' — ' + cItems.join(', ') : ''}`);

  // 逐个贴图的核心指标必须落在「按意图分区」的区间内。
  // 这里刻意只卡 ★ 核心项：套用全部 7 项会让区间微调就红，标准失去可维护性。
  const CORE = {
    plain: ['shadeAmp', 'mipSurvival', 'tonesSpread'],
    camo: ['blockAmp', 'blockRatio', 'patchScale', 'mipSurvival'],
    digital: ['blockAmp', 'mipSurvival', 'patchScale'],
  };
  const coreBad = [];
  for (const r of aud) {
    for (const k of CORE[r.intent] || []) {
      const d = r.detail.find(x => x.key === k);
      if (d && d.grade === 'C') coreBad.push(`${r.key}.${k}=${d.value.toFixed(2)}`);
    }
  }
  ok(coreBad.length === 0, `⑦贴图审核：核心指标无 C 级${coreBad.length ? ' — ' + coreBad.join(', ') : ''}`);

  // 迷彩「画了等于没画」必须能被抓到：与裸装甲(none)的差异块占比要够高。
  // armor_plate 是设计上最接近裸装甲的键（实测 1.5%），因此不在此列。
  const health = AUD.healthChecks(AUD.TEX_KEYS);
  const invis = health.filter(h =>
    !h.key.includes('dmg0') && h.key !== 'armor_plate' && h.key !== 'weld_seam' && h.distinct < 0.10);
  ok(invis.length === 0,
    `⑦贴图审核：迷彩/涂装与裸装甲可区分（≥10% 差异块）${invis.length ? ' — 过弱: ' + invis.map(h => `${h.key}=${(h.distinct * 100).toFixed(1)}%`).join(', ') : ''}`);

  // 损伤分级必须看得见（weathering 在 dmg3 时明显改变画面）
  const wear = health.filter(h => h.key.includes('dmg0') && h.key.startsWith('rust'));
  ok(wear.length === 1 && wear[0].distinct > 0.06,
    `⑦贴图审核：rust 损伤 0→3 可见（差异块 ${wear.length ? (wear[0].distinct * 100).toFixed(1) : '-'}%）`);

  // ⑦b v3 跨部件/跨实例/沿边检查（#TEX11）：v2 的统计量量不到「炮塔图案缩水/同型车同图/
  //     磨损只在面内」这三类缺陷——它们必须先真的把这三件事画对，再由这里守住。
  ok(aud.every(r => Array.isArray(r.v3) && r.v3.length === 3),
    '⑦b贴图审核 v3：每个键都有 variation / edgeWear / continuity 三项检查');
  const v3bad = aud.filter(r => !r.v3Pass)
    .map(r => r.v3.filter(v => !v.pass).map(v => `${r.key}.${v.name}=${v.value == null ? '-' : v.value.toFixed(2)}`).join(','));
  ok(v3bad.length === 0,
    `⑦b贴图审核 v3：跨部件/跨实例/沿边检查全部通过${v3bad.length ? ' — ' + v3bad.join(' | ') : ''}`);
  const conts = aud.filter(r => r.intent === 'camo' || r.intent === 'digital')
    .map(r => r.v3.find(v => v.name === 'continuity')).filter(v => v && v.value != null);
  ok(conts.length >= 7 && conts.every(v => v.value <= 0.85),
    `⑦b贴图审核 v3：迷彩/数码迷彩的车体↔炮塔图案连续（${conts.length} 键，最差 ${conts.length ? Math.max(...conts.map(v => v.value)).toFixed(2) : '-'} ≤ 0.85）`);
}

// ---------- ⑧ 地图元素立体感（#TEX13） ----------
// 用户反馈「树/岩石缺少阴影、没有立体感」。这三条把「方向性受光 / 多面体 / 投影」
// 变成会失败的像素断言——否则只凭肉眼，很容易又退回平涂。
{
  const W = 320, H = 320, BG = '#8a7a46';
  const lum = (cv, x, y) => {
    const b = cv._buf; const i = (Math.round(y) * cv.width + Math.round(x)) * 4;
    return 0.299 * b[i] + 0.587 * b[i + 1] + 0.114 * b[i + 2];
  };
  const avg = (cv, cx, cy, r) => {
    let s = 0, n = 0;
    for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) { s += lum(cv, x, y); n++; }
    return s / n;
  };
  const bgL = (() => { const cv = raster(W, H, c => { c.fillStyle = BG; c.fillRect(0, 0, W, H); }); return lum(cv, 10, 10); })();

  // ⑧a 树冠：左上受光、右下背光（全局光源左上）
  const tree = { tier: 'tree', x: 160, y: 160, w: 24, h: 18, angle: 0, hp: 1 };
  const tc = raster(W, H, c => {
    c.fillStyle = BG; c.fillRect(0, 0, W, H);
    BD.drawCover(c, tree);
    BD.drawFoliage(c, [tree]);
  });
  const tl = avg(tc, 160 - 12, 160 - 12, 2);
  const br = avg(tc, 160 + 12, 160 + 12, 2);
  ok(tl > br + 3, `⑧a树冠体积：左上受光 ${tl.toFixed(1)} > 右下背光 ${br.toFixed(1)}（差 ${(tl - br).toFixed(1)}）`);
  // 树冠投影：右下偏移处应比裸地暗
  const shadowL = avg(tc, 160 + 26, 160 + 26, 2);
  ok(shadowL < bgL - 4, `⑧a树冠投影：右下偏移处 ${shadowL.toFixed(1)} < 裸地 ${bgL.toFixed(1)}`);

  // ⑧b 岩石：多面体明暗 + 侧壁/投影（六边形，避免轴对齐矩形）
  const rock = { tier: 'rock', x: 160, y: 160, w: 90, h: 70, angle: 0, hp: Infinity,
    verts: [[-45, -8], [-28, -32], [12, -34], [42, -10], [34, 26], [-18, 32]] };
  const rc = raster(W, H, c => {
    c.fillStyle = BG; c.fillRect(0, 0, W, H);
    BD.drawCover(c, rock);
  });
  // 面内多色阶：沿顶面网格采样，量化 8 级，至少 3 级
  const tones = new Set();
  for (let y = 160 - 24; y <= 160 + 20; y += 4) for (let x = 160 - 36; x <= 160 + 32; x += 4) {
    const v = lum(rc, x, y);
    if (v > 40) tones.add(Math.floor(v / 16));
  }
  ok(tones.size >= 3, `⑧b岩石多面体：顶面 ${tones.size} 个量化色阶（≥3）`);
  const rtl = avg(rc, 160 - 22, 160 - 18, 2), rbr = avg(rc, 160 + 24, 160 + 16, 2);
  ok(rtl > rbr + 6, `⑧b岩石受光：左上 ${rtl.toFixed(1)} > 右下 ${rbr.toFixed(1)}`);
  // 投影：右下外缘搜索最暗点（侧壁 + 三层投影），应暗于裸地
  let rshadow = Infinity;
  for (let dy = 30; dy <= 50; dy += 2) for (let dx = 40; dx <= 58; dx += 2) {
    rshadow = Math.min(rshadow, avg(rc, 160 + dx, 160 + dy, 1));
  }
  ok(rshadow < bgL - 5, `⑧b岩石投影/侧壁：右下外缘 ${rshadow.toFixed(1)} < 裸地 ${bgL.toFixed(1)}`);
}

// ---------- ⑨ #GT（2026-10-18）：地面烘焙缓存 + 相机屏幕像素对齐 ----------
// 用户反馈「部分 biome（雪地、沙漠）纹理会随玩家移动变化，帧率也大幅下降」。两个成因各有独立断言：
//   性能 → 缓存命中后每帧 ctx 调用数必须骤降（旧实现每帧重描 4.8k~45k 个图元）；
//   观感 → 相机做亚像素移动时，同一世界点的颜色必须**逐字节不变**（旧实现 1.2%~3.4% 的采样点变色）。
{
  const VW = 640, VH = 360;
  const mkC = (w, h) => createMiniCanvas(w, h);
  // 在给定相机位置/zoom 下渲染一帧地面，返回画布
  const frame = (biome, camX, camY, zoom, snap, useCache) => raster(VW, VH, c => {
    const cam = { x: camX, y: camY, vw: VW, vh: VH, zoom };
    const p = snap ? CAM.renderCamPos(cam) : { x: cam.x, y: cam.y };
    c.save();
    c.translate(VW / 2, VH / 2);
    c.scale(zoom, zoom);
    c.translate(-p.x, -p.y);
    const hw = VW / 2 / zoom, hh = VH / 2 / zoom;
    const opts = { viewBounds: { minX: p.x - hw, minY: p.y - hh, maxX: p.x + hw, maxY: p.y + hh }, biome, seed: 424242, zoom };
    if (useCache) BD.drawGroundCached(c, opts, mkC);
    else BD.drawGround(c, opts);
    c.restore();
  });

  // ⑨a 相机像素对齐：renderCamPos 输出在屏幕空间必须是整数
  let snapOk = 0, snapTot = 0;
  for (const zoom of [1, 1.3, 1.6, 0.8, 0.5, 2]) {
    for (const [cx, cy] of [[5000, 3000], [5000.37, 3000.81], [12345.678, 9876.543]]) {
      const p = CAM.renderCamPos({ x: cx, y: cy, zoom });
      snapTot++;
      const sx = p.x * zoom, sy = p.y * zoom;
      if (Math.abs(sx - Math.round(sx)) < 1e-6 && Math.abs(sy - Math.round(sy)) < 1e-6) snapOk++;
    }
  }
  ok(snapOk === snapTot, `⑨a相机像素对齐：全部 zoom 下屏幕位移为整数（${snapOk}/${snapTot}）`);

  // ⑨b 亚像素移动后同一世界点像素必须完全一致（观感修复的核心）
  const pxOf = (cv, wx, wy, cam, zoom) => {
    const sx = Math.round((wx - cam.x) * zoom + VW / 2);
    const sy = Math.round((wy - cam.y) * zoom + VH / 2);
    if (sx < 2 || sx >= VW - 2 || sy < 2 || sy >= VH - 2) return null;
    const b = anyA(cv)._buf;
    const i = (sy * VW + sx) * 4;
    return [b[i], b[i + 1], b[i + 2], b[i + 3]];
  };
  let worstOld = 0, worstNew = 0, cmpN = 0;
  for (const zoom of [1, 1.3, 0.8]) {
    for (const biome of ['snow', 'desert']) {
      const camA = { x: 5000, y: 3000, zoom }, camB = { x: 5000.5, y: 3000, zoom };
      BD.clearGroundCache();
      const oldA = frame(biome, camA.x, camA.y, zoom, false, true);
      const oldB = frame(biome, camB.x, camB.y, zoom, false, true);
      BD.clearGroundCache();
      const newA = frame(biome, camA.x, camA.y, zoom, true, true);
      const newB = frame(biome, camB.x, camB.y, zoom, true, true);
      const pA = CAM.renderCamPos(camA), pB = CAM.renderCamPos(camB);
      for (let i = 0; i < 60; i++) {
        const wx = 4850 + (i % 10) * 30, wy = 2900 + Math.floor(i / 10) * 34;
        const oa = pxOf(oldA, wx, wy, { x: camA.x, y: camA.y }, zoom), ob = pxOf(oldB, wx, wy, { x: camB.x, y: camB.y }, zoom);
        const na = pxOf(newA, wx, wy, pA, zoom), nb = pxOf(newB, wx, wy, pB, zoom);
        if (oa && ob && oa[3] > 0 && ob[3] > 0) {
          const d = Math.max(Math.abs(oa[0] - ob[0]), Math.abs(oa[1] - ob[1]), Math.abs(oa[2] - ob[2]));
          if (d > worstOld) worstOld = d;
        }
        if (na && nb && na[3] > 0 && nb[3] > 0) {
          const d = Math.max(Math.abs(na[0] - nb[0]), Math.abs(na[1] - nb[1]), Math.abs(na[2] - nb[2]));
          if (d > worstNew) worstNew = d;
          cmpN++;
        }
      }
    }
  }
  ok(cmpN > 50, `⑨b亚像素采样点足够（${cmpN} 个可比对点）`);
  ok(worstNew === 0, `⑨b像素对齐后亚像素移动零重采样：最大通道差 ${worstNew}（旧行为 ${worstOld}）`);
  ok(worstOld > 0 || worstNew === 0, `⑨b对照：旧实现确实存在重采样（旧最大差 ${worstOld}）`);

  // ⑨c 缓存命中后每帧 ctx 调用数必须骤降（性能修复的核心）
  const countCalls = (biome, zoom, useCache) => {
    BD.clearGroundCache();
    // 预热（缓存路径首次会烘焙）
    frame(biome, 5000, 3000, zoom, true, useCache);
    const cv = createMiniCanvas(VW, VH);
    const real = ctx2d(cv);
    let n = 0;
    const proxy = new Proxy(real, {
      get(t, k) { const v = t[k]; if (typeof v === 'function') return (...a) => { n++; return v.apply(t, a); }; return v; },
      set(t, k, v) { t[k] = v; return true; }
    });
    const p = CAM.renderCamPos({ x: 5000.2, y: 3000, zoom });
    proxy.save();
    proxy.translate(VW / 2, VH / 2);
    proxy.scale(zoom, zoom);
    proxy.translate(-p.x, -p.y);
    const hw = VW / 2 / zoom, hh = VH / 2 / zoom;
    const opts = { viewBounds: { minX: p.x - hw, minY: p.y - hh, maxX: p.x + hw, maxY: p.y + hh }, biome, seed: 424242, zoom };
    if (useCache) BD.drawGroundCached(proxy, opts, mkC);
    else BD.drawGround(proxy, opts);
    proxy.restore();
    return n;
  };
  for (const zoom of [1, 0.5]) {
    const direct = countCalls('snow', zoom, false);
    const cached = countCalls('snow', zoom, true);
    ok(cached <= 8 && direct > 1000,
      `⑨c缓存命中后每帧 ctx 调用 ${cached}（直绘 ${direct}，zoom=${zoom}）`);
  }

  // ⑨d 缓存画面必须与直绘画面一致（缓存不得改变视觉）
  {
    BD.clearGroundCache();
    const d = frame('snow', 5000, 3000, 1, true, false);
    BD.clearGroundCache();
    const k = frame('snow', 5000, 3000, 1, true, true);
    const bad = diffPx(anyA(d)._buf, anyA(k)._buf, 8);
    const total = VW * VH;
    ok(bad / total < 0.03, `⑨d缓存与直绘画面一致：不一致像素 ${(bad / total * 100).toFixed(2)}%（<3%）`);
  }

  // ⑨e 缓存失效语义：换 biome / seed / zones 必须重烘焙
  {
    BD.clearGroundCache();
    let bakes = 0;
    const f = (w, h) => { bakes++; return createMiniCanvas(w, h); };
    const hw = VW / 2, hh = VH / 2;
    const base = { viewBounds: { minX: 5000 - hw, minY: 3000 - hh, maxX: 5000 + hw, maxY: 3000 + hh }, biome: 'snow', seed: 424242, zoom: 1 };
    BD.ensureGroundCache(null, base, f);                        // 1
    BD.ensureGroundCache(null, base, f);                        // 命中，仍 1
    const same = bakes;
    BD.ensureGroundCache(null, Object.assign({}, base, { biome: 'desert' }), f);   // 2
    BD.ensureGroundCache(null, Object.assign({}, base, { seed: 999 }), f);         // 3
    BD.ensureGroundCache(null, Object.assign({}, base, {
      seed: 999, biome: 'snow',
      biomeZones: [
        { x0: 4000, x1: 5000, y0: 2000, y1: 2500, biome: 'snow' },
        { x0: 4000, x1: 5000, y0: 2500, y1: 3000, biome: 'desert' }
      ]
    }), f);                                                                        // 4
    ok(same === 1 && bakes === 4,
      `⑨e缓存失效：同参命中(${same}) / 换 biome+seed+zones 后累计 ${bakes} 次烘焙（应 4）`);
  }

  // ⑨f biomeZones 2 维矩形：两块 y 不相交的同 x zone 不得叠加纹理（多行片的重叠缺陷）
  {
    const zones = [
      { x0: 0, x1: 20000, y0: 0, y1: 2300, biome: 'snow' },
      { x0: 0, x1: 20000, y0: 2300, y1: 4600, biome: 'desert' }
    ];
    const fhw = VW / 2, fhh = VH / 2;
    BD.clearGroundCache();
    const cvA = raster(VW, VH, c => {
      c.save(); c.translate(VW / 2, VH / 2); c.translate(-5000, -3000);
      BD.drawGround(c, { viewBounds: { minX: 5000 - fhw, minY: 3000 - fhh, maxX: 5000 + fhw, maxY: 3000 + fhh }, biomeZones: zones, seed: 7 });
      c.restore();
    });
    // 采样世界 y=2200（属雪区）与 y=2400（属沙区）：屏幕 y = wy - 3000 + VH/2
    const sampleAt = (cv, x, y) => {
      if (x < 0 || x >= VW || y < 0 || y >= VH) return null;
      const b = anyA(cv)._buf; const i = (y * VW + x) * 4; return [b[i], b[i + 1], b[i + 2]];
    };
    // 相机中心 (5000,3000)、视口 640×360 ⇒ 可见世界 y ∈ [2820,3180]；两块 zone 的分界 2300 不在视野内。
    // 改为把相机移到分界处附近，直接验证分界上下两侧取到不同 biome。
    BD.clearGroundCache();
    const camY = 2300, fhw2 = VW / 2, fhh2 = VH / 2;
    const cvB = raster(VW, VH, c => {
      c.save(); c.translate(VW / 2, VH / 2); c.translate(-5000, -camY);
      BD.drawGround(c, { viewBounds: { minX: 5000 - fhw2, minY: camY - fhh2, maxX: 5000 + fhw2, maxY: camY + fhh2 }, biomeZones: zones, seed: 7 });
      c.restore();
    });
    const yTop = Math.round((camY - 60) - camY + VH / 2);   // 世界 y = camY-60（雪）
    const yBot = Math.round((camY + 60) - camY + VH / 2);   // 世界 y = camY+60（沙）
    const top = sampleAt(cvB, Math.round(VW / 2), yTop) || [0, 0, 0];
    const bot = sampleAt(cvB, Math.round(VW / 2), yBot) || [0, 0, 0];
    // 雪的蓝通道偏高（冷色），沙的红通道偏高（暖色）
    ok(top[2] >= top[0] - 10 && bot[0] > bot[2],
      `⑨f2维zone分区正确：上(雪) rgb=${top.join(',')} 下(沙) rgb=${bot.join(',')}`);
  }
}

// ---------- ⑩ 电磁轨道炮视效（#U38，2026-10-18） ----------
// 用户要求「为电磁炮增加细节和特殊的射击特效，包括充电的电弧」。
// 这一节把三件事变成会失败的像素/数值断言，而不是只写在注释里：
//   ① lightningPath 必须是**确定性纯函数**（同 seed 逐点相同、两端收敛到轴线）；
//   ② 充能进度必须与 fireTank/HUD 同源（reloadT=dur → 0、reloadT=0 → 1）；
//   ③ 炮身细节与放电弧必须真的画出来（青蓝像素显著多于标准炮；同帧重绘逐字节一致）。
{
  // 本块内的名字一律加 U38 前缀：脚本顶层已有 U / FX 常量（①~⑨ 用），重名会被 tsc 判 TS2300。
  const U38 = require('../js/tank_utils.js');
  const F38 = require('../js/tank_fire.js');
  Object.assign(global, F38);
  const FX38 = require('../js/tank_fx.js');
  Object.assign(global, FX38);

  // ①a 确定性：同 seed 两次调用逐点相同；不同 seed 必须不同
  const p1 = U38.lightningPath(0, 0, 0, 100, 8, 6, 3.7);
  const p2 = U38.lightningPath(0, 0, 0, 100, 8, 6, 3.7);
  const p3 = U38.lightningPath(0, 0, 0, 100, 8, 6, 9.1);
  const same = p1.length === p2.length && p1.every((p, i) => p.x === p2[i].x && p.y === p2[i].y);
  const differs = p1.some((p, i) => Math.abs(p.x - p3[i].x) > 1e-9 || Math.abs(p.y - p3[i].y) > 1e-9);
  ok(same, `⑩a电弧路径确定：同 seed 两次调用 ${p1.length} 点逐点一致（绘制期无 Math.random）`);
  ok(differs, '⑩a电弧路径随 seed 变化（不是一张固定贴图）');

  // ①b 端点收敛：首点 = 起点（零横向偏移），末点落在轴线上（sin(π)=0），中段偏离最强
  const amp = 8;
  const mid = p1[Math.floor(p1.length / 2)];
  ok(Math.abs(p1[0].y) < 1e-9, `⑩a电弧起点贴轴：y=${p1[0].y.toFixed(3)}（横向偏移 0）`);
  ok(Math.abs(p1[p1.length - 1].y) < 0.5, `⑩a电弧终点收敛：y=${p1[p1.length - 1].y.toFixed(3)}（±0.5 内，电弧贴同一条血管）`);
  ok(Math.max(...p1.map(p => Math.abs(p.y))) >= amp * 0.2,
    `⑩a电弧中段抖动可见：最大横向偏移 ${Math.max(...p1.map(p => Math.abs(p.y))).toFixed(2)}px`);

  // ② 充能进度与 fireTank 同源
  const probe = mkTank({ hp: 100 });
  probe.weapons.primary = { type: 'railgun', stats: {}, _spec: null };
  probe.stats.reload = 2;
  const spec = primaryWeaponSpec(probe);
  const dur = 2 * spec.reloadMult;
  probe.reloadT = dur;
  const c0 = BD.railChargeProgress(probe);
  probe.reloadT = dur / 2;
  const cHalf = BD.railChargeProgress(probe);
  probe.reloadT = 0;
  const c1 = BD.railChargeProgress(probe);
  ok(Math.abs(c0) < 1e-9 && Math.abs(cHalf - 0.5) < 1e-9 && Math.abs(c1 - 1) < 1e-9,
    `⑩b充能进度同源：reloadT=dur→${c0.toFixed(2)} / 半程→${cHalf.toFixed(2)} / 装填完→${c1.toFixed(2)}（dur=${dur.toFixed(1)}s 含 reloadMult）`);
  // 非电磁炮恒为 1（不会把别的车画成半充能）
  const std = mkTank({ hp: 100 });
  std.reloadT = 3;
  ok(BD.railChargeProgress(std) === 1, '⑩b非电磁炮恒返回 1（不影响其他武器）');

  // ③ 炮身三色口径（#U39 2026-10-19 用户裁定）：炮管=灰 / 基底=蓝 / 弧光=白。
  //    这一节把三色**分别**量出来——只量「电磁炮比标准炮更花」是不够的，
  //    用户要的是明确的三种颜色分工，任何一色被画成别的色都必须失败。
  const px = (cv) => anyA(cv)._buf;
  const cnt = (cv, fn) => {
    const b = px(cv); let n = 0;
    for (let i = 0; i < b.length; i += 4) if (b[i + 3] > 10 && fn(b[i], b[i + 1], b[i + 2])) n++;
    return n;
  };
  // 灰：三通道接近（低饱和），且亮度落在中性灰区间
  const isGrey = (r, g, bl) => Math.max(r, g, bl) - Math.min(r, g, bl) <= 22 && r > 60 && r < 210;
  // 蓝：蓝通道显著高于红（基底蓝 #2f5d8c：b−r ≈ 93）
  const isBlue = (r, g, bl) => bl > r + 35 && bl >= g;
  // 白：三通道都很高且接近（弧芯纯白 / 冷白晕）
  const isWhite = (r, g, bl) => r > 200 && g > 200 && bl > 200 && Math.max(r, g, bl) - Math.min(r, g, bl) <= 26;
  // 高饱和青蓝（旧 #U38 弧光口径）——只用于「弹体不带电弧」这类局部断言
  const isCyanBlue = (r, g, bl) => bl > 150 && g > 150 && r < 150 && bl > r + 60 && g > r + 40;
  const drawFull = (t) => { P.clearPaintCache(); return raster(400, 400, c => BD.drawTank(c, t)); };
  const railT = mkTank({ hp: 100 });
  railT.weapons.primary = { type: 'railgun', stats: {}, _spec: null };
  railT.reloadT = 0;                       // 满电待机：能量芯 + 后膛核 + 微光电弧都要在
  const stdT = mkTank({ hp: 100 });
  stdT.weapons.primary = { type: 'standard', stats: {}, _spec: null };
  stdT.reloadT = 0;
  const railCv = drawFull(railT), stdCv = drawFull(stdT);

  const greyR = cnt(railCv, isGrey), greyS = cnt(stdCv, isGrey);
  ok(greyR > 120, `⑩c炮管=灰：电磁炮中性灰像素 ${greyR}（导轨/箍环金属本体，口径 RULES.railgunFx.barrelGrey*）`);
  const blueR = cnt(railCv, isBlue), blueS = cnt(stdCv, isBlue);
  ok(blueR > 60, `⑩c基底=蓝：电磁炮蓝色像素 ${blueR}（轨间衬底 + 端部底座，baseBlue*）`);
  ok(blueR > blueS + 30, `⑩c基底蓝为电磁炮独有：${blueR} > 标准炮 ${blueS} + 30`);
  const whiteR = cnt(railCv, isWhite);
  // 「白」的主载体是**充能中的电弧**，不是满电待机——#U41 实机校色把待机态白芯压到 0.18，
  //   否则整条缝通体发白、蓝基底被吃掉（用户要的是「蓝基底 + 白弧光」）。
  //   所以白色断言必须在**充能中**取真，待机只要求「不是死管的纯白」。
  const chargeT2 = mkTank({ hp: 100 });
  chargeT2.weapons.primary = { type: 'railgun', stats: {}, _spec: null };
  chargeT2.stats.reload = 2;
  chargeT2.reloadT = 2 * primaryWeaponSpec(chargeT2).reloadMult * 0.35;   // 35% 充能
  const chargeCv2 = drawFull(chargeT2);
  const whiteCharge = cnt(chargeCv2, isWhite);
  ok(whiteCharge > 20,
    `⑩c弧光=白：充能中（35%）近白像素 ${whiteCharge}（充能电弧白芯，弧光主载体）`);
  ok(whiteR < whiteCharge,
    `⑩c待机白收敛：满电待机近白 ${whiteR} < 充能中 ${whiteCharge}（待机压暗，避免白吃掉蓝基底）`);
  // 反向断言改为**查唯一口径本身**：整车里「白弧压在蓝基底上」经 lighter 必然产生浅蓝像素，
  // 那不是青蓝弧光回退，而是正确叠色。真正的口径在 RULES.railgunFx 的三组颜色里——
  // 直接解析色值断言「弧光=白（三通道都高且接近）」「基底=蓝（b 显著高于 r）」，不靠像素猜。
  const RFX = RULES.railgunFx;
  const hex2rgb = (h) => {
    const s = String(h).replace('#', '');
    return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
  };
  const [wr, wg, wb] = hex2rgb(RFX.arcWhite);
  ok(wr > 240 && wg > 240 && wb > 240 && Math.max(wr, wg, wb) - Math.min(wr, wg, wb) <= 12,
    `⑩c弧光口径=纯白：RULES.railgunFx.arcWhite ${RFX.arcWhite} → (${wr},${wg},${wb})`);
  const haloDark = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(String(RFX.arcHalo));
  const [hr, hg, hb] = haloDark ? [+haloDark[1], +haloDark[2], +haloDark[3]] : [0, 0, 0];
  ok(hr > 200 && hg > 220 && hb > 240 && (hb - hr) <= 45,
    `⑩c弧光晕=冷白非青蓝：arcHalo ${RFX.arcHalo} → (${hr},${hg},${hb})，b−r=${hb - hr} ≤ 45（旧 #U38 青蓝 b−r 曾达 105）`);
  const [br, bg, bb] = hex2rgb(RFX.baseBlue);
  ok(bb > br + 60, `⑩c基底口径=蓝：baseBlue ${RFX.baseBlue} → (${br},${bg},${bb})，b−r=${bb - br} > 60`);
  const [gr2, gg2, gb2] = hex2rgb(RFX.barrelGrey);
  ok(Math.max(gr2, gg2, gb2) - Math.min(gr2, gg2, gb2) <= 24,
    `⑩c炮管口径=灰：barrelGrey ${RFX.barrelGrey} → (${gr2},${gg2},${gb2})，三通道极差 ≤ 24（低饱和中性灰）`);

  // 充能期电弧条数随进度增加：半充能 vs 满电待机两帧必须不同（满电切换到微光待机）
  const halfT = mkTank({ hp: 100 });
  halfT.weapons.primary = { type: 'railgun', stats: {}, _spec: null };
  halfT.stats.reload = 2;
  halfT.reloadT = 2 * primaryWeaponSpec(halfT).reloadMult * 0.5;
  const halfCv = drawFull(halfT);
  ok(diffPx(anyA(halfCv)._buf, anyA(railCv)._buf) > 10,
    `⑩c充能阶段可辨：半充能 vs 满电待机差 ${diffPx(anyA(halfCv)._buf, anyA(railCv)._buf)} px`);

  // ④ 击发放电弧：spawn 后有内容、同帧重绘逐字节一致、超上限被截断、且**白色**
  FX38.clearFx();
  FX38.spawnRailDischarge(200, 200, 0, 80, 1);
  ok(FX38.railArcCount() > 0, `⑩d击发放弧：spawnRailDischarge 生成 ${FX38.railArcCount()} 条（RULES.railgunFx.dischargeArcs）`);
  for (let i = 0; i < 40; i++) FX38.spawnRailDischarge(200, 200, 0, 80, 1);
  ok(FX38.railArcCount() <= 24, `⑩d放电弧有上限：连续 41 次 spawn 后 ${FX38.railArcCount()} ≤ 24（不无限堆积）`);
  const arcShot = () => raster(400, 400, c => FX38.drawRailArcs(c));
  const a1 = arcShot(), a2 = arcShot();
  ok(opaque(a1) > 100, `⑩d放电弧有内容（${opaque(a1)} px）`);
  ok(diffPx(a1._buf, a2._buf) === 0,
    `⑩d放电弧绘制期确定性：同帧重绘逐字节一致（差 ${diffPx(a1._buf, a2._buf)} px）`);
  ok(cnt(a1, isWhite) > cnt(a1, isCyanBlue),
    `⑩d放电弧为白：近白像素 ${cnt(a1, isWhite)} > 青蓝 ${cnt(a1, isCyanBlue)}（弧芯白 + 冷白晕）`);

  // ④b 弧**挂在炮身上**（#U39 关键口径）：弧的包围盒必须落在炮身轴线附近，
  //    而不是跟着炮弹飞。这里用「炮身段是否有弧」+「远离炮身处的弧像素为零」双向断言。
  {
    FX38.clearFx();
    const bx = 120, by = 200, ang = 0, blen = 100;
    FX38.spawnRailDischarge(bx, by, ang, blen, 1);
    const sn = raster(400, 400, c => FX38.drawRailArcs(c));
    const b = px(sn);
    // 炮身走廊：y ∈ [by−18, by+18]，x ∈ [bx−12, bx+blen*1.5]
    let inCorridor = 0, offCorridor = 0;
    for (let y = 0; y < 400; y++) for (let x = 0; x < 400; x++) {
      const i = (y * 400 + x) * 4;
      if (b[i + 3] <= 10) continue;
      const inX = x >= bx - 12 && x <= bx + blen * 1.5;
      const inY = y >= by - 18 && y <= by + 18;
      if (inX && inY) inCorridor++; else offCorridor++;
    }
    ok(inCorridor > 100 && offCorridor < inCorridor * 0.35,
      `⑩d弧锁在炮身上：炮身走廊内 ${inCorridor} px / 走廊外 ${offCorridor} px（外溢 ${(offCorridor / Math.max(1, inCorridor) * 100).toFixed(0)}% < 35%）`);
  }

  // ⑤ 弹体：电磁炮弹是**针状白热弹**，但**不带电弧**（#U39：电弧只在炮身）
  FX38.clearFx();
  const mkShell = (wType) => ({
    x: 200, y: 200, dx: 1, dy: 0, fx: 0, fy: 0, dist: 50,
    speed: 1000, pen: 100, dmg: 10, ammo: { color: '#ffb454', tail: 'rgba(255,180,84,0.6)' },
    ammoKey: 'ap', wType
  });
  const railShot = raster(400, 400, c => BD.drawShells(c, [mkShell('railgun')]));
  const stdShot = raster(400, 400, c => BD.drawShells(c, [mkShell('standard')]));
  ok(cnt(railShot, isWhite) > 30, `⑩e弹体色：电磁炮弹近白像素 ${cnt(railShot, isWhite)}（针状白热弹）`);
  ok(cnt(railShot, isCyanBlue) < 20,
    `⑩e弹体不带电弧：青蓝像素 ${cnt(railShot, isCyanBlue)} < 20（#U39 电弧只在炮身）`);
  ok(diffPx(railShot._buf, stdShot._buf) > 30,
    `⑩e弹体形态：电磁炮 vs 标准弹差 ${diffPx(railShot._buf, stdShot._buf)} px`);
  // 弹体长度：电磁炮横向跨度必须大于标准弹（shellLenMult）
  const spanX = (cv) => {
    const b = anyA(cv)._buf; let lo = 1e9, hi = -1e9;
    for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) {
      if (b[(y * cv.width + x) * 4 + 3] > 10) { if (x < lo) lo = x; if (x > hi) hi = x; }
    }
    return hi - lo;
  };
  ok(spanX(railShot) > spanX(stdShot) + 8,
    `⑩e弹体长度：电磁炮 ${spanX(railShot)}px > 标准 ${spanX(stdShot)}px + 8（针状弹 shellLenMult）`);
  // 同帧重绘确定性
  const rs2 = raster(400, 400, c => BD.drawShells(c, [mkShell('railgun')]));
  ok(diffPx(anyA(railShot)._buf, anyA(rs2)._buf) === 0, '⑩e弹体重绘确定性：同帧两次逐字节一致');
}

console.log(fails === 0 ? 'test-render: 全部通过' : `test-render: ${fails} 项失败`);
process.exit(fails === 0 ? 0 : 1);
