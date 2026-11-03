// test-e2-defense-point-waves.js — E2「页面波次契约切换：组 = 一个防御点」正式测试（2026-11-01，PLAN §2.8.5 B 裁定）
//
// WHY：npm run check 只证明语法，不证明「契约切对了」。本批把 tank_battle.html 的
//   波次派生 / lineXs / 落位 / 预警 / 调试传送 / 地形摘要切到双入口
//   （encDefensePointsEnabled + encAnchorGroupsForNode）：
//   · false（RULES.nodeMap.defensePoints.enabled，默认）⇒ encounterAnchors 防线分组，
//     页面行为与改前**逐字节一致**（对拍基线 2026-11-01 冻结自改前 tank_battle.html，
//     vm 原文执行、真 generateRun 节点，与浏览器同构夹具——强度同 test-p2g-wiring / test-defense-points）；
//   · true ⇒ node.defensePoints（**扁平数组**：每防御点 spotsPerPoint=5 个纵向点位共享
//     同一 x，js/tank_map.js planDefensePoints）按「x 变化切组」，波数 = 防御点数（4~6），
//     波 i 落在防御点 i（逐个拔点），lineXs = 各点 x 升序。
//
// 六组断言：
//   ① 源码契约：双入口助手存在 + 6 处消费点切换 + false 原文探针保留
//   ② false 对拍（硬门）：派生块输出 = 冻结 JSON（逐字节）；落位块 plan = 冻结 sha256
//   ③ points 模式动态：波数 = 点数（去重 x 组数）；label「第 N 防御点」；lineXs = 点 x 升序
//   ④ points 落位：波 0 落位 x 命中点 0 x − 纵深（heavy=160，容差 ±240px），且距本点
//      近于任何其他点（负向对照：锚点真被切换，不是假绿）
//   ⑤ 负向：points log 不含「道防线」/ false log 不含「防御点」（文案切换必须发生且只发生在一侧）
//   ⑥ 负向：points waveCount ≠ node.defensePoints.length（扁平数组陷阱守卫——按 length
//      取波数会把 4~6 波算成 20~30 波，本断言防回潮）
//
// 已知陷阱（本批踩过）：
//   · node.defensePoints 是扁平数组（20~30 项）不是 4~6 项——波数必须按 x 切组取组数。
//   · vm 沙箱必须先注入页面双入口助手**原文**（业务块引用它，手写复刻 = 自己抄自己）。
//   · 末尾必须把 RULES.nodeMap.defensePoints.enabled 还原 false（零回归态，不污染同批）。
//
// 用法：node scripts/test-e2-defense-point-waves.js

'use strict';

const path = require('path');
const fs = require('fs');
const vm = require('vm');
const crypto = require('crypto');
const ROOT = path.resolve(__dirname, '..');
const j = (f) => path.join(ROOT, 'js', f);

const U = require('../js/tank_utils.js');   // 字面量 require（test-qa.js 形态门：拼路径写法不识别）
global.TAU = U.TAU;
const RULES_MOD = require('../js/tank_rules.js');   // 同上（形态门）
global.RULES = RULES_MOD.RULES;
const RULES = RULES_MOD.RULES;
const NG = require(j('tank_nodegen.js'));
global.createRNG = NG.createRNG;
global.generateNode = NG.generateNode;
global.generateStrip = NG.generateStrip;
global.clearCoversOnRoads = NG.clearCoversOnRoads;
global.pickTemplate = NG.pickTemplate;
global.getTemplates = NG.getTemplates;
global.placeDefenseWalls = NG.placeDefenseWalls;
global.roadCoversToSegments = NG.roadCoversToSegments;

const MAP = require(j('tank_map.js'));
const ENC = require(j('tank_encounter.js'));
global.createEncounter = ENC.createEncounter;

const HTML = fs.readFileSync(path.join(ROOT, 'tank_battle.html'), 'utf8');

let pass = 0, fail = 0;
function ok(cond, msg, extra) {
  if (cond) { pass++; console.log(`  ✓ ${msg}`); }
  else { fail++; console.log(`  ✗ ${msg}${extra ? '  → ' + extra : ''}`); }
}
function section(t) { console.log('\n=== ' + t + ' ==='); }

