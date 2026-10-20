# 战术坦克 Roguelike — 坦克编辑器与工具链规范 (Tank Designer & Tooling Spec)

> 权威子文档：由主文档 docs/DEVELOPMENT.md 索引。
> 涉及页面与模块：tank_designer.html, tank_compare.html, js/tank_halfgeom.js, js/tank_presets.js, js/tank_schema.js, tools/bake.html

---

## 1. 坦克设计器 (tank_designer.html)
- **多边形顶点编辑**：车体/炮塔多边形自由编辑（半侧对称几何，js/tank_halfgeom.js halfFromFull 镜像重建全形）；逐边装甲厚度设定（front/side/rear faces）。
- **双中心分离**：turret.axis（炮塔自身旋转轴，局部帧内）与 turret.pivot（绕车体旋转中心，相对车体）完全分开；运行时 applyTankConfig 归一化平移保证"局部原点=旋转轴"不变量；设计器提供青色自身中心标记 + 橙色旋转中心标记 + 一键居中对齐按钮，防旋转甩尾。
- **炮管/炮盾预设**：js/tank_presets.js BARREL_PRESETS/MANTLE_PRESETS 表；normalizeBarrel 归一化（len/width/muzzle/evac/jacket 缺省兜底；**2026-10-17 #U31 起同时透传 `imgStandard/imgAutocannon/imgRailgun/imgVehicle` 四个贴图路径键**——缺省会令设计器「读取→保存」永久删除炮管贴图引用，#L3 同类教训）。
- **模块/成员位置不再支持自定义**（2026-08-26 P-49 定案）：命中判定改为几何分区+概率抽取（规范见 specs/combat.md），旧 json 的 modules 字段加载时静默忽略。
- **属性耦合链实时反馈**（2026-09-06）：设计器「基础参数」面板实时展示基于出厂几何与战斗参数推导的耦合结果——穿深/单发伤害→装填时间与散布惩罚倍率、车体尺寸→最大可用马力上限，以及车体面积物理缩放的内部模块易损因子（`moduleSizeFactor`，0.70x~1.30x，基于 2500 px² 标定：大车体内部宽敞不易损，小车体内部紧凑易损；完整耦合链见 §5）。
- **甲弹对抗内置测试**：入射角/等效厚度/跳弹判定实时预览。
- **保存链路**：POST /api/tanks/<id> 写回 tanks/<id>.json；mvp/compare 重载列表即生效。
- **背景参考图片（Background Reference，2026-10-11）**：右侧「背景参考 Background」面板提供图片上传/清除、显示开关、透明度 (0–100%)、缩放 (10–500%，100% = 整图完整显示在画布内) 与 X/Y 像素偏移。背景图在 CSS 像素空间内居中「contain」显示，**不随 viewScale 缩放**，始终作为固定参考；在 `render()` 中 `clearRect` 后、`drawGrid()` 前绘制，网格与所有编辑标注绘制在其上层。支持常见图片格式 (PNG/JPG/WebP 等)；使用 `URL.createObjectURL` 加载（仅设计器本地会话，不写入存档、不持久化，刷新页面后需重新上传）。图像异步解码完成后自动触发重绘（设计器无逐帧循环）。

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
- **整车精灵替换 (Full-Sprite Replacement, §4.53；四层口径与对齐契约经 §4.54 修订)**：
  - `tanks/<id>.json` 可选 `sprite` 块，**四层**部件：
    | 层 | 键 | 附加字段 |
    |---|---|---|
    | 履带 | `track` | — |
    | 车体 | `hull` | `pivot?`（图片像素旋转中心，缺省=图片中心） |
    | 炮塔 | `turret` | `pivot:[px,py]`（图片像素旋转中心，**必填**） |
    | 炮管 | `barrel` | `mountDx/mountDy/embed/scaleMult/gap` + `imgStandard/imgAutocannon/imgRailgun` + `imgVehicle?` |
    各图片层通用字段 `{img, scale, dx, dy, rot}`；`scale` = 模型单位/图片像素（`track.scale:0` 表示按 `trackWidth/naturalHeight` 自动推导）。
  - 图片路径：车体/炮塔存 `assets/tanks/`（命名不强制 `<id>_{hull,turret}.png`，如 `leopard1-turret.png`、`obj780-turret.png`）；履带条 `assets/tanks/track-links.png`；炮管 `assets/tanks/barrels/barrel-*.png`。`barrel.imgVehicle` = 本车专用炮管贴图（standard/clip/double_barrel 优先，autocannon/railgun 不越权，缺省回退 imgStandard）。
  - **对齐契约（§4.54 实测口径）**：`pivot`/`dx`/`dy` 使「贴图剪影包围盒中心」与「装甲多边形包围盒中心」重合；`barrel.mountDx − embed` 必须等于 `turretFrontDist()`（即过中轴前缘，按 `axis.dx` 归一化后的口径），否则炮口火焰/弹道起点（`gunRoot()/gunTip()`）与贴图炮管错位。推荐 `mountDx = turretFrontDist + embed`。设计器「按多边形自动对齐」按此口径计算。
  - 局内 `drawTank` 在 `sprite.enabled` 且**四层图片全部就绪**时改用精灵绘制；否则整体回退程序化（殉爆飞头时亦回退）。精灵分支**只替换车体/炮塔/炮管/履带四层画法**，炮塔座圈、断履带、起火辉光、副炮塔、炮塔投影阴影按程序化层级画在主炮塔之下，射界射线、附件、世界内血条/徽标与程序化分支共用同一段收尾绘制（§4.54 #L1）。
  - 履带滚动：相位周期 = 整幅贴图宽（不硬编码链节像素距），方向与程序化 `paintTracks`（`lineDashOffset=-phase`）同向。
  - `sprite` 无该键时必须置 `null`（`applyTankConfig` 无条件赋值），防复用实体残留上一辆车贴图；Boss 缩放会同步缩放 `sprite.*.scale` 与 `barrel.mountDx/mountDy/embed/gap`（`pivot` 为图片像素坐标不缩放，`track.scale=0` 哨兵保持）。
  - 设计器「整车精灵」面板提供四层对齐控件（履带/车体/炮塔/炮管各自缩放·位移·旋转·轴心）与「按多边形自动对齐」（前缘口径与运行时同源），并可为四类炮管分别指定贴图路径（标准 / **本车专用 `imgVehicle`** / 机炮 / 磁轨）；`sprite.enabled` 与「画布显示精灵」均默认 **false**，对齐确认后由设计者手动开启。
  - **设计器画布层序（§4.55 #M1）**：必须与局内 `drawTank` 一致——**履带 → 车体 → 炮塔 → 炮管**；座圈/轴线/顶点手柄等编辑辅助标注绘制在最上层。此前炮塔排在车体之前、炮管又随炮塔一起画，被车体整块遮住（贴图与程序化纹理同病）。
  - **图片预热（§4.55 #M2）**：设计器 `render()` 只在交互时调用、无逐帧循环，故载入坦克 / 勾选画布显示 / 改炮管路径时必须调用 `preloadSpriteImages()` 预热缓存，并给未就绪图片挂 `load → render`（否则异步解码完成后无人唤醒重绘，贴图永远不显示）。
  - 设计器读写 `sprite` 时必须**保留未知键**（浅拷贝后覆盖面板管理字段），否则会把 `imgVehicle` 等额外字段从 JSON 中删除（§4.54 #L3）。
  - **贴图资产要求**：正俯视、透明背景（不得残留与边框连通的近白底）、剪影长宽比贴近装甲多边形、内容大致居中。**允许「多块炮塔」**——例如 `hummel_turret.png` 上下两块装甲、中间留出透明炮管槽（枪管从槽中透出）是合法结构，轴心取**内容包围盒中心**（对带槽者即槽中心）。残留白底用 `scripts/clean_sprite_bg.py` 清理（`--dry` 仅探测；判定为「从边框沿透明∪近白可达者 = 背景」，被装甲包围的本体高光一律保留，不做 alpha 羽化）。
  - **缩图与 JSON 同步（§4.62，2026-10-12 落地）**：贴图宽度上限 **1200px**；缩图用 `scripts/optimize_sprites.py --colors 256 --max-width 1200 --inplace --sync-tanks`——缩图前先把透明像素的隐藏 RGB 填成不透明区均色（防 LANCZOS 把白底混进边缘），缩后把软边压回**二值 alpha**（§4.56 契约）；`--sync-tanks` 自动把 `tanks/*.json` 的 hull/turret `scale ×k`、`pivot ÷k`（`track.scale:0` 自动推导与炮管 `barrelLen/naturalWidth` 归一化均不涉及，无需改动）。**只在结果变小时才写盘**——若缩后反而更大（源图已是紧凑 PNG-8 时可能发生），该文件跳过且其 JSON 不动。新贴图入库后应跑一次本命令收口。
  - **对齐验收指标（§4.56 方法论）**：以「**贴图内容映射长度 = 装甲多边形长度**（比值 0.98~1.02）」+「**旋转轴 = 内容包围盒中心**」+「炮管 `mountDx−embed = turretFrontDist`」为准；**不要用 IoU 验收带透明槽的贴图**（形状正确的多边形覆盖槽位反而降低 IoU）。缩图后的像素级回归（缩前/缩后同姿态截图包围盒偏差 ≤3px、全画布 MAE ≤8/255）见 `tmp/sprite-regress.cjs` 实践（不入库；重做缩图时按同判据复验）。

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

