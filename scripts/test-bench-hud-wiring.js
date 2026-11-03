// test-bench-hud-wiring.js — bench 底部 HUD 与卡牌选择器的**页面接线**回归（2026-11-01）。
//
// 背景（用户两轮裁定合并后的现行口径）：
//   ① 「底部弹种选择条太长了，直接删除」→ 随后修正为「弹种选择条还是要和 battle 中的相同」
//      ⇒ 不是删掉完事，而是**换成 battle 同款的 3 槽弹种栏**（14 种平铺条才是「太长」的根因）。
//   ② 「技能（主被动）、速度、血量的 UI 也采用 tank_battle.html 中的 UI」⇒ 走共享渲染层。
//   ③ 「bench 中原有的玩家血条就可以删除」→ 用户随后更正「记错了，血条控件不变」⇒ **不删血条**。
//   ④ 「在右侧面板的卡牌测试开发新的卡牌选择器…多个下拉…考虑通用化，完成后接入 battle 开发者面板」。
//
// 本测试是**静态页面接线断言**（不启动浏览器）：
//   r3 浏览器链在本会话沙箱下必然 EPERM（scripts/lib/browser-launch.cjs 固定返回 86），
//   若只依赖它，"接线写错了" 这件事在 CI 绿灯前无人发现。这里把可静态判定的部分全部锁死。
'use strict';

const fs = require('fs');
const path = require('path');
const U = require('../js/tank_utils.js');
const R = require('../js/tank_rules.js');
global.TAU = U.TAU;
global.RULES = R.RULES;

const ROOT = path.join(__dirname, '..');
const bench = fs.readFileSync(path.join(ROOT, 'tank_bench.html'), 'utf8');
const battle = fs.readFileSync(path.join(ROOT, 'tank_battle.html'), 'utf8');

