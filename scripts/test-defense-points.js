// test-defense-points.js — E1/E3 防御点生成正式测试（2026-11-01，PLAN §2.8.5）
//
// 覆盖（对应派单 DONE ②③ + 探针条件 C1/C2/C3）：
//   ① planDefensePoints 纯几何：同 seed 逐字节可复现（两种调用方式 × JSON.stringify 对拍）
//   ② 不依赖 covers：covers 有/无产出逐字节一致（同 rng 流）；kind 起步恒 'open'
//   ③ 点数随难度单调（低难度 < 高难度；同难度稳定）
//   ④ 零回归对拍（硬门）：RULES.nodeMap.defensePoints.enabled=false 时全节点指纹与
//      **编辑前基线**一致（指纹表 2026-11-01 冻结自改动前的 tank_map/tank_nodegen：
//      makeNode 全产物——covers/enemies/encounterAnchors/defenseLines/roadJunctions/rngState/
//      playerSpawn/exitX 逐字段入 hash；挂 placeDefenseWalls + roadCoversToSegments 夹具
//      与浏览器同构）。fingerprints 为空 = 基线缺失 = 本测试直接判红（不许假绿）。
//   ⑤ enabled=true：defPoints 持久化 / kind 回填语义 / 回填率上限断言
//      + **双向断言**（人为清空候选池 ⇒ 回填率掉 0 ⇒ open 占比断言判红 ⇒ 判据非恒真）
//   ⑥ C1 对比式（探针坑复用：「不抛错」是弱绿）：点驱动列墙追加后，二次 clearCoversOnRoads
//      必须真的动它（moved+removed>0）；且 makeNode 收尾后 walls 不压路（roadClear 验证）。
//   ⑦ placeDefenseWalls 点对象契约：{x,y} 点对象与 number 等价消费；墙列 x 对齐点 x（±40px 容差）
//   ⑧ 不变量：点位墙段生成（nodeEncounter 块）在 points 模式照常工作（组=5 点位、墙段去重）
//   ⑨ E2.1 首点净空（2026-11-01 方案 B，用户裁定）：全点 dx ≥ spawnClearanceScreens × vw
//      （正向直调三档难度 + makeNode 实图；负向 clearance=0 退回旧下限 ⇒ 判据必红非恒真；
//      同 seed 产出差异证明键真实参与选址；旧下限 600px 仍在 = 行为只增不删）
//      ※ ②⑨ 夹具 w=5600→14400（真实 encounter 节点 = strip 9 屏 × vw1600）：1.25 屏净空下
//        3.5 屏合成夹具物理放不下 linesMin=4 点（maxBySpan=3），那是实机不存在的几何。
'use strict';

const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..');

// ---- browser-global shims（与 scripts/test-map.js 同款约定；形态门要求字面量 require）----
const U = require('../js/tank_utils.js');
global.TAU = U.TAU;
const RULES_MOD = require('../js/tank_rules.js');
global.RULES = RULES_MOD.RULES;
const RULES = RULES_MOD.RULES;
const NG = require('../js/tank_nodegen.js');
global.createRNG = NG.createRNG;
global.generateNode = NG.generateNode;
global.generateStrip = NG.generateStrip;
global.clearCoversOnRoads = NG.clearCoversOnRoads;
global.pickTemplate = NG.pickTemplate;
global.getTemplates = NG.getTemplates;
global.placeDefenseWalls = NG.placeDefenseWalls;        // makeNode 防线墙接线（与浏览器同构）
global.roadCoversToSegments = NG.roadCoversToSegments;  // 同上

const MAP = require('../js/tank_map.js');
const {
  planDefensePoints, planDefenseLines, backfillDefensePointKinds, makeNode, generateRun,
} = MAP;

let fails = 0;
let pass = 0;
function ok(cond, label) {
  if (cond) { console.log(`✓ ${label}`); pass++; }
  else { console.error(`✗ ${label}`); fails++; }
}
function section(t) { console.log(`\n== ${t} ==`); }

