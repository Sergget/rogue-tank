# 战术坦克 Roguelike — 开发主文档

> 本文档是**长期内容权威**：§0 文档体系索引与目录 / §1 核心方向 / §2 架构演进 / §3 当前状态与下一步 / §4 批次落地结论（按编号升序）。
> 系统**现行细则**归口 `docs/specs/` 五卷（combat / map / cards / boss / editor）；临时文档（`PLAN.md` / `ISSUES.md`）只存未完成项；历史条目见 `docs/ARCHIVE.md` 索引 → `docs/archive/<yyyy-mm>.md`（**严禁全文读取**，按索引 Grep 切片）。
> 文档分工、条目生命周期与冲突判定顺序见根目录 `AGENTS.md` §2。

---

## 0. 文档体系索引与目录

| 文档 | 角色 | 内容 |
|---|---|---|
| `docs/DEVELOPMENT.md`（本文档） | 长期内容权威 | 文档索引、核心方向、架构演进、当前状态与下一步（§3）、批次落地结论（§4 按编号升序） |
| `docs/specs/combat.md` | 系统规范 | 装甲/跳弹、弹种系统（§3 升级链与数值总表）、能力/副武器、AI 激活、特效、音频、HUD |
| `docs/specs/map.md` | 系统规范 | 节点地图 / 掩体与地形类型抽象 / 路网 / 水域溺毙 / 元素生成与校准 |
| `docs/specs/cards.md` | 系统规范 | 卡牌数据契约 / 效果类型 / 稀有度分层 / 设计定稿 / 装备优先抽卡 |
| `docs/specs/boss.md` | 系统规范 | Boss 数据契约 / 阶段机制 / 数据驱动行为 / 激光与召唤 |
| `docs/specs/editor.md` | 系统规范 | 设计器 / 对比页 / 字段架构 / 烘焙工具 / 涂装规范 / 开发者面板 |
| `docs/PLAN.md` | 临时 | 只存**未完成**的近期待办与计划（是计划，非承诺） |
| `docs/ISSUES.md` | 临时 | 只存**待处理 / 处理中**的已核实问题（每条须有 `file:line` 证据） |
| `docs/ARCHIVE.md` | 只读索引 | 完结条目索引表 → `docs/archive/<yyyy-mm>.md` 分卷正文 |

**目录**：§1 核心方向 · §2 架构演进 · §3 当前状态与下一步 · §4 批次落地结论（§4.1~§4.119；§4.1~§4.39 正文见归档快照与月度分卷，§4.40–§4.119 正文见 `DEVELOPMENT-batches-2026-10.md`）

> **§4 编号说明（2026-09-23 文档整改）**：§0~§3 与 §4.1~§4.26 的**逐条正文**曾于 2026-09-22 提交 `994bdfd` 随 §4.27~§4.33 一并从本文件移除，且该次漏走 `AGENTS.md` §2.2 第 3 步「原文归档」（276 行原文未进归档分卷）。2026-09-23 整改已将该原文快照**补归档**至 `docs/archive/2026-09.md`（见 `docs/ARCHIVE.md` 索引 2026-09-23 行），本文件重建精简骨架并保留下方**§4 编号索引表**，使全部历史交叉引用可解析。
> **续写规则**：新增批次一律在 §4 正文末尾按编号递增续写（**当前最大编号 §4.154**）；§4 正文只增不回改，被推翻的旧结论以注记指向新节。

---

## 1. 核心方向

**类型**：节点式地图推进 + 局内得分驱动构筑 的战术坦克 Roguelike（俯视角 2D）。每个节点是一块独立、有边界的战场。

**核心改动方向**（2026-09-08 起定型，持续有效）：

1. **武器分化与双槽位**：坦克配置由单一主炮扩充为「主武器」（标准 / 双管 / 自动炮 / 电磁轨道炮 / 弹夹炮）+「副武器·挂载」（迫击炮、导弹、火箭弹、地雷布撒器、副炮塔）解耦，副武器单槽。
2. **主动技能与模组化**：超级火控、超级速度、超装填、战术呼叫（炮击）、战术护盾、主动防御系统（APS）等主动技能，**按 key 独立冷却**（`abilityCds[key]`）。
3. **召唤与部署系统**：侦察/打击无人机、固定炮塔、战术掩体、布雷，统一注册进 `deployables` / `drones`，Boss 召唤走同一敌对 AI。
4. **节点式推进与局内构筑**：近线性开放式节点链 + 卡牌三选一 + 局内商店与局外永久升级双账本；构筑与难度均经 `base` / `modifiers` / `stats` 三层属性注入。

---

## 2. 架构演进

- **分层约定**：共享逻辑放 `js/`（浏览器端以全局脚本按序加载、**非 ES Module**，每个模块底部带 `module.exports` 以支持 Node 测试）；DOM 接线留页面。机制参数**唯一配置源** `js/tank_rules.js`（`RULES`），必须最先加载。
- **战斗管线**：`tank_fire.js`（开火通用层 + `stepShells`）→ `tank_physics.js`（`resolveHit` 命中结算）→ `tank_cover.js`（掩体/地形）/ `tank_shield.js`（护盾吸收）→ `tank_battledraw.js`（绘制层）。
- **实体与召唤**：`tank_entity.js` 中央 `entities` 注册表；部署物 `tank_deployables.js`（炮塔/地雷/掩体）；无人机 `tank_drone.js`。
- **地图与流程**：`tank_nodegen.js`（元素生成器）→ `tank_map.js`（节点链 / 难度曲线 / 实体化）→ `tank_flow.js`（全局状态机）；`tank_camera.js` / `tank_minimap.js` 为视口与小地图纯逻辑。
- **AI 与 Boss**：`tank_ai.js`（双态决策 + 受击警觉 + 找掩体）→ `tank_boss.js`（阶段/激光/召唤/行为风格）。
- **UI 与工具**：`tank_panels_core.js` / `tank_panels_dom.js` / `tank_panels.js` 三层 + `tank_devpanel.js`（开发者面板，battle/bench **两页同源**）；`tank_bindings.js` 为键位唯一数据源。
- 完整模块清单、加载顺序与依赖约束见根目录 `AGENTS.md` §1 / §3.4。

---

## 3. 当前状态与下一步

（**本节为当前状态、批次史与长期债务的唯一维护点**；待办清单归 `docs/PLAN.md`。）

### 3.1 当前状态（截至 2026-10-28）

