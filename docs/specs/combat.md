# 战术坦克 Roguelike — 战斗与物理系统规范 (Combat & Physics Spec)

> 权威子文档：由主文档 docs/DEVELOPMENT.md 索引。
> 涉及模块：js/tank_rules.js, js/tank_physics.js, js/tank_fire.js, js/tank_geometry.js, js/tank_abilities.js, js/tank_weapons.js, js/tank_shield.js, js/tank_strike.js, js/tank_drone.js, js/tank_audio.js, js/tank_fx.js

---

## 1. 战斗立意与物理核心
- **慢节奏、强博弈、拟真物理**：摆角度找跳弹角、找掩体、抢位置，拒绝魔幻特效和高频输出。
- **实时弹道与发射解算**：炮弹按真实物理速度逐帧推进（js/tank_fire.js 的 stepShells），碰撞在命中瞬间判决，支持提前量与动态掩体拦截。

## 2. 装甲与跳弹机制 (Armor & Ricochet)
- **跳弹判定**：各弹种独立跳弹角（per-ammo `ammoBounceAngle`，65°~90°；θ>该值跳弹，90°=不可能跳弹，noBounce 弹种完全不跳弹），数值以 §3.2 总表为唯一口径；跳弹沿法线方向真物理反射。（早期全局 `RULES.ballistics.bounceAngle`=70° 仅为 AP 基准沿革。）
- **二次跳弹禁止**：跳弹后的炮弹标记 canBounce = false，再次命中不再发生二次反射。
- **等效厚度计算**：等效厚度 = 实际装甲厚度 / cos(入射角)。
- **resolveHit 可选增益 opts（P-51）**：`resolveHit(s,target,hit,allowBounce,opts)` 新增可选 opts `{penAdd,dmgMul,ignoreBounce}`——penAdd 在穿透判定前加算；ignoreBounce 跳过跳弹与过陡 BLOCK；dmgMul 最终伤害乘算并传入 applyModuleDamage；不传 opts 行为不变。mvp 包装层对敌方 Boss 弱点命中（isWeakspotHit + moduleFromHit 匹配 RULES.boss.weakspot）注入 dmgMul:1.5 / penAdd:15 / ignoreBounce:true。
- **弹药架与模块**（2026-08-26 P-49 定案：几何概率分区判定，废除自定义挂载）：
  - 模块七类：driver / ammo / engine / gunner / loader / commander / **breech 炮闩**。命中不再依赖挂载数据，改为**几何分区 + 区内互斥概率抽取**，只判击穿点所在区间。
  - **炮塔四象限**（以炮塔几何中心为原点、随炮塔旋转）：左前{炮手 50% / 炮闩 5%}；右前{车长 30% / 装填手 30% / 炮闩 5%}；左后、右后{弹药架各 50%}。
  - **车体纵轴区段**：以座圈圆心 p 与车体几何中心 c 判定前置/后置构型——前置构型 [0,.1){驾驶员 10% / 弹药 10%} / [.1,.5){弹药 50%} / [.5,1]{发动机 40%}；后置构型 [0,.5){发动机 40%} / [.5,.6){驾驶员 5% / 弹药 50%} / [.6,1]{弹药 40%}（区间均为纵轴归一化坐标）。
  - **区内互斥抽取**：同一区间内按上述概率抽取一个模块命中；抽取落空/无对应模块的余量 = 正常结算伤害、无加成。
  - **breech 炮闩效果**：命中 → 8s 完全无法开火（修理箱可清除）。
  - 弹药架命中伤害按弹种 `ammoRackMult`（2 / 2.5 / 3，逐弹种见 §3.2 总表）；致死命中触发掀飞炮塔（"飞头"殉爆 spawnAmmoBlowFx）；未致死施加 8s 装填 debuff。
  - 发动机命中引发起火 DOT（dps = 攻击方标准伤害 × `RULES.fire.dotRatio`，持续 `RULES.fire.dotSeconds`=5s，速度惩罚 speedMul 0.5），并施加机动 debuff。
  - 履带命中 → trackBroken + immobT=8s 锁定。
  - 车长命中 → 全体乘员效果 ×0.85。
  - **修理箱/医疗包回血与随时可用（2026-09-08，优化落地）**：
    - **移除损伤门控**：删除了 `_tryActivateInnate` 中针对受损/受伤状态的前置判定门控。修理箱与医疗包现在在任何状态下均可激活。
    - **增加回血效果**：成功使用修理箱或医疗包时，立即恢复坦克 10% 的最大耐久值（`t.hp = Math.min(maxHp, t.hp + maxHp * 0.10)`）。
    - 修理/移除 debuff 的核心语义保持不变。
  - **自动灭火器（innate，2026-09-17 #C6 修复定案）**：前置判定**改读真实起火状态 `dotT > 0`**（发动机起火链路写入 dotT/dotDps/dotSeconds/fireT/debuffs.engine，见 resolveHit engine 分支；旧判定读 `fireDebuffT`，但该字段生产代码无任何写入路径——灭火器恒 'no-fire' 死功能）。激活成功：清 dotT/dotDps/dotSeconds/**fireT** 与 **debuffs.engine**（用户裁定连带清除；发动机模块损伤本体仍属修理箱范围）。冷却走独立池 `abilityCds.extinguish`（基础 45s，商店 cdReduce 注入 `abilityBaseCd`）；手动 6 键保留 + **mvp 主循环起火期间自动触发**（每帧尝试、冷却中静默拒绝不刷日志）。字段 `fireDebuffT` 维持现状（仍为死字段，AI stun 分支/起火散布加成未复活——后续清理）。
- **防崩落内衬 passive spall_liner 生效（2026-08-26，原 ISSUES #A15 修复定案）**：`tank_physics.js` 经 `passiveValues(target,'spall_liner')` 取多来源最小值 `spallMul`，在 `applyModuleDamage` 乘入最终模块/乘员伤害；多张卡取最强（最小乘子）语义。活浏览器实测 `giveCard('support_spall_liner')` 后敌方 PEN 伤害均值降至无内衬 0.7981 倍（预期 0.8），epic 卡 `spall_liner.json` 当前 value 0.85。
- **散布下限防负值（2026-08-26，原 ISSUES #A2 修复定案）**：`RULES.spread.multFloor=0.2` 对 spreadMult 加法聚合结果钳下限 + `sigmaFloor` σ 地板；局内商店姿态稳定恢复 maxLevel 判定（applyRunShopPurchase），满级购买按钮禁用置灰。
- **运动散布与精度基准解耦（2026-08-26，原 ISSUES #A1 修复定案）**：新增独立 stat `motionSpreadMul`（运动三源专用系数）——computeStats 默认继承出厂 `base.spreadMult`（保留设计器对底盘运动散布的标定）并钳 ≥ `spread.multFloor`；motionSigma 消费 `stats.motionSpreadMul ?? stats.spreadMult`（旧运行时快照无该键时回退，向后兼容）。运行期 spreadMult 修饰器（精密火控/卡牌）不再影响运动散布；局内商店姿态稳定改挂 `motionSpreadMul` mult ×0.85（maxLevel 1）。
- **成员/模块受损状态条（2026-08-28，原 ISSUES #A5 修复定案）**：`tank_mvp.html` 顶部中央新增 `#moduleStatus` 状态条（`updateModuleStatus()` 每帧刷新，挂入 `updateHud()`）——读 `player.debuffs`（gunner/loader/driver/commander/engine/ammo/breech 各键，经 `MODULE_LABELS` 译中文标签 + 剩余秒数药丸）与 `player.trackBroken`/`immobT`（履带断裂），无受伤时整体隐藏。纯视觉 HUD，无共享模块/测试链改动；`npm run check` + `test:browser` 全绿（mvp 无 console/page 错误）。
- **局内商店可升级次数由具体数值决定（2026-08-28 定案，取代写死 maxLevel）**：有自然数值边界的商品改为按 `RULES.parameterLimits` 动态判定达限，而非需求出生时写死整数上限（因局内卡牌经 addModifier 也会改 reload/spreadMult/motionSpreadMul/装甲值，会改变真实可升级空间）。`runShopLimitBlocked(def, curVal, stats)` 三分支：① `def.limit` 存在（fast_reload / engine_overdrive / precision_gunnery / steady_mount）走显式单键判定；② `def.limit` 缺失但多条 effects（多面打包装甲包 hull/turret × front/side/rear）逐面按点分路径 `parameterLimits.armor.*` 推导达限，**读 `stats` 对象各面真实现值**（非 UI 传入的单一 curVal），任一穿越边界即 true；③ 无边界/缺省容错返回 false（放行）。`motionSpreadMul` 边界本轮新增于 `parameterLimits`（min 0.5 / max 3.0，对齐 spreadMult）；商品 `maxLevel` 统一 99 作防御性兜底，`computeStats` 的 `multFloor` 物理钳底不动。测试：test-economy 新增装甲包逐面达限/precision_gunnery 数值驱动/steady_mount 边界对齐断言（164 条全绿）。

## 3. 弹种系统 (Ammo Types)
唯一数据源：`RULES.ammoTypes`（`js/tank_rules.js`，机制参数唯一配置源）。逐弹种数值（穿深/伤害/弹速/弹药架与模块倍率/跳弹角/精度系数/未击穿）**以 §3.2 数值总表为唯一口径**，本节不再重复罗列；升级链见 §3.1，平衡回归见 §3.3。

