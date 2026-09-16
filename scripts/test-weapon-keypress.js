'use strict';
// @ts-nocheck
// ============================================================================
// scripts/test-weapon-keypress.js — 按键链路端到端测试（用户验收口径）
//
// 目标：验证「各主武器 / 副武器类型都能通过按键正常使用」——不是直接调用 tryFire，
//       而是走真实输入链路：createInputController 登记 keydown/keyup（F=switchWeapon、
//       空格=fire）→ 页面 actions 适配 → 按激活槽位分发（tryFireWeaponSlot）。
//
// 覆盖：
//   主武器：standard / autocannon / double_barrel / railgun   （F 切到 primary + 空格击发）
//   副武器：mortar / missile / rocket / mine_layer / missile_wire / turret
//           （F 切到 secondary + 空格击发；turret 为设计例外——自主运作、点击不分发）
//   F 键语义：primary ⇄ secondary 往返切换；切到空副武器槽回退主炮；turret 不响应点击。
//
// 做法：用一个与 tank_mvp.html 同形的 actions 适配器（mvp 中 switchWeapon→toggleWeaponSlot、
//       fire→tryFireWeaponSlot），把 tank_bindings.createInputController 与 tank_fire /
//       tank_weapons 串起来，然后模拟真实键盘事件序列。
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
  p.activeWeaponSlot = 'primary';
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

// tank_mvp.html 的 F 语义（toggleWeaponSlot 同形：primary ⇄ secondary）
function toggleWeaponSlot(player){
  player.activeWeaponSlot = (player.activeWeaponSlot === 'secondary') ? 'primary' : 'secondary';
}

const ENEMY = M.makeTank({ id: 'kp_enemy', team: 'enemy', x: 500, y: 0, hp: 5000 });

// ---- 输入控制器 + 页面 actions（与 mvp 一致：fire→tryFireWeaponSlot，switchWeapon→toggle） ----
let PLAYER = makePlayer('none', 'standard');
global.player = PLAYER;
const win = makeFakeWindow();
global.window = /** @type {any} */ (win);
const fireCtx = { current: makeFireCtx(PLAYER) };

const input = B.createInputController({
  actions: {
    switchWeapon(){ toggleWeaponSlot(PLAYER); },
    fire(){ return F.tryFireWeaponSlot(fireCtx.current); }
  },
  gate: () => true,
  preventKeys: [' '],
  settings: () => ({ invertReverseTurn: false })
});

// 真实按键助手：keydown(+keyup) 触发边沿动作；空格登记为持续键
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

ok(input && typeof input.isDown === 'function', '按键控制器已建立（isDown 可读）');
ok(B.KEY_BINDINGS.switchWeapon === 'f' && B.KEY_BINDINGS.fire === ' ', 'F=switchWeapon / 空格=fire 键位契约');

// ============================================================================
// 主武器：F 切到 primary，空格击发（4 型）
// ============================================================================
console.log('\n—— 主武器（F 切 primary + 空格击发） ——');
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
  // 按 F 一次：primary → secondary；再按 F：secondary → primary（回到主武器）
  pressKey('f'); pressKey('f');
  ok(PLAYER.activeWeaponSlot === 'primary', `${c.label}: F 往返后回到 primary 激活槽`);
  const fired = pressFire();
  ok(fired >= c.expectShells && global.shells.length >= c.expectShells, `${c.label}: 空格击发产生 ${global.shells.length} 发（按键链路）`);
}

// ============================================================================
// 副武器：F 切到 secondary，空格击发（各型）
// ============================================================================
console.log('\n—— 副武器（F 切 secondary + 空格击发） ——');
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
  pressKey('f');   // primary → secondary
  ok(PLAYER.activeWeaponSlot === 'secondary', `${c.label}: F 切换到 secondary 激活槽`);
  const fired = pressFire();
  if (c.type === 'mine_layer'){
    ok(fired >= 1 && (global.deployables || []).length === 1, `${c.label}: 空格布雷成功（deployable 入注册表）`);
  } else {
    ok(global.shells.length >= c.expectShells, `${c.label}: 空格击发产生 ${global.shells.length} 发（按键链路）`);
  }
}

// ============================================================================
// 边界语义：空副武器槽回退主炮 / turret 设计例外 / F 只切槽不改击发对象
// ============================================================================
console.log('\n—— 边界语义 ——');
{
  // (a) F 切到 secondary 但副武器 none → 空格仍应走主炮（1 发 ap）
  PLAYER = makePlayer('none', 'standard');
  global.player = PLAYER;
  global.entities = [PLAYER, ENEMY];
  fireCtx.current = makeFireCtx(PLAYER);
  global.shells.length = 0;
  pressKey('f');
  ok(PLAYER.activeWeaponSlot === 'secondary', '空副武器: F 仍切到 secondary 槽');
  pressFire();
  ok(global.shells.length === 1 && global.shells[0].ammoKey === 'ap', '空副武器: 空格回退主炮路径（1 发 ap）');
}
{
  // (b) turret 型副武器：点击/空格不分发（自主运作，设计例外）
  PLAYER = makePlayer('turret', 'standard');
  global.player = PLAYER;
  global.entities = [PLAYER, ENEMY];
  fireCtx.current = makeFireCtx(PLAYER);
  global.shells.length = 0;
  pressKey('f');
  pressFire();
  ok(global.shells.length === 0, '副炮塔: 空格不响应点击分发（自主运作，不回落主炮）');
}
{
  // (c) F 只切换激活槽，不改变武器数据本身
  PLAYER = makePlayer('mortar', 'double_barrel');
  global.player = PLAYER;
  global.entities = [PLAYER, ENEMY];
  fireCtx.current = makeFireCtx(PLAYER);
  const priBefore = PLAYER.weapons.primary.type, secBefore = PLAYER.weapons.secondary.type;
  pressKey('f'); pressKey('f'); pressKey('f');
  ok(PLAYER.weapons.primary.type === priBefore && PLAYER.weapons.secondary.type === secBefore,
    'F 只切换 activeWeaponSlot，不修改 weapons 数据');
}

console.log(`\n结果：${fails} 项失败`);
console.log(fails === 0 ? 'test-weapon-keypress: PASS' : 'test-weapon-keypress: FAIL');
process.exit(fails === 0 ? 0 : 1);
