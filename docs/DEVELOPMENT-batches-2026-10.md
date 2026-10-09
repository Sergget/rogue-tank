# 批次日志 — 2026年10月 (§4.40–)

### 4.40 2026-09-30 #H 批次：敌军基准解耦（#H1）+ 布雷器可用性（#H2）+ 技能槽指派体系（#H3/#H4）

> 现行细则归口 `specs/combat.md` §12（敌军数值基准与技能槽指派体系）。

- **用户反馈（四条，均浏览器实测复现后立项）**：① 敌人难度似乎会随着**全局商店升级**变化，不应该，只应随节点推进变化；② 地雷无法释放；③ 获得便携掩体卡牌时 UI 栏出现 2 个按钮且占用的数字键不正确；④（举一反三）检查其他 UI 组件同类问题。核查后拆为 #H1~#H4 四条已核实问题，用户裁定 #H3 采用「**循环复用，按玩家选择顶替某个槽位的技能**」。

- **#H1 敌军数值基准由「玩家锚定」改为「固定基准」（核心平衡修复）**
  - **根因（实测定位）**：难度曲线本身干净——`difficultyForIndex` 只吃 `index` + 跨局等级，`difficultyLevel` 亦确认每次新局强制归零，同 seed 下买满五项永久升级后 `node0.difficulty` 与节点难度序列**完全不变**。真凶是两条**以玩家为锚**的放大链：① `applyEnemyAppearanceAndStats` 把敌军 `base` 全部写成 `玩家 anchorStats × enemyClassProfiles`，而锚点快照在 `applyUpgrades()` **之后**冻结；② `difficultyCapMuls` 的穿深封顶/伤害地板与天花板/速度目标全部乘 `player.stats`。⇒ 商店每买一级，下一局全部敌军血/穿/伤/速同比例抬升，玩家成长收益被同步抵消（实测：五项升级买满后敌军穿深 149.96→173.60、伤害 35→45.50、血量 64.29→104.47）。
  - **修复**：新增 `RULES.enemyAnchorBase`（与玩家无关的固定基准，取中位中坦量级）；`applyEnemyAppearanceAndStats` 第三参 `anchorStats` **正式废弃并忽略**（保留形参仅为兼容旧调用方），`difficultyCapMuls` 四键改按固定基准计算并改名 `penCapVsBaseline` / `dmgFloorVsBaseline` / `speedVsBaseline`（+ 新增 `strongestAnchorMult`，使「不传 strongest」时天花板有确定值而非退化为 `Infinity`）；mvp 三处调用（Boss 召唤 / 节点敌军 / 增援）不再传玩家快照，`playerAnchorStats` 整体退役。
  - **净效果**：敌军强度只由节点难度 `diff` 决定，玩家选车与局外永久升级**一律不影响**敌军；数值曲线形状不变（entityMults 难度表未动）。

- **#H2 布雷器「只能放一次」+ 装填冷却失效**
  - **根因**：`RULES.abilities.deploy_limits` 里 `mineFieldCount(5) > mineMax(3)`，而生成侧 `n = min(mineMax, count)` 把 5 钳成 3，再配上「`existing + n > cap` 即拒绝」的判据 ⇒ 首轮布满 3 枚后**所有后续雷场 100% 静默丢弃**（实测第 2/3 轮均 0 新增）；叠加 `handleMineFieldF` 既不检查也不写入 `player.secondaryReloadT`，15s 装填完全失效（可无冷却连点）。绘制层二次用 `mineMax` 钳制，预形态与实际落点数也对不上。
  - **修复**：① 落雷数改按**可用余量裁剪** `n = clamp(count, 0, cap − existing)`（预约时与生成时各裁一次），余量为 0 才拒绝并**即时**提示（不再让玩家白等 4s）；② `mineFieldCount` 由 5 改为 3 与基础上限自洽；③ 补装填门控：冷却中拒绝并提示，确认后写入 `secondaryReloadT = reload / debuffReloadRate`（与单发路径同口径）；④ 绘制层直取预约时的数量，所见即所得。#F6「超限拒绝且保留已布地雷」的原意保留——上限仍是硬约束，但满上限时能立即得到反馈。

- **#H3/#H4 技能槽由「自动推导」改为「玩家指派」**
  - **根因**：旧 `skillHotkey` 用 `owned[num-1]`（`owned` = cardEffects 去重顺序），带来三个互为因果的缺陷：① `artillery`/`shield` 既有专属键按钮（`btnG`/`btnH`）又自动进槽 ⇒ **同一技能两个按钮**；② 运行时技能键 7 个（`ABILITY_KEYS_RUNTIME`）而槽位固定 3 个，TAB 面板无激活入口 ⇒ **第 4 个及以后的技能彻底无法激活**；③ `owned[num-1]` 缺失时回落 `fallbackList(['deploy_cover','artillery'])` ⇒ 按隐藏的 3 号键会**实际触发 1 号槽的技能**（部署掩体）。此外弹种槽角标写死 1/2/3，与「数字键已归技能池、弹种走 Q/E」矛盾。
  - **修复（用户裁定口径）**：槽位改为 `player.skillSlots`（长度 3，玩家可指派）——新技能先自动填入空槽；**槽满时弹「选槽位」面板由玩家指定顶替哪一格**（循环复用），待指派技能进入队列逐个弹出，不静默丢弃；数字键**严格映射槽位、无 fallback**（#H4 消除隐藏键误触发）；专属键按钮仅在该技能未入槽时显示（#H3a 消除双按钮）；`Shift+点击`槽位可随时改指，面板 `Esc` 关闭并吞键（不误触发暂停/施放）；弹种槽角标改为纯选中指示（`●/○`），title 对齐 `Q/E`。
  - **效果**：7 个运行时技能键不再有「死键」——超出 3 个时由玩家决定谁上槽；任一技能都至少有一个可见入口。

- **验证（三链）**：`npm run check` **EXIT=0**（含 `tsc --noEmit`）/ `npm test` **EXIT=0**——`test-modifiers` 新增 #H1 段 7 项断言（2026-10-04 实测；`enemyAnchorBase` 已定义、**强弱玩家下封顶系数逐值相同**、`applyEnemyAppearanceAndStats` 传玩家基准不改变敌军 base、缺 `strongest` 时天花板有确定值），并把原 #A16 段 4 项断言重锚到新键名与固定基准。
- **浏览器四链**：`npm run test:browser` **四链 ALL PASS、EXIT=0**（97 PASS / 0 FAIL）。`test-browser-r4.cjs` 新增 **E 段 10 项 #H 回归断言**：布雷确认后入冷却 / 冷却中拒绝 / 第二次雷场可再生成、`btnG`/`btnH` 不重复显示、槽满弹选槽位面板、玩家指定顶替、槽位循环复用不产生重复入口、空槽按数字键不触发、数字键 3 精确命中第 3 槽。
- **实机对照（同 seed、无升级 vs 五项升级买满）**：`node0.difficulty` 0.15 → 0.15、节点难度序列完全相同；玩家穿深 160→185（对照组，确认升级确实生效）；敌军穿深 112.47 → **112.47**、伤害 31.551 → **31.551**、血量 80.36 → **80.36**（完全不变）。
- **遗留（不记为问题）**：敌军速度仍每辆有 `randFactor(0.85~1.15)` 的独立随机浮动（与玩家无关，属难度设计内的个体差异）；`enemyAnchorBase` 的绝对量级为中位中坦取值，若实机体感偏易/偏难应调该表（而非回退玩家锚定）。
- **文档同步**：`specs/combat.md` 新增 §12（敌军数值基准与技能槽指派体系）；`docs/ISSUES.md` #H1~#H4 按生命周期归档（`archive/2026-09.md` + `ARCHIVE.md` 索引）。

### 4.41 2026-10-01 敌人难度数值调优（用户裁定 3 项：速度上限↓ / 血量↑含 Boss / 升级略快）

> 现行细则归口 `specs/combat.md` §13.4（敌人数值乘子与极速封顶）、`specs/map.md` §16（难度成长曲线）、`specs/boss.md` §5（Boss 血量倍率）；参数唯一口径 `js/tank_rules.js` 的 `RULES.difficulty` 与 `RULES.boss.tuning`。

