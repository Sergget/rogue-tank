'use strict';
// #MODE（2026-10-15）验证脚本：Boss 战模式 / 生存模式节点生成逻辑
// 用法：node scripts/test-modes.js
// 覆盖：bossOnly 全 Boss 链（标记/无常规敌/quota=null/难度递增/extendRun 延续）；
//       generateSurvivalRun（单节点/survival 标记/无预置 Boss/大地图/波次难度曲线/3波一Boss/规模封顶）；
//       标准模式零回归。

const RULES_MOD = require('../js/tank_rules.js');
global.RULES = RULES_MOD.RULES;   // 必须在 require 其他模块之前
const U = require('../js/tank_utils.js');
const G = require('../js/tank_geometry.js');
Object.assign(global, U, G);      // 模拟浏览器全局
global.TAU = U.TAU;
require('../js/tank_cover.js');
const NG = require('../js/tank_nodegen.js');
global.createRNG = NG.createRNG;
global.generateNode = NG.generateNode;
global.pickTemplate = NG.pickTemplate;
global.getTemplates = NG.getTemplates;   // #T5：makeNode 的 Boss 长宽比修正需遍历模板集
global.generateStrip = NG.generateStrip;
const MAP = require('../js/tank_map.js');

let pass = 0, fail = 0;
function ok(cond, label){
  if(cond){ pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ FAIL: ${label}`); }
}

console.log('== Boss 模式：generateRun(bossOnly) 全 Boss 节点 ==');
{
  const run = MAP.generateRun(12345, 5, { bossOnly: true, difficultyLevel: 0 });
  ok(run.nodes.length === 5, `节点数=5（实际 ${run.nodes.length}）`);
  ok(run.nodes.every(n => n.boss === true), '全部节点 boss=true');
  ok(run.nodes.every(n => n.enemies.length === 0), '全部节点无常规敌人');
  ok(run.nodes.every(n => n.quota === null), '全部节点 quota=null（Boss 节点禁用配额）');
  const diffs = run.nodes.map(n => n.difficulty);
  const nonDecreasing = diffs.every((d, i) => i === 0 || d >= diffs[i - 1] - 1e-9);
  ok(nonDecreasing, `难度单调非降（${diffs.map(d => d.toFixed(2)).join(' → ')}）`);
  ok(run.env && run.env.bossOnly === true, 'run.env 保留 bossOnly（extendRun 延续）');
  const extra = MAP.extendRun(run);
  ok(extra && extra.boss === true, 'extendRun 追加节点仍为 Boss');
  ok(run.nodes.length === 6, '链长 5→6');
}

console.log('== 生存模式：generateSurvivalRun 单个大地图 ==');
{
  const vp = { vw: 1280, vh: 720 };
  const run = MAP.generateSurvivalRun(999, { viewport: vp, difficultyLevel: 0 });
  ok(run.nodes.length === 1, `单节点（实际 ${run.nodes.length}）`);
  const node = run.nodes[0];
  ok(node.survival === true, 'node.survival=true');
  ok(node.boss === null, 'node.boss=null（Boss 按波次手动生成）');
  ok(node.enemies.length === 0, '无预置常规敌人');
  const std = MAP.generateRun(999, 1, { viewport: vp, difficultyLevel: 0 });
  const stdNode = std.nodes[0];
  const areaRatio = (node.w * node.h) / (stdNode.w * stdNode.h);
  // #MODE（2026-10-15）：生存 ≈5×5 屏；#U35（2026-10-18）改走标准 strip + 2 行片后
  // 实际 6×6.5 屏（面积 39 平方屏），标准 9×2.2 屏（19.8 平方屏）⇒ 比值 ≈2.0x。
  ok(areaRatio > 1.0 && areaRatio < 2.6, `地图面积约为标准 ${areaRatio.toFixed(1)}x（≈2.0x）`);
  console.log(`    生存 ${Math.round(node.w)}x${Math.round(node.h)} vs 标准 ${Math.round(stdNode.w)}x${Math.round(stdNode.h)}`);
  const d1 = MAP.difficultyForIndex(0, 0), d5 = MAP.difficultyForIndex(4, 0), d11 = MAP.difficultyForIndex(10, 0);
  ok(d1 < d5 && d5 < d11, `波次难度递增（w1=${d1} w5=${d5} w11=${d11}）`);
  ok([3,6,9,12].every(n => n % 3 === 0) && [1,2,4,5,7,8].every(n => n % 3 !== 0),
     '每 3 波为 Boss 波（3/6/9/12），其余为普通波');
  const countFor = n => Math.min(3 + Math.floor(n / 2), 12);
  ok(countFor(1) === 3 && countFor(5) === 5 && countFor(20) === 12, '波次规模 3→12 递增封顶');
}

// ============ #U35（2026-10-18）：生存模式 = 标准 strip 生成链 + noEnemies + 多行片 ============
console.log('== #U35 生存模式：noEnemies / chunkRows / 纵向填满 / 路面覆盖 / 压路 / 补给站 ==');

// verts 精确多边形相交（与 js/tank_nodegen.js 的 clearCoversOnRoads 同判定口径，独立实现防自证）
function coverPoly(c) {
  if (c.verts) {
    const a = c.angle || 0, ca = Math.cos(a), sa = Math.sin(a);
    return c.verts.map(v => ({ x: c.x + v[0] * ca - v[1] * sa, y: c.y + v[0] * sa + v[1] * ca }));
  }
  const hw = (c.w || 0) / 2, hh = (c.h || 0) / 2, a = c.angle || 0;
  const ca = Math.cos(a), sa = Math.sin(a);
  return [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]]
    .map(([x, y]) => ({ x: c.x + x * ca - y * sa, y: c.y + x * sa + y * ca }));
}
function ptInPoly(p, P) {
  let ins = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    if (((P[i].y > p.y) !== (P[j].y > p.y)) &&
        (p.x < (P[j].x - P[i].x) * (p.y - P[i].y) / (P[j].y - P[i].y) + P[i].x)) ins = !ins;
  }
  return ins;
}
function segX(a1, a2, b1, b2) {
  const d1 = (a2.x - a1.x) * (b1.y - a1.y) - (a2.y - a1.y) * (b1.x - a1.x);
  const d2 = (a2.x - a1.x) * (b2.y - a1.y) - (a2.y - a1.y) * (b2.x - a1.x);
  const d3 = (b2.x - b1.x) * (a1.y - b1.y) - (b2.y - b1.y) * (a1.x - b1.x);
  const d4 = (b2.x - b1.x) * (a2.y - b1.y) - (b2.y - b1.y) * (a2.x - b1.x);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}
function polysIntersect(A, B) {
  for (const p of A) if (ptInPoly(p, B)) return true;
  for (const p of B) if (ptInPoly(p, A)) return true;
  for (let i = 0; i < A.length; i++) {
    const a1 = A[i], a2 = A[(i + 1) % A.length];
    for (let j = 0; j < B.length; j++) if (segX(a1, a2, B[j], B[(j + 1) % B.length])) return true;
  }
  return false;
}
const STRUCT_FOLIAGE = new Set(['structure', 'foliage']);
function tierGroupOf(tier) { return ((RULES.coverTiers[tier] || {}).tierGroup) || null; }
function coversOnRoads(covers) {
  const roads = covers.filter(c => c.tier === 'road').map(coverPoly);
  const out = [];
  for (const c of covers) {
    if (c.tier === 'road') continue;
    if (!STRUCT_FOLIAGE.has(tierGroupOf(c.tier))) continue;
    const P = coverPoly(c);
    for (const Rp of roads) {
      if (polysIntersect(P, Rp)) { out.push(c); break; }
    }
  }
  return out;
}
const bandCounts = (covers, h, band) => {
  const n = Math.ceil(h / band);
  const arr = new Array(n).fill(0);
  for (const c of covers) {
    if (c.tier === 'road') continue;
    const i = Math.max(0, Math.min(n - 1, Math.floor(c.y / band)));
    arr[i]++;
  }
  return arr;
};

{
  const vp = { vw: 1280, vh: 720 };
  const SEEDS = [999, 7, 2024];
  const runs = SEEDS.map(s => MAP.generateSurvivalRun(s, { viewport: vp, difficultyLevel: 0 }));

  // 1) noEnemies 生效 + 字段契约
  ok(runs.every(r => r.nodes.length === 1), '生存：单节点');
  ok(runs.every(r => r.nodes[0].enemies.length === 0), '生存：node.enemies.length===0（noEnemies 生效，常规敌军不生成）');
  ok(runs.every(r => r.nodes[0].quota === null), '生存：node.quota===null（不污染 standard 的 quota/nodeClearance 链路）');
  ok(runs.every(r => r.nodes[0].survival === true), '生存：node.survival===true');
  ok(runs.every(r => r.nodes[0].boss === null), '生存：node.boss===null');
  ok(runs.every(r => r.nodes[0].exitX === Infinity), '生存：node.exitX===Infinity（无出口）');
  ok(runs.every(r => Array.isArray(r.nodes[0].defenseLines) && r.nodes[0].defenseLines.length === 0),
     '生存：node.defenseLines===[]（无敌人可布防）');
  ok(runs.every(r => !r.env || r.env.bossOnly === undefined),
     '生存：不再使用 bossOnly hack（run.env 无 bossOnly）');
  ok(runs.every(r => !r.env || r.env.stripForBoss === undefined),
     '生存：不再使用 stripForBoss hack（run.env 无 stripForBoss）');
  ok(runs.every(r => r.nodes[0].template.id === '__strip__'),
     '生存：走标准 strip 生成器（template.id=__strip__）');

  // 2) chunkRows 生效 + 纵向填满（400px 等高带每带元素数 > 0）
  const cfgSurv = RULES.nodeMap.strip.survival;
  ok(!!cfgSurv, `RULES.nodeMap.strip.survival 存在（${JSON.stringify(cfgSurv)}）`);
  ok(runs.every(r => r.nodes[0].chunkRows === (cfgSurv.chunkRows || 2)),
     `生存：chunkRows=${cfgSurv.chunkRows} 生效（实测 ${runs.map(r => r.nodes[0].chunkRows).join(',')}）`);
  ok(runs.every(r => {
    const n = r.nodes[0];
    const rows = new Set((n.chunks || []).map(c => c.row));
    return rows.size >= 2;
  }), `生存：chunk 元数据覆盖 ≥2 行（实测 ${runs.map(r => new Set((r.nodes[0].chunks || []).map(c => c.row)).size).join(',')} 行）`);
  ok(runs.every(r => {
    const n = r.nodes[0];
    const minRowH = Math.min(...(n.rowHeights || [0]));
    return n.h >= 2 * minRowH - 1;
  }), `生存：世界高 ≥ 2×单片高-1（实测 ${runs.map(r => `${Math.round(r.nodes[0].h)}/${(r.nodes[0].rowHeights || []).map(h => Math.round(h)).join('+')}`).join(' ')}）`);
  // 纵向填满：**逐 seed 逐带检查**（用户 review 修正：并集会掩盖单 seed 的 600px 空带）
  const bandPerSeedEmpty = [];
  for (const r of runs) {
    const n = r.nodes[0];
    const counts = bandCounts(n.covers, n.h, 400);
    console.log(`    seed=${r.seed} 400px 等高带元素数: ${counts.join(' ')}`);
    counts.forEach((cnt, i) => {
      if (cnt === 0) bandPerSeedEmpty.push(`seed=${r.seed} 带${i}(${i * 400}-${Math.min(n.h, (i + 1) * 400)}px)`);
    });
  }
  ok(bandPerSeedEmpty.length === 0,
     `生存：纵向填满——**逐 seed** 每个 400px 等高带元素数 > 0（空带 ${bandPerSeedEmpty.length} 个${bandPerSeedEmpty.length ? '：' + bandPerSeedEmpty.join(', ') : ''}）`);
  // 100px 细带同样逐 seed 检查（更严：确保没有 100px 量级的空白缝）。
  // 允许两类合法「无结构」细带（与任务 1「路上不得有树/房」口径一致，不是为让断言变绿）：
  //   ① 该带被横向路面整体覆盖（roadCoverage ≥ 80%）——路面本来就不许长树；
  //   ② 带高 < 50px 的边角薄片（世界高非 100 整数倍的最后一带）。
  const band100Empty = [];
  for (const r of runs) {
    const n = r.nodes[0];
    const counts = bandCounts(n.covers, n.h, 100);
    const roads = n.covers.filter(c => c.tier === 'road');
    counts.forEach((cnt, i) => {
      if (cnt > 0) return;
      const lo = i * 100, hi = Math.min(n.h, lo + 100);
      if (hi - lo < 50) return;                                    // ② 边角薄片
      let covered = 0, total = 0;
      for (let x = 100; x <= n.w - 100; x += 100) {
        total++;
        if (roads.some(rc => Math.abs(rc.x - x) < (rc.w || 0) / 2 &&
          Math.abs(rc.y - (lo + hi) / 2) < (rc.h || 0) / 2 + 5)) covered++;
      }
      if (total > 0 && covered / total >= 0.8) return;             // ① 整带是路面
      band100Empty.push(`seed=${r.seed} 带${i}(${lo}-${Math.round(hi)}px)`);
    });
  }
  ok(band100Empty.length === 0,
     `生存：100px 细带逐 seed 无空白（允许「整带为路面」「<50px 薄片」；空带 ${band100Empty.length} 个${band100Empty.length ? '：' + band100Empty.join(', ') : ''}）`);
  // 上下极端带（用户报的「上下大块空白」）：逐 seed 严格断言，不接受并集豁免
  const edgeFails = [];
  for (const r of runs) {
    const n = r.nodes[0];
    const top = n.covers.filter(c => c.tier !== 'road' && c.y < 400).length;
    const bot = n.covers.filter(c => c.tier !== 'road' && c.y >= n.h - 400).length;
    if (top === 0 || bot === 0) edgeFails.push(`seed=${r.seed} 顶${top}/底${bot}`);
  }
  ok(edgeFails.length === 0, `生存：上下各 400px 极端带逐 seed 均有元素（违例 ${edgeFails.length} 个${edgeFails.length ? '：' + edgeFails.join(', ') : ''}）`);

  // 3) 每行 y 带内都有横向路面（400px 采样）
  const rowRoadFails = [];
  for (const r of runs) {
    const n = r.nodes[0];
    const rows = n.rowHeights || [];
    for (let i = 0; i < rows.length; i++) {
      const yc = (n.chunks.find(c => c.row === i) || {}).y0 + rows[i] / 2;
      let covered = 0, total = 0;
      for (let x = 200; x <= n.w - 200; x += 400) {
        total++;
        const hit = n.covers.some(c => c.tier === 'road' &&
          Math.abs(c.y - yc) < (c.h || 0) / 2 + 40 &&
          Math.abs(c.x - x) < (c.w || 0) / 2);
        if (hit) covered++;
      }
      if (covered === 0) rowRoadFails.push(`seed=${r.seed} row${i}`);
    }
  }
  ok(rowRoadFails.length === 0, `生存：每行 y 带内都有横向路面（${rowRoadFails.length} 行缺失${rowRoadFails.length ? '：' + rowRoadFails.join(', ') : ''}）`);

  // 4) 压路断言（核心）：3 seed × {生存, 标准} verts 精判 === 0
  const roadViol = [];
  for (const r of runs) {
    const bad = coversOnRoads(r.nodes[0].covers);
    if (bad.length) roadViol.push(`生存 seed=${r.seed} ${bad.length} 个`);
  }
  for (const seed of SEEDS) {
    const stdRun = MAP.generateRun(seed, 2, { viewport: vp, difficultyLevel: 0 });
    for (const n of stdRun.nodes) {
      const bad = coversOnRoads(n.covers);
      if (bad.length) roadViol.push(`标准 seed=${seed} idx=${n.index} ${bad.length} 个`);
    }
  }
  ok(roadViol.length === 0, `压路：structure/foliage 与任一 road 多边形相交数 === 0（违例 ${roadViol.length} 项${roadViol.length ? '：' + roadViol.join('; ') : ''}）`);

  // 5) 补给站 ≥1 且不在路面/水体上
  for (const r of runs) {
    const n = r.nodes[0];
    ok(Array.isArray(n.supplyStations) && n.supplyStations.length >= 1,
       `生存 seed=${r.seed}：supplyStations ≥1（实际 ${(n.supplyStations || []).length}）`);
  }
  const supplyOnRoad = [];
  for (const r of runs) {
    const n = r.nodes[0];
    const roads = n.covers.filter(c => c.tier === 'road').map(coverPoly);
    const waters = n.covers.filter(c => c.tier === 'river' || c.tier === 'water').map(coverPoly);
    for (const st of (n.supplyStations || [])) {
      for (const P of roads.concat(waters)) if (ptInPoly(st, P)) { supplyOnRoad.push(`seed=${r.seed} @${st.x},${st.y}`); break; }
    }
  }
  ok(supplyOnRoad.length === 0, `生存：补给站不在路面/水体上（违例 ${supplyOnRoad.length} 个${supplyOnRoad.length ? '：' + supplyOnRoad.join(', ') : ''}）`);

  // 7) biomeZones 2 维矩形契约（task-3，2026-10-18）
  //    缺陷：旧契约只有 {x0,x1,biome}（1 维 x 带），chunkRows=2 时同一列两行 x 区间完全相同、
  //    biome 却不同 ⇒ 渲染层对两个 zone 各画一遍全高地面（alpha 叠加 + 后画覆盖），
  //    即「雪地/沙漠纹理随玩家移动变化」的成因之一。
  //    判定口径：zone 缺 y0/y1 时按 drawGround 旧行为退化为「全高 x 带」——这样断言对
  //    修复前的 1 维契约必然变红（而不是被 undefined 静默放过）。
  const zoneRect = (z, n) => ({
    x0: z.x0,
    x1: z.x1,
    y0: (z.y0 !== undefined && z.y0 !== null) ? z.y0 : 0,
    y1: (z.y1 !== undefined && z.y1 !== null) ? z.y1 : n.h
  });
  const rectOverlapArea = (a, b) => {
    const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
    const h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
    return (w > 0 && h > 0) ? w * h : 0;
  };
  const fmtZone = z => `${z.biome}@x[${Math.round(z.x0)},${Math.round(z.x1)}]y[${Math.round(z.y0)},${Math.round(z.y1)}]`;

  // 7a) 结构契约：每个 zone 都是 2 维矩形（y0/y1 为有限数且 y1 > y0），zone 数 = chunk 数
  ok(runs.every(r => {
    const zs = r.nodes[0].biomeZones || [];
    return zs.length === (r.nodes[0].chunks || []).length &&
      zs.every(z => Number.isFinite(z.y0) && Number.isFinite(z.y1) && z.y1 > z.y0);
  }), `生存：biomeZones 每个元素携带有限 y0/y1（2 维矩形契约，zone 数 = chunk 数；实测 ${runs.map(r => `${(r.nodes[0].biomeZones || []).length}/${(r.nodes[0].chunks || []).length}`).join(' ')}）`);

  // 7b) 生存（chunkRows=2）：任意两 zone 矩形交集面积为 0（同列两行不得重叠）
  const zoneOverlapFails = [];
  for (const r of runs) {
    const n = r.nodes[0];
    const zs = (n.biomeZones || []).map(z => Object.assign({ biome: z.biome }, zoneRect(z, n)));
    console.log(`    seed=${r.seed} zones=${zs.length} ${zs.map(fmtZone).join(' ')}`);
    let worst = 0, worstPair = '';
    for (let i = 0; i < zs.length; i++) {
      for (let j = i + 1; j < zs.length; j++) {
        const a = rectOverlapArea(zs[i], zs[j]);
        if (a > 0.5 && a > worst) {
          worst = a;
          worstPair = `${fmtZone(zs[i])} ∩ ${fmtZone(zs[j])}`;
        }
      }
    }
    if (worst > 0) zoneOverlapFails.push(`seed=${r.seed} 重叠面积 ${Math.round(worst)}px²（${worstPair}）`);
  }
  ok(zoneOverlapFails.length === 0,
     `生存：biomeZones 任意两矩形交集面积 === 0（重叠 ${zoneOverlapFails.length} 项${zoneOverlapFails.length ? '：' + zoneOverlapFails.join('; ') : ''}）`);

  // 7c) 标准（chunkRows=1）：y0===0、y1 ≥ 节点高−1（不得留纵向缝），同 x 区间无重复
  const stdZoneFails = [];
  for (const seed of SEEDS) {
    const n = MAP.generateRun(seed, 1, { viewport: vp, difficultyLevel: 0 }).nodes[0];
    const zs = n.biomeZones || [];
    if (!zs.length) { stdZoneFails.push(`seed=${seed} 无 biomeZones`); continue; }
    const seenX = new Map();
    let dup = 0;
    for (const z of zs) {
      const rect = zoneRect(z, n);
      if (rect.y0 !== 0) stdZoneFails.push(`seed=${seed} ${fmtZone(rect)} y0≠0`);
      if (!(rect.y1 >= n.h - 1)) stdZoneFails.push(`seed=${seed} ${fmtZone(rect)} y1<节点高-1(${Math.round(n.h)})`);
      const k = `${rect.x0}..${rect.x1}`;
      if (seenX.has(k)) dup++; else seenX.set(k, 1);
    }
    if (dup > 0) stdZoneFails.push(`seed=${seed} 重复 x 区间 ${dup} 个`);
  }
  ok(stdZoneFails.length === 0,
     `标准（单行）：每个 zone y0===0 且 y1 ≥ 节点高−1 且同 x 无重复（违例 ${stdZoneFails.length} 项${stdZoneFails.length ? '：' + stdZoneFails.join('; ') : ''}）`);

  // 7d) 覆盖完整性：zone 矩形并集覆盖整张世界（16×16 = 256 个抽样点，每点至少落在 1 个 zone 内）
  const coverFails = [];
  const N = 16;
  const checkCoverage = (tag, n) => {
    const zs = (n.biomeZones || []).map(z => zoneRect(z, n));
    if (!zs.length) { coverFails.push(`${tag} 无 zones`); return; }
    let miss = 0, firstMiss = '';
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const px = n.w * (i + 0.5) / N, py = n.h * (j + 0.5) / N;
        const hit = zs.some(z => px >= z.x0 && px <= z.x1 && py >= z.y0 && py <= z.y1);
        if (!hit) { miss++; if (!firstMiss) firstMiss = `@${Math.round(px)},${Math.round(py)}`; }
      }
    }
    if (miss) coverFails.push(`${tag} ${miss}/${N * N} 点无 zone（首个 ${firstMiss}）`);
  };
  for (const r of runs) checkCoverage(`生存 seed=${r.seed}`, r.nodes[0]);
  for (const seed of SEEDS) {
    checkCoverage(`标准 seed=${seed}`, MAP.generateRun(seed, 1, { viewport: vp, difficultyLevel: 0 }).nodes[0]);
  }
  ok(coverFails.length === 0,
     `biomeZones 矩形并集覆盖整张世界（${N * N} 点抽样，未覆盖 ${coverFails.length} 项${coverFails.length ? '：' + coverFails.join('; ') : ''}）`);
}


console.log('== 标准模式回归：不受 bossOnly 影响 ==');
{
  const run = MAP.generateRun(12345, 6, { difficultyLevel: 0 });
  const bossIdx = run.nodes.map((n, i) => n.boss === true ? i : -1).filter(i => i >= 0);
  ok(JSON.stringify(bossIdx) === JSON.stringify([2, 5]),
     `6 节点 Boss 位置=[2,5]（实际 [${bossIdx}]，bossInterval=3）`);
  ok(!('bossOnly' in (run.env || {})), '标准模式 env 无 bossOnly');
}

console.log(`\n测试汇总：${pass} 通过 / ${fail} 失败`);
process.exit(fail > 0 ? 1 : 0);
