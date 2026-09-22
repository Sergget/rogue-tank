### 4.33 2026-09-23 用户反馈批次 #J（2 项，已完成 2/2）

> 现行细则归口 `specs/boss.md` §9（§9.1 召唤小兵速度锚定 / §9.2 Boss 履带随机自修）。

- **#J1 召唤小兵机动锚定（修「boss 召唤的小兵移动速度太快」）**：`tank_mvp.spawnBossSummonWave` 由裸 `applyTankConfig(spec)`（照搬 `tanks/*.json` 原始机动值，绕过玩家基准/难度锚定）改为与节点敌军/增援同一条 P-46 锚定链：`applyEnemyAppearanceAndStats(s, spec, playerAnchorStats || player.stats, currentNode.entityMults)`——只取外观与类型，数值 = 玩家出击基准 × 兵种 profile × 难度乘子。
- **#J2 Boss 履带随机立即自修（修「boss 频繁断履带后长时间站桩」）**：新增 `js/tank_boss.js updateBossTrackRepair(t, dt, opts)` + `RULES.boss.trackRepair = { enabled, windowSeconds: 8, chance: 0.4 }`。口径：履带被击断（`trackBroken + immobT=trackLock`）瞬间预定 `(0, 8s]` 内均匀随机决策时点 + 一次性概率 roll；到点命中 → 立即清零 `trackBroken/immobT` 并发 `{type:'trackRepair'}` 事件（mvp 层播火星特效 + 日志），未命中 → 保持锁定直至 `trackLock` 自然归零；每次断裂独立决策，单次决策不重复 roll。接入层在 boss AI 循环内逐帧调用（rng 复用 `battleState.reinforceRng`）。
- **验证（三链）**：`npm run check` EXIT=0；`npm test` EXIT=0（test-boss 新增 trackRepair 五路断言：未断无调度 / 随机时点预定 / roll 命中立即修复 / roll 失败保持锁定不重滚 / 再次断裂重新决策）；`npm run test:browser` 四链 ALL PASS。

### 4.32 2026-09-21 用户反馈 #I 批次（4 项，已完成 4/4）

> 本条为简结论，现行细则归口 `specs/combat.md` §12（§12.1 激光定桩降速 / §12.2 虚线反映阻挡 / §12.3 Boss 随机走位 / §12.4 建筑密度）、`specs/map.md` §13.4（密度与 Boss 战图加成）、`specs/boss.md` §8。

- **#I1 Boss 激光期车体冻结 + 炮塔再降速**：新增 `bossLaserHoldMove`——激光期（蓄能+射击）接入层连 `driveTank` 一并跳过，车体全程定桩（此前仅抑制炮塔转炮、车体仍被 AI 驱动）；`RULES.boss.laser.laserTurnSpeed` **0.55 → 0.35 rad/s**（仍为固定角速度直驱）。量化：单激光周期 41 帧 × 0.035 = 1.435 rad < π/2 ⇒ 炮塔转不满 90°，走位窗口显著变宽。
- **#I2 蓄能虚线与光束反映掩体阻挡**：新增 `_laserBeamBlockDist`（Liang-Barsky 射线×OBB 求最近全高掩体入口距离）；伤害口径由「逐目标连线判定」改为**光束级截断**（沿光束投影 > blockDist 不掉血，`laserBlocked` 事件）；`laserCharge`/`laserFire` 事件携带 `blockedDist`，绘制层据此截断虚线/光束并在截断点画阻挡标记——判定与表现严格同源。
- **#I3 建筑密度（含 Boss 战图加成）**：`nodeMap.building` clusterPerJunction 3~5→**4~8**、maxPerNode 18→**28**；新增 `bossDensity: 1.6` 经 `makeNode(isBossNodeIndex)` → `generateNode(buildingDensity)` → `placeRoadsideBuildings(density)` 放大路口簇/总量/沿路采样。**顺带修复 #E3/#G 遗留缺陷**：`fits()` 对含全部道路段的 `outCovers` 用 pad 34 判重叠 ⇒ 沿路/路口建筑恒被拒绝、`placeRoadsideBuildings` 产出恒为 0、**所有密度参数此前完全空转**；现行道路按 pad 10、非道路元素才按 pad 34。实测 8-seed 结构 87→103、`building`/`ruined` 首次实际出现；校准基线**第三次重锚**（连通性维持 0.999~1.000、minPassage 仍高于可通行下限）。
- **#I4 Boss 随机走位（反站桩）**：新增 `RULES.ai.bossWander`；`updateBossBehavior` 周期性在玩家周围随机选航点（环绕 240~520px、2.2~4.6s 换点、钳进边界），写 `t._bossMoveOverride`，mvp AI 循环对 Boss 替换车体 `turn/move`（**炮塔照常锁定玩家瞄准开火**）。豁免 crush 风格/weave 冲刺窗口/激光期/目标已毁；hold、skirmish、command、fortify 全部由站桩转为机动。
- **验证（三链）**：`npm run check` EXIT=0（同步补 `types/globals.d.ts` 的 `NodeGenOptions.buildingDensity`）；`npm test` EXIT=0（test-boss #I1 车体冻结标志/转速 0.35/#I2 blockedDist 与截断伤害/#I4 走位覆盖与豁免；test-nodegen #I3 密度聚合生效与沿路建筑实际生成；test-nodegen-calibration 重锚通过）；`npm run test:browser` 四链 ALL PASS。（test-ai 的 #E7 反应延迟断言为既有随机抖动采样，复跑通过，与本次改动无关。）

