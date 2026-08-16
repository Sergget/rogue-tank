// audit-content.js — 内容平衡审计（报告型工具，不默认失败；--strict 时按阈值失败）。
// 统计卡牌稀有度/流派/效果类型分布与数值极值，Boss 阶段数/掉落，供平衡调整参考。
// 运行：node scripts/audit-content.js [--strict]
'use strict';
const fs = require('fs');
const path = require('path');
const { CARD_RARITIES, CARD_TAGS, RARITY_WEIGHTS, validateCard, validateCardSet } = require('../js/tank_cards.js');
const { validateBoss } = require('../js/tank_boss.js');

const ROOT = path.join(__dirname, '..');
const STRICT = process.argv.includes('--strict');

function loadJsonDir(dir) {
  const out = [];
  const full = path.join(ROOT, dir);
  if (!fs.existsSync(full)) return out;
  for (const f of fs.readdirSync(full).filter(f => f.endsWith('.json')).sort()) {
    try { out.push(JSON.parse(fs.readFileSync(path.join(full, f), 'utf8'))); }
    catch (e) { console.error(`✗ ${dir}/${f}: ${e.message}`); }
  }
  return out;
}

const cards = loadJsonDir('cards');
const bosses = loadJsonDir('bosses');
const totalWeight = Object.values(RARITY_WEIGHTS).reduce((a, b) => a + b, 0);
let warnings = 0;

function warn(msg) { warnings++; console.error(`⚠ ${msg}`); }

// 稀有度分布
console.log(`\n== 卡牌审计（${cards.length} 张）==`);
const byRarity = {};
const byTag = {};
const byEffectType = {};
const numericRange = { min: Infinity, max: -Infinity };
for (const c of cards) {
  byRarity[c.rarity] = (byRarity[c.rarity] || 0) + 1;
  for (const t of (c.tags || [])) byTag[t] = (byTag[t] || 0) + 1;
  for (const ef of c.effects) {
    byEffectType[ef.type] = (byEffectType[ef.type] || 0) + 1;
    if (typeof ef.value === 'number') {
      numericRange.min = Math.min(numericRange.min, ef.value);
      numericRange.max = Math.max(numericRange.max, ef.value);
    }
  }
}

console.log('稀有度分布（期望权重）:');
for (const r of CARD_RARITIES) {
  const n = byRarity[r] || 0;
  const actual = cards.length ? (n / cards.length * 100) : 0;
  const expected = RARITY_WEIGHTS[r] / totalWeight * 100;
  const line = `  ${r}: ${n} 张 (${actual.toFixed(1)}%)`;
  console.log(line + `  [期望 ~${expected.toFixed(0)}%]`);
  if (STRICT && cards.length >= 10 && Math.abs(actual - expected) > 20) warn(`稀有度 ${r} 占比偏离期望 >20%`);
}

console.log('流派分布:');
for (const t of CARD_TAGS) console.log(`  ${t}: ${byTag[t] || 0} 张`);
if (STRICT) for (const t of CARD_TAGS) if (!byTag[t]) warn(`流派 ${t} 无卡牌`);

console.log('效果类型分布:');
for (const k in byEffectType) console.log(`  ${k}: ${byEffectType[k]} 个效果`);
console.log(`数值极值: value ∈ [${numericRange.min}, ${numericRange.max}]`);

console.log(`\n== Boss 审计（${bosses.length} 个）==`);
for (const b of bosses) {
  const stageCount = b.stages ? b.stages.length : 0;
  const loot = b.loot ? `score=${b.loot.score ?? '-'} cardRarity=${b.loot.cardRarity ?? '-'} cards=${b.loot.cards ?? '-'}` : '无掉落';
  console.log(`  ${b.id}「${b.name}」: ${stageCount} 阶段 · ${loot}`);
  if (STRICT && stageCount < 2) warn(`Boss ${b.id} 阶段数 <2（多阶段 Boss 应 ≥2）`);
}

// 汇总
if (warnings) console.error(`\naudit-content: ${warnings} 条警告`);
else console.log('\naudit-content: 无警告');
process.exit(STRICT && warnings ? 1 : 0);
