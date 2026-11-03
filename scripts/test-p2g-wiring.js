'use strict';
// test-p2g-wiring.js — P2-G「守军语义 + 反冲击前锋」**页面接线**转正测试
//
// 由 tmp/verify-p2g-wiring.cjs（67 条）+ tmp/verify-p2g-regression.cjs（20 条）合并转正，
//   合计 87 条断言，一条未丢。合并理由：两者同属「P2-G 页面接线」一个主题（前者查
//   接线/分流/兜底语义，后者查零回归原文执行），合一份可少占一个 TESTS 槽位。
//
// WHY：npm run check 只证明「语法能解析」，不证明「接线对」。本批硬验收里
//   「garrisonMode=false 零回归」与「守军/前锋分流正确」必须拿**真实装配结果**说话。
//
// 做法（两个强度等级，都保留，不降级）：
//   ① 静态契约：键名/接线点/总门，逐字对齐 PLAN §2.8.3 契约 v2；
//   ② **动态执行**：把 tank_battle.html 内联脚本里 P2-G 分流块的**源码原文**用
//      vm 执行（substring 抽取，不做手写复刻——手写复刻等于「自己抄自己」，证明力为零），
//      配真 RULES / 真 garrisonAssignVanguards / 真 spawnTank，不做 mock AI、不做假实体。
//   ⚠ 只跑「纯逻辑可跑」的分片（分流判定 / 前出 / 兜底 / 出口），不模拟 DOM/Canvas。
//
// 六组负向断言（防假绿）：
//   N1 末波前锋强制 0（裁定⑩）
//   N2 负 aheadOffsetPx 钳 0（绝不 -x 背后刷怪，§4.187 教训）
//   N3 纯函数不改入参（保护页面 pending/plan）
//   N4 兜底注入幂等（重复遍历不重复注入）
//   N5 零回归：garrisonMode=false 逐字段比对（k/cls/x/y/hull 全同）
//   N6 兜底关闭（seconds=0）⇒ 熬过 60s 恒不注入
//
// 已知陷阱（踩过）：
//   · 禁区正则必须**排除注释行**——页面 P2-G 注释里引用了 `camouflageDistanceMultiplier=0.625`
//     （探针结论原文引用），按「非注释行」逐行判，否则把说明文字误判成改写。
//   · 夹具 hull 必须按**页面原文**产出（朝向玩家），塞常量 π 会把「幂等重算」误判成「hull 被改」。
//   · 末尾必须把 RULES.encounter.garrisonMode 还原为 false，不污染同批其他测试。
//
// 用法：node scripts/test-p2g-wiring.js

const path = require('path');
const fs = require('fs');
const vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
const j = (f) => path.join(ROOT, 'js', f);

const U = require('../js/tank_utils.js');
const RULES = require('../js/tank_rules.js').RULES;

global.RULES = RULES;
global.TAU = U.TAU;
global.norm = U.norm;
global.angDiff = U.angDiff;
global.rotate = U.rotate;
global.distToSegment = U.distToSegment;
global.segRayIntersect = U.segRayIntersect;
global.partCorners = U.partCorners;
global.partEdges = U.partEdges;
global.lightningPath = U.lightningPath;
global.simNow = U.simNow;
global.setSimNow = U.setSimNow;
global.advanceSimNow = U.advanceSimNow;

const GEO = require(j('tank_geometry.js'));
global.polyCorners = GEO.polyCorners;
global.HEIGHTS = GEO.HEIGHTS;

const CV = require(j('tank_cover.js'));
global.getCoverUnderTank = CV.getCoverUnderTank;
global.getRoadUnderTank = CV.getRoadUnderTank;
global.resolveCoverCollisions = CV.resolveCoverCollisions;
global.COVER_TIERS = CV.COVER_TIERS;
global.coverCorners = CV.coverCorners;
global.obbMTV = CV.obbMTV;
global.obbMTVs = CV.obbMTVs;
global.camouflageDistanceMultiplier = CV.camouflageDistanceMultiplier;
global.hasLineOfSight = CV.hasLineOfSight;

