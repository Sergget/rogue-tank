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

// 6.3) 2026-10-26（用户反馈四项）：Boss 电磁炮开火音效「像放箭，不是电磁炮轰响」+ 指向期静音
//      用户原话：「boss使用电磁炮时：音量太大……玩家被电磁炮激光指向时不需要有音效，
//      电磁炮发射炮弹的音效像射箭而不是发射了电磁炮」。
//      分工：Boss ⇒ bossRailFire（本段锁定），玩家 ⇒ firerail（三段放电声学保持不变）。
const bossRailCfg = /** @type {any} */ ((RULES_MOD.RULES.boss && RULES_MOD.RULES.boss.railgun) || {});
const brf = A.SOUND_DEFS.bossRailFire;
ok(!!brf && typeof brf === 'object', 'SOUND_DEFS 含 bossRailFire 键（Boss 电磁炮开火）');
ok(A.SOUND_DEFS.firerail && brf && brf !== A.SOUND_DEFS.firerail, 'bossRailFire 与 firerail 是两个键（玩家侧不受影响）');
ok(bossRailCfg.fireSoundKey === 'bossRailFire',
  `RULES.boss.railgun.fireSoundKey = bossRailFire（实际 ${bossRailCfg.fireSoundKey}）`);
ok(bossRailCfg.aimAudio === false,
  'RULES.boss.railgun.aimAudio = false（指向期静音，只留屏幕预警）');
if (brf) {
  // 音量：Boss 开火增益必须低于玩家电磁炮 —— 这是「音量太大」的直接落点
  ok(brf.gain < A.SOUND_DEFS.firerail.gain,
    `Boss 开火增益 ${brf.gain} < firerail ${A.SOUND_DEFS.firerail.gain}（更轻）`);
  // 声学：不含低频炮身共鸣（firerail 的 sawtooth 190→40Hz 是「像电磁炮」的主因）
  const oscLayers = brf.layers.filter(L => L.kind === 'osc');
  ok(oscLayers.length > 0 && oscLayers.every(L => L.f0 >= 100),
    `osc 层全部 ≥ 100Hz（${oscLayers.map(L => L.f0 + '→' + L.f1).join(', ')}；无炮身低频尾）`);
  ok(brf.layers.every(L => L.dur <= 0.35),
    '全部层 dur ≤ 0.35s（弓弦/破空都是短瞬态，没有轰响长尾）');
  ok(brf.layers.some(L => L.kind === 'osc' && L.wave === 'triangle'), '含三角波下滑层（弓弦松脱的「崩」）');
  ok(brf.layers.some(L => L.kind === 'noise' && L.filter === 'highpass'), '含高通噪声层（箭矢破空）');
}

// 6.4) 2026-10-27（用户反馈）：「充能的音效太尖锐、时间太长，只在充能完毕前有一点电流声」
//      三件事 → 三个可失败断言：① 波形/频段不再尖（triangle + 上限 ≤600Hz + 增益下调）；
//      ② 有**可听窗口**（windowSeconds < 1s，不再是整段装填）；③ 窗口内音高从 freqMin 完整扫到 freqMax。
const railWin = ra.windowSeconds;
ok(typeof railWin === 'number' && railWin > 0 && railWin < 1,
  `RULES.railgunFx.audio.windowSeconds = ${railWin}s（< 1s：只覆盖充满前一小段，不再是整段装填）`);
ok(ra.chargeWave === 'triangle',
  `chargeWave = ${ra.chargeWave}（三角波；旧 sawtooth 的谐波列是「太尖锐」的来源）`);
ok(ra.freqMax <= 600, `freqMax = ${ra.freqMax}Hz ≤ 600（旧 760Hz 偏高偏尖）`);
ok(ra.gain < 0.16, `循环增益 ${ra.gain} < 0.16（旧值更响）`);
ok(typeof A.railChargeWindowProgress === 'function', '导出 railChargeWindowProgress（可听窗口局部进度）');
ok(A.railChargeWindowProgress(railWin * 2) === null,
  `剩余 ${railWin * 2}s（窗口外）→ null（不响）`);
ok(A.railChargeWindowProgress(railWin) === 0, '窗口起点（剩余 = windowSeconds）→ 0');
ok(Math.abs(A.railChargeWindowProgress(railWin / 2) - 0.5) < 1e-9, '窗口中点 → 0.5');
ok(A.railChargeWindowProgress(0) === 1, '充满（剩余 0）→ 1');
ok(A.railChargeWindowProgress(-0.1) === null, '负剩余 → null（负向：已满/非法不响）');
[NaN, Infinity, -Infinity, undefined, null, '0.2'].forEach(v => {
  ok(A.railChargeWindowProgress(v) === null, `railChargeWindowProgress(${String(v)}) → null（不产生 NaN 频率）`);
});
// 窗口内音高单调上行，且两端严格贴合 freqMin / freqMax（=「有一点电流声」的完整扫频）
let winMono = true;
for (let i = 1; i <= 20; i++) {
  const a = A.railChargeFreqFor(A.railChargeWindowProgress(railWin * (1 - (i - 1) / 20)));
  const b = A.railChargeFreqFor(A.railChargeWindowProgress(railWin * (1 - i / 20)));
  if (!(b > a)) winMono = false;
}
ok(winMono, '窗口内 20 段音高严格单调上行（无平台/回退）');
ok(A.railChargeFreqFor(A.railChargeWindowProgress(railWin)) === ra.freqMin, '窗口起点音高 = freqMin');
ok(A.railChargeFreqFor(A.railChargeWindowProgress(0)) === ra.freqMax, '充满时音高 = freqMax');

console.log(`test-audio: ${asserts} 项断言完成`);
if (fails === 0) console.log('test-audio: 全部通过');
else console.error(`test-audio: ${fails} 项失败`);
process.exit(fails === 0 ? 0 : 1);
