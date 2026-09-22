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
function deployableCap(kind, owner){
  const L = deployableLimits();
  const base = kind === 'cover' ? (L.coverMax !== undefined ? L.coverMax : 2)
             : kind === 'mine' ? (L.mineMax !== undefined ? L.mineMax : 3)
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
    enforceDeployLimits
  };
}