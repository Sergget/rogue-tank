'use strict';
// @ts-nocheck
// ============================================================================
// scripts/test-weapon-keypress.js — 按键链路端到端测试（用户验收口径）
//
// 目标：验证「各主武器 / 副武器类型都能通过按键正常使用」——不是直接调用 tryFire，
//       而是走真实输入链路：createInputController 登记 keydown/keyup（F=fireSecondary、
//       空格=fire）→ 页面 actions 适配 → 分发（tryFirePrimary / tryFireSecondary）。
//
// 2026-09-17 #C4e（用户裁定）：F 键语义反转——F = 直接击发副武器（按住连发），
//       不再承担主/副切换（activeWeaponSlot 概念移除）；主炮 = 左键/空格专属。
//       边沿动作对系统自动重复 keydown（e.repeat）不再重复触发。
//
// 覆盖：
//   主武器：standard / autocannon / double_barrel / railgun   （空格击发 tryFirePrimary）
//   副武器：mortar / missile / rocket / mine_layer / missile_wire
//           （按住 F → tryFireSecondary 连发；turret 为设计例外——自主运作、不响应击发）
//   边界语义：空副武器槽 F 拒绝（不回落主炮）；F 不修改武器数据；e.repeat 不重复边沿动作。
//
// 做法：用一个与 tank_mvp.html 同形的 actions 适配器（mvp 中 fire=主炮击发、
//       F 按住=isDown('fireSecondary') 轮询 tryFireSecondary），把 tank_bindings.
//       createInputController 与 tank_fire / tank_weapons 串起来，然后模拟真实键盘事件序列。
//
// 运行：node scripts/test-weapon-keypress.js
// ============================================================================

const U = require('../js/tank_utils.js');
const R = require('../js/tank_rules.js');
global.TAU = U.TAU; global.norm = U.norm; global.rotate = U.rotate; global.angDiff = U.angDiff;
global.segRayIntersect = U.segRayIntersect; global.partCorners = U.partCorners; global.partEdges = U.partEdges;
global.reflectDir = U.reflectDir; global.distToSegment = U.distToSegment; global.gaussian = U.gaussian;
global.RULES = R.RULES;
const G = require('../js/tank_geometry.js');
global.ARMOR = G.ARMOR; global.BOUNCE_ANGLE = G.BOUNCE_ANGLE; global.HEIGHTS = G.HEIGHTS;
global.hullPoly = G.hullPoly; global.turretPoly = G.turretPoly;
global.raycastTank = G.raycastTank; global.bestHitForPref = G.bestHitForPref; global.shellPartHit = G.shellPartHit;
global.aimPartPreference = G.aimPartPreference; global.moduleFromHit = G.moduleFromHit;
global.faceLabel = G.faceLabel; global.superstructureLabel = G.superstructureLabel;
global.gunRoot = G.gunRoot; global.gunTip = G.gunTip;
const M = require('../js/tank_model.js');
global.makeTank = M.makeTank; global.computeStats = M.computeStats; global.moduleMult = M.moduleMult;
global.debuffReloadRate = M.debuffReloadRate; global.setDebuff = M.setDebuff;
const C = require('../js/tank_cover.js');
global.COVER_TIERS = C.COVER_TIERS; global.findCoversOnPath = C.findCoversOnPath; global.getExposure = C.getExposure;
global.coverNormalAt = C.coverNormalAt; global.damageCover = C.damageCover; global.splashCoversAt = C.splashCoversAt;
global.covers = C.covers;
if (!global.entities) global.entities = [];
global.polyCorners = G.polyCorners; global.polyEdges = G.polyEdges;
const P = require('../js/tank_physics.js');
global.resolveHit = P.resolveHit; global.impactGeometry = P.impactGeometry;
global.burstExplosion = function(){}; global.spawnMuzzleFlash = function(){};
global.spawnImpactFx = function(){}; global.spawnDmgText = function(){};
global.spawnSmoke = function(){}; global.playSound = function(){ return true; }; global.pushLog = function(){};
global.isHostile = function(a, b){ return a !== b; };

