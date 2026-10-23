'use strict';

// tank_deployables.js — 召唤物与战术部署系统（R-2 阶段）
// 实现固定炮塔（Bunkers/Fixed Turrets）、地雷（Mines）与战术护盾/掩体（Deployable Covers）。
// 纯逻辑模块：无 DOM / Canvas 依赖，支持 Node 与浏览器共享。

let _spawnTank = (typeof spawnTank === 'function') ? spawnTank : null;
let _livingEnemiesOf = (typeof livingEnemiesOf === 'function') ? livingEnemiesOf : null;
let _isHostile = (typeof isHostile === 'function') ? isHostile : null;

// 部署物注册表
const deployables = [];
if (typeof window !== 'undefined') window.deployables = deployables;

/**
 * 部署固定炮塔（Fixed Turret / Bunker）
 * 特征：maxSpeed = 0（零移速），拥有独立炮塔旋转与攻击逻辑。
 */
function spawnFixedTurret(opts) {
  const o = opts || {};
  const t = {
    id: o.id || ('turret:' + Math.random().toString(36).substr(2, 6)),
    isFixedTurret: true,
    team: o.team || 'player',
    x: o.x || 0,
    y: o.y || 0,
    hp: o.hp || 150,
    maxHp: o.maxHp || 150,
    maxSpeed: 0,
    turnRate: 0,
    turretTurnRate: 3.5,
    turretAngle: o.turretAngle || 0,
    hullAngle: o.hullAngle || 0,
    damage: o.damage || 30,
    penetration: o.penetration || 100,
    reload: o.reload || 1.0,
    reloadT: 0,
    range: o.range || 500,
    hullLen: 30,
    hullWid: 30,
    stats: { damage: o.damage || 30, penetration: o.penetration || 100, reload: o.reload || 1.0 },
    _dead: false
  };
  deployables.push(t);
  if (o.registry) o.registry.push(t);
  return t;
}

/**
 * 部署地雷 (Mine)
 * 特征：静止放置，当敌方实体进入爆炸半径（blastRadius）时触发 AOE 伤害。
 */
function spawnMine(opts) {
  const o = opts || {};
  const m = {
    id: o.id || ('mine:' + Math.random().toString(36).substr(2, 6)),
    isMine: true,
    team: o.team || 'player',
    x: o.x || 0,
    y: o.y || 0,
    hp: o.hp || 1,
    damage: o.damage || 100,
    blastRadius: o.blastRadius || 70,
    triggerRadius: o.triggerRadius || 40,
    armed: false,
    armDelay: o.armDelay || 1.0,
    // #B9（2026-09-16）：布雷器卡面承诺的「地雷存续时间」（mine_layer duration 30/升级 45s）
    // 在此落地为倒计时；未传 duration（bench 调试布雷等）→ undefined = 永久存续，行为不变。
    lifeT: (typeof o.duration === 'number' && o.duration > 0) ? o.duration : undefined,
    // 2026-10-22（第五批 B2-1）：
    //   · fieldId —— 雷场分组键（同一条雷带的所有雷共享），供 tank_battle 的
    //     activeMineFieldSlots()（槽位回收）与 buildMineHazards()（AI 避雷）反查；
    //   · owner / pen —— 爆炸结算用：最薄装甲判定的穿透值取布雷者当前 HE 弹穿深
    //     （tank_battle 的 mineExplode 分支读这两个字段，缺省回退 player）。
    fieldId: (o.fieldId !== undefined) ? o.fieldId : null,
    owner: o.owner || null,
    pen: (typeof o.pen === 'number') ? o.pen : undefined,
    _dead: false
  };
  deployables.push(m);
  if (o.registry) o.registry.push(m);
  return m;
}

/**
 * 部署战术掩体/护盾实体 (Deployable Shield Cover)
 * 特征：静态障碍物，具备生命值、护盾吸收池及物理阻挡。
 */
function spawnDeployableCover(opts) {
  const o = opts || {};
  const c = {
    id: o.id || ('cover:' + Math.random().toString(36).substr(2, 6)),
    isDeployableCover: true,
    team: o.team || 'player',
    x: o.x || 0,
    y: o.y || 0,
    hp: o.hp || 300,
    maxHp: o.maxHp || 300,
    shield: {
      hp: o.shieldHp || 200,
      maxHp: o.shieldHp || 200,
      t: o.duration || 45
    },
    // #B11：本体存续倒计时（duration 到期整体撤收，非仅护盾池）；缺省 = 永久
    lifeT: (typeof o.duration === 'number' && o.duration > 0) ? o.duration : undefined,
    hullLen: o.hullLen || 50,
    hullWid: o.hullWid || 20,
    hullAngle: o.hullAngle || 0,
    _dead: false
  };
  deployables.push(c);
  if (o.registry) o.registry.push(c);
  return c;
}

/**
 * 更新所有部署物状态（固定炮塔索敌/开火、地雷触发、护盾掩体计时）
 * @param {number} dt 帧步长（秒）
 * @param {any} ctx 战斗上下文 { entities: [...] }
 * @returns {Array} 产生的事件意图（如炮塔开火、地雷爆炸）
 */
