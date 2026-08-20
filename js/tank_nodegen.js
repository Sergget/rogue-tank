'use strict';

/**
 * Seeded Pseudo-Random Number Generator (Mulberry32)
 */
function hashSeed(seed) {
  if (typeof seed === 'number') return seed >>> 0;
  let str = String(seed);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

function createRNG(seed) {
  let s = hashSeed(seed !== undefined ? seed : Math.random() * 0xffffffff);
  if (s === 0) s = 0x12345678;

  function rng() {
    s |= 0; s = s + 0x6D2B79F5 | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }

  rng.range = function(min, max) { return min + rng() * (max - min); };
  rng.int = function(min, max) { return Math.floor(min + rng() * (max - min + 1)); };
  rng.choice = function(arr) { return arr[Math.floor(rng() * arr.length)]; };

  return rng;
}

/**
 * Handcrafted Battlefield Templates (7 built-in templates)
 * Template Structure:
 * {
 *   id: string,
 *   name: string,
 *   tags: ('low' | 'mid' | 'high')[],
 *   w: number,
 *   h: number,
 *   items: [ { tier, dx, dy, w, h, angle, verts?, collisionVerts? }, ... ]
 * }
 * #25：单模板 items 扩充到 12~25 个（树/灌木/沙袋/栅栏/半高/全高混合），
 * 体现 开阔走廊/密林阵地/城镇街区/交叉火力广场/混合障壁/村落中心/林地战线 的地貌特征。
 */
const NODE_TEMPLATES = [
  {
    id: 'corridor_tutorial',
    name: '开阔走廊 (低难/教学)',
    tags: ['low'],
    w: 700,
    h: 400,
    items: [
      // 左右两侧半高矮墙构成纵向走廊骨架
      { tier: 'half', dx: -240, dy: -120, w: 90, h: 30, angle: 0 },
      { tier: 'half', dx: -240, dy: -20, w: 90, h: 30, angle: 0 },
      { tier: 'half', dx: -240, dy: 80, w: 90, h: 30, angle: 0 },
      { tier: 'half', dx: 240, dy: -100, w: 90, h: 30, angle: 0 },
      { tier: 'half', dx: 240, dy: 0, w: 90, h: 30, angle: 0 },
      { tier: 'half', dx: 240, dy: 100, w: 90, h: 30, angle: 0 },
      // 中路横向栅栏与沙袋路障
      { tier: 'soft', dx: 0, dy: -150, w: 160, h: 10, angle: 0 },
      { tier: 'soft', dx: 0, dy: 150, w: 160, h: 10, angle: 0 },
      { tier: 'barricade', dx: -120, dy: 40, w: 60, h: 26, angle: 0 },
      { tier: 'barricade', dx: 120, dy: -60, w: 60, h: 26, angle: 0 },
      // 点缀树丛
      { tier: 'tree', dx: -120, dy: -140, w: 24, h: 18, angle: 0 },
      { tier: 'bush', dx: 140, dy: 120, w: 70, h: 36, angle: 0 },
      { tier: 'bush', dx: -40, dy: 60, w: 60, h: 32, angle: 0 }
    ]
  },
  {
    id: 'forest_dense',
    name: '密林阵地',
    tags: ['low', 'mid'],
    w: 750,
    h: 450,
    items: [
      // 纵深树墙：左密右疏，间杂灌木/树桩/倒树
      { tier: 'tree', dx: -280, dy: -140, w: 24, h: 18, angle: 0 },
      { tier: 'tree', dx: -230, dy: -60, w: 24, h: 18, angle: 0 },
      { tier: 'tree', dx: -260, dy: 40, w: 24, h: 18, angle: 0 },
      { tier: 'tree', dx: -200, dy: 130, w: 24, h: 18, angle: 0 },
      { tier: 'tree', dx: -120, dy: -160, w: 24, h: 18, angle: 0 },
      { tier: 'tree', dx: -80, dy: 90, w: 24, h: 18, angle: 0 },
      { tier: 'tree', dx: 0, dy: -80, w: 24, h: 18, angle: 0 },
      { tier: 'tree', dx: 60, dy: 150, w: 24, h: 18, angle: 0 },
      { tier: 'tree', dx: 120, dy: -150, w: 24, h: 18, angle: 0 },
      { tier: 'tree', dx: 180, dy: -40, w: 24, h: 18, angle: 0 },
      { tier: 'tree', dx: 230, dy: 80, w: 24, h: 18, angle: 0 },
      { tier: 'tree', dx: 290, dy: 140, w: 24, h: 18, angle: 0 },
      { tier: 'bush', dx: -180, dy: -10, w: 70, h: 36, angle: 0 },
      { tier: 'bush', dx: 40, dy: 30, w: 70, h: 36, angle: 0 },
      { tier: 'bush', dx: 160, dy: 140, w: 60, h: 32, angle: 0 },
      { tier: 'stump', dx: -40, dy: -140, w: 24, h: 18, angle: 0 },
      { tier: 'half', dx: -60, dy: 150, w: 64, h: 30, angle: 0 },
      { tier: 'soft', dx: 0, dy: -150, w: 120, h: 10, angle: 0 }
    ]
  },
  {
    id: 'urban_block',
    name: '城镇街区',
    tags: ['mid', 'high'],
    w: 800,
    h: 500,
    items: [
      // 四座建筑骨架 + 一座带凹口立面（verts/collisionVerts 保序剔除下结构不被改写）
      { tier: 'full', dx: -260, dy: -120, w: 110, h: 60, angle: 0 },
      { tier: 'full', dx: 260, dy: -120, w: 110, h: 60, angle: 0 },
      { tier: 'full', dx: -260, dy: 120, w: 110, h: 60, angle: 0 },
      {
        tier: 'full',
        dx: 180,
        dy: 120,
        w: 110,
        h: 70,
        angle: 0,
        verts: [[-55, -35], [55, -35], [55, -15], [10, -15], [10, 35], [-55, 35]],
        collisionVerts: [
          [[-55, -35], [10, -35], [10, 35], [-55, 35]],
          [[10, -35], [55, -35], [55, -15], [10, -15]]
        ]
      },
      // 街口矮墙与路障
      { tier: 'half', dx: -120, dy: -120, w: 80, h: 32, angle: 0 },
      { tier: 'half', dx: 120, dy: -120, w: 80, h: 32, angle: 0 },
      { tier: 'barricade', dx: 0, dy: -120, w: 70, h: 28, angle: 0 },
      { tier: 'barricade', dx: -80, dy: 20, w: 64, h: 28, angle: 0 },
      { tier: 'barricade', dx: 80, dy: 20, w: 64, h: 28, angle: 0 },
      { tier: 'rubble', dx: -160, dy: 20, w: 30, h: 20, angle: 0 },
      { tier: 'rubble', dx: 160, dy: 20, w: 30, h: 20, angle: 0 },
      // 庭院栅栏与绿植
      { tier: 'soft', dx: -180, dy: -30, w: 120, h: 10, angle: 0 },
      { tier: 'soft', dx: 60, dy: -60, w: 100, h: 10, angle: 0 },
      { tier: 'tree', dx: -60, dy: 60, w: 24, h: 18, angle: 0 },
      { tier: 'tree', dx: 40, dy: 100, w: 24, h: 18, angle: 0 },
      { tier: 'bush', dx: -100, dy: 80, w: 60, h: 32, angle: 0 },
      { tier: 'bush', dx: 120, dy: 60, w: 60, h: 32, angle: 0 }
    ]
  },
  {
    id: 'crossfire_plaza',
    name: '交叉火力广场 (高难)',
    tags: ['high'],
    w: 850,
    h: 520,
    items: [
      // 四角全高建筑形成交叉火力框架
      { tier: 'full', dx: -300, dy: -160, w: 120, h: 64, angle: 0 },
      { tier: 'full', dx: 300, dy: -160, w: 120, h: 64, angle: 0 },
      { tier: 'full', dx: -300, dy: 160, w: 120, h: 64, angle: 0 },
      { tier: 'full', dx: 300, dy: 160, w: 120, h: 64, angle: 0 },
      // 中央高台 + 侧翼路障 + 废墟
      { tier: 'half', dx: 0, dy: 0, w: 90, h: 38, angle: 0 },
      { tier: 'half', dx: 0, dy: -100, w: 70, h: 30, angle: 0 },
      { tier: 'barricade', dx: -140, dy: 0, w: 64, h: 28, angle: 0 },
      { tier: 'barricade', dx: 140, dy: 0, w: 64, h: 28, angle: 0 },
      { tier: 'barricade', dx: 0, dy: 100, w: 64, h: 28, angle: 0 },
      { tier: 'rubble', dx: -220, dy: 0, w: 34, h: 22, angle: 0 },
      { tier: 'rubble', dx: 220, dy: 0, w: 34, h: 22, angle: 0 },
      // 广场边缘树丛
      { tier: 'tree', dx: -180, dy: -140, w: 24, h: 18, angle: 0 },
      { tier: 'tree', dx: 180, dy: 140, w: 24, h: 18, angle: 0 },
      { tier: 'tree', dx: -80, dy: 140, w: 24, h: 18, angle: 0 },
      { tier: 'bush', dx: 80, dy: -140, w: 64, h: 32, angle: 0 },
      { tier: 'bush', dx: 0, dy: 180, w: 64, h: 32, angle: 0 }
    ]
  },
  {
    id: 'mixed_barrier_plaza',
    name: '混合障壁广场',
    tags: ['low', 'mid', 'high'],
    w: 800,
    h: 480,
    items: [
      // 四象限全高/半高对位 + 中央沙袋环
      { tier: 'full', dx: -200, dy: -100, w: 80, h: 40, angle: 0 },
      { tier: 'full', dx: 200, dy: -100, w: 80, h: 40, angle: 0 },
      { tier: 'half', dx: -200, dy: 100, w: 80, h: 34, angle: 0 },
      { tier: 'half', dx: 200, dy: 100, w: 80, h: 34, angle: 0 },
      { tier: 'half', dx: 0, dy: 0, w: 90, h: 36, angle: 0 },
      { tier: 'barricade', dx: -100, dy: 0, w: 64, h: 28, angle: 0 },
      { tier: 'barricade', dx: 100, dy: 0, w: 64, h: 28, angle: 0 },
      // 上下栅栏 + 树/灌/桩点缀
      { tier: 'soft', dx: 0, dy: -140, w: 160, h: 10, angle: 0 },
      { tier: 'soft', dx: 0, dy: 140, w: 160, h: 10, angle: 0 },
      { tier: 'tree', dx: -280, dy: 0, w: 24, h: 18, angle: 0 },
      { tier: 'tree', dx: 280, dy: 0, w: 24, h: 18, angle: 0 },
      { tier: 'bush', dx: -60, dy: -100, w: 60, h: 32, angle: 0 },
      { tier: 'bush', dx: 60, dy: 100, w: 60, h: 32, angle: 0 },
      { tier: 'stump', dx: 0, dy: -140, w: 24, h: 18, angle: 0 }
    ]
  },
  {
    id: 'village_center',
    name: '村落中心广场 (高难)',
    tags: ['mid', 'high'],
    w: 820,
    h: 500,
    items: [
      // 环形屋舍围出村落中心广场（#25 新增）
      { tier: 'full', dx: -260, dy: -140, w: 110, h: 60, angle: 0 },
      { tier: 'full', dx: 260, dy: -140, w: 110, h: 60, angle: 0 },
      { tier: 'full', dx: -260, dy: 140, w: 110, h: 60, angle: 0 },
      {
        tier: 'full',
        dx: 260,
        dy: 140,
        w: 100,
        h: 64,
        angle: 0,
        verts: [[-50, -32], [50, -32], [50, -12], [8, -12], [8, 32], [-50, 32]],
        collisionVerts: [
          [[-50, -32], [8, -32], [8, 32], [-50, 32]],
          [[8, -32], [50, -32], [50, -12], [8, -12]]
        ]
      },
      { tier: 'full', dx: 0, dy: -170, w: 90, h: 46, angle: 0 },
      // 广场中央：井台半高 + 沙袋封锁
      { tier: 'half', dx: 0, dy: 0, w: 80, h: 36, angle: 0 },
      { tier: 'barricade', dx: -120, dy: 0, w: 64, h: 28, angle: 0 },
      { tier: 'barricade', dx: 120, dy: 0, w: 64, h: 28, angle: 0 },
      { tier: 'barricade', dx: 0, dy: 90, w: 64, h: 28, angle: 0 },
      // 庭院栅栏与巷口
      { tier: 'soft', dx: -180, dy: 60, w: 140, h: 10, angle: 0 },
      { tier: 'soft', dx: 180, dy: 60, w: 140, h: 10, angle: 0 },
      { tier: 'soft', dx: -60, dy: -90, w: 120, h: 10, angle: 0 },
      { tier: 'soft', dx: 60, dy: -90, w: 120, h: 10, angle: 0 },
      // 村落绿植与废墟
      { tier: 'tree', dx: -140, dy: -140, w: 24, h: 18, angle: 0 },
      { tier: 'tree', dx: 140, dy: 140, w: 24, h: 18, angle: 0 },
      { tier: 'bush', dx: -80, dy: 100, w: 60, h: 32, angle: 0 },
      { tier: 'rubble', dx: 0, dy: -60, w: 30, h: 20, angle: 0 }
    ]
  },
  {
    id: 'woodland_line',
    name: '林地战线 (高难)',
    tags: ['high'],
    w: 860,
    h: 520,
    items: [
      // 森林战线：纵深树墙 + 战壕矮墙（#25 新增）
      { tier: 'tree', dx: -330, dy: -160, w: 24, h: 18, angle: 0 },
      { tier: 'tree', dx: -290, dy: -60, w: 24, h: 18, angle: 0 },
      { tier: 'tree', dx: -320, dy: 40, w: 24, h: 18, angle: 0 },
      { tier: 'tree', dx: -260, dy: 140, w: 24, h: 18, angle: 0 },
      { tier: 'tree', dx: -180, dy: -170, w: 24, h: 18, angle: 0 },
      { tier: 'tree', dx: -150, dy: 60, w: 24, h: 18, angle: 0 },
      { tier: 'tree', dx: -60, dy: -100, w: 24, h: 18, angle: 0 },
      { tier: 'tree', dx: -40, dy: 150, w: 24, h: 18, angle: 0 },
      { tier: 'tree', dx: 60, dy: -160, w: 24, h: 18, angle: 0 },
      { tier: 'tree', dx: 100, dy: -40, w: 24, h: 18, angle: 0 },
      { tier: 'tree', dx: 140, dy: 120, w: 24, h: 18, angle: 0 },
      { tier: 'tree', dx: 230, dy: -140, w: 24, h: 18, angle: 0 },
      { tier: 'tree', dx: 280, dy: -40, w: 24, h: 18, angle: 0 },
      { tier: 'tree', dx: 320, dy: 90, w: 24, h: 18, angle: 0 },
      { tier: 'bush', dx: -220, dy: -20, w: 70, h: 36, angle: 0 },
      { tier: 'bush', dx: 20, dy: 30, w: 70, h: 36, angle: 0 },
      { tier: 'bush', dx: 180, dy: 40, w: 60, h: 32, angle: 0 },
      { tier: 'stump', dx: -90, dy: -10, w: 24, h: 18, angle: 0 },
      { tier: 'fallen', dx: 60, dy: 160, w: 90, h: 14, angle: 0 },
      { tier: 'half', dx: 0, dy: 0, w: 90, h: 34, angle: 0 }
    ]
  }
];

const customTemplates = [];

function registerTemplate(template) {
  if (!template || !template.id || !template.items) {
    throw new Error('Invalid template structure');
  }
  customTemplates.push(template);
}

function getTemplates() {
  return NODE_TEMPLATES.concat(customTemplates);
}

/**
 * Calculate weight for selecting template based on target difficulty (0~1)
 */
function getTemplateWeight(template, diff) {
  const tags = template.tags || ['mid'];
  let weight = 0.05; // base epsilon weight

  const wLow  = Math.max(0, 1.0 - 2.0 * diff);
  const wMid  = Math.max(0, 1.0 - 2.0 * Math.abs(diff - 0.5));
  const wHigh = Math.max(0, 2.0 * diff - 1.0);

  for (const tag of tags) {
    if (tag === 'low') weight += wLow * 1.0;
    else if (tag === 'mid') weight += wMid * 1.0;
    else if (tag === 'high') weight += wHigh * 1.0;
  }

  return weight;
}

/**
 * 按难度加权选择模板（generateNode 内部选择逻辑的导出版；#24 供 tank_map 在
 * 视口缩放前预选模板以确定精确倍率）。同一 rng 实例调用，保持整局确定性。
 * @param {number} diff 0~1 目标难度
 * @param {any} rng createRNG 实例
 * @returns {any} 选中的模板对象
 */
function pickTemplate(diff, rng) {
  const templates = getTemplates();
  const weights = templates.map(t => getTemplateWeight(t, diff));
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  let roll = rng() * totalWeight;

  for (let i = 0; i < templates.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return templates[i];
  }
  return templates[0];
}

/**
 * Main node cover layout generator
 * @param {number} [difficulty=0.5] 0~1 continuous difficulty weight
 * @param {NodeGenOptions} [options]
 * @returns {GeneratedNodeResult}
 */
function generateNode(difficulty, options) {
  const diff = typeof difficulty === 'number' ? Math.max(0, Math.min(1, difficulty)) : 0.5;
  /** @type {NodeGenOptions} */
  const opts = options || {};

  // 节点地图缩放（P-08 / DEVELOPMENT §6 条目 6）：模板 w/h 与元素位置/尺寸按同一
  // 倍率放大，使单个节点成为「摄像机约 1:9」的大世界；scale=1 时行为与 P-05 完全一致。
  const scale = typeof opts.scale === 'number' && opts.scale > 0 ? opts.scale : 1;

  const seed = opts.seed !== undefined ? opts.seed : Math.floor(Math.random() * 1000000);
  const rng = createRNG(seed);

  const templates = getTemplates();
  let selectedTemplate = null;

  if (opts.templateId) {
    selectedTemplate = templates.find(t => t.id === opts.templateId);
  }

  if (!selectedTemplate) {
    selectedTemplate = pickTemplate(diff, rng);
  }

  const centerX = opts.x !== undefined ? opts.x : (opts.centerX !== undefined ? opts.centerX : 600);
  const centerY = opts.y !== undefined ? opts.y : (opts.centerY !== undefined ? opts.centerY : 350);

  // Parametric variations:
  // 1. Density culling rate（#25：随难度递减——高难保留更多元素，低难仍可稀疏）：
  //    diff=1 → 0~0.036；diff=0 → 0~0.12
  const cullRate = opts.cullRate !== undefined ? opts.cullRate : rng.range(0.0, 0.12) * (1 - 0.7 * diff);

  // 2. Pre-damaged state probability (0.05 ~ 0.15 based on difficulty)
  const wreckProb = 0.05 + 0.10 * diff;

  const outCovers = [];
  const items = selectedTemplate.items || [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];

    // Culling check (keep relative order)
    if (items.length > 3 && rng() < cullRate) {
      continue;
    }

    let tier = item.tier;

    // Element ratio adjustment:
    // High difficulty -> upgrade soft/bush to barricade/half
    if (diff > 0.6) {
      if ((tier === 'bush' || tier === 'soft') && rng() < (diff - 0.5) * 0.4) {
        tier = 'barricade';
      }
    }
    // Low difficulty -> downgrade full/barricade to half/soft
    else if (diff < 0.35) {
      if (!item.verts) { // Don't modify complex polygon structures
        if (tier === 'barricade' && rng() < (0.4 - diff) * 0.4) {
          tier = 'soft';
        } else if (tier === 'full' && rng() < (0.4 - diff) * 0.3) {
          tier = 'half';
        }
      }
    }

    // Pre-damaged / wrecked state transition
    if (tier === 'tree' && rng() < wreckProb) {
      tier = rng() < 0.5 ? 'stump' : 'fallen';
    } else if (tier === 'barricade' && rng() < wreckProb) {
      tier = 'rubble';
    }

    // Position jitter (slight variations)
    const jitterX = rng.range(-4, 4) * scale;
    const jitterY = rng.range(-4, 4) * scale;
    const angleJitter = rng.range(-0.05, 0.05);

    const coverObj = {
      x: centerX + item.dx * scale + jitterX,
      y: centerY + item.dy * scale + jitterY,
      w: item.w * scale,
      h: item.h * scale,
      angle: (item.angle || 0) + angleJitter,
      tier: tier
    };

    if (item.verts) {
      coverObj.verts = scale === 1
        ? item.verts.map(v => v.slice())
        : item.verts.map(v => [v[0] * scale, v[1] * scale]);
    }
    if (item.collisionVerts) {
      coverObj.collisionVerts = scale === 1
        ? item.collisionVerts.map(cv => cv.map(pt => pt.slice()))
        : item.collisionVerts.map(cv => cv.map(pt => [pt[0] * scale, pt[1] * scale]));
    }

    // Lookup default hp from RULES.coverTiers if available
    const coverTiers = (typeof RULES !== 'undefined' && RULES.coverTiers)
      ? RULES.coverTiers
      : (typeof COVER_TIERS !== 'undefined' ? COVER_TIERS : null);

    if (coverTiers && coverTiers[tier]) {
      coverObj.hp = coverTiers[tier].hp;
    } else {
      coverObj.hp = 1;
    }

    outCovers.push(coverObj);
  }

  // P-20：随机插入水体/桥梁组合
  // 每个节点最多 1 个水体/桥梁组合；概率随难度递增
  const waterBridgeChance = diff * 0.5;
  if (rng() < waterBridgeChance) {
    // 生成水体：w [300, 800] * scale，h [200, 500] * scale（世界尺寸），
    // 并按节点世界比例封顶（≤40% 宽/高）——原始区间相对模板尺寸本就占 35%~114%，
    // scale 放大后会把大半个战场吞掉，导致敌军/据点拒绝采样被大片水域耗尽（ISSUES #62）
    const waterW = Math.min(rng.range(300, 800) * scale, selectedTemplate.w * scale * 0.4);
    const waterH = Math.min(rng.range(200, 500) * scale, selectedTemplate.h * scale * 0.4);

    // 随机位置偏移（dx/dy 为相对于节点中心的偏移，遵循现有项顺序规范）
    // 确保水体在节点界内：留出边距防止完全贴边
    // 注意：偏移按「模板单位 × scale」约定采样（与 items 的 item.dx 一致）——
    // 不可先按世界尺寸算 maxDx 再乘 scale（双重缩放会把水体/桥梁中心推出节点界，ISSUES #62）。
    const marginX = Math.max(30, waterW * 0.1);
    const marginY = Math.max(30, waterH * 0.1);
    const maxDx = Math.max(0, (selectedTemplate.w - waterW / scale - marginX / scale) / 2);
    const maxDy = Math.max(0, (selectedTemplate.h - waterH / scale - marginY / scale) / 2);
    const waterDx = rng.range(-maxDx, maxDx);
    const waterDy = rng.range(-maxDy, maxDy);

    // 添加水体覆盖（tier: 'water'，move:0 表示不可通行）
    outCovers.push({
      x: centerX + waterDx * scale,
      y: centerY + waterDy * scale,
      w: waterW,
      h: waterH,
      angle: rng.range(-0.05, 0.05),
      tier: 'water'
    });

    // 始终随水体一起插入桥梁：6px 宽的狭长通道，紧贴水体北缘
    const bridgeW = 6 * scale;
    const bridgeH = waterH;  // 与水体同高，作为通行视觉通道
    const bridgeDx = waterDx;  // 对齐水体水平位置
    // bridgeDy 用模板单位（与 waterDy 同基准，bridgeH=waterH → waterH/scale），
    // 并钳到节点半高内，防止水体贴近节点上边缘时桥梁中心越界（ISSUES #62）
    const halfH = selectedTemplate.h / 2;
    const bridgeDy = Math.max(-halfH, Math.min(halfH, waterDy - waterH / scale));

    outCovers.push({
      x: centerX + bridgeDx * scale,
      y: centerY + bridgeDy * scale,
      w: bridgeW,
      h: bridgeH,
      angle: 0,
      tier: 'bridge'
    });
  }

  const targetCovers = (typeof covers !== 'undefined' && Array.isArray(covers))
    ? covers
    : ((typeof global !== 'undefined' && global.covers && Array.isArray(global.covers)) ? global.covers : null);

  if (opts.applyToCovers && targetCovers) {
    targetCovers.length = 0;
    for (const c of outCovers) {
      targetCovers.push(c);
    }
    const snapFn = (typeof snapshotCovers === 'function')
      ? snapshotCovers
      : ((typeof global !== 'undefined' && typeof global.snapshotCovers === 'function') ? global.snapshotCovers : null);
    if (snapFn) {
      snapFn();
    }
  }

  return {
    template: selectedTemplate,
    covers: outCovers,
    seed: seed,
    difficulty: diff,
    w: selectedTemplate.w * scale,   // 缩放后的节点世界尺寸（P-08：摄像机/小地图用）
    h: selectedTemplate.h * scale
  };
}

// Export for Node.js if running in test environment
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    createRNG,
    NODE_TEMPLATES,
    registerTemplate,
    getTemplates,
    pickTemplate,
    generateNode
  };
}