- **HE 机制细节**（总表之外的行为差异，唯一需单列的弹种）：击穿与未击穿均触发范围溅射（splashRadius=90px，贴脸 50% → 边缘衰减到 0）；未击穿走残余爆轰分支（地板 25%，公式见 §3.2）。HE 破障（A3）：HE 弹销毁时对落点半径 24px 内可破坏掩体造成 1 点独立破坏伤（与 90px 坦克溅射两套并存）。特效对齐约定：爆轰视觉特效半径与逻辑 splashRadius 严格一致，杜绝视觉误导。
- **命名规范**：升级演进弹种（APDS、APFSDS、HEAT-FS、T-HEAT、HT-HEAT、APHE、HESH、HE-VT、HE-OP 等）全面继承 `RULES.ammoTypes` 对应数值矩阵，全部使用规范军事缩写。
- **2026-09-14 定案：HEC 弹种移除**——`RULES.ammoTypes` 现 14 键（ap/apcr/apds/apfsds/apfsds_ad/he/heat/heatfs/tandem_heat/heavy_tandem_heat/aphe/hesh/proximity_he/blast_he）。**2026-09-15 用户裁定：主武器曲射机制移除**（howitzer 主武器类型删除，主炮一律平射直线弹道）；曲射/越障由副武器迫击炮承担（mortar `isArc` + `ignoreCover`，见 cards.md §8.3 与 DEVELOPMENT.md §4.13）。

### 3.1 弹种升级链（14 键 = 14 弹种；HEC 已移除）

> 链内为**升级替换**：升级卡把 loadout 槽内直系前驱弹种原地替换；**禁止跳级**（前驱未持有则不变）。HE 线不再 he 处多向分岔，而是 he 作为分支点形成两条线性链——首张 heat 或 aphe 卡「先新增」（保留 he，占第 3 槽，槽位 <3）；其后同分支/他分支再抽则「替换 he 槽」——heat 与 aphe 得以并存；KE 链与 HEAT 链各为一条线性替换链。（2026-09-13 定案 + 2026-09-15 用户修订；曲射/越障由武器层承担。）

| 链 | 序列 |
|---|---|
| KE 穿甲链 | ap → apcr → apds → apfsds → apfsds_ad |
| HEAT 破甲链 | he → heat → heatfs → tandem_heat → heavy_tandem_heat |
| HE 榴弹链 | he → aphe → hesh → proximity_he → blast_he |

- `RULES.ammoChain`（key→前驱）为升级替换唯一链源（`js/tank_rules.js`）；`computeAmmoConfig` add pass 按 base 倍率换算（+10mm × apds 1.4 = +14mm）。
- 卡牌通道运行时硬限（W5）：卡牌 modifiers 聚合后装填 ≥ `parameterLimits.reload.min`、极速 ≤ `parameterLimits.maxSpeed.max`（见 §3 卡牌硬限与 cards.md §3）。

### 3.2 弹种数值总表（用户 2026-09-13 权威表，已落地 `RULES.ammoTypes` per-ammo 字段）

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
- 跳弹角 per-ammo（`ammoBounceAngle`，°）：θ>该值跳弹；90° = 不可能跳弹；noBounce 弹种（heat 系/HE 系）完全不跳弹。**注意（2026-09-23 核实）**：`RULES.ammoTypes` 对 `noBounce: true` 的 8 个弹种（he / heat / heatfs / tandem_heat / heavy_tandem_heat / hesh / proximity_he / blast_he）**不写 `bounceAngle` 字段**，本表 90° 为「不可能跳弹」的语义表达，权威判据是 `noBounce` 标记本身。
- 近炸引信（proximity_he，用户定案=**接近率基准**）：弹道不命中目标时，对最近敌目标计算径向接近率；**接近率由正转负（开始远离）瞬间空爆**，按 splashRadius 溅射。已落地 `stepShells`（`RULES.proximityFuze`：maxTravel 1400 / armRadius 武装半径 120px / 最小起爆距离 40px）。**#A27 修复（2026-09-15）**：近炸分支须先执行飞行推进（`s.x/s.y/s.dist+=step` + 射程/出界死亡判定）再判引信——此前近炸分支从不推进弹体，导致 HE-VT 原地静止不飞。

### 3.3 平衡性回归（`scripts/test-ammo-balance.js`，接入 npm test）

真实 `resolveHit` 蒙特卡洛（全弹种 × 4 装甲级 × 3 入射角 × 3 目标速度 × 400 发，基准炮 pen120/dmg100/reload3s），同档弹种集合内中位数偏差 >25% 警告、「完全无效」单独报告。首轮平衡结论（2026-09-13）已按用户裁定全部落地：APHE pen 0.9→1.1（中型档可击穿）、HEAT-FS pen 1.5→1.75（与 heat 拉开 +16% 步幅）、HESH/HE 家族重型档偏弱与链条顶端无效经第二批补测裁定**维持**（距离本身就是平衡维；超重档打不穿为设计预期「不怕打不穿，卡牌升穿深」）。历史裁定过程见 `docs/archive/2026-09.md`。

## 4. 战术能力、副武器与主动装备 (Abilities & Secondary Weapons)统一入口 `tryActivateAbility` + 武器系统 `tank_weapons.js`
- **副武器系统（F 键直接击发副武器；左键/空格=主炮专属；2026-09-17 #C4e 用户裁定反转，取代 #A21 激活槽位分发）**：
  - 副武器**单槽**（`player.weapons.secondary`；单槽不变量见 #A22 / DEVELOPMENT.md §4.16）。
  - `F` 键（`fireSecondary`）= **直接击发副武器（按住连发）**，不再承担主/副切换——`activeWeaponSlot` 概念已移除。键位语义：**左键/空格 = 主炮专属**（`tryFirePrimary`，空格为双管齐射 salvo），**F（按住）= 副武器专属**（`tryFireSecondary` → `fireActiveSecondary(target=鼠标世界点)`，目标缺省回退炮塔前方 +100px）；`tank_bindings.js` keydown 屏蔽 `e.repeat` 重复边沿动作。
  - **例外**：副武器类型为 `turret`（副炮塔）时**装上即由主循环 `updateSecondaryWeapon` 逐帧自主驱动**（自瞄，不响应击发）；副武器为 `none`/未装时 `tryFireSecondary` 返回 false（页面层提示，**不回落主炮**——主炮有专属键位）。
  - 副武器待机装填计时 `secondaryReloadT` 恒递减（与主炮 reloadT 对称）。
  - **锁定式反坦克导弹**（secondary `missile`）：**F = 激活索敌**（不是直接发射）——激活后逐帧由 `updateMissileLock` 在炮塔 ±`lockArcDeg` 扇形内、`range` 射程内索敌，锁定计时满 `lockSeconds` 后**自动发射**制导弹；再按 F 取消。**现行细则归口 §8.2**（参数 `WEAPON_DEFAULTS.secondary.missile.lockArcDeg=30 / lockSeconds=1.0 / range=600`）。
    - **已作废的旧口径（#A21 时期，勿再引用）**：曾为「按 F 沿光标方向直飞、不做锁定、`target=null`」，该口径自 #E5（2026-09-20）起被取代；AI/Boss 侧副武器同样走 `updateMissileLock` 自主索敌。
    - **伤害口径（#J4 2026-09-30 明文化）**：基础伤害 `damage`（140；升级卡 160）**再乘当前 HEAT 弹种系数** —— `getEffectiveHeatAmmoKey`（优先级 `heavy_tandem_heat > tandem_heat > heatfs > heat`，全部未持有时回退 `he`）→ `computeAmmoConfig` → `dmg = round(base × ammo.dmg + ammo.dmgAdd)`，穿深同理。即**导弹伤害跟随玩家的 HEAT 弹种升级链**，未升级时按 HE 口径计算。
    - **激活反馈（#J4 2026-09-30 用户反馈「导弹无法发射」）**：旧版激活后**无任何可见反馈** —— 炮塔未对准（超出 ±30° 扇形）或目标在 600px 射程外时，导弹既不发也不提示，玩家只能得到「按了 F 没反应」。现三处反馈：① 激活日志写明锁定条件（扇形角/射程/锁定耗时）；② HUD `btnF` 角标显示「索」（已激活未锁定，琥珀脉动 `.lock-hunting`）/「n%」（锁定中，绿色 `.lock-on`）；③ 激活后 0.6s 仍无目标 → 一次性提示缺少的条件（射程内无敌人 / 炮塔未对准）。

  - **火箭发射器逐发 burst（2026-09-19 #D4 用户反馈「同帧齐射改连续快速逐发」）**：`fireActiveSecondary` rocket 分支只发射第 1 发并登记 `t._rocketBurst={left, lastAngle}`；`updateRocketBurst`（tank_weapons.js，mvp 主循环玩家侧 / `updateSecondaryMount` AI 侧逐帧驱动）按 `burstInterval`（WEAPON_DEFAULTS.secondary.rocket.burstInterval=0.18s）逐发补完，队列清空后写入整组装填 `reload`（10s）。瞄准：存活目标方向优先，目标丢失保持上一发角度（committal）。视觉：逐发口焰 `muzzle`+粒子烟 `spawnSmoke`×3+音效（旧齐射仅一次）、弹体 `fxScale=1.3` 放大 + 拖尾增亮（drawShells 消费）。队列不跨节点：enterBattle 清 `player._rocketBurst`/`_missileLock`，重置按钮清全员。
  - **视野系统已整体退役（2026-09-30 #J3，用户裁定「改为全屏幕渲染敌人，不再计算视野距离」）**：敌对实体一律渲染、一律可被命中，只剩 `aabbInView` 视口剔除（纯性能，非玩法机制）。原「可视圆」体系（鼠标锚定圆心 / 屏幕相对半径 / 车内圈 / 视野虚线圈 / 视野卡 `commander_sight`）全部下线，现行细则见 **§13.5**。**注**：敌人 AI 的接战判定**从来与视野系统无关**，一直是「距离 + 直线视野」（`engageRequiresLoS` + `hasLineOfSight`），不受本条影响。
