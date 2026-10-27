# 电磁炮的炮线与预警

> **摘要**：Boss 随机到电磁炮时，开火前先蓄能并画出**红色恒定指示线**（按全高掩体截断），指向期静音；本页是参数、事件流与绘制契约的唯一口径。
> **适用版本**：现行（2026-10-26）
> **源自**：2026-10-22 第五批新建；2026-10-26 按用户反馈四项改口径（见下「沿革」）
> **相关**：[行为与弱点](./behavior.md) · [蓄能激光](./laser.md) · [特效与视效](../combat/fx-visual.md) · [音频与音效](../combat/audio.md)

## 目录
- [为什么需要这一页](#为什么需要这一页)
- [沿革（2026-10-26 用户反馈四项）](#沿革2026-10-26-用户反馈四项)
- [参数表（唯一口径）](#参数表唯一口径)
- [事件流与开火门控](#事件流与开火门控)
- [绘制契约](#绘制契约)
- [音频口径](#音频口径)

## 为什么需要这一页

**用户裁定**：「为 boss 使用电磁炮时提供激光炮线动画，为玩家提供 boss 正在使用电磁炮的预警」。

**改前现状（2026-10-22 之前）**：Boss 本体不带 railgun（`bosses/*.json` 只有 `tankId`，武器恒为出厂 standard），只能经**随机武备**装到（`pickBossArmament`，池内 4 张主武器安装卡 ⇒ 走主武器分支时约 1/4）；而 `railChargeProgress` 只是**装填期视觉读数**（画炮身导轨电弧），**开火没有任何蓄力或预警阶段**——AI 判据是「`reloadT<=0` 即发射」。整套机制在 specs 里零口径。

## 沿革（2026-10-26 用户反馈四项）

用户原话：「boss使用电磁炮时：音量太大、激光应该是红色不动的指示性激光（不是现在的常用于攻击性的不断抖动的）、玩家被电磁炮激光指向时不需要有音效，电磁炮发射炮弹的音效像射箭而不是发射了电磁炮」。

| # | 旧口径（2026-10-22，**已被取代**） | 现行口径（2026-10-26） |
|---|---|---|
| 1 | 指向期沿用 #AA-c 三段声学：充能循环电流声 + `railReady` 双响 + 预警 `ui` 音 | **指向期完全静音**（`aimAudio:false`）；只留屏幕预警（`pushLog` 红字 + 顶部横条） |
| 2 | 白 1px 主线 + 3 条 `lightningPath` 电弧（时间量子抖动）+ 蓝基底 + 线端白光点 | **红色恒定指示线**：细红实线 + 红色外晕 + 固定半径落点圆点，零电弧、零抖动、零时间量子 |
| 3 | 开火瞬态 `firerail`（三层：方波放电下扫 + 电离噪声 + 低频炮身共鸣，gain 1.0） | Boss 侧改 `bossRailFire`（弓弦松脱 + 箭矢破空，gain 0.55）——「像放箭」；**玩家侧仍 `firerail`** |
| 4 | 炮线画满 `lineLength`（1400），穿过建筑 | 按**全高掩体截断**（`blockedDist`），与蓄能激光同一几何判据 |

> **只改 Boss 侧**：玩家自己装电磁炮的充能声 / 就绪声 / `firerail` / 炮身白弧 / 针状白热弹一律不变（口径在 [音频与音效 · 电磁轨道炮三段声学](../combat/audio.md) 与 [特效与视效](../combat/fx-visual.md)）。

## 参数表（唯一口径）

唯一配置源 `RULES.boss.railgun`：

| 键 | 值 | 语义 |
|---|---|---|
| `enabled` | true | 总开关 |
| `chargeSeconds` | **1.2** | 蓄能时长（秒）——玩家预警窗口 |
| `lineLength` | **1400** | 炮线长度（px） |
| `lineWidth` | **6** | **仅 fire 光束**宽度（px）；指示线宽走 `laserCoreWidth` |
| `warnLeadSeconds` | 1.2 | 预警提前量（= chargeSeconds，进入蓄能即预警） |
| `aimTolerance` | 0.03 | 蓄能期锁定的角度容差（rad）——超出则重新蓄能（防瞬转锁定） |
| `laserColor` | `rgba(255,52,42,1)` | 指示线芯色（红） |
| `laserGlowColor` | `rgba(255,70,52,1)` | 外晕色（同色相，低 alpha 宽描边） |
| `laserCoreWidth` | **1.8** | 线芯宽 px（细 = 指示性，不是光束） |
| `laserGlowWidthMult` | 3.6 | 外晕宽 = `laserCoreWidth × 本倍率` |
| `laserAlphaMin` / `laserAlphaMax` | 0.55 / 1.0 | 蓄能进度 0 → 1 的线亮度（只提亮度，不改几何/色相） |
| `laserDotRadius` | 3 | 线端落点圆点半径 px（**固定**，不随进度膨胀） |
| `blockByFullCover` | true | 指示线按全高掩体（`tierGroup:'structure'` 且 `vision`）截断 |
| `aimAudio` | **false** | 指向期静音总开关（`true` 才接 #AA-c 三段声学） |
| `fireSoundKey` | `bossRailFire` | Boss 开火音效键（音色/增益在 `SOUND_DEFS`，见 [音频口径](#音频口径)） |

## 事件流与开火门控

**生产者**：`js/tank_boss.js updateBossRailCharge(t, dt, target, opts)`（纯逻辑，可 Node 测试；`opts.covers` 注入掩体表，缺省不判遮挡——与 `updateBossLaser` 同口径）。

1. 仅当 `t.weapons.primary.type === 'railgun'` 且 `reloadT <= chargeSeconds` 时进入蓄能；
2. 逐帧产出 `{type:'railCharge', x, y, angle, length, width, progress, blockedDist}`（`progress` 0→1）；
3. 蓄能未完成时 `t.railChargeHold = true`；完成当帧产出 `{type:'railReady', x, y, angle, length, width, blockedDist}` 并清 hold（**下一帧** AI 的开火判据才放行）；
4. `reloadT > chargeSeconds`（装填中段）→ 复位 hold 与计时；
5. **坐标是炮口**（`gunRoot(t)`）不是车体中心——指示线从炮管根部射出；几何层不可用（Node 纯逻辑测试）时回退车体中心，不产生 `NaN`；
6. `blockedDist` = 沿炮线方向最近全高掩体的**入口距离**（`_railBeamBlockDist` → `_beamBlockDist`，与蓄能激光共用同一 Liang-Barsky 几何）；无阻挡时恒等于 `lineLength`。

**消费方**：`tank_battle.html` 的 AI 主循环 —— **只对 `e.isBoss` 生效**（⚠ 玩家也能装 railgun，玩家侧不得被蓄能门控拦住，否则空格打不出弹）；事件写入 `bossRailFx`，开火门控读 `!e.railChargeHold`；Boss 阵亡/离场时清掉残留炮线（绘制段 `entities.some(en => en.isBoss && en.hp > 0)` 守卫）。

## 绘制契约

**实现**：`js/tank_battledraw.js drawBossRailLine(ctx, fx)`（导出 + `globalThis`）；`fx = { kind:'charge'|'ready'|'fire', x, y, angle, length, width, progress, alpha?, blockedDist? }`。

- **charge / ready**（2026-10-26 现行）：**红色恒定指示线**——
  - ① 外晕：`laserGlowColor`，宽 `laserCoreWidth × laserGlowWidthMult`，alpha `线亮度 × 0.22`；
  - ② 线芯：`laserColor`，宽 `laserCoreWidth`，alpha = `laserAlphaMin + (laserAlphaMax−laserAlphaMin) × progress`；
  - ③ 落点圆点：`laserColor`，半径 `laserDotRadius`（**固定**，不随进度膨胀——不读作爆炸半径）；
  - `kind:'ready'` 按 `progress = 1` 画（与 `charge@1` 逐字节一致）；
  - **禁止**：电弧、抖动、时间量子、白芯、蓝基底、虚线（这些是「攻击性放电特效」的语汇，用户明确不要）。
- **fire**：白芯 `max(2, width×0.5)` + 冷白外晕 `width×1.6`（`RULES.railgunFx.arcWhite/arcHalo`），按 `fx.alpha` 淡出。**当前无生产者**（电磁炮发射实体弹丸，`tank_battle.html` 只产出 charge/ready），保留供将来接光束表现。
- **截断**：`blockedDist` 存在且 `< length` 时只画到截断点（炮弹本来就会被全高掩体挡下，炮线画穿建筑会让玩家读错掩体是否安全）。
- **确定性**：绘制期零 `Math.random` / 零 `performance.now()` ⇒ 同一 `fx` 重复绘制逐字节一致（回归见 `scripts/test-render.js` ⑫ 段）。
- **配色来源**：charge/ready 全部取 `RULES.boss.railgun`（不写死色值）；fire 取 `RULES.railgunFx`。

**玩家预警**：进入蓄能时 `pushLog('⚠ BOSS 电磁炮蓄能 — 离开炮线区域！','CRIT')` + 屏幕顶部红色横条（2.4s），**无音效**（`aimAudio:false`）。与 [蓄能激光](./laser.md) 的警示带是**两套独立机制**（激光是持续光束 + 车体冻结；电磁炮是瞬发 + 炮线预警），共用「先给预警再开火」的设计语言。

## 音频口径

| 事件 | 键 / 载体 | 口径 |
|---|---|---|
| 指向期（蓄能 → 就绪） | **无** | `aimAudio:false` ⇒ 不起 `startRailChargeLoop`、不播 `railReady`、不播 `ui`；代码分支保留（改 `aimAudio:true` 即恢复） |
| Boss 开火 | `SOUND_DEFS.bossRailFire` | 弓弦松脱（triangle 420→130Hz 下滑 0.10s）+ 弦槽摩擦（带通 2600Hz 0.08s）+ 箭矢破空（高通 3200Hz 0.28s，延迟 25ms）；`def.gain` **0.55**（`firerail` 为 1.0），**无低频炮身共鸣** |
| 键选择点 | `js/tank_fire.js _fireSoundKeyFor(shooter, spec)` | `railgun + isBoss` ⇒ `fireSoundKey`（缺省 `bossRailFire`）；`railgun` ⇒ `firerail`；其余 ⇒ `fire` |

## 相关页面
- [行为与弱点](./behavior.md) — 随机武备如何把 railgun 装到 Boss 上
- [蓄能激光](./laser.md) — 另一套「蓄能→开火」的 Boss 机制（参数唯一口径在该页；炮线截断共用同一几何）
- [音频与音效](../combat/audio.md) — 玩家侧电磁炮三段声学 + `bossRailFire` 键
- [特效与视效](../combat/fx-visual.md) — 电磁炮三段视效（炮身/弹体）实现
