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

function difficultyConfig() {
  return (typeof RULES !== 'undefined' && RULES.difficulty) ? RULES.difficulty : null;
}

/**
 * 节点难度曲线（P-13 / §6 条目 12 / 开放问题 6 定表）：
 * 索引 i∈[0,count-1]，t=i/(count-1)；diff = curveStart + curveSpan·t^curvePow。
 * 参数收口 RULES.difficulty（curveStart 0.15 / curveSpan 0.8 / curvePow 1.25 → 单调 0.15→0.95，后段加速）。
 */
function difficultyForIndex(index, count) {
  if (count <= 1) return 0.5;
  const cfg = difficultyConfig() || { curveStart: 0.15, curveSpan: 0.8, curvePow: 1.25 };
  const t = Math.max(0, Math.min(1, index / (count - 1)));
  return Math.round((cfg.curveStart + cfg.curveSpan * Math.pow(t, cfg.curvePow)) * 100) / 100;
}

/**
 * 敌军数量：1 + floor(diff·enemyCountMax)（RULES.difficulty.enemyCountMax=4）。
 */
function enemyCountForDifficulty(diff) {
  const cfg = difficultyConfig() || {};
  const max = cfg.enemyCountMax !== undefined ? cfg.enemyCountMax : 4;
  return Math.max(1, 1 + Math.floor(Math.min(1, Math.max(0, diff)) * max));
}

// AI 策略复杂度档位：floor(diff·(aiTierMax+1)) 钳到 [0, aiTierMax]
function aiTierForDifficulty(diff) {
  const cfg = difficultyConfig() || {};
  const max = cfg.aiTierMax !== undefined ? cfg.aiTierMax : 2;
  return Math.max(0, Math.min(max, Math.floor(Math.min(1, Math.max(0, diff)) * (max + 1))));
}

// 数值强度乘数：1 + (statMultMax−1)·diff（作用敌军 hp/穿深/伤害）
function statMultForDifficulty(diff) {
  const cfg = difficultyConfig() || {};
  const max = cfg.statMultMax !== undefined ? cfg.statMultMax : 1.5;
  return Math.round((1 + (max - 1) * Math.min(1, Math.max(0, diff))) * 100) / 100;
}

// ---------- 节点生成 ----------

function nodeConfig() {
  return (typeof RULES !== 'undefined' && RULES.nodeMap) ? RULES.nodeMap : {};
}

/**
 * 节点世界缩放倍率（#24）：nodeScale = 目标倍数 × max(vw/模板w, vh/模板h)。
 * 目标倍数 = RULES.nodeMap.nodeScale（旧语义，缺省 3），保证节点世界宽高
 * 各 ≥ 视口 3 倍（面积 ≥ 9 倍）。viewport 由调用方显式注入（mvp 传画布尺寸，
 * Node 测试传假值）；viewport 缺省时回退旧行为（固定 nodeScale 倍率，如 3）。
 * @param {any} [viewport] 视口尺寸 { vw, vh }（屏幕 px）；null/undefined = 旧行为
 * @param {any} [templateDims] 选中模板的原始尺寸 { w, h }
 * @returns {number} nodeScale（>0）
 */
function nodeScaleFor(viewport, templateDims) {
  const cfg = nodeConfig();
  const base = cfg.nodeScale || 1;
  if (!viewport || !(viewport.vw > 0) || !(viewport.vh > 0) || !templateDims || !(templateDims.w > 0) || !(templateDims.h > 0)) {
    return base;
  }
  return base * Math.max(viewport.vw / templateDims.w, viewport.vh / templateDims.h);
}

/**
 * 生成单个节点。
 * @param {number} index 节点索引（0 起）
 * @param {number} count 一局总节点数
 * @param {any} rng createRNG 实例（调用方传入，保证整局确定性）
 * @param {any} [env] 环境注入（#24）：{ viewport: { vw, vh } } —— 视口尺寸决定节点
 *   世界缩放（宽高各 ≥ 视口 3 倍）；env 缺省/无 viewport 时回退 RULES.nodeMap.nodeScale
 *   固定倍率（旧行为）
 * @returns {any} node
 */
