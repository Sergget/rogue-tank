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
const nameCount = {};
for (const c of cards) {
  byRarity[c.rarity] = (byRarity[c.rarity] || 0) + 1;
  for (const t of (c.tags || [])) byTag[t] = (byTag[t] || 0) + 1;
  nameCount[c.name] = (nameCount[c.name] || 0) + 1;
  for (const ef of c.effects) {
    byEffectType[ef.type] = (byEffectType[ef.type] || 0) + 1;
    if (typeof ef.value === 'number') {
      numericRange.min = Math.min(numericRange.min, ef.value);
      numericRange.max = Math.max(numericRange.max, ef.value);
    }
  }
}

// name 唯一性（id 唯一由 validate-content 守门；name 重复会让玩家困惑，这里单独警示）
for (const n in nameCount) {
  if (nameCount[n] > 1) warn(`卡牌 name 重复: 「${n}」出现 ${nameCount[n]} 次`);
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

// ============================================================
// P-42 扩展审计维度（2026-08-28）：流派覆盖率 × 稀有度、同稀有度强度曲线、tag 组合矩阵。
// 均只做「报告 + 离群警示」，不默认失败；--strict 时按阈值计入 warnings。
// ============================================================

// 卡牌强度近似分：mult 效果按 |value−1|（偏离中性 1.0 的幅度）累加；add 效果单独统计
// （add 现按自然单位 mm/px/s 计，尺度与 mult 不同，不并入 multDev，避免量纲混淆）。
function cardPower(c) {
  let multDev = 0, addCount = 0, addSum = 0;
  for (const ef of (c.effects || [])) {
    if (typeof ef.value !== 'number' || !Number.isFinite(ef.value)) continue;
    if (ef.mode === 'mult') multDev += Math.abs(ef.value - 1);
    else if (ef.mode === 'add') { addCount++; addSum += ef.value; }
  }
  return { multDev, addCount, addSum };
}

// --- (1) 流派覆盖率：每流派 × 稀有度 + 每流派效果类型构成 ---
console.log('\n== 流派 × 稀有度覆盖率 ==');
const tagRarity = {};
for (const c of cards) for (const t of (c.tags || [])) {
  (tagRarity[t] ||= {})[c.rarity] = (tagRarity[t][c.rarity] || 0) + 1;
}
for (const t of CARD_TAGS) {
  const rr = tagRarity[t] || {};
  const parts = CARD_RARITIES.map(r => `${r}:${rr[r] || 0}`).join(' ');
  console.log(`  ${t}: ${parts}`);
}

console.log('\n== 流派 → 效果类型构成（张数） ==');
const tagEffect = {};
for (const c of cards) for (const t of (c.tags || [])) {
  const m = (tagEffect[t] ||= {});
  for (const ef of c.effects) m[ef.type] = (m[ef.type] || 0) + 1;
}
for (const t of CARD_TAGS) {
  const m = tagEffect[t] || {};
  const s = Object.keys(m).map(k => `${k}:${m[k]}`).join(' ');
  console.log(`  ${t}: ${s || '（无标签卡）'}`);
}

// --- (2) 同稀有度期望强度曲线 ---
console.log('\n== 同稀有度强度曲线（multDev = Σ|mult值−1|，越大越强；add 单独列出） ==');
const powerByRarity = {};
for (const c of cards) {
  const p = cardPower(c);
  (powerByRarity[c.rarity] ||= []).push({ id: c.id, ...p });
}
function median(arr) { const s = [...arr].sort((a,b)=>a-b); const m = Math.floor(s.length/2); return s.length%2 ? s[m] : (s[m-1]+s[m])/2; }
const rarityOrder = CARD_RARITIES; // common → legendary
for (const r of CARD_RARITIES) {
  const list = powerByRarity[r] || [];
  if (!list.length) { console.log(`  ${r}: 无卡`); continue; }
  const devs = list.map(x => x.multDev).sort((a,b)=>a-b);
  const min = devs[0], max = devs[devs.length-1], med = median(devs);
  console.log(`  ${r}: n=${list.length} multDev∈[${min.toFixed(2)}, ${med.toFixed(2)}(中位), ${max.toFixed(2)}]`);
  // 离群：multDev > 中位 × 2.5 且 >1.0 的卡（红色级候选）
  for (const x of list) if (x.multDev > med * 2.5 && x.multDev > 1.0) {
    warn(`${r} 强度离群 ${x.id}: multDev=${x.multDev.toFixed(2)}（同稀有度中位 ${med.toFixed(2)} 的 ${(x.multDev/med).toFixed(1)} 倍）`);
  }
}

// 稀有度单调性检查：低稀有度的最大 multDev 不应显著超过高稀有度的中位（跨档失衡 red 级）。
// 仅当高稀有度有 ≥3 张「含 mult 效果」的卡时才比较——passive/ability/economy/add 为主的卡
// multDev≈0，会把高稀有度中位拖到 0、造成假单调性破坏；因此中位只统计 multDev>0 的卡。
for (let i = 0; i < CARD_RARITIES.length - 1; i++) {
  const loR = CARD_RARITIES[i], hiR = CARD_RARITIES[i+1];
  const lo = (powerByRarity[loR] || []);
  const hi = (powerByRarity[hiR] || []).map(x=>x.multDev).filter(v => v > 0);
  if (!lo.length || hi.length < 3) continue;
  const loMax = Math.max(...lo.map(x=>x.multDev));
  const hiMed = median(hi);
  if (loMax > hiMed * 1.15) warn(`稀有度单调性破坏：${loR} 最强 multDev=${loMax.toFixed(2)} > ${hiR} 含mult卡中位 ${hiMed.toFixed(2)}`);
}

// --- (3) tag 组合矩阵（两两共现次数） ---
console.log('\n== tag 组合矩阵（同卡共现次数） ==');
const co = {};
for (const c of cards) {
  const ts = (c.tags || []).filter(t => CARD_TAGS.includes(t));
  for (let i = 0; i < ts.length; i++) for (let j = i+1; j < ts.length; j++) {
    const k = [ts[i], ts[j]].sort().join('×');
    co[k] = (co[k] || 0) + 1;
  }
}
const coKeys = Object.keys(co).sort((a,b)=>co[b]-co[a]);
console.log('  ' + (coKeys.map(k => `${k}=${co[k]}`).join('  ') || '（无多标签卡）'));

// --- (4) 定点交叉对比：P-42 目标卡族 heat_* / he_* / demo_* ---
console.log('\n== P-42 定点卡族交叉对比（heat_* / he_* / demo_*） ==');
const targetPrefix = ['heat_', 'he_', 'demo_'];
for (const pfx of targetPrefix) {
  const grp = cards.filter(c => c.id.startsWith(pfx));
  if (!grp.length) { console.log(`  ${pfx}*: 无卡`); continue; }
  console.log(`  ${pfx}* （${grp.length} 张）:`);
  for (const c of grp) {
    const pw = cardPower(c);
    console.log(`    ${c.id} [${c.rarity}] multDev=${pw.multDev.toFixed(2)} add=${pw.addCount}` +
      (pw.addSum !== 0 ? `(Σadd=${pw.addSum})` : '') + ` stacks=${c.maxStacks ?? '-'}`);
  }
}

// 汇总
if (warnings) console.error(`\naudit-content: ${warnings} 条警告`);
else console.log('\naudit-content: 无警告');
process.exit(STRICT && warnings ? 1 : 0);
