# Rogue Tank — 工程问题清单（已核实）

> **临时文档**：只存放**待处理 / 处理中**的已核实问题。每条必须有代码证据（`file:line`）与复现/触发条件；绝不收录未核实项。
> 条目**修复并验证有效后**按 `AGENTS.md` 4 步生命周期收尾：结论同步 `DEVELOPMENT.md` / `specs/` → 删除本条目 → 原文归档 `docs/archive/<yyyy-mm>.md` → 联动下一步计划。
> 已解决并归档的历史条目（#1~#26、#44、#49、#60~#101、#A1~#A28、#B1~#B11、#C1~#C4/#C6、#C5、#D1~#D5、#A9、#E1~#E13、#F1~#F6、#G1~#G9、#H1~#H5、#I1~#I4）：见 `docs/ARCHIVE.md` 索引表。

---

## 当前待处理问题

（无。存量条目已全部修复并归档；新问题经核实后按 `AGENTS.md` §2 生命周期新增。）

---

## 核验记录（2026-09-20，与 #E1~#E13 相关）

- 核实方式：5 路只读调查（① 地图生成/路网/掩体 ② 炮弹拦截与不可见阻挡 ③ 部署物与反坦克导弹 ④ 敌人 AI 与 Boss ⑤ HE 击退/树木/摄像机），全部结论携带 `file:line` 证据，未修改任何代码文件。
- **关键根因（#E1「炮弹被不可见物体拦截」）**：三处并存——(a) `rubble` 逻辑 OBB 90×60 仅绘制 5 颗 2.2~4.2px 石子，`shellBlock:'grad'` + 中坦 exposure=0 ⇒ 100% 拦停；(b) `s.dec` 曝光缓存仅在跳弹时复位，掩体被摧毁后 `findCoversOnPath` 已跳过 `hp<=0` 但缓存仍生效 ⇒ 炮弹停在目标车体命中点（隐形墙）；(c) `tank_mvp.html entityHiddenByVision` 视野圈外敌军不绘制，但 `stepShells` 对全部 `entities` raycast ⇒ 不可见车体拦弹。三条均已修复（见 `DEVELOPMENT.md` §4.23 / `specs/map.md` §12.2）。
- **#E8 问题回答**：核实 `aiDecideEnemy` 内**没有** engage 状态传播（只有受击传播 `propagateAlert`）；现已新增「首次进入接战时向半径内友邻传播」。

---

## 核验记录（2026-09-20，与 #F1~#F4 相关）

- 用户反馈 4 项（2026-09-20 会话）：#F1 测试台开发者面板未应用新面板；#F2 双联火炮发射 2 次后无法发射 + 单击观感歧义（动画 1 发 / 伤害疑似 2 发）；#F3 火箭、导弹等副武器在测试台无法发射；#F4 mvp 双联火炮单击/空格齐射语义（卡面为「空格齐射（仅两管都就绪时）」）与装填机制无法验证。用户裁定：devPanel 完整统一四 Tab 两页同源；空格齐射仅两管都就绪才发射；双管装填弧装填期全程可见。
- **根因（file:line 证据）**：① `tank_bench.html` 旧 `#benchPanel` 分叉（2026-09-17 #C5 遗留，bench 未挂载新 devPanel）；② `js/tank_fire.js` `fireDoubleBarrel` 旧语义 `readyIdx.slice(0,2)`——仅 1 管就绪时空格也发 1 发，与单击无区分；③ `tank_bench.html` 缺副武器逐帧驱动/F 键接线与 `spawnMine`/`deployables` 注入（mine_layer 依赖静默失败）；④ `tank_mvp.html` `drawReloadRing` 双管分支位于 `reloadT > 0` 门控之后，而双管装填期 `reloadT` 恒 0（仅 0.5s 换管窗口非零）→ 弧从不绘制。
- 修复与三链验证见 `docs/DEVELOPMENT.md` §4.24；细则归口 `specs/combat.md` §8.5 / `specs/editor.md` §7；浏览器链已补跑：`npm run test:browser` 四链 **ALL PASS / EXIT=0**（2026-09-20，见 `docs/DEVELOPMENT.md` §4.27）。

---

## 核验记录（2026-09-20，与 #F5 相关）

