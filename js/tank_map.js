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
 * 节点难度曲线（P-13 定表；P-34 开放式节点链参数化改造）：
 * 旧公式 t=i/(count-1) 在无限延长链下失效（count 不再已知），改为索引驱动饱和曲线：
 *   base = min(curveCap, curveStart + curveSpan·min(1, index/diffSatIndex)^curvePow)
 *   eff  = min(diffMax, base + difficultyLevel × crossRunLevelBonus)   ← 跨局等级叠加
 * 参数收口 RULES.difficulty（curveStart 0.15 / curveSpan 0.8 / curvePow 1.20 /
 * diffSatIndex 12 / curveCap 0.95 / crossRunLevelBonus 0.04 / diffMax 1.15）。
 * curvePow 2026-10-01 由 1.25 下调至 1.20（用户裁定「略微提高敌人升级速度」：curvePow 越接近 1
 * 中段难度越高 ⇒ 敌人随节点升级更快；端点不变——index=0 仍 0.15、index≥diffSatIndex 仍封顶 0.95）。
 * 数值定表说明：index=12 处基础难度封顶 0.95（约等于旧 5 节点链末段强度），
 * 每次终局 difficultyLevel+1 使下一局同索引难度 +0.04，封顶 1.15（敌数/杠杆公式对 >1
 * 的 diff 已有钳制，仅 statMult 触顶 1.5）。
 * @param {number} index 节点索引（0 起）
 * @param {number} [difficultyLevel] 跨局难度等级（profile.difficultyLevel，缺省 0）
 * @returns {number} 有效难度（0~1.15）
 */
function difficultyForIndex(index, difficultyLevel) {
  const cfg = difficultyConfig() || {
    curveStart: 0.15, curveSpan: 0.8, curvePow: 1.20,
    diffSatIndex: 12, curveCap: 0.95, crossRunLevelBonus: 0.04, diffMax: 1.15
  };
  const i = Math.max(0, index);
  const sat = cfg.diffSatIndex !== undefined ? cfg.diffSatIndex : 12;
  const cap = cfg.curveCap !== undefined ? cfg.curveCap : 0.95;
  const base = Math.min(cap, cfg.curveStart + cfg.curveSpan * Math.pow(Math.min(1, i / sat), cfg.curvePow));
  const lv = (Number.isFinite(difficultyLevel) && difficultyLevel > 0) ? difficultyLevel : 0;
  const bonus = (cfg.crossRunLevelBonus !== undefined ? cfg.crossRunLevelBonus : 0.04) * lv;
  const max = cfg.diffMax !== undefined ? cfg.diffMax : 1.15;
  return Math.round(Math.min(max, base + bonus) * 100) / 100;
}

// Boss 节点判定（P-37）：每第 bossInterval 个节点为 Boss 节点
// （#K3 2026-09-29 起 interval=3 ⇒ (index+1) % 3 === 0 → index 2/5/8/11/14…）。
// makeNode 预标 node.boss=true 并清空常规敌人；Boss 具体定义由 UI 层在进入战斗时从 Boss 池懒指定。
function isBossNodeIndex(index) {
  const interval = (typeof RULES !== 'undefined' && RULES.nodeMap && RULES.nodeMap.bossInterval) || 5;
  return ((index + 1) % interval) === 0;
}

/**
 * 敌军数量：1 + floor(diff·enemyCountMax)（RULES.difficulty.enemyCountMax=4）。
 */
function enemyCountForDifficulty(diff) {
  const cfg = difficultyConfig() || {};
  const max = cfg.enemyCountMax !== undefined ? cfg.enemyCountMax : 4;
  return Math.max(1, 1 + Math.floor(Math.min(1, Math.max(0, diff)) * max));
}

// P-38 击杀配额公式（仅常规节点；Boss 节点由 makeNode 置 null）：
//   quota = max(initialCount, initialCount + quotaAddBase + floor(effDiff × quotaDiffScale))
// 参数收口 RULES.nodeMap（quotaAddBase 2 / quotaDiffScale 6）。配额恒 ≥ 初始敌数：
// 初始全灭但配额未满时，由 reinforcementTick 递增生成补兵继续战斗。
function quotaForDifficulty(initialCount, effDiff) {
  const cfg = nodeConfig();
  const init = Math.max(1, initialCount | 0);
  const addBase = cfg.quotaAddBase !== undefined ? cfg.quotaAddBase : 2;
  const diffScale = cfg.quotaDiffScale !== undefined ? cfg.quotaDiffScale : 6;
  const d = Math.max(0, Number.isFinite(effDiff) ? effDiff : 0);
  return Math.max(init, init + addBase + Math.floor(d * diffScale));
}

// AI 策略复杂度档位：floor(diff·(aiTierMax+1)) 钳到 [0, aiTierMax]
function aiTierForDifficulty(diff) {
  const cfg = difficultyConfig() || {};
  const max = cfg.aiTierMax !== undefined ? cfg.aiTierMax : 2;
  return Math.max(0, Math.min(max, Math.floor(Math.min(1, Math.max(0, diff)) * (max + 1))));
}

// 数值强度乘子（#76 A 表驱动）：原 P-13「1+(statMultMax−1)·diff 三项特判」已迁移进
// RULES.difficulty.entityMults（键值 = [diff=0 乘子, diff=diffMax 乘子]，按 diffNorm 线性插值）。
// 返回整张乘子表，materializeNode 经 env.applyDifficulty(t, mults) 叠乘到敌军 stats。
function entityMultsForDifficulty(diff) {
  const cfg = difficultyConfig() || {};
  const table = cfg.entityMults || {
    maxHp: [0.5, 1.7], penetration: [0.75, 1.25], damage: [0.75, 1.2], armorAll: [0.6, 1.3],
    reload: [1.25, 0.82], spreadMult: [1.3, 0.78], aimSpeed: [0.8, 1.35],
    maxSpeed: [0.7, 1.0], turnRate: [0.7, 1.2], turretTurnRate: [0.7, 1.25]
  };
  const diffMax = cfg.diffMax !== undefined ? cfg.diffMax : 1.15;
  const n = Math.min(1, Math.max(0, (Number.isFinite(diff) ? diff : 0) / diffMax));
  const out = {};
  for (const k in table) {
    const pair = table[k];
    if (!Array.isArray(pair) || pair.length < 2) continue;
    out[k] = Math.round((pair[0] + (pair[1] - pair[0]) * n) * 1000) / 1000;
  }
  return out;
}

// 兼容薄委托（P-13 遗留函数名）：旧语义"数值强度乘数"取表中 maxHp 档（生存端代表值）。
function statMultForDifficulty(diff) {
  return entityMultsForDifficulty(diff).maxHp;
}

// AI 有效触发距离（重设计）：triggerDistBase × lerp(1.0, triggerDistDiffMultMax, diff归一化)。
// 在实体生成时算好挂 t.aiTriggerDist，aiDecideEnemy 读实体字段（与摄像机视野彻底解耦）。
function triggerDistForDifficulty(diff) {
  const ai = (typeof RULES !== 'undefined' && RULES.ai) ? RULES.ai : {};
  const base = ai.triggerDistBase !== undefined ? ai.triggerDistBase : 700;
  const maxMult = ai.triggerDistDiffMultMax !== undefined ? ai.triggerDistDiffMultMax : 1.6;
  const d = Math.min(1, Math.max(0, diff));
  return Math.round(base * (1 + (maxMult - 1) * d));
}

/**
 * 敌军构成随节点深度（index）演进（P-43）：
 *   返回长度为 enemyCount 的 spec 数组，每元素 = { tankId, heightClass, role, elite, aiTier, entityMults }。
 *   深度信号 p 取难度归一化（难度曲线随 index 单调上升至饱和，天然体现 depth，无需 runLength）。
 *   · 早期（p 小）：重型占比低（~10%）、轻量同质；
 *   · 中期（p>0.30）：重型占比上升（~40%+）、给部分敌人标 role:'support'（仅 tag，不改战斗逻辑）；
 *   · 后期（p>0.50）：重型占比高（~75%）、并在首个敌人标 elite:true（aiTier+1 钳≤2、entityMults×1.15）。
 *   确定性：只用传入 rng，按既有 per-enemy 调用顺序（rng.choice 选 tankId）；重型/支援/精英均为确定性推导，
 *   不新增独立 rng 流、不挪到 generateNode 之前（保证种子/地形回放稳定，同 seed 两次结果逐字段一致）。
 *   两处生成路径（聚簇 + 兜底）共用同一数组，按 enemies.length 顺序消费，互不干扰。
 * @param {number} index 节点索引（0 起；保留参数，深度以 diff 体现）
 * @param {number} diff 有效难度
 * @param {any} rng createRNG 实例
 * @param {any} cfg nodeConfig()
 * @returns {Array} 长度 = enemyCountForDifficulty(diff) 的 spec 数组
 */