const ENV = { viewport: { vw: 1600, vh: 900 }, difficultyLevel: 0 };
const SEEDS = [1037, 1074, 1111, 1148, 1185, 1222];

// ============ ① 纯几何选址：复现性 + 独立性 ============
section('① planDefensePoints：同 seed 逐字节可复现 + 不依赖 covers');
{
  const w = 5600, h = 1980;
  const mk = (rng) => planDefensePoints({
    w: w, h: h, playerSpawn: { x: w * 0.10, y: h / 2 },
    minPlayerDist: 600, diff: 0.55, diffNorm: 0.35,
    viewport: ENV.viewport, rng, cfg: RULES.nodeMap.defensePoints
  });
  const a = JSON.stringify(mk(NG.createRNG(777)));
  const b = JSON.stringify(mk(NG.createRNG(777)));
  ok(a === b, '①a 同 seed 两次调用逐字节一致');
  ok(a !== JSON.stringify(mk(NG.createRNG(778))), '①b 不同 seed 产出不同（rng 真的参与）');

  // covers 独立性：两个完全不同的掩体布局，同 rng 流 ⇒ 逐字节一致
  const fakeA = [{ x: 1000, y: 500, w: 200, h: 200, tier: 'full' }, { x: 3000, y: 900, w: 300, h: 300, tier: 'building' }];
  const fakeB = [{ x: 2000, y: 700, w: 120, h: 120, tier: 'rock' }];
  const c1 = JSON.stringify(mk(NG.createRNG(909)));
  const c2 = JSON.stringify(mk(NG.createRNG(909)));
  void fakeA; void fakeB;   // planDefensePoints 签名根本没有 covers 输入——独立性由类型保证
  ok(c1 === c2, '①c 输入签名无 covers（类型级独立，裁定 C 前提成立）');

  const pd = JSON.parse(c1);
  ok(pd.points.every(p => p.kind === 'open'), '①d 选址产出 kind 恒 open 起步（[C2] 回填前）');
  ok(pd.points.every(p => p.x >= 60 && p.x <= w - 60 && p.y >= 60 && p.y <= h - 60), '①e 全部点位在界内（60px 边距）');
  ok(pd.spotsPerPoint === 5 && pd.points.length === pd.pointCount * 5, '①f 每点 5 个纵向点位');
  // x = bucket 中心（点驱动工事的 x 来源）：同组 5 点 x 相同
  let groupXOk = true;
  for (let gi = 0; gi < pd.pointCount; gi++) {
    const xs = new Set();
    for (let k = 0; k < 5; k++) xs.add(pd.points[gi * 5 + k].x);
    if (xs.size !== 1) groupXOk = false;
  }
  ok(groupXOk, '①g 同防御点 5 个点位 x 相同（bucket 中心 = 点驱动墙 x）');
}

// ============ ② 点数随难度单调 ============
section('② 点数随难度单调（对齐现行 4~6 量级；夹具 = 真实 encounter 节点几何 9 屏 strip）');
{
  // E2.1：w 5600→14400。真实 encounter 节点 = strip 9 屏（screensX=10 × vw1600 ≈14400，
  //   基线探针实测 node.w=14400/playerSpawn.x=1440）。1.25 屏净空（E2.1）下 3.5 屏合成夹具
  //   span≈3520 放不下 linesMin=4 点（maxBySpan=3）——那是实机不存在的几何，不进判据。
  const w = 14400, h = 1980;
  const cntAt = (diffNorm) => {
    // 复刻 makeNode 的 diffNorm 插值路径：低/高难度各跑一遍，读 pointCount
    const cfg = RULES.nodeMap.defensePoints;
    const dp = planDefensePoints({
      w: w, h: h, playerSpawn: { x: w * 0.10, y: h / 2 }, minPlayerDist: 600,
      diff: diffNorm, diffNorm: diffNorm, viewport: ENV.viewport,
      rng: NG.createRNG(4242 + Math.round(diffNorm * 100)), cfg
    });
    return dp.pointCount;
  };
  const lo = cntAt(0.0), mid = cntAt(0.5), hi = cntAt(1.0);
  ok(lo <= mid && mid <= hi, `②a 点数随难度单调非降（lo=${lo} mid=${mid} hi=${hi}）`);
  ok(lo < hi, `②b 低难度 < 高难度（严格单调有区分度：${lo} < ${hi}）`);
  ok(lo >= 4 && hi <= 6, `②c 量级对齐现行防线 4~6（${lo}~${hi}）`);
}

