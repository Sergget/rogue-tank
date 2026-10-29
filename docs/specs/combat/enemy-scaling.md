# 敌人强度与难度

> **摘要**：敌人从哪个基准长出来、乘哪些倍率、封顶键卡在哪里——改难度只改这一页。
> **适用版本**：现行（2026-10-22）
> **源自**：`docs/specs/combat.md` §13.1、§13.4、§5（难度分化段）（2026-10-21 拆分）
> **相关**：[敌方 AI](./enemy-ai.md) · [Boss 规范](../boss.md) · [地图规范](../map.md)

## 目录
- [固定基准](#固定基准)
- [封顶键](#封顶键)
- [难度乘子](#难度乘子)
- [实测对照](#实测对照)

## 固定基准

（原 §13.1，2026-09-30 #H1）

**用户裁定**：「敌人难度不应随**局外商店升级**变化，只应随节点推进变化」。

- **问题定位（实测）**：难度曲线本身与商店无关——`difficultyForIndex(index, difficultyLevel)` 只吃节点索引与跨局等级，且 `difficultyLevel` 每次新局强制归零。真正的放大来自**两条以玩家为锚的链路**：
  1. `applyEnemyAppearanceAndStats`（`js/tank_model.js`）把敌军 `base.{maxHp,penetration,damage,reload,maxSpeed,turnRate,turretTurnRate}` 与 `armor.*` 全部写成 `玩家 anchorStats × RULES.enemyClassProfiles[class]`；锚点快照在 `applyUpgrades()` **之后**冻结，故局外永久升级直接乘进全部敌军基准。
  2. `difficultyCapMuls` 的穿深封顶 / 伤害地板与天花板 / 速度目标全部乘 `player.stats`。
  ⇒ 商店每买一级，下一局全部敌军同比例抬升，玩家成长收益被难度同步抵消。实测：五项永久升级买满后，同一节点敌军穿深 149.96→173.60、伤害 35→45.50、血量 64.29→104.47，而 `node.difficulty` 与节点难度序列完全不变。
- **现行口径**：
  - 新增 **`RULES.enemyAnchorBase`**（与玩家无关的固定基准，取中位中坦量级）：`maxHp 100 / penetration 120 / damage 34 / reload 1.3 / maxSpeed 120 / turnRate 2.0 / turretTurnRate 2.2 / shellSpeed 1200 / weight 50 / enginePower 700 / armor{hull,turret}{front 100, side 40, rear 25}`。
  - 敌军数值 = `enemyAnchorBase` × `enemyClassProfiles[class]` × `entityMults(diff)` × `difficultyCapMuls`（改按固定基准）。**玩家选车、局内卡牌、局外永久升级一律不影响敌军强度**；敌军强度只由节点难度 `diff` 决定。
  - 四个封顶键**改按固定基准**并改名：`penCapVsBaseline`(1.2) / `dmgFloorVsBaseline`(0.4) / `speedVsBaseline{baseFloor 0.3, baseCeil **0.5**, randMin .85, randMax 1.15}`；`dmgCapAmmoMult`(0.7) 保留，参照终伤缺省由新键 **`strongestAnchorMult`(2.33)** × 基准伤害推算（**不再退化为 `Infinity` = 无上限**）。**本页是这四个封顶键的唯一数值口径**（2026-10-21 按 `RULES.difficulty` 逐键核对）。（沿革：`speedVsBaseline.baseCeil` 2026-10-01 由 0.6 下调至 **0.5**，裁定见 [难度乘子](#难度乘子)。）
  - **废弃**：`applyEnemyAppearanceAndStats` 第三参 `anchorStats`（保留形参仅为兼容旧调用方，**函数内忽略**）、`applyDifficultyMults` 的 `strongest` 传参、battle 的 `playerAnchorStats` 及其 3 处赋值、bench/测试中的 `anchorStats: player.stats`。
- **沿革**：原 P-46「玩家基准锚定制」设计意图（保证节点 1 与玩家出厂配置匹配）已被本条取代——同一节点对所有玩家难度一致优先于该匹配。
- **回归**：`scripts/test-modifiers.js` #H1 段——`enemyAnchorBase` 已定义、**强弱玩家下 `penMul`/`speedMul` 逐值相同**、传玩家基准不改变敌军 `base`、缺 `strongest` 时天花板有确定值。

## 封顶键

（原 §13.1 合并说明）

敌军数值在乘完 `entityMults` 之后还要过一次封顶，四个键各管一段：

| 键 | 现行值 | 管什么 |
|---|---|---|
| `penCapVsBaseline` | 1.2 | 穿深上限 = `enemyAnchorBase.penetration × 1.2` |
| `dmgFloorVsBaseline` | 0.4 | 伤害地板 |
| `speedVsBaseline` | `{baseFloor 0.3, baseCeil 0.5, randMin 0.85, randMax 1.15}` | 极速上限/地板与每车随机 |
| `dmgCapAmmoMult` | 0.7 | 伤害天花板（× 参照终伤） |
| `strongestAnchorMult` | 2.33 | 参照终伤缺省推算（不再是 `Infinity`） |

- 这些值的**唯一来源**是 `RULES.difficulty`（2026-10-21 核对）；本表与 `js/tank_rules.js` 冲突时以代码为准并回改本表。
- 普通敌军的极速最终由 `speedVsBaseline` 覆盖（`difficultyCapMuls` 与「直写 stats」逐值等价）；Boss 走 `applyDifficultyMults(..., applyPlayerCap=false)` **跳过封顶**。

## 难度乘子

（原 §13.4，2026-10-01 用户裁定，现行口径）

**用户裁定（三条）**：① **降低速度上限倍率**；② **提高敌人（包括 Boss）血量**；③ **略微提高敌人升级速度**（敌人随节点推进变强更快 ⇒ 难度曲线现行口径见 `specs/map.md` §16）。

- **现行值（`RULES.difficulty`，2026-10-29 按 §4.178 #AC1 二次审计后核对）**——**本页是 `entityMults` 的唯一数值口径**，AI 页与固定基准节只讲机制、不再罗列区间：
  - `entityMults.maxHp` **[0.6, 1.5]**（沿革 `[0.45, 1.4]` → `[0.5, 1.7]`（2026-10-01）→ `[0.6, 2.2]`（2026-10-15 #6）→ `[0.6, 1.8]`（2026-10-27 §4.144）→ **`[0.6, 1.5]`**（2026-10-29 §4.178 #AC1：复合威胁 3.0× vs 玩家 1.5×，后段塌陷，末节点均值 0.81）；
  - `entityMults.penetration` **[0.8, 1.5]**（沿革 `[0.75, 1.25]`；2026-10-15 #6）；
  - `entityMults.damage` **[0.8, 1.2]**（沿革 `[0.75, 1.2]` → `[0.8, 1.5]`（#6）→ `[0.8, 1.35]`（§4.144）→ **`[0.8, 1.2]`**（2026-10-29 §4.178 #AC1）；
  - `entityMults.armorAll` **[0.6, 1.15]**（沿革 `[0.6, 1.3]` → 现值，2026-10-29 §4.178 #AC1）；
  - `entityMults.reload` **[1.25, 0.88]**（低难度 ×1.25 慢装填 → 高难度 ×0.88 快装填；沿革高难度端 `[1.25, 0.82]` → 现值，2026-10-29 §4.178 #AC1；区间端序随难度递增而递减，非笔误）；
  - `entityMults.spreadMult` **[1.3, 0.78]**（同上，端序递减）；
  - `entityMults.aimSpeed` **[0.8, 1.35]**；
  - `entityMults.maxSpeed` **[0.7, 1.0]**（沿革 `[0.7, 1.15]`；满难度极速上限倍率 −13%）；
  - `entityMults.turnRate` **[0.7, 1.2]**；
  - `entityMults.turretTurnRate` **[0.7, 1.25]**；
  - `speedVsBaseline.baseCeil` **0.5**：数值与其余封顶键**唯一口径见 [封顶键](#封顶键)**，本段只记裁定时点与效果（沿革 0.6 → 0.5，2026-10-01）——**低难度敌军速度不变、难度曲线更平缓**。
- **生效范围（重要）**：普通敌军的极速最终由 `speedVsBaseline` 封顶公式覆盖（`difficultyCapMuls` 与「直写 stats」逐值等价）⇒ `entityMults.maxSpeed` 上限下调**主要作用于 Boss 与其它未封顶路径**（Boss 经 `applyDifficultyMults(..., applyPlayerCap=false)` 跳过封顶）；血量无封顶键，故两端（普通敌人 + Boss）同时受益。
- **#6（2026-10-15）穿深封顶由「单局不生效」转为「中段即生效」（重要副作用）**：`penCapVsBaseline 1.2` 未随 `entityMults.penetration` 上调而调整 ⇒ 触顶阈下移。旧档位触顶需 `diff ≥ 1.035`，**高于单局 `curveCap 0.95`**，故单局内敌军穿深**永不触顶**（仅跨局等级 ≥3 级才可能触及，`diffMax 1.15` 内）；新档位触顶阈降至 `diff ≈ 0.657`（≈ **index 8**），即 **index 8 起敌军穿深锁定 `enemyAnchorBase.penetration(120) × 1.2 = 144mm` 不再成长**（index 0→7 仍线性 107 → 141mm）。伤害天花板仍未触顶（最难档 medium 未封顶值 51.0 < `cap 55.45`；仅 heavy/spg 兵种触及）。
- **Boss 血量**：归口 `specs/boss.md` §5（`tuning.hpMul` 的现行值与沿革均以该节表为准；Boss 血量 = 出战配置 maxHp × hpMul × `entityMults.maxHp(diff)`，两级叠加——`entityMults.maxHp` 见本页上方列表）。

### 成长曲线审计与再平衡（2026-10-27 §4.144，`scripts/audit-growth-curve.js`）

**方法**（不用「属性对属性」对比，理由见脚本头注）：玩家侧跑 5 条真实可达的**商店购买轨迹**（按实际收入消费、价格走 `runShopPriceFor`），敌人侧走真实四层叠加，双向 TTK 走 `resolveHit` 蒙特卡洛（击穿/跳弹/模块/未击穿残余全算）。主指标 = **优势度 = 敌人TTK玩家 / 玩家TTK敌人**（>1 玩家占优），理想形态「缓降且始终 >1、末节点逼近 1」。

**调整前后（末节点 index 12 / diff 0.95，0° 正面对射）**：

| build | 调整前 | 调整后 |
|---|---|---|
| balanced（均衡） | 0.73 | **1.13** |
| greedy（不规划，买最便宜） | 0.58 | 0.85 |
| firepower（纯火力） | 0.46 | 0.79 |
| armor（纯防护） | 0.45 | 0.75 |
| mobility（纯机动） | 0.47 | 0.55 |

**三处调整**：
1. `entityMults.maxHp` `[0.6,2.2]` → **`[0.6,1.8]`**（敌人 HP 成长 2.37× → 1.93×，与玩家 DPS ~1.5× 收敛）；
2. `entityMults.damage` `[0.8,1.5]` → **`[0.8,1.35]`**（敌人 DPS 合计 2.10× → 1.85×）；
3. 局内商店玩家 DPS 通道：`penetration_up` +6→**+8**/级、`damage_up` +4→**+5**/级、`costGrowth` 1.7→**1.6**、`fast_reload` 1.6→**1.5**（提**单级回报**而非猛降价格，保住「资源紧张」体感）。

### 二轮审计与再平衡（2026-10-29 §4.178，#AC1）

§4.144 之后 MS1 的 B2/B3 改变了交战结构（绕障 + 接战带 338px），重跑审计暴露**后段塌陷仍在**：节点 9+ 五类 build 四类优势度 <1（mobility 0.50、末节点均值 0.81）。根因量化：敌人复合威胁指数（`maxHp × damage / reload`）0.98 → **2.96**（3.0×）vs 玩家局内 ~1.5×。

**裁定（用户）**：审计是 1v1（标准模式 2 辆友军未建模），**不为此修审计口径**——友军留二期审计参数、友军选车留 `PLAN §4.1b` 远期；直接**降低后续节点的敌军曲线**。

**四处收口（高难度端，低难度端零动 ⇒ 前期零漂移）**：`maxHp` 1.8→**1.5**、`damage` 1.35→**1.2**、`reload` 0.82→**0.88**、`armorAll` 1.3→**1.15**。威胁指数封顶 ~1.75×、生存指数 ~1.59×。

**调整后（末 4 节点均值）**：firepower 0.82→**1.12**、armor 0.81→**1.09**、greedy 0.89→**1.21**、balanced 1.20→**1.64**、**末节点均值 0.82→1.13**。mobility 0.72 仍 <1——属「审计低估机动流」的可接受区间（见下方判读边界），不再追调。

**判读边界（重要，勿误用）**：
- 本表是**绝对下限玩家**（零卡牌 / 零技能 / 零永久升级 / 零走位），真实玩家会显著高于此。
- **纯路线 0.55~0.79 是可接受的取舍代价**（商店自选，玩家会补短板），不是平衡缺陷；但若玩家真的零补短卡死，属于 roguelike 的正常失败。
- **mobility 读数被系统性低估**：固定距离/角度抹掉了「绕侧、拉开距离、躲掩体」的价值；评估机动流须配合实机测试。
- 三处调整后 `greedy`（不规划的玩家）0.85，说明**不规划但也不极端**仍可通关——这是设计的底线。

### 三层审计结论（2026-10-26 §4.143，`scripts/test-enemy-scaling-audit.js`）

用户质疑「全属性乘数可能不能使用同一个参数」，遂对四层链路做逐键审计（方法：单键乘子 ×2 看终值变化 + 难度四档快照 + Boss/普通对比）。结论：

| 键 | 对普通敌人 | 对 Boss | 判定 |
|---|---|---|---|
| `maxHp` | 生效 | 生效 | 正常 |
| `armorAll` | 生效 | 生效 | 正常 |
| `reload` / `spreadMult` / `aimSpeed` | 生效 | 生效 | 正常 |
| `turnRate` / `turretTurnRate` | 生效 | 生效 | 正常 |
| `penetration` | **高难度端名义值**（满难度名义 165.4 → 实际 144，被 penCap 压） | 生效（165.4） | **已知副作用**（#6 已记录），非 bug |
| `damage` | 生效（地板当前未触发） | 生效 | 正常 |
| `maxSpeed` | **无效**（被 `speedVsBaseline` 直算覆盖） | 生效 | **仅 Boss 通道**，非死键（见上方「生效范围」） |

- **难度成长主维度 = 血量**：实测低→高难度 HP **2.38×**、装甲 1.70×、极速 1.67×、伤害 1.55×、装填 0.75×（变快）、穿深 1.35×（且 diff≥0.7 后恒定 144）、缩圈 1.44×。2026-10-26 用户裁定**维持现状**——后期压力应来自走位与技能运用，不把血量成长重新分配到其它维度。
- **审计同时揪出一个真 bug**：`ammoStatNeutral`（敌方弹种不放大穿深/伤害）只写不消费，导致后期 Lv13 敌军实际穿深达 288mm。修复与回归见 `DEVELOPMENT.md` §4.143。

## 实测对照

（原 §13.4 的两张探针表，2026-10-01 与 2026-10-15 实测）

**2026-10-01 探针（`enemyAnchorBase.maxSpeed = 120`、`randFactor = 1`）**：

| 节点 index | diff（旧→新） | 普通敌人血量倍率（旧→新） | 普通敌人极速 px/s（旧→新） | Boss 血量倍率（旧→新） |
|---|---|---|---|---|
| 0 | 0.15 → 0.15 | 0.574 → 0.657（**+14.5%**） | 36.0 → 36.0（不变） | 4.59 → 5.91（**+28.8%**） |
| 4 | 0.35 → 0.36 | 0.739 → 0.876（**+18.5%**） | 45.0 → 42.3（−6.0%） | 5.91 → 7.88（**+33.4%**） |
| 8 | 0.63 → 0.64 | 0.970 → 1.168（**+20.4%**） | 57.6 → 50.7（−12.0%） | 7.76 → 10.51（**+35.5%**） |

含每辆 `randFactor` 上限（1.15）时的极速上限：**82.8 → 69.0 px/s**（高难度）。上表为 **2026-10-01 档位的历史探针**，未被 #6 取代的部分（极速封顶链）仍有效；血量/穿深当前值见下表。

**2026-10-15 复算（#6 后；`entityMults` 新档 + `curvePow 1.0`）**：

| 节点 index | diff | `entityMults.maxHp` | 普通敌人血量 = 100 × 倍率 | 敌军穿深未封顶 → 封顶后 |
|---|---|---|---|---|
| 0 | 0.15 | 0.809 | 80.9 | 107.0 → 107.0 |
| 4 | 0.42 | 1.184 | 118.4 | 126.7 → 126.7 |
| 8 | 0.68 | 1.546 | 154.6 | 145.7 → **144.0（触顶）** |
| 12 | 0.95 | 1.922 | 192.2 | 165.4 → **144.0（触顶）** |

- **回归锚点**：`scripts/test-panels.js` 速度封顶断言重锚 **72 → 60 px/s**（= 0.5 × 基准 120）；`scripts/test-modifiers.js` #H1 段的封顶/地板/速度公式按 `RULES.difficulty.speedVsBaseline` **动态自算**，且其 #H1 分支夹具**由 `penCap`/`floor`/`cap` 反推**（2026-10-15 修复：旧夹具写死 `base` 绝对值，`entityMults` 上调后越出阈值导致 4 断言误失败）；`scripts/test-map.js` 的 `entityMults` 端点断言以 `RULES.difficulty.entityMults` 为唯一真值（同为动态）。

## 敌方弹种与穿深/伤害（2026-10-22）

**用户裁定**：「敌方ai、boss弹种升级后，穿深、伤害不跟随弹种设定的伤害比例，按它们既有的成长速度设定」。

- **弹种仍按等级升档**（既有口径，本页不改）：每 3 级沿 AP 链升一档（`ap → apcr → apds → apfsds → apfsds_ad`，`js/tank_model.js` 的 `enemyAmmoKeyForLevel`），Boss 不走该分级。
- **穿深/伤害不再吃弹种比例**：`applyEnemyAmmoByLevel` 除写 `ammoKey` 外，同时写 `ammoStatNeutral = true` 与 `enemyLevel`；`firePrimaryShell` 对带该标记的射手把 `ammo.pen` / `ammo.dmg` **按 1.0 处理**（弹速/散布/跳角/模块/溅射等弹种特性全部保留）。
- **「既有成长速度」= 本卷的 `entityMults` 曲线**（`penetration [0.8, 1.5]` / `damage [0.8, 1.5]`，数值唯一口径见 [敌人强度与难度 · entityMults](./enemy-scaling.md)）；Boss 另有 `RULES.boss.tuning.penMul 1.4` / `dmgMul 1.5`（同属既有成长，不属弹种比例）。
- **负向断言**：敌人用 `apfsds_ad` 时的 `shell.pen` 必须等于同实体用 `ap` 时的值（`scripts/test-batch5-combat.js` 锁住）。

## 相关页面
- [敌方 AI](./enemy-ai.md) — 这些数值怎么被 AI 消费
- [Boss 规范](../boss.md) — `tuning.hpMul` 与 Boss 阶段
- [地图规范](../map.md) — 节点难度曲线（`difficultyForIndex`）
