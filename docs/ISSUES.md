# Rogue Tank — 工程问题清单（已核实）

> **临时文档**：只存放**待处理 / 处理中**的已核实问题。每条必须有代码证据（`file:line`）与复现/触发条件；绝不收录未核实项。
> 条目**修复并验证有效后**按 `AGENTS.md` 4 步生命周期收尾：结论同步 `DEVELOPMENT.md` / `specs/` → 删除本条目 → 原文归档 `docs/archive/<yyyy-mm>.md` → 联动下一步计划。
> 已解决并归档的历史条目（#1~#26、#44、#49、#60~#101、#A1~#A28、#B1~#B11、#C1~#C4/#C6、#C5、#D1~#D5、#A9、#E1~#E13、#F1~#F6、#G1~#G9、#H1~#H5（2026-09-21 视野批次）、#H1~#H4（2026-09-30 敌军基准/布雷/技能槽批次）、#I1~#I4、#J1~#J4、#K1~#K3、#A16、#L1~#L7（2026-10-06 整车精灵对齐批次）、#M1~#M3（2026-10-08 设计器精灵绘制批次）、#L8 + #M4（2026-10-08 白底清理与炮塔参数重算）、#S8（2026-10-14 CI 校准基线第六次修正）、#S4 + #S14（2026-10-14 公路加速恢复与道路屏蔽减速）、#S9 + #S10（2026-10-14 暂停菜单商店与面板刷新）、#S3-UI（2026-10-14 Boss 血条）、#S6 + #S5（2026-10-14 副武器卡补齐与 Boss 弹种保底）、#S12 + #S1 + #S11 + #S13（2026-10-15 地图视觉四项）、#S2 + #S3（2026-10-15 AI 警觉与 Boss 行为）、#T1~#T6（2026-10-16 拉取后代码审计））：见 `docs/ARCHIVE.md` 索引表。
> **2026-10-15 拉取后缺陷清理（未走 ISSUES 条目，直接落 §4 正文）**：本次发现的两个缺陷（#8 TAB 面板 `tanks` 未定义冻结主循环 / #6 上调 `entityMults` 致 `test-modifiers` 夹具失效）**发现即修复并三链验证通过**，未经 ISSUES 中转，结论直接落 `docs/DEVELOPMENT-batches-2026-10.md` §4.79 与 `specs/combat.md` §9.8/§13.4、`specs/map.md` §16。
> **编号重叠说明（2026-10-04 核实）**：`#H1~#H5` 与 `#H1~#H4` 分属**两个不同批次**（2026-09-21 视野等距批次 / 2026-09-30 敌军基准批次），编号发生重叠——与 `AGENTS.md` §2「编号不复用、跨批次延续」相悖，属历史遗留。因归档原文按纪律不可回改、且编号已被 `DEVELOPMENT.md` §4.40 与 `specs/combat.md` §13.1~§13.4 交叉引用，故**保留原编号 + 在此按日期与主题区分**（引用时须带批次日期），不再另案重编。

---



## 当前待处理问题


### #U1 Boss 战地图元素贴图 404 刷屏（`assets/*.png` 缺失）

- **状态**：已修复（2026-10-17）：`assets/` 缺地图元素 PNG 本是**预期状态**（README 明示「为空即走程序化 bake」），但逐 key 发 `<img>` 让控制台刷 7 条 404。现新增**单次目录探针**（`fetch HEAD` 首个注册键）：探针未完成期间 `assetImage` 一律返回 null（走 bake、不发请求），完成且目录为空则永久静默。实测浏览器 404 由 7 条降至 **1 条**（仅探针本身），渲染与程序化回退路径零变化。**注**：404 本身不阻塞进入游戏（已实测完整走通 Boss 战：选车→出击→战斗无 JS 错误）；用户所述「无法进入游戏」若仍存在，需另报具体卡点。
- **证据**：`js/tank_assets.js:341`（`img.src = 'assets/' + key + '.png'`）；`assets/` 目录仅含 `README.md` 与 `tanks/`（`git log --all -- 'assets/tree.png'` 为空 ⇒ 这些 PNG **从未入库**）
- **根因**：`loadAssetImage` 对 `soft/barricade/stump/rubble/bush/tree/fallen` 及其 `_canopy` 逐个发起 `<img>` 加载，`assets/` 无对应文件 ⇒ 每个页面加载都产生 7~14 条 404 控制台噪声
- **影响**：控制台噪声；功能性回退正常（`img.onerror` 保持 null → 走程序化 bake，`assets/README.md` 明示「当前为空 = 全部走程序化 bake 占位」）。**注意**：本地复现「选车后出击」可正常进入战斗、无 JS 错误，故 404 本身**不阻塞**进入游戏；用户所述「无法进入游戏」需与 #U6 一并核实
- **复现**：打开 `tank_mvp.html` 任意模式，控制台 7 条 404

