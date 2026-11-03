// test-card-picker.js — 通用卡牌选择器回归（js/tank_card_picker.js，2026-11-01）。
//
// 用户需求原文：「在右侧面板的卡牌测试 Card Test 开发新的卡牌选择器，提供主武器与升级、
//   副武器与升级、技能与升级（分主动、被动）、常规升级等多个下拉菜单和相应的卡牌管理按键。
//   注意该卡牌选择器考虑通用化，完成后考虑接入 battle 开发者面板的卡牌选择器」。
//
// 本测试锁四件事：
//   ① **分类完备性**：211 张卡 → 主武器 23 / 副武器 33 / 技能 23（主动 15 + 被动 8）/ 常规升级 132，
//      四类之和 == 卡池总数（不漏不重）。数字来自 2026-11-01 实测，内容变动时应同步更新。
//   ② **技能组分主动/被动**（用户明确要求）：optgroup 存在且两类都有内容。
//   ③ **多下拉结构**：mock DOM 下挂载后，select 数量 == 分组数量（不是「一个下拉装全部」）。
//   ④ **通用性**：卡池既可以是数组（battle devPanel 形态）也可以是 {id→spec} 映射转换后的数组；
//      宿主回调（onApply/onClear/onRollback/heldCount/describe）全部经 opts 注入，模块不读全局。
'use strict';

const fs = require('fs');
const path = require('path');
const U = require('../js/tank_utils.js');
const R = require('../js/tank_rules.js');
global.TAU = U.TAU;
global.RULES = R.RULES;