function enemyCompositionForDepth(index, diff, rng, cfg, countOverride) {
  // B 档①（2026-09-23）：countOverride 供防线制传入实际目标敌数；缺省回退旧难度公式（向后兼容）。
  const count = (Number.isFinite(countOverride) && countOverride > 0)
    ? Math.round(countOverride) : enemyCountForDifficulty(diff);
  const diffCfg = difficultyConfig() || {};
  const diffMax = diffCfg.diffMax !== undefined ? diffCfg.diffMax : 1.15;
  const aiTierMax = diffCfg.aiTierMax !== undefined ? diffCfg.aiTierMax : 2;
  // 深度信号：难度归一化（0~1），随 index 单调非降（饱和于 diffSatIndex）。
  const p = Math.min(1, Math.max(0, diff / diffMax));
  // 重型目标占比：早期 ~10% → 后期 ~75%（平滑、随 index 非降）。
  const heavyRatio = Math.min(0.85, 0.10 + 0.80 * p);
  const supportDepth = p > 0.30;   // 中段起引入支援型 tag
  const eliteDepth = p > 0.50;     // 后段起首个敌人标 elite（领队）
  const pool = (cfg.enemyTankPool && cfg.enemyTankPool.length) ? cfg.enemyTankPool : ['dummy'];
  const baseAiTier = aiTierForDifficulty(diff);
  const baseMults = entityMultsForDifficulty(diff);
  const heavyTarget = Math.round(heavyRatio * count);   // 重型数量（确定性，保证随 index 非降）
  const out = [];
  for (let i = 0; i < count; i++) {
    const tankId = rng.choice(pool);
    // 前 heavyTarget 个为重型（确定性分配到具体敌人，避免小样本随机抖动破坏曲线单调性）。
    const heightClass = (i < heavyTarget) ? 'heavy' : 'medium';
    // 精英仅后期首个敌人；支援型中段起、奇数序号（i%3===1）的非精英敌人，确定性不耗额外 rng。
    const elite = (i === 0 && eliteDepth);
    const role = (supportDepth && !elite && (i % 3 === 1)) ? 'support' : 'assault';
    let aiTier = baseAiTier;
    let entityMults = baseMults;
    if (elite) {
      // 精英：AI 档位 +1（钳到 aiTierMax），数值乘子各 ×1.15 并深拷贝，避免污染其他敌人。
      aiTier = Math.max(0, Math.min(aiTierMax, baseAiTier + 1));
      entityMults = {};
      for (const k in baseMults) entityMults[k] = Math.round(baseMults[k] * 1.15 * 1000) / 1000;
    }
    // P-46：纯逻辑层类别推导——tankId 无法读 json，仅按 heightClass 区分 heavy/medium；
    // light/spg 等真实 json class 由 materializeNode 后经 configureTank 覆盖（浏览器侧 deriveTankClass）。
    const tankClass = (heightClass === 'heavy') ? 'heavy' : 'medium';
    out.push({ tankId, heightClass, tankClass, role, elite, aiTier, entityMults });
  }
  return out;
}

// ---------- B 档①（2026-09-23）：防线式敌人生成 ----------
// 动机：旧实现以玩家出生点为原点做「全向环带撒簇」——敌人在四周随机分布，玩家没有推进方向感。
// 现行：沿推进轴（+x，与玩家左缘出生 w×0.10 / Boss 生成点 w×0.7 同向）把节点切成若干「防线」桶，
// 每桶取 1 个地形锚点（路口 > 结构 > 水体 / 林地簇），敌人在锚点周边成批生成。
// 因 AI 激活受 aiTriggerDist 限制，玩家通常一次只遭遇前方一条防线 ⇒ 自然形成「推进—遭遇—清剿」节奏。
// 全部为纯逻辑：只消费传入 rng，同 seed 结果确定（回放 hash 稳定）。

function defenseLineConfig() {
  const cfg = nodeConfig();
  return (cfg && cfg.defenseLine) ? cfg.defenseLine : {};
}

// 单桶内的锚点候选池（按 kind 分类，供 pickDefenseLineAnchor 抽取）
function collectDefenseAnchors(o) {
  const s = o || {};
  const covers = Array.isArray(s.covers) ? s.covers : [];
  const junctions = Array.isArray(s.roadJunctions) ? s.roadJunctions : [];
  const x0 = s.x0, x1 = s.x1;
  const inBucket = (x) => x >= x0 && x <= x1;
  const out = { junction: [], structure: [], liquid: [], foliage: [] };
  for (const j of junctions) {
    if (j && inBucket(j.x)) out.junction.push({ x: j.x, y: j.y, kind: 'junction' });
  }
  const STRUCT = ['full', 'intact', 'building', 'rock', 'ruined'];
  const LIQUID = ['water', 'river'];
  const FOLIAGE = ['tree', 'bush'];
  const foliageCells = new Map();   // 林地簇：240px 网格聚合，≥3 个成员视为一簇
  for (const c of covers) {
    if (!c || !Number.isFinite(c.x) || !inBucket(c.x)) continue;
    if (STRUCT.indexOf(c.tier) >= 0) out.structure.push({ x: c.x, y: c.y, kind: 'structure' });
    else if (LIQUID.indexOf(c.tier) >= 0) out.liquid.push({ x: c.x, y: c.y, kind: 'liquid' });
    else if (FOLIAGE.indexOf(c.tier) >= 0) {
      const key = Math.floor(c.x / 240) + ':' + Math.floor(c.y / 240);
      let cell = foliageCells.get(key);
      if (!cell) { cell = { sx: 0, sy: 0, n: 0 }; foliageCells.set(key, cell); }
      cell.sx += c.x; cell.sy += c.y; cell.n++;
    }
  }
  for (const cell of foliageCells.values()) {
    if (cell.n >= 3) out.foliage.push({ x: cell.sx / cell.n, y: cell.sy / cell.n, kind: 'foliage' });
  }
  return out;
}

// 单条防线的锚点：优先路口（anchorJunctionChance），否则结构/水体/林地簇随机取；
// 桶内无候选 ⇒ 退化到桶中心 + 纵向随机（仍钳在节点内）。
function pickDefenseLineAnchor(cands, o) {
  const s = o || {};
  const rng = s.rng, w = s.w, h = s.h;
  const clampX = (v) => Math.max(60, Math.min(w - 60, v));
  const clampY = (v) => Math.max(60, Math.min(h - 60, v));
  const other = cands.structure.concat(cands.liquid, cands.foliage);
  if (cands.junction.length && rng() < s.anchorJunctionChance) {
    const j = cands.junction[Math.floor(rng() * cands.junction.length)];
    return { x: clampX(j.x), y: clampY(j.y), kind: 'junction' };
  }
  if (other.length) {
    const c = other[Math.floor(rng() * other.length)];
    return { x: clampX(c.x), y: clampY(c.y), kind: c.kind };
  }
  return { x: clampX(s.center), y: clampY(rng.range(h * 0.22, h * 0.78)), kind: 'fallback' };
}

/**
 * 防线规划（纯逻辑、确定性）。
 * 推进轴区间 = [playerSpawn.x + max(lineMargin, minPlayerDist), w × axisTopFraction]，按「间距」等分：
 *   间距 = spacingScreens × 视口宽 × lerp(spacingDiff[0], spacingDiff[1], diffNorm)
 *   ⇒ 难度越高间距越窄 ⇒ 防线越多（受 linesMin/linesMax 约束）。
 * 总数 targetCount = 防线数 × anchorsPerLine × perAnchor，钳制到 [enemyCountForDifficulty, maxPerNode]。
 * @param {any} o { w, h, playerSpawn, minPlayerDist, diff, diffNorm, viewport:{vw,vh},
 *                  covers, roadJunctions, rng }
 * @returns {{ lines: Array<{x0,x1,center,anchors:Array<{x,y,kind}>}>,
 *             lineCount:number, perAnchor:number, targetCount:number, enabled:boolean }}
 */