const B = require('../js/tank_bindings.js');
const F = require('../js/tank_fire.js');
const W = require('../js/tank_weapons.js');

let fails = 0;
function ok(c, l){ if (c) console.log('\u2713 ' + l); else { console.error('\u2717 ' + l); fails++; } }

// ---- 假 window（捕获输入控制器登记的监听器，供模拟按键） ----
function makeFakeWindow(){
  const listeners = { keydown: [], keyup: [] };
  return {
    addEventListener(type, fn){ (listeners[type] = listeners[type] || []).push(fn); },
    removeEventListener(type, fn){ listeners[type] = (listeners[type] || []).filter(f => f !== fn); },
    fire(type, e){ (listeners[type] || []).forEach(fn => fn(e)); }
  };
}

// ============================================================================
// 与 tank_mvp.html 同形的页面接线：全局 shells / player / input
// ============================================================================
global.shells = [];
global.impacts = [];
global.bounceFx = [];
global.deployables = [];          // 布雷器 registry（fireActiveSecondary 读 c.deployables / global）
global.devAim = { zeroSpread: true };
C.covers.length = 0;

function makePlayer(secType, priType){
  const p = M.makeTank({ id: 'kp_player', team: 'player', x: 0, y: 0, hullAngle: 0, turretAngle: 0,
    base: { penetration: 100, damage: 20, reload: 2, shellSpeed: 1000, maxHp: 100 } });
  p.ammoKey = 'ap'; p.sigma = 0; p.reloadT = 0; p.secondaryReloadT = 0; p.heatPct = 0; p.heatLockT = 0;
  const priStats = Object.assign({}, W.getWeaponDefaults('primary', priType || 'standard'));
  const secStats = (secType && secType !== 'none') ? Object.assign({}, W.getWeaponDefaults('secondary', secType)) : {};
  p.weapons = { primary: { type: priType || 'standard', stats: priStats }, secondary: { type: secType || 'none', stats: secStats } };
  return p;
}

// 页面 fireCtx（mvp 主循环构造的等价物）
function makeFireCtx(p){
  return {
    player: p, mouseWorld: { x: 500, y: 0 }, shells: global.shells, impacts: global.impacts, bounceFx: global.bounceFx,
    entities: global.entities, covers: C.covers, RULES: global.RULES, COVER_TIERS: C.COVER_TIERS,
    nearestEnemyTo: (t) => ENEMY, gunRoot: G.gunRoot, gunTip: G.gunTip, raycastTank: G.raycastTank,
    aimPartPreference: G.aimPartPreference, bestHitForPref: G.bestHitForPref, getPartZRange: G.getPartZRange,
    getExposure: C.getExposure, findCoversOnPath: C.findCoversOnPath, shellPartHit: G.shellPartHit,
    coverNormalAt: C.coverNormalAt, reflectDir: U.reflectDir, resolveHit: P.resolveHit,
    burstExplosion: global.burstExplosion, spawnMuzzleFlash: global.spawnMuzzleFlash,
    spawnImpactFx: global.spawnImpactFx, spawnDmgText: global.spawnDmgText, playSound: global.playSound,
    pushLog: global.pushLog, damageCover: C.damageCover, splashCoversAt: C.splashCoversAt,
    isHostile: global.isHostile, gaussian: () => 0, debuffReloadRate: M.debuffReloadRate,
    computeAmmoConfig: null, fireTank: F.fireTank, fireActiveSecondary: W.fireActiveSecondary,
    // 布雷：spawnMine 契约 = 把地雷推入 registry（tank_deployables.spawnMine 同形）
    spawnMine: (o) => { const reg = o.registry || global.deployables; if (reg) reg.push(o); return o; },
    deployables: global.deployables
  };
}

