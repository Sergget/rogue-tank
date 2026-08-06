// Dev smoke check: syntax-checks the shared module and server, plus every inline <script> body
// in the prototype HTML files, using `node --check`. Catches syntax errors without opening a
// browser. (Runtime references like `document`/`ctx` are not resolved — this is syntax only.)
// Usage: node scripts/check-html.js
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
let failed = 0;

function checkCode(label, code) {
  const tmp = path.join(os.tmpdir(), `rogue-tank-check-${Date.now()}-${Math.floor(Math.random()*1e6)}.js`);
  fs.writeFileSync(tmp, code, 'utf8');
  const r = spawnSync(process.execPath, ['--check', tmp], { encoding: 'utf8' });
  if (r.status !== 0) {
    failed++;
    console.error(`✗ ${label}`);
    console.error((r.stderr || '').split('\n').slice(0, 12).join('\n'));
  } else {
    console.log(`✓ ${label}`);
  }
  try { fs.unlinkSync(tmp); } catch (_) {}
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
    checkCode(`${label}#inline${inlineIdx++}`, body);
  }
}

for (const rel of ['js/tank_paint.js', 'server.js']) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) { console.error(`✗ missing: ${rel}`); failed++; continue; }
  checkCode(rel, fs.readFileSync(full, 'utf8'));
}
for (const rel of ['tank_mvp.html', 'tank_designer.html']) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) { console.error(`✗ missing: ${rel}`); failed++; continue; }
  checkFileScripts(full);
}

console.log(failed ? `\n${failed} check(s) failed.` : '\nAll checks passed.');
process.exitCode = failed ? 1 : 0;