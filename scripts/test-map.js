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
  isBossNodeIndex,
  enemyCountForDifficulty,
  aiTierForDifficulty,
  statMultForDifficulty,
  entityMultsForDifficulty,
  triggerDistForDifficulty,
  nodeScaleFor,
  generateRun,
  extendRun,
  makeNode,
  scoreNode,
  materializeNode
} = require('../js/tank_map.js');

let fails = 0;
function ok(cond, label) {
  if (cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}`); fails++; }
}

// 1) 难度曲线（P-34 开放式链参数化）：索引驱动饱和曲线，端点/封顶/单调/钳制
const diffs = [0, 1, 2, 3, 4, 6, 8, 12, 14].map(i => difficultyForIndex(i));
ok(diffs[0] === 0.15, `首节点难度 0.15（实际 ${diffs[0]}）`);
ok(difficultyForIndex(12) === 0.95, `饱和索引 12 处封顶 0.95（实际 ${difficultyForIndex(12)}）`);
ok(difficultyForIndex(40) === 0.95, '超饱和后仍封顶 0.95（开放式链不随长度失控）');
ok(difficultyForIndex(-3) === 0.15, '负索引钳制到首节点难度');
for (let i = 1; i < diffs.length; i++) ok(diffs[i] >= diffs[i - 1], `难度单调（${diffs[i - 1]}→${diffs[i]}）`);
for (const d of diffs) ok(d >= 0 && d <= 1, '难度在 [0,1]');
// 跨局难度等级叠加：effDiff = min(1.15, base + level×0.04)
ok(closeNum(difficultyForIndex(0, 1), 0.19), `Lv.1 首节点 0.15+0.04=0.19（实际 ${difficultyForIndex(0, 1)}）`);
ok(difficultyForIndex(0, 5) === 0.35, `Lv.5 首节点 0.15+0.20=0.35（实际 ${difficultyForIndex(0, 5)}）`);
ok(difficultyForIndex(12, 10) === 1.15, `Lv.10 高索引触绝对上限 1.15（实际 ${difficultyForIndex(12, 10)}）`);
ok(difficultyForIndex(0) === difficultyForIndex(0, 0), 'level 0 等价缺省');
function closeNum(a, b) { return Math.abs(a - b) < 1e-9; }

// 2) 敌军数量随难度
ok(enemyCountForDifficulty(0.15) === 1, '低难度 1 敌');
ok(enemyCountForDifficulty(0.5) === 3, '中难度 3 敌');
ok(enemyCountForDifficulty(0.95) === 4, '高难度 4 敌');
ok(enemyCountForDifficulty(2) === 5 && enemyCountForDifficulty(-1) === 1, '越界钳制');

// 2b) 三杠杆：AI 策略复杂度档位 + 数值强度乘数（P-13 / §6 条目 12；#76 A 表驱动改造）
ok(aiTierForDifficulty(0.15) === 0 && aiTierForDifficulty(0.95) === 2, 'AI 档位 0→2 随难度涨');
ok(aiTierForDifficulty(2) === 2 && aiTierForDifficulty(-1) === 0, 'AI 档位越界钳制');
// #76 A：entityMults 表驱动插值（[diff=0, diff=diffMax]，按 diffNorm 线性）
const EM = entityMultsForDifficulty;
const dMax = RULES_MOD.RULES.difficulty.diffMax;
const TBL = RULES_MOD.RULES.difficulty.entityMults;   // #76 A 表驱动乘子端点 [diff=0, diff=diffMax]；测试以端点+插值为唯一真值，抗未来调参
ok(EM(0).maxHp === TBL.maxHp[0] && EM(0).damage === TBL.damage[0] && EM(0).armorAll === TBL.armorAll[0] && EM(0).reload === TBL.reload[0], 'diff 0：全乘子为弱难度下限（<1，弱易强难）');
ok(EM(dMax).maxHp === TBL.maxHp[1] && EM(dMax).penetration === TBL.penetration[1] && EM(dMax).damage === TBL.damage[1] && EM(dMax).armorAll === TBL.armorAll[1],
   `diff 上限：生存/输出端触顶终值（实际 maxHp=${EM(dMax).maxHp} armorAll=${EM(dMax).armorAll}）`);
ok(EM(dMax).reload === TBL.reload[1] && EM(dMax).spreadMult === TBL.spreadMult[1] && EM(dMax).aimSpeed === TBL.aimSpeed[1],
   'diff 上限：火控端反向键（reload↓/spread↓/aimSpeed↑）');
ok(closeNum(EM(dMax * 0.5).maxHp, (TBL.maxHp[0] + TBL.maxHp[1]) / 2), `中点线性插值 (${(TBL.maxHp[0] + TBL.maxHp[1]) / 2})（实际 ${EM(dMax * 0.5).maxHp}）`);
ok(EM(-1).maxHp === TBL.maxHp[0] && EM(99).maxHp === TBL.maxHp[1], '乘子越界钳制到 [下限, 上限]');
// 兼容薄委托 statMultForDifficulty = entityMults.maxHp
ok(closeNum(statMultForDifficulty(0.15), entityMultsForDifficulty(0.15).maxHp) && closeNum(statMultForDifficulty(0.95), entityMultsForDifficulty(0.95).maxHp),
   `兼容 statMult（=maxHp 档）随难度插值（实际 ${statMultForDifficulty(0.15)}→${statMultForDifficulty(0.95)}）`);
ok(statMultForDifficulty(-1) === entityMultsForDifficulty(-1).maxHp && statMultForDifficulty(99) === entityMultsForDifficulty(99).maxHp, '兼容 statMult 越界钳制');
// 三杠杆单调
for (let i = 1; i < diffs.length; i++) ok(aiTierForDifficulty(diffs[i]) >= aiTierForDifficulty(diffs[i - 1]), `AI 档位单调（${diffs[i - 1]}→${diffs[i]}）`);
for (let i = 1; i < diffs.length; i++) ok(statMultForDifficulty(diffs[i]) >= statMultForDifficulty(diffs[i - 1]), `数值强度单调`);
for (let i = 1; i < diffs.length; i++) {
  const a = EM(diffs[i - 1]), b = EM(diffs[i]);
  ok(b.maxHp >= a.maxHp && b.reload <= a.reload && b.spreadMult <= a.spreadMult && b.armorAll >= a.armorAll, `全属性乘子方向正确（${diffs[i-1]}→${diffs[i]}）`);
}

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
  // P-37：Boss 周期节点（index 4/9 → (index+1)%5===0）清空常规敌军；普通节点数量匹配难度
  if (n.boss) {
    ok(n.boss === true, `节点 ${n.index} 为周期 Boss 节点（预标 true，待 UI 层指定定义）`);
    ok(n.enemies.length === 0, `Boss 节点 ${n.index} 不混普通敌军`);
  } else {
    ok(!n.boss, `普通节点 ${n.index} 无 Boss 标记`);
    ok(n.enemies.length === enemyCountForDifficulty(n.difficulty), `节点 ${n.index} 敌军数量匹配难度`);
  }
  // P-13/#76 A：三杠杆字段（AI 档位 + 数值强度）落在节点与每个敌人上
  ok(typeof n.aiTier === 'number' && n.aiTier >= 0 && n.aiTier <= 2, `节点 ${n.index} aiTier 合法`);
   ok(typeof n.statMult === 'number' && n.statMult >= TBL.maxHp[0] - 1e-9 && n.statMult <= TBL.maxHp[1] + 1e-9, `节点 ${n.index} statMult 合法（兼容 =maxHp 档，弱易<1 强难>1）`);
  ok(n.aiTier === aiTierForDifficulty(Math.min(1, n.difficulty)), `节点 ${n.index} aiTier 匹配难度`);
  ok(n.statMult === statMultForDifficulty(n.difficulty), `节点 ${n.index} statMult 匹配难度`);
  ok(JSON.stringify(n.entityMults) === JSON.stringify(entityMultsForDifficulty(n.difficulty)), `节点 ${n.index} entityMults 表匹配难度（#76 A）`);
  for (const e of n.enemies) {
    ok(e.x > 0 && e.x < n.w && e.y > 0 && e.y < n.h, '敌军在界内');
    ok(e.tankId && typeof e.tankId === 'string', '敌军有 tankId');
    ok(typeof e.hullAngle === 'number' && typeof e.turretAngle === 'number', '敌军朝向合法');
    ok(e.heightClass === 'heavy' || e.heightClass === 'medium', '敌军车高合法');
    ok(e.statMult === n.statMult, `节点 ${n.index} 敌军 statMult 与节点一致`);
    ok(JSON.stringify(e.entityMults) === JSON.stringify(n.entityMults), `节点 ${n.index} 敌军 entityMults 与节点一致（#76 A）`);
    ok(e.aiTier === n.aiTier, `节点 ${n.index} 敌军 aiTier 与节点一致（P-34 C 数据面）`);
    ok(Math.hypot(e.x - n.playerSpawn.x, e.y - n.playerSpawn.y) >= RULES_MOD.RULES.nodeMap.enemyMinPlayerDist - 1, '敌军离玩家出生点有最小间距');
  }
  if (n.outpost) {
    totalOutposts++;
    ok(n.outpost.x > 0 && n.outpost.x < n.w * 0.35 && n.outpost.y > 0 && n.outpost.y < n.h, '据点在友军侧（左 1/3）');
  }
  totalEnemies += n.enemies.length;
}
ok(totalEnemies >= 3, `全局敌军总数合理（${totalEnemies}，Boss 节点不计）`);
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
// P-34 C：aiTier 注入实体（数据接线，#76 消费）
if (node1.enemies.length > 0) {
  ok(res.spawned.filter(t => t.team === 'enemy').every(t => t.aiTier === node1.aiTier),
     `敌军实体带 t.aiTier=${node1.aiTier}（P-34 C）`);
} else {
  ok(true, '该节点为 Boss 节点无普通敌军（aiTier 注入由下方 solo 节点覆盖）');
}
const matBoss = materializeNode({ index: 4, difficulty: 0.35, aiTier: 1, covers: [], enemies: [
  { tankId: 'dummy', x: 500, y: 300, hullAngle: 0, turretAngle: 0, heightClass: 'medium', statMult: 1, aiTier: 1 }
], outpost: null }, {
  spawnTank(spec) { return Object.assign({ hp: 100 }, spec); }
});
ok(matBoss.spawned[0].aiTier === 1, 'materializeNode 敌军数据 aiTier → 实体 t.aiTier');
if (node1.outpost) ok(res.outpost === res.spawned[res.spawned.length - 1], '返回 outpost 引用');
else ok(res.outpost === null, '无据点节点返回 null');