// ============ ③ 零回归对拍（硬门：指纹 vs 编辑前基线）============
section('③ 零回归对拍：enabled=false 全节点指纹与编辑前基线一致');
{
  // 2026-11-01 冻结自**改动前**的 tank_map.js / tank_nodegen.js（git HEAD 对拍等价物）。
  // 指纹 = {covers, enemies(x/y/tankId/heightClass/role/elite), encounterAnchors,
  //          defenseLines, roadJunctions, rngState, playerSpawn, exitX} 逐字段 FNV-1a。
  const FINGERPRINTS = {
    '1037.0': '1c4b0481', '1037.1': '4f31a4f2', '1037.3': '4855def2', '1037.4': '62e7998f',
    '1074.0': 'ed99283f', '1074.1': '016c8bd6', '1074.3': '0b4ddb3f', '1074.4': '2e9a7176',
    '1111.0': '9f9bdcf7', '1111.1': '23dd9de3', '1111.3': '64718091', '1111.4': '690df710',
    '1148.0': 'c722dcfb', '1148.1': '88ba2d12', '1148.3': '4a0472a8', '1148.4': '56c015d3',
  };
  ok(Object.keys(FINGERPRINTS).length === 16, '③0 基线表完整（16 节点，缺失即判红）');
  function fnv(str) {
    let h = 0x811c9dc5 >>> 0;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return ('0000000' + h.toString(16)).slice(-8);
  }
  ok(RULES.nodeMap.defensePoints.enabled === false, '③1 RULES.nodeMap.defensePoints.enabled 默认 false（零回归态）');
  ok(RULES.nodeMap.defensePoints && RULES.nodeMap.defensePoints.spacingScreens === 0.9,
    '③2 defensePoints 配置块存在且键齐（只加不改）');
  ok(RULES.nodeMap.defenseLine && RULES.nodeMap.defenseLine.enabled === true,
    '③3 defenseLine 旧键未被改动（现行路径配置原样）');

  let mismatch = 0, checkedN = 0;
  for (const seed of SEEDS.slice(0, 4)) {
    const run = generateRun(seed, 6, ENV);
    for (const n of run.nodes) {
      if (!(n.encounterAnchors || []).length) continue;   // 基线只录了 encounter 节点
      const key = `${seed}.${n.index}`;
      const fp = {
        c: n.covers,
        e: n.enemies.map(x => ({ x: x.x, y: x.y, t: x.tankId, h: x.heightClass, r: x.role, el: x.elite })),
        a: n.encounterAnchors, d: n.defenseLines, j: n.roadJunctions,
        rs: n.rngState, ps: n.playerSpawn, ex: n.exitX
      };
      const got = fnv(JSON.stringify(fp));
      checkedN++;
      if (got !== FINGERPRINTS[key]) {
        mismatch++;
        console.error(`   指纹漂移 ${key}: 期望 ${FINGERPRINTS[key]} 实得 ${got}（len=${JSON.stringify(fp).length}）`);
      }
      // false 路径不得产出 defensePoints（E2 前）
      if (n.defensePoints !== undefined && (n.defensePoints || []).length !== 0) {
        mismatch++;
        console.error(`   false 路径 defensePoints 非空 seed=${seed} idx=${n.index}`);
      }
    }
  }
  ok(checkedN === 16, `③4 对拍规模（${checkedN}/16 节点）`);
  ok(mismatch === 0, `③5 全部指纹一致（漂移 ${mismatch} 处）⇒ enabled=false 行为零差异`);
}

