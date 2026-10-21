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

## 总线与并发

（原 §7，声音总线与并发管理 / Busses & Concurrency）

- `combat` 总线（主音量受 `AUDIO_SETTINGS.combatGain` 控制）：开火/爆炸/击穿/跳弹/履带断裂，`maxConcurrent=3`；
- `ui` 总线（主音量受 `AUDIO_SETTINGS.uiGain` 控制）：点击/选卡/装填完成/警告，`maxConcurrent=4`。

## 采样优先与合成兜底

（原 §7，Sample-Priority Architecture）

- 音频系统优先加载并播放 `audio/` 目录下的 CC0/Freesound 真实采样（WAV/OGG）；
- 若采样缺失、网络加载超时或本地 `file://` 环境下，系统无缝自动回退至 `SOUND_DEFS` 程序化合成器。

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

## 相关页面
- [特效与视效](./fx-visual.md) — 与音效同帧触发的视效层
- [武器与装填](./weapons-reload.md) — `firerail` 等武器专属音效键
- [HUD 与界面](./hud-ui.md) — 音量设置入口
