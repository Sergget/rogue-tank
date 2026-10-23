# 曲射火力

> **摘要**：榴弹炮副武器模式怎么开关、曲射弹怎么结算，以及 `isArc` 弹必须遵守的帧处理契约。
> **适用版本**：现行（2026-10-22）
> **源自**：`docs/specs/combat.md` §3.2b、§3.2c（2026-10-21 拆分）
> **相关**：[弹种系统](./ammo-system.md) · [技能与副武器](./abilities-secondary.md) · [特效与视效](./fx-visual.md)

## 榴弹炮曲射模式

（原 §3.2b，`howitzer`，副武器；2026-10-20 #W-I 现行口径）

**定位**：**模式载体**，不是独立武器类型，也不是技能。装进副武器槽（`weapons.secondary.type === 'howitzer'`）后**主炮**切曲射；卸下/换掉即回直射。判据唯一口径 `isHowitzerMode(t)`（`js/tank_weapons.js` 导出，消费方 `tank_fire.js` / `tank_move.js` / `tank_battle.html` / `tank_cards.js`）。

**参数唯一口径 `WEAPON_DEFAULTS.primary.howitzer`**（`js/tank_weapons.js`）：

| 键 | 值 | 语义 |
|---|---|---|
| `reloadMult` | 2.2 | 曲射重装填（整组装填，显著慢于直射） |
| `arcSpeed` | 260 | 曲射弹飞行速度（px/s） |
| `splashRadius` | 90 | 落点爆炸半径（升级卡「阔域弹幕」→ 135） |
| `minArcRange` | 120 | 最小曲射距离（迫击炮死角，瞄准点过近时沿炮塔方向推出） |
| `moveSpeedRatio` | 1/3 | 模式下**行进限速系数**（`js/tank_move.js` 链尾独立乘子） |
| `spreadFactor` | **4.0** | **精度倍率**（名不副实，保留键名）：落点散布 = **主炮 base 精度 × 该值 × 瞄准距离**，**不乘 `player.sigma`**。2026-10-23 用户裁定「削弱榴弹炮模式：精度计算改为 4 × 主炮 base 精度 × 距离」；沿革 2.0（2026-10-22）→ 1.2（更早） |
| `barrage` | null / 3 | 急速射（升级卡「急速射」→ 3 连发，发际间隔 0.5s） |

**结算语义**（`js/tank_fire.js` `firePrimaryShell` 的 howitzer 分支 + `stepShells` 的 `isArc` 落点分支）：

- **弹种锁定 he**（忽略玩家当前 `ammoKey`）；
- **落点 = `ctx.aimPoint`**（鼠标世界位置，battle 注入 `fireCtx.aimPoint = mouseWorld`）——落点分支不读 `target`，`fireTank` 对该模式放行 `target == null`；
- **越掩体**：`isArc` 天然绕过路径遮挡，且 `fireTank` 的**炮口贯穿预检**对该模式豁免（`barrelCovers = []`）；
- **直击**（落点爆炸半径内最近敌对坦克且 `dist ≤ splashRadius×0.9`）：装甲取目标 `hull/turret × front/side/rear` **六面最薄值**，经 `resolveHit` 的 `opts.forceEffThickness` **取代**几何等效厚度（曲射大角度落弹不适用入射角斜面等效，`allowBounce=false` 同时关闭跳弹链）；随后对其它目标补 `splash × 0.35` 衰减溅射（直击目标被排除，不重复扣伤）；
- **近失**：`s.Dmg` 直接走 `applySplash`（线性衰减，he 溅射语义，不走装甲）；
- **散布**：落点沿**切向**吃一个 `gauss(4 × RULES.spread.base) × 瞄准距离` 的高斯样本（径向距离保持瞄准距离）——散布圈是真实弹着分布，不是装饰。 **`spreadFactor = 4.0` ⇒ 落点散布半径 = 4 × 主炮 base 散布 × 瞄准距离**（2026-10-23 用户裁定削弱，唯一口径见上表）。