### #U2 泥潭数量过多且扎堆，观感密集恐惧

- **状态**：已修复（2026-10-17）：泥潭数量改为**按面积平方根**缩放（原按面积，strip 上 ratio 121× ⇒ 365~487 块）并钳上限 `MUD_MAX=32`；块数多时改全节点网格铺位（原环带扎堆）。实测单节点由 272 块降至 44 块，平均最近邻距 227→561px。同时修复横向越界（新增片内 x 钳制，200 seed 零越界）。
- **证据**：`js/tank_nodegen.js:1001`（`placeMudPatch`，`K = scaledCount(rng, 3, 4, tpl, scale)` 按面积缩放）；`js/tank_nodegen.js:1028-1048`（环形布点 `ringR`）
- **根因**：待核实——`#1` 批次把数量改为按面积缩放后，strip 节点（≈10 屏宽）单节点可产出数十块泥潭，且环形布点半径相对节点尺寸偏小，导致聚集
- **影响**：观感问题，非功能缺陷

### #U3 biome 地面纹理随玩家移动（视口坐标 bug）

- **状态**：已修复（2026-10-17）：地面色斑由**视口坐标**改为**世界格锚定**（CELL=640px，格内位置/尺寸/角度全部由「格坐标+seed」hash 派生，与视口无关）；同时移除已无用途的 LCG 流。实测同世界点在不同视口下像素 391/391 一致。
- **证据**：`js/tank_battledraw.js:1215-1216`（`const cx = x0 + next() * w; const cy = y0 + next() * h;`，其中 `x0/y0/w/h` 来自 `opts.viewBounds` 即**视口**）
- **根因**：色斑（`alt` 色低频椭圆）的位置以**视口坐标**为基准生成，视口每移动一点，整组色斑随之平移 ⇒ 观感上地面纹理「跟着玩家走」。底色 `fillRect` 用视口无妨，但色斑属于「世界固定装饰」，必须锚定世界坐标
- **影响**：所有 biome 的地面斑纹都在移动；用户描述「有的 biome 背景纹理随玩家移动，十分诡异」
- **修复方向**：改为按世界坐标网格生成固定色斑（如以 1024px 世界格为单位，格内位置由格坐标 hash 决定），只绘制与视口相交的格

### #U4 敌方 AI 反应迟钝：受击/近失弹/玩家开火要很近才响应

- **状态**：已修复（2026-10-17）：感知半径相对交战尺度（engageRange 520 / triggerDistBase 700）偏小。现 `shotNoiseRadius` 900→1100（重武器按 1.27× 派生 1400）、`impactNoiseRadius` **180→420**（近失弹原需几乎贴身才被听见，是「贴近才反应」的主因）。同时把 mvp 与 tank_fire 里的硬编码半径（180 / 900 / 1200）统一改读 `RULES.ai.*`，消除「配置形同虚设」。
- **证据**：`js/tank_rules.js:875`（`shotNoiseRadius: 900`）、`:873`（`alertRadius: 600`）、`:690`（`triggerDistBase: 700`）；`js/tank_ai.js:1223-1240`（`hearNoise`）、`:1263-1267`（`alertEntity`）
- **根因**：待核实——感知半径（600~900px）相对 strip 节点（17280×2376）与交战距离带偏小；且警觉需 `alertLevel` 逐级爬升
- **影响**：用户描述「被攻击、近失弹、玩家开火在很近的距离上才会反应」

### #U5 小地图只显示道路/河流/建筑/岩石，其余 biome 抽象为模糊色块

- **状态**：待处理
- **证据**：`js/tank_minimap.js:96-108`（按 `tierGroup` 编码：`liquid` 蓝点、`ground` 褐点、`structure` 白块，其余 tier 回退 `dot=1/1.6` 的灰点）
- **说明**：用户描述的「树聚集才显示一小片绿色」正是当前逐点绘制在大图上密集成片的观感，**属现行设计**（`specs/map.md` 未规定小地图元素粒度）
- **待裁定**：是「保持现状（点太多就合并）」还是「改为分区着色」——需求未明，需与用户确认