function planDefenseLines(o) {
  const s = o || {};
  const cfg = defenseLineConfig();
  const w = s.w, h = s.h;
  const ps = s.playerSpawn || { x: w * 0.10, y: h / 2 };
  const rng = s.rng;
  const enabled = cfg.enabled !== false;
  const vw = (s.viewport && s.viewport.vw > 0) ? s.viewport.vw : Math.max(1, w / 3);
  const diffNorm = Math.min(1, Math.max(0, Number.isFinite(s.diffNorm) ? s.diffNorm : 0));
  const sd = Array.isArray(cfg.spacingDiff) ? cfg.spacingDiff : [1.15, 0.85];
  const spacingBase = (cfg.spacingScreens !== undefined ? cfg.spacingScreens : 0.9) * vw;
  const spacing = Math.max(160, spacingBase * (sd[0] + (sd[1] - sd[0]) * diffNorm));
  const linesMin = cfg.linesMin !== undefined ? cfg.linesMin : 2;
  const linesMax = cfg.linesMax !== undefined ? cfg.linesMax : 3;
  const perAnchorMin = cfg.perAnchorMin !== undefined ? cfg.perAnchorMin : 2;
  const perAnchorMax = cfg.perAnchorMax !== undefined ? cfg.perAnchorMax : 3;
  const anchorsPerLine = Math.max(1, cfg.anchorsPerLine || 1);
  const margin = Math.max(cfg.lineMargin !== undefined ? cfg.lineMargin : 300,
    Number.isFinite(s.minPlayerDist) ? s.minPlayerDist : 0);
  const x0 = Math.min(w * 0.92, ps.x + margin);
  const x1 = w * (cfg.axisTopFraction !== undefined ? cfg.axisTopFraction : 0.92);
  const span = Math.max(0, x1 - x0);
  const linesWanted = Math.round(linesMin + (linesMax - linesMin) * diffNorm);
  // B 档①（2026-09-23）：以「难度期望的防线数」为主（难度越高越密），仅受几何上限约束——
  // 每道防线至少 minBucketWidth 宽（≈锚点散布半径 + 余量），避免桶重叠到无意义。
  // （若用 round(span/spacing) 当上限，高难度永远拿不到 linesMax 条防线：探针实测 diff=0.95 仍为 2。）
  const minBucketWidth = 240;
  const maxLinesBySpan = span > 0
    ? Math.max(1, Math.floor(span / Math.max(minBucketWidth, spacing * 0.5))) : 1;
  const lineCount = Math.max(1, Math.min(Math.max(linesMin, linesWanted), maxLinesBySpan));
  const perAnchor = Math.max(1, Math.round(perAnchorMin + (perAnchorMax - perAnchorMin) * diffNorm));
  const lines = [];
  for (let i = 0; i < lineCount; i++) {
    const bx0 = x0 + (span * i) / lineCount;
    const bx1 = x0 + (span * (i + 1)) / lineCount;
    const anchors = [];
    if (enabled) {
      const cands = collectDefenseAnchors({
        covers: s.covers, roadJunctions: s.roadJunctions, x0: bx0, x1: bx1, w: w, h: h
      });
      for (let k = 0; k < anchorsPerLine; k++) {
        anchors.push(pickDefenseLineAnchor(cands, {
          rng: rng, w: w, h: h, center: (bx0 + bx1) / 2,
          anchorJunctionChance: cfg.anchorJunctionChance !== undefined ? cfg.anchorJunctionChance : 0.45
        }));
      }
    }
    lines.push({ x0: bx0, x1: bx1, center: (bx0 + bx1) / 2, anchors: anchors });
  }
  const floorCount = enemyCountForDifficulty(Number.isFinite(s.diff) ? s.diff : 0);
  const cap = cfg.maxPerNode !== undefined ? cfg.maxPerNode : 12;
  const targetCount = enabled
    ? Math.max(1, Math.min(cap, Math.max(floorCount, lineCount * anchorsPerLine * perAnchor)))
    : floorCount;
  return { lines: lines, lineCount: lineCount, perAnchor: perAnchor, targetCount: targetCount, enabled: enabled };
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
 * @param {number} index 节点索引（0 起；开放式链下无上限，难度按索引饱和）
 * @param {any} rng createRNG 实例（调用方传入，保证整局确定性）
 * @param {any} [env] 环境注入：{ viewport: { vw, vh }, difficultyLevel: number }
 *   —— viewport 决定节点世界缩放（宽高各 ≥ 视口 3 倍）；difficultyLevel 为跨局
 *   难度等级（P-34，settleRun 每终局 +1，叠加进有效难度）；缺省回退旧行为
 * @returns {any} node
 */
function makeNode(index, rng, env) {
  const cfg = nodeConfig();
  const difficultyLevel = (env && Number.isFinite(env.difficultyLevel)) ? env.difficultyLevel : 0;
  const diff = difficultyForIndex(index, difficultyLevel);

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

  // #I3（2026-09-21 用户裁定「特别是 boss 战地图的建筑密度」）：Boss 节点建筑密度乘子
  // （isBossNodeIndex 为纯函数，可在 generateNode 前判定）
  const bossDensity = (RULES.nodeMap.building && RULES.nodeMap.building.bossDensity) || 1.6;
  const buildingDensity = isBossNodeIndex(index) ? bossDensity : 1;

  // 掩体布局：模板按 scale 放大，世界坐标 (0,0)~(w,h)，中心 (w/2,h/2)
  const templateResult = generateNode(diff, {
    seed: rng.int(0, 1000000),
    scale: scale,
    centerX: 0,
    centerY: 0,
    templateId: templateId,
    buildingDensity: buildingDensity
  });
  const w = templateResult.w, h = templateResult.h;
  const centerX = w / 2, centerY = h / 2;
  // generateNode 的元素以 (centerX,centerY) 为基准定位 → 平移到以世界原点为基准
  for (const c of templateResult.covers) {
    c.x += centerX;
    c.y += centerY;
  }

  // 玩家出生点：默认左缘 (0.10w, h/2)；必须远离所有掩体（含水域 tier，见 pointInCover）。
  // 若落在掩体内，确定性重选址（仅用传入 rng，禁止 Math.random）：优先保留左缘意图的最近合法点，
  // 否则推到违规掩体外缘相邻清空处。最终钳制在节点边界 [margin, w-margin]×[margin, h-margin] 内。
  const spawnMargin = cfg.spawnMargin || 60;
  let playerSpawn = { x: w * 0.10, y: h / 2 };
  if (pointInCover(templateResult.covers, playerSpawn.x, playerSpawn.y, spawnMargin)) {
    playerSpawn = findPlayerSpawn(templateResult.covers, w, h, rng, spawnMargin);
  }

  // 三杠杆（P-13 / §6 条目 12）：敌人数量 / AI 策略复杂度 / 数值强度随 diff 涨
  // #76 A：数值强度改为 entityMults 全属性乘子表（旧 statMult 三项特判已并入表）
  const aiTier = aiTierForDifficulty(diff);
  const statMult = statMultForDifficulty(diff);   // 兼容保留：= entityMults.maxHp
  const entityMults = entityMultsForDifficulty(diff);

  // AI 触发重设计：敌军生成点必须在有效触发距离之外（玩家开局不应看到脸刷兵）。
  // 最小间距取「难度化触发距离 × 1.05 余量」与旧配置 enemyMinPlayerDist 的较大者。
  const trigDist = triggerDistForDifficulty(diff);
  const minPlayerDist = Math.max(cfg.enemyMinPlayerDist || 250, Math.round(trigDist * 1.05));

  // P-46 敌军生成优化 + #B4 敌军聚簇生成（消费 RULES.nodeMap.enemyCluster*）：
  // 以 playerSpawn 为原点，根据难度与配置确定聚簇中心数（1~4 个），
  // 在环带半径 [minPlayerDist, maxPlayerDist] 内划分扇区采样簇中心，
  // 随后在各簇中心周围 enemyClusterRadius 范围内拒绝采样生成敌人（避开掩体、世界边界及彼此重叠）。
  // 若因极端密集掩体未填满，由下方全图网格兜底补满。
  const enemyCount = enemyCountForDifficulty(diff);
  const diffCfg = difficultyConfig() || {};
  const diffMax = diffCfg.diffMax !== undefined ? diffCfg.diffMax : 1.15;
  const diffNorm = Math.min(1, Math.max(0, diff / diffMax));

  const maxWorldDim = Math.max(w, h);
  const maxPlayerDist = Math.min(maxWorldDim * (cfg.ringMaxDistMult || 0.85), Math.max(minPlayerDist + 300, maxWorldDim * 0.7));

  // 聚簇参数消费 (#B4)
  const clusterRadius = cfg.enemyClusterRadius || 150;
  const clusterCountBase = cfg.enemyClusterCountBase !== undefined ? cfg.enemyClusterCountBase : 2;
  const targetClusterCount = Math.min(enemyCount, Math.max(1, Math.round(clusterCountBase + diffNorm * 2)));

  const sectorsCount = Math.min(cfg.ringSectorsMax || 4, Math.max(targetClusterCount, cfg.ringSectorsBase || 2));

  // B 档①（2026-09-23）：防线规划（纯逻辑、确定性）——沿推进轴分桶取地形锚点，
  // 敌人在锚点周边成批生成；targetCount = 防线容量（现行 4~9 辆/节点，取代原 1~4）。
  // Boss 节点例外：其常规敌人随后即被清空（Boss 战不混普通敌军），但敌簇质心仍驱动 A17 LoS 走廊
  // ⇒ 若改用防线锚点会连带改变 Boss 战地图布局（实测「掩体在界内」断言被打破）。故 Boss 节点
  // 保持旧全向路径，零回归。
  const defenseEnabled = (cfg.defenseLine ? cfg.defenseLine.enabled !== false : true) && !isBossNodeIndex(index);
  const defense = defenseEnabled ? planDefenseLines({
    w: w, h: h, playerSpawn: playerSpawn, minPlayerDist: minPlayerDist,
    diff: diff, diffNorm: diffNorm, viewport: viewport,
    covers: templateResult.covers, roadJunctions: templateResult.roadJunctions, rng: rng
  }) : { lines: [], lineCount: 0, perAnchor: 0, targetCount: enemyCountForDifficulty(diff), enabled: false };
  const targetCount = defense.targetCount;

  // P-43：构成随深度演进——compose 一次，防线聚簇与兜底两处共用同一 spec 数组（按 enemies.length 顺序消费）。
  const composition = enemyCompositionForDepth(index, diff, rng, cfg, targetCount);
  const enemies = [];
  const clusterCentroids = [];

  // 计算多方向主角度（随整局确定性 rng 整体微调偏移）
  const baseAngleOffset = rng.range(0, Math.PI * 2);
  const sectorAngles = [];
  for (let s = 0; s < sectorsCount; s++) {
    sectorAngles.push(baseAngleOffset + (s * (Math.PI * 2) / sectorsCount));
  }

  // ================= #E6（2026-09-20）敌军生成点位改造 =================
  // 用户反馈：敌人生成太靠近边缘；要在部分建筑、路口生成；随难度加大，集中生成的敌人数量增加。
  // 实现：聚簇中心优先取「建筑/岩石中心 + 路口中心」候选点（junctionChance 进一步偏向路口），
  // 落在结构点的簇比例随难度从 structureChance → structureChanceMax 上升——
  // 「集中在建筑/路口的敌人数」随难度单调增加。
  // **B 档①（2026-09-23）变更**：本段（enemySpawn.structureChance/ structureChanceMax /
  // junctionChance / structRadius）现仅服务**回退路径**（defenseLine.enabled = false 的旧全向环带）；
  // 防线模式下锚点抽取由 RULES.nodeMap.defenseLine 承担（anchorJunctionChance + 结构/水体/林地簇候选池），
  // 敌人数改由防线容量 targetCount 决定，**不再恒等于 enemyCountForDifficulty**。
  const spawnCfg = cfg.enemySpawn || {};
  const structChanceBase = spawnCfg.structureChance !== undefined ? spawnCfg.structureChance : 0.55;
  const structChanceMax = spawnCfg.structureChanceMax !== undefined ? spawnCfg.structureChanceMax : 0.85;
  const structChance = structChanceBase + (structChanceMax - structChanceBase) * diffNorm;
  const structRadius = spawnCfg.structureRadius !== undefined ? spawnCfg.structureRadius : 130;
  const junctionPickChance = spawnCfg.junctionChance !== undefined ? spawnCfg.junctionChance : 0.35;
  // #G（2026-09-21）：建筑聚集掩体集合加入可破坏楼房 building（与 full/intact/ruined 同类结构体）
  const structCovers = templateResult.covers.filter(c =>
    (c.tier === 'full' || c.tier === 'intact' || c.tier === 'building' || c.tier === 'rock' || c.tier === 'ruined'));
  const junctions = templateResult.roadJunctions || [];
  const clampX = (v) => Math.max(60, Math.min(w - 60, v));
  const clampY = (v) => Math.max(60, Math.min(h - 60, v));
  const pickStructureCenter = () => {
    const farJunctions = junctions.filter(j => Math.hypot(j.x - playerSpawn.x, j.y - playerSpawn.y) >= minPlayerDist);
    if (farJunctions.length && rng() < junctionPickChance) {
      const j = farJunctions[Math.floor(rng() * farJunctions.length)];
      return { x: clampX(j.x), y: clampY(j.y) };
    }
    if (!structCovers.length) return null;
    for (let i = 0; i < 24; i++) {
      const c = structCovers[Math.floor(rng() * structCovers.length)];
      if (Math.hypot(c.x - playerSpawn.x, c.y - playerSpawn.y) < minPlayerDist) continue;
      // 建筑周边环形散布（不压在建筑体内，保留掩体可读性）
      const a = rng() * Math.PI * 2;
      const r = Math.max(c.w || 40, c.h || 40) * 0.5 + rng.range(10, structRadius);
      return { x: clampX(c.x + Math.cos(a) * r), y: clampY(c.y + Math.sin(a) * r) };
    }
    return null;
  };

  // B 档①（2026-09-23）：簇中心 = 各防线的地形锚点（沿推进轴由左至右排列），玩家逐条防线推进；
  // 配合 aiTriggerDist，一次通常只激活前方一条防线 ⇒ 「推进—遭遇—清剿」节奏。
  const centroids = [];
  if (defense.enabled) {
    for (const line of defense.lines) {
      for (const a of line.anchors) centroids.push({ x: a.x, y: a.y });
    }
  }
  // 回退路径（RULES.nodeMap.defenseLine.enabled = false）：旧全向环带扇区撒簇（原逻辑不变）
  if (!centroids.length) {
    for (let c = 0; c < targetClusterCount; c++) {
      // #E6：按难度比例把簇中心放到建筑/路口（junctionChance 优先路口）
      const st = (rng() < structChance) ? pickStructureCenter() : null;
      if (st) { centroids.push(st); continue; }
      const sAng = sectorAngles[c % sectorsCount];
      const cAng = sAng + rng.range(-Math.PI / 6, Math.PI / 6);
      const cDist = rng.range(minPlayerDist, maxPlayerDist);
      centroids.push({
        x: Math.max(60, Math.min(w - 60, playerSpawn.x + Math.cos(cAng) * cDist)),
        y: Math.max(60, Math.min(h - 60, playerSpawn.y + Math.sin(cAng) * cDist))
      });
    }
  }

  // 围绕聚簇中心分发放置敌人，直到放满或尝试用尽
  let attempts = 0;
  const maxAttempts = targetCount * 80;
  while (enemies.length < targetCount && attempts < maxAttempts) {
    attempts++;
    const cluster = centroids[enemies.length % centroids.length];
    // 在簇中心周围 clusterRadius 范围内散布，若单车首发则贴近中心
    const inClusterDist = rng.range(0, clusterRadius);
    const inClusterAng = rng.range(0, Math.PI * 2);
    const ex = cluster.x + Math.cos(inClusterAng) * inClusterDist;
    const ey = cluster.y + Math.sin(inClusterAng) * inClusterDist;

    // 边界检测：必须在地图有效边界 [margin, w-margin] 内
    const margin = 50;
    if (ex < margin || ex > w - margin || ey < margin || ey > h - margin) continue;
    if (Math.hypot(ex - playerSpawn.x, ey - playerSpawn.y) < minPlayerDist) continue;

    // 彼此间距检测
    let tooClose = false;
    for (const e of enemies) {
      if (Math.hypot(ex - e.x, ey - e.y) < (cfg.enemyMinDist || 150)) { tooClose = true; break; }
    }
    if (tooClose) continue;

    // 避开掩体
    if (pointInCover(templateResult.covers, ex, ey, 60)) continue;

    const spec = composition[enemies.length] || {
      tankId: (cfg.enemyTankPool && cfg.enemyTankPool[0]) || 'tiger-I',
      heightClass: 'medium', tankClass: 'medium', role: 'assault', elite: false, aiTier: aiTier, entityMults: entityMults
    };

    enemies.push({
      tankId: spec.tankId,
      x: Math.round(ex), y: Math.round(ey),
      hullAngle: Math.atan2(playerSpawn.y - ey, playerSpawn.x - ex),
      turretAngle: Math.atan2(playerSpawn.y - ey, playerSpawn.x - ex),
      heightClass: spec.heightClass,
      tankClass: spec.tankClass,       // P-46：类别（纯逻辑推导，浏览器侧经 configureTank 覆盖为 json class）
      role: spec.role,                 // P-43：构成深度演进附加 tag
      elite: spec.elite,               // P-43：精英标记
      statMult: statMult,              // 兼容保留
      entityMults: spec.entityMults,   // 全属性乘子表
      aiTier: spec.aiTier,             // AI 档位
      // #E7（2026-09-20）：正式对局生成的敌军启用「反应延迟」（首次接战后察觉/起转期），
      // 详见 RULES.ai.reactionSecondsBase；bench/单测裸实体不打此标 → 保持即时响应。
      aiReactEnabled: true
    });
    clusterCentroids.push({ x: Math.round(ex), y: Math.round(ey) });
  }

  // 兜底补满：若防线锚点周边因掩体密集/贴边未能凑齐 targetCount，用确定性网格扫描补足。
  // B 档①（2026-09-23）：防线模式下候选**限定在推进轴防线区间内**，并按「离最近防线锚点的距离」
  // 升序取点（贴防线补位）——旧口径按「离玩家最远」排序，会把未放满的敌人全推到地图最右缘成一列，
  // 破坏防线结构（探针实测 idx=3 四个敌人同列 x=5625 ⇒ 全部来自旧兜底）。
  if (enemies.length < targetCount) {
    const minDist = cfg.enemyMinDist || 150;
    const step = Math.max(20, minDist * 0.7);
    const anchors = [];
    if (defense.enabled) {
      for (const line of defense.lines) for (const a of line.anchors) anchors.push(a);
    }
    const gx0 = anchors.length ? Math.max(60, defense.lines[0].x0 - 60) : 60;
    const gx1 = anchors.length ? Math.min(w - 60, defense.lines[defense.lines.length - 1].x1 + 60) : w - 60;
    const cands = [];
    for (let gx = gx0; gx <= gx1; gx += step) {
      for (let gy = 60; gy <= h - 60; gy += step) {
        if (Math.hypot(gx - playerSpawn.x, gy - playerSpawn.y) < minPlayerDist) continue;
        let ok = true;
        for (const e of enemies) {
          if (Math.hypot(gx - e.x, gy - e.y) < minDist) { ok = false; break; }
        }
        if (!ok) continue;
        if (pointInCover(templateResult.covers, gx, gy, 60)) continue;
        let score;
        if (anchors.length) {
          // 防线模式：越贴近防线锚点越优先（score 越大越靠前）
          let near = Infinity;
          for (const a of anchors) near = Math.min(near, Math.hypot(gx - a.x, gy - a.y));
          score = -near;
        } else {
          // 回退模式（旧口径）：净空最大者优先
          let clear = Math.hypot(gx - playerSpawn.x, gy - playerSpawn.y) - minPlayerDist;
          for (const e of enemies) clear = Math.min(clear, Math.hypot(gx - e.x, gy - e.y) - minDist);
          score = clear;
        }
        cands.push({ x: gx, y: gy, clear: score });
      }
    }
    cands.sort((a, b) => b.clear - a.clear);
    for (const c of cands) {
      if (enemies.length >= targetCount) break;
      let ok = true;
      for (const e of enemies) {
        if (Math.hypot(c.x - e.x, c.y - e.y) < minDist) { ok = false; break; }
      }
      if (!ok) continue;
      const spec = composition[enemies.length] || {
        tankId: (cfg.enemyTankPool && cfg.enemyTankPool[0]) || 'dummy',
        heightClass: 'medium', tankClass: 'medium', role: 'assault', elite: false, aiTier: aiTier, entityMults: entityMults
      };
      enemies.push({
        tankId: spec.tankId,
        x: Math.round(c.x), y: Math.round(c.y),
        hullAngle: Math.atan2(playerSpawn.y - c.y, playerSpawn.x - c.x),
        turretAngle: Math.atan2(playerSpawn.y - c.y, playerSpawn.x - c.x),
        heightClass: spec.heightClass,
        tankClass: spec.tankClass,       // P-46：类别
        role: spec.role,                     // P-43：构成深度演进附加 tag
        elite: spec.elite,                   // P-43：精英标记
        statMult: statMult,
        entityMults: spec.entityMults,    // #76 A / P-43：兜底补满路径同样带 per-enemy 全属性乘子表
        aiTier: spec.aiTier               // P-34 C / P-43：兜底补满路径同样带 per-enemy 档位
      });
    }
  }

  // A17 方案1：生成期 LoS 走廊保证（世界帧，生成后处理）。
  // 用"节点 seed 派生的独立子流"驱动侧移随机方向，绝不消耗整局 rng（保证：
  // 无遮挡节点布局零变化、仅曾零开火节点 covers 改变 → 回放 hash 只对这些节点变化）。
  // 真实 spawn / 敌簇质心此时才确定（依赖 covers 的拒绝采样），故在生成后世界帧处理，
  // 而非把 losHints 回传给 generateNode（避免扰动 generateNode 的 rng 流序）。
  let losClusters = clusterCentroids.slice();
  if (!losClusters.length && enemies.length) losClusters = enemies.map(e => ({ x: e.x, y: e.y }));
  if (losClusters.length && typeof ensureLoSCorridor === 'function') {
    const losRng = createRNG((((Number(templateResult.seed) >>> 0) ^ 0x4C05A3) + 0x9E3779B9) >>> 0);
    ensureLoSCorridor(templateResult.covers,
      { spawn: playerSpawn, clusters: losClusters, bounds: { w: w, h: h } }, losRng);
  }
  // 记录 A17 走廊所针对的敌簇质心（供校验/调试；不改变既有字段语义）
  const enemyClusters = losClusters;

  // 友军据点：左 1/4 区域、概率出现、远离敌军与玩家出生点（§2.2：消极防御、可被摧毁）
  let outpost = null;
  if (rng() < (cfg.outpostChance !== undefined ? cfg.outpostChance : 0.7)) {
    let guard = 0;
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

  // P-37：Boss 节点周期标记 —— 每第 bossInterval 个节点为 Boss 战（index 4/9/14…）。
  // 预标 node.boss=true 并清空常规敌人（沿用原链尾 Boss 处理：Boss 战不混普通敌军）；
  // Boss 具体定义（name/loot/summons）由 UI 层进入战斗时从 Boss 池懒指定（保持本模块零 IO）。
  const bossMark = isBossNodeIndex(index);
  if (bossMark) enemies.length = 0;

  // P-38：击杀配额（仅常规节点）——节点结束条件由「初始全灭」改为「节点内击杀数 ≥ quota」。
  // Boss 节点不定义配额（summons 即其机制，禁用递增生成）。
  const quota = bossMark ? null : quotaForDifficulty(enemies.length, diff);

  return {
    index: index,
    difficulty: diff,
    quota: quota,            // P-38：击杀配额（null = Boss 节点禁用递增/配额制）
    aiTier: aiTier,          // P-13：AI 策略复杂度档位（0~2，供未来 AI 分级消费）
    statMult: statMult,      // P-13：数值强度乘数（兼容保留 = entityMults.maxHp）
    entityMults: entityMults, // #76 A：全属性难度乘子表（节点级快照，敌军逐个引用同值）
    difficultyLevel: difficultyLevel,  // P-34：本节点生成时的跨局难度等级（溯源用）
    boss: bossMark ? true : null,      // P-37：周期 Boss 标记（true=待 UI 层指定定义；null=普通节点）
    seed: templateResult.seed,
    w: w,
    h: h,
    template: { id: templateResult.template.id, name: templateResult.template.name },
    biome: templateResult.biome || null,   // P-36/#81：地面主题标签（mvp drawGround 消费）
    covers: templateResult.covers,
    // v2（2026-09-16）：路口中心（已随 covers 一起从 generateNode 局部系平移到世界系）。
    // 渲染层 bakeNodeGroundLayer 据此在路口断开中心虚线，使交叉处读作「路口」。
    roadJunctions: (templateResult.roadJunctions || []).map(j => ({ x: j.x + centerX, y: j.y + centerY, r: j.r })),
    playerSpawn: playerSpawn,
    enemyClusters: enemyClusters,
    enemies: enemies,
    // B 档②/③（2026-09-23）：防线布局（推进轴 x 区间）与出口线——运行时用于「增援只补前方防线」
    // 与推进式完成判定（nodeClearance）。防线制关闭时为空数组。
    defenseLines: defense.enabled ? defense.lines.map(l => ({ x0: l.x0, x1: l.x1 })) : [],
    exitX: w * ((cfg.exitZone && cfg.exitZone.xFraction !== undefined) ? cfg.exitZone.xFraction : 0.93),
    outpost: outpost,
    cleared: false
  };
}

// 点是否落在任一掩体内（考虑旋转与多边形 verts；padding 外扩）。
// box 掩体：将点旋转到掩体局部坐标系后做半轴比较；
// 带 verts/collisionVerts 的多边形掩体：点旋转到局部后做"点在多边形内"判定，
// 并以到各边距离做 padding 缓冲。纯函数、确定性、无外部依赖。
function pointInCover(covers, x, y, padding) {
  for (const c of covers) {
    if (c.verts || c.collisionVerts) {
      if (pointInCoverPoly(c, x, y, padding)) return true;
    } else {
      const dx = x - c.x, dy = y - c.y;
      const ang = -(c.angle || 0);
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const lx = dx * ca - dy * sa;
      const ly = dx * sa + dy * ca;
      if (Math.abs(lx) <= (c.w || 0) / 2 + padding && Math.abs(ly) <= (c.h || 0) / 2 + padding) return true;
    }
  }
  return false;
}

// 多边形掩体命中测试（局部坐标 verts / collisionVerts；含 padding 边距缓冲）
function pointInCoverPoly(c, x, y, padding) {
  const vs = c.verts || c.collisionVerts;
  if (!vs || vs.length < 3) {
    const dx = x - c.x, dy = y - c.y;
    const ang = -(c.angle || 0);
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const lx = dx * ca - dy * sa, ly = dx * sa + dy * ca;
    return Math.abs(lx) <= (c.w || 0) / 2 + padding && Math.abs(ly) <= (c.h || 0) / 2 + padding;
  }
  const dx = x - c.x, dy = y - c.y;
  const ang = -(c.angle || 0);
  const ca = Math.cos(ang), sa = Math.sin(ang);
  const lx = dx * ca - dy * sa, ly = dx * sa + dy * ca;
  let inside = false;
  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    const xi = vs[i][0], yi = vs[i][1], xj = vs[j][0], yj = vs[j][1];
    if (((yi > ly) !== (yj > ly)) && (lx < (xj - xi) * (ly - yi) / (yj - yi) + xi)) inside = !inside;
  }
  if (inside) return true;
  if (padding > 0) {
    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
      if (segDist(lx, ly, vs[i][0], vs[i][1], vs[j][0], vs[j][1]) <= padding) return true;
    }
  }
  return false;
}

