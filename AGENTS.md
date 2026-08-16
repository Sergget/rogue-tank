# Rogue Tank — Agent 工作指引

本文档是 OpenCode Agent 在本项目工作的高信号指引。包含：项目概览、文档分工与条目生命周期、开发工作流、架构要点、当前技术债。开始任何工作前请先通读。

## 1. 项目概览

- **类型**：节点式地图推进 + 局内得分驱动构筑 的战术坦克 Roguelike（俯视角 2D）。
- **核心原型**（均为单文件 HTML，内联大段脚本）：
  - `tank_mvp.html`：全屏 Canvas 战斗手感原型（装甲测试台，含实时弹道/掩体/靶车）。
  - `tank_designer.html`：多边形顶点编辑器（车体/炮塔几何、逐边装甲、炮管/炮盾、甲弹对抗测试）。
  - `tank_compare.html`：表格化坦克数据对比/编辑页。
- **共享模块**（`js/`，浏览器端以全局脚本按序加载、非 ES Module；每个模块底部带 `module.exports` 以支持 Node 测试）：
  - `tank_rules.js`：**机制参数唯一配置源**（RULES），必须最先加载，其他模块依赖它。
  - `tank_utils.js`：数学工具（norm/angDiff/gaussian/rotate/distToSegment/segRayIntersect/partCorners/partEdges/reflectDir），最先可加载的纯工具层。
  - `tank_geometry.js`：多边形/射线/命中部位（hullPoly/turretPoly/raycastTank/bestTankHit/moduleFromHit/gunRoot）。
  - `tank_model.js`：坦克配置与属性系统（makeTank/applyTankConfig/computeStats/SPREAD 散布/debuff 函数）。
  - `tank_physics.js`：命中时刻结算（resolveHit：入射角/等效厚度/跳弹/穿透/模块伤害）。
  - `tank_cover.js`：掩体/地图元素（covers 实例、概率遮挡、OBB 碰撞、破坏/残骸）。
  - `tank_entity.js`：实体注册表（entities 数组、spawnTank/isHostile/nearestEnemyTo/resolveTankCollisions）。
  - `tank_fx.js`：战斗特效（殉爆/履带断/起火/炮口闪光/命中特效/粒子）。
  - `tank_paint.js`：程序化坦克渲染（履带/阴影/俯视纹理），纯 ctx 显式传入、无 DOM 依赖。
  - `tank_battledraw.js`：mvp 战斗场景绘制层（drawTank/drawShells/drawCover/drawFoliage/车型标志等），仿 tank_fx.js ctx 显式传参；测试台专用块留在 mvp 不拆。
  - `tank_halfgeom.js`：半侧对称多边形几何 + 炮管规格归一化 `normalizeBarrel`（三个原型/设计器均加载，纯逻辑可 Node 测试）。
  - `tank_move.js`：统一坦克运动 `driveTank(t, dt, {turn, move})`（玩家/靶车/AI 共用，含掩体通行系数/起火与 debuff 乘数/碰撞推出/履带相位）+ `fireMul`。
  - `tank_listio.js`：坦克数据读写层（`tanks/` 一型一文件，fetch/save/delete + 无服务器时下载 fallback）。
  - `tank_presets.js`：炮管/炮盾预设表（`BARREL_PRESETS`/`MANTLE_PRESETS`，原设计器内联）。
  - `tank_schema.js`：坦克字段架构表（`FIELD_ROWS` + 枚举，designer/compare 共用单一来源）。
  - `tank_assets.js`：M0 贴图资产层（`ASSET_DEFS` 注册表 + Image 加载器 + 离屏烘焙缓存 + `drawAsset`/`drawAssetCanopy`，P-06；`tools/bake.html` 导出 PNG 到 `assets/`，无图回退程序化 bake）。
  - `tank_audio.js`：M1 声音占位系统（`SOUND_DEFS` 八键参数表 + 惰性 AudioContext + `playSound` 单入口，P-07；Web Audio 全合成、零资产）。
  - `tank_nodegen.js`：P-05 节点地图元素生成器（`NODE_TEMPLATES` 5 内置模板 + `generateNode(difficulty, {seed, templateId, scale})` 确定性生成，`scale` 选项把模板放大到大世界；纯逻辑可 Node 测试）。
  - `tank_camera.js`：摄像机跟随 + 视口剔除（`createCamera`/`updateCamera` 指数阻尼+世界边界钳制/`worldToScreen`·`screenToWorld` 互逆/`viewBounds`/`aabbInView`，P-08；纯逻辑可 Node 测试）。
  - `tank_flow.js`：全局游戏流程状态机（`createFlow`/`transition` 白名单转移/`watchFlow` 监听/`restartRun`，状态 map/battle/settlement/reward/gameover，P-08；纯逻辑可 Node 测试）。
  - `tank_map.js`：线性节点链生成 + 通关奖励评分 + 节点实体化（`generateRun`/`makeNode`/`scoreNode`（§4.5）/`materializeNode` 显式 env 注入，依赖 tank_nodegen + `RULES.nodeMap`，P-08；纯逻辑可 Node 测试）。
  - `tank_minimap.js`：小地图绘制层（布局纯函数 `minimapLayout`/`worldToMinimap`/`worldRectToMinimap` + `drawMinimap(ctx, opts)` 显式传参，P-08）。
  - `tank_cards.js`：卡牌系统（`CARD_RARITIES`/`CARD_TAGS`/6 类效果枚举 + `validateCard`/`applyCardEffects`/`drawCardChoices`/`cardStackCount`，P-09；纯逻辑可 Node 测试）。
  - `tank_boss.js`：Boss 系统（`validateBoss`/`bossStageFor` + 运行时 `makeBossEntity`/`applyBossStage`/`updateBossStage`，P-09；纯逻辑可 Node 测试）。
  - `tank_ai.js`：敌人/友军 AI 决策（`aiDecide`/`aiDecideEnemy`/`aiDecideAlly` 双态 + 消极防御，输出 `{turn, move, turretDesired, fire}`，P-10；纯逻辑可 Node 测试，依赖 `RULES.ai`）。
  - `tank_revive.js`：死亡/复活状态机（`findReviveSpot`/`reviveTank`/`canRevive`/`reviveAt` 满状态复活+无敌+友军据点旁随机点，P-11；纯逻辑可 Node 测试，依赖 `RULES.revive`）。