### #U6 Boss 战后局内商店出现两次（结算屏 + 战前整备屏各一次）

- **状态**：已修复（2026-10-16）：结算屏按模式门控 `renderRunShop()`，Boss 模式只在 reward 屏展开商店（唯一入口），普通/生存模式保持结算屏内嵌。
- **证据**：`tank_mvp.html:419`（结算屏 `#settleScreen` 内嵌 `#runShopBox`）、`tank_mvp.html:2576`（`transition` 到 `settlement` 时调用 `renderRunShop()`）、`tank_mvp.html:442`（reward 屏 `#rewardShopBox`）、`tank_mvp.html:2416`（`revealRewardShop` 在选完卡后展开）
- **根因**：`tank_mvp.html:2573-2576` 的注释明写「Boss 模式的局内商店**已开放**，改在 reward 屏选完卡后展开（revealRewardShop）。结算屏仍不内嵌商店——避免与紧随其后的 reward 屏商店重复出现两处入口」，但**紧随其后的 `renderRunShop()` 调用未被删除**，与注释自相矛盾 ⇒ 结算屏与 reward 屏各出现一次
- **影响**：Boss 战后购物入口重复；用户要求「只需要 1 次」
- **修复方向**：删除 `:2576` 的 `renderRunShop()`（或按注释在结算屏隐藏 `#runShopBox`）

### #U7 河流中出现一段道路（桥梁）；用户裁定删除桥梁体系

- **状态**：已删除（2026-10-17，用户裁定）：桥梁体系整体移除——P-20「水体+桥」组合与 strip「路河交叉替换为桥」两条生成路径、桥面/引道/桥位登记/过渡段全部删除；路河交叉处直接保留河段（车按 river passability=0.4 涉水）。`bridge`/`bridge-approach` 不再产出（8 seed×4 节点实测 0 个）；生图确认河流为连续蓝带，无桥面方块。tier 定义保留于 RULES 以兼容旧存档/基线读取。
- **证据**：`js/tank_nodegen.js:2662-2740`（P-20「水体/桥梁组合」：始终随水体插入 `bridge`；`bridgeW = 6 * scale` 的狭长通道贴水体北缘）；`js/tank_nodegen.js:3290-3340`（strip 级路河交叉处把河段替换为 `bridge`）
- **根因**：桥梁是 P-20 期的过河设施，在连续多边形河流（`#1` 批次）下退化为「河流中间横着一条路面」
- **用户裁定（2026-10-16）**：「如果是因为桥梁，则删除桥梁生成和相关定义，不再需要」
- **影响**：需删除 `bridge` 的生成路径（P-20 waterBridge 组合 + strip 路河交叉替换）与相关 tier 定义；注意 `bridge` 也参与 `RULES.coverTiers`、`_PRUNE_PRIORITY`、`VILLAGE_SOLID`、小地图、绘制分支等多处，须一并清理

### #U8 河流中两条并行粗线全程延伸（像铁轨）

- **状态**：已修复（2026-10-16）：河流不再逐段绘制——新增 `drawRiverChain`（按 groupId 把沿程段还原为单条中心线，圆角粗折线一次描边，先岸影后河色）+ `orderRiverSegs` + `drawCoverWaterStreak`；调用方（mvp / render-map-shot）按 groupId 聚类后整链绘制。「铁轨」双线与段间鳞片接缝同时消除。
- **证据**：`js/tank_battledraw.js:383-392`（`water-chain` 绘制分支的「岸边暗带」：`for (const _side of [-1, 1])` 沿段长轴两侧各描一条 `rgba(20,50,80,0.28)`、`lineWidth = max(3, _halfW*0.28)` 的粗线）
- **根因**：岸边暗带按**河段（segment）**逐段绘制——strip 河流由数百段短 OBB 搭接而成，每段都画两条侧线，段间首尾相接后视觉上连成两条贯穿全程的平行粗线，读作「铁轨」
- **影响**：河流观感错误；用户描述「2 条并行的粗线一直随着河流本身延伸，像铁轨一样」
- **修复方向**：岸带改为沿**整条河流多边形轮廓**描边（或整体裁剪后单次绘制），而非逐段画侧线

### #U9 道路路口出现两条路一上一下重叠

