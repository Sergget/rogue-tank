# Rogue Tank — Agent 工作指引

本文档是 Agent 在本项目工作的高信号指引。包含：项目概览、文档分工与条目生命周期、开发工作流、架构要点、当前状态指引。开始任何工作前请先通读；文档相关约定以本文件为唯一流程权威，系统内容以 `docs/DEVELOPMENT.md` 为唯一内容权威。

## 1. 项目概览

- **类型**：节点式地图推进 + 局内得分驱动构筑 的战术坦克 Roguelike（俯视角 2D），方向为技能系统 + 主副武器解耦 + 召唤部署物（详见 `docs/DEVELOPMENT.md` §1）。
- **核心页面**（均为单文件 HTML，内联大段脚本；共五页，`server.js` '/' 指向首页）：
  - `index.html`：首页封面路由（正式游戏 / 装甲测试台两卡片入口 + 设计器 / 对比链接）。
  - `tank_battle.html`：正式游戏页（run 链路：Home 多存档 → Loadout → 商店 → 节点图 → 战斗/结算/卡牌/Boss/AI/复活/经济/小地图；开发者面板 `#devPanel`、日志面板、流程覆盖层 `#flowOverlay`）。**游戏模式由 URL 参数 `?mode=` 决定**（`standard` 缺省 / `boss` 全 Boss 链 / `survival` 波次守点，`GAME_MODE`，2026-10-15 #MODE）——现行口径见 `docs/specs/combat.md` §14。
  - `tank_bench.html`：装甲测试台独立页（player + dummy 靶车、发射解算面板、靶场控制台、Enemy Lab、卡牌测试）。
  - `tank_designer.html`：多边形顶点编辑器（车体/炮塔几何、逐边装甲、炮管/炮盾、甲弹对抗测试）。
  - `tank_compare.html`：表格化坦克数据对比/编辑页。
