# 战术坦克 Roguelike — 战斗与物理系统规范 (Combat & Physics Spec)

> 权威子文档：由主文档 docs/DEVELOPMENT.md 索引。
> 涉及模块：js/tank_rules.js, js/tank_physics.js, js/tank_fire.js, js/tank_geometry.js, js/tank_audio.js, js/tank_fx.js, js/tank_shield.js, js/tank_strike.js, js/tank_drone.js

---

## 1. 战斗立意与物理核心
- **慢节奏、强博弈、拟真物理**：摆角度找跳弹角、找掩体、抢位置，拒绝魔幻特效和高频输出。
- **实时弹道与发射解算**：炮弹按真实物理速度逐帧推进（js/tank_fire.js 的 stepShells），碰撞在命中瞬间判决，支持提前量与动态掩体拦截。

## 2. 装甲与跳弹机制 (Armor & Ricochet)
- **跳弹判定**：入射角 > 70° 时发生跳弹（RULES.ballistics.bounceAngle），沿法线方向真物理反射。
- **二次跳弹禁止**：跳弹后的炮弹标记 canBounce = false，再次命中不再发生二次反射。
- **等效厚度计算**：等效厚度 = 实际装甲厚度 / cos(入射角)。
- **resolveHit 可选增益 opts（P-51）**：`resolveHit(s,target,hit,allowBounce,opts)` 新增可选 opts `{penAdd,dmgMul,ignoreBounce}`——penAdd 在穿透判定前加算；ignoreBounce 跳过跳弹与过陡 BLOCK；dmgMul 最终伤害乘算并传入 applyModuleDamage；不传 opts 行为不变。mvp 包装层对敌方 Boss 弱点命中（isWeakspotHit + moduleFromHit 匹配 RULES.boss.weakspot）注入 dmgMul:1.5 / penAdd:15 / ignoreBounce:true。
- **弹药架与模块**（2026-08-26 P-49 定案：几何概率分区判定，废除自定义挂载）：
  - 模块七类：driver / ammo / engine / gunner / loader / commander / **breech 炮闩**。命中不再依赖挂载数据，改为**几何分区 + 区内互斥概率抽取**，只判击穿点所在区间。
  - **炮塔四象限**（以炮塔几何中心为原点、随炮塔旋转）：左前{炮手 50% / 炮闩 5%}；右前{车长 30% / 装填手 30% / 炮闩 5%}；左后、右后{弹药架各 50%}。
  - **车体纵轴区段**：以座圈圆心 p 与车体几何中心 c 判定前置/后置构型——前置构型 [0,.1){驾驶员 10% / 弹药 10%} / [.1,.5){弹药 50%} / [.5,1]{发动机 40%}；后置构型 [0,.5){发动机 40%} / [.5,.6){驾驶员 5% / 弹药 50%} / [.6,1]{弹药 40%}（区间均为纵轴归一化坐标）。
  - **区内互斥抽取**：同一区间内按上述概率抽取一个模块命中；抽取落空/无对应模块的余量 = 正常结算伤害、无加成。
  - **breech 炮闩效果**：命中 → 8s 完全无法开火（修理箱可清除）。
  - 弹药架命中造成 2× 伤害；致死命中触发掀飞炮塔（"飞头"殉爆 spawnAmmoBlowFx）；未致死施加 8s 装填 debuff。
  - 发动机命中引发起火 DOT（dps=3.4，5s），并施加机动 debuff。
  - 履带命中 → trackBroken + immobT=8s 锁定。
  - 车长命中 → 全体乘员效果 ×0.85。
  - **修理箱/医疗包可用性**（2026-08-26，原 ISSUES #A4 修复定案）：tryRepairKit/tryMedkit 已删除 immobT>0 的反向早退——履带断/重伤时不再静默拒绝，拦截统一移交共享层 tryActivateAbility 的 reason 提示。
- **散布下限防负值（2026-08-26，原 ISSUES #A2 修复定案）**：`RULES.spread.multFloor=0.2` 对 spreadMult 加法聚合结果钳下限 + `sigmaFloor` σ 地板；局内商店姿态稳定恢复 maxLevel 判定（applyRunShopPurchase），满级购买按钮禁用置灰。

