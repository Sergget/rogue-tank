# 升级覆盖面

> **摘要**：把 `fireControlCrit` 等修改变成三通道可升级（卡牌白名单 / 局外永久商店 / 局内商店）。
> **适用版本**：现行（2026-10-21）
> **源自**：`docs/specs/cards.md` §10（2026-10-21 拆分）
> **相关**：[被动卡与模块暴击](./passive-crit.md) · [七类效果类型 · modifier](./effect-types.md#modifier) · [兼容索引](../cards.md)

## 问题

（原 §10「问题」段，2026-10-10 #O3 对账）

`computeStats` 产物键中 `fireControlCrit` / `loaderAmmoCrit`（P-49 模块命中概率修正，硬上限 0.25）**三通道全空缺**（白名单无、两商店无）——注释明写「玩家侧可随卡牌/技能升级增强」的死升级通道；`motionSpreadMul` 仅局内商店可写；`shellSpeed` / `turnRate` / `turretTurnRate` / `trackLock` / `enginePower` 等仅卡牌单通道。

## 三通道补齐

参数唯一口径：`MODIFIER_STATS` / `UPGRADE_DEFS` / `RUN_SHOP_DEFS`。

| 通道 | 新增 |
|---|---|
| **卡牌白名单** | `motionSpreadMul` / `fireControlCrit` / `loaderAmmoCrit`（+ 3 张新卡：rare `mod_fire_control_crit`（P-49 炮手/炮闩 +0.1，`maxStacks 2`）、rare `mod_loader_ammo_crit`（装填手/弹药 +0.1，`maxStacks 2`）、epic `mod_motion_stabilizer`（×0.9，`maxStacks 3`）） |
| **局外永久商店** | 7 项：`shell_speed_up`（+30/级）/ `engine_power_up`（+60/级）/ `turn_up`（+0.08/级）/ `turret_turn_up`（+0.08/级）/ `aim_speed_up`（+0.02/级，均为 `maxLevel 5`）/ `fire_control_crit` / `loader_ammo_crit`（+0.05/级 ×5 叠满达 0.25 钳帽） |
| **局内商店** | 3 项：`shell_velocity`（`shellSpeed` +40/级）/ `turret_traverse`（`turretTurnRate` +0.1/级）/ `track_field_kit`（`trackLock` −0.5s/级，`limit.min: 5` 拒购防线）——总数 **12 → 15**（火力 6 / 防护 2 / 机动 4 / 杂项 3） |

## 回归

（原 §10 末段）

- `scripts/test-economy.js`：新增定义完整性 + 上限判定 + `applyUpgrades` 真实生效断言；
- `scripts/test-card-effects.js`：169 张全卡逐卡验证；
- `scripts/validate-content.js`：卡面数字一致性。

## 相关页面
- [被动卡与模块暴击](./passive-crit.md) — `fireControlCrit`/`loaderAmmoCrit` 的运行时消费（`moduleFromHit`）
- [七类效果类型 · modifier](./effect-types.md#modifier) — 白名单通道的写入方式
- [稀有度、权重与验证工具链](./rarity-tools.md) — 卡池审计脚本