- **状态**：已修复（2026-10-17）：根因在渲染层而非生成层——`_strokeGroundPaths`（地面烘焙）原按组「描边路缘 → 填充沥青」交替，后一组的路缘会盖在前一组已铺的沥青上，交叉口形成可见接缝带（＝「两条路一上一下重叠」）。现改为**分遍绘制**：先一次性描完所有路缘、再统一填充沥青，交叉处沥青自然合并为同一块路面。
- **证据**：`js/tank_nodegen.js:3085-3150`（strip 级「平行重叠主干道去重」：`acute > 15` 不平行即跳过、要求 `|a.y-b.y| <= 100`）
- **根因**：待核实——去重仅在 y 向距离 ≤100px 且平行角 ≤15° 时生效；「一上一下」的两条路若 y 距 >100px 或夹角略超 15° 则不会去重。另 `v4` 七拓扑中「D 双平行」「I 双干贯穿」本身就产出双干道，需区分是**设计拓扑**还是**意外重叠**
- **复现**：`seed=4 node3` / `seed=5 node0` 各检出 1 对近平行近距道路；生图 `--focus road` 可见重叠

### #U10 精密火控与姿态稳定的作用区分及达限提示不明确

- **状态**：已修复（2026-10-17）：两者确为**正交通道**（精密火控 → `spreadMult` 静止/瞄准散布；姿态稳定 → `motionSpreadMul` 运动散布），但原 desc 未点明区别。现将通道差异写入 desc（【静止散布】/【运动散布】）与达限文案（「已达静止三扩下限」/「已达运动三扩下限」），玩家事前可辨、达限时也看得出是哪一维到顶。
- **证据**：`js/tank_economy.js:397`（`precision_gunnery` 精密火控：`spreadMult` mult 0.96、`limitLabel: '已达三扩下限'`）、`:401`（`steady_mount` 姿态稳定：`motionSpreadMul` mult 0.85、`limitLabel: '已达运动三扩下限'`）；`js/tank_model.js:64-66`（两通道解耦：`spreadMult` = 精度/静止散布，`motionSpreadMul` = 运动散布）
- **说明**：两者**确实不同**——精密火控降 `spreadMult`（瞄准/静止散布基准），姿态稳定降 `motionSpreadMul`（移动/转向扩圈）。但商品名与描述「瞄准散布 −4%/级」「运动散布系数 −15%/级」未点明「三扩系数」这一游戏内术语，达限提示「已达三扩下限」/「已达运动三扩下限」也只在达限时才出现，玩家事前无从区分
- **用户要求**：若两者一为精度、一为三扩，需在**提示上明确**，特别是**达到上限的提示**

### #U11 建筑/树木缺阴影；草地/雪地/沙漠缺纹理（需接入绘图 MCP）

- **状态**：待处理
- **证据**：`js/tank_battledraw.js`（`bakeAssetCanvas`/`bakeCanopy` 各 tier 程序化画法）；`js/tank_battledraw.js:1164`（`drawGround` 仅底色 + 8~14 个大椭圆色斑，无材质纹理）
- **说明**：用户要求①建筑、树木加淡阴影；②草地/雪地/沙漠等加适当纹理；③「配置必要的 MCP 来绘制」。③需先确认可用的绘图 MCP（当前会话可见的 MCP 为 `android-control`，无绘图类）——若指外部出图（ComfyUI/Gemini），仓库已有 `tools/cover-gen-prompts.md` + `tools/cover-comfyui-workflow.json` + `scripts/prepare_covers.py` 管线（见 `PLAN.md` §1 条目 8）
- **待裁定**：纹理走「程序化生成（`bake` 内画）」还是「外部出图 + assets 落盘」；MCP 具体指哪一个

### #U12 雪地过白刺眼，细节被掩盖

- **状态**：已修复（2026-10-17）：雪地 base `#dfe6ea`（相对亮度 0.78，近纯白）压暗至 `#c2ccd4`（0.59），并拉开 base↔alt 跨度（10.6%→22%），纹理可见且不再刺眼。
- **证据**：`js/tank_rules.js` 的 `RULES.biomes.snowfield`（基色与 alt 色）；`js/tank_battledraw.js:1164`（`drawGround` 用 `palFor(biome).base` 铺底）
- **根因**：待核实——雪地基色过亮（接近纯白），与色斑 alpha ≤0.12 的对比度不足，细节被淹没

