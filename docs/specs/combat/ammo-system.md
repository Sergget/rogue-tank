# 弹种系统

> **摘要**：弹种升级链、14 个弹种的数值总表（本卷唯一数值口径）、HE 溅射与击退、平衡回归基线。
> **适用版本**：现行（2026-10-21）
> **源自**：`docs/specs/combat.md` §3、§3.1、§3.2、§3.3、§8.4、§5.1（弹种软上限段）（2026-10-21 拆分）
> **相关**：[装甲、跳弹与模块伤害](./armor-ricochet.md) · [曲射火力](./arc-fire.md) · [武器与装填](./weapons-reload.md)

## 目录
- [弹种升级链](#弹种升级链)
- [数值总表](#数值总表)
- [HE 机制与击退](#he-机制与击退)
- [平衡回归](#平衡回归)

## 弹种升级链

（原 §3.1；本节同时承载 §3 开头的系统定位与 §5.1 的弹种软上限）

唯一数据源：`RULES.ammoTypes`（`js/tank_rules.js`，机制参数唯一配置源）。逐弹种数值（穿深/伤害/弹速/弹药架与模块倍率/跳弹角/精度系数/未击穿）**以 [数值总表](#数值总表) 为唯一口径**，本节不再重复罗列。

> 链内为**升级替换**：升级卡把 loadout 槽内直系前驱弹种原地替换；**禁止跳级**（前驱未持有则不变）。HE 线不再 he 处多向分岔，而是 he 作为分支点形成两条线性链——首张 heat 或 aphe 卡「先新增」（保留 he，占第 3 槽，槽位 <3）；其后同分支/他分支再抽则「替换 he 槽」——heat 与 aphe 得以并存；KE 链与 HEAT 链各为一条线性替换链。（2026-09-13 定案 + 2026-09-15 用户修订；曲射/越障由武器层承担。）

| 链 | 序列 |
|---|---|
| KE 穿甲链 | ap → apcr → apds → apfsds → apfsds_ad |
| HEAT 破甲链 | he → heat → heatfs → tandem_heat → heavy_tandem_heat |
| HE 榴弹链 | he → aphe → hesh → proximity_he → blast_he |

- `RULES.ammoChain`（key→前驱）为升级替换唯一链源（`js/tank_rules.js`）；`computeAmmoConfig` add pass 按 base 倍率换算（+10mm × apds 1.4 = +14mm）。
- **升级替换的触发口径（#U40，2026-10-19）**：仅**升级效果**触发链替换——显式 `replaceAmmo`，或无 `field` 的旧式演变效果按 `CHAIN[key]` 推断；带 `field` 的弹种**调校效果**（`demo_apcr_round`「APCR 穿深 +20%」等）是纯数值卡，**绝不替换 loadout 弹种**（旧口径曾让调校卡把 AP 槽隐形改名）。细则归口 `specs/cards.md` §3「调校效果与升级效果的严格分界」。
- **2026-09-14 定案：HEC 弹种移除**——`RULES.ammoTypes` 现 14 键（ap/apcr/apds/apfsds/apfsds_ad/he/heat/heatfs/tandem_heat/heavy_tandem_heat/aphe/hesh/proximity_he/blast_he）。**曲射/越障通道（现行口径）**：① 副武器迫击炮 `mortar`（`isArc` + `ignoreCover`）；② **榴弹炮曲射模式 `howitzer`（2026-10-20 #W-I 回归，副武器语义）**——装进副武器槽后**主炮**切曲射，详见 [曲射火力](./arc-fire.md)。~~「2026-09-15 主武器曲射机制移除」~~：该裁定只针对当时的 howitzer **主武器类型**（已删除），不约束 2026-10-20 以**副武器模式**形式回归的曲射机制（沿革见 `DEVELOPMENT-batches-2026-10.md` §4.109 更正段）。
- **命名规范**：升级演进弹种（APDS、APFSDS、HEAT-FS、T-HEAT、HT-HEAT、APHE、HESH、HE-VT、HE-OP 等）全面继承 `RULES.ammoTypes` 对应数值矩阵，全部使用规范军事缩写。
- **卡牌通道运行时硬限（W5，本卷唯一口径）**：卡牌 modifiers 聚合后必须落在 `RULES.parameterLimits` 的边界内——**装填取下限 `reload.min`、极速取上限 `maxSpeed.max`**（具体秒数 / km/h 数值只写在 `js/tank_rules.js`，本卷不再复述）；`aimSpeed` / `trackLock` / 暴击类聚合边界 2026-10-19 #U40 起同样**无条件**钳制（无「仅部分通道」例外）。逐键上下限一律以 `RULES.parameterLimits` 为唯一数值口径（`reload` / `maxSpeed` / `aimSpeed` / `spreadMult` / `motionSpreadMul` / `armor.*` 等），[装甲页的局内商店达限判定](./armor-ricochet.md#局内商店达限判定)与卡牌侧 `specs/cards.md` §3 的满级过滤都读同一份表。
- **弹种独立隔离与软上限（原 §5.1）**：卡牌 `type:'ammo'` 效果经 `computeAmmoConfig` 严格按弹种隔离（不触碰其他弹种）；为抑制 HE 滚雪球过快，HE 专属卡牌幅度大幅下调（common 1.06–1.08 / rare 1.12 / epic 1.14–1.15 / legendary 1.20；common 叠层上限降至 2），且 `computeAmmoConfig` 对 HE 施加 `RULES.ammoTypeCap` 软上限（dmg:2.5, pen:1.8, speed:2.0；AP/APCR/HEAT 不受此限制）；战斗 HUD 增加实时 `#ammoReadout` 显示当前弹种最终加成。

## 数值总表

（原 §3.2，用户 2026-09-13 权威表，已落地 `RULES.ammoTypes` per-ammo 字段）

> **本表是本卷弹种数值的唯一口径。** 穿深/伤害/弹速为相对基准的倍率；跳弹角与溅射半径亦只在此处出现，其余各页一律指向本表。

| 弹种（key） | 穿深 | 伤害 | 弹速 | 弹药架倍率 | 成员模块倍率 | 模块抽取 | 跳弹角 | 精度系数 | 未击穿 |
|---|---|---|---|---|---|---|---|---|---|
| ap | 1.0 | 1.0 | 1.0 | 2 | 1.5 | 1 | 70 | 1.0 | 0 |
| apcr | 1.2 | 1.0 | 1.2 | 2 | 1.5 | 1 | 65 | 1.0 | 0 |
| apds | 1.4 | 1.2 | 1.4 | 2 | 2 | 2 | 75 | 0.9 | 0 |
| apfsds | 1.8 | 1.2 | 1.8 | 2.5 | 2 | 2 | 85 | 0.8 | 0 |
| apfsds-ad | 2.0 | 1.4 | 1.8 | 2.5 | 2 | 2 | 87 | 0.7 | 0 |
| he | 0.5 | 1.5 | 0.8 | 3 | 2 | 3 | 90 | 1.2 | dmg×(effPen/eff)×0.6 |
| heat | 1.5 | 1.0 | 0.9 | 2 | 1.5 | 1 | 87 | 1.2 | 0 |
| heatfs | 1.75 | 1.0 | 1.2 | 2 | 1.5 | 1 | 87 | 1.1 | 0 |
| T-HEAT（tandem_heat） | 2.0 | 1.2 | 1.2 | 2 | 1.5 | 2 | 87 | 1.05 | 0 |
| HT-HEAT（heavy_tandem_heat） | 2.0 | 1.4 | 1.2 | 2.5 | 2 | 2 | 87 | 1.1 | 0 |
| aphe | 1.1 | 1.2 | 1.0 | 2 | 1.5 | 2 | 70 | 1.1 | 0 |
| hesh | 0.7 | 1.5 | 0.8 | 2 | 1.8 | 2 | 90 | 1.1 | ×0.8 |
| HE-VT（proximity_he） | 0.9 | 1.5 | 0.9 | 2.5 | 2 | 2 | 90 | 1.1 | ×0.8，接近率引信 |
| HE-OP（blast_he） | 0.8 | 1.8 | 0.9 | 3 | 2 | 3 | 90 | 1.1 | ×0.8 |

- 未击穿公式：`dmg × (1−(eff−pen)/eff) × 系数` = `dmg × (effPen/eff) × nonPenRatio`，地板 0.25；KE 家族（0）无残余。
- **跳弹角 per-ammo（`ammoBounceAngle`，°）**：θ>该值跳弹；90° = 不可能跳弹；noBounce 弹种（heat 系/HE 系）完全不跳弹。**注意（2026-09-23 核实）**：`RULES.ammoTypes` 对 `noBounce: true` 的 8 个弹种（he / heat / heatfs / tandem_heat / heavy_tandem_heat / hesh / proximity_he / blast_he）**不写 `bounceAngle` 字段**，本表 90° 为「不可能跳弹」的语义表达，权威判据是 `noBounce` 标记本身。[装甲页](./armor-ricochet.md#跳弹判定)只讲判定流程，角度数值一律回到本表。
- **溅射半径与击退系数**（`splashRadius` / `splashKnockbackMul`，仅 HE 家族有该字段；击退公式见 [HE 机制与击退](#he-机制与击退)）：

  | 弹种 | `splashRadius` | `splashKnockbackMul` |
  |---|---|---|
  | `he` | 90 | 0.55 |
  | `hesh` | 100 | 0.7 |
  | `proximity_he` | 90 | 0.6 |
  | `blast_he` | 110 | 0.95 |

  其余弹种（AP/APCR/HEAT 系）无该字段 → 零溅射、零击退。
- 近炸引信（proximity_he，用户定案=**接近率基准**）：弹道不命中目标时，对最近敌目标计算径向接近率；**接近率由正转负（开始远离）瞬间空爆**，按 splashRadius 溅射。已落地 `stepShells`（`RULES.proximityFuze`：maxTravel 1400 / armRadius 武装半径 120px / 最小起爆距离 40px）。**#A27 修复（2026-09-15）**：近炸分支须先执行飞行推进（`s.x/s.y/s.dist+=step` + 射程/出界死亡判定）再判引信——此前近炸分支从不推进弹体，导致 HE-VT 原地静止不飞。

## HE 机制与击退

### HE 机制细节

（原 §3，总表之外的行为差异，唯一需单列的弹种）

击穿与未击穿均触发范围溅射（半径取 [数值总表](#数值总表) 的 `splashRadius`，贴脸 50% → 边缘衰减到 0）；未击穿走残余爆轰分支（地板 25%，公式见 [数值总表](#数值总表)）。HE 破障（A3）：HE 弹销毁时对落点半径内可破坏掩体造成 **1 点**独立破坏伤（半径 `RULES.breach.heSplashRadius` = 24px，与坦克溅射两套并存）——**对单个元素恒 1 点，无"伤害倍率"概念**：`RULES.breach` 现仅含 `heSplashRadius` 一个键，~~`RULES.breach.heCoverDmg`~~ 因零消费已于 2026-10-20 #W15 删除（详见 `specs/map.md` §27.6 死配置清单）。特效对齐约定：爆轰视觉特效半径与逻辑 splashRadius 严格一致，杜绝视觉误导。

### 击退公式

（原 §8.4，2026-09-20 #E10）

击退与爆炸范围绑定：**击退距离 = `splashRadius` × `splashKnockbackMul` × (1 − dist/radius)**（线性衰减），由 `tank_physics.applySplashKnockback` 施加（`applySplashAt` 内统一调用，坦克/Boss/召唤物一视同仁），世界边界经 `setSplashWorldBounds` 钳制（mvp 进节点注入节点尺寸）。

- **逐弹种 `splashRadius` / `splashKnockbackMul` 与满命中击退量见 [数值总表](#数值总表)「溅射半径与击退系数」（唯一数值口径），本节不重复罗列。**
- 其余弹种（AP/APCR/HEAT 系）无该字段 → 零溅射、零击退（行为不变）。**HE-OP 击退 > HE-VT 击退**为用户明确要求（两者 `splashKnockbackMul` 见 [数值总表](#数值总表)）。

## 平衡回归

（原 §3.3，`scripts/test-ammo-balance.js`，接入 npm test）

真实 `resolveHit` 蒙特卡洛（全弹种 × 4 装甲级 × 3 入射角 × 3 目标速度 × 400 发，基准炮 pen120/dmg100/reload3s），同档弹种集合内中位数偏差 >25% 警告、「完全无效」单独报告。

首轮平衡结论（2026-09-13）已按用户裁定全部落地：APHE pen 0.9→1.1（中型档可击穿）、HEAT-FS pen 1.5→1.75（与 heat 拉开 +16% 步幅）、HESH/HE 家族重型档偏弱与链条顶端无效经第二批补测裁定**维持**（距离本身就是平衡维；超重档打不穿为设计预期「不怕打不穿，卡牌升穿深」）。历史裁定过程见 `docs/archive/2026-09.md`。

## 相关页面
- [装甲、跳弹与模块伤害](./armor-ricochet.md) — 这些倍率怎么被消费
- [曲射火力](./arc-fire.md) — 榴弹炮模式与 isArc 契约
- [武器与装填](./weapons-reload.md) — 主炮类型与 `statOverrides`
- [卡牌规范](../cards.md) — 弹种卡与升级卡