// 7) makeNode 单节点（独立 rng）合法（P-34：签名去 count，难度只依赖 index/env.difficultyLevel）
const rng = NG.createRNG(42);
const solo = makeNode(0, rng);
ok(solo.index === 0 && solo.difficulty === 0.15, 'makeNode 单节点基础字段');
ok(Array.isArray(solo.covers) && solo.covers.length > 0, 'makeNode 有掩体');
ok(solo.enemies.length === enemyCountForDifficulty(0.15), 'makeNode 敌军数量匹配难度');
ok(!solo.boss, 'index 0 非 Boss 节点');
// #24：makeNode 显式注入视口 → 世界尺寸 ≥ 视口 3 倍
const rngV = NG.createRNG(42);
const soloV = makeNode(0, rngV, { viewport: { vw: 1920, vh: 1080 } });
ok(soloV.w >= 3 * 1920 - 1e-3 && soloV.h >= 3 * 1080 - 1e-3,
   `makeNode 视口注入 → 5760×3240+（实际 ${soloV.w.toFixed(0)}×${soloV.h.toFixed(0)}）`);
ok(Array.isArray(soloV.covers) && soloV.covers.length > 0, 'makeNode 视口模式仍有掩体');
// #25：单节点掩体数量在加密后的合理区间（低难教学节点剔除后也 ≥ 3）
ok(soloV.covers.length >= 3, `makeNode 视口模式掩体数量合理（${soloV.covers.length}）`);