- **用户裁定（三项）**：① 降低敌人**速度上限倍率**；② 提高敌人（**包括 Boss**）**血量**；③ **略微提高敌人升级速度**（敌人随节点推进变强更快）。口径经用户确认：作用于**正式游戏随节点推进的敌人强度**（节点难度 `diff` → `entityMults`），**不是** bench「Enemy Lab 等级 Lv.」曲线（`js/tank_panels_core.js` `enemyLevelMults`，本次未动）。
- **改动（纯参数变更，公式结构未改）**：

  | 参数 | 沿革 | 现行 | 效果 |
  |---|---|---|---|
  | `RULES.difficulty.curvePow` | 1.25 | **1.20** | 越接近 1 中段难度越高 ⇒ 敌人升级更快；端点不变（index 0 = 0.15 / index ≥ 12 = 0.95） |
  | `RULES.difficulty.entityMults.maxHp` | [0.45, 1.4] | **[0.5, 1.7]** | 血量低难度端 +11%、满难度端 +21% |
  | `RULES.difficulty.entityMults.maxSpeed` | [0.7, 1.15] | **[0.7, 1.0]** | 满难度极速上限倍率 −13%；普通敌人被 `speedVsBaseline` 封顶覆盖 ⇒ 主要作用于 Boss |
  | `RULES.difficulty.speedVsBaseline.baseCeil` | 0.6 | **0.5** | 普通敌军极速上限系数（`baseFloor 0.3` 不变 ⇒ 低难度速度不变、曲线更平） |
  | `RULES.boss.tuning.hpMul` + 5×`bosses/*.json` | 8 | **9** | Boss 血量（5 份 boss 定义自带 `tuning.hpMul` 覆盖缺省，两侧同改） |

- **同步的回退默认值（防脱离 RULES 的纯函数走旧值）**：`js/tank_map.js` `difficultyForIndex` 缺省块（curvePow）与 `entityMultsForDifficulty` 回退表（maxHp/maxSpeed）；`js/tank_model.js` `difficultyCapMuls` 的 `speedVsBaseline` 缺省字面量（baseCeil）。
- **实测增幅（2026-10-01 探针，脚本用后即删）**：普通敌人血量 **+14.5%（index 0）→ +20.4%（index 8）**；普通敌人极速上限（高难度、含每辆 `randFactor` 上限 1.15）**82.8 → 69.0 px/s**；Boss 血量 **+28.8% ~ +35.5%**（高于普通敌人幅度，对应「包括 Boss」的裁定）；难度曲线中段 index3 0.29 → 0.30、index6 0.49 → 0.50、index8 0.63 → 0.64。
- **验证（三链）**：`node scripts/check-html.js` **EXIT=0（All checks passed）** / `node node_modules/typescript/bin/tsc --noEmit` **EXIT=0** / `npm test` 全链 **EXIT=0**（含 `test-map` 新增「升级速度基线」断言：`curvePow === 1.20`、`index3 === 0.30`、`index6 === 0.50`；`test-panels` 速度封顶断言重锚 **72 → 60 px/s**）。`npm run test:browser` **待正常环境补跑**（沙箱内 `spawn EPERM`，见 `sandbox-verify` skill）。
  - **同轮顺带修复**：`scripts/test-cards.js` 块内重复 `const model = require('../js/tank_model.js')` 触发 `tsc` **TS2300 Duplicate identifier**（由前序会话未提交改动引入，非本次改动），改为复用文件顶部 require ⇒ `npm run check` 恢复 EXIT=0。
- **归口与生命周期**：`specs/combat.md` 新增 §13.4 并改写 §13.1 现行值（`baseCeil 0.5`，原处留沿革）；`specs/map.md` 新增 §16；`specs/boss.md` §5 血量 ×9 + 沿革；测试同步 `test-map` / `test-panels` / `test-modifiers`。本次无 `PLAN.md` / `ISSUES.md` 条目需删除或归档，故不产生归档分卷条目。

### 4.42 2026-10-01 #J 批次：地雷可连布（#J1）+ 换装不继承（#J2）+ 视野退役（#J3）+ 导弹反馈（#J4）

> 现行细则归口 `specs/combat.md` §13.5（视野距离系统退役）·§13.6（地雷可连续布设与主武器换装重置）·§4 副武器条目（导弹口径与反馈）。

- **用户反馈（四条）**：① 地雷在 1 个节点内似乎只能部署 1 次；② 获得电磁炮后再获得其他主炮，似乎会继承可穿透弹药的特性；③ **裁定**「改为全屏幕渲染敌人，不再计算视野距离的问题。敌人 AI 是否被触发维持为距离 + 是否有直线视野（建筑或草丛、树冠等）」；④ 导弹无法发射（附带指出卡面未写明「伤害跟随 HEAT」）。

- **#J1 地雷只能布 1 次 → `mineMax` 3→6、硬上限 8→12**
  - **根因**：`mineMax`（**场上同时存在**的地雷数上限）恰等于单次雷场数量 `mineFieldCount`（均为 3），首轮雷场即把上限用尽；地雷存续 30~45s、单节点战斗远长于此 ⇒ 后续雷场全部被 #F6 的「超限拒绝」判据拒收。**口径澄清**：`mineMax` 是同时在场数，不是本局总数。

- **#J2 换装继承 `pierce` → 换型安装先重置为新类型基准**
  - **根因**：`js/tank_cards.js` 主武器 `install` 用 `Object.assign({}, 旧 stats, overrides)` 合并，**旧武器专有键被带进新武器** —— 最典型的是 `railgun` 的 `pierce`/`pierceDmgMul`（`js/tank_fire.js firePrimaryShell` 据此赋予贯穿能力），实测换上 `double_barrel` 后仍 `pierce=1 / pierceDmgMul=0.6`。
  - **修复**：换型时先 `getWeaponDefaults('primary', wType)` 重建基准再合并卡牌覆写；同型安装保持合并语义（幂等，不丢 `tanks/*.json` 自定义值）。副武器 install 原本就构造新对象，无此缺陷；两条路径共用新增的 `_weaponDefaultsResolver()`。

- **#J3 视野距离系统整体退役（改为全屏渲染）**
  - **退役范围（不留死开关）**：`js/tank_camera.js` 的 `visionRadiusForViewport`/`visionCenter`/`visionClamped`；mvp 的剔除逻辑（`entityHiddenByVision` 保留同名函数恒返回 `false`）、视野虚线圈、`visionRadiusEff` 的卡牌加成与屏幕相对计算；dev 面板「无视野」开关（`tank_devpanel.js` + mvp/bench 接线 + `types/globals.d.ts`）；两张视野卡 `support_commander_periscope`（+15%）与 `sniper_commander_sight`（+25%）按 2026-09-23 A 档死效果卡先例删除，`PASSIVE_KEYS` 移除 `commander_sight`（**卡池 168 → 166**）。
  - **现行口径**：敌对实体一律渲染、一律可被命中，只剩 `aabbInView` 视口剔除（纯性能）。`tank_fire.js` 的 `hiddenByVision` 命中剔除钩子一并移除（否则「看得见却打不中」）。`RULES.vision` 仅作历史配置留档。
  - **明确不受影响（用户要求的第二半）**：AI 接战判定一直是 **「距离 + 直线视野」**——`RULES.ai.engageRequiresLoS` + `js/tank_ai.js` 的 `hasLoS`，遮挡由 `js/tank_cover.js hasLineOfSight` 按掩体的 `vision: true` 键判定（建筑/岩石/树/灌木/倒树遮视线；栅栏/沙袋/残骸/水/泥/路不遮）。

- **#J4 导弹「无法发射」→ 实为激活后零反馈 + 状态残留**
  - **核实（两条都成立）**：导弹**本身能发射**（条件为「炮塔 ±30° 扇形内、600px 内、持续锁定 1s」，实测对准后 `shots:1`）；真缺陷是 `_missileActivated` 激活后**UI 零指示**（锁定指示器仅在 `_missileLock` 存在时绘制），炮塔没对准或目标在射程外时既不发也不提示。
  - **附带状态残留缺陷**：`_missileActivated` 是**开关态**，换掉副武器时未复位（主循环的 `type==='missile'` 门控只是不再推进它）⇒ 实测「激活 → 换成布雷器 → 再装回导弹」会在玩家没按 F 的情况下**自动索敌并发射**。
  - **卡面/规格不一致**：代码实现「伤害跟随当前 HEAT 弹种系数」（`getEffectiveHeatAmmoKey` → `computeAmmoConfig`），卡面只写「伤害 140」；`specs/combat.md` §4 原写「手动击发沿光标直飞、不自动寻的」（#A21 旧口径）与 §8.2 的「激活→锁定→自动发射」互相矛盾。
  - **修复**：HUD `btnF` 加「索」（已激活未锁定，琥珀脉动 `.lock-hunting`）/「n%」（锁定中，绿色 `.lock-on`）+ `title` 写明条件；激活后 0.6s 仍无目标 → 一次性提示**缺哪一条**（射程内无敌人 / 炮塔未对准）；激活日志写明条件；换装复位 `_missileActivated`/`_missileLock`/提示标志；两张导弹卡面同步写明锁定流程与 HEAT 跟随；`specs/combat.md` §4 改为现行口径并标注 #A21 旧口径作废。