- **主动技能快捷键池 (1~3 数字键)**：
  - 快捷键 1/2/3 **严格对应技能池槽位 `player.skillSlots[0..2]`**（2026-09-30 #H3 重做，取代原「按 `cardEffects` 获得顺序自动推导」口径），按槽位快捷施放；**空槽按数字键无任何效果**（不再回落到任何默认技能）。**现行运行时能力键全集（7 个）以 `js/tank_abilities.js` 的 `ABILITY_KEYS_RUNTIME` 为唯一口径**（`artillery / overdrive / shield / super_fire_control / super_speed / deploy_cover / aps`）——键数多于槽位数，**超出部分由玩家在「技能槽指派」面板中指定顶替**（§13.2），因此 7 个键中不存在无激活路径的死键。**2026-09-23 A 档**：原 `recon`（侦察/无人机指令）已随 5 张对应卡整体摘除（归口 `docs/specs/cards.md` §3、`DEVELOPMENT.md` §4.35）。
- **冷却模型（2026-09-17 #C4c 用户裁定「按技能独立冷却」）**：
  - 运行时能力键（artillery/shield/overdrive/deploy_cover/super_fire_control/super_speed/aps）与 innate 键（repair/medkit/extinguish）统一走**按 key 隔离的独立冷却池 `t.abilityCds[key]`**（互不顶冷却；旧共享单字段 `t.abilityCdT` 废弃，`updateAbilityCd` 仅作兼容助手保留）；逐帧递减 `updateAbilityCds(t, dt)`（mvp 主循环驱动）。
  - 获得技能/副武器 → `#gainToast` 屏幕一次性提示（不依赖底部按钮显隐，奖励页/战斗页均可见）+ 已有按钮（G/H/V）金色脉冲（#B10 保留）。
- **独立按键备用**：
  - 战术炮击 (G键)：呼叫延迟 AOE 覆盖（callStrike / updateStrikes）。
  - 战术护盾 (H键 定向 / Shift+H 全向)：累计吸收伤害池（applyShield）。
  - 超装填（**1~3 号技能键**）：爆发装填 + 立即清零 reloadT。**V 专属键已于 2026-09-21 #H3 用户裁定删除**（`tank_bindings.js` 无 `abilityOverdrive`、mvp 无 `btnV`/`cdV`），激活路径唯一化为 `skillHotkey(n) → DISPATCH`，常驻显示走技能池槽 `#skillSlot1~3`（见 §11.2）。
  - **战术掩体**（1~3 技能键）：**炮塔正前方**部署充能掩体（2026-09-17 #C4b 用户裁定——部署方向读 `turretAngle`，距离/长度参数化 `RULES.abilities.deploy_cover.dist=90` / `lenMult=1.6`（掩体 hullLen=车体×1.6，横置 90°））。
  - **超级火控 / 超级速度**（1~3 技能键）：限时精度/瞄准强化与机动强化（#C4a 起可从技能池激活）。
  - **烟幕弹已移除**（2026-09-15 W2 用户裁定）：`fireSmokeShell`/`tryFireSmoke`/stepShells smoke 分支/烟幕卡（smoke_screen、ability_smoke_dense）整链删除；`tank_cover.js` smokeClouds 动态烟幕基础设施保留备用（当前无生产者）。
- **无人机体系**：
  - scout 侦察型：标记视口外敌军位置指示（scoutRange=700px）**（当前 gated 暂不加入游戏，见 §5.1）**。
  - striker 打击型：近身环绕索敌开火（strikeRange=260px，fireInterval=2s），不消耗玩家弹药。
  - 上限 countMax=2，超限拒绝部署；owner 阵亡自动移除。

## 5. 敌方 AI 激活触发 (Enemy AI Activation Trigger)（2026-08-24 定案）

- **与摄像机视野解耦**：激活判定与摄像机视野彻底解耦（废除 P-10 的「视野内主动 / 范围外被动」门控），改为**距离 + 可见性**触发。
- **有效触发距离**：= `RULES.ai.triggerDistBase`（700px）× 难度乘数（最高 ×1.6），经 `js/tank_map.js` 的 `triggerDistForDifficulty(diff)` 计算，节点生成时注入实体字段 `aiTriggerDist`；`aiDecideEnemy` 读实体字段，缺省回退 RULES 基准值。
- **滞回防抖**：脱离接战阈值 = 进入阈值 × 1.25（实体字段 `aiEngaged` 承载），消除边界抖动。
- **可见性分支**：
  - 距离达标且有视线（hasLineOfSight）→ 接战分支（flank / 开火等）；
  - 距离达标但无视线 → 提前进入 search 推进；
  - LoS 仅在距离达标时评估（patrol 早退路径零射线开销）。
- **生成点约束**：敌军与 Boss summons 的局内生成点必须位于该敌有效触发距离 × 1.05 之外（径向外推优先，越出敌区时确定性重掷，不消耗额外 rng——同 seed 结果稳定）。
- **受击警觉（任意来源，2026-09-14 定案）**：敌对实体被命中即惊醒——`applyDamage`（`tank_physics.js` 唯一伤害收口）统一触发 `alertEntity(t, srcX, srcY)`（置 `aiEngaged=true`、记录来弹方向 `lastKnownPlayerPos`，search 态朝该点推进，到达 ~140px 或重获视线后清除）并立即解除进行中的 stunned；来源坐标由调用方传入，缺省回退玩家当前位置（搜索玩家语义），再兜底自身位置。`propagateAlert(entities, x, y)` 将警觉传播至 `RULES.ai.alertRadius`(600px) 内存活友邻。**覆盖任意伤害来源**：直射/溅射/炮击轰炸（strike）/DOT/地雷/碾压/溺毙——凡经 `applyDamage` 均触发（敌对存活非无人机；玩家/友军 no-op）。**Boss hold 受击破防**：`alertEntity` 对 `isBoss && stageAI.mode==='hold'` 实体清 `stageAI=null`（立即解除 hold 转常规接战）。注意：玩家对敌直射在 fireCtx 命中结算处另有前置警觉（与 applyDamage 钩子幂等重复，无害）。
- **stun 免疫窗**：stunned 自然苏醒后授予 `RULES.ai.stunImmunityAfter`(2.0s) 免疫期，期间不再进入 stunned——防高射速武器无限连控。（附带修复：mvp 主循环此前遗漏 `aiUpdateStateTimer` 调用导致 stun 计时器永不递减、敌人永久呆滞，已补上。）
- **难度全面分化（2026-08-24 落地）**：`RULES.difficulty.entityMults` 十键乘子表（maxHp/penetration/damage/armorAll/reload/spreadMult/aimSpeed/maxSpeed/turnRate/turretTurnRate），按 diffNorm 线性插值，经 materializeNode→env.applyDifficulty 仅作用于敌军 stats（玩家隔离）；`entityMultsForDifficulty(diff)` 纯函数可测。
- **AI tier 分层**：`RULES.ai.tierProfiles` 三档（0 标准 / 1 engageMul1.1+aimTolMul0.8 / 2 再加 stunResist），实体 `aiTier` 注入后由 `aiTierProfile(tier)` 消费；engage 以触发距离比值为难度代理调制。
- **行为补齐**：patrol 早退分支输出 wander 微摆动（`patrolWanderSigma/Speed` 消费，ctx.time 或本地相位驱动）；新增 `coverSeek` 态——重甲（aiTier≥1 或车体正面≥100mm）且 hp<60% 时撤至半径 500px 内最近 full/half 掩体背弹面（掩心 − 朝玩家单位向量×(半深+40px)），到位 ≤90px 原地还击；`flankDist` 收口 RULES.ai。