// 8) P-37：Boss 周期标记 —— (index+1)%5===0 → index 4/9/14…
ok(isBossNodeIndex(4) && isBossNodeIndex(9) && isBossNodeIndex(14), 'isBossNodeIndex 周期判定 4/9/14');
ok(!isBossNodeIndex(0) && !isBossNodeIndex(3) && !isBossNodeIndex(8), '非周期索引不标 Boss');
const runB = generateRun('boss-seed', 12);   // 上限 12 节点
ok(runB.nodes[4].boss === true && runB.nodes[4].enemies.length === 0, 'generateRun 节点 5（index 4）为 Boss 节点且清敌');
ok(runB.nodes[9].boss === true && runB.nodes[9].enemies.length === 0, 'generateRun 节点 10（index 9）为 Boss 节点且清敌');
ok(runB.nodes.filter(n => n.boss).length === 2, '12 节点内恰有 2 个 Boss 节点');

// 9) P-34：extendRun 开放式链追加 —— 增长、确定性、Boss 周期延续
const runX1 = generateRun('ext-seed', 3);
const runX2 = generateRun('ext-seed', 3);
const n3a = extendRun(runX1);
const n3b = extendRun(runX2);
ok(runX1.nodes.length === 4 && runX2.nodes.length === 4, 'extendRun 追加后链长 +1');
ok(JSON.stringify(n3a) === JSON.stringify(n3b), '同 seed 同 env 下 extendRun 结果一致（确定性）');
ok(JSON.stringify(n3a) === JSON.stringify(generateRun('ext-seed', 4).nodes[3]), 'extendRun 续接节点 ≡ 一次性生成长链的同位节点');
ok(n3a.index === 3 && n3a.difficulty === difficultyForIndex(3), '追加节点难度按新索引计算');
const runY = generateRun('ext-seed', 3);
for (let k = 0; k < 12; k++) extendRun(runY);   // 3 → 15
ok(runY.nodes.length === 15, `连续 extendRun 链长无上限（实际 ${runY.nodes.length}）`);
ok(runY.nodes[14].boss === true && runY.nodes[14].enemies.length === 0, 'index 14 为周期 Boss 节点（P-37 周期在开放式链下延续）');
ok(runY.nodes[13] && !runY.nodes[13].boss, 'index 13 非 Boss');