- **验证（三链）**：`npm run check` **EXIT=0**（含 `tsc --noEmit`）/ `npm test` **EXIT=0** / `node scripts/validate-content.js` **EXIT=0**——`test-cards` 新增 #J2 段 7 项；`test-rework-r2` 新增 #J1 段 6 项；`test-camera` 删除原 #H5/#K1 视野圆断言段（被测对象已不存在），保留 `aabbInView` 与 `minZoom`。
- **浏览器四链**：`npm run test:browser` **四链 ALL PASS、EXIT=0**。`test-browser-r4.cjs` 新增 **F 段 10 项 #J 回归断言**（地雷同节点连布 2 轮 / 电磁炮换装不继承 pierce / 视野剔除恒 false 且 LoS 原语仍在 / 换装复位激活态 / 无目标「索」+ lock-hunting / 日志说明原因 / 对准 lock-on 并发射）；`test-browser-smoke.cjs` P-39 段由「R×zoom 恒定」改写为**退役断言**（`visionRadiusEff` 恒为名义常数、不随 zoom 补偿；无隐藏实体）。
- **遗留（不记为问题）**：`RULES.vision` 四键（`radius`/`bias`/`inner`/`screenRadiusRatio`）保留为历史留档并仅供调试钩子 `__TEST__.visionZoom()` 读取，不再参与任何判定；若后续确定无调试价值可整键删除（届时同步 `test-browser-smoke` P-39 探针）。
- **文档同步**：`specs/combat.md` 新增 §13.5/§13.6 并改写 §4（导弹）与「视野系统」段；`docs/archive/2026-10.md` 新建（本批次为该分卷首条）+ `ARCHIVE.md` 索引与分卷列表登记。

### 4.43 2026-10-01 #M 接战机动随机化（敌人接近玩家时的多形态轨迹 + 开火节奏）

> 现行细则归口 `specs/combat.md` §13.7（唯一口径：机动类型/权重、偏角与行程随机、短停与开火节奏、装填期偏置、不覆盖语义、回退开关）。

- **用户裁定**：「敌人接近玩家时，要有多种行为：直线/斜线/曲线行进或后退，行进时/短停后开火，其行进的角度、距离、短停的时间也随机，以增加随机性。」
- **问题定位（实测）**：改前接近轨迹单一——`js/tank_ai.js` 按单点 `engage`(520px) 决策 `dist>engage→move=1`，**恒定直线冲脸**；偏航仅来自 #83 peek（±0.5rad 单帧叠加）与 #88 侧摆（装填期 ±0.78~1.57rad），都不是持续轨迹，开火时刻也只由装填结束决定 ⇒ 整簇敌人同节奏逼近。
- **实现（`RULES.ai.maneuver` + `js/tank_ai.js` `_maneuverRoll` / `_applyManeuver` / `_maneuverReloadGap`）**：
  - 敌人接战时懒分配**机动脚本**（挂 `t._mv`），一次随机决定**类型 + 偏角 + 行程 + 短停时长**，走完/超时即**重掷**；五类：`direct` 直线 / `slant` 斜线 / `curve` 曲线 / `arc` 弧线绕行 / `retreat` 后撤。
  - 偏角与行程分档随机；曲线 `sweep` 与起始偏角**反号** ⇒ 偏角穿过 0，轨迹 **S 形回正**而非单向甩开。
  - 每段结束按 `holdChance` 进入**短停**：短停中 `move=0` 但炮塔照锁敌、可开火 ⇒ 形成「行进时开火 / 短停后开火」双节奏；短停结束瞬间放宽开火容差 `resumeAimTolMul` 再收回，与 `reactionJitter` 叠加错开齐射。
  - **装填期偏置承接 #88**：装填前段改用偏置权重（压低直冲、抬高侧向）并压为微速蠕行；**普通敌人的装填期躲避由此统一承担，旧 `sideSwing` 仅保留 Boss 路径**（沿革：#88 原对普通敌与 Boss 均生效）。
- **刻意不覆盖的语义**：① 已在射程内（`baseMove===0`）保持原地驻停，「进入射程即停下开火」不被随机化推翻（**沿革：被 §4.44 修订并收窄**——初版仅保护 `baseMove===0`，`baseMove<0` 的退让曾被覆盖；§4.44 起判据改称「交战带」，驻停与退让一律确定性）；② **Boss 与 SPG 定距车不启用机动层**（角色定位为始终推进/保持距离）；③ `flank`/`coverSeek`/`stunned` 优先；④ 脱离接战即 `t._mv = null`。
- **回退**：`RULES.ai.maneuver.enabled = false` 完全退回改前直冲语义。
- **实现期修正的三处缺陷（均由测试暴露，非推测）**：`_MV_RNG` 初版存 `Math.random` **引用**导致测试的随机替换失效（改惰性求值）；`reloadGap` 未传入 `_maneuverPickMode` 使装填期权重偏置失效；机动层一度覆盖 `baseMove===0` 的驻停语义（已按上条①收窄）。
- **验证（三链）**：`npm run check` **EXIT=0**（含 `tsc --noEmit`）/ `npm test` **EXIT=0**（全链 0 项失败）/ `node scripts/test-ai.js` **全部通过**。新增 `#M 段 13 项` 断言；`#88 段` 改为断言「装填期抽到非 direct 机动 + 前进压为蠕行」，Boss 路径断言不变；滞回带断言由写死 `move===1` 改为状态不变量（机动后 `move` 可为 ±1 或 0）。
- **文档同步**：`specs/combat.md` 新增 §13.7；本条为 §4 正文延续（编号 4.43）。

### 4.44 2026-10-02 #N 交战结构重做（交战带 / 攻守分工 / flank 重写 / 分离力 / 来袭提示 / 装填脱离）

> 现行细则归口 `specs/combat.md` §13.8（唯一口径：6 个子系统参数、4 处实现期缺陷、量化对照表、回归清单）。

- **用户反馈**：「敌人全部尝试贴近玩家、又在屏幕边缘被动受击，玩家像打靶」→ 先给出诊断与方案（会话第一轮），再要求「再结合你建议的方案落地」。**用户裁定 2 项（2026-10-01）**：① 反打靶可见性**仅做玩家侧提示**（不给敌人加视口门控，保留 #J3「全屏可命中」口径与边缘压迫感）；② 实施范围 = 全部落地（交战带 / 攻守分工 / flank 重写 / 分离力 / 装填脱离）。
- **实现（6 项，配置全收口 `RULES.ai`，见 §13.8）**：
  1. **交战距离带** `engageBand`：单点 `engage/close` → 按类别 `[minRatio,maxRatio]×engage`（light/medium/heavy/spg 四档 + 车体尺度下界兜底）；`dist>max` 接近 / `dist<min` 脱离 / 带内驻停开火。heavy「只进不退」的 `moveLock` 角色特性保留。
  2. **攻守分工** `squad` + 新模块 **`js/tank_ai_squad.js`**（纯逻辑、可 Node 测）：节点级协调器每 0.6s 按「距离/LoS/血量」评分 + 角色粘性，分配 `press`（压上，名额 2~4 随难度）/ `flank` / `hold`；`hold` 走 `holdGate` 射界门控。协调器只写 `t.aiRole`，不产生位移。
  3. **flank 重写** `flankRewrite`：站位点改为**玩家为圆心的定点扇区站位**（半径 = 交战带外沿 ×1.15、方位 ±60°~120°、按实体稳定哈希分左右），进入时锁定、到位转 press。旧 flank 分支降级为回退路径。
  4. **群体分离力** `separation`：同类（180px）+ 玩家（108px×0.7）线性衰减斥力 → 相对朝向的 ±1 转向偏置，**仅作用于 press**。
  5. **视口外来袭方向提示** `threatIndicators`：筛选「已接战 + 视口外 + ≤engage×1.4」前 6 条，mvp 画**琥珀色边缘箭头**（与无人机红箭头区分）。纯玩家侧信息层，不改任何 AI/命中判定。
  6. **装填脱离** `retreatReload`：装填期中距离退到掩体背弹面，与 #76 C6 `coverSeek`（重甲残血）构成两条独立退避通道。
  - **回退**：5 个子系统各自 `enabled` 开关，全关即回到 #M 及更早的单点直冲行为。
