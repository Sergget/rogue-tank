// tank_hud_panel.js — 底部状态 HUD 的**共享渲染层**（2026-11-01，用户需求
//   「bench 的弹种条 / 技能（主被动）/ 速度 / 血量 UI 采用 tank_battle.html 中的 UI」）。
//
// 为什么需要这个模块：这些控件此前**全部内联在 tank_battle.html 的 updateBottomHud()**
//   （约 190 行，混装「血量/速度/弹种槽/4-6 键/技能槽/被动槽/F 按钮」与「Boss 血条/暴露度」
//   两块 battle 专属内容）。bench 要「采用 battle 的 UI」，只有两条路：
//     ① 复制一份 → 就是 AGENTS.md §2.1 反复警告的「同功能两套实现」；
//     ② 把**通用**部分抽到这里，两页共用 → 本模块。
//   故本模块只放「与页面无关、只读 tank 实体 + DOM」的渲染；页面专属的（Boss 血条、
//   暴露度、战斗态门控、技能派发）留在各自页面。
//
// 设计约束（严格遵守）：
//   · **纯渲染**：不写实体字段、不新增判定、不碰 RULES 的写入面；只有读取与 DOM 赋值。
//   · **DOM 由调用方提供 id**：不硬编码「只属于 battle」的 DOM 树；宿主缺元素即静默跳过
//     （bench 的靶车面板不共用玩家血量 DOM，互不影响）。
//   · **无 ESM**：与仓库其它模块一致，底部 `module.exports` + `globalThis.TankHudPanel`。
//   · **不写 JSDoc @param**：与 js/tank_hud.js / tank_devpanel.js 等既有模块保持一致
//     （仓库 tsc 配置下，显式 `@param {object}` 会把隐式 any 收紧成真类型检查，
//       反而让"读一个实体字段"变成错误；既有模块一律不标注）。
'use strict';

// ==================== 通用小工具 ====================

/** 取元素（无 document 时返回 null —— Node 测试端安全） */
function _el(id) {
  return (typeof document !== 'undefined' && document.getElementById) ? document.getElementById(id) : null;
}

/** 设置文本（元素不存在则跳过） */
function _text(id, txt) {
  const el = _el(id);
  if (el) el.textContent = txt;
  return !!el;
}

/** 设置宽度百分比（元素不存在则跳过） */
function _width(id, pct) {
  const el = _el(id);
  if (el) el.style.width = pct + '%';
  return !!el;
}

/** 切换类（元素不存在则跳过） */
function _toggleClass(el, cls, on) {
  if (el && el.classList) el.classList.toggle(cls, !!on);
}

// ==================== ① 玩家血量 ====================

/**
 * 渲染玩家血条（与 battle 口径一致：ceil(hp) / round(maxHp)）。
 * ids 可选：{ track, fill, val } —— 覆盖元素 id（缺省用 battle 的名字）。
 */
function renderPlayerVitals(player, ids) {
  const I = ids || {};
  if (!player) return null;
  const hp = Math.max(0, Number(player.hp) || 0);
  const maxHp = Math.max(1, (player.stats && Number(player.stats.maxHp)) || 1);
  _width(I.fill || 'playerHpFill', hp / maxHp * 100);
  _text(I.val || 'playerHpVal', Math.ceil(hp) + ' / ' + Math.round(maxHp));
  return { hp: hp, maxHp: maxHp, pct: hp / maxHp };
}

// ==================== ② 速度仪表 ====================

/**
 * 渲染速度读数（D/R 档位 + km/h + 公路加成）。
 * 换算必须走 tankCurrentKmh / roadBonusKmh（js/tank_model.js 的既有唯一口径）——
 * 直接乘 kmhFactor 会读出 ~208km/h（见 tank_model.js:1163 的注释）。
 */
