# 音频与音效

> **摘要**：声音总线、采样优先架构、2D 空间化参数，以及新增音效必须通过的 `SOUND_DEFS` schema。
> **适用版本**：现行（2026-10-21）
> **源自**：`docs/specs/combat.md` §7、§7.1（2026-10-21 拆分）
> **相关**：[特效与视效](./fx-visual.md) · [武器与装填](./weapons-reload.md) · [HUD 与界面](./hud-ui.md)

## 目录
- [总线与并发](#总线与并发)
- [采样优先与合成兜底](#采样优先与合成兜底)
- [空间化](#空间化)
- [SOUND_DEFS schema](#sound_defs-schema)
- [实现与设计意图的已知差异](#实现与设计意图的已知差异)
- [电磁轨道炮三段声学](#电磁轨道炮三段声学aa-c2026-10-26)

## 总线与并发

（原 §7，声音总线与并发管理 / Busses & Concurrency）

- `combat` 总线（主音量受 `AUDIO_SETTINGS.combatGain` 控制）：开火/爆炸/击穿/跳弹/履带断裂，`maxConcurrent=3`；
- `ui` 总线（主音量受 `AUDIO_SETTINGS.uiGain` 控制）：点击/选卡/装填完成/警告，`maxConcurrent=4`。

## 采样优先与合成兜底

（原 §7，Sample-Priority Architecture）

- 音频系统优先加载并播放 `audio/` 目录下的真实采样（WAV，`AUDIO_SAMPLE_PATHS` 将每个 `SOUND_DEFS` 键映射到 `audio/<key>.wav`）；
- `initAudio()` 触发 `preloadAudioSamples()` 异步预加载；单个采样加载超时 `AUDIO_SAMPLE_TIMEOUT_MS=4000ms`；
- 若采样缺失、网络加载超时、`decodeAudioData` 失败或本地 `file://` 环境（`fetch` 不可用）下，系统将对应键缓存为 `null` 并无缝自动回退至 `SOUND_DEFS` 程序化合成器；
- 采样播放时仍应用总线增益与 `pos` 空间化，保持与合成路径一致的 API。

## 空间化

（原 §7，2D 空间化与距离衰减 / Spatialization）

- 战斗事件通过 `playSound(key, opts, {x, y})` 传入世界坐标（实现细节见下条）。
- 听众位置 `setListenerPos(cam.x, cam.y)` 实时跟随摄像机；超出 1200px 范围的音效自动施加 Lowpass 滤镜模拟远距离钝音感。**（⚠️ 此为历史设计意图，与实现不一致，见 [实现与设计意图的已知差异](#实现与设计意图的已知差异)）**

`playSound(key, {pos:{x,y}})` 时才建 `PannerNode`，且固定 `panningModel='HRTF'`、`distanceModel='exponential'` rolloff、`maxDistance=500`、`refDistance=24`，位置取「世界坐标 − 听众坐标」的相对量；不传 `pos` 则直连 `_master`。听众由 `setListenerPos(x,y)` 设定（默认 0,0）。

## SOUND_DEFS schema

（原 §7.1，唯一权威 = `js/tank_audio.js`；2026-10-19 按实现校正）

> **沿革**：2026-10-19 收编自已删除的 `.dsh/agents/sound-designer.md` 时做过一次**实码核对**——旧角色卡描述的 `priority` / `maxConcurrent` / `spatial{...}` / `env.type`（`perc`/`exp`/`adsr`/`gate`）/ `bufferKey` **均未实现**，实际结构如下，以其为准。

```js
fire: {
  label: '开火',        // 必填，字符串（调试/预览显示用）
  bus: 'combat',        // 必填，'combat' | 'ui'（校验器只认这两个；无 'env'）
  gain: 1.0,            // 可选，总线内增益 > 0；缺省按 1 处理
  layers: [             // 必填，非空数组；多层并行合成
    { kind: 'osc', wave: 'sawtooth', f0: 220, f1: 42, dur: 0.30, gain: 0.85, attack: 0.004 },
    { kind: 'noise', dur: 0.16, gain: 0.45, attack: 0.002, filter: 'lowpass', filterFreq: 2200 }
  ]
}
```

**层字段（`layers[]`）**：

| 字段 | 适用 | 说明 |
|---|---|---|
| `kind` | 必填 | 仅 `'osc'` / `'noise'` 两种（**无 `buffer`**） |
| `dur` / `gain` | 必填 | 均须 > 0 |
| `attack` | 可选 | ≥ 0，线性起振时长 |
| `delay` | 可选 | ≥ 0，相对 `playSound` 的起始延时 |
| `wave` / `f0` / `f1` | `osc` | 仅 `sine`/`square`/`sawtooth`/`triangle`；`f0→f1` 为频率滑音 |
| `filter` / `filterFreq` | 可选 | 仅 `lowpass`/`highpass`/`bandpass`（无 shelf/peaking 系） |

**校验器**：`validateSoundDefs(defs)` 返回问题数组（空 = 合法），`scripts/test-audio.js` 消费。**新增音效必须过该校验**。

## 实现与设计意图的已知差异

（原 §7.1 末尾警示，2026-10-19 实测，尚未修正）

> ⚠️ **与 [总线与并发](#总线与并发) 段开头的已知不一致**：正文写 `PannerNode` 用 `equalpower` / `maxDistance 1200` / `refDistance 100` / 带距离 Lowpass 滤镜，实现是 `HRTF` / 500 / 24 / 无距离滤镜；且 `AUDIO_SETTINGS` 只有 `combatGain` 0.5 与 `uiGain` 0.25 两项。**以「空间化」段的实现描述为现行事实**，`equalpower`/1200/100/Lowpass 那段属历史设计意图，修正前不得据其调参。

## 电磁轨道炮三段声学（AA-c，2026-10-26）

（用户 2026-10-24 反馈「电磁炮缺充电电流声与放电声」；本条是该问题的**现行口径**，结论见 `DEVELOPMENT-batches-2026-10.md` §4.137）

电磁炮的听觉链**分三段**，载体各不相同：

| 段 | 载体 | 键 / 入口 | 口径 |
|---|---|---|---|
| ① 充能上升电流 | **代码驱动的持续实例**（不是 SOUND_DEFS 键） | `startRailChargeLoop()` / `updateRailChargePitch(progress)` / `stopRailChargeLoop()`（`js/tank_audio.js`） | 基频从 `freqMin` 到 `freqMax` 随 `railChargeProgress` **线性单调**上升；`attack`/`release` 淡入淡出。**数值唯一口径 `RULES.railgunFx.audio`**（`chargeWave / freqMin / freqMax / gain / attack / release`） |
| ② 就绪封顶 | 一次性瞬态 | `playSound('railReady')`（`SOUND_DEFS.railReady`：1320Hz + 1760Hz 双短响） | 装填完成当帧播一次；满电待机不重复 |
| ③ 开火放电 + 炮身共鸣 | 一次性瞬态 | `playSound('firerail')`（`SOUND_DEFS.firerail` 三层：方波下扫 + 带通噪声 + 低频尾） | 开火瞬间；同帧调 `stopRailChargeLoop()` 收掉充能声，避免叠爆音 |

**为什么充能不能做成 SOUND_DEFS 键**：该表每层都是「一次性 `start` → 包络收敛到 0.0001 → `stop`」，表达不了「随进度持续的电流声」。

> **实施时对原计划的一处收窄**：原计划要新增 `railDischarge` 键作为「放电撕拉」。实施时判定**不拆**——`firerail` 的三层已经覆盖「电容放电 + 电离空气 + 炮身低腔」，再叠一个同帧瞬态只会糊成一团。缺的从来只有**持续段**（①）和**就绪提示**（②）。

**接线两处（同源）**：

- **玩家侧**（`tank_battle.html`）：先判 `primaryWeaponSpec(t).type === 'railgun' && reloadT > 0` 才算「真的在充能」——⚠️ `railChargeProgress` 对非电磁炮 / 无 `reloadT` 的实体返回 **1**（满电待机），不先判定会**常驻鸣响**；
- **Boss 侧**：`updateBossRailCharge` 产出的 `railCharge`（带 `progress`）驱动循环音高，`railReady` 收声 + 就绪提示（旧实现借 `pen` 顶替，听感与命中声混淆）；蓄能窗口结束时兜底收声。

**Node 可测性**：`railChargeFreqFor(progress)` 是纯函数（clamp + 非有限值按 0 处理，`NaN` 会毒化 Web Audio 频率参数）。`scripts/test-audio.js` 断言：20 段严格单调、`NaN/Infinity/字符串` 输入全部有限、无 AudioContext 时三件套 no-op 且 `stopRailChargeLoop` 幂等。

**清理**：同批删除死代码 `startEngineSound` / `stopEngineSound` / `updateEnginePitch`（全仓零调用且未导出）。将来做引擎转速声请沿用本节的「代码驱动持久实例」范式，不要用一次性层表达持续音。

## 相关页面
- [特效与视效](./fx-visual.md) — 与音效同帧触发的视效层
- [武器与装填](./weapons-reload.md) — `firerail` 等武器专属音效键
- [HUD 与界面](./hud-ui.md) — 音量设置入口
