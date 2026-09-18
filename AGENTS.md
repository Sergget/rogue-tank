# Rogue Tank — Agent 工作指引

本文档是 Agent 在本项目工作的高信号指引。包含：项目概览、文档分工与条目生命周期、开发工作流、架构要点、当前状态指引。开始任何工作前请先通读；文档相关约定以本文件为唯一流程权威，系统内容以 `docs/DEVELOPMENT.md` 为唯一内容权威。

## 1. 项目概览

- **类型**：节点式地图推进 + 局内得分驱动构筑 的战术坦克 Roguelike（俯视角 2D），方向为技能系统 + 主副武器解耦 + 召唤部署物（详见 `docs/DEVELOPMENT.md` §1）。
- **核心页面**（均为单文件 HTML，内联大段脚本；共五页，`server.js` '/' 指向首页）：
  - `index.html`：首页封面路由（正式游戏 / 装甲测试台两卡片入口 + 设计器 / 对比链接）。
  - `tank_mvp.html`：正式游戏页（run 链路：Home 多存档 → Loadout → 商店 → 节点图 → 战斗/结算/卡牌/Boss/AI/复活/经济/小地图；开发者面板 `#devPanel`、日志面板、流程覆盖层 `#flowOverlay`）。
  - `tank_bench.html`：装甲测试台独立页（player + dummy 靶车、发射解算面板、靶场控制台、Enemy Lab、卡牌测试）。
  - `tank_designer.html`：多边形顶点编辑器（车体/炮塔几何、逐边装甲、炮管/炮盾、甲弹对抗测试）。
  - `tank_compare.html`：表格化坦克数据对比/编辑页。
