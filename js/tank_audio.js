'use strict';

// tank_audio.js — M1 声音占位系统：Web Audio 程序化合成音效（M2 升级）。
//   键数以 `Object.keys(SOUND_DEFS)` 为准（2026-10-26 实测 15 键；勿在注释里硬编码，本文件名不再复述）。
//
// 全部零音频资产（全合成，不引入任何文件）。音效参数表 SOUND_DEFS 与音量分级
// AUDIO_SETTINGS 为模块顶层纯数据（Node 可安全加载/测试）；合成逻辑只出现在函数
// 体内，并以 typeof AudioContext 守卫（Node 加载/调用安全，浏览器自动播放策略下
// AudioContext 惰性创建、首次用户交互解锁）。
//
// 空间音效层：使用 Web Audio API 的 PannerNode 实现 2D 空间定位（水平平面 panning）
// 与距离衰减（exponential rolloff）。所有合成音效均通过统一的 PannerNode 路由，
// 位置由调用者在 playSound(key, opts, {x, y}) 中指定；若未提供则使用听众中心。
//
// 浏览器全局（按序加载后可用）：
//   SOUND_DEFS          — 音效参数表（fire/pen/block/bounce/ammoBlew/ammoBlewAP/ammoBlewHE/trackBreak/fireDOT/
//                         ui/engine/flyby/trackFx/firerail/railReady）
//   AUDIO_SETTINGS      — 音量分级（combatGain 战斗 / uiGain UI）
//   playSound(key, opts?, pos?) — 单入口播放，pos?: {x, y} 空间位置（像素，相对 canvas 原点）
//   initAudio() / ensureAudio() — 惰性创建并 resume AudioContext
//   validateSoundDefs() — 纯逻辑参数校验（返回问题列表，空数组 = 全部合法）
//   setListenerPos(x, y) — 设置听众位置（默认 0, 0）
//   Engine/track/flyby 实时音效管理（见下文 “实时音效实例”一节）
//
// 层（layer）约定：每类音效 = bus（combat/ui 音量总线）+ 一个或多个 layers：
//   osc  层: { kind:'osc',  wave, f0, f1, dur, gain, attack }     振荡器 + 频率滑音 + 增益包络
//   noise 层: { kind:'noise', dur, gain, attack, filter?, filterFreq? } 白噪声突发 + 可选滤波
//   任意层可带 delay（相对音效起始的延迟秒数，用于多段打击声）。
//   新增: 空间层属性 { x, y } 可在 playSound 时覆盖默认听众位置。