- **用户 2026-10-24 反馈批次已全部收口（2026-10-26，AA-a~d）**：`docs/ISSUES.md` **无存量条目**。① **AA-a**（§4.132）：HUD 公路加成改走纯函数 `roadBonusKmh()`（与 `tankKmh` 同源）、bench `fireCtx` 补 `aimPoint`、`specs/map/roads.md` 公路豁免口径改写为「只豁免 liquid/mud」；② **AA-b**（§4.136）：bench ↔ battle 开火接线七项对齐（`cam` / `emitShotNoise` no-op / `resolveHit` 5 参透传 + Boss 弱点层 / 急速射 / 砰砰炮 / 无人机 / 曲射散布圈）+ F 键改原生边沿（**轮询保留**给连发类），防回潮靠 **battle `fireCtx` 键集 ⊆ bench 键集**（50 ⊆ 51，`test-bench-parity.js` 30 断言）；③ **AA-c**（§4.137）：电磁炮三段声学（充能循环走代码驱动持久实例、`RULES.railgunFx.audio` 唯一口径、就绪 `SOUND_DEFS.railReady`、开火复用 `firerail`），顺带删除 `startEngineSound` 死代码；④ **AA-d**（§4.130）：制动与滑行独立通道。
- **HUD 与 bench 工具（2026-10-26，§4.133~§4.135）**：HUD 文本统一补深色底衬（目标卡 11px / `bottom:92px` / 日志让位、提示条、三个仪表区、顶部中央读出、FPS），**速度条已删除**（只留精确数字，避免「读数越过满格」误读）；bench Enemy Lab 新增「清空所有敌人」（`clearEnemyEntities` 纯筛选）与生成点视口护栏（`clampSpawnIntoView`，视口半高仅 `vh/2/zoom`）；bench 内图鉴入口整块移除（图鉴唯一宿主 `tank_codex.html`）。
- **R0 渲染地基（2026-10-27，§4.147）**：I3 三场景截图基线（`npm run baseline`：standard/boss/survival，冻结首帧 + 32×18 网格容差 + PNG 对照图）、I4 拾取唯一入口 `pointerToWorld`（battle 鼠标/滚轮与 bench 鼠标全改走它）、性能计数 `js/tank_perf.js` + `__TEST__.perf()/mem()/battleStartMs()`。A0/R1/G1 的共用前置已就位；不改正式战斗表现。
- **A0 友军指挥闭环（2026-10-27，§4.148/§4.151/§4.152）**：纯逻辑层 `js/tank_ally_command.js`（**三命令 follow/move/focus**、任务快照、状态机、编队规格；六命令版本当日按用户裁定简化）；**决策与击发读同一权威目标**（`allyFireTargetFor`：focus 只认任务目标、move 打最近、follow 打随机可攻击目标）；battle 每节点生成 2 辆指挥友军（Boss 1 辆），**标准模式不再预生成「友军据点」**（`noOutpost`）、**Z/X/C 直接快捷键**（命令转盘暂时关闭，卡牌查看器改 B）、HUD 队伍列表 + 世界标记 + 2 秒反馈；`RULES.allyCommand` 唯一参数口径。敌军仍只把玩家当主目标（A1/A2 处理）。
- **R1 真 3D 可玩切片（2026-10-27，§4.149/§4.151）**：`tank_3d.html` 用原生 WebGL1（零依赖）渲染同一套二维模拟——1440×864 小战场、6 敌 + 2 友军、轻倾斜固定 yaw 相机、屏幕射线地面拾取、主炮可连续开火（主循环驱动装填/武器状态机）、Z/X/C 友军命令、掩体破坏触发静态几何重建、命中烟尘、右上 **F1 验收清单**；`js/tank_render3d.js` + `js/tank_scene3d.js`。PBR/阴影/LOD/资产管线与可旋转相机未做（G1 门内）。**用户 2026-10-27 实机验收通过。**
- **G1 3D 品质切片（2026-10-27 §4.154 / 2026-10-28 §4.155·§4.156）**：§4.154 = `npm run baseline:3d` 场景基线 + 载具**视觉**俯仰/侧倾/后坐弹跳 + 履带扬尘 + 开火/命中/破坏震屏 + 3D 音频接入。**完整遭遇的机制已于 2026-10-28 完成（§4.155）**，但**「3～5 分钟」的时长目标 [PLACEHOLDER 未达标]**——同日实测 24.7～41.4s（`node scripts/measure-encounter.cjs`，见 `docs/ISSUES.md` #AB10/#AB11）：纯逻辑层 `js/tank_encounter.js` 的波次状态机（`telegraph→wave→breather→victory/defeat` + 七类事件）+ 三波编成（侦察分队 / 分进合击 / 装甲合围）+ `RULES.encounter` 唯一参数口径；页面只做生成与演出。**1080p/Deck 性能预算与降级已于 2026-10-28 完成（§4.156）**：`js/tank_perf.js` 门控（帧时间 EMA + 逐级升降）+ `RULES.perf` 三档参数，降级只动表现（分辨率 → 环境粒子 → 战斗粒子 → 静态重建频率），模拟层红线不动；三档基线拆分 + 浏览器第八链。**仍待做**：精修单车与单主题场景（资产管线）、载具手感第二轮（侧滑/坡面/悬挂落地/碰撞反馈）。
- **测试链**：**68 个 `scripts/test-*.js` + `validate-content.js` = 69 项登记**（2026-10-28 实测：`npm test` **69 通过 / 0 失败**；§4.155 新增 `scripts/test-encounter.js`，§4.156 沿用已登记的 `scripts/test-perf.js` 扩写到 68 条断言、其中新增 53 条）。新增形态门 `test-qa.js`：每个测试脚本必须 `require` `tank_utils` + `tank_rules` 且有 `ok/fails` 骨架。**浏览器链为八链**（2026-10-28 实测 `npm run test:browser` 全绿：smoke / r3 / run / r4 / ally / 3d / encounter / **perf**，第八链 `scripts/test-browser-perf.cjs` 由 §4.156 新增）；`npm run check` EXIT=0。**渲染基线**单独走 `npm run baseline`（`scripts/browser-baseline.cjs`，默认 `--check`）；3D 基线按档拆三份，`npm run baseline:3d --all`（同义 `baseline:3d:all`）一次跑 720p / 1080p / deck。
- **技术栈定性（2026-10-24 用户纠正，§4.125）**：**零依赖 / `file://` 直开 / Node 像素回归不是硬约束，只是目前的临时选择**。真 3D（WebGL/Three.js）**未被架构排除**；本阶段不做的理由是缺 3D 美术管线与玩法收益未证实。唯一口径 `specs/map/pseudo-3d-2p5d.md` §3.1。
- **视野-隐蔽机制（2026-10-24 P1 落地，§4.128）**：三个结构性缺陷已补两条半——① `hasLineOfSight` 从 **`vision` 布尔**改为**高度分档**（`coverTiers[*].height` 18/18 键为唯一口径；判据 `height ≥ min(eyeZ,targetZ)`；用户选 C 方案 `LOS_HULL_Z=1.0m` ⇒ **灌木挡车体、不挡炮塔**，hull-down 成立）；② 隐蔽加成从「相交即满额」改为**按覆盖深度折算**（中心满额/边缘半额）；③ 隐蔽对称化**保留接入未启用**（`RULES.camouflage.symmetric=false` + `tank_ai._enemyCamoMul`）。配套 **I0 模拟时钟**（`simNow/setSimNow/advanceSimNow`，13 处判定/计时挂钟读取已迁移，主循环逐帧注入）。**弹道侧 `getPartZRange`/`getExposure` 完全未改**。细归口 `specs/map/vision-stealth-3d-compat.md` §9。
- **贴图资产口径（2026-10-23 用户裁定，§4.124）**：确定为「**程序化生成 + 后期贴图接线**」。程序化烘焙是现行唯一实机路径；PNG 通道（地图 `ASSET_DEFS.bake → assets/<key>.png`、坦克 `sprite` 四层 → `drawTankSprite`）代码保留但**当前盘上无图**（19 张坦克 PNG 已删除）。**本仓库不出图**——AI 出图链已整体删除；后期美术按 `docs/ASSETS-PIPELINE.md` 落盘并由 `covers-anchor-check.py` 验收，`scripts/test-asset-pipeline.js` 锁接线完整性。伪 3D 形态裁定为**俯视 2.5D**、研究见 `specs/map/pseudo-3d-2p5d.md`（**设计预留，未落地**）。

