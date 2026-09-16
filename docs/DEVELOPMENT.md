# 战术坦克 Roguelike — 开发主文档（新方向：技能与武器构筑流派）

> 本文档是**唯一长期权威文档**，2026-09-08 起切换至全新演进方向：淡化单一弹种数值纠结，全面引入**技能系统**、**主副武器解耦**、**多类型召唤物（炮塔、无人机、掩体、地雷）**与**曲射/特种弹药体系**。

---

## 1. 项目新定型与核心方向

**类型**：俯视角 2D 战术坦克 Roguelike，强构筑、轻弹道、强调主动技能与战术组合。

**核心改动方向**：
1. **武器分化与双槽位**：坦克配置由单一主炮扩充为“主武器（机炮/双管/自动炮/电磁炮）”+“副武器/挂载（迫击炮、导弹、火箭弹、地雷布撒器）”。
2. **主动技能与模组化**：引入超级火控、超级速度、紧急装填、战术呼叫等主动技能与可拆卸模组槽位。
3. **召唤与部署系统**：支持召唤侦察/打击无人机、部署固定炮塔、放置战术护盾掩体及布雷。
4. **视觉热重载**：支持在战斗升级过程中动态改变炮塔外观、炮管附件与实体视觉版本。

---

## 2. 架构演进与演练模块

- **技能管线**：`js/tank_abilities.js` (扩展支持超级火控、超级速度等主动能力)
- **武器/弹药拓展**：`js/tank_fire.js` 与 `js/tank_rules.js` (支持曲射迫击炮、长杆 APFSDS 等特种弹药)
- **召唤物体系**：`js/tank_drone.js` / `js/tank_entity.js` (扩展固定炮塔、护盾、地雷部署)
- **炮塔与视觉热重载**：`js/tank_geometry.js` 与渲染层 `tank_mvp.html` 的脏标记刷新管线。

---

## 3. 当前活跃项与下一步顺序

1. **分支初始化**：已切换至 `feature/rogue-tank-rework`，归档旧架构核心文档。
2. **R-1/R-2/R-3 已落地**（主副武器/召唤物与部署/特种弹药与曲射，见 §4.1~§4.3）。
3. **#A11 地图级路网专轮 + #A20 HUD 按钮绑定已完成**（见 §4.6/§4.7），三条链（check / test / test:browser）全绿；测试基线历史遗留清零（见 §4.5）。
4. **构筑与卡牌落地（PLAN.md 阶段四/阶段六/阶段七）已推进**——基础数值卡/Schema及安装卡/开局弹种/副炮塔已落地（见 §4.9）；**阶段七（技能参数覆写、副武器多类型运行时开火、主武器开火机制与进阶升级卡牌全链路）已实现并验证（见 §4.11）**；剩余非阻塞项：PLAN 阶段五 §5.4 难度联动（新弹种进敌军池）、副武器 rare 升级卡内容复核与玩家侧副炮塔挂载 UI 收尾。
5. **待处理问题与长期债务**：当前 `docs/ISSUES.md` 无阻塞缺陷（所有历史缺陷已闭环归档）；#A9 半高掩体已按 D5 裁定在生成期屏蔽，作为长期技术债务/待评估特性保留，在正式版积累充分游玩实测数据前不作为活跃缺陷追踪。
6. **2026-09-14 七项用户定案已全部落地并验证**（见 §4.13）：HEC 弹种移除（14 键）、局内商店回归（基础参数+硬上限+装甲合一）、受击即警觉（任意来源+Boss 破 hold）、地图重做（曲线路+预烘焙+重叠消解）、水域溺毙+AI 避水、装备优先抽卡、开局弹种 UI 移除+新局归零；`npm run check` / `npm test`（40 脚本含新增断言与校准重锚）/ `npm run test:browser`（三脚本）三链全绿。剩余非阻塞项不变（PLAN 阶段五 §5.4 难度联动、副武器 rare 升级卡内容复核与玩家侧副炮塔挂载 UI 收尾）。
7. **2026-09-15 主武器系统改版五项（阶段九）+ W6 机炮热量重做已全部落地并验证**（见 §4.15）：曲射移除 / 烟幕删除+F 切换+导弹锁定 / 双管重做 / 卡牌通道运行时参数硬限 / 速射机炮热量机制。**注**：原五项中的「节点推进炮塔前移（W3）」已于 2026-09-16 按用户裁定整体删除（见 §4.18 #B6）。剩余非阻塞项不变。
8. **2026-09-15/16 输入分发·卡牌资格·面板分层·副炮塔挂载·升级卡复核已全部落地并验证**（见 §4.16，关闭 ISSUES #A21~#A25，推进 PLAN 阶段八 §8.1.1/§8.1.2）：F 切换 + 左键/空格按激活槽位分发（副武器不再自动运作）、副武器单槽不变量、武器卡 install/upgrade 显式化 + 抽卡资格过滤 + maxStacks 防线、面板四层分层（含卡牌事务 rollback 与参数钳制）、独立左下角日志面板、副炮塔绘制、4 张升级卡数值复核。`npm test`（新增 `test-weapon-keypress.js` / `test-weapon-upgrade-balance.js`）+ `tsc --noEmit` + `npm run test:browser`（三脚本）全绿。**PLAN 阶段八 §8.1 剩余**：§8.1.3 难度联动（新弹种是否进敌军池）。
9. **2026-09-16 主动技能 upgrade 卡持有资格闭环已落地并验证**（见 §4.17，关闭 ISSUES #A28）：5 张 ability 升级卡标记 `requiresAbility`（≡自身 key）+ `validateCardEffect` 白名单校验 + 11 张基础/安装卡零声明（无死锁）+ 保底路径不复活不合格卡 + 顺手修复 `tools/content_designer.html` 保存能力卡丢 `params`/`requiresAbility` 的管道缺陷。剩余非阻塞项不变（PLAN 阶段八 §8.1.3 难度联动）。
10. **2026-09-16 炮塔跨节点前移根治 + 路网重做已落地并验证**（见 §4.18，关闭 ISSUES #B6/#B7，用户反馈三条）：① 炮塔前移双根因——`tank_boss.js` 原地 `*=scale` 污染 `tankListData` 共享 spec（Boss 每节点 ×2 雪球：pivot 7→56 / anchors 32→256）已改为拷贝/整体替换，W3「节点推进炮塔前移」有意特性按用户裁定整体删除（`RULES.progress` + `tank_map.js` 两函数 + mvp 调用点 + `test-rework-w3.js`）；② 路网重做为「正交双干道」——取消逐段跳段（截断根因，缺口 202~246px→0）、端点落节点边界 + `lineCap:'butt'`（圆弧路头根因）、拓扑收敛至 1 横 + 0~1 纵且取消斜向支线（交叉 2~4→≤1、夹角 35°→68.8°）。全部模板连通性升至 1.000。`npm run check` / `npm test` / `npm run test:browser` 三链全绿。

---

## 4. R-1/R-2/R-3 阶段落地结论（2026-09-12）

### 4.1 R-1 主副武器与主动技能
- 主副武器双槽位（`weapons.primary`/`weapons.secondary`，`tank_weapons.js` `WEAPON_DEFAULTS`）与 `moduleSlots` 挂载经 `applyTankConfig` 接入实体。
- 主动技能：超级火控（`super_fire_control` 散布 ×0.3）与超级速度（`super_speed` 极速 ×1.5）落地 `tank_abilities.js`，冷却与 HUD 状态条接线。
- 视觉热重载：实体 `_visualVersion`/`_lastDrawnVersion` 脏标记管线，战斗中改配即触发重绘；`window.__TEST__` 暴露 `getVisualVersion`/`getWeaponState`/`triggerSkill` 测试钩子。

### 4.2 R-2 召唤物与战术部署
- 固定炮塔（`isDeployableTurret`，极速 0 + 自动索敌开火，`fixedTurretFire` 事件）、地雷（武装延迟 + `mineExplode` 触发爆炸）、战术护盾掩体（护盾吸收池）全部注册进 `deployables`，测试台 `tank_bench.html` 面板按钮可直接生成。

