'use strict';

// tank_map.js — 线性节点链生成 + 通关奖励评分 + 节点实体化（P-08 / DEVELOPMENT.md §6 条目 6）。
// 纯逻辑模块：无 DOM / Canvas 依赖，Node 可测（module.exports 底部导出）。
// 依赖：js/tank_nodegen.js（P-05 地图元素生成器，此处只消费其 generateNode/createRNG）与
//       js/tank_rules.js 的 RULES.nodeMap 配置。
// 职责：
//   1. 一局 = 一条线性节点链（纯线性、无分支，§2.1）：generateRun 生成 count 个节点，
//      每节点难度按推进索引单调上升（难度曲线初版，§6 条目 12 的细化见该条目）；
//   2. 每节点：掩体布局（复用 generateNode，含 scale 放大到约 1:9 大世界）、敌军构成
//      （数量/重坦占比随难度）、友军据点（概率出现，远离敌军与玩家出生点）；
//   3. 通关奖励评分（§4.5 方案）：基础分 + 无伤/速通/据点存活加成；
//   4. materializeNode：把节点数据实体化进浏览器全局（covers/entities）——
//      通过显式 env 注入，Node 测试无需浏览器全局。

// ---------- 难度曲线与构成 ----------

/**
 * 节点难度曲线（初版，§4 开放问题 6 / §6 条目 12 的细化另行定表）：
 * 索引 i∈[0,count-1]，t=i/(count-1)；diff = 0.15 + 0.8·t^1.25 —— 单调上升，0.15 → 0.95。
 * 后段（t>0.6）增速快于前段，模拟"层层推进越打越难"。
 */
function difficultyForIndex(index, count) {
  if (count <= 1) return 0.5;
  const t = Math.max(0, Math.min(1, index / (count - 1)));
  return Math.round((0.15 + 0.8 * Math.pow(t, 1.25)) * 100) / 100;
}

/**
 * 敌军数量：1 + floor(diff·4) ∈ [1, 5]（diff 0.15→1，0.5→3，0.95→4）。
 */
function enemyCountForDifficulty(diff) {
  return Math.max(1, 1 + Math.floor(Math.min(1, Math.max(0, diff)) * 4));
}

// ---------- 节点生成 ----------

function nodeConfig() {
  return (typeof RULES !== 'undefined' && RULES.nodeMap) ? RULES.nodeMap : {};
}

/**
 * 生成单个节点。
 * @param {number} index 节点索引（0 起）
 * @param {number} count 一局总节点数
 * @param {object} rng createRNG 实例（调用方传入，保证整局确定性）
 * @returns {object} node
 */
function makeNode(index, count, rng) {
  const cfg = nodeConfig();
  const scale = cfg.nodeScale || 1;
  const diff = difficultyForIndex(index, count);

  // 掩体布局：模板按 scale 放大，世界坐标 (0,0)~(w,h)，中心 (w/2,h/2)
  const templateResult = generateNode(diff, {
    seed: rng.int(0, 1000000),
    scale: scale,
    centerX: 0,
    centerY: 0
  });
  const w = templateResult.w, h = templateResult.h;
  const centerX = w / 2, centerY = h / 2;
  // generateNode 的元素以 (centerX,centerY) 为基准定位 → 平移到以世界原点为基准
  for (const c of templateResult.covers) {
    c.x += centerX;
    c.y += centerY;
  }

  const playerSpawn = { x: w * 0.10, y: h / 2 };

  // 敌军构成：散布在右 2/3 区域，拒绝采样避开掩体/互相重叠/贴近玩家出生点
  const enemyCount = enemyCountForDifficulty(diff);
  const enemies = [];
  let guard = 0;
  while (enemies.length < enemyCount && guard++ < 400) {
    const ex = rng.range(w * 0.35, w * 0.92);
    const ey = rng.range(h * 0.12, h * 0.88);
    if (Math.hypot(ex - playerSpawn.x, ey - playerSpawn.y) < (cfg.enemyMinPlayerDist || 250)) continue;
    let tooClose = false;
    for (const e of enemies) {
      if (Math.hypot(ex - e.x, ey - e.y) < (cfg.enemyMinDist || 150)) { tooClose = true; break; }
    }
    if (tooClose) continue;
    if (pointInCover(templateResult.covers, ex, ey, 60)) continue;
    enemies.push({
      tankId: rng.choice(cfg.enemyTankPool && cfg.enemyTankPool.length ? cfg.enemyTankPool : ['dummy']),
      x: Math.round(ex), y: Math.round(ey),
      hullAngle: Math.atan2(playerSpawn.y - ey, playerSpawn.x - ex),
      turretAngle: Math.atan2(playerSpawn.y - ey, playerSpawn.x - ex),
      heightClass: (diff > 0.6 || rng() < 0.35) ? 'heavy' : 'medium'
    });
  }

  // 友军据点：左 1/4 区域、概率出现、远离敌军与玩家出生点（§2.2：消极防御、可被摧毁）
  let outpost = null;
  if (rng() < (cfg.outpostChance !== undefined ? cfg.outpostChance : 0.7)) {
    guard = 0;
    while (guard++ < 200) {
      const ox = rng.range(w * 0.12, w * 0.30);
      const oy = rng.range(h * 0.2, h * 0.8);
      if (Math.hypot(ox - playerSpawn.x, oy - playerSpawn.y) < 180) continue;
      let tooClose = false;
      for (const e of enemies) {
        if (Math.hypot(ox - e.x, oy - e.y) < (cfg.enemyMinPlayerDist || 250) * 0.8) { tooClose = true; break; }
      }
      if (tooClose) continue;
      if (pointInCover(templateResult.covers, ox, oy, 48)) continue;
      outpost = { x: Math.round(ox), y: Math.round(oy) };
      break;
    }
  }

  return {
    index: index,
    difficulty: diff,
    seed: templateResult.seed,
    w: w,
    h: h,
    template: { id: templateResult.template.id, name: templateResult.template.name },
    covers: templateResult.covers,
    playerSpawn: playerSpawn,
    enemies: enemies,
    outpost: outpost,
    cleared: false
  };
}

