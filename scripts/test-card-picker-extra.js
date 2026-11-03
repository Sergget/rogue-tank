// test-card-picker-extra.js — 卡牌选择器续补能力回归（2026-11-01 用户三条反馈）。
//
// 用户反馈原文：
//   ① 「副武器卡牌不生效？」
//   ② 「缺少已持有卡牌的管理器」
//   ③ 「缺少悬停显示卡牌详细文本」
//
// ① 的根因（本轮实测确认）：**不是卡牌系统的问题**——共享层 `applyCardToTank` 对安装卡
//   4/4 正确写入了 `weapons.secondary`（见 tmp/probe-bench-secondary.cjs）。真正的问题是
//   bench 的 `#btnF` 按钮以 `style="display:none"` 写死在 HTML 里，而**没有任何代码更新它**：
//   装上副武器后按钮仍隐藏、按 F 无反馈 ⇒ 观感就是"卡不生效"。
//   battle 侧这段渲染在 updateBottomHud 内联（约 55 行），本轮抽成共享 renderSecondaryButton。
//
// ②③ 由新模块的 mountOwnedCards / attachCardTip 提供，两页共用。
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

const ROOT = path.join(__dirname, '..');

// ==================== mock DOM ====================
function makeEl(tag) {
  const el = {
    tagName: (tag || 'div').toUpperCase(),
    textContent: '', innerHTML: '', value: '', disabled: false, className: '',
    title: '', dataset: {}, children: [], parentNode: null,
    style: { cssText: '', display: '', width: '' },
    _classes: new Set(),
    _listeners: {},
    classList: {
      toggle(c, on) { if (on === undefined) on = !el._classes.has(c); if (on) el._classes.add(c); else el._classes.delete(c); },
      add(c) { el._classes.add(c); }, remove(c) { el._classes.delete(c); }, contains(c) { return el._classes.has(c); },
    },
    appendChild(c) { el.children.push(c); c.parentNode = el; return c; },
    removeChild(c) { const i = el.children.indexOf(c); if (i >= 0) el.children.splice(i, 1); return c; },
    addEventListener(ev, fn) { (el._listeners[ev] = el._listeners[ev] || []).push(fn); },
    fire(ev) { (el._listeners[ev] || []).forEach(fn => fn({ target: el })); },
    getBoundingClientRect() { return { right: 100, top: 100, left: 50, bottom: 120 }; },
    querySelector(sel) { return el._q && el._q[sel] ? el._q[sel] : null; },
  };
  el._q = {};
  return el;
}
const store = {};
function installDom(ids) {
  for (const id of Object.keys(store)) delete store[id];
  for (const id of (ids || [])) store[id] = makeEl(id === 'btnF' ? 'button' : 'div');
  global.document = /** @type {any} */ ({
    getElementById: (id) => store[id] || null,
    createElement: (tag) => makeEl(tag),
    body: makeEl('body'),
    documentElement: makeEl('html'),
  });
  global.window = /** @type {any} */ ({ innerWidth: 1024, innerHeight: 768 });
  return store;
}

const PICKER = require('../js/tank_card_picker.js');
const HUDPANEL = require('../js/tank_hud_panel.js');

