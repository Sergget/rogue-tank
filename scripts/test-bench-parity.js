// test-bench-parity.js — bench ↔ 正式游戏 开火接线一致性回归（#AA2 段 + #AA3 段）。
// 原则（docs/PLAN.md §6.4）：bench 是**测量仪**，不允许有独立机制口径——同一张卡在两页行为必须一致。
// 依据（docs/ISSUES.md #AA3）：接线缺失经 `typeof x === 'function'` 守卫后会把「拿不到」伪装成
//   「已关闭」，正是这类漂移四轮无人发现的原因 ⇒ 必须用**键集形状 + 负向断言**锁住，而不是只测「能用」。
//
// 段①（AA-a，2026-10-26）：fireCtx 注入 aimPoint（曲射落点，#AA2）。
// 段②（AA-b，2026-10-26）：battle 键集 ⊆ bench 键集 + 7 项驱动接线 + F 原生边沿 + 曲射散布圈（#AA3）。
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

// ---------- 键集提取：`fireCtx = {` → 匹配的 `}`，只收 4 空格缩进的顶层键 ----------
function fireCtxKeys(src, decl){
  const i = src.indexOf(decl);
  if(i < 0) return null;
  const start = src.indexOf('{', i);
  let depth = 0, end = -1;
  for(let k = start; k < src.length; k++){
    const ch = src[k];
    if(ch === '{') depth++;
    else if(ch === '}'){
      depth--;
      if(depth === 0){ end = k; break; }
    }
  }
  if(end < 0) return null;
  return src.slice(start, end).split('\n')
    .filter(line => !/^\s*\/\//.test(line))
    .map(line => (/^ {4}([A-Za-z_$][\w$]*)\s*[,:]/.exec(line) || [])[1])
    .filter(Boolean);
}

const battleKeys = fireCtxKeys(battle, 'fireCtx = {');
const benchKeys = fireCtxKeys(bench, 'fireCtx = {');
ok(!!battleKeys && battleKeys.length > 30, `解析出 battle fireCtx 键（${battleKeys ? battleKeys.length : 0} 个）`);
ok(!!benchKeys && benchKeys.length > 30, `解析出 bench fireCtx 键（${benchKeys ? benchKeys.length : 0} 个）`);
const missing = (battleKeys || []).filter(k => !(benchKeys || []).includes(k));
ok(missing.length === 0, `battle fireCtx 键集 ⊆ bench 键集（缺：${missing.join(',') || '无'}）`);

// ---------- 段①：曲射落点契约（#AA2） ----------
ok(/c\.aimPoint/.test(fire), 'js/tank_fire.js 仍消费 ctx.aimPoint（曲射落点契约存在）');
ok(/aimPoint:\s*mouseWorld/.test(battle), 'tank_battle.html 注入 aimPoint: mouseWorld（基准口径）');
ok(/aimPoint:\s*mouseWorld/.test(bench), 'bench fireCtx 注入 aimPoint: mouseWorld（#AA2）');
ok(!/aimPointFrozen/.test(bench.replace(/\/\/[^\n]*/g, '')), '负向：bench 不得伪造 aimPointFrozen');

// ---------- 段②：7 项驱动接线（#AA3） ----------
ok(/cam,\s*\n\s*RULES,/.test(bench), 'bench fireCtx 注入 cam（导弹锁定按视口放宽）');
ok(/emitShotNoise:\s*function\(\)\{\s*return 0;\s*\}/.test(bench),
   'bench fireCtx 注入 emitShotNoise no-op（保持键集形状，不靠 typeof 守卫静默降级）');
ok(/resolveHit:\s*function\(s, target, hit, allowBounce, optsIn\)/.test(bench),
   'bench fireCtx 的 resolveHit 是 **5 参透传**包装（第 5 参 opts 不许丢）');
ok(/isWeakspotHit/.test(bench) && /moduleFromHit/.test(bench),
   'bench resolveHit 包装带 Boss 弱点层（与 battle 同源能力）');

ok(/if\(player\._howitzerBurst && typeof updateHowitzerBurst === 'function'\)/.test(bench),
   '急速射队列按 _howitzerBurst 门控驱动');
ok(/updateHowitzerBurst\(player, dt, fireCtx\)/.test(bench), 'updateHowitzerBurst 传参形状与 battle 一致');
ok(/player\._doubleTap\) updatePrimaryFollowup\(player, dt, fireCtx\)/.test(bench),
   '砰砰炮追发按 _doubleTap 门控驱动且传参同 battle');
ok(/updateDrones\(dt, \{ player, entities \}\)/.test(bench), '无人机按 battle 同形状驱动 updateDrones');
ok(/updateDeployables\(dt, \{ entities \}\)/.test(bench), '部署物驱动（炮塔索敌/地雷触发）仍在');
ok(/updateMissileLock\(player, dt, fireCtx\)/.test(bench), '导弹锁定逐帧驱动仍在');

// ---------- 段②-b：F 键原生边沿（开关类副武器） ----------
const guardCount = (bench.match(/if\(force !== true\) return;/g) || []).length;
ok(guardCount >= 3, `开关类副武器三类都有边沿守卫（force !== true return × ${guardCount} ≥ 3）`);
ok(/sec\.type === 'missile'[\s\S]{0,80}if\(force !== true\) return;/.test(bench), 'missile 只认边沿');
ok(/sec\.type === 'mine_layer'[\s\S]{0,120}if\(force !== true\) return;/.test(bench), 'mine_layer 只认边沿');
ok(/sec\.type === 'howitzer'[\s\S]{0,80}if\(force !== true\) return;/.test(bench), 'howitzer 只认边沿（#X5）');
ok(/addEventListener\('keydown', \(e\) => \{[\s\S]{0,400}e\.repeat/.test(bench),
   'bench 有原生 keydown 边沿监听且过滤 e.repeat（与 battle #F7 同口径）');
ok(/KEY_BINDINGS\.fireSecondary/.test(bench), '边沿监听从共享键位表取 fireSecondary（不写死 "f"）');
ok(/\^\(input\|textarea\|select\)\$/.test(bench), '边沿监听在输入框聚焦时不响应（卡牌搜索框打字不会开火）');
// 负向（2026-10-26 当日缺陷）：**不得**用 devPanel 开合当门控——面板持久化开着时会把 F 整条链路吞掉，
// 症状是「装好副武器按 F 没反应」，实测由用户报回。唯一合法门控是输入框焦点。
const fListener = (bench.match(/window\.addEventListener\('keydown', \(e\) => \{[\s\S]*?\n\}\);/) || [''])[0];
ok(!/benchPanelOpen/.test(fListener), '负向：F 边沿监听不得以 devPanel 开合为门控');
ok(/if\(input\.isDown\('fireSecondary'\)\) tryBenchSecondaryFire\(\);/.test(bench),
   '帧轮询通道保留给连续击发类（开关类由 force 守卫拦下）');

// ---------- 段②-c：曲射散布圈（瞄准语义可见） ----------
ok(/sigmaSpread/.test(bench), 'bench 绘制曲射散布圈（落点可见）');
ok(/spreadFactor/.test(bench), '散布圈走 spreadFactor 唯一口径');
ok(!/sigmaSpread\s*=[^;]*\*\s*4(\.0)?\s*;/.test(bench), '负向：不得把 spreadFactor 写死成 4');

console.log('test-bench-parity: 完成所有检查');
if(fails === 0) console.log('test-bench-parity: 全部通过');
else console.error(`test-bench-parity: ${fails} 项失败`);
process.exit(fails === 0 ? 0 : 1);