**限速实现约束**：`moveSpeedRatio` 必须走 `driveTank` 的链尾**独立乘子**，**不可并入 `speedModifier`**——`js/tank_move.js:45-47` 的公路判定会把 `speedModifier` 强制归 1，并入即被静默清零（实测曲线路网下减速完全失效）。

**急速射落点（2026-10-20 #X7）**：整组锁定**首发瞬间的落点快照**（`_howitzerBurst.aim = {x,y}`），追发弹经 `ctx.aimPointFrozen` 使用该快照落点；散布仍**每发独立采样**（同区域散布，非同点重叠）。实测 200 组三连发最大偏移 17.8px（1σ = 8.0px）。~~旧口径「跟手」~~（每发重读实时 `aimPoint` ⇒ 开火后移动鼠标会让后两发落点跟着跑）已被取代。

**F 键语义（2026-10-20 #X5 订正）**：F = **曲射/直射模式开关**（走原生 keydown 边沿，见 [技能与副武器 · 开关类副武器 F 边沿口径](./abilities-secondary.md#开关类副武器的-f-边沿口径)），**不承担发射**；射击全部走主炮入口（左键/空格）。~~此前本节记为「F 键不响应（`tryFireSecondary` 对 howitzer 直接 return false）」~~——该表述在 2026-10-20 之前成立（当时 howitzer 恒曲射、无模式开关），#X5 起 F 有了开关职责故改写；「不承担发射」这一点两版一致。

## 曲射弹越障契约

（原 §3.2c，`isArc` 弹的帧处理，2026-10-20 #Y1 现行口径）

**唯一口径**：`isArc` 弹**在飞行途中不得被直射扫掠命中段处理**——只在抵达落点（`s.dist >= s.totalDist`）时爆炸结算。`stepShells` 的 `if(s.isArc){ ... }` 块**必须每帧以 `return` 短路**（无论是否已到落点），否则未到落点的帧会穿透到下方直射扫掠段（`raycastTank` + `resolveHit`），把途中坦克当直射目标结算（详情与取证见 `DEVELOPMENT-batches-2026-10.md` §4.112 #Y1）。

**`maxRange` 契约**：`maxRange` 对 `isArc` 弹**恒不生效**——所有 `isArc` 弹（`mortar` / `howitzer`）创建时**不设 `maxRange`**（缺省 `undefined`，`s.maxRange > 0` 判定为假），射程由 `totalDist` 单一口径承担。若将来给 `isArc` 弹加 `maxRange`，需先确认不会与落点结算抢跑（`maxRange` 判定位于 `isArc` 块**之前**，会直接 `s.dead = true` 而不走落点爆炸）。

**历史（不静默删除）**：本契约在 2026-10-20 之前**注释承诺了代码没做的事**——块尾注释写「曲射弹在落点结算后直接 return（不进入直射的扫掠命中段）」，但 `return` 只写在 `dist >= totalDist` 的**内层**分支里，`isArc` 块本身缺兜底 `return`。更早的未提交注释为「#W-I 补回（替换时吞掉了原闭合行）」，说明 #W-I 用替换实现该分支时把闭合花括号位置弄错——花括号表面配平但语义反转。该缺陷与「测试链假绿」两环叠加，长期既未被测试抓住、也未被测试链暴露（#Y1）。

## 榴弹炮 = 标准主炮的射击模式（2026-10-22 定案 → **2026-10-23 收严**）

**用户原话（2026-10-22）**：「榴弹炮生效时，只能使用已获得的 he 弹种、标准主炮（循环式火炮）的射击模式（基础精度、装填时间）进行，不能使用弹夹炮、机炮、电磁炮等特殊机制，不能继承主武器的卡升级牌」。