### 4.31 敌方可见距离屏幕相对化（2026-09-21 #H5，已完成 1/1）

> 用户裁定：「目前敌方渲染的距离写死成了像素，会受缩放影响，迫使玩家始终以最高倍率游玩，失去一些细节」。本条为简结论，现行细则归口 `specs/combat.md` §11.1/§11.4。

- **根因**：#H1 窄轴收口与 #H2 深度拉远都把可见距离定义为**固定世界像素**（900px 圆），缩放必然改变敌人的屏幕出现位置——#H2 只能靠强制拉远（zoom≈0.67 + minZoom 0.45）补偿，代价是玩家失去放大细节的自由。
- **修正**：可见半径重定义为**屏幕相对**——`R = RULES.vision.screenRadiusRatio(1.0) × min(vw,vh)/2 ÷ zoom × (1+视野卡加成)`，`R×zoom` 恒定 ⇒ 敌人的屏幕出现位置与缩放无关；`visionRadiusForViewport` 重写（窄轴容量/(1+bias) 保留为极扁视口的几何护栏）。
- **连带回退**：`visionFitZoom`/「用户基准×适配值」模型/进节点强制缩放全部移除；`minZoom` 0.45 → 0.8（P-39 原值）；缩放回归纯视觉偏好（默认 zoom=1 全细节，滚轮自由）；`RULES.vision.radius` 降级为镜头外延基准。等距（#H1 目标）与屏幕公平性（超宽屏不占优）在屏幕相对口径下自然保持。
- **验证（三链）**：`npm run check` EXIT=0；`npm test` EXIT=0（test-camera #H5 段：R×zoom 恒定 / 屏幕相对等距 / 超宽竖屏同规则 / 卡牌护栏 / minZoom 回退）；`npm run test:browser` 四链 ALL PASS（smoke P-39 探针重写：默认 zoom=1 + 放大后 R×zoom 恒定断言）。
- 细则归口 `specs/combat.md` §11.1（现行口径）/ §11.4（动机）；§9.6 视野圈绘制、§10 演进史随注记指向本节。

### 4.30 2026-09-21 用户反馈 #H3/#H4（超装填去 V 键 + Boss 激光固定转速与掩体阻挡，已完成 2/2）

> 本条为简结论，现行细则归口 `specs/combat.md` §11（§11.1 视野适配缩放为 #H2 同轮裁定、§11.2 超装填 / §11.3 Boss 激光）。

