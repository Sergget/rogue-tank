# Rogue Tank — 近期开发计划 (PLAN.md)

本文档是**临时规划**文档，用于细化新特性/重构的执行路径。条目在实现并验证通过后按 4 步生命周期删除并归档（正文写入 `docs/archive/<yyyy-mm>.md` 当月卷，索引行更新进 `docs/ARCHIVE.md`）。

---

（其余无进行中条目。远期项 P-21/P-23/P-24/P-25/P-26 见 docs/archive 快照 §6。）

> 编号说明（2026-08-24）：原 P-27/P-29/P-30 与 DEVELOPMENT.md §5 记录的历史已完成条目撞号，起重编号。玩法线 P-34~P-41 已全部完成并归档。
>
> 编号说明（2026-08-26）：现阶段着力玩法核心，视觉专项（旧 P-42~P-45）与音频专项（旧 P-46~P-49）整体移出本文件，移交 `.opencode/agents/asset-artist.md` 与 `.opencode/agents/sound-designer.md` 的「暂缓储备规范」章节维护（含全部规格表与验收标准），恢复执行时从该处取回并重新编号。新核心专项占用 P-42~P-44，候选库 P-50 前移为 P-45。

---

## 玩法核心专项 PLAN (P-42 ~ P-44)（2026-08-26 新增，当前着力点）

### P-42. 卡牌平衡审计与调优 (Card Balance Audit & Tuning)
- **目标**：数据驱动校准卡牌池的稀有度/数值预算与流派覆盖，消除 red 级失衡。
- **具体计划**：
  - 扩展 balance-auditor 审计维度：在既有分布/schema 合法性检查之上，新增流派覆盖率统计、同稀有度期望强度曲线、tag 组合矩阵；
  - 对 `heat_*` 三张新卡与 `demo_*` / `he_*` 存量卡做交叉对比审计，输出带证据的调优清单；
  - 按清单逐卡落地数值调整（一卡一改，便于独立回滚）。
- **验证路径**：`node scripts/validate-content.js` + `scripts/test-cards.js` / `test-card-effects.js` 全绿；审计报告无 red 级残留；调优前后数值对比留档。
- **协作**：`card-author` 出调整方案 → `balance-auditor` 审计闭环。
- **追加范围（2026-08-26）**：
  - 并入 ISSUES #A13：ammo `mode:'add'` 加在倍率刻度上的语义错位（sniper_apcbc/hard_core 数值失真），修复时同步 specs/cards.md 明确 add=乘算后毫米追加，并修 test-cards.js 固化断言；
  - 并入 ISSUES #A14：demo_all_he_doctrine 全局 reload×0.85 白送效果拆出或降档；demo_overmatch_shell passive 未接线，按用户意向转 AP 弹种；
  - 并入 ISSUES #A15：spall_liner 两卡 passive 零消费，接线 resolveHit 模块伤害分支或先移出抽卡池。
- **定案记录（2026-08-26）**：弹种升级模式采用「全局 modifier 为常规主通道 + rare 以上 per-ammo 身份精品卡（每弹种 ≤3 张）」；HE splashRadius 升级需先扩 AMMO_FIELDS 白名单（枚举变更流程）。

### P-43. 地图生成质量优化 (Node Generation Quality)
- **目标**：提升 `generateNode()` 布局可玩性并校准难度曲线。
- **具体计划**：
  - 为 `tank_nodegen.js` / `tank_map.js` 建立 seed 固定的快照测试（防回归基线）；
  - 引入布局质量度量：掩体覆盖率、连通性（可达区域占比）、敌我视线对称性、通道最小宽度；
  - 5 个内置模板逐一校准 difficulty 缩放参数；敌军构成随节点深度曲线化（而非线性堆量）。
- **验证路径**：`npm test` 相关链全绿；度量指标与阈值落档 `docs/specs/map.md`。
- **协作**：`map-cover`（掩体布局）+ `node-map`（流程/构成）分工，`test-runner` 验证。
- **追加范围（2026-08-26）**：并入 ISSUES #A11（地形占位冲突：道路/水域零检测叠加、道路不贯穿）。
- **新增定案（2026-08-26 用户裁定 D5）**：第一阶段先行在 generateNode 中禁止生成半高掩体（half tier 实例不再落位，运行时 RULES.coverTiers.half 与既有判定逻辑保留不动以保证兼容），待游玩测试后再决定是否彻底剥离 half 子系统——届时同步重写 specs/map.md 相关章节并裁定 ruined 残破建筑的 exposureProfile 归属。