// ---------- 可配置参数表（纯数据，Node 可测） ----------
const SOUND_DEFS = {
  // 开火：低沉短促的炮弹出膛爆响（锯齿波低频滑音 + 高频噪声瞬态）
  fire: {
    label: '开火', bus: 'combat', gain: 1.0,
    layers: [
      { kind: 'osc',   wave: 'sawtooth', f0: 220, f1: 42,  dur: 0.30, gain: 0.85, attack: 0.004 },
      { kind: 'noise', dur: 0.16, gain: 0.45, attack: 0.002, filter: 'lowpass', filterFreq: 2200 }
    ]
  },
  // 击穿：锐利短促的金属脆响（高频三角波下滑 + 高频噪声）
  pen: {
    label: '击穿', bus: 'combat', gain: 0.9,
    layers: [
      { kind: 'osc',   wave: 'triangle', f0: 950, f1: 220, dur: 0.14, gain: 0.7,  attack: 0.002 },
      { kind: 'noise', dur: 0.10, gain: 0.40, attack: 0.001, filter: 'highpass', filterFreq: 2500 }
    ]
  },
  // 未击穿：钝感沉闷的撞击（低音正弦下滑 + 低频噪声）
  block: {
    label: '未击穿', bus: 'combat', gain: 0.8,
    layers: [
      { kind: 'osc',   wave: 'sine', f0: 180, f1: 55,  dur: 0.16, gain: 0.8,  attack: 0.004 },
      { kind: 'noise', dur: 0.07, gain: 0.22, attack: 0.001, filter: 'lowpass', filterFreq: 900 }
    ]
  },
  // 跳弹：上扬的尖锐啸声（三角波快速上行 + 带通噪声）
  bounce: {
    label: '跳弹', bus: 'combat', gain: 0.75,
    layers: [
      { kind: 'osc',   wave: 'triangle', f0: 650, f1: 1900, dur: 0.18, gain: 0.55, attack: 0.004 },
      { kind: 'noise', dur: 0.09, gain: 0.30, attack: 0.002, filter: 'bandpass', filterFreq: 3200 }
    ]
  },
  // 殉爆：大规模沉闷爆轰（双振荡器低频滑音 + 长噪声隆隆）
  ammoBlew: {
    label: '殉爆', bus: 'combat', gain: 1.0,
    layers: [
      { kind: 'osc',   wave: 'sawtooth', f0: 140, f1: 28, dur: 0.85, gain: 0.80, attack: 0.003 },
      { kind: 'osc',   wave: 'sine',     f0: 95,  f1: 24, dur: 0.90, gain: 0.70, attack: 0.003 },
      { kind: 'noise', dur: 0.55, gain: 0.45, attack: 0.002, filter: 'lowpass', filterFreq: 1100 }
    ]
  },
  // 履带断：金属断裂的连续崩响（方波下滑 + 三段错开噪声打击）
  trackBreak: {
    label: '履带断', bus: 'combat', gain: 0.7,
    layers: [
      { kind: 'osc',   wave: 'square', f0: 240, f1: 90, dur: 0.20, gain: 0.45, attack: 0.003 },
      { kind: 'noise', dur: 0.06, gain: 0.40, attack: 0.001, filter: 'bandpass', filterFreq: 1800 },
      { kind: 'noise', dur: 0.05, gain: 0.35, attack: 0.001, filter: 'bandpass', filterFreq: 1400, delay: 0.10 },
      { kind: 'noise', dur: 0.04, gain: 0.30, attack: 0.001, filter: 'bandpass', filterFreq: 1000, delay: 0.18 }
    ]
  },
  // 起火：持续燃烧的低沉呼轰（单帧触发一次，非循环；低频正弦 + 低通噪声，长慢包络）
  fireDOT: {
    label: '起火', bus: 'combat', gain: 0.6,
    layers: [
      { kind: 'osc',   wave: 'sine', f0: 70, f1: 45, dur: 1.00, gain: 0.50, attack: 0.12 },
      { kind: 'noise', dur: 0.90, gain: 0.28, attack: 0.15, filter: 'lowpass', filterFreq: 600 }
    ]
  },
  // UI 交互：短促清脆的按键提示音（单正弦短促下滑）
  ui: {
    label: 'UI 交互', bus: 'ui', gain: 0.8,
    layers: [
      { kind: 'osc', wave: 'sine', f0: 880, f1: 640, dur: 0.07, gain: 0.6, attack: 0.002 }
    ]
  },

  // --- 新增 M2 音效 ---

  // 引擎轰鸣：根据转速/速度动态改变音高的低沉隆隆声。
  // 使用低频振荡器 + 滑音 + 适度噪声，音高随 tank.speed 线性映射。
  // 由 engineSoundManager 持续管理（播放/暂停/ pitch 更新）。
  engine: {
    label: '引擎', bus: 'combat', gain: 0.7,
    layers: [
      { kind: 'osc',   wave: 'sine', f0: 100, f1: 200, dur: 10, gain: 0.6, attack: 0.01 },  // 滑音将由引擎管理器实时覆盖
      { kind: 'noise', dur: 0.80, gain: 0.25, attack: 0.05, filter: 'lowpass', filterFreq: 300 }
    ]
  },

  // 履带金属摩擦声：周期性短促的金属研磨/咔哒声，随车速出现。
  // 短 burst + 高通滤波，音高随速度轻微升高。
  trackFx: {
    label: '履带fx', bus: 'combat', gain: 0.5,
    layers: [
      { kind: 'noise', dur: 0.08, gain: 0.35, attack: 0.001, filter: 'highpass', filterFreq: 1200 }
    ]
  },

  // 近距离炮弹划过空气呼啸声（Flyby）。
// 通道音效（非空间化默认），但在 playSound 时可传入 {x, y} 位置由 PannerNode 空间化。
// f0/f1 做快速下行滑音模拟“呼啸”感；较短的 dur 确保其作为通道音效播放。
// 空间定位由调用者通过 opts.pos 控制。
  flyby: {
    label: '飞越', bus: 'combat', gain: 0.8,
    layers: [
      { kind: 'osc',   wave: 'triangle', f0: 800, f1: 120, dur: 0.90, gain: 0.7, attack: 0.002 },
      { kind: 'noise', dur: 0.25, gain: 0.20, attack: 0.001, filter: 'bandpass', filterFreq: 2500 }
    ]
  },

  // 不同弹种的爆轰细微差异——在 ammoBlew 基础上增加弹种标识。
// 当前键名仍为 ammoBlew（殉爆），因为殉爆触发时弹种由 resolveHit 通过 shell.ammoKey 决定。
// 如需细分可在 future 扩展为 ammoBlewAP / ammoBlewHE 等；此处保持兼容。
  ammoBlewAP: {
    label: '殉爆(AP)', bus: 'combat', gain: 1.0,
    layers: [
      { kind: 'osc',   wave: 'sawtooth', f0: 150, f1: 30, dur: 0.70, gain: 0.85, attack: 0.003 },
      { kind: 'osc',   wave: 'sine',     f0: 110, f1: 26, dur: 0.75, gain: 0.75, attack: 0.003 },
      { kind: 'noise', dur: 0.45, gain: 0.40, attack: 0.002, filter: 'lowpass', filterFreq: 1300 }
    ]
  },
  ammoBlewHE: {
    label: '殉爆(HE)', bus: 'combat', gain: 1.0,
    layers: [
      { kind: 'osc',   wave: 'sawtooth', f0: 130, f1: 26, dur: 0.90, gain: 0.78, attack: 0.003 },
      { kind: 'osc',   wave: 'sine',     f0: 85,  f1: 22, dur: 0.95, gain: 0.68, attack: 0.003 },
      { kind: 'noise', dur: 0.60, gain: 0.48, attack: 0.002, filter: 'lowpass', filterFreq: 950 }
    ]
  },

  // 电磁轨道炮开火（#U38，2026-10-18）。
  // 为什么单独一个键：电磁发射没有火药爆燃，声学特征完全不同——不是「砰」而是
  //   ① 高频电流充能的「嗞」→ ② 瞬间放电的尖锐撕拉（宽频噪声横扫）→ ③ 剩下的低腔共鸣。
  // 三层正好对应三段：firerail(高频方波下扫 = 电容放电) + 噪声(带通高扫 = 电离空气) + 低频尾(炮身共鸣)。
  firerail: {
    label: '电磁炮开火', bus: 'combat', gain: 1.0,
    layers: [
      { kind: 'osc',   wave: 'square', f0: 2400, f1: 320, dur: 0.16, gain: 0.55, attack: 0.001 },
      { kind: 'noise', dur: 0.22, gain: 0.50, attack: 0.001, filter: 'bandpass', filterFreq: 4200 },
      { kind: 'osc',   wave: 'sawtooth', f0: 190, f1: 40, dur: 0.34, gain: 0.62, attack: 0.004, delay: 0.03 },
      { kind: 'noise', dur: 0.30, gain: 0.22, attack: 0.01, filter: 'lowpass', filterFreq: 900, delay: 0.04 }
    ]
  },

  // 电磁轨道炮**就绪**提示（AA-c，2026-10-26）：充能到 100% 当帧播一次的双响。
  // 与 firerail 分工——firerail 是开火瞬态（已含放电撕拉 + 炮身共鸣）；本键是「可以打了」的
  //   听觉信号：高频短促、不碰低频区，避免和发射声混淆。充能**过程**的电流声不是键，
  //   是代码驱动的循环实例（见 startRailChargeLoop，参数唯一口径 RULES.railgunFx.audio）。
  railReady: {
    label: '电磁炮就绪', bus: 'combat', gain: 0.8,
    layers: [
      { kind: 'osc', wave: 'sine', f0: 1320, f1: 1320, dur: 0.07, gain: 0.30, attack: 0.002 },
      { kind: 'osc', wave: 'sine', f0: 1760, f1: 1760, dur: 0.07, gain: 0.24, attack: 0.002, delay: 0.10 }
    ]
  }
};

