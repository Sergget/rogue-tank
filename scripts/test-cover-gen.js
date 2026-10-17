// test-cover-gen.js — 地图元素出图链路测试（Node 端，不出网）
//   (a) `tools/cover-gen-prompts.json` 与 `js/tank_assets.js` 的 ASSET_DEFS 对账：
//       key 集合一致、名义尺寸一致（防止改了 bake 尺寸却忘改生成参数）；
//   (b) `tools/gen-covers.mjs` 能从 `cover-gen-prompts.md` 解析出全部 10 条 prompt，
//       且每条都带全局风格前缀（§1），前缀不重复叠加；
//   (c) `--provider mock` 端到端出 10 张 PNG 到临时目录（用仓库 bake 代码，不出网），
//       再交给 `scripts/prepare_covers.py --dry --json` 验证 10 张全部 OK。
//       缺 Pillow/numpy 时跳过 (c) 并明确报告（不静默）。
// Run: node scripts/test-cover-gen.js
'use strict';

const fs = require('fs');
const os = require('os');
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

// ---------- (a) 出图基准 ↔ 运行时烘焙一致 ----------
// 图片通道按 1:1 贴图，故 assets/<key>.png 必须等于「程序化 bake 的内容包围盒尺寸」，
// 锚点也必须是画布内坐标。这两项的唯一来源是 tools/cover-refs.json（由烘焙代码导出）。
const spec = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'cover-gen-prompts.json'), 'utf8'));
const refs = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'cover-refs.json'), 'utf8'));
const specKeys = spec.assets.map(a => a.key).sort();
const refKeys = Object.keys(refs.assets).sort();
ok(JSON.stringify(specKeys) === JSON.stringify(refKeys),
  `出图规格与运行时基准键集合一致（${specKeys.length} 个）`);
const dump = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'dump-cover-refs.mjs'), '--check'],
  { cwd: ROOT, encoding: 'utf8', timeout: 60000 });
ok(dump.status === 0, 'tools/cover-refs.json 与烘焙代码一致（--check）');
for (const a of spec.assets) {
  const r = refs.assets[a.key];
  if (!r) { ok(false, `${a.key}: 运行时基准缺失`); continue; }
  // 生成尺寸可以大于最终画布（AI 出大图后缩小），但宽高比必须与最终画布一致，否则会变形
  // 出图宽高比 = 最终画布宽高比：不一致会让 prepare_covers 的等比缩放留下大块空白，
  // 内容在画布里相对位置随之漂移（早期 soft/fallen 就踩过「按 16:9 出图」的坑）
  const gen = genSizeFor(r.canvas, a.generateLongest || 1024);
  const genAr = gen[0] / gen[1];
  const refAr = r.canvas[0] / r.canvas[1];
  ok(Math.abs(genAr - refAr) / refAr < 0.02,
    `${a.key} 出图宽高比 = 最终画布（${gen.join('x')} vs ${r.canvas.join('x')}）`);
}
ok(Object.values(refs.assets).every(r => r.anchor[0] >= 0 && r.anchor[0] <= r.canvas[0]
  && r.anchor[1] >= 0 && r.anchor[1] <= r.canvas[1]), '运行时锚点全部落在画布内');
ok(Object.values(refs.assets).every(r => Array.isArray(r.centroid) && r.centroid.length === 2),
  '运行时基准含内容质心（图片通道验收基准）');

// 与 tools/gen-covers.mjs 同源的出图尺寸推导（保持两处口径一致）
function genSizeFor(canvas, longest) {
  const s = longest / Math.max(canvas[0], canvas[1]);
  return [Math.max(64, Math.round(canvas[0] * s)), Math.max(64, Math.round(canvas[1] * s))];
}