// 点是否落在任一掩体的包围盒内（padding 外扩；solid/graduated 都算阻挡物）
function pointInCover(covers, x, y, padding) {
  for (const c of covers) {
    const halfW = c.w / 2 + padding, halfH = c.h / 2 + padding;
    if (Math.abs(x - c.x) <= halfW && Math.abs(y - c.y) <= halfH) return true;
  }
  return false;
}

/**
 * 生成一局：线性节点链。
 * @param {number|string} [seed] 整局确定性种子；缺省随机
 * @param {number} [count] 节点数（缺省 RULES.nodeMap.runNodeCount 或 5）
 * @returns {{ nodes: object[], seed: number|string }}
 */
function generateRun(seed, count) {
  const cfg = nodeConfig();
  const nodeCount = Math.max(1, Math.min(12, count || cfg.runNodeCount || 5));
  const s = seed !== undefined ? seed : Math.floor(Math.random() * 1000000);
  const rng = createRNG(s);
  const nodes = [];
  for (let i = 0; i < nodeCount; i++) {
    nodes.push(makeNode(i, nodeCount, rng));
  }
  return { nodes: nodes, seed: s };
}

// ---------- 通关奖励评分（§4.5 方案） ----------

/**
 * 节点通关得分。
 * @param {object} node 节点数据
 * @param {object} result 战斗结果
 * @param {number} result.damageTaken 本节点玩家承受伤害（0 = 无伤）
 * @param {number} [result.clearMs] 通关耗时（ms）；undefined = 不判速通
 * @param {boolean} [result.outpostAlive] 本节点据点是否存活（无据点节点忽略）
 * @returns {{ base:number, bonuses:Array<{label:string, amount:number}>, total:number }}
 */
function scoreNode(node, result) {
  result = result || {};
  const base = Math.round(100 * (1 + node.index * 0.2));
  const bonuses = [];
  let total = base;

  if (result.damageTaken !== undefined && result.damageTaken <= 0) {
    const amt = Math.round(base * 0.5);
    bonuses.push({ label: '无伤通关 +50%', amount: amt });
    total += amt;
  }
  const cfg = nodeConfig();
  if (result.clearMs !== undefined && result.clearMs <= (cfg.speedClearMs || 120000)) {
    const amt = Math.round(base * 0.2);
    bonuses.push({ label: '速通 +20%', amount: amt });
    total += amt;
  }
  if (node.outpost && result.outpostAlive) {
    const amt = Math.round(base * 0.2);
    bonuses.push({ label: '据点存活 +20%', amount: amt });
    total += amt;
  }
  return { base: base, bonuses: bonuses, total: total };
}

// ---------- 节点实体化（注入浏览器全局） ----------

/**
 * 把节点数据实体化进运行环境。env 显式注入，浏览器侧传全局引用：
 *   env.setCovers(coversList)        —— 替换全局 covers 并快照（浏览器：清空+push+snapshotCovers）
 *   env.clearEntities(keepIds)       —— 移除保留 id 之外的实体（浏览器：entities filter）
 *   env.spawnTank(spec)              —— 生成实体（浏览器：spawnTank 全局；spec 含 id/team/x/y/hullAngle/turretAngle/heightClass）
 *   env.configureTank(tank, tankId)  —— 应用坦克配置（浏览器：applyTankConfig+resetEntity；测试可 no-op）
 * @param {object} node makeNode/generateRun 产出的节点
 * @param {object} env 运行环境注入
 * @returns {{ spawned: object[], outpost: object|null }}
 */
function materializeNode(node, env) {
  if (typeof env.setCovers === 'function') env.setCovers(node.covers);

  const keepIds = (env.keepIds && env.keepIds.length) ? env.keepIds : ['player'];
  if (typeof env.clearEntities === 'function') env.clearEntities(keepIds);

  const spawned = [];
  for (const e of node.enemies) {
    const t = env.spawnTank({
      id: `enemy_${node.index}_${spawned.length}`,
      team: 'enemy',
      x: e.x, y: e.y,
      hullAngle: e.hullAngle, turretAngle: e.turretAngle,
      heightClass: e.heightClass
    });
    t.nodeSpawn = true;
    if (typeof env.configureTank === 'function') env.configureTank(t, e.tankId);
    spawned.push(t);
  }

  let outpost = null;
  if (node.outpost) {
    outpost = env.spawnTank({
      id: `outpost_${node.index}`,
      team: 'ally',
      x: node.outpost.x, y: node.outpost.y,
      hullAngle: 0, turretAngle: 0,
      heightClass: 'heavy'
    });
    outpost.nodeSpawn = true;
    if (typeof env.configureTank === 'function') env.configureTank(outpost, 'allyOutpost');
    spawned.push(outpost);
  }

  return { spawned: spawned, outpost: outpost };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    difficultyForIndex,
    enemyCountForDifficulty,
    makeNode,
    generateRun,
    scoreNode,
    materializeNode
  };
}