// 音量分级：战斗音效 vs UI 音效两档增益（可配，浏览器生效；Node 可测）
const AUDIO_SETTINGS = {
  combatGain: 0.5,
  uiGain: 0.25
};

// ---------- 采样通道 (Sample Channel) ----------
// 每个 SOUND_DEFS 键对应一个可选的真实音频采样文件（相对 URL）。
// 加载成功时优先播放采样，失败/超时/file:// 环境自动回退到程序化合成。
// 路径表为纯数据（Node 可测）；浏览器侧按需 fetch + decodeAudioData 缓存。
const AUDIO_SAMPLE_TIMEOUT_MS = 4000;
const AUDIO_SAMPLE_PATHS = {};
for (const _k of Object.keys(SOUND_DEFS)) {
  AUDIO_SAMPLE_PATHS[_k] = 'audio/' + _k + '.wav';
}

// 浏览器侧采样缓存：key -> AudioBuffer（已加载）/ null（失败）/ undefined（未尝试）
const _sampleBuffers = {};
const _sampleLoading = {};


// --- 实时音效实例（浏览器运行时唯一） ---
// 这些变量仅在浏览器中有效（Node 加载时 AudioContext 守卫会跳过）
// 沿革（AA-c，2026-10-26）：`engineOsc` / `engineGain` / `lastEngineSpeed` 与
//   `startEngineSound` / `stopEngineSound` / `updateEnginePitch` 一并删除——全仓零调用且未导出（死代码）。
//   将来若要做引擎转速声，按下方 railChargeLoop 的范式（代码驱动持久实例 + `RULES` 参数）重建，
//   不要再用「一次性 SOUND_DEFS 层」表达持续音。

