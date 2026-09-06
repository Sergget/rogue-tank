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
  - ✅ 并入 ISSUES **#A13**（ammo `mode:'add'` 加在倍率刻度上的语义错位）已于 2026-08-26 修复并归档：computeAmmoConfig 的 add pass 改按「乘算后毫米追加」独立合成 `fieldAdd`（自然单位、不混入倍率刻度），specs/cards.md §3 同步改写，test-cards.js 固化断言修正完毕（见 docs/ARCHIVE.md 2026-08-26 #A13）。
  - ✅ 并入 ISSUES **#A14**（「全线高爆战术」过强 / 「超口径高爆弹」死效果）已于 2026-08-26 修复并归档（原 2026-08-26 批次遗漏 lifecycle，2026-08-27 补走）：demo_all_he_doctrine 移除 reload×0.85 白送效果、仅保留 HE dmg×1.2+pen×1.2；demo_overmatch_shell 转 AP 保留 passive overmatch 0.85，tank_physics.js 经 passiveValues 接通口径碾压分支；test-cards.js #A14a/#A14b 断言覆盖（见 docs/ARCHIVE.md 2026-08-27 #A14 / specs/cards.md §6）。
  - （原 #A15 spall_liner 两卡 passive 零消费已于 2026-08-26 核实为已修复——tank_physics.js 经 passiveValues 消费，已走 lifecycle 删除，见 docs/ARCHIVE.md）
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
- **进度（2026-08-26，首轮）**：
  - ✅ **seed 固定快照回归**已建：`scripts/test-nodegen-snapshot.js`（112 用例：确定性 + 无 half + 非空 + 布局度量健全性），已挂入 `npm test` 链（test-qa.js 校验 30/30 合规通过）。
  - ✅ **布局质量度量** `nodeLayoutMetrics(result, opts)` 落地于 `js/tank_nodegen.js`：返回 `coverCoverage / connectivityRatio（网格 BFS 可达占比）/ losSymmetry / minPassageWidth / coverCount / waterArea`，纯逻辑 Node 可测；快照测试内含其健全性断言。
  - ✅ **D5 半高禁令确认落地**：`generateNode` 主循环 `if (tier === 'half') continue;`（~L1056）已生效，实测输出零 half tier。
  - ✅ **敌军构成随节点深度成曲线**：`js/tank_map.js` 新增 `enemyCompositionForDepth(index, diff, rng, cfg)`——重型占比随深度单调上升（~10%→75%）、后期首个敌人标 `elite`（更高 aiTier + 全属性 ×1.15）、中期奇数序号敌人标 `role:'support'`（预留 tag，战斗逻辑未消费）；总数恒定 = `enemyCountForDifficulty(diff)`；确定性不破坏（回放 seed=1 hash 现 `799b65f`，仅漂移、断言仍过）。
  - ⚠ **已知遗留子问题**：`makeNode` 在 `diff≈0.35`（idx4）下实生成敌数恒为 0（聚簇 + 兜底网格在无视口 scale=3 下找不到合法落点），属**预存落点脆弱性、非本次引入**（git stash 比对原版同 0）；留待 #A11 / 落点兜底强化一并处理，不阻塞本切片。
  - **待办（未做）**：① ✅ **5 模板难度缩放校准已完成**（2026-08-26）：基于 `nodeLayoutMetrics` 实测剖面锁定回归带（`scripts/test-nodegen-calibration.js`，7 模板 ×5 难度 ×8 seed 挂入 `npm test`）；实测开阔模板连通性 0.97–1.0 且 coverCoverage 随难度单调非降、密林模板为设计性分区（兜底可玩性由 `findPlayerSpawn`+`ensureLoSCorridor` 保障），参数未做破坏性调整；带宽与旋钮清单见 specs/map.md §8。② ⬜ 并入的 #A11 地形占位/路网重构（道路/水域叠加 + 道路不贯穿）尚未实施。

### P-44. 战斗结算与 AI 修补 (Combat & AI Fixes)
- **目标**：修复战斗结算与 `aiDecide` 已核实问题，并建立可复现的回归判据。
- **进度（2026-08-26）**：
  - ✅ **回放冒烟基线已建成**：`js/tank_sim.js`（确定性 headless 全链战斗模拟：generateRun 节点链实体化 + 全员 aiDecide 驱动 + driveTank/fireTank/stepShells/resolveHit 共享模块复用，运行期以 seed RNG 流整体替换 Math.random 覆盖 AI 抖动与伤害浮动）+ `scripts/test-replay.js`（13 断言：完整打完 / 同 seed 摘要一致 / 异 seed 分化 / 时长与 HP 域不变量），已接入 `npm test` 链尾。
  - 基线锚点：seed=1 五节点 hash 现行值 `b4208e48`（演进链 28f3e684 → 1e49b3fc〔P-49〕→ 5b8c4126〔#A17〕→ 799b65f〔P-43〕→ 5d754f53〔#A18 代理玩家补瞄准+开火〕→ 49a6b2c9〔P-46 类别化行为分发〕→ b4208e48〔P-46 环带生成与玩家基准数值锚定〕；test-replay.js 仅校验确定性、不钉常量，每次改动须能归因到修复内容后重新锚定）；战局分布含 win/loss/timeout 三态。已知保真度取舍记录于 tank_sim.js 头注释（Boss 占位实体 / dot 连续近似 / 无复活卡牌）。
  - 实现中发现的接口陷阱（备查）：`materializeNode` 的 `env.clearEntities(keepIds)` 是**保留**语义——实现若清空一切会把玩家从注册表抹掉，敌军因 `ctx.player` 引用脱离注册表而永不接战。
- **待办**：
  - 用基线跑批量 seed 收集失败案例 → 核实进 ISSUES；
  - 修补范围（须先核实）：AI 边缘贴近卡位、友军消极防御误判、Boss 阶段衔接断档、`resolveHit` 极端入射角边界；
  - ✅ 并入 ISSUES **#A8**（半高掩体炮弹瞬移命中：tank_fire.js:371 结算分支剩余距离门控）与 **#A16**（敌 pen 封顶/dmg 地板+天花板/maxSpeed 四键直写改经 difficultyCapMuls + addModifier 注入防 refreshStats 回归）均已于 2026-08-26 / 2026-08-27 修复并归档，剩余飞向量由本条目后续修补继续覆盖；
  - 注意事项：掩体门控与难度公式改动会使回放基线 hash 锚点失效，每次改动须能归因到修复内容后重新锚定。
  - ✅ 顺带清偿技术债遗留：友军击杀五折记分已落地（`tank_mvp.html` 中 `lastHitByTeam === 'ally'` 结算 50% 击杀分，见 `DEVELOPMENT.md` §5）。
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

## 后续立项 (P-47)（2026-08-26）

### P-47. Boss 行为包 v2：节奏化·多机制·反风筝（2026-08-26 立项）