- **架构**：节点式地图 + 主副武器解耦 + 主动技能 + 卡牌构筑 + 部署物/无人机 + Boss 全链可用；三条验证链 `npm run check` / `npm test` / `npm run test:browser`（smoke / r3 / run / r4 四链）近期各批次均全绿。
- **2026-10-21 浏览器链 r3 陈旧断言修复（§4.117）+ r4 A3 误判纠正（§4.118）**：用户在正常环境实跑 `npm run test:browser` 首次暴露**长期静默的陈旧断言**（沙箱内 `spawn EPERM` 起不了 Edge，故此前从未真正跑过）。**r3 为真修复**：5 个按钮断言指向 2026-10-19 #7 与 #W9 已裁定删除的 DOM，改验 `window.benchSpawnTurret/Mine/Cover`（能力仍在、入口迁移）并加负向断言防回潮；附带修掉弹种格 `fontWeight==='700'` 判据（#3 收敛共享 `renderAmmoIndicator` 后不再输出内联样式），改判 `.active` 类，实测转绿。**r4 A3 则是误判**：曾判定其「按住 400ms 应出 2 发」为假失败（以为 `tankIds[0]` 是 `dummy` reload 2.0），据此钉住 `stats.reload=1.0` 并改判据为精确推导——**该改动在真实浏览器链上制造 5 项新失败（A3 仍 3/4、B4/B4b/C1/#H2 连锁失效），已完整回退**。真相是 `api/tanks` 用 JS `sort()`（UTF-16 码元序）⇒ `tankIds[0]` 实为 **`Leapard_1`(reload 1.5)** ⇒ 0.375s/发 ⇒ 400ms 确出 2 发，**基线本就 ALL PASS**；误判源于用 PowerShell `Sort-Object` 的排序结果去推断 JS 语义。基线与回退后连跑均 **ALL PASS**。详见 **§4.117 / §4.118**（后者含两次教训：取证须用被测系统自身数据源；Node 侧推演不能替代浏览器验收）。
- **2026-10-21 项目文件整理：正式游戏页改名（§4.116）**：`tank_mvp.html` → **`tank_battle.html`**（用户「再整理本项目文件，mvp 还没改名」），并把全仓残留的 **`mvp`/`MVP` 字样一并清零**——因 `mvp` 既是历史阶段名又是页面代称、二者已混淆多年。口径为**三层同改**：文件名（1）+ 页面引用（147）+ 独立 mvp 字样（213）+ 具名标识符 `mvpLogPanel`→`battleLogPanel` 等 5 组；**共扫描 428 文件、改写 84 个、替换 360 处**。关键入口（`server.js` 启动清单 / `check-html.js` 五页清单 / `index.html` 三卡片 / `tank_compare.html` 导航 / 四条浏览器链 `page.goto`）逐点确认。**边界纪律**：`docs/archive/**` 正文约 250 处**不改**（归档只增不改，其中多为历史 `file:line` 证据，改写会使追溯失真）；`docs/ARCHIVE.md` 索引表 3 处行内引用 + 表尾新增本批索引行（按 §4.113~§4.115「非条目归档、属结构性/工具变更」先例）；`.dsh/skills/` 六张角色卡同步（§3.6 写域唯一权威）。三链：`check` EXIT=0 / `npm test` 48 通过 + 1 项**与本批无关**的沙箱失败（`test-cover-gen` 的 `spawnSync node EPERM`，零处引用该页面）/ `wiki-check` `broken=0 anchorBad=0`。详见 **§4.116**。
- **2026-10-21 wiki 规则入纪律（§4.115）**：把 wiki 化从「一次性重构」变成「可持续遵守的纪律」——① `AGENTS.md` 新增 **§2.3「改 specs 的三步」**（含**三类改动分流表**：改数值 / 新增机制 / 彻底废弃，各自动哪里、不动什么）；② **六张角色卡 + `doc-workflow` + `rogue-tank-roles`** 的归口全部从 `docs/specs/<卷>.md §N` 改指**具体主题页**；③ 新增可执行检查 **`scripts/wiki-check.js`（`npm run wiki:check`）**，查四类（全 docs 树断链 / 锚点有效性 / 兼容页结构 / 主题页模板），两个豁免（`WIKI-STYLE.md` 格式示例、`archive/` 只增不改）写进脚本白名单。**核心判断：纸面规则会被跳过，能跑的检查不会**——并通过**反向测试**（造 4 类错 → 4 类全报 exit=1 → 清理后归零）证明这条链真能失败、不是假绿。详见 **§4.115**。
- **2026-10-21 specs 五卷 wiki 化（§4.114）**：五卷正文拆成 **59 个一主题一页**的主题页（位于 `docs/specs/<卷>/`），单卷文件改写为 **§N 兼容索引页**（标题编号不变、每节 1~3 行摘要 + 「详见」链接），使 **597+ 处外部引用继续解析**。**243 个标题编号零丢失**（`LOST=[]`/`EXTRA=[]`/顺序一致），内容零丢失（标识符级比对缺失 0），链接断链 0、锚点失效 0。**查现行口径请先读 `<卷>/index.md` 或其 `changelog.md`**，不要直接把兼容页当正文读。风格规范见 `docs/WIKI-STYLE.md`（§7.5 已扩为 10 条实战校准）。详见 **§4.114**。
- **2026-10-21 specs 五卷主题化（§4.113）**：`docs/specs/` 五卷（combat / map / cards / boss / editor）完成**结构性重组**，解决「主题式 + 批次式两套组织维度并存」的检索困难（同一机制曾散落：装填跨 10 节 / `reload` 跨 9 节 / 跳弹跨 5 节）。**章节编号零变更**（五卷机器比对 `LOST=[]`）——因实测 191+ 处外部文档/代码引用 specs 章节号，重编号会使大量引用静默失效。**查现行口径请用各卷卷首「§0 主题索引」（按问题查、不按章节序读，共 89 条索引行）**；批次节均带「非主题基线」提示。顺带修正 7 处「文档与代码不符」的实质错误（含 `coverWorldScale` 漏 `building` 会致楼房尺寸偏大 2.4 倍、`combat §10/§11.1/§11.5` 三节实为已作废却标「现行口径」）。详见 **§4.113**。
- **2026-10-20 全量清账（§4.112）**：一次性清空 `docs/ISSUES.md` **全部存量条目**（20 项）与 `docs/PLAN.md` **全部已完成遗留项**。清账过程发现并修复两个此前无人察觉的系统性缺陷：
  1. **测试链假绿**——`test-rework-r2/r3` 缺 `process.exitCode` ⇒ r3 长期有真实断言红却恒 EXIT=0 且打印「全部通过」，`npm test` 一直记通过。补退出码后立即暴露下面的 P1 缺陷。全 48 个 `test-*.js` 扫描**无第三例**。
  2. **P1 玩法缺陷 #Y1**——曲射弹（迫击炮/榴弹炮）在飞行途中被**直射扫掠段截胡**：`isArc` 块缺兜底 `return`，块尾注释却承诺「落点结算后直接 return」⇒ 途中每一帧都穿透到直射段结算，中间坦克被途中击毁、落点目标零伤害。**注释说谎 + 假绿两环叠加**是该缺陷长期未被发现的原因。已修复（`isArc` 块补兜底 `return` + 5 条护栏含非整除步长精确吸附 + 反证删掉即红）。
  另判定 **5 项条目为「文档记载与代码现状脱节」**（#V1/#V2/#W7/#W18-5/#W18-6），其中 **#V1 的根因判定本身是错的**（真凶是 `bakeAssetCanvas` 负锚点补边，已在 `ba95e09` 修掉，而非文档所称「canopy 复用基础层尺寸」）。**三链全绿**：`check-html` EXIT=0 / `tsc --noEmit` EXIT=0 / `run-tests` 48 通过 + 1 项环境失败（`test-cover-gen` 沙箱 `spawnSync` EPERM，**放宽权限后 EXIT=0「全部通过」**）。
- **批次史**：R-1/R-2/R-3 起步（§4.1~§4.3）→ 卡牌三板块与开局弹种/副炮塔（§4.9）→ 面板解耦（§4.10）→ 阶段七卡牌闭环（§4.11）→ 2026-09-14 三批定案（§4.12~§4.14）→ 主武器改版五项 + W6 机炮热量（§4.15）→ 输入分发/卡牌资格/面板分层（§4.16）→ 技能 upgrade 资格闭环（§4.17）→ 炮塔前移根治 + 路网重做（§4.18）→ #B8~#B11（§4.19）→ #C 批（§4.20）→ #D 批（§4.21）→ 开发者面板两页统一（§4.22）→ #E 批掩体体系收敛（§4.23）→ #F 批（§4.24~§4.27）→ #G 批（§4.28）→ #H 批视野/激光（§4.29~§4.31）→ #I 批（§4.32）→ #J 批（§4.33）→ 文档整改（§4.34）。**§4.1~§4.26 逐条正文已归档**（见上方 §4 编号说明与索引表）。
- **视觉渲染链现状（2026-10-18 §4.90~§4.93；植被 §4.100/#TEX14 + §4.101/#TEX15；俯视栅栏/沙包 + 影子归口 + mini-canvas drawImage CTM 见 §4.103/#TEX17；地面履带痕迹见 §4.104/#U41 2026-10-19）**：贴图/特效/阴影已完成一轮全链路审计与重做——坦克纹理改硬边迷彩 + 表面颗粒（`_texPatch`/`_texGrain`），损伤 weathering 与外观件**首次真正生效**（缓存键补 `damageLevel`/`weatherSeed`/`appearance`），炮塔补损伤层，车底影从无到有，三处阴影统一为**世界固定光源**（右下 +x/+y），特效拆为分层结构且绘制期**零渐变分配**，离线生图垫片 `mini-canvas` 补齐 CTM 与 `lighter` 语义。新增 `scripts/test-render.js` 用真实光栅化做逐像素回归（替代原「mock ctx + 不抛错」的空断言）。
  **2026-10-18 §4.91 补**：建立**可执行的贴图审核标准** `scripts/audit-textures.js`（七指标 + 按设计意图分三类评分 + 双向区间，达标线 80），并把标准纳入 `test-render.js` ⑦ 强制回归（新增 6 项断言，总数 23→29）。据此修掉三处「画了等于没画」的真实缺陷（`camo_winter` 白块贴在近白底上只差 13 / `camo_urban` 轴对齐矩形且明度差不足 / `camo_digital` 2.56px 格且色差仅 5）与两处体检缺陷（`armor_plate` 与裸装甲差异仅 1.5% / 锈斑过小导致损伤不可见）。当前基线 **97/100、14/14 达标**。细则归口 `specs/map.md` §23 + §22、`specs/combat.md` §6。
  **2026-10-18 §4.92 补**：在**具备图像输入**的会话中做了真正的 1:1 视觉审阅（离屏 1×/5×/10× + 6 biome 背景出图），发现 v2 统计口径量不到的三个问题并升级到 **v3 标准**（`variation` / `edgeWear` / `continuity` 三条通过/不通过，`test-render.js` ⑦b 强制回归）：① 炮塔图案按自身 bbox 取景 ⇒ 色块只有车体一半大且交界断开；② 同型车共用常量子图案；③ 磨损只在面内、棱边无掉漆。算法改为**整车图案框**（炮塔 = 车体 bbox − 座圈偏移，网格类贴图按 `originX/Y` 对齐板缝）、`weatherSeed` 逐车平移、`_texPatch` 加 overspray/lobe、`paintEdgeWear` 沿边界布点、机械件亮度收敛、履带去除 LED 点阵。当前 v2 **97/100、14/14 ≥80**，v3 **14/14 PASS**。细则归口 `specs/map.md` §22.1 + §23.8。
  **2026-10-18 §4.93 补**：材质化——`SPRITE_SCALE=3` 超采样烘焙 + 双线性降采样（消除「放大 1× 位图」的像素感）；`paintMaterialPass`（内侧 AO/倒角/受光高光池/拉丝/细颗粒/积尘）；细节投影；炮管 4 带圆柱着色；车体/炮塔暖色轮廓光；车体底色 −18%→−12%。离线验证链同步补 `mini-canvas` 双线性降采样与渐变 CTM 语义；v2 区间按 3× 视图重标定（patchScale 0.08~0.26、tones 上限 8、mip 上界 1.15），`continuity` 测量时排除材质层。当前 v2 **97/100（14 S）**、v3 **14/14 PASS**。细则归口 `specs/map.md` §22.1/§22.2/§22.6/§23.2/§23.8。