- **实现期修正的 4 处缺陷（均由量化探针 `scripts/diagnose-ai-crowd.js` 暴露，非推测）**——这是本轮最值得留档的部分：
  1. **退让被机动层覆盖**：#M 初版只保护 `baseMove===0`，`baseMove=-1` 的退让被机动层 `move=+1` 覆盖 ⇒ 退着退着又贴上。→ 机动层收窄为**只接管 `baseMove>0`**。
  2. **旧 `repos`（#83）在驻停帧复活**：守卫条件 `!maneuverOn` 依赖逐帧变化的 `baseMove`/`role`，驻停帧为真 ⇒ `repos` 重新接管 `move` 随机 ±1 冲向玩家。→ 改为**静态判据** `legacyMicroOn`（仅 Boss / SPG 定距车 / 整体关闭机动层 走旧 `sideSwing`+`peek`+`repos`）。
  3. **flank 站位「棘轮内移」**（最隐蔽的一处）：站位半径 0.95×engage 落在交战带**内侧**，且站位点按当前方位角**每帧重算**（目标绕玩家转 ⇒ 螺旋内收），叠加 0.6s 角色重排 ⇒「当 flank 内移、转 press 驻停」逐次逼近（实测 700→395→**273px**=带内沿）。→ 站位点**进入时锁定一次** + 半径改以 `band.max×1.15` 为基准（恒在带外）+ `roleStickiness` 抑制横跳。已加防复发断言。
  4. **分离力干扰 flank 定点到达**：斥力改写 `turn` 使敌人进不了 `arriveDist` 圈，持续前进螺旋贴脸。→ 分离力**仅作用于 press**。
- **量化对照（决策层探针，同初始态势：6 辆环形 700px、30 秒、固定随机种子）**：

  | 指标 | 改前 | 改后 | 变化 |
  |---|---|---|---|
  | 同时压上（press）车辆数 | 6.00 | **2.00** | −67% |
  | 近身圈内（≤engage×0.9）敌人数 | 0.71 | **0.00** | −100% |
  | 最近敌人距离 | 447px | **522px** | +17% |

  ⇒ 「全员贴脸」与「一拥而上」同时消除。`fanout` 3.33→1.87 属预期：改前六辆均匀包围（全方位压迫），改后 2 压上 / 3 驻守 / 1 绕行 ⇒ 玩家不再同时面对所有方向。
- **新增/修订测试**：`scripts/test-squad.js` **新增 25 项**（已接入 `npm test` 链）；`scripts/test-ai.js` 新增 **#N 段 26 项**（两项计数均为 2026-10-04 实测 `ok()`），旧 flank 断言改为「回退路径」语义（`flankRewrite.enabled=false` 下验证），滞回带断言改为状态不变量。
- **验证（三链，2026-10-02；2026-10-04 复核）**：`npm run check` **EXIT=0**（含 `tsc --noEmit`）/ `npm test` **EXIT=0**（全链 0 项失败）/ `npm run test:browser` **四链 ALL PASS、EXIT=0**。
- **文档同步**：`specs/combat.md` 新增 §13.8 并给 §13.7 的被修订项加沿革注记；`js/tank_ai_squad.js` 已按加载顺序接入 `tank_mvp.html`（在 `tank_ai.js` 之前），`types/globals.d.ts` 补齐 **14 个** `declare`（`js/tank_ai.js` 侧 7 + `js/tank_ai_squad.js` 侧 7；2026-10-04 实测）。
- **2026-10-04 复核修正（文档↔代码一致性审计 + 死代码清理）**：对 §4.41~§4.44 / `specs/combat.md` §13.4~§13.8 / `specs/map.md` / `specs/boss.md` 逐条比对代码后修正 6 项：
  1. **死配置清理（4 键，无任何消费方）**：`engageBand.breakAwayTurn`、`flankRewrite.distMinRatio`/`distMaxRatio`、`retreatReload.holdAfterArrive` —— 四键在 `js/tank_rules.js` 声明但全仓无消费者，其中 `breakAwayTurn` 的注释还描述了并未实现的行为并引用了 §4.44 中不存在的内容。按 2026-09-23 A 档死配置清理先例**整体删除**（行为零变化；flank 的触发本由 #N2 角色评分决定、无距离窗口，到位后原地还击亦为无条件行为）。
  2. **死钩子清理**：`js/tank_fire.js` 的 `hiddenByVision` 命中剔除钩子与其在 mvp `fireCtx` 的注入补齐删除（#J3 声明「不留死开关」但当时漏删）——该钩子注入的是恒 `false` 的 `entityHiddenByVision`，属纯死开关；`entityHiddenByVision` 函数本体**保留**（渲染剔除调用点 + `__TEST__` 探针，`test-browser-r4` F3 仍断言其恒 false）。至此 §13.5/§4.42 所述「钩子已移除」与代码一致。
  3. **魔数收口**：分离力的玩家斥力半径原为硬编码 `radius × 0.6`，新增 `RULES.ai.separation.playerRadiusMul`(0.6) 收口（与力度权重 `playerFactor` 语义区分：前者管半径、后者管力度）。
  4. **保留项核对（非缺陷）**：`RULES.ai.retreatReload.hpGate`(0.0) 与 `classProfiles`/`tierProfiles` 等开关有明确消费者，仅默认值使其不生效，不属死配置。
  5. **文档计数实测更正**：`test-ai.js` #N 段 30→**26** 项、`test-squad.js` 24→**25** 项、`test-modifiers` #H1 段 6→**7** 项、`types/globals.d.ts` declare 9→**14** 个、`RULES.vision`「三键」→**四键**（键名本列了 4 个）。
  6. **文档措辞更正**：`resumeAimTolMul` 原写「放宽后再线性收回」，实为**单帧峰值**（无衰减逻辑），§13.7 与 `js/tank_ai.js` 注释同步改写；分离力「玩家（×0.7，半径 108px）」混淆半径与力度两个系数，改为分别引用 `playerRadiusMul`/`playerFactor`。
  7. **沿革注记补登**：`specs/combat.md` §10.2 / §11.1 / §11.4 / §11.5 四节仍把已退役的视野距离体系标为「现行口径」，补加「已被 §13.5（#J3）取代，仅作沿革」注记（§11.5 原仅有 #K1 注记）。
  8. **编号重叠说明**：`docs/ISSUES.md` 归档清单中 `#H1~#H5`（2026-09-21）与 `#H1~#H4`（2026-09-30）为**两个批次共用编号**，与 `AGENTS.md` §2「编号不复用」相悖；因归档原文按纪律不可回改且编号已被 §4.40 与 §13.1~§13.4 交叉引用，采取**保留原编号 + 按批次日期与主题区分**并就地加说明。
  - **复核验证**：`npm run check` **EXIT=0** / `npm test` **EXIT=0**（0 项失败）/ `npm run test:browser` **四链 ALL PASS、EXIT=0**；`node scripts/diagnose-ai-crowd.js` 数字与 §13.8 对照表逐格一致（6.00→2.00 / 0.71→0.00 / 447→522px / 3.33→1.87），确认上述清理**行为零变化**。

### 4.45 2026-10-04 P0 审计跟进（flaky 测试修复 / LICENSE / README / CI）

- **背景**：第三方视角代码审计指出 4 项 P0 仓库卫生问题（无 LICENSE、无 README、无 CI、flaky 测试中断 `npm test` 链），本批次逐项落地。
- **flaky 测试修复**（`scripts/test-ai.js`）：#M 机动随机化后两处断言仍写死 `move === 1`（「超过接战距离→靠近」与 F 段「tier0 带外沿→接近」），机动层掷出 `retreat`/`hold` 时约 1/4 概率失败。复现：连续 12 次运行 6 次失败（`move=-1`）。修复：改断言为接战不变量——`aiEngaged === true` + 机动脚本已分配（`_mv` 非空）+ `move ∈ {-1,0,1}`（与 4b 段滞回带断言先例一致：接近机动 ±1/0 均合法）。分布实测（300 次采样）：curve/arc/slant/direct 下 `move=1`、retreat 下 `move=-1`，`engaged` 恒为 true。修复后连续 25 次运行 0 失败。
- **LICENSE**：新增 MIT（Copyright (c) 2026 qi）。公开仓库此前无许可，他人 technically 无权使用/贡献。
- **README.md**：新增（项目简介、快速开始五页入口表、三链验证命令、目录结构、文档入口指针、MIT 声明）。
- **CI**：新增 `.github/workflows/ci.yml`（push/PR/workflow_dispatch；Node 20+22 矩阵；`npm ci` → `npm run check` → `npm test`）。`npm run test:browser` 需系统 Edge，未纳入 CI，合并前本地手动跑。
- **验证**：`npm run check` EXIT=0 / `npm test` 全链 EXIT=0（0 项失败）/ `test-ai.js` 25 连跑 0 失败。

### 4.46 2026-10-04 P1：npm test 改独立运行 + 汇总（run-tests.js）

