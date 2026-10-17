// @ts-nocheck
// render-map-shot.js — Node 直出生图：地图生成算法 → 真实绘制代码 → PNG。
// 解决无浏览器环境下无法做视觉验收的问题：用 scripts/lib/mini-canvas.js 垫片
// 跑真实的 drawGround/drawCover/drawFoliage（含 tank_assets.js 离屏烘焙）。
//
// 用法：
//   node scripts/render-map-shot.js --seed 7 --focus river --out /tmp/river.png
//   node scripts/render-map-shot.js --seed 7 --focus road  --out /tmp/road.png [--scale 0.6]
//   node scripts/render-map-shot.js --seed 7 --focus all   --out /tmp/all.png  [--scale 0.25]
//
// focus:
//   river   — 裁剪到河流/水体包围盒（含支流，验证 #S1/#S12）
//   road    — 裁剪到道路包围盒（验证 #S11 边缘裁剪）
//   village — 裁剪到建筑群包围盒（验证 #S13）
//   all     — 全节点
// 输出 PNG 写入 --out（缺省 /tmp/map-shot-<seed>-<focus>.png）。
'use strict';
const path = require('path');
const fs = require('fs');
const P = path.resolve(__dirname, '..', 'js') + path.sep;

// ---------- 垫片先行（bake 流程需要 document） ----------
const { createMiniCanvas } = require('./lib/mini-canvas.js');
global.document = {
  createElement(tag) {
    if (tag === 'canvas') return createMiniCanvas(300, 150);
    return null;
  }
};
// Image 占位：永不触发 onload → assetImage 保持 null → 回退程序化 bake
global.Image = function () { this.src = ''; };
// performance 占位：水流纹理相位固定为 0（静态快照，确定性）
global.performance = { now: () => 0 };

// ---------- 游戏模块 ----------
const RULES_MOD = require(P + 'tank_rules.js');
global.RULES = RULES_MOD.RULES;
const U = require(P + 'tank_utils.js');
const G = require(P + 'tank_geometry.js');
Object.assign(global, U, G);
global.TAU = U.TAU;
const COV = require(P + 'tank_cover.js');
Object.assign(global, COV);
const NG = require(P + 'tank_nodegen.js');
Object.assign(global, NG);
const MAP = require(P + 'tank_map.js');
Object.assign(global, MAP);
const PAINT = require(P + 'tank_paint.js');
Object.assign(global, PAINT);
const ASSETS = require(P + 'tank_assets.js');
Object.assign(global, ASSETS);
const BD = require(P + 'tank_battledraw.js');
Object.assign(global, BD);