- **#H3 超装填移除 V 专属键**：用户裁定超装填只作为数字技能键技能。删除 `tank_bindings.js` 的 `abilityOverdrive` 键位/ACTION_INFO/ACTION_ORDER、mvp 的 `btnV` 按钮/监听/`cdV` 角标/`BTN_BY_ABILITY` 映射/isDown 轮询、bench 的动作与 `benchAbilityOverdrive`；激活路径唯一化为 **skillHotkey(n) → DISPATCH**（常驻显示走 §4.28 的技能池槽）。`ABILITY_KEYS_RUNTIME` 与 super_reload 卡不变。
- **#H4 Boss 激光炮塔固定转速 + 掩体阻挡**：#G1 的乘数方案实际角速度 = Boss 基础转速（tuning ×0.6 与难度乘子压低）× 0.15~0.18 ≈ 0（用户实测「又不转动了」）。改为 `updateBossLaser` **直接推进炮塔**：角速度 = `RULES.boss.laser.laserTurnSpeed`（0.55 rad/s 固定绝对值），转向目标 = AI 本帧期望方向（已含射界钳制），到向即停；激光期置 `bossLaserHoldTurret` 供 mvp AI 循环跳过炮塔驱动（两套驱动不再叠加）。**全高掩体阻挡**：伤害循环逐目标做炮口→目标连线 × OBB 判定（自包含零依赖实现，`opts.covers` 注入），`tierGroup:'structure' && vision`（building/full/intact/rock/ruined）遮挡目标不掉血（`laserBlocked` 事件），灌木/栅栏等不阻挡；`RULES.boss.laser` 新增 `laserTurnSpeed`/`blockByFullCover`，删除两乘子与 `BOSS_LASER_TURN_SOURCE` 导出。
- **同轮 #H2（视野适配缩放，用户裁定「纵向拉长而非削弱横向」）**：§4.29 的窄轴收口降级为安全网；镜头自动拉远（`visionFitZoom`，1080p ≈ 0.667）使名义视野 900 全方向生效（纵向前向 810 → 1215px 与横向一致）；缩放模型改「用户基准 × 适配值」，`minZoom` 0.8 → 0.45。细则 `specs/combat.md` §11.1。
- **验证（三链）**：`npm run check` EXIT=0；`npm test` EXIT=0（test-boss #H4 段：hold 标志/固定转速单帧转角/到向即停/hold 释放/建筑岩石阻挡/灌木不阻挡；test-bindings abilityOverdrive 已删除断言）；`npm run test:browser` 四链 ALL PASS（smoke P-39 探针改 #H2 基准口径；r4 C3 改技能池数字键动态定位触发；(d) ammoKey 断言为既有 flaky，重跑通过）。
- 细则归口 `specs/combat.md` §11（§11.1 / §11.2 / §11.3）。

### 4.29 视野等距修正（2026-09-21 #H1，已完成）

> 用户反馈：「重新检查摄像头随鼠标移动和视野机制，确保使用鼠标在各个方向上，可看到敌人的距离都是相同的，现在对于横屏设备，横向接近敌人依然是最有利的」。本条为简结论，现行细则归口 `specs/combat.md` §10。

- **根因（file:line）**：有效可见距离 = min(视野圆边界, 屏幕边界)。视野圆各向同性（`tank_mvp.html entityHiddenByVision` 世界空间圆），但屏幕是矩形——横屏 1920×1080 横向半幅 960 ≫ 纵向 540：鼠标指向横向时屏幕容量 1230 ≥ 视野边界 1215（视野收口），指向纵向时容量 810 < 1215（屏幕收口）⇒ 横向 1215px vs 纵向 810px（1.5× ≈ 宽高比）。镜头外延（#E12）量级各向同性，不是根因。
- **修正**：`js/tank_camera.js` 新增纯函数 `visionRadiusForViewport(cam, opts)`——`R = min(nominal, 窄轴屏幕前向容量/(1+bias))`，收口后视野圆在所有方向都是约束边界 ⇒ 鼠标指向任意方向的前向可见距离恒等。`tank_mvp.html visionRadiusEff()` 接线（判定 + 视野圈绘制同源）。
- **数值**（1080p/zoom1）：R 900→600，前向可见距离恒 **810px**——纵向体验零变化（此前即 810），横向 1215→810（目标修正）；纵向后向 270→390 改善。**更宽的显示器不再看得更远**（21:9 与 16:9 窄半幅同为 540 → 同一上限）；竖屏同规则；zoom 0.8/1.3 全程保持等距；4K 视口基准半径绑定（900/前向 1215）。
- **边界（几何必然，已文档化）**：保留鼠标锚定 bias 与镜头外延——「完全均匀气泡」与外延互斥（外延使屏幕相对玩家不对称）；视野卡（commander_sight）在收口绑定时无法突破屏幕容量（大视口下按上限生效）。
- **验证**：`scripts/test-camera.js` #H1 段（轴向等距 6 方向恒等 / 超宽屏同上限 / 竖屏一致 / zoom 联动 / 4K 基准绑定 / 卡牌边界 / 值域）全绿；三链复验 `npm run check` EXIT=0 / `npm test` EXIT=0 / `npm run test:browser` 四链 ALL PASS（2026-09-21，沙箱内按 `sandbox-verify` 一次性放宽进程权限实跑）。
- 细则归口 `specs/combat.md` §10（§10.1 根因 / §10.2 收口函数与数值表 / §10.3 设计取舍与边界）。