- **背景**：§4.45 审计跟进指出 `npm test` 的 41 文件 `&&` 长链任一失败即中断后续，且看不到整体通过率。
- **实现**：新增 `scripts/run-tests.js`——逐个子进程独立运行（失败不中断后续），每项打印 ✓/✗ + 耗时，失败项附输出尾部（25 行），最后输出汇总表（通过/失败数、失败清单、总耗时）；退出码 0=全绿、1=有失败、2=无匹配。支持按文件名关键词过滤（`node scripts/run-tests.js ai`）与 `RT_EXTRA` 追加调试文件。`package.json` 的 `"test"` 改为 `node scripts/run-tests.js`（单行 diff）。
- **验证**：全量 `npm test` EXIT=0（41/41 通过）；失败路径用临时 exit(1) 文件验证：汇总正确列出失败项且 EXIT=1；`npm run check` 不受影响。

### 4.47 2026-10-04 CI 首跑失败修复（run-tests.js 类型错误）

- **背景**：§4.46 落地后 GitHub Actions 首次运行即失败（Node 20/22 双 job），均倒在 "Syntax + typecheck" 步骤。根因：`scripts/run-tests.js` 的 `r.error.code`——`spawnSync` 的 `error` 类型为 `Error`，`checkJs` 下直接访问 `.code` 触发 TS2339。本地当时未重跑 `npm run check` 即推送，漏检。
- **修复**：JSDoc 转型 `/** @type {any} */ (r.error).code` 读取 code。`npm run check` 本地 EXIT=0 复验通过。
- **教训**：新增/修改 `scripts/**` 后必须重跑 `npm run check`（tsconfig `checkJs` 覆盖该目录），不能只跑 `npm test`。

### 4.48 2026-10-05 C 档 batch 1：小地图条带化

- **背景**：用户拍板启动 C 档（2026-10-05）。按 `docs/PLAN.md` §3.8 分批计划开工 batch 1；其中「视野口径改锚定接战距离」已于 2026-09-23 被用户裁定否决（`docs/PLAN.md` §4），本批次**只做小地图条带化**。
- **问题**：strip 节点（≈10 屏 × 2.2 屏）按旧等比适配（`minimapLayout` 取 min 缩放）会退化成 ~20px 细线（`docs/PLAN.md` §3.6 风险 #5），推进进度不可读。
- **实现**（`js/tank_minimap.js`）：`minimapLayout(worldW, worldH, mmW, mmH, opts?)` 按世界宽高比自适应——≤2.5 走旧等比适配（行为零变化，常规节点不受影响）；>2.5 进条带模式：横向占满框宽（`sx = mmW/worldW`，推进轴保真、两端精确映射框左右缘），纵向按 `STRIP_Y_BOOST=2.5` 拉伸后垂直居中（纵向示意性不保真）。`worldToMinimap`/`worldRectToMinimap` 改走 `sx/sy` 双轴；`scale` 字段保留（=sx）兼容旧调用方。`drawMinimap` 内三处 `layout.scale` 改为 `sx/sy`（世界边框、出口区）。
- **口径同步**：`docs/specs/map.md` §14.4 小地图条目由「设计预留」改写为现行口径（已落地注记）；§14 其余条目仍为预留。
- **验证**：新增 `scripts/test-minimap.js`（18 断言：常规回归/阈值边界/条带占满/拉伸/居中/推进轴保真/视口矩形/opts 覆盖/旧字段兼容），已注册进 `scripts/run-tests.js`。`npm run check` 待全量复验（与坦克涂装批次合并跑）。

### 4.49 2026-10-05 坦克历史涂装（名实相符贴图）

- **背景**：用户要求「为现有的坦克绘制一些符合其名称的贴图」。坦克为程序化绘制（`js/tank_paint.js` TEXTURE_DEFS 叠层体系，非图片贴图），故以新增历史涂装键 + 逐车指定实现。
- **实现**（子代理并行，主代理验收）：TEXTURE_DEFS 新增 4 键（仿照既有 `camo`：固定 blob 坐标、确定性、ellipse 半透明叠层，clip 到部件多边形内）——`camo_dunkelgelb`（深黄底+橄榄绿/红棕色块）、`paint_panzergrau`（装甲灰单色+明暗变化）、`camo_nato`（北约绿底+棕/黑色块）、`paint_soviet`（苏军保护绿单色+明暗变化）。分配：tiger-I/hummel→`camo_dunkelgelb`、panzer-IV→`paint_panzergrau`、Leapard_1→`camo_nato`、Obj 780→`paint_soviet`（dummy 保持 rust）。同步 3 处：`js/tank_schema.js` TEXTURES 枚举、`js/tank_model.js` 注释键列表、`scripts/test-tanks.js` 兜底键；设计器 `textureSelect` 下拉 + allowlist + 注释同步。
- **验证**：`npm run check` EXIT=0；`npm test` 42/42（含新增 `test-minimap.js`）；视觉验收——自包含 file:// 验证页经 `makeTank`/`applyTankConfig`/`paintPartTexture` 真实管线渲染 5 车缩略图，4 种新涂装图案各自可辨、无绘制异常（底色为 teamColor 体系主色，叠层保持之，符合既有设计）。

### 4.50 2026-10-05 C 档 batch 2：`generateStrip`（片拼接生成器）

- **背景**：`docs/PLAN.md` §3.8 batch 2。只产出布局（covers/w/h），不接 `makeNode`/实战（防线生成与敌人布置是 batch 3）。
- **实现**（`js/tank_nodegen.js`）：
  - `generateStrip(difficulty, options)`：`advanceAxis` 参数（§14.7；本批次仅实现 `'x'`，其他抛错）；`stripScreensX/Y` 缺省 10/2.2（§14.1，不做精确绑定）；`chunkCount` 缺省按 ≈3.5 屏/片估算；`scaleFor` 必传（生产传 `tank_map.nodeScaleFor`，片内 scale 沿用现行口径）；`templateIds` 可逐片指定（测试用）。
  - 批量发牌：每片一次 `generateNode`（`centerX/Y=0`，`roadOpts.requireWETrunk: true`），片宽为模板自然宽度（`tpl.w × scale`），总长 ≈10 屏（实测 9.0 屏）。
  - 纵向裁剪：片高（≥3 屏）> 目标高（2.2 屏）时按中心丢弃带外元素，不做坐标压缩。
  - 密度补偿：带外 `structure`/`foliage` 钳制回界内（80px 边距 + SAT OBB 重叠检测，命中则放弃）；`ground`/`liquid` 不钳制。实测 ≈20/屏（≥ 现状 13）。
  - 接缝净空：内部片边界 ±300px 带内移除 `structure`/`foliage`，保留 `ground`/`liquid`（`STRIP_SEAM_CLEAR`）。
  - `placeRoadNetwork` 新增第 6 参数 `opts.requireWETrunk`（additive；拓扑掷骰后若无 W→E 干道则补一条正交横干，端点严格落左右边界线，§10.1 口径）；`generateNode` 新增 `opts.roadOpts` 透传。缺省关闭，既有 7 拓扑零回归（test-strip 断言同 seed covers 一致）。
- **口径同步**：`types/globals.d.ts` 新增 `NodeGenOptions.roadOpts`、`StripGenOptions`、`generateStrip` 声明，`nodeScaleFor` 签名收紧；`docs/specs/map.md` §14.2 逐条标注已落地（未接入实战）。
- **验证**：新增 `scripts/test-strip.js`（18 断言）：拼接确定性/seed 敏感/尺寸/裁剪/接缝净空/每片横向贯通干道/密度≥10/连通性≥0.999/38px 通道≥0.999/零回归/参数校验。**「最窄通道 ≥38px」操作化说明**：`nodeLayoutMetrics` 原始 minGap 对装饰性贴靠对极敏感（常规节点基线仅 1~3px），故以「阻挡掩体按车体半宽 19px 膨胀后连通性 ≥0.999」验收（3 seed 实测 0.9997~1.0）。
- `npm run check` EXIT=0；`npm test` 43/43 全绿（含新增 `test-strip.js`）。