function updateDeployables(dt, ctx) {
  if (dt <= 0) return [];
  const events = [];
  const entities = (ctx && ctx.entities) || [];

  for (let i = deployables.length - 1; i >= 0; i--) {
    const d = deployables[i];
    if (d._dead || (d.hp !== undefined && d.hp <= 0)) {
      deployables.splice(i, 1);
      continue;
    }

    // 1. 固定炮塔更新
    if (d.isFixedTurret) {
      d.reloadT = Math.max(0, (d.reloadT || 0) - dt);
      // 寻找射程内最近敌对实体
      let bestTarget = null, bestDist = d.range;
      for (const e of entities) {
        if (!e || e.hp <= 0 || e === d || e.isDrone || e.isMine) continue;
        const hostile = _isHostile ? _isHostile(e.team, d.team) : (e.team !== d.team);
        if (!hostile) continue;
        const dist = Math.hypot(e.x - d.x, e.y - d.y);
        if (dist <= bestDist) {
          bestDist = dist;
          bestTarget = e;
        }
      }

      if (bestTarget) {
        const targetAngle = Math.atan2(bestTarget.y - d.y, bestTarget.x - d.x);
        // 简易炮塔旋转插值
        let diff = targetAngle - d.turretAngle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const step = (d.turretTurnRate || 2.0) * dt;
        if (Math.abs(diff) < step) d.turretAngle = targetAngle;
        else d.turretAngle += Math.sign(diff) * step;

        // 若对准目标且装填完毕，触发开火
        if (Math.abs(diff) < 0.3 && d.reloadT <= 0) {
          d.reloadT = d.reload || 1.0;
          events.push({
            type: 'fixedTurretFire',
            turret: d,
            target: bestTarget,
            damage: d.damage,
            penetration: d.penetration
          });
        }
      }
    }

    // 2. 地雷更新
    if (d.isMine) {
      // 存续倒计时（#B9）：到期自毁（静默失效——布雷器语义「地雷存续时间」）
      if (d.lifeT !== undefined) {
        d.lifeT -= dt;
        if (d.lifeT <= 0) { d._dead = true; continue; }
      }
      if (d.armDelay > 0) {
        d.armDelay -= dt;
        if (d.armDelay <= 0) d.armed = true;
      } else if (d.armed) {
        // 检查是否有敌方坦克踩中
        for (const e of entities) {
          if (!e || e.hp <= 0 || e.isDrone || e.isMine) continue;
          const hostile = _isHostile ? _isHostile(e.team, d.team) : (e.team !== d.team);
          if (!hostile) continue;
          const dist = Math.hypot(e.x - d.x, e.y - d.y);
          if (dist <= d.triggerRadius) {
            // 触发地雷爆炸
            d._dead = true;
            events.push({
              type: 'mineExplode',
              mine: d,
              triggerEntity: e,
              blastRadius: d.blastRadius,
              damage: d.damage
            });
            break;
          }
        }
      }
    }

    // 3. 战术护盾/掩体更新
    if (d.isDeployableCover) {
      if (d.shield && d.shield.t > 0) {
        d.shield.t -= dt;
        if (d.shield.t <= 0) d.shield = null;
      }
      // #B11：掩体本体存续倒计时（deploy_cover duration 到期撤收；shield.t 只护盾池，本体永久）
      if (d.lifeT !== undefined) {
        d.lifeT -= dt;
        if (d.lifeT <= 0) d._dead = true;
      }
    }
  }

  return events;
}

// ================= #E4（2026-09-20）可部署物数量上限与「最早部署直接消失」 =================
// 用户裁定：便携式掩体、地雷等可部署物提供部署数量升级；超过可部署数量时，最早部署的直接消失。
// 口径（RULES.abilities.deploy_limits，唯一配置源）：按类型独立计数，cap = 基础上限 + 升级加成×步长
// （硬上限封顶）。deployables 数组的 push 顺序即部署先后 → 超限时从数组头部（最早）移除。
function deployableLimits(){
  return (typeof RULES !== 'undefined' && RULES.abilities && RULES.abilities.deploy_limits) || {};
}
function deployableKind(d){
  if(!d) return null;
  if(d.isDeployableCover) return 'cover';
  if(d.isMine) return 'mine';
  if(d.isFixedTurret) return 'turret';
  return null;
}
// owner.deployBonus = { cover:n, mine:n } —— 由接入层按卡牌/升级累计（缺省 0）
// 2026-10-22（第五批 B2-1 用户裁定）：**地雷不设总数上限**（`RULES.abilities.deploy_limits.mineMax*`
//   三键已删除）——雷场/布雷只受「雷场槽位」限制（tank_battle.html 的 activeMineFieldSlots）。
//   因此 `deployableCap('mine')` 恒返回 Infinity ⇒ enforceDeployLimits('mine') 自然成为 no-op
//   （不再「超限时淘汰最早布设的地雷」）。战术掩体（cover）上限语义不变。
function deployableCap(kind, owner){
  const L = deployableLimits();
  const base = kind === 'cover' ? (L.coverMax !== undefined ? L.coverMax : 2)
             : kind === 'mine' ? Infinity
             : Infinity;
  if(!Number.isFinite(base)) return Infinity;
  const step = kind === 'cover' ? (L.coverMaxUpgradeStep !== undefined ? L.coverMaxUpgradeStep : 1)
             : (L.mineMaxUpgradeStep !== undefined ? L.mineMaxUpgradeStep : 1);
  const hard = kind === 'cover' ? (L.coverMaxHardCap !== undefined ? L.coverMaxHardCap : 6)
             : (L.mineMaxHardCap !== undefined ? L.mineMaxHardCap : 8);
  const bonus = (owner && owner.deployBonus && owner.deployBonus[kind]) || 0;
  return Math.max(0, Math.min(hard, base + bonus * step));
}
function deployableCount(kind){
  let n = 0;
  for(const d of deployables) if(deployableKind(d) === kind) n++;
  return n;
}
// 超限即移除最早部署的同类部署物；返回被移除的数量。
function enforceDeployLimits(kind, owner){
  const cap = deployableCap(kind, owner);
  if(!Number.isFinite(cap)) return 0;
  let n = deployableCount(kind);
  let removed = 0;
  for(let i = 0; i < deployables.length && n > cap; i++){
    if(deployableKind(deployables[i]) !== kind) continue;
    deployables.splice(i, 1);
    i--;
    n--;
    removed++;
  }
  if(removed > 0 && typeof pushLog === 'function'){
    pushLog(`部署上限 ${cap} — 最早部署的${kind === 'cover' ? '掩体' : '地雷'} ×${removed} 已撤收`, 'COVER');
  }
  return removed;
}

