// tank_card_picker.js — 通用卡牌选择器（2026-11-01，user 需求
//   「在右侧面板的卡牌测试 Card Test 开发新的卡牌选择器，提供主武器与升级、副武器与升级、
//     技能与升级（分主动、被动）、常规升级等多个下拉菜单和相应的卡牌管理按键。
//     注意该卡牌选择器考虑通用化，完成后考虑接入 battle 开发者面板的卡牌选择器」）。
//
// 设计目标（为什么是「通用」而不是「bench 专用」）：
//   同一份模块被两个宿主使用，宿主差异全部经 opts 注入：
//     · bench  → 右侧 Card Test 区，卡池是 /api/cards 的 {id→spec} 映射
//     · battle → 开发者面板「卡牌」Tab，卡池是数组
//   因此本模块**不读全局 cardPool / player**，一切经 opts 传入；DOM 容器也由宿主提供。
//
// 与既有 devCardGroupKey/DEV_CARD_GROUPS（11 组，按效果类型）的关系：
//   那是**细粒度**分组（主武器安装 / 主武器升级 / … 共 11 类），用于 battle 的折叠列表。
//   本模块的**粗分组**是用户指定的 4+1 类（主武器 / 副武器 / 技能 / 常规升级 / 其它），
//   用于下拉分区；技能组内部再分「主动 / 被动」（用户明确要求）。
//   两套口径不冲突也不重复判定：粗分组只看 effect.type + slot，细分类仍归 devpanel。
'use strict';

// ==================== 一、粗分组定义（用户指定的分类） ====================
// 判据顺序即优先级（首个匹配）。match 只读 card.effects，纯函数、无 DOM。
const PICK_GROUPS = [
  {
    key: 'primary',
    label: '主武器与升级',
    icon: '主',
    match: function (c) {
      return (c.effects || []).some(function (ef) {
        return ef.type === 'weapon' && (ef.slot || 'primary') === 'primary';
      });
    }
  },
  {
    key: 'secondary',
    label: '副武器与升级',
    icon: '副',
    match: function (c) {
      return (c.effects || []).some(function (ef) {
        return ef.type === 'weapon' && ef.slot === 'secondary';
      });
    }
  },
  {
    key: 'ability',
    label: '技能与升级',
    icon: '技',
    match: function (c) {
      return (c.effects || []).some(function (ef) {
        return ef.type === 'ability' || ef.type === 'passive' || ef.type === 'drone';
      });
    }
  },
  {
    key: 'upgrade',
    label: '常规升级',
    icon: '升',
    match: function (c) {
      return (c.effects || []).some(function (ef) {
        return ef.type === 'modifier' || ef.type === 'ammo' || ef.type === 'economy';
      });
    }
  }
];

/** 粗分组键（首个匹配；无匹配 → 'other'） */
function pickGroup(card) {
  if (!card) return 'other';
  for (const g of PICK_GROUPS) { if (g.match(card)) return g.key; }
  return 'other';
}

/** 粗分组中文名 */
function pickGroupLabel(key) {
  const g = PICK_GROUPS.find(function (x) { return x.key === key; });
  return g ? g.label : '其它';
}

/**
 * 技能组内再分「主动 / 被动」——用户明确要求「技能与升级（分主动、被动）」。
 * @returns {'active'|'passive'|'other'}
 */
function pickSkillKind(card) {
  const efs = (card && card.effects) || [];
  if (efs.some(function (ef) { return ef.type === 'passive'; })) return 'passive';
  if (efs.some(function (ef) { return ef.type === 'ability'; })) return 'active';
  if (efs.some(function (ef) { return ef.type === 'drone'; })) return 'active';
  return 'other';
}

// ==================== 二、分组（供宿主填充多个下拉） ====================

/**
 * 把卡池按用户指定的维度切成若干「下拉数据源」。
 * @param {Array<object>} cards 卡牌数组
 * @param {object} [opts] { sortWithin=true }
 * @returns {Array<{key,label,icon,cards,subgroups?:Array}>}
 */