### 5.1 战斗机制更新（2026-08-24 ~ 08-28 批次）
- **（2026-09-20 #E1 取代）半高掩体 / graduated 拦截链已整体移除**：§5.1 下述关于「graduated 掩体入口缓存判决（s.dec）」「半高掩体曝光」的历史口径已作废，现行口径见 §8 与本卷 §5.1 末条。
- 移动与生存：RULES.speed.effMul=1.3 在 driveTank 与碰撞限速两处消费，实际移速×1.3，但面板显示 stats.maxSpeed 不变；玩家经 applyDamage(target,amount) 统一扣血并乘 dmgTakenMul（玩家=0.85，更肉），面板 HP/装甲数值不变。
- 炮弹与掩体：修复半高掩体曝光 bug——shell 在 exposure<1 时于掩体处被拦截，不再必然命中后方敌人；mud/water 为 mode:'pass' 飞越（不触发命中）。graduated 掩体入口缓存判决（s.dec）后，结算分支带剩余距离门控——未飞抵 dec.t 前继续正常飞行积分，飞抵当帧才结算；实体直接命中优先（2026-08-26，原 ISSUES #A8 修复定案）。
- **半高掩体低生效定案（2026-08-28，原 ISSUES #A9 评估）——已被 2026-09-20 #E3 取代**：半高掩体 tier 与全部相关计算（含 `ruined` 的 `grad/half` 剖面）已整体移除，见 §8 与 `docs/specs/map.md` §12。原文保留以追溯评估过程。
- **graduated 拦截者对齐（2026-09-19，原 ISSUES #D1）——已被 2026-09-20 #E1 取代**：`s.dec` 判决缓存与 graduated 拦截分支已整体删除（炮弹只被确定性掩体拦截），见 §8 与 `docs/specs/map.md` §12.2。原文保留以追溯。
- **回放高 timeout 根因与修复（2026-08-28，原 ISSUES #A18）**：批量 seed 回放约 46% 节点超时，根因是**回放代理玩家（`js/tank_sim.js`）只推进位置、从不转炮塔也不开火**（`turret` 恒 0、`fire` 恒 false），而远处敌人因距离 > `aiTriggerDist`（默认 700~1120px）保持 `patrol`/`engaged=false` 不接战——双方僵持 0 开火假超时。修复：代理玩家始终把炮塔 `turretDesired` 指向最近敌人并在大致对准（≤~7°）时请求开火（范围/LoS/装填由开火块统一门控），仅改动 `tank_sim.js`（回放 harness，不影响正式游戏）。实测超时率 46.5%→15.5%、win 45→140/200、`timeoutHeavy` 30→6 seed；回放 hash 重锚 799b65f→5d754f53（可归因）。**残留 15.5%** 属第二层「敌人超触发距离不接战 + LoS 受阻不逼近」的真实对峙/平衡问题，需对比真人实跑录像再裁定是否加强 AI 迫近或加 forceResolve 兜底。
- 主炮特效：开火生成炮口双侧+前方闪光（spawnMuzzleFlash），炮弹每帧生成曳光拖尾（spawnTracer，颜色取自 ammo.tracer 或默认 #ffd24a），替代原烟雾拖尾。
- 敌方 AI：aiDecideEnemy 在接战非特殊态注入随机微行为——peek 车体摆角（RULES.ai.peekAngleMax / peekInterval）与换位（RULES.ai.reposInterval），炮塔锁敌与开火条件不变。
- 无人机：scout 暂不加入游戏（deployDronesFromCards 已 gate 掉）；striker 每 2s / 260px 内对最近敌人造成 0.4×拥有者伤害的直接扣血，并播放炮口闪光+曳光（视觉），保留侦察型离屏指示逻辑备用。
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
  - **HE 爆轰 (Explosion)**：爆轰火球 `explosions` 与冲击波 `shockwaves` 扩散半径必须严格按 `RULES.ammoTypes.HE.splashRadius` (90px) 动态缩放；地面生成深色弹坑痕迹 `scorchMarks`。
  - **飞头/殉爆 (Turret Blow-off)**：弹药架致死摧毁触发 `spawnAmmoBlowFx`；炮塔在空中弧形抛物线飞行并剧烈自旋，一路留滚滚黑烟粒子 `smoke`，落地时生成剧烈震屏与落点冲击波。
- **伤害飘字 (Damage Numbers)**（2026-08-26，原 ISSUES #A6 修复定案）：
  - 飘字显示 min(res.dmg, 击杀前剩余HP)，击杀伤害不再溢出虚高；
  - DOT tick 加存活检查，目标死亡即清 dot 字段（mvp + bench 双页一致），尸体不再持续跳字；
  - 颜色语义：普通伤害白(plain) / 成员与非弹药架模块黄(module) / 弹药架红(ammoRack)；pen 色保留为 legacy 别名。
- **开火后坐与装填/底部 HUD（2026-08-28 落地；2026-09-15 W2 更新键位）**：
  - **开火后坐回弹**：`fireTank` 成功开火分支写 `shooter.recoilT = 0.08`（被掩体阻挡分支不写；2026-09-15 W2 后烟幕弹已删除，`fireSmokeShell` 不再存在）；主循环 player 与非玩家实体各自递减 `recoilT`（沿用 reloadT 递减模式）。`drawTank` 炮管段按 `sin(π·recoilT/0.08)` 生成出击-回弹位移，仅把视觉炮管 baseX/baseY 沿炮管反向平移（炮盾/护套/制退器随 baseX/baseY 自然跟随），**不改 gunRoot()/gunTip() 判定坐标**；位移量随口径 `barrelWid/18` 轻微缩放。
  - **装填进度环形化**：废除原屏幕底部横向装填条（`#reloadWrap` 的 `#reloadTrack/#reloadFill`），改为 `drawReloadRing(ctx)` 贴炮口 `gunTip(player)` 世界坐标的环形弧（世界坐标经 `worldToScreen`，半径固定 13px），从 -90° 顺时针扫 360°×进度，**满值(≥1)即消失**（仅战斗态、装填中、玩家存活时绘制），挂入战斗绘制循环（drawDrones 后、烟幕云前）。**2026-09-15 W6：主武器 autocannon 时该环改为热量表**——弧长 = heatPct/100，三态配色 绿 <50% / 黄 50–<100% / 红 ≥100%（过热锁定期间红色闪烁）；冷却由 `updatePrimaryHeat` 逐帧驱动，热量归零后环消失（详见 cards.md §8.3）。
  - **底部常显 HUD**：新增 `#bottomHud`（战斗态门控 `flow.state==='battle'`）——常显玩家血条 `#playerHpTrack/Fill/Val`（同 updateStatusPanel 口径）+ 能力按钮行 `#abilityBtns`：↻弹种循环(cycleAmmo)/**F 副武器击发（2026-09-17 #C4e 语义反转，取代 toggleWeaponSlot；图标随武器类型切换 + `#cdF` 装填角标）**/G 炮击/H 护盾（按钮=全向；键盘 H=定向、Shift+H=全向）/V 超装填/4 修理箱/5 医疗包/6 灭火器，`updateBottomHud()`（挂入 updateHud）刷新冷却角标——G/H/V 与 F **按技能独立冷却** `t.abilityCds[key]`（#C4c；F 角标显示 `secondaryReloadT` 装填剩余），冷却中置灰+角标秒数。纯 UI 薄包装接线，能力逻辑仍走既有 tryActivateAbility/tryRepairKit/tryMedkit/tryExtinguish。

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

## 8. 2026-09-20 用户反馈批次（#E4/#E5/#E7/#E8/#E10/#E12/#E13）现行口径

### 8.1 便携式掩体与布雷器：部署上限、预约与触发口径（#E4/#F5/#F6）
- **单向透明**：部署方阵营的炮弹可穿过便携式掩体（不拦截），**对立方**炮弹按确定性实体在掩体入口点被挡下（`tank_fire.js stepShells` 的 `_deployablePathHit` 与部署物 OBB 求交）。视觉上以朝向指示标注「我方穿透侧」：穿透侧画青色虚线 + 绿色箭头（`tank_mvp.html` 部署物绘制），对敌面为实线装甲边。
- **长度**：`RULES.abilities.deploy_cover.lenMult` 1.6 → **3.2**（再加长至当前 2 倍）；掩体厚度参数化为 `width`（22，旧硬编码 20）。
- **部署数量上限 + 超限拒绝（#F6 2026-09-20，取代 #E4「超限淘汰最早」）**：掩体基础 2 / 地雷基础 3，升级卡各 +1×步长（`upgradeCards`：`ability_deploy_cover_fortified→cover+1`、`weapon_secondary_mine_upgrade→mine+1`），硬上限 6/8。**能力/页面部署路径超限时拒绝新部署并提示，保留已部署物**：`js/tank_abilities.js` `deploy_cover` 与 `tank_bench.html` `spawnCoverBtn` 部署前检查 `deployableCount >= deployableCap` → 拒绝（不生成新掩体）；`tank_mvp.html` `handleMineFieldF` 已有预约（`pendingMineFields.length>0`）时按 F 拒绝；雷场生成前检查 `deployableCount('mine') + n > cap` → 取消该预约并提示，不生成新雷场（保留已布地雷）。共享核心 `enforceDeployLimits` 的「淘汰最早」仅作为兜底（绕过能力路径直接 spawn 时生效）；按类型独立计数。
- **布雷器两次 F + 4s 雷场**（`RULES.abilities.deploy_limits.mineFieldCount/Radius/Delay/Reload` = **3**/70/4s/15s；`mineFieldCount` 于 2026-09-30 #H2 由 5 改为 3，原值与 `mineMax(3)` 矛盾，详见 **§13.3**）：第一次 F 在鼠标位置显示**拟生成的雷场形状**（虚线圆 + 雷点预览，数量按当前可用余量裁剪）；第二次 F 确认 → 落点定格 → 4s 后在预形态位置环形生成整片雷场。**同一时刻仅允许 1 个待生成雷场**（`pendingMineFields.length>0` 时按 F 拒绝新预约——#F5 2026-09-20）。F 的按键语义为**原生 keydown 边沿**（见 §8.2「开关类副武器 F 边沿口径」）。
- **装填与触发口径（#F5 2026-09-20；#H2 2026-09-30 补齐雷场路径）**：布雷受 `secondaryReloadT` 装填冷却门控——**单发路径**由 `fireActiveSecondary` 顶部统一拒绝（单发 15s），**雷场路径**由 `handleMineFieldF` 在确认预约时写入 `secondaryReloadT = reload / debuffReloadRate`、冷却中按 F 拒绝（#H2 前该路径完全漏写，`secondaryReloadT` 恒为 0，15s 冷却形同虚设且可无冷却连点）；地雷**触发半径** = 单发/雷场 **45px**、`spawnMine` 默认 **40px**（`tank_deployables.js`，bench 手动布雷受益）——判定为敌对实体**中心点**距离 ≤ triggerRadius；爆炸 AOE `blastRadius` 70，mvp 伤害走 `applySplashAt`（×0.5 衰减）、bench 走事件直算，触发阵营敌对实体生效（玩家自身也会被己方地雷波及）。

