# Rogue Tank — 工程问题清单（已核实）

> **本文档是临时文档**：只存放**待处理 / 处理中**的已核实问题。
> 条目**修复并验证有效后**，按 `AGENTS.md` 定义的 4 步生命周期：先把结论同步进 `DEVELOPMENT.md` → **删除本条目** → 原文归档到 `ARCHIVE.md`。

## QA Test Infrastructure Issues（2026-08-19）

> 当前无待处理问题。

---

> 已解决并归档的历史条目（#1~#26, #44, #49, #60~#75 及修复记录、附注特性）：见 `ARCHIVE.md`.

## 玩法设计问题（2026-08-24）

### #78. 掩体形状单一(矩形为主)，缺不规则岩石/连续曲线水域/烂泥减速地形

**可复现证据：**
- 引擎已支持多边形顶点：`coverCorners`/`coverCollisionParts` 当 `cov.verts≥3` 走多边形（`js/tank_cover.js:143-156`），`findCoversOnRay` 也消费多边形角点；但 7 个模板中仅 `urban_block`（`js/tank_nodegen.js:113-125`）、`village_center`（`js/tank_nodegen.js:207-219`）各 1 个掩体用 `verts`/`collisionVerts`，且只是"矩形+缺口"，并非不规则岩石。其余 ~115 个元素全是 `w/h/angle` 矩形 OBB。
- `RULES.coverTiers`（`js/tank_rules.js:81-92`）现有 tier：half/full/bush/tree/fallen/soft/barricade/stump/rubble/water/bridge；**无 rock、无 mud**。
- 水域 `water` 是 `mode:'solid'` 且 `draw:'box'`（`tank_rules.js:91`）：① 矩形 OBB 而非连续曲线；② `mode:'solid'` 既挡炮弹又因 `move:0.0` 完全阻断移动，非单纯地形。且仅"每节点≤1、概率 diff*0.5、封顶 40% 节点尺寸"生成（`js/tank_nodegen.js:476-491`）。
- 烂泥地（拖慢、不挡弹）：系统把"地形/掩体"统一抽象为 `covers` 数组，**无独立地面地形图层**；`driveTank` 运动系数取自 `COVER_TIERS[tier].move`（`js/tank_move.js:24-40`），`resolveCoverCollisions` 仅对 `solid` 推出（`js/tank_move.js:52`）。现有 tier 中无"减速但不挡弹"的地面地形（soft 可击毁、half 参与弹道遮蔽）。

**根因：** 数据层未充分利用引擎既有的多边形顶点能力；缺 rock/mud tier 与"减速不挡弹"地形图层概念。

**影响：** 地形同质化，缺自然掩体形态（不规则岩石、连续曲线水域）与减速地形博弈。

**状态：** 待处理（剩余范围：设计器 verts UI）

---

> 其余历史问题（#76~#77、#79~#82、#84~#85 等）：已全部解决并归档，见 `ARCHIVE.md` 索引表 2026-08-24 条目。

---

## 平衡与系统接线问题（2026-08-26，#A1~#A16）

### #A1. 局内商店姿态稳定/精密火控字段耦合 + 恒价

**状态：** 待处理

**可复现证据：**
- `js/tank_economy.js:361-364` 两升级项共用 `stat:'spreadMult'`（精密火控 mult 0.96 / 姿态稳定 add −0.15, baseCost:35, costGrowth:1.0, maxLevel:1）。
- `tank_mvp.html:1332-1334` 预览从同一 stats.spreadMult 现算导致联动。
- 价格公式 `economy:403-405` 因 costGrowth:1.0 恒为 35。

**根因：** 两商品共用 stat 字段 + costGrowth 数据设定。

**影响：** 商店预览联动失真；价格恒定无成长曲线。

**处理方向：** 姿态稳定改独立 stat（如 motionSpreadMul 三扩专用系数）或改 mult 模式；重校准 RUN_SHOP_DEFS 价格曲线。

---

### #A3. 局内商店结构缺陷合集

**状态：** 待处理