function buildPickerGroups(cards, opts) {
  /** @type {any} */
  const O = opts || {};
  const buckets = new Map();
  for (const g of PICK_GROUPS) buckets.set(g.key, []);
  const other = [];
  for (const c of (cards || [])) {
    if (!c) continue;
    const k = pickGroup(c);
    if (k === 'other') other.push(c);
    else buckets.get(k).push(c);
  }
  const byName = function (a, b) {
    return String((a && (a.name || a.id)) || '').localeCompare(String((b && (b.name || b.id)) || ''), 'zh-Hans-CN');
  };
  const out = [];
  for (const g of PICK_GROUPS) {
    const list = buckets.get(g.key);
    if (!list || !list.length) continue;
    if (O.sortWithin !== false) list.sort(byName);
    const entry = { key: g.key, label: g.label, icon: g.icon, cards: list };
    // 技能组额外切出「主动 / 被动」两个 optgroup（用户要求）
    if (g.key === 'ability') {
      const act = list.filter(function (c) { return pickSkillKind(c) !== 'passive'; });
      const pas = list.filter(function (c) { return pickSkillKind(c) === 'passive'; });
      entry.subgroups = [];
      if (act.length) entry.subgroups.push({ key: 'ability_active', label: '主动技能', cards: act });
      if (pas.length) entry.subgroups.push({ key: 'ability_passive', label: '被动机制', cards: pas });
    }
    out.push(entry);
  }
  if (other.length) {
    if (O.sortWithin !== false) other.sort(byName);
    out.push({ key: 'other', label: '其它', icon: '他', cards: other });
  }
  return out;
}

// ==================== 三、DOM 构建（宿主给容器 + 回调） ====================

/**
 * 在容器内构建**多个下拉菜单** + 管理按键的卡牌选择器。
 *
 * 结构（用户指定「多个下拉菜单」⇒ 每个分组一个独立下拉，而不是一个下拉里混装）：
 *   主武器与升级 [下拉]
 *   副武器与升级 [下拉]
 *   技能与升级   [下拉]  ← 内部分「主动技能 / 被动机制」两个 optgroup
 *   常规升级     [下拉]
 *        [应用] [撤销一张] [清除全部]
 *
 * 参数全经 opts 注入（模块不读全局 player / cardPool —— 这是它能被两页共用的前提）：
 *   cards        卡池数组（必需）
 *   onApply      点击「应用」的回调
 *   onClear      点击「清除全部」的回调
 *   onRollback   点击「撤销一张」的回调
 *   heldCount    已持有层数查询
 *   describe     卡面描述求值（占位符展开）
 *   emptyText    空池提示文案
 *   idPrefix     元素 id 前缀（同页多处挂载时避免冲突）
 * @returns {{el, refresh, currentCard, selectFor, groupKeys, destroy}}
 */