### 4.28 2026-09-21 用户反馈批次 #G（8 项反馈 + 1 项设计征询，已完成 9/9）

> 用户在同一轮反馈中提出 8 项具体问题/需求 + 1 项设计征询（#G1~#G9）。全部落地并三链验证通过。本条为简结论，现行细则按系统分别归口 `specs/combat.md` §9（战斗/武器/能力/HUD）、`specs/map.md` §13（路网/建筑）、`specs/boss.md` §7（Boss）、`specs/cards.md` §8.3（卡牌）。

- **#G1 Boss 激光炮塔转速太快**：蓄能期旧实现每帧 `addModifier` 叠加同源修饰器，而 mult 聚合是加法式 `1+Σ(value−1)` 且钳到 ≥0 ⇒ 转速被钳成 0（蓄能完全冻结），射击期又恢复全速（「开火瞬间甩头」）。改为 `BOSS_LASER_TURN_SOURCE` timed modifier：`_setBossLaserTurretMod` **同源先移除再添加**（幂等）+ 400ms 到期续期；蓄能 ×0.18 / 射击 ×0.15（`RULES.boss.laser.fireTurretTurnMul` 新增）。细则 `specs/boss.md` §7.1。
- **#G2 部分 Boss 没有召唤敌人**：`RULES.boss.summonWaves` 新增 `defaultPool`/`defaultWaves`，`bossSummonWave` 对空 `summons` 且带 `t.boss.id` 的实体自动补 3 波（裸测试实体仍返回 null 不污染单测）；5 个 `bosses/*.json` 全部补齐 3 波召唤（`hpFrom` 1.0/0.66/0.33）。细则 `specs/boss.md` §7.2。
- **#G3 开发者面板「−1」按钮无效**：主因是 `renderDevOwnedCards()` 被 `updateDevParams` **逐帧无条件 `innerHTML` 重建**——真实鼠标 mousedown→mouseup 跨帧时按钮被销毁，click 落在无监听的持久容器上。修复三件套：① 持有清单签名缓存 `devOwnedSig`（未变即 no-op，逐帧路径零重建）+ 容器级事件委托（`data-card-id` → `rollbackDevCard`）；② 重放序列改读新增的**按序施加日志** `tank._cardApplyLog`（`applyCardEffects` 写入；此前只读 `cardEffects`，而纯 modifier 卡只写 `tank.modifiers` ⇒ 任意一次 −1 都会永久抹掉其他 modifier 卡效果）；③ 持有统计合并 `cardEffects` + `modifiers` 的 `card:*` 源（96/169 张纯 modifier 卡此前**根本不显示**，也就没有 −1 行）。**浏览器链实测另暴露一处**：`devOwnedSig = ''` 兼作「强制重绘」标记时，空列表分支把 `''` 当作「已画过空态」⇒ 回滚掉最后一张卡时残留行永不清除；改用独立脏标记 `devOwnedDirty`。
- **#G4 更复杂的路网 + 更多建筑物体**：路网 v4——新增两种街区拓扑 **G 网格街区**（正交横干 + 两条贯穿纵路「日」字格）与 **I 双干贯穿**（两条近平行横干 + 一条贯穿纵干），删除旧 **F 斜向丁字对**（斜干 × 正交支道实测交角低至 36.9°，无法满足 #B7 的 ≥60° 护栏）；T 形支道改**直线**（振幅 0，旧实现按整条干道跨度折算振幅、支道只有半幅 ⇒ 局部斜率过大是浅角根因）；平行拓扑端点/弯曲双收紧（旧实现两条「平行」路曾以 5.1° 浅角互穿）；`diagAngleMax` 0.52→0.34。建筑——新增可破坏楼房 tier `building`（耐久 3 → `ruined` → `rubble` 破坏链，`ruined` 此前定义但从未生成）与建筑混合配比（30% building / 10% ruined / 60% full）、密度提升（`maxPerNode` 18→20、沿路采样步 /6→/4、通行间隙 30→34px）。**顺带修复**：林地簇无边界钳制，贴边簇（`village_center` 防风林）会把树推到节点外（`test-map`「掩体在界内」失败）。细则 `specs/map.md` §13。
- **#G5 电磁轨道炮太弱**：`reloadMult` 2.2→1.8、`damageMult` 1.5→1.8，并新增**贯穿**机制（`pierce: 1` 额外目标数 + `pierceDmgMul: 0.6` 逐个衰减）——`firePrimaryShell` 写 `pierceLeft/pierceDmgMul/pierceHitIds`，`stepShells` 命中后跳过已命中实体并继续飞行。配套新增 rare 升级卡 `weapon_primary_railgun_upgrade`。**附带修复**：`drawReloadRing` 单环与 bench 装填条漏乘武器通道 `reloadMult`（轨道炮装填前 44% 进度环恒空）。细则 `specs/combat.md` §9.3/§9.7。
- **#G6 新增主武器「弹夹炮」`clip`**：严格按用户规格——弹夹内间隔 **0.7s 固定（不受任何 modifier/debuff 影响）**、弹夹间装填 **标准 × 3.0**、初始容量 4 发、每扩容 1 发弹夹间装填 **+0.8× 标准**（`clipSizeReloadStep`）。运行时 `_clipState{size,rounds,pendingRefill}` + `updatePrimaryClip` 逐帧驱动（mvp 玩家/AI + bench）；`drawReloadRing` 新增弹夹分支（余量数字 + 弹夹内蓝色间隔弧 / 整组橙色装填弧）。卡牌：`weapon_primary_clip`（epic 安装）/ `weapon_primary_clip_extended`（rare `{"clipSize":"+1"}` maxStacks 2）。**同轮扩展 `statOverrides` 支持 `"+N"` 相对增量**（`mergeStatOverrides`；此前 boolean 值还会被校验拒绝，`altReload`/`guided` 升级卡报非法）。细则 `specs/combat.md` §9.1/§9.2、`specs/cards.md` §8.3。
- **#G7 技能获得后只有文字提示、UI 无按键与技能名**：底部 HUD 新增**技能池常驻槽** `#skillSlot1~3`——显示技能中文名（`ABILITY_LABELS`）+ 数字键 + 冷却；序列与 `skillHotkey(n)` 完全同源（`cardEffects` 的 ability key 去重列表，不过滤 artillery/shield/overdrive）；点击槽位等价于按对应数字键。`ABILITY_KEY_HINT` 补 `repair`/`medkit`/`extinguish`（4/5/6 键）与 `aps`，G/H/V 文案改为「G 键 / 1~3 号技能键」。细则 `specs/combat.md` §9.6。
- **#G8 血条与按键太近、无速度显示、重设计玩家 UI 面板**：`#bottomHud` 由旧「血条 + 单排按钮」改为 **flex 三区**——VITALS（血条 + **档位 D/R + 当前 km/h + 速度条 + 公路加成**）/ WEAPONS（弹种槽 + 补给键 + 副武器）/ SKILLS（G/H/V 专属键 + 技能池槽）。速度读数经新增 `tankCurrentKmh(t)`（**必须先除 `pxFactor×effMul` 再乘 `kmhFactor`**，直接乘会读出 ~208km/h 虚高值）。JS 侧 `display` 同步由 `'block'` 改 `'flex'`；`#reloadWrap`/`#bottomHud`/`#hintBar` 等 id 与 `btnG/btnH/btnV` 可点击性作为测试契约保留。细则 `specs/combat.md` §9.6。
- **#G9 武备与技能扩展（设计征询）**：给出扩展建议清单（见下）并**实装其一**——主动防御系统 **APS**（`RULES.abilities.aps`：6s 窗口 / 240px 半径 / 最多拦截 3 发 / 冷却 22s），激活后由页面主循环 `updateAps` 在 `stepShells` 之后逐帧扫描并**销毁**进入半径的敌方弹药；卡牌 `ability_aps`（epic），经 1~3 号技能键触发；`removeRunModifiers` 清 `_apsT`/`_apsHits` 防跨局残留。细则 `specs/combat.md` §9.4、`specs/cards.md` §8.3。
- **验证（三链）**：① `npm run check`（含 `tsc --noEmit`）**EXIT=0**；② `npm test` **EXIT=0**（含 `test-nodegen` 七条护栏、`test-nodegen-calibration` 重锚、`test-map`、`test-fire` 新增 7e-clip/7f-pierce/8e-clip 断言、`test-cards`/`test-abilities`/`test-panels`/`test-boss`、`validate-content` 全部通过）；③ `npm run test:browser` **四链（smoke / r3 / run / r4）ALL PASS、EXIT=0**——沙箱内 `spawn EPERM` 属管道捕获限制，按 `sandbox-verify` 一次性放宽进程权限后实跑；run 链「卡牌 −1 回滚」用例由 FAIL 转 PASS 即 #G3 修复的端到端证据。
- **#G9 扩展建议清单（未实装，供后续排期）**：① **武器侧**——`plasma`（蓄力穿透光束炮，与 Boss 激光同源判定）、`swarm_missile`（多联装齐射，复用 rocket burst 链）、`arc_gun`（链式闪电，命中后跳到 2 个近距离目标，可复用 pierce 的命中队列）、`flamethrower`（持续锥形伤害 + 起火 DOT，复用 `debuffs.fire`）。② **技能侧**——`smoke_screen`（烟幕，`tank_cover.smokeClouds` 基础设施**已保留但当前无生产者**，接线成本最低）、`airstrike_designate`（指定坐标延迟轰炸，复用 `tank_strike`）、`engine_boost`（瞬发冲刺 + 履带锁免疫）、`repair_drone`（伴随维修，复用 `tank_drone`）、`decoy`（诱饵假目标，吸引 AI 索敌）。③ **Boss 侧**——多阶段形态切换（已有 `applyBossStage` 骨架）、护盾发生器（需先破盾再伤本体，复用 `tank_shield`）。
- **细则归口**：`specs/combat.md` §9（§9.1 弹夹炮 / §9.2 statOverrides `+N` / §9.3 轨道炮 / §9.4 APS / §9.5 Boss 激光与召唤 / §9.6 HUD 三区 / §9.7 装填环修复）、`specs/map.md` §13（§13.1 路网 v4 / §13.2 building tier / §13.3 校准重锚）、`specs/boss.md` §7、`specs/cards.md` §3/§8.3/§8.5。

