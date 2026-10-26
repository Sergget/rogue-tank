// test-hud-road-bonus.js — #AA1（2026-10-26）公路加成 HUD 文案口径回归。
// 背景：`roadBonus` 与 `stats.maxSpeed` **同尺度**（js/tank_move.js:113-121 以 bonusPx = kmh / kmhFactor
//   写入并在 maxSpeed 尺度相加），旧 HUD 又除了一遍 pxFactor×effMul（那是**像素速度** t.speed 的口径）
//   ⇒ 标「+5km/h」而实机 +10km/h，读数低估一半。
// 覆盖：① roadBonusKmh 与 tankKmh 同源 ② 文案数值 ≡ RULES.nodeMap.road.speedBonusKmh
//   ③ 旧口径必须被证伪（不是等价改写）④ 边界值（0 / 负数 / NaN / Infinity / 字符串）
//   ⑤ 源码负向断言：HUD 块不得再出现 pxFactor|effMul
// 运行：node scripts/test-hud-road-bonus.js
'use strict';

const fs = require('fs');
const path = require('path');
const U = require('../js/tank_utils.js');
const R = require('../js/tank_rules.js');
global.TAU = U.TAU;
global.RULES = R.RULES;
const MD = require('../js/tank_model.js');

let fails = 0;
function ok(cond, label){
  if(cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}`); fails++; }
}

const RSp = R.RULES.speed;
const bonusKmh = R.RULES.nodeMap.road.speedBonusKmh;
const bonusPx = bonusKmh / RSp.kmhFactor;     // driveTank 写入 t.roadBonus 的口径

// ① 文案数值 ≡ 配置源（同源断言：防第三处换算再漂）
const shown = MD.roadBonusKmh(bonusPx);
ok(shown === bonusKmh,
   `HUD 文案数值 ≡ RULES.nodeMap.road.speedBonusKmh（${bonusPx}px → ${shown}km/h，配置 ${bonusKmh}）`);

// ①b 与 tankKmh 一把尺子（maxSpeed 尺度 → km/h）
const viaTankKmh = MD.tankKmh({ stats: { maxSpeed: bonusPx } });
ok(viaTankKmh === shown,
   `与 tankKmh 同源（tankKmh(${bonusPx}px)=${viaTankKmh} / roadBonusKmh=${shown}）`);

// ② 旧口径必须被证伪——防有人把「除 pxFactor×effMul」当等价改写搬回来
const legacy = Math.round(bonusPx * RSp.kmhFactor / (RSp.pxFactor * RSp.effMul));
ok(legacy !== bonusKmh,
   `旧口径（除 pxFactor×effMul）确为低估：${legacy}km/h vs 现行 ${bonusKmh}km/h`);

// ③ 边界：非有限/非正一律 0（HUD 只在 >0 时渲染，避免「公路 +0km/h」）
[0, -5, NaN, Infinity, -Infinity, undefined, null, '25'].forEach(v => {
  ok(MD.roadBonusKmh(v) === 0, `roadBonusKmh(${String(v)}:${typeof v}) === 0`);
});

// ④ 源码：HUD 块走 roadBonusKmh，且像素速度口径（pxFactor/effMul）不得混入。
//   断言前剥掉 `//` 注释行——注释里提到旧口径（历史沿革）是允许的，代码里出现才是回归。
const battleSrc = fs.readFileSync(path.join(__dirname, '..', 'tank_battle.html'), 'utf8');
const m = battleSrc.match(/if\(roadEl\)\{[\s\S]*?\n  \}/);
ok(!!m, 'tank_battle.html 找到公路加成 HUD 块（if(roadEl){ … }）');
if(m){
  const code = m[0].split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
  ok(/roadBonusKmh\(/.test(code), 'HUD 块经 roadBonusKmh 换算');
  ok(!/pxFactor|effMul/.test(code), 'HUD 块代码不含 pxFactor/effMul（像素速度换算不得混用）');
  ok(/'公路 \+'/.test(code), 'HUD 文案前缀「公路 +」保持');
}

// ⑤ #AA7（2026-10-26 用户裁定「速度不再需要使用一个进度条」）：速度条整条删除，只留精确读数。
//    条把「当前速度 / 上限」重复编码成图形（且公路加成使读数越过 `tankKmh` 满格时会被 clamp 在
//    100%，正是 #AA1 附带误读的根源）⇒ 删条后该歧义从结构上消失。
// 断言前剥掉 `/* … */` 注释：注释里记录「删掉了哪两个 id」是沿革，不是定义。
const cssBlock = battleSrc.slice(0, battleSrc.indexOf('</style>')).replace(/\/\*[\s\S]*?\*\//g, '');
ok(!/hudSpeedTrack|hudSpeedFill/.test(cssBlock), '样式表不再定义速度条（#hudSpeedTrack/#hudSpeedFill）');
const bodyBlock = battleSrc.slice(battleSrc.indexOf('<body'));
ok(!/id="hudSpeedTrack"|id="hudSpeedFill"/.test(bodyBlock), 'DOM 不再有速度条节点');
ok(/id="hudSpeedVal"/.test(bodyBlock) && /id="hudRoadBonus"/.test(bodyBlock),
   '速度读数与公路加成标记仍在（删条不删读数）');
const jsPart = battleSrc.slice(battleSrc.indexOf('</style>'));
ok(!/hudSpeedFill|spFill/.test(jsPart), '负向：脚本不再读写速度条（spFill）');

process.exitCode = fails ? 1 : 0;
if(fails) console.error(`\n${fails} 项失败`);
else console.log('\n全部通过');
