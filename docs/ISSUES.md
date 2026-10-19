# Rogue Tank — 工程问题清单（已核实）

> **临时文档**：只存放**待处理 / 处理中**的已核实问题。每条必须有代码证据（`file:line`）与复现/触发条件；绝不收录未核实项。
> 条目**修复并验证有效后**按 `AGENTS.md` 4 步生命周期收尾：结论同步 `DEVELOPMENT.md` / `specs/` → 删除本条目 → 原文归档 `docs/archive/<yyyy-mm>.md` → 联动下一步计划。
> 已解决并归档的历史条目（#1~#26、#44、#49、#60~#101、#A1~#A28、#B1~#B11、#C1~#C4/#C6、#C5、#D1~#D5、#A9、#E1~#E13、#F1~#F6、#G1~#G9、#H1~#H5（2026-09-21 视野批次）、#H1~#H4（2026-09-30 敌军基准/布雷/技能槽批次）、#I1~#I4、#J1~#J4、#K1~#K3、#A16、#L1~#L7（2026-10-06 整车精灵对齐批次）、#M1~#M3（2026-10-08 设计器精灵绘制批次）、#L8 + #M4（2026-10-08 白底清理与炮塔参数重算）、#S8（2026-10-14 CI 校准基线第六次修正）、#S4 + #S14（2026-10-14 公路加速恢复与道路屏蔽减速）、#S9 + #S10（2026-10-14 暂停菜单商店与面板刷新）、#S3-UI（2026-10-14 Boss 血条）、#S6 + #S5（2026-10-14 副武器卡补齐与 Boss 弹种保底）、#S12 + #S1 + #S11 + #S13（2026-10-15 地图视觉四项）、#S2 + #S3（2026-10-15 AI 警觉与 Boss 行为）、#T1~#T6（2026-10-16 拉取后代码审计）、#U1~#U23（2026-10-17 用户反馈批次）、#U24~#U34（2026-10-17/18 第二轮反馈批次 + 布点避路 + 河流互斥 + 河道形态））：见 `docs/ARCHIVE.md` 索引表。
> **2026-10-15 拉取后缺陷清理（未走 ISSUES 条目，直接落 §4 正文）**：本次发现的两个缺陷（#8 TAB 面板 `tanks` 未定义冻结主循环 / #6 上调 `entityMults` 致 `test-modifiers` 夹具失效）**发现即修复并三链验证通过**，未经 ISSUES 中转，结论直接落 `docs/DEVELOPMENT-batches-2026-10.md` §4.79 与 `specs/combat.md` §9.8/§13.4、`specs/map.md` §16。
> **编号重叠说明（2026-10-04 核实）**：`#H1~#H5` 与 `#H1~#H4` 分属**两个不同批次**（2026-09-21 视野等距批次 / 2026-09-30 敌军基准批次），编号发生重叠——与 `AGENTS.md` §2「编号不复用、跨批次延续」相悖，属历史遗留。因归档原文按纪律不可回改、且编号已被 `DEVELOPMENT.md` §4.40 与 `specs/combat.md` §13.1~§13.4 交叉引用，故**保留原编号 + 在此按日期与主题区分**（引用时须带批次日期），不再另案重编。

---



## 当前待处理问题
### #V1 `dump-cover-refs.mjs` 用基础层尺寸烘焙 canopy 层，导致 `fallen_canopy` 基准质心偏移 3.06px（2026-10-19 核实）

