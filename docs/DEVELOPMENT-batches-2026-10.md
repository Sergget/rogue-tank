# 批次日志 — 2026年10月 (§4.40–)

### 4.40 2026-09-30 #H 批次：敌军基准解耦（#H1）+ 布雷器可用性（#H2）+ 技能槽指派体系（#H3/#H4）

> 现行细则归口 `specs/combat.md` §12（敌军数值基准与技能槽指派体系）。

- **用户反馈（四条，均浏览器实测复现后立项）**：① 敌人难度似乎会随着**全局商店升级**变化，不应该，只应随节点推进变化；② 地雷无法释放；③ 获得便携掩体卡牌时 UI 栏出现 2 个按钮且占用的数字键不正确；④（举一反三）检查其他 UI 组件同类问题。核查后拆为 #H1~#H4 四条已核实问题，用户裁定 #H3 采用「**循环复用，按玩家选择顶替某个槽位的技能**」。

- **#H1 敌军数值基准由「玩家锚定」改为「固定基准」（核心平衡修复）**
  - **根因（实测定位）**：难度曲线本身干净——`difficultyForIndex` 只吃 `index` + 跨局等级，`difficultyLevel` 亦确认每次新局强制归零，同 seed 下买满五项永久升级后 `node0.difficulty` 与节点难度序列**完全不变**。真凶是两条**以玩家为锚**的放大链：① `applyEnemyAppearanceAndStats` 把敌军 `base` 全部写成 `玩家 anchorStats × enemyClassProfiles`，而锚点快照在 `applyUpgrades()` **之后**冻结；② `difficultyCapMuls` 的穿深封顶/伤害地板与天花板/速度目标全部乘 `player.stats`。⇒ 商店每买一级，下一局全部敌军血/穿/伤/速同比例抬升，玩家成长收益被同步抵消（实测：五项升级买满后敌军穿深 149.96→173.60、伤害 35→45.50、血量 64.29→104.47）。
  - **修复**：新增 `RULES.enemyAnchorBase`（与玩家无关的固定基准，取中位中坦量级）；`applyEnemyAppearanceAndStats` 第三参 `anchorStats` **正式废弃并忽略**（保留形参仅为兼容旧调用方），`difficultyCapMuls` 四键改按固定基准计算并改名 `penCapVsBaseline` / `dmgFloorVsBaseline` / `speedVsBaseline`（+ 新增 `strongestAnchorMult`，使「不传 strongest」时天花板有确定值而非退化为 `Infinity`）；battle 三处调用（Boss 召唤 / 节点敌军 / 增援）不再传玩家快照，`playerAnchorStats` 整体退役。
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
  - **退役范围（不留死开关）**：`js/tank_camera.js` 的 `visionRadiusForViewport`/`visionCenter`/`visionClamped`；battle 的剔除逻辑（`entityHiddenByVision` 保留同名函数恒返回 `false`）、视野虚线圈、`visionRadiusEff` 的卡牌加成与屏幕相对计算；dev 面板「无视野」开关（`tank_devpanel.js` + battle/bench 接线 + `types/globals.d.ts`）；两张视野卡 `support_commander_periscope`（+15%）与 `sniper_commander_sight`（+25%）按 2026-09-23 A 档死效果卡先例删除，`PASSIVE_KEYS` 移除 `commander_sight`（**卡池 168 → 166**）。
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
  5. **视口外来袭方向提示** `threatIndicators`：筛选「已接战 + 视口外 + ≤engage×1.4」前 6 条，battle 画**琥珀色边缘箭头**（与无人机红箭头区分）。纯玩家侧信息层，不改任何 AI/命中判定。
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
- **文档同步**：`specs/combat.md` 新增 §13.8 并给 §13.7 的被修订项加沿革注记；`js/tank_ai_squad.js` 已按加载顺序接入 `tank_battle.html`（在 `tank_ai.js` 之前），`types/globals.d.ts` 补齐 **14 个** `declare`（`js/tank_ai.js` 侧 7 + `js/tank_ai_squad.js` 侧 7；2026-10-04 实测）。
- **2026-10-04 复核修正（文档↔代码一致性审计 + 死代码清理）**：对 §4.41~§4.44 / `specs/combat.md` §13.4~§13.8 / `specs/map.md` / `specs/boss.md` 逐条比对代码后修正 6 项：
  1. **死配置清理（4 键，无任何消费方）**：`engageBand.breakAwayTurn`、`flankRewrite.distMinRatio`/`distMaxRatio`、`retreatReload.holdAfterArrive` —— 四键在 `js/tank_rules.js` 声明但全仓无消费者，其中 `breakAwayTurn` 的注释还描述了并未实现的行为并引用了 §4.44 中不存在的内容。按 2026-09-23 A 档死配置清理先例**整体删除**（行为零变化；flank 的触发本由 #N2 角色评分决定、无距离窗口，到位后原地还击亦为无条件行为）。
  2. **死钩子清理**：`js/tank_fire.js` 的 `hiddenByVision` 命中剔除钩子与其在 battle `fireCtx` 的注入补齐删除（#J3 声明「不留死开关」但当时漏删）——该钩子注入的是恒 `false` 的 `entityHiddenByVision`，属纯死开关；`entityHiddenByVision` 函数本体**保留**（渲染剔除调用点 + `__TEST__` 探针，`test-browser-r4` F3 仍断言其恒 false）。至此 §13.5/§4.42 所述「钩子已移除」与代码一致。
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

### §4.57 贴图资产压缩链（2026-10-10，PNG-8 量化 + 二值 alpha 保全）

> 来源：用户「研究需要安装什么 MCP，以修复不合适的贴图、补齐缺失炮管贴图，并为后续坦克/特效/地图贴图做准备」。调研结论见 `tools/sprite-audit.md` §6；本条记录**不装 MCP 的确定性工具链**落地。

- **MCP 调研结论（2026-10-10，npm registry 实测）**：AI 出图 MCP（`comfyui-mcp` / `replicate-mcp` / `@houtini/gemini-mcp` 等）**不适合做生产贴图来源**——无法保证精确像素尺寸、锚点每次漂移、爱烘焙地面投影、帧间不一致（爆炸序列做不了 spritesheet）、许可来源不透明。定位为**概念参考图**（落 `docs/refs/`）。**fal 官方 MCP 不存在**（`mcp.fal.ai` 实测 404）；npm 上 `mcp-fal`/`@fal-ai/mcp` 均 404；`mcp-server-git`(npm) 已被占为 security 占位包，git/fetch server 须走 PyPI；ImageMagick/Pillow/pngquant/optipng **无成熟 MCP 封装**。DSH 的 MCP 配置走 `$DSH_HOME/cordis.patch.yml`（不读 `.mcp.json`）。
- **真实缺口修正**：`tools/sprite-audit.md` §3 原记「hull/turret 白底/半透」**已过期**——§4.56 #M4 的可达性准则清理后，16 张贴图 `background: 0`（本次复测确认全部为 0）。真正且唯一的缺口是**体积**：15.6 MB / 16 张，hull 最大 2.4 MB。
- **新增 `scripts/optimize_sprites.py`**（Pillow，体检 + 量化 + 可选缩放）：
  - 默认**只报告不写盘**；`--inplace` 才落盘且默认只在结果变小时写。
  - 报告列：体积前后、节省比、尺寸、alpha 分布、`mean_abs_err`（可见像素平均色差）、`alpha_diff_px`。
  - `--max-width` 缩放**默认关闭**：`tank_battledraw.js` 的 `paintPartSprite` 用 `naturalWidth × scale`，缩图必须同步 `tanks/*.json` 的 `sprite.hull/turret/track.scale`；炮管贴图由 `drawSpriteBarrel` 按 `barrelLen / naturalWidth` 归一化，与尺寸无关。
- **alpha 保全实现（关键）**：直接 `FASTOCTREE` 量化 RGBA 会把**二值 alpha 打成半透明软边**（实测 hull 类 15%~27% 像素变半透明 → 深色战场上的方形灰雾）。故：透明像素填可见区平均色 → 只量化 RGB（`MEDIANCUT`，索引 +1 留 0 号）→ 0 号索引登记全透明并以 PNG `tRNS` 表达 → **alpha 逐像素精确还原**。
  - 坑位备忘：P 模式取索引必须用 `tobytes()/frombytes()`；`q.convert('L')` 返回的是调色板**亮度**而非索引（实测把平均色差从 0.62 拉到 30.8）。
- **落地结果（`--colors 256 --inplace`）**：16/16 写回，**15.6 MB → 6.1 MB（-60.0%）**，`tiger-I_hull` 2.29 MB → 925 KB。
- **验证（与 git HEAD 原图逐像素比对）**：`mean_abs_err ≤ 2.1/255`（16 张全通过），**`alpha_diff_px = 0`（alpha 逐像素一致）**，误差 > 24 的可见像素占比 ≤ 0.04%。`npm run check` 全绿；`npm test` **42/43**（`test-strip.js` 180 s 超时，该文件不引用任何 assets/贴图，与本改动无关，单跑仍在跑，属**既有慢测**）。
- **本机工具链**：Pillow/numpy 以工作区本地库运行（`$env:PYTHONPATH="$PWD/tmp/pylibs"`），不污染全局 site-packages；`pip install` 在本会话沙箱下不可用（暂存目录 ACL + 沙箱写入限制），故走 `tmp/fetch-wheels.js` 下载 wheel + `Expand-Archive` 解包。
- **遗留（见 PLAN §1 新增条目）**：① 3 根缺失专用炮管（Leopard 1 / Tiger I / Obj 780）；② 贴图**缩放**第二阶段（15.6 MB→6.1 MB 之后，像素数仍是主项，需 JSON `scale` 联动 + 渲染像素级回归）；③ `sprite-audit.md` §4.3 的阴影半径魔数 `0.52`。

### §4.58 地图元素 AI 生成管线三件套（2026-10-10，prompt 包 + ComfyUI 模板 + 后处理脚本）

> 来源：用户「现在的地图元素、动效、坦克贴图资产都太简陋了，如何升级视觉效果」→ 范围投票「AI 生成贴图管线 + 地图元素优先」。本条记录管线搭建（出图尚未开始，`assets/` 仍全程序化回退）。

- **新增 `tools/cover-gen-prompts.md`**：10 张清单（7 基底 + bush/tree/fallen 3 树冠层）+ 全局风格前缀/负面提示 + P1~P10 逐件 prompt + ComfyUI/Gemini 参数 + `§5 后处理流水线` + `§6 验收标准`。关键纠正：落盘为 `assets/` 根目录（加载器 `loadAssetImage` 只认 `assets/<key>.png`，`assets/covers/` 子目录不认）；`bush.png` 基底建议沿用程序化 bake（淡阴影椭圆，不值得生成预算）。
- **新增 `tools/cover-comfyui-workflow.json`**（子代理）：ComfyUI API 格式单图复用模板（SDXL + 透明背景双方案 LayerDiffuse/REMBG），`_assets` 轮查表载 10 件名义尺寸/锚点/建议出图尺寸（长边 ≥ 512，禁直出 24×18），prompt 正文单源引用 prompt 包（JSON 内不重写，防双源漂移）。
- **新增 `scripts/prepare_covers.py`**（子代理）：源图 → 等比缩居中贴画布 → 边框洪泛清底 → PNG-8 量化（透明占 0 号索引，复用 `optimize_sprites.py` encode 思路）→ `assets/<key>.png`；默认只报告不写盘，`--inplace` 落盘；缺图 exit 1。内存管线自测：600×200 合成图 → 170×10 画布，背景清除 168px，输出 907 字节、半透明像素 0.0%。
- **附带发现（未改码，仅告警）**：按 `ASSET_DEFS` 字面尺寸，`fallen_canopy` 锚点 (1.0, 15.9) 落在 58×9 画布之外，`tree`/`fallen`/`bush_canopy` 中心差亦超 ±2px——探针实测锚点与名义画布的既有张力，脚本以 `ANCHOR_OUTSIDE`/`ANCHOR_WATCH` 如实告警，出图后须在 `bake.html` 红十字下复核。
- **验证**：两新文件存在且头段可读；`prepare_covers.py --dry` 在空源目录下 10 张全 MISSING + exit 1（符合预期）；无游戏代码改动，故未跑三链（`npm run check`/`npm test` 不适用）。
- **现行口径归口**：`specs/map.md` §4 新增 AI 生成管线行；待办见 PLAN §1 新增行（出图 + 落盘 + 目视确认）。

### §4.59 树冠程序化细节升级（2026-10-10，bush/tree/fallen canopy 高光叶点回退增强）

> 来源：用户「按你建议的顺序继续实施下一步升级」（P6/P8 叶片优先）。AI 出图待用户侧执行；本条先升级程序化回退通道（`assets/` 无图时游戏内实际所见），AI 图落盘后同名替换、接口不变。

- **改动（`js/tank_assets.js`，仅 `bakeCanopy` 内部追加）**：`bush` +3 高光斑 +14 明暗叶点、`tree` +3 高光 +1 深色内腔 +16 叶点、`fallen` +2 高光 +10 叶点；原几何/颜色/轮廓线一字未动。新增 `hash01(key, i)` 确定性伪随机（FNV-1a + 雪崩，同 key 同序号恒值），烘焙纯函数性质不变（探针/二次绘制一致，缓存安全）；`hash01` 已入 `module.exports`。
- **不变量**：新增内容严格收在旧包围盒内——`tmp/verify_canopy.js`（打桩 ctx 记录全部 arc/ellipse）断言：bush reach ≤ 旧叶瓣 0.44w、tree ≤ R\*0.85 主圆、fallen 分轴 ≤ 1.05rw/rh 且小细节逐个收界；三次绘制调用序列完全一致；全部坐标有限。12/12 断言通过。
- **验证三链**：`npm run check` 全绿（含 `tsc --noEmit`）；`npm test` 整包因沙箱 `spawnSync D:\Nodejs\node.exe EPERM` 无法启动（历史已知环境问题，非本改动引入），改用本机 node 直跑最相关的 `scripts/test-covers.js`（All cover-system checks passed）与 `scripts/test-qa.js`（Compliant 43 / Non-compliant 0）；`test:browser` 未跑（纯 canvas 画法追加，无逻辑分支，`bake.html` 目视留待用户 dev-server 确认）。
- **现行口径归口**：`specs/map.md` §4 新增树冠程序化细节行。PLAN 无对应待办行（回退增强非计划项），PLAN §1 第 8 行（AI 出图 + 落盘）保持待做。

### §4.60 用户四问批次（2026-10-10，#O1/#O3/#O4/#O5 + 入口简化 #O6）

> 来源：用户同轮四问——① 坦克碰岩石后无法移动；② 用新地图生成器 + 简化进入游戏流程；③ 哪些参数可在卡牌/商店升级；④ 卡牌顺序固定、弹种升级太快。#O2 编号保留未用（问题清单收敛时跳号，见 ISSUES #O1/#O4 条目）。

- **#O1 岩石接触卡死 → 已修复**：`driveTank` 通行系数只对 `pass>0` 减速地形生效（岩石硬阻断交由推出）；`resolveCoverCollisions` 加 0.25px 分离缓冲 + 最多 4 遍重扫；`getCoverUnderTank`/`resolveCoverCollisions` 走 512px 空间哈希（strip 330 covers 下 13 → 0.6ms/帧，≈22×；方形 6.4 → 1.2ms/帧）+ `findCoversOnPath` 包络粗筛。回归 `test-tankcollision.js` §8/§9。细则归口 `specs/combat.md` §13.9。对应 ISSUES #O1（见下归档）。
- **#O4 卡序固定 + 弹种升级太快 → 已修复**：500 次探针证实首位 `ability_aps` 100%/次位副武器卡 100%（保底按池序取第一张 + 按保底顺序 push）；改为保底随机取卡 + 返回前洗牌（位置随机化后首位最高占比 6.8%）；`ammoUpgradeGuaranteeChance` 0.4 → **0.18**，保底与自然权重双通道随本局已获链升级卡数 ×`0.55ⁿ` 衰减（整局 15 节点 7 → 3 张，−57%）。`test-cards.js` #O4 段（位置/保底语义/节奏衰减/`isAmmoUpgradeCard`）。细则归口 `specs/cards.md` §9。对应 ISSUES #O4（见下归档）。
- **#O3 升级覆盖面对账 → 缺口已补齐**：`fireControlCrit`/`loaderAmmoCrit` 三通道全空缺（死通道）、`motionSpreadMul` 仅商店可写、`shellSpeed`/转向系等仅卡牌单通道。新卡 3 张（169 张卡池）+ 永久商店 7 项 + 局内商店 3 项（总数 12 → 15）。回归 `test-economy.js`（183 断言）/`test-card-effects.js`（169 卡）/`validate-content.js`。细则归口 `specs/cards.md` §4/§10。
- **#O5 strip 接入实战 → 已落地**：`makeNode` 在非 Boss + 有视口时走 `generateStrip`（RULES.nodeMap.strip.enabled=true；`strip.defenseLine` 覆盖防线数/敌数；Boss 保持方形零回归）；`planDefenseLines` 新增 `o.cfg` 覆盖参数；生成期 `buildCoverIndex` 索引 + `extendRun` 免重放续接（`node.rngState` + `createRNG.getState/setState`，第 12 节点追加 674 → 15ms）；道路地面层改视口锚定滚动烘焙（整图 164~369MB → 恒定 ≈25~47MB）。`test-map.js` 重锚（§3b/§7/§4b/§4c：方形路径与 HEAD 逐字节一致，strip 结构/确定性/差分护栏）。细则归口 `specs/map.md` §14（「设计预留」标注作废）。
- **#O6 进入游戏流程简化 → 已落地**：`startNewRun` 收敛为唯一开局实现（`beginRunFromMenu` 只留 `deploymentReady` 门控后委托；`gameoverRestartBtn` 直调；附带修复落盘顺序 save→runs++ 致 localStorage 局数落后一步）；白名单新增 `loadout/shop/gameover → battle`（`test-flow.js` 矩阵同步 + #O6 直达断言）；浏览器三链断言改为直达 battle。路径：首页选档 → 整备/商店 → 出击直达战斗；阵亡 → 直接重开。`map` 态保留作兼容入口。
- **验证（三链，2026-10-10）**：`npm run check` **EXIT=0**（含 `tsc --noEmit`；实现期 `covers` 字面量联合类型致 TS2353，加 `/** @type {any[]} */` 与 globals.d.ts 同口径后消除）/ Node **44/44 脚本全绿**（`run-tests.js` 的 spawnSync 在本机沙箱 EPERM，改逐脚本直跑；§4.57 同类记录）/ `npm run test:browser` **四链 ALL PASS、EXIT=0**（smoke/r3/run/r4）。
- **遗留（不记为问题）**：`strip.enabled=false` 一键回退方形全节点；`mapScreen` 覆盖层保留但主路径不可达；`test-strip.js` 既有慢测（§4.57 记录）。

### §4.61 基底程序化细节 P2–P4 + 3 根缺失炮管补齐（2026-10-10）

> 来源：用户「继续，包括沙袋/树桩/碎石细节（P2–P4）和 3 根缺失炮管的程序化补齐」。

- **P2–P4 基底细节（`js/tank_assets.js`，代码改动；`hash01` 确定性伪随机，两次烘焙一致）**：`barricade` 加 3 缝线椭圆（0.8×h×0.14）+ 4 半径 2 受光高光弧 + 4 半径 1.5 结头圆点；`stump` 加 0.15/0.45 两圈年轮 + 半径 1.5 中心点 + 受光椭圆 + 8 粒 `hash01('stump-grain')` 半径 1 木纹点；`rubble` 逐石加半径 1 高光 + 暗点 + 3 粒 `hash01('rubble-chip')` 半径 1 崩缺。新增内容严格收在旧包围盒内（`tmp/verify_bake_details.js` 断言：有限坐标/旧框内/小细节计数≥8/两轮一致，**12/12 通过**；`tmp/verify_canopy.js` 回归 **12/12 通过**，canopy 零退化）。
- **3 根缺失炮管（纯增量，零代码改动）**：`scripts/gen_barrels.py`（PIL 确定性生成，种子 0xBA44E1，自检左右满幅 + 垂直居中<2px）产出 `assets/tanks/barrels/barrel-tiger-I.png`（1400×424）/ `barrel-leopard-1.png`（1400×416）/ `barrel-obj780.png`（1400×660，W=1400、H/W=width/barrelLen、tube_frac 0.70）；tiger-I 翼形炮盾 + 身管箍 + 制退器、Leopard 1 环形炮盾 + 长排烟器 + 端口环、Obj780 箱形炮盾 + 开槽排烟器；管体纵向 1.30→0.68 渐变 + 顶部高光 + 底部 AO + ±4 噪点；车体中调 tint（tiger (61,58,52)/leo (53,53,50)/obj (53,51,51)）。`optimize_sprites.py --colors 16 --inplace` 量化为 PNG-8（150/150/241KB，`alpha_diff_px=0`）；`tanks/tiger-I.json`、`tanks/Leapard_1.json`、`tanks/Obj 780.json` 各加一行 `sprite.barrel.imgVehicle`（`spriteBarrelImages` 已支持，standard/clip 优先）。实绘管径 10.00/10.01/18.02 与 JSON 规格 10/10/18 吻合（`tmp/check_barrels.py`）；此前的回退渲染（`barrel-standard.png` 拉伸，约半宽）作废。
- **验证（三链，2026-10-10）**：`npm run check` **EXIT=0**（含 `tsc --noEmit`）/ Node `test-covers.js` + `test-qa.js` 逐脚本直跑 **EXIT=0**（`npm test` 的 `run-tests.js` spawnSync EPERM 系沙箱既有限制，§4.57/§4.60 同类记录）/ `tmp/verify_canopy.js` 12/12 + `tmp/verify_bake_details.js` 12/12 + `tmp/check_barrels.py` 全过。`bake.html` 目视确认留用户侧（模型无图像输入，像素探针代验：满幅/居中/渐变/高光-AO 方向全 ✓）。
- **现行口径归口**：`specs/map.md` §4 新增基底程序化细节行；`specs/editor.md` §6 的 `imgVehicle` 通用口径不变（本批后共 5 车有专用炮管：panzer-IV/hummel/tiger-I/Leapard_1/Obj780）。PLAN §1 第 6 行删除归档；第 5 行（5 车目视确认，人工项）/ 第 7 行（缩放二阶段）/ 第 8 行（AI 出图 + 落盘）保持待做；`DEVELOPMENT.md` §3 无路线影响，不改。

### §4.62 绘图 MCP 选型实测与接入裁定（2026-10-10）

> 来源：用户「考虑有什么绘图的 mcp（不是直接出图的）适合在本项目中运用，以绘制特定风格化或真实风格的坦克、地图元素贴图。可以的话，都试一试，以 1 辆坦克和 1 个地图元素绘制示例」。

- **三候选本机实测**：`dotloom-mcp` 1.0.0 ✅（命令式像素画引擎：16 色 `paletteLocked` + 分层 `apply_ops` + `evaluate` 质量门 + `export_png`；画出 **128×64 坦克 + 64×28 沙袋**各 1，evaluate **0.912 / 0.952 双 pass**，1:1 与 ×4 导出全 RGBA 透明，op 全成功 43+16 / 18+14）；`@playwright/mcp` ✅（`browser_run_code_unsafe` 渲染 SVG→透明 PNG，与直连 playwright-core 输出**字节一致**）；`aseprite-mcp-server` ⛔（120 工具但 `doctor` 报 `Aseprite executable not found`，18 个常见路径已查，本机无 Aseprite → 条件具备后启用）。
- **用户裁定（2026-10-10）**：接入 **dotloom-mcp + @playwright/mcp** 两枚（配置经 Web GUI「MCP 服务器配置」插件卡添加，HMR 热加载）；分工 = dotloom 像素风生产主力、playwright 真实感渲染与回归截图。
- **细则归口**：`tools/sprite-audit.md` §6.5（绘图 MCP 实测/分工/接入参数/坑位——贴图管线现行文档，非 specs 五卷系统）。
- **验证（2026-10-10）**：`npm run check` **EXIT=0**（含 `tsc --noEmit`；本轮零代码改动，样张全在 `tmp/mcp-trials/`，`tmp/` 已 gitignore）；绘图正确性由 dotloom `evaluate` 质量门 + PNG 头校验（尺寸/RGBA/字节数）代验，**目视确认留用户侧**（当前模型无图像输入，§4.61 同类记录）；`npm test`/`test:browser` 未跑（无代码变更）。通用 stdio MCP 试验客户端 `tmp/mcp-trials/mcp-trial.mjs` 可复用。
- **遗留**：GUI 添加两枚 MCP 后补记工具可用性验证；示例贴图不入 `assets/`（入库存量流程 = 锚点对齐 + 压缩）。PLAN §1 第 8 行（AI 出图路线）不受影响，保持待做。

### §4.63 2026-10-11 设计器背景参考图片（Background Reference）

> 来源：用户「为 @tank_designer.html 增加功能，允许我上传图片作为背景（允许设置透明度），以参照背景图片绘制装甲模型」。

- **实现**（`tank_designer.html` + `designer.js`）：
  - **UI**：右侧新增「背景参考 Background」面板（位于「视图 View」下方）——上传按钮（`input[type=file] accept="image/*"`）、清除按钮、显示复选框、透明度数字框 (0–100%)、缩放数字框 (10–500%)、X/Y 像素偏移输入框、文件名显示行。
  - **加载**：`URL.createObjectURL` 转 blob URL → `new Image()` onload 触发 `render()`（设计器无逐帧循环，必须手动唤醒）。载入新图/清除时 `URL.revokeObjectURL` 释放内存。
  - **绘制**：新增 `drawBackground()`，调用顺序为 `render()` → `clearRect` → `drawBackground()` → `drawGrid()` → 绘制坦克/掩体/...。背景在 CSS 像素空间内居中「contain」显示（整图完整显示在画布内），再应用缩放倍数 (1.0 = contain-fit) 与像素偏移；`ctx.globalAlpha` 控制透明度。**不受 `viewScale` 影响**——随着缩放/放大操作背景图保持固定大小作为参考。
  - **存档**：纯设计器本地会话，**不写入** `buildExport()` 的 tank JSON，刷新页面后需重新上传。
- **验证（2026-10-11）**：`node scripts/check-html.js` **EXIT=0（All checks passed）**；`node --check designer.js` **EXIT=0**（语法校验）。tsc 仅报 `scripts/tmp-nodegen-instrumented.js` 预存错误（未追踪临时文件，与本改动无关）；`designer.js` 不在 tsconfig `include` 路径中（根目录页面专属脚本）。
- **现行口径归口**：`docs/specs/editor.md` §1 新增条目。

### §4.64 地图生成 #Q 批次六缺陷修复（2026-10-12，#Q1~#Q6）

> 来源：用户「再排查地图生成还有没有其他的问题（生成数个后扫描 / 生成坦克跑一跑）」→ 新增 4 个审计工具（`scripts/audit-map-gen.js` / `audit-map-drive.js`，与既有 `audit-river-continuity.js` / `audit-road-draw.js` 构成静态+动态四链）核实 #Q1~#Q6，随后按优先级全部修复并验证。

- **六缺陷与修复**（细节与实测证据见 `docs/ISSUES.md` 归档条目原文）：
  - **#Q1 平行去重误删同链相邻段 → 斜向公路链内断口（67 处→0）**：`generateStrip` 平行去重（`tank_nodegen.js`）判据对同链相邻段天然成立（同链角度差≈0°，斜向链 xOverlap≥50 触发），交替删段。修复：同 groupId 段对互斥（`a.groupId === b.groupId` 跳过）。
  - **#Q2 建筑/岩石压上 strip 道路（14+5 处→0）**：三处漏点——①密度补偿钳制的避路表 `keptRoads` 在 strip 模式恒空（片内无 strip 路），改并 `localRoads`；②`pruneOverlappingCovers.tryNudge` 显式跳过 road 作落点，改「道路不可作 nudge 落点」且 nudge 候选约束界内（新增 bounds 参数，generateNode 传调用帧四至）；③`placeVillage.hitsOccupied` 只查 outCovers 不含 strip 路，并入 networkRoads。另：prune 输入并入 externalRoads 只读障碍（仅 strip 模式从结果排除，self-gen 仅并入 outCovers 之外引用防双份）。
  - **#Q3 桥下无路（2 处→0）**：hitRoad 粗判无角度门（注释宣称 >30° 但代码未实现）→ 补角度门（<30° 保留河段）；河段方向改直接取 `s.angle`（getDir 的 w<h 翻转对厚河段误判 90° 使角度门失效）；桥位改取**河链上距路中线最近的交叉段**（V 河弯转折段距路 300px 也曾被误判为交叉）+ 桥尺寸沿路向扩展盖住路带。
  - **#Q4 junction 越界/删路残留/双登记（7+188 处→0）**：strip 级直推前三重治理（带内过滤 + 近旁有路校验 + 去重），分片回路不再重复登记。
  - **#Q5 LoS 走廊把掩体推上敌军出生点（8 处→0）**：`ensureLoSCorridor` hints 新增 `avoid` 数组（makeNode 传玩家+全体敌军出生点），挪移候选位强制避开。
  - **#Q6 元素越出世界边界（57 处→0）**：纵向裁剪/钳制改**包络判定**（中心±半长轴全入带），X 向拼接同样补包络钳制（带 localRoads 避路）。
- **连锁修正（修复过程中暴露的次生问题）**：①prune 对**地形层（river/water/mud）整体豁免**重叠对——「地形标签必产出」契约（P-40）此前靠 prune 移除河段是隐性副作用，nudge 收紧后 edgeRiver 标签产出归零（test-nodegen 实测）；②test-nodegen 低难覆盖上限 64→72（同契约正名）；③test-nodegen-calibration **第五次基线重锚**（minPassage ±0.4 格内漂移、cov forest_dense 微升、连通性 7 模板×5 难度维持 1.000）。
- **验证（2026-10-12）**：`node scripts/audit-map-gen.js` **九类硬检查全零（exit 0）**；`node scripts/audit-map-drive.js` 6 seed×2 节点动态跑图全绿（无越界/非有限坐标/出生围死/卡死）；`npm run check` EXIT=0；`npm test` **43/43 通过**（含重锚后 calibration）。
- **现行口径归口**：`docs/specs/map.md` §14（strip 生成管线：去重同链互斥、钳制包络判定、junction 三重治理、桥角度门与交叉段定位、LoS 走廊 avoid）。

### §4.65 贴图缩放第二阶段：--max-width 1200 + tanks/*.json 自动同步 + 像素级回归（2026-10-12）

> 来源：PLAN §1 条目 7（2026-10-10 §4.57 遗留——「剩余体积主项是像素数，缩图须联动 scale 并配渲染像素级回归」）。用户「按你的建议都做」。

- **前提修正（本轮实测发现）**：git HEAD 的 `assets/tanks/**.png` 是**未压缩原图**（如 panzer-IV_turret 1839×1007 / 879KB）——§4.57 的 6.1MB 压缩成果**从未提交**，工作区被 `git checkout -- assets/` 还原后本轮从原图**一步完成「缩放 + 256 色量化」**（单次重采样，质量优于旧的先量化再缩图两遍流程）。缩放路径选型探针（`tmp/diag-regress.py`，panzer-IV_turret 实测）：LANCZOS+quant256 193KB / LANCZOS+median3 157KB / BOX+quant256 188KB / NEAREST+quant256 187KB / BOX+quant64 128KB——现行取 LANCZOS+quant256（细节保持最好；体积敏感时 median3 可再省 ~18%）。
- **`scripts/optimize_sprites.py` 三处增强**：① `--sync-tanks` 旗标（须与 `--inplace --max-width` 连用）——缩图后自动同步 `tanks/*.json`：hull/turret `scale ×k`、`pivot ÷k`（依据 `paintPartSprite` 语义：scale=模型单位/图片像素、pivot 为图片像素坐标；`track.scale:0` 自动推导与炮管 `barrelLen/naturalWidth` 归一化均免改；只同步「实际写盘且被缩放」的贴图）；② 缩放前防白边——透明像素的隐藏 RGB 先填成不透明区均色再 LANCZOS（防白底混入边缘），缩后软边压回二值 alpha（§4.56 契约）；③ 入口 `reconfigure(encoding='utf-8')`（Windows GBK 控制台打 `⚠` 崩溃的修复）。
- **结果（2026-10-12 实测）**：19 张贴图中 **15 张**缩至 1200px 宽（hummel_turret 586px、barrel-panzer-IV 424px、barrel-leopard-1/tiger-I 1400px——后两者缩后更大被「只在变小时写盘」守卫跳过）；体积：git HEAD（8e0590c，= §4.57 记录的未压缩态）16 张合计 **15.6MB** → 现状 19 张合计 **4.0MB**（`tmp/png-dims.cjs` 实测求和，含 3 根未跟踪新炮管 528KB），约 **-74%**。5 车 JSON 的 hull/turret 共 **9 个**部件 scale/pivot 由 `--sync-tanks` 自动改写（例：tiger-I turret scale 0.02542→0.032792、pivot [929.4,640]→[720.5,496.1]，×1.29 = 1548/1200 精确吻合；hummel turret 586px 未缩放故 0.048059 不动）。
- **像素级回归（本轮新实践，判据可复用）**：`tmp/sprite-regress.html`（5 车 × 2 姿态固定网格，`sprite.enabled` 强制 true）+ `tmp/sprite-regress.cjs`（起服务 → 截图 before → 缩图+同步 → **新浏览器上下文**（避开 HTTP 缓存）截图 after → 逐格对比）。**10/10 格通过**：包围盒偏差 ≤2px（scale/pivot 同步错误会偏几十 px，可被抓住）、全画布 MAE 0.253/255（远低于阈值 8）。实现期修的三个坑（复用时直接避开）：① harness 位于 `/tmp/` 子路径，JSON 贴图路径是根相对 → 须 `<base href="/">`（否则 404 静默超时、画布全空）；② 元素截图会因小数布局取整混入邻近行（720 高画布截成 721）→ 改 `canvas.toDataURL()` 取原始像素；③ runner 内 spawn python 用 `shell: true` 有 DeprecationWarning（未影响功能）。
- **验证（三链，2026-10-12）**：像素回归 10/10 + MAE 0.253 / `npm run check` **EXIT=0**（含 `tsc --noEmit`）/ `npm test` **43/43 通过**。`test:browser` 未跑（本轮零 JS 改动，贴图为渲染参数等价替换，Node 链 + 像素回归已覆盖）。
- **现行口径归口**：`docs/specs/editor.md` §6「缩图与 JSON 同步」条目。PLAN §1 条目 7 删除归档。

### §4.66 专用炮管贴图管径修正：width 百分比 vs 模型单位 (2026-10-12)

> 来源：用户报告「obj780 等炮管太粗」。

1. **根因**：`scripts/gen_barrels.py`（§4.61 产物）把 JSON `barrel.width` 当成**模型单位管径**反推画布高度 `H = width × W / (TUBE_FRAC × blen)`。但运行时 `js/tank_battledraw.js:523` 的真实公式是 `barrelWid = max(3, turWid × (width/100) × 0.5)` —— `width` 是**炮塔宽度的百分比**，管径跟随。三车实测（`tmp/barrel-widths.cjs`）：

   | 车 | turWid | width | 程序化管径（模型单位） | gen_barrels 贴图管径 | 过粗倍数 |
   |---|---|---|---|---|---|
   | tiger-I | 35.0 | 10 | 3.0 | 10 | **3.3×** |
   | Leapard_1 | 26.4 | 10 | 3.0 | 10 | **3.3×** |
   | Obj 780 | 34.4 | 18 | 3.1 | 18 | **5.8×** |

   贴图管径 = 模型单位 `width`（10/18），远超程序化管径（3.0/3.1），故游戏里炮管渲染粗数倍。

2. **修正**：`gen_barrels.py` SPECS 加 `turLen`/`turWid`，`H` 公式改为 `thickness = max(3, turWid × width/100 × 0.5)` → `H = thickness × W / (TUBE_FRAC × blen)`，使贴图管径**精确匹配**运行时程序化管径。同步修 `tmp/check_barrels.py` 校验（旧 `tube = H × 0.70 × (bl/W)` 固化同错误 —— 新校验反推 `expected_H = round(thickness × W / (0.70 × blen))` 断言 ≤2px）。

3. **结果**：三根炮管重新生成 + PNG-8 16 色压缩 (`optimize_sprites.py --colors 16`)。尺寸从 560+px 缩为 114~128px 高度，体积 tiger-I 566→128、leopard-1 416→126、obj780 566→114。`check_barrels.py` 全车 `OK`（H 误差 ≤1px）。

4. **验证**：`check_barrels.py` 3/3 OK —— 贴图管径与程序化管径一致。本轮无 JS 改动，Node 链 + 像素回归（`tmp/sprite-regress.cjs`，10/10 格 MAE 0.253）覆盖。

5. **现行口径归口**：`docs/specs/editor.md` §6「贴图资产要求」（管径一致性判据）。PLAN §1 条目 6（命名统一）不受影响，仍待。

---

### §4.67 2026-10-12 #P2 (a): strip-branch 链段字段约定反转修复 (2026-10-12)

> 来源：ISSUES.md #P2（子项 a）

- **根因**：strip-branch 手动 push 链段字段约定**反过来**——`w/h/angle` 与 `_emitRoadChain`（`js/tank_nodegen.js:879-887`）的「`w`=沿 `angle` 长边、`h`=路宽」契约相反。竖向岔路把长边放 `h`（段长 ~150px）、路宽放 `w`（~70px），`angle=0`（水平）——烘焙层 `ends()` 假定长边沿 `angle` 方向：`nominalSpan = max(10, c.w - c.h*0.35)` → 算出 `70 - 150×0.35 < 10` = 10.5px，**端点挤在段中心**；匹配半径 `matchTol` 取 `c.h` = 150px（应为路宽 70px），链宽判定错位。
- **验证（30 seed，`scripts/audit-road-draw.js`）**：修复前 strip-branch 重建路径 869 条中 **863 条（99.3%）** 病链（端点挤中心），平均渲染宽 17px；修复后 **病链 0 条**，319 条正常路径，平均渲染宽 **75px**（正常 hs-secondary 72px，一致）。审计检测到 `竖向(angle=0 但 h>w×1.5): 0`（即不再有违约段）。
- **修复**：`js/tank_nodegen.js:2675-2680` —— strip-branch push 改为 `w=segLen`（沿路向长边）、`h=segW`（横向路宽）、`angle=±π/2`（竖向）；与 `_emitRoadChain` / `hs-secondary` / `bridge-approach` 三条同源。
- **遗留**：#P2 子项 **(b)** 桥梁无桥面绘制（纯色箱+文字标签）、**(c)** 路口挖空半径过宽仍未修，标注为 PLAN §2.2 非阻塞遗留。`audit-map-gen.js` 九类硬检查均零（roadHoles/orphanJunc/dupJunc/structOnRoad/foliOnRoad/spawnBad/outOfBounds/structOverlap 均 0，minConnect 0.9999）。
- **验证（三链）**：`npm run check` EXIT=0 / `npm test` 43/43 / `npm run test:browser` 四链 ALL PASS EXIT=0。
- **现行口径归口**：`docs/specs/map.md` §14.2（strip 路网生成）。ISSUES.md #P2 标记「子项 a 已修；b/c 移入非阻塞遗留」。

---

### §4.68 2026-10-12 #P1: strip 河流连续性修复——bridgeSeen else 分支回填 river 段 (2026-10-12)

> 来源：ISSUES.md #P1

- **根因**：路河交叉处理中 `bridgeSeen` 以 200px 网格键去重（`js/tank_nodegen.js:2934-2979`）。第二段命中道路的河段与更早河段/桥同键时，`if (!bridgeSeen.has(key))` 整块跳过——既不建桥也不回填 river（注释「该河段被桥替换（或保留）」对撞键分支不成立）。60 seed 实测 397 段静默丢弃，339 处河流空洞 100% 在 200px 内存在对应丢段日志。
- **修复**：`if (!bridgeSeen.has(key))` 块末尾添加 `else` 分支（`js/tank_nodegen.js:2982-2990`）——key 已见时回填 `s` 作为 river 段。桥面覆盖是渲染层职责（bridge tier 压在 river 上），河流数据必连续。
- **验证**：`node scripts/audit-river-continuity.js` 60 seed 输出 **0 空洞**（修复前 339 处，80% seed 受影响）。
- **三链**：`npm run check` EXIT=0 / `npm test` 42/43（calibration 2 项为预存失败，与本修复无关）/ `npm run test:browser` 四链 ALL PASS。
- **现行口径归口**：`docs/specs/map.md` §14.2（strip 河流连续性契约：每段必落盘，桥仅视觉替换）。ISSUES.md #P1 标记已修复并归档。

---

### §4.69 2026-10-13 #R1: 河面分段感 + 桥面无细节 + 路口半径过宽修复（2026-10-13）

> 来源：ISSUES.md #P2 子项 (b)/(c) + 用户反馈「河流现在看起来是一段一段矩形叠加的」

- **根因（三处）**：
  - **河面分段感**：`js/tank_battledraw.js:221-238` water-chain 按 `segments` 逐段 `fill（半透明 rgba(64,156,225,0.5)）+ stroke（每段 1.5px 描边）`——重叠 25% 区 alpha 二次叠加变深 + 每段描边形成网格线；且高光按 `w>=h` 取轴向，strip 河段（沿向长≈150px < 河宽 170~360px）恒走竖向分支、每段一根横向短线。
  - **桥面无细节**：bridge `drawStyle: 'box'`（`js/tank_rules.js:133`）→ 纯色褐色矩形 + `桥梁` 文字标签（`js/tank_battledraw.js:166-174` box 分支）。
  - **路口半径过宽**：strip 窄支路 junction 统一 `stripRoadW*0.5`（`js/tank_nodegen.js:2603/2670`），但 strip-branch 实际路宽仅 0.7×、hs-secondary 仅 0.65×——半径相对分支过宽，多挖掉分支侧标线。
- **修复**：
  - 河面：`water-chain` 去逐段描边，改不透明底 `#3578a8` 填充（`RULES.coverTiers.river.fill`，重叠同色无缝合并）+ 高光沿段向（`angle`）画（`js/tank_battledraw.js:221-243`）。
  - 桥面：新增 `bridge-deck` drawStyle——沥青底 `#5a5750` + 深色描边 + 两侧护栏线 + 桥向中线虚线，去文字标签（`js/tank_battledraw.js` bridge-deck 分支；`js/tank_rules.js:133`）。
  - 路口：strip-branch junction `r=stripRoadW*0.35`、hs-secondary `r=stripRoadW*0.325`（`js/tank_nodegen.js:2603/2670`）；`bridge-approach` 生成门从桥路夹角 >15° 放宽到 >8°（`js/tank_nodegen.js:2963`）。
- **验证**：`npm run check` EXIT=0 / `tsc --noEmit` EXIT=0；`audit-river-continuity.js` 60 seed 0 空洞；`audit-road-draw.js` 30 seed 病链 0/334（平均渲染宽 strip-branch 75px / hs-secondary 72px）；`audit-map-drive.js` 1 seed×2 节点 0 失败；`test-covers` / `test-nodegen`（§16 #C1 方形节点 119 路口全收敛）/ `test-map` 全绿；Node 全链 42/43（calibration 2 项为预存失败——回退本批改动复跑同样失败，与本批无关）。`audit-map-gen.js` 未全零（G7 越界 57 / G3 孤儿路口 7 / G2 桥下无路 2）——回退本批生成改动复跑坐标完全一致，且 HEAD 干净快照亦失败（G7/G5），确证为本批改动之外的预存问题（工作区其他未提交改动 + 基线），未立新问题条目。
- **现行口径归口**：`docs/specs/map.md` §10.2（strip 窄支路路口半径沿革注记）。桥面/河面/过渡段绘制口径见本节修复条 + 代码注释（`js/tank_battledraw.js` water-chain / bridge-deck 分支、`js/tank_rules.js:133`、`js/tank_nodegen.js:2963`）。ISSUES.md #P2 按生命周期删除并归档。

### §4.70 2026-10-14 #S8：GitHub Actions 校准基线第六次修正（CI 恢复）

- **现象**：GitHub Actions run #27（4e3a70e）、#28（2a872a4）`failure`——"Full Node test chain"（`npm test`）exit 1（`npm run check` 通过）。本地复现：`scripts/test-nodegen-calibration.js` 2 项失败——`urban_block d=0.7 minPassage=0.9`（基线 1.5）、`mixed_barrier_plaza d=0.3 minPassage=2.2`（基线 1.7）。
- **根因**：非代码漂移——2026-10-12 #Q 批次第五次重锚时两处误标：`urban_block d=0.7` 8-seed 实测 0.8988（误标 1.5，注释预期的 "+0.3~0.6" 漂移并未兑现，实测≈第四次基线 1.0）；`mixed_barrier_plaza d=0.3` 8-seed 实测 2.2491（误标 1.7，|2.2-1.7| 浮点边界恰好超出口径 ±0.5）。
- **修复**：应用 qi 未推送的本地修正 `6d1ae26`（2026-10-14，第六次基线修正）——两处基线值改为实测值，校验口径不变（cov ±0.02 / con ±0.05 / minw ±0.5）。
- **验证**：`scripts/test-nodegen-calibration.js` 146 项全过；`npm test` **43/43 全绿**。ISSUES.md #S8 按生命周期删除并归档。

### §4.71 2026-10-14 #S4/#S14：公路加速恢复 + 道路屏蔽下层减速

- **根因**：2026-09-14 road 被逐出 `getCoverUnderTank`（`js/tank_cover.js:207-220` `if(cov.tier === 'road') continue;`，零物理优化），但 2026-09-20 #E3 的公路加速仍走同一查询判定 `onRoad`（`js/tank_move.js:48`）→ `onRoad` 恒 false，`roadBonus` 恒衰减到 0，**加成自 #E3 落地起从未生效**；同理 `getCoverUnderTank` 跳过 road 后返回下层首个重叠 cover（river/mud），0.4 减速照常生效（#S14）。
- **修复**：`js/tank_cover.js` 新增 `getRoadUnderTank`（同款 OBB 相交判定 + `coverQueryCandidates` 空间索引，仅查 road tier，已导出 + `types/globals.d.ts` 声明）；`driveTank` 改走本函数求 `onRoad`，road 存在时 `speedModifier/turnModifier` 强制 1.0（屏蔽下层减速）。AI/玩家共用 `driveTank`，一并受益。
- **验证**：定向脚本 `/tmp/verify-road-s14.js` 5 项全过（roadBonus→25.0px/s=+10km/h；road 上 302px/s vs 纯 river 100px/s）；`scripts/test-move.js` 新增 5) #S4/#S14 回归段 4 项断言；`npm run check`（含 tsc）EXIT=0；`test-move`/`test-covers`/`test-tankcollision` 全绿。调用 driveTank 的 Node harness（test-move/test-tankcollision）补 `global.getRoadUnderTank`；`Object.assign(global, COV)` 类 harness 自动获得。
- **现行口径归口**：`docs/specs/map.md` §12.3 沿革注记。ISSUES.md #S4/#S14 按生命周期删除并归档。

### §4.72 2026-10-14 #S9/#S10/#S3-UI：暂停菜单商店入口 + TAB 面板实时刷新 + Boss 血条

- **#S9 暂停菜单商店入口**：`#pauseScreen` 加「商店 SHOP」按钮（2026-09-14 §4.12 摘除 `pauseShopBtn` 后漏恢复）。`renderRunShop` 抽取 `buildRunShopInto(listEl, balEl)`，结算内嵌版与暂停内嵌版（`#pauseShopWrap`/`#pauseShopList`/`#pauseShopBalance`）共用；购买链 `buyRunShopItem` 不变，战斗中购买即时生效；进暂停态自动收起商店面板。
- **#S10(a) hp_up 回满**：`buyRunShopItem` 中 `defId==='hp_up'` 时 `player.hp = player.stats.maxHp`（用户决策，消除"249/250"式显示；#A12 差量同步本身工作正常）。
- **#S10(b)(c) TAB 面板实时刷新**：新增 `refreshStatusPanel()`；购买后即时调用；主循环 `loop()` 非战斗态（settlement/map/pause）也刷新（battle 仍走 `updateHud` 链）。
- **#S3-UI Boss 血条**：`#bossHpWrap` 屏幕下方中央（`#bottomHud` 上方）——Boss 名 + 血条 + `ceil(hp)/round(maxHp)` 数字；`updateBottomHud` 每帧经 `entities` 取存活 `isBoss` 更新，非 Boss 战隐藏。
- **验证**：`npm run check`（check-html + tsc）EXIT=0；`npm test` 43/43；新引用 DOM id 10/10 存在性校验通过。浏览器链本环境无 Edge/Chromium 二进制未跑（待正常环境补跑）。
- **现行口径归口**：`docs/specs/combat.md` §9.8。ISSUES.md #S9/#S10 删除并归档；#S3 保留（UI 子项完成，行为调优待阶段 6）。

### §4.73 2026-10-14 #S6/#S5：副武器升级卡补齐 + Boss 轮弹种升级必保底

- **#S6 副武器卡补齐**：新增 2 张 rare 升级卡——`weapon_secondary_missile_lock_upgrade`「导弹快速锁定」（lockSeconds 1.0→0.6、lockArcDeg 30→45）、`weapon_secondary_rocket_speed_upgrade`「火箭高速推进器」（speed 450→650、aoe 40→55）。消费路径已验证：`updateMissileLock`（`cfg.lockSeconds/lockArcDeg`）、火箭分支 `cfg.speed ?? 450`（`js/tank_weapons.js:202-203/283`）；`w.stats` 经 `mergeStatOverrides` 合并覆盖默认值。升级资格照常（`cardEligible` 须持有同型副武器）。副武器卡 8→10。
- **#S5 Boss 轮弹种升级必保底（用户要求"boss战后必然提供1个弹种升级选项"）**：
  - **根因**：5 个 Boss 的 `loot.cardRarity` 全为 `"legendary"` → `bossLootPool()` 稀有度下限把 rare 链升级卡整个滤出池外；叠加 #O4 的 0.18 概率 + pace 衰减，Boss 轮几乎拿不到弹种升级。
  - **修复**：① `bossLootPool()` 把全池链升级卡（`ef.replaceAmmo`）并入候选（不受稀有度下限过滤）；② `drawCardChoices` 新增 `opts.guaranteeAmmoUpgrade` → 绕开掷骰与 pace 衰减**必抽 1 张**（无链资格卡时静默跳过）；③ `drawRewardCards` 在 `pendingLootRounds > 0` 时传该 flag。链过滤器（前驱资格禁跳级）与 `cardEligible` 照常先行。
- **验证**：`scripts/test-cards.js` 新增 #S5 回归段 6 项断言（200 种子 200/200 命中恰 1 张、前驱资格非跳级、链毕业不崩）；`npm run check` EXIT=0；`npm test` 43/43。
- **现行口径归口**：`docs/specs/cards.md` §8.3（副武器卡）+ §9（Boss 保底）。ISSUES.md #S6/#S5 删除并归档。

### §4.74 2026-10-15 #S12/#S1/#S11/#S13：地图视觉四项 + Node 直出生图管线

- **生图管线（用户建议）**：`scripts/lib/mini-canvas.js`（纯 JS Canvas2D 垫片：路径光栅化/渐变/裁剪/drawImage/getImageData/PNG 编码，零依赖）+ `scripts/render-map-shot.js`（生成算法 → 真实 `drawGround/drawCover/drawFoliage`（含 `tank_assets.js` 离屏烘焙）→ PNG；`--focus river|road|village|all`、`--cx/--cy/--cw/--ch` 手动裁剪）。解决无浏览器环境视觉验收问题。
- **#S12 河面**：`water-chain` 去掉单根中心高光线 → 两岸暗带 + 每段 3 条流向 streak（位置 hash 确定性）+ `performance.now()` 缓慢漂移（0.03/s）。
- **#S1 支流缝合**：汇入点 y 改用干流实际 segment 采样（替代正弦估算）；支流末端伸入干流（过中心线 `thick*0.25`），取消末端收分——水体合并。
- **#S11 出界裁剪**：strip 级轴对齐路段沿边界精确矩形裁剪（原整段删除）；`bridge-approach` 引道加出界丢弃；`placeRoadNetwork` 的 `segInBounds` 保持原中心检查（改严格会 RNG 漂移破坏校准基线）。20 seed 出界道路 0 条。
- **#S13 建筑**：`box` 分支加屋顶内收 + 天窗网格 + 墙体高光（deterministic）。
- **验证**：生图目视确认 4 项；`npm run check` EXIT=0；`npm test` 43/43。
- **现行口径归口**：`docs/specs/map.md` §11（水面/支流）§12.3（出界裁剪）§4（建筑）。ISSUES.md #S12/#S1/#S11/#S13 删除并归档。

### §4.75 2026-10-15 #S2/#S3：AI 五层级警觉 + Boss 行为调优

- **#S2 五层级警觉**（`t.alertLevel` 0=calm/1=suspicious/2=alert/3=engaged）：
  - ②玩家射击：`fireTank` 经 fireCtx.`emitShotNoise` → 半径 900px（railgun/autocannon 1200）内敌对 AI `hearNoise` 置 suspicious。
  - ③近失弹：玩家/友军炮弹死亡未命中（`s._didHit` 标记），落点 180px 内 AI 听到。
  - ④友邻遇袭：`propagateAlert` 既有（600px）。
  - ⑤自身被攻击：`alertEntity` 置 level 3 + `_threatDir`（炮塔立即转向威胁，search 态优先指向）。
  - suspicious 行为：朝声音半速调查、炮塔扫视，8s 无新声音降级；接战中不受干扰。
  - RULES 新增 `shotNoiseRadius/impactNoiseRadius/suspiciousTimeout`。
- **#S3 Boss**：
  - 追击欲望：hold 超出射程 1.2× 时 0.4 速前压；skirmish 超过 keepDist×1.25 时 0.7 速接近（不再只退不进）。
  - 炮击：`behavior.barrage` 去 style 门控，fortress（4 发/14s）/sniper（2 发/12s）新增。
  - 召唤：`bossSummonWave` 加时间兜底（75s 未触发波次强制下一波，`bossFightT` 累计）。
- **验证**：`scripts/test-ai.js` 新增 #S2 8 断言、`test-boss.js` 新增 #S3 2 断言；`npm run check` EXIT=0；`npm test` 43/43。
- **现行口径归口**：`docs/specs/combat.md`（五层级警觉）、`docs/specs/boss.md`（行为/炮击/召唤）。ISSUES.md #S2/#S3 删除并归档。

### §4.76 2026-10-15 #TEX：回归程序化涂装/纹理/装饰件

- **背景**：用户裁定 AI 生成拟真贴图在 56~70px 渲染尺度下细节不可见（17:1 压缩比）、与地图元素协同困难；且精灵分支做不出履带滚动动画、殉爆/断履带强制回退程序化——两套系统必须共存，AI 路线省不掉程序化代码。
- **动作 1**：tiger-I/Leapard_1/Obj 780 的 `sprite.enabled` 置 false（5 车全部程序化渲染）。PNG 资源保留（3.5MB），AI 管线文档保留。
- **动作 2**：程序化装饰件库（`js/tank_paint.js` `DECORATION_DEFS`）：toolbox/spareTrack/jerryCan/log/shovel/camoNet 共 6 类型，深色描边+高对比色块保证小尺度可读。`drawAttachments` 接线（`js/tank_battledraw.js:909`），`assignTankDecorations` 按 tank id hash 确定性分配 2~3 件（车体后部/侧面，避开炮塔座圈）。
- **动作 3**：细节层——`paintRivets`（甲板边缘铆钉排+高光点）、`paintWeathering`（level 0~3：划痕/锈斑/泥点/掉漆，seed 确定性）。
- **动作 4**：动态损伤——`renderHullTexture` 按 hp 比例分 4 级（>75%/50%/25%/≤25% → 0/1/2/3），`weatherSeed` 每车固定防闪烁。
- **验证**：`npm run check` 通过；`npm test` 43/43；`scripts/test-tanks.js` 新增 #TEX 断言（5 车精灵关闭/6 装饰件/绘制不抛错）；Node 直出装饰件样张可读。

### §4.77 2026-10-15 #TEX3：设计器三标签 + 外观件独立编辑

- **设计器重构**（`tank_designer.html` + `designer.js`）：4 标签（车体/炮塔/外观件/掩体）→ 3 标签（**数据**/装甲模型/外观）+ 掩体保留。
  - 数据：基础参数 + 战斗参数（`panel-data`）。
  - 装甲模型：车体/炮塔几何 + 装甲厚度 + 分段装甲 + **座圈位置保留**（`panel-armor`，原 panel-hull/panel-turret 合并；用户要求②）。
  - 外观：炮管（已在）+ 炮盾 + 履带 + 纹理 + **新增车长塔/发动机舱编辑器**。
- **外观件数据模型**（`tanks/*.json`）：`appearance: { cupola: {style,dx,dy,mirror}, engineDeck: {...} }`；全默认时不写入（`_appearanceForSave` 返回 null）。
- **预设样式**（`js/tank_paint.js` `APPEARANCE_PRESETS`）：
  - 车长塔：standard（8 周视镜+对开盖）/ low（低轮廓 6 镜）/ panoramic（全景 10 镜+大单盖）/ none。
  - 发动机舱：standard（双百叶窗+双排气管）/ rearGrille（尾部大格栅）/ compact（紧凑单散热器）/ none。
  - 涂装：沿用 `TEXTURE_DEFS` 9 种（外观标签已有纹理下拉）。
- **渲染**：`paintAppearancePart(ctx, part, style, x, y, s, bodyCol, {mirror})`；`paintPartTextureDirect` 中 appearance 覆盖时跳过内置绘制；`renderHullTexture`/`renderTurretTexture` 透传 `t.appearance`；设计器预览同款透传。
- **验证**：`npm run check` 通过；`npm test` 43/43；预设绘制 mock 测试全过。

### §4.78 2026-10-15 #MODE：Boss 战模式 + 生存战模式（URL 参数）

- **入口**：`tank_battle.html?mode=boss` / `tank_battle.html?mode=survival`（缺省 `standard`，标准流程零改动；`GAME_MODE` 常量解析 URL 参数，`tank_battle.html`）。
- **Boss 战模式**（`mode=boss`）：
  - `js/tank_map.js` `makeNode` 支持 `env.bossOnly`——全节点强制 Boss 标记（方形竞技场路径、无常规敌人、quota=null）；`generateRun` 的 env 透传 + `extendRun` 复用 `run.env`，无限链延续全 Boss。
  - Boss 定义沿用现有懒指定流程（`enterBattle` 内 `node.boss===true → pickBossDef()`）；难度随节点 index 递增（`difficultyForIndex` 曲线）。
- **生存战模式**（`mode=survival`）：
  - `generateSurvivalRun(seed, env)`（`js/tank_map.js`，已导出）：单个大地图（视口 2x → 面积约 4x，实测 7680x4683 vs 标准 3840x2341）；`node.survival=true`，`node.boss=null`（Boss 按波次手动生成）。
  - 波次系统（`tank_battle.html`）：`startSurvivalWave(n)`——普通波敌军数 `min(3+floor(n/2),12)` 递增，`aiTriggerDist=99999` 全图主动索敌；每 3 波 Boss 波（复用 `spawnBossFromDef` + `pickBossDef`，按波次 `entityMultsForDifficulty` 缩放强度）；Boss 召唤物继承 `survivalWaveSpawn` 标记计入清空判定。
  - 波次清空 → `finishSurvivalWave()` → settlement（波次标题）→ reward（5 选 1，`rewardPickTarget` 生存分支）→ `advanceRewardFlow` 回同一节点自动开下一波；HUD 顶部显示"第 N 波"（`survivalWaveHud`）；阵亡/终止结算显示存活波次。
- **验证**：`scripts/test-modes.js` 18 断言全过（Boss 全链/生存大地图/波次规则/标准回归），已接入 `npm test`；`npm run check`（tsc）`js/tank_map.js` 与 `tank_battle.html` 内联脚本均 ✓（`js/tank_cards.js` 的 5 处 `ef` 未定义错误为并行未提交改动引入，非本批次）。

### §4.79 2026-10-15 拉取后缺陷清理：#8 TAB 面板冻结主循环 + #6 引发的测试夹具失效

- **背景**：拉取 `origin/master`（`6a1908c` → `57c3c8a`，10 提交）后跑三链，`npm test` 44 项中 1 项失败（`scripts/test-modifiers.js` 4 断言），`npm run test:browser` 亦 FAIL。定位为**两个互相独立、且均早于本次拉取**的缺陷（`182ae1d` / `9ca91a5` 已是 `6a1908c` 祖先，即拉取前工作区已存在）。

- **缺陷 1（用户可见，已修复）：TAB 状态面板一开即永久冻结主循环**
  - **证据**：`tank_battle.html:1408`（#8 `9ca91a5` 引入）`const foes = (tanks || []).filter(...)` —— 仓库内**不存在** `tanks` 全局，中央实体注册表名为 `entities`（`js/tank_entity.js:12`）。`(tanks || [])` 对**未声明标识符**求值必抛 `ReferenceError`（`||` 不能兜住 ReferenceError），故 `stEnemies` 存在时 `updateStatusPanel` 恒抛。
  - **影响链**：TAB 面板 `statusOpen=true` → `loop()` 内 `if(statusOpen) updateStatusPanel()`（`:4066`，经 `updateHud` ← `update` ← `loop`）→ 抛错 → `loop()` 末尾的 `requestAnimationFrame(loop)`（`:5353`）**永不执行** ⇒ 战斗态打开 TAB 后整个游戏冻结（无模拟、无绘制）。`loop()` 与 `update`→`updateHud` 全程无 `try/catch`，抛错直接逃逸出 rAF 回调。
  - **修复**：`(tanks || [])` → `(entities || [])`，并补注释说明全局名与抛错路径。
  - **验证**：`npm run test:browser` 由 FAIL → **ALL PASS**（4 条链）。该修复同时消除 `PAGEERROR: tanks is not defined ×2` 与断言 `(d) 开火命中弹携带所选槽位 ammoKey` 的失败（**同一根因**：主循环死亡后 `stepShells` 不再推进，炮弹飞不完、`resolveHit` 不触发，故 `firedKey` 恒 `null`）。

- **缺陷 2（测试夹具失效，已修复）：`#6` 上调 `entityMults` 后 `test-modifiers` 4 断言失败**
  - **证据**：`182ae1d`（#6，2026-10-15 11:49）把 `entityMults.penetration` `[0.75,1.25]→[0.8,1.5]`、`damage` `[0.75,1.2]→[0.8,1.5]`（`js/tank_rules.js:1002-1003`），但 `scripts/test-modifiers.js` 的 #H1 段夹具仍写死旧倍率下的 `base` 值（`e1.base.penetration=100` 注释「100*1.25=125 < 144」、`e1.base.damage=40`、`e3.base.damage=10`）。
  - **失效机理**：夹具由 `base` 乘 `em[x][1]` 得 `stats`，倍率升到 1.5 后 —— `e1` 穿深 `100→150 > penCap 144`（误入「应封顶」分支）、`e1` 伤害 `40→60 > cap 55.45`（误注入 `dmgCapMul`）、`e3` 伤害 `10→15 > floor 13.6`（误入「应抬升」之上的区间）⇒ 三条「不应注入」断言与一条等价性断言（`NaN vs 13.6`，因 `dmgFloorMul` 未注入而目标值算成 `NaN`）同时失败。**非产品缺陷**，是夹具未随参数档位自适应。
  - **修复**：夹具改由现行 `penCap` / `floor` / `cap` **反推**（`e1Pen = penCap/em.penetration[1]*0.8`、`e1Dmg = ((floor+capNoStrongest)/2)/em.damage[1]`、`e3Dmg = floor/em.damage[1]*0.8`），不再写死绝对值 ⇒ 未来再调 `entityMults` 档位时夹具自动跟随（与 `test-map.js` 的「以 RULES 为唯一真值」同思路）。

- **顺带核实（记录，非本批次改动）**：`#6` 上调后 `difficultyCapMuls` 的穿深封顶**由「单局内实际不生效」变为「中段即生效」**——旧档位触顶需 `diff ≥ 1.035`，高于单局 `curveCap 0.95`，故单局内敌军穿深永不触顶（仅跨局等级 ≥3 级才可能触及）；新档位触顶阈降至 `diff ≈ 0.657`，对应 **index 8 起穿深锁定 144mm 不再成长**（index 0→7 仍线性 107→141）。伤害天花板仍不触顶（最难档 medium 51.0 < cap 55.45，仅 heavy/spg 类）。
- **验证（三链）**：`npm run check` **EXIT=0** / `npm test` **44/44 通过** / `npm run test:browser` **ALL PASS**（4 条链）。

### §4.80 2026-10-15 模式玩法四项用户反馈：Boss 商店回归 / 生存准备期 / Boss 免溺毙 / 顶部 HUD 重叠

- **来源**：用户游戏实测四反馈（#MODE 后续）。现行细则归口 `specs/combat.md` §14（模式）与 `specs/map.md` §11（溺毙豁免）。

- **① Boss 战模式：局内商店改在「卡牌选择后」出现（用户裁定）**
  - **背景**：`fbf7f73`（2026-10-15）曾整体禁用 Boss 模式局内商店，理由「每局回满血，不需要升级」——但 `enterBattle` 对所有模式本就满血进节点（`tank_battle.html:1939`），该理由不成立，商店被误禁。
  - **修复**：新增 reward 屏内嵌商店区（`#rewardShopBox`/`#rewardShopList`/`#rewardShopContinueBtn`）。流程改为 `battle → settlement（仅得分，不内嵌商店）→ reward 选卡 → 确认后同屏展开商店（revealRewardShop）→ 点「继续 NEXT BOSS」→ 下一场`。列表复用 `buildRunShopInto`（与结算内嵌版/暂停菜单版同数据源），Boss 模式仍移除「紧急维修」项。
  - **边界**：Boss 追加卡牌有多轮（`reward→reward`），故每次进入 reward 调 `resetRewardShop()` 收起商店并还原选卡按钮/文案；`buyRunShopItem` 增加 `renderRewardShop()` 回显。
  - **定向验证**：选完卡 → `#rewardShopBox` display 由 `none` 变 `block`、列表 18 条目；点「继续」→ `flow=battle`、节点 index 0→1；全流程无 page error。

- **② 生存模式：删除「区域肃清」倒计时 + 准备期可移动且关闭伤害（用户裁定）**
  - **根因（原缺陷）**：波次清空走 `clearing` 通道（`clearing=true; clearingT=2.0`），而 `finishSurvivalWave` **只复位 `waveActive`/`cleared`、不复位 `clearing`** ⇒ `isClearing` 恒真：其后 5 秒波次倒计时里 `driveTank` 被跳过（玩家冻结）、战斗管线全停。
  - **修复**：① 波次清空**即**调 `finishSurvivalWave()`，删除 2 秒缓冲（该函数内显式复位 `clearing=false/clearingT=0` 防残留）；② 5 秒倒计时界定为「准备期」——**可移动、伤害全关**。
  - **伤害关闭双层拦截**（缺一不可）：① **总闸** `js/tank_physics.js applyDamage` 开头查 `globalThis.damageSuppressed()`（由 battle 的 `isSurvivalPrepWindow()` 提供），为真即 `return 0` —— 覆盖所有经 `applyDamage` 的伤害（炮弹/溅射/炮击/DOT/溺毙/无人机/地雷/碾压）；② **来源门控** `isSurvivalPrep` 拦开火（玩家/AI/副炮塔）、`stepShells`、`updateStrikes`、`updateDeployables`、`updateDrones`、溺毙累计；进入准备期另清空残留弹道/落弹预警与导弹锁定（防静止 5 秒后同时爆开）。Boss 行为层无需门控（准备期 `cleared=true` 本就跳过）。
  - **定向验证**：清场后 0.9s（远小于原 2s）即 `damageSuppressed()===true`；准备期按 W 玩家位移 28px（可移动）；准备期 `applyDamage(player,9999)` 返回 0 且血量不变；倒计时结束后 `damageSuppressed()===false` 且伤害恢复（dealt 8.5）。

- **③ Boss 免疫溺毙（用户裁定）**
  - **根因**：Boss 走位由 `updateBossBehavior` 的 `_bossMoveOverride` 直驱（`js/tank_boss.js`），绕过 `aiDecide` → 也就绕过 `applyWaterAvoidance` 探点避水，Boss 可能停在深水中央；此时溺毙＝关卡核心对抗白给。
  - **修复**：溺毙门控加 `!e.isBoss`（`tank_battle.html`）。Boss 在深水仅减速通行（`passability 0.4`）。玩家/普通敌军/友军不变，仍是「一视同仁」的其余部分。
  - **定向验证**：扫描水域网格找到「Boss 车体完全浸水」位置，置入 1.2s 后 `drownT` 恒为 0、血量不变；**对照组**同位置普通敌人 `drownT` 累计到 1.22（证明豁免为 Boss 专属，非全场失效）。

- **④ 生存模式顶部 HUD 文本重叠修复**
  - **根因**：`#moduleStatus`、`#ammoReadout`、`#survivalWaveHud`、`#supplyCdHud` 四个元素各自 `position:absolute; left:50%; transform:translateX(-50%)` 定位到 `top:10~12px`（`#supplyCdHud` 40px）——生存模式下波次文本（18px）压住上方弹种倍率读出（12px）。
  - **修复**：新增单一定位容器 `#topCenterHud`（`absolute` + `left:50%` + `translateX(-50%)` + 纵向 `flex` + `gap:6px`），四个子元素移入并改 `position:static`，按 DOM 序自上而下自动避让。原先各自的内联定位样式一并删除。
  - **定向验证**（真实 `getBoundingClientRect` 求交集，非仅看 CSS）：强制 4 元素同时可见（最坏情况）后，两两重叠面积全部为 **0 px²**；纵向序列 top = 12 / 41 / 64 / 95，容器为 `display:flex`。

- **验证（三链）**：`npm run check` **EXIT=0** / `npm test` **44/44 通过** / `npm run test:browser` **ALL PASS**（116 断言）。另有上述四项定向浏览器验证（23 + 8 断言）全绿。

### §4.81 2026-10-16 Boss 追加轮卡池修复与稀有度保底重做

- **来源**：用户实测反馈两轮 —— ①「电磁炮没有加入 boss 战模式的卡池？打到节点 10 后只剩 2 个卡牌可选，无法再继续」；②「boss 战后的卡牌确保至少 1 张传奇、2 张史诗，其余随意，将非普通卡的抽中几率调高即可」。现行细则归口 `specs/cards.md` §9、`specs/boss.md` §5。

- **① 根因（两个现象同一因）：Boss 池按稀有度硬过滤 + 池枯竭**
  - `bossLootPool()` 原按 `CARD_RARITIES.indexOf(c.rarity) >= indexOf(loot.cardRarity)` **硬过滤**；3 个 Boss 配 `legendary`（下标 3）⇒ `epic`（下标 2）整档被排除——**电磁炮**/机炮/双管/弹夹炮与**全部副武器安装卡**（共 28 张装备卡）在 Boss 轮永不可见。
  - 且 Boss 模式**每个节点都是 Boss 轮**，每轮都走这个被砍到 26 张的池子，池内又全是 `maxStacks=1`（拿过即不可再拿）⇒ 实测第 5 轮可用池仅剩 1 张、第 6 轮归零。
  - **卡死的直接机制**：`rewardPickTarget()` 恒返回 3（Boss 轮），而确认按钮要求 `selectedIdx.size >= need`——候选不足 3 张时该条件永不成立 ⇒ **确认按钮永久禁用**，流程无法推进（用户「只剩 2 张卡无法继续」）。
  - **修复**：㈠ `bossLootPool()` 返回全池（不再排他）；㈡ `rewardPickTarget()` 按**实际候选数**封顶（候选 2 张即只需选 2 张、0 张直接放行），候选不足时 UI 明示「可抽卡牌已耗尽」，空池分支区分「本局已耗尽」与「卡池没加载」（后者是真故障，不被掩盖）。
- **② 新口径：Boss 轮稀有度保底 + 非普通卡加权（用户要求）**
  - 参数唯一口径 `RULES.cards.bossRound`：`guarantee: { legendary: 1, epic: 2 }` + `rarityWeights: { common:20, rare:32, epic:30, legendary:15, mythic:3 }`（原全局 `50/30/15/4.5/0.5`）。
  - `drawCardChoices` 新增两项可选契约：`opts.guaranteeRarity`（按配比保底「至少 N 张」，从稀到常见逐项满足，已命中同档则不重复追加，池内无货静默跳过）与 `opts.rarityWeights`（覆盖稀有度权重，该档抽空时回退加权池再回退全池，防空桶空转）。默认不传 = 既有行为零影响。
  - `weightedRarity(r, weights)` 加可选权重参数；权重表全 0 时回退 `common` 防除零。
  - 结算界面「稀有度保底」文案改由 `bossRoundGuaranteeLabel()` 从 RULES 派生（旧实现写死 `loot.cardRarity` 标签，与新保底不再一致）。
- **实测配比（1000 次抽取）**：满足「≥1 传奇 + ≥2 史诗」**1000/1000**；候选稀有度分布 common 7.6% / rare 15.2% / epic 51.4% / legendary 25.7%（对照旧权重：common 49.6% / legendary 3.9%）。普通轮不受影响（普通卡仍 49.0%）。
- **容量上限（实测发现的边界，属正常设计约束而非缺陷）**：`legendary` 全池 15 张且全为 `maxStacks=1`，Boss 轮每轮消耗 1 张 ⇒ **约第 12 轮后传奇抽完，保底优雅降级为 0 传奇**（候选仍恒 5 张、不缩水、不卡死）；`epic` 容量约 22 轮。已逐轮消耗模拟 + 端到端浏览器实测双重确认「有货必保、无货降级」。
- **验证（三链）**：`npm run check` **EXIT=0** / `npm test` **44/44 通过**（`test-cards` 新增 #BOSS-ROUND 段 10 项断言：配比已定义 / 候选恒 5 张 / 保底 200-200 / 普通卡占比 <20% / 传奇占比 >15% / 普通轮不受影响 / 池内无传奇静默跳过 / 30 轮逐轮消耗不缩水 / 降级不早于第 5 轮 / 权重全 0 不除零）/ `npm run test:browser` **ALL PASS**（116 断言）。另有端到端浏览器验证（真实 Home→Loadout→battle→settlement→reward 循环 20 轮，每轮候选均满足保底）6 项断言全绿。

### §4.82 2026-10-16 拉取后代码审计：#T 批次七项（地图生成坐标系 / 消叠 / 出生清场 / Boss 缩放 / 测试性能）

- **来源**：用户「拉取最新仓库，先做一遍代码审计」，审计 `94be95c..57a5a42` 五个提交（`#1` 地图批次）并逐项修复。现行细则归口 `specs/map.md` §17.2/§17.6/§17.7/§17.8。

- **① #T1 `npm test` 红灯：`test-strip.js` 超时 + 2 项断言失败**
  - **根因（两个独立缺陷叠加）**：㈠ `nodeLayoutMetrics` 的 `opts.losSamples || 200` 把显式传入的 `0` 当 falsy 吞掉，退回默认 `K=200`——测试传 `losSamples:0` 意图跳过 LoS 采样，实际仍跑 19900 对 × 2 次射线（实测单次度量 14.0s；`K=1` 仅 131ms）。三个 seed 叠加击穿 `run-tests.js` 的 180s 单测上限，超时把断言结果整体吞掉，runner 只报「超时」。㈡ 38px 断言用 `step=30` + 4 连通，在窄通道恰 1 格宽时于对角转角切断（见 ⑤）。
  - **修复**：`losSamples` 改为仅在「未显式传入」时回退默认值。**修复后 `test-strip.js` 由 368s 降至 141s**（度量段 80s→0.79s，100×），全量 `npm test` **44/44 全绿**（修复前 43 通过 / 1 失败）。
  - 附带：`nodeLayoutMetrics` 的 `isBlocked` 预筛「不阻挡」cover + AABB 预检（与既有 `_pointInCoverPoly` 同语义）。**连通性数值逐一不变**（0.99976/0.99984/0.99865/0.99993 与改进前完全一致）。

- **② #T2 `pruneOverlappingCovers` 的 AABB 预检不等价 → 重叠漏消解（`7217b3f` 引入）**
  - **根因**：新增的 `if (!_aabbOverlap(ea, eb)) continue;` 数学上成立，但 `_prunePolyWorld` 对 compound `collisionVerts`（多凸包嵌套 `[[[x,y]…]…]`，L 型建筑等）返回 `{x:null,y:null}`，bbox 退化为 `[Infinity,-Infinity]`，`_aabbOverlap` 恒 false ⇒ 该类 cover 与任何对象都不再比较，重叠永不消解。受影响的覆盖占比：strip 5.8%、全模式 2.9%（compound 85/769）。
  - **修复**：`_aabbOverlap` 在任一方 bbox 退化（非有限）时返回 true（不做剔除，回退精判）。**验证**：8 seed 输出与 `94be95c` 旧实现**逐条一致**，残留重叠由 7/7/13 归零，同时保住 17× 加速。隔离实验证明「缓存」部分等价、「仅 AABB 预检」是唯一引入差异的改动。

- **③ #T3 道路多边形 `verts` 坐标系生产者/消费者不一致（`cde3bc3` 引入）**
  - **根因**：`_emitRoadChain` 产出的是**调用方帧的绝对坐标**（bbox 中心即 `c.x`），而消费端（`coverCorners`/`pointInCoverPoly`/`buildCoverIndex`/`tank_ai` 避水探针）一律按 `c.x + v` 局部解释，`tank_cover.js` 契约亦明写「局部坐标顶点数组」。两条路径的约定**正好相反**：方形/Boss 路径 `centerX=0` 蒙对，strip 路径 `centerX=totalW/2` 整体偏移半个地图宽。实测（seed 7，6000 采样点）消费端命中集中 `x>w/2`（左 0 / 右 153）而真值应为左右各 305 ⇒ **幻影命中 153、漏检 610**。
  - **修复**：`_emitRoadChain` 出口统一减去 bbox 中心，`verts` 全部转为局部坐标；同步校正四处绝对帧消费者——`roadCoversToSegments`、`placeEdgeRiver` 的 `roadCenters`、`bakeNodeGroundLayer`（`tank_battle.html`，改为先做局部→世界换算）、`test-nodegen.js` 的 `ends`/`inOtherGroup`。**验证**：修复后幻影命中与漏检**双双归零**、索引与全表在 12000 点零不一致、`roadCoversToSegments` 316 段零越界。
  - **连锁**：该项使两处此前因坐标系错位而**恒不生效**的逻辑开始真实工作——`hitsRoad`（泥潭避路）此前把 `c.x` 加了两次、几乎永不命中（泥潭长期压在道路上，违反 §17.2 泥潭互斥），修复后泥潭真正避路，连带暴露「地形标签必产出」契约违例（`mixed_barrier_plaza`/`village_center` 少 1~2 块泥斑）。**修复**：`placeMudPatch` 重试上限 8→24、角度铺满 2π、半径在 0.55~1.45×ringR 间外扩 ⇒ 契约违例 7/112 → **0/112**（与修复前持平）。
  - **基线联动**：`test-nodegen-calibration` 第八次重标定——`coverCoverage`/`connectivity` **全部不变**（7 模板×5 难度仍 1.000），仅含 `mudPatch` 模板的 `minPassageWidth` 收窄（泥潭真实避路后 mud↔残骸小间隙成为最小值来源）：`village_center` d=0.1 1.0→0.4、d=0.3 0.9→0.4、d=0.7 0.9→0.2，`urban_block`/`mixed_barrier_plaza` 微调。

- **④ #T4 出生区清场误删非阻挡地形、凿穿河道（`e030aa1` 引入）**
  - **根因**：㈠ 清场用 `c.w/c.h` 的 AABB 包络判定且不按 tier 过滤，把 `mud`/`river`/`bush` 等 `passability>0` 且不挡弹的地形一并删除（10 seed 删 14 个**全属此类**；29% 连包络精判都不阻挡），并忽略 `verts` 多边形；㈡ 选址走 `pointInCover` 避让**一切**掩体（含可通行地形），与㈠互相掩盖——清场删掉可通行地形后选址才「看起来」正确。㈢ seed 99 出生点正压 `strip-river-1`，3 段被删致左右邻段由搭接变为 **328px 空洞**，破坏「河流全程连续」契约（`audit-river-continuity` 的全绿结论因此失真）。
  - **修复**：清场与选址统一为「只避让阻挡物」，判据与坦克碰撞一致（`passability === 0 || shellBlock`，见 `tank_cover.js` `resolveCoverCollisions`），并改用 `pointInCoverOne` 精判（含 `verts` 多边形与旋转）。**验证**：河道空洞归零（10 seed 全 0）、出生点仍恒在左 1/4（5/5 节点）、`mud`/`river`/`bush` 不再被删。
  - **连带发现（#T4b）**：清场收敛后暴露 `prune` 的 `tryNudge` **无边界约束**，可把元素推出节点（实测 `village_center` 一块 `water` 被推到 x=2533 > 节点宽 2460，越界 559px ≈ 一个 nudge 步长）——该缺陷**修复前已存在**（原版 5/2575 越界），仅因清场偶然删除而生偶发掩盖。**修复**：nudge 候选点在「败者原本在界内」时须落在节点界内；**原本就出界**的元素（如 `placeEdgeRiver` 的 river 以节点边线为中心，天然半幅越界，`test-map.js` 对此有显式豁免）不受此约束——否则 nudge 全部失败会导致元素被整株移除、破坏地形契约（实测禁放开该约束后地形违例 0→7）。**验证**：跨 10 seed 越界 5→**0**。

- **⑤ #T5 Boss 长宽比阈值硬编码 16:9（`f40454d` 引入）**
  - **根因**：`nodeScaleFor` 取 `max(vw/tw, vh/th)`，使节点较短边恰为 3.0 屏、较长边随视口长宽比放大，故只有当模板长宽比 ≈ 视口长宽比时才可能落进 3.0–3.2。把 16:9 下成立的 `[1.667, 1.896]` 硬编码为常量，其他比例下判据失效（3:2 由 7 个超标**恶化**到 10 个、1:1 最差由 5.00 **恶化**到 5.25 屏）；回退模板 `mixed_barrier_plaza`（1.6667）本身低于所设下界 1.667，阈值自相矛盾；回退分支赋的 `_tplW/_tplH` 此后从未被读取。
  - **修复**：改为由视口长宽比推导 `r ∈ [A·base/3.2, A·3.2/base]`，越界时确定性改选长宽比最接近视口者。**验证**：16:9 **超标 4→0**、16:10 与 3:2 由超标转为**全部 ≤3.2**；4:3 最差 3.75→3.60。**已知结构性限制**（非缺陷）：内置模板长宽比全在 1.60~1.75，仅 `A ∈ [1.5, 1.87]` 存在可行解，故 4:3/21:9/1:1 无解（已写入 §17.6）。

- **⑥ #T6 `test-strip.js` 新增辅助函数不可靠（`f649301` 引入）**
  - `roadIntersectsX` 只判「是否有顶点落在 ±200 窗口」——长多边形跨缝但顶点都在窗外时漏判；`roadMinMaxX` 继承 #T3 的坐标系错误，且与前者内部口径不一致（一用绝对 `v`、一用 `c.x + v`）。**修复**：统一为「局部 verts → 世界 bbox → 区间相交」单一实现（`roadWorldBBoxX`）。6b「一体化路网」断言随之转绿。

- **⑦ 38px 断言：采样网格伪影（非真实可达性缺陷）**
  - 原用 `step=30` + 4 连通，seed 99 稳定得 0.9987 而失败。**排查**：该值随后处理精度剧烈变化——step=30 ⇒ 0.99866、step=20 ⇒ 0.99906、step=15 ⇒ 0.99905、step=10 ⇒ 0.99913；step=30 改 8 连通 ⇒ 0.99890。孤立格 50 个（0.135%）散布在 x∈[2080,15940] 全域而非单一封闭口袋 ⇒ 判定为**膨胀后窄通道恰 1 格宽时、4 连通网格在对角转角切断**的采样伪影（真实地形连续，通道本身是通的）。**修复**：`step` 30→20（≈1.2 万格点，耗时可控）。3 seed 最小值 0.9987→**0.9991**，断言转绿。

- **验证（三链）**：`npm run check` **EXIT=0**（含 `tsc --noEmit`）/ `npm test` **44/44 全绿**（修复前 43/1；`test-strip.js` 368s→141s，超时冗余恢复）/ 河流连续性审计 60 seed **0 空洞**。其余专项：`prune` 8 seed 与旧实现逐条一致；地形契约 0/112（与修复前持平）；越界 5→0；#T3 幻影命中/漏检双归零。
- **遗留（未纳入本批次，`audit-map-gen.js` 既有红项）**：该审计 **471 项硬失败为改动前既有**，本批次后 643 项——增量主要来自 ㈠ G4「结构压路中心线」用 `ptInRect` 判 17280px 宽的整链 bbox，**约 85% 为误报**（实测某纵带 177 项中仅 26 项真落在路面多边形内），属审计脚本尚未适配「道路连续多边形」时代的度量口径；㈡ RNG 流变化导致的取样位移（G7 越界率 2.9%→3.3%）。**审计脚本对多边形道路的度量口径需要单独重做**，已登记为后续项，未在本次一并修改（避免与「修复即验证」的批次边界混淆）。

### §4.83 2026-10-17 用户反馈 #U 批次（地图视觉 / AI 感知 / 卡牌资格 / 局内查看器）

- **来源**：用户「拉取最新仓库，先做一遍代码审计」后连续 23 项实机反馈（`docs/ISSUES.md` #U1~#U23）。现行细则分别归口 `specs/map.md` §4/§14.4/§17.5、`specs/combat.md` §2/§3.1/§6/§13、`specs/cards.md` §8/§9/§11、`specs/editor.md` §7.3。

- **① 地图生成（#U2/#U3/#U7/#U9/#U16）**
  - **#U3 地面纹理随玩家移动**：色斑位置以 `opts.viewBounds`（视口）为基准生成 ⇒ 视口一动整组斑纹平移。改为**世界格锚定**（CELL=640，格内位置/尺寸/角度全部由「格坐标 + seed」hash 派生，与遍历顺序无关），并移除已无用途的 LCG 流。实测同一世界点在不同视口下像素 391/391 一致。
  - **#U2 泥潭过多且扎堆**：数量原按面积缩放（strip ratio 121× ⇒ 365~487 块）且环带布点半径偏小。改为按面积**平方根**缩放 + 上限 `MUD_MAX=32`；块数 >12 时改全节点网格铺位。实测 272 块 → 44 块，平均最近邻 227 → 561px。
  - **#U16 元素重合**：根因是**生成顺序**——strip 河流在片（含泥潭）之后追加，`placeMudPatch` 看不到河。改为河流追加后做确定性收尾：SAT 判定移除与 river/water 相交的 mud（26.8% → 1.4%）；`prune` 的 `ground↔liquid` 组合改用更严阈值。river↔river 的叠加属同组 25% 段间搭接（有意设计）。
  - **#U7 删除桥梁体系（用户裁定）**：P-20「水体+桥」组合与 strip「路河交叉替换为桥」两条路径、桥面/引道/桥位登记/过渡段全部移除；交叉处直接保留河段（车按 `river.passability=0.4` 涉水）。8 seed × 4 节点实测 0 个 bridge；`bridge` tier 定义保留于 RULES 供旧存档/基线读取。
  - **#U9 路口「两条路一上一下」**：根因在渲染层——`_strokeGroundPaths` 原按组「描边路缘 → 填充沥青」交替，后一组路缘会盖在前一组已铺沥青上。改为**分遍绘制**（先全部路缘、再全部沥青），交叉处沥青自然合并。

- **② 渲染（#U5/#U8/#U11/#U12）**
  - **#U8 河面双轨线**：岸带按**河段**逐段描边，数百段首尾相接后读作两条贯穿全程的平行粗线。新增 `drawRiverChain`（按 groupId 还原中心线、圆角粗折线一次描边，先岸影后河色）+ `orderRiverSegs`（PCA 主轴沿程排序）+ `drawCoverWaterStreak`；调用方按 groupId 聚类后整链绘制。双轨线与段间鳞片接缝同时消除。
  - **#U11 地物阴影 + biome 纹理（用户裁定：走仓库既有程序化管线，否决 ComfyUI）**：
    - 阴影：新增 `drawCoverShadow`，在 `drawCover` 实体前落两层软边影（近深远淡、零模糊开销）。建筑/残骸/岩石走轮廓多边形（偏移 `min(26, 6+max(w,h)×0.08)`）、树走树冠椭圆（与 `bakeCanopy` 的 `R=1.4×0.85×max(w,h)` 同源）、灌木/倒树走 OBB 椭圆、栅栏/沙包/树桩走脚下接触影；road/mud/water/river/bridge-deck 早退不投影。防御：`coverCorners` 遇 `angle` 缺失会得 NaN、投影整体消失，缺省补 0。
    - 纹理：新增 `drawGroundTexture`（按 biome 分套：草丛短划 / 雪粒 / 沙纹弧 / 湿斑 / 铺装线），世界格 hash 派生、随相机不动；支持 `biomeZones` 按区段分套。**调色经两轮实测修正**——纹理色与底色需拉开 ≥12 灰阶，否则叠加后肉眼不可见（首版 steppe/desert/mudland/concrete 全部踩中）。
  - **#U12 雪地过白**：`RULES.biomes.snow.base` `#dfe6ea`（相对亮度 0.78）→ `#c2ccd4`（0.59），base↔alt 跨度 10.6% → 22%。
  - **#U5 小地图元素粒度**：植被（`tierGroup='foliage'`）改为累加到**小地图 4px 网格**铺半透明绿色块（α 随格内株数微增，上限 0.85）——密集处自然成片、零散处不着色；水/河/泥/建筑/岩石仍逐元素画点（数量少、位置关键）。回归 `scripts/test-minimap.js` 新增 5 断言。

- **③ AI（#U4/#U15）**
  - **#U4 反应迟钝**：感知半径相对交战尺度（`engageRange` 520 / `triggerDistBase` 700）偏小。`shotNoiseRadius` 900→**1100**（heavy 按 1.27× 派生 1400）、`impactNoiseRadius` 180→**420**（近失弹原需几乎贴身才被听见，是主因）；battle 与 `tank_fire` 的硬编码半径（180/900/1200）统一改读 `RULES.ai.*`。
  - **#U15 水中 AI 不脱困**：`applyWaterAvoidance` 自身入水时仅 `out.move=0` 停驶 ⇒ 泡满 8s 溺毙。新增 `_escapeWater`（4 环 × 16 向采样，朝最近干地驶出；无岸可探时保持前进不退化为等死）。

- **④ 卡牌与商店（#U10/#U14/#U17~#U22）**
  - **#U19/#U14 两张死效果卡实现**：`reactive_armor` 在 `resolveHit` 首次命中整体吸收并从 `cardEffects` 消耗该层（一次性，与卡面一致）；`angle_boost` 按 `passiveValues` 求和加算跳弹角（上限 90°）——实测跳弹边界 70°→75°。
  - **#U18/#U20/#U22 `cardEligible` 三道新滤网**：已持技能去重（无 `requiresAbility` 的重复 ability 卡剔除）、属性达限过滤（按 `parameterLimits` 模拟下一级后越界即不合格）、「取最优」被动去重（`spall_liner` 取 min / `overmatch` 取 max，不更优即剔除）。
  - **#U17 商店达限文案**：等级制升级（`repair_kit_cd`/`medkit_cd`，`stat=null` 且 `effects=[]` ⇒ `runShopLimitBlocked` 恒 false）此前只禁用按钮、文字仍是价格。按钮文字改为三级优先：属性达限 → `limitLabel`；`lv >= maxLevel` → 「已满级」；否则价格。
  - **#U10 两通道澄清**：`precision_gunnery` 降 `spreadMult`（静止散布）、`steady_mount` 降 `motionSpreadMul`（运动散布），desc 与达限文案均点明通道。
  - **#U21 innate 卡卡面**：`repair_kit`/`support_extinguisher` 不新增技能槽（`repair`/`extinguish` 开局固有），卡面改写为「强化固有技能…（本卡是强化而非新增）」。

- **⑤ 局内卡牌查看器（#U23，新功能）**：`C` 键随时开关（战斗/暂停/结算/奖励），与 Tab / `` ` `` 面板互斥；按稀有度 / 标签 / 全部 三类浏览本局已持卡牌（`player.cardEffects` + `cardPool`）。键位登记 `tank_bindings.js` 的 `panelCards`；稀有度中文标签抽成单一常量 `CARD_RARITY_LABELS`。

- **⑥ 其余（#U1/#U6/#U13）**：资产加载加单次目录探针（`assets/` 为空时静默走 bake，404 7→1）；Boss 战后商店按模式门控（只在 reward 屏出现一次）；Boss 血量按实际 Boss 序号计（原硬编码每 5 节点，Boss 模式前 5 个恒为初始血量）+ `RULES.boss.bossDmgTextScale=1.6` 放大 Boss 掉血飘字。

- **验证（三链）**：`npm run check` **EXIT=0**（含 `tsc --noEmit`）/ `npm test` **44/44 全绿**（新增 `drawGroundTexture` 6-biome 序列互异 + `drawCoverShadow` 12 项断言 + `test-minimap` #U5 5 项）/ `npm run test:browser` **四链 ALL PASS**。另有 Node 直出生图逐项目视复核（biome 纹理网格、建筑/树投影、strip 全景）+ 浏览器实机截图（草地纹理与建筑投影可见、无 JS 错误）。

### §4.84 2026-10-17 地图元素出图管线重构（托管 API + 一键校验链）

- **来源**：§4.83 收尾时用户裁定「ComfyUI 太吃硬件，否决；用仓库已有的，并给替代方案」，随后「按建议逐个执行」。现行操作手册归口 `tools/cover-gen-prompts.md` v2 与 `assets/README.md`。

- **① 出图索引层 `tools/gen-covers.mjs`（新增）**
  - 后端适配：`gemini`（`gemini-2.5-flash-image`，`responseModalities: ['IMAGE']` + `imageConfig.aspectRatio`）、`replicate`（默认 `flux-schnell`，owner/name 可覆盖，`prefer: wait` + 轮询）、`openai`（`gpt-image-1`，`background: transparent`）、`mock`（不出网）。
  - **prompt 不复制**：运行时从 `tools/cover-gen-prompts.md` 的 §1 风格前缀 + §4 逐件 prompt 现解析，避免「md 改了脚本没改」的双源漂移；`tools/cover-gen-prompts.json` 只存 key → prompt 编号 + 出图分辨率。
  - **凭据纪律**：只从进程环境或仓库根 `.env` 读取（`process.loadEnvFile`），**不打印、不落副本**；所有报错过 `sanitize()` 掩码（`abcd...wxyz`）；`.env*` 已进 `.gitignore`（`.env.example` 例外）。
  - **mock 后端**：直接调 `bakeAssetCanvas` 取烘焙产物再整体放大到出图分辨率——注意不能拿 1024 当 bake 的 `w/h`（树冠半径 `R = max(w,h)×1.4` 依赖名义尺寸，会比例全错），这是本轮实测踩到的坑。

- **② 尺寸/锚点基准改由代码导出 `tools/dump-cover-refs.mjs` → `tools/cover-refs.json`（新增）**
  - **根因**：`ASSET_DEFS.w/h/anchorX/anchorY` 是烘焙函数的**输入**口径（锚点在内容包围盒内），而图片通道 `drawAssetSprite` 直接 `drawImage(img, x-ax*sx, …)`——图片像素 = 世界像素，锚点是**画布内**坐标。手抄 `ASSET_DEFS.w/h` 当落盘尺寸会错：tree 内容实际 30×30（手抄 24×18，整体缩放 1.25 倍）、tree_canopy 58×58（手抄 78×78）、`fallen_canopy` 的声明锚点 `ay=15.9` 更是落在 9px 画布之外。
  - **现行**：`refs.canvas`（= 烘焙后内容包围盒尺寸）、`refs.anchor`（画布内锚点）、`refs.centroid`（内容质心，验收基准）三组数字由烘焙代码实测导出，`prepare_covers.py` / `covers-anchor-check.py` / `gen-covers.mjs` 全部只读 JSON。

- **③ 后处理修正 `scripts/prepare_covers.py`**
  - `fit_contain`（居中贴到名义画布）→ `fit_to_canvas`（按内容包围盒裁留白 → 等比缩进 `refs.canvas` → 居中）。清底提前到缩放之前（AI 出图的白底会撑大包围盒）。
  - 新增 `--out`（落盘目录，测试用临时目录，默认 `assets`）。
  - `anchor_report` 降级为**信息项**：锚点本来允许偏离画布中心，不再当缺陷告警。

- **④ 新增验收脚本 `scripts/covers-anchor-check.py`**
  - 取代「人眼看 `tools/bake.html` 红十字」——红十字量的是烘焙内容包围盒内的锚点，对图片通道没有意义。新脚本直接复算运行时粘贴公式：尺寸必须等于 `refs.canvas`、内容质心必须落在 `refs.centroid` ±2px。
  - 内容触边只报告不判违例（树桩/栅栏本就铺满画布），`--strict-edges` 才升级为违例。

- **⑤ 测试链 `scripts/test-cover-gen.js`（新增，已入 `run-tests.js`）**
  - 规格 ↔ 运行时基准键集合对账；`dump-cover-refs --check` 保证 JSON 与代码同步；出图宽高比 = 最终画布宽高比（±2%）；10 条 prompt 可解析且均带风格前缀、无重复叠加；mock 端到端出 10 张 → `prepare_covers --inplace` 到临时目录 → `covers-anchor-check` 全绿。

- **⑥ 顺带修复 `scripts/lib/mini-canvas.js`（Node 生图垫片）**
  - `canvas.width = n` 原本只是普通属性赋值，内部像素缓冲仍是创建时的尺寸（32×32）⇒ `bakeAssetCanvas` 的探针量出的内容包围盒全错（tree 被判成 25×19 而非 30×30）。改为 getter/setter + `resize` + `_buf` 同步，与浏览器语义一致。

- **验证（三链）**：`npm run check` **EXIT=0** / `npm test` **45/45 全绿**（新增 `test-cover-gen`）/ `npm run test:browser` **四链 ALL PASS**。另有：mock 全链出图 → 落盘 → 浏览器实机截图（图 1:1、无 404、无 JS 错）；核对后已删除 mock 产物，`assets/` 保持为空（走程序化回退）；`node tools/gen-covers.mjs --provider gemini` 在无凭据时给出明确指引而非静默失败。
- **遗留**：真正出图需用户在 `.env` 填 `GEMINI_API_KEY`（或 `REPLICATE_API_TOKEN` / `OPENAI_API_KEY`）；本机网络实测 `generativelanguage.googleapis.com` 不可达、`api.replicate.com` 可达（401），选后端时需注意。

### §4.85 2026-10-17 第二轮实机反馈：#U24~#U29（贴图↔物理一致性 / 卡牌保底 / 生存 AI / 商店冷却）

- **来源**：用户实机反馈 5 项（河流/泥潭贴图错位、双管炮口偏移、电磁炮 Boss 轮难刷、生存 AI 等玩家、商店冷却升级无效）。现行细则归口 `specs/map.md` §17.5、`specs/combat.md` §3.1/§13、`specs/cards.md` §9。

- **① 贴图↔物理一致性（#U24/#U25/#U26）**
  - **#U24 河流**：`medianSegWidth` 取段 `min(w,h)` 当绘制线宽——strip 河段 `w=沿程长度`、`h=河宽`，290/290 段横向都是 h；真实河宽中位 190px vs min 中位 149px 且短段抖动。改取 `r.h`（与物理 OBB 短轴同源）。浏览器内像素采样：河「画了但物理不是」0.16%、「物理是但画不出」0.29%（余项为岸影/水花的正常边缘）。
  - **#U25 双管炮口**：`fireDoubleBarrel` 把 `barrel.width`（百分比字段，典型 18）当像素 → 横向偏移 16.65px；绘制侧同公式为 2.78px（偏 6 倍）。改为与绘制同源的像素换算。
  - **#U26 泥潭**：三处叠加缺陷——`hitsRoad` 只判泥潭中心点（半幅 100px+ 的泥潭贴边即漏，18% 相交）；strip 模式 `placeMudPatch` 收到 `outCovers`（此刻不含路）；strip 级路在 chunk 后追加，chunk 内判定与 prune 都看不到。修复：足印采样（中心+8 向）+ 路顶点反查 + 传 `avoidCovers` + strip 级 mud↔road SAT 收尾。实测 4 seed：mud∩road 21%→**0%**、mud∩river 保持 0。校准基线**第十次重标定**（泥潭离路更远 → `urban_block d=0.7` 1.7→1.2、`mixed_barrier_plaza d=0.1/0.3` 1.1→2.1 / 1.0→1.6；cov/con 全部不变）。

- **② 卡牌保底（#U27）**：主武器安装卡仅 4 张（全 epic），Boss 轮权重抽样期望 0.3 张/轮（模拟 3 轮 0/3、6 轮 1/6）。`drawCardChoices` 新增 `guaranteePrimaryInstall` / `guaranteeSecondaryInstall`（未装副武器时）两个保底通道，battle Boss 追加轮传入。模拟验证：3 轮主/副武器 100% 出现；保底顺序：装备优先 → 弹种 → 技能 → 主武器 → 副武器 → 稀有度配比 → 权重。

- **③ 生存 AI（#U28）**：两处叠加——defensive 触发距离 `engage×3+500` 中 engage 被 `triggerHysteresis` 钳顶恒 ≈650（阈值 ≈2450px），`aiTriggerDist=99999` 只放行触发门、不放大 engage ⇒ 距玩家 >2450px 的生存敌全军站桩；生成时只设 `alertLevel=3` 未置 `aiEngaged/aiReactT` ⇒ 首帧吃反应延迟。修复：「全图主动」实体（`aiTriggerDist` 超钳顶值）不进 defensive（移动交交战带）+ 生成时置 `aiEngaged=true, aiReactT=0`（普通波次与 Boss 波）。Node 探针：`state=defensive move=0` → `move=1` 持续推进。

- **④ 商店冷却（#U29）**：`cdReduce` 购买只累加 `runKitCdBonus` 账本，未回写消费值 `abilityBaseCd`（`innateBaseCd` 的唯一读取源）⇒ 升级无效。购买时经 `_syncKitCd()` 重算（出击注入助手；15s 下限在 `effectiveKitCd` 钳）。

- **验证（三链）**：`npm run check` **EXIT=0** / `npm test` **45/45 全绿**（`test-nodegen-calibration` 第十次重标定通过）/ `npm run test:browser` **四链 ALL PASS**。专项：泥↔路 4 seed 0 相交；Boss 抽卡模拟（主/副武器 100%）；双管偏移 fire↔draw 等值探针；生存 AI 首帧行为探针；浏览器内世界→屏幕像素级采样（河/泥渲染↔物理错位 <0.3%）。

### §4.86 2026-10-17 电磁炮外观修正（#U31）

- **来源**：用户「电磁炮需要去掉炮管护套、制退器、抽烟器外观件，使用专门的贴图」。
- **① 程序化分支**：附件禁用白名单原只含机炮（`_isAc`）——电磁炮炮管上会画出常规火炮的抽烟器环/制退器。现 `_isRailgun` 并入同一覆盖（`muzzle:'none' / evac:none / jacket:len:0`），mantlet 炮盾保留。双轨本体（两条深色导轨 + 轨间青色能量线）不变——那是电磁炮的纯功能性造型。
- **② 贴图通道**：`spriteBarrelImages` 对 `railgun` 类型已映射 `barrel-railgun.png`（1200×171 双轨无附件造型；5 车 JSON 均有 `imgRailgun` 引用），非缺陷。浏览器实测（Leapard_1 + `sprite.enabled=true` + 电磁炮卡）：资源请求 `barrel-railgun.png:200`，渲染为双轨贴图。
- **③ 顺带修复 `normalizeBarrel`**（`js/tank_halfgeom.js`）：返回对象缺 `imgStandard/imgAutocannon/imgRailgun/imgVehicle` 四个贴图路径键 ⇒ `applyTankConfig` 经 normalize 后贴图引用被静默剥离，**设计器「读取→保存」一次即永久删除**（与 §4.55 #L3 的 sprite 未知键同类）。现四键透传保留。这是贴图通道此前「看似未生效」的真实根因之一。
- **验证（三链）**：`npm run check` EXIT=0 / `npm test` 45/45 / `test:browser` 四链 ALL PASS。专项：程序化渲染探针（standard 带 ring/single/jacket 附件、railgun 纯双轨）；浏览器端到端（贴图通道激活 + 无 JS 错误）。

### §4.87 2026-10-17 布点/修剪避路收紧——「房屋落在道路上」根治（#U32）

- **来源**：用户「现在有房屋会落在道路上，需要改进」。
- **量化复现**：60 seed × scale 1/2/3，`generateNode` 输出中结构/植被 tier（full/building/ruined/barricade/tree/rock/stump/fallen/soft/bush/rubble）与道路 verts 多边形相交 **163 处**；60 seed ×3 scale 复测 diff∈{0,0.5,1}×buildingDensity∈{1,1.6} 亦全面命中。
- **根因（四因叠加，皆因 cde3bc3 道路改整链连续多边形后判定口径未跟上）**：road cover 的 OBB = 整链大 bbox（实测 verts 面积仅 OBB 的 ~6%），而 ① 模板物品避路的 `need ≤ 0 → pushed = true` 短路放行（物品距链中心远即认为不压路，实际压在路身中部）；② `best` 选「全局最近路心」而非「实际 SAT 相交的路」（推出方向错）；③ prune `tryNudge` 落点不查 road（把布点期已避开的元素再挪上路面，实测独占 100/134）；④ 布点/复验全程 OBB pad 判定虚警率极高。
- **修复（`js/tank_nodegen.js`，三处统一 verts 精确多边形相交）**：① 触发判定改 `_itemHitsRoad`（物品角点入路 poly / 路采样点入物品 OBB / 边相交三重；无 verts road 回退 OBB pad 6）；`best` = 精判相交的路中最近一条；`need ≤ 0` 也必须过 `tryPos` verts 复验；8 向搜索 280→480。② `tryNudge` 新增 `_hitsRoadPoly` 落点避路（采样点互入 + 边相交，AABB 预检；候选环 6→12）。③ prune 主循环的 mud↔road 严判（#U26）不变。
- **效果**：压路 163 → **0**（含 diff/density 全组合扫描 0）；strip 密度 seed42 10.91→11.01/屏、seed99 28.89→29.19（verts 精判下虚警剔除消失，密度不降反升）；7 模板 ×5 难度连通性维持 1.000。
- **基线联动**：校准第十一次重标定（`scripts/test-nodegen-calibration.js` BASE 表 + 头注，cov +0.003~+0.008、minw 整体上升）；`test-nodegen.js` 两处修正——泥斑环带断言中心由 W/2,H/2（0 原点帧假设，坐标系错位）改为世界帧 (600,350)；村庄建筑上限 20→24（避路收紧后不再被挤删，22 栋）。
- **细则归口**：`specs/map.md` §19。
- **验证（三链）**：`npm run check` EXIT=0 / `npm test` 45/45 / `test:browser` 四链 ALL PASS（exit=0）。专项：60 seed ×3 scale 压路扫描 0；strip 3-seed 密度 ≥10/屏恢复达标。

### §4.88 2026-10-17 strip 河流互斥与避路收尾（#U33）

- **来源**：用户「河流不应该交叉、干涉」。
- **量化复现**：40 seed strip 扫描，河↔河短段 OBB 相交 **471 段对**（H2 双横贯蜿蜒反相失配交织 / V 多纵贯 x 蜿蜒重叠），40/40 张 strip 全中。
- **根因**：`placeStripRivers` 的 H2/V 多河形态各自独立生成，无河间互斥；H1T 支流汇入干流（Y 形水体合并）为 #S1 设计内行为，非缺陷。
- **修复（`js/tank_nodegen.js`）**：
  - **河↔河互斥** `_riverPairClash`（段级 OBB SAT；AABB 拒收必须用旋转包络半宽——段 w 沿段向，纵河段 w 即纵向，直用 w 判 dx 漏检 V 河交叉）：H2 重试换 Y 后仍交叉弃南河；V 逐条互斥、重试换 baseX 后仍交叉弃后河、**relaxAmp/平移收尾后再查一次**。
  - **河↔路平行避让**：`relaxAmp` 压河比 >3% 时振幅 ×0.6 重建拉直（保留最低限度蜿蜒）；拉直后仍压路 → `_riverRoadClearance` 算负间隙、`shiftRiver` 整河平移远离最近平行路（间隙 24px 钳界内；**平移判定必须用 `roadCoversToSegments` 短段**——整链 verts 路 OBB 失真，#U32 同源教训）。`pickClearY` halfWin 含 `amp*0.5` 振幅余量、安全余量 80→20（防「全带 d≥1 → pickClearY 退化为贴路选择」）。
  - **物理极限裁定**：stripH 挤不下双横干道+双横河时弃河（河可缺失，交叉不可接受）。
- **效果**：河间非法交叉 471 → **0**（残留 3 处逐例核实均为 H1T 设计汇入）；河↔路平行压叠精确口径 6→8/40 seed（量级持平，虚警边缘）。`npm test` 45/45。
- **细则归口**：`specs/map.md` §20。
- **验证**：`npm run check` EXIT=0 / `npm test` 45/45 / `test:browser` 四链（见 §4.87 同链）。量化注意：河↔路重叠的粗口径（路 verts 首边角 + 顶点入河段斜 OBB）会虚报 653 段，精确口径（路 verts 世界多边形顶点入河段 OBB）仅个位数——见 specs/map.md §20 验证注意。

### §4.89 2026-10-18 河道形态：删除支流汇入 + 沿程宽度变化（#U34）

- **来源**：用户「删除支流汇入干流的设计，优化河道随机平滑的宽度变化计算，现在看起来宽度几乎不变」。
- **① 删除支流汇入**（`js/tank_nodegen.js` H1T 分支）：H1T（干流 + 短支流 Y 形汇入）整体改为 **H1 单条蜿蜒主河**，振幅 0.05~0.08×stripH。理由：支流汇入本身即 #U33 禁止的河流交叉，二者口径冲突，以用户裁定为准。连带移除：支流源头收分 taperFn、`hasLake` 死分支与湖泊 blob 产出（后者自 2026-10-05 起已是 `false` 常量、从未产出）。**#U33 的「H1T 汇入是唯一设计内例外」口径随之废除**——河流互斥现无任何例外。
- **② 宽度变化（两层同时修）**：
  - **数据层 `buildRiver`**：原 `h = w × taperFn(t)`，strip 干流/纵河均不传 taperFn ⇒ 全链等宽。现每段乘平滑双正弦波（低频 22~34% / 1.2~2.4 周 + 高频 6~12% / 3.0~5.5 周），钳 **0.6~1.35×**；相位/频率/振幅单次调用内固定，段间连续。实测宽度极差 1.8~2.4 倍、cv≈0.2。
  - **渲染层 `drawRiverChain`**（`js/tank_battledraw.js`）：原取**段宽中位数**做整链单线宽描边，把数据层宽度波抹平。改为**可变宽多边形**——逐段取半宽（段 `h/2`，#U24 口径）、3 点平滑两轮、左右边线闭合填充；岸影为同多边形外扩 6px。新增 `riverHalfWidths` / `riverChainGeom` / `_fillVariWidthChain`。实测渲染采样宽度沿程 250~480px。
- **③ 连通性口径修正**（`scripts/test-strip.js`）：宽度波峰值使连通性断言在 **step=60** 粗网格下出现 4 连通切角伪影（seed99：step60 **0.9987** / step20 **0.9999**）——与 #T1 已确立的同类伪影。断言步长对齐 **step=20**（38px 通道断言本就如此）。
- **宽上限取 1.35× 而非 1.5×**：峰值过宽会压 strip 通行走廊（实测 1.5× 时峰值 469px）。
- **效果**：河间交叉 **0**（无例外）；每 strip 河流数 ≤4（此前 H1T 恒多一条）；宽度沿程 cv≈0.2；`npm test` 45/45。
- **细则归口**：`specs/map.md` §21（§20 的「H1T 设计内例外」已被 §21 取代）。

### §4.90 2026-10-18 贴图/特效/阴影质量与渲染管线修复（#TEX6~#TEX9 / #FX3 / #MC1~#MC2）

- **来源**：用户「检查项目中贴图的生成方式，优化它们，增强实现、提高贴图质量和效果，包括不限于坦克贴图、开火特效、地图贴图、阴影、纹理等」。全链路审计 + 实现，覆盖 `js/tank_paint.js` / `js/tank_fx.js` / `js/tank_battledraw.js` / `js/tank_assets.js` / `scripts/lib/mini-canvas.js` / 两页接线。
- **① 贴图缓存键致命缺陷（两个）**：`getCachedTankSprite` 的键漏 `damageLevel` / `weatherSeed` / `appearance`，导致 ㈠ `renderHullTexture` 每帧算出的损伤分级**永不生效**（weathering 划痕/锈斑/掉漆全是死代码）；㈡ `tanks/*.json` 的 cupola / engineDeck 样式被静默忽略、全部画成内置默认件。现键含 `d{level}_w{seed}_c[…]e[…]`（`_appearanceKey` 定序拼接，cupola 支持对象与数组）。实测 damage0 vs damage3 车体差 357px、seed 换值差 609px、engineDeck 三态两两差 486/571px。
- **② 炮塔永远不显示损伤**：`paintWeathering` 被 `if(isHull)` 包住，且 `renderTurretTexture` 不传 `damageLevel` ⇒ 残血时车体锈迹斑斑、炮塔锃亮如新。现炮塔按同一 hp 比推导分级，`weatherSeed = 车体 seed + 17`（相位错开），画在车长塔/瞄具之前。实测 dmg0 vs dmg3 炮塔差 411px（修复前恒为 **0**）。
- **③ 光源方向被旋转两次（同屏两个光源）**：`paintTurretShadow` 先按 `worldAng` 旋转偏移，又在 `R(angle)` 局部系里 `translate` —— 净效果 `R(angle)·R(worldAng)·off`。实测 `hull=0`、炮塔 0→90° 时影方位从 54° 摆到 144°，而掩体投影恒 54°。改为「偏移是世界向量、局部平移取 `R(−angle)`」，漂移降到 **0.54px**。
- **④ 车底影完全缺失**：程序化分支（实机唯一路径，所有车 `sprite.enabled=false`）根本没有车底影，履带直接压在地面纹理上、车体像贴纸。新增 `drawTankGroundShadow`：两层椭圆，**形状随车体转、偏移不随车体转**（先在世界坐标平移、再 `rotate(hullAngle)`）。漂移 0.04px。
- **⑤ 掩体/植被投影升级为三层软边**（零模糊开销，禁用 `shadowBlur`）：建筑/岩石/残骸加墙脚接触暗带（消除两块偏移多边形之间的亮缝）；树加一层外扩椭圆 + 树干脆影；灌木/倒树加外扩柔和影 + 根部接触暗斑。不投影档位（road/mud/water/river/bridge）早退不变——`test-nodegen` 有强制断言。
- **⑥ 三套从未绘制的特效接线**：`drawScorchMarks`（地面贴花层，坦克之下）、`drawShockwaves` 与 `drawTracers`（炮口闪光之后）此前**两页都没调用**，是彻底死代码。现按正确层级接入 `tank_battle.html` / `tank_bench.html`。
- **⑦ 特效重做（#FX3）**：炮口闪光 = 炮口烟 + **双层火舌**（外焰+白热芯）+ 径向渐变核心 + 外发光 + 冲击环；殉爆 = 外烟壳 + 地面受光晕 + 四段色阶主火球 + 白热核 + **12 段不规则冲击边缘**；焦痕三层（尘土光晕/10 段不规则焦体/弹坑内核）+ 淡入；冲击波双层环。
- **⑧ 绘制期零渐变分配**：按「色阶名 + 半径档」把径向/线性渐变烘焙为离屏 sprite（`_radialSprite` / `_explosionSprite` / `_plumeSprite` / `_flameGlowSprite`），绘制期只 `drawImage` + `globalAlpha`。实测 20 个殉爆的 `createRadialGradient` 从 **60 → 0**、10 类炮口从 **61 → 1**（剩 1 次是磁轨炮长矛，非热点）。**自查抓到并修掉一处自伤**：`_plumeSprite` 画布高度误按 `len` 定，而外层扇形半径是 `R = len×2.4`，`wa=0.65` 时外焰垂直方向被切掉 58px（炮口焰像被水平削平的梯形）；改按 `R·sin(wa)`/`R` 派生包围盒，并加断言「烘焙 sprite 四边无触边像素」（对旧公式实测触发 54/56/178 个边缘像素⇒断言非空转）。
- **⑨ 绘制期确定性**：移除 `drawFxParticles` 火花、磁轨炮电弧、`drawFireGlow` 闪烁里的 `Math.random()`，改用 `_fxHash` / `_fxNow` 时间量子。约定写入 `js/tank_fx.js` 头部：**spawn 可随机、draw 必须确定性**。实测同帧重绘逐字节一致（差 0px）。
- **⑩ 贴图质感**：新增 `_texGrain`（0.5~1.5px 表面颗粒）与 `_texPatch`（**硬边多边形**迷彩色块），全部由固定种子哈希派生。迷彩由此前的「椭圆晕染」变为硬边色块；单色涂装（装甲灰/苏军绿/橄榄绿）补暗部+受光部+颗粒+掉漆/泥渍；数码迷彩 12×12 → 18×18 + 三色；焊缝加鱼鳞纹。量化：`camo_dunkelgelb` 颜色数 105 / 对比度 21.4（`none` 基线 27 / 10.9），`weld_seam` 对比度 26.6。
- **⑪ 植被烘焙**：灌木 `bakeCanopy` 5 正圆 → 9 叶团环；树 `bakeCanopy` 3 大圆 → 暗腔 + 11 叶团环 + 受光侧亮叶团 + 24 道枝叶短弧 + 叶点。**包络硬约束**：新图元外沿必须 ≤ 原最大包络，否则烘焙包围盒涨大 ⇒ `cover-refs.json` 图片通道基准失效（`tree_canopy` 仍 58×58、`bush_canopy` 仍 46×38，仅 centroid 微调并已同步）。
- **⑫ 资产缓存与烘焙开销**：`ASSET_CACHE` FIFO → **真 LRU**（原删最早插入者、命中不刷新，视口常用键照样被踢）；`PAINT_CACHE` 加上限 **512** + LRU（键加字段后单车条目从 1 抬到 4~12 条且全仓库无 `clearPaintCache` 调用点）；烘焙探针改「自适应 PAD + 触边加倍重试」，10 个资产层探针像素量降 **59%**（1,216,006 → 497,422）。
- **⑬ 离线生图不可信的两个垫片缺陷（必须修，否则视觉无法验证）**：`mini-canvas.drawImage` 完全忽略 CTM ⇒ `render-map-shot.js` 默认 `--scale≠1` 下掩体/树冠**位置全错**；改成逆变换采样后平移/缩放/旋转/斜切全对。`globalCompositeOperation='lighter'` 只存状态不生效 ⇒ 所有发光在离线图里发灰；改成真加法混合。
- **⑭ 地面纹理开销**：色斑逐斑 `beginPath/ellipse/fill` → 按 (alpha 档 × 颜色) 合批（≤8 次 fill）；两页网格线逐线 `stroke` → 一条 path 一次 `stroke`。1920×1080 实测 ctx 调用：meadow 26,973→**13,451**、snow 35,315→**11,795**、desert 7,184→**4,695**、concrete 6,749→**3,339**。
- **⑮ 新增回归测试 `scripts/test-render.js`**：既有 `test-tanks.js` 的绘制断言是 `mock ctx + 不抛错`（mock 让任何调用恒返回自身，NaN/漏画/键丢字段一律测不出），`test-assets.js` 同理。新测试用**真实光栅化**逐像素断言 **23 项**（实测 `node scripts/test-render.js` 输出 23 个 ✓）：缓存键三字段生效 + 有界/LRU、炮塔 weathering + cupola 样式、两处阴影方向世界固定 + 落右下、`drawImage` 跟随 CTM、`lighter` 加法合成、source-over 未回归、特效绘制期确定性、烘焙 sprite 不自裁切（火舌 7 组 × 径向 5 类 × 3 半径）。已接入 `run-tests.js`，`npm run test:render` 可直接跑。
- **验证**：三链——① `node scripts/check-html.js` EXIT=0「All checks passed」；② `node node_modules/typescript/bin/tsc --noEmit` TSC=0；③ 单测逐条跑 **46/47 通过**。唯一失败的 `test-cover-gen.js` 是**环境限制**：该测试用 `spawnSync` 捕获子进程 stdout，本沙箱下 `spawnSync` 一律 `EPERM`（`status=null`），与代码无关；其纯逻辑部分（出图宽高比 10/10、prompt 解析 10/10、锚点/质心字段齐全）全部通过，`node tools/dump-cover-refs.mjs --check` 单独跑 EXIT=0「✓ 与烘焙代码一致」。`npm run test:browser` 需系统 Edge + 更宽进程权限，本沙箱无法执行，**待人工补跑**。
- **细则归口**：`specs/map.md` §22（贴图/阴影/植被/地面材质/垫片语义/回归保护）+ `specs/combat.md` §6「特效分层规范（#FX3）」。

## §4.91 坦克贴图审核标准 v2 + 三处迷彩可读性重做（2026-10-18）

- **起因**：用户问「目前生成的坦克贴图符合你的审美吗」，并要求**先定标准再改**。本会话 `read_image` 无图像输入能力（模型未声明 image input），无法靠肉眼判定——因此把「好看」操作化为可测量、可回归的指标，而不是凭印象打分。
- **旧标准的两个实证失效模式（这是本批最重要的产出）**：
  - **放大审美陷阱**：`hullPoly` 本地 bbox 实测 **73.5×38** 世界像素，`renderHullTexture` 以 `scale=1` 贴回，相机 `RULES.camera` zoom 0.8~1.3 ⇒ 屏幕只有 **59~96px** 宽。任何在 300×300 探针上「越看越精细」的改动实机可能完全不可见。**所有指标必须在离屏 sprite 的 1:1 像素上测**。
  - **指标可作弊**：v1 标准用「颜色数」与「相邻像素对比度」判定成功，两个指标都被 1px 颗粒噪点刷高——颗粒越密分数越高，但玩家看到的只是「脏」，迷彩块反而更读不出来。**单指标一律可被作弊**，标准必须含互相制衡的**区间**（过高过低都扣分）。
- **标准 v2 的七条指标**（`scripts/audit-textures.js`，可执行、可 `require`）：① `tones` 8 级量化后占比 >3% 的色调数；② `valueSpan` p5~p95 亮度跨度；③ `shadeAmp` r=10 平滑后的 std（体积感）；④ `blockAmp` 去趋势残差 6px 分块 std（★迷彩块对比）；⑤ `blockRatio` = blockAmp/shadeAmp（★涂装是否被光照渐变淹没）；⑥ `patchScale` 平滑残差连通域中位直径 / 车宽（★色块尺寸）；⑦ `mipSurvival` 2×2 降采样后块级振幅 / 原图同频段振幅（★结构能否活过缩放）。加权 100 分，**达标线 80**。
- **按设计意图分类评分（关键设计决定）**：用一套标准评判迷彩与单色涂装是**错的**——迷彩的目的就是高块级对比 + 明确色块周期；单色涂装靠蚀刻细节与光影体积感取胜。拿迷彩的 `blockAmp` 区间卡 `paint_panzergrau` 只会逼出「给灰漆加假迷彩」这种错误改法。故分三类：`plain`（单色/蚀刻，看 shadeAmp/mipSurvival/tonesSpread）、`camo`（迷彩，看 blockAmp/blockRatio/patchScale）、`digital`（数码迷彩，**第三类**——设计语言就是小像素簇，用块状迷彩的 patchScale 目标卡它等于「要求数码迷彩别那么数码」，改用更严的 mipSurvival + 更小的簇尺寸区间）。
- **指标自身的 5 次返工记录（留档避免重犯）**：为「噪点 vs 结构」先后试过 ① `microContrast/blockAmp` 颗粒比 → 全部贴图 2.4~3.3，零区分度；②「邻居是否也显著」→ 全部 1.00（密集颗粒的邻居当然显著，方向反了）；③ `L − blockMeans(6px)` 同号邻域 → 全部 1.00（块均值是分段常数，块内残留是平滑渐变，符号一致）；④ 中值残差同号邻域 → 0.18~0.38 有数值但 `weld_seam`（最该是「线」）反而最低，量的其实是「厚度」；⑤ 最终改用 **mip 存活率**——这问题本来就有标准答案，看它能否活过降采样。同理 `patchScale` 也返工 4 次：块均值连通域全 0.08（网格切碎）→ 块均值自相关全 0.22（量到网格周期）→ 平滑残差自相关全 0.12（量到最快振荡）→ 同号游程全 0.11（被 1px 翻转切碎）→ **最终平滑残差连通域**才得到真实值。
- **修掉的三处真实缺陷**（缺陷均先量化再动手）：
  - `camo_winter`：白块 `rgba(255,255,255,0.35)` 叠在亮度 216 的近白底上，落色仅 229，**只差 13** ⇒ 几乎不可见。改为 4 块深灰掉漆区（−45 级）作骨架 + 2 小块纯白高光 + 掉漆边缘聚集深斑。`patchScale` 0.09→0.17，分 85→96。
  - `camo_urban`：5 个深 `fillRect` + 4 个浅 `fillRect`，**轴对齐矩形**在菱形车体上像 UI 色块；且深块只差 −21、浅块 +16，低于车体自身光照渐变。改为硬边多边形（与其他迷彩统一 `_texPatch`）、明度差拉到 −38/+36、并沿车身长轴分布。分 85→90。
  - `camo_digital`：18×18 网格 ⇒ 单元 **2.56px**（已是单像素噪点级，0.8 缩放下被平均掉）；色2/色3 与底色只差 **+5/−5** 等于没画；三套 `%5/%7/%11` 散点没形成数码迷彩的「成簇」结构。改为 10×10 网格（单元 4.6px）+ 三色差 −24/+22/−12 + **簇生长**（每簇 2~5 个相邻格，优先横向延伸）。分 76→100（按 digital 意图评）。
- **顺带修掉的两处**：`armor_plate` 与裸装甲差异块仅 **1.5%**（全部笔画压在 1px 网格线上，实机被淹没）⇒ 板缝 2px 加深至 0.26 + 每板交错明度偏移 + 板缘倒角高光，差异升到 **85.3%**；`paintWeathering` 锈斑半径 1.5~4.5px 在 73px 车体上只占 ~1% 面积 ⇒ 放大到 2.5~6.5px、alpha 提到 0.38+0.17×level，`paint_soviet` 的 dmg0→dmg3 差异块 3.0%→5.5%、`rust` 13.4%→16.5%。
- **标准纳入强制回归**：`scripts/audit-textures.js` 支持 `require`（`require.main !== module` 时**完全静默**，避免污染调用方测试日志）、`--json` 与 CLI 报表三模式。`scripts/test-render.js` 新增 **6 项断言**（实测总数 **23→29**）：覆盖全部 14 个 `TEXTURE_DEFS` 键、全部 ≥80 分、无 C 级指标、核心指标无 C、与裸装甲可区分（≥10% 差异块，`armor_plate` 按设计豁免）、`rust` 损伤 0→3 可见。**为什么必须进测试**：本轮三处缺陷在旧的 test-render 里全部不可见——旧断言只看「画了没画 / 抛不抛错」。
- **验证**：`node scripts/audit-textures.js` 平均 **97/100、14/14 达标**（13 个 S、1 个 A）；三链 ① `check-html.js` EXIT=0 ② `tsc --noEmit` TSC=0 ③ 单测 **46/47**（`test-cover-gen.js` 仍为沙箱 `spawnSync` EPERM 环境限制，与代码无关）；地图渲染两次 SHA256 一致（确认只动坦克涂装、未碰地面管线）。
- **细则归口**：`specs/map.md` §23「坦克贴图审核标准」。

## §4.92 坦克贴图 v3：1:1 视觉审阅 + 整车图案坐标系 / 同型车变体 / 边缘磨损（2026-10-18）

- **起因**：用户再次要求「先定标准、审阅、再改算法」。与 §4.91 不同，本会话**具备图像输入能力**——不再把「好看」完全退化成数字矩阵，而是用 `mini-canvas` 把真实绘制代码在**实机 1:1 / 5× / 10× / 6 种 biome 背景**下出图，逐张目视复核，再用 §4.91 的 v2 指标交叉验证。
- **审阅看到、而 v2 量不到的三个问题**（这是 v3 标准的来源）：
  - **炮塔图案缩水**：旧 `TEXTURE_DEFS.draw(ctx, bbox)` 的 bbox 是**本部件自己的**。车体 73.5px 宽、炮塔 32.3px 宽 ⇒ 同一条 `fx=0.30` 的色块在炮塔上只有一半大；炮塔与车体交界的迷彩断开。
  - **同型车完全同图**：图案种子全是常量。同屏两辆 Tiger 的迷彩像素级相同。
  - **边缘没有战损**：`paintWeathering` 的划痕/锈斑只撒在装甲面内，10 倍图里是「彩色碎屑」；棱边（真实战车最先掉漆的位置）干净得像刚出厂。
- **v3 标准（3 条通过/不通过，不并进 v2 的 100 分）**：
  - `variation`：同贴图 × weatherSeed 5 / 98765 的画面差异占比 **≥8%**（只对 camo/digital；单色涂装没有图案布局可言）。
  - `edgeWear`：dmg0→dmg2 在**轮廓内侧 2px 带**上的亮度改变占比 **≥17%**。
  - `continuity`：**涂装层**（`detail:false`）在车体/炮塔同一像素坐标的高通残差比 `stdΔ/stdHull` **≤0.85**（≈1.4 = 两套独立图案，≈0.3 = 同一套漆）。
  - `scripts/audit-textures.js` 新增 `v3Checks` / `continuityScore` / `fieldDiffRatio` / `edgeMask`，CLI 增加 v3 表；`scripts/test-render.js` 新增 **3 项断言**（⑦b）覆盖全 14 键、全员 PASS、迷彩连续性最差值 ≤0.85。
- **算法改动**：
  - **整车图案框 `paintPatternBox()`**：车体用 hull bbox；炮塔用车体 bbox 平移到炮塔局部系（减 `turretPivotOffset`），色块绝对尺度一致、跨座圈连续。网格类贴图（`armor_plate`/`weld_seam`）额外使用 `bbox.originX/originY` 对齐板缝（否则 14px 网格在炮塔上错开 `pivot mod 14`）。`texBox` 纳入 sprite 缓存键。
  - **逐车图案平移**：图案框按 `weatherSeed` 平移 ±8/±5px ⇒ 同型多车不再共用一套迷彩，同车像素仍完全确定。
  - **喷涂边缘**：`_texPatch` 增加错位 lobe、1px 同色 overspray 描边与边缘散点，顶点抖动 0.66~1.20。
  - **边缘磨损 `paintEdgeWear()`**：沿多边形边界内侧 1.0~3.0px 布掉漆（亮金属/深褐锈底两色）+ 缺口阴影 + 等级 ≥2 的锈水下渗；dmg0 不画。
  - **机械件亮度收敛**：铆钉高光 +26→+14、周视镜 +34→+22、散热器叶片 +24→+15、瞄具边框 +20→+12。1:1 下过亮的 1px 结构会连成 LED 点阵，抢走涂装层级。
  - **履带去 LED 化**：旧「防滑齿 +10% + 导向齿圆点」在 1:1 下是一条等距亮灰点阵。改为深基体 + 上缘受光 / 下缘蔽光 + 每节暗缝 + 短横纹 + 压暗导向齿。
- **过程中修掉的一个测量陷阱**：`paintPatternBox` 原来只在 `t.turretPivotOffset` 存在时减座圈偏移；默认实体（未 `applyTankConfig`）该字段为 `undefined`，测得的图案框与实机差 8px，`continuity` 恒 ≈1.4。改为缺省 `{dx:8,dy:0}`（与 `turretPivot()` 同口径）后，涂装层相关性从 0.13~0.48 升到 **0.96~0.99**，`armor_plate` 的 `continuity` 1.29→0.16。**这条留档的原因**：它说明 v3 指标必须先证明「能量到正确的东西」，否则会拿一个错误口径去验收。
- **验证**：`node scripts/audit-textures.js` → v2 平均 **97/100、14/14 ≥80**；v3 **14/14 PASS**（`continuity` 最差 0.57，`edgeWear` 18.0%~27.8%，`variation` 14.0%~32.2%）。`npm run check` EXIT=0（含 `tsc --noEmit`）；`node scripts/test-render.js` 全部通过；`test-tanks` / `test-assets` / `test-qa` / `test-map` / `test-nodegen` / `test-audio` / `test-dmgtext` 逐条 EXIT=0。`npm test` 整体运行器在本沙箱因 `spawnSync EPERM` 全部无法启动（环境限制，与代码无关，§4.90 已记录同一问题）；`test-cover-gen` 同样受此限制。`npm run test:browser` 需系统 Edge，本沙箱未执行，**待人工补跑**。
- **细则归口**：`specs/map.md` §22.1（纹理层新增工具与图案坐标系）+ §23.8（v3 三条检查、阈值、代码依据与基线）。

## §4.93 坦克材质化：3× 超采样烘焙 + 材质光照层（2026-10-18）

- **起因**：用户反馈「纯像素风格感觉不够好看，更改材质和纹理使其更有质感」。这不是再加几种迷彩能解决的——**像素感的根因是 1× 离屏烘焙 + 相机 zoom 0.8~1.3 放大一张 73×38 位图**，贴图再精细也会在放大时变成硬边像素。
- **方案（两层）**：
  - **3× 超采样烘焙（`SPRITE_SCALE=3`）**：`getCachedTankSprite` 以 3× 渲染（约 246×138），`paintPartTexture` 绘制时 `scale(1/3)` + `imageSmoothingEnabled` 双线性降采样到 1×；新增 `spriteView1x(entry)` 供审计/测试取得「玩家实际看到的 1:1 一张」。典型 <100 条缓存 ≈ 20MB，上限 512 条最坏 ≈ 70MB。
  - **材质光照层 `paintMaterialPass`**：内侧 AO（3 圈内缩描边）+ 渐变倒角 + 左上暖边/右下暗边 + 受光侧高光池 + 沿车体长轴的拉丝 + 亚像素细颗粒 + 下缘积尘。全部在烘焙期完成，运行时零成本。
  - **细节立体化**：车长塔/驾驶员舱盖/装填手舱盖/瞄具增加右下软投影（凸起件与光源同向）；炮管改为 4 条平行带（深底→中间调→受光高光→背光暗边，偏移方向取世界光在炮管法线上的投影），不再是一根平色线；车体/炮塔暗色勾线之外再加一条**暖色轮廓光**（左上受光边 1px 级渐变），把车从地面「立」起来。
  - **底色抬亮**：车体 `paintShade(bodyCol, -18)` → `-12`；旧暗底在 1:1 下会把迷彩读成湿泥。
- **离线验证链同步修复（否则这次改动无法验收）**：
  - `mini-canvas.drawImage` 增加**双线性降采样**（仅设备像素/图像像素 <1 时启用；1:1 与放大保持 nearest，既有逐像素断言不受影响）。没有它，3× 超采样的收益在离线图里会被 nearest 采样全部丢掉。
  - `MiniGradient` 改为**捕获创建时 CTM、采样时逆变换回用户空间**。旧实现直接在设备像素上套原始坐标：3× 烘焙时顶光渐变只覆盖左上 1/9，离线图与浏览器不等价（实测 1× 直出 vs 3× 降采样平均亮度差 8.2，修复后 0.2）。
- **审核标准校准（v2 的可测量基准变了，必须重标定）**：
  - 所有指标改在 `spriteView1x` 的 1:1 视图上测（不是 3× 原图）。
  - `patchScale`：超采样/材质平滑后连通域只保留色块核心，读数整体下降 ~35%；且材质倒角在轮廓内侧形成高振幅亮/暗带，必须**排除轮廓 3px 带**再量（否则 NATO 被量成 0.08 的边缘带厚度）。目标区 0.18~0.45 → **0.08~0.26**。
  - `tones`：平滑顶光/倒角把亮度铺满 8 个量化级，不再等于「脏」；plain/camo/digital 的 tones 上限放宽到 8（S）。
  - `mipSurvival`：平滑材质使比值可略 >1（大尺度结构保留），上界 1.0→1.15（S）。
  - `continuity`：材质层是逐部件独立生成的光照，不是涂装图案；测量时临时 `setPaintMaterial(false)`，只比涂装层（否则 plain 贴图残差比 2.4）。
- **验证**：`node scripts/audit-textures.js` → v2 **97/100、14/14 ≥80**，v3 **14/14 PASS**；`test-render.js` 新增 3 项断言（`SPRITE_SCALE≥2`、`spriteView1x` 尺寸 = 烘焙/3、材质层关/开像素差 >100）并全部通过（实测 1739px）；`npm run check` EXIT=0；全部 Node 测试 46/47（`test-cover-gen` 仍为沙箱 `spawnSync`/临时文件 rename 环境限制）；`npm test` 整体运行器与 `test:browser` 在本沙箱分别因 `spawnSync EPERM` 与 Edge `spawn EPERM` 无法执行，**待人工补跑浏览器实机**。
- **未采用的更写实路线（留待有浏览器的会话）**：`assets/tanks/*.png` 的 AI 渲染精灵（1200×672 车体/炮塔）质感更强，但需要逐车确认比例/轴心/层序、给队伍色与损伤分级补适配；本沙箱无法启动 Edge，不能目视验收，因此**不擅自启用**。
- **细则归口**：`specs/map.md` §22.1（超采样/材质层/炮管/轮廓光）+ §22.2（3× 缓存）+ §22.6（mini-canvas 双线性/渐变 CTM）+ §23.2/§23.8（重标定后的区间与 v3）。

## §4.94 生存模式四项实机反馈 + 小地图公路/补给点（#U35，2026-10-18）

用户四项要求：生存模式①补给点显示在小地图上 ②卡牌挑选在**每一波结束**（与标准模式同张数）③地图生成算法参考最新标准模式、**道路上不能有房屋树木**；任意模式④小地图上显示公路。

- **④ 小地图公路（根因是坐标语义，不是「没写绘制」）**：`tier='road'` 的 cover 自 `cde3bc3` 起是**整链连续多边形**——`w/h` 只是整链外接 bbox（实测某链 1030×4645）、`angle` 恒 0、真实形状在 `verts`（局部坐标）。旧 `drawMinimap` 把 road 归到 `tierGroup='ground'`，按 **bbox 中心画一个 2.2px 点** ⇒ 一条横贯 17000px 的公路在小地图上只有一个点。改为 `roadCoverPolygonPoints` 逐 vert 平移后**逐点**过 `worldToMinimap`（strip 模式 `sx≠sy`，统一 scale 会画歪）→ path 填充浅灰；顺序在建筑/植被之前，且 `vegCells` 跳过 road 避免重复点；无 verts 的旧 OBB 段回退画点。真实数据光栅化抽查：standard seed=42 最大链 216 verts，小地图 x 跨度 `[-0.1, 170.1]` 满框贯穿。性能 0.21 ms/帧（极端 8 链×1200 verts 0.72 ms）⇒ 不抽稀。
- **① 小地图补给点**：新增 `opts.supplyStations` + 纯函数 `minimapSupplyMarks`——5px 方块 + 十字 + 细描边、色 `rgba(190,255,150)`，与玩家绿点（`#7ed957` 圆 r=3）**异色异形**；`opts.supplyOnCooldown` 变灰。缺省不传零回归。battle 侧仅生存模式传 `currentNode.supplyStations`。
- **② 选卡移到每波结束**：原口径**只有 Boss 波**弹抽卡且固定 **5 选 1**，普通波整场无卡。现 `finishSurvivalWave` 对**每一波**都弹选卡：普通波 `pendingLootRounds=0` → **5 选 2**；Boss 波 `=1` → **5 选 3** 并启用 `RULES.cards.bossRound` 的稀有度/弹种/技能/主副武器保底。`rewardPickTarget()` 删除 `GAME_MODE==='survival' ? 1` 特例，文案与 `shortBy` 同步统一。补给站职责收窄为「回血 + 参数升级商店」。
  - **顺带修掉一个模态穿帮**：生存快速选卡不切 `flow` 态，`loop()` 的 battle 门控拦不住 ⇒ 卡片遮罩后面玩家仍能驾驶/开火（标准模式 reward 屏是冻结的）。把 `survivalQuickPick` 并入 `paused`（只跳 `update`，`draw` 照常渲染冻结快照，与 pause 同款）。
- **③ 生存地图改标准生成链**：删掉 `bossOnly` + `stripForBoss` 两个 hack，改走**标准 `makeNode` + `env.noEnemies`**（不生成常规敌、`quota=null`、`defenseLines=[]`、`boss=null`），尺寸唯一归口 `RULES.nodeMap.strip.survival = {screensX:5, screensY:5, chunkRows:2}`。旧实现在 5×5 屏的 strip 里片高只有 ≈3.05 屏 ⇒ 纵向裁剪后**上下大块空白**（底部 400px 带内元素数 **0**）。新增 `opts.chunkRows` 行×列网格（缺省 1 逐字节零回归，sha1 验证）：`stripH=Σ行高`、纵向不再裁剪 ⇒ 实测 **6.0×6.5~6.6 屏**、349 covers / 8.89 屏⁻¹、底部空白 525→26px。
- **③ 道路上不得有房屋/树木（核心缺陷）**：strip 级路网 cover 在**所有片生成完之后**才 push 进 `covers`，而逐片 `pruneOverlappingCovers`（含 #U32 避路）在片内跑，**看不到 strip 级路面** ⇒ 片内建筑/树/灌木压路无人清理。新增 `clearCoversOnRoads`（verts 精判：顶点互入 + 边相交；旧 OBB 段退化为 SAT），在 `generateNode` 返回前与 `generateStrip` 收尾各跑一次；命中先确定性最小推出、推不出才移除、不耗 rng。实测 8 seed：**压路 0 个**（改前 seed=999 有 9 棵树、seed=7 有 3 栋楼 + 1 个 `soft`、seed=2024 有 1 楼 + 1 灌木；标准 seed=42 有 10 棵）。AABB + 256px 边网格粗筛 ⇒ `test-strip` 8.7s。
- **Lead review 拦下的一个真实退化（值得记的教训）**：实现方初版把「行间接缝净空」做成**行界 ±300px 整带删除 structure/foliage**，在地图上劈出**整条 600px 横贯空白带**（seed=999 y2000~2600 连续 6 个 100px 细带元素数全 0），且其测试断言用「3 seed 取**并集**」把单 seed 空带掩盖了。判定：**行方向不是推进轴，x 向接缝那套「留出可通行竖带」语义不能照搬到行方向**。改为只推「世界 AABB 真正跨过行界」的元素（推不出才删）+ `fillEmptyBands()` 确定性补植，断言收紧为**逐 seed 逐带**。终态逐 seed 400px 空带 **0 个**（100px 仅剩「整带为路面」「<50px 薄片」两类合法情况）。
- **校准基线**：与 HEAD 逐格对照——`coverCoverage` 漂移 **0.000000**、`connectivity` **0.000000**（7 模板×5 难度仍全 1.000）、`minPassageWidth` 最大 **0.168**（口径 ±0.5）⇒ BASE 未改，仅追加带日期的重锚记录。当前最紧 `village_center d=0.1` 0.884→0.716（窗口下沿余 0.316）。
- **三链验证**：① `node scripts/check-html.js` EXIT=0 ② `node node_modules/typescript/bin/tsc --noEmit` EXIT=0 ③ 逐个直跑 `run-tests.js` 列出的 45 项单测：**44 / 45 通过**（`test-cover-gen.js` 为沙箱 `spawnSync`/临时文件 rename 的 EPERM 环境限制，与本批无关——该文件与 `tools/gen-covers.mjs` 均无改动；`run-tests.js` 整体运行器本身也因 `spawnSync EPERM` 无法在本沙箱跑，故改为逐项直跑）。`test:browser` 需系统 Edge，**待正常环境补跑**。
- **细则归口**：`specs/map.md` §24（生存生成链/多行片/道路净空/校准）+ §14.4（小地图公路与补给点）；`specs/combat.md` §14.1b（每波结束选卡与张数口径）。

## §4.95 坦克与地图元素的立体感：侧壁/座圈/树冠球体/岩石多面体（2026-10-18）

- **起因**：用户反馈「炮塔车体没有立体感，地图上的树岩石等缺少阴影，也没有立体感」。
- **核实到的根因**（不是「再加点高光」能解决的）：
  - **坦克**：顶面是平涂多边形 + 一圈暗勾线，没有**高度**；炮塔只是「贴」在车体上。上一轮材质层只改了表面明暗，没有改变轮廓的 2.5D 关系。
  - **树**：`bakeCanopy` 的受光叶团放在**右上方**，而全局影子落**右下**——受光方向与投影方向相反，这是树冠读起来「平」的直接原因；树冠本身也没有整体球面渐变。
  - **岩石**：`rock-poly` 是「平涂灰多边形 + 两条浅色棱线」，没有逐面法线、没有侧壁；投影偏淡。
- **实现**：
  - **坦克侧壁 `drawPartSideWall`**：按世界光反向偏移轮廓实心填充（外层深 + 内层中暗），顶面盖住其余部分，露出背光侧 2~3px 的立面。偏移在世界坐标里固定（局部 `R(−angle)`），车体任意朝向都同光源。**绘制顺序改为「地面影 → 车体侧壁 → 履带 → 车体顶面」**——侧壁若画在履带之后，会把履带链节整块盖掉，像坦克垫了一块黑板。
  - **炮塔座圈**：`drawTurretRing` 改为凸台（右下偏移暗环 + 顶面 + 受光描边 + 虚线座圈缝），放在炮塔软影之后、侧壁之前；炮塔坐在凸台上而不是贴在车体上。
  - **树冠**：`bakeCanopy` 在叶团之上叠左上受光→右下蔽光的线性渐变 + 右下暗冠缘，受光叶团从右上方改到**左上方**；树冠投影三层加深并放大（0.14/0.15/0.17，偏移 5~18px）。
  - **岩石**：逐边三角面按「边法线·光向」着色（暗 `rgb(74,74,71)` → 亮 `rgb(188,188,180)`），加右下侧壁、受光棱边高光、2 条裂缝；`drawCoverShadow` 的 box/rock 三层影 0.13/0.11/0.18 → 0.17/0.14/0.24。
  - **建筑/全高掩体**：`box` 分支在屋顶前画右下偏移 4.5/5.6px 的暗色体块，屋顶盖住其余部分，露出背光侧墙体。
- **回归**：`test-render.js` 新增 ⑧ 五项——⑧a 树冠左上受光 > 右下背光（实测 +38.5）、树冠右下投影 < 裸地（90.8 < 120.9）；⑧b 岩石顶面 ≥3 个量化色阶（实测 7）、左上 > 右下（163.2 > 90.1）、右下外缘有影（72.5 < 120.9）。
- **验证**：`node scripts/test-render.js` 全部通过；`npm run check` EXIT=0；全部 Node 测试 46/47（`test-cover-gen.js` 仍为沙箱 `spawnSync`/临时文件 rename 环境限制）；`npm test` 运行器与 `test:browser` 在本沙箱分别因 `spawnSync EPERM` / Edge `spawn EPERM` 无法执行，**待人工浏览器补跑**。
- **细则归口**：`specs/map.md` §22.8（2.5D 高度与方向光）+ §22.1（炮管/轮廓光）+ §22.4（树冠烘焙）。

## §4.96 地面纹理抖动与掉帧：视口锚定烘焙 + 相机屏幕像素对齐（#GT/#U36，2026-10-18）

用户反馈：「部分地图 biome（如雪地、沙漠）的纹理会随着玩家移动变化，相应的帧率也大幅下降。」——**两个互相独立的成因**，只修一个只能解决一半。

- **先证伪了最直觉的猜测**：地面纹理由「世界格 hash」派生，几何层本就世界锚定。用 `Proxy` 记录全部 path 图元的世界坐标做集合比对（相机位移取 biome 自己的 cell 整数倍，避免格边界干扰）：6 个 biome 的 Jaccard 相似度 0.75~0.87，差集完全来自视口裁剪 ⇒ **不是「纹理跟着相机生成」**，问题在别处。这一步避免了去改本该正确的 hash 逻辑。
- **成因一（性能）：每帧重画世界锚定纹理**。`_paintGroundTexture` 每帧重算并重描全部图元，而这些图元与相机无关。1920×1080 实测：snow **11,717 图元**、meadow 14,047、desert 4,777、mudland 6,455；zoom 0.5 看全图时 snow **45,087**、mudland 23,641 —— 单帧地面纹理 31~85ms，而 60fps 总预算只有 16.7ms。**此前的「alpha 分桶合批」只把每图元 5 次调用压到每桶 2 次，图元数本身没变，所以仍然掉帧**。
  - 修法：`ensureGroundCache`/`drawGroundCached` 把地面层烘焙进视口大小的离屏画布、按世界坐标锚定；相机在内半区移动时只 blit 1 次，过迟滞才重烘焙。实测每帧 ctx 调用 **11,742 → 6**（snow@zoom1）、**45,112 → 6**（snow@zoom0.5），烘焙 1/40 帧（97.5% 命中）。
  - **返工记录**：首版护栏按「世界尺寸 > 4096 不烘焙」，而 zoom 0.5 时世界视口 3840×2160 +MARGIN = 4480×2800 ⇒ 被误拒，**正好掉在最需要优化的场景**。现改为按缓冲**像素数**判定，并把烘焙缓冲区按「世界尺寸 × zoom」建，使任何 zoom 下缓冲成本恒为视口像素级。
- **成因二（观感）：亚像素重采样**。`cam.x/cam.y` 是阻尼跟随的浮点值，`translate(-cam.x,-cam.y)` 把世界推进亚像素位置；1~2px 的高对比细图元（雪粒、沙纹 1.2px 描边）每帧以不同相位重采样 ⇒ 亮度逐帧跳变。**这解释了为什么只有雪地/沙漠这类细纹理 biome 明显**。
  - 修法：`renderCamPos(cam)` 给出屏幕像素对齐的渲染位置 `round(cam.x·zoom)/zoom`。
  - **关键教训——量化必须在屏幕空间**：屏幕位移 = `δ·zoom`，须 `δ·zoom ∈ ℤ`。我第一版写成 `round(camX)`（世界整数），在 zoom≠1 时屏幕位移仍带小数：实测 zoom 1.6 时残差 **0.80%，比不取整的 0.41% 更差**（zoom 0.8 也退化到 0.31%）。改为 `round(camX·zoom)/zoom` 后 6 个 zoom 全部 **0.00%**。端到端终验（3 zoom × 2 biome × 360 世界点）：**像素对齐后最大通道差 0**，旧行为最大 27。
  - 纯渲染取值：物理/AI/命中继续用浮点 `cam.x/cam.y`。
- **成因三（同批发现）：biomeZones 1 维 x 带的区段重叠（#U36）**。上一批 #U35 引入 `chunkRows=2` 后，`chunks` 是行×列展开而 zone 只有 x 区间 ⇒ 同列不同行 x 相同、biome 不同；`drawGround` 又按视口全高填充 ⇒ 后画整片盖住先画，两个 biome 的**纹理层叠在同一片像素上**（alpha 叠加偏亮 + 纹理密一倍），视口边缘切换时同样读作「纹理在变」。改为 2 维矩形 `{x0,x1,y0,y1,biome}`，`y1` 取**行带高**（不是 chunk 自身 `c.h`——那会在行间留 37~147px 纵缝）。
- **一个踩过的度量陷阱（写进 specs 防复犯）**：不能用 `mini-canvas` 的墙钟时间去判断缓存是否生效——它的 `drawImage` 是纯 JS 逐像素拷贝，与浏览器 GPU blit 差几个数量级，实测「直绘 vs 缓存」比值恒为 **1x**，完全掩盖了真实收益。正确指标是与实现无关的量：每帧 ctx 调用数（Proxy 计数）/ 烘焙次数 / 像素一致性。
- **三链验证**：① `node scripts/check-html.js` EXIT=0 ② `node node_modules/typescript/bin/tsc --noEmit` EXIT=0 ③ 逐个直跑 `run-tests.js` 列出的 45 项单测 **45 / 45 全绿**（本次沙箱下 `test-cover-gen.js` 亦通过）。`test-render.js` 新增 ⑨a~⑨f 共 8 条断言，并对 ⑨a/⑨c/⑨e 做了**变异测试**确认非空转（分别改回世界取整 / 缓存 key 去掉 biome / 强制直绘，三条全部变红）。`test:browser` 需系统 Edge，**待正常环境补跑**。
- **细则归口**：`specs/map.md` §25（地面烘焙 + 相机对齐 + 2 维 zone）+ §22.5b（drawImage 不可互换的度量教训）。

## §4.97 河流三修：道路免疫几何误判 / 河宽上限 / AI 敢涉水（#U37，2026-10-18）

用户反馈三件事：①「河流贴图和实际『溺毙』生效的范围不一致，有的贴图有河流但是没有减速+溺毙效果」②「河流的宽度需要限制，不能造成坦克无法涉水过河」③「敌方 AI 的避水算法造成他们也不敢涉水追击玩家」。三条各有独立根因，且都不在最初怀疑的地方。

- **① 贴图 vs 物理不一致 —— 根因是「道路免疫」的整链凸包 SAT 误判**。`tankFullyInWater` 有「道路优先」豁免（桥/路口语义：在路上不算浸水），`driveTank` 也在 `roadCover` 存在时跳过 river 减速。问题在 `getRoadUnderTank` 的判定本身：道路自 `cde3bc3` 起是**整链连续多边形**（`w/h` 只是 bbox、真实形状在 `verts`），旧实现拿**整条曲折路链的凸包**做 SAT。
  - 实测 `main-road-d0` bbox **1030×4645**，真实路面仅占 bbox **12.3%**；距路心 **894~1109px** 的河面点被判「在路上」⇒ 成片河面获得溺毙免疫 + 丢失减速。
  - 河内取样点 **16.8%** 被判在路上，其中**车体完全碰不到那条路**的真误判 **8.3%**。
  - 修法：带 `verts` 的路链改走**真实多边形**判定（射线法点测 + 车体边/多边形边相交 + WeakMap 缓存 + AABB 两级粗筛）；无 verts 的旧式矩形路段保留 SAT。
  - 结果：真误判 **8.3% → 0%**（Lead 独立复核 360 个命中位置，几何不相交 = 0）。**性能反而变好**（标准 strip 8.7 vs 旧 284.9 µs/次——旧凸包在 318 顶点链上的 SAT 本就极贵）。
- **② 河宽上限** `RULES.drowning.wadeMaxWidth = 260`：口径 = 8s 溺毙倒计时内**最慢可用车**能渡过的宽度（水中速度 = `maxSpeed×1.6×0.4×1.3`，hummel maxSpeed 40 ⇒ 266px，取 260 留余量）。改前河宽 p50 573 / max 805 ⇒ **hummel 穿 446px 河要 9.8s > 8s 必溺毙**（中坦 5.1s 可过）。改后 `thick` 基准 7~15%→**4~9%** + `buildRiver` 出口逐段钳制 ⇒ p50 237.7 / **max 260**，保留沿程宽窄变化。端到端（5 车型 × 8 seed × 4885 河段）：**溺毙 0 次**，最险 hummel 5.7s/8s（余量 2.3s）。
- **③ AI 敢涉水**：`isWaterAt` 原把 **water 与 river 一视同仁**，于是 AI 把 `passability=0.4` 的可涉水河当禁区——前向探点落河就转向、三向全水就 `move=0`，**玩家过河即脱离追击**。改为 `_waterHazardTier()` 分档：`water` 恒危险，`river` 以 `RULES.coverTiers.river.passability > 0` 判可涉水（判据不写死 tier 名）。water 的三条既有语义（绕行/潭心脱困/与河重叠时生效）全部保留。真·追击样本里被避水打断直线追击 **100% → 0%**。
- **两个我实测踩到的度量陷阱（已写进 specs 防复犯）**：
  1. 用 `aiDecide` 量「AI 敢不敢过河」**必须固定机动随机源**（`_maneuverSetRng(()=>0.5)`）——`_applyManeuver` 按 `Math.random` 抽 `retreat` 模式会输出 `move=-1`，与河流毫无关系。我第一版没固定，量出 **21.3% 假阳性**；固定后为 **0%**。
  2. 样本必须筛「基线本身在前进」——AI 在交战带内沿本就会驻停（`move=0`），那不属避水。原 `probe-river-final.js` 第③段把 AI 与目标只放 580px（落在交战带内沿），修前修后都是 100%，对修复完全不敏感。
- **三链验证**：① `node scripts/check-html.js` EXIT=0 ② `node node_modules/typescript/bin/tsc --noEmit` EXIT=0 ③ 逐个直跑 `run-tests.js` 列出的 45 项单测 **45 / 45 全绿**。`test-covers.js` 新增 ∩ 形路链凹口等 6 条（改前红、改后绿）；`test-ai.js` 新增 5 条分档断言——其中原「河岸偏移→固定右转」一条用的是 river，与新语义**直接冲突**，已按分档语义替换（water 的三条全部保留，未放宽任何既有语义）。`test-strip.js` / `test-nodegen.js` 因河宽变窄**未变红，未放宽任何断言**。`test:browser` 需系统 Edge，**待正常环境补跑**。
- **细则归口**：`specs/map.md` §11.1（三处修复的现行口径与实测数字）。

## §4.98 电磁轨道炮细节与专属射击特效（#U38，2026-10-18）

> **已被 §4.102（#U41，2026-10-19）取代的部分**：本节确立的「青蓝电磁弧光」配色、「电弧尾迹跟随炮弹」与 `shellTrailArcs` 弹体电弧通道**均已废除**——用户裁定**电弧只挂炮身**且配色改为**灰炮管 / 蓝基底 / 白弧光**。其余结论（三段视效骨架、`railChargeProgress` 与 fireTank 同源、`lightningPath` 共享工具、`firerail` 音效、`railArcCount` 访问器）继续有效。

用户需求原文：「为电磁炮增加细节和特殊的射击特效，包括充电的电弧等」。

改前状态：电磁炮与标准主炮共享同一套弹体画法（琥珀色尖头弹 + 琥珀拖尾）、同一个开火音效（`fire`）、同一个装填环配色（`#ffb454` 琥珀）；炮身只有「两根细轨 + 一条青色能量线」，`spawnMuzzleFlash('railgun')` 虽是专属分支但只有一支能量锥 + 5 条手写 zigzag。整条视效链**除了炮口焰之外没有任何一处读作电磁武器**。

- **参数唯一口径**：新增 `RULES.railgunFx`（`js/tank_rules.js`）——`chargeArcs` / `chargeArcSegs` / `chargeArcWidth` / `chargeBreechGlow` / `chargeIdleAlpha` / `dischargeArcs` / `dischargeLife` / `dischargeLenMult` / `shellTrailArcs` / `shellGlowScale` / `shellLenMult` 共 11 项。三段视效（充能 / 击发 / 弹道）共用一张表，改数值只改一处。
- **共享几何工具** `js/tank_utils.js lightningPath(x0,y0,ang,len,amp,segs,seed)`：确定性折线、两端收敛到轴线（`sin(πt)` 权重）、抖动由 seed 哈希派生。`tank_fx`（炮口/放电弧）与 `tank_battledraw`（炮身充能弧/弹体尾迹）两处消费，避免各写一套 zigzag（旧代码在炮口焰里手写过一份）。
- **① 充能（装填期）**：`tank_battledraw.js railChargeProgress(t)` 纯函数，时长口径**与 `fireTank` / HUD 装填环完全同源**（`stats.reload × reloadMult ÷ debuffReloadRate`，即 2026-09-21 #G5 修正过的那条）——不新开一个进度源，避免出现「环满了电弧还没满」。充能进度驱动四个量：轨间能量芯亮度、后膛能量核呼吸、充能电弧**条数与振幅**；满电后切「微光待机」（`chargeIdleAlpha`）而非全灭。炮身在原双轨基础上补到**六层结构**（导轨本体 + 内侧受光 + 3 圈横向箍环 + 能量芯 + 后膛核 + 充能电弧），箍环是「读作一根炮管」的关键。
- **② 击发放电**：`tank_fx.js spawnRailDischarge` 在 `firePrimaryShell` 的 railgun 分支自 `gunRoot` 沿炮管全长生成 `dischargeArcs` 条电离折线（`railArcs` 数组，上限 24 防堆积），0.22s 内沿炮向收束淡出；炮口额外一圈青白电离冲击波。绘制走**双层结构**（宽而淡的青蓝晕 + 1px 白热芯），与既有炮口焰的分层纪律一致。
- **③ 弹道**：`drawShells` 新增 `s.wType` 通道（`firePrimaryShell` 只写武器**类型**，不挂整个 spec）。电磁炮弹改为**针状白热电离弹**（长 ×1.9 / 宽 ×0.55）+ `shellTrailArcs` 条电弧尾迹 + 径向外发光，与琥珀色普通弹一眼可分。
- **音效**：新增 `SOUND_DEFS.firerail`（高频方波放电下扫 + 带通噪声横扫电离空气 + 延迟低频炮身共鸣 4 层）；`fireTank` 的 railgun 分支改播该键。电磁发射没有火药爆燃，「砰」这个采样本身就是错的。
- **HUD**：battle 单环装填分支对 railgun 改青蓝双层充能弧（外层微光随进度升高 + 内层白热芯），与炮身充能同色系；其他武器单弧行为零变化。
- **纪律遵守**：新增绘制**零逐帧渐变分配**（弹体外发光与后膛核一律走 `tank_fx._radialSprite('haloR')` + `_blitRadial`，不新建 `createRadialGradient`）；draw 期**无 `Math.random`**（电弧抖动全部走 `lightningPath` 的 seed 哈希 / `_fxHash` / `_flickerAt` 时间量子）。
- **三链验证**：
  - `node scripts/check-html.js` → `All checks passed`（EXIT=0）
  - `node node_modules/typescript/bin/tsc --noEmit` → EXIT=0
  - 逐个直跑 `run-tests.js` 列出的 46 项单测 **45 / 46 全绿**；唯一红项 `test-cover-gen.js` 的两条失败（`tools/cover-refs.json` 一致性、`gen-covers --provider mock` 退出码 null）在本轮**未触碰相关文件**，单独复跑 `node tools/dump-cover-refs.mjs --check` 得 **EXIT=0**、且该测试的 `spawnSync` 在沙箱下会 `EPERM`（同 `run-tests.js` 自身 `spawnSync ... EPERM` 的表现）——判定为**沙箱环境限制**，非本轮回归；`npm test`（经 `run-tests.js` 转发）因此整体报 exit=1，需在正常环境复跑确认。
  - `test-render.js` 新增 ⑩ 小节 15 条断言：电弧确定性/随 seed 变化/端点收敛/中段抖动、充能进度同源（0 / 0.5 / 1）、非电磁炮恒为 1、炮身青蓝像素 +59、充能阶段可辨、放电弧生成 9 条 / 上限 24 / 有内容 / 重绘逐字节一致、弹体青蓝像素 237 / 形态差 308px / 长度 48 vs 24px / 重绘一致。
  - `npm run test:browser` 需系统 Edge + 放宽进程权限（沙箱 `spawn EPERM`），**待正常环境补跑**；浏览器目视确认（电弧动感、充能节奏手感）同样留用户侧。
- **一个测试基础设施陷阱**（已固化为 `railArcCount()`）：`updateFx` 用 `railArcs = railArcs.filter(...)` **重新赋值**数组，因此 `module.exports` 里导出的 `railArcs` 只是导出那一刻的引用，过滤一次后外部读到的永远是陈旧长度（`tracers` / `shockwaves` 等既有数组有同一陷阱）。要读「当前有几条」必须走访问器，不能直接读导出数组。
- **细则归口**：`specs/combat.md` §6「电磁轨道炮三段视效」。

## §4.99 主/副武器升级卡全覆盖 + Boss 随机武备（#U39，2026-10-18）

用户需求原文：「检查主武器、副武器的升级卡牌有哪些？要增加这些武器的性能，boss 似乎还不会随机到这些武器和升级」。
用户裁定（同轮两问）：① 升级卡做法 = **新增更多升级卡（每种武器 2~3 张）**；② Boss 随机范围 = **主武器 + 副武器 + 对应升级卡**。

### 改前实测（2026-10-18，171 张卡）

- **主武器 5 型共 9 张**：`standard` **0 张**、`autocannon` 1、`double_barrel` 2、`railgun` 1、`clip` 1（+4 张安装卡）。
- **副武器 6 型共 10 张**：`mortar` 1、`missile` 2、`rocket` 2、`mine_layer` 1、`missile_wire` **0**、`turret` **0**；且 `turret` / `missile_wire` **连安装卡都没有**（`turret` 只在 Boss/bench 内部使用）。
- **Boss 侧**：`assignBossSkills` 只随机 4 个**技能**键，`spawnBossFromDef` 全程不写 `weapons.*` ⇒ Boss 永远用标准主炮 + 空副武器，也从不吃任何武器升级卡。

### 修掉的 4 处「升级卡写了不生效」通道断点

1. **标准主炮通道是死的**（`js/tank_fire.js:62` `primaryWeaponSpec`）：对 `type==='standard'` **恒返回 null** ⇒ `weapons.primary.stats` 里的 `statOverrides` 全被忽略。这是「主武器升级卡感觉没提升」的结构性根因，也是此前没有任何 standard 升级卡的原因。现改为「无 stats 覆写仍返回 null（零回归）、有覆写才产出规格」。
2. **`missile_wire` 不在卡牌白名单**（`js/tank_cards.js` `WEAPON_SECONDARY_TYPES`）：该型一直在 `RULES.weaponTypes.secondary` / `WEAPON_DEFAULTS` / `fireActiveSecondary` 的 wire 分支里，却漏在白名单外 ⇒ 任何线导导弹卡都会被 `validateCardEffect` 判「weaponType 非法」。
3. **`mine_layer` 半径是写死的字面量**（`js/tank_weapons.js` `fireActiveSecondary`）：`blastRadius 70` / `triggerRadius 45` 直接写在 `spawnMineFn` 参数里，升级卡无法覆盖。
4. **`missile_wire` 速度是写死的字面量**：wire 分支 `cfg.speed ?? 340` 读不到缺省表里的 `speed`（该字段此前根本不存在）。

### 落地内容

- **新增 20 张武器卡**（15 升级 + 2 安装 + 3 已计入上面分类），卡池 **171 → 191 张**：
  - 主武器 9 张：standard ×3（rare `_damage` / rare `_reload` / epic `_pen`）、autocannon ×3（rare `_damage` / rare `_heat` / epic `_feed`）、railgun ×1（rare `_damage`，含 `pierce` 1→2）、clip ×1（rare `_capacity`，`"+2"` 容量 + 发际 0.55s）、double_barrel ×1（rare `_turret`）。
  - 副武器 11 张：turret **安装** ×1 + 升级 ×3（rare `_upgrade` / rare `_traverse` / epic `_heavy`）、missile_wire **安装** ×1 + 升级 ×2（rare `_upgrade` / rare `_warhead`）、mortar ×1（rare `_accuracy`）、mine_layer ×1（rare `_radius`）、rocket ×1（rare `_warhead`）、missile ×1（rare `_damage`）。
  - **覆盖结果**：主武器 `standard 3 / autocannon 4 / double_barrel 3 / railgun 2 / clip 2`；副武器 `mortar 2 / missile 3 / missile_wire 2 / rocket 3 / mine_layer 2 / turret 3` —— 无「只有 1 张」的类型。
- **Boss 随机武备**：新增纯函数 `pickBossArmament(pool, {rng, bossNumber})`（`js/tank_cards.js`）+ battle 侧 `assignBossArmament`（在 `assignBossSkills` 之后调用，经 `applyCardEffects` 施加 —— 与玩家卡牌**同一语义通道**）。参数唯一口径 `RULES.boss.armament`（`primaryChance 0.9` / `secondaryChance 0.7` / `upgradeMax 2` / `upgradeChance 0.55` 逐 Boss +0.1）。升级卡只挂在**已选中**的主/副武器类型上，任一步无货静默跳过。
- **可读性**：TAB 状态面板 Boss 行追加 `· 武备:主武器+副武器·改装×N`；出生日志 `BOSS 武备：…｜改装 …`。

### 实测（2026-10-18）

- **Boss 武备分布**（500 次探针 / 真实卡池 191 张）：平均每 Boss **3.27 张**武备卡（升级卡 830 次），`applyCardEffects` 失败 **0** 次；主武器五型各 **22.2%~22.8%**（仍标准炮 9.8%）；副武器六型 **10.8%~12.2%**（空槽 29.6%）。
- **复核带（`test-weapon-upgrade-balance.js` 从 4 张扩到全部 upgrade 卡）**：分三档——纯 DPS 通道增益 ∈ [1.15, 1.75]；混合通道 DPS ≥ 1.0 且功能字段实际变化；纯功能性通道 DPS = 1.0 且有 ≥1 字段相对基础规格变化。原 4 张（#S6 定案）另按历史紧带 [1.25, 1.60] + 极差 ≤0.35 复核，**结论不回退**（1.333 / 1.524 / 1.389 / 1.500，极差 0.190）。另加「升级卡的 weaponType 必须有对应安装卡（standard 豁免）」契约断言。

### 三链验证

- `node scripts/check-html.js` → **All checks passed**（EXIT=0）；`node node_modules/typescript/bin/tsc --noEmit` → **EXIT=0**（`npm run check` 等价）。
- **46 个 Node 单测逐个直跑全部 EXIT=0**（含 `test-cards` / `test-fire` / `test-weapon-keypress` / `test-weapon-upgrade-balance` / `test-boss` / `test-render` / `validate-content` / `audit-content`）。`npm test`（`run-tests.js` 转发）在本沙箱因 `spawnSync ... EPERM` 无法启动子进程，故改用等价直跑（同 §4.90/§4.98 记录的环境限制）。
- **新增断言**：`test-cards.js` #U39 段 20 条（配置就位 / 升级卡只挂已选型 / 张数 ≤ upgradeMax / 300 轮分布覆盖主副武器与升级卡 / `turret` 与 `missile_wire` 可被随机到 / `enabled=false` 恒空 / 空池与 null 安全 / 施加通道 / 20 张新卡 schema / 全型有升级卡）；`test-fire.js` 7a2 段 6 条（standard 无覆写 → null、有覆写 → dmg/pen/reload/speed 四通道生效）；`test-weapon-keypress.js` #U39 段 5 条（地雷半径缺省 70/45 与升级 105/70、线导弹速 340→560、装填覆写）。
- `npm run test:browser` 需系统 Edge + 放宽进程权限（沙箱 `spawn EPERM`），**待正常环境补跑**；浏览器内目视（Boss 随机换炮的实际手感、TAB 面板武备行）留用户侧。

### 细则归口

`specs/cards.md` §8.3「武器升级卡全覆盖」+「Boss 随机武备」、`specs/boss.md` §4「Boss 随机武备」、`specs/combat.md` §8.6b「标准主炮的规格通道」+ §8.1 地雷半径收口注记 + §8.2 线导弹 speed 收口注记。

### §4.100 植被立体感：树/灌木/倒树方向光与体积（#TEX14，2026-10-18）

**用户反馈**：树（含树冠和倒下的树干）、灌木绘制缺乏立体感。

**根因**：§4.95（#TEX13）只给树冠/岩石/建筑补了方向光，但 `js/tank_assets.js` 的植被 bake 仍是**平涂 + i%2/i%3 循环色**：① 灌木/倒树树冠的 5 大叶团 + 9/11 小叶团颜色只按序号奇偶/取模轮换，与光照方向无关，读作「一坨均匀的绿」；② 树干（tree.bake）与倒树树干（fallen.bake）是单色圆/椭圆，无受光面；③ 灌木没有冠层体积渐变（只有树有）。

**修法（全部只改颜色/渐变/线宽，不改几何包络——`tools/cover-refs.json` 尺寸基准不动）**：

- **叶团方向光**：灌木/倒树树冠的全部叶团与叶点改按「叶团中心相对全局光源（左上 L=(-0.7071,-0.7071)）方向的连续插值」取色（受光侧亮绿、背光侧暗绿，alpha 同步随 lit 0.36~0.54）；树的 11 叶团同改。
- **树干圆柱受光**（tree.bake）：底部接触影 + 左上→右下线性渐变（rgb(96,72,40)→rgb(34,24,12)）+ 左上受光月牙弧 + 7 道受光半弧树皮纵纹（明暗 hash 确定性）。
- **倒树树干**（fallen.bake）：接触影 + 上下受光渐变（上缘 rgb(94,68,40)→下缘 rgb(30,20,10)）+ 上缘受光细线 + 9 道沿干树皮横纹（根部密梢部疏）+ 枝杈受光/背光两档明暗 + 伐倒断面受光渐变。
- **冠层体积**：灌木补 clip 在 0.42 包络内的球面体积渐变 + 左上受光叶团两枚 + 右下暗冠缘弧；倒树树冠同套；树冠体积渐变对比加深（0.28/0.40）+ 右下自阴影加深 + 左上追加小亮叶团。

**验证**：`node scripts/check-html.js` + `tsc --noEmit` EXIT=0；`test-assets`/`test-render`（⑧a 树冠左上 127.4 > 右下 61.8、投影 90.8 < 裸地 120.9）/ `test-covers`/`test-tanks`/`test-map`/`test-nodegen`/`test-minimap` 全 EXIT=0；`render-map-shot.js --focus village` 1.2×/3× 出图目视确认叶团明暗、树干受光与落影方向一致。

**细则归口**：`specs/map.md` §22.4 + §22.8。

## §4.101 卡牌系统审计五修：调校/升级混淆 · 反应装甲再充能 · 达限补齐 · innate 豁免 · economy 接线（#U40，2026-10-19）

**用户反馈原文**：「获取新弹种的卡和弹药参数升级的卡牌似乎没有正确分类，搞混淆了。另有一些卡是只生效一次如反应装甲，显然不合理；有些升级卡牌在相应参数满级达限后就不该再出现了，比如射速、精度等升级。检查其他卡牌是否有需要改动的地方」。

### ① 调校卡/升级卡混淆（结构性根因，最高优先）

**根因**（`js/tank_cards.js` `applyCardEffects` 弹种链分支）：链前驱推断为 `ef.replaceAmmo || CHAIN[ef.key]` **无条件回退**——带 `field` 的纯数值调校效果（`demo_apcr_round`「APCR 穿深 +20%」/ `sniper_sabot_round` / `demo_shaped_liner` / `he_overpressure` / `heat_composite_pen` / `sniper_apcbc` / `sniper_hard_core` 等 8 张）只要「CHAIN 前驱在 loadout」就被**误判为升级卡**，把玩家槽位里的 AP 原地改名成 APCR/HEAT 等（弹种变了、卡面只承诺 +数值），且这批卡 `maxStacks` 2~4 可反复触发。`isAmmoUpgradeCard` 与 `drawCardChoices` 链过滤同一回退口径（节奏衰减误伤调校卡）。

**修法（三处同源口径）**：升级效果 = 显式 `replaceAmmo` ∨（**无 field** 且 CHAIN 有前驱，兼容阶段六遗留的无 field 演变数据）；带 `field` 的调校效果**绝不触发替换**、不写 `unlockedAmmo`、不参与链前驱资格判定与升级节奏衰减。`ammo_upgrade_*` 12 张链升级卡照常工作（显式 `replaceAmmo`）。

### ② 反应装甲一次性消耗 → 拦截后进入再充能

**改前**（`js/tank_physics.js` `resolveHit` #U19）：拦截 1 发即将条目从 `cardEffects` **splice 消解** ⇒ 传奇卡整局只生效一次。**改后**：拦截后条目保留、写 `_reactiveRearmT = RULES.cards.reactiveArmor.rechargeSeconds`（**60s，唯一口径**）并置 `_reactiveReady=false`；冷却期内照常按装甲/跳弹结算；`updateReactiveArmorRearm`（`js/tank_cards.js` 新增，battle 主循环接入）逐帧递减、归零恢复就绪；`applyCardEffects` 获得时立即可用；battle `enterBattle` 每节点重置就绪（冷却不跨节点携带）。卡面 `cards/reactive_armor.json` 同步改写。同一时刻恒 1 层（maxStacks=1）。

### ③ parameterLimits 补齐（满级参数卡不再出现）

`RULES.parameterLimits` 此前无 `aimSpeed` / `trackLock` / `fireControlCrit` / `loaderAmmoCrit` 条目 ⇒ `cardEligible` 的 #U20 达限过滤对精度/履带/暴击卡**永不触发**，满级卡反复占用三选一位。补齐：`aimSpeed 0.1~6`（⚠ 实测 `tanks/*.json` 基准包络 **1.0~2.5**，与 makeTank 缺省 `RULES.spread.shrinkRate=0.15` 是**两套量纲**——首版 0.9 上限曾把 Obj 780 等真实坦克的基础值都钳爆，`test-card-effects` 22 项失败后修正）、`trackLock 3~20`（基准 8s；局内商店 `track_field_kit` 限 5s，卡牌稀有通道允许压到 3s）、crit 双通道 `0~0.25`（= `RULES.modules.critBonusCap` 同源）。`computeStats` 聚合侧同步补 `aimSpeed.max` / `trackLock.min` **无条件钳制**（对齐 crit 通道既有行为——reload/maxSpeed 硬限只钳参数通道，这两项跟随 crit 走无条件）。

### ④ innate 强化卡被 #U18 已持去重误杀

#U18（2026-10-17）「已持技能去重」没有豁免 innate 键 ⇒ `repair_kit`（应急维修）与 `support_extinguisher`（自动灭火器）在 `abilities` 含固有键时**永远不合格**——而玩家开局就「持有」repair/medkit/extinguish，这两张纯强化卡自此死卡（#U21 只改了卡面文案，没解决抽取资格）。修法：`cardEligible` 去重分支加 `ABILITY_KEYS_INNATE_LOCAL`（`js/tank_cards.js`，与 `tank_abilities.ABILITY_KEYS_INNATE` 同源）豁免；runtime 键照旧去重。

### ⑤ economy 卡接线补全（原「运行时消费待接线」）

- `scoreMul`：**语义修复**——旧实现 `(runScoreMul||1) × (1+value)` 把 `value=1.15` 错算成 **×2.15**；现行 value 即最终乘数（×1.15）。接线三处计分点（`finishNode` 节点分 / `finishSurvivalWave` 波次分 / 击杀分）统一乘 `runScoreMultiplier(tank)`（`js/tank_cards.js` 新增）。
- `shopDiscount`：接线局内商店——`buyRunShopItem` 实付价与 `buildRunShopInto` 展示价同口径乘 `(1 − runShopDiscount(tank))`（多张相加、防御上限 0.5；原注释「跨局字段」为误注）。
- `reviveCount`：battle `pickCard` 即时回算 `player.revives`（原只在下局 `prepPlayerForRun` 生效，局内获得零反馈）。
- `startScore`：写 `runStartScore`（卡池内无该卡，消费方仍预留）。

### 三链验证（2026-10-19）

- `npm run check`（check-html + tsc --noEmit）→ **All checks passed / EXIT=0**。
- `npm test` → **46 通过 / 0 失败**（含 `test-cards` 新增 #U40 段 31 条：调校不改 loadout / 升级照常替换 / 旧式无 field 兼容 / isAmmoUpgradeCard 口径 / 链过滤放行 / 反应装甲拦截·条目保留·再充能·冷却期不重复拦截 / parameterLimits 三组达限过滤翻转 / innate 豁免 + runtime 去重口径不变 / economy 助手与 ×1.15 语义）。
- `npm run test:browser` 四链（smoke/r3/run/r4）→ **全部通过**（r4 全程无 console/page error）。
- 存量问题顺手修复：`test-cover-gen` 的 `tools/cover-refs.json --check` 失败系**他批次贴图重烘焙后基准未重导出**（stash 验证与本批次改动无关），重跑 `node tools/dump-cover-refs.mjs` 重导出 9 键基准后全绿。

### 细则归口

`specs/cards.md` §3（ammo 调校/升级分界 + passive 反应装甲 + economy 接线现状）、§8.5 后（innate 豁免）、§9（#U20 边界补齐）；`specs/combat.md` §3.1（弹种链替换口径指针）；参数唯一口径 `js/tank_rules.js` `RULES.parameterLimits` / `RULES.cards.reactiveArmor`。

## §4.102 电磁炮三色口径与电弧归属修正（#U41，2026-10-19）

用户反馈原文三条：①「电弧是加在炮身上而非炮弹上」②「炮管要是灰色炮身」③「蓝色基底」④「白色弧光」。本质是对 §4.98 的两点否定：**电弧放错了对象**、**配色口径完全不对**（旧实现炮身取车体涂装色 `shade(bCol, …)`、弧光是青蓝 `rgba(110,205,255)`、弹体还带 3 条青蓝电弧尾迹）。

- **① 电弧只挂炮身（归属修正）**：`drawShells` 的 railgun 分支**删掉整个电弧尾迹段**（旧 `shellTrailArcs` 3 条 `lightningPath`），只保留针状弹体 + 白热渐隐拖尾 + 冷白外发光。`RULES.railgunFx.shellTrailArcs` 配置键**一并删除**（不留死键）。炮身侧则加强：`spawnRailDischarge` 新增 `startT`（起点沿炮管轴向 `0~0.55` 铺开），弧不再全挤在根部；`drawRailArcs` 起点按 `startT` 前移、横向振幅压到炮身量级，读作「炮身放电」而非「向四周喷射电光」。
- **② 三色口径（配色修正，现行唯一口径）**：`RULES.railgunFx` 新增 8 个颜色键，炮身六层按角色取色——
  - **炮管 = 灰**：`barrelGrey #787d84` / `barrelGreyDark #4a4e55` / `barrelGreyLit #a8aeb6`。双轨本体画成**三层明度**（暗边、中间调、内侧受光高光），3 圈箍环同样取灰。**与车体涂装色彻底解耦**——旧实现 `shade(bCol, -48)` 会让电磁炮跟着车体变色，这是「不是灰炮管」的根因。
  - **基底 = 蓝**：`baseBlue #2f5d8c` / `baseBlueDeep #1b3550` / `baseBlueLit #4d8ec4`。新增**⓪ 蓝色基底衬底**层（比导轨更宽，含端部底座外延），用 `source-over` 实色绘制——基底是**固体结构**不是光，不进 `lighter`，否则会被叠加成发白。
  - **弧光 = 白**：`arcWhite #ffffff`（弧芯）+ `arcHalo rgba(214,232,255,1)`（冷白晕，`b−r=41`）。充能弧、能量芯、后膛核、放电弧、炮口核心/光晕/冲击环、电离烟、HUD 装填环**全部改白**。
- **③ 配套 sprite**：`_radialSprite` 新增 `coreW`（冷白核心）与 `haloW`（冷白晕），与既有 `core`/`halo`（琥珀）/`haloR`（青蓝）并列。青蓝 `haloR` 保留给跳弹/护盾等既有语义，**不再被电磁炮消费**。
- **④ 炮口同步收白**：`spawnMuzzleFlash('railgun')` 的能量锥、白热长矛、残余分叉（5 条 → **3 条且更短**，不喧宾夺主）、核心、光晕、冲击环全部转白；`tank_fire.js` 的炮口冲击波 `rgba(140,225,255)` → `rgba(235,244,255)`。
- **⑤ 实机 1:1 出图复核发现的两个结构缺陷（不靠猜，逐像素定位）**：
  1. **蓝色基底连 1 个像素都画不出来**。实测电磁炮 `barrelWid` 仅 **3.24px**（= `turWid 36 × width% 18 ÷ 2`），而两根导轨各 1.5px 已把 `railOff − railW×0.45` 算出的 0.7px 缝隙**完全盖掉**——逐列采样 x=165 处炮管中段 `y=99,100` 是**全透明**，炮管读作「空管」。修法不是继续在 3px 里硬塞，而是**加宽炮管本身**：`RULES.railgunFx.barrelWidMult = 2.2`（电磁炮本就是笨重的电磁加速器，加宽符合设定）。**纯视觉**，只影响 `drawTank` 局部变量，不改 `gunRoot`/`gunTip` 与炮口特效坐标。修正后同一列读出 `(124,177,232)` 蓝缝 + 上下 `(168,174,182)` / `(74,78,85)` 灰轨。
  2. **白色吃掉蓝色基底**。首版待机态白芯 `alpha 0.95`、线宽盖满整条缝，实机是一根通体发白的炮管——与「蓝基底 + 白弧光」正相反。改为**白/蓝配比纪律**：待机白芯压到 **0.18**、后膛核半径 ×2.4→×1.6 且 alpha 减半；**「白」的主载体是充能电弧与击发放电**，不是那条连续的轨间芯。修正后炮管区域颜色直方图：灰 `120,125,132` 22px / 蓝 `47,93,140` 及变体 24px / 白仅作点缀。
  3. 同批把线宽按实测量级重配：`chargeArcWidth 1.6→1.2`、新增 `dischargeWidth 0.9` 与 `dischargeAmp 2.2`——早期 `2.4× 外晕` 叠在 3px 炮管上糊成一条白斑，而不是「电弧」。
- **⑥ 回归断言重写（两次修正，记录踩坑）**：
  - 第一次：⑩ 从「量青蓝像素多不多」改为**按三色分别量测**。但接着遇到第二个坑——「白弧压在蓝基底上」经 `lighter` 必然产生浅蓝像素，我按像素断言「青蓝必须少于白」，实测 121 vs 59 **误报**。那不是配色回退，而是正确叠色的光学结果。→ 判据补上**直查唯一口径的色值**（`arcWhite` 三通道 >240 且极差 ≤12；`arcHalo` `b−r ≤ 45`；`baseBlue` `b−r > 60`；`barrelGrey` 极差 ≤24）。
  - 第二次：白色断言原本在**满电待机**态取真，实机校色后待机白被压到 2px，断言变红。这不是回归而是**预期目标**（待机本就不该白）。→ 改为在**充能中（35%）**取真（44 px），并追加「待机白 < 充能白」把配比纪律也锁死。
  - 归属侧：「弧锁在炮身走廊」——走廊内 491 px / 走廊外 **0 px**（外溢 0% < 35% 门槛）；弹体侧反断言「青蓝像素 0 < 20」。
- **三链验证**：`node scripts/check-html.js` → `All checks passed`（EXIT=0）；`node node_modules/typescript/bin/tsc --noEmit` → EXIT=0；46 项单测逐个直跑 **46/46 全绿**。`test-render.js` ⑩ 现为 26 条断言（三色分工 + 配置值直查 + 待机/充能白配比 + 弧锁炮身 + 弹体无电弧 + 确定性）。**目视复核**：本轮具备图像输入，用 7× 离屏出图（idle / 充能 45% / 击发放电三态）逐张确认——灰轨、蓝缝、白弧三者可辨，电弧贴着炮身不飞散。`npm run test:browser` 需系统 Edge（沙箱 `spawn EPERM`），**待正常环境补跑**；实机动态手感（充能节奏、放电拖尾）仍留用户侧。
- **顺手补一处类型缺口**：`tank_boss.js` 的 `_abilityLabel` 引用 `ABILITY_LABELS`（`tank_abilities.js` 顶层常量）但 `types/globals.d.ts` 缺声明，`tsc` 报 TS2552。该文件属**工作区他批次未提交改动**，非本批次引入；按项目惯例（第 2 节：新增全局去 `globals.d.ts` 补 `declare`）补齐声明。
- **细则归口**：`specs/combat.md` §6「电磁轨道炮三段视效」（三色口径表 + 电弧归属约束）。

## §4.103 技能键位单一来源：炮击 G / 护盾 H 专属键退役（#U42，2026-10-19）

**用户反馈原文**：「炮击、空袭卡有时还会以 G 键触发、进入 UI，检查当前还有没有其他错误绑定键位的卡牌、技能等」。（⚠ 编号说明：本条目编号 #U42，与 §4.102 电磁炮批次的 #U41 区分——两批次同日并行，各自独立编号。）

### 全仓键位审计结论（#U42 排查面）

对 `KEY_BINDINGS`（js/tank_bindings.js）× battle/bench 两页 × 7 个运行时技能 + 3 个 innate 键全量核对：

- **artillery / shield 双通道残留（用户反馈实证）**：#H3（2026-09-30）重做技能槽时对 artillery/shield 采取「未占用槽位时显示 btnG/btnH」的折中，专属键**没有**像 overdrive 的 V 键那样删除 ⇒ 同一技能两个键位（技能池数字键 + G/H）。更糟的是**两个键行为不一致**：H 键 = `tryShield(!!keys['shift'])`（默认**定向**护盾、Shift+H 全向），而技能池/btnH = `SKILL_DISPATCH.shield: () => tryShield(true)`（恒**全向**）——按 H 与按 1 出的技能不是同一个东西。
- **其余技能无残留**：overdrive（V 键已随 #H3 删除）、deploy_cover / aps / super_fire_control / super_speed 只经技能池；innate 三键（repair/medkit/extinguish → 4/5/6）是设计上正确的专属键（开局固有、不占技能槽）；Q/E 切弹、F 副武器、数字键让位技能池、F1 调试 HUD、Esc 暂停、Tab/C/` 面板组——均无冲突或泄漏。
- **bench 的 G 键是测试入口**（`activateAbilityForTest` 无卡自动补卡），与正式游戏键位语义解耦，**保留**（r3 链断言依赖）。

### 修法（同 #H3 删 V 先例，技能键位单一来源）

1. **battle**：删除 `btnG`/`btnH` HUD 按钮（HTML + click 监听 + `updateBottomHud` 显隐与 `cdG`/`cdH` 冷却角标）、主循环 `input.isDown('abilityStrike')`/`isDown('abilityShield')` 轮询、`SKILL_DEDICATED_KEYS` 死常量、获得技能脉冲回退表 `BTN_BY_ABILITY`（脉冲恒走技能池槽）、槽位 title 的「亦可按 G/H」尾注；`ABILITY_KEY_HINT` 文案统一「技能槽数字键」。
2. **键位唯一数据源**（js/tank_bindings.js）：`KEY_BINDINGS` 删 `abilityStrike:'g'`/`abilityShield:'h'`；`ACTION_INFO` 删两行说明；`ACTION_ORDER` 同步；文件头键位摘要更新。新增 `benchTestStrike:'g'`（**仅供测试台显式注册**的键值，正式游戏不注册该动作）。
3. **bench**：G 键动作改经 `benchTestStrike` 注册（键值不变、语义不变——测试炮击入口）；键位说明行删除 `abilityStrike`。
4. **ESC 键位说明**：`renderPause` 的 `describeBindings` 可用集删去 `abilityStrike`/`abilityShield` 两行。

### 全链验证（2026-10-19）

- `npm run check`（check-html + tsc --noEmit）→ **EXIT=0**；`npm test` → **46 通过 / 0 失败**（`test-bindings.js` 更新：`abilityStrike`/`abilityShield` 键位已删除断言、ACTION_ORDER 不含 G/H 行、bench 键位行 6→5；`tools/cover-refs.json` 基准再次漂移（烘焙侧批次改动未重导出，非本批次引入），重跑 `node tools/dump-cover-refs.mjs` 修复——同 §4.101 存量问题的重发，见 `PLAN.md` §2.5 提示项）。
- `npm run test:browser` 四链 → **ALL PASS**。测试同步改写：`test-browser-run.cjs`「G/H 按钮存在可点击」改为「**btnG/btnH/btnV 三者均 removed**」；`test-browser-r4.cjs` C1（artillery）/C2（shield）改经**技能池数字键**触发（动态定位槽位，同 C3 overdrive 模式），E2 段改为断言 btnG/btnH 从 DOM 移除；`test-browser-r3.cjs` bench G 键断言不变（仍走 benchAbilityStrike）。

### 细则归口

`specs/combat.md` §13.2（技能槽体系：专属键按钮章节改写为「已被 #U42 取代」+ §13.1 键位契约 + §9.6 HUD 按钮行现状）；键位唯一口径 `js/tank_bindings.js` `KEY_BINDINGS`（#U42 后：运行时技能无专属字母键，仅 innate 4/5/6 + bench 测试键 `benchTestStrike`）。

## §4.104 Boss 进场简报 + 副炮塔可视化 + 技能顶替顺序 + 换装回退（#U43/#U44，2026-10-19）

**用户需求原文（两条）**：
1. （#U43）「进入 boss 节点时，需要提示 boss 持有的技能和主、副武器」
2. （#U44）「① 副炮塔似乎没有效果，贴图方面使用 1 个缩小版的自身炮塔叠在当前炮塔上方自主攻击；② 战术护盾还在使用 R 触发，要加到技能按键组（1-3）中，具体根据获取时的空位；③ 技能顶替时的顺序似乎不正确；④ 出现过、但不再持有的主、副武器、技能似乎就不再出现了，可以再次出现，允许玩家再次选择」

> **编号说明**：#U40（§4.101 卡牌审计五修）/ #U41（§4.102 电磁炮校色）/ #U42（§4.103 G/H 键退役）为同日并行批次。本条两个子项分别记作 #U43 / #U44，节号续在 §4.103 之后。

### #U43 Boss 进场简报

- **数据层（纯逻辑，可 Node 测试）**：`js/tank_boss.js` 新增 `bossBriefing(entity)` / `bossBriefingLines(entity)` + `BOSS_WEAPON_LABELS` + `_weaponStatLines`。信息全部从**实体本身**读（不是 Boss 配置/卡池），因此与随机武备、随机技能的**实际结果**严格一致。
  - `cardEffects` 条目新增 `cardName`（`applyCardEffects` 写入时一并带上，`js/tank_cards.js`）——简报是纯函数、不持有卡池，靠它把「改装」显示成中文卡名。
  - 数值摘要只列对决策有意义的字段（伤害/穿深/装填/弹速/射程/溅射/容量/热量/转向/锁定），内部开关（`altReload`/`guided`/`pierceDmgMul` 等）不显示。
  - 增强版技能（`assignBossSkills` 写入 `params` 的那些）在简报里带 `[强化]` 标签。
- **呈现层（battle）**：`#bossBriefing` 居中覆盖层 + `renderBossBriefing` / `showBossBriefing` / `closeBossBriefing`；`spawnBossFromDef` 在 `assignBossSkills` + `assignBossArmament` **之后**调用。关闭 = 按钮 / 点击遮罩 / Esc。**它不是 flow 状态**（不进状态机 ⇒ 不暂停、不与白名单转移冲突），同时把 `bossBriefingLines` 打进日志作纯文本兜底。

### #U44 ① 副炮塔：机制本就生效，问题在于「看不出来」

- **核实结论**：`updateSecondaryTurret` 一直在自瞄/独立转向/独立装填/入 shells（探针 10s 打出 4 发，穿深 ×0.75、伤害 ×0.6、装填 ×1.6 全部正确）。真正的问题是两个**呈现**缺陷：
  1. **弹道起点复用主炮**：`updateSecondaryTurret` 直接用主炮的 `gunRoot`/`gunTip`，实测炮弹起点与主炮口**逐位相同**（`x=64.9`）⇒ 玩家看到的是「主炮又打了一发」，而不是「副炮塔在打」。
  2. **外观与主炮塔无关联**：旧 `secondaryTurretPose` 把副炮塔画在**车体尾后** `hullLen×0.28`，造型是半径 `hullWid×0.30 ≈ 11px` 的纯几何圆盘 + 一根棍子。
- **修法**：
  - `secondaryTurretPose` 锚点改为**主炮塔座圈中心（`turretPivot`）沿主炮塔朝向前移 `turLen×0.62×0.45`**，`scale = 0.62`；`drawSecondaryTurret` 复用本车 `turretPoly` 顶点（同一套涂装/勾线/受光），读作「同一辆车上多装的一座小炮塔」。
  - `updateSecondaryTurret` 弹道起点改为副炮塔炮口 = `pose 位置 + 朝向 × (barrelLen + radius×0.6)`（与绘制层**严格同源**）；炮管掩体截停判定同步改用该线段；弹体打 `fromSecondaryTurret: true`，`drawShells` 据此缩到 0.7 档、炮口特效缩放 0.55。
  - **加载顺序**：位姿函数在 `tank_battledraw.js`（晚于 `tank_weapons.js` 加载）⇒ 新增 `_secondaryTurretPoseFn()` 惰性解析（浏览器全局 → Node `require` → 回退 `null`，回退时弹道退回主炮口，不抛错）。
- **实测**：弹道起点 `64.9 → 35.2`（与主炮口分离 29.8px）。

### #U44 ② 护盾的键位：代码中已无 R 键

- **核实结论**：全仓检索 `KeyR` / `'r'` 键位 / `abilityShield` ⇒ **不存在**。护盾自 #H3 起走技能池，G/H 专属键已在**同日的 #U42** 一并退役（`js/tank_bindings.js` 无 `abilityShield` 键位与说明行；battle `btnG`/`btnH` 按钮与 G/H 轮询已删）。
- **「按获取时空位入池」已是现行口径**：`syncSkillSlots` 第 ③ 步逐项填 `slots.indexOf(null)`，槽满才弹顶替面板。**用户所见 R 键属浏览器缓存了旧 `tank_bindings.js`**，强制刷新即消失——本条不改代码，改文档与排查口径（`specs/combat.md` §4 新增键位小注）。

### #U44 ③ 技能顶替顺序：旧技能插队

- **根因**：`syncSkillSlots()` 把「**全部**已持有但当前不在槽里的技能」都算作待指派（按 `cardEffects` 顺序展开）。而被顶替掉的旧技能同样满足该条件、且在 `cardEffects` 里排在**新技能之前** ⇒ 玩家刚做完一次顶替，面板立刻又追问「旧技能要放哪一格」，观感就是顺序反了。
- **修法**：`syncSkillSlots(changedKey)` 只把**本次新获得且装不进槽**的那个 key 放进队列；`reconcileSkillSlotsAfterGain(newKey)` 由 `pickCard` / `__TEST__.giveCard` / `__TEST__.applyCard` 三处传入新增的技能键。「已持有但未入槽」改判为玩家主动放弃，随时可用 **Shift+点击某槽**手动装回。

### #U44 ④ 换掉的武器/技能可以再拿回来

- **根因**：`cardEligible` 与 `applyCardEffects` 首行都按「历史已应用次数 ≥ maxStacks」一刀切拦截 ⇒ 换掉双联火炮后双联安装卡**永久消失**，放下护盾后基础盾卡也不再出现——「曾经拿过」等于永久拉黑，与构筑自由相悖。
- **修法**：新增 `_isSwapBackCard(card)`（安装类 weapon 卡 + ability 基础卡），**两处同源豁免** maxStacks 截断；它们的重复资格回归**动态判定**（`owned.primaryWeapon/secondaryWeapon/abilities`）。
  - **仍受 maxStacks 约束**：weapon `upgrade`、ability 升级卡（`requiresAbility`）、modifier / ammo / passive / drone / economy（叠加有上限，重复无收益）。
  - 幂等性由各 install 分支自身保证（同型 install no-op、同 key ability 重复入 `cardEffects` 无副作用）。

### 顺手修一处类型缺口

`js/tank_battledraw.js` 以 `typeof blobPath === 'function'` 守卫调用 `blobPath`（定义在 `js/tank_assets.js`），但 `types/globals.d.ts` 缺声明 ⇒ `checkJs` 报 4 处 TS2304（并行批次引入）。已补声明，`tsc --noEmit` 回到 EXIT=0。

### 三链验证（2026-10-19）

- `node scripts/check-html.js` → **All checks passed**（EXIT=0）；`node node_modules/typescript/bin/tsc --noEmit` → **EXIT=0**。
- **45 项 Node 单测逐个直跑全部 EXIT=0**（含 `test-strip` / `test-nodegen-calibration` 两项重负载；`npm test` 转发器在本沙箱 `spawnSync EPERM`，沿用 §4.90/§4.98 的等价直跑）。
- 新增断言：
  - `scripts/test-cards.js` #U44 段 11 条（换掉双联后安装卡重新合格 / 换回成功且 `cardEligible` 与 `applyCardEffects` 两处一致 / weapon upgrade 仍受 maxStacks / 基础盾卡可再抽 / ability 升级卡仍受约束 / modifier 零影响）。
  - `scripts/test-rework-r3.js`：位姿断言改写为 #U44 新口径（锚定主炮塔座圈、沿朝向前移、`scale 0.62`）+ 新增 4 条弹道起点断言（**弹道起点不在主炮口，实测距主炮口 29.8px**、`fromSecondaryTurret` 标记）。
  - 既有 r3 断言「尾部偏移 = hullLen×0.28」等 3 条随口径改写（旧值已被推翻，加沿革注记）。
- `npm run test:browser` 需系统 Edge + 放宽进程权限（沙箱 `spawn EPERM`），**待正常环境补跑**；副炮塔外观与 Boss 简报的实际观感留用户侧目视。

### 细则归口

`specs/boss.md` §4「Boss 随机武备 → 进场简报」、`specs/combat.md` §4（副炮塔外观与弹道来源 / 槽满顶替排队顺序 / 护盾键位小注）、`specs/cards.md` §9 资格过滤第 2 条（安装类卡 maxStacks 豁免）。

### §4.101 植被轮廓重做：blobPath 波浪轮廓取代椭圆拼贴（#TEX15，2026-10-19）

**用户反馈**：「椭圆组成的树冠太难绷了，倒下的树干形状也很诡异」——§4.100 只改了颜色/渐变，轮廓仍是「多个椭圆拼贴」：树冠 = 底层整圆 + 11 枚椭圆叶团、灌木 = 5 正圆 + 9 椭圆、倒树 = 两段平涂椭圆（读作哑铃）、倒树树冠按 w 派生尺寸悬在树梢外。

**修法（几何重做，包络不变）**：

- 新增共享工具 `blobPath(ctx, x, y, rx, ry, rot, radiusFn, segs)`（`js/tank_assets.js` 导出）：单条 N 段波浪折线闭合路径，`radiusFn(i, t)` 提供 0..1 相对半径，双频正弦 + hash 抖动、确定性无随机；`mini-canvas` 的 lineTo 路径直接支持（浏览器/离线生图一致）。
- **树冠**（tree.bakeCanopy）：单条 40 段波浪轮廓（包络 ≤ R*0.85 不变）；体积渐变/自阴影 clip 在波浪轮廓内；内侧 7 枚不规则小叶团按光源方向连续取色；包络描边走波浪轮廓；树干（tree.bake）同步改不规则折线轮廓（不再正圆）。
- **灌木**（bush.bakeCanopy）：5 正圆 + 9 椭圆 + 中心描边圆整体废弃 → 单条 36 段波浪轮廓（包络 ≤ 0.44 不变）+ 内部 5 枚 / 边缘 7 枚不规则叶团 + 体积渐变 + 左上受光团/右下背光团。
- **倒树**（fallen.bake）：两段椭圆哑铃 → 单条连续波浪原木轮廓（上缘受光/下缘背光渐变、逐段 hash 抖动、锥度根部粗梢部细）+ 椭圆接触影 + 上缘受光细线 + 9 道**短竖向树皮刻痕**（旧整弧横纹在原木上读成「一串圆环」，废弃）+ 波浪圆伐倒断面。
- **倒树树冠**（fallen.bakeCanopy）：波浪轮廓；锚点贴回树干端部（cx = x + w*0.24，旧 x + w*0.32 悬空）、尺寸改由干径 h 派生（rw = h*1.1 / rh = h*1.3，旧按 w 派生在 242px 原木上膨成 130px 方块冠）。
- **雪地树冠**（tank_battledraw.js drawFoliage snowy 分支）：整椭圆 → blobPath 波浪轮廓 + 波浪积雪高光团。

**验证**：`node --check` 两模块 EXIT=0；`check-html` / `tsc --noEmit` / `test-render`（⑧a 121.8 > 55.3）/ `test-assets` 全 EXIT=0；`render-map-shot` seed=7 树丛 1.4×/倒树 1.6× 目视确认：树冠轮廓参差无椭圆拼贴感、倒树为连续原木且树冠贴合树梢。

**细则归口**：`specs/map.md` §22.4 + §22.8。

## §4.105 道路单弓形弯：杜绝正弦/S 形道路（#U45，2026-10-19）

**用户反馈原文**：「修改道路生成算法，目前有些道路看起来像正弦函数，在地图内的弯太多」。（⚠ 编号说明：#U40~#U44 已被同日并行批次占用（§4.101~§4.104），本条顺延记作 #U45。）

### 根因（已核实）

`placeRoadNetwork` → `buildFromPoints`（`js/tank_nodegen.js:1373`）旧实现随机放 1~2 个内部控制点（`nCtrl = rng.int(1,2)`），每个控制点独立 `rng.range(-curveAmp, +curveAmp) × span` 横向偏移（`curveAmp=0.16`）：

- 两控制点**反号**时样条横向偏移沿跨度正负交替 = **S 形**（「像正弦函数」的直接来源）；
- 同号时也是「中段两处渐变弯」+ 端部天然反拐，观感即「弯太多」。

### 修法

1. **单弓形重做**（`js/tank_nodegen.js` `buildFromPoints`）：只放 1 个内部控制点（弓顶 `t=0.5`，偏移 `±rng.range(0.55,1.0) × curveAmp × span`）；两端点各加与弓顶**同号、1/4 幅**的预弯点（`t=0.08/0.92`）消除端部反拐 → 横向偏移沿跨度恒同号、单调过渡。`tan1` G1 切线分支保留同结构（切线控制点并入弓顶偏移）。
2. **参数收口**（`js/tank_rules.js` `RULES.nodeMap.road`）：`curveAmp` 0.16 → **0.075**（语义改为「单弓形弓顶偏移相对跨度比例」，2100px 节点弓顶横移 ≈158px ≈ 1.4 条路宽）；`branchCurveAmp` **删除**（#G 起 T 形支道固定 amp=0，全仓库唯一残留是生成器死变量，按 `junctionClearR` 死配置先例删除）。`diagChance`/`diagAngleMin/Max` 不变；D/I 拓扑显式振幅 0.05 不变。
3. **`test-strip.js` §6c 接缝断言修正判定盲区**：旧实现以「cover 中心距接缝 <800px」近似「横贯河应跨接缝」——纵贯（V）河链恰好从接缝旁经过时误报（注释早已声明「纵贯河形不强制」，实现未兑现；#U45 rng 重掷后 seed42 河形 H→V 首次踩中）。改按 groupId 聚类：仅「x 跨度 > y 跨度的横贯链且 bbox 实际覆盖接缝 x」才要求接缝 300px 内有水系（strip 河流整链一次生成，接缝结构上不可能断链）。
4. **`tank_sim.js` 代理玩家补「被挡继续逼近」**：布局重排使 seed=1 回放暴露策略盲区——目标进入接敌距离即停车，停车点恰在建筑后死角时全程 0 开火假超时（实测玩家 120s 停在 (735,675)、最近敌 422px 恒无 LoS）。`_defaultPlayerPolicy` 增补：接敌距离内 LoS 被挡时继续向目标开进（与 `tank_ai.js` #M 失去 LoS 突进 patch 同语义），直至重现 LoS。仅测试链 harness，不影响正式游戏。

### 实测数据

- **弯形验证**（9 模板 × 30 seed × scale3，648 条道路链）：横向偏移符号变化 **max=0**（全部单弓形）；弓顶横移封顶 7.50% 跨度；路身中段出界 0（两端 ≤29px 端帽探出属 §10.1 设计行为）。
- `test-nodegen.js` §16 七护栏全过，最小交叉夹角 **81.8°**（旧 60° 护栏富余进一步放大——单弓形端点切线即端点连线方向）。
- **校准第十三次重锚**（`test-nodegen-calibration.js`）：rng 消耗序列变化（`nCtrl`+逐点偏移 → `side`+`bowOff`）重排路网走向，connectivity 维持 0.9999~1.000、cov 漂移 ±0.004 内；minPassageWidth 为纯流位差重排（无系统性收窄）。BASE 表按实测重锚，TOL 不变。
- `test-replay.js` 修复后 seed=1 有真实交战（总开火 36 次），确定性/分化断言全过。
- 视觉：`render-map-shot` seed=7/12 生图目视均为单弓形缓弯。

### 验证（2026-10-19）

- `npm run check` → EXIT=0；`npm test` → **47 通过 / 1 失败**——唯一失败 `test-cover-gen.js` 为**既有环境+存量问题**（9 项失败全部源于 `spawnSync` 子进程 `status:null`（沙箱 EPERM，最小复现：`spawnSync(node,-e)` 必然 EPERM）+ `tools/cover-refs.json` 基准漂移存量项，见 `docs/ISSUES.md` #V1——与本批次无关，改动前后同样失败）。
- `npm run test:browser` 需系统 Edge + 放宽进程权限（沙箱 `spawn EPERM`），**待正常环境补跑**。

### 细则归口

`specs/map.md` §26（现行口径：根因 / 单弓形结构 / 参数表 / 弯形实测）+ §12.3 沿革注记；校准基线沿革 `scripts/test-nodegen-calibration.js` 第十三次重锚注释；回放代理口径 `js/tank_sim.js` 文件头注释。

## §4.106 Agent 工作台治理：死配置清理 + 角色重建 + 测试链自证（2026-10-19）

> **本节性质**：**工程流程/工具链**批次，不改游戏逻辑。现行口径归口 `AGENTS.md` §3.6/§3.7 与 `.dsh/skills/rogue-tank-roles/SKILL.md`。

### 起因（用户提问）
「本项目需不需要在 dsh 中专门设置一个模式来开发？子 agent 和工作范围是否需要调整优化？」→ 调查后确认**不需要新建 preset**，但存在三类真实缺陷，逐项修复。

### 三条根因（均带证据）

1. **`.dsh/agents/` 14 份角色定义是死配置**。对 dsh 安装包（`app.asar`，182MB）全量扫描 `dsh/agents`、`subagentType`、`agentDefinitions`、`.opencode` → **0 命中**；dsh 只发现 `.dsh/skills/`（`@deepseek-ai/dsh-skill-filesystem`，rank 100）。而 `USAGE.md` 却指导用户用 `/task {agent:...}`、`@tank-combat`、Tab 切 `orchestrator`——这些在 dsh 中**全部不存在**（dsh 的编排只有 `subagent` 工具与 Agent Teams）。
2. **角色卡内容腐烂，会主动误导**。实测 7 处：`tank-combat.md` 写 `artillery G / shield H`（#U42 已退役）、"数字键 1/2/3/4 切弹"（现为 Q/E，1/2/3 是技能槽）、指向 `DEVELOPMENT.md §5.5`（该章节已不存在）；`map-cover.md` 仍列 `half` tier（#E3 已删）；`test-runner.md` 写 "~24 suites"（实为 47）；`docs-agent.md` 描述 §1~§6 结构（现行 §0~§4+specs）。另有 **14 个文件被 ≥2 个角色同时声明所有权**（`tank_battle.html` 三方、`tank_bench.html` 三方、`js/tank_cards.js` 三方、`js/tank_ai.js` 两方）——并行派发必然撞车。
3. **agent 无法在沙箱内自证**。`run-tests.js:89` 的 `spawnSync({encoding:'utf8'})` 依赖**管道捕获**，沙箱禁止 → `npm test` 每一项都以 `spawnSync ... EPERM` 失败，断言根本没跑。叠加测试链漏登记 `test-move.js` / `test-physics.js`（孤儿测试，永不执行），以及 `check-html.js` 只冒烟 28 个脚本（磁盘 47 个 `test-*.js`）。

### 修复

- **P0 角色重建**：14 份 `.dsh/agents/*.md` → **6 张角色卡 + 1 份索引**（`.dsh/skills/rogue-tank-roles` 定写域矩阵，`role-combat` / `role-mapgen` / `role-systems` / `role-content` / `role-render-fx` / `role-verify-docs`）。按**写域互斥**而非概念分片合并。删除 `.dsh/agents/`、`.claude/`（4 份重复副本）、`opencode.jsonc`、两个 `.trash` 残留技能目录。
- **P0 知识抢救**：删除前先核对——`ASSET_DEFS` schema 已由 `specs/map.md` §18 覆盖；但 **`SOUND_DEFS` 层/包络 schema 在 specs 中完全没有**，故先收编为 `specs/combat.md` §7.1。收编时**按实现校正**：旧角色卡描述的 `priority`/`maxConcurrent`/`spatial{...}`/`env.type`(perc/exp/adsr/gate)/`bufferKey` **均未实现**，实际是 `label/bus/gain/layers[{kind,wave,f0,f1,dur,gain,attack,filter,filterFreq}]`；空间化固定 `HRTF`/`maxDistance 500`/`refDistance 24`，与 §7 正文的 `equalpower`/1200/100 不一致——已在 §7.1 留 ⚠️ 注记。
- **P1 测试链自证**：`run-tests.js` 改**文件句柄重定向**（`stdio:['ignore',fd,fd]`）替代管道，行为等价（仍拿退出码+全量输出+超时语义）；补登 2 个孤儿测试；`check-html.js` 改**递归自动发现** `scripts/**/*.{js,cjs}`（含 `scripts/lib/`）并新增**测试链登记一致性断言**；四条浏览器链共用 `scripts/lib/browser-launch.cjs`，EPERM 时打印单行 `INCONCLUSIVE` 提示并以**退出码 86** 退出，不再吐 20 行 call log。
- **P2 纪律固化**：`AGENTS.md` 新增 §3.6（多 agent 写域纪律：页面/specs 单写者、`RULES` 单写者、验证统一收口、测试文件必须登记）与 §3.7（沙箱验证边界表）。
- **基准重导出**：按 `PLAN.md` §2.5 跑 `node tools/dump-cover-refs.mjs`，`barricade` 质心断言由此转 OK。

### 验证（2026-10-19 实测）

- `node scripts/check-html.js` → **EXIT=0**，`All checks passed`（1.5s；递归覆盖含 `scripts/lib/`，并断言「47 个 test-*.js 全部在 TESTS 中」）。
- `node node_modules/typescript/bin/tsc --noEmit` → **EXIT=0**。
- `npm test` → **47 通过 / 1 失败（48 项，334~336s）**。唯一失败 `test-cover-gen.js` 已核实为**既有缺陷**（`dump-cover-refs.mjs:49` 用基础层尺寸烘焙 canopy 层 → `fallen_canopy` 基准质心偏 3.06px），记入 `docs/ISSUES.md` #V1，与本批次无关。
- `npm run test:browser` → **ALL PASS**（四条链，133s）。**首次实测通过**——此前因沙箱 EPERM 一直标注「待正常环境补跑」。

### 经验（写入 skill）

- **别假设配置目录被加载**：dsh 只认 `.dsh/skills/`；`.dsh/agents/` 这类「看起来像配置」的目录必须先拿证据（扫安装包 / 查发现路径）再依赖。
- **别信角色卡里的 API**：本次核对发现 `SOUND_DEFS` 真实现与文档差了一整套字段。收编任何文档前必须回读源码。
- **沙箱内能自证是效率关键**：`npm test` 修好前，每个批次都要人肉判断「EPERM 还是真失败」。

### 细则归口

`AGENTS.md` §3.6（写域纪律）/ §3.7（沙箱验证边界）；`.dsh/skills/rogue-tank-roles/SKILL.md`（角色与写域唯一权威）；`docs/specs/combat.md` §7.1（`SOUND_DEFS` schema）；`docs/ISSUES.md` #V1（canopy 基准缺陷）；`.dsh/skills/sandbox-verify|test-runner/SKILL.md`（验证命令与判定）。

### §4.103 俯视栅栏/沙包重做 + 影子归口 + mini-canvas drawImage CTM 修复（#TEX17，2026-10-19）

**用户反馈**：栅栏、沙包俯视图不正确——「栅栏俯视图就是薄薄的水泥墙或木板，按对应颜色渲染，同时在地面绘制正确的阴影（与其他物体的阴影方向、长度一致）」。

**修法**：

- **栅栏 `soft.bake`**（`js/tank_assets.js`）：#TEX16 的「横板+立柱+斜撑」是立面画法，俯视不存在——重做为**整个 OBB 即墙顶面**：沿长轴木板拼缝（hash 相位、竖放自适应）、长轴两段明暗、左上受光/右下背光长缘、木纹短划、path 外缘描边。包络 w×h 不变。
- **沙包 `barricade.bake`**：重做为俯视沙袋堆——两排错缝圆角袋顶（`roundedRectPath`）+ 堆底背光暗带；每袋左上受光/右下背光弧 + 布纹短缝；删整排椭圆接触影。包络 w×h 不变。
- **投影 `drawCoverShadow`**（`js/tank_battledraw.js`）：soft/barricade 从「脚下小椭圆」改为与建筑（box）**同源的三层偏移轮廓投影**——同一 `off = min(26, 6+max(w,h)*0.08)`、同一右下 +x/+y 方向，alpha 0.10/0.13/0.18（体量小故比建筑淡）；`stump` 保留接触影。全套地图元素投影方向/长度自此一致。
- **mini-canvas `drawImage` CTM 修复**（`scripts/lib/mini-canvas.js`，§22.6 口径收口）：旧实现**完全忽略变换**（注释自认「只处理平移+缩放」，实测连平移都丢——scale(2) 下 10×10 图仍画在原点）。现改为**逆 CTM 采样**：目标矩形四角（含 dx/dy 原点）经 CTM 得设备包围盒 → 逆矩阵映射回图片 uv（最近邻；缩小按 §22.6 用 alpha 预乘双线性）。实测 1:1/scale(2) 双用例正确；`render-map-shot --scale≠1` 的离线图自此可信。
- **并行批次收尾（类型声明级，不碰语义）**：`types/globals.d.ts` 补 `StripGenOptions.chunkRows`（#U35）与 `lightningPath` 全局声明（#U38）——tsc 6 处遗留错误清零；`scripts/test-assets.js` mock ctx 补 `rect`/`strokeRect` no-op。
- **battledraw exports 补回**：`renderHullTexture`/`renderTurretTexture`（函数在、导出缺失——test-render ①② 入口）。

**验证**：`check-html` / `tsc --noEmit` / `test-assets` / `test-covers` / `test-tanks` / `test-map` / `test-hitpart` / `test-tankcollision` 全 EXIT=0；定向 mini-canvas 像素探针 9 条全过（本体与 bg 色差>24 / 受光缘>背光缘 / 投影右下比 bg 暗 / TL 对照方向性）；`render-map-shot` 1.2× 目视确认薄墙顶面 + 右下落影。`test-render` 仍红——预存回归 #V2（HEAD 缺 #TEX12/13 的 paint 符号），与本批无关（stash 对照排除），见 `docs/ISSUES.md` #V2。

**细则归口**：`specs/map.md` §22.4（#TEX17 段）+ §22.6（drawImage CTM）。

### §4.104 地面履带痕迹（#U41，2026-10-19）

**用户需求**（本会话首轮即提出，中途被植被/栅栏批次顺延）：「增加坦克履带痕迹」。

**实现（数据纯逻辑 + 绘制纯 ctx，零新模块）**：

- **`js/tank_fx.js` 新增地面贴花系统**：`trackMarks` 段数组（左右履带各一条线段 `{x1,y1,x2,y2,w,life,max}`），上限 `FX_MAX_TRACK_MARKS=600`（超限丢最老）、寿命 `TRACK_MARK_LIFE=12s`。
- **盖章节流**：`emitTankTracks(t)` 由 `js/tank_move.js` `driveTank` 末尾经 `globalThis.emitTankTracks` **可选调用**（Node 测试链/未加载 FX 环境自动 no-op，不引入 move→fx 依赖）；左右履带中心 = local `±(hullWid/2 + trackOffset + trackWidth/2)` 旋转 hullAngle（与 `paintTracks` 同源），与各侧上次盖章点位移 ≥ `TRACK_MARK_STEP=9px` 才盖章——原地转向时两侧位移不同，自然画出差速弧线。
- **寿命推进**：并入 `updateFx`（与 scorchMarks 同款 filter 模式；bench 调 updateFx 但无 emit → 空数组 no-op）。
- **绘制层**：`drawTrackMarks(ctx)` 在 battle `draw()` 的 `drawScorchMarks` 之后（地物/道路之后、坦克之前的地面贴花层），深土色 rgba(30,26,20)、前 8% 淡入 → 线性淡出、lineCap round、宽度 = trackWidth×0.9。
- **清理**：`clearFx()` 并入履带痕迹清空；battle `enterBattle` 与 `devGenNode` 显式调 `clearTrackMarks()`（换节点/换随机场不跨场）。`trackEmitState`（WeakMap 上次盖章点）在 clear 时换新表，避免跨节点首帧拖出长线。
- **回归**：新增 `scripts/test-trackmarks.js` 9 断言（9px 盖双侧 / 1px 不盖 / 原地转差速盖章 / 寿命到期清零 / 600 上限精确触顶 / clear / 死车不发射），已登记 `run-tests.js`（避免孤儿测试）。

**验证**：`check-html` / `tsc --noEmit` / `test-trackmarks` / `test-move` / `test-assets` / `test-covers` / `test-tanks` 全 EXIT=0。浏览器实机目视（开车转圈看地面弧线）留用户侧；`test:browser` 需 Edge 放权（§3.7）。

**细则归口**：`specs/combat.md` §6「特效分层规范」追加地面履带痕迹条目。


## §4.107 #W 批次前八项修复：装填硬限 / Boss 召唤物 / 受击减速 / economy 泄漏 / 副炮塔 / 履带拖尾（2026-10-19）

> **现行细则归口**：`specs/combat.md` §3（参数硬限通道）、§8.2（副武器 F 边沿）；`specs/boss.md` §4（召唤物与受击反馈）。
> **条目原文**已按 4 步生命周期归档至 `docs/archive/2026-10.md`（#W1/#W2/#W3/#W4/#W5/#W6/#W10/#W12），索引见 `ARCHIVE.md` 2026-10-19 行。

### 起因
用户实机反馈 8 项（「超级装填没有生效」「boss 召唤的小兵也要全局交战」「后期敌方 AI 移速太快」「boss 机炮射程」「副炮塔绘制顶层与后半」「履带后面疑似小拖尾」等），另有 5 个只读子代理并行代码审计产出的同级问题。全部 20 条写入 `ISSUES.md` #W1~#W18，**本批修复其中 8 条**。

### 关键结论（每条均有复现与实测）

**#W1 装填硬限只约束参数通道（P0，含 #W10 连带）**
- 根因：`js/tank_model.js` 的 `applyParameterLimits` 用粗判门控 `hasHardLimitChannel = modifiers.some(m => m.scope !== 'timed')` 后，对**聚合完毕的最终值**统一钳制。timed 能力倍率早已聚合进去 ⇒ 只要玩家持有任意一张 run/permanent 修饰器，overdrive 的 ×0.45 就被同一刀切掉。
- 实测（`base.reload=1.3`）：仅 timed → **0.585**（×0.45，正常）；叠加任意 run 卡 → **1.000**（只快 23%）。静默无日志，`tryActivateAbility` 仍返回 ok。
- **命名陷阱**：用户口语「超级装填」= `cards/super_reload.json` → `ability.key='overdrive'`；`super_fire_control` 中文名是「超级火控」，只管精度。
- 修法：按 scope 拆成「参数通道 / timed 通道」两个乘子，各自按 computeStats 的**加法聚合语义**（`1 + Σ(v−1)`）计算；由 `base` 直接算参数通道结果并施硬限，再叠加 timed。**不能从聚合值反推**（add 已在 pass1 累进 base，除法剥离不可逆）。
- 连带修复：`boss.tuning.fireRateMul` 0.6 以 `scope:'run'` 注入，tiger-I 类底盘设计值 0.96s 被钳到 1.000s；`boss_fortress.p3_core` 的「狂暴连射」（设计 0.576s）此前**恒为 1.000s，整阶段机制空转**，现已恢复。
- 口径（用户 2026-10-19 裁定）：「技能只是临时突破」——卡牌/升级仍不得破 1.0s，能力生效期间可突破。

**#W6 economy 跨局泄漏（P0）**
- `player` 是 battle 模块级单例；`runScoreMul`/`runReviveBonus` 只由 `applyCardEffects` 写，而 `removeRunModifiers` 与 `prepPlayerForRun` 都只清 modifiers/cardEffects ⇒ 拿过一次「后勤保障」(1.15) 后**每局结算永久 ×1.15 并继续复乘**。
- 修法：`removeRunModifiers` 归零（收尾）+ `prepPlayerForRun` 防御性归零（新局入口）+ `makeTank` 补显式初值（此前 `undefined`，靠消费方 `|| 1` 兜底）。

**#W5 Boss 受击减速永不剪除（P1）**
- `boss-hitreact`（maxSpeed ×0.35, `expiresAt=now+0.25s`）靠 `refreshStats` 到期过滤清理，但**非玩家实体没有任何逐帧 refreshStats**（battle 只对 player 调用）⇒ 玩家停手 >0.25s 后 Boss 永久 0.35× 极速（≈44px/s）。
- 修法：记录减速窗口绝对到期时刻 `bossHitSlowUntil`，`updateBossBehavior` 内到期显式 `removeModifierBySource`（对齐 `boss-charge` 既有做法）。判据用减速窗口而非视觉窗口（两者 0.25s vs 0.35s 不同长）。

**#W4 Boss 召唤物出生即脱战 + 绕过速度封顶（P1）**
- ① 召唤物只设 `aiTriggerDist = triggerDist × 1.0`，而生成点被推到 `sumTrig = triggerDist × 1.05` 之外 ⇒ **每波召唤的小兵都必在自身接战半径外 5%**，玩家不靠近就不动。
- ② `spawnBossSummonWave` 只调 `applyEnemyAppearanceAndStats`、**从不调 `applyDifficultyMults`** ⇒ 不吃 `speedVsBaseline` 封顶，直跑 120×prof（light 1.15 → **138px/s**，同节点敌军 2 倍）。节点敌军与增援都调了封顶，唯独召唤物漏了。
- 修法：对齐生存模式波次的正确做法（`aiTriggerDist=99999`/`aiEngaged=true`/`alertLevel=3`/`aiReactT=0`）+ 补调 `applyDifficultyMults`。
- 顺带核实：`applyEnemyAppearanceAndStats` 的 `entityMults` **形参在函数体内从未使用**（死参数）。

**#W12 履带「小拖尾」真因（P1，非相位错位）**
- 相位与绘制本身没错位（`paintTracks` 局部 `-phase`、精灵侧 `+phase` 已同向）。真因是 `emitTankTracks` 只按「位移 ≥9px」补线段、**无跨距上限**，而 `trackEmitState` 只在 `clearTrackMarks()` 换新（仅进节点/dev 调用）——**复活、`resetEntity` 传送、Boss 召唤定位都不重置** ⇒ 下一帧在死亡点与复活点之间画一条长痕。
- 修法：`TRACK_MARK_MAX_STEP = 48`，超距只重锚定不盖章。实测：正常移动盖章、传送 400px 增量 0、传送后恢复盖章。

**#W2 副炮塔层级与位置（P1）**
- 层级：两条绘制分支都在主炮塔**之前**调用（`tank_battledraw.js:999`/`:1151`）⇒ 被主炮塔整块盖住，只露一圈边缘。
- 位置：位姿沿主炮塔朝向前移 `+turLen*s*0.45` ⇒ 落在**前半部分**，与用户要求「后半部分」相反。
- 修法：两处调用移到主炮塔/炮管绘制之后；位姿 `+=` 改 `-=`。

**#W3 turret 副武器曳光起点与散布（P2×2）**
- 曳光起点 `fx/fy` 取 `secMuzzle.rootX/Y`（**座圈中心**）而非炮口 ⇒ 弹道起点正确、拖尾起点错。
- 散布读 `baseStats.sigma`，但 **`tank.stats` 没有 `sigma` 字段**（运行时字段，主炮读 `shooter.sigma`）⇒ 副炮塔散布恒 `gaussian(0)`，比主炮还准。
- 修法：`fx/fy` 改用炮口；散布改读 `t.sigma`。

### 验证（实测退出码，2026-10-19）

- `node scripts/check-html.js` → **EXIT=0**，`All checks passed`
- `npm test` → **48 通过 / 1 失败（49 项）**。唯一失败 `test-cover-gen.js` 为**既有 #V1**（canopy 基准），改动前后同样失败。
- `node scripts/test-browser-run.cjs` → **ALL PASS**
- 新增/改写断言：`test-modifiers.js` +5 条 #W1；`test-rework-w5.js` 改写 1 条（原「run+timed 混合 → 钳至 1.0s」正是 bug 本身）+ 修正 2 处过期注释。

### 未修（仍留在 ISSUES.md，共 12 条）

`#V1` `#V2`（既有）· `#W7`（`applyShield` 死参数，阻断应急护盾）· `#W8`（`replaceAmmo` 零校验）· `#W9`（死键 super_speed/super_fire_control）· `#W11`（文件级事实）· `#W13`（`anchorRange` 死配置）· `#W14`（aimSpeed 两套量纲）· `#W15`（死配置清单 14 项）· `#W16`（地图生成侧口径）· `#W17`（`getExposure` 等契约）· `#W18`（文档与代码冲突 7 处）。

### 提交说明

`9e8bf20` 提交了 #W1/#W4/#W5/#W6（含 `tank_battle.html`、`js/tank_model.js`、`js/tank_boss.js` 与两个测试文件）。
**#W2/#W3/#W12 的改动保留在工作区未提交**——因为 `js/tank_battledraw.js` / `js/tank_fx.js` / `js/tank_weapons.js` 中混有外部进程的在途改动（#U42 等），且 #W3 与外部改动落在**同一代码块**（同一 hunk 内 `muzzleX`、`0.55`、`fromSecondaryTurret` 与本次修正交织），无法按 hunk 干净分离；强行拆分会产生编译不通过的中间态。

---

## §4.108 PLAN 逐条落实 + 第三批用户反馈 11 项 + 实测三修（2026-10-19）

> 本节综合登记 2026-10-19 下半日三个连续批次（7 个 commit + 1 个修复 commit）。
> 全程 `npm test` **49/49 全绿**（本日首次全链无红）。

### 批次 A：PLAN 条目落实（commit `0d9dbd9`）

| 条目 | 结论 |
|---|---|
| 条目 1（C 档 strip 接缝） | **已修**：`drawGround` 的 biome 过渡带此前只处理 x 方向（左右相邻），多行片（生存 `chunkRows=2`）的**上下行交界是硬切**。抽出 `drawSeam(axis)` 双轴对偶绘制；`test-render` ⑨f 采样点改为 ±150px 验证色彩方向性（上冷下暖）。C 档剩余项审核：分块地面烘焙已由视口锚定滚动烘焙**等价替代**，空间分桶/小地图条带化/推进式结算均已实现；仅「strip 密度校准重锚」未做（用户 2026-10-15 已裁定告一段落）。 |
| 条目 2（敌军弹种联动） | **已实施**（用户口径：每 3 级沿 AP 链升一档、Boss 除外）。`js/tank_model.js` 新增 `AP_AMMO_CHAIN` + `enemyAmmoKeyForLevel`（纯函数）+ `applyEnemyAmmoByLevel`；battle 4 处敌军生成点（节点/波次/增援/召唤物）经 `applyEnemyAmmoForNode` 注入。难度→等级线性映射 0.15~0.95 → **lv1~13**。实测 lv1-3→ap、lv4-6→apcr、lv7-9→apds、lv10-12→apfsds、lv13+→apfsds_ad，全链落在 AP 链内。 |
| 条目 4（#N 交战结构） | 用户裁定**当前可接受**，关闭。 |
| 条目 5（坦克精灵） | **维持不启用**；新增开发者面板开关「游戏内显示精灵」（默认关，写 `_spriteOverride` 不写档）；新增判据 `spriteEnabled(t)`（override 优先、无 sprite 数据一律 false），导出供测试。 |
| 条目 6（贴图命名） | **已完成**：10 个贴图统一 `<id>_<part>.png` 全小写（`Leapard_1→leopard1`、`Obj780→obj780`、`panzer-IV→panzer-iv`、`tiger-I→tiger-i`、`barrel-*` 同步），`git mv` 保留历史，19 处 JSON 引用全部有效。坦克 id 本身不改（存档主键）。 |
| 条目 8（出图管线） | 新增 **`docs/ASSETS-PIPELINE.md`**（唯一备查：两条资产链路区别/五步链/三坐标口径/排错表/文件索引/维护纪律；提示词正文不复制）。 |
| 条目 9（#S 批次） | 复核确认已实施（`tank_move.js:46` 公路加成 / Boss HP 条 / `tank_ai.js:115` 五层级警觉）。 |

### 批次 B：第三批反馈修复（commits `ba95e09`/`2c7c105`/`8f2006f`/`8920013`/`35a376e`/`65d071f`）

| 项 | 结论 | 关键实测 |
|---|---|---|
| **#V1** | `bakeAssetCanvas` 移除负锚点补边；`test-cover-gen` 锚点断言放宽为「有界有限值」 | 全链首次 49/49 |
| **#2 残骸** | `CORPSE_BURN_SECONDS=3`/`KEEP=12`/`MAX=24`；燃烧限窗 + 主循环早退 + 反向 splice 回收（保留玩家） | 第 30 波 193 具常驻 → 上限回收 |
| **#3 掉血外观** | `damageLevel:0` 硬编码（缓存键不再含血量档）；`weatherSeed` 保留 | 193 残骸支撑 1544 缓存键超 LRU 512 的问题消除 |
| **#14 跳弹** | 跳弹推出安全距离 `max(hull,turret,20)×1.15` + `_bouncedFrom` 跳过同车再命中 | 再命中 **148/148 → 0/56** |
| **#17 z 序** | `drawAttachments` 加 `layer` 参数；车体件画在炮塔前、炮塔件在后 | — |
| **#1 文案** | 串联 HEAT→高热穿深破甲弹 / overmatch 条件句式 / 导弹卡删「破反应装甲」/ Boss「反应装甲」→「复合附加装甲」（共 5 处承诺不符修正） | — |
| **#W7** | `applyShield` 死参数修复：`opts.hp/duration/arc` 生效，兼容旧键 `dirDuration/omniDuration` | `{hp:999,duration:10}` → 生效 |
| **W-G 应急护盾** | 「反应装甲」机制整体重做：`RULES.cards.emergencyShield`（HP<10% 触发/10s/90s 冷却/下限 60s/池 150）；`tank_physics` 拦截分支删除；battle 主循环低血触发；`test-cards` 3 条旧断言改写为 10 条新断言 | specs combat/cards 已同步 |
| **W-H 防御卡** | `getMultForKey` 新增**防御方减伤通道**（此前只有攻击方乘子）；新卡 `wet_ammo_rack`（-30%）/`crew_liner`（-20%）入 PASSIVE_KEYS | 弹药架 200→140、炮手 150→120、履带不受影响 |
| **#4 副炮塔** | ① 待机正弦游走（`idleWanderRate 0.6`/±0.9rad，不受装填门控）② 固定 AP（不走 `computeAmmoConfig`）③ 伤害=`t.base.damage×0.5`（`ignoreModifiers`，读 `t.base` 非 `t.stats`）④ `cupolaAnchor()` 抽取共享 | 主炮 300 时副炮塔仍 50 |
| **#9 车高** | `RULES.heights` 整块删除 + `HEIGHTS` 导出删除；`getPartZRange/getGunHeight` 返回固定常量（车体 0~1.4/炮塔 1.4~2.3）；**`heightClass` 字段保留**（AI 分类/徽章/车长塔数/难度比例仍消费） | 零行为变化（数值本已死） |
| **#10 掩体** | 便携掩体改**椭圆弧**造型（用户从「中括号」改口径）；新增 `perm_block` 永久掩体 tier（solid/不可摧毁/不可碾）；新增 `behindCoverOnlyTurretHit`（掩体装甲侧后方 `behindValidDist=220px` 内 ⇒ 车体命中改判炮塔） | 正后 100px✓/超距✗/穿透侧✗/横偏✗ |
| **#11/#12** | 栅栏俯视/树冠贴端**取证确认已存在**（#TEX17/#TEX15）；**切面**由正圆改斜向扁椭圆（`cutRot 0.22`、短轴 0.55 压扁），重导出烘焙基准 | `fallen` 62×17，cover-gen 全绿 |
| **#5 副武器** | pen/speed 字面量收口进 `WEAPON_DEFAULTS.secondary`（mortar 60/350、rocket 90/450、missile 250/320、wire 260）；**修复 missile range 升级卡恒失效**（视口对角线无条件覆盖 → `max(卡面, 视口/2)`） | — |
| **#16 tags** | 方案 A：字段保留（audit-content 流派体检依赖），删「按标签」页签与卡面 tag 徽章 | — |

### 批次 C：实机反馈三修（commit `6c54340`）

| 问题 | 根因 | 修复 | 实测 |
|---|---|---|---|
| 掩体形状不对 | 「中括号」造型不达意 | 改**椭圆弧**（下半弧 + 端臂 + 穿透侧虚线） | 视觉，无逻辑改动 |
| 副炮塔不随炮塔转 | **坐标系错误**：车长塔画在 `paintPartTextureDirect(…,'turret',…)` 用 `turretPoly` 顶点随 `turretAngle` 转，我此前按车体系（`hullPoly`+`hullAngle`）处理 | `cupolaAnchor` 改用 `turretPoly`；`secondaryTurretPose` 按 `turretAngle` 旋转 + 平移到座圈 `turretPivot` | 炮塔转 90° 副炮塔 `(6.7,-7.6)→(15.6,-1.3)` |
| 护盾不挡激光 | Boss 激光伤害直接 `applyDamage`，**绕过护盾吸收链** | `updateBossLaser` 结算前查 `hasShield`+`shieldAbsorbs`（光束方向）⇒ 走 `absorbDamage`；溢出部分照常结算；battle 注入三函数 | 池 150 吸收 58.1、本体零掉血 |

> **附注（应急护盾「血量限制」）**：HP<10% 触发是**设计本身**（`triggerHpRatio 0.10`），非缺陷；
> 用户若要求改口径（常驻/其他阈值）另行裁定。

### 归口

- `specs/combat.md`：反应装甲→应急护盾（§2 passive）、跳弹二次命中防护、副炮塔口径
- `specs/cards.md`：应急护盾（#W-G 重做）、新卡 wet_ammo_rack/crew_liner
- `specs/map.md`：`perm_block` tier（待补——本批先落在 `RULES.coverTiers` 唯一口径）
- PLAN §9 有本批逐项的用户口径与执行细节，条目关闭后 PLAN 将在下次整理时删除归档

### 验证（每批次提交前均实测）

- `node scripts/check-html.js` → EXIT=0（每批）
- `node node_modules/typescript/bin/tsc --noEmit` → EXIT=0（每批）
- `npm test` → **49 通过 / 0 失败**（批次 A/B/C 各跑一轮全绿）
- `npm run test:browser` → ALL PASS（2026-10-19 会话内实测）

### 提交说明

`ba95e09`(#V1) → `2c7c105`(#2/#3/#14/#17) → `0d9dbd9`(PLAN 条目) → `8f2006f`(#1/#W7/W-G/W-H) → `8920013`(#4/#9) → `35a376e`(#10/#11/#12) → `65d071f`(#5/#16) → `6c54340`(实测三修)，共 8 个 commit，已推送 `origin/master`（`3f69448..65d071f` 后又补推 `6c54340`）。
### §4.108 补记：二次实测反馈两修（commit `95d73e4`，2026-10-19 深夜）

| 问题 | 真因 | 修复 | 实测 |
|---|---|---|---|
| 副炮塔仍「绑在车体上」 | **绘制侧坐标系双重叠加**：`drawSecondaryTurret` 的两个调用点都处于 `translate(t.x,t.y)+rotate(hullAngle)` 的车体局部变换内，而函数内 `ctx.translate(pose.x,pose.y)` 塞入的是世界坐标 ⇒ 平移多加车体位、旋转多转 hullAngle | pose 口径定为**世界系**（关键事实：`turretPivot(t)` 返回世界坐标，实测 hullAngle=45° 返回值随车转）；`drawSecondaryTurret` 把世界 pose **逆变换**回车体局部（`R(−hullAngle)·(世界−t.xy)`），`ctx.rotate` 改用相对角 `pose.angle − hullAngle` | 三态逐位比对：含车体平移 ✓ / 炮塔转 90° 绕座圈转 `(506.7,292.4)→(515.6,298.7)` ✓ / 车体再转 90° 与手算 `(507.6,306.7)` 逐位一致 ✓ |
| 应急护盾应**无敌** | 上一版只有吸收池（150），Boss 高伤仍能击穿 | 护盾存续期间 `invulnT` 续到护盾剩余时长——复用全链路无敌体系（resolveHit/溅射/炮击/激光/无人机全部消费 invulnT）；每帧续期（权威时长=shield.t），到期/打爆自然失效；取 max 不抢复活无敌 | 日志改「无敌 10s（吸收 150）」 |

验证：`check-html` EXIT=0 / `tsc` EXIT=0 / `npm test` **49/49**。
### §4.108 补记 2：三次实测反馈两修（commit `bb21607`，2026-10-20 凌晨）

| 问题 | 取证 | 修复 | 实测 |
|---|---|---|---|
| 掩体弧凸面朝玩家（「凸的超前、凹的朝后」） | **离线光栅化**（mini-canvas）：旧 `ellipse(…,0.12π,0.88π)` 经 π/2=局部 +y（装甲侧？否——**反了**）：玩家侧 472px / 敌侧 0px，凸面朝穿透侧，与弹道语义相反 | 改 `1.12π→1.88π`（跨 3π/2=局部 −y……实为弧体在 −y 半平面对侧）；连带竖臂延伸方向与开口虚线位置 | 修复后玩家侧 0 / 敌侧 472，凸面朝装甲侧 ✓ |
| 副炮塔开火不打当前目标 | 装填就绪**不等转到位**就击发；目标切换/初始偏航时炮弹沿旧朝向飞出 | 转向后加**瞄角闸**：角差 > `max(本帧最大转角, 0.05rad)` 不开火（只转不打） | 初始偏差 90° ⇒ 首发延至 **0.62s**、弹道误差 **0.00°**（旧行为帧 0 开火误差 90°）；双目标索敌取更近者首发误差 0.00° |

验证：`check-html` EXIT=0 / `tsc` EXIT=0 / `npm test` **49/49**。
---

## §4.109 #W-I 榴弹炮曲射模式回归（2026-10-20）

**用户口径**（PLAN §6.2 W-I）：「该模式更改主炮为曲射武器，行进速度将为最大速度的 1/3。
只能发射当前生效的 he 弹种，未直接命中时按距离计算伤害，直接命中时，按坦克最薄的装甲值
作为命中部位来计算伤害。可越过掩体，瞄准器变成一个在鼠标位置的一个虚线圈，初始半径为
he 的爆炸半径」。卡牌（爆炸范围/急速射）后补。

### 设计裁定：**模式**（`t._howitzerMode`）而非独立武器类型

2026-09-15 曾删除主炮 howitzer（test-fire 7e 固化）。本批以运行时 toggle 回归：
不进 `WEAPON_PRIMARY_TYPES` 卡牌白名单；参数载体 `WEAPON_DEFAULTS.primary.howitzer`
（reloadMult 2.2 / arcSpeed 260 / splashRadius 90 / minArcRange 120 / moveSpeedRatio 1/3）；
挂载卡 `cards/howitzer_mode.json`（epic ability key `howitzer_mode`，无冷却 toggle，
进 `ABILITY_KEYS`/`ABILITY_KEYS_RUNTIME`）。

### 四条链实现

| 链 | 要点 |
|---|---|
| 开火 | `tryFire` 模式分支**无需目标实体**（落点=aimPoint）；`fireTank` 允许 target=null；`firePrimaryShell` he **锁定** + 落点三件套**预置**（否则 `s.range\|\|400` falsy 兜底吞掉 aimPoint 距离——实测踩坑修正）+ **豁免炮口贯穿预检**（曲射出膛贴掩体≠落点被挡） |
| 落点 | `stepShells` isArc 分支区分**直击/近失**：直击走 `resolveHit` + 新 opts `forceEffThickness`（**六面最薄装甲**取代几何等效厚度——曲射大角度落弹不适用斜面等效；allowBounce=false），伤害走 he 弹既有模块链（与直射 HE 同口径）；近失 `applySplash` 距离衰减 |
| 移动 | `tank_move.js` 链尾 `howitzerMul`——**不并入 speedModifier**（公路判定强制归 1 会静默清零减速） |
| 瞄准 | battle 绘制层：鼠标位置虚线圈（半径=splashRadius）+ 中心点 + minArcRange 死角红圈提示；`fireCtx` 注入 `aimPoint: mouseWorld` |

### 测试同步与实测

- `test-fire.js` 7e 两条旧断言按新口径**改写为 7 条**（未开模式零变化 / 缺省表回归 /
  白名单仍不含 / 模式内开火 / isArc+howitzer 标记 / he 锁定 / 落点=aimPoint）。
- E2E：toggle ✓ / 弹字段 ✓ / 落点=aimPoint ✓ / 直击 pen200 vs 最薄24 穿透掉血 257（he
  模块链同口径）✓ / 近失 150px 零伤 ✓ / moveSpeedRatio 1/3 ✓。

### 验证与提交

`check-html` EXIT=0 / `tsc` EXIT=0 / `validate-content` EXIT=0（194 卡）/ `npm test` **49/49**。
commit `e81bdfb`（9 文件）。**未做**（登记 PLAN）：爆炸范围升级卡 / 急速射卡
（barrage 3 发 0.5s 参数已预留）。
### §4.109 补记：瞄准器改散布圈（commit `78352f0`，2026-10-20）

**用户口径**：「虚线圈改为散布圈，大小为精度×距离，表示弹着点分布的范围，精度采用主炮的精度×1.2」。

- **绘制**：虚线圈半径 = `player.sigma × 1.2 × |mouse − player|`（σ 为弧度，σ×距离=横向
  展开弧长，与直射散布锥 `drawSpreadCones` 同一物理口径）；he 爆炸半径不再画圈。
- **弹道**：实际落点同口径吃散布——`dirA` 加 `gauss(σ×1.2)` 切向偏移。**配套修掉一个
  隐蔽 bug**：`targetX/Y` 若预置 aimPoint 原值，stepShells 沿散布后 dirA 飞 totalDist
  后**强制吸附预置点** ⇒ 方向散布被覆盖（实测 60 发横向 σ≈0）。现沿散布后方向放置
  targetX/Y（径向距离保持瞄准距离）。
- **实测**：60 发落点横向标准差 **10.2px** vs 理论 σ×1.2×600=**13.0px**（高斯抽样波动内，
  均值 1.2px 无系统偏移）——圈与弹着分布一致，不再是装饰。

验证：`check-html` 0 / `tsc` 0 / `npm test` **49/49**。
---

## §4.110 剩余待办收口：#W-I 升级卡 / #3 HUD / NF-1·2·4 / #15 设计器三项（2026-10-20）

> 承接 §4.109（W-I 模式本体）。本批把 PLAN 剩余项全部落地，`npm test` 全程 **49/49**。

### #W-I 榴弹炮模式升级卡 ×2（commit `d298c4c`）

| 卡 | 字段 | 效果 |
|---|---|---|
| `howitzer_blast_range`（rare）| `splashRadius 90→135` | 阔域弹幕 |
| `howitzer_rapid_barrage`（epic）| `barrage: 3` | 急速射（0.5s 间隔 3 连发，队列清空后整组装填） |

**新通道**：模式升级卡写 `t._howitzerStats`（`firePrimaryShell` 的 howitzer 分支优先消费），
与 `weapons.primary.stats` 互不污染 ⇒ **仅模式内生效、直射不受影响**（用户口径）。
`ALL_WEAPON_TYPES` 并入 `HOWITZER_UPGRADE_TYPES`（upgrade-only）。
**急速射队列** `_howitzerBurst` + `updateHowitzerBurst`（battle 主循环驱动）——
⚠️ 实测踩坑：追发弹也走 howitzer 分支 ⇒ 无条件重挂队列永不耗尽，加 `_howitzerBurstIn` 跳过。
E2E：splashRadius 135 ✓ / 3 连发（left 2→0）✓ / 队列清空 ✓ / 整组装填 6.6s（3×2.2）✓。

### #3 HUD 合并（commit `360ebb3`）

- **弹种指示器两页同源**：`js/tank_hud.js` 新增 `renderAmmoIndicator(H)`（host 注入
  `list/currentIndex/onPick/showMult/centerActive`），battle/bench 均改调共享版，保留旧实现兜底。
- **battle 散布锥升级 dual**（1σ 实线 68% + 2σ 虚线 95%，长度仍 250px）。
- **血条/日志两处经核实属产品定位差异**（bench 右栏=靶车数据面板、日志=面板布局），
  不属「同功能两套实现」，保留各自形态。

### NF-1 卡牌查看器扩展（commit `f5e4f5d`）

`js/tank_cards.js` 新增 `formatCardDesc(card)`（纯函数）：`{value}` / `{pct}` / `{ov:key}`
（各带 `:N` effects 索引形式），未知占位符原样保留。battle 卡牌查看器加「全池」页签
（`cardPool` 全表）+ 描述经占位符实时求值 + 点击就地编辑（存 `sessionStorage` 会话预览）。
**覆盖率实测**：196 卡渲染后 190（97%）仍含数字 ⇒ 现有 desc 写法与占位符语法高匹配。

### NF-4 面板卡牌悬停预览（commit `dfbc5b2`）

`attachCardTooltip`：单例 tooltip（稀有度彩色徽章 + `formatCardDesc` 求值正文），
按钮右缘 +12px 定位、溢出翻折；`title` 保留为兜底。

### NF-2 坦克图鉴（commit `e5f8968`）

`js/tank_panels_core.js` 新增 `eenemyPreviewStats(tankId, level, opts)`（**纯查询**）：
临时 `makeTank` → `applyEnemyAppearanceAndStats` → `enemyLevelMults` 注入 `addModifier`
→ 读 stats；**全程不触碰实体注册表**。bench 敌实验室下方新增「坦克图鉴 CODEX」面板。
**等级曲线实测**（hummel）：lv1 hp100/pen120/dmg34/装甲100 → lv10 hp325/pen283/dmg80/装甲190。

### #15 设计器三项（commit `6467775`）

| 项 | 根因 | 修复 |
|---|---|---|
| ① 履带动画长于贴图 | 单向平铺（`x0+phase−tileLen` 铺到 `x1`）⇒ 一端完整、一端半块残片 | 改**中心对称平铺**（`k ∈ [−halfTiles, +halfTiles]`），局内+设计器同口径；实测 4 组相位两端覆盖恒 0.00 |
| ② 舱盖无实时预览 | 纹理叠层门控 `texture !== 'none'`，而 **appearance 就画在 `paintPartTexture` 内** ⇒ 纯色涂装下外观件完全不渲染 | 门控放宽为「有纹理 **或** 有外观件」 |
| ③ 两车长塔坐标系不同 | 内置基线 `cupCy = cym − W*0.44`，外观件基线是炮塔中心 ⇒ dy=0 差一个常数、调 dy 似绕中心对称 | 外观件纵向改 `(cym − W*0.44) + dy` 与内置同基线；实测 `(−1.29,−7.60)` vs `(0.00,−7.60)` 纵向逐位一致 |

### 验证与提交

`check-html` 0 / `tsc` 0 / `validate-content` 0（196 卡）/ `npm test` **49/49**（每批各自验证）。
提交：`d298c4c` → `360ebb3` → `f5e4f5d` → `dfbc5b2` → `e5f8968` → `6467775`，均已推送。
### §4.109 更正：榴弹炮曲射模式是**副武器**而非技能（commit `85d8057`，2026-10-20）

**用户反馈**：「榴弹炮模式被做成了技能而非副武器，且无法激活」。
PLAN §6 原文即「**新副武器**：榴弹炮曲射模式」——§4.109/§4.110 实现成 `ability`（技能槽 toggle）
是口径错误；且 `SKILL_DISPATCH` 未注册该键 ⇒ 按技能键只得「无激活入口」。

**重构为副武器**：

| 项 | 旧（技能） | 新（副武器） |
|---|---|---|
| 载体 | `t._howitzerMode` + ability key | `weapons.secondary.type === 'howitzer'` |
| 获取 | `howitzer_mode.json`（ability） | `weapon_secondary_howitzer.json`（weapon install，epic） |
| 判据 | 8 处分散判断 | 单一 `isHowitzerMode(t)`（`tank_weapons.js` 导出） |
| 升级 | 写 `t._howitzerStats` | 副武器 upgrade 通道写 `weapons.secondary.stats` |
| F 键 | 技能键 1~3 | **不响应**（载体，射击走主炮） |
| 卸下 | 再按 toggle | 换掉副武器即回直射 |

**模块加载顺序坑**：`tank_fire.js` / `tank_move.js` 在 Node 下无全局 `isHowitzerMode`，
故各加惰性解析器（全局 → `require('./tank_weapons.js')` → 内联等价兜底），
避免模块顶层 require 顺序依赖（首版直接调用导致 `test-move`/`test-fire`/`test-replay`/
`test-tankcollision` 四项 ReferenceError）。

**实测**：安装→`isHowitzerMode=true`；卸下→回直射（弹无 isArc）；主炮曲射
（isArc/he/落点=aimPoint）；F 不响应；升级卡写 secondary.stats 且弹按 135 结算；
**稳态 1/3 限速** 直射 249.6 vs 曲射 83.2 = **0.333**
（180 帧测得 0.493 是加速未完成，非缺陷）。`test-fire` 7e 段改写为 **11 条断言**。

验证：`check-html` 0 / `tsc` 0 / `validate-content` 0（196 卡）/ `npm test` **49/49**。

## §4.111 代码审查修复（2026-10-20）：散布系数收口 + bench 弹种条回归 + 归档口径纠偏

> 来源：`/code-review` 审查 `35a376e..4d0a37c`（21 提交 / 28 文件 / +1305−153）。
> 结论 2 项 blocker 级 + 5 项 suggestion，逐条核实后**实际成立 3 项**（其余经复核不成立，见「已撤回的建议」）。

### 1. 散布系数收口（真实缺陷，`js/tank_fire.js` / `tank_battle.html` / `js/tank_weapons.js`）

**问题**：榴弹炮曲射的散布系数 `1.2` 在两处**各自硬编码**——`js/tank_fire.js` 的落点切向
偏移（`spSigma = sigma * 1.2`）与 `tank_battle.html` 的瞄准圈半径（`sigmaSpread = sigma * 1.2 * aimDist`）。
两者必须始终一致（圈是落点分布的可视化），但无共同常量 ⇒ 改一处忘另一处会让「圈」与实际
弹着脱节，且无测试能发现。

**修复**：系数收口进 `WEAPON_DEFAULTS.primary.howitzer.spreadFactor`（缺省 `1.2`），
两个消费方均改为读表（缺失时回退 1.2）。同批把 `tank_battle.html` 里原本在 `minArcRange` 之后
才声明的 `hsDef` 提到函数开头，避免同一段重复取值。

**回归**：`test-fire.js` 7e 段新增 2 条断言——`spreadFactor` 存在且为正、
`moveSpeedRatio === 1/3`（此前只测行为不测参数表，收口后需防退回字面量）。

### 2. bench 弹种指示器视觉回归（`tank_bench.html`）

**问题**：#3（2026-10-20）把两页弹种指示器收敛到共享 `js/tank_hud.js` 的
`renderAmmoIndicator(H)`，但 **bench 的 `<style>` 里从来没有 `.ammo-cell` / `.ammo-cell.active`
规则**——旧 bench 实现靠元素**内联样式**（`opacity` / `font-weight`）表达激活态，
共享实现改输出结构类 `.active` ⇒ bench 弹种条的激活高亮**整体消失**（只剩结构容器）。
这是 #3 合并引入的静默回归，Node 链完全覆盖不到（纯 CSS + DOM）。

**修复**：bench 补 `.ammo-cell` / `.ammo-cell.active` / `.key` 三条规则（口径对齐
`tank_battle.html:41-47`）；同时把内联兜底分支的 `ammo-active` 类名统一为 `active`
（`centerActive` 的查询选择器与样式选择器此前是两套口径，一个 `[data-ammo].active`、
一个 `[data-ammo].ammo-active`）。

### 3. 归档与测试注释口径纠偏（`docs/ARCHIVE.md` / `scripts/test-weapon-upgrade-balance.js`）

**问题**：`85d8057` 已把榴弹炮从「技能开关（`t._howitzerMode`）」整体重构为
「副武器（`weapons.secondary.type === 'howitzer'`）」，但两处仍在描述**已被推翻的旧方案**：
- `scripts/test-weapon-upgrade-balance.js:63,197` 注释写「howitzer 是模式（`t._howitzerMode`）」
  「安装卡 = ability 挂载卡 `howitzer_mode.json`」——`t._howitzerMode` 全仓已无定义、
  `howitzer_mode.json` 已删除；
- `docs/ARCHIVE.md` 2026-10-20 行的 W-I 段同样写「运行时模式 `t._howitzerMode` + 新增
  `t._howitzerStats` 模式专属参数通道」。ARCHIVE.md 是**完结条目索引表**，写错口径会让
  后续检索者得到与现行实现相反的结论。

**修复**：测试注释改为副武器口径；ARCHIVE 该段改写为现行口径并保留原措辞作沿革注记
（`⚠️ 原文…系实现中途态`），指向本节与 §4.109 更正段。同时把 `test-weapon-upgrade-balance.js`
的 howitzer 豁免从「无条件 continue」收紧为「仅在缺安装卡时 continue」——`weapon_secondary_howitzer.json`
本就是 weapon install 卡，走通用校验即可。

### 已撤回的建议（复核后不成立，留档避免重复排查）

| 审查意见 | 撤回理由 |
|---|---|
| `tank_fire.js` 用 `gauss()` 但该函数不存在 → ReferenceError | `gauss` 是 `firePrimaryShell` 内的局部 const（`:144`，`c.gaussian \|\| _G('gaussian', …)`），非未定义标识符 |
| `tank_weapons.js` 的 `isHowitzerMode` 在 `module.exports` 之后定义 → Node 取到 undefined | 函数声明提升；`test-fire` 实测 `W.isHowitzerMode` 可用 |
| Boss 激光绕过应急护盾的 `invulnT` 无敌链 | `tank_boss.js:557` 早在基线版本（`35a376e`）就有 `if (e.invuln \|\| e.invulnT > 0) continue;` |
| `eenemyPreviewStats` 的 `armor.hull` 点分路径可能不被 `addModifier` 支持 | `js/tank_model.js:787-788` 有同款先例（`entityMults.armorAll` 即走此路径） |
| 卡牌查看器描述编辑的事件绑定重复/泄漏 | 每次渲染重建 `innerHTML`，旧监听器随节点销毁，不泄漏 |
| `updateHowitzerBurst` 调用点在装填门控之后导致队列永不启动 | 首发由 `firePrimaryShell` 直接 push，队列由 `_howitzerBurst` 存在性驱动，与 `reloadT` 门控无耦合 |

### 验证（2026-10-20）

- `node scripts/check-html.js` → **EXIT=0**（All checks passed）
- `node node_modules/typescript/bin/tsc --noEmit` → **EXIT=0**
- `npm test` → **48 通过 / 1 失败（49 项）**；唯一失败 `test-cover-gen.js` 为沙箱
  `spawnSync` EPERM + 既有 #V1 基准漂移（`PLAN.md` §2.5 / `ISSUES.md` #V1 已登记，与本批无关）
- `node scripts/test-fire.js` → **EXIT=0**（含新增 2 条参数表断言）
- `npm run test:browser` → **INCONCLUSIVE（exit 86，spawn EPERM）**，沙箱限制，
  按 `sandbox-verify` skill 需放宽进程权限后补跑（重点复核 bench 弹种条激活高亮）

## §4.112 2026-10-20 ISSUES/PLAN 全量清账（#V1/#V2/#W7/#W8/#W9/#W11/#W13/#W14/#W15/#W16/#W17/#W18/#X1~#X7/#Y1 + PLAN 遗留项）

**结论**：2026-10-20 一次性清空 `docs/ISSUES.md` 的**全部存量条目**与 `docs/PLAN.md` 的**全部已完成遗留项**。清账过程本身发现了两个此前无人察觉的系统性缺陷——**测试链假绿**与 **P1 玩法缺陷 #Y1（曲射弹途中被直射扫掠段截胡）**，两者构成同一条因果链。同时判定 5 项条目属于「**文档记载与代码现状脱节**」（问题早已不存在或被更早的提交修掉，但文档未同步），其中 **#V1 的根因判定本身是错的**。

**现行细则归口**（本节只留简结论，数值一律以对应 specs 卷为唯一口径）：

| 系统 | 归口 |
|---|---|
| 战斗（曲射弹越障 / F 边沿 / 火箭巢朝向 / 急速射落点 / 能力键集合 / HE 破障 / 曲射俯仰） | `specs/combat.md` §3.2b / §3.2c / §4 / §6.1 / §8.2 |
| 卡牌（tags 下线 / PASSIVE_KEYS / replaceAmmo 校验 / 防御方减伤 / economy） | `specs/cards.md` §3 / §4 / §6 / §11 |
| 地图（coverWorldScale / 出生点 / 水域收尾 / 兜底语义 / directionTolerance / 死配置） | `specs/map.md` §27 |
| Boss（anchorRange·targetRange / aiState / 机炮射程） | `specs/boss.md` §10 |
| 编辑器（appearance / 叠加层基准 / aimSpeed / bench 分组 / content_designer） | `specs/editor.md` §8 |

**三链验证记录（2026-10-20 实跑）**：
```
node scripts/check-html.js                     → EXIT=0  All checks passed
node node_modules/typescript/bin/tsc --noEmit  → EXIT=0
node scripts/run-tests.js                      → 48 通过 / 1 失败 / 共 49 项（约 230s）
   唯一失败 scripts/test-cover-gen.js = 沙箱 spawnSync EPERM（环境限制，非断言失败）
   放宽进程权限后复跑该链 → EXIT=0「全部通过」（含 --pick/--only 手动流程、covers-anchor-check 10/10 OK）
python scripts/prepare_covers.py --dry         → 需 PYTHONPATH=tmp/pylibs（含 numpy 2.5.3 / pillow 12.3.0）；设对后 10/10 OK
npm run test:browser                           → 未跑（沙箱 spawn EPERM，需放宽进程权限）
```

### (1) 本批「文档过期」判定：5 项经实测已修复或不成立

共同特征是「**文档记载与代码现状脱节**」——条目描述的现象早已不存在（或被更早的提交修掉），但 ISSUES 从未同步，导致后续 agent 按过期描述去"修复"本无问题的地方。**其中 #V1 的根因判定本身是错的**。

| 条目 | 原文判定 | 实测结论 |
|---|---|---|
| **#V1** `dump-cover-refs.mjs` 用基础层尺寸烘焙 canopy 层 | 「canopy 层复用基础层 `def.w/def.h` ⇒ `fallen_canopy` 基准质心偏移 3.06px」 | **根因判定错误**。真凶是 `bakeAssetCanvas` 对**负锚点补边**的处理，已在 `ba95e09` 修掉。`tools/dump-cover-refs.mjs:49` 那行**至今未改**，但 `node tools/dump-cover-refs.mjs --check` **EXIT=0**。⇒ 条目把「症状正确的旁证」误当成根因，属**误诊**。 |
| **#V2** `test-render.js` 依赖的 paint 绘制符号在 HEAD 缺失 | 「⑫/①/② 全链无法执行，`TypeError: P.getSpriteScale is not a function`」 | **不成立**。`test-render.js` 早已 **EXIT=0（92/92 全绿）**；仅 `drawPartSideWall` / `drawTankRimLight` 未进 `module.exports`（无消费方），已补导出。条目「§22.1/§22.8 实现整体缺失」的描述与 HEAD 不符。 |
| **#W7** `applyShield` 的 hp/时长参数是死参数 | 「只读 opts.omni/dir，其余硬取 RULES」 | 已修复（`applyShield` 现消费 `opts.hp/arc/dirDuration/omniDuration`）。 |
| **#W18-5** | 文档记载的某处冲突 | 经核实现行代码一致，无冲突。 |
| **#W18-6** | 同上 | 同上。 |

**教训（可复用）**：ISSUES 条目的「根因」比「现象」更容易过期——现象是观测，根因是推断；推断被后续提交推翻后，条目必须同步，否则会引导错误的修复方向。#V1 的「对症下错因」正是典型案例：症状（质心偏移 3.06px）真实存在过，但归因错了，真正的修法（`ba95e09` 的负锚点补边）与条目建议的修法（改 canopy 绘制尺寸）完全不同。

### (2) 测试链假绿：一个让测试长期失声的系统性缺陷（本批最重要的发现之一）

**缺陷**：`scripts/test-rework-r2.js` 与 `scripts/test-rework-r3.js` **全文没有设置 `process.exitCode`**（也不调 `process.exit`），而 `scripts/run-tests.js` 按 **`r.status === 0`** 判定每项是否通过。

**后果**：两个脚本的 harness 是 `let fails = 0; function ok(cond,label){ ... else fails++; }`，末尾只有一句**无条件**的 `console.log('...: 全部通过')`。于是 `test-rework-r3.js` 当时有 **7 项真实断言失败**，但 `node scripts/test-rework-r3.js` 仍 **EXIT=0** 且末尾打印「全部通过」，`npm test` 一直把它记为**通过**。**这 7 项失败可能已经很久没有被任何人看见。**

**修法**：补 `process.exitCode = fails ? 1 : 0`（照 `test-render.js` / `test-physics.js` 既有写法），并把末尾的无条件打印改为**有条件**（失败时打印「N 项失败」——否则日志仍然说谎）。

**修好后立即发生的事**：r3 转红，**7 项失败浮出水面**；其中 4 项经判定为「断言过期」（按现行口径改写），**2 项是真实的 P1 玩法缺陷**——即下文的 #Y1。**两环（假绿 + 注释说谎）共同导致该缺陷既没被测试抓住、也没被测试链暴露。**

**顺带核查**：扫全部 **48 个** `scripts/test-*.js`，**无第三例假绿**（全部有 `process.exitCode`/`process.exit`，且退出码依赖失败计数）。

**纪律（可复用）**：**新增或改动测试脚本时，`process.exitCode` 是硬性要求**——没有退出码的测试不是测试，只是会打印 ✓/✗ 的日志。此外「末尾无条件打印全部通过」是同一类谎言的另一半，必须与退出码有条件绑定。

### (3) #Y1 完整取证：曲射弹在飞行途中被直射扫掠段截胡（P1 玩法缺陷）

**现象**：迫击炮/榴弹炮曲射弹撞上「夹在射手与落点之间的坦克」时**立即引爆并结算直射伤害** ⇒ ① 中间坦克被途中击毁（本该「越过」）；② 远端落点目标**零伤害**（落点爆炸从未发生）。违反 `specs/combat.md` 曲射口径「可越过掩体，**仅在落点爆炸**」。

**根因**：`js/tank_fire.js` 的 `stepShells` 中，`if(s.isArc){ ... }` 块（约 `:932-1008`）内的 `return` **只写在** `if(s.dist >= s.totalDist){ ... return; }` 这个**内层**分支末尾；**`isArc` 块本身没有兜底 `return`**。于是曲射弹在**尚未抵达落点的每一帧**都会穿透到下方直射扫掠命中段（约 `:1009` 起），对沿途坦克做 `raycastTank` 扫描并走 `resolveHit` 结算，最终置 `s.dead = true`。

**加重证据（注释承诺了代码没做的事）**：块尾注释现写「曲射弹在落点结算后直接 return（不进入直射的扫掠命中段）」——**这描述的是期望，而不是实际结构**。更早的未提交版本注释为「#W-I 补回（替换时吞掉了原闭合行）」⇒ 说明 `#W-I` 用 `str_replace` 实现该分支时**把闭合花括号位置弄错了**：花括号**表面配平**（所以语法检查与阅读都不报警），但**语义反转**（`return` 落到了内层分支里）；之后有人把注释改写成「看起来对」的说法，结构问题却始终未修。

**取证手段**（不是靠读代码推断）：对 `shell.dead` 装 setter 捕获赋值调用栈 ⇒ 栈顶为 `js/tank_fire.js:1149`（**直射 `resolveHit` 结算路径**），而不是 `isArc` 落点分支（`:994/999/1004`）；同时 `applySplashAt` **零次调用**、`resolveHit` **被调用** ⇒ 完全符合「走了直射段」而非「落点爆炸」。

**A/B 实测**：
```
改前： deadAtDist=246.7 / totalDist=300   midHP=0（途中被击毁）  farHP=100（未掉血）  reachedTarget=false
改后： deadAtDist=303.3（步长越界，坐标精确吸附 300.0/0.0）  midHP=满血  farHP=570/600  reachedTarget=true
```
（步长越界后坐标**精确吸附**到落点，是 `isArc` 落点分支的正常行为：越界量 < 一个步长。）

**护栏**：共 **5 条**断言，含「**非整除步长**（`speed=233` / `totalDist=277`）仍精确吸附」与「越界量 < 一步长」。**反证**：删掉兜底 `return` 后立即复现 3 项红 ⇒ 护栏有真捕获力，不是空断言。

### (4) #W9 死键的根治与「测试为何抓不到」

**死键**：`super_fire_control` / `super_speed`。差集实测依据：`ABILITY_KEYS_RUNTIME`（当时 7 键）− 卡牌可授予的键 = 恰好这两键；且 **196 张卡 + `tanks/` + `bosses/` 全库零命中** ⇒ 玩家在真实对局中**永远拿不到**。

**测试为何抓不到（根因）**：旧 `test-rework-r1.js` **手工把两键塞进 `cardEffects`**，再断言「激活成功、散布倍率生效、冷却设置正确」。它测的是「**塞进去之后能用**」，**从未校验「现实中能不能拿到」**——而这正是死键的定义。ISSUES #W9 原文把这一点单列为「测试为何抓不到」，本批据此**根治**。

**处置**（用户裁定：删除）：`RULES.abilities` 两键、`ABILITY_KEYS_RUNTIME`、`ABILITY_LABELS`、`tryActivateAbility` 的两个 `case`、`tank_battle.html` 的 dispatch 与获得提示、`tank_bench.html` 的测试按钮、`ABILITY_KEYS` 全部同步删除。现行：RUNTIME **5 键**（artillery / overdrive / shield / deploy_cover / aps），`ABILITY_KEYS` **8 键**（上述 5 + repair / medkit / extinguish）。

**改为负向断言**（关键纪律）：`RULES.abilities.* === undefined` / `ABILITY_KEYS_RUNTIME` 与 `ABILITY_KEYS` 不含该键 / `tryActivateAbility(t, 'super_speed', {})` 返回 `{ok:false, reason:'unsupported'}` / 经 `__TEST__.triggerSkill` 也拿不到。**`reason` 先实测再断言**：删除后是 `'unsupported'`，而**仍存在的键无卡时是 `'no-ability'`**——两者可区分，并额外加了一条**语义区分护栏**（`artillery` 无卡应报 `'no-ability'` 而非 `'unsupported'`），防止将来把"已删键"和"合法但无卡"混为一谈。

**纪律（可复用）**：**负向断言是死键类问题的根治手段**。只测「能用」永远发现不了「拿不到」；必须断言「不存在」与「不可激活」。

### (5) 各条目的根因修正（原文判错或描述过弱之处）

| 条目 | 原文说法 | 实测根因（**修正后**） |
|---|---|---|
| **#W14** `aimSpeed` 两套量纲 | 「难度准度通道近乎失效」 | **不是「难度表没调」**，而是「敌军**根本没写 `base.aimSpeed`**」⇒ `computeStats` 回落 `spread.shrinkRate(0.15)`，而难度表 `[0.8,1.35]` 是按真实坦克 1.0~2.5 量纲设计的 ⇒ **两套量纲**。修后满难度 1.62（改前 0.2025，是玩家 1.5 的 7.4%）。 |
| **#X2** 生存/Boss 建筑压水 | 「清理没跑」 | **不是没跑**，而是「**跑在 `clearCoversOnRoads` 与 `fillEmptyBands` 之前**」——这两步会把元素**重新推出/补植到河道与湖面**（`fillEmptyBands` 的"纵向填满"兜底尤其会往空带补植被，而河道正是一条"空带"）。另叠加「AABB 包络近似」不精确。修后重叠 0（改前 35/21/5）。 |
| **#X3** 出生无避水 | 「玩家和敌方生成时都没有避水校验」 | **敌方侧判断有误**：`hitsCover` 走**全量 covers（含水域）**，720 敌 **0 例**落水 ⇒ **该侧未改动代码**。玩家侧成立（60 节点 1 例）。**为何不直接改 `tierBlocksSpawn`**：该谓词被「清场 splice」复用，并入水域会**删河段打断河流**（#T4 回归）⇒ 拆成两个谓词。修后 0/100 落水。 |
| **#X1** 外观件位置不受设计器影响 | 「位置不受设计器影响」 | **比原文更严重**：`applyTankConfig` **完全不拷贝 `spec.appearance`** ⇒ 游戏内 `t.appearance` **恒 `null`**，5 份 `tanks/*.json` 的外观件**从未生效过**。 |
| **#W13** anchorRange 死配置 | 「零消费」 | 接通时踩到**语义反转坑**：首版把 `anchorRange = 0` 当真值假值回落缺省 ⇒ 让 `boss_siege_fort`（设计意图「**固守**」炮台）变成**贴脸冲锋**。已修正为「`0` = **原地固守、永不前压**」。 |
| **#W15** 死配置清单 | 列出 6 项，含 `waterBridgeChance` | **前 5 项成立**（`fullDowngradeCap` / `road.branchCurveAmp` / `drowning.warnAt` / `breach.heCoverDmg` / `coverRules.deterministicOnly`，全部零消费已删）。**但 `waterBridgeChance` 判断有误**——实测 `diff=0 → 1/40 节点有 water` vs `diff=0.5 → 17/40`（18 实例），门槛**真实放行水体**，是**活配置**，保留不删（只澄清注释；不重命名，因重命名会改 RNG 流位差影响校准基线）。 |
| **#W16-①** covers `w/h` 与 `verts` 语义不一致 | 要求修判定逻辑 | 按 mapgen 裁定**只补断言、不改判定**：实测「带 verts 且可破坏」实例 **0 个**（verts 实例 2244 个，tiers 全是 rock/full/mud/road/water/river，hp 全 Infinity）⇒ 该偏差**现行数据下不可达**。断言写成**已知偏差锁 + 不可达性锁**，并标注「修好判定后本断言需翻转」。 |
| **#W16-②** 未注册 tier 抛错 | 「穿模」 | **不是穿模**，是两处 `TypeError`（`T[tier].shellBlock` / `.label` 未判空）+ 一处读**从不存在**的字段（`mediumHullExposure` 恒 `undefined` ⇒ 恒返回 0 的不可达死路径）。已补守卫、删死读取。 |

### (6) audit-map-gen G4 度量口径重写（测试工具侧）

**缺陷**：`scripts/audit-map-gen.js` 的 G4 用 `ptInRect(road_bbox, c.x, c.y, 8)` 判「结构压在道路中心线」，而 2026-10-16 `cde3bc3` 之后 strip 主干道是**整链连续多边形**（`verts` 可达 322 点，宽约 120px 的蜿蜒带），但 cover 的 `w/h` 仍是它的 **AABB**（实测 17280×661，多边形/bbox 面积比仅 **0.156**）⇒ 落在 AABB 纵带内、实际离真路面几十到几百 px 的元素全被判「压路」。

**实测**：G4 硬失败 **669 项全是假阳性**（总硬失败 762：G4 669 / G7 91 / G5 2）。

**修法**：改为「元素足迹 × 真实路面多边形」判定（AABB 粗筛 → 中心/顶点互含 → 边相交，容差 8px 与生成侧 `_ROAD_CLEAR_MARGIN` 同量级）。**G4 669 → 0**，总硬失败 762 → 92（G7/G5 为存量真实问题，不在本项范围）。

**防「归零即失效」**：新增 **6 条合成几何自检**（矩形路正压/跨路缘/远离、verts 多边形正压/外侧、verts+angle 旋转语义），自检失败直接计硬失败（G0）。**理由**：判据一旦退化成永远返回 false（verts 解析失败、坐标系错位），硬失败数会"漂亮地归零"但检查彻底失效——这是度量类工具最危险的失效模式。

**抽样核对（证明不是全放过）**：840 项「旧报新不报」按中心到真实路面边缘分层——`[20-60]` 11 项、`[60-200]` 490 项、`[>200]` 339 项，**没有一项 ≤8px**（即无一真正压路）；最近 11 项逐条复核（元素半宽 38~92px、最近边距 44~59px），独立重算「足迹与路面多边形相交」全部 false。**阳性能力**另行证明：构造 60×60 结构正压路面内点 → 判据返回 true。

### (7) 其余补齐项（简列）

- **#W8** `replaceAmmo` 零校验：新增两层（`AMMO_KEYS` 白名单 + `RULES.ammoChain[key] === replaceAmmo` 直系前驱）。196 张卡扫 **13 个** `replaceAmmo` 效果、链条不符 **0 个**（零误伤）。
- **#W-H** 防御方减伤通道零测试覆盖：`wet_ammo_rack`(0.30) / `crew_liner`(0.20) 的**防御方**通道（读 target 的 passiveValues，`defense = max(0, 1 − maxValue)`，if/else 单通道**不叠乘**）。补 **33 条**断言，实测精确比值 ammo ×**0.7000** / crew 6 键 ×**0.8000**，两卡同在手 140 / 120（叠乘应为 112 / 84）。**重要口径**：`draws=1` 时 `effectiveMult = max(mult1, 1.0)`，故攻击方 base ≤ 1.0 时防御因子会被 `max` 吃掉不可观测（既有行为，非缺陷，断言须挑 base>1 的弹种）。
- **#W15** economy `startScore`：零消费已从 `ECONOMY_FIELDS` 删除（现 3 项：`scoreMul` / `shopDiscount` / `reviveCount`），`runStartScore` 清零同步移除。
- **#X4/X5/X6/X7**：火箭巢朝向改炮塔朝向（扇形齐射）、榴弹炮 F = 曲射/直射模式开关（走原生 keydown 边沿）、曲射弹体俯仰与透视（`arcShellPose`，从同一 z 公式求导）、急速射锁定首发落点快照（200 组最大偏移 17.8px / 1σ 8.0px）。
- **#7①** bench 卡牌面板：`<optgroup>` 按稀有度分组（196 张 → 5 组：神话 1 / 传奇 15 / 史诗 44 / 稀有 77 / 普通 59），**rarity-only 不依赖 tags**。
- **#16** 卡牌 `tags` 字段下线：196 张 JSON + `CARD_TAGS` 常量 + `validateCard` 校验 + 导出 + UI 三处（奖励面板 / devpanel 搜索 / `content_designer.html`）全部移除；`test-cards.js` 用负向断言锁死（**断言数 48 → 248**，证明此前被 TypeError 截断的 200 条恢复执行）。
- **#W-J** Boss 机炮射程 900→1200：**已于 2026-10-20 实施**（`RULES.boss.tuning.autocannonRange` + `applyBossWeaponTuning`），**必须在 `assignBossArmament` 之后调用**。⚠️ 此前 PLAN/ARCHIVE 记为「不做」，旧记录保留在归档中并追加实施注记（被推翻的旧结论不静默删除）。

### (8) 本批收口后的测试链基线（2026-10-20）

| 脚本 | 断言数 | 退出码 |
|---|---|---|
| `test-cards.js` | **248**（改前 48，崩溃修复后恢复） | EXIT=0 |
| `test-covers.js` | **180**（新增 18：W16-① 6 条 + W17 12 条） | EXIT=0 |
| `test-modifiers.js` | **85**（新增 13：#W14） | EXIT=0 |
| `test-physics.js` | **55**（新增 33：#W-H） | EXIT=0 |
| `test-rework-r1.js` | **20**（W9 负向断言改造） | EXIT=0 |
| `test-rework-r2.js` | **30**（补 exitCode） | EXIT=0 |
| `test-rework-r3.js` | **71**（补 exitCode；4 项断言改写 + #Y1 修复后转绿） | EXIT=0 |

**全链**：`scripts/run-tests.js` → **48 通过 / 1 失败 / 共 49 项**；唯一失败 `test-cover-gen.js` = 沙箱 `spawnSync` EPERM（**放宽进程权限后 EXIT=0「全部通过」**）。`scripts/test-*.js` 共 **48 个**，`check-html.js` 的孤儿测试检查全过。

### (9) 同批追加：`restartRun` 死入口的最终摘除（2026-10-20，用户裁定「删除」）

**背景**：§4.112 收口时 `restartRun`（`js/tank_flow.js`）被判定为「死入口」但**暂缓删除**——理由是删除会连带击红 `scripts/test-flow.js` 12 处断言与 `types/globals.d.ts:360` 的声明，而两处都在 `role-systems` 写域之外。用户 2026-10-20 明确裁定「删除」，本小节记录执行结果。

**死因（三条，缺一不可）**：
1. **正式页面零调用点**——全仓仅 `scripts/test-flow.js` 与 `types/globals.d.ts` 引用，属**测试↔类型声明自循环**；`tank_battle.html` 仅剩一处历史注释。
2. **真实「重开」路径不经过它**——现行是 `gameover → battle` 直达（#N5 2026-10-10 简化流程）与「放弃节点」的 `battle → map` 转移，两者都是纯转移表操作。
3. **旧测试把缺陷固化成了期望**——`pause` 的白名单是 `['battle','settlement']`（无 `map` 出路），旧 `restartRun` 在暂停态必然抛错；而 `test-flow.js` 原有一条断言「restartRun 在 pause 态被白名单拦截：抛错且不静默改变状态」⇒ **断言「应该抛错」等于承认「暂停时不能重开」**。这是本批第二个「测试在保护缺陷」的实例（第一个是 §(2) 的假绿）。

**删除范围**（4 处，全部落地）：
| 文件 | 改动 |
|---|---|
| `js/tank_flow.js` | 删 `restartRun()` 函数体、`module.exports.restartRun`、以及**只为它存在**的 `FLOW_OUTRUN_STATES`（home/loadout/shop 局外三态集合）；原处留沿革注释，含「⚠️ 若将来真需要重开入口，不要恢复旧实现（pause 态会抛错），应显式补 `pause → map` 白名单」 |
| `scripts/test-flow.js` | 12 处断言改为**负向断言 + 语义等价的转移断言**：§8b（新）断言 `flowMod.restartRun === undefined` 且 `!('restartRun' in flowMod)`，并用 `battle→map` / `gameover→battle` 证明两条真实重开路径仍然可用；§16 保留「局外流转不误入 map、不递增 runId」的真正语义；§17d 保留「pause→map 仍被白名单拒绝 + 非法转移后状态/runId 不被静默改变」的硬约束 |
| `types/globals.d.ts` | 删 `declare function restartRun(flow: FlowState): void;`，原处留注记「不要恢复此声明——它会让一个不存在于运行时的函数通过类型检查」 |
| `docs/PLAN.md` / `docs/specs/` | 本条不发散到 specs（属内部 API 清理，非系统口径变更）；只在 §4.112 与 PLAN §1 纪律表留痕 |

**验证（2026-10-20 实跑）**：`node scripts/test-flow.js` → **EXIT=0 全部通过**；`node scripts/check-html.js` → EXIT=0；`node node_modules/typescript/bin/tsc --noEmit` → **EXIT=0**（证明删声明后无残留引用）。

**教训（可复用）**：**「测试断言 X 会抛错」必须追问「X 抛错是不是本来就该修」**。本批两例（假绿 + 把缺陷当期望）都源自「测试只验证现状、不验证现状是否合理」。

### (10) 同批追加：PLAN 剩余项的实测关闭（2026-10-20）

清账后 PLAN 仍留 4 条开放项，逐条实测复核后**关闭 3 条、保留 1 条**：

| 原 PLAN 条目 | 判定 | 依据（实测） |
|---|---|---|
| **§2.2 HUD 渲染级合并**（剩余「装填指示」） | ✅ **关闭** | 经核实与血条**同性质**：battle = 炮口环形弧（面向战斗节奏）、bench = 右栏横条（面向参数核对），承载不同信息，不属「同一功能的另一套实现」。9 处的最终去向 = 6 合并 + 2 产品定位差异 ⇒ 无剩余项 |
| **§2.3 正常环境补跑验证** | ✅ **关闭** | 本批已全部实跑：`check-html` 0 / `tsc` 0 / `run-tests` 48+1（唯一失败为 EPERM，放宽权限后 EXIT=0） |
| **§2.4 `audit-map-gen.js` 口径** | ✅ **关闭** | 已修（G4 669→0 + 6 条合成自检），见 §(6) |
| **§1 条目 1 的剩余子项「strip 密度/难度校准重锚」** | ⚠️ **密度项关闭、难度项保留为可选** | **实测反驳了当年估算**：§3.6 估「裁到 2.2 屏后 ≈6.7 个/屏（现状 13 个/屏）⇒ 需密度补偿」；现行 `makeNode` strip 路径（标准 + 生存各 6 seed、1920×1080）非路面元素密度 = **13.8 个/屏**，与当年「现状」持平 ⇒ **密度补偿无需再做**。当年低估是因为按「裁到 2.2 屏」的裁剪模型估算，而现行 strip 实际 **19.8 屏**且未做纵向丢弃。难度曲线（`entityMults × diff`）仍为可选微调，属数值口味而非功能缺失 |
| **§1 条目 8 地图元素出图** | ❗**保留**（唯一真开放项） | 唯一阻塞 = **API 凭据**（`tools/gen-covers.mjs:86` 需 `GEMINI_API_KEY` / `REPLICATE_API_TOKEN` / `OPENAI_API_KEY` / `COVER_API_KEY`）。实测 `assets/` 当前零 cover 产物（仅 `tanks/` + `README.md`）⇒ 运行时走程序化回退，玩家无感知。前置已清：`tools/cover-refs.json --check` = EXIT=0（#V1 为文档过期，真凶 `ba95e09` 已修） |

**PLAN 关账后状态**：`docs/PLAN.md` §1 待办总览仅剩 **1 条**（地图元素出图，阻塞于外部凭据）；§2 五节全部标记关闭；§3 C 档设计研究保留作设计预留（方案未实施，非待办）；§6/§7/§9 全部完成、保留作沿革索引。

## §4.113 2026-10-21 docs/specs 五卷主题化重构（编号零变更）

**结论**：`docs/specs/` 五卷（combat / map / cards / boss / editor）完成一次**结构性重组**——解决「**两套组织维度并存**」导致的检索困难，同时**章节编号零变更**（五卷 `LOST=[]`），使外部引用不受影响。重构后五卷合计 **3026 行**，`git diff` 为 **5 files changed, 619 insertions(+), 188 deletions(-)**。

**归口**：本节即结论唯一归口（本次为**文档工程**改动，不涉及运行时行为，故不产生新的 specs 条款）；现行口径仍以各卷正文为准，**查询入口改为各卷卷首 §0 主题索引**。

### (1) 问题诊断（实测数字，不是主观感受）

**两套维度并存**：五卷内部都是「**前半按主题、后半按批次**」——
- cards：§1~§5、§7 按主题；§6(#A14)、§8(2026-09-13)、§9(2026-09-14)、§10(#O3)、§11(#U23) 按批次
- boss：§1~§3 按主题；§4(P-51)、§5(P-51)、§6(#E9)、§7(#G)、§8(#I)、§9(#J)、§10(2026-10-20) —— **Boss 机制散落在 7 个批次节**
- editor：§1~§4、§6 按主题；§5(P-49)、§7(#C5)、§8(2026-10-20) 按批次
- combat / map 同构（如 combat §8「2026-09-20 用户反馈批次」…§14 游戏模式；map §17~§27 均为批次节）

**同一机制散落多节**（重构前实测）：
| 机制 | 横跨节数 |
|---|---|
| 装填 | **10 节** |
| `reload` | **9 节** |
| 跳弹 | **5 节** |

**同文档内数值自相矛盾**：`map.md` 的 `RULES.nodeMap.coverWorldScale` **同文件出现 3 套不同值**，其中**两处漏 `building` 键**（详见 (4)）。

**「已被取代/作废/沿革」标记密集**：combat.md **19 处**「已被…取代 / 已废弃 / 已作废」+ **49 处**「沿革」；map.md **23 处** + **28 处** —— 说明五卷是在多轮裁定中「只增不改」累积而成的，**历史层积本身就是混乱的主因**（这些标记必须保留，但读者需要一条「只看现行」的快速路径）。

### (2) 重构方针与关键取舍：**为什么不重编号**

**决定性事实**：实测**至少 191 处**外部文档 / 代码引用以「`specs/<卷>.md §N`」的形式指向五卷（Lead 实测口径：179 个 md 文件引用点 + 14 个 js 文件引用点）；且历史批次日志（`DEVELOPMENT-batches-*.md`）按 `AGENTS.md` §2 纪律「**只增不改**」，其中的章节引用**不可回改**。

> **口径说明**：本节采用 Lead 的 191 处（引用点）作为量级依据。若用更严格的正则（仅匹配紧邻写法 `specs/<卷>.md §N`）实测为 **129 处**（md 106 + js 23）；用更宽口径（卷名 + § 允许中间隔字符）则更多。**数量级一致（10² 量级）、结论不受影响**：重编号必然会击穿大量外部引用。

**⇒ 用户裁定：保留现有编号，只重组内容与分组。** 这是本次最重要的设计决策，理由三条：
1. **编号是外部契约**——191+ 处引用中有 `DEVELOPMENT.md` 的 45 处（含 `cards.md §8.3`/`§8.4`/`§9`、`boss.md §4`/`§6`、`editor.md §7` 等）、`js/` 源码注释、以及历史归档正文；重编号 = 大范围静默失效。
2. **历史日志只增不改**——归档已冻结，不可能跟着改号。
3. **重编号的收益是「读起来顺」，代价是「所有引用失效」**——而「读起来顺」可以用**索引**以近乎零成本达成（见 (3)）。

**允许 / 禁止清单（执行口径）**：
- ✅ 允许：卷首新增 `## 0. 主题索引`、批次节加主题标签行、新增带**新编号**的节（如 map.md §28）
- ❌ 禁止：改动 / 删除 / 重排任何既有 `## N.` / `### N.M` 编号；把批次节正文搬进主题节
- **唯一例外**：`editor.md §7.5` 的**物理位置**错序（原顺序 7.4 → 7.6 → 7.7 → 7.5）——只调位置、**编号文字不动**，并在节首记录原顺序

### (3) 五卷各自的手段

**① 卷首 `## 0. 主题索引（按问题查，不按章节序读）`** —— 本次的解药。三列表格：

| 列 | 作用 |
|---|---|
| **我想查……** | 站在「不知道历史、只想查某个机制」的读者视角的问题陈述 |
| **现行口径（先看这里）** | **直接给出唯一该读的节号**（例：boss「激光」→ §6 末条 + §8.1/§8.2） |
| **来源沿革（不必读）** | 追溯用；明确标注「不必读」，降低阅读负担 |

**实测规模**：五卷 §0 索引数据行合计 **89 行**（combat 24 / map 18 / cards 16 / boss 15 / editor 16），每卷另附**「读法建议」**一段，点明该卷最易被章节序误导之处（如 boss：「机制分散在 7 个批次节里」；editor：「批次节才是近年改动落点」）。

**② 批次节加两行主题标签 + 「非主题基线」提示** —— 实测合计 **46 处**（combat 7 / map 24 / cards 5 / boss 7 / editor 3）：
```
> *主题：xxx（N.1）/ yyy（N.2）…*
> *⚠️ 本节为批次章节，非主题基线。现行口径见卷首「§0 主题索引」。*
```

**③ 数值去重：唯一口径节 + 其余指针化 + 旧值留沿革注记** —— 三步法：
1. 选一个节作为**唯一口径**（写当前值 + 代码出处）；
2. 其余节改为「见 §X」指针（**不重复罗列数字**）；
3. **旧值不静默删除**——在原处改写为「沿革注记」并标注日期与批次号。

**④ `map.md §28 掩体体系主题归并视图`（本次新增编号）** —— 专为「掩体这一最难检索的主题」而设：**只放指针、零参数数值**（§28.1 主题分布 / §28.2 tier → 行为 → 现行口径所在节 / §28.3 一句话结论）。这种「归并视图节」是**在编号不变前提下**给强耦合主题做的额外导航层，可作为将来同类主题的模板。

### (4) 发现的实质错误（不只是格式问题）

本次重构不只是排版——**核对现行代码后发现了 7 处「文档与实现不符」或「文档自相矛盾」**，其中前两条会直接误导调参：

| # | 位置 | 问题 | 实测影响 / 修正 |
|---|---|---|---|
| **1** | `map.md` `coverWorldScale` | **两处漏 `building` 键**（同文件 3 套不同值） | **若照文档调参会以为无此键**。代码侧 `js/tank_nodegen.js` 的 `sizeFactor` 在 `typeof coverWorldScale[tier] !== 'number'` 时回落 **1** ⇒ 楼房尺寸偏大约 **2.4 倍**（0.42 vs 1.0），这正是 **#W18-1** 修掉的缺陷。**已收口为 §2 一处唯一口径**（代码实测 `{half:0.42, full:0.42, building:0.42, barricade:0.32}`），其余三处改为指针 |
| **2** | `combat.md §10 / §11.1 / §11.5` | **三节全部已被 §13.5 取代**（视野距离系统 2026-09-30 #J3 整体退役），却仍标着「**现行口径**」 | 读者会去读三套**已作废**的视野公式。**已改标**「已被 §13.5 取代，仅沿革」（§11.5 另注明「已被 #K1 与 §13.5 取代」）；§11 的父级标题保留「现行口径」字样但子节已明确标注 |
| **3** | `map.md` 出生点判据 | 缺 `shellBlock === 'single'` **第三支** | 原文只写 `passability===0 \|\| shellBlock` ⇒ 读者会漏判「只挡单发」类 tier。**已补**完整三支（§18.2 / §27.2） |
| **4** | `map.md` `full` 掩体视线 | 原文写「**不遮**」 | 实测 `hasLineOfSight` 穿 `full` 返回 **false** ⇒ 应为「**遮挡视线**」（与 `RULES.coverTiers.full.vision = true` 一致）。**已改**并留 2026-10-21 补正注记 |
| **5** | `map.md` `barricade` | 原文写「**>70° 可跳弹**」 | 实际「**挡 1 发即毁、不跳弹**」——**70° 是装甲的跳弹角，不是掩体口径**（概念串台）。**已改** |
| **6** | `combat.md §8.7` | `mouseLeadRatio` 文档 **0.30** / 代码 **0.40** | **已改**为 0.40 并注明「2026-10-21 按 `RULES.camera` 核对」（**注意字段在 `RULES.camera` 而非 `RULES.vision`**，文档已按正确路径改写）；原 0.30 保留为沿革数值（并保留其历史后果：「cap = 600 ⇒ +15%/+25% 两卡同被压到 R = 600」） |
| **7** | `editor.md §7.4` | 「仍未合并：装填指示」与 **2026-10-20 用户裁定关闭**冲突 | 已改为**已关闭** + 沿革注记（旧结论建立在「凡两套实现就该合并」的前提上，该前提已被推翻）；§7.7 同步加 2026-10-21 状态说明 |

**教训（可复用）**：这批错误的共同特征是「**文档写的是某个历史时刻的正确值，但没人负责在代码变更后回头改**」。`coverWorldScale` 漏 `building` 尤其危险——**照文档调参会得到"参数不存在"的错误结论**，进而去改别的参数。**数值型条款必须带「代码出处 + 实测日期」**，否则无法判断是否过期。

### (5) 验证记录（2026-10-21 实跑）

```
node scripts/check-html.js        → EXIT=0  All checks passed
node scripts/validate-content.js  → EXIT=0
node scripts/test-cards.js        → EXIT=0
五卷章节编号机器比对              → LOST=[]（零丢失；新增仅 §0 与 map §28/§28.1~§28.3）
coverWorldScale 完整四键值        → 全卷仅 1 处（map.md §2），其余 3 处为指针
卷内 § 引用自检                   → combat 242 处 / map 372 处 / cards+boss+editor 133 处，全部核实，修正 11 处错误指向
git diff                          → 5 files changed, 619 insertions(+), 188 deletions(-)
```

> **注**：本次为纯文档重构，不涉及 `js/` 运行时改动，故未跑 `npm test` 全链；`check-html` 的孤儿测试检查与语法冒烟已覆盖 `scripts/` 侧一致性。

### (6) 两条留给未来的判断（code 侧事实，非缺陷，但易踩）

**① `perm_block` 的 `shellBlock` 写成字符串 `'solid'` ⇒ 拦截侧实际不拦弹**
`RULES.coverTiers.perm_block.shellBlock` 现值为字符串 `'solid'`，而 `normalizeCoverTiers()` **只在 `shellBlock === undefined` 时**才派生 `mode` ⇒ 该 tier 的 `mode` 为 `'none'` ⇒ **弹道拦截侧实际不会拦弹**（尽管它 `passability: 0` 不可通行、`vision: true` 遮挡视线）。
**当前无运行期影响**：该 tier **无任何生成器产出**（`generateNode` **132 节点实测 0 次**），仅作旧存档 / 基线兼容。**若将来启用，必须把 `'solid'` 改成 `true`**（否则会出现"撞不过去但打得穿"的反直觉现象）。已记入 `specs/map.md` §5.1 / §28。

**② `RULES.nodeMap.coverWorldScale.half` 仍存在但 `half` tier 已删 ⇒ 零消费**
该键是**零消费**（`half` tier 已于 2026-09-20 #E3 整体删除，无任何元素会查 `coverWorldScale['half']`）。**保留无害**（避免旧存档/脚本读取时报缺失），**但易误导**——读者会以为还有 `half` 掩体。已在 `specs/map.md` §2 唯一口径表中明确标注「`half` 无对应 tier，仅为兼容残留」。

### (7) 留给后续的纪律（已同步写入 `AGENTS.md` §2.1）

**specs 章节编号是外部契约，不得重排。** 需要重组时用「**卷首 §0 主题索引 + 批次节主题标签 + 数值唯一口径**」三件套，**禁止重编号**。该纪律的立论与本次实践见本节 (2)(3)。

## §4.114 2026-10-21 docs/specs 五卷 wiki 化（59 页，§N 兼容层保 597+ 处引用）

**结论**：`docs/specs/` 五卷（combat / map / cards / boss / editor）完成 **wiki 化**——正文拆成 **59 个一主题一页**的主题页，同时把五卷单卷文件改写为 **§N 兼容索引页**，使 **597+ 处外部引用继续解析**。五卷 **243 个标题编号零丢失**（`LOST=[]` / `EXTRA=[]` / 顺序一致），内容零丢失（标识符级比对缺失 **0**），链接断链 **0**、锚点失效 **0**（本次新增部分）。

**归口**：本节即结论唯一归口（本次为**文档工程**改动，不涉及运行时行为，故不产生新的 specs 条款）。现行口径仍以各卷 wiki 页为准；**查询入口改为各卷 `<卷>/index.md`**。

### (1) 用户要求与两次裁定

**用户要求（2026-10-21）**：「**按 wiki 的要求和风格重构 spec 文档**」。

**裁定 ①（拆分方式）**：拆成**多页 wiki，一主题一页**。不再是「单卷长文 + 按时间追加的批次章节」——单卷最长 900+ 行、同一主题散落 5~10 节，读者查一个机制要先跳三次。

**裁定 ②（兼容层）**：**保留 `§N` 兼容层**。这是本次最关键的设计约束，见下 (2)。

### (2) §N 兼容层机制（核心设计）

**做法**：`docs/specs/<卷>.md` **不删除**，改写为**兼容索引页**：

- **保留全部标题编号**（`## N.` / `### N.M` 一个不改、不删、不重排）；
- 每节写 **1~3 行摘要**（说清「这节讲什么 + 有什么约束」）+ 一个「**详见**」链接指向主题页；
- 顶部保留 `## 0. 主题索引`（改为指向 wiki 页）；
- 文末加维护说明（新增章节仍按 `§N+1` 追加）。

**为什么必须这样做**——三条理由，缺一不可：

1. **597+ 处外部引用必须继续解析**：`js/*.js` 源码注释、`AGENTS.md`、`DEVELOPMENT*.md`、`docs/archive/*` 归档分卷、其它 specs 卷之间，全部以「`specs/<卷>.md §N`」的形式指向五卷（2026-10-21 实测五卷合计 **597+ 处**：combat 245、map 200+、cards 85、boss 43、editor 34；口径与 §4.113(2) 的 191 处不同——后者只统计了「md 引用点」，此处含 js 与跨卷）。
2. **历史批次日志按纪律「只增不改」**：`DEVELOPMENT-batches-*.md` 与 `docs/archive/*` 已冻结，其中的 `§N` 引用**不可回改**。
3. **解耦**：**`§N` 是稳定契约，wiki 页是内容载体**——两者分离后，内容可以继续重组/拆分/合并，而编号永远稳定。

> **反面教材**：若不建兼容层而直接「按主题重排单卷」，597 处引用会**大范围静默失效**（链接不报错、但指向错误内容），且无法通过一次 grep 发现。

### (3) 规模数字（2026-10-21 实测）

| 卷 | wiki 页 | 兼容索引页（非空行） | 标题数 | 行/标题 |
|---|---|---|---|---|
| combat | 17 | **225** | 63 | 6.6 |
| map | 13 | **389** | 119（含 4 个 `####`） | 6.3 |
| cards | 11 | **87** | 17 | 8.4 |
| boss | 9 | **102** | 22 | 7.9 |
| editor | 9 | **98** | 22 | 7.7 |
| **合计** | **59 页** | — | **243** | — |

> **口径说明**：兼容页行数按**非空行**统计（含标题行与摘要行，不含空行）。若按总行数，combat 418 / map 751 / cards 143 / boss 174 / editor 170。两种口径都可复现，本节用非空行是为对齐「6.3~6.6 行/标题」的密度标定（见 `WIKI-STYLE.md` §7.5 ⑤）。
>
> **兼容页 ≈ 6.3~6.6 行/标题是正常密度**——它是「标题 + 1~3 行摘要 + 空行」的自然结果。**不要**为提高压缩比而把摘要压到一行（读 `§N` 引用的人会看不出该不该点进去）。

### (4) 验证方法（这套方法论本身值得记录）

wiki 化是**结构性破坏**（正文从单卷迁到多页），所以验证不能只看「页面建出来了没有」。本次用了**四重校验**，全部可脚本复现：

**① 编号三重校验**（`tmp/wiki-check.js`）

| 校验项 | 说明 | 五卷结果 |
|---|---|---|
| `LOST=[]` | 原编号集合 − 兼容页编号集合 = 空 | **全空** |
| `EXTRA=[]` | 兼容页编号集合 − 原编号集合 = 空 | **全空** |
| **位置顺序比对** | 不只比集合，还比**顺序**（`JSON.stringify` 逐项相等） | **全 true** |

> **为什么必须比顺序**：集合相等但顺序错乱（如 §7.5 排到 §7.7 之后）会让读者按章节序阅读时产生误解。三卷里 `editor.md` 恰好就有这个历史问题（§7.5 原物理错排在 §7.6/§7.7 之后），拆分时已归位、**编号文字未改**。

**② 内容零丢失：标识符级比对**（同脚本）

从原文抽出全部 **≥4 字符英文标识符** 与 **全部数字**（含小数），校验它们是否出现在「兼容页 + 全部 wiki 页」的合并语料里。实测：

| 卷 | 标识符 | 数字 | 缺失 |
|---|---|---|---|
| cards | 509 | 169 | **0 / 0** |
| boss | 342 | 135 | **0 / 0** |
| editor | 379 | 106 | **0 / 0** |

> **这套比对能抓出「概括性改写」**：例如把「`ammoMult=2` / `crewMult=1.5`」简写成「按弹种表值」会丢掉两个数字，token 比对立刻报缺失。本次三卷初拆时确实各报出过 1~13 个缺失（多为跨卷引用号 `combat.md §3.1` 这类），逐条补回后归零。

**③ 节→页映射覆盖**：243 个标题全部有目标页。每份快照文件（`docs/archive/2026-10-pre-wiki-<卷>.md`）内置**完整映射表**（「原节 → 目标页」逐行），可直接核对。

**④ 链接/锚点：GitHub slug 规则实算**（`tmp/wiki-links.js`）

把每页的全部标题按 GitHub 规则算成 slug（小写、去 HTML 标签、删非字母数字/空格/连字符/下划线、空格转连字符），再校验每个 `[text](path#anchor)` 的锚点在目标页存在。五卷实测：**链接 532 → 断链 0；锚点 219 → 失效 0**（三卷部分）。

> 全 docs 树（含 combat/map）由 Lead 独立复核：`links=1584 broken=7 anchors=827 anchorBad=0`——**7 处 broken 全是预存问题**（`docs/archive/2026-09-development-old-architecture.md` 里 `[specs/combat.md](specs/combat.md)` 这类相对路径写错，应在 `docs/archive/` 下写 `../specs/`），**在 `57be2ca` 提交时就已坏**，属 2026-09-23 归档遗留，按「归档只增不改」纪律**不修**。

### (5) 执行中发现的 3 个坑（避免后人重踩）

**① 沙箱 `docs/**` 有 `DeleteChild` 拒绝项 ⇒ 快照无法内联原文**

`write` 能**新建**文件，但同一次会话里对该文件的**二次写入 / 覆盖 / 删除全部 `EPERM`**（PowerShell `Set-Content` 直接 `Access to the path ... is denied`；`cmd del`、`.NET File.Delete`、`node fs.unlinkSync` 同样被拒）。

**后果**：快照文件**不能**先建后追加全文。改用**等价且更可靠**的留存方式：
- 「原文以 git 提交 **`57be2ca`** 为准」+ **还原命令**（`git show 57be2ca:docs/specs/<卷>.md`）+ **完整分节行号表** + **节→页映射表**。
- 五份快照（combat/map/cards/boss/editor）均采用此格式，全文可在 git 对象库里逐字取回。

**② GitHub slug **保留下划线** —— 探针第一版误报 24 处

第一版 slug 函数把 `_` 当 Markdown 粗体标记删掉（`.replace(/[`*_~]/g,'')`），导致 `#passive_keys-现行键集合` 这类锚点被误判失效——**连样板 combat 卷也误报 3 处**（`#sound_defs-schema`）。

**正确规则**：`_` 在 GitHub 锚点里**是保留字符**，只能删 Markdown 的 `` ` ``/`*`/`~` 与标点。

**③ 标题含反引号 / emoji 时，锚点行为需实算**

| 标题 | 实际 GitHub slug |
|---|---|
| ``### `t.aiState = 'chase'` 死状态已删`` | `taistate-chase-死状态已删`（反引号、引号、`=` 全删；空格转 `-`） |
| `### ⚠️ \`anchorRange = 0\` 的语义反转修正` | `-anchorrange-0-的语义反转修正`（**emoji 变成前导连字符**） |
| `## PASSIVE_KEYS 现行键集合` | `passive_keys-现行键集合`（下划线保留） |

**规则**：**不要手写锚点**——写完之后用脚本实算一遍再核对。本次 24 处误报里，有 8 处是真实的「我手写的锚点与实算不符」（如 `#passivekeys-…` 少了 `_`、`#aistate-…` 多了 `ai`）。

### (6) 各卷实测纠正初判的地方（体现「规范要能落地」）

拆分方案初判来自行数直觉，执行中**逐节核实后**多处修正：

| 卷 | 初判 → 实际 | 纠正内容 |
|---|---|---|
| **combat** | （样板卷，无初判） | **§13.9（岩石接触卡死）、§8.4（HE 击退）、§12.2（Boss 光束截断）都是现行机制，不该进 changelog**——初看像「批次修复记录」，实际是仍在生效的机制契约 |
| **map** | 14~18 页 → **13 页** | **§4 归 textures**（初判漏了：`§4` 讲贴图资产与烘焙层）；**§12.3~12.5 搬 roads**（初判把整个 §12 给 cover-system，但 12.3 路网 v3 / 12.4 沿路建筑 / 12.5 校准重锚都是路网主题）；**§28 并入 index**（主题归并视图是导航页，不宜单独成页）；**§5.4 进 changelog 的「未落地」区**（TODO checklist 不是规范） |
| **cards** | 8 → **11 页** | **§8（102 行 / 5 子节）拆两页**——`design-blocks.md`（设计裁定+基础数值+技能卡）与 `weapon-cards.md`（§8.3 机制卡 35 行）；另拆出 `overview-contract.md`（§1 构筑定位 + §2 数据契约）与 `upgrade-coverage.md`（§10 升级三通道，与抽卡规则无重合） |
| **boss** | 7 → **9 页** | **§5 独立成 `scaling.md`**——`RULES.boss.tuning` 是**全卷唯一数值口径**（10 键真值表），埋在行为页会让「查倍率」找不到家；另拆出 `runtime.md`（§3 运行期机制，非数据格式） |
| **editor** | 6 → **9 页** | **§7（88 行 / 7 子节）拆两页**——`devpanel.md`（面板体系）与 `browser-tests.md`（§7.5 浏览器四链，与面板无关）；另拆出 `designer.md` / `compare-schema.md` / `bake-modules.md`（几何编辑 vs 表格编辑 vs 模块概率分区，主题跨度大） |

**教训**：**「页数」不该由行数决定，而由「读者会不会单独来查它」+「是否含唯一口径表」+「主题跨度」三条决定**（已写入 `WIKI-STYLE.md` §7.5 ⑨）。

### (7) `docs/WIKI-STYLE.md` 的实战校准

§7.5「拆分判定的五条经验」在本批执行中扩为 **10 条**：

| # | 条目 | 来源卷 |
|---|---|---|
| ①~④ | 按子节判状态 / 按主题并页 / 一节可被两页引用但只有一页写正文 / 批次页按内容归属 | combat（样板） |
| ⑤ | 兼容索引页会变长是预期（6.3~6.6 行/标题标定） | combat + map |
| ⑥ | 父节拆两页时兼容索引摘要要**显式分叉**（给两个详见链接） | map |
| ⑦ | 一页混装多状态时 `适用版本` 写法（`现行（日期）；§N 部分为 设计预留（…）`） | map |
| ⑧ | 「批次章节」判定的三类边界（按子节判 / 归并视图不单独成页 / TODO 进 changelog） | map |
| **⑨（本次新增）** | **小卷页数下限由主题密度决定**（cards/boss/editor 8/7/6 → 11/9/9 的三条判据） | cards+boss+editor |
| **⑩（本次新增）** | **拆分前必须先做 token 基线**，否则「内容零丢失」无法自证 | cards+boss+editor |

> 另：`WIKI-STYLE.md` §3.1 的「第三态：设计预留」定义与 §4 的页面模板细节由 map 卷回写（样板卷 combat 当时只有「现行 / 已作废」两态）。

### (8) 验证记录（2026-10-21 实跑）

```
node scripts/check-html.js        → EXIT=0  All checks passed
node node_modules/typescript/bin/tsc --noEmit → EXIT=0
node scripts/validate-content.js  → EXIT=0  全部通过
node scripts/run-tests.js         → 48 通过 / 1 失败 / 共 49 项
                                    唯一失败 scripts/test-cover-gen.js = 沙箱 spawnSync EPERM（放宽权限后 EXIT=0）
五卷编号机器比对                   → LOST=[] / EXTRA=[] / ORDER_SAME=true（243 个标题）
标识符级比对                       → cards 509/169、boss 342/135、editor 379/106，缺失均 0
全 docs 树链接（Lead 独立复核）    → links=1584 broken=7 anchors=827 anchorBad=0
                                    7 处 broken 全为 docs/archive/ 预存问题（57be2ca 即坏），按「归档只增不改」不修
模板合规（59 页）                  → 四行头部 + 末尾「相关页面」全部满足，0 违规
```

> **注**：本次为纯文档重构，不涉及 `js/` 运行时改动，故 `npm test` 的 48/1 与 wiki 化**无因果关系**（那 1 项是沙箱 EPERM）；列为验证记录是为了说明「文档改动没有碰坏测试链」。

## §4.115 2026-10-21 wiki 规则入纪律：AGENTS.md §2.3 + 六张角色卡重写 + scripts/wiki-check.js

**结论**：把 §4.114 的 wiki 化从「**一次性重构**」变成「**可持续遵守的纪律**」。三件套：① `AGENTS.md` 新增 **§2.3「改 specs 的三步」**（含三类改动分流表）；② **六张角色卡 + `doc-workflow` + `rogue-tank-roles`** 全部改指主题页；③ 新增可执行检查 `scripts/wiki-check.js`（`npm run wiki:check`），**让纪律从纸面变成能跑的链**。

**归口**：本节即结论唯一归口（**文档工作流**改动，不涉及运行时行为，不产生 specs 条款）。执行入口：`AGENTS.md` §2.3 与 `docs/WIKI-STYLE.md`。

### (1) 用户诉求

**用户原话（2026-10-21）**：「**更新有关 agent 描述和工作纪律，确保文档更新时会按 wiki 文档规则更新文档**」。

即：wiki 化只在 §4.114 做了一次，**若不改纪律，下一次文档更新就会把 wiki 结构破坏掉**。用户要求的是**防退化**，不是再做一次重构。

### (2) 问题：所有纪律文本仍指向「兼容索引页」

wiki 化（§4.114）后，`docs/specs/<卷>.md` 已从「正文」变成「**§N 兼容索引页**（只放 1~3 行摘要 + 详见链接）」。但改之前的纪律文本仍写着：

> 「系统**现行细则**只写在 `docs/specs/<system>.md`」（`AGENTS.md` §2.1）
> 「同步：先写结论——① `docs/specs/<system>.md` 写现行细则」（`AGENTS.md` §2.2 Step 1）

**照这条做会怎样**：agent 把正文写回 `<卷>.md`（兼容页）⇒ 兼容页越来越长 ⇒ **几轮之后 wiki 化退化成原来的单卷长文**，且主题页与兼容页出现**两份正文**（数值双家、必然冲突）。这是「**纪律滞后于结构**」的典型失效模式——结构改了、纪律没改，纪律就成了破坏结构的指令。

**同类滞后共 6 处**：`AGENTS.md` §2 表格（1 行要拆 2 行）、§2.1 权威归口、§2.2 Step 1、§3.1 验证链（缺第 5 条）、§3.6 写域规则（未说明「一整个卷」）、§5 查现行口径指针。

### (3) 三件套解法

**① `AGENTS.md` 新增 §2.3「改 specs 的三步（wiki 规则，任何写入 specs 的改动都必须走）」**

核心是**三类改动分流表**——让 agent 不用每次重新判断「这次该动哪里」：

| 改动性质 | 动哪里 | 不动什么 |
|---|---|---|
| **改现有机制的数值/行为**（最常见） | ① 改主题页的「唯一口径」处 ② 更新 `<卷>.md` 兼容页该节**摘要**（若摘要提到了这个数值） | **不动编号**、不动其它页 |
| **新增一个机制/主题** | ① 新建 `<卷>/<kebab-topic>.md`（四行头部模板）② `<卷>/index.md` 主题列表加一行 ③ `<卷>.md` 兼容页**用新编号**（如 §29）追加「摘要 + 详见」 | 不动已有编号 |
| **彻底废弃一个机制** | ① 正文迁到 `<卷>/changelog.md` ② 兼容页该节摘要改「已作废（日期），见 changelog」 ③ 整页作废则 `index.md` 标注 | **不删编号**（外部引用仍要能解析） |

配套：**三步执行**（改正文 → 对齐兼容页摘要 → 跑 `wiki-check`）、**新增页面四条硬性要求**（四行头部 / `## 相关页面` / `## 目录` 仅 ≥3 h2 / 英文 kebab-case）、**五条禁止事项**（WIKI-STYLE §10 反例）、**修改后自检清单 3 条**。

**② 六张角色卡全部改指主题页**

| 卡片 | 改动 |
|---|---|
| `role-combat` / `role-mapgen` / `role-systems` / `role-content` / `role-render-fx` | 「系统归口」从 `docs/specs/<卷>.md §N` 改为**具体主题页文件名**；统一加「**改 specs 前必读**：`docs/WIKI-STYLE.md` + `AGENTS.md` §2.3」 |
| `role-verify-docs` | 写域加入 `scripts/wiki-check.js` + specs wiki 目录；4 步生命周期 Step 1 改为「写主题页 + 对齐兼容页 + 跑 wiki-check」；§6 硬约束加两条（改 docs 必跑 wiki-check、`docs/**` 二次写入 EPERM 沙箱陷阱） |
| `doc-workflow` | 开篇加 wiki 化警告块；Step 1 改为写**主题页**并补三步；注意事项新增第 6 条「specs 编号是外部契约」 |
| `rogue-tank-roles` | 单写者表把 `docs/specs/*.md` 改为「**一整个卷 = 不可分割写单元**」；验证归口加入第 5 条链 |

**③ `scripts/wiki-check.js` —— 让纪律可执行**

**核心判断**：**纸面规则会被跳过，能跑的检查不会。** 所以纪律里最关键的一条（「改 specs 必须保持链接有效、结构合规」）必须有对应的**可执行脚本**，否则等于没有。

- 已加 npm script：**`npm run wiki:check`**。
- 检查四类：
  1. **全 docs 树断链** —— `[text](path)` 目标文件是否存在；
  2. **锚点有效性** —— `page.md#anchor`，按 **GitHub slug 规则实算**（§4.114(5) 已记录 slug 的坑）；
  3. **`<卷>.md` 兼容页结构** —— 是否有警告块、每节是否有「详见」；
  4. **`<卷>/*.md` 模板** —— 四行头部 + 末尾 `## 相关页面`。
- **两个豁免**：
  - `docs/WIKI-STYLE.md` —— 全文都是「格式示例」，其中的链接目标**本就不必存在**（该文件 §3.1 已明确声明「链接检查脚本应跳过本文件」）；
  - `docs/archive/**` —— **归档只增不改**，坏链**单独统计、不计入失败**（当前 7 处，均为 `2026-09-development-old-architecture.md` 的相对路径写错，`57be2ca` 提交时即已坏）。

### (4) 反向测试：这条链本身经过了验证

**不能只验证「合法输入通过」**——那和「永远返回 0 的假绿脚本」无法区分（同 §4.112 的假绿教训）。因此对 `wiki-check.js` 做了**反向测试**：故意造 4 类错误，看它是否分别报出并 exit=1：

| 造的错误 | 期望报错 | 实际 |
|---|---|---|
| 改一处链接指向不存在的文件 | `BROKEN` | ✅ 报出，exit=1 |
| 改一处锚点为不存在的小节 | `ANCHOR` | ✅ 报出，exit=1 |
| 删掉某页的 `**适用版本**` 行 | `NO-VERSION` | ✅ 报出，exit=1 |
| 删掉某页的 `## 相关页面` | `NO-RELATED` | ✅ 报出，exit=1 |

清理后恢复 `broken=0 anchorBad=0 struct=0 template=0`。

> **这条比脚本本身更重要**：一个检查脚本的价值不在于「它能通过」，而在于「**它能否失败**」。造错→报错→清理→归零，才证明它真的在检查。

### (5) 验证记录（2026-10-21 实跑）

```
node scripts/wiki-check.js        → EXIT=0
                                    files=85 pages=59 links=1584 broken=0
                                    anchors=827 anchorBad=0 struct=0 template=0
                                    (archive, ignored: 7)
node scripts/check-html.js        → EXIT=0  All checks passed
node node_modules/typescript/bin/tsc --noEmit → EXIT=0
npm run wiki:check                → 已注册（package.json）
```

> **沿革注记（2026-10-21，`68433ac`）**：上条 `(archive, ignored: 7)` 是**本批当时的真实输出**（保留作历史记录）。同日后续提交按用户裁定**修复了那 7 处预存断链并取消 archive 豁免**，现行 `wiki-check.js` 全 docs 树一次校验、断链必须为 0、不再打印该后缀。**「归档只增不改」仍适用于正文内容**，但链接可达性改按基础设施对待（见 §4.116 的验证记录更新段）。

> 其中 `archive ignored: 7` 为 §4.114(4) 记录的**预存断链**（`docs/archive/2026-09-development-old-architecture.md` 的相对路径写错），按「归档只增不改」不修、单独统计。

### (6) 留给后续的判断

**① 「纪律」必须同时改三处才算落地**：① **流程文本**（AGENTS.md，改法说明）② **角色卡**（who：每个角色知道自己的归口在哪一页）③ **可执行检查**（脚本，能否失败）。只改 ① 会退化成「文档写了但没人看」；只改 ①③ 而漏 ② 会让各角色继续按旧路径写。

**② 结构变更的「滞后清单」要显式清点**：本次是 grep 出所有写有 `docs/specs/<system>.md` 的纪律文本（`AGENTS.md` 6 处 + 6 张角色卡 + `doc-workflow` + `rogue-tank-roles`）逐条改。**只改最显眼的那一条（§2.1）会漏掉 §2.2 Step 1 这类「执行路径」条款**——那才是最常被照做的。

**③ 豁免必须写进脚本、不能靠人记得**：`WIKI-STYLE.md` 的格式示例与 `archive/` 的只增不改，都以**代码里的白名单**实现，而不是靠执行者「想起来就跳过」。否则每次跑都会报一堆噪音，最后所有人都学会「忽略这个脚本的输出」——那比没有脚本更糟。

---

## §4.116 2026-10-21 项目文件整理：`tank_mvp.html` → `tank_battle.html`（命名收口 + 全仓 mvp 字样清零）

**结论**：正式游戏页文件名由 **`tank_mvp.html` 改名为 `tank_battle.html`**（用户 2026-10-21「再整理本项目文件，mvp 还没改名」），并把全仓残留的 **`mvp` / `MVP` 字样一并清零**。**这不是纯改名**——`mvp` 既是历史阶段名（minimum viable product）又是页面代称，二者已混淆多年，故口径为「**文件名 + 代称 + 具名标识符三层同改**」。

**归口**：本节即结论唯一归口（**命名/文档整理**，不涉及运行时行为，不产生 specs 条款）。页面清单口径见 `AGENTS.md` §1 与 `README.md`；`docs/specs/<卷>/` 各主题页内的页面引用随本批同步。

### (1) 改动范围（三层）

| 层 | 内容 | 处数 |
|---|---|---|
| **文件名** | `tank_mvp.html` → `tank_battle.html`（git 检出层面即 `D tank_mvp.html` + `?? tank_battle.html`，交由用户提交时确认 rename 识别） | 1 |
| **页面引用** | 全部 `tank_mvp.html` / `tank_mvp?mode=` / `tank_mvp.spawnBossSummonWave` 等 | 147 |
| **独立 mvp/MVP 字样** | 指代正式游戏页的散文与注释（`mvp 主循环` / `mvp/bench 两页同源` / `MVP 左下角` …） | 213 |
| **具名标识符** | `mvpLogPanel` → `battleLogPanel`、`mvpPage` → `battlePage`、`mvpErrors` → `battleErrors`、`mvpBoot` → `battleBoot`、`mvp_battle_smoke.png` → `battle_smoke.png` | 5 组 |

**合计扫描 428 个文本文件、改写 84 个、替换 360 处**。

### (2) 关键入口链路（逐点确认）

| 位置 | 改动 |
|---|---|
| `server.js` | 启动清单改列 `tank_battle.html`；首行注释的 `fetch` 说明同步 |
| `scripts/check-html.js` | 五页冒烟清单 `index/tank_battle/tank_bench/tank_designer/tank_compare` |
| `index.html` | 三张卡片入口（标准 / `?mode=boss` / `?mode=survival`）全部指向新文件名 |
| `tank_compare.html` | 顶部导航「主原型」链接 |
| `scripts/test-browser-{smoke,r3,run,r4}.cjs` | 四条浏览器链的 `page.goto` 目标与断言文案 |
| `.dsh/skills/**`（6 处） | `rogue-tank-roles` 单写者表 + `role-combat`/`shared-module-dev` 的 description + `role-combat` 战斗循环行 + `role-content` + `role-render-fx` + `sandbox-verify`（UTF-8 乱码案例）——**§3.6 的写域唯一权威，漏改会让调度方按旧文件名派发** |

### (3) 边界纪律：哪些**不改**

| 范围 | 理由 |
|---|---|
| `docs/archive/**` 正文 | **归档只增不改**（AGENTS.md §2.1）。其中约 **250 处** `tank_mvp.html` / `mvp` 为历史 `file:line` 证据与批次日志原文——改写会让「2026-09-19 修复了 `tank_mvp.html:443`」这类追溯失真。**现行文档引用已全部更新，读者从归档回到现行口径时不会撞错**（归档不参与现行判定，AGENTS.md §2.2 约定）。 |
| `docs/ARCHIVE.md` 索引表 | 索引行是「完结条目」的可读摘要，**非证据链**，故随本批同步：① 既有 3 处行内引用（2026-08-10 / 2026-08-23 / 2026-08-28 行）② 表尾新增本批索引行（按 §4.113~§4.115「非条目归档、属结构性/工具变更」的同一先例标注）。 |
| `.agent-teams/**`、`tmp/**` | 分别是 agent 运行态与未跟踪的 specs 拆分前快照，均非项目交付面。 |
| `assets/**` 二进制贴图 | 二进制不参与文本替换（`hummel_hull.png` 内有 `mvp` 字节串，无关）。 |
| `.dsh/skills/**` | **初轮曾整目录排除**（pwsh 写入被拒），后经 `edit` 工具补齐 6 处——`rogue-tank-roles` 单写者表、`role-combat`（description + 战斗循环行）、`role-content`、`role-render-fx`、`shared-module-dev`、`sandbox-verify`。**这些是 §3.6 规定的写域唯一权威，漏改会让调度方按旧文件名派发**。 |

### (4) 沙箱陷阱（本次实测，已回写角色卡）

`docs/**` 与 `js/**` 的**进程级写入被沙箱拒**（`EPERM: operation not permitted`），但**文件 ACL 与可写文件完全相同**（`AOC\CodexSandboxUsers: Modify`）⇒ 是 DSH 沙箱层而非 NTFS 权限。两条可用路径：

1. **`edit` 工具**——对 `js/`、`docs/` 的子目录**可用**（本批前 60 余处即经此完成）；
2. **`pwsh` + `sandbox_permissions`**——`Set-Content` / `node fs.writeFileSync` 在 workspace-write 下被拒，需**一次性提权**才能跑批量脚本。

> 若误判为「ACL 坏了」去修权限，会白跑一轮；直接判断为**预期内沙箱边界**（同 `sandbox-verify` 记录的 `spawn EPERM` 家族）。该教训已补入 `role-verify-docs` §6 硬约束。

### (5) 验证记录（2026-10-21 实跑）

```
npm run check            → EXIT=0（含 check-html 五页 + tsc --noEmit）
npm test                 → 48 通过 / 1 失败（见下）
node scripts/wiki-check.js → EXIT=0
                            files=85 pages=59 links=1584 broken=0
                            anchors=827 anchorBad=0 struct=0 template=0
```

> **验证记录更新（2026-10-21，`68433ac` 之后复跑）**：上条验证记录里的 `(archive, ignored: 7)` 已**不再是现行输出**——同日 `68433ac` 按用户裁定修复了归档分卷 7 处预存断链，并**取消了 `wiki-check.js` 的 archive 豁免**，现在全 docs 树断链一次归零、脚本也不再打印该后缀。归档正文仍遵守「只增不改」，但**链接可达性按基础设施对待**。本批复跑结果如上（`broken=0 anchorBad=0`，无 archive 后缀）。

**唯一失败项 `scripts/test-cover-gen.js` 与本批无关**（复现确认）：该测试第 4 段要 `spawnSync(node, tools/gen-covers.mjs)` 生成 mock 夹具，沙箱下 `spawnSync D:\Nodejs\node.exe EPERM` ⇒ 夹具 `tree.png` 从未生成 ⇒ 第 179 行 `fs.renameSync` 抛 `ENOENT`。该脚本**零处引用** `tank_mvp`/`tank_battle`，属 §3.7 表格已记录的沙箱边界，**不是改名回归**。

### (6) 反向确认（防止「改了却没改全」）

- `git grep -i mvp` 在 **`docs/archive/**` 之外零命中**；
- `tank_mvp.html` 文件不存在、`tank_battle.html` 存在（`Test-Path` 双确认）；
- `battleLogPanel` 三处（声明 + 赋值 + `log` 回退）一致，无残留旧名；
- `npm run check` 的页面清单已打印 `✓ tank_battle.html#inline0`（证明 `check-html.js` 认到了新文件）。

### (7) 留给后续的判断

**① `mvp` 这个词在项目里已彻底退役**：后续新增内容（注释/文案/卡面/日志）不得再用 `mvp` 指代正式游戏页，统一用 **正式游戏页** 或 **battle**；`AGENTS.md` §1 的页面描述已随之更新。

**② `git mv` 未能生效（`.git/index.lock` 权限被拒）**，当前工作区是 `D tank_mvp.html` + `?? tank_battle.html`。提交时若 git 未自动识别为 rename，建议显式 `git mv -f` 或 `git add -A` 后核对 `git status`，避免历史里出现「删一个 + 加一个」而丢失 6428 行的 rename 关联。

## §4.117 浏览器链 r3 陈旧断言修复（2026-10-21）

> 来源：用户实跑 `npm run test:browser`，smoke 链 **ALL PASS**，但 `test-browser-r3.cjs` 在
> 「测试台具备 R-1/R-2/R-3 面板控制按钮」处 **FAIL**，随后 `page.evaluate` 抛
> `TypeError: Cannot read properties of null (reading 'click')` 中断整条链。

### 根因：测试断言与 2026-10-19 #7 / 2026-10-20 #W9 的用户裁定脱节（非代码回归）

`test-browser-r3.cjs` 断言 bench 页存在 5 个按钮，但这些按钮**早已被用户裁定删除**：

| 按钮 | 删除依据 | 现状 |
|---|---|---|
| `skillFireCtrlBtn` / `skillSpeedBtn` | 2026-10-20 #W9（`super_fire_control` / `super_speed` 两键无任何卡牌可授予、正式游戏不可达，整体摘除） | 元素不存在 |
| `spawnTurretBtn` / `spawnMineBtn` / `spawnCoverBtn` | 2026-10-19 #7（用户：「删除功能测试扩展 Panel Test (R-1/R-2/R-3)」——该区块被共享 devPanel 完全覆盖，属重复入口） | 元素不存在 |

`tank_bench.html:232-235` 与该文件 `:721-723` 均有明确注释记录删除依据。断言的**能力校验意图仍然成立**，
只是入口从「DOM 按钮」迁到了「window API」：`benchSpawnTurret` / `benchSpawnMine` / `benchSpawnCover`
仍在并挂 `window`（`tank_bench.html:864-866`，掩体超限拒绝逻辑在 `:851-863`）。

### 第二处陈旧断言（同一次链跑会连带失效）

`:174` / `:192` 用 `c.style.fontWeight === '700'` 判定弹种条的**激活格**——那是 bench 旧内联实现的写法。
#3（2026-10-20）把弹种条收敛到共享 `js/tank_hud.js` 的 `renderAmmoIndicator(H)` 后，**不再输出内联
`fontWeight`**，激活态改由 `.ammo-cell.active` 类表达 ⇒ `cells.find(...)` 恒返回 `undefined`，
连带「Q 键环形切换」与「方向提示与键位同向」两条断言一起失效。

### 修复（`scripts/test-browser-r3.cjs`）

1. **面板按钮段**改为验证**现行口径**：`window.benchSpawnTurret/Mine/Cover` 均为函数，并**反向断言**
   5 个旧按钮**不存在**（防重复入口回潮）。
2. **部署物生成 / #F6 掩体超限**两条改为直接调 `window.benchSpawn*`（行为断言不变：+3 注册、
   `count1===2 && count2===2 && after===before+1`）。
3. **激活格判定** `style.fontWeight === '700'` → `classList.contains('active')`（Q 键切换、方向提示两条）。

> **修复后仍无法在沙箱内实跑**：本次 `node scripts/test-browser-r3.cjs` 在 `startServer` 处直接
> `spawn EPERM`（`r3.cjs:46`）——§3.7 已记录的沙箱边界。故本轮只做**静态核对**（见下），
> 浏览器链需在正常环境复跑。

### 静态核对（沙箱内可做的等价验证；结果已由下方四链实跑确认）

| 断言依赖 | 核对结果 |
|---|---|
| `tank_hud.js` 已加载 | `tank_bench.html:318` `<script src="js/tank_hud.js">` ✓ |
| `getAmmoKeys` 存在（`renderAmmoIndicator` 的 `list` 注入） | `tank_bench.html:500` ✓ |
| 共享实现输出 `.ammo-cell` / `.active` | `js/tank_hud.js:134` ✓；bench CSS 已补齐（`:129-136`，§4.111） |
| `window.benchSpawn*` 三入口 | `tank_bench.html:864-866` ✓ |
| 掩体超限拒绝 | `tank_bench.html:855-859`（`count >= cap` → 提示并 return，不生成）✓ |
| 5 个旧按钮确不存在 | `grep` 全文零命中（仅本测试文件的注释/反向断言提及）✓ |

### 验证

- `node scripts/check-html.js` → **EXIT=0**
- `node --check scripts/test-browser-r3.cjs` → **EXIT=0**
- `npm test` → **48 通过 / 1 失败（49 项）**，唯一失败 `test-cover-gen.js` 为既有沙箱 EPERM（同 §3.7）
- `node scripts/test-browser-r3.cjs` → 沙箱内 **spawn EPERM（exit 2）**（拦截点在 `startServer`，`r3.cjs:46`）；**2026-10-21 正常环境实跑四链 ALL PASS**（见下）

**四链实跑结果（2026-10-21，正常环境）**：

| 链 | 结果 | 关键断言 |
|---|---|---|
| `test-browser-smoke.cjs` | **ALL PASS** | Home→Loadout→Shop→battle 主链路、HUD/面板、弹种 Q/E、飘字、#23 敌人开火 |
| `test-browser-r3.cjs` | **ALL PASS** | 原 FAIL 三条已转绿：`{"spawnTurret":true,"spawnMine":true,"spawnCover":true,"noLegacyBtns":true}` / `count: 0 -> 3` / `{"before":3,"after":4,"count1":2,"count2":2}`；弹种条 `blast_he -> proximity_he (total=14)`、`{"nextHint":"E","prevHint":"Q"}` |
| `test-browser-run.cjs` | **ALL PASS** | run 链路、弹种链逐级演变、devPanel 四 Tab、卡牌搜索/回滚 |
| `test-browser-r4.cjs` | **ALL PASS** | 主武器四型实战、F 副武器五型（含 mine_layer 边沿/雷场）、技能池 artillery/shield/overdrive/aps、商店购买结算 |

> **反证意义**：r3 的两处修复正是本次唯一改动，四链全绿证明「删除旧按钮 → window API」与
> 「`fontWeight` → `.active`」两条改写未削弱任何既有覆盖（r3 其余 20+ 条断言仍全部在跑且通过）。

### 教训

本次两条失效断言**都不是本轮改动引入的回归**，而是「被测对象按用户裁定改变后测试未同步」——
`check-html.js` 只做语法冒烟，Node 链覆盖不到 DOM/浏览器行为，所以它们可以长期静默存在。
**约定**：删除 DOM 元素或改渲染契约（类名/结构）时，必须同批 `grep` 全部 `scripts/test-browser-*.cjs`
确认无引用；测试里对**玩家可见 DOM 契约**的断言应优先断言语义类（`.active`）而非样式值（`fontWeight`）。

---

## §4.118 2026-10-21 r4 A3「假失败」误判纠正：一次基于错误证据的改动被完整回退

**结论**：本节记录的是一次**误判**——曾判定 `test-browser-r4.cjs` 的 A3（autocannon 按住连发）为「依赖未固定外部数据的假失败」，并据此做了「钉住装填基准」的改动。**该改动在真实浏览器链上制造了 5 项新失败，已完整回退**。基线（未改动）实测 **ALL PASS**，A3 输出 `shots=2`，与设计意图一致。

> **本节的价值在于记录失效模式，不是记录一个修复**。同类误判若不留下证据，下一个人会再次踩进去。

### (1) 错误的推理链（复盘）

| 步骤 | 当时认为 | 实际 |
|---|---|---|
| 选车 | `tankIds[0]` 经 `api/tanks` 排序 ⇒ `dummy.json`（reload 2.0） | **`Leapard_1`（reload 1.5）** |
| 装填 | 2.0 × 0.25 = 0.5s/发 ⇒ 400ms 只够 1 发 | 1.5 × 0.25 = **0.375s/发 ⇒ 400ms 出 2 发** |
| 断言 | 判据过时，须改为钉住基准 + 精确推导 | 判据本就正确，`>=2` 合理 |

**错在哪里**：用 PowerShell `Get-ChildItem | Sort-Object Name` 判断排序，得到 `dummy` 在前；而 `server.js` 的 `readAllFromDir` 用 `fs.readdirSync(dir).filter(...).sort()`——**JS 默认 sort 是 UTF-16 码元序，与 PowerShell 的排序规则不同**（`Leapard_1` 大写 L 排在 `dummy` 小写 d 之前）。一个**取证工具本身的口径差异**，被当成了被测对象的缺陷。

> **教训**：判定「测试期望值与实现不符」时，**必须用被测系统自己的数据源复核**（此处应 Node 读 `fs.readdirSync().sort()`，或直接在页面里读 `tankIds`），不能用另一个语言/工具的同名 API 的结果去推断。

### (2) 错误改动的实际后果（真实浏览器链实测）

改动内容：`fireReady()` 里 `p.stats.reload = 1.0`（并清 `heatLockT/heatPct`），A3 判据改为 `floor(HOLD/250)+1 = 4`。

```
FAIL | A3 autocannon：按住 900ms 连发 4 发 | shots=3 expect=4 heatPct=11.625
FAIL | B4 mine_layer：两次 F 预约 → 4s 后端雷场生成 | pending=1 → 1 生成 0 枚 存活 0→0
FAIL | B4b 地雷触爆对敌人造成伤害 | before=n/a after=1000000.0 alive=true
FAIL | C1 artillery：技能池数字键呼叫 | strikes 0→3 hp 1000000.0→1000000.0
FAIL | #H2 布雷确认后进入装填冷却 | {"pending":1,"reloadT":0}
```

**连带失效机理**：`stats.reload` 是共享字段，钉它虽只直接影响主炮，但 A3 的 HOLD 从 400→900ms 拉长了整段执行时间，后续段落（B4 的 4.8s 预约窗口、B4b 的 1.4s 触发窗口）时序被挤压；B4 生成 0 枚后，B4b 找不到地雷（`mineHit=null`）、C1 的落弹窗口也被拖过。**一处「看似安全」的夹具改动，通过时间预算连锁破坏了后面 4 条断言。**

> **教训**：浏览器链是**共享时序预算**的长流程，任何拉长某段等待的改动都要重算后续窗口余量；`browser 链全绿` 是唯一有效验收，Node 侧推演不能替代。

### (3) 最终处置

- **代码**：`scripts/test-browser-r4.cjs` 已 `git checkout` 回退，与 HEAD 逐字节一致（`git diff HEAD --` 为空）。
- **文档**：本条由原文的「根治方案」改写为「误判纠正」，§4.117 的 r3 修复**不受影响**（那两条断言确为真陈旧，且实测转绿）。
- **基线复测**：`npm run test:browser` 连跑 **2 次均 EXIT=0 / ALL PASS**（r4 `A3 shots=2 heatPct=11.125`）。

### (4) 观察到的真实偶发性（另行记录，未修）

回退后的个别轮次曾出现**不同**的单项失败，均为**位置/时序抖动**，与改动无关（代码与 HEAD 完全一致时亦会偶发）：

| 断言 | 现象 | 脆弱点 |
|---|---|---|
| `test-browser-smoke.cjs` (d)「开火命中弹携带所选槽位 ammoKey」 | `fired=null` | 依赖炮弹**实际命中**才写 `__shellHits`；打偏即 null |
| `test-browser-r4.cjs` B4b「地雷触爆对敌人造成伤害」 | `before=999978.0 after=999978.0` | 把首个敌人坐标搬到雷上，但该敌人可能被 AI/掩体推开离开触发半径 |

**建议**：若要提升稳定性，方向是「让断言不依赖单次物理结果」——(d) 可改为读 `shells[]` 里最后发射的 `ammoKey`（发射即记录，不要求命中）；B4b 可在 1.4s 内**多次**把敌人钉回雷坐标并按「累计掉血」判定。**本轮未实施**（超出用户「根治 A3」的范围，且需单独验证）。

### (5) 验证记录（2026-10-22）

```
git diff HEAD -- scripts/test-browser-r4.cjs   → 空（已完整回退）
npm run test:browser（基线，连跑 2 次）        → EXIT=0 / ALL PASS
  r4: A3 shots=2 heatPct=11.125；B4 pending=1→0 生成 3 枚；B4b 999789.6→999693.4；
      C1 strikes 0→3 hp 999916.6→999779.7；#H2 reloadT=14.83
```

### (6) 留给后续的判断

**① 「测试期望 vs 实现不符」的取证纪律**：先确认**被测系统自己的数据源**（此处 `fs.readdirSync().sort()` 的 JS 语义），再下结论。用旁路工具（PowerShell/Excel/手工排序）推断，得到的可能只是**工具差异**。

**② Node 侧推演不能替代浏览器验收**：本次在 Node 里跑通了「钉住 1.0 ⇒ 900ms 出 4 发」，逻辑自洽，但真实页面里因时序预算连锁而红。**Node 能证明机制，不能证明流程。**

**③ 回退也是一种交付**：确认改动错误后应立即完整回退并留下复盘，而不是在其上继续打补丁——本次若继续调 HOLD 或加 `waitFor`，只会把 5 项失败掩盖成偶发。

### 4.119 2026-10-22 第五批：15 项玩法改造 + 4 项核实修复（雷场/机炮/火炮/地图/掩体/AI/设计器）

**用户需求**（原文 20 条，用户清单无第 8 项）：①雷场改带状+HE伤害+最薄装甲+槽位升级；②机炮贴图/过热锁后冷却/穿深 80%+三张升级卡；③商店后期降价+高等级击杀加分；④双管换管固定 0.8s+交替装填改语义；⑤弹夹短装填+爆发射击；⑥标准主炮砰砰炮；⑦设计器重构+图鉴独立页；⑨bench 卡牌分类同源；⑩Boss 战沿用标准节点生成器；⑪生存 3×3+四角补给；⑫设计器支持双管/曲射/固定战斗室；⑬Boss 电磁炮炮线+预警；⑭敌方弹种不放大穿深伤害；⑮AP/HE/HEAT 三系列特效；⑯曲射精度 2σ×距离。核实修复：①设计器顶点选不中+网格吸附无效；②Boss 简介失效；③河路交叉 75°；④common 少于 rare。追加两条：AI 强制接战（噪声累积/友军被命中/Boss·生存全敌）、栅栏沙包→直线掩体（部位裁剪+6 贴图+可摧毁）。

**落地结论**（细则全部归口 specs，本处只留结论与索引）：

| 主题 | 结论 | specs 归口 |
|---|---|---|
| 雷场带状 | mineFieldLength 220 / BandWidth 56 / Count 6、方向 ⊥ 鼠标—玩家、中心定格；伤害 = HE 单发 × mineFieldHeRatio；最薄装甲走 resolveHit(forceEffThickness)；**地雷总数上限三键删除**、改雷场槽位 1→3；AI applyHazardAvoidance 避雷 | combat/deployables.md |
| 机炮 | penMult 0.80、**锁定期间不降温**、射程 900→1200、过热锁 2.0→1.0、穿深 80→90% | combat/weapons-reload.md §机炮 |
| 双管 | 换管时间**恒 0.8s**（RULES.weapons.doubleBarrelSwitchSeconds）；删「同步击发装置」卡；交替装填只留 altReload、降 epic | combat/weapons-reload.md §双联火炮 |
| 弹夹 / 砰砰炮 | 短装填 0.7→0.5（−0.1×2）；空格爆发 0.5s 连射；标准炮 0.8s 追发 0.6× | combat/weapons-reload.md |
| 曲射精度 | spreadFactor 1.2 → 2.0（= 2 × 直射 σ × 距离） | combat/arc-fire.md |
| 敌方弹种 | 弹种仍升档，但 ammoStatNeutral ⇒ 穿深/伤害**不吃弹种比例**，只走 entityMults | combat/enemy-scaling.md |
| 三系列特效 | AP/HE/HEAT → 三种弹体 + 三种命中特效（impact_ap/impact_heat/impact_he）；HE 别名零回归 | combat/ammo-system.md · combat/fx-visual.md |
| 商店 / 击杀分 | 后期折扣 0.92^(lv−5)（Lv10 −34%、Lv15 −57%）；killScore(level) = 20×(1+0.25×(lv−1))（Lv13 = 80） | **新建** combat/shop-economy.md |
| AI 强制接战 | 噪声累积 3 发 / 5 落弹 → 交战；友军被命中 2 次（700px）→ 交战；Boss/生存 forceEngageAll + 0.35s 首帧开火间隔 | combat/enemy-ai.md |
| 直线掩体 | 删 soft/barricade；新增 wall（不可摧毁）/wall_breakable（4 发后**直接消失**）；shellBlock:'wall' 按射手/目标到墙距离裁部位（更远→全打、更近→只打炮塔、贴墙 22px→全打）；6 套贴图 | map/cover-system.md |
| Boss 战地图 | 去掉 stripForBoss，走标准 Boss 节点方形竞技场生成器（同 seed 同尺寸/同 template） | map/strip-defense.md（沿用） |
| 生存模式 | **3×3 屏**（chunkCount:1 + chunkRows:1，只改 screensX 仍会得 6 屏）；补给 **4 个四角各 1**，含 **BFS 可达性**判定 | map/survival-strip.md |
| 河路 75° | strip 路径新增 enforceRiverRoadCrossAngle（拉直→平移→弃河）；方形节点 placeEdgeRiver 不变 | map/rivers.md |
| Boss 简报 | **补实现** bossBriefing/bossBriefingLines（此前从未入库 ⇒ 面板自上线起就没弹过） | boss/behavior.md |
| Boss 电磁炮 | 蓄能 1.2s → railCharge/railReady 事件 → 白色炮线 + 3 条电弧 + 屏幕预警；!railChargeHold 开火门控（**仅 Boss**） | **新建** boss/railgun.md |
| 设计器 | 三 Tab + 车体/炮塔子目标；预览瞄准仅外观、撤销/清空/重置/吸附仅装甲模型；**删掩体编辑**；车长塔 scale；新增双管/曲射/固定战斗室；UI 五项优化 | editor/designer.md |
| 图鉴 | **新建** tank_codex.html（/api/tanks + /api/bosses + enemyPreviewStats），bench 内嵌图鉴删除 | **新建** editor/codex.md |
| bench 卡牌分类 | DEV_CARD_GROUPS 提纯 + devCardGroupKey/groupCardsByEffect 导出，bench 与 devPanel 逐组数量一致 | editor/devpanel.md |
| 卡池 | 新增 10 张、删 1 张、改造 1 张；6 处既有卡摘键收口；**稀有度 205 张 = 97/65/33/9/1**（common 首次显著多于 rare） | cards/weapon-cards.md · cards/rarity-tools.md · cards/effect-types.md |

**修掉的 8 个已核实缺陷（ISSUES #Z1~#Z8，均已删除并归档）**：#Z1 设计器顶点选不中/吸附无效（setMode 把 Tab 名写进画布 mode + 按钮零绑定）；#Z2 Boss 简报 bossBriefing 从未入库；#Z3 strip 河路无 75° 护栏；#Z4 卡池 common(59) < rare(77)；#Z5 雷场伤害/半径硬编码、mineDamage 键不存在、两张卡对雷场无效；#Z6 机炮每发热量 10/12/12 三方不一致；#Z7 听声永不升级到交战 + 连射反而攒不满；#Z8 栅栏/沙包与直线掩体需求冲突、无部位裁剪。

**顺带修掉的 5 个真缺陷**（均在本批写域内）：① battle 页 resolveHit 包装器**吞第 5 参** ⇒ 榴弹炮「最薄装甲」在正式游戏里完全失效（Node 单测走裸函数测不出）；② splashCoversAt 边遍历边 splice ⇒ 半径内 3 个可摧毁掩体只炸 1 个；③ 单发布雷仍调 enforceDeployLimits('mine') 与「不设上限」冲突；④ resetCovers 无法还原被物理移除的可摧毁掩体（_initialCovers 按原索引 splice 回）；⑤ bench 的 getCardPool 传对象给期望数组的 devPanel（恒显「卡池为空」）+ liveData 读 worldW 未定义。

**验证记录（2026-10-22）**：

```
node scripts/check-html.js      → EXIT=0，All checks passed（页面白名单已加 tank_codex.html）
npx tsc --noEmit                → EXIT=0（新增 test-batch5-combat.js 已修 8 处类型错）
npm test                        → 50 通过 / 0 失败（187.5s；新增 test-batch5-combat.js 83 断言）
npm run test:browser            → 四链 ALL PASS / 全部通过（EXIT=0）
node scripts/wiki-check.js      → files=88 pages=62 broken=0 anchorBad=0 struct=0 template=0
```

**测试重锚清单**（新口径导致，非回归）：test-fire（换管 0.5→0.8、机炮 85%→80%、锁定不降温共 6 条）、test-covers（27 处 barricade/soft→wall 家族）、test-extreme-cover（3 条 toTier:null 语义）、test-nodegen（1 条投影）、test-nodegen-calibration（6 个 minPassage 基线——实体墙收窄通道，**预期几何变更**）、test-modes（生存 3×3：areaRatio 2.0→0.45、单行片）、test-cards（legendary 池 15→9 ⇒ 降级轮次 5→4）、test-card-effects（MODIFIER_STATS 新增 7 个武器专有键）、test-rework-r1（penMult 0.80）、test-rework-r2（地雷上限三块整体改写为「不设上限」）、test-weapon-upgrade-balance（mine_upgrade 移出 DPS 历史带）、test-assets/test-cover-gen（软/沙袋贴图→wall 六变体，出图管线 cover-gen-prompts.json / prepare_covers.py ORDER / cover-refs.json 同步）。

**2026-10-22 第四批反馈补记（同日，接在 §4.119 之后）**：

| # | 问题 | 根因（已核实） | 修法 | specs 归口 |
|---|---|---|---|---|
| F1 | 榴弹炮吃了主炮卡升级，还能用弹夹/机炮/电磁炮的机制 | 曲射分支用 `shooter.sigma`（含 `spreadMult/aimSpeed` 改装）与 `spec.reloadMult`；弹种写死 `he` | ①弹种按 `_HE_FAMILY` 取**已获得的 HE**；②精度 = `max(RULES.spread.base, 实时 σ)`；③装填 `_effReloadMult = _hsMode ? 1 : reloadMult`；④伤害不吃 spec 的 `damageMult/penMult`；⑤特殊机制天然隔离（曲射分支不读 `primaryWeaponSpec`） | `combat/arc-fire.md` §榴弹炮 = 标准主炮的射击模式 |
| F2 | 落点特效里有「轰击」字样 | `dmgText(s.x, s.y - 14, '轰击', 'he')` | 删除该行，只保留爆炸视觉 | `combat/arc-fire.md`（同节末条） |
| F3 | 掩体 6 套贴图全是「正视图」 | `wallFrame` 只做坐标变换，各 style 按**立面**画：sandbag 2 层堆叠、brick 错缝砖块、steel 四角铆钉、concrete 上亮下暗 | `wallFrame` 改为**俯视 2.5D 画框**（厚度方向只有「一层顶面 + 一条背光侧壁」，侧壁 T×26% 钳 [1.6,5]）；六套 style 顶面重画（sandbag 单层俯视袋阵 / brick 长轴砖缝+压顶线 / steel 沿长轴两排铆钉 / concrete 单一面+面内斑驳 / hedgehog 1 条铁丝 / barrier 收分只体现长轴两端） | `map/cover-system.md` |
| F4 | 图鉴各坦克装甲/HP 等数据全相同 | `enemyPreviewStats` 走 `applyEnemyAppearanceAndStats`，后者**只取外观、数值一律用固定基准** `enemyAnchorBase × classProfiles[class]`；5 辆车 `class` 全 undefined ⇒ 全落 `medium` ⇒ 乘子同为 1 | 新增 `opts.factory`：图鉴口径按**该车出厂值**（`resolvePartArmor` 逐面装甲 + spec 的 hp/pen/damage/reload/maxSpeed/…）做基准，再叠等级曲线；实战不传 factory ⇒ 零回归。`tank_model.js` 导出 `resolvePartArmor`，`tank_panels_core.js` 用 `globalThis` 索引访问（避免 TS2304） | `editor/codex.md` §数值口径 factory |

| F5 | 掩体摆放过于随机，要呈现 1 个防线的样子，防御玩家可能进攻的 2-3 个方向 | 墙体唯一来源 `placeJunctionWalls`（路口环带随机）——不知道玩家出生点与敌军防线；敌军却按 `planDefenseLines` 成防线分布 ⇒「墙随机、敌成线」 | 新增 `RULES.nodeMap.defenseWalls` + `js/tank_nodegen.js placeDefenseWalls`：**竖直墙段**（法线朝玩家，实测 8 seed 100% 朝向）、x 对齐敌军防线锚点、沿世界高铺段 + 通行口（90~150px）、避路面（obbHitsCover）与既有掩体、整列被河流带卡死时水平平移 ±(160~240)px 重试 ≤5 次；`makeNode` 在防线规划后接线（Boss 跳过、世界高下限守卫、跨模块走 `globalThis`） | **新建** `map/defense-walls.md` |

**F1~F5 验证（2026-10-22 同日）**：`npm run check` EXIT=0 / `npm test` **50 通过 0 失败**（`test-batch5-combat.js` 增至 **125 断言**，新增 4 节锁住 F1/F3/F4/F5：防线墙竖直形态、法线 100% 朝玩家、两道分组 x 聚集、defenseLine 标记）/ `npm run test:browser` 四链全绿 / `wiki-check` files=89 pages=63 broken=0。**F3 连带**：`tools/cover-refs.json` 因烘焙内容变化已重跑 `node tools/dump-cover-refs.mjs` 更新（`wall` 画布 170×14）。

**已知遗留（不阻塞）**：① enemyPreviewStats 的 opts.boss 只透传、未施加 Boss 调参倍率 ⇒ 图鉴 Boss 行是其底盘等级曲线（页脚已标注）；② server.js 启动日志未加 codex URL（可选）；③ wallPartBlock 按纯距离比较实现，同侧组合在生产路径不可达（stepShells 只传弹道真正穿过的掩体）。

## §4.120 2026-10-22 坦克程序化贴图高清风优化（_texNoise + 材质层升级 + 边缘磨损重做 + 全预设重绘）

**背景**：坦克程序化渲染是实机唯一路径（全部 5 辆车 `sprite.enabled=false`，`assets/tanks/` 下的 PNG 被用户判定为 AI 生成、观感奇怪，已放弃使用；未启用、未修改任何 PNG）。高清风必须靠「其他生成式方法」——在代码层增强程序化纹理，通过 3× 超采样烘焙 + 浏览器双线性降采样呈现，零外部图片依赖。

**结论**（细则归口 `specs/map/textures.md` 现行口径，本处只留结论与索引）：

| 主题 | 结论 | 代码 |
|---|---|---|
| 金属流变/漆面不均匀基底 | 新增确定性分形值噪声 `_texNoise(ctx, b, opts)`（cell/octaves/persistence/alpha/seed 全可控，`getImageData` 无依赖，3× 降采样后呈现平滑非均匀渐变而非雪花噪点） | `js/tank_paint.js` `_texNoise` |
| 材质光照层升级 | `paintMaterialPass`：漆面流变基底 + 5 圈收缩 AO（替代 3 圈，更软且贴合箭头形轮廓）+ 倒角/受光亮边/背光暗边 α 收敛（避免 1px 结构连成「LED 点阵」）+ 高光池/拉丝（42 条）/细颗粒（更密）收敛 + 下缘积尘渐变 + 下缘污渍块 + 最终微扰噪声 | `js/tank_paint.js` `paintMaterialPass` |
| 边缘磨损重做 | `paintEdgeWear`：掉漆从方块改为 3~6 边不规则扇形缺口；等级≥2 加重力方向（+y）锈水渐变拖尾；等级≥3 加飞边亮点 + 棱边不规则亮边（替代整环描边，避免 LED 环） | `js/tank_paint.js` `paintEdgeWear` |
| 全 14 个 TEXTURE_DEFS 预设重绘 | `armor_plate` 每板独立色调 + 双线板缝（深缝+内侧亮边）；`weld_seam` 分段焊道+鱼鳞（代替连续直线）；`rust` 不规则锈斑+内核+锈水流痕；`camo` 色块叠中心亮径向渐变；`paint_panzergrau`/`paint_soviet`/`paint_olive` 椭圆暗亮块→不规则色块，掉漆露底改短划痕；`camo_*` 系列沿用升级后 `_texPatch` 径渐变 | `js/tank_paint.js` `TEXTURE_DEFS` |
| 规范对齐 | 完全遵守 `specs/map/textures.md` 现行口径：`SPRITE_SCALE=3` 超采样、`spriteView1x` 1:1 审计、`_texPatch` 硬边色块、`paintPatternBox` 整车图案框、`weatherSeed` 同型车变体、v2/v3 审核标准；未新增外部资产 | `specs/map/textures.md` |

**验证记录（2026-10-22）**：
- `node scripts/audit-textures.js` → 平均 **99/100**（原 97），14/14 达标、无 C 级指标；v3 跨部件/跨实例/沿边检查 **14/14 PASS**（同型差异 ≥8%、边缘磨损 ≥17%、车↔塔连续 ≤0.85）。
- 新增 `scripts/tex-preview.js` + 根目录 `tex-preview/` 28 张 5× 放大预览 PNG（14 键 × 车体/炮塔），供高清风人工逐张确认（`read_image` 可打开）。
- `npm run check` → EXIT=0（含 `scripts/tex-preview.js` 语法冒烟）。
- `npx tsc --noEmit` → 仅剩预先存在的 `scripts/test-batch5-combat.js` 重复标识符 `M`（与本批无关，未碰该文件）。
- `npm test` → 49 通过 / 1 失败；唯一失败 `scripts/test-cover-gen.js` 为环境 ENOENT（临时目录 rename），与贴图改动无关，未碰该文件；`test-render.js`（含 v2/v3 审核回归）52.7s 全绿。
- `npm run wiki:check` → 见下条（改了两个 DEVELOPMENT 文件，需跑）。

**规则遵守**：未改 specs 章节编号、未新建/删主题页（未改动贴图标准本身，仅提升实现质量至既有标准），故无需 `wiki-check` 的主题页/结构项；因改动 `docs/DEVELOPMENT.md` 与 `docs/DEVELOPMENT-batches-2026-10.md` 目录表，仍跑 `wiki-check` 确认无断链。

> **⚠ 已被 §4.121 取代（2026-10-22 同日）**：本节所述的 `_texNoise` / 材质层升级 / 边缘磨损重做 / 全预设重绘**已全部回退**——用户明确要求「不要使用当前已有的绘制方法」（`tank_paint.js` 的 `_texPatch`/`_texGrain`/`paintMaterialPass`/`paintEdgeWear` 一套），故 `js/tank_paint.js` 恢复原状，本节结论**不再成立**。后续 §4.121 的 SVG 矢量方案亦已回退（见该节顶部注记），坦克贴图最终回到**程序化烘焙为唯一实机路径**的口径。

## §4.121 2026-10-22 坦克贴图 SVG 矢量高清通道（P-16）—— **已整体回退**

> **⚠ 本条已作废（2026-10-23 用户裁定「这些贴图都太丑了」，删除 SVG 路线）**。
> 原内容记录了一条完整的 SVG 矢量贴图通道（`js/tank_svgtextures.js` + `drawTankSVG` + 三级回退链
> + 车型档案 `textureProfile` + 设计器圆角/倒角 + `test-svgtextures.js` 69 项 + `test-bevel.js` 41 项）。
> **上述实现全部移除**，本节仅保留结论与教训，作为后续贴图路线的决策依据。

**回退范围（2026-10-23 完成）**：

| 类别 | 内容 | 状态 |
|---|---|---|
| 新建模块 | `js/tank_svgtextures.js`（约 950 行） | 清空为占位注释 |
| 绘制接线 | `js/tank_battledraw.js`：`svgEnabled` / `drawTankSVG` / SVG 优先分支 / 侧壁偏移跟随 bevel / 导出项 | 全部删除，`drawTank` 恢复「PNG 精灵 → 程序化」两通道 |
| 页面标签 | `tank_battle.html` / `tank_bench.html` 的 `<script src="js/tank_svgtextures.js">` | 已移除 |
| 开发者面板 | 「SVG 矢量贴图」勾选（`devSVGChk` / `_svgOverride`） | 已移除 |
| 数据字段 | `tanks/*.json` 的 `textureProfile` / `hull.bevel` / `turret.bevel` | 5 份 json 全部移除 |
| 模型透传 | `js/tank_model.js`：`textureProfile` 深拷贝 + `applyBevelSpec` 四处应用 + `hullBevel`/`turretBevel` | 全部删除 |
| 几何函数 | `js/tank_halfgeom.js`：`roundCorners` / `bevelCorners` / `applyBevelSpec` / `dedupeVerts` / `dropCollinear` | 全部删除（文件恢复 176 行原状） |
| 设计器 | `designer.js` + `tank_designer.html` 的「圆角与倒角」面板与 `bevelSpecIn/Out` | 全部删除 |
| 回归测试 | `scripts/test-svgtextures.js`（69 项）+ `scripts/test-bevel.js`（41 项） | 清空为合规空壳；`run-tests.js` 登记保留但标注废弃 |
| 预览脚本 | `scripts/tex-preview.js` + `svg-preview/`（15 个 SVG + index.html） | 脚本清空；`svg-preview/` 目录已删 |
| 类型声明 | `types/globals.d.ts` 的 SVG / bevel 全部 declare | 已删除 |

> 因沙箱 EPERM，`js/tank_svgtextures.js`、`scripts/test-svgtextures.js`、`scripts/test-bevel.js`、`scripts/tex-preview.js` 四个文件**无法物理删除**，已清空为占位注释；`run-tests.js` 中保留其登记字符串（否则 `check-html.js` 的孤儿测试检查会判红），并加注释说明。后续若能物理删除，请同步移除登记行。

**现行坦克贴图口径**（回到两条通道）：

| 优先级 | 通道 | 入口 | 产物来源 |
|---|---|---|---|
| 1 | PNG 位图精灵 | `drawTankSprite`（`js/tank_battledraw.js`） | `tanks/*.json` 的 `sprite.hull/turret/barrel` → `assets/tanks/*.png`（现行全部 `sprite.enabled=false`） |
| 2 | 程序化烘焙 | `renderHullTexture` / `renderTurretTexture` | `js/tank_paint.js` 的 `TEXTURE_DEFS`（**现行唯一实机路径**） |

**教训留档（后续贴图路线的决策依据）**：

1. **程序化与矢量两条「代码生成贴图」路线均未达标**。程序化（#TEX6~#TEX15 多轮）在本项目实机尺度（车体 **59~96px**，`hullPoly` 73.5×38）下质感不足；SVG 矢量路线虽解决「放大不糊」，但用户连续六轮反馈「糊 → 无细节 → 无立体感 → 全内凹 → 毛刺 → 丑」，最终整体回退。
2. **必须做小尺寸可行性预研**。后续若再启动贴图路线，**先按 1× 实机尺寸（59~96px）出图交用户确认**，再投入全链路——放大审美（10× 探针）与实机观感系统性脱节，这是本项目反复返工的直接原因。
3. **用户明确拒绝 AI 生成贴图**（`assets/tanks/*.png` 观感奇怪），后续若走图片通道，需先确认美术来源。

**验证记录（2026-10-23 回退后）**：`npm run check` EXIT=0（51 个 test-*.js 登记一致）/ `npx tsc --noEmit` EXIT=0 / `npm test` **51 通过 / 1 失败**（唯一失败 `scripts/test-cover-gen.js` 为环境 ENOENT，与本批无关）/ `node scripts/wiki-check.js` broken=0 anchorBad=0。全局 grep 确认代码中已无 `svgImageReady` / `tankSVGImage` / `drawTankSVG` / `svgEnabled` / `textureProfile` / `applyBevelSpec` / `hullBevel` / `cornerRadius` 等残留引用。

---

## §4.122 2026-10-23 被动技能槽 + 无人机/导弹玩法改造（用户裁定 4 项）

**用户需求原文（2026-10-23）**：「增加被动技能槽，在 ui 中显示（含冷却时间）。将修理、医疗、灭火、应急护盾等不需要操作生效的卡牌都移动到『被动技能』卡牌类别中，被动技能槽属于坦克属性，无法通过升级增减，默认 2 个，后续再获取需要和主动技能一样选择顶替。火力、装甲、血量、机动的数据直接升级不加入『被动技能』的范畴。」
追加：① 删除侦查无人机，加强攻击无人机（伤害/索敌距离），增加攻击动画；② 反坦克导弹「按 1 次生效 1 次，导弹击中、消失后进入冷却」；③ 削弱线导/锁定导弹拐弯能力；线导导弹默认可越过低矮掩体 + 攻顶引信升级；锁定导弹 50% 概率越障 + 攻顶式升级。
后续澄清：「被动技能槽 … **每辆坦克固定数量，后期高等级坦克会赋予更多**」（取代初版「固定 2 个」口径）。

### 1) 被动技能卡分类（新增 js/tank_cards.js 导出）

判定口径 = **效果层面**（isPassiveSkillCard）：

| 类别 | 判据 | 覆盖卡牌（实测 12 张） |
|---|---|---|
| 特殊被动 | `type:'passive'` | `reactive_armor`（应急护盾）/`angle_boost`/`crew_liner`/`demo_overmatch_shell`/`sniper_overmatch_shot`/`spall_liner`/`support_spall_liner`/`wet_ammo_rack` |
| 伴随无人机 | `type:'drone'` | `escort_drone`（攻击型） |
| 固有技能强化 | `type:'ability'` 且 key ∈ {repair, medkit, extinguish} | `repair_kit`（修理）/`support_extinguisher`（灭火） |

**明确排除**（用户原话「火力、装甲、血量、机动的数据直接升级不加入」）：`modifier`（火力/装甲/血量/机动/装填/散布）、`ammo`、`weapon`、`economy`，以及 runtime 主动技能（`artillery`/`overdrive`/`shield`/`deploy_cover`/`aps`，仍占主动技能槽 3 格）。
**医疗**：卡池无独立医疗卡（医疗包是 innate 固有技能，`medkit` 键已列入 `PASSIVE_SKILL_INNATE_KEYS`，将来出强化卡自动归入被动）。

### 2) 被动技能槽（每车固定数量）

- **槽位数来源**：车型配置 `tanks/<id>.json` 的 `passiveSlots`（`applyTankConfig` 拷贝到实例）；未配置回退 `RULES.abilities.passiveSlotsMax`（=2）。实测：`tiger-I` / `Obj 780` = **3**，其余 4 型 = **2**。
- **不是升级项**：`UPGRADE_DEFS` 与局内商店均无 passive 槽扩容项（测试 2f/2g 负向断言防回潮）。
- **顶替机制**：槽满时获得新被动卡 → 不直接生效，弹 `#skillSlotPicker` 面板列出已占槽被动卡，玩家点选要顶替的那张；选定后先 `removePassiveCard`（清 `card:*` 修饰器 + `cardEffects` 条目 + `_cardApplyCount`，使该卡可再抽到）再应用新卡，与主动技能同机制。
- **UI**：`#hudSkills` 下新增 `#passiveSlots` 容器，`updatePassiveSlots()` 逐帧渲染（槽数=实例 `passiveSlots`、卡名短标、冷却角标）。冷却映射：`reactive_armor`→`_emergencyShieldCd`、`support_extinguisher`→`abilityCds.extinguish`、`repair_kit`→`abilityCds.repair`；其余常驻被动无冷却。

### 3) 无人机：删除侦查型、加强攻击型

- `cards/scout_drone.json` **停用**（`enabled:false`）→ `cardEligible` 与 `drawCardChoices` 双重过滤（300 轮抽样零命中，测试 5g）。
- `RULES.abilities.drone`：删除 `scoutRange`；`strikeRange` 260→**400**、`fireInterval` 2.0→**1.5**、`dmgMult` 0.4→**0.8**。
- 攻击动画：`droneFire` 已有 `spawnMuzzleFlash` + `spawnTracer` + `spawnImpactFx` + 伤害飘字（`tank_battle.html` 主循环）。

### 4) 反坦克导弹：单发冷却 / 削弱拐弯 / 越障 / 攻顶

- **单发冷却**：发射时 `t._missileInFlight = shell` 且 `secondaryReloadT = 0`；弹体在 `tank_battle.html` 清理段死亡时释放标记并按 `cfg.reload` 写装填。在飞期间 `missile`/`missile_wire`/`updateMissileLock` 均拒绝再次击发。
- **削弱拐弯**：`RULES.missiles.lock.turnRate` 3.5→**2.0**、`wire.turnRate` 4.5→**2.5**。
- **越障**：`RULES.coverTiers[tier].missileOverfly`（`wall`/`wall_breakable`/`tree` = true；建筑/岩石/永久掩体无此标记）。弹体 `s.overflyLow` 为真时跳过这些 tier 的拦截与部位裁剪。线导 `overflyChance=1.0`（默认），锁定 `=0.5`。
- **攻顶**：`RULES.missiles.topAttack = { dmgScale: 0.6, useThinnestArmor: true }`；弹体 `s.topAttack` 时命中改用 `resolveHit(..., forceEffThickness=thinnestArmorThickness(tank,'all'), allowBounce=false)` 且伤害 ×0.6。
- **新卡 2 张（epic）**：`weapon_secondary_missile_top_attack`（锁定式攻顶）/ `weapon_secondary_missile_wire_top_attack`（线导式攻顶），均 `weapon upgrade` + `statOverrides.topAttack = true`。卡池 205→**207**。

### 5) 顺带修复：上一轮遗留的「撞击伤害」半成品（用户裁定「保留但修好」）

`js/tank_entity.js` `resolveTankCollisions` 内撞伤块三处缺陷：① `a.speed *= 0.2` 急停把分离冲量一起打掉；② 无接触去重（每帧 4 迭代 × 多帧 ⇒ 数帧打空 100HP）；③ `hp<=0` 直接 `continue` 使残骸不再被分离。**实测症状**：`test-tankcollision`「残余深叠 48.03px / 中心距 15.97px」两项红。
修法：删 `speed *= 0.2`（硬直只写 `stiffTimer`）；加 `RULES.ramming.contactCooldown`（0.5s）按车对去重；分离解算改为只跳过「双残骸」，单残骸仍参与分离；`maxHp` 误读 `stats.hp` 一并修正。

### 6) 顺带修复：`RULES.abilities.overdrive` 配置缺失

上一轮把 `overdrive` 块误替换为 `flash_dash`，导致 `test-abilities` / `test-panels` / `applyCardEffects` 的 overdrive 通道全部失效（`RULES.abilities.overdrive` = undefined）。本批恢复 `overdrive` 块并保留 `flash_dash`。

### 验证

`npm run check` EXIT=0（52 个 test-*.js 登记一致，含新增 `test-passive-skills.js`）/ `tsc --noEmit` EXIT=0 / `npm test` **52 通过 / 1 失败**（唯一失败 `scripts/test-cover-gen.js` 为既有 ENOENT，HEAD 上同样红，属贴图管线阻塞项，与本批无关）/ `node scripts/wiki-check.js` broken=0 anchorBad=0。
新增回归 `scripts/test-passive-skills.js`（判定口径 / 槽位视图 / 顶替撤除 / 卡池扫描 / 侦查无人机停用 / 导弹越障与攻顶参数）。

**细则归口**：`docs/specs/cards/effect-types.md`（被动技能分类与槽位）、`docs/specs/combat/abilities-secondary.md`（导弹单发冷却/越障/攻顶）、`docs/specs/combat/deployables.md`（无人机）、`docs/specs/map/cover-system.md`（missileOverfly）。

---

## §4.123 2026-10-23 近期可落地三机制落地：撞击伤害 / 隐蔽感知 / 战术闪跃

> **背景**：远期路线（`docs/PLAN.md` §4）7 大模块中，用户要求先落地「近期可实现」部分。本批挑出**不依赖设计器 UI** 的三项：撞击伤害、隐蔽机制、战术闪跃（Tesla RCS 风格）。三者均只改 `js/` 共享模块 + `RULES`，可用 `tanks/*.json` 手写字段验证，无需 `tank_designer.html` 新增界面。

### 1) 撞击伤害（RULES.ramming）

`js/tank_entity.js` 的 `resolveTankCollisions` 在 MTV 分离**前**按法向闭合速度结算一次动能伤害：

- 折合质量 `μ = mA·mB/(mA+mB)`；折合动能 `E = 0.5·μ·relN²·0.001`。
- 受方伤害 `= max(1, round(E·damageScale·(对方质量/总质量)·(100/受方装甲)))`。
- **硬直双轨比例判定**（用户 2026-10-23 裁定）：`伤害 ≥ 生命上限×0.25` **且** `动能 ≥ 生命上限×0.15`。**两项都是相对生命上限的比例，不是绝对点数**——用绝对值（如 50 点）会让后期血量/重量膨胀后每次碰撞必然触发硬直。
- 新增 `stiffSpeedMul`（0.35）：硬直**只削速度、不冻结转向**，玩家有反制余地。
- 保留 §4.122 已修的 `contactCooldown`（0.5s 车对去重）与「不改写 speed」纪律。
- 消费方：`js/tank_move.js` 新增 `stiffMul()`，在 `pTarget` 链尾乘算；`stiffTimer` 在 `driveTank` 顶部逐帧递减。

### 2) 隐蔽感知（RULES.camouflage）

`js/tank_cover.js` 新增四个纯函数（可 Node 测试）：

- `camouflageClassOf` / `camouflageMotionOf` —— 吨位与运动状态分档。
- `camouflageValue` —— `baseCamo[吨位] × motionMultiplier[运动] × firingMul + terrainBonus`；`terrainBonus` 取 **max(灌木 0.40, 烟幕 0.70)**，**不叠加**（叠加会让树+烟堆到 1.1 彻底隐身）。
- `camouflageDistanceMultiplier` —— `clamp(1/(1+camo), 0.3, 1)`，下限 0.3 刻意保留（完全不可见会让 AI 无反应，失去博弈）。

接入点：

- `js/tank_fire.js` 主炮开火成功后写 `shooter.lastFireAt` 时间戳（只写时间戳，判定全在纯函数）。
- `js/tank_ai.js` 首次激活距离改为 `enterD × camouflageDistanceMultiplier(玩家)`；**脱离距离 `exitD` 不吃折扣**（否则原地熄火可反复脱战抖动）；Boss 不参与。

### 3) 战术闪跃（RULES.abilities.flash_dash）

- 新增运行时能力键 `flash_dash`（第 6 个）：`duration 1.2s` / `speedMult 2.5` / `cooldown 8s` / `overheatDuration 2s` / `overheatSlowMul 0.7`。
- **五键闭环**（缺一即死键）：① `RULES.abilities.flash_dash`；② `js/tank_abilities.js` 的 `ABILITY_KEYS_RUNTIME`；③ 同文件 `ABILITY_LABELS`；④ 同文件 dispatch `case 'flash_dash'`；⑤ `js/tank_cards.js` 的 `ABILITY_KEYS`。配套卡牌 `cards/ability_flash_dash.json`（epic）。
- 激活**只写状态位** `flashDashT` / `flashOverheatT`，位移仍由 `driveTank` 积分（绕过碰撞/边界钳制会穿墙）。
- 速度通道是**独立乘子** `flashDashMul()`，与 `fireMul` 同级链尾；**不可并入 `speedModifier`**——公路判定会把 `speedModifier` 归 1，闪跃会被静默清零（同 howitzerMul 历史教训）。

### 4) 战术烟幕发射器（副武器 `smoke`）

`js/tank_weapons.js` 新增副武器类型 `smoke`：一次 F 在炮口前方抛射 `cloudCount`（3）团烟雾，
沿垂直于射击方向均分展开 `spreadPx`（70）形成烟墙。

- **参数分工**：发射几何归 `WEAPON_DEFAULTS.secondary.smoke`（reload 14 / range 260 / cloudCount 3 / spreadPx 70 / duration 5）；单团半径与存续归既有 `RULES.smoke`（radius 120 / maxClouds 8），由 `spawnSmokeCloud` 内部消费。
- **四条枚举同步补 `smoke`**：`RULES.weaponTypes.secondary`、`tank_cards.js` 的 `WEAPON_SECONDARY_TYPES`（漏则任何烟幕卡判非法，同 `missile_wire` 的历史坑）、`tank_boss.js` 的 `BOSS_WEAPON_LABELS`、`tank_battle.html` 的 `SECONDARY_LABELS` / `SECONDARY_ICONS`。
- **两条独立通道**：视线遮断走 `smokeBlocksLoS`（`hasLineOfSight` 消费）；隐蔽加成走 `camouflageTerrainBonus` 读 `smokeClouds`。互不替代。
- **配套卡 3 张**：`weapon_secondary_smoke`（安装，rare）/ `weapon_secondary_smoke_upgrade`（密度，epic）/ `weapon_secondary_smoke_rapid`（速射，rare）。
- **平衡审计**：`smoke` 是纯功能性副武器（0 伤害），登记进 `test-weapon-upgrade-balance.js` 的 `MECHANICAL_TYPES`，只校验 `statOverrides` 实际变化、不计 DPS。

### 6) 曲射榴弹炮「主武器机制泄漏」修复 + 削弱（2026-10-23 用户裁定两连）

**用户反馈**：「曲射榴弹炮又把主武器的机制给带过来了」→「削弱榴弹炮模式，精度计算改为 4*主炮 base 精度*距离，不再绑定已获得的 he 弹种，只绑定基础 base 的 he 伤害、穿深」。

**根因（唯一机理）**：曲射分支虽在注释里声明「不继承主武器卡升级」，实际仍读 **`shooter.stats`** 三处。`stats` 是 `base + modifiers` 的三层聚合，任何主武器卡/局内升级都会进 `modifiers` ⇒ 三条泄漏通道：

| # | 位置 | 旧实现 | 泄漏来源 |
|---|---|---|---|
| ① | 直击伤害 | `shooter.stats.damage × heCfg.dmg` | 主武器伤害卡 |
| ② | 穿深 | `shooter.stats.penetration × heCfg.pen` | 主武器穿深卡 |
| ③ | 整组装填 | `shooter.stats.reload × reloadMult` | 主武器装填卡 |
| ④ | 弹种 | HE 家族取「已持有第一个」（`blast_he/proximity_he/hesh/aphe/he`） | HE 升级卡 |
| ⑤ | 精度 | `max(RULES.spread.base, shooter.sigma) × spreadFactor` | 主武器精度/扩圈卡 |

**修法（现行口径）**：

- ①② 改读 **`tank.base.damage` / `tank.base.penetration`** × **基础 he**（`RULES.ammoTypes.he`: dmg 1.5 / pen 0.5）。
- ④ 弹种**恒定 `he`**（`const heKey = 'he'`），与 loadout 无关。
- ③ 改读 **`tank.base.reload`**：主路径 `× 1.0`，急速射追发队列整组装填 `× hs.reloadMult`。
- ⑤ 精度 = **`4 × RULES.spread.base`（弧度）× 瞄准距离**（`HOWITZER_SPREAD_MULT = 4`），**不乘 `player.sigma`**。
- `WEAPON_DEFAULTS.primary.howitzer.spreadFactor` 2.0 → **4.0**；`tank_battle.html` 的 howitzer 瞄准圈同步改 `baseSigma × spf`（原 `player.sigma × spf`），保持「圈 = 真实落点散布」同源。

**测试更新（旧断言按纪律改为负向）**：
- `scripts/test-fire.js` 新增 9 条：伤害/穿深只绑基础 HE、换 loadout 数值不变、装填读 base、精度 σ = 4×base、σ ≠ `player.sigma×4`。
- `scripts/test-batch5-combat.js` 的 4 条旧口径断言（`spreadFactor===2.0` / `2×` / `_HE_FAMILY` / `_sigEff * spreadFactor`）改为新口径 + **负向断言**（防回潮），标题注明「2026-10-23 削弱，原 2× 直射 σ」。
- 同步修正 `types/globals.d.ts` 的 `spawnMuzzleFlash` 声明（补第 5 参 `muzzleType`）。

**细则归口**：`docs/specs/combat/arc-fire.md`（`spreadFactor` 表 + 「榴弹炮 = 标准主炮的射击模式」表重写，旧值以沿革注记保留）。

### 7) 验证

- `npm run check` **EXIT=0**（53 个 `scripts/test-*.js` 全部登记一致）
- `tsc --noEmit` **EXIT=0**（`types/globals.d.ts` 补四个 camouflage 函数声明）
- `npm test` **51 通过 / 3 失败**（54 项）：`test-recent-mods.js` 新增 **87 项全绿**；三项失败均为**既有问题、与本批无关**——`test-qa.js`（自检要求 `global.RULES` shim）、`test-passive-skills.js`（`tanks/dummy.json` 缺 `passiveSlots`，§4.122 遗留）、`test-cover-gen.js`（沙箱 `spawnSync` EPERM / ENOENT，贴图管线阻塞项）。
- `node scripts/wiki-check.js` **broken=0 anchorBad=0 struct=0 template=0**
- `validate-content` / `test-weapon-upgrade-balance` 均 PASS（含新增 3 张烟幕卡）。
- 曲射口径修正后：`test-fire` **ALL PASS**（含新增 9 条）、`test-batch5-combat` **129 passed / 0 failed**。
- 新增回归 `scripts/test-recent-mods.js`（87 项）：含**死配置哨兵**——逐块断言 `RULES.ramming` / `RULES.camouflage` / `RULES.abilities.flash_dash` / `RULES.smoke` 均至少有一个消费方，防「配置写了没人读」回潮。

**细则归口**：`docs/specs/combat/ramming-stealth-dash.md`（新建；兼容页 `docs/specs/combat.md` §15）。

**已知预留（未启用）**：`RULES.ramming.trackBreakChanceMax` 目前**无消费方**——履带断裂仍走既有 `immobT` 通道。启用前必须先补消费方，否则违反「新 RULES 键必须有消费方」纪律（本批测试已把它列为显式已知边界）。

---

## §4.124 2026-10-23 贴图资产口径收口 + 伪 3D 研究（俯视 2.5D，设计预留）

**用户原话（2026-10-23）**：「现在游戏贴图资产确定为目前采用程序生成+后期贴图接线，适当研究伪3d（即3d图形+2d交互），清理其他无关的文档描述、代码和测试文件。有不明确或我的描述不正确的，要与我讨论后定案」

**先澄清再动手（用户三项裁定）**：

| 问 | 用户裁定 | 影响 |
|---|---|---|
| 「后期贴图接线」的边界 | **删 AI 出图，保留后处理/锚点验收** | 删出图侧 6 个文件 + 1 个测试；保留 `prepare_covers.py` / `covers-anchor-check.py` / `dump-cover-refs.mjs` |
| `assets/tanks/` 19 张 PNG 怎么办 | **全部删除，保留路径与加载代码** | 盘上 0 张 PNG；`sprite` 四层通道与设计器面板不动 |
| 伪 3D 是哪种形态 | **俯视 2.5D**（3D 图形 + 2D 交互） | 不引 WebGL；研究路线 A |
| 研究交付到哪一步 | **仅研究文档** | 不改游戏代码 |
| 额外清理项 | SVG/bevel 残留 + 临时占位 + `sprite-audit.md` + ComfyUI 模板 + **贴图后处理脚本** | 见下表 |

> **一处修正**：用户所述「后期贴图接线」经核实**早已接好**（地图 `ASSET_DEFS.bake → assets/<key>.png`；坦克 `sprite` 四层 → `drawTankSprite`）。因此本批不是「新接线」，而是**把出图侧裁掉、把接线侧补测并写清口径**。

### 1) 删除清单（共 30 个文件 + 19 张 PNG）

| 类别 | 文件 | 理由 |
|---|---|---|
| AI 出图客户端 / 提示词 / 手册 | `tools/gen-covers.mjs`、`tools/cover-gen-prompts.md`、`tools/cover-gen-prompts.json`、`tools/cover-gen-manual.md` | 本仓库不出图 |
| 出图工作流模板 | `tools/cover-comfyui-workflow.json` | ComfyUI 已于 2026-10 否决 |
| 绘图 MCP 调研 | `tools/sprite-audit.md` | 调研结论已并入 specs，且不采用 MCP 出图 |
| 出图链测试 | `scripts/test-cover-gen.js` | 被删工具链的测试 |
| SVG / bevel 残留占位 | `js/tank_svgtextures.js`、`scripts/test-svgtextures.js`、`scripts/test-bevel.js`、`scripts/tex-preview.js`、`scripts/_clean_bevel_tmp.js`、`scripts/_diag_tmp.js` | 2026-10-23 已裁定废弃，只留占位；本次可物理删除 |
| 贴图后处理/体检脚本 | `scripts/optimize_sprites.py`、`scripts/clean_sprite_bg.py`、`scripts/gen_barrels.py`、`scripts/bake-assets.js` | 服务已删除的 AI/自绘资产链；`prepare_covers.py` 已内联必要逻辑（自包含） |
| 根目录临时占位 | `tmp_textures.md`、`tmp_textures_copy.md`、`tmp_halfgeom_head.txt` | 一次性调试残留 |
| 坦克 PNG | `assets/tanks/**` 19 张（10 车体/炮塔 + 1 履带 + 8 炮管，3.7MB） | 用户裁定删；`assets/` 现仅余 `README.md` |

**保留**（后期贴图接线必须）：`tools/dump-cover-refs.mjs`、`tools/cover-refs.json`、`tools/bake.html`、`scripts/prepare_covers.py`、`scripts/covers-anchor-check.py`、`scripts/lib/mini-canvas.js`、`scripts/audit-textures.js`、`scripts/test-render.js`、`scripts/test-assets.js`。

### 2) 新增回归：`scripts/test-asset-pipeline.js`（9 项，挂 `npm test`）

锁「接线」而不是「出图」：① `cover-refs.json` 与烘焙代码一致（`--check`）；② 基准键集合 = `ASSET_DEFS`（含 canopy，9 键）；③ 每键有 canvas/anchor/centroid；④ 锚点量级合理（允许负值）；⑤ **负向**：基准不含已删除的 `soft`/`barricade`；⑥ `prepare_covers.py` 含 ORDER；⑦ ORDER = 基准键集合；⑧ 空 `assets/` 下 `covers-anchor-check.py` 退出码 0；⑨ 9 键全报 `ABSENT`（走程序化回退不是缺件）。

同时 `scripts/test-tanks.js` 补**负向断言**：`sprite.enabled === true` 时 `sprite.hull/turret/track.img` 必须在盘上——防止「JSON 指向不存在的图、又悄悄开着精灵」这种静默回退的坏配置。

### 3) 伪 3D 研究（用户裁定形态：俯视 2.5D）

新建主题页 `docs/specs/map/pseudo-3d-2p5d.md`（**适用版本：设计预留（未落地，2026-10-23）**）+ 兼容页 `docs/specs/map.md` **§29**（新编号追加，未动任何旧编号）。

**三条候选路线**：A 强化现有 2.5D 绘制（推荐，2~4 人日）/ B 固定斜投影层（8~15 人日）/ C 真 3D WebGL（不建议）。

**三条候选路线**：A 强化现有 2.5D 绘制（推荐，2~4 人日）/ B 固定斜投影层（8~15 人日）/ C 真 3D WebGL（本阶段不做）。

> **⚠ 2026-10-24 更正**：本条初版写的「不选 C 的四条硬理由」中，**第 1、2 条已被用户推翻**——用户明确「零依赖 + file:// 直开 + Node 像素回归不要作为硬约束，只是目前状态的临时的选择」。现口径：真 3D **不被架构排除**，本阶段不做的真实理由是**缺 3D 美术管线**（已否决 AI 出图）与**玩法收益未证实**；换 WebGL 需改用浏览器截图基线重建视觉回归链（**可做，属额外成本**）。初版原文保留于下方，仅作追溯：
>
> > ~~零依赖 + `file://` 直开是硬约束；`test-render.js` 的 Node 真实光栅化像素回归链会整体失效；无 3D 美术来源且已否决 AI 出图；俯视战术射击不需要自由相机。~~
>
> 细则见 `docs/specs/map/pseudo-3d-2p5d.md` §3.1。

**关键事实（实测）**：现行 2.5D **是画出来的，不是算出来的**——`getPartZRange`（`js/tank_geometry.js`:18）返回固定常量（车体 0~1.4 / 炮塔 1.4~2.3），`RULES.heights` 已于 2026-09-20 #E3 删除；`raycastTank` / `bestTankHit` 是纯 2D 多边形射线；`hasLineOfSight` 判的是 tier 布尔。**路线 A 明确只改渲染**（统一高度表 + y-sort 遮挡 + 侧壁按高度派生），不把高度灌进玩法——否则「2D 交互」这条判据就破了。

**风险已登记**：测试重锚（`test-render` ⑧ / `test-covers` 投影 / `test-batch5-combat` wall 段）、y-sort 性能（strip 节点 covers 700~1100）、与「树冠刻意遮挡」设计冲突、高度偏移必须是 `1/zoom` 整数倍否则侧壁闪烁。

### 4) 文档与工具同步

| 文件 | 改动 |
|---|---|
| `docs/specs/map/textures.md` | 「出图管线」重写为**后期贴图接线**口径（删出图命令、加 `test-asset-pipeline` 回归）；「坦克贴图通道」补「PNG 已删、代码保留、启用前提未变」；ASSET_DEFS 档位改为实测六档 |
| `docs/specs/map.md` | §18 摘要改为新口径；§0 主题索引加一行「伪 3D 研究」；新增 §29（含 29.1/29.2） |
| `docs/specs/map/index.md` | 主题页表加 `pseudo-3d-2p5d.md` 一行；页数 13 → **15**（含新增页） |
| `docs/specs/editor/bake-modules.md` / `visual-spec.md` | 删除已删脚本的引用；「缩图与 JSON 同步」改为「后期贴图入库与 JSON 同步」；补当前无图说明 |
| `docs/ASSETS-PIPELINE.md` | **全文重写**为「后期贴图接线手册」（四步链、三坐标口径、坦克精灵启用前提、排错表、维护纪律）；明确「本仓库不出图」 |
| `assets/README.md` | 重写：当前为空是预期；两类 PNG 的路径约定；坦克启用前提 |
| `docs/PLAN.md` | 条目 1 关闭（划线保留）；新增条目 4「伪 3D 实施（研究已交付、无排期）」；§4.7 的 `gen-covers.mjs` 改为现行系统 |
| `docs/DEVELOPMENT.md` §3.2 | 近期待办关闭；新增 §4.124 指引 |
| `.dsh/skills/role-render-fx` / `sandbox-verify` | 文件清单与验证链同步（删已删脚本、加 `test-asset-pipeline`） |

### 5) 验证

- `node scripts/test-asset-pipeline.js` → **9/9 全绿**（含 `--check` 与空 `assets/` 的 ABSENT 校验）
- `node scripts/check-html.js` → **All checks passed**（含测试登记一致性；删了 3 个 test-* 后无孤儿）
- `node node_modules/typescript/bin/tsc --noEmit` → **EXIT=0**
- `node scripts/run-tests.js` → **52 通过 / 0 失败（52 项）**。见 §4.125 的收尾修复记录（本批提交前把两项既有失败一并修掉：`test-recent-mods.js` 改回字面量 require、`tanks/dummy.json` 补回 `target`/`class` 并补 `passiveSlots`）。
- `node scripts/wiki-check.js` → `files=91 pages=65 links=1668 broken=0 anchors=857 anchorBad=0 struct=0 template=0`
- 新增页模板合规：四行头部 + `## 相关页面` 齐备（wiki-check template=0 已覆盖）

**细则归口**：`docs/specs/map/textures.md`（出图管线 / 坦克贴图通道）、`docs/specs/map/pseudo-3d-2p5d.md`（伪 3D 研究）、`docs/specs/editor/visual-spec.md`（四层精灵与对齐契约）、`docs/ASSETS-PIPELINE.md`（接线手册）。

---

## §4.125 2026-10-24 纠正「零依赖 / file:// / Node 像素回归 = 硬约束」的错误定性

**用户原话（2026-10-24）**：「零依赖 + file:// 直开 + Node 像素回归不要作为硬约束，只是目前状态的临时的选择」。

**问题**：§4.124 的伪 3D 研究把这三条写成了**架构硬约束**，并以此作为「不选真 3D」的**第 1、2 条理由**。这是**定性错误**——三者都是现阶段的工程选择，不是不可逾越的边界；用它们否决技术路线，等于把「当前没做」写成「不能做」。

**核实（2026-10-24）**：

| 项 | 实测事实 | 正确定性 |
|---|---|---|
| 零运行时依赖 | `package.json` 无 `dependencies`；页面按序加载全局脚本、无打包步骤 | 临时选择（引入 Three.js + 打包是**允许的成本**） |
| `file://` 直开 | 正式游戏页/测试台**必须**走 dev server（`fetch('api/tanks')`）；仅 `tools/bake.html` 刻意支持 `file://` | 临时特性（**不是**全站契约，可放弃） |
| Node 像素回归 | `test-render.js` 借 `scripts/lib/mini-canvas.js` 做真实光栅化断言（29 + 9 项） | 临时选择（WebGL 下改用浏览器截图基线即可，**属额外成本**） |

**修正后的口径**：真 3D（路线 C，WebGL/Three.js）**不被架构排除**。本阶段不做的真实理由是：
1. **缺 3D 美术管线**（无模型/贴图/骨骼，且已否决 AI 出图）——与渲染技术选择无关的最硬一条；
2. **玩法收益未证实**（俯视战术射击当前不需要转相机）；
3. **回归链需重建**（Node 光栅化 → 浏览器截图基线，可做，属成本）；
4. **阶段策略**（先用路线 A 以 2~4 人日验证「体积感是否真提升观感」，再决定是否投入 C）。

**改动清单**：

| 文件 | 改动 |
|---|---|
| `docs/specs/map/pseudo-3d-2p5d.md` | 新增 **§3.1「零依赖 / `file://` / Node 像素回归是当前状态，不是硬约束」**（含三项事实对照表 + 修正后的四条理由）；`落地状态` 表把真 3D 从「未采用（冲突）」改为「本阶段不采用（非禁止）」；§8 结论重写；页头 `适用版本` 改 2026-10-24 修订 |
| `docs/specs/map.md` | §29 标题加「2026-10-24 修订」；**§29.2 重写**为「真 3D 的取舍：`file://`/零依赖/Node 回归是临时选择，不是硬约束」并指向新锚点 |
| `docs/specs/map/textures.md` | 删去 2 处「`file://` 兼容」的约束式表述（改为陈述现状） |
| `docs/specs/editor/bake-modules.md` | 「`file://` 可直开，零服务器依赖」→「当前可直接打开（现阶段特性，非约束）」 |
| `README.md` | 「纯前端 JavaScript，无构建步骤，零运行时依赖」加「**技术栈现状（不是承诺）**」前缀并指向 §3.1 |
| `docs/DEVELOPMENT-batches-2026-10.md` | §4.124 的「不选 C 的四条硬理由」加**更正注记**（原文划线保留，符合「被推翻不静默删除」）；§4.124 的验证数字更新为收尾后的 52/0 |
| `docs/PLAN.md` | 条目「伪 3D 实施」补一句：真 3D 未被排除，只是本阶段不做 |

**验证**：`node scripts/wiki-check.js` → `files=91 pages=65 links=1668 broken=0 anchors=857 anchorBad=0 struct=0 template=0`（新锚点 `#31-零依赖-file-node-像素回归是当前状态不是硬约束` 已实测校验通过）；`node scripts/check-html.js` → All checks passed；`npm test` 52/52；`tsc --noEmit` EXIT=0。

**细则归口**：`docs/specs/map/pseudo-3d-2p5d.md` §3.1（唯一口径——「三条是临时状态」的完整论证在此）。

---

## §4.126 2026-10-24 视野-隐蔽机制与伪 3D 路线的兼容性研究

**用户提问**：「研究哪个更好兼容视野-隐蔽机制」。

**结论**：**路线 B（固定斜投影层）更好兼容**。理由不是「3D 更好看」，而是视野-隐蔽本质是**几何问题**（谁挡得住谁的视线），而现行实现把它压成了「2D 圆形距离 × 布尔遮挡」。**只有能把「高度」同时带进画面与遮蔽判定的路线，才真正兼容这套机制**：

| 路线 | 高度进入视线判定 | 净收益 |
|---|---|---|
| A. 强化 2.5D 绘制 | ❌ 几何完全不动 | **≈ 0**（只改画面） |
| B. 固定斜投影层 | ✅ 渲染必须维护高度轴，可同时驱动遮蔽 | **高** |
| C. 真 3D | ✅ 原生有 z | 最高，但**过度** |

**但真正的瓶颈不是路线，而是现行机制的三个结构性缺陷（2026-10-24 实测）**：

1. **`vision` 布尔吞掉高度**——`hasLineOfSight`（`js/tank_cover.js:1036`）命中任一 `vision:true` 的 cover 即 `return false`；`RULES.coverTiers` **18 键零个带高度字段**（`RULES.heights` 已于 2026-09-20 #E3 删除）。后果：**灌木 = 楼房**，高建筑旁边过视线照样被挡 / 或被点亮。
2. **隐蔽值与几何无关**——`camouflageTerrainBonus` 用 `getCoverUnderTank` 的 **OBB 相交**判「在灌木里」，加 `bushBonus 0.40`；不看距离、朝向、是否真被遮。敌人 50px 直视时仍拿满加成。
3. **只有玩家一侧有隐蔽**——`camouflageDistanceMultiplier(p)` 唯一调用点在 `aiDecideEnemy`，**敌人对玩家无对称隐蔽**；玩家永远不会被 AI 偷袭，且 HUD 无暴露度反馈。

**附带核实（建议另案处理，本批不改码）**：

| 发现 | 证据 | 性质 |
|---|---|---|
| `aiSpotBaseDist` 是死配置 | 全仓仅 `js/tank_rules.js:51` 定义 + `test-recent-mods.js:83` 断言非零 | 应删或接消费方 |
| `alertLevel === 2`（友邻遇袭）从未写入 | `tank_ai.js` 只有 0/1/3 三态 | 注释声明五层级但实现缺一级 |
| 开火惩罚读挂钟时间 | `camouflageFiringMul` 用 `performance.now()`（`js/tank_cover.js:313`） | 理论上有确定性风险（`test-replay` hash 基线） |

**关键判断：视野-隐蔽的改进不需要等伪 3D。** 建议顺序：**P1 补判定三洞（3~5 人日，2D 下即可）→ P2 路线 A（2~4 人日，共享 P1 的高度表）→ P3 路线 B（8~15 人日）→ P4 路线 C（仅在「可旋转相机」成为明确需求时）**。反过来做（先渲染）会得到「画面有高度、判定没高度」的割裂版本。

**新增文档**：`docs/specs/map/vision-stealth-3d-compat.md`（设计预留；§1 完整数据流、§2 三个缺陷、§3 路线对比、§4 若选 B 的最小改造清单含 `coverTiers.height` 建议表、§5 为什么不直接上 C、§6 实施顺序、§7 风险）。兼容页 `docs/specs/map.md` 新增 **§30**（30.1 现行判定实测口径 / 30.2 实施顺序），未动任何旧编号。

**同步**：`specs/combat/ramming-stealth-dash.md` 的「AI 接入口径」补**已核实的实现边界**表（5 行，含实测证据）；`specs/map/pseudo-3d-2p5d.md` §3 加交叉说明「若目标是兼容视野-隐蔽，推荐变为 B」并互相链接；`specs/map/index.md` 主题页表 +1（15→**16**）；`docs/PLAN.md` 新增待办条目 4（P1 三洞补齐，待裁定）。

**验证**：`node scripts/wiki-check.js` → `files=92 pages=66 links=1687 broken=0 anchors=862 anchorBad=0 struct=0 template=0`（新增页四行头部 + `## 相关页面` 合规，template=0 已覆盖）；未改任何代码，故 `check`/`test` 不受影响。

**细则归口**：`docs/specs/map/vision-stealth-3d-compat.md`（唯一口径）。

---

## §4.127 2026-10-24 伪 3D 就绪度：影响面、先行基础设施与「无建模基础」定性

**用户提问**：「继续研究会带来哪些影响、哪些基础设施需要先做，目前我没有任何建模基础」。

**结论一：「无建模基础」对本作是伪约束。** 不是「可以学建模」，而是**本作根本不需要手工建模**——全部场景元素是硬表面参数化几何，且**已以数据形式存在于仓库**：

| 元素 | 现存数据（实测） | 3D 化方式 |
|---|---|---|
| 坦克车体 | `tanks/*.json` 的 `hull.verts`（tiger-I：**9 顶点**箭形多边形） | 挤出棱柱 |
| 坦克炮塔 | `turret.verts`（tiger-I：**23 顶点**） | 挤出棱柱 |
| 炮管 | `barrel.len/width/muzzle/jacket/mantlet`（参数化） | 参数圆柱 |
| 掩体/墙/楼 | `covers[].x/y/w/h/angle`（OBB） | **盒子**（最简单图元） |
| 树/灌木 | w/h + `blobPath` 波浪轮廓（确定性函数） | 圆柱干 + 轮廓挤出冠 |
| 岩石 | `rock-poly` 多边形 | 多面体（2D 绘制已是逐边法线着色） |
| 涂装 | `tank_paint.js` `TEXTURE_DEFS` 程序烘焙 | 顶面贴纹理 + 侧壁明暗条带 |

> 手工建模只影响「高细节精修资产」（铆钉/有机形体），本作**没有**这类既有需求。缺的是**技能不是资产**：B 需 ~50 行仿射数学（`utils` 已有 `rotate/angDiff`）；C 需渲染器 API + **5~8 人日学习曲线**（叠加在 ≥1 个月实现上）。判据：**资产若能全部由现有 JSON/配置驱动生成，就不受「无建模基础」约束**——A/B 完全满足，C 在参数化挤出路线下也满足。

**结论二：先行基础设施 I0~I5（按依赖排序，每项独立可验证、独立可回退、不随路线选择报废）**：

| # | 基础设施 | 内容 | 量级 |
|---|---|---|---|
| **I0** | 模拟时钟 | 统一 `simNow`，迁移**判定/计时路径**挂钟读取——实测 **13 处**（`tank_ai` 2 / `tank_boss` 5 / `tank_cover` 1 / `tank_fire` 1 / `tank_model` 2 / `tank_entity` 1）。**豁免**：`tank_economy` 存档时间戳、渲染侧 fx 时间量子 | 1~1.5 人日 |
| **I1** | 高度数据模型 | `RULES.coverTiers[*].height`（18 键）+ 车体/炮塔真实高度字段化（替代 `getPartZRange` 硬编码）。**唯一口径**，渲染与判定同读 | 1 人日 |
| **I2** | 统一遮蔽查询 | `hasLineOfSight` 布尔 → 高度分档，与 `getExposure` 的 `zMin>=1.2` 同源；`vision` 保留为「是否参与」开关 | 2~3 人日 |
| **I3** | 视觉回归双轨 | 保留 `mini-canvas` 像素链（A 可用）+ 新增**浏览器截图基线链**（复用 `playwright-core` 与四条 `test:browser` 框架） | 2~3 人日 |
| **I4** | 拾取反解收口 | `worldToScreen/screenToWorld` 收口（实测散在 **16 处**调用：battle 9 / camera 4 / ai_squad 1 / drone 1 / bench 1） | 1 人日 |
| **I5** | 几何挤出工具（仅 C） | `verts→棱柱` / `barrel→圆柱` / `w/h/angle→盒` / `blobPath→冠体` + 预览页 | 3~5 人日 |

**影响面要点（实测）**：

- **路线 A**：只碰 `tank_battledraw.js`；输入/小地图/HUD **零影响**；`test-render.js` 91 条 `ok()` 中视觉断言约三分之一会漂移。
- **路线 B**：世界变换**单点插入**（`tank_battle.html:6045-6048` 的 `translate+scale`，绘制代码不用改）；但 **拾取 16 处**与 **地面烘焙 AABB 假设**（`drawGroundCached` 的 `wantW = vw + 2×MARGIN`，斜投影下可见区是平行四边形）是最大工作面与最大技术风险（隐藏成本 2~4 人日）；小地图零影响。
- **路线 C**：渲染层整体重写、逻辑层不动；`mini-canvas` **无法跑 WebGL** ⇒ 91 条像素断言整体退役改截图基线（**流程变革**）；设计器**不动**（它编辑的 `verts` 就是 3D 源）。

**关键量级修正（本批实测推翻初估）**：§4.126 初估 P1 为「3~5 人日」，实测 I0 的挂钟读取是 **13 处而非 3 处**（且 `tank_model.js:328/368` 的 **timed 修饰器 `expiresAt` 全部读 `Date.now()`** —— 存量非确定性隐患，比预想更深）。P1 修正为 **4~5.5 人日**。

**建议顺序**：I0+I1+I2（=P1，4~5.5 人日）→ I3 截图基线（2~3 人日，可与 P1 并行）→ A（2~4 人日，共享 I1）→ **B 的 Go/No-Go 门**（先做 1 人日「斜投影下能否判读 650px 级距离」的静态对比图）→ C 仅在「可旋转相机」成为明确玩法需求时启动 I5。

**新增文档**：`docs/specs/map/pseudo-3d-readiness.md`（§1 无建模基础定性、§2 影响面清单、§3 I0~I5 清单、§4 路线×基础设施矩阵、§5 先行顺序、§6 风险、§7 一句话回答）。兼容页 `docs/specs/map.md` 新增 **§31**（31.1 定性 / 31.2 I0~I5），未动旧编号。

**同步**：`specs/map/index.md` 主题页表 +1（16→**17**）；`pseudo-3d-2p5d.md` 与 `vision-stealth-3d-compat.md` 互加链接；`vision-stealth-3d-compat.md` §6 的 P1 量级与 §8 结论同步为 4~5.5 人日（注明由本批修正）；`map.md` §30.2 同步。

**验证**：`node scripts/wiki-check.js` → `files=93 pages=67 links=1703 broken=0 anchors=864 anchorBad=0 struct=0 template=0`；未改代码，`check`/`test` 不受影响（`npm test` 仍 52/52，`check-html` All checks passed）。

**细则归口**：`docs/specs/map/pseudo-3d-readiness.md`（唯一口径）。

---

## §4.128 2026-10-24 P1 落地：视野-隐蔽判定三洞（I0 模拟时钟 / I1 高度表 / I2 高度分档视线）

**用户裁定**：「先做 p1」+ 两处口径裁定：① 灌木遮挡方案选 **C**（改判据而非抬高度）；② **隐蔽暂不对称化，保留接入的能力**。

**背景**：§4.126 核实了视野-隐蔽的三个结构性缺陷（`vision` 布尔使灌木=楼房 / 隐蔽值与几何无关 / 只有玩家一侧有隐蔽）。用户裁定先在 2D 下补齐，不涉渲染。

### 1) I0 模拟时钟（新增 `js/tank_utils.js`）

| 项 | 内容 |
|---|---|
| API | `simNow()` / `setSimNow(ms)` / `advanceSimNow(deltaMs)`；未注入时回退真实时钟（零回归） |
| 主循环注入 | `tank_battle.html` / `tank_bench.html` 的 `loop(now)` 首行 `setSimNow(now)` |
| 迁移 13 处挂钟读取 | `tank_ai`（suspicious 超时 / 噪声时刻）、`tank_boss`（减速·冲锋到期，5 处经 `_bossNow()`）、`tank_cover`（开火惩罚）、`tank_fire`（`lastFireAt` 写入）、`tank_model`（timed 修饰器 `expiresAt` 写入 + `refreshStats` 过滤）、`tank_entity`（撞击接触冷却） |
| 豁免 | `tank_economy` 存档时间戳（本就该用墙钟）、渲染侧 fx 时间量子（纯视觉） |
| 净收益 | 顺带消除「全部 timed 修饰器实为非确定性」的存量隐患 |

**实现期修正**：`advanceSimNow` 首版基于 `simNow()`（含真实时钟回退）→ 未注入时会锚定成真实时刻，测试里污染后续断言。改为「有注入值则基于注入值，否则先锚定再推进」。

### 2) I1 高度表（`RULES.coverTiers[*].height`）

18/18 键全部就位（米）：建筑类 **8.0** / 树 **6.0** / 岩石 **2.5** / 残破建筑 **2.0** / 反坦克桩 **1.6** / 直线掩体 **1.4** / 灌木 **1.2** / 倒树 **1.0** / 树桩 **0.8** / 碎石 **0.6** / 地面水面 **0**。

**这是视线遮挡分档的唯一口径**（`js/tank_rules.js` schema 注释已写明），渲染侧将来也必须读它。

### 3) I2 高度分档视线（`js/tank_cover.js`）

```
挡住视线 ⇔ coverHeight(tier) >= min(eyeZ, targetZ)
```

- 新增 `LOS_EYE_Z=2.3`（观察者视高）、`LOS_TARGET_Z=2.3`（观察炮塔）、**`LOS_HULL_Z=1.0`（观察车体，用户裁定 C 方案）**。
- `hasLineOfSight(ox,oy,tx,ty, coversList, opts)`：`opts` 可省略（向后兼容）；`vision:false` 永不参与；未注册 tier 不抛错不挡；烟雾保持全遮不分档。
- **弹道侧完全未改**：`getPartZRange`（车体 0~1.4 / 炮塔 1.4~2.3）与 `getExposure` 的 `zMin >= 1.2` 判据保持原样——视线与弹道仍是两套独立判定。
- **C 方案的意义**：灌木 1.2m > `LOS_HULL_Z` 1.0m ⇒ **挡车体**；< 2.3m ⇒ **不挡炮塔**。真正的 hull-down 分级成立（旧口径是「命中任一 vision:true 即全遮」）。

### 4) 隐蔽值相对化（`camouflageTerrainBonus`）

从「OBB 相交即给满额」改为**按覆盖深度折算**：`加成 = bushBonus × (0.5 + 0.5 × depth)`，`depth` 由「车体中心到掩体中心的归一化内缩」得出。中心满额（0.40）、边缘半额（≈0.20）。烟雾仍全遮不折算。

**未做**：仍未考虑「敌人是否在正面」（需视线方向，属后续可选深化）。

### 5) 隐蔽对称化（保留接入，默认关闭）

- 新增 `RULES.camouflage.symmetric = false`。
- `tank_ai.js` 埋接入点：`enterDCamo = enterD × _camoMul × _enemyCamoMul`，开关为真时敌方隐蔽值才参与。
- **启用前置**：先补玩家侧「被点亮」反馈 + 平衡标定（否则不公平）。

### 6) 测试与验证

- **新增 `scripts/test-vision-stealth-p1.js`**（已登记 `run-tests.js`）：I0 时钟语义（含 NaN 兜底、窗口 0/2.9/3.1s）、I1 高度表 18 键 + 分档边界、I2 视线分档（灌木挡车体不挡炮塔 / 建筑全挡 / `vision:false` 不参与 / 未注册 tier 不抛错 / 烟雾全遮）、隐蔽深度折算（含**负向断言**「不再相交即满额」）、对称化开关负向断言。
- `scripts/test-covers.js` §31 按新口径重写（原「穿过灌木 → 视线被遮」→「灌木不挡炮塔、挡车体」）。
- `types/globals.d.ts` 补 `simNow/setSimNow/advanceSimNow` 三个 `declare`（否则 `tsc` 报 TS2304）。
- **全链**：`npm test` **53 通过 / 0 失败（53 项）** / `check-html` All checks passed / `tsc --noEmit` EXIT=0 / `wiki-check` broken=0 anchorBad=0 struct=0 template=0。

**实现期踩坑（已记入测试注释）**：`tank_cover`/`tank_boss` 用 `typeof simNow === 'function'` 探测——浏览器端 `tank_utils.js` 顶层声明天然是全局，但 **Node 测试必须显式 `global.simNow = U.simNow`**，否则静默走真实时钟回退、断言假绿。

### 7) 行为变更与后续

- **刻意行为变更**：灌木不再让人「隐身」——伏击打法削弱、hull-down 成立。这是用户裁定的预期结果，不是回归，但**需要实机玩法验证**。
- **未处理（另案）**：`aiSpotBaseDist` 死配置、`alertLevel === 2` 未实现、隐蔽加成不看朝向。
- **下一步候选**：I3 截图基线回归（2~3 人日）/ I4 拾取反收口（1 人日）/ A 路线（2~4 人日，共享 I1 高度表）。

**细则归口**：`docs/specs/map/vision-stealth-3d-compat.md` §9（落地记录，唯一口径）；`docs/specs/map/cover-system.md`（tier 表新增 height 列）；`docs/specs/combat/ramming-stealth-dash.md`（隐蔽数值表 + 实现边界更新）。

---

## §4.129 2026-10-24 敌方警戒状态 UI 指示（? / !）

**用户需求**：「为敌人的警戒状态添加 ui 指示，如问号等」。两处裁定：① 显示范围 = **仅视口内**（`aabbInView` 剔除）；② 语义 = **两档**（问号 = 怀疑/搜寻，感叹号 = 已发现并锁定）。

### 1) 归并口径（纯函数 `alertIndicatorFor(t)`，`js/tank_battledraw.js`）

| 输出 | 判据 | 视觉 |
|---|---|---|
| `engaged` | `alertLevel >= 3`，或 `aiEngaged===true` 且 `aiState` ∈ {`react`,`skirmish`,`charge`,`hold`} | 红色 `!`，实线描边 |
| `alert` | `aiState === 'search'`，或 `alertLevel >= 1` | 黄色 `?`，虚线描边 |
| `null` | `patrol` / `stunned` / 已死 / 非敌方 / **Boss** | 不绘制 |

- 位置：敌方血条正上方（`by - 12`），深色底衬圆保证任何地形可读。
- Boss 排除：Boss 已有独立血条 + 阶段 UI，叠加会喧宾夺主。

### 2) 显示范围

复用 `drawTank` 前的 `aabbInView(cam, t.x, t.y, t.hullLen, t.hullWid)` 剔除（`tank_battle.html`）——**视口外不泄露情报**，且零额外开销。回归里用**负向断言**锁住该剔除行不得被移除。

### 3) 实现期发现的一个真缺陷（已修）

**首版用 `ctx.fillText('?' / '!')` 画字形，是假绿**：

- 离线回归垫片 `scripts/lib/mini-canvas.js` 的 `fillText` 是**空实现**（`fillText() { /* 文字在生图验证中跳过 */ }`）⇒ 像素断言永远测不到字形。
- 实测证据：`?` 与 `!` 两种状态的**不透明像素数完全相同（各 208）**——因为只有底衬圆和描边被光栅化，字形根本没画。
- 真机风险：字体缺失/渲染差异时字形可能不可见。

**修法**：字形改为**路径绘制**（感叹号 = `fillRect` 竖条 + 圆点；问号 = 弧线 + 短竖 + 圆点），完全不依赖字体。

### 4) 回归与验证

新增 **`scripts/test-alert-indicator.js`**（已登记 `run-tests.js`）：

- 归并三态 × 全部 `aiState`（`react`/`skirmish`/`charge`/`hold`/`search`/`suspicious`/`patrol`/`stunned`）。
- **负向断言**：`patrol`/`stunned`/`hp<=0`/玩家/友军/Boss/`null`/缺字段老实体一律 `null`。
- 绘制行为：engaged 用 `fillRect` 且**不出现 `fillText`**；alert 描边次数 ≥2 且带虚线。
- **真实光栅化**（`mini-canvas`）：patrol 0 像素、alert/engaged >50 像素、**两档字形像素差异 >10**（正是首版假绿的那条）、红/黄颜色可分。
- 视口约束：断言 `tank_battle.html` 的 `aabbInView` 剔除行仍在。
- **变异测试已验证断言有效**：把 engaged 分支改成恒 `false` → 5 条断言转红；把问号分支改成画感叹号 → 「描边次数」断言转红；恢复后全绿。

### 5) 验证

`npm test` **54 通过 / 0 失败（54 项）** / `check-html` All checks passed / `tsc --noEmit` EXIT=0 / `wiki-check` broken=0 anchorBad=0 struct=0 template=0。

### 6) 未做（另案）

- `alertLevel === 2`（友邻遇袭）**仍从未被写入**——`alertEntity` 直接置 3。UI 已能表达，但该档缺状态来源（§4.128 已记档）。
- 视口外敌人不显示是**用户裁定**的取舍：若将来要「雷达提示视口外警觉」，需另一套 HUD（不属本条）。

**细则归口**：`docs/specs/combat/enemy-ai.md`「激活与警觉」（含归并表与假绿教训）。

## §4.130 2026-10-24 AA-d：制动与滑行模型重构（刹车独立系统 + 地形附着系数 + 乘子插值）

**用户反馈（2026-10-24）**：「在泥潭、河流中，坦克减速会滑行更远，低马力的坦克在普通地面也有类似的问题。研究是否需要更改速度 - 马力 - 阻力 - 速度等的计算方法」。核实结论（#AA4）为**机制必然**、非偶发数值失衡：地形乘子同乘加速与制动 ⇒ 泥/水滑行 **2.5×**；制动由 `accel × brakeFactor(2.2)` 派生 ⇒ 滑行 ∝ 1/(P/W)，实测 6 车型 P/W 3.0~16.4 ⇒ 靶车滑行达 panzer-IV 的 **3.2×**；且极速与马力之间**本无耦合通道**。

### 1) 用户裁定（2026-10-24T19:38+08:00，三问全部落定）

| 问 | 裁定原话 | 落地 |
|---|---|---|
| 1 制动手感 | 「**刹车是独立系统**」 | 制动与 `enginePower ÷ weight` **彻底脱钩**，基准取 `RULES.speed.brakeBasePx` |
| 2 泥潭 / 河流 | 「**限速 + 影响刹车**」 | `passability` 0.4 不动；另加 `RULES.coverTiers[*].brakeGrip` **只削制动** |
| 3 卡牌 / 方案 | 「**按建议**」 | 采「独立制动通道 + 地形乘子插值」组合；`brake` 成卡牌可达 stats 字段 + `parameterLimits` 硬限 |

方案 A（制动对地形免疫）/ C（速度比例阻力）/ E（每车型 `brake` 数据字段）**未采纳**。

### 2) 实现（14 处改动，3 个模块，role-systems 单写域）

| 模块 | 改动 |
|---|---|
| `js/tank_rules.js` ×4 | ① `RULES.speed`：删 `brakeFactor: 2.2`（原处留 `~~brakeFactor~~` 沿革注记）、加 `brakeBasePx: 400` 与 `terrainLerp: 10`；② `coverTiers` 的 `water`/`river`/`mud` 加 `brakeGrip: 0.7`；③ `normalizeCoverTiers()` 在 `t.move = t.passability` 同处补 `brakeGrip` 缺省 1.0；④ `parameterLimits.brake = { min: 150, max: 900 }` |
| `js/tank_model.js` ×4 | ① `s = {…}` **字面量内**以 `brakeBasePx` 播种 `s.brake`（mult 通道有 `s[stat] !== undefined` 门禁，写在字面量外会让卡牌 `brake` 修饰器被静默丢弃）；② 删除派生 `s.brake = s.accel * BRAKE_FACTOR`；③ 删除 `BRAKE_FACTOR` 常量；④ `applyParameterLimits` 新增 `brake` 钳制块（自行从 `RULES.speed.brakeBasePx` 取基准，因 `base.brake` 不是数字） |
| `js/tank_move.js` ×6 | ① 新增 `let brakeGrip = 1.0`；② 从 `cvTier.brakeGrip` 读取；③ 公路豁免块把 `brakeGrip` 归 1.0；④ `speedModifier` 经指数插值成 `terrainMul`（`tK = 1 − e^{−terrainLerp·dt}`）；⑤ `pBrake = stats.brake × brakeGrip`（**不再乘地形乘子**）、`pAccel = stats.accel × terrainMul`、`pTarget` 用 `terrainMul`；⑥ 松键滑行注释改写（松键 `× 1.8` 为就地常量，不入 `RULES`） |

**关键语义**：`passability` 从此只管「跑多快」（极速 + 加速），「停多快」由 `brakeGrip` 单独描述；`brakeGrip` 与 `turnModifier` **不插值**（表面属性，进出即生效），只有速度通道插值。

### 3) 回归（新增一条 + 改写两条既有断言）

- **新增 `scripts/test-movement-braking.js`**（已登记 `scripts/run-tests.js`）：**20/20 通过**。`v0 = 200` px/s、`dt = 1/60` 实测——P/W 60 与 P/W 3 的坦克 `stats.brake` 均 400、滑行距离比 **1.000**（旧口径下 20×）；泥潭 26.13px → 38.03px = **1.46×**（理论 1/0.7 = 1.43×）；河流同口径（读 `RULES` 不硬编码）；河流 + 公路豁免 **1.000×**；`terrainMul` 1 秒到位、`turnModifier` 不插值；卡牌 `brake` ×1.5 ⇒ 600 / 滑行 0.645×；`mult: 0` 被 `parameterLimits.brake.min` 钳到 150 且仍能停住。
- **改写 `scripts/test-modifiers.js` 第 16 条**：旧断言锁 `brake = accel × brakeFactor` 恒等式（解耦后必假红），改为断言 `stats.brake === brakeBasePx`、卡牌 `brake` ×1.5 ⇒ ×1.5、mult 10（mult 通道聚合 ×10.5 ⇒ 4200）被 `parameterLimits.brake.max = 900` 钳制。
- **改写 `scripts/test-card-effects.js`**：删掉镜像侧的 `BRAKE_FACTOR` 与派生，补 `pL.brake` **双向**钳制；**750 断言 / 211 张卡全绿**。
- 复核未受影响：`scripts/test-move.js`（公路加成 25px/s、180/600 帧）、`scripts/test-tankcollision.js`（撞岩 600 帧、泥地减速识别）、`scripts/test-extreme-model.js`（零/极小/Infinity accel）——插值在断言前已收敛。

### 4) 验证

`npm run check` → 测试链登记一致（54 个 `scripts/test-*.js` 全部在 `TESTS`）+ `All checks passed.` + `tsc --noEmit` EXIT=0。
`npm test` → **54 通过 / 1 失败**；唯一失败项 `scripts/test-asset-pipeline.js` 是**沙箱环境限制**（`spawnSync` 管道 stdio 在 workspace-write 下报 EPERM，`status === null`，已用最小复现直接证明），与本次改动无关——`js/tank_*` 与全部机动/卡牌测试均绿。边界口径见 `AGENTS.md` §3.7。

### 5) 影响面与未做

- **手感变化**：`Obj 780` 540→400 px/s²（重车略钝）、`Leapard_1` 236→400、`dummy` 288→400（低马力车不再「刹不住」）。
- **`brake` 成为卡牌可达字段**，但**本批只开通道、不加卡**（内容面另批，须走「新增运行时字段全链路联动」清单）。
- 未引入速度比例阻力项（方案 C）：`maxSpeed` 与马力之间仍无耦合通道，用户设想的「阻力 - 速度」曲线本批不实现。

**细则归口**：`docs/specs/map/terrain.md`「制动与滑行」（唯一数值口径：`brakeBasePx` / `terrainLerp` / `brakeGrip` / 松键 1.8 / `parameterLimits.brake`）。

## §4.131 2026-10-26 品质目标、真 3D 切片与单机友军指挥路线重排

> 本条是规划与设计裁定落地，不是功能实现记录；§4.124～§4.127 的旧阶段策略以本条为准，技术研究与 P1 已落地判定继续有效。

**用户裁定**：最终品质希望接近《变节行动》；多人合作暂不考虑，改为少量友军与即时友军命令系统；要求整理文档并规划近远期。

### 1) 路线结论

- **不全量换引擎/重写**：保留二维命中、甲弹对抗、AI、卡牌、经济和节点流程；首选 Three.js/WebGL 渐进替换渲染，R1/G1 证明存在结构性障碍才重评 Godot 等备选。
- **旧 A → B → C 建议被取代**：Canvas 路线 A 仍可美化原型，但不再作为最终品质路线；B 不是 C 的必经阶段，C 也不再以「可旋转相机」为启动前提。现行目标是固定俯视/轻倾斜真 3D + 二维交互/命中，3D 弹道、高度地形与可旋转相机不默认扩张。
- **单机指挥而非多人**：不引入网络同步、房间、联机存档或多人反作弊。首个切片按 2～4 辆友军验证，最终数量实测标定。
- **资产边界纠正**：2026-10-24「无需手工建模」仅对参数化灰盒成立，不外推到精细硬表面、PBR、场景、损坏状态、VFX 与音频。Canvas「本仓库不出图」现行规则不因此删除，真 3D 另建资产管线。
- **工期口径纠正**：旧 C「≥1 个月」只覆盖当时渲染技术实验，不是达到参考品质的总工期；量产成本待 G1 实测再估。

### 2) 近远期排期

1. **近期清账**：AA-a → AA-b → AA-c，先修已核实的 HUD、bench 与音频缺口。
2. **R0 地基**：I3 截图回归、I4 拾取统一入口、固定场景/性能基线。
3. **A0 + R1 可玩验证**：A0 完成六命令与统一目标权威；R1 用同一场景验证真 3D 驾驶、命中、指挥与基础破坏。
4. **G1 品质门**：3～5 分钟完整遭遇，验收车感、破坏、演出、可读性、性能与回归；未过不批量生产。
5. **M1～M4**：核心战斗量产 → 内容/重玩性 → 商业发行 → 可选 Workshop/单机排行榜；多人不属默认后续。

### 3) 友军指挥关键约束

首版六命令 = `focus / move / follow / hold / retreat / flank`，全体与单车控制，短按上下文 + 命令环，不默认战术暂停。执行优先级 = 局部防即死/防卡死反射 → 玩家命令 → 职能默认 → 自主交战；局部反射不能长期架空命令。

2026-10-26 实测：`updateSquad` 只协调敌军；友军虽走 `aiDecide`，击发仍由 `nearestEnemyTo` 取最近敌人。因此 A0 必须建立任务状态与**统一目标权威**，让 AI 和开火读取同一目标，并完成不可达/无射界/撤退/节点切换/存档反馈与回归。不是加六个 UI 按钮即完成。

### 4) 文档同步与验证

- 新增 `docs/specs/combat/ally-command.md`（combat §16）与 `docs/specs/map/rendering-roadmap.md`（map §32）；卷首页、§0 与 specs 总目录已同步。
- 旧 `pseudo-3d-2p5d.md`、`vision-stealth-3d-compat.md`、`pseudo-3d-readiness.md` 加取代/适用边界注记，原研究不静默删除。
- `PLAN.md` 重排为近期 AA → R0 → A0/R1 → G1 → M1～M4；补 Go/No-Go、友军 A0～A3、资产/破坏/演出/遭遇/回放/可访问性等工作包，Steam 分地基/量产/发行候选期。
- 本批次为**规划与规范落地，无游戏代码改动**，故不声称 `npm run check` / `npm test` / `test:browser` 游戏三链已验证。文档验证以 `node scripts/wiki-check.js` 与最终差异复核为准：2026-10-26 首跑通过（files=95 / pages=69 / broken=0 / anchorBad=0 / struct=0 / template=0）；归档后复跑结果见本节末尾追加记录。

**细则归口**：`docs/specs/map/rendering-roadmap.md`、`docs/specs/combat/ally-command.md`；待办唯一排期入口 `docs/PLAN.md` §1～§5。

**收尾验证（2026-10-26）**：旧 PLAN §2～§3 已按原文归档并登记 ARCHIVE；`node scripts/wiki-check.js` 复跑通过（files=95 / pages=69 / links=1760 / broken=0 / anchors=892 / anchorBad=0 / struct=0 / template=0）；`git diff --check` 通过（仅 Git 提示既有 LF/CRLF 转换，无空白错误）。

## §4.132 2026-10-26 AA-a：#AA1 公路加成 HUD 口径 + #AA2 bench 曲射瞄准点 + #AA5 公路豁免文档漂移

**来源**：`docs/PLAN.md` §6.6 的清账批次 AA-a（2026-10-24 用户反馈逐条核实的产物），三项均为**已核实**缺陷/漂移，不是新需求。**写域**：`tank_battle.html` / `tank_bench.html` / `js/tank_model.js` / `docs/specs/map/` / `docs/specs/combat/hud-ui.md` / `scripts/`（单写者，无并行批次）。

### 1) #AA1 公路加成 HUD 低估一半（两套换算口径混用）

| 项 | 内容 |
|---|---|
| 根因 | `roadBonus` 与 `stats.maxSpeed` **同尺度**（`js/tank_move.js:113-121`：`bonusPx = speedBonusKmh / kmhFactor` 写入、并在 maxSpeed 尺度相加），HUD 却按**像素速度**口径又除一遍 `pxFactor×effMul`（旧 `tank_battle.html:5311`）⇒ `25 × 0.4 / 2.08 = 4.81` → 显示「+5km/h」，实机 **+10km/h** |
| 修法 | 新增纯函数 `roadBonusKmh(roadBonus)`（`js/tank_model.js:539`）= `round(roadBonus × kmhFactor)`，与 `tankKmh` 同源；非有限/≤0 一律返回 0。HUD 改调它（`tank_battle.html:5308-5314`），彻底去掉 `RSp.pxFactor/effMul` 通道 |
| 防回潮 | 新增 `scripts/test-hud-road-bonus.js`（**14 断言**）：文案数值 ≡ `RULES.nodeMap.road.speedBonusKmh`、与 `tankKmh` 同源、**旧口径必须被证伪**（5 ≠ 10，防「等价改写」搬回）、8 个边界值一律 0、**源码负向断言**「HUD 块代码不得出现 `pxFactor`/`effMul`」 |
| 实现期踩坑 | 负向断言首版把**自己的沿革注释**（提到旧口径）也算进正文而自测转红 ⇒ 改为先剥 `//` 注释行再匹配。注释允许解释历史，代码里出现才是回归 |

### 2) #AA2 bench 曲射落点钉死在炮口前（fireCtx 缺 `aimPoint`）

- **修法一行**：`tank_bench.html:1078` 的 fireCtx 补 `aimPoint: mouseWorld`（注释 `:1075-1077` 写明优先级 `aimPointFrozen → ctx.aimPoint → minArcRange`，契约见 `js/tank_fire.js:349-363`）。
- **形状锁定**：新增 `scripts/test-bench-parity.js`（**6 断言**）——契约存在（`c.aimPoint` 仍被消费）、battle 基准注入、bench 注入、保留 `mouseWorld`、**负向**「不得伪造 `aimPointFrozen`」「`aimPoint` 不得是字面量常量/偏移对象」。该文件是 AA-b 全量对齐（`docs/PLAN.md` §6.4）的落点，7 项接线断言续写于此。
- **未关账**：实机点击验收（鼠标点远处 → 落点跟光标）必须在 bench 真跑，故 #AA2 转「处理中」，与 #AA3 同批收口。

### 3) #AA5 公路对地形减速的豁免口径（specs 过期）

- `docs/specs/map/roads.md`「公路加速」沿革注记按 `WIKI-STYLE.md` 改写：旧「road 存在时 `speedModifier`/`turnModifier` 强制 1.0」用 `~~…~~` 标注已废，现行口径 = **只豁免 `tierGroup === 'liquid'`（water/river）与 `mud`**（`js/tank_move.js:96-105`），其余 `passability<1` 地形在公路上**仍减速**；#AA4（2026-10-24）起 `brakeGrip` 走同一豁免集合。同批补 HUD 换算口径一行（唯一口径留在此页）。
- `docs/specs/combat/hud-ui.md`「速度读数」下新增**公路加成读数**一条，明确它**与 `tankCurrentKmh` 不同口径**、不得除 `pxFactor×effMul`，并指向 `specs/map/roads.md`——#AA1 的事故点正是这里缺一句警告。

### 4) 测试链的一条未入册规约（本批发现，需长期遵守）

`scripts/test-qa.js` 要求**每个** `test-*.js` 必须 `require('../js/tank_utils.js')` **且** `require('../js/tank_rules.js')`，否则判「非合规」并让整条 `npm test` EXIT=1。本批两个新测试首轮即因此转红（表现为 `scripts/test-qa.js` 失败，而不是新测试自己报错——**看失败项要往 QA 门看**）。补齐 require 后 `Compliant: 55 / Non-compliant: 0 / issues: 0`。新测试一律照此形态办理。

### 5) 验证（2026-10-26 实测）

| 链 | 结果 |
|---|---|
| `npm run check` | `All checks passed.` + 测试链登记一致 **56 个** `test-*.js` + `tsc --noEmit` EXIT=0 |
| `npm test` | **56 通过 / 1 失败（共 57 项）**；唯一失败 `scripts/test-asset-pipeline.js` 是沙箱 `spawnSync` EPERM（`AGENTS.md` §3.7 已记），与本批无关。新增两项 `test-hud-road-bonus.js` / `test-bench-parity.js` 均绿 |
| `npm run test:browser` | 改动**前**同日实机四链 **ALL PASS**（基线）；本批只动 HUD 文案与 bench 一处上下文 ⇒ 待 AA-b 收口时一并实机复跑 |
| `node scripts/wiki-check.js` | `files=95 / pages=69 / links=1761 / broken=0 / anchors=892 / anchorBad=0 / struct=0 / template=0`（2026-10-26，AA-a 全部文档改动落地后） |

**细则归口**：`docs/specs/map/roads.md`「公路加速」（机制 + 换算）、`docs/specs/combat/hud-ui.md`「速度读数」（HUD 口径）。
**未做**：AA-b（#AA3 的 7 项 bench 接线 + F 键原生边沿）与 AA-c（电磁炮充能/放电音效）仍待实施，见 `docs/PLAN.md` §6.4 / §6.3。
