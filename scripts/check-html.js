// Dev smoke check: syntax-checks the shared module and server, plus every inline <script> body
// in the prototype HTML files, using `node --check`. Catches syntax errors without opening a
// browser. (Runtime references like `document`/`ctx` are not resolved — this is syntax only.)
// Usage: node scripts/check-html.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
let failed = 0;

function checkCode(label, code) {
  try {
    new vm.Script(code, { filename: label });
    console.log(`✓ ${label}`);
  } catch (err) {
    failed++;
    console.error(`✗ ${label}`);
    console.error(err.stack || err.message || err);
  }
}

function fail(message) {
  failed++;
  console.error(`✗ ${message}`);
}

function checkFileScripts(htmlPath) {
  const src = fs.readFileSync(htmlPath, 'utf8');
  const label = path.basename(htmlPath);
  // Every inline <script> body (i.e. the block contains code; skip <script src="..."> includes).
  const blocks = [...src.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)];
  let inlineIdx = 0;
  for (const m of blocks) {
    const attrs = m[1] || '';
    const body = (m[2] || '').trim();
    if (!body) continue;                    // empty — just a src include
    if (/\bsrc\s*=\s*"/.test(attrs)) continue; // external script, ignore blank body
    
    // Check for duplicate function declarations
    const fnRegex = /function\s+([A-Za-z0-9_]+)\s*\(/g;
    const foundFns = {};
    let match;
    while ((match = fnRegex.exec(body)) !== null) {
      const fnName = match[1];
      if (foundFns[fnName]) {
        console.warn(`⚠️ Warning: Duplicate function declaration "${fnName}" in inline script of ${label}`);
      }
      foundFns[fnName] = true;
    }
    
    checkCode(`${label}#inline${inlineIdx++}`, body);
  }
}

// Shared JS files in js/
const jsDir = path.join(ROOT, 'js');
const jsFiles = fs.readdirSync(jsDir).filter(f => f.endsWith('.js'));
for (const file of jsFiles) {
  const rel = path.join('js', file);
  const full = path.join(jsDir, file);
  checkCode(rel, fs.readFileSync(full, 'utf8'));
}
checkCode('server.js', fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8'));

// 2026-10-19 #AGENT：测试/校验/审计脚本改成**按目录自动发现**，不再手抄白名单。
// 原白名单只有 28 项、磁盘上有 51 个 test-*.js —— 余下的既不在测试链里也没语法兜底，
// 语法错误会一直潜伏到有人手动去跑它。现在 scripts/ 下所有 .js/.cjs 一律冒烟。
const scriptsDir = path.join(ROOT, 'scripts');

// 递归收集 scripts/ 下的 .js/.cjs（含 scripts/lib/**）。原实现只扫顶层，
// 导致 scripts/lib/mini-canvas.js、scripts/lib/browser-launch.cjs 这类共享辅助无语法兜底。
function collectScriptFiles(dir, relBase) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const rel = relBase ? path.join(relBase, entry.name) : entry.name;
    if (entry.isDirectory()) {
      out.push(...collectScriptFiles(path.join(dir, entry.name), rel));
    } else if (/(\.c?js)$/.test(entry.name)) {
      out.push(rel);
    }
  }
  return out;
}
for (const rel of collectScriptFiles(scriptsDir, '')) {
  checkCode(path.join('scripts', rel), fs.readFileSync(path.join(scriptsDir, rel), 'utf8'));
}

// 测试链登记一致性：磁盘上的 scripts/test-*.js 必须全部出现在 run-tests.js 的 TESTS 里。
// 这条断言的存在理由是真实事故——test-move.js / test-physics.js 曾长期是孤儿测试。
{
  const runner = path.join(ROOT, 'scripts', 'run-tests.js');
  const runnerSrc = fs.readFileSync(runner, 'utf8');
  const onDisk = fs.readdirSync(scriptsDir).filter(f => /^test-.*\.js$/.test(f)).sort();
  const orphan = onDisk.filter(f => !runnerSrc.includes(`scripts/${f}`));
  if (orphan.length) {
    fail(`run-tests.js 漏登记（孤儿测试，永不执行）：${orphan.join(', ')}`);
  } else {
    console.log(`✓ 测试链登记一致（${onDisk.length} 个 scripts/test-*.js 全部在 TESTS 中）`);
  }
}

