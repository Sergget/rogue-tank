// test-map.js — 线性节点链生成 / 通关奖励评分 / 节点实体化测试（Node 端，Pure Logic）
// 运行：node scripts/test-map.js
'use strict';

// ---- browser-global shims（与 test-covers.js 同款约定）----
const U = require('../js/tank_utils.js');
global.TAU = U.TAU;
const RULES_MOD = require('../js/tank_rules.js');
global.RULES = RULES_MOD.RULES;
const NG = require('../js/tank_nodegen.js');
global.createRNG = NG.createRNG;
global.generateNode = NG.generateNode;
global.pickTemplate = NG.pickTemplate;   // #24：tank_map.js 视口缩放前预选模板

const {
  difficultyForIndex,
  enemyCountForDifficulty,
  aiTierForDifficulty,
  statMultForDifficulty,
  triggerDistForDifficulty,
  nodeScaleFor,
  generateRun,
  makeNode,
  scoreNode,
  materializeNode
} = require('../js/tank_map.js');

let fails = 0;
function ok(cond, label) {
  if (cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}`); fails++; }
}

// 1) 难度曲线：单调上升、范围合法
const diffs = [0, 1, 2, 3, 4].map(i => difficultyForIndex(i, 5));
ok(diffs[0] === 0.15 && diffs[4] === 0.95, `难度曲线端点 0.15→0.95（实际 ${diffs[0]}→${diffs[4]}）`);
for (let i = 1; i < diffs.length; i++) ok(diffs[i] >= diffs[i - 1], `难度单调（${diffs[i - 1]}→${diffs[i]}）`);
for (const d of diffs) ok(d >= 0 && d <= 1, '难度在 [0,1]');

// 2) 敌军数量随难度
ok(enemyCountForDifficulty(0.15) === 1, '低难度 1 敌');
ok(enemyCountForDifficulty(0.5) === 3, '中难度 3 敌');
ok(enemyCountForDifficulty(0.95) === 4, '高难度 4 敌');
ok(enemyCountForDifficulty(2) === 5 && enemyCountForDifficulty(-1) === 1, '越界钳制');

// 2b) 三杠杆：AI 策略复杂度档位 + 数值强度乘数（P-13 / §6 条目 12）
ok(aiTierForDifficulty(0.15) === 0 && aiTierForDifficulty(0.95) === 2, 'AI 档位 0→2 随难度涨');
ok(aiTierForDifficulty(2) === 2 && aiTierForDifficulty(-1) === 0, 'AI 档位越界钳制');
ok(statMultForDifficulty(0.15) === 1.08 && statMultForDifficulty(0.95) === 1.48, `数值强度 1.0→1.5（实际 ${statMultForDifficulty(0.15)}→${statMultForDifficulty(0.95)}）`);
ok(statMultForDifficulty(2) === 1.5 && statMultForDifficulty(-1) === 1, '数值强度越界钳制');
// 三杠杆单调
for (let i = 1; i < diffs.length; i++) ok(aiTierForDifficulty(diffs[i]) >= aiTierForDifficulty(diffs[i - 1]), `AI 档位单调（${diffs[i - 1]}→${diffs[i]}）`);
for (let i = 1; i < diffs.length; i++) ok(statMultForDifficulty(diffs[i]) >= statMultForDifficulty(diffs[i - 1]), `数值强度单调`);

// 3) generateRun：节点数、确定性、节点字段合法性
const run1 = generateRun('run-seed', 5);                                            // 旧行为（无视口 → 固定 nodeScale=3）
const run2 = generateRun('run-seed', 5);
const runV = generateRun('run-seed', 5, { viewport: { vw: 1280, vh: 720 } });       // #24：视口驱动缩放
const runV2 = generateRun('run-seed', 5, { viewport: { vw: 1280, vh: 720 } });
const runW = generateRun('run-seed', 5, { viewport: { vw: 1920, vh: 1080 } });      // #24：1080p 全屏
ok(run1.nodes.length === 5, '一局 5 节点');
ok(JSON.stringify(run1.nodes.map(n => n.difficulty)) === JSON.stringify(run2.nodes.map(n => n.difficulty)), '同种子难度序列一致');
ok(JSON.stringify(run1.nodes.map(n => n.covers.length)) === JSON.stringify(run2.nodes.map(n => n.covers.length)), '同种子掩体数量一致');
ok(JSON.stringify(runV.nodes.map(n => n.covers.length)) === JSON.stringify(runV2.nodes.map(n => n.covers.length)), '视口模式同种子掩体数量一致');
ok(JSON.stringify(runV.nodes.map(n => n.w)) === JSON.stringify(runV2.nodes.map(n => n.w)), '视口模式同种子节点尺寸一致');

// 3b) #24：视口 → nodeScale 公式（nodeScale = 目标倍数 × max(vw/模板w, vh/模板h)）
function close(a, b, eps) { return Math.abs(a - b) <= (eps || 1e-6); }
const legacyScale = nodeScaleFor(null, { w: 700, h: 400 });
ok(legacyScale === 3, `无视口回退固定 nodeScale=3（实际 ${legacyScale}）`);
const s720 = nodeScaleFor({ vw: 1280, vh: 720 }, { w: 700, h: 400 });
ok(close(s720, 3 * Math.max(1280 / 700, 720 / 400)), `1280×720 → nodeScale ${s720.toFixed(4)} ≈ 3×max(vw/tw, vh/th)`);
const s1080 = nodeScaleFor({ vw: 1920, vh: 1080 }, { w: 700, h: 400 });
ok(close(s1080, 3 * Math.max(1920 / 700, 1080 / 400)), `1920×1080 → nodeScale ${s1080.toFixed(4)} ≈ 3×max(vw/tw, vh/th)`);
ok(s1080 > s720, '视口越大 nodeScale 越大');
ok(runV.nodes.every(n => n.w >= 3 * 1280 - 1e-3 && n.h >= 3 * 720 - 1e-3),
   `1280×720 视口：全部节点宽高 ≥ 视口 3 倍（3840×2160，实际 ${runV.nodes[0].w.toFixed(0)}×${runV.nodes[0].h.toFixed(0)} 起）`);
ok(runW.nodes.every(n => n.w >= 3 * 1920 - 1e-3 && n.h >= 3 * 1080 - 1e-3),
   `1920×1080 视口：全部节点宽高 ≥ 视口 3 倍（5760×3240，实际 ${runW.nodes[0].w.toFixed(0)}×${runW.nodes[0].h.toFixed(0)} 起）`);
ok(runV.nodes.every(n => n.w >= 3840 * 0.9 && n.w <= 3840 * 2.5), '视口模式节点宽度在合理区间（3~7.5 倍视口宽）');

let totalEnemies = 0, totalOutposts = 0;
for (const n of run1.nodes) {
  ok(n.w > 0 && n.h > 0, `节点 ${n.index} 世界尺寸 ${n.w}×${n.h}`);
  ok(n.w > 600 && n.h > 300, `节点 ${n.index} 为放大后的大世界（旧行为 scale=3）`);
  ok(n.covers.length > 0, `节点 ${n.index} 有掩体`);
  ok(n.playerSpawn.x > 0 && n.playerSpawn.y > 0 && n.playerSpawn.x < n.w, '玩家出生点在界内');
  for (const c of n.covers) {
    ok(c.x >= 0 && c.x <= n.w && c.y >= 0 && c.y <= n.h, `节点 ${n.index} 掩体在界内`);
  }
  ok(n.enemies.length === enemyCountForDifficulty(n.difficulty), `节点 ${n.index} 敌军数量匹配难度`);
  // P-13：三杠杆字段（AI 档位 + 数值强度）落在节点与每个敌人上
  ok(typeof n.aiTier === 'number' && n.aiTier >= 0 && n.aiTier <= 2, `节点 ${n.index} aiTier 合法`);
  ok(typeof n.statMult === 'number' && n.statMult >= 1 && n.statMult <= 1.5, `节点 ${n.index} statMult 合法`);
  ok(n.aiTier === aiTierForDifficulty(n.difficulty), `节点 ${n.index} aiTier 匹配难度`);
  ok(n.statMult === statMultForDifficulty(n.difficulty), `节点 ${n.index} statMult 匹配难度`);
  for (const e of n.enemies) {
    ok(e.x > 0 && e.x < n.w && e.y > 0 && e.y < n.h, '敌军在界内');
    ok(e.tankId && typeof e.tankId === 'string', '敌军有 tankId');
    ok(typeof e.hullAngle === 'number' && typeof e.turretAngle === 'number', '敌军朝向合法');
    ok(e.heightClass === 'heavy' || e.heightClass === 'medium', '敌军车高合法');
    ok(e.statMult === n.statMult, `节点 ${n.index} 敌军 statMult 与节点一致`);
    ok(Math.hypot(e.x - n.playerSpawn.x, e.y - n.playerSpawn.y) >= RULES_MOD.RULES.nodeMap.enemyMinPlayerDist - 1, '敌军离玩家出生点有最小间距');
  }
  if (n.outpost) {
    totalOutposts++;
    ok(n.outpost.x > 0 && n.outpost.x < n.w * 0.35 && n.outpost.y > 0 && n.outpost.y < n.h, '据点在友军侧（左 1/3）');
  }
  totalEnemies += n.enemies.length;
}
ok(totalEnemies >= 5, `全局敌军总数合理（${totalEnemies}）`);
ok(totalOutposts >= 0 && totalOutposts <= 5, `据点数量在范围内（${totalOutposts}）`);

// 3c) #24：视口模式下的敌军/据点/出生点约束仍然成立（大图不破坏布局约束）
for (const n of runV.nodes) {
  ok(n.playerSpawn.x > 0 && n.playerSpawn.x < n.w * 0.25, `视口模式节点 ${n.index} 出生点在左 1/4`);
  for (const e of n.enemies) {
    ok(e.x > n.w * 0.3 && e.x < n.w && e.y > 0 && e.y < n.h, `视口模式节点 ${n.index} 敌军散布右 2/3 区域`);
    ok(Math.hypot(e.x - n.playerSpawn.x, e.y - n.playerSpawn.y) >= RULES_MOD.RULES.nodeMap.enemyMinPlayerDist - 1, '视口模式敌军离出生点最小间距');
  }
  if (n.outpost) {
    ok(n.outpost.x > 0 && n.outpost.x < n.w * 0.35, '视口模式据点在友军侧（左 1/3）');
  }
}

// 3d) AI 触发重设计：敌军生成点必须在难度化有效触发距离之外（玩家开局不应看到脸刷兵）
for (const n of run1.nodes.concat(runV.nodes)) {
  const trig = triggerDistForDifficulty(n.difficulty);
  ok(trig >= RULES_MOD.RULES.ai.triggerDistBase && trig <= RULES_MOD.RULES.ai.triggerDistBase * RULES_MOD.RULES.ai.triggerDistDiffMultMax + 1,
     `节点 ${n.index} 触发距离在难度区间内（${trig}）`);
  for (const e of n.enemies) {
    const d = Math.hypot(e.x - n.playerSpawn.x, e.y - n.playerSpawn.y);
    ok(d >= trig * 1.05 - 1, `节点 ${n.index} 敌军生成点距玩家 ≥ 有效触发距离×1.05（d=${Math.round(d)} trig=${trig}）`);
  }
}

// 4) 各节点世界尺寸为放大后的大世界（模板按难度加权选择 → 尺寸可不同，只需都在合理区间）
ok(run1.nodes.every(n => n.w >= 1800 && n.w <= 3000 && n.h >= 1000 && n.h <= 2000), '整局节点世界尺寸均为大世界（1800~3000 × 1000~2000）');

// 5) scoreNode：§4.5 方案
const node = { index: 2, outpost: { x: 100, y: 100 } };
const r = scoreNode(node, { damageTaken: 0, clearMs: 60000, outpostAlive: true });
const base = Math.round(100 * (1 + 2 * 0.2)); // 140
ok(r.base === base, `基础分 ${base}`);
ok(r.bonuses.length === 3, '三加成全触发');
ok(r.total === base + Math.round(base * 0.5) + Math.round(base * 0.2) + Math.round(base * 0.2), '总分 = 基础 + 加成');
const r2 = scoreNode(node, { damageTaken: 50, clearMs: 999999, outpostAlive: false });
ok(r2.bonuses.length === 0 && r2.total === base, '无加成时总分 = 基础');
const r3 = scoreNode({ index: 0, outpost: null }, { damageTaken: 0 });
ok(r3.base === 100 && r3.total === 150, 'index 0 基础 100、无伤 +50、无据点不判');

// 6) materializeNode：注入 env 的调用序列与实体 id
const calls = { setCovers: 0, clearEntities: 0, spawn: [], configure: [] };
const node1 = run1.nodes[0];
const env = {
  setCovers(c) { calls.setCovers++; ok(c === node1.covers, 'setCovers 收到节点掩体'); },
  clearEntities(keep) {
    calls.clearEntities++;
    ok(Array.isArray(keep) && keep.includes('player'), 'clearEntities 保留 player');
  },
  spawnTank(spec) {
    calls.spawn.push(spec);
    return Object.assign({ hp: 100 }, spec);
  },
  configureTank(t, id) { calls.configure.push(id); }
};
const res = materializeNode(node1, env);
ok(calls.setCovers === 1 && calls.clearEntities === 1, 'setCovers/clearEntities 各一次');
ok(calls.spawn.length === node1.enemies.length + (node1.outpost ? 1 : 0), 'spawn 次数 = 敌军 + 据点');
ok(calls.configure.length === calls.spawn.length, '每个实体都 configure');
ok(calls.spawn.slice(0, node1.enemies.length).every(s => s.team === 'enemy'), '敌军 team=enemy');
if (node1.outpost) {
  const out = calls.spawn.find(s => s.id.startsWith('outpost_'));
  ok(out && out.team === 'ally', '据点 team=ally');
}
ok(res.spawned.length === calls.spawn.length, '返回 spawned 列表');
ok(res.spawned.every(t => t.nodeSpawn === true), '实体带 nodeSpawn 标记');
ok(res.spawned.filter(t => t.team === 'enemy').every(t => t.aiTriggerDist === triggerDistForDifficulty(node1.difficulty)),
   '敌军实体带难度化 aiTriggerDist 字段');
if (node1.outpost) ok(res.outpost === res.spawned[res.spawned.length - 1], '返回 outpost 引用');
else ok(res.outpost === null, '无据点节点返回 null');

// 7) makeNode 单节点（独立 rng）合法
const rng = NG.createRNG(42);
const solo = makeNode(0, 5, rng);
ok(solo.index === 0 && solo.difficulty === 0.15, 'makeNode 单节点基础字段');
ok(Array.isArray(solo.covers) && solo.covers.length > 0, 'makeNode 有掩体');
// #24：makeNode 显式注入视口 → 世界尺寸 ≥ 视口 3 倍
const rngV = NG.createRNG(42);
const soloV = makeNode(0, 5, rngV, { viewport: { vw: 1920, vh: 1080 } });
ok(soloV.w >= 3 * 1920 - 1e-3 && soloV.h >= 3 * 1080 - 1e-3,
   `makeNode 视口注入 → 5760×3240+（实际 ${soloV.w.toFixed(0)}×${soloV.h.toFixed(0)}）`);
ok(Array.isArray(soloV.covers) && soloV.covers.length > 0, 'makeNode 视口模式仍有掩体');
// #25：单节点掩体数量在加密后的合理区间（低难教学节点剔除后也 ≥ 3）
ok(soloV.covers.length >= 3, `makeNode 视口模式掩体数量合理（${soloV.covers.length}）`);

console.log('test-map: 完成所有检查');
if (fails === 0) console.log('test-map: 全部通过');
else console.error(`test-map: ${fails} 项失败`);
process.exit(fails === 0 ? 0 : 1);
