# 战术坦克 Roguelike — 战斗与物理系统规范 (Combat & Physics Spec)

> 权威子文档：由主文档 docs/DEVELOPMENT.md 索引。
> 涉及模块：js/tank_rules.js, js/tank_physics.js, js/tank_fire.js, js/tank_geometry.js, js/tank_abilities.js, js/tank_weapons.js, js/tank_shield.js, js/tank_strike.js, js/tank_drone.js, js/tank_audio.js, js/tank_fx.js

---

## 0. 主题索引（按问题查，不按章节序读）

> ⚠️ **本卷收录了大量历史批次章节（§5.1、§8~§13）。章节号按时间追加，不代表主题分组**——同一主题常散落在多节（`装填` 横跨 §3.1/§8.5/§9.1/§9.7/§13.4 等）。
> **查现行口径请用本索引**：每行给出「该主题的现行口径在哪几节」与「只是来源沿革、不必读的节」。
> 本卷章节号被外部文档直接引用——**2026-10-21 实测 251 处**（docs 侧 231：`DEVELOPMENT*.md`、`ARCHIVE.md`、`archive/*`、其它 specs 卷；代码与流程侧 20：`AGENTS.md`、`.dsh/skills/role-*`、`js/*.js` 注释、`scripts/`），故**编号保持稳定、不做重排**；本索引是唯一的「按主题导航」入口。索引归属已于 2026-10-21 逐条核对各节实际内容。

| 我想查…… | 现行口径（先看这里） | 来源沿革（不必读） |
|---|---|---|
| 装甲 / 等效厚度 / 跳弹 / 摆角特训 / 模块与成员伤害 / debuff | **§2** | §5.1（早期装甲/掩体条目，多数已废）、§13.1（敌军固定基准里的装甲取值） |
| 弹种数值：穿深 / 伤害 / 弹速 / 溅射半径 / 跳弹角 / 精度 / 未击穿 | **§3.2 总表（唯一数值口径）** | §3.3（平衡回归）、§9.2（`statOverrides` 语义） |
| 弹种升级链 / 调校效果与升级效果的分界 | **§3.1** | §9.2、`specs/cards.md` §3 |
| 曲射 / 榴弹炮 / 越障 | **§3.2b + §3.2c** | §8.2（F 键语义）、§6.1（弹体俯仰视效） |
| 装填时长 / 装填环 / 参数硬限 | **§9.7（时长公式）+ §3.1（`parameterLimits` 硬限）+ §6（环绘制）** | §8.5（双联流水线，仅双联）、§9.1（弹夹两段式，仅弹夹）、§13.4（敌军 `entityMults.reload`） |
| 主动技能本体（炮击 / 护盾 / 超装填 / 战术掩体 / APS / 冷却池） | **§4 + §9.4** | §9.5（Boss 召唤保底）、§11.2（删 V 专属键） |
| 技能槽指派 / 数字键映射 / 槽满顶替 | **§13.2 + §4 首段** | §11.2（V 键沿革） |
| 副武器本体（F 键语义 / 导弹 / 线导 / 火箭 / 副炮塔 / 榴弹炮槽） | **§4 + §8.2** | §8.5（双联主炮，非副武器） |
| 布雷 / 地雷（数量上限、雷场形状、触发与装填门控） | **§8.1（数值唯一口径）** | §13.3（雷场路径门控修复）、§13.6（`mineMax` 3→6 的动机与沿革） |
| 无人机（scout / striker） | **§4 无人机体系** | §5.1（striker 早期描述） |
| 敌方 AI：触发 / 警觉 / 反应延迟 / 接战传播 | **§5 + §8.3** | §5.1 |
| 敌方 AI：接战机动 / 交战结构 / 侧翼 / 分离力 | **§13.7 + §13.8** | §5.1 |
| 敌人数值 / 难度乘子 / 固定基准 | **§13.1（基准 + 封顶键）+ §13.4（`entityMults` 区间）** | §5「难度全面分化」段（仅机制表述）、§11.5 |
| Boss 激光 / 召唤 / 随机走位 | **§11.3 + §12.1 + §12.2 + §12.3** | §9.5（#G1 乘数方案，已废） |
| Boss 血量 / 难度缩放 | 归口 **`specs/boss.md` §5** | §13.4（`entityMults.maxHp` 与 `hpMul` 两级叠加） |
| 特效 / 视效 / 伤害飘字 / 开火后坐 | **§6 + §6.1** | §8.5（双联视效）、§12.2（Boss 激光截断绘制） |
| 音频 / 音效 | **§7 + §7.1** | — |
| 视野 / 可见距离 | **§13.5（系统已退役，只剩 `aabbInView` 视口剔除）** | §10 全节、§11.1、§11.4、§11.5 —— **全部作废，仅沿革** |
| 镜头外延（摄像机随鼠标） | **§8.7** | §11.5（视野卡几何，作废） |
| HUD / UI（底部三区 / 装填环 / 技能槽 / 伤害飘字 / Boss 血条） | **§9.6 + §9.8 + §6** | §2（模块状态条）、§13.2（技能槽语义） |
| 掩体 / 地形 / 岩石碰撞 / 移速受限 | **§13.9** + `specs/map.md`（tier 取值以 `RULES.coverTiers` 为准） | §5.1（半高掩体，2026-09-20 已整体删除） |
| 卡牌与战斗的交界（稀有度 / 硬限 / 武器安装与规格通道） | §8.6（神话档）、§8.6b（标准主炮规格通道）、§3.1（硬限） | `specs/cards.md` |
| 武器本体（主炮五型 / 副武器五类 / `statOverrides`） | **§9.1 + §9.2 + §9.3 + §8.6b**；数值以 `WEAPON_DEFAULTS` 为准 | §8.5（双联）、§3.2b（榴弹炮模式） |
| 游戏模式（Boss 战 / 生存战） | **§14** | — |

> **用法示例**：想查「装填」→ 直接读 §9.7（时长公式）+ §3.1（硬限）+ §6（装填环），共 3 节；§8.5/§9.1/§13.4 只在你要改双联、弹夹或敌军难度时才需要看。

---

## 1. 战斗立意与物理核心
- **慢节奏、强博弈、拟真物理**：摆角度找跳弹角、找掩体、抢位置，拒绝魔幻特效和高频输出。
- **实时弹道与发射解算**：炮弹按真实物理速度逐帧推进（js/tank_fire.js 的 stepShells），碰撞在命中瞬间判决，支持提前量与动态掩体拦截。

## 2. 装甲与跳弹机制 (Armor & Ricochet)
- **跳弹判定**：各弹种独立跳弹角（per-ammo `ammoBounceAngle`；θ>该值跳弹，90°=不可能跳弹，noBounce 弹种完全不跳弹），**逐弹种角度数值见 §3.2 弹种总表（唯一口径），本节不重复罗列**；跳弹沿法线方向真物理反射。（早期全局 `RULES.ballistics.bounceAngle`=70° 仅为 AP 基准沿革，已废除。）
- **二次跳弹禁止**：跳弹后的炮弹标记 canBounce = false，再次命中不再发生二次反射。
- **被动卡对装甲判定的两个修正（2026-10-16 #U19 实现，现行口径）**：
  - **`angle_boost`（摆角特训）**：`passiveValues` 求和后**加算到跳弹角** `bAngle = min(π/2, bAngle + Σ×π/180)`，即卡面「+5°」直接抬高跳弹门限（上限 90°＝不可能跳弹）。实测跳弹边界由 70° 抬至 75°，与卡面一致。
  - **`reactive_armor`（应急护盾，2026-10-19 #W-G 用户裁定改版）**：**不再是命中驱动的拦截**。现行机制为「**HP 比例低于 10% 时自动生成 1 个持续 10s 的护盾**（吸收 150 点），冷却 90s、卡牌升级可缩到最少 60s」。因此 `resolveHit` 中**已不存在该被动的任何分支**（旧的一次性拦截 + #U40 的再充能拦截均已移除）。现行消费点：① 触发判定与生成在 `tank_mvp.html` 主循环（逐帧读 `player.hp/maxHp` → `applyShield`）；② 护盾吸收走 `js/tank_shield.js` 的 `hasShield`/`absorbDamage`（与战术护盾同一套）；③ 冷却时长与递减见 `js/tank_cards.js` 的 `emergencyShieldCooldown`/`updateEmergencyShieldRearm`；④ 参数唯一口径 `RULES.cards.emergencyShield`。
- **等效厚度计算**：等效厚度 = 实际装甲厚度 / cos(入射角)。
- **resolveHit 可选增益 opts（P-51）**：`resolveHit(s,target,hit,allowBounce,opts)` 新增可选 opts `{penAdd,dmgMul,ignoreBounce}`——penAdd 在穿透判定前加算；ignoreBounce 跳过跳弹与过陡 BLOCK；dmgMul 最终伤害乘算并传入 applyModuleDamage；不传 opts 行为不变。mvp 包装层对敌方 Boss 弱点命中（isWeakspotHit + moduleFromHit 匹配 RULES.boss.weakspot）注入 dmgMul:1.5 / penAdd:15 / ignoreBounce:true。
- **弹药架与模块**（2026-08-26 P-49 定案：几何概率分区判定，废除自定义挂载）：
  - 模块七类：driver / ammo / engine / gunner / loader / commander / **breech 炮闩**。命中不再依赖挂载数据，改为**几何分区 + 区内互斥概率抽取**，只判击穿点所在区间。
  - **炮塔四象限**（以炮塔几何中心为原点、随炮塔旋转）：左前{炮手 50% / 炮闩 5%}；右前{车长 30% / 装填手 30% / 炮闩 5%}；左后、右后{弹药架各 50%}。
  - **车体纵轴区段**：以座圈圆心 p 与车体几何中心 c 判定前置/后置构型——前置构型 [0,.1){驾驶员 10% / 弹药 10%} / [.1,.5){弹药 50%} / [.5,1]{发动机 40%}；后置构型 [0,.5){发动机 40%} / [.5,.6){驾驶员 5% / 弹药 50%} / [.6,1]{弹药 40%}（区间均为纵轴归一化坐标）。
  - **区内互斥抽取**：同一区间内按上述概率抽取一个模块命中；抽取落空/无对应模块的余量 = 正常结算伤害、无加成。
  - **breech 炮闩效果**：命中 → 8s 完全无法开火（修理箱可清除）。
  - 弹药架命中伤害按弹种 `ammoRackMult`（逐弹种倍率见 §3.2 总表）；致死命中触发掀飞炮塔（"飞头"殉爆 spawnAmmoBlowFx）；未致死施加 8s 装填 debuff。
  - 发动机命中引发起火 DOT（dps = 攻击方标准伤害 × `RULES.fire.dotRatio`，持续 `RULES.fire.dotSeconds`=5s，速度惩罚 speedMul 0.5），并施加机动 debuff。
  - 履带命中 → trackBroken + immobT=8s 锁定。
  - 车长命中 → 全体乘员效果 ×0.85。
  - **修理箱/医疗包回血与随时可用（2026-09-08，优化落地）**：
    - **移除损伤门控**：删除了 `_tryActivateInnate` 中针对受损/受伤状态的前置判定门控。修理箱与医疗包现在在任何状态下均可激活。
    - **增加回血效果**：成功使用修理箱或医疗包时，立即恢复坦克 10% 的最大耐久值（`t.hp = Math.min(maxHp, t.hp + maxHp * 0.10)`）。
    - 修理/移除 debuff 的核心语义保持不变。
  - **innate 冷却的注入与回写（2026-10-17 #U29，现行口径）**：修理箱/医疗包有效冷却的唯一消费值是 `player.abilityBaseCd[key]`（`js/tank_abilities.js innateBaseCd`），其值 = `45 − 永久级数 − 局内 cdReduce`（下限 15，`tank_mvp.html effectiveKitCd`）。**任何改变账本的路径都必须回写 `abilityBaseCd`**——出击时 `prepPlayerForRun` 注入，局内商店 `cdReduce` 购买时经 `_syncKitCd()` 重算。只改 `runKitCdBonus` 账本不回写 = 升级无效（#U29 原缺陷）。
- **自动灭火器（innate，2026-09-17 #C6 修复定案）**：前置判定**改读真实起火状态 `dotT > 0`**（发动机起火链路写入 dotT/dotDps/dotSeconds/fireT/debuffs.engine，见 resolveHit engine 分支；旧判定读 `fireDebuffT`，但该字段生产代码无任何写入路径——灭火器恒 'no-fire' 死功能）。激活成功：清 dotT/dotDps/dotSeconds/**fireT** 与 **debuffs.engine**（用户裁定连带清除；发动机模块损伤本体仍属修理箱范围）。冷却走独立池 `abilityCds.extinguish`（基础 45s，商店 cdReduce 注入 `abilityBaseCd`）；手动 6 键保留 + **mvp 主循环起火期间自动触发**（每帧尝试、冷却中静默拒绝不刷日志）。字段 `fireDebuffT` 维持现状（仍为死字段，AI stun 分支/起火散布加成未复活——后续清理）。
- **防崩落内衬 passive spall_liner 生效（2026-08-26，原 ISSUES #A15 修复定案）**：`tank_physics.js` 经 `passiveValues(target,'spall_liner')` 取多来源最小值 `spallMul`，在 `applyModuleDamage` 乘入最终模块/乘员伤害；多张卡取最强（最小乘子）语义。活浏览器实测 `giveCard('support_spall_liner')` 后敌方 PEN 伤害均值降至无内衬 0.7981 倍（预期 0.8），epic 卡 `spall_liner.json` 当前 value 0.85。
- **散布下限防负值（2026-08-26，原 ISSUES #A2 修复定案）**：`RULES.spread.multFloor=0.2` 对 spreadMult 加法聚合结果钳下限 + `sigmaFloor` σ 地板；局内商店姿态稳定恢复 maxLevel 判定（applyRunShopPurchase），满级购买按钮禁用置灰。
- **双管炮口横向偏移（2026-10-17 #U25，现行口径）**：`fireDoubleBarrel` 与绘制层（`tank_battledraw.js`）**必须同源**——`barrelWid(px) = max(3, turWid × barrel.width% × 0.5)`，管中心偏移 = `barrelWid × barrelOffset(1.85) × 0.5`。`barrel.width` 是**百分比**字段（典型 18），禁止直接当像素用（旧缺陷：偏移放大 6 倍，弹道出发点明显偏离炮管）。
- **运动散布与精度基准解耦（2026-08-26，原 ISSUES #A1 修复定案）**：新增独立 stat `motionSpreadMul`（运动三源专用系数）——computeStats 默认继承出厂 `base.spreadMult`（保留设计器对底盘运动散布的标定）并钳 ≥ `spread.multFloor`；motionSigma 消费 `stats.motionSpreadMul ?? stats.spreadMult`（旧运行时快照无该键时回退，向后兼容）。运行期 spreadMult 修饰器（精密火控/卡牌）不再影响运动散布；局内商店姿态稳定改挂 `motionSpreadMul` mult ×0.85（maxLevel 1）。
- **成员/模块受损状态条（2026-08-28，原 ISSUES #A5 修复定案）**：`tank_mvp.html` 顶部中央新增 `#moduleStatus` 状态条（`updateModuleStatus()` 每帧刷新，挂入 `updateHud()`）——读 `player.debuffs`（gunner/loader/driver/commander/engine/ammo/breech 各键，经 `MODULE_LABELS` 译中文标签 + 剩余秒数药丸）与 `player.trackBroken`/`immobT`（履带断裂），无受伤时整体隐藏。纯视觉 HUD，无共享模块/测试链改动；`npm run check` + `test:browser` 全绿（mvp 无 console/page 错误）。
- **局内商店可升级次数由具体数值决定（2026-08-28 定案，取代写死 maxLevel）**：有自然数值边界的商品改为按 `RULES.parameterLimits` 动态判定达限，而非需求出生时写死整数上限（因局内卡牌经 addModifier 也会改 reload/spreadMult/motionSpreadMul/装甲值，会改变真实可升级空间）。`runShopLimitBlocked(def, curVal, stats)` 三分支：① `def.limit` 存在（fast_reload / engine_overdrive / precision_gunnery / steady_mount）走显式单键判定；② `def.limit` 缺失但多条 effects（多面打包装甲包 hull/turret × front/side/rear）逐面按点分路径 `parameterLimits.armor.*` 推导达限，**读 `stats` 对象各面真实现值**（非 UI 传入的单一 curVal），任一穿越边界即 true；③ 无边界/缺省容错返回 false（放行）。`motionSpreadMul` 边界已纳入 `parameterLimits`（与 `spreadMult` 同区间，逐键数值见 §3.1「卡牌通道运行时硬限」，本节不重复罗列）；商品 `maxLevel` 统一 99 作防御性兜底，`computeStats` 的 `multFloor` 物理钳底不动。测试：test-economy 新增装甲包逐面达限/precision_gunnery 数值驱动/steady_mount 边界对齐断言（164 条全绿）。
  - **达限/满级按钮文案（2026-10-17 #U17/#U10，现行口径）**：局内商店按钮文字三级优先——① 属性达限 → `def.limitLabel`（如精密火控「已达静止三扩下限」、姿态稳定「已达运动三扩下限」）；② `lv >= maxLevel` → 「已满级」（**无 `stat`/`effects` 的等级制升级**，如 `repair_kit_cd`/`medkit_cd`，此前只禁用按钮、文字仍是价格）；③ 其余 → 价格。**通道语义**：`precision_gunnery` 降 `spreadMult`（静止/瞄准散布）、`steady_mount` 降 `motionSpreadMul`（行进/转向扩圈），两者正交互不叠加，desc 与达限文案均点明所属通道。

## 3. 弹种系统 (Ammo Types)
唯一数据源：`RULES.ammoTypes`（`js/tank_rules.js`，机制参数唯一配置源）。逐弹种数值（穿深/伤害/弹速/弹药架与模块倍率/跳弹角/精度系数/未击穿）**以 §3.2 数值总表为唯一口径**，本节不再重复罗列；升级链见 §3.1，平衡回归见 §3.3。

- **HE 机制细节**（总表之外的行为差异，唯一需单列的弹种）：击穿与未击穿均触发范围溅射（半径取 §3.2 总表的 `splashRadius`，贴脸 50% → 边缘衰减到 0）；未击穿走残余爆轰分支（地板 25%，公式见 §3.2）。HE 破障（A3）：HE 弹销毁时对落点半径内可破坏掩体造成 **1 点**独立破坏伤（半径 `RULES.breach.heSplashRadius` = 24px，与坦克溅射两套并存）——**对单个元素恒 1 点，无"伤害倍率"概念**：`RULES.breach` 现仅含 `heSplashRadius` 一个键，~~`RULES.breach.heCoverDmg`~~ 因零消费已于 2026-10-20 #W15 删除（详见 `specs/map.md` §27.6 死配置清单）。特效对齐约定：爆轰视觉特效半径与逻辑 splashRadius 严格一致，杜绝视觉误导。
- **命名规范**：升级演进弹种（APDS、APFSDS、HEAT-FS、T-HEAT、HT-HEAT、APHE、HESH、HE-VT、HE-OP 等）全面继承 `RULES.ammoTypes` 对应数值矩阵，全部使用规范军事缩写。
- **2026-09-14 定案：HEC 弹种移除**——`RULES.ammoTypes` 现 14 键（ap/apcr/apds/apfsds/apfsds_ad/he/heat/heatfs/tandem_heat/heavy_tandem_heat/aphe/hesh/proximity_he/blast_he）。**曲射/越障通道（现行口径）**：① 副武器迫击炮 `mortar`（`isArc` + `ignoreCover`）；② **榴弹炮曲射模式 `howitzer`（2026-10-20 #W-I 回归，副武器语义）**——装进副武器槽后**主炮**切曲射，详见 §3.2b。~~「2026-09-15 主武器曲射机制移除」~~：该裁定只针对当时的 howitzer **主武器类型**（已删除），不约束 2026-10-20 以**副武器模式**形式回归的曲射机制（沿革见 `DEVELOPMENT-batches-2026-10.md` §4.109 更正段）。

### 3.1 弹种升级链（14 键 = 14 弹种；HEC 已移除）

> 链内为**升级替换**：升级卡把 loadout 槽内直系前驱弹种原地替换；**禁止跳级**（前驱未持有则不变）。HE 线不再 he 处多向分岔，而是 he 作为分支点形成两条线性链——首张 heat 或 aphe 卡「先新增」（保留 he，占第 3 槽，槽位 <3）；其后同分支/他分支再抽则「替换 he 槽」——heat 与 aphe 得以并存；KE 链与 HEAT 链各为一条线性替换链。（2026-09-13 定案 + 2026-09-15 用户修订；曲射/越障由武器层承担。）

| 链 | 序列 |
|---|---|
| KE 穿甲链 | ap → apcr → apds → apfsds → apfsds_ad |
| HEAT 破甲链 | he → heat → heatfs → tandem_heat → heavy_tandem_heat |
| HE 榴弹链 | he → aphe → hesh → proximity_he → blast_he |

- `RULES.ammoChain`（key→前驱）为升级替换唯一链源（`js/tank_rules.js`）；`computeAmmoConfig` add pass 按 base 倍率换算（+10mm × apds 1.4 = +14mm）。
- **升级替换的触发口径（#U40，2026-10-19）**：仅**升级效果**触发链替换——显式 `replaceAmmo`，或无 `field` 的旧式演变效果按 `CHAIN[key]` 推断；带 `field` 的弹种**调校效果**（`demo_apcr_round`「APCR 穿深 +20%」等）是纯数值卡，**绝不替换 loadout 弹种**（旧口径曾让调校卡把 AP 槽隐形改名）。细则归口 `specs/cards.md` §3「调校效果与升级效果的严格分界」。
- **卡牌通道运行时硬限（W5，本卷唯一口径）**：卡牌 modifiers 聚合后必须落在 `RULES.parameterLimits` 的边界内——**装填取下限 `reload.min`、极速取上限 `maxSpeed.max`**（具体秒数 / km/h 数值只写在 `js/tank_rules.js`，本卷不再复述）；`aimSpeed` / `trackLock` / 暴击类聚合边界 2026-10-19 #U40 起同样**无条件**钳制（无「仅部分通道」例外）。逐键上下限一律以 `RULES.parameterLimits` 为唯一数值口径（`reload` / `maxSpeed` / `aimSpeed` / `spreadMult` / `motionSpreadMul` / `armor.*` 等），§2 的局内商店达限判定与卡牌侧 `specs/cards.md` §3 的满级过滤都读同一份表。

