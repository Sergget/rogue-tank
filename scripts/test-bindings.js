// ============================================================================
// test-bindings.js — js/tank_bindings.js 共享键位/输入控制器/设置层 回归测试
// 覆盖（解耦轮 2026-09-13）：
//   1. KEY_BINDINGS 完整性与规范化（无重复键、必需动作齐全、小写形态）；
//   2. createInputController：键登记/keyup 清除、边沿动作路由、gate 门控、
//      preventDefault 门控、未注册动作键失效（页面能力差异 = 注册差异）；
//   3. driveArgs / altDriveArgs：WASD 与方向键双驾驶位、倒车倒置设置透传；
//   4. loadSettings/saveSettings：独立存储读写 + 损坏 JSON 回默认；
//   5. describeBindings：可用动作过滤输出。
// 运行：node scripts/test-bindings.js
// ============================================================================
'use strict';

require('../js/tank_utils.js');                          // QA 约定：环境 shim 先行（TAU 等全局）
const R = require('../js/tank_rules.js');
global.RULES = R.RULES;                                  // QA 约定：RULES 全局（本测试不消费，但保持环境一致性）
const B = require('../js/tank_bindings.js');

let fails = 0;
function ok(cond, label){
  if (cond) console.log(`\u2713 ${label}`);
  else { console.error(`\u2717 ${label}`); fails++; }
}
function makeFakeWindow(){
  const listeners = { keydown: [], keyup: [] };
  return {
    addEventListener(type, fn){ listeners[type].push(fn); },
    removeEventListener(type, fn){ listeners[type] = listeners[type].filter(f => f !== fn); },
    fire(type, e){ listeners[type].forEach(fn => fn(e)); }
  };
}

// ---------- 1) 键位表完整性 ----------
ok(Object.keys(B.KEY_BINDINGS).length > 0, 'KEY_BINDINGS 非空');
{
  const seen = new Set();
  let dup = null;
  for (const [name, key] of Object.entries(B.KEY_BINDINGS)) {
    const k = String(key).toLowerCase();
    if (k !== String(key)) dup = dup || `${name}=${key} 未小写规范化`;
    if (seen.has(k)) dup = dup || `${name}=${key} 与其他动作重复`;
    seen.add(k);
  }
  ok(dup === null, `键值无重复且全部小写规范化（${dup || 'ok'}）`);
}
for (const required of ['moveForward','moveBackward','turnLeft','turnRight','fire','ammoNext','ammoPrev',
  'switchWeapon','abilityStrike','abilityShield','abilityOverdrive','supportRepair','supportMedkit',
  'supportExtinguish','panelStatus','panelDev','pauseToggle','altMoveForward']) {
  ok(B.KEY_BINDINGS[required] !== undefined, `必需动作 ${required} 存在`);
}
ok(B.KEY_BINDINGS.supportSmoke === undefined, 'supportSmoke（烟幕弹 F 键）已移除（2026-09-15 W2）');
ok(B.KEY_BINDINGS.switchWeapon === 'f', 'F 键绑定 switchWeapon（切换主/副武器）');
ok(B.KEY_BINDINGS.fire === ' ' && B.KEY_BINDINGS.panelDev === '`' && B.KEY_BINDINGS.pauseToggle === 'escape',
  '关键键位形态（空格/反引号/escape）符合 e.key 规范化约定');
ok(B.KEY_BINDINGS.ammoNext === 'e' && B.KEY_BINDINGS.ammoPrev === 'q',
  '切弹键 E=下一发 / Q=上一发（2026-09-14 用户定案反向，与 mvp 语义一致）');

// ---------- 2) createInputController ----------
{
  const win = makeFakeWindow();
  global.window = /** @type {any} */ (win);   // 模块顶层无 window 依赖；createInputController 内部读取
  const fired = [];
  const input = B.createInputController({
    actions: { ammoNext(){ fired.push('ammoNext'); }, pauseToggle(){ fired.push('pauseToggle'); } },
    gate: (a) => a === 'pauseToggle' ? true : false,   // 模拟 mvp 局外菜单门控
    preventKeys: [' '],
    settings: () => ({ invertReverseTurn: false })
  });
  // 门控拒绝：不登记按键、不触发动作
  win.fire('keydown', { key: 'q', preventDefault(){} });
  ok(fired.length === 0 && input.keys['q'] !== true, 'gate 拒绝 → 不登记、不触发（mvp 局外语义）');
  // pauseToggle 越过门控
  win.fire('keydown', { key: 'Escape', preventDefault(){} });
  ok(fired.includes('pauseToggle'), 'pauseToggle 不受菜单门控（ESC 暂停语义）');
  ok(input.keys['escape'] === true, 'keydown 登记 e.key 小写规范化');
  win.fire('keyup', { key: 'Escape' });
  ok(input.keys['escape'] !== true, 'keyup 清除（e.key=Escape 归一为 escape）');
  input.detach();

  // gate 恒 true：动作触发 + preventDefault 生效
  let prevented = false;
  const input2 = B.createInputController({
    actions: { ammoNext(){ fired.push('ammoNext-2'); } },
    gate: () => true,
    preventKeys: [' '],
    settings: () => ({})
  });
  win.fire('keydown', { key: 'e', preventDefault(){} });
  ok(fired.includes('ammoNext-2'), 'gate 通过 → 边沿动作触发');
  win.fire('keydown', { key: ' ', preventDefault(){ prevented = true; } });
  ok(prevented, 'preventKeys 空格被 preventDefault（防页面滚动）');
  ok(input2.keys[' '] === true, '空格登记为持续键（isDown 可读）');
  ok(input2.isDown('fire') === true, "isDown('fire') 读持续键");
  ok(input2.isDown('abilityShield') === false, '未按下动作 isDown=false');
  input2.detach();

  // 未注册动作键失效（页面能力差异 = 注册差异）
  const input3 = B.createInputController({ gate: () => true, settings: () => ({}) });
  let strikeFired = false;
  win.fire('keydown', { key: 'g', preventDefault(){} });
  ok(input3.keys['g'] === true && strikeFired === false, '未注册动作 → 键仍登记（updateSigma 同形消费）但不路由');
  input3.detach();

  // 无 window（Node）环境不抛错
  delete global.window;
  const input4 = B.createInputController({ gate: () => true, settings: () => ({}) });
  ok(typeof input4.driveArgs === 'function', '无 window 环境创建不抛错（Node 可测）');
}