// ---------- CLI ----------
const args = process.argv.slice(2);
const opt = (k, d) => {
  const i = args.indexOf('--' + k);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const SEED = Number(opt('seed', '7'));
const FOCUS = opt('focus', 'all');
const SCALE = Number(opt('scale', FOCUS === 'all' ? '0.25' : '0.6'));
const NODE_IDX = Number(opt('node', '0'));
const OUT = opt('out', `/tmp/map-shot-${SEED}-${FOCUS}.png`);
const ENV = { viewport: { vw: 1920, vh: 1080 }, difficultyLevel: 0 };

// ---------- 生成 ----------
const run = MAP.generateRun(SEED, 2, ENV);
const node = run.nodes[NODE_IDX] || run.nodes[0];
const W = node.w, H = node.h;
const covers = (node.covers || []).filter(c => c.hp !== 0);
console.log(`seed=${SEED} node=${node.index} ${W}x${H} covers=${covers.length}`);

// ---------- 取景 ----------
function bboxOf(list, pad) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const c of list) {
    const r = Math.max(c.w || 0, c.h || 0) / 2 + pad;
    x0 = Math.min(x0, c.x - r); y0 = Math.min(y0, c.y - r);
    x1 = Math.max(x1, c.x + r); y1 = Math.max(y1, c.y + r);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
let region;
if (FOCUS === 'river') {
  const rivers = covers.filter(c => c.tier === 'river' || c.tier === 'water');
  // 找含支流的区域：优先 groupId 数量 >1 的连通域，否则取最大河流包围盒
  region = rivers.length ? bboxOf(rivers, 260) : { x: 0, y: 0, w: W, h: H };
} else if (FOCUS === 'road') {
  const roads = covers.filter(c => c.tier === 'road');
  region = roads.length ? bboxOf(roads, 200) : { x: 0, y: 0, w: W, h: H };
} else if (FOCUS === 'village') {
  const blds = covers.filter(c => ['building', 'full', 'intact'].includes(c.tier));
  const trees = covers.filter(c => ['tree', 'bush'].includes(c.tier));
  const list = blds.length ? blds : trees;
  region = list.length ? bboxOf(list.slice(0, 40), 220) : { x: 0, y: 0, w: W, h: H };
} else {
  region = { x: 0, y: 0, w: W, h: H };
}
// 手动裁剪（--cx/--cy/--cw/--ch）优先
if (args.includes('--cx')) {
  region = {
    x: Number(opt('cx', '0')), y: Number(opt('cy', '0')),
    w: Number(opt('cw', '1200')), h: Number(opt('ch', '800'))
  };
}
// 裁剪到节点边界内
region.x = Math.max(0, region.x); region.y = Math.max(0, region.y);
region.w = Math.min(W - region.x, region.w); region.h = Math.min(H - region.y, region.h);
console.log(`focus=${FOCUS} region=${Math.round(region.x)},${Math.round(region.y)} ${Math.round(region.w)}x${Math.round(region.h)}`);

// ---------- 绘制 ----------
const cw = Math.max(64, Math.round(region.w * SCALE));
const ch = Math.max(64, Math.round(region.h * SCALE));
console.log(`canvas ${cw}x${ch} (scale=${SCALE})`);
const canvas = createMiniCanvas(cw, ch);
const ctx = canvas.getContext('2d');
ctx.save();
ctx.scale(SCALE, SCALE);
ctx.translate(-region.x, -region.y);

// 地面
BD.drawGround(ctx, {
  biome: node.biome || 'grass',
  seed: SEED * 1000 + node.index,
  viewBounds: { minX: region.x, minY: region.y, maxX: region.x + region.w, maxY: region.y + region.h }
});
// 地面层元素（道路/河流/泥地等先画）
const groundTiers = new Set(['road', 'river', 'water', 'mud', 'bridge']);
const ground = covers.filter(c => groundTiers.has(c.tier));
const above = covers.filter(c => !groundTiers.has(c.tier));
// #U8：河流按 groupId 合并整条链后单次描边（与 tank_mvp 绘制口径一致）
{
  const riverGroups = new Map();
  for (const c of ground) {
    if (c.tier === 'river' && c.groupId) {
      if (!riverGroups.has(c.groupId)) riverGroups.set(c.groupId, []);
      riverGroups.get(c.groupId).push(c);
    }
  }
  const handled = new Set();
  for (const segs of riverGroups.values()) {
    const ordered = BD.orderRiverSegs(segs);
    if (ordered.length >= 2) {
      try {
        if (BD.drawRiverChain(ctx, ordered, { fill: (RULES.coverTiers.river || {}).fill })) {
          for (const s of ordered) BD.drawCoverWaterStreak(ctx, s);
          for (const s of ordered) handled.add(s);
        }
      } catch (e) { console.error('drawRiverChain err', e.message); }
    }
  }
  for (const c of ground) {
    if (handled.has(c)) continue;
    try { BD.drawCover(ctx, c); } catch (e) { console.error('drawCover ground err', c.tier, e.message); }
  }
}
// 上层元素（建筑/树/沙包/岩石…）
for (const c of above) { try { BD.drawCover(ctx, c); } catch (e) { console.error('drawCover err', c.tier, e.message); } }
// 树冠层
try { BD.drawFoliage(ctx, covers); } catch (e) { console.error('drawFoliage err', e.message); }
ctx.restore();

fs.writeFileSync(OUT, canvas.toPNGBuffer());
console.log('wrote', OUT, fs.statSync(OUT).size, 'bytes');