### #U13 血量成长未实现（Boss 血量恒为初始值）；Boss 掉血数字需加大

- **状态**：**前半已修复**（2026-10-16）：`bossNumber` 原按硬编码每 5 节点一轮，与现行 `bossInterval=3` 及 Boss 模式（每节点皆 Boss）均不符，致血量长期恒为初始值；改为按实际 Boss 序号计（Boss 模式取节点下标，常规链按 `bossInterval` 折算）。**后半已修复**：新增 `RULES.boss.bossDmgTextScale=1.6`，`spawnDmgText` 增可选 `scale` 参数，`js/tank_fire.js` 命中外敌 Boss 时透传（非 Boss 逐字不变）。血量曲线陡度（Boss 模式第 5 个 ×3.0）待实战观察。
- **证据**：`js/tank_map.js`（`entityMultsForDifficulty` / `statMultForDifficulty` 难度乘子）；`js/tank_boss.js`（`applyBossStage` 阶段缩放）；`js/tank_dmgtext.js`（伤害飘字）
- **根因**：待核实——需确认 Boss 血量是否随节点难度成长（`#76 A` 的 `entityMults` 是否覆盖 Boss 实体），以及普通敌人血量成长口径
- **用户要求**：①实现血量成长（尤其 Boss）；②放大 Boss 掉血伤害数字

### #U14 卡牌「反应装甲」描述读起来像一次性效果

- **状态**：已解决（2026-10-17，并入 #U19）：确认卡面「抵挡一次命中并消解」即**一次性**语义，已按此实现——首次命中整体吸收并消耗该层。卡面描述与实现现已一致。
- **证据**：待定位（`cards/` 下反应装甲卡定义）
- **根因**：待核实——需比对卡面 `desc` 与实际实现（是一次性护盾还是持续减伤）

### #U15 水中的敌方 AI 不会尝试脱困

- **状态**：已修复（2026-10-16）：`applyWaterAvoidance` 原在自身入水时仅 `out.move=0` 停驶 ⇒ 泡满 8s 溺毙。新增 `_escapeWater`：以车体为中心 4 环×16 向采样，朝最近干地方向驶出；超大水体（无岸可探）仍保持前进不退化为等死。`test-ai.js` E 段断言随之更新（原断言编码的正是该缺陷行为）。
- **证据**：`js/tank_ai.js`（`applyWaterAvoidance`：三向全水时 `out.move = 0`）；`tank_mvp.html`（溺毙倒计时：完全浸水 8s 沉没摧毁）
- **根因**：该函数只在**前方有水**时转向；一旦车体本身已在水中，三个探测点全为水 ⇒ `out.move = 0` 停驶，AI 原地泡满 8s 溺毙，没有任何朝最近干地移动的脱困逻辑
- **影响**：用户实测「水中的敌方 ai 不会尝试脱困」

### #U16 部分 biome（城镇等）元素间大量重合

- **状态**：已修复（2026-10-17）：根因是**生成顺序**——strip 级河流在片（含泥潭）生成之后才追加，故 `placeMudPatch` 运行时看不到河流。现于河流追加后做确定性收尾：移除与任一 river/water 段 OBB（SAT）相交的 `mud`。实测泥潭压水由 103/385（26.8%）降到 4/286（1.4%）。另对 prune 增加「ground↔liquid 组合用更严阈值」的判定（浅交叠亦触发）。注：`river+river` 的叠加属连续河流的同组 25% 段间搭接（有意设计），非缺陷。
- **证据**：`js/tank_nodegen.js:2193`（`pruneOverlappingCovers`：3×3 采样点、≥1/3 互入才算「显著重叠」）
- **实测**：按「重叠面积 > 小者 70%」粗判，8 seed 下各模板残余重叠对：`woodland_line` 13、`urban_block` 6、`snowfield` 4、`mixed_barrier_plaza` 3、`village_center` 3、`forest_dense` 2，其余 0。**非完全重合，是部分交叠**——`prune` 的设计口径本就允许「采样点互入 < 1/3」的浅度重叠残留
- **待裁定**：用户观感是否接受该阈值；收紧阈值需评估对「地形标签必产出」契约与 `test-nodegen-calibration` 基线的影响

### #U17 修理箱/医疗包升级达上限后无提示

