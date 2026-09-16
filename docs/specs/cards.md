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

## 3. 六大效果类型 (type 决定 params)
1. **modifier**：{stat, mode:'add'|'mult', value}——stat 白名单（穿透/伤害/装填/弹速/极速/转向/炮塔转速/装甲路径 armor.hull.front 等）或履带锁/模块倍率/DOT倍率/散布。立即生效（走 addModifier 管道，§5.1 三层属性系统）。
   - **运行时参数硬限（2026-09-15 W5 用户裁定）**：卡牌 modifiers 聚合后受 `RULES.parameterLimits` 两张硬限钳制——装填 **reload ≥ 0.5s/发**（加速装填卡不得突破下限）、极速 **maxSpeed ≤ 150km/h（375px/s）**（超速卡不得突破上限）；实现于 `js/tank_model.js` `applyParameterLimits(s, modifiers)`（computeStats 尾部，仅 modifiers 非空时生效，空修饰器出厂/纯计算不钳）。火控系另有既有钳制（spreadMult/motionSpreadMul ≥ multFloor、crit ≤ critBonusCap）。消费链 `applyCardEffects`→`addModifier`→`refreshStats`→`computeStats` 天然接入，商店另有 `runShopLimitBlocked` 购买拦截（§8.3）。回归见 `scripts/test-rework-w5.js`。
2. **ammo**：弹种改造或弹种替换（完整弹种键与升级总表见 `docs/PLAN.md` §5.2 与 `js/tank_rules.js` 的 `RULES.ammoTypes` / `RULES.ammoChain`）。
   - 弹种属性改造：`{key, field:'pen'|'dmg'|'speed', mode:'mult'|'add', value}`，其中 `key` 支持现有体系下的有效弹种键。
   - 弹种升级替换：`{type:'ammo', key, replaceAmmo?}`。`replaceAmmo` 为直系前驱弹种（显式）；省略时按 `RULES.ammoChain[key]` 推断。替换前提：**前驱必须在 loadout 中**（`replaceAmmo`/`CHAIN[key]` ∈ ammoLoadout），否则视为跳级—拒绝变更；HE 线 `he→(heat|aphe)` 首张时「先新增」（保留 he，占第 3 槽）、其后再抽则「替换 he 槽」。KE/HEAT 链皆在前驱槽位原位替换，`ammoKey` 同步。详见 `docs/ISSUES.md#A26`（3 链语义）。
   - **mode:'mult'**：对 RULES 基准倍率做乘算聚合。
   - **mode:'add' = 乘算后毫米追加**（2026-08-26，原 ISSUES #A13 修复定案）：最终属性 = base × mult聚合 + Σadd，value 按**字段自然单位**计——pen=mm / dmg=伤害值 / speed=px/s（如「APCR穿深+14mm」即最终穿深加 14mm，而非倍率刻度 +14）。
   - `computeAmmoConfig` 将 Σadd 输出为独立的 `fieldAdd` 字段存放，由消费方（fireTank/computeAmmoConfig 合成端）在乘算聚合之后合成，杜绝把 mm 追加混入倍率刻度。
   - 软上限 `ammoTypeCap` 作用于**最终等效值**且仅钳 HE（AP/APCR/HEAT 不受限）。（接入点见 `js/tank_rules.js` 的 `RULES.ammoTypeCap`）
3. **ability**：主动装置 {key:'smoke'|'artillery'|'shield'|'overdrive'}（按键触发，P-17 接入 G/H/V）。
4. **passive**：机制性被动 {key:'reactive_armor'|'angle_boost'|'overmatch'|'spall_liner'|'commander_sight', value?}。
5. **drone**：伴随浮游炮 {kind:'scout'|'striker'}（§2.2 已定型，countMax=2 上限）。
6. **economy**：{field:'scoreMul'|'shopDiscount'|'startScore'|'reviveCount', value}（运行时消费待接线）。