### 4.3 R-3 特种弹药、曲射与副武器手动开火体系
- `RULES.ammoTypes` 新增：**APFSDS**（`doubleModule: true` — 命中结算 `applyModuleDamage` 双次模块抽取，取两 roll 倍率最大值）。
- **副武器手动开火机制**：玩家副武器改为严格手动触发（右键主动击发 `fireActiveSecondary`），游戏主循环中仅推进装填冷却计时（`secondaryReloadT`）；敌人/Boss 敌对实体保留 AI 自动索敌与开火。
- **真实抛物线曲射物理（`isArc` / `ignoreCover`）**：
  - 迫击炮及曲射火炮在发射时计算目标落点（`targetX`, `targetY`, `totalDist`）。
  - 在飞行途中（`dist < totalDist`）弹体处于空中，**完全跳过中间掩体与坦克碰撞检测**（不被沿途障碍截停），直飞目标点。
  - 抵达落点后在目标处触发 AOE 溅射伤害（`applySplashAt`）、掩体破坏（`splashCoversAt`）与爆炸特效。
  - 视觉渲染（`drawShells`）增加 3D 抛物线高度计算（`z = sin(p*PI)`）与地面阴影椭圆投影。
- **副武器家族扩充（弹种机制绑定，2026-09-15 定案）**：
  - 迫击炮（`mortar`）：真实曲射 AOE 压制；**弹种固定为 HESH 计算机制**（`ammoKey: 'hesh'`，未击穿残余/大溅射，dmg/pen 经 `computeAmmoConfig(t,'hesh')` 消费玩家卡牌加成）。
  - 锁定式导弹（`missile`）：锁定目标实体追踪（`mode: 'lock'`）。
  - 线导式导弹（`missile_wire`）：实时随玩家光标/鼠标指向引导追踪（`mode: 'wire'`，发射时记录 `_secondaryTargetPos`）。
  - 直射火箭发射巢（`rocket`）：高速直射齐射弹幕。
  - 布雷器（`mine_layer`）与副炮塔（`turret`）。
  - **导弹（线导/锁定）与火箭弹伤害跟随玩家 HEAT 升级链**：`getEffectiveHeatAmmoKey` 按 HEAT 链层级（heavy_tandem_heat → tandem_heat → heatfs → heat）在玩家 `ammoLoadout`/`unlockedAmmo` 中取最高已持有档；无任何 HEAT 升级时回退主武器 HE 弹（`he`）。dmg/pen 按 `computeAmmoConfig(t, 该弹种)` 计算并叠加卡牌加成，`resolveHit` 按该弹种机制（串联破甲/未击穿残余等）结算。

### 4.4 #A19 坦克碰撞回归修复
- 根因：`resolveTankCollisions`（`js/tank_entity.js`）的 MTV 候选轴存在同方向重复向量污染 tie-break 集合，且 `depth<=0.05` 跳过阈值把擦碰浅穿透全部放行 → 交叉场景残留 ~18.72px 深叠、推挤分支退化。
- 修复：候选轴按方向去重（保留首个）+ 阈值降为 `depth<=1e-6`。全部 21 项碰撞检查通过，未触碰任何手感常数。

### 4.5 测试基线
- 新增 `scripts/test-rework-r3.js`（APFSDS 双模块/HEC 越障/2σ 散布行为断言）与 `scripts/test-browser-r3.cjs`（Edge headless `channel=msedge` 冒烟：测试台按钮/5·6 弹种键/mvp Home 态，8 项全 PASS）。
- **原「已知遗留」已清零（2026-09-13）**：`test-nodegen.js` 16 项失败经 #A11 路网专轮修复（详见 §4.6）；另修复三处**过期测试断言**（代码已按用户裁定变更而测试未同步）——`test-modifiers.js` #61 brake 系数改引 `RULES.speed.brakeFactor`（2.2，非写死 3.5）、`test-economy.js` RUN_SHOP_DEFS 13 项/装甲包 growth 1.55+重量项/steady_mount 兜底 99/装甲无上限、`test-extreme-model.js` accel 基准改引 `RULES.speed.accelPowerToPxScale`（15，非写死 130）。

### 4.6 #A11 地图级路网与地形占位重构（2026-09-13 专轮落地）
- **先路后物**：`generateNode` Phase 0 调 `placeRoadNetwork` 生成主干道/分支，后续模板物件、村落、树林、地形统一避让路网骨架。**注（#B7，2026-09-16）**：路网自身不再为模板 `full` 建筑逐段跳段（该跳段是「道路被截断」的根因），详见 §4.18。
- **密度与优先级**：分支概率 `0.35`（旧 0.6 导致路网爆炸）；路宽恒 `60~80` 世界 px；路段 OBB 经 SAT 与模板 `full` 占位盒求交命中即弃——**全高骨架优先于路**且 `full` 不被路剔除；植被层不参与避让（路压植被属预期）。
- **村落单一路网**：`placeVillage` 存在网络道路时不再自铺街道，核心建筑沿网络路段贴边锚定，消除「村庄自铺街道 + 全局路网」双轨；仅无网络道路时降级自铺。
- **水潭与出生走廊**：`placeCentralPond` 相位网格 9×9（±0.30 模板边长）、忽略 `road` 层、全失败取最小重叠点回退并移出出生走廊；建筑/杂物/水潭统一避让出生点通道（半宽 ±20% × 半高 ±9%），消除「随机杂物围死出生点」。
- **度量口径修正**：`nodeLayoutMetrics` BFS 种子改为「距起点最近的自由网格点」（消除「起点自由但最近网格被盖」的假 0 连通）；校准测试显式传绝对出生坐标。
- **校准与回放重锚**：7 模板×5 难度×8 seed 校准 BASE 重锚，连通性全线 `1.000`（开阔地板 0.85 / 密林 0.35 富余、覆盖非降成立）；五节点回放 hash 重锚 `d60b9022`。
- **验证**：`npm run check` / `npm test`（36 文件全绿）/ `npm run test:browser` 三链全绿。结论同步 `docs/specs/map.md` §6。

### 4.7 #A20 HUD 静态按钮内联 onclick 失效修复
- 根因：`tank_mvp.html` 主脚本整体包在 IIFE 内，HUD 8 个静态按钮仍用 HTML 内联 `onclick` 引用 IIFE 闭包函数（未挂 `window`），鼠标点击必然 `ReferenceError`；键盘路径在 IIFE 内直接调用故掩盖了该失效。
- 修复：8 按钮移除内联 `onclick`，改 IIFE 内 `addEventListener` 绑定（语义与旧一致，`btnH` 保持 `tryShield(true)` 全向）。
- 验证：`scripts/test-browser-run.cjs` 17 项全 PASS（含 btnG/H/V 点击不抛错 + 全程零 page error），本轮再次回归复验通过。

### 4.8 核心运行时缺陷修复 (#B1~#B5 与 #78)
- **#B1 节点提前结算**：修复 `tank_mvp.html` 中 `livingNodeEnemies().length === 0` 导致低难度且击杀配额未满时提前清算的问题，仅在 quota 达成或非增援节点时允许清算。
- **#B2 结算缓冲伤害保护**：在 3 秒结算缓冲（`isClearing`）期间门控 `stepShells` 炮弹推进与实体 DOT 扣血循环，并在 `finishNode` 中清空残留炮弹与特效，避免缓冲期玩家暴毙。
- **#B3 商店血量与动力上限封顶移除**：调整 `tank_rules.js` 的 `parameterLimits.maxHp.max` 与 `enginePower.max` 为 9999，使局内商店无上限升级正常运作。
- **#B4 速度封顶死代码与敌军聚簇生成**：移除 `applyDifficultyMults` 中 `!playerAnchorStats` 导致封顶失效的守卫，使速度限制与差量计算始终生效；`tank_map.js` 接入 `RULES.nodeMap.enemyCluster*` 聚簇生成。
- **#B5 TAB 面板重量与实时装载状态**：重构 `updateStatusPanel` 与 `buildTankDataVM`，支持 live armor、实时重量展示及根据 `ammoLoadout`/`ammoKey` 过滤与高亮当前弹种。
- **#78 设计器不规则掩体多边形顶点 UI 闭环**：`tank_designer.html` 完整实现掩体多边形模式（`modeCover`），支持画布加点/拖拽/删点与多边形 JSON 导出。