### §4.51 C 档反馈修复批（2026-10-05）：接缝公路贯通 + 历史涂装体系 + 路面净空
- **接缝公路连续**：`placeRoadNetwork` 新增 `opts.weTrunk = { entryT }`——强制一条 W→E 贯通路，入口 t 衔接上一片出口 t；`generateNode` 回传 `weTrunk`，`generateStrip` 逐片传递。首片复用拓扑自带横干（避免重复）。`test-strip.js` 新增链式断言（出口 t = 下一片入口 t）。
- **历史涂装体系**：`TEXTURE_DEFS` 4 历史涂装新增 `base` 实色；`paintPartTextureDirect` 车体填充/细节线改取 `tankBodyColor()`（base 优先），队伍色退出车体，仅保留描边/血条/小地图标识。履带统一深钢色，炮管/炮盾取实色深阶。`getCachedTankSprite` 缓存键改按实色（同纹理跨队伍共享）。
- **体积感**：`paintPartTextureDirect` 新增顶光→底阴纵向渐变；`paintTurretShadow` 加硬投影（炮塔剪影平移填充）+ 软阴影加深，偏移 7,9→9,12，炮塔/车体区分明显。
- **路面净空（#A11 修订）**：模板物品避路豁免取消（原 #77「建筑优先于路」），压路时沿法线最小推出，推不出才删；ground tier 豁免。strip 密度补偿钳制时亦避路。实测侵入 29→3~4 处（0.1~2.4% 边角轻擦）。
- **附带修复**：`test-map.js` 河流锚点越界豁免（预存 bug，段坐标才是实际几何）；`test-nodegen-calibration.js` 基线两次重标定（避路致通道变宽，符合预期）。
- `npm run check` EXIT=0；`npm test` 43/43 全绿。

### §4.52 C 档反馈第二批（2026-10-05）：暗色勾线 + 路网水系 strip 一体化
- **暗色勾线**：`tank_battledraw.js` 车体/炮塔/炮塔基座环/转向极限虚线圈的亮色描边（`t.color`/`shade(t.color)`）全换为暗色 `'rgba(15,15,18,0.60)'`；删除车体前装甲斜边与炮塔前颊的加粗亮边（方向由车体箭头+炮管表达已足够）。队伍识别只走血条/小地图。
- **G1 切线连续（后被一体化取代）**：`buildFromPoints` 新增第 5 参数 `tan1`——首个控制点沿 tan1 方向放置，使样条在 p1 处切线与给定一致；`generateStrip` 逐片传递 `exitTan→entryTan`。实测相邻片出口切线夹角最大 25.7°（≤45° 通过）。后因路网改 strip 一体生成，此链式机制退役（保留 `tan1` 参数供单节点调用）。
- **公路 strip 一体化**：`generateStrip` 增加规划 pass（每片 tpl/scale/cw/x0/seed 预算，`totalW` 累加）；`stripRng` 一次调 `placeRoadNetwork`（虚拟模板 `{w:totalW,h:stripH}`，`{requireWETrunk:true, trunkAmp:0.03}`）；每片按 x 区间裁路网转片内帧，经 `roadOpts.externalRoads/Junctions/RoadW` 传入 `generateNode`（片内跳过自生成，仅避让；路面由 strip 统一追加）。`generateNode` 回传 `weTrunk` 字段保留（单节点模式仍用）。宽幅模板下拓扑曲线振幅致段出界被裁——后处理补缝：在无路面接缝处按最近 road y 补水平直段。`test-strip.js` 6b/6c 改写为一体化断言（接缝两侧有路面、路网横跨 ≥80% 条带宽、河流横贯）。
- **河流水系 strip 一体化 + 提频**：新增 `placeStripRivers(rng,totalW,stripH)`——每条 strip 必生成 1–2 条横向蜿蜒河流（正弦 meander，段重叠 30% 保连通），贯穿整条 strip（旧 `edgeRiver` 模板标签在 strip 模式下跳过，避免重复+接缝断开）。路河交叉处切出缺口放 `bridge`（缺口宽=路宽+40，桥不压河——游戏内 river 的 passability=0.4 会把桥上坦克推出）。建筑避让（#A11）扩展至河流（`avoidCovers = 道路+河流`）。接缝净空豁免 `bridge`（基础设施）。
- **连通性口径对齐**：`nodeLayoutMetrics` 的 `isBlocked` 旧实现把一切非 ground 当墙；对齐 `tank_cover.js` 游戏口径（阻挡 = `passability===0` 或 `shellBlock`）——river/water 的 0.4 是减速通行（AGENTS.md §4），不阻断。`test-nodegen-calibration.js` 第三次重标定（urban_block d=0.7 连通性 0.875→1.000）。
- 细则归口 `docs/specs/map.md` §14（C 档 strip）。`npm run check` EXIT=0；`npm test` 43/43 全绿。改动未 commit/push（等 qi 回电脑审查）。
- **后续修补（同日）**：河流河段改短段曲线铺设（~120px 步长带角度，替代 800px 砖块段）；村庄/林地/沿路建筑/路口沙包避让列表统一为 `avoidCovers`（道路+河流），修复建筑/岩石压河；路河交叉改"河段被桥替换"（不再切分长段）；strip 路网出界路段严格过滤（整段须在界内，`segInBounds` 只查中心）；沿最长横干每 ~1200px 加短岔路（24 条，`strip-branch`），丰富路网细节。
- **三河形（同日）**：`placeStripRivers` 按种三选一——H2 双横贯（反相蜿蜒）、H1T（横贯干流+支流汇入/湖）、V 纵贯（1~2 条）。湖改凸包 blob（仿 centralPond），支流止于湖边、末端收分（1.0→0.55）汇入干流；P-20 per-node 矩形水体在 strip 模式禁用。
- **热点驱动管线（同日，用户四步架构）**：
  1. 热点：每 ~4000px 一个敌方生成热点（`hotspots`，玩法先行）；
  2. 中心线：路网拓扑 + 三河形水系；无交叉的热点修次要路（T 形接主干道，`hs-secondary`，夹角≥45°），保证每热点都是路网节点；
  3. 范围：道路/河流/湖泊带宽度（既有）；
  4. 范围外生成：模板项对河流严格跳过（零容忍），对道路保留推挤（保建筑数）；林地簇 itemBoxes 用旋转包络；最终后处理删除一切压水实体——四 seed 实测压河 0。
- **桥梁机制（同日）**：桥必须垂直于河流中心线（`bridgeDir = riverDir + 90°`，`riverDir` 取 ±200px 河段局部平均方向，避免单段抖动）；两侧公路加过渡段平滑连接（夹角>15°时）；桥是路（`tier:'bridge'`，`destructible:2`，hp=2）；河-路（桥）夹角<45°时留涵洞（河段跳过，路不断）【已取代：见本节末"河流连续性修复（同日，seed 700）"】；**只有射击桥梁侧面（长边，炮弹方向与桥长轴夹角≥45°）时才被击中**，沿长轴射击穿过不拦截（`tank_fire.js`）。
- **路河分离（同日）**：H2/H1T 横向河选 Y 时避开路密集带（`roadYDensity` 直方图 + `pickClearY`）；平行重叠（<30°且近距）>30% 则重选 Y（最多3次，`parallelOverlapRatio`），避免平行重叠。
- **次要路不过河（同日）**：`hs-secondary` / `strip-branch` 在河流生成后删除穿越河段者（主干道可经桥跨河，次要路绕行）。
- **删除湖泊（同日）**：不再生成湖元素——H1T 湖（`hasLake=false`）、模板水潭（`centralPond` strip 模式跳过）、村庄水塘（`village-pond` 禁用）。四 seed 实测 water=0。
- **平行主干道去重（同日）**：两主干道平行（<15°）、X 重叠、Y<100px 时只保留较长一条，避免路口-端点间 2 条公路冗余（如 seed 100 的 t0/h2）。
- **河流连续性修复（同日，seed 700）**：`placeStripRivers` 两处 `continue` 会跳过整个河段——①涵洞逻辑（桥-路夹角<45°时跳过河段）、②桥间距检查（<900px 时 `continue`）；长距离平行/近距公路可使连续 30+ 个河段被跳过，seed 700 实测 strip-river-0 断裂 3783px（31 个河段缺失）、strip-river-1 间隙 930px、全图 0 桥。修复：**删除涵洞跳过逻辑，河流必须连续**；桥间距不足时不建桥但保留河段（路下可涉水，`js/tank_nodegen.js` ~L2906/L2931/L2938）。seed 700 复测两条河最大间隙 89px（正常段间距），连续 ✓；`npm run check` EXIT=0。本条取代上文"桥梁机制"中的"夹角<45°时留涵洞（河段跳过）"结论。