## 4. 稀有度分层与流派
- CARD_RARITIES：common / rare / epic / legendary 四档。
- CARD_TAGS 流派标签：重甲/机动/狙击/支援等，供 drawCardChoices 构筑导向抽卡。
- 当前分布（2026-08-22 审计）：common 47.8% / rare 31.3% / epic 15.7% / legendary 5.2%，115 张卡全量通过 --strict 零警告。
- 效果类型分布：modifier 101 / ammo 17 / ability 11 / passive 8 / economy 5 / drone 2。

## 5. 堆叠与验证工具链
- maxStacks：同卡最大持有数，cardStackCount 计数，选择阶段硬性截断。
- validate-content.js：逐卡 schema 校验。
- audit-content.js --strict：稀有度/流派/效果分布常态化审计（偏差 <3% 视为统计波动）。
- test-card-effects.js：442 断言 115 张卡全链路执行验证。
- **P-42 扩展审计维度（2026-08-28，audit-content.js）**：新增四个报告型维度——① 流派×稀有度覆盖率；② 流派→效果类型构成；③ 同稀有度强度曲线（`multDev = Σ|mult值−1|`，仅统计 mult 效果，passive/ability/economy/add 单独列出以避量纲混淆；含离群警示 + 跨档单调性检查，仅在高稀有度含 ≥3 张 mult 卡时比较防假失衡）；④ tag 组合矩阵 + `heat_*`/`he_*`/`demo_*` 定点交叉对比表。
- **P-42 首轮审计结论（2026-08-28）**：修正单调性检查后无 red 级 mult 失衡（0 警告）；唯一可观测缺口为**内容覆盖**——HEAT 弹种仅 3 张卡（heat_composite_pen/heat_overpressure common、heat_precision rare），无 epic/legendary 档，明显薄于 HE/AP/APCR；属 card-author 补卡范畴（内容前置），非数值调优，暂缓。

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
| 射速 reload | ×0.93 | ×0.87 | ×0.80 | ×0.72（仍受 0.5s 地板钳制） |
| 精度 aimSpeed | +15% | +25% | +40% | +60% + 静止首发 σ×0.6 |
| 三扩（motion/hullRot/turretRot 分卡） | 单项 −15% | 单项 −22% | 单项 −30% | 三项全 −25% |
| 马力 enginePower | +15% | +25% | +35% | +35% 且 maxSpeed +10% |

- 全部复用 `addModifier` 管道 scope='run'；装甲 add 沿用 `armor.hull.front` 等白名单路径。
- weight 联动为拟真 trade-off 杠杆：马力/血量线搭 weight +x%。
- 已生成 `cards/hull_hp_boost_1~4` / `hull_armor_front_1~2` / `hull_armor_all_3` / `reload_speed_1~4` / `aim_speed_1~4` / `engine_power_1~4`。

