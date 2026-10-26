// test-hud-readability.js — 战斗 HUD 文本在亮地表（雪地/沙漠 biome）上的可读性契约。
// 背景（#AA8，2026-10-26 用户反馈「标准模式左下角的任务描述在某些 biome 上看不清」）：
//   旧 `#quotaHud` = 10px + `--text-dim` + 仅一层 text-shadow、**无底衬**；`#hintBar` = 9px + opacity .75、
//   同样无底衬 ⇒ 压在雪地/沙漠这类高亮地面上直接糊掉。本文件锁住「深色底衬 + 最小字号 + 正文色」三条，
//   并顺手锁 HUD 结构（`#topLeftInfo` 不得被误删、目标卡在日志面板打开时让位）。
// 说明：这是**源码形状断言**——CSS 观感无法在 Node 侧光栅化验证，但「底衬被删回去」这类回归能拦住。
// 运行：node scripts/test-hud-readability.js
'use strict';

const fs = require('fs');
const path = require('path');
const U = require('../js/tank_utils.js');
const R = require('../js/tank_rules.js');
global.TAU = U.TAU;
global.RULES = R.RULES;

let fails = 0;
function ok(cond, label){
  if(cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}`); fails++; }
}

const page = fs.readFileSync(path.join(__dirname, '..', 'tank_battle.html'), 'utf8');
const styleSrc = page.slice(0, page.indexOf('</style>'));

// 取单个 CSS 规则块（选择器必须唯一）
function cssRule(selector){
  const i = styleSrc.indexOf(selector + '{');
  if(i < 0) return '';
  const j = styleSrc.indexOf('}', i);
  return j < 0 ? '' : styleSrc.slice(i, j);
}
function alphaOf(rule){
  const m = /background:\s*rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([\d.]+)\s*\)/.exec(rule);
  return m ? Number(m[1]) : 0;
}
function px(rule, prop){
  const m = new RegExp(prop + '\\s*:\\s*(\\d+(?:\\.\\d+)?)px').exec(rule);
  return m ? Number(m[1]) : NaN;
}

// ---------- ① 左下角目标卡 `#quotaHud` ----------
const quota = cssRule('#quotaHud');
ok(!!quota, '找到 #quotaHud 样式块');
ok(alphaOf(quota) >= 0.6, `#quotaHud 有深色底衬（alpha=${alphaOf(quota)} ≥ 0.6，压在亮 biome 上也不糊）`);
ok(px(quota, 'font-size') >= 11, `#quotaHud 正文 ≥ 11px（实测 ${px(quota, 'font-size')}px；旧值 10px）`);
ok(/color:\s*var\(--text\)/.test(quota), '#quotaHud 正文用 --text（不用 --text-dim）');
ok(!/color:\s*var\(--text-dim\)/.test(quota), '负向：#quotaHud 不得退回 --text-dim');
ok(/text-shadow\s*:/.test(quota), '#quotaHud 保留 text-shadow 作为极端环境的兜底');
ok(/pointer-events\s*:\s*none/.test(quota), '#quotaHud pointer-events:none（信息层不吃战场点击）');
ok(px(quota, 'bottom') >= 80, `#quotaHud 抬到底部 HUD 带上方（bottom=${px(quota, 'bottom')}px ≥ 80）`);

// ---------- ② 底部提示条 `#hintBar`（同一根因） ----------
const hint = cssRule('#hintBar');
ok(!!hint, '找到 #hintBar 样式块');
ok(alphaOf(hint) >= 0.6, `#hintBar 也有深色底衬（alpha=${alphaOf(hint)}）`);
ok(px(hint, 'font-size') >= 10, `#hintBar 字号 ≥ 10px（实测 ${px(hint, 'font-size')}px；旧值 9px）`);
ok(/color:\s*var\(--text\)/.test(hint), '#hintBar 用 --text（旧值 --text-dim + opacity .75）');

// ---------- ③ HUD 结构回归 ----------
ok(!!cssRule('#topLeftInfo'), '#topLeftInfo 样式仍在（左上操作提示，勿在改 HUD 时误删）');
ok(/id="topLeftInfo"/.test(page) && /id="quotaHud"/.test(page) && /id="hintBar"/.test(page),
   '三个 HUD 文本节点都还在 DOM 里');
ok(/目标 OBJECTIVE/.test(page), '目标卡文案仍在（删样式不等于删功能）');
ok(/qh\.style\.display = 'block'[\s\S]{0,120}?!logOpen|!logOpen/.test(page),
   '目标卡在日志面板打开时让位（!logOpen 出现在显示条件里）');

console.log('test-hud-readability: 完成所有检查');
if(fails === 0) console.log('test-hud-readability: 全部通过');
else console.error(`test-hud-readability: ${fails} 项失败`);
process.exit(fails === 0 ? 0 : 1);
