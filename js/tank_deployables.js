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
    triggerRadius: o.triggerRadius || 25,
    armed: false,
    armDelay: o.armDelay || 1.0,
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
    }
  }

  return events;
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
    clearDeployables
  };
}