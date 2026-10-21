# 蓄能激光

> **摘要**：`RULES.boss.laser` 参数表（唯一口径）、事件流、车体冻结与炮塔定速、掩体阻断。
> **适用版本**：现行（2026-10-21）
> **源自**：`docs/specs/boss.md` §6 末条、§7.1、§8.1、§8.2（2026-10-21 拆分）
> **相关**：[行为与弱点](./behavior.md) · [战斗规范 · Boss 战斗](../combat/boss-combat.md) · [沿革与已作废](./changelog.md)

## 蓄能激光参数表（唯一口径）

（原 §6 末条，2026-09-20 #E9 用户反馈④）

**用户口径**：「增加蓄能激光（主炮发射，蓄能时炮塔转速大幅下降、炮线上生成虚线与红色透明填充预警，完毕时区域内连续快速掉血）」。

`updateBossLaser(t, dt, target, opts)`，参数收口 `RULES.boss.laser`：

| 字段 | 值 | 说明 |
|---|---|---|
| `ranges` | `[0.98, 0.72, 0.45, 0.18]` | 各阶段启用/加强激光的血量比例阈值（`hpRatio ≤ ranges[阶段序]` 时解锁） |
| `chargeSeconds` | 2.6 | 蓄能时长（期间炮塔转速 ×`chargeTurretTurnMul` **0.18**，玩家可绕侧） |
| `fireSeconds` | 1.5 | 射击持续时长 |
| `cooldown` | 9 | 两次激光间隔（随阶段索引 ×(1−0.12·idx)，下限 ×0.5） |
| `width` / `length` | 34 / 1400 | 光束宽度（沿炮线法向全宽）/ 长度（px） |
| `dpsRatio` | 0.55 | 每秒伤害 = Boss 标准伤害 × 该系数（带内目标**连续快速掉血**） |
| `telegraphDash` / `telegraphColor` | `[16,12]` / `rgba(255,64,48,0.28)` | 警示虚线参数 / 红色透明填充 |

**事件流（供绘制层）**：蓄能期 `laserCharge{progress}` → 射击期 `laserFire`；`tank_mvp.html` 写入 `bossLaserFx` 并绘制「虚线警示带 + 红色透明填充」（越接近发射越亮）与实心光束。命中判定为点到射线段的距离 ≤ `width/2 + 目标半宽`，经 `applyDamage` 结算（敌对阵营过滤，与玩家/友军/Boss 通用）。

> **原归口指针（照录）**：`specs/combat.md` **§11.3**（激光炮塔固定转速 + 全高掩体阻挡）、**§12.1**（激光期车体冻结）、**§12.3**（随机走位）、**§12.4**（建筑密度摘要）。这些节在 combat 卷仍现行，本页不复制其正文。

## 炮塔转速：固定角速度直驱

（原 §7.1，#G1；**已被 #H4/#I1 取代后再定型**）

> **现行口径**：`updateBossLaser` **直接推进** `t.turretAngle`，角速度 = `RULES.boss.laser.laserTurnSpeed`（**0.35 rad/s**，#I1 由 0.55 再降），**固定绝对值、不受 modifier/难度影响**；激光期置 `bossLaserHoldTurret`（抑制 AI 转炮）与 `bossLaserHoldMove`（**车体冻结**，#I1）。
>
> ~~timed modifier 源 `boss-laser-turn` + `chargeTurretTurnMul`/`fireTurretTurnMul` 乘数~~ **已废弃**——沿革见 [沿革与已作废 · laser-turn 乘数方案](./changelog.md#laser-turn-乘数方案已废弃)。

## 激光期车体冻结

（原 §8.1，#I1）

- `t.bossLaserHoldMove = true`（蓄能+射击全程）：接入层跳过 `driveTank`，车体定桩（此前仅 `bossLaserHoldTurret` 抑制炮塔）。
- `RULES.boss.laser.laserTurnSpeed` **0.55 → 0.35 rad/s**；仍为固定角速度直驱。单周期转角 41 帧 × 0.035 = 1.435 rad < π/2 ⇒ 走位窗口量化成立。
- 细则见 [战斗规范 · Boss 战斗](../combat/boss-combat.md)。

## 蓄能虚线与光束反映掩体阻挡

（原 §8.2，#I2）

- `_laserBeamBlockDist()`：沿光束求最近全高掩体（`structure + vision`：`building`/`full`/`intact`/`rock`/`ruined`）的**入口距离**（Liang-Barsky 射线×OBB）；`laserCharge`/`laserFire` 事件携带 `blockedDist`。
- 伤害口径改为**光束级截断**（目标沿光束投影 > `blockDist` 不掉血，`laserBlocked` 事件）；绘制层按 `blockedDist` 截断虚线/光束并画阻挡标记。
- 细则见 [战斗规范 · Boss 战斗](../combat/boss-combat.md)。

## 相关页面
- [行为与弱点](./behavior.md) — 激光与阶段行为的协同
- [沿革与已作废](./changelog.md) — `laser-turn` 乘数方案为何被废弃
- [战斗规范 · Boss 战斗](../combat/boss-combat.md) — 绘制与命中截断的实现细节
