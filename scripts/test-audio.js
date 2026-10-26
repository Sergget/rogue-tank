// test-audio.js — M1/M2 声音系统测试（Node 端，纯逻辑）
// 验证 SOUND_DEFS 键齐备（≥8 历史基线）、参数合法、音量分级、playSound 在无 AudioContext 环境不抛错。
// 运行：node scripts/test-audio.js
'use strict';

const U = require('../js/tank_utils.js');
const RULES_MOD = require('../js/tank_rules.js');
global.TAU = U.TAU;
global.RULES = RULES_MOD.RULES;

let fails = 0;
let asserts = 0;
function ok(cond, label) {
  asserts++;
  if (cond) console.log('  ✓ ' + label);
  else { console.error('  ✗ ' + label); fails++; }
}

// 1) 导出完整性
const A = require('../js/tank_audio.js');
ok(typeof A.playSound === 'function', '导出 playSound');
ok(typeof A.initAudio === 'function', '导出 initAudio');
ok(typeof A.ensureAudio === 'function', '导出 ensureAudio');
ok(typeof A.validateSoundDefs === 'function', '导出 validateSoundDefs');
ok(A.SOUND_DEFS && typeof A.SOUND_DEFS === 'object', '导出 SOUND_DEFS');
ok(A.AUDIO_SETTINGS && typeof A.AUDIO_SETTINGS === 'object', '导出 AUDIO_SETTINGS');

// 2) SOUND_DEFS 动态对齐（不硬编码键数）
//    选择理由：P-21 M2 升级后 SOUND_DEFS 已从 8 键扩展至 13 键（engine/trackFx/flyby/ammoBlewAP/ammoBlewHE），
//    硬编码"恰有 N 键"会让每次合理增键都破坏测试。改为：
//    ① 键数 ≥ 历史基线 8（只增不减）；② 8 个历史必需键仍在（旧调用方 playSound('fire') 等兼容性保障）；
//    ③ 每个键的参数完整性交由第 3 节 validateSoundDefs + 第 3.1 节逐键结构抽查覆盖。
const LEGACY_KEYS = ['fire', 'pen', 'block', 'bounce', 'ammoBlew', 'trackBreak', 'fireDOT', 'ui'];
const keys = Object.keys(A.SOUND_DEFS);
ok(keys.length >= LEGACY_KEYS.length, `SOUND_DEFS 键数 ≥ ${LEGACY_KEYS.length}（实际 ${keys.length}）`);
ok(LEGACY_KEYS.every(k => keys.indexOf(k) !== -1), `${LEGACY_KEYS.length} 个历史必需键齐全：` + LEGACY_KEYS.join(', '));
ok(new Set(keys).size === keys.length, 'SOUND_DEFS 键名无重复');

// 3) 参数合法性（validateSoundDefs 空问题列表 = 全部合法）
const problems = A.validateSoundDefs();
ok(Array.isArray(problems), 'validateSoundDefs 返回数组');
ok(problems.length === 0, 'SOUND_DEFS 参数全部合法（问题数 ' + problems.length + '）');
if (problems.length) console.error('   问题明细:\n    - ' + problems.join('\n    - '));

// 3.1) 每个 def 的结构抽查（bus 分级 + 非空 layers + 正 gain）
for (const k of keys) {
  const d = A.SOUND_DEFS[k];
  ok(typeof d.label === 'string' && d.label.length > 0, `${k}.label 非空字符串`);
  ok(d.bus === 'combat' || d.bus === 'ui', `${k}.bus ∈ {combat,ui}`);
  ok(Array.isArray(d.layers) && d.layers.length > 0, `${k}.layers 非空`);
  ok(d.gain > 0, `${k}.gain > 0`);
  ok(d.layers.every(L => L.dur > 0 && L.gain > 0), `${k}.layers 的 dur/gain 均 > 0`);
}

// 4) 音量分级：战斗 > UI，且两档均为正
ok(A.AUDIO_SETTINGS.combatGain > 0, 'AUDIO_SETTINGS.combatGain > 0');
ok(A.AUDIO_SETTINGS.uiGain > 0, 'AUDIO_SETTINGS.uiGain > 0');
ok(A.AUDIO_SETTINGS.combatGain > A.AUDIO_SETTINGS.uiGain, 'combatGain > uiGain（战斗音效响于 UI）');