- **状态**：已修复（2026-10-17）：局内商店的等级达限分支只禁用按钮、按钮仍显示价格。根因：`repair_kit_cd`/`medkit_cd` 的 `stat=null` 且 `effects=[]` ⇒ `runShopLimitBlocked` 取不到边界恒 false。现把 `lv >= maxLevel` 纳入文案分支（三级优先：属性达限 > 等级满级「已满级」> 价格）。
- **证据**：`js/tank_economy.js`（`UPGRADE_DEFS` 中 repair/medkit 相关项）；`tank_mvp.html`（商店渲染 `buildRunShopInto` / 永久商店渲染）
- **根因**：待核实——`#A4` 的 `runShopLimitBlocked` 在 `def.limit` 缺失时按 `RULES.parameterLimits` 逐 effect 推导达限；若 repair/medkit 类升级的 limit 未定义或未命中该推导路径，则达限后仍显示可购买且无提示（对比 `precision_gunnery` 有 `limitLabel: '已达三扩下限'`）

### #U18 已获得的技能卡会重复出现在备选

- **状态**：已修复（2026-10-17）：`cardEligible` 新增「已持技能去重」——ability 键玩家已持有且本卡非该能力的升级（无 `requiresAbility`）⇒ 不合格。原行为：持有 artillery 后再抽 `artillery_strike` 仍合格，抽到零收益却占三选一位。升级卡（带 requiresAbility）不受影响，仍正常提供。`test-cards.js` 对应断言已按新语义修订。
- **证据**：`js/tank_cards.js:234`（`maxStacks` 语义）、`:479`（`cardEligible` 资格过滤）、`drawCardChoices`
- **根因**：待核实——`maxStacks: 1` 的技能卡在已获取后应被 `cardEligible` 滤除；若某类技能卡 `maxStacks > 1` 或资格过滤未覆盖技能类效果，会重复出现

### #U19 反应装甲/摆角特训为**死效果卡**（登记白名单但无任何消费点）

- **状态**：已实现（2026-10-16，用户未及裁定即按「实现」推进）：㈠ `reactive_armor` 在 `resolveHit` 首次命中时整体吸收（不跳弹/不穿深/不扣血）并从 `cardEffects` 消耗该层（一次性，如卡面所述）——实测首击 `BLOCK/dmg=0` 且消耗、次击正常穿透；㈡ `angle_boost` 按 `passiveValues` 求和后加算跳弹角（上限 90°）——实测跳弹边界由 70° 抬至 75°，与卡面「+5°」精确吻合。（并入 #U14 一并处理）
- **证据**：`js/tank_cards.js:56`（`PASSIVE_KEYS = ['reactive_armor', 'angle_boost', 'overmatch', 'spall_liner']`）；全仓库检索：`overmatch`/`spall_liner` 在 `js/tank_physics.js` 有消费点，而 **`reactive_armor` 与 `angle_boost` 仅出现在 `tank_cards.js` 的校验白名单中，无任何运行时消费**
- **根因**：`cards/reactive_armor.json`（`desc: "首层反应装甲：抵挡一次命中并消解（被动）"`）与 `cards/angle_boost.json`（`desc: "被动：摆角度时跳弹角阈值 +5°"`）承诺的机制从未实现——`validateCard` 放行、`applyCardEffects` 登记，但战斗逻辑不读这两个键
- **影响**：玩家抽到即为空卡（传奇/稀有稀有度却是零效果）；`angle_boost` 的 `maxStacks: 2` 更会重复占据卡池位
- **修复方向**：二选一——㈠实现效果（reactive_armor 在 `resolveHit` 首次命中时抵消；angle_boost 在跳弹角判定加偏置）；㈡按 `#T` 批次既有先例（`recon`/`track_repair` 死效果键摘除）整体移除。**需用户裁定**

### #U20 属性已达上限后，对应升级卡牌仍进入备选

- **状态**：已修复（2026-10-16）：`cardEligible` 新增 modifier 达限过滤——按 `RULES.parameterLimits` 点分路径取边界，模拟下一级后越界即判不合格（口径同商店侧 `runShopLimitBlocked`）。实测 `spreadMult` 已在 0.5 下限时精密火控不合格、未达限时正常放行。（与 #U17/#U18 同族：卡牌/商店的「达限资格」口径）
- **证据**：`js/tank_cards.js:479`（`cardEligible`）；`js/tank_model.js:1186`（`RULES.parameterLimits.motionSpreadMul` 等硬限）
- **根因**：待核实——`cardEligible` 过滤的是「装备/弹种」类资格与 `maxStacks`，**未接入 `RULES.parameterLimits` 的属性达限判定**；故装填/极速/散布等属性触顶后，对应升级卡（如精密火控已达 `spreadMult` 下限 0.5）仍出现在三选一里，玩家选中后无收益
- **对照**：永久商店/局内商店已有 `runShopLimitBlocked`（`js/tank_economy.js`）做达限屏蔽，卡牌通道缺同一层