**用户原话（2026-10-23，收严本轮）**：
1. 「曲射榴弹炮又把主武器的机制给带过来了」——指 `shooter.stats` 三处泄漏（伤害/穿深/装填）。
2. 「削弱榴弹炮模式，精度计算改为 4*主炮 base 精度*距离，不再绑定已获得的 he 弹种，只绑定基础 base 的 he 伤害、穿深」。

这条把榴弹炮定位成**标准主炮的一种射击模式**（不是独立武器、不吃别的主炮机制）。**现行口径（2026-10-23）**：

| 维度 | 现行口径 | 实现位置 |
|---|---|---|
| **弹种** | **恒定 `he`**——只绑 `RULES.ammoTypes.he` 的**基础值**，与 loadout **无关**（玩家持有 `blast_he / proximity_he / hesh` 等升级弹种时，曲射数值不变） | `js/tank_fire.js` 的 `const heKey = 'he'` |
| **精度** | **4 × 主炮 base 精度 × 瞄准距离** = `4 × RULES.spread.base`（弧度）× `aimDistW`；**不乘 `player.sigma`**（sigma 含 `aimSpeed / spreadMult / 运动扩圈` 等主武器改装） | `HOWITZER_SPREAD_MULT = 4`，`spSigma = _spreadBase * HOWITZER_SPREAD_MULT` |
| **装填** | **基础装填** `tank.base.reload × 1.0`（主路径）；急速射追发队列整组装填 = `tank.base.reload × hs.reloadMult`。**均不吃主武器 `reloadMult`、也不吃 stats 三层聚合** | `fireTank` 的 `_reloadBase`、`updateHowitzerBurst` 的 `_baseReload2` |
| **伤害/穿深** | **`tank.base.damage` / `tank.base.penetration`** × 基础 he 系数（`dmg 1.5` / `pen 0.5`）；`hs.damageMult` 属榴弹炮自身参数（副武器升级通道），保留 | `firePrimaryShell` 曲射分支的 `_baseDmg` / `_basePen` |
| **特殊机制** | **不参与**：`doubleTapEnabled`（砰砰炮）/ `burstOnSalvo`（弹夹爆发）/ `heat*`（机炮过热）/ `maxRange`（机炮射程）/ `clip*`（弹夹）——曲射分支不读 `primaryWeaponSpec`，天然隔离 | 同上 |

**为什么必须读 `tank.base` 而非 `tank.stats`**：`stats` 是 `base + modifiers` 的三层聚合结果，任何主武器卡/局内升级都会进 `modifiers`。这是本轮「主武器机制泄漏」的**唯一机理**——旧实现三处（伤害/穿深/装填）都读 `stats`，等于把主武器卡全带进来。

**为什么天然隔离**：曲射分支在 `firePrimaryShell` 内**先于**任何 `spec` 读取就 return（只看 `hs` + 基础 he + `shooter.base`）；`fireTank` 的 `double_barrel / clip / 通用单发` 三个 `spec` 分支也都被曲射模式短路（`_isHowitzerMode` 时走通用单发分支但 `_effReloadMult=1`）。

**沿革（不静默删除）**：
- 2026-10-23 改前：弹种按 HE 家族取「已持有的第一个」（把 HE 升级卡带进曲射）；精度取 `max(基准, 实时 σ)`（把主武器精度卡带进曲射）；装填读 `stats.reload`（把主武器装填卡带进曲射）。
- 2026-10-22 改前：曲射用 `shooter.sigma` 与 `spec.reloadMult`，弹种写死 `'he'`。

**同批移除**：落点特效里的「轰击」文字（`dmgText(s.x, s.y - 14, "轰击", "he")` 已删，只保留爆炸视觉，不叠字）。

## 相关页面
- [弹种系统](./ammo-system.md) — HE 弹种数值与溅射半径
- [技能与副武器](./abilities-secondary.md) — F 键语义分派与副武器清单
- [特效与视效](./fx-visual.md) — 曲射弹体的俯仰与阴影绘制
- [武器与装填](./weapons-reload.md) — `WEAPON_DEFAULTS` 与规格通道
