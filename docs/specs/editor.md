# 编辑器与工具链规范 —— 兼容索引（现行内容见 wiki 分页）

> ⚠️ **本页是 §N 兼容层**：全部章节编号原样保留（全仓引用本卷章节号的外部文档依赖它们；2026-10-21 实测 **191 处**指向 specs 五卷章节号，木卷为其一），
> 但正文已迁至 `docs/specs/editor/` 下的主题页。**查现行口径请点每节的「详见」链接。**
> 拆分日期 **2026-10-21**；拆分前的单卷原文（**战术坦克 Roguelike — 坦克编辑器与工具链规范**）以 git 提交 `57be2ca` 为准（见 `docs/archive/2026-10-pre-wiki-editor.md` 的还原说明与分节行号表）。
> 规范见 [`docs/WIKI-STYLE.md`](../WIKI-STYLE.md)；卷首页见 [editor/index.md](./editor/index.md)。
>
> **关于 §7.5 的位置**：原单卷里 §7.5 曾**物理错排**在 §7.6/§7.7 之后（编号本身没错）。拆分后已按编号顺序落位（7.4 → **7.5** → 7.6 → 7.7），**编号文字未改**。

---

## 0. 主题索引（按问题查，不按章节序读）

> ⚠️ **本卷含历史批次章节（§5 / §7 / §8），章节号按时间追加，不代表主题分组**。**§8 是最"当下的"批次节**——appearance / aimSpeed / bench 分组 / content_designer 都在那里。
> **查现行口径请用本索引**：每行给出「该主题的现行口径在哪一页」与「只是来源沿革、不必读的页」。
> 本卷章节号被外部文档直接引用——**编号保持稳定、不做重排**；本索引是唯一的「按主题导航」入口。