- **生存模式与地图生成链现状（2026-10-18 §4.94，#U35）**：生存模式已**并入标准 strip 生成链**（删掉 `bossOnly`/`stripForBoss` 两个 hack，改 `env.noEnemies` + `RULES.nodeMap.strip.survival`），单图为 **6.0×6.5~6.6 屏**（旧实现纵向裁剪后上下大块空白，底部 400px 带元素数 0）；新增 `chunkRows` 多行片（缺省 1 逐字节零回归）。**道路上不再有房屋/树木**（8 seed 实测压路 0 个；根因是 strip 级路网在片生成之后才 append，片内 prune 看不见它 ⇒ 新增 `clearCoversOnRoads` verts 精判收尾）。生存选卡改为**每一波结束**（普通波 5 选 2 / Boss 波 5 选 3，与标准模式同口径，原为仅 Boss 波且 5 选 1）。小地图新增**公路整链多边形绘制**（旧实现按 bbox 中心只画一个点）与**补给点标记**。细则归口 `specs/map.md` §24 + §14.4、`specs/combat.md` §14.1b。
- **立体感现状（2026-10-18 §4.95，#TEX13）**：坦克改为**显式 2.5D 高度**——车体/炮塔按世界光反向偏移出两层侧壁（先于履带绘制，避免盖掉链节）、炮塔座圈改为凸台、顶面加暖色轮廓光；地图树冠补左上受光→右下蔽光的球面渐变 + 右下暗冠缘（旧实现受光侧在右上方，与投影方向相反），投影三层加深；岩石改为逐边法线着色的多面体 + 侧壁 + 棱边高光，box 建筑补背光侧墙体，box/rock 投影加深。`test-render.js` ⑧a/⑧b 五项像素断言锁住「受光方向/多面体/投影」。细则归口 `specs/map.md` §22.8。
- **地面层性能与观感现状（2026-10-18 §4.96，#GT/#U36）**：用户报「雪地/沙漠纹理随玩家移动变化 + 帧率大幅下降」实为**两个独立成因**。① **性能**：地面材质纹理每帧按世界格 hash 重描全部图元（1920×1080 雪地 11,717 个、zoom 0.5 看全图 45,087 个，单帧 31~85ms 远超 16.7ms 预算）⇒ 改为**视口锚定滚动烘焙**（`drawGroundCached`/`ensureGroundCache`，烘焙缓冲按「世界尺寸 × zoom」建），相机在内半区移动只 blit 1 次：每帧 ctx 调用 **11,742→6 / 45,112→6**，97.5% 命中。② **观感**：几何本身世界锚定（已用图元世界坐标集合比对证伪），真正原因是**浮点相机导致亚像素重采样**——`renderCamPos` 改为**屏幕像素对齐** `round(cam.x·zoom)/zoom`（⚠ 世界空间取整是错的：zoom 1.6 时 0.80% 反而比不取整 0.41% 更差），6 个 zoom 下同一世界点色差由 1.2~3.4% 降到 **0.00%**。③ 同批修掉 `biomeZones` 1 维 x 带在下行片下的**区段重叠**（两个 biome 纹理叠在同一片像素上），升级为 2 维矩形。细则归口 `specs/map.md` §25 + §22.5b。
- **河流现状（2026-10-18 §4.97，#U37）**：① **贴图 vs 物理一致**——根因是「道路免疫」用**整链路链凸包**做 SAT（`main-road-d0` bbox 1030×4645、真实路面仅占 12.3%，距路心 894~1109px 的河面都被判「在路上」），导致成片河面免疫溺毙且丢失 0.4 减速；改为带 `verts` 的路链走真实多边形判定后真误判 **8.3% → 0%**（性能同时从 284.9 降到 8.7 µs/次）。② **河宽硬上限** `RULES.drowning.wadeMaxWidth=260`（= 8s 内最慢车 hummel 可渡宽度）：改前 p50 573 / max 805 使慢车必溺毙，改后 **max 260**，5 车型 × 8 seed × 4885 河段**溺毙 0 次**。③ **AI 敢涉水**——`_waterHazardTier()` 把 `passability>0` 的 river 判为可涉水（只有 water 水潭才绕行），真·追击样本被避水打断 **100% → 0%**。细则归口 `specs/map.md` §11.1。
- **电磁轨道炮视效现状（2026-10-18 §4.98 #U38；2026-10-19 §4.102 #U41 配色与归属修正）**：电磁炮为**三段视效链**——① **充能**（装填期炮身爬行电弧，条数/振幅随 `railChargeProgress` 上升，满电转微光待机）② **击发放电**（`spawnRailDischarge` 沿**炮管轴向**甩出电离折线，上限 24 条，外溢 0%）③ **弹道**（针状白热弹长 ×1.9/宽 ×0.55 + 白热渐隐拖尾）。**三色口径（2026-10-19 用户裁定，现行）**：炮管=**灰**（`barrelGrey*`，与车体涂装无关——旧实现取 `shade(bCol,…)` 已废）、基底=**蓝**（`baseBlue*`，**只填导轨之间缝隙**、实色不进 `lighter`）、弧光=**白**（`arcWhite` 纯白芯 + `arcHalo` 冷白晕，`b−r ≤ 45`，不再是青蓝）。**电弧只挂炮身、不跟炮弹**（旧 `shellTrailArcs` 弹体电弧尾迹已删）。**炮管加宽 `barrelWidMult=2.2`**（纯视觉；常规口径的 `barrelWid≈3.2px` 放不下双轨+蓝缝+白弧三层——实测蓝缝被两根灰轨完全盖掉、炮管读作空管）。**白/蓝配比纪律**：待机态白芯压到 0.18，白的主载体是充能电弧与击发放电，否则白吃掉蓝基底（实机读作「白炮管」）。炮身六层：蓝缝衬底 + 灰双轨（三层明度）+ 3 圈灰箍环 + 淡白能量芯 + 冷白后膛核 + 白充能弧。参数唯一口径 `RULES.railgunFx`；电弧几何走共享工具 `js/tank_utils.js lightningPath`（确定性、两端收敛、draw 期无随机）；专属音效 `SOUND_DEFS.firerail`；HUD 装填环对 railgun 改**白**双层充能弧。充能进度**与 fireTank/HUD 装填环同源**。`test-render.js` ⑩ 锁三色分工（灰 261 / 蓝 168 / 充能中白 44；待机白 2 px 且必须 < 充能白）+ 三色配置值直查 + 弧锁炮身走廊 + 弹体无电弧。细则归口 `specs/combat.md` §6「电磁轨道炮三段视效」。
- **武器升级卡与 Boss 武备现状（2026-10-18 §4.99，#U39）**：卡池 **171 → 191 张**，主/副武器**全 11 型**都有 2~4 张升级卡（改前 `standard` / `missile_wire` / `turret` 三类为 0 张，且后两者连安装卡都没有）。修掉 4 处「升级卡写了不生效」的通道断点：① `primaryWeaponSpec` 对 `standard` 恒返 null（**主武器升级卡结构性失效的根因**，现改为「无覆写仍 null、有覆写才产规格」）② `missile_wire` 漏在卡牌白名单 `WEAPON_SECONDARY_TYPES` 外（任何该型卡都被判非法）③ 布雷器 `blastRadius/triggerRadius` 写死字面量 ④ 线导弹 `speed` 写死 340 —— ③④ 均收口进 `WEAPON_DEFAULTS.secondary` 并由 `cfg` 消费。**Boss 随机武备**：新增纯函数 `pickBossArmament` + battle `assignBossArmament`（走 `applyCardEffects`，与玩家同一语义通道），参数唯一口径 `RULES.boss.armament`；实测 500 次平均每 Boss 携带 **3.27 张**武备卡（升级卡 830 次）、施加失败 0，主武器五型各 22.2%~22.8%、副武器六型各 10.8%~12.2%。复核带扩到全部 upgrade 卡并按三通道分档（纯 DPS / 混合 / 纯功能性），原 4 张 #S6 卡另按历史紧带 [1.25, 1.60] 复核不回退。细则归口 `specs/cards.md` §8.3、`specs/boss.md` §4、`specs/combat.md` §8.6b。
- **卡牌系统审计五修现状（2026-10-19 §4.101，#U40）**：① **调校卡/升级卡混淆**（结构性根因）——弹种链前驱推断曾对带 `field` 的纯数值调校卡无条件回退 CHAIN，`demo_apcr_round` 等 8 张「穿深 +x%」卡会**隐形把 AP 槽改名 APCR** 且随 maxStacks 反复触发；现行升级效果 = 显式 `replaceAmmo` ∨ 无 field 旧式演变，调校效果绝不改 loadout（`applyCardEffects` / `isAmmoUpgradeCard` / 链过滤三处同源）。② **反应装甲**从「拦截 1 发即消解（整局一次）」改为**拦截后进入再充能**（`RULES.cards.reactiveArmor.rechargeSeconds`=60s，逐帧递减、跨节点重置）。③ **parameterLimits 补齐** `aimSpeed 0.1~6` / `trackLock 3~20` / crit 双通道 `0~0.25`——满级精度/履带/暴击卡被 #U20 达限过滤正确剔除（注意 aimSpeed 真实坦克基准 1.0~2.5 与 makeTank 缺省 0.15 两套量纲并存）。④ **innate 强化卡豁免 #U18 去重**——`repair_kit` / `support_extinguisher` 不再因固有键「已持有」被永久滤除。⑤ **economy 全通道接线**——`scoreMul` 语义修复（×1.15 而非错算 ×2.15）+ 三处计分点消费、`shopDiscount` 局内商店折扣（上限 0.5）、`reviveCount` 局内即时回算。三链全绿（46/46 Node + 浏览器四链）。细则归口 `specs/cards.md` §3/§8.5/§9。
- **技能键位单一来源现状（2026-10-19 §4.103，#U42）**：**炮击 G / 护盾 H 专属键退役**（同 #H3 删 V 先例）——#H3 折中留下的「未入槽时显示 btnG/btnH」双通道不仅让同一技能有两个键位，且 **H 键（默认定向护盾）与技能池（恒全向）行为不一致**。现行全部 7 个运行时技能只经技能池 skillSlot1~3 + 数字键 1/2/3；`KEY_BINDINGS` 删 `abilityStrike`/`abilityShield` 键位与说明行；battle 的 G/H 轮询、btnG/btnH 元素、`SKILL_DEDICATED_KEYS`、脉冲回退表全部移除；bench 保留 G 键为测试入口（`benchTestStrike` 路由，无卡自动补卡）。innate 三键 4/5/6 是设计上正确的专属键（开局固有、不占槽）。其余键位（Q/E 切弹、F 副武器、1/2/3 技能池、F1/Esc/Tab/C/`）经全仓核对无错误绑定。三链全绿（check + 46/46 Node + 浏览器四链）。细则归口 `specs/combat.md` §13.2；键位唯一口径 `js/tank_bindings.js`。
- **Boss 简报 / 副炮塔呈现 / 技能顶替顺序 / 换装回退现状（2026-10-19 §4.104，#U43/#U44）**：
  - **Boss 进场简报（#U43）**：进 Boss 节点即弹居中卡片，列出**主/副武器、改装卡（含数值摘要）、技能（增强版标「强化」）与阶段数**；数据由纯函数 `bossBriefing(entity)`（`js/tank_boss.js`）从**实体**读取（故与随机结果一致），`cardEffects` 条目带 `cardName` 供纯逻辑层显示卡名。覆盖层不是 flow 状态（不暂停），日志另留纯文本兜底。
  - **副炮塔（#U44①）**：机制本就生效（自瞄/独立装填/入 shells），问题在呈现——① 弹道起点曾复用主炮 `gunTip`（实测与主炮口**逐位相同**）② 外观曾是车尾 `hullWid×0.30≈11px` 的圆盘+棍子。现行：位姿锚定**主炮塔座圈沿朝向前移**、`scale 0.62`、复用本车 `turretPoly` 顶点（缩小版自身炮塔叠在主炮塔上方）；弹道起点改为副炮塔炮口（实测与主炮口分离 29.8px），弹体 `fromSecondaryTurret` 缩 0.7 档。
  - **护盾键位（#U44②）**：**全仓无 R 键**，护盾自 #H3 起走技能池、按获得时空槽自动入池（`slots.indexOf(null)`），槽满才弹顶替面板；实机若仍见 R 属浏览器缓存旧 `tank_bindings.js`。
  - **技能顶替顺序（#U44③）**：`syncSkillSlots(changedKey)` 只把**本次新获得且装不进槽**的技能排队——旧口径把「已持有但不在槽里」全部排队，导致被顶掉的旧技能（在 `cardEffects` 里更靠前）插队到新技能前面。现「已持有未入槽」视为玩家主动放弃，可 Shift+点击某槽手动装回。
  - **换装可回退（#U44④）**：`_isSwapBackCard` 让**武器安装卡与 ability 基础卡**豁免 maxStacks 历史计数（`cardEligible` 与 `applyCardEffects` 两处同源），其重复资格回归「当前是否持有」动态判定 ⇒ 换掉双联后能再抽回来、放下护盾后基础盾卡能再出现；升级卡与 modifier/ammo/passive/drone/economy 仍受 maxStacks 约束。
  - 三链全绿（check EXIT=0 + tsc EXIT=0 + 45 项 Node 逐个直跑全绿；含 `test-cards` #U44 段 11 条与 `test-rework-r3` 弹道起点 4 条）。细则归口 `specs/boss.md` §4、`specs/combat.md` §4、`specs/cards.md` §9。
