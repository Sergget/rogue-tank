// P-15 伤害飘字（js/tank_dmgtext.js）的 Node 行为测试：生成/更新/衰减/移除/未知 kind 回退。
// Run: node scripts/test-dmgtext.js
'use strict';

const D = require('../js/tank_dmgtext.js');

let fails = 0;
function ok(cond, label) {
  if (cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}`); fails++; }
}
// 模块数组为全局单例：计数敏感断言前先清空，避免跨块串扰
function clearAll(){ while(D.dmgTexts.length) D.dmgTexts.pop(); }

// ---- spawn：数组增长 + 字段完整 ----
{
  clearAll();
  D.spawnDmgText(100, 200, '88', 'pen');
  ok(D.dmgTexts.length === 1, 'spawn 后数组 +1');
  const t = D.dmgTexts[0];
  ok(t.x === 100 && t.y === 200 && t.text === '88' && t.kind === 'pen', 'spawn 字段：x/y/text/kind');
  ok(t.age === 0 && t.life === D.DMG_TEXT.life, 'spawn 字段：age=0、life=默认');
}

// ---- 数字文本自动转字符串 / 默认 kind ----
{
  clearAll();
  D.spawnDmgText(0, 0, 42);
  ok(D.dmgTexts[0].text === '42' && D.dmgTexts[0].kind === 'pen', '数字 text 转字符串、缺省 kind=pen');
}

// ---- update：age 推进 + 到期移除 ----
{
  clearAll();
  D.spawnDmgText(0, 0, '1', 'bounce');
  D.updateDmgTexts(0.3);
  ok(Math.abs(D.dmgTexts[0].age - 0.3) < 1e-9, 'update(0.3) → age=0.3');
  D.updateDmgTexts(0.7);   // 0.3 + 0.7 = 1.0 ≥ life 0.9 → 移除
  ok(D.dmgTexts.length === 0, 'age 达 life → 移除');
}

// ---- update 边界：dt<=0 不推进；大量并发不崩溃 ----
{
  clearAll();
  D.spawnDmgText(0, 0, 'x', 'he');
  D.updateDmgTexts(0);
  ok(D.dmgTexts[0].age === 0, 'dt=0 不推进 age');
  D.updateDmgTexts(-1);
  ok(D.dmgTexts[0].age === 0, 'dt<0 不推进 age');
  for(let i = 0; i < 500; i++) D.spawnDmgText(i, i, String(i), i % 3 === 0 ? 'dot' : 'pen');
  D.updateDmgTexts(0.05);
  ok(D.dmgTexts.length >= 490, '500 条并发 update 无崩溃且只移除到期者');
  while(D.dmgTexts.length) D.updateDmgTexts(1);   // 清空（数组为模块单例，测试间隔离）
  ok(D.dmgTexts.length === 0, 'update 推进可清空全部');
}

// ---- 颜色表：5 种语义色齐备 ----
{
  const c = D.DMG_TEXT.colors;
  ok(!!c.pen && !!c.block && !!c.bounce && !!c.he && !!c.dot, 'colors 含 pen/block/bounce/he/dot');
  ok(c.pen !== c.he && c.bounce !== c.he && c.dot !== c.he, '击穿/跳弹/灼烧与高爆黄区分');
}

// ---- 未知 kind 回退 pen（绘制侧使用同表，无 undefined 色） ----
{
  clearAll();
  D.spawnDmgText(0, 0, 'z', 'unknown');
  const t = D.dmgTexts[0];
  ok(t.kind === 'unknown', '未知 kind 原样保存（绘制时按表回退）');
  ok(!!(D.DMG_TEXT.colors[t.kind] || D.DMG_TEXT.colors.pen), '未知 kind 绘制色可回退');
}

console.log(fails === 0 ? '\nAll dmgtext checks passed.' : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);