// test-card-text.js — 卡牌文案口径回归（2026-11-01 用户要求
// 「清理掉面板UI、卡牌描述中对游戏实现细节的过度描述」）。
//
// 背景（有据可查的事实）：docs/specs/combat/weapons-reload.md:91 早已规定
//   「卡面按 m 显示：900px≈82m、1000≈92m、1100≈101m、1200≈110m，换算 RULES.scale.PX_PER_METER」，
// 但 21 张卡的 desc 直接写着 `900px`、`0.05 → 0.02 rad`、`340 → 560 px/s`，
// 还有 `不吃本条 damage 字段`、`弹种系数机制不变`、`当前 HE 伤害` 这类只有改代码的人看得懂的表述。
//
// ── 设计说明（2026-11-01 第 3 版，前两版的方法教训）──────────────────────────
// 前两版把「判定」和「自证」写在同一段内联正则里，结果连续三次翻车：
//   ① 词表漏项 ⇒ 负向样本命中 0（判据形同虚设）；
//   ② 误把 APCR/APDS/HE 当内部代号 ⇒ 21 张正常弹药卡被误判。
// 第 2 版还藏着一个更根的问题：`\b(?:…|本条\s*damage)\b` 里 `\b` 要求**单词边界**，
//   而 JS 的 `\w` 只含 `[A-Za-z0-9_]` —— 中文两侧都不算 word char，`\b` 恒不成立
//   ⇒ **所有中文分支从来就没生效过**。负向样本「不吃本条 damage 字段」命中 0 即由此而来。
// 第 3 版改成两件事分开：
//   · `detectLeaks(text)` 是**纯函数**，中文分支一律不用 `\b`；
//   · 判据自证用**真实历史样本表**（取自本次事故的原文），而不是现场编的合成串。
'use strict';

const fs = require('fs');
const path = require('path');
// QA 形态门（scripts/test-qa.js 的 checkHasRequireModules）要求每个测试都加载纯工具层与 RULES 源，
// 并挂 TAU/RULES shim —— 本测试只用 RULES.scale 与卡牌 JSON，但保持与其它 80+ 条链一致。
const U = require('../js/tank_utils.js');
const R = require('../js/tank_rules.js');
global.TAU = U.TAU;
global.RULES = R.RULES;

const CARDS = path.join(__dirname, '..', 'cards');