- **共享模块**（`js/`，浏览器端以全局脚本按序加载、非 ES Module；每个模块底部带 `module.exports` 以支持 Node 测试）：
  - `tank_rules.js`：**机制参数唯一配置源**（RULES），必须最先加载，其他模块依赖它。
  - `tank_utils.js`：数学工具（norm/angDiff/gaussian/rotate/distToSegment/segRayIntersect/partCorners/partEdges/reflectDir），最先可加载的纯工具层。
  - `tank_geometry.js`：多边形/射线/命中部位（hullPoly/turretPoly/raycastTank/bestTankHit/moduleFromHit/gunRoot）。
  - `tank_model.js`：坦克配置与属性系统（makeTank/applyTankConfig/computeStats 三层属性/SPREAD 散布/debuff 函数/parameterLimits 钳制）。
  - `tank_physics.js`：命中时刻结算（resolveHit：入射角/等效厚度/跳弹/穿透/模块几何概率分区伤害）。
  - `tank_cover.js`：掩体/地图元素（covers 实例、概率遮挡、OBB/compound 凸包碰撞、破坏/残骸/水体溺毙判定）。
  - `tank_entity.js`：实体注册表（`entities` 数组全局唯一实例、spawnTank/isHostile/nearestEnemyTo/resolveTankCollisions/resetEntity）。
  - `tank_weapons.js`：主/副武器定义与运行时（`WEAPON_DEFAULTS` 双槽缺省表、`updateSecondaryWeapon` 分发 mortar/missile/rocket/mine_layer/turret 五类副武器、`updateMissileLock`）。
  - `tank_fire.js`：开火通用层（fireTank 通用开火 + `tryFirePrimary`（左键/空格=主炮专属，salvo 齐射）/`tryFireSecondary`（F=副武器击发）双入口 + `primaryWeaponSpec`/`firePrimaryShell` + stepShells：曳光/近炸引信/溅射/掩体交互；经 computeAmmoConfig 接入卡牌弹种改造）。
  - `tank_abilities.js`：主动能力统一入口（`tryActivateAbility`：runtime 键 artillery/shield/overdrive/deploy_cover/super_fire_control/super_speed/recon 与 innate 键 repair/medkit/extinguish **统一按 key 独立冷却池 `abilityCds[key]`**，逐帧 `updateAbilityCds`；旧共享字段 `abilityCdT`/`updateAbilityCd` 为废弃兼容助手）。
  - `tank_shield.js`：累计吸收护盾（applyShield/入射角吸收判定）；`tank_strike.js`：延迟 AOE 炮击（callStrike：circle/point/carpet 三形状/updateStrikes）。
  - `tank_deployables.js`：战场部署物注册表（`deployables`：固定炮塔/地雷/战术掩体，spawn/update/duration 生命周期 + mineExplode 事件）。
  - `tank_drone.js`：伴随无人机体系（模块级 `drones` 数组单一数据源，scout 侦察/striker 打击两型，countMax 上限）。
  - `tank_cards.js`：卡牌系统（CARD_RARITIES/CARD_TAGS/效果类型 + `validateCard`/`applyCardEffects`/`drawCardChoices` 含装备优先保底与 `cardEligible` 资格过滤/`cardStackCount`）。
  - `tank_boss.js`：Boss 系统（validateBoss/bossStageFor + makeBossEntity/applyBossStage/updateBossStage，缩放整体替换不污染共享 spec）。
  - `tank_ai.js`：敌人/友军 AI 决策（`aiDecide` 双态 + 受击警觉/避水/找掩体 coverSeek + 消极防御，输出 `{turn, move, turretDesired, fire}`）。
  - `tank_revive.js`：死亡/复活状态机（满状态复活 + 无敌 + 友军据点旁随机点，依赖 `RULES.revive`）。
  - `tank_economy.js`：经济/存档/多存档槽位（元索引 + 槽位键 CRUD + migrateLegacySave；UPGRADE_DEFS 永久升级树 + scoreToPoints/buyUpgrade/applyUpgrades/buyExtraRevive）。
  - `tank_nodegen.js`：节点地图元素生成器（7 内置模板 + `generateNode(difficulty,{seed,templateId,scale})` 确定性生成 + placeRoadNetwork 路网 v2 六拓扑 + 重叠消解）。
  - `tank_map.js`：线性节点链生成 + 难度曲线 + 节点实体化（generateRun/makeNode/scoreNode/materializeNode）。
  - `tank_flow.js`：全局流程状态机（map/battle/settlement/reward/gameover + home/loadout/shop，白名单转移 + watchFlow）。
  - `tank_camera.js` / `tank_minimap.js`：摄像机跟随与视口剔除 / 小地图绘制（均纯逻辑可 Node 测试）。
  - `tank_battledraw.js`：mvp 战斗场景绘制层（drawTank/drawShells/drawCover/drawFoliage/部署物绘制），ctx 显式传参。
  - `tank_fx.js` / `tank_paint.js` / `tank_dmgtext.js`：战斗特效 / 程序化坦克渲染 / 伤害飘字（纯 ctx，无 DOM 依赖）。
  - `tank_assets.js` / `tank_audio.js`：贴图资产层（ASSET_DEFS + 离屏烘焙缓存） / 声音系统（SOUND_DEFS + 惰性 AudioContext，全合成零资产）。
  - `tank_bindings.js`：**键位唯一数据源**（KEY_BINDINGS/ACTION_INFO + createInputController 统一 keydown/keyup + describeBindings + loadSettings/saveSettings）。
  - `tank_panels_core.js` / `tank_panels_dom.js` / `tank_panels.js`：面板分层（纯核心 + 卡牌事务 snapshotCardTx/rollbackCardTx + parameterClamp / DOM 适配 / 门面）。
  - `tank_sim.js`：回放代理玩家 harness（仅测试链使用，不影响正式游戏）。
  - `tank_halfgeom.js` / `tank_move.js` / `tank_listio.js` / `tank_presets.js` / `tank_schema.js` / `tank_screens.js`：半侧对称几何+normalizeBarrel / 统一运动 driveTank / tanks/ 读写 / 炮管炮盾预设 / 字段架构表 / 覆盖层 UI 纯逻辑视图模型。

## 2. 文档分工与条目生命周期（开始工作前必读）

（**分卷结构**：`docs/` 目录收纳四份主文档（DEVELOPMENT / PLAN / ISSUES / ARCHIVE）+ `specs/` 五卷系统规范；`AGENTS.md` 位于仓库根目录供 Agent 自动发现。归档正文按月分卷至 `docs/archive/`，任何 agent **严禁全文读取归档分卷**——按 `ARCHIVE.md` 索引定位后 Grep 切片。拆分前原文快照：`docs/archive/2026-08-development-full-snapshot.md`。）