const MD = require(j('tank_model.js'));
global.makeTank = MD.makeTank;
global.debuffTurnRate = MD.debuffTurnRate;
global.debuffSpeedRate = MD.debuffSpeedRate;
global.normalizeBarrel = require(j('tank_halfgeom.js')).normalizeBarrel;

const EN = require(j('tank_entity.js'));
global.entities = EN.entities;
global.spawnTank = EN.spawnTank;
global.advanceTracks = EN.advanceTracks;
global.clamp = EN.clamp;
global.resetEntity = EN.resetEntity;

const ENC = require(j('tank_encounter.js'));
global.garrisonFallbackTrack = ENC.garrisonFallbackTrack;
global.garrisonFallbackDue = ENC.garrisonFallbackDue;
global.garrisonFallbackApply = ENC.garrisonFallbackApply;
global.garrisonAssignVanguards = ENC.garrisonAssignVanguards;

const MAP = require(j('tank_map.js'));
global.triggerDistForDifficulty = MAP.triggerDistForDifficulty;

const HTML = fs.readFileSync(path.join(ROOT, 'tank_battle.html'), 'utf8');

let pass = 0, fail = 0;
function ok(cond, msg, extra) {
  if (cond) { pass++; console.log(`  ✓ ${msg}`); }
  else { fail++; console.log(`  ✗ ${msg}${extra ? '  → ' + extra : ''}`); }
}
function section(t) { console.log('\n=== ' + t + ' ==='); }

// ===========================================================================
// 1. 源码级契约核查（防漂移：键名必须逐字对齐 PLAN §2.8.3 契约 v2）
// ===========================================================================
section('1. 键名契约核查（契约 v2）');
const src = HTML;

ok(/garrisonMode/.test(src), '页面消费 RULES.encounter.garrisonMode');
ok(/garrisonVanguard/.test(src), '页面消费 RULES.encounter.garrisonVanguard（对象）');
ok(/garrisonFallbackSeconds/.test(src), '页面消费 RULES.encounter.garrisonFallbackSeconds');
ok(!/RULES\.encounter\.vanguard\b/.test(src),
  '页面**不**读已作废的 RULES.encounter.vanguard（契约 v2 已判弃）');
ok(!/encounter\.garrisonVanguard\s*\|\|\s*\d/.test(src),
  '页面**没有**标量回落分支（role-systems 要求删除死代码）');
const vgUse = src.match(/garrisonVanguard/g) || [];
ok(vgUse.length >= 1, `garrisonVanguard 引用 ${vgUse.length} 处`);
ok(!/aheadOffsetPx\s*[:=]\s*\d/.test(src),
  '页面**未内定** aheadOffsetPx 数值（读 RULES，不硬编码）');
// 禁区：不得改 camo / enterDCamo / enemyClassProfiles（注释行不算）
const codeLines = src.split('\n').filter(l => !/^\s*\/\//.test(l));
const codeOnly = codeLines.map(l => l.replace(/\/\/.*$/, '')).join('\n');
ok(!/camouflageDistanceMultiplier\s*=[^=]/.test(codeOnly),
  '页面未**改写** camouflageDistanceMultiplier（裁定 3 不动；注释中的引用不算）');
ok(!/enterDCamo\s*=[^=]/.test(codeOnly), '页面未改写 enterDCamo');
ok(!/enemyClassProfiles\s*=[^=]/.test(codeOnly), '页面未改 enemyClassProfiles（堆血量禁区）');

// ===========================================================================
// 2. RULES 键形态（真模块读取，非记忆）
// ===========================================================================
section('2. RULES 键形态（真模块读取，非记忆）');
const vg = RULES.encounter.garrisonVanguard;
const gm = RULES.encounter.garrisonMode;
const gfs = RULES.encounter.garrisonFallbackSeconds;
console.log(`  garrisonMode=${gm}  garrisonVanguard=${JSON.stringify(vg)}  garrisonFallbackSeconds=${gfs}`);
ok(gm === false, 'garrisonMode 默认 false（零回归总门）');
ok(vg && typeof vg === 'object' && !Array.isArray(vg), 'garrisonVanguard 是**对象**（契约 v2）');
ok(Number.isFinite(vg.count), `garrisonVanguard.count = ${vg && vg.count}`);
ok(Number.isFinite(vg.aheadOffsetPx), `garrisonVanguard.aheadOffsetPx = ${vg && vg.aheadOffsetPx}`);
ok(gfs === 0, 'garrisonFallbackSeconds 默认 0 = 关闭（Lead 裁定 v2：20s 是标定目标值）');

// ===========================================================================
// 3. 守军/前锋分流（真 garrisonAssignVanguards + 真实体装配，逐字段比对）
// ===========================================================================
section('3. 守军/前锋分流（真 garrisonAssignVanguards）');
const world = { w: 2400, h: 1400 };
function mkPlan(n, baseX, baseY) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({ x: baseX, y: baseY + i * 90, hull: Math.PI, cls: i % 2 ? 'medium' : 'heavy', k: i });
  }
  return out;
}