### 8.2 反坦克导弹两种制导（#E5）+ 开关类副武器 F 边沿口径（#F7）
`F` 键语义按副武器类型分派（`tank_mvp.trySecondaryFire`）：
- **锁定式（`missile`）**：F = **激活**，立即开始索敌（炮塔 ±`lockArcDeg` 扇形内最近敌对目标）→ 锁定计时满 `lockSeconds` 后**立即发射**（`updateMissileLock`，玩家侧主循环逐帧驱动）；再按 F 取消激活。飞行制导 = 追尾 + **比例引导（PN）**：`RULES.missiles.lock`（`turnRate 3.5 rad/s`、`navConstant N=3.0`）。
- **线导式（`missile_wire`）**：F = **直接发射**，飞行方向由**鼠标**持续引导（`shooter._secondaryTargetPos` 每帧更新）——等效视线角速度为 0 的比例引导；`RULES.missiles.wire`（`turnRate 4.5`、`N=0`）。已并入 `RULES.weaponTypes.secondary` 白名单与 HUD 标签/图标（「反坦克导弹（线导式）」）。
- **开关类副武器 F 边沿口径（#F7 2026-09-20）**：**"按一次切换状态"的副武器（`missile` 激活/取消、`mine_layer` 预形态/确认）一律由原生 `keydown` 边沿驱动**（`tank_mvp.html` 独立监听：`e.repeat` 过滤 + `inMenuState/statusOpen/devOpen` 门控 + 战斗态 `fireCtx` 判定），**不得**走主循环 `input.isDown('fireSecondary')` 逐帧轮询——逐帧轮询会让开关在按住期间每帧翻转（实测按住 F 250ms 内 9 次 true/false 交替），松手后的状态取决于帧数奇偶（轻按 F 约一半概率停在「已取消」，表现为「导弹按 F 没反应」）；mine_layer 更会一次按住跨帧连走「预形态→确认」（一按即预约，预形态名存实亡）。**"按住连发"类（`mortar`/`rocket`/`missile_wire`）保持逐帧轮询**（装填门控天然限速）。HUD 的 F 按钮点击走 `trySecondaryFire(true)`（`force=true` 绕过键盘边沿直调）。

### 8.3 敌方 AI：反应延迟 + 全高掩体遮视野 + engage 传播（#E7/#E8）
- **反应延迟（#E7）**：首次进入接战后进入 `react` 态——只转炮塔、**不移动不开火**，时长 `RULES.ai.reactionSecondsBase~Max`（1.15~1.9s）按「距离/触发边界比」加权 × 档位 `tierProfiles[].reactionMul`（tier1 0.82 / tier2 0.65）× 随机抖动（±25%）。**仅对正式对局生成的敌军生效**（`tank_map.makeNode` 打标 `aiReactEnabled=true`；bench/单测裸实体保持即时响应）。受击惊醒（`alertEntity`）把剩余延迟 ×`reactionAlertMul`（0.5）——更快但不瞬发。
- **全高掩体遮视野（#E8）**：激活门控改为「距离达标 **且** 有视线」(`RULES.ai.engageRequiresLoS`)——建筑/岩石/树（`tier.vision===true`）挡住视线时敌人不再「进入范围立即行动」，保持 `patrol`；受击/友邻告警（携带 `lastKnownPlayerPos`）不受此门控限制，仍进入 `search` 推进。
- **engage 状态传播（#E8）**：某敌人**首次进入接战**时，把「已接战 + 已知玩家位置」传播给 `RULES.ai.engagePropagateRadius`（420px）内友邻（概率 `engagePropagateChance` 0.7），每跳半径 ×0.7、最多 2 跳（避免一处暴露唤醒全图）；被传播者各自按反应延迟行动。此前只有**受击**传播（`propagateAlert`），进入接战本身不传播。

### 8.4 HE 系击退（#E10）
击退与爆炸范围绑定：**击退距离 = `splashRadius` × `splashKnockbackMul` × (1 − dist/radius)**（线性衰减），由 `tank_physics.applySplashKnockback` 施加（`applySplashAt` 内统一调用，坦克/Boss/召唤物一视同仁），世界边界经 `setSplashWorldBounds` 钳制（mvp 进节点注入节点尺寸）。

| 弹种 | `splashRadius` | `splashKnockbackMul` | 满命中击退 |
|---|---|---|---|
| `he`（HE） | 90 | 0.55 | 49.5px |
| `hesh`（HESH） | 100 | 0.7 | 70px |
| `proximity_he`（HE-VT） | 90 | 0.6 | **54px** |
| `blast_he`（HE-OP） | 110 | 0.95 | **104.5px** |

其余弹种（AP/APCR/HEAT 系）无该字段 → 零击退（行为不变）。**HE-OP > HE-VT** 为用户明确要求。

### 8.5 双联火炮重做（#E13）
- **装填语义**：装填时间是**单根炮管**的装填时间；两管按**顺序流水线**装填（同一时刻只有一根在装填）——例：「装填 5s，+0s 齐射 → +5s 第 1 管装好（可单发）→ +10s 第 2 管装好（可齐射）」。
- **默认进度互相干涉**：任一击发后**两管装填进度都归 0**（`_dbState.loadT` 全清），流水线从头开始。
- **「交替装填系统」卡**（`weapon_primary_alt_reload`）：稀有度由 **legendary 升为 mythic（神话，新增最高档）**；效果 = `altReload: true` 解除干涉（击发一管不影响另一管的进度——「+6s 发射时另一管仍是 +1s 进度」）+ `switchSeconds 0.05` + `reloadMult 0.9`。
- **击发（#F 2026-09-20 用户裁定细化）**：鼠标单击 = 发射一根已装填炮管；空格 = 齐射——**仅两管都就绪才发射**，仅 1 管（或无）就绪时空格**不发射**（与卡牌界面文案「空格齐射（仅两管都就绪时）」一致）。1 管就绪时齐射被拒对玩家侧写 `shooter._dbLastBlocked = 'salvo-not-ready'` 并推送提示「空格齐射需要两管装填完成 — 单击可先发 1 根就绪管」（COVER；重复触发不刷屏，`_dbLastBlocked` 同值时静默），且**不影响随后单击单发**（单击照常发射就绪管）；无就绪管时不提示。`fireDoubleBarrel` 返回 `{ fired:false, shells:0, reason:'salvo-not-ready'|'none-ready' }`。`_dbState = { count, ready[], loadT[], loader, altReload }`。
- **视觉/音频**：炮口火光尺寸 ×1.7（粒子同步放大）、开火音效增益 ×1.6（`playSound('fire', {gain:1.6})`）+ 额外烟雾；`barrelOffset` 0.9 → **1.85**（炮管间距加大，确保炮管与附件不穿模）；**两根炮管各自绘制完整附件**（护套 jacket / 制退器 muzzle brake / 抽烟器 evac 逐管成对）。
- **HUD**：双管时显示**两根炮管各自的独立装填进度弧**（沿炮塔法向左右分列，与炮管偏移同源；就绪的管显示实心亮点），取代单环指示。

### 8.6 卡牌稀有度新增「神话」档（#E13）
`CARD_RARITIES = ['common','rare','epic','legendary','mythic']`（序号即强度序），权重 `50/30/15/4.5/0.5`；Boss 掉落白名单 `LOOT_RARITIES` 同步扩展；HUD 标签新增「神话」。Boss 保底池过滤按新序自动生效（`bossLootPool` 用 `CARD_RARITIES.indexOf` 比较）。

### 8.7 摄像机随鼠标向外延伸（#E12）
`tank_camera.updateCameraLead(cam, screenX, screenY, dt)`：外延距离 = `RULES.vision.radius × RULES.camera.mouseLeadRatio`(0.30) × 归一化鼠标偏移（0~1，视口半宽/半高为满值；对角方向按向量长度钳到 1），并按 `cam.zoom` 反向补偿（`mouseLeadZoomComp`，缩放不改变世界侧外延量），经 `leadLerp`(5) 指数阻尼平滑；`updateCamera` 把 `cam.leadX/leadY` 叠加到跟随目标上（视口中心 = 玩家 + 外延）——即「距离和视野绑定」。未调用 `updateCameraLead` 时外延恒 0（与旧版跟随逐字节一致）。**（2026-09-21 #H1 起，外延的「视野绑定」经视口窄轴收口等距化，见 §10。）**

---

## 9. 2026-09-21 用户反馈批次（#G1~#G8）现行口径

### 9.1 主武器第五型「弹夹炮」`clip`（#G6）

主武器类型枚举 `RULES.weaponTypes.primary = ['standard','autocannon','double_barrel','railgun','clip']`。弹夹炮参数唯一口径 `WEAPON_DEFAULTS.primary.clip`：

| 参数 | 值 | 语义 |
|---|---|---|
| `reloadMult` | 3.0 | 弹夹间整组装填 = 标准装填 × 3.0 |
| `clipSize` / `clipSizeBase` | 4 | 初始弹夹容量（发），升级卡每 +1 发 |
| `clipCycleSeconds` | 0.7 | **弹夹内**逐发间隔（固定，**不受任何 modifier/卡牌/debuff 影响**） |
| `clipSizeReloadStep` | 0.8 | 每扩容 1 发，弹夹间装填 +0.8×标准装填 |
| `damageMult` / `penMult` / `shellSpeedMult` | 1.0 | 单发伤害/穿深/弹速与标准炮一致 |