## 3. 弹种系统 (Ammo Types)
唯一数据源：RULES.ammoTypes（js/tank_rules.js，机制参数唯一配置源）
- **AP**：标准穿甲弹（基准 pen 1.0× / dmg 1.0× / speed 1.0×）。
- **APCR**：高速穿甲弹（pen 1.2× / dmg 0.8× / speed 1.2×）。
- **HEAT**：破甲弹（pen 1.4× / dmg 1.0× / speed 0.8× / spread 1.2×，noBounce 确定性不跳弹）。
- **HE**：高爆弹（pen 0.7× / dmg 1.0× / speed 0.95×，noBounce，splashRadius=90px）。
  - HE 击穿与未击穿均触发范围溅射（贴脸50%→边缘衰减到0）；未击穿走残余爆轰分支（地板 25%）。
  - HE 破障（A3）：HE 销毁时对落点半径 24px 内可破坏掩体造成 1 点独立破坏伤（与 90px 坦克溅射两套并存）。
  - 特效对齐约定：爆轰视觉特效半径与逻辑 splashRadius 严格一致，杜绝视觉误导。

## 4. 战术能力与主动装备 (Abilities & Drones)
统一入口 tryActivateAbility（G 炮击 / H 护盾 / V 超装填，共享冷却 abilityCdT）
- **烟幕弹 (F键)**：生成区域动态视线掩体（smokeClouds），只阻断 AI 索敌视线（hasLineOfSight=false），不阻挡实弹弹道。
- **战术炮击 (G键)**：呼叫延迟 AOE 覆盖（callStrike / updateStrikes，maxStrikes=3）。
- **战术护盾 (H键 定向 / Shift+H 全向)**：累计吸收伤害池（applyShield，入射角弧度判定吸收）。
- **超装填 (V键)**：reload ×0.45 爆发装填 + 立即清零 reloadT，timed modifier 到期自动恢复。
- **无人机体系**：
  - scout 侦察型：标记视口外敌军位置指示（scoutRange=700px）。
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
- **受击警觉（同日补充定案）**：敌对实体被命中即惊醒——`alertEntity(t, srcX, srcY)` 置 `aiEngaged=true`、记录来弹方向 `lastKnownPlayerPos`（search 态朝该点推进，到达 ~140px 或重获视线后清除）并立即解除进行中的 stunned；`propagateAlert(entities, x, y)` 将警觉传播至 `RULES.ai.alertRadius`(600px) 内存活友邻。钩子位于炮弹命中结算与无人机直伤两处（仅敌方生效）。
- **stun 免疫窗**：stunned 自然苏醒后授予 `RULES.ai.stunImmunityAfter`(2.0s) 免疫期，期间不再进入 stunned——防高射速武器无限连控。（附带修复：mvp 主循环此前遗漏 `aiUpdateStateTimer` 调用导致 stun 计时器永不递减、敌人永久呆滞，已补上。）
- **难度全面分化（2026-08-24 落地）**：`RULES.difficulty.entityMults` 十键乘子表（maxHp/penetration/damage/armorAll/reload/spreadMult/aimSpeed/maxSpeed/turnRate/turretTurnRate），按 diffNorm 线性插值，经 materializeNode→env.applyDifficulty 仅作用于敌军 stats（玩家隔离）；`entityMultsForDifficulty(diff)` 纯函数可测。
- **AI tier 分层**：`RULES.ai.tierProfiles` 三档（0 标准 / 1 engageMul1.1+aimTolMul0.8 / 2 再加 stunResist），实体 `aiTier` 注入后由 `aiTierProfile(tier)` 消费；engage 以触发距离比值为难度代理调制。
- **行为补齐**：patrol 早退分支输出 wander 微摆动（`patrolWanderSigma/Speed` 消费，ctx.time 或本地相位驱动）；新增 `coverSeek` 态——重甲（aiTier≥1 或车体正面≥100mm）且 hp<60% 时撤至半径 500px 内最近 full/half 掩体背弹面（掩心 − 朝玩家单位向量×(半深+40px)），到位 ≤90px 原地还击；`flankDist` 收口 RULES.ai。

### 5.1 战斗机制更新（本轮落地）
- 移动与生存：RULES.speed.effMul=1.3 在 driveTank 与碰撞限速两处消费，实际移速×1.3，但面板显示 stats.maxSpeed 不变；玩家经 applyDamage(target,amount) 统一扣血并乘 dmgTakenMul（玩家=0.85，更肉），面板 HP/装甲数值不变。
- 炮弹与掩体：修复半高掩体曝光 bug——shell 在 exposure<1 时于掩体处被拦截，不再必然命中后方敌人；mud/water 为 mode:'pass' 飞越（不触发命中）。graduated 掩体入口缓存判决（s.dec）后，结算分支带剩余距离门控——未飞抵 dec.t 前继续正常飞行积分，飞抵当帧才结算；实体直接命中优先（2026-08-26，原 ISSUES #A8 修复定案）。
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