### 4.9 卡牌三板块 + 开局弹种/副炮塔落地（2026-09-13 会话，PLAN 阶段四/六）
- **阶段四 4a 基础数值卡批次**：血量/装甲/射速/精度/马力五线梯度卡按 `docs/specs/cards.md` §8.2 表生成（`cards/hull_hp_boost_*` / `hull_armor_front_*` / `hull_armor_all_3` / `reload_speed_*` / `aim_speed_*` / `engine_power_*`，common→legendary 梯度），全部走 modifier 通道（addModifier scope='run'）；`npm run check` + `audit-content` 稀有度分布回归绿。
- **阶段四 4b 机制卡批次**：新效果类型 `weapon`（`{slot, type, statOverrides}`）落地 `js/tank_cards.js` validateCard/applyCardEffects + `js/tank_weapons.js` `WEAPON_SECONDARY_TYPES`（mortar/missile/rocket/mine_layer/turret）；生成 4 张 epic 副武器安装卡（`weapon_secondary_*`）；接线点验证通过。
- **阶段四 4c 技能卡批次**：`js/tank_strike.js` `callStrike` 支持 `shape:'point'|'carpet'` 落点形状（point=±4px 抖动 / carpet=240×80 沿炮塔朝向带状 / circle=原半径散布）；新能力键 `deploy_cover` 接入 `js/tank_abilities.js` 运行时键白名单 + `RULES.abilities.deploy_cover`（hp 200 / shieldHp 150 / duration 30 / cd 20）经 `_spawnDeployableCover` 惰性依赖调用 `js/tank_deployables.js`；`weapon`/`deploy_cover` 均已进 CARD_EFFECT_TYPES/ABILITY_KEYS 校验。
- **阶段六 6.1 开局弹种与切弹键位改造**：`tank_economy.js` `defaultProfile().ammoLoadout = ['ap','he']`（开局仅 AP/HE）；`tank_mvp.html` 摘除 1/2/3 数字键切弹（`setAmmoSlot` 键盘路径删除，HUD 槽位点击保留），改为技能快捷键池（1→smoke / 2→deploy_cover / 3→recon），Q/E `cycleAmmo(±1)` 环形循环保留（**2026-09-14 反向定案：E=下一发 / Q=上一发，见 §4.12**）；`renderAmmoIndicator` cell key 标注改 Q/E 方向提示（★ 为当前激活）。浏览器冒烟 `scripts/test-browser-smoke.cjs` 与 `test-browser-run.cjs` 已改为 Q/E 语义断言并全 PASS。
- **阶段六 6.2 副炮塔（secondary turret）**：`js/tank_weapons.js` `WEAPON_DEFAULTS.secondary.turret`（reload ×1.6 / dmg ×0.6 / pen ×0.75 / spread ×1.3 / range 400 / turretTurnRate 2.5）；新增 `updateSecondaryTurret(t, dt, ctx)` 自主索敌开火循环（独立 `secondaryTurretAngle`/`secondaryReloadT`，复用 `nearestEnemyTo` + shells 管线，不占主炮 reloadT），`tank_mvp.html` AI 循环对 turret 型副武器实体逐帧驱动；`tank_weapons.js` 现已在 `tank_mvp.html` 页加载（tank_cards 之前）；Node 断言 `scripts/test-rework-r3.js` §5 全 PASS。玩家侧挂载 UI 留待后续批。
- **阶段六 6.3 开局弹种待办**：`profile.unlockedAmmo` 解锁进度持久化（默认 `['ap','he']`；链上升级卡经 `applyCardEffects` 写入 `tank.unlockedAmmo`，`pickCard` 对比快照回写 `profile.unlockedAmmo` 并 `saveActiveProfile` 落盘跨局保留）；Loadout 界面未解锁弹种置灰禁用（`.ammo-row.locked` + 🔒 标注）；`tank_screens.js` `buildLoadoutViewModel` 每行带 `locked` 标志。
- **验证**：`npm run check` / `npm test`（173 economy + cards + ammo-balance 等全绿）/ `npm run test:browser` 三链全绿；audit-content 仅剩一条 pre-existing epic-vs-legendary 软警告（mobile_overdrive 0.65 > legendary 中位 0.50，非本轮内容所致）。

### 4.18 炮塔跨节点前移根治 / 路网重做（#B6·#B7，2026-09-16 会话，用户反馈，已完成）

> 用户反馈三条：① 随节点推进坦克炮塔逐渐前移 ② 主动技能升级卡在持有技能前就提供 ③ 道路被其他物体截断、尽头是圆弧、交叉口太多且看起来叠加。②见 §4.17（#A28）。①③结论如下。

- **#B6 炮塔跨节点逐渐前移（两个独立来源，全部处理）**：
  - **真 bug（已定向复现）**：`js/tank_boss.js` `makeBossEntity` 几何缩放对 `t.turretPivotOffset` / `t.anchors[k]` **原地** `*= s`，而 `js/tank_model.js` `applyTankConfig`/`applyEnemyAppearanceAndStats` 让它们**直接引用共享的 `spec.turret.pivot`**（`tankListData` 缓存常驻）。于是每个 Boss 节点把出厂 pivot 写回配置并再 ×scale（scale=2）：node4→dx 14、node9→dx 28、node14→dx 56，之后**同型敌军与玩家自己的坦克**都披挂这个被污染的 pivot（`anchors` 同步被 ×2 污染）。复现：`spec.pivot.dx 7 → 56`、`anchors.hull_front.dx 32 → 256`。**修复**：`tank_model.js` 两处改为**拷贝**（`{dx, dy}` 深拷贝 pivot；`anchors` 逐键深拷贝而非 `Object.assign` 一层浅拷贝——浅拷贝下嵌套 `{dx,dy}` 仍共享引用）；`tank_boss.js` 缩放改为**整体替换新对象**，绝不原地写。
  - **有意特性（按用户裁定删除）**：`RULES.progress.turretDrift`（2026-09-15 W3「节点推进炮塔前移」渐进改装观感）整体移除——删除 `RULES.progress` 配置块、`tank_map.js` `turretDriftShift`/`applyProgressTurretDrift` 及其在 `materializeNode` 的调用与导出、`tank_mvp.html` Boss/summons 两处调用点、`scripts/test-rework-w3.js`（并从 `npm test` 链与 `package.json` 摘除）。炮塔位置自此**恒定不随节点变化**。
  - **回归**：`scripts/test-boss.js` §16（#B6）断言 Boss scale 后共享 spec 的 pivot/anchors 未被改写、Boss 实例自身仍正确缩放（14/64）、后续玩家实体加载到出厂 pivot 7、「连续 3 个 Boss 节点后实例仍 14、配置仍 7」无雪球。规范见 `docs/specs/map.md`（§11 已随特性删除）。
- **#B7 路网重做（`placeRoadNetwork`）**：三条反馈对应三个独立根因，逐一处理。
  - **① 被其他物体截断**：旧实现对模板 `full` 建筑（`avoidBoxes`）**逐链段跳段**（`obbSegmentHitsAvoid` 命中即弃该段），实测留下 202~246px 的缺口（≈建筑尺寸），正是「路被截断」的根因。道路属 `ground` 层、先于一切元素绘制，建筑/岩石天然盖在路面之上，跳段纯属有害。**修复**：取消跳段——`isSegOk` 只保留界内判定（`avoidBoxes` 参数保留仅为兼容调用签名）。实测链内最大接驳间距 202–246px → **0.00px**；全高建筑中心压在路面上的比例仅 4.9%（渲染顺序处理，属预期）。
  - **② 尽头是圆弧形**：旧实现端点内缩 `0.5*roadW + 12`px，配合渲染层 `lineCap:'round'` → 完整圆弧端帽整个可见。**修复**：端点**严格落在节点边界线上**（横/纵干道沿轴偏移比例 ±0.13），端帽被节点画布裁掉一半 = 道路延伸出画面；渲染层 `bakeNodeGroundLayer` 的 `lineCap` 改为 `'butt'`（保留 `lineJoin:'round'` 平滑转折）。实测「非出界且非 T 形接驳的孤悬路头」0 个。
  - **③ 交叉口太多、道路像叠加**：旧实现端点偏移达 ±0.42×半幅、控制点横向偏移 ±0.18×跨度，导致纵向「干道」斜成 139°+、与横向干道以 **35° 浅角**互穿；再叠加 2~3 条主干 + 35% 斜向分支 → 组间交叉 2~4 处。浅角互穿即用户描述的「看起来叠加在一起」。**修复**：拓扑收敛为「**1 条横干道 + 0~1 条纵干道**」（`wide = halfW >= halfH` 决定主轴），干道端点偏移 ±0.42→**±0.13**、控制点横向偏移 ±0.18→**±0.04**×跨度；**取消斜向支线**（支线沿干道法向引出即与另一轴干道平行 → 平行道路 = 叠加观感 + 地图内死头）。实测组间交叉恒 **≤1 个**、交叉夹角 35.0° → **68.8°**（接近直角）。
  - **回归**：`scripts/test-nodegen.js` §16（#B7）四条护栏——链内无断口（<1e-6）、无孤悬路头（必须出界或 T 形接驳）、交叉口 ≤1、交叉夹角 ≥60°；共 7 模板 × 8 seed。`scripts/test-nodegen-calibration.js` **#B7 重锚**（路网更完整、不再切割布局 → 全模板连通性升至 **1.000**，`forest_dense` 原 0.875 的个别 seed 一并消除；`minPassageWidth` 随道路不再被跳段打断整体上移，corridor 2.9→4.8、woodland 2.6→5.0 量级；`coverCoverage` 基本不变，道路不计入）。规范见 `docs/specs/map.md` §10。