### P-44. 战斗结算与 AI 修补 (Combat & AI Fixes)
- **目标**：修复战斗结算与 `aiDecide` 已核实问题，并建立可复现的回归判据。
- **进度（2026-08-26）**：
  - ✅ **回放冒烟基线已建成**：`js/tank_sim.js`（确定性 headless 全链战斗模拟：generateRun 节点链实体化 + 全员 aiDecide 驱动 + driveTank/fireTank/stepShells/resolveHit 共享模块复用，运行期以 seed RNG 流整体替换 Math.random 覆盖 AI 抖动与伤害浮动）+ `scripts/test-replay.js`（13 断言：完整打完 / 同 seed 摘要一致 / 异 seed 分化 / 时长与 HP 域不变量），已接入 `npm test` 链尾。
  - 基线锚点：seed=1 五节点 hash `1e49b3fc`（P-49 概率分区重锚后现行值；P-49 后缺陷修复批(#A8 半高瞬移门控/#A6 飘字截断) 已验证 hash 中性，锚点不变，DEVELOPMENT.md §2 同步）；战局分布含 win/loss/timeout 三态。已知保真度取舍记录于 tank_sim.js 头注释（Boss 占位实体 / dot 连续近似 / 无复活卡牌）。
  - 实现中发现的接口陷阱（备查）：`materializeNode` 的 `env.clearEntities(keepIds)` 是**保留**语义——实现若清空一切会把玩家从注册表抹掉，敌军因 `ctx.player` 引用脱离注册表而永不接战。
- **待办**：
  - 用基线跑批量 seed 收集失败案例 → 核实进 ISSUES；
  - 修补范围（须先核实）：AI 边缘贴近卡位、友军消极防御误判、Boss 阶段衔接断档、`resolveHit` 极端入射角边界；
  - 并入 ISSUES #A8（半高掩体炮弹瞬移命中：tank_fire.js:371 结算分支补剩余距离门控）、#A16（敌 pen/dmg/maxSpeed 三处 spawn 直写改经 modifiers 注入防 refreshStats 回归）；
  - 注意事项：掩体门控与难度公式改动会使回放基线 hash 锚点失效，每次改动须能归因到修复内容后重新锚定。
  - 顺带清偿技术债遗留：友军击杀五折记分（DEVELOPMENT §5 技术债 3 开放问题，非阻塞）。
- **验证路径**：回放冒烟通过（每次修补后 hash 变化须能归因到修复内容）+ 每个修复项有对应回归断言；`npm run test:browser` 无报错。
- **协作**：`enemy-ai` / `tank-combat` 分工修补，发现问题先记 `docs/ISSUES.md` 走核实流程。

---

## 远期候选设计选项 (P-45)

> 说明：本部分记录经讨论定案的远期候选设计选项，作为后续版本设计的决策参考与候选库，不作为当前版本的直接落地实施规划。（原 P-50，2026-08-26 序号前移递补。）

### P-45. 战术动态隐蔽、扇形盲射压制与残余隐蔽机制（候选选项）
- **定位**：远期候选设计选项（非当前落地实施规划）。
- **具体选项与方案设计**：
  1. **盲射压制方式（选项 B：扇形扫射）**：丢失 LoS 后进入盲射压制期 $T_{\text{sup}}$（受难度缩放），AI 以 `lastKnownPlayerPos`（最后已知坐标）为中心，向隐蔽区域左右扇形区域做弧形扫射压制，逼迫隐蔽中的玩家微调走位。
  2. **玩家开火破隐机制（选项 B：残余隐蔽）**：隐蔽内开火不触发瞬间全场暴开锁定，而是增加“暴露值”。单发冷枪仅增加暴露值并诱发 AI 向开火点盲射；连续开火使暴露值满后才彻底破隐，重置为全场 AI 直接锁定。
  3. **镜头缩放**：保持现有的滚轮手动缩放机制，隐蔽时不进行自动镜头拉远/缩放。
  4. **卡牌视野/隐蔽联动（选项 B 考虑）**：局内卡牌（如微声炮管、消焰器、热成像仪等）通过“降低开火暴露值”、“缩小开火暴露半径”或“加速 AI 降级”与残余隐蔽机制联动。
  5. **AI 降级链**：盲射压制期 $T_{\text{sup}}$ 结束转入 `search` 扫视，玩家持续不开火达 $T_{\text{deg}}$（受难度缩放）后清除 `lastKnownPlayerPos` 降级为 `patrol` 巡逻。

---

## 后续立项 (P-46 ~ P-48)（2026-08-26）

### P-46. 类别化敌军体系与生成机制优化（2026-08-26 立项，依赖 P-43/P-44 部分前置）
- **定案背景（用户裁定 D2）**：普通敌人不怕风筝、以数量压制——取消对玩家的速度快照绑定后，靠生成机制保证压力：难度越高，玩家周边敌人数量越多、存在敌人的方向越多（多向包围而非单向追击）。
- **具体计划**：
  - tanks/*.json 增加可选 class 字段（light/medium/heavy/spg），缺省按数值启发式推导；dummy 标注 target 退出敌池并更换空池兜底；
  - tank_map.js heightClass 随机指派改为读 json class；
  - aiClass 分发层：aiDecideEnemy 开头按 class 合成行为档案（轻型=flank 参数化复用 / 中型=基线 / 重型=move=1 泛化 / SPG=skirmish 解除 isBoss 门），RULES.ai.classProfiles 收口；
  - 生成机制优化：敌人 spawn 从聚集布点升级为「以玩家为参考的多方向环带分布」，方向数与每向数量随 diffNorm 提升（复用 RULES.nodeMap.enemyCluster* 族扩展）；
  - 内容前置：至少补 1 型中型 + 1 型 SPG 坦克 json（SPG 曲射武器依赖 P-47 落地，可先占位直射远 engageRange）；
  - enemyCountMax=4 上限评估上调空间。
- **验证路径**：P-44 回放基线 + 新增类别行为断言（test-ai.js）。
- **协作**：enemy-ai（aiClass/行为档案）+ node-map（生成机制/comp 权重）+ tank-model（class 字段 schema）。
- **定案修订（2026-08-26 第二批用户裁定）**：
  1. **（2026-08-26 第三批裁定：已被『玩家基准锚定制』取代，见第 4 点；保留原文备查）防怪兽走构筑预算制（方案 B）**：在玩家入口控制——loadout 出击时经 computeStats 汇出 buildScore（火力/防护/机动加权评分），超预算配置禁止出击或强制降参；预算公式与上限值收口 `RULES.economy` 或独立 `RULES.buildBudget`（公式待设计）。
  2. **敌人与 tanks/*.json 的关系改为「只取外观与类型，不取数值」**：
     - **取**：模型几何（hullPoly/turretPoly 等多边形）、纯外观件、炮管外观规格、类型 class（缺省启发式推导）；敌池扫描 tanks/ 全目录（排除 target 类如 dummy）以自动继承玩家新设计的多样性；
     - **不取**：火力/机动/防护全部数值字段（hp/armor/damage/reload/speed/turnRate/penetration 等）；
     - **数值来源**：`RULES.enemyClassProfiles`（轻/中/重/SPG 四类**比例向量**）× 玩家出战坦克基准快照 × 难度系数 entityMults——比例表而非绝对值表（见第 4 点）；
     - **AI 行为**：与类型挂钩（aiClass 分发，同本条目原计划）；
     - **实现要点**：applyTankConfig 需支持「仅外观应用」路径（应用几何/外观后以 classProfile 覆写 base 数值再 computeStats），或新增 makeEnemyFromAppearance 构建函数；炮管几何保留外观长度但弹速/穿深走 class 表。
  3. **联动影响**：三键玩家快照封顶（penCapVsPlayer/dmgFloorVsPlayer/dmgCapAmmoMult）与 class 表锚定的去留在预算制落地后重新评估（先保留，避免两套反压叠加失衡）；回放基线注意敌池随目录内容变化会影响 rng 流（同目录状态可复现，增删 json 会改变流位，测试须固定目录夹具）。
  4. **玩家基准锚定制（2026-08-26 第三批裁定，取代构筑预算制）**：
     - **核心机制**：以玩家所选坦克的完整数据作为第一个关卡（节点 index=0）的敌军数值基础——敌军各项属性 = 玩家出战坦克对应属性 × enemyClassProfiles 类型比例 × 难度系数曲线。此后玩家经卡牌与局内商店成长、敌人沿难度曲线成长，两条成长线独立。
     - **取代理由**：无需设计 buildScore 公式即可天然防怪兽（怪兽设计的相对优势被全维比例锚定抹平），且自动约束游戏难度起点（节点 1 永远与玩家出厂配置匹配）。
     - **实现要点**：
       - 锚定快照冻结时机 = beginRun 出击时刻（取 loadout 配置经 computeStats 的完整 stats 快照），**不得逐节点重取实时值**——否则拿卡变强的同时敌人同步变强，构成零和惩罚；
       - 三键玩家快照封顶（penCapVsPlayer/dmgFloorVsPlayer/dmgCapAmmoMult）与页内硬编码速度公式（lerp(0.3,0.6,diffNorm)×玩家极速）由本机制统一收编，实施时移除旧三键与直写路径（关联 ISSUES #A16 直写改 modifiers 注入的要求不变）；
       - Boss 链路已锚定“同级普通敌人基准”，随普通敌人间接继承新锚点，tuning 块不动。
     - **已知取舍（备案）**：① 极端玻璃大炮构型会使双方 TTK 同步缩短、节奏变快但相对平衡保持；② 击杀得分为固定值（20 分/辆），故意带弱车刷分的空间需经济侧观察，必要时击杀分随敌方威胁度缩放。

### P-47. Boss 行为包 v2：节奏化·多机制·反风筝（2026-08-26 立项）
- **定案背景（用户裁定 D4）**：Boss 怕风筝。原「Boss 全程 move=1 防风筝」（DEVELOPMENT §2.5）修订为：节奏化移动（移动-冲刺-转向-静止相位）允许短暂静止，防风筝改由以下三手段承担——① 碰撞伤害惩罚贴脸；② 玩家进入 Boss 视野外必定触发冲刺逼近；③ Boss 移动速度与玩家参数解绑，锚定 RULES 绝对标定值。
- **具体计划**（按性价比序）：
  - 曲射武器：复用 callStrike 语义做 fireIndirect 主武器包装，maxStrikes 改 per-owner 上限（解除与玩家炮击共享滚动丢弃）；炮击区 5–8 个随难度缩放（ISSUES 记录的 maxStrikes 隐藏坑一并修）；
  - 双管炮塔：最小版视觉双管+交替开火（gunTipFor(t,idx)+渲染+交替节奏）；
  - 点射：updateBossBehavior 内 burst 门控器（burstShots/burstGap/groupPause），behavior.gun schema 白名单扩充；
  - 多履带：trackL/R 侧别判定 + 单侧断减速/双侧断瘫痪 + entity/revive/abilities 三处 reset 同步；
  - 多炮塔 P1 视觉副塔直伤（P2 真实弹道以部位泛化为独立前置，另行立项）;
  - 同轴/航向机枪：仿 droneFire 直伤 A 档方案（穿深同主炮、伤害 1/10、5 倍射速、点射）；
  - 实施时同步 specs/boss.md（新 schema 章节 + makeBossEntity 缩放统一变换重构说明）。
- **验证路径**：test-boss.js/test-ai.js 断言扩充 + 回放基线归因。
- **协作**：boss-author（行为/schema）+ enemy-ai（rhythm 模式进 stageAI 枚举）+ tank-combat（碰撞伤害/机枪结算）。

### P-48. 对比器单位标定与分组重构（2026-08-26 立项）
- **定案（用户补充需求）**：tank_compare.html——① 极速直接以 km/h 设定（经 kmhFactor=0.4 换算），炮管长度直接以 m 设定，「真实单位标定」栏取消；弹速保持 px/s 设定且不显示真实换算值；② 精度与最差散布不再直接设定，改为以「100m 散布范围」单一定义设定精度（映射公式需从现有 SPREAD/sigma 语义推导并在 editor.md 备案）；③ 参数栏目按火力/防护/机动/杂项四类分组（与局内商店分组语义对齐）。
- **验证路径**：npm run check + test:browser 冒烟；FIELD_ROWS/tank_schema.js 变更同步 specs/editor.md。
- **协作**：tank-designer 主责。

### P-49. 模块/成员概率分区系统与设计器耦合链（2026-08-26 立项）（核心批已实施：概率分区/breech/尺寸与参数极限/重量双层上限/功重比——2026-08-26；**未实施余项**：属性耦合链〔甲→重量已落、马力-车体挂钩、穿深伤害→装填三扩公式〕、卡牌 ≤25% 模块概率修正通道）
- **背景**：废除设计器自定义模块/成员挂载（specs/editor.md「模块可视化挂载」功能将随实施移除），改为几何分区+概率判定。
- **已定案规格（用户逐条裁定）**：
  1. **炮塔四象限**：以炮塔装甲模型几何中心（非座圈中心）为原点、随炮塔旋转的局部坐标轴分四象限；左右定义为**从炮塔内面向炮塔正面时的左右**。左前区：炮手 50%、炮栓(breech，新键)5%；右前区：车长 30%、装填手 30%、炮栓 5%；左后/右后区：弹药架各 50%。象限内互斥抽取，单次命中只结算一个分支。
  2. **车体纵轴区段**：座圈圆心 p 在车体几何中心 c 前（含重合）= 前置炮塔构型，否则后置。
     - 前置构型：前 10% 区段=驾驶员区间（击穿后驾驶员 10%/弹药架 10%）；中间 40%=弹药架区间（弹药架 50%）；后部 50%=发动机区间（发动机 40%）。
     - 后置构型：前 50%=发动机区间（40%）；中间 10%（驾驶员 5%/弹药架 50%）；后 40%=弹药架区间（40%）。
     - 左右定义同炮塔（从车体内部面向车头时的左右，随车体朝向）。
  3. **余量语义**：各区概率之和<100% 的余量 = 击穿、正常结算炮弹伤害，但不获得成员/模块倍率加成。
  4. **区段判定基准**：只判断击穿点所在区间，不做贯穿路径多点判定。
  5. **无炮塔构型**：不考虑（当前不支持 TD 固定战斗室）。
  6. **新键 breech（炮栓）**：MODULE_LABELS / tank_physics case / abilities 修理清除表 / BOSS_WEAKSPOT_KEYS 四处同步；效果待裁定（候选：装填时间×2 或短时无法开火）。
  7. **卡牌概率修正**：可提高模块被击中概率，幅度加法计算且 ≤25%；修正后单区概率 clamp ≤90%（保住余量）。联动方向：增强火控类效果提高炮手/炮栓被击中概率；装填速度类效果提高弹药架/装填手被击中概率（两个新 modifier stat 键收口 RULES）。
  8. **属性耦合链**（RULES 收口公式）：增加装甲→车体重量上升；更大车体→可用马力上限提高+重量增加+模块被击中概率降低（缩放因子 clamp [0.7,1.3]）；增加穿深/伤害→装填时间与三扩系数上升；炮塔/车体长宽设定极限值（RULES min/max）。
  9. **体积极端四层防线**：尺寸硬极限 / 重量模型自动惩罚 / 马力-车体挂钩 / 小体积无内部概率豁免（仅弹丸命中难度收益）。
- **与既有系统的衔接**：六类成员 debuff 链已存在零改动（tank_physics.js:151-232）；moduleFromHit 由 face 分区改为概率分区重构；弹药架 2× 伤害与殉爆飞头机制保留。
**已裁定（2026-08-26 用户定案）**：
- ① weight 一律按装甲几何**派生计算，不允许自定义**；设计器与对比器面板提供功重比（enginePower/weight）显示。
- ② 穿深/伤害→装填/三扩耦合只作用于**设计器保存的基础值推导层**——卡牌/局内商店的穿深、伤害加成不追加装填惩罚。
- ③ breech 效果定案：受伤期间**短时完全无法开火**（debuff 风格与其他模块一致，修理箱可清除）。
- 文档冲突处置已批准：specs/editor.md「模块可视化挂载」节废除、specs/combat.md「弹药架与模块」节重写为七类概率分区，随实施同步。
- **文档冲突备案（实施时必须同步）**：specs/editor.md「模块可视化挂载」（六模块强制挂载）整节废除；specs/combat.md「弹药架与模块」节（六类边段挂载描述）重写为七类概率分区。
- ⑤ **全参数极限制**：所有可设参数均设极限值（收口 `RULES.parameterLimits`）；**重量双层上限**——80t 为玩家**设计**上限（仅约束设计器出厂值，deriveWeight 达限时禁止继续提升增重参数）；卡牌与局内升级可突破 80t，运行时总硬上限 **240t**（`RULES.weightRuntimeCap`，computeStats 收口钳制）。
- **验证路径**：test-physics/test-covers 类断言扩充（各象限/区段概率抽样统计）+ 回放基线归因。
- **协作**：tank-combat（moduleFromHit/physics/breech）+ tank-designer（废挂载 UI/尺寸极限/耦合公式）+ tank-model（weight/马力/概率缩放派生）+ card-author（≤25% 概率修正卡）。
