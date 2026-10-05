// test-minimap.js — 小地图布局换算测试（Node 端，Pure Logic）
// 运行：node scripts/test-minimap.js
// 覆盖：常规世界等比适配（回归旧行为）、条带阈值边界、条带模式横向占满/纵向拉伸/居中、
//   换算函数在条带模式下的推进轴保真、opts 自定义阈值。
'use strict';

const U = require('../js/tank_utils.js');
const RULES_MOD = require('../js/tank_rules.js');
void U; void RULES_MOD;

const {
  minimapLayout,
  worldToMinimap,
  worldRectToMinimap
} = require('../js/tank_minimap.js');

let fails = 0;
function ok(cond, label) {
  if (cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}`); fails++; }
}
function close(a, b, eps) { return Math.abs(a - b) <= (eps || 1e-9); }

// 1) 常规世界：等比适配，行为与旧实现一致（旧公式 scale=min(mmW/w,mmH/h) 居中）
{
  const l = minimapLayout(5800, 3500, 170, 120);
  ok(l.strip === false, '方形世界不进条带模式');
  const s = Math.min(170 / 5800, 120 / 3500);
  ok(close(l.scale, s) && close(l.sx, s) && close(l.sy, s), '常规模式 sx=sy=scale=等比缩放');
  ok(close(l.ox, (170 - 5800 * s) / 2) && close(l.oy, (120 - 3500 * s) / 2), '常规模式居中偏移');
  const p = worldToMinimap(l, 0, 0);
  ok(close(p.x, l.ox) && close(p.y, l.oy), '原点映射到偏移处');
  const q = worldToMinimap(l, 5800, 3500);
  ok(close(q.x, l.ox + 5800 * s) && close(q.y, l.oy + 3500 * s), '对角映射一致');
}

// 2) 阈值边界：aspect == 2.5 不进条带，> 2.5 进
{
  const a = minimapLayout(2500, 1000, 170, 120);
  ok(a.strip === false, '宽高比恰为阈值不进条带');
  const b = minimapLayout(2600, 1000, 170, 120);
  ok(b.strip === true, '宽高比超过阈值进条带');
}

// 3) 条带世界（C 档 strip 口径：19200×2400 ≈ 8:1，框 170×120）
{
  const W = 19200, H = 2400, MW = 170, MH = 120;
  const l = minimapLayout(W, H, MW, MH);
  ok(l.strip === true, 'strip 世界进条带模式');
  const sx = MW / W;
  ok(close(l.sx, sx) && close(l.ox, 0), '横向占满框宽（ox=0, sx=mmW/worldW）');
  const sy = Math.min(MH / H, sx * 2.5);
  ok(close(l.sy, sy), '纵向按 boost 拉伸并钳制');
  ok(close(l.oy, (MH - H * sy) / 2), '条带垂直居中');
  ok(l.sy * H > 20, '条带高度可用（非细线）');
  // 推进轴保真：x=0→左缘，x=W→右缘
  const p0 = worldToMinimap(l, 0, 123);
  const p1 = worldToMinimap(l, W, 456);
  ok(close(p0.x, 0) && close(p1.x, MW), '推进轴两端精确映射到框左右缘');
  ok(p0.y >= 0 && p0.y <= MH && p1.y >= 0 && p1.y <= MH, '纵向映射落在框内');
  // 视口矩形换算一致
  const r = worldRectToMinimap(l, 1000, 500, 2920, 1580);
  const ea = worldToMinimap(l, 1000, 500), eb = worldToMinimap(l, 2920, 1580);
  ok(close(r.x, ea.x) && close(r.y, ea.y) && close(r.w, eb.x - ea.x) && close(r.h, eb.y - ea.y), '视口矩形换算一致');
}

// 4) opts 自定义阈值/boost
{
  const l = minimapLayout(3000, 1000, 170, 120, { stripThreshold: 4 });
  ok(l.strip === false, '自定义高阈值可抑制条带模式');
  const m = minimapLayout(19200, 2400, 170, 120, { stripYBoost: 1 });
  ok(close(m.sy, m.sx), 'stripYBoost=1 退化为等比条带');
}

// 5) 旧调用兼容：scale 字段保留且等于 sx
{
  const l = minimapLayout(19200, 2400, 170, 120);
  ok(l.scale === l.sx, 'scale 字段保留（兼容旧调用方）');
}

if (fails) { console.error(`\n${fails} 项失败`); process.exit(1); }
console.log('\n全部通过');
