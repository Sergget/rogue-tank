# HUD 与界面

> **摘要**：底部三区 HUD、装填环、技能槽、Boss 血条、TAB 面板刷新，以及「元素 id 即测试契约」这条红线。
> **适用版本**：现行（2026-10-21）
> **源自**：`docs/specs/combat.md` §9.6、§9.8、§6（HUD 段）（2026-10-21 拆分）
> **相关**：[技能与副武器](./abilities-secondary.md) · [特效与视效](./fx-visual.md) · [游戏模式](./game-modes.md)

## 目录
- [底部 HUD 三区](#底部-hud-三区)
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
| 状态 VITALS | `#hudVitals` | `#playerHpWrap`（血条 240×12 + 数值）+ `#hudSpeedRow`（档位 `#hudGear` D/R、`#hudSpeedVal` + km/h 单位、速度条 `#hudSpeedTrack`/`#hudSpeedFill`、公路加成 `#hudRoadBonus`） |
| 武器 WEAPONS | `#hudWeapons` | 弹种槽 `#slot1~3` + 补给键 `#btn4/5/6` + 副武器 `#btnF` |
| 技能 SKILLS | `#hudSkills` | 技能池槽 `#skillSlot1~3`（玩家指派，技能名 + 数字键 + 冷却）。**`#btnG/H` 已删除（#U42，2026-10-19——G/H 专属键退役）** |

- **速度读数**：`tankCurrentKmh(t) = |t.speed| ÷ (RULES.speed.pxFactor × effMul) × kmhFactor`（`tank_model.js`，已导出）。**必须先除 `pxFactor×effMul` 再乘 `kmhFactor`**——直接乘会得到 ~208km/h 的虚高读数（`tank.speed` 已含 ×1.3 有效乘子）。速度条以 `tankKmh(t)`（极速上限）为满值。
- **公路加成读数（#AA1，2026-10-26）**：`#hudRoadBonus` 的换算与上一行**不同口径**——`roadBonus` 与 `stats.maxSpeed` 同尺度，只能 `× kmhFactor`（`roadBonusKmh()`，与 `tankKmh` 同源），**不得**再除 `pxFactor×effMul`（旧实现混用两套口径 ⇒ 标「+5km/h」而实机 +10km/h）。机制与数值唯一口径见 [道路与路网 · 公路加速](../map/roads.md)。
- **技能池槽位映射（#H3 2026-09-30 重做，现行口径见 [技能槽指派](./abilities-secondary.md#技能槽指派)）**：`#skillSlot1~3` 的内容**直接读 `player.skillSlots`（玩家可指派）**，不再是 `cardEffects` 的自动去重序列。名称取 `ABILITY_LABELS`，冷却取 `abilityCds[key]`；点击槽位施放，`Shift+点击`改指。**原「自动按获得顺序填槽 + 专属键按钮并存」口径已废弃**（它导致同一技能两个按钮、槽满后第 4 个技能无法激活）。
- **技能获得提示补全**：`ABILITY_KEY_HINT` 补 `repair`/`medkit`/`extinguish`（4/5/6 键）与 `aps`。**#U42（2026-10-19）后文案统一「技能槽数字键」**——G/H/V 专属字母键全部退役（沿革：#H3 后曾有「仅 G/H 仍为专属字母键」的过渡口径，已终结）。

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
