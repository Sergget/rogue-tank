// validate-content.js — 内容数据校验（cards/ + bosses/）。
// 纯 Node，无浏览器依赖；挂进 npm test 作为内容 schema 的守门测试。
// 运行：node scripts/validate-content.js
'use strict';
const fs = require('fs');
const path = require('path');
const { validateCard, validateCardSet } = require('../js/tank_cards.js');
const { validateBoss } = require('../js/tank_boss.js');
const RULES = require('../js/tank_rules.js').RULES;

// ── 全局根目录 ──
const ROOT = path.join(__dirname, '..');

// ── 失败计数器 ──
let failed = 0;

// ── 基础工具：加载目录下所有 JSON 文件 ──
function loadJsonDir(dir) {
  const out = [];
  const full = path.join(ROOT, dir);
  if (!fs.existsSync(full)) return out;
  for (const f of fs.readdirSync(full).filter(f => f.endsWith('.json')).sort()) {
    try { out.push(JSON.parse(fs.readFileSync(path.join(full, f), 'utf8'))); }
    catch (e) { console.error(`✗ ${dir}/${f}: JSON 解析失败 — ${e.message}`); }
  }
  return out;
}

// ── 全卡牌 / 全 Boss ID 可重复性检查（全局唯一） ──
function checkDuplicateIds() {
  let cfailed = 0;
  const errors = [];

  // 获取所有 tank JSON 文件的 id
  const tanksDir = path.join(ROOT, 'tanks');
  const tankSpecs = {};
  if (fs.existsSync(tanksDir)) {
    for (const f of fs.readdirSync(tanksDir).filter(f => f.endsWith('.json')).sort()) {
      try {
        const spec = JSON.parse(fs.readFileSync(path.join(tanksDir, f), 'utf8'));
        const id = spec.id;
        if (tankSpecs[id]) {
          errors.push(`坦克 id 重复: ${id}`);
          cfailed++;
        } else {
          tankSpecs[id] = true;
        }
      } catch (e) {
        // JSON 解析错误另行报告
      }
    }
  }

  // 获取所有卡牌 JSON 文件的 id
  const cards = loadJsonDir('cards');
  const cardIds = {};
  for (const c of cards) {
    const id = c.id;
    if (cardIds[id]) {
      errors.push(`卡牌 id 重复: ${id}`);
      cfailed++;
    } else {
      cardIds[id] = true;
    }
  }

  // 获取所有 Boss JSON 文件的 id
  const bosses = loadJsonDir('bosses');
  const bossIds = {};
  for (const b of bosses) {
    const id = b.id;
    if (bossIds[id]) {
      errors.push(`Boss id 重复: ${id}`);
      cfailed++;
    } else {
      bossIds[id] = true;
    }
  }

  // 跨类别全局唯一性检查：同一 ID 不应出现在多个类别中
  const idCategories = {};
  for (const id of Object.keys(tankSpecs)) { if (!idCategories[id]) idCategories[id] = new Set(); idCategories[id].add('tank'); }
  for (const id of Object.keys(cardIds)) { if (!idCategories[id]) idCategories[id] = new Set(); idCategories[id].add('card'); }
  for (const id of Object.keys(bossIds)) { if (!idCategories[id]) idCategories[id] = new Set(); idCategories[id].add('boss'); }

  const crossDuplicateIds = [];
  for (const [id, cats] of Object.entries(idCategories)) {
    if (cats.size > 1) { crossDuplicateIds.push(id); }
  }
  if (crossDuplicateIds.length) {
    errors.push(`跨类别 ID 冲突: ${crossDuplicateIds.join(', ')}`);
    cfailed++;
  }

  if (errors.length) {
    for (const e of errors) { console.error(`✗ ${e}`); }
  } else {
    console.log('✓ 所有 Tank/卡牌/Boss id 全局唯一');
  }
  failed += cfailed;
  return cfailed;
}

