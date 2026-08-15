// test-audio.js — M1 声音占位系统测试（Node 端，纯逻辑）
// 验证 SOUND_DEFS 8 键齐全、参数合法、音量分级、playSound 在无 AudioContext 环境不抛错。
// 运行：node scripts/test-audio.js
'use strict';

const A = require('../js/tank_audio.js');

let fails = 0;
let asserts = 0;
function ok(cond, label) {
  asserts++;
  if (cond) console.log('  ✓ ' + label);
  else { console.error('  ✗ ' + label); fails++; }
}

// 1) 导出完整性
ok(typeof A.playSound === 'function', '导出 playSound');
ok(typeof A.initAudio === 'function', '导出 initAudio');
ok(typeof A.ensureAudio === 'function', '导出 ensureAudio');
ok(typeof A.validateSoundDefs === 'function', '导出 validateSoundDefs');
ok(A.SOUND_DEFS && typeof A.SOUND_DEFS === 'object', '导出 SOUND_DEFS');
ok(A.AUDIO_SETTINGS && typeof A.AUDIO_SETTINGS === 'object', '导出 AUDIO_SETTINGS');

// 2) SOUND_DEFS 恰有 8 键且无多余键
const REQUIRED_KEYS = ['fire', 'pen', 'block', 'bounce', 'ammoBlew', 'trackBreak', 'fireDOT', 'ui'];
const keys = Object.keys(A.SOUND_DEFS);
ok(keys.length === REQUIRED_KEYS.length, `SOUND_DEFS 键数 = ${REQUIRED_KEYS.length}（实际 ${keys.length}）`);
ok(REQUIRED_KEYS.every(k => keys.indexOf(k) !== -1), '8 个必需键齐全：' + REQUIRED_KEYS.join(', '));
ok(keys.every(k => REQUIRED_KEYS.indexOf(k) !== -1), '无多余键');

// 3) 参数合法性（validateSoundDefs 空问题列表 = 全部合法）
const problems = A.validateSoundDefs();
ok(Array.isArray(problems), 'validateSoundDefs 返回数组');
ok(problems.length === 0, 'SOUND_DEFS 参数全部合法（问题数 ' + problems.length + '）');
if (problems.length) console.error('   问题明细:\n    - ' + problems.join('\n    - '));

// 3.1) 每个 def 的结构抽查（bus 分级 + 非空 layers + 正 gain）
for (const k of keys) {
  const d = A.SOUND_DEFS[k];
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

console.log(`test-audio: ${asserts} 项断言完成`);
if (fails === 0) console.log('test-audio: 全部通过');
else console.error(`test-audio: ${fails} 项失败`);
process.exit(fails === 0 ? 0 : 1);