### 8.3 机制卡定案 ✅ Schema 已实现 + 阶段七运行时与卡牌已落地（2026-09-13）
- **主武器双管**（2026-09-15 W4 重做，`WEAPON_DEFAULTS.double_barrel`: reloadMult ×1.0/管, count 2, switchSeconds 0.5, barrelOffset 0.9）：
  - epic 安装卡：primary → double_barrel（`cards/weapon_primary_double_barrel`）——炮盾并排 2 炮管渲染（`tank_battledraw.js`，偏移与弹道横向偏移同源），每管独立装填 ×1.0，单击发射 1 根已装填管，空格齐射全部就绪管，换管 0.5s；
  - rare「同步击发」：switchSeconds 0.5→0.1（`cards/weapon_primary_sync_fire`）；
  - legendary「交替装填」：单管装填 reloadMult ×1.0→×0.8（`cards/weapon_primary_alt_reload`）；
  - **autocannon 线（2026-09-15 W6 用户裁定重做）**：epic 安装卡 `weapon_primary_autocannon`——伤害=标准 1/5（damageMult 0.2）、穿深=标准 85%（penMult 0.85，弹种系数机制不变）、射击间隔=装填时间×0.25（reloadMult 0.25）；热量机制：每发 +heatPerShot 10%、每秒冷却 coolPerSec 15%、≥heatMax 100% 过热并锁定 overheatLock 2s（`updatePrimaryHeat` 逐帧驱动冷却，`fireTank` 门控过热期开火；旧 burst 连发路径整体删除）；外观：炮管更细（barrelWidthMult 0.6）略短（barrelLenMult 0.8）、不绘护套/制退器/抽烟器、炮口特效与弹体随 fxScale 0.55 缩小（`tank_battledraw.js` 消费）；玩家装填环改热量表（绿 <50% / 黄 50–<100% / 红 ≥100%，锁定红色闪烁）；
  - rare「机炮散热强化」：coolPerSec 15→22（`cards/weapon_primary_burst_tune` 改语义，id 不变保卡池计数）；
  - 主武器运行时（`fireTank` 消费倍率；双管走 `fireDoubleBarrel`/`updatePrimaryBarrels` 状态机——`_dbState{ready[],reloadT[]}` 每管独立装填，旧 stagger/count 连发路径已删除；autocannon 改逐发短间隔 + 热量机制 `updatePrimaryHeat`，burst 连发已删除）2026-09-15 W4/W6 已落地（DEVELOPMENT.md §4.15）。
- **曲射**：mortar aoe 90→120 / reload 8→6.5 分两卡。**2026-09-14 定案**：独立 HEC 弹种已移除（`RULES.ammoTypes` 删 `hec`、`cards/hec_curvature_shell.json` 删除）。**2026-09-15 用户裁定：主武器曲射机制移除**——`weapon_primary_howitzer` 卡与 `WEAPON_DEFAULTS.primary.howitzer` 删除、`RULES.weaponTypes.primary`/`WEAPON_PRIMARY_TYPES` 白名单同步剔除，主炮一律平射直线弹道（firePrimaryShell 的 isArc 落点块删除，stepShells isArc 分支仅服务副武器迫击炮弹）；曲射/越障由**副武器层**承担：mortar 弹药 `ignoreCover:true` + `isArc` 落点（见 §8.3 副武器安装与 DEVELOPMENT.md §4.13）。HE 系链上代表升级卡为 `cards/ammo_upgrade_blast_he`（**终结点**，前驱 `proximity_he`，HE-OP 超压榴弹，溅射向）。
- **弹药升级**：走现有 `ammo` effect 通道（mult 聚合 + mm 追加 + `ammoTypeCap` 软上限 dmg 2.5 / pen 1.8 / speed 2.0），只补内容梯度不改机制。
- **副武器安装/升级（效果类型 `weapon`，2026-09-15 #A22/#A23 定型）**：`{type:'weapon', action:'install'|'upgrade', slot:'primary'|'secondary', weaponType, statOverrides}` —— **`action` 必填**（validateCardEffect 强制）。`install`（epic 安装卡）：primary 换装写入 `weapons.primary.type` + 合并 overrides 并清 `_spec`/`_dbState`；secondary **仅空槽**写入（默认值+overrides 合并），槽已占则 no-op（effect 仍入 `cardEffects`）。`upgrade`（rare/legendary 升级卡）：**仅当同型已持有**时合并 `statOverrides`，否则 no-op。**副武器单槽不变量**（无 `secondarySlots`/`activeSecondaryIndex`）。**抽卡资格**：`cardEligible(card, owned)` 在可用池阶段过滤——install(primary)=未持有该型 / install(secondary)=槽空 / upgrade=已持有同型 / `owned.cards` 达 `maxStacks` 则排除；`owned = {abilities, primaryWeapon, secondaryWeapon, cards?}`。运行时 `updateSecondaryWeapon`（mortar 曲射/missile 制导/rocket 扇形/mine_layer 布雷 + turret 副炮塔）阶段七 7.2 已落地；玩家侧手动击发见 combat.md §4。
- **武器升级卡数值梯度（PLAN §8.1.1 复核，2026-09-15）**：副武器 4 张 rare 升级卡 DPS 增益 mortar 1.333×（reload 6）/ missile 1.524× / rocket 1.389×（count 5、reload 9）/ mine 1.500×，统一带 `[1.25,1.60]`；`scripts/test-weapon-upgrade-balance.js` 锁定。