function clearDeployables() {
  deployables.length = 0;
}

// ================= 2026-10-22（第五批）带状雷场的排布唯一口径 =================
// 用户裁定（docs/PLAN.md §4.2 B2-1）：「雷场改带状」——以 `field` 为中心、`angle` 为带长方向，
// 长 `len`、宽 `wid` 的旋转矩形；沿带长等距铺 n = RULES.abilities.deploy_limits.mineFieldCount
// 枚雷，横向在 ±wid×0.25 内按 k%2 交错（确定性正弦抖动）⇒ 整条带都有雷，不只是两端。
//
// ⚠️ 本函数是**预形态绘制、倒计时绘制、实际生成**三处的同一数据源（修 #Z5 的三份重复公式：
//   旧实现三处各写一份圆环分布，导致「看到的位置 ≠ 生成的位置」）。任何调用方都不得再自己
//   算雷点坐标——要改排布只改这里。
//
// 入参 field：{ x, y, angle, len, wid, count? }（count 缺省读 RULES；已确认的 pendingMineFields
//   元素与预览对象同构）。返回 [{x,y}]（世界坐标）。纯函数、无副作用、无 DOM 依赖，可 Node 单测。
function mineFieldLayout(field){
  if(!field) return [];
  const L = deployableLimits();
  const nRaw = (typeof field.count === 'number' && field.count > 0) ? field.count
             : (typeof L.mineFieldCount === 'number' ? L.mineFieldCount : 6);
  const n = Math.max(1, Math.round(nRaw));
  const len = (typeof field.len === 'number' && field.len > 0) ? field.len
            : (typeof L.mineFieldLength === 'number' ? L.mineFieldLength : 220);
  const wid = (typeof field.wid === 'number' && field.wid > 0) ? field.wid
            : (typeof L.mineFieldBandWidth === 'number' ? L.mineFieldBandWidth : 56);
  const ang = (typeof field.angle === 'number') ? field.angle : 0;
  const ux = Math.cos(ang), uy = Math.sin(ang);      // 带长方向（局部 +x）
  const nx = -Math.sin(ang), ny = Math.cos(ang);     // 带法向（局部 +y）
  const out = [];
  for(let k = 0; k < n; k++){
    // 沿带长：n=1 落中心；否则在 [-len/2, +len/2] 等距（含两端）
    const along = (n === 1) ? 0 : ((k / (n - 1)) - 0.5) * len;
    // 横向：k%2 交错，幅度 ≤ wid×0.25（正弦抖动 0.6~1.0 倍，保证确定性且不越界）
    const sgn = (k % 2 === 0) ? 1 : -1;
    const jitter = 0.6 + 0.4 * Math.abs(Math.sin(k * 2.399));
    const lateral = sgn * wid * 0.25 * jitter;
    out.push({ x: field.x + ux * along + nx * lateral,
               y: field.y + uy * along + ny * lateral });
  }
  return out;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    deployables,
    spawnFixedTurret,
    spawnMine,
    spawnDeployableCover,
    updateDeployables,
    clearDeployables,
    deployableLimits,
    deployableKind,
    deployableCap,
    deployableCount,
    enforceDeployLimits,
    mineFieldLayout
  };
}

// 2026-10-22（第五批）：雷带排布纯函数的浏览器全局导出（与 tank_fire 的 fireTank 等
// 「顶层函数 + 显式 globalThis」同款，便于页面层/绘制层直接调用同一实现）。
if (typeof globalThis !== 'undefined') { globalThis.mineFieldLayout = mineFieldLayout; }