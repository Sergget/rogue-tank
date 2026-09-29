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
  - **锁定式反坦克导弹**（secondary `missile`）：手动击发沿光标方向直飞（`target=null`，不再自动寻的）；AI/Boss 实体的副武器仍走 `updateSecondaryWeapon` 自主索敌（`updateMissileLock` ±30° 扇形/1.0s 锁定/自动发射；参数 `WEAPON_DEFAULTS.secondary.missile.lockArcDeg=30/lockSeconds=1.0`）。

  - **火箭发射器逐发 burst（2026-09-19 #D4 用户反馈「同帧齐射改连续快速逐发」）**：`fireActiveSecondary` rocket 分支只发射第 1 发并登记 `t._rocketBurst={left, lastAngle}`；`updateRocketBurst`（tank_weapons.js，mvp 主循环玩家侧 / `updateSecondaryMount` AI 侧逐帧驱动）按 `burstInterval`（WEAPON_DEFAULTS.secondary.rocket.burstInterval=0.18s）逐发补完，队列清空后写入整组装填 `reload`（10s）。瞄准：存活目标方向优先，目标丢失保持上一发角度（committal）。视觉：逐发口焰 `muzzle`+粒子烟 `spawnSmoke`×3+音效（旧齐射仅一次）、弹体 `fxScale=1.3` 放大 + 拖尾增亮（drawShells 消费）。队列不跨节点：enterBattle 清 `player._rocketBurst`/`_missileLock`，重置按钮清全员。
  - **视野系统 v2（2026-09-19 #D2 接线，取代 2026-09-14 #89 v1）**：基础模型不变——`RULES.vision{radius:900, bias:0.35, inner:0.45}` 鼠标锚定偏移圆，敌对存活实体在圆外且不在贴身内圈 → 主画布隐藏（炮弹/小地图恒显）。#D2 增量：① 半径接卡牌被动 `commander_sight`（`visionRadiusEff`：读 `player.cardEffects`，value=百分比加成，缺省 25，多来源取最大）——潜望镜 rare +15% / 观瞄镜 epic +25% 生效（此前两张视野卡为死效果）；② 主画布绘制视野圈淡虚线描边（与剔除判定同口径，系统边界可读）。dev 面板「无视野」开关跳过剔除与圈绘制。
- **主动技能快捷键池 (1~3 数字键)**：
  - 快捷键 1/2/3 动态对应玩家当前装备的主动技能（掩体/炮击/护盾/超装填/超级火控/超级速度/主动防御，2026-09-17 #C4a 起运行时技能全部接入 DISPATCH；`aps` 于 2026-09-21 #G9 新增），按顺序快捷施放。**现行运行时能力键全集（7 个）以 `js/tank_abilities.js` 的 `ABILITY_KEYS_RUNTIME` 为唯一口径**（`artillery / overdrive / shield / super_fire_control / super_speed / deploy_cover / aps`）。**2026-09-23 A 档**：本段原列的 `recon`（侦察/无人机指令）为死效果键，已随 5 张对应卡整体摘除（归口 `docs/specs/cards.md` §3、`DEVELOPMENT.md` §4.35）——现行 DISPATCH 表与数字键映射**不含任何无激活路径的键**。
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
- **布雷器两次 F + 4s 雷场**（`RULES.abilities.deploy_limits.mineFieldCount/Radius/Delay` = 5/70/4s）：第一次 F 在鼠标位置显示**拟生成的雷场形状**（虚线圆 + 5 个雷点预览）；第二次 F 确认 → 落点定格 → 4s 后在预形态位置环形生成整片雷场（数量受 `mineMax` 约束，即 `min(mineMax, mineFieldCount)` = 3）。**同一时刻仅允许 1 个待生成雷场**（`pendingMineFields.length>0` 时按 F 拒绝新预约——防连续双击 F 无限预约布雷；#F5 2026-09-20）；生成前超限拒绝（#F6 2026-09-20）。F 的按键语义为**原生 keydown 边沿**（见 §8.2「开关类副武器 F 边沿口径」）。
- **装填与触发口径（#F5 2026-09-20）**：布雷受 `secondaryReloadT` 装填冷却门控（`fireActiveSecondary` 顶部统一拒绝，单发 15s；按住 F 连发时冷却期内拒绝布雷）；地雷**触发半径** = 单发/雷场 **45px**、`spawnMine` 默认 **40px**（`tank_deployables.js`，bench 手动布雷受益）——判定为敌对实体**中心点**距离 ≤ triggerRadius（坦克 hull 近百 px 级，半径过小会出现「视觉压雷却不爆炸」）；爆炸 AOE `blastRadius` 70，mvp 伤害走 `applySplashAt`（×0.5 衰减）、bench 走事件直算，触发阵营敌对实体生效（玩家自身也会被己方地雷波及）。

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
| 技能 SKILLS | `#hudSkills` | 专属键 `#btnG/H/V`（`.slabel` 中文技能名 + `.skey` 字母） + 技能池槽 `#skillSlot1~3`（技能名 + 数字键 + 冷却） |

