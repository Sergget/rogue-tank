// ============================================================================
// tank_sim.js — 确定性 headless 战斗回放模拟器（P-44 回放冒烟基线）
// ----------------------------------------------------------------------------
// 职责：
//   1. 以 seed 固定的方式把一条节点链（tank_map.generateRun）逐节点实体化；
//   2. 全员 AI 驱动（aiDecide 双态）+ driveTank 运动 + fireTank 开火 +
//      stepShells 弹道积分 + resolveHit 命中结算，复用共享模块、零 DOM；
//   3. 输出逐节点结果（胜负/时长/击杀/剩余 HP）与确定性摘要哈希，
//      作为战斗/AI 修补前的回归判据基线。
// 确定性策略：
//   - 节点生成走 generateRun 内部 createRNG(seed)，天然可复现；
//   - 运行期把 Math.random 整体替换为同一 RNG 流（覆盖 tank_ai 的巡逻/瞄准
//     抖动与 tank_physics 的伤害浮动 [0.85,1.15]），run 结束恢复原实现；
//   - 固定步长积分（默认 dt=1/30），无帧率依赖。
// 已知保真度取舍（基线可接受，修补阶段按需细化）：
//   - Boss 节点以重坦占位实体代替 bosses/<id>.json 多阶段机制；
//   - dot 持续伤害按连续扣血近似（mvp 为离散 tick）；
//   - 不模拟复活/卡牌/Boss 召唤物。
// ============================================================================

function _simGlobal(k, fb){
  if (typeof globalThis !== 'undefined' && globalThis[k] !== undefined) return globalThis[k];
  if (typeof window !== 'undefined' && window[k] !== undefined) return window[k];
  return fb;
}