- **路网弯形现状（2026-10-19 §4.105，#U45）**：用户反馈「有些道路看起来像正弦函数，在地图内的弯太多」——根因是 `buildFromPoints` 随机 1~2 个内部控制点独立 ±16% 横向偏移，反号时 Catmull-Rom 样条即 S 形。现行 `buildFromPoints` 重做为**全程恒定符号的单弓形弯**（单弓顶控制点 + 两端同号 1/4 幅预弯消除端部反拐），`RULES.nodeMap.road.curveAmp` 0.16→**0.075**（弓顶横移 ≈7.5% 跨度，一条路全程只弯一次）、`branchCurveAmp` 死配置删除。实测 648 条道路链横向偏移符号变化 max=0（零 S 形）、最小交叉夹角升到 81.8°、连通性维持 0.9999~1.000；校准基线第十三次重锚（rng 流位差）、strip 河流接缝断言修正「纵贯河被误判为横贯」的判定盲区、`tank_sim.js` 代理玩家补「被挡继续逼近」（修 seed=1 全超时 0 开火假超时）。细则归口 `specs/map.md` §26。
- **长期债务**：
  1. 友军击杀五折记分留待经济里程碑。
  2. ~~`RULES.nodeMap.road.junctionClearR`（0.85）为死配置~~ —— **已于 2026-09-23 A 档删除**（见 §4.35）。
  3. ~~`recon` / `track_repair` 两个能力键为死效果（对应 5 张卡能抽不能用）~~ —— **已于 2026-09-23 A 档整体摘除**（两键 + 5 张对应卡，见 §4.35）。
  （截至 2026-09-23 A 档收尾，长期债务仅剩第 1 条。）

### 3.2 下一步顺序与远期展望（2026-10-26 更新）

**历史裁定（2026-09-23，已完结）**：A 清账 → B 推进轴玩法已完成；完整 strip 横向卷轴与旧 C 档不再作为待办，原文已归档（2026-10-26）。可见半径口径**不变**，「敌人开火时看不见」改走**视野卡 + 镜头外延做强**；现行待办见 `docs/PLAN.md` §1～§3，几何上限见 `docs/specs/combat.md` §11.5。

**A 档（清账）、B 档（推进轴玩法）已于 2026-09-23 完成并验证；ISSUES/PLAN 全量清账与 PLAN 关账已于 2026-10-20 完成（§4.112）** —— 关账后：
1. **近期待办**：
   - ~~**地图元素 AI 生成出图 + 落盘**~~ —— **2026-10-23 用户裁定关闭**（本仓库不出图；程序化烘焙为唯一实机路径，只保留后期贴图接线）。见 `DEVELOPMENT-batches-2026-10.md` §4.124。
   - **2026-10-24 用户反馈核实批次（4 项，逐条拿代码证据核实）**：
     - **3 项确认为缺陷**：① 公路加成 HUD 标「+5km/h」而实机 +10km/h（换算重复除了一次尺度，`tank_battle.html:5311` ⇒ **#AA1**）；② bench `fireCtx` 缺 `aimPoint` ⇒ 榴弹炮曲射落点塌到 `minArcRange` 兜底、射程与光标无关（`tank_bench.html:1072-1122` vs `js/tank_fire.js:349-363` ⇒ **#AA2**）；③ battle 侧 7 项运行时驱动在 bench 零接线（急速射 / 砰砰炮 / 无人机 / 导弹 `cam` / `resolveHit` 包装 / `emitShotNoise` / F 键边沿 ⇒ **#AA3**，同卡两页行为不同）。
     - **1 项根因确凿、已按用户裁定修复并归档（原 #AA4，2026-10-24）**：制动手感失控——地形乘子**同倍率削弱制动**（`js/tank_move.js:120-121` ⇒ 泥潭/河流滑行 2.5×）、且制动纯由马力重量比派生（`js/tank_model.js:197-200` ⇒ 低马力坦克滑行约 3.2×），全仓无独立制动/阻力口径、无滑行距离断言。**修复口径**：制动与 P/W 脱钩（`RULES.speed.brakeBasePx = 400`）、新增逐 tier `brakeGrip`（`water`/`river`/`mud` = 0.7）、地形乘子改指数插值 `terrainLerp = 10`/s、`brake` 成卡牌可达字段（`parameterLimits.brake {150,900}`），新增 `scripts/test-movement-braking.js` 20/20。见 `DEVELOPMENT-batches-2026-10.md` **§4.130**、细则 `docs/specs/map/terrain.md`「制动与滑行」。
     - **1 项核实不成立（排除）**：「正式游戏 / Boss 战节点间会自动提高坦克移动速度上限」——无任何提升玩家 `stats.maxSpeed` 的节点或 Boss 路径（`js/tank_boss.js:293-312`/`:322-332` 只下调 Boss 自身、`tank_battle.html:2657-2671` 只作用敌人）；感知来源是公路加成 + HUD 低估 + 闪跃，见 `docs/archive/2026-10.md` 的 PLAN §6.1.1（原文）。
     - **1 项属新能力缺口**（非回归，故不入 ISSUES）：电磁炮**充能电流声 / 放电声**缺失——`SOUND_DEFS` 14 键只有发射瞬态 `firerail`，充能进度与放电弧两处零 `playSound`，且该结构无法表达循环 ⇒ 需「新增瞬态键 + 代码驱动的充能管理器」两件事，先补 `docs/specs/combat/audio.md` 口径（原 `docs/PLAN.md` §6.3，已归档）。
     - 证据链：**#AA1/#AA2/#AA5 见 `docs/archive/2026-10.md` 与 §4.132、#AA3 见 §4.136、AA-c 见 §4.137**（2026-10-26 全部关账；`test-bench-parity.js` 30 断言锁键集包含关系 50 ⊆ 51；原 #AA4 见 §4.130）——**ISSUES 当前为空，用户 2026-10-24 反馈批次（AA-a~d）全部完成**。R0/A0/R1 已于 2026-10-27 落地（§4.147~§4.149）。
