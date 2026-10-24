# 敌方 AI

> **摘要**：敌人什么时候被激活、怎么警觉、怎么接近玩家、又怎么分工包夹——AI 决策层的全部现行口径。
> **适用版本**：现行（2026-10-22）
> **源自**：`docs/specs/combat.md` §5、§8.3、§13.7、§13.8（2026-10-21 拆分）
> **相关**：[敌人强度与难度](./enemy-scaling.md) · [视野与镜头](./camera-vision.md) · [Boss 战斗](./boss-combat.md)

## 目录
- [激活与警觉](#激活与警觉)
- [反应延迟与接战传播](#反应延迟与接战传播)
- [接战机动随机化](#接战机动随机化)
- [交战结构重做](#交战结构重做)
- [tier 分层与辅助行为](#tier-分层与辅助行为)

## 激活与警觉

（原 §5，2026-08-24 定案）

> **AI 基础距离的唯一数值口径（本页，2026-10-21 按 `RULES.ai` 核对）**：`triggerDistBase` **700** / `engageRange` **520** / `keepRange` **320** / `allyEngageRange` **460**（px）。其余 AI 参数（`shotNoiseRadius` / `impactNoiseRadius` / `alertRadius` / `engagePropagateRadius` / `engageBand` / `maneuver` / `separation` / `retreatReload` 等）逐键现行值唯一来源是 `RULES.ai`（`js/tank_rules.js`），本页只写机制与裁定，不重复维护完整参数表。

- **与摄像机视野解耦**：激活判定与摄像机视野彻底解耦（废除 P-10 的「视野内主动 / 范围外被动」门控），改为**距离 + 可见性**触发。
- **有效触发距离**：= 上条表中的 `triggerDistBase` × 难度乘数（最高 ×1.6），经 `js/tank_map.js` 的 `triggerDistForDifficulty(diff)` 计算，节点生成时注入实体字段 `aiTriggerDist`；`aiDecideEnemy` 读实体字段，缺省回退 RULES 基准值。
- **「全图主动」语义（2026-10-17 #U28，现行口径）**：`aiTriggerDist` 设为远超 `triggerDistBase × triggerHysteresis`（如生存波次的 99999）只放行触发**门**，**不放大** `engage`（后者被滞回比钳顶 ≈650）——因此 `aiTriggerDist` 超钳顶值的实体：① 不进入 defensive 站桩（`dist > engage×3+500` 的消极防御只属于普通触发距离实体），移动交给交战带（`dist > band.max → baseMove=1`）；② 生成方必须同时置 `aiEngaged=true, aiReactT=0`（只设 `alertLevel=3` 不够——首帧仍走未接战分支并吃反应延迟）。消费方：`js/tank_ai.js` defensive 分支、`tank_battle.html spawnSurvivalWaveEnemies`。
- **滞回防抖**：脱离接战阈值 = 进入阈值 × 1.25（实体字段 `aiEngaged` 承载），消除边界抖动。
- **可见性分支**：
  - 距离达标且有视线（hasLineOfSight）→ 接战分支（flank / 开火等）；
  - 距离达标但无视线 → 提前进入 search 推进；
  - LoS 仅在距离达标时评估（patrol 早退路径零射线开销）。
- **生成点约束**：敌军与 Boss summons 的局内生成点必须位于该敌有效触发距离 × 1.05 之外（径向外推优先，越出敌区时确定性重掷，不消耗额外 rng——同 seed 结果稳定）。
- **受击警觉（任意来源，2026-09-14 定案）**：敌对实体被命中即惊醒——`applyDamage`（`tank_physics.js` 唯一伤害收口）统一触发 `alertEntity(t, srcX, srcY)`（置 `aiEngaged=true`、`alertLevel=3`、记录来弹方向 `lastKnownPlayerPos` + 威胁方向 `_threatDir`（炮塔优先指向），search 态朝该点推进，到达 ~140px 或重获视线后清除）并立即解除进行中的 stunned；来源坐标由调用方传入，缺省回退玩家当前位置（搜索玩家语义），再兜底自身位置。`propagateAlert(entities, x, y)` 将警觉传播至 `RULES.ai.alertRadius`（**600px**，本页唯一数值口径）内存活友邻。**覆盖任意伤害来源**：直射/溅射/炮击轰炸（strike）/DOT/地雷/碾压/溺毙——凡经 `applyDamage` 均触发（敌对存活非无人机；玩家/友军 no-op）。**Boss hold 受击破防**：`alertEntity` 对 `isBoss && stageAI.mode==='hold'` 实体清 `stageAI=null`（立即解除 hold 转常规接战）。注意：玩家对敌直射在 fireCtx 命中结算处另有前置警觉（与 applyDamage 钩子幂等重复，无害）。
- **五层级警觉（#S2，2026-10-15）**：`t.alertLevel` 0=calm / 1=suspicious / 2=alert / 3=engaged，替代二值 `aiEngaged` 的渐进状态。
  - **①玩家靠近**：距离+LoS（既有，不变）。
  - **②玩家射击**：`fireTank` 成功开火后经 fireCtx.`emitShotNoise` → `emitShotNoise(entities, x, y, radius, 'shot')`，半径内敌对 AI `hearNoise` 置 level 1（`RULES.ai.shotNoiseRadius` = **1100**，本页唯一数值口径；railgun/autocannon 按 ×1.27 派生 ≈1400）。
  - **③近失弹**：玩家/友军炮弹死亡未命中时，落点 `RULES.ai.impactNoiseRadius`（**420px**，本页唯一数值口径）内敌对 AI `hearNoise`（'impact'）。
  - **沿革注记（2026-10-17 #U4）**：原值 900 / 180。相对交战尺度（`engageRange`、`triggerDistBase`——数值唯一口径见本页首段）偏小，近失弹需几乎贴身才被听见，是「被攻击/开火在很近才反应」的主因。现行值由 `RULES.ai.*` 单一来源提供，`tank_battle.html` 与 `js/tank_fire.js` 不再内联硬编码半径。
  - **④友邻遇袭**：`propagateAlert`（半径 = `RULES.ai.alertRadius`，值见上方「受击警觉」条，本页不重复）。
  - **⑤自身被攻击**：`alertEntity` 置 level 3 + `_threatDir`（炮塔立即转向威胁）。
  - **suspicious 行为**：朝声音位置半速（0.5）调查，炮塔 ±0.5rad 扫视；8 秒（`suspiciousTimeout`）无新声音降级回 calm；接战中（level 3）不受声音干扰。

- **警戒状态的 UI 指示（2026-10-24，`?` / `!`）**：世界内 HUD 在敌方血条正上方画一枚状态徽标，让玩家看见「谁在找我」。
  - **两档语义**（用户裁定）：`?` = 怀疑/搜寻；`!` = 已发现并锁定。归并实现是纯函数 `alertIndicatorFor(t)`（`js/tank_battledraw.js`）：
    - `engaged`（`!`，红色实线）← `alertLevel >= 3`，或 `aiEngaged === true` 且 `aiState` ∈ {`react`, `skirmish`, `charge`, `hold`}；
    - `alert`（`?`，黄色虚线）← `aiState === 'search'`，或 `alertLevel >= 1`；
    - `null`（不显示）← `patrol` / `stunned` / 已死 / 非敌方 / **Boss**（Boss 有独立血条与阶段 UI，不叠加）。
  - **显示范围**（用户裁定）：**仅视口内**——复用 `drawTank` 前的 `aabbInView` 剔除（纯性能机制），视口外不泄露情报。
  - **字形用路径绘制、不依赖字体**：`fillRect`/`arc`/`stroke` 画出竖条与问号弧。原因有两条——① 离线回归垫片 `mini-canvas` 的 `fillText` 是**空实现**，用它会让像素断言永远测不到字形（实测「两档像素数完全相同」= 假绿）；② 真机字体缺失时字形可能不可见。
  - **回归**：`scripts/test-alert-indicator.js`（挂 `npm test`）覆盖归并三态 × 全部 `aiState`、负向不显示清单、真实光栅化（`?`/`!` 字形像素差异 >10、颜色红/黄可分）、`aabbInView` 剔除仍在。

- **噪声累积升级（2026-10-22 用户裁定）**：「敌方 ai『听到』多次射击、友军多次被命中等后就应当直接确定玩家位置进入交战状态」。
  - **射击噪声累积**：每次 `hearNoise` 累加 `t.noiseHeat`（`shot` +0.34 / `impact` +0.20，唯一口径 `RULES.ai.noiseEscalate`）⇒ **3 次射击或 5 次落弹**即达 `escalateAt 1.0` → 直接 `alertEntity(t, srcX, srcY)`（进入交战 + 记住玩家位置）并把热量归零。自然衰减 `decayPerSec 0.12`（约 8.3s 清空，与 `suspiciousTimeout` 同量级）。
  - **旧实现的两个缺陷（ISSUES #Z7，2026-10-22 修）**：① `hearNoise` 只把 `alertLevel` 置 1，**全文件没有任何升级到 3 的路径**；② 同位置 2s 内的重复声音被直接丢弃 ⇒ **连射越多反而越攒不满**。现改为仍更新 `lastNoisePos`、但热量照常累加。
  - **友军被命中**：`resolveHit` 包装对 `team==='ally'` 的目标调 `noteAllyHit(entities, sx, sy)`——半径 `RULES.ai.noiseEscalate.allyHitRadius`（700px）内所有敌人累加 `allyHitHeat 0.5`，**2 次**即 `alertEntity`。
- **Boss / 生存模式全敌强制接战（2026-10-22 用户裁定）**：「boss战模式、生存模式所有敌人强制进入交战模式，立即开始攻击玩家」。
  - 抽 `forceEngageAll(reason)`（`tank_battle.html`）：对全部 `team==='enemy' && !isBoss && hp>0` 设 `aiTriggerDist=99999 / aiEngaged=true / alertLevel=3 / aiReactT=RULES.ai.forceEngageOpenFireDelay`。
  - 调用时机：`GAME_MODE==='boss'||'survival'` 的 `enterBattle` 末尾一次；**每次增援 / Boss 召唤波 / 生存波次生成后**对新生实体调单实体版 `forceEngageOne`。
  - `forceEngageOpenFireDelay`（**0.35s**，唯一口径 `RULES.ai`）是「刷出来瞬间一发秒杀」的最小开火间隔；**不改变接战判定本身**。Boss 本体的 `openingSeconds 1.6` 开场展开窗口保留（那是展示动作，不是延迟攻击）。
- **stun 免疫窗**：stunned 自然苏醒后授予 `RULES.ai.stunImmunityAfter`(2.0s) 免疫期，期间不再进入 stunned——防高射速武器无限连控。（附带修复：battle 主循环此前遗漏 `aiUpdateStateTimer` 调用导致 stun 计时器永不递减、敌人永久呆滞，已补上。）

## 反应延迟与接战传播

（原 §8.3，2026-09-20 #E7/#E8）

- **反应延迟（#E7）**：首次进入接战后进入 `react` 态——只转炮塔、**不移动不开火**，时长 `RULES.ai.reactionSecondsBase~Max`（1.15~1.9s）按「距离/触发边界比」加权 × 档位 `tierProfiles[].reactionMul`（tier1 0.82 / tier2 0.65）× 随机抖动（±25%）。**仅对正式对局生成的敌军生效**（`tank_map.makeNode` 打标 `aiReactEnabled=true`；bench/单测裸实体保持即时响应）。受击惊醒（`alertEntity`）把剩余延迟 ×`reactionAlertMul`（0.5）——更快但不瞬发。
- **全高掩体遮视野（#E8）**：激活门控改为「距离达标 **且** 有视线」(`RULES.ai.engageRequiresLoS`)——建筑/岩石/树（`tier.vision===true`）挡住视线时敌人不再「进入范围立即行动」，保持 `patrol`；受击/友邻告警（携带 `lastKnownPlayerPos`）不受此门控限制，仍进入 `search` 推进。
- **engage 状态传播（#E8）**：某敌人**首次进入接战**时，把「已接战 + 已知玩家位置」传播给 `RULES.ai.engagePropagateRadius`（420px）内友邻（概率 `engagePropagateChance` 0.7），每跳半径 ×0.7、最多 2 跳（避免一处暴露唤醒全图）；被传播者各自按反应延迟行动。此前只有**受击**传播（`propagateAlert`），进入接战本身不传播。

## 接战机动随机化

（原 §13.7，2026-10-01 #M，现行口径）

**用户裁定**：「敌人接近玩家时，要有多种行为：直线/斜线/曲线行进或后退，行进时/短停后开火，其行进的角度、距离、短停的时间也随机，以增加随机性。」

- **问题定位（实测）**：改前敌人接近玩家只有单一轨迹——`aiDecideEnemy` 按单点 `engage`(520px) 决策 `dist>engage→move=1`，即**恒定直线冲脸**；偏航只来自 #83 peek（±0.5rad 叠加）与 #88 侧摆（装填期 ±0.78~1.57rad），二者都是**单帧叠加角**而非持续轨迹，开火时刻也由装填结束决定 ⇒ 整簇敌人以同节奏逼近，玩家读出「一坨直线压过来」。

- **现行口径（`RULES.ai.maneuver`，消费方 `js/tank_ai.js` `_maneuverRoll` / `_applyManeuver`）**：
  - **机动脚本**：敌人接战时懒分配一个脚本（挂 `t._mv`），一次性随机决定 **机动类型 + 偏角 + 行程 + 短停时长**；走完或超时即**重掷**，轨迹持续碎化。五种类型与权重：`direct` 直线 3 / `slant` 斜线 4 / `curve` 曲线 4 / `arc` 弧线绕行 3 / `retreat` 后撤 2。
  - **偏角随机**：斜线 `slantAngle[0.35,1.15]`、弧线 `arcAngle[0.8,2.0]`、曲线起始 `curveAngle[0.25,0.95]`；曲线另有 `sweep∈[0.5,1.9]`，**与起始偏角反号** ⇒ 偏角必然穿过 0，轨迹呈 **S 形回正**而非单向甩开。
  - **行程与重掷**：`reRollDist`(90px) / `reRollTimeMax`(4.5s) 任一达成即重掷；`retreat` 另有 `retreatDist[120,320]` 与独立时限 `retreatT[0.5,1.4]`。
  - **短停与开火节奏**：每段脚本结束按 `holdChance`(0.35) 进入短停，时长 `hold[0.4,1.8]`s；**短停期间 `move=0` 但炮塔照常锁敌、可开火** ⇒ 形成「行进时开火 / 短停后开火」两种节奏。短停结束**当帧**把开火容差放宽到 `resumeAimTolMul`(1.8) 倍（单帧峰值，随后即回到常规容差、同时重掷下一段脚本），与既有 `reactionJitter` 叠加 ⇒ 敌人不会整簇同时开火。
  - **装填期偏置（承接 #88）**：装填前段（`reloadT > stats.reload × reloadGapFrac(0.3)`）改用 `reloadGapWeights{direct:1, slant:4, curve:3, arc:4, retreat:1}`（压低直冲、抬高侧向）并把前进压为 `reloadGapCreep`(0.35) 微速蠕行。**普通敌人的装填期躲避机动由此统一承担，旧 #88 `sideSwing` 仅保留 Boss 路径**（沿革：#88 原对普通敌与 Boss 均生效，见 `DEVELOPMENT.md` §4.43）。
  - **不覆盖的语义（刻意保留）**：① 机动层只在「需要移动」时改写轨迹方向——**已被 [交战结构重做](#实现期修正的-4-处缺陷) 修订**：初版仅保护 `baseMove===0`（驻停），`baseMove<0`（退让）仍被机动层 `move=+1` 覆盖，致使敌军「退着退着又贴上来」，现收窄为**只接管 `baseMove>0`**（接近），驻停与退让一律确定性；② **Boss 与 SPG 定距车（`classProfiles.spg.keepRange`）不启用机动层**——二者的角色定位就是「始终推进」/「保持距离」，随机化会破坏角色辨识度；③ `flank`/`coverSeek`/`stunned` 等特殊态优先级高于机动层；④ 脱离接战即 `t._mv = null`，下次接战重新抽取（不留陈旧偏角）。
  - **回退开关**：`RULES.ai.maneuver.enabled = false` 完全退回改前的直冲语义（`keepMove` 透传原 `baseMove`）。
- **回归**：`scripts/test-ai.js` 新增 **#M 段 13 项**——5 种类型均可达、偏角落在各自配置区间、曲线 sweep 与起始偏角反号、禁用开关回退、短停进出与开火容差放宽、装填期蠕行与直冲占比下降、集成层输出含转向/短停/前进三类、脱离接战清空脚本、Boss 不启用。#88 段改为断言「装填期抽到非 direct 机动 + 前进压为蠕行」，Boss 路径断言不变。

## 交战结构重做

（原 §13.8，2026-10-02 #N，现行口径）

**用户反馈**：「敌人全部尝试贴近玩家、又在屏幕边缘被动受击，玩家像打靶」；并要求「再结合你建议的方案落地」。**用户裁定（2026-10-01，2 项）**：① 反打靶可见性**仅做玩家侧提示**（不给敌人加视口门控，保留 #J3「全屏可命中」口径与边缘推进的压迫感）；② 实施范围 = **全部落地**（交战带 / 攻守分工 / flank 重写 / 分离力 / 装填脱离，不含敌人侧可见性）。

- **问题定位（实测，均有 file:line 证据）**：
  1. **单点 engage 的夹逼结构**：`aiDecideEnemy` 只有 `dist>engage(520)→前进 / dist<close(200)→后退`，`closeRange=200` 与车体尺度同量级 ⇒ 退让常被物理互推抵消；且四类敌车共用同一组阈值。
  2. **一拥而上无分工**：每辆车独立决策，全部满足「dist>engage」即全体推进，无名额、无侧翼、无牵制层次。
  3. **旧 flank 事实上不生效**：窗口 `dist>engage && dist<flankMinDist×1.5×flankBias` 对 heavy 上限 400×1.5×0.6=**360 < engage≈478 恒不触发**、spg `flankBias=0` 被排除、medium 高难度下 engage 超过上限；目标点是「自身 + targetRight×300」**每帧重算的横向平移**（目标恒在自身右侧 300px ⇒ 原地绕圈），非绕后站位。
  4. **无群体分离**：`resolveTankCollisions`（`js/tank_entity.js`）只沿连线推开，靠内侧那辆被直接推向玩家，人堆贴脸。
  5. **视口外开火无提示**：#J3 视野退役后敌人一律可命中，但绘制层仍有 `aabbInView` 剔除（`tank_battle.html`），而 AI 开火只看「距离 + 直线视野」（`RULES.ai.engageRequiresLoS`）⇒ 视口外敌人开火且玩家看不到来源，即「屏幕边缘被动受击」的直接机制。
  6. **退避仅限重甲残血**：`coverSeek` 原条件为「aiTier≥1 或正面装甲≥100mm」且 `hp<60%`（`js/tank_ai.js`），轻中坦在装填期只能在开阔地对射。

- **现行口径（消费方 `js/tank_ai.js` + 新模块 `js/tank_ai_squad.js`）**：
  - **#N1 交战距离带**（`RULES.ai.engageBand`）：判据由单点改为按类别的 `[minRatio, maxRatio] × engage` 区间——`dist>max` 接近 / `dist<min` 脱离 / 区间内驻停开火。四类：light 0.52~1.28 / medium 0.42~1.10 / heavy 0.30~0.94 / spg 0.66~1.34；下界另有车体尺度兜底（`max(60, hullLen×2.2)`）。**heavy 的 `moveLock` 角色特性保留**（`dist<min` 时 `baseMove=0` 不后撤）；`engageBand.enabled=false` 回退旧 `closeRange`/`engageRange` 单点语义。
  - **#N2 攻守分工**（`RULES.ai.squad` + `js/tank_ai_squad.js updateSquad`）：节点级协调器每 `reassignInterval`(0.6s) 按评分（距离/LoS/血量）+ **角色粘性** 分配 `press`（压上，名额 = `pressSlotsBase(2) + floor(diff×1.5)` 钳 ≤4）、`flank`（侧翼）、`hold`（驻守）三种角色；存活数 ≤ 名额时全员 press。`hold` 走 `holdGate`（> `holdFireMaxDist` 640px 纯待机，近距容差放宽 ×2）。协调器**只写 `t.aiRole`**，位移仍由交战带/机动层执行；`enterBattle` 时 `resetSquad()` 防跨节点串用。
  - **#N3 flank 重写**（`RULES.ai.flankRewrite`）：站位点 = **玩家为圆心、半径 `_flankRadius(band) = band.max × radiusRatio(1.15)`、方位角 = 进入时方位 ± 扇区角 [1.05, 2.10] rad** 的世界坐标点，**进入 flank 时锁定一次**（`t._flankTarget`），驶入 `arriveDist`(70px) 即转 press；角色变更时清除锁定。半径以**交战带外沿**为基准（见下方缺陷 ③）。旧 flank 分支降级为回退路径（`flankRewrite.enabled=false` 启用）。
  - **#N4 群体分离力**（`RULES.ai.separation`）：同类斥力半径 `radius`(180px)，玩家方向斥力半径 = `radius × playerRadiusMul`(0.6 ⇒ 108px)，两者均按距离**线性衰减**；力度权重 `playerFactor`(0.7) 单独作用于玩家方向。合成斥力换算为相对「朝玩家」方向的 ±1 转向偏置。**仅对 `press` 且 `move≠0` 生效**（见缺陷 ④）。
  - **#N5 视口外来袭方向提示**（`threatIndicators(player, enemies, viewBounds, opts)`，`js/tank_ai_squad.js`）：筛选「已接战 + 视口外 + 距离 ≤ `engageRange×1.4`」的敌人，按距离取前 6 条输出方位角；battle `drawThreatIndicators()` 沿用边缘矩形求交绘制**琥珀色箭头**（与无人机红箭头区分），alpha 随距离衰减。**玩家侧信息层，不改变任何 AI 判定与命中判定**（#J3 口径不变）。
  - **#N6 装填脱离**（`RULES.ai.retreatReload`）：装填期且距离 ∈ [300, 760]px 时退到半径 620px 内最近挡弹掩体的背弹面（掩心 − 朝玩家单位向量×(半深+45px)），到位后原地还击。与 #76 C6 `coverSeek`（重甲残血）并列，构成**两条独立退避通道**。
  - **回退开关**：`engageBand.enabled` / `squad.enabled` / `flankRewrite.enabled` / `separation.enabled` / `retreatReload.enabled` 独立可关；全部关闭即完全退回 #M 及更早的单点直冲行为。

### 实现期修正的 4 处缺陷

（均由 `scripts/diagnose-ai-crowd.js` 探针暴露，非推测）

1. **退让被机动层覆盖**：#M 初版仅在 `baseMove===0` 时保护，`baseMove=-1` 的退让被机动层 `move=+1` 覆盖 ⇒ 退着退着又贴上。→ 机动层收窄为**只接管 `baseMove>0`**（接近）。
2. **旧 repos 在驻停帧复活**：`legacyMicroOn` 初版用 `!maneuverOn`（依赖逐帧变化的 baseMove/role）守卫 ⇒ 驻停/脱离帧 `!maneuverOn` 为真，`repos`（#83）重新接管 `move` 随机 ±1 冲向玩家。→ 改为**静态判据**：只有 Boss / SPG 定距车 / 整体关闭机动层 才走旧 `sideSwing`+`peek`+`repos`。
3. **flank 站位形成「棘轮内移」**：站位半径 0.95×engage 落在交战带**内侧**，且站位点初版按「当前方位角」每帧重算（目标绕玩家转 ⇒ 螺旋内收）；叠加角色 0.6s 重排 ⇒ 「当 flank 内移、转 press 驻停」逐次逼近（实测 700→395→**273px**=带内沿）。→ 站位点**进入时锁定一次** + 半径改以 `band.max × 1.15` 为基准（恒在带外）+ `roleStickiness`(0.2) 抑制横跳。
4. **分离力干扰 flank 定点到达**：斥力改写 `turn` 使敌人无法进入 `arriveDist` 判定圈，持续前进螺旋贴脸。→ 分离力**仅作用于 `press`**。

### 量化验证

（`node scripts/diagnose-ai-crowd.js`，决策层探针：6 辆环形 700px 起始、30 秒、固定随机种子可复现；同初始态势对照「改前 4 开关全关」与「改后现行」两组）

| 指标 | 改前 | 改后 | 变化 |
|---|---|---|---|
| 同时压上（press）车辆数 | 6.00 | **2.00** | −67% |
| 近身圈内（≤engage×0.9）敌人数 | 0.71 | **0.00** | −100% |
| 最近敌人距离 | 447px | **522px** | +17% |

⇒ 既消除「全员贴脸」，也消除「一拥而上」。**`fanout`（方位集中度）3.33 → 1.87 属预期改善**：改前六辆均匀包围玩家（全方位压迫），改后只有 2 辆压上、3 辆驻守开火、1 辆侧翼绕行 ⇒ 玩家不再同时面对所有方向。

- **回归**：`scripts/test-ai.js` 新增 **#N 段 26 项**（2026-10-04 实测 `ok()` 计数；交战带分档/下界兜底/开关回退/带内驻停/带外接近/重坦不后撤/站位半径与扇区/站位稳定/左右分侧/集成绕行/分离力有无邻居/装填脱离背弹面与四类 null 路径/站位半径 ≥ 带外沿防复发）；`scripts/test-squad.js` **新增 25 项**（2026-10-04 实测；名额难度与上限、角色互斥覆盖、评分优先、节流稳定、换血重分配、开关回退、hold 门控、威胁提示筛选/排序/边界）。`scripts/test-ai.js` 旧 flank 断言改为「回退路径」语义（`flankRewrite.enabled=false` 下验证），`test-squad.js` 已接入 `npm test` 链。
- **验证（三链，2026-10-02）**：`npm run check` **EXIT=0**（含 `tsc --noEmit`）/ `npm test` **EXIT=0**（全链 0 项失败）/ `npm run test:browser` **四链 ALL PASS、EXIT=0**。

## tier 分层与辅助行为

（原 §5 尾部）

- **难度全面分化（2026-08-24 落地）**：`RULES.difficulty.entityMults` 十键乘子表，按 diffNorm 线性插值，经 materializeNode→env.applyDifficulty 仅作用于敌军 stats（玩家隔离）；`entityMultsForDifficulty(diff)` 纯函数可测。**逐键现行区间见 [敌人强度与难度](./enemy-scaling.md)（唯一数值口径）**，本页不重复罗列。
- **AI tier 分层**：`RULES.ai.tierProfiles` 三档（0 标准 / 1 engageMul1.1+aimTolMul0.8 / 2 再加 stunResist），实体 `aiTier` 注入后由 `aiTierProfile(tier)` 消费；engage 以触发距离比值为难度代理调制。
- **行为补齐**：patrol 早退分支输出 wander 微摆动（`patrolWanderSigma/Speed` 消费，ctx.time 或本地相位驱动）；新增 `coverSeek` 态——重甲（aiTier≥1 或车体正面≥100mm）且 hp<60% 时撤至半径 500px 内最近**全高挡弹掩体**背弹面（掩心 − 朝玩家单位向量×(半深+40px)），到位 ≤90px 原地还击；`flankDist` 收口 RULES.ai。**沿革**：本条早期写「full/half 掩体」——`half` tier 已于 2026-09-20 #E3 整体删除（现只有 `tierGroup:'structure' && vision` 的全高掩体挡弹），故改为全高。
- **AI 微行为（原 §5.1，仍有效）**：`aiDecideEnemy` 在接战非特殊态注入随机微行为——peek 车体摆角（`RULES.ai.peekAngleMax` / `peekInterval`）与换位（`RULES.ai.reposInterval`），炮塔锁敌与开火条件不变。**注**：这两项现仅对 **Boss / SPG 定距车 / 整体关闭机动层** 生效，见 [接战机动随机化](#接战机动随机化)。

## 相关页面
- [敌人强度与难度](./enemy-scaling.md) — `entityMults` 与固定基准
- [视野与镜头](./camera-vision.md) — `aabbInView` 与视野系统退役
- [Boss 战斗](./boss-combat.md) — Boss 专用 AI 覆盖与走位
- [地图规范](../map.md) — 掩体 `vision` 与 LoS