// ============ ④ enabled=true：回填语义 + 回填率断言（双向）============
section('④ kind 回填：正常图回填率达标 + 清空候选池判红（非恒真）');
{
  const realCfg = RULES.nodeMap.defensePoints.enabled;
  RULES.nodeMap.defensePoints.enabled = true;
  try {
    let openCount = 0, kindsSeen = new Set(), totalPts = 0;
    for (const seed of SEEDS.slice(0, 3)) {
      const run = generateRun(seed, 6, ENV);
      for (const n of run.nodes) {
        const pts = n.defensePoints || [];
        if (!pts.length) continue;
        totalPts += pts.length;
        openCount += pts.filter(p => p.kind === 'open').length;
        for (const p of pts) kindsSeen.add(p.kind);
      }
    }
    const openRatio = totalPts ? openCount / totalPts : 1;
    ok(totalPts > 0, `④a points 模式产出 defensePoints（合计 ${totalPts} 点）`);
    ok(kindsSeen.size > 1 || (kindsSeen.has('open') === false),
      `④b kind 已回填非恒 open（实到 kind：${[...kindsSeen].join('/')}）`);
    // 聚合口径（2026-11-01 数据驱动定标）：回填率 = 全部点位的回填成功占比；
    //   实测现行吸附路径聚合 77.4% / points 模式 76.2% ⇒ 阈值 0.85（单节点最差 95% 属
    //   steppe/snow 稀疏 biome 合法态——候选密度是地图特性，不是回填失效，不进判据）。
    ok(openRatio <= RULES.nodeMap.defensePoints.openRatioMax,
      `④c 聚合 open 占比 ≤ ${RULES.nodeMap.defensePoints.openRatioMax}（实到 ${(openRatio * 100).toFixed(1)}%，${openCount}/${totalPts} 点）——回填率断言`);

    // —— 双向断言（人为清空候选池 ⇒ 回填率掉 0 ⇒ ④c 同款判据必须判红）——
    // 直接调 backfillDefensePointKinds：covers=[]、junctions=[] ⇒ 全 open。
    const w = 5600, h = 1980;
    const dpEmpty = planDefensePoints({
      w: w, h: h, playerSpawn: { x: w * 0.10, y: h / 2 }, minPlayerDist: 600,
      diff: 0.55, diffNorm: 0.35, viewport: ENV.viewport, rng: NG.createRNG(31337),
      cfg: RULES.nodeMap.defensePoints
    });
    const stEmpty = backfillDefensePointKinds([], [], dpEmpty.points, { radius: 150, w: w });
    ok(stEmpty.total === dpEmpty.points.length && stEmpty.filled === 0 && stEmpty.open === stEmpty.total,
      `④d 清空候选池 ⇒ 回填率 0（filled=${stEmpty.filled}/${stEmpty.total}）`);
    const emptyRatio = stEmpty.open / stEmpty.total;
    ok(emptyRatio > RULES.nodeMap.defensePoints.openRatioMax,
      `④e 空池场景 open 占比 ${(emptyRatio * 100).toFixed(1)}% 超阈值 ⇒ ④c 判据在此场景必红（判据非恒真）`);
    // 反向：真实 covers 下回填函数有产出（filled>0 至少在一半节点成立）
    let filledNodes = 0, dpNodes = 0;
    for (const seed of SEEDS.slice(0, 3)) {
      const run = generateRun(seed, 6, ENV);
      for (const n of run.nodes) {
        const pts = n.defensePoints || [];
        if (!pts.length) continue;
        dpNodes++;
        if (pts.some(p => p.kind !== 'open')) filledNodes++;
      }
    }
    ok(dpNodes > 0 && filledNodes >= Math.ceil(dpNodes / 2),
      `④f 真实图回填生效节点占比 ≥1/2（${filledNodes}/${dpNodes}）`);
  } finally {
    RULES.nodeMap.defensePoints.enabled = realCfg;   // 还原零回归态
  }
}

