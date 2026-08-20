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
for (const scriptFile of ['scripts/test-covers.js', 'scripts/test-tanks.js', 'scripts/test-hitpart.js', 'scripts/test-tankcollision.js', 'scripts/test-nodegen.js', 'scripts/test-camera.js', 'scripts/test-map.js', 'scripts/test-flow.js', 'scripts/test-ai.js', 'scripts/test-revive.js', 'scripts/test-modifiers.js', 'scripts/test-economy.js', 'scripts/test-cards.js', 'scripts/test-boss.js', 'scripts/validate-content.js', 'scripts/test-card-effects.js', 'scripts/audit-content.js', 'scripts/test-extreme-combat.js', 'scripts/test-extreme-geometry.js', 'scripts/test-extreme-model.js', 'scripts/test-extreme-cover.js', 'scripts/test-assets.js', 'scripts/test-audio.js', 'scripts/test-dmgtext.js', 'scripts/test-drone.js', 'scripts/test-abilities.js', 'scripts/test-browser-smoke.cjs']) {
  const full = path.join(ROOT, scriptFile);
  if (fs.existsSync(full)) {
    checkCode(scriptFile, fs.readFileSync(full, 'utf8'));
  }
}
checkCode('scripts/test-qa.js', fs.readFileSync(path.join(ROOT, 'scripts', 'test-qa.js'), 'utf8'));
for (const rel of ['index.html', 'tank_mvp.html', 'tank_bench.html', 'tank_designer.html', 'tank_compare.html']) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) { console.error(`✗ missing: ${rel}`); failed++; continue; }
  checkFileScripts(full);
}

console.log(failed ? `\n${failed} check(s) failed.` : '\nAll checks passed.');
process.exitCode = failed ? 1 : 0;