// Track friction：周期性播放的短音效计时器
let trackFxTimer = 0;
const TRACK_FX_INTERVAL = 0.3; // 秒，每 0.3s 播放一次（当车速不为 0 时）

// Flyby 声音缓存：最近播放的 flyby 实例，用于空间定位追踪
let lastFlyby = null;

// 听众位置（像素坐标，相对于 canvas 原点）
let listenerX = 0;
let listenerY = 0;

// 设置听众位置
function setListenerPos(x, y){
  listenerX = x;
  listenerY = y;
}

// --- #AA-c（2026-10-26）：电磁轨道炮**充能循环**（代码驱动的持续实例，不是 SOUND_DEFS 键） ---
// 为什么必须是代码驱动：SOUND_DEFS 的每一层都是「一次性 start→包络收敛到 0.0001→stop」，
//   表达不了「随充能进度单调上升的持续电流声」。参数唯一口径 `RULES.railgunFx.audio`
//   （现行值见 specs/combat/audio.md「电磁轨道炮三段声学」）。
// 安全契约：Node 测试 / 未解锁 AudioContext / 不支持 Web Audio 的环境里**全部 no-op**，
//   不抛错、不产生 NaN 频率（回归：scripts/test-audio.js 的 rail 段）。
let railChargeOsc = null;
let railChargeGain = null;

// 纯函数：progress(0..1) → 基频 Hz。clamp + 非有限值按 0 处理——
//   NaN 一旦写进 `OscillatorNode.frequency` 会让后续 setValueAtTime 全部失效（而且不报错）。
function railChargeFreqFor(progress){
  const cfg = (typeof RULES !== 'undefined' && RULES.railgunFx && RULES.railgunFx.audio) || {};
  const f0 = (typeof cfg.freqMin === 'number' && isFinite(cfg.freqMin)) ? cfg.freqMin : 110;
  const f1 = (typeof cfg.freqMax === 'number' && isFinite(cfg.freqMax)) ? cfg.freqMax : 760;
  let p = (typeof progress === 'number' && isFinite(progress)) ? progress : 0;
  p = Math.max(0, Math.min(1, p));
  return f0 + (f1 - f0) * p;
}

// 起：幂等（已在充能时返回 true）。返回 false = 无音频环境或创建失败。
function startRailChargeLoop(){
  const ctx = (typeof ensureAudio === 'function') ? ensureAudio() : null;
  if(!ctx || !_master) return false;
  if(railChargeOsc) return true;
  const cfg = (RULES && RULES.railgunFx && RULES.railgunFx.audio) || {};
  const wave = cfg.chargeWave || 'sawtooth';
  const gain = (typeof cfg.gain === 'number') ? cfg.gain : 0.16;
  const attack = (typeof cfg.attack === 'number') ? Math.max(0, cfg.attack) : 0.25;
  try {
    railChargeGain = ctx.createGain();
    railChargeGain.gain.setValueAtTime(0.0001, ctx.currentTime);
    railChargeGain.gain.linearRampToValueAtTime(Math.max(0.0001, gain), ctx.currentTime + attack);
    railChargeGain.connect(_master);
    railChargeOsc = ctx.createOscillator();
    railChargeOsc.type = wave;
    railChargeOsc.frequency.setValueAtTime(railChargeFreqFor(0), ctx.currentTime);
    railChargeOsc.connect(railChargeGain);
    railChargeOsc.start();
    return true;
  } catch(e){
    railChargeOsc = null; railChargeGain = null;
    return false;
  }
}

// 改音高：返回实际写入的频率（0 = 未在充能 / 写入失败），供 Node 断言使用。
function updateRailChargePitch(progress){
  const f = railChargeFreqFor(progress);
  if(!railChargeOsc || !_audioCtx) return 0;
  try {
    railChargeOsc.frequency.setValueAtTime(f, _audioCtx.currentTime);
    return f;
  } catch(e){ return 0; }
}

