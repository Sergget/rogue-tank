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
 * 参数收口 RULES.difficulty（curveStart 0.15 / curveSpan 0.8 / curvePow 1.25 /
 * diffSatIndex 12 / curveCap 0.95 / crossRunLevelBonus 0.04 / diffMax 1.15）。
 * 数值定表说明：index=12 处基础难度封顶 0.95（约等于旧 5 节点链末段强度），
 * 每次终局 difficultyLevel+1 使下一局同索引难度 +0.04，封顶 1.15（敌数/杠杆公式对 >1
 * 的 diff 已有钳制，仅 statMult 触顶 1.5）。
 * @param {number} index 节点索引（0 起）
 * @param {number} [difficultyLevel] 跨局难度等级（profile.difficultyLevel，缺省 0）
 * @returns {number} 有效难度（0~1.15）
 */
function difficultyForIndex(index, difficultyLevel) {
  const cfg = difficultyConfig() || {
    curveStart: 0.15, curveSpan: 0.8, curvePow: 1.25,
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

// Boss 节点判定（P-37）：每第 bossInterval 个节点为 Boss 节点（(index+1) % interval === 0 → index 4/9/14…）。
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
    maxHp: [1, 1.6], penetration: [1, 1.5], damage: [1, 1.4], armorAll: [1, 1.45],
    reload: [1, 0.82], spreadMult: [1, 0.78], aimSpeed: [1, 1.35],
    maxSpeed: [1, 1.18], turnRate: [1, 1.22], turretTurnRate: [1, 1.3]
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

  // 敌军构成：散布在右 2/3 区域，拒绝采样避开掩体/互相重叠/贴近玩家出生点
  const enemyCount = enemyCountForDifficulty(diff);
  const enemies = [];
  let guard = 0;
  while (enemies.length < enemyCount && guard++ < 400) {
    let ex = rng.range(w * 0.35, w * 0.92);
    let ey = rng.range(h * 0.12, h * 0.88);
    if (Math.hypot(ex - playerSpawn.x, ey - playerSpawn.y) < minPlayerDist) {
      // 沿径向外推到最小间距；推出敌区则放弃该候选重掷（仅用传入 rng，保持确定性）
      const ang = Math.atan2(ey - playerSpawn.y, ex - playerSpawn.x);
      ex = playerSpawn.x + Math.cos(ang) * minPlayerDist;
      ey = playerSpawn.y + Math.sin(ang) * minPlayerDist;
      if (ex < w * 0.35 || ex > w * 0.92 || ey < h * 0.12 || ey > h * 0.88) continue;
    }
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
      statMult: statMult,           // 兼容保留（= entityMults.maxHp）；#76 A 起以 entityMults 为准
      entityMults: entityMults,     // #76 A：全属性难度乘子表（materializeNode 经 env.applyDifficulty 应用）
      aiTier: aiTier                // P-34 C：AI 档位随敌人数据下发（materializeNode 注入实体 t.aiTier，#76 消费）
    });
  }

  // 兜底补满：随机采样在密集掩体/水域下可能凑不齐 enemyCount（guard<400 上限），
  // 改用确定性网格扫描，按"最小净空"挑选，保证节点敌军数符合难度构成。
  if (enemies.length < enemyCount) {
    const minDist = cfg.enemyMinDist || 150;
    const step = Math.max(20, minDist * 0.7);
    const cands = [];
    for (let gx = w * 0.35; gx <= w * 0.92; gx += step) {
      for (let gy = h * 0.12; gy <= h * 0.88; gy += step) {
        if (Math.hypot(gx - playerSpawn.x, gy - playerSpawn.y) < minPlayerDist) continue;
        let ok = true;
        for (const e of enemies) {
          if (Math.hypot(gx - e.x, gy - e.y) < minDist) { ok = false; break; }
        }
        if (!ok) continue;
        if (pointInCover(templateResult.covers, gx, gy, 60)) continue;
        let clear = Math.hypot(gx - playerSpawn.x, gy - playerSpawn.y) - minPlayerDist;
        for (const e of enemies) clear = Math.min(clear, Math.hypot(gx - e.x, gy - e.y) - minDist);
        cands.push({ x: gx, y: gy, clear });
      }
    }
    cands.sort((a, b) => b.clear - a.clear);
    for (const c of cands) {
      if (enemies.length >= enemyCount) break;
      let ok = true;
      for (const e of enemies) {
        if (Math.hypot(c.x - e.x, c.y - e.y) < minDist) { ok = false; break; }
      }
      if (!ok) continue;
      enemies.push({
        tankId: rng.choice(cfg.enemyTankPool && cfg.enemyTankPool.length ? cfg.enemyTankPool : ['dummy']),
        x: Math.round(c.x), y: Math.round(c.y),
        hullAngle: Math.atan2(playerSpawn.y - c.y, playerSpawn.x - c.x),
        turretAngle: Math.atan2(playerSpawn.y - c.y, playerSpawn.x - c.x),
        heightClass: (diff > 0.6 || rng() < 0.35) ? 'heavy' : 'medium',
        statMult: statMult,
        entityMults: entityMults,    // #76 A：兜底补满路径同样带全属性乘子表
        aiTier: aiTier               // P-34 C：兜底补满路径同样带档位
      });
    }
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

  // P-37：Boss 节点周期标记 —— 每第 bossInterval 个节点为 Boss 战（index 4/9/14…）。
  // 预标 node.boss=true 并清空常规敌人（沿用原链尾 Boss 处理：Boss 战不混普通敌军）；
  // Boss 具体定义（name/loot/summons）由 UI 层进入战斗时从 Boss 池懒指定（保持本模块零 IO）。
  const bossMark = isBossNodeIndex(index);
  if (bossMark) enemies.length = 0;

  return {
    index: index,
    difficulty: diff,
    aiTier: aiTier,          // P-13：AI 策略复杂度档位（0~2，供未来 AI 分级消费）
    statMult: statMult,      // P-13：数值强度乘数（兼容保留 = entityMults.maxHp）
    entityMults: entityMults, // #76 A：全属性难度乘子表（节点级快照，敌军逐个引用同值）
    difficultyLevel: difficultyLevel,  // P-34：本节点生成时的跨局难度等级（溯源用）
    boss: bossMark ? true : null,      // P-37：周期 Boss 标记（true=待 UI 层指定定义；null=普通节点）
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
    enemyCountForDifficulty,
    aiTierForDifficulty,
    statMultForDifficulty,
    entityMultsForDifficulty,
    triggerDistForDifficulty,
    nodeScaleFor,
    makeNode,
    generateRun,
    extendRun,
    scoreNode,
    materializeNode
  };
}