- **共享模块**（`js/`，浏览器端以全局脚本按序加载、非 ES Module；每个模块底部带 `module.exports` 以支持 Node 测试）：
  - `tank_rules.js`：**机制参数唯一配置源**（RULES），必须最先加载，其他模块依赖它。
  - `tank_utils.js`：数学工具（norm/angDiff/gaussian/rotate/distToSegment/segRayIntersect/partCorners/partEdges/reflectDir + **`lightningPath`** 确定性电弧/闪电折线，2026-10-18 #U38），最先可加载的纯工具层。
  - `tank_geometry.js`：多边形/射线/命中部位（hullPoly/turretPoly/raycastTank/bestTankHit/moduleFromHit/gunRoot）。
  - `tank_model.js`：坦克配置与属性系统（makeTank/applyTankConfig/computeStats 三层属性/SPREAD 散布/debuff 函数/parameterLimits 钳制）。
  - `tank_physics.js`：命中时刻结算（resolveHit：入射角/等效厚度/跳弹/穿透/模块几何概率分区伤害）。
  - `tank_cover.js`：掩体/地图元素（covers 实例、概率遮挡、OBB/compound 凸包碰撞、破坏/残骸/水体溺毙判定）。
  - `tank_entity.js`：实体注册表（`entities` 数组全局唯一实例、spawnTank/isHostile/nearestEnemyTo/resolveTankCollisions/resetEntity）。
  - `tank_weapons.js`：主/副武器定义与运行时（`WEAPON_DEFAULTS` 双槽缺省表、`updateSecondaryWeapon` 分发 mortar/missile/rocket/mine_layer/turret 五类副武器、`updateMissileLock`）。
  - `tank_fire.js`：开火通用层（fireTank 通用开火 + `tryFirePrimary`（左键/空格=主炮专属，salvo 齐射）/`tryFireSecondary`（F=副武器击发）双入口 + `primaryWeaponSpec`/`firePrimaryShell` + stepShells：曳光/近炸引信/溅射/掩体交互；经 computeAmmoConfig 接入卡牌弹种改造）。
  - `tank_abilities.js`：主动能力统一入口（`tryActivateAbility`：runtime 键 **artillery / overdrive / shield / deploy_cover / aps**（`ABILITY_KEYS_RUNTIME`，**5 个**；原含 `super_fire_control` / `super_speed`，2026-10-20 #W9 用户裁定删除——两键无任何卡牌可授予、正式游戏不可达）与 innate 键 repair/medkit/extinguish **统一按 key 独立冷却池 `abilityCds[key]`**，逐帧 `updateAbilityCds`；旧共享字段 `abilityCdT`/`updateAbilityCd` 为废弃兼容助手。**`ABILITY_KEYS`（卡牌可授予）现为 8 键 = innate 3 + runtime 5、无死键**——原死效果键 `recon` / `track_repair` 及 5 张对应卡于 2026-09-23 A 档摘除（见 `docs/DEVELOPMENT.md` §4.35），`super_fire_control` / `super_speed` 于 2026-10-20 #W9 摘除（见 §4.112(4)，并配负向断言防回潮）。
  - `tank_shield.js`：累计吸收护盾（applyShield/入射角吸收判定）；`tank_strike.js`：延迟 AOE 炮击（callStrike：circle/point/carpet 三形状/updateStrikes）。
  - `tank_deployables.js`：战场部署物注册表（`deployables`：固定炮塔/地雷/战术掩体，spawn/update/duration 生命周期 + mineExplode 事件）。
  - `tank_drone.js`：伴随无人机体系（模块级 `drones` 数组单一数据源，scout 侦察/striker 打击两型，countMax 上限）。
  - `tank_cards.js`：卡牌系统（CARD_RARITIES/效果类型 + `validateCard`/`applyCardEffects`/`drawCardChoices` 含装备优先保底与 `cardEligible` 资格过滤/`cardStackCount`；#U40 2026-10-19 起含**调校/升级分界**——带 field 的 ammo 效果绝不触发链替换、`isAmmoUpgradeCard` 同口径；应急护盾再充能助手 `emergencyShieldCooldown`/`updateEmergencyShieldRearm`；经济聚合 `runScoreMultiplier`/`runShopDiscount`。**卡牌 `tags` 字段与 `CARD_TAGS` 枚举已于 2026-10-20 #16 整体下线**——196 张卡不再带 tags，校验与导出同批删除，见 §4.112「#16」）。
  - `tank_boss.js`：Boss 系统（validateBoss/bossStageFor + makeBossEntity/applyBossStage/updateBossStage，缩放整体替换不污染共享 spec）。
  - `tank_ai_squad.js`：敌军攻守分工协调器（`updateSquad` 按「距离/LoS/血量」评分分配 press/flank/hold 角色 + `holdGate` 射界门控 + `threatIndicators` 视口外来袭方位提示；纯逻辑、可 Node 测试，**须先于 `tank_ai.js` 加载**——后者运行时调用 `holdGate`；2026-10-02 #N 新增）。
  - `tank_ai.js`：敌人/友军 AI 决策（`aiDecide` 双态 + 受击警觉/避水/找掩体 coverSeek + 消极防御，输出 `{turn, move, turretDesired, fire}`；#M 接战机动随机化、#N 交战距离带 / flank 侧翼站位 / 群体分离力 / 装填脱离）。
  - `tank_revive.js`：死亡/复活状态机（满状态复活 + 无敌 + 友军据点旁随机点，依赖 `RULES.revive`）。
  - `tank_economy.js`：经济/存档/多存档槽位（元索引 + 槽位键 CRUD + migrateLegacySave；UPGRADE_DEFS 永久升级树 + scoreToPoints/buyUpgrade/applyUpgrades/buyExtraRevive）。
  - `tank_nodegen.js`：节点地图元素生成器（7 内置模板 + `generateNode(difficulty,{seed,templateId,scale})` 确定性生成 + `placeRoadNetwork` 路网 **v4 七拓扑**（A 贯通 / B 十字 / C 单侧 T / E 双侧 T / D 双平行 / G 网格街区 / I 双干贯穿）+ 建筑与路口沙包 + 重叠消解 + `generateStrip` 横向条带（`opts.chunkRows` 多行片网格 + 每行横向路面保证 + 行间接缝推出 + `fillEmptyBands` 补植）+ `clearCoversOnRoads` 道路上不得有房屋/树木的 verts 精判收尾（2026-10-18 #U35））。
  - `tank_map.js`：线性节点链生成 + 难度曲线 + 节点实体化（generateRun/makeNode/scoreNode/materializeNode）。
  - `tank_flow.js`：全局流程状态机（map/battle/settlement/reward/gameover + home/loadout/shop，白名单转移 + watchFlow）。
  - `tank_camera.js` / `tank_minimap.js`：摄像机跟随与视口剔除 / 小地图绘制（均纯逻辑可 Node 测试；小地图含**公路整链多边形**（`roadCoverPolygonPoints`，road 的 `verts` 是局部坐标，逐点经 `worldToMinimap` 换算以适配 strip 的 `sx≠sy`）与**补给点标记**（`minimapSupplyMarks`，`opts.supplyStations`）——2026-10-18 #U35。**`renderCamPos` 为渲染专用相机位置（屏幕像素对齐 `round(x·zoom)/zoom`），物理/AI/命中仍读浮点 `cam.x/cam.y`**——#GT 2026-10-18）。
  - `tank_battledraw.js`：battle 战斗场景绘制层（drawTank/drawShells/drawCover/drawFoliage/部署物绘制 + **`railChargeProgress`** 电磁炮充能进度 0..1，2026-10-18 #U38），ctx 显式传参。
  - `tank_fx.js` / `tank_paint.js` / `tank_dmgtext.js`：战斗特效 / 程序化坦克渲染 / 伤害飘字（纯 ctx，无 DOM 依赖；`tank_fx` 含电磁炮放电弧 `spawnRailDischarge`/`drawRailArcs`/`railArcCount`——注意 `updateFx` 会**重新赋值** FX 数组，读当前长度必须走访问器，不能读导出的数组引用）。
  - `tank_assets.js` / `tank_audio.js`：贴图资产层（ASSET_DEFS + 离屏烘焙缓存，**程序化烘焙为唯一实机路径**；`assets/<key>.png` 是后期贴图接线，当前无图） / 声音系统（SOUND_DEFS + 惰性 AudioContext，全合成零资产）。**本仓库不出图**（2026-10-23 用户裁定，见 `docs/DEVELOPMENT.md` §4.124）：后期美术落盘与锚点验收见 `docs/ASSETS-PIPELINE.md`。
  - `tank_bindings.js`：**键位唯一数据源**（KEY_BINDINGS/ACTION_INFO + createInputController 统一 keydown/keyup + describeBindings + loadSettings/saveSettings）。
  - `tank_panels_core.js` / `tank_panels_dom.js` / `tank_panels.js`：面板分层（纯核心 + 卡牌事务 snapshotCardTx/rollbackCardTx + parameterClamp / DOM 适配 / 门面）。
  - `tank_devpanel.js`：开发者面板共享模块（`mountDevPanel(host)` 动态构建四 Tab devPanel——实时/卡牌/参数/开关，battle 与 bench **两页同源**；页面能力经 host 注入：getPlayer/getCardPool/getCtx/cardClick/cheatsInit/onCheatChange/liveData/extraSwitchHTML/hideSolutionSection 等；#F 2026-09-20 抽离，原 battle 内联面板与 bench 旧 `#benchPanel` 已移除）。
  - `tank_sim.js`：回放代理玩家 harness（仅测试链使用，不影响正式游戏）。
  - `tank_halfgeom.js` / `tank_move.js` / `tank_listio.js` / `tank_presets.js` / `tank_schema.js` / `tank_screens.js`：半侧对称几何+normalizeBarrel / 统一运动 driveTank / tanks/ 读写 / 炮管炮盾预设 / 字段架构表 / 覆盖层 UI 纯逻辑视图模型。

