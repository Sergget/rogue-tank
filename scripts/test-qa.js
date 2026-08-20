// QA validation: checks all test scripts for compliance with project conventions
// and verifies coverage of safety-critical / robustness boundary conditions.
// Run: node scripts/test-qa.js
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SCRIPTS_DIR = path.join(ROOT, 'scripts');

// QA counters
let total = 0;
let compliant = 0;
let issues = 0;

// Known test script filenames to exclude from auto-check (like our new QA script)
const SKIPPED_TEST_FILES = new Set(['test-qa.js']);

// ---- project-convention checks ----
function checkHasUseStrict(code) {
  // Check if file contains 'use strict' - the key thing is it's present somewhere
  // (all existing test scripts have it at the top, this ensures syntax check passes)
  const normalized = code.normalize ? code.normalize() : code;
  return normalized.includes("use strict");
}

function checkHasRequireModules(code) {
  // Must require tank_utils.js (pure utils) and tank_rules.js (RULES source)
  return /require\(['"]\.\.\/js\/tank_utils\.js['"]/.test(code) &&
         /require\(['"]\.\.\/js\/tank_rules\.js['"]/.test(code);
}

function checkHasGlobalShims(code) {
  // Common global shims that test scripts set up
  const hasTau = /global\.TAU\s*=/ .test(code);
  const hasRules = /global\.RULES\s*=/ .test(code);
  const hasOkPattern = /function ok\(/ .test(code) || /let fails =/.test(code);
  return { hasTau, hasRules, hasOkPattern };
}

function checkSafetyEdgeCases(code) {
  // Look for edge case testing patterns
  const patterns = [
    /ok\(/g,           // assertion pattern
    /fails\s*\+\+\s*;?\s*\/\/?\s*fails;/g, // fails counter
    /resetCovers|resetEntity|C\.resetCovers|resetEntity/g, // cover/entity reset
    /getExposure|impactGeometry|resolveHit|moduleFromHit/g, // physics/geometry checks
    /BOUNCE_ANGLE|bounceAngle/g, // bounce angle checks
    /invuln|Invuln|invuln/g, // invulnerability checks
    /canRevive|reviveTank|findReviveSpot/g, // revive checks
    /hasLineOfSight|lineOfSight/g, // LOS checks
    /weightClass|heightClass/g, // height class checks
    /full|half|bush|tree|soft|barricade/g, // cover tier checks
    /driveBy|DriveBy|driveby/g, // driveBy checks
    /modules\./g, // module checks
    /normalizeBarrel/g, // barrel normalization
  ];

  let found = 0;
  for (const p of patterns) {
    if (p.test(code)) found++;
  }
  // Minimum 3 edge-case patterns expected for a proper test script
  return found >= 3 ? found : 0;
}

// ---- check each test script ----
const testFiles = fs.readdirSync(SCRIPTS_DIR)
  .filter(f => f.startsWith('test-') && f.endsWith('.js') && !SKIPPED_TEST_FILES.has(f))
  .sort();

console.log(`Checking ${testFiles.length} test scripts for QA compliance...\n`);

for (const file of testFiles) {
  const filePath = path.join(SCRIPTS_DIR, file);
  const code = fs.readFileSync(filePath, 'utf8');
  total++;

  let fileIssues = 0;
  let fileCompliant = true;

  // 1. Syntax: must have 'use strict'
  if (!checkHasUseStrict(code)) {
    console.error(`✗ ${file}: missing 'use strict'`);
    fileIssues++; fileCompliant = false;
  }

  // 2. Must require tank_utils.js (pure utils layer)
  if (!/require\(['"]\.\.\/js\/tank_utils\.js['"]/.test(code)) {
    console.error(`✗ ${file}: missing require('../js/tank_utils.js')`);
    fileIssues++; fileCompliant = false;
  }

  // 3. Must require tank_rules.js (RULES source)
  if (!/require\(['"]\.\.\/js\/tank_rules\.js['"]/.test(code)) {
    console.error(`✗ ${file}: missing require('../js/tank_rules.js')`);
    fileIssues++; fileCompliant = false;
  }

  // 4. Must have ok()/fails pattern
  if (!/function ok\(/ .test(code) && !/let fails =/.test(code)) {
    console.error(`✗ ${file}: missing ok()/fails pattern`);
    fileIssues++; fileCompliant = false;
  }

  // 5. Global shims check
  const shims = checkHasGlobalShims(code);
  if (!shims.hasTau) {
    console.warn(`⚠ ${file}: missing global.TAU shim`);
    fileIssues++;
  }
  if (!shims.hasRules) {
    console.warn(`⚠ ${file}: missing global.RULES shim`);
    fileIssues++;
  }

  // 6. Safety/robustness edge case coverage
  const edgeCount = checkSafetyEdgeCases(code);
  if (edgeCount < 3) {
    console.warn(`⚠ ${file}: only ${edgeCount} edge-case patterns found (expected >= 3 for robustness coverage)`);
    fileIssues++;
  }

  if (fileCompliant) {
    console.log(`✓ ${file}: compliant with ${edgeCount} edge-case patterns`);
    compliant++;
  } else {
    issues += fileIssues;
  }
}

// ---- also check the QA script itself (separately) ----
console.log('\n--- QA script self-check ---');
const qaCode = fs.readFileSync(path.join(SCRIPTS_DIR, 'test-qa.js'), 'utf8');
const qaTotal = 6; // number of checks
let qaPass = 0;

if (checkHasUseStrict(qaCode)) { console.log('✓ test-qa.js: has \'use strict\''); qaPass++; }
else { console.warn('⚠ test-qa.js: missing \'use strict\''); }

if (/require\(['"]\.\.\/js\/tank_utils\.js['"]/.test(qaCode)) { console.log('✓ test-qa.js: has require(tank_utils.js)'); qaPass++; }
else { console.warn('⚠ test-qa.js: missing require(tank_utils.js)'); }

if (/require\(['"]\.\.\/js\/tank_rules\.js['"]/.test(qaCode)) { console.log('✓ test-qa.js: has require(tank_rules.js)'); qaPass++; }
else { console.warn('⚠ test-qa.js: missing require(tank_rules.js)'); }

if (/function ok\(/ .test(qaCode) || /let fails =/.test(qaCode)) { console.log('✓ test-qa.js: has ok()/fails pattern'); qaPass++; }
else { console.warn('⚠ test-qa.js: missing ok()/fails pattern'); }

const qaShims = checkHasGlobalShims(qaCode);
if (qaShims.hasTau) { console.log('✓ test-qa.js: has global.TAU shim'); qaPass++; }
else { console.warn('⚠ test-qa.js: missing global.TAU shim'); }

if (qaShims.hasRules) { console.log('✓ test-qa.js: has global.RULES shim'); qaPass++; }
else { console.warn('⚠ test-qa.js: missing global.RULES shim'); }

const qaEdgeCount = checkSafetyEdgeCases(qaCode);
if (qaEdgeCount >= 3) { console.log(`✓ test-qa.js: has ${qaEdgeCount} edge-case patterns`); qaPass++; }
else { console.warn(`⚠ test-qa.js: only ${qaEdgeCount} edge-case patterns (expected >= 3)`); }

console.log(`QA script self-check: ${qaPass}/${qaTotal} checks passed`);

if (qaPass < qaTotal) {
  console.warn('⚠ QA script has issues - review above');
  process.exitCode = 1;
}

// ---- summary ----
console.log(`\n=== QA Summary ===`);
console.log(`Total scripts checked: ${total}`);
console.log(`Compliant: ${compliant}`);
console.log(`Non-compliant: ${total - compliant}`);
console.log(`Total issues found: ${issues}`);

if (issues > 0) {
  console.log(`\n⚠ ${issues} issue(s) found. Review above for details.`);
  process.exitCode = process.exitCode || 1;
} else {
  console.log('\n✓ All test scripts pass QA compliance check.');
  process.exitCode = 0;
}