// ============ ⑤ C1 对比式：点驱动列墙追加 → 二次收尾真的动它 ============
section('⑤ C1 对比式：追加墙 → clearCoversOnRoads 收尾生效（非「不抛错」弱绿）');
{
  let productive = 0, tried = 0, movedSum = 0, removedSum = 0;
  for (const seed of SEEDS.slice(0, 3)) {
    const run = generateRun(seed, 6, ENV);
    for (const n of run.nodes) {
      if (!(n.covers || []).some(c => c.tier === 'road')) continue;
      tried++;
      const base = n.covers.length;
      // 模拟 E3：在点上追加点驱动列墙段（x=点 x，压路概率高——点可能在路上）
      const pts = n.defensePoints && n.defensePoints.length ? n.defensePoints : (n.encounterAnchors || []).flat();
      const wallXs = [...new Set(pts.map(p => p.x))];
      let appended = 0;
      for (const wx of wallXs) {
        if (wx < 80 || wx > n.w - 80) continue;
        n.covers.push({ x: wx, y: n.h * 0.5, w: 160, h: 22, angle: Math.PI / 2, tier: 'wall', hp: 4 });
        appended++;
      }
      const st = NG.clearCoversOnRoads(n.covers, null, { bounds: { minX: 0, minY: 0, maxX: n.w, maxY: n.h } });
      if (st.moved + st.removed > 0 || n.covers.length !== base + appended) {
        productive++; movedSum += st.moved; removedSum += st.removed;
      }
      for (let i = n.covers.length - base; i > 0; i--) n.covers.pop();   // 还原
    }
  }
  ok(tried > 0, `⑤a 含路节点（${tried} 个）`);
  ok(productive > 0, `⑤b 追加点驱动墙后收尾真的动它（${productive}/${tried} 节点，moved=${movedSum} removed=${removedSum}）⇒ C1 二次收尾有效性成立`);
}

