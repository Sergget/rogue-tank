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
    // #87 林地簇：2~3 个高密度树簇（每簇 4~8 tree + 2~4 bush）运行时生成，
    // 取代旧版 12 棵散点树（形成“林子”而非稀疏独树）
    forest: { minClusters: 2, maxClusters: 3 },
    w: 750,
    h: 450,
    items: [
      // 纵深树墙：#87 散点树移入运行时林地簇（forest 配置），此处保留林间工事/残木/灌木
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
      { tier: 'stump', dx: 280, dy: -60, w: 24, h: 18, angle: 0 }
    ]
  },
  {
    id: 'urban_block',
    name: '城镇街区',
    tags: ['mid', 'high'],
    terrainTags: ['mudPatch'],
    biome: 'concrete',
    village: { dx: 0, dy: 0, count: 7 },
    w: 800,
    h: 500,
    items: [
      // 村落建筑群（ISSUE 7c）：village 配置于模板对象触发，于中心松散散布 5~9 座中小全高建筑
      // （含 L 形凹口立面），取代旧的四角建筑环；碰撞/绘制均已支持 N 独立矩形。
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
      { tier: 'bush', dx: 100, dy: -190, w: 60, h: 32, angle: 0 },
      // #78：新增不规则烂泥地
      { tier: 'mud', dx: 0, dy: 100, w: 100, h: 60, angle: 0, verts: [[-40, -20], [40, -30], [50, 10], [10, 30], [-50, 20]] }
    ]
  },
  {
    id: 'crossfire_plaza',
    name: '交叉火力广场 (高难)',
    tags: ['high'],
    terrainTags: ['centralPond'],
    biome: 'concrete',
    village: { dx: 0, dy: 0, count: 6 },
    w: 850,
    h: 520,
    items: [
      // 村落建筑群（ISSUE 7c）：village 配置于模板对象触发，于中心松散散布
      // （取代旧的四角交叉火力建筑框架）
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
    village: { dx: 0, dy: 0, count: 7 },
    // #87 防风林簇：西缘单簇（每簇 ≥4 tree + 2~4 bush），与村落道路/建筑错位
    forest: { minClusters: 1, maxClusters: 1, regions: [{ dx: -340, dy: 0, rx: 70, ry: 150 }] },
    w: 820,
    h: 500,
    items: [
      // 村落建筑群（ISSUE 7c）：village 配置于模板对象触发，于中心松散散布
      // （取代旧的四角屋舍环；保留北向屋舍作为骨架）
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
      { tier: 'stump', dx: 100, dy: 110, w: 24, h: 18, angle: 0 },
      // #78：新增不规则岩石
      { tier: 'rock', dx: -240, dy: 120, w: 60, h: 50, angle: 0, verts: [[-30, -10], [10, -25], [30, 0], [10, 25], [-30, 15]] }
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

function obbPts(x, y, w, h, a) {
  const cs = Math.cos(a || 0), sn = Math.sin(a || 0);
  const hx = w / 2, hy = h / 2;
  return [
    { x: x + cs * hx - sn * hy, y: y + sn * hx + cs * hy },
    { x: x + cs * hx + sn * hy, y: y + sn * hx - cs * hy },
    { x: x - cs * hx + sn * hy, y: y - sn * hx - cs * hy },
    { x: x - cs * hx - sn * hy, y: y - sn * hx + cs * hy }
  ];
}

function obbPairHits(pa, aa, pb, ba) {
  const axes = [[Math.cos(aa), Math.sin(aa)], [-Math.sin(aa), Math.cos(aa)],
                [Math.cos(ba), Math.sin(ba)], [-Math.sin(ba), Math.cos(ba)]];
  for (const [ax, ay] of axes) {
    let aMin = Infinity, aMax = -Infinity, bMin = Infinity, bMax = -Infinity;
    for (const p of pa) { const d = p.x * ax + p.y * ay; if (d < aMin) aMin = d; if (d > aMax) aMax = d; }
    for (const p of pb) { const d = p.x * ax + p.y * ay; if (d < bMin) bMin = d; if (d > bMax) bMax = d; }
    if (aMax <= bMin || bMax <= aMin) return false;
  }
  return true;
}

function obbHitsCover(covers, x, y, w, h, angle, pad) {
  const pa = obbPts(x, y, w + (pad || 0) * 2, h + (pad || 0) * 2, angle || 0);
  const aa = angle || 0;
  for (let i = 0; i < covers.length; i++) {
    const c = covers[i];
    const pb = obbPts(c.x, c.y, c.w, c.h, c.angle || 0);
    if (obbPairHits(pa, aa, pb, c.angle || 0)) return true;
  }
  return false;
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

// 凸包（Andrew monotone chain）：将一组点收敛为凸多边形，保证 getCoverUnderTank/SAT 安全。
// 用于把带半径抖动的径向 blob 收敛为凸形（泥斑/水潭）。
function convexHull(pts) {
  if (pts.length < 3) return pts.slice();
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const pt of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], pt) <= 0) lower.pop();
    lower.push(pt);
  }
  const upper = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const pt = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], pt) <= 0) upper.pop();
    upper.push(pt);
  }
  lower.pop(); upper.pop();
  return lower.concat(upper);
}

// ======================= P-40 地形标签生成（terrainTags） =======================
// 三种确定性地形放置（同 seed 同结果；不受 cullRate 剔除与难度升降级影响）：
//   centralPond — 中央水潭：单块 water 八边形 verts 近似圆，中心附近拒绝采样避让已放掩体
//   edgeRiver   — 沿边河流：单 river 实例携带 segments 多段连通（B4 方案 A），沿四边之一
//   mudPatch    — 泥环/泥斑：mud 环带若干块（允许与其他元素叠放，地面层无碰撞）
function placeCentralPond(rng, tpl, scale, centerX, centerY, outCovers) {
  const R = rng.range(0.10, 0.14) * Math.min(tpl.w, tpl.h) * scale;
  const D = R * 2;
  // 确定性拒绝采样：以节点中心为基准的 9x9 相位网格找不压掩体的落点，范围保持
  // ±0.30 模板边长（配合「水潭在中央区」断言：|lx|<W*0.30）。#A11 路网后中央常被
  // 主干道/杂物密集占据，5x5/7x7 相位点过疏易全失败；9x9 提高找到空地概率。
  // 全失败时（密集布局无完全空位）取「碰撞重叠面积最小」点回退放置——保证 centralPond
  // 标签必产出（水潭压 soft/植被类可接受；road 本就被忽略）；#A11 去强制居中 = 不再
  // 无脑锁中心，改为最优可放置。
  const solidCovers = outCovers.filter(c => c.tier !== 'road');
  const phaseX = rng(), phaseY = rng();
  let px = centerX, py = centerY, found = false;
  let bestPx = centerX, bestPy = centerY, bestOverlap = Infinity;
  pondSearch:
  for (let gi = 0; gi < 9; gi++) {
    for (let gj = 0; gj < 9; gj++) {
      const fx = centerX + ((gi + phaseX) / 9 - 0.5) * tpl.w * scale * 0.6;
      const fy = centerY + ((gj + phaseY) / 9 - 0.5) * tpl.h * scale * 0.6;
      if (!rectHitsCover(solidCovers, fx, fy, D, D, 8)) { px = fx; py = fy; found = true; break pondSearch; }
      // 统计碰撞重叠面积（含 road 之外的所有元素）作回退评分
      let ov = 0;
      for (const c of solidCovers) {
        const ox = Math.max(0, Math.min(fx + D / 2, c.x + c.w / 2) - Math.max(fx - D / 2, c.x - c.w / 2));
        const oy = Math.max(0, Math.min(fy + D / 2, c.y + c.h / 2) - Math.max(fy - D / 2, c.y - c.h / 2));
        ov += ox * oy;
      }
      if (ov < bestOverlap) { bestOverlap = ov; bestPx = fx; bestPy = fy; }
    }
  }
  if (!found) { px = bestPx; py = bestPy; }
  // #A11 出生走廊保护：回退落点若阻塞左缘出生走廊（water 阻挡移动），
  // 移到走廊右界外——水潭不回退到玩家出生通路内。
  {
    const halfW = tpl.w * scale / 2, halfH = tpl.h * scale / 2;
    const spawnXM = centerX - 0.8 * halfW;   // 世界左缘 10%
    const kcX0 = spawnXM - halfW * 0.20, kcX1 = spawnXM + halfW * 0.20;
    const kcY0 = centerY - halfH * 0.09, kcY1 = centerY + halfH * 0.09;
    if (px + R > kcX0 && px - R < kcX1 && py + R > kcY0 && py - R < kcY1) {
      px = kcX1 + R + 4;   // 推到走廊右界外
    }
  }

  const rot = rng() * Math.PI * 2;
  // ISSUE 7(b)：更平滑的凸 blob——14~18 顶点 + 轻微半径噪声，经凸包收敛为凸形；
  // w/h 取实际外接 bbox（按轴分别计算最大半幅）。
  const N = rng.int(14, 18);
  const pts = [];
  for (let i = 0; i < N; i++) {
    const a = rot + (i / N) * Math.PI * 2;
    const f = rng.range(0.85, 1.0); // 轻微半径噪声（凸包后再收敛为凸）
    const rr = R * f;
    pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
  }
  const verts = convexHull(pts);
  let maxx = 0, maxy = 0;
  for (const [vx, vy] of verts) { maxx = Math.max(maxx, Math.abs(vx)); maxy = Math.max(maxy, Math.abs(vy)); }
  return { x: px, y: py, w: maxx * 2, h: maxy * 2, angle: rng.range(-0.03, 0.03), tier: 'water', verts };
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
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const s of segments) {
    minX = Math.min(minX, s.dx - s.w / 2);
    maxX = Math.max(maxX, s.dx + s.w / 2);
    minY = Math.min(minY, s.dy - s.h / 2);
    maxY = Math.max(maxY, s.dy + s.h / 2);
  }
  const extX = Math.max(Math.abs(minX - s0.dx), Math.abs(maxX - s0.dx));
  const extY = Math.max(Math.abs(minY - s0.dy), Math.abs(maxY - s0.dy));

  return { x: cx, y: cy, w: extX * 2, h: extY * 2, angle: 0, tier: 'river',
           segments, groupId: 'river' }; // groupId：同一生成调用产出的连通水体标识
}

// 2026-10-05 strip 级一体化河流：横向蜿蜒贯穿整条 strip（参考公路一体化）。
// 在 strip 坐标 [0,totalW]×[0,stripH] 生成；返回 river covers 数组。
// 2026-10-05 修订：河段按道路方式沿曲线短段铺设（~120px 步长，带角度），
// 替代旧的 800px 长直段——旧版如砖块堆砌，视觉粗糙。
// 2026-10-05 三河形（按种随机）：
//   H2  双横贯（一条贴北一条贴南，蜿蜒反相）；
//   H1T 一横贯干流 + 一条短支流（中途汇入干流，或收束成湖）；
//   V   纵贯（从上边流到下边，1~2 条）。
function placeStripRivers(rng, totalW, stripH, roadCovers, roadW) {
  const rivers = [];
  const thick = Math.min(totalW, stripH) * rng.range(0.07, 0.15); // 2026-10-05：河宽 2-3 倍（~ stripH 的 7~15%，带变化）
  let gid = 0;
  // 由控制点建河：Catmull-Rom 采样 ~120px 短段（带角度，25% 搭接）。
  // taperFn(t) 可选：t∈[0,1] 沿程比例，返回宽度系数（支流汇入处收分用）。
  const buildRiver = (ctrl, w, taperFn) => {
    const pts = _catmullRomSample(ctrl, 120);
    const segments = [];
    for (let j = 0; j < pts.length - 1; j++) {
      const a = pts[j], b = pts[j + 1];
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      if (dist < 5) continue;
      const t = j / Math.max(1, pts.length - 2);
      const wf = taperFn ? taperFn(t) : 1;
      segments.push({
        dx: (a.x + b.x) / 2, dy: (a.y + b.y) / 2,
        w: dist * 1.25, h: w * wf,
        angle: Math.atan2(b.y - a.y, b.x - a.x)
      });
    }
    if (!segments.length) return null;
    const s0 = segments[0];
    return { x: s0.dx, y: s0.dy, w: totalW, h: stripH, angle: 0,
             tier: 'river', segments: segments, groupId: 'strip-river-' + (gid++) };
  };
  // 横向控制点：baseY + 正弦蜿蜒
  const hCtrl = (baseY, amp, phase, freq, x0, x1) => {
    const ctrl = [];
    const n = Math.max(4, Math.round((x1 - x0) / 600));
    for (let i = 0; i <= n; i++) {
      const cx = x0 + (i / n) * (x1 - x0);
      const cy = baseY + Math.sin(phase + (i / n) * Math.PI * 2 * freq) * amp;
      ctrl.push({ x: cx, y: Math.max(thick, Math.min(stripH - thick, cy)) });
    }
    return ctrl;
  };
  // 纵向控制点：baseX + 正弦蜿蜒
  const vCtrl = (baseX, amp, phase, freq, y0, y1) => {
    const ctrl = [];
    const n = Math.max(4, Math.round((y1 - y0) / 600));
    for (let i = 0; i <= n; i++) {
      const cy = y0 + (i / n) * (y1 - y0);
      const cx = baseX + Math.sin(phase + (i / n) * Math.PI * 2 * freq) * amp;
      ctrl.push({ x: Math.max(thick, Math.min(totalW - thick, cx)), y: cy });
    }
    return ctrl;
  };

  const pattern = rng.int(0, 2);  // 0=H2, 1=H1T, 2=V
  // 2026-10-05：路 Y 向密度直方图——横向河选路稀疏带，避免平行重叠
  const roadYDensity = (y, halfWin) => {
    let d = 0;
    for (const r of roadCovers) {
      const rw = (r.w || 0), rh = (r.h || 0);
      // 路的 Y 向半宽（考虑旋转）
      const a = r.angle || 0;
      const yHalf = (rw * Math.abs(Math.sin(a)) + rh * Math.abs(Math.cos(a))) / 2;
      const dist = Math.abs(r.y - y);
      if (dist < yHalf + halfWin) d += 1;
    }
    return d;
  };
  const pickClearY = (yMin, yMax, halfWin) => {
    let bestY = (yMin + yMax) / 2, bestD = Infinity;
    for (let i = 0; i <= 20; i++) {
      const y = yMin + (yMax - yMin) * i / 20;
      const d = roadYDensity(y, halfWin);
      if (d < bestD) { bestD = d; bestY = y; }
    }
    return bestY;
  };
  // 2026-10-05：平行重叠检测——河段与路平行（<30°）且近距（<120px）的比例
  const parallelOverlapRatio = (river) => {
    if (!river || !river.segments) return 0;
    let bad = 0;
    const getDir = (c) => {
      let a = c.angle || 0;
      if ((c.w || 0) < (c.h || 0)) a += Math.PI / 2;
      return ((a % Math.PI) + Math.PI) % Math.PI;
    };
    for (const s of river.segments) {
      const sDir = getDir(s);
      for (const r of roadCovers) {
        if (r.tier !== 'road') continue;
        const dx = Math.abs(s.dx - r.x), dy = Math.abs(s.dy - r.y);
        // 快速 AABB
        if (dx > 300 || dy > 300) continue;
        const rDir = getDir(r);
        let diff = Math.abs(sDir - rDir) % Math.PI;
        const acute = Math.min(diff, Math.PI - diff) * 180 / Math.PI;
        // 平行（<30°）且 Y 向接近
        if (acute < 30 && dy < (s.h + r.h) / 2 + 60) { bad++; break; }
      }
    }
    return river.segments.length ? bad / river.segments.length : 0;
  };
  if (pattern === 0) {
    // H2：双横贯，一北一南，反相蜿蜒——Y 选路稀疏带，平行重叠超30%则重试
    const amp = stripH * rng.range(0.04, 0.07);
    const ph = rng() * Math.PI * 2, fr = rng.range(1.5, 2.5);
    const halfWin = thick / 2 + (roadW || 100) / 2 + 80;
    const tryBuildH2 = (y1, y2) => {
      const r1 = buildRiver(hCtrl(y1, amp, ph, fr, 0, totalW), thick);
      const r2 = buildRiver(hCtrl(y2, amp, ph + Math.PI, fr, 0, totalW), thick * 0.85);
      return [r1, r2];
    };
    let y1 = pickClearY(stripH * 0.15, stripH * 0.45, halfWin);
    let y2 = pickClearY(stripH * 0.55, stripH * 0.85, halfWin);
    if (Math.abs(y2 - y1) < thick * 3) {
      y2 = y1 < stripH / 2 ? Math.min(stripH * 0.85, y1 + thick * 3) : Math.max(stripH * 0.55, y1 - thick * 3);
    }
    let [r1, r2] = tryBuildH2(y1, y2);
    // 重试：平行重叠>30%则换 Y（最多3次）
    for (let attempt = 0; attempt < 3; attempt++) {
      const ratio1 = parallelOverlapRatio(r1);
      const ratio2 = parallelOverlapRatio(r2);
      if (ratio1 <= 0.3 && ratio2 <= 0.3) break;
      // 换 Y：在原范围内偏移
      y1 = stripH * rng.range(0.15, 0.45);
      y2 = stripH * rng.range(0.55, 0.85);
      if (Math.abs(y2 - y1) < thick * 3) continue;
      [r1, r2] = tryBuildH2(y1, y2);
    }
    if (r1) rivers.push(r1);
    if (r2) rivers.push(r2);
  } else if (pattern === 1) {
    // H1T：横贯干流 + 短支流汇入（或收束成湖）——干流 Y 选路稀疏带，重试3次
    const halfWinH1 = thick / 2 + (roadW || 100) / 2 + 80;
    const amp = stripH * rng.range(0.04, 0.07);
    const ph = rng() * Math.PI * 2, fr = rng.range(1.5, 2.5);
    let baseY = pickClearY(stripH * 0.30, stripH * 0.70, halfWinH1);
    let trunk = buildRiver(hCtrl(baseY, amp, ph, fr, 0, totalW), thick);
    for (let attempt = 0; attempt < 3; attempt++) {
      if (parallelOverlapRatio(trunk) <= 0.3) break;
      baseY = stripH * rng.range(0.30, 0.70);
      trunk = buildRiver(hCtrl(baseY, amp, ph, fr, 0, totalW), thick);
    }
    if (trunk) rivers.push(trunk);
    // 支流：从上/下边出发，中途汇入干流
    const fromNorth = rng() < 0.5;
    const jx = totalW * rng.range(0.30, 0.70);  // 汇入点 x
    // 干流在 jx 处的 y（近似：用同参数正弦估算）
    const jy = Math.max(thick, Math.min(stripH - thick,
      baseY + Math.sin(ph + (jx / totalW) * Math.PI * 2 * fr) * amp));
    const sx = jx + rng.range(-400, 400);
    const startY = fromNorth ? thick * 0.5 : stripH - thick * 0.5;
    const midX = (sx + jx) / 2 + rng.range(-150, 150);
    const midY = (startY + jy) / 2;
    // 50% 概率支流源头有湖：先定湖（blob），支流起点止于湖边（不伸进湖心）
    let lakeR = 0, lakeX = sx, lakeY = startY;
    // 2026-10-05：删除湖泊元素，不再生成（用户要求）
    const hasLake = false;
    if (hasLake) {
      lakeR = thick * rng.range(1.8, 2.5);
      // 湖心略偏离支流起点（自然感），支流从湖边出发
      lakeX = sx + rng.range(-lakeR * 0.3, lakeR * 0.3);
      lakeY = startY + (fromNorth ? lakeR * 0.6 : -lakeR * 0.6);
    }
    const tribStartY = hasLake
      ? (fromNorth ? lakeY + lakeR * 0.8 : lakeY - lakeR * 0.8)
      : startY;
    // 支流末端收分（汇入干流处 1.0→0.55，避免矩形叠印出戏）；无湖时源头也收分
    const trib = buildRiver(
      [{ x: sx, y: tribStartY }, { x: midX, y: midY }, { x: jx, y: jy }],
      thick * 0.6,
      (t) => {
        let f = 1;
        if (t > 0.75) f = 1 - (t - 0.75) / 0.25 * 0.45;  // 末端收至 0.55
        if (!hasLake && t < 0.2) f = Math.min(f, 0.55 + t / 0.2 * 0.45);  // 源头收分
        return f;
      });
    if (trib) rivers.push(trib);
    if (hasLake) {
      // 湖：14~18 顶点凸包 blob（仿 placeCentralPond），非矩形
      const N = rng.int(14, 18), rot = rng() * Math.PI * 2, pts = [];
      for (let i = 0; i < N; i++) {
        const a = rot + (i / N) * Math.PI * 2;
        const rr = lakeR * rng.range(0.82, 1.0);
        pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
      }
      const verts = convexHull(pts);
      let maxx = 0, maxy = 0;
      for (const [vx, vy] of verts) { maxx = Math.max(maxx, Math.abs(vx)); maxy = Math.max(maxy, Math.abs(vy)); }
      rivers.push({
        x: lakeX, y: lakeY, w: maxx * 2, h: maxy * 2, angle: rng.range(-0.05, 0.05),
        tier: 'water', verts: verts, groupId: 'strip-lake-' + (gid++),
        segments: [{ dx: lakeX, dy: lakeY, w: maxx * 2, h: maxy * 2, angle: 0 }]
      });
    }
  } else {
    // V：纵贯，1~2 条（从上边流到下边）
    const n = rng.int(1, 2);
    for (let i = 0; i < n; i++) {
      const baseX = totalW * (n === 1 ? rng.range(0.35, 0.65)
        : (i === 0 ? rng.range(0.25, 0.40) : rng.range(0.60, 0.75)));
      const amp = totalW * 0.015 + stripH * rng.range(0.02, 0.04);
      const r = buildRiver(
        vCtrl(baseX, amp, rng() * Math.PI * 2, rng.range(1.0, 2.0), 0, stripH),
        thick * (i === 0 ? 1 : 0.85));
      if (r) rivers.push(r);
    }
  }
  return rivers;
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
    // ISSUE 7(a)：径向 blob（12~16 顶点，每顶点半径抖动 0.8~1.2），经凸包收敛为凸形；
    // w/h = 实际外接 bbox（按轴分别计算最大半幅）。mud 不阻挡移动，但保持凸形供 getCoverUnderTank 安全。
    const rx = mw / 2, ry = mh / 2;
    const N = rng.int(12, 16);
    const rot = rng() * Math.PI * 2;
    const pts = [];
    for (let i = 0; i < N; i++) {
      const a = rot + (i / N) * Math.PI * 2;
      const f = rng.range(0.8, 1.2);
      pts.push([Math.cos(a) * rx * f, Math.sin(a) * ry * f]);
    }
    const verts = convexHull(pts);
    let maxx = 0, maxy = 0;
    for (const [vx, vy] of verts) { maxx = Math.max(maxx, Math.abs(vx)); maxy = Math.max(maxy, Math.abs(vy)); }
    out.push({ x: centerX + Math.cos(ang) * rr, y: centerY + Math.sin(ang) * rr,
               w: maxx * 2, h: maxy * 2, angle: rng.range(-0.2, 0.2), tier: 'mud', verts });
  }
  return out;
}

