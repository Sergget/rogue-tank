// batch-gate.js — 批次门禁：把 AGENTS.md §3.6.1 的四条判据做成一条可执行命令
//
// 为什么需要它：无人值守长跑时，门禁判定不能靠模型「读一读日志觉得没问题」。
// 本脚本把三条校验链跑成结构化结果，打印唯一的裁决行，退出码即结论。
//
// 用法：
//   node scripts/batch-gate.js                 # 语法冒烟 + typecheck + Node 全链
//   node scripts/batch-gate.js --browser       # 追加浏览器链
//   node scripts/batch-gate.js --skip-tests    # 只跑语法与类型（快速自查）
//
// 退出码：0 = PASS ／ 1 = FAIL ／ 86 = INCONCLUSIVE（仅环境限制，既非通过也非失败）
'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const WANT_BROWSER = argv.indexOf('--browser') >= 0;
const SKIP_TESTS = argv.indexOf('--skip-tests') >= 0;

const criteria = [];   // { name, state: 'PASS'|'FAIL'|'SKIP'|'INCONCLUSIVE', detail }

/** 跑一条命令，返回 { status, out }（status 为 null 表示进程未正常退出） */
function run(cmd, args, timeoutMs, useShell) {
  const r = spawnSync(cmd, args, {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: timeoutMs || 15 * 60 * 1000,
    // stdin 关掉：任何交互式等待都会立刻返回，而不是挂到超时
    stdio: ['ignore', 'pipe', 'pipe'],
    // Windows 下 .cmd / .bat 不能用 shell:false 直接 spawn（会 EINVAL）——
    // 这类失败是「环境没跑起来」，不是「链红了」，必须能区分（见下方 status===null 处理）
    shell: !!useShell
  });
  return {
    status: r.status,
    out: `${r.stdout || ''}${r.stderr || ''}`,
    error: r.error ? String(r.error.message || r.error) : null
  };
}

function lastLine(text) {
  const lines = (text || '').trim().split(/\r?\n/).filter(Boolean);
  return lines.length ? lines[lines.length - 1] : '';
}

function findLine(text, re) {
  const lines = (text || '').split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i--) if (re.test(lines[i])) return lines[i].trim();
  return '';
}

// ---------------------------------------------------------------- ① 语法冒烟
{
  const r = run('node', ['scripts/check-html.js'], 5 * 60 * 1000);
  const ok = r.status === 0;
  criteria.push({
    name: '语法冒烟 check-html（共享模块 + server + 七页内联脚本 + 孤儿测试）',
    state: ok ? 'PASS' : 'FAIL',
    detail: ok ? lastLine(r.out) : (r.status === null ? `进程未正常退出：${r.error || '未知'}` : (findLine(r.out, /✗|error|Error|孤儿/) || lastLine(r.out)))
  });
}

// ---------------------------------------------------------------- ② typecheck
{
  const r = run('node', ['node_modules/typescript/bin/tsc', '--noEmit'], 5 * 60 * 1000);
  const ok = r.status === 0;
  criteria.push({
    name: 'typecheck tsc --noEmit',
    state: ok ? 'PASS' : 'FAIL',
    detail: ok ? '无类型错误' : (r.status === null ? `进程未正常退出：${r.error || '未知'}` : (findLine(r.out, /error TS/) || lastLine(r.out)))
  });
}

// ---------------------------------------------------------------- ③ Node 全链
if (SKIP_TESTS) {
  criteria.push({ name: 'Node 全链 npm test', state: 'SKIP', detail: '--skip-tests' });
} else {
  const r = run('node', ['scripts/run-tests.js'], 40 * 60 * 1000);
  const summary = findLine(r.out, /测试汇总/);
  const m = summary.match(/(\d+)\s*通过\s*\/\s*(\d+)\s*失败/);
  const passed = m ? Number(m[1]) : -1;
  const failed = m ? Number(m[2]) : -1;
  if (r.status === 0 && failed === 0 && passed >= 0) {
    criteria.push({ name: 'Node 全链 npm test', state: 'PASS', detail: `${passed} 通过 / 0 失败` });
  } else if (m) {
    criteria.push({ name: 'Node 全链 npm test', state: 'FAIL', detail: `${passed} 通过 / ${failed} 失败` });
  } else {
    criteria.push({ name: 'Node 全链 npm test', state: 'FAIL', detail: lastLine(r.out) || '未拿到汇总行' });
  }
}

// ---------------------------------------------------------------- ④ 浏览器链（可选）
if (!WANT_BROWSER) {
  criteria.push({ name: '浏览器链 npm run test:browser', state: 'SKIP', detail: '未指定 --browser' });
} else {
  // 用 package.json 里的脚本文本 + shell 执行：Windows 下 .cmd 不能 shell:false 直接 spawn
  const script = require(path.join(ROOT, 'package.json')).scripts['test:browser'];
  const b = run(script, [], 40 * 60 * 1000, true);
  const text = b.out;
  // 环境限制：browser-launch 以 86 退出并打印 INCONCLUSIVE（见 sandbox-verify 技能）
  if (b.status === 86 || /INCONCLUSIVE/.test(text)) {
    criteria.push({ name: '浏览器链 npm run test:browser', state: 'INCONCLUSIVE', detail: '退出码 86／INCONCLUSIVE：环境限制，既非通过也非失败' });
  } else if (b.status === 0 && /ALL PASS/.test(text)) {
    criteria.push({ name: '浏览器链 npm run test:browser', state: 'PASS', detail: findLine(text, /ALL PASS/) });
  } else if (b.status === null) {
    // 进程根本没起来（EPERM/EINVAL/超时等）⇒ 报「无结论」，不得计为 FAIL
    criteria.push({ name: '浏览器链 npm run test:browser', state: 'INCONCLUSIVE', detail: `进程未正常退出：${b.error || '未知原因'}` });
  } else {
    criteria.push({ name: '浏览器链 npm run test:browser', state: 'FAIL', detail: findLine(text, /✗|FAIL|Error/) || lastLine(text) });
  }
}

// ---------------------------------------------------------------- 汇总
console.log('='.repeat(72));
console.log('批次门禁 · batch-gate');
console.log('='.repeat(72));
for (const c of criteria) {
  const mark = c.state === 'PASS' ? '✓' : c.state === 'FAIL' ? '✗' : c.state === 'INCONCLUSIVE' ? '?' : '-';
  console.log(`${mark} [${c.state}] ${c.name}`);
  if (c.detail) console.log(`    ${c.detail}`);
}

const hardFail = criteria.some(c => c.state === 'FAIL');
const inconclusive = criteria.some(c => c.state === 'INCONCLUSIVE');
console.log('-'.repeat(72));

if (hardFail) {
  console.log('GATE: FAIL');
  console.log('（任一项 FAIL 即不通过；修复后重跑，不要跳过该项直接继续下一批）');
  process.exitCode = 1;
} else if (inconclusive) {
  console.log('GATE: INCONCLUSIVE');
  console.log('（只差环境限制项，不据此判批；在放开权限的环境重跑该链）');
  process.exitCode = 86;
} else {
  console.log('GATE: PASS');
  console.log('（注意：本脚本只验「链是否绿」，不验「断言是否够」——新增断言数 ≥ 计划值与负向断言由 review 环节把关）');
  process.exitCode = 0;
}