### 4.27 浏览器自动化特性补全（2026-09-20 会话，已完成）

> 用户要求补全浏览器自动化测试，覆盖此前未验证的主武器各类型实战、F 副武器击发与伤害、技能实战效果、商店购买结算。新增 `scripts/test-browser-r4.cjs`（#F7），接入 `npm run test:browser` 四链（smoke / r3 / run / r4）。mvp `window.__TEST__` 新增测试钩子（`shells()` / `strikes()` / `profile()` / `rerenderShop()`），仅采样闭包内状态，不改变生产路径；顺手修复 `js/tank_devpanel.js` 的 tsc 类型债务（EventTarget/Element 收窄 + `window['xxx']` 索引访问），使 `npm run check` 全绿。

- **r4 覆盖**：主武器 standard 空格单发 / double_barrel 空格齐射 2 发（#F2 接线）/ autocannon 空格按住连发 + `heatPct` 积累 / railgun 单发；副武器 mortar F→`isArc` 曲射弹 / rocket F→burst 首发 / missile F 激活→锁定 1s 自动发射（并断言**按住 F 不被逐帧轮询翻转**）/ mine_layer 按住 F 只走一次边沿 + 两次 F→4s 雷场生成（预约清空 + 整场 3 枚 + 触爆对敌人掉血）；技能 artillery G→`strikes` +3 登记→落弹敌人掉血 / shield H→吸收池 / overdrive V→`reloadT=0` + 冷却入池；商店 loadout⇄shop 购买 hp_up（25 点→点数归零 + 升级 Lv1 + UI 刷新）/ 复活加购（40 点→`bonusRevives` +1）/ 升级作用于开局（`stats.maxHp ≥ base + 10`）。
- **明确边界**：敌人 AI / Boss 深层行为仍由 Node 侧 `test-ai.js` / `test-boss.js` 覆盖；浏览器只验证敌人存在 + 开火命中（smoke #23）。
- **四链实测中发现的 3 处真实缺陷（均已修复）**：
  1. `tank_mvp.html` `mountDevPanel` 读取 `let devNoVision` 先于其定义（TDZ，`Cannot access 'devNoVision' before initialization`）→ 页面脚本中断、Home 态不渲染。修复：把 `let devNoVision` 提升到 `devAim`/`devCheat` 旁（`typeof` 守卫**不能**救 TDZ——`typeof` 对 TDZ 的 `let` 同样抛错）。
  2. `tank_bench.html` 遗留的 `benchInvulnChk`/`benchInstantReloadChk` 取元素后直接 `addEventListener`——#F1 移除旧 `#benchPanel` 后 DOM 不存在 → 加载即 `TypeError`。修复：删除该死接线（勾选状态仍由 `onCheatChange` 同步）。
  3. **开关类副武器的 F 被逐帧轮询**：`missile`（激活/取消）与 `mine_layer`（预形态/确认）由主循环 `input.isDown('fireSecondary')` 每帧调用 `trySecondaryFire` → 按住 F 期间**每帧翻转**（实测 250ms 内 9 次 true/false 交替；mine_layer 则一次按住跨帧连走「预形态→确认」）。后果：轻按 F 约一半概率停在「已取消」，导弹表现为「按 F 没反应」。修复：两类改走**原生 `keydown` 边沿**（独立监听 + `e.repeat` 过滤 + 菜单/面板门控），帧轮询分支直接 return；HUD F 按钮走 `trySecondaryFire(true)`（force 直调）。细则归口 `specs/combat.md` §8.2。