## 2. 文档分工与条目生命周期（开始工作前必读）

（**分卷结构**：`docs/` 目录收纳四份主文档（DEVELOPMENT / PLAN / ISSUES / ARCHIVE）+ `specs/` 五卷系统规范；`AGENTS.md` 位于仓库根目录供 Agent 自动发现。归档正文按月分卷至 `docs/archive/`，任何 agent **严禁全文读取归档分卷**——按 `ARCHIVE.md` 索引定位后 Grep 切片。拆分前原文快照：`docs/archive/2026-08-development-full-snapshot.md`。）

> **🆕 specs 已 wiki 化（2026-10-21）**：五卷正文拆为 **67 个主题页**（`docs/specs/<卷>/`，2026-10-26 实测；原 65 页 + 2026-10-26 新增友军指挥 / 真 3D 路线 2 页），单卷文件 `docs/specs/<卷>.md` 保留为 **§N 兼容索引页**。**改 specs 前必须先读 `docs/WIKI-STYLE.md`**——它是 specs 形态的唯一规范权威。详见 §2.3。

| 文档 | 角色 | 职责 | 更新时机 | 生命周期 |
|---|---|---|---|---|
| `docs/DEVELOPMENT.md` | 长期权威 | §0 文档体系索引与目录 / §1 核心方向 / §2 架构演进 / §3 当前状态与下一步 / **§4 批次落地结论（按编号递增）**——§4.0 为已归档条目的编号索引表，§4.27 起为正文。 | 每个批次实现并验证后新增一个 §4.x 编号条目（**续写在 §4 正文末尾、编号递增**）；路线顺序变化时更新 §3。 | 长期维护，唯一内容权威；§4 只增不回改（被推翻的旧结论以注记指向新节，不删原文）。**§4.1~§4.26 逐条正文已于 2026-09-23 归档**（原文快照见 `docs/archive/2026-09.md`），编号与归口保留在 §4.0 索引表；**禁止再让 §4 出现编号缺号或降序排列**。 |
| `docs/specs/<卷>/` | 系统子文档（**wiki 正文**） | 各系统规范的**现行口径唯一权威**：combat（战斗/弹种/能力/AI/特效/音频）/ map（地图/掩体/路网/水域）/ cards（卡牌）/ boss / editor（编辑器工具链）。每卷含 `index.md`（卷首页导航）+ 主题页 + `changelog.md`（沿革/已作废）。 | 对应系统设计定型或实现落地时。 | 长期维护；旧值被取代时加「已被 X 取代」注记后改写为现行值。**改法见 §2.3 与 `docs/WIKI-STYLE.md`**。 |
| `docs/specs/<卷>.md` | **§N 兼容索引页** | 保留全部原章节编号（`## N.` / `### N.M`），每节 1~3 行摘要 + 「详见」链接指向主题页。**不承载正文**。 | 仅当新增/删除章节、或摘要与正文失配时 | 长期维护；**编号是外部契约，禁止重排**（597+ 处引用依赖）。 |
| `docs/PLAN.md` | **临时** | 近期待办与计划：待办总览表 + 执行方案（是计划，非承诺）。 | 规划近期工作或更新条目状态时。 | 条目实现并验证后**删除并归档**；只保留未完成项。 |
| `docs/ISSUES.md` | **临时** | **仅已核实的问题**：每条必须有 `file:line` 证据、根因/影响、复现条件、状态（`待处理`/`处理中`）。 | 确认新问题（新增编号条目）或修复既有条目时。 | 修复验证有效后**删除并归档**。 |
| `docs/ARCHIVE.md` | 只读归档索引 | 完结条目**索引表**（按日期升序）+ 分卷链接；正文在 `docs/archive/<yyyy-mm>.md`。 | 条目走完生命周期被删除时。 | 只增不删；新行加表尾；主文件保持极小。 |
| `AGENTS.md`（本文件） | Agent 工作流 | 概览、命令、架构、文档分工与生命周期。 | 工作流、目录结构或约定变化时（至少每次大整理后同步）。 | 长期维护。 |

