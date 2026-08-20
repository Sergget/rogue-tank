'use strict';

// tank_drone.js — 无人机体系（P-17 子目标 4 阶段 2：纯逻辑层）。
// 纯逻辑模块：无 DOM / Canvas 依赖，Node 可测（module.exports 底部导出）。
//
// 定位（§2.2 已定型「伴随机器人/浮游炮」）：卡牌获取的随行单位，不是友军据点概念。
// 两种无人机（kind 与 js/tank_cards.js 的 DRONE_KINDS 白名单保持一致）：
//   scout   侦察：droneIndicators 输出「视口外敌军位置」指示数据（scoutRange 内），不攻击；
//   striker 打击：近身自动索敌（strikeRange 内最近敌方），独立 fireInterval 计时输出
//            {type:'droneFire'} 事件——攻击结算由接入层（阶段 3）执行。无人机开火
//            不消耗玩家炮弹、不受玩家装填影响；伤害 = dmgMult × owner.stats.damage
//            （droneDamage，阶段 3 结算层可自行重新推导）。
//
// 实体生命周期与注册：
//   - 无人机实体字段契约：{ id:'drone:<n>', isDrone:true, kind:'scout'|'striker',
//     team: owner.team, owner, x, y, hp, maxHp, _dead, orbitPhase, fireT }。
//   - 本模块维护 drones 数组（模块级全局唯一实例、单一数据源——镜像
//     tank_dmgtext.js 的 dmgTexts 惯例），不自动写入 tank_entity.js 的 entities
//     注册表。接入层需要渲染/碰撞/击杀统计可见时，在 spawnDrone 的 opts.registry
//     显式传入 entities 数组（阶段 3 接线；届时需给 resolveTankCollisions 与
//     aiDecide 循环补 isDrone 跳过守卫——无人机无 hull 几何字段）。
//   - owner 阵亡 → updateDrones 自动移除该 owner 的无人机（浮游炮随指挥官退场；
//     复活后由接入层按 cardEffects 重新部署）。
//   - countMax（RULES.abilities.drone.countMax=2）超限 → spawnDrone 拒绝并返回 null
//     （不替换最旧：避免玩家已部署的无人机被静默顶掉，超限提示由接入层负责）。
//
// 行为：
//   - 环绕：orbitPhase 以 orbitSpeed 推进，目标点 = owner + (cos,sin)·orbitDist，
//     指数阻尼收敛（k=1−exp(−orbitLerp·dt)，纯弹簧语义，不依赖 mvp driveTank）；
//     owner 位移由「每帧重算目标点」天然跟随。
//   - striker 索敌：ctx.enemies（或 ctx.entities 内按阵营过滤）中 strikeRange 内
//     最近、hp>0 且非无敌（invulnT<=0）的目标；fireT 仅在有效目标存在时累积，
//     到 fireInterval 输出事件并归零；目标丢失（出范围/阵亡/无敌）→ fireT 冻结
//     （不清零），重新锁定后延续剩余计时。
//   - 无人机近身打击不依赖 hasLineOfSight（浮游炮贴脸语义；掩体/视线结算由阶段 3
//     接线层自行决定）。

// 模块级无人机注册表（单一数据源；浏览器端即全局，Node 端经 module.exports 引用）
const drones = [];

// 无人机种类白名单（与 js/tank_cards.js DRONE_KINDS 保持一致）。
// 浏览器端 tank_cards.js 先加载、已 const 声明全局 DRONE_KINDS——此处**不得重复声明**
// （同页加载两模块会抛 "Identifier 'DRONE_KINDS' has already been declared"，Node 测试
// 因 CommonJS 模块作用域隔离而不暴露此冲突）。直接读取全局，Node 端（单独 require、
// 无 tank_cards 全局）兜底字面量；export 键名保持 DRONE_KINDS 不变。
const _DRONE_KINDS = (typeof DRONE_KINDS !== 'undefined') ? DRONE_KINDS : ['scout', 'striker'];

function droneConfig() {
  return (typeof RULES !== 'undefined' && RULES.abilities && RULES.abilities.drone)
    ? RULES.abilities.drone : {};
}

// RULES 缺省兜底（与 RULES.abilities.drone 默认值一致；RULES 缺失时行为不变）
function _d(cfg, key, fallback) {
  return (cfg && cfg[key] !== undefined) ? cfg[key] : fallback;
}