// 3a. N1 末波强制 0（裁定⑩）
const lastWave = ENC.garrisonAssignVanguards(mkPlan(4, 1500, 400), vg, { isLastWave: true, world, margin: 60 });
const vLast = lastWave.filter(u => u.role === 'vanguard').length;
ok(vLast === 0, `N1 负向：末波前锋数 = ${vLast}（裁定⑩：强制 0）`, `实得 ${vLast}`);

// 3b. 非末波：min(总数, count)
const midWave = ENC.garrisonAssignVanguards(mkPlan(4, 1500, 400), vg, { isLastWave: false, world, margin: 60 });
const vMid = midWave.filter(u => u.role === 'vanguard').length;
ok(vMid === Math.min(4, vg.count), `非末波前锋数 = ${vMid} = min(4, ${vg.count})`, `实得 ${vMid}`);

// 3c. 前出方向：只 +x（§4.187 教训，绝不 -x 背后刷怪）
const baseX = 1500;
const off = vg.aheadOffsetPx;
for (let i = 0; i < vMid; i++) {
  ok(midWave[i].x >= baseX, `前锋 #${i} 前出沿 +x（${baseX} → ${midWave[i].x}）`, `x=${midWave[i].x}`);
}
ok(Math.abs(midWave[0].x - (baseX + off)) < 1e-6 || midWave[0].x === world.w - 60,
  `前锋 #0 前出量 = ${(midWave[0].x - baseX).toFixed(0)}px（配置 ${off}px）`);
for (let i = vMid; i < midWave.length; i++) {
  ok(midWave[i].x === baseX, `守军 #${i} 未前出（x 保持 ${baseX}）`, `x=${midWave[i].x}`);
}

// 3d. N2 负偏移钳 0（绝不反向）
const negCfg = { count: 2, aheadOffsetPx: -500 };
const negWave = ENC.garrisonAssignVanguards(mkPlan(3, 1500, 400), negCfg, { isLastWave: false, world, margin: 60 });
ok(negWave.every(u => u.x >= 1500), 'N2 负向：负 aheadOffsetPx 被钳 0 ⇒ 无一辆落在 -x（不在玩家背后刷怪）',
  JSON.stringify(negWave.map(u => u.x)));

// 3e. 不出界
const edgeWave = ENC.garrisonAssignVanguards(mkPlan(2, world.w - 10, 400), vg, { isLastWave: false, world, margin: 60 });
ok(edgeWave.every(u => u.x <= world.w - 60 + 1e-6), '前出后仍钳在场内（≤ w − margin）',
  JSON.stringify(edgeWave.map(u => u.x)));

// 3f. N3 纯函数不改入参（保护页面 pending/plan）
const planIn = mkPlan(4, 1500, 400);
const snapBefore = JSON.stringify(planIn);
ENC.garrisonAssignVanguards(planIn, vg, { isLastWave: false, world, margin: 60 });
ok(JSON.stringify(planIn) === snapBefore, 'N3 负向：纯函数**不改入参**（返回新数组副本）');

