// test-perf.js — 性能层纯逻辑回归。
// ① R0（2026-10-27）性能采样：summarizeMs 分位/边界、环形缓冲容量与回绕、reset、
//   非法输入（NaN/负数/缺失）按 0 计不污染统计。
// ② G1（2026-10-28）性能预算与降级 governor：稳定帧不降、持续超预算逐级降 + deck 封顶、
//   富余逐级回升不跳档、抖动抑制、minTierHoldSeconds 锁定、异常 dt 忽略、参数消费哨兵、
//   三档单调性与契约字段（见文件下半段 ⑨~⑰）。
// 运行：node scripts/test-perf.js
'use strict';

const U = require('../js/tank_utils.js');
const R = require('../js/tank_rules.js');
global.TAU = U.TAU;
global.RULES = R.RULES;
const P = require('../js/tank_perf.js');

let fails = 0;
function ok(cond, label){
  if(cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}`); fails++; }
}

// ① 空样本
{
  const s = P.summarizeMs(new Float64Array(0), 0);
  ok(s.count === 0 && s.p50 === 0 && s.max === 0 && s.mean === 0, '空样本全 0，不产生 NaN');
  const s2 = P.summarizeMs(null, 5);
  ok(s2.count === 0, 'values 缺失时按 0 样本处理');
}

// ② 已知分布：1..100 的 p50/p95/max/mean
{
  const arr = new Float64Array(100);
  for (let i = 0; i < 100; i++) arr[i] = i + 1;
  const s = P.summarizeMs(arr, 100);
  ok(s.p50 === 50, `p50=${s.p50}（期望 50）`);
  ok(s.p95 === 95, `p95=${s.p95}（期望 95）`);
  ok(s.max === 100 && s.mean === 50.5, `max=${s.max} mean=${s.mean}`);
}

// ③ 只统计前 count 个有效槽位
{
  const arr = new Float64Array([1, 2, 3, 999, 999]);
  const s = P.summarizeMs(arr, 3);
  ok(s.count === 3 && s.max === 3, '尾部未使用槽位不参与统计');
}

// ④ 非法值按 0：NaN / 负数 / undefined
{
  const arr = new Float64Array([2, NaN, -5, 4]);
  const s = P.summarizeMs(arr, 4);
  ok(s.count === 4 && s.max === 4 && s.mean === 1.5,
     `非法值归零（max=${s.max} mean=${s.mean}）`);
}

// ⑤ 环形缓冲：容量与回绕只保留最近 N 帧
{
  const ring = P.createPerfRing(4);
  for (let i = 0; i < 10; i++) ring.frame(i, i * 10);
  const s = ring.stats();
  ok(s.frames === 4, `frames=${s.frames}（期望 4）`);
  ok(s.update.max === 9 && s.update.p50 === 7, `回绕后保留最近 4 帧（update max=${s.update.max} p50=${s.update.p50}）`);
  ok(s.draw.max === 90, `draw 通道独立（max=${s.draw.max}）`);
}

// ⑥ reset 清空
{
  const ring = P.createPerfRing(8);
  ring.frame(5, 6);
  ring.reset();
  const s = ring.stats();
  ok(s.frames === 0 && s.update.count === 0, 'reset 后无样本');
}

// ⑦ 非法耗时不得进入统计
{
  const ring = P.createPerfRing(3);
  ring.frame(NaN, -1);
  ring.frame(2, 3);
  const s = ring.stats();
  ok(s.frames === 2 && s.update.max === 2 && s.draw.max === 3, 'NaN/负数耗时按 0 计');
}

// ⑧ 容量钳制：0 / 负数 / 缺失都至少 1
{
  ok(P.createPerfRing(0).capacity === 1, 'capacity=0 → 1');
  ok(P.createPerfRing(-9).capacity === 1, 'capacity=-9 → 1');
  ok(P.createPerfRing().capacity === 240, '缺省 capacity=240');
}

// ============================================================================
// G1 性能预算与自适应降级（2026-10-28）
//   ⑨ 稳定 16ms 不降级   ⑩ 持续 30ms 逐级降 + deck 封顶   ⑪ 回升逐级（不跳档）
//   ⑫ 抖动抑制           ⑬ minTierHoldSeconds 生效        ⑭ 异常 dt 被忽略
//   ⑮ 哨兵（dropAboveMs 被真实消费）  ⑯ 三档单调性 + 契约形状/确定性/无随机/消费方
// ============================================================================

const PERF = R.RULES.perf;
/** 以固定帧时间推进 seconds 秒（帧数按毫秒精确取整，避免累积误差吃掉边界断言）。 */
function feed(gov, ms, seconds){
  const n = Math.round(seconds * 1000 / ms);
  for(let i = 0; i < n; i++) P.updateGovernor(gov, ms / 1000);
  return gov;
}
function snap(gov){
  return { tier: gov.tier, level: gov.level, emaMs: gov.emaMs, holdT: gov.holdT,
           dropT: gov.dropT, raiseT: gov.raiseT, changes: gov.changes };
}
function eqSnap(a, b){
  return a.tier === b.tier && a.level === b.level && a.emaMs === b.emaMs &&
         a.holdT === b.holdT && a.dropT === b.dropT && a.raiseT === b.raiseT && a.changes === b.changes;
}

// ⑨ 稳定 16ms（60fps 附近）→ 长时间不降级
{
  const gov = P.createGovernor({ rules: R.RULES });
  feed(gov, 16, 120);                       // 120s = 7500 帧
  ok(gov.tier === 'high' && gov.level === 0, `稳定 16ms 120s 仍是 high（tier=${gov.tier} level=${gov.level}）`);
  ok(gov.changes === 0, `稳定 16ms 零升降（changes=${gov.changes}）`);
  ok(gov.emaMs > 15.9 && gov.emaMs < 16.1, `EMA 收敛到 16ms（emaMs=${gov.emaMs.toFixed(2)}）`);
}

// ⑩ 持续 30ms → dropAfterSeconds 后到 mid，再降 deck，deck 封顶不越界
{
  const gov = P.createGovernor({ rules: R.RULES });
  feed(gov, 30, 1.9);
  ok(gov.level === 0, `30ms 持续 1.9s 尚未降级（滞后未到，level=${gov.level}）`);
  feed(gov, 30, 0.3);                        // 累计 2.2s
  ok(gov.level === 1 && gov.tier === 'mid', `30ms 持续 >${PERF.dropAfterSeconds}s 降到 mid（level=${gov.level}）`);
  feed(gov, 30, 3.5);                        // 累计 5.7s（含 3s 锁定期）
  ok(gov.level === 2 && gov.tier === 'deck', `继续超预算降到 deck（level=${gov.level}）`);
  feed(gov, 30, 30);                         // 再跑 30s
  ok(gov.level === 2, `deck 封顶不越界（level=${gov.level}，TIER_ORDER 长度 3）`);
  ok(gov.changes === 2, `全程共 2 次降级、无回升（changes=${gov.changes}）`);
}

// ⑪ deck 后帧时间回到 10ms → raiseAfterSeconds 后**逐级**回升到 mid
{
  const gov = P.createGovernor({ rules: R.RULES, startTier: 'deck' });
  ok(gov.level === 2, 'startTier=deck 建档即 level 2');
  feed(gov, 10, 7.9);
  ok(gov.level === 2, `富余 7.9s 未达 raiseAfterSeconds=${PERF.raiseAfterSeconds}，仍 deck`);
  feed(gov, 10, 0.3);                        // 累计 8.2s
  ok(gov.level === 1 && gov.tier === 'mid', `富余 >${PERF.raiseAfterSeconds}s 回升到 mid（level=${gov.level}）`);
  feed(gov, 10, 7.0);                        // 累计 15.2s（第二次回升要重新攒满 8s）
  ok(gov.level === 1, `回升不跳档：15.2s 仍是 mid（level=${gov.level}）`);
  feed(gov, 10, 1.0);                        // 累计 16.2s
  ok(gov.level === 0 && gov.tier === 'high', `再攒满 8s 才回到 high（level=${gov.level}）`);
  ok(gov.changes === 2, `两次逐级回升（changes=${gov.changes}）`);
}

// ⑫ 抖动抑制：16ms / 30ms 逐帧交替（平均 ≈23ms，属真超预算而非抖动）
{
  const gov = P.createGovernor({ rules: R.RULES });
  let maxEma = 0;
  for(let i = 0; i < 188; i++)            // 188 帧 × 平均 23ms ≈ 4.3s
  {
    P.updateGovernor(gov, (i % 2 === 0 ? 16 : 30) / 1000);
    if(gov.emaMs > maxEma) maxEma = gov.emaMs;
  }
  ok(gov.changes <= 1, `逐帧交替 16/30 不反复抖（changes=${gov.changes} ≤ 1）`);
  ok(maxEma < 24.5, `单帧 30ms 尖峰只把 EMA 推到 ${maxEma.toFixed(2)}ms 而不是 30ms（α=${PERF.emaAlpha}）`);
}
{
  // 意图验证：同样数量的 30ms 尖峰，但**孤立**出现（每帧之间夹着大量 16ms）→ 一次都不降
  const gov = P.createGovernor({ rules: R.RULES });
  for(let i = 0; i < 600; i++) P.updateGovernor(gov, ((i % 120 === 60) ? 30 : 16) / 1000);
  ok(gov.changes === 0 && gov.level === 0, `孤立尖峰（每 120 帧一次 30ms）零降级（changes=${gov.changes}）`);
}

// ⑬ minTierHoldSeconds：升档后锁定期内不许立刻降回去（锁定期真正咬人的方向在这里）
{
  const gov = P.createGovernor({ rules: R.RULES, startTier: 'deck' });
  feed(gov, 10, 8.1);
  ok(gov.level === 1, `先升到 mid（level=${gov.level}）`);
  const holdAtRaise = gov.holdT;
  ok(holdAtRaise > PERF.minTierHoldSeconds - 0.2 && holdAtRaise <= PERF.minTierHoldSeconds,
     `升降后 holdT=${holdAtRaise.toFixed(2)}s（= minTierHoldSeconds，随帧递减）`);
  feed(gov, 30, 2.8);
  ok(gov.level === 1, `坏帧 2.8s（dropT 已满）仍被锁定期挡住（level=${gov.level}）`);
  feed(gov, 30, 0.5);
  ok(gov.level === 2, `锁定期一过（>${PERF.minTierHoldSeconds}s）立刻降回 deck（level=${gov.level}）`);
}
{
  // 题面口径：降级后立刻给富余帧，锁定期内不回升
  const gov = P.createGovernor({ rules: R.RULES });
  feed(gov, 30, 2.2);
  ok(gov.level === 1, `先降到 mid（level=${gov.level}）`);
  const before = gov.tier;
  feed(gov, 10, 1.0);
  ok(gov.tier === before && gov.level === 1, '降级后锁定期内给富余帧不回升');
}

// ⑭ 异常 dt（0 / -1 / NaN / 2.0）被忽略：EMA 与计时都不变
{
  const base = P.createGovernor({ rules: R.RULES });
  feed(base, 16, 0.5);
  const clean = P.createGovernor({ rules: R.RULES });
  feed(clean, 16, 0.5);
  const seq = [0, -1, NaN, 2.0, Infinity, -Infinity, undefined, null, '16', 16];
  for(const bad of seq){
    const before = snap(clean);
    // 故意传非法类型（字符串/undefined/null）——这正是要在运行时挡住的那类输入
    P.updateGovernor(clean, /** @type {any} */ (bad));
    if(!eqSnap(before, snap(clean))) { ok(false, `异常 dt=${String(bad)} 改动了 governor 状态`); }
  }
  ok(eqSnap(snap(base), snap(clean)),
     `一串异常帧（0/-1/NaN/2.0/±Inf/undefined/null/'16'/16）后状态与干净序列完全一致（emaMs=${clean.emaMs.toFixed(2)}）`);
  // 单独确认 2.0s（切后台回来）被忽略：否则 EMA 会瞬间被拉到 2000ms 量级
  const g2 = P.createGovernor({ rules: R.RULES });
  feed(g2, 16, 1.0);
  const e0 = g2.emaMs;
  P.updateGovernor(g2, 2.0);
  ok(g2.emaMs === e0, `2.0s（切后台回来）不污染 EMA（${e0.toFixed(2)} → ${g2.emaMs.toFixed(2)}）`);
}

// ⑮ 哨兵：dropAboveMs 改成 100 后 30ms 不再触发降级（证明参数被真实消费），finally 还原
{
  const saved = PERF.dropAboveMs;
  try{
    const g0 = P.createGovernor({ rules: R.RULES });
    feed(g0, 30, 10);
    ok(g0.level === 2, '哨兵前置：dropAboveMs=22 时 30ms 会一路降到 deck');
    PERF.dropAboveMs = 100;
    const g1 = P.createGovernor({ rules: R.RULES });
    feed(g1, 30, 10);
    ok(g1.level === 0 && g1.changes === 0, 'dropAboveMs=100 时 30ms 持续 10s 不降级（参数被真实消费）');
  } finally {
    PERF.dropAboveMs = saved;
  }
  ok(PERF.dropAboveMs === 22, `finally 已还原 dropAboveMs=${PERF.dropAboveMs}`);
}

// ⑯ getTierConfig：三档单调 + 契约字段
{
  const cfgHigh = P.getTierConfig(P.createGovernor({ rules: R.RULES, startTier: 'high' }), R.RULES);
  const cfgMid  = P.getTierConfig(P.createGovernor({ rules: R.RULES, startTier: 'mid' }), R.RULES);
  const cfgDeck = P.getTierConfig(P.createGovernor({ rules: R.RULES, startTier: 'deck' }), R.RULES);
  ok(cfgHigh.particleCap > cfgMid.particleCap && cfgMid.particleCap > cfgDeck.particleCap,
     `particleCap 三档严格递减（${cfgHigh.particleCap} > ${cfgMid.particleCap} > ${cfgDeck.particleCap}）`);
  ok(cfgHigh.resolutionScale > cfgMid.resolutionScale && cfgMid.resolutionScale > cfgDeck.resolutionScale,
     `resolutionScale 三档严格递减（${cfgHigh.resolutionScale} > ${cfgMid.resolutionScale} > ${cfgDeck.resolutionScale}）`);
  ok(cfgHigh.dustIntervalS < cfgMid.dustIntervalS && cfgMid.dustIntervalS < cfgDeck.dustIntervalS,
     `dustIntervalS 三档严格递增（扬尘越降越稀：${cfgHigh.dustIntervalS} < ${cfgMid.dustIntervalS} < ${cfgDeck.dustIntervalS}）`);
  ok(cfgHigh.maxShells > cfgMid.maxShells && cfgMid.maxShells > cfgDeck.maxShells,
     `maxShells 三档严格递减（${cfgHigh.maxShells} > ${cfgMid.maxShells} > ${cfgDeck.maxShells}）`);
  ok(cfgHigh.name === 'high' && cfgMid.name === 'mid' && cfgDeck.name === 'deck',
     'getTierConfig().name 与档位名一致');

  // staticRebuildIntervalS（静态几何重建节流）：存在 / 有限 / >0 / 随档位单调不减。
  //   单调「不减」而非「严格递增」：high 必须保留接线前的 0.25 原值，若哪天两档真取同值
  //   也不该报错——真正要防的是「越降越频繁」这种反直觉的档位表。
  const sri = [cfgHigh.staticRebuildIntervalS, cfgMid.staticRebuildIntervalS, cfgDeck.staticRebuildIntervalS];
  ok(sri.every(v => typeof v === 'number' && isFinite(v) && v > 0),
     `staticRebuildIntervalS 三档均为正的有限数（${sri.join(' / ')}）`);
  ok(sri[0] <= sri[1] && sri[1] <= sri[2],
     `staticRebuildIntervalS 随档位单调不减（high ${sri[0]} ≤ mid ${sri[1]} ≤ deck ${sri[2]}）`);
  ok(cfgHigh.staticRebuildIntervalS === 0.25,
     `high 档 staticRebuildIntervalS = 0.25（接线前的硬编码原值，不借降级偷偷改 high 的画质）`);

  const keys = Object.keys(cfgHigh).sort().join(',');
  ok(keys === 'dustIntervalS,maxShells,name,particleCap,resolutionScale,staticRebuildIntervalS',
     `getTierConfig 返回字段与契约一字不差（${keys}）`);

  // 哨兵：改 RULES 后立刻反映到返回值，证明这个键是从规则表**实时读数**而非写死在 getTierConfig 里
  const savedSRI = R.RULES.perf.tiers.deck.staticRebuildIntervalS;
  try{
    R.RULES.perf.tiers.deck.staticRebuildIntervalS = 0.11;
    const deckGov = P.createGovernor({ rules: R.RULES, startTier: 'deck' });
    const sentinel = P.getTierConfig(deckGov, R.RULES);
    ok(sentinel.staticRebuildIntervalS === 0.11,
       `哨兵：tiers.deck.staticRebuildIntervalS=0.11 后 getTierConfig 立刻返回 ${sentinel.staticRebuildIntervalS}`);
  } finally {
    R.RULES.perf.tiers.deck.staticRebuildIntervalS = savedSRI;
  }
  ok(R.RULES.perf.tiers.deck.staticRebuildIntervalS === 0.60,
     `finally 已还原 deck.staticRebuildIntervalS=${R.RULES.perf.tiers.deck.staticRebuildIntervalS}`);
}

// ⑰ gov 字段 / 返回值字段 / 确定性 / 无随机 / 消费方
{
  const gov = P.createGovernor({ rules: R.RULES });
  const fields = 'changes,dropT,emaMs,holdT,level,raiseT,tier';
  ok(Object.keys(gov).filter(k => k !== 'perf').sort().join(',') === fields,
     `gov 契约字段齐全且无多余枚举字段（${Object.keys(gov).sort().join(',')}）`);
  ok(gov.emaMs === null, 'gov.emaMs 首帧前为 null（区分「未采样」与「0ms」）');

  const r = P.updateGovernor(gov, 0.016);
  ok(Object.keys(r).sort().join(',') === 'changed,emaMs,level,tier',
     `updateGovernor 返回 { tier, changed, level, emaMs }（${Object.keys(r).sort().join(',')}）`);
  ok(r.changed === false && r.tier === 'high' && r.level === 0 && typeof r.emaMs === 'number',
     '首帧返回 changed=false / tier=high / level=0 / emaMs=帧时间');

  // 确定性：同一串帧时间两次建档结果必须逐字段相同
  const seq = [16, 30, 30, 18, 40, 12, 12, 12, 12, 55, 9, 9, 9];
  const a = P.createGovernor({ rules: R.RULES }), b = P.createGovernor({ rules: R.RULES });
  for(const ms of seq) P.updateGovernor(a, ms / 1000);
  for(const ms of seq) P.updateGovernor(b, ms / 1000);
  ok(eqSnap(snap(a), snap(b)), `同一帧时间序列两次播放结果完全一致（changes=${a.changes}）`);

  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'js', 'tank_perf.js'), 'utf8');
  const code = src.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, '');   // 去注释后再判（头注释里就写着「禁止 Math.random」）
  ok(!/Math\.random/.test(code), 'tank_perf.js 无 Math.random（本模块必须确定性）');
  for(const k of ['emaAlpha', 'dropAboveMs', 'raiseBelowMs', 'dropAfterSeconds', 'raiseAfterSeconds',
                  'minTierHoldSeconds', 'tiers']){
    ok(src.includes('perf.' + k) || src.includes(k + ']'), `RULES.perf.${k} 有消费方（非死配置）`);
  }
  // 红线：本模块不得触碰模拟/渲染状态（降级只能动表现，不能动模拟）
  ok(!/\bparticles\b|\bcanvas\b|drawScene|ctx\.|entities/.test(code),
     'tank_perf.js 不触碰 particles/canvas/renderer/entities（模拟层与渲染层都不归它管）');
}

process.exitCode = fails ? 1 : 0;
if(fails) console.error(`\n${fails} 项失败`);
else console.log('\n全部通过');