- **状态**：待处理（非阻塞；不影响运行时，因为 `assets/` 无 cover 产物、实际走程序化回退）
- **证据**：
  - `tools/dump-cover-refs.mjs:49` —— `const can = A.bakeAssetCanvas(key, def.w, def.h, 'canopy');` 传入的是**基础层** `def.w/def.h`。以 `fallen` 为例：基础层 `w:58, h:9`（`js/tank_assets.js` 的 `ASSET_DEFS.fallen`），而 canopy 层有自己的 `canopyAnchorX:1.0, canopyAnchorY:15.9`，其内容包围盒远大于 58×9。
  - 症结表现为 `tools/cover-refs.json` 里 `fallen_canopy` 的 `centroid` 为 `[14.85, 11.04]`，而实际烘焙产物质心恒为 `[11.79, 11.06]`——`covers-anchor-check.py` 因此报 `内容质心偏离烘焙基准 3.06px > 2.0px`。
  - `scripts/test-cover-gen.js` 的断言「10 张产物质心均在烘焙基准 ±2px 内」随之恒红（`npm test` 唯一失败项）。
  - `prepare_covers.py` 另报 `fallen_canopy: 内容不居中于锚点 (dx=11.5, dy=-0.5)`，是同源的第二个症状。
- **根因**：canopy 层的烘焙画布应由「canopy 自身内容的包围盒」决定，而不是复用基础层的输入尺寸。`bakeAssetCanvas` 的第 2/3 参数是**绘制尺寸**（`bakeFn(pctx, {x,y,w:W,h:H})`），不是「探针起点」。
- **影响**：仅影响 `tools/cover-refs.json` 的 `*_canopy` 系基准与 `test-cover-gen.js` 验收；运行时（程序化烘焙通道）不读该 JSON，玩家无感知。**一旦真正出 canopy 贴图落盘，会按错误基准缩放错位**——所以出图前必须修。
- **修法（待定）**：让 `dump-cover-refs.mjs` 对 canopy 层用独立的绘制尺寸（可从 `canopyAnchorX/Y` 与 `bakeCanopy` 的实际绘制范围推导，或给 `ASSET_DEFS` 增加显式 `canopyW/canopyH` 字段）；修完重导出基准并复跑 `node scripts/test-cover-gen.js`。
- **旁证**：`docs/PLAN.md` §2.5 已记录「`tools/cover-refs.json` 需随烘焙代码同步重导出」；本次已重导出（`barricade` 由此转 OK），本条是重导出之后**仍然**存在的那部分，性质不同，故单独立条。

### #V2 `test-render.js` 依赖的 paint/绘制符号在 HEAD 缺失——⑫/①/② 全链无法执行（2026-10-19 核实）

- **状态**：待处理（阻塞 `scripts/test-render.js` 全链；与 #TEX17 无关的预存回归，stash 对照排除）
- **证据**：
  - `scripts/test-render.js`（HEAD 版）引用 `P.getSpriteScale` / `spriteView1x` / `P.setPaintMaterial`（①b 段，#TEX12/#TEX13 回归断言）；
  - `git show HEAD:js/tank_paint.js` = 903 行旧版：无 `SPRITE_SCALE` / `paintMaterialPass` / `paintEdgeWear` / `_texPatch`（§22.1/§23 记载的 3× 超采样与材质层实现整体缺失）；
  - `js/tank_battledraw.js`（HEAD）同样缺 `drawPartSideWall` / `drawTankGroundShadow` / `drawTankRimLight`（§22.8 记载的 2.5D 侧壁/车底影），且 `renderHullTexture`/`renderTurretTexture` 未导出（已由 #TEX17 顺带补回导出，函数本身在）；
  - 实跑 `node scripts/test-render.js` → `TypeError: P.getSpriteScale is not a function`（test-render.js:102 前置依赖），exit 1，⑧a/⑧b 等后置断言全部无法执行。