function renderSpeedGauge(player, opt) {
  const O = opt || {};
  if (!player) return null;
  // 跨模块全局一律经 globalThis 读取（与 js/tank_hud.js 同惯例，别直接引用裸标识符）
  const _cur = (typeof globalThis !== 'undefined' && typeof globalThis.tankCurrentKmh === 'function')
    ? globalThis.tankCurrentKmh : null;
  const _road = (typeof globalThis !== 'undefined' && typeof globalThis.roadBonusKmh === 'function')
    ? globalThis.roadBonusKmh : null;
  const kmh = _cur ? _cur(player) : 0;
  const gear = _el(O.gear || 'hudGear');
  const gearTxt = (player.speed || 0) < -1 ? 'R' : 'D';
  if (gear) gear.textContent = gearTxt;
  _text(O.speed || 'hudSpeedVal', String(Math.round(kmh)));
  const rbKmh = _road ? _road(player.roadBonus) : 0;
  _text(O.road || 'hudRoadBonus', rbKmh > 0 ? '公路 +' + rbKmh + 'km/h' : '');
  return { kmh: kmh, roadBonusKmh: rbKmh, gear: gearTxt };
}

// ==================== ③ 弹种槽（≤3 槽，battle 同口径） ====================

/**
 * 渲染 3 个弹种槽（角标 ●/○，与 battle 现行口径完全一致）。
 * battle 的弹种条之所以不长，是因为它只显示 `player.ammoLoadout`（≤3 槽），
 * 而 bench 此前无 loadout ⇒ 显示全部 14 种弹种。本函数按 loadout 渲染。
 * opt: { slotPrefix } 槽按钮 id 前缀（缺省 'slot'，即 slot1/slot2/slot3）。
 */
function renderAmmoSlots(player, opt) {
  const O = opt || {};
  const pre = O.slotPrefix || 'slot';
  if (!player) return [];
  const loadout = (Array.isArray(player.ammoLoadout) && player.ammoLoadout.length)
    ? player.ammoLoadout
    : [player.ammoKey || 'ap'];
  const out = [];
  for (let i = 0; i < 3; i++) {
    const btn = _el(pre + (i + 1));
    if (!btn) { out.push(null); continue; }
    if (i < loadout.length) {
      const ak = loadout[i];
      const meta = (typeof RULES !== 'undefined' && RULES.ammoTypes && RULES.ammoTypes[ak]) || {};
      const labelEl = btn.querySelector ? btn.querySelector('.label') : null;
      if (labelEl) labelEl.textContent = (meta.label || ak).toUpperCase();
      const numEl = btn.querySelector ? btn.querySelector('.num') : null;
      const active = (player.currentAmmoIndex === i || player.ammoKey === ak);
      if (numEl) numEl.textContent = active ? '●' : '○';
      btn.style.display = '';
      _toggleClass(btn, 'active', active);
      out.push({ index: i, key: ak, active: active });
    } else {
      btn.style.display = 'none';
      out.push(null);
    }
  }
  return out;
}

// ==================== ④ 技能槽（主动 1~3 + 被动） ====================

/**
 * 取坦克的技能槽数组（惰性初始化为 count 个 null）。
 * 2026-11-02：从 tank_battle.html 的内联 skillSlots() 提上来 ——
 *   bench 抄了宿主注入的调用点却拿不到函数定义，每帧 ReferenceError 打死主循环（§4.199）。
 */
function skillSlotsOf(player, count) {
  const n = (typeof count === 'number') ? count : 3;
  if (!player) return new Array(n).fill(null);
  if (!Array.isArray(player.skillSlots) || player.skillSlots.length !== n) {
    player.skillSlots = new Array(n).fill(null);
  }
  return player.skillSlots;
}

/**
 * 渲染主动技能池 1~3 槽（技能名 + 冷却）。
 * deps: { skillSlots, hasAbility, labels } —— 由宿主注入（页面级函数不进共享层）。
 * opt:  { slotPrefix, cdPrefix, count }
 */