// 点到线段最短距离（多边形边距缓冲用）
function segDist(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay;
  const wx = px - ax, wy = py - ay;
  const len2 = vx * vx + vy * vy;
  let t = len2 > 0 ? (wx * vx + wy * vy) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = ax + t * vx, cy = ay + t * vy;
  return Math.hypot(px - cx, py - cy);
}

/**
 * 为玩家出生点确定性选址：返回 covers 包围盒（含 padding）外、节点边界内、
 * 且尽量贴近默认左缘点 (0.10w, h/2) 的合法点。
 * 仅使用传入的 rng（禁止 Math.random），以保证整局确定性。
 * @param {Array} covers 世界坐标掩体列表（含水域 tier）
 * @param {number} w 节点世界宽
 * @param {number} h 节点世界高
 * @param {any} rng createRNG 实例
 * @param {number} margin 与掩体/边界的最小间距
 * @returns {{x:number, y:number}}
 */
function findPlayerSpawn(covers, w, h, rng, margin) {
  const origX = w * 0.10, origY = h / 2;
  const loX = margin, hiX = w - margin;
  const loY = margin, hiY = h - margin;

  // 代价：优先保留左缘意图——横向外移（增大 x）加权更重，纵向贴近中线。
  const cost = (x, y) => {
    const dx = (x - origX) * 1.5;
    const dy = y - origY;
    return dx * dx + dy * dy;
  };
  const clamp = (x, y) => ({
    x: Math.max(loX, Math.min(hiX, x)),
    y: Math.max(loY, Math.min(hiY, y))
  });

  let best = null, bestCost = Infinity;
  const consider = (x, y) => {
    const p = clamp(x, y);
    if (pointInCover(covers, p.x, p.y, margin)) return;
    const c = cost(p.x, p.y);
    if (c < bestCost) { bestCost = c; best = p; }
  };

  // 系统 nudges（确定性，不耗 rng）：
  // 保持中线、x 向右内推 0.10w → 0.20w；
  for (let i = 1; i <= 16; i++) consider(origX + i * 0.00625 * w, origY);
  // 保持左缘、y 在 [0.12h, 0.88h] 上下移动；
  for (let i = 1; i <= 32; i++) consider(origX, loY + (hiY - loY) * (i / 33));

  // rng 驱动候选：左缘偏向区域 [0.10w, 0.30w]×[margin, h-margin] 确定性采样，
  // 与系统 nudges 一并取代价最小的合法点（保持就近 + 确定性）。
  for (let i = 0; i < 60; i++) {
    consider(rng.range(w * 0.10, w * 0.30), rng.range(loY, hiY));
  }
  if (best) return best;

  // 绝对兜底：把出生点沿"掩体中心→默认点"向量径向推出违规掩体外缘，
  // 若仍被阻挡则继续沿该方向外推，直到清空（受步数限制）；最后钳制到边界内。
  let offending = null;
  for (const c of covers) {
    const halfW = c.w / 2 + margin, halfH = c.h / 2 + margin;
    if (Math.abs(origX - c.x) <= halfW && Math.abs(origY - c.y) <= halfH) { offending = c; break; }
  }
  if (offending) {
    let vx = origX - offending.x, vy = origY - offending.y;
    const len0 = Math.hypot(vx, vy);
    if (len0 < 1e-6) { vx = -1; vy = 0; } else { vx /= len0; vy /= len0; }
    const reachX = offending.w / 2 + margin + 5;
    const reachY = offending.h / 2 + margin + 5;
    const tX = vx !== 0 ? reachX / Math.abs(vx) : Infinity;
    const tY = vy !== 0 ? reachY / Math.abs(vy) : Infinity;
    let t = Math.max(tX, tY);
    const stepInc = offending.w * 0.25 + offending.h * 0.25 + margin;
    for (let step = 0; step < 64; step++) {
      const p = clamp(offending.x + vx * t, offending.y + vy * t);
      if (!pointInCover(covers, p.x, p.y, margin)) return p;
      t += stepInc;
    }
  }
  // 极端兜底：左缘中点（即便仍可能被极少极端布局阻挡，至少保证在界内）。
  return clamp(origX, origY);
}

