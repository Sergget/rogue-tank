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

// ---------- ④ 面板/卡面文案不得泄漏实现细节（2026-11-01 用户要求） ----------
// 用户原话：「清理掉面板UI、卡牌描述中对游戏实现细节的过度描述」。
// 事故样本：bench 的敌人实验室提示块原文写着
//   「坦克选择=把 tanks/*.json 整包配置换到玩家/靶车；此处=按等级生成真正走难度链的敌军
//     （applyEnemyAppearanceAndStats + applyDifficultyMults）……」
// 使用者不需要知道目录路径与内部函数名。
//
// 本段把「可见文案里出现实现标识符」做成机械判据。关键：**只查真正显示出来的文本**——
//   · 剥 HTML 注释（注释里写实现细节是正常文档纪律）；
//   · 剥 <style> / <script> 块（那是代码，不是文案）；
//   · 剥标签属性（id="applyPlayerTankBtn" 不是可见文字）；
//   · 模板字面量里的 ${...} 是代码，替换后再判。
const pageFiles = ['tank_bench.html', 'tank_battle.html', 'tank_designer.html', 'tank_codex.html'];
const UI_LEAK_RULES = [
  { name: '文件路径', re: /(?:^|[^\w])(?:js|cards|tanks|bosses|assets)\/[\w./*-]+/ },
  { name: 'JS/JSON 文件名', re: /\b[\w-]+\.(?:json|js|cjs)\b/ },
  { name: '内部函数名', re: /\b(?:apply|update|compute|spawn|reset|render|make|draw|format|fire|emit|alert|propagate)[A-Z]\w*/ },
  { name: '内部常量', re: /\b(?:RULES|WEAPON_DEFAULTS|CARD_TAGS|ABILITY_KEYS\w*|DEV_CARD_GROUPS|KEY_BINDINGS|COVER_TIERS|enemyPreviewStats|devCardGroupKey)\b/ },
  { name: '机制内部术语', re: /\b(?:modifier|cardEffects|statOverrides|devPanel|snapshotCardTx|rollbackCardTx|nodeSpawn|deployables)\b/ },
];

/** 抽出一段 HTML 里使用者真能读到的文本（标签间文本 + 会显示的属性） */
function visibleTexts(html) {
  const out = [];
  const body = html
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '\u0000')
    .replace(/<!--[\s\S]*?-->/g, '');
  const re = /<([a-zA-Z][\w-]*)([^>]*)>|([^<]+)/g;
  let m;
  while ((m = re.exec(body)) !== null) {
    if (m[3] !== undefined) {
      const t = m[3].trim();
      if (t) out.push(t);
      continue;
    }
    const attrs = m[2] || '';
    for (const am of attrs.matchAll(/\b(?:title|placeholder|alt)\s*=\s*"([^"]*)"/g)) {
      if (am[1].trim()) out.push(am[1].trim());
    }
  }
  return out;
}

/** 从内联脚本里挑会显示给用户的字符串（pushLog / devToast / textContent） */
function visibleJsStrings(script) {
  const out = [];
  for (const line of script.split('\n')) {
    if (/^\s*\/\//.test(line)) continue;
    if (!/(?:pushLog|devToast)\s*\(/.test(line) && !/\.textContent\s*=/.test(line)) continue;
    for (const lit of line.matchAll(/'([^']{4,})'|`([^`]{4,})`|"([^"]{4,})"/g)) {
      const s = lit[1] || lit[2] || lit[3];
      if (s) out.push(s.replace(/\$\{[^}]*\}/g, '§'));
    }
  }
  return out;
}

// 2026-11-01：扫描面从「四个页面」扩到「页面 + 会向玩家显示文字的共享模块」。
// 事故：js/tank_card_picker.js 的未加载提示写着「（js/tank_card_picker.js」——
//   页面静态文本里没有这句，模块里才有 ⇒ 只扫页面会漏（并行会话当场撞到过一次）。
const moduleFiles = ['js/tank_devpanel.js', 'js/tank_card_picker.js', 'js/tank_hud_panel.js'];

for (const pageFile of pageFiles) {
  const full = path.join(__dirname, '..', pageFile);
  if (!fs.existsSync(full)) { ok(false, `${pageFile} 存在`); continue; }
  const raw = fs.readFileSync(full, 'utf8');
  const items = visibleTexts(raw);
  for (const b of [...raw.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]) {
    items.push(...visibleJsStrings(b[1]));
  }
  const leaked = [];
  for (const s of items) {
    for (const r of UI_LEAK_RULES) {
      const mm = r.re.exec(s);
      if (mm) { leaked.push(`${r.name}「${mm[0]}」`); break; }
    }
  }
  ok(leaked.length === 0,
     `${pageFile} 可见文案不含实现细节${leaked.length ? '（命中：' + leaked.slice(0, 3).join(' / ') + '）' : ''}`);
}

// 共享模块里的**会显示给玩家的字符串**（pushLog / textContent / 未加载提示）同样受此口径约束。
// 但模块里 `textContent` 也常被用来注入 **CSS 文本**（如 `styleEl.textContent = '#devPanel{...}'`）——
// 那是代码不是文案，必须先排除，否则会把选择器误判成"泄漏 devPanel"（本轮实测撞到过）。
const CSS_TEXT = /^[#.]?[\w-]*(?:\s*[,{>]|\[)/;
for (const modFile of moduleFiles) {
  const full = path.join(__dirname, '..', modFile);
  if (!fs.existsSync(full)) { ok(false, `${modFile} 存在`); continue; }
  const raw = fs.readFileSync(full, 'utf8');
  const items = visibleJsStrings(raw).filter(s => !CSS_TEXT.test(s) && !/\{[\s\S]*:[\s\S]*\}/.test(s));
  const leaked = [];
  for (const s of items) {
    for (const r of UI_LEAK_RULES) {
      const mm = r.re.exec(s);
      if (mm) { leaked.push(`${r.name}「${mm[0]}」`); break; }
    }
  }
  ok(leaked.length === 0,
     `${modFile} 可见文案不含实现细节${leaked.length ? '（命中：' + leaked.slice(0, 3).join(' / ') + '）' : ''}`);
}

// 负向：判据本身必须有分辨力——故意喂一段含实现细节的文本，必须能被判出。
{
  const probe = '坦克选择=把 tanks/*.json 整包配置换到玩家/靶车（applyEnemyAppearanceAndStats）';
  const probeHits = UI_LEAK_RULES.filter(r => r.re.test(probe));
  ok(probeHits.length >= 2, `负向：判据有分辨力（样本命中 ${probeHits.length} 类，应 ≥2）`);
}

console.log('test-bench-tools: 完成所有检查');
if (fails === 0) console.log('test-bench-tools: 全部通过');
else console.error(`test-bench-tools: ${fails} 项失败`);
process.exit(fails === 0 ? 0 : 1);