// 10) P-34：difficultyLevel 经 env 注入生成（跨局难度叠加数据面）
const runLv = generateRun('lv-seed', 5, { difficultyLevel: 2 });
ok(runLv.difficultyLevel === 2, 'run.difficultyLevel 记录注入值');
for (let i = 0; i < 5; i++) {
  ok(runLv.nodes[i].difficulty === difficultyForIndex(i, 2), `Lv.2 节点 ${i} 难度叠加正确`);
}
const runZ = extendRun(generateRun('lv-seed', 5, { difficultyLevel: 3 }));
ok(runZ.difficulty === difficultyForIndex(5, 3), 'extendRun 复用 run.env 的 difficultyLevel');

// 11) #76 A：materializeNode 敌军 stats 反映 entityMults + 玩家/据点不受影响
(function testEntityMultsApplied() {
  const mkStats = () => ({
    maxHp: 1000, penetration: 120, damage: 200, reload: 5, spreadMult: 1,
    aimSpeed: 0.15, maxSpeed: 120, turnRate: 1, turretTurnRate: 1.2,
    armor: { hull: { front: 100, side: 50, rear: 30 }, turret: { front: 140, side: 60, rear: 40 } }
  });
  const diffTargets = [];
  const envM = {
    spawnTank(spec) {
      return Object.assign({ hp: 1000, stats: mkStats(), modifiers: [] }, spec);
    },
    configureTank() {},
    // 模拟 mvp applyDifficulty：全键乘 + armorAll 遍历装甲面
    applyDifficulty(t, m) {
      for (const k of ['maxHp','penetration','damage','reload','spreadMult','aimSpeed','maxSpeed','turnRate','turretTurnRate']) {
        if (m[k] !== undefined && m[k] !== 1) t.stats[k] *= m[k];
      }
      for (const g of ['hull', 'turret']) {
        for (const f in t.stats.armor[g]) t.stats.armor[g][f] *= m.armorAll;
      }
      t.hp = t.stats.maxHp;
      diffTargets.push(t.team);
    }
  };
  const multsMax = entityMultsForDifficulty(dMax);
  const resM = materializeNode({
    index: 6, difficulty: dMax, covers: [], outpost: { x: 50, y: 50 },   // index 6 非 Boss 周期
    enemies: [
      { tankId: 'dummy', x: 500, y: 300, hullAngle: 0, turretAngle: 0, heightClass: 'medium', entityMults: multsMax, aiTier: 2 },
      { tankId: 'dummy', x: 700, y: 400, hullAngle: 0, turretAngle: 0, heightClass: 'heavy', entityMults: multsMax, aiTier: 1 }
    ]
  }, envM);
  const e0 = resM.spawned[0], e1 = resM.spawned[1];
  ok(e0.stats.maxHp === 1000 * multsMax.maxHp, `entityMults.maxHp 应用：1000→${e0.stats.maxHp}（实际 ${e0.stats.maxHp}）`);
  ok(closeNum(e0.stats.reload, 4.1), `entityMults.reload 应用：5→4.1（实际 ${e0.stats.reload}）`);
  ok(e0.stats.armor.hull.front === 100 * multsMax.armorAll && e0.stats.armor.turret.rear === 40 * multsMax.armorAll,
     `armorAll 全面生效：hull.front 100→${e0.stats.armor.hull.front} / turret.rear 40→${e0.stats.armor.turret.rear}（实际 ${e0.stats.armor.hull.front}/${e0.stats.armor.turret.rear}）`);
  ok(e1.stats.penetration === 120 * multsMax.penetration && e1.stats.spreadMult === 1 * multsMax.spreadMult && closeNum(e1.stats.turretTurnRate, 1.2 * multsMax.turretTurnRate),
     '第二个敌军同样按表叠乘（pen/spread/turretTurnRate）');
  ok(JSON.stringify(diffTargets.sort()) === JSON.stringify(['enemy', 'enemy']),
     'applyDifficulty 仅对 team=enemy 调用（玩家/据点不受难度影响）');
  ok(resM.outpost && resM.outpost.stats.maxHp === 1000 && resM.outpost.stats.armor.hull.front === 100,
     '据点实体 stats 完全未被乘子触碰');
})();