## 2. 文档分工（开始工作前必读）

**`PLAN.md` 与 `ISSUES.md` 是临时文档**：只存放"未验证/未完成"的工作，条目完成后即删除；`DEVELOPMENT.md` 是唯一的长期权威文档；被删除的条目原文归档进 `ARCHIVE.md`。

| 文档 | 角色 | 职责 | 更新时机 | 生命周期 |
|---|---|---|---|---|
| `DEVELOPMENT.md` | 长期权威 | 项目级策略：定型设计决策、系统状态、技术债、开放问题、下一步建议。 | 设计定型 / 系统实现 / 技术债偿还 / 结论落地时。 | 长期维护，唯一可信来源。 |
| `PLAN.md` | **临时** | 近期具体开发计划：特性/重构的执行方案、依赖、验证路径、决策清单。 | 规划近期工作，或更新进行中条目的状态（是计划，非承诺）。 | 条目实现并验证后**删除**。 |
| `ISSUES.md` | **临时** | **仅已核实的问题**：可复现证据（`file:line` + 场景）、根因、影响、状态（`待处理`/`处理中`/`已解决`）。 | 确认发现新问题（新增编号条目）或修复既有条目时。 | 修复验证有效后**删除**。 |
| `ARCHIVE.md` | 只读归档 | 从 PLAN/ISSUES 删除的完整条目**原文**（按删除日期分组，标注来源文档与条目编号）。 | 任意条目走完生命周期被删除时。 | 只增不删。 |
| `AGENTS.md`（本文件） | Agent 工作流 | 概览、命令、架构、文档分工与生命周期。 | 工作流或约定变化时。 | — |

**约定：**
- **绝不凭空发明"疑似但未证实"的问题**——先拿代码证据核实，再写入 `ISSUES.md`。
- **条目的 4 步生命周期（删除必走，缺一不可）** —— 当修复确认有效 / 功能实现并验证通过后：
  1. **同步**：先把结论写入 `DEVELOPMENT.md`（§2 定型设计 / §3 已实现系统 / §5.5 数值表 / §6 下一步顺序），确保 DEVELOPMENT.md 不依赖该条目也能独立说明；
  2. **删除**：从 `PLAN.md` / `ISSUES.md` 中删除对应条目；
  3. **归档**：将被删条目的**原文**追加到 `ARCHIVE.md`（标注来源文档、条目编号、删除日期）；
  4. **联动**：若结论影响后续规划顺序，同步更新 DEVELOPMENT.md §6。
- 未验证完成的条目**不得提前删除**（保持 `待处理`/`处理中` 状态即可）。
- 当对话确认了一个设计决策 / 完成了一个计划条目 / 修复了一个问题，**在收尾前走完 4 步生命周期**，避免决策只留在对话记录里。
- 若各文档描述冲突，以 `DEVELOPMENT.md` §2「已定型设计与决策」为准（ARCHIVE.md 仅供参考追溯，不参与判定）。

## 3. 关键开发工作流

### 3.1 启动原型（dev server — 必需，不可省略）

原型必须通过 HTTP 服务打开——它们会 `fetch('api/tanks')` 并加载共享的 `js/tank_paint.js`，两者在 `file://` 下都无法工作。

- 启动：`npm start`（或 `npm run dev`，或双击 `start.bat`）。
- 访问（默认端口 8000，可用 `PORT=9000` 覆盖）：
  - `http://127.0.0.1:8000/` → tank_mvp.html
  - `http://127.0.0.1:8000/tank_designer.html`
  - `http://127.0.0.1:8000/tank_compare.html`