// 阵营判定（与 tank_entity.js isHostile 同构：enemy 阵营 vs 玩家+友军阵营）
function _hostile(teamA, teamB) {
  return (teamA === 'enemy') !== (teamB === 'enemy');
}

let droneSeq = 0;

/**
 * 部署无人机。kind 缺省/非法 → 'striker'（兼容旧数据语义，见 tank_cards.js）。
 * opts: { phase?: number 初始环绕相位（默认随机）, registry?: any[] 显式镜像注册表 }
 * @returns {any|null} 无人机实体；owner 无效/已阵亡或超 countMax → null
 */
function spawnDrone(owner, kind, opts) {
  const cfg = droneConfig();
  const k = (kind === 'scout' || kind === 'striker') ? kind : 'striker';
  if (!owner || owner.hp <= 0) return null;
  if (countDrones(owner) >= _d(cfg, 'countMax', 2)) return null;   // 超上限拒绝（不替换最旧）
  const d = {
    id: 'drone:' + (++droneSeq),
    isDrone: true,
    kind: k,
    team: owner.team,
    owner: owner,
    x: owner.x, y: owner.y,
    hp: 1, maxHp: 1,
    _dead: false,
    orbitPhase: (opts && opts.phase !== undefined) ? opts.phase : Math.random() * Math.PI * 2,
    fireT: 0
  };
  drones.push(d);
  const reg = opts && opts.registry;
  if (reg) { d.registry = reg; reg.push(d); }   // 显式镜像进 entities 注册表（阶段 3 接线）
  return d;
}

/**
 * 计数。owner 缺省 → 全量。
 */
function countDrones(owner) {
  if (owner === undefined || owner === null) return drones.length;
  return drones.filter(d => d.owner === owner).length;
}

// 从 drones 数组移除（联动 registry 镜像），返回被移除的无人机
function _removeDrone(i) {
  const d = drones[i];
  if (d.registry) {
    const idx = d.registry.indexOf(d);
    if (idx >= 0) d.registry.splice(idx, 1);
  }
  drones.splice(i, 1);
}

/**
 * 清场（enterBattle/reset 用）。owner 缺省/null → 清空全部。
 * @returns {number} 移除数量
 */
function clearDrones(owner) {
  let removed = 0;
  for (let i = drones.length - 1; i >= 0; i--) {
    const d = drones[i];
    if (owner === undefined || owner === null || d.owner === owner) {
      _removeDrone(i);
      removed++;
    }
  }
  return removed;
}

// strikeRange 内最近的有效目标（hp>0、非无敌、敌对阵营、非无人机）；无 → null
function nearestTarget(d, enemies, range) {
  const list = enemies || [];
  let best = null, bestD = Infinity;
  for (const e of list) {
    if (!e || e.hp <= 0) continue;
    if (e.invulnT > 0) continue;                 // 复活无敌期不索敌
    if (e === d || e.isDrone) continue;          // 无人机不互打
    if (!_hostile(e.team, d.team)) continue;
    const dist = Math.hypot(e.x - d.x, e.y - d.y);
    if (dist <= range && dist < bestD) { bestD = dist; best = e; }
  }
  return best;
}

/**
 * 打击伤害估算 = dmgMult × owner.stats.damage（阶段 3 结算层可直接采用或重推导）。
 */
function droneDamage(d) {
  const cfg = droneConfig();
  const owner = d && d.owner;
  const base = (owner && owner.stats && owner.stats.damage > 0) ? owner.stats.damage : 100;
  return Math.round(_d(cfg, 'dmgMult', 0.4) * base);
}

// 候选目标列表：ctx.enemies 优先；ctx.entities 按「与首位存活无人机敌对」过滤（注意：
// 混阵营无人机场景请用 ctx.enemies 预过滤，见模块头注释）
function _targetList(ctx) {
  if (!ctx) return [];
  if (ctx.enemies) return ctx.enemies;
  if (ctx.entities) {
    const refTeam = drones.length ? drones[0].team : 'player';
    return ctx.entities.filter(e => e && e.hp > 0 && !e.isDrone && _hostile(e.team, refTeam));
  }
  return [];
}

/**
 * 逐帧行为：环绕跟随 + striker 索敌/开火计时。
 * @param {number} dt 帧步长（秒）
 * @param {any} [ctx] { enemies?: [...], entities?: [...] }
 * @returns {Array<{type:'droneFire', drone, target, damage}>} 攻击意图事件列表（结算由阶段 3 执行）
 */