/**
 * 生成一局：线性节点链（开放式链的初始段）。
 * @param {number|string} [seed] 整局确定性种子；缺省随机
 * @param {number} [count] 初始节点数（缺省 RULES.nodeMap.runNodeCount 或 5，上限 12；
 *   开放式链下后续经 extendRun 无限追加）
 * @param {any} [env] 环境注入：{ viewport: { vw, vh }, difficultyLevel: number }；
 *   env 会存入返回值 run.env 供 extendRun 复用（保持确定性续接）
 * @returns {{ nodes: any[], seed: number|string, env: any, difficultyLevel: number }}
 */
function generateRun(seed, count, env) {
  const cfg = nodeConfig();
  const nodeCount = Math.max(1, Math.min(12, count || cfg.runNodeCount || 5));
  const s = seed !== undefined ? seed : Math.floor(Math.random() * 1000000);
  const rng = createRNG(s);
  const nodes = [];
  for (let i = 0; i < nodeCount; i++) {
    nodes.push(makeNode(i, rng, env));
  }
  const difficultyLevel = (env && Number.isFinite(env.difficultyLevel)) ? env.difficultyLevel : 0;
  return { nodes: nodes, seed: s, env: env || null, difficultyLevel: difficultyLevel };
}

/**
 * 开放式节点链追加（P-34）：以 run 现有长度为下一节点索引追加生成一个节点并推入 run.nodes。
 * 确定性保证：从 run.seed 重放既有节点消耗的 rng 流（逐个重算前序节点、丢弃结果），
 * 再生成新节点 —— 同 seed 同 env 下 extendRun 结果与"一次性生成长链"完全一致。
 * 难度按新索引走饱和曲线并叠加 run.difficultyLevel（env.difficultyLevel）；
 * Boss 周期标记沿用 P-37 规则。
 * @param {any} run generateRun 产出（会被就地修改 nodes）
 * @param {any} [envOverride] 可选覆盖 env（缺省复用 run.env）
 * @returns {any} 新追加的节点
 */