function mountCardPicker(host, opts) {
  /** @type {any} */
  const O = opts || {};
  const pre = O.idPrefix || 'cp';
  if (!host) return null;

  let groups = buildPickerGroups(O.cards, {});
  const selects = {};        // groupKey -> <select>

  host.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'card-picker';
  wrap.style.cssText = 'display:flex; flex-direction:column; gap:5px;';

  const rowsHost = document.createElement('div');
  rowsHost.style.cssText = 'display:flex; flex-direction:column; gap:4px;';
  wrap.appendChild(rowsHost);

  const btnRow = document.createElement('div');
  btnRow.className = 'cp-actions';
  btnRow.style.cssText = 'display:flex; flex-wrap:wrap; gap:6px; margin-top:2px;';

  const applyBtn = document.createElement('button');
  applyBtn.id = pre + 'ApplyBtn';
  applyBtn.textContent = '应用';
  const rollbackBtn = document.createElement('button');
  rollbackBtn.id = pre + 'RollbackBtn';
  rollbackBtn.textContent = '撤销一张';
  const clearBtn = document.createElement('button');
  clearBtn.id = pre + 'ClearBtn';
  clearBtn.textContent = '清除全部';
  btnRow.appendChild(applyBtn);
  btnRow.appendChild(rollbackBtn);
  btnRow.appendChild(clearBtn);
  wrap.appendChild(btnRow);

  const hintEl = document.createElement('div');
  hintEl.className = 'cp-hint';
  hintEl.style.cssText = 'color:var(--text-dim); font-size:var(--fs-xs); line-height:1.5;';
  wrap.appendChild(hintEl);

  host.appendChild(wrap);

  /** 跨全部下拉找「当前有选中项」的卡（返回第一个） */
  function currentCard() {
    const keys = Object.keys(selects);
    for (const key of keys) {
      const sel = selects[key];
      if (!sel || !sel.value) continue;
      const g = groups.find(function (x) { return x.key === key; });
      const hit = g && g.cards.find(function (c) { return c.id === sel.value; });
      if (hit) return hit;
    }
    return null;
  }

  /** 多下拉语义：某条选中后其余置空（「应用」只作用于这一条，避免被误读成批量操作） */
  function clearOtherSelects(keepKey) {
    for (const key of Object.keys(selects)) {
      if (key !== keepKey && selects[key]) selects[key].value = '';
    }
  }

  function updateHint() {
    const c = currentCard();
    if (!c) { hintEl.textContent = O.emptyText || '选择一个分类下的卡牌后点「应用」'; return; }
    const desc = (typeof O.describe === 'function') ? O.describe(c) : (c.desc || '');
    const held = (typeof O.heldCount === 'function') ? (O.heldCount(c) || 0) : 0;
    hintEl.textContent = desc + (held ? '（当前已持有 ×' + held + '）' : '');
  }

  function buildGroupRow(g) {
    const row = document.createElement('div');
    row.className = 'cp-row';
    row.style.cssText = 'display:flex; align-items:center; gap:6px;';

    const lbl = document.createElement('span');
    lbl.textContent = g.label;
    lbl.style.cssText = 'color:var(--text-dim); font-size:var(--fs-xs); min-width:64px; flex:0 0 auto;';
    row.appendChild(lbl);

    const sel = document.createElement('select');
    sel.id = pre + 'Sel_' + g.key;
    sel.dataset.group = g.key;
    sel.style.cssText = 'flex:1; min-width:0; font-size:var(--fs-xs); padding:3px 5px;';

    const ph = document.createElement('option');
    ph.value = '';
    ph.textContent = '— ' + g.label + '（' + g.cards.length + '）—';
    sel.appendChild(ph);

    const held = (typeof O.heldCount === 'function') ? O.heldCount : function () { return 0; };
    const emit = function (list, parent) {
      for (const c of list) {
        const o = document.createElement('option');
        o.value = c.id;
        const n = held(c) || 0;
        o.textContent = (c.name || c.id) + (c.rarity ? ' · ' + c.rarity : '') + (n ? ' ×' + n : '');
        (parent || sel).appendChild(o);
      }
    };
    // 技能组：按「主动 / 被动」分成两个 optgroup（用户要求分主动、被动）
    if (g.subgroups && g.subgroups.length) {
      for (const sg of g.subgroups) {
        const og = document.createElement('optgroup');
        og.label = sg.label + '（' + sg.cards.length + '）';
        emit(sg.cards, og);
        sel.appendChild(og);
      }
    } else {
      emit(g.cards);
    }

    sel.addEventListener('change', function () {
      if (sel.value) clearOtherSelects(g.key);
      updateHint();
    });
    // 悬停在下拉上时，显示「当前选中项」的详情（原生 select 的 option 无法直接绑事件）。
    // 传函数而非对象：选中项会变，取卡必须延迟到 hover 时刻。
    attachCardTip(sel, function () {
      return sel.value ? (g.cards.find(function (c) { return c.id === sel.value; }) || null) : null;
    }, { describe: O.describe, delayMs: 300 });

    selects[g.key] = sel;
    row.appendChild(sel);
    return row;
  }

  function refresh(cards) {
    if (cards) O.cards = cards;
    groups = buildPickerGroups(O.cards, {});
    for (const k of Object.keys(selects)) delete selects[k];
    rowsHost.innerHTML = '';

    if (!groups.length) {
      const empty = document.createElement('div');
      empty.style.cssText = 'color:var(--text-dim); font-size:var(--fs-xs);';
      empty.textContent = O.emptyText || '（卡池为空）';
      rowsHost.appendChild(empty);
      hintEl.textContent = '';
      applyBtn.disabled = true;
      rollbackBtn.disabled = true;
      clearBtn.disabled = true;
      return;
    }
    applyBtn.disabled = false;
    rollbackBtn.disabled = false;
    clearBtn.disabled = false;
    for (const g of groups) rowsHost.appendChild(buildGroupRow(g));
    updateHint();
  }

  // ---- 事件 ----
  applyBtn.addEventListener('click', function () {
    const c = currentCard();
    if (c && typeof O.onApply === 'function') O.onApply(c);
    updateHint();
  });
  clearBtn.addEventListener('click', function () {
    if (typeof O.onClear === 'function') O.onClear();
    refresh();
  });
  rollbackBtn.addEventListener('click', function () {
    const c = currentCard();
    if (c && typeof O.onRollback === 'function') O.onRollback(c);
    updateHint();
  });

  refresh();

  return {
    el: wrap,
    refresh: refresh,
    currentCard: currentCard,
    selectFor: function (key) { return selects[key] || null; },
    groupKeys: function () { return Object.keys(selects); },
    destroy: function () { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); }
  };
}