// ---------- (b) prompt 解析 ----------
const md = fs.readFileSync(path.join(ROOT, 'tools', 'cover-gen-prompts.md'), 'utf8');
const styleFence = md.slice(md.search(/^## 1\./m)).match(/```[^\n]*\n([\s\S]*?)```/)[1].trim();
const heads = [...md.matchAll(/^### (P\d+)[^\n]*$/gm)];
ok(heads.length === 10, `cover-gen-prompts.md 含 10 个 Pn 小节（实际 ${heads.length}）`);
const promptById = new Map();
for (let i = 0; i < heads.length; i++) {
  const from = heads[i].index + heads[i][0].length;
  const to = i + 1 < heads.length ? heads[i + 1].index : md.length;
  const fence = md.slice(from, to).match(/```[^\n]*\n([\s\S]*?)```/);
  if (fence) promptById.set(heads[i][1], fence[1].trim());
}
ok(promptById.size === 10, `10 条 prompt 全部可解析（实际 ${promptById.size}）`);
const firstLine = styleFence.split('\n')[0].trim();
let withStyle = 0;
for (const [id, text] of promptById) {
  const hasStyle = text.includes('[STYLE]') || text.includes(firstLine);
  if (hasStyle) withStyle++;
  else ok(false, `${id} 缺少全局风格前缀`);
}
ok(withStyle === 10, `10 条 prompt 均带全局风格前缀（§1）`);
const dupStyle = [...promptById.values()].filter(t => t.split(firstLine).length > 2).length;
ok(dupStyle === 0, '没有 prompt 重复叠加风格前缀');

// ---------- (c) mock 端到端 + prepare_covers 校验 ----------
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-covergen-'));
try {
  const gen = spawnSync(process.execPath, [
    path.join(ROOT, 'tools', 'gen-covers.mjs'),
    '--provider', 'mock', '--force', '--out', tmpDir
  ], { cwd: ROOT, encoding: 'utf8', timeout: 120000 });
  ok(gen.status === 0, `gen-covers --provider mock 退出码 0（实际 ${gen.status}）`);
  if (gen.status !== 0) console.error(gen.stderr || gen.stdout);
  const produced = fs.readdirSync(tmpDir).filter(f => f.endsWith('.png')).sort();
  ok(produced.length === 10, `mock 产出 10 张 PNG（实际 ${produced.length}）`);
  // PNG 魔数 + 非空
  let badPng = 0;
  for (const f of produced) {
    const buf = fs.readFileSync(path.join(tmpDir, f));
    const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    if (buf.length < 100 || sig.some((b, i) => buf[i] !== b)) badPng++;
  }
  ok(badPng === 0, '全部产物是合法 PNG 且非空');

  // prepare_covers --dry --json：需要 Pillow + numpy（仓库本地 tmp/pylibs）
  const env = Object.assign({}, process.env, {
    PYTHONPATH: process.env.PYTHONPATH || path.join(ROOT, 'tmp', 'pylibs')
  });
  const rep = spawnSync('python', [
    path.join(ROOT, 'scripts', 'prepare_covers.py'), '--dry', '--json', '--src', tmpDir
  ], { cwd: ROOT, encoding: 'utf8', timeout: 120000, env });
  if (/缺少 (Pillow|numpy)/.test(rep.stderr || '')) {
    console.log('… 跳过 prepare_covers 校验：本机未装 Pillow/numpy（$env:PYTHONPATH = "$PWD/tmp/pylibs"）');
  } else {
    ok(rep.status === 0, `prepare_covers --dry 退出码 0（实际 ${rep.status}）`);
    const lines = (rep.stdout || '').trim().split('\n').filter(Boolean).map(l => JSON.parse(l));
    const summary = lines.find(l => l.summary);
    ok(!!summary && summary.summary.ok === 10 && summary.summary.bad === 0,
      `prepare_covers 报告 10/10 OK（${summary ? JSON.stringify(summary.summary) : '无 summary'}）`);
    const scaled = lines.filter(l => l.key && l.scale);
    ok(scaled.length === 10 && scaled.every(l => l.scale <= 1 && l.scale > 0),
      '全部源图按名义尺寸等比缩小（不做拉伸变形）');
    ok(scaled.every(l => l.dst_bytes > 200 && l.dst_bytes < 64 * 1024),
      'PNG-8 产物尺寸合理（0.2KB ~ 64KB）');
    // 落盘后按「烘焙内容质心」验收（图片通道的真实对齐基准）
    // 落盘到临时目录（不碰 assets/），再对落盘结果做质心/尺寸验收
    const outDir = path.join(tmpDir, 'out');
    const prep2 = spawnSync('python', [
      path.join(ROOT, 'scripts', 'prepare_covers.py'), '--inplace', '--src', tmpDir, '--out', outDir
    ], { cwd: ROOT, encoding: 'utf8', timeout: 120000, env });
    ok(prep2.status === 0, `prepare_covers --inplace 落盘退出码 0（实际 ${prep2.status}）`);
    const chk = spawnSync('python', [
      path.join(ROOT, 'scripts', 'covers-anchor-check.py'), '--json', '--src', outDir
    ], { cwd: ROOT, encoding: 'utf8', timeout: 120000, env });
    ok(chk.status === 0, `covers-anchor-check 全部通过（退出码 ${chk.status}）`);
    if (chk.status !== 0) console.error(chk.stdout || chk.stderr);
    // --json 模式下只取 JSON 行（汇总行是纯文本，不参与解析）
    const rows = (chk.stdout || '').split(/\r?\n/)
      .filter(l => l.trim().startsWith('{')).map(l => JSON.parse(l));
    ok(rows.length === 10 && rows.every(r => r.status === 'OK'),
      '10 张产物质心均在烘焙基准 ±2px 内');
  }
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

console.log(fails ? `\n${fails} 项失败` : '\n全部通过');
process.exitCode = fails ? 1 : 0;

// ---------- (d) 网页端手动出图流程：--pick / --only / 任意文件名 ----------
// 模拟「网页下载的图名字很乱、也可能只出了其中一张」的真实情况：
//   --pick 指定 4 选 1 → --only 只处理这一批 → 落盘 → 质心验收通过；
//   未出的 key 既不报告也不落盘（保持程序化回退）。
{
  const manualDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-covergen-manual-'));
  try {
    const gen = spawnSync(process.execPath, [
      path.join(ROOT, 'tools', 'gen-covers.mjs'), '--provider', 'mock', '--force', '--out', manualDir
    ], { cwd: ROOT, encoding: 'utf8', timeout: 120000 });
    ok(gen.status === 0, 'mock 出图（手动流程夹具）成功');
    // 名字改成网页下载的典型样子（带空格与括号）——脚本必须原样接受
    fs.renameSync(path.join(manualDir, 'tree.png'), path.join(manualDir, 'tree v2 (1).png'));

    const env = Object.assign({}, process.env, {
      PYTHONPATH: process.env.PYTHONPATH || path.join(ROOT, 'tmp', 'pylibs')
    });
    const outDir = path.join(manualDir, 'out');
    const r = spawnSync('python', [
      path.join(ROOT, 'scripts', 'prepare_covers.py'),
      '--only', 'tree', '--pick', 'tree=tree v2 (1).png',
      '--inplace', '--src', manualDir, '--out', outDir
    ], { cwd: ROOT, encoding: 'utf8', timeout: 120000, env });
    if (/缺少 (Pillow|numpy)/.test(r.stderr || '')) {
      console.log('… 跳过手动流程校验：本机未装 Pillow/numpy');
    } else {
      ok(r.status === 0, `--pick/--only 手动流程退出码 0（实际 ${r.status}）`);
      if (r.status !== 0) console.error(r.stdout || r.stderr);
      const written = fs.existsSync(outDir) ? fs.readdirSync(outDir).filter(f => f.endsWith('.png')) : [];
      ok(written.length === 1 && written[0] === 'tree.png',
        `--only 只落盘被选中的 1 张（实际 ${JSON.stringify(written)}）`);
      const chk = spawnSync('python', [
        path.join(ROOT, 'scripts', 'covers-anchor-check.py'), '--json', '--src', outDir
      ], { cwd: ROOT, encoding: 'utf8', timeout: 120000, env });
      const rows = (chk.stdout || '').split(String.fromCharCode(10))
        .map(l => l.replace(String.fromCharCode(13), '').trim())
        .filter(l => l.startsWith('{')).map(l => JSON.parse(l));
      const tree = rows.find(x => x.key === 'tree');
      ok(!!tree && tree.status === 'OK', `手动流程产物通过质心验收（${tree ? tree.dist : '?'}px）`);
      const absent = rows.filter(x => x.status === 'ABSENT').length;
      ok(absent === 9, `未出的 9 个 key 保持 ABSENT（走程序化回退，不算失败），实际 ${absent}`);
    }
  } finally {
    fs.rmSync(manualDir, { recursive: true, force: true });
  }
}