### 3.2 弹种数值总表（用户 2026-09-13 权威表，已落地 `RULES.ammoTypes` per-ammo 字段）

> **本表是本卷弹种数值的唯一口径。** 穿深/伤害/弹速为相对基准的倍率；跳弹角与溅射半径亦只在此处出现，其余各节一律指向本表。

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
- **跳弹角 per-ammo（`ammoBounceAngle`，°）**：θ>该值跳弹；90° = 不可能跳弹；noBounce 弹种（heat 系/HE 系）完全不跳弹。**注意（2026-09-23 核实）**：`RULES.ammoTypes` 对 `noBounce: true` 的 8 个弹种（he / heat / heatfs / tandem_heat / heavy_tandem_heat / hesh / proximity_he / blast_he）**不写 `bounceAngle` 字段**，本表 90° 为「不可能跳弹」的语义表达，权威判据是 `noBounce` 标记本身。§2 只讲判定流程，角度数值一律回到本表。
- **溅射半径与击退系数**（`splashRadius` / `splashKnockbackMul`，仅 HE 家族有该字段；击退公式见 §8.4）：

  | 弹种 | `splashRadius` | `splashKnockbackMul` |
  |---|---|---|
  | `he` | 90 | 0.55 |
  | `hesh` | 100 | 0.7 |
  | `proximity_he` | 90 | 0.6 |
  | `blast_he` | 110 | 0.95 |

  其余弹种（AP/APCR/HEAT 系）无该字段 → 零溅射、零击退。
- 近炸引信（proximity_he，用户定案=**接近率基准**）：弹道不命中目标时，对最近敌目标计算径向接近率；**接近率由正转负（开始远离）瞬间空爆**，按 splashRadius 溅射。已落地 `stepShells`（`RULES.proximityFuze`：maxTravel 1400 / armRadius 武装半径 120px / 最小起爆距离 40px）。**#A27 修复（2026-09-15）**：近炸分支须先执行飞行推进（`s.x/s.y/s.dist+=step` + 射程/出界死亡判定）再判引信——此前近炸分支从不推进弹体，导致 HE-VT 原地静止不飞。

### 3.2b 榴弹炮曲射模式（`howitzer`，副武器；2026-10-20 #W-I 现行口径）

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

**F 键语义（2026-10-20 #X5 订正）**：F = **曲射/直射模式开关**（走原生 keydown 边沿，见 §8.2「榴弹炮例外口径」），**不承担发射**；射击全部走主炮入口（左键/空格）。~~此前本节记为「F 键不响应（`tryFireSecondary` 对 howitzer 直接 return false）」~~——该表述在 2026-10-20 之前成立（当时 howitzer 恒曲射、无模式开关），#X5 起 F 有了开关职责故改写；「不承担发射」这一点两版一致。

### 3.2c 曲射弹越障契约（`isArc` 弹的帧处理，2026-10-20 #Y1 现行口径）

**唯一口径**：`isArc` 弹**在飞行途中不得被直射扫掠命中段处理**——只在抵达落点（`s.dist >= s.totalDist`）时爆炸结算。`stepShells` 的 `if(s.isArc){ ... }` 块**必须每帧以 `return` 短路**（无论是否已到落点），否则未到落点的帧会穿透到下方直射扫掠段（`raycastTank` + `resolveHit`），把途中坦克当直射目标结算（详情与取证见 `DEVELOPMENT-batches-2026-10.md` §4.112 #Y1）。

**`maxRange` 契约**：`maxRange` 对 `isArc` 弹**恒不生效**——所有 `isArc` 弹（`mortar` / `howitzer`）创建时**不设 `maxRange`**（缺省 `undefined`，`s.maxRange > 0` 判定为假），射程由 `totalDist` 单一口径承担。若将来给 `isArc` 弹加 `maxRange`，需先确认不会与落点结算抢跑（`maxRange` 判定位于 `isArc` 块**之前**，会直接 `s.dead = true` 而不走落点爆炸）。

**历史（不静默删除）**：本契约在 2026-10-20 之前**注释承诺了代码没做的事**——块尾注释写「曲射弹在落点结算后直接 return（不进入直射的扫掠命中段）」，但 `return` 只写在 `dist >= totalDist` 的**内层**分支里，`isArc` 块本身缺兜底 `return`。更早的未提交注释为「#W-I 补回（替换时吞掉了原闭合行）」，说明 #W-I 用替换实现该分支时把闭合花括号位置弄错——花括号表面配平但语义反转。该缺陷与「测试链假绿」两环叠加，长期既未被测试抓住、也未被测试链暴露（#Y1）。

### 3.3 平衡性回归（`scripts/test-ammo-balance.js`，接入 npm test）

真实 `resolveHit` 蒙特卡洛（全弹种 × 4 装甲级 × 3 入射角 × 3 目标速度 × 400 发，基准炮 pen120/dmg100/reload3s），同档弹种集合内中位数偏差 >25% 警告、「完全无效」单独报告。首轮平衡结论（2026-09-13）已按用户裁定全部落地：APHE pen 0.9→1.1（中型档可击穿）、HEAT-FS pen 1.5→1.75（与 heat 拉开 +16% 步幅）、HESH/HE 家族重型档偏弱与链条顶端无效经第二批补测裁定**维持**（距离本身就是平衡维；超重档打不穿为设计预期「不怕打不穿，卡牌升穿深」）。历史裁定过程见 `docs/archive/2026-09.md`。

## 4. 战术能力、副武器与主动装备 (Abilities & Secondary Weapons)统一入口 `tryActivateAbility` + 武器系统 `tank_weapons.js`
- **副武器系统（F 键直接击发副武器；左键/空格=主炮专属；2026-09-17 #C4e 用户裁定反转，取代 #A21 激活槽位分发）**：
  - 副武器**单槽**（`player.weapons.secondary`；单槽不变量见 #A22 / DEVELOPMENT.md §4.16）。
  - `F` 键（`fireSecondary`）= **直接击发副武器（按住连发）**，不再承担主/副切换——`activeWeaponSlot` 概念已移除。键位语义：**左键/空格 = 主炮专属**（`tryFirePrimary`，空格为双管齐射 salvo），**F（按住）= 副武器专属**（`tryFireSecondary` → `fireActiveSecondary(target=鼠标世界点)`，目标缺省回退炮塔前方 +100px）；`tank_bindings.js` keydown 屏蔽 `e.repeat` 重复边沿动作。
  - **例外**：副武器类型为 `turret`（副炮塔）时**装上即由主循环 `updateSecondaryWeapon` 逐帧自主驱动**（自瞄，不响应击发）；副武器为 `none`/未装时 `tryFireSecondary` 返回 false（页面层提示，**不回落主炮**——主炮有专属键位）。
    - **副炮塔外观与弹道来源（#U43，2026-10-19 用户反馈「副炮塔似乎没有效果，贴图方面使用 1 个缩小版的自身炮塔叠在当前炮塔上方自主攻击」）**：机制侧本就生效（自瞄/独立装填/独立炮塔角），但**弹道起点与炮口特效都复用主炮的 `gunRoot`/`gunTip`** ⇒ 炮弹从主炮口飞出（实测起点与主炮 `gunTip` 逐位相同），玩家无法区分「多了一门炮」与「主炮多打了一发」，主观结论即「没有效果」。现行：
      - **弹道起点 = 副炮塔炮口**：`updateSecondaryTurret` 经 `secondaryTurretPose`（与绘制层**严格同源**，惰性解析以兼容 `tank_weapons.js` 先于 `tank_battledraw.js` 加载）取位姿，炮口 = `pose 位置 + 朝向 × (barrelLen + radius×0.6)`；炮管掩体截停判定同步改用该线段。弹体带 `fromSecondaryTurret: true`，`drawShells` 据此把弹体缩到 0.7 档；炮口特效缩放 0.55（主炮 0.8）。
      - **外观 = 缩小版自身炮塔**：`secondaryTurretPose` 锚点从「车体尾后 `hullLen×0.28` 的小圆盘」改为**主炮塔座圈中心（`turretPivot`）沿主炮塔朝向前移 `turLen×0.62×0.45`**，缩放 `scale=0.62`，绘制复用本车 `turretPoly` 顶点（同一套涂装/勾线/受光），读作「同一辆车上多装了一座小炮塔」。**沿革（已推翻）**：旧位姿在车尾、半径为 `hullWid×0.30 ≈ 11px` 的纯几何圆盘 + 一根棍子，与主炮塔无视觉关联。
  - **副武器待机装填计时 `secondaryReloadT` 恒递减（与主炮 reloadT 对称）。每种副武器的装填/伤害/射程等数值唯一口径是 `WEAPON_DEFAULTS.secondary`（`js/tank_weapons.js`）；§4 与 §8.2 只写行为语义，不重复罗列数值。**
  - **锁定式反坦克导弹**（secondary `missile`）：**F = 激活索敌**（不是直接发射）——激活后逐帧由 `updateMissileLock` 在炮塔锁定扇形内、射程内索敌，锁定计时满后**自动发射**制导弹；再按 F 取消。**现行细则与参数（`lockArcDeg` / `lockSeconds` / `range` / `reload` / `damage`）唯一归口 §8.2 + `WEAPON_DEFAULTS.secondary.missile`，本节不重复罗列。**
    - **已作废的旧口径（#A21 时期，勿再引用）**：曾为「按 F 沿光标方向直飞、不做锁定、`target=null`」，该口径自 #E5（2026-09-20）起被取代；AI/Boss 侧副武器同样走 `updateMissileLock` 自主索敌。
    - **伤害口径（#J4 2026-09-30 明文化）**：基础伤害 `damage`（数值见 `WEAPON_DEFAULTS.secondary.missile`；升级卡另行覆盖）**再乘当前 HEAT 弹种系数** —— `getEffectiveHeatAmmoKey`（优先级 `heavy_tandem_heat > tandem_heat > heatfs > heat`，全部未持有时回退 `he`）→ `computeAmmoConfig` → `dmg = round(base × ammo.dmg + ammo.dmgAdd)`，穿深同理。即**导弹伤害跟随玩家的 HEAT 弹种升级链**，未升级时按 HE 口径计算。
    - **激活反馈（#J4 2026-09-30 用户反馈「导弹无法发射」）**：旧版激活后**无任何可见反馈** —— 炮塔未对准（超出锁定扇形）或目标在射程外时，导弹既不发也不提示，玩家只能得到「按了 F 没反应」。现三处反馈：① 激活日志写明锁定条件（扇形角/射程/锁定耗时）；② HUD `btnF` 角标显示「索」（已激活未锁定，琥珀脉动 `.lock-hunting`）/「n%」（锁定中，绿色 `.lock-on`）；③ 激活后 0.6s 仍无目标 → 一次性提示缺少的条件（射程内无敌人 / 炮塔未对准）。

  - **火箭发射器逐发 burst（2026-09-19 #D4 用户反馈「同帧齐射改连续快速逐发」）**：`fireActiveSecondary` rocket 分支只发射第 1 发并登记 `t._rocketBurst={left, lastAngle}`；`updateRocketBurst`（tank_weapons.js，mvp 主循环玩家侧 / `updateSecondaryMount` AI 侧逐帧驱动）按 `burstInterval`（WEAPON_DEFAULTS.secondary.rocket.burstInterval=0.18s）逐发补完，队列清空后写入整组装填 `reload`（10s）。瞄准：存活目标方向优先，目标丢失保持上一发角度（committal）。视觉：逐发口焰 `muzzle`+粒子烟 `spawnSmoke`×3+音效（旧齐射仅一次）、弹体 `fxScale=1.3` 放大 + 拖尾增亮（drawShells 消费）。队列不跨节点：enterBattle 清 `player._rocketBurst`/`_missileLock`，重置按钮清全员。
  - **视野系统已整体退役（2026-09-30 #J3，用户裁定「改为全屏幕渲染敌人，不再计算视野距离」）**：敌对实体一律渲染、一律可被命中，只剩 `aabbInView` 视口剔除（纯性能，非玩法机制）。原「可视圆」体系（鼠标锚定圆心 / 屏幕相对半径 / 车内圈 / 视野虚线圈 / 视野卡 `commander_sight`）全部下线，现行细则见 **§13.5**。**注**：敌人 AI 的接战判定**从来与视野系统无关**，一直是「距离 + 直线视野」（`engageRequiresLoS` + `hasLineOfSight`），不受本条影响。
- **主动技能快捷键池 (1~3 数字键)**：
  - 快捷键 1/2/3 **严格对应技能池槽位 `player.skillSlots[0..2]`**（2026-09-30 #H3 重做，取代原「按 `cardEffects` 获得顺序自动推导」口径），按槽位快捷施放；**空槽按数字键无任何效果**（不再回落到任何默认技能）。**现行运行时能力键全集（5 个，2026-10-20 #W9 删键后）以 `js/tank_abilities.js` 的 `ABILITY_KEYS_RUNTIME` 为唯一口径**（`artillery / overdrive / shield / deploy_cover / aps`）——键数多于槽位数（3），**超出部分由玩家在「技能槽指派」面板中指定顶替**（§13.2）。**卡牌可授予的能力键全集（8 个）以 `js/tank_cards.js` 的 `ABILITY_KEYS` 为唯一口径**（上述 5 个 runtime 键 + innate 3 键 `repair / medkit / extinguish`）。
    - **#W9 死键删除（2026-10-20，用户裁定「删除」）**：`super_fire_control` / `super_speed` **已整体摘除**（`RULES.abilities` 两键、`ABILITY_KEYS_RUNTIME`、`ABILITY_LABELS`、`tryActivateAbility` 的两个 `case`、mvp 的 dispatch 与获得提示、bench 测试按钮、`ABILITY_KEYS` 同步删除）。差集实测依据：RUNTIME 7 键 − 卡牌可授予键 = {`super_fire_control`, `super_speed`}，且 196 张卡 + `tanks/` + `bosses/` 全库两键**零命中** ⇒ 玩家在真实对局中永远拿不到，属死键。删除后 `tryActivateAbility(t, 'super_speed', {})` 返回 `{ok:false, reason:'unsupported'}`（**与合法键无卡时的 `reason:'no-ability'` 可区分**），`test-rework-r1.js` 以负向断言锁死（负向断言是死键类问题的根治手段，见 `DEVELOPMENT-batches-2026-10.md` §4.112）。
    - ~~「7 个键中不存在无激活路径的死键」~~（2026-10-20 前的表述）已被上述 #W9 结论取代——当时 7 键全集里恰好就藏着这 2 个死键。
    - **2026-09-23 A 档**：原 `recon`（侦察/无人机指令）已随 5 张对应卡整体摘除（归口 `docs/specs/cards.md` §3、`DEVELOPMENT.md` §4.35）。
    - **槽满顶替的排队顺序（#U43，2026-10-19 用户反馈「技能顶替时的顺序似乎不正确」）**：`syncSkillSlots(changedKey)` 现在只把**本次新获得且装不进槽**的那个技能放进待指派队列（`reconcileSkillSlotsAfterGain(newKey)` 由 `pickCard` / `__TEST__.giveCard` / `__TEST__.applyCard` 三处传入）。**沿革（已推翻）**：旧口径把「全部已持有但当前不在槽里的技能」都算待指派（按 `cardEffects` 顺序展开），而被顶掉的旧技能同样满足该条件且排在 `cardEffects` 更前面 ⇒ 玩家刚顶替完，面板立刻又追问旧技能放哪一格，读起来就是顺序反了。现行「已持有但未入槽」视为玩家主动放弃，随时可用 **Shift+点击某槽**手动装回。
    - **护盾的键位（#U44，2026-10-19 用户反馈「战术护盾还在使用 R 触发」）**：**代码中不存在 R 键**——护盾自 #H3 起就走技能池，G/H 专属键已于 #U42 一并退役（`tank_bindings.js` 无 `abilityShield` 键位/说明行；mvp `btnG`/`btnH` 按钮与 G/H 轮询已删）。护盾按**获得时的空槽**自动入池：`syncSkillSlots` 逐项填 `slots.indexOf(null)`，槽满才弹顶替面板。若实机仍显示 R 键提示，属浏览器缓存了旧 `tank_bindings.js`（强制刷新即可）。
- **冷却模型（2026-09-17 #C4c 用户裁定「按技能独立冷却」）**：
  - 运行时能力键（`artillery/overdrive/shield/deploy_cover/aps`，2026-10-20 #W9 删去 `super_fire_control`/`super_speed`）与 innate 键（`repair/medkit/extinguish`）统一走**按 key 隔离的独立冷却池 `t.abilityCds[key]`**（互不顶冷却；旧共享单字段 `t.abilityCdT` 废弃，`updateAbilityCd` 仅作兼容助手保留）；逐帧递减 `updateAbilityCds(t, dt)`（mvp 主循环驱动）。
  - 获得技能/副武器 → `#gainToast` 屏幕一次性提示（不依赖底部按钮显隐，奖励页/战斗页均可见）+ **已有技能槽按钮金色脉冲**（#B10 保留；沿革：原为 G/H/V 专属字母按钮脉冲，三键已于 2026-09-21 #H3 与 2026-10-19 #U42 全部退役）。
- **各能力键的现行激活入口**：全部运行时技能（`artillery` 炮击 / `shield` 护盾 / `overdrive` 超装填 / `deploy_cover` 战术掩体 / `aps`）**只经技能池槽位 `#skillSlot1~3` + 数字键 1/2/3**；指派与顶替规则归口 §13.2，禁止在本节另立键位口径。
  - **~~独立字母键（G 炮击 / H 定向护盾 / Shift+H 全向护盾 / V 超装填）~~ 已全部退役**：V 于 2026-09-21 #H3 删除（§11.2），G/H 于 2026-10-19 #U42 删除（§13.2）；`tank_bindings.js` 现仅有 `benchTestStrike: 'g'`（bench 测试入口，非正式键位）。
  - **战术炮击**：呼叫延迟 AOE 覆盖（`callStrike` / `updateStrikes`），参数 `RULES.abilities.artillery`。
  - **战术护盾**：累计吸收伤害池（`applyShield`），定向/全向参数 `RULES.abilities.shield`。
  - **超装填**：爆发装填 + 立即清零 `reloadT`，激活路径唯一化为 `skillHotkey(n) → DISPATCH`，常驻显示走技能池槽 `#skillSlot1~3`（见 §11.2）。
  - **战术掩体**：**炮塔正前方**部署充能掩体（2026-09-17 #C4b 用户裁定——部署方向读 `turretAngle`）。**尺寸与数量上限的数值唯一口径 = §8.1（`deploy_cover` 尺寸行 + `deploy_limits` 表），本节不重复罗列。**
  - **~~超级火控 / 超级速度~~（2026-10-20 #W9 整体摘除）**：两键已从 `RULES.abilities`、`ABILITY_KEYS_RUNTIME`、`ABILITY_LABELS`、`ABILITY_KEYS` 及全部卡牌中删除——差集实测（RUNTIME 7 键 − 卡牌可授予键 = 这两键，且 196 张卡 + `tanks/` + `bosses/` 零命中）证明其为玩家永远拿不到的死键。现行运行时键全集为 5 个（见 §4 首段）。
  - **烟幕弹已移除**（2026-09-15 W2 用户裁定）：`fireSmokeShell`/`tryFireSmoke`/stepShells smoke 分支/烟幕卡（smoke_screen、ability_smoke_dense）整链删除；`tank_cover.js` smokeClouds 动态烟幕基础设施保留备用（当前无生产者）。
- **无人机体系**（参数唯一口径 `RULES.abilities.drone`，2026-10-21 核对：`scoutRange` / `strikeRange` / `fireInterval` / `dmgMult` / `countMax`）：
  - scout 侦察型：标记视口外敌军位置指示（`RULES.abilities.drone.scoutRange`）**（当前 gated 暂不加入游戏，见 §5.1）**。
  - striker 打击型：近身环绕索敌开火（`strikeRange` / `fireInterval` 见上配置）、伤害 = `dmgMult` × 拥有者伤害，不消耗玩家弹药。
  - 上限 `countMax`，超限拒绝部署；owner 阵亡自动移除。**逐键数值一律回 `RULES.abilities.drone` 与 §5.1，本节不重复。**

## 5. 敌方 AI 激活触发 (Enemy AI Activation Trigger)（2026-08-24 定案）

> **AI 基础距离的唯一数值口径（本节，2026-10-21 按 `RULES.ai` 核对）**：`triggerDistBase` **700** / `engageRange` **520** / `keepRange` **320** / `allyEngageRange` **460**（px）。其余 AI 参数（`shotNoiseRadius` / `impactNoiseRadius` / `alertRadius` / `engagePropagateRadius` / `engageBand` / `maneuver` / `separation` / `retreatReload` 等）逐键现行值唯一来源是 `RULES.ai`（`js/tank_rules.js`），§8.3 / §13.7 / §13.8 只写机制与裁定，不重复维护完整参数表。