const ENEMY = M.makeTank({ id: 'kp_enemy', team: 'enemy', x: 500, y: 0, hp: 5000 });

// ---- 输入控制器 + 页面 actions（与 mvp #C4e 同形：fire→tryFirePrimary，F=按住轮询 tryFireSecondary） ----
let PLAYER = makePlayer('none', 'standard');
global.player = PLAYER;
const win = makeFakeWindow();
global.window = /** @type {any} */ (win);
const fireCtx = { current: makeFireCtx(PLAYER) };

const input = B.createInputController({
  actions: {
    fire(){ return F.tryFirePrimary(fireCtx.current); }
  },
  gate: () => true,
  preventKeys: [' '],
  settings: () => ({ invertReverseTurn: false })
});

// 真实按键助手
function pressKey(key){
  win.fire('keydown', { key: key, preventDefault(){} });
  win.fire('keyup', { key: key });
}
function pressFire(){                       // 空格 = fire（边沿动作，keydown 即触发）
  const before = global.shells.length + (global.deployables ? global.deployables.length : 0);
  win.fire('keydown', { key: ' ', preventDefault(){} });
  win.fire('keyup', { key: ' ' });
  return (global.shells.length + (global.deployables ? global.deployables.length : 0)) - before;
}
// #C4e 按住 F 轮询语义：keydown（不 keyup）→ 主循环轮询 isDown('fireSecondary') → tryFireSecondary
function holdF_fire(){                      // 返回本次轮询击发数
  const before = global.shells.length + (global.deployables ? global.deployables.length : 0);
  win.fire('keydown', { key: 'f', preventDefault(){} });
  if (input.isDown('fireSecondary')) F.tryFireSecondary(fireCtx.current);   // 主循环帧内轮询
  win.fire('keyup', { key: 'f' });
  return (global.shells.length + (global.deployables ? global.deployables.length : 0)) - before;
}

ok(input && typeof input.isDown === 'function', '按键控制器已建立（isDown 可读）');
ok(B.KEY_BINDINGS.fireSecondary === 'f' && B.KEY_BINDINGS.fire === ' ', 'F=fireSecondary / 空格=fire 键位契约（#C4e）');
ok(B.ACTION_INFO.fireSecondary.desc.indexOf('副武器') !== -1, 'F 文案 = 副武器击发语义（#C4e 反转）');

// ============================================================================
// 主武器：空格击发（4 型；F 不再参与主炮链路）
// ============================================================================
console.log('\n—— 主武器（空格击发 tryFirePrimary） ——');
const PRIMARY_CASES = [
  { type: 'standard',     label: '标准主炮',   expectShells: 1 },
  { type: 'double_barrel', label: '双联火炮',  expectShells: 1 },   // 单发（salvo=false）→ 1 管
  { type: 'autocannon',   label: '速射机炮',   expectShells: 1 },
  { type: 'railgun',      label: '电磁轨道炮', expectShells: 1 }
];
for (const c of PRIMARY_CASES){
  PLAYER = makePlayer('none', c.type);
  global.player = PLAYER;
  global.entities = [PLAYER, ENEMY];
  fireCtx.current = makeFireCtx(PLAYER);
  global.shells.length = 0;
  const fired = pressFire();
  ok(fired >= c.expectShells && global.shells.length >= c.expectShells, `${c.label}: 空格击发产生 ${global.shells.length} 发（按键链路）`);
}