// 12) P-38：击杀配额公式 + 递增生成节奏（reinforcementTick）
const { quotaForDifficulty, reinforcementTick } = require('../js/tank_map.js');

// 12a) 配额公式：quota = max(initial, initial + 2 + floor(effDiff×6))
ok(quotaForDifficulty(1, 0.15) === 3, `配额低难度 1+2+0=3（实际 ${quotaForDifficulty(1, 0.15)}）`);
ok(quotaForDifficulty(2, 0.5) === 7, `配额中难度 2+2+floor(3)=7（实际 ${quotaForDifficulty(2, 0.5)}）`);
ok(quotaForDifficulty(4, 0.95) === 11, `配额高难度 4+2+5=11（实际 ${quotaForDifficulty(4, 0.95)}）`);
ok(quotaForDifficulty(3, -1) === quotaForDifficulty(3, 0), '负难度钳制到 0');
for (let i = 1; i < diffs.length; i++) {
  ok(quotaForDifficulty(2, diffs[i]) >= quotaForDifficulty(2, diffs[i - 1]), `配额随难度单调（${diffs[i-1]}→${diffs[i]}）`);
}
// 配额恒 ≥ 初始敌数（初始全灭但未满 → 增援续战）
for (const d of diffs) {
  const initN = enemyCountForDifficulty(d);
  ok(quotaForDifficulty(initN, d) >= initN, `配额 ≥ 初始敌数（diff=${d}）`);
}
// makeNode 写入 node.quota；Boss 节点为 null
(function testNodeQuotaField() {
  const r = generateRun(20260824, 7);
  for (const nd of r.nodes) {
    if (nd.boss) ok(nd.quota === null, `Boss 节点 index=${nd.index} quota=null`);
    else {
      const expect = quotaForDifficulty(nd.enemies.length, nd.difficulty);
      ok(nd.quota === expect && Number.isFinite(nd.quota),
         `常规节点 index=${nd.index} quota=${nd.quota} 符合公式（期望 ${expect}）`);
    }
  }
})();

