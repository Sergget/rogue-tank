# Boss 战斗

> **摘要**：Boss 激光怎么转、怎么被掩体挡住、Boss 怎么走位、召唤波次怎么补——战斗侧全部现行口径。
> **适用版本**：现行（2026-10-21）
> **源自**：`docs/specs/combat.md` §9.5、§11.3、§12.1、§12.2、§12.3（2026-10-21 拆分）
> **相关**：[Boss 规范](../boss.md) · [敌方 AI](./enemy-ai.md) · [敌人强度与难度](./enemy-scaling.md)

## 目录
- [激光炮塔转速](#激光炮塔转速)
- [激光期的车体冻结](#激光期的车体冻结)
- [光束被掩体截断](#光束被掩体截断)
- [Boss 随机走位](#boss-随机走位)
- [召唤波次](#召唤波次)

> **Boss 血量与阶段缩放不在此页**：`tuning.hpMul` / 阶段阈值 / 数据契约归口 [Boss 规范](../boss.md) §5；本页只写战斗侧机制。

## 激光炮塔转速

（原 §11.3 #H4 → 原 §12.1 #I1；**本节是 `laserTurnSpeed` 的唯一现行数值口径**）

**用户裁定（#H4）**：「boss 发射激光时，炮塔又不转动了？我需要它以一个固定、较慢的速度转动，给玩家走位的机会，且会被建筑、岩石等全高掩体阻挡」。**（#I1）**：「boss 发射激光时车体不能移动，炮塔转速再降低」。

- **固定角速度直驱**：激光期（蓄能+射击）由 `updateBossLaser` 直接推进 `t.turretAngle`，角速度 = `RULES.boss.laser.laserTurnSpeed` = **0.35 rad/s（≈20°/s）**（2026-10-21 按 `RULES.boss.laser` 核对）。绝对值、**不受 modifier / 难度乘子影响**；转向目标 = AI 本帧期望方向（`opts.turretDesired`，已含射界钳制），到向即停，蓄能期与射击期相同。
- **沿革**：~~timed modifier 源 `boss-laser-turn` + `chargeTurretTurnMul`/`fireTurretTurnMul` 乘数方案~~（#G1）——实际角速度 ≈ 0，用户实测「炮塔又不转动了」，已废弃；#H4 改为直驱时 0.55 rad/s，#I1 再降至 0.35（因为 0.55 仍偏快）。
- **量化意义（#I1）**：激光周期 41 帧 × 0.035 = 1.435 rad < π/2(1.571)——**单次激光周期内炮塔转不满 90°**，玩家的绕侧/走位窗口显著变宽（回归断言锁定该上限）。
- **AI 转炮抑制**：激光期置 `t.bossLaserHoldTurret = true`，battle AI 循环据此跳过炮塔驱动（车体机动/开火不变）——两套驱动不再叠加；激光结束/冷却/未解锁/死亡自动释放。
- `RULES.boss.laser` 现存键：`laserTurnSpeed` / `blockByFullCover: true`；已删除 `chargeTurretTurnMul`/`fireTurretTurnMul`（含 `BOSS_LASER_TURN_SOURCE` 导出与 `_setBossLaserTurretMod`/`_clearBossLaserTurretMod`）。
- **回归**：`scripts/test-boss.js` #H4 段（hold 标志/固定转速单帧转角与到向即停/hold 释放/建筑与岩石阻挡/灌木与空场不阻挡）+ #I1 段（蓄能期 holdMove / 释放 / `laserTurnSpeed` 等于上条现行值；#H4 段改为「限速转角 ≤ min(帧数×步长, π/2)」的动态断言）。

## 激光期的车体冻结

（原 §12.1 #I1）

激光期（蓄能+射击）新增 `t.bossLaserHoldMove = true`——接入层（battle AI 循环）据此**连 `driveTank` 一并跳过**，车体全程定桩（此前仅抑制炮塔转炮，车体仍被 AI 驱动）。激光结束/冷却/未解锁/死亡自动释放；走位博弈完全交给玩家。

## 光束被掩体截断

（原 §12.2 #I2）

**用户裁定**：「激光路径被建筑物阻挡时，虚线框要反映出来」。

- 新增 `_laserBeamBlockDist(bx, by, angle, length, covers)`：沿光束方向求最近**全高掩体**（`tierGroup:'structure' && vision`，即 building/full/intact/rock/ruined）的**入口距离**（Liang-Barsky 射线×OBB，局部系 slab 裁剪取 `t0`），无阻挡返回全长。`opts.covers` 注入节点掩体。
- **伤害口径改为光束级截断**（取代 #H4 的逐目标连线判定）：目标沿光束投影 `proj > blockDist` 即被挡住，本帧不掉血（`laserBlocked` 事件）。光束与虚线共用同一 `blockDist`，判定与表现严格一致。
- **绘制层**：`laserCharge`/`laserFire` 事件均携带 `blockedDist`；battle 的警示带/光束按 `blockedDist` 截断绘制，并在截断点画橙色阻挡标记（可直读「掩体后方安全」）。
- 掩体被摧毁（hp≤0）后自动失去阻挡；灌木/栅栏/水/泥/路/残骸不阻挡。
- **沿革**：#H4 时期的逐目标连线判定（`_laserBlockedByCover`）已被本节取代——当时的光束仍完整绘制、只有被挡目标不掉血，玩家看不出原因。
- 回归：`test-boss` #I2 段——蓄能/射击事件 `blockedDist ≈ 建筑入口`（墙心 150、宽 60 ⇒ 入口 120 − 炮口偏移）；无掩体时 = 全长；被挡目标不掉血。

## Boss 随机走位

（原 §12.3 #I4，反站桩）

**用户裁定**：「增加 boss 随机移动、瞄准等动作，现在的 boss 几乎完全是站桩等玩家」。

- 新增 `RULES.ai.bossWander`：`{ enabled, intervalMin 2.2, intervalMax 4.6, distMin 240, distMax 520, waypointReach 90, clampMargin 140 }`。
- `updateBossBehavior` 周期性在**玩家周围**随机选航点（环绕半径 240~520px，保持交战距离），写入 `t._bossMoveOverride = { turn, move }`；battle AI 循环对 Boss 用该覆盖替换 `aiDecide` 的车体 `turn/move`——**炮塔仍照常锁定玩家瞄准开火**（瞄准动作保留）。
- 换点条件：到点（<90px）或超时（2.2~4.6s）；航点按 `clampMargin` 钳进节点边界。
- **豁免**：`crush` 风格（冲撞碾压为身份）、weave 冲刺窗口、激光期（`bossLaserHoldMove`）、目标已毁。hold/skirmish/command/fortify 全部获得机动。
- 回归：`test-boss` #I4 段——覆盖产生且 `move=1` 出现 / 航点环绕玩家且落在 [distMin,distMax] / 边界钳制 / 激光期与 crush 豁免 / 目标死亡无覆盖。

## 召唤波次

（原 §9.5 #G2）

`RULES.boss.summonWaves` 新增 `defaultPool`（缺省 `[{tankId:'dummy',count:2}]`）与 `defaultWaves`（3）。`bossSummonWave` 在配置 `summons` 为空**且** `t.boss.id` 存在时，用 `defaultPool` 补足 3 波（`hpFrom` 依次取 1.0 / 配置默认），裸测试实体的空 summons 仍返回 null（不污染单测）。5 个 Boss JSON 均已补 3 波 `summons`（`hpFrom` = 1.0/0.66/0.33 对应 100%/67%/33% HP 触发）。分波次召唤的阈值语义归口 [Boss 规范](../boss.md)。

## 相关页面
- [Boss 规范](../boss.md) — 数据契约、血量倍率、阶段阈值
- [敌方 AI](./enemy-ai.md) — 普通敌人的机动与交战结构（Boss 豁免项）
- [敌人强度与难度](./enemy-scaling.md) — `entityMults.maxHp` 与 Boss 血量两级叠加
- [弹种系统](./ammo-system.md) — 对 Boss 的弱点伤害走 `resolveHit` opts