- **键位唯一数据源**仍为 `js/tank_bindings.js`（`KEY_BINDINGS`/`ACTION_INFO`）；两页差异只剩「注册了哪些动作」：mvp 注册技能池 1/2/3、F、H/Shift+H、4/5/6、Tab、**C（卡牌查看器，2026-10-17 #U23）**、F12、ESC、滚轮缩放；bench 额外注册方向键（第二驾驶位开靶车）。
- **G / V 语义统一（2026-09-19 修复同键不同义冲突）**：两页 **G = 战术炮击**（`artillery` → `callStrike`，鼠标落点）、**V = 超装填**（`overdrive`）。bench 旧把 G 挪用为「超级火控 Buff」、V 为「超级速度 Buff」——两 Buff 改为**面板按钮专属**（`skillFireCtrlBtn`/`skillSpeedBtn`，走 `activateAbilityForTest`），不再占用 G/V；bench 同步补载 `js/tank_strike.js` 并在 update 驱动 `updateStrikes` + `updateAbilityCds`，使炮击链路与 mvp 同构。
- **bench Tab 键 preventDefault**：`createInputController({ preventKeys: [' ', 'tab'] })`——bench 无状态面板，Tab 不再落到浏览器焦点遍历。
- **bench 弹种条方向提示修正**：`renderAmmoIndicator` 的方向标由「下一格 Q / 上一格 E」**改为「下一格 E / 上一格 Q」**（与 `KEY_BINDINGS.ammoNext='e'`/`ammoPrev='q'` 同向；旧提示按键得到反向弹种）。
- **陈旧文案清理**：bench 控制说明由「1/2/3 弹种切换（AP / APCR / HE）」改为「E / Q 环形切换弹种（或点击弹种格；数字直选已摘除）」；mvp 弹药槽按钮 title 由「1号主弹药 (1)」等改为「主/副/备用弹药槽 N（E/Q 环形切换 / 点击选择）」。