// 2026-10-22（第五批 B6）：新增 tank_codex.html（图鉴独立页）——页面白名单必须同步，
// 否则新页的内联脚本永远不被语法冒烟覆盖（ghost page）。
const PAGES = ['index.html', 'tank_battle.html', 'tank_bench.html', 'tank_designer.html', 'tank_compare.html', 'tank_codex.html', 'tank_3d.html'];
for (const rel of PAGES) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) { console.error(`✗ missing: ${rel}`); failed++; continue; }
  checkFileScripts(full);
}

// 2026-11-03 §4.213：**大小写精确性**校验（原 CI 唯一的不可替代价值之一，现转成本地断言）。
//
// 为什么必须有：Windows 的 NTFS 默认大小写不敏感 —— `fs.existsSync('js/TANK_RULES.JS')`
// 在开发机上返回 **true**（实测），`require`/`readFileSync` 同样能解析。而 GitHub Actions
// 的 ubuntu runner 是大小写敏感的 ext4：同一份代码到 CI 上才开始 `MODULE_NOT_FOUND`。
// 即「本地全绿、CI 必红」的经典盲区，且**只有大小写这一维度**是 Windows 骗人的
// （实测：路径分隔符、CRLF、编码三项本仓库均已用 path.join / .gitattributes 规避）。
//
// 做法：对每一条相对引用，逐段与本目录的真实条目名做**精确字符串比对**，任何一段
// 大小写不一致即判红。不依赖运行平台，纯字符串比较。
function exactCaseExists(absPath) {
  const rel = path.relative(ROOT, absPath);
  if (rel.startsWith('..')) return true;              // 仓库外的路径不管
  const parts = rel.split(path.sep).filter(Boolean);
  let cur = ROOT;
  for (const seg of parts) {
    let entries;
    try { entries = fs.readdirSync(cur); } catch { return false; }
    if (!entries.includes(seg)) return false;         // 大小写不符 或 真的不存在
    cur = path.join(cur, seg);
  }
  return true;
}

function collectLocalRefs(htmlPath) {
  const src = fs.readFileSync(htmlPath, 'utf8');
  const refs = [];
  // <script src> 与 <link href>：只收本地相对引用（跳过协议/绝对路径/锚点）
  for (const m of src.matchAll(/<(?:script|link)[^>]*?(?:src|href)\s*=\s*"([^"]+)"/g)) {
    const u = m[1];
    if (/^(https?:|data:|\/\/|#|\/api)/.test(u)) continue;
    refs.push(u.replace(/^\.\//, '').split('?')[0].split('#')[0]);
  }
  return refs.filter(Boolean);
}

{
  const problems = [];
  // (a) 页面脚本/样式引用
  for (const rel of PAGES) {
    const full = path.join(ROOT, rel);
    if (!fs.existsSync(full)) continue;
    for (const ref of collectLocalRefs(full)) {
      const target = path.resolve(path.dirname(full), ref);
      if (!fs.existsSync(target)) { problems.push(`${rel} → ${ref}（文件不存在）`); continue; }
      if (!exactCaseExists(target)) problems.push(`${rel} → ${ref}（大小写不符）`);
    }
  }
  // (b) scripts/ 与 js/ 内的 require() 相对路径
  const scanFiles = [
    ...collectScriptFiles(scriptsDir, '').map(r => path.join(scriptsDir, r)),
    ...jsFiles.map(f => path.join(jsDir, f)),
    path.join(ROOT, 'server.js'),
  ];
  for (const file of scanFiles) {
    if (!fs.existsSync(file)) continue;
    const src = fs.readFileSync(file, 'utf8');
    for (const m of src.matchAll(/require\(\s*['"](\.[^'"]+)['"]\s*\)/g)) {
      const base = path.resolve(path.dirname(file), m[1]);
      const cands = [base, `${base}.js`, `${base}.cjs`, `${base}.json`, path.join(base, 'index.js')];
      const hit = cands.find(c => fs.existsSync(c) && fs.statSync(c).isFile());
      if (!hit) continue;                              // 解析不到的不在此断言范围（另有测试覆盖）
      if (!exactCaseExists(hit)) problems.push(`${path.relative(ROOT, file)} → require('${m[1]}')（大小写不符）`);
    }
  }
  if (problems.length) {
    for (const p of problems) fail(`大小写不精确（Linux/CI 必崩）：${p}`);
  } else {
    console.log('✓ 引用路径大小写精确（跨平台安全）');
  }
}

console.log(failed ? `\n${failed} check(s) failed.` : '\nAll checks passed.');
process.exitCode = failed ? 1 : 0;