let fails = 0;
function ok(cond, label) {
  if (cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}`); fails++; }
}

// ==================== 判据（纯函数，可单独测） ====================

// 引擎单位：玩家不该读像素与弧度
const UNIT_RE = /\d\s*px\b|\d\s*rad\b|rad\/s/;

// 英文/混合片段用 \b 安全；**纯中文分支一律不加 \b**（见文件头说明）
const LEAK_RULES = [
  { name: '文件路径',      re: /(?:^|[^\w])(?:js|cards|tanks|bosses|assets)\/[\w./*-]+/ },
  { name: 'JS/JSON 文件名', re: /[\w-]+\.(?:json|js|cjs)\b/ },
  { name: '内部函数名',    re: /\b(?:apply|update|compute|spawn|reset|render|make|draw|format|combine)[A-Z]\w*/ },
  { name: '内部字段名',    re: /\b(?:RULES|WEAPON_DEFAULTS|statOverrides|cardEffects|maxStacks|accuracySpread|spreadPx|mineFieldLength|turretTurnRate)\b/ },
  { name: '内部字段表述',  re: /(?:damage\s*字段|本条\s*damage|不吃本条)/ },
  { name: '机制内部术语',  re: /(?:弹种系数机制|走难度链|难度乘子)/ },
];

/**
 * 判定一段卡面文本是否泄漏实现细节。
 * @param {string} text
 * @returns {Array<{name:string, token:string}>} 命中的规则（空数组 = 干净）
 */
function detectLeaks(text) {
  const src = String(text || '');
  const hits = [];
  if (UNIT_RE.test(src)) hits.push({ name: '引擎单位', token: UNIT_RE.exec(src)[0] });
  for (const r of LEAK_RULES) {
    const m = r.re.exec(src);
    if (m) hits.push({ name: r.name, token: m[0] });
  }
  return hits;
}

// ==================== ⓪ 换算基准 ====================
// 卡面写「82 米」的依据就是这条：900px / PX_PER_METER ≈ 82。基准一变，卡面数字必须重算。
const K = R.RULES && R.RULES.scale && R.RULES.scale.PX_PER_METER;
ok(typeof K === 'number' && K > 0, `RULES.scale.PX_PER_METER 存在且为正（${K}）`);
ok(K && Math.round(900 / K) === 82,
   `换算基准自检：900px = ${K ? Math.round(900 / K) : '?'}m（卡面按 82m 书写）`);

// ==================== ① 判据自证：真实历史样本 ====================
// 样本全部是**本次改动前的真实原文**（用户报错时引用的那几段），不是现场编的。
// 前两版的教训：合成样本会掩盖判据失效（中文 \b 不成立时仍然「全绿」）。
const MUST_FLAG = [
  { text: '安装副武器车载布雷器：F 键布设垂直于瞄准线的雷带（雷带长 220px ≈ 20m、宽 56px，含 6 枚雷，4s 后生成）', why: '引擎单位 px' },
  { text: '迫击炮强化：落点散布 0.05 → 0.02 rad（约 ±1.1°）、单发伤害 60 → 85。', why: '引擎单位 rad' },
  { text: '线导导弹强化：飞行速度 340 → 560 px/s、装填 10 → 8 秒。', why: '引擎单位 px/s' },
  { text: '雷场伤害 = 当前 HE 伤害 ×1.0（每枚雷生成时按玩家当前 HE 单发伤害结算，不吃本条 damage 字段）。', why: '内部字段表述' },
  { text: '坦克选择=把 tanks/*.json 整包配置换到玩家/靶车（applyEnemyAppearanceAndStats + applyDifficultyMults）', why: '文件路径 + 内部函数名' },
  { text: '主武器改装为速射机炮：……（弹种系数机制不变）', why: '机制内部术语' },
];

for (const s of MUST_FLAG) {
  const hits = detectLeaks(s.text);
  ok(hits.length > 0,
     `负向：真实历史样本必须被判出（${s.why}）${hits.length ? ' → ' + hints(hits) : ' → 漏判！'}`);
}

function hints(hits) { return hits.map(h => `${h.name}「${h.token}」`).join(' / '); }

// 反向样本：这些是**玩家可见的正常术语**，必须不被误判（防第 2 版的误报复发）
const MUST_PASS = [
  { text: 'APCR 弹种穿深提升 15%', why: 'APCR 是玩家可见弹种名' },
  { text: '对化学弹（HE/HEAT）只吃伤害不吃穿深与贯穿。', why: 'HE/HEAT 是玩家可见弹种名' },
  { text: '榴弹炮强化：爆炸范围 8 → 12 米（仅对榴弹炮生效，直射模式不受影响）。', why: '正常卡面文案' },
];
for (const s of MUST_PASS) {
  const hits = detectLeaks(s.text);
  ok(hits.length === 0,
     `正向：玩家可见术语不得误判（${s.why}）${hits.length ? ' → 误判: ' + hints(hits) : ''}`);
}

// ==================== ② 全库扫描 ====================
const files = fs.readdirSync(CARDS).filter(f => f.endsWith('.json')).sort();
ok(files.length > 100, `扫到卡牌文件 ${files.length} 个（应 >100）`);

const bad = [];
let checked = 0;
for (const f of files) {
  let obj;
  try { obj = JSON.parse(fs.readFileSync(path.join(CARDS, f), 'utf8')); }
  catch (e) { console.error(`✗ ${f} JSON 无效: ${e.message}`); fails++; continue; }
  checked++;
  const hits = detectLeaks(obj.desc || '');
  if (hits.length) bad.push(`${f} (${hints(hits)})`);
}

ok(bad.length === 0,
   `卡牌 desc 不含引擎单位与实现标识符${bad.length ? ' — 违规: ' + bad.slice(0, 5).join(' / ') : ''}`);
console.log(`  （已检查 ${checked} 张卡；判据 ${1 + LEAK_RULES.length} 条）`);

console.log('test-card-text: 完成所有检查');
if (fails === 0) console.log('test-card-text: 全部通过');
else { console.error(`test-card-text: ${fails} 项失败`); process.exitCode = 1; }