### 8.4 技能卡定案（锚定现有 RULES.abilities 参数）✅ 已实现（阶段七 7.1 补进阶升级卡）
| 技能 | 升级梯度 |
|---|---|
| 召唤炮击 artillery | rare：shellCount 3→5；epic：radius 110→140；legendary：reload 15→10 |
| 空袭·定点（artillery 升级形态） | legendary：delay 2.5→1.5s、radius 110→60、单发 dmgMult ×1.2→×3.0、shape:'point' |
| 空袭·地毯（artillery 升级形态） | legendary：delay 2.5→3.5s、沿炮塔朝向矩形 240×80、8 发 dmgMult ×1.0、shape:'carpet' |
| 伴随无人机 drone | rare：striker dmgMult 0.4→0.55；epic：fireInterval 2.0→1.6 + countMax 2→3 |
| 烟雾 smoke | rare：radius 120→150 + duration 5→8；epic：烟内 AI 视线遮断（隐身圈） |
| 布设掩体 deploy_cover | epic：沙袋/护盾 OBB hp 200、cd 20s —— 接 R-2 deployables（战术护盾掩体已有运行时） |

- **params 覆写通道（阶段七 7.1 已落地）**：`ability` 效果支持可选 `params` 对象，`tank_abilities.js` `computeAbilityConfig(t, key)` 聚合 `RULES.abilities` 基础 + `cardEffects` 覆写；`tryActivateAbility` 全分支消费聚合参数。已生成进阶卡：`ability_artillery_barrage` / `ability_artillery_heavy` / `ability_artillery_strike_point` / `ability_artillery_strike_carpet` / `ability_smoke_dense` / `ability_deploy_cover_fortified`（DEVELOPMENT.md §4.11）。
- 空袭实现集中在 `tank_strike.js` 落点分布函数（point/carpet 两形状）+ artillery 参数卡改写语义（ability 效果 params 覆写通道）。
- `callStrike` 已支持 `shape:'circle'|'point'|'carpet'`；`deploy_cover` 已入 `RULES.abilities`（hp 200 / shieldHp 150 / duration 30 / cooldown 20）与 `tank_abilities.js` 运行时键白名单，已生成 `cards/ability_deploy_cover`。