- **装填两段式**：弹夹内有弹（`rounds > 0`）→ 击发后 `reloadT = clipCycleSeconds`（0.7s，硬编码、不乘任何倍率）；弹夹打空 → 进入**整组重装**（`pendingRefill = true`），`reloadT = 标准装填 × (3.0 + 0.8 × (size − 4)) ÷ debuffReloadRate(t)`（**该段生效 debuff**），归零后一次性回满 `rounds = size`。
- **弹夹间装填不随扩容线性膨胀是设计意图**：容量 4→6 时整组时间 = 标准 × 4.6（而非 ×6），扩容卡仍有正收益但边际递减。
- 运行时状态挂 `t._clipState = { size, rounds, pendingRefill }`；武器换装卡（主武器升级路径）清空该状态（与 `_dbState` 同生命周期）。逐帧驱动 `updatePrimaryClip(t, dt)` 由页面主循环负责（mvp 玩家 + AI 实体 / bench 玩家 + 靶车）。
- **HUD**：`drawReloadRing` 弹夹分支——弹夹内显示余量数字 `rounds/size` + 蓝色间隔弧；整组重装期显示橙色「装填」弧（进度按 `clipMagReloadSeconds` 归一）。
- 卡牌：`weapon_primary_clip`（epic，安装）/ `weapon_primary_clip_extended`（rare，`{"clipSize":"+1"}`，maxStacks 2）。

### 9.2 弹种/武器 `statOverrides` 支持 `"+N"` 相对增量（#G6）

升级卡（`weapon_primary_*_upgrade` / `weapon_secondary_*_upgrade`）的 `statOverrides` 值现支持三类：`number`（绝对值覆盖）、`boolean`（开关，如 `altReload`/`guided`）、`"+N"` 字符串（**在当前值基础上加 N**）。合并由 `tank_cards.js mergeStatOverrides(stats, overrides)` 统一执行（`"+N"` 走 `Number(...)+N`），主/副武器两条升级分支同源。`validateCard` 对三类值均放行，其它类型判非法。

### 9.3 电磁轨道炮强度重调（#G5）

`WEAPON_DEFAULTS.primary.railgun`：`reloadMult` 2.2→**1.8**、`damageMult` 1.5→**1.8**、`penMult` **2.0**、`shellSpeedMult` 2.5，并新增**贯穿**机制：

| 参数 | 值 | 语义 |
|---|---|---|
| `pierce` | 1 | 击穿首个目标后继续飞行的**额外**目标数（1 = 共可命中 2 个） |
| `pierceDmgMul` | 0.6 | 后续目标伤害倍率（逐个连乘） |

- 实现（`tank_fire.js`）：`firePrimaryShell` 在 `spec.pierce > 0` 时给炮弹写 `pierceLeft` / `pierceDmgMul` / `pierceHitIds`；`stepShells` 命中判定跳过 `pierceHitIds` 内实体（不重复命中原目标），PEN 结果且 `pierceLeft > 0` 时递减计数、`shell.dmg *= pierceDmgMul`、把命中点写回 `fx/fy`、`dist += step` **继续飞行**；倍率耗尽或结果为非穿透才 `dead = true`。
- 定位：高穿深（×2.0）+ 高单发伤害（×1.8）+ 贯穿 2 目标，代价是装填 ×1.8 与弹速最快；配合 APFSDS+ 高穿弹收益最大（穿深叠加后能稳定贯穿中坦正面）。
- 配套卡：`weapon_primary_railgun`（epic 安装，数值与上表同源）/ `weapon_primary_railgun_upgrade`（rare，`{reloadMult:1.7, shellSpeedMult:3.0}`）。

### 9.4 主动防御系统 APS（#G9，新技能）

`RULES.abilities.aps`：`duration` 6s / `radius` 240px / `maxIntercepts` 3 / `cooldown` 22s。

- 能力键 `aps`（runtime 键，加入 `ABILITY_KEYS_RUNTIME`）；卡牌 `ability_aps`（epic）经技能池 **1~3 号技能键**触发（无独立字母键）。
- 激活：置 `t._apsT = duration`、`t._apsHits = 0`，冷却入 `abilityCds.aps`。
- 拦截层 `updateAps(t, dt)`（页面主循环在 `stepShells` 之后逐帧调用）：`_apsT > 0` 时扫描 `shells`，**敌方阵营**弹药进入 `radius` 即销毁（`s.dead = true`）+ 拦截爆炸/音效/日志；达 `maxIntercepts` 后窗口保持但不再拦截；`_apsT` 递减至 0 自动关闭。
- 生命周期：`removeRunModifiers` 清零 `_apsT`/`_apsHits`（跨局不残留）。
- 与 `shield` 的分工：护盾是**吸收伤害**（入射角/定向/全向 + 吸收池破裂），APS 是**提前销毁弹药**（对己方无吸收池，对高爆/导弹类效果更彻底）。

### 9.5 Boss 激光炮塔转速与召唤波次（#G1/#G2）

- **激光炮塔转速**（#G1）——**已被 §10.1（#H4）取代**：~~timed modifier 源 `boss-laser-turn` + `chargeTurretTurnMul`/`fireTurretTurnMul` 乘数方案~~。乘数方案的实际角速度 = Boss 基础 `turretTurnRate`（经 tuning ×0.6 与难度乘子压低）× 0.15~0.18 ≈ 0，用户实测「炮塔又不转动了」，已废弃。现行口径见 §10.1。
- **召唤波次兜底**（#G2）：`RULES.boss.summonWaves` 新增 `defaultPool`（缺省 `[{tankId:'dummy',count:2}]`）与 `defaultWaves`（3）。`bossSummonWave` 在配置 `summons` 为空**且** `t.boss.id` 存在时，用 `defaultPool` 补足 3 波（`hpFrom` 依次取 1.0 / 配置默认），裸测试实体的空 summons 仍返回 null（不污染单测）。5 个 Boss JSON 均已补 3 波 `summons`（`hpFrom` = 1.0/0.66/0.33 对应 100%/67%/33% HP 触发）。

### 9.6 底部 HUD 三区重设计（#G7/#G8）

`#bottomHud` 由旧「血条 + 单排按钮列」改为 **flex 三区**（`display: flex`，JS 侧 `updateBottomHud` 同步改 `'flex'`——旧 `'block'` 会杀死分区布局）：

| 区 | 容器 | 内容 |
|---|---|---|
| 状态 VITALS | `#hudVitals` | `#playerHpWrap`（血条 240×12 + 数值）+ `#hudSpeedRow`（档位 `#hudGear` D/R、`#hudSpeedVal` + km/h 单位、速度条 `#hudSpeedTrack`/`#hudSpeedFill`、公路加成 `#hudRoadBonus`） |
| 武器 WEAPONS | `#hudWeapons` | 弹种槽 `#slot1~3` + 补给键 `#btn4/5/6` + 副武器 `#btnF` |
| 技能 SKILLS | `#hudSkills` | 专属键 `#btnG/H`（**仅当该技能未占用技能池槽位时显示**，见 §13.2）+ 技能池槽 `#skillSlot1~3`（玩家指派，技能名 + 数字键 + 冷却） |

- **速度读数**：`tankCurrentKmh(t) = |t.speed| ÷ (RULES.speed.pxFactor × effMul) × kmhFactor`（`tank_model.js`，已导出）。**必须先除 `pxFactor×effMul` 再乘 `kmhFactor`**——直接乘会得到 ~208km/h 的虚高读数（`tank.speed` 已含 ×1.3 有效乘子）。速度条以 `tankKmh(t)`（极速上限）为满值。
- **技能池槽位映射（#H3 2026-09-30 重做，现行口径见 §13.2）**：`#skillSlot1~3` 的内容**直接读 `player.skillSlots`（玩家可指派）**，不再是 `cardEffects` 的自动去重序列。名称取 `ABILITY_LABELS`，冷却取 `abilityCds[key]`；点击槽位施放，`Shift+点击`改指。**原「自动按获得顺序填槽 + 专属键按钮并存」口径已废弃**（它导致同一技能两个按钮、槽满后第 4 个技能无法激活）。
- **元素 id 为测试契约**：`#reloadWrap` / `#bottomHud` / `#hintBar` 保留（smoke 依赖）；`btnG/btnH` 必须可点击（run/r4 断言）；`btnV` **必须不存在**（#H3 删除，`test-browser-run.cjs` 断言 `removed`）；bench 页**不得**出现 `#hintBar`。
- **技能获得提示补全**：`ABILITY_KEY_HINT` 补 `repair`/`medkit`/`extinguish`（4/5/6 键）与 `aps`，并把 G/H/V 条目文案改为「G 键 / 1~3 号技能键」（数字键与专属键并列可用）。**#H3 后仅 G/H 仍为专属字母键**，超装填（overdrive）经 1~3 号技能键。

### 9.7 装填进度环漏乘武器 `reloadMult` 的修复（#G5 附带）

`drawReloadRing` 单环分支（mvp）与 bench 装填条此前用 `player.stats.reload / debuffReloadRate(player)` 作时长，**漏乘武器通道 `reloadMult`**——电磁轨道炮（×1.8）装填的前 44% 时间内进度环恒空、随后跳变。现统一经 `primaryWeaponSpec(player).reloadMult` 折算（双管/弹夹分支不受影响）。