// ================= 源码原文抽取（vm，非手写复刻） =================
const hStart = 'function encDefensePointsEnabled()';
const hEnd = 'function enterBattle(';
const hs = HTML.indexOf(hStart), he = HTML.indexOf(hEnd, hs);
const dStart = 'if(node.encounter === true && RULES.encounter && RULES.encounter.enabled && RULES.encounter.standardEnabled){';
const dEnd = '  bakeNodeGroundLayer(node);';
const ds = HTML.indexOf(dStart), de = HTML.indexOf(dEnd, ds);
const pStart = '  // 2026-11-01 E2（PLAN §2.8.5 B 裁定）：锚点分组按双入口取「组」';
const pEnd = '  // 分批：首批超上限的部分进队列（保留完整计划，出场时不再重算落位）';
const ps = HTML.indexOf(pStart), pe = HTML.indexOf(pEnd, ps);
section('0. 源码块定位');
ok(hs >= 0 && he > hs, '双入口助手原文定位');
ok(ds >= 0 && de > ds, '波次派生块原文定位');
ok(ps >= 0 && pe > ps, '落位块原文定位');
const helperSrc = HTML.slice(hs, he);
const deriveSrc = HTML.slice(ds, de);
const placeSrc = HTML.slice(ps, pe) + '\n;__EXPORT__(plan);';

const ENV = { viewport: { vw: 1600, vh: 900 }, difficultyLevel: 0 };
const SEEDS = [1037, 1074, 1111];

// 合成 units（导演 spawn 载荷形态：{cls,bearing,count,x,y,hullAngle}，已展开）——与基线探针一致
function mkUnits(baseX, baseY) {
  const out = [];
  for (let i = 0; i < 8; i++) {
    out.push({ cls: 'heavy', bearing: 0, count: 1, x: baseX - 400, y: baseY + i * 60, hullAngle: Math.PI });
  }
  return out;
}

// vm 沙箱执行派生块（helper 原文先行定义）
function runDerive(node) {
  const pushed = [];
  const sb = {
    RULES, node,
    pushLog: (m) => pushed.push(m),
    createEncounter: ENC.createEncounter,
    battleEncounter: null,
    Number, Math, JSON, console,
  };
  vm.createContext(sb);
  vm.runInContext(helperSrc, sb);
  vm.runInContext(deriveSrc, sb);
  return { enc: sb.battleEncounter, log: pushed };
}

// vm 沙箱执行落位块（helper 原文先行定义）
function runPlacement(node, enc, lineXCase) {
  const captured = { plan: null };
  const sb = {
    RULES,
    currentNode: node,
    units: mkUnits(enc.lineXs[0], node.h / 2),
    lineX: lineXCase === 'first' ? enc.lineXs[0] : undefined,
    waveIdx: 0,
    battleEncounter: { waveCount: enc.waveCount, waveIndex: 0 },
    battleEncReserve: [],
    battleEncAnchorIdx: 0,
    battleGarrisonBook: new Map(),
    pushLog: () => {},
    pointInCover: () => false,
    covers: [],
    player: { x: 300, y: node.h / 2 },
    garrisonAssignVanguards: ENC.garrisonAssignVanguards,
    __EXPORT__: (p) => { captured.plan = p; },
    Number, Math, Array, JSON, console,
  };
  vm.createContext(sb);
  vm.runInContext(helperSrc, sb);
  vm.runInContext(placeSrc, sb);
  return (captured.plan || []).map(p => ({
    x: p.x, y: p.y, hull: p.hull, k: p.k, cls: p.cls, garrison: p.garrison === true,
  }));
}