- **根因**：§4.90~§4.93（#TEX6~#TEX13）记载的 `js/tank_paint.js` / `js/tank_battledraw.js` 改造**未出现在当前仓库历史**（HEAD `e389ebd` 即为旧版）——文档记载与代码现状脱节，或改动发生在未合并的 worktree/分支后被丢弃。
- **影响**：① `test-render.js` 全链红（exit 1），无法作为 #TEX14~#TEX17 植被/栅栏改动的回归裁判；② §23 的贴图审核标准（v2/v3）当前基线「97/100」无法复现；③ 浏览器实机不受影响（页面按共享脚本加载，`SPRITE_SCALE` 等仅离线回归链消费……但 `paintMaterialPass` 类材质层视觉在实机同样缺失——玩家看到的坦克是旧版平涂+老材质）。
- **复现**：`node scripts/test-render.js` → exit 1（`TypeError`）。
- **修法（待定，属 role-render-fx 写域）**：按 §22.1/§22.6/§22.8 现行口径重建 `js/tank_paint.js`（SPRITE_SCALE 3× 超采样 + `paintMaterialPass` + `paintEdgeWear` + `_texPatch`/`_texGrain`）与 `js/tank_battledraw.js`（`drawPartSideWall`/`drawTankGroundShadow`/`drawTankRimLight`），或由 role-verify-docs 裁定「回退 test-render 到 HEAD 可执行子集 + 文档降级 §23 基线」。
- **关联**：#TEX17（§4.102）验证改用定向 mini-canvas 探针替代 test-render ⑧a/⑧b；`scripts/lib/mini-canvas.js` 的 `drawImage` CTM 缺陷为独立问题，已于 #TEX17 修复（§22.6 补记）。

---

## #W 批次（2026-10-19 用户实机反馈 + 代码审计，均带复现）

### #W7 `applyShield` 的 hp/时长参数是死参数（2026-10-19 已核实）

- **状态**：待处理（P1，阻断「应急护盾」等所有护盾可调参设计）
- **证据**：`js/tank_shield.js:46-59 applyShield(t,opts)` **只读** `opts.omni` / `opts.dir`，其余（hp/arc/时长）**硬取 `RULES.abilities.shield`**。而调用方 `js/tank_abilities.js:248-256` 明明传了 `hp/arc/dirDuration/omniDuration`。
- **实测**：传 `{hp:999, arc:1.0, dirDuration:10}` → 实际得到 `hp:150, t:8, arc:1.047`。
- **加重**：`RULES.abilities.shield` 里**根本没有 `hp` 键**（只有 `absorbCap`），故 `abilityCfg.hp` 恒 `undefined` ⇒ 这条链目前**完全空转**。
- **影响**：任何「护盾可调参」的卡牌写 `ability.params` **一律无效**。
- **注**：`applyShield` 产出的 shield 对象**同时带吸收池 hp（`:51`）与时长 t（`:52`）**——结构上已能满足「持续 10s 的护盾」，只差把参数接通。

### #W8 `replaceAmmo` 零校验（2026-10-19 独立核实成立）

- **状态**：待处理（P1）
- **证据**：`js/tank_cards.js:119-124` 的 ammo 分支只校验 `key/field/mode/value`，**完全不校验 `replaceAmmo`**。
- **实测**：`replaceAmmo` 取 `"NOT_AN_AMMO"` / `"apds"`（错边）/ `123` / `null` **四种全返回 `[]`（放行）**。
- **影响**：弹种链「显式升级」是唯一可信通道，却是唯一零守卫字段——拼错即静默 no-op（玩家拿了卡没动静），写错边即错槽替换。

### #W9 死键：`super_speed` / `super_fire_control` 无任何卡牌可授予（2026-10-19 已核实）

- **状态**：待处理（P1，与 `docs/specs/combat.md:109`「7 个键中不存在无激活路径的死键」直接冲突）
- **证据**：`js/tank_abilities.js:54` 的 `ABILITY_KEYS_RUNTIME` 含 7 键，但 191 张卡里 `type:"ability"` 只覆盖 `repair/medkit/extinguish/artillery/overdrive/shield/deploy_cover/aps` 共 8 个键（`ability_artillery_*` 四张也都是 `artillery`）。`js/tank_abilities.js:211` 的 `if (!hasAbility(t, key)) return {ok:false, reason:'no-ability'}` + `tank_mvp.html:1175` 技能槽反向用 `hasAbility` 过滤 ⇒ 这两个键**在正式游戏中不可达**。
- **测试为何抓不到**：`scripts/test-rework-r1.js:58-59` 手工把这两个键塞进 `cardEffects` 再断言激活成功——测的是「塞进去之后能用」，从未校验「现实中能不能拿到」。

### #W11 文件级事实（供修复时定位，非独立缺陷）

