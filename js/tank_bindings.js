// ============================================================================
// tank_bindings.js — 操作键位/输入控制器/设置 的共享层（mvp 正式游戏 ⇄ bench 测试台）
// ----------------------------------------------------------------------------
// 背景（2026-09-13 解耦轮）：两页此前各自内联 keydown/keyup 与设置读写——
//   · mvp：WASD + 空格/鼠标 + Q/E 切弹 + 1/2/3 技能池 + F/G/H/V + 4/5/6 + Tab/`/ESC，
//     设置（倒车转向倒置/FPS）走 profile.settings 持久化；
//   · bench：WASD + 方向键 + 空格 + 数字 1~N 直选弹种，无任何设置存储，
//     driveTank 不传 invertTurnWhenReversing（倒车倒置在测试台无效）。
// 本模块提供三件事（纯逻辑、双端导出、Node 可测）：
//   1) KEY_BINDINGS / ACTION_INFO：动作→键位与说明的唯一数据源；
//   2) createInputController：统一 keydown/keyup 注册（规范化 e.key.toLowerCase、
//      preventDefault 门控、边沿动作路由、持续键 isDown、driveArgs 含倒车倒置）；
//      页面只注册自己支持的动作 handler——未注册动作的键在该页自然失效，
//      「两边能力差异 = 注册差异」而非两套硬编码键位。
//   3) loadSettings/saveSettings：无存档系统页（bench）的独立设置存储
//      （键 rogue-tank-settings）；mvp 继续走 profile.settings（沿用存档系统），
//      两边设置字段保持一致（invertReverseTurn/showFps，+ bench 面板开合状态）。
// 浏览器加载顺序：tank_rules.js 之后任意位置（不依赖 RULES）；本文件无 DOM 顶层依赖
//（window 访问全部延迟到 createInputController 调用时）。
// ============================================================================