| 文档 | 角色 | 职责 | 更新时机 | 生命周期 |
|---|---|---|---|---|
| `docs/DEVELOPMENT.md` | 长期权威 | §0 文档体系索引与目录 / §1 核心方向 / §2 架构演进 / §3 当前状态与下一步 / **§4 批次落地结论（4.1~4.x 按编号递增）**。 | 每个批次实现并验证后新增一个 §4.x 编号条目；路线顺序变化时更新 §3。 | 长期维护，唯一内容权威；§4 只增不回改（被推翻的旧结论以注记指向新节，不删原文）。 |
| `docs/specs/*.md` | 系统子文档 | 各系统规范的**现行口径唯一权威**：combat（战斗/弹种/能力/AI/特效/音频）/ map（地图/掩体/路网/水域）/ cards（卡牌）/ boss / editor（编辑器工具链）。 | 对应系统设计定型或实现落地时。 | 长期维护；旧值被取代时加「已被 X 取代」注记后改写为现行值。 |
| `docs/PLAN.md` | **临时** | 近期待办与计划：待办总览表 + 执行方案（是计划，非承诺）。 | 规划近期工作或更新条目状态时。 | 条目实现并验证后**删除并归档**；只保留未完成项。 |
| `docs/ISSUES.md` | **临时** | **仅已核实的问题**：每条必须有 `file:line` 证据、根因/影响、复现条件、状态（`待处理`/`处理中`）。 | 确认新问题（新增编号条目）或修复既有条目时。 | 修复验证有效后**删除并归档**。 |
| `docs/ARCHIVE.md` | 只读归档索引 | 完结条目**索引表**（按日期升序）+ 分卷链接；正文在 `docs/archive/<yyyy-mm>.md`。 | 条目走完生命周期被删除时。 | 只增不删；新行加表尾；主文件保持极小。 |
| `AGENTS.md`（本文件） | Agent 工作流 | 概览、命令、架构、文档分工与生命周期。 | 工作流、目录结构或约定变化时（至少每次大整理后同步）。 | 长期维护。 |

**条目编号规则**：ISSUES 问题按批次字母编号（`#A`/`#B`/`#C`…）+ 会话内递增（#A1、#B6、#C1…），编号不复用、跨批次延续；归档与 DEVELOPMENT 引用时保留原编号以便追溯。

### 2.1 文档一致性纪律（防冲突/重复/过期）

- **权威单向归口**：系统**现行细则**只写在 `docs/specs/<system>.md`；`DEVELOPMENT.md` §4 只留简结论 + 「细则归口 specs/x.md §y」指针；**禁止把临时文档（PLAN/ISSUES）当作权威引用目标**——引用它们的章节会被重写/删除，引用已归档问题应改指 `docs/archive/<yyyy-mm>.md`。
- **被推翻的设计不静默删除**：主文档 §4 历史条目保持原文 + 加「已被 §4.x/§y 取代」注记；specs 内旧数值改写为现行值并在原处留沿革注记。读者应能只读 specs 就得到现行口径，只读 DEVELOPMENT §4 就能追溯演进。
- **同文档内禁止重复罗列数值**：同一数值/参数表只允许一个「唯一口径」小节（如 combat.md §3.2 弹种总表），其余位置一律指向它。
- **统计数字必须实测**：文档中的统计数字（卡牌数量/分布等）标注实测日期；引用过期数字前先重跑对应脚本（如 `node scripts/audit-content.js`）。
- **模糊词禁用**：章节标题与结论禁止「本轮/本批」无日期锚点的写法；一律带 yyyy-mm-dd（或月份）锚点。

### 2.2 条目的 4 步生命周期（删除必走，缺一不可）

当修复确认有效 / 功能实现并验证通过后：

1. **同步**：先写结论——① `docs/specs/<system>.md`（战斗→combat / 地图→map / 卡牌→cards / Boss→boss / 编辑器→editor）写**现行细则**；② `docs/DEVELOPMENT.md` 新增一个 §4.x 编号条目（简结论 + specs 归口指针 + 三链验证记录），确保不依赖 PLAN/ISSUES 也能独立说明项目状态。
2. **删除**：从 `docs/PLAN.md` / `docs/ISSUES.md` 中**完全删除**对应条目。
3. **归档**：将被删条目**原文**追加到当月分卷 `docs/archive/<yyyy-mm>.md` 底部（标注来源文档、条目编号、删除日期），并在 `docs/ARCHIVE.md` 索引表**表尾**加一行（日期升序）。
4. **联动**：若结论影响后续规划顺序，同步更新 `DEVELOPMENT.md` §3（待办与下一步）与 `PLAN.md` §1（待办总览表）。