**条目编号规则**：ISSUES 问题按批次字母编号（`#A`/`#B`/`#C`…）+ 会话内递增（#A1、#B6、#C1…），编号不复用、跨批次延续；归档与 DEVELOPMENT 引用时保留原编号以便追溯。

### 2.1 文档一致性纪律（防冲突/重复/过期）

- **权威单向归口**：系统**现行细则**只写在 `docs/specs/<卷>/<主题页>.md`（wiki 正文）；`DEVELOPMENT.md` §4 只留简结论 + 「细则归口 specs/<卷>/<页>.md」指针；`docs/specs/<卷>.md` 兼容索引页只放摘要与「详见」链接、**不放正文**；**禁止把临时文档（PLAN/ISSUES）当作权威引用目标**——引用它们的章节会被重写/删除，引用已归档问题应改指 `docs/archive/<yyyy-mm>.md`。
- **被推翻的设计不静默删除**：主文档 §4 历史条目保持原文 + 加「已被 §4.x/§y 取代」注记；specs 内旧数值改写为现行值并在原处留沿革注记。读者应能只读 specs 就得到现行口径，只读 DEVELOPMENT §4 就能追溯演进。
- **同文档内禁止重复罗列数值**：同一数值/参数表只允许一个「唯一口径」小节（如 combat.md §3.2 弹种总表），其余位置一律指向它。
- **specs 章节编号是外部契约，不得重排**：实测 191+ 处文档/代码引用 `specs/<卷>.md §N`，历史批次日志又按「只增不改」维护 ⇒ **新增内容一律用新编号追加**，需要重组时用「卷首 §0 主题索引 + 批次节主题标签 + 数值唯一口径」三件套，**禁止重编号**。现行实践见 `DEVELOPMENT-batches-2026-10.md` §4.113。
- **specs 正文已 wiki 化（2026-10-21）**：五卷共 **67 个主题页**（2026-10-26 实测），位于 `docs/specs/<卷>/`；`docs/specs/<卷>.md` 是 §N 兼容索引页（标题编号不变、每节 1~3 行摘要 + 「详见」链接）。**查现行口径先读 `<卷>/index.md` 或其 `changelog.md`**，不要直接读兼容页当正文。风格规范见 `docs/WIKI-STYLE.md`。
- **统计数字必须实测**：文档中的统计数字（卡牌数量/分布等）标注实测日期；引用过期数字前先重跑对应脚本（如 `node scripts/audit-content.js`）。
- **模糊词禁用**：章节标题与结论禁止「本轮/本批」无日期锚点的写法；一律带 yyyy-mm-dd（或月份）锚点。

### 2.2 条目的 4 步生命周期（删除必走，缺一不可）

当修复确认有效 / 功能实现并验证通过后：