// ---------- 确定性 RNG（mulberry32，与 tank_nodegen.createRNG 同构，避免加载顺序耦合） ----------
function simCreateRNG(seed){
  let s = seed >>> 0;
  if (s === 0) s = 0x12345678;
  const rng = function(){
    s |= 0; s = s + 0x6D2B79F5 | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
  rng.range = function(min, max){ return min + rng() * (max - min); };
  rng.int = function(min, max){ return Math.floor(min + rng() * (max - min + 1)); };
  return rng;
}

// FNV-1a 文本哈希：用于同 seed 两次回放的摘要一致性断言
function simHash(str){
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++){
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

// ---------- 默认坦克规格加载（Node 下直接读 tanks/ 一型一文件；浏览器由调用方注入） ----------
function _defaultLoadTankSpec(id){
  try {
    if (typeof require === 'function'){
      // eslint-disable-next-line no-undef
      return require('../tanks/' + id + '.json');
    }
  } catch (e) { /* fall through */ }
  return null;
}

// ---------- 回放主入口 ----------
// opts: {
//   seed          随机种子（默认 1）
//   nodeCount     节点数（默认 RULES.nodeMap.runNodeCount || 5）
//   playerTankId  玩家车型 id（默认 'tiger-I'；需能被 loadTankSpec 解析）
//   dt            固定步长（默认 1/30）
//   maxNodeTime   单节点模拟时间上限秒（默认 120，超时记 timeout）
//   loadTankSpec(id) 自定义规格加载器（可选）
//   onNodeEnd(nodeIndex, result) 逐节点回调（可选）
// }
function runReplay(opts){
  const o = opts || {};
  const seed = o.seed !== undefined ? o.seed : 1;
  const dt = o.dt || 1 / 30;
  const maxNodeTime = o.maxNodeTime || 120;
  const loadSpec = o.loadTankSpec || _defaultLoadTankSpec;

  const R = _simGlobal('RULES', {});
  const cfgNM = R.nodeMap || {};
  const nodeCount = o.nodeCount || cfgNM.runNodeCount || 5;

  const ENT = _simGlobal('spawnTank', null) ? {
    spawnTank: _simGlobal('spawnTank'),
    resetEntity: _simGlobal('resetEntity'),
    isHostile: _simGlobal('isHostile'),
    nearestEnemyTo: _simGlobal('nearestEnemyTo'),
    resolveTankCollisions: _simGlobal('resolveTankCollisions')
  } : null;
  if (!ENT) throw new Error('tank_sim: tank_entity globals missing (spawnTank 等)');
  const entitiesArr = _simGlobal('entities', null);
  if (!entitiesArr || !Array.isArray(entitiesArr)) throw new Error('tank_sim: entities registry missing');

  const COVER = {
    covers: _simGlobal('covers', null),
    resetCovers: _simGlobal('resetCovers'),
    findCoversOnPath: _simGlobal('findCoversOnPath'),
    getExposure: _simGlobal('getExposure'),
    coverNormalAt: _simGlobal('coverNormalAt'),
    damageCover: _simGlobal('damageCover'),
    splashCoversAt: _simGlobal('splashCoversAt'),
    hasLineOfSight: _simGlobal('hasLineOfSight'),
    resolveCoverCollisions: _simGlobal('resolveCoverCollisions')
  };
  if (!COVER.covers || !COVER.resetCovers) throw new Error('tank_sim: tank_cover globals missing');

  const GEO = {
    raycastTank: _simGlobal('raycastTank'),
    shellPartHit: _simGlobal('shellPartHit'),
    getPartZRange: _simGlobal('getPartZRange'),
    gunRoot: _simGlobal('gunRoot'),
    gunTip: _simGlobal('gunTip'),
    angDiff: _simGlobal('angDiff')
  };
  const PHYS = {
    resolveHit: _simGlobal('resolveHit')
  };
  const MOVE = {
    driveTank: _simGlobal('driveTank')
  };
  const FIRE = {
    fireTank: _simGlobal('fireTank'),
    stepShells: _simGlobal('stepShells')
  };
  const AI = {
    aiDecide: _simGlobal('aiDecide'),
    aiUpdateStateTimer: _simGlobal('aiUpdateStateTimer')
  };
  const MODEL = {
    makeTank: _simGlobal('makeTank'),
    applyTankConfig: _simGlobal('applyTankConfig')
  };

  const rng = simCreateRNG(seed ^ 0x5f3759df);   // 与节点生成流分离的运行期流

  // ---------- 运行期全局随机替换（覆盖 ai 抖动 / physics 伤害浮动） ----------
  const origRandom = Math.random;
  Math.random = rng;

  const nodes = _simGlobal('generateRun')(seed, nodeCount);
  const results = [];

  try {
    for (const node of nodes.nodes || nodes){
      results.push(_runNode(node));
      if (o.onNodeEnd) o.onNodeEnd(node.index, results[results.length - 1]);
    }
  } finally {
    Math.random = origRandom;
    entitiesArr.length = 0;
    COVER.resetCovers();
  }

  const summary = results.map(r =>
    `${r.index}:${r.outcome[0]}:${r.duration.toFixed(1)}:${r.kills}:${r.aliveAtEnd}`
  ).join('|');
  return {
    seed: seed,
    nodeCount: results.length,
    results: results,
    summary: summary,
    hash: simHash(summary)
  };

  // ================= 单节点战斗 =================
  // spawn 包装：补齐 mvp 内联脚本在 spawn 时初始化的战斗计时字段。
  // 关键点：reloadT 等若保持 undefined，`reloadT <= 0` 门控永远为假（NaN 比较），
  // AI 与开火管线将整体死锁——这是回放基线必须显式补齐的原因。
  function _spawnSimTank(opts){
    const t = ENT.spawnTank(opts);
    if (t.reloadT === undefined) t.reloadT = 0;
    if (t.fireT === undefined) t.fireT = 0;
    if (t.dotT === undefined){ t.dotT = 0; t.dotDps = 0; }
    if (t.immobT === undefined) t.immobT = 0;
    return t;
  }

  function _runNode(node){
    // --- 场景重建：掩体替换 + 实体清空 ---
    COVER.resetCovers();
    COVER.covers.length = 0;
    for (const c of (node.covers || [])) COVER.covers.push(c);
    entitiesArr.length = 0;

    const worldW = node.w, worldH = node.h;
    const spawn = node.playerSpawn || { x: worldW * 0.10, y: worldH / 2 };

    const player = _spawnSimTank({
      id: 'player', team: 'player',
      x: spawn.x, y: spawn.y,
      hullAngle: 0, turretAngle: 0
    });
    const pSpec = loadSpec(o.playerTankId || 'tiger-I');
    if (pSpec && MODEL.applyTankConfig) MODEL.applyTankConfig(player, pSpec);

    // 实体化敌军（难度乘子经 env.applyDifficulty 注入，语义对齐 mvp 接线）
    _simGlobal('materializeNode')(node, {
      setCovers: function(){ /* 掩体已先行替换 */ },
      // keepIds 语义对齐 mvp：仅清除非保留实体（玩家须存活于注册表中，
      // 否则 AI 的 ctx.player 引用脱离注册表，敌军永不接战）
      clearEntities: function(keepIds){
        const keep = new Set(keepIds || []);
        for (let i = entitiesArr.length - 1; i >= 0; i--){
          if (!keep.has(entitiesArr[i].id)) entitiesArr.splice(i, 1);
        }
      },
      spawnTank: function(opts){ return _spawnSimTank(opts); },
      configureTank: function(t, id){
        const spec = loadSpec(id);
        if (spec && MODEL.applyTankConfig) MODEL.applyTankConfig(t, spec);
      },
      applyDifficulty: function(t, mults){
        for (const k in mults){
          if (typeof t.stats[k] === 'number') t.stats[k] *= mults[k];
        }
        if (mults.maxHp) t.hp = t.stats.maxHp;
      }
    });

    // Boss 节点占位（基线取舍：不引入 bosses/<id>.json 多阶段机制）
    if (node.boss){
      const b = _spawnSimTank({
        id: `boss_placeholder_${node.index}`, team: 'enemy',
        x: worldW * 0.82, y: worldH * 0.5,
        hullAngle: Math.PI, turretAngle: Math.PI,
        heightClass: 'heavy'
      });
      const bSpec = loadSpec('tiger-I');
      if (bSpec && MODEL.applyTankConfig) MODEL.applyTankConfig(b, bSpec);
      b.stats.maxHp *= 2.2; b.hp = b.stats.maxHp;
      b.stats.penetration *= 1.25; b.stats.damage *= 1.25;
      b.aiTier = Math.max(1, node.aiTier || 0);
    }

    // --- 共享 ctx（fire/physics/cover 全链显式注入，fx 全部 no-op） ---
    const shells = [];
    const simCtx = {
      shells: shells,
      entities: entitiesArr,
      player: player,
      rules: R,
      coverTiers: _simGlobal('COVER_TIERS', {}),
      random: rng,
      worldW: worldW, worldH: worldH,
      findCoversOnPath: COVER.findCoversOnPath,
      coverNormalAt: COVER.coverNormalAt,
      damageCover: COVER.damageCover,
      splashCoversAt: COVER.splashCoversAt,
      getExposure: COVER.getExposure,
      raycastTank: GEO.raycastTank,
      shellPartHit: GEO.shellPartHit,
      getPartZRange: GEO.getPartZRange,
      gunRoot: GEO.gunRoot,
      gunTip: GEO.gunTip,
      reflectDir: _simGlobal('reflectDir'),
      resolveHit: PHYS.resolveHit,
      gaussian: _simGlobal('gaussian', function(){ return 0; }),
      computeAmmoConfig: _simGlobal('computeAmmoConfig'),
      debuffReloadRate: _simGlobal('debuffReloadRate'),
      burstExplosion: function(){},
      spawnMuzzleFlash: function(){},
      spawnImpactFx: function(){},
      spawnDmgText: function(){},
      playSound: function(){},
      pushLog: function(){},
      spawnSmoke: function(){},
      spawnSmokeCloud: function(){},
      spawnTracer: function(){},
      bounceFx: null, impacts: null
    };
    const aiCtx = {
      player: player,
      covers: COVER.covers,
      hasLoS: function(ox, oy, tx, ty){
        return COVER.hasLineOfSight ? COVER.hasLineOfSight(ox, oy, tx, ty) : true;
      },
      dt: dt
    };

    // --- 主循环 ---
    let time = 0, playerShots = 0, enemyShots = 0;
    let kills = 0, playerHitsTaken = 0;
    const initialEnemies = entitiesArr.filter(e => e.team === 'enemy').length;
    let outcome = null;

    while (true){
      const alive = entitiesArr.filter(e => e.hp > 0);
      const enemiesAlive = alive.filter(e => ENT.isHostile('player', e.team));
      const quota = node.quota;
      if (!enemiesAlive.length || (quota && kills >= quota)){ outcome = 'win'; break; }
      if (player.hp <= 0){ outcome = 'loss'; break; }
      if (time >= maxNodeTime){ outcome = 'timeout'; break; }

      // 诊断钩子（可选）：每 ~1s 回调一次循环快照，供回放调试
      if (o.debugStep && (Math.round(time / dt) % 30 === 0)){
        o.debugStep(node.index, time, entitiesArr.map(e => ({
          id: e.id, x: Math.round(e.x), y: Math.round(e.y), hp: Math.round(e.hp),
          state: e.aiState, engaged: e.aiEngaged, reloadT: e.reloadT,
          turretAngle: +e.turretAngle.toFixed(2)
        })));
      }

      for (const t of alive){
        AI.aiUpdateStateTimer(t, dt);

        // 状态计时：装填 / 起火 debuff / dot 连续近似
        if (t.reloadT > 0) t.reloadT -= dt;
        if (t.fireT > 0) t.fireT -= dt;
        if (t.dotT > 0){
          t.dotT -= dt;
          t.hp -= (t.dotDps || 0) * dt;
          if (t.hp <= 0){ t._dead = true; continue; }
        }

        let out = AI.aiDecide(t, aiCtx);

        // 玩家推进策略：真实对局中由人操推进；回放里无敌人进入触发圈时
        // 向最近敌人机动，否则双方被动对峙必然超时（P-44 基线约定）。
        if (t === player){
          const adv = ENT.nearestEnemyTo(t);
          if (adv){
            const dAdv = Math.hypot(adv.x - t.x, adv.y - t.y);
            const trig = t.aiTriggerDist || 700;
            if (dAdv > trig * 0.75){
              const desH = Math.atan2(adv.y - t.y, adv.x - t.x);
              const hd = GEO.angDiff(desH, t.hullAngle);
              out.turn = Math.abs(hd) < 0.08 ? 0 : (hd > 0 ? 1 : -1);
              out.move = Math.abs(hd) < 0.5 ? 1 : 0;
            }
          }
        }

        // 炮塔旋转（限速追踪 turretDesired）
        const dAng = GEO.angDiff(out.turretDesired, t.turretAngle);
        const maxTurn = (t.stats.turretTurnRate || 2.2) * dt;
        t.turretAngle += dAng > 0 ? Math.min(dAng, maxTurn) : Math.max(dAng, -maxTurn);

        MOVE.driveTank(t, dt, { turn: out.turn, move: out.move });
        if (COVER.resolveCoverCollisions) COVER.resolveCoverCollisions(t);

        // 开火判定：AI 决策 + LoS + 装填就绪
        if (out.fire && t.reloadT <= 0){
          const target = ENT.nearestEnemyTo(t);
          const los = !target || !COVER.hasLineOfSight ||
            COVER.hasLineOfSight(t.x, t.y, target.x, target.y);
          if (target && los){
            const before = shells.length;
            FIRE.fireTank(t, target, 'auto', simCtx);
            if (shells.length > before){
              if (t.team === 'player') playerShots++; else enemyShots++;
            }
          }
        }
      }

      ENT.resolveTankCollisions(2);
      FIRE.stepShells(dt, simCtx);

      // 伤亡记账（含玩家承伤次数粗计）
      for (const e of entitiesArr){
        if (e.hp <= 0 && !e._dead){
          e._dead = true;
          if (ENT.isHostile('player', e.team)) kills++;
          else if (e !== player) playerHitsTaken++;
        }
      }
      time += dt;
    }

    return {
      index: node.index,
      boss: !!node.boss,
      outcome: outcome,
      duration: Number(time.toFixed(2)),
      kills: kills,
      initialEnemies: initialEnemies,
      playerHpPct: Number((Math.max(0, player.hp) / (player.stats.maxHp || 1)).toFixed(4)),
      playerShots: playerShots,
      enemyShots: enemyShots,
      aliveAtEnd: entitiesArr.filter(e => e.hp > 0).length,
      quota: node.quota || null
    };
  }
}

if (typeof module !== 'undefined' && module.exports){
  module.exports = { runReplay: runReplay, simCreateRNG: simCreateRNG, simHash: simHash };
}
