# Rogue Tank — 工程问题清单（已核实）

> **本文档是临时文档**：只存放**待处理 / 处理中**的已核实问题。
> 条目**修复并验证有效后**，按 `AGENTS.md` 定义的 4 步生命周期：先把结论同步进 `DEVELOPMENT.md` → **删除本条目** → 原文归档到 `ARCHIVE.md`。

## QA Test Infrastructure Issues（2026-08-19）

> 当前无待处理问题。

---

> 已解决并归档的历史条目（#1~#26, #44, #49, #60~#75 及修复记录、附注特性）：见 `ARCHIVE.md`.

---

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

### #A18. 回放基线批量 seed 扫描：大量节点超时（战斗不收敛）

**状态：** 待处理（根因待排查）

**可复现证据：**
- 诊断脚本 `scripts/diagnose-replay-seeds.js`（P-44 待办① 落地，基于 `js/tank_sim.js runReplay` 确定性回放）跑 `24 seeds × 4 nodes，maxNodeTime=45s`：
  - outcome 分布：win=18 / loss=17 / **timeout=61**（总节点 96，超时率 ≈63%）；
  - hardCrash=0、zeroFire=0、earlyLoss=0，但 **23/24 seed 达 timeoutHeavy 阈值（≥2/4 节点 timeout）**；
  - 完整 TIMEOUT-HEAVY 清单（seed→timeout 节点数）：1:2 2:3 3:4 4:2 5:3 6:3 7:2 8:3 10:3 11:2 12:2 13:4 14:4 15:2 16:3 17:3 18:2 19:2 20:2 21:3 22:2 23:2 24:2。
- 结论：**zeroFire=0 说明双方确有交火，但绝大多数节点在限定时间内分不出胜负**——属「有开火但不收敛」类，与已修复的 #A17「零开火卡墙」是不同根因类。
- 阈值依赖：本扫描 maxNodeTime=45s（比 test-replay.js 基线 120s 更激进）；真实超时率随上限抬升下降，但高占比提示 sim 代理玩家推进逻辑（`tank_sim.js` 内 `nearestEnemyTo` 触发距离 700×0.75 机动）或 AI 对峙未强制终结，基线对「战斗不收敛」类回归探测力弱。

**影响：** P-44 回放基线主要价值是「修补后 hash 归因」，但当前高超时率使其难以区分「真实平衡」与「sim 缺陷导致的假超时」，削弱回归判据信度。

**处理方向（建议，待核实）：**
- 排查 sim 代理玩家推进阈值与 AI 对峙：是否应在超时前强制拉近/强攻，或真实对局同样高超时（需对比真人录像或浏览器实跑）；
- 区分「真平衡超时」（双方势均力敌）与「sim 缺陷假超时」（代理玩家/AI 卡位）；
- 若确认为 sim 缺陷，增强 `tank_sim.js` 代理玩家行为或加 `forceResolve` 兜底，使基线超时率降至可解释区间，再重锚 baseline hash。