// ---------- 3) driveArgs / altDriveArgs ----------
{
  const input = B.createInputController({ allowAltMove: true, settings: () => ({ invertReverseTurn: true }) });
  const k = input.keys;
  k['w'] = true; k['a'] = true;
  ok(input.driveArgs().move === 1 && input.driveArgs().turn === -1, 'W+A → 前进+左转');
  delete k['w']; delete k['a']; k['s'] = true; k['d'] = true;
  const back = input.driveArgs();
  ok(back.move === -1 && back.turn === 1, 'S+D → 后退+右转');
  ok(back.invertTurnWhenReversing === true, '倒车倒置设置透传 driveArgs（与 mvp 2243 同语义）');
  delete k['s']; delete k['d'];
  k['arrowup'] = true; k['arrowleft'] = true;
  const alt = input.altDriveArgs();
  ok(alt.move === 1 && alt.turn === -1, '方向键 altDriveArgs（测试台靶车驾驶位）');
  ok(alt.invertTurnWhenReversing === true, 'altDriveArgs 同样透传倒车倒置（解耦轮补齐）');
  delete k['arrowup']; delete k['arrowleft'];

  const noAlt = B.createInputController({ allowAltMove: false, settings: () => ({}) });
  noAlt.keys['arrowup'] = true;
  ok(noAlt.altDriveArgs().move === 0, 'allowAltMove=false → 方向键不生效（mvp 侧）');
  ok(noAlt.driveArgs().invertTurnWhenReversing === false, '缺设置 → 倒车倒置缺省 false（零影响）');
}

// ---------- 4) 设置存储 ----------
{
  const store = new Map();
  const storage = { getItem: (k) => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, v) };
  const s = B.loadSettings(storage);
  ok(s.invertReverseTurn === false && s.showFps === false && s.benchPanelOpen === false, '空存储 → 默认设置');
  s.invertReverseTurn = true; s.showFps = true;
  B.saveSettings(storage, s);
  const s2 = B.loadSettings(storage);
  ok(s2.invertReverseTurn === true && s2.showFps === true, 'save→load 往返一致（键 rogue-tank-settings）');
  store.set(B.SETTINGS_STORAGE_KEY, '{broken json');
  const s3 = B.loadSettings(storage);
  ok(s3.invertReverseTurn === false, '损坏 JSON → 回默认（不抛错）');
  const s4 = B.loadSettings(null);
  ok(s4.invertReverseTurn === false, '无 storage → 默认设置不抛错');
  B.saveSettings(null, s);
  ok(true, '无 storage 保存静默不抛错');
}

// ---------- 5) describeBindings ----------
{
  const all = B.describeBindings({ move:1, fire:1, ammoCycle:1, altMove:1, panelDev:1, pauseToggle:1 });
  ok(all.length === 6, 'available 过滤：6 组动作全部输出');
  ok(all[0].action === 'move' && all[0].keys === 'W / A / S / D', '顺序与文案（move 行）');
  const none = B.describeBindings({});
  ok(none.length === 0, '无可用动作 → 空输出');
  const benchRows = B.describeBindings({ move:1, altMove:1, fire:1, ammoCycle:1, abilityStrike:1, abilityOverdrive:1, panelDev:1 });
  ok(benchRows.length === 7 && benchRows.some(r => r.action === 'altMove'), '测试台键位说明含方向键行');
}

// ---------- 6) #A21：ACTION_INFO 文案反映「F 只切换槽位，左键/空格按激活槽位击发」 ----------
{
  ok(B.ACTION_INFO.fire.desc.indexOf('副武器') !== -1, 'fire 文案反映左键/空格按激活槽位分发（#A21）');
  ok(B.ACTION_INFO.switchWeapon.desc.indexOf('自动运作') === -1, 'switchWeapon 文案不再描述副武器自动运作（#A21）');
  ok(B.ACTION_INFO.switchWeapon.desc.indexOf('击发') !== -1, 'switchWeapon 文案含手动击发语义（#A21）');
}

console.log(fails === 0 ? '\n\u2713 test-bindings 全部通过' : `\n\u2717 ${fails} 项失败`);
process.exit(fails === 0 ? 0 : 1);