- **与摄像机视野解耦**：激活判定与摄像机视野彻底解耦（废除 P-10 的「视野内主动 / 范围外被动」门控），改为**距离 + 可见性**触发。
- **有效触发距离**：= 上条表中的 `triggerDistBase` × 难度乘数（最高 ×1.6），经 `js/tank_map.js` 的 `triggerDistForDifficulty(diff)` 计算，节点生成时注入实体字段 `aiTriggerDist`；`aiDecideEnemy` 读实体字段，缺省回退 RULES 基准值。
- **「全图主动」语义（2026-10-17 #U28，现行口径）**：`aiTriggerDist` 设为远超 `triggerDistBase × triggerHysteresis`（如生存波次的 99999）只放行触发**门**，**不放大** `engage`（后者被滞回比钳顶 ≈650）——因此 `aiTriggerDist` 超钳顶值的实体：① 不进入 defensive 站桩（`dist > engage×3+500` 的消极防御只属于普通触发距离实体），移动交给交战带（`dist > band.max → baseMove=1`）；② 生成方必须同时置 `aiEngaged=true, aiReactT=0`（只设 `alertLevel=3` 不够——首帧仍走未接战分支并吃反应延迟）。消费方：`js/tank_ai.js` defensive 分支、`tank_mvp.html spawnSurvivalWaveEnemies`。
- **滞回防抖**：脱离接战阈值 = 进入阈值 × 1.25（实体字段 `aiEngaged` 承载），消除边界抖动。
- **可见性分支**：
  - 距离达标且有视线（hasLineOfSight）→ 接战分支（flank / 开火等）；
  - 距离达标但无视线 → 提前进入 search 推进；
  - LoS 仅在距离达标时评估（patrol 早退路径零射线开销）。
- **生成点约束**：敌军与 Boss summons 的局内生成点必须位于该敌有效触发距离 × 1.05 之外（径向外推优先，越出敌区时确定性重掷，不消耗额外 rng——同 seed 结果稳定）。
- **受击警觉（任意来源，2026-09-14 定案）**：敌对实体被命中即惊醒——`applyDamage`（`tank_physics.js` 唯一伤害收口）统一触发 `alertEntity(t, srcX, srcY)`（置 `aiEngaged=true`、`alertLevel=3`、记录来弹方向 `lastKnownPlayerPos` + 威胁方向 `_threatDir`（炮塔优先指向），search 态朝该点推进，到达 ~140px 或重获视线后清除）并立即解除进行中的 stunned；来源坐标由调用方传入，缺省回退玩家当前位置（搜索玩家语义），再兜底自身位置。`propagateAlert(entities, x, y)` 将警觉传播至 `RULES.ai.alertRadius`（**600px**，本节唯一数值口径）内存活友邻。**覆盖任意伤害来源**：直射/溅射/炮击轰炸（strike）/DOT/地雷/碾压/溺毙——凡经 `applyDamage` 均触发（敌对存活非无人机；玩家/友军 no-op）。**Boss hold 受击破防**：`alertEntity` 对 `isBoss && stageAI.mode==='hold'` 实体清 `stageAI=null`（立即解除 hold 转常规接战）。注意：玩家对敌直射在 fireCtx 命中结算处另有前置警觉（与 applyDamage 钩子幂等重复，无害）。
- **五层级警觉（#S2，2026-10-15）**：`t.alertLevel` 0=calm / 1=suspicious / 2=alert / 3=engaged，替代二值 `aiEngaged` 的渐进状态。
  - **①玩家靠近**：距离+LoS（既有，不变）。
  - **②玩家射击**：`fireTank` 成功开火后经 fireCtx.`emitShotNoise` → `emitShotNoise(entities, x, y, radius, 'shot')`，半径内敌对 AI `hearNoise` 置 level 1（`RULES.ai.shotNoiseRadius` = **1100**，本节唯一数值口径；railgun/autocannon 按 ×1.27 派生 ≈1400）。
  - **③近失弹**：玩家/友军炮弹死亡未命中时，落点 `RULES.ai.impactNoiseRadius`（**420px**，本节唯一数值口径）内敌对 AI `hearNoise`（'impact'）。
  - **沿革注记（2026-10-17 #U4）**：原值 900 / 180。相对交战尺度（`engageRange`、`triggerDistBase`——数值唯一口径见本节首段与 §5 首段）偏小，近失弹需几乎贴身才被听见，是「被攻击/开火在很近才反应」的主因。现行值由 `RULES.ai.*` 单一来源提供，`tank_mvp.html` 与 `js/tank_fire.js` 不再内联硬编码半径。
  - **④友邻遇袭**：`propagateAlert`（半径 = `RULES.ai.alertRadius`，值见上方「受击警觉」条，本节不重复）。
  - **⑤自身被攻击**：`alertEntity` 置 level 3 + `_threatDir`（炮塔立即转向威胁）。
  - **suspicious 行为**：朝声音位置半速（0.5）调查，炮塔 ±0.5rad 扫视；8 秒（`suspiciousTimeout`）无新声音降级回 calm；接战中（level 3）不受声音干扰。
- **stun 免疫窗**：stunned 自然苏醒后授予 `RULES.ai.stunImmunityAfter`(2.0s) 免疫期，期间不再进入 stunned——防高射速武器无限连控。（附带修复：mvp 主循环此前遗漏 `aiUpdateStateTimer` 调用导致 stun 计时器永不递减、敌人永久呆滞，已补上。）
- **难度全面分化（2026-08-24 落地）**：`RULES.difficulty.entityMults` 十键乘子表（maxHp/penetration/damage/armorAll/reload/spreadMult/aimSpeed/maxSpeed/turnRate/turretTurnRate），按 diffNorm 线性插值，经 materializeNode→env.applyDifficulty 仅作用于敌军 stats（玩家隔离）；`entityMultsForDifficulty(diff)` 纯函数可测。**逐键现行区间见 §13.4（唯一数值口径）**，本节不重复罗列。
- **AI tier 分层**：`RULES.ai.tierProfiles` 三档（0 标准 / 1 engageMul1.1+aimTolMul0.8 / 2 再加 stunResist），实体 `aiTier` 注入后由 `aiTierProfile(tier)` 消费；engage 以触发距离比值为难度代理调制。
- **行为补齐**：patrol 早退分支输出 wander 微摆动（`patrolWanderSigma/Speed` 消费，ctx.time 或本地相位驱动）；新增 `coverSeek` 态——重甲（aiTier≥1 或车体正面≥100mm）且 hp<60% 时撤至半径 500px 内最近**全高挡弹掩体**背弹面（掩心 − 朝玩家单位向量×(半深+40px)），到位 ≤90px 原地还击；`flankDist` 收口 RULES.ai。**沿革**：本条早期写「full/half 掩体」——`half` tier 已于 2026-09-20 #E3 整体删除（现只有 `tierGroup:'structure' && vision` 的全高掩体挡弹），故改为全高。

### 5.1 战斗机制更新（2026-08-24 ~ 08-28 批次）
> *主题：半高掩体与 graduated 拦截链（**已整体删除**）/ 移速与受伤乘子 / 回放 harness / 主炮特效 / AI 微行为 / 无人机 / 弹种软上限 / 控制与设置*
> *⚠️ 本节为**历史批次章节**，多数条目已于 2026-09-20 #E1/#E3 作废，仅作沿革。**现行口径见卷首「§0 主题索引」**（掩体/地形 → `specs/map.md`；移速读数 → §9.6；伤害收口 → §2 + §14.1；特效 → §6；AI → §5 + §13.7 + §13.8）。*

- **（2026-09-20 #E1 取代）半高掩体 / graduated 拦截链已整体移除**：§5.1 下述关于「graduated 掩体入口缓存判决（s.dec）」「半高掩体曝光」的历史口径已作废，**现行口径归口 `docs/specs/map.md` §12**（掩体 tier 全集以 `RULES.coverTiers` 为唯一口径）。
- **speed / 受伤口径**：`RULES.speed.effMul` 在 `driveTank` 与碰撞限速两处消费，实际移速按该乘子放大，但面板显示 `stats.maxSpeed` 不变（**该乘子的数值与速度读数公式唯一口径见 §9.6，本节不重复**）；玩家经 `applyDamage(target,amount)` 统一扣血并乘 `dmgTakenMul`（玩家 0.85，更肉），面板 HP/装甲数值不变。
- 炮弹与掩体：修复半高掩体曝光 bug——shell 在 exposure<1 时于掩体处被拦截，不再必然命中后方敌人；mud/water 为 mode:'pass' 飞越（不触发命中）。graduated 掩体入口缓存判决（s.dec）后，结算分支带剩余距离门控——未飞抵 dec.t 前继续正常飞行积分，飞抵当帧才结算；实体直接命中优先（2026-08-26，原 ISSUES #A8 修复定案）。
- **半高掩体低生效定案（2026-08-28，原 ISSUES #A9 评估）——已被 2026-09-20 #E3 取代**：半高掩体 tier 与全部相关计算（含 `ruined` 的 `grad/half` 剖面）已整体移除，现行 tier 全集与取值以 `RULES.coverTiers` 为唯一口径、详见 `docs/specs/map.md` §12。原文保留以追溯评估过程。
- **graduated 拦截者对齐（2026-09-19，原 ISSUES #D1）——已被 2026-09-20 #E1 取代**：`s.dec` 判决缓存与 graduated 拦截分支已整体删除（炮弹只被确定性掩体拦截），详见 `docs/specs/map.md` §12.2。原文保留以追溯。
- **回放高 timeout 根因与修复（2026-08-28，原 ISSUES #A18）**：批量 seed 回放约 46% 节点超时，根因是**回放代理玩家（`js/tank_sim.js`）只推进位置、从不转炮塔也不开火**（`turret` 恒 0、`fire` 恒 false），而远处敌人因距离 > `aiTriggerDist`（默认 700~1120px）保持 `patrol`/`engaged=false` 不接战——双方僵持 0 开火假超时。修复：代理玩家始终把炮塔 `turretDesired` 指向最近敌人并在大致对准（≤~7°）时请求开火（范围/LoS/装填由开火块统一门控），仅改动 `tank_sim.js`（回放 harness，不影响正式游戏）。实测超时率 46.5%→15.5%、win 45→140/200、`timeoutHeavy` 30→6 seed；回放 hash 重锚 799b65f→5d754f53（可归因）。**残留 15.5%** 属第二层「敌人超触发距离不接战 + LoS 受阻不逼近」的真实对峙/平衡问题，需对比真人实跑录像再裁定是否加强 AI 迫近或加 forceResolve 兜底。
- 主炮特效：开火生成炮口双侧+前方闪光（spawnMuzzleFlash），炮弹每帧生成曳光拖尾（spawnTracer，颜色取自 ammo.tracer 或默认 #ffd24a），替代原烟雾拖尾。
- 敌方 AI：aiDecideEnemy 在接战非特殊态注入随机微行为——peek 车体摆角（RULES.ai.peekAngleMax / peekInterval）与换位（RULES.ai.reposInterval），炮塔锁敌与开火条件不变。
- 无人机：scout 暂不加入游戏（`deployDronesFromCards` 已 gate 掉）；striker 对最近敌人造成「`dmgMult` × 拥有者伤害」的直接扣血并播放炮口闪光+曳光（视觉），保留侦察型离屏指示逻辑备用。**数值唯一口径见 §4 无人机体系（`RULES.abilities.drone`），本条不重复。**
- 弹种独立隔离与软上限：卡牌 `type:'ammo'` 效果经 `computeAmmoConfig` 严格按弹种隔离（不触碰其他弹种）；为抑制 HE 滚雪球过快，HE 专属卡牌幅度大幅下调（common 1.06–1.08 / rare 1.12 / epic 1.14–1.15 / legendary 1.20；common 叠层上限降至 2），且 `computeAmmoConfig` 对 HE 施加 `RULES.ammoTypeCap` 软上限（dmg:2.5, pen:1.8, speed:2.0；AP/APCR/HEAT 不受此限制）；战斗 HUD 增加实时 `#ammoReadout` 显示当前弹种最终加成。
- 控制与设置：暂停菜单「控制」子菜单完整展示按键映射（独立包含 ` 或 F12 开发者面板、Tab 玩家状态面板）；新增 `profile.settings.showFps` 设置开关（默认 off）与实时 `#fpsReadout`；左上角增设常驻常显控制提示 `#topLeftInfo`（字号 ≥13px）。
- 左键连射（2026-08-26，原 ISSUES #A7 修复定案）：左键支持按住连射——mouseFireHeld 标志 + battle 态逐帧 tryFire，射速由 reloadT/breech 门控保证；暂停或面板打开时不触发。

## 6. 特效与视效表现规范 (FX Visual Standards)

- **开火与弹道 (Muzzle & Traces)**：
  - **AP**：灰白实线曳光（tracer），炮口单向锥形火花。
  - **APCR**：亮蓝高速气流拖尾（blue-tint tracer），炮口高压窄束闪光。
  - **HEAT**：细长橙红高温熔流拖尾，炮口高温金属射流火花。
  - **HE**：滚滚黑烟+浓烈黄红烟尘拖尾，炮口大面积圆环爆焰。
- **命中、跳弹与爆轰 (Hit, Ricochet & Explosion)**：
  - **跳弹 (Bounce)**：严格沿法线方向喷射高亮金黄切削火花（sparks），并在装甲表面留淡灰色划痕。
  - **穿透 (Penetration)**：向车体内部与后方喷射装甲金属碎片（debris）与高压火花，触发局部小范围闪光。
  - **HE 爆轰 (Explosion)**：爆轰火球 `explosions` 与冲击波 `shockwaves` 扩散半径必须严格按当前弹种的 `splashRadius`（§3.2 总表，唯一数值口径）动态缩放；地面生成深色弹坑痕迹 `scorchMarks`。
  - **飞头/殉爆 (Turret Blow-off)**：弹药架致死摧毁触发 `spawnAmmoBlowFx`；炮塔在空中弧形抛物线飞行并剧烈自旋，一路留滚滚黑烟粒子 `smoke`，落地时生成剧烈震屏与落点冲击波。
- **特效分层规范（#FX3-2026-10-18，现行口径）**：绘制顺序与层数固定如下，新增特效必须归入其中一层，不得再用「单层渐变平涂」表达有体积的效果。
  - **撤离/炮口（`drawMuzzleFlashes`）**：① 炮口烟（膨胀烟球，`source-over`，磁轨炮为电离白烟）② 双层火舌（外层宽暗外焰 + 内层窄亮白热芯；按 (宽度角, 长度系数) 烘焙 sprite，绘制期 `drawImage` 缩放旋转）③ 核心圆斑（径向渐变的「过曝白芯 → 琥珀边」）④ 外发光 ⑤ 冲击环。
  - **爆轰（`drawExplosions`）**：① 外烟壳（`source-over`，提供暗部对比）② 地面受光晕（`lighter`，照亮脚下地面）③ 主火球（`lighter`，四段色阶）④ 白热核（`lighter`，仅 `t<0.45` 可见）⑤ **12 段不规则冲击边缘**（顶点抖动由 `_fxHash` 派生，非正圆）。
  - **焦痕（`drawScorchMarks`）**：三层——尘土光晕（1.35× 椭圆）/ 10 段不规则焦体（半径抖动 0.82~1.12）/ 弹坑内核（0.55× 深色），并带 `min(1, lifeT*12)` 淡入。
  - **冲击波（`drawShockwaves`）**：双层环（外环 + 内侧 0.06~0.16 跟进环），`lighter` 合成。
  - **确定性硬约束**：**spawn 阶段**可用 `Math.random()`（每次爆炸本就该不同）；**draw 阶段一律禁止**——同帧重绘必须逐字节一致，抖动一律走 `_fxHash` / `_fxNow` 时间量子（见 `js/tank_fx.js` 头部约定）。回归保护：`scripts/test-render.js` ⑤。
  - **零逐帧渐变分配约束**：所有径向/线性渐变必须按「色阶名 + 半径档」烘焙为离屏 sprite（`_radialSprite` / `_explosionSprite` / `_plumeSprite` / `_flameGlowSprite`），绘制期只做 `drawImage` + `globalAlpha`。实测 20 个殉爆 + 10 类炮口的每帧 `createRadialGradient/LinearGradient` 分配已降为 **0**（改造前 60 + 61）。
  - **烘焙 sprite 的画布必须按弧的伸展定尺寸**（2026-10-18 实测踩坑）：`_plumeSprite` 的外层扇形半径 `R = len × 2.4`，画布高度若按 `len` 定，`wa=0.65` 时外焰垂直方向被切掉 **58px**，炮口焰画出来像被水平削平的梯形。正确做法是按 `R·sin(wa)`（垂直）/ `R`（水平）派生包围盒。回归断言：`scripts/test-render.js` ⑥「四边无触边不透明像素」（对旧公式实测触发 54/56/178 个边缘像素）。
  - **地面履带痕迹（#U41，2026-10-19，现行口径）**：`js/tank_fx.js` `trackMarks` 段数组（上限 600、寿命 12s）；`emitTankTracks(t)` 由 `driveTank` 末尾经 `globalThis` 可选调用，左右履带中心与 `paintTracks` 同源（`±(hullWid/2 + trackOffset + trackWidth/2)`），每侧位移 ≥9px 盖章（原地转向画差速弧）；绘制走 `drawTrackMarks`，与焦痕同层（地物/道路之后、坦克之前），深土色 0.20 alpha、前 8% 淡入线性淡出；`clearFx`/`enterBattle`/`devGenNode` 均清空。回归 `scripts/test-trackmarks.js`（9 断言，已登记 run-tests.js）。
- **三套此前从未绘制的 FX 已接线**：`drawScorchMarks`（地面贴花层，坦克之下）、`drawShockwaves` 与 `drawTracers`（炮口闪光之后）——两页均在 `tank_mvp.html` / `tank_bench.html` 的战斗绘制块中调用。
  - **电磁轨道炮三段视效（#U38 2026-10-18；#U41 2026-10-19 配色与归属修正，现行口径）**：参数唯一口径 `RULES.railgunFx`（`js/tank_rules.js`），实现分三阶段，全部由 `reloadT` / 炮身几何派生，**不引入新的运行时状态字段**。

    **三色口径（2026-10-19 用户裁定，现行）——炮管=灰 / 基底=蓝 / 弧光=白**：

    | 角色 | 配置键 | 现行值 | 语义 |
    |---|---|---|---|
    | 炮管（金属本体） | `barrelGrey` / `barrelGreyDark` / `barrelGreyLit` | `#787d84` / `#4a4e55` / `#a8aeb6` | 导轨、箍环；**与车体涂装色无关**（旧实现用 `shade(bCol, …)` 取车体色，已废） |
    | 炮管宽度倍率 | `barrelWidMult` | **2.2** | 常规口径算出 `barrelWid ≈ 3.2px`，「双轨 + 蓝缝 + 白弧」三层放不下（实测蓝缝被两根灰轨完全盖掉、炮管读作空管）；加宽后装得下。**纯视觉**，不改 `gunRoot`/`gunTip` 与炮口特效坐标 |
    | 基底（能量衬底） | `baseBlue` / `baseBlueDeep` / `baseBlueLit` | `#2f5d8c` / `#1b3550` / `#4d8ec4` | **只填两根灰导轨之间的缝隙**（半宽 `railOff − railW×0.45`），不向外包边；`source-over` 实色，**不进 `lighter`**（是固体结构不是光） |
    | 弧光 | `arcWhite` / `arcHalo` | `#ffffff` / `rgba(214,232,255,1)` | 充能弧与放电弧共用；纯白弧芯 + 冷白晕（`b−r ≤ 45`，**不再是青蓝**） |

    **白/蓝的配比纪律（#U41 实机校色，关键）**：白色在待机态**必须收敛**（`chargeIdleAlpha` 0.16，白芯 alpha 0.18），否则整条缝隙通体发白、蓝色基底被吃掉——实机读作「白炮管」而非「蓝基底 + 白弧光」。**「白」的主载体是充能电弧与击发放电，不是那条连续的轨间芯**。回归断言按充能中（35%）取真、并要求待机白 < 充能白。


    | 阶段 | 触发 | 实现 | 视觉 |
    |---|---|---|---|
    | ① 充能 | 装填期每帧 | `tank_battledraw.js railChargeProgress(t)` → 白色轨间能量芯亮度、冷白后膛核呼吸、`chargeArcs` 条爬行白弧 | 装填越满电弧越多越亮；满电切「微光待机」(`chargeIdleAlpha`) 而非全灭 |
    | ② 击发放电 | `firePrimaryShell` 命中 railgun 分支 | `spawnRailDischarge(gunRoot, ang, 炮管长, 1)` → `railArcs` 数组（上限 `FX_MAX_RAIL_ARCS=24`）+ 炮口白色冲击波 | **沿炮管轴向**甩出 `dischargeArcs` 条白弧，0.22s 内沿炮向收束淡出 |
    | ③ 弹道 | 炮弹飞行每帧 | `drawShells` 的 `s.wType==='railgun'` 分支 | 针状白热弹（`shellLenMult` 1.9× 长 / 0.55× 宽）+ 白热渐隐拖尾 + 冷白外发光；**不带电弧** |

    - **电弧只挂在炮身上（#U41 用户裁定，关键口径）**：`spawnRailDischarge` 的弧起点按 `startT` 沿炮管轴向铺开、横向抖动压在炮身量级内，回归断言锁「炮身走廊内像素 / 走廊外溢出 < 35%」。**炮弹本身不带电弧**——旧 `shellTrailArcs` 配置键与 `drawShells` 的电弧尾迹已删除，`drawShells` railgun 分支只剩针状弹体 + 普通渐隐拖尾。
    - **炮身结构细节**：蓝色缝隙衬底 + 灰色双轨本体（暗边/中间调/受光高光三层）+ 3 圈灰色横向箍环（读作一根炮管而非两条线）+ 淡白轨间能量芯 + 冷白后膛核 + 白色充能电弧，共六层；`tank_battledraw.js drawTank` 的 `_isRail` 分支。
    - **线宽按 1px 级配（#U41 实测）**：实测炮管 `barrelWid ≈ 3.2px`（×2.2 后约 7px）。`chargeArcWidth 1.2` / `dischargeWidth 0.9` / `dischargeAmp 2.2` 都是按这个量级定的——早期 `2.4× 外晕` 叠在 3px 炮管上，实机糊成一条白斑而不是电弧。
    - **充能进度的时长口径**与 HUD 装填环 / `fireTank` 完全同源：`dur = stats.reload × primaryWeaponSpec(t).reloadMult ÷ debuffReloadRate(t)`（2026-09-21 #G5 修正过的那条）；非电磁炮恒返回 1。
    - **电弧几何**走 `js/tank_utils.js lightningPath(x0,y0,ang,len,amp,segs,seed)`：纯函数、两端收敛到轴线、中段抖动由 `seed` 哈希派生（draw 期无 `Math.random`）。这是**共享工具**，`tank_battledraw` / `tank_fx` 两处消费，不得各自手写 zigzag。
    - **炮口（`spawnMuzzleFlash('railgun')`）**：白色能量锥 + 针状白热长矛 + 3 条**短**残余分叉（长度明显短于炮身弧，不喧宾夺主）+ 冷白核心/光晕/冲击环（走 `_radialSprite('coreW'/'haloW')`，白烟而非青蓝烟）。
    - **音效**：专属键 `firerail`（`SOUND_DEFS`）——高频方波放电下扫 + 带通噪声（电离空气）+ 延迟低频炮身共鸣；电磁炮开火不再复用 `fire`。
    - **HUD 装填环**：mvp 单环分支对 railgun 改**白色**双层充能弧（外层冷白晕 + 内层纯白芯），与炮身弧光同色；其他武器仍为琥珀色单弧。
    - 回归保护：`scripts/test-render.js` ⑩ —— 电弧确定性/端点收敛、充能进度同源、**三色分工分别量测**（灰 261 / 蓝 168 / 充能中白 44 px；待机白仅 2 px 且必须 < 充能白）+ 三色配置值直查 + 放电弧白且锁在炮身走廊（外溢 0%）、弹体不带电弧（青蓝 0 px）、弹体形态与长度、重绘逐字节一致。

