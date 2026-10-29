// test-home-viewmodel.js — 首页存档视图模型：真实档案行 + 预设存档行（2026-10-29 用户裁定）
//
// 背景：预设原本是「载入预设：满级商店 / 99999 点数」两个按钮，用户裁定改为存档列表里的
//   两条常驻条目。纯逻辑落在 `buildHomeViewModel`（js/tank_screens.js）的 `presets` 入参，
//   页面只负责 DOM 与「载入 + 进入」的动作。
// 覆盖：
//   ① 不传 presets ⇒ presetRows 为空（老调用点零回归）
//   ② 传 presets ⇒ 字段透传 + id 加 `preset:` 前缀（与真实槽位 id 不可能撞车）
//   ③ `empty` 只表达「没有真实档案」——预设不算档案
//   ④ 负向：预设行不得带可编辑态字段（它不是档案，不能被重命名/删除）
//   ⑤ 脏输入过滤（null / 缺 name / 缺 id）
//   ⑥ 真实行行为不变（meta / badge / active）
//   ⑦ 源码级：tank_battle.html 的 HOME_PRESETS 指向的 JSON 必须真实存在；
//      两个旧按钮 id 必须已删除（防回潮：只测「新功能在」发现不了「旧入口又回来了」）
// 运行：node scripts/test-home-viewmodel.js
'use strict';

const fs = require('fs');
const path = require('path');
const U = require('../js/tank_utils.js');
const R = require('../js/tank_rules.js');
global.TAU = U.TAU;
global.RULES = R.RULES;
const S = require('../js/tank_screens.js');