---

## 10. 2026-09-21 #H1 视野等距修正（现行口径）

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
- 消费方：`tank_mvp.html visionRadiusEff()`（`entityHiddenByVision` 判定 + §9.6 视野圈绘制同源）；镜头外延 `updateCameraLead` 不变。
- 回归：`scripts/test-camera.js` #H1 段——轴向等距（6 方向前向距离恒等）/ 超宽屏同上限 / 竖屏同规则 / zoom 0.8·1.3 全程等距 / 4K 基准绑定 / 卡牌边界语义 / 值域护栏。
- **（#H2 2026-09-21 用户裁定「纵向拉长而非削弱横向」→ 本节收口降级为放大超出适配值时的等距安全网，现行口径见 §11.1。）**

---

## 11. 2026-09-21 #H3/#H4 用户反馈（现行口径）

### 11.1 敌方可见距离：屏幕相对化（#H5 现行口径）——取代 #H1/#H2

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

- **固定角速度直驱**（取代 §9.5/#G1 的乘数方案）：激光期（蓄能+射击）由 `updateBossLaser` 直接推进 `t.turretAngle`，角速度 = `RULES.boss.laser.laserTurnSpeed`（**0.55 rad/s ≈ 31.5°/s**，绝对值、不受 modifier/难度乘子影响）；转向目标 = AI 本帧期望方向（`opts.turretDesired`，已含射界钳制），到向即停。
- **AI 转炮抑制**：激光期置 `t.bossLaserHoldTurret = true`，mvp AI 循环据此跳过炮塔驱动（车体机动/开火不变）——两套驱动不再叠加；激光结束/冷却/未解锁/死亡自动释放。
- **全高掩体阻挡**：伤害循环逐目标做炮口→目标连线 × OBB 遮挡判定（`_laserBlockedByCover`，自包含零依赖实现；`opts.covers` 注入节点掩体）——判据 `tierGroup:'structure' && vision`（**building/full/intact/rock/ruined**）；被挡目标本帧不掉血（`laserBlocked` 事件），光束继续存在；灌木/栅栏/水/泥/路/残骸不阻挡；掩体被摧毁后自动失去阻挡（hp<=0 跳过）。
- `RULES.boss.laser`：新增 `laserTurnSpeed: 0.55` / `blockByFullCover: true`；删除 `chargeTurretTurnMul`/`fireTurretTurnMul`（含 `BOSS_LASER_TURN_SOURCE` 导出与 `_setBossLaserTurretMod`/`_clearBossLaserTurretMod`）。
- 回归：`scripts/test-boss.js` #H4 段——hold 标志/固定转速单帧转角与到向即停/hold 释放/建筑与岩石阻挡/灌木与空场不阻挡。

### 11.4 敌方可见距离不得写死像素（#H5，见 §11.1）

> **已被 §13.5（#J3，2026-09-30）取代**：本条所述「可见距离」机制随视野系统整体退役，`RULES.vision` 仅作历史留档、不再参与任何判定。以下为沿革原文。

**用户裁定**：「目前敌方渲染的距离写死成了像素，会受缩放影响，迫使玩家始终以最高倍率游玩，失去一些细节」——本条即 §11.1 屏幕相对化的直接动机：#H1/#H2 系列以固定像素（900px 世界半径）定义可见距离，缩放直接改变敌人的屏幕出现位置，#H2 只能靠强制拉远补偿。现行口径 = §11.1（屏幕相对，R×zoom 恒定，缩放纯视觉偏好）。

### 11.5 镜头外延量与「视野卡收益」的几何关系（2026-09-23 B 档落地，现行口径）

> **⚠️ 本节已被 #K1（2026-09-29）取代**，并随 **#J3（2026-09-30，视野距离系统整体退役）** 一并作废：可见半径的**收口上限 cap 与 `bias×R` 圆心偏移已移除**（圆心改取摄像机中心 ⇒ 圆内切视口），随后整个可见距离体系下线（视野卡 `commander_sight` 亦删除）。本节保留为**沿革记录**，现行口径见 **§13.5**。

- **旧公式（已废止）**：`R = min( screenRadiusRatio × 窄半幅/zoom × (1+视野卡加成), ((窄半幅 + radius×mouseLeadRatio)/zoom) / (1+bias) )`，圆心再朝鼠标偏移 `bias×R`（0.35）。
- **旧口径的残留缺陷（#K1 根因）**：圆心偏移恒为 `bias×R ≈ 189px`（鼠标向量被归一化），而摄像机外延量独立地随鼠标偏移在 0~360px 变化 ⇒ 两者几乎总不相等 ⇒ **圆探出视口**（外延 < 189 时向前探出、外延 > 189 时向后探出）。外延为 0（鼠标居中）时前向探出达 189px ⇒ 该带内敌人「判定可见却不渲染」= 2026-09-29 用户反馈 #K1。抬 `mouseLeadRatio`（0.30→0.40）只能让**满偏转**时不再探出，鼠标居中时仍探出。
- **沿革数值**：`mouseLeadRatio 0.30` 时 `cap = 600` ⇒ +15%/+25% 两卡同被压到 `R = 600`（实得同为 +11.1%）；`0.40` 时 `cap ≈ 667` ⇒ +15% 足额 621、+25% 实得 +23.5%；**#K1 起无 cap ⇒ +25% 全额 675**。
- **现行激活窗口边界**：接战距离上限 `650px`；无卡前向可见 = `R + 外延`（外延 0 时 540、满偏 360 时 900px）⇒ **鼠标朝推进方向时开火前可见，鼠标居中时仍可能「激活→可见」存在窗口**（设计边界，用户已接受）。

---

## 12. 2026-09-21 #I 批次用户反馈（现行口径）

### 12.1 Boss 激光期车体冻结 + 炮塔再降速（#I1）

**用户裁定**：「boss 发射激光时车体不能移动，炮塔转速再降低」。

- **车体冻结**：激光期（蓄能+射击）新增 `t.bossLaserHoldMove = true`——接入层（mvp AI 循环）据此**连 `driveTank` 一并跳过**，车体全程定桩（此前仅抑制炮塔转炮，车体仍被 AI 驱动）。激光结束/冷却/未解锁/死亡自动释放；走位博弈完全交给玩家。
- **炮塔再降速**：`RULES.boss.laser.laserTurnSpeed` **0.55 → 0.35 rad/s（≈20°/s）**。仍为固定角速度直驱（绝对值、不受 modifier/难度乘子影响），蓄能期与射击期相同。
- **量化意义**：激光周期 41 帧 × 0.035 = 1.435 rad < π/2(1.571)——**单次激光周期内炮塔转不满 90°**，玩家的绕侧/走位窗口显著变宽（回归断言锁定该上限）。
- 回归：`scripts/test-boss.js` #I1 段（蓄能期 holdMove / 释放 / laserTurnSpeed=0.35）+ #H4 段改为「限速转角 ≤ min(帧数×步长, π/2)」的动态断言。

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

**用户裁定**：「继续增加地图、特别是 boss 战地图的建筑密度」——`RULES.nodeMap.building` 参数提升（clusterPerJunction 3~5→4~8、maxPerNode 18→28）+ Boss 节点密度乘子 `bossDensity: 1.6`；并修复 #E3/#G 遗留缺陷（`fits()` 对含道路的 outCovers 用 pad 34 判重叠 ⇒ 沿路/路口建筑恒被拒绝、密度参数完全空转）。实测 8-seed 结构数 87 → 103（×1.6）。校准基线第三次重锚（`test-nodegen-calibration`，连通性维持 0.999~1.000）。

---

## 13. 2026-09-30 #H 批次用户反馈（现行口径）

### 13.1 敌军数值基准：固定基准（#H1）

**用户裁定**：「敌人难度不应随**局外商店升级**变化，只应随节点推进变化」。

- **问题定位（实测）**：难度曲线本身与商店无关——`difficultyForIndex(index, difficultyLevel)` 只吃节点索引与跨局等级，且 `difficultyLevel` 每次新局强制归零。真正的放大来自**两条以玩家为锚的链路**：
  1. `applyEnemyAppearanceAndStats`（`js/tank_model.js`）把敌军 `base.{maxHp,penetration,damage,reload,maxSpeed,turnRate,turretTurnRate}` 与 `armor.*` 全部写成 `玩家 anchorStats × RULES.enemyClassProfiles[class]`；锚点快照在 `applyUpgrades()` **之后**冻结，故局外永久升级直接乘进全部敌军基准。
  2. `difficultyCapMuls` 的穿深封顶 / 伤害地板与天花板 / 速度目标全部乘 `player.stats`。
  ⇒ 商店每买一级，下一局全部敌军同比例抬升，玩家成长收益被难度同步抵消。实测：五项永久升级买满后，同一节点敌军穿深 149.96→173.60、伤害 35→45.50、血量 64.29→104.47，而 `node.difficulty` 与节点难度序列完全不变。