**可复现证据：**
1. 火力组仅 fast_reload/precision_gunnery/steady_mount（`economy:356-364`），缺穿深/伤害项（pen_up/dmg_up 只在局外 UPGRADE_DEFS :35-36）。
2. computeStats 对 reload 无 0.5s 下限钳制（`tank_model.js:42-65` 全文无 clamp）——"最短0.5s不能再升"实为误读，现状是无上限。
3. 防护六面拆卖 hull/turret×front/side/rear 各+2mm（`economy:365-383`），未打包车体/炮塔。
4. 机动仅 engine_overdrive maxSpeed+3px/s（`economy:385-387`），单位 px/s 非 km/h，无马力/加速度项（局外同样只有 speed_up）。
5. 维修/医疗冷却实测不成立——KIT_BASE_CD=45，mvp:1314,1317 满投入最低恰 15s 不短于 15s。
6. 紧急维修超上限不成立——mvp:1298 有 Math.min(maxHp,·) clamp；TAB 血量每帧刷新（mvp:2402-2403）。

**影响：** 商品结构不合理、单位显示误导、部分传闻缺陷经核实不存在（第5/6项）。

**处理方向：** 按用户需求重设计 RUN_SHOP_DEFS：装填加 0.5s 下限、火力增穿深/伤害项（暂无上限）、防护改车体/炮塔打包、极速改 km/h 显示且 ≤150km/h 上限、新增马力项（降加速手感）。

---

### #A5. 自身模块受损/成员受伤无 UI 指示

**状态：** 待处理

**可复现证据：**
- grep MODULE_LABELS/debuffIcon 于 tank_mvp.html 仅右侧 pushLog 文本日志。
- TAB statusPanel 只显 hp/装甲列表（mvp:185-201 CSS），无模块/乘员行、无顶部中央状态条。

**影响：** 玩家无法直观感知自身模块/乘员受损状态。

**处理方向：** 画面顶部中央新增成员/模块状态条。

---

### #A9. 半高掩体实战低生效评估（属实，三条件互斥）

**状态：** 待处理

**可复现证据链：**
- 交战距离短（engageRange=520/keepRange 320，`tank_rules.js:322,326`）使 C 插值豁免几乎恒成立。
- 炮塔恒露让敌方打炮塔即可绕过整个 half 模型（Ttk≈3发）。
- AI 仅 coverSeek（`tank_ai.js:333` 重甲+hp<60%+500px）才用 half，且 half vision:false 不遮视线（`tank_cover.js:447-455`+`tank_rules.js:94`）。
- 再叠 A8 瞬移 bug 观感恶化。

**剥离可行性：**
- 最小方案 half.shellBlock 'grad'→true + exposureProfile:'full'，可删 shellVerticalDecision/C 插值子系统（`tank_fire.js:16-39,347-355,371-378` + `tank_cover.js:399-419`）。
- 联动项：`tank_ai.js:333`、`tank_nodegen.js:958-962`、docs/specs/map.md §2、test-covers/test-fire/test-extreme-cover。
- ruined 共享 exposureProfile:'half'（`tank_rules.js:109`）需一并裁定。

**反向意见：** half 是"打炮塔破掩体位"战术深度唯一载体，建议先修 A8 再观察数据。

---

### #A10. 树冠视觉尺寸与逻辑盒脱节 + 倒树不可辨识

**状态：** 待处理

**可复现证据：**
- 树冠径 bake 硬编码 R=max(w,h)*1.9（`tank_assets.js:147`），scale≈3 时冠幅≈232–280px 而逻辑 OBB 只有 24×18×scale（遮挡判定只认 cov.w/h，`tank_cover.js:322-324`）——所见远大于所挡。
- 倒树 fallen 尺寸链路正确（57.6×9）但绘制细线条1-1.5px+alpha≤0.55 无轮廓对比（`tank_assets.js:161-201`），无 destroyed 专用渲染分支。

**影响：** 视觉遮挡与逻辑遮挡不一致；倒树在画面上难以辨识。

**处理方向：** 冠径乘数降到 ~1.2-1.4 或提为 RULES 参数保持"所见即所挡"；倒树加深描边/根部断茬高亮/衬底椭圆。

---

### #A11. 地形占位冲突：道路/水域任意叠加 + 道路不贯穿

**状态：** 待处理

**可复现证据：**
- 村庄道路落位零检测（`tank_nodegen.js:641` 直接 push，不避让模板 items:161 与林地簇:1037-1041）。
- edgeRiver 零检测（:482-510）；中央水潭 25 相位全失败兜底强制居中（:456）仍叠加。
- P-20 水体/桥有检测（:1072-1148）。
- 道路单街长度仅模板边长×[0.55~0.75]（:617）不到达边缘即止+折线偏转±0.08~0.22rad 造成断裂；道路只是村落附属层非地图骨架。

**影响：** 道路与建筑/林地/水域任意重叠；路网断裂不贯穿。