- **伤害飘字 (Damage Numbers)**（2026-08-26，原 ISSUES #A6 修复定案）：
  - 飘字显示 min(res.dmg, 击杀前剩余HP)，击杀伤害不再溢出虚高；
  - DOT tick 加存活检查，目标死亡即清 dot 字段（mvp + bench 双页一致），尸体不再持续跳字；
  - 颜色语义：普通伤害白(plain) / 成员与非弹药架模块黄(module) / 弹药架红(ammoRack)；pen 色保留为 legacy 别名。
  - **Boss 飘字放大（2026-10-17 #U13，现行口径）**：`spawnDmgText(x, y, text, kind, scale)` 新增可选 `scale`（字号倍率，缺省 1）。`js/tank_fire.js` 在命中敌对 Boss 时透传 `RULES.boss.bossDmgTextScale`（现行 **1.6**），非 Boss 目标逐字不变；`js/tank_dmgtext.js drawDmgTexts` 按 `t.scale` 缩放字号与上浮距离。
- **开火后坐与装填/底部 HUD（2026-08-28 落地；2026-09-15 W2 更新键位）**：
  - **开火后坐回弹**：`fireTank` 成功开火分支写 `shooter.recoilT = 0.08`（被掩体阻挡分支不写；2026-09-15 W2 后烟幕弹已删除，`fireSmokeShell` 不再存在）；主循环 player 与非玩家实体各自递减 `recoilT`（沿用 reloadT 递减模式）。`drawTank` 炮管段按 `sin(π·recoilT/0.08)` 生成出击-回弹位移，仅把视觉炮管 baseX/baseY 沿炮管反向平移（炮盾/护套/制退器随 baseX/baseY 自然跟随），**不改 gunRoot()/gunTip() 判定坐标**；位移量随口径 `barrelWid/18` 轻微缩放。
  - **装填进度环形化**：废除原屏幕底部横向装填条（`#reloadWrap` 的 `#reloadTrack/#reloadFill`），改为 `drawReloadRing(ctx)` 贴炮口 `gunTip(player)` 世界坐标的环形弧（世界坐标经 `worldToScreen`，半径固定 13px），从 -90° 顺时针扫 360°×进度，**满值(≥1)即消失**（仅战斗态、装填中、玩家存活时绘制），挂入战斗绘制循环（drawDrones 后、烟幕云前）。**2026-09-15 W6：主武器 autocannon 时该环改为热量表**——弧长 = heatPct/100，三态配色 绿 <50% / 黄 50–<100% / 红 ≥100%（过热锁定期间红色闪烁）；冷却由 `updatePrimaryHeat` 逐帧驱动，热量归零后环消失（详见 cards.md §8.3）。
  - **底部常显 HUD**：新增 `#bottomHud`（战斗态门控 `flow.state==='battle'`）——常显玩家血条 `#playerHpTrack/Fill/Val`（同 updateStatusPanel 口径）+ 能力按钮行 `#abilityBtns`：↻弹种循环(cycleAmmo)/**F 副武器击发（2026-09-17 #C4e 语义反转，取代 toggleWeaponSlot；图标随武器类型切换 + `#cdF` 装填角标）**/4 修理箱/5 医疗包/6 灭火器（技能区结构现状见 §13.2：**G 炮击/H 护盾/V 超装填按钮已分别随 #U41/#H3 退役**，技能统一走技能池槽），`updateBottomHud()`（挂入 updateHud）刷新冷却角标——**按技能独立冷却** `t.abilityCds[key]`（#C4c；F 角标显示 `secondaryReloadT` 装填剩余），冷却中置灰+角标秒数。纯 UI 薄包装接线，能力逻辑仍走既有 tryActivateAbility/tryRepairKit/tryMedkit/tryExtinguish。

### 6.1 曲射弹体俯仰与透视（`arcShellPose`，2026-10-20 #X6 现行口径）

**唯一口径**：`js/tank_battledraw.js` 的纯函数 `arcShellPose(s)`（Node 可测；`drawShells` 的 `isArc` 分支消费）。**逻辑层（落点/结算/hit 判定）零改动**——高度与俯仰纯属绘制期量。

**推导**：从**同一个** z 公式求导取伪俯仰，而非另设一套拟合——z(p) = sin(p·π)·H ⇒ `dz/dp = π·cos(p·π)·H`，其中 `p = dist/totalDist`。

**产出三量**：
| 量 | 语义 | 用途 |
|---|---|---|
| `pitch` | 轴向仰角（rad） | 上升段为负（抬头）、下坠段为正（低头）、顶点 ≈ 0 |
| `tilt` | 屏幕倾斜（已做弹道方向投影） | 供 `rotate(ang + tilt)`；`ang ≈ ±90°` 时不翻成 180° |
| `foreshorten` | `cos(pitch)`，**下限 0.55** | 纵向压缩比，防止极端角度压成一条线 |

**绘制约定（易错点，勿改）**：
- 变换 = `rotate(ang + tilt)` + **压长轴** `scale(scale*fore, scale)`——即压 local **x**（弹体长轴）；
- ⚠️ 压 local **y**（短轴）会让弹体「越飞越细」，实机读起来像**在缩水的针**而不是抬头的炮弹；
- **地面阴影恒贴地**，只随 `ang` 与 `z` 变化，**不随 `tilt` 旋转**——影子是地面投影，不是弹体附属物（若随 tilt 转会与地面纹理打架）。

**实测（2026-10-20）**：`p=0.25 → pitch −33.8°`（抬头）/ `p=0.75 → +33.9°`（低头）/ `p=0.5`（顶点）`0.000000°` / 直线弹 `0.00°`（**不受影响**）；阴影主轴角在两姿态点均为 `0.0°`（证明未随 tilt 旋转）；**零逐帧渐变**（曲射 1 次绘制 ≤ 直线 1 次）。回归断言见 `scripts/test-render.js` ⑪ 段（含 ⑩ 电磁炮三色分工不被破坏）。
**沿革**：~~旧实现弹体 `rotate(ang)` 恒平行地面~~（`ang = atan2(s.dy, s.dx)`），高度只做整体上移 + 等比放大 + 地面阴影 ⇒ 上升段不抬头、下坠段不低头、拖尾也不沿含 z 的弹道切线绘制（#X6 原条目描述逐字对应）。

## 7. 音频与声效表现规范 (Audio Visual Standards)

- **声音总线与并发管理 (Busses & Concurrency)**：
  - `combat` 总线（主音量受 `AUDIO_SETTINGS.combatGain` 控制）：开火/爆炸/击穿/跳弹/履带断裂，`maxConcurrent=3`；
  - `ui` 总线（主音量受 `AUDIO_SETTINGS.uiGain` 控制）：点击/选卡/装填完成/警告，`maxConcurrent=4`；
- **采样优先与合成兜底 (Sample-Priority Architecture)**：
  - 音频系统优先加载并播放 `audio/` 目录下的 CC0/Freesound 真实采样（WAV/OGG）；
  - 若采样缺失、网络加载超时或本地 `file://` 环境下，系统无缝自动回退至 `SOUND_DEFS` 程序化合成器。
- **2D 空间化与距离衰减 (Spatialization)**：
  - 战斗事件通过 `playSound(key, opts, {x, y})` 传入世界坐标，使用 `PannerNode`（HRTF / `exponential` rolloff）进行定位；
  - 听众位置 `setListenerPos(cam.x, cam.y)` 实时跟随摄像机；超出 1200px 范围的音效自动施加 Lowpass 滤镜模拟远距离钝音感。

### 7.1 `SOUND_DEFS` 条目 schema（唯一权威 = `js/tank_audio.js`；2026-10-19 按实现校正）

> **沿革**：2026-10-19 收编自已删除的 `.dsh/agents/sound-designer.md` 时做过一次**实码核对**——旧角色卡描述的 `priority` / `maxConcurrent` / `spatial{...}` / `env.type`（`perc`/`exp`/`adsr`/`gate`）/ `bufferKey` **均未实现**，实际结构如下表，以其为准。

```js
fire: {
  label: '开火',        // 必填，字符串（调试/预览显示用）
  bus: 'combat',        // 必填，'combat' | 'ui'（校验器只认这两个；无 'env'）
  gain: 1.0,            // 可选，总线内增益 > 0；缺省按 1 处理
  layers: [             // 必填，非空数组；多层并行合成
    { kind: 'osc', wave: 'sawtooth', f0: 220, f1: 42, dur: 0.30, gain: 0.85, attack: 0.004 },
    { kind: 'noise', dur: 0.16, gain: 0.45, attack: 0.002, filter: 'lowpass', filterFreq: 2200 }
  ]
}
```

**层字段（`layers[]`）**：

| 字段 | 适用 | 说明 |
|---|---|---|
| `kind` | 必填 | 仅 `'osc'` / `'noise'` 两种（**无 `buffer`**） |
| `dur` / `gain` | 必填 | 均须 > 0 |
| `attack` | 可选 | ≥ 0，线性起振时长 |
| `delay` | 可选 | ≥ 0，相对 `playSound` 的起始延时 |
| `wave` / `f0` / `f1` | `osc` | 仅 `sine`/`square`/`sawtooth`/`triangle`；`f0→f1` 为频率滑音 |
| `filter` / `filterFreq` | 可选 | 仅 `lowpass`/`highpass`/`bandpass`（无 shelf/peaking 系） |

**校验器**：`validateSoundDefs(defs)` 返回问题数组（空 = 合法），`scripts/test-audio.js` 消费。**新增音效必须过该校验**。

**空间化（唯一真实路径）**：`playSound(key, {pos:{x,y}})` 时才建 `PannerNode`，且固定 `panningModel='HRTF'`、`distanceModel='exponential'`、`maxDistance=500`、`refDistance=24`，位置取「世界坐标 − 听众坐标」的相对量；不传 `pos` 则直连 `_master`。听众由 `setListenerPos(x,y)` 设定（默认 0,0）。

> ⚠️ **与本节 §7 开头的已知不一致（2026-10-19 实测，尚未修正）**：正文写 `PannerNode` 用 `equalpower` / `maxDistance 1200` / `refDistance 100` / 带距离 Lowpass 滤镜，实现是 `HRTF` / 500 / 24 / 无距离滤镜；且 `AUDIO_SETTINGS` 只有 `combatGain` 0.5 与 `uiGain` 0.25 两项。**以 §7.1 的实现描述为现行事实**，正文那三段属历史设计意图，修正前不得据其调参。

## 8. 2026-09-20 用户反馈批次（#E4/#E5/#E7/#E8/#E10/#E12/#E13）现行口径
> *主题：掩体部署与布雷（8.1）/ 副武器 F 键与导弹制导（8.2）/ 敌方 AI 反应与接战传播（8.3）/ HE 击退（8.4）/ 双联火炮（8.5）/ 神话稀有度与标准主炮规格通道（8.6、8.6b）/ 摄像机外延（8.7）*
> *⚠️ 本节为批次章节，非主题基线。现行口径索引见卷首「§0 主题索引」；视野相关子节（8.7）仍有效，但其下游的可见距离体系已于 §13.5 退役。*

### 8.1 便携式掩体与布雷器：部署上限、预约与触发口径（#E4/#F5/#F6）
- **单向透明**：部署方阵营的炮弹可穿过便携式掩体（不拦截），**对立方**炮弹按确定性实体在掩体入口点被挡下（`tank_fire.js stepShells` 的 `_deployablePathHit` 与部署物 OBB 求交）。视觉上以朝向指示标注「我方穿透侧」：穿透侧画青色虚线 + 绿色箭头（`tank_mvp.html` 部署物绘制），对敌面为实线装甲边。
- **尺寸（唯一数值口径）**：`RULES.abilities.deploy_cover` 的 `dist` **90** / `lenMult` **3.2** / `width` **22** / `hp` **200** / `shieldHp` **150** / `duration` **30s** / `cooldown` **20s**（2026-10-21 按 `RULES.abilities` 核对）。沿革：`lenMult` 1.6 → 3.2（2026-09-20 #E4「再加长至当前 2 倍」）；`width` 22 取代旧硬编码 20。**§4「战术掩体」条只讲部署方向语义，数值一律回本条。**
- **部署数量上限 + 超限拒绝（#F6 2026-09-20，取代 #E4「超限淘汰最早」）**：基础上限与升级步长**唯一数值口径 = 下表（`RULES.abilities.deploy_limits`，2026-10-21 核对）**，升级卡经 `upgradeCards` 映射（`ability_deploy_cover_fortified→cover+1`、`weapon_secondary_mine_upgrade→mine+1`、`turret_bunker→turret+1`）：

  | 键 | 值 | 语义 |
  |---|---|---|
  | `coverMax` | 2 | 掩体基础上限 |
  | `mineMax` | 6 | 地雷**同时在场**上限（沿革 3 → 6，见 §13.6） |
  | `coverMaxUpgradeStep` / `mineMaxUpgradeStep` | 1 / 1 | 每张升级卡增加的槽位数 |
  | `coverMaxHardCap` / `mineMaxHardCap` | 6 / 12 | 升级叠加的绝对硬上限（沿革 8 → 12 见 §13.6） |
  | `mineFieldCount` | 3 | 单次雷场落雷数（沿革 5 → 3，见 §13.3） |
  | `mineFieldRadius` / `mineFieldDelay` / `mineFieldReload` | 70 / 4s / 15s | 雷场半径 / 预形态等待 / 装填冷却 |

  **能力/页面部署路径超限时拒绝新部署并提示，保留已部署物**：`js/tank_abilities.js` `deploy_cover` 与 `tank_bench.html` `spawnCoverBtn` 部署前检查 `deployableCount >= deployableCap` → 拒绝（不生成新掩体）；`tank_mvp.html` `handleMineFieldF` 已有预约（`pendingMineFields.length>0`）时按 F 拒绝；雷场生成前检查 `deployableCount('mine') + n > cap` → 取消该预约并提示，不生成新雷场（保留已布地雷）。共享核心 `enforceDeployLimits` 的「淘汰最早」仅作为兜底（绕过能力路径直接 spawn 时生效）；按类型独立计数。
- **布雷器两次 F + 4s 雷场**（`mineFieldCount` / `mineFieldRadius` / `mineFieldDelay` / `mineFieldReload` 的**现行值见上表（唯一口径）**；`mineFieldCount` 于 2026-09-30 #H2 由 5 下调，原值大于当时的 `mineMax` 使后续雷场被丢弃，详见 **§13.3**）：第一次 F 在鼠标位置显示**拟生成的雷场形状**（虚线圆 + 雷点预览，数量按当前可用余量裁剪）；第二次 F 确认 → 落点定格 → 预形态等待后在预形态位置环形生成整片雷场。**同一时刻仅允许 1 个待生成雷场**（`pendingMineFields.length>0` 时按 F 拒绝新预约——#F5 2026-09-20）。F 的按键语义为**原生 keydown 边沿**（见 §8.2「开关类副武器 F 边沿口径」）。
- **装填与触发口径（#F5 2026-09-20；#H2 2026-09-30 补齐雷场路径；#U39 2026-10-18 半径入缺省表）**：布雷受 `secondaryReloadT` 装填冷却门控——**单发路径**由 `fireActiveSecondary` 顶部统一拒绝（单发装填时长取 `WEAPON_DEFAULTS.secondary.mine_layer.reload`），**雷场路径**由 `handleMineFieldF` 在确认预约时写入 `secondaryReloadT = reload / debuffReloadRate`、冷却中按 F 拒绝（#H2 前该路径完全漏写，`secondaryReloadT` 恒为 0，冷却形同虚设且可无冷却连点）；地雷**触发半径**（单发/雷场）与 `spawnMine` 默认值、爆炸 AOE `blastRadius` **唯一数值口径 = `WEAPON_DEFAULTS.secondary.mine_layer`**（`triggerRadius` / `blastRadius`，bench 手动布雷同源）——判定为敌对实体**中心点**距离 ≤ triggerRadius；mvp 伤害走 `applySplashAt`（×0.5 衰减）、bench 走事件直算，触发阵营敌对实体生效（玩家自身也会被己方地雷波及）。**#U39（2026-10-18）：上述两个半径已从 `fireActiveSecondary` 的字面量收口进缺省表并由 `cfg` 消费** —— 否则「阔域雷场」类升级卡（`weapon_secondary_mine_radius`）写了永远不生效。**沿革**：收口前为 `blastRadius` 70 / `triggerRadius` 45 / `spawnMine` 默认 40 的字面量。

### 8.2 反坦克导弹两种制导（#E5）+ 开关类副武器 F 边沿口径（#F7）
`F` 键语义按副武器类型分派（`tank_mvp.trySecondaryFire`）：
- **锁定式（`missile`）**：F = **激活**，立即开始索敌（炮塔 ±`lockArcDeg` 扇形内最近敌对目标）→ 锁定计时满 `lockSeconds` 后**立即发射**（`updateMissileLock`，玩家侧主循环逐帧驱动）；再按 F 取消激活。飞行制导 = 追尾 + **比例引导（PN）**：`RULES.missiles.lock`（`turnRate 3.5 rad/s`、`navConstant N=3.0`）。
- **线导式（`missile_wire`）**：F = **直接发射**，飞行方向由**鼠标**持续引导（`shooter._secondaryTargetPos` 每帧更新）——等效视线角速度为 0 的比例引导；`RULES.missiles.wire`（`turnRate 4.5`、`N=0`）。已并入 `RULES.weaponTypes.secondary` 白名单与 HUD 标签/图标（「反坦克导弹（线导式）」）。**#U39（2026-10-18）：飞行速度与装填已入 `WEAPON_DEFAULTS.secondary.missile_wire`（`speed: 340` / `reload: 10` / `damage: 150` / `range: 700`）并由 `cfg` 消费**（原 `speed` 只在 `fireActiveSecondary` 的 wire 分支写死 340，升级卡无法覆盖）；同批该型补入卡牌白名单 `WEAPON_SECONDARY_TYPES` 并获得安装卡 + 2 张升级卡，见 `specs/cards.md` §8.3。
- **开关类副武器 F 边沿口径（#F7 2026-09-20）**：**"按一次切换状态"的副武器（`missile` 激活/取消、`mine_layer` 预形态/确认）一律由原生 `keydown` 边沿驱动**（`tank_mvp.html` 独立监听：`e.repeat` 过滤 + `inMenuState/statusOpen/devOpen` 门控 + 战斗态 `fireCtx` 判定），**不得**走主循环 `input.isDown('fireSecondary')` 逐帧轮询——逐帧轮询会让开关在按住期间每帧翻转（实测按住 F 250ms 内 9 次 true/false 交替），松手后的状态取决于帧数奇偶（轻按 F 约一半概率停在「已取消」，表现为「导弹按 F 没反应」）；mine_layer 更会一次按住跨帧连走「预形态→确认」（一按即预约，预形态名存实亡）。**"按住连发"类（`mortar`/`rocket`/`missile_wire`）保持逐帧轮询**（装填门控天然限速）。HUD 的 F 按钮点击走 `trySecondaryFire(true)`（`force=true` 绕过键盘边沿直调）。
- **榴弹炮（`howitzer` 副武器槽）例外口径（2026-10-20 #X5）**：该槽**本身不发射**（射击走主炮左键/空格），F 对它 = **曲射/直射模式开关**，与 `missile`（激活/取消）、`mine_layer`（预形态/确认）同属**开关类**，一律走原生 `keydown` 边沿，严禁主循环逐帧轮询。默认 `_howitzerOn !== false`（装卡即曲射）；切到直射时清 `_howitzerBurst`（丢弃未打完的急速射追发队列，防止旧模式余弹继续打出）。模式判据唯一入口 `js/tank_weapons.js` 的 `isHowitzerMode(t)` / `toggleHowitzer(t)`（`isHowitzerMode` = 槽位判据 **且** 运行时开关，2026-10-20 前只有槽位判据 ⇒ 装卡后恒曲射、F 无法切回）。~~§3.2b「F 键不响应」~~：该表述仅适用 2026-10-20 之前；#X5 起 F 承担模式开关（仍不承担"击发射击"），两处口径互补不冲突。
- **火箭巢（`rocket`）发射朝向（2026-10-20 #X4）**：弹道基础角 = **炮塔朝向**（`t.turretAngle`），**不解析 `targetPos`/鼠标位置**；整组 burst 共用该角度，每发仅叠加独立散布（`fireRocketOne` 的 `gaussian(0.02)`）⇒ 扇形齐射。其他副武器（`mortar`/`missile`/`turret`/`mine_layer`）仍按目标点解算，语义不变。~~旧口径「朝向鼠标位置」~~ 已被取代。