function renderSkillSlots(player, deps, opt) {
  const D = deps || {};
  const O = opt || {};
  const pre = O.slotPrefix || 'skillSlot';
  const cdPre = O.cdPrefix || 'cdS';
  const count = (typeof O.count === 'number') ? O.count : 3;
  const ABL = D.labels || ((typeof ABILITY_LABELS !== 'undefined') ? ABILITY_LABELS : {});
  // 2026-11-02：宿主没注入 skillSlots 时**回落到模块自带的 skillSlotsOf**。
  //   此前缺省走 `player.skillSlots || []`，而 bench 的宿主注入写成 `() => skillSlots()`——
  //   引用了 battle 页面的内联函数 ⇒ 每帧 ReferenceError 打死主循环（§4.199）。
  const slots = (typeof D.skillSlots === 'function')
    ? D.skillSlots()
    : skillSlotsOf(player, count);
  const owned = (typeof D.hasAbility === 'function') ? D.hasAbility : null;
  const out = [];
  for (let n = 1; n <= count; n++) {
    const slot = _el(pre + n);
    if (!slot) { out.push(null); continue; }
    const key = slots[n - 1];
    const has = key && (!owned || owned(player, key));
    if (has) {
      slot.style.display = '';
      if (slot.classList) slot.classList.remove('empty');
      const lbl = slot.querySelector ? slot.querySelector('.slabel') : null;
      if (lbl) lbl.textContent = ABL[key] || key;
      slot.title = (ABL[key] || key) + '（' + n + '）';
      const c = (player && player.abilityCds && player.abilityCds[key]) || 0;
      _text(cdPre + n, c > 0 ? c.toFixed(0) : '');
      _toggleClass(slot, 'gray', c > 0);
      out.push({ index: n, key: key, cd: c });
    } else {
      // 空槽/异常槽一律隐藏（battle 现行口径：#H3「空槽不显示」）
      if (key && !has && Array.isArray(slots)) slots[n - 1] = null;
      slot.style.display = 'none';
      out.push(null);
    }
  }
  return out;
}

/**
 * 渲染被动技能槽（格数 = RULES.abilities.passiveSlotsMax，纯读 tank_cards.passiveSlotState）。
 * deps: { passiveSlotState, cardById }；opt: { host }
 */
function renderPassiveSlots(player, deps, opt) {
  const D = deps || {};
  const O = opt || {};
  const host = _el(O.host || 'passiveSlots');
  if (!host || !player) return null;
  const state = (typeof D.passiveSlotState === 'function')
    ? D.passiveSlotState(player)
    : { max: 2, used: 0, cardIds: [] };
  const cardById = (typeof D.cardById === 'function') ? D.cardById : function () { return null; };
  host.innerHTML = '';
  const max = Math.max(1, state.max | 0);
  const ids = state.cardIds || [];
  for (let i = 0; i < max; i++) {
    const cell = document.createElement('div');
    const cardId = ids[i];
    const card = cardId ? cardById(cardId) : null;
    const filled = !!card;
    cell.style.cssText = 'min-width:56px; padding:2px 6px; border:1px solid var(--line);'
      + ' background:' + (filled ? 'rgba(126,217,87,0.12)' : 'rgba(8,9,6,0.6)') + ';'
      + ' font-family:\'JetBrains Mono\',monospace; font-size:var(--fs-xs); line-height:1.25;'
      + ' color:' + (filled ? 'var(--text)' : 'var(--text-dim)') + '; white-space:nowrap;';
    cell.textContent = filled ? (card.name || card.id) : '被动 ' + (i + 1);
    cell.title = filled ? (card.name || card.id) : '空被动槽';
    host.appendChild(cell);
  }
  return state;
}