function makeNode(index, count, rng, env) {
  const cfg = nodeConfig();
  const diff = difficultyForIndex(index, count);

  // 视口驱动缩放（#24）：有视口时先按难度预选模板（其 w/h 决定精确倍率），
  // 再传给 generateNode；无视口时走旧路径（generateNode 内部选择 + 固定 nodeScale）。
  const viewport = (env && env.viewport) || null;
  let templateId = undefined;
  let scale = cfg.nodeScale || 1;
  if (viewport && viewport.vw > 0 && viewport.vh > 0) {
    const tpl = pickTemplate(diff, rng);
    templateId = tpl.id;
    scale = nodeScaleFor(viewport, tpl);
  }

  // 掩体布局：模板按 scale 放大，世界坐标 (0,0)~(w,h)，中心 (w/2,h/2)
  const templateResult = generateNode(diff, {
    seed: rng.int(0, 1000000),
    scale: scale,
    centerX: 0,
    centerY: 0,
    templateId: templateId
  });
  const w = templateResult.w, h = templateResult.h;
  const centerX = w / 2, centerY = h / 2;
  // generateNode 的元素以 (centerX,centerY) 为基准定位 → 平移到以世界原点为基准
  for (const c of templateResult.covers) {
    c.x += centerX;
    c.y += centerY;
  }

  const playerSpawn = { x: w * 0.10, y: h / 2 };

  // 三杠杆（P-13 / §6 条目 12）：敌人数量 / AI 策略复杂度 / 数值强度随 diff 涨
  const aiTier = aiTierForDifficulty(diff);
  const statMult = statMultForDifficulty(diff);

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
      heightClass: (diff > 0.6 || rng() < 0.35) ? 'heavy' : 'medium',
      statMult: statMult           // P-13：数值强度乘数（materializeNode 经 env.applyDifficulty 应用）
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
    aiTier: aiTier,          // P-13：AI 策略复杂度档位（0~2，供未来 AI 分级消费）
    statMult: statMult,      // P-13：数值强度乘数（敌军 hp/穿深/伤害）
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
 * @param {any} [env] 环境注入（#24）：{ viewport: { vw, vh } } 传给 makeNode；
 *   缺省 = 旧行为（固定 nodeScale）
 * @returns {{ nodes: any[], seed: number|string }}
 */
function generateRun(seed, count, env) {
  const cfg = nodeConfig();
  const nodeCount = Math.max(1, Math.min(12, count || cfg.runNodeCount || 5));
  const s = seed !== undefined ? seed : Math.floor(Math.random() * 1000000);
  const rng = createRNG(s);
  const nodes = [];
  for (let i = 0; i < nodeCount; i++) {
    nodes.push(makeNode(i, nodeCount, rng, env));
  }
  return { nodes: nodes, seed: s };
}

// ---------- 通关奖励评分（§4.5 方案） ----------

/**
 * 节点通关得分。
 * @param {any} node 节点数据
 * @param {any} result 战斗结果（result.damageTaken / result.clearMs / result.outpostAlive）
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
 *   env.applyDifficulty(tank, statMult) —— 应用数值强度乘数（P-13：敌军 hp/穿深/伤害 随难度涨；测试可 no-op）
 * @param {any} node makeNode/generateRun 产出的节点
 * @param {any} env 运行环境注入
 * @returns {{ spawned: any[], outpost: any }}
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
    if (e.statMult && e.statMult !== 1 && typeof env.applyDifficulty === 'function') env.applyDifficulty(t, e.statMult);
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
    aiTierForDifficulty,
    statMultForDifficulty,
    nodeScaleFor,
    makeNode,
    generateRun,
    scoreNode,
    materializeNode
  };
}