### 4.17 主动技能 upgrade 卡持有资格闭环（#A28，2026-09-16 会话，已完成）

> 关闭 ISSUES #A28；`scripts/test-cards.js` / `validate-content.js` / `test-qa.js` / `test-card-effects.js` / `node --check` 五链全绿。

- **症状**：`cardEligible` 早已实现 `requiresAbility` 语义，但 `cards/*.json` 中 **16 个 ability 效果无一声明该字段** → 所有「主动技能升级卡」在玩家尚未持有对应基础能力时即可被抽到（`params` 覆写无处生效，构筑语义错乱）。
- **定案**：不给 ability 加 `action`（其 install/upgrade 语义与 weapon 不同：ability 的升级 = **同一 key 的 `params` 覆写**，`computeAbilityConfig` 按 key 聚合）。**复用既有 `requiresAbility` 可选字段**，值恒等于自身 `key`；由既有 `cardEligible` 消费。
- **content 侧（5 张升级卡标记）**：`ability_artillery_barrage` / `ability_artillery_heavy` / `ability_artillery_strike_point` / `ability_artillery_strike_carpet`（key `artillery`）与 `ability_deploy_cover_fortified`（key `deploy_cover`）各加 `"requiresAbility": "<自身 key>"`。
- **schema 侧**：`validateCardEffect` 的 `case 'ability'` 新增 `requiresAbility` 显式校验（**必须是 `ABILITY_KEYS` 内的字符串**，缺省合法）——拼写错误（如 `artilery`）会让资格过滤静默失效并把升级卡发给未持有者，必须由 `validate-content.js` 守门拦下。
- **基础/安装卡不得标记（死锁防线）**：`artillery_strike` / `tactical_shield` / `super_reload` / `ability_deploy_cover` / `mobile_track_repair` / `support_track_repair` / `emergency_track` / `support_recon` / `sniper_recon_mark` / `repair_kit` / `support_extinguisher` 共 11 张保持零声明。`test-cards.js` 新增**通用不变量**：每个出现过的 ability key 至少有一张未标记卡作为获取途径。`repair`/`extinguish` 属 `ABILITY_KEYS_INNATE`（开局自带、绕过持有检查），其卡保持可抽不受影响。
- **语义闭环（已确认）**：`applyCardEffects` 的**非 modifier 分支** `Object.assign({}, ef, {cardId})` 保留 `ef.key` → 玩家抽到基础卡后该 key 落入 `player.cardEffects`；mvp `drawRewardCards` 由此组装 `owned.abilities` → 同 key 升级卡转为合格。`test-cards.js` 以真实卡文件端到端断言该闭环（前不合格 → apply 基础卡 → 后合格）。
- **保底路径（已确认）**：资格过滤在 small-pool early-return 与保底**之前**执行（`usable.filter(cardEligible)` → 再 `firstIdxWhere`），保底只在已过滤的 `usable` 上取卡，**不会复活已剔除的升级卡**；池内只剩升级卡时保底宁缺毋滥、不崩溃。200 种子 × 3 池回归锁定。
- **实测发现（正确行为，非 bug）**：**传奇池的 2 张 ability 卡（point / carpet）全为升级卡** → 未持有 `artillery` 的玩家在「Boss 追加轮」的传奇档位池中抽不到任何能力卡。这是正确结果：传奇档位本就不存在 artillery 基础卡，获取途径在 common/rare/epic 池。
- **顺手修复的真实管道缺陷**：`tools/content_designer.html` 的 `__collect` 原将 ability 效果序列化为 `{type,key}`——**经该编辑器保存能力卡会静默丢失 `params` 与 `requiresAbility`**（丢 `requiresAbility` 会直接把本 bug 重新引回来）。现已补全 `key`/`requiresAbility`/`params(JSON)` 三字段的可视化编辑与完整往返（params JSON 非法时保留原文交由 `validateCardEffect` 报错，不静默写坏数据）。
- **新增测试**：`scripts/test-cards.js` 追加 `#A28` 段 40+ 断言（schema 三态 / 5 张升级卡分类 / 11 张基础卡零声明 / requiresAbility≡key 不变量 / 无死锁不变量 / `cardEligible` 两态翻转 / apply 闭环 / 3 池 × 200 种子零泄漏且基础卡仍可抽 / 传奇池现状 / 持有后升级卡进入候选 / 保底单张且无标记 / 只剩升级卡的极端池不复活）。

### 4.16 输入分发 / 卡牌资格与单槽 / 面板分层 / 副炮塔挂载与升级卡复核（2026-09-15/16 会话，已完成）

> 本轮回合关闭 ISSUES #A21~#A25 并推进 PLAN 阶段八 §8.1.1/§8.1.2；`npm test`（新增 2 脚本）/ `tsc --noEmit` / `npm run test:browser`（三脚本，Edge 全访问）三链全绿。

- **#A21 F 切换 + 左键/空格按激活槽位分发（已完成）**：`js/tank_fire.js` 新增 `tryFireWeaponSlot(ctx, salvo)`——`player.activeWeaponSlot==='secondary'` 时经 `fireActiveSecondary(player, ctx, mouseWorld)` 手动击发（目标=光标世界点，缺省回退炮塔前方 +100px）；`primary` 委托既有 `tryFire(ctx, salvo)`（保留 W4 单发/齐射语义）；副武器 `none`/未装回退主炮；**turret 型为设计例外**（自瞄副炮塔不响应点击，由主循环 `updateSecondaryWeapon` 逐帧驱动）。`tank_mvp.html` 左键 mousedown 与空格（`input.isDown('fire')`）改调 `tryFireWeaponSlot`；`tank_bindings.js` `ACTION_INFO` 文案同步（fire=按激活槽位、switchWeapon=手动击发）。**玩家副武器不再「F 激活即自动运作」**。
- **#A22 副武器单槽不变量（已完成）**：`js/tank_cards.js` `applyCardEffects` weapon 分支删除 `secondarySlots`/`activeSecondaryIndex` 双槽路径，统一写单一 `weapons.secondary`——`install` 仅空槽写入（含 `getWeaponDefaults` 默认值合并），槽已占则 no-op（effect 仍入 cardEffects）；`upgrade` 仅同类型时合并 `statOverrides`；primary 的 `install` 换装 / `upgrade` 同型合并。`scripts/test-rework-r3.js` §7 双槽构造改写为单槽多类型手动击发。
- **#A23 武器/能力资格过滤 + install/upgrade 元数据 + maxStacks 防线（已完成）**：
  - `validateCardEffect` 的 `case 'weapon'` 新增 **`action` 必填校验**（`install`|`upgrade`）；14 张 weapon 卡全部补齐 `action`（7 install / 7 upgrade）。
  - 新增 **`cardEligible(card, owned)`**（导出）：weapon install(primary)=未持有该型；install(secondary)=槽空；upgrade=已持有同型；`requiresAbility` 可选；`owned.cards` 提供时按 `maxStacks` 抽卡期截断。**资格过滤在小池 early-return 与保底之前执行**（修复小池/Boss 轮/刷新绕过资格的旧病）。
  - `owned` 契约扩展 `primaryWeapon` + `cards`；`tank_mvp.html` `drawRewardCards` 传入主武器类型与已拥卡计数，普通轮与 Boss 追加轮复用同一规则。
  - **apply 层 maxStacks 最终防线**：`applyCardEffects` 顶部按**应用次数** `tank._cardApplyCount[cardId]` 拒绝第 `maxStacks+1` 次（**ammo 弹种升级卡豁免**——其链逻辑本身幂等且测试依赖「首次 no-op → 再次真正替换」）；`tank_model.js` `removeRunModifiers` 同步清零计数防跨局残留。