- **速度读数**：`tankCurrentKmh(t) = |t.speed| ÷ (RULES.speed.pxFactor × effMul) × kmhFactor`（`tank_model.js`，已导出）。**必须先除 `pxFactor×effMul` 再乘 `kmhFactor`**——直接乘会得到 ~208km/h 的虚高读数（`tank.speed` 已含 ×1.3 有效乘子）。速度条以 `tankKmh(t)`（极速上限）为满值。
- **技能池槽位映射**：`#skillSlot1~3` 显示序列**与 `skillHotkey(n)` 完全一致**——`cardEffects` 中 `type:'ability'` 的 key 去重列表（**不过滤** artillery/shield/overdrive：数字键同样可触发它们，G/H 是并列的专属键）。名称取 `ABILITY_LABELS`，冷却取 `abilityCds[key]`；点击槽位等价于按对应数字键。
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

> ⚠️ **待改标记状态更新（2026-09-23 用户裁定）**：原「暂时锚定接战距离、后续再改」的预留口径（即 `R = max(屏幕相对式, 最大 engage × 1.15)`，原登记于 `docs/PLAN.md` §3.1 与 `specs/map.md` §14.4）**已被否决**——可见半径口径**保持不变**（仍为下方屏幕相对式，`R×zoom` 恒定）。「敌人开火时看不见」改走**视野卡 + 镜头外延做强**，做法、几何上限与已核实数值见下方 **§11.5**。

**用户裁定（#H5）**：「目前敌方渲染的距离写死成了像素，会受缩放影响，迫使玩家始终以最高倍率游玩，失去一些细节」——#H1 窄轴收口与 #H2 深度拉远都以「固定像素可见距离」为前提，与自由缩放根本冲突，二者废弃。

- **现行定义**（`tank_camera.visionRadiusForViewport`）：`R = screenRadiusRatio × min(vw,vh)/2 ÷ zoom × (1+视野卡加成)`，并以窄轴容量/(1+bias) 为几何护栏（极扁视口兜底）。`RULES.vision.screenRadiusRatio = 1.0`；`radius`（900）保留为镜头外延基准，不再决定可见距离。
- **核心性质：R×zoom 恒定**——敌人在屏幕上的出现位置与缩放无关，玩家自由缩放（放大看细节 / 拉远看全局）不再被 gameplay 绑架；默认 zoom=1（全细节）。
- **等距与公平性保持**：同一 zoom 下横向/纵向/斜向的可见边界一致（#H1 目标）；21:9/竖屏窄半幅相同 → 同一屏幕占比（#H4/#H2 的公平性目标）；极扁视口下护栏兜底仍等距。
- **卡牌加成**：commander_sight 按比例放大屏幕占比（×1.25 → R×1.25），受护栏截断（前向边界恒在屏幕容量内）。
- **移除项**：`visionFitZoom`（#H2 适配拉远）、`visionUserZoom`/`visionZoomTarget`（基准×适配模型）、进节点强制缩放；`minZoom` 0.45 → **0.8**（回 P-39 原值，深度拉远不再需要）；缩放回归 P-39 原语义（滚轮 zoom-to-cursor，范围 0.8~1.3）。
- 回归：`scripts/test-camera.js` #H5 段（R×zoom 恒定 / 屏幕相对等距 / 超宽竖屏同规则 / 卡牌护栏 / minZoom 回退）；smoke P-39 探针（默认 zoom=1 + 放大后 R×zoom 恒定）。

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