// ================= ① 源码契约核查 =================
section('1. 源码契约（双入口 + 消费点切换 + false 原文保留）');
ok(/function\s+encDefensePointsEnabled\s*\(/.test(HTML), '定义 encDefensePointsEnabled（零回归总门）');
ok(/function\s+encAnchorGroupsForNode\s*\(/.test(HTML), '定义 encAnchorGroupsForNode（分组唯一入口）');
const groupUse = (HTML.match(/encAnchorGroupsForNode\(/g) || []).length;
ok(groupUse >= 6, `encAnchorGroupsForNode 消费点 ${groupUse} 处（≥6：派生/落位/预警/摘要/传送/输入框）`, `实得 ${groupUse}`);
ok(/第 \$\{i \+ 1\} 防御点/.test(HTML), '波次 label points 分支 =「第 N 防御点」');
ok(/第 \$\{i \+ 1\} 道防线/.test(HTML), '波次 label false 分支原文保留（零回归）');
ok(/encounterAnchors\(\)\{\s*\n\s*return \(currentNode && Array\.isArray\(currentNode\.encounterAnchors\)\)/.test(HTML),
  '__TEST__.encounterAnchors 探针原文保留（measure-encounter 口径不漂移）');
ok(/encounterWaveGroups\(\)\{\s*\n\s*return encAnchorGroupsForNode\(currentNode\)/.test(HTML),
  '__TEST__.encounterWaveGroups 新探针就位（E2 断言消费）');

// ================= ② false 对拍（硬门：改前基线冻结值） =================
// 基线 2026-11-01 冻结自改前 tank_battle.html（tmp/probe-e2-baseline.cjs 双快照；
// derive 逐字节 + place sha256）。基线为空 = 缺失 = 判红（不许假绿，同 test-defense-points 纪律）。
const FROZEN_DERIVE = /*__FROZEN_DERIVE__*/[
  {"seed":1037,"nodeIndex":0,"difficulty":0.15,"anchorCount":4,"waveCount":4,"lineXs":[3613,6369,9144.2,11872],"log":["⚔ 波次导演接管本节点：4 波（对应 4 道防线）（难度 15%）"]},
  {"seed":1037,"nodeIndex":1,"difficulty":0.22,"anchorCount":4,"waveCount":4,"lineXs":[3633.8,6393.4,9132,11849],"log":["⚔ 波次导演接管本节点：4 波（对应 4 道防线）（难度 22%）"]},
  {"seed":1037,"nodeIndex":3,"difficulty":0.35,"anchorCount":5,"waveCount":5,"lineXs":[3427.2,5605,7789,9973,12136.8],"log":["⚔ 波次导演接管本节点：5 波（对应 5 道防线）（难度 35%）"]},
  {"seed":1037,"nodeIndex":4,"difficulty":0.42,"anchorCount":5,"waveCount":5,"lineXs":[3456.2,5653.4,7806.4,10009.2,12142.8],"log":["⚔ 波次导演接管本节点：5 波（对应 5 道防线）（难度 42%）"]},
  {"seed":1074,"nodeIndex":0,"difficulty":0.15,"anchorCount":4,"waveCount":4,"lineXs":[3617.4,6389.8,9120,11864.8],"log":["⚔ 波次导演接管本节点：4 波（对应 4 道防线）（难度 15%）"]},
  {"seed":1074,"nodeIndex":1,"difficulty":0.22,"anchorCount":4,"waveCount":4,"lineXs":[3644,6388,9132,11876],"log":["⚔ 波次导演接管本节点：4 波（对应 4 道防线）（难度 22%）"]},
  {"seed":1074,"nodeIndex":3,"difficulty":0.35,"anchorCount":5,"waveCount":5,"lineXs":[3412.4,5584,7786.4,9972,12171.2],"log":["⚔ 波次导演接管本节点：5 波（对应 5 道防线）（难度 35%）"]},
  {"seed":1074,"nodeIndex":4,"difficulty":0.42,"anchorCount":5,"waveCount":5,"lineXs":[3449,5626,7807,9992.8,12166.2],"log":["⚔ 波次导演接管本节点：5 波（对应 5 道防线）（难度 42%）"]},
  {"seed":1111,"nodeIndex":0,"difficulty":0.15,"anchorCount":4,"waveCount":4,"lineXs":[3617,6366.8,9120,11865.6],"log":["⚔ 波次导演接管本节点：4 波（对应 4 道防线）（难度 15%）"]},
  {"seed":1111,"nodeIndex":1,"difficulty":0.22,"anchorCount":4,"waveCount":4,"lineXs":[3592,6404.4,9137.6,11852.6],"log":["⚔ 波次导演接管本节点：4 波（对应 4 道防线）（难度 22%）"]},
  {"seed":1111,"nodeIndex":3,"difficulty":0.35,"anchorCount":5,"waveCount":5,"lineXs":[3421,5627.4,7787.6,9970.8,12136.4],"log":["⚔ 波次导演接管本节点：5 波（对应 5 道防线）（难度 35%）"]},
  {"seed":1111,"nodeIndex":4,"difficulty":0.42,"anchorCount":5,"waveCount":5,"lineXs":[3449,5640.6,7804,9982,12131.6],"log":["⚔ 波次导演接管本节点：5 波（对应 5 道防线）（难度 42%）"]}
];
const FROZEN_PLACE_SHA = /*__FROZEN_PLACE_SHA__*/'4b94cfcef826d8d82add3adb815eb750003370eb75f261898a0ed5d0cbc1c765';

section('2. false 零回归对拍（enabled 默认 false，页面行为 = 改前逐字节）');
ok(RULES.nodeMap.defensePoints.enabled === false, '前置：RULES.nodeMap.defensePoints.enabled 默认 false（零回归态）');
ok(FROZEN_DERIVE.length === 12 && FROZEN_PLACE_SHA.length === 64, '基线冻结值在位（12 节点派生 + 24 案例落位 sha）');
{
  const freshDerive = [];
  const freshPlace = [];
  for (const seed of SEEDS) {
    const run = MAP.generateRun(seed, 6, ENV);
    for (const node of run.nodes) {
      if (node.encounter !== true) continue;
      const { enc, log } = runDerive(node);
      freshDerive.push({
        seed, nodeIndex: node.index, difficulty: node.difficulty,
        anchorCount: (Array.isArray(node.encounterAnchors) && node.encounterAnchors.length)
          ? node.encounterAnchors.length : 0,
        waveCount: enc ? enc.waveCount : 0,
        lineXs: enc ? enc.lineXs : [],
        log,
      });
      for (const lineXCase of ['first', 'undef']) {
        freshPlace.push({ seed, nodeIndex: node.index, lineXCase, plan: runPlacement(node, enc, lineXCase) });
      }
    }
  }
  const a = JSON.stringify(freshDerive);
  const b = JSON.stringify(FROZEN_DERIVE);
  ok(a === b, `派生块对拍：同 seed 12 节点输出与改前基线逐字节一致（${a.length} 字节）`,
    a.length === b.length ? '长度同但内容异（取首个差异见 run 日志）' : `长度 ${a.length} vs 基线 ${b.length}`);
  const sha = crypto.createHash('sha256').update(JSON.stringify(freshPlace.map(p => ({
    seed: p.seed, nodeIndex: p.nodeIndex, lineXCase: p.lineXCase, plan: p.plan,
  })))).digest('hex');
  ok(sha === FROZEN_PLACE_SHA, `落位块对拍：24 案例 plan 与改前基线 sha256 一致（${sha.slice(0, 12)}…）`,
    `实得 ${sha}`);
  ok(freshDerive.every(d => !d.log.join('').includes('防御点')), 'N4 负向：false 模式日志不含「防御点」（文案只切 points 侧）');
  ok(freshPlace.every(p => p.plan.length === 8 && p.plan.every(u => Number.isFinite(u.x) && Number.isFinite(u.y))),
    'false 落位完整性：24 案例每案 8 辆、坐标全有限');
}

// ================= ③④⑤⑥ points 模式动态（enabled=true，完事还原） =================
section('3. points 模式：波数 = 防御点数（去重 x 组数），波 i 落位命中点 i');
RULES.nodeMap.defensePoints.enabled = true;
let pointsChecked = 0;
try {
  const pointWavesSeen = [];
  for (const seed of SEEDS) {
    const run = MAP.generateRun(seed, 6, ENV);
    for (const node of run.nodes) {
      const pts = Array.isArray(node.defensePoints) ? node.defensePoints : [];
      if (node.encounter !== true || !pts.length) continue;
      pointsChecked++;
      // 去重 x 组（与页面 encAnchorGroupsForNode 同口径的独立复算）
      const groups = [];
      let cur = null, curX = null;
      for (const p of pts) {
        if (cur === null || p.x !== curX) { cur = [p]; curX = p.x; groups.push(cur); }
        else cur.push(p);
      }
      const { enc, log } = runDerive(node);
      ok(enc && enc.waveCount === groups.length,
        `seed=${seed} n=${node.index}：波数 ${enc ? enc.waveCount : 'null'} = 防御点数 ${groups.length}`);
      pointWavesSeen.push(enc ? enc.waveCount : 0);
      ok(log.join('').includes(`个防御点`), `seed=${seed} n=${node.index}：播报含「个防御点」`);
      ok(!log.join('').includes('道防线'), `N2 负向：seed=${seed} n=${node.index} 播报不含「道防线」（文案切换发生）`);
      ok(enc && enc.waveCount !== pts.length,
        `N6 负向：seed=${seed} n=${node.index} 波数 ${enc ? enc.waveCount : 0} ≠ defensePoints.length ${pts.length}（扁平数组陷阱守卫）`);
      // lineXs = 各点 x 升序（点 x 为 planDefensePoints 的 Math.round 整数，精确相等）
      const wantXs = groups.map(g => g[0].x).sort((a, b) => a - b);
      ok(enc && JSON.stringify(enc.lineXs) === JSON.stringify(wantXs),
        `seed=${seed} n=${node.index}：lineXs = 点 x 升序 [${wantXs.join(',')}]`,
        `实得 [${enc ? enc.lineXs.join(',') : ''}]`);
      // 波 label：「第 N 防御点」（waves 归一化后挂在 enc.cfg.waves —— tank_encounter.js
      //   resolveEncounterConfig；enc.waves 不存在，第一版断言读错字段已订正）
      const labels = enc && enc.cfg && Array.isArray(enc.cfg.waves) ? enc.cfg.waves.map(w => w.label) : [];
      ok(labels.length === groups.length && labels.every((l, i) => l.includes(`第 ${i + 1} 防御点`)),
        `seed=${seed} n=${node.index}：波 label =「第 N 防御点」`);
      // 落位：波 0（lineX = 最小点 x）⇒ 命中点 0：|plan.x − (pointX − 160)| ≤ 240
      //   （heavy 纵深 160；压掩体推离在探针夹具关闭；240 容差涵盖 k×40 推离与钳制）
      const plan = runPlacement(node, enc, 'first');
      const px0 = wantXs[0];
      const nearOwn = plan.every(u => Math.abs(u.x - (px0 - 160)) <= 240);
      ok(nearOwn, `seed=${seed} n=${node.index}：波 0 落位 x 命中点 0（x=${px0}，纵深 160，±240）`,
        `实得 [${plan.map(u => Math.round(u.x)).join(',')}]`);
      // 负向对照：落位距点 0 近于任何其他点（锚点真被切换，不是「随便落在哪都行」）
      const others = wantXs.slice(1);
      const ownDist = Math.max(...plan.map(u => Math.abs(u.x - (px0 - 160))));
      const otherDist = others.length ? Math.min(...others.map(ox => Math.min(...plan.map(u => Math.abs(u.x - (ox - 160)))))) : Infinity;
      ok(ownDist < otherDist, `N5 负向对照：seed=${seed} n=${node.index} 落位距本点(${Math.round(ownDist)}) 近于他点(${Math.round(otherDist)})`);
    }
  }
  ok(pointsChecked >= 6, `points 模式扫到 encounter 节点 ${pointsChecked} 个（≥6）`);
  ok(Math.min(...pointWavesSeen) >= 4 && Math.max(...pointWavesSeen) <= 6,
    `波数落在防御点量级 4~6（实测 ${Math.min(...pointWavesSeen)}~${Math.max(...pointWavesSeen)}）——预算分摊口径不变（nodeBudget=max(waveCount,min(24,waveCount×6))，波均 ≤6、同屏 aliveCap=4 不变）`);
} finally {
  RULES.nodeMap.defensePoints.enabled = false;
}
ok(RULES.nodeMap.defensePoints.enabled === false, 'RULES 已还原默认 false（零回归态，不污染同批）');

console.log(`\n=== 汇总：${pass} 通过 / ${fail} 失败 ===`);
process.exit(fail === 0 ? 0 : 1);
