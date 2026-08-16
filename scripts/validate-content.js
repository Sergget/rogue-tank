// validate-content.js — 内容数据校验（cards/ + bosses/）。
// 纯 Node，无浏览器依赖；挂进 npm test 作为内容 schema 的守门测试。
// 运行：node scripts/validate-content.js
'use strict';
const fs = require('fs');
const path = require('path');
const { validateCard, validateCardSet } = require('../js/tank_cards.js');
const { validateBoss } = require('../js/tank_boss.js');

const ROOT = path.join(__dirname, '..');
let failed = 0;

function loadJsonDir(dir) {
  const out = [];
  const full = path.join(ROOT, dir);
  if (!fs.existsSync(full)) return out;
  for (const f of fs.readdirSync(full).filter(f => f.endsWith('.json')).sort()) {
    try {
      out.push(JSON.parse(fs.readFileSync(path.join(full, f), 'utf8')));
    } catch (e) {
      console.error(`✗ ${dir}/${f}: JSON 解析失败 — ${e.message}`);
      failed++;
    }
  }
  return out;
}

// ---- cards ----
const cards = loadJsonDir('cards');
const cardRes = validateCardSet(cards);
if (cardRes.errors.length) {
  for (const e of cardRes.errors) { failed++; console.error(`✗ 卡牌 ${e.id}: ${e.errs.join('; ')}`); }
}
if (cardRes.duplicates.length) {
  failed++;
  console.error(`✗ 卡牌 id 重复: ${cardRes.duplicates.join(', ')}`);
}
console.log(`✓ 卡牌 ${cards.length} 张 schema 校验`);

// ---- bosses ----
const bosses = loadJsonDir('bosses');
const bossIds = {};
for (const b of bosses) {
  const errs = validateBoss(b);
  if (errs.length) { failed++; console.error(`✗ Boss ${b.id}: ${errs.join('; ')}`); }
  if (bossIds[b.id]) { failed++; console.error(`✗ Boss id 重复: ${b.id}`); }
  bossIds[b.id] = true;
}
console.log(`✓ Boss ${bosses.length} 个 schema 校验`);

console.log(failed ? `\nvalidate-content: ${failed} 项失败` : '\nvalidate-content: 全部通过');
process.exit(failed ? 1 : 0);
