# 开发者面板

> **摘要**：devPanel 四 Tab、卡牌选择器（分组/搜索/回滚）、两页按键统一、HUD 渲染合并状态。
> **适用版本**：现行（2026-10-22）
> **源自**：`docs/specs/editor.md` §7、§7.1、§7.2、§7.3、§7.4（2026-10-21 拆分）
> **相关**：[浏览器自动化测试链](./browser-tests.md) · [内容工具与 appearance](./appearance-aimspeed.md) · [兼容索引](../editor.md)

## 共享模块与两页同源

（原 §7 前言，2026-09-19 落地，原 ISSUES #C5 + PLAN §3）

背景：battle `#devPanel` 与 bench `#benchPanel` 长期分叉（键位同键不同义、卡牌选择器 170+ 张平铺、独有功能各异），2026-09-17 用户裁定合并为一专轮，2026-09-19 落地。

**#F（2026-09-20）更新**：devPanel 的 **DOM 与全部交互逻辑抽离为共享模块 `js/tank_devpanel.js`**（`mountDevPanel(host)` 动态构建 + 页面注入能力），battle 与 bench **两页完全同源**：

- bench 旧 `#benchPanel` 已移除（`` ` `` 键统一开 devPanel），其独有项（倒置 / FPS / 满血重置 / 清场 / 键位表）经 `extraSwitchHTML` 并入开关 Tab，无敌/秒装填直接并入 devPanel 开关 Tab 同位；**2026-10-26 更新**：「清场」已与 Enemy Lab 可见按钮「清空所有敌人」共用同一函数，语义改为「只认 `team === 'enemy'`、靶车保留」，见下文「bench Enemy Lab 控件」；
- bench 发射解算继续用常驻 `#solutionPanel`（模块以 `hideSolutionSection` 跳过内嵌解算区，防双份 `solPart` id）；
- 共享模块顶层函数 `mountDevPanel` 已声明于 `types/globals.d.ts`（见 `docs/DEVELOPMENT.md` §4.24）。

## devPanel 四 Tab

（原 §7.1，`` ` `` / F12）

`tank_battle.html` `#devPanel` 宽 **480px**，顶部四 Tab（**会话内记忆当前 Tab**）：

| Tab | 内容 | 说明 |
|---|---|---|
| **实时**（默认） | 实时参数（σ/装填/位置/速度/存活/节点/节点类型/敌人数）+ 发射解算 | 高频页，替代原单栏长滚动 |
| **卡牌** | 卡牌选择器（分组折叠 + 搜索）+ 已持有（×N / −1 / 清除全部） | 见下「卡牌选择器」 |
| **参数** | 数值临时调整（穿深/伤害/装填/极速/马力，`devOverrides`）+ 修饰器列表（可改可删） | |
| **开关** | 超级精度（散布归零）/ 无视野 / **无敌常驻** / **秒装填** / 随机生成战场 / 重置 | 后两项下方两条为 2026-09-19 从 bench 对齐 |

- `devCheat = { invuln, instantReload }`（**会话内有效、不持久化**）：`invuln` 逐帧续 `player.invulnT = max(invulnT, 0.5)`，`instantReload` 逐帧 `player.reloadT = 0`——与 bench `benchCheats` 同源语义（`tank_bench.html` 同名逻辑）。
- 原 `#devCardList` 单列平铺按钮**废弃**，改为 `#devCardPicker`（见下）。

## 卡牌选择器

（原 §7.2：分组 / 搜索 / 持有标注 / 单卡回滚）

- **分组折叠**：按效果类型分 **11 组**——主武器安装 / 主武器升级 / 副武器安装 / 副武器升级 / 弹种升级 / 弹种强化 / 主动技能 / 被动机制 / 参数强化 / 无人机 / 经济（未命中任何组的进「其他」兜底）；组头显示数量，可折叠、默认全展开、会话内记忆。
- **搜索**：`#devCardSearch` 按名称 / id / 稀有度 / 标签 / desc 实时过滤（大小写不敏感）；面板打开时按 **`/`** 聚焦搜索框（输入框内不拦截，不破坏正常输入）。
- **持有标注**：候选项尾附 `· 已持有 ×N`（读 `player.cardEffects` 的 `cardId` 计数）。
- **应用**：点击候选项即 `pickCard`（`applyCardEffects` 管道），应用后按钮短暂高亮 **700ms**。
- **单卡回滚（−1）**：`rollbackDevCard(cardId)` —— `clearCardsFromTank` 后按 `cardEffects` 原序重放（跳过目标卡一个实例），覆盖 `modifiers`/`cardEffects`/`weapons`/`ammo`/`drones` 全部副作用面；重放异常时用 `snapshotCardTx` receipt 经 `rollbackCardTx` 整体还原。
  - **为何用重放而非直接截断**：武器安装/升级与弹种链的副作用已合并进 `weapons`/`ammoLoadout`，仅截断 `cardEffects` 无法回退。