// ==================== ⑤ 副武器 F 按钮反馈（2026-11-01 修回归） ====================
// 事故：bench 的 `#btnF` 一直以 `style="display:none"` 写死在 HTML 里，而**没有任何代码
//   更新它**——装上副武器后按钮仍隐藏、按 F 无反馈，用户观感就是「副武器卡牌不生效」。
//   battle 侧这段逻辑在 updateBottomHud 内联（约 55 行），本函数把它收成共享实现。
// 口径与 battle 完全一致（#C4e / #X5 / #J4）：
//   未激活 → 角标显示装填秒数；已激活未锁定 → '索' + lock-hunting；锁定中 → 百分比 + lock-on；
//   howitzer → 角标显示「曲/直」；turret → 「自主开火，无需操作」。
const SECONDARY_LABELS = {
  turret: '副炮塔', mortar: '车载迫击炮', missile: '反坦克导弹（锁定式）',
  missile_wire: '反坦克导弹（线导式）', rocket: '火箭巢', mine_layer: '布雷器',
  howitzer: '榴弹炮（曲射/直射可切换）', smoke: '烟幕发射器'
};
const SECONDARY_ICONS = {
  turret: '塔', mortar: '迫', missile: '导', missile_wire: '线',
  rocket: '火', mine_layer: '雷', howitzer: '榴', smoke: '烟'
};

/**
 * 渲染副武器 F 按钮（显隐 + 图标 + 装填/锁定角标 + title 说明）。
 * deps（可选注入，缺省读全局）：{ isHowitzerMode, getWeaponDefaults, secondaryIcons, secondaryLabels }
 */
function renderSecondaryButton(player, deps) {
  const D = deps || {};
  const btnF = _el('btnF');
  if (!btnF || !player) return null;
  const secW = (player.weapons && player.weapons.secondary) ? player.weapons.secondary : null;
  const hasSec = !!(secW && secW.type && secW.type !== 'none');
  const ICONS = D.secondaryIcons || ((typeof globalThis !== 'undefined' && globalThis.SECONDARY_ICONS) || SECONDARY_ICONS);
  const LABELS = D.secondaryLabels || ((typeof globalThis !== 'undefined' && globalThis.SECONDARY_LABELS) || SECONDARY_LABELS);
  const isHow = (key) => {
    const fn = D.isHowitzerMode || ((typeof globalThis !== 'undefined') ? globalThis.isHowitzerMode : null);
    return (typeof fn === 'function') ? !!fn(player) : false;
  };
  const getWD = D.getWeaponDefaults || ((typeof globalThis !== 'undefined') ? globalThis.getWeaponDefaults : null);
  const mCfg = (typeof getWD === 'function') ? (getWD('secondary', 'missile') || {}) : {};

  btnF.style.display = hasSec ? '' : 'none';
  _toggleClass(btnF, 'lock-hunting', false);
  _toggleClass(btnF, 'lock-on', false);

  let badge = '';
  let title = '副武器击发（F，按住连发）';
  if (hasSec) {
    const iconEl = _el('btnFIcon');
    if (iconEl) iconEl.textContent = ICONS[secW.type] || 'F';
    const isLockMissile = secW.type === 'missile';
    const mStats = secW.stats || {};
    const mRange = Math.round((typeof mStats.range === 'number') ? mStats.range : (mCfg.range || 600));
    const mArc = Math.round((typeof mStats.lockArcDeg === 'number') ? mStats.lockArcDeg : (mCfg.lockArcDeg || 30));
    const mLock = (typeof mStats.lockSeconds === 'number') ? mStats.lockSeconds : (mCfg.lockSeconds || 1.0);

    if (isLockMissile) {
      const act = !!player._missileActivated;
      const lk = player._missileLock;
      if (!act) {
        title = '反坦克导弹（锁定式）：按 F 激活索敌 → 炮塔 ' + mArc + '° 内、' + mRange + ' 距离内目标锁定 ' + mLock + 's 后自动发射；再按 F 取消';
      } else if (lk && lk.target && lk.target.hp > 0) {
        const pct = Math.max(0, Math.min(100, Math.round(lk.t / Math.max(0.001, mLock) * 100)));
        badge = pct + '%';
        _toggleClass(btnF, 'lock-on', true);
        title = '锁定中 ' + pct + '% — 目标已捕获，锁定完成自动发射（按 F 取消）';
      } else {
        badge = '索';
        _toggleClass(btnF, 'lock-hunting', true);
        title = '索敌中 — 未找到可锁定目标：需要敌对目标位于炮塔 ±' + mArc + '° 扇形内且距离 ≤ ' + mRange + '（按 F 取消）';
      }
    } else if (secW.type === 'howitzer') {
      const hOn = isHow();
      badge = hOn ? '曲' : '直';
      title = hOn
        ? '榴弹炮（曲射模式）：按 F 切到直射 — 曲射时左键/空格高抛越掩，落点=鼠标位置'
        : '榴弹炮（直射模式）：按 F 切到曲射 — 直射时主炮按常规平射弹道';
    } else {
      title = (secW.type === 'turret')
        ? '副炮塔（自主开火，无需操作）'
        : ('副武器击发（F，按住连发）：' + (LABELS[secW.type] || secW.type));
    }
  }
  btnF.title = title;

  const secRl = (hasSec && player.secondaryReloadT > 0) ? player.secondaryReloadT : 0;
  const secIsHowitzer = hasSec && secW.type === 'howitzer';
  // 角标优先级（与 battle #X5 注释严格一致）：
  //   ① 榴弹炮的 F 是**模式开关**，与装填无关 ⇒ 角标恒显示「曲/直」，不被装填计时压制；
  //   ② 锁定制导弹在「已激活」时显示锁定态（'索' / 百分比），同样不被装填压制；
  //   ③ 其余副武器装填中显示剩余秒数，就绪时清空。
  //   ⚠️ 早期实现把 ③ 写在最前，导致榴弹炮装填期间显示成「5.0」——与注释口径相反。
  let cdTxt = '';
  if (secIsHowitzer) {
    cdTxt = badge;
  } else if (hasSec && secW.type === 'missile' && player._missileActivated) {
    cdTxt = badge;
  } else if (secRl > 0) {
    cdTxt = secRl.toFixed(1);
  }
  _text('cdF', cdTxt);
  _toggleClass(btnF, 'gray', secRl > 0 && !secIsHowitzer && !(secW && secW.type === 'missile' && player._missileActivated));
  return { type: hasSec ? secW.type : null, badge: badge, cd: cdTxt, title: title };
}