// ==================== 四、卡牌详情悬停 tooltip（2026-11-01 用户要求「悬停显示卡牌详细文本」） ====================
// 从 js/tank_devpanel.js 的既有实现抽上来，供两页共用（那份实现只服务于 battle 的折叠列表）。
// 保留原口径：稀有度彩色标题 + formatCardDesc 求值（{value}/{pct}/{ov:key} 实时展开）
//   + 位置避让（超出视口右/下边缘时向左/上翻折）。
let _tipEl = null;
let _tipTimer = null;

function _ensureTipEl() {
  // 复用条件（2026-11-01 修）：旧实现只判 `isConnected`，而该属性在非浏览器宿主（测试桩、
  //   某些嵌入环境）恒为 undefined ⇒ 每次 hover 都新建一个 tip，页面上会越积越多。
  //   改为「存在 且 仍在我挂载的那个父节点下」双条件，真实 DOM 与测试桩都成立。
  const parent = (typeof document !== 'undefined') ? (document.body || document.documentElement) : null;
  if (_tipEl && parent && _tipEl.parentNode === parent) return _tipEl;
  if (typeof document === 'undefined' || !document.createElement) return null;
  _tipEl = document.createElement('div');
  _tipEl.className = 'card-tip';
  _tipEl.style.cssText = 'position:fixed; z-index:80; max-width:300px; padding:8px 10px; display:none;'
    + ' background:rgba(10,11,8,0.96); border:1px solid var(--amber-dim); border-radius:4px;'
    + ' font-size:var(--fs-xs); line-height:1.55; color:var(--text); pointer-events:none;'
    + ' box-shadow:0 4px 14px rgba(0,0,0,0.55);';
  (parent || document.documentElement).appendChild(_tipEl);
  return _tipEl;
}

/** 卡牌详情 HTML（稀有度色标题 + 描述） */
function cardTipHtml(card, describe) {
  if (!card) return '';
  const rarCol = ({ common: 'var(--text-dim)', rare: 'var(--blue)', epic: 'var(--purple)', legendary: 'var(--amber)', mythic: 'var(--red)' })[card.rarity] || 'var(--text-dim)';
  const desc = (typeof describe === 'function') ? describe(card) : (card.desc || '');
  return '<div style="color:' + rarCol + '; font-weight:700; margin-bottom:3px;">'
    + (card.name || card.id)
    + ' <span style="font-weight:400; font-size:var(--fs-xs); opacity:0.75;">[' + (card.rarity || '') + ']</span></div>'
    + '<div>' + desc + '</div>';
}

/**
 * 给一个元素挂「悬停显示卡牌详情」。
 * card 可以是对象，也可以是**返回对象的函数**（用于"内容会变"的场景，如 select 选中项）。
 * 内部只绑定一次监听器 —— 反复调用同一元素不会叠加（早期写成每次 mouseenter 都 attach 会泄漏）。
 * 参数：el = 目标元素；card = 卡牌对象或取卡函数；opts = { describe, delayMs }。
 */
function attachCardTip(el, card, opts) {
  if (!el || typeof el.addEventListener !== 'function') return;
  const O = opts || {};
  const delay = (typeof O.delayMs === 'number') ? O.delayMs : 0;
  const resolve = (typeof card === 'function') ? card : function () { return card; };
  if (el._cardTipBound) {
    // 已绑定：只更新取卡函数与描述器，不再叠加监听器
    el._cardTipResolve = resolve;
    el._cardTipOpts = O;
    return;
  }
  el._cardTipBound = true;
  el._cardTipResolve = resolve;
  el._cardTipOpts = O;
  el.addEventListener('mouseenter', function () {
    const show = function () {
      const c = (typeof el._cardTipResolve === 'function') ? el._cardTipResolve() : el._cardTipResolve;
      if (!c) return;
      const tip = _ensureTipEl();
      if (!tip) return;
      const curO = el._cardTipOpts || {};
      tip.innerHTML = cardTipHtml(c, curO.describe);
      tip.style.display = 'block';
      // 位置：元素右缘 +12px；溢出时向左/上翻折
      const r = (typeof el.getBoundingClientRect === 'function') ? el.getBoundingClientRect() : { right: 0, top: 0, left: 0 };
      const winW = (typeof window !== 'undefined' && window.innerWidth) ? window.innerWidth : 1024;
      const winH = (typeof window !== 'undefined' && window.innerHeight) ? window.innerHeight : 768;
      const tw = tip.offsetWidth || 0, th = tip.offsetHeight || 0;
      let x = r.right + 12, y = r.top;
      if (x + tw > winW - 8) x = Math.max(8, r.left - tw - 12);
      if (y + th > winH - 8) y = Math.max(8, winH - th - 8);
      tip.style.left = x + 'px';
      tip.style.top = y + 'px';
    };
    if (delay > 0) { _tipTimer = setTimeout(show, delay); } else { show(); }
  });
  el.addEventListener('mouseleave', function () {
    if (_tipTimer) { clearTimeout(_tipTimer); _tipTimer = null; }
    if (_tipEl) _tipEl.style.display = 'none';
  });
}

