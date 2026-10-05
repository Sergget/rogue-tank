// run-tests.js — Node 测试链独立运行 + 汇总
//
// 背景：此前 package.json 的 "test" 是 41 个文件的 && 长链，任一失败即中断后续，
// 且长链难以看出整体通过率。改为本脚本逐个独立运行：单个失败不影响后续，
// 最后输出汇总表（含各文件耗时），退出码为失败项数（0 = 全绿）。
//
// 用法：
//   node scripts/run-tests.js            # 全量
//   node scripts/run-tests.js ai         # 只跑文件名包含 "ai" 的测试（可多个关键词）
//   RT_EXTRA=scripts/__tmp.js node scripts/run-tests.js   # 追加额外测试文件（调试用）
'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PER_TEST_TIMEOUT_MS = 180 * 1000;
const FAIL_TAIL_LINES = 25;

const TESTS = [
  'scripts/test-qa.js',
  'scripts/test-covers.js',
  'scripts/test-tanks.js',
  'scripts/test-hitpart.js',
  'scripts/test-tankcollision.js',
  'scripts/test-nodegen.js',
  'scripts/test-nodegen-snapshot.js',
  'scripts/test-nodegen-calibration.js',
  'scripts/test-camera.js',
  'scripts/test-minimap.js',
  'scripts/test-strip.js',
  'scripts/test-map.js',
  'scripts/test-flow.js',
  'scripts/test-ai.js',
  'scripts/test-squad.js',
  'scripts/test-revive.js',
  'scripts/test-modifiers.js',
  'scripts/test-weight.js',
  'scripts/test-economy.js',
  'scripts/test-cards.js',
  'scripts/test-boss.js',
  'scripts/validate-content.js',
  'scripts/test-card-effects.js',
  'scripts/test-extreme-combat.js',
  'scripts/test-extreme-geometry.js',
  'scripts/test-extreme-model.js',
  'scripts/test-extreme-cover.js',
  'scripts/test-assets.js',
  'scripts/test-audio.js',
  'scripts/test-dmgtext.js',
  'scripts/test-drone.js',
  'scripts/test-abilities.js',
  'scripts/test-fire.js',
  'scripts/test-weapon-keypress.js',
  'scripts/test-replay.js',
  'scripts/test-rework-r1.js',
  'scripts/test-rework-r2.js',
  'scripts/test-rework-r3.js',
  'scripts/test-rework-w5.js',
  'scripts/test-panels.js',
  'scripts/test-ammo-balance.js',
  'scripts/test-weapon-upgrade-balance.js',
  'scripts/test-bindings.js',
];

function pickTests() {
  let list = TESTS.slice();
  const filters = process.argv.slice(2).filter(a => !a.startsWith('-'));
  if (filters.length > 0) {
    list = list.filter(t => filters.some(f => t.includes(f)));
  }
  if (process.env.RT_EXTRA) {
    for (const extra of process.env.RT_EXTRA.split(',').map(s => s.trim()).filter(Boolean)) {
      if (!list.includes(extra)) list.push(extra);
    }
  }
  return list;
}

function runOne(test) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [test], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: PER_TEST_TIMEOUT_MS,
    maxBuffer: 64 * 1024 * 1024,
  });
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  if (r.error) {
    // spawnSync 的 error 类型为 Error，无 code 字段；checkJs 下用 JSDoc 转型读取
    const errCode = /** @type {any} */ (r.error).code;
    const reason = errCode === 'ETIMEDOUT'
      ? `超时（>${PER_TEST_TIMEOUT_MS / 1000}s）`
      : `启动失败：${r.error.message}`;
    return { test, ok: false, secs, output: reason };
  }
  const output = (r.stdout || '') + (r.stderr || '');
  return { test, ok: r.status === 0, secs, output, code: r.status };
}

function main() {
  const list = pickTests();
  if (list.length === 0) {
    console.error('run-tests: 没有匹配的测试文件');
    process.exit(2);
  }
  console.log(`run-tests: 共 ${list.length} 项，逐个独立运行（失败不中断后续）\n`);

  const results = [];
  const tAll0 = Date.now();
  for (const test of list) {
    const r = runOne(test);
    results.push(r);
    const mark = r.ok ? '✓' : '✗';
    console.log(`${mark} ${test} (${r.secs}s)${r.ok ? '' : `  ← 失败（exit=${r.code})`}`);
    if (!r.ok) {
      const tail = r.output.trim().split('\n').slice(-FAIL_TAIL_LINES).join('\n');
      console.log(`--- ${test} 输出尾部 ---\n${tail}\n--- 结束 ---`);
    }
  }
  const totalSecs = ((Date.now() - tAll0) / 1000).toFixed(1);
  const failed = results.filter(r => !r.ok);

  console.log('\n========================================');
  console.log(`测试汇总：${results.length - failed.length} 通过 / ${failed.length} 失败，共 ${results.length} 项，总耗时 ${totalSecs}s`);
  if (failed.length > 0) {
    console.log('失败项：');
    for (const f of failed) console.log(`  ✗ ${f.test} (${f.secs}s)`);
  }
  console.log('========================================');

  process.exit(failed.length === 0 ? 0 : 1);
}

main();
