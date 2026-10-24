# 撞击伤害、隐蔽感知与战术闪跃

> **摘要**：物理撞击的动能伤害与硬直、隐蔽值四维模型与敌方感知折扣、战术闪跃（RCS）速度通道、战术烟幕发射器——2026-10-23 新增的四项机制现行口径。
> **适用版本**：现行（2026-10-23）
> **源自**：2026-10-23 新增（无原节号；兼容页新增 §29）
> **相关**：[装甲、跳弹与模块伤害](./armor-ricochet.md) · [敌方 AI](./enemy-ai.md) · [技能与副武器](./abilities-secondary.md)

## 目录
- [撞击伤害（RULES.ramming）](#撞击伤害rulesramming)
- [隐蔽与感知（RULES.camouflage）](#隐蔽与感知rulescamouflage)
- [战术闪跃（RULES.abilities.flash_dash）](#战术闪跃rulesabilitiesflash_dash)
- [战术烟幕发射器（副武器 smoke）](#战术烟幕发射器副武器-smoke)
- [三者的耦合边界](#三者的耦合边界)

## 撞击伤害（RULES.ramming）

**机制**：两车车体 OBB 相交时，`resolveTankCollisions`（`js/tank_entity.js`）先做 MTV 分离，
在分离**之前**按法向闭合速度 `relN` 结算一次撞击伤害。位移积分仍由 `driveTank` 负责，
撞击结算**不得**直接改写 `t.speed`（会连同分离力一起打掉，实测导致残余深叠）。

**数值口径**：唯一来源 `RULES.ramming`（`js/tank_rules.js`）。现行值：

| 键 | 值 | 语义 |
|---|---|---|
| `minVelThreshold` | 90 px/s | 低于此相对速度不产生伤害（防摩擦掉血） |
| `damageScale` | 0.038 | 折合动能 → 伤害的缩放系数 |
| `hpRatioThreshold` | 0.25 | 硬直判定①：伤害 ≥ 目标**生命上限**的 25% |
| `energyRatioThreshold` | 0.15 | 硬直判定②：折合动能 ≥ 目标生命上限的 15% |
| `massAdvantageRatio` | 1.2 | 质量压制阈值（质量比 > 该值 = 压制方） |
| `stiffDurationBase` | 2.0 s | 基础硬直时长 |
| `stiffSpeedMul` | 0.35 | 硬直期速度倍率（**非**完全冻结，转向仍可动） |
| `trackBreakChanceMax` | 0.65 | 极端悬殊撞击的履带断裂概率上限 |
| `contactCooldown` | 0.5 s | 同一对车的结算冷却（防一帧重复扣血） |

**结算公式**（`js/tank_entity.js`）：

```
折合质量 μ = (mA·mB) / (mA+mB)
折合动能 E = 0.5 · μ · relN² · 0.001
受方伤害  = max(1, round(E · damageScale · (对方质量/总质量) · (100/受方装甲)))
```

**硬直判定的双轨条件（2026-10-23 用户裁定）**：必须**同时**满足
`伤害 ≥ 生命上限 × hpRatioThreshold` **且** `动能 ≥ 生命上限 × energyRatioThreshold`。
两项都是**相对生命上限的比例**，**不是绝对点数**——用绝对值得会让后期血量/重量膨胀后
每次碰撞都必然触发硬直。消费方 `js/tank_move.js` 的 `stiffMul()`。

**已知边界**：`trackBreakChanceMax` 目前是**预留键**（无消费方），履带断裂仍走既有
`immobT` 通道；启用前必须先补消费方，否则违反「新 RULES 键必须有消费方」纪律。

## 隐蔽与感知（RULES.camouflage）

**机制**：以「车型吨位 / 移动状态 / 开火状态 / 所处地形」四维折算隐蔽值，
再映射为**敌方有效视距折扣**。纯函数在 `js/tank_cover.js`，
AI 消费点在 `js/tank_ai.js`（首次激活距离）。

**数值口径**：唯一来源 `RULES.camouflage`（`js/tank_rules.js`）。现行值：

| 键 | 值 | 语义 |
|---|---|---|
| `baseCamo` | light 0.7 / medium 0.5 / heavy 0.3 | 吨位基准（越轻越易藏） |
| `motionMultiplier` | idle 1.2 / move 0.7 / sprint 0.4 | 移动状态乘数 |
| `firingPenaltyDuration` | 3.0 s | 开火惩罚窗口 |
| `firingPenaltyMultiplier` | 0.1 | 开火瞬间隐蔽乘数（暴跌至 10%） |
| `bushBonus` | 0.40 | 灌木/树林加成**上限**（2026-10-24 #P1 起按覆盖深度折算：中心满额、边缘半额） |
| `smokeBonus` | 0.70 | 烟雾云加成（全遮，不随深度折算） |
| `aiSpotBaseDist` | 650 px | 敌方基础视距（**实测零消费方**，见下方「实现边界」） |
| `symmetric` | `false` | 隐蔽对称化开关（2026-10-24 新增：**默认关，保留接入能力**） |

**隐蔽值**（`camouflageValue`）：

```
camo = baseCamo[吨位] × motionMultiplier[运动] × firingMul + terrainBonus
```

- `terrainBonus` 取 **max(灌木, 烟幕)**，**不叠加**——叠加会让树+烟堆到 1.1，坦克彻底隐身、失去对抗性。
- `firingMul` 读实体字段 `lastFireAt`（`js/tank_fire.js` 在**主炮开火成功后**写入时间戳），
  窗口内返回 `firingPenaltyMultiplier`。只写时间戳，判定全在纯函数里。

**敌方有效视距**（`camouflageDistanceMultiplier`）：

```
mul = clamp(1 / (1 + camo), 0.3, 1)
```

下限 **0.3** 是刻意保留的：完全不可见会让 AI 无任何反应，玩家失去「被搜索/被压制」的博弈感。

**AI 接入口径（`js/tank_ai.js`）**：
- **首次激活距离** = `aiTriggerDist`（或 `triggerDistBase`）× `camouflageDistanceMultiplier(玩家)`。
- **脱离距离不吃折扣**（仍用未折扣的 `exitD`）——否则玩家在原地点火/熄火就能反复脱离-重进，造成抖动。
- **Boss 与玩家 Boss 不参与**（Boss 视为独立观瞄，不读玩家隐蔽值）。

**实现边界（2026-10-24 #P1 落地后更新）**：

| 项 | 现状 | 影响 |
|---|---|---|
| 隐蔽值**只对玩家**取值 | **仍不对称**（`RULES.camouflage.symmetric=false`），但 `tank_ai.js` 已埋 `_enemyCamoMul` 接入点 | 偷袭仍单向；开启前须补玩家侧「被点亮」反馈与平衡标定 |
| 遮蔽**按高度分档**（**已修**） | `hasLineOfSight` 读 `RULES.coverTiers[*].height`：`≥min(eyeZ,targetZ)` 才挡；`vision:false` 永不参与 | 灌木(1.2m) 挡车体不挡炮塔 ⇒ hull-down 成立；树(6m)/建筑(8m) 全挡 |
| 地形加成**按覆盖深度折算**（**已修**） | `camouflageTerrainBonus` = `bushBonus × (0.5+0.5×depth)`，仍不看朝向 | 贴灌木边缘只拿半额；「敌人正面直视仍给加成」尚未解决（需视线方向，属后续） |
| `aiSpotBaseDist` 是**死配置** | 仍未处理（零消费方） | 应删除或接上消费方（另案） |
| 开火惩罚改读**模拟时钟**（**已修**） | `camouflageFiringMul` 与 `tank_fire` 写入的 `lastFireAt` 同读 `simNow()` | 窗口判定可复现（`test-vision-stealth-p1.js` 锁定） |
| `alertLevel === 2` 从未写入 | 仍未处理（只有 0/1/3 三态） | 注释声明五层级但实现缺一级（另案） |

> 三个结构性问题与伪 3D 路线的关系见 [视野-隐蔽与伪 3D 兼容性](../map/vision-stealth-3d-compat.md)；
> **P1 落地细则（I0/I1/I2、高度表、C 方案）见该页 §9**。

## 战术闪跃（RULES.abilities.flash_dash）

**机制**：激活后在短时间内大幅提升极速与加速度（Tesla RCS 风格短促突进），
结束后进入过热减速期。激活**只写状态位**，位移仍由 `driveTank` 逐帧积分
（绕过碰撞/边界钳制会造成穿墙）。

**数值口径**：唯一来源 `RULES.abilities.flash_dash`。现行值：

| 键 | 值 | 语义 |
|---|---|---|
| `duration` | 1.2 s | 闪跃持续 |
| `speedMult` | 2.5 | 闪跃期极速/加速度倍率 |
| `cooldown` | 8.0 s | 独立冷却（`t.abilityCds.flash_dash`） |
| `overheatDuration` | 2.0 s | 过热持续 |
| `overheatSlowMul` | 0.7 | 过热期速度倍率 |

**实现契约**：
- 能力键 `flash_dash` 必须在**三处**同时存在，否则是死键：
  ① `js/tank_abilities.js` 的 `ABILITY_KEYS_RUNTIME` 与 `ABILITY_LABELS` 与 dispatch 分支；
  ② `js/tank_cards.js` 的 `ABILITY_KEYS`（卡牌白名单）；
  ③ `RULES.abilities.flash_dash`（配置）。配套卡牌 `cards/ability_flash_dash.json`。
- `t.flashDashT` / `t.flashOverheatT` 两个计时器**只在 `driveTank` 里递减**（单一消费点）。
- 速度通道是**独立乘子**（`flashDashMul`），与 `fireMul` 同级链尾；**不可并入 `speedModifier`**
  ——公路判定会把 `speedModifier` 归 1，闪跃会被静默清零（同 howitzerMul 的历史教训）。

## 战术烟幕发射器（副武器 `smoke`）

**机制**：`weapons.secondary.type === 'smoke'` 时，按 F 在炮口前方抛射 `cloudCount` 团烟雾，
沿**垂直于射击方向**均分展开形成烟墙（不是单点一团）。落地到 `js/tank_weapons.js` 的
`fireActiveSecondary` 的 `case 'smoke'` 分支。

**参数分工（唯一口径）**：

| 归属 | 管什么 |
|---|---|
| `WEAPON_DEFAULTS.secondary.smoke` | **发射几何**：`reload 14` / `range 260` / `cloudCount 3` / `spreadPx 70` / `duration 5` |
| `RULES.smoke` | **单团烟雾**：`radius 120` / `duration 5` / `maxClouds 8`（由 `spawnSmokeCloud` 内部消费） |

**两条独立通道**（不可混为一谈）：
1. **视线遮断** —— `smokeBlocksLoS(ox,oy,tx,ty)`，被 `hasLineOfSight` 调用；AI 与弹道判定都经此。
2. **隐蔽加成** —— `camouflageTerrainBonus` 读 `smokeClouds` 数组，`smokeBonus 0.70`。

**配套卡牌**：`cards/weapon_secondary_smoke.json`（安装，rare）、
`weapon_secondary_smoke_upgrade.json`（密度，epic）、`weapon_secondary_smoke_rapid.json`（速射，rare）。

**平衡审计口径**：`smoke` 是**纯功能性**副武器（单发 0 伤害），已登记进
`scripts/test-weapon-upgrade-balance.js` 的 `MECHANICAL_TYPES`——不计 DPS，只校验
`statOverrides` 相对基础规格确有变化。

## 三者的耦合边界

1. **撞击伤害 × 闪跃**：闪跃只改速度倍率，不改质量/装甲，因此**不**降低撞击伤害；高速撞车依然吃满动能结算。
2. **隐蔽 × 撞击**：撞击**不写** `lastFireAt`（不是开火），不会触发开火隐蔽惩罚；但两车接触本身会因位移被 AI 观察到（走既有接战逻辑）。
3. **隐蔽 × 烟雾**：烟雾云由 `js/tank_cover.js` 的 `smokeClouds` 承载，`camouflageTerrainBonus` 直接读该数组；
   烟雾的**视线遮断**（`smokeBlocksLoS`）与**隐蔽加成**是两条独立通道，互不替代。

## 相关页面

- [装甲、跳弹与模块伤害](./armor-ricochet.md) —— 撞击伤害与弹道伤害共用装甲折减口径，是伤害侧的总入口。
- [敌方 AI](./enemy-ai.md) —— 隐蔽折扣接入的是 AI 的首次激活距离门控，需与滞回、反应延迟一并理解。
- [技能与副武器](./abilities-secondary.md) —— `flash_dash` 与既有 5 个运行时技能共用独立冷却池与技能槽指派。
