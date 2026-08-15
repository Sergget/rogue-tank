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
 * Handcrafted Battlefield Templates (5 built-in templates)
 * Template Structure:
 * {
 *   id: string,
 *   name: string,
 *   tags: ('low' | 'mid' | 'high')[],
 *   w: number,
 *   h: number,
 *   items: [ { tier, dx, dy, w, h, angle, verts?, collisionVerts? }, ... ]
 * }
 */
const NODE_TEMPLATES = [
  {
    id: 'corridor_tutorial',
    name: '开阔走廊 (低难/教学)',
    tags: ['low'],
    w: 700,
    h: 400,
    items: [
      { tier: 'half', dx: -140, dy: -60, w: 70, h: 30, angle: 0 },
      { tier: 'bush', dx: 120, dy: 80, w: 80, h: 40, angle: 0 },
      { tier: 'soft', dx: 0, dy: 140, w: 140, h: 10, angle: 0 },
      { tier: 'tree', dx: -180, dy: 100, w: 24, h: 18, angle: 0 },
      { tier: 'barricade', dx: 160, dy: -80, w: 60, h: 26, angle: 0 }
    ]
  },
  {
    id: 'forest_dense',
    name: '密林阵地',
    tags: ['low', 'mid'],
    w: 750,
    h: 450,
    items: [
      { tier: 'tree', dx: -220, dy: -120, w: 24, h: 18, angle: 0 },
      { tier: 'tree', dx: -180, dy: -50, w: 24, h: 18, angle: 0 },
      { tier: 'tree', dx: 180, dy: 110, w: 24, h: 18, angle: 0 },
      { tier: 'tree', dx: 220, dy: 50, w: 24, h: 18, angle: 0 },
      { tier: 'tree', dx: 0, dy: -140, w: 24, h: 18, angle: 0 },
      { tier: 'bush', dx: -100, dy: -80, w: 70, h: 36, angle: 0 },
      { tier: 'bush', dx: 100, dy: 80, w: 70, h: 36, angle: 0 },
      { tier: 'soft', dx: -50, dy: 120, w: 140, h: 10, angle: 0 },
      { tier: 'stump', dx: 0, dy: 30, w: 24, h: 18, angle: 0 },
      { tier: 'half', dx: 120, dy: -100, w: 64, h: 30, angle: 0 }
    ]
  },
  {
    id: 'urban_block',
    name: '城镇街区',
    tags: ['mid', 'high'],
    w: 800,
    h: 500,
    items: [
      { tier: 'full', dx: -180, dy: -100, w: 100, h: 50, angle: 0 },
      { tier: 'full', dx: 180, dy: 100, w: 90, h: 50, angle: 0 },
      {
        tier: 'full',
        dx: -120,
        dy: 120,
        w: 90,
        h: 60,
        angle: 0,
        verts: [[-45, -30], [45, -30], [45, -10], [5, -10], [5, 30], [-45, 30]],
        collisionVerts: [
          [[-45, -30], [5, -30], [5, 30], [-45, 30]],
          [[5, -30], [45, -30], [45, -10], [5, -10]]
        ]
      },
      { tier: 'barricade', dx: 0, dy: -120, w: 70, h: 28, angle: 0 },
      { tier: 'barricade', dx: 0, dy: 120, w: 70, h: 28, angle: 0 },
      { tier: 'half', dx: 150, dy: -80, w: 80, h: 32, angle: 0 },
      { tier: 'rubble', dx: 80, dy: 0, w: 30, h: 20, angle: 0 }
    ]
  },
  {
    id: 'crossfire_plaza',
    name: '交叉火力广场 (高难)',
    tags: ['high'],
    w: 850,
    h: 520,
    items: [
      { tier: 'full', dx: -250, dy: -140, w: 110, h: 60, angle: 0 },
      { tier: 'full', dx: 250, dy: -140, w: 110, h: 60, angle: 0 },
      { tier: 'full', dx: -250, dy: 140, w: 110, h: 60, angle: 0 },
      { tier: 'full', dx: 250, dy: 140, w: 110, h: 60, angle: 0 },
      { tier: 'half', dx: 0, dy: 0, w: 80, h: 36, angle: 0 },
      { tier: 'barricade', dx: -100, dy: 0, w: 60, h: 28, angle: 0 },
      { tier: 'barricade', dx: 100, dy: 0, w: 60, h: 28, angle: 0 },
      { tier: 'tree', dx: -120, dy: -100, w: 24, h: 18, angle: 0 },
      { tier: 'tree', dx: 120, dy: 100, w: 24, h: 18, angle: 0 }
    ]
  },
  {
    id: 'mixed_barrier_plaza',
    name: '混合障壁广场',
    tags: ['low', 'mid', 'high'],
    w: 800,
    h: 480,
    items: [
      { tier: 'half', dx: -150, dy: -60, w: 80, h: 34, angle: 0 },
      { tier: 'full', dx: 150, dy: -60, w: 70, h: 34, angle: 0 },
      { tier: 'barricade', dx: -60, dy: 100, w: 64, h: 28, angle: 0 },
      { tier: 'bush', dx: 120, dy: 110, w: 60, h: 32, angle: 0 },
      { tier: 'soft', dx: -180, dy: 120, w: 120, h: 10, angle: 0 },
      { tier: 'tree', dx: 0, dy: -120, w: 24, h: 18, angle: 0 }
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
    const weights = templates.map(t => getTemplateWeight(t, diff));
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let roll = rng() * totalWeight;

    for (let i = 0; i < templates.length; i++) {
      roll -= weights[i];
      if (roll <= 0) {
        selectedTemplate = templates[i];
        break;
      }
    }
    if (!selectedTemplate) selectedTemplate = templates[0];
  }

  const centerX = opts.x !== undefined ? opts.x : (opts.centerX !== undefined ? opts.centerX : 600);
  const centerY = opts.y !== undefined ? opts.y : (opts.centerY !== undefined ? opts.centerY : 350);

  // Parametric variations:
  // 1. Density culling rate (0.00 ~ 0.08 depending on difficulty and rng)
  const cullRate = opts.cullRate !== undefined ? opts.cullRate : rng.range(0.0, 0.08);

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
    generateNode
  };
}
