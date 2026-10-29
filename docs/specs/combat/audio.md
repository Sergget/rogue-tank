# 音频与音效

> **摘要**：声音总线、采样优先架构、2D 空间化参数，以及新增音效必须通过的 `SOUND_DEFS` schema。
> **适用版本**：现行（2026-10-27）
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

**离线生成器 `scripts/gen_audio.py`（2026-10-29 入库）**：按配方合成上述采样并写到 `audio/<key>.wav`（`python scripts/gen_audio.py [输出目录]`，默认 `audio/`；`audio/` 已 gitignore，生成物不入库；唯一第三方依赖 numpy）。**它服务的是采样通道，不是实机路径**——现行口径仍是「全合成零资产」（2026-10-23 用户裁定），`audio/` 目录不存在、采样全部 404 回退合成，这是**预期状态**。覆盖度 14/16：`SOUND_DEFS` 的 `railReady` / `bossRailFire`（2026-10-26 AA-c 新增）**尚无配方**，启用采样前需补齐。噪声成分无固定种子，同配方每次生成听感一致但文件不逐字节可复现。

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
| ① 充能上升电流 | **代码驱动的持续实例**（不是 SOUND_DEFS 键） | `startRailChargeLoop()` / `updateRailChargePitch(p)` / `stopRailChargeLoop()`（`js/tank_audio.js`）+ 窗口判定 `railChargeWindowProgress(secondsLeft)` | **只在距充满 ≤ `windowSeconds` 秒的可听窗口内响**（`null` = 不响）；音高用**窗口内局部进度** 0→1 线性映射 `freqMin`→`freqMax`；`attack`/`release` 淡入淡出。**数值唯一口径 `RULES.railgunFx.audio`**（`chargeWave / freqMin / freqMax / gain / attack / release / windowSeconds`） |
| ② 就绪封顶 | 一次性瞬态 | `playSound('railReady')`（`SOUND_DEFS.railReady`：1320Hz + 1760Hz 双短响） | 装填边沿（`reloadT > 0 → ≤0`）当帧播一次；满电待机不重复；与 ① 的可听窗口**解耦**（窗口在充满前就结束） |
| ③ 开火放电 + 炮身共鸣 | 一次性瞬态 | `playSound('firerail')`（`SOUND_DEFS.firerail` 三层：方波下扫 + 带通噪声 + 低频尾） | 开火瞬间；同帧调 `stopRailChargeLoop()` 收掉充能声，避免叠爆音 |

**为什么充能不能做成 SOUND_DEFS 键**：该表每层都是「一次性 `start` → 包络收敛到 0.0001 → `stop`」，表达不了「随进度持续的电流声」。

> **实施时对原计划的一处收窄**：原计划要新增 `railDischarge` 键作为「放电撕拉」。实施时判定**不拆**——`firerail` 的三层已经覆盖「电容放电 + 电离空气 + 炮身低腔」，再叠一个同帧瞬态只会糊成一团。缺的从来只有**持续段**（①）和**就绪提示**（②）。

**接线两处（同源）**：