- **#A24 面板模块四层分层（已完成）**：新增 `js/tank_panels_core.js`（层 1 纯核心：`enemyLevelMults`/`buildTankDataVM`/`heldCardsVM`/`spawnEnemyAt`/`applyCardToTank`/`clearCardsFromTank` + **卡牌事务 `snapshotCardTx`/`applyCardTx`/`rollbackCardTx`**（receipt 覆盖 modifiers/cardEffects/weapons/ammo/`_cardApplyCount`）+ **`parameterClamp`/`clampParameterMap`**（`RULES.parameterLimits` 唯一收口，支持 `armor.*` 3 段路径））与 `js/tank_panels_dom.js`（层 2 DOM 适配：`makeLogSink`/`createLogPanel`/`createDevPanelController`）；`js/tank_panels.js` 变门面 re-export（消费方 API 不变）。`clearCardsFromTank` 现同步回退卡牌造成的武器安装与弹药解锁副作用（Bench「Clear all」= 完整取消）。两页 `<script>` 顺序补 core→dom→facade。
- **#A25 独立日志面板（已完成）**：MVP `#devLog` 从 `#devPanel` 内迁出为独立左下角 `#logPanel`（CSS `position:absolute; left/bottom:12px`）；`createLogPanel(root,{list})` 提供 `push/clear/open/close/toggle` + `hiddenClass` 生命周期；`showPanelGroup('status'|'dev'|'none')` 统一 Tab 状态面板与「开发者面板+日志面板」组的**互斥呼入/呼出**（关闭开发者面板不再丢失日志）。Bench `#logOverlay` 复用同一模块。
- **PLAN §8.1.2 玩家侧副炮塔挂载 UI（已完成）**：`tank_battledraw.js` 新增 `secondaryTurretPose(t)`（纯位姿：车体尾后 `hullLen×0.28`、炮管长 `hullWid×0.55`、角读独立 `secondaryTurretAngle`）与 `drawSecondaryTurret(ctx,t)`（底座阴影+座圈+独立转向炮管，`ammoBlew` 后不绘），`drawTank` 于主炮塔之前绘制；HUD `stWeapon` 行已含副武器型号与「副炮塔自主」提示（阶段七 7.4 已落地）。
- **PLAN §8.1.1 副武器 rare 升级卡数值复核（已完成）**：按「基础→升级」持续输出（DPS）复核 4 张升级卡——mortar（reload 6.5→**6**）1.333×、missile 1.524×、rocket（count 6→**5**、reload 8→**9**）1.389×、mine 1.500×，增益带收敛至 `[1.25,1.60]`、极差 0.19（消除 rocket 1.88× 离群与 mortar 1.23× 偏弱）。新增 `scripts/test-weapon-upgrade-balance.js` 锁定梯度并入 `npm test`。
- **新增测试**：`scripts/test-weapon-keypress.js`（**按键链路端到端**：经 `createInputController` 真实 keydown/keyup，F 切槽 + 空格击发覆盖 standard/double_barrel/autocannon/railgun + mortar/missile/rocket/mine_layer/missile_wire/turret 及空槽回退/turret 例外/F 仅切槽不改数据）；`test-fire.js` §9 补 9h~9k（autocannon/railgun/rocket/missile_wire）；`test-panels.js` 补 #A24 事务/钳制 15 断言 + #A25 日志面板 7 断言；`test-rework-r3.js` §5b 补副炮塔位姿 5 断言。

### 4.15 主武器系统改版五项（2026-09-15 会话，用户裁定，已完成；含 W6 机炮热量重做）

