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
//   - Boss 节点用 bosses/<id>.json 真实模板的基础配置（tankId/scale/tuning），
//     不模拟多阶段/stages、召唤物/summons、弱点/weakspots、护盾机制；
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

// 真实 Boss 模板加载（2026-10-06 方案 b）：bosses/<id>.json。
// sim 仅应用基础配置（tankId + scale + tuning 乘子），不模拟多阶段/stages、
// 召唤物/summons、弱点/weakspots、护盾等机制——保真度边界见文件头。
function _defaultLoadBossSpec(id){
  try {
    if (typeof require === 'function'){
      // eslint-disable-next-line no-undef
      return require('../bosses/' + id + '.json');
    }
  } catch (e) { /* fall through */ }
  return null;
}

// ---------- 玩家策略 ----------
// 默认玩家推进策略（#A18 修复）：真实对局中由人操推进 + 瞄准 + 开火。
// 原实现只向最近敌人机动、从不转炮塔（turret 恒 0）也不开火，导致远距离敌人
// 持 patrol/engaged=false 不接战、与玩家两相僵持 → 大量 0 开火假超时（#A18 根因）。
// helpers: { ENT, GEO } 由 runReplay 内部注入（避免顶层耦合加载顺序）。
// 诊断脚本可经 runReplay 的 playerPolicy 选项整体替换本策略（bot 档位）。
function _defaultPlayerPolicy(t, aiCtx, out, helpers){
  const ENT = helpers.ENT, GEO = helpers.GEO;
  const adv = ENT.nearestEnemyTo(t);
  if (adv){
    const dAdv = Math.hypot(adv.x - t.x, adv.y - t.y);
    const desH = Math.atan2(adv.y - t.y, adv.x - t.x);
    // 始终把炮塔指向最近敌人（模拟玩家瞄准）
    out.turretDesired = desH;
    // 炮塔大致对准（≤~7°）时请求开火；范围/LoS/装填由下方统一开火块门控
    out.fire = Math.abs(GEO.angDiff(desH, t.turretAngle)) < 0.12;
    const trig = t.aiTriggerDist || 700;
    // 距离过远时向最近敌人机动（保留原 P-44 基线推进约定）
    if (dAdv > trig * 0.75){
      const hd = GEO.angDiff(desH, t.hullAngle);
      out.turn = Math.abs(hd) < 0.08 ? 0 : (hd > 0 ? 1 : -1);
      out.move = Math.abs(hd) < 0.5 ? 1 : 0;
    }
  }
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
//   env           透传给 generateRun 的环境（可选，如 { difficultyLevel }）
//   playerPolicy(t, aiCtx, out, helpers) 玩家策略钩子（可选；缺省 _defaultPlayerPolicy）
//   playerBuild   玩家构筑（可选）：{ upgradeLevels: {id: lv}, cards: [card, ...] }；
//                 每节点玩家生成并 applyTankConfig 后重新应用（永久升级经 applyUpgrades，
//                 卡牌经 applyCardEffects；两者缺省走同名 global，缺失则跳过）
// }
function runReplay(opts){
  const o = opts || {};
  const seed = o.seed !== undefined ? o.seed : 1;
  const dt = o.dt || 1 / 30;
  const maxNodeTime = o.maxNodeTime || 120;
  const loadSpec = o.loadTankSpec || _defaultLoadTankSpec;
  const playerPolicy = o.playerPolicy || _defaultPlayerPolicy;

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
    stepShells: _simGlobal('stepShells'),
    updatePrimaryHeat: _simGlobal('updatePrimaryHeat')   // 2026-09-15 W6：autocannon 热量冷却
  };
  const AI = {
    aiDecide: _simGlobal('aiDecide'),
    aiUpdateStateTimer: _simGlobal('aiUpdateStateTimer')
  };
  const MODEL = {
    makeTank: _simGlobal('makeTank'),
    applyTankConfig: _simGlobal('applyTankConfig'),
    deriveTankClass: _simGlobal('deriveTankClass')
  };

  const rng = simCreateRNG(seed ^ 0x5f3759df);   // 与节点生成流分离的运行期流

  // ---------- 运行期全局随机替换（覆盖 ai 抖动 / physics 伤害浮动） ----------
  const origRandom = Math.random;
  Math.random = rng;

  const nodes = _simGlobal('generateRun')(seed, nodeCount, o.env);
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

    // 玩家构筑（难度评估用）：永久升级 + 卡牌，每节点重生后重新应用。
    // 与 mvp 同源（applyUpgrades / applyCardEffects），保证数值口径一致。
    const build = o.playerBuild;
    if (build){
      const applyUp = _simGlobal('applyUpgrades', null);
      if (applyUp && build.upgradeLevels) applyUp(player, { points: 1e9, upgrades: build.upgradeLevels });
      const applyCard = _simGlobal('applyCardEffects', null);
      if (applyCard && Array.isArray(build.cards)){
        for (const c of build.cards) applyCard(player, c, {});
      }
    }

    // P-46: 玩家出击基准 stats 快照（敌军数值锚定基准）
    const playerAnchorStats = JSON.parse(JSON.stringify(player.stats));

    // 实体化敌军（P-46：纯外观 + 玩家基准锚定比例，对齐 mvp 接线）
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
        if (MODEL.applyEnemyAppearanceAndStats){
          MODEL.applyEnemyAppearanceAndStats(t, spec, playerAnchorStats);
        } else {
          if (spec && MODEL.applyTankConfig) MODEL.applyTankConfig(t, spec);
          if (spec && MODEL.deriveTankClass) t.tankClass = MODEL.deriveTankClass(spec);
        }
      },
      // #76 A 对齐 mvp applyDifficultyMults（2026-10-05 sim 修补）：
      // 数值乘子走 addModifier（scope 'run'），armorAll 经 armor.hull/armor.turret
      // 组路径叠乘，另做 P-46 难度封顶（difficultyCapMuls 差量注入）。
      // 旧直乘 stats 路径静默丢弃 armorAll 且无封顶，会抹平难度梯度——见诊断记录。
      applyDifficulty: function(t, mults){
        if (!mults) return;
        if (!Array.isArray(t.modifiers)) t.modifiers = [];
        const addMod = _simGlobal('addModifier', null);
        if (!addMod){  // 降级：global 缺 addModifier 时走旧直乘路径
          for (const k in mults){
            if (typeof t.stats[k] === 'number') t.stats[k] *= mults[k];
          }
          if (mults.maxHp) t.hp = t.stats.maxHp;
          return;
        }
        const STAT_KEYS = ['maxHp','penetration','damage','reload','spreadMult','aimSpeed','maxSpeed','turnRate','turretTurnRate'];
        for (const k of STAT_KEYS){
          if (mults[k] !== undefined && mults[k] !== 1){
            addMod(t, { stat: k, mode: 'mult', value: mults[k], source: 'difficulty', scope: 'run' });
          }
        }
        if (mults.armorAll !== undefined && mults.armorAll !== 1){
          addMod(t, { stat: 'armor.hull', mode: 'mult', value: mults.armorAll, source: 'difficulty', scope: 'run' });
          addMod(t, { stat: 'armor.turret', mode: 'mult', value: mults.armorAll, source: 'difficulty', scope: 'run' });
        }
        t.hp = t.stats.maxHp; t.maxHp = t.stats.maxHp;
        // P-46 难度封顶（对齐 mvp）：penCap/dmgFloor/dmgCap/speed 四键差量注入。
        // randFactor 走 Math.random——runReplay 内它已被替换为确定性 rng 流，可复现。
        const capFn = _simGlobal('difficultyCapMuls', null);
        if (capFn){
          const diff = (node && typeof node.difficulty === 'number') ? node.difficulty : 0.15;
          const diffNorm = Math.max(0, Math.min(1, (diff - 0.15) / (0.95 - 0.15)));
          const caps = capFn(t, { diffNorm: diffNorm, randFactor: 0.85 + Math.random() * 0.30 });
          const CAP_STAT = { penMul: 'penetration', dmgFloorMul: 'damage', dmgCapMul: 'damage', speedMul: 'maxSpeed' };
          for (const key in caps){
            addMod(t, { stat: CAP_STAT[key], mode: 'mult', value: caps[key], source: 'difficulty-cap', scope: 'run' });
          }
        }
      }
    });

    // Boss 节点：真实模板基础配置（2026-10-06 方案 b）。
    // 加载 bosses/<bossId>.json，应用 tankId + scale + tuning 乘子；
    // 不模拟 stages/summons/weakspots/护盾（保真度边界见文件头）。
    // bossId 可经 runReplay opts 覆盖，默认 boss_commander。
    if (node.boss){
      const bossId = o.bossId || 'boss_commander';
      const loadBoss = o.loadBossSpec || _defaultLoadBossSpec;
      const bossSpec = loadBoss(bossId);
      const b = _spawnSimTank({
        id: `boss_${bossId}_${node.index}`, team: 'enemy',
        x: worldW * 0.82, y: worldH * 0.5,
        hullAngle: Math.PI, turretAngle: Math.PI,
        heightClass: 'heavy'
      });
      const tankId = (bossSpec && bossSpec.tankId) || 'tiger-I';
      const bSpec = loadSpec(tankId);
      if (bSpec && MODEL.applyTankConfig) MODEL.applyTankConfig(b, bSpec);
      if (bossSpec){
        // 几何缩放（沿用 makeBossEntity 逻辑，不缩放炮管长度）
        const s = bossSpec.scale || 1;
        if (s !== 1){
          b.hullLen *= s; b.hullWid *= s;
          b.turLen *= s;  b.turWid *= s;
          if (b.hullSpec)   b.hullSpec.verts   = b.hullSpec.verts.map(([x,y]) => [x*s, y*s]);
          if (b.turretSpec) b.turretSpec.verts = b.turretSpec.verts.map(([x,y]) => [x*s, y*s]);
          if (b.turretPivotOffset){
            b.turretPivotOffset = {
              dx: (b.turretPivotOffset.dx || 0) * s,
              dy: (b.turretPivotOffset.dy || 0) * s
            };
          }
        }
        // tuning 乘子
        const tuning = bossSpec.tuning || {};
        if (tuning.hpMul)  { b.stats.maxHp *= tuning.hpMul; b.hp = b.stats.maxHp; }
        if (tuning.dmgMul) { b.stats.damage *= tuning.dmgMul; }
        if (tuning.moveMul && b.stats.maxSpeed) { b.stats.maxSpeed *= tuning.moveMul; }
        if (tuning.turnMul && b.stats.turnRate) { b.stats.turnRate *= tuning.turnMul; }
        if (tuning.turretTurnMul && b.stats.turretTurnRate) { b.stats.turretTurnRate *= tuning.turretTurnMul; }
        if (tuning.fireRateMul && b.stats.reload) { b.stats.reload *= tuning.fireRateMul; }
        // shellMul 影响炮弹速度，sim 中炮弹速度由 fire 模块决定，此处记录备用
        b.bossShellMul = tuning.shellMul || 1;
      } else {
        // 模板加载失败时回退到旧占位（保证 sim 不崩）
        b.stats.maxHp *= 2.2; b.hp = b.stats.maxHp;
        b.stats.penetration *= 1.25; b.stats.damage *= 1.25;
      }
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
    let revives = 0, hpConsumed = 0;  // 2026-10-06：无限复活计数与血量消耗
    const initialEnemies = entitiesArr.filter(e => e.team === 'enemy').length;
    let outcome = null;

    while (true){
      const alive = entitiesArr.filter(e => e.hp > 0);
      const enemiesAlive = alive.filter(e => ENT.isHostile('player', e.team));
      const quota = node.quota;
      if (!enemiesAlive.length || (quota && kills >= quota)){ outcome = 'win'; break; }
      // 2026-10-06：无限复活模式——玩家死亡时原地满血复活（计数+1），
      // 战斗仅以 win/timeout 结束；hpConsumed 累计消耗血量作为难度参考。
      if (player.hp <= 0){
        if (o.infiniteRevive){
          revives++;
          hpConsumed += player.stats.maxHp;  // 死亡消耗一整条血
          player.hp = player.stats.maxHp;
          player._dead = false;
          // 清除 debuff，避免复活后立即再死于 dot
          player.dotT = 0; player.dotDps = 0;
        } else {
          outcome = 'loss'; break;
        }
      }
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

        // 玩家策略：缺省为 #A18 推进策略；诊断脚本可经 o.playerPolicy 注入 bot 档位。
        if (t === player){
          playerPolicy(t, aiCtx, out, { ENT: ENT, GEO: GEO });
        }

        // 炮塔旋转（限速追踪 turretDesired）
        const dAng = GEO.angDiff(out.turretDesired, t.turretAngle);
        const maxTurn = (t.stats.turretTurnRate || 2.2) * dt;
        t.turretAngle += dAng > 0 ? Math.min(dAng, maxTurn) : Math.max(dAng, -maxTurn);

        MOVE.driveTank(t, dt, { turn: out.turn, move: out.move });
        if (COVER.resolveCoverCollisions) COVER.resolveCoverCollisions(t);
        // 2026-09-15 W6：autocannon 热量冷却逐帧驱动（sim 与 mvp 主循环同源；非机炮 no-op）
        if (FIRE.updatePrimaryHeat) FIRE.updatePrimaryHeat(t, dt);

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

    // 2026-10-06：补上最后一条命的消耗（未死亡但掉血的部分）
    const finalHpLost = Math.max(0, (player.stats.maxHp || 0) - Math.max(0, player.hp));
    hpConsumed += finalHpLost;
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
      quota: node.quota || null,
      revives: revives,  // 2026-10-06：无限复活次数
      hpConsumed: Math.round(hpConsumed),  // 2026-10-06：累计消耗血量
      hpBarsConsumed: Number((hpConsumed / (player.stats.maxHp || 1)).toFixed(2))  // 消耗的血条数
    };
  }
}

if (typeof module !== 'undefined' && module.exports){
  module.exports = { runReplay: runReplay, simCreateRNG: simCreateRNG, simHash: simHash };
}