- **玩家侧**（`tank_battle.html`）：先判 `primaryWeaponSpec(t).type === 'railgun' && reloadT > 0` 才算「真的在装填」——⚠️ `railChargeProgress` 对非电磁炮 / 无 `reloadT` 的实体返回 **1**（满电待机），不先判定会**常驻鸣响**；再用 `railChargeWindowProgress(reloadT)` 判「是否进入可听窗口」（`null` ⇒ 不起声/收声，见下节）；
- **Boss 侧**：~~`updateBossRailCharge` 产出的 `railCharge`（带 `progress`）驱动循环音高，`railReady` 收声 + 就绪提示~~ **已被 2026-10-26 用户裁定取代**——Boss 指向期**完全静音**（详见下节与 [Boss 电磁炮](../boss/railgun.md#音频口径)）。

**Node 可测性**：`railChargeFreqFor(progress)` 是纯函数（clamp + 非有限值按 0 处理，`NaN` 会毒化 Web Audio 频率参数）。`scripts/test-audio.js` 断言：20 段严格单调、`NaN/Infinity/字符串` 输入全部有限、无 AudioContext 时三件套 no-op 且 `stopRailChargeLoop` 幂等。

**清理**：同批删除死代码 `startEngineSound` / `stopEngineSound` / `updateEnginePitch`（全仓零调用且未导出）。将来做引擎转速声请沿用本节的「代码驱动持久实例」范式，不要用一次性层表达持续音。

### 充能循环 = 短窗口 + 柔和波形（2026-10-27 用户反馈）

用户原话：「充能的音效太尖锐、时间太长，只在充能完毕前有一点电流声」。三项改动（数值全部在 `RULES.railgunFx.audio`，本页不重复值）：

| 问题 | 旧口径（**已取代**） | 现行口径 |
|---|---|---|
| 太尖锐 | `chargeWave: 'sawtooth'`（谐波列含 7.6kHz 附近的高次）+ `freqMax: 760` | `chargeWave: 'triangle'`（谐波衰减快）+ `freqMax: 520`（≤600 才不会重新变尖）+ `gain` 下调 |
| 时间太长 | 整段装填（2~4s）都在响 | **可听窗口** `windowSeconds`（<1s）：距充满还剩该秒数时才起声 |
| 音高位置 | 全局 `railChargeProgress` 直接喂 `railChargeFreqFor` ⇒ 窗口里恒在 0.8~1（贴高位、起声即最尖） | 窗口内**局部进度** `railChargeWindowProgress(secondsLeft)`（0→1）⇒ 起声低、上行到满电前一刻 |

- `railChargeWindowProgress(secondsLeft)` 是纯函数（`secondsLeft = player.reloadT`）：窗口外 / 负剩余 / `NaN` / `Infinity` / 非数字一律返回 **null**（宁可不响，也不让非法值进 `OscillatorNode.frequency`）。
- 页面接线：`tank_battle.html` 玩家段把 `_railChargeOn` 的语义收窄为「**可听窗口**是否在放」，`railReady` 改用独立的装填边沿标记 `_railLoading`（否则窗口在充满前 `windowSeconds` 就结束，ready 音会被窗口关闭吞掉）。
- 回归：`scripts/test-audio.js` 6.4 段（窗口秒数 `<1` / `triangle` / `freqMax ≤600` / 增益下调 / 窗口边界与非法输入 / 窗口内 20 段音高严格单调、两端贴合 `freqMin`/`freqMax`）。

### Boss 电磁炮：指向期静音 + 开火「像放箭」（2026-10-26 用户裁定）

用户原话：「boss使用电磁炮时：音量太大……玩家被电磁炮激光指向时不需要有音效，电磁炮发射炮弹的音效像射箭而不是发射了电磁炮」。

- **指向期无音效**：`RULES.boss.railgun.aimAudio = false` 是唯一开关。`tank_battle.html` 的 Boss 分支据此**不**起 `startRailChargeLoop`、**不**播 `railReady`、**不**播预警 `ui` 音——只保留 `pushLog` 红字 + 顶部红色横条。上表 ①② 两段声学**只对玩家自己装的电磁炮生效**。
- **开火瞬态换键**：Boss 用 `SOUND_DEFS.bossRailFire`（弓弦松脱 `triangle 420→130Hz @0.10s` + 弦槽摩擦 `bandpass 2600Hz @0.08s` + 箭矢破空 `highpass 3200Hz @0.28s` 延迟 25ms，`def.gain` **0.55**）；**刻意不含** `firerail` 的三层主体（方波放电下扫 / 电离噪声 / 低频炮身共鸣）——那正是「像电磁炮」和「太响」的来源。
- **键选择唯一入口**：`js/tank_fire.js _fireSoundKeyFor(shooter, spec)`——`railgun + isBoss` ⇒ `RULES.boss.railgun.fireSoundKey`（`bossRailFire`）；`railgun` ⇒ `firerail`；其余 ⇒ `fire`。
- 回归：`scripts/test-audio.js` 6.3 段（键存在 / 增益低于 `firerail` / osc 层全部 ≥100Hz / 全部层 ≤0.35s / `aimAudio===false`）；`scripts/test-batch5-combat.js` 断言 `_fireSoundKeyFor` 三分支。

## 相关页面
- [特效与视效](./fx-visual.md) — 与音效同帧触发的视效层
- [武器与装填](./weapons-reload.md) — `firerail` 等武器专属音效键
- [Boss 电磁炮](../boss/railgun.md) — Boss 侧指向期静音与开火音效键的机制口径
- [HUD 与界面](./hud-ui.md) — 音量设置入口