- **W1 主武器曲射机制移除（已完成）**：`WEAPON_DEFAULTS.primary.howitzer` 删除、`RULES.weaponTypes.primary` 与 `js/tank_cards.js` `WEAPON_PRIMARY_TYPES` 白名单剔除 `howitzer`、`cards/weapon_primary_howitzer.json` 删除文件；`tank_fire.js` `firePrimaryShell` 的 isArc 落点块（totalDist/targetX/targetY）删除——**主炮一律平射直线弹道**，`stepShells` 的 isArc 落点分支保留仅供副武器迫击炮弹（自带 totalDist）。曲射/越障能力自此由**副武器迫击炮**唯一承担。测试：`test-fire.js` §7e 改写为反向断言（无 isArc/totalDist/targetX、白名单无 howitzer）、`test-rework-r3.js` §2 改写、`test-rework-r1.js` 钩子测试改用 railgun。设计器 `shorthowitzer` 为炮管几何造型预设（与弹道机制无关）保留。
- **W2 删除烟幕弹 + F 键主/副武器切换 + 导弹锁定（已完成）**：烟幕弹整链移除——`tank_fire.js` 删 `fireSmokeShell`/`tryFireSmoke`/stepShells smoke 分支与 tracer guard、`tank_mvp.html` 摘 supportSmoke 键位/tryFireSmoke 调用/fireCtx 引用、`tank_bench.html` 同步；烟幕卡 `smoke_screen`/`ability_smoke_dense` 删除（卡池 172→169）、`ABILITY_KEYS` 剔除 `smoke`；`tank_cover.js` smokeClouds 基础设施保留备用（无生产者）。**F 键 = 切换主/副武器**：`tank_bindings.js` `switchWeapon:'f'`（替代 supportSmoke），mvp `toggleWeaponSlot` 切换 `player.activeWeaponSlot 'primary'|'secondary'`（新局 prepPlayerForRun 复位主炮）；副武器激活后经 `updateSecondaryWeapon` 自动运作（玩家不可手动击发，右键入口删除、`switchSecondaryWeapon` 双副槽循环删除）；切回主炮锁定冻结清除、装填继续。**锁定式导弹**：`updateSecondaryMount` 对 missile 走 `updateMissileLock`（±30° 扇形/射程内最近目标 → 1.0s 锁定 → 自动发射制导弹；目标死亡/出扇形/出射程重选；参数 `WEAPON_DEFAULTS.secondary.missile.lockArcDeg=30/lockSeconds=1.0`）；mvp 新增 `drawMissileLock`（四角括号+进度弧+剩余秒数）与主循环激活分支。测试：`test-fire.js` 烟幕断言改反向、`test-bindings.js` switchWeapon 断言、`test-cards.js` smoke 白名单反向、`test-rework-r3.js` §6 导弹锁定流程改写（ctx 补 entities/isHostile 注入）。
- **W4 双管并排双炮管机制重做（已完成）**：`WEAPON_DEFAULTS.double_barrel` 改为 reloadMult ×1.0/管 + count 2 + `switchSeconds 0.5` + `barrelOffset 0.9`（stagger 字段删除）。**状态机**：`tank_fire.js` 新增 `ensureDbState`/`updatePrimaryBarrels`（`t._dbState{count,ready[],reloadT[]}` 每管独立装填，主循环 player+AI 逐帧驱动）与 `fireDoubleBarrel`——装填 ×1.0 应用单管；单击（左键）发射 1 根已装填管（管口沿炮塔横向 ±`barrelWid×0.45` 偏移，`firePrimaryShell` 新增 lateralOffsetPx 参数，弹道起点+炮口闪光同步偏移）；空格齐射（`tryFire(ctx, salvo=true)` → 发射全部就绪管）；任一击发后 `shooter.reloadT=switchSeconds(0.5s)` 作全局换管门控；旧 stagger/count `_primaryBurst` 连发路径对 double_barrel 删除（autocannon burst 后随 W6 删除，见 §4.15 W6）。**渲染**：`tank_battledraw.js` 炮管段按 `_tubeOffsets=[-off,+off]` 并排绘制 2 管（与弹道偏移同源）。**卡牌**：`weapon_primary_double_barrel`（desc/overrides 改 switchSeconds 0.5）、`weapon_primary_sync_fire`（stagger 0.02→switchSeconds 0.1）、`weapon_primary_alt_reload`（reload ×1.1→reloadMult ×0.8 单管）；applyCardEffects 换装时清 `t._dbState`。测试 `test-fire.js` §7b 全改写（单管击发/换管门控/双管齐射/偏移起点/无 stagger 残留 7 组断言）。
- **W3 节点推进炮塔前移（已删除，2026-09-16 用户裁定）**：本项曾实现「随节点索引线性前移敌军/Boss 炮塔 pivot」的渐进改装观感，因**用户反馈炮塔随节点推进逐渐前移是缺陷而非观感**，已整体移除（`RULES.progress` 配置块 + `tank_map.js` `turretDriftShift`/`applyProgressTurretDrift` + mvp Boss/summons 调用点 + `scripts/test-rework-w3.js` 全部删除，`package.json` test 链摘除）。炮塔位置自此恒定不随节点变化；相关的**共享 spec 污染真 bug**（Boss scale 原地改写 `tankListData` 缓存）一并修复，详见 §4.18 #B6。
- **W5 卡牌通道运行时参数硬限（已完成）**：`tank_model.js` 新增 `applyParameterLimits(s, modifiers)`，`computeStats` 聚合尾部调用——**仅当 modifiers 非空**（卡牌奖励/局内升级/难度系数通道）钳制两张用户明确裁定硬限：装填 reload ≥ `parameterLimits.reload.min`（0.5s/发，卡牌加速装填不得突破下限）、极速 maxSpeed ≤ `parameterLimits.maxSpeed.max`（150km/h=375px/s，卡牌不得超速）；空 modifiers（出厂 base/extreme 纯计算基准）不钳，纯数学语义保留。依据 §4.13 既有 `RULES.parameterLimits` + `runShopLimitBlocked`（仅商店路径）——本次补齐卡牌 modifiers 通道。火控系既有钳制不重复（spreadMult/motionSpreadMul floor + crit [0,critBonusCap]）。消费链：`applyCardEffects`→`addModifier`→`refreshStats`→`computeStats` 天然接入。测试：新增 `scripts/test-rework-w5.js`（下限/上限/空修饰器不钳/温和修饰不误钳/移除回落 5 组断言）并入 npm test 链；`test-extreme-model.js` 两处 maxSpeed 极值断言按新语义更新（add +1e9 与 (base+100)×2 均钳至 375——这正是 W5 裁定行为）。
- **W6 速射机炮热量机制重做（已完成，2026-09-15 用户裁定）**：`WEAPON_DEFAULTS.primary.autocannon` 重定参——伤害=标准 1/5（damageMult 0.2）、穿深=标准 85%（penMult 0.85，弹种系数机制不变）、射击间隔=装填时间×0.25（reloadMult 0.25，burst 连发路径整体删除）；**热量机制**：每发 +`heatPerShot` 10%（fireTank 累积）、每秒冷却 `coolPerSec` 15%（新增 `updatePrimaryHeat(t, dt)`，mvp player/AI 主循环 + sim 循环 + bench 同源驱动）、≥`heatMax` 100% 过热并锁定 `overheatLock` 2s（fireTank 顶部门控 `heatLockT>0` 禁射；锁定期间冷却继续，结束后热量 70% 可续射）；**UI**：玩家装填环 `drawReloadRing` 对 autocannon 改热量表——绿 <50% / 黄 50–<100% / 红 ≥100%（锁定红色闪烁），位置仍为炮管旁原装填环；**外观**：炮管更细（barrelWidthMult 0.6）略短（barrelLenMult 0.8，弹道起点/炮口特效按同源回缩防悬空）、不绘护套/制退器/抽烟器（battledraw 强制 muzzle/evac/jacket 禁用，mantlet 炮盾保留）、炮口闪光与弹体随 fxScale 0.55 缩小（shell.fxScale → drawShells）。**卡牌**：`weapon_primary_autocannon` desc/overrides 同步；`weapon_primary_burst_tune` 改语义「机炮散热强化」coolPerSec 15→22（id 不变保卡池 169）。测试：`test-fire.js` §7c 全改写（单发/无 burst/间隔×0.25/伤害 1/5/穿深 85%/fxScale/热量累积/过热锁定/冷却恢复/卡牌 coolPerSec 8 组）、§8 新增**按住左键持续开火回归**（2026-09-15 用户确认要求：任何主炮类型按住期间逐帧门控自然释放——dt=1/60 模拟 8s 按住链，标准 4 发/电磁炮 2 发/机炮 16 发且热量平衡不过热/双管 8 发两管并行交替）、`test-rework-r1.js` §1 默认参数断言更新；`updatePrimaryBurst` 函数与 exports 删除（残留 `_primaryBurst` 引用均为测试反向断言）；bench 左键补齐按住连发（`benchMouseFireHeld`，与 mvp #A7 同源语义）。

### 4.11 阶段七：技能/主/副武器卡牌体系闭环（PLAN 阶段七，2026-09-13 会话）
- **7.1 技能参数覆写通道与进阶卡**：`tank_cards.js` validateCardEffect 的 `case 'ability'` 支持可选 `params` 对象校验；`tank_abilities.js` 新增 `computeAbilityConfig(t, key)`（聚合 `RULES.abilities[key]` 基础 + 遍历 `cardEffects` 中同 key 的 `params` 覆写），`tryActivateAbility` 全分支改读聚合后的 `abilityCfg`（artillery 的 delay/radius/dmgMult/shellCount/shape/stagger/maxStrikes、deploy_cover 的 hp/shieldHp、shield/overdrive/super_* 参数覆写通道全部打通）。生成 6 张进阶卡：`ability_artillery_barrage`(rare shellCount5) / `ability_artillery_heavy`(epic radius140+dmgMult1.5) / `ability_artillery_strike_point`(legendary point 定点) / `ability_artillery_strike_carpet`(legendary carpet 地毯) / `ability_smoke_dense`(rare 浓缩烟幕) / `ability_deploy_cover_fortified`(epic 加固掩体)。Node 断言 `scripts/test-abilities.js` §17（覆写聚合 + 定点落弹 + deploy_cover 覆写）全 PASS。
- **7.2 副武器全类型运行时驱动与升级卡**：`tank_weapons.js` 新增 `updateSecondaryMount(t, dt, ctx)` 统一驱动 mortar（曲射 AOE，isArc+ignoreCover+splashRadius90）/ missile（制导 `guided:true` + `target` 引用，`stepShells` 新增引导转向）/ rocket（count 连发扇形散布）/ mine_layer（惰性 require `tank_deployables.spawnMine` 车尾布雷）；`updateSecondaryWeapon` 统一分发（turret 走旧 `updateSecondaryTurret`，其余走 mount）。`tank_mvp.html` 玩家主循环与 AI 循环均改调 `updateSecondaryWeapon`。生成 4 张副武器升级卡（`weapon_secondary_{mortar,missile,rocket,mine}_upgrade` rare）。Node 断言 `scripts/test-rework-r3.js` §6 全 PASS。
- **7.3 主武器机制落地与主武器卡牌**：`tank_fire.js` 重构——新增 `primaryWeaponSpec(shooter)`（读 `WEAPON_DEFAULTS.primary` + `weapons.primary.stats` 合并，Node 端 lazy require `tank_weapons.js`）、`firePrimaryShell`（统一发射：damageMult/penMult/shellSpeedMult 倍率 + howitzer isArc/splashRadius 标记）、`updatePrimaryBurst`（double_barrel/autocannon 连发次发驱动，独立 `_primaryBurst` 队列不占主炮 reloadT）；`fireTank` 改经 `primaryWeaponSpec` 装填倍率 + 发射 + 登记连发。`tank_mvp.html` 玩家/AI 循环接入 `updatePrimaryBurst`。`tank_cards.js` 新增 `WEAPON_PRIMARY_TYPES`/`ALL_WEAPON_TYPES` 白名单（主武器 weaponType 过校验），applyCardEffects 写 weapons 时失效 `_spec` 缓存。`tank_rules.js` weaponTypes.secondary 补 `turret`。生成 7 张主武器卡：`weapon_primary_{double_barrel,autocannon,railgun,howitzer}`(epic 换装) + `weapon_primary_{sync_fire,burst_tune}`(rare 机制) + `weapon_primary_alt_reload`(legendary 交替装填)。Node 断言 `scripts/test-fire.js` §7（标准单发/双管连发/机炮3连发/电磁炮倍率/榴弹曲射）全 PASS。
- **7.4 UI 与验证**：`tank_mvp.html` statusPanel 新增「武器」行（`stWeapon`，主/副武器型号中文标注）；`types/globals.d.ts` 补 `WEAPON_DEFAULTS`/`updateSecondaryWeapon`/`primaryWeaponSpec`/`firePrimaryShell`/`updatePrimaryBurst` 等全局声明。总卡数 162→173。`npm run check`（typecheck 0 错误）+ `npm test`（全绿）+ `validate-content.js`（173 张 schema/desc 一致）三链通过；浏览器链因沙箱 Edge EPERM 无法启动（环境限制，非代码回归，Node 链已覆盖全部改动模块）。

