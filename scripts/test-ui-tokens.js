// test-ui-tokens.js — 界面版式令牌契约（UI 版式规范 v1，2026-10-27）
//
// 为什么需要这条链：规范文档会被读到，但**防不住回潮**。实测七页曾有 3 套色板、
// 6 份重复 `:root`、8 档字号——都是「每页各写一份、谁也没错」慢慢漂出来的。
// 本文件把「令牌唯一来源」「无冷调残留」「字号只减不增」变成可机检断言。
//
// 断言的取值依据：docs/specs/combat/ui-layout.md（视觉层唯一权威）。
// 其中 11px 硬下限来自 docs/specs/combat/hud-ui.md §#AA8 的用户实证（10px 在雪地/沙漠不可读），
// 与 scripts/test-hud-readability.js 同源。
//
// 字号「棘轮」说明：P0 只统一色板/圆角，字号收敛在 P1 逐页做。所以此处**不**要求
// 立即只含 5 档（那会立刻红），而是锁住「每一页每一字号的当前出现次数」，只许降不许升。
// P1 每改完一页，把 FONT_BASELINE 对应数字调小，回潮即失败。
//
// 运行：node scripts/test-ui-tokens.js
'use strict';

const fs = require('fs');
const path = require('path');
const UI = require('../js/tank_ui.js');
// 项目约定（scripts/test-qa.js）：每个 Node 测试都加载纯工具层与 RULES 源，并挂 TAU/RULES shim。
// 本测试断言的是样式源码形状，用不到二者，但保持与其它 66 条链一致。
const U = require('../js/tank_utils.js');
const R = require('../js/tank_rules.js');
global.TAU = U.TAU;
global.RULES = R.RULES;

const ROOT = path.join(__dirname, '..');
const HTML_PAGES = [
  'index.html', 'tank_battle.html', 'tank_bench.html',
  'tank_compare.html', 'tank_codex.html', 'tank_3d.html', 'tank_designer.html'
];
const FILES = HTML_PAGES.concat(['designer.css']);