- `docs/specs/combat.md:17` 仍写 `reactive_armor`「一次性消耗」（过期口径），与 `js/tank_physics.js:228-251` + `docs/specs/cards.md:41` 的「拦截后再充能 60s」**互相矛盾**——属文档冲突，随「应急护盾」改造一并重写（见 `PLAN.md` §6）。
- `docs/specs/cards.md:40` passive 键列表仍含 `'commander_sight'`，但 `js/tank_cards.js:59 PASSIVE_KEYS` 已删该键（#J3 视野系统退役）。
- `docs/specs/cards.md:32` 未写「带 `field` 时恒不推断」；代码 `js/tank_cards.js:371-373 / 694 / 744-746` 三处**已同口径**。
- `.dsh/skills/role-combat/SKILL.md` §3 仍把 `shell.dec` 列为必守不变式，但该字段已于 2026-09-20 #E3 整体删除（`js/tank_fire.js:53-56` 自陈）——**角色卡过期指引**。
- `.dsh/skills/role-systems/SKILL.md` 写「新增 Boss aiMode = 三处改动」，实际是**四处**——`js/tank_boss.js:101 validateBossStage` 另有一份硬编码 `AI_MODES = ['hold','charge','skirmish']`；只改三处会被 `validateBoss` 判非法。

### #W13 Boss 全局交战已实现，但 hold 阶段 `anchorRange` 是死配置（2026-10-19 已核实）

- **状态**：待处理（P2；用户要求「boss 需要全局进入交战状态、尝试靠近玩家后按战斗模式移动」——**前半已满足**）
- **已满足的部分**：`makeBossEntity` 出生即 `aiTriggerDist=99999 / aiEngaged=true / aiState='chase'`（`js/tank_boss.js:271-273`）；`aiDecideEnemy` 有 Boss 强制分支（`js/tank_ai.js:540-543`）与末尾 `if(t.isBoss) out.move=1`（`:1123`）；脱战阈值 `exitD = trigDist×1.25 ≈ 124998px`（`:633/691`）实际不可能脱战，且 `:691-701` 的脱离分支对 Boss 显式豁免。
- **缺陷 ①**：hold 阶段「靠近玩家后按模式移动」依赖 `_passiveDefend`（`allyEngageRange` 460）+ #S3 前压补丁（>×1.2 即 552px 时 `move=0.4`），但 4/5 份 boss 的 `stages[].ai.params.anchorRange`（声明 300/350/0）**全仓库无任何消费者**（grep 仅命中 `test-boss.js:102` 夹具）⇒ 改 `anchorRange` 调 Boss 驻守距离**完全无效**。
- **缺陷 ②**：`aiState='chase'`（`js/tank_boss.js:273`）**无任何读点**，首帧即被覆盖 ⇒ 死状态。
- **注**：`docs/specs/boss.md:63` 称 Boss「始终 move=1 推进」——**hold/skirmish 在 `:572/:599` 提前 return，走不到 `:1123`**；文档描述会让调参者误以为 Boss 恒为 `move=1`（实际按阶段语义移动，这是对的）。

### #W14 `aimSpeed` 两套量纲导致难度准度通道近乎失效（2026-10-19 已核实）

- **状态**：待处理（P1，敌军准度维度）
- **证据**：`applyEnemyAppearanceAndStats` 不写 `base.aimSpeed`（`js/tank_model.js:660-679`），`makeTank` 的 base 也无该键（`:348-359`），故 `computeStats` 回落到 `RULES.spread.shrinkRate = 0.15`（`:67`）；而难度表 `entityMults.aimSpeed = [0.8, 1.35]`（`js/tank_rules.js:1100`）是为「真实坦克基准 1.0~2.5」设计的。
- **后果**：敌军实际缩圈 0.12~0.20/s，满难度 ×1.35 只多 +0.05 ⇒ **难度对敌人准度的调制基本为零**（玩家 tiger-I `aimSpeed=1.5` 是敌军的 7~12 倍）。
- **测试为何抓不到**：`test-map.js:84` 只断言表端点插值，不断言落到实体上的绝对量纲。

