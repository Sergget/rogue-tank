# 装甲、跳弹与模块伤害

> **摘要**：等效厚度怎么算、什么时候跳弹、打穿后伤害落在哪个模块，以及 innate 三键与散布下限。
> **适用版本**：现行（2026-10-21）
> **源自**：`docs/specs/combat.md` §2（2026-10-21 拆分）
> **相关**：[弹种系统](./ammo-system.md) · [核心立意与物理契约](./core-concepts.md) · [技能与副武器](./abilities-secondary.md)

## 目录
- [跳弹判定](#跳弹判定)
- [等效厚度](#等效厚度)
- [被动卡对装甲判定的修正](#被动卡对装甲判定的修正)
- [模块与成员伤害](#模块与成员伤害)
- [innate 三键](#innate-三键)
- [散布与精度](#散布与精度)
- [局内商店达限判定](#局内商店达限判定)

## 跳弹判定

（原 §2）

- **跳弹判定**：各弹种独立跳弹角（per-ammo `ammoBounceAngle`；θ>该值跳弹，90°=不可能跳弹，noBounce 弹种完全不跳弹），**逐弹种角度数值见 [弹种系统 · 数值总表](./ammo-system.md#数值总表)（唯一口径），本节不重复罗列**；跳弹沿法线方向真物理反射。（早期全局 `RULES.ballistics.bounceAngle`=70° 仅为 AP 基准沿革，已废除。）
- **二次跳弹禁止**：跳弹后的炮弹标记 canBounce = false，再次命中不再发生二次反射。

## 等效厚度

（原 §2）

等效厚度 = 实际装甲厚度 / cos(入射角)。

## 被动卡对装甲判定的修正

（原 §2，2026-10-16 #U19 实现，现行口径）

- **`angle_boost`（摆角特训）**：`passiveValues` 求和后**加算到跳弹角** `bAngle = min(π/2, bAngle + Σ×π/180)`，即卡面「+5°」直接抬高跳弹门限（上限 90°＝不可能跳弹）。实测跳弹边界由 70° 抬至 75°，与卡面一致。
- **`reactive_armor`（应急护盾，2026-10-19 #W-G 用户裁定改版）**：**不再是命中驱动的拦截**。现行机制为「**HP 比例低于 10% 时自动生成 1 个持续 10s 的护盾**（吸收 150 点），冷却 90s、卡牌升级可缩到最少 60s」。因此 `resolveHit` 中**已不存在该被动的任何分支**（旧的一次性拦截 + #U40 的再充能拦截均已移除）。现行消费点：① 触发判定与生成在 `tank_battle.html` 主循环（逐帧读 `player.hp/maxHp` → `applyShield`）；② 护盾吸收走 `js/tank_shield.js` 的 `hasShield`/`absorbDamage`（与战术护盾同一套）；③ 冷却时长与递减见 `js/tank_cards.js` 的 `emergencyShieldCooldown`/`updateEmergencyShieldRearm`；④ 参数唯一口径 `RULES.cards.emergencyShield`。

- **防崩落内衬 passive `spall_liner`（2026-08-26，原 ISSUES #A15 修复定案）**：`tank_physics.js` 经 `passiveValues(target,'spall_liner')` 取多来源最小值 `spallMul`，在 `applyModuleDamage` 乘入最终模块/乘员伤害；多张卡取最强（最小乘子）语义。活浏览器实测 `giveCard('support_spall_liner')` 后敌方 PEN 伤害均值降至无内衬 0.7981 倍（预期 0.8），epic 卡 `spall_liner.json` 当前 value 0.85。

## 模块与成员伤害

（原 §2，2026-08-26 P-49 定案：几何概率分区判定，废除自定义挂载）

- 模块七类：driver / ammo / engine / gunner / loader / commander / **breech 炮闩**。命中不再依赖挂载数据，改为**几何分区 + 区内互斥概率抽取**，只判击穿点所在区间。
- **炮塔四象限**（以炮塔几何中心为原点、随炮塔旋转）：左前{炮手 50% / 炮闩 5%}；右前{车长 30% / 装填手 30% / 炮闩 5%}；左后、右后{弹药架各 50%}。
- **车体纵轴区段**：以座圈圆心 p 与车体几何中心 c 判定前置/后置构型——前置构型 [0,.1){驾驶员 10% / 弹药 10%} / [.1,.5){弹药 50%} / [.5,1]{发动机 40%}；后置构型 [0,.5){发动机 40%} / [.5,.6){驾驶员 5% / 弹药 50%} / [.6,1]{弹药 40%}（区间均为纵轴归一化坐标）。
- **区内互斥抽取**：同一区间内按上述概率抽取一个模块命中；抽取落空/无对应模块的余量 = 正常结算伤害、无加成。
- **breech 炮闩效果**：命中 → 8s 完全无法开火（修理箱可清除）。
- 弹药架命中伤害按弹种 `ammoRackMult`（逐弹种倍率见 [弹种系统 · 数值总表](./ammo-system.md#数值总表)）；致死命中触发掀飞炮塔（"飞头"殉爆 spawnAmmoBlowFx）；未致死施加 8s 装填 debuff。
- 发动机命中引发起火 DOT（dps = 攻击方标准伤害 × `RULES.fire.dotRatio`，持续 `RULES.fire.dotSeconds`=5s，速度惩罚 speedMul 0.5），并施加机动 debuff。
- 履带命中 → trackBroken + immobT=8s 锁定。
- 车长命中 → 全体乘员效果 ×0.85。
- **成员/模块受损状态条（2026-08-28，原 ISSUES #A5 修复定案）**：`tank_battle.html` 顶部中央新增 `#moduleStatus` 状态条（`updateModuleStatus()` 每帧刷新，挂入 `updateHud()`）——读 `player.debuffs`（gunner/loader/driver/commander/engine/ammo/breech 各键，经 `MODULE_LABELS` 译中文标签 + 剩余秒数药丸）与 `player.trackBroken`/`immobT`（履带断裂），无受伤时整体隐藏。纯视觉 HUD，无共享模块/测试链改动；`npm run check` + `test:browser` 全绿（battle 无 console/page 错误）。

### `resolveHit` 的可选增益 opts

（原 §2，P-51）

`resolveHit(s,target,hit,allowBounce,opts)` 新增可选 opts `{penAdd,dmgMul,ignoreBounce}`——penAdd 在穿透判定前加算；ignoreBounce 跳过跳弹与过陡 BLOCK；dmgMul 最终伤害乘算并传入 applyModuleDamage；不传 opts 行为不变。battle 包装层对敌方 Boss 弱点命中（isWeakspotHit + moduleFromHit 匹配 RULES.boss.weakspot）注入 dmgMul:1.5 / penAdd:15 / ignoreBounce:true。

## innate 三键

（原 §2，修理箱 / 医疗包 / 灭火器）

- **修理箱/医疗包回血与随时可用（2026-09-08，优化落地）**：
  - **移除损伤门控**：删除了 `_tryActivateInnate` 中针对受损/受伤状态的前置判定门控。修理箱与医疗包现在在任何状态下均可激活。
  - **增加回血效果**：成功使用修理箱或医疗包时，立即恢复坦克 10% 的最大耐久值（`t.hp = Math.min(maxHp, t.hp + maxHp * 0.10)`）。
  - 修理/移除 debuff 的核心语义保持不变。
- **innate 冷却的注入与回写（2026-10-17 #U29，现行口径）**：修理箱/医疗包有效冷却的唯一消费值是 `player.abilityBaseCd[key]`（`js/tank_abilities.js innateBaseCd`），其值 = `45 − 永久级数 − 局内 cdReduce`（下限 15，`tank_battle.html effectiveKitCd`）。**任何改变账本的路径都必须回写 `abilityBaseCd`**——出击时 `prepPlayerForRun` 注入，局内商店 `cdReduce` 购买时经 `_syncKitCd()` 重算。只改 `runKitCdBonus` 账本不回写 = 升级无效（#U29 原缺陷）。
- **自动灭火器（innate，2026-09-17 #C6 修复定案）**：前置判定**改读真实起火状态 `dotT > 0`**（发动机起火链路写入 dotT/dotDps/dotSeconds/fireT/debuffs.engine，见 resolveHit engine 分支；旧判定读 `fireDebuffT`，但该字段生产代码无任何写入路径——灭火器恒 'no-fire' 死功能）。激活成功：清 dotT/dotDps/dotSeconds/**fireT** 与 **debuffs.engine**（用户裁定连带清除；发动机模块损伤本体仍属修理箱范围）。冷却走独立池 `abilityCds.extinguish`（基础 45s，商店 cdReduce 注入 `abilityBaseCd`）；手动 6 键保留 + **battle 主循环起火期间自动触发**（每帧尝试、冷却中静默拒绝不刷日志）。字段 `fireDebuffT` 维持现状（仍为死字段，AI stun 分支/起火散布加成未复活——后续清理）。

## 散布与精度

（原 §2，2026-08-26 原 ISSUES #A1/#A2 修复定案）

- **散布下限防负值**：`RULES.spread.multFloor=0.2` 对 spreadMult 加法聚合结果钳下限 + `sigmaFloor` σ 地板；局内商店姿态稳定恢复 maxLevel 判定（applyRunShopPurchase），满级购买按钮禁用置灰。
- **运动散布与精度基准解耦**：新增独立 stat `motionSpreadMul`（运动三源专用系数）——computeStats 默认继承出厂 `base.spreadMult`（保留设计器对底盘运动散布的标定）并钳 ≥ `spread.multFloor`；motionSigma 消费 `stats.motionSpreadMul ?? stats.spreadMult`（旧运行时快照无该键时回退，向后兼容）。运行期 spreadMult 修饰器（精密火控/卡牌）不再影响运动散布；局内商店姿态稳定改挂 `motionSpreadMul` mult ×0.85（maxLevel 1）。
- **双管炮口横向偏移（2026-10-17 #U25，现行口径）**：`fireDoubleBarrel` 与绘制层（`tank_battledraw.js`）**必须同源**——`barrelWid(px) = max(3, turWid × barrel.width% × 0.5)`，管中心偏移 = `barrelWid × barrelOffset(1.85) × 0.5`。`barrel.width` 是**百分比**字段（典型 18），禁止直接当像素用（旧缺陷：偏移放大 6 倍，弹道出发点明显偏离炮管）。

## 局内商店达限判定

（原 §2，2026-08-28 定案，取代写死 maxLevel）

有自然数值边界的商品改为按 `RULES.parameterLimits` 动态判定达限，而非出生时写死整数上限（局内卡牌经 addModifier 也会改 reload/spreadMult/motionSpreadMul/装甲值，会改变真实可升级空间）。`runShopLimitBlocked(def, curVal, stats)` 三分支：① `def.limit` 存在（fast_reload / engine_overdrive / precision_gunnery / steady_mount）走显式单键判定；② `def.limit` 缺失但多条 effects（多面打包装甲包 hull/turret × front/side/rear）逐面按点分路径 `parameterLimits.armor.*` 推导达限，**读 `stats` 对象各面真实现值**（非 UI 传入的单一 curVal），任一穿越边界即 true；③ 无边界/缺省容错返回 false（放行）。

`motionSpreadMul` 边界已纳入 `parameterLimits`（与 `spreadMult` 同区间，逐键数值见 [弹种系统 · 卡牌通道运行时硬限](./ammo-system.md#弹种升级链)）；商品 `maxLevel` 统一 99 作防御性兜底，`computeStats` 的 `multFloor` 物理钳底不动。测试：`test-economy` 装甲包逐面达限 / `precision_gunnery` 数值驱动 / `steady_mount` 边界对齐（164 条全绿）。

- **达限/满级按钮文案（2026-10-17 #U17/#U10，现行口径）**：局内商店按钮文字三级优先——① 属性达限 → `def.limitLabel`（如精密火控「已达静止三扩下限」、姿态稳定「已达运动三扩下限」）；② `lv >= maxLevel` → 「已满级」（**无 `stat`/`effects` 的等级制升级**，如 `repair_kit_cd`/`medkit_cd`，此前只禁用按钮、文字仍是价格）；③ 其余 → 价格。**通道语义**：`precision_gunnery` 降 `spreadMult`（静止/瞄准散布）、`steady_mount` 降 `motionSpreadMul`（行进/转向扩圈），两者正交互不叠加，desc 与达限文案均点明所属通道。

## 相关页面
- [弹种系统](./ammo-system.md) — 跳弹角、弹药架倍率、溅射半径的唯一数值表
- [核心立意与物理契约](./core-concepts.md) — 弹道推进与掩体拦截
- [武器与装填](./weapons-reload.md) — 双联炮口偏移、装填时长
- [卡牌规范](../cards.md) — 被动卡数值与稀有度