### 8.3 敌方 AI：反应延迟 + 全高掩体遮视野 + engage 传播（#E7/#E8）
- **反应延迟（#E7）**：首次进入接战后进入 `react` 态——只转炮塔、**不移动不开火**，时长 `RULES.ai.reactionSecondsBase~Max`（1.15~1.9s）按「距离/触发边界比」加权 × 档位 `tierProfiles[].reactionMul`（tier1 0.82 / tier2 0.65）× 随机抖动（±25%）。**仅对正式对局生成的敌军生效**（`tank_map.makeNode` 打标 `aiReactEnabled=true`；bench/单测裸实体保持即时响应）。受击惊醒（`alertEntity`）把剩余延迟 ×`reactionAlertMul`（0.5）——更快但不瞬发。
- **全高掩体遮视野（#E8）**：激活门控改为「距离达标 **且** 有视线」(`RULES.ai.engageRequiresLoS`)——建筑/岩石/树（`tier.vision===true`）挡住视线时敌人不再「进入范围立即行动」，保持 `patrol`；受击/友邻告警（携带 `lastKnownPlayerPos`）不受此门控限制，仍进入 `search` 推进。
- **engage 状态传播（#E8）**：某敌人**首次进入接战**时，把「已接战 + 已知玩家位置」传播给 `RULES.ai.engagePropagateRadius`（420px）内友邻（概率 `engagePropagateChance` 0.7），每跳半径 ×0.7、最多 2 跳（避免一处暴露唤醒全图）；被传播者各自按反应延迟行动。此前只有**受击**传播（`propagateAlert`），进入接战本身不传播。

### 8.4 HE 系击退（#E10）
击退与爆炸范围绑定：**击退距离 = `splashRadius` × `splashKnockbackMul` × (1 − dist/radius)**（线性衰减），由 `tank_physics.applySplashKnockback` 施加（`applySplashAt` 内统一调用，坦克/Boss/召唤物一视同仁），世界边界经 `setSplashWorldBounds` 钳制（mvp 进节点注入节点尺寸）。

- **逐弹种 `splashRadius` / `splashKnockbackMul` 与满命中击退量见 §3.2 总表「溅射半径与击退系数」（唯一数值口径），本节不重复罗列。**
- 其余弹种（AP/APCR/HEAT 系）无该字段 → 零溅射、零击退（行为不变）。**HE-OP 击退 > HE-VT 击退**为用户明确要求（两者 `splashKnockbackMul` 见 §3.2 表）。

### 8.5 双联火炮重做（#E13）
- **装填语义**：装填时间是**单根炮管**的装填时间；两管按**顺序流水线**装填（同一时刻只有一根在装填）——例：「装填 5s，+0s 齐射 → +5s 第 1 管装好（可单发）→ +10s 第 2 管装好（可齐射）」。
- **默认进度互相干涉**：任一击发后**两管装填进度都归 0**（`_dbState.loadT` 全清），流水线从头开始。
- **「交替装填系统」卡**（`weapon_primary_alt_reload`）：稀有度由 **legendary 升为 mythic（神话，新增最高档）**；效果 = `altReload: true` 解除干涉（击发一管不影响另一管的进度——「+6s 发射时另一管仍是 +1s 进度」）+ `switchSeconds 0.05` + `reloadMult 0.9`。
- **击发（#F 2026-09-20 用户裁定细化）**：鼠标单击 = 发射一根已装填炮管；空格 = 齐射——**仅两管都就绪才发射**，仅 1 管（或无）就绪时空格**不发射**（与卡牌界面文案「空格齐射（仅两管都就绪时）」一致）。1 管就绪时齐射被拒对玩家侧写 `shooter._dbLastBlocked = 'salvo-not-ready'` 并推送提示「空格齐射需要两管装填完成 — 单击可先发 1 根就绪管」（COVER；重复触发不刷屏，`_dbLastBlocked` 同值时静默），且**不影响随后单击单发**（单击照常发射就绪管）；无就绪管时不提示。`fireDoubleBarrel` 返回 `{ fired:false, shells:0, reason:'salvo-not-ready'|'none-ready' }`。`_dbState = { count, ready[], loadT[], loader, altReload }`。
- **视觉/音频**：炮口火光尺寸 ×1.7（粒子同步放大）、开火音效增益 ×1.6（`playSound('fire', {gain:1.6})`）+ 额外烟雾；`barrelOffset` 0.9 → **1.85**（炮管间距加大，确保炮管与附件不穿模）；**两根炮管各自绘制完整附件**（护套 jacket / 制退器 muzzle brake / 抽烟器 evac 逐管成对）。
- **HUD**：双管时显示**两根炮管各自的独立装填进度弧**（沿炮塔法向左右分列，与炮管偏移同源；就绪的管显示实心亮点），取代单环指示。

### 8.6 卡牌稀有度新增「神话」档（#E13）
`CARD_RARITIES = ['common','rare','epic','legendary','mythic']`（序号即强度序），权重 `50/30/15/4.5/0.5`；Boss 掉落白名单 `LOOT_RARITIES` 同步扩展；HUD 标签新增「神话」。Boss 保底池过滤按新序自动生效（`bossLootPool` 用 `CARD_RARITIES.indexOf` 比较）。

### 8.6b 标准主炮的规格通道（#U39，2026-10-18）
`primaryWeaponSpec(shooter)` 原实现对 `weapons.primary.type === 'standard'` **恒返回 null**，因此写进 `weapons.primary.stats` 的任何 `statOverrides` 都被忽略——所有「标准主炮」升级卡天然无效（这也是「主武器升级卡感觉没提升」的根因之一）。
现行口径：**无 stats 覆写时仍返回 null**（与既有行为逐字节一致、零回归）；**一旦 stats 非空则产出规格**（基准取 `WEAPON_DEFAULTS.primary.standard`：四个倍率均 1.0、burst 1）。于是 `damageMult / penMult / reloadMult / shellSpeedMult` 四条通道对该型全部可用，`firePrimaryShell` / `fireTank` 的既有消费逻辑无需改动。`test-fire.js` 7a2 段锁住双向语义（无覆写 → null；有覆写 → 倍率生效）。

### 8.7 摄像机随鼠标向外延伸（#E12）
`tank_camera.updateCameraLead(cam, screenX, screenY, dt)`：外延距离 = `RULES.vision.radius × RULES.camera.mouseLeadRatio`（现行 **0.40**，2026-10-21 按 `RULES.camera` 核对；沿革：本节首次落地时为 0.30） × 归一化鼠标偏移（0~1，视口半宽/半高为满值；对角方向按向量长度钳到 1），并按 `cam.zoom` 反向补偿（`mouseLeadZoomComp`，缩放不改变世界侧外延量），经 `leadLerp`(5) 指数阻尼平滑；`updateCamera` 把 `cam.leadX/leadY` 叠加到跟随目标上（视口中心 = 玩家 + 外延）——即「距离和视野绑定」。未调用 `updateCameraLead` 时外延恒 0（与旧版跟随逐字节一致）。**沿革：2026-09-21 #H1 的「视野绑定」经视口窄轴收口等距化（§10，已随 #J3 作废）；本条本身仍有效——镜头外延与可见距离无关，当前唯一消费方是摄像机跟随。**

---

## 9. 2026-09-21 用户反馈批次（#G1~#G8）现行口径
> *主题：弹夹炮（9.1）/ 武器 statOverrides 相对增量（9.2）/ 电磁炮重调与贯穿（9.3）/ APS 主动防御（9.4）/ Boss 激光转速与召唤（9.5，转速已被 §11.3 取代）/ HUD 三区（9.6）/ 装填环 reloadMult（9.7）/ 暂停商店·TAB 面板·Boss 血条（9.8）*
> *⚠️ 本节为批次章节，非主题基线。现行口径索引见卷首「§0 主题索引」。*

### 9.1 主武器第五型「弹夹炮」`clip`（#G6）

主武器类型枚举 `RULES.weaponTypes.primary = ['standard','autocannon','double_barrel','railgun','clip']`。弹夹炮参数唯一口径 `WEAPON_DEFAULTS.primary.clip`：

| 参数 | 值 | 语义 |
|---|---|---|
| `reloadMult` | 3.0 | 弹夹间整组装填 = 标准装填 × 3.0 |
| `clipSize` / `clipSizeBase` | 4 | 初始弹夹容量（发），升级卡每 +1 发 |
| `clipCycleSeconds` | 0.7 | **弹夹内**逐发间隔（固定，**不受任何 modifier/卡牌/debuff 影响**） |
| `clipSizeReloadStep` | 0.8 | 每扩容 1 发，弹夹间装填 +0.8×标准装填 |
| `damageMult` / `penMult` / `shellSpeedMult` | 1.0 | 单发伤害/穿深/弹速与标准炮一致 |

- **装填两段式**：弹夹内有弹（`rounds > 0`）→ 击发后 `reloadT = clipCycleSeconds`（硬编码、不乘任何倍率）；弹夹打空 → 进入**整组重装**（`pendingRefill = true`），`reloadT = 标准装填 × (reloadMult + clipSizeReloadStep × (size − clipSizeBase)) ÷ debuffReloadRate(t)`（**该段生效 debuff**），归零后一次性回满 `rounds = size`。**上表即本式的系数唯一口径，正文不再重复数字。**
- **弹夹间装填不随扩容线性膨胀是设计意图**：容量 4→6 时整组时间为「基准 + 2 × 步长倍率」而非线性 ×6，扩容卡仍有正收益但边际递减（具体倍数按上表系数算）。
- 运行时状态挂 `t._clipState = { size, rounds, pendingRefill }`；武器换装卡（主武器升级路径）清空该状态（与 `_dbState` 同生命周期）。逐帧驱动 `updatePrimaryClip(t, dt)` 由页面主循环负责（mvp 玩家 + AI 实体 / bench 玩家 + 靶车）。
- **HUD**：`drawReloadRing` 弹夹分支——弹夹内显示余量数字 `rounds/size` + 蓝色间隔弧；整组重装期显示橙色「装填」弧（进度按 `clipMagReloadSeconds` 归一）。
- 卡牌：`weapon_primary_clip`（epic，安装）/ `weapon_primary_clip_extended`（rare，`{"clipSize":"+1"}`，maxStacks 2）。

### 9.2 弹种/武器 `statOverrides` 支持 `"+N"` 相对增量（#G6）

升级卡（`weapon_primary_*_upgrade` / `weapon_secondary_*_upgrade`）的 `statOverrides` 值现支持三类：`number`（绝对值覆盖）、`boolean`（开关，如 `altReload`/`guided`）、`"+N"` 字符串（**在当前值基础上加 N**）。合并由 `tank_cards.js mergeStatOverrides(stats, overrides)` 统一执行（`"+N"` 走 `Number(...)+N`），主/副武器两条升级分支同源。`validateCard` 对三类值均放行，其它类型判非法。

### 9.3 电磁轨道炮强度重调（#G5）

`WEAPON_DEFAULTS.primary.railgun`（**本表是电磁炮全部数值的唯一口径**，2026-10-21 按 `js/tank_weapons.js` 核对）：

| 参数 | 现行值 | 沿革 / 语义 |
|---|---|---|
| `reloadMult` | **1.8** | 沿革 2.2 → 1.8（#G5，装填 ×1.8） |
| `damageMult` | **1.8** | 沿革 1.5 → 1.8（#G5） |
| `penMult` | **2.0** | 高穿深主通道 |
| `shellSpeedMult` | **2.5** | 全武器最快弹速 |
| `pierce` | **1** | 击穿首个目标后继续飞行的**额外**目标数（1 = 共可命中 2 个） |
| `pierceDmgMul` | **0.6** | 后续目标伤害倍率（逐个连乘） |

- 实现（`tank_fire.js`）：`firePrimaryShell` 在 `spec.pierce > 0` 时给炮弹写 `pierceLeft` / `pierceDmgMul` / `pierceHitIds`；`stepShells` 命中判定跳过 `pierceHitIds` 内实体（不重复命中原目标），PEN 结果且 `pierceLeft > 0` 时递减计数、`shell.dmg *= pierceDmgMul`、把命中点写回 `fx/fy`、`dist += step` **继续飞行**；倍率耗尽或结果为非穿透才 `dead = true`。
- 定位：高穿深 + 高单发伤害 + 贯穿 2 目标（倍率见上表），代价是装填显著变长与弹速最快；配合 APFSDS+ 高穿弹收益最大（穿深叠加后能稳定贯穿中坦正面）。
- 配套卡：`weapon_primary_railgun`（epic 安装，数值与上表同源）/ `weapon_primary_railgun_upgrade`（rare，`{reloadMult:1.7, shellSpeedMult:3.0}`）。

### 9.4 主动防御系统 APS（#G9，新技能）

`RULES.abilities.aps`：`duration` 6s / `radius` 240px / `maxIntercepts` 3 / `cooldown` 22s。

- 能力键 `aps`（runtime 键，加入 `ABILITY_KEYS_RUNTIME`）；卡牌 `ability_aps`（epic）经技能池 **1~3 号技能键**触发（无独立字母键）。
- 激活：置 `t._apsT = duration`、`t._apsHits = 0`，冷却入 `abilityCds.aps`。
- 拦截层 `updateAps(t, dt)`（页面主循环在 `stepShells` 之后逐帧调用）：`_apsT > 0` 时扫描 `shells`，**敌方阵营**弹药进入 `radius` 即销毁（`s.dead = true`）+ 拦截爆炸/音效/日志；达 `maxIntercepts` 后窗口保持但不再拦截；`_apsT` 递减至 0 自动关闭。
- 生命周期：`removeRunModifiers` 清零 `_apsT`/`_apsHits`（跨局不残留）。
- 与 `shield` 的分工：护盾是**吸收伤害**（入射角/定向/全向 + 吸收池破裂），APS 是**提前销毁弹药**（对己方无吸收池，对高爆/导弹类效果更彻底）。

### 9.5 Boss 激光炮塔转速与召唤波次（#G1/#G2）

- **激光炮塔转速**（#G1）——**已被 §11.3（#H4）取代，并经 §12.1（#I1）再降速**：~~timed modifier 源 `boss-laser-turn` + `chargeTurretTurnMul`/`fireTurretTurnMul` 乘数方案~~。乘数方案的实际角速度 = Boss 基础 `turretTurnRate`（经 tuning ×0.6 与难度乘子压低）× 0.15~0.18 ≈ 0，用户实测「炮塔又不转动了」，已废弃。**现行口径（固定角速度直驱 + 现行数值）见 §11.3 与 §12.1。**（旧指向 §10.1 系笔误——§10.x 是视野等距章节，与 Boss 激光无关，2026-10-21 修正。）
- **召唤波次兜底**（#G2）：`RULES.boss.summonWaves` 新增 `defaultPool`（缺省 `[{tankId:'dummy',count:2}]`）与 `defaultWaves`（3）。`bossSummonWave` 在配置 `summons` 为空**且** `t.boss.id` 存在时，用 `defaultPool` 补足 3 波（`hpFrom` 依次取 1.0 / 配置默认），裸测试实体的空 summons 仍返回 null（不污染单测）。5 个 Boss JSON 均已补 3 波 `summons`（`hpFrom` = 1.0/0.66/0.33 对应 100%/67%/33% HP 触发）。

### 9.6 底部 HUD 三区重设计（#G7/#G8）

`#bottomHud` 由旧「血条 + 单排按钮列」改为 **flex 三区**（`display: flex`，JS 侧 `updateBottomHud` 同步改 `'flex'`——旧 `'block'` 会杀死分区布局）：

| 区 | 容器 | 内容 |
|---|---|---|
| 状态 VITALS | `#hudVitals` | `#playerHpWrap`（血条 240×12 + 数值）+ `#hudSpeedRow`（档位 `#hudGear` D/R、`#hudSpeedVal` + km/h 单位、速度条 `#hudSpeedTrack`/`#hudSpeedFill`、公路加成 `#hudRoadBonus`） |
| 武器 WEAPONS | `#hudWeapons` | 弹种槽 `#slot1~3` + 补给键 `#btn4/5/6` + 副武器 `#btnF` |
| 技能 SKILLS | `#hudSkills` | 技能池槽 `#skillSlot1~3`（玩家指派，技能名 + 数字键 + 冷却）。**`#btnG/H` 已删除（#U42，2026-10-19——G/H 专属键退役，见 §13.2）** |

- **速度读数**：`tankCurrentKmh(t) = |t.speed| ÷ (RULES.speed.pxFactor × effMul) × kmhFactor`（`tank_model.js`，已导出）。**必须先除 `pxFactor×effMul` 再乘 `kmhFactor`**——直接乘会得到 ~208km/h 的虚高读数（`tank.speed` 已含 ×1.3 有效乘子）。速度条以 `tankKmh(t)`（极速上限）为满值。
- **技能池槽位映射（#H3 2026-09-30 重做，现行口径见 §13.2）**：`#skillSlot1~3` 的内容**直接读 `player.skillSlots`（玩家可指派）**，不再是 `cardEffects` 的自动去重序列。名称取 `ABILITY_LABELS`，冷却取 `abilityCds[key]`；点击槽位施放，`Shift+点击`改指。**原「自动按获得顺序填槽 + 专属键按钮并存」口径已废弃**（它导致同一技能两个按钮、槽满后第 4 个技能无法激活）。
- **元素 id 为测试契约**：`#reloadWrap` / `#bottomHud` / `#hintBar` 保留（smoke 依赖）；**`btnG`/`btnH`/`btnV` 三者均必须不存在**（#H3 删 btnV、#U41 删 btnG/btnH，`test-browser-run.cjs` 断言 `removed`）；bench 页**不得**出现 `#hintBar`。
- **技能获得提示补全**：`ABILITY_KEY_HINT` 补 `repair`/`medkit`/`extinguish`（4/5/6 键）与 `aps`。**#U42（2026-10-19）后文案统一「技能槽数字键」**——G/H/V 专属字母键全部退役（沿革：#H3 后曾有「仅 G/H 仍为专属字母键」的过渡口径，已终结）。

### 9.7 装填进度环漏乘武器 `reloadMult` 的修复（#G5 附带）

`drawReloadRing` 单环分支（mvp）与 bench 装填条此前用 `player.stats.reload / debuffReloadRate(player)` 作时长，**漏乘武器通道 `reloadMult`**——电磁轨道炮（`reloadMult` 数值见 §9.3，唯一口径）装填的前 44% 时间内进度环恒空、随后跳变。现统一经 `primaryWeaponSpec(player).reloadMult` 折算（双管/弹夹分支不受影响）。**本条是装填时长公式的唯一口径**：`dur = stats.reload × primaryWeaponSpec(t).reloadMult ÷ debuffReloadRate(t)`（HUD 装填环、`fireTank`、电磁炮充能进度三者同源，见 §6）。

### 9.8 暂停菜单商店入口 + TAB 面板实时刷新 + Boss 血条（#S9/#S10/#S3-UI，2026-10-14）

- **暂停菜单商店入口（#S9）**：`#pauseScreen` 恢复「商店 SHOP」按钮（2026-09-14 `DEVELOPMENT.md` §4.12 摘除后漏恢复）。点击后按钮行收起、`#pauseShopWrap` 内嵌展示局内商店（`buildRunShopInto` 与结算内嵌版 `#runShopBox` 共用列表构建，同 `RUN_SHOP_DEFS` 数据源、同 `buyRunShopItem` 购买链）；战斗中购买即时生效，「返回」回到暂停菜单；每次进入暂停态自动收起商店面板。
- **TAB 面板实时刷新（#S10b/c）**：新增 `refreshStatusPanel()`（`statusOpen && run && player` 时调 `updateStatusPanel()`）——`buyRunShopItem` 购买后即时调用；主循环 `loop()` 在非战斗态（settlement/map/pause）也调用（battle 态仍走 `updateHud` 链，避免重复）。此前面板刷新只挂在 battle update 链上，非战斗态定格在打开瞬间。
- **TAB 面板刷新路径的致命性（2026-10-15 修复，务必保持）**：`updateStatusPanel` 经 `updateHud` ← `update` ← `loop` 调用，而 `loop()` 仅在**末行**执行 `requestAnimationFrame(loop)`，且 `loop`/`update`/`updateHud` **全程无 `try/catch`** ⇒ 面板刷新函数内任何抛错都会**永久终止主循环**（游戏冻结：无模拟、无绘制）。已发生实例：#8 敌方信息区误用不存在的全局 `tanks`（正确为 `entities`，`js/tank_entity.js:12`）导致 `ReferenceError`。**约定**：新增面板刷新逻辑必须保证不抛错（未知全局一律 `typeof x !== 'undefined'` 守卫，或改走 `entities` 等既有注册表）。
- **hp_up 购买回满（#S10a，用户决策）**：`buyRunShopItem` 中 `defId === 'hp_up'` 时 `player.hp = player.stats.maxHp`——消除"249/250"式显示（#A12 差量同步只按增量抬升）。
- **Boss 血条（#S3-UI）**：`#bossHpWrap`（屏幕下方中央，`#bottomHud` 上方 104px）——Boss 名 + 560px 血条 + `ceil(hp) / round(maxHp)` 数字；`updateBottomHud` 每帧经 `entities` 取存活 `isBoss` 更新，非 Boss 战隐藏。此前全仓库无 Boss 专属 HP UI（只有 44×5px 通用浮动条）。

