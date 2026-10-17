// test-nodegen-calibration.js — 节点布局难度校准回归（基于 nodeLayoutMetrics 锁定剖面）
// 运行：node scripts/test-nodegen-calibration.js
'use strict';

const RULES_MOD = require('../js/tank_rules.js');
global.RULES = RULES_MOD.RULES;   // 必须在 require tank_geometry/cover 之前
const U = require('../js/tank_utils.js');
const G = require('../js/tank_geometry.js');
Object.assign(global, U, G);   // 模拟浏览器全局（partCorners/polyCorners/createRNG/rotate 等）
global.TAU = U.TAU;
const coverMod = require('../js/tank_cover.js');
const nodegen = require('../js/tank_nodegen.js');

let fails = 0;
function ok(cond, label) {
  if (cond) console.log('  ✓ ' + label);
  else { console.error('  ✗ ' + label); fails++; }
}

// 8-seed 实测基线（p43-measure.cjs，scale=3），作为难度曲线回归锚点。
const DIFFS = [0.1, 0.3, 0.5, 0.7, 0.9];
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const OPEN = new Set(['corridor_tutorial', 'urban_block', 'crossfire_plaza', 'mixed_barrier_plaza', 'village_center']);
const DENSE = new Set(['forest_dense', 'woodland_line']);

