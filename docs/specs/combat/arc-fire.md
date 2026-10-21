# 曲射火力

> **摘要**：榴弹炮副武器模式怎么开关、曲射弹怎么结算，以及 `isArc` 弹必须遵守的帧处理契约。
> **适用版本**：现行（2026-10-21）
> **源自**：`docs/specs/combat.md` §3.2b、§3.2c（2026-10-21 拆分）
> **相关**：[弹种系统](./ammo-system.md) · [技能与副武器](./abilities-secondary.md) · [特效与视效](./fx-visual.md)

## 榴弹炮曲射模式

（原 §3.2b，`howitzer`，副武器；2026-10-20 #W-I 现行口径）

**定位**：**模式载体**，不是独立武器类型，也不是技能。装进副武器槽（`weapons.secondary.type === 'howitzer'`）后**主炮**切曲射；卸下/换掉即回直射。判据唯一口径 `isHowitzerMode(t)`（`js/tank_weapons.js` 导出，消费方 `tank_fire.js` / `tank_move.js` / `tank_mvp.html` / `tank_cards.js`）。

**参数唯一口径 `WEAPON_DEFAULTS.primary.howitzer`**（`js/tank_weapons.js`）：

| 键 | 值 | 语义 |
|---|---|---|
| `reloadMult` | 2.2 | 曲射重装填（整组装填，显著慢于直射） |
| `arcSpeed` | 260 | 曲射弹飞行速度（px/s） |
| `splashRadius` | 90 | 落点爆炸半径（升级卡「阔域弹幕」→ 135） |
| `minArcRange` | 120 | 最小曲射距离（迫击炮死角，瞄准点过近时沿炮塔方向推出） |
| `moveSpeedRatio` | 1/3 | 模式下**行进限速系数**（`js/tank_move.js` 链尾独立乘子） |
| `spreadFactor` | 1.2 | 散布圈半径系数（瞄准圈与落点散布**同一参数源**） |
| `barrage` | null / 3 | 急速射（升级卡「急速射」→ 3 连发，发际间隔 0.5s） |

**结算语义**（`js/tank_fire.js` `firePrimaryShell` 的 howitzer 分支 + `stepShells` 的 `isArc` 落点分支）：

- **弹种锁定 he**（忽略玩家当前 `ammoKey`）；
- **落点 = `ctx.aimPoint`**（鼠标世界位置，mvp 注入 `fireCtx.aimPoint = mouseWorld`）——落点分支不读 `target`，`fireTank` 对该模式放行 `target == null`；
- **越掩体**：`isArc` 天然绕过路径遮挡，且 `fireTank` 的**炮口贯穿预检**对该模式豁免（`barrelCovers = []`）；
- **直击**（落点爆炸半径内最近敌对坦克且 `dist ≤ splashRadius×0.9`）：装甲取目标 `hull/turret × front/side/rear` **六面最薄值**，经 `resolveHit` 的 `opts.forceEffThickness` **取代**几何等效厚度（曲射大角度落弹不适用入射角斜面等效，`allowBounce=false` 同时关闭跳弹链）；随后对其它目标补 `splash × 0.35` 衰减溅射（直击目标被排除，不重复扣伤）；
- **近失**：`s.Dmg` 直接走 `applySplash`（线性衰减，he 溅射语义，不走装甲）；
- **散布**：落点沿**切向**吃一个 `gauss(σ × spreadFactor) × 瞄准距离` 的高斯样本（径向距离保持瞄准距离）——散布圈是真实弹着分布，不是装饰。

**限速实现约束**：`moveSpeedRatio` 必须走 `driveTank` 的链尾**独立乘子**，**不可并入 `speedModifier`**——`js/tank_move.js:45-47` 的公路判定会把 `speedModifier` 强制归 1，并入即被静默清零（实测曲线路网下减速完全失效）。

**急速射落点（2026-10-20 #X7）**：整组锁定**首发瞬间的落点快照**（`_howitzerBurst.aim = {x,y}`），追发弹经 `ctx.aimPointFrozen` 使用该快照落点；散布仍**每发独立采样**（同区域散布，非同点重叠）。实测 200 组三连发最大偏移 17.8px（1σ = 8.0px）。~~旧口径「跟手」~~（每发重读实时 `aimPoint` ⇒ 开火后移动鼠标会让后两发落点跟着跑）已被取代。

**F 键语义（2026-10-20 #X5 订正）**：F = **曲射/直射模式开关**（走原生 keydown 边沿，见 [技能与副武器 · 开关类副武器 F 边沿口径](./abilities-secondary.md#开关类副武器的-f-边沿口径)），**不承担发射**；射击全部走主炮入口（左键/空格）。~~此前本节记为「F 键不响应（`tryFireSecondary` 对 howitzer 直接 return false）」~~——该表述在 2026-10-20 之前成立（当时 howitzer 恒曲射、无模式开关），#X5 起 F 有了开关职责故改写；「不承担发射」这一点两版一致。

## 曲射弹越障契约

（原 §3.2c，`isArc` 弹的帧处理，2026-10-20 #Y1 现行口径）

**唯一口径**：`isArc` 弹**在飞行途中不得被直射扫掠命中段处理**——只在抵达落点（`s.dist >= s.totalDist`）时爆炸结算。`stepShells` 的 `if(s.isArc){ ... }` 块**必须每帧以 `return` 短路**（无论是否已到落点），否则未到落点的帧会穿透到下方直射扫掠段（`raycastTank` + `resolveHit`），把途中坦克当直射目标结算（详情与取证见 `DEVELOPMENT-batches-2026-10.md` §4.112 #Y1）。

**`maxRange` 契约**：`maxRange` 对 `isArc` 弹**恒不生效**——所有 `isArc` 弹（`mortar` / `howitzer`）创建时**不设 `maxRange`**（缺省 `undefined`，`s.maxRange > 0` 判定为假），射程由 `totalDist` 单一口径承担。若将来给 `isArc` 弹加 `maxRange`，需先确认不会与落点结算抢跑（`maxRange` 判定位于 `isArc` 块**之前**，会直接 `s.dead = true` 而不走落点爆炸）。

**历史（不静默删除）**：本契约在 2026-10-20 之前**注释承诺了代码没做的事**——块尾注释写「曲射弹在落点结算后直接 return（不进入直射的扫掠命中段）」，但 `return` 只写在 `dist >= totalDist` 的**内层**分支里，`isArc` 块本身缺兜底 `return`。更早的未提交注释为「#W-I 补回（替换时吞掉了原闭合行）」，说明 #W-I 用替换实现该分支时把闭合花括号位置弄错——花括号表面配平但语义反转。该缺陷与「测试链假绿」两环叠加，长期既未被测试抓住、也未被测试链暴露（#Y1）。

## 相关页面
- [弹种系统](./ammo-system.md) — HE 弹种数值与溅射半径
- [技能与副武器](./abilities-secondary.md) — F 键语义分派与副武器清单
- [特效与视效](./fx-visual.md) — 曲射弹体的俯仰与阴影绘制
- [武器与装填](./weapons-reload.md) — `WEAPON_DEFAULTS` 与规格通道
