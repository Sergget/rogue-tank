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
  // 2026-10-29：浏览器链改为**逐条执行 + 逐条重试**。
  //   起因：整链跑时，8 条时序敏感断言会出现「每轮红的不是同一条、单跑必过」的抖动
  //   （实测四轮分别红在 encounter 首帧 / 3d 二次开火 / C 键集火 / …）。整链重试治不了，
  //   因为抖动是逐链的；而且整链失败只说「某处红了」，不告诉你是哪条。
  //   现在：逐条跑，某条失败就只重跑该条一次；两轮都红才算 FAIL，并点名是哪条。
  const pkg = require(path.join(ROOT, 'package.json'));
  const chain = String(pkg.scripts['test:browser'] || '')
    .split('&&').map(s => s.trim()).filter(s => s.indexOf('node ') === 0)
    .map(s => s.slice(5).trim());
  const results = [];
  let sawInconclusive = false;
  for (const script of chain) {
    const short = script.replace(/^scripts\//, '');
    let r = run('node', [script], 20 * 60 * 1000);
    let text = r.out;
    const inconclusive = r.status === 86 || /INCONCLUSIVE/.test(text);
    if (inconclusive) {
      sawInconclusive = true;
      results.push({ name: short, state: 'INCONCLUSIVE' });
      continue;
    }
    if (r.status !== 0 || /FAIL \|/.test(text)) {
      const firstFail = findLine(text, /FAIL \|/) || lastLine(text);
      r = run('node', [script], 20 * 60 * 1000);
      text = r.out;
      if (r.status === 0 && !/FAIL \|/.test(text)) {
        results.push({ name: short, state: 'PASS', note: `首轮抖动重跑通过：${firstFail.slice(0, 70)}` });
        continue;
      }
      results.push({ name: short, state: 'FAIL', note: findLine(text, /FAIL \|/) || lastLine(text) });
      continue;
    }
    results.push({ name: short, state: 'PASS' });
  }
  const bad = results.filter(x => x.state === 'FAIL');
  const flaky = results.filter(x => x.note);
  if (bad.length) {
    criteria.push({ name: `浏览器链（${results.length} 条，逐条重试）`, state: 'FAIL',
      detail: bad.map(x => `${x.name}: ${x.note}`).join(' | ') });
  } else if (sawInconclusive) {
    criteria.push({ name: `浏览器链（${results.length} 条，逐条重试）`, state: 'INCONCLUSIVE',
      detail: '部分链因环境限制无结论（退出码 86／INCONCLUSIVE），既非通过也非失败' });
  } else {
    criteria.push({ name: `浏览器链（${results.length} 条，逐条重试）`, state: 'PASS',
      detail: flaky.length ? `${results.length} 条全绿；其中 ${flaky.length} 条首轮抖动、重跑通过：${flaky.map(x => x.name).join(', ')}` : `${results.length} 条全绿` });
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