---

## 10. 2026-09-21 #H1 视野等距修正（**已被 §13.5 取代，仅沿革**）
> *主题：视野等距 / 摄像机轴向优势（全节已被 §13.5 取代，仅作沿革）*
> *⚠️ 本节为批次章节，非主题基线。**§10.1~§10.3 全部作废**——视野距离系统已于 2026-09-30 #J3 整体退役，现行口径见 §13.5；现行镜头外延见 §8.7。*

**用户反馈**：「重新检查摄像头随鼠标移动和视野机制，确保使用鼠标在各个方向上，可看到敌人的距离都是相同的，现在对于横屏设备，横向接近敌人依然是最有利的」。

### 10.1 轴向优势的根因

有效可见距离 = **min(视野圆边界, 屏幕边界)**（`entityHiddenByVision` 只判定视野圆；屏幕外的敌人由视口剔除天然不可见）。视野圆本身各向同性（世界空间圆 + 鼠标方向偏移），但**屏幕是矩形**：

- 横屏 1920×1080 / zoom 1：横向半幅 960px ≫ 纵向半幅 540px。
- 鼠标指向**横向**：屏幕前向容量 = 960 + 外延 270 = **1230** ≥ 视野边界 (1+0.35)×900 = 1215 → **视野圆收口**（1215px）。
- 鼠标指向**纵向**：屏幕前向容量 = 540 + 270 = **810** < 1215 → **屏幕收口**（810px）。

⇒ 横向接近敌人可见距离 1215px vs 纵向 810px（约 **1.5×**，恰为宽高比）——横屏「横向接近最有利」即源于此（镜头外延本身各向同性，不是根因）。

### 10.2 修正：视口窄轴收口（`tank_camera.visionRadiusForViewport`）

> **已被 §13.5（#J3，2026-09-30 视野距离系统整体退役）取代**：本节描述的 `visionRadiusForViewport` 及其消费方（可视圆剔除/视野虚线圈/视野卡加成）已从代码中整体删除，仅作沿革保留。**现行口径见 §13.5。**

纯函数（Node 可测）：`R = min(nominal, 窄轴屏幕前向容量/(1+bias))`，其中

- `nominal` = `RULES.vision.radius × (1 + commander_sight 加成)`（含卡牌视野加成）；
- 窄轴屏幕前向容量 = `min(vw, vh)/2 ÷ zoom + RULES.vision.radius × mouseLeadRatio ÷ zoom`（外延基准与 `updateCameraLead` 同源、含同款 zoomComp）；
- `bias` = `RULES.vision.bias`（0.35）。

收口后**视野圆在所有方向都是约束边界**（视野边界恒 ≤ 各方向屏幕边界）⇒ 鼠标指向任意方向的前向可见距离恒 = `(1+bias)×R`。

| 视口（zoom 1） | 窄半幅 | 收口 R | 前向可见距离（恒定） |
|---|---|---|---|
| 1920×1080（16:9 横屏） | 540 | **600**（基准 900 不绑定） | **810px**（= 纵向屏幕容量，**纵向体验零变化**；横向 1215 → 810） |
| 2560×1080（21:9 超宽） | 540 | 600 | 810px（**更宽的显示器不再看得更远**） |
| 1080×1920（竖屏） | 540 | 600 | 810px（纵横屏一致） |
| 3840×2160（4K） | 1080 | 900（基准绑定） | 1215px |

zoom 联动：容量按 `÷zoom` 同步缩放（zoom 0.8 → R=750 / 前向 1012；zoom 1.3 → R≈462 / 前向 623），全程保持各方向等距。

### 10.3 设计取舍与边界（几何必然）

- **保留**鼠标锚定偏移（bias 0.35）与镜头外延（#E12）：视野「朝鼠标一侧更远」的机制不变，仅轴向优势被消除（指向横向/纵向/斜向的前向距离恒等）。
- **视野圆/内圈整体缩小**（R 900→600）：纵向前向 810px 不变（此前即被屏幕收口）；纵向后向 270→390（改善）；横向前向 1215→810（目标修正）；横向后向 585→390、侧向 540 不变。
- **卡牌视野加成的边界语义**：收口绑定（小/常规屏）时名义半径不能突破屏幕容量——视野卡无法突破屏幕（这是几何上限，非缺陷）；大视口（4K 窄半幅 1080）下基准半径绑定，卡牌加成按收口上限生效（R 900 → 1125 收口 1000，前向 1350 = 屏幕容量）。
- **完全均匀气泡（各方向严格同距）与镜头外延互斥**：外延使屏幕相对玩家不对称（后向容量 = 窄半幅 − 外延 < 前向容量），严格等距需外延归零且 R ≤ 窄半幅 − 外延。本修正选择保留外延、保证**前向（鼠标指向）**距离恒等——与用户描述的「横向接近 vs 纵向接近」对比口径一致。
- 消费方（**历史**）：`tank_mvp.html visionRadiusEff()`（`entityHiddenByVision` 判定 + 视野圈绘制同源——该函数现已恒返回 `false`，见 §13.5）；镜头外延 `updateCameraLead` 不变（§8.7）。
- 回归：`scripts/test-camera.js` #H1 段——轴向等距（6 方向前向距离恒等）/ 超宽屏同上限 / 竖屏同规则 / zoom 0.8·1.3 全程等距 / 4K 基准绑定 / 卡牌边界语义 / 值域护栏。**注**：该段断言已随 §13.5 一并删除（被测对象不存在）。
- **（#H2 2026-09-21 用户裁定「纵向拉长而非削弱横向」→ 本节收口降级为放大超出适配值时的等距安全网；该整套口径随后被 §11.1 取代，并随 §13.5 一并退役。）**

---

## 11. 2026-09-21 #H3/#H4 用户反馈（现行口径）
> *主题：可见距离屏幕相对化（11.1、11.4、11.5 —— 均已被 §13.5 取代）/ 超装填删 V 键（11.2）/ Boss 激光固定转速与掩体阻挡（11.3，现行）/ 镜头外延与视野卡几何（11.5，仅沿革）*
> *⚠️ 本节为批次章节，非主题基线。现行口径索引见卷首「§0 主题索引」。*

### 11.1 敌方可见距离：屏幕相对化（#H5；**已被 §13.5 取代，仅沿革**）——曾取代 #H1/#H2

> **已被 §13.5（#J3，2026-09-30 视野距离系统整体退役）取代**：本节整节描述的「敌方可见距离」体系（`visionRadiusForViewport`、`visionCenter`、`R×zoom` 恒定、视野卡加成、可见圆剔除）已**从代码中整体删除**——用户裁定改为「全屏幕渲染敌人，不再计算视野距离」。**现行口径见 §13.5**；本节与 §10.2、§11.4、§11.5 一律仅作沿革保留。

> ⚠️ **待改标记状态更新（2026-09-23 用户裁定）**：原「暂时锚定接战距离、后续再改」的预留口径（即 `R = max(屏幕相对式, 最大 engage × 1.15)`，原登记于 `docs/PLAN.md` §3.1 与 `specs/map.md` §14.4）**已被否决**——可见半径口径**保持不变**（仍为下方屏幕相对式，`R×zoom` 恒定）。「敌人开火时看不见」改走**视野卡 + 镜头外延做强**，做法、几何上限与已核实数值见下方 **§11.5**（沿革：该方案随 #J3 一并退役）。

**用户裁定（#H5）**：「目前敌方渲染的距离写死成了像素，会受缩放影响，迫使玩家始终以最高倍率游玩，失去一些细节」——#H1 窄轴收口与 #H2 深度拉远都以「固定像素可见距离」为前提，与自由缩放根本冲突，二者废弃。

- **现行定义**（`tank_camera.visionRadiusForViewport`）：`R = screenRadiusRatio × min(vw,vh)/2 ÷ zoom × 卡牌加成系数`。**#K1（2026-09-29）移除**：原「窄轴容量/(1+bias)」收口上限 cap，以及 `bias×R` 圆心偏移。`RULES.vision.screenRadiusRatio = 1.0`；`radius`（900）保留为镜头外延基准与卡牌加成基数，不再决定可见距离。
- **视野圆心（#K1 现行口径）**：`visionCenter(cam, player, R)` = **摄像机中心**（世界边缘镜头被 `clampCamera` 钳住时向玩家收敛至偏移 ≤ `R×0.85`，保证玩家恒在圆内）。取代旧「玩家 + `bias×R` 朝鼠标偏移」——旧圆心（鼠标向量被归一化 ⇒ 偏移恒 ≈189px）与摄像机独立外延量（`mouseLeadRatio`，随鼠标 0~360px）几乎总不相等 ⇒ **视野圆探出视口最多 189px**；探出部分内的敌人「视野判定可见，却被 `aabbInView` 视口剔除 ⇒ 不渲染」，即 2026-09-29 用户反馈「敌人渲染出来的距离短于视野距离」（#K1）。
- **核心性质：R×zoom 恒定**——敌人在屏幕上的出现位置与缩放无关，玩家自由缩放（放大看细节 / 拉远看全局）不再被 gameplay 绑架；默认 zoom=1（全细节）。**#K1 新增不变量：渲染边界 ≡ 视野边界**（圆内切视口 ⇒ 视野内可见的敌人必在屏幕上并被绘制）。
- **等距与公平性保持**：同一 zoom 下横向/纵向/斜向的可见边界一致（#H1 目标）；21:9/竖屏窄半幅相同 → 同一屏幕占比（#H4/#H2 的公平性目标）。
- **卡牌加成**：commander_sight 按比例放大屏幕占比（×1.25 → R×1.25），**#K1 起不再被 cap 截断**（+25% 全额生效为 675；此前被削到 ≈667）。**已知几何边界**：半径 675 超过窄半幅 540 ⇒ **纵向被屏幕裁掉**（1920×1080 装不下），横向全额受益——长宽比的几何必然，非缺陷。
- **移除项**：`visionFitZoom`（#H2 适配拉远）、`visionUserZoom`/`visionZoomTarget`（基准×适配模型）、进节点强制缩放；`minZoom` 0.45 → **0.8**（回 P-39 原值，深度拉远不再需要）；缩放回归 P-39 原语义（滚轮 zoom-to-cursor，范围 0.8~1.3）。**#K1 追加移除**：`bias×R` 圆心偏移、收口上限 cap。`RULES.vision.bias` 不再用于视野圆心（仅保留为历史字段）。
- 回归：`scripts/test-camera.js` #H5 段（R×zoom 恒定 / 屏幕相对等距 / 超宽竖屏同规则 / minZoom 回退）+ **#K1 段**（圆心 ≡ 摄像机中心且圆内切视口：无外延 / 满外延 / 斜向外延 / 临界外延 R×0.85 四种镜头状态；镜头被钳时玩家恒在圆内；卡牌半径可超窄半幅）；smoke P-39 探针（默认 zoom=1 + 放大后 R×zoom 恒定）。

### 11.2 超装填移除 V 专属键（#H3）

**用户裁定**：「超装填在 UI 上既可以 V 键激活，也可以数字技能键激活，删除 V 键激活，作为数字键激活的技能之一」。

- `js/tank_bindings.js`：`abilityOverdrive` 键位 / ACTION_INFO / ACTION_ORDER 三处删除；键位说明面板不再输出 V 行。
- mvp：`btnV` 按钮/监听/`cdV` 冷却角标/`BTN_BY_ABILITY` 映射/isDown 轮询全部删除；overdrive 的常驻 UI = **技能池槽 skillSlot1~3**（§9.6），激活路径 = **skillHotkey(n) → DISPATCH**（与其它技能同路径）。
- bench：`abilityOverdrive` 动作与 `benchAbilityOverdrive` 删除（超装填验证走 devPanel 卡牌测试）。
- `ABILITY_KEYS_RUNTIME`/`ABILITY_KEYS`/卡牌（super_reload）不变——overdrive 仍是 runtime 技能，只是**没有专属键**。
- 回归：`test-bindings.js`（abilityOverdrive 已删除断言 + bench 键位行 7→6）；`test-browser-run.cjs`（G/H 按钮 + btnV removed）；`test-browser-r4.cjs` C3 改技能池数字键动态定位 overdrive 槽位触发。

### 11.3 Boss 激光炮塔固定转速 + 全高掩体阻挡（#H4）

**用户裁定**：「boss 发射激光时，炮塔又不转动了？我需要它以一个固定、较慢的速度转动，给玩家走位的机会，且会被建筑、岩石等全高掩体阻挡」。

- **固定角速度直驱**（取代 §9.5/#G1 的乘数方案）：激光期（蓄能+射击）由 `updateBossLaser` 直接推进 `t.turretAngle`，角速度 = `RULES.boss.laser.laserTurnSpeed`（绝对值、不受 modifier/难度乘子影响）；转向目标 = AI 本帧期望方向（`opts.turretDesired`，已含射界钳制），到向即停。**现行角速度值见 §12.1（唯一数值口径）**；本节落地时为 0.55 rad/s，已由 2026-09-21 #I1 下调。
- **AI 转炮抑制**：激光期置 `t.bossLaserHoldTurret = true`，mvp AI 循环据此跳过炮塔驱动（车体机动/开火不变）——两套驱动不再叠加；激光结束/冷却/未解锁/死亡自动释放。
- **全高掩体阻挡**：伤害循环逐目标做炮口→目标连线 × OBB 遮挡判定（`_laserBlockedByCover`，自包含零依赖实现；`opts.covers` 注入节点掩体）——判据 `tierGroup:'structure' && vision`（**building/full/intact/rock/ruined**）；被挡目标本帧不掉血（`laserBlocked` 事件），光束继续存在；灌木/栅栏/水/泥/路/残骸不阻挡；掩体被摧毁后自动失去阻挡（hp<=0 跳过）。**沿革**：2026-09-21 #I2 起改光束级截断（取代逐目标连线判定），见 §12.2。
- `RULES.boss.laser`：本节新增 `laserTurnSpeed`（初值 0.55，现状见 §12.1）/ `blockByFullCover: true`；删除 `chargeTurretTurnMul`/`fireTurretTurnMul`（含 `BOSS_LASER_TURN_SOURCE` 导出与 `_setBossLaserTurretMod`/`_clearBossLaserTurretMod`）。
- 回归：`scripts/test-boss.js` #H4 段——hold 标志/固定转速单帧转角与到向即停/hold 释放/建筑与岩石阻挡/灌木与空场不阻挡。

### 11.4 敌方可见距离不得写死像素（#H5，见 §11.1）

> **已被 §13.5（#J3，2026-09-30）取代**：本条所述「可见距离」机制随视野系统整体退役，`RULES.vision` 仅作历史留档、不再参与任何判定。以下为沿革原文。

**用户裁定**：「目前敌方渲染的距离写死成了像素，会受缩放影响，迫使玩家始终以最高倍率游玩，失去一些细节」——本条即 §11.1 屏幕相对化的直接动机：#H1/#H2 系列以固定像素（900px 世界半径）定义可见距离，缩放直接改变敌人的屏幕出现位置，#H2 只能靠强制拉远补偿。现行口径 = §11.1（屏幕相对，R×zoom 恒定，缩放纯视觉偏好）。

### 11.5 镜头外延量与「视野卡收益」的几何关系（2026-09-23 B 档落地；**已被 #K1 与 §13.5 取代，仅沿革**）

> **⚠️ 本节已被 #K1（2026-09-29）取代**，并随 **#J3（2026-09-30，视野距离系统整体退役）** 一并作废：可见半径的**收口上限 cap 与 `bias×R` 圆心偏移已移除**（圆心改取摄像机中心 ⇒ 圆内切视口），随后整个可见距离体系下线（视野卡 `commander_sight` 亦删除）。本节保留为**沿革记录**，现行口径见 **§13.5**。

- **旧公式（已废止）**：`R = min( screenRadiusRatio × 窄半幅/zoom × (1+视野卡加成), ((窄半幅 + radius×mouseLeadRatio)/zoom) / (1+bias) )`，圆心再朝鼠标偏移 `bias×R`（0.35）。
- **旧口径的残留缺陷（#K1 根因）**：圆心偏移恒为 `bias×R ≈ 189px`（鼠标向量被归一化），而摄像机外延量独立地随鼠标偏移在 0~360px 变化 ⇒ 两者几乎总不相等 ⇒ **圆探出视口**（外延 < 189 时向前探出、外延 > 189 时向后探出）。外延为 0（鼠标居中）时前向探出达 189px ⇒ 该带内敌人「判定可见却不渲染」= 2026-09-29 用户反馈 #K1。抬 `mouseLeadRatio`（0.30→0.40）只能让**满偏转**时不再探出，鼠标居中时仍探出。
- **沿革数值**：`mouseLeadRatio 0.30` 时 `cap = 600` ⇒ +15%/+25% 两卡同被压到 `R = 600`（实得同为 +11.1%）；`0.40` 时 `cap ≈ 667` ⇒ +15% 足额 621、+25% 实得 +23.5%；**#K1 起无 cap ⇒ +25% 全额 675**。
- **现行激活窗口边界**：接战距离上限 `650px`；无卡前向可见 = `R + 外延`（外延 0 时 540、满偏 360 时 900px）⇒ **鼠标朝推进方向时开火前可见，鼠标居中时仍可能「激活→可见」存在窗口**（设计边界，用户已接受）。

---

## 12. 2026-09-21 #I 批次用户反馈（现行口径）
> *主题：Boss 激光期车体冻结与降速（12.1）/ 蓄能虚线与光束掩体截断（12.2）/ Boss 随机走位（12.3）/ 建筑密度（12.4，地图侧归口 `specs/map.md` §13.4）*
> *⚠️ 本节为批次章节，非主题基线。现行口径索引见卷首「§0 主题索引」。*

### 12.1 Boss 激光期车体冻结 + 炮塔再降速（#I1）

**用户裁定**：「boss 发射激光时车体不能移动，炮塔转速再降低」。

- **车体冻结**：激光期（蓄能+射击）新增 `t.bossLaserHoldMove = true`——接入层（mvp AI 循环）据此**连 `driveTank` 一并跳过**，车体全程定桩（此前仅抑制炮塔转炮，车体仍被 AI 驱动）。激光结束/冷却/未解锁/死亡自动释放；走位博弈完全交给玩家。
- **炮塔再降速**：`RULES.boss.laser.laserTurnSpeed` **0.55 → 0.35 rad/s（≈20°/s）**——**本节是该参数的唯一现行数值口径**（2026-10-21 按 `RULES.boss.laser` 核对 = 0.35）。仍为固定角速度直驱（绝对值、不受 modifier/难度乘子影响），蓄能期与射击期相同。
- **量化意义**：激光周期 41 帧 × 0.035 = 1.435 rad < π/2(1.571)——**单次激光周期内炮塔转不满 90°**，玩家的绕侧/走位窗口显著变宽（回归断言锁定该上限）。
- 回归：`scripts/test-boss.js` #I1 段（蓄能期 holdMove / 释放 / `laserTurnSpeed` 等于上条现行值）+ #H4 段改为「限速转角 ≤ min(帧数×步长, π/2)」的动态断言。

### 12.2 蓄能虚线与光束反映掩体阻挡（#I2）

**用户裁定**：「激光路径被建筑物阻挡时，虚线框要反映出来」。

- 新增 `_laserBeamBlockDist(bx, by, angle, length, covers)`：沿光束方向求最近**全高掩体**（`tierGroup:'structure' && vision`，即 building/full/intact/rock/ruined）的**入口距离**（Liang-Barsky 射线×OBB，局部系 slab 裁剪取 `t0`），无阻挡返回全长。
- **伤害口径改为光束级截断**（取代 #H4 的逐目标连线判定）：目标沿光束投影 `proj > blockDist` 即被挡住，本帧不掉血（`laserBlocked` 事件）。光束与虚线共用同一 `blockDist`，判定与表现严格一致。
- **绘制层**：`laserCharge`/`laserFire` 事件均携带 `blockedDist`；mvp 的警示带/光束按 `blockedDist` 截断绘制，并在截断点画橙色阻挡标记（可直读「掩体后方安全」）。
- 掩体被摧毁（hp≤0）后自动失去阻挡；灌木/栅栏/水/泥/路/残骸不阻挡。
- 回归：test-boss #I2 段——蓄能/射击事件 `blockedDist ≈ 建筑入口`（墙心 150、宽 60 ⇒ 入口 120 − 炮口偏移）；无掩体时 = 全长；被挡目标不掉血。

### 12.3 Boss 随机走位（反站桩）（#I4）

**用户裁定**：「增加 boss 随机移动、瞄准等动作，现在的 boss 几乎完全是站桩等玩家」。

- 新增 `RULES.ai.bossWander`：`{ enabled, intervalMin 2.2, intervalMax 4.6, distMin 240, distMax 520, waypointReach 90, clampMargin 140 }`。
- `updateBossBehavior` 周期性在**玩家周围**随机选航点（环绕半径 240~520px，保持交战距离），写入 `t._bossMoveOverride = { turn, move }`；mvp AI 循环对 Boss 用该覆盖替换 `aiDecide` 的车体 `turn/move`——**炮塔仍照常锁定玩家瞄准开火**（瞄准动作保留）。
- 换点条件：到点（<90px）或超时（2.2~4.6s）；航点按 `clampMargin` 钳进节点边界。
- **豁免**：`crush` 风格（冲撞碾压为身份）、weave 冲刺窗口、激光期（`bossLaserHoldMove`）、目标已毁。hold/skirmish/command/fortify 全部获得机动。
- 回归：test-boss #I4 段——覆盖产生且 `move=1` 出现 / 航点环绕玩家且落在 [distMin,distMax] / 边界钳制 / 激光期与 crush 豁免 / 目标死亡无覆盖。