function extendRun(run, envOverride) {
  if (!run || !Array.isArray(run.nodes)) return null;
  const e = (envOverride !== undefined) ? envOverride : (run.env || null);
  const rng = createRNG(run.seed);
  for (let i = 0; i < run.nodes.length; i++) {
    makeNode(i, rng, e);          // 重放 rng 流（丢弃结果）
  }
  const next = makeNode(run.nodes.length, rng, e);
  run.env = e;
  run.difficultyLevel = (e && Number.isFinite(e.difficultyLevel)) ? e.difficultyLevel : 0;
  run.nodes.push(next);
  return next;
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

// ---------- 敌方进度推进：镜头外递增生成（P-38） ----------

/**
 * 递增生成节奏 tick（纯逻辑，Node 可测）：常规节点内按配额/存量/节奏决定本帧是否补兵。
 *
 * 触发条件（全部满足才产出）：
 *   - quota 有效且 killedThisNode < quota（配额未满；quota=null/≤0 = Boss 节点，禁用）；
 *   - alive < desiredAlive = min(maxAlive, ceil(initialCount×desiredAliveRatio) + floor(effDiff×3))；
 *   - alive < maxAlive（场上封顶）；
 *   - timer ≥ reinforceInterval 秒（距上次生成间隔）；
 *   - 预算 budget = min(quota − killed − alive, maxAlive − alive) > 0，本批生成
 *     n = min(1~2[rng 决定], budget) 个。
 *
 * 落点约束（拒绝采样，仅消耗注入 rng、确定性）：
 *   - 视口 AABB 外扩 reinforceMargin(120px) 之外（玩家不可见刷兵）；
 *   - 世界边界 [margin, w−margin]×[margin, h−margin] 内；
 *   - 距玩家当前位置 ≥ aiTriggerDist×1.05（与开局敌军生成同规则）；
 *   - 距友军据点 ≥ reinforceOutpostDist(300px)；
 *   - 避开 solid 掩体（pointInCover padding=60 拒绝）。每目标最多尝试 60 次，
 *     极端布局（视口外扩覆盖全域等）下可能凑不齐——返回实际可行的子集或空数组。
 *
 * @param {any} state { alive, killedThisNode, quota, effDiff, initialCount,
 *   playerPos:{x,y}, viewBounds:{minX,minY,maxX,maxY}, worldSize:{w,h},
 *   covers?, outpostPos?, rng(createRNG 实例), timer, aiTriggerDist?, aiTier?,
 *   statMult?, entityMults?, tankPool? }
 * @returns {Array} spawn spec 数组（字段与 makeNode 敌军条目兼容 + reinforcement:true），空数组 = 本帧不生成
 */
function reinforcementTick(state) {
  const out = [];
  const cfg = nodeConfig();
  const s = state || {};
  // Boss 节点 / 无配额：递增生成禁用（summons 即 Boss 战机制）
  if (!Number.isFinite(s.quota) || s.quota <= 0) return out;
  if (!s.rng || !s.playerPos || !s.viewBounds || !s.worldSize) return out;
  const killed = Math.max(0, s.killedThisNode | 0);
  if (killed >= s.quota) return out;                       // 配额已满 → 节点应已结束
  const alive = Math.max(0, s.alive | 0);
  const maxAlive = cfg.maxAlive !== undefined ? cfg.maxAlive : 7;
  if (alive >= maxAlive) return out;                       // 场上封顶
  const initial = Number.isFinite(s.initialCount) ? Math.max(1, s.initialCount) : Math.max(1, alive + killed);
  const ratio = cfg.desiredAliveRatio !== undefined ? cfg.desiredAliveRatio : 0.6;
  const effDiff = Math.max(0, Number.isFinite(s.effDiff) ? s.effDiff : 0);
  const desired = Math.min(maxAlive, Math.ceil(initial * ratio) + Math.floor(effDiff * 3));
  if (alive >= desired) return out;                        // 存量仍达标 → 不补兵
  const interval = cfg.reinforceInterval !== undefined ? cfg.reinforceInterval : 8;
  if ((Number.isFinite(s.timer) ? s.timer : 0) < interval) return out;   // 节奏未到

  const w = s.worldSize.w, h = s.worldSize.h;
  if (!(w > 0) || !(h > 0)) return out;
  const margin = cfg.reinforceMargin !== undefined ? cfg.reinforceMargin : 120;
  const vb = s.viewBounds;
  const trig = (Number.isFinite(s.aiTriggerDist) && s.aiTriggerDist > 0)
    ? s.aiTriggerDist : triggerDistForDifficulty(effDiff);
  const minPlayerDist = trig * 1.05;
  const outpostDist = cfg.reinforceOutpostDist !== undefined ? cfg.reinforceOutpostDist : 300;
  const covers = Array.isArray(s.covers) ? s.covers : [];
  const pool = (Array.isArray(s.tankPool) && s.tankPool.length) ? s.tankPool : ['dummy'];

  // B 档②（2026-09-23）：增援只补玩家**前方**的防线——候选 x 区间限定为「x1 > 玩家 x」的防线桶
  // （沿推进轴由近至远累积；旧口径为全图随机，会把兵刷在玩家身后）。玩家已越过全部防线
  // （或调用方未提供 defenseLines / 显式关闭 reinforceFrontOnly）时按旧全向行为。
  const frontRanges = [];
  if (cfg.reinforceFrontOnly !== false && Array.isArray(s.defenseLines) && s.defenseLines.length) {
    for (const line of s.defenseLines) {
      if (!line || !Number.isFinite(line.x0) || !Number.isFinite(line.x1)) continue;
      if (line.x1 <= s.playerPos.x) continue;               // 玩家已越过该防线
      const rx0 = Math.max(margin, line.x0 - 60);
      const rx1 = Math.min(w - margin, line.x1 + 60);
      if (rx1 > rx0) frontRanges.push([rx0, rx1]);
    }
    if (!frontRanges.length) return out;                    // 已推进到全部防线前方尽头 → 不再增援
  }

  let n = Math.min(2, s.quota - killed - alive, maxAlive - alive);   // 预算钳制
  if (n <= 0) return out;
  n = Math.min(n, s.rng.int(1, 2));                                  // 每次生成 1~2 个（rng 确定性）

  for (let i = 0; i < n; i++) {
    for (let tries = 0; tries < 60; tries++) {
      // B 档②：有前方防线区间时在其中随机取（先选区间再取 x，rng 消耗序列固定、确定性不变）
      let x;
      if (frontRanges.length) {
        const fr = frontRanges[s.rng.int(0, frontRanges.length - 1)];
        x = s.rng.range(fr[0], fr[1]);
      } else {
        x = s.rng.range(margin, w - margin);
      }
      const y = s.rng.range(margin, h - margin);
      if (x >= vb.minX - margin && x <= vb.maxX + margin &&
          y >= vb.minY - margin && y <= vb.maxY + margin) continue;  // 视口外扩区内拒绝
      if (Math.hypot(x - s.playerPos.x, y - s.playerPos.y) < minPlayerDist) continue;
      if (s.outpostPos && Math.hypot(x - s.outpostPos.x, y - s.outpostPos.y) < outpostDist) continue;
      if (pointInCover(covers, x, y, 60)) continue;                  // solid 掩体拒绝
      const ang = Math.atan2(s.playerPos.y - y, s.playerPos.x - x);  // 朝向玩家（配合 spawn 后立即警觉）
      out.push({
        reinforcement: true,
        tankId: s.rng.choice(pool),
        x: Math.round(x), y: Math.round(y),
        hullAngle: ang, turretAngle: ang,
        heightClass: (effDiff > 0.6 || s.rng() < 0.35) ? 'heavy' : 'medium',
        statMult: s.statMult,
        entityMults: s.entityMults || null,
        aiTier: Number.isFinite(s.aiTier) ? s.aiTier : 0
      });
      break;
    }
  }
  return out;
}

/**
 * 推进式节点完成判定（B 档③，2026-09-23）。纯逻辑，供 mvp 逐帧消费、可 Node 测试。
 * 常规节点：**抵达右端出口 +（防线清空 或 配额达成）**双条件——取代旧「击杀数 ≥ 配额」单条件
 * （旧口径与推进正交：玩家原地不动刷够配额即通关）。
 * Boss 节点：沿用「Boss + summons 全灭」（无配额、不增援），不要求出口。
 * @param {any} s { playerX, nodeW, exitX?, alive, quota, kills, canReinforce?, boss? }
 * @returns {{ exitReached:boolean, linesCleared:boolean, quotaDone:boolean, done:boolean, reason:string }}
 */
function nodeClearance(s) {
  const st = s || {};
  const cfg = nodeConfig();
  const alive = Math.max(0, st.alive | 0);
  if (st.boss) {
    const cleared = alive === 0;
    return { exitReached: false, linesCleared: cleared, quotaDone: false, done: cleared,
      reason: cleared ? 'boss-cleared' : 'boss' };
  }
  const elemCfg = cfg.exitZone || {};
  const exitFrac = elemCfg.xFraction !== undefined ? elemCfg.xFraction : 0.93;
  const nodeW = Number.isFinite(st.nodeW) ? st.nodeW : 0;
  const exitX = Number.isFinite(st.exitX) ? st.exitX : nodeW * exitFrac;
  const exitReached = nodeW > 0 && Number.isFinite(st.playerX) && st.playerX >= exitX;
  const kills = Math.max(0, st.kills | 0);
  const quota = Number.isFinite(st.quota) ? st.quota : 0;
  const quotaDone = quota > 0 && kills >= quota;
  const linesCleared = alive === 0 && !st.canReinforce;      // 场上清空且已无法增援
  const done = exitReached && (linesCleared || quotaDone);
  let reason = '';
  if (done) reason = linesCleared ? 'exit+cleared' : 'exit+quota';
  else if (!exitReached) reason = alive > 0 ? 'pushing' : 'advance';
  else reason = 'clearing';
  return { exitReached: exitReached, linesCleared: linesCleared, quotaDone: quotaDone, done: done, reason: reason };
}

/**
 * 「本节点是否还可能产生增援」——**必须与 reinforcementTick 的落点门控同源**（B 档②/③，2026-09-23）。
 * 动机（已核实的软锁）：tick 在「玩家越过全部防线」（frontRanges 为空）时不再增援，而 mvp 侧
 * `canReinforce` 若仍只按 `kills < quota` 计算，则玩家冲过全部防线后清光残敌、但配额未达时
 * `linesCleared` 恒假（canReinforce 为真）且不会再有敌人 ⇒ 节点永久无法完成。
 * @param {any} node 节点（含 quota / boss / defenseLines）
 * @param {number} playerX 玩家推进轴坐标
 * @param {number} kills 本节点已击杀数
 * @returns {boolean}
 */
function reinforcementPossible(node, playerX, kills) {
  const cfg = nodeConfig();
  if (!node || node.boss) return false;
  const quota = Number.isFinite(node.quota) ? node.quota : 0;
  if (!(quota > 0)) return false;
  if (Math.max(0, kills | 0) >= quota) return false;              // 配额已满 ⇒ 不再增援
  const lines = Array.isArray(node.defenseLines) ? node.defenseLines : [];
  if (cfg.reinforceFrontOnly !== false && lines.length) {
    const px = Number.isFinite(playerX) ? playerX : 0;
    return lines.some(l => l && Number.isFinite(l.x1) && l.x1 > px);   // 仍有前方防线
  }
  return true;
}

// ---------- 节点实体化（注入浏览器全局） ----------

/**
 * 把节点数据实体化进运行环境。env 显式注入，浏览器侧传全局引用：
 *   env.setCovers(coversList)        —— 替换全局 covers 并快照（浏览器：清空+push+snapshotCovers）
 *   env.clearEntities(keepIds)       —— 移除保留 id 之外的实体（浏览器：entities filter）
 *   env.spawnTank(spec)              —— 生成实体（浏览器：spawnTank 全局；spec 含 id/team/x/y/hullAngle/turretAngle/heightClass）
 *   env.configureTank(tank, tankId)  —— 应用坦克配置（浏览器：applyTankConfig+resetEntity；测试可 no-op）
 *   env.applyDifficulty(tank, mults) —— 应用难度乘子表（#76 A：敌军全属性随 effDiff 插值叠乘；
 *      mults = entityMultsForDifficulty 产出；旧 statMult 敌军数据自动降级为三项表；测试可 no-op）
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
    t.aiTriggerDist = triggerDistForDifficulty(node.difficulty);   // AI 触发距离（难度化，生成时算好）
    t.aiTier = (e.aiTier !== undefined) ? e.aiTier : (node.aiTier || 0);   // P-34 C：AI 档位注入实体（#76 消费）
    t.tankClass = e.tankClass || (e.heightClass === 'heavy' ? 'heavy' : 'medium');  // P-46：类别注入（浏览器 configureTank 可再覆盖 json class）
    if (typeof env.configureTank === 'function') env.configureTank(t, e.tankId);
    // #76 A：难度乘子应用点集中于此（敌军专属，玩家/据点不走此路径）。
    // 新数据带 entityMults 全表；旧 statMult 数据降级为 P-13 三项表，行为向后兼容。
    const mults = e.entityMults ||
      ((e.statMult && e.statMult !== 1)
        ? { maxHp: e.statMult, penetration: e.statMult, damage: e.statMult }
        : null);
    if (mults && typeof env.applyDifficulty === 'function') env.applyDifficulty(t, mults);
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
    isBossNodeIndex,
    enemyCompositionForDepth,
    enemyCountForDifficulty,
    aiTierForDifficulty,
    statMultForDifficulty,
    entityMultsForDifficulty,
    triggerDistForDifficulty,
    nodeScaleFor,
    quotaForDifficulty,
    planDefenseLines,
    defenseLineConfig,
    nodeClearance,
    reinforcementPossible,
    reinforcementTick,
    makeNode,
    generateRun,
    extendRun,
    scoreNode,
    materializeNode
  };
}