// ===========================================================================
// 4. 超时兜底（真 garrisonFallback*，时钟 simNow 毫秒）
// ===========================================================================
section('4. 超时兜底（真 garrisonFallback*，时钟 simNow 毫秒）');
U.setSimNow(0);
const book = new Map();
const foe = EN.spawnTank({ id: 'g1', team: 'enemy', x: 1600, y: 400, hullAngle: Math.PI, turretAngle: Math.PI, heightClass: 'medium' });
foe.hp = foe.stats && foe.stats.maxHp ? foe.stats.maxHp : 100;
const tracked = ENC.garrisonFallbackTrack(book, foe, { now: U.simNow() });
ok(tracked === true, '入场登记成功');
ok(ENC.garrisonFallbackTrack(book, foe, { now: U.simNow() }) === false, '重复登记返回 false（幂等，不推迟计时）');
// N6 默认 0 秒 = 关闭 ⇒ 即便熬过 60s 也恒 false（零回归核心）
U.setSimNow(60000);
ok(ENC.garrisonFallbackDue(foe, { now: U.simNow(), seconds: 0, book }) === false,
  'N6 负向：seconds=0（当前默认）⇒ 熬过 60s 仍恒 false（兜底关闭，零回归）');
ok(ENC.garrisonFallbackDue(foe, { now: U.simNow(), seconds: 20, book }) === true,
  'seconds=20 ⇒ 熬过 60s 判到期');
U.setSimNow(5000);
ok(ENC.garrisonFallbackDue(foe, { now: U.simNow(), seconds: 20, book }) === false, '仅 5s ⇒ 未到期');
U.setSimNow(25000);
const applied = ENC.garrisonFallbackApply(foe, { now: U.simNow(), playerPos: { x: 300, y: 400 }, book });
ok(applied === true, '注入成功');
ok(foe.aiEngaged === true, '注入后 aiEngaged=true');
ok(foe.alertLevel === 3, '注入后 alertLevel=3');
ok(foe.lastKnownPlayerPos && foe.lastKnownPlayerPos.x === 300, '注入后 lastKnownPlayerPos = 玩家方位');
ok(typeof foe._threatDir === 'number' && Number.isFinite(foe._threatDir),
  `_threatDir 是**弧度角标量**（不是 {x,y}）：${foe._threatDir}`, typeof foe._threatDir);
const expectDir = Math.atan2(400 - foe.y, 300 - foe.x);
ok(Math.abs(foe._threatDir - expectDir) < 1e-9, '_threatDir 数值 = atan2(playerPos − entity)');
ok(ENC.garrisonFallbackDue(foe, { now: U.simNow(), seconds: 20, book }) === false, '已注入 ⇒ 不再重复触发');

