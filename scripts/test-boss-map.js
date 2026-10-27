// test-boss-map.js — 2026-10-27 用户需求：Boss 节点改用标准 strip 地图生成器，尺寸 3×3 屏。
// 覆盖：Boss 模式节点尺寸 / 模板来源（__strip__）/ 单列单行 / 地物与路网非空 /
//   3×3 网格无空区 / 出生点不在阻挡物或水域 / boss 标记与无常规敌军 /
//   标准模式周期 Boss 节点同口径 / 生存模式尺寸回归 / 固定 seed 确定性。
// 运行：node scripts/test-boss-map.js
'use strict';

const U = require('../js/tank_utils.js');
const R = require('../js/tank_rules.js');
global.TAU = U.TAU;
global.RULES = R.RULES;
for (const k of Object.keys(U)) global[k] = U[k];
const NG = require('../js/tank_nodegen.js');
for (const k of Object.keys(NG)) if (typeof NG[k] === 'function') global[k] = NG[k];
const M = require('../js/tank_map.js');

let fails = 0;
function ok(cond, label){
  if(cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}`); fails++; }
}

const VP = { vw: 1280, vh: 720 };
const SCREENS = 3;
function nodeOf(seed, env){ return M.generateRun(seed, 1, env).nodes[0]; }

// ① Boss 模式：标准 strip 生成器 + 3×3 屏
{
  const n = nodeOf(20261027, { viewport: VP, bossOnly: true, difficultyLevel: 0 });
  ok(n.template && n.template.id === '__strip__', `Boss 节点走 strip 生成器（${n.template && n.template.id}）`);
  ok(n.chunks && n.chunks.length === 1 && n.chunkRows === 1, `单列单行（chunks=${n.chunks && n.chunks.length} rows=${n.chunkRows}）`);
  ok(Math.abs(n.w - SCREENS * VP.vw) < VP.vw * 0.05, `宽度 ≈3 屏（${Math.round(n.w)}px）`);
  ok(Math.abs(n.h - SCREENS * VP.vh) < VP.vh * 0.05, `高度 ≈3 屏（${Math.round(n.h)}px）`);
  ok(n.boss === true, 'Boss 标记保留');
  ok(n.enemies.length === 0, 'Boss 节点无常规敌军');
  ok(n.quota === null, 'Boss 节点 quota=null');
  ok(!n.defenseLines || n.defenseLines.length === 0, 'Boss 节点不布防线');
}

// ② 地物与路网非空
{
  const n = nodeOf(20261027, { viewport: VP, bossOnly: true, difficultyLevel: 0 });
  const roads = n.covers.filter(c => c.tier === 'road').length;
  const buildings = n.covers.filter(c => c.tier === 'building' || c.tier === 'full').length;
  ok(n.covers.length > 50, `Boss 场地物充足（${n.covers.length}）`);
  ok(roads >= 1, `含路网（road 链 ${roads}）`);
  ok(buildings >= 1, `含建筑/全高掩体（${buildings}）`);
}

// ③ 3×3 网格无空区 + 出生点合法
{
  for (const seed of [1, 2, 3, 20261027]) {
    const n = nodeOf(seed, { viewport: VP, bossOnly: true, difficultyLevel: 0 });
    const grid = Array.from({ length: 3 }, () => [0, 0, 0]);
    for (const c of n.covers) {
      const cx = Math.min(2, Math.max(0, Math.floor(c.x / (n.w / 3))));
      const cy = Math.min(2, Math.max(0, Math.floor(c.y / (n.h / 3))));
      grid[cy][cx]++;
    }
    const empty = grid.flat().filter(v => v === 0).length;
    ok(empty === 0, `seed=${seed} 3×3 网格无空区（${JSON.stringify(grid)}）`);

    const sp = n.playerSpawn;
    const inWorld = sp.x >= 0 && sp.y >= 0 && sp.x <= n.w && sp.y <= n.h;
    ok(inWorld, `seed=${seed} 出生点在世界内（${sp.x | 0},${sp.y | 0}）`);

    // 出生点不得落在阻挡物 / 液态地形（OBB 近似；verts 少见，矩形覆盖绝大多数）
    let bad = null;
    for (const c of n.covers) {
      const tier = R.RULES.coverTiers[c.tier];
      if (!tier) continue;
      const blocks = tier.passability === 0 || tier.shellBlock === true
        || tier.shellBlock === 'single' || tier.tierGroup === 'liquid'
        || c.tier === 'water' || c.tier === 'river';
      if (!blocks) continue;
      const dx = sp.x - c.x, dy = sp.y - c.y;
      const ang = -(c.angle || 0);
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const lx = dx * ca - dy * sa, ly = dx * sa + dy * ca;
      if (Math.abs(lx) <= (c.w || 0) / 2 + 24 && Math.abs(ly) <= (c.h || 0) / 2 + 24) { bad = c.tier; break; }
    }
    ok(!bad, `seed=${seed} 出生点不在阻挡/水域（${bad || 'ok'}）`);
  }
}

// ④ 标准模式的周期 Boss 节点同样走 strip / 3×3
{
  const run = M.generateRun(20261027, 3, { viewport: VP, difficultyLevel: 0 });
  const bossNode = run.nodes[2];
  ok(bossNode.boss === true, '标准模式 index=2 为 Boss 节点');
  ok(bossNode.template.id === '__strip__', '标准模式 Boss 节点也走 strip 生成器');
  ok(Math.abs(bossNode.w - SCREENS * VP.vw) < VP.vw * 0.05
    && Math.abs(bossNode.h - SCREENS * VP.vh) < VP.vh * 0.05,
    `标准模式 Boss 节点 ≈3×3 屏（${Math.round(bossNode.w)}×${Math.round(bossNode.h)}）`);
}

// ⑤ 生存模式尺寸回归（3×3）与标准模式尺寸不受影响
{
  const surv = nodeOf(20261027, { viewport: VP, noEnemies: true, difficultyLevel: 0 });
  ok(Math.abs(surv.w - SCREENS * VP.vw) < VP.vw * 0.05
    && Math.abs(surv.h - SCREENS * VP.vh) < VP.vh * 0.05, '生存模式仍为 3×3 屏');
  const std = nodeOf(20261027, { viewport: VP, difficultyLevel: 0 });
  ok(std.w > SCREENS * VP.vw * 2, `标准模式仍为横向条带（${(std.w / VP.vw).toFixed(1)} 屏宽）`);
  ok(Math.abs(std.h - 2.2 * VP.vh) < VP.vh * 0.05, `标准模式高度仍 ≈2.2 屏（${(std.h / VP.vh).toFixed(2)}）`);
}

// ⑥ 固定 seed 确定性
{
  const a = nodeOf(424242, { viewport: VP, bossOnly: true, difficultyLevel: 0 });
  const b = nodeOf(424242, { viewport: VP, bossOnly: true, difficultyLevel: 0 });
  ok(a.w === b.w && a.h === b.h && a.covers.length === b.covers.length, '同 seed 生成一致');
  ok(a.seed === b.seed, '节点 seed 一致');
}

process.exitCode = fails ? 1 : 0;
if(fails) console.error(`\n${fails} 项失败`);
else console.log('\n全部通过');