// #A11 + 2026-09-14 曲线路网重做: Map-level Road Network generation
// 生成 2~3 条曲线主干道（Catmull-Rom 平滑折线）+ 稀疏曲线分支。
// 道路以「短 OBB 链段」写回（tier 'road'，groupId 同链）供避让/村庄贴边/碰撞等
// 既有 OBB 消费方零改动复用；链段首尾相接，渲染层按 groupId 重建平滑折线后
// 整条预烘焙（mvp bakeNodeGroundLayer，进图前绘制，避免逐段实时绘制与远距消失）。
// avoidBoxes: 模板 full 建筑世界坐标 OBB 列表（优先于路：链段压全高建筑则跳过该段，
// 保证全高骨架不被路网吞掉 —— #77 cull 保护契约）。
// Catmull-Rom 样条采样：control 折线 → 密集采样点（步长 ≈ ROAD_SAMPLE_STEP 世界px）。
function _catmullRomSample(points, step) {
  if (!Array.isArray(points) || points.length < 2) return (points || []).slice();
  if (points.length === 2) {
    // 两点直线：按步长均匀细分（保持链段密度一致）
    const a = points[0], b = points[1];
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(1, Math.ceil(d / step));
    const out = [];
    for (let i = 0; i < n; i++) out.push({ x: a.x + (b.x - a.x) * i / n, y: a.y + (b.y - a.y) * i / n });
    out.push({ x: b.x, y: b.y });
    return out;
  }
  const P = [points[0]].concat(points, [points[points.length - 1]]);
  const out = [];
  for (let i = 1; i < P.length - 2; i++) {
    const p0 = P[i - 1], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2];
    const segLen = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const steps = Math.max(2, Math.ceil(segLen / step));
    for (let s = 0; s < steps; s++) {
      const t = s / steps, t2 = t * t, t3 = t2 * t;
      out.push({
        x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)
      });
    }
  }
  out.push({ x: points[points.length - 1].x, y: points[points.length - 1].y });
  return out;
}

// 沿采样折线铺设链段（首尾相接，段间搭接防接缝）；isSegOk(seg) 命中即弃。
function _emitRoadChain(out, pts, roadW, groupId, isSegOk) {
  for (let j = 0; j < pts.length - 1; j++) {
    const a = pts[j], b = pts[j + 1];
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    if (dist < 2) continue;
    const seg = {
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
      w: dist + roadW * 0.35,
      h: roadW,
      angle: Math.atan2(b.y - a.y, b.x - a.x),
      tier: 'road',
      groupId: groupId
    };
    if (isSegOk && !isSegOk(seg)) continue;
    out.push(seg);
  }
}

// 2026-09-16 路网重做 v2（用户反馈：① 交叉处没有「路口」感、只是机械叠加
// ② 所有地图看起来都是横竖各一条公路）——在 v1「正交双干道」基础上再修两点：
//
// 【v1 已解决并保留】连通（不再按建筑逐段跳段）、路头（端点落节点边界 + lineCap:'butt'）、
//   避免浅角互穿（端点漂移 ±0.42→±0.13、控制点 ±0.18→±0.04）。
//
// 【v2-a 拓扑多样性】旧拓扑恒为「1 横 + 0~1 纵」，即每次都是同一个十字（实测 70/84），
//   且 `wide = halfW >= halfH` 恒 true（7 个模板全为横向）→ 纵干道永为配角、最多 1 条。
//   v2 改为按 rng 从 **6 种拓扑** 抽取：单条贯通 / 十字 / 单侧 T 形 / 双侧 T 形 /
//   双同向平行（错位）/ 三岔。主轴不再绑定地图长边（横纵各由 rng 掷出）。
//   关键设计：**T 形支道锚定在干道上**（起点 = 干道上的点，终点 = 垂直边的边界线），
//   因此恒为「真 T 形 + 恰好 1 个路口」，不会像「另一条贯穿道路」那样与其它路再次相交
//   （否则同一节点会出现 3 个路口 = 用户反对的「路口太多」）。
//   **平行拓扑用错位端点**：两条同向道的沿轴位置分居两个半区（不相交）→ 0 路口，
//   提供「错位街区」的另一种地貌。
//
// 【v2-b 路口感=渲染问题，不只是几何】v1 把每条链**各自独立描边三遍**，后画的链
//   整幅（路基+沥青+中心虚线）盖在前一条之上，且两条链的中心虚线都笔直穿过交点
//   → 视觉上就是「两条路叠在一起」。v2 改为**分两遍**渲染（见 mvp bakeNodeGroundLayer）：
//   第 1 遍所有链的路基+沥青（交叉处自然合并为一片连续沥青广场），
//   第 2 遍统一画中心虚线并**在路口处断线**（roadJunctions 由本函数返回）——这才是
//   真实交叉路口的读法。故本函数额外返回 junctions。
//
// 道路仍以「短 OBB 链段」写回（tier 'road'、同链共享 groupId）供村庄贴边/碰撞等既有
// OBB 消费方零改动复用。
//
// 返回 { covers, junctions }：junctions = [{x,y,r}] 路口中心与半径（供渲染层断标线）。
function placeRoadNetwork(rng, tpl, scale, centerX, centerY, opts) {
  // §14.2 横向贯通干道约束（strip 片，additive）：opts.requireWETrunk 为 true 时，
  // 保证至少一条干道端点落在片的左右（W/E）边界线上（§10.1 端点口径）。
  // 缺省关闭，既有 7 拓扑行为零变化。
  opts = opts || {};
  // #E2/#E3（2026-09-20）：路宽/弯曲/斜向参数收口 RULES.nodeMap.road（旧硬编码 60~80、amp 0.04）。
  const rc = (typeof RULES !== 'undefined' && RULES.nodeMap && RULES.nodeMap.road) ? RULES.nodeMap.road : {};
  const roadW = rng.range(rc.widthMin || 92, rc.widthMax || 124); // 公路加宽（90~124 世界px）
  const out = [];
  const halfW = tpl.w * scale / 2, halfH = tpl.h * scale / 2;

  const worldMinX = centerX - halfW, worldMaxX = centerX + halfW;
  const worldMinY = centerY - halfH, worldMaxY = centerY + halfH;
  const segInBounds = (seg) =>
    seg.x >= worldMinX && seg.x <= worldMaxX && seg.y >= worldMinY && seg.y <= worldMaxY;
  const isSegOk = (seg) => segInBounds(seg);

  const ROAD_SAMPLE_STEP = 110;
  const chains = [];   // { groupId }：供渲染层分两遍描绘 + 路口求交

  // 边 → 端点（严格落在节点边界线上，端帽被画布裁掉 = 延伸出画面）
  // edge ∈ {0:N, 1:S, 2:W, 3:E}；t = 沿边位置（-1..1，相对该边半长）
  const edgePoint = (edge, t) => {
    if (edge === 0) return { x: centerX + t * halfW, y: worldMinY };
    if (edge === 1) return { x: centerX + t * halfW, y: worldMaxY };
    if (edge === 2) return { x: worldMinX, y: centerY + t * halfH };
    return { x: worldMaxX, y: centerY + t * halfH };
  };

  // 由「两端点 + 轻微弯曲」构建一条道路并铺设链段，**返回实际采样折线**。
  // 返回折线很关键：T 形支道必须锚定在干道**真实折线上**的某点。若只按「干道端点连线的
  // 猜测 y」取锚点，会因干道自身 ±4% 跨度的弯曲（≈±96px > 半个路宽）而错开，
  // 支道起点悬空 → 路面出现缺口（实测 210 张里 118 处孤悬路头）。
  const buildFromPoints = (p1, p2, groupId, amp, tan1) => {
    const span = Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1;
    const ux = (p2.x - p1.x) / span, uy = (p2.y - p1.y) / span;
    const nx = -uy, ny = ux;
    const a = (amp === undefined) ? (rc.curveAmp !== undefined ? rc.curveAmp : 0.16) : amp;
    const nCtrl = rng.int(1, 2);
    const ctrl = [p1];
    if (tan1) {
      // G1 切线连续（2026-10-05 接缝平滑）：首个控制点沿给定切线方向放置，
      // 使样条在 p1 处的切线与 tan1 一致，跨片公路视觉平滑无折角
      const tDist = span * 0.3;
      const tl = Math.hypot(tan1.x, tan1.y) || 1;
      ctrl.push({ x: p1.x + (tan1.x / tl) * tDist, y: p1.y + (tan1.y / tl) * tDist });
      for (let c = 2; c <= nCtrl; c++) {
        const t = c / (nCtrl + 1);
        const off = rng.range(-a, a) * span;
        ctrl.push({ x: p1.x + ux * span * t + nx * off, y: p1.y + uy * span * t + ny * off });
      }
    } else {
      for (let c = 1; c <= nCtrl; c++) {
        const t = c / (nCtrl + 1);
        // 弯曲幅度必须小：局部斜率偏移会把正交路口变成浅角互穿（v1 的 35° 病根）
        const off = rng.range(-a, a) * span;
        ctrl.push({ x: p1.x + ux * span * t + nx * off, y: p1.y + uy * span * t + ny * off });
      }
    }
    ctrl.push(p2);
    const pts = _catmullRomSample(ctrl, ROAD_SAMPLE_STEP);
    // 强制首末端点精确落在指定位置（样条采样可能因步长对齐产生微小偏差）
    pts[0] = { x: p1.x, y: p1.y };
    pts[pts.length - 1] = { x: p2.x, y: p2.y };
    _emitRoadChain(out, pts, roadW, groupId, isSegOk);
    chains.push({ groupId: groupId, pts: pts });
    return pts;
  };

  const R = () => rng.range(-0.20, 0.20);   // #E2：端点沿边偏移扩大（旧 ±0.13）→ 干线自带倾角
  const bAmp = rc.branchCurveAmp !== undefined ? rc.branchCurveAmp : 0.10;
  const diagChance = rc.diagChance !== undefined ? rc.diagChance : 0.45;
  const diagMin = rc.diagAngleMin !== undefined ? rc.diagAngleMin : 0.18;
  const diagMax = rc.diagAngleMax !== undefined ? rc.diagAngleMax : 0.52;
  const H = (i) => buildFromPoints(edgePoint(2, R()), edgePoint(3, R()), 'main-road-h' + i);   // 西→东
  const V = (i) => buildFromPoints(edgePoint(0, R()), edgePoint(1, R()), 'main-road-v' + i);   // 北→南
  // #E2（2026-09-20）：斜向干线——倾斜角 θ∈[diagAngleMin, diagAngleMax]，端点沿边界按 tanθ 错开，
  // 打破「路网全是横平竖直」的观感。跨度取 2×halfW（横）/ 2×halfH（纵），落差 = tanθ × 跨度。
  const DH = (i) => {
    const th = rng.range(diagMin, diagMax) * (rng() < 0.5 ? 1 : -1);
    const dy = Math.tan(th) * (2 * halfW);
    const t = Math.max(-0.85, Math.min(0.85, dy / ((2 * halfH) || 1)));
    const [a, b] = (rng() < 0.5) ? spanH(-t * 0.5, t * 0.5) : spanH(t * 0.5, -t * 0.5);
    return buildFromPoints(a, b, 'main-road-d' + i);
  };
  const DV = (i) => {
    const th = rng.range(diagMin, diagMax) * (rng() < 0.5 ? 1 : -1);
    const dx = Math.tan(th) * (2 * halfH);
    const t = Math.max(-0.85, Math.min(0.85, dx / ((2 * halfW) || 1)));
    const [a, b] = (rng() < 0.5) ? spanV(-t * 0.5, t * 0.5) : spanV(t * 0.5, -t * 0.5);
    return buildFromPoints(a, b, 'main-road-d' + i);
  };
  // 干线：按 diagChance 决定轴向或斜向（斜向时横/纵随机）
  const TRUNK = (i) => (rng() < diagChance ? (rng() < 0.5 ? DH(i) : DV(i))
                                          : (rng() < 0.5 ? H(i) : V(i)));
  // #G：近正交纵路（端点错位收紧 ±0.08）——街区拓扑（G/I）里纵路多达 2 条，若沿用干线
  // 错位 ±0.20，横向模板（halfW≫halfH）的纵路会斜到与横干夹角 <60°（#B7 浅角护栏）。
  const VT = (i) => buildFromPoints(
    edgePoint(0, rng.range(-0.08, 0.08)), edgePoint(1, rng.range(-0.08, 0.08)), 'main-road-v' + i);
  // 在一条已有道路的真实折线上取锚点（按沿程比例 u∈(0,1)，避开两端 8%）
  const anchorOn = (pts, u) => {
    const k = Math.min(pts.length - 1, Math.max(0, Math.round(u * (pts.length - 1))));
    return { x: pts[k].x, y: pts[k].y };
  };
  // T 形支道：从横干道折线上的锚点向北或南延伸至该侧边界线 → 恒为 1 个 T 形路口。
  // #G（2026-09-21 修复浅角根因）：支道**不弯曲**（amp=0）+ 终点沿边偏移收紧 ±0.04。
  // 旧实现沿用支道振幅 bAmp(0.10) 沿**整条干道跨度**折算——支道自身跨度只有半幅，同样的
  // 振幅百分比折算到支道上产生大得多的局部斜率，与斜干相交时实测夹角低至 36.9°
  // （urban_block seed6，#B7 ≥60° 护栏的盲区）。支道走直线：与干道的交角稳定在 90°−斜干偏角。
  const TH = (i, trunkPts, u) => {
    const side = rng() < 0.5 ? 0 : 1;                       // 0:向北 1:向南
    const ay = (side === 0) ? worldMinY : worldMaxY;
    const a = anchorOn(trunkPts, u);
    buildFromPoints(a, { x: a.x + rng.range(-0.04, 0.04) * halfW, y: ay }, 'main-road-t' + i, 0);
  };
  // T 形支道：从纵干道折线上的锚点向东或西延伸至该侧边界线
  const TV = (i, trunkPts, u) => {
    const side = rng() < 0.5 ? 2 : 3;                       // 2:向西 3:向东
    const ax = (side === 2) ? worldMinX : worldMaxX;
    const a = anchorOn(trunkPts, u);
    buildFromPoints(a, { x: ax, y: a.y + rng.range(-0.04, 0.04) * halfH }, 'main-road-t' + i, 0);
  };

  // 直接构造「贯穿路」的两端点（供平行拓扑用错位半区端点）
  const spanH = (tA, tB) => [edgePoint(2, tA), edgePoint(3, tB)];
  const spanV = (tA, tB) => [edgePoint(0, tA), edgePoint(1, tB)];

  // 拓扑：每种最多 2 个路口（用户明确反对「路口太多」，故不设三岔拓扑）。
  // #E2（2026-09-20）：在保持六拓扑骨架的前提下混入斜向干线；十字拓扑固定「横干线 × 纵干线」
  // 以保证交点必然存在（斜向横干道仍会与纵干道相交）。
  // #G（2026-09-21 用户需求 #4「更复杂的路网」）：重排概率并新增两种街区感拓扑（路口数仍 ≤2）：
  //   G 网格街区（正交横干 + 两条贯穿纵路 → 「日」字形街区，恰 2 路口、3 条路）；
  //   I 双干贯穿（两条近平行横干 + 一条贯穿纵干 → 2 路口，环形路网雏形）。
  //   旧 F「斜向丁字对」删除（#G 2026-09-21）：斜干线弯曲后与正交支道的实测交角可低至 36.9°
  //   （urban_block seed6），无法稳定满足 #B7 的 ≥60° 护栏——斜干线观感已由 B/C/E 的
  //   diagChance 分支保留；删 F 后其 8% 份额并入 A/G/I。
  const topoRoll = rng();
  if (topoRoll < 0.12) {
    // A 单条贯通（12%）：只有一条主路，0 路口，最稀疏
    TRUNK(0);
  } else if (topoRoll < 0.34) {
    // B 十字（22%）：横（可斜）+ 纵各一条 → 1 个路口
    if (rng() < diagChance) DH(0); else H(0);
    V(0);
  } else if (topoRoll < 0.48) {
    // C 单侧 T 形（14%）：一条贯通干道 + 一条锚定支道 → 1 个 T 形路口。
    // #G：纵干分支固定用正交 V（不抽 DV）——DV 在宽模板（halfW≫halfH）下实际倾角可达 ~59°，
    // 与水平支道 TV 的交角贴住 #B7 的 60° 护栏（corridor_tutorial seed6 实测 59.2°）；
    // 斜向观感由横干分支的 DH 保留。
    if (rng() < 0.5) {
      const t = (rng() < diagChance) ? DH(0) : H(0);
      TH(0, t, rng.range(0.25, 0.75));
    } else {
      TV(0, V(0), rng.range(0.25, 0.75));
    }
  } else if (topoRoll < 0.62) {
    // E 双侧 T 形（14%）：干道两侧各一条锚定支道 → 2 个分离的 T 形路口
    const t = (rng() < diagChance) ? DH(0) : H(0);
    TH(0, t, rng.range(0.18, 0.40));
    TH(1, t, rng.range(0.60, 0.82));
  } else if (topoRoll < 0.76) {
    // D 双同向平行（14%）：两条道分居上下/左右半区（错位、不相交）→ 0 路口，街区感。
    // #G（2026-09-21 修复）：端点错位收紧 ±0.05 + 弯曲收紧 0.05 —— 旧实现两端点独立 ±0.62~−0.24
    // 抽取，链自身可斜跨半区，两条「平行」路在弯曲下以 <10° 浅角互穿（实测 urban_block seed
    // 2086 出现 5.1° 交叉；旧 rng 序列未踩中该分支，#B7 夹角护栏存在盲区）。
    if (rng() < 0.5) {
      const c1 = rng.range(-0.55, -0.32), c2 = rng.range(0.32, 0.55);
      const [a1, b1] = spanH(c1, c1 + rng.range(-0.05, 0.05));
      const [a2, b2] = spanH(c2, c2 + rng.range(-0.05, 0.05));
      buildFromPoints(a1, b1, 'main-road-h0', 0.05); buildFromPoints(a2, b2, 'main-road-h1', 0.05);
    } else {
      const c1 = rng.range(-0.55, -0.32), c2 = rng.range(0.32, 0.55);
      const [a1, b1] = spanV(c1, c1 + rng.range(-0.05, 0.05));
      const [a2, b2] = spanV(c2, c2 + rng.range(-0.05, 0.05));
      buildFromPoints(a1, b1, 'main-road-v0', 0.05); buildFromPoints(a2, b2, 'main-road-v1', 0.05);
    }
  } else if (topoRoll < 0.86) {
    // G 网格街区（12%，#G 新增）：一条正交横干 + 两条独立贯穿纵路（错位端点，各与干道交 1 次）。
    // 干道固定正交（H）而非斜向：斜干 × 纵路的浅角互穿会把「十字」变成多交点 + 小夹角
    // （#B7 夹角护栏 ≥60°）。两纵路端点分居不同半区 → 彼此不相交 ⇒ 恰 2 路口、3 条路。
    H(0);
    VT(0); VT(1);
  } else {
    // I 双干贯穿（14%，#G 新增）：两条近平行横干（端点错位收紧 ±0.05，防浅角互穿）+
    // 一条贯穿纵干 → 2 路口（环形路网雏形）
    const t1a = rng.range(-0.55, -0.35), t1b = t1a + rng.range(-0.05, 0.05);
    const t2a = rng.range(0.35, 0.55), t2b = t2a + rng.range(-0.05, 0.05);
    const [a1, b1] = spanH(t1a, t1b);
    const [a2, b2] = spanH(t2a, t2b);
    buildFromPoints(a1, b1, 'main-road-h0', 0.05); buildFromPoints(a2, b2, 'main-road-h1', 0.05);
    VT(0);
  }

  // §14.2 横向贯通干道约束（strip 片，additive）：
  //   opts.requireWETrunk —— 保证至少一条 W→E 干道（端点严格落在左右边界线上，
  //     §10.1 端点口径）；缺省关闭，既有 7 拓扑零变化。
  //   opts.trunkAmp —— W→E 干道的弯曲振幅（相对跨度的比例）；缺省 0.16。
  //     strip 级调用时传小值（如 0.03），避免宽幅模板下曲线跑出界被裁出缺口。
  //   opts.weTrunk = { entryT, entryTan } —— 贯通路链：强制一条 W→E 干道作为"贯通路"，
  //     其入口 t 衔接上一片的出口 t、入口切线衔接上一片的出口切线（generateStrip
  //     逐片传递），解决接缝处公路错位与折角出戏（G0 位置 + G1 切线连续）。
  //     weTrunk 蕴含 requireWETrunk。
  // 返回 weTrunk: { entryT, exitT, exitTan }（t 为 edgePoint 口径的边相对偏移；
  //   exitTan 为出口切线方向向量）。
  // buildFromPoints 强制首末端点精确落位，故用折线端点 x 判定（容差 1px 吸收浮点误差）。
  // rrng 子流保证确定性。
  let weTrunk = null;
  const isWEChain = (c) => {
    const p = c.pts;
    return p && p.length > 1 &&
      Math.abs(p[0].x - worldMinX) < 1 &&
      Math.abs(p[p.length - 1].x - worldMaxX) < 1;
  };
  const tOfWEChain = (c) => {
    const p = c.pts;
    return {
      entryT: (p[0].y - centerY) / halfH,
      exitT: (p[p.length - 1].y - centerY) / halfH
    };
  };
  if (opts.weTrunk) {
    const entryT = opts.weTrunk.entryT;
    const entryTan = opts.weTrunk.entryTan;  // G1：上一片出口切线（{x,y} 方向向量）
    const natural = chains.find(isWEChain);
    if (natural && entryT === undefined) {
      // 首片：复用拓扑自带的 W→E 干道作贯通路（避免与强制路重复）
      weTrunk = tOfWEChain(natural);
      // 补算出口切线（供下一片 G1 连续）
      const pts = natural.pts;
      if (pts && pts.length > 1) {
        const a = pts[pts.length - 2], b = pts[pts.length - 1];
        weTrunk.exitTan = { x: b.x - a.x, y: b.y - a.y };
      }
    } else {
      const eT = (entryT !== undefined) ? entryT : R();
      const xT = R();
      const pts = buildFromPoints(edgePoint(2, eT), edgePoint(3, xT), 'main-road-h' + chains.length,
        undefined, entryTan);
      weTrunk = { entryT: eT, exitT: xT };
      if (pts && pts.length > 1) {
        const a = pts[pts.length - 2], b = pts[pts.length - 1];
        weTrunk.exitTan = { x: b.x - a.x, y: b.y - a.y };
      }
    }
  } else if (opts.requireWETrunk) {
    const found = chains.find(isWEChain);
    if (found) {
      weTrunk = tOfWEChain(found);
    } else {
      const entryT = R(), exitT = R();
      const tamp = opts.trunkAmp !== undefined ? opts.trunkAmp : undefined;
      buildFromPoints(edgePoint(2, entryT), edgePoint(3, exitT), 'main-road-h' + chains.length, tamp);
      weTrunk = { entryT: entryT, exitT: exitT };
    }
  }

  // 路口：两两链的**采样折线**求交（聚类半径 = 路宽，同一路口只报一次）。
  // 用折线（而非链段 OBB）判定：T 形支道的锚点恰好落在干道折线上的某点，若改用
  // 「段中心 ± 半跨」的 OBB 口径，交点参数正好压在容差边界上，浮点噪声会让判定
  // 随机漏报（实测部分节点 junctions=0，即 T 形路口未被识别 → 标线不断开 = 没有路口感）。
  // 折线段求交是精确的：锚点必然同时位于两条折线上。
  const junctions = [];
  const segIntersect = (p1, p2, p3, p4) => {
    const d1x = p2.x - p1.x, d1y = p2.y - p1.y;
    const d2x = p4.x - p3.x, d2y = p4.y - p3.y;
    const den = d1x * d2y - d1y * d2x;
    if (Math.abs(den) < 1e-9) return null;
    const dx = p3.x - p1.x, dy = p3.y - p1.y;
    const t = (dx * d2y - dy * d2x) / den;
    const u = (dx * d1y - dy * d1x) / den;
    if (t < 0 || t > 1 || u < 0 || u > 1) return null;
    return { x: p1.x + d1x * t, y: p1.y + d1y * t };
  };
  // 容差外扩：折线段首尾相接处交点常落在端点（t≈0/1），允许 2px 溢出以吸收浮点误差
  for (let i = 0; i < chains.length; i++) {
    for (let j = i + 1; j < chains.length; j++) {
      const A = chains[i].pts, B = chains[j].pts;
      if (!A || !B) continue;
      for (let ai = 0; ai < A.length - 1; ai++) {
        for (let bi = 0; bi < B.length - 1; bi++) {
          const p = segIntersect(A[ai], A[ai + 1], B[bi], B[bi + 1]);
          if (p && !junctions.some(q => Math.hypot(q.x - p.x, q.y - p.y) < roadW)) {
            // #C1（2026-09-17 修复）：r 收敛到 roadW×0.5——圆内任意点到两条正交路中线的距离
            // ≤ r×sin(45°)=0.354w < 路半宽，恒在沥青并集内（旧 0.85w 在 45° 方向越过路缘 0.6w，
            // 形成外溢圆形凸斑）。此 r 供渲染层在路口断开中心虚线（详见 mvp bakeNodeGroundLayer）。
            junctions.push({ x: p.x, y: p.y, r: roadW * 0.5 });
          }
        }
      }
    }
  }
  return { covers: out, junctions: junctions, roadW: roadW, weTrunk: weTrunk };
}