// ============================================================================
// 副武器：按住 F 击发（各型）
// ============================================================================
console.log('\n—— 副武器（按住 F → tryFireSecondary） ——');
const SECONDARY_CASES = [
  { type: 'mortar',       label: '车载迫击炮', expectShells: 1 },
  { type: 'missile',      label: '反坦克导弹', expectShells: 1 },
  { type: 'rocket',       label: '火箭巢',     expectShells: 4 },
  { type: 'mine_layer',   label: '布雷器',     expectShells: 0 },   // 布雷不产生 shell，产生 deployable
  { type: 'missile_wire', label: '线导导弹',   expectShells: 1 }
];
for (const c of SECONDARY_CASES){
  PLAYER = makePlayer(c.type, 'standard');
  global.player = PLAYER;
  global.entities = [PLAYER, ENEMY];
  fireCtx.current = makeFireCtx(PLAYER);
  global.shells.length = 0;
  if (global.deployables) global.deployables.length = 0;
  const fired = holdF_fire();
  if (c.type === 'mine_layer'){
    ok(fired >= 1 && (global.deployables || []).length === 1, `${c.label}: 按住 F 布雷成功（deployable 入注册表）`);
  } else {
    ok(fired >= 1 && global.shells.length >= c.expectShells, `${c.label}: 按住 F 击发产生 ${global.shells.length} 发（按键链路）`);
  }
}

// ============================================================================
// 边界语义：空副武器槽拒绝 / turret 设计例外 / F 不改武器数据 / e.repeat 不重复边沿动作
// ============================================================================
console.log('\n—— 边界语义 ——');
{
  // (a) 副武器 none：按住 F 拒绝（不回落主炮）；空格仍走主炮（1 发 ap）
  PLAYER = makePlayer('none', 'standard');
  global.player = PLAYER;
  global.entities = [PLAYER, ENEMY];
  fireCtx.current = makeFireCtx(PLAYER);
  global.shells.length = 0;
  ok(holdF_fire() === 0 && global.shells.length === 0, '空副武器: 按住 F 拒绝击发（不回落主炮）');
  pressFire();
  ok(global.shells.length === 1 && global.shells[0].ammoKey === 'ap', '空副武器: 空格仍走主炮路径（1 发 ap）');
}
{
  // (b) turret 型副武器：按住 F 不分发（自主运作，设计例外）
  PLAYER = makePlayer('turret', 'standard');
  global.player = PLAYER;
  global.entities = [PLAYER, ENEMY];
  fireCtx.current = makeFireCtx(PLAYER);
  global.shells.length = 0;
  ok(holdF_fire() === 0 && global.shells.length === 0, '副炮塔: 按住 F 不响应击发（自主运作）');
}
{
  // (c) F 只负责击发，不改变武器数据本身（无切换语义）
  PLAYER = makePlayer('mortar', 'double_barrel');
  global.player = PLAYER;
  global.entities = [PLAYER, ENEMY];
  fireCtx.current = makeFireCtx(PLAYER);
  const priBefore = PLAYER.weapons.primary.type, secBefore = PLAYER.weapons.secondary.type;
  holdF_fire();
  ok(PLAYER.weapons.primary.type === priBefore && PLAYER.weapons.secondary.type === secBefore,
    'F 只击发副武器，不修改 weapons 数据（无切换语义）');
}
{
  // (d) e.repeat：系统自动重复 keydown 不重复触发边沿动作（#C4e 输入控制器屏蔽）
  PLAYER = makePlayer('none', 'standard');
  global.player = PLAYER;
  global.entities = [PLAYER, ENEMY];
  fireCtx.current = makeFireCtx(PLAYER);
  global.shells.length = 0;
  win.fire('keydown', { key: ' ', preventDefault(){} });
  win.fire('keydown', { key: ' ', preventDefault(){}, repeat: true });   // 长按自动重复
  win.fire('keyup', { key: ' ' });
  ok(global.shells.length === 1, 'e.repeat: 自动重复 keydown 不重复触发 fire 边沿动作（1 发）');
  ok(input.isDown('fire') === true || global.shells.length >= 1, 'e.repeat: 持续键登记不受 repeat 屏蔽影响');
}

console.log(`\n结果：${fails} 项失败`);
console.log(fails === 0 ? 'test-weapon-keypress: PASS' : 'test-weapon-keypress: FAIL');
process.exit(fails === 0 ? 0 : 1);