### §4.53 整车精灵替换通道 + 设计器对齐 UI（2026-10-06）
- **背景**：免费贴图包路线被 qi 否决（Kenney 太卡通、jh2assets 许可不明、CraftPix 禁再分发、Poly Haven 风格不搭）→ 改由 AI 生成 5 辆车整车俯视精灵（车体+炮塔分离，舱盖全关），走 `assets/tanks/<id>_{hull,turret}.png`。
- **数据**：`tanks/<id>.json` 新增可选 `sprite` 块——`{ enabled, hull:{img,scale,dx,dy,rot}, turret:{img,scale,dx,dy,rot,pivot:[px,py]} }`；scale=模型单位/图片像素，dx/dy=部件局部帧偏移（+x 为前），rot=叠加旋转（度），pivot=炮塔图片像素旋转中心。5 车默认 scale 按多边形包围盒长度/图片宽预计算，`enabled:false`（对齐后由 qi 手动开启）。
- **局内**：`js/tank_paint.js` 新增 `spriteImage`（Image 缓存，Node 安全）+ `paintPartSprite`（共享绘制：中心/旋转/偏移/轴心）；`tank_model.js applyTankConfig` 深拷贝透传 `sprite`；`tank_battledraw.js drawTank` 顶部加分支——`sprite.enabled && 图片就绪 && !ammoBlew` 时走 `drawTankSprite`（车体精灵对准坦克原点随 hullAngle、炮塔精灵 pivot 对准座圈随炮塔角，另补地面软阴影），否则回退程序化绘制（首帧/殉爆飞头不穿帮）。
- **设计器**：`tank_designer.html` 右侧新增「整车精灵 Sprite」面板——「游戏中启用精灵」开关（写入 JSON）、「画布显示精灵」开关（仅预览）、车体/炮塔各 缩放/位移X/Y/旋转/轴心（炮塔） 数字控件、「按多边形自动对齐」按钮（包围盒重算缩放、清零位移旋转、保留轴心）；`designer.js` 的 `drawPolygon` 在精灵就绪时用图片替代纯色填充（描边/顶点/装甲色照常绘制以便对齐），`applyTankData`/`buildExport`/`syncSpriteInputs` 全链路读写。
- **类型**：`types/globals.d.ts` 补 `SPRITE_CACHE/spriteImage/clearSpriteCache/paintPartSprite` 声明（checkJs 跨文件全局）。
- 架构注记 `js/tank_schema.js`（sprite 字段语义，设计器管理、不进 compare 页 FIELD_ROWS）；视觉规范归口 `docs/specs/editor.md` §6。
- `npm run check` / `npm test`（43/43）全绿。未 push（等 qi 指令；本地 master=fff2448 未推送）。

### §4.54 整车精灵四层管线对齐修复批（2026-10-06，#L1~#L7）

- **背景**：§4.53 的 sprite 块只写了 hull/turret 两层注释，但 HEAD（0ce935d）实际已扩展为四层（track/barrel/hull/turret）且 5 车 JSON 均带 `sprite.barrel`——对齐参数与运行时口径存在系统性分叉，开启精灵会穿帮。本批做像素级审计（IoU + 长宽比 + 安装点解算）后修复，**5 车 `enabled` 全部保持 `false`**（参数已修正，待目视确认后再开）。
- **对齐度实测（剪影 vs 装甲多边形）**：车体 5/5 良好（长宽比之比 0.92~0.99，IoU 0.90~0.95）；炮塔 3/5 良好（tiger-I 0.80 / Leopard_1 0.98 / Obj780 0.96），**panzer-IV 0.42 / hummel 0.50 为贴图本身不合格**（与边框连通的不透明近白残留分别占不透明像素 23.9% / 33.0%，且剪影长宽比与多边形差 1.32× / 2.15×）——后者须重新出图，参数无解（遗留 ISSUES #L8）。
- **#L1 精灵分支吞掉全部战斗视觉（最高危）**：`drawTank` 精灵分支早 `return`，把血条/重中型徽标/敌方 Lv.X（:778-801）、断履带（:460）、起火辉光（:480）、副炮塔（:463）、座圈（:466-474）、射界射线（:495-506）、附件（:748-776）全部跳过。修复：这些收尾视觉抽成共享函数（`drawTurretRing/drawTraverseRays/drawAttachments/drawTankHud`），断履带/副炮塔/座圈/辉光/炮塔投影阴影并入 `drawTankSprite` 的正确层级（车体之后、主炮塔之前），射界射线/附件/HUD 在两分支收尾统一调用。mock-ctx 回归实测：两分支 `arc` 数、血条矩形(46×7)、`Lv.X` 文本完全一致。
- **#L2 炮管安装点系统性偏移（5 车全部偏后 1.94~8.00 单位）**：设计器自动对齐用**未减 axis** 的原始炮塔顶点 `maxX×0.8` 写 `mountDx`，而运行时炮塔前缘是 `turretFrontDist()`（axis 归零后过中轴前缘交点）——弹道起点/炮口火焰按 `gunRoot()/gunTip()`（tank_fire.js:91）生成，与贴图炮管错位（hummel 偏 8.00 单位≈0.73m）。修复：`turretFrontDist` 的纯函数体抽成 `frontDistFromVerts`（tank_geometry.js 导出），设计器自动对齐换算到运行时帧后取 `mountDx = frontDist + embed`；5 车 JSON 的 `mountDx` 已按此重算（17.70/16.00/16.00/17.90/21.80），复测 **Δroot=Δtip=0.000（全 5 车）**。
- **#L3 设计器「读取→保存」删字段**：`normalizeSpriteBarrel` 只回填 8 个固定键、`buildExport` 只写这 8 个 → `imgHummel`/`imgPanzerIV`/`lenPxPanzerIV`（panzer-IV/hummel）被永久删除；`buildExport` 车体不写 `pivot`、履带不写 `rot` → hummel 的 `hull.pivot`、`track.rot` 被删。修复：normalize/buildExport 先浅拷贝原对象再覆盖面板管理字段，未知键全量透传。
- **#L4 每车专用炮管贴图死配置**：`spriteBarrelImages` 只读 imgStandard/imgAutocannon/imgRailgun，`imgPanzerIV`/`imgHummel`/`lenPxPanzerIV` 全仓库无消费者 → panzer-IV/hummel 一直在用 barrel-standard.png 拉伸。修复：统一为 `imgVehicle`（standard/clip/double_barrel 优先、autocannon/railgun 不越权；设计器预览同口径），两车 JSON 迁移，死键 `imgPanzerIV`/`lenPxPanzerIV`/`imgHummel` 删除。实测：panzer-IV standard→`barrel-panzer-IV.png`、double_barrel→两张专用图、无 imgVehicle 的车回退 imgStandard。
- **#L5 履带滚动方向相反**：程序化 `paintTracks` 用 `lineDashOffset=-phase`（链节随 phase 向 +x），精灵用 `x=x0-phase-tileLen`（向 −x）——同一 `trackPhase` 两通道反向。修复：精灵侧取 `+phase`，滚动周期改为整幅贴图宽（不硬编码 196，换贴图自洽；track-links.png 2548px=13×196px 整数倍首尾无缝）；设计器预览同步。
- **#L6 复用实体残留 sprite + Boss 缩放不覆盖**：`applyTankConfig` 的 sprite 拷贝是条件式的，切到无 `sprite` 键的配置（dummy.json）会残留上一辆车贴图；`tank_boss.js` 的 boss.scale 不缩放 `t.sprite` → 1× 贴图配 2× 判定框。修复：`applyTankConfig` 无条件赋值（无 sprite 置 null，实测切 dummy 后 `sprite===null`）；Boss 缩放同步 `sprite.*.scale/dx/dy` 与 `barrel.mountDx/mountDy/embed/gap`（`pivot` 为图片像素坐标不缩放；`track.scale=0` 自动推导哨兵保持 0）。
- **#L7 设计器预览默认开启误导**：`spritePreview` 默认 true，未对齐（或贴图带残留白底）时叠加直接盖住多边形，顶点/装甲无法判读。修复：默认 false（对齐时手动勾选），面板提示同步。
- **B 档参数重算（可修的 3 个炮塔 + 5 个车体）**：按「剪影包围盒中心 ↔ 多边形包围盒中心重合」口径重算——tiger-I 炮塔 `scale 0.023988→0.02542`、`pivot [774,640]→[929.4,640]`（IoU 0.795→**0.903**）；Obj 780 炮塔 pivot→[860.1,567]（0.962→0.984）；Leapard_1 炮塔 pivot→[750.3,566.5]（0.981→0.991）；5 车车体 scale/dx/dy 按同口径微调（IoU 变化 −0.018~+0.020，在噪声内）；panzer-IV/hummel 炮塔参数**不写**（贴图须重做，写了对数值也是错的）。
- **四层管线文档归口**：`docs/specs/editor.md` §6 重写整车精灵条目（四层字段表、对齐契约、回退条件、收尾视觉共用、设计器保留未知键）；`js/tank_schema.js` 架构注记同步（`imgVehicle`、mountDx 对齐契约、#L1/#L3 口径）。
- 验证：`node scripts/check-html.js` EXIT=0；`tsc --noEmit` EXIT=0；Node 单测 **44/44**（沙箱下 `npm test` 的 `run-tests.js` spawnSync EPERM，逐脚本独立跑全绿；`test:browser` 四链需系统 Edge 待正常环境补跑）；专用脚本回归 #L1/#L2/#L4/#L6 全部断言通过（Δroot=Δtip=0.000 × 5 车）。
- 遗留：**#L8**（panzer-IV/hummel 炮塔贴图须重新出图：正俯视、无残留白底、长宽比贴近多边形、内容居中——重做后按同口径重算 pivot/scale 即可）；5 车 `sprite.enabled` 仍为 false，待目视确认。