- **ability 升级卡的持有资格 `requiresAbility`（#A28，2026-09-16 定型）**：`{type:'ability', key, requiresAbility?, params?}` —— `requiresAbility` 可选，**值恒等于自身 `key`**（ability 的「升级」语义 = 同一 key 的 `params` 覆写，经 `computeAbilityConfig` 按 key 聚合；故不引入 weapon 那样的 `action` 字段）。语义由 `cardEligible` 消费：`requiresAbility` 存在且不在 `owned.abilities` 中 → 该卡抽取期不合格。**`validateCardEffect` 显式校验**（必须是 `ABILITY_KEYS` 内的字符串，缺省合法）——拼写错误会让资格过滤静默失效。
  - **已标记（5 张升级卡，均为 `params` 覆写卡）**：`ability_artillery_barrage` / `ability_artillery_heavy` / `ability_artillery_strike_point` / `ability_artillery_strike_carpet`（`requiresAbility:'artillery'`）、`ability_deploy_cover_fortified`（`requiresAbility:'deploy_cover'`）。
  - **不得标记（11 张基础/安装卡，死锁防线）**：`artillery_strike` / `tactical_shield` / `super_reload` / `ability_deploy_cover` / `mobile_track_repair` / `support_track_repair` / `emergency_track` / `support_recon` / `sniper_recon_mark` / `repair_kit` / `support_extinguisher`。**通用不变量**（`test-cards.js` 守门）：每个出现过的 ability key 至少有一张未标记卡作为获取途径；否则该能力永远无法获得。`repair`/`extinguish` 属 `ABILITY_KEYS_INNATE`（开局自带、绕过持有检查），其卡不受影响。
  - **语义闭环**：`applyCardEffects` 非 modifier 分支 `Object.assign({}, ef, {cardId})` 保留 `ef.key` → 基础卡 key 落入 `player.cardEffects` → mvp `drawRewardCards` 组装 `owned.abilities` → 同 key 升级卡转为合格。
  - **保底路径**：资格过滤在 small-pool early-return 与保底**之前**执行，保底只在已过滤的 `usable` 上取卡，**不复活**不合格升级卡；池内只剩升级卡时宁缺毋滥。
  - **实况注意**：传奇档位池的 2 张 ability 卡（point/carpet）**全为升级卡** → 未持 `artillery` 者在该池抽不到能力卡（正确行为：artillery 基础卡在 common/rare/epic 池）。作者经 `tools/content_designer.html` 编辑能力卡时须保留 `params`/`requiresAbility`（该编辑器已补全三字段往返）。

### 8.5 技能卡总表（#A28 分类：base=可独立获取 / upgrade=需先持有同 key）
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
| `emergency_track` | track_repair | base | — |
| `mobile_track_repair` | track_repair | base | — |
| `support_track_repair` | track_repair | base | — |
| `support_recon` | recon | base | — |
| `sniper_recon_mark` | recon | base | — |
| `repair_kit` | repair（innate） | base | — |
| `support_extinguisher` | extinguish（innate） | base | — |

## 9. 装备优先抽卡（2026-09-14 用户定案）
- **动机**：玩家没有任何主动技能 / 副武器未安装时，候选卡若全是"升级类"会语义莫名其妙（升级谁？）。抽卡必须先提供**装备卡**。
- **规则**（`tank_cards.js` `drawCardChoices(pool, n, { rng, ammoLoadout, owned })`）：
  - `owned = { abilities: string[], primaryWeapon: string, secondaryWeapon: string, cards?: {[id]:count} }` —— 玩家当前持有的主动技能 key 列表、主/副武器类型与已拥卡计数（mvp `drawRewardCards` 从 `player.cardEffects`（type 'ability' 去重 key）、`player.weapons.primary/secondary.type` 与 `cardStackCount` 组装传入；无则空数组 / 'standard' / 'none'）。
  - **资格过滤先行**（#A23 / #A28）：`cardEligible` 在可用池阶段剔除「未持有所需武器的 upgrade 卡 / 槽已占的 secondary install 卡 / **未持有 `requiresAbility` 所指能力的 ability 升级卡** / 已叠满 maxStacks 的卡」，**在小池 early-return 与保底之前执行**；普通轮、刷新、Boss 追加轮复用同一规则。
  - `abilities` 为空且池内有 `type:'ability'` 卡 → **保底抽取 1 张** ability 卡；
  - `secondaryWeapon` 为 none/缺省且池内有 `type:'weapon' && slot==='secondary'` 卡 → **保底抽取 1 张**副武器安装卡；
  - 剩余槽位按稀有度权重从其余可用卡抽样（`weightedRarity`）。保底不足时不改变抽取上限（`picked.length < count` 守卫）。
- **实现注记**：`abilityIdxs`/`weaponIdxs` 在 ability 卡 splice 之后静态下标会错位（误把被动卡当武器卡抽）——改为 `firstIdxWhere` 动态求值（每次 splice 后重查），`test-cards.js` 装备优先四态断言捕获验证。