// 停：先做 release 淡出再从图上摘掉振荡器（直接 stop 会有"咔"声）。幂等。
function stopRailChargeLoop(){
  if(!railChargeOsc) return false;
  const ctx = _audioCtx;
  const cfg = (RULES && RULES.railgunFx && RULES.railgunFx.audio) || {};
  const release = (typeof cfg.release === 'number') ? Math.max(0, cfg.release) : 0.12;
  const osc = railChargeOsc, gainNode = railChargeGain;
  railChargeOsc = null; railChargeGain = null;
  try {
    if(ctx && gainNode){
      gainNode.gain.cancelScheduledValues(ctx.currentTime);
      gainNode.gain.setValueAtTime(Math.max(0.0001, gainNode.gain.value), ctx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + release);
    }
  } catch(e){ /* 包络异常不阻断收尾 */ }
  try {
    setTimeout(function(){
      try { osc.stop(); } catch(e){}
      try { osc.disconnect(); } catch(e){}
      try { if(gainNode) gainNode.disconnect(); } catch(e){}
    }, Math.round(release * 1000) + 20);
  } catch(e){}
  return true;
}

// --- Track friction sound manager ---
// 当车辆移动时周期性播放履带摩擦音。
function updateTrackFx(ctx, speed){
  if(Math.abs(speed) < 0.1){ // 停止
    trackFxTimer = 0;
    return;
  }
if(trackFxTimer <= 0){
    // 播放一次简短的摩擦音
    playSound('trackFx', { gain: 0.4 }); // 不传 pos -> 使用默认听众位置
    trackFxTimer = TRACK_FX_INTERVAL;
}
  trackFxTimer -= 0.016; // approximate dt，实际应由游戏循环传入精确 dt
}

// --- Flyby sound ---
// 创建一个 flyby 音效实例，空间定位由后续更新控制。
// 该函数返回一个对象供游戏循环使用，在 shell 飞越时更新位置。
function createFlybyInstance(ctx, startX, startY){
  const def = SOUND_DEFS.flyby;
  if(!def) return null;
  const busGain = (def.bus === 'ui') ? AUDIO_SETTINGS.uiGain : AUDIO_SETTINGS.combatGain;
  const defGain = (def.gain != null && def.gain > 0) ? def.gain : 1;

  // 为 flyby 创建一个临时的 PannerNode 空间定位
  const osc = ctx.createOscillator();
  osc.type = def.layers[0].wave || 'triangle';
  osc.frequency.setValueAtTime(def.layers[0].f0, ctx.currentTime);
  if(def.layers[0].f1 > 0){
    const endTime = ctx.currentTime + def.layers[0].dur;
    osc.frequency.exponentialRampToValueAtTime(def.layers[0].f1, endTime);
  }
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, ctx.currentTime);
  env.gain.linearRampToValueAtTime(defGain * busGain, ctx.currentTime + (def.layers[0].attack || 0.002));
  env.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + def.layers[0].dur);

  const noise = ctx.createBufferSource();
  const len = Math.max(1, Math.floor(ctx.sampleRate * (def.layers[1] ? def.layers[1].dur : 0.25)));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for(let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  noise.buffer = buf;
  const nenv = ctx.createGain();
  nenv.gain.setValueAtTime(0.0001, ctx.currentTime);
  nenv.gain.linearRampToValueAtTime(def.layers[1].gain * busGain, ctx.currentTime + (def.layers[1].attack || 0.001));
  nenv.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + (def.layers[1].dur || 0.25));

  const panner = ctx.createPanner();
  panner.panningModel = 'HRTF';
  panner.distanceModel = 'exponential'; // 会在下行修正
  panner.setPosition(startX, startY, 0);
  // 听众默认在原点
  panner.setListenerProperties(listenerX, listenerY, 0, 0, 0, 1, 0, 0, 1);
  panner.maxDistance = 500;
  panner.refDistance = 24;

  osc.connect(panner); env.connect(panner);
  noise.connect(panner); nenv.connect(panner);
  panner.connect(_master);

  osc.start(ctx.currentTime); osc.stop(ctx.currentTime + def.layers[0].dur + 0.02);
  noise.start(ctx.currentTime); noise.stop(ctx.currentTime + (def.layers[1] ? def.layers[1].dur : 0.25) + 0.02);

  return { panner, startX, startY, ctx, currentTime: ctx.currentTime };
}

// 更新 flyby 位置（在 shell 移动时调用）
function updateFlybyPosition(flyby, newX, newY){
  if(!flyby || !flyby.panner) return;
  flyby.panner.setPosition(newX, newY, 0);
  flyby.startX = newX;
  flyby.startY = newY;
}