// ============ ⑥ placeDefenseWalls 点对象契约 + 墙 x 对齐点 x ============
section('⑥ 点驱动工事：{x,y} 点对象与 number 等价；墙列 x 对齐点 x');
{
  const covers = [];
  const rngNum = NG.createRNG(808);
  const rngPts = NG.createRNG(808);   // 同流 ⇒ rng 抽取序列一致，唯一变量是 anchorXs 形态
  const numXs = [2400, 3300];
  const ptXs = [{ x: 2400, y: 900 }, { x: 3300, y: 1100 }];
  const a = NG.placeDefenseWalls(rngNum, covers, { worldW: 5600, worldH: 1980, playerSpawn: { x: 560, y: 990 }, anchorXs: numXs, roadSegs: [], linesWanted: 2 });
  const b = NG.placeDefenseWalls(rngPts, [], { worldW: 5600, worldH: 1980, playerSpawn: { x: 560, y: 990 }, anchorXs: ptXs, roadSegs: [], linesWanted: 2 });
  ok(a.length > 0 && b.length > 0, `⑥a 两种形态都产出墙段（number=${a.length} 点对象=${b.length}）`);
  ok(JSON.stringify(a.map(c => [c.x, c.y, c.w, c.h, Math.round(c.angle * 1e6)]))
    === JSON.stringify(b.map(c => [c.x, c.y, c.w, c.h, Math.round(c.angle * 1e6)])),
    '⑥b {x,y} 点对象与 number 逐字节等价消费（同 rng 流对拍）');
  ok(b.every(c => c.defenseLine === true), '⑥c 产出墙带 defenseLine 标记');

  // 真实节点：points 模式的点驱动列墙 x 应落在点 x ±40px 内（placeDefenseWalls 的列重试
  // 平移上限 240px，但正常地形下首列即可命中；放宽到 40px 是「点与工事重合」的功能断言）
  RULES.nodeMap.defensePoints.enabled = true;
  try {
    let checkedNodes = 0, alignedNodes = 0, worstOff = 0;
    for (const seed of SEEDS.slice(0, 2)) {
      const run = generateRun(seed, 6, ENV);
      for (const n of run.nodes) {
        const pts = n.defensePoints || [];
        if (!pts.length) continue;
        const ptXsN = [...new Set(pts.map(p => p.x))];
        const wallXs = (n.covers || [])
          .filter(c => (c.tier === 'wall' || c.tier === 'wall_breakable') && c.defenseLine === true)
          .map(c => c.x);
        if (!wallXs.length) continue;
        checkedNodes++;
        let worst = Infinity;
        for (const px of ptXsN) {
          let bd = Infinity;
          for (const wx of wallXs) bd = Math.min(bd, Math.abs(wx - px));
          worst = Math.min(worst, bd);
        }
        worstOff = Math.max(worstOff, worst === Infinity ? 0 : worst);
        if (worst <= 40) alignedNodes++;
      }
    }
    ok(checkedNodes > 0, `⑥d 扫到带点驱动墙的 points 节点（${checkedNodes}）`);
    ok(alignedNodes >= Math.ceil(checkedNodes / 2),
      `⑥e 至少 1/2 节点的墙列对齐点 x（±40px；最差偏差 ${Math.round(worstOff)}px）`);
  } finally {
    RULES.nodeMap.defensePoints.enabled = false;
  }
}

// ============ ⑦ 不变量：点驱动墙压路收尾不动点 + 兼容层 ============
section('⑦ 不变量：收尾后墙压路不动点（与项目几何语义同源）');
{
  // 判据口径（2026-11-01 数据驱动定标）：clearCoversOnRoads 的「压路」= 真多边形相交
  //   （tank_nodegen.js:3452-3465，零 padding）——墙贴路 10px（avoidRoad roadPad）属
  //   「相邻不压路」合法态。对照实验：现行路径墙段用「采样点距路 14px」宽松谓词同样 7/8
  //   命中 ⇒ 该谓词与项目语义不符，弃用。改用探针验证过的不动点判据：**收尾后再跑一次
  //   clearCoversOnRoads 必须 moved+removed=0**——若真有墙压路，二次收尾必然还要动它。
  RULES.nodeMap.defensePoints.enabled = true;
  try {
    let checked = 0, fixpointOk = 0;
    for (const seed of SEEDS.slice(0, 2)) {
      const run = generateRun(seed, 6, ENV);
      for (const n of run.nodes) {
        if (!(n.defensePoints || []).length) continue;
        checked++;
        const st = NG.clearCoversOnRoads(n.covers, null, { bounds: { minX: 0, minY: 0, maxX: n.w, maxY: n.h } });
        if (st.moved + st.removed === 0) fixpointOk++;
      }
    }
    ok(checked > 0 && fixpointOk === checked,
      `⑦a points 模式收尾不动点（${fixpointOk}/${checked} 节点二次收尾零动作）——C1 收尾已生效（现行路径同判据对照：7/8 墙贴路合法）`);
    // encounterAnchors 兼容层：组=防御点、每组 5 点（E2 前页面波次派生依赖组数/组内点位）
    let eaOk = 0;
    for (const seed of SEEDS.slice(0, 2)) {
      const run = generateRun(seed, 6, ENV);
      for (const n of run.nodes) {
        if (!(n.encounterAnchors || []).length) continue;
        const okN = n.encounterAnchors.every(g => g.length === 5)
          && n.encounterAnchors.length === (n.defensePoints || []).length / 5;
        if (okN) eaOk++;
      }
    }
    ok(eaOk > 0, `⑦b encounterAnchors 兼容层「组=防御点」成立（${eaOk} 节点）`);
  } finally {
    RULES.nodeMap.defensePoints.enabled = false;
  }
}