// ==================== ⑥ 技能/装备按钮冷却角标 ====================
/**
 * 渲染冷却角标（4/5/6 的 .cd）。
 * opt: { ids } 覆盖 id 列表（缺省 ['cd4','cd5','cd6']，对应 repair/medkit/extinguish）
 */
function renderAbilityCdBadges(player, opt) {
  const O = opt || {};
  const ids = O.ids || ['cd4', 'cd5', 'cd6'];
  if (!player) return null;
  const map = ['repair', 'medkit', 'extinguish'];
  const out = {};
  ids.forEach(function (id, i) {
    const key = map[i];
    if (!key) return;
    const c = (player.abilityCds && player.abilityCds[key]) || 0;
    _text(id, c > 0 ? c.toFixed(0) : '');
    const el = _el(id);
    if (el && el.parentElement && el.parentElement.classList) {
      el.parentElement.classList.toggle('gray', c > 0);
    }
    out[key] = c;
  });
  return out;
}

// ==================== 导出 ====================
const TankHudPanel = {
  SECONDARY_LABELS: SECONDARY_LABELS,
  SECONDARY_ICONS: SECONDARY_ICONS,
  skillSlotsOf: skillSlotsOf,
  renderPlayerVitals: renderPlayerVitals,
  renderSpeedGauge: renderSpeedGauge,
  renderAmmoSlots: renderAmmoSlots,
  renderSkillSlots: renderSkillSlots,
  renderPassiveSlots: renderPassiveSlots,
  renderSecondaryButton: renderSecondaryButton,
  renderAbilityCdBadges: renderAbilityCdBadges,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = TankHudPanel;
}
if (typeof globalThis !== 'undefined') {
  globalThis.TankHudPanel = TankHudPanel;
}
