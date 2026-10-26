// test-bench-parity.js — bench ↔ 正式游戏 开火接线一致性回归。
// 原则（docs/PLAN.md §6.4）：bench 是**测量仪**，不允许有独立机制口径——同一张卡在两页行为必须一致。
// 依据（docs/ISSUES.md #AA3）：接线缺失经 `typeof x === 'function'` 守卫后会把「拿不到」伪装成
//   「已关闭」，正是这类漂移四轮无人发现的原因 ⇒ 必须用形状 + 负向断言锁住，而不是只测「能用」。
//
// 现有段（AA-a，2026-10-26）：#AA2 —— fireCtx 必须注入 aimPoint（曲射落点优先级
//   aimPointFrozen → ctx.aimPoint → minArcRange 兜底，见 js/tank_fire.js:349-363）。
// 待补段（AA-b，见 docs/PLAN.md §6.4）：cam / updateHowitzerBurst / updatePrimaryFollowup /
//   updateDrones / resolveHit 包装 / emitShotNoise / F 键边沿 / 曲射散布圈。
//
// 运行：node scripts/test-bench-parity.js
'use strict';

const fs = require('fs');
const path = require('path');
const U = require('../js/tank_utils.js');
const R = require('../js/tank_rules.js');
global.TAU = U.TAU;
global.RULES = R.RULES;

let fails = 0;
function ok(cond, label){
  if(cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}`); fails++; }
}

const root = path.join(__dirname, '..');
const bench = fs.readFileSync(path.join(root, 'tank_bench.html'), 'utf8');
const battle = fs.readFileSync(path.join(root, 'tank_battle.html'), 'utf8');
const fire = fs.readFileSync(path.join(root, 'js', 'tank_fire.js'), 'utf8');

// 共享层就位（QA 约定：每个测试脚本必须加载 tank_utils / tank_rules 并读同一个 RULES）
ok(typeof U.rotate === 'function' && !!(R.RULES && R.RULES.nodeMap),
   '共享层已加载（tank_utils + tank_rules）');

// 契约本身：曲射瞄准点真的读 ctx.aimPoint（若这条没了，下面的接线断言就失去意义）
ok(/c\.aimPoint/.test(fire), 'js/tank_fire.js 仍消费 ctx.aimPoint（曲射落点契约存在）');

// battle 侧（基准实现）
ok(/aimPoint:\s*mouseWorld/.test(battle), 'tank_battle.html 注入 aimPoint: mouseWorld（基准口径）');

// bench 侧（本批修的是这里）
const m = bench.match(/fireCtx = \{[\s\S]*?\n  \};/);
ok(!!m, 'tank_bench.html 找到 fireCtx 字面量');
if(m){
  // 剥掉 `//` 注释行再断言：注释可以解释历史（含键名），代码里出现才是问题。
  const code = m[0].split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
  ok(/aimPoint:\s*mouseWorld/.test(code), 'bench fireCtx 注入 aimPoint: mouseWorld（#AA2）');
  ok(/\bmouseWorld\b/.test(code), 'bench fireCtx 保留 mouseWorld（散布/瞄准另有消费方）');
  // 负向：不许用「冻结快照」冒充实时瞄准点——aimPointFrozen 只由 updateHowitzerBurst 注入
  ok(!/aimPointFrozen/.test(code), 'bench fireCtx 不得伪造 aimPointFrozen（该键只由急速射驱动提供）');
  // 负向：不许把落点写死成局部位移（旧兜底的症状就是「恒在炮口前 ≈50px」）
  ok(!/aimPoint:\s*\{/.test(code), 'bench fireCtx 的 aimPoint 不是字面量常量/偏移对象');
}

process.exitCode = fails ? 1 : 0;
if(fails) console.error(`\n${fails} 项失败`);
else console.log('\n全部通过');