// BASE[templateId][diffIndex] = { cov, con, minw }
// #A11 重锚（2026-09-13，绝对出生起点口径）：路网密度收敛（分支 0.6→0.35、
// roadW 60~80、full 避让）+ village 沿路网选簇心 + pond 忽略 road 且 9x9+回退 +
// 植被不避路剔除 + 出生走廊保护（建筑/杂物/水潭避让左缘起点）+ nodeLayoutMetrics
// BFS 种子取最近自由网格后，7 模板×5 难度连通性全线 1.000（开阔≥0.85/密林≥0.35
// 地板显著富余）、coverCoverage 整体上移（道路计入覆盖剖面）。
// #A17 重锚（2026-09-14）：道路曲线化（Catmull-Rom 平滑 + 35% 分支）+ 跨相重叠消解
// （pruneOverlappingCovers：nudge 平移优先、无空位才移除）后——元素保留取代旧"移除"，
// 实际元素更多 → minPassageWidth 整体收窄（corridor 18→2.9 量级）；forest_dense
// 个别 seed 连通性 0.875（仍 ≥ 地板 0.35）。coverCoverage 剖面基本不变。
// #B7 重锚 v2（2026-09-16，路网拓扑多样化）：v1 恒为「1 横 + 0~1 纵」（每张图同一十字），
// v2 改为按种抽取 6 种拓扑（单条贯通 / 十字 / 单侧 T / 双侧 T / 错位平行 / 错位丁字对），
// 且 T 形支道锚定在干道**真实折线**上（修掉按猜测 y 锚定造成的悬空起点）。
// 影响：路网走向组合更丰富 → minPassageWidth 随机型浮动（T 形/平行型道路更少→通行更宽）；
// **全模板连通性维持 1.000**、coverCoverage 基本不变（道路不计入覆盖剖面）。
// 校验口径不变：cov ±0.02 / con ±0.05 / minw ±0.5。
// #E2/#E3 重锚（2026-09-20，路网去横平竖直 + 公路加宽 + 沿路/路口建筑与路口沙包）：
//   路宽 60~80 → 92~124（RULES.nodeMap.road）、干线弯曲 0.04→0.16 且混入斜向干道（diagChance 0.45）、
//   新增 placeRoadsideBuildings（路口邻域聚集最多 + 沿路成排）与 placeJunctionBarricades。
//   影响：7 模板 coverCoverage 整体上移约 +0.005（建筑变多）；minPassageWidth 进一步收窄
//   （路口邻域建筑与沙包把通道压到 1 格 ≈40px，仍 > 车体宽 38px；**全模板连通性维持 0.999~1.000**）。
//   校验口径不变：cov ±0.02 / con ±0.05 / minw ±0.5。
// #G 重锚（2026-09-21，用户需求 #4「更复杂的路网 + 更多建筑物体」）：
//   · 路网 v3：新增两种街区拓扑（G 网格街区 = 正交横干 + 两条贯穿纵路；I 双干贯穿 =
//     两条近平行横干 + 一条贯穿纵干），删除旧 F「斜向丁字对」（斜干 × 正交支道实测交角
//     低至 36.9°，无法满足 #B7 的 ≥60° 护栏）；T 形支道改直线（amp 0）+ 终点偏移 ±0.04；
//     平行拓扑端点/弯曲双收紧；diagAngleMax 0.52→0.34。
//   · 建筑：新增可破坏楼房 tier `building`（耐久 3 → ruined → rubble 破坏链）与 `ruined`
//     首次实际生成；路口聚集上限 3~5→3~6、沿路排布采样步 /6→/4（数量上升，但通行间隙
//     30→34 保证可用通道）。7 模板 coverCoverage 整体下移约 -0.002（可破坏建筑尺寸与
//     残破建筑剖面差异），minPassageWidth 因建筑密度上升而收窄。
//   校验口径不变：cov ±0.02 / con ±0.05 / minw ±0.5；**全模板连通性维持 0.999~1.000**。
// #I3 重锚（2026-09-21，用户裁定「继续增加建筑密度，特别是 boss 战地图」；顺带修复 #E3/#G
// 遗留缺陷：fits() 对含道路的 outCovers 用 pad 34 判重叠 → 沿路/路口建筑恒被拒绝，密度参数
// 空转）。路网 v4 拓扑与可破坏楼房 `building` 之外，本次落地：
//   · 建筑密度参数提升（clusterPerJunction 3~5→4~8、maxPerNode 18→28）；
//   · Boss 战图密度乘子（nodeMap.building.bossDensity=1.6，makeNode 对 boss 节点传入）；
//   · fits() 重叠判定修正：道路按 pad 10（不压路面）、**非道路**元素才按 pad 34 留通行间隙
//     ⇒ placeRoadsideBuildings 首次真正产出建筑（实测 8-seed 结构 87→103 @×1.6）。
// 影响：coverCoverage 整体明显上移（约 +0.015~0.021，建筑变多）；连通性维持 0.999~1.000、
// minPassageWidth 仍高于可通行下限。校验口径不变：cov ±0.02 / con ±0.05 / minw ±0.5。
// 2026-10-05 基线重标定（第二次）：#A11 从删除改为法线推出+螺旋兜底，建筑保留率回升，
//   coverCoverage/minPassageWidth 微调；连通性维持 1.000。校验口径不变。
// 2026-10-05 基线重标定（第三次）：nodeLayoutMetrics 的 isBlocked 对齐 tank_cover.js
//   游戏口径（阻挡 = passability===0 或 shellBlock；river/water 的 0.4 为减速通行，
//   不阻断）。urban_block d=0.7 连通性 0.875→1.000（旧口径把可涉水河当墙）。
// 2026-10-05 基线重标定（第四次）：strip 河流系统重构（河宽 2-3×、桥垂直、分支
//   间距≥900px、平行主干道去重、湖泊删除）影响单节点模板的 minPassage 实测。
// 2026-10-12 基线重标定（第五次，#Q 批次修复）：①村庄建筑并入 strip 路避让（hitsOccupied
//   检查 networkRoads）、prune nudge 禁止道路落点且约束界内（externalRoads 以只读障碍
//   并入 prune，self-gen 模式仅并入 outCovers 之外的引用防双份）、strip 密度补偿钳制以
//   localRoads 避路；②prune 对地形层（river/water/mud）整体豁免重叠对（地形标签必产出
//   契约 + prune 几何不解析 river.segments）。影响：minPassageWidth 微幅漂移（±0.4 格内，
//   urban_block +0.3~0.6、mixed_barrier ±0.3）；coverCoverage forest_dense 微升 +0.001~0.002
//   （河流不再被移除）；**连通性 7 模板×5 难度维持 1.000**。
//   校验口径不变：cov ±0.02 / con ±0.05 / minw ±0.5。
// 2026-10-14 基线修正（第六次，纠正第五次两处误标，非代码漂移）：urban_block d=0.7
//   8-seed 实测 0.8988（第五次标 1.5，注释预期的 "+0.3~0.6" 漂移并未兑现，实测≈第四次基线 1.0）；
//   mixed_barrier_plaza d=0.3 8-seed 实测 2.2491（第五次标 1.7；|2.2-1.7|=0.5000000000000002
//   浮点边界恰好超出口径 ±0.5）。校验口径不变。
// 2026-10-16 基线重标定（第七次，#1 地图批次）：
//   ① cde3bc3 道路改连续多边形——沿路建筑/路口沙包曾因整链 bbox 避让产出恒 0（#I3 回归，
//      已由 roadCoversToSegments() 修复，还原与旧分段 0 误差）；
//   ② 248e612 数量按面积缩放（泥斑 3~4→scale=3 时 27~36、村庄建筑 4~7→4~20）；
//   ③ 5f4758c/33d0e7d 河流连续多边形、1a1292b 多 biome 同图、15a5392 建筑去重。
//   影响：coverCoverage 整体上移（urban_block +0.02、village_center +0.025，建筑/泥斑变多）；
//   minPassageWidth 普遍收窄（泥斑 36 块后 mud↔残骸小间隙主导，如 mixed_barrier d=0.9 0.3；
//   度量口径：minPassage 仍含 road 短段还原配对，与标定口径一致）。
//   全模板连通性维持 1.000。校验口径不变：cov ±0.02 / con ±0.05 / minw ±0.5。
//
// 第十次重标定（2026-10-17 #U26 泥潭↔道路互斥）：
//   placeMudPatch 的 hitsRoad 改为足印采样（泥潭半幅 0.55×8 向 + 路多边形顶点反查），
//   且 strip 级追加 road 后新增 mud↔road SAT 收尾（压路泥潭直接移除）。泥潭离路更远 →
//   minPassageWidth 由「mud↔残骸小间隙」变为更宽通道：urban_block d=0.7 1.7→1.2、
//   mixed_barrier_plaza d=0.1 1.1→2.1 / d=0.3 1.0→1.6（其余模板/难度不变）。
//   coverCoverage / connectivity 全部不变。校验口径不变：cov ±0.02 / con ±0.05 / minw ±0.5。
// 2026-10-16 基线重标定（第八次，#T3 道路 verts 帧修复）：
//   #T3 把 _emitRoadChain 的 verts 由「调用方帧绝对坐标」统一为「相对 c.x/c.y 的局部坐标」
//   （对齐 tank_cover.js 的多边形契约）。这项修正使两处此前因坐标系错位而**恒不生效**的
//   逻辑开始真实工作：① hitsRoad（泥潭避路）此前把 c.x 加了两次、几乎永不命中，修复后
//   泥潭真正避让道路；② roadCenters/minPassage 的道路短段还原口径同步校正。
//   影响：**coverCoverage / connectivity 全部不变**（7 模板×5 难度仍为 1.000），仅
//   minPassageWidth 在含 mudPatch 的模板上收窄（泥潭真实避路后，mud↔残骸等小间隙成为
//   最小值来源）：urban_block −0.1~0.3、mixed_barrier_plaza +0.5@d=0.1 / −0.3，
//   village_center d=0.1 1.0→0.4、d=0.3 0.9→0.4、d=0.7 0.9→0.2（三处超出 ±0.5 口径）。
//   同批 #T4b 新增「nudge 不得把界内元素推出节点」约束，消除 5/2575 的越界元素。
//   校验口径不变：cov ±0.02 / con ±0.05 / minw ±0.5。
// 2026-10-17 基线重标定（第九次，#U2 泥潭收敛 + #U7 桥梁删除）：
//   #U2：泥潭数量由「按面积缩放」（strip 上 ratio 达 121× ⇒ 365~487 块）改为**按面积平方根**
//     并钳上限 MUD_MAX=32；块数多时改全节点网格铺位（用户反馈环带扎堆「密恐」）。
//   #U7：桥梁体系整体删除（路河交叉不再替换为 bridge，直接保留河段）。
//   影响：**coverCoverage / connectivity 基本不变**（7 模板×5 难度仍 1.000，cov 仅 ±0.001），
//   minPassageWidth 因泥潭数量与分布变化而上涨（泥潭稀疏后 mud↔残骸小间隙不再是唯一最小值来源）：
//   urban_block 0.3→1.0~1.7、mixed_barrier_plaza 0.4~1.2→1.0~1.9、village_center 0.2~0.4→0.6~1.5。
//   校验口径不变：cov ±0.02 / con ±0.05 / minw ±0.5。
const BASE = {
  corridor_tutorial: [{"cov":0.074,"con":1,"minw":2.1},{"cov":0.073,"con":1,"minw":2.1},{"cov":0.078,"con":1,"minw":2.3},{"cov":0.074,"con":1,"minw":2.7},{"cov":0.074,"con":1,"minw":3}],
  forest_dense: [{"cov":0.068,"con":1,"minw":0.5},{"cov":0.068,"con":1,"minw":0.5},{"cov":0.071,"con":1,"minw":0.9},{"cov":0.068,"con":1,"minw":0.9},{"cov":0.07,"con":1,"minw":0.8}],
  urban_block: [{"cov":0.093,"con":1,"minw":1.0},{"cov":0.092,"con":1,"minw":1.1},{"cov":0.096,"con":1,"minw":1.0},{"cov":0.090,"con":1,"minw":1.2},{"cov":0.089,"con":1,"minw":1.1}],
  crossfire_plaza: [{"cov":0.093,"con":1,"minw":1.2},{"cov":0.091,"con":1,"minw":1.4},{"cov":0.089,"con":1,"minw":1.2},{"cov":0.088,"con":1,"minw":2},{"cov":0.088,"con":1,"minw":1.9}],
  mixed_barrier_plaza: [{"cov":0.060,"con":1,"minw":2.1},{"cov":0.057,"con":1,"minw":1.6},{"cov":0.060,"con":1,"minw":1.9},{"cov":0.055,"con":1,"minw":1.6},{"cov":0.055,"con":1,"minw":1.4}],
  village_center: [{"cov":0.097,"con":1,"minw":0.6},{"cov":0.095,"con":1,"minw":0.8},{"cov":0.094,"con":1,"minw":1.5},{"cov":0.094,"con":1,"minw":1.2},{"cov":0.092,"con":1,"minw":1.1}],
  woodland_line: [{"cov":0.046,"con":1,"minw":1.6},{"cov":0.044,"con":1,"minw":1.6},{"cov":0.047,"con":1,"minw":1.3},{"cov":0.045,"con":1,"minw":1.7},{"cov":0.046,"con":1,"minw":1.6}],
};
const TOL = { cov: 0.02, con: 0.05, minw: 0.5 };