- **r4 夹具（仅测试侧，非产品缺陷）**：① 发射计数必须按 `shooter.id === 'player'` 过滤——`firePrimaryShell` 同时服务敌方/友军 AI（主循环 AI 段直接调 `fireTank`），不过滤会把敌方射击算成玩家发射（表现为「空格 1 发」偶发 2 发）；② 夹具统一冻结全体敌人（`maxHp/hp=1e6` + `immobT/reloadT=9999`），否则敌方 AI 会还击并可能打死玩家造成假失败；③ 雷场枚数改统计 `spawnMine` 真实调用次数（触发半径 45px，目标站在场内会被立刻引爆，存活计数会少算）。
- **验证**：① `node --check`（r4 + mvp 内联 + `tank_devpanel.js`）**0 失败**；② `npm run check` **EXIT=0**（含 `tsc --noEmit`，devpanel 类型债务清零）；③ `npm test` **EXIT=0**；④ `npm run test:browser` **四链（smoke / r3 / run / r4）全部 ALL PASS、EXIT=0**（2026-09-20 实跑；沙箱内需按 `sandbox-verify` 一次性放宽进程权限跑 browser 链，且复用已监听 server 可避开 listen 拒绝），r4 连跑 3 次均全绿（抖动已消除）。
- 细则归口 `specs/editor.md` §7.5（工具链与浏览器覆盖矩阵）；F 键边沿语义归口 `specs/combat.md` §8.2。