**约定：**
- **绝不凭空发明"疑似但未证实"的问题**——先拿代码证据（`file:line`，必要时定向复现）核实，再写入 `docs/ISSUES.md`。
- 未验证完成的条目**不得提前删除**（保持 `待处理`/`处理中` 状态即可）。
- 当对话确认了一个设计决策 / 完成了一个计划条目 / 修复了一个问题，**在收尾前走完 4 步生命周期**，避免决策只留在对话记录里。
- 若各文档描述冲突，判定顺序：**现行口径以 `docs/specs/<system>.md` 为准；演进顺序与状态以 `DEVELOPMENT.md`（§3 > §4 后条目）为准**；`docs/ARCHIVE.md` 与归档分卷仅供追溯，不参与现行判定。
- 每次大整理/批量审计后，**同步检查本文件（AGENTS.md）是否与 docs/ 现状脱节**（表结构、章节号、卷名）。

## 3. 关键开发工作流

### 3.1 启动原型（dev server — 必需，不可省略）

原型必须通过 HTTP 服务打开——它们会 `fetch('api/tanks')` 并加载共享的 `js/` 模块，两者在 `file://` 下都无法工作。

- 启动：`npm start`（或 `npm run dev`，或双击 `start.bat`）。
- 访问（默认端口 8000，可用 `PORT=9000` 覆盖）：
  - `http://127.0.0.1:8000/` → index.html（首页路由）
  - `http://127.0.0.1:8000/tank_mvp.html`（正式游戏）/ `tank_bench.html`（装甲测试台）
  - `http://127.0.0.1:8000/tank_designer.html`
  - `http://127.0.0.1:8000/tank_compare.html`
- 校验：`npm run check` —— 对共享模块、`server.js` 及五个页面的每个内联 `<script>` 做语法冒烟 + typecheck（无需浏览器）；`npm test` —— 全套 Node 测试链；`npm run test:browser` —— 浏览器冒烟（需系统 Edge，playwright-core 无头）。三者都应全绿。

### 3.2 测试坦克战斗

- 通过 dev server 打开 `tank_mvp.html`。
- 用 HUD 中的「坦克选择」下拉从 `tanks/` 一型一文件列表（`api/tanks`）加载不同坦克配置到玩家/靶车，横向对比。

### 3.3 设计与测试坦克几何

- 通过 dev server 打开 `tank_designer.html`。
- 该工具可编辑车体/炮塔多边形、逐边装甲，并内置「甲弹对抗」测试（入射角/等效厚度/跳弹判定）。
- 设计器保存会写回 `tanks/<id>.json`（`POST /api/tanks/<id>`）；`tank_mvp.html` / `tank_compare.html` 重新加载列表即可生效（`applyTankConfig()` 在 `js/tank_model.js`）。

### 3.4 脚本加载顺序（新增模块/脚本时注意）

浏览器端无模块系统，顶层函数与常量即全局。`tank_rules.js` 必须最先加载（其他模块在顶层引用 `RULES`）；`tank_utils.js` 在 `tank_geometry.js`/`tank_cover.js`/`tank_halfgeom.js` 之前（后两者复用 utils 的 `rotate`/`distToSegment`）；`tank_entity.js` 中声明的 `entities` 数组是全局唯一实例，不得重复声明。`tank_halfgeom.js` 提供 `normalizeBarrel`，在原型/设计器中都先于 `tank_model.js` 加载。新增共享模块时遵守「纯逻辑可 Node 测试、DOM 接线留页面」的分层约定。

### 3.5 大文档与大输出读取纪律（防 agent 死循环）

`docs/archive/` 归档分卷（单卷可达 ~230KB）与 `npm test` 输出远超单次工具调用的舒适吞吐。**约定：**

