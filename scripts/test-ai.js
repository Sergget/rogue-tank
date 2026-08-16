// test-ai.js — 敌人/友军 AI 决策测试（Node 端，Pure Logic）
// 运行：node scripts/test-ai.js
'use strict';

const RULES_MOD = require('../js/tank_rules.js');
global.RULES = RULES_MOD.RULES;
const U = require('../js/tank_utils.js');
global.angDiff = U.angDiff;
global.norm = U.norm;
const { aiDecideEnemy, aiDecideAlly, aiDecide } = require('../js/tank_ai.js');

let fails = 0;
function ok(cond, label) {
  if (cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}`); fails++; }
}

function enemy(x, y, hullAngle, turretAngle, reloadT) {
  return { team: 'enemy', x, y, hullAngle, turretAngle, reloadT: reloadT || 0, stats: { turretTurnRate: 2.2 }, hp: 100, traverseLimit: Math.PI };
}
const player = { team: 'player', x: 1000, y: 500, hp: 100 };
const view = { minX: 400, minY: 200, maxX: 1200, maxY: 800 };   // 摄像机视口（800×600 居中 800,500）

// 1) 远处被动：视口外远处（超出 edgeMargin 200）
const far = enemy(0, 0, 0, 0, 0);
const d1 = aiDecideEnemy(far, { player, view, hasLoS: () => true });
ok(d1.move === 0 && d1.turn === 0 && d1.fire === false, '视口外远处 → 被动（不活动）');

// 2) 边缘靠近态：视口外扩 edgeMargin 内 → 主动靠近
const edge = enemy(100, 500, Math.PI, Math.PI, 0);   // x=100 在 view.minX-200=200 之外？→ 调整到 250
const edge2 = enemy(250, 500, Math.PI, Math.PI, 0);  // 250 在 [200,1200] 内 → 主动
const d2 = aiDecideEnemy(edge2, { player, view, hasLoS: () => true });
ok(d2.move === 1 || d2.turn !== 0, '边缘/视口内 → 主动（靠近或转向）');
ok(d2.turretDesired !== Math.PI || d2.fire === false, '有决策输出');

// 3) 视口内 + 远距 → move=1 靠近、turn 朝玩家、turretDesired 指向玩家
const farInView = enemy(500, 500, Math.PI, Math.PI, 0);   // 距玩家 500 < engage 520
const d3 = aiDecideEnemy(farInView, { player, view, hasLoS: () => true });
ok(Math.abs(d3.turretDesired - 0) < 1e-9, 'turretDesired 指向玩家（atan2(0,500)=0）');
ok(d3.move === 0, '距离在接战范围内 → 不前进（500 < 520）');

const veryFar = enemy(200, 500, Math.PI, Math.PI, 0);   // 距玩家 800 > 520
const d4 = aiDecideEnemy(veryFar, { player, view, hasLoS: () => true });
ok(d4.move === 1, '远于 engageRange → 靠近');

// 4) 对准 + 视线 + 装填好 → fire；视线遮挡 → 不 fire
const ready = enemy(800, 500, Math.PI, 0, 0);   // turretAngle=0 对准玩家（右侧）
const d5 = aiDecideEnemy(ready, { player, view, hasLoS: () => true });
ok(d5.fire === true, '对准+视线+装填好 → 开火');
const d6 = aiDecideEnemy(ready, { player, view, hasLoS: () => false });
ok(d6.fire === false, '视线遮挡 → 不开火');
const reloading = enemy(800, 500, Math.PI, 0, 1.0);
const d7 = aiDecideEnemy(reloading, { player, view, hasLoS: () => true });
ok(d7.fire === false, '装填中 → 不开火');

// 5) 友军据点：消极防御（不移动），射程内敌人 → 开火；无敌人 → 静止
const ally = { team: 'ally', x: 500, y: 500, hullAngle: 0, turretAngle: 0, reloadT: 0, stats: { turretTurnRate: 2.2 }, hp: 100, traverseLimit: Math.PI };
const dAlly1 = aiDecideAlly(ally, { enemies: [], hasLoS: () => true });
ok(dAlly1.move === 0 && dAlly1.fire === false, '友军无敌人 → 静止');
const enemyNear = enemy(700, 500, Math.PI, Math.PI, 0);   // 距 ally 200 < 460，在 ally 右侧
const dAlly2 = aiDecideAlly(ally, { enemies: [enemyNear], hasLoS: () => true });
ok(Math.abs(dAlly2.turretDesired - 0) < 1e-9, '友军 turretDesired 指向最近敌人（右侧 → 0）');
// 友军 turretAngle=0 已对准 → fire
ok(dAlly2.fire === true, '友军射程内对准 → 开火');
ok(dAlly2.move === 0 && dAlly2.turn === 0, '友军消极防御（不移动）');

// 6) aiDecide 分发
ok(aiDecide(ally, { enemies: [], hasLoS: () => true }).fire === false, 'aiDecide 分发 ally');
ok(aiDecide(far, { player, view, hasLoS: () => true }).move === 0, 'aiDecide 分发 enemy');

console.log('test-ai: 完成所有检查');
if (fails === 0) console.log('test-ai: 全部通过');
else console.error(`test-ai: ${fails} 项失败`);
process.exit(fails === 0 ? 0 : 1);
