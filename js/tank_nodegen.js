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
    // P-40 地形标签分配表（terrainTags，0~2 种）：
    //   corridor_tutorial   []                        教学开阔地——无地形干扰
    //   forest_dense        ['edgeRiver']             林间溪流沿战场边缘蜿蜒
    //   urban_block         ['mudPatch']              街巷泥泞斑点
    //   crossfire_plaza     ['centralPond']           广场中央水景池
    //   mixed_barrier_plaza ['mudPatch']              广场四周烂泥带
    //   village_center      ['centralPond','mudPatch']村口水井潭 + 泥泞环带
    //   woodland_line       ['edgeRiver']             战线侧翼河流
    terrainTags: [],
    // P-36/#81 biome 地面主题标签（映射 RULES.biomes 调色板）：
    //   corridor_tutorial/mixed_barrier_plaza → steppe（开阔黄草地）
    //   urban_block/crossfire_plaza → concrete（城镇硬地）
    //   forest_dense/woodland_line/village_center → meadow（林地/村落草绿）
    biome: 'steppe',
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
      // #77 全高补配（教学走廊补 2 座哨塔式建筑，形成中路遮蔽）
      { tier: 'full', dx: -90, dy: -150, w: 88, h: 46, angle: 0 },
      { tier: 'full', dx: 100, dy: 150, w: 88, h: 46, angle: 0 },
      // 点缀树丛
      { tier: 'tree', dx: -120, dy: -140, w: 24, h: 18, angle: 0 },
      { tier: 'bush', dx: 140, dy: 120, w: 70, h: 36, angle: 0 },
      { tier: 'bush', dx: -40, dy: 60, w: 60, h: 32, angle: 0 },
      // #77 密度提升：走廊纵深补量（避开边缘河流带与中央通道）
      { tier: 'half', dx: 0, dy: 55, w: 84, h: 32, angle: 0 },
      { tier: 'half', dx: -240, dy: 170, w: 84, h: 32, angle: 0 },
      { tier: 'half', dx: 240, dy: -180, w: 84, h: 32, angle: 0 },
      { tier: 'soft', dx: -120, dy: -60, w: 140, h: 10, angle: 0 },
      { tier: 'soft', dx: 130, dy: 60, w: 140, h: 10, angle: 0 },
      { tier: 'tree', dx: 60, dy: -40, w: 24, h: 18, angle: 0 },
      { tier: 'bush', dx: -190, dy: 110, w: 64, h: 32, angle: 0 },
      { tier: 'barricade', dx: 40, dy: 110, w: 66, h: 28, angle: 0 }
    ]
  },
  {
    id: 'forest_dense',
    name: '密林阵地',
    tags: ['low', 'mid'],
    terrainTags: ['edgeRiver'],
    biome: 'meadow',
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
      { tier: 'soft', dx: 0, dy: -150, w: 120, h: 10, angle: 0 },
      // #77 全高补配（密林阵地补 3 座林间工事，避免纯软掩体无骨架）
      { tier: 'full', dx: -160, dy: -60, w: 92, h: 48, angle: 0 },
      { tier: 'full', dx: 120, dy: 60, w: 92, h: 48, angle: 0 },
      { tier: 'full', dx: 260, dy: -120, w: 92, h: 48, angle: 0 },
      // #77 密度提升：林间补量（避开边缘河流带）
      { tier: 'half', dx: -220, dy: 150, w: 76, h: 30, angle: 0 },
      { tier: 'half', dx: 200, dy: 160, w: 76, h: 30, angle: 0 },
      { tier: 'barricade', dx: -260, dy: 40, w: 66, h: 28, angle: 0 },
      { tier: 'barricade', dx: 60, dy: -140, w: 66, h: 28, angle: 0 },
      { tier: 'soft', dx: -100, dy: 100, w: 120, h: 10, angle: 0 },
      { tier: 'bush', dx: -300, dy: -120, w: 64, h: 32, angle: 0 },
      { tier: 'tree', dx: 320, dy: 40, w: 24, h: 18, angle: 0 },
      { tier: 'stump', dx: 280, dy: -60, w: 24, h: 18, angle: 0 }
    ]
  },
  {
    id: 'urban_block',
    name: '城镇街区',
    tags: ['mid', 'high'],
    terrainTags: ['mudPatch'],
    biome: 'concrete',
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
      { tier: 'bush', dx: 120, dy: 60, w: 60, h: 32, angle: 0 },
      // #77 密度提升：街巷补量（+1 全高，强化街区骨架）
      { tier: 'full', dx: 0, dy: 150, w: 96, h: 50, angle: 0 },
      { tier: 'half', dx: -200, dy: -180, w: 78, h: 32, angle: 0 },
      { tier: 'half', dx: 200, dy: 180, w: 78, h: 32, angle: 0 },
      { tier: 'barricade', dx: -40, dy: 40, w: 68, h: 28, angle: 0 },
      { tier: 'barricade', dx: 180, dy: -60, w: 68, h: 28, angle: 0 },
      { tier: 'rubble', dx: -40, dy: -60, w: 30, h: 20, angle: 0 },
      { tier: 'soft', dx: -260, dy: 60, w: 110, h: 10, angle: 0 },
      { tier: 'tree', dx: 220, dy: 60, w: 24, h: 18, angle: 0 },
      { tier: 'bush', dx: -220, dy: -60, w: 60, h: 32, angle: 0 },
      { tier: 'bush', dx: 100, dy: -190, w: 60, h: 32, angle: 0 }
    ]
  },
  {
    id: 'crossfire_plaza',
    name: '交叉火力广场 (高难)',
    tags: ['high'],
    terrainTags: ['centralPond'],
    biome: 'concrete',
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
      { tier: 'bush', dx: 0, dy: 180, w: 64, h: 32, angle: 0 },
      // #77 密度提升：广场补量（+1 全高北门楼；中央水潭由拒绝采样避让掩体）
      { tier: 'full', dx: 0, dy: -190, w: 94, h: 48, angle: 0 },
      { tier: 'half', dx: -160, dy: -120, w: 74, h: 30, angle: 0 },
      { tier: 'half', dx: 160, dy: 120, w: 74, h: 30, angle: 0 },
      { tier: 'barricade', dx: -220, dy: -140, w: 66, h: 28, angle: 0 },
      { tier: 'barricade', dx: 220, dy: 140, w: 66, h: 28, angle: 0 },
      { tier: 'rubble', dx: -60, dy: 60, w: 32, h: 22, angle: 0 },
      { tier: 'soft', dx: 0, dy: 170, w: 150, h: 10, angle: 0 },
      { tier: 'soft', dx: -250, dy: 60, w: 120, h: 10, angle: 0 },
      { tier: 'tree', dx: 250, dy: -60, w: 24, h: 18, angle: 0 },
      { tier: 'bush', dx: -100, dy: -190, w: 62, h: 32, angle: 0 }
    ]
  },
  {
    id: 'mixed_barrier_plaza',
    name: '混合障壁广场',
    tags: ['low', 'mid', 'high'],
    terrainTags: ['mudPatch'],
    biome: 'steppe',
    w: 800,
    h: 480,
    items: [
      // 四象限全高/半高对位 + 中央沙袋环
      // #77 尺寸收敛配套：full 基准 80×40 → 88×44（×coverWorldScale.full 0.58 ×3 ≈153px，
      // 落入全高目标区间 150~220px；80 宽会缩到 139px 越下界）
      { tier: 'full', dx: -200, dy: -100, w: 88, h: 44, angle: 0 },
      { tier: 'full', dx: 200, dy: -100, w: 88, h: 44, angle: 0 },
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
      { tier: 'stump', dx: 0, dy: -110, w: 24, h: 18, angle: 0 },
      // #77 密度提升：广场补量（+1 全高南翼）
      { tier: 'full', dx: 0, dy: 150, w: 88, h: 44, angle: 0 },
      { tier: 'half', dx: -120, dy: -160, w: 72, h: 30, angle: 0 },
      { tier: 'half', dx: 120, dy: 160, w: 72, h: 30, angle: 0 },
      { tier: 'barricade', dx: -180, dy: -60, w: 66, h: 28, angle: 0 },
      { tier: 'barricade', dx: 180, dy: 60, w: 66, h: 28, angle: 0 },
      { tier: 'rubble', dx: 0, dy: 60, w: 30, h: 20, angle: 0 },
      { tier: 'soft', dx: -200, dy: 120, w: 120, h: 10, angle: 0 },
      { tier: 'soft', dx: 200, dy: -120, w: 120, h: 10, angle: 0 },
      { tier: 'tree', dx: -140, dy: 60, w: 24, h: 18, angle: 0 },
      { tier: 'bush', dx: 140, dy: -60, w: 60, h: 32, angle: 0 }
    ]
  },
  {
    id: 'village_center',
    name: '村落中心广场 (高难)',
    tags: ['mid', 'high'],
    terrainTags: ['centralPond', 'mudPatch'],
    biome: 'meadow',
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
      { tier: 'rubble', dx: 0, dy: -60, w: 30, h: 20, angle: 0 },
      // #77 密度提升：村落补量（+1 全高南屋；水井潭由拒绝采样避让）
      { tier: 'full', dx: 0, dy: 170, w: 92, h: 46, angle: 0 },
      { tier: 'half', dx: -180, dy: -60, w: 72, h: 30, angle: 0 },
      { tier: 'half', dx: 180, dy: 60, w: 72, h: 30, angle: 0 },
      { tier: 'barricade', dx: -60, dy: 150, w: 66, h: 28, angle: 0 },
      { tier: 'barricade', dx: 60, dy: -150, w: 66, h: 28, angle: 0 },
      { tier: 'rubble', dx: -180, dy: 150, w: 30, h: 20, angle: 0 },
      { tier: 'tree', dx: 0, dy: 60, w: 24, h: 18, angle: 0 },
      { tier: 'tree', dx: -220, dy: 0, w: 24, h: 18, angle: 0 },
      { tier: 'bush', dx: 220, dy: 0, w: 60, h: 32, angle: 0 },
      { tier: 'stump', dx: 100, dy: 110, w: 24, h: 18, angle: 0 }
    ]
  },
  {
    id: 'woodland_line',
    name: '林地战线 (高难)',
    tags: ['high'],
    terrainTags: ['edgeRiver'],
    biome: 'meadow',
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
      { tier: 'half', dx: 0, dy: 0, w: 90, h: 34, angle: 0 },
      // #77 全高补配（林地战线补 2 座支撑点工事，战线不再无硬骨架）
      { tier: 'full', dx: -100, dy: -180, w: 92, h: 46, angle: 0 },
      { tier: 'full', dx: 120, dy: 180, w: 92, h: 46, angle: 0 },
      // #77 密度提升：战线纵深补量（避开边缘河流带）
      { tier: 'half', dx: -240, dy: -140, w: 78, h: 32, angle: 0 },
      { tier: 'half', dx: 240, dy: 140, w: 78, h: 32, angle: 0 },
      { tier: 'barricade', dx: -180, dy: 100, w: 66, h: 28, angle: 0 },
      { tier: 'barricade', dx: 200, dy: -100, w: 66, h: 28, angle: 0 },
      { tier: 'soft', dx: -60, dy: 60, w: 130, h: 10, angle: 0 },
      { tier: 'tree', dx: 340, dy: -120, w: 24, h: 18, angle: 0 },
      { tier: 'tree', dx: -340, dy: 120, w: 24, h: 18, angle: 0 },
      { tier: 'tree', dx: 40, dy: -60, w: 24, h: 18, angle: 0 },
      { tier: 'bush', dx: -120, dy: 20, w: 62, h: 32, angle: 0 },
      { tier: 'stump', dx: 180, dy: 120, w: 24, h: 18, angle: 0 }
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
 * AABB 重叠检测：矩形（中心 x,y + 尺寸 w,h）是否击中任一已放置掩体的外接框。
 * 用于水体/桥梁拒绝采样，避免水体/桥梁压在已放置掩体上（P-20 修复 / ISSUES #62 衍生）。
 * 自包含实现：仅依赖覆盖 c.x,c.y,c.w,c.h（世界尺寸），不引入 tank_cover 依赖，
 * 保持模块 Node 测试可用性。
 * @param {Array} covers 已放置掩体数组（{x,y,w,h,...}）
 * @param {number} x 矩形中心 x
 * @param {number} y 矩形中心 y
 * @param {number} w 矩形宽（世界尺寸）
 * @param {number} h 矩形高（世界尺寸）
 * @param {number} pad 各掩体 AABB 外扩边距（px）
 * @returns {boolean}
 */
function rectHitsCover(covers, x, y, w, h, pad) {
  const left = x - w / 2 - pad;
  const right = x + w / 2 + pad;
  const top = y - h / 2 - pad;
  const bottom = y + h / 2 + pad;
  for (let i = 0; i < covers.length; i++) {
    const c = covers[i];
    const cl = c.x - c.w / 2 - pad;
    const cr = c.x + c.w / 2 + pad;
    const ct = c.y - c.h / 2 - pad;
    const cb = c.y + c.h / 2 + pad;
    if (right > cl && left < cr && bottom > ct && top < cb) return true;
  }
  return false;
}

// ======================= P-40 地形标签生成（terrainTags） =======================
// 三种确定性地形放置（同 seed 同结果；不受 cullRate 剔除与难度升降级影响）：
//   centralPond — 中央水潭：单块 water 八边形 verts 近似圆，中心附近拒绝采样避让已放掩体
//   edgeRiver   — 沿边河流：单 river 实例携带 segments 多段连通（B4 方案 A），沿四边之一
//   mudPatch    — 泥环/泥斑：mud 环带若干块（允许与其他元素叠放，地面层无碰撞）
function placeCentralPond(rng, tpl, scale, centerX, centerY, outCovers) {
  const R = rng.range(0.10, 0.14) * Math.min(tpl.w, tpl.h) * scale;
  const D = R * 2;
  // 确定性拒绝采样：以节点中心为基准的 5x5 相位网格找不压掩体的落点；全失败则强制居中
  const phaseX = rng(), phaseY = rng();
  let px = centerX, py = centerY;
  pondSearch:
  for (let gi = 0; gi < 5; gi++) {
    for (let gj = 0; gj < 5; gj++) {
      const fx = centerX + ((gi + phaseX) / 5 - 0.5) * tpl.w * scale * 0.3;
      const fy = centerY + ((gj + phaseY) / 5 - 0.5) * tpl.h * scale * 0.3;
      if (!rectHitsCover(outCovers, fx, fy, D, D, 8)) { px = fx; py = fy; break pondSearch; }
    }
  }
  const rot = rng() * Math.PI * 2;
  const verts = [];
  for (let i = 0; i < 8; i++) {
    const a = rot + (i / 8) * Math.PI * 2;
    verts.push([Math.cos(a) * R, Math.sin(a) * R]);
  }
  return { x: px, y: py, w: D, h: D, angle: rng.range(-0.03, 0.03), tier: 'water', verts };
}

function placeEdgeRiver(rng, tpl, scale, centerX, centerY) {
  const edge = rng.int(0, 3);            // 0=N 1=S 2=W 3=E
  const segN = rng.int(4, 6);            // 连通段数
  const alongDim = edge < 2 ? tpl.w : tpl.h;
  const span = alongDim * scale * 1.04;  // 河流贯穿整条边（略超出防缺口）
  const segLen = span / segN * 1.25;     // 段间重叠 25% 保证连通
  const thick = Math.min(tpl.w, tpl.h) * scale * rng.range(0.08, 0.11);
  const halfW = tpl.w * scale / 2, halfH = tpl.h * scale / 2;
  const band = Math.max(thick * 0.7, Math.min(tpl.w, tpl.h) * scale * 0.08); // 距边距离带
  const baseOff = rng.range(-0.06, 0.06); // 蜿蜒基准相位
  const segments = [];
  for (let i = 0; i < segN; i++) {
    const t = (i + 0.5) / segN - 0.5;    // -0.5..0.5 沿轴向
    const meander = (baseOff + Math.sin((i / segN) * Math.PI + baseOff * 6)) * band * 0.5;
    let dx = 0, dy = 0, w = segLen, h = thick;
    if (edge === 0) { dx = t * span; dy = -halfH + band + meander; }        // 北缘
    else if (edge === 1) { dx = t * span; dy = halfH - band + meander; }    // 南缘
    else if (edge === 2) { w = thick; h = segLen; dx = -halfW + band + meander; dy = t * span; } // 西缘
    else { w = thick; h = segLen; dx = halfW - band + meander; dy = t * span; }                  // 东缘
    segments.push({ dx, dy, w, h, angle: 0 });
  }
  // 实例锚点取首段中心，w/h 记录外接范围（供 rectHitsCover/小地图通绘参考）
  const s0 = segments[0];
  const cx = centerX + s0.dx, cy = centerY + s0.dy;
  const extX = Math.max.apply(null, segments.map(s => Math.abs(s.dx) + s.w / 2));
  const extY = Math.max.apply(null, segments.map(s => Math.abs(s.dy) + s.h / 2));
  return { x: cx, y: cy, w: extX * 2, h: extY * 2, angle: 0, tier: 'river',
           segments, groupId: 'river' }; // groupId：同一生成调用产出的连通水体标识
}

function placeMudPatch(rng, tpl, scale, centerX, centerY, outCovers) {
  const K = rng.int(3, 4);               // 泥斑数量
  const ringR = Math.min(tpl.w, tpl.h) * scale * rng.range(0.20, 0.28);
  const baseAng = rng() * Math.PI * 2;
  const out = [];
  for (let k = 0; k < K; k++) {
    const ang = baseAng + (k / K) * Math.PI * 2 + rng.range(-0.15, 0.15);
    const rr = ringR * rng.range(0.85, 1.15);
    const mw = rng.range(40, 64) * scale;
    const mh = mw * rng.range(0.6, 0.9);
    out.push({ x: centerX + Math.cos(ang) * rr, y: centerY + Math.sin(ang) * rr,
               w: mw, h: mh, angle: rng.range(-0.2, 0.2), tier: 'mud' });
  }
  return out;
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

  // tier 表提前查询（P-40）：地形类（liquid/ground）不参与难度升降级
  const coverTiers = (typeof RULES !== 'undefined' && RULES.coverTiers)
    ? RULES.coverTiers
    : (typeof COVER_TIERS !== 'undefined' ? COVER_TIERS : null);
  const isTerrainTier = (tier) => {
    const ct = coverTiers && coverTiers[tier];
    return !!ct && (ct.tierGroup === 'liquid' || ct.tierGroup === 'ground');
  };

  // #77 cullRate 剔除保护：每模板至少前 fullCullProtect(2) 个全高建筑不被随机剔除
  // （保底掩体骨架；地形标签生成物本就不进剔除循环）。
  const cfgNodeMap = (typeof RULES !== 'undefined' && RULES.nodeMap) ? RULES.nodeMap : {};
  const fullCullProtect = cfgNodeMap.fullCullProtect !== undefined ? cfgNodeMap.fullCullProtect : 2;
  const protectedFullIdx = new Set();
  if (fullCullProtect > 0) {
    let seen = 0;
    for (let i = 0; i < items.length; i++) {
      if (items[i].tier === 'full') {
        if (seen < fullCullProtect) protectedFullIdx.add(i);
        seen++;
      }
    }
  }

  // #77 低难度 full→half 降级帽：单节点最多降 floor(full数×fullDowngradeCap=30%) 个，
  // 保证低难度下全高建筑残留 ≥70%（阈值 diff<0.35 沿用原降级窗口）。
  const downgradeCap = cfgNodeMap.fullDowngradeCap !== undefined ? cfgNodeMap.fullDowngradeCap : 0.30;
  const tplFullCount = items.filter(it => it.tier === 'full').length;
  let fullDowngraded = 0;
  let fullDowngradeBudget = Math.floor(tplFullCount * downgradeCap);

  // #77 尺寸收敛系数表（RULES.nodeMap.coverWorldScale）：掩体类按 tier 缩放世界尺寸
  // （半高 0.55 → ≈100~150px、全高 0.58 → ≈150~220px、沙袋 0.40 → ≈60~90px @nodeScale=3）；
  // 地形/植被类不在表中不受影响。verts/collisionVerts 同步按同系数缩放保持几何一致。
  const coverWorldScale = cfgNodeMap.coverWorldScale || {};

  for (let i = 0; i < items.length; i++) {
    const item = items[i];

    // Culling check (keep relative order)——#77：受保护的全高建筑跳过剔除
    if (items.length > 3 && !protectedFullIdx.has(i) && rng() < cullRate) {
      continue;
    }

    let tier = item.tier;

    // Element ratio adjustment:
    // High difficulty -> upgrade soft/bush to barricade/half
    // （P-40：地形标签 tier 不降级/升级——full→half 等仅作用于掩体类）
    if (!isTerrainTier(tier)) {
      if (diff > 0.6) {
        if ((tier === 'bush' || tier === 'soft') && rng() < (diff - 0.5) * 0.4) {
          tier = 'barricade';
        }
      }
      // Low difficulty -> downgrade full/barricade to half/soft
      // （#77：full→half 受降级帽约束，单节点最多降 floor(full数×30%)）
      else if (diff < 0.35) {
        if (!item.verts) { // Don't modify complex polygon structures
          if (tier === 'barricade' && rng() < (0.4 - diff) * 0.4) {
            tier = 'soft';
          } else if (tier === 'full' && fullDowngraded < fullDowngradeBudget && rng() < (0.4 - diff) * 0.3) {
            tier = 'half';
            fullDowngraded++;
          }
        }
      }
    }

    let itemW = item.w, itemH = item.h;

    // #77 尺寸收敛：掩体类按 coverWorldScale[tier] 收敛世界尺寸
    const sizeFactor = (!isTerrainTier(tier) && typeof coverWorldScale[tier] === 'number')
      ? coverWorldScale[tier] : 1;
    itemW *= sizeFactor;
    itemH *= sizeFactor;
    const vertScale = scale * sizeFactor;

    // Pre-damaged / wrecked state transition
    if (tier === 'tree' && rng() < wreckProb) {
      tier = rng() < 0.5 ? 'stump' : 'fallen';
      if (tier === 'fallen') {
        itemW *= 2.4; itemH *= 0.5;
      } else if (tier === 'stump') {
        itemW *= 0.6; itemH *= 0.6;
      }
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
      w: itemW * scale,
      h: itemH * scale,
      angle: (item.angle || 0) + angleJitter,
      tier: tier
    };

    if (item.verts) {
      coverObj.verts = vertScale === 1
        ? item.verts.map(v => v.slice())
        : item.verts.map(v => [v[0] * vertScale, v[1] * vertScale]);
    }
    if (item.collisionVerts) {
      coverObj.collisionVerts = vertScale === 1
        ? item.collisionVerts.map(cv => cv.map(pt => pt.slice()))
        : item.collisionVerts.map(cv => cv.map(pt => [pt[0] * vertScale, pt[1] * vertScale]));
    }

    // Lookup default hp from RULES.coverTiers if available
    if (coverTiers && coverTiers[tier]) {
      coverObj.hp = coverTiers[tier].hp;
    } else {
      coverObj.hp = 1;
    }

    outCovers.push(coverObj);
  }

  // ---- P-40 地形标签生成（不受 cullRate 剔除；同 seed 确定性） ----
  const terrainTags = selectedTemplate.terrainTags || [];
  for (const tag of terrainTags) {
    if (tag === 'centralPond') {
      outCovers.push(placeCentralPond(rng, selectedTemplate, scale, centerX, centerY, outCovers));
    } else if (tag === 'edgeRiver') {
      outCovers.push(placeEdgeRiver(rng, selectedTemplate, scale, centerX, centerY));
    } else if (tag === 'mudPatch') {
      for (const m of placeMudPatch(rng, selectedTemplate, scale, centerX, centerY, outCovers)) {
        outCovers.push(m);
      }
    }
  }

  // P-20：随机插入水体/桥梁组合
  // 每个节点最多 1 个水体/桥梁组合；概率随难度递增
  const waterBridgeChance = diff * 0.5;
  if (rng() < waterBridgeChance) {
    // 生成水体：w/h 受「≤40% 节点尺寸」封顶（scale 已计入），
    // 并按节点世界比例封顶（≤40% 宽/高）——原始区间相对模板尺寸本就占 35%~114%，
    // scale 放大后会把大半个战场吞掉，导致敌军/据点拒绝采样被大片水域耗尽（ISSUES #62）。
    // 拒绝采样（P-20 修复 / ISSUES #62 衍生）：每轮用 rng 抽取 waterW/waterH（封顶 40% 节点尺寸），
    // 并对「节点内可行位置」做网格扫描（相位由 rng 决定，保持确定性）寻找不与任何已放置掩体
    // 重叠的水体/桥梁候选；全失败则跳过本节点水体（不放置水体/桥梁）。纯随机 30 次在自由空间
    // 占比极小（高难掩体密集）时几乎必失，故改以网格扫描提升命中率，同时仍只用 rng（确定性）。
    // 桥梁（狭长通道）位于水体北缘，一并做重叠检测（best-effort）。镜像 tank_map.js 的 guard 模式。
    const WATER_PAD = 8;
    const bridgeW = 6 * scale;
    const WATER_GX = 20, WATER_GY = 14, WATER_SIZE_TRIES = 8;
    let waterDx = null, waterDy = null, waterW = 0, waterH = 0;
    const phaseX = rng(), phaseY = rng();
    waterSearch:
    for (let si = 0; si < WATER_SIZE_TRIES; si++) {
      // 尺寸在 [0.5*cap, cap] 间采样：仍受「≤40% 节点尺寸」封顶（cap）约束，
      // 但下限放宽到半 cap，使密集掩体间仍能找到可落位的水体（原始实现固定取上限→几乎必重叠）。
      const capW = selectedTemplate.w * scale * 0.4;
      const capH = selectedTemplate.h * scale * 0.4;
      const tryW = rng.range(0.5 * capW, capW);
      const tryH = rng.range(0.5 * capH, capH);
      // 确保水体在节点界内：留出边距防止完全贴边；偏移按「模板单位 × scale」约定采样。
      // 不可先按世界尺寸算 maxDx 再乘 scale（双重缩放会把水体/桥梁中心推出节点界，ISSUES #62）。
      const marginX = Math.max(30, tryW * 0.1);
      const marginY = Math.max(30, tryH * 0.1);
      const maxDx = Math.max(0, (selectedTemplate.w - tryW / scale - marginX / scale) / 2);
      const maxDy = Math.max(0, (selectedTemplate.h - tryH / scale - marginY / scale) / 2);
      for (let gi = 0; gi < WATER_GX; gi++) {
        for (let gj = 0; gj < WATER_GY; gj++) {
          const tryDx = -maxDx + (2 * maxDx) * ((gi + phaseX) / WATER_GX);
          const tryDy = -maxDy + (2 * maxDy) * ((gj + phaseY) / WATER_GY);
          const tryWX = centerX + tryDx * scale;
          const tryWY = centerY + tryDy * scale;
          const tryBX = centerX + tryDx * scale;                  // 桥梁对齐水体水平位置
          const tryBY = centerY + (tryDy - tryH / scale) * scale; // 紧贴水体北缘
          if (!rectHitsCover(outCovers, tryWX, tryWY, tryW, tryH, WATER_PAD) &&
              !rectHitsCover(outCovers, tryBX, tryBY, bridgeW, tryH, WATER_PAD)) {
            waterDx = tryDx; waterDy = tryDy; waterW = tryW; waterH = tryH;
            break waterSearch;
          }
        }
      }
    }

    if (waterDx !== null) {
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
      const bridgeH = waterH;  // 与水体同高，作为通行视觉通道
      const bridgeDx = waterDx;  // 对齐水体水平位置
      // bridgeDy 用模板单位（与 waterDy 同基准，bridgeH=waterH → waterH/scale），
      // 并钳到节点半高减去桥梁自身半高内，防止水体贴近节点上边缘时桥梁越界（Fix 2 / ISSUES #62）
      const halfH = selectedTemplate.h / 2;
      const bridgeHalfH = waterH / scale / 2;
      const bridgeClamp = Math.max(0, halfH - bridgeHalfH);
      const bridgeDy = Math.max(-bridgeClamp, Math.min(bridgeClamp, waterDy - waterH / scale));

      outCovers.push({
        x: centerX + bridgeDx * scale,
        y: centerY + bridgeDy * scale,
        w: bridgeW,
        h: bridgeH,
        angle: 0,
        tier: 'bridge'
      });
    }
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
    biome: selectedTemplate.biome || null,   // P-36/#81：biome 地面主题标签（makeNode 透传到 run.nodes）
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