- **清除全部**：`#devClearCardsBtn` → `clearCardsFromTank`。
- **事务原语**全部复用 `js/tank_panels_core.js`（`applyCardToTank`/`snapshotCardTx`/`rollbackCardTx`/`clearCardsFromTank`），未新增状态面；**#F（2026-09-20）DOM 已随 devPanel 一起抽入共享模块 `js/tank_devpanel.js`**（分组/搜索/持有/回滚逻辑两页同源；bench 经 `cardClick` 缺省实现直接应用卡牌，battle 传页面 `pickCard` 获得技能提示/toast 反馈）。

## 两页按键/文案统一

（原 §7.3：差异 = 注册差异）

- **键位唯一数据源**仍为 `js/tank_bindings.js`（`KEY_BINDINGS`/`ACTION_INFO`）；两页差异只剩「注册了哪些动作」：
  - **battle** 注册技能池 1/2/3、F、H/Shift+H、4/5/6、Tab、**B（卡牌查看器，2026-10-17 #U23；2026-10-27 由 C 改 B）**、F12、ESC、滚轮缩放；
  - **bench** 额外注册方向键（第二驾驶位开靶车）。
- **G / V 语义统一（2026-09-19 修复同键不同义冲突）**：两页 **G = 战术炮击**（`artillery` → `callStrike`，鼠标落点）、**V = 超装填**（`overdrive`）。bench 旧把 G 挪用为「超级火控 Buff」、V 为「超级速度 Buff」——两 Buff 改为**面板按钮专属**（`skillFireCtrlBtn`/`skillSpeedBtn`，走 `activateAbilityForTest`），不再占用 G/V；bench 同步补载 `js/tank_strike.js` 并在 update 驱动 `updateStrikes` + `updateAbilityCds`，使炮击链路与 battle 同构。
- **bench Tab 键 preventDefault**：`createInputController({ preventKeys: [' ', 'tab'] })` —— bench 无状态面板，Tab 不再落到浏览器焦点遍历。
- **bench 弹种条方向提示修正**：`renderAmmoIndicator` 的方向标由「下一格 Q / 上一格 E」**改为「下一格 E / 上一格 Q」**（与 `KEY_BINDINGS.ammoNext='e'`/`ammoPrev='q'` 同向；旧提示按键得到反向弹种）。
- **陈旧文案清理**：bench 控制说明由「1/2/3 弹种切换（AP / APCR / HE）」改为「E / Q 环形切换弹种（或点击弹种格；数字直选已摘除）」；battle 弹药槽按钮 title 由「1号主弹药 (1)」等改为「主/副/备用弹药槽 N（E/Q 环形切换 / 点击选择）」。

> 键位全表与 `ACTION_INFO` 的权威是 `js/tank_bindings.js`；F 键边沿语义见 [战斗规范 · 开关类副武器](../combat/abilities-secondary.md)。

## HUD 渲染实现级合并

（原 §7.4，`#3`，2026-10-20 已完成第一批）

> **沿革**：本节原记「9 处 HUD 同功能两套实现，渲染实现级合并仍在 PLAN §2 非阻塞遗留」。2026-10-20 用户裁定口径「A. bench 与 battle 共用同一套 HUD」后落地第一批。

- **弹种指示器已同源**：`js/tank_hud.js` 的 `renderAmmoIndicator(H)`（`H` 注入 `list` / `currentIndex` / `onPick` / `showMult` / `centerActive`）。battle 传 `activeLoadout()` + `showMult:true`；bench 传 `getAmmoKeys()` + `onPick` + `centerActive:true`。两页旧内联实现保留为 `TankHud` 缺失时的兜底分支。
- **DOM 契约（两页必须一致）**：容器 `#ammoIndicator`，格子 `.ammo-cell`，激活格 `.ammo-cell.active`，内部 `.dot` / `.key` / `.label` / `.mult`。
  - **bench 的 `<style>` 已于 2026-10-20 补齐 `.ammo-cell` / `.ammo-cell.active` / `.key` 三条规则**（此前只有元素内联样式，走共享实现后激活高亮整体消失——本次审查发现并修复，见 `DEVELOPMENT-batches-2026-10.md` §4.111）。
- **散布锥已同源**：`drawSpreadCones(ctx, gp, aimA, sigma, {length, dual})`。`dual:true` = 1σ 实线（68%）+ 2σ 虚线（95%）。battle 用 **250px** 短锥（战斗视野），bench 用全长（解算面板语义）。
- **经取证不计入合并**：血条（battle 底部 HUD vs bench 右栏靶车数据面板）、日志（battle 独立浮层 vs bench 常驻栏）——属**产品定位差异**，非「同功能两套实现」。
- **~~仍未合并：装填指示（battle 环 vs bench 横条）、FPS 读数两份实现~~ → 已于 2026-10-20 用户裁定「关闭」（无剩余项）**：装填指示经核实与血条**同性质**——两页 HUD 承载不同信息（battle = 炮口环形弧 + 底部常显血条，面向战斗节奏；bench = 右栏横条 + 靶车数据面板，面向参数核对），合并会抹掉各自定位 ⇒ **产品定位差异，不计入合并范围**。9 处的最终去向：**6 合并 + 2 产品定位差异 + 1（原「FPS 读数/日志」曾重复计数）**。归口 `DEVELOPMENT-batches-2026-10.md` §4.112(10)。
  - **沿革（不静默删除）**：本段原写「仍未合并：装填指示、FPS 读数」——该结论建立在「凡是两套实现就该合并」的前提上，2026-10-20 用户裁定推翻了该前提（产品定位差异不算重复）。