- 校验：`npm run check` —— 对共享模块、`server.js` 及三个原型的每个内联 `<script>` 做语法冒烟（无需浏览器）；`node scripts/test-covers.js` —— 掩体/地图元素机制的 Node 端行为测试（两者都应全绿）。

### 3.2 测试坦克战斗

- 通过 dev server 打开 `tank_mvp.html`。
- 用 HUD 中的「坦克选择」下拉从 `tanks/` 一型一文件列表（`api/tanks`）加载不同坦克配置到玩家/靶车，横向对比。

### 3.3 设计与测试坦克几何

- 通过 dev server 打开 `tank_designer.html`。
- 该工具可编辑车体/炮塔多边形、逐边装甲，并内置「甲弹对抗」测试（入射角/等效厚度/跳弹判定）。
- 设计器保存会写回 `tanks/<id>.json`（`POST /api/tanks/<id>`）；`tank_mvp.html` / `tank_compare.html` 重新加载列表即可生效（`applyTankConfig()` 在 `js/tank_model.js`）。

### 3.4 脚本加载顺序（新增模块/脚本时注意）

浏览器端无模块系统，顶层函数与常量即全局。`tank_rules.js` 必须最先加载（其他模块在顶层引用 `RULES`）；`tank_utils.js` 在 `tank_geometry.js`/`tank_cover.js`/`tank_halfgeom.js` 之前（后两者复用 utils 的 `rotate`/`distToSegment`）；`tank_entity.js` 中声明的 `entities` 数组是全局唯一实例，不得重复声明。`tank_halfgeom.js` 提供 `normalizeBarrel`，在三个原型/设计器中都先于 `tank_model.js` 加载。

## 4. 架构要点

- **节点式地图**：游戏是节点式地图推进，不是无限波次。每个节点是独立、有边界的战场（详见 DEVELOPMENT.md §2.1）。
- **掩体系统**：
  - `full`（全高）掩体：确定性 100% 格挡。
  - `half`（半高）掩体：纯垂直剖面 + 越掩插值（炮塔恒露；车体中坦 0% 露/重坦 25%；攻击方贴掩体时车体弹道按射线高度插值越掩，DEVELOPMENT §2.5）。
  - 地图元素体系（树/灌木/栅栏/沙袋/残骸，DEVELOPMENT §2.7）：行为由 `RULES.coverTiers` 的 tier 描述，运行时 hp/残骸状态挂在 `covers` 实例上。
- **跳弹**：入射角 >70° 时炮弹沿命中面法线方向真实反射，可能造成二次命中；**二次跳弹不允许**。
- **属性三层结构**：`base` / `modifiers` / `stats`（`computeStats` 先加后乘，战斗逻辑只读 `tank.stats`，不摸 `base`）。基础结构已实现，卡牌/升级的接入尚未落地。
- **实体注册表**：中央 `entities` 数组（`id`、`team`、`spawn` 快照）管理所有单位，通过 `isHostile` / `nearestEnemyTo` / `resetEntity` 统一操作，不写死玩家/敌人变量引用。

## 5. 技术债 / 下一步（来自 DEVELOPMENT.md）

1. ~~**属性系统接线**~~：**已完成（P-12，2026-08-15）**——base/modifiers/stats 三层结构 + 修饰器 `scope` 生命周期分类（permanent/run/timed）+ `removeRunModifiers`；卡牌（P-09）与 Boss 阶段 modifier 标 `run`、run 结束清除（见 DEVELOPMENT.md §5.1/§3.12）。剩余：局外永久升级修饰器**内容**（M10）。
2. ~~**摄像机 + 节点地图 + 小地图**~~：**已完成（P-08，2026-08-15）**——`js/tank_camera.js`/`tank_map.js`/`tank_flow.js`/`tank_minimap.js`，含按难度随机生成节点内容（掩体布局/敌军构成/友军据点）与线性节点链流程（见 DEVELOPMENT.md §2.12/§3.7）。
3. ~~**敌人 AI 双态行为**（摄像机内主动 / 范围外被动、边缘贴近）+ 友军据点（消极防御、被摧毁、五折记分）~~ — **已完成（P-10，2026-08-15）**：`js/tank_ai.js`（`aiDecide` 双态 + 友军消极防御 + `RULES.ai` 参数）+ `hasLineOfSight` 视线遮挡 + `fireTank` 通用开火，Boss/summons 走同一敌对 AI（见 DEVELOPMENT.md §2.2/§3.10）。剩余：友军击杀五折记分（开放问题 4，非阻塞，留待经济里程碑）。
4. ~~**死亡/复活状态机**（永久死亡、复活次数、满状态复活于友军据点旁）~~ — **已完成（P-11，2026-08-15）**：`js/tank_revive.js`（满状态复活 + 友军据点旁随机点 + `RULES.revive.invulnSeconds`=3s 无敌）+ mvp 死亡判定（`canRevive`→复活 / 耗尽→gameover）+ 无敌闪烁视觉（见 DEVELOPMENT.md §2.3/§3.11）。剩余：局前购买追加复活次数（M10）。
