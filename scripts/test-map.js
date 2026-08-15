// test-map.js — 线性节点链生成 / 通关奖励评分 / 节点实体化测试（Node 端，Pure Logic）
// 运行：node scripts/test-map.js
'use strict';

// ---- browser-global shims（与 test-covers.js 同款约定）----
const RULES_MOD = require('../js/tank_rules.js');
global.RULES = RULES_MOD.RULES;
const NG = require('../js/tank_nodegen.js');
global.createRNG = NG.createRNG;
global.generateNode = NG.generateNode;

const {
  difficultyForIndex,
  enemyCountForDifficulty,
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

// 3) generateRun：节点数、确定性、节点字段合法性
const run1 = generateRun('run-seed', 5);
const run2 = generateRun('run-seed', 5);
ok(run1.nodes.length === 5, '一局 5 节点');
ok(JSON.stringify(run1.nodes.map(n => n.difficulty)) === JSON.stringify(run2.nodes.map(n => n.difficulty)), '同种子难度序列一致');
ok(JSON.stringify(run1.nodes.map(n => n.covers.length)) === JSON.stringify(run2.nodes.map(n => n.covers.length)), '同种子掩体数量一致');

let totalEnemies = 0, totalOutposts = 0;
for (const n of run1.nodes) {
  ok(n.w > 0 && n.h > 0, `节点 ${n.index} 世界尺寸 ${n.w}×${n.h}`);
  ok(n.w > 600 && n.h > 300, `节点 ${n.index} 为放大后的大世界（scale=3）`);
  ok(n.covers.length > 0, `节点 ${n.index} 有掩体`);
  ok(n.playerSpawn.x > 0 && n.playerSpawn.y > 0 && n.playerSpawn.x < n.w, '玩家出生点在界内');
  for (const c of n.covers) {
    ok(c.x >= 0 && c.x <= n.w && c.y >= 0 && c.y <= n.h, `节点 ${n.index} 掩体在界内`);
  }
  ok(n.enemies.length === enemyCountForDifficulty(n.difficulty), `节点 ${n.index} 敌军数量匹配难度`);
  for (const e of n.enemies) {
    ok(e.x > 0 && e.x < n.w && e.y > 0 && e.y < n.h, '敌军在界内');
    ok(e.tankId && typeof e.tankId === 'string', '敌军有 tankId');
    ok(typeof e.hullAngle === 'number' && typeof e.turretAngle === 'number', '敌军朝向合法');
    ok(e.heightClass === 'heavy' || e.heightClass === 'medium', '敌军车高合法');
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
if (node1.outpost) ok(res.outpost === res.spawned[res.spawned.length - 1], '返回 outpost 引用');
else ok(res.outpost === null, '无据点节点返回 null');

// 7) makeNode 单节点（独立 rng）合法
const rng = NG.createRNG(42);
const solo = makeNode(0, 5, rng);
ok(solo.index === 0 && solo.difficulty === 0.15, 'makeNode 单节点基础字段');
ok(Array.isArray(solo.covers) && solo.covers.length > 0, 'makeNode 有掩体');

console.log('test-map: 完成所有检查');
if (fails === 0) console.log('test-map: 全部通过');
else console.error(`test-map: ${fails} 项失败`);
process.exit(fails === 0 ? 0 : 1);