### 7.4 HUD 渲染实现级合并（#3，2026-10-20 已完成第一批）

> **沿革**：本节原记「9 处 HUD 同功能两套实现，渲染实现级合并仍在 PLAN §2 非阻塞遗留」。2026-10-20 用户裁定口径「A. bench 与 mvp 共用同一套 HUD」后落地第一批。

- **弹种指示器已同源**：`js/tank_hud.js` 的 `renderAmmoIndicator(H)`（`H` 注入 `list` / `currentIndex` / `onPick` / `showMult` / `centerActive`）。mvp 传 `activeLoadout()` + `showMult:true`；bench 传 `getAmmoKeys()` + `onPick` + `centerActive:true`。两页旧内联实现保留为 `TankHud` 缺失时的兜底分支。
- **DOM 契约（两页必须一致）**：容器 `#ammoIndicator`，格子 `.ammo-cell`，激活格 `.ammo-cell.active`，内部 `.dot` / `.key` / `.label` / `.mult`。**bench 的 `<style>` 已于 2026-10-20 补齐 `.ammo-cell` / `.ammo-cell.active` / `.key` 三条规则**（此前只有元素内联样式，走共享实现后激活高亮整体消失——本次审查发现并修复，见 `DEVELOPMENT-batches-2026-10.md` §4.111）。
- **散布锥已同源**：`drawSpreadCones(ctx, gp, aimA, sigma, {length, dual})`。`dual:true` = 1σ 实线（68%）+ 2σ 虚线（95%）。mvp 用 250px 短锥（战斗视野），bench 用全长（解算面板语义）。
- **经取证不计入合并**：血条（mvp 底部 HUD vs bench 右栏靶车数据面板）、日志（mvp 独立浮层 vs bench 常驻栏）——属**产品定位差异**，非「同功能两套实现」。
- **仍未合并**：装填指示（mvp 环 vs bench 横条）、FPS 读数两份实现。