### 4.10 操作/设置/面板解耦（mvp ⇄ 测试台同源，2026-09-13）
- **共享键位层 `js/tank_bindings.js`**：`KEY_BINDINGS`/`ACTION_INFO` 是动作→键位唯一数据源；`createInputController` 统一 keydown/keyup 注册（e.key 小写规范化、preventDefault 门控、边沿动作路由、`isDown` 持续键、`driveArgs` 含倒车倒置透传、`altDriveArgs` 方向键第二驾驶位）；`gate(action)` 页面门控（mvp 局外菜单不登记战斗键、ESC 例外；未注册动作的键自然失效——两边能力差异 = 注册差异，非两套硬编码）。
- **设置同源**：mvp 走 `profile.settings`（沿用存档系统）；测试台用独立键 `rogue-tank-settings`（`loadSettings/saveSettings`，字段 `invertReverseTurn/showFps/benchPanelOpen`，损坏 JSON 回默认）。测试台 `driveTank` 此前缺失的 `invertTurnWhenReversing` 已补齐（玩家 WASD 与靶车方向键两驾驶位均透传）。
- **mvp 接线**：4 处内联 keydown/keyup 收敛至控制器（移动/开火轮询改 `input.isDown(...)`、`driveTank` 读 `driveArgs()`）；ESC 暂停面板键位说明改由 `describeBindings` 渲染；Q/E 切弹、1/2/3 技能池、Tab/`/F12 面板、ESC 暂停语义全部保持。
- **测试台对齐（用户裁定：切弹完全对齐 mvp）**：数字键 1~N 直选弹种摘除，改为 Q/E 环形循环 + 鼠标点击弹种格（`data-ammo`）；G=超级火控、V=超级速度（与面板按钮共用具名入口函数）；` 开关测试专用面板。
- **测试专用面板 `#benchPanel`**（右上角固定、` 键开合、开合状态持久化）：作弊开关（无敌常驻 / 秒装填 / 倒车转向倒置 / FPS 显示）、按钮（满血重置 / 清空卡牌 / 清场——靶车保留）、从 `describeBindings` 渲染的键位说明；`#benchFps` FPS 统计（500ms 窗口）。ID 独立，不触碰 `#statusPanel/#devPanel/#hintBar` 冒烟不变量。
- **测试基线**：新增 `scripts/test-bindings.js`（键位表完整性 / 门控拒绝不登记 / 边沿路由 / preventDefault / 双驾驶位与倒车透传 / 设置存储与损坏回默认 / 说明过滤，QA shim 合规）挂入 `npm test` 链；`test-browser-r3.cjs` 的 5/6 数字键切弹断言迁移为「点击弹种格 + Q 循环」等价验证（切弹语义对齐后）。

### 4.14 弹种缩写规范化 / 双副武器与右键击发 / 技能池1~3 / 道路平滑烘焙 / 商店与Boss结算修复（2026-09-14）

- **弹种英文缩写规范化**：`RULES.ammoTypes` 弹种标签全部统一为规范的英文军事缩写（`tandem_heat` → `T-HEAT`、`heavy_tandem_heat` → `HT-HEAT`、`proximity_he` → `HE-VT`、`blast_he` → `HE-OP`），HUD 面板与测试断言对齐。
- **双副武器与键位控制**：
  - 玩家最多可挂载 **2 个副武器槽位**（`player.weapons.secondarySlots`，`applyCardEffects` 动态维护），`F` 键（`switchSecondaryWeapon`）在两槽位间循环切换当前激活副武器。
  - **鼠标右键主动击发**：`canvas` 屏蔽默认右键菜单（`contextmenu`），按下右键直接调用 `fireActiveSecondary` / `tryFirePlayerSecondary` 主动向光标所在世界坐标击发当前副武器（迫击炮曲射、反坦克导弹制导、火箭巢连发、布雷器布雷等）；AI 与自动副炮塔依然保持自主索敌与自动开火。
- **主动技能快捷键池 1~3**：
  - 数字键 `1` / `2` / `3`（`skillHotkey`）按顺序优先动态映射玩家已装备的主动技能（烟幕/掩体/炮击/护盾/超装填/无人机指令等），缺失时回退默认技能池，实现 1~3 数字键完全接管主动技能释放。
- **道路平滑预烘焙（消除胶囊感）**：
  - 修复 `bakeNodeGroundLayer` 链段端点计算中因外扩 padding 导致的匹配失效问题；改用几何中线端点与自适应贪心串联算法，将同 `groupId` 的道路链段一次性重建为完整连续的平滑 Catmull-Rom 多段线；配合圆角连接与沥青路面、标线分层渲染，彻底消除原先“胶囊串联”的视觉瑕疵。
- **局内商店与 Boss 奖励修复**：
  - 修复 `runShopLimitBlocked` 在初次升级基础属性时（如 reload/spreadMult/motionSpreadMul）错误将等级数作为属性值而判定“已达下限”的 Bug，优先读取 `stats` 实际当前值。
  - 修复 Boss 战利品在批量 5 选 3 确认后 `advanceRewardFlow` 试图执行非法 `reward` → `reward` 状态自环的 Bug，单轮 5 选 3 确认后直接平滑推进至下一节点。
- **验证**：`npm run check`（语法与 TypeScript 0 错误）与 `npm test`（全套测试 174+ 项全部 PASS）。

### 4.13 七项用户定案批量落地（2026-09-14 会话：HEC 移除 / 局内商店回归 / 受击警觉 / 地图重做 / 水域溺毙 / 装备优先 / 新局归零）