**处理方向：** generateNode 最前新增地图级路网阶段（2~3 条贯穿主干道 polyline + 分支 + occupied 集合复用 obbPairHits:583-593），village 层沿路网选簇心，edgeRiver 加 rectHitsCover（压路处放 bridge 反成特性），去掉水潭强制居中。约 +150 行中等重构。

---

### #A14. "全线高爆战术"过强 / "超口径高爆弹"未生效死效果

**状态：** 待处理

**可复现证据：**
- demo_all_he_doctrine legendary 三重效果 HE dmg×1.2+HE pen×1.2+reload×0.85——reload 是全局 modifier 白送全弹种装填。
- demo_overmatch_shell passive overmatch value:0.85 全仓无消费方（cardEffects 消费仅 drone/ability/ammo 三处：mvp:1007/`tank_abilities.js:74-77`/`tank_cards.js:182`），实际只有 HE dmg×1.14 生效。
- 转 AP 可行：resolveHit 经 shell.shooter.cardEffects 读 passive 加系数，小改 tank_physics.js。

**影响：** 一卡效果溢出到全局装填；另一卡为死效果。

**处理方向：** 全线高爆拆出 reload 或降 -8%；overmatch 接线并按需求转 AP。

---

### #A15. 成员防护内衬两张卡完全未实现（比描述不符更严重）

**状态：** 待处理

**可复现证据：**
- cards/support_spall_liner.json（rare −20%）/spall_liner.json（epic −50%）的 passive spall_liner 运行时零消费（PASSIVE_KEYS 仅白名单声明 `tank_cards.js:42`；`tank_physics.js` 模块/乘员路径无检查）。
- 归档快照 :520 自证 passive/economy 类挂账未接线。
- 用户所述"描述应为坦克受伤降低"在代码中无对应物——真实状态是拿卡毫无效果。

**影响：** 两张卡完全无效但仍占抽卡池。

**处理方向：** resolveHit 模块伤害分支接 cardEffects.spall_liner；接线前先移出抽卡池或标注未生效。

---

### #A16. 敌方/Boss 参数绑定审计结论 + 配套发现

**状态：** 待处理

**审计结论：** 运行时 reload/turnRate/turretTurnRate/maxSpeed 消费点全部读自身 t.stats（`tank_move.js:38,43` / `tank_fire.js:66,78` / `tank_ai.js:92,150,240,402`），**无任何运行时读 player.stats 的路径**——"跟着玩家实时数值"不成立；玩家绑定仅 spawn 快照三处直写：
1. pen 封顶 mvp:953-955 直写 stats.penetration（RULES.difficulty.penCapVsPlayer=1.2, `tank_rules.js:409`）；
2. damage 地板/天花板 mvp:958-969（dmgFloorVsPlayer 0.4/dmgCapAmmoMult 0.7, `tank_rules.js:410-411`）；
3. maxSpeed 公式硬编码页内 lerp(0.3,0.6)×rand(0.85~1.15)×player.stats.maxSpeed（mvp:974-977），**覆盖了刚应用的 entityMults.maxSpeed（`tank_rules.js:428` 对该字段实际失效，两套机制打架）**，且违反"调参进 RULES"约定。

**风险：** 三处均绕 modifiers 直写，敌人后续 refreshStats 会把未封顶值还原（潜在回归点）。

**敌穿深确定性：** fireTank pen=stats.penetration*ammo.pen（`tank_fire.js:90`）无随机 → "打不穿永远打不穿"成立；改造落点=开火时刻对非玩家 shooter roll 0.6–1.4 正态（参数进 RULES，gaussian 注入通道已有 tank_fire.js:50），勿在 resolveHit roll（波及玩家+预测面板 predPen 失真）。

**Boss：** tuning 链零玩家引用（`tank_boss.js:212-217`）；射速已绑难度三层乘子（boss fireRateMul 缺省 0.6 + entityMults.reload[1.25,0.82] + 阶段 onEnter）。

**文档漂移：** docs/DEVELOPMENT.md:25 仍写旧键 enemyStatCapVsPlayer=0.8，代码已是新三键方案（`tank_rules.js:407-411`）——需同步。

**处理方向：**
- a-3 速度公式提为 RULES.difficulty.speedVsPlayer 表并消除与 entityMults 打架；
- 直写改经 modifiers 注入防 refreshStats 回归；
- 敌 pen 浮动按上述落点实施；
- 修 DEVELOPMENT.md:25。

---