let fails = 0;
function ok(cond, label) {
  if (cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}`); fails++; }
}

const CARDS_DIR = path.join(__dirname, '..', 'cards');
const allCards = fs.readdirSync(CARDS_DIR)
  .filter(f => f.endsWith('.json'))
  .map(f => JSON.parse(fs.readFileSync(path.join(CARDS_DIR, f), 'utf8')));

// 模块在 require 时才读全局；这里先加载
const P = require('../js/tank_card_picker.js');

// ==================== ① 分类完备性 ====================
{
  const groups = P.buildPickerGroups(allCards);
  const byKey = {};
  for (const g of groups) byKey[g.key] = g.cards.length;
  const sum = groups.reduce((a, g) => a + g.cards.length, 0);

  ok(sum === allCards.length,
     `四类之和 == 卡池总数（${sum} / ${allCards.length}）`);
  ok(groups.length === 4, `恰好 4 个有效分组（实际 ${groups.length}：${groups.map(g => g.label).join(' / ')}）`);
  ok(byKey.primary === 23, `主武器与升级 = 23（实际 ${byKey.primary}）`);
  ok(byKey.secondary === 33, `副武器与升级 = 33（实际 ${byKey.secondary}）`);
  ok(byKey.ability === 23, `技能与升级 = 23（实际 ${byKey.ability}）`);
  ok(byKey.upgrade === 132, `常规升级 = 132（实际 ${byKey.upgrade}）`);
  // 负向：不得漏进 'other'
  ok(byKey.other === undefined, '负向：没有卡落进「其它」桶（分类覆盖完整）');
}

// ==================== ② 技能组分主动 / 被动 ====================
{
  const groups = P.buildPickerGroups(allCards);
  const ab = groups.find(g => g.key === 'ability');
  ok(!!ab, '技能组存在');
  ok(Array.isArray(ab.subgroups) && ab.subgroups.length === 2,
     `技能组有 2 个子组（实际 ${ab.subgroups ? ab.subgroups.length : 0}）`);
  const act = ab.subgroups.find(s => s.key === 'ability_active');
  const pas = ab.subgroups.find(s => s.key === 'ability_passive');
  ok(act && act.cards.length === 15, `主动技能 = 15（实际 ${act ? act.cards.length : '?'}）`);
  ok(pas && pas.cards.length === 8, `被动机制 = 8（实际 ${pas ? pas.cards.length : '?'}）`);
  ok(act.cards.length + pas.cards.length === ab.cards.length,
     '负向：主动 + 被动 == 技能组总数（无卡被漏掉）');
  // 语义校验：被动子组里的卡必须真的是 passive 效果
  ok(pas.cards.every(c => P.pickSkillKind(c) === 'passive'), '被动子组内每张卡都是 passive 效果');
  ok(act.cards.every(c => P.pickSkillKind(c) !== 'passive'), '负向：主动子组内没有 passive 卡');
}

// ==================== ③ 多下拉结构（mock DOM） ====================
function makeEl(tag) {
  const el = {
    tagName: (tag || 'div').toUpperCase(),
    id: '',
    textContent: '',
    innerHTML: '',
    value: '',
    disabled: false,
    className: '',
    dataset: {},
    children: [],
    style: { cssText: '' },
    _listeners: {},
    appendChild(c) { el.children.push(c); c.parentNode = el; return c; },
    removeChild(c) { const i = el.children.indexOf(c); if (i >= 0) el.children.splice(i, 1); return c; },
    addEventListener(ev, fn) { (el._listeners[ev] = el._listeners[ev] || []).push(fn); },
    fire(ev) { (el._listeners[ev] || []).forEach(fn => fn({ target: el })); },
  };
  return el;
}
function installDom() {
  global.document = /** @type {any} */ ({
    getElementById: () => null,
    createElement: (tag) => makeEl(tag),
  });
}
/** 测试桩 → 真实 HTMLElement 断言（桩只实现被测代码用到的接口，不需 300+ 属性） */
function asHost(el) { return /** @type {any} */ (el); }
/** 深度收集某种标签名的元素 */
function collect(node, tagName, out) {
  out = out || [];
  if (!node) return out;
  if (node.tagName === tagName.toUpperCase()) out.push(node);
  for (const c of (node.children || [])) collect(c, tagName, out);
  return out;
}

{
  installDom();
  const host = makeEl('div');
  let applied = null, cleared = 0, rolled = null;
  const api = P.mountCardPicker(asHost(host), {
    cards: allCards,
    onApply: (c) => { applied = c; },
    onClear: () => { cleared++; },
    onRollback: (c) => { rolled = c; },
    heldCount: () => 0,
    describe: (c) => c.desc || '',
    idPrefix: 'benchCp',
  });

  const selects = collect(api.el, 'select');
  ok(selects.length === 4, `挂载后有 4 个下拉（每个分组一个，实际 ${selects.length}）`);
  ok(selects.every(s => s.dataset && s.dataset.group), '每个下拉都带 data-group 标识');
  const keys = selects.map(s => s.dataset.group).sort().join(',');
  ok(keys === 'ability,primary,secondary,upgrade', `下拉分组键 = ${keys}`);

  // 技能下拉里有 optgroup（主动 / 被动）
  const abSel = selects.find(s => s.dataset.group === 'ability');
  const ogs = collect(abSel, 'optgroup');
  ok(ogs.length === 2, `技能下拉含 2 个 optgroup（实际 ${ogs.length}）`);

  // 管理按键存在
  const btns = collect(api.el, 'button');
  const labels = btns.map(b => b.textContent);
  ok(labels.includes('应用') && labels.includes('撤销一张') && labels.includes('清除全部'),
     `管理按键齐全：${labels.join(' / ')}`);

  // 选中 + 应用：走宿主回调
  const firstPrimary = P.buildPickerGroups(allCards).find(g => g.key === 'primary').cards[0];
  const priSel = selects.find(s => s.dataset.group === 'primary');
  priSel.value = firstPrimary.id;
  api.el._listeners = {};
  // 直接调用返回的 currentCard 校验查找逻辑
  ok(api.currentCard() && api.currentCard().id === firstPrimary.id,
     'currentCard() 能按下拉选中项找到卡牌');

  // 应用回调
  priSel.fire('change');
  const applyBtn = btns.find(b => b.textContent === '应用');
  applyBtn.fire('click');
  ok(applied && applied.id === firstPrimary.id, '点击「应用」触发 onApply 并带上选中的卡');

  // 清除回调
  const clearBtn = btns.find(b => b.textContent === '清除全部');
  clearBtn.fire('click');
  ok(cleared === 1, '点击「清除全部」触发 onClear 一次');
}

// ==================== ④ 多下拉互斥（避免误读成批量操作） ====================
{
  installDom();
  const host = makeEl('div');
  const api = P.mountCardPicker(asHost(host), { cards: allCards, onApply: () => {}, idPrefix: 'x' });
  const selects = collect(api.el, 'select');
  const pri = selects.find(s => s.dataset.group === 'primary');
  const sec = selects.find(s => s.dataset.group === 'secondary');
  const gp = P.buildPickerGroups(allCards);
  pri.value = gp.find(g => g.key === 'primary').cards[0].id;
  pri.fire('change');
  sec.value = gp.find(g => g.key === 'secondary').cards[0].id;
  sec.fire('change');
  ok(pri.value === '', '负向：在另一个下拉选中后，前一个下拉被清空（一次只应用一张）');
  ok(sec.value !== '', '当前下拉保留选中');
  ok(api.currentCard().id === sec.value, 'currentCard() 指向最后一个选中的卡');
}

// ==================== ⑤ 通用性：空池 / 缺回调不得崩 ====================
{
  installDom();
  const host = makeEl('div');
  let threw = null;
  try {
    const api = P.mountCardPicker(asHost(host), { cards: [], idPrefix: 'e' });
    const selects = collect(api.el, 'select');
    ok(selects.length === 0, '负向：空池时不渲染任何下拉');
    const btns = collect(api.el, 'button');
    ok(btns.every(b => b.disabled === true), '负向：空池时管理按键全部禁用');
  } catch (e) { threw = e; }
  ok(threw === null, `空池不抛错（${threw ? threw.message : '无异常'}）`);
}
{
  // 缺 onApply / onClear / onRollback / heldCount / describe 全部可选
  installDom();
  const host = makeEl('div');
  let threw = null;
  try {
    const api = P.mountCardPicker(asHost(host), { cards: allCards });
    const btns = collect(api.el, 'button');
    btns.find(b => b.textContent === '应用').fire('click');      // 无回调
    btns.find(b => b.textContent === '清除全部').fire('click');   // 无回调
    btns.find(b => b.textContent === '撤销一张').fire('click');   // 无回调
    ok(true, '缺全部可选回调时点击不抛错');
  } catch (e) { threw = e; ok(false, `缺回调时抛错：${threw.message}`); }
}
{
  installDom();
  const host = makeEl('div');
  ok(P.mountCardPicker(asHost(host), { cards: [] }) !== null, '最小参数（仅 cards）可挂载');
  ok(P.mountCardPicker(null, { cards: [] }) === null, '负向：host 为 null 时返回 null 而不是抛错');
}

// ==================== ⑥ 通用性：两种卡池形态 ====================
{
  // battle 形态：数组（本测试全程用这个）
  const asArray = allCards;
  // bench 形态：/api/cards 返回的 {id→spec} 映射 → 宿主自己转成数组后传入
  const asMap = {};
  for (const c of allCards) asMap[c.id] = c;
  const converted = Object.keys(asMap).map(id => Object.assign({ id }, asMap[id]));

  const g1 = P.buildPickerGroups(asArray);
  const g2 = P.buildPickerGroups(converted);
  ok(g1.length === g2.length, '两种卡池形态产生相同分组数');
  ok(g1.map(g => g.key + ':' + g.cards.length).join('|') === g2.map(g => g.key + ':' + g.cards.length).join('|'),
     '两种卡池形态产生相同分组构成（模块与数据源形态无关）');
}

// ==================== ⑦ 模块契约（不读全局、不用 ESM） ====================
{
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'tank_card_picker.js'), 'utf8');
  // 判据只看**代码**：先剥块注释（/** … */ 里写着「模块不读全局 player」是说明，不是违规）
  // 再剥行注释与字符串字面量里的说明性文字。
  const codeOnly = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
  ok(!/\bplayer\b/.test(codeOnly), '负向：模块不直接读全局 player（走 opts 注入）');
  ok(!/\bcardPool\b/.test(codeOnly), '负向：模块不直接读全局 cardPool');
  ok(/module\.exports/.test(src) && /globalThis\.TankCardPicker/.test(src),
     '双端导出（Node 测试 + 浏览器全局命名空间）');
  ok(/var\(--fs-/.test(src) && !/font-size:\s*\d+px/.test(src),
     '字号走设计令牌 var(--fs-*)，不写死 px（避免撞 bench 字号棘轮）');
  ok(typeof globalThis.TankCardPicker === 'object', '浏览器命名空间 globalThis.TankCardPicker 已挂载');
}

console.log('test-card-picker: 完成所有检查');
if (fails === 0) console.log('test-card-picker: 全部通过');
else { console.error(`test-card-picker: ${fails} 项失败`); process.exit(1); }