// ==================== 五、已持有卡牌管理器（2026-11-01 用户要求「缺少已持有卡牌的管理器」） ====================

/**
 * 渲染「已持有卡牌」管理器：每行 = 卡名 ×层数 + [−1] 回退按钮，另有「清除全部」。
 * 与 battle devPanel 的既有语义一致：−1 = 撤销最近一次该卡的施加（重放语义由宿主实现）。
 *
 * 参数：host = 容器；opts = { counts, cardById, describe, onRollback, onClear, emptyText }。
 * 返回 { refresh, el }。
 */
function mountOwnedCards(host, opts) {
  const O = opts || {};
  if (!host || typeof document === 'undefined') return null;

  host.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'owned-cards';
  wrap.style.cssText = 'display:flex; flex-direction:column; gap:3px;';

  const head = document.createElement('div');
  head.style.cssText = 'display:flex; align-items:center; gap:6px;';
  const title = document.createElement('span');
  title.textContent = '已持有';
  title.style.cssText = 'color:var(--text-dim); font-size:var(--fs-xs); flex:1;';
  head.appendChild(title);
  const clearBtn = document.createElement('button');
  clearBtn.className = 'owned-clear';
  clearBtn.textContent = '清除全部';
  clearBtn.addEventListener('click', function () {
    if (typeof O.onClear === 'function') O.onClear();
    refresh();
  });
  head.appendChild(clearBtn);
  wrap.appendChild(head);

  const list = document.createElement('div');
  list.className = 'owned-list';
  list.style.cssText = 'display:flex; flex-direction:column; gap:2px; max-height:180px; overflow-y:auto;';
  wrap.appendChild(list);
  host.appendChild(wrap);

  function refresh() {
    const counts = (typeof O.counts === 'function') ? (O.counts() || {}) : {};
    const ids = Object.keys(counts);
    list.innerHTML = '';
    if (!ids.length) {
      const empty = document.createElement('div');
      empty.style.cssText = 'color:var(--text-dim); font-size:var(--fs-xs);';
      empty.textContent = O.emptyText || '尚未持有任何卡牌';
      list.appendChild(empty);
      return;
    }
    for (const id of ids) {
      const n = counts[id];
      const card = (typeof O.cardById === 'function') ? O.cardById(id) : { id: id, name: id };
      const row = document.createElement('div');
      row.className = 'owned-row';
      row.style.cssText = 'display:flex; align-items:center; gap:6px; padding:1px 4px;'
        + ' border:1px solid var(--line); background:rgba(8,9,6,0.5);';

      const nameEl = document.createElement('span');
      nameEl.style.cssText = 'flex:1; min-width:0; font-size:var(--fs-xs); overflow:hidden;'
        + ' text-overflow:ellipsis; white-space:nowrap;';
      nameEl.textContent = ((card && (card.name || card.id)) || id) + ' ×' + n;
      row.appendChild(nameEl);

      if (card) {
        // 悬停显示详情（用户要求）—— 持有列表里同样要能看描述
        attachCardTip(nameEl, card, { describe: O.describe });
      }

      const minus = document.createElement('button');
      minus.className = 'owned-minus';
      minus.textContent = '−1';
      minus.title = '撤销最近一次施加的这张卡';
      minus.dataset.cardId = id;
      minus.addEventListener('click', function () {
        if (typeof O.onRollback === 'function') O.onRollback(id);
        refresh();
      });
      row.appendChild(minus);

      list.appendChild(row);
    }
  }

  refresh();
  return { refresh: refresh, el: wrap };
}

// ==================== 导出 ====================
const TankCardPicker = {
  PICK_GROUPS: PICK_GROUPS,
  pickGroup: pickGroup,
  pickGroupLabel: pickGroupLabel,
  pickSkillKind: pickSkillKind,
  buildPickerGroups: buildPickerGroups,
  mountCardPicker: mountCardPicker,
  attachCardTip: attachCardTip,
  cardTipHtml: cardTipHtml,
  mountOwnedCards: mountOwnedCards,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = TankCardPicker;
}
if (typeof globalThis !== 'undefined') {
  globalThis.TankCardPicker = TankCardPicker;
}
