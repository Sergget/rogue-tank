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
// 核心逻辑：卡牌 desc 使用整数百分比/绝对量（如 +15, -50, +10mm），
// effect value 的语义随 type/mode 分支（不是一律按乘法乘数）：
//   modifier/ammo mode=add  → 绝对加量，期望 desc 数字 ≈ value（如 +10mm → 10）
//   modifier/ammo mode=mult → 乘法乘数，期望 desc 数字 ≈ (value-1)*100
//                             （1.15 → 15，0.85 → -15；value<1 为缩减，
//                              desc 常写正数如"散布缩小 15%"，允许符号翻转匹配）
//   economy scoreMul        → 乘数语义（1.15 → +15%）
//   economy shopDiscount    → 小数语义（0.1 → +10%）
//   economy startScore/reviveCount → 绝对量（value 本身）
//   passive angle_boost     → 绝对量（+5°）
//   passive commander_sight → 直接百分比（+25%）
//   passive overmatch / reactive_armor / spall_liner → 阈值/标志/系数，不在 desc 展示，跳过
//   ability / drone         → 无数值期望，跳过
// 匹配规则：同期望值的多个 effect 可共享一个 desc 数字（如 bastion_armor
// "整车等效厚度 +30%" 同时覆盖 hull/turret 两个 ×1.3 效果），因此按期望值分组、
// 每组需 ≥1 个 ±5 容差内匹配的 desc 数字；无匹配时仅当最近数字偏差显著
// （绝对值 >20 或相对偏差 >50%）才报错，避免对"缩圈更快"这类纯文字描述的效果误报。
function checkDescEffectConsistency() {
  let failed = 0;
  const errors = [];

  // 单个 effect 的期望 desc 数字；返回 null 表示该效果不在 desc 中体现数字
  function expectedDescNum(ef) {
    if (ef.type === 'modifier' || ef.type === 'ammo') {
      if (ef.mode === 'add') return ef.value;              // +10mm / +100t 绝对量
      return Math.round((ef.value - 1) * 100);             // 1.15 → 15, 0.85 → -15
    }
    if (ef.type === 'economy') {
      if (ef.field === 'scoreMul') return Math.round((ef.value - 1) * 100); // 1.15 → +15%
      if (ef.field === 'shopDiscount') return Math.round(ef.value * 100);   // 0.1 → +10%
      return ef.value;                                     // startScore / reviveCount 绝对量
    }
    if (ef.type === 'passive') {
      if (ef.key === 'angle_boost') return ef.value;       // +5° 绝对量
      if (ef.key === 'commander_sight') return ef.value;   // +25% 直接百分比
      return null;                                         // 阈值/标志/系数（overmatch 等）
    }
    return null;                                           // ability / drone 无数值期望
  }

  // 缩减乘数（mult 且 value<1）：desc 常写正数（"散布缩小 15%"），允许符号翻转匹配
  function isSignFlexible(ef) {
    return (ef.type === 'modifier' || ef.type === 'ammo') && ef.mode === 'mult' && ef.value < 1;
  }

  const cards = loadJsonDir('cards');
  for (const c of cards) {
    if (!c.desc || !c.effects || c.effects.length === 0) continue;

    // 从 desc 中提取关键数字（整数或小数）
    const descNumbers = (c.desc.match(/-?\d+(?:\.\d+)?/g) || []).map(n => parseFloat(n));
    if (descNumbers.length === 0) continue; // desc 纯文字描述

    // 按期望值分组：同期望的 effect 共享匹配池（整车 +30% 覆盖 hull+turret 两个 ×1.3）
    const groups = new Map();
    for (const ef of c.effects) {
      if (typeof ef.value !== 'number' || !Number.isFinite(ef.value)) continue;
      const expected = expectedDescNum(ef);
      if (expected === null) continue;
      if (!groups.has(expected)) groups.set(expected, []);
      groups.get(expected).push(ef);
    }

    for (const [expected, effects] of groups) {
      const flex = effects.some(isSignFlexible);
      // 期望数字 ±5 容差内是否至少有一个 desc 数字
      const hasMatch = descNumbers.some(d => {
        if (Math.abs(d - expected) <= 5) return true;
        return flex && Math.abs(d + expected) <= 5; // 缩减乘数允许正数写法
      });
      if (hasMatch) continue;
      // 无匹配：仅当最近数字偏差显著（绝对值 >20 或相对偏差 >50%）才报错
      const minDiff = Math.min(...descNumbers.map(d =>
        Math.min(Math.abs(d - expected), flex ? Math.abs(d + expected) : Infinity)));
      const gross = minDiff > 20 || minDiff / Math.max(Math.abs(expected), 1) > 0.5;
      if (gross) {
        const desc = effects.map(e => `${e.type}.value=${e.value}`).join(' / ');
        errors.push(`${c.id}: Effect ${desc} 与 desc 中数字无法匹配 (expected desc ~${expected}, desc 数字: ${descNumbers.join(', ')})`);
        failed++;
      }
      // 否则（偏差在容错范围内），视为通过，避免对自然差异/纯文字描述报错
    }
  }

  if (errors.length) {
    for (const e of errors) { console.error(`✗ ${e}`); }
  } else {
    console.log('✓ 卡牌 desc 与 effect 数值一致性检查通过');
  }
  return failed;
}

