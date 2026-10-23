// test-asset-pipeline.js — 贴图资产「程序生成 + 后期贴图接线」回归（Node 端，不出网）
//
// 背景（2026-10-23 用户裁定）：坦克/地图贴图以**程序化烘焙为唯一实机路径**；后期美术只需
// 把 PNG 放到 `assets/<key>.png` 即可接管同一渲染接口。AI 出图链（prompt 包 / 托管 API
// 客户端 / 网页手抄手册 / ComfyUI 模板）已整体删除，本测试覆盖**留下的那条接线**：
//
//   (a) `tools/cover-refs.json` 与运行时烘焙代码一致（`dump-cover-refs.mjs --check`）——
//       这是「图片像素 = 世界像素」的唯一基准来源，改了烘焙几何不重导出就会静默错位；
//   (b) 基准键集合 = `ASSET_DEFS`（含 canopy 层）且每项含 canvas/anchor/centroid——
//       防止新增 tier 的 bake 后忘记导出基准、或基准里留着已删除的键；
//   (c) `prepare_covers.py` 的 ORDER 覆盖全部基准键（后处理只认这份清单，漏键会静默跳过）；
//   (d) 对空 `assets/` 跑 `covers-anchor-check.py`：必须是「ABSENT 不算失败」的退出码 0
//       ——这是「未出图 = 走程序化回退」的产品口径，不能被改成硬失败。
//
// 缺 Pillow / numpy 时跳过 (c)(d) 的 Python 段并明确报告（不静默通过）。
//
// **范围边界**：本文件只测「接线」（基准 / 后处理清单 / 锚点验收 / 空目录回退），
// **不涉及玩法判定**——`resolveHit`（命中结算）与 `hasLineOfSight`（视线）都是纯 2D 判定，
// 贴图通道的有无不得改变它们；伪 3D 路线若将来引入高度，也必须保持这两条不变
// （见 `docs/specs/map/pseudo-3d-2p5d.md` §6「玩法不变」）。
// Run: node scripts/test-asset-pipeline.js
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

// 与 test-assets.js 同款 shims（tank_assets 在 Node 下要求 RULES/TAU 等全局）
const RULES_MOD = require('../js/tank_rules.js');
const U = require('../js/tank_utils.js');
global.RULES = RULES_MOD.RULES;
global.TAU = U.TAU;
global.COVER_TIERS = RULES_MOD.RULES.coverTiers;
global.partCorners = U.partCorners;
const A = require('../js/tank_assets.js');

