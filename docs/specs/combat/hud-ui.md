# HUD 与界面

> **摘要**：底部三区 HUD、装填环、技能槽、Boss 血条、TAB 面板刷新，以及「元素 id 即测试契约」这条红线。
> **适用版本**：现行（2026-10-21）
> **源自**：`docs/specs/combat.md` §9.6、§9.8、§6（HUD 段）（2026-10-21 拆分）
> **相关**：[技能与副武器](./abilities-secondary.md) · [特效与视效](./fx-visual.md) · [游戏模式](./game-modes.md)

## 目录
- [底部 HUD 三区](#底部-hud-三区)
- [玩家侧暴露度指示器](#玩家侧暴露度指示器)
- [装填环与热量表](#装填环与热量表)
- [开火后坐与底部常显 HUD](#开火后坐与底部常显-hud)
- [Boss 血条](#boss-血条)
- [暂停菜单商店与 TAB 面板](#暂停菜单商店与-tab-面板)
- [元素 id 测试契约](#元素-id-测试契约)

## 底部 HUD 三区

（原 §9.6，2026-09-21 #G7/#G8）

`#bottomHud` 由旧「血条 + 单排按钮列」改为 **flex 三区**（`display: flex`，JS 侧 `updateBottomHud` 同步改 `'flex'`——旧 `'block'` 会杀死分区布局）：

| 区 | 容器 | 内容 |
|---|---|---|
| 状态 VITALS | `#hudVitals` | `#playerHpWrap`（血条 240×12 + 数值）+ `#hudSpeedRow`（档位 `#hudGear` D/R、`#hudSpeedVal` + km/h 单位、公路加成 `#hudRoadBonus`）。速度条 `#hudSpeedTrack`/`#hudSpeedFill` 已于 2026-10-26 删除（#AA7） |
| 武器 WEAPONS | `#hudWeapons` | 弹种槽 `#slot1~3` + 补给键 `#btn4/5/6` + 副武器 `#btnF` |
| 技能 SKILLS | `#hudSkills` | 技能池槽 `#skillSlot1~3`（玩家指派，技能名 + 数字键 + 冷却）。**`#btnG/H` 已删除（#U42，2026-10-19——G/H 专属键退役）** |

- **速度读数**：`tankCurrentKmh(t) = |t.speed| ÷ (RULES.speed.pxFactor × effMul) × kmhFactor`（`tank_model.js`，已导出）。**必须先除 `pxFactor×effMul` 再乘 `kmhFactor`**——直接乘会得到 ~208km/h 的虚高读数（`tank.speed` 已含 ×1.3 有效乘子）。~~速度条以 `tankKmh(t)`（极速上限）为满值~~ —— **速度条已于 2026-10-26 用户裁定删除（#AA7）**：条只把「当前 / 上限」重复编码成图形，而 km/h 数字本身已是精确读数；且公路加成让读数超过 `tankKmh` 满格时条被 clamp 在 100%（#AA1 附带误读的根源）。现行为「档位 + 数字 + 公路加成标记」三件。
- **公路加成读数（#AA1，2026-10-26）**：`#hudRoadBonus` 的换算与上一行**不同口径**——`roadBonus` 与 `stats.maxSpeed` 同尺度，只能 `× kmhFactor`（`roadBonusKmh()`，与 `tankKmh` 同源），**不得**再除 `pxFactor×effMul`（旧实现混用两套口径 ⇒ 标「+5km/h」而实机 +10km/h）。机制与数值唯一口径见 [道路与路网 · 公路加速](../map/roads.md)。
- **技能池槽位映射（#H3 2026-09-30 重做，现行口径见 [技能槽指派](./abilities-secondary.md#技能槽指派)）**：`#skillSlot1~3` 的内容**直接读 `player.skillSlots`（玩家可指派）**，不再是 `cardEffects` 的自动去重序列。名称取 `ABILITY_LABELS`，冷却取 `abilityCds[key]`；点击槽位施放，`Shift+点击`改指。**原「自动按获得顺序填槽 + 专属键按钮并存」口径已废弃**（它导致同一技能两个按钮、槽满后第 4 个技能无法激活）。
- **技能获得提示补全**：`ABILITY_KEY_HINT` 补 `repair`/`medkit`/`extinguish`（4/5/6 键）与 `aps`。**#U42（2026-10-19）后文案统一「技能槽数字键」**——G/H/V 专属字母键全部退役（沿革：#H3 后曾有「仅 G/H 仍为专属字母键」的过渡口径，已终结）。

### 左下角目标卡与提示条：可读性口径（#AA8，2026-10-26）

用户反馈「标准模式左下角的**任务描述**在某些地图 biome（雪地/沙漠）上看不清」。根因是这两个元素只靠 text-shadow 压在地表上、没有底衬，且字号偏小、正文用了暗色：

| 元素 | 旧值 | 现行口径 |
|---|---|---|
| `#quotaHud`（目标卡：目标 OBJECTIVE + 推进/配额/残敌） | 10px、`--text-dim`、仅 `text-shadow 0 1px 2px`、无底衬、`bottom:32px` | **11px**、`color:var(--text)`、`background:rgba(8,9,6,0.72)` + 1px `--line` 边框 + 左侧 2px `--amber-dim` 定位条、`backdrop-filter:blur(2px)`、`max-width:min(520px,34vw)`、**`bottom:92px`**（抬到底部 HUD 带上方，不再与中间 HUD 抢位）；`pointer-events:none` 不变 |
| `#hintBar`（底部常驻操作提示） | 9px、`--text-dim`、`opacity:.75`、无底衬 | **10px**、`color:var(--text)`、`background:rgba(8,9,6,0.66)`、`opacity:.92`、同款 1px 边框与 text-shadow |

两条附带约束：

- **日志让位**：`#logPanel` 打开时（`logOpen`）目标卡**不显示**——两者都在左下角，日志是高约 160px 的实心面板，目标卡升到 `bottom:92px` 后必然与其重叠；日志是玩家主动要看的，让位优先级归日志（判据写在 `updateHud` 的显示条件里，见 `tank_battle.html`）。
- **回归形态**：`scripts/test-hud-readability.js` 以源码形状断言锁住「底衬 alpha ≥ 0.6 / 字号下限 / 正文色 / `bottom ≥ 80px` / `!logOpen` 让位 / `#topLeftInfo` 不得被误删」。CSS 观感无法在 Node 侧光栅化，但「底衬被删回去」这类回归能拦住。

> **待观察**：左上 `#topLeftInfo`（13px 白字 + 阴影，无底衬）未纳入本批。其在雪地上勉强可读，若实机仍嫌淡，按同一套补底衬即可（一行改动，已有测试位）。

## 战场阵营环（2026-10-27）

> 玩家需要在不读 HUD 的情况下分清敌我。

- **2D 战斗页**：`drawTeamRings(ctx)` 在坦克绘制前画圆环（车体压住圆心）——**友军淡绿** `rgba(150,235,150,0.55)`、**敌军红** `rgba(255,80,70,0.45)`，半径 `max(hullLen, hullWid) × 0.62 + 8`，线宽 2px。
- **3D 切片**：`buildTeamRings(entities)` 生成贴地圆环（`y=1.2`），友军 `[0.58,0.92,0.58,0.55]`、敌军 `[1.0,0.32,0.28,0.45]`。
- **不画**：玩家自己、无人机、死亡单位；Boss / 召唤物属于 enemy，照常红环。

## 玩家侧暴露度指示器

（2026-10-27 P0 新增）

**为什么需要它**：隐蔽机制（`RULES.camouflage`）在**判定层**是通的——它确实把敌方首次激活距离从 700px 压到 380~660px。但玩家侧此前**零反馈**：不知道自己当前隐蔽值多少、不知道自己此刻是否已被发现、不知道附近有谁在警戒。⇒ 系统「能算」但玩家「看不懂」，隐蔽机制在体验层等于不存在。这是「感觉不对但说不清哪里」的主要来源之一。

**与敌方 ?/! 图标的分工**（两者是同一件事的两端，缺一不可）：

| 通道 | 位置 | 表达 | 性质 |
|---|---|---|---|
| 敌方 `?`/`!` | 敌方头顶（仅视口内） | **谁在找我**（敌方对玩家的认知） | 事后通知 |
| 暴露度指示器 | 底部 VITALS 区（玩家身上） | **我此刻暴不暴露**（玩家自身状态） | 可预判 |

只有 `?`/`!` ⇒ 玩家被「通知」但无法预判；只有暴露度 ⇒ 玩家知道自己的暴露水平但不知道敌人在哪。

**实现**：

- 纯函数层 `js/tank_exposure.js`：`exposureFor(player, enemies)` → `{ level, label, tone, ratio, effDist, baseDist, spotted, watchers, suspect }`。**纯读**：不写任何实体字段，不新增任何判定。
- 口径严格对齐 `js/tank_ai.js` 的 `enterDCamo` = `enterD × camouflageDistanceMultiplier(玩家) × 对称化乘子`，其中 `enterD` 取**最近敌方**的 `aiTriggerDist`（对玩家而言「最危险的那台」才决定暴露程度）。**不新增第二套口径**（ISSUES #Z2 的教训：HUD 与机制两套口径必然漂移）。
- 接线：`tank_battle.html` 的 `#exposureHud`（VITALS 区，随 `updateBottomHud` 每帧刷新）；`tank_3d.html` 的 `#exposureHud`（随 `renderHud` 刷新——3D 切片此前对 AI 状态全盲，本条是那里唯一的可读性出口）。

**三档判据**（**事实优先于连续量**）：

| 档 | 标签 | 主判据 | 色调 |
|---|---|---|---|
| `hidden` | 隐蔽 | 有效触发距离 ≤ 基线 × 0.72，且无人搜索/锁定 | 绿（`--green`） |
| `exposed` | 暴露 | 距离回到基线水平，或有敌人在搜索你（`alertLevel≥1` / `aiState==='search'`） | 琥珀（`--amber`） |
| `detected` | 被察觉 | **已被锁定**（任一敌方 `aiEngaged` 或 `alertLevel≥3`）——事实优先，距离比再低也不降档 | 红（`#ff6b6b`） |

两条判据纪律：

1. **「有人在搜你」优先于「隐蔽」**——否则玩家正被 6 辆敌车搜索时 HUD 仍显示「隐蔽」，这比没有反馈更糟（给出虚假安全感）。
2. **「已被锁定」优先于距离比**——「被看见」是二值事实，用连续量表达会失真。

**为什么不显示隐蔽值原数**（camo 0~1.55）：camo 是内部量纲，玩家无从建立「0.6 是好是坏」的心智模型。**分档才可行动**——玩家要的不是「我隐蔽值 0.62」，而是「我现在站在开阔地且刚开过火，快跑」。

**副读数**：显示当前有效发现距离（世界 px，判定层同一尺度，**不换算 km/h**——换算会让玩家无法把它与「敌人什么时候能开火」对上，那才是玩家真正要做的决策）。`detected` 档改显「已锁定 / N 辆锁定」，`exposed` 档有搜索者时显「被搜索 ×N」。

**回归**：`scripts/test-exposure-feedback.js`（挂 `npm test`）——有效触发距离口径与 `enterDCamo` 逐项对齐、三档分档与边界值、负向断言（Boss 不计入 / 友军不计入 / 死亡实体不计入 / `symmetric` 关闭时敌方不吃隐蔽）、**纯增量纪律**（调用后实体状态零改写）、battle 与 3D 两页接线契约。

> **本机制不改任何判定**。它只补读数出口。相邻的「视线高度分档错配」（AI 调 `hasLineOfSight` 不传 `targetZ` ⇒ 灌木/墙挡不住炮塔视线）是**独立缺陷**，不在 P0 范围——那一条会改变敌人发现距离，需连带重跑 `scripts/audit-growth-curve.js` 做平衡标定。

## 装填环与热量表

（原 §6，「开火后坐与装填」段的环形化部分）

废除原屏幕底部横向装填条（`#reloadWrap` 的 `#reloadTrack/#reloadFill`），改为 `drawReloadRing(ctx)` 贴炮口 `gunTip(player)` 世界坐标的环形弧（世界坐标经 `worldToScreen`，半径固定 13px），从 -90° 顺时针扫 360°×进度，**满值(≥1)即消失**（仅战斗态、装填中、玩家存活时绘制），挂入战斗绘制循环（drawDrones 后、烟幕云前）。

**2026-09-15 W6：主武器 autocannon 时该环改为热量表**——弧长 = heatPct/**spec.heatMax**（不再硬编码 100；散热容量卡 140 时读数不再失真，2026-10-22 修正），三态配色 绿 <50% / 黄 50–<100% / 红 ≥100%（过热锁定期间红色闪烁）；冷却由 `updatePrimaryHeat` 逐帧驱动，热量归零后环消失（详见 cards.md §8.3）。

- **双联**：双管时改用两根独立进度弧，见 [武器与装填 · 双联火炮](./weapons-reload.md#双联火炮)。
- **弹夹**：余量数字 + 蓝色间隔弧 + 橙色整组重装弧，见 [武器与装填 · 弹夹炮](./weapons-reload.md#弹夹炮)。
- **电磁炮**：白色双层充能弧，见 [特效与视效 · 电磁轨道炮三段视效](./fx-visual.md#电磁轨道炮三段视效)。
- **时长公式**（漏乘 `reloadMult` 的修复）见 [武器与装填 · 装填时长公式](./weapons-reload.md#装填时长公式)。

## 开火后坐与底部常显 HUD

（原 §6，2026-08-28 落地；2026-09-15 W2 更新键位）

- **开火后坐回弹**：`fireTank` 成功开火分支写 `shooter.recoilT = 0.08`（被掩体阻挡分支不写；2026-09-15 W2 后烟幕弹已删除，`fireSmokeShell` 不再存在）；主循环 player 与非玩家实体各自递减 `recoilT`（沿用 reloadT 递减模式）。`drawTank` 炮管段按 `sin(π·recoilT/0.08)` 生成出击-回弹位移，仅把视觉炮管 baseX/baseY 沿炮管反向平移（炮盾/护套/制退器随 baseX/baseY 自然跟随），**不改 gunRoot()/gunTip() 判定坐标**；位移量随口径 `barrelWid/18` 轻微缩放。
- **底部常显 HUD**：新增 `#bottomHud`（战斗态门控 `flow.state==='battle'`）——常显玩家血条 `#playerHpTrack/Fill/Val`（同 updateStatusPanel 口径）+ 能力按钮行 `#abilityBtns`：↻弹种循环(cycleAmmo)/**F 副武器击发（2026-09-17 #C4e 语义反转，取代 toggleWeaponSlot；图标随武器类型切换 + `#cdF` 装填角标）**/4 修理箱/5 医疗包/6 灭火器（**G 炮击/H 护盾/V 超装填按钮已分别随 #U42/#H3 退役**，技能统一走技能池槽），`updateBottomHud()`（挂入 updateHud）刷新冷却角标——**按技能独立冷却** `t.abilityCds[key]`（#C4c；F 角标显示 `secondaryReloadT` 装填剩余），冷却中置灰+角标秒数。纯 UI 薄包装接线，能力逻辑仍走既有 `tryActivateAbility`/`tryRepairKit`/`tryMedkit`/`tryExtinguish`。

## Boss 血条

（原 §9.8，#S3-UI）

`#bossHpWrap`（屏幕下方中央，`#bottomHud` 上方 104px）——Boss 名 + 560px 血条 + `ceil(hp) / round(maxHp)` 数字；`updateBottomHud` 每帧经 `entities` 取存活 `isBoss` 更新，非 Boss 战隐藏。此前全仓库无 Boss 专属 HP UI（只有 44×5px 通用浮动条）。

## 暂停菜单商店与 TAB 面板

（原 §9.8，#S9/#S10，#S10a/b/c，2026-10-14）

- **暂停菜单商店入口（#S9）**：`#pauseScreen` 恢复「商店 SHOP」按钮（2026-09-14 `DEVELOPMENT.md` §4.12 摘除后漏恢复）。点击后按钮行收起、`#pauseShopWrap` 内嵌展示局内商店（`buildRunShopInto` 与结算内嵌版 `#runShopBox` 共用列表构建，同 `RUN_SHOP_DEFS` 数据源、同 `buyRunShopItem` 购买链）；战斗中购买即时生效，「返回」回到暂停菜单；每次进入暂停态自动收起商店面板。
- **TAB 面板实时刷新（#S10b/c）**：新增 `refreshStatusPanel()`（`statusOpen && run && player` 时调 `updateStatusPanel()`）——`buyRunShopItem` 购买后即时调用；主循环 `loop()` 在非战斗态（settlement/map/pause）也调用（battle 态仍走 `updateHud` 链，避免重复）。此前面板刷新只挂在 battle update 链上，非战斗态定格在打开瞬间。
- **TAB 面板刷新路径的致命性（2026-10-15 修复，务必保持）**：`updateStatusPanel` 经 `updateHud` ← `update` ← `loop` 调用，而 `loop()` 仅在**末行**执行 `requestAnimationFrame(loop)`，且 `loop`/`update`/`updateHud` **全程无 `try/catch`** ⇒ 面板刷新函数内任何抛错都会**永久终止主循环**（游戏冻结：无模拟、无绘制）。已发生实例：#8 敌方信息区误用不存在的全局 `tanks`（正确为 `entities`，`js/tank_entity.js:12`）导致 `ReferenceError`。**约定**：新增面板刷新逻辑必须保证不抛错（未知全局一律 `typeof x !== 'undefined'` 守卫，或改走 `entities` 等既有注册表）。
- **hp_up 购买回满（#S10a，用户决策）**：`buyRunShopItem` 中 `defId === 'hp_up'` 时 `player.hp = player.stats.maxHp`——消除"249/250"式显示（#A12 差量同步只按增量抬升）。

## 元素 id 测试契约

（原 §9.6）

`#reloadWrap` / `#bottomHud` / `#hintBar` 保留（smoke 依赖）；**`btnG`/`btnH`/`btnV` 三者均必须不存在**（#H3 删 btnV、#U41 删 btnG/btnH，`test-browser-run.cjs` 断言 `removed`）；bench 页**不得**出现 `#hintBar`。

## 相关页面
- [技能与副武器](./abilities-secondary.md) — 技能槽语义与键位单一来源
- [武器与装填](./weapons-reload.md) — 装填环对应的时长公式
- [游戏模式](./game-modes.md) — 生存 HUD 与 Boss 模式流程
- [特效与视效](./fx-visual.md) — 伤害飘字与装填环配色
