# 部署物与布雷

> **摘要**：便携式掩体的单向透明与上限、地雷与雷场的预约/触发/装填，以及全部部署上限的唯一数值表。
> **适用版本**：现行（2026-10-21）
> **源自**：`docs/specs/combat.md` §8.1、§13.3、§13.6（#J1）（2026-10-21 拆分）
> **相关**：[技能与副武器](./abilities-secondary.md) · [敌方 AI](./enemy-ai.md) · [地图规范](../map.md)

## 目录
- [便携式掩体](#便携式掩体)
- [部署上限](#部署上限)
- [布雷器与雷场](#布雷器与雷场)
- [地雷的触发与伤害](#地雷的触发与伤害)

## 便携式掩体

（原 §8.1，2026-09-20 #E4/#F5/#F6）

- **单向透明**：部署方阵营的炮弹可穿过便携式掩体（不拦截），**对立方**炮弹按确定性实体在掩体入口点被挡下（`tank_fire.js stepShells` 的 `_deployablePathHit` 与部署物 OBB 求交）。视觉上以朝向指示标注「我方穿透侧」：穿透侧画青色虚线 + 绿色箭头（`tank_battle.html` 部署物绘制），对敌面为实线装甲边。
- **尺寸（唯一数值口径）**：`RULES.abilities.deploy_cover` 的 `dist` **90** / `lenMult` **3.2** / `width` **22** / `hp` **200** / `shieldHp` **150** / `duration` **30s** / `cooldown` **20s**（2026-10-21 按 `RULES.abilities` 核对）。沿革：`lenMult` 1.6 → 3.2（2026-09-20 #E4「再加长至当前 2 倍」）；`width` 22 取代旧硬编码 20。**[技能与副武器](./abilities-secondary.md) 的「战术掩体」条只讲部署方向语义，数值一律回本条。**
- **部署方向**：炮塔正前方（读 `turretAngle`），2026-09-17 #C4b 用户裁定。

## 部署上限

（原 §8.1 #F6，2026-09-20，取代 #E4「超限淘汰最早」）

基础上限与升级步长**唯一数值口径 = 下表（`RULES.abilities.deploy_limits`，2026-10-21 核对）**，升级卡经 `upgradeCards` 映射（`ability_deploy_cover_fortified→cover+1`、`weapon_secondary_mine_upgrade→mine+1`、`turret_bunker→turret+1`）：

| 键 | 值 | 语义 |
|---|---|---|
| `coverMax` | 2 | 掩体基础上限 |
| `mineMax` | 6 | 地雷**同时在场**上限（沿革 3 → 6，见下节） |
| `coverMaxUpgradeStep` / `mineMaxUpgradeStep` | 1 / 1 | 每张升级卡增加的槽位数 |
| `coverMaxHardCap` / `mineMaxHardCap` | 6 / 12 | 升级叠加的绝对硬上限（沿革 8 → 12） |
| `mineFieldCount` | 3 | 单次雷场落雷数（沿革 5 → 3） |
| `mineFieldRadius` / `mineFieldDelay` / `mineFieldReload` | 70 / 4s / 15s | 雷场半径 / 预形态等待 / 装填冷却 |

**能力/页面部署路径超限时拒绝新部署并提示，保留已部署物**：`js/tank_abilities.js` `deploy_cover` 与 `tank_bench.html` `spawnCoverBtn` 部署前检查 `deployableCount >= deployableCap` → 拒绝（不生成新掩体）；`tank_battle.html` `handleMineFieldF` 已有预约（`pendingMineFields.length>0`）时按 F 拒绝；雷场生成前检查 `deployableCount('mine') + n > cap` → 取消该预约并提示，不生成新雷场（保留已布地雷）。共享核心 `enforceDeployLimits` 的「淘汰最早」仅作为兜底（绕过能力路径直接 spawn 时生效）；按类型独立计数。

- **地雷上限的两次调整（#J1，2026-09-30）**：`RULES.abilities.deploy_limits.mineMax` **3 → 6**、`mineMaxHardCap` **8 → 12**（现行值见上表）。**根因**：`mineMax` 是「**场上同时存在**的地雷数」上限，而它恰等于当时的单次雷场数量 ⇒ 首轮即把上限用尽；地雷存续 30~45s、单节点战斗远长于此 ⇒ 后续雷场全部被拒。**口径澄清**：`mineMax` 是**同时在场数**，不是「本局总数」。调大它才能让一个节点内连续布设多轮；想要更大的单次雷场应同步上调 `mineFieldCount` 与 `mineMax` 两者。

## 布雷器与雷场

（原 §8.1 + §13.3，2026-09-20 #F5/#F6；2026-09-30 #H2）

**两次 F + 预形态**：第一次 F 在鼠标位置显示**拟生成的雷场形状**（虚线圆 + 雷点预览，数量按当前可用余量裁剪）；第二次 F 确认 → 落点定格 → 预形态等待（`mineFieldDelay`）后在预形态位置环形生成整片雷场。**同一时刻仅允许 1 个待生成雷场**（`pendingMineFields.length>0` 时按 F 拒绝新预约——#F5）。F 的按键语义为**原生 keydown 边沿**（见 [技能与副武器 · 开关类副武器的 F 边沿口径](./abilities-secondary.md#开关类副武器的-f-边沿口径)）。

**落雷数按可用余量裁剪（#H2）**：`n = clamp(mineFieldCount, 0, cap − existing)`，预约时与生成时各裁一次；**余量为 0 才拒绝，且在按 F 的瞬间即提示**（不再让玩家白等）。#F6「超限拒绝且保留已布地雷」原意保留。绘制层直取预约时的数量（`pf.count`），所见即所得。

**#H2 修掉的三个原缺陷（2026-09-30 用户反馈「地雷无法释放」）**：

1. `deploy_limits` 中 `mineFieldCount(5) > mineMax(3)`，而生成侧 `n = min(mineMax, count)` 把 5 钳成 3，配上「`existing + n > cap` 即拒绝」的判据 ⇒ **首轮布满 3 枚后所有后续雷场 100% 静默丢弃**；
2. `handleMineFieldF` 既不检查也不写入 `secondaryReloadT`，装填冷却完全失效；
3. 绘制层二次用 `mineMax` 钳制，预形态与实际落点数对不上。

**装填门控（#F5 + #H2）**：布雷受 `secondaryReloadT` 装填冷却门控——**单发路径**由 `fireActiveSecondary` 顶部统一拒绝（单发装填时长取 `WEAPON_DEFAULTS.secondary.mine_layer.reload`），**雷场路径**由 `handleMineFieldF` 在确认预约时写入 `player.secondaryReloadT = reload / debuffReloadRate`（兜底 `RULES.abilities.deploy_limits.mineFieldReload = 15`）、冷却中按 F 拒绝（#H2 前该路径完全漏写，`secondaryReloadT` 恒为 0，冷却形同虚设且可无冷却连点）。

## 地雷的触发与伤害

（原 §8.1「装填与触发口径」，#U39 2026-10-18 半径入缺省表）

地雷**触发半径**（单发/雷场）与 `spawnMine` 默认值、爆炸 AOE `blastRadius` **唯一数值口径 = `WEAPON_DEFAULTS.secondary.mine_layer`**（`triggerRadius` / `blastRadius`，bench 手动布雷同源）——判定为敌对实体**中心点**距离 ≤ `triggerRadius`；battle 伤害走 `applySplashAt`（×0.5 衰减）、bench 走事件直算，触发阵营敌对实体生效（玩家自身也会被己方地雷波及）。

**#U39（2026-10-18）**：上述两个半径已从 `fireActiveSecondary` 的字面量收口进缺省表并由 `cfg` 消费 —— 否则「阔域雷场」类升级卡（`weapon_secondary_mine_radius`）写了永远不生效。**沿革**：收口前为 `blastRadius` 70 / `triggerRadius` 45 / `spawnMine` 默认 40 的字面量。

## 相关页面
- [技能与副武器](./abilities-secondary.md) — 战术掩体技能入口与 F 键分派
- [敌方 AI](./enemy-ai.md) — 敌人如何绕开部署物
- [地图规范](../map.md) — tier 与地形对部署的限制
- [武器与装填](./abilities-secondary.md) — `WEAPON_DEFAULTS.secondary` 的定位
