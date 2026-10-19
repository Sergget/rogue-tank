# 战术坦克 Roguelike — 卡牌与构筑系统规范 (Cards & Build Spec)

> 权威子文档：由主文档 docs/DEVELOPMENT.md 索引。
> 涉及模块：js/tank_cards.js, cards/*.json, scripts/validate-content.js, scripts/audit-content.js, scripts/test-cards.js

---

## 1. 卡牌设计定位
- **局内改装强化**：卡牌是节点通关后三选一的坦克改装/战术强化，不是手牌指令牌组。
- **拟真坦克调性**：效果围绕装甲/穿深/装填/机动/散布/视野/弹种/乘员展开，贴合"摆角度找跳弹、找掩体抢位置"的博弈立意（参照 Slay the Spire 稀有度分层+流派构筑，落到坦克改装语境）。

## 2. 卡牌数据契约 (cards/<id>.json，一型一文件，经 GET /api/cards 聚合)
Schema 唯一权威 = js/tank_cards.js 的 validateCard：

    {
      "id": "spaced_armor",
      "name": "间隙装甲",
      "rarity": "common",
      "tags": ["重甲"],
      "desc": "车体正面附加间隙装甲，等效厚度 +12mm。",
      "effects": [
        { "type": "modifier", "stat": "armor.hull.front", "mode": "add", "value": 12 }
      ],
      "maxStacks": 3
    }

## 3. 七大效果类型 (type 决定 params)
1. **modifier**：{stat, mode:'add'|'mult', value}——stat 白名单（穿透/伤害/装填/弹速/极速/转向/炮塔转速/装甲路径 armor.hull.front 等）或履带锁/模块倍率/DOT倍率/散布。立即生效（走 addModifier 管道，§5.1 三层属性系统）。**白名单沿革（2026-10-10 #O3 补入 3 键，唯一口径 `MODIFIER_STATS`）**：`motionSpreadMul`（此前仅局内商店 `steady_mount` 可写）、`fireControlCrit` / `loaderAmmoCrit`（P-49 模块命中概率修正通道，此前三通道全空缺的死升级通道）。
   - **运行时参数硬限（2026-09-15 W5 用户裁定；2026-09-17 #C2 修订）**：卡牌 modifiers 聚合后受 `RULES.parameterLimits` 两张硬限钳制——装填 **reload ≥ 1.0s/发**（2026-09-17 #C2 裁定，取代旧 0.5s；加速装填卡不得突破下限）、极速 **maxSpeed ≤ 150km/h（375px/s）**（超速卡不得突破上限）；实现于 `js/tank_model.js` `applyParameterLimits(s, modifiers)`（computeStats 尾部，仅 modifiers 非空时生效，空修饰器出厂/纯计算不钳）。**#C2 同轮细化**：硬限只约束参数通道（scope run/permanent）——**纯 timed 修饰器（超装填 ×0.45 等能力爆发通道）不钳**，其实际开火间隔可继续 <1s（与机炮 reloadMult 0.25 武器通道同语义）。火控系另有既有钳制（spreadMult/motionSpreadMul ≥ multFloor、crit ≤ critBonusCap）。消费链 `applyCardEffects`→`addModifier`→`refreshStats`→`computeStats` 天然接入，商店另有 `runShopLimitBlocked` 购买拦截（§8.3，`fast_reload` limit.min=1.0 同步）。回归见 `scripts/test-rework-w5.js`（§5 timed 不钳 / 混合通道仍钳）。
2. **ammo**：弹种改造或弹种替换（完整弹种键与升级总表见 `docs/specs/combat.md` §3.1/§3.2 与 `js/tank_rules.js` 的 `RULES.ammoTypes` / `RULES.ammoChain`）。
   - 弹种属性改造：`{key, field:'pen'|'dmg'|'speed', mode:'mult'|'add', value}`，其中 `key` 支持现有体系下的有效弹种键。
   - 弹种升级替换：`{type:'ammo', key, replaceAmmo?}`。`replaceAmmo` 为直系前驱弹种（显式）；**省略时仅对「无 field 的旧式演变效果」按 `RULES.ammoChain[key]` 推断（#U40 口径，2026-10-19）**。替换前提：**前驱必须在 loadout 中**（`replaceAmmo`/`CHAIN[key]` ∈ ammoLoadout），否则视为跳级—拒绝变更；HE 线 `he→(heat|aphe)` 首张时「先新增」（保留 he，占第 3 槽）、其后再抽则「替换 he 槽」。KE/HEAT 链皆在前驱槽位原位替换，`ammoKey` 同步。三链语义详见 `docs/specs/combat.md` §3.1（#A26 已归档）。
   - **调校效果与升级效果的严格分界（#U40，2026-10-19 用户反馈「获取新弹种和参数升级搞混淆了」）**：带 `field` 的 ammo 效果是**纯数值调校**（demo_apcr_round「APCR 穿深 +20%」等）——只改数值，**绝不触发链替换**（旧实现按 CHAIN 回退推断前驱，导致 AP 槽被隐形改名 APCR/HEAT 且可随 maxStacks 2~4 反复触发）。判定口径三处同源（`applyCardEffects` 替换分支 / `isAmmoUpgradeCard` / `drawCardChoices` 链过滤）：升级效果 = 显式 `replaceAmmo` ∨（无 field 且 CHAIN 有前驱）；调校效果 = 带 field。回归 `scripts/test-cards.js` #U40 段。
   - **mode:'mult'**：对 RULES 基准倍率做乘算聚合。
   - **mode:'add' = 乘算后毫米追加**（2026-08-26，原 ISSUES #A13 修复定案）：最终属性 = base × mult聚合 + Σadd，value 按**字段自然单位**计——pen=mm / dmg=伤害值 / speed=px/s（如「APCR穿深+14mm」即最终穿深加 14mm，而非倍率刻度 +14）。
   - `computeAmmoConfig` 将 Σadd 输出为独立的 `fieldAdd` 字段存放，由消费方（fireTank/computeAmmoConfig 合成端）在乘算聚合之后合成，杜绝把 mm 追加混入倍率刻度。
   - 软上限 `ammoTypeCap` 作用于**最终等效值**且仅钳 HE（AP/APCR/HEAT 不受限）。（接入点见 `js/tank_rules.js` 的 `RULES.ammoTypeCap`）
3. **ability**：主动装置 {key}，key ∈ `ABILITY_KEYS_RUNTIME`（artillery / shield / overdrive / deploy_cover / super_fire_control / super_speed / **aps**；经 1~3 号技能键触发，P-17 接入。smoke 键已于 2026-09-15 W2 随烟幕整链删除；`aps`（主动防御系统）为 2026-09-21 #G9 新增）。`validateCard` 的 `ABILITY_KEYS` 白名单同步包含 innate 键 repair/medkit/extinguish 与全部 runtime 键。
   - **死效果键已整体摘除（2026-09-23 A 档）**：`recon` / `track_repair` 原在 `ABILITY_KEYS` 白名单内、却在 `ABILITY_KEYS_RUNTIME` 与 `ABILITY_KEYS_INNATE` 两池之外，**无任何激活路径**（`recon` 的 mvp 技能池 DISPATCH 分支调用全仓库无定义的 `tryDroneCommand()`，靠 `typeof` 守卫恒为 no-op）⇒ 对应 5 张卡（`support_recon` / `sniper_recon_mark` / `emergency_track` / `mobile_track_repair` / `support_track_repair`，均只带单一 `ability` 效果、卡面自述「占位」）能正常抽取但激活零反应。**用户裁定（2026-09-23）：整体摘除**——两键从 `ABILITY_KEYS`、mvp DISPATCH 表、`ABILITY_LABELS` / `ABILITY_KEY_HINT` 一并删除，5 张卡文件删除（卡池 173 → 168）。**现行不变量**：`ABILITY_KEYS` ≡ innate 3 键（repair/medkit/extinguish）+ runtime 7 键，**无死键**。细则归口本节与 `DEVELOPMENT.md` §4.35。
4. **passive**：机制性被动 {key:'reactive_armor'|'angle_boost'|'overmatch'|'spall_liner'|'commander_sight', value?}。`commander_sight`（车长潜望镜 rare +15% / 车长观瞄镜 epic +25%）消费点=mvp 视野半径（`entityHiddenByVision`/`visionRadiusEff`，见 combat.md §4.1；2026-09-19 #D2 接线前为死效果）。
   - **应急护盾 `reactive_armor`（#W-G，2026-10-19 用户裁定——机制整体重做）**：卡名由「反应装甲」改为「**应急护盾**」。机制从「命中驱动拦截」改为「**低血主动生成**」：
     - **触发**：`player.hp / player.maxHp < RULES.cards.emergencyShield.triggerHpRatio`（0.10）时自动展开；
     - **效果**：生成 1 个**持续 10s** 的**全向**护盾，吸收池 `shieldHp`（150），走 `js/tank_shield.js` 的 `applyShield`（#W7 修复后 `hp`/`duration` 可覆盖）；
     - **冷却**：基础 90s，卡牌升级可缩短，**下限 60s**（`cooldownMinSeconds`）——经 `t._emergencyShieldCdDelta` 叠加后钳制；
     - **不重复生成**：已持盾或冷却中不触发；
     - 状态字段：`_emergencyShieldCd`（冷却剩余）。`applyCardEffects` 获得时清零；mvp `enterBattle` 每节点重置（冷却不跨节点）；主循环 `updateEmergencyShieldRearm` 逐帧递减。
     - **⚠️ 历史上两种旧机制均已废弃**：① 一次性消耗（挡 1 发即消解）；② #U40 的「拦截后再充能 60s」。`js/tank_physics.js` 中对应的拦截分支已整体删除，`rule.key` 保留为 `reactive_armor` 仅为**存档/卡牌 id 兼容**。
5. **drone**：伴随浮游炮 {kind:'scout'|'striker'}（countMax=2 上限）。
6. **economy**：{field:'scoreMul'|'shopDiscount'|'startScore'|'reviveCount', value}。
   - **接线现状（#U40，2026-10-19 全通道落地）**：`scoreMul`（value 即**最终乘数**：1.15 = +15%；旧实现 `(1+value)` 曾错算 ×2.15）——结算类计分（节点分/波次分/击杀分）统一乘 `runScoreMultiplier(tank)`（`js/tank_cards.js`，mvp 三处计分点接入）；`shopDiscount`（value 即折扣率：0.1 = −10%，多张相加、防御上限 0.5）——局内商店价格乘 `(1 − runShopDiscount(tank))`（`runShopPriceFor` 调用方 `buyRunShopItem` 与 `buildRunShopInto` 展示同口径）；`reviveCount`——`applyCardEffects` 写 `runReviveBonus`，mvp `pickCard` 即时回算 `player.revives`（旧实现只在下局 `prepPlayerForRun` 生效，局内获得零反馈）；`startScore` 写 `runStartScore`（无消费方，预留）。
7. **weapon**：主/副武器安装与升级 `{type:'weapon', action:'install'|'upgrade', slot:'primary'|'secondary', weaponType, statOverrides?}`（2026-09-15 #A22/#A23 定型；完整语义见 §8.3）。**（类型枚举以 `js/tank_cards.js` 的 `CARD_EFFECT_TYPES` 为唯一口径——共 7 类；本节此前误标「六大」并漏列 `weapon`，2026-09-23 修正。）**

## 4. 稀有度分层与流派
- CARD_RARITIES（**2026-09-20 #E13 起五档**）：common / rare / epic / legendary / **mythic（神话）**——新增最高档，序号即强度序；抽取权重 `common 50 / rare 30 / epic 15 / legendary 4.5 / mythic 0.5`；Boss 掉落白名单 `LOOT_RARITIES`（tank_boss.js）同步五档；HUD 标签新增「神话」。
- CARD_TAGS 流派标签：重甲/机动/狙击/支援等，供 drawCardChoices 构筑导向抽卡。
- 当前分布（**2026-10-19 `node scripts/audit-content.js` 实测，#U40 批次复核**）：**191 张卡**——common 59（30.9%）/ rare 74（38.7%）/ epic 42（22.0%）/ legendary 15（7.9%）/ mythic 1（0.5%）。沿革：2026-10-10 #O3 时 169 张；2026-10-18 #U39 新增 20 张武器卡达 191（详见 `DEVELOPMENT.md` §4.99）。
- 效果类型分布（**效果数**，2026-09-23 实测）：modifier 128 / ammo 32 / weapon 17 / **ability 12** / passive 8 / economy 5 / drone 2（合计 204）——与 `CARD_EFFECT_TYPES` 的 **7 类**（modifier / ammo / ability / passive / drone / economy / weapon）一一对应。其中 `ability` 由 17 降为 12 即上述 5 张死效果卡摘除的结果。
- 最新数字以 `node scripts/audit-content.js` 输出为准（本节为带日期的快照，卡池随批次增长会过期）。

## 5. 堆叠与验证工具链
- maxStacks：同卡最大持有数，cardStackCount 计数，选择阶段硬性截断。
- validate-content.js：逐卡 schema 校验。
- audit-content.js --strict：稀有度/流派/效果分布常态化审计（偏差 <3% 视为统计波动）。
- test-card-effects.js：442 断言全卡池全链路执行验证。
- **P-42 扩展审计维度（2026-08-28，audit-content.js）**：新增四个报告型维度——① 流派×稀有度覆盖率；② 流派→效果类型构成；③ 同稀有度强度曲线（`multDev = Σ|mult值−1|`，仅统计 mult 效果，passive/ability/economy/add 单独列出以避量纲混淆；含离群警示 + 跨档单调性检查，仅在高稀有度含 ≥3 张 mult 卡时比较防假失衡）；④ tag 组合矩阵 + `heat_*`/`he_*`/`demo_*` 定点交叉对比表。
- **P-42 首轮审计结论（2026-08-28）**：修正单调性检查后无 red 级 mult 失衡（0 警告）；唯一可观测缺口为**内容覆盖**——HEAT 弹种仅 3 张卡（heat_composite_pen/heat_overpressure common、heat_precision rare），无 epic/legendary 档，明显薄于 HE/AP/APCR；属 card-author 补卡范畴（内容前置），非数值调优，暂缓。
- **审计警告现状（2026-10-19 #U40 批次复核，存量内容项）**：`⚠ 稀有度单调性破坏：epic 最强 multDev=0.65 > legendary 含 mult 卡中位 0.50`（主因 epic `demo_walking_fire` 三效果 multDev 0.35）。属内容强度曲线项而非缺陷（exit=0 不挂链），#U39 补卡后的卡面再平衡留待内容批次。

## 6. 被动卡接线结论（2026-08-26，#A14/#A15）
- **passive 统一消费入口** `passiveValues(tank, key)`（`js/tank_physics.js`）：收集 cardEffects 中 `type:'passive'` 的数值数组，多来源聚合语义由消费方自决——`overmatch` 取最大阈值、`spall_liner` 取最小乘数（取最强）。
- **`#A14b` overmatch（口径碾压，`demo_overmatch_shell` epic）**：AP/APCR（或 key 为空）命中时，若目标受击面等效厚度 eff ≤ 穿深×阈值（默认 0.85），跳过跳弹判定与过陡 BLOCK 分支、强制按穿透路径结算（正常未击穿判定 eff>effPen 仍保留）；命中结果带 `res.overmatch=true` 标记。HEAT/HE 本就走 noBounce，不走此路径。定案：按用户意向转 AP 弹种（原 HE dmg 效果移除，仅保留 passive overmatch）。
- **`#A14a` 全线高爆战术（`demo_all_he_doctrine` legendary）**：移除全局 reload×0.85 白送效果，仅保留 HE dmg×1.2 + HE pen×1.2 两重弹种效果——不再溢出到全弹种装填。
- **`#A15` 防崩落内衬（`support_spall_liner` rare 0.8 / `spall_liner` epic 0.85）**：spallMul 乘入击穿路径与 HE 残余爆轰的最终伤害（位于装甲/跳弹判定之后、随机抖动与取整之前，保证显示伤害=实际扣血整数一致）。
- 测试锚定：`scripts/test-cards.js` §#A14a/#A14b/#A15 断言覆盖（overmatch 免跳弹/阈值不满足仍跳弹/HEAT 不受影响；内衬 rare 0.8 + epic 0.85 多来源取最强）。

## 7. 模块暴击修饰器接线结论（#A16）
- **修饰器白名单与几率加成**：
  - 新增 `fireControlCrit`（火控增强提升炮手、炮闩受损概率）与 `loaderAmmoCrit`（提升装填手、弹药架受损概率）修饰器。
  - 加法叠加，最大加成限制在 ≤25%，修正后单区判定概率限制在 ≤90%（确保保留击穿而没有额外成员/模块损伤的余量空间）。
  - 在 `tank_physics.js` 的 `moduleFromHit` 中完整应用。`scripts/test-cards.js` 对应新增判定几率加成及钳制上限测试断言，全部通过。

---

## 8. 卡牌设计定稿：坦克基础数值 / 机制 / 技能三板块（2026-09-13 会话裁定）

> 本节 2026-09-13 会话裁定为设计契约，同日已随 PLAN 阶段四/阶段六落地实现（见 DEVELOPMENT.md §4.9），数值梯度均按下方表格执行并验证。

### 8.1 设计裁定（用户拍板）
1. **不做百分比减伤**：防御成长只走装甲/跳弹/内衬（spall_liner 模式），不引入 damage_reduce 类整车减伤被动。
2. **空袭不新增独立键**：定点/地毯式空袭作为 `RULES.abilities.artillery` 的**升级形态**（卡牌改写 delay/shellCount/radius/shape 参数），复用 `callStrike` 管线与 `maxStrikes` 预警池。
3. **副武器卡牌直接安装**：局内 epic 起步的安装卡直接写入 `weapons.secondary`，不做局前 Loadout 双通道。

### 8.2 坦克基础数值卡梯度（modifier 通道，无新机制）✅ 已实现
| 维度 | common | rare | epic | legendary |
|---|---|---|---|---|
| 血量 maxHp | +12% | +20% | +35% | +50%（附带 weight +10%） |
| 装甲（逐面 add） | front +10 / side +6mm | front +18mm | 六面各 +12mm | front 等效 ×1.15（倾斜效应） |
| 射速 reload | ×0.93 | ×0.87 | ×0.80 | ×0.72（仍受 1.0s 地板钳制，2026-09-17 #C2） |
| 精度 aimSpeed | +15% | +25% | +40% | +60% + 静止首发 σ×0.6 |
| 三扩（motion/hullRot/turretRot 分卡） | 单项 −15% | 单项 −22% | 单项 −30% | 三项全 −25% |
| 马力 enginePower | +15% | +25% | +35% | +35% 且 maxSpeed +10% |

- 全部复用 `addModifier` 管道 scope='run'；装甲 add 沿用 `armor.hull.front` 等白名单路径。
- weight 联动为拟真 trade-off 杠杆：马力/血量线搭 weight +x%。
- 已生成 `cards/hull_hp_boost_1~4` / `hull_armor_front_1~2` / `hull_armor_all_3` / `reload_speed_1~4` / `aim_speed_1~4` / `engine_power_1~4`。

### 8.3 机制卡定案 ✅ Schema 已实现 + 阶段七运行时与卡牌已落地（2026-09-13）
- **主武器双管**（**2026-09-20 #E13 用户裁定重做**，`WEAPON_DEFAULTS.double_barrel`: reloadMult ×1.0/管, count 2, switchSeconds 0.5, barrelOffset **1.85**, altReload false）：
  - epic 安装卡：primary → double_barrel（`cards/weapon_primary_double_barrel`）——炮盾并排 2 炮管渲染（`tank_battledraw.js`，两根炮管**各自**绘制护套/制退器/抽烟器；偏移与弹道横向偏移同源）；装填时间为**单管**时间，两管**顺序流水线**装填（一个装填时间只装好一根 → 「+5s 第 1 管可单发 / +10s 第 2 管可齐射」）；单击（鼠标）发射 1 根已装填管，空格齐射（仅两管都就绪）；**默认两管装填进度互相干涉**（任一击发 → 两管进度归零）；HUD 显示两根炮管各自的独立进度弧；开火火光 ×1.7 + 音效增益 ×1.6；
  - rare「同步击发」：switchSeconds 0.5→0.1（`cards/weapon_primary_sync_fire`）；
  - **mythic「交替装填系统」**（2026-09-19 #D3 重定义；**2026-09-20 #E13 升为神话档并解除进度干涉**）：`altReload:true` —— 击发一管**不影响**另一根炮管已累计的装填进度（「+6s 发射时另一管仍是 +1s 进度」）+ 换管间隔 switchSeconds 0.5→0.05 + 单管装填 reloadMult ×1.0→×0.9（`cards/weapon_primary_alt_reload`）；
  - **autocannon 线（2026-09-15 W6 用户裁定重做）**：epic 安装卡 `weapon_primary_autocannon`——伤害=标准 1/5（damageMult 0.2）、穿深=标准 85%（penMult 0.85，弹种系数机制不变）、射击间隔=装填时间×0.25（reloadMult 0.25）；热量机制：每发 +heatPerShot 10%、每秒冷却 coolPerSec 15%、≥heatMax 100% 过热并锁定 overheatLock 2s（`updatePrimaryHeat` 逐帧驱动冷却，`fireTank` 门控过热期开火；旧 burst 连发路径整体删除）；外观：炮管更细（barrelWidthMult 0.6）略短（barrelLenMult 0.8）、不绘护套/制退器/抽烟器、炮口特效与弹体随 fxScale 0.55 缩小（`tank_battledraw.js` 消费）；玩家装填环改热量表（绿 <50% / 黄 50–<100% / 红 ≥100%，锁定红色闪烁）；
  - rare「机炮散热强化」：coolPerSec 15→22（`cards/weapon_primary_burst_tune` 改语义，id 不变保卡池计数）；
  - 主武器运行时（`fireTank` 消费倍率；双管走 `fireDoubleBarrel`/`updatePrimaryBarrels` 状态机——**`_dbState{count, ready[], loadT[], loader, altReload}`** 顺序流水线装填 + 干涉开关，旧 `reloadT[]` 独立并行装填语义已废弃；autocannon 改逐发短间隔 + 热量机制 `updatePrimaryHeat`，burst 连发已删除）。细则归口 `docs/specs/combat.md` §8.5。
- **可部署物数量升级卡（#E4，2026-09-20）**：`ability_deploy_cover_fortified`（便携掩体上限 +1）、`weapon_secondary_mine_upgrade`（地雷上限 +1）——数量加成经 `RULES.abilities.deploy_limits.upgradeCards` 按持有卡累计到 `player.deployBonus`，超限时最早部署的可部署物直接消失。细则归口 `docs/specs/combat.md` §8.1。
- **曲射**：mortar aoe 90→120 / reload 8→6.5 分两卡。**2026-09-14 定案**：独立 HEC 弹种已移除（`RULES.ammoTypes` 删 `hec`、`cards/hec_curvature_shell.json` 删除）。**2026-09-15 用户裁定：主武器曲射机制移除**——`weapon_primary_howitzer` 卡与 `WEAPON_DEFAULTS.primary.howitzer` 删除、`RULES.weaponTypes.primary`/`WEAPON_PRIMARY_TYPES` 白名单同步剔除，主炮一律平射直线弹道（firePrimaryShell 的 isArc 落点块删除，stepShells isArc 分支仅服务副武器迫击炮弹）；曲射/越障由**副武器层**承担：mortar 弹药 `ignoreCover:true` + `isArc` 落点（见 §8.3 副武器安装与 DEVELOPMENT.md §4.13）。HE 系链上代表升级卡为 `cards/ammo_upgrade_blast_he`（**终结点**，前驱 `proximity_he`，HE-OP 超压榴弹，溅射向）。
- **弹药升级**：走现有 `ammo` effect 通道（mult 聚合 + mm 追加 + `ammoTypeCap` 软上限 dmg 2.5 / pen 1.8 / speed 2.0），只补内容梯度不改机制。
- **副武器安装/升级（效果类型 `weapon`，2026-09-15 #A22/#A23 定型）**：`{type:'weapon', action:'install'|'upgrade', slot:'primary'|'secondary', weaponType, statOverrides}` —— **`action` 必填**（validateCardEffect 强制）。`install`（epic 安装卡）：primary 换装写入 `weapons.primary.type` + 合并 overrides 并清 `_spec`/`_dbState`；secondary **仅空槽**写入（默认值+overrides 合并），槽已占则 no-op（effect 仍入 `cardEffects`）。`upgrade`（rare/legendary 升级卡）：**仅当同型已持有**时合并 `statOverrides`，否则 no-op。**副武器单槽不变量**（无 `secondarySlots`/`activeSecondaryIndex`）。**抽卡资格**：`cardEligible(card, owned)` 在可用池阶段过滤——install(primary)=未持有该型 / install(secondary)=槽空 / upgrade=已持有同型 / `owned.cards` 达 `maxStacks` 则排除；`owned = {abilities, primaryWeapon, secondaryWeapon, cards?}`。运行时 `updateSecondaryWeapon`（mortar 曲射/missile 制导/rocket 扇形/mine_layer 布雷 + turret 副炮塔）阶段七 7.2 已落地；玩家侧手动击发见 combat.md §4。
- **武器升级卡数值梯度（2026-09-15 数值复核，原 PLAN 阶段八 §8.1.1 已归档）**：副武器 4 张 rare 升级卡 DPS 增益 mortar 1.333×（reload 6）/ missile 1.524× / rocket 1.389×（count 5、reload 9）/ mine 1.500×，统一带 `[1.25,1.60]`；`scripts/test-weapon-upgrade-balance.js` 锁定。
- **副武器属性升级卡补齐（#S6，2026-10-14 用户反馈"副武器卡牌偏少"）**：新增 2 张 rare 升级卡——`weapon_secondary_missile_lock_upgrade`「导弹快速锁定」（lockSeconds 1.0→0.6、lockArcDeg 30→45；`updateMissileLock` 经 `cfg` 消费）、`weapon_secondary_rocket_speed_upgrade`「火箭高速推进器」（speed 450→650、aoe 40→55；`updateSecondaryMount` 火箭分支 `cfg.speed ?? 450` 消费）。升级资格照常（须持有同型副武器）。副武器卡总数 8→10（4 安装 + 6 升级）。
- **主武器「弹夹炮」`clip`（#G6，2026-09-21 新增）**：epic 安装卡 `weapon_primary_clip`（primary → clip，`statOverrides` 与 `WEAPON_DEFAULTS.primary.clip` 同源）；rare 扩容卡 `weapon_primary_clip_extended`（`{"clipSize":"+1"}`，maxStacks 2，每 +1 发弹夹间装填 +0.8×标准装填）。机制细则（0.7s 弹夹内固定间隔 / ×3.0 弹夹间整组 / 扩容递减收益）归口 `docs/specs/combat.md` §9.1。
- **电磁轨道炮重调（#G5，2026-09-21）**：epic 安装卡 `weapon_primary_railgun` 数值更新为 `reloadMult 1.8 / damageMult 1.8 / penMult 2.0 / shellSpeedMult 2.5 / pierce 1 / pierceDmgMul 0.6`（新增贯穿 2 目标）；rare 升级卡 `weapon_primary_railgun_upgrade`（`{reloadMult:1.7, shellSpeedMult:3.0}`）。细则归口 `docs/specs/combat.md` §9.3。
- **主/副武器 `statOverrides` 支持 `"+N"` 相对增量（#G6，2026-09-21）**：升级卡的 `statOverrides` 值合法类型扩为三类——`number`（绝对值覆盖，原行为）、`boolean`（开关，如 `altReload`/`guided`）、**`"+N"` 字符串（在当前值基础上 +N）**。合并统一走 `mergeStatOverrides(stats, overrides)`（主/副武器两条升级分支同源），`"+N"` 经 `Number(cur) + N` 计算；`validateCard` 对三类放行、其它类型判非法。此前 boolean 值会被校验拒绝（`altReload`/`guided` 升级卡曾报非法）。
- **武器升级卡全覆盖（#U39，2026-10-18 用户要求「主/副武器每种 2~3 张升级卡」）**：清理了 4 处「升级卡写了不生效」的通道断点，并把覆盖面补齐到**每种武器 2~4 张**（实测 2026-10-18，`scripts/test-weapon-upgrade-balance.js` 的覆盖面段自动复核）。
  - **① 标准主炮通道从死到活**（`js/tank_fire.js` `primaryWeaponSpec`）：原实现对 `type==='standard'` **恒返回 null**，`weapons.primary.stats` 里的任何 `statOverrides` 都被忽略 ⇒ 所有 `weapon_primary_standard_*` 卡天然无效。现行：**无 stats 覆写时仍返回 null（与既有行为逐字节一致）**，有覆写才产出规格（缺省表由 `WEAPON_DEFAULTS.primary.standard` 兜底，倍率全 1.0）。新增 3 张 standard 升级卡（rare 硬芯穿甲弹 dmg ×1.15/pen ×1.08、rare 快速装填机 reload ×0.85/speed ×1.15、epic 锥膛炮管 pen ×1.22/speed ×1.25）。
  - **② `missile_wire` 进入卡牌白名单**：它一直在 `RULES.weaponTypes.secondary` / `WEAPON_DEFAULTS.secondary` / `fireActiveSecondary` 的 wire 分支里，却漏在 `WEAPON_SECONDARY_TYPES` 外 ⇒ 任何线导导弹卡都被 `validateCardEffect` 判「weaponType 非法」。现补入，并新增**安装卡** `weapon_secondary_missile_wire`（此前该型没有任何获取途径）+ 2 张升级卡（rare 双级推力 speed 340→560/reload 10→8、rare 串联战斗部 damage 150→220/range 700→900）。
  - **③ `mine_layer` 的爆炸/触发半径收口进缺省表**：`fireActiveSecondary` 原把 `blastRadius 70` / `triggerRadius 45` 写死在字面量里，升级卡无法覆盖。现 `WEAPON_DEFAULTS.secondary.mine_layer` 补这两个字段并改读 `cfg`，新增 rare 阔域雷场（105/70）。
  - **④ `missile_wire` 的 speed 收口**：原只在 wire 分支写死 `340`，现缺省表补 `speed: 340` 并由 `cfg.speed` 消费。
  - **⑤ 新增安装卡 `weapon_secondary_turret`（副炮塔）**：`turret` 型此前同样无任何安装卡（只在 Boss/bench 内部使用）。配套 3 张升级卡（rare 加长身管 / rare 伺服传动 / epic 重炮塔座）。
  - **新增/补齐清单（共 20 张）**：主武器 9 张——standard ×3（`_damage`/`_reload`/`_pen`）、autocannon ×3（`_damage` rare / `_heat` rare / `_feed` epic）、railgun ×1（`_damage` rare，含 pierce 1→2）、clip ×1（`_capacity` rare，`"+2"` 容量 + 发际 0.55s）、double_barrel ×1（`_turret` rare）；副武器 11 张——turret 安装 ×1 + 升级 ×3、missile_wire 安装 ×1 + 升级 ×2、mortar ×1（`_accuracy` rare）、mine_layer ×1（`_radius` rare）、rocket ×1（`_warhead` rare）、missile ×1（`_damage` rare）。
  - **复核带（`scripts/test-weapon-upgrade-balance.js` 扩面）**：复核面从原 4 张副武器 rare 卡扩到**卡池内全部 weapon upgrade 卡**并按通道分三档——① 纯 DPS 通道增益 ∈ [1.15, 1.75]；② 混合通道 DPS ≥ 1.0 且功能字段实际变化；③ 纯功能性通道 DPS 不变且有 ≥1 字段相对基础规格变化（防「写了等于没写」）。原 4 张（#S6 定案）另按历史紧带 [1.25, 1.60] + 极差 ≤0.35 复核，结论不回退（实测增益 1.333/1.524/1.389/1.500，极差 0.190）。同时新增「每张升级卡的 weaponType 必须有对应安装卡（standard 豁免）」契约断言。
  - **机制型豁免**：`clip` 属「弹夹容量 + 发际间隔」的非线性改造，DPS 公式不适用，只校验字段实际变化。
- **Boss 随机武备（#U39，2026-10-18 用户反馈「boss 似乎还不会随机到这些武器和升级」）**：Boss 此前只有 `assignBossSkills` 随机技能，`weapons` 恒为 `standard` + `none` ⇒ 主/副武器安装卡与升级卡对 Boss 完全不可见。现行：
  - **选择逻辑**（纯函数 `pickBossArmament(pool, {rng, bossNumber})`，`js/tank_cards.js`）：① 以 `primaryChance` 掷骰从 `slot=primary && action=install` 随机取 1 张；② 以 `secondaryChance` 掷骰从 `slot=secondary && action=install` 随机取 1 张；③ 对**已选中**的主/副武器类型，从 `action=upgrade && weaponType 匹配` 里逐张独立掷骰抽取，最多 `upgradeMax` 张（概率 `upgradeChance + bossNumber × upgradeChancePerBoss`）。任何一步无货静默跳过。
  - **参数唯一口径 `RULES.boss.armament`**：`{ enabled, primaryChance 0.9, secondaryChance 0.7, upgradeMax 2, upgradeChance 0.55, upgradeChancePerBoss 0.1 }`。
  - **施加通道**：mvp `assignBossArmament`（`tank_mvp.html`，在 `assignBossSkills` 之后调用）经 `applyCardEffects` 施加 —— 与玩家卡牌**同一语义通道**（换装重置 stats 基线、升级仅同型合并），不另开旁路。
  - **实测分布（2026-10-18，500 次探针，真实卡池 191 张）**：平均每 Boss 携带 **3.27 张**卡（含升级卡 830 次），`applyCardEffects` 失败 0 次；主武器 five-way 均匀（各 22.2%~22.8%）、仍为标准主炮 9.8%；副武器 6 型各 10.8%~12.2%、空槽 29.6%。
  - **可读性**：TAB 状态面板 Boss 行新增「武备:主武器+副武器·改装×N」，出生时日志输出 `BOSS 武备：…｜改装 …`。
- **主动防御系统 APS（#G9，2026-09-21 新增能力卡）**：epic `ability_aps`（`{type:'ability', key:'aps'}`，maxStacks 1）——经技能池 1~3 号技能键触发（无独立字母键）；参数 `RULES.abilities.aps`（duration 6s / radius 240px / maxIntercepts 3 / cooldown 22s）。机制细则归口 `docs/specs/combat.md` §9.4。

### 8.4 技能卡定案（锚定现有 RULES.abilities 参数）✅ 已实现（阶段七 7.1 补进阶升级卡）
| 技能 | 升级梯度 |
|---|---|
| 召唤炮击 artillery | rare：shellCount 3→5；epic：radius 110→140；legendary：reload 15→10 |
| 空袭·定点（artillery 升级形态） | legendary：delay 2.5→1.5s、radius 110→60、单发 dmgMult ×1.2→×3.0、shape:'point' |
| 空袭·地毯（artillery 升级形态） | legendary：delay 2.5→3.5s、沿炮塔朝向矩形 240×80、8 发 dmgMult ×1.0、shape:'carpet' |
| 伴随无人机 drone | rare：striker dmgMult 0.4→0.55；epic：fireInterval 2.0→1.6 **（countMax 升级未生成，现行场上上限恒为 RULES.abilities.drone.countMax=2）** |
| 布设掩体 deploy_cover | epic：沙袋/护盾 OBB hp 200、cd 20s —— 接 R-2 deployables（战术护盾掩体已有运行时） |
| 主动防御 aps | epic 基础卡 `ability_aps`（#G9 2026-09-21 新增）；经 1~3 号技能键触发，参数见 `RULES.abilities.aps` |

- **params 覆写通道（阶段七 7.1 已落地）**：`ability` 效果支持可选 `params` 对象，`tank_abilities.js` `computeAbilityConfig(t, key)` 聚合 `RULES.abilities` 基础 + `cardEffects` 覆写；`tryActivateAbility` 全分支消费聚合参数。已生成进阶卡：`ability_artillery_barrage` / `ability_artillery_heavy` / `ability_artillery_strike_point` / `ability_artillery_strike_carpet` / `ability_deploy_cover_fortified`（DEVELOPMENT.md §4.11）。**（原 `ability_smoke_dense` 已随 2026-09-15 W2 烟幕整链删除。）**
- 空袭实现集中在 `tank_strike.js` 落点分布函数（point/carpet 两形状）+ artillery 参数卡改写语义（ability 效果 params 覆写通道）。
- `callStrike` 已支持 `shape:'circle'|'point'|'carpet'`；`deploy_cover` 已入 `RULES.abilities`（hp 200 / shieldHp 150 / duration 30 / cooldown 20）与 `tank_abilities.js` 运行时键白名单，已生成 `cards/ability_deploy_cover`。

- **ability 升级卡的持有资格 `requiresAbility`（#A28，2026-09-16 定型）**：`{type:'ability', key, requiresAbility?, params?}` —— `requiresAbility` 可选，**值恒等于自身 `key`**（ability 的「升级」语义 = 同一 key 的 `params` 覆写，经 `computeAbilityConfig` 按 key 聚合；故不引入 weapon 那样的 `action` 字段）。语义由 `cardEligible` 消费：`requiresAbility` 存在且不在 `owned.abilities` 中 → 该卡抽取期不合格。**`validateCardEffect` 显式校验**（必须是 `ABILITY_KEYS` 内的字符串，缺省合法）——拼写错误会让资格过滤静默失效。
  - **已标记（5 张升级卡，均为 `params` 覆写卡）**：`ability_artillery_barrage` / `ability_artillery_heavy` / `ability_artillery_strike_point` / `ability_artillery_strike_carpet`（`requiresAbility:'artillery'`）、`ability_deploy_cover_fortified`（`requiresAbility:'deploy_cover'`）。
  - **不得标记（6 张基础/安装卡，死锁防线）**：`artillery_strike` / `tactical_shield` / `super_reload` / `ability_deploy_cover` / `repair_kit` / `support_extinguisher`（原 11 张，2026-09-23 A 档摘除 5 张死效果卡后缩减）。**通用不变量**（`test-cards.js` 守门）：每个出现过的 ability key 至少有一张未标记卡作为获取途径；否则该能力永远无法获得。`repair`/`extinguish` 属 `ABILITY_KEYS_INNATE`（开局自带、绕过持有检查），其卡不受影响。
  - **语义闭环**：`applyCardEffects` 非 modifier 分支 `Object.assign({}, ef, {cardId})` 保留 `ef.key` → 基础卡 key 落入 `player.cardEffects` → mvp `drawRewardCards` 组装 `owned.abilities` → 同 key 升级卡转为合格。
  - **保底路径**：资格过滤在 small-pool early-return 与保底**之前**执行，保底只在已过滤的 `usable` 上取卡，**不复活**不合格升级卡；池内只剩升级卡时宁缺毋滥。
  - **实况注意**：传奇档位池的 2 张 ability 卡（point/carpet）**全为升级卡** → 未持 `artillery` 者在该池抽不到能力卡（正确行为：artillery 基础卡在 common/rare/epic 池）。作者经 `tools/content_designer.html` 编辑能力卡时须保留 `params`/`requiresAbility`（该编辑器已补全三字段往返）。

### 8.5 技能卡总表（#A28 分类：base=可独立获取 / upgrade=需先持有同 key）

> **2026-09-23 A 档**：原 `recon` / `track_repair` 两键的 5 行（`support_recon` / `sniper_recon_mark` / `emergency_track` / `mobile_track_repair` / `support_track_repair`）已随死效果键整体摘除，不在下表。
| 卡 id | key | 分类 | requiresAbility |
|---|---|---|---|
| `artillery_strike` | artillery | base | — |
| `ability_artillery_barrage` | artillery | upgrade | `artillery` |
| `ability_artillery_heavy` | artillery | upgrade | `artillery` |
| `ability_artillery_strike_point` | artillery | upgrade | `artillery` |
| `ability_artillery_strike_carpet` | artillery | upgrade | `artillery` |
| `ability_deploy_cover` | deploy_cover | base | — |
| `ability_deploy_cover_fortified` | deploy_cover | upgrade | `deploy_cover` |
| `tactical_shield` | shield | base | — |
| `super_reload` | overdrive | base | — |
| `repair_kit` | repair（innate） | base | — |
| `support_extinguisher` | extinguish（innate） | base | — |

- **innate 强化卡的卡面语义（2026-10-17 #U21，现行口径）**：`repair_kit` / `support_extinguisher` 以 `type:'ability'` 发放，但 `repair` / `extinguish` 是**开局固有的 innate 键**（`ABILITY_KEYS_INNATE`，`tryActivateAbility` 绕过持有检查）——这两张卡**不会新增技能槽**，只改写该能力的修复量/冷却（`tank_abilities.js` 按 `cardId` 应用）。卡面因此必须写「强化固有技能【修理箱】…（修理箱为开局固有技能，本卡是强化而非新增）」，避免被读成「占了一个技能位却不能激活」。
- **innate 键豁免 #U18 已持去重（#U40，2026-10-19）**：`cardEligible` 的「已持技能去重」（#U18）对 `repair` / `medkit` / `extinguish` 三个 innate 键**豁免**（判定键 `ABILITY_KEYS_INNATE_LOCAL`，`js/tank_cards.js`，与 `tank_abilities.ABILITY_KEYS_INNATE` 同源）——玩家开局即「持有」固有键，若照 #U18 去重则这两张纯强化卡永远抽不到（#U21 改卡面仅解决语义误读，没解决抽取资格）。runtime 键照旧去重，口径不变。回归 `scripts/test-cards.js` #U40 段。

## 9. 装备优先抽卡（2026-09-14 用户定案）
- **动机**：玩家没有任何主动技能 / 副武器未安装时，候选卡若全是"升级类"会语义莫名其妙（升级谁？）。抽卡必须先提供**装备卡**。
- **规则**（`tank_cards.js` `drawCardChoices(pool, n, { rng, ammoLoadout, owned })`）：
  - `owned = { abilities: string[], primaryWeapon: string, secondaryWeapon: string, cards?: {[id]:count} }` —— 玩家当前持有的主动技能 key 列表、主/副武器类型与已拥卡计数（mvp `drawRewardCards` 从 `player.cardEffects`（type 'ability' 去重 key）、`player.weapons.primary/secondary.type` 与 `cardStackCount` 组装传入；无则空数组 / 'standard' / 'none'）。
  - **资格过滤先行**（#A23 / #A28；2026-10-16~17 #U18/#U20/#U22 扩充，现行口径）：`cardEligible` 在可用池阶段剔除下列卡，**在小池 early-return 与保底之前执行**；普通轮、刷新、Boss 追加轮复用同一规则：
    1. 未持有所需武器的 `upgrade` 卡 / 槽已占的 secondary `install` 卡 / 未持有 `requiresAbility` 所指能力的 ability 升级卡（#A23/#A28，原口径）；
    2. 已达 `maxStacks` 的卡（原口径）。**#U44（2026-10-19 用户反馈「出现过、但不再持有的主、副武器、技能似乎就不再出现了，可以再次出现，允许玩家再次选择」）——安装类卡豁免**：`maxStacks` 只约束「当前仍在生效」的卡；**weapon `install` 卡与 ability 基础卡（无 `requiresAbility`）** 的重复资格改由「当前是否持有该型/该技能」动态判定（即第 1、3 条），达历史 `maxStacks` 不再一刀切拉黑。判定助手 `_isSwapBackCard(card)`（`js/tank_cards.js`），`cardEligible` 与 `applyCardEffects` 首行**两处同源**。语义：换掉双联火炮后双联安装卡重新进入候选、放下护盾后基础盾卡重新可抽（`install` 同型幂等、ability 重复入 `cardEffects` 无副作用）。**仍受 `maxStacks` 约束**：weapon `upgrade`、ability 升级卡（`requiresAbility`）、modifier/ammo/passive/drone/economy（叠加有上限，重复无收益）。回归 `scripts/test-cards.js` #U44 段；
    3. **已持技能去重**（#U18）：ability 键玩家已持有，且本卡不带 `requiresAbility`（即非该能力的升级）⇒ 不合格——原行为是抽到零收益的重复技能卡占掉一个候选位；
    4. **属性达限过滤**（#U20）：按 `RULES.parameterLimits` 点分路径取边界，模拟下一级后越界即不合格（口径同商店侧 `runShopLimitBlocked`）。**边界补齐（#U40，2026-10-19）**：`parameterLimits` 新增 `aimSpeed`（0.1~6；真实坦克 spec 基准包络 1.0~2.5，与 makeTank 缺省 0.15 两套量纲并存）/ `trackLock`（3~20s，基准 8s）/ `fireControlCrit` / `loaderAmmoCrit`（0~0.25 = critBonusCap 同源）——此前四参数无 limits ⇒ 满级精度/履带/暴击卡仍反复出现（用户反馈「射速、精度等升级满级后不该再出现」）；`computeStats` 聚合侧同步补 aimSpeed.max / trackLock.min 无条件钳制（对齐 crit 通道既有行为）。
    5. **「取最优」被动去重**（#U22）：`spall_liner`（取 min）/ `overmatch`（取 max）与已持同键被动比较，本卡不更优即不合格（这些被动按「取最强、不叠加」结算，弱档无收益）。
  - `abilities` 为空且池内有 `type:'ability'` 卡 → **保底抽取 1 张** ability 卡；
  - `secondaryWeapon` 为 none/缺省且池内有 `type:'weapon' && slot==='secondary'` 卡 → **保底抽取 1 张**副武器安装卡；
  - **弹种升级卡保底（2026-09-17 #C3 用户裁定「升级卡加权/保底」路线 → 2026-09-19 #D5 用户反馈「弹种升级速度太快」下调为概率触发 → 2026-10-10 #O4 再调参；排在装备保底之后）**：传入 `ammoLoadout` 时，若池内存在「`replaceAmmo` 链前驱已在 loadout 中」的弹种升级卡（即本回合可解锁/升级的新弹种），以 `RULES.cards.ammoUpgradeGuaranteeChance`（现行 **0.18**，沿革 0.4）概率**保证 1 张**进候选（单次抽取独立掷骰；`opts.ammoGuaranteeChance` 可覆盖，=1 复现 #C3 无条件保底语义）。**节奏衰减（#O4）**：保底概率与稀有度内自然权重同步乘 `0.55ⁿ`（n = 本局已获链升级卡数，经 `owned.cards` 反查 `isAmmoUpgradeCard` 计数），保底与自然抽样双通道随链进度递减（整局探针：15 节点 7 张 → 3 张，−57%）。升级完成后（目标弹种入 loadout）保底自动消失、恢复稀有度权重抽样。
  - 剩余槽位按稀有度权重从其余可用卡抽样（`weightedRarity` 选稀有度 → 桶内加权随机取，升级卡权重 ×paceFactor）。保底不足时不改变抽取上限（`picked.length < count` 守卫）。
- **实现注记**：`abilityIdxs`/`weaponIdxs` 在 ability 卡 splice 之后静态下标会错位（误把被动卡当武器卡抽）——改为 `firstIdxWhere` 动态求值（每次 splice 后重查），`test-cards.js` 装备优先四态断言捕获验证；**#O4 起保底改随机取卡（`pickRandomWhere`）+ 返回前统一洗牌（`shufflePicked`）**——保底只决定「在候选集里」、不决定屏幕位置（修复前首位 `ability_aps` 500/500 次固定）。
- **Boss 追加轮弹种升级必保底（#S5，2026-10-14 用户要求「boss战后必然提供1个弹种升级选项」）**：`drawRewardCards` 在 `pendingLootRounds > 0` 时传 `guaranteeAmmoUpgrade: true` → `drawCardChoices` 绕开概率掷骰与 pace 衰减**必抽 1 张**链升级卡（无链资格卡时静默跳过，不破坏抽取）。链过滤器（前驱资格）与 `cardEligible` 照常先行。
- **Boss 追加轮稀有度保底 + 非普通卡加权（2026-10-16 用户要求「确保至少 1 张传奇、2 张史诗，其余随意，非普通卡抽中几率调高」，现行口径）**：
  - **池子侧：`bossLootPool()` 返回全池**（不再按 `cardRarity` 做稀有度下限过滤）。**沿革（被推翻的旧口径）**：原实现按 `CARD_RARITIES.indexOf(c.rarity) >= indexOf(loot.cardRarity)` 硬过滤，而 3 个 Boss 配 `legendary` ⇒ `epic` 整档被排除——电磁炮/机炮/双管/弹夹炮与全部副武器安装卡（共 28 张装备卡）在 Boss 轮永不可见；且 Boss 模式**每个节点都是 Boss 轮**，池子被砍到 26 张后逐轮枯竭（池内全 `maxStacks=1`），第 5 轮可用仅 1 张、第 6 轮归零，候选不足所需张数而卡死。**现行：稀有度诉求一律改由抽取层保底表达，不把任何稀有度踢出候选。**
  - **抽取侧：`opts.guaranteeRarity` 按配比保底**——`{ legendary: 1, epic: 2 }` 表示候选集中**至少**含该档 N 张（从稀到常见逐项满足；已由装备/技能/弹种保底或自然命中同档则不重复追加；池内某档无可用卡则静默跳过）。
  - **抽取侧：`opts.rarityWeights` 覆盖稀有度权重**——Boss 轮用 `20/32/30/15/3`（原 `50/30/15/4.5/0.5`），自由槽位的普通卡占比由 ~50% 降至 ~8%、传奇及以上由 ~4.4% 升至 ~25%。普通轮不传该选项，权重不变。
  - **参数唯一口径**：`RULES.cards.bossRound`（`guarantee` + `rarityWeights`），消费方 `tank_mvp.drawRewardCards`（仅 `pendingLootRounds > 0` 时传入）。
  - **容量上限（已知边界）**：`legendary` 全池 15 张且全为 `maxStacks=1`，Boss 模式每轮消耗 1 张 ⇒ 约第 12 轮后传奇抽完、保底**优雅降级为 0 传奇**（候选仍恒 5 张、不卡死）；`epic` 容量 45 张（`epic 37 × maxStacks` 合计）约 22 轮。**回归**：`scripts/test-cards.js` #BOSS-ROUND 段（保底 200/200、非普通卡占比、普通轮不受影响、池耗尽不缩水、全 0 权重不除零）。

## 10. 升级覆盖面（2026-10-10 #O3 对账，现行口径）

**问题**：`computeStats` 产物键中 `fireControlCrit` / `loaderAmmoCrit`（P-49 模块命中概率修正，硬上限 0.25）**三通道全空缺**（白名单无、两商店无）——注释明写「玩家侧可随卡牌/技能升级增强」的死升级通道；`motionSpreadMul` 仅局内商店可写；`shellSpeed` / `turnRate` / `turretTurnRate` / `trackLock` / `enginePower` 等仅卡牌单通道。

**补齐（参数唯一口径 `MODIFIER_STATS` / `UPGRADE_DEFS` / `RUN_SHOP_DEFS`）**：

| 通道 | 新增 |
|---|---|
| 卡牌白名单 | `motionSpreadMul` / `fireControlCrit` / `loaderAmmoCrit`（+ 3 张新卡：rare `mod_fire_control_crit`（P-49 炮手/炮闩 +0.1，maxStacks 2）、rare `mod_loader_ammo_crit`（装填手/弹药 +0.1，maxStacks 2）、epic `mod_motion_stabilizer`（×0.9，maxStacks 3）） |
| 局外永久商店 | 7 项：`shell_speed_up`（+30/级）/ `engine_power_up`（+60/级）/ `turn_up`（+0.08/级）/ `turret_turn_up`（+0.08/级）/ `aim_speed_up`（+0.02/级，均为 maxLevel 5）/ `fire_control_crit` / `loader_ammo_crit`（+0.05/级 ×5 叠满达 0.25 钳帽） |
| 局内商店 | 3 项：`shell_velocity`（shellSpeed +40/级）/ `turret_traverse`（turretTurnRate +0.1/级）/ `track_field_kit`（trackLock −0.5s/级，`limit.min: 5` 拒购防线）——总数 12 → **15**（火力 6 / 防护 2 / 机动 4 / 杂项 3） |

回归：`scripts/test-economy.js`（新增定义完整性 + 上限判定 + `applyUpgrades` 真实生效断言）/ `scripts/test-card-effects.js`（169 张全卡逐卡验证）/ `scripts/validate-content.js`（卡面数字一致性）。

## 11. 局内卡牌查看器（2026-10-17 #U23，现行口径）

- **入口**：`C` 键随时开关（战斗 / 暂停 / 结算 / 奖励屏均可），与 Tab 状态面板、`` ` `` 开发者面板**互斥**（打开其一即收起其它）。键位登记于 `js/tank_bindings.js` 的 `panelCards`（含 `ACTION_INFO` / `ACTION_ORDER`）。
- **内容**：列出**本局已持有的卡牌**——名称 ×数量、稀有度中文标签、标签、描述；分类维度三选一：**稀有度**（按 `CARD_RARITIES` 降序分组）/ **标签**（按 `CARD_TAGS` 分组，多标签卡在各组各出现一次）/ **全部**（平铺）。
- **数据源**：`player.cardEffects`（本局实际生效的卡，权威）+ `cardPool`（静态卡表取名/描述/稀有度）；不使用存档类数据，故不会显示未获得的卡。
- **稀有度中文标签**：单一常量 `CARD_RARITY_LABELS`（`tank_mvp.html`），替换原先在两处函数内各写一份的字面量。