### 7.6 内容工具与预览（NF-1 / NF-2 / NF-4，2026-10-20）

| 项 | 实现 | 归口 |
|---|---|---|
| **NF-1 卡牌查看器扩展** | mvp `C` 键面板新增「**全池**」页签（数据源 `cardPool` 全表，按稀有度分组排序）；描述经 `formatCardDesc(card)` 求值（`{value}` / `{pct}` / `{ov:key}`，各带 `:N` effects 索引形式，未知占位符原样保留）；点击描述就地换 `textarea` 编辑，提交存 `sessionStorage['cardDescOverride']`（**仅会话预览，不写 `cards/*.json`**——写盘属内容批次职责）。 | `js/tank_cards.js` `formatCardDesc` + `tank_mvp.html renderCardsPanel` |
| **NF-2 坦克图鉴 CODEX** | bench 敌实验室新增面板：选等级 → `enemyPreviewStats(tankId, level, opts)` **纯查询**（临时 `makeTank` → `applyEnemyAppearanceAndStats` → `enemyLevelMults` 经 `addModifier` 注入 → 读 `stats`，**全程不触碰实体注册表**）。展示 HP/穿深/伤害/装填/极速/装甲六面。与 LIVE ENEMIES（真实实体，验证 AI/难度实战）分工互补。 | `js/tank_panels_core.js` `enemyPreviewStats` |
| **NF-4 面板卡牌悬停预览** | `tank_devpanel.js` 的 `attachCardTooltip(btn, card)`：单例 tooltip（稀有度彩色徽章 + `formatCardDesc` 求值正文），`mouseenter` 300ms 延迟、`mouseleave` 立即隐藏；位置 = 按钮右缘 +12px，超出视口右/下边缘时翻折。`title` 保留为无 CSS/JS 极端环境的兜底。 | `js/tank_devpanel.js` |

> **`enemyPreviewStats` 与实战敌军的口径差异（有意为之）**：实战经 `applyDifficultyMults` 还会叠加难度封顶（`difficultyCapMuls`，含 `Math.random` 抖动）——那是平衡用的运行时钳制；图鉴展示**确定性基准**（无抖动），便于横向对比等级曲线。

### 7.7 未纳入本轮（仍开放）

- 装填指示（mvp 环形 vs bench 横条）、FPS 读数两份实现——同 §7.4 末条。

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

---

## 8. 2026-10-20 批次现行口径（#X1 / #W14 / #7① / #16）

### 8.1 `applyTankConfig` 深拷贝 `spec.appearance`（#X1，2026-10-20）

**背景（根因比原条目描述更强）**：`tanks/*.json` 的 `appearance`（`cupola` 车长塔 / `engineDeck` 发动机舱盖外观件）**从未生效**——`js/tank_model.js` 的 `applyTankConfig`（约 `:516-655`）**完全不拷贝 `spec.appearance`** ⇒ 游戏内 `t.appearance` **恒 `null`**，所有外观件读到的都是缺省值。原 ISSUES #X1 只描述为「位置不受设计器影响」，实测**比这更严重：根本没有生效过**。

**修法**：按 `anchors` 的逐项拷贝手法**深拷贝**（避免实例级改写污染共享 `spec`）。

**实测**：`tiger-I` → `t.appearance = { cupola: 'panoramic', engineDeck: 'rearGrille' }`；切换车型无残留（不共享引用）。

### 8.2 设计器叠加层基准与 `tank_paint.js` 统一（#X1，2026-10-20）

`designer.js`（约 `:2192-2194`）此前用**座圈中心**为基准，而 `js/tank_paint.js`（约 `:879`）用 `(cym − W*0.44) + dy` ⇒ 两处基准不一致，设计器预览与实际贴图**位置偏差**。

**现行**：设计器**复用 `tank_paint.js` 同一公式**（唯一口径）——
- `cupola` = `(cxm + dx, (cym − W*0.44) + dy)`，再按 `turretAngle` 旋转；
- `engineDeck` = `(cxm + dx, cym + dy)`。

**并去重复叠加**：预览模式下 `paintPartTexture` 通道**已画**过一遍，仅 `!opts.detail` 的编辑模式才补画（旧实现两模式都补 ⇒ 叠加成双影）。