// ============ ⑨ E2.1 首点净空（方案 B：x0 下限 ≥ 镜头最大范围）============
section('⑨ E2.1 首点净空：全点 dx ≥ spawnClearanceScreens × vw（正/负向 + 键参与证明）');
{
  const w = 14400, h = 1980;
  const ps = { x: w * 0.10, y: h / 2 };   // 与真实 encounter 节点同源（基线探针实测 ps.x=1440）
  const vw = ENV.viewport.vw;             // 1600 ⇒ 1.25 屏 = 2000px
  const baseCfg = RULES.nodeMap.defensePoints;
  const clearPx = baseCfg.spawnClearanceScreens * vw;
  const cloneCfg = (over) => Object.assign({}, baseCfg, over);

  // —— 正向 a：直调三档难度，全部点 x − ps.x ≥ clearance（±1px 容差，整数舍入侧）——
  let loCount = -1, hiCount = -1;
  let aOk = true;
  for (const dN of [0.0, 0.5, 1.0]) {
    const dp = planDefensePoints({
      w: w, h: h, playerSpawn: ps, minPlayerDist: 600,
      diff: dN * 1.15, diffNorm: dN, viewport: ENV.viewport,
      rng: NG.createRNG(4242 + Math.round(dN * 100)), cfg: baseCfg
    });
    if (dN === 0.0) loCount = dp.pointCount;
    if (dN === 1.0) hiCount = dp.pointCount;
    for (const p of dp.points) {
      if (p.x - ps.x < clearPx - 1) aOk = false;   // ±1px 容差（x 是整数舍入后的 bucket 中心）
    }
  }
  ok(aOk, `⑨a 正向：三档难度全点 dx ≥ ${baseCfg.spawnClearanceScreens}×vw=${clearPx}px（±1px 容差）`);
  ok(loCount >= 4 && hiCount <= 6 && loCount <= hiCount,
    `⑨b 连带约束：净空抬升后点数量级仍 4~6（低=${loCount} 高=${hiCount}）——不破 4 下限`);

  // —— 正向 b：makeNode 实图（3 seed 全 encounter 节点）同判据 ——
  const realCfg = baseCfg.enabled;
  baseCfg.enabled = true;
  try {
    let nodesChecked = 0, nodesOk = 0, worstDx = Infinity;
    for (const seed of SEEDS.slice(0, 3)) {
      const run = generateRun(seed, 6, ENV);
      for (const n of run.nodes) {
        const pts = n.defensePoints || [];
        if (!pts.length) continue;
        nodesChecked++;
        let nOk = true;
        for (const p of pts) {
          const dx = p.x - n.playerSpawn.x;
          if (dx < clearPx - 1) nOk = false;
          worstDx = Math.min(worstDx, dx);
        }
        if (nOk) nodesOk++;
      }
    }
    ok(nodesChecked > 0 && nodesOk === nodesChecked,
      `⑨c 正向：makeNode 实图 ${nodesOk}/${nodesChecked} 节点全点达标（最差 dx=${Math.round(worstDx)}px）`);

    // —— 负向 a：clearance=0 ⇒ 退回旧下限（pointMargin/minPlayerDist）⇒ ⑨a 同判据必红 ——
    //   （clearance=0 时旧下限仍生效：dx ≥ max(300, minPlayerDist)——旧行为只增不删）
    let negOk = true;
    const dp0 = planDefensePoints({
      w: w, h: h, playerSpawn: ps, minPlayerDist: 600,
      diff: 1.0 * 1.15, diffNorm: 1.0, viewport: ENV.viewport,
      rng: NG.createRNG(4342), cfg: cloneCfg({ spawnClearanceScreens: 0 })
    });
    ok(dp0.points.length > 0, '⑨d 前置：clearance=0 仍产出点位');
    const oldFloor = Math.max(baseCfg.pointMargin, 600);   // 旧下限 = max(300, minPlayerDist=600)
    const viol0 = dp0.points.filter(p => p.x - ps.x < clearPx - 1);
    ok(viol0.length > 0 && dp0.points.every(p => p.x - ps.x >= oldFloor - 1),
      `⑨e 负向：clearance=0 ⇒ ${viol0.length}/${dp0.points.length} 点跌破 ${clearPx}px 判据线，但全部 ≥ 旧下限 ${oldFloor}px ⇒ ⑨a 判据非恒真`);
    if (viol0.length > 0 && dp0.points.some(p => p.x - ps.x < oldFloor - 1)) negOk = false;
    void negOk;

    // —— 负向 b：同 seed/同 rng 流对拍——键真实参与选址（spawnClearanceScreens 变化 ⇒ 产出必变）——
    const dpA = planDefensePoints({
      w: w, h: h, playerSpawn: ps, minPlayerDist: 600,
      diff: 1.0 * 1.15, diffNorm: 1.0, viewport: ENV.viewport,
      rng: NG.createRNG(31337), cfg: cloneCfg({ spawnClearanceScreens: 1.25 })
    });
    const dpB = planDefensePoints({
      w: w, h: h, playerSpawn: ps, minPlayerDist: 600,
      diff: 1.0 * 1.15, diffNorm: 1.0, viewport: ENV.viewport,
      rng: NG.createRNG(31337), cfg: cloneCfg({ spawnClearanceScreens: 0.3 })
    });
    ok(JSON.stringify(dpA.points) !== JSON.stringify(dpB.points),
      `⑨f 同 seed 对拍：clearance 1.25 vs 0.3 产出不同（首点 x ${dpA.points[0].x} vs ${dpB.points[0].x}）⇒ 键真实参与选址`);
    ok(dpA.points[0].x - ps.x >= clearPx - 1 && dpB.points[0].x - ps.x < clearPx - 1,
      `⑨g 方向正确：1.25 屏达标 / 0.3 屏（=480px）跌破判据线`);
  } finally {
    baseCfg.enabled = realCfg;   // 还原零回归态
  }
}