// 12b) reinforcementTick 门控条件
function baseTickState(over) {
  return Object.assign({
    alive: 1, killedThisNode: 2, quota: 6, effDiff: 0.5, initialCount: 3,
    playerPos: { x: 1500, y: 1000 },
    viewBounds: { minX: 1300, minY: 800, maxX: 1700, maxY: 1200 },
    worldSize: { w: 3000, h: 2000 },
    covers: [], outpostPos: null,
    rng: createRNG(42), timer: 9,
    aiTriggerDist: triggerDistForDifficulty(0.5),
    tankPool: ['dummy']
  }, over || {});
}
// 触发条件满足 → 产出 1~2 个 spec，落点全部合法
(function testTickSpawns() {
  const specs = reinforcementTick(baseTickState());
  ok(Array.isArray(specs) && specs.length >= 1 && specs.length <= 2, `tick 产出 1~2 个 spec（实际 ${specs.length}）`);
  const minPD = triggerDistForDifficulty(0.5) * 1.05;
  for (const sp of specs) {
    const outsideView = sp.x < 1180 || sp.x > 1820 || sp.y < 680 || sp.y > 1320;   // 视口外扩 120px 外
    ok(outsideView, `落点 (${sp.x},${sp.y}) 在视口 AABB 外扩 120px 之外`);
    ok(sp.x >= 120 && sp.x <= 2880 && sp.y >= 120 && sp.y <= 1880, '落点在世界边界内（margin 钳制）');
    ok(Math.hypot(sp.x - 1500, sp.y - 1000) >= minPD, `落点距玩家 ≥ aiTriggerDist×1.05（${Math.round(Math.hypot(sp.x-1500, sp.y-1000))} ≥ ${Math.round(minPD)}）`);
    ok(sp.reinforcement === true, 'spec 带 reinforcement 标记');
    ok(typeof sp.tankId === 'string' && (sp.heightClass === 'heavy' || sp.heightClass === 'medium'), 'spec 模板字段完整');
    ok(sp.aiTier === 0 || typeof sp.aiTier === 'number', 'spec 带 aiTier');
  }
})();
// 配额已满 → 不产出
ok(reinforcementTick(baseTickState({ killedThisNode: 6, quota: 6 })).length === 0, 'killed≥quota 不产出');
// Boss 节点（quota=null）禁用
ok(reinforcementTick(baseTickState({ quota: null })).length === 0, 'Boss 节点（quota=null）禁用递增生成');
// alive 已达 desiredAlive → 不产出（initial=3→ceil(1.8)=2 + floor(0.5×3)=1 → desired=3）
ok(reinforcementTick(baseTickState({ alive: 3 })).length === 0, 'alive≥desiredAlive 不产出');
ok(reinforcementTick(baseTickState({ alive: 2 })).length >= 1, 'alive<desiredAlive 触发补兵');
// maxAlive 封顶
ok(reinforcementTick(baseTickState({ alive: 7 })).length === 0, 'alive=maxAlive(7) 封顶不产出');
// interval 未到 → 不产出
ok(reinforcementTick(baseTickState({ timer: 7.99 })).length === 0, 'interval(8s) 未到不产出');
// 预算钳制：quota−killed−alive=1 → 恰好 1 个
ok(reinforcementTick(baseTickState({ alive: 2, killedThisNode: 3, quota: 6 })).length === 1,
   '剩余预算 1 时只生成 1 个');
// 掩体拒绝：全域 solid 掩体下无合法落点 → 空数组
ok(reinforcementTick(baseTickState({ covers: [{ x: 1500, y: 1000, w: 3000, h: 2000, angle: 0 }] })).length === 0,
   '全域掩体覆盖时拒绝采样返回空');
// 友军据点 300px 约束
(function testOutpostConstraint() {
  const specs = reinforcementTick(baseTickState({ outpostPos: { x: 1500, y: 1000 } }));
  for (const sp of specs) ok(Math.hypot(sp.x - 1500, sp.y - 1000) >= 300, `落点距据点 ≥300（实际 ${Math.round(Math.hypot(sp.x-1500, sp.y-1000))}）`);
})();
// rng 注入确定性：同 seed 同输入 → 完全一致输出；缺 rng → 空
(function testDeterminism() {
  const a = reinforcementTick(baseTickState({ rng: createRNG(777) }));
  const b = reinforcementTick(baseTickState({ rng: createRNG(777) }));
  ok(JSON.stringify(a) === JSON.stringify(b) && a.length > 0, '同 seed 确定性复现');
  ok(reinforcementTick(baseTickState({ rng: null })).length === 0, '缺 rng 注入安全返回空');
})();

console.log('test-map: 完成所有检查');
if (fails === 0) console.log('test-map: 全部通过');
else console.error(`test-map: ${fails} 项失败`);
process.exit(fails === 0 ? 0 : 1);