- **现行口径**：
  - 新增 **`RULES.enemyAnchorBase`**（与玩家无关的固定基准，取中位中坦量级）：`maxHp 100 / penetration 120 / damage 34 / reload 1.3 / maxSpeed 120 / turnRate 2.0 / turretTurnRate 2.2 / shellSpeed 1200 / weight 50 / enginePower 700 / armor{hull,turret}{front 100, side 40, rear 25}`。
  - 敌军数值 = `enemyAnchorBase` × `enemyClassProfiles[class]` × `entityMults(diff)` × `difficultyCapMuls`（改按固定基准）。**玩家选车、局内卡牌、局外永久升级一律不影响敌军强度**；敌军强度只由节点难度 `diff` 决定。
  - 四个封顶键**改按固定基准**并改名：`penCapVsBaseline`(1.2) / `dmgFloorVsBaseline`(0.4) / `speedVsBaseline{baseFloor 0.3, baseCeil **0.5**, randMin .85, randMax 1.15}`；`dmgCapAmmoMult`(0.7) 保留，参照终伤缺省由新键 **`strongestAnchorMult`(2.33)** × 基准伤害推算（**不再退化为 `Infinity` = 无上限**）。（沿革：`speedVsBaseline.baseCeil` 2026-10-01 由 0.6 下调至 **0.5**，见 §13.4。）
  - **废弃**：`applyEnemyAppearanceAndStats` 第三参 `anchorStats`（保留形参仅为兼容旧调用方，**函数内忽略**）、`applyDifficultyMults` 的 `strongest` 传参、mvp 的 `playerAnchorStats` 及其 3 处赋值、bench/测试中的 `anchorStats: player.stats`。
- **沿革**：原 P-46「玩家基准锚定制」设计意图（保证节点 1 与玩家出厂配置匹配）已被本条取代——同一节点对所有玩家难度一致优先于该匹配。
- **回归**：`scripts/test-modifiers.js` #H1 段——`enemyAnchorBase` 已定义、**强弱玩家下 `penMul`/`speedMul` 逐值相同**、传玩家基准不改变敌军 `base`、缺 `strongest` 时天花板有确定值。

### 13.2 技能槽指派体系：玩家选择顶替（#H3/#H4）

**用户裁定**：「循环复用，按玩家选择顶替掉某个槽位的技能」。

- **原缺陷（实测）**：`skillHotkey` 用 `owned[num-1]`（`owned` = `cardEffects` 去重顺序）导致：① `artillery`/`shield` 既有专属键按钮（`btnG`/`btnH`）又自动进槽 ⇒ **同一技能两个按钮**；② 运行时键 7 个 > 槽位 3 个且 TAB 面板无激活入口 ⇒ **第 4 个及以后的技能彻底无法激活**；③ `owned` 不足时回落 `fallbackList(['deploy_cover','artillery'])` ⇒ **按隐藏的 3 号键会实际触发 1 号槽的技能**。
- **现行口径**：
  - **槽位 = `player.skillSlots`**（长度 3，元素为 ability key 或 `null`），随局重置（`prepPlayerForRun` 清空）。
  - **指派流程**：新技能先自动填入空槽；**槽满时弹「技能槽指派」面板（`#skillSlotPicker`）列出 3 个槽各显当前技能，玩家点哪一格，新技能就顶替哪一格**。待指派技能进入队列**逐个弹出**（不静默丢弃）。`Esc` 关闭面板并吞键（不误触发暂停或施放），面板打开期间输入控制器 `gate` 拒绝全部按键。
  - **随时改指**：`Shift+点击`槽位按钮 → 面板列出全部已获得技能（含「清空该槽」）。
  - **数字键严格映射槽位**：`skillHotkey(n)` 只读 `skillSlots()[n-1]`，**空槽无任何效果**（**已删除 `fallbackList` 回落**）。技能键 → 激活动作由 `SKILL_DISPATCH` 单一表分发。
  - **专属键按钮**：仅当该技能**未占用任何槽位**时显示 `btnG`/`btnH`（入槽后由槽位按钮唯一呈现，`title` 标注「亦可按 G/H」）；冷却角标同步只在唯一入口上显示。
  - **角标语义**：技能槽角标为数字 `1/2/3`（对应 `KEY_BINDINGS.skill1~3`）；**弹种槽角标改为选中指示 `●/○`**，其 `title` 统一为「Q/E 环形切换 / 点击选择」——数字键归技能池，弹种切换走 Q/E（消除「按 1 切第一发」的误导）。
- **不变量**：7 个运行时技能键中**不存在无激活路径的死键**——任何已获得的技能要么在槽位（可见 + 数字键），要么在专属键按钮上。
- **回归**：`scripts/test-browser-r4.cjs` E 段——`btnG`/`btnH` 不重复显示、槽满弹选槽位面板、玩家指定顶替、循环复用不产生重复入口、空槽按数字键不触发、数字键精确命中。

### 13.3 布雷器可用性与装填门控（#H2）

**用户反馈**：「地雷无法释放」。

- **原缺陷**：`RULES.abilities.deploy_limits` 中 `mineFieldCount(5) > mineMax(3)`，而生成侧 `n = min(mineMax, count)` 把 5 钳成 3，配上「`existing + n > cap` 即拒绝」的判据 ⇒ **首轮布满 3 枚后所有后续雷场 100% 静默丢弃**；`handleMineFieldF` 既不检查也不写入 `secondaryReloadT`，15s 装填完全失效；绘制层二次用 `mineMax` 钳制，预形态与实际落点数对不上。
- **现行口径**：
  - **落雷数按可用余量裁剪** `n = clamp(mineFieldCount, 0, cap − existing)`，预约时与生成时各裁一次；**余量为 0 才拒绝，且在按 F 的瞬间即提示**（不再让玩家白等 4s）。#F6「超限拒绝且保留已布地雷」原意保留。
  - `mineFieldCount` 由 **5 改为 3**（与基础上限自洽）；若要更大的单次雷场应同步上调 `mineMax`。
  - **装填门控**：确认预约时写入 `player.secondaryReloadT = reload / debuffReloadRate`（`RULES.abilities.deploy_limits.mineFieldReload = 15` 兜底），冷却中按 F 直接拒绝并提示——与单发布雷路径（`js/tank_weapons.js` `fireActiveSecondary`）同口径。
  - 绘制层直取预约时的数量（`pf.count`），所见即所得。

### 13.4 敌人难度数值再调优（2026-10-01 用户裁定，现行口径）

**用户裁定（三条）**：① **降低速度上限倍率**；② **提高敌人（包括 Boss）血量**；③ **略微提高敌人升级速度**（敌人随节点推进变强更快 ⇒ 难度曲线现行口径见 `specs/map.md` §16）。

- **现行值（`RULES.difficulty`）**：
  - `entityMults.maxHp` **[0.5, 1.7]**（沿革 `[0.45, 1.4]`；低难度端 +11%、满难度端 +21%）；
  - `entityMults.maxSpeed` **[0.7, 1.0]**（沿革 `[0.7, 1.15]`；满难度极速上限倍率 −13%）；
  - `speedVsBaseline.baseCeil` **0.5**（沿革 0.6；`baseFloor 0.3`、`randMin/randMax 0.85/1.15` 均不变 ⇒ **低难度敌军速度不变、难度曲线更平缓**）。
- **生效范围（重要）**：普通敌军的极速最终由 `speedVsBaseline` 封顶公式覆盖（`difficultyCapMuls` 与「直写 stats」逐值等价）⇒ `entityMults.maxSpeed` 上限下调**主要作用于 Boss 与其它未封顶路径**（Boss 经 `applyDifficultyMults(..., applyPlayerCap=false)` 跳过封顶）；血量无封顶键，故两端（普通敌人 + Boss）同时受益。
- **Boss 血量**：归口 `specs/boss.md` §5（`tuning.hpMul` 沿革 ×8 → ×9；Boss 血量 = 出战配置 maxHp × hpMul × `entityMults.maxHp(diff)`，两级叠加）。
- **实测增幅（2026-10-01 探针；`enemyAnchorBase.maxSpeed = 120`、`randFactor = 1`）**：

  | 节点 index | diff（旧→新） | 普通敌人血量倍率（旧→新） | 普通敌人极速 px/s（旧→新） | Boss 血量倍率（旧→新） |
  |---|---|---|---|---|
  | 0 | 0.15 → 0.15 | 0.574 → 0.657（**+14.5%**） | 36.0 → 36.0（不变） | 4.59 → 5.91（**+28.8%**） |
  | 4 | 0.35 → 0.36 | 0.739 → 0.876（**+18.5%**） | 45.0 → 42.3（−6.0%） | 5.91 → 7.88（**+33.4%**） |
  | 8 | 0.63 → 0.64 | 0.970 → 1.168（**+20.4%**） | 57.6 → 50.7（−12.0%） | 7.76 → 10.51（**+35.5%**） |

  含每辆 `randFactor` 上限（1.15）时的极速上限：**82.8 → 69.0 px/s**（高难度）。
- **回归锚点**：`scripts/test-panels.js` 速度封顶断言重锚 **72 → 60 px/s**（= 0.5 × 基准 120）；`scripts/test-modifiers.js` #H1 段的封顶/地板/速度公式按 `RULES.difficulty.speedVsBaseline` **动态自算**（改值自动跟随）；`scripts/test-map.js` 的 `entityMults` 端点断言以 `RULES.difficulty.entityMults` 为唯一真值（同为动态）。

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

- **#J1（2026-09-30 用户反馈「地雷在 1 个节点内似乎只能部署 1 次」）**：`RULES.abilities.deploy_limits.mineMax` **3 → 6**、`mineMaxHardCap` 8 → 12；`mineFieldCount` 保持 3。
  - **根因**：`mineMax` 是「**场上同时存在**的地雷数」上限，而它恰等于单次雷场数量（3），首轮即把上限用尽；地雷存续 30~45s、单节点战斗远长于此 ⇒ 后续雷场全部被拒。
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