let fails = 0;
function ok(cond, label){
  if(cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}`); fails++; }
}

const bHome = S.buildHomeViewModel;
const ROOT = path.join(__dirname, '..');
const pageSrc = fs.readFileSync(path.join(ROOT, 'tank_battle.html'), 'utf8');

// 两个真实槽位夹具（id 用 uuid 风格，与预设的 `preset:` 前缀正交）
const slotA = { id: 'a1b2c3', name: '主力档', updatedAt: 2000 };
const slotB = { id: 'd4e5f6', name: '测试档', updatedAt: 1000 };
const profiles = {
  a1b2c3: { stats: { runs: 3, kills: 41 }, points: 120, upgrades: {} },
  d4e5f6: { stats: { runs: 0, kills: 0 }, points: 0, upgrades: {} },
};
const presetFixtures = [
  { id: 'maxed', name: '满级商店存档', url: 'saves/preset-maxed.json', hint: '全部永久升级已满级', hasSlot: false },
  { id: '99999', name: '99999点数存档', url: 'saves/preset-99999.json', hint: '商店点数 99999', hasSlot: true },
];

// ① 不传 presets：向后兼容
{
  const vm = bHome({ slots: [slotA, slotB], activeId: 'a1b2c3', slotProfileOf: id => profiles[id] });
  ok(Array.isArray(vm.presetRows) && vm.presetRows.length === 0,
    `① 不传 presets ⇒ presetRows 为空（${JSON.stringify(vm.presetRows)}）`);
  ok(vm.rows.length === 2 && vm.empty === false, '① 真实行照旧 2 条、empty=false');
}

// ② 传 presets：字段透传
{
  const vm = bHome({ slots: [slotA], activeId: 'a1b2c3', slotProfileOf: id => profiles[id], presets: presetFixtures });
  ok(vm.presetRows.length === 2, `② 两条预设行（${vm.presetRows.length}）`);
  const first = vm.presetRows[0];
  ok(first.name === '满级商店存档' && first.url === 'saves/preset-maxed.json' && first.hint === '全部永久升级已满级',
    `② 字段透传（name=${first.name} url=${first.url}）`);
  ok(first.hasSlot === false && vm.presetRows[1].hasSlot === true,
    '② hasSlot 透传（决定「载入进入 / 重置进入」文案）');
  ok(vm.presetRows.every(p => typeof p.id === 'string' && p.id.indexOf('preset:') === 0),
    `② id 统一带 preset: 前缀（${vm.presetRows.map(p => p.id).join(' / ')}）`);
  ok(vm.presetRows.every(p => !vm.rows.some(r => r.id === p.id)),
    '② 负向：预设 id 与真实槽位 id 无交集');
}

// ③ empty 只表示「没有真实档案」
{
  const vm = bHome({ slots: [], activeId: null, slotProfileOf: () => null, presets: presetFixtures });
  ok(vm.empty === true, '③ 无真实档案时 empty=true');
  ok(vm.rows.length === 0 && vm.presetRows.length === 2,
    '③ 预设不计入 empty，但仍产出 2 行（页面据此把列表露出来）');
}

// ④ 负向：预设行不是档案——不得带可编辑/可删除态
{
  const vm = bHome({
    slots: [slotA], activeId: 'a1b2c3', slotProfileOf: id => profiles[id],
    renamingSlotId: 'a1b2c3', deleteArmSlotId: 'a1b2c3', presets: presetFixtures,
  });
  ok(vm.presetRows.every(p => p.renamingInput === undefined && p.showDeleteConfirm === undefined),
    '④ 负向：预设行不带 renamingInput / showDeleteConfirm');
  ok(vm.rows[0].renamingInput === true && vm.rows[0].showDeleteConfirm === true,
    '④ 对照：真实行仍带这两个态（说明断言不是因为入参没被消费）');
}

// ⑤ 脏输入过滤
{
  // 故意传非法形状（null / 缺字段 / 字符串）——这正是运行时要在免费层挡住的那类输入
  const dirty = /** @type {any} */ ([null, {}, { id: 'x' }, { id: 'ok', name: '可用预设' }, 'not-an-object', undefined]);
  const vm = bHome({ slots: [], slotProfileOf: () => null, presets: dirty });
  ok(vm.presetRows.length === 1 && vm.presetRows[0].presetId === 'ok',
    `⑤ 脏预设被过滤，只剩 1 条（${vm.presetRows.map(p => p.presetId).join(',')}）`);
  ok(vm.presetRows[0].url === '' && vm.presetRows[0].hint === '',
    '⑤ 缺 url/hint 时落空串而不是 undefined（DOM textContent 不写 "undefined"）');
}

// ⑥ 真实行行为不变
{
  const vm = bHome({ slots: [slotA, slotB], activeId: 'a1b2c3', slotProfileOf: id => profiles[id], presets: presetFixtures });
  ok(vm.rows[0].active === true && vm.rows[0].badge === true && vm.rows[1].active === false,
    '⑥ 真实行 active/badge 语义不变');
  ok(/局数 3 · 击杀 41 · 点数 120/.test(vm.rows[0].meta), `⑥ 真实行 meta 不变（${vm.rows[0].meta}）`);
}

// ⑦ 源码级：预设 URL 必须真实存在 + 旧按钮必须删干净（负向防回潮）
{
  const block = (pageSrc.match(/const HOME_PRESETS = \[[\s\S]*?\];/) || [''])[0];
  ok(block.length > 0, '⑦ 页面内找到 HOME_PRESETS 常量');
  const urls = [...block.matchAll(/url:\s*'([^']+)'/g)].map(m => m[1]);
  ok(urls.length === 2, `⑦ HOME_PRESETS 恰好 2 条（${urls.join(' / ')}）`);
  for(const u of urls){
    ok(fs.existsSync(path.join(ROOT, u)), `⑦ 预设文件存在：${u}`);
  }
  ok(!/id="homePresetMaxedBtn"/.test(pageSrc) && !/id="homePreset99999Btn"/.test(pageSrc),
    '⑦ 负向：两个「载入预设」按钮的 DOM 已删除');
  ok(!/homePresetMaxedBtn'\)|homePreset99999Btn'\)/.test(pageSrc),
    '⑦ 负向：两条按钮事件绑定也已删除（残留 getElementById 会在 null 上抛错）');
}

console.log(fails ? `\n${fails} failure(s).` : '\ntest-home-viewmodel: 全部通过');
process.exitCode = fails ? 1 : 0;