### 8.3 `RULES.enemyAnchorBase.aimSpeed`（#W14，2026-10-20）

**根因（不是「难度表没调」）**：`applyEnemyAppearanceAndStats` 原先**不写 `base.aimSpeed`**，而 `makeTank` 的 base 也**无该键** ⇒ `computeStats` 回落 `RULES.spread.shrinkRate`（**0.15**）——那是「配装缺省」量纲；而真实坦克 `tanks/*.json` 的 `base.aimSpeed` 包络是 **1.0~2.5**。`entityMults.aimSpeed = [0.8, 1.35]` 是按真实坦克量纲设计的 ⇒ 满难度实测只有 `0.15×1.35 = `**0.2025**（玩家 `tiger-I` 1.5 的 **7.4%**），敌军缩圈几乎停滞、散布恒处扩散状态。

**现行**：`RULES.enemyAnchorBase.aimSpeed = 1.2`（中位中坦量级）；`applyEnemyAppearanceAndStats` 显式写 `base.aimSpeed`。`aimSpeed` **不参与** `enemyClassProfiles` 类别缩放（四类共用同一瞄准速度基准，差异由难度通道与玩家卡牌通道承担）。

**现行取值**（唯一口径 `js/tank_rules.js`）：
| 难度 | 乘子 | `stats.aimSpeed` |
|---|---|---|
| 低（`diff=0`） | 0.8 | **0.96**（= 1.2×0.8） |
| 满（`diff=diffMax=1.15`） | 1.35 | **1.62**（= 1.2×1.35） |

**⚠️ 量纲锁定断言的正确写法（勿改）**：低难度 **0.96 低于 1.0 是设计意图**（低于玩家基准、略慢于中位中坦）——断言必须写 `≈0.96`，**不能写 `> 1.0`**（那会把设计意图判成缺陷）。真正的护栏是两条：① 结果 ≠ `RULES.spread.shrinkRate`（否则说明又回落到配装缺省量纲）；② 敌我量纲一致（满难度 1.62 落在真实坦克 1.0~2.5 包络内）。回归：`scripts/test-modifiers.js` #W14 段 13 条断言（含单调性、缺陷值 0.2025 回归、裸 `makeTank` 对照）。

### 8.4 bench 卡牌面板按稀有度分组（#7①，2026-10-20）

`tank_bench.html` 的 `populateCardSelect`（约 `:626-640`）此前按 `id` 平铺下拉、无分类；分类逻辑只存在于 `js/tank_devpanel.js`。现改用 **`<optgroup>` 按稀有度分组**，新增两页共享的 `groupCardsByRarity` / `devRarityLabel` / `DEV_RARITY_*`（与正式游戏同源）。

**⚠️ rarity-only，不依赖 tags**：因 #16 已删除 `tags` 字段，本实现**刻意不依赖 tags**（若依赖会随字段下线连带失效）。一键清除（`:227 clearCardsBtn`）保留。

**实测**（196 张）：分 **5 组**——神话 1 / 传奇 15 / 史诗 44 / 稀有 77 / 普通 59。

### 8.5 `tools/content_designer.html` 的 tags 编辑器移除（#16 连带，2026-10-20）

该页 `:159` 的 `for(const t of CARD_TAGS)` 在 `CARD_TAGS` 不再导出后**打开即抛 TypeError**（**不在 `check-html.js` 的五页扫描范围内** ⇒ `npm run check` 不红，属工具链静默崩溃）。

**已整段删除 5 处**：`:107` 列表元信息（改为**只显示 rarity**）、`:157-164` 勾选框区域、`:231` tags 收集、`:259` 输出写回、`:37-38` `.tags` CSS。每处带 `#16（2026-10-20）` 注释。
**A/B 验证**（同一 DOM stub）：旧写法 `for(const t of CARD_TAGS)` → `ReferenceError: CARD_TAGS is not defined`；新文件内联脚本加载正常、去注释后 `CARD_TAGS`/`tagWrap`/写回 `tags` 均消失。

### 8.6 设计器三项（2026-10-20 #15，已记录于 `DEVELOPMENT-batches-2026-10.md` §4.110）

履带平铺对称 / 外观件实时预览 / 车长塔坐标统一——结论归口 §4.110 与 `js/tank_paint.js` 的 `cupolaAnchor`，本节不重复罗列，与 §8.1/8.2 无冲突（§8.2 的基准统一正是 §4.110「车长塔坐标统一」的延续）。