let fails = 0;
function ok(cond, label) {
  if (cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}`); fails++; }
}

// ==================== ① 底部弹种条：已删除，且换成 battle 同款 3 槽 ====================
{
  // 剥注释后判定（注释里写「ammoIndicator 已删除」是解释，不是元素）
  const benchNoComment = bench.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

  ok(!/id="ammoIndicator"/.test(benchNoComment),
     '负向：bench 不再有 #ammoIndicator 元素（14 弹种平铺条已删除）');
  ok(!/getElementById\(["']ammoIndicator["']\)/.test(benchNoComment),
     '负向：bench 不再查询 #ammoIndicator');
  ok(!/#ammoIndicator\s*\{/.test(benchNoComment),
     '负向：bench 不再有 #ammoIndicator 的 CSS 规则');

  // battle 同款结构存在
  ok(/id="benchBottomHud"/.test(benchNoComment), 'bench 有 battle 同款底部 HUD 容器 #benchBottomHud');
  for (const id of ['slot1', 'slot2', 'slot3']) {
    ok(new RegExp(`id="${id}"`).test(benchNoComment), `弹种槽 ${id} 存在（battle 同款 3 槽）`);
  }
  for (const id of ['playerHpFill', 'playerHpVal', 'hudGear', 'hudSpeedVal', 'hudRoadBonus',
    'skillSlot1', 'skillSlot2', 'skillSlot3', 'passiveSlots', 'btn4', 'btn5', 'btn6', 'btnF']) {
    ok(new RegExp(`id="${id}"`).test(benchNoComment), `HUD 元素 ${id} 存在（与 battle 同构）`);
  }
}

// ==================== ② 走共享渲染层，而不是复制 battle 的实现 ====================
{
  ok(/src="js\/tank_hud_panel\.js"/.test(bench), 'bench 加载共享 HUD 渲染层 js/tank_hud_panel.js');
  ok(/TankHudPanel\.renderPlayerVitals/.test(bench), '血量走 TankHudPanel.renderPlayerVitals');
  ok(/TankHudPanel\.renderSpeedGauge/.test(bench), '速度走 TankHudPanel.renderSpeedGauge');
  ok(/TankHudPanel\.renderAmmoSlots/.test(bench), '弹种槽走 TankHudPanel.renderAmmoSlots');
  ok(/TankHudPanel\.renderSkillSlots/.test(bench), '技能槽走 TankHudPanel.renderSkillSlots');
  ok(/TankHudPanel\.renderPassiveSlots/.test(bench), '被动槽走 TankHudPanel.renderPassiveSlots');

  // 负向：不得再自带一份旧的内联弹种条渲染（14 弹种平铺）
  ok(!/el\.innerHTML = html;[\s\S]{0,200}data-ammo/.test(bench),
     '负向：bench 不再有内联的 data-ammo 弹种格渲染');
}

// ==================== ③ 血条控件保留（用户更正后口径） ====================
{
  // 用户先要求「玩家血条可以删除」，随后更正「记错了，血条控件不变」。
  // 现行口径 = 靶车血条（Dummy Status）保留 + 新增玩家血条（battle 同款）。
  ok(/id="eHpBar"/.test(bench) && /id="eHpVal"/.test(bench),
     '靶车血条控件保留（用户更正：血条控件不变）');
  ok(/id="applyHpBtn"/.test(bench), '靶车「应用血量」按钮保留');
  ok(/id="playerHpFill"/.test(bench), '玩家血条为新增（battle 同款），与靶车血条并存');
}

// ==================== ④ 通用卡牌选择器：bench 与 battle 共用同一模块 ====================
{
  ok(/src="js\/tank_card_picker\.js"/.test(bench), 'bench 加载 js/tank_card_picker.js');
  ok(/src="js\/tank_card_picker\.js"/.test(battle), 'battle 加载 js/tank_card_picker.js（同一模块）');
  ok(/id="benchCardPicker"/.test(bench), 'bench 卡牌测试区有选择器容器');
  // `devCardPickerByGroup` 是 tank_devpanel.js 的 mountDevPanel() **动态生成**的，
  // 不在 tank_battle.html 的静态 HTML 里 —— 断言必须去模块源码里找（此处曾写错一次）。
  const devpanelSrc = fs.readFileSync(path.join(ROOT, 'js', 'tank_devpanel.js'), 'utf8');
  ok(/id="devCardPickerByGroup"/.test(devpanelSrc),
     'battle 开发者面板有选择器容器（由 tank_devpanel.js 动态生成）');

  // 旧入口彻底消失（负向）
  ok(!/id="cardSelect"/.test(bench), '负向：bench 旧单下拉 #cardSelect 已删除');
  ok(!/getElementById\(['"]applyCardBtn['"]\)/.test(bench), '负向：旧「应用」按钮接线已删除');
  ok(!/getElementById\(['"]clearCardsBtn['"]\)/.test(bench),
     '负向：旧「清除全部」按钮接线已删除（否则对 null 绑定会让整页抛错，#F7 同款）');

  // 新选择器接线
  ok(/TankCardPicker\.mountCardPicker/.test(bench), 'bench 通过 TankCardPicker.mountCardPicker 挂载');
  ok(/mountDevCardPickerByGroup/.test(battle) || /TankCardPicker\.mountCardPicker/.test(battle) ||
     /mountCardPicker/.test(fs.readFileSync(path.join(ROOT, 'js', 'tank_devpanel.js'), 'utf8')),
     'battle 开发者面板挂载同一选择器（经 tank_devpanel.js）');
}

// ==================== ⑤ 弹种槽配置区（全弹种仍可测） ====================
{
  for (const id of ['benchAmmoSlot1', 'benchAmmoSlot2', 'benchAmmoSlot3',
    'benchApplyLoadoutBtn', 'benchResetLoadoutBtn']) {
    ok(new RegExp(`id="${id}"`).test(bench), `弹种槽配置控件 ${id} 存在`);
  }
  ok(/function benchSetLoadout/.test(bench), 'benchSetLoadout 存在（loadout 可配置）');
  ok(/player\.ammoLoadout = /.test(bench), 'bench 会写 player.ammoLoadout（与 battle 同字段）');
  // 关键：Q/E 只在 loadout 内循环（与 battle 同口径），不会绕回全 14 弹种表
  ok(/function benchCycleAmmo[\s\S]{0,300}benchLoadout\(\)/.test(bench),
     'Q/E 环形循环走 benchLoadout()（loadout 内循环，不是全弹种表）');
}

// ==================== ⑥ 模块加载顺序 ====================
{
  const benchOrder = [...bench.matchAll(/<script src="js\/([^"]+)"/g)].map(m => m[1]);
  const iHudPanel = benchOrder.indexOf('tank_hud_panel.js');
  const iHud = benchOrder.indexOf('tank_hud.js');
  ok(iHudPanel >= 0, 'bench 加载了 tank_hud_panel.js');
  ok(iHud >= 0 && iHudPanel > iHud,
     'tank_hud_panel.js 在 tank_hud.js 之后加载（依赖顺序正确）');

  const iPicker = benchOrder.indexOf('tank_card_picker.js');
  const iDevpanel = benchOrder.indexOf('tank_devpanel.js');
  ok(iPicker >= 0 && iPicker > iDevpanel,
     'bench：tank_card_picker.js 在 tank_devpanel.js 之后（bench 侧在脚本末尾使用）');

  const battleOrder = [...battle.matchAll(/<script src="js\/([^"]+)"/g)].map(m => m[1]);
  const bPicker = battleOrder.indexOf('tank_card_picker.js');
  const bDevpanel = battleOrder.indexOf('tank_devpanel.js');
  ok(bPicker >= 0 && bDevpanel >= 0 && bPicker < bDevpanel,
     'battle：tank_card_picker.js 在 tank_devpanel.js **之前**（面板 mount 时即挂载）');
}

// ==================== ⑦ 分类口径：4 类 + 技能分主被动 ====================
{
  const PICKER = require('../js/tank_card_picker.js');
  const cards = fs.readdirSync(path.join(ROOT, 'cards'))
    .filter(f => f.endsWith('.json'))
    .map(f => JSON.parse(fs.readFileSync(path.join(ROOT, 'cards', f), 'utf8')));
  const groups = PICKER.buildPickerGroups(cards);
  ok(groups.length === 4, `卡牌选择器分 4 类（实际 ${groups.length}）`);
  ok(groups.every(g => g.cards.length > 0), '每个分类都非空');
  const ab = groups.find(g => g.key === 'ability');
  ok(ab && ab.subgroups && ab.subgroups.length === 2,
     '技能类内含「主动技能 / 被动机制」两个子分组（用户要求）');
}

// ==================== ⑧ 驾驶键不被面板控件吞掉（2026-11-01 用户反馈回归） ====================
// 事故：bench 在右侧面板点过任意下拉后，WASD / 方向键完全失效、坦克不动。
// 根因是浏览器原生行为（select 的 typeahead + input 消费按键，都不冒泡到 window），
// 而共享输入控制器在 window 上监听 ⇒ 驾驶链断开。
// 修法是 capture 阶段接管驾驶键。本段锁死「这个接管必须存在且只接管驾驶键」。
{
  const benchSrc = fs.readFileSync(path.join(ROOT, 'tank_bench.html'), 'utf8');
  const flat = benchSrc.replace(/\s+/g, ' ');

  // 注意：这里必须用**词边界** `\bBENCH_DRIVE_KEYS\b`（或精确 `const BENCH_DRIVE_KEYS =`），
  //   否则 `BENCH_DRIVE_KEYS_MUTATED` 这类改名也会被前缀匹配命中，
  //   断言就成了恒真的假绿（2026-11-01 变异测试实测发现）。
  ok(/const BENCH_DRIVE_KEYS = \[/.test(benchSrc), '存在驾驶键白名单常量 BENCH_DRIVE_KEYS（精确名）');
  ok(/\bBENCH_DRIVE_KEYS\.indexOf\b/.test(benchSrc), '白名单在 capture 接管里被实际读取（精确名）');
  ok(/'w', 'a', 's', 'd'/.test(flat), '驾驶键白名单含 WASD');
  ok(/arrowup|arrowUp/i.test(benchSrc), '驾驶键白名单含方向键（靶车第二驾驶位）');

  const captureBlock = (benchSrc.match(/addEventListener\('keydown', \(e\) => \{[\s\S]{0,1200}?\}, true\);/) || [''])[0];
  ok(captureBlock.length > 0, '存在 capture 阶段的 keydown 接管（第三参 true）');
  ok(/BENCH_DRIVE_KEYS\.indexOf/.test(captureBlock),
     '负向：capture 接管先判白名单（不是无差别拦截所有按键）');
  ok(/preventDefault/.test(captureBlock) && /blur/.test(captureBlock),
     'capture 接管同时做 preventDefault + blur（把焦点还给画布）');
  ok(/SELECT/.test(captureBlock) && /INPUT/.test(captureBlock),
     '接管范围限定在 SELECT / INPUT（textarea 同名路径）');
}

// ==================== ⑨ select 数量变化必须同步复核（防再次踩坑） ====================
{
  const benchSrc = fs.readFileSync(path.join(ROOT, 'tank_bench.html'), 'utf8');
  const staticSelects = [...benchSrc.matchAll(/<select\b/g)].length;
  ok(staticSelects >= 6,
     `bench 静态 select 数 = ${staticSelects}（本批新增弹种槽 3 个；数量变化时必须复核驾驶键接管仍生效）`);
  const pickerSrc = fs.readFileSync(path.join(ROOT, 'js', 'tank_card_picker.js'), 'utf8');
  ok(/createElement\('select'\)/.test(pickerSrc), '卡牌选择器动态创建 select（同样受驾驶键接管保护）');
}

// ==================== ⑩ 主循环韧性（2026-11-02 事故：HUD 异常打死主循环）====================
// 事故链（用户现象：**坦克不可移动 + 坦克列表也加载不出来**）：
//   updateHud 里写 `skillSlots: () => skillSlots()` —— 而 skillSlots() 是 tank_battle.html 的
//   内联函数，bench 从未定义它 ⇒ 每帧 ReferenceError ⇒ update() 抛到 loop() ⇒
//   `requestAnimationFrame(loop)` 永不执行 ⇒ 主循环当场死亡。
//   列表加载不出来是同一崩溃的下游表现（不是「加载逻辑坏了」）。
{
  const benchSrc = fs.readFileSync(path.join(ROOT, 'tank_bench.html'), 'utf8');
  const hudSrc = fs.readFileSync(path.join(ROOT, 'js', 'tank_hud_panel.js'), 'utf8');

  ok(/function skillSlotsOf/.test(hudSrc), '共享层实现 skillSlotsOf（技能槽读取内聚）');
  // 关键：不能只断言「函数存在」——必须断言 renderSkillSlots **真的在用它**。
  //   2026-11-02 变异测试实测：只写 /function skillSlotsOf/ 时，把回落改成
  //   `player.skillSlots || []` 仍然全绿 ⇒ 断言无分辨力（第二次踩这个坑）。
  const renderBody = (hudSrc.match(/function renderSkillSlots[\s\S]*?\n\}/) || [''])[0];
  // 判据只看**代码**：函数体里的注释写着「此前缺省走 `player.skillSlots || []`」是沿革说明，
  //   不是现行实现（2026-11-02 实测：不剥注释会把自己的说明文字判成违规）。
  const renderCode = renderBody.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  ok(/skillSlotsOf\(player, count\)/.test(renderCode),
     'renderSkillSlots 的缺省分支实际调用 skillSlotsOf（不只是函数存在）');
  ok(!/player\.skillSlots \|\| \[\]/.test(renderCode),
     '负向：缺省分支不得退回 `player.skillSlots || []`（不惰性初始化，槽位数会错）');

  const benchCode = benchSrc
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
  ok(!/\(\)\s*=>\s*skillSlots\s*\(\s*\)/.test(benchCode),
     '负向：bench 不得再注入 `() => skillSlots()`（那是 battle 页面专属函数）');
  ok(!/(?<![.\w$])skillSlots\s*\(\s*\)/.test(benchCode.replace(/skillSlotsOf/g, '')),
     '负向：bench 内不存在对未定义 skillSlots() 的调用');

  ok(/try \{\s*if\(typeof TankHudPanel/.test(benchSrc.replace(/\n/g, ' ').replace(/\s+/g, ' ')),
     'HUD 渲染块被 try 包住（装饰层异常不许打死模拟主循环）');
  ok(/catch\(err\)/.test(benchSrc), '存在 catch 分支处理 HUD 异常');
  ok(/_hudErrLogged/.test(benchSrc), 'HUD 异常只记一次（不每帧刷日志）');

  ok(/while \(accumulator >= STEP_TIME\)[\s\S]{0,200}update\(STEP_TIME\)/.test(benchSrc),
     '主循环仍以固定步长调用 update()');
  ok(/draw\(\);[\s\S]{0,500}requestAnimationFrame\(loop\)/.test(benchSrc),
     '主循环在 draw 之后重新排队 rAF');
}

// ==================== ⑪ HUD 渲染端到端：连续多帧不得抛错 ====================
// 直接复刻 bench updateHud 的 HUD 段（共享层 + 桩 DOM），连跑 60 帧。
// 能在**不启动浏览器**的前提下抓出「HUD 里引用未定义符号」这类事故。
{
  const HUD = require('../js/tank_hud_panel.js');
  const MODEL = require('../js/tank_model.js');

  const elems = {};
  function el(id) {
    if (!elems[id]) {
      elems[id] = {
        id, textContent: '', innerHTML: '', title: '', style: { cssText: '', display: '', width: '' },
        children: [], _classes: new Set(),
        classList: {
          toggle(c, o) { if (o === undefined) o = !elems[id]._classes.has(c); if (o) elems[id]._classes.add(c); else elems[id]._classes.delete(c); },
          add(c) { elems[id]._classes.add(c); }, remove(c) { elems[id]._classes.delete(c); },
          contains(c) { return elems[id]._classes.has(c); },
        },
        appendChild(c) { elems[id].children.push(c); return c; },
        querySelector() { return null; }, addEventListener() {},
      };
    }
    return elems[id];
  }
  const prevDoc = global.document;
  global.document = /** @type {any} */ ({ getElementById: (id) => el(id), createElement: () => el('__n' + Math.random()) });
  global.window = /** @type {any} */ ({ innerWidth: 1024, innerHeight: 768 });

  const p = MODEL.makeTank({ x: 0, y: 0, team: 'player', id: 't' });
  p.cardEffects = []; p.modifiers = [];
  p.weapons = { primary: { type: 'standard', stats: {} }, secondary: { type: 'turret', stats: {} } };

  let frameErr = null, okFrames = 0;
  for (let i = 0; i < 60; i++) {
    try {
      HUD.renderPlayerVitals(p, {});
      HUD.renderSpeedGauge(p, {});
      HUD.renderAmmoSlots(p, {});
      HUD.renderSkillSlots(p, { hasAbility: () => false, labels: {} }, {});
      HUD.renderPassiveSlots(p, { passiveSlotState: () => ({ max: 2, cardIds: [] }), cardById: () => null }, {});
      HUD.renderAbilityCdBadges(p, {});
      HUD.renderSecondaryButton(p, {});
      okFrames++;
    } catch (e) { frameErr = e; break; }
  }
  global.document = prevDoc;

  ok(frameErr === null,
     `HUD 段连续 60 帧无异常${frameErr ? `（第 ${okFrames + 1} 帧抛错：${frameErr.message}）` : ''}`);
}

// ==================== ⑫ 弹种/技能按钮横排（2026-11-02 用户反馈「弹种UI竖起来了」）====================
// 事故：bench 抄了 battle 的 DOM 结构却没抄度量，三处叠加导致按钮竖排——
//   ① `#abilityBtns` 多了 `flex-wrap:wrap` ⇒ 窄容器换行；
//   ② `.abtn` 漏 `height:30px` 定高 + 用了 `flex-direction:column` ⇒ 被内容撑成高竖条；
//   ③ `.num` / `.cd` 写成流内元素（battle 是 position:absolute）⇒ 角标占真实高度。
// 判据：以 battle 的度量做基准，逐项比对；并加一条「三处必须同时满足」的负向组合断言。
{
  const benchSrc = fs.readFileSync(path.join(ROOT, 'tank_bench.html'), 'utf8');
  const battleSrc = fs.readFileSync(path.join(ROOT, 'tank_battle.html'), 'utf8');

  // 取 bench 里控制行内按钮容器的最后一条规则（后者覆盖前者，与浏览器同序）
  const benchRule = (benchSrc.match(/#abilityBtns,\s*#skillBtns\{[^}]*\}/g) || []).pop() || '';
  ok(benchRule.length > 0, '存在 #abilityBtns/#skillBtns 容器规则');
  ok(!/flex-wrap\s*:\s*wrap/.test(benchRule),
     '负向：容器不得设 flex-wrap:wrap（窄容器会把按钮折行成竖排）');
  ok(/display\s*:\s*flex/.test(benchRule), '容器是 flex 横排');

  // .abtn 必须有定高（否则 column 布局被内容撑高）
  const abtnRule = (benchSrc.match(/#benchBottomHud\s+\.abtn\{[^}]*\}/g) || []).pop() || '';
  ok(abtnRule.length > 0, '存在 #benchBottomHud .abtn 规则');
  ok(/height\s*:\s*30px/.test(abtnRule),
     '按钮有定高 height:30px（与 battle #abilityBtns .abtn 同度量）');
  ok(/min-width\s*:\s*40px/.test(abtnRule),
     '按钮有最小宽度 min-width:40px（与 battle 同度量）');

  // 角标必须是绝对定位（流内会撑高按钮）
  const numRule = (benchSrc.match(/#benchBottomHud\s+\.abtn\s+\.num\{[^}]*\}/g) || []).pop() || '';
  const cdRule = (benchSrc.match(/#benchBottomHud\s+\.abtn\s+\.cd\{[^}]*\}/g) || []).pop() || '';
  ok(/position\s*:\s*absolute/.test(numRule), '.num 绝对定位（不占流内高度）');
  ok(/position\s*:\s*absolute/.test(cdRule), '.cd 绝对定位（不占流内高度）');

  // 交叉核对：battle 的基准值若变化，本断言应提醒复核
  const battleAbtn = (battleSrc.match(/#abilityBtns \.abtn\{[^}]*\}/g) || [])[0] || '';
  ok(/height\s*:\s*30px/.test(battleAbtn),
     '基准核对：battle 的 .abtn 仍是 height:30px（若改，bench 同步）');

  // 负向组合：三处只要有一处回退就会竖排 ⇒ 联合断言
  const verticalRisk =
    (/flex-wrap\s*:\s*wrap/.test(benchRule) ? 1 : 0) +
    (!/height\s*:\s*30px/.test(abtnRule) ? 1 : 0) +
    (!/position\s*:\s*absolute/.test(numRule) || !/position\s*:\s*absolute/.test(cdRule) ? 1 : 0);
  ok(verticalRisk === 0,
     `负向：三处竖排诱因必须全为 0（当前 ${verticalRisk} 处：flex-wrap / 无定高 / 角标非绝对定位）`);
}

console.log('test-bench-hud-wiring: 完成所有检查');
if (fails === 0) console.log('test-bench-hud-wiring: 全部通过');
else { console.error(`test-bench-hud-wiring: ${fails} 项失败`); process.exit(1); }