let fails = 0;
function ok(cond, label) {
  if (cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}`); fails++; }
}

const REFS_PATH = path.join(ROOT, 'tools', 'cover-refs.json');
const refs = JSON.parse(fs.readFileSync(REFS_PATH, 'utf8'));
const refKeys = Object.keys(refs.assets).sort();

// ---------- (a) 基准与烘焙代码同步 ----------
const dump = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'dump-cover-refs.mjs'), '--check'],
  { cwd: ROOT, encoding: 'utf8', timeout: 60000 });
ok(dump.status === 0,
  `tools/cover-refs.json 与烘焙代码一致（--check 退出码 ${dump.status}）`);
if (dump.status !== 0) console.error(dump.stderr || dump.stdout);

// ---------- (b) 基准键集合 ↔ ASSET_DEFS ----------
// 期望键 = 每个注册档的 base 层 + 有 bakeCanopy 的档再加 _canopy 层。
const expected = [];
for (const [key, def] of Object.entries(A.ASSET_DEFS)) {
  expected.push(key);
  if (def && def.bakeCanopy) expected.push(key + '_canopy');
}
expected.sort();
ok(JSON.stringify(refKeys) === JSON.stringify(expected),
  `基准键集合 = ASSET_DEFS（${refKeys.length} 键：${refKeys.join(', ')}）`);

// 每项必须有可用的 canvas / anchor / centroid —— 缺 centroid 会让验收退化成「看锚点」，
// 而图片通道的锚点只是 drawImage 偏移量，验收基准必须是内容质心。
let badEntry = 0;
for (const k of refKeys) {
  const r = refs.assets[k] || {};
  const w = r.canvas && r.canvas[0], h = r.canvas && r.canvas[1];
  if (!(w > 0 && h > 0)) badEntry++;
  if (!Array.isArray(r.anchor) || r.anchor.length !== 2
      || !Number.isFinite(r.anchor[0]) || !Number.isFinite(r.anchor[1])) badEntry++;
  if (!Array.isArray(r.centroid) || r.centroid.length !== 2
      || !Number.isFinite(r.centroid[0]) || !Number.isFinite(r.centroid[1])) badEntry++;
}
ok(badEntry === 0, '每个基准键都有 canvas / anchor / centroid（锚点可有界为负值）');

// 锚点允许为负（#V1：烘焙内容包围盒可以不含掩体中心），但必须是有限且量级合理的数。
ok(refKeys.every(k => {
  const r = refs.assets[k];
  return Math.abs(r.anchor[0]) <= r.canvas[0] * 2 && Math.abs(r.anchor[1]) <= r.canvas[1] * 2;
}), '锚点量级合理（|anchor| ≤ 2×画布，允许负值）');

// 已删除的旧 tier 不得残留在基准里（负向断言：soft/barricade 于 2026-10-22 合并为 wall）
ok(!refKeys.includes('soft') && !refKeys.includes('barricade'),
  '基准不含已删除的 soft / barricade 档（2026-10-22 合并为 wall 六变体）');

// ---------- (c) 后处理清单覆盖全部基准键 ----------
const pyPath = path.join(ROOT, 'scripts', 'prepare_covers.py');
const py = fs.readFileSync(pyPath, 'utf8');
const orderLine = py.match(/^ORDER\s*=\s*\[([\s\S]*?)\]/m);
ok(!!orderLine, 'prepare_covers.py 含 ORDER 清单');
if (orderLine) {
  const order = [...orderLine[1].matchAll(/'([^']+)'/g)].map(m => m[1]).sort();
  ok(JSON.stringify(order) === JSON.stringify(refKeys),
    `prepare_covers ORDER = 基准键集合（${order.length} 键）`);
}

// ---------- (d) 空 assets/ 必须「不算失败」 ----------
const env = Object.assign({}, process.env, {
  PYTHONPATH: process.env.PYTHONPATH || path.join(ROOT, 'tmp', 'pylibs')
});
const emptyDir = fs.mkdtempSync(path.join(ROOT, '.rt-asset-pipeline-'));
try {
  const chk = spawnSync('python', [path.join(ROOT, 'scripts', 'covers-anchor-check.py'), '--json',
    '--src', emptyDir], { cwd: ROOT, encoding: 'utf8', timeout: 120000, env });
  if (/缺少 (Pillow|numpy)/.test(chk.stderr || '')) {
    console.log('… 跳过 covers-anchor-check 校验：本机未装 Pillow/numpy（$env:PYTHONPATH = "$PWD/tmp/pylibs"）');
  } else {
    ok(chk.status === 0, `空 assets/ 下 covers-anchor-check 退出码 0（实际 ${chk.status}）`);
    if (chk.status !== 0) console.error(chk.stdout || chk.stderr);
    const rows = (chk.stdout || '').split(/\r?\n/).filter(l => l.trim().startsWith('{')).map(l => JSON.parse(l));
    ok(rows.length === refKeys.length && rows.every(r => r.status === 'ABSENT'),
      `全部 ${refKeys.length} 键报 ABSENT（走程序化回退，不是缺件）`);
  }
} finally {
  fs.rmSync(emptyDir, { recursive: true, force: true });
}

console.log(fails ? `\n${fails} 项失败` : '\n全部通过');
process.exitCode = fails ? 1 : 0;