function updateDrones(dt, ctx) {
  if (dt <= 0) return [];
  const cfg = droneConfig();
  const events = [];
  const enemies = _targetList(ctx);
  const orbit = _d(cfg, 'orbitDist', 90);
  const speed = _d(cfg, 'orbitSpeed', 1.2);
  const k = 1 - Math.exp(-_d(cfg, 'orbitLerp', 6) * dt);
  const interval = _d(cfg, 'fireInterval', 2.0);
  const range = _d(cfg, 'strikeRange', 260);
  for (let i = drones.length - 1; i >= 0; i--) {
    const d = drones[i];
    if (d._dead || !d.owner || d.owner.hp <= 0) { _removeDrone(i); continue; }   // owner 阵亡 → 退场
    d.orbitPhase = (d.orbitPhase || 0) + speed * dt;
    const tx = d.owner.x + Math.cos(d.orbitPhase) * orbit;
    const ty = d.owner.y + Math.sin(d.orbitPhase) * orbit;
    d.x += (tx - d.x) * k;
    d.y += (ty - d.y) * k;
    if (d.kind === 'striker') {
      const t = nearestTarget(d, enemies, range);
      if (t) {
        d.fireT = (d.fireT || 0) + dt;
        if (d.fireT >= interval) {
          d.fireT = 0;                                   // 开火归零（下个周期重新累积）
          events.push({ type: 'droneFire', drone: d, target: t, damage: droneDamage(d) });
        }
      }
      // 目标丢失：fireT 冻结（不累积、不清零），重新锁定后延续剩余计时
    }
  }
  return events;
}

// 摄像机函数惰性解析：浏览器取全局（tank_camera.js 先于本模块加载），Node 走 require
function _cameraFns() {
  if (typeof viewBounds === 'function' && typeof aabbInView === 'function') {
    return { viewBounds, aabbInView };
  }
  if (typeof require === 'function') {
    try { return require('./tank_camera.js'); } catch (e) { /* 加载失败则无指示 */ }
  }
  return null;
}

/**
 * 视口外敌军指示（纯计算，mvp 绘制层消费；小地图标记接线在阶段 3）。
 * 契约：仅当存在存活 scout 无人机时输出；对每个「视口外（aabbInView 语义，含 64px
 * 外扩余量）+ 敌对 + hp>0」的敌军，若距任一 scout ≤ scoutRange 则产出一条记录：
 *   { x, y         敌军世界坐标（绘制层经 worldToScreen 换算屏幕边缘箭头）
 *     angle, dist  相对视口中心的方向角（atan2）与距离
 *     team         敌军阵营
 *     kind         敌军实体 kind（无则 'enemy'）}
 * striker 不提供指示（侦察能力专属 scout，与卡牌语义一致）。
 * @param {any} cam 摄像机状态（读 x/y/vw/vh/zoom；可传纯对象 fake cam）
 * @param {any[]} entities 实体列表（须含 scout 无人机自身；通常为 entities 注册表全量）
 * @returns {Array<{x:number, y:number, angle:number, dist:number, team:string, kind:string}>}
 */
function droneIndicators(cam, entities) {
  const cfg = droneConfig();
  const fns = _cameraFns();
  if (!cam || !fns || !entities || !entities.length) return [];
  const scouts = entities.filter(e => e && e.isDrone && e.kind === 'scout' && e.hp > 0
    && e.owner && e.owner.hp > 0);
  if (!scouts.length) return [];
  const out = [];
  const range = _d(cfg, 'scoutRange', 700);
  for (const e of entities) {
    if (!e || e.hp <= 0 || e.isDrone) continue;
    if (!_hostile(e.team, scouts[0].team)) continue;
    if (fns.aabbInView(cam, e.x, e.y, 0, 0)) continue;   // 视口内（含 64px 外扩余量）不指示
    let inRange = false;
    for (const s of scouts) {
      if (Math.hypot(e.x - s.x, e.y - s.y) <= range) { inRange = true; break; }
    }
    if (!inRange) continue;
    const dx = e.x - cam.x, dy = e.y - cam.y;
    out.push({
      x: e.x, y: e.y,
      angle: Math.atan2(dy, dx),
      dist: Math.hypot(dx, dy),
      team: e.team,
      kind: e.kind || 'enemy'
    });
  }
  return out;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DRONE_KINDS: _DRONE_KINDS,
    drones,
    droneConfig,
    spawnDrone,
    countDrones,
    clearDrones,
    updateDrones,
    droneIndicators,
    droneDamage
  };
}