- **Grep 优先**：先用关键词/章节标题定位行号，再带 offset/limit 切片读取所需片段；**禁止对归档分卷全文读取**。
- **同一文件重复读取 ≤ 3 次**；需要跨节交叉核对时优先 Grep 而非多次全文。
- **测试输出**：验证只看退出码 + 尾部摘要/失败行，抽查具体断言用定向检索，不把完整输出灌进上下文。
- **子代理派发**：预消化证据进提示词、给停止条件与调用上限、只读调查类任务明确「不得修改任何文件」、不委派已完成的工作。

## 4. 架构要点

- **节点式地图**：游戏是节点式地图推进，不是无限波次。每个节点是独立、有边界的战场（详见 `docs/specs/map.md` §1）。
- **主副武器与主动技能**：坦克配置为 `weapons.primary` + `weapons.secondary` 单副武器槽；**左键/空格 = 主炮专属（`tryFirePrimary`，空格齐射）、`F`（按住连发）= 副武器击发（`tryFireSecondary`）**——2026-09-17 #C4e 起取消主/副切换（`activeWeaponSlot` 已移除）；主动技能/装备**按 key 独立冷却**（`abilityCds[key]`，含 innate 修理箱/医疗包/灭火器）（详见 `docs/specs/combat.md` §4）。
- **召唤与部署**：固定炮塔/地雷/战术掩体/无人机注册进 `deployables`/`drones`，Boss summons 走同一敌对 AI（详见 `docs/specs/combat.md` §4）。
- **跳弹**：各弹种独立跳弹角（per-ammo `ammoBounceAngle`，65°~90°，AP 基准 >70°；noBounce 弹种如 HEAT/HE 系完全不跳弹；数值唯一口径 `docs/specs/combat.md` §3.2）。炮弹跳弹后沿命中面法线方向真实反射，可能造成二次命中；**二次跳弹不允许**。
- **掩体与地形系统**（现行值以 `docs/specs/map.md` §5.2 为准）：
  - `full`（全高）掩体与 `rock`（岩石）：确定性 100% 格挡直射实弹；岩石不可通行且挡弹。
  - `water`/`river`：炮弹越飞（`shellBlock: false`），坦克**减速通行（`passability: 0.4`，2026-09-14 重做）**；完全浸入触发溺毙倒计时（`RULES.drowning`，8s 沉没摧毁），AI 具备避水绕行。
  - `mud`：炮弹越飞，坦克减速通行（0.4）。
  - `half`（半高）掩体：纯垂直剖面 + 越掩插值；**D5 裁定生成期已屏蔽**（仅残破建筑 `ruined` 共享其剖面），剥离延后待实测数据。
  - 路网：`placeRoadNetwork` v2 六拓扑 + `bakeNodeGroundLayer` 预烘焙 + 路口标线挖空（详见 `docs/specs/map.md` §10.1/§10.2）。
  - 地图元素体系（树/灌木/栅栏/沙袋/残骸）：行为由 `RULES.coverTiers` 的 tier 描述，运行时 hp/残骸状态挂在 `covers` 实例上。
- **属性三层结构**：`base` / `modifiers` / `stats`（`computeStats` 先加后乘，战斗逻辑只读 `tank.stats`，不摸 `base`）。卡牌/Boss 阶段/局前永久升级/局内商店均经 modifiers 注入，scope 分 permanent/run/timed，run 结束统一清除；卡牌通道受 `RULES.parameterLimits` 硬限钳制（装填/极速）。
- **实体注册表**：中央 `entities` 数组（`id`、`team`、`spawn` 快照）管理所有单位，通过 `isHostile` / `nearestEnemyTo` / `resetEntity` 统一操作，不写死玩家/敌人变量引用。

## 5. 当前状态与下一步（不在此维护清单，只给指针）

- **当前状态、批次史、长期债务**：见 `docs/DEVELOPMENT.md` §3（唯一维护点）。
- **待办与排期**：见 `docs/PLAN.md`（§1 待办总览 / §2 非阻塞遗留 / §3 开发者面板方案 / §4 反馈批次完成情况）。
- **待处理问题**：见 `docs/ISSUES.md`（现存 #C5：mvp⇄bench UI/按键统一 + 开发者面板细化）。
- **历史已完成条目**：`docs/ARCHIVE.md` 索引表（按日期升序）→ `docs/archive/<yyyy-mm>.md` 分卷正文（严禁全文读取）。
