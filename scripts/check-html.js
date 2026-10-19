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

for (const rel of ['index.html', 'tank_mvp.html', 'tank_bench.html', 'tank_designer.html', 'tank_compare.html']) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) { console.error(`✗ missing: ${rel}`); failed++; continue; }
  checkFileScripts(full);
}

console.log(failed ? `\n${failed} check(s) failed.` : '\nAll checks passed.');
process.exitCode = failed ? 1 : 0;