// 5) playSound 在无 AudioContext 环境不抛错（Node 加载/调用安全）
let threw = false, ret = null;
try { ret = A.playSound('fire'); } catch (e) { threw = true; }
ok(!threw, 'playSound("fire") 不抛错');
ok(ret === false, '无 AudioContext 环境 playSound 返回 false（静默跳过）');
ok(A.playSound('bogus') === false, '未知键返回 false');
ok(A.ensureAudio() === null, 'ensureAudio 无 AudioContext 返回 null');
ok(A.initAudio() === null, 'initAudio 无 AudioContext 返回 null');

// 6) #AA-c（2026-10-26）：电磁炮充能循环音频
//   三段式声学：充能循环（代码驱动持续实例）+ 就绪瞬态（SOUND_DEFS.railReady）+ 开火瞬态（firerelay→firerail）。
//   循环为什么不是 SOUND_DEFS 键：那张表的每一层都是一次性 start→收敛→stop，表达不了「随进度持续上升」。
ok(typeof A.railChargeFreqFor === 'function', '导出 railChargeFreqFor（纯频率映射）');
ok(typeof A.startRailChargeLoop === 'function', '导出 startRailChargeLoop');
ok(typeof A.updateRailChargePitch === 'function', '导出 updateRailChargePitch');
ok(typeof A.stopRailChargeLoop === 'function', '导出 stopRailChargeLoop');
ok(typeof A.SOUND_DEFS.railReady === 'object', 'SOUND_DEFS 含 railReady 键（就绪瞬态）');
ok(typeof A.SOUND_DEFS.firerail === 'object', 'SOUND_DEFS 保留 firerail（开火瞬态）');

// 6.1) 频率映射：随进度单调上升、两端贴合 RULES 唯一口径、非法输入不产生 NaN
//      （`RULES` 在 types/globals.d.ts 是 any，但走 require 时 tsc 会推断出更窄的类型 ⇒ 这里显式 any）
const ra = /** @type {any} */ ((RULES_MOD.RULES.railgunFx && RULES_MOD.RULES.railgunFx.audio) || {});
ok(typeof ra.freqMin === 'number' && typeof ra.freqMax === 'number' && ra.freqMax > ra.freqMin,
   `RULES.railgunFx.audio 提供 freqMin/freqMax 且 max > min（${ra.freqMin}→${ra.freqMax}Hz）`);
ok(A.railChargeFreqFor(0) === ra.freqMin, `progress=0 → freqMin（${A.railChargeFreqFor(0)}Hz）`);
ok(A.railChargeFreqFor(1) === ra.freqMax, `progress=1 → freqMax（${A.railChargeFreqFor(1)}Hz）`);
const mid = A.railChargeFreqFor(0.5);
ok(mid > ra.freqMin && mid < ra.freqMax, `progress=0.5 落在两端之间（${mid.toFixed(1)}Hz）`);
let mono = true;
for (let i = 1; i <= 20; i++) {
  if (!(A.railChargeFreqFor(i / 20) > A.railChargeFreqFor((i - 1) / 20))) mono = false;
}
ok(mono, 'progress 0→1 的 20 段全部严格单调上升（无回退/平台）');
[NaN, Infinity, -Infinity, undefined, null, '0.5'].forEach(v => {
  const f = A.railChargeFreqFor(v);
  ok(typeof f === 'number' && isFinite(f) && f >= ra.freqMin && f <= ra.freqMax,
     `railChargeFreqFor(${String(v)}) 有限且被 clamp（${f}Hz）`);
});
ok(A.railChargeFreqFor(-5) === ra.freqMin, 'progress < 0 钳到 freqMin');
ok(A.railChargeFreqFor(99) === ra.freqMax, 'progress > 1 钳到 freqMax');

// 6.2) 生命周期：无 AudioContext 环境下全部 no-op，且不抛错（Node 断言）
let railThrew = false, started = null, pitched = null, stopped = null;
try {
  started = A.startRailChargeLoop();
  pitched = A.updateRailChargePitch(0.7);
  stopped = A.stopRailChargeLoop();
  stopped = A.stopRailChargeLoop();   // 幂等：重复 stop 不抛错
} catch (e) { railThrew = true; }
ok(!railThrew, 'rail 三件套在无 AudioContext 环境不抛错');
ok(started === false, 'startRailChargeLoop 无 AudioContext 返回 false（不打桩、不静默假成功）');
ok(pitched === 0, 'updateRailChargePitch 未在充能时返回 0（不是 NaN）');
ok(stopped === false, 'stopRailChargeLoop 未在充能时返回 false 且幂等');

console.log(`test-audio: ${asserts} 项断言完成`);
if (fails === 0) console.log('test-audio: 全部通过');
else console.error(`test-audio: ${fails} 项失败`);
process.exit(fails === 0 ? 0 : 1);