// ── 超纲数值检查 ──
function checkNumericBounds() {
  let failed = 0;
  const errors = [];

  // 统一的数值边界常量（根据游戏设计文档 §2.2 §2.3 设定的合理范围）
  const NUMERIC_BOUNDS = {
    hp: { min: 1, max: 9999 },
    maxSpeed: { min: 0, max: 500 },
    turnRate: { min: 0, max: 999 },
    turretTurnRate: { min: 0, max: 999 },
    weight: { min: 1, max: 9999 },
    enginePower: { min: 1, max: 9999 },
    penetration: { min: 0, max: 9999 },
    damage: { min: 1, max: 9999 },
    reload: { min: 0.1, max: 9999 },
    shellSpeed: { min: 100, max: 3000 },
    spreadMult: { min: 0, max: 999 },
    aimSpeed: { min: 0, max: 999 },
    traverseLimit: { min: 0, max: 360 },
  };

  // 检查坦克 JSON 数值
  const tanksDir = path.join(ROOT, 'tanks');
  if (fs.existsSync(tanksDir)) {
    for (const f of fs.readdirSync(tanksDir).filter(f => f.endsWith('.json')).sort()) {
      try {
        const spec = JSON.parse(fs.readFileSync(path.join(tanksDir, f), 'utf8'));
        for (const [key, bounds] of Object.entries(NUMERIC_BOUNDS)) {
          const val = spec[key];
          if (val === undefined) continue;
          if (!Number.isFinite(val)) {
            errors.push(`${f.replace('.json','')}.${key}: 非有限数 (${val})`);
            failed++;
            continue;
          }
          if (val < bounds.min) {
            errors.push(`${f.replace('.json','')}.${key}: 超出下界 (${val} < ${bounds.min})`);
            failed++;
          }
          if (val > bounds.max) {
            errors.push(`${f.replace('.json','')}.${key}: 超出上界 (${val} > ${bounds.max})`);
            failed++;
          }
        }
      } catch (e) {
        // JSON 解析错误另行报告
      }
    }
  }

  // 检查卡牌 effects 中的数值
  const cards = loadJsonDir('cards');
  for (const c of cards) {
    if (!c.effects) continue;
    for (const ef of c.effects) {
      if (typeof ef.value === 'number') {
        if (!Number.isFinite(ef.value)) {
          errors.push(`${c.id}.${ef.type}: 非有限数 (${ef.value})`);
          failed++;
        }
        if (ef.type === 'modifier' && ef.stat === 'reload' && !Number.isFinite(ef.value)) {
          errors.push(`${c.id}.${ef.type}[${ef.stat}]: 非有限数 (${ef.value})`);
          failed++;
        }
      }
    }
  }

  if (errors.length) {
    for (const e of errors) { console.error(`✗ ${e}`); }
  } else {
    console.log('✓ 所有数值字段在允许范围内，无非有限数');
  }
  return failed;
}

// ── 描述与 Effect 矛盾检查 ──
// 核心逻辑：卡牌 desc 使用整数百分比（如 +15, -50），
// effect value 使用 decimal 乘数（如 1.15, 0.5）。
// 一致性判定：desc_number ≈ (effect_value - 1) * 100
function checkDescEffectConsistency() {
  let failed = 0;
  const errors = [];

  const cards = loadJsonDir('cards');
  for (const c of cards) {
    if (!c.desc || !c.effects || c.effects.length === 0) continue;

    // 从 desc 中提取关键数字（整数或小数）
    const descNumbers = c.desc.match(/-?\d+(?:\.\d+)?/g) || [];
    const descNumSet = new Set(descNumbers.map(n => parseFloat(n)));

    // 从 effect 中获取数值
    const effectEntries = c.effects
      .filter(ef => typeof ef.value === 'number')
      .map(ef => ({ type: ef.type, value: ef.value }));

    // 对每个 effect 检查 desc 中是否有匹配的数字
    for (const { type, value: en } of effectEntries) {
      // 计算 desc 应该有的期望百分比数字
      // 公式：expected = (en - 1) * 100
      // 当 en = 0.5 时，expected = -50（desc 里的 -50）
      // 当 en = 1.15 时，expected = 15（desc 里的 +15）
      // 当 en = 0.85 时，expected = -15
      const expectedDescNum = Math.round((en - 1) * 100);

      const matchingDescNums = descNumbers.filter(dn => {
        const d = parseFloat(dn);
        // 匹配条件：|d - expected| ≤ tolerance
        // 容错：允许 ±5 的绝对差异（对应 5% 变化的容错空间）
        const tolerance = 5;
        return Math.abs(d - expectedDescNum) <= tolerance;
      });

      if (matchingDescNums.length === 0 && descNumSet.size > 0) {
        // desc 有数字但没有一个与 effect 匹配
        // 计算 desc 数字与 expected 的偏差
        const descNums = descNumbers.map(dn => parseFloat(dn));
        const maxDesc = Math.max(...descNums, 0);
        const minDesc = Math.min(...descNums, 0);
        const avgDesc = descNums.reduce((a, b) => a + b, 0) / Math.max(descNums.length, 1);
        const diffFromExpected = Math.abs(avgDesc - expectedDescNum);

        // 明显偏差判断：desc 平均值与 expected 的相对偏差超过 50%
        // 或者 desc 的最大/最小值与 expected 相差甚远
        const clearMismatch = diffFromExpected > 20 ||
          (Math.max(Math.abs(expectedDescNum), 1) > 0 && diffFromExpected / Math.max(Math.abs(expectedDescNum), 1) > 0.5);

        if (clearMismatch) {
          errors.push(`${c.id}: Effect ${type}.value=${en} 与 desc 中数字无法匹配 (expected desc ~${expectedDescNum}, desc 数字: ${descNumbers.join(', ')})`);
          failed++;
        }
        // 否则（偏差在容错范围内），视为通过，避免对自然差异报错
      }
      // 有 matchingDescNums 时什么也不做（正常匹配）
      // descNumSet.size === 0 时什么也不做（desc 可能纯文字描述）
    }
  }

  if (errors.length) {
    for (const e of errors) { console.error(`✗ ${e}`); }
  } else {
    console.log('✓ 卡牌 desc 与 effect 数值一致性检查通过');
  }
  return failed;
}