1. **同步**：先写结论——① **`docs/specs/<卷>/<主题页>.md`**（战斗→`combat/` / 地图→`map/` / 卡牌→`cards/` / Boss→`boss/` / 编辑器→`editor/`）写**现行细则**，并按 §2.3 的「改 wiki 页三步」执行；② `docs/DEVELOPMENT.md` 新增一个 §4.x 编号条目（简结论 + specs 归口指针**指向主题页**、如 `specs/combat/ammo-system.md` + 三链验证记录），确保不依赖 PLAN/ISSUES 也能独立说明项目状态。
2. **删除**：从 `docs/PLAN.md` / `docs/ISSUES.md` 中**完全删除**对应条目。
3. **归档**：将被删条目**原文**追加到当月分卷 `docs/archive/<yyyy-mm>.md` 底部（标注来源文档、条目编号、删除日期），并在 `docs/ARCHIVE.md` 索引表**表尾**加一行（日期升序）。
4. **联动**：若结论影响后续规划顺序，同步更新 `DEVELOPMENT.md` §3（待办与下一步）与 `PLAN.md` §1（待办总览表）。

**约定：**
- **绝不凭空发明"疑似但未证实"的问题**——先拿代码证据（`file:line`，必要时定向复现）核实，再写入 `docs/ISSUES.md`。
- 未验证完成的条目**不得提前删除**（保持 `待处理`/`处理中` 状态即可）。
- 当对话确认了一个设计决策 / 完成了一个计划条目 / 修复了一个问题，**在收尾前走完 4 步生命周期**，避免决策只留在对话记录里。
- 若各文档描述冲突，判定顺序：**现行口径以 `docs/specs/<system>.md` 为准；演进顺序与状态以 `DEVELOPMENT.md`（§3 > §4 后条目）为准**；`docs/ARCHIVE.md` 与归档分卷仅供追溯，不参与现行判定。
- 每次大整理/批量审计后，**同步检查本文件（AGENTS.md）是否与 docs/ 现状脱节**（表结构、章节号、卷名）。

### 2.3 改 specs 的三步（wiki 规则，**任何写入 specs 的改动都必须走**）

> 形态权威：`docs/WIKI-STYLE.md`。本节是**执行摘要**；冲突时以 WIKI-STYLE 为准。

**先想清楚改的是哪一类**：

| 改动性质 | 动哪里 | 不动什么 |
|---|---|---|
| **改现有机制的数值/行为**（最常见） | ① 改对应**主题页**的「唯一口径」处 ② 更新 `<卷>.md` 兼容页该节**摘要**（若摘要提到了这个数值） | **不动编号**、不动其它页 |
| **新增一个机制/主题** | ① 新建 `<卷>/<kebab-topic>.md`（套 §3.1 四行头部模板）② 在 `<卷>/index.md` 的主题列表加一行 ③ 在 `<卷>.md` 兼容页**用一个新编号**（如 §29）追加「摘要 + 详见」 | 不动已有编号 |
| **彻底废弃一个机制** | ① 正文迁到 `<卷>/changelog.md` ② 兼容页该节摘要改为「已作废（日期），见 changelog」 ③ 主题页若整页作废，`index.md` 标注「已作废」 | **不删编号**（外部引用仍要能解析） |

**三步执行（缺一不可）**：

1. **改正文**：编辑 `docs/specs/<卷>/<主题页>.md`。数值只写在**全卷唯一**的「唯一口径」处，其余页写链接。旧值保留为沿革注记（`~~旧值~~ → 新值（YYYY-MM-DD #编号）`），**不得静默删除**。
2. **对齐兼容页**：若该节的**摘要**受影响，同步 `docs/specs/<卷>.md` 对应节（1~3 行 + 详见链接）。若只是正文细节变化、摘要仍准确，可不改。
3. **跑链接自查**：
   ```powershell
   node scripts/wiki-check.js          # 全 docs 树：断链 + 失效锚点（见 §3.1）
   ```
   新增/改名页面后**必须**跑——改文件名而不改引用是最常见的 wiki 破坏方式。

**新增页面的四条硬性要求**（WIKI-STYLE §3.1）：
- 四行头部：`**摘要**`（≤60 字）/ `**适用版本**`（现行 YYYY-MM-DD / 已作废 / 设计预留，可混装）/ `**源自**`（原节号）/ `**相关**`（2~4 个链接）
- 末尾必须有 `## 相关页面`（2~4 条，每条一句为什么相关）
- `## 目录` 仅在 ≥3 个 h2 时加（2 节页面加目录是噪音）
- 文件名英文 kebab-case；标题中文

**禁止事项**（WIKI-STYLE §10 反例）：
- ❌ 把正文写回兼容页（那就不是索引页了，拆分失去意义）
- ❌ 重编号、删编号、改编号顺序
- ❌ 同一数值在两页各写一遍
- ❌ 主题页里贴历史批次日志（应进 `changelog.md`）
- ❌ 用 `§3.2` 作页内跳转（`§N` 只作溯源标注）