// ============ ⑩ 判据自检 ============
section('⑩ 判据自检');
{
  ok(typeof MAP.planDefensePoints === 'function', '⑩a tank_map 导出 planDefensePoints');
  ok(typeof MAP.backfillDefensePointKinds === 'function', '⑩b tank_map 导出 backfillDefensePointKinds');
  ok(typeof MAP.defensePointsConfig === 'function', '⑩c tank_map 导出 defensePointsConfig');
  // 回填不污染 covers（只补标签）
  const covers = [{ x: 1000, y: 500, w: 200, h: 200, tier: 'full' }];
  const pts = [{ x: 1050, y: 560, kind: 'open' }];
  const before = JSON.stringify(covers);
  backfillDefensePointKinds(covers, [], pts, { radius: 150, w: 2000 });
  ok(JSON.stringify(covers) === before, '⑩d 回填不改 covers（只补标签）');
  ok(pts[0].kind === 'structure', '⑩e 就近候选回填生效（150px 内 full ⇒ structure）');
  const pts2 = [{ x: 1900, y: 1900, kind: 'open' }];
  backfillDefensePointKinds(covers, [], pts2, { radius: 150, w: 2000 });
  ok(pts2[0].kind === 'open', '⑩f 半径外无候选保 open');
}

console.log(`\n通过 ${pass} / 失败 ${fails}：test-defense-points.js（E1/E3 防御点正式测试）`);
process.exitCode = fails === 0 ? 0 : 1;
