# 战术坦克 Roguelike — 坦克编辑器与工具链规范 (Tank Designer & Tooling Spec)

> 权威子文档：由主文档 docs/DEVELOPMENT.md 索引。
> 涉及页面与模块：tank_designer.html, tank_compare.html, js/tank_halfgeom.js, js/tank_presets.js, js/tank_schema.js, tools/bake.html

---

## 1. 坦克设计器 (tank_designer.html)
- **多边形顶点编辑**：车体/炮塔多边形自由编辑（半侧对称几何，js/tank_halfgeom.js halfFromFull 镜像重建全形）；逐边装甲厚度设定（front/side/rear faces）。
- **双中心分离**：turret.axis（炮塔自身旋转轴，局部帧内）与 turret.pivot（绕车体旋转中心，相对车体）完全分开；运行时 applyTankConfig 归一化平移保证"局部原点=旋转轴"不变量；设计器提供青色自身中心标记 + 橙色旋转中心标记 + 一键居中对齐按钮，防旋转甩尾。
- **炮管/炮盾预设**：js/tank_presets.js BARREL_PRESETS/MANTLE_PRESETS 表；normalizeBarrel 归一化（len/width/muzzle/evac/jacket 缺省兜底）。
- **模块/成员位置不再支持自定义**（2026-08-26 P-49 定案）：命中判定改为几何分区+概率抽取（规范见 specs/combat.md），旧 json 的 modules 字段加载时静默忽略。
- **属性耦合链实时反馈**（2026-09-06）：设计器「基础参数」面板实时展示基于出厂几何与战斗参数推导的耦合结果——穿深/单发伤害→装填时间与散布惩罚倍率、车体尺寸→最大可用马力上限，以及车体面积物理缩放的内部模块易损因子（`moduleSizeFactor`，0.70x~1.30x，基于 2500 px² 标定：大车体内部宽敞不易损，小车体内部紧凑易损；完整耦合链见 §5）。
- **甲弹对抗内置测试**：入射角/等效厚度/跳弹判定实时预览。
- **保存链路**：POST /api/tanks/<id> 写回 tanks/<id>.json；mvp/compare 重载列表即生效。

---