// ==================== ① 副武器 F 按钮反馈（用户反馈 ① 的根因修复） ====================
console.log('\n--- ① 副武器 F 按钮反馈 ---');
{
  const dom = installDom(['btnF', 'btnFIcon', 'cdF']);
  dom.btnF.style.display = 'none';   // 模拟 HTML 里写死的初始状态
  dom.btnF._q['#btnFIcon'] = dom.btnFIcon;

  // 未装副武器：保持隐藏
  let res = HUDPANEL.renderSecondaryButton({ weapons: { secondary: { type: 'none' } } }, {});
  ok(dom.btnF.style.display === 'none', '未装副武器 ⇒ btnF 保持隐藏');
  ok(res && res.type === null, '返回值标注 type=null');

  // 装上副炮塔：必须显示 + 图标「塔」
  res = HUDPANEL.renderSecondaryButton({
    weapons: { secondary: { type: 'turret', stats: {} } }, secondaryReloadT: 0,
  }, {});
  ok(dom.btnF.style.display === '', '装上副武器 ⇒ btnF 显示（用户反馈的根因）');
  ok(dom.btnFIcon.textContent === '塔', `图标 = 塔（实际「${dom.btnFIcon.textContent}」）`);
  ok(/自主开火/.test(res.title), '副炮塔 title 说明「自主开火，无需操作」');

  // 装填中：角标显示秒数
  res = HUDPANEL.renderSecondaryButton({
    weapons: { secondary: { type: 'rocket', stats: {} } }, secondaryReloadT: 3.24,
  }, {});
  ok(dom.cdF.textContent === '3.2', `装填角标 = 3.2（实际「${dom.cdF.textContent}」）`);
  ok(res.type === 'rocket', '返回值标注 type=rocket');
}
{
  // 导弹三态：未激活 / 索敌中 / 锁定中
  const dom = installDom(['btnF', 'btnFIcon', 'cdF']);
  dom.btnF._q['#btnFIcon'] = dom.btnFIcon;

  let res = HUDPANEL.renderSecondaryButton({
    weapons: { secondary: { type: 'missile', stats: {} } }, secondaryReloadT: 0, _missileActivated: false,
  }, {});
  ok(/按 F 激活索敌/.test(res.title), '导弹未激活 ⇒ title 说明如何激活');

  res = HUDPANEL.renderSecondaryButton({
    weapons: { secondary: { type: 'missile', stats: {} } }, secondaryReloadT: 0,
    _missileActivated: true, _missileLock: null,
  }, {});
  ok(dom.cdF.textContent === '索', `导弹索敌中 ⇒ 角标「索」（实际「${dom.cdF.textContent}」）`);
  ok(dom.btnF._classes.has('lock-hunting'), '索敌中带 lock-hunting 类（脉动反馈）');
  ok(/未找到可锁定目标/.test(res.title), 'title 说明缺什么条件（#J4 口径）');

  res = HUDPANEL.renderSecondaryButton({
    weapons: { secondary: { type: 'missile', stats: {} } }, secondaryReloadT: 0,
    _missileActivated: true, _missileLock: { t: 0.5, target: { hp: 10 } },
  }, {});
  ok(/%/.test(dom.cdF.textContent), `锁定中 ⇒ 角标显示百分比（实际「${dom.cdF.textContent}」）`);
  ok(dom.btnF._classes.has('lock-on'), '锁定中带 lock-on 类');
}
{
  // 榴弹炮：角标显示模式，且不被装填压制（#X5）
  const dom = installDom(['btnF', 'btnFIcon', 'cdF']);
  dom.btnF._q['#btnFIcon'] = dom.btnFIcon;
  HUDPANEL.renderSecondaryButton({
    weapons: { secondary: { type: 'howitzer', stats: {} } }, secondaryReloadT: 5, _howitzerOn: true,
  }, { isHowitzerMode: () => true });
  ok(dom.cdF.textContent === '曲', `榴弹炮曲射 ⇒ 角标「曲」，且装填中仍显示模式（#X5，实际「${dom.cdF.textContent}」）`);
}
{
  // 缺元素时静默跳过
  installDom([]);
  let threw = null;
  try { HUDPANEL.renderSecondaryButton({ weapons: { secondary: { type: 'turret' } } }, {}); } catch (e) { threw = e; }
  ok(threw === null, '宿主缺 #btnF 时不抛错（两页共用前提）');
}

// ==================== ② 已持有卡牌管理器 ====================
console.log('\n--- ② 已持有卡牌管理器 ---');
{
  installDom([]);
  const host = makeEl('div');
  let rolled = null, cleared = 0;
  const counts = { weapon_secondary_turret: 2, modifier_alpha: 1 };
  const api = PICKER.mountOwnedCards(/** @type {any} */ (host), /** @type {any} */ ({
    counts: () => counts,
    cardById: (id) => ({ id: id, name: '卡-' + id, desc: 'desc', rarity: 'rare' }),
    describe: (c) => c.desc,
    onRollback: (id) => { rolled = id; },
    onClear: () => { cleared++; },
  }));
  ok(api && typeof api.refresh === 'function', 'mountOwnedCards 可挂载并返回 refresh');

  const rows = [];
  (function walk(n) { if (n.className === 'owned-row') rows.push(n); for (const c of (n.children || [])) walk(c); })(host);
  ok(rows.length === 2, `渲染 2 行（实际 ${rows.length}）`);

  const firstText = rows[0].children[0].textContent;
  ok(/×2/.test(firstText), `层数 ×N 显示正确（实际「${firstText}」）`);

  const minus = rows[0].children.find(c => c.className === 'owned-minus');
  ok(!!minus, '[−1] 按钮存在');
  minus.fire('click');
  ok(rolled === 'weapon_secondary_turret', '点击 −1 回调带正确的 cardId');

  // 清除全部
  const clearBtn = [];
  (function walk(n) { if (n.className === 'owned-clear') clearBtn.push(n); for (const c of (n.children || [])) walk(c); })(host);
  ok(clearBtn.length === 1, '「清除全部」按钮存在');
  clearBtn[0].fire('click');
  ok(cleared === 1, '清除全部回调触发一次');
}
{
  // 空列表
  installDom([]);
  const host = makeEl('div');
  const api = PICKER.mountOwnedCards(/** @type {any} */ (host), /** @type {any} */ ({ counts: () => ({}), onRollback: () => {} }));
  ok(api !== null, '空持有列表也能挂载');
}

