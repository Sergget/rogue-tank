'use strict';
// P-49 派生重量测试：deriveWeight 四车校准（±25%）、weightLimitInfo 80t 边界、确定性。
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const U = require('../js/tank_utils.js');
global.TAU = U.TAU; global.norm = U.norm; global.rotate = U.rotate;
global.segRayIntersect = U.segRayIntersect; global.partCorners = U.partCorners;
global.partEdges = U.partEdges; global.reflectDir = U.reflectDir; global.distToSegment = U.distToSegment;
global.gaussian = U.gaussian; global.angDiff = U.angDiff;
global.RULES = require('../js/tank_rules.js').RULES;
global.normalizeBarrel = require('../js/tank_halfgeom.js').normalizeBarrel;
const model = require('../js/tank_model.js');

let pass = 0;
function ok(cond, msg){ if(!cond){ console.error('FAIL: ' + msg); process.exitCode = 1; } else { pass++; console.log('PASS: ' + msg); } }

// ---------- 1) 存量四车派生值校准 ----------
const ids = ['tiger-I', 'Obj 780', 'Leapard_1', 'dummy'];
const results = {};
for(const id of ids){
  const spec = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'tanks', id + '.json'), 'utf8'));
  const d = model.deriveWeight(spec);
  results[id] = { derived: d, stored: spec.weight };
  const dev = (d - spec.weight) / spec.weight;
  if(id === 'dummy'){
    // dummy 的存储 weight:300 是 legacy 占位尺度（makeTank 默认值），非物理吨位；
    // 其几何对应的物理重量应落在正常坦克区间（30~60t）——记录偏差，不参与 ±25% 校准断言。
    console.log(`[note] dummy: derived=${d.toFixed(2)}t stored=${spec.weight}(legacy) dev=${(dev*100).toFixed(1)}%（legacy 占位，豁免）`);
    ok(d > 30 && d < 60, `dummy 派生值落在物理合理区间（${d.toFixed(2)}t ∈ (30,60)）`);
  } else {
    ok(Math.abs(dev) <= 0.25, `${id}: derived=${d.toFixed(2)}t stored=${spec.weight}t 偏差 ${(dev*100).toFixed(1)}% ≤ ±25%`);
  }
}

// ---------- 2) 公式精确性（手工期望值，确定性验证） ----------
// 方形车体（无炮塔）：周长边 58(side)/38(rear)/58(side)/38(front)，厚度 f100/s50/r25
// px·mm = 58×50×2 + 38×25 + 38×100 = 10550 → 28 + 0.82×10550/1000 = 36.651
const sqSpec = {
  hull: { verts: [[29,-19],[-29,-19],[-29,19],[29,19]], faces: ['side','rear','side','front'],
          armor: { front: 100, side: 50, rear: 25 } }
};
ok(Math.abs(model.deriveWeight(sqSpec) - 36.651) < 1e-9,
   `公式精确性：方形车体派生 ${model.deriveWeight(sqSpec)} == 36.651`);

// ---------- 3) 确定性：同输入两次调用严格相等 ----------
ok(model.deriveWeight(sqSpec) === model.deriveWeight(JSON.parse(JSON.stringify(sqSpec))),
   '确定性：deriveWeight 同输入两次调用结果严格相等');

// ---------- 4) weightLimitInfo 80t 上限边界 ----------
const lim = RULES.parameterLimits.weight;
ok(lim.max === 80, `RULES.parameterLimits.weight.max == 80（当前 ${lim.max}）`);
// 均匀厚度 t 的方形车体：px·mm = 192×t；derived = 28 + 0.82×192×t/1000
// t=330 → 79.95t（≤80 ok）；t=331 → 80.11t（>80 越界）
function uniThickSpec(t){
  return { hull: { verts: [[29,-19],[-29,-19],[-29,19],[29,19]], faces: ['side','rear','side','front'],
                   armor: { front: t, side: t, rear: t } } };
}
const under = model.weightLimitInfo(uniThickSpec(330));
const over  = model.weightLimitInfo(uniThickSpec(331));
console.log(`  t=330 → ${under.derived.toFixed(3)}t | t=331 → ${over.derived.toFixed(3)}t`);
ok(under.derived <= 80 && under.ok === true,  `边界内：${under.derived.toFixed(3)}t ≤ 80 → ok=true`);
ok(over.derived  >  80 && over.ok  === false, `越界：${over.derived.toFixed(3)}t > 80 → ok=false`);
ok(under.clamped === under.derived, '区间内 clamped == derived');
ok(over.clamped === 80, `超上限 clamped 钳到 80（${over.clamped}）`);
// 下限边界：空 spec 只剩底盘基数 28t？不，基数 28 ≥ min10。构造低于下限需 min>28 —— 当前 min=10，
// 底盘基数恒 ≥ 28，故下限永不触发（记录为已知行为），仅验证返回结构。
ok(model.weightLimitInfo(null).derived === model.DERIVE_WEIGHT_BASE_T, 'null spec 回退底盘基数');

// ---------- 5) computeStats：legacy 默认 weight 300 被运行时上限钳到 240 ----------
// （makeTank 默认 weight:300 是 legacy 占位尺度、非物理吨位；2026-08-26 起受 RULES.weightRuntimeCap=240 钳制）
const t = model.makeTank({ team: 'player' });
ok(t.base.weight === 300 && t.stats.weight === 240,
   `legacy 默认钳制：base.weight=300（不变）→ stats.weight=${t.stats.weight}（≤ weightRuntimeCap 240）`);

// ---------- 6) 运行时重量硬上限（2026-08-26 用户裁定）----------
// 80t 仅设计器出厂上限；卡牌/升级 modifier 可突破，但 computeStats 最终值钳 ≤ RULES.weightRuntimeCap(240)。
ok(RULES.weightRuntimeCap === 240, `RULES.weightRuntimeCap == 240（当前 ${RULES.weightRuntimeCap}）`);
// 超限：modifier 推到 >240 → 被钳到 240
const overCap = model.computeStats({ weight: 100 }, [{ stat: 'weight', mode: 'mult', value: 3 }]); // 300
ok(overCap.weight === 240, `超运行时上限被钳：100×3=300 → stats.weight=${overCap.weight} == 240`);
// 区间放行：80~240 之间不钳（80 恰好是设计上限但运行时不约束）
const inBand = model.computeStats({ weight: 60 }, [{ stat: 'weight', mode: 'mult', value: 2 }]);   // 120
ok(inBand.weight === 120, `80~240 区间放行：60×2=120 → stats.weight=${inBand.weight} 不变`);
const atDesign = model.computeStats({ weight: 40 }, [{ stat: 'weight', mode: 'mult', value: 2 }]); // 80
ok(atDesign.weight === 80, `恰在设计上限 80：40×2=80 → stats.weight=${atDesign.weight} 放行`);

console.log(process.exitCode ? `\nFAILED (${pass} passed)` : `\nALL OK (${pass} assertions)`);