**修改后自检清单**（对应 WIKI-STYLE §8 的 8 项，日常改动用简化版）：
1. 编号集合未变（`grep '^## [0-9]' docs/specs/<卷>.md` 与改动前一致）
2. `node scripts/wiki-check.js` → broken=0、anchorBad=0
3. 全卷搜该参数名，确认「= 值」只出现一次

## 3. 关键开发工作流

### 3.1 启动原型（dev server — 必需，不可省略）

原型必须通过 HTTP 服务打开——它们会 `fetch('api/tanks')` 并加载共享的 `js/` 模块，两者在 `file://` 下都无法工作。

- 启动：`npm start`（或 `npm run dev`，或双击 `start.bat`）。
- 访问（默认端口 8000，可用 `PORT=9000` 覆盖）：
  - `http://127.0.0.1:8000/` → index.html（首页路由）
  - `http://127.0.0.1:8000/tank_battle.html`（正式游戏）/ `tank_bench.html`（装甲测试台）
  - `http://127.0.0.1:8000/tank_designer.html`
  - `http://127.0.0.1:8000/tank_compare.html`
- 校验：`npm run check` —— 对共享模块、`server.js` 及五个页面的每个内联 `<script>` 做语法冒烟 + typecheck（无需浏览器）；`npm test` —— 全套 Node 测试链；`npm run test:browser` —— 浏览器冒烟四链（smoke / r3 / run / r4，r4 覆盖主副武器与技能/商店实战；需系统 Edge，playwright-core 无头）。三者都应全绿。
- **改过 docs 再加一条**：`node scripts/wiki-check.js` —— 全 `docs/` 树的 Markdown 链接与锚点校验（断链 / 失效锚点）。**改 specs 页面、改文件名、改标题后必须跑**（见 §2.3）。仅改代码/测试时不需要。

### 3.2 测试坦克战斗

- 通过 dev server 打开 `tank_battle.html`。
- 用 HUD 中的「坦克选择」下拉从 `tanks/` 一型一文件列表（`api/tanks`）加载不同坦克配置到玩家/靶车，横向对比。

### 3.3 设计与测试坦克几何

- 通过 dev server 打开 `tank_designer.html`。
- 该工具可编辑车体/炮塔多边形、逐边装甲，并内置「甲弹对抗」测试（入射角/等效厚度/跳弹判定）。
- 设计器保存会写回 `tanks/<id>.json`（`POST /api/tanks/<id>`）；`tank_battle.html` / `tank_compare.html` 重新加载列表即可生效（`applyTankConfig()` 在 `js/tank_model.js`）。

### 3.4 脚本加载顺序（新增模块/脚本时注意）

浏览器端无模块系统，顶层函数与常量即全局。`tank_rules.js` 必须最先加载（其他模块在顶层引用 `RULES`）；`tank_utils.js` 在 `tank_geometry.js`/`tank_cover.js`/`tank_halfgeom.js` 之前（后两者复用 utils 的 `rotate`/`distToSegment`）；`tank_entity.js` 中声明的 `entities` 数组是全局唯一实例，不得重复声明。`tank_halfgeom.js` 提供 `normalizeBarrel`，在原型/设计器中都先于 `tank_model.js` 加载。新增共享模块时遵守「纯逻辑可 Node 测试、DOM 接线留页面」的分层约定。

### 3.5 大文档与大输出读取纪律（防 agent 死循环）

`docs/archive/` 归档分卷（单卷可达 ~230KB）与 `npm test` 输出远超单次工具调用的舒适吞吐。**约定：**

- **Grep 优先**：先用关键词/章节标题定位行号，再带 offset/limit 切片读取所需片段；**禁止对归档分卷全文读取**。
- **同一文件重复读取 ≤ 3 次**；需要跨节交叉核对时优先 Grep 而非多次全文。
- **测试输出**：验证只看退出码 + 尾部摘要/失败行，抽查具体断言用定向检索，不把完整输出灌进上下文。
- **子代理派发**：预消化证据进提示词、给停止条件与调用上限、只读调查类任务明确「不得修改任何文件」、不委派已完成的工作。

### 3.6 多 Agent 写域纪律（2026-10-19 起）

本项目的角色与写域**唯一权威是 `.dsh/skills/rogue-tank-roles/SKILL.md`**（索引）+ `.dsh/skills/role-*/SKILL.md`（6 张角色卡：combat / mapgen / systems / content / render-fx / verify-docs）。