| 我想查…… | 现行口径（先看这里） | 来源沿革（不必读） |
|---|---|---|
| **坦克设计器**（多边形/装甲/炮管炮盾/背景图） | [坦克设计器](./editor/designer.md)（§1） | §8.2（叠加层基准）、§8.6（#15 三项） |
| **参数对比页**（单位直标、四分组） | [对比页与字段架构表 · 参数对比页](./editor/compare-schema.md#参数对比页)（§2） | [沿革 · 精度双输入框](./editor/changelog.md#精度-100m-双输入框已被-p-48-简化) |
| **字段架构表**（`FIELD_ROWS` / `edit` 元数据） | [对比页与字段架构表 · 字段架构表](./editor/compare-schema.md#字段架构表)（§3） | — |
| **资产烘焙工具**（`tools/bake.html`） | [烘焙工具与模块分区 · 资产烘焙工具](./editor/bake-modules.md#资产烘焙工具)（§4） | — |
| **模块/成员概率分区**（P-49：几何分区 + 概率抽取） | [烘焙工具与模块分区 · P-49](./editor/bake-modules.md#p-49-模块成员概率分区)（§5） | §1「模块不再自定义」的迁移说明 |
| **坦克贴图与涂装视觉规范**（`TEXTURE_DEFS` / 迷彩 / 审核标准） | [贴图与涂装视觉规范](./editor/visual-spec.md)（§6） | 完整审核标准归 [地图规范](./map.md) §22/§23 |
| **开发者面板**（devPanel 四 Tab / 卡牌选择器 / 两页按键统一） | [开发者面板](./editor/devpanel.md)（§7、§7.1~§7.3） | — |
| **两页 HUD 渲染合并状态**（9 处 = 6 合并 + 2 定位差异 + 1 重复计数 ⇒ **无剩余项**） | [开发者面板 · HUD 合并](./editor/devpanel.md#hud-渲染实现级合并)（§7.4） | [沿革 · 未纳入本轮](./editor/changelog.md#未纳入本轮2026-09-19-c5已全部关闭)（§7.7） |
| **浏览器自动化测试链**（`npm run test:browser` 四链） | [浏览器自动化测试链](./editor/browser-tests.md)（§7.5） | — |
| **内容工具与预览**（NF-1 查看器全池 / NF-2 图鉴 / NF-4 tooltip） | [内容工具与 appearance · NF-*](./editor/appearance-aimspeed.md#内容工具与预览nf-1-nf-2-nf-4)（§7.6） | — |
| **`spec.appearance` 外观件是否生效**（cupola / engineDeck） | [内容工具与 appearance · appearance](./editor/appearance-aimspeed.md#applytankconfig-深拷贝-specappearance)（§8.1） | — |
| **设计器叠加层与贴图基准是否一致** | [内容工具与 appearance · 叠加层基准](./editor/appearance-aimspeed.md#设计器叠加层基准与-tank_paintjs-统一)（§8.2） | — |
| **敌军 `aimSpeed` 量纲**（`RULES.enemyAnchorBase.aimSpeed`） | [内容工具与 appearance · aimSpeed](./editor/appearance-aimspeed.md#rulesenemyanchorbaseaimspeed)（§8.3，**唯一口径**：数值与量纲锁定断言的正确写法都在那一节） | — |
| **bench 卡牌面板分组**（按稀有度 `<optgroup>`） | [内容工具与 appearance · bench 分组](./editor/appearance-aimspeed.md#bench-卡牌面板按稀有度分组)（§8.4） | — |
| **`tools/content_designer.html` 的 tags 编辑器** | [内容工具与 appearance · content_designer](./editor/appearance-aimspeed.md#toolscontent_designerhtml-的-tags-编辑器移除)（§8.5；已于 2026-10-20 #16 整体移除，该页曾因 `CARD_TAGS` 消失而打开即崩） | [卡牌规范 · 沿革](./cards/changelog.md#tags-字段下线2026-10-20-16) |
| **设计器三项**（履带平铺 / 外观件实时预览 / 车长塔坐标统一） | [内容工具与 appearance · 设计器三项](./editor/appearance-aimspeed.md#设计器三项15)（§8.6，摘要） | 细则归 `DEVELOPMENT-batches-2026-10.md` §4.110 |
| **全部历史 / 已关闭项** | — | [沿革与已作废](./editor/changelog.md) |

**读法建议**：本卷的「主题节」（§1~§4、§6）偏工具描述、**「批次节」（§7、§8）才是近年改动落点**。查某个外观/面板现在是什么样，先看 §8；§7 是面板体系的骨架描述。

---

## 1. 坦克设计器 (tank_designer.html)

> 多边形顶点编辑（半侧对称 `halfFromFull` 镜像重建）+ 逐边装甲 + **双中心分离**（`turret.axis` vs `turret.pivot`，防旋转甩尾）+ 炮管/炮盾预设（`normalizeBarrel` 透传四个贴图路径键）+ 模块位置不再自定义（P-49）+ 属性耦合链实时反馈 + 甲弹对抗测试 + 保存链路 + **背景参考图**（CSS 像素空间 contain，不持久化）。

**详见**：[坦克设计器](./editor/designer.md)

## 2. 参数对比页 (tank_compare.html)

> 表格化编辑 `tanks/*.json`；**P-48 单位标定与四分组**（极速 km/h、炮管长 m 直标；精度改单一「100m 散布(m)」；Firepower/Armor/Mobility/Misc 四组）；原「真实单位标定」只读栏已彻底移除。

**详见**：[对比页与字段架构表 · 参数对比页](./editor/compare-schema.md#参数对比页)

## 3. 字段架构表 (js/tank_schema.js)

> `FIELD_ROWS` 单一来源（designer/compare 共用，**当前仅 compare 消费**）；每行 `group` 四分类；可选 `edit` 元数据（`op='div'|'mul'` + RULES 系数唯一权威）与 `special:'spread100m'`。

**详见**：[对比页与字段架构表 · 字段架构表](./editor/compare-schema.md#字段架构表)

## 4. 资产烘焙工具 (tools/bake.html)

> 遍历 `ASSET_DEFS` 离屏烘焙 + 锚点十字标注 + 合成预览，`canvas.toBlob` 导出 PNG 到 `assets/`；**`file://` 可直开**。

**详见**：[烘焙工具与模块分区 · 资产烘焙工具](./editor/bake-modules.md#资产烘焙工具)

## 5. P-49 模块/成员概率分区系统与设计器耦合链（2026-09-06 落地）

> 废除自定义模块挂载，改**多边形几何分区 + 概率抽取**：炮塔四象限（炮手/车长/装填手/炮闩/弹药架）+ 车体纵轴区段（前置/后置两套）+ 新键 `breech`；**属性耦合链**（装甲→重量、车体→马力上限与易损因子 `moduleSizeFactor` 0.70~1.30、穿深/伤害→装填与散布惩罚）；**参数双层限制**（80t 设计上限 / 240t 运行时硬上限）；卡牌概率修正（≤25%，clamp ≤90%）。

**详见**：[烘焙工具与模块分区 · P-49](./editor/bake-modules.md#p-49-模块成员概率分区)

## 6. 坦克贴图与战术涂装视觉规范 (Tank Visual & Camo Spec)

> 4 套迷彩（forest/desert/urban/winter）+ 装甲质感三件（焊缝/边缘磨损 5~10%/铸造颗粒）+ **整车精灵四层**（track/hull/turret/barrel，含 `imgVehicle`；**2026-10-23 起盘上无图、通道代码保留**）+ **对齐契约**（`mountDx − embed = turretFrontDist`）+ 设计器层序与预热 + 资产要求（含多块炮塔）+ 后期贴图入库（≤1200px 宽、scale/pivot 同步）+ 验收指标（长度比 0.98~1.02 / 轴心 / 包围盒 ≤3px / MAE ≤8/255）。

**详见**：[贴图与涂装视觉规范](./editor/visual-spec.md)

## 7. 开发者面板与两页 UI/按键统一（2026-09-19 落地，原 ISSUES #C5 + PLAN §3）

> **共享模块 `js/tank_devpanel.js`**（`mountDevPanel(host)`，两页同源；bench 旧 `#benchPanel` 已移除）+ **devPanel 四 Tab**（实时/卡牌/参数/开关）+ **卡牌选择器 11 组**（分组/搜索/持有/单卡回滚）+ **两页按键统一**（G=炮击、V=超装填；bench 弹种条方向 E/Q 修正）+ **HUD 合并状态**（6 合并 + 2 定位差异 ⇒ 无剩余项）+ **浏览器四链** + **NF-1/2/4 内容工具**。

**详见**：[开发者面板](./editor/devpanel.md) · [浏览器自动化测试链](./editor/browser-tests.md) · [内容工具与 appearance · NF-*](./editor/appearance-aimspeed.md#内容工具与预览nf-1-nf-2-nf-4)

### 7.1 battle 开发者面板（`/ F12`，Tab 分页）

> `#devPanel` 宽 **480px**、四 Tab（会话内记忆）；`devCheat = { invuln, instantReload }` 逐帧续期、会话内有效不持久化。

**详见**：[开发者面板 · devPanel 四 Tab](./editor/devpanel.md#devpanel-四-tab)

### 7.2 卡牌选择器（分组 / 搜索 / 持有标注 / 单卡回滚）

> **11 组**分组折叠 + `#devCardSearch` 实时过滤（`/` 聚焦）+ 持有标注 `· 已持有 ×N` + 点击即 `pickCard`（高亮 700ms）+ **单卡回滚走「清空后原序重放」**（非截断，因武器/弹种副作用已合并进 `weapons`/`ammoLoadout`）+ 事务原语复用 `tank_panels_core.js`。

**详见**：[开发者面板 · 卡牌选择器](./editor/devpanel.md#卡牌选择器)

### 7.3 两页按键/文案统一（差异 = 注册差异）

> 键位唯一数据源 `js/tank_bindings.js`；**G=战术炮击 / V=超装填**（bench 旧挪用为 Buff 已改面板按钮）；bench `preventKeys:[' ','tab']`；bench 弹种条方向标改「下一格 E / 上一格 Q」；陈旧文案清理。

**详见**：[开发者面板 · 两页按键统一](./editor/devpanel.md#两页按键文案统一)

### 7.4 HUD 渲染实现级合并（#3，2026-10-20 已完成第一批）

> 弹种指示器同源（`renderAmmoIndicator(H)`，DOM 契约 `#ammoIndicator` / `.ammo-cell(.active)`）+ 散布锥同源（`drawSpreadCones`，`dual`）+ **血条/日志/装填指示属产品定位差异不计入**；9 处 = **6 合并 + 2 差异 + 1 重复计数 ⇒ 无剩余项**（2026-10-20 用户裁定关闭）。

**详见**：[开发者面板 · HUD 合并](./editor/devpanel.md#hud-渲染实现级合并)

### 7.5 浏览器自动化测试链（2026-09-20，#F7）

> `npm run test:browser` **四链**（smoke / r3 / run / r4）脚本矩阵与覆盖面；`window.__TEST__` 测试钩子；**r4 四条夹具约定**（玩家射击过滤 / 冻结敌人 / 雷场按 `spawnMine` 计数 / 注入在 `reload` 之后且 `timeout` 第三参）。

**详见**：[浏览器自动化测试链](./editor/browser-tests.md)

### 7.6 内容工具与预览（NF-1 / NF-2 / NF-4，2026-10-20）

> **NF-1** 卡牌查看器「全池」页签（`formatCardDesc` 占位符求值 + 就地编辑存 `sessionStorage`，不写盘）/ **NF-2** 坦克图鉴 `enemyPreviewStats` 纯查询（确定性基准，不碰实体注册表）/ **NF-4** 悬停 tooltip（单例 + 300ms 延迟 + 视口边缘翻折）。

**详见**：[内容工具与 appearance · NF-*](./editor/appearance-aimspeed.md#内容工具与预览nf-1-nf-2-nf-4)

### 7.7 未纳入本轮（仍开放）

> **已全部关闭（2026-10-20）**：装填指示经用户裁定属**产品定位差异**、FPS 读数已合并 ⇒ **无剩余项**。（标题的「本轮」指 2026-09-19 #C5 批次，为历史标题、保留不改。）

**详见**：[沿革 · 未纳入本轮](./editor/changelog.md#未纳入本轮2026-09-19-c5已全部关闭)　**现行**：[开发者面板 · HUD 合并](./editor/devpanel.md#hud-渲染实现级合并)

## 8. 2026-10-20 批次现行口径（#X1 / #W14 / #7① / #16）

> **§8.1** `applyTankConfig` 深拷贝 `spec.appearance`（此前**从未生效**过）；**§8.2** 叠加层基准与 `tank_paint.js` 统一（去重复叠加）；**§8.3** `aimSpeed` 量纲（`1.2` ⇒ 低难度 0.96 / 满难度 1.62）；**§8.4** bench 卡牌面板 `<optgroup>` 稀有度分组（rarity-only 不依赖 tags）；**§8.5** `content_designer.html` tags 编辑器整段移除（曾打开即崩）；**§8.6** 设计器三项（摘要）。

**详见**：[内容工具与 appearance](./editor/appearance-aimspeed.md)

### 8.1 `applyTankConfig` 深拷贝 `spec.appearance`（#X1，2026-10-20）

> 根因：`applyTankConfig` **完全不拷贝 `spec.appearance`** ⇒ `t.appearance` 恒 `null`、外观件从未生效。已按 `anchors` 逐项深拷贝。实测 `tiger-I` → `{cupola:'panoramic', engineDeck:'rearGrille'}`。

**详见**：[内容工具与 appearance · appearance](./editor/appearance-aimspeed.md#applytankconfig-深拷贝-specappearance)

### 8.2 设计器叠加层基准与 `tank_paint.js` 统一（#X1，2026-10-20）

> `designer.js` 原用座圈中心、`tank_paint.js` 用 `(cym − W*0.44) + dy` ⇒ 位置偏差。现行**复用同一公式**（`cupola` = `(cxm+dx,(cym−W*0.44)+dy)`；`engineDeck` = `(cxm+dx,cym+dy)`）并**去重复叠加**（仅编辑模式补画）。

**详见**：[内容工具与 appearance · 叠加层基准](./editor/appearance-aimspeed.md#设计器叠加层基准与-tank_paintjs-统一)

### 8.3 `RULES.enemyAnchorBase.aimSpeed`（#W14，2026-10-20）

> 根因是**两套量纲**（配装缺省 0.15 vs 真实坦克 1.0~2.5），不是「难度表没调」。现行 `1.2` ⇒ 低难度 **0.96** / 满难度 **1.62**。**0.96 低于 1.0 是设计意图，断言勿写 `>1.0`**。

**详见**：[内容工具与 appearance · aimSpeed](./editor/appearance-aimspeed.md#rulesenemyanchorbaseaimspeed)

### 8.4 bench 卡牌面板按稀有度分组（#7①，2026-10-20）

> `<optgroup>` 按稀有度分组，两页共享 `groupCardsByRarity`/`devRarityLabel`/`DEV_RARITY_*`；**rarity-only 不依赖 tags**。实测 196 张 → **5 组**（神话 1 / 传奇 15 / 史诗 44 / 稀有 77 / 普通 59）。

**详见**：[内容工具与 appearance · bench 分组](./editor/appearance-aimspeed.md#bench-卡牌面板按稀有度分组)

### 8.5 `tools/content_designer.html` 的 tags 编辑器移除（#16 连带，2026-10-20）

> 该页 `for(const t of CARD_TAGS)` 在枚举不再导出后**打开即抛 TypeError**（不在 `check-html` 五页扫描内 ⇒ 不红链）。**已整段删除 5 处**（`:107`/`:157-164`/`:231`/`:259`/`:37-38`）；A/B 验证旧写法必崩、新文件正常。

**详见**：[内容工具与 appearance · content_designer](./editor/appearance-aimspeed.md#toolscontent_designerhtml-的-tags-编辑器移除)

### 8.6 设计器三项（2026-10-20 #15，已记录于 `DEVELOPMENT-batches-2026-10.md` §4.110）

> 履带平铺对称 / 外观件实时预览 / 车长塔坐标统一——**摘要见主题页**，细则归 `DEVELOPMENT-batches-2026-10.md` §4.110 与 `js/tank_paint.js` 的 `cupolaAnchor`。

**详见**：[内容工具与 appearance · 设计器三项](./editor/appearance-aimspeed.md#设计器三项15)

---

> **维护**：新增章节仍按 `§N+1` 追加（编号只增不改）——本页加「标题 + 摘要 + 详见」，正文写进 `docs/specs/editor/` 对应主题页。改现行值只改主题页；本页摘要**尽量不写具体数值**。
