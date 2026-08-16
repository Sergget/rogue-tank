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
for (const scriptFile of ['scripts/test-covers.js', 'scripts/test-tanks.js', 'scripts/test-hitpart.js', 'scripts/test-tankcollision.js', 'scripts/test-nodegen.js', 'scripts/test-camera.js', 'scripts/test-map.js', 'scripts/test-flow.js', 'scripts/test-ai.js', 'scripts/test-cards.js', 'scripts/test-boss.js', 'scripts/validate-content.js', 'scripts/audit-content.js', 'scripts/test-extreme-combat.js', 'scripts/test-extreme-geometry.js', 'scripts/test-extreme-model.js', 'scripts/test-extreme-cover.js', 'scripts/test-assets.js', 'scripts/test-audio.js']) {
  const full = path.join(ROOT, scriptFile);
  if (fs.existsSync(full)) {
    checkCode(scriptFile, fs.readFileSync(full, 'utf8'));
  }
}
for (const rel of ['tank_mvp.html', 'tank_designer.html', 'tank_compare.html']) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) { console.error(`✗ missing: ${rel}`); failed++; continue; }
  checkFileScripts(full);
}

console.log(failed ? `\n${failed} check(s) failed.` : '\nAll checks passed.');
process.exitCode = failed ? 1 : 0;