// dump-tex-ascii2.js — 公平版贴图可视化：百分位拉伸 + 量化色调分区图。
//
// 上一版把 20~202 全跨度压到 10 个字符，中调被挤成几乎一种字符，
// 会让人误判「迷彩看不出来」。真正该看的是**去掉边缘暗线后的中调结构**。
// 本版同时给三张图：
//   A. 百分位拉伸（p2~p98）灰度 —— 看清中调层次
//   B. 4 级量化色调图（按中调范围四等分）—— 数迷彩色块
//   C. 块级区域统计 —— 每种色调占比 + 最大连通块尺寸（判断「块」是否够大够整）
//
// Run: node scripts/dump-tex-ascii2.js <textureKey> [damageLevel]
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

const L = new Float64Array(W * H).fill(NaN);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const i = (y * W + x) * 4;
  if (b[i + 3] > 32) L[y * W + x] = 0.299 * b[i] + 0.587 * b[i + 1] + 0.114 * b[i + 2];
}
// 3×3 中值滤波剥离 1px 颗粒，只留结构
const M = new Float64Array(W * H).fill(NaN);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const v = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const yy = y + dy, xx = x + dx;
    if (yy < 0 || yy >= H || xx < 0 || xx >= W) continue;
    const q = L[yy * W + xx];
    if (!Number.isNaN(q)) v.push(q);
  }
  if (v.length) { v.sort((a, b2) => a - b2); M[y * W + x] = v[v.length >> 1]; }
}
function pct(arr, p) {
  const v = [];
  for (const q of arr) if (!Number.isNaN(q)) v.push(q);
  v.sort((a, b) => a - b);
  return v[Math.min(v.length - 1, Math.max(0, Math.floor(v.length * p)))];
}
const lo = pct(M, 0.02), hi = pct(M, 0.98);
const span = Math.max(1e-6, hi - lo);

// A. 百分位拉伸灰度
//    ⚠ RAMP 末位**不能用空格**：空格会被误读成「这里没有像素/贴图破洞」。
//    用 '.' 表示透明（真·无像素），最亮用 '~'，两者永不混淆。
const RAMP = '@%#*+=-:;~';
console.log(`\n贴图 ${key}  dmg=${dmg}  实机 ${W}x${H}（1 字符 = 1 显示像素）`);
console.log(`【A】中值滤波 + p2~p98 拉伸（${lo.toFixed(0)}~${hi.toFixed(0)}）`);
for (let y = 0; y < H; y++) {
  let line = '';
  for (let x = 0; x < W; x++) {
    const v = M[y * W + x];
    if (Number.isNaN(v)) { line += '.'; continue; }
    const u = Math.min(1, Math.max(0, (v - lo) / span));
    line += RAMP[Math.round(u * (RAMP.length - 1))];
  }
  console.log(line);
}

// B. 4 级量化（1234，1=最暗）
const LV = '1234';
const lab = new Int8Array(W * H).fill(-1);
for (let i = 0; i < M.length; i++) {
  if (Number.isNaN(M[i])) continue;
  const u = Math.min(0.9999, Math.max(0, (M[i] - lo) / span));
  lab[i] = Math.floor(u * 4);
}
console.log('\n【B】4 级色调分区（1=暗 4=亮）—— 迷彩色块应在此成片出现');
for (let y = 0; y < H; y++) {
  let line = '';
  for (let x = 0; x < W; x++) {
    const q = lab[y * W + x];
    line += q < 0 ? '.' : LV[q];
  }
  console.log(line);
}

// C. 区域统计：占比 + 最大连通块（4 邻接）
const counts = [0, 0, 0, 0];
for (const q of lab) if (q >= 0) counts[q]++;
const total = counts.reduce((a, c) => a + c, 0) || 1;
const bestBlk = [0, 0, 0, 0];
const seen = new Uint8Array(W * H);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const q = lab[y * W + x];
  if (q < 0 || seen[y * W + x]) continue;
  let n = 0;
  const st = [[x, y]];
  seen[y * W + x] = 1;
  while (st.length) {
    const [cx, cy] = st.pop();
    n++;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
      if (seen[ny * W + nx]) continue;
      if (lab[ny * W + nx] !== q) continue;
      seen[ny * W + nx] = 1;
      st.push([nx, ny]);
    }
  }
  if (n > bestBlk[q]) bestBlk[q] = n;
}
console.log('\n【C】色调占比 / 最大连通块（px，及占车体宽度比例）');
for (let q = 0; q < 4; q++) {
  console.log(`  色调${q + 1}: 占比 ${(counts[q] / total * 100).toFixed(1).padStart(5)}%   最大块 ${String(bestBlk[q]).padStart(4)} px  = ${(bestBlk[q] / W * 100).toFixed(1)}% 车宽`);
}
const used = counts.filter(c => c / total > 0.02).length;
console.log(`  ⇒ 有效色调数 ${used}（<2 说明贴图在实机尺寸读成单色）`);
