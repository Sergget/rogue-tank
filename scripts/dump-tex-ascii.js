// dump-tex-ascii.js — 把车体贴图按**实机 1:1 像素**打成 ASCII 灰度，用来在无图像输入时"看"贴图。
//
// 为什么需要：本会话模型不支持 image input（read_image 直接报错），
// 所以一切「看起来如何」必须退化成可读的数字矩阵。ASCII 是最接近肉眼的可读形式：
// 每字符 = 1 个实际显示像素（车体 73×38，正好能完整打印）。
//
// 字符梯度按亮度：'@'最暗 → ' '最亮（暗部厚重、亮部通透，符合俯视装甲观感）。
// 同时印出「颗粒剥离版」：对 3×3 中值滤波后的结果再打一次，
// 这样能一眼分辨「结构」与「噪点」——如果两版几乎一样，说明贴图只有噪点没有结构。
//
// Run: node scripts/dump-tex-ascii.js <textureKey> [damageLevel]
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

const RAMP = '@%#*+=-:. '; // 暗 → 亮
const key = process.argv[2] || 'camo_dunkelgelb';
const dmg = parseInt(process.argv[3] || '0', 10);

const t = /** @type {any} */ (G.spawnTank)({
  id: 'p', team: 'enemy', x: 200, y: 200, hullAngle: 0, turretAngle: 0,
  color: '#7ed957', heightClass: 'medium', texture: key
});
t.maxHp = 100; t.hp = 100; t.weatherSeed = 5;
P.clearPaintCache();
const spr = P.getCachedTankSprite(t.color, 'hull', G.hullPoly(t).verts, true, t.heightClass, key,
  { damageLevel: dmg, weatherSeed: 5 });
const cv = spr.canvas, W = cv.width, H = cv.height, b = cv._buf;

const lum = new Float64Array(W * H).fill(NaN);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const i = (y * W + x) * 4;
  if (b[i + 3] > 32) lum[y * W + x] = 0.299 * b[i] + 0.587 * b[i + 1] + 0.114 * b[i + 2];
}
// 3×3 中值滤波（剥离颗粒，保留结构）
const med = new Float64Array(W * H).fill(NaN);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const v = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const yy = y + dy, xx = x + dx;
    if (yy < 0 || yy >= H || xx < 0 || xx >= W) continue;
    const q = lum[yy * W + xx];
    if (!Number.isNaN(q)) v.push(q);
  }
  if (v.length) { v.sort((a, b2) => a - b2); med[y * W + x] = v[v.length >> 1]; }
}

function draw(arr, title) {
  let lo = 1e9, hi = -1e9;
  for (const v of arr) if (!Number.isNaN(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  console.log(`\n${title}   (亮度 ${lo.toFixed(0)}~${hi.toFixed(0)})`);
  for (let y = 0; y < H; y++) {
    let line = '';
    for (let x = 0; x < W; x++) {
      const v = arr[y * W + x];
      if (Number.isNaN(v)) { line += '.'; continue; }
      const u = (v - lo) / Math.max(1e-6, hi - lo);
      line += RAMP[Math.min(RAMP.length - 1, Math.max(0, Math.round(u * (RAMP.length - 1))))];
    }
    console.log(line);
  }
}

console.log(`贴图 ${key}  damageLevel=${dmg}   实机显示尺寸 ${W}x${H}（1 字符 = 1 显示像素）`);
draw(lum, '【原始】');
draw(med, '【3×3 中值滤波后 = 只剩结构】');

// 结构保留率：滤波前后局部对比度之比。接近 1 ⇒ 结构主导；接近 0 ⇒ 纯噪点。
function lc(arr) {
  let s = 0, n = 0;
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const c = arr[y * W + x];
    if (Number.isNaN(c)) continue;
    const r = arr[y * W + x + 1];
    if (Number.isNaN(r)) continue;
    s += (c - r) * (c - r); n++;
  }
  return n ? Math.sqrt(s / n) : 0;
}
const a = lc(lum), c2 = lc(med);
console.log(`\n结构保留率 = ${(c2 / Math.max(1e-9, a) * 100).toFixed(1)}%  （<35% ⇒ 绝大部分是对比度来自 1px 颗粒噪点）`);
