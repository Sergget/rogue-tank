// test-node-kinds.js — M3-D：歼灭正名与 node.kind 枚举一致性审计（2026-11-02）
// 运行：node scripts/test-node-kinds.js
// 口径：specs/combat/node-mission-types.md + RULES.nodeKinds（枚举唯一来源）。
// 本测试只做静态审计，不改任何行为；负向段证明检测器本身能判红（非恒真）。
'use strict';

const fs = require('fs');
const path = require('path');

const U = require('../js/tank_utils.js');
global.TAU = U.TAU;
const RULES_MOD = require('../js/tank_rules.js');
global.RULES = RULES_MOD.RULES;

let fails = 0;
function ok(cond, label) {
  if (cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}`); fails++; }
}

const CANON = ['exterminate', 'defend', 'capture', 'breakthrough', 'shop', 'supply', 'event'];
const KIND_SET = new Set(CANON);

// 从源码里抽 `node.kind` / `n.kind` 的字面量比较与赋值（只认节点字段，避开卡牌/无人机的 kind）
function extractNodeKindLiterals(src) {
  const out = [];
  const re = /(?:\bnode|\bn)\.kind\s*(?:===|==|!==|!=|=)\s*['"]([a-z_]+)['"]/g;
  let m;
  while ((m = re.exec(src))) out.push(m[1]);
  return out;
}

// ① 契约枚举 = 规范列表（唯一来源）
ok(JSON.stringify(RULES.nodeKinds.kinds) === JSON.stringify(CANON),
  'M3-D：RULES.nodeKinds.kinds 与规范 7 型列表逐项一致');

// ② js/ 下所有 node.kind 字面量都在枚举内（防拼写漂移 / 旧称回潮）
const jsDir = path.join(__dirname, '..', 'js');
const bad = [];
for (const f of fs.readdirSync(jsDir).filter(n => n.endsWith('.js'))) {
  const src = fs.readFileSync(path.join(jsDir, f), 'utf8');
  for (const k of extractNodeKindLiterals(src)) {
    if (!KIND_SET.has(k)) bad.push(`${f}:${k}`);
  }
}
ok(bad.length === 0, `M3-D：js/ 下 node.kind 字面量全部合法${bad.length ? '（越界：' + bad.join(', ') + '）' : ''}`);

// ③ 负向：检测器必须能抓到旧称（否则 ② 是恒真断言）
const probe = "if (node.kind === 'annihilate') { n.kind = 'elimination'; }";
const probeKinds = extractNodeKindLiterals(probe);
ok(probeKinds.length === 2 && probeKinds.every(k => !KIND_SET.has(k)),
  'M3-D 负向：旧称 annihilate / elimination 会被判非法（检测器非恒真）');

// ④ 规格页列出全部 7 型（正名与代码名同源）
const specPath = path.join(__dirname, '..', 'docs', 'specs', 'combat', 'node-mission-types.md');
const spec = fs.readFileSync(specPath, 'utf8');
ok(CANON.every(k => spec.includes(k)), 'M3-D：规格页列出全部 7 型 kind');
ok(spec.includes('歼灭') && spec.includes('exterminate'),
  'M3-D：规格页同时给出中文正名「歼灭」与代码名 `exterminate`');

// ⑤ 消费方存在（非死配置）：makeNode 写 kind、scoreNode 读 kind、卡牌层解析类型权重
const mapSrc = fs.readFileSync(path.join(jsDir, 'tank_map.js'), 'utf8');
const cardSrc = fs.readFileSync(path.join(jsDir, 'tank_cards.js'), 'utf8');
ok(mapSrc.includes('node.kind =') && mapSrc.includes('kindReward'),
  'M3-D：makeNode 写 node.kind、scoreNode 消费类型加成');
ok(cardSrc.includes('function nodeKindRarityWeights'),
  'M3-D：卡牌层提供类型权重解析（nodeKindRarityWeights）');

// ⑥ M3-H：非战斗节点路由接线（页面侧静态判据；运行时由浏览器链覆盖）
const pageSrc = fs.readFileSync(path.join(__dirname, '..', 'tank_battle.html'), 'utf8');
ok(pageSrc.includes('function routeNonCombatNode'), 'M3-H：页面提供非战斗节点路由函数');
ok(pageSrc.includes('if(nextNode && isNonCombatNodeKind(nextNode.kind))'),
  'M3-H：nextNodeAfterReward 在 transition(battle) 之前分流');
ok(pageSrc.includes('revealRewardShop()') && pageSrc.includes('buildRunShopInto'),
  'M3-H：商店节点复用 reward 屏内嵌商店（buildRunShopInto）');
ok(pageSrc.includes('openRewardScreen()'), 'M3-H：事件/补给节点走选卡管线');
ok(pageSrc.includes('NODE_KIND_LABELS'), 'M3-H：节点类型标签表存在');
ok(pageSrc.includes('非战斗节点绝不进战场'), 'M3-H 负向：enterBattle 有「非战斗节点不进战场」兜底');

console.log('test-node-kinds: 完成所有检查');
if (fails === 0) console.log('test-node-kinds: 全部通过');
else console.error(`test-node-kinds: ${fails} 项失败`);
process.exit(fails === 0 ? 0 : 1);
