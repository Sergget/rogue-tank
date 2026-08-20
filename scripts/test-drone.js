// test-drone.js — 无人机体系（P-17 子目标 4 阶段 2）Node 行为测试。
// 运行：node scripts/test-drone.js
// 覆盖：spawnDrone 创建/kind 缺省/countMax 上限/registry 镜像；环绕跟随收敛（owner 位移后
// 距离收敛到 orbitDist 附近）；striker 索敌开火计时（范围内累积、到点输出事件、出范围冻结、
// 开火归零）；scout 不攻击；droneIndicators（视口内不指示 / 视口外按角度距离 / scoutRange
// 过滤 / 无敌军与无侦察机空数组 / fake cam / 非敌对不指示）；clearDrones（按 owner / 全清 /
// registry 联动移除）；owner 阵亡自动移除；已毁/无敌目标不索敌。
// 边界模式：视口 AABB 剔除（aabbInView 语义 + 64px 外扩余量）；无人机近身打击不依赖
// hasLineOfSight（无掩体判定，阶段 3 结算层自行决策）；clearDrones 承担 resetEntity
// 等价清场职责。
'use strict';

const RULES_MOD = require('../js/tank_rules.js');
global.RULES = RULES_MOD.RULES;
const U = require('../js/tank_utils.js');
global.TAU = U.TAU;
const {
  DRONE_KINDS, drones, droneConfig,
  spawnDrone, countDrones, clearDrones,
  updateDrones, droneIndicators, droneDamage
} = require('../js/tank_drone.js');

