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
function placeRoadNetwork(rng, tpl, scale, centerX, centerY) {
  const roadW = rng.range(60, 80); // 街道条带宽（世界px，与 village 街道契约 60~80 对齐）
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
  const buildFromPoints = (p1, p2, groupId, amp) => {
    const span = Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1;
    const ux = (p2.x - p1.x) / span, uy = (p2.y - p1.y) / span;
    const nx = -uy, ny = ux;
    const a = (amp === undefined) ? 0.04 : amp;
    const nCtrl = rng.int(1, 2);
    const ctrl = [p1];
    for (let c = 1; c <= nCtrl; c++) {
      const t = c / (nCtrl + 1);
      // 弯曲幅度必须小：局部斜率偏移会把正交路口变成浅角互穿（v1 的 35° 病根）
      const off = rng.range(-a, a) * span;
      ctrl.push({ x: p1.x + ux * span * t + nx * off, y: p1.y + uy * span * t + ny * off });
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

  const R = () => rng.range(-0.13, 0.13);
  const H = (i) => buildFromPoints(edgePoint(2, R()), edgePoint(3, R()), 'main-road-h' + i);   // 西→东
  const V = (i) => buildFromPoints(edgePoint(0, R()), edgePoint(1, R()), 'main-road-v' + i);   // 北→南
  // 在一条已有道路的真实折线上取锚点（按沿程比例 u∈(0,1)，避开两端 8%）
  const anchorOn = (pts, u) => {
    const k = Math.min(pts.length - 1, Math.max(0, Math.round(u * (pts.length - 1))));
    return { x: pts[k].x, y: pts[k].y };
  };
  // T 形支道：从横干道折线上的锚点向北或南延伸至该侧边界线 → 恒为 1 个 T 形路口
  const TH = (i, trunkPts, u) => {
    const side = rng() < 0.5 ? 0 : 1;                       // 0:向北 1:向南
    const ay = (side === 0) ? worldMinY : worldMaxY;
    const a = anchorOn(trunkPts, u);
    buildFromPoints(a, { x: a.x + R() * halfW * 0.5, y: ay }, 'main-road-t' + i);
  };
  // T 形支道：从纵干道折线上的锚点向东或西延伸至该侧边界线
  const TV = (i, trunkPts, u) => {
    const side = rng() < 0.5 ? 2 : 3;                       // 2:向西 3:向东
    const ax = (side === 2) ? worldMinX : worldMaxX;
    const a = anchorOn(trunkPts, u);
    buildFromPoints(a, { x: ax, y: a.y + R() * halfH * 0.5 }, 'main-road-t' + i);
  };

  // 直接构造「贯穿路」的两端点（供平行拓扑用错位半区端点）
  const spanH = (tA, tB) => [edgePoint(2, tA), edgePoint(3, tB)];
  const spanV = (tA, tB) => [edgePoint(0, tA), edgePoint(1, tB)];

  // 拓扑：每种最多 2 个路口（用户明确反对「路口太多」，故不设三岔拓扑）。
  const topoRoll = rng();
  if (topoRoll < 0.16) {
    // A 单条贯通（16%）：只有一条主路，0 路口，最稀疏
    if (rng() < 0.5) H(0); else V(0);
  } else if (topoRoll < 0.42) {
    // B 十字（26%）：横纵各一条 → 1 个直角路口
    H(0); V(0);
  } else if (topoRoll < 0.60) {
    // C 单侧 T 形（18%）：一条贯通干道 + 一条锚定支道 → 1 个 T 形路口
    if (rng() < 0.5) {
      const t = H(0); TH(0, t, rng.range(0.25, 0.75));
    } else {
      const t = V(0); TV(0, t, rng.range(0.25, 0.75));
    }
  } else if (topoRoll < 0.78) {
    // E 双侧 T 形（18%）：干道两侧各一条锚定支道 → 2 个分离的 T 形路口
    const t = H(0);
    TH(0, t, rng.range(0.18, 0.40));
    TH(1, t, rng.range(0.60, 0.82));
  } else if (topoRoll < 0.92) {
    // D 双同向平行（14%）：两条道分居上下/左右半区（错位、不相交）→ 0 路口，街区感
    if (rng() < 0.5) {
      const [a1, b1] = spanH(rng.range(-0.62, -0.24), rng.range(-0.62, -0.24));
      const [a2, b2] = spanH(rng.range(0.24, 0.62), rng.range(0.24, 0.62));
      buildFromPoints(a1, b1, 'main-road-h0'); buildFromPoints(a2, b2, 'main-road-h1');
    } else {
      const [a1, b1] = spanV(rng.range(-0.62, -0.24), rng.range(-0.62, -0.24));
      const [a2, b2] = spanV(rng.range(0.24, 0.62), rng.range(0.24, 0.62));
      buildFromPoints(a1, b1, 'main-road-v0'); buildFromPoints(a2, b2, 'main-road-v1');
    }
  } else {
    // F 错位丁字对（8%）：两条同向干道 + 各自一条反向支道 → 2 个 T 形路口，错位对称
    const t1 = H(0);
    TH(0, t1, rng.range(0.20, 0.40));
    TH(1, t1, rng.range(0.60, 0.80));
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
  return { covers: out, junctions: junctions };
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
const VILLAGE_SOLID = new Set(['full', 'half', 'barricade', 'tree', 'rock', 'stump', 'rubble', 'bridge', 'ruined', 'intact']);
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
  const roadW = rng.range(60, 80);            // 街道条带宽（世界px）
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
    // 低概率一次性小水塘（凸 blob，verts 10~14 与 P-40 校验区间兼容）
    if (!waterPlaced && rng() < 0.15) {
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
  for (let k = 0; k < nClusters; k++) {
    const reg = regions[k % regions.length];
    const rcx = opts.cx + (reg.dx || 0) * scale;
    const rcy = opts.cy + (reg.dy || 0) * scale;
    const rrx = (reg.rx !== undefined ? reg.rx : 110) * scale;
    const rry = (reg.ry !== undefined ? reg.ry : 110) * scale;
    const treeW = rng.range(22, 26) * scale;
    const treeH = rng.range(16, 20) * scale;
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
const _PRUNE_PRIORITY = {
  full: 9, intact: 9, rock: 8, bridge: 8, ruined: 6, barricade: 6,
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
  const roadNet = placeRoadNetwork(rrng, selectedTemplate, scale, centerX, centerY);
  const networkRoads = roadNet.covers;
  const roadJunctions = roadNet.junctions;
  for (const r of networkRoads) {
    outCovers.push(r);
  }

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
    })).concat(networkRoads.map(r => ({
      x: r.x, y: r.y, w: r.w, h: r.h, angle: r.angle // Some may use OBB but AABB is safe here
    })));
    forestCovers = placeForestClusters(itemBoxes, rng, {
      cx: centerX, cy: centerY, scale,
      minClusters: fcfg.minClusters, maxClusters: fcfg.maxClusters,
      regions: fcfg.regions
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

    // #A11: Template items avoid roads——但只对「实体掩体」执行避路剔除：
    //   - full：建筑优先于路（#77 契约；#B7 后路网不再为建筑跳段，建筑直接覆在路面上）；
    //   - 植被/地形类（bush/soft/tree/rock/stump/rubble/mud）：不剔除——树长在路边
    //     完全合理，且低难升/降级断言依赖其存在（低难 bush/soft ≥ 高难）；
    //   - 仅 barricade 这类硬障碍骑在路中间不自然 → 剔除。
    const isVegetationTier = (tier === 'bush' || tier === 'soft' || tier === 'tree'
      || tier === 'rock' || tier === 'stump' || tier === 'rubble' || tier === 'water');
    if (!isVegetationTier && tier !== 'full' && tier !== 'half'
        && obbHitsCover(networkRoads, ix, iy, iw, ih, (item.angle || 0) + angleJitter, 6)) {
      continue;
    }

    const coverObj = {
      x: ix,
      y: iy,
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
    for (const b of placeVillage(vrng, selectedTemplate, scale, vcx, vcy, outCovers, networkRoads)) {
      outCovers.push(b);
    }
  }

  // ---- P-40 地形标签生成（不受 cullRate 剔除；同 seed 确定性） ----
  // 注：置于村落之后——中央水潭经 rectHitsCover 避让已放置的道路条带与建筑。
  const terrainTags = selectedTemplate.terrainTags || [];
  for (const tag of terrainTags) {
    if (tag === 'centralPond') {
      const pond = placeCentralPond(rng, selectedTemplate, scale, centerX, centerY, outCovers);
      if (pond) outCovers.push(pond);
    } else if (tag === 'edgeRiver') {
      outCovers.push(placeEdgeRiver(rng, selectedTemplate, scale, centerX, centerY));
    } else if (tag === 'mudPatch') {
      for (const m of placeMudPatch(rng, selectedTemplate, scale, centerX, centerY, outCovers)) {
        outCovers.push(m);
      }
    }
  }

  // P-20：随机插入水体/桥梁组合（置于村落/林地之后，避让全部已放置元素）
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
    seed: seed,
    difficulty: diff,
    w: selectedTemplate.w * scale,   // 缩放后的节点世界尺寸（P-08：摄像机/小地图用）
    h: selectedTemplate.h * scale
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
      placeVillage,
      placeForestClusters,
      ensureLoSCorridor,
      nodeLayoutMetrics,
      pruneOverlappingCovers
    };
  }
