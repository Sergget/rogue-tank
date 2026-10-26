// test-bench-tools.js — bench Enemy Lab 工具链回归（#AA6，2026-10-26 用户需求）。
// 覆盖两件事：
//   ① **清空所有敌人**：纯筛选 `clearEnemyEntities`（js/tank_panels_core.js）只认 `team === 'enemy'`，
//      靶车由 keepIds 保留、玩家/友军不受影响；**不再按生成来源 `nodeSpawn` 过滤**（旧页面内联口径
//      按来源筛选，任何未打标记的敌军会被漏掉）。
//   ② **生成位置检测**：Enemy Lab 两条生成路径都必须过 `clampSpawnIntoView`（几何本体的回归在
//      scripts/test-camera.js 的 #AA6 段，此处只锁接线，防「加了护栏但没接上」）。
// 运行：node scripts/test-bench-tools.js
'use strict';

const fs = require('fs');
const path = require('path');
const U = require('../js/tank_utils.js');
const R = require('../js/tank_rules.js');
global.TAU = U.TAU;
global.RULES = R.RULES;
const PC = require('../js/tank_panels_core.js');

let fails = 0;
function ok(cond, label){
  if(cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}`); fails++; }
}

// ---------- ① 清场纯筛选 ----------
{
  const list = [
    { id: 'player', team: 'player' },
    { id: 'dummy', team: 'enemy' },                    // 靶车：team 是 enemy，靠 keepIds 保留
    { id: 'enemy_a', team: 'enemy' },                  // 无 nodeSpawn 标记
    { id: 'enemy_b', team: 'enemy', nodeSpawn: true }, // 节点生成口径
    { id: 'ally_1', team: 'ally' },
    { id: 'enemy_dead', team: 'enemy', hp: 0 },        // 已死实体也要清掉（不靠 hp 过滤）
  ];
  const removed = PC.clearEnemyEntities(list, { keepIds: ['dummy'] });
  ok(removed.length === 3, `清场移除 3 辆敌军（含无 nodeSpawn 与已死实体），实际 ${removed.length}`);
  ok(list.some(e => e.id === 'dummy'), '靶车被 keepIds 保留');
  ok(list.some(e => e.id === 'player') && list.some(e => e.id === 'ally_1'), '玩家与友军不受影响');
  ok(!list.some(e => e.id === 'enemy_a'), '无 nodeSpawn 标记的敌军同样被清掉（旧口径的漏项）');
  ok(removed[0] === 'enemy_a' && removed[removed.length - 1] === 'enemy_dead',
     `移除 id 顺序稳定（按下标升序：${removed.join(',')}）`);
}
{
  const list = [{ id: 'dummy', team: 'enemy' }];
  ok(PC.clearEnemyEntities(list).length === 1,
     '不传 keepIds 时全部清空（keepIds 是页面决策，函数不带默认值）');
}
{
  const list = [{ id: 'p', team: 'player' }, { id: 'a', team: 'ally' }];
  ok(PC.clearEnemyEntities(list, { keepIds: ['dummy'] }).length === 0 && list.length === 2,
     '无敌军时清场为空操作（不移除玩家/友军）');
}

// ---------- ② 页面接线（源码形状断言） ----------
const bench = fs.readFileSync(path.join(__dirname, '..', 'tank_bench.html'), 'utf8');
ok(/id="clearEnemiesBtn"/.test(bench), 'Enemy Lab 可见「清空所有敌人」按钮存在');
ok(/'clearEnemiesBtn'\)\.addEventListener\('click', benchClearAllEnemies\)/.test(bench),
   '可见按钮绑定 benchClearAllEnemies');
ok(/'benchClearEnemiesBtn'\)\.addEventListener\('click', benchClearAllEnemies\)/.test(bench),
   'devPanel「清场」走同一函数（两入口同源）');
ok(/clearEnemyEntities\(entities, \{ keepIds: \['dummy'\] \}\)/.test(bench),
   '页面清场调用纯筛选并保留靶车');
ok(!/e\.team === 'enemy' && e\.nodeSpawn/.test(bench),
   '负向：页面不得再按 nodeSpawn 过滤清场（旧实现）');
ok(/player\._missileLock = null/.test(bench), '清场后解掉指向已删实体的导弹锁定');
ok(/function benchSpawnPoint\(x, y\)/.test(bench) && /clampSpawnIntoView\(cam, x, y, 80\)/.test(bench),
   '生成点统一经 clampSpawnIntoView 收进视口（margin 80）');
ok(/var sp = benchSpawnPoint\(mouseWorld\.x, mouseWorld\.y\)/.test(bench), '指针生成路径过护栏');
ok(/var sp = benchSpawnPoint\(player\.x \+ Math\.cos\(ang\)\*dist/.test(bench), '批量生成路径过护栏');

// ---------- ③ 图鉴入口已从 bench 完全删除（2026-10-26 用户裁定） ----------
// 断言前剥掉 HTML 注释：注释里写「图鉴唯一入口是 tank_codex.html」是解释，不是入口。
{
  const benchNoComments = bench.replace(/<!--[\s\S]*?-->/g, '');
  ok(!/坦克图鉴 CODEX/.test(benchNoComments), '负向：bench 不再渲染「坦克图鉴 CODEX」区块');
  ok(!/tank_codex\.html/.test(benchNoComments), '负向：bench 不再有指向图鉴页的链接/跳转');
  ok(/坦克图鉴/.test(fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8')),
     '图鉴入口仍在首页 `.tools` 导航（删除的是 bench 入口，不是图鉴页）');
}

console.log('test-bench-tools: 完成所有检查');
if (fails === 0) console.log('test-bench-tools: 全部通过');
else console.error(`test-bench-tools: ${fails} 项失败`);
process.exit(fails === 0 ? 0 : 1);