### 12.4 建筑密度提升与 Boss 战图加成（#I3，地图侧现行口径见 `specs/map.md` §13.4）

**用户裁定**：「继续增加地图、特别是 boss 战地图的建筑密度」——**地图生成参数（`RULES.nodeMap.building` 的 `clusterPerJunction` / `maxPerNode`、`bossDensity` 乘子）的现行数值一律以 `specs/map.md` §13.4 为唯一口径，本节不重复罗列。** 本条只保留战斗侧的实测结论：修掉 #E3/#G 遗留缺陷（`fits()` 对含道路的 outCovers 用 pad 34 判重叠 ⇒ 沿路/路口建筑恒被拒绝、密度参数完全空转）后，实测 8-seed 结构数 87 → 103（×1.6）；校准基线第三次重锚（`test-nodegen-calibration`，连通性维持 0.999~1.000）。

---

## 13. 2026-09-30 #H 批次用户反馈（现行口径）
> *主题：敌军固定基准（13.1）/ 技能槽指派（13.2）/ 布雷门控（13.3）/ 难度数值调优（13.4）/ 视野系统退役（13.5）/ 地雷上限·主武器换装重置（13.6）/ 接战机动随机化（13.7）/ 交战结构重做（13.8）/ 岩石卡死修复（13.9）*
> *⚠️ 本节为批次章节，非主题基线，但**承载了多条现行核心口径**（尤其 §13.1/§13.4/§13.5/§13.7/§13.8）。主题导航见卷首「§0 主题索引」。*

### 13.1 敌军数值基准：固定基准（#H1）

**用户裁定**：「敌人难度不应随**局外商店升级**变化，只应随节点推进变化」。

- **问题定位（实测）**：难度曲线本身与商店无关——`difficultyForIndex(index, difficultyLevel)` 只吃节点索引与跨局等级，且 `difficultyLevel` 每次新局强制归零。真正的放大来自**两条以玩家为锚的链路**：
  1. `applyEnemyAppearanceAndStats`（`js/tank_model.js`）把敌军 `base.{maxHp,penetration,damage,reload,maxSpeed,turnRate,turretTurnRate}` 与 `armor.*` 全部写成 `玩家 anchorStats × RULES.enemyClassProfiles[class]`；锚点快照在 `applyUpgrades()` **之后**冻结，故局外永久升级直接乘进全部敌军基准。
  2. `difficultyCapMuls` 的穿深封顶 / 伤害地板与天花板 / 速度目标全部乘 `player.stats`。
  ⇒ 商店每买一级，下一局全部敌军同比例抬升，玩家成长收益被难度同步抵消。实测：五项永久升级买满后，同一节点敌军穿深 149.96→173.60、伤害 35→45.50、血量 64.29→104.47，而 `node.difficulty` 与节点难度序列完全不变。
- **现行口径**：
  - 新增 **`RULES.enemyAnchorBase`**（与玩家无关的固定基准，取中位中坦量级）：`maxHp 100 / penetration 120 / damage 34 / reload 1.3 / maxSpeed 120 / turnRate 2.0 / turretTurnRate 2.2 / shellSpeed 1200 / weight 50 / enginePower 700 / armor{hull,turret}{front 100, side 40, rear 25}`。
  - 敌军数值 = `enemyAnchorBase` × `enemyClassProfiles[class]` × `entityMults(diff)` × `difficultyCapMuls`（改按固定基准）。**玩家选车、局内卡牌、局外永久升级一律不影响敌军强度**；敌军强度只由节点难度 `diff` 决定。
  - 四个封顶键**改按固定基准**并改名：`penCapVsBaseline`(1.2) / `dmgFloorVsBaseline`(0.4) / `speedVsBaseline{baseFloor 0.3, baseCeil **0.5**, randMin .85, randMax 1.15}`；`dmgCapAmmoMult`(0.7) 保留，参照终伤缺省由新键 **`strongestAnchorMult`(2.33)** × 基准伤害推算（**不再退化为 `Infinity` = 无上限**）。**本节是这四个封顶键的唯一数值口径**（2026-10-21 按 `RULES.difficulty` 逐键核对）。（沿革：`speedVsBaseline.baseCeil` 2026-10-01 由 0.6 下调至 **0.5**，裁定见 §13.4。）
  - **废弃**：`applyEnemyAppearanceAndStats` 第三参 `anchorStats`（保留形参仅为兼容旧调用方，**函数内忽略**）、`applyDifficultyMults` 的 `strongest` 传参、mvp 的 `playerAnchorStats` 及其 3 处赋值、bench/测试中的 `anchorStats: player.stats`。
- **沿革**：原 P-46「玩家基准锚定制」设计意图（保证节点 1 与玩家出厂配置匹配）已被本条取代——同一节点对所有玩家难度一致优先于该匹配。
- **回归**：`scripts/test-modifiers.js` #H1 段——`enemyAnchorBase` 已定义、**强弱玩家下 `penMul`/`speedMul` 逐值相同**、传玩家基准不改变敌军 `base`、缺 `strongest` 时天花板有确定值。

### 13.2 技能槽指派体系：玩家选择顶替（#H3/#H4）

**用户裁定**：「循环复用，按玩家选择顶替掉某个槽位的技能」。

- **原缺陷（实测）**：`skillHotkey` 用 `owned[num-1]`（`owned` = `cardEffects` 去重顺序）导致：① `artillery`/`shield` 既有专属键按钮（`btnG`/`btnH`）又自动进槽 ⇒ **同一技能两个按钮**；② 运行时键 7 个 > 槽位 3 个且 TAB 面板无激活入口 ⇒ **第 4 个及以后的技能彻底无法激活**；③ `owned` 不足时回落 `fallbackList(['deploy_cover','artillery'])` ⇒ **按隐藏的 3 号键会实际触发 1 号槽的技能**。（注：此处「7 个」为 2026-10-20 #W9 删键**之前**的实测数；现行 RUNTIME 为 5 键，见 §4。）
- **现行口径**：
  - **槽位 = `player.skillSlots`**（长度 3，元素为 ability key 或 `null`），随局重置（`prepPlayerForRun` 清空）。
  - **指派流程**：新技能先自动填入空槽；**槽满时弹「技能槽指派」面板（`#skillSlotPicker`）列出 3 个槽各显当前技能，玩家点哪一格，新技能就顶替哪一格**。待指派技能进入队列**逐个弹出**（不静默丢弃）。`Esc` 关闭面板并吞键（不误触发暂停或施放），面板打开期间输入控制器 `gate` 拒绝全部按键。
  - **随时改指**：`Shift+点击`槽位按钮 → 面板列出全部已获得技能（含「清空该槽」）。
  - **数字键严格映射槽位**：`skillHotkey(n)` 只读 `skillSlots()[n-1]`，**空槽无任何效果**（**已删除 `fallbackList` 回落**）。技能键 → 激活动作由 `SKILL_DISPATCH` 单一表分发。
  - **~~专属键按钮~~（已被 #U42 取代，2026-10-19）**：`btnG`/`btnH` 专属键按钮与 G/H 键位**已整体退役**（沿革：#H3 曾按「未占用槽位时显示」折中保留——但双通道仍致同一技能两个键位，且 H 键=定向护盾与技能池=全向护盾**行为不一致**）。现行：**全部运行时技能（2026-10-20 #W9 后为 5 个，见 §4）只经技能池 skillSlot1~3 + 数字键 1/2/3**；`KEY_BINDINGS` 的 `abilityStrike`/`abilityShield` 键位、说明行、ACTION_ORDER 同步删除；mvp 的 G/H 主循环轮询、btnG/btnH 元素、`SKILL_DEDICATED_KEYS` 常量、脉冲回退表 `BTN_BY_ABILITY` 一并移除。bench 测试台保留 G 键为**测试入口**（`KEY_BINDINGS.benchTestStrike` 路由，`activateAbilityForTest` 无卡自动补卡，非正式游戏键位）。同先例：#H3 删超装填 V 键。
  - **角标语义**：技能槽角标为数字 `1/2/3`（对应 `KEY_BINDINGS.skill1~3`）；**弹种槽角标改为选中指示 `●/○`**，其 `title` 统一为「Q/E 环形切换 / 点击选择」——数字键归技能池，弹种切换走 Q/E（消除「按 1 切第一发」的误导）。
- **不变量（#U41 收紧）**：**技能键位单一来源**——运行时技能只存在「技能池槽位」一个入口（无专属字母键、无并列按钮）；innate 三键（repair/medkit/extinguish）是设计上正确的专属键（开局固有、不占技能槽，4/5/6）。
- **回归**：`scripts/test-browser-r4.cjs` E 段——`btnG`/`btnH` **已从 DOM 移除**（#U41）、槽满弹选槽位面板、玩家指定顶替、循环复用不产生重复入口、空槽按数字键不触发、数字键精确命中；C1/C2 段炮击/护盾改经技能池数字键触发。`scripts/test-bindings.js`——`abilityStrike`/`abilityShield` 键位与说明行已删除断言。

### 13.3 布雷器可用性与装填门控（#H2）

**用户反馈**：「地雷无法释放」。

- **原缺陷**：`RULES.abilities.deploy_limits` 中 `mineFieldCount(5) > mineMax(3)`，而生成侧 `n = min(mineMax, count)` 把 5 钳成 3，配上「`existing + n > cap` 即拒绝」的判据 ⇒ **首轮布满 3 枚后所有后续雷场 100% 静默丢弃**；`handleMineFieldF` 既不检查也不写入 `secondaryReloadT`，15s 装填完全失效；绘制层二次用 `mineMax` 钳制，预形态与实际落点数对不上。
- **现行口径**：
  - **落雷数按可用余量裁剪** `n = clamp(mineFieldCount, 0, cap − existing)`，预约时与生成时各裁一次；**余量为 0 才拒绝，且在按 F 的瞬间即提示**（不再让玩家白等 4s）。#F6「超限拒绝且保留已布地雷」原意保留。
  - `mineFieldCount` 的现行值由 §8.1 的 `deploy_limits` 表承担唯一口径（**沿革：2026-09-30 #H2 由 5 → 3**，因旧值 `5 > mineMax(3)` 使后续雷场恒被丢弃）；若要更大的单次雷场应同步上调 `mineMax`。
  - **装填门控**：确认预约时写入 `player.secondaryReloadT = reload / debuffReloadRate`（`RULES.abilities.deploy_limits.mineFieldReload = 15` 兜底），冷却中按 F 直接拒绝并提示——与单发布雷路径（`js/tank_weapons.js` `fireActiveSecondary`）同口径。
  - 绘制层直取预约时的数量（`pf.count`），所见即所得。

### 13.4 敌人难度数值再调优（2026-10-01 用户裁定，现行口径）

**用户裁定（三条）**：① **降低速度上限倍率**；② **提高敌人（包括 Boss）血量**；③ **略微提高敌人升级速度**（敌人随节点推进变强更快 ⇒ 难度曲线现行口径见 `specs/map.md` §16）。

- **现行值（`RULES.difficulty`，2026-10-21 按 `node -e require('./js/tank_rules.js').RULES` 逐键核对）**——**本节是 `entityMults` 的唯一数值口径**，§5、§13.1 等其它节只讲机制、不再罗列区间：
  - `entityMults.maxHp` **[0.6, 2.2]**（沿革 `[0.45, 1.4]` → `[0.5, 1.7]`（2026-10-01）→ **`[0.6, 2.2]`**（2026-10-15 #6，成长更快））；
  - `entityMults.penetration` **[0.8, 1.5]**（沿革 `[0.75, 1.25]`；2026-10-15 #6）；
  - `entityMults.damage` **[0.8, 1.5]**（沿革 `[0.75, 1.2]`；2026-10-15 #6）；
  - `entityMults.armorAll` **[0.6, 1.3]**；
  - `entityMults.reload` **[1.25, 0.82]**（低难度 ×1.25 慢装填 → 高难度 ×0.82 快装填；区间端序随难度递增而递减，非笔误）；
  - `entityMults.spreadMult` **[1.3, 0.78]**（同上，端序递减）；
  - `entityMults.aimSpeed` **[0.8, 1.35]**；
  - `entityMults.maxSpeed` **[0.7, 1.0]**（沿革 `[0.7, 1.15]`；满难度极速上限倍率 −13%）；
  - `entityMults.turnRate` **[0.7, 1.2]**；
  - `entityMults.turretTurnRate` **[0.7, 1.25]**；
  - `speedVsBaseline.baseCeil` **0.5**：数值与其余封顶键**唯一口径见 §13.1**，本节只记裁定时点与效果（沿革 0.6 → 0.5，2026-10-01）——**低难度敌军速度不变、难度曲线更平缓**。
- **生效范围（重要）**：普通敌军的极速最终由 `speedVsBaseline` 封顶公式覆盖（`difficultyCapMuls` 与「直写 stats」逐值等价）⇒ `entityMults.maxSpeed` 上限下调**主要作用于 Boss 与其它未封顶路径**（Boss 经 `applyDifficultyMults(..., applyPlayerCap=false)` 跳过封顶）；血量无封顶键，故两端（普通敌人 + Boss）同时受益。
- **#6（2026-10-15）穿深封顶由「单局不生效」转为「中段即生效」（重要副作用）**：`penCapVsBaseline 1.2` 未随 `entityMults.penetration` 上调而调整 ⇒ 触顶阈下移。旧档位触顶需 `diff ≥ 1.035`，**高于单局 `curveCap 0.95`**，故单局内敌军穿深**永不触顶**（仅跨局等级 ≥3 级才可能触及，`diffMax 1.15` 内）；新档位触顶阈降至 `diff ≈ 0.657`（≈ **index 8**），即 **index 8 起敌军穿深锁定 `enemyAnchorBase.penetration(120) × 1.2 = 144mm` 不再成长**（index 0→7 仍线性 107 → 141mm）。伤害天花板仍未触顶（最难档 medium 未封顶值 51.0 < `cap 55.45`；仅 heavy/spg 兵种触及）。
- **Boss 血量**：归口 `specs/boss.md` §5（`tuning.hpMul` 的现行值与沿革均以该节表为准；Boss 血量 = 出战配置 maxHp × hpMul × `entityMults.maxHp(diff)`，两级叠加——`entityMults.maxHp` 见本卷 §13.4）。
- **实测增幅（2026-10-01 探针；`enemyAnchorBase.maxSpeed = 120`、`randFactor = 1`）**：

  | 节点 index | diff（旧→新） | 普通敌人血量倍率（旧→新） | 普通敌人极速 px/s（旧→新） | Boss 血量倍率（旧→新） |
  |---|---|---|---|---|
  | 0 | 0.15 → 0.15 | 0.574 → 0.657（**+14.5%**） | 36.0 → 36.0（不变） | 4.59 → 5.91（**+28.8%**） |
  | 4 | 0.35 → 0.36 | 0.739 → 0.876（**+18.5%**） | 45.0 → 42.3（−6.0%） | 5.91 → 7.88（**+33.4%**） |
  | 8 | 0.63 → 0.64 | 0.970 → 1.168（**+20.4%**） | 57.6 → 50.7（−12.0%） | 7.76 → 10.51（**+35.5%**） |

  含每辆 `randFactor` 上限（1.15）时的极速上限：**82.8 → 69.0 px/s**（高难度）。上表为 **2026-10-01 档位的历史探针**，未被 #6 取代的部分（极速封顶链）仍有效；血量/穿深当前值见下。

- **#6 后实测（2026-10-15 复算；`entityMults` 新档 + `curvePow 1.0`）**：

  | 节点 index | diff | `entityMults.maxHp` | 普通敌人血量 = 100 × 倍率 | 敌军穿深未封顶 → 封顶后 |
  |---|---|---|---|---|
  | 0 | 0.15 | 0.809 | 80.9 | 107.0 → 107.0 |
  | 4 | 0.42 | 1.184 | 118.4 | 126.7 → 126.7 |
  | 8 | 0.68 | 1.546 | 154.6 | 145.7 → **144.0（触顶）** |
  | 12 | 0.95 | 1.922 | 192.2 | 165.4 → **144.0（触顶）** |

- **回归锚点**：`scripts/test-panels.js` 速度封顶断言重锚 **72 → 60 px/s**（= 0.5 × 基准 120）；`scripts/test-modifiers.js` #H1 段的封顶/地板/速度公式按 `RULES.difficulty.speedVsBaseline` **动态自算**，且其 #H1 分支夹具**由 `penCap`/`floor`/`cap` 反推**（2026-10-15 修复：旧夹具写死 `base` 绝对值，`entityMults` 上调后越出阈值导致 4 断言误失败）；`scripts/test-map.js` 的 `entityMults` 端点断言以 `RULES.difficulty.entityMults` 为唯一真值（同为动态）。

### 13.5 视野距离系统退役（#J3，2026-09-30）

**用户裁定**：「改为全屏幕渲染敌人，不再计算视野距离的问题。敌人 AI 是否被触发维持为距离 + 是否有直线视野（建筑或草丛、树冠等）」。

- **退役范围（全部删除，不留死开关）**：
  - `js/tank_camera.js`：`visionRadiusForViewport` / `visionCenter` / `visionClamped` 三个视野圆几何函数及其导出。
  - `tank_mvp.html`：`entityHiddenByVision` 的剔除逻辑（保留同名函数恒返回 `false` 以兼容既有调用点）、视野虚线圈绘制、`visionRadiusEff` 的卡牌加成与屏幕相对计算。
  - `js/tank_devpanel.js` + mvp/bench 接线 + `types/globals.d.ts`：dev 面板「无视野」开关（`noVision`）——它控制的正是已下线的剔除，留着会误导调试者以为还有视野机制。
  - `cards/support_commander_periscope.json`（车长潜望镜 +15%）与 `cards/sniper_commander_sight.json`（车长观瞄镜 +25%）：唯一消费者是可见半径，视野下线后成**死效果卡**，按 2026-09-23 A 档先例整体删除；`tank_cards.js` 的 `PASSIVE_KEYS` 移除 `commander_sight`。卡池 168 → 166。
- **现行口径**：敌对实体**一律渲染、一律可被命中**；画面上只剩 `aabbInView` 视口剔除（纯性能，不是玩法机制）。`RULES.vision` 仅作历史配置留档（`__TEST__.visionZoom()` 调试钩子仍读名义值），不参与任何渲染/命中/剔除判定。
- **明确不受影响（用户要求的第二半）**：敌人 AI 的接战判定一直是、现在仍是 **「距离 + 直线视野」**——`js/tank_ai.js` 的 `cfg.engageRequiresLoS`（`RULES.ai.engageRequiresLoS = true`）要求激活时 `hasLineOfSight` 通过；遮挡由 `js/tank_cover.js hasLineOfSight` 按掩体的 **`vision: true`** 键判定（建筑 `full`/`building`/`intact`/`ruined`/`rock`、树 `tree`、灌木 `bush`、倒树 `fallen` 遮视线；栅栏 `soft`、沙袋 `barricade`、残骸、水/泥/路**不遮**）。该体系与视野距离系统各自独立，`tank_fire.js` 的 `hiddenByVision` 命中剔除钩子随视野系统一并移除（否则会出现「看得见却打不中」）。
- **回归锚点**：`scripts/test-camera.js` 删除原 #H5/#K1 视野圆断言段（被测对象已不存在），保留 `aabbInView` 视口剔除与 `minZoom` 断言；`scripts/test-browser-r4.cjs` F3 段断言 `entityHiddenByVision` 恒 `false` 且 `hasLineOfSight` + `engageRequiresLoS` 仍在。

### 13.6 地雷可连续布设（#J1）与主武器换装重置（#J2）

- **#J1（2026-09-30 用户反馈「地雷在 1 个节点内似乎只能部署 1 次」）**：`RULES.abilities.deploy_limits.mineMax` **3 → 6**、`mineMaxHardCap` **8 → 12**（**现行值唯一口径见 §8.1 的 `deploy_limits` 表**，本节只记这次调整的动机与沿革）；`mineFieldCount` 保持 3。
  - **根因**：`mineMax` 是「**场上同时存在**的地雷数」上限，而它恰等于当时的单次雷场数量 ⇒ 首轮即把上限用尽；地雷存续 30~45s、单节点战斗远长于此 ⇒ 后续雷场全部被拒。
  - **口径澄清**：`mineMax` 是**同时在场数**，不是「本局总数」。调大它才能让一个节点内连续布设多轮；想要更大的单次雷场应同步上调 `mineFieldCount` 与 `mineMax` 两者（#H2 的「按可用余量裁剪」落雷逻辑保持不变）。
- **#J2（2026-09-30 用户反馈「获得电磁炮后再获得其他主炮，似乎会继承可穿透弹药的特性」）**：`js/tank_cards.js` 主武器 `install` 在**换型**时先重置 `stats` 为该型基准（`getWeaponDefaults('primary', wType)`），再合并卡牌 `statOverrides`。
  - **根因**：旧实现 `Object.assign({}, 旧 stats, overrides)` 把旧武器专有键一并带进新武器 —— 最典型的是 `railgun` 的 `pierce`/`pierceDmgMul`（`js/tank_fire.js firePrimaryShell` 据此赋予弹体贯穿能力），于是换上任何其他主炮后仍能贯穿两辆坦克。
  - **同型安装保持合并语义**（幂等，不丢 `tanks/*.json` 自定义数值）；副武器 install 原本就用 `getWeaponDefaults` 构造新对象，无此缺陷（两条路径现共用 `_weaponDefaultsResolver()`）。

### 13.7 接战机动随机化（#M，2026-10-01，现行口径）

**用户裁定**：「敌人接近玩家时，要有多种行为：直线/斜线/曲线行进或后退，行进时/短停后开火，其行进的角度、距离、短停的时间也随机，以增加随机性。」