### §4.55 设计器精灵绘制层序修复 + 贴图白底清理（2026-10-08，#M1~#M3）

> 来源：用户反馈（会话）——① 设计器中炮塔贴图被车体遮住（程序化纹理同问题）、炮管贴图似乎没正确加载；② panzer-IV / hummel 贴图里有没清干净的白色部分。

- **#M1 设计器绘制层序错误（炮塔被车体遮住）**：`designer.js render()` 里 `drawPolygon(state.turret,…)` 排在 `drawPolygon(state.hull,…)` **之前**，车体的精灵贴图/程序化纹理/纯色填充（0.85 alpha）整块盖在炮塔之上；`drawPreviewSpriteBarrel` 同处该块内，故炮管精灵也被车体盖住（表现为「炮管贴图没加载」）。修复：层序改为与局内 `drawTank` 一致——履带 → **车体 → 炮塔 → 炮管**（`designer.js` render 三处调用重排）。座圈/轴线/顶点手柄等编辑辅助标注仍绘制在最上层（不影响可编辑性）。
- **#M2 设计器炮管贴图「不加载」**：两处成因——① 上述层序问题（被车体遮挡）；② `spriteImage()` 只在首次调用时创建 `Image` 并立即返回未就绪对象，而设计器 `render()` 仅在交互时调用、**无逐帧循环**，图片异步解码完成后无人唤醒重绘 ⇒ 首帧之后永远不显示。修复：新增 `preloadSpriteImages()`——载入坦克 / 勾选「画布显示精灵」/ 改炮管路径时预热全部精灵图片缓存，并给未就绪图片挂 `load → render`（`error` 时 `pushHint` 报路径）。另补「本车专用炮管」输入框与显示行（此前面板无 `imgVehicle` 入口，改不了本车专用炮管）。
- **#M3 贴图白底清理（初版，其两处缺陷已被 §4.56 修正）**：新增 `scripts/clean_sprite_bg.py`——标记近白像素（max RGB≥170 且通道差≤34），从**图片边框**洪泛只穿过近白像素得到「背景板」连通体，板核 alpha→0、边界 1px 羽化。初版清理量见 §4.56。**已知缺陷**：① 只做「边框连通」，漏掉被轮廓包围/夹在两块装甲之间的白底岛；② 边界 `alpha=128` 羽化作用于本为**二值 alpha** 的源图，在深色战场上留下白色辉光边。——**均已在 §4.56 修正**。
- **形状判断已由 §4.56 撤回**：本节初版称 panzer-IV_turret / hummel_turret「形状不合格、须重新出图」，其中 **hummel_turret 的「上下两块」经用户 2026-10-08 澄清为设计如此（中间过炮管），属误判**；两车炮塔真正的问题是**对齐参数偏小**（见 §4.56）。IoU 数字对 hummel 亦不适用（中间是透明炮管槽）。
- **验证**：`node scripts/check-html.js` EXIT=0；`tsc --noEmit` EXIT=0；Node 单测 **44/44**（沙箱下 `npm test` 的 `run-tests.js` spawnSync EPERM，逐脚本独立跑；`test:browser` 四链需系统 Edge 待正常环境补跑）。设计器修复用 mock-DOM 执行**真实 designer.js** 断言（12/12 通过）：实际 `drawImage` 序列 `track-links → tiger-I_hull → tiger-I_turret → barrel-standard`（车体在炮塔之前、炮管在炮塔之后）；设 `imgVehicle` 后绘制专用炮管图；关闭预览后不叠加精灵；**未就绪图片 fire('load') 触发 17 次绘制调用**（证明 `onload→render` 生效）、预热缓存命中不重复创建。
- 文档归口：`docs/specs/editor.md` §6 补设计器层序与图片预热口径。

### §4.56 贴图白底清理修正 + 炮塔对齐参数重算（2026-10-08，#M4；取代 §4.55 的 #M3 与形状判断）

> 来源：用户反馈——「hummel_turret.png 是上下两个互不相连的物体没有问题，炮管架在中间，尝试清理白色部分」。即澄清 §4.55 的形状判断有误，要求继续清白。

- **hummel 结构澄清（撤回 §4.55 误判）**：用户指出 `hummel_turret.png` 上下两块是**设计如此**（中间过炮管）。实测证实：内容段 y=3..214 与 y=326..538，中间 **111px 透明 gap（y=215..325，中心 y=270）**，与内容中心（271）一致。§4.55「两个不相连物体 = 须重做」的结论**作废**。
- **#M4 清理判定重写（修正 §4.55 #M3 的两处缺陷）**：
  1. **漏清白底岛**：初版只从**图片边框**洪泛，漏掉「被坦克轮廓包围」或「夹在两块装甲之间的炮管槽」里的白底。hummel 的 78064px 白像素正是**填在炮管槽中的白底**——不清掉，炮管就透不出来。
  2. **自造羽化伪影**：初版给边界写 `alpha=128`，而这些源图本是**二值 alpha**（半透明像素实测为 **0**），羽化在深色战场上形成白色辉光边。
  - **新准则（单一可达性，不会误伤本体）**：把「图片外部」定义为从边框沿 **透明像素 ∪ 近白像素** 可达的区域 → 可达的近白 = 背景（清除）；**不可达**的近白 = 被深色装甲完全包围的本体高光/浅色涂装（保留）。移除羽化，不再修改 alpha 中间值。
- **清理结果**：16 个贴图全部 `background: 0`（外部白清零）。主要量：`panzer-IV_turret` 190918px、`hummel_turret` 78064px(33.0%)、`barrel-railgun` 64066px、`barrel-hummel` 53518px、`tiger-I_turret` 31967px，各车体 0.2~0.4%。保留的「本体近白」（如 `tiger-I_turret` 26974px 的高光块、`hummel_hull` 7216px）均为装甲包围的内部细节。
- **炮塔对齐参数重算（两车此前显著偏小）**：清理后重算剪影，发现旧 scale 把贴图画小了 18%~29%——

  | 车/部件 | 旧 scale | 旧映射长度 | 新 scale | 新映射长度 | 多边形长 |
  |---|---|---|---|---|---|
  | hummel turret | 0.03413 | 18.5 单位 | **0.048059** | 26.0 | 26.0 |
  | panzer-IV turret | 0.0201 | 23.0 单位 | **0.024476** | 28.0 | 28.0 |

  炮塔轴心同步改为内容中心：`hummel [293.0,273.0]→[293.7,271.0]`、`panzer-IV [690.0,603.5]→[630.0,444.5]`。重算后**全部 10 个部件**的「贴图内容映射长度 ÷ 多边形长度」= **0.999~1.000**；hummel 轴心纵向落在炮管槽中心（偏差 0.048 单位）；5 车炮管 `Δroot=Δtip=0.000` 保持不变。
- **方法论说明（重要）**：**IoU 不适用于中间带透明槽的贴图**。对 hummel 炮塔，形状正确的多边形覆盖「炮管槽」反而**降低** IoU；扫描出的"IoU 最优"（0.617）实际把轴心推离中心并放大到 1.35×，是错解。故改用几何准则：**映射长度 = 多边形长度**、**旋转轴 = 内容包围盒中心**（hummel 为炮管槽中心）。这也意味 `scripts/clean_sprite_bg.py` 的 `--dry` 报告与映射长度比、轴心偏差应作为对齐验收指标，而非 IoU。
- **验证**：`node scripts/check-html.js` EXIT=0；`tsc --noEmit` EXIT=0；Node 单测 **44/44**；资产 16/16 PNG CRC 校验通过且**半透明像素 = 0**；专项断言 16/16 通过（5 车炮管 Δ=0.000；10/10 部件映射长度比 0.999~1.000；hummel 轴心偏差 0.048 单位）。`test:browser` 四链需系统 Edge，待正常环境补跑。
- 遗留：5 车 `sprite.enabled` 仍为 **false**——参数与资产已就绪，待目视确认后开启。文档归口：`docs/specs/editor.md` §6 更新资产要求（允许「中间带炮管槽的多块炮塔」，白底判定改为可达性准则）。