**用户裁定**：「目前敌方渲染的距离写死成了像素，会受缩放影响，迫使玩家始终以最高倍率游玩，失去一些细节」——本条即 §11.1 屏幕相对化的直接动机：#H1/#H2 系列以固定像素（900px 世界半径）定义可见距离，缩放直接改变敌人的屏幕出现位置，#H2 只能靠强制拉远补偿。现行口径 = §11.1（屏幕相对，R×zoom 恒定，缩放纯视觉偏好）。

### 11.5 前向可见距离的几何上限与「视野卡/镜头外延做强」路径（2026-09-23 裁定）

> **状态**：裁定已定（用户 2026-09-23：「接受现状，只把视野卡与镜头外延做强」），**参数与卡牌尚未改动**——上半为**已核实几何事实**（现行口径），下半为**已裁定待实施的方案**（实施前不得作为现状引用）。

- **现行公式**（`js/tank_camera.js:119-143`；参数 `js/tank_rules.js` §vision/§camera）：`R = min( screenRadiusRatio × 窄半幅/zoom × (1+视野卡加成), ((窄半幅 + radius×mouseLeadRatio)/zoom) / (1+bias) )`，视野圆心再朝鼠标方向偏移 `bias×R`。
- **前向可见距离 = `R×(1+bias)`，其硬上限 = 窄半幅 + 外延量**（与 `bias` 取值无关——圆心后移量恰好抵消偏移量）：1080p/zoom=1 实算 `窄半幅 540 + 外延 900×0.30 = 270` ⇒ 上限 **810px**，对应 `R ≤ 600`。无卡时 `R = 540`（前向 729px）。
- **由此得出的现行边界**：接战距离 `engageRange 520 × 难度比 ≤1.25 = 650px < 810px` ⇒ **开火时可见**；触发距离 `triggerDistBase 700（难度乘数上限 1.6 ⇒ 最高 1120px）> 810px` ⇒ **敌人「激活→可见」之间存在无信息窗口**——2026-09-23 用户裁定**接受该边界**，不改口径。
- **视野卡收益被 cap 截断（已核实）**：`cap = 810/1.35 = 600` 为几何护栏固定值，卡牌加成只放大 `screenRelative` ⇒ `support_commander_periscope`（`commander_sight` 15）与 `sniper_commander_sight`（25，`cards/sniper_commander_sight.json:8`）在 1080p 下**同为 `R = 600`**（卡面 +15%/+25%，实得同为 **+11.1%**）。⇒ **只抬卡面数值无效，必须同步放宽 cap**。
- **唯一有效手段 = 抬镜头外延量**（`RULES.camera.mouseLeadRatio`，现行 `0.30`）：`cap` 与前向硬上限同步上移。**待实施建议值** `0.30 → 0.40~0.45`（外延 270 → 360~405px，前向上限 810 → 900~945px，`R` 上限 600 → 666~700）：`0.45` 时 +25% 视野卡可足额生效（`R = 675`、前向 911px ≤ 945px）。
- **代价与配套（必须同批落地）**：外延加大 ⇒ 玩家在屏幕上更靠后 ⇒ 后向可见 = `min(窄半幅 − 外延, R×(1−bias))`，现行 **270px → 约 135px**。故须与 **B 档「增援只在前方」**（口径归口 `specs/map.md` §14.3 第 4 条 / `docs/PLAN.md` §3.6 第 6 条）同批实施，否则「背后被偷袭且看不见」会显著恶化。
- **回归锚点**：`scripts/test-camera.js`（#H5 段：`R×zoom` 恒定 / 屏幕相对等距 / 卡牌护栏 / `minZoom`）、`test-browser-smoke.cjs` P-39 探针（默认 zoom=1 + 放大后 `R×zoom` 恒定）——改 `mouseLeadRatio` 后 cap 值变化，两处基线需同步重锚。

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