// ISSUE 7(c) 重做 + #87 村庄分层生成：
//   第一层【道路】——采样 1~2 条贯穿村落区的街道（直线或轻折线段），以矩形条带实例
//     （tier:'road'，宽 60~80 世界px，角度沿街道轴向）直接写入 outCovers（ground 类：
//     参与绘制与通行系数、无碰撞推出）。RULES.coverTiers.road 缺失时降级为不生成道路并记 warn。
//   第二层【核心建筑】——沿街道两侧放置 4~7 栋全高建筑（tier 'full'），贴边偏移 =
//     路半宽 + 建筑半宽 + margin，朝向对齐街道轴；尺寸必须乘
//     RULES.nodeMap.coverWorldScale.full（默认 0.42）收敛——修复旧版 50~80×scale 直接放大
//     得 150~240px 的「过大」bug（收敛后 ≈63~101px @nodeScale=3）。
//   第三层【周边杂物】——剩余空域拒绝采样填充树/灌木/沙包(barricade)/岩石(无 rock tier 则
//     rubble)/低概率小水塘(water blob)，避让道路条带与建筑包围盒（obbHits 支持 road 条带占用）。
// 全程仅用注入 rng（调用方传 seed 派生的独立子流，跨难度同 seed 布局一致），同 seed 同结果。
const VILLAGE_SOLID = new Set(['full', 'building', 'half', 'barricade', 'tree', 'rock', 'stump', 'rubble', 'bridge', 'ruined', 'intact']);
function placeVillage(rng, tpl, scale, cx, cy, outCovers, networkRoads) {
  const coverTiers = (typeof RULES !== 'undefined' && RULES.coverTiers)
    ? RULES.coverTiers
    : (typeof COVER_TIERS !== 'undefined' ? COVER_TIERS : null);
  const cfgNodeMap = (typeof RULES !== 'undefined' && RULES.nodeMap) ? RULES.nodeMap : {};
  const cwsFull = (cfgNodeMap.coverWorldScale && typeof cfgNodeMap.coverWorldScale.full === 'number')
    ? cfgNodeMap.coverWorldScale.full : 1;
  const fullHp = (coverTiers && coverTiers.full && coverTiers.full.hp !== undefined)
    ? coverTiers.full.hp : 1;
  const hasRoadTier = !!(coverTiers && coverTiers.road);
  if (!hasRoadTier && typeof console !== 'undefined' && console.warn) {
    console.warn('[tank_nodegen] RULES.coverTiers.road 缺失——村庄跳过道路层（#87 降级路径）');
  }

  const out = [];
  const roads = [];

  // OBB 对 OBB 分离轴测试（SAT，4 轴）：供建筑/杂物精准避让旋转的道路条带
  // （不能用 AABB 包络近似——斜向长条带的包络远大于实际占位，会误拒所有沿街落位）
  const obbPts = (x, y, w, h, a) => {
    const cs = Math.cos(a || 0), sn = Math.sin(a || 0);
    const hx = w / 2, hy = h / 2;
    return [
      { x: x + cs * hx - sn * hy, y: y + sn * hx + cs * hy },
      { x: x + cs * hx + sn * hy, y: y + sn * hx - cs * hy },
      { x: x - cs * hx + sn * hy, y: y - sn * hx - cs * hy },
      { x: x - cs * hx - sn * hy, y: y - sn * hx + cs * hy }
    ];
  };
  const obbPairHits = (pa, aa, pb, ba) => {
    const axes = [[Math.cos(aa), Math.sin(aa)], [-Math.sin(aa), Math.cos(aa)],
                  [Math.cos(ba), Math.sin(ba)], [-Math.sin(ba), Math.cos(ba)]];
    for (const [ax, ay] of axes) {
      let aMin = Infinity, aMax = -Infinity, bMin = Infinity, bMax = -Infinity;
      for (const p of pa) { const d = p.x * ax + p.y * ay; if (d < aMin) aMin = d; if (d > aMax) aMax = d; }
      for (const p of pb) { const d = p.x * ax + p.y * ay; if (d < bMin) bMin = d; if (d > bMax) bMax = d; }
      if (aMax <= bMin || bMax <= aMin) return false;
    }
    return true;
  };
  const obbHits = (x, y, w, h, pad, c) =>
    obbPairHits(obbPts(x, y, w + pad * 2, h + pad * 2, c.angle === undefined ? 0 : c.angle),
                c.angle === undefined ? 0 : c.angle,
                obbPts(c.x, c.y, c.w, c.h, c.angle), c.angle);
  // 占位检查：道路条带（tier 'road'）+ 阻断移动实体 + 村落内部互压（扩展现原 hitsSolid）
  const hitsOccupied = (x, y, w, h, pad) => {
    for (const c of outCovers) {
      if (c.tier === 'road' || VILLAGE_SOLID.has(c.tier)) {
        if (obbHits(x, y, w, h, pad, c)) return true;
      }
    }
    for (const c of out) {
      if (obbHits(x, y, w, h, pad, c)) return true;
    }
    return false;
  };
  // ---- 第一层【道路】：优先复用地图级路网（#A11：village 沿路网选簇心而非自铺街道）----
  // 旧版自铺 1~2 条街道与全局路网（placeRoadNetwork 阶段 0）重复叠加 → 密度爆炸、挤掉
  // 全高建筑与中央水潭。现改为：placeVillage 接受 phase-0 已生成的路网（网络坐标），
  // 建筑直接沿这些路段贴边；仅当无路网可用时（降级路径）才自铺街道。
  // #E2（2026-09-20）：村落街道同样加宽（旧硬编码 60~80 → RULES.nodeMap.road 区间）
  const _rcfg = (typeof RULES !== 'undefined' && RULES.nodeMap && RULES.nodeMap.road) ? RULES.nodeMap.road : {};
  const roadW = rng.range(_rcfg.widthMin || 92, _rcfg.widthMax || 124);            // 街道条带宽（世界px）
  const spanBase = Math.min(tpl.w, tpl.h) * scale;
  const hasExternalRoads = !!(networkRoads && networkRoads.length);
  const useExternal = hasExternalRoads && hasRoadTier;
  if (!useExternal) {
    // 降级路径：自铺 1~2 条贯穿村落区的街道（直线或轻折线段）
    const nStreets = hasRoadTier ? rng.int(1, 2) : 0;
    const baseAng = rng() * Math.PI;
    for (let s = 0; s < nStreets; s++) {
      const ang = baseAng + s * Math.PI / 2 + rng.range(-0.25, 0.25);
      const len = spanBase * rng.range(0.55, 0.75);
      const segN = (nStreets === 1) ? 2 : rng.int(1, 2); // 单街保底拆 2 段（轻折线）
      const segLens = [];
      let rem = len;
      for (let i = 0; i < segN; i++) {
        const l = (i === segN - 1) ? rem : rem * rng.range(0.4, 0.6);
        segLens.push(l); rem -= l;
      }
      let ax = cx - Math.cos(ang) * len / 2;
      let ay = cy - Math.sin(ang) * len / 2;
      let curAng = ang;
      for (let i = 0; i < segN; i++) {
        if (i > 0) curAng += ((i % 2 === 1) ? 1 : -1) * rng.range(0.08, 0.22); // 轻折线偏转
        const l = segLens[i];
        const inst = {
          x: ax + Math.cos(curAng) * l / 2,
          y: ay + Math.sin(curAng) * l / 2,
          w: l + roadW * 0.4,                  // 段间搭接防接缝
          h: roadW,
          angle: curAng,
          tier: 'road',
          groupId: 'village-road'
        };
        if (coverTiers && coverTiers.road && coverTiers.road.hp !== undefined) inst.hp = coverTiers.road.hp;
        outCovers.push(inst);
        roads.push(inst);
        ax += Math.cos(curAng) * l;
        ay += Math.sin(curAng) * l;
      }
    }
  } else {
    // 复用地图级路网：建筑沿网络路段贴边（路段已在 generateNode Phase 0 写入 outCovers，
    // 此处只将段引用纳入 roads 供第二层建筑贴边锚定）
    for (const r of networkRoads) {
      roads.push(r);
    }
  }

  // ---- 第二层【核心建筑】：沿街两侧 4~7 栋，尺寸 ×coverWorldScale.full 收敛 ----
  const count = rng.int(4, 7);
  const minB = 50 * scale, maxB = 80 * scale;          // 模板单位基准
  const marginBase = rng.range(14, 34);                // 贴边间距（世界px）
  const lShapeCount = rng.int(1, 2);
  let lUsed = 0;
  const halfW = tpl.w * scale / 2, halfH = tpl.h * scale / 2;
  const tries = count * 16 + 60;
  let placedB = 0;
  for (let t = 0; t < tries && placedB < count; t++) {
    const bw = rng.range(minB, maxB) * cwsFull;               // 沿街向（×收敛系数）
    const bh = rng.range(minB * 0.72, maxB * 0.78) * cwsFull; // 垂街向（×收敛系数）
    let bx, by, bang;
    const st = roads.length ? roads[rng.int(0, roads.length - 1)] : null;
    if (st) {
      // 贴边偏移 = 路半宽 + 建筑半宽 + margin，两侧交替，朝向对齐街道轴
      const tt = rng.range(-0.42, 0.42);
      const side = (placedB % 2 === 0) ? 1 : -1;
      const off = st.h / 2 + bh / 2 + marginBase;
      const ca = Math.cos(st.angle), sa = Math.sin(st.angle);
      bx = st.x + ca * tt * st.w - sa * side * off;
      by = st.y + sa * tt * st.w + ca * side * off;
      bang = st.angle;
    } else {
      // 无道路降级路径：环中心散布（保留有机落位）
      const ang2 = rng() * Math.PI * 2;
      const rad = Math.max(bw, bh) * rng.range(1.0, 3.4);
      bx = cx + Math.cos(ang2) * rad;
      by = cy + Math.sin(ang2) * rad;
      bang = rng.range(-0.15, 0.15);
    }
    bang += rng.range(-0.04, 0.04);
    // 节点界内钳制（越界即弃，保持确定性）
    if (bx < cx - halfW + bw / 2 || bx > cx + halfW - bw / 2 ||
        by < cy - halfH + bh / 2 || by > cy + halfH - bh / 2) continue;
    if (hitsOccupied(bx, by, bw, bh, 6)) continue;
    // #A11 出生走廊保护：玩家出生点固定世界左缘 (0.10*W, H/2)，在 generateNode
    // 输出坐标系（centerX/centerY 标记的世界中心、covers 绝对坐标）下：
    //   世界左界 = centerX-halfW → 起点 x = centerX-halfW+0.10*2*halfW = centerX-0.8*halfW
    // 纵向=centerY。留 ±20% 半宽 × ±9% 半高通道，防止沿路建筑把左缘走廊封死。
    // （真实对局由 findPlayerSpawn 二次兜底，此保护从布局侧保证校准连通地板。）
    {
      const spawnXM = cx - 0.8 * halfW;   // 世界左缘 10%
      const kcX0 = spawnXM - halfW * 0.20, kcX1 = spawnXM + halfW * 0.20;
      const kcY0 = cy - halfH * 0.09, kcY1 = cy + halfH * 0.09;
      // 建筑矩形与走廊矩形相交 → 拒绝（保证出生走廊畅通）
      if (bx + bw / 2 > kcX0 && bx - bw / 2 < kcX1 && by + bh / 2 > kcY0 && by - bh / 2 < kcY1) {
        continue;
      }
    }
    if (lUsed < lShapeCount && rng() < 0.5) {
      // L 形凹口立面（缺角在右下），拆分为两个凸子块供碰撞使用
      const hx = bw / 2, hy = bh / 2;
      const nw = Math.min(hx, hy) * rng.range(0.35, 0.5); // 凹口宽
      const nh = Math.min(hx, hy) * rng.range(0.35, 0.5); // 凹口高
      const verts = [
        [-hx, -hy],
        [hx, -hy],
        [hx, -hy + nh],
        [hx - nw, -hy + nh],
        [hx - nw, hy],
        [-hx, hy]
      ];
      const collisionVerts = [
        [[-hx, -hy], [hx - nw, -hy], [hx - nw, hy], [-hx, hy]],
        [[hx - nw, -hy], [hx, -hy], [hx, -hy + nh], [hx - nw, -hy + nh]]
      ];
      out.push({ x: bx, y: by, w: bw, h: bh, angle: bang,
                 tier: 'full', verts, collisionVerts, hp: fullHp, groupId: 'village-building' });
      lUsed++;
    } else {
      out.push({ x: bx, y: by, w: bw, h: bh, angle: bang,
                 tier: 'full', hp: fullHp, groupId: 'village-building' });
    }
    placedB++;
  }

  // ---- 第三层【周边杂物】：树/灌木/沙包/岩石(或碎石)/低概率小水塘，避让道路与建筑 ----
  const clutterN = rng.int(6, 10);
  const rockOk = !!(coverTiers && coverTiers.rock);
  const clutterRad = Math.min(tpl.w, tpl.h) * 0.24 * scale; // 限村落邻域（兼 P-40 中央水域约束）
  let waterPlaced = false;
  const clutterTries = clutterN * 8 + 30;
  let placedC = 0;
  for (let t = 0; t < clutterTries && placedC < clutterN; t++) {
    // 2026-10-05：删除湖泊元素，不再生成（用户要求）——水塘禁用
    if (false && !waterPlaced && rng() < 0.15) {
      waterPlaced = true;
      const wr = rng.range(26, 40) * scale;
      const N = rng.int(10, 14);
      const rot = rng() * Math.PI * 2;
      const pts = [];
      for (let i = 0; i < N; i++) {
        const a = rot + (i / N) * Math.PI * 2;
        const f = rng.range(0.85, 1.0);
        pts.push([Math.cos(a) * wr * f, Math.sin(a) * wr * 0.75 * f]);
      }
      const verts = convexHull(pts);
      let maxx = 0, maxy = 0;
      for (const [vx, vy] of verts) { maxx = Math.max(maxx, Math.abs(vx)); maxy = Math.max(maxy, Math.abs(vy)); }
      const wx = cx + (rng() - 0.5) * 2 * clutterRad * 0.6;
      const wy = cy + (rng() - 0.5) * 2 * clutterRad * 0.6;
      if (!hitsOccupied(wx, wy, maxx * 2, maxy * 2, 8)) {
        const wInst = { x: wx, y: wy, w: maxx * 2, h: maxy * 2, angle: 0, tier: 'water', verts, groupId: 'village-pond' };
        if (coverTiers && coverTiers.water && coverTiers.water.hp !== undefined) wInst.hp = coverTiers.water.hp;
        out.push(wInst);
        placedC++;
      }
      continue;
    }
    // 普通杂物：加权池抽样 + 避让道路条带/建筑包围盒/互压
    const pool = ['tree', 'tree', 'bush', 'barricade', rockOk ? 'rock' : 'rubble'];
    const ctier = pool[rng.int(0, pool.length - 1)];
    let cw, ch;
    if (ctier === 'tree') { cw = rng.range(22, 26) * scale; ch = rng.range(16, 20) * scale; }
    else if (ctier === 'bush') { cw = rng.range(54, 64) * scale; ch = rng.range(28, 34) * scale; }
    else if (ctier === 'barricade') { cw = rng.range(19, 22) * scale; ch = rng.range(8, 9) * scale; } // ×coverWorldScale.barricade 等效收敛
    else { cw = rng.range(28, 36) * scale; ch = rng.range(18, 24) * scale; } // rock / rubble
    const cxx = cx + (rng() - 0.5) * 2 * clutterRad;
    const cyy = cy + (rng() - 0.5) * 2 * clutterRad;
    if (hitsOccupied(cxx, cyy, cw, ch, 8)) continue;
    // #A11 出生走廊保护（杂物/植被同样避让左缘起点走廊——防止 seed 随机
    // 围死玩家开局格；校准连通地板依赖）
    {
      const spawnXM = cx - 0.8 * halfW;
      const kcX0 = spawnXM - halfW * 0.20, kcX1 = spawnXM + halfW * 0.20;
      const kcY0 = cy - halfH * 0.09, kcY1 = cy + halfH * 0.09;
      if (cxx + cw / 2 > kcX0 && cxx - cw / 2 < kcX1 && cyy + ch / 2 > kcY0 && cyy - ch / 2 < kcY1) {
        continue;
      }
    }
    const inst = { x: cxx, y: cyy, w: cw, h: ch, angle: rng.range(-0.2, 0.2), tier: ctier };
    if (ctier === 'rock') {
      // 六边形岩面 verts（rock-poly 绘制/SAT 通用，无角度旋转需求 → angle 置 0 保持顶点朝向）
      const rx = cw / 2, ry = ch / 2, rot = rng() * Math.PI * 2;
      const rv = [];
      for (let i = 0; i < 6; i++) {
        const a = rot + (i / 6) * Math.PI * 2;
        rv.push([Math.cos(a) * rx, Math.sin(a) * ry]);
      }
      inst.verts = rv;
      inst.angle = 0;
    }
    const tierDef = coverTiers && coverTiers[ctier];
    inst.hp = (tierDef && tierDef.hp !== undefined) ? tierDef.hp : 1;
    out.push(inst);
    placedC++;
  }
  return out;
}

// ======================= #87 树林簇（forest clusters） =======================
// 在模板指定区域生成 2~4 个簇心，每簇 4~8 棵 tree + 2~4 丛 bush 高密度团块
// （簇内间距小于树冠尺寸，形成“林子”而非稀疏独树）。成员携带 groupId:'forest<k>' 供
// 测试/聚类识别。items 为世界坐标占位框数组（{x,y,w,h}，供避让检测）；opts：
//   { cx, cy, scale, minClusters, maxClusters, regions:[{dx,dy,rx,ry}] }（模板单位）。
// 纯 rng 注入确定性；返回 cover 实例数组（由调用方并入 covers）。
function placeForestClusters(items, rng, opts) {
  opts = opts || {};
  const scale = opts.scale || 1;
  const out = [];
  const coverTiers = (typeof RULES !== 'undefined' && RULES.coverTiers)
    ? RULES.coverTiers
    : (typeof COVER_TIERS !== 'undefined' ? COVER_TIERS : null);
  const hpOf = (tier, def) => (coverTiers && coverTiers[tier] && coverTiers[tier].hp !== undefined)
    ? coverTiers[tier].hp : def;
  const regions = (opts.regions && opts.regions.length) ? opts.regions
    : [{ dx: 0, dy: 0, rx: 200, ry: 130 }];
  const minC = opts.minClusters !== undefined ? opts.minClusters : 2;
  const maxC = opts.maxClusters !== undefined ? opts.maxClusters : 4;
  const nClusters = rng.int(minC, maxC);
  // #G（2026-09-21 修复）：簇内布点此前无节点边界钳制——区域贴边时（village_center 防风林
  // dx=-340）簇心随机偏移可把树推到边界外（实测 x=-0.0099，test-map「掩体在界内」失败）。
  // 钳制为**放置后修正**（不消耗 rng、不改变采样流），保持同 seed 确定性。
  const bd = opts.bounds || null;
  const clampInside = (x, y, w, h) => {
    if (!bd) return { x, y };
    const hw = w / 2, hh = h / 2;
    return {
      x: Math.max(bd.x0 + hw, Math.min(bd.x1 - hw, x)),
      y: Math.max(bd.y0 + hh, Math.min(bd.y1 - hh, y))
    };
  };
  for (let k = 0; k < nClusters; k++) {
    const reg = regions[k % regions.length];
    const rcx = opts.cx + (reg.dx || 0) * scale;
    const rcy = opts.cy + (reg.dy || 0) * scale;
    const rrx = (reg.rx !== undefined ? reg.rx : 110) * scale;
    const rry = (reg.ry !== undefined ? reg.ry : 110) * scale;
    // #E11（2026-09-20）：林地簇的树同样乘 treeWorldScale 收敛（与主循环 tree 尺寸口径一致）
    const _fwTreeScale = (typeof RULES !== 'undefined' && RULES.nodeMap && RULES.nodeMap.treeWorldScale !== undefined)
      ? RULES.nodeMap.treeWorldScale : 0.6;
    const treeW = rng.range(22, 26) * scale * _fwTreeScale;
    const treeH = rng.range(16, 20) * scale * _fwTreeScale;
    const clusterR = treeW * rng.range(1.1, 1.5);   // 簇半径 ≈ 树冠尺寸 → 簇内间距 < 冠幅
    // 簇心确定性采样：首试区域中心，其后随机偏移，避开已有元素占位框
    let ccx = rcx, ccy = rcy;
    for (let att = 0; att < 6; att++) {
      const px = rcx + (att === 0 ? 0 : (rng() - 0.5) * 2 * rrx);
      const py = rcy + (att === 0 ? 0 : (rng() - 0.5) * 2 * rry);
      if (!rectHitsCover(items, px, py, clusterR * 2, clusterR * 1.6, 10)) { ccx = px; ccy = py; break; }
    }
    const gid = 'forest' + k;
    const placed = [];
    const trySpot = (w, h, pad, radiusF) => {
      for (let att = 0; att < 5; att++) {
        const a = rng() * Math.PI * 2;
        const rr = clusterR * radiusF * rng();
        const x = ccx + Math.cos(a) * rr;
        const y = ccy + Math.sin(a) * rr;
        if (!rectHitsCover(items, x, y, w, h, pad) && !rectHitsCover(placed, x, y, w, h, pad)) {
          return { x, y };
        }
      }
      return null;
    };
    // 树：中心 1 棵 + 周围 3~7 棵；避让失败回退环位保底 ≥4 棵/簇
    const nTree = rng.int(4, 8);
    for (let i = 0; i < nTree; i++) {
      let spot = (i === 0) ? { x: ccx, y: ccy } : trySpot(treeW, treeH, 2, 1.0);
      if (!spot) {
        const fa = (i / nTree) * Math.PI * 2;
        spot = { x: ccx + Math.cos(fa) * clusterR * 0.6, y: ccy + Math.sin(fa) * clusterR * 0.6 };
      }
      const member = { x: spot.x, y: spot.y,
                       w: treeW * rng.range(0.9, 1.1), h: treeH * rng.range(0.9, 1.1),
                       angle: rng.range(-0.3, 0.3), tier: 'tree', groupId: gid, hp: hpOf('tree', 1) };
      const tc = clampInside(member.x, member.y, member.w, member.h);
      member.x = tc.x; member.y = tc.y;
      placed.push(member); out.push(member);
    }
    // 灌木：填充簇内空隙（允许与树冠轻度叠置，增强“林子”密度感）
    const nBush = rng.int(2, 4);
    for (let i = 0; i < nBush; i++) {
      const bw2 = rng.range(52, 62) * scale, bh2 = rng.range(28, 34) * scale;
      const spot = trySpot(bw2, bh2, 4, 1.1);
      if (!spot) continue;
      const member = { x: spot.x, y: spot.y, w: bw2, h: bh2,
                       angle: rng.range(-0.25, 0.25), tier: 'bush', groupId: gid, hp: hpOf('bush', 1) };
      const bc = clampInside(member.x, member.y, member.w, member.h);
      member.x = bc.x; member.y = bc.y;
      placed.push(member); out.push(member);
    }
  }
  return out;
}

/**
 * A17 方案1：生成期 LoS 走廊保证原语（纯函数、确定性、无 DOM）。
 * 对 (spawn, 各 cluster 质心) 逐一校验直视线（hasLineOfSight，与 AI 索敌同口径），
 * 若存在挡视线体（tier.vision 的 full/bush/tree/fallen/intact/rock），则开走廊：
 *   ① 侧移遮挡体：沿"线段垂线方向"平移出线段（挪动量 = 遮挡体沿垂线半幅 + 与线段
 *      垂距 + 余量，确保整块露出缝隙），受控且不越界 / 不撞其它掩体；
 *   ② 无法安全侧移则降级：仅 full→soft 能去除 vision（half 生成期被 D5 禁止→跳过；
 *      其余 foliage/rock 降级无意义→直接移除）；
 *   ③ 仍不行则移除该遮挡体。
 * 循环直到该 cluster 视线打开或无可处理遮挡体；多 cluster 各自处理；最终保底至少
 * 保证一个 cluster 与玩家间直视线成立。
 * 确定性：只用注入的 rng（建议调用方传"由节点 seed 派生的独立子流"，以免污染整局 rng）。
 * 坐标与 coversList 同帧（makeNode 传世界帧；generateNode 内部调用传其局部帧）。
 * @param {Array} coversList 将被就地修改（侧移 / 降级 / 移除）的掩体数组
 * @param {{spawn:{x,y}, clusters:Array<{x,y}>, bounds?:{w,h}}} hints
 * @param {any} rng createRNG 实例（仅在做侧移随机方向选择/兜底时用；无遮挡时不消耗）
 * @returns {boolean} 是否对 coversList 做了改动
 */
function ensureLoSCorridor(coversList, hints, rng) {
  if (!hints || !hints.spawn || !Array.isArray(hints.clusters) || !hints.clusters.length) return false;
  if (!coversList || !coversList.length) return false;
  const spawn = hints.spawn;
  const bounds = hints.bounds || null;
  const pad = 8;

  const visionOf = (tier) => {
    const t = (typeof COVER_TIERS !== 'undefined' && COVER_TIERS && COVER_TIERS[tier]) ? COVER_TIERS[tier] : null;
    return !!(t && t.vision);
  };
  const losOk = (a, b) => (typeof hasLineOfSight === 'function')
    ? hasLineOfSight(a.x, a.y, b.x, b.y, coversList)
    : true;
  const blockerAt = (a, b) => (typeof losBlocker === 'function')
    ? losBlocker(a.x, a.y, b.x, b.y, coversList) : null;

  let changed = false;

  const openOne = (c) => {
    for (let iter = 0; iter < 8; iter++) {
      const blk = blockerAt(spawn, c);
      if (!blk) return true;                 // 已打开
      const cov = blk.cover;

      // ① 侧移：沿线段垂线把遮挡体整体平移出线段
      const dx = c.x - spawn.x, dy = c.y - spawn.y;
      const L = Math.hypot(dx, dy) || 1;
      const px = -dy / L, py = dx / L;       // 与 losBlocker 同向的垂线（侧向）
      // 遮挡体沿垂线的半幅（精确：投影 OBB 角点到垂线）
      let minP = Infinity, maxP = -Infinity;
      const cs = (typeof coverCorners === 'function') ? coverCorners(cov) : null;
      if (cs && cs.length) {
        for (const pt of cs) { const d = pt.x * px + pt.y * py; if (d < minP) minP = d; if (d > maxP) maxP = d; }
      } else {
        const e = Math.max(cov.w || 0, cov.h || 0) / 2; minP = -e; maxP = e;
      }
      const ext = (maxP - minP) / 2;
      // 线段恒定垂线坐标 = spawn·perp（与 c·perp 相同，因 (c-spawn)⊥perp）
      const segP = spawn.x * px + spawn.y * py;
      const centerP = (minP + maxP) / 2;
      const shift = ext + Math.abs(segP - centerP) + 24;  // 整块移出线段 + 余量
      let moved = false;
      for (const sgn of [1, -1]) {
        const nx = cov.x + px * shift * sgn;
        const ny = cov.y + py * shift * sgn;
        if (bounds) {
          const m = 60;
          if (nx < m || nx > bounds.w - m || ny < m || ny > bounds.h - m) continue;
        }
        // 不与其它掩体重叠（AABB 近似 + pad）
        if (rectHitsCover(coversList.filter(o => o !== cov), nx, ny, cov.w, cov.h, pad)) continue;
        cov.x = nx; cov.y = ny; moved = true; break;
      }
      if (moved) { changed = true; continue; }   // 重测是否仍挡

      // ② 降级：仅 full→soft 能去除 vision（half 生成期被 D5 禁止→跳过；其它降级无效）
      if (cov.tier === 'full' && visionOf('full') && !visionOf('soft')) {
        cov.tier = 'soft';
        cov.hp = (COVER_TIERS.soft && COVER_TIERS.soft.hp !== undefined) ? COVER_TIERS.soft.hp : 1;
        changed = true; continue;
      }

      // ③ 移除：本遮挡体移除后可能仍有后续遮挡体，继续循环剔除（8 次上限防死循环）
      const idx = coversList.indexOf(cov);
      if (idx >= 0) { coversList.splice(idx, 1); changed = true; }
      continue;
    }
    return true;
  };

  for (const c of hints.clusters) {
    if (losOk(spawn, c)) continue;
    openOne(c);
  }
  // 保底：至少一条直视线（对首个 cluster 激进开走廊）
  const anyOpen = hints.clusters.some(c => losOk(spawn, c));
  if (!anyOpen) openOne(hints.clusters[0]);
  return changed;
}

// ---------- 2026-09-14 元素重叠修剪（generateNode 收尾统一消叠） ----------
// 各阶段生成器（模板 items/路网/村落/林地/水潭/泥潭/随机水体）虽各自避让，跨阶段仍可能
// 残留明显重叠（岩石/建筑/水域/泥潭互相压盖）。本 pass 在 generateNode 返回前统一修剪：
//   - 按 tier 优先级（结构 > 岩石 > 桥 > 残骸 > 液体 > 泥 > 植被）保留高优先级元素，
//     显著重叠的低优先级元素整株移除；同优先级保留先放置者。
//   - road（地面层）豁免：路压在建筑/水下属于预期视觉（烘焙层会被上覆元素遮住），
//     且同 groupId 链段搭接是路网连通的前提。
// 显著重叠判定：对每个 cover 取 3×3 局部采样点（世界系），一方 ≥1/3 采样点落入另一方
// 多边形/OBB 内即视为显著重叠（纯函数、确定性，不用 rng）。
// ================= #E3（2026-09-20）建筑沿路/路口聚集 + 路口沙包 =================
// 用户反馈：建筑密度需要在路边随机聚集，在路口聚集程度最高；路口要有沙包等障碍。
// 两类元素在「模板 items + 村落」之后、统一消叠（pruneOverlappingCovers）之前注入，
// 因此天然参与重叠消解（建筑/岩石/树/可破坏物/水域/泥潭互不重叠）。
// 消费方：generateNode（#E3 段）。
function _roadSegAngle(seg) { return seg.angle || 0; }

function placeRoadsideBuildings(rng, tpl, scale, centerX, centerY, roadCovers, junctions, roadW, outCovers, density) {
  const nodeMap = (typeof RULES !== 'undefined' && RULES.nodeMap) ? RULES.nodeMap : {};
  const cfg = nodeMap.building || {};
  // #I3（2026-09-21 用户裁定「继续增加建筑密度，特别是 boss 战地图」）：密度乘子——
  // makeNode 对 boss 节点传 RULES.nodeMap.building.bossDensity（1.6），普通节点 1。
  const den = (density !== undefined) ? density : 1;
  const fullHp = (typeof RULES !== 'undefined' && RULES.coverTiers && RULES.coverTiers.full)
    ? RULES.coverTiers.full.hp : Infinity;
  const halfW = tpl.w * scale / 2, halfH = tpl.h * scale / 2;
  const minX = centerX - halfW + 50, maxX = centerX + halfW - 50;
  const minY = centerY - halfH + 50, maxY = centerY + halfH - 50;
  const junctionRadius = cfg.junctionRadius !== undefined ? cfg.junctionRadius : 210;
  const cMin = Math.max(1, Math.round((cfg.clusterPerJunction !== undefined ? cfg.clusterPerJunction : 3) * den));
  const cMax = Math.max(cMin, Math.round((cfg.clusterPerJunctionMax !== undefined ? cfg.clusterPerJunctionMax : 6) * den));
  const maxPerNode = Math.max(4, Math.round((cfg.maxPerNode !== undefined ? cfg.maxPerNode : 20) * den));
  const band = cfg.roadBand !== undefined ? cfg.roadBand : 96;
  // #G（2026-09-21 用户需求 #4「更多建筑等物体」）：建筑混合配比——30% 可破坏楼房（building，
  // 耐久 3 → ruined → rubble）、10% 残破建筑（ruined，此前定义但从未生成）、60% 不可摧毁（full）。
  const tiers = (typeof RULES !== 'undefined' && RULES.coverTiers) ? RULES.coverTiers : {};
  const bHp = (tiers.building && tiers.building.destructible) || 3;
  const rHp = (tiers.ruined && tiers.ruined.destructible) || 1;
  const pickTier = () => {
    const roll = rng();
    if (roll < 0.30) return { tier: 'building', hp: bHp };
    if (roll < 0.40) return { tier: 'ruined', hp: rHp };
    return { tier: 'full', hp: Infinity };
  };

  const placed = [];
  const fits = (x, y, w, h, ang) => {
    if (x < minX || x > maxX || y < minY || y > maxY) return false;
    if (obbHitsCover(roadCovers, x, y, w, h, ang, 10)) return false;             // 不压路面
    // #I3 修复（#E3/#G 遗留缺陷）：此前对 outCovers 用 pad 34 判重叠，而 outCovers **含全部
    // 道路段**——道路是宽条带（92~124px），pad 34 的膨胀判定把沿路/路口建筑几乎全部拒绝
    // （实测同 seed 下 placeRoadsideBuildings 产出 0，模板建筑之外无新增建筑，密度参数无效）。
    // 现行：道路只按 pad 10 判定（上句），**非道路元素**才按 pad 34 留通行间隙。
    const others = [];
    for (const c of outCovers) if (c.tier !== 'road') others.push(c);
    if (obbHitsCover(others, x, y, w, h, ang, 34)) return false;
    if (obbHitsCover(placed, x, y, w, h, ang, 34)) return false;                 // 彼此不重叠（留通行间隙）
    for (const j of (junctions || [])) {
      if (Math.hypot(x - j.x, y - j.y) < (j.r || roadW * 0.5) + 24) return false; // 不挡路口中心（留环岛通行）
    }
    return true;
  };
  const push = (x, y, w, h, ang) => {
    if (!fits(x, y, w, h, ang)) return false;
    const pick = pickTier();
    const b = { x, y, w, h, angle: ang, tier: pick.tier, hp: pick.hp };
    placed.push(b);
    outCovers.push(b);
    return true;
  };

  // ---- 1) 路口邻域聚集（密度最高）：环形布点，优先贴路口 ----
  for (const j of (junctions || [])) {
    const want = rng.int(cMin, cMax);
    let done = 0;
    for (let attempt = 0; attempt < want * 8 && done < want && placed.length < maxPerNode; attempt++) {
      const a = rng() * Math.PI * 2;
      // 由近到远：先在路口紧邻圈，失败再外扩（≤junctionRadius）
      const rr = (roadW * 0.5) * (0.8 + rng.range(0, 1.6));
      const dist = Math.min(junctionRadius, rr) + rng.range(0, 70);
      const x = j.x + Math.cos(a) * dist, y = j.y + Math.sin(a) * dist;
      const w = rng.range(120, 200), h = rng.range(80, 140);
      const ang = rng() < 0.5 ? 0 : Math.PI / 2;
      if (push(x, y, w, h, ang)) done++;
    }
  }

  // ---- 2) 沿路两侧散布：贴路缘外侧成排（朝向对齐街道轴）；#I3 密度乘子加成采样密度 ----
  const segs = (roadCovers || []).slice();
  const wantRoadside = Math.max(2, Math.round(segs.length / 4 * den));
  const step = Math.max(1, Math.floor(segs.length / wantRoadside));
  for (let i = 0; i < segs.length && placed.length < maxPerNode; i += step) {
    const s = segs[i];
    if (!s || s.tier !== 'road') continue;
    const ang = _roadSegAngle(s);
    const nx = -Math.sin(ang), ny = Math.cos(ang);
    const side = rng() < 0.5 ? 1 : -1;
    const w = rng.range(130, 210), h = rng.range(80, 140);
    const off = roadW * 0.5 + h * 0.5 + rng.range(10, band * 0.5);
    const along = Math.abs(Math.cos(ang)) >= Math.abs(Math.sin(ang)) ? 0 : Math.PI / 2;
    if (!push(s.x + nx * off * side, s.y + ny * off * side, w, h, along)) {
      // 反向再试一次（另一侧）
      push(s.x - nx * off * side, s.y - ny * off * side, w, h, along);
    }
  }
  return placed;
}

// bounds（2026-09-23，B 档①附带修复）：节点局部系的半宽/半高（= 模板 w/h × scale ÷ 2）。
// 传入后沙包被拒绝生成在节点边界外——原实现无边界检查，路口靠近边界且 r 取到 ringMax×路宽 时
// 沙包会落到节点外（实测 run-seed 节点 4 有三个 barricade 落在 y≈1509 > 半高 720）。
function placeJunctionBarricades(rng, roadCovers, junctions, roadW, outCovers, bounds) {
  const cfg = (typeof RULES !== 'undefined' && RULES.nodeMap && RULES.nodeMap.junctionBarricades) || {};
  const chance = cfg.chance !== undefined ? cfg.chance : 0.85;
  const cMin = cfg.countMin !== undefined ? cfg.countMin : 2;
  const cMax = cfg.countMax !== undefined ? cfg.countMax : 4;
  const rMin = cfg.ringMin !== undefined ? cfg.ringMin : 0.9;
  const rMax = cfg.ringMax !== undefined ? cfg.ringMax : 1.9;
  const placed = [];
  for (const j of (junctions || [])) {
    if (rng() > chance) continue;
    const want = rng.int(cMin, cMax);
    let done = 0;
    for (let attempt = 0; attempt < want * 10 && done < want; attempt++) {
      const a = rng() * Math.PI * 2;
      const r = roadW * rng.range(rMin, rMax);
      const x = j.x + Math.cos(a) * r, y = j.y + Math.sin(a) * r;
      const w = 62, h = 26;
      // 边界拒绝（2026-09-23）：沙包（含半个外接圆余量）必须落在节点内
      if (bounds) {
        const m = Math.hypot(w, h) / 2;
        if (x < -bounds.halfW + m || x > bounds.halfW - m ||
            y < -bounds.halfH + m || y > bounds.halfH - m) continue;
      }
      // 沙包布防在「路口环外侧、且不压路面」的位置
      if (obbHitsCover(roadCovers, x, y, w, h, a, 2)) continue;
      if (obbHitsCover(outCovers, x, y, w, h, a, 6)) continue;
      if (obbHitsCover(placed, x, y, w, h, a, 6)) continue;
      const b = { x, y, w, h, angle: a, tier: 'barricade' };
      placed.push(b);
      outCovers.push(b);
      done++;
    }
  }
  return placed;
}

