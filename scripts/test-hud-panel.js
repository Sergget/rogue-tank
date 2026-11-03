// test-hud-panel.js — 共享底部 HUD 渲染层回归（js/tank_hud_panel.js，2026-11-01）。
//
// 背景：用户要求「bench 的弹种条 / 技能（主被动）/ 速度 / 血量 UI 采用 tank_battle.html 中的 UI」。
// 这些控件此前全部内联在 battle 的 updateBottomHud()；bench 要复用就必须抽成共享模块
// （复制一份 = AGENTS.md §2.1 警告的「同功能两套实现」）。
//
// 本测试用**最小 DOM 桩**验证六件事，全部是纯函数级断言：
//   ① 血量：ceil(hp)/round(maxHp) 与宽度百分比（与 battle 口径一致）
//   ② 速度：必须走 tankCurrentKmh / roadBonusKmh（不得直接乘 kmhFactor ⇒ 会读出 ~208km/h）
//   ③ 弹种槽：按 player.ammoLoadout 渲染 ≤3 槽（battle 同口径）——
//      这正是 bench 弹种条「太长」的根因（此前无 loadout ⇒ 显示全部 14 种）
//   ④ 技能槽：有技能才显示、空槽隐藏并清空（battle #H3 口径）
//   ⑤ 被动槽：格数 = passiveSlotState.max
//   ⑥ 缺元素时静默跳过（宿主 DOM 不同不报错）——bench/battle 共用同一函数的前提
'use strict';

const fs = require('fs');
const path = require('path');
const U = require('../js/tank_utils.js');
const R = require('../js/tank_rules.js');
global.TAU = U.TAU;
global.RULES = R.RULES;

// tank_model 提供 tankCurrentKmh / roadBonusKmh（本模块的速度换算唯一口径）
const M = require('../js/tank_model.js');
global.tankCurrentKmh = M.tankCurrentKmh;
global.roadBonusKmh = M.roadBonusKmh;

