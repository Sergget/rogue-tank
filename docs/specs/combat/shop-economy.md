# 局内商店与得分

> **摘要**：局内商店的定价曲线与后期折扣、击杀分随敌人等级的公式、节点/波次得分与终局转化，以及折扣/得分倍率卡牌的聚合口径。
> **适用版本**：现行（2026-10-22）
> **源自**：2026-10-22 第五批新建（此前本主题在 specs 无正文，仅散落于归档与代码）
> **相关**：[武器与装填](./weapons-reload.md) · [卡牌规范 · 七类效果类型](../cards/effect-types.md) · [Boss 运行时](../boss/runtime.md)

## 目录
- [局内商店定价曲线](#局内商店定价曲线)
- [击杀分与其它得分](#击杀分与其它得分)
- [折扣与得分倍率卡](#折扣与得分倍率卡)

## 局内商店定价曲线

**唯一实现**：`js/tank_economy.js` 的 `runShopPriceFor(def, ownedLevel)`；商品表唯一口径 = `RUN_SHOP_DEFS`（15 项，火力 6 / 防护 2 / 机动 4 / 杂项 3，见 [升级覆盖面](../cards/upgrade-coverage.md)）。

```
price = round(baseCost × costGrowth^lv × (lv > shopLateFromLevel ? shopLateDiscount^(lv − shopLateFromLevel) : 1))
```

| 键 | 值 | 语义 |
|---|---|---|
| `shopLateFromLevel` | **5** | 从第 6 级（ownedLevel=5）开始打折 |
| `shopLateDiscount` | **0.92** | 每级额外 ×0.92（−8%） |

**2026-10-22 用户需求**：「小幅降低后期升级所需的花费」。**为什么不动 costGrowth**：那是全局曲线形状，改了会连带压低前中期价格；叠加因子只在 lv > 5 时生效，**Lv0~Lv5 价格逐字节不变**。实测 `fast_reload`（baseCost 25 / costGrowth 1.6）：Lv5 **262（不变）** → Lv10 2749 → **1812（−34.1%）** → Lv15 28823 → **12520（−56.6%）**。

**折扣通道**：`runShopDiscount(player)`（卡牌 `shopDiscount` 相加，上限 **0.5**）在购买与展示两处同口径乘 `(1 − discount)`。

## 击杀分与其它得分

**击杀分（唯一公式）**：

```
killScore(level) = round(killScoreBase × (1 + killScoreLevelStep × (level − 1)))
```

| 键 | 值 | 语义 |
|---|---|---|
| `killScoreBase` | **20** | 基础击杀分（Lv1） |
| `killScoreLevelStep` | **0.25** | 每级递增比例 |

实测：Lv1 **20** / Lv4 **35** / Lv7 **50** / Lv10 **65** / Lv13 **80**。**友军击杀仍 ×0.5**。等级来源 = `tank.enemyLevel`（由 `js/tank_model.js applyEnemyAmmoByLevel` 写入，难度 diff → Lv1~13 的映射在 `tank_battle.html enemyLevelForDifficulty`）。

**沿革（不静默删除）**：改前 `killScore()` **无参数、恒 20**，不随等级/难度变化；2026-10-22 用户需求「提高击毁高等级敌人所获得的分数」⇒ 加等级系数。**向后兼容**：不传 level 时等价 Lv1 = 20，与旧行为逐字节一致。

**其它得分通道**（本页只列口径，公式细节在各自主页）：

- **节点通关分**：`js/tank_map.js scoreNode`——base = round(100 × (1 + index×0.2))，无伤 +50% / 速通 +20% / 据点存活 +20%。
- **生存波次分**：`100 + wave×50`，Boss 波 +500。
- **Boss 掉落分**：`bosses/*.json` 的 `loot.score`（550~650）在 `finishNode` 叠加进节点通关分（见 [Boss 运行时](../boss/runtime.md)）。
- **终局转化**：`settleRun` 按 `scoreToPointsRatio`（**0.1**）把本局得分转成商店点数；P-41 可花余额账本 = `runScore − runScoreSpent`（**消费不减损终局转化得分**）。

## 折扣与得分倍率卡

- `scoreMul`（economy 效果的 `scoreMul`）：写 `tank.runScoreMul`，**叠乘**；节点分/波次分/击杀分统一乘 `runScoreMultiplier(player)`。
- `shopDiscount`：不写 tank 字段，只在 `cardEffects`，由 `runShopDiscount` 遍历相加，**上限 50%**。
- 现有卡：`support_logistics`（rare，scoreMul 1.15 + shopDiscount 0.1）/ `support_supply_line`（common，0.1）/ `support_merit_badge`（common，1.08）/ `support_medevac`（legendary，reviveCount 1）。

## 相关页面
- [升级覆盖面](../cards/upgrade-coverage.md) — 局内商店商品表与三通道补齐
- [卡牌规范 · 七类效果类型](../cards/effect-types.md) — economy 字段与折扣聚合
- [Boss 运行时](../boss/runtime.md) — 掉落分与节点结算时序