// 设置听众属性（在 AudioContext 创建后调用）
function setupSpatialAudio(ctx){
  if(!ctx.createPanner) return; // 不支持 PannerNode
  const panner = ctx.createPanner();
  panner.panningModel = 'HRTF';
  panner.distanceModel = 'exponential';
  panner.setPosition(listenerX, listenerY, 0);
  panner.setListenerPosition(listenerX, listenerY, 0);
  panner.setListenerOrientation(0, 0, -1, 0, 1, 0);
  panner.maxDistance = 500;
  panner.refDistance = 24;
  panner.connect(ctx.destination);
  _master.connect(panner); // 重新路由：所有音效先经 panner 再达 destination
}
// _master 已在 _initAudio 中创建并连接到 ctx.destination
// 我们不改变 _master 的连接，而是在播放时使用 PannerNode 包裹

// ---------- 调度单个合成层：包络 = 线性 attack 起音 + 指数 decay 衰减 ----------

// ---------- 浏览器分支：惰性 AudioContext + 程序化合成 ----------
let _audioCtx = null;  // 惰性创建：首次用户交互（playSound / initAudio / ensureAudio）时初始化
let _master  = null;   // 主增益节点（全部音效汇入 → destination）

function _initAudio(){
  if(_audioCtx) return _audioCtx;
  // Node 测试 / 不支持 Web Audio 的环境：静默跳过（不抛错）
  if(typeof AudioContext === 'undefined' && typeof webkitAudioContext === 'undefined') return null;
  const AC = (typeof AudioContext !== 'undefined') ? AudioContext : webkitAudioContext;
  _audioCtx = new AC();
  _master = _audioCtx.createGain();
  _master.gain.value = 1;
  _master.connect(_audioCtx.destination);
  return _audioCtx;
}

// 惰性初始化 + 自动播放策略解锁：首次用户交互时创建并 resume（幂等，可重复调用）
function ensureAudio(){
  const ctx = _initAudio();
  if(ctx && ctx.state === 'suspended'){ try{ ctx.resume(); }catch(_e){} }
  return ctx;
}
function initAudio(){ const ctx = ensureAudio(); if(ctx) { try { preloadAudioSamples(); } catch(e){} } return ctx; }