let fails = 0;
function ok(cond, label) {
  if (cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}`); fails++; }
}

// ==================== 最小 DOM 桩 ====================
// 只实现被测代码用到的接口：getElementById / textContent / style.width / style.display /
// classList.toggle / querySelector / innerHTML / appendChild / createElement。
function makeEl(id) {
  const el = {
    id,
    textContent: '',
    innerHTML: '',
    title: '',
    children: [],
    style: { width: '', display: '', cssText: '' },
    _classes: new Set(),
    classList: {
      toggle(cls, on) { if (on === undefined) on = !el._classes.has(cls); if (on) el._classes.add(cls); else el._classes.delete(cls); },
      add(cls) { el._classes.add(cls); },
      remove(cls) { el._classes.delete(cls); },
      contains(cls) { return el._classes.has(cls); },
    },
    querySelector(sel) { return el._q[sel] || null; },
    appendChild(c) { el.children.push(c); return c; },
    _q: {},
  };
  return el;
}

function installDom(structure) {
  const store = {};
  for (const id of Object.keys(structure)) {
    const el = makeEl(id);
    store[id] = el;
    // 子元素（.label / .num / .slabel）
    for (const sub of (structure[id] || [])) {
      el._q[sub] = makeEl(id + sub);
    }
  }
  global.document = /** @type {any} */ ({
    getElementById: (id) => store[id] || null,
    createElement: () => makeEl('created'),
  });
  return store;
}

// 先加载被测模块（其内部通过 typeof document 判空，加载期不访问 DOM）
const HUD = require('../js/tank_hud_panel.js');

// ==================== ① 血量 ====================
{
  const dom = installDom({ playerHpFill: [], playerHpVal: [] });
  const player = { hp: 73.4, stats: { maxHp: 120 } };
  HUD.renderPlayerVitals(player, {});
  ok(dom.playerHpVal.textContent === '74 / 120', `血量文本 = ceil(hp)/round(maxHp)（实际「${dom.playerHpVal.textContent}」）`);
  ok(Math.abs(parseFloat(dom.playerHpFill.style.width) - 73.4 / 120 * 100) < 0.01,
     `血量条宽度 = hp/maxHp（实际 ${dom.playerHpFill.style.width}）`);
}
{
  // 负向：hp 为负 / maxHp 为 0 时不得出现负宽度或 NaN
  const dom = installDom({ playerHpFill: [], playerHpVal: [] });
  HUD.renderPlayerVitals({ hp: -5, stats: { maxHp: 0 } }, {});
  ok(parseFloat(dom.playerHpFill.style.width) === 0, '负向：hp<0 ⇒ 宽度 0（不出现负值）');
  ok(dom.playerHpVal.textContent === '0 / 1', `负向：maxHp=0 兜底为 1（实际「${dom.playerHpVal.textContent}」）`);
}

// ==================== ② 速度 ====================
{
  // 构造一个「像素速度」实体：driveTank 的 effMul=1.3 生效路径
  const cfg = R.RULES.speed;
  const pxSpeed = 100 * cfg.pxFactor * cfg.effMul;   // 期望读数 ≈ 100 × kmhFactor
  const player = { speed: pxSpeed, roadBonus: 0 };
  const dom = installDom({ hudGear: [], hudSpeedVal: [], hudRoadBonus: [] });
  const res = HUD.renderSpeedGauge(player, {});
  const expected = Math.round(M.tankCurrentKmh(player));
  ok(String(res.kmh) === String(M.tankCurrentKmh(player)), '速度读数走 tankCurrentKmh（共享唯一口径）');
  ok(dom.hudSpeedVal.textContent === String(expected), `速度文本 = round(tankCurrentKmh)（实际 ${dom.hudSpeedVal.textContent}）`);
  ok(dom.hudGear.textContent === 'D', '前进档位 = D');
}
{
  // 负向：直接乘 kmhFactor 会读出 ~208km/h —— 断言本模块没走那条错路
  const cfg = R.RULES.speed;
  const pxSpeed = 100 * cfg.pxFactor * cfg.effMul;
  const wrong = Math.round(pxSpeed * cfg.kmhFactor);   // 错误口径
  const right = Math.round(M.tankCurrentKmh({ speed: pxSpeed }));
  ok(wrong !== right, `负向：错误口径(${wrong}) ≠ 正确口径(${right})，判据有分辨力`);
}
{
  const dom = installDom({ hudGear: [], hudSpeedVal: [], hudRoadBonus: [] });
  HUD.renderSpeedGauge({ speed: -50, roadBonus: 10 }, {});
  ok(dom.hudGear.textContent === 'R', '倒车档位 = R');
  ok(/公路 \+\d+km\/h/.test(dom.hudRoadBonus.textContent), `公路加成经 roadBonusKmh（实际「${dom.hudRoadBonus.textContent}」）`);
}
{
  // 无公路加成时不显示标记
  const dom = installDom({ hudGear: [], hudSpeedVal: [], hudRoadBonus: [] });
  HUD.renderSpeedGauge({ speed: 50, roadBonus: 0 }, {});
  ok(dom.hudRoadBonus.textContent === '', '无公路加成 ⇒ 标记留空');
}

// ==================== ③ 弹种槽（≤3，battle 同口径） ====================
{
  const dom = installDom({ slot1: ['.label', '.num'], slot2: ['.label', '.num'], slot3: ['.label', '.num'] });
  const player = { ammoLoadout: ['ap', 'apcr', 'heat'], ammoKey: 'apcr', currentAmmoIndex: 1 };
  const res = HUD.renderAmmoSlots(player, {});
  ok(res.length === 3 && res[0].key === 'ap' && res[1].key === 'apcr', '按 ammoLoadout 渲染 3 槽');
  ok(res[1].active === true && res[0].active === false, '激活槽 = currentAmmoIndex 指向的槽');
  ok(dom.slot2._q['.num'].textContent === '●', '激活槽角标 ●');
  ok(dom.slot1._q['.num'].textContent === '○', '未激活槽角标 ○');
}
{
  // **核心回归**：battle 弹种条不长，是因为只显示 loadout；bench 此前无 loadout ⇒ 全 14 种
  const allAmmo = Object.keys(R.RULES.ammoTypes);
  ok(allAmmo.length > 10, `弹种全集 ${allAmmo.length} 种（>10，这是 bench 条过长的来源）`);
  const dom = installDom({ slot1: ['.label', '.num'], slot2: ['.label', '.num'], slot3: ['.label', '.num'] });
  const res = HUD.renderAmmoSlots({ ammoLoadout: ['ap'], ammoKey: 'ap' }, {});
  ok(res[0] !== null, '只有 1 槽时第 1 槽可见');
  ok(dom.slot2.style.display === 'none' && dom.slot3.style.display === 'none',
     '负向：loadout 只有 1 项 ⇒ 槽 2/3 隐藏（不会铺满全弹种）');
}
{
  // 无 loadout 回退：只显示当前单发弹种，仍有 3 槽结构
  const dom = installDom({ slot1: ['.label', '.num'], slot2: ['.label', '.num'], slot3: ['.label', '.num'] });
  const res = HUD.renderAmmoSlots({ ammoKey: 'heat' }, {});
  ok(res[0] && res[0].key === 'heat', '无 ammoLoadout ⇒ 回退为当前 ammoKey 单槽');
  ok(dom.slot2.style.display === 'none', '无 loadout 时其余槽隐藏');
}

// ==================== ④ 技能槽 ====================
{
  const dom = installDom({ skillSlot1: ['.slabel'], skillSlot2: ['.slabel'], skillSlot3: ['.slabel'], cdS1: [], cdS2: [], cdS3: [] });
  const player = { skillSlots: ['artillery', 'shield', null], abilityCds: { artillery: 7.6 } };
  const res = HUD.renderSkillSlots(player, {
    skillSlots: () => player.skillSlots,
    hasAbility: () => true,
    labels: { artillery: '战术炮击', shield: '战术护盾' },
  }, {});
  ok(res[0] && res[0].key === 'artillery', '槽 1 = artillery');
  ok(dom.skillSlot1._q['.slabel'].textContent === '战术炮击', '槽 1 显示技能中文名');
  ok(dom.cdS1.textContent === '8', `冷却角标取整（实际「${dom.cdS1.textContent}」）`);
  ok(dom.skillSlot3.style.display === 'none', '负向：空槽隐藏（#H3 口径）');
}
{
  // 已分配但不再持有 ⇒ 清空该槽（异常兜底）
  const dom = installDom({ skillSlot1: ['.slabel'], skillSlot2: ['.slabel'], skillSlot3: ['.slabel'], cdS1: [], cdS2: [], cdS3: [] });
  const player = { skillSlots: ['ghost_skill', null, null] };
  HUD.renderSkillSlots(player, { skillSlots: () => player.skillSlots, hasAbility: () => false, labels: {} }, {});
  ok(player.skillSlots[0] === null, '负向：未持有的技能被清出槽位');
  ok(dom.skillSlot1.style.display === 'none', '负向：该槽隐藏');
}

// ==================== ⑤ 被动槽 ====================
{
  const dom = installDom({ passiveSlots: [] });
  const player = {};
  const res = HUD.renderPassiveSlots(player, {
    passiveSlotState: () => ({ max: 2, used: 1, cardIds: ['passive_alpha'] }),
    cardById: (id) => (id === 'passive_alpha' ? { id, name: '反应装甲' } : null),
  }, {});
  ok(res && res.max === 2, '被动槽状态透传 max');
  ok(dom.passiveSlots.children.length === 2, `渲染 2 格（实际 ${dom.passiveSlots.children.length}）`);
  ok(dom.passiveSlots.children[0].textContent === '反应装甲', '已占用格显示卡名');
  ok(/被动 2/.test(dom.passiveSlots.children[1].textContent), '空格显示占位文案');
}

// ==================== ⑥ 缺元素时静默跳过 ====================
{
  installDom({});   // 空 DOM：所有 getElementById 返回 null
  let threw = null;
  try {
    HUD.renderPlayerVitals({ hp: 10, stats: { maxHp: 10 } }, {});
    HUD.renderSpeedGauge({ speed: 1, roadBonus: 0 }, {});
    HUD.renderAmmoSlots({ ammoLoadout: ['ap'] }, {});
    HUD.renderSkillSlots({ skillSlots: [null, null, null] }, { skillSlots: () => [null, null, null], hasAbility: () => false }, {});
    HUD.renderPassiveSlots({}, { passiveSlotState: () => ({ max: 2, cardIds: [] }) }, {});
    HUD.renderAbilityCdBadges({ abilityCds: {} }, {});
  } catch (e) { threw = e; }
  ok(threw === null, `宿主缺全部 DOM 时不抛错（${threw ? threw.message : '无异常'}）`);
}
{
  // Node 无 document 时也不得崩（浏览器外的调用方，如测试/工具脚本）
  delete global.document;
  let threw = null;
  try { HUD.renderPlayerVitals({ hp: 1, stats: { maxHp: 1 } }, {}); } catch (e) { threw = e; }
  ok(threw === null, '无 document 时静默返回（Node 端安全）');
}

// ==================== ⑦ 模块契约 ====================
{
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'tank_hud_panel.js'), 'utf8');
  ok(typeof globalThis.TankHudPanel === 'object', '浏览器命名空间 globalThis.TankHudPanel 已挂载');
  ok(/font-size\s*:\s*9px/.test(src) === false, '负向：模块内不得出现 9px 硬编码字号（走 var(--fs-xs) 令牌）');
  ok(/var\(--fs-/.test(src), '字号使用设计令牌 var(--fs-*)');
  ok(!/document\.getElementById\('playerHpFill'\)/.test(src), '负向：不硬编码只属于 battle 的 DOM 查询（走注入 id）');
}

console.log('test-hud-panel: 完成所有检查');
if (fails === 0) console.log('test-hud-panel: 全部通过');
else { console.error(`test-hud-panel: ${fails} 项失败`); process.exit(1); }