const opts2 = { step: 40, margin: 40, losSamples: 40, hasLineOfSight: coverMod.hasLineOfSight };

// 校准度量坐标系说明（重要）：
//   generateNode(d, {centerX:600, centerY:350}) 输出 covers 以 (600,350) 为世界中心、
//   尺寸 w×h（节点坐标覆盖 [600-w/2, 600+w/2]×[350-h/2, 350+h/2]）。
//   玩家出生点 = 世界左缘 10% 与垂直中点 —— 绝对（生成）坐标：
//     spawn = (600 - w/2 + 0.10*w, 350) = (600 - 0.4*w, 350)
//   （nodeLayoutMetrics 默认 startPoint=(0.1w, h/2) 是 [0,w] 原点假设，与
//   centerX=600 的 covers 错位 —— 必须显式传入真实出生绝对坐标。）
function spawnPoint(raw) {
  return { x: 600 - raw.w * 0.4, y: 350 };
}

const templates = nodegen.getTemplates().filter(t => BASE[t.id]);
for (const t of templates) {
  const grp = OPEN.has(t.id) ? 'OPEN' : (DENSE.has(t.id) ? 'DENSE' : 'OPEN');
  const covSeries = [];
  for (let di = 0; di < DIFFS.length; di++) {
    const d = DIFFS[di];
    let cov = 0, con = 0, minw = 0, n = 0;
    for (const s of SEEDS) {
      const a = nodegen.generateNode(d, { seed: s, templateId: t.id, scale: 3, centerX: 600, centerY: 350 });
      const m = nodegen.nodeLayoutMetrics(a, Object.assign({ startPoint: spawnPoint(a) }, opts2));
      cov += m.coverCoverage; con += m.connectivityRatio; minw += m.minPassageWidth; n++;
    }
    cov /= n; con /= n; minw /= n; covSeries.push(cov);
    const b = BASE[t.id][di];
    const covOk = Math.abs(cov - b.cov) <= TOL.cov;
    const conOk = Math.abs(con - b.con) <= TOL.con;
    const minwOk = Math.abs(minw - b.minw) <= TOL.minw;
    ok(covOk, `${t.id} d=${d} coverCoverage=${cov.toFixed(3)} (≈基线 ${b.cov})`);
    ok(conOk, `${t.id} d=${d} connectivity=${con.toFixed(3)} (≈基线 ${b.con})`);
    ok(minwOk, `${t.id} d=${d} minPassage=${minw.toFixed(1)} (≈基线 ${b.minw})`);
    // 连通性地板（设计意图）
    if (grp === 'OPEN') ok(con >= 0.85, `${t.id} d=${d} 开阔模板连通性地板≥0.85 (=${con.toFixed(3)})`);
    else ok(con >= 0.35, `${t.id} d=${d} 密林模板连通性地板≥0.35（自然分区，真实对局由 findPlayerSpawn+ensureLoSCorridor 兜底）(=${con.toFixed(3)})`);
  }
  // 开阔模板：coverCoverage 整体随难度非降（首→尾）
  if (grp === 'OPEN') {
    ok(covSeries[4] >= covSeries[0] - 0.01, `${t.id} coverCoverage 随难度非降 ${covSeries[0].toFixed(3)}→${covSeries[4].toFixed(3)}`);
  }
}

if (fails > 0) { console.error(`\n✗ ${fails} 个校准断言失败`); process.exit(1); }
else { console.log('\n✓ 节点布局难度校准回归全部通过（5 模板×5 难度×8 seed 锚定）'); process.exit(0); }