- 用户反馈（2026-09-20 会话实测）：「获取地雷作为副武器时，按下 F 能无限召唤地雷，但是没有伤害」。
- **核实用例**（Node 复现 `fireActiveSecondary`/`updateDeployables`/`applySplashAt` 全链路）：① F 按住连发 12 帧仅布雷 1 枚（装填门控 `secondaryReloadT>0` 拒绝，`js/tank_weapons.js:357`）；② 手动清零装填连发 → 场上收敛到 `mineMax` 上限（`enforceDeployLimits` 淘汰最早部署，`js/tank_deployables.js:250`）；③ 敌对实体踩雷产生 `mineExplode` 事件且接线伤害生效（mvp `applySplashAt` 复现掉血 50/雷）。**「无限召唤」根因**：mvp 雷场路径 `tank_mvp.html` `handleMineFieldF`（:699）确认预约无上限——连续双击 F 可无限预约 `pendingMineFields`（4s 后各生成雷场）。**「没有伤害」根因**：地雷触发判定为敌对实体**中心点**距雷 ≤ `triggerRadius`（单发/雷场 30px、`spawnMine` 默认 25px），坦克 hull 近百 px 级 → 视觉压雷却常不爆炸（爆炸伤害链路本身正常）。
- 修复与三链验证见 `docs/DEVELOPMENT.md` §4.25；细则归口 `specs/combat.md` §8.1；浏览器链已补跑：`npm run test:browser` 四链 **ALL PASS**（含 mine_layer 边沿与触爆掉血断言，见 `docs/DEVELOPMENT.md` §4.27）。

---

## 核验记录（2026-09-20，与 #F6 相关）

- 用户反馈（2026-09-20 会话实测）：「有雷场待生成时，再按 F 会生成新的雷场、同时旧的失效。便携式掩体同理」。
- **核实用例**：① `tank_mvp.html` 雷场生成循环（:2380）在超限检查前 `pendingMineFields.splice`，预约到期被**无提示移除**（旧的失效）；② `js/tank_abilities.js deploy_cover`（:278）与 `tank_bench.html spawnCoverBtn`（:770）走「超限淘汰最早」路径（新掩体生成、旧掩体被移除）。**根因**：部署上限处理在「生成/部署后」淘汰旧部署物，而非「生成/部署前」拒绝新部署。
- 修复：雷场生成前检查 `deployableCount('mine') + n > cap` → 超限则取消该预约并提示（保留已布地雷）；`deploy_cover` 与 bench 掩体按钮部署前检查 `deployableCount >= deployableCap` → 超限拒绝（保留旧掩体）；`abilityFailLog` 补 `deploy-cover-limit` 文案。细则归口 `specs/combat.md` §8.1；三链验证见 `docs/DEVELOPMENT.md` §4.26；浏览器链已补跑（四链 ALL PASS，2026-09-20，见 §4.27）。

---

## 核验记录（2026-09-21，与 #I 批次相关）

- 用户反馈 4 项：①「boss 发射激光时车体不能移动，炮塔转速再降低」；②「激光路径被建筑物阻挡时，虚线框要反映出来」；③「继续增加地图、特别是 boss 战地图的建筑密度」；④「增加 boss 随机移动、瞄准等动作，现在的 boss 几乎完全是站桩等玩家」。
- **根因（file:line）**：
  - #I1：`updateBossLaser` 只设 `bossLaserHoldTurret`（抑制炮塔转炮），mvp AI 循环仍照常 `driveTank` ⇒ 激光期车体照常机动；`laserTurnSpeed` 0.55 对玩家走位仍偏快。
  - #I2：#H4 的遮挡只作用在**伤害**（逐目标 `_laserBlockedByCover`），`laserCharge`/`laserFire` 事件不含任何阻断信息 ⇒ 绘制层的蓄能虚线与光束满长度画出，玩家看不到「掩体后方安全」。
  - #I3：`placeRoadsideBuildings` 的 `fits()` 对 `outCovers` 用 pad 34 判重叠，而 `outCovers` **含全部道路段**（宽 92~124px 条带）⇒ 沿路/路口建筑几乎全部被拒、函数产出恒为 0，此前所有密度参数（cluster/maxPerNode/#G 密度提升）**完全空转**（实测同 seed 仅模板自带建筑）。
  - #I4：Boss 车体驱动完全来自 `aiDecide`；`hold`/`skirmish`/`fortify` 等模式输出 `move=0`（站桩还击），Boss 无随机走位层。
- **修复**：#I1 新增 `bossLaserHoldMove`（激光期连 driveTank 跳过）+ `laserTurnSpeed` 0.55→0.35；#I2 新增 `_laserBeamBlockDist`（Liang-Barsky 射线×OBB 入口距离），伤害改**光束级截断**、`laserCharge`/`laserFire` 带 `blockedDist`、绘制层截断 + 阻挡标记；#I3 密度参数提升（4~8 / 28）+ Boss 节点 `bossDensity: 1.6`（`makeNode`→`generateNode.buildingDensity`→`placeRoadsideBuildings`）+ `fits()` 改为道路 pad 10 / 非道路 pad 34（校准第三次重锚）；#I4 新增 `RULES.ai.bossWander` 与 `_bossMoveOverride`（环绕玩家随机航点，炮塔照常锁定瞄准），crush/weave 冲刺/激光期/目标已毁豁免。
- 修复与三链验证见 `docs/DEVELOPMENT.md` §4.32；细则归口 `specs/combat.md` §12、`specs/map.md` §13.4、`specs/boss.md` §8。