- **问题定位（实测）**：改前敌人接近玩家只有单一轨迹——`aiDecideEnemy` 按单点 `engage`(520px) 决策 `dist>engage→move=1`，即**恒定直线冲脸**；偏航只来自 #83 peek（±0.5rad 叠加）与 #88 侧摆（装填期 ±0.78~1.57rad），二者都是**单帧叠加角**而非持续轨迹，开火时刻也由装填结束决定 ⇒ 整簇敌人以同节奏逼近，玩家读出「一坨直线压过来」。

- **现行口径（`RULES.ai.maneuver`，消费方 `js/tank_ai.js` `_maneuverRoll` / `_applyManeuver`）**：
  - **机动脚本**：敌人接战时懒分配一个脚本（挂 `t._mv`），一次性随机决定 **机动类型 + 偏角 + 行程 + 短停时长**；走完或超时即**重掷**，轨迹持续碎化。五种类型与权重：`direct` 直线 3 / `slant` 斜线 4 / `curve` 曲线 4 / `arc` 弧线绕行 3 / `retreat` 后撤 2。
  - **偏角随机**：斜线 `slantAngle[0.35,1.15]`、弧线 `arcAngle[0.8,2.0]`、曲线起始 `curveAngle[0.25,0.95]`；曲线另有 `sweep∈[0.5,1.9]`，**与起始偏角反号** ⇒ 偏角必然穿过 0，轨迹呈 **S 形回正**而非单向甩开。
  - **行程与重掷**：`reRollDist`(90px) / `reRollTimeMax`(4.5s) 任一达成即重掷；`retreat` 另有 `retreatDist[120,320]` 与独立时限 `retreatT[0.5,1.4]`。
  - **短停与开火节奏**：每段脚本结束按 `holdChance`(0.35) 进入短停，时长 `hold[0.4,1.8]`s；**短停期间 `move=0` 但炮塔照常锁敌、可开火** ⇒ 形成「行进时开火 / 短停后开火」两种节奏。短停结束**当帧**把开火容差放宽到 `resumeAimTolMul`(1.8) 倍（单帧峰值，随后即回到常规容差、同时重掷下一段脚本），与既有 `reactionJitter` 叠加 ⇒ 敌人不会整簇同时开火。
  - **装填期偏置（承接 #88）**：装填前段（`reloadT > stats.reload × reloadGapFrac(0.3)`）改用 `reloadGapWeights{direct:1, slant:4, curve:3, arc:4, retreat:1}`（压低直冲、抬高侧向）并把前进压为 `reloadGapCreep`(0.35) 微速蠕行。**普通敌人的装填期躲避机动由此统一承担，旧 #88 `sideSwing` 仅保留 Boss 路径**（沿革：#88 原对普通敌与 Boss 均生效，见 `DEVELOPMENT.md` §4.43）。
  - **不覆盖的语义（刻意保留）**：① 机动层只在「需要移动」时改写轨迹方向——**已被 §13.8 #N 修订**：初版仅保护 `baseMove===0`（驻停），`baseMove<0`（退让）仍被机动层 `move=+1` 覆盖，致使敌军「退着退着又贴上来」，现收窄为**只接管 `baseMove>0`**（接近），驻停与退让一律确定性，见 §13.8 实现期缺陷 ①；② **Boss 与 SPG 定距车（`classProfiles.spg.keepRange`）不启用机动层**——二者的角色定位就是「始终推进」/「保持距离」，随机化会破坏角色辨识度；③ `flank`/`coverSeek`/`stunned` 等特殊态优先级高于机动层；④ 脱离接战即 `t._mv = null`，下次接战重新抽取（不留陈旧偏角）。
  - **回退开关**：`RULES.ai.maneuver.enabled = false` 完全退回改前的直冲语义（`keepMove` 透传原 `baseMove`）。
- **回归**：`scripts/test-ai.js` 新增 **#M 段 13 项**——5 种类型均可达、偏角落在各自配置区间、曲线 sweep 与起始偏角反号、禁用开关回退、短停进出与开火容差放宽、装填期蠕行与直冲占比下降、集成层输出含转向/短停/前进三类、脱离接战清空脚本、Boss 不启用。#88 段改为断言「装填期抽到非 direct 机动 + 前进压为蠕行」，Boss 路径断言不变。

### 13.8 交战结构重做（#N，2026-10-02，现行口径）

**用户反馈**：「敌人全部尝试贴近玩家、又在屏幕边缘被动受击，玩家像打靶」；并要求「再结合你建议的方案落地」。**用户裁定（2026-10-01，2 项）**：① 反打靶可见性**仅做玩家侧提示**（不给敌人加视口门控，保留 #J3「全屏可命中」口径与边缘推进的压迫感）；② 实施范围 = **全部落地**（交战带 / 攻守分工 / flank 重写 / 分离力 / 装填脱离，不含敌人侧可见性）。

- **问题定位（实测，均有 file:line 证据）**：
  1. **单点 engage 的夹逼结构**：`aiDecideEnemy` 只有 `dist>engage(520)→前进 / dist<close(200)→后退`，`closeRange=200` 与车体尺度同量级 ⇒ 退让常被物理互推抵消；且四类敌车共用同一组阈值。
  2. **一拥而上无分工**：每辆车独立决策，全部满足「dist>engage」即全体推进，无名额、无侧翼、无牵制层次。
  3. **旧 flank 事实上不生效**：窗口 `dist>engage && dist<flankMinDist×1.5×flankBias` 对 heavy 上限 400×1.5×0.6=**360 < engage≈478 恒不触发**、spg `flankBias=0` 被排除、medium 高难度下 engage 超过上限；目标点是「自身 + targetRight×300」**每帧重算的横向平移**（目标恒在自身右侧 300px ⇒ 原地绕圈），非绕后站位。
  4. **无群体分离**：`resolveTankCollisions`（`js/tank_entity.js`）只沿连线推开，靠内侧那辆被直接推向玩家，人堆贴脸。
  5. **视口外开火无提示**：#J3 视野退役后敌人一律可命中，但绘制层仍有 `aabbInView` 剔除（`tank_mvp.html`），而 AI 开火只看「距离 + 直线视野」（`RULES.ai.engageRequiresLoS`）⇒ 视口外敌人开火且玩家看不到来源，即「屏幕边缘被动受击」的直接机制。
  6. **退避仅限重甲残血**：`coverSeek` 原条件为「aiTier≥1 或正面装甲≥100mm」且 `hp<60%`（`js/tank_ai.js`），轻中坦在装填期只能在开阔地对射。

- **现行口径（消费方 `js/tank_ai.js` + 新模块 `js/tank_ai_squad.js`）**：
  - **#N1 交战距离带**（`RULES.ai.engageBand`）：判据由单点改为按类别的 `[minRatio, maxRatio] × engage` 区间——`dist>max` 接近 / `dist<min` 脱离 / 区间内驻停开火。四类：light 0.52~1.28 / medium 0.42~1.10 / heavy 0.30~0.94 / spg 0.66~1.34；下界另有车体尺度兜底（`max(60, hullLen×2.2)`）。**heavy 的 `moveLock` 角色特性保留**（`dist<min` 时 `baseMove=0` 不后撤）；`engageBand.enabled=false` 回退旧 `closeRange`/`engageRange` 单点语义。
  - **#N2 攻守分工**（`RULES.ai.squad` + `js/tank_ai_squad.js updateSquad`）：节点级协调器每 `reassignInterval`(0.6s) 按评分（距离/LoS/血量）+ **角色粘性** 分配 `press`（压上，名额 = `pressSlotsBase(2) + floor(diff×1.5)` 钳 ≤4）、`flank`（侧翼）、`hold`（驻守）三种角色；存活数 ≤ 名额时全员 press。`hold` 走 `holdGate`（> `holdFireMaxDist` 640px 纯待机，近距容差放宽 ×2）。协调器**只写 `t.aiRole`**，位移仍由交战带/机动层执行；`enterBattle` 时 `resetSquad()` 防跨节点串用。
  - **#N3 flank 重写**（`RULES.ai.flankRewrite`）：站位点 = **玩家为圆心、半径 `_flankRadius(band) = band.max × radiusRatio(1.15)`、方位角 = 进入时方位 ± 扇区角 [1.05, 2.10] rad** 的世界坐标点，**进入 flank 时锁定一次**（`t._flankTarget`），驶入 `arriveDist`(70px) 即转 press；角色变更时清除锁定。半径以**交战带外沿**为基准（见下方缺陷 ③）。旧 flank 分支降级为回退路径（`flankRewrite.enabled=false` 启用）。
  - **#N4 群体分离力**（`RULES.ai.separation`）：同类斥力半径 `radius`(180px)，玩家方向斥力半径 = `radius × playerRadiusMul`(0.6 ⇒ 108px)，两者均按距离**线性衰减**；力度权重 `playerFactor`(0.7) 单独作用于玩家方向。合成斥力换算为相对「朝玩家」方向的 ±1 转向偏置。**仅对 `press` 且 `move≠0` 生效**（见缺陷 ④）。
  - **#N5 视口外来袭方向提示**（`threatIndicators(player, enemies, viewBounds, opts)`，`js/tank_ai_squad.js`）：筛选「已接战 + 视口外 + 距离 ≤ `engageRange×1.4`」的敌人，按距离取前 6 条输出方位角；mvp `drawThreatIndicators()` 沿用边缘矩形求交绘制**琥珀色箭头**（与无人机红箭头区分），alpha 随距离衰减。**玩家侧信息层，不改变任何 AI 判定与命中判定**（#J3 口径不变）。
  - **#N6 装填脱离**（`RULES.ai.retreatReload`）：装填期且距离 ∈ [300, 760]px 时退到半径 620px 内最近挡弹掩体的背弹面（掩心 − 朝玩家单位向量×(半深+45px)），到位后原地还击。与 #76 C6 `coverSeek`（重甲残血）并列，构成**两条独立退避通道**。
  - **回退开关**：`engageBand.enabled` / `squad.enabled` / `flankRewrite.enabled` / `separation.enabled` / `retreatReload.enabled` 独立可关；全部关闭即完全退回 #M 及更早的单点直冲行为。

- **实现期修正的 4 处缺陷（均由 `scripts/diagnose-ai-crowd.js` 探针暴露，非推测）**：
  1. **退让被机动层覆盖**：#M 初版仅在 `baseMove===0` 时保护，`baseMove=-1` 的退让被机动层 `move=+1` 覆盖 ⇒ 退着退着又贴上。→ 机动层收窄为**只接管 `baseMove>0`**（接近）。
  2. **旧 repos 在驻停帧复活**：`legacyMicroOn` 初版用 `!maneuverOn`（依赖逐帧变化的 baseMove/role）守卫 ⇒ 驻停/脱离帧 `!maneuverOn` 为真，`repos`（#83）重新接管 `move` 随机 ±1 冲向玩家。→ 改为**静态判据**：只有 Boss / SPG 定距车 / 整体关闭机动层 才走旧 `sideSwing`+`peek`+`repos`。
  3. **flank 站位形成「棘轮内移」**：站位半径 0.95×engage 落在交战带**内侧**，且站位点初版按「当前方位角」每帧重算（目标绕玩家转 ⇒ 螺旋内收）；叠加角色 0.6s 重排 ⇒ 「当 flank 内移、转 press 驻停」逐次逼近（实测 700→395→**273px**=带内沿）。→ 站位点**进入时锁定一次** + 半径改以 `band.max × 1.15` 为基准（恒在带外）+ `roleStickiness`(0.2) 抑制横跳。
  4. **分离力干扰 flank 定点到达**：斥力改写 `turn` 使敌人无法进入 `arriveDist` 判定圈，持续前进螺旋贴脸。→ 分离力**仅作用于 `press`**。

- **量化验证（`node scripts/diagnose-ai-crowd.js`，决策层探针：6 辆环形 700px 起始、30 秒、固定随机种子可复现；同初始态势对照「改前 4 开关全关」与「改后现行」两组）**：

  | 指标 | 改前 | 改后 | 变化 |
  |---|---|---|---|
  | 同时压上（press）车辆数 | 6.00 | **2.00** | −67% |
  | 近身圈内（≤engage×0.9）敌人数 | 0.71 | **0.00** | −100% |
  | 最近敌人距离 | 447px | **522px** | +17% |

  ⇒ 既消除「全员贴脸」，也消除「一拥而上」。**`fanout`（方位集中度）3.33 → 1.87 属预期改善**：改前六辆均匀包围玩家（全方位压迫），改后只有 2 辆压上、3 辆驻守开火、1 辆侧翼绕行 ⇒ 玩家不再同时面对所有方向。

- **回归**：`scripts/test-ai.js` 新增 **#N 段 26 项**（2026-10-04 实测 `ok()` 计数；交战带分档/下界兜底/开关回退/带内驻停/带外接近/重坦不后撤/站位半径与扇区/站位稳定/左右分侧/集成绕行/分离力有无邻居/装填脱离背弹面与四类 null 路径/站位半径 ≥ 带外沿防复发）；`scripts/test-squad.js` **新增 25 项**（2026-10-04 实测；名额难度与上限、角色互斥覆盖、评分优先、节流稳定、换血重分配、开关回退、hold 门控、威胁提示筛选/排序/边界）。`scripts/test-ai.js` 旧 flank 断言改为「回退路径」语义（`flankRewrite.enabled=false` 下验证），`test-squad.js` 已接入 `npm test` 链。
- **验证（三链，2026-10-02）**：`npm run check` **EXIT=0**（含 `tsc --noEmit`）/ `npm test` **EXIT=0**（全链 0 项失败）/ `npm run test:browser` **四链 ALL PASS、EXIT=0**。

### 13.9 岩石接触卡死修复（#O1，2026-10-10，用户反馈，现行口径）

**现象**：坦克撞上岩石后彻底卡死（倒车/转向均无响应）。**根因（两处叠加，均有 file:line 证据）**：① `driveTank`（`js/tank_move.js:27`）把岩石 `passability: 0` 当通行系数 ⇒ `accel/brake/turnRate` 同时清零；② `resolveCoverCollisions` 只推到恰好贴合，而 SAT 判「触=叠」⇒ 静止接触恒为"压在岩上"，① 的冻结每帧续杯（逐帧诊断：`帧前cover=rock x=552.01 speed=76.88 → 帧后 x=552.01 speed=76.88`，5 帧完全冻结）。

**现行口径**：
- `driveTank` 的通行系数**只对可通行减速地形生效**（`pass > 0`：水/河/泥等）；`passability===0` 的硬阻断（岩石）一律交由推出，accel/brake/turnRate 保持正常 ⇒ 贴岩仍可倒车/转向/沿面滑行（行为与 `full`/`building` 一致：不可穿透、可脱离）。**各 tier 的 `passability` 取值唯一口径 = `RULES.coverTiers`（表格见 `specs/map.md` §5.2 / §12.1），本节不重复。**
- `resolveCoverCollisions`：推出量 = 穿透深度 + **0.25px 分离缓冲**（静止接触为真实分离，`getCoverUnderTank` 不再命中岩石）+ **最多 4 遍重扫**（双硬阻断夹角/贴边界场景下"推离 A 又叠回 B"直至无穿透）。
- **岩石仍硬阻断不可通行**（推出轴不变；`test-tankcollision.js` 断言全速顶岩 `x ≤ 岩左界+0.5`）。

**回归**：`scripts/test-tankcollision.js` 第 §8 节（撞岩倒车可变速/持续倒车脱离/贴岩可转向/出生嵌岩可倒出/静止接触分离/岩石仍阻断/泥地减速不变）/ 第 §9 节（空间哈希语义一致性）。对应 ISSUES #O1。


## 14. 游戏模式：Boss 战 / 生存战（#MODE，2026-10-15 落地，现行口径）
> *主题：模式入口（14 首段）/ 生存准备期伤害关闭（14.1）/ 生存逐波选卡（14.1b）/ Boss 模式商店时序（14.2）*
> *⚠️ 本节为批次章节，非主题基线。**游戏模式全卷只有本节一个口径**，主题导航见卷首「§0 主题索引」。*

入口：`tank_mvp.html?mode=boss` / `tank_mvp.html?mode=survival`（缺省 `standard`；`GAME_MODE` 解析 URL 参数）。标准模式零改动。

### 14.1 生存模式：「准备期」伤害关闭窗口（2026-10-15 用户裁定）

- **背景（原缺陷）**：波次清空原先走 `clearing` 通道（`clearing=true; clearingT=2.0`，「区域肃清」2 秒缓冲），但 `finishSurvivalWave` 只复位 `waveActive`/`cleared`、**不复位 `clearing`** ⇒ `isClearing` 恒真：随后 5 秒波次倒计时里玩家被冻结（`driveTank` 被跳过）、战斗管线全停。
- **现行口径**：
  - **删除「区域肃清」倒计时**——波次清空即调 `finishSurvivalWave()`（不再经 `clearing`）。该函数同时显式复位 `clearing=false/clearingT=0` 防残留。
  - **波次间隔 5 秒 = 准备期**：玩家**可自由移动**（不禁驾驶），但**全场伤害判定关闭**。
  - **伤害关闭的两层拦截**（缺一不可）：
    ① **伤害总闸**：`js/tank_physics.js applyDamage` 开头查询 `globalThis.damageSuppressed()`，为真即 `return 0`——所有伤害的单一收口（炮弹/溅射/炮击/DOT/溺毙/无人机/地雷/碾压），一处生效无遗漏。缺省无该函数 → 零影响（Node 测试/bench）。
    ② **伤害来源门控**：`tank_mvp.html` 主循环内 `isSurvivalPrep`（`isSurvivalPrepWindow()` 同一判定）拦住「不打伤害但留痕迹」的路径——玩家/AI/副炮塔开火、`stepShells` 炮弹飞行、`updateStrikes` 落弹、`updateDeployables` 触发、`updateDrones` 打击、溺毙倒计时累计。进入准备期时还清空残留弹道/落弹预警（`shells`/`impacts`/`bounceFx`/`clearStrikes()`）与导弹锁定，防静止悬停 5 秒后同时爆开。
  - **Boss 行为层无需门控**：准备期全程 `battleState.cleared=true`，其判定块本就跳过。
- **判定窗口**：`isSurvivalPrepWindow() = GAME_MODE==='survival' && battleState.waveCountdownActive && flow.state==='battle'`。
- **HUD**：`#survivalWaveHud` 显示「第 N 波已清 · 准备期 x 秒（可移动 / 暂不受伤害）」。

### 14.1b 生存模式：卡牌挑选在**每一波结束**（2026-10-18 用户裁定，现行口径）

- **背景**：原口径只在 **Boss 波**（每 3 波）结束时弹快速选卡、且固定 **5 选 1**；普通波结束直接进 5 秒准备期，玩家整场拿不到卡。用户裁定：选卡属波次奖励，与补给点无关。
- **现行口径**：**每一波清空都弹选卡**，张数/抽取口径与标准模式**完全同源**：

  | 波次 | `pendingLootRounds` | 张数 | 抽取保底 |
  |---|---|---|---|
  | 普通波（`survivalWave % 3 !== 0`） | `0` | **5 选 2**（普通节点同款） | 无（全池权重抽） |
  | Boss 波（`survivalWave % 3 === 0`） | `1` | **5 选 3**（Boss 节点同款） | `RULES.cards.bossRound` 的稀有度配比 + 弹种/技能/主副武器安装保底 |

- **实现**：`finishSurvivalWave()` 统一置 `survivalQuickPick=true` + 上述 `pendingLootRounds`/`pendingLootRarityIdx`，再 `resetRewardShop()` → `openRewardScreen()`；确认后走 `rewardConfirmBtn` 的 `survivalQuickPick` 分支 → `startSurvivalCountdown()`（不经 `settlement`/`reward` 流程态、不重载地图）。
- **`rewardPickTarget()` 不再有 survival 特例**（原 `GAME_MODE==='survival' ? 1` 已删除），故 `renderRewardCards` 的 `shortBy` 口径也统一为 `(pendingLootRounds>0 ? 3 : 2) - need`。
- **选卡期间冻结战场**：卡片是模态遮罩，标准模式 reward 屏本就冻结世界；生存模式的快速选卡不切 `flow` 态、上面的 `battle` 门控拦不住，故 `loop()` 的 `paused` 并入 `survivalQuickPick`（只跳 `update`，`draw` 照常渲染冻结快照，与 pause 同款）。
- **补给站职责收窄**：只剩「按 E 回血 50% + 打开局内参数升级商店」，**不再承担选卡**（`tryUseSupplyStation` → `openSupplyShop` 链路未变）。

### 14.2 Boss 战模式：局内商店改在卡牌选择后（2026-10-15 用户裁定）

- **背景**：`fbf7f73` 曾「完全禁用 Boss 模式局内商店」（理由「每局回满血，不需要升级」，但所有模式本就 `enterBattle` 满血进节点，该理由不成立）。
- **现行口径**：Boss 模式商店在 **reward 屏（卡牌选择）选完卡后**原地展开（`revealRewardShop`），不与结算屏重复出现。
  - 流程：`battle → settlement（仅得分展示，不内嵌商店）→ reward（选卡）→ 选完确认 → 同屏展开商店 → 点「继续 NEXT BOSS」→ 下一场`。
  - 商店列表与结算内嵌版/暂停菜单版**共用** `buildRunShopInto`（同一数据源与购买链）。Boss 模式仍移除「紧急维修」项。
  - 每次进入 reward 调 `resetRewardShop()`——Boss 追加卡牌有多轮（`reward→reward`），上一轮展开的商店必须收起并还原选卡按钮。
- **验证**：`scripts/test-modes.js`（生成逻辑）；浏览器定向验证（选完卡商店展开/点继续进下一场/准备期可移动且伤害为 0）。