// 调度单个合成层：包络 = 线性 attack 起音 + 指数 decay 衰减
// opts 可选 { gain: 倍率, delay: 秒, pos: {x, y} } 用于空间定位
function _scheduleLayer(ctx, L, busGain, defGain, t0, opts){
  const t   = t0 + ((L.delay != null && L.delay > 0) ? L.delay : 0);
  const peak = defGain * busGain * (L.gain || 1);
  if(peak <= 0.0001) return;
  const dur = (L.dur != null && L.dur > 0) ? L.dur : 0.2;
  const atk = (L.attack != null && L.attack >= 0) ? L.attack : 0.005;
  const end = t + dur;

  if(L.kind === 'osc'){
    const osc = ctx.createOscillator();
    osc.type = L.wave || 'sine';
    const f0 = (L.f0 != null && L.f0 > 0) ? L.f0 : 440;
    osc.frequency.setValueAtTime(f0, t);
    if(L.f1 != null && L.f1 > 0 && L.f1 !== f0){
      osc.frequency.exponentialRampToValueAtTime(L.f1, end);
    }
    // --- 新增：空间 panner 设置 ---
    // 如果在 opts 中提供了 pos，则创建 PannerNode 并将 osc 连接过去
    // 否则直接连 _master（原有行为，兼容性）
    let targetNode = _master;
    if(opts && opts.pos){
      const panner = ctx.createPanner();
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'exponential';
      panner.maxDistance = 500;
      panner.refDistance = 24;
      // 设置音效相对于听众的位置
      const dx = (opts.pos.x || 0) - listenerX;
      const dy = (opts.pos.y || 0) - listenerY;
      panner.setPosition(dx, dy, 0);
      panner.setListenerProperties(listenerX, listenerY, 0, 0, 0, 1, 0, 0, 1);
      panner.connect(_master);
      targetNode = panner;
    }
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(peak, t + atk);
    env.gain.exponentialRampToValueAtTime(0.0001, end);
    osc.connect(env); env.connect(targetNode);
    osc.start(t); osc.stop(end + 0.02);
  } else if(L.kind === 'noise'){
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for(let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    // --- 新增：空间 panner 设置 ---
    let targetNode = _master;
    if(opts && opts.pos){
      const panner = ctx.createPanner();
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'exponential';
      panner.maxDistance = 500;
      panner.refDistance = 24;
      const dx = (opts.pos.x || 0) - listenerX;
      const dy = (opts.pos.y || 0) - listenerY;
      panner.setPosition(dx, dy, 0);
      panner.setListenerProperties(listenerX, listenerY, 0, 0, 0, 1, 0, 0, 1);
      panner.connect(_master);
      targetNode = panner;
    }
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(peak, t + atk);
    env.gain.exponentialRampToValueAtTime(0.0001, end);
    let node = src;
    if(L.filter){
      const flt = ctx.createBiquadFilter();
      flt.type = L.filter;  // 'lowpass' | 'highpass' | 'bandpass'
      flt.frequency.value = (L.filterFreq != null && L.filterFreq > 0) ? L.filterFreq : 1000;
      node.connect(flt); node = flt;
    }
    node.connect(env); env.connect(targetNode);
    src.start(t); src.stop(end + 0.02);
  }
}

// 采样缓存读取（undefined = 未尝试）
function getSampleBuffer(key){
  return Object.prototype.hasOwnProperty.call(_sampleBuffers, key) ? _sampleBuffers[key] : undefined;
}

// 异步加载单个采样；返回 Promise<AudioBuffer|null>。浏览器外/无 fetch 时直接返回 null。
function loadAudioSample(key){
  if(!Object.prototype.hasOwnProperty.call(AUDIO_SAMPLE_PATHS, key)){
    _sampleBuffers[key] = null;
    return Promise.resolve(null);
  }
  if(Object.prototype.hasOwnProperty.call(_sampleBuffers, key)){
    return Promise.resolve(_sampleBuffers[key]);
  }
  if(_sampleLoading[key]) return _sampleLoading[key];
  if(typeof fetch === 'undefined'){
    _sampleBuffers[key] = null;
    return Promise.resolve(null);
  }
  const path = AUDIO_SAMPLE_PATHS[key];
  const ctx = ensureAudio();
  if(!ctx){
    _sampleBuffers[key] = null;
    return Promise.resolve(null);
  }
  const p = (async () => {
    try {
      let controller = null;
      let timer = null;
      if(typeof AbortController !== 'undefined'){
        controller = new AbortController();
        timer = setTimeout(() => { try { controller.abort(); } catch(e){} }, AUDIO_SAMPLE_TIMEOUT_MS);
      }
      const res = await fetch(path, controller ? { signal: controller.signal } : undefined);
      if(timer) clearTimeout(timer);
      if(!res || !res.ok) throw new Error('HTTP ' + (res ? res.status : '?'));
      const ab = await res.arrayBuffer();
      const buf = await new Promise((resolve, reject) => {
        try { ctx.decodeAudioData(ab, resolve, reject); }
        catch(e){ reject(e); }
      });
      _sampleBuffers[key] = buf;
      return buf;
    } catch(e){
      _sampleBuffers[key] = null;
      return null;
    } finally {
      delete _sampleLoading[key];
    }
  })();
  _sampleLoading[key] = p;
  return p;
}

// 预加载全部采样（浏览器初始化时可调用；失败静默）
function preloadAudioSamples(){
  if(typeof fetch === 'undefined') return;
  for(const k of Object.keys(SOUND_DEFS)) loadAudioSample(k);
}

// 采样播放（已缓存 AudioBuffer 时调用）
function _playSampleBuffer(ctx, key, def, opts){
  const buf = _sampleBuffers[key];
  if(!buf) return false;
  const busGain = (def.bus === 'ui') ? AUDIO_SETTINGS.uiGain : AUDIO_SETTINGS.combatGain;
  const defGain = (def.gain != null && def.gain > 0) ? def.gain : 1;
  const gMul = (opts.gain != null && opts.gain > 0) ? opts.gain : 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const gainNode = ctx.createGain();
  gainNode.gain.value = busGain * defGain * gMul;
  const delay = (opts.delay != null && opts.delay > 0) ? opts.delay : 0;
  const t0 = ctx.currentTime + delay;
  if(opts && opts.pos){
    const panner = ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'exponential';
    panner.maxDistance = 500;
    panner.refDistance = 24;
    const dx = (opts.pos.x || 0) - listenerX;
    const dy = (opts.pos.y || 0) - listenerY;
    panner.setPosition(dx, dy, 0);
    panner.connect(_master);
    src.connect(gainNode); gainNode.connect(panner);
  } else {
    src.connect(gainNode); gainNode.connect(_master);
  }
  src.start(t0);
  try { src.stop(t0 + buf.duration + 0.05); } catch(e){}
  return true;
}

// 单入口：播放一类音效。优先使用已缓存的真实采样；未加载时启动异步加载并回退到程序化合成。
// opts 可选 { gain: 倍率, delay: 秒, pos: {x, y} }；
// pos 为相对于 canvas 原点的空间坐标（像素），用于 PannerNode 空间定位。
// 未知键或不可用环境返回 false。
function playSound(key, opts){
  opts = opts || {};
  const def = SOUND_DEFS[key];
  if(!def) return false;
  const ctx = ensureAudio();
  if(!ctx) return false;
  // 采样优先
  const cached = getSampleBuffer(key);
  if(cached){
    return _playSampleBuffer(ctx, key, def, opts);
  }
  if(cached === undefined){
    // 启动异步加载（失败后缓存 null，下次直接合成）
    loadAudioSample(key);
  }
  // 程序化合成回退
  const busGain = (def.bus === 'ui') ? AUDIO_SETTINGS.uiGain : AUDIO_SETTINGS.combatGain;
  const defGain = (def.gain != null && def.gain > 0) ? def.gain : 1;
  const gMul = (opts.gain != null && opts.gain > 0) ? opts.gain : 1;
  const t0 = ctx.currentTime + ((opts.delay != null && opts.delay > 0) ? opts.delay : 0);
  const layers = (def.layers && def.layers.length) ? def.layers
    : [{ kind:'osc', wave:'sine', f0:440, f1:330, dur:0.1, gain:0.5 }];
  for(const L of layers) _scheduleLayer(ctx, L, busGain, defGain * gMul, t0, opts);
  return true;
}


// 纯逻辑校验（Node 可测）：返回问题列表，空数组 = SOUND_DEFS 全部合法
function validateSoundDefs(defs){
  defs = defs || SOUND_DEFS;
  const problems = [];
  const validWaves   = ['sine','square','sawtooth','triangle'];
  const validFilters = ['lowpass','highpass','bandpass'];
  for(const key of Object.keys(defs)){
    const d = defs[key];
    if(!d || typeof d !== 'object'){ problems.push(`${key}: 定义缺失`); continue; }
    if(typeof d.label !== 'string') problems.push(`${key}: label 应为字符串`);
    if(d.bus !== 'combat' && d.bus !== 'ui') problems.push(`${key}: bus 应为 combat/ui`);
    if(d.gain != null && !(d.gain > 0)) problems.push(`${key}: gain 应 > 0`);
    if(!Array.isArray(d.layers) || d.layers.length === 0){ problems.push(`${key}: layers 应为非空数组`); continue; }
    d.layers.forEach((L, i) => {
      const p = `${key}.layers[${i}]`;
      if(!L || typeof L !== 'object'){ problems.push(`${p}: 应为对象`); return; }
      if(L.kind !== 'osc' && L.kind !== 'noise') problems.push(`${p}: kind 应为 osc/noise`);
      if(!(L.dur > 0)) problems.push(`${p}: dur 应 > 0`);
      if(!(L.gain > 0)) problems.push(`${p}: gain 应 > 0`);
      if(L.attack != null && L.attack < 0) problems.push(`${p}: attack 应 ≥ 0`);
      if(L.delay != null && L.delay < 0) problems.push(`${p}: delay 应 ≥ 0`);
      if(L.kind === 'osc'){
        if(!(L.f0 > 0)) problems.push(`${p}: osc f0 应 > 0`);
        if(L.f1 != null && !(L.f1 > 0)) problems.push(`${p}: osc f1 应 > 0`);
        if(L.wave && validWaves.indexOf(L.wave) === -1) problems.push(`${p}: wave 非法 (${L.wave})`);
      }
      if(L.kind === 'noise' && L.filter && validFilters.indexOf(L.filter) === -1){
        problems.push(`${p}: filter 非法 (${L.filter})`);
      }
    });
  }
  return problems;
}

// 双重导出：浏览器按全局脚本加载（顶层 const/function 即全局）；Node 测试走 module.exports
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SOUND_DEFS,
    AUDIO_SETTINGS,
    AUDIO_SAMPLE_PATHS,
    AUDIO_SAMPLE_TIMEOUT_MS,
    initAudio,
    ensureAudio,
    playSound,
    validateSoundDefs,
    loadAudioSample,
    preloadAudioSamples,
    getSampleBuffer,
    // #AA-c（2026-10-26）：电磁炮充能循环三件套 + 纯频率映射（Node 可测）
    railChargeFreqFor,
    startRailChargeLoop,
    updateRailChargePitch,
    stopRailChargeLoop
  };
}