// ==================== ③ 悬停详情 tooltip ====================
console.log('\n--- ③ 悬停显示卡牌详情 ---');
{
  installDom([]);
  const el = makeEl('span');
  const card = { id: 'c1', name: '测试卡', rarity: 'epic', desc: '这是一张测试卡的描述文本' };
  PICKER.attachCardTip(/** @type {any} */ (el), card, { describe: (c) => c.desc });

  ok(el._listeners.mouseenter && el._listeners.mouseenter.length === 1, 'mouseenter 监听已绑定');
  ok(el._listeners.mouseleave && el._listeners.mouseleave.length === 1, 'mouseleave 监听已绑定');

  el.fire('mouseenter');
  ok(global.document.body.children.length >= 1, 'tooltip 元素已插入 body');
  // 测试桩：body.children 里放的是自定义 makeEl 对象，不是真实 Element（无 .style）
  const tipEl = /** @type {any} */ (global.document.body.children[global.document.body.children.length - 1]);
  ok(tipEl.style.display === 'block', 'hover 后 tooltip 显示');
  ok(/测试卡/.test(tipEl.innerHTML), 'tooltip 含卡名');
  ok(/测试卡的描述文本/.test(tipEl.innerHTML), 'tooltip 含描述正文');
  ok(/epic/.test(tipEl.innerHTML), 'tooltip 含稀有度');

  el.fire('mouseleave');
  ok(tipEl.style.display === 'none', '移出后 tooltip 隐藏');
}
{
  // 关键：反复 attach 不得叠加监听器（早期实现的泄漏缺陷）
  installDom([]);
  const el = makeEl('span');
  const card = { id: 'c2', name: '卡2', desc: 'd' };
  for (let i = 0; i < 5; i++) PICKER.attachCardTip(/** @type {any} */ (el), card, { describe: (c) => c.desc });
  ok(el._listeners.mouseenter.length === 1,
     `负向：5 次 attach 后 mouseenter 监听仍为 1 个（实际 ${el._listeners.mouseenter.length}）`);
}
{
  // 传函数取卡：内容可变（select 选中项）
  // 注意：_tipEl 在模块内做单例缓存（isConnected 判定），测试桩的 body 每次 installDom 都会重建，
  //   故这里**不重新 installDom**，直接复用同一个 body，只在两次 hover 之间改 cur。
  const el = makeEl('span');
  let cur = { id: 'a', name: 'A卡', desc: 'A描述' };
  PICKER.attachCardTip(/** @type {any} */ (el), () => cur, { describe: (c) => c.desc });
  el.fire('mouseenter');
  const tipEl = global.document.body.children[global.document.body.children.length - 1];
  ok(/A卡/.test(tipEl.innerHTML), '取卡函数在 hover 时刻求值（A）');
  el.fire('mouseleave');
  cur = { id: 'b', name: 'B卡', desc: 'B描述' };
  el.fire('mouseenter');
  ok(/B卡/.test(tipEl.innerHTML), '取卡函数随内容变化生效（B）');
}
{
  // 空卡不崩
  installDom([]);
  const el = makeEl('span');
  let threw = null;
  try {
    PICKER.attachCardTip(/** @type {any} */ (el), null, {});
    el.fire('mouseenter');
    el.fire('mouseleave');
  } catch (e) { threw = e; }
  ok(threw === null, '负向：card 为 null 时 hover 不抛错');
}

// ==================== ④ 页面接线（bench 三处入口都在） ====================
console.log('\n--- ④ 页面接线 ---');
{
  const bench = fs.readFileSync(path.join(ROOT, 'tank_bench.html'), 'utf8');
  ok(/id="benchOwnedCards"/.test(bench), 'bench 有已持有管理器容器 #benchOwnedCards');
  ok(/TankCardPicker\.mountOwnedCards/.test(bench), 'bench 挂载了 mountOwnedCards');
  ok(/TankHudPanel\.renderSecondaryButton/.test(bench), 'bench 调用 renderSecondaryButton（副武器反馈）');
  ok(/benchOwnedCounts/.test(bench), 'bench 有持有计数函数（与 battle 同口径：按 cardId 计数 cardEffects）');

  // 负向：不能再用旧的 cardStackCount 口径（它只统计 card:* modifiers，会漏纯 modifier 卡）
  ok(!/cardStackCount\(player, card\.id\)/.test(bench),
     '负向：bench 不再用 cardStackCount 取层数（改按 cardEffects 计数）');

  const hud = fs.readFileSync(path.join(ROOT, 'js', 'tank_hud_panel.js'), 'utf8');
  ok(/renderSecondaryButton/.test(hud), '共享层导出 renderSecondaryButton');
  ok(/SECONDARY_ICONS/.test(hud) && /SECONDARY_LABELS/.test(hud), '共享层含副武器图标/名称表');
}

console.log('test-card-picker-extra: 完成所有检查');
if (fails === 0) console.log('test-card-picker-extra: 全部通过');
else { console.error(`test-card-picker-extra: ${fails} 项失败`); process.exit(1); }
