# 电磁炮的炮线与预警

> **摘要**：Boss 随机到电磁炮时，开火前先蓄能并画出激光炮线 + 电弧 + 屏幕预警；本页是参数与事件流的唯一口径。
> **适用版本**：现行（2026-10-22）
> **源自**：2026-10-22 第五批新建（此前 Boss 电磁炮在 specs 无任何口径）
> **相关**：[行为与弱点](./behavior.md) · [蓄能激光](./laser.md) · [特效与视效](../combat/fx-visual.md)

## 目录
- [为什么需要这一页](#为什么需要这一页)
- [参数表（唯一口径）](#参数表唯一口径)
- [事件流与开火门控](#事件流与开火门控)
- [绘制契约](#绘制契约)

## 为什么需要这一页

**用户裁定**：「为 boss 使用电磁炮时提供激光炮线动画，为玩家提供 boss 正在使用电磁炮的预警」。

**改前现状**：Boss 本体不带 railgun（`bosses/*.json` 只有 `tankId`，武器恒为出厂 standard），只能经**随机武备**装到（`pickBossArmament`，池内 4 张主武器安装卡 ⇒ 走主武器分支时约 1/4）；而 `railChargeProgress` 只是**装填期视觉读数**（画炮身导轨电弧），**开火没有任何蓄力或预警阶段**——AI 判据是「`reloadT<=0` 即发射」。整套机制在 specs 里零口径。

## 参数表（唯一口径）

唯一配置源 `RULES.boss.railgun`：

| 键 | 值 | 语义 |
|---|---|---|
| `enabled` | true | 总开关 |
| `chargeSeconds` | **1.2** | 蓄能时长（秒）——玩家预警窗口 |
| `lineLength` | **1400** | 炮线预览/光束长度（px，与蓄能激光同量级） |
| `lineWidth` | **6** | 炮线宽度（px，绘制用） |
| `warnLeadSeconds` | 1.2 | 预警提前量（= chargeSeconds，进入蓄能即预警） |
| `aimTolerance` | 0.03 | 蓄能期锁定的角度容差（rad）——超出则重新蓄能（防瞬转锁定） |

## 事件流与开火门控

**生产者**：`js/tank_boss.js updateBossRailCharge(t, dt, target)`（纯逻辑，可 Node 测试）。

1. 仅当 `t.weapons.primary.type === 'railgun'` 且 `reloadT <= chargeSeconds` 时进入蓄能；
2. 逐帧产出 `{type:'railCharge', x, y, angle, length, width, progress}`（`progress` 0→1）；
3. 蓄能未完成时 `t.railChargeHold = true`；完成当帧产出 `{type:'railReady'}` 并清 hold（**下一帧** AI 的开火判据才放行）；
4. `reloadT > chargeSeconds`（装填中段）→ 复位 hold 与计时。

**消费方**：`tank_battle.html` 的 AI 主循环 —— **只对 `e.isBoss` 生效**（⚠ 玩家也能装 railgun，玩家侧不得被蓄能门控拦住，否则空格打不出弹）；事件写入 `bossRailFx`，开火门控读 `!e.railChargeHold`。

## 绘制契约

**实现**：`js/tank_battledraw.js drawBossRailLine(ctx, fx)`（导出 + `globalThis`）；`fx = { kind:'charge'|'fire'`, x, y, angle, length, width, progress }`。

- **charge**：白色 1px 主线（alpha `0.25 + 0.5×progress`）+ 沿主线 3 条 `lightningPath` 电弧（锯齿幅度 `4+6×progress`）+ 线端白光点（半径 `6+6×progress`，外圈冷白晕）+ 线两侧淡红晕（`rgba(255,80,60,0.10)`）。
- **fire**：白芯 `max(2, width×0.5)` + 冷白外晕 `width×1.6`，按 `fx.alpha` 淡出。
- **配色**：三档取自 `RULES.railgunFx`（`barrelGrey / base / arc`），**不写死颜色**。

**玩家预警**：进入蓄能时 `pushLog('⚠ BOSS 电磁炮蓄能 — 离开炮线！','CRIT')` + 音效；屏幕顶部红色横条（2.4s）。与 [蓄能激光](./laser.md) 的警示带是**两套独立机制**（激光是持续光束 + 车体冻结；电磁炮是瞬发 + 炮线预警），共用「先给预警再开火」的设计语言。

## 相关页面
- [行为与弱点](./behavior.md) — 随机武备如何把 railgun 装到 Boss 上
- [蓄能激光](./laser.md) — 另一套「蓄能→开火」的 Boss 机制（参数唯一口径在该页）
- [特效与视效](../combat/fx-visual.md) — 电磁炮三段视效与电弧实现