---

## 核验记录（2026-09-21，与 #H5 相关）

- 用户反馈：「目前敌方渲染的距离写死成了像素，会受缩放影响，迫使玩家始终以最高倍率游玩，失去一些细节」。
- **根因**：#H1 窄轴收口与 #H2 深度拉远都把敌方可见距离定义为**固定世界像素**（RULES.vision.radius 900px 圆）——缩放直接改变圆在屏幕上的覆盖范围，#H2 只能靠强制拉远（zoom≈0.67 + minZoom 0.45）补偿，玩家被迫放弃放大细节。
- **修复**：可见半径重定义为**屏幕相对**（`tank_camera.visionRadiusForViewport`：R = screenRadiusRatio(1.0) × 窄半幅/zoom × (1+卡牌加成)，R×zoom 恒定，窄轴容量/(1+bias) 保留为极扁视口护栏）；移除 `visionFitZoom`/基准×适配模型/进节点强制缩放；`minZoom` 回 0.8；缩放回归 P-39 纯视觉偏好（默认 zoom=1 全细节）。等距（#H1）与屏幕公平性（超宽屏不占优）在屏幕相对口径下自然保持。
- 修复与三链验证见 `docs/DEVELOPMENT.md` §4.31；细则归口 `specs/combat.md` §11.1/§11.4；回归 `scripts/test-camera.js` #H5 段（R×zoom 恒定断言）。

---

## 核验记录（2026-09-21，与 #H2/#H3/#H4 相关）

- 用户反馈 3 项（2026-09-21 会话）：#H2「这种方法导致纵横视野都很差，要求纵向视野拉长，而不是削弱横向视野」（对 #H1 收口的裁定）；#H3「超装填在 UI 上既可以 V 键激活，也可以数字技能键激活，删除 V 键激活，作为数字键激活的技能之一」；#H4「boss 发射激光时，炮塔又不转动了？我需要它以一个固定、较慢的速度转动，给玩家走位的机会，且会被建筑、岩石等全高掩体阻挡」。
- **根因（file:line）**：① #H1 的窄轴收口把前向可见距离钳到纵向水平 810px，用户要求等距目标改为横向水平（视野边界 1215px）——几何上唯一途径是镜头拉远（zoom_fit = (窄半幅+外延)/((1+bias)×R) ≈ 0.667@1080p）；② `tank_bindings.js:36` abilityOverdrive='v' + `tank_mvp.html:2680` isDown 轮询 + btnV 按钮三重入口；③ #G1 的 `_setBossLaserTurretMod` 乘数方案（tank_boss.js）——Boss 基础 turretTurnRate 经 tuning（×0.6）与难度乘子压低后再乘 0.15~0.18，实际角速度 ≈ 0（实测不转动），且 AI 接入层每帧仍按 turretDesired 驱动炮塔（两套驱动叠加）。
- **修复**：#H2 视野适配缩放（`tank_camera.visionFitZoom` + 「用户基准×适配值」模型 + minZoom 0.45，#H1 收口降级为安全网）；#H3 V 键三层删除（bindings/mvp/bench，激活唯一化为技能池）；#H4 激光期固定角速度直驱（laserTurnSpeed 0.55rad/s）+ `bossLaserHoldTurret` 抑制 AI 转炮 + 全高掩体 OBB 遮挡判定（structure+vision 类挡伤害，`laserBlocked` 事件）。
- 修复与三链验证见 `docs/DEVELOPMENT.md` §4.30；细则归口 `specs/combat.md` §11；浏览器链已实跑四链 ALL PASS（2026-09-21）。

---

## 核验记录（2026-09-21，与 #H1 相关）

