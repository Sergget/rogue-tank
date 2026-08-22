// P-06 M0 贴图资产层（js/tank_assets.js）冒烟测试 —— Node 侧，无需浏览器。
//   (a) ASSET_DEFS 覆盖 tree/bush/barricade/stump/rubble/soft 全部键（另含 fallen 残骸档），
//       每项 w/h>0、anchor 合法、bake 为函数；half/full 保持程序化（不进注册表）；
//   (b) 全部 bake / bakeCanopy 可在 mock ctx（只记录调用、方法全为 no-op）上调用不抛错，
//       且确实发出了绘制调用；
//   (c) 浏览器分支（Image 加载器 / 离屏烘焙缓存）以 typeof document 守卫：Node 下
//       require 安全、drawAsset/drawAssetCanopy/assetImage/getBakedSprite/bakeAssetCanvas
//       全部安全 no-op。
// Run: node scripts/test-assets.js
'use strict';

// ---- browser-global shims（同 test-covers.js 先例：Node 里把共享模块挂到 global）----
require('../js/tank_rules.js');
const RULES_MOD = require('../js/tank_rules.js');
const U = require('../js/tank_utils.js');
global.TAU = U.TAU;
global.RULES = RULES_MOD.RULES;
global.partCorners = U.partCorners;   // soft bake 的 boxPath（angle 0 矩形）用
// soft/barricade 显示色单一来源（RULES.coverTiers）；缺省时 bake 内字面量回退也能跑
global.COVER_TIERS = require('../js/tank_rules.js').RULES.coverTiers;

const A = require('../js/tank_assets.js');

let fails = 0;
function ok(cond, label) {
  if (cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}`); fails++; }
}

// (a) 注册表完整性
const REQUIRED = ['tree', 'bush', 'barricade', 'stump', 'rubble', 'soft'];
for (const key of REQUIRED) {
  const d = A.ASSET_DEFS[key];
  ok(!!d, `ASSET_DEFS['${key}'] exists`);
  if (!d) continue;
  ok(d.w > 0 && d.h > 0, `${key}: w/h > 0 (${d.w}x${d.h})`);
  ok(Number.isFinite(d.anchorX) && d.anchorX >= 0 && d.anchorX < d.w * 4,
    `${key}: anchorX sane (${d.anchorX})`);
  ok(Number.isFinite(d.anchorY) && d.anchorY >= 0 && d.anchorY < d.h * 4,
    `${key}: anchorY sane (${d.anchorY})`);
  ok(typeof d.bake === 'function', `${key}: bake is function`);
  if (d.bakeCanopy) {
    ok(Number.isFinite(d.canopyAnchorX) && d.canopyAnchorX >= 0,
      `${key}: canopyAnchorX sane (${d.canopyAnchorX})`);
    ok(Number.isFinite(d.canopyAnchorY) && d.canopyAnchorY >= 0,
      `${key}: canopyAnchorY sane (${d.canopyAnchorY})`);
  }
}
// fallen（倒树残骸）也注册 bake + bakeCanopy（drawCover/drawFoliage 对应分支同样走资产层）
ok(!!A.ASSET_DEFS.fallen
  && typeof A.ASSET_DEFS.fallen.bake === 'function'
  && typeof A.ASSET_DEFS.fallen.bakeCanopy === 'function',
  'fallen residue registered with bake + bakeCanopy');
// half/full（box 渲染）保持程序化，不进注册表
ok(!('half' in A.ASSET_DEFS) && !('full' in A.ASSET_DEFS),
  'half/full stay procedural (not in ASSET_DEFS)');
ok(Object.keys(A.ASSET_DEFS).length >= 7, 'ASSET_DEFS has >= 7 entries (6 required + fallen)');

// (b) mock ctx 上调用 bake / bakeCanopy 不抛错且发出绘制调用
function makeMockCtx() {
  const calls = [];
  const noop = name => (...args) => { calls.push({ name, args }); };
  return {
    calls,
    beginPath: noop('beginPath'), moveTo: noop('moveTo'), lineTo: noop('lineTo'),
    closePath: noop('closePath'), fill: noop('fill'), stroke: noop('stroke'),
    arc: noop('arc'), ellipse: noop('ellipse')
  };
}
for (const [key, d] of Object.entries(A.ASSET_DEFS)) {
  const cov = { x: 100, y: 100, w: d.w, h: d.h };
  const mc = makeMockCtx();
  let err = null;
  try { d.bake(mc, cov); } catch (e) { err = e; }
  ok(!err, `${key}: bake runs on mock ctx${err ? ' (' + err.message + ')' : ''}`);
  ok(mc.calls.length > 0, `${key}: bake issued draw calls (${mc.calls.length})`);
  if (d.bakeCanopy) {
    const mc2 = makeMockCtx();
    let err2 = null;
    try { d.bakeCanopy(mc2, cov); } catch (e) { err2 = e; }
    ok(!err2, `${key}: bakeCanopy runs on mock ctx${err2 ? ' (' + err2.message + ')' : ''}`);
    ok(mc2.calls.length > 0, `${key}: bakeCanopy issued draw calls (${mc2.calls.length})`);
  }
}

// (c) 浏览器分支 Node 安全：typeof document 守卫保证加载与调用均不触 DOM
ok(typeof document === 'undefined', 'test runs in Node (no document)');
let drawErr = null;
try { A.drawAsset({}, 'tree', 0, 0, 24, 18, 0); } catch (e) { drawErr = e; }
ok(!drawErr, 'drawAsset no-ops safely in Node (no document)');
let canopyErr = null;
try { A.drawAssetCanopy({}, 'bush', 0, 0, 56, 34); } catch (e) { canopyErr = e; }
ok(!canopyErr, 'drawAssetCanopy no-ops safely in Node (no document)');
ok(A.assetImage('tree') === null, 'assetImage returns null in Node (no Image)');
ok(A.getBakedSprite('tree', 24, 18) === null, 'getBakedSprite returns null in Node (no canvas)');
ok(A.bakeAssetCanvas('tree', 24, 18) === null, 'bakeAssetCanvas returns null in Node (no canvas)');
ok(A.assetImage('tree_canopy') === null, 'canopy image key resolves null in Node (no Image)');

console.log(fails ? `\n${fails} assertion(s) failed.` : '\nAll assertions passed.');
process.exitCode = fails ? 1 : 0;