(function (global) {
  'use strict';

  // ---- 1) 键位唯一数据源 ----------------------------------------------------
  // 键值统一为 e.key.toLowerCase() 规范化形式（空格为 ' '，方向键为 'arrowup' 等）。
  // alt* 前缀 = 测试台额外键（createInputController({ allowAltMove:true }) 才生效）。
  var KEY_BINDINGS = {
    moveForward: 'w', moveBackward: 's', turnLeft: 'a', turnRight: 'd',
    altMoveForward: 'arrowup', altMoveBackward: 'arrowdown',
    altTurnLeft: 'arrowleft', altTurnRight: 'arrowright',
    fire: ' ',
    ammoNext: 'e', ammoPrev: 'q',
    skill1: '1', skill2: '2', skill3: '3',
    fireSecondary: 'f',   // #C4e（2026-09-17）：F=直接击发副武器（按住连发），不再切换主/副（旧 switchWeapon 反转）
    abilityStrike: 'g', abilityShield: 'h', abilityOverdrive: 'v',
    supportRepair: '4', supportMedkit: '5', supportExtinguish: '6',
    panelStatus: 'tab', panelDev: '`', panelDevAlt: 'f12',
    pauseToggle: 'escape'
  };

  // 动作说明（键位说明面板 / ESC 暂停面板共用渲染源）。
  var ACTION_INFO = {
    move: { keys: 'W / A / S / D', desc: '驾驶（前进 / 转向 / 后退）' },
    altMove: { keys: '↑ / ← / ↓ / →', desc: '方向键驾驶（测试台专用）' },
    fire: { keys: '空格 / 鼠标左键', desc: '主炮开火（空格=双管齐射）' },
    ammoCycle: { keys: 'E / Q', desc: '环形切换弹种（下一个 / 上一个）' },
    skillPool: { keys: '1 / 2 / 3', desc: '主动技能池（对应已装备技能 1~3）' },
    fireSecondary: { keys: 'F（按住）', desc: '副武器击发（按住连发；主炮=左键/空格）' },
    abilityStrike: { keys: 'G', desc: '战术炮击（鼠标指向落点）' },
    abilityShield: { keys: 'H / Shift+H', desc: '护盾（定向 / 全向）' },
    abilityOverdrive: { keys: 'V', desc: '超级装填（爆发装填）' },
    supportRepair: { keys: '4', desc: '修理箱' },
    supportMedkit: { keys: '5', desc: '医疗包' },
    supportExtinguish: { keys: '6', desc: '灭火器' },
    panelStatus: { keys: 'Tab', desc: '状态面板' },
    panelDev: { keys: '`（反引号）/ F12', desc: '开发者 / 测试面板' },
    pauseToggle: { keys: 'ESC', desc: '暂停 / 设置' }
  };

  // 说明行规范顺序（describeBindings 按此输出）。
  var ACTION_ORDER = ['move', 'altMove', 'fire', 'ammoCycle', 'skillPool',
    'fireSecondary', 'abilityStrike', 'abilityShield', 'abilityOverdrive',
    'supportRepair', 'supportMedkit', 'supportExtinguish',
    'panelStatus', 'panelDev', 'pauseToggle'];

  // 汇总动作 → 说明行。available: { 动作组名: true/false }，false 或缺失则不输出。
  function describeBindings(available) {
    var a = available || {};
    return ACTION_ORDER.filter(function (n) { return !!a[n]; }).map(function (n) {
      return { action: n, keys: ACTION_INFO[n].keys, desc: ACTION_INFO[n].desc };
    });
  }

  // ---- 2) 输入控制器 --------------------------------------------------------
  // opts:
  //   actions      {动作名: fn}  keydown 边沿触发（切弹/技能/面板/暂停等）；
  //   gate         fn(actionName) => boolean  动作是否生效（页面注入菜单门控等；
  //                默认恒 true。held 键 preventDefault 也经此门控）；
  //   preventKeys  [' ','tab']    需 preventDefault 的规范化键（门控通过时）；
  //   settings     对象或 () => 对象  driveArgs 读 invertReverseTurn（延迟取值，
  //                兼容 profile.settings 运行期创建）；
  //   allowAltMove boolean        启用 alt* 方向键（测试台）。
  // 返回 { keys, isDown(name), driveArgs(), detach() }：
  //   keys —— 规范化键→true 的对象，与旧页面内联 keys 同形，可直接传
  //           updateSigma(t, dt, keys) 等既有消费方（无需改动共享模块）。
  function createInputController(opts) {
    var o = opts || {};
    var B = KEY_BINDINGS;
    var keys = {};
    var edgeActions = o.actions || {};
    var gate = o.gate || function () { return true; };
    var preventSet = {};
    (o.preventKeys || []).forEach(function (k) { preventSet[k] = true; });
    var allowAltMove = !!o.allowAltMove;
    var getSettings = (typeof o.settings === 'function') ? o.settings : function () { return o.settings; };

    // 边沿动作路由表：规范化键 → 动作名（仅页面注册过的动作）。
    var edgeByKey = {};
    for (var name in B) {
      if (name.indexOf('alt') === 0 && !allowAltMove) continue;
      if (edgeActions[name]) edgeByKey[B[name]] = name;
    }

    function onKeyDown(e) {
      var k = (e && e.key ? e.key : '').toLowerCase();
      var action = edgeByKey[k];
      var allowed = gate(action || null);
      if (!allowed) return;   // 门控拒绝（如局外菜单）：不登记按键、不触发动作（与旧 mvp 语义一致，防按键卡死）
      if (k) keys[k] = true;
      // #C4e：长按系统自动重复（e.repeat）不重复触发边沿动作（此前 F 切换语义下
      // 按住 F 会因自动重复快速来回翻转；现为按住连发语义，边沿动作仅需 keydown 首发一次）
      if (action && !(e && e.repeat)) edgeActions[action]();
      if (preventSet[k]) e.preventDefault();
    }
    function onKeyUp(e) {
      var k = (e && e.key ? e.key : '').toLowerCase();
      if (k) keys[k] = false;
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);
    }

    function isDown(actionName) {
      var k = B[actionName];
      return k !== undefined && !!keys[k];
    }
    function driveArgs() {
      var turn = 0, move = 0;
      if (keys[B.turnLeft]) turn = -1; else if (keys[B.turnRight]) turn = 1;
      if (keys[B.moveForward]) move = 1; else if (keys[B.moveBackward]) move = -1;
      var s = getSettings() || {};
      return { turn: turn, move: move, invertTurnWhenReversing: !!s.invertReverseTurn };
    }
    // 方向键驾驶（allowAltMove 时生效）：测试台用于驱动靶车（与玩家 WASD 并行的第二驾驶位）。
    function altDriveArgs() {
      var turn = 0, move = 0;
      if (allowAltMove) {
        if (keys[B.altTurnLeft]) turn = -1; else if (keys[B.altTurnRight]) turn = 1;
        if (keys[B.altMoveForward]) move = 1; else if (keys[B.altMoveBackward]) move = -1;
      }
      var s = getSettings() || {};
      return { turn: turn, move: move, invertTurnWhenReversing: !!s.invertReverseTurn };
    }
    function detach() {
      if (typeof window !== 'undefined') {
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
      }
    }
    return { keys: keys, isDown: isDown, driveArgs: driveArgs, altDriveArgs: altDriveArgs, detach: detach };
  }

  // ---- 3) 独立设置存储（bench 等无存档系统页） -------------------------------
  var SETTINGS_KEY = 'rogue-tank-settings';
  function defaultSettings() {
    return { invertReverseTurn: false, showFps: false, benchPanelOpen: false };
  }
  function loadSettings(storage) {
    var out = defaultSettings();
    try {
      var raw = storage && storage.getItem(SETTINGS_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          for (var k in out) {
            if (parsed[k] !== undefined) out[k] = !!parsed[k];
          }
        }
      }
    } catch (e) { /* 损坏 JSON：回默认 */ }
    return out;
  }
  function saveSettings(storage, s) {
    try { storage && storage.setItem(SETTINGS_KEY, JSON.stringify(s || {})); } catch (e) { /* 无存储：静默 */ }
  }

  global.TANK_BINDINGS_KEY_BINDINGS = KEY_BINDINGS;
  global.TANK_BINDINGS_ACTION_INFO = ACTION_INFO;
  global.createInputController = createInputController;
  global.describeBindings = describeBindings;
  global.loadSettings = loadSettings;
  global.saveSettings = saveSettings;
  global.defaultSettings = defaultSettings;
  global.SETTINGS_STORAGE_KEY = SETTINGS_KEY;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      KEY_BINDINGS: KEY_BINDINGS,
      ACTION_INFO: ACTION_INFO,
      ACTION_ORDER: ACTION_ORDER,
      describeBindings: describeBindings,
      createInputController: createInputController,
      loadSettings: loadSettings,
      saveSettings: saveSettings,
      defaultSettings: defaultSettings,
      SETTINGS_STORAGE_KEY: SETTINGS_KEY
    };
  }
})(typeof window !== 'undefined' ? window : globalThis);