## 2. 参数对比页 (tank_compare.html)
- 表格化列出 tanks/ 全部配置：标量数值字段可编辑（极速/穿深/装填/装甲等）、枚举字段下拉（heightClass/muzzle 样式）、结构化字段按「火力→防护→机动→杂项」四组分区展示（分组语义对齐 RUN_SHOP_DEFS）。
- **单位直标编辑**（2026-08-26）：极速以 km/h 输入/显示、炮管长度以 m 输入/显示；换算只在 UI 层，tanks/*.json 存储格式不变。原「真实单位标定」只读栏随单位直标取消；弹速保持 px/s 裸设定（无真实单位换算显示）。**（2026-09-06 P-48 重构后以本节下一条为准；本条为首次落地记录。）**
- **P-48 对比器单位标定与分组重构（2026-09-06 落地）**：
  - 极速 km/h、炮管长度 m 直标编辑落地，换算仅在 UI 渲染层与 RULES 参数字段联动，存储 JSON 格式与物理单位不乱。
  - 精度改用单一「100m 散布(m)」定义：双输入框实时联动，换算公式为 `spread100m = 100 × SPREAD.base × spreadMult`；反向 `spreadMult = 100m散布(m) ÷ (100 × SPREAD.base)`。
  - 参数列按 Firepower (火力)、Armor (防护)、Mobility (机动)、Misc (杂项) 四类分组，组头带对应图标渲染，功重比等指标迁入机动组尾部。
  - 彻底移除原「真实单位标定」只读栏。
- **精度 100m 口径设定**（2026-08-26 首版；现行以 2026-09-06 P-48 版为准）：首版为双输入框（静止 σ_eff / 最差 σ_worst 双口径联动）；**P-48 简化为单一「100m 散布(m)」定义**——`spread100m = 100 × SPREAD.base × spreadMult`、反向 `spreadMult = 100m散布(m) ÷ (100 × SPREAD.base)`，两版同源于 spreadMult 单参数。
- 编辑后重组同构对象保存回写；几何字段只读提示交设计器处理。

---

## 3. 字段架构表 (js/tank_schema.js)
- FIELD_ROWS 单一来源：designer/compare 共用字段清单+枚举，杜绝两页字段定义漂移（当前 designer 页不消费 FIELD_ROWS，仅 compare 渲染）。
- 每行带 `group` 四分类标记（'firepower'/'armor'/'mobility'/'misc'，对齐 RUN_SHOP_DEFS 分组语义），compare 页按组序 火力→防护→机动→杂项 分节渲染。
- 可选 `edit` 元数据（单位直标，纯数据描述）：`{ unit, factor:[RULES子键,系数键], op:'div'|'mul' }`——op='div' 存储值=输入÷系数（maxSpeed：px/s = km/h ÷ RULES.speed.kmhFactor=0.4）；op='mul' 存储值=输入×系数（barrel.len：px = m × RULES.scale.PX_PER_METER）。系数唯一权威为 RULES 对应键。
- 可选 `special:'spread100m'` 标记：compare 页用「100m 散布范围(m)」联动输入框替换普通数字框（见 §2）。

---

## 4. 资产烘焙工具 (tools/bake.html)
- 遍历 ASSET_DEFS 离屏烘焙 + 锚点十字标注 + 合成预览，canvas.toBlob 逐张导出 PNG 到 assets/。
- file:// 可直开，零服务器依赖。

---

## 5. P-49 模块/成员概率分区系统与设计器耦合链（2026-09-06 落地）
- **模块/成员几何概率分区与耦合链全线实施**：
  - 废除设计器自定义模块/成员悬浮或坐标点挂载，全部改为基于多边形几何分区与概率判定。
  - **炮塔四象限分区**：以炮塔几何中心为局部坐标系原点（按炮塔朝向旋转）。左前（炮手 50%、炮闩 5%）、右前（车长 30%、装填手 30%、炮闩 5%）、左后/右后（弹药架各 50%）。象限内互斥抽取。
  - **车体纵轴区段**：以前置/后置炮塔构型按纵轴段划分驾驶员、弹药架及发动机区间（前置：前 10% 驾驶员/弹药架，中 40% 弹药架，后 50% 发动机；后置：前 50% 发动机，中 10% 驾驶员/弹药，后 40% 弹药架）。
  - **新键 breech（炮闩）**：MODULE_LABELS / tank_physics case / 修理清除表等全线接通。受损或重伤期间坦克短时完全无法开火，修理箱可清。
  - **属性耦合链**：装甲厚度→重量上升；车体尺寸变大→可用马力上限提升、最大设计重上限提升，且车体面积物理缩放降低内部模块被击中的易损因子（`moduleSizeFactor` 在 `[0.7, 1.3]` 钳制）；基础穿深/伤害变大→装填时间与散布倍率（三扩系数）惩罚上升。
  - **参数双层限制**：80t 玩家设计上限限制（deriveWeight 限制出厂几何）；局内卡牌与局前升级可突破该限制，但受限于 240t 运行时总硬上限。
  - **卡牌概率修正**：增强火控卡可加成炮手/炮闩被中率，装填卡可提升弹药架/装填手被中率。单项加成加法计且 ≤25%，修正后单区概率 clamp ≤90% 保留正常击穿无额外受损的「余量」。
  - 坦克设计器 `tank_designer.html` 与对比器 `tank_compare.html` 实时回显全套耦合参数、易损因子以及派生重量状态。
  - 测试链全链路覆盖模块概率抽样统计断言，测试全绿。

---

## 6. 坦克贴图与战术涂装视觉规范 (Tank Visual & Camo Spec)
- **多边形图案叠层 (Polygon Pattern Overlay)**：
  - 基于 `tank_paint.js` 的 `paintClipLocal` 进行多边形裁剪后叠层渲染；
  - 包含 4 套标准战术迷彩（`texture` 字段）：
    1. `camo-forest`（森林迷彩）：深绿/墨绿/暗褐斑块交错；
    2. `camo-desert`（沙漠伪装）：沙黄/浅褐/风蚀斑点；
    3. `camo-urban`（城市灰）：深灰/铸铁灰/沥青方块迷彩；
    4. `camo-winter`（雪地斑驳）：灰白底色 + 暗灰线条痕迹。
- **装甲质感与防滑涂层 (Armor Texture & Wear)**：
  - **焊缝 (Weld Seams)**：在装甲边缘与多边形顶点连接处绘制双重微弱高光/阴影线条；
  - **边缘磨损 (Edge Wear)**：车体与炮塔外角处叠加 5%~10% 的露底漆防锈色（dark rust）；
  - **铸造颗粒 (Cast Armor)**：对重型/中型坦克炮塔增加微弱噪点与铸造线。

---

## 7. 开发者面板与两页 UI/按键统一（2026-09-19 落地，原 ISSUES #C5 + PLAN §3）

> 现行口径。背景：mvp `#devPanel` 与 bench `#benchPanel` 长期分叉（键位同键不同义、卡牌选择器 170+ 张平铺、独有功能各异），2026-09-17 用户裁定合并为一专轮，2026-09-19 落地。
>
> **#F（2026-09-20）更新**：devPanel 的 **DOM 与全部交互逻辑抽离为共享模块 `js/tank_devpanel.js`**（`mountDevPanel(host)` 动态构建 + 页面注入能力），mvp 与 bench **两页完全同源**——bench 旧 `#benchPanel` 已移除（` 键统一开 devPanel），其独有项（倒置 / FPS / 满血重置 / 清场 / 键位表）经 `extraSwitchHTML` 并入开关 Tab，无敌/秒装填直接并入 devPanel 开关 Tab 同位；bench 发射解算继续用常驻 `#solutionPanel`（模块以 `hideSolutionSection` 跳过内嵌解算区，防双份 `solPart` id）。共享模块顶层函数 `mountDevPanel` 已声明于 `types/globals.d.ts`（见 `docs/DEVELOPMENT.md` §4.24）。

### 7.1 mvp 开发者面板（`/ F12`，Tab 分页）

`tank_mvp.html` `#devPanel` 宽 480px，顶部四 Tab（会话内记忆当前 Tab）：

| Tab | 内容 | 说明 |
|---|---|---|
| **实时**（默认） | 实时参数（σ/装填/位置/速度/存活/节点/节点类型/敌人数）+ 发射解算 | 高频页，替代原单栏长滚动 |
| **卡牌** | 卡牌选择器（分组折叠 + 搜索）+ 已持有（×N / −1 / 清除全部） | 见 §7.2 |
| **参数** | 数值临时调整（穿深/伤害/装填/极速/马力，`devOverrides`）+ 修饰器列表（可改可删） | |
| **开关** | 超级精度（散布归零）/ 无视野 / **无敌常驻** / **秒装填** / 随机生成战场 / 重置 | 后两项下方两条为 2026-09-19 从 bench 对齐 |

- `devCheat = { invuln, instantReload }`（会话内有效、不持久化）：`invuln` 逐帧续 `player.invulnT = max(invulnT, 0.5)`，`instantReload` 逐帧 `player.reloadT = 0`——与 bench `benchCheats` 同源语义（`tank_bench.html` 同名逻辑）。
- 原 `#devCardList` 单列平铺按钮废弃，改为 `#devCardPicker`（见 §7.2）。

### 7.2 卡牌选择器（分组 / 搜索 / 持有标注 / 单卡回滚）

- **分组折叠**：按效果类型分 11 组——主武器安装 / 主武器升级 / 副武器安装 / 副武器升级 / 弹种升级 / 弹种强化 / 主动技能 / 被动机制 / 参数强化 / 无人机 / 经济（未命中任何组的进「其他」兜底）；组头显示数量，可折叠、默认全展开、会话内记忆。
- **搜索**：`#devCardSearch` 按名称 / id / 稀有度 / 标签 / desc 实时过滤（大小写不敏感）；面板打开时按 **`/`** 聚焦搜索框（输入框内不拦截，不破坏正常输入）。
- **持有标注**：候选项尾附 `· 已持有 ×N`（读 `player.cardEffects` 的 `cardId` 计数）。
- **应用**：点击候选项即 `pickCard`（`applyCardEffects` 管道），应用后按钮短暂高亮 700ms。
- **单卡回滚（−1）**：`rollbackDevCard(cardId)`——`clearCardsFromTank` 后按 `cardEffects` 原序重放（跳过目标卡一个实例），覆盖 modifiers/cardEffects/weapons/ammo/drones 全部副作用面；重放异常时用 `snapshotCardTx` receipt 经 `rollbackCardTx` 整体还原。**为何用重放而非直接截断**：武器安装/升级与弹种链的副作用已合并进 `weapons`/`ammoLoadout`，仅截断 `cardEffects` 无法回退。
- **清除全部**：`#devClearCardsBtn` → `clearCardsFromTank`。
- 事务原语全部复用 `js/tank_panels_core.js`（`applyCardToTank`/`snapshotCardTx`/`rollbackCardTx`/`clearCardsFromTank`），未新增状态面；**#F（2026-09-20）DOM 已随 devPanel 一起抽入共享模块 `js/tank_devpanel.js`**（分组/搜索/持有/回滚逻辑两页同源；bench 经 `cardClick` 缺省实现直接应用卡牌，mvp 传页面 `pickCard` 获得技能提示/toast 反馈）。

### 7.3 两页按键/文案统一（差异 = 注册差异）

- **键位唯一数据源**仍为 `js/tank_bindings.js`（`KEY_BINDINGS`/`ACTION_INFO`）；两页差异只剩「注册了哪些动作」：mvp 注册技能池 1/2/3、F、H/Shift+H、4/5/6、Tab、F12、ESC、滚轮缩放；bench 额外注册方向键（第二驾驶位开靶车）。
- **G / V 语义统一（2026-09-19 修复同键不同义冲突）**：两页 **G = 战术炮击**（`artillery` → `callStrike`，鼠标落点）、**V = 超装填**（`overdrive`）。bench 旧把 G 挪用为「超级火控 Buff」、V 为「超级速度 Buff」——两 Buff 改为**面板按钮专属**（`skillFireCtrlBtn`/`skillSpeedBtn`，走 `activateAbilityForTest`），不再占用 G/V；bench 同步补载 `js/tank_strike.js` 并在 update 驱动 `updateStrikes` + `updateAbilityCds`，使炮击链路与 mvp 同构。
- **bench Tab 键 preventDefault**：`createInputController({ preventKeys: [' ', 'tab'] })`——bench 无状态面板，Tab 不再落到浏览器焦点遍历。
- **bench 弹种条方向提示修正**：`renderAmmoIndicator` 的方向标由「下一格 Q / 上一格 E」**改为「下一格 E / 上一格 Q」**（与 `KEY_BINDINGS.ammoNext='e'`/`ammoPrev='q'` 同向；旧提示按键得到反向弹种）。
- **陈旧文案清理**：bench 控制说明由「1/2/3 弹种切换（AP / APCR / HE）」改为「E / Q 环形切换弹种（或点击弹种格；数字直选已摘除）」；mvp 弹药槽按钮 title 由「1号主弹药 (1)」等改为「主/副/备用弹药槽 N（E/Q 环形切换 / 点击选择）」。

### 7.4 未纳入本轮（仍开放）

- **HUD 同功能两套实现**（血条/装填指示/弹种条/日志/散布锥/FPS 读数等 9 处，`renderAmmoIndicator` 两页各一份）：本轮与 #F 只统一按键/文案与**面板粒度**（devPanel 已同源），**渲染实现级合并**仍在 `docs/PLAN.md` §2 非阻塞遗留；bench 卡牌选择器已随 #F 自动获得共享 devPanel DOM（不再列为独立可选后续）。

### 7.5 浏览器自动化测试链（2026-09-20，#F7）

`npm run test:browser` 四链脚本（按序执行，任一失败即停）：

| 脚本 | 页面 | 覆盖 |
|---|---|---|
| `test-browser-smoke.cjs` | mvp + bench | Home→Loadout→Shop→Map→battle 主链路、HUD/Tab/devPanel、弹种 E/Q 轮换、飘字、敌人开火命中、无 dummy、项目错误监听 |
| `test-browser-r3.cjs` | bench + mvp | bench 技能/召唤物（炮塔/地雷/掩体注册投递）、弹种切换、G 炮击链路、掩体按钮超限拒绝（#F6） |
| `test-browser-run.cjs` | mvp | 真实 run 链路、弹种三槽轮换、卡牌直系演变与跳级拒绝、G/H/V 入口、devPanel 四 Tab、卡牌选择器搜索/`/`/应用/×N/−1 回滚、雷场预约门控（#F6） |
| `test-browser-r4.cjs` | mvp | **主武器各类型实战**（standard 单发 / double_barrel 空格齐射 2 发 / autocannon 连发+heatPct / railgun 单发）、**F 副武器**（mortar isArc / rocket burst / missile 锁定发射且按住不翻转 / mine_layer 按住只走一次边沿 + 雷场生成 + 触爆掉血）、**技能实战效果**（artillery 落弹掉血 / shield 吸收池 / overdrive 装填归零）、**商店购买结算**（hp_up 扣点+记录 / 复活加购 / 升级作用于开局） |

- **边界（浏览器不做，Node 侧覆盖）**：敌人 AI 决策与 Boss 阶段行为由 `test-ai.js` / `test-boss.js` 覆盖；浏览器仅验证敌人存在 + 开火命中。
- **测试钩子**（`tank_mvp.html` `window.__TEST__`，不影响生产路径）：`shells()`/`strikes()`/`profile()`/`rerenderShop()` 供 r4 采样闭包内状态；既有 `pendingMineFields`/`mineFieldPreview`/`giveCard`/`skipToNode`/`setTimeScale` 复用。
- **r4 夹具约定**（2026-09-20 实测踩坑后固化）：① 发射计数只统计 `shooter.id === 'player'`——`firePrimaryShell` 同时服务敌方/友军 AI，不过滤会把敌方射击算成玩家发射；② 夹具冻结全体敌人（`maxHp/hp=1e6`、`immobT/reloadT=9999`），避免敌方还击打死玩家与「敌方全灭 → `isClearing` 跳过整个开火轮询块」造成的假失败；③ 雷场枚数统计 `spawnMine` 调用次数而非存活地雷数（触发半径 45px，目标站在场内会被立即引爆）；④ 注入（`addScriptTag` 包装全局）必须在 `page.reload()` **之后**，且 `waitForFunction` 的 `{timeout}` 必须作为**第三个**参数。
- **验证状态**：四链 **ALL PASS / EXIT=0**（2026-09-20 实跑，r4 连跑 3 次全绿）；沙箱内跑 browser 链需按 `sandbox-verify` 一次性放宽进程权限（`spawn EPERM`），复用已监听的 server 可避开 listen 拒绝。实测中发现的 3 处真实缺陷（mvp `devNoVision` TDZ、bench 陈旧复选框接线、开关类副武器 F 逐帧翻转）均已修复，见 `DEVELOPMENT.md` §4.27；F 键边沿口径归口 `specs/combat.md` §8.2。