// ── 掩体多边形凹凸性与自相交检查 ──
function checkPolygonIntegrity() {
  let failed = 0;
  const errors = [];

  const U = require('../js/tank_utils.js');

  const tanksDir = path.join(ROOT, 'tanks');
  if (!fs.existsSync(tanksDir)) {
    console.log('⚡ 没有 tanks/ 目录，跳过多边形完整性检查');
    return 0;
  }

  function isConvex(verts) {
    if (verts.length < 3) return false;
    let sign = 0;
    const n = verts.length;
    for (let i = 0; i < n; i++) {
      const x1 = verts[i][0], y1 = verts[i][1];
      const x2 = verts[(i + 1) % n][0], y2 = verts[(i + 1) % n][1];
      const x3 = verts[(i + 2) % n][0], y3 = verts[(i + 2) % n][1];
      const cross = (x2 - x1) * (y3 - y2) - (y2 - y1) * (x3 - x2);
      if (cross !== 0) {
        const currentSign = cross > 0 ? 1 : -1;
        if (sign === 0) sign = currentSign;
        else if (sign !== currentSign) return false;
      }
    }
    return true;
  }

  function ccw(A, B, C) {
    return (C[1]-A[1])*(B[0]-A[0]) > (B[1]-A[1])*(C[0]-A[0]) ? 1 : -1;
  }

  function segmentsIntersect(p1, p2, p3, p4) {
    const t1 = ccw(p1, p2, p3);
    const t2 = ccw(p1, p2, p4);
    const t3 = ccw(p3, p4, p1);
    const t4 = ccw(p3, p4, p2);
    if (t1 !== t2 && t3 !== t4) return true;
    return false;
  }

  function isSelfIntersecting(verts) {
    const n = verts.length;
    if (n < 4) return false;
    for (let i = 0; i < n; i++) {
      const p1 = verts[i];
      const p2 = verts[(i + 1) % n];
      for (let j = i + 2; j < n; j++) {
        if (i === 0 && j === n - 1) continue;
        if (j === (i + 1) % n) continue;
        const p3 = verts[j];
        const p4 = verts[(j + 1) % n];
        if (segmentsIntersect(p1, p2, p3, p4)) return true;
      }
    }
    return false;
  }

  for (const f of fs.readdirSync(tanksDir).filter(f => f.endsWith('.json')).sort()) {
    try {
      const spec = JSON.parse(fs.readFileSync(path.join(tanksDir, f), 'utf8'));

      if (spec.hull && spec.hull.verts) {
        const convex = isConvex(spec.hull.verts);
        if (!convex) {
          errors.push(`${f}.hull: 非凸多边形`);
          failed++;
        }
        if (isSelfIntersecting(spec.hull.verts)) {
          errors.push(`${f}.hull: 自相交多边形`);
          failed++;
        }
      }

      if (spec.turret && spec.turret.verts) {
        const convex = isConvex(spec.turret.verts);
        if (!convex) {
          errors.push(`${f}.turret: 非凸多边形`);
          failed++;
        }
        if (isSelfIntersecting(spec.turret.verts)) {
          errors.push(`${f}.turret: 自相交多边形`);
          failed++;
        }
      }
    } catch (e) {
      // JSON 解析错误
    }
  }

  if (errors.length) {
    for (const e of errors) { console.error(`✗ ${e}`); }
  } else {
    console.log('✓ 所有 hull/turret 多边形为凸且无自相交');
  }
  return failed;
}

// ── 主程序 ───────────────────────────────────────────────────────────────────
console.log('== 卡牌 schema 校验 ==');
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

console.log('\n== Boss schema 与 ID 唯一性 ==');
const bosses = loadJsonDir('bosses');
const bossIds = {};
for (const b of bosses) {
  const errs = validateBoss(b);
  if (errs.length) { failed++; console.error(`✗ Boss ${b.id}: ${errs.join('; ')}`); }
  if (bossIds[b.id]) { failed++; console.error(`✗ Boss id 重复: ${b.id}`); }
  bossIds[b.id] = true;
}
console.log(`✓ Boss ${bosses.length} 个 schema 校验`);

console.log('\n== Tank 数据完整性 ==');
failed += checkDuplicateIds();

console.log('\n== 数值边界检查 ==');
failed += checkNumericBounds();

console.log('\n== desc / Effect 一致性检查 ==');
failed += checkDescEffectConsistency();

console.log('\n== 多边形几何完整性 ==');
failed += checkPolygonIntegrity();

console.log(failed ? `\nvalidate-content: ${failed} 项失败` : '\nvalidate-content: 全部通过');
process.exit(failed ? 1 : 0);