- **HEC 弹种全面移除**（用户定案）：`RULES.ammoTypes` 删 `hec`（14 键）、`ammoChain` 删 `hec:'he'`、`scripts/tank_cards.js` `AMMO_KEYS` 同步、`cards/hec_curvature_shell.json` 删除文件。曲射/越障能力由**武器层**承担（榴弹炮 howitzer `isArc`、迫击炮 mortar 弹药 `ignoreCover:true`，见 `WEAPON_DEFAULTS`）；受影响测试改用 `ammo_upgrade_blast_he`（HE 系链上卡，`tank_mvp.html` 展示用）；**2026-09-15 修订**：HE 系链线性化 (`he→aphe→hesh→proximity_he→blast_he`)，blast_he 的直系前驱为 `proximity_he` 而非 `he`（详见 `docs/PLAN.md` §5.1 / `docs/ISSUES.md#A26`）。
- **局内商店回归（升级基础参数）**：§4.12 的"退场"是中途态，本批按用户定案**重新落地**——结算（settlement）界面内嵌 `#runShopBox`：升级**基础参数**（12 商品：火力 5 + 机动 2 + 防护 2 + 杂项 3），`runShopLevels` 账本 + `runScoreSpent` 余额（本局得分−已花）。**硬上限**：极速 ≤150km/h（=375px/s）、装填 ≥0.5s/发，经 `RULES.parameterLimits` + `runShopLimitBlocked` 同源强制；**装甲合一**：`hull_armor_kit`+`turret_armor_kit` 合并为单 `armor_kit`（炮塔+车体六面各 +2mm + 重量 +0.5t，一个升级项）；`repair_kit_cd_run`/`medkit_cd_run` 的 cdReduce 记入 `player.runKitCdBonus`（`effectiveKitCd` 消费，下限 15s 不变）。效应走 run scope 修饰器（source `runshop:<id>`，新局 `removeRunModifiers` 清除）。
- **受击即警觉（任意来源）**：`applyDamage`（唯一伤害收口）内统一触发——敌对存活非无人机实体被**任意来源命中**（直射/溅射/炮击轰炸/DOT/地雷/碾压/溺毙）立即 `alertEntity`（`aiEngaged` 置位 + `lastKnownPlayerPos` 记来源方向）+ `propagateAlert` 600px 友邻告警；来源坐标缺省回退玩家当前位置（搜索玩家语义）。Boss 在 `hold` 阶段受击**立即解除 hold**（`stageAI=null` 转常规接战）。
- **地图内容重做（曲线路 + 预烘焙 + 重叠消解）**：`tank_nodegen.js` `placeRoadNetwork` 改 **Catmull-Rom 曲线平滑**（`_catmullRomSample` 步长 110px，控制点 1–2 个横向抖动中点）+ **35% 分支**（`bEndAng` 单次掷出，±0.7 弧度）；道路以**短 OBB 链段**写回（w=dist+roadW×0.35、h=roadW、`tier:'road'`）→ 进入地图前 **`bakeNodeGroundLayer`**（mvp 按 groupId 首尾相接 <8px 重建多段线画到 node 画布，道路整条预烘不再逐段实时渲染、不再因 aabbInView 轴对齐剔除而"段消失"）。**跨相重叠消解 `pruneOverlappingCovers`**：3×3 采样点（66% 范围）显著重叠（≥3/9 互入）→ **nudge 平移优先**（环形候选 6 环×8 向避开一切元素，保住地形标签数量契约）、无空位才移除；road 与同 groupId 豁免；优先级高者胜（岩石 > 建筑 > 水/泥 > 植被）。
- **水域行为重做**：`water`/`river` `passability 0→0.4`（与泥地同级：**减速通行、不再硬阻断推出**）；**完全浸入溺毙**——`tank_cover.js` `tankFullyInWater`（车体四角全在 water/river 多边形内）→ 主循环 `drownT` 累计 8 秒（`RULES.drowning`），倒计时 HUD 头顶显示 + 玩家警示音（`warnAt` 3s），OOT 沉没摧毁（玩家/敌人/Boss/友军一视同仁，结算缓冲期不累计）。**敌人也会溺毙** → AI 寻路加 `applyWaterAvoidance`（`tank_ai.js`）：前向探点 140px 入水 + 至少一侧干地 → 转向绕行；三向全湿 → 停驶防自杀；前路干地 → 零干扰。弹道仍越飞（`shellBlock:false` 不变）。
- **装备优先抽卡**（用户定案）：`drawCardChoices` 新增 `owned` 参数——玩家**没有任何主动技能**（`cardEffects` 无 ability）→ 候选保底含 1 张 ability 卡；**副武器为 none** → 保底含 1 张副武器安装卡；不足补足按稀有度权重抽样。修复静态下标在 splice 后错位的真实 bug（误把被动卡当武器卡抽出）。
- **开局弹种选择界面移除 + 新局从 0 开始**（用户定案）：Loadout 弹种选配区（`#loadAmmoList` + `profile.ammoLoadout` 勾选 UI）**移除**；`prepPlayerForRun` 新局强制复位——`player.cardEffects=[]`（卡牌升级不跨局）、`weapons` 回落 spec 缺省（卡牌安装的武器不跨局）、`ammoLoadout/unlockedAmmo=['ap','he']`（弹种解锁进度不跨局）、`runShopLevels={}` + `runKitCdBonus` 归零、`clearDrones`。`pickCard` 不再回写 `profile.unlockedAmmo`（弹种解锁仅本局）。
- **验证**：`npm run check` / `npm test`（40 脚本全绿，含新断言：`test-covers` §38b tankFullyInWater、`test-ai` Boss hold 破防 + applyWaterAvoidance 三分支、`test-cards` 装备优先四态、`test-nodegen` 校准重锚） / `npm run test:browser`（三脚本全 PASS：测试台 14 弹种居中、mvp loadout 弹药区移除、blast_he 演变替 hec）。

### 4.12 局内商店退场收尾 + 卡牌选择定案 + 键位反向/敌军血量修订（2026-09-14 会话）

> **注（2026-09-14 同日后续定案）**：本节"局内商店完整退场"为中途态——用户随后定案商店**回归**（升级基础参数），详见上方 §4.13「局内商店回归」。下文中"退场"描述仅指 2026-09-08 遗留残余的第一波清理，最终态以 §4.13 为准。

- **局内商店完整退场**（2026-09-08 重构遗留的最后一波残余清理）：`tank_mvp.html` 摘除全部 runShop JS——`runShopBalance` / `resetRunShopState` / `applyRunShopEffects` / `runShopPreviewText` / `_statPathVal` / `_fmtStat` / `RUN_SHOP_GROUPS` / `renderRunShopPanel` / `toggleRunShop` / `buyRunShopItem`、`settleShopBtn`/`rewardShopBtn` 监听与 settle 分支显隐引用、`watchFlow` 收起调用、`runShopLevels`/`player.runShopCdBonus` 账本；`js/tank_screens.js` `buildPauseViewModel` 删除 `pauseShopBtn` 按钮项（暂停屏 DOM 此前已无该按钮）。**修理箱/医疗包冷却只受永久升级减免**（`KIT_BASE_CD` 45s − `kitPermLv`×1，`KIT_CD_FLOOR` 15s 钳底不变）；`runScoreSpent` 保留为卡牌刷新花费账本（P-41 语义不变：花费不减终局转化得分）；`js/tank_economy.js` 的 `RUN_SHOP_DEFS` 等纯 API 暂保留（Node 测试链仍在消费，UI 无入口）。
- **卡牌选择定案（5 选 2 / 5 选 3）**：reward 屏由「三选一即点即得」改为批量候选制——普通节点 **5 选 2**、Boss 追加轮 **5 选 3**（`rewardPickTarget()` 按 `pendingLootRounds` 判定，`drawCardChoices(pool, 5)`）；卡片点击选中 / 再点取消，选满上限后需先取消才能换选（**不可重复选同一张**，`.card.selected` 高亮 + ✓ 角标）；每轮**免费刷新 1 次**，后续刷新按 `RULES.economy.refreshCost`（10 分）记入 `runScoreSpent` 账本并整批重抽；选满后「确认选择 CONFIRM (n/need)」统一 `pickCard` 全部选中卡再 `advanceRewardFlow`。指示 UI（`#rewardStatus` 已选 x/need、刷新按钮 免费/−10分 文案与余额禁用、确认按钮 n/need 禁用）齐备，`openRewardScreen` 每次进入 reward 态重置选择与免费刷新。
- **切弹方向反向（用户定案 2026-09-14）**：**E = 下一发 / Q = 上一发**（`tank_bindings.js` `ammoNext:'e'` / `ammoPrev:'q'`，`ACTION_INFO.ammoCycle` 文案同步）；mvp `renderAmmoIndicator` dirHint 语义本就按 `ammoNext/ammoPrev` 动作推导无需改动；`scripts/test-bindings.js`、`scripts/test-browser-smoke.cjs`（Q 反向回绕末位 → E 正向回绕槽 0）、`scripts/test-browser-run.cjs`（E 正向 3 连 [he,heat,ap] / Q 反向 3 连 [heat,he,ap]）断言全部改为新语义。
- **开局敌军血量平滑**：`RULES.difficulty.entityMults` 生存端下限下调——`maxHp` [0.8,1.4]→**[0.45,1.4]**、`armorAll` [0.7,1.3]→**[0.6,1.3]**（`js/tank_map.js` `entityMultsForDifficulty` 回退表同步）。锚定玩家基准的难度 Lv.0 初始敌军不再血厚难打（开局交战 TTK 从 ~12 发级回落到 ~4 发级），难度曲线整体形状不变。
- **测试台倒车倒置入口补齐**：`tank_bench.html` 侧栏「驾驶设置」新增 `#benchInvertMainChk` 复选框，与 `#benchPanel` 面板内 `#benchInvertChk` 双向同步同一设置键（`rogue-tank-settings.invertReverseTurn`），侧栏常开面板收起时也可切换。
- **验证**：`npm run check` / `npm test` / `npm run test:browser` 三链全绿。