> **「未纳入本轮（仍开放）」栏**（原 §7.7）的内容已于 2026-10-20 **全部关闭**——装填指示与血条同属产品定位差异、FPS 读数已合并。详见 [沿革与已作废](./changelog.md#未纳入本轮2026-09-19-c5已全部关闭)。

## 卡牌分组：从 devPanel 内部常量提纯为共享纯函数（2026-10-22）

**用户需求**：「bench 中的卡牌分类需要改为主要游戏中开发者面板中卡牌的分类方式」。

**改前**：devPanel 的 `DEV_CARD_GROUPS`（**11 组、按效果类型**）是 `mountDevPanel()` **内部**的 const，外部不可复用；bench 的 `#cardSelect` 走 `groupCardsByRarity`（**按稀有度**）⇒ 两页维度不同。

**改后**：

- `DEV_CARD_GROUPS` 提到 `js/tank_devpanel.js` **模块顶层**；新增纯函数 `devCardGroupKey(card)`（**首个匹配**语义，与旧内联循环一致）、`devCardGroupLabel(key)`、`groupCardsByEffect(cards)`；四处一并 `module.exports`。
- `tank_bench.html` 的 `populateCardSelect` 改用 `groupCardsByEffect`（`<optgroup label="主武器安装（4）">` 形式，选项文本保留 `名称 · RARE`）⇒ 与正式游戏 devPanel 的「卡牌」Tab **逐组数量一致**（实测 205 张分入 11 组）。
- **降级链**：`devCardGroupKey` 缺失 → 回落 `groupCardsByRarity`（旧行为）→ 再缺回落本地稀有度桶。

**11 组口径**：主武器安装 / 主武器升级 / 副武器安装 / 副武器升级 / 弹种升级 / 弹种强化 / 主动技能 / 被动机制 / 参数强化 / 无人机 / 经济（+ 「其他」兜底桶）。

**同批修的两个 bench 既有缺陷**（验证「同源」时暴露的阻断项）：

1. bench 的 `getCardPool` 传给 devPanel 的是 `{id→spec}` 对象而 devpanel 期望数组 ⇒ 面板恒显「卡池为空」，现改为数组。
2. devPanel 的 `liveData` 读 `update()` 的局部变量 `worldW/worldH` 抛 `worldW is not defined`，现改读 `canvas.width/height`。

## bench Enemy Lab 控件（2026-10-26）

（用户需求：「为 bench 中生成的敌人增加位置检测，防止生成到可视区域外」+「提供清空所有敌人按钮」。两处逻辑都抽成可 Node 测的共享函数，页面只做接线）

| 控件 | 位置 | 现行口径 |
|---|---|---|
| 生成敌人 SPAWN / 生成一批 | Enemy Lab 主面板 | 生成点一律先过 `clampSpawnIntoView(cam, x, y, 80)`（`js/tank_camera.js`）：收进 `viewBounds(cam)` 内边距 80px（≈车体半径 + 血条），**只推越界轴**；视口窄于 2×margin 时退化到视口中心；日志标注「已收进视口」/「收进视口 n/m」 |
| 清空所有敌人 CLEAR | Enemy Lab 主面板（`#clearEnemiesBtn`） | 与 devPanel 开关 Tab 的「清场」**绑同一函数** `benchClearAllEnemies()` → 纯函数 `clearEnemyEntities(entities, { keepIds: ['dummy'] })`（`js/tank_panels_core.js`）：**只认 `team === 'enemy'`**，靶车由 `keepIds` 保留，玩家/友军不动；随后解掉指向已删实体的导弹锁定、清 `enemySelectedId` |
| 清场（原 devPanel 项） | devPanel 开关 Tab | ~~按 `nodeSpawn`（生成来源）过滤~~ → 与上一行同源（2026-10-26）。旧口径会漏掉任何未打该标记的敌军 |

**为什么需要视口护栏**：1280×720 @ zoom 1.3 的视口世界半高 = `vh/2/zoom` ≈ 277px，而批量生成按「玩家周围 300~500px 环形」布点 ⇒ 相当比例的敌军一生成就在屏幕外。回归：`scripts/test-camera.js` 的 #AA6 段（几何本体）+ `scripts/test-bench-tools.js`（页面接线，含负向断言「不得再按 nodeSpawn 过滤」）。

## 相关页面
- [浏览器自动化测试链](./browser-tests.md) — 验证 devPanel 四 Tab 与卡牌选择器的四链
- [内容工具与 appearance](./appearance-aimspeed.md) — NF-1 全池页签 / NF-4 悬停预览
- [贴图与涂装视觉规范](./visual-spec.md) — 设计器侧的四层精灵面板