2. **近期路线（2026-10-26 重排；2026-10-27 更新）**：
   - ~~**先清存量**~~：AA-a → AA-b → AA-c **已完成（2026-10-26）**。
   - ~~**共同地基 R0**~~：I3 截图基线 + I4 拾取唯一入口 + 固定场景/性能基线 **已完成（§4.147）**。
   - ~~**A0 命令闭环**~~：三命令 + 统一目标权威 **已完成（§4.148，标准模式不预生成友军据点见 §4.152）**；A1（导航/职能）与 A2（单车/手柄）未做。
   - ~~**R1 可玩切片**~~：同一套二维模拟 + 原生 WebGL 小战场 **已完成（§4.149；连续开火修复 §4.151、阵营环 §4.152）**；`tank_3d.html` 右上 F1 验收清单可直接用于 Go/No-Go 实机评审。
   - **下一步 = 先过 R1 Go/No-Go，再做 G1 品质垂直切片**：R1 评审按清单看「地面拾取一致 / 连续开火 / Z/X/C 指挥 / 车头车尾可辨 / 建筑可破坏 / FPS」，**已由用户 2026-10-27 实机验收通过**。G1 首切片已落地（§4.154）：`npm run baseline:3d` 场景基线 + 载具视觉俯仰/侧倾/后坐 + 扬尘/震屏 + 破坏扬尘 + 音频接入；**完整遭遇（波次导演/胜负/节奏）已于 2026-10-28 完成（§4.155）**，**1080p/Deck 性能预算与降级已于 2026-10-28 完成（§4.156）**；**仍待做**：精修单车与单主题场景、载具手感第二轮。过门仍按 §2.3 的 6 个维度。
   - **Go/No-Go 后才量产**：G1 不过门不批量产车/图/模型；切片证明 JS 路线存在结构性阻碍才重评 Godot 等备选。现行机制归 `specs/combat/ally-command.md`、`specs/map/rendering-roadmap.md`。
3. **远期路线与商业化筹备（2026-10-26 重排）**：
   - **已完成的首批三项（§4.123，2026-10-23）**：撞击伤害、隐蔽感知、战术闪跃——均不依赖设计器 UI。细则见 `specs/combat/ramming-stealth-dash.md`。
   - **品质目标与渲染路线（§4.131，2026-10-26）**：目标参考《变节行动》的驾驶/破坏/演出与场景品质；**不把 Canvas 路线 A 当最终方案，不要求 A → B → C**。首选保留二维模拟 + Three.js/WebGL 可玩切片，非全量换引擎。细则归 `specs/map/rendering-roadmap.md`，旧研究留沿革。
   - **贴图资产口径（§4.124）与边界更新（§4.131）**：Canvas 实机仍为「程序化生成 + 后期贴图接线」，本仓库不出图；参数化灰盒不等于商业精修资产，R1/G1 另建模型/材质/损坏状态/VFX/音频管线。见 `specs/map/rendering-roadmap.md`。
   - **技术栈定性纠正（§4.125，2026-10-24）**：**零依赖 / `file://` 直开 / Node 像素回归是当前临时状态，不是硬约束**。据此真 3D（WebGL/Three.js）不被架构排除；是否采用由 R1/G1 实测而不是旧成本假设决定。
   - **单机友军指挥（§4.131，2026-10-26）**：明确不做多人合作；首版少量 AI 友军 + 集火/前往/跟随/驻守/撤退/侧袭六命令（**2026-10-27 用户裁定简化为 follow/move/focus 三命令**），统一决策与击发目标，补齐状态反馈/导航/回放。细则归 `specs/combat/ally-command.md`。
   - **M1 核心战斗量产**：保留载具绑定/专属卡池、特种车辆、烟幕与武器专精；新增载具动力学、分级环境破坏、统一战斗演出、镜头可读性、友军职能/导航/协同构筑。优先级 = 手感与可读性 > 指挥可靠性 > 破坏与演出 > 内容数量。
   - **M2 内容与重玩性**：主题地图、巡逻/伏击/护送/增援遭遇、任务变体、Boss 演出、run 节奏/难度导演、车库/进阶/图鉴；G1 后再扩内容数量。
   - **M3 商业发行**：手柄与命令环、I18n、高保真音画、可访问性、性能档位、版本化存档/回放/崩溃诊断、成就/云存档/Deck/客户端封装与合规；§5 已按地基/量产/发行候选期拆分，不提前接平台 API。
   - **M4 可选扩展**：创意工坊、单机异步排行榜与更多主题/载具；多人合作不在近期或远期默认路线，不为它预埋网络架构。

**已关闭项（2026-10-20 实测复核，保留指针以便追溯）**：
- **C 档·横向卷轴节点**（2026-10-10 #O5 主体已实施，见 §4.60）：`generateStrip` + 小地图条带化 + 常规节点实战接入 + 视口锚定滚动烘焙 + 双空间索引 + `extendRun` 免重放续接；推进式结算（B 档③）沿用。**原记的「strip 密度/难度校准重锚」中的密度项经实测不再成立**（§4.112(10)：现行密度 **13.8 个/屏**，与当初「现状 13 个/屏」持平 ⇒ 补偿无需再做）；难度曲线属可选数值口味。现行口径见 `docs/specs/map.md` §14。
- **HUD 渲染级合并**（`docs/PLAN.md` §2.2）：9 处 = **6 合并 + 2 产品定位差异**（血条、装填指示均属承载不同信息的两页形态，不属「同一功能的另一套实现」）⇒ 无剩余项。用户 2026-10-20 裁定关闭。
- **难度联动**（`docs/PLAN.md` §2.1）：已于 2026-10-19 实施（敌军弹种按等级沿 AP 链升档，Boss 除外）。

---


## 4. 批次落地结论

批次日志已按月份拆分：

- [2026-09 批次 (§4.27–§4.39)](DEVELOPMENT-batches-2026-09.md)
- [2026-10 批次 (§4.40–§4.156)](DEVELOPMENT-batches-2026-10.md)

### 4.0 §4.1~§4.26 编号索引（正文见归档）