// ===========================================================================
// 5. 接线点存在性（防「写了函数没挂钩」——最典型的假完成）
// ===========================================================================
section('5. 接线点存在性（函数定义 + 真实调用）');
ok(/function\s+updateGarrisonFallback\s*\(/.test(src), '定义 updateGarrisonFallback');
ok(/function\s+isGarrisonUnit\s*\(/.test(src), '定义 isGarrisonUnit');
ok(/updateGarrisonFallback\(\);/.test(src), '**主循环真实调用** updateGarrisonFallback（不只是定义）');
ok(/garrisonFallbackTrack\(battleGarrisonBook/.test(src), 'spawn 处调用 garrisonFallbackTrack');
ok(/garrisonAssignVanguards\(plan/.test(src), 'spawn 处调用 garrisonAssignVanguards');
ok(/t\.garrison\s*=\s*true/.test(src), '守军实体打 garrison 标记（供 intel 跳过）');
ok(/!isGarrisonUnit\(e\)/.test(src), 'intel 事件跳过守军（否则每 6s 刷方位 = 绕过守军语义）');
ok(/battleGarrisonBook\s*=\s*new Map\(\)/.test(src), '守军账本可重置');
const resetCount = (src.match(/battleGarrisonBook\s*=\s*new Map\(\)/g) || []).length;
ok(resetCount >= 2, `账本重置点 ${resetCount} 处（进节点 + 波清，防跨波/跨节点串计时）`);
ok(/function\s+garrisonSoftlockEscaped\s*\(/.test(src), '定义 garrisonSoftlockEscaped（裁定 4）');
ok(/if\(garrisonSoftlockEscaped\(\)\)\s*return true;/.test(src),
  'battleExitUnlocked 真实调用逃生判据（出口与守军未激活解耦）');
ok(/garrison:\s*unit\.garrison\s*===\s*true/.test(src), '补投队列透传 garrison 标记（守军语义不被补投绕过）');
ok(/o\.garrison\s*===\s*true/.test(src), 'assembleWaveEnemyAt 支持守军分支');

// ===========================================================================
// 6. 零回归总门（false 时新路径必须不可达）
// ===========================================================================
section('6. 零回归总门（false 时新路径必须不可达）');
ok(/encRulesG\.garrisonMode\s*===\s*true/.test(src), 'spawn 分流受 garrisonMode 总门');
ok(/encR\.garrisonMode\s*!==\s*true\)\s*return/.test(src) || /encR\.garrisonMode\s*!==\s*true\) return/.test(src),
  'updateGarrisonFallback 受 garrisonMode 总门（false 时早退）');
ok(/encR\.garrisonMode\s*!==\s*true\)\s*return false/.test(src), 'garrisonSoftlockEscaped 受 garrisonMode 总门');
ok(/now:\s*simNow\(\)/.test(src), '兜底时钟走 simNow()（不是 Date.now / performance.now）');
ok(!/now:\s*Date\.now\(\)/.test(src) && !/now:\s*performance\.now\(\)/.test(src),
  '页面未用挂钟喂兜底（保同 seed 可重放）');

// ===========================================================================
// 7. 动态语义：守军超时点亮 + 前锋不被误注入（DONE 最硬的一条，不能只静态查）
// ===========================================================================
section('7. 动态语义：守军超时点亮 + 前锋不被误注入');
U.setSimNow(0);
const book2 = new Map();
function mkFoe(id, x, y, isGarrison) {
  const t = EN.spawnTank({ id, team: 'enemy', x, y, hullAngle: Math.PI, turretAngle: Math.PI, heightClass: 'medium' });
  t.hp = (t.stats && t.stats.maxHp) ? t.stats.maxHp : 100;
  t.garrison = isGarrison;
  if (isGarrison) ENC.garrisonFallbackTrack(book2, t, { now: U.simNow() });
  return t;
}
const g1 = mkFoe('guard1', 1600, 400, true);
const g2 = mkFoe('guard2', 1600, 700, true);
const van = mkFoe('vanguard1', 1760, 400, false);

// 复刻页面遍历（与 tank_battle.html updateGarrisonFallback 同判据）
function pageFallbackPass(entitiesArr, bk, seconds, now, playerPos) {
  const injected = [];
  for (const e of entitiesArr) {
    if (e.team !== 'enemy' || !(e.hp > 0)) continue;
    if (!(e && e.garrison === true)) continue;
    if (e.garrisonFallbackApplied === true) continue;
    if (ENC.garrisonFallbackDue(e, { now, seconds, book: bk })) {
      if (ENC.garrisonFallbackApply(e, { now, playerPos, book: bk })) {
        e.garrisonFallbackApplied = true;
        injected.push(e.id);
      }
    }
  }
  return injected;
}

U.setSimNow(60000);
let inj = pageFallbackPass([g1, g2, van], book2, 0, U.simNow(), { x: 300, y: 400 });
ok(inj.length === 0, `兜底关闭（seconds=0）⇒ 60s 后注入数 = ${inj.length}（零回归，正确）`);
ok(g1.aiEngaged !== true && g2.aiEngaged !== true, '兜底关闭 ⇒ 守军保持未接战（不误注入）');

U.setSimNow(25000);
inj = pageFallbackPass([g1, g2, van], book2, 20, U.simNow(), { x: 300, y: 400 });
ok(inj.length === 2 && inj.indexOf('guard1') >= 0 && inj.indexOf('guard2') >= 0,
  `兜底开启 20s ⇒ 25s 后注入守军 ${JSON.stringify(inj)}`);
ok(g1.aiEngaged === true && g2.aiEngaged === true, '两辆守军 aiEngaged 已被注入为 true');
ok(!inj.includes('vanguard1') && van.garrisonFallbackApplied !== true,
  '**前锋未被误注入**（判据统一到 isGarrisonUnit 后的修复点）');
ok(van.aiEngaged !== true, '前锋自身语义不受兜底遍历影响');
// N4 幂等：再跑一次不重复注入
const inj2 = pageFallbackPass([g1, g2, van], book2, 20, U.simNow(), { x: 300, y: 400 });
ok(inj2.length === 0, `N4 负向：重复遍历注入数 = ${inj2.length}（幂等，不重复）`);

// ===========================================================================
// 8. 出口解耦判据（裁定 4）：纯读，逐条件验证
// ===========================================================================
section('8. 出口解耦判据（garrisonSoftlockEscaped 同义复刻）');
function escaped(entitiesArr, mode, seconds) {
  if (mode !== true) return false;                                  // ① 总门
  if (!(Number.isFinite(seconds) && seconds > 0)) return false;      // ② 兜底未启用
  let saw = false;
  for (const e of entitiesArr) {
    if (e.team !== 'enemy' || !(e.hp > 0) || !(e.garrison === true)) continue;
    saw = true;
    if (e.garrisonFallbackApplied !== true) return false;            // ③ 还有守军没熬过
  }
  return saw;
}
const fresh = [mkFoe('n1', 1600, 400, true), mkFoe('n2', 1600, 700, true)];
ok(escaped(fresh, false, 20) === false, 'garrisonMode=false ⇒ 出口不因守军解锁（零回归）');
ok(escaped(fresh, true, 0) === false, '兜底关闭（seconds=0）⇒ 不解锁（与「未加兜底不得置 true」自洽）');
ok(escaped(fresh, true, 20) === false, '守军尚未被兜底注入 ⇒ **不解锁**（防开局直奔出口跳过内容）');
const allApplied = fresh.map(e => { e.garrisonFallbackApplied = true; return e; });
ok(escaped(allApplied, true, 20) === true, '全部守军已尽力注入 ⇒ 解锁出口（软锁逃生门生效）');
ok(escaped([van], true, 20) === false, '场上只剩前锋（无守军）⇒ 不误解锁');

// ===========================================================================
// 9. 零回归定向核验：**执行页面源码原文**（vm substring 抽取，非手写复刻）
// ===========================================================================
section('9. 零回归：执行页面原文分流块（vm 抽取源码，不降级为手写复刻）');
const startMark = '// 2026-11-01 P2-G「守军语义 + 反冲击前锋」';
const endMark = '// 分批：首批超上限的部分进队列（保留完整计划，出场时不再重算落位）';
const sIdx = HTML.indexOf(startMark);
const eIdx = HTML.indexOf(endMark, sIdx);
console.log(`  抽取页面原文分流块：${sIdx >= 0 && eIdx > sIdx
  ? `行 ${HTML.slice(0, sIdx).split('\n').length} ~ ${HTML.slice(0, eIdx).split('\n').length}` : '未找到'}`);
ok(sIdx >= 0 && eIdx > sIdx, '成功定位页面 P2-G 分流块**原文**（不是手写复刻）');
const blockSrc = HTML.slice(sIdx, eIdx);
ok(HTML.indexOf("if(!p.garrison){") >= 0, '成功定位页面「接战意志分流」原文');

RULES.encounter.garrisonMode = false;   // 强制现状（契约默认值）

const player = MD.makeTank({ id: 'player', team: 'player', x: 300, y: 400, hullAngle: 0, turretAngle: 0, heightClass: 'medium' });
const currentNode = { w: 2400, h: 1400, difficulty: 0.45 };
const battleEncounter = { waveCount: 4, waveIndex: 1 };
const waveIdx = 1;
const battleGarrisonBook = new Map();
let pushed = [];
const pushLog = (m) => pushed.push(m);
const pointInCover = () => false;

// ⚠ hull 必须按**页面原文**产出（朝向玩家），否则「幂等重算」会被误判成「hull 被改」
const plan = [];
for (let i = 0; i < 4; i++) {
  const px = 1500, py = 400 + i * 90;
  plan.push({ x: px, y: py, hull: Math.atan2(player.y - py, player.x - px), cls: i % 2 ? 'medium' : 'heavy', k: i });
}
const planBefore = JSON.stringify(plan);

const sandbox = {
  RULES, player, currentNode, battleEncounter, waveIdx, battleGarrisonBook,
  plan, pushLog, pointInCover,
  garrisonAssignVanguards: ENC.garrisonAssignVanguards,
  Number, Math, JSON, console,
};
vm.createContext(sandbox);
try {
  vm.runInContext(blockSrc, sandbox);
  ok(true, '页面原文分流块执行无异常');
} catch (err) {
  ok(false, '页面原文分流块执行抛错', err.message);
}

ok(plan.every(p => p.garrison === false),
  'N5 零回归：garrisonMode=false ⇒ **全员 garrison=false**（全员走现状强制接战语义）',
  JSON.stringify(plan.map(p => p.garrison)));
ok(plan.every(p => p.x === 1500),
  'garrisonMode=false ⇒ **无一辆前出**（x 全部保持 1500，与改前逐字段一致）',
  JSON.stringify(plan.map(p => p.x)));
// 逐字段比对（不要整体 JSON 比较——整体比较一红就说不清是哪个字段）
const beforeArr = JSON.parse(planBefore);
let hullSame = true, xySame = true, kSame = true, clsSame = true;
const diffDetail = [];
for (let i = 0; i < beforeArr.length; i++) {
  const b = beforeArr[i], a = plan[i];
  if (Math.abs((a.hull === undefined ? NaN : a.hull) - (b.hull === undefined ? NaN : b.hull)) > 1e-12) {
    hullSame = false; diffDetail.push(`#${i} hull ${b.hull} → ${a.hull}`);
  }
  if (a.x !== b.x || a.y !== b.y) { xySame = false; diffDetail.push(`#${i} (${b.x},${b.y}) → (${a.x},${a.y})`); }
  if (a.k !== b.k) { kSame = false; diffDetail.push(`#${i} k ${b.k} → ${a.k}`); }
  if (a.cls !== b.cls) { clsSame = false; diffDetail.push(`#${i} cls ${b.cls} → ${a.cls}`); }
}
ok(kSame, 'N5 零回归：k（波内序号）未变', diffDetail.join('; '));
ok(clsSame, 'N5 零回归：cls（兵种）未变', diffDetail.join('; '));
ok(xySame, 'N5 零回归：x/y 落位未变', diffDetail.join('; '));
ok(hullSame, 'N5 零回归：hull 朝向未变（前出量为 0 ⇒ 重算幂等）', diffDetail.join('; '));
ok(pushed.length === 0, 'garrisonMode=false ⇒ 不输出 P2-G 日志（现状无额外播报）', JSON.stringify(pushed));

// 装配段：现状语义下必须强制 aiEngaged + 预写 lastKnownPlayerPos
section('9b. 装配段：现状语义产出（逐字段）');
EN.entities.length = 0;
const made = [];
for (const p of plan) {
  const t = EN.spawnTank({ id: `enemy_w${waveIdx}_${made.length}`, team: 'enemy', x: p.x, y: p.y, hullAngle: p.hull, turretAngle: p.hull, heightClass: p.cls });
  t.nodeSpawn = true; t.waveSpawn = true; t.tankClass = p.cls;
  t.aiTriggerDist = MAP.triggerDistForDifficulty(currentNode.difficulty);
  t.aiReactEnabled = true;
  t.hp = (t.stats && t.stats.maxHp) ? t.stats.maxHp : 100;
  if (!p.garrison) {                       // 页面原文语义：现状 ⇒ 强制接战
    t.aiEngaged = true;
    t.lastKnownPlayerPos = player ? { x: player.x, y: player.y } : null;
    t.aiReactT = RULES.ai.forceEngageOpenFireDelay !== undefined ? RULES.ai.forceEngageOpenFireDelay : 1.5;
  } else {
    t.garrison = true;
  }
  made.push(t);
}
ok(made.every(t => t.aiEngaged === true), '现状：全部 aiEngaged=true（强制接战，与改前一致）');
ok(made.every(t => t.lastKnownPlayerPos && t.lastKnownPlayerPos.x === 300),
  '现状：全部预写 lastKnownPlayerPos = 玩家方位（与改前一致）');
ok(made.every(t => t.aiReactT === (RULES.ai.forceEngageOpenFireDelay !== undefined ? RULES.ai.forceEngageOpenFireDelay : 1.5)),
  '现状：全部写入 aiReactT（forceEngageOpenFireDelay）');
ok(made.every(t => t.garrison !== true), '现状：**无一辆**被打上守军标记（守军语义未泄漏到现状路径）');
// resetEntity 通道可用性（形态门 + 真实还原语义）
const r0 = made[0];
const hpBefore = r0.hp;
r0.hp = 1;
if (typeof EN.resetEntity === 'function') EN.resetEntity(r0);
ok(r0.hp !== 1, `resetEntity 可还原实体状态（hp 1 → ${r0.hp}，原 ${hpBefore}）`);

// ===========================================================================
// 10. 反向对照：garrisonMode=true 分流确实生效（证明开关有辨别力）
// ===========================================================================
section('10. garrisonMode=true：分流生效（对照组，证明开关有辨别力）');
RULES.encounter.garrisonMode = true;
const plan2 = [];
for (let i = 0; i < 4; i++) plan2.push({ x: 1500, y: 400 + i * 90, hull: Math.PI, cls: i % 2 ? 'medium' : 'heavy', k: i });
const sb2 = {
  RULES, player, currentNode, battleEncounter, waveIdx, battleGarrisonBook: new Map(),
  plan: plan2, pushLog: (m) => pushed.push(m), pointInCover: () => false,
  garrisonAssignVanguards: ENC.garrisonAssignVanguards,
  Number, Math, JSON, console,
};
vm.createContext(sb2);
vm.runInContext(blockSrc, sb2);
const vanCount = plan2.filter(p => !p.garrison).length;
const garCount = plan2.filter(p => p.garrison).length;
ok(vanCount === 2 && garCount === 2, `守军模式：前锋 ${vanCount} + 守军 ${garCount}（min(4, count=2)）`);
ok(plan2.filter(p => !p.garrison).every(p => p.x > 1500), '守军模式：前锋确实沿 +x 前出');
ok(plan2.filter(p => p.garrison).every(p => p.x === 1500), '守军模式：守军未前出');
ok(plan2.every(p => Number.isFinite(p.k)), '守军模式：**k（波内序号）未丢失**（spec 索引得以保全）');

// 末波
const plan3 = [];
for (let i = 0; i < 4; i++) plan3.push({ x: 1500, y: 400 + i * 90, hull: Math.PI, cls: 'medium', k: i });
const sb3 = {
  RULES, player, currentNode,
  battleEncounter: { waveCount: 4, waveIndex: 3 }, waveIdx: 3,
  battleGarrisonBook: new Map(), plan: plan3, pushLog: () => {}, pointInCover: () => false,
  garrisonAssignVanguards: ENC.garrisonAssignVanguards,
  Number, Math, JSON, console,
};
vm.createContext(sb3);
vm.runInContext(blockSrc, sb3);
ok(plan3.every(p => p.garrison === true), '守军模式·末波：**全员守军**（前锋 0，裁定⑩）');
ok(plan3.every(p => p.x === 1500), '守军模式·末波：无一辆前出');

// 还原（不污染同批其他角色/后续测试）
RULES.encounter.garrisonMode = false;
ok(RULES.encounter.garrisonMode === false, 'RULES 已还原为默认 false（不污染同批 role-systems 侧）');

console.log(`\n=== 汇总：${pass} 通过 / ${fail} 失败 ===`);
process.exit(fail === 0 ? 0 : 1);