> **历史沿革**：2026-09-13 起曾用 `.dsh/agents/*.md` 定义 14 个 specialist。**dsh 运行时不加载该目录**（它只发现 `.dsh/skills/`），那套定义自迁移起即为死配置，已于 2026-10-19 删除并转为 skill。不要再按 `@tank-combat`、`/task {agent:...}`、Tab 切 `orchestrator` 这类旧用法操作——dsh 的编排只有 `subagent` 工具与 Agent Teams 两条路。

**并行派发前必须确认：**

1. **写集合两两不相交**。同一批次内，`tank_battle.html` / `tank_bench.html` / **同一个 specs 卷（`docs/specs/<卷>/` 全部主题页 + 该卷的 `<卷>.md` 兼容页，视为一个不可分割的写单元）** 各只允许**一个**角色写；其余角色只交付 `js/` 模块。**跨卷并行**是允许的（如本批 combat / map / cards+boss+editor 三路并行）。
2. **`RULES` 只有一个写者**（`role-systems`）。需要新调参的角色提需求，不直接改 `js/tank_rules.js`。
3. **验证统一收口**：任何角色完成改动后不自称验证通过，由 `role-verify-docs` 跑三链（见 §3.1）。
4. **测试文件必须登记**：新增 `scripts/test-*.js` 时必须同时加入 `scripts/run-tests.js` 的 `TESTS` 数组——`check-html.js` 会以「孤儿测试」直接判红。

### 3.7 沙箱内验证的已知边界（2026-10-19 实测）

| 链 | 沙箱 workspace-write | 权限放宽后 |
|---|---|---|
| `npm run check`（语法 + tsc） | ✅ 全绿 | ✅ |
| `npm test`（57 项 Node 链，2026-10-26 实测；`scripts/run-tests.js` 登记数） | ⚠️ **57 通过 / 1 失败（控制台汇总报 58 项）**：唯一失败项 `scripts/test-asset-pipeline.js` 用 `spawnSync` **捕获**子进程输出（`tools/dump-cover-refs.mjs --check`、`covers-anchor-check.py`），管道 stdio 在 workspace-write 下报 EPERM、退出码为 `null`（已用 `node -e` 最小复现直接证明）。`run-tests.js` 自身已改文件句柄重定向故不依赖管道 | ✅ **58 通过 / 0 失败**（2026-10-26 在 full-access 实测） |
| `npm run test:browser`（四链） | ⚠️ 报 `spawn EPERM`（命名管道被禁）并输出 `INCONCLUSIVE` + 退出码 86 | ✅ 全绿 |

**不要把 `INCONCLUSIVE`/86 当成代码失败**；它明确表示环境未放开。历史上该噪音被误读为「浏览器链坏了」，导致多轮无效排查。

## 4. 架构要点

- **节点式地图**：游戏是节点式地图推进，不是无限波次。每个节点是独立、有边界的战场（详见 `docs/specs/map.md` §1）。
- **主副武器与主动技能**：坦克配置为 `weapons.primary` + `weapons.secondary` 单副武器槽；**左键/空格 = 主炮专属（`tryFirePrimary`，空格齐射）、`F`（按住连发）= 副武器击发（`tryFireSecondary`）**——2026-09-17 #C4e 起取消主/副切换（`activeWeaponSlot` 已移除）；**开关类副武器（`missile` 激活/取消、`mine_layer` 预形态/确认）的 F 一律走原生 `keydown` 边沿**，不得由主循环逐帧轮询（会每帧翻转，见 `docs/specs/combat.md` §8.2「开关类副武器 F 边沿口径」）；主动技能/装备**按 key 独立冷却**（`abilityCds[key]`，含 innate 修理箱/医疗包/灭火器）（详见 `docs/specs/combat.md` §4）。
- **召唤与部署**：固定炮塔/地雷/战术掩体/无人机注册进 `deployables`/`drones`，Boss summons 走同一敌对 AI（详见 `docs/specs/combat.md` §4）。
- **跳弹**：各弹种独立跳弹角（per-ammo `ammoBounceAngle`，65°~90°，AP 基准 >70°；noBounce 弹种如 HEAT/HE 系完全不跳弹；数值唯一口径 `docs/specs/combat.md` §3.2）。炮弹跳弹后沿命中面法线方向真实反射，可能造成二次命中；**二次跳弹不允许**。
- **掩体与地形系统**（现行值以 `docs/specs/map.md` §5.2 为准）：
  - `full`（全高）掩体与 `rock`（岩石）：确定性 100% 格挡直射实弹；岩石不可通行且挡弹。
  - `water`/`river`：炮弹越飞（`shellBlock: false`），坦克**减速通行（`passability: 0.4`，2026-09-14 重做）**；完全浸入触发溺毙倒计时（`RULES.drowning`，8s 沉没摧毁；**Boss 免疫**——2026-10-15 用户裁定，见 `docs/specs/map.md` §11），AI 具备避水绕行。
  - `mud`：炮弹越飞，坦克减速通行（0.4）。
  - `half`（半高）掩体**已整体删除**（2026-09-20 #E3 用户裁定）：`RULES.coverTiers.half` 定义、`RULES.heights.cover.half`、`getExposure` 的越掩插值、`shellBlock:'grad'` 拦截链与 `s.dec` 曝光缓存**全部移除**；`ruined`（残破建筑）归入全高确定性挡弹，`stump`/`rubble` 残骸不再挡弹。**现行 tier 全集与取值以 `RULES.coverTiers`（`js/tank_rules.js`）为唯一口径**，详见 `docs/specs/map.md` §12。
  - 路网：`placeRoadNetwork` **v4 七拓扑**（A 贯通 / B 十字 / C 单侧 T / E 双侧 T / D 双平行 / G 网格街区 / I 双干贯穿）+ `bakeNodeGroundLayer` 预烘焙 + 路口标线挖空；**可破坏楼房 tier `building`**（3 发 → `ruined` → `rubble`）（详见 `docs/specs/map.md` §10.1/§10.2、§13）。
  - 地图元素体系（树/灌木/栅栏/沙袋/残骸）：行为由 `RULES.coverTiers` 的 tier 描述，运行时 hp/残骸状态挂在 `covers` 实例上。