| 编号 | 日期 | 主题 | 正文 / 现行归口 |
|---|---|---|---|
| §4.1 | 2026-09-12 | R-1 主副武器与主动技能 | 归档快照（2026-09-23 行）· `specs/combat.md` §4 |
| §4.2 | 2026-09-12 | R-2 召唤物与战术部署 | 归档快照 · `specs/combat.md` §4 |
| §4.3 | 2026-09-12 | R-3 特种弹药、曲射与副武器手动开火体系 | 归档快照 · `specs/combat.md` §3/§4 |
| §4.4 | 2026-09-12 | #A19 坦克碰撞回归修复 | 归档快照 · `specs/combat.md` §1 |
| §4.5 | 2026-09-13 | 测试基线（历史遗留清零） | 归档快照 · `specs/editor.md` §7.5 |
| §4.6 | 2026-09-13 | #A11 地图级路网与地形占位重构 | 归档快照 · `specs/map.md` §10 |
| §4.7 | 2026-09-13 | #A20 HUD 静态按钮内联 onclick 失效修复 | 归档快照 · `specs/combat.md` §9.6 |
| §4.8 | 2026-09-12/13 | 核心运行时缺陷修复（#B1~#B5 与 #78） | 归档快照 |
| §4.9 | 2026-09-13 | 卡牌三板块 + 开局弹种/副炮塔落地 | 归档快照 · `specs/cards.md` §8 |
| §4.10 | 2026-09-13 | 操作/设置/面板解耦（battle ⇄ 测试台同源） | 归档快照 · `specs/editor.md` §7 |
| §4.11 | 2026-09-13 | 阶段七：技能/主/副武器卡牌体系闭环 | 归档快照 · `specs/cards.md` §8.3 |
| §4.12 | 2026-09-14 | 局内商店退场收尾 + 卡牌选择定案 + 键位反向/敌军血量修订 | 归档快照 · `specs/cards.md` §9 |
| §4.13 | 2026-09-14 | 七项用户定案（HEC 移除 / 商店回归 / 受击警觉 / 地图重做 / 水域溺毙 / 装备优先 / 新局归零） | 归档快照 · `specs/combat.md` §3·§5 / `specs/map.md` §11 |
| §4.14 | 2026-09-14 | 弹种缩写规范化 / 双副武器与右键击发 / 技能池 1~3 / 道路平滑烘焙 / 商店与 Boss 结算修复 | 归档快照 · `specs/combat.md` §3/§4 |
| §4.15 | 2026-09-15 | 主武器系统改版五项（含 W6 机炮热量重做） | 归档快照 · `specs/combat.md` §9 |
| §4.16 | 2026-09-15/16 | 输入分发 / 卡牌资格与单槽 / 面板分层 / 副炮塔挂载与升级卡复核 | 归档快照 · `specs/combat.md` §4 / `specs/cards.md` §8.3 |
| §4.17 | 2026-09-16 | 主动技能 upgrade 卡持有资格闭环（#A28） | 归档快照 · `specs/cards.md` §8.4 · §8.5 |
| §4.18 | 2026-09-16 | 炮塔跨节点前移根治 / 路网重做（#B6·#B7） | 归档快照 · `specs/map.md` §10 |
| §4.19 | 2026-09-16 | 用户反馈批次：副武器替换语义 / 部署物接 battle / 技能获取提示（#B8~#B11） | 归档快照 · `specs/combat.md` §4 |
| §4.20 | 2026-09-17 | 用户反馈批次：路口圆斑 / 射速下限 1s / 弹种升级卡保底 / 技能副武器操作链 / 灭火器死前置（#C1~#C4/#C6） | **归档快照** · `specs/combat.md` §4 / `specs/cards.md` §3·§9 / `specs/map.md` §10.2 |
| §4.21 | 2026-09-19 | 用户反馈批次 #D1~#D5（拦截日志对齐 / 视野卡接线 / 交替装填重定义 / 火箭逐发 burst / 弹种保底概率化） | **缺号**——正文从未写入本文件；**归口** `specs/combat.md` §4/§5.1、`specs/cards.md` §8.3/§9；原文见 `archive/2026-09.md`（2026-09-19 行） |
| §4.22 | 2026-09-19 | 开发者面板改进 + battle⇄bench 两页统一（原 ISSUES #C5 + PLAN §3 专轮） | **缺号**——归口 `specs/editor.md` §7；原文见 `archive/2026-09.md`（2026-09-19 行） |
| §4.23 | 2026-09-20 | #E1~#E13 批次：掩体体系收敛（半高掩体移除 / 确定性挡弹 / 路网 v3 / 沿路建筑与路口沙包） | **缺号**——归口 `specs/map.md` §12、`specs/combat.md` §8、`specs/boss.md` §6；原文见 `archive/2026-09.md`（#A9 关闭说明）与 `ISSUES.md` 核验记录 |
| §4.24 | 2026-09-20 | #F1~#F4：devPanel 两页同源 / 双联火炮齐射门控 / 测试台副武器接线 / 双管装填弧修复 | **缺号**——归口 `specs/combat.md` §8.5、`specs/editor.md` §7；原文见 `archive/2026-09.md` |
| §4.25 | 2026-09-20 | #F5：布雷器「无限召唤 + 无伤害」（雷场预约上限 + 触发半径 45/40px） | **缺号**——归口 `specs/combat.md` §8.1；原文见 `archive/2026-09.md` |
| §4.26 | 2026-09-20 | #F6：雷场/掩体「新的生成、旧的失效」（超限改部署前拒绝） | **缺号**——归口 `specs/combat.md` §8.1；原文见 `archive/2026-09.md` |
| §4.116 | 2026-10-21 | 项目文件整理：`tank_mvp.html` → `tank_battle.html` + 全仓 mvp 字样清零 | `DEVELOPMENT-batches-2026-10.md` §4.116 |
| §4.117 | 2026-10-21 | 浏览器链 r3 陈旧断言修复（按钮→window API、`fontWeight`→`.active`） | `DEVELOPMENT-batches-2026-10.md` §4.117 |
| §4.118 | 2026-10-21 | r4 A3「假失败」**误判纠正**：一次基于错误证据（PowerShell 排序 ≠ JS `sort()`）的改动被完整回退 | `DEVELOPMENT-batches-2026-10.md` §4.118 |
| §4.119 | 2026-10-22 | 第五批：15 项玩法改造 + 4 项核实修复 + 2 项追加需求（雷场/机炮/双管/弹夹/曲射/掩体/AI/设计器/图鉴） | `DEVELOPMENT-batches-2026-10.md` §4.119 |
| §4.120 | 2026-10-22 | 坦克程序化贴图高清风优化（**已被 §4.121 取代**：用户要求不用当前已有绘制方法，方案整体回退） | `DEVELOPMENT-batches-2026-10.md` §4.120 |
| §4.121 | 2026-10-22 | 坦克贴图 **SVG 矢量高清通道**（P-16）——**已整体回退**（用户判定太丑），通道回到 PNG 精灵 + 程序化烘焙两条 | `DEVELOPMENT-batches-2026-10.md` §4.121 · `specs/map/textures.md` |
| §4.122 | 2026-10-23 | 被动技能槽 + 无人机/导弹玩法改造（含「撞击伤害半成品」修复：去重冷却 / 硬直不改写速度 / 双残骸分离） | `DEVELOPMENT-batches-2026-10.md` §4.122 |
| §4.123 | 2026-10-23 | 近期可落地三机制：撞击伤害（`RULES.ramming`）/ 隐蔽感知（`RULES.camouflage`）/ 战术闪跃（`RULES.abilities.flash_dash`）+ 烟幕副武器；并修复曲射榴弹炮「主武器机制泄漏」并削弱精度为 4×base×距离 | `DEVELOPMENT-batches-2026-10.md` §4.123 · `specs/combat/ramming-stealth-dash.md` · `specs/combat/arc-fire.md` |
| §4.124 | 2026-10-23 | 贴图资产口径收口（程序化生成 + 后期贴图接线；删 AI 出图链与 19 张坦克 PNG）+ 伪 3D 研究（俯视 2.5D，设计预留） | `DEVELOPMENT-batches-2026-10.md` §4.124 · `specs/map/textures.md` · `specs/map/pseudo-3d-2p5d.md` · `docs/ASSETS-PIPELINE.md` |
| §4.125 | 2026-10-24 | **阶段策略已被 §4.131 取代；技术栈纠正仍有效**：零依赖 / `file://` 直开 / Node 像素回归**不是硬约束，只是当前临时选择**；真 3D（WebGL/Three.js）未被架构排除，本阶段不做的理由是缺 3D 美术管线与玩法收益未证实（推翻 §4.124 的第 1、2 条「不选 C」理由） | `DEVELOPMENT-batches-2026-10.md` §4.125 · `specs/map/pseudo-3d-2p5d.md` §3.1 |
| §4.126 | 2026-10-24 | 视野-隐蔽与伪 3D 路线兼容性研究：**路线 B 最好兼容**（只有它让高度同时驱动画面与遮蔽）；但真正瓶颈是现行三个结构性缺陷（`vision` 布尔使灌木=楼房 / 隐蔽值与几何无关 / 只有玩家一侧有隐蔽），**在 2D 下即可先补** | `DEVELOPMENT-batches-2026-10.md` §4.126 · `specs/map/vision-stealth-3d-compat.md` |
| §4.127 | 2026-10-24 | 伪 3D 就绪度：**「无建模基础」是伪约束**（几何已是参数化数据，A/B/C 资产均可由 JSON 生成）；先行基础设施 **I0~I5**（模拟时钟 13 处挂钟 / 高度表 / 统一遮蔽 / 截图回归 / 拾取收口 / 挤出工具）；**I1 全路线共享**，P1 量级修正为 4~5.5 人日 | `DEVELOPMENT-batches-2026-10.md` §4.127 · `specs/map/pseudo-3d-readiness.md` |
| §4.128 | 2026-10-24 | **P1 落地**：I0 模拟时钟（`simNow` 三件套 + 13 处挂钟迁移）/ I1 高度表（`coverTiers[*].height` 18/18）/ I2 高度分档视线（**C 方案**：`LOS_HULL_Z=1.0` ⇒ 灌木挡车体不挡炮塔，hull-down 成立）/ 隐蔽值按覆盖深度折算 / 对称化保留开关未启用。**弹道侧未改** | `DEVELOPMENT-batches-2026-10.md` §4.128 · `specs/map/vision-stealth-3d-compat.md` §9 · `specs/map/cover-system.md` · `specs/combat/ramming-stealth-dash.md` |
| §4.129 | 2026-10-24 | **敌方警戒 UI 指示（? / !）**：纯函数 `alertIndicatorFor` 归并三态（engaged/alert/null）、仅视口内显示（复用 `aabbInView`）、Boss/眩晕/死亡不显示。**修掉一个假绿**：首版用 `fillText` 画字形，而 `mini-canvas` 的 `fillText` 是空实现 ⇒ 两档像素数完全相同；改**路径绘制**后字形才真实可见 | `DEVELOPMENT-batches-2026-10.md` §4.129 · `specs/combat/enemy-ai.md` |
| §4.130 | 2026-10-24 | **AA-d 制动与滑行模型**：制动独立、地形 `brakeGrip`、速度乘子插值；P/W 不再决定刹车 | `DEVELOPMENT-batches-2026-10.md` §4.130 · `specs/map/terrain.md` |
| §4.131 | 2026-10-26 | **品质与单机路线重排**：参考《变节行动》的真 3D 可玩切片，不全量换引擎；少量友军 + 六命令（**已被 2026-10-27 三命令简化取代，见 §4.148(5)**），排除多人；近期 AA → R0 → A0/R1 → G1，远期 M1～M4 | `DEVELOPMENT-batches-2026-10.md` §4.131 · `specs/map/rendering-roadmap.md` · `specs/combat/ally-command.md` |
| §4.132 | 2026-10-26 | AA-a：#AA1 公路加成 HUD 口径 + #AA2 bench 曲射瞄准点 + #AA5 公路豁免文档漂移 | `DEVELOPMENT-batches-2026-10.md` §4.132 |
| §4.133 | 2026-10-26 | bench Enemy Lab 工具（清空敌军 / 生成视口护栏）+ 入口文案 | `DEVELOPMENT-batches-2026-10.md` §4.133 |
| §4.134 | 2026-10-26 | bench 图鉴入口彻底移除 + 战斗 HUD 去掉速度条 | `DEVELOPMENT-batches-2026-10.md` §4.134 |
| §4.135 | 2026-10-26 | 标准模式左下角任务描述可读性（#AA8） | `DEVELOPMENT-batches-2026-10.md` §4.135 |
| §4.136 | 2026-10-26 | AA-b：bench ↔ 正式游戏开火接线对齐（#AA3 七项 + F 键边沿 + 曲射散布圈） | `DEVELOPMENT-batches-2026-10.md` §4.136 |
| §4.137 | 2026-10-26 | AA-c：电磁轨道炮三段声学（充能循环 / 就绪 / 放电） | `DEVELOPMENT-batches-2026-10.md` §4.137 |
| §4.138 | 2026-10-26 | 文档与 skill 一致性收口（AA 批次收尾后整理） | `DEVELOPMENT-batches-2026-10.md` §4.138 |
| §4.139 | 2026-10-26 | **敌方 AI 噪声升级失效 + 交战态呆滞修复**：`decayNoiseHeat` 加 `decayGraceSec` 新鲜窗口（多次射击可累积到阈值）；警觉记忆清空加 `dist<=exitD` 门控（远处可见不再脱战呆滞）；hold 角色超开火距离前压 + defensive 站桩跳过被警觉者（「行动模式呆滞」） | `DEVELOPMENT-batches-2026-10.md` §4.139 · `specs/combat/enemy-ai.md` |
| §4.140 | 2026-10-26 | **敌方 AI 远距火力：开火距离与站位带解耦**：`_effectiveFireRange = band.max × fireRangeRatio(1.5)` 按类别缩放（medium ≈858 / heavy ≈734 / light ≈999 / spg ≈1046）；holdGate 删除 640px 第二道距离闸；脱战判据加 `!los`（看得见就不脱战）。不直接用物理射程 1800（火力过密，用户反馈） | `DEVELOPMENT-batches-2026-10.md` §4.140 · `specs/combat/enemy-ai.md` |
| §4.142 | 2026-10-26 | **敌方警戒图标与 AI 行动脱同步修复**：`alertIndicatorFor` 从 `fightingStates[aiState]` 白名单改为**接战事实驱动**（`aiEngaged && aiState!=='search'`）。旧判据漏掉 §4.140 后接战主体的默认态 `patrol`，导致「AI 开打时图标消失、react 僵直时反而先亮」 | `DEVELOPMENT-batches-2026-10.md` §4.142 · `specs/combat/enemy-ai.md` |
| §4.143 | 2026-10-26 | **敌军弹种中和缺失的消费端 + 难度缩放三层审计**：`ammoStatNeutral` 只写不消费 ⇒ 后期 Lv13 敌军实际穿深 144×2.0=**288mm**（玩家装甲升级无效）；`firePrimaryShell` 现对 neutral 射手把 `ammo.pen/dmg` 当 1.0（弹种特性保留）。审计另确认 `maxSpeed` 仅 Boss 通道、穿深封顶为已知副作用、难度成长主维度为血量（用户裁定维持） | `DEVELOPMENT-batches-2026-10.md` §4.143 · `specs/combat/enemy-scaling.md` |
| §4.144 | 2026-10-27 | **玩家电磁炮充能声：短窗口 + 柔和波形**（用户反馈「太尖锐、时间太长」）：承接 §4.137，只调充能循环的时长与音色，不改三段结构；Boss 侧静音口径不变 | `DEVELOPMENT-batches-2026-10.md` §4.144 · `specs/combat/audio.md` |
| §4.145 | 2026-10-27 | **成长曲线审计工具 + 成长速率再平衡**：新增 `scripts/audit-growth-curve.js`（玩家 5 条商店轨迹 × 敌人四层 × 双向 TTK 蒙特卡洛 ⇒ 优势度曲线）；`maxHp [0.6,2.2]→[0.6,1.8]`、`damage [0.8,1.5]→[0.8,1.35]`、商店 `pen +6→+8` / `dmg +4→+5` / `costGrowth 1.7→1.6`。末节点优势度 balanced 0.73→**1.13** | `DEVELOPMENT-batches-2026-10.md` §4.145 · `specs/combat/enemy-scaling.md` |
| §4.146 | 2026-10-27 | **Agent 配置迁移 `.dsh/` → `.claude/` + docs 一致性收口**：6 张角色卡转 `.claude/agents/role-*.md`（subagent）、5 个流程 skill 落 `.claude/skills/`、`.dsh/` 删除；补 §4.144 索引缺行、清理 PLAN 已完成 §6（归档）、测试项数 58/59 → **59/60** | `AGENTS.md` §3.6/§3.7 · `docs/PLAN.md` · `.claude/` |
| §4.147 | 2026-10-27 | **R0 渲染地基**：I3 三场景截图基线（`browser-baseline.cjs`，冻结首帧、32×18 网格容差）、I4 拾取唯一入口 `pointerToWorld`（battle/bench 全改走它）、性能计数 `js/tank_perf.js` + `__TEST__.perf/mem/battleStartMs`；新增 3 个 Node 测试 | `specs/map/rendering-roadmap.md` §2.1 · `specs/editor/browser-tests.md` |
| §4.148 | 2026-10-27 | **A0 友军指挥闭环**：`js/tank_ally_command.js` 三命令/任务快照/状态机/编队规格；`allyFireTargetFor` 统一击发权威（focus 不暗换、move 最近、follow 随机）；battle 友军编队 + Z/X/C 快捷键（转盘暂时关闭）+ HUD/标记；`RULES.allyCommand` 参数口径 | `specs/combat/ally-command.md` §5.1 |
| §4.149 | 2026-10-27 | **R1 真 3D 可玩切片**：`tank_3d.html` + `js/tank_render3d.js`（原生 WebGL1）+ `js/tank_scene3d.js`；1440×864 小战场、轻倾斜相机、射线拾取、主炮与友军命令、基础破坏/烟尘；零第三方依赖 | `specs/map/rendering-roadmap.md` §2.2 |
| §4.150 | 2026-10-27 | **UI 设计令牌统一**：`js/tank_ui.js` 60 token 唯一来源、七页并入暖橄榄军事终端体系、`index.html` 改版；`test-ui-tokens.js` 锁令牌与字号棘轮 | `specs/combat/ui-layout.md` · `specs/combat/ui-components.md` |
| §4.151 | 2026-10-27 | **友军 Z/X/C 快捷键 + 弹夹炮 R 整装 + 3D 连续开火修复**：命令转盘暂时关闭（`wheelEnabled=false`）、卡牌查看器 C→B；`reloadClipWeapon`；3D 主循环补 `reloadT`/武器状态机驱动；页面新增 R1 验收清单（F1） | `specs/combat/ally-command.md` §5.1 · `specs/combat/weapons-reload.md` · `specs/map/rendering-roadmap.md` §2.2 |
| §4.152 | 2026-10-27 | **阵营环 + 标准模式移除友军据点 + Boss 节点改用标准 strip 生成器（3×3 屏）**：2D/3D 友军淡绿/敌军红环；标准模式保留 2 辆指挥友军、`noOutpost` 不生成据点；`strip.boss` + `fillBands` + Boss 不布防线，方形路径仅无 viewport 回退 | `specs/combat/hud-ui.md`「战场阵营环」· `specs/map/difficulty.md`「尺寸、出生点与性能」· `specs/combat/ally-command.md` §5.1 |
| §4.153 | 2026-10-27 | **文档一致性收口**：修正 §4.150–§4.152 后的现行口径漂移（Z/X/C、卡牌 B 键、五卷页数 20/16/9/8/8、浏览器六链、71 页）；历史归档与 changelog 不动 | `docs/specs/README.md` · `AGENTS.md` §3.7 · `.claude/` |
| §4.154 | 2026-10-27 | **G1 首切片**：`npm run baseline:3d` 3D 场景基线；`applyTankTilt` + `updateTankVisual` 视觉俯仰/侧倾/后坐/扬尘；震屏、破坏扬尘/火花、3D 音频接入；R1 已由用户验收通过 | `specs/map/rendering-roadmap.md` §2.3 · `specs/editor/browser-tests.md` |
| §4.155 | 2026-10-28 | **G1 完整 3～5 分钟遭遇**：纯逻辑波次状态机 `js/tank_encounter.js`（`telegraph→wave→breather→victory/defeat` + 七类事件）+ 三波编成 + `RULES.encounter` 唯一参数口径；页面只做生成/演出/HUD/结算；新增 Node 与浏览器两条 encounter 测试链 | `specs/combat/encounter-director.md` · `specs/editor/browser-tests.md` |
| §4.156 | 2026-10-28 | **G1 性能预算与降级**：`js/tank_perf.js` 原地扩写 `createGovernor` / `updateGovernor` / `getTierConfig`（帧时间 EMA + 逐级升降门控，无 DOM 依赖）；三档与门控参数唯一口径 `RULES.perf`；页面只做「分辨率落 canvas / 按档裁粒子炮弹扬尘 / 节流静态几何重建」，红线（模拟步长、输入采样、HUD、炮弹碰撞判定、AI 决策频率）不降；新增浏览器第八链 + 三档基线 | `specs/map/perf-budget.md` · `specs/editor/browser-tests.md` |

---