// ── 坦克 hull/turret 多边形简单性检查 ──
// 底线是"简单多边形"：顶点数 ≥3、坐标有限、面积非零（非退化）、无自相交。
// 不做凸性要求——设计器用半形对称几何（js/tank_halfgeom.js 半形 + x 轴镜像）生成
// 完整多边形，车体天然允许内凹造型（车首斜面收窄等），引擎 raycastTank/partCorners
// 均支持凹多边形；凸性检查会把合法内凹坦克误报为数据错误。
function checkPolygonIntegrity() {
  let failed = 0;
  const errors = [];

  const U = require('../js/tank_utils.js');

  const tanksDir = path.join(ROOT, 'tanks');
  if (!fs.existsSync(tanksDir)) {
    console.log('⚡ 没有 tanks/ 目录，跳过多边形完整性检查');
    return 0;
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

  // 简单多边形检查：返回问题描述数组（空数组 = 合法）
  function checkSimplePolygon(verts) {
    const issues = [];
    if (!Array.isArray(verts) || verts.length < 3) {
      issues.push('顶点数不足 3');
      return issues;
    }
    let area = 0;
    for (let i = 0; i < verts.length; i++) {
      const a = verts[i];
      const b = verts[(i + 1) % verts.length];
      if (!Array.isArray(a) || a.length < 2 || !Number.isFinite(a[0]) || !Number.isFinite(a[1])) {
        issues.push('顶点含非有限坐标');
        return issues;
      }
      area += a[0] * b[1] - b[0] * a[1];
    }
    if (Math.abs(area) / 2 <= 0) issues.push('退化多边形（面积为零）');
    if (isSelfIntersecting(verts)) issues.push('自相交多边形');
    return issues;
  }

  for (const f of fs.readdirSync(tanksDir).filter(f => f.endsWith('.json')).sort()) {
    try {
      const spec = JSON.parse(fs.readFileSync(path.join(tanksDir, f), 'utf8'));

      if (spec.hull && spec.hull.verts) {
        for (const issue of checkSimplePolygon(spec.hull.verts)) {
          errors.push(`${f}.hull: ${issue}`);
          failed++;
        }
      }

      if (spec.turret && spec.turret.verts) {
        for (const issue of checkSimplePolygon(spec.turret.verts)) {
          errors.push(`${f}.turret: ${issue}`);
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
    console.log('✓ 所有 hull/turret 多边形为简单多边形（≥3 顶点、非退化、无自相交）');
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