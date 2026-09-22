'use strict';

// tank_devpanel.js — 开发者面板（四 Tab：实时/卡牌/参数/开关）共享模块（#F 2026-09-20 抽离）。
// mvp 与 bench 两个原型页共同挂载 mountDevPanel(host)，保证两页开发者面板**同源**；
// 此前面板功能仅 mvp 内联、bench 只有旧测试面板（2026-09-17 #C5 遗留：bench 未应用新面板）。
//
// 挂载约定（浏览器全局脚本，无模块系统；底部 module.exports 供 Node 测试）：
//   const devPanel = mountDevPanel({ ...host... });   // 构建 DOM + 绑定交互，返回 api
//   api = { el, showDevTab, refreshAll, syncDevInputs, renderDevMods, updateDevParams,
//           updateSolution, cheats, isOpen }
//
// 依赖（全局，两页均已按序加载）：
//   RULES / pushLog / playSound / refreshStats / applyCardEffects / applyCardToTank /
//   clearCardsFromTank / snapshotCardTx / rollbackCardTx / deployDronesFromCards /
//   updateSolution（tank_fire.js，写 DOM id solPart…）
//
// host 可选字段：
//   attach             挂载容器（默认 document.body）
//   getPlayer()        玩家实体（默认全局 player）
//   getCardPool()      卡池数组（默认全局 cardPool）
//   getCtx()           战斗上下文 fireCtx（发射解算/实时参数，默认全局 fireCtx）
//   isDevOpen()        面板打开状态（`/` 快捷键门控，默认 () => false）
//   pushLog / playSound 页面日志与音效（默认全局同名函数）
//   cardClick(card)    卡牌点击回调（默认 applyCardEffects + 日志 + 刷新；mvp 传 pickCard 以
//                      得到技能提示/toast 反馈）
//   cheatsInit         { zeroSpread, noVision, invuln, instantReload } 初始值（默认全 false）
//   onCheatChange(k,v) 开关变更回调（mvp 同步 devAim.zeroSpread / devNoVision；bench 同步自身）
//   onGenNode / onReset 随机生成战场 / 重置按钮回调（null 则不渲染该行；缺省渲染仅当回调存在）
//   liveData()         实时参数（缺省从全局 player/entities/tankKmh 派生，节点字段 '--'）
//   hideSolutionSection 不渲染发射解算区（bench 已有常驻 #solutionPanel，防双份 solPat id 冲突）
//   extraSwitchHTML + onExtraSetup(root)  开关 Tab 附加行（bench 独有：倒置/FPS/满血重置/清场/键位表）
//   defaultTab         打开时默认 Tab（默认 'live'）

function _g(k, fb) { return (typeof globalThis !== 'undefined' && globalThis[k] !== undefined) ? globalThis[k] : fb; }

function mountDevPanel(host) {
  const H = host || {};
  const getPlayer = H.getPlayer || _g('getPlayer', null) || (function () { return _g('player', null); });
  const getCardPool = H.getCardPool || (function () { return _g('cardPool', []); });
  const getCtx = H.getCtx || (function () { return _g('fireCtx', null); });
  const isDevOpen = H.isDevOpen || (function () { return false; });
  const log = H.pushLog || _g('pushLog', function () {});
  const sound = H.playSound || _g('playSound', function () {});
  const refreshStats = H.refreshStats || _g('refreshStats', function (t) { return t; });

  // ---- DOM 构建（与 mvp 原面板结构逐字段一致，两页同源） ----
  const wrap = document.createElement('div');
  wrap.id = 'devPanel';
  wrap.style.cssText = 'position:absolute; right:12px; top:12px; z-index:31; width:480px; max-height:calc(100vh - 24px); overflow-y:auto; background:rgba(18,20,15,0.95); border:1px solid rgba(255,255,255,0.12); padding:14px 16px; font-family:monospace; box-shadow:0 8px 30px rgba(0,0,0,0.6);';
  wrap.style.display = 'none';
  const CSS_G = ['.sp-title','.dev-sec','.dev-sec h4','.dev-row','.dev-row .k','.dev-row button','.hint','.dev-tabs','.dev-tab','.dev-tab.active','input.dev-search','.dev-card-group','.dev-card-group-h','.dev-card-items','.card-list','.card-list button','.dev-owned-row','.dev-picked','.dev-cheat','.mod-list','.mod-row','.mod-row .m-src','.mod-row .m-stat','.mod-row select','.mod-row input','.mod-row button'];
  const CSS_DEFS = [
    'font-size:11px;letter-spacing:2px;color:#e8c86a;text-transform:uppercase;border-bottom:1px solid rgba(255,255,255,0.12);padding-bottom:8px;margin-bottom:10px;',
    'border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.015);padding:8px 10px;margin-bottom:10px;',
    'margin:0 0 6px;font-size:10px;letter-spacing:2px;color:#c9a45c;text-transform:uppercase;font-weight:500;',
    'display:flex;align-items:center;gap:6px;margin-bottom:5px;font-size:10px;color:#ddd7c4;flex-wrap:wrap;',
    'color:#8a8678;min-width:56px;',
    'padding:3px 6px;font-size:9px;',
    'font-size:9px;color:#8a8678;opacity:.7;margin-top:8px;letter-spacing:1px;',
    'display:flex;gap:4px;margin-bottom:8px;',
    'flex:1;padding:4px 0;font-size:10px;letter-spacing:2px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.12);color:#8a8678;cursor:pointer;',
    'color:#e8c86a;border-color:#c9a45c;background:rgba(255,255,255,0.06);',
    'width:100%;box-sizing:border-box;margin-bottom:5px;font-size:10px;padding:3px 5px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.12);color:#ddd7c4;',
    'margin-bottom:4px;',
    'display:flex;justify-content:space-between;align-items:center;width:100%;padding:3px 5px;font-size:9px;letter-spacing:1px;color:#c9a45c;background:rgba(255,255,255,0.02);border:1px dashed #2a2d20;cursor:pointer;text-align:left;',
    'display:flex;flex-direction:column;gap:3px;margin-top:3px;',
    'display:flex;flex-direction:column;gap:4px;max-height:260px;overflow-y:auto;',
    'text-align:left;font-size:9px;padding:4px 6px;letter-spacing:0;',
    'display:flex;align-items:center;gap:6px;font-size:9px;border:1px dashed #2a2d20;padding:3px 5px;margin-bottom:3px;',
    'outline:2px solid #7ed957;',
    'display:flex;align-items:center;gap:6px;margin-bottom:5px;font-size:10px;color:#ddd7c4;cursor:pointer;',
    'display:flex;flex-direction:column;gap:4px;max-height:200px;overflow-y:auto;',
    'display:flex;align-items:center;gap:4px;font-size:9px;border:1px dashed #2a2d20;padding:3px 5px;',
    'color:#c9a45c;max-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;',
    'color:#ddd7c4;min-width:70px;',
    'font-size:9px;padding:1px 2px;width:56px;',
    'width:64px;font-size:9px;padding:1px 3px;',
    'padding:2px 5px;font-size:9px;'
  ];
  const styleEl = document.createElement('style');
  styleEl.textContent = '#devPanel{position:absolute;right:12px;top:12px;z-index:31;width:480px;max-height:calc(100vh - 24px);overflow-y:auto;background:rgba(18,20,15,0.95);border:1px solid rgba(255,255,255,0.12);padding:14px 16px;font-family:monospace;box-shadow:0 8px 30px rgba(0,0,0,0.6);}' +
    CSS_G.map((sel, i) => `#devPanel ${sel}{${CSS_DEFS[i]}}`).join('\n');
  styleEl.id = 'devPanelCss';
  (H.attach || document.body).appendChild(styleEl);

  const liveSec = !H.hideSolutionSection
    ? '<div class="dev-sec"><h4>发射解算（实时弹道预测，无散布）</h4><div class="dev-row"><span class="k">部位</span><span id="solPart">--</span></div><div class="dev-row"><span class="k">入射角</span><span id="solAngle">--</span></div><div class="dev-row"><span class="k">厚度</span><span id="solThick">--</span></div><div class="dev-row"><span class="k">等效</span><span id="solEff">--</span></div><div class="dev-row"><span class="k">掩体</span><span id="solCover">--</span></div><div class="dev-row"><span class="k">判定</span><span id="solResult">--</span></div></div>'
    : '<div class="dev-sec"><h4>发射解算</h4><div class="hint">发射解算见常驻「发射解算」面板（本页实时刷新）</div></div>';
  const genResetRow = (H.onGenNode || H.onReset)
    ? '<div class="dev-row"><button id="genNodeBtn">随机生成战场</button><button id="resetBtn">重置 RESET</button><span style="color:#8a8678;">（战斗态禁用）</span></div>'
    : '';
  wrap.innerHTML =
    '<div class="sp-title">开发者面板 DEV PANEL</div>' +
    '<div class="dev-tabs"><button class="dev-tab active" data-tab="live">实时</button><button class="dev-tab" data-tab="cards">卡牌</button><button class="dev-tab" data-tab="params">参数</button><button class="dev-tab" data-tab="switch">开关</button></div>' +
    '<div class="dev-page" data-page="live">' +
      '<div class="dev-sec"><h4>实时参数</h4>' +
        '<div class="dev-row"><span class="k">σ</span><span id="devSigma">--</span></div>' +
        '<div class="dev-row"><span class="k">装填</span><span id="devReload">--</span></div>' +
        '<div class="dev-row"><span class="k">位置</span><span id="devPos">--</span></div>' +
        '<div class="dev-row"><span class="k">速度</span><span id="devSpeed">--</span></div>' +
        '<div class="dev-row"><span class="k">存活</span><span id="devEntities">--</span></div>' +
        '<div class="dev-row"><span class="k">节点</span><span id="devNode">--</span></div>' +
        '<div class="dev-row"><span class="k">节点类型</span><span id="devNodeType">--</span></div>' +
        '<div class="dev-row"><span class="k">敌人数</span><span id="devEnemyCount">--</span></div>' +
      '</div>' + liveSec +
    '</div>' +
    '<div class="dev-page" data-page="cards" style="display:none;">' +
      '<div class="dev-sec"><h4>卡牌选择（点击即应用 · `/` 聚焦搜索）</h4>' +
        '<input id="devCardSearch" class="dev-search" type="text" placeholder="搜索名称 / 标签 / ID…" autocomplete="off">' +
        '<div class="card-list" id="devCardPicker"></div>' +
      '</div>' +
      '<div class="dev-sec"><h4>已持有卡牌 <button id="devClearCardsBtn">清除全部</button></h4><div id="devOwnedCards"></div></div>' +
    '</div>' +
    '<div class="dev-page" data-page="params" style="display:none;">' +
      '<div class="dev-sec"><h4>数值临时调整（实时改 player.stats，仅本局）</h4>' +
        '<div class="dev-row"><span class="k">穿深</span><input id="devPen" type="number" step="1" min="0"><span class="k">伤害</span><input id="devDmg" type="number" step="1" min="0"></div>' +
        '<div class="dev-row"><span class="k">装填</span><input id="devReloadI" type="number" step="0.05" min="0.1"><span class="k">极速</span><input id="devSpeedI" type="number" step="5" min="0"></div>' +
        '<div class="dev-row"><span class="k">马力</span><input id="devPower" type="number" step="10" min="0"><button id="devApplyBtn">应用</button><button id="devResetStatsBtn">重置</button></div>' +
      '</div>' +
      '<div class="dev-sec"><h4>修饰器列表（可编辑 / 删除）</h4><div class="mod-list" id="devModList"></div></div>' +
    '</div>' +
    '<div class="dev-page" data-page="switch" style="display:none;">' +
      '<div class="dev-sec"><h4>调试开关</h4>' +
        '<div class="dev-row"><span class="k">超级精度</span><button id="zeroSpreadBtn">关闭</button><span style="color:#8a8678;">散布归零（瞬间缩圈，仅玩家）</span></div>' +
        '<div class="dev-row"><span class="k">无视野</span><button id="devVisionBtn">关闭</button><span style="color:#8a8678;">关闭视野剔除（#89 调试）</span></div>' +
        '<label class="dev-cheat"><input type="checkbox" id="devInvulnChk"> 无敌常驻（invulnT 恒续，与测试台同源语义）</label>' +
        '<label class="dev-cheat"><input type="checkbox" id="devInstantReloadChk"> 秒装填（reloadT 恒 0，与测试台同源语义）</label>' +
        genResetRow +
        (H.extraSwitchHTML || '') +
      '</div>' +
    '</div>' +
    '<div class="hint">按 ` 关闭 · 超级精度与数值调整仅影响玩家，敌我弹道/结算逻辑不变</div>';
  (H.attach || document.body).appendChild(wrap);

  const $ = function (id) { return wrap.querySelector('#' + id); };

  // ---- 状态 ----
  const cheats = Object.assign({ zeroSpread: false, noVision: false, invuln: false, instantReload: false }, H.cheatsInit || {});
  const onCheat = H.onCheatChange || function () {};
  let devActiveTab = H.defaultTab || 'live';
  let devCardQuery = '';
  // 数值临时覆盖（仅本局）：{ stat → value }，由页面主循环每帧写回 player.stats（applyDevInputs 反向）
  const devOverrides = {};
  const DEV_INPUT_MAP = { devPen: 'penetration', devDmg: 'damage', devReloadI: 'reload', devSpeedI: 'maxSpeed', devPower: 'enginePower' };

  // ---- Tab / 面板刷新 ----
  function showDevTab(tab) {
    devActiveTab = tab;
    Array.prototype.forEach.call(wrap.querySelectorAll('.dev-tab'), function (b) { b.classList.toggle('active', b.dataset.tab === tab); });
    Array.prototype.forEach.call(wrap.querySelectorAll('.dev-page'), function (p) { p.style.display = (p.dataset.page === tab) ? 'block' : 'none'; });
    if (tab === 'cards') { renderDevCards(); renderDevOwnedCards(); }
    if (tab === 'params') { renderDevMods(); syncDevInputs(); }
    if (tab === 'switch' && H.onExtraSetup) H.onExtraSetup(wrap);
  }
  Array.prototype.forEach.call(wrap.querySelectorAll('.dev-tab'), function (b) {
    b.addEventListener('click', function () { showDevTab(b.dataset.tab); sound('ui'); });
  });
  $('zeroSpreadBtn').addEventListener('click', function (e) {
    cheats.zeroSpread = !cheats.zeroSpread;
    const zBtn = e.currentTarget;
    if (zBtn instanceof HTMLElement) {
      zBtn.textContent = cheats.zeroSpread ? '开启' : '关闭';
      zBtn.classList.toggle('active', cheats.zeroSpread);
    }
    onCheat('zeroSpread', cheats.zeroSpread);
    log('超级精度：' + (cheats.zeroSpread ? '开（散布归零）' : '关'), 'COVER');
  });
  $('devVisionBtn').addEventListener('click', function (e) {
    cheats.noVision = !cheats.noVision;
    const vBtn = e.currentTarget;
    if (vBtn instanceof HTMLElement) {
      vBtn.textContent = cheats.noVision ? '开启' : '关闭';
      vBtn.classList.toggle('active', cheats.noVision);
    }
    onCheat('noVision', cheats.noVision);
    log('无视野调试：' + (cheats.noVision ? '开（跳过视野剔除）' : '关'), 'COVER');
  });
  $('zeroSpreadBtn').textContent = cheats.zeroSpread ? '开启' : '关闭';
  $('zeroSpreadBtn').classList.toggle('active', cheats.zeroSpread);
  $('devVisionBtn').textContent = cheats.noVision ? '开启' : '关闭';
  $('devVisionBtn').classList.toggle('active', cheats.noVision);
  const invEl = $('devInvulnChk');
  const irEl = $('devInstantReloadChk');
  if (invEl instanceof HTMLInputElement) invEl.checked = !!cheats.invuln;
  if (irEl instanceof HTMLInputElement) irEl.checked = !!cheats.instantReload;
  $('devInvulnChk').addEventListener('change', function (e) {
    const inp = e.currentTarget;
    if (inp instanceof HTMLInputElement) { cheats.invuln = inp.checked; onCheat('invuln', cheats.invuln); log('无敌常驻（开发者）：' + (cheats.invuln ? '开' : '关'), 'COVER'); }
  });
  $('devInstantReloadChk').addEventListener('change', function (e) {
    const inp = e.currentTarget;
    if (inp instanceof HTMLInputElement) { cheats.instantReload = inp.checked; onCheat('instantReload', cheats.instantReload); log('秒装填（开发者）：' + (cheats.instantReload ? '开' : '关'), 'COVER'); }
  });
  if (H.onGenNode) $('genNodeBtn').addEventListener('click', H.onGenNode);
  if (H.onReset) $('resetBtn').addEventListener('click', H.onReset);

  // ---- 卡牌选择器（分组 / 搜索 / 已持有 ×N / −1 回滚 / 清除全部）----
  const DEV_CARD_GROUPS = [
    { key: 'primary_install',    label: '主武器安装', match: function (c) { return (c.effects || []).some(function (ef) { return ef.type === 'weapon' && (ef.slot || 'primary') === 'primary' && ef.action === 'install'; }); } },
    { key: 'primary_upgrade',    label: '主武器升级', match: function (c) { return (c.effects || []).some(function (ef) { return ef.type === 'weapon' && (ef.slot || 'primary') === 'primary' && ef.action === 'upgrade'; }); } },
    { key: 'secondary_install',  label: '副武器安装', match: function (c) { return (c.effects || []).some(function (ef) { return ef.type === 'weapon' && (ef.slot || 'secondary') === 'secondary' && ef.action === 'install'; }); } },
    { key: 'secondary_upgrade',  label: '副武器升级', match: function (c) { return (c.effects || []).some(function (ef) { return ef.type === 'weapon' && (ef.slot || 'secondary') === 'secondary' && ef.action === 'upgrade'; }); } },
    { key: 'ammo_upgrade',       label: '弹种升级',   match: function (c) { return (c.effects || []).some(function (ef) { return ef.type === 'ammo' && ef.replaceAmmo; }); } },
    { key: 'ammo_tune',          label: '弹种强化',   match: function (c) { return (c.effects || []).some(function (ef) { return ef.type === 'ammo' && !ef.replaceAmmo; }); } },
    { key: 'ability',            label: '主动技能',   match: function (c) { return (c.effects || []).some(function (ef) { return ef.type === 'ability'; }); } },
    { key: 'passive',            label: '被动机制',   match: function (c) { return (c.effects || []).some(function (ef) { return ef.type === 'passive'; }); } },
    { key: 'modifier',           label: '参数强化',   match: function (c) { return (c.effects || []).some(function (ef) { return ef.type === 'modifier'; }); } },
    { key: 'drone',              label: '无人机',     match: function (c) { return (c.effects || []).some(function (ef) { return ef.type === 'drone'; }); } },
    { key: 'economy',            label: '经济',       match: function (c) { return (c.effects || []).some(function (ef) { return ef.type === 'economy'; }); } }
  ];
  const devCardGroupOpen = new Set(DEV_CARD_GROUPS.map(function (g) { return g.key; }));
  // #G（2026-09-21）：已持有卡牌区签名缓存 + 持有计数合并统计（见 renderDevOwnedCards 注记）。
  // devOwnedDirty = 显式「内容已变，下一帧必须重绘」标记（不能用 devOwnedSig='' 兼任——空态
  // 分支需要区分「从未画过」与「强制重绘」，见 renderDevOwnedCards 的修复注记）。
  let devOwnedSig = '';
  let devOwnedDirty = false;
  function devCardHeldCount(cardId) {
    const p = getPlayer();
    if (!p) return 0;
    const n = (p.cardEffects || []).filter(function (ef) { return ef && ef.cardId === cardId; }).length;
    if (n > 0) return n;
    return (p.modifiers || []).filter(function (m) { return m && m.source === 'card:' + cardId; }).length;
  }
  function devCardMatchesQuery(c, q) {
    if (!q) return true;
    const hay = [c.name, c.id, c.rarity, (c.tags || []).join(','), c.desc].filter(Boolean).join(' ').toLowerCase();
    return hay.indexOf(q) >= 0;
  }
  function cardById(id) { return (getCardPool() || []).find(function (c) { return c.id === id; }) || null; }
  function renderDevCards() {
    const el = $('devCardPicker');
    if (!el) return;
    el.innerHTML = '';
    const pool = getCardPool() || [];
    if (!pool.length) {
      el.innerHTML = '<div style="font-size:9px;color:#8a8678;">卡池为空（检查 cards/ 与 /api/cards）</div>';
      return;
    }
    const q = devCardQuery.trim().toLowerCase();
    const buckets = new Map();
    for (const c of pool) {
      if (!devCardMatchesQuery(c, q)) continue;
      let gk = 'other';
      for (const g of DEV_CARD_GROUPS) { if (g.match(c)) { gk = g.key; break; } }
      if (!buckets.has(gk)) buckets.set(gk, []);
      buckets.get(gk).push(c);
    }
    const groups = DEV_CARD_GROUPS.concat([{ key: 'other', label: '其他', match: function () { return false; } }]);
    let total = 0;
    for (const g of groups) {
      const cards = buckets.get(g.key) || [];
      if (!cards.length) continue;
      total += cards.length;
      const box = document.createElement('div');
      box.className = 'dev-card-group';
      const head = document.createElement('button');
      head.className = 'dev-card-group-h';
      const open = devCardGroupOpen.has(g.key);
      head.innerHTML = '<span>' + (open ? '▾' : '▸') + ' ' + g.label + '</span><span style="color:#8a8678;">' + cards.length + ' 张</span>';
      head.addEventListener('click', function () {
        if (devCardGroupOpen.has(g.key)) devCardGroupOpen.delete(g.key); else devCardGroupOpen.add(g.key);
        renderDevCards();
      });
      box.appendChild(head);
      if (open) {
        const items = document.createElement('div');
        items.className = 'dev-card-items';
        for (const c of cards) {
          const b = document.createElement('button');
          const held = devCardHeldCount(c.id);
          b.textContent = c.name + '（' + c.rarity + (c.maxStacks ? ' ×' + c.maxStacks : '') + '）' + (held ? ' · 已持有 ×' + held : '');
          b.title = c.desc || '';
          b.addEventListener('click', function () {
            pickDevCard(c);
            b.classList.add('dev-picked');
            setTimeout(function () { b.classList.remove('dev-picked'); }, 700);
            renderDevCards(); renderDevOwnedCards(); renderDevMods(); syncDevInputs();
          });
          items.appendChild(b);
        }
        box.appendChild(items);
      }
      el.appendChild(box);
    }
    if (!total) el.innerHTML = '<div style="font-size:9px;color:#8a8678;">无匹配卡牌（调整搜索词）</div>';
  }
  function pickDevCard(card) {
    if (!card) return;
    if (H.cardClick) { H.cardClick(card); return; }
    const p = getPlayer();
    if (!p) return;
    applyCardEffects(p, card);
    log('获得卡牌「' + card.name + '」— ' + card.desc, 'PEN');
    sound('ui');
  }
  $('devCardSearch').addEventListener('input', function (e) {
    const inp = e.currentTarget;
    devCardQuery = (inp instanceof HTMLInputElement) ? (inp.value || '') : '';
    renderDevCards();
  });

  // ---- 已持有 / −1 回滚 / 清除全部（重放语义，与 mvp 原实现一致） ----
  function rollbackDevCard(cardId) {
    const p = getPlayer();
    if (!p) return;
    // #G（2026-09-21）：重放清单改读**按序施加日志** tank._cardApplyLog（tank_cards.applyCardEffects
    // 写入）——旧实现只取 p.cardEffects，而 modifier 卡只写 tank.modifiers ⇒ 任意一次 −1 都会把
    // 所有纯 modifier 卡效果永久抹掉（Node 实测复现）。lastIndexOf = 多张同名卡回滚最后施加的一张。
    let seq = null;
    if (Array.isArray(p._cardApplyLog) && p._cardApplyLog.length) {
      seq = p._cardApplyLog.slice();
      const li = seq.lastIndexOf(cardId);
      if (li >= 0) seq.splice(li, 1);
      else return;
    } else {
      // 兼容路径（日志缺失，如旧存档/测试桩）：退回 cardEffects 序列
      seq = (p.cardEffects || []).map(function (ef) { return ef && ef.cardId; }).filter(Boolean);
      const idx = seq.indexOf(cardId);
      if (idx < 0) return;
      seq.splice(idx, 1);
    }
    const snapTx = (typeof window !== 'undefined') ? window['snapshotCardTx'] : null;
    const receipt = snapTx ? snapTx(p, { id: cardId }) : null;
    try {
      clearCardsFromTank(p);
      for (const id of seq) {
        const c = cardById(id);
        if (c) applyCardToTank(p, c);
      }
      const deployFns = (typeof window !== 'undefined') ? window['deployDronesFromCards'] : null;
      if (typeof deployFns === 'function') deployFns();
      refreshStats(p);
      const card = cardById(cardId);
      log('已回滚 1 张「' + (card ? card.name : cardId) + '」（剩余 ' + seq.filter(function (id) { return id === cardId; }).length + ' 张）', 'COVER');
    } catch (err) {
      if (rollbackCardTx && receipt) rollbackCardTx(p, receipt);
      log('单卡回滚失败，已整体还原（' + err.message + '）', 'CRIT');
    }
    devOwnedDirty = true;      // #G：强制重绘（回滚后内容已变）
    renderDevOwnedCards(); renderDevCards(); renderDevMods(); syncDevInputs();
  }
  // #G（2026-09-21）：「已持有」统计合并两个数据面——cardEffects（weapon/ability/ammo/passive/
  // drone/economy 卡）+ modifiers 的 card:* source（96/169 张纯 modifier 卡此前完全不出现在
  // 列表里，也就永远没有 −1 行）。
  function devOwnedCounts() {
    const p = getPlayer();
    const counts = {};
    if (!p) return counts;
    // #G：首选按序施加日志统计——这是「每张卡应用了几次」的精确口径
    // （cardEffects 按效果条数记账、modifiers 按修饰器条数记账，混合/多效果卡都会多计）。
    if (Array.isArray(p._cardApplyLog) && p._cardApplyLog.length) {
      for (const id of p._cardApplyLog) counts[id] = (counts[id] || 0) + 1;
      return counts;
    }
    for (const ef of (p.cardEffects || [])) {
      if (!ef || !ef.cardId) continue;
      counts[ef.cardId] = (counts[ef.cardId] || 0) + 1;
    }
    for (const m of (p.modifiers || [])) {
      const src = m && m.source;
      if (typeof src === 'string' && src.indexOf('card:') === 0) {
        const cid = src.slice(5);
        counts[cid] = Math.max(counts[cid] || 0, cardStackCountOf(p, cid));
      }
    }
    return counts;
  }
  function cardStackCountOf(p, cardId) {
    const n = (p.cardEffects || []).filter(function (e) { return e && e.cardId === cardId; }).length;
    if (n > 0) return n;
    return (p.modifiers || []).filter(function (m) { return m && m.source === 'card:' + cardId; }).length;
  }
  function devOwnedSignature(counts) {
    return Object.keys(counts).sort().map(function (k) { return k + '=' + counts[k]; }).join('|');
  }
  function renderDevOwnedCards() {
    const el = $('devOwnedCards');
    if (!el) return;
    const p = getPlayer();
    const counts = devOwnedCounts();
    const ids = Object.keys(counts);
    if (!ids.length) {
      // #G（2026-09-21 修复）：空列表必须无条件清掉残留行。旧实现用 `devOwnedSig = ''` 兼作
      // 「强制重绘」标记，而这里又把 '' 当作「已画过空态」⇒ 回滚掉最后一张卡时（rollbackDevCard
      // 先置 sig='' 再调用本函数）残留的 .dev-owned-row 永不被清除，浏览器用例 cleared=false。
      // 现改用独立 devOwnedDirty 标记：脏标记或旧签名非空或容器为空都重画空态。
      if (devOwnedDirty || devOwnedSig !== '' || !el.firstChild) {
        el.innerHTML = '<div style="font-size:9px;color:#8a8678;">尚未持有任何卡牌</div>';
      }
      devOwnedSig = ''; devOwnedDirty = false;
      return;
    }
    // #G（2026-09-21 主因修复）：本函数在 mvp 被逐帧调用（updateDevParams → renderDevOwnedCards），
    // 旧实现无条件 innerHTML='' 重建 ⇒ 真实鼠标 mousedown→mouseup 跨帧时按钮被销毁，click 落在
    // 无监听的持久容器上 →「−1 按钮点了没反应」。签名未变直接返回（逐帧路径变 no-op）；
    // 内容真正变化处（回滚/清除/获得）置 devOwnedDirty 强制重绘。
    const sig = devOwnedSignature(counts);
    if (sig === devOwnedSig && !devOwnedDirty) return;
    devOwnedSig = sig; devOwnedDirty = false;
    el.innerHTML = '';
    for (const cardId of ids) {
      const card = cardById(cardId);
      const name = card ? card.name : cardId;
      const rarity = (card && card.rarity) ? '（' + card.rarity + '）' : '';
      const row = document.createElement('div');
      row.className = 'dev-owned-row';
      const label = document.createElement('span');
      label.textContent = name + rarity + ' ×' + counts[cardId];
      const btn = document.createElement('button');
      btn.textContent = '−1';
      btn.title = '回滚该卡 1 张实例（清空后按施加日志原序重放其余卡牌）';
      // #G：按钮只带 data-card-id，点击统一由容器级委托处理（事件监听挂一次、不随 innerHTML 重建丢失）
      btn.setAttribute('data-card-id', cardId);
      row.appendChild(label); row.appendChild(btn);
      el.appendChild(row);
    }
  }
  // #G（2026-09-21）：容器级事件委托——「−1」按钮由 innerHTML 逐帧重建，per-button 监听随重建
  // 丢失；委托挂在持久容器 #devOwnedCards 上，一次绑定终身有效（与签名节流双保险）。
  const ownedCardsEl = $('devOwnedCards');
  if (ownedCardsEl) {
    ownedCardsEl.addEventListener('click', function (e) {
      const btn = (e.target instanceof Element) ? e.target.closest('button[data-card-id]') : null;
      if (btn) rollbackDevCard(btn.getAttribute('data-card-id'));
    });
  }
  $('devClearCardsBtn').addEventListener('click', function () {
    const p = getPlayer();
    if (!p) return;
    const info = clearCardsFromTank(p);
    sound('ui');
    log('清除全部卡牌效果 — 移除 ' + info.removedMods + ' 条 modifier / ' + info.removedEffects + ' 条装置效果', 'COVER');
    devOwnedDirty = true;      // #G：清除后强制重绘
    renderDevOwnedCards(); renderDevCards(); renderDevMods(); syncDevInputs();
  });

  // ---- 修饰器列表 ----
  function renderDevMods() {
    const el = $('devModList');
    if (!el) return;
    el.innerHTML = '';
    const p = getPlayer();
    if (!p || !p.modifiers || !p.modifiers.length) {
      el.innerHTML = '<div style="font-size:9px;color:#8a8678;">当前无修饰器</div>';
      return;
    }
    p.modifiers.forEach(function (m, i) {
      const row = document.createElement('div');
      row.className = 'mod-row';
      row.innerHTML =
        '<span class="m-src">' + m.source + '</span>' +
        '<span class="m-stat">' + m.stat + '</span>' +
        '<select class="m-mode"><option value="add" ' + (m.mode === 'add' ? 'selected' : '') + '>add</option><option value="mult" ' + (m.mode === 'mult' ? 'selected' : '') + '>mult</option></select>' +
        '<input class="m-val" type="number" step="0.01" value="' + m.value + '">';
      const apply = document.createElement('button');
      apply.textContent = '应用';
      apply.addEventListener('click', function () {
        const mode = row.querySelector('.m-mode');
        const val = row.querySelector('.m-val');
        if (mode instanceof HTMLSelectElement && val instanceof HTMLInputElement) {
          m.mode = mode.value;
          m.value = parseFloat(val.value);
        }
        if (!Number.isFinite(m.value)) m.value = 0;
        refreshStats(p);
        renderDevMods(); syncDevInputs();
        log('修饰器已更新：' + m.stat + ' ' + m.mode + ' ' + m.value, 'COVER');
      });
      const del = document.createElement('button');
      del.textContent = '删除';
      del.addEventListener('click', function () {
        p.modifiers.splice(i, 1);
        refreshStats(p);
        renderDevMods(); syncDevInputs();
        log('修饰器已删除：' + m.stat + '（' + m.source + '）', 'COVER');
      });
      row.appendChild(apply); row.appendChild(del);
      el.appendChild(row);
    });
  }

  // ---- 数值临时调整 ----
  function syncDevInputs() {
    const p = getPlayer();
    for (const id in DEV_INPUT_MAP) {
      const el = $(id);
      if (el instanceof HTMLInputElement) el.value = String(Math.round(p.stats[DEV_INPUT_MAP[id]] * 100) / 100);
    }
  }
  function applyDevInputs() {
    for (const id in DEV_INPUT_MAP) {
      const el = $(id);
      const v = parseFloat(el instanceof HTMLInputElement ? el.value : '');
      if (Number.isFinite(v) && v >= 0) devOverrides[DEV_INPUT_MAP[id]] = v;
    }
    applyDevOverrides();
    log('数值覆盖已应用（临时，仅本局）', 'COVER');
  }
  function resetDevOverrides() {
    for (const k in devOverrides) delete devOverrides[k];
    refreshStats(getPlayer());
    const p = getPlayer();
    if (p && p.hp > p.stats.maxHp) p.hp = p.stats.maxHp;
    syncDevInputs();
    log('数值覆盖已重置', 'COVER');
  }
  function applyDevOverrides() {
    const p = getPlayer();
    if (!p) return;
    for (const k in devOverrides) {
      if (p.stats[k] !== undefined) p.stats[k] = devOverrides[k];
    }
  }
  $('devApplyBtn').addEventListener('click', function () { applyDevInputs(); sound('ui'); });
  $('devResetStatsBtn').addEventListener('click', function () { resetDevOverrides(); sound('ui'); });

  // ---- 实时参数 ----
  function defaultLive(p) {
    const ents = _g('entities', []);
    let speed = '';
    if (typeof tankKmh === 'function') { try { speed = tankKmh(p) + 'km/h'; } catch (err) { speed = ''; } }
    return {
      sigma: p.sigma,
      reload: p.stats ? p.stats.reload : 0,
      pos: '(' + p.x.toFixed(0) + ', ' + p.y.toFixed(0) + ')',
      speed: speed || '--',
      entities: ents.filter(function (e) { return e.hp > 0; }).length + ' 存活',
      node: '--', nodeType: '--',
      enemyCount: ents.filter(function (e) { return e.team === 'enemy' && e.hp > 0; }).length
    };
  }
  function updateDevParams() {
    const p = getPlayer();
    if (!p) return;
    const L = H.liveData ? H.liveData(p) : defaultLive(p);
    const set = function (id, txt) { const el = $(id); if (el) el.textContent = txt; };
    set('devSigma', (L.sigma !== undefined ? L.sigma : p.sigma).toFixed(4));
    set('devReload', (L.reload !== undefined ? L.reload : (p.stats ? p.stats.reload : 0)).toFixed(2) + 's');
    set('devPos', L.pos !== undefined ? L.pos : '(' + p.x.toFixed(0) + ', ' + p.y.toFixed(0) + ')');
    set('devSpeed', L.speed !== undefined ? L.speed : '--');
    set('devEntities', L.entities !== undefined ? L.entities : '--');
    set('devNode', L.node !== undefined ? L.node : '--');
    set('devNodeType', L.nodeType !== undefined ? L.nodeType : '--');
    set('devEnemyCount', L.enemyCount !== undefined ? L.enemyCount : '--');
    renderDevOwnedCards();
    applyDevOverrides();
  }

  // ---- 发射解算（共享 tank_fire.js updateSolution 写本面板 DOM id） ----
  function updateSolution() {
    if (H.hideSolutionSection) return null;
    const ctx = getCtx();
    if (!ctx) return null;
    const shared = _g('updateSolution', null);   // 全局共享实现（tank_fire.js）
    if (typeof shared !== 'function') return null;
    return shared(ctx);
  }

  // `/` 快捷键：面板打开时聚焦卡牌搜索框（输入框内不拦截）
  window.addEventListener('keydown', function (e) {
    if (!isDevOpen()) return;
    const t = e.target;
    const tag = t instanceof Element ? t.tagName : '';
    const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    if (e.key === '/' && !typing) {
      e.preventDefault();
      showDevTab('cards');
      const s = $('devCardSearch');
      if (s instanceof HTMLElement) s.focus();
    }
  });

  function refreshAll() {
    showDevTab(devActiveTab);
    syncDevInputs();
    renderDevMods();
    updateDevParams();
    updateSolution();
  }

  return {
    el: wrap,
    cheats: cheats,
    showDevTab: showDevTab,
    syncDevInputs: syncDevInputs,
    renderDevMods: renderDevMods,
    applyDevOverrides: applyDevOverrides,
    updateDevParams: updateDevParams,
    updateSolution: updateSolution,
    refreshAll: refreshAll,
    isOpen: function () { return wrap.style.display !== 'none'; }
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { mountDevPanel: mountDevPanel };
}