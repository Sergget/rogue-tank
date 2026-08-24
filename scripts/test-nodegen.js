// test-nodegen.js — 节点地图元素生成器测试（Node 端，Pure Logic）
// 验证确定性 / 难度权重 / 覆盖范围合法性 / 性能基准
// 运行：node scripts/test-nodegen.js
'use strict';

const U = require('../js/tank_utils.js');
global.TAU = U.TAU;
const RULES_MOD = require('../js/tank_rules.js');
global.RULES = RULES_MOD.RULES;
const path = require('path');
const { createRNG, registerTemplate, generateNode, getTemplates, NODE_TEMPLATES } = require('../js/tank_nodegen.js');

let fails = 0;
function ok(cond, label) {
  if (cond) console.log('  ✓ ' + label);
  else { console.error('  ✗ ' + label); fails++; }
}

// 1) 确定性：相同种子生成相同覆盖
const seed = 12345;
const result1 = generateNode(0.5, { seed });
const result2 = generateNode(0.5, { seed });
function eqCover(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
ok(result1.covers.length === result2.covers.length, '种子确定性覆盖数量一致');
for (let i = 0; i < result1.covers.length; i++) {
  ok(eqCover(result1.covers[i], result2.covers[i]), `种子 ${i} 覆盖一致`);
}

// 2) 难度权重：同一模板同一种子下，低难 bush/soft 保留 ≥ 高难（高难把 bush/soft
//    升级为 barricade 且低难把 barricade 降级为 soft；cullRate=0 屏蔽剔除干扰，
//    保证逐元素确定性可比）
for (const tpl of getTemplates()) {
  const low = generateNode(0.1, { templateId: tpl.id, seed: 7, cullRate: 0 });
  const high = generateNode(0.9, { templateId: tpl.id, seed: 7, cullRate: 0 });
  const count = (arr, pred) => arr.filter(pred).length;
  const lowBushSoft = count(low.covers, c => c.tier === 'bush' || c.tier === 'soft');
  const highBushSoft = count(high.covers, c => c.tier === 'bush' || c.tier === 'soft');
  const lowHard = count(low.covers, c => c.tier === 'half' || c.tier === 'full' || c.tier === 'barricade');
  const highHard = count(high.covers, c => c.tier === 'half' || c.tier === 'full' || c.tier === 'barricade');
  ok(lowBushSoft >= highBushSoft,
     `模板 ${tpl.id} 低难 bush/soft(${lowBushSoft}) ≥ 高难(${highBushSoft})`);
  ok(highHard >= lowHard,
     `模板 ${tpl.id} 高难 half/full/barricade(${highHard}) ≥ 低难(${lowHard})`);
}

// 3) 覆盖范围合法性：坐标 / 尺寸 / tier 存在于 RULES.coverTiers
const RULES = require('../js/tank_rules.js').RULES;
const coverTiers = RULES.coverTiers;
for (const c of result1.covers) {
  ok(typeof c.x === 'number' && typeof c.y === 'number', '坐标数字');
  ok(c.w > 0 && c.h > 0, '尺寸正数');
  ok(c.tier in coverTiers, `tier ${c.tier} 在 RULES.coverTiers 中`);
  if (c.verts) ok(Array.isArray(c.verts) && c.verts.length >= 3, 'verts 合法');
  if (c.collisionVerts) ok(Array.isArray(c.collisionVerts) && c.collisionVerts.length > 0, 'collisionVerts 合法');
}

// 4) 性能基准与密度下界（#25：模板 12~25 元素，中高难剔除后保留下界 ≥ 8）
const templates = getTemplates();
ok(templates.length >= 7, `内置模板数量 ≥ 7（实际 ${templates.length}）`);
for (const tpl of NODE_TEMPLATES) {
  // #77 密度提升后上限放宽：单模板最多 ~34 元素（原 #25 上限 25）
  ok(tpl.items.length >= 12 && tpl.items.length <= 34,
     `模板 ${tpl.id} items ${tpl.items.length} 在 12~34 区间`);
  ok(Array.isArray(tpl.tags) && tpl.tags.length > 0, `模板 ${tpl.id} 有 tags`);
  const tiers = new Set(tpl.items.map(it => it.tier));
  ok(tiers.size >= 4, `模板 ${tpl.id} 混合 ≥4 种 tier（${[...tiers].join('/')}）`);
}
for (const tpl of templates) {
  const maxItems = 42; // #77：密度提升后单模板元素上限放宽到 42
  const minItems = 8;  // #25：中高难剔除率低（≤0.044），保留数下界
  const lowDiff = generateNode(0.1, { templateId: tpl.id, seed: 1 });
  ok(lowDiff.covers.length >= 1 && lowDiff.covers.length <= maxItems,
     `模板 ${tpl.id} 低难覆盖数量 ${lowDiff.covers.length} 合理（≤30）`);
  const highDiff = generateNode(0.9, { templateId: tpl.id, seed: 1 });
  ok(highDiff.covers.length >= minItems,
     `模板 ${tpl.id} 高难覆盖数量 ${highDiff.covers.length} ≥ ${minItems}`);
}

// 5) 预损毁状态过渡：tree→stump/fallen, barricade→rubble
for (const c of result1.covers) {
  if (c.tier === 'stump' || c.tier === 'fallen' || c.tier === 'rubble') ok(true, `预损毁覆盖出现 tier=${c.tier}`);
}

// 6) 生成到真实 covers 的集成（仅浏览端，避免 Node 端副作用）
if (typeof covers !== 'undefined') {
  const oldLen = covers.length;
  generateNode(0.5, { seed: 999, applyToCovers: true });
  ok(covers.length > oldLen, 'applyToCovers 写入 covers');
  covers.length = oldLen; // 恢复初始状态
}

// ================= P-40 地形标签生成（terrainTags） =================
// 7) 确定性与数量/位置约束：pond 中央区、river 沿边、mud 环带；不受 cullRate 影响
{
  const TPL_WITH = ['forest_dense', 'urban_block', 'crossfire_plaza', 'mixed_barrier_plaza', 'village_center', 'woodland_line'];
  for (const tpl of NODE_TEMPLATES) {
    const tags = tpl.terrainTags || [];
    // 确定性：同 seed 同 cullRate 下地形完全一致
    for (const seed of [11, 42, 777]) {
      const a = generateNode(0.6, { templateId: tpl.id, seed, cullRate: 0 });
      const b = generateNode(0.6, { templateId: tpl.id, seed, cullRate: 0 });
      const terr = r => r.covers.filter(c => c.tier === 'water' || c.tier === 'river' || c.tier === 'mud');
      ok(JSON.stringify(terr(a)) === JSON.stringify(terr(b)),
        `模板 ${tpl.id} seed=${seed} 地形生成确定性一致`);
      ok(terr(a).length >= tags.reduce((n, t) => n + (t === 'mudPatch' ? 3 : t ? 1 : 0), 0),
        `模板 ${tpl.id} seed=${seed} 地形数量与标签匹配 (${terr(a).length})`);
      // 不受剔除影响：即使高剔除率，地形元素仍然产出（形状可随 rng 流位差变化，
      // 但数量始终满足标签下界——地形不进入剔除循环）
      const hi = generateNode(0.6, { templateId: tpl.id, seed, cullRate: 0.5 });
      ok(terr(hi).length >= tags.reduce((n, t) => n + (t === 'mudPatch' ? 3 : t ? 1 : 0), 0),
        `模板 ${tpl.id} seed=${seed} 地形不被 cullRate 剔除`);
    }
    // 无地形标签模板不产出地形
    if (tags.length === 0) {
      const r = generateNode(0.6, { templateId: tpl.id, seed: 5, cullRate: 0 });
      ok(!r.covers.some(c => c.tier === 'water' || c.tier === 'river' || c.tier === 'mud'),
        `模板 ${tpl.id} 无地形标签 → 不生成地形`);
    }
    // 有标签模板逐项校验位置约束
    const r = generateNode(0.6, { templateId: tpl.id, seed: 42, cullRate: 0 });
    const W = r.w, H = r.h;
    for (const c of r.covers) {
      const lx = c.x - 600, ly = c.y - 350; // 节点局部坐标（默认 centerX/centerY=600/350）
      if (c.tier === 'water') {
        ok(Math.abs(lx) < W * 0.25 && Math.abs(ly) < H * 0.25, `${tpl.id} 水潭在中央区`);
        ok(Array.isArray(c.verts) && c.verts.length === 8, `${tpl.id} 水潭八边形 verts`);
      }
      if (c.tier === 'river' && Array.isArray(c.segments)) {
        ok(c.segments.length >= 4, `${tpl.id} 河流 ≥4 连通段`);
        // 全部段落在边缘带（距对应边 ≤ 20% 边长）
        const nearEdge = c.segments.every(s => {
          const ax = Math.abs(lx + s.dx), ay = Math.abs(ly + s.dy);
          return ax > W / 2 - W * 0.18 || ay > H / 2 - H * 0.18;
        });
        ok(nearEdge, `${tpl.id} 河流沿边分布`);
        ok(!!c.groupId, `${tpl.id} 河流携带 groupId`);
      }
      if (c.tier === 'mud') {
        ok(typeof c.x === 'number' && c.w > 0, `${tpl.id} 泥斑实例合法`);
      }
    }
    if ((tpl.terrainTags || []).includes('mudPatch')) {
      const muds = r.covers.filter(c => c.tier === 'mud');
      ok(muds.length >= 3 && muds.length <= 4, `${tpl.id} 泥斑 3~4 块 (got ${muds.length})`);
      // 环带：围绕中心分布（半径在 15%~35% 节点尺寸）
      const ringOk = muds.every(m => {
        const d = Math.hypot(m.x - 600, m.y - 350);
        return d > Math.min(W, H) * 0.12 && d < Math.min(W, H) * 0.40;
      });
      ok(ringOk || muds.length === 0, `${tpl.id} 泥斑呈环带分布`);
    }
  }
}

// ================= #77 调参 + P-36/#81 biome 地面（批次⑤） =================
// 8) biome 标签存在且确定；generateRun 透传到 run.nodes[i].biome
{
  const biomes = Object.keys(RULES.biomes);
  for (const tpl of NODE_TEMPLATES) {
    ok(biomes.indexOf(tpl.biome) >= 0, `模板 ${tpl.id} biome=${tpl.biome} 在 RULES.biomes 中`);
    const a = generateNode(0.5, { templateId: tpl.id, seed: 9 });
    const b = generateNode(0.5, { templateId: tpl.id, seed: 9 });
    ok(a.biome === tpl.biome && b.biome === a.biome, `模板 ${tpl.id} biome 确定且随结果透传`);
  }
  const { generateRun } = require('../js/tank_map.js');
  // tank_map.js 依赖浏览器全局 createRNG/generateNode（Node 端注入）
  global.createRNG = createRNG;
  global.generateNode = generateNode;
  const run = generateRun(4242, 4);
  ok(run.nodes.every(n => n.biome && biomes.indexOf(n.biome) >= 0), 'generateRun 每节点携带合法 biome');
}

// 9) 全高分布再平衡：三补模板全高下限 + 低难降级帽（残留 ≥70%）+ cull 保护
{
  const fullMinByTpl = { corridor_tutorial: 2, forest_dense: 3, woodland_line: 2 };
  for (const tpl of NODE_TEMPLATES) {
    const tplFulls = tpl.items.filter(it => it.tier === 'full').length;
    if (fullMinByTpl[tpl.id]) {
      ok(tplFulls >= fullMinByTpl[tpl.id],
        `模板 ${tpl.id} 全高数 ${tplFulls} ≥ ${fullMinByTpl[tpl.id]}（#77 补配）`);
    }
    if (tplFulls === 0) continue;
    // 低难度降级帽：diff=0.1、cullRate=0 时 full 残留 ≥70%
    const low = generateNode(0.1, { templateId: tpl.id, seed: 31, cullRate: 0 });
    const lowFulls = low.covers.filter(c => c.tier === 'full').length;
    ok(lowFulls >= Math.ceil(tplFulls * 0.7),
      `模板 ${tpl.id} 低难 full 残留 ${lowFulls}/${tplFulls} ≥70%（降级帽）`);
    // cull 保护：极端剔除率下仍保留至少 min(2, 全高数) 个 full
    const culled = generateNode(0.6, { templateId: tpl.id, seed: 32, cullRate: 0.9 });
    const culledFulls = culled.covers.filter(c => c.tier === 'full').length;
    ok(culledFulls >= Math.min(2, tplFulls),
      `模板 ${tpl.id} cull 保护：高剔除率下 full 残留 ${culledFulls} ≥ ${Math.min(2, tplFulls)}`);
  }
}

// 10) 尺寸收敛抽断言（默认 nodeScale=3 世界尺寸）：half 100~150 / full 150~220 / barricade 60~90
{
  const inRange = (v, lo, hi) => v >= lo - 1e-6 && v <= hi + 1e-6;
  for (const tpl of NODE_TEMPLATES) {
    // 默认 nodeScale=3（RULES.nodeMap.nodeScale）下的世界尺寸口径
    const r = generateNode(0.5, { templateId: tpl.id, seed: 77, cullRate: 0, scale: 3 });
    for (const spec of [['half', 100, 150], ['full', 150, 220], ['barricade', 60, 90]]) {
      const tier = spec[0], lo = spec[1], hi = spec[2];
      const ws = r.covers.filter(c => c.tier === tier).map(c => c.w);
      if (!ws.length) continue; // 该模板无此 tier 则跳过（如 forest_dense 原无沙袋）
      ok(ws.every(w => inRange(w, lo, hi)),
        `模板 ${tpl.id} ${tier} 世界宽 ${ws.map(v => Math.round(v)).join(',')} 在 ${lo}~${hi}`);
    }
  }
}

// 11) 密度下限：掩体总元素数 ≥ 旧值(120)×1.4
{
  const totalItems = NODE_TEMPLATES.reduce((n, t) => n + t.items.length, 0);
  ok(totalItems >= 168, `七模板掩体总数 ${totalItems} ≥ 168（旧 120×1.4，#77 密度提升）`);
}

// 12) drawGround 冒烟（纯 ctx mock，无 DOM）：不同 seed 不报错、颜色来自 RULES.biomes
{
  const bd = require('../js/tank_battledraw.js');
  const METHODS = ['save','restore','fillRect','beginPath','rect','clip','ellipse','fill'];
  const makeMock = (log) => new Proxy({}, {
    get(t, prop) {
      return (typeof prop === 'string' && METHODS.indexOf(prop) >= 0)
        ? function(){ log.push(prop); } : t[prop];
    },
    set(t, prop, v) { log.push(String(prop) + '=' + String(v)); return true; }
  });
  const vb = { minX: 0, minY: 0, maxX: 800, maxY: 600 };
  let threw = false;
  try {
    bd.drawGround(makeMock([]), { viewBounds: vb, biome: 'concrete', seed: 1 });
    bd.drawGround(makeMock([]), { viewBounds: vb, biome: 'meadow', seed: 2 });
    bd.drawGround(makeMock([]), { viewBounds: vb, biome: 'unknown_biome', seed: 'abc' });
    bd.drawGround(makeMock([]), { viewBounds: null }); // 非法 bounds 应安全返回
  } catch (e) { threw = true; console.error(e); }
  ok(!threw, 'drawGround 不同 seed/biome/非法入参不报错');
  const log1 = [], seq = () => { const l = []; bd.drawGround(makeMock(l), { viewBounds: vb, biome: 'steppe', seed: 555 }); return l.join('|'); };
  ok(log1.length === 0 && seq() === seq(), 'drawGround 同 seed 输出序列确定一致');
  ok(/#/.test(seq()), 'drawGround 颜色值来自 RULES.biomes 十六进制调色板');
}

console.log('test-nodegen: 完成所有检查');
if (fails === 0) console.log('test-nodegen: 全部通过');
else console.error(`test-nodegen: ${fails} 项失败`);
process.exit(fails === 0 ? 0 : 1);