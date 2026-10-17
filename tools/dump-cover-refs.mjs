#!/usr/bin/env node
// dump-cover-refs.mjs — 从**运行时烘焙代码**导出图片通道的尺寸/锚点基准表。
//
// 为什么需要它：`assets/<key>.png` 走的是 `drawAssetSprite` 的图片通道——
//   ctx.drawImage(img, x - ax*sx, y - ay*sy, img.width*sx, img.height*sy)，sx = w/def.w
// 即「图片像素 = 世界像素」，锚点 (ax, ay) 是**图片内**坐标。程序化通道则由
// `bakeAssetCanvas` 先按内容包围盒裁画布、再把锚点定位在内容包围盒内。
// 两套口径要对齐，图片就必须是「内容包围盒尺寸」而不是 `ASSET_DEFS.w/h`（那是 bake
// 的**输入**尺寸）；tree 的内容实际 30×30、tree_canopy 58×58，按 24×18 / 78×78 出图
// 会整体缩放错位。本脚本把真实基准（画布宽高 + 锚点）导出为
// `tools/cover-refs.json`，供 scripts/prepare_covers.py 与 covers-anchor-check.py 消费。
//
// 用法：
//   node tools/dump-cover-refs.mjs            # 写 tools/cover-refs.json
//   node tools/dump-cover-refs.mjs --check    # 只校验现有文件是否与代码一致（CI 用）
'use strict';

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'tools', 'cover-refs.json');

// ---- 与 Node 测试同款 shims：让 tank_assets 的离屏烘焙可在无 DOM 环境跑 ----
const { createMiniCanvas } = await import('../scripts/lib/mini-canvas.js');
globalThis.document = { createElement: t => (t === 'canvas' ? createMiniCanvas(32, 32) : null) };
globalThis.Image = function () { this.src = ''; };
globalThis.performance = { now: () => 0 };
globalThis.RULES = (await import('../js/tank_rules.js')).default.RULES;
const U = (await import('../js/tank_utils.js')).default;
Object.assign(globalThis, U);
globalThis.TAU = U.TAU;
Object.assign(globalThis, (await import('../js/tank_geometry.js')).default);
Object.assign(globalThis, (await import('../js/tank_cover.js')).default);
const A = (await import('../js/tank_assets.js')).default;

const refs = { _note: '由 node tools/dump-cover-refs.mjs 生成，勿手改。单位：像素（1 世界px = 图片 1px）。', assets: {} };
for (const [key, def] of Object.entries(A.ASSET_DEFS)) {
  const base = A.bakeAssetCanvas(key, def.w, def.h, 'base');
  if (!base) continue;
  refs.assets[key] = {
    layer: 'base',
    bakeIn: [def.w, def.h],
    canvas: [base.canvas.width, base.canvas.height],
    anchor: [round2(base.ax), round2(base.ay)],
    centroid: centroidOf(base.canvas)
  };
  if (def.bakeCanopy) {
    const can = A.bakeAssetCanvas(key, def.w, def.h, 'canopy');
    if (can) {
      refs.assets[key + '_canopy'] = {
        layer: 'canopy',
        bakeIn: [def.w, def.h],
        canvas: [can.canvas.width, can.canvas.height],
        anchor: [round2(can.ax), round2(can.ay)],
        centroid: centroidOf(can.canvas)
      };
    }
  }
}

function round2(v) { return Math.round(v * 100) / 100; }

// 内容质心（alpha>0 像素的平均坐标）。图片通道产物的验收基准：
// 出图 → 缩放落盘后，质心应落在烘焙画布质心的同一相对位置。
function centroidOf(canvas) {
  const { width: W, height: H, _buf: b } = canvas;
  let sx = 0, sy = 0, n = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (b[(y * W + x) * 4 + 3] > 24) { sx += x; sy += y; n++; }
    }
  }
  return n ? [round2(sx / n), round2(sy / n)] : null;
}

const text = JSON.stringify(refs, null, 2) + '\n';
if (process.argv.includes('--check')) {
  const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  if (cur === text) { console.log('✓ tools/cover-refs.json 与烘焙代码一致'); process.exit(0); }
  console.error('✗ tools/cover-refs.json 与烘焙代码不一致 —— 重跑 node tools/dump-cover-refs.mjs');
  process.exit(1);
}
fs.writeFileSync(OUT, text);
console.log(`写入 ${path.relative(ROOT, OUT)}（${Object.keys(refs.assets).length} 项）`);
for (const [k, v] of Object.entries(refs.assets)) {
  console.log(`  ${k.padEnd(14)} canvas ${v.canvas.join('x').padEnd(7)} anchor (${v.anchor.join(', ')})` +
    ` centroid (${v.centroid ? v.centroid.join(', ') : '-'})`);
}