- **属性三层结构**：`base` / `modifiers` / `stats`（`computeStats` 先加后乘，战斗逻辑只读 `tank.stats`，不摸 `base`）。卡牌/Boss 阶段/局前永久升级/局内商店均经 modifiers 注入，scope 分 permanent/run/timed，run 结束统一清除；卡牌通道受 `RULES.parameterLimits` 硬限钳制（装填 ≥1.0s / 极速 ≤150km/h 参数通道硬限；#U40 2026-10-19 起 aimSpeed/trackLock/crit 聚合边界无条件钳制，抽卡侧 #U20 据同表达限过滤满级卡）。
- **实体注册表**：中央 `entities` 数组（`id`、`team`、`spawn` 快照）管理所有单位，通过 `isHostile` / `nearestEnemyTo` / `resetEntity` 统一操作，不写死玩家/敌人变量引用。

## 5. 当前状态与下一步（不在此维护清单，只给指针）

- **当前状态、批次史、长期债务**：见 `docs/DEVELOPMENT.md` §3（唯一维护点）。
- **待办与排期**：见 `docs/PLAN.md`。**`PLAN.md` 只存未完成项**——已完成批次一律删除并归档，不在其中保留完成情况记录。当前内容：**近期修复**（§6：**AA-b / AA-c**；AA-a 已于 2026-10-26 关闭）+ **近远期执行路线**（§2：R0 渲染地基 → A0 友军指挥 / R1 真 3D → G1 品质切片 → M1～M4）+ **友军指挥**（§3，单机六命令，排除多人）+ **既有远期模块**（§4）+ **分阶段 Steam 清单**（§5）。旧横向推进章节、AA-d 与 AA-a 已归档至 `docs/archive/2026-10.md`；渲染现行规划归 `docs/specs/map/rendering-roadmap.md`，不再以伪 3D 路线 A 为最终方向。
- **查系统现行口径**：先读 `docs/specs/<卷>/index.md`（卷首页导航），再进具体主题页。五卷（combat / map / cards / boss / editor）共 **67 个主题页**（2026-10-26 实测），每卷有 `index.md` + 主题页 + `changelog.md`。**不要直接读 `docs/specs/<卷>.md` 当正文**——那是 §N 兼容索引页（只放摘要 + 详见链接）。历史沿革看 `<卷>/changelog.md`。**specs 章节编号是外部契约，禁止重排**（见 §2.1）；改 specs 必读 `docs/WIKI-STYLE.md` 与 §2.3。
- **待处理问题**：见 `docs/ISSUES.md`（**当前存量 1 条：#AA3**，bench↔battle 运行时接线漂移，开工即 AA-b；**2026-10-26 AA-a 已关账三条**：#AA1 公路加成 HUD 低估一半 / #AA2 bench `aimPoint` 缺失（用户实机验收通过）/ #AA5 `specs/map/roads.md` 口径过期，见 `docs/DEVELOPMENT-batches-2026-10.md` §4.132；同日后批 bench 工具见 §4.133；原 **#AA4 制动与滑行模型**见 §4.130、细则 `docs/specs/map/terrain.md`「制动与滑行」。历史已核实问题见 `docs/ARCHIVE.md` 索引）。
- **历史已完成条目**：`docs/ARCHIVE.md` 索引表（按日期升序）→ `docs/archive/<yyyy-mm>.md` 分卷正文（严禁全文读取）。