- 用户反馈：「重新检查摄像头随鼠标移动和视野机制，确保使用鼠标在各个方向上，可看到敌人的距离都是相同的，现在对于横屏设备，横向接近敌人依然是最有利的」。
- **根因（file:line）**：有效可见距离 = min(视野圆边界, 屏幕边界)——`tank_mvp.html entityHiddenByVision`（:3529）只判定视野圆，屏幕外由视口剔除天然不可见。视野圆各向同性，但横屏 1920×1080 横向半幅 960 ≫ 纵向 540：鼠标指向横向时屏幕前向容量 1230 ≥ 视野边界 1215（视野收口），指向纵向时容量 810 < 1215（屏幕收口）⇒ 横向 1215px vs 纵向 810px（1.5× ≈ 宽高比）。镜头外延量级各向同性（`updateCameraLead` 归一化按各轴半幅），不是根因。
- **修复**：`js/tank_camera.js visionRadiusForViewport(cam, opts)` 纯函数按视口窄轴收口（R = min(nominal, 窄轴屏幕前向容量/(1+bias))），`visionRadiusEff()` 接线（判定 + 视野圈绘制同源）。1080p/zoom1：R 900→600、前向可见距离恒 810px（纵向零变化、横向 1215→810）；超宽屏/竖屏同上限、zoom 全程等距、4K 基准绑定。几何边界（已文档化）：完全均匀气泡与镜头外延互斥；视野卡在收口绑定时不可突破屏幕容量。
- 修复与三链验证见 `docs/DEVELOPMENT.md` §4.29；细则归口 `specs/combat.md` §10；回归 `scripts/test-camera.js` #H1 段（轴向等距 6 方向恒等断言）。

---

## 核验记录（2026-09-21，与 #G1~#G9 相关）

- 用户反馈 9 项（2026-09-21 会话，8 项问题/需求 + 1 项设计征询）：#G1 Boss 激光炮塔转速太快；#G2 部分 Boss 没有召唤敌人；#G3 开发者面板卡牌「−1」按钮无效；#G4 期待更复杂的路网和更多建筑物体；#G5 电磁轨道炮是否太弱；#G6 新增主武器弹夹炮类型（用户给出完整数值规格）；#G7 技能获得后 UI 未显示按键与技能名；#G8 UI 血条与按键太近、未显示速度，重设计玩家 UI 面板；#G9 还能增加哪些武备和技能。
- **根因（file:line 证据）**：① `js/tank_boss.js` 蓄能期每帧 `addModifier` 叠加同源 `turretTurnRate` mult 修饰器，而 `js/tank_model.js computeStats` 的 mult 聚合为加法式 `1+Σ(value−1)` 并钳到 ≥0 ⇒ 转速被钳成 0（蓄能冻结）、射击期恢复全速（甩头）；② `bossSummonWave` 对空 `summons` 静默跳过，5 个 `bosses/*.json` 覆盖不全；③ `js/tank_devpanel.js renderDevOwnedCards()` 被 `tank_mvp.html updateDevParams` 逐帧调用且无条件 `innerHTML` 重建（真实鼠标跨帧点击落在无监听容器上）+ 回滚重放只读 `cardEffects`（纯 modifier 卡只写 `modifiers`，会被整体抹掉）+ modifier-only 卡不入清单；④ `js/tank_nodegen.js placeRoadNetwork` 旧 F 拓扑（斜干 × 正交支道，支道振幅按整条干道跨度折算）实测交角低至 36.9°、D 平行拓扑两端点独立抽取导致 5.1° 浅角互穿（#B7 夹角护栏盲区）；`RULES.coverTiers.ruined` 定义但从不生成；⑤ `WEAPON_DEFAULTS.primary.railgun` 旧 `reloadMult 2.2 / damageMult 1.5` 无机制收益；另 `drawReloadRing` 单环与 bench 装填条漏乘武器 `reloadMult`；⑥ 主武器类型枚举无 `clip`；⑦ 技能池 1/2/3 无任何常驻 UI，`ABILITY_KEY_HINT` 仅覆盖 7 键；⑧ `#bottomHud` 为「血条 + 单排按钮」紧贴结构且无速度读数（`tankCurrentKmh` 不存在）。
- 修复与三链验证见 `docs/DEVELOPMENT.md` §4.28；细则归口 `specs/combat.md` §9 / `specs/map.md` §13 / `specs/boss.md` §7 / `specs/cards.md` §8.3；浏览器链已实跑：`npm run test:browser` 四链 **ALL PASS / EXIT=0**（2026-09-21）。

---

## 核验记录（2026-09-17，节选—与 #C5 相关）

- 核实方式：4 路只读调查（① 地图/射速 ② 卡牌 ③ 技能/副武器 ④ mvp/bench 对比），全部结论携带 `file:line` 证据，未修改任何代码文件（完整记录随 #C1~#C4/#C6 归档至 `docs/archive/2026-09.md`）。
- 调查附带发现已并入 #C5a：bench Q/E 提示颠倒与 Tab 未 preventDefault（2026-09-19 随 #C5 一并修复归档）。