let fails = 0;
function ok(cond, label){
  if(cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}`); fails++; }
}

const src = {};
for (const f of FILES) src[f] = fs.readFileSync(path.join(ROOT, f), 'utf8');

// 剥掉 CSS/HTML 注释：说明性文字里提到旧色号不算违规（如 codex 头部的沿革说明），
// 但**生效的**色值必须已经迁走。
function stripComments(s){
  return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '');
}
const live = {};
for (const f of FILES) live[f] = stripComments(src[f]);

// CSS 区域视图：html 只取 <style> 块，designer.css 取全文。
// 为什么色值/圆角检查只看 CSS 而字号看全文——
// canvas 绘制色（ctx.fillStyle = '#ff5040'）是画到画布上的像素，不属于 CSS 令牌管辖，
// 也无法用 var() 表达；而 inline style 属性里的字号是真会渲染的界面文字。
function cssOnly(f){
  const s = live[f];
  if (!/\.html$/.test(f)) return s;
  const out = [];
  const re = /<style[^>]*>([\s\S]*?)<\/style>/g;
  let m;
  while ((m = re.exec(s))) out.push(m[1]);
  return out.join('\n');
}
const cssSrc = {};
for (const f of FILES) cssSrc[f] = cssOnly(f);

// ---------- 1. 令牌模块自检 ----------
console.log('\n[1] 令牌模块 js/tank_ui.js');
const T = UI.UI_TOKENS;
ok(Object.keys(T).length >= 50, `令牌数量 ≥ 50（实测 ${Object.keys(T).length}）`);
for (const k of ['--bg-0', '--bg-1', '--bg-canvas', '--line', '--text', '--text-dim',
                 '--amber', '--amber-dim', '--green', '--red', '--blue',
                 '--font-ui', '--font-mono', '--fs-body', '--fs-xs',
                 '--sp-2', '--r-0', '--r-pill', '--safe-hud', '--ctl-h']){
  ok(!!T[k], `令牌 ${k} 存在`);
}
ok(Array.isArray(UI.UI_TYPE_SCALE) && UI.UI_TYPE_SCALE.length === 5,
   `字号阶梯恰 5 档（实测 ${UI.UI_TYPE_SCALE.join('/')}）`);
ok(UI.UI_TYPE_SCALE.every(v => parseInt(v, 10) >= 11),
   '字号阶梯全部 ≥ 11px（硬下限，依据 hud-ui.md §#AA8）');
(function(){ // 级差 ≥2px：防止再次出现 9 vs 10 这种分不清的相邻档
  const nums = UI.UI_TYPE_SCALE.map(v => parseInt(v, 10)).sort((a, b) => a - b);
  let minGap = Infinity;
  for (let i = 1; i < nums.length; i++) minGap = Math.min(minGap, nums[i] - nums[i - 1]);
  ok(minGap >= 2, `字号相邻级差 ≥ 2px（最小实测 ${minGap}px）`);
})();
ok(UI.UI_TYPE_SCALE.includes(T['--fs-xs']) && T['--fs-xs'] === '11px',
   `--fs-xs 是阶梯中的最小档（实测 ${T['--fs-xs']}）`);
(function(){
  const css = UI.renderTokenCss();
  ok(css.indexOf(':root{') >= 0, 'renderTokenCss() 输出 :root 块');
  const missing = Object.keys(T).filter(k => css.indexOf(k + ':') < 0);
  ok(missing.length === 0, `renderTokenCss() 覆盖全部令牌${missing.length ? '（缺 ' + missing.join(',') + '）' : ''}`);
})();

// ---------- 2. 七页接线 ----------
console.log('\n[2] 七页接入唯一来源');
for (const p of HTML_PAGES){
  const s = live[p];
  const tag = /<script\s+src="js\/tank_ui\.js"><\/script>/.test(s);
  ok(tag, `${p} 引入 js/tank_ui.js`);
  if (tag){
    const at = s.indexOf('src="js/tank_ui.js"');
    const headEnd = s.indexOf('</head>');
    ok(at > 0 && at < headEnd, `${p} 的令牌脚本位于 </head> 之前（避免 FOUC）`);
  }
}

// ---------- 3. 不得重复定义令牌 ----------
console.log('\n[3] 令牌只有一个家');
for (const p of HTML_PAGES){
  ok(live[p].indexOf(':root') < 0, `${p} 不再自带 :root`);
  const dup = Object.keys(T).filter(k => new RegExp(k.replace(/-/g, '\\-') + '\\s*:').test(live[p]));
  ok(dup.length === 0, `${p} 未重复定义令牌${dup.length ? '（违规 ' + dup.join(',') + '）' : ''}`);
}
(function(){ // designer.css 允许保留 4 个专属语义别名，但必须指向令牌
  const s = live['designer.css'];
  const rootBody = /:root\s*\{([\s\S]*?)\}/.exec(s);
  ok(!!rootBody, 'designer.css 保留专属别名 :root');
  if (rootBody){
    const keys = (rootBody[1].match(/--[\w-]+\s*:/g) || []).map(x => x.replace(/\s*:$/, ''));
    const allowed = ['--front', '--side', '--rear', '--mirror'];
    const extra = keys.filter(k => allowed.indexOf(k) < 0);
    ok(extra.length === 0, `designer.css 的 :root 只含专属别名${extra.length ? '（多出 ' + extra.join(',') + '）' : ''}`);
    const dup = Object.keys(T).filter(k => keys.indexOf(k) >= 0);
    ok(dup.length === 0, `designer.css 不重复定义通用令牌${dup.length ? '（违规 ' + dup.join(',') + '）' : ''}`);
    const aliasOk = /--front\s*:\s*var\(--red\)/.test(rootBody[1])
                 && /--side\s*:\s*var\(--blue\)/.test(rootBody[1])
                 && /--rear\s*:\s*var\(--purple\)/.test(rootBody[1]);
    ok(aliasOk, 'designer 的 front/side/rear 指向令牌（不写色号）');
  }
})();

// ---------- 4. 无废止色板残留 ----------
console.log('\n[4] 废止色板已绝迹');
const DEAD_COLORS = [
  '#101418', '#171d22', '#1a2026', '#2a323a', '#8a8f7d',   // 冷蓝灰一套
  '#e8c86a', '#c9a45c',                                       // devPanel 沙金（本项只查页面，JS 见 [7]）
  '#3a4a3a', '#cfe6cf', '#ffb84d', '#ff5040',                 // 3D 页旧局部色板
  '#565b4d', '#9aa08c', '#3a424a', '#e8e6d8'                  // 首页旧灰阶
];
for (const p of FILES){
  const hit = DEAD_COLORS.filter(c => cssSrc[p].toLowerCase().indexOf(c) >= 0);
  ok(hit.length === 0, `${p} 无废止色号${hit.length ? '（残留 ' + hit.join(',') + '）' : ''}`);
}
ok(live['index.html'].indexOf('Segoe UI') < 0, 'index.html 不再使用 Segoe UI');
ok(live['tank_battle.html'].indexOf('Consolas') < 0, 'tank_battle.html 不再直写 Consolas（走 --font-mono）');

// ---------- 5. 字号棘轮（只减不增） ----------
console.log('\n[5] 字号棘轮（只减不增）');
// 键 = 像素值，值 = 允许出现的次数上限。P1 收敛后请同步下调。
const FONT_BASELINE = {
  'index.html':        {},                                                  // 已全量令牌化
  'tank_battle.html':  { 8: 3, 9: 23, 10: 35, 11: 26, 12: 15, 13: 7, 15: 3, 18: 2 },
  'tank_bench.html':   { 9: 3, 10: 13, 11: 8, 12: 3 },
  'tank_compare.html': { 9: 1, 10: 9, 11: 2, 12: 2 },
  'tank_codex.html':   { 9: 2, 10: 3, 11: 6, 12: 1, 14: 1, 15: 1 },
  'tank_3d.html':      { 10: 1, 11: 4, 12: 2, 13: 1, 14: 1 },
  // designer 的样式一半在 designer.css、一半在 body 的内联 style 属性里，两处都要计
  'tank_designer.html': { 9: 9, 10: 39, 11: 3 },
  'designer.css':      { 9: 1, 10: 6, 11: 8, 12: 1, 15: 1 }
};
function fontSizes(s){
  const out = {};
  const re = /(?:font-size\s*:\s*|font\s*:\s*)(\d+)px/g;
  let m;
  while ((m = re.exec(s))) out[m[1]] = (out[m[1]] || 0) + 1;
  return out;
}
for (const p of FILES){
  const actual = fontSizes(live[p]);
  const base = FONT_BASELINE[p] || {};
  const bad = [];
  for (const k in actual){
    const cap = base[k] === undefined ? 0 : base[k];
    if (actual[k] > cap) bad.push(`${k}px ${actual[k]}次(上限${cap})`);
  }
  ok(bad.length === 0, `${p} 字号未回潮${bad.length ? '（超出 ' + bad.join(' / ') + '）' : ''}`);
}
ok(Object.keys(fontSizes(live['index.html'])).length === 0,
   'index.html 字号全部走 var(--fs-*)（无裸 px）');

// ---------- 6. 圆角受控 ----------
console.log('\n[6] 圆角只有 0 与 pill');
const RADIUS_ALLOWED = ['0', '50%', '999px', 'var(--r-0)', 'var(--r-pill)'];
for (const p of FILES){
  const vals = (cssSrc[p].match(/border-radius\s*:\s*[^;}]+/g) || [])
    .map(x => x.split(':')[1].trim());
  const bad = vals.filter(v => RADIUS_ALLOWED.indexOf(v) < 0);
  ok(bad.length === 0, `${p} 圆角取值合规${bad.length ? '（违规 ' + [...new Set(bad)].join(',') + '）' : ''}`);
}

// ---------- 7. 面板模块也走令牌 ----------
console.log('\n[7] 共享面板模块');
const dev = fs.readFileSync(path.join(ROOT, 'js', 'tank_devpanel.js'), 'utf8');
const deadInDev = ['#e8c86a', '#c9a45c', '#ddd7c4', '#8a8678'].filter(c => dev.toLowerCase().indexOf(c) >= 0);
ok(deadInDev.length === 0, `tank_devpanel.js 无沙金色残留${deadInDev.length ? '（残留 ' + deadInDev.join(',') + '）' : ''}`);

// ---------- 汇总 ----------
console.log('');
if (fails === 0) console.log('test-ui-tokens: 全部通过');
else { console.error(`test-ui-tokens: ${fails} 项失败`); process.exitCode = 1; }