let fails = 0;
function ok(cond, label) {
  if (cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}`); fails++; }
}
function close(a, b, eps) { return Math.abs(a - b) <= (eps || 1e-9); }
// 模块级 drones 数组为全局单例：计数/位置敏感断言前先清空，避免跨块串扰
function resetAll() { while (drones.length) clearDrones(); }

function player(x, y, dmg) {
  return { id: 'player', team: 'player', x: x || 0, y: y || 0, hp: 100, stats: { damage: dmg || 100 } };
}
function enemy(x, y, kind) {
  return { id: 'enemy:' + x + ':' + y, team: 'enemy', x, y, hp: 100, kind: kind || 'dummy' };
}

// ---- 1) spawnDrone：创建 / kind 缺省 / 非法 kind 回退 / 字段契约 ----
{
  resetAll();
  const p = player(0, 0, 100);
  const d1 = spawnDrone(p);                       // kind 缺省 → striker
  ok(d1 !== null && d1.kind === 'striker', 'kind 缺省 → striker');
  ok(/^drone:\d+$/.test(d1.id) && d1.isDrone === true && d1.team === 'player', 'id/isDrone/team 字段契约');
  ok(d1.owner === p && d1.x === 0 && d1.y === 0 && d1.hp === 1 && d1.maxHp === 1, 'owner/位置/hp 契约');
  const d2 = spawnDrone(p, 'scout', { phase: 1 });
  ok(d2.kind === 'scout' && close(d2.orbitPhase, 1), 'kind=scout + phase 生效');
  const q = player(10, 10);
  const d3 = spawnDrone(q, 'bogus');
  ok(d3 !== null && d3.kind === 'striker', '非法 kind 回退 striker');
  ok(countDrones(p) === 2 && countDrones(q) === 1, 'countDrones 按 owner 计数');
  ok(DRONE_KINDS.join('/') === 'scout/striker', 'DRONE_KINDS 白名单与 tank_cards.js 一致');
}

// ---- 2) countMax 上限：拒绝并返回 null（不替换最旧）；不同 owner 独立；阵亡 owner 拒部署 ----
{
  resetAll();
  const p = player(0, 0);
  const a = spawnDrone(p, 'striker');
  const b = spawnDrone(p, 'striker');
  const c = spawnDrone(p, 'striker');
  ok(a !== null && b !== null && c === null, '第 3 架超 countMax=2 → 拒绝 null');
  ok(countDrones(p) === 2, 'drones 数组保持 2 架');
  const q = player(50, 50);
  const dq = spawnDrone(q, 'striker');
  ok(dq !== null && countDrones(q) === 1 && countDrones(p) === 2, '不同 owner 独立计数');
  const dead = player(10, 10); dead.hp = 0;
  ok(spawnDrone(dead, 'striker') === null, 'owner 阵亡 → 拒绝部署');
}

// ---- 3) registry 镜像：显式传入 entities 数组则同时注册；clearDrones 联动移除 ----
{
  resetAll();
  const reg = [];
  const p = player(0, 0);
  const d = spawnDrone(p, 'striker', { registry: reg });
  ok(reg.length === 1 && reg[0] === d, 'registry 镜像注册');
  const reg2 = [];
  spawnDrone(p, 'scout');
  ok(reg2.length === 0, '不传 registry 不写入外部数组');
  ok(clearDrones(p) === 2 && reg.length === 0 && drones.length === 0, 'clearDrones 同时移除 registry 镜像');
}

// ---- 4) 环绕跟随：静止 owner 收敛 orbitDist；owner 位移后重新收敛；相位按 orbitSpeed 推进 ----
{
  resetAll();
  const cfg = droneConfig();
  const p = player(0, 0);
  const d = spawnDrone(p, 'striker', { phase: 0 });
  for (let i = 0; i < 60; i++) updateDrones(0.1, { enemies: [] });   // 长跑稳定
  let dist = Math.hypot(d.x - p.x, d.y - p.y);
  ok(close(dist, cfg.orbitDist, 3), `静止 owner 环绕距离 ≈ orbitDist（dist=${dist.toFixed(1)}）`);
  p.x = 500; p.y = 300;                                              // owner 瞬移
  for (let i = 0; i < 80; i++) updateDrones(0.1, { enemies: [] });
  dist = Math.hypot(d.x - p.x, d.y - p.y);
  ok(close(dist, cfg.orbitDist, 3), `owner 位移后收敛 orbitDist（dist=${dist.toFixed(1)}）`);
  const phase0 = d.orbitPhase;
  updateDrones(0.5, { enemies: [] });
  ok(close(d.orbitPhase - phase0, 0.5 * cfg.orbitSpeed, 1e-9), 'orbitPhase 按 orbitSpeed 推进');
}

// ---- 5) striker 索敌开火计时：累积 → 到点事件 → 归零；事件携带 damage ----
{
  resetAll();
  const p = player(0, 0, 100);
  const d = spawnDrone(p, 'striker', { phase: 0 });
  const e = enemy(100, 0);                        // strikeRange 260 内
  ok(updateDrones(0.5, { enemies: [e] }).length === 0, '0.5s 未到 fireInterval → 无事件');
  ok(close(d.fireT, 0.5, 1e-9), 'fireT 累积 0.5');
  ok(updateDrones(1.0, { enemies: [e] }).length === 0, '1.5s 仍未到 2.0s → 无事件');
  const ev = updateDrones(0.5, { enemies: [e] });
  ok(ev.length === 1 && ev[0].type === 'droneFire' && ev[0].drone === d && ev[0].target === e, '2.0s 到点 → droneFire 事件');
  ok(close(d.fireT, 0), '开火后 fireT 归零');
  ok(ev[0].damage === Math.round(0.4 * 100), '事件携带 damage = dmgMult × owner.stats.damage');
}

// ---- 6) 目标出范围：不累积不输出；回范围延续冻结计时 ----
{
  resetAll();
  const p = player(0, 0);
  const d = spawnDrone(p, 'striker', { phase: 0 });
  const e = enemy(100, 0);
  updateDrones(1.0, { enemies: [e] });
  const frozen = d.fireT;
  ok(close(frozen, 1.0, 1e-9), '范围内累积 1.0s');
  e.x = 2000;                                     // 移出 strikeRange
  ok(updateDrones(1.0, { enemies: [e] }).length === 0, '出范围 → 无事件');
  ok(close(d.fireT, frozen, 1e-9), '出范围 → fireT 冻结不清零');
  e.x = 100;                                      // 回范围
  const ev = updateDrones(1.0, { enemies: [e] });
  ok(ev.length === 1, '回范围 → 延续冻结计时到点开火');
  ok(close(d.fireT, 0), '开火后归零');
}

// ---- 7) 已毁/无敌目标不索敌；无敌结束恢复索敌 ----
{
  resetAll();
  const p = player(0, 0);
  const d = spawnDrone(p, 'striker', { phase: 0 });
  const dead = enemy(100, 0); dead.hp = 0;
  const invuln = enemy(100, 50); invuln.invulnT = 99;   // 复活无敌期（invulnT>0）
  ok(updateDrones(3.0, { enemies: [dead, invuln] }).length === 0, '已毁/无敌目标 → 不索敌不开火');
  ok(close(d.fireT, 0), '无可打击目标 → fireT 不累积');
  invuln.invulnT = 0;
  const ev = updateDrones(2.0, { enemies: [invuln] });
  ok(ev.length === 1 && ev[0].target === invuln, '无敌结束 → 恢复索敌开火');
}

// ---- 8) scout 不攻击（只侦察）----
{
  resetAll();
  const p = player(0, 0);
  const s = spawnDrone(p, 'scout', { phase: 0 });
  const e = enemy(100, 0);
  ok(updateDrones(10, { enemies: [e] }).length === 0, 'scout 10s 不输出任何开火事件');
  ok(s.fireT === 0, 'scout 无 fireT 累积');
  ok(Math.hypot(s.x - p.x, s.y - p.y) > 0, 'scout 正常环绕移动');
}

// ---- 9) droneIndicators：视口剔除 / 角度距离 / scoutRange 过滤 / 空数组 / fake cam ----
{
  resetAll();
  const p = player(0, 0);
  const scout = spawnDrone(p, 'scout', { phase: 0 });
  const cam = { x: 0, y: 0, vw: 960, vh: 600, zoom: 1 };   // fake cam（viewBounds 只读 x/y/vw/vh/zoom）
  const inView = enemy(100, 100);
  const edge = enemy(600, 0);          // 视口外（>544 含 64px 外扩余量）且 scoutRange 700 内
  const farA = enemy(600, 400);        // dist 721 > scoutRange 700
  const farB = enemy(2000, 0);         // 视口外且超范围
  const ally = { id: 'ally', team: 'ally', x: 600, y: 0, hp: 100 };
  const dead = enemy(500, 0); dead.hp = 0;
  const list = [scout, inView, edge, farA, farB, ally, dead];
  const ind = droneIndicators(cam, list);
  ok(Array.isArray(ind) && ind.length === 1, '仅 1 条指示（edge）');
  ok(ind[0].x === 600 && ind[0].y === 0 && ind[0].team === 'enemy', '指示记录世界坐标 + team');
  ok(close(ind[0].angle, 0, 1e-9) && close(ind[0].dist, 600, 1e-9), 'angle/dist 相对视口中心');
  ok(ind[0].kind === 'dummy', 'kind 透传敌军实体 kind');
  const strikerOnly = [spawnDrone(p, 'striker', { phase: 1 }), edge];
  ok(droneIndicators(cam, strikerOnly).length === 0, '无 scout → 空数组（striker 不提供指示）');
  ok(droneIndicators(cam, [scout]).length === 0, '无敌军 → 空数组');
  scout.x = 5000; scout.y = 5000;      // 侦察机远离敌军
  ok(droneIndicators(cam, [scout, edge]).length === 0, 'scout 远离 → scoutRange 过滤');
  scout.x = 0; scout.y = 0;
  ok(droneIndicators(cam, [scout, inView]).length === 0, '视口内敌军不指示');
  ok(droneIndicators(null, list).length === 0, 'null cam → 空数组');
  ok(droneIndicators(cam, []).length === 0, '空 entities → 空数组');
}

// ---- 10) clearDrones：按 owner / 全清 / 返回移除数 ----
{
  resetAll();
  const p = player(0, 0);
  const q = player(500, 500);
  spawnDrone(p, 'striker');
  spawnDrone(p, 'scout');
  spawnDrone(q, 'striker');
  ok(countDrones() === 3, '两 owner 共 3 架');
  ok(clearDrones(p) === 2 && countDrones(p) === 0 && countDrones(q) === 1, 'clearDrones(p) 移除 2 架');
  ok(clearDrones(q) === 1 && drones.length === 0, 'clearDrones(q) 移除 1 架');
  spawnDrone(p, 'scout');
  ok(clearDrones() === 1 && drones.length === 0, 'clearDrones() 无参 → 全清');
}

// ---- 11) owner 阵亡 → updateDrones 自动移除全部无人机 ----
{
  resetAll();
  const p = player(0, 0);
  spawnDrone(p, 'striker');
  spawnDrone(p, 'scout');
  p.hp = 0;
  ok(updateDrones(0.1, { enemies: [] }).length === 0 && drones.length === 0, 'owner 阵亡 → 自动移除');
}

// ---- 12) dt<=0 不推进；无 ctx / 空 ctx 不崩溃 ----
{
  resetAll();
  const p = player(0, 0);
  const d = spawnDrone(p, 'striker', { phase: 0 });
  const e = enemy(100, 0);
  ok(updateDrones(0, { enemies: [e] }).length === 0, 'dt=0 → 无事件');
  ok(updateDrones(-1, { enemies: [e] }).length === 0, 'dt<0 → 无事件');
  ok(updateDrones(0.1, undefined).length === 0, '无 ctx → 不崩溃无事件');
  ok(updateDrones(0.1, {}).length === 0, '空 ctx → 无事件');
  ok(close(d.fireT, 0), '无目标 → fireT 不累积');
}

// ---- 13) droneDamage 语义：dmgMult × owner.stats.damage；无 stats 回退基准 100 ----
{
  resetAll();
  const p = player(0, 0, 250);
  const d = spawnDrone(p, 'striker');
  ok(droneDamage(d) === Math.round(0.4 * 250), 'droneDamage = dmgMult × stats.damage（250 → 100）');
  const p2 = { id: 'p2', team: 'player', x: 0, y: 0, hp: 100 };   // 无 stats 的裸 owner
  const d2 = spawnDrone(p2, 'striker');
  ok(droneDamage(d2) === Math.round(0.4 * 100), '无 stats → 回退基准伤害 100');
}

// ---- 14) droneConfig 读 RULES 参数 ----
{
  const cfg = droneConfig();
  ok(cfg.scoutRange === 700 && cfg.strikeRange === 260 && cfg.fireInterval === 2.0, 'droneConfig 读 RULES（索敌/侦察）');
  ok(cfg.orbitDist === 90 && cfg.orbitSpeed === 1.2 && cfg.countMax === 2, 'droneConfig 读 RULES（环绕/上限）');
}

console.log('test-drone: 完成所有检查');
if (fails === 0) console.log('test-drone: 全部通过');
else console.error(`test-drone: ${fails} 项失败`);
process.exit(fails === 0 ? 0 : 1);