// @ts-nocheck
'use strict';
// scripts/test-rework-w5.js — W5 卡牌/修饰通道运行时参数硬限（2026-09-15 用户裁定）
// 断言目标：
//   1. 卡牌级加速装填修饰无法突破 reload 下限 0.5s（add/mult 聚合后计算）；
//   2. 卡牌级超速修饰无法突破 maxSpeed 上限 375px/s（150km/h）；
//   3. 无修饰器（出厂 base 直写 / extreme 极值）不钳——纯计算语义保留；
//   4. 移除修饰器后可回落（钳制是最终生效值，不是 base 直写污染）。
// 运行：node scripts/test-rework-w5.js

const U = require('../js/tank_utils.js');
global.TAU = U.TAU; global.norm = U.norm; global.rotate = U.rotate; global.angDiff = U.angDiff;
global.segRayIntersect = U.segRayIntersect; global.partCorners = U.partCorners; global.partEdges = U.partEdges;
global.reflectDir = U.reflectDir; global.distToSegment = U.distToSegment; global.gaussian = U.gaussian;
const RULES_MOD = require('../js/tank_rules.js');
global.RULES = RULES_MOD.RULES;
const M = require('../js/tank_model.js');

let fails = 0;
function ok(cond, label) {
  if (cond) { console.log('\u2713 ' + label); }
  else { fails++; console.error('\u2717 ' + label); }
}

const RL = RULES_MOD.RULES.parameterLimits.reload;       // { min: 0.5 }
const MS = RULES_MOD.RULES.parameterLimits.maxSpeed;     // { max: 375 }

// === 1) 加速装填卡牌聚合无法突破 reload 下限 ===
{
  const t = M.makeTank({ team:'player' });
  const initReload = t.stats.reload;                     // 默认 1.3（> 0.5）
  ok(initReload > RL.min, `初始 reload=${initReload} 未触下限`);
  // 模拟多张加速装填卡叠加：add −0.7（超装填改造）+ mult ×0.8（速射弹架）→ 1.3×0.8−0.7=0.34
  M.addModifier(t, { stat:'reload', mode:'add', value: -0.7, source:'card:fast1', scope:'run' });
  M.addModifier(t, { stat:'reload', mode:'mult', value: 0.8, source:'card:fast2', scope:'run' });
  ok(t.stats.reload === RL.min, `装填下限强制生效：聚合后钳至 0.5s（got ${t.stats.reload}）`);
  M.removeRunModifiers(t);
  ok(Math.abs(t.stats.reload - initReload) < 1e-9, `移除卡牌修饰后 reload 回落基准 ${initReload}`);
}

// === 2) 超速卡牌无法突破 maxSpeed 上限 ===
{
  const t = M.makeTank({ team:'player' });
  const initSpeed = t.stats.maxSpeed;                    // 120
  ok(initSpeed < MS.max, `初始 maxSpeed=${initSpeed} < 上限 ${MS.max}`);
  M.addModifier(t, { stat:'maxSpeed', mode:'add', value: 260, source:'card:overdrive1', scope:'run' });   // 120+260=380
  M.addModifier(t, { stat:'maxSpeed', mode:'mult', value: 1.1, source:'card:overdrive2', scope:'run' });  // 380×1.1=418
  ok(t.stats.maxSpeed === MS.max, `极速上限强制生效：聚合后钳至 ${MS.max}px/s（got ${t.stats.maxSpeed}）`);
  M.removeRunModifiers(t);
  ok(Math.abs(t.stats.maxSpeed - initSpeed) < 1e-9, `移除卡牌修饰后 maxSpeed 回落基准 ${initSpeed}`);
}

// === 3) 无修饰器（出厂 base / 纯计算）不钳——extreme 语义保留 ===
{
  const s = M.computeStats({ maxSpeed: 1e6, reload: 1e6, damage: 34, penetration: 120, maxHp: 100,
    turnRate: 2, turretTurnRate: 2, shellSpeed: 1200, enginePower: 900, weight: 300,
    armor:{ hull:{front:110,side:38,rear:26}, turret:{front:140,side:50,rear:24} } }, []);
  ok(s.maxSpeed === 1e6 && s.reload === 1e6, `无修饰器极值原样保留（1e6/1e6，W5 不钳空修饰器）`);
}

// === 4) 达到或未达上限的修饰不被误钳 ===
{
  const t = M.makeTank({ team:'player' });
  M.addModifier(t, { stat:'reload', mode:'mult', value: 0.9, source:'card:mild', scope:'run' });   // 1.3×0.9=1.17
  ok(Math.abs(t.stats.reload - 1.17) < 1e-9, `温和加速（1.17s）不触下限，原样生效（got ${t.stats.reload}）`);
}

// === 5) #C2（2026-09-17）：纯 timed 修饰器（超装填等能力爆发通道）不受参数硬限 ===
{
  const t = M.makeTank({ team:'player' });
  const initReload = t.stats.reload;
  M.addTimedModifier(t, { stat:'reload', mode:'mult', value: 0.45, source:'ability:overdrive' }, 6000);
  ok(Math.abs(t.stats.reload - initReload * 0.45) < 1e-9,
    `timed ×0.45 不被 1.0s 下限钳制（got ${t.stats.reload}，期望 ${initReload * 0.45}）——实际开火间隔可继续 <1s`);
  // 混合通道：run 参数修饰存在时仍钳（timed 不豁免参数通道）
  const t2 = M.makeTank({ team:'player' });
  M.addModifier(t2, { stat:'reload', mode:'mult', value: 0.4, source:'card:fast', scope:'run' });
  M.addTimedModifier(t2, { stat:'reload', mode:'mult', value: 0.45, source:'ability:overdrive' }, 6000);
  ok(t2.stats.reload === RL.min, `run+timed 混合 → 参数通道硬限仍生效（钳至 ${RL.min}s）`);
  M.removeRunModifiers(t2);
  ok(Math.abs(t2.stats.reload - initReload * 0.45) < 1e-9, '移除 run 修饰后回落 timed 聚合值（0.45×，不钳）');
}

if (fails > 0) {
  console.error(`\n${fails} FAILED`);
  process.exit(1);
}
console.log('\nAll W5 parameter-limit checks passed.');