### #W15 腐尸级死配置清单（改之无效，2026-10-19 已逐个核实）

> 用途：这些字段「写了不生效」，调参者极易踩坑。修复某系统时应顺手清理或标注。

| 字段 | 位置 | 状态 |
|---|---|---|
| `RULES.parameterLimits.reload.max = 3.0` | `js/tank_rules.js:1279` | **零消费**（只有 `min` 被读）。无测试断言 |
| `RULES.coverTiers.fullDowngradeCap = 0.30` | `js/tank_rules.js:670` | **已废弃**，`js/tank_nodegen.js:3148-3150` 明写「已改为无操作」。注释仍自称生效 |
| `RULES.nodeMap.road.branchCurveAmp` | `js/tank_rules.js:603-604` | 自陈「死配置待删」，全仓仅 2 处命中（定义 + 一处注释） |
| `RULES.drowning.warnAt = 3` | `js/tank_rules.js:141-142` | **零消费**（全仓仅定义处 1 命中） |
| `RULES.breach.heCoverDmg = 1` | `js/tank_rules.js:157-158` | **零消费**（`js/tank_fire.js:896-899` 固定传 1） |
| `RULES.coverRules.deterministicOnly` | `js/tank_rules.js:85-87` | **零消费**，注释自称「消费方：stepShells」，实际从不读 |
| `RULES.coverRules.mediumHullExposure` | `js/tank_cover.js:727-728` | 字段**在 RULES 中不存在** ⇒ 恒 undefined ⇒ 恒返回 0.0 |
| `RULES.coverHugDist` | `js/tank_rules.js:9`、`js/tank_cover.js:5`（仅注释） | 全仓**无定义**，A1 双档模型已是历史 |
| `stages[].ai.params.anchorRange` | 4 份 `bosses/*.json` | 无消费者（见 #W13） |
| `economy.startScore` | `js/tank_cards.js:406-407` | `ECONOMY_FIELDS` 允许写入 `tank.runStartScore`，但**全仓无读点**（当前无卡用，加一张即静默无效） |
| `parameterLimits.aimSpeed.min` / `trackLock.max` | `js/tank_model.js:122-129` | **单侧钳制**：aimSpeed 只钳 `max`、trackLock 只钳 `min`，另一侧声明了但永不生效 |
| `restartRun` | `js/tank_flow.js:104-114` | **正式页面无调用点**（仅 `test-flow.js` 与类型声明）；`pause` 态调用会抛 |
| `VILLAGE_SOLID` 含 `'half'` / tier 权重表含 `half` | `js/tank_nodegen.js:1658, 2322` | 靠 `:3202` 的 `continue` 丢弃，不可达 |
| bridge 特判 ×7 处 | `js/tank_nodegen.js:2721/2982/4298/4360/4379/4399`、`js/tank_fire.js:757-768` | bridge **已不再产出**（`:4218-4220` 自陈）；`tank_fire` 的 45° 特判**双重不可达**（还要求 `mode==='solid'\|'single'`，而 bridge 的 `shellBlock:false` 派生为 `'pass'`） |

### #W16 地图生成侧口径不一致（P0 候选，需先补断言）

- **状态**：待核实（audit-mapgen 判为 P0，但需补断言才能确认影响面）
- **① `covers` 的 `w/h` 与 `verts` 语义不一致**：`js/tank_nodegen.js:779-785`（river）与 `:1306`（road chain）产出的是 `verts` 局部多边形 + `w/h` = 多边形 bbox。`js/tank_cover.js:149-154 coverCorners` 对 verts 优先走 `polyCorners`（正确），但 `:197-205 splashCoversAt` 只用 `cov.x/y` 中心 + 纯距离、`:117-136 destroyCover` 的残骸尺寸只按 `residueW/H` 缩放。⇒ HE 破障在 strip（covers 可达 1100）上可能出现「打中了没毁 / 没打中却毁了」。
- **② 未注册 tier 静默穿模**：`js/tank_fire.js:394/:535` 用 `T[tier].mode` 判据，若 cover 的 tier 不在 `RULES.coverTiers` 里，`T[tier]` 为 undefined ⇒ `mode` 为 undefined ⇒ **实弹穿过本该挡弹的建筑却不报错**。触发：新增 tier 或旧存档 tier。
- **建议**：先补断言（用 `coverEnvelope` 做中心点归属判定），再谈修复——不要直接改判定逻辑。

### #W17 `applyShield` / `getExposure` 等契约细节（供修复时注意）

- **`getExposure` 双消费不同口径**：`js/tank_fire.js:545`（prediction，传 `hit.t` 作 `cutoffDist`）是真消费；`:626` 取了 `getExp` 但**函数体内一次都没调用**（全文件仅 545 一处调用）⇒ 死绑定。另 `js/tank_cover.js:716-728` 还留一段 `validHits` 路径，当前 tier 数据下不可达，一旦恢复 half/grad 数据会绕回「保守 0 = 全遮蔽」。
- **`coverBlockInfo` 双算**：`js/tank_cover.js:731-735` 先经 `getExposure`（内部再算一次）后 `hits: findCoversOnPath(...)` 又算一次；`:738/752/771` 各自再跑。`findCoversOnPath`（`:639`）直接用全局 `covers` 全表遍历、**不走空间网格** ⇒ strip 1100 covers 时是每帧 O(covers)。
- **`coverEnvelope` 未做 WeakMap 缓存**（`:505-532`，对比 `:268-270` 的 `_coverPolyCache`）——若新功能每帧对落点做掩体查询，这是必须先解决的热点。
- **`COVER_DIRECTION_TOLERANCE=16`** 硬编码在 `js/tank_cover.js:710`，未上提 RULES，且**无测试锁**（`test-covers.js` 未 Grep 到该字面量）。
- **`js/tank_move.js:26-42` 的 `passability===0` 分支是死代码**，且 `:31` 取 `COVER_TIERS[cover.tier]` **未判空**——tier 未注册时 `:37` 的 `cvTier.move` **抛 TypeError**，直接中断该帧 `driveTank`。
- **`js/tank_move.js:45-47` 公路时强制 `speedModifier = 1.0`** ⇒ 任何走 `speedModifier` 通道的地形减速在公路上被静默清零。
- **`js/tank_move.js:18-25` `immobT>0` 早退**跳过 `resolveCoverCollisions`/`advanceTracks`：履带被打断期间若与 solid 岩石重叠，**不做 MTV 推出**。

### #W18 文档与代码的既存冲突（随对应批次修，不单独立项）

- `docs/specs/map.md:122/135/167` 把 `coverWorldScale` 写作 `{half,full,barricade}`，代码为 `{half,full,building,barricade}`（`js/tank_rules.js:579`）——**文档漏了 `building`**，而 `js/tank_nodegen.js:1664-1665` 正消费它。
- `docs/specs/map.md:620` 出生点判据写作 `passability===0 || shellBlock`，实现为 `passability===0 || shellBlock===true || shellBlock==='single'`（`js/tank_map.js:483-496`）——表述丢了 `'single'` 这一支。
- `docs/specs/map.md:15` 仍写「桥梁 `waterBridgeChance` 概率插入」，代码 `js/tank_nodegen.js:3463-3464` **仍在算概率**但结果被丢弃（`:4218-4220` 声明桥梁体系已移除）。
- `docs/specs/map.md:425` 与 `js/tank_rules.js:133` 的 bridge 定义仅「兼容存档」，但 `js/tank_nodegen.js` 7 处特判仍在。
- `docs/specs/boss.md:63` 称 Boss 恒 `move=1`（见 #W13）。
- `docs/specs/combat.md:97`（#U43 条目）称副炮塔「弹道起点与炮口特效都已改用副炮塔」，但曳光起点 `fx/fy` 仍错（见 #W3）。
- `scripts/test-rework-w5.js:25,32,36` 注释仍写 `reload 下限 0.5s`（实为 1.0），因断言引用 `RL.min` 变量而照常通过 ⇒ 注释腐烂且永不失败。