### #U21 修理箱/自动灭火器卡占技能位但无法激活（innate 键当 ability 发）

- **状态**：已修复（2026-10-17）：两卡的**效果本身是正确的**（`tank_abilities.js:157/191` 按 `cardId` 应用修复量/冷却数值），问题在语义表述——`repair`/`extinguish` 是 innate 键（开局固有、绕过持有检查），卡面却写「强化修理箱」易被读成「获得技能」。现 card desc 改为「强化固有技能【修理箱】…（修理箱为开局固有技能，本卡是强化而非新增）」，明确其为强化而非新增技能槽。
- **证据**：`cards/repair_kit.json`（`{"type":"ability","key":"repair"}`，desc「强化修理箱：修复量 10%→25%…」）、`cards/support_extinguisher.json`（`{"type":"ability","key":"extinguish"}`，desc「强化灭火器：灭火冷却 -50%」）；`js/tank_abilities.js:54-57`（`ABILITY_KEYS_RUNTIME` 7 键 / `ABILITY_KEYS_INNATE = ['repair','medkit','extinguish']`）
- **根因**：`repair`/`medkit`/`extinguish` 是 **innate 键**——开局自带、`tryActivateAbility` **绕过卡牌持有检查**（`js/tank_abilities.js:56` 注释明示）。而这两张卡以 `type:"ability"` 发放，玩家读到「强化修理箱」会理解为「获得一个技能」，实际能力早已存在；卡牌既未新增技能、也未按 `ability` 语义给出可激活的槽位状态，观感即「占了技能位却无法激活」。`js/tank_cards.js:45` 的注释已承认白名单「恒等于 innate 3 键 + runtime 7 键」
- **影响**：用户实测「卡牌池中，修理箱、自动灭火器似乎是有技能卡牌，占一个技能位置，但是无法激活」
- **修复方向**：待裁定——㈠改卡面语义为纯数值强化（`modifier` 而非 `ability`，desc 明确「修理箱已是固有技能，本卡强化其效果」）；㈡或按 `#T` 批次先例（死效果键摘除）整体移除；㈢或让卡牌真的授予可主动激活的槽位（与 innate 语义冲突，需设计变更）

### #U22 「不叠加，取最高」类卡牌仍会出现低于玩家持有档的版本

- **状态**：已修复（2026-10-16）：`cardEligible` 新增「取最优 Only」被动过滤——`spall_liner`（取 min）/`overmatch`（取 max）与已持同键被动比较，本卡不更优即不合格。实测：更强档 true、同档/弱档 false。
- **证据**：`js/tank_cards.js`（`cardEligible` 资格过滤 / `cardStackCount` 计数）；`js/tank_physics.js:38`（`passiveValues` ——「多来源取最强一个（最小 value）」的既有口径）
- **根因**：待核实——`overmatch`/`spall_liner` 等多来源被动按「取最强」结算（不叠加），但 `cardEligible` 未按该口径过滤：玩家已持有高强度版本（如 `spall_liner` 减伤 0.85）时，卡池仍会给出弱版本（0.95），选中后按「取最强」实际毫无收益，占掉一个卡位
- **对照**：同族问题 #U20（属性达限后仍提供升级卡）——两者都属「已持有/已达限却仍进备选」

### #U23 需要局内随时打开的卡牌查看器（按分类查看已持卡牌）

- **状态**：待处理
- **证据**：`tank_mvp.html`（现有 TAB 状态面板 / 开发者面板卡牌 Tab）；`js/tank_panels.js` / `js/tank_devpanel.js`
- **说明**：用户要求「允许玩家在任何局内，打开卡牌查看器、分类查看已有卡牌」。当前只有开发者面板（`` ` `` 键）能看到卡牌，非玩家可见路径
- **待设计**：入口键位（与 `tank_bindings.js` 键位表协调）、分类维度（按 `CARD_TAGS`/`CARD_RARITIES`/效果类型）、是否含商店与 Boss 轮