const _PRUNE_PRIORITY = {
  full: 9, intact: 9, building: 9, rock: 8, bridge: 8, ruined: 6, barricade: 6,
  stump: 5, rubble: 5, water: 4, river: 4, mud: 3, tree: 2, fallen: 2, bush: 1, soft: 1
};
function _pruneSamplePts(c) {
  // 3×3 采样：以 OBB 局部框（或 verts 包围盒）为基准
  let hw = (c.w || 0) / 2, hh = (c.h || 0) / 2;
  if ((c.verts || c.collisionVerts) && (!c.w || !c.h)) {
    let mx = 0, my = 0;
    for (const v of (c.collisionVerts || c.verts)) { mx = Math.max(mx, Math.abs(v[0])); my = Math.max(my, Math.abs(v[1])); }
    hw = mx; hh = my;
  }
  const pts = [];
  for (let i = -1; i <= 1; i++) {
    for (let j = -1; j <= 1; j++) {
      const lx = i * hw * 0.66, ly = j * hh * 0.66;
      const a = c.angle || 0;
      pts.push({ x: c.x + lx * Math.cos(a) - ly * Math.sin(a), y: c.y + lx * Math.sin(a) + ly * Math.cos(a) });
    }
  }
  return pts;
}
function _prunePolyWorld(c) {
  // 世界系多边形（局部 verts → 世界），无 verts 时回退 OBB 四角
  if (c.verts || c.collisionVerts) {
    const vs = c.collisionVerts || c.verts;
    const a = c.angle || 0;
    const cs = Math.cos(a), sn = Math.sin(a);
    return vs.map(v => ({ x: c.x + v[0] * cs - v[1] * sn, y: c.y + v[0] * sn + v[1] * cs }));
  }
  const hw = (c.w || 0) / 2, hh = (c.h || 0) / 2, a = c.angle || 0;
  const cs = Math.cos(a), sn = Math.sin(a);
  return [
    { x: c.x + (hw * cs - hh * sn), y: c.y + (hw * sn + hh * cs) },
    { x: c.x + (hw * cs + hh * sn), y: c.y + (hw * sn - hh * cs) },
    { x: c.x + (-hw * cs + hh * sn), y: c.y + (-hw * sn - hh * cs) },
    { x: c.x + (-hw * cs - hh * sn), y: c.y + (-hw * sn + hh * cs) }
  ];
}
function _pointInPrunePoly(pt, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
    if (((yi > pt.y) !== (yj > pt.y)) && (pt.x < (xj - xi) * (pt.y - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}
function pruneOverlappingCovers(covers) {
  const arr = covers.slice();
  const prio = c => (_PRUNE_PRIORITY[c.tier] !== undefined ? _PRUNE_PRIORITY[c.tier] : 7);
  // 显著重叠判定：对每个 cover 取 3×3 局部采样点（世界系），一方 ≥1/3 采样点落入另一方
  // 多边形/OBB 内即视为显著重叠（纯函数、确定性，不用 rng）。
  const samplePts = c => _pruneSamplePts(c);
  const polyOf = c => _prunePolyWorld(c);
  const sigOverlap = (sa, polyA, sb, polyB) => {
    let inB = 0, inA = 0;
    for (const p of sa) if (_pointInPrunePoly(p, polyB)) inB++;
    for (const p of sb) if (_pointInPrunePoly(p, polyA)) inA++;
    return inB >= 3 || inA >= 3;   // ≥1/3 采样点互入 = 显著重叠
  };
  // 平移消叠（2026-09-14 修订）：优先把败者平移到附近空位（环形候选点，避开一切其他元素），
  // 保住「地形标签必产出」等数量契约；候选全占满才整株移除。
  const tryNudge = (loser, others) => {
    const baseW = Math.max(loser.w || 40, 40), baseH = Math.max(loser.h || 40, 40);
    const step = Math.max(baseW, baseH) * 0.75;
    const loserSamples = samplePts(loser);
    const cand = [];
    for (let ring = 1; ring <= 6; ring++) {
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        cand.push({ x: loser.x + Math.cos(a) * step * ring, y: loser.y + Math.sin(a) * step * ring });
      }
    }
    for (const p of cand) {
      const moved = Object.assign({}, loser, { x: p.x, y: p.y });
      const ms = samplePts(moved), mp = polyOf(moved);
      let clash = false;
      for (const o of others) {
        if (o === loser || o.tier === 'road') continue;
        if (sigOverlap(ms, mp, samplePts(o), polyOf(o))) { clash = true; break; }
      }
      if (!clash) { loser.x = moved.x; loser.y = moved.y; return true; }
    }
    return false;
  };
  let iter = 0;
  const MAX_ITER = arr.length * 4 + 40;
  while (iter++ < MAX_ITER) {
    let found = false;
    outer:
    for (let i = 0; i < arr.length; i++) {
      const a = arr[i];
      if (a.tier === 'road') continue;                       // road 豁免（地面层）
      for (let j = i + 1; j < arr.length; j++) {
        const b = arr[j];
        if (b.tier === 'road') continue;
        if (a.groupId && a.groupId === b.groupId) continue;  // 同链搭接豁免
        if (!sigOverlap(samplePts(a), polyOf(a), samplePts(b), polyOf(b))) continue;
        found = true;
        const pa = prio(a), pb = prio(b);
        const loser = (pa > pb) ? b : (pb > pa ? a : (i < j ? b : a));   // 高优先级胜；同优先级留先放置者
        if (!tryNudge(loser, arr)) {
          arr.splice(arr.indexOf(loser), 1);                 // 无空位 → 移除
        }
        break outer;                                         // 位置已变 → 重扫
      }
    }
    if (!found) break;
  }
  return arr;
}

/**
 * Main node cover layout generator
 * @param {number} [difficulty=0.5] 0~1 continuous difficulty weight
 * @param {NodeGenOptions} [options] 含可选 losHints（见 ensureLoSCorridor）
 * @returns {GeneratedNodeResult}
 */function generateNode(difficulty, options) {
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

  // #A11: Phase 0 - Map-level Road Network (Deterministic, before items/village/forest)
  // Use a dedicated sub-stream to ensure roads are stable across difficulty levels.
  // #B7（2026-09-16）：不再构造 avoidBoxes——旧实现用模板 full 建筑占位盒对路网**逐段跳段**，
  // 实测留下 202~246px 路面缺口（＝用户反馈的「道路被其他物体截断」根因）。道路属 ground 层、
  // 先于一切元素绘制并被其覆盖，跳段纯属有害，故 placeRoadNetwork 不再接收避让盒。
  const rrng = createRNG(((Number(seed) ^ 0x11A11A11) + 0x6D2B79F5) >>> 0);
  // v2：placeRoadNetwork 返回 { covers, junctions }——junctions 供渲染层在路口断开中心虚线
  // （「路口感」的关键：两条路的中心线不能都笔直穿过交点）。
  // 2026-10-05 一体化路网：strip 级已生成路网时（roadOpts.externalRoads），
  // 本片跳过自生成，仅用外部路做避让；路面 cover 由 strip 统一追加（片内不输出）。
  const _ro = opts.roadOpts || {};
  let networkRoads, roadJunctions, roadWidth, roadNet;
  // 2026-10-05 一体化河流：外部河流（strip 级）参与建筑避让（与道路同逻辑）。
  const externalRivers = _ro.externalRivers || [];
  if (_ro.externalRoads) {
    networkRoads = _ro.externalRoads;
    roadJunctions = _ro.externalJunctions || [];
    roadWidth = _ro.externalRoadW || 100;
  } else {
    roadNet = placeRoadNetwork(rrng, selectedTemplate, scale, centerX, centerY,
      opts.roadOpts);
    networkRoads = roadNet.covers;
    roadJunctions = roadNet.junctions;
    roadWidth = roadNet.roadW || 100;
    for (const r of networkRoads) {
      outCovers.push(r);
    }
  }
  // 避让合并列表：道路 + 河流（#A11 推出逻辑共用）
  const avoidCovers = externalRivers.length ? networkRoads.concat(externalRivers) : networkRoads;
  // 2026-10-05：河流单独列表——模板项对河流严格跳过（零容忍），对道路保留推挤
  const riverCovers = externalRivers.length ? externalRivers : [];

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

  // #77 低难度 full→half 降级帽（fullDowngradeCap）：D5 第一阶段后 full→half 降级
  // 已改为无操作，降级帽预算随之废弃（RULES.nodeMap.fullDowngradeCap 字段保留不删，
  // 以兼容配置读取与后续 half 子系统去留裁定）。

  // #77 尺寸收敛系数表（RULES.nodeMap.coverWorldScale）：掩体类按 tier 缩放世界尺寸
  // （半高 0.55 → ≈100~150px、全高 0.58 → ≈150~220px、沙袋 0.40 → ≈60~90px @nodeScale=3）；
  // 地形/植被类不在表中不受影响。verts/collisionVerts 同步按同系数缩放保持几何一致。
  const coverWorldScale = cfgNodeMap.coverWorldScale || {};

  // #87 林地簇（forestClusters）：在主循环【前】消耗 rng（难度分支尚未分流，
  // 保证同 seed 跨难度输出一致）；生成的实例延后到主循环后并入 outCovers。
  let forestCovers = null;
  if (selectedTemplate.forest) {
    const fcfg = selectedTemplate.forest;
    const itemBoxes = items.map(it => ({
      x: centerX + (it.dx || 0) * scale, y: centerY + (it.dy || 0) * scale,
      w: it.w * scale, h: it.h * scale
    })).concat(avoidCovers.map(r => {
      // 2026-10-05：斜向河段/路段的 AABB 包络（rectHitsCover 不处理 angle，
      // 用旋转包络保证保守避让）。
      const a = r.angle || 0;
      const ca = Math.abs(Math.cos(a)), sa = Math.abs(Math.sin(a));
      return {
        x: r.x, y: r.y,
        w: r.w * ca + r.h * sa,
        h: r.w * sa + r.h * ca
      };
    }));
    forestCovers = placeForestClusters(itemBoxes, rng, {
      cx: centerX, cy: centerY, scale,
      minClusters: fcfg.minClusters, maxClusters: fcfg.maxClusters,
      regions: fcfg.regions,
      // #G：节点世界边界（与 centerX/centerY 同帧，半幅 = w*scale/2），供簇内布点钳制
      bounds: {
        x0: centerX - selectedTemplate.w * scale / 2, y0: centerY - selectedTemplate.h * scale / 2,
        x1: centerX + selectedTemplate.w * scale / 2, y1: centerY + selectedTemplate.h * scale / 2
      }
    });
  }

  for (let i = 0; i < items.length; i++) {
    const item = items[i];

    // Culling check (keep relative order)——#77：受保护的全高建筑跳过剔除
    if (items.length > 3 && !protectedFullIdx.has(i) && rng() < cullRate) {
      continue;
    }

    let tier = item.tier;

    // D5 第一阶段（2026-08-26）：地图生成禁止落位 half 掩体——模板/随机落位的
    // half 实例直接跳过不生成（最纯粹的测试态）。运行时 RULES.coverTiers.half 与
    // tank_cover.js / tank_fire.js 的 half 判定逻辑全部保留不动（兼容 bench/测试）。
    if (tier === 'half') continue;

    // Element ratio adjustment:
    // High difficulty -> upgrade soft/bush to barricade
    // （P-40：地形标签 tier 不降级/升级；D5：bush/soft 升级池不再含 half 选项）
    if (!isTerrainTier(tier)) {
      if (diff > 0.6) {
        if ((tier === 'bush' || tier === 'soft') && rng() < (diff - 0.5) * 0.4) {
          tier = 'barricade';
        }
      }
      // Low difficulty -> downgrade barricade to soft
      // （D5：full→half 降级改为无操作——full 保持 full，不再产出 half 掩体）
      else if (diff < 0.35) {
        if (!item.verts) { // Don't modify complex polygon structures
          if (tier === 'barricade' && rng() < (0.4 - diff) * 0.4) {
            tier = 'soft';
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
    // #E11（2026-09-20）：树木尺寸单独收敛（用户反馈「树太大」）——树/倒树/树桩统一乘系数，
    // 树冠视觉（tank_assets bakeCanopy 以 w/h 为基准）随之等比缩小，保持视觉-逻辑同源。
    const treeScale = cfgNodeMap.treeWorldScale !== undefined ? cfgNodeMap.treeWorldScale : 0.6;
    if (tier === 'tree' || tier === 'fallen' || tier === 'stump') {
      itemW *= treeScale; itemH *= treeScale;
    }
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

    const ix = centerX + item.dx * scale + jitterX;
    const iy = centerY + item.dy * scale + jitterY;
    const iw = itemW * scale;
    const ih = itemH * scale;

    // #A11（2026-10-05 修订）：模板物品避路——结构/植被/液体 tier 一律避路。
    //   ground tier（泥斑等地面贴花）豁免——压路无视觉问题。
    //   压路时沿远离最近路心的方向最小推出（保建筑数量，满足 cull 保护/降级帽断言）；
    //   推不出界或仍压路才剔除。确定性（不消耗 rng）。
    //   修订前：full/half 建筑豁免（#77「建筑优先于路」）、植被/水体豁免。
    //   修订原因：接缝公路贯通后，建筑/植被/水体压在路面正中非常出戏。
    //   2026-10-05：一并避开 strip 级河流（avoidCovers = 道路 + 河流）。
    let px = ix, py = iy;
    const _tg = (typeof RULES !== 'undefined' && RULES.coverTiers && RULES.coverTiers[tier])
      ? RULES.coverTiers[tier].tierGroup : null;
    // 2026-10-05 步骤4：河流零容忍（严格跳过），道路保留推挤（保建筑数）。
    if (_tg !== 'ground' && riverCovers.length &&
        obbHitsCover(riverCovers, px, py, iw, ih, (item.angle || 0) + angleJitter, 6)) {
      continue;
    }
    // #A11 道路推挤（保留既有行为，满足 cull 保护/降级帽断言）
    if (_tg !== 'ground' && obbHitsCover(networkRoads, px, py, iw, ih, (item.angle || 0) + angleJitter, 6)) {
      let best = null, bestD = Infinity;
      for (const r of networkRoads) {
        const d = Math.hypot(ix - r.x, iy - r.y);
        if (d < bestD) { bestD = d; best = r; }
      }
      let pushed = false;
      if (best) {
        const dx = ix - best.x, dy = iy - best.y;
        const len = Math.hypot(dx, dy) || 1;
        const roadHalf = Math.min(best.w, best.h) / 2;
        const bHalf = Math.max(iw, ih) / 2;
        const need = roadHalf + bHalf + 24 - bestD;
        const bx0 = centerX - selectedTemplate.w * scale / 2 + iw / 2;
        const bx1 = centerX + selectedTemplate.w * scale / 2 - iw / 2;
        const by0 = centerY - selectedTemplate.h * scale / 2 + ih / 2;
        const by1 = centerY + selectedTemplate.h * scale / 2 - ih / 2;
        const tryPos = (nx, ny) => {
          return nx >= bx0 && nx <= bx1 && ny >= by0 && ny <= by1 &&
            !obbHitsCover(networkRoads, nx, ny, iw, ih, (item.angle || 0) + angleJitter, 6);
        };
        if (need <= 0) {
          pushed = true;
        } else if (tryPos(ix + (dx / len) * need, iy + (dy / len) * need)) {
          px = ix + (dx / len) * need; py = iy + (dy / len) * need; pushed = true;
        } else {
          const dirs = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
          for (const dist of [80, 160, 280]) {
            for (const nd of dirs) {
              const nx = ix + nd[0] * dist, ny = iy + nd[1] * dist;
              if (tryPos(nx, ny)) { px = nx; py = ny; pushed = true; break; }
            }
            if (pushed) break;
          }
        }
      }
      if (!pushed) continue;
    }

    const coverObj = {
      x: px,
      y: py,
      w: iw,
      h: ih,
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

  // #87 树林簇实例并入（运行时生成，不参与 cull/升降级；先于村落入列，供村落建筑避让）
  if (forestCovers) {
    for (const f of forestCovers) {
      outCovers.push(f);
    }
  }

  // ISSUE 7(c)/#87：村落分层生成——village 配置（{dx,dy}）触发。
  // 使用 seed 派生的独立子流 vrng：村落布局不受主循环难度升降级分支导致的 rng 流位差影响，
  // 同 seed 跨难度完全一致（难度差异仍由模板 items 的剔除/升级承担）。
  if (selectedTemplate.village) {
    const v = selectedTemplate.village;
    const vcx = centerX + (v.dx || 0) * scale;
    const vcy = centerY + (v.dy || 0) * scale;
    const vrng = createRNG(((Number(seed) ^ 0xA5A5A5A7) + 0x6D2B79F5) >>> 0);
    for (const b of placeVillage(vrng, selectedTemplate, scale, vcx, vcy, outCovers, avoidCovers)) {
      outCovers.push(b);
    }
  }

  // ---- P-40 地形标签生成（不受 cullRate 剔除；同 seed 确定性） ----
  // 注：置于村落之后——中央水潭经 rectHitsCover 避让已放置的道路条带与建筑。
  const terrainTags = selectedTemplate.terrainTags || [];
  for (const tag of terrainTags) {
    if (tag === 'centralPond') {
      // 2026-10-05：strip 模式及用户要求下不再生成湖泊元素
      // （_ro.externalRoads 存在即 strip 模式；单节点模式保留）
      if (!_ro.externalRoads) {
        const pond = placeCentralPond(rng, selectedTemplate, scale, centerX, centerY, outCovers);
        if (pond) outCovers.push(pond);
      }
    } else if (tag === 'edgeRiver') {
      // 2026-10-05：strip 模式下跳过 per-chunk 河流（strip 级一体化河流已生成，
      // 避免重复 + 接缝断开）。
      if (!_ro.externalRoads) {
        outCovers.push(placeEdgeRiver(rng, selectedTemplate, scale, centerX, centerY));
      }
    } else if (tag === 'mudPatch') {
      for (const m of placeMudPatch(rng, selectedTemplate, scale, centerX, centerY, outCovers)) {
        outCovers.push(m);
      }
    }
  }

  // P-20：随机插入水体/桥梁组合（置于村落/林地之后，避让全部已放置元素）
  // 每个节点最多 1 个水体/桥梁组合；概率随难度递增
  // 2026-10-05：strip 模式下跳过（_ro.externalRoads 存在时）——strip 级已有
  // 一体化水系（placeStripRivers），per-node 矩形水体会破坏视觉统一。
  const waterBridgeChance = diff * 0.5;
  if (!_ro.externalRoads && rng() < waterBridgeChance) {
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

  // #E3（2026-09-20）：建筑沿路/路口聚集 + 路口沙包注入（在统一消叠之前 → 天然参与互不重叠）。
  // 用模板 seed 派生的独立子流，保证同 seed 跨难度的路网/建筑布局一致。
  {
    const brng = createRNG(((Number(seed) ^ 0x3C6EF372) + 0x6D2B79F5) >>> 0);
    // #I3（2026-09-21）：建筑密度乘子——makeNode 对 boss 节点传 RULES.building.bossDensity
    // 2026-10-05：传 avoidCovers（道路+河流）——沿路建筑亦避开河流（定位逻辑过滤 tier==='road'，河流仅参与避让）。
    placeRoadsideBuildings(brng, selectedTemplate, scale, centerX, centerY,
                           avoidCovers, roadJunctions, roadWidth, outCovers,
                           (opts.buildingDensity !== undefined) ? opts.buildingDensity : 1);
    placeJunctionBarricades(brng, avoidCovers, roadJunctions, roadWidth, outCovers,
      { halfW: selectedTemplate.w * scale / 2, halfH: selectedTemplate.h * scale / 2 });
  }

  // 2026-09-14：跨阶段元素重叠统一修剪（结构/岩石/建筑 × 水域/泥潭 × 植被互压消解）
  const prunedCovers = pruneOverlappingCovers(outCovers);
  outCovers.length = 0;
  for (const c of prunedCovers) outCovers.push(c);

  // A17：若调用方提供 losHints（生成期 LoS 走廊保证），在此对 outCovers 开走廊。
  // losHints 坐标须为 generateNode 内部帧（相对 centerX,centerY）；缺省不启用，行为不变，
  // 既有无遮挡节点布局零变化。makeNode 走"生成后世界帧"路径（见其内 ensureLoSCorridor 调用）。
  if (opts.losHints && opts.losHints.spawn && Array.isArray(opts.losHints.clusters)) {
    ensureLoSCorridor(outCovers, opts.losHints, rng);
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
    // v2（2026-09-16）：路口中心列表 [{x,y,r}]——渲染层据此在路口断开中心虚线，
    // 使交叉处读作「路口」而非「两条路机械叠加」。见 spec map.md §10.2。
    roadJunctions: roadJunctions,
    // #E2（2026-09-20）：本节点实际使用的道路条带宽（世界px）——供渲染/敌人生成/测试读取
    // （路宽由 RULES.nodeMap.road.widthMin~widthMax 随机取，故必须随节点结果回传）。
    roadW: roadWidth,
    // C 档 batch 2：贯通路端点（strip 片间公路连续用；非 strip 为 null）
    weTrunk: (roadNet && roadNet.weTrunk) || null,
    seed: seed,
    difficulty: diff,
    w: selectedTemplate.w * scale,   // 缩放后的节点世界尺寸（P-08：摄像机/小地图用）
    h: selectedTemplate.h * scale
  };
}

// ---------- C 档 batch 2：横向 strip 生成器（specs/map.md §14.2） ----------
// 片（chunk）= 一次 generateNode 调用（现有模板实例），片内 scale 沿用调用方传入的
// scaleFor 口径（生产环境传 tank_map.nodeScaleFor；§14.2「不得为凑地图比例去缩放片内元素」）。
// 纵向裁剪 + 接缝净空 + 密度补偿（钳制回界）后拼接为推进轴 strip。
// 本批次只产出布局（covers/w/h）；防线生成与敌人布置是 batch 3，不在此接 makeNode。
const STRIP_SEAM_CLEAR = 300;   // 接缝净空半宽：片边界 ±300px（§14.2 必需）

function _stripTierGroup(tier) {
  const ct = (typeof RULES !== 'undefined' && RULES.coverTiers) ? RULES.coverTiers[tier] : null;
  return (ct && ct.tierGroup) || null;
}

// OBB 相交（SAT）：供「钳制回界」的重叠检测。c 为 cover（x/y 中心、w/h、angle）。
function _obbOverlap(a, b) {
  const aa = a.angle || 0, ab = b.angle || 0;
  const ca = Math.cos(aa), sa = Math.sin(aa), cb = Math.cos(ab), sb = Math.sin(ab);
  const axes = [[ca, sa], [-sa, ca], [cb, sb], [-sb, cb]];
  const corners = (c, cc, ss) => {
    const hw = (c.w || 0) / 2, hh = (c.h || 0) / 2;
    const pts = [];
    const ws = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
    for (let i = 0; i < 4; i++) {
      const sx = ws[i][0], sy = ws[i][1];
      pts.push([c.x + sx * hw * cc - sy * hh * ss, c.y + sx * hw * ss + sy * hh * cc]);
    }
    return pts;
  };
  const pa = corners(a, ca, sa), pb = corners(b, cb, sb);
  for (let i = 0; i < axes.length; i++) {
    const ax = axes[i][0], ay = axes[i][1];
    let mna = Infinity, mxa = -Infinity, mnb = Infinity, mxb = -Infinity;
    for (let k = 0; k < 4; k++) {
      const da = pa[k][0] * ax + pa[k][1] * ay;
      if (da < mna) mna = da; if (da > mxa) mxa = da;
      const db = pb[k][0] * ax + pb[k][1] * ay;
      if (db < mnb) mnb = db; if (db > mxb) mxb = db;
    }
    if (mxa < mnb || mxb < mna) return false;
  }
  return true;
}

/**
 * 横向 strip 节点布局生成（C 档 batch 2）。
 * @param {number} difficulty 0~1
 * @param {Object} options
 * @param {number} [options.seed] 确定性种子
 * @param {string} [options.advanceAxis='x'] 推进轴（§14.7；本批次仅实现 'x'）
 * @param {Object} [options.viewport] { vw, vh }（zoom=1 视口世界 px；缺省 1920×1080）
 * @param {number} [options.stripScreensX=10] 横向屏数（§14.1 基准 10，不做精确绑定）
 * @param {number} [options.stripScreensY=2.2] 纵向屏数（§14.1 基准 2.2）
 * @param {number} [options.chunkCount] 片数（缺省按 ≈3.5 屏/片估算）
 * @param {string[]} [options.templateIds] 逐片指定模板（测试用；缺省按难度发牌）
 * @param {Function} options.scaleFor(viewport, tpl) 片内缩放（生产传 nodeScaleFor）
 * @param {number} [options.buildingDensity] 透传 generateNode
 * @param {number} [options.cullRate] 透传 generateNode
 * @returns {Object} { advanceAxis, seed, difficulty, w, h, covers, roadJunctions,
 *   roadW[], chunks[{templateId,w,h,x0,seed}], chunkCount, seamCleared, densityPerScreen }
 */
function generateStrip(difficulty, options) {
  const diff = typeof difficulty === 'number' ? Math.max(0, Math.min(1, difficulty)) : 0.5;
  const opts = /** @type {StripGenOptions} */ (options || {});
  const axis = opts.advanceAxis || 'x';
  if (axis !== 'x') throw new Error('generateStrip: 本批次仅实现 advanceAxis=\'x\'（§14.7 第二阶段预留）');
  const seed = opts.seed !== undefined ? opts.seed : Math.floor(Math.random() * 1000000);
  const rng = createRNG(seed);
  const viewport = opts.viewport || { vw: 1920, vh: 1080 };
  const screensX = opts.stripScreensX !== undefined ? opts.stripScreensX : 10;
  const screensY = opts.stripScreensY !== undefined ? opts.stripScreensY : 2.2;
  const scaleFor = opts.scaleFor;
  if (typeof scaleFor !== 'function') {
    throw new Error('generateStrip: 需要 opts.scaleFor(viewport, tpl)（片内 scale 沿用 nodeScaleFor 口径）');
  }

  const stripH = screensY * viewport.vh;
  const halfBand = stripH / 2;
  // 批量发牌：nodeScaleFor 保证片宽 ≥3 屏，按 ≈3.5 屏/片估算片数，总长 ≈ screensX 屏
  const chunkCount = opts.chunkCount || Math.max(2, Math.round(screensX / 3.5));

  const chunks = [];
  const covers = [];
  const junctions = [];
  const roadWs = [];
  let accW = 0;
  // 2026-10-05 一体化路网：先规划各片模板/宽度，再整条 strip 一次生成路网，
  // 各片只做避让、不自生成（根治片间公路断开）。
  const plan = [];
  let totalW = 0;
  {
    let px = 0;
    for (let i = 0; i < chunkCount; i++) {
      let tpl = null;
      if (opts.templateIds && opts.templateIds[i]) {
        tpl = getTemplates().find(t => t.id === opts.templateIds[i]);
        if (!tpl) throw new Error('generateStrip: 模板不存在 ' + opts.templateIds[i]);
      } else {
        tpl = pickTemplate(diff, rng);
      }
      const scale = scaleFor(viewport, tpl);
      const cw = tpl.w * scale;
      plan.push({ tpl: tpl, scale: scale, cw: cw, x0: px, seed: rng.int(0, 1000000) });
      px += cw;
    }
    totalW = px;
  }
  // ===== 2026-10-05 热点驱动管线（用户四步架构）=====
  // 步骤1：敌方生成热点——玩法先行，路网/水系围绕热点布局
  const hotspots = [];
  {
    const hsRng = createRNG((seed ^ 0x907) >>> 0);
    const nHot = Math.max(3, Math.round(totalW / 4000));  // ~每4000px一个热点
    for (let i = 0; i < nHot; i++) {
      hotspots.push({
        x: totalW * (i + 0.5) / nHot + hsRng.range(-800, 800),
        y: stripH * hsRng.range(0.25, 0.75),
        id: 'hs-' + i
      });
    }
  }
  // Strip 级路网（虚拟模板：整条 strip 一次铺路；scale=1，中心在 strip 中央）。
  // 路宽/拓扑走 placeRoadNetwork 既有逻辑（A–I 拓扑）；横向干道天然贯通整条 strip。
  const stripRng = createRNG((seed ^ 0x57A17) >>> 0);
  const stripRoadNet = placeRoadNetwork(stripRng,
    { w: totalW, h: stripH, id: '__strip__' }, 1, totalW / 2, stripH / 2,
    { requireWETrunk: true, trunkAmp: 0.03 });
  const stripRoadW = stripRoadNet.roadW || 100;
  // 2026-10-05：分支连接点统一间距管理——所有分支（strip-branch/hs-secondary/bridge）
  // 在主干道上的连接点间距 ≥900px，避免过密。
  const branchPoints = [];
  const isBranchPointClear = (x, y, minDist) => {
    for (const p of branchPoints) {
      if (Math.hypot(x - p.x, y - p.y) < minDist) return false;
    }
    return true;
  };
  // 2026-10-05：strip 岔路加密——宽幅下拓扑分支稀疏。沿最长横干每 ~1200px
  // 加一条短岔路（南北随机，300~500px），丰富路网细节。
  {
    // 找最长横向链（按 groupId 聚类，取 x 跨度最大者）
    const byGroup = {};
    for (const r of stripRoadNet.covers) {
      if (r.tier !== 'road') continue;
      const g = r.groupId || 'x';
      if (!byGroup[g]) byGroup[g] = [];
      byGroup[g].push(r);
    }
    let best = null, bestSpan = 0;
    for (const arr of Object.values(byGroup)) {
      const xs = arr.map(c => c.x);
      const span = Math.max(...xs) - Math.min(...xs);
      if (span > bestSpan) { bestSpan = span; best = arr; }
    }
    if (best && bestSpan > totalW * 0.5) {
      const xs = best.map(c => c.x).sort((a, b) => a - b);
      const branchRng = createRNG((seed ^ 0xB2A4) >>> 0);
      for (let bx = 800; bx < totalW - 400; bx += 1200) {
        // 找 bx 处干道的 y（最近段）
        let by = stripH / 2, bd = Infinity;
        for (const c of best) {
          const d = Math.abs(c.x - bx);
          if (d < bd) { bd = d; by = c.y; }
        }
        if (bd > 400) continue;
        // 统一间距：≥900px
        if (!isBranchPointClear(bx, by, 900)) continue;
        const goNorth = branchRng() < 0.5;
        const len = branchRng.range(300, 500);
        const y0 = by, y1 = goNorth ? by - len : by + len;
        if (y1 < 60 || y1 > stripH - 60) continue;  // 出界跳过
        branchPoints.push({ x: bx, y: by });
        const nSeg = 3;
        for (let si = 0; si < nSeg; si++) {
          const t0 = si / nSeg, t1 = (si + 1) / nSeg;
          const sy = y0 + (y1 - y0) * (t0 + t1) / 2;
          // 轻微弯曲
          const sx = bx + Math.sin(t0 * Math.PI) * branchRng.range(-30, 30);
          stripRoadNet.covers.push({
            x: sx, y: sy, w: stripRoadW * 0.7, h: Math.abs(y1 - y0) / nSeg + 20,
            angle: 0, tier: 'road', groupId: 'strip-branch'
          });
        }
        // 岔路口 junction（供渲染断开中心线）
        stripRoadNet.junctions.push({ x: bx, y: by, r: stripRoadW * 0.5 });
      }
    }
  }
  // 2026-10-05 步骤2：热点驱动次要公路——无交叉的热点，从热点向最近主干道
  // 修一条短次要路（T 形交叉，1 端点接主干道），保证每个热点都是路网节点。
  {
    const hsRng = createRNG((seed ^ 0x5EC0) >>> 0);
    for (const hs of hotspots) {
      // 检查 600px 内是否已有 junction（拓扑自带或岔路加密）
      let hasJ = false;
      for (const j of stripRoadNet.junctions) {
        if (Math.hypot(j.x - hs.x, j.y - hs.y) < 600) { hasJ = true; break; }
      }
      if (hasJ) { hs.hasJunction = true; continue; }
      // 找最近主干道路段
      let best = null, bestD = Infinity;
      for (const r of stripRoadNet.covers) {
        if (r.tier !== 'road') continue;
        // 只考虑主干道（非次要路/补缝段）
        if (r.groupId === 'strip-branch' || r.groupId === 'strip-seam-fix') continue;
        const d = Math.hypot(r.x - hs.x, r.y - hs.y);
        if (d < bestD) { bestD = d; best = r; }
      }
      if (!best || bestD > 1500) continue;  // 太远则跳过（避免超长次要路）
      // 2026-10-05 夹角约束：次要路与主干道夹角（锐角）≥45°。
      // 候选连接点沿主干道方向偏移，选首个满足夹角者。
      const mainAngle = best.angle || 0;
      const secAngleFor = (cx, cy) => {
        const a = Math.atan2(cy - hs.y, cx - hs.x);
        let diff = Math.abs(a - mainAngle) % Math.PI;
        return Math.min(diff, Math.PI - diff);
      };
      let connX = best.x, connY = best.y;
      let found = secAngleFor(connX, connY) >= Math.PI / 4;
      if (!found) {
        const dxm = Math.cos(mainAngle), dym = Math.sin(mainAngle);
        for (const off of [200, -200, 400, -400, 600, -600]) {
          const cx = best.x + dxm * off, cy = best.y + dym * off;
          if (secAngleFor(cx, cy) >= Math.PI / 4) {
            connX = cx; connY = cy; found = true; break;
          }
        }
      }
      if (!found) continue;  // 无满足夹角的连接点，跳过
      // 2026-10-05：统一间距 ≥900px
      if (!isBranchPointClear(connX, connY, 900)) continue;
      // 次要路：从热点到连接点，3 段轻微弯曲
      const dx = connX - hs.x, dy = connY - hs.y;
      const dist = Math.hypot(dx, dy) || 1;
      const ux = dx / dist, uy = dy / dist;
      // 法线方向微弯
      const nx = -uy, ny = ux;
      const bend = hsRng.range(-40, 40);
      const nSeg = 3;
      for (let si = 0; si < nSeg; si++) {
        const t0 = si / nSeg, t1 = (si + 1) / nSeg;
        const tm = (t0 + t1) / 2;
        const px = hs.x + dx * tm + nx * Math.sin(tm * Math.PI) * bend;
        const py = hs.y + dy * tm + ny * Math.sin(tm * Math.PI) * bend;
        const segLen = dist / nSeg;
        stripRoadNet.covers.push({
          x: px, y: py, w: segLen + 20, h: stripRoadW * 0.65,
          angle: Math.atan2(dy, dx), tier: 'road', groupId: 'hs-secondary'
        });
      }
      // T 形交叉点 junction（在连接点）
      stripRoadNet.junctions.push({ x: connX, y: connY, r: stripRoadW * 0.5 });
      branchPoints.push({ x: connX, y: connY });
      hs.hasJunction = true;
      hs.secondaryRoad = true;
    }
  }
  // 2026-10-05：接缝补路——宽幅模板下拓扑曲线的振幅可能把路带出界（段被裁），
  // 导致某接缝处无路面。后处理：对每条内部接缝，若 200px 内无 road cover，
  // 在最近 road 的 y 高度补一条水平直段（保证横向干道真实过缝）。
  {
    const seamXs = [];
    for (const p of plan) seamXs.push(p.x0);
    // plan[0].x0=0 是 strip 左界，不算内部接缝
    for (let si = 1; si < seamXs.length; si++) {
      const bx = seamXs[si];
      const near = stripRoadNet.covers.some(c => c.tier === 'road' && Math.abs(c.x - bx) < 200);
      if (!near) {
        // 找最近的 road y
        let bestY = stripH / 2, bestD = Infinity;
        for (const c of stripRoadNet.covers) {
          if (c.tier !== 'road') continue;
          const d = Math.abs(c.x - bx);
          if (d < bestD) { bestD = d; bestY = c.y; }
        }
        // 界内钳制：段半宽 200px，y 须在 [200, stripH-200] 内
        const cy = Math.max(200, Math.min(stripH - 200, bestY));
        stripRoadNet.covers.push({
          x: bx, y: cy, w: 400, h: stripRoadW, angle: 0,
          tier: 'road', groupId: 'strip-seam-fix'
        });
      }
    }
  }
  // 2026-10-05：出界路段过滤（置于岔路/补缝之后）——placeRoadNetwork 的 segInBounds
  // 只查段中心，宽幅下段半幅可能探出界。strip 级严格过滤：整段须在界内。
  {
    const kept = [];
    for (const r of stripRoadNet.covers) {
      if (r.tier !== 'road') { kept.push(r); continue; }
      const hw = (r.w || 0) / 2, hh = (r.h || 0) / 2;
      const ext = Math.max(hw, hh);  // 旋转段用包络近似（保守）
      if (r.x - ext < 0 || r.x + ext > totalW || r.y - ext < 0 || r.y + ext > stripH) continue;
      kept.push(r);
    }
    stripRoadNet.covers = kept;
  }
  // 2026-10-05：平行重叠主干道去重——两路平行（<15°）、X 向重叠、Y 向 <100px 时
  // 只保留一条（避免路口-端点间 2 条公路的冗余）。
  {
    const roads = stripRoadNet.covers.filter(r => r.tier === 'road');
    const others = stripRoadNet.covers.filter(r => r.tier !== 'road');
    const getDir = (c) => {
      let a = c.angle || 0;
      if ((c.w || 0) < (c.h || 0)) a += Math.PI / 2;
      return ((a % Math.PI) + Math.PI) % Math.PI;
    };
    const toRemove = new Set();
    for (let i = 0; i < roads.length; i++) {
      if (toRemove.has(i)) continue;
      const a = roads[i];
      // 只处理主干道（非分支/次要路）
      if (a.groupId === 'strip-branch' || a.groupId === 'hs-secondary' || a.groupId === 'bridge-approach') continue;
      for (let j = i + 1; j < roads.length; j++) {
        if (toRemove.has(j)) continue;
        const b = roads[j];
        if (b.groupId === 'strip-branch' || b.groupId === 'hs-secondary' || b.groupId === 'bridge-approach') continue;
        const da = getDir(a), db = getDir(b);
        let diff = Math.abs(da - db) % Math.PI;
        const acute = Math.min(diff, Math.PI - diff) * 180 / Math.PI;
        if (acute > 15) continue;  // 不平行
        // X 向重叠？
        const aX0 = a.x - a.w / 2, aX1 = a.x + a.w / 2;
        const bX0 = b.x - b.w / 2, bX1 = b.x + b.w / 2;
        const xOverlap = Math.min(aX1, bX1) - Math.max(aX0, bX0);
        if (xOverlap < 50) continue;  // X 不重叠
        // Y 向接近？
        if (Math.abs(a.y - b.y) > 100) continue;
        // 保留较长的
        const aLen = Math.max(a.w, a.h), bLen = Math.max(b.w, b.h);
        toRemove.add(aLen >= bLen ? j : i);
        if (aLen < bLen) break;  // a 被删，跳出内层
      }
    }
    const keptRoads = roads.filter((_, idx) => !toRemove.has(idx));
    stripRoadNet.covers = others.concat(keptRoads);
  }
  // 2026-10-05 一体化河流：strip 级生成 1–2 条横向蜿蜒河流（贯穿整条 strip，
  // 根治片间断开；出现率从模板标签的 ~2/7 提升到每条 strip 必有）。
  const stripRivers = placeStripRivers(createRNG((seed ^ 0x21E2) >>> 0),
    totalW, stripH, stripRoadNet.covers, stripRoadW);
  // 2026-10-05：次要公路不过河——删除穿越河流的 hs-secondary / strip-branch。
  // （主干道可经桥跨河；次要路应绕行。）
  {
    const riverSegs = [];
    for (const rv of stripRivers) {
      if ((rv.tier || 'river') !== 'river') continue;
      for (const s of (rv.segments || [])) riverSegs.push(s);
    }
    const keptRoads = [];
    let removedSecondary = 0;
    for (const r of stripRoadNet.covers) {
      if (r.tier === 'road' && (r.groupId === 'hs-secondary' || r.groupId === 'strip-branch')) {
        let crosses = false;
        for (const s of riverSegs) {
          // OBB 粗判：中心距
          const dx = Math.abs(r.x - s.dx), dy = Math.abs(r.y - s.dy);
          const ra = s.angle || 0;
          const rw = (s.w * Math.abs(Math.cos(ra)) + s.h * Math.abs(Math.sin(ra))) / 2;
          const rh = (s.w * Math.abs(Math.sin(ra)) + s.h * Math.abs(Math.cos(ra))) / 2;
          const rra = r.angle || 0;
          const rrW = (r.w * Math.abs(Math.cos(rra)) + r.h * Math.abs(Math.sin(rra))) / 2;
          const rrH = (r.w * Math.abs(Math.sin(rra)) + r.h * Math.abs(Math.cos(rra))) / 2;
          if (dx < rw + rrW - 10 && dy < rh + rrH - 10) { crosses = true; break; }
        }
        if (crosses) { removedSecondary++; continue; }
      }
      keptRoads.push(r);
    }
    stripRoadNet.covers.length = 0;
    for (const r of keptRoads) stripRoadNet.covers.push(r);
    // 同步删除对应的 junction（hs-secondary 的 T 形路口）
    // （简化：保留 junction，路没了路口标记无害）
  }
  for (let i = 0; i < chunkCount; i++) {
    const { tpl, scale, cw, x0, seed: chunkSeed } = plan[i];
    // 该片区间的路网切到片内帧（片内帧原点 = strip (x0 + cw/2, halfBand)）。
    const localRoads = [];
    for (const r of stripRoadNet.covers) {
      const rx0 = r.x - (r.w || 0) / 2, rx1 = r.x + (r.w || 0) / 2;
      if (rx1 < x0 || rx0 > x0 + cw) continue;
      localRoads.push(Object.assign({}, r, { x: r.x - (x0 + cw / 2), y: r.y - halfBand }));
    }
    const localJunctions = [];
    for (const j of stripRoadNet.junctions) {
      if (j.x < x0 || j.x > x0 + cw) continue;
      localJunctions.push({ x: j.x - (x0 + cw / 2), y: j.y - halfBand, r: j.r });
    }
    // 该片区间的河流切到片内帧（供建筑避让）。
    const localRivers = [];
    for (const rv of stripRivers) {
      for (const s of rv.segments) {
        const sx = s.dx, sy = s.dy;  // segments 已在 strip 坐标
        if (sx + s.w / 2 < x0 || sx - s.w / 2 > x0 + cw) continue;
        localRivers.push({ x: sx - (x0 + cw / 2), y: sy - halfBand, w: s.w, h: s.h, angle: s.angle || 0, tier: rv.tier || 'river' });
      }
    }
    // 片内帧：generateNode 以 centerX/centerY 为基准（makeNode 同款调用：0,0）。
    const node = generateNode(diff, {
      seed: chunkSeed,
      scale: scale,
      centerX: 0, centerY: 0,
      templateId: tpl.id,
      buildingDensity: opts.buildingDensity,
      cullRate: opts.cullRate,
      roadOpts: {
        externalRoads: localRoads,
        externalJunctions: localJunctions,
        externalRoadW: stripRoadW,
        externalRivers: localRivers
      }
    });

    // 纵向裁剪（§14.2）：片高 > 目标高时丢弃上下边缘元素（按中心判定；不做坐标压缩）
    const kept = [], dropped = [];
    for (const c of node.covers) {
      if (Math.abs(c.y) <= halfBand) kept.push(c);
      else dropped.push(c);
    }
    // 密度补偿（§14.2）：带外元素钳制回界内而非直接丢弃——与已保留的非地面元素
    // 做 OBB 重叠检测，命中则放弃该元素。ground/liquid 不钳制（地形层无所谓）。
    // 2026-10-05：钳制同时避路（与道路 OBB 重叠则放弃），路面净空优先。
    const CLAMP_MARGIN = 80;
    const keptRoads = kept.filter(k => k.tier === 'road');
    for (const c of dropped) {
      const tg = _stripTierGroup(c.tier);
      if (tg === 'ground' || tg === 'liquid') continue;
      const cy = Math.max(-halfBand + CLAMP_MARGIN, Math.min(halfBand - CLAMP_MARGIN, c.y));
      const cand = Object.assign({}, c, { y: cy });
      let hit = false;
      for (const k of kept) {
        const ktg = _stripTierGroup(k.tier);
        if (ktg === 'ground' || ktg === 'liquid') continue;
        if (_obbOverlap(cand, k)) { hit = true; break; }
      }
      if (!hit) {
        for (const r of keptRoads) {
          if (_obbOverlap(cand, r)) { hit = true; break; }
        }
      }
      if (!hit) kept.push(cand);
    }

    // 横向拼接：chunk i 占据 [x0, x0+cw]（规划 pass 已算好），y 平移到 [0, stripH]
    for (const c of kept) {
      c.x += x0 + cw / 2;
      c.y += halfBand;
      covers.push(c);
    }
    for (const j of (node.roadJunctions || [])) {
      if (Math.abs(j.y) > halfBand) continue;   // 路口标记随纵向裁剪
      junctions.push({ x: j.x + x0 + cw / 2, y: j.y + halfBand, r: j.r });
    }
    roadWs.push(node.roadW);
    chunks.push({ templateId: tpl.id, w: cw, h: node.h, x0: x0, seed: chunkSeed });
    accW += cw;
  }
  const stripW = accW;
  // 一体化路网：strip 级路面 cover 与路口直接追加（已在 strip 坐标 [0,totalW]×[0,stripH]）。
  for (const r of stripRoadNet.covers) covers.push(r);
  for (const j of stripRoadNet.junctions) junctions.push({ x: j.x, y: j.y, r: j.r });
  // 一体化河流：strip 级河段追加；路河交叉处用桥替换河段（桥不压河）。
  // 2026-10-05 修订：短段模式——每段独立判断，压路则替换为桥（不再切分长段）。
  {
    const bridgeSeen = new Set();  // 200px 去重，同一交叉只一座桥
    const bridgePositions = [];  // 2026-10-05：桥间距 ≥800px，避免过渡段过密
    for (const rv of stripRivers) {
      // 湖（water）不参与桥替换——湖面宽，路应绕行而非架桥；verts 透传供渲染
      if ((rv.tier || 'river') !== 'river') {
        for (const s of rv.segments) {
          covers.push({
            x: s.dx, y: s.dy, w: s.w, h: s.h, angle: s.angle || 0,
            tier: rv.tier || 'river', groupId: rv.groupId,
            verts: rv.verts || null
          });
        }
        continue;
      }
      for (const s of rv.segments) {
        let hitRoad = null;
        for (const r of stripRoadNet.covers) {
          // OBB 粗判：中心距 < 半宽之和（角度已计入段 w 的搭接余量）
          const dx = Math.abs(s.dx - r.x), dy = Math.abs(s.dy - r.y);
          if (dx > (s.w + r.w) / 2 * 0.7) continue;
          if (dy > (s.h + r.h) / 2 + 20) continue;
          hitRoad = r;
          break;
        }
        // 2026-10-05：平行路不触发桥——仅当路与河夹角>30°（真实交叉）时才处理；
        // 平行近距的直接保留河段（避免长距离误伤导致河流中断）。
        // 注：涵洞逻辑已删除——河流必须连续，角度问题由桥过渡段缓解。
        if (hitRoad) {
          // 2026-10-05：桥必须垂直于河流中心线，两侧公路平滑过渡。
          const getDir = (c) => {
            let a = c.angle || 0;
            if ((c.w || 0) < (c.h || 0)) a += Math.PI / 2;
            return ((a % Math.PI) + Math.PI) % Math.PI;
          };
          // 局部河向平均（±200px内河段方向平均，避免单段抖动）
          let sumX = 0, sumY = 0, cnt = 0;
          for (const s2 of rv.segments) {
            if (Math.abs(s2.dx - s.dx) > 200 || Math.abs(s2.dy - s.dy) > 200) continue;
            const d = getDir(s2);
            // 方向平均（处理 π 周期）：转为向量平均
            sumX += Math.cos(d * 2); sumY += Math.sin(d * 2); cnt++;
          }
          let riverDir;
          if (cnt > 0) {
            riverDir = Math.atan2(sumY / cnt, sumX / cnt) / 2;
            riverDir = ((riverDir % Math.PI) + Math.PI) % Math.PI;
          } else {
            riverDir = getDir(s);
          }
          const bridgeDir = (riverDir + Math.PI / 2) % Math.PI;  // 垂直于河
          const roadDir = getDir(hitRoad);
          // 2026-10-05：不再做涵洞跳过——河流必须连续。桥垂直于河，
          // 与路夹角由过渡段缓解（>15°时加过渡段）。
          const key = Math.round(s.dx / 200) + ':' + Math.round(s.dy / 200);
          if (!bridgeSeen.has(key)) {
            bridgeSeen.add(key);
            // 2026-10-05：统一间距 ≥900px（含桥）——过近则不建桥，
            // 但保留河段（河流连续，路下涉水）。
            if (!isBranchPointClear(s.dx, s.dy, 900)) {
              // 保留河段（不建桥）
              covers.push({
                x: s.dx, y: s.dy, w: s.w, h: s.h, angle: s.angle || 0,
                tier: 'river', groupId: rv.groupId
              });
            } else {
              bridgePositions.push({ x: s.dx, y: s.dy });
              branchPoints.push({ x: s.dx, y: s.dy });
              const bridgeLen = s.h + 60;  // 跨两岸（沿桥向，长边）
              const bridgeWid = stripRoadW + 40;  // 路宽（横桥向，短边）
              const bx = s.dx, by = s.dy;
              covers.push({
                x: bx, y: by,
                w: bridgeLen, h: bridgeWid,
                angle: bridgeDir,  // 长边沿桥向（垂直于河）
                tier: 'bridge', groupId: 'strip-bridge', hp: 2
              });
              // 平滑过渡：若桥与路夹角>15°，在桥两端加过渡段
              let dAng = bridgeDir - roadDir;
              while (dAng > Math.PI / 2) dAng -= Math.PI;
              while (dAng < -Math.PI / 2) dAng += Math.PI;
              if (Math.abs(dAng) > Math.PI / 12) {  // >15°
                const hx = Math.cos(bridgeDir), hy = Math.sin(bridgeDir);
                for (const side of [1, -1]) {
                  // 桥端
                  const ex = bx + hx * bridgeLen / 2 * side;
                  const ey = by + hy * bridgeLen / 2 * side;
                  // 过渡段：从桥端向路方向延伸，中点角度渐变
                  const midA = bridgeDir - dAng * 0.5 * side;
                  const segLen = 70;
                  const mx = ex + Math.cos(midA) * segLen * side;
                  const my = ey + Math.sin(midA) * segLen * side;
                  covers.push({
                    x: (ex + mx) / 2, y: (ey + my) / 2,
                    w: segLen + 20, h: stripRoadW * 0.9,
                    angle: midA, tier: 'road', groupId: 'bridge-approach'
                  });
                }
              }
            }
          }
          // 该河段被桥替换（或保留），不追加 river（已在上处理）
        } else {
          covers.push({
            x: s.dx, y: s.dy, w: s.w, h: s.h, angle: s.angle || 0,
            tier: rv.tier || 'river', groupId: rv.groupId
          });
        }
      }
    }
  }

  // 2026-10-05：河岸植被加密——河流两侧 40~150px 带内植被更茂密。
  // 每河段 60% 概率每侧种 1~2 棵树/灌木，避让道路/水体/已有建筑。
  {
    const ripRng = createRNG((seed ^ 0x71A5) >>> 0);
    const vegCovers = [];
    // 收集所有水体（河+湖）用于避让
    const allWaters = covers.filter(c => c.tier === 'river' || c.tier === 'water');
    const allRoads = covers.filter(c => c.tier === 'road' || c.tier === 'bridge');
    for (const rv of stripRivers) {
      if ((rv.tier || 'river') !== 'river') continue;  // 湖不加密（已有植被）
      for (const s of rv.segments) {
        if (ripRng() > 0.6) continue;  // 60% 概率
        const sAng = s.angle || 0;
        // 河段半宽（垂直方向）
        const riverHalf = s.h / 2;
        // 法线方向（两侧）
        const nx = -Math.sin(sAng), ny = Math.cos(sAng);
        for (const side of [1, -1]) {
          const nVeg = ripRng.int(1, 2);
          for (let vi = 0; vi < nVeg; vi++) {
            const dist = riverHalf + ripRng.range(40, 150);
            // 沿河段方向随机偏移（避免整齐排列）
            const along = ripRng.range(-s.w / 2, s.w / 2) * 0.8;
            const vx = s.dx + Math.cos(sAng) * along + nx * dist * side;
            const vy = s.dy + Math.sin(sAng) * along + ny * dist * side;
            // 界内检查
            if (vx < 50 || vx > totalW - 50 || vy < 50 || vy > stripH - 50) continue;
            // 避让：道路/桥梁/水体/已有植被（结构）
            let blocked = false;
            const vw = ripRng() < 0.6 ? ripRng.range(22, 30) : ripRng.range(50, 65);
            const vh = vw * ripRng.range(0.7, 0.9);
            for (const r of allRoads) {
              const dx = Math.abs(vx - r.x), dy = Math.abs(vy - r.y);
              if (dx < (vw + r.w) / 2 + 20 && dy < (vh + r.h) / 2 + 20) { blocked = true; break; }
            }
            if (blocked) continue;
            for (const w of allWaters) {
              const dx = Math.abs(vx - w.x), dy = Math.abs(vy - w.y);
              const wa = w.angle || 0;
              const ww = (w.w * Math.abs(Math.cos(wa)) + w.h * Math.abs(Math.sin(wa))) / 2;
              const wh = (w.w * Math.abs(Math.sin(wa)) + w.h * Math.abs(Math.cos(wa))) / 2;
              if (dx < vw / 2 + ww + 10 && dy < vh / 2 + wh + 10) { blocked = true; break; }
            }
            if (blocked) continue;
            // 避让已有 structure/foliage（避免重叠）
            for (const c of covers) {
              const tg = _stripTierGroup(c.tier);
              if (tg !== 'structure' && tg !== 'foliage') continue;
              const dx = Math.abs(vx - c.x), dy = Math.abs(vy - c.y);
              if (dx < (vw + c.w) / 2 + 10 && dy < (vh + c.h) / 2 + 10) { blocked = true; break; }
            }
            if (blocked) continue;
            // 种树（60%）或灌木（40%）
            const isTree = ripRng() < 0.6;
            vegCovers.push({
              x: vx, y: vy, w: vw, h: vh,
              angle: ripRng.range(-0.3, 0.3),
              tier: isTree ? 'tree' : 'bush',
              groupId: 'riparian',
              hp: 1
            });
          }
        }
      }
    }
    for (const v of vegCovers) covers.push(v);
  }

  // 接缝净空（§14.2 必需）：内部片边界 ±300px 带内移除 structure/foliage，保留 ground/liquid
  // 2026-10-05：bridge 豁免（路河交叉基础设施，清掉会导致河流切断公路）。
  const seamX = [];
  for (let i = 1; i < chunks.length; i++) seamX.push(chunks[i].x0);
  const finalCovers = [];
  let seamCleared = 0;
  for (const c of covers) {
    const tg = _stripTierGroup(c.tier);
    if ((tg === 'structure' || tg === 'foliage') && c.tier !== 'bridge') {
      let inSeam = false;
      for (let s = 0; s < seamX.length; s++) {
        if (Math.abs(c.x - seamX[s]) < STRIP_SEAM_CLEAR) { inSeam = true; break; }
      }
      if (inSeam) { seamCleared++; continue; }
    }
    finalCovers.push(c);
  }

  // 2026-10-05 步骤4最终兜底：删除所有压河/压湖的 structure/foliage
  // （OBB 精确判定）。保证"水域范围外生成"的绝对性。
  {
    const waters = finalCovers.filter(c => c.tier === 'river' || c.tier === 'water');
    const kept = [];
    let waterCleared = 0;
    for (const c of finalCovers) {
      const tg = _stripTierGroup(c.tier);
      if ((tg === 'structure' || tg === 'foliage') && c.tier !== 'bridge' && c.tier !== 'road') {
        let hitsWater = false;
        for (const w of waters) {
          // OBB 近似：用 AABB 快速拒收，精确相交用中心距+半宽
          const dx = Math.abs(c.x - w.x), dy = Math.abs(c.y - w.y);
          // 考虑旋转：取包络半宽
          const wa = w.angle || 0;
          const ww = (w.w * Math.abs(Math.cos(wa)) + w.h * Math.abs(Math.sin(wa))) / 2;
          const wh = (w.w * Math.abs(Math.sin(wa)) + w.h * Math.abs(Math.cos(wa))) / 2;
          const ca = c.angle || 0;
          const cw = (c.w * Math.abs(Math.cos(ca)) + c.h * Math.abs(Math.sin(ca))) / 2;
          const ch = (c.w * Math.abs(Math.sin(ca)) + c.h * Math.abs(Math.cos(ca))) / 2;
          if (dx < ww + cw - 10 && dy < wh + ch - 10) { hitsWater = true; break; }
        }
        if (hitsWater) { waterCleared++; continue; }
      }
      kept.push(c);
    }
    finalCovers.length = 0;
    for (const c of kept) finalCovers.push(c);
  }

  // 密度（屏 = vw×vh 世界 px）
  const screens = (stripW * stripH) / (viewport.vw * viewport.vh);
  const densityPerScreen = screens > 0 ? finalCovers.length / screens : 0;

  return {
    advanceAxis: 'x',
    seed: seed,
    difficulty: diff,
    w: stripW,
    h: stripH,
    covers: finalCovers,
    roadJunctions: junctions,
    roadW: roadWs,
    chunks: chunks,
    chunkCount: chunks.length,
    seamCleared: seamCleared,
    densityPerScreen: densityPerScreen
  };
}

  /**
   * 布局质量度量（P-43 / 地基切片）：给定 generateNode 的 result，返回一组可量化的
   * 布局健康度指标，供后续难度校准 / #A11 重构前建立基线。纯函数、无 DOM、Node 可测。
   * 不依赖 tank_cover / tank_map，自包含实现 OBB 点测试；视线查询默认惰性 require
   * tank_cover.hasLineOfSight（失败则 losSymmetry=null），亦可由 opts.hasLineOfSight 注入。
   * @param {Object} result generateNode 返回值（含 covers/w/h，可选 water/playerSpawn）
   * @param {Object} [opts]
   * @param {number} [opts.step=25]      连通性网格采样步长（px）
   * @param {number} [opts.margin=40]    连通性采样区域边距（px）
   * @param {number} [opts.losSamples=200] 视线对称性随机采样点数
   * @param {Object} [opts.startPoint]   连通性 BFS 起点；缺省用 result.playerSpawn 或 (w*0.10,h/2)
   * @param {Function} [opts.hasLineOfSight] 视线遮挡查询（(ox,oy,tx,ty,covers)=>bool）
   * @returns {Object} {coverCoverage, connectivityRatio, losSymmetry, minPassageWidth, coverCount, waterArea}
   */
  function nodeLayoutMetrics(result, opts) {
    opts = opts || {};
    const covers = (result && result.covers) || [];
    const w = (result && result.w) || 0;
    const h = (result && result.h) || 0;
    const playArea = w * h;

    // --- coverCoverage：Σ(w*h) / 可玩面积（AABB 近似，旋转忽略；可 >1） ---
    // #A11: Ground/Liquid terrain tiers (road, mud, river, water) do not count toward cover coverage.
    let coverArea = 0;
    let forestArea = 0;
    const coverTiers = (typeof RULES !== 'undefined' && RULES.coverTiers) ? RULES.coverTiers : null;
    for (const c of covers) {
      const tierDef = coverTiers && coverTiers[c.tier];
      const isGroundOrLiquid = tierDef ? (tierDef.tierGroup === 'ground' || tierDef.tierGroup === 'liquid') : (c.tier === 'road' || c.tier === 'mud' || c.tier === 'river' || c.tier === 'water');
      if (isGroundOrLiquid) continue;

      const area = (c.w || 0) * (c.h || 0);
      coverArea += area;
      if (c.tier === 'tree' || c.tier === 'bush' || c.tier === 'forest') {
        forestArea += area;
      }
    }
    const coverCoverage = playArea > 0 ? coverArea / playArea : 0;
    const forestCoverage = playArea > 0 ? forestArea / playArea : 0;

    // --- 自包含 OBB 点测试（旋转矩形 + verts/collisionVerts 多边形） ---
    const isBlocked = (x, y) => {
      for (const c of covers) {
        const tierDef = coverTiers && coverTiers[c.tier];
        const isGround = tierDef ? (tierDef.tierGroup === 'ground') : (c.tier === 'road' || c.tier === 'mud');
        if (isGround) continue; // Roads and mud patches do not block physical movement
        // 2026-10-05：对齐 tank_cover.js 游戏口径——阻挡 = passability===0 或 shellBlock。
        // river/water 的 passability=0.4 是减速通行（AGENTS.md §4），不阻断连通性；
        // bridge 的 passability=1 更不阻断。旧实现把一切非 ground 都当墙，
        // 导致一体化河流（本就可涉水）的 strip 连通性被严重低估。
        if (tierDef) {
          const blocked = tierDef.passability === 0 ||
            tierDef.shellBlock === true || tierDef.shellBlock === 'single';
          if (!blocked) continue;
        }

        if (c.verts || c.collisionVerts) {
          if (_pointInCoverPoly(c, x, y, 0)) return true;
        } else {
          const dx = x - c.x, dy = y - c.y;
          const ang = -(c.angle || 0);
          const ca = Math.cos(ang), sa = Math.sin(ang);
          const lx = dx * ca - dy * sa;
          const ly = dx * sa + dy * ca;
          if (Math.abs(lx) <= (c.w || 0) / 2 && Math.abs(ly) <= (c.h || 0) / 2) return true;
        }
      }
      return false;
    };

    // --- connectivityRatio：网格采样（step / margin）+ BFS（4-连通，直角不切角） ---
    const step = opts.step || 25;
    const margin = opts.margin || 40;
    const xs = [], ys = [];
    for (let x = margin; x <= w - margin + 1e-6; x += step) xs.push(x);
    for (let y = margin; y <= h - margin + 1e-6; y += step) ys.push(y);
    if (xs.length === 0) xs.push(w / 2);
    if (ys.length === 0) ys.push(h / 2);
    const cols = xs.length, rows = ys.length;
    const blockedGrid = [];
    let totalNonBlocked = 0;
    for (let gy = 0; gy < rows; gy++) {
      blockedGrid[gy] = new Array(cols);
      for (let gx = 0; gx < cols; gx++) {
        const b = isBlocked(xs[gx], ys[gy]);
        blockedGrid[gy][gx] = b;
        if (!b) totalNonBlocked++;
      }
    }
    const start = opts.startPoint || (result && result.playerSpawn) || { x: w * 0.10, y: h / 2 };
    // BFS 种子 = 「距 start 最近的自由网格点」：start 本身可能落在掩体内
    // （度量不自找起点，makeNode 的 findPlayerSpawn 保证真实开局合法），
    // 取最近可站立网格作为连通种子，避免「起点自由但最近网格 cell 被盖」
    // 造成的假 0（校准 v2 口径：起点误差 ≤ 半网格距时应正常测通）。
    let sgx = -1, sgy = -1, bestD = Infinity;
    for (let gy = 0; gy < rows; gy++) {
      for (let gx = 0; gx < cols; gx++) {
        if (blockedGrid[gy][gx]) continue;
        const d = (xs[gx] - start.x) * (xs[gx] - start.x) + (ys[gy] - start.y) * (ys[gy] - start.y);
        if (d < bestD) { bestD = d; sgx = gx; sgy = gy; }
      }
    }
    let connectivityRatio = 0;
    if (totalNonBlocked > 0 && sgx >= 0) {
      const seen = new Array(rows * cols).fill(false);
      const idx = (gy, gx) => gy * cols + gx;
      const queue = [[sgy, sgx]];
      seen[idx(sgy, sgx)] = true;
      let reached = 0;
      while (queue.length) {
        const cur = queue.pop();
        const cy = cur[0], cx = cur[1];
        reached++;
        const neigh = [[cy - 1, cx], [cy + 1, cx], [cy, cx - 1], [cy, cx + 1]];
        for (const n of neigh) {
          const ny = n[0], nx = n[1];
          if (ny < 0 || ny >= rows || nx < 0 || nx >= cols) continue;
          if (blockedGrid[ny][nx]) continue;
          if (seen[idx(ny, nx)]) continue;
          seen[idx(ny, nx)] = true;
          queue.push([ny, nx]);
        }
      }
      connectivityRatio = reached / totalNonBlocked;
    } else {
      connectivityRatio = 0;
    }

    // --- minPassageWidth：两两 OBB「中心距 − 较大半对角线」的最小正值间隙 ---
    let minGap = Infinity;
    for (let i = 0; i < covers.length; i++) {
      for (let j = i + 1; j < covers.length; j++) {
        const a = covers[i], b = covers[j];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        const ha = Math.hypot(a.w || 0, a.h || 0) / 2;
        const hb = Math.hypot(b.w || 0, b.h || 0) / 2;
        const gap = dist - Math.max(ha, hb);
        if (gap > 0 && gap < minGap) minGap = gap;
      }
    }
    const minPassageWidth = (minGap === Infinity) ? 0 : minGap;

    // --- losSymmetry：K 个随机采样点，unordered 对 (i,j) 双向视线相等比例 ---
    let losSymmetry = null;
    const losFn = opts.hasLineOfSight || _getLoS();
    if (losFn) {
      if (covers.length === 0) {
        losSymmetry = 1; // 无掩体 → 双向视线恒等
      } else if (w > 0 && h > 0) {
        const K = opts.losSamples || 200;
        const r = createRNG(((result.seed >>> 0) ^ 0x4C6F53) >>> 0);
        const pts = [];
        for (let i = 0; i < K; i++) pts.push({ x: r() * w, y: r() * h });
        let eq = 0, tot = 0;
        for (let i = 0; i < K; i++) {
          for (let j = i + 1; j < K; j++) {
            const f = losFn(pts[i].x, pts[i].y, pts[j].x, pts[j].y, covers);
            const b = losFn(pts[j].x, pts[j].y, pts[i].x, pts[i].y, covers);
            tot++;
            if (f === b) eq++;
          }
        }
        losSymmetry = tot > 0 ? eq / tot : 1;
      }
    }

    // --- waterArea：若 result.water 存在则累加（当前 generateNode 不产出，留待 #A11） ---
    let waterArea = 0;
    if (result && result.water) {
      const wl = Array.isArray(result.water) ? result.water : [result.water];
      for (const ww of wl) waterArea += (ww.w || 0) * (ww.h || 0);
    }

    return {
      coverCoverage,
      forestCoverage,
      connectivityRatio,
      openness: connectivityRatio, // #A11 alias
      losSymmetry,
      minPassageWidth,
      coverCount: covers.length,
      waterArea
    };
  }

  // 视线查询惰性加载（容错：RULES 未注入时返回 null，不污染主链路）
  /** @type {any} */
  let _losModCache = '__uninit__';
  function _getLoS() {
    if (_losModCache !== '__uninit__') return _losModCache;
    try {
      const cov = require('./tank_cover.js');
      _losModCache = (cov && cov.hasLineOfSight) || null;
    } catch (e) {
      _losModCache = null;
    }
    return _losModCache;
  }

  // 多边形掩体命中测试（局部坐标 verts / collisionVerts；含 padding 边距缓冲）
  function _pointInCoverPoly(c, x, y, padding) {
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
        if (_segDist(lx, ly, vs[i][0], vs[i][1], vs[j][0], vs[j][1]) <= padding) return true;
      }
    }
    return false;
  }

  // 点到线段最短距离（多边形边距缓冲用）
  function _segDist(px, py, ax, ay, bx, by) {
    const vx = bx - ax, vy = by - ay;
    const wx = px - ax, wy = py - ay;
    const len2 = vx * vx + vy * vy;
    let t = len2 > 0 ? (wx * vx + wy * vy) / len2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const cx = ax + t * vx, cy = ay + t * vy;
    return Math.hypot(px - cx, py - cy);
  }

  // Export for Node.js if running in test environment
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      createRNG,
      NODE_TEMPLATES,
      registerTemplate,
      getTemplates,
      pickTemplate,
      generateNode,
      generateStrip,
      placeRoadNetwork,
      placeRoadsideBuildings,
      placeJunctionBarricades,
      placeVillage,
      placeForestClusters,
      ensureLoSCorridor,
      nodeLayoutMetrics,
      pruneOverlappingCovers
    };
  }
