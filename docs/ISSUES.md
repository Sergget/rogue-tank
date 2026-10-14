# Rogue Tank — 工程问题清单（已核实）

> **临时文档**：只存放**待处理 / 处理中**的已核实问题。每条必须有代码证据（`file:line`）与复现/触发条件；绝不收录未核实项。
> 条目**修复并验证有效后**按 `AGENTS.md` 4 步生命周期收尾：结论同步 `DEVELOPMENT.md` / `specs/` → 删除本条目 → 原文归档 `docs/archive/<yyyy-mm>.md` → 联动下一步计划。
> 已解决并归档的历史条目（#1~#26、#44、#49、#60~#101、#A1~#A28、#B1~#B11、#C1~#C4/#C6、#C5、#D1~#D5、#A9、#E1~#E13、#F1~#F6、#G1~#G9、#H1~#H5（2026-09-21 视野批次）、#H1~#H4（2026-09-30 敌军基准/布雷/技能槽批次）、#I1~#I4、#J1~#J4、#K1~#K3、#A16、#L1~#L7（2026-10-06 整车精灵对齐批次）、#M1~#M3（2026-10-08 设计器精灵绘制批次）、#L8 + #M4（2026-10-08 白底清理与炮塔参数重算）、#S8（2026-10-14 CI 校准基线第六次修正）、#S4 + #S14（2026-10-14 公路加速恢复与道路屏蔽减速））：见 `docs/ARCHIVE.md` 索引表。
> **编号重叠说明（2026-10-04 核实）**：`#H1~#H5` 与 `#H1~#H4` 分属**两个不同批次**（2026-09-21 视野等距批次 / 2026-09-30 敌军基准批次），编号发生重叠——与 `AGENTS.md` §2「编号不复用、跨批次延续」相悖，属历史遗留。因归档原文按纪律不可回改、且编号已被 `DEVELOPMENT.md` §4.40 与 `specs/combat.md` §13.1~§13.4 交叉引用，故**保留原编号 + 在此按日期与主题区分**（引用时须带批次日期），不再另案重编。

---

## 当前待处理问题

### #P1 strip 河流生成不连续：路河交叉段撞键被静默丢弃，80% seed 出现河面空洞（2026-10-11，**已修复 2026-10-12**）

> **修复验证**：`node scripts/audit-river-continuity.js` 60 seed 输出 0 空洞（修复前 339 处）。结论见 `DEVELOPMENT-batches-2026-10.md` §4.67。原文已归档 `docs/archive/2026-10.md`。

- **现象**：横向 strip 战场的河流沿程出现 ~200-300px 的空洞段，河看起来断成几截。
- **核实结论**：成立，且根因不在渲染而在**生成层丢段**。经 60 seed 实测：**48/60（80%）seed 至少 1 处河水中段空洞**（相邻保留河段中心距 >200px 且连线中点不被任何同组河段/桥覆盖），合计 339 处。
- **根因**：`js/tank_nodegen.js:2939-2984` 路河交叉处理中，`bridgeSeen` 以 `round(s.dx/200)+':'+round(s.dy/200)` 网格键去重；当第二段命中道路的河段与更早河段/桥**同键**时，`if (!bridgeSeen.has(key))` 整块跳过，**既不建桥也不回填 river**——注释（`tank_nodegen.js:2984`「该河段被桥替换（或保留），不追加 river（已在上处理）」）对撞键分支不成立：该分支什么都没处理。`isBranchPointClear=false` 时保留 river 的兜底（`tank_nodegen.js:2942-2948`）只在**未撞键**路径里。
- **证据**（插桩实测，60 seed，`generateStrip(0.5)` 全程）：
  - 撞键静默丢段 **397 段**；339 处空洞 **100%（339/339）** 在 200px 内存在对应丢段日志（逐洞关联）。
  - 全部空洞处河段均「压路=true」（命中 `hitRoad` 的 OBB 判定后进入该分支）。
  - 重跑检测：`node scripts/audit-river-continuity.js`（60 seed，输出受影响 seed 数与空洞数；修复后应为 0）。
  - 河段渲染按 `segments` 逐段绘制（`js/tank_battledraw.js:221-238` water-chain），缺段直接可见为空白。
- **影响**：河流视觉断裂；溺毙水域（`passability: 0.4` + `RULES.drowning`）沿程覆盖不一致，断口处坦克「走出河」再「走进河」，读图误导。公路不受影响（路网链段每段必落盘，`_emitRoadChain` 无去重丢段逻辑——`js/tank_nodegen.js:874-891`）。
- **复现**：`node scripts/audit-river-continuity.js`；或任取 seed=4/12/13/34/44/51（strip 左缘 138→398px 处恒定断口 260px，`placeStripRivers` H 形河首段撞键）。
- **修复方向**（参考公路逻辑）：桥只作**视觉替换**，不删河段数据——先完整生成河链（每段必落盘，等价 `_emitRoadChain` 的「每段必进 out」契约），交叉处打 `bridge` 标记由渲染层压盖；或撞键分支至少回填 river 段（与 `isBranchPointClear=false` 分支同款兜底）。修复后跑 `scripts/audit-river-continuity.js` 应 0 洞，并回归 `scripts/test-strip.js` §6c。

### #Q1 平行去重误删同链相邻段 → 斜向公路链内断口（2026-10-12，已修复归档）

> 原文已归档 `docs/archive/2026-10.md`（2026-10-12 行）；结论见 `DEVELOPMENT-batches-2026-10.md` §4.64。审计复跑：`node scripts/audit-map-gen.js` 九类硬检查全零。

> **#Q1~#Q6 已于 2026-10-12 修复并归档**（连同连锁修正：prune 地形层豁免正名「地形标签必产出」契约 + calibration 第五次重锚；验收四链全绿 audit-map-gen 九类硬检查全零 / audit-map-drive 动态跑图全绿 / npm run check EXIT=0 / npm test 43/43）——原文见 `docs/archive/2026-10.md`（2026-10-12 行），结论见 `docs/DEVELOPMENT-batches-2026-10.md` §4.64。

> **#O1/#O4 已于 2026-10-10 解决并归档**——原文见 `docs/archive/2026-10.md`，见 `docs/ARCHIVE.md` 索引表。
> **#L8 已于 2026-10-08 解决并归档**（白色残留清除 + 两车炮塔对齐参数重算；`hummel_turret` 上下两块经用户澄清为设计如此，误判已撤回）——原文见 `docs/archive/2026-10.md`，结论见 `docs/DEVELOPMENT-batches-2026-10.md` §4.56。

> **#S 批次**（2026-10-14 用户反馈 14 项，全部经代码取证核实；2026-10-14 晚在 2a872a4（8 个新提交之后）**二次复核**，行号与结论已同步新代码；#S8 已修复归档）：

### #S1 河流"没有闭合"（支流末端悬空）——待处理
- **证据**：`js/tank_nodegen.js:736`（干流汇入点 `jy`"近似：用同参数正弦估算"）、`:746`（`hasLake = false`，湖泊闭合已被删除）、`:763`（源头收分至 0.55）。
- **根因**：支流末端坐标用原始正弦控制函数**估算**而非干流实际 Catmull-Rom 采样曲线；无"支流末段与干流相交"验证/缝合逻辑。**2026-10-14 复核**：数据层空洞已随 #P1（b1bf362，`nodegen.js:2982` bridgeSeen else 回填）修复——`audit-river-continuity.js` 60 seed 0 空洞；剩余的是**支流-干流几何缝合**问题（估算代码原样保留）。
- **复现**：生成含 H1T 支流的节点，观察支流末端与干流不相交。

### #S2 敌方 AI 警觉层级缺失（5 层级只实现约 1.5）——待处理
- **证据**（2026-10-14 在 2a872a4 复核，`js/tank_ai.js` 未动）：`js/tank_ai.js:1190-1195`（`propagateAlert`：600px 单跳传播，无行为升级）；`js/tank_fire.js` 开火路径从不调用 alert；全仓库 grep `shotNoise|muzzleAlert|noiseAlert` 零命中；`js/tank_rules.js:856` `searchMinLoSBlocked` 无消费方、`:861` `alertRadius: 600`；`js/tank_ai.js:671` `oscillate` 为常量死代码；search（`:668-695`）一次性走向最后已知点、无扫视、无重搜；patrol（`:620-626`）无 hunt 逻辑。
- **层级现状**：①玩家靠近 ✅（距离+LoS，700~1120px）/ ②玩家射击 ❌完全缺失 / ③射击 AI 附近（近失弹）❌缺失 / ④附近队友被攻击 ⚠️有但弱（600px 单跳、无行为升级）/ ⑤自身被攻击 ⚠️有但弱（仅 engaged+延迟减半，无受击专属行为）。
- **根因**：警觉唯一输入是"受伤"与"距离+LoS"；无声音/开火暴露通道；`aiEngaged` 二值开关，无"可疑→警戒→交战"渐进状态。

### #S3 Boss 战难度与 Boss HP 条 UI ——待处理
- **Boss 血量（参数上不低，体感弱另有根因）**：`js/tank_rules.js:1023-1027` `hpMul: 9`（2026-10-01 由 8 上调；另 entityMults.maxHp 上限 1.4→1.7 叠加后总血量约 +29%~+36%）；`bosses/*.json` 5 个 Boss 全显式 9。体感弱更可能来自弱点 `dmgMul ×1.5`+无视跳弹+穿深+15。
- **搜索欲望低（证实）**：hold 阶段 `js/tank_ai.js:554` 原地 `_passiveDefend`；skirmish 阶段 `:558-560` keepDist=640 只后退不接近。
- **射击频率**：`fireRateMul: 0.6` → 1.67× 已较快；barrage 仅 boss_commander 有（`bosses/boss_commander.json:7`，9s 间隔）；`fortify`/`skirmish_long` 风格在 `updateBossBehavior` 无专属行为分支。
- **召唤频率**：`hpFrom: [1.0, 0.66, 0.33]` 3 波血量门控（`js/tank_boss.js:436-473`），非持续生成。
- **Boss HP 条 UI（证实缺失）**：全仓库 grep `bossHp|bossBar` 零结果；唯一血条是通用浮动条 `js/tank_battledraw.js:781-798`（44×5px，无数字）。需求：屏幕下方中央带条+数字。
- **实施顺序**：①HP 条 UI → ②追击欲望 → ③炮击/召唤频率 → ④hpMul 微调最后。

### #S5 弹种升级节奏慢；Boss 战后无"必给 1 个弹种升级选项" ——待处理
- **证据**（2026-10-14 在 2a872a4 复核，1ff0b11 #N2 后机制收紧）：弹种升级卡 12 张（`cards/ammo_upgrade_*.json`），三链串行禁跳级；保底概率 **0.4→0.18**（`js/tank_rules.js:481`），新增 `ammoUpgradePace: { decay: 0.55 }`（`:483-484`）——保底概率与权重抽样双通道随本局已获升级数 ×0.55ⁿ 衰减；Boss 追加轮仍走 `bossLootPool()` 稀有度下限过滤（`tank_mvp.html:1648-1650`），"Boss 战后必给 1 个弹种升级选项"机制仍不存在。
- **根因**：#N2（用户反馈"弹种升级太快"）把节奏压过头——保底 0.18 × 衰减后中后期几乎拿不到升级卡；Boss 轮"稀有度下限 × 链资格"双重过滤与串行链互斥依旧。修复：在 Boss 追加轮加独立"必含 1 张链上可解锁升级卡"路径（绕开稀有度下限与 pace 衰减）。

### #S6 副武器属性升级卡缺失 ——待处理
- **现有 8 张**（4 install·epic + 4 upgrade·rare；2026-10-14 在 2a872a4 复核，1ff0b11 新增 3 张 mod 卡与本条无关，副武器卡仍是 8 张）：迫击炮射程/溅射 ✓、导弹冷却 ✓、火箭发射数量 ✓。
- **缺失**：导弹锁定速度 `lockSeconds`（`js/tank_weapons.js:41` defaults 已有、`:202-203/251` 消费，无卡用）、火箭飞行速度 `speed`（`:283` 消费 `??450`，无 defaults、无卡用）；同类可调无卡参数还有 missile `lockArcDeg`/`range`、mortar `accuracySpread`、rocket `burstInterval`/`aoe`/`range`；`turret` 副武器零卡牌。
- **根因**：`mergeStatOverrides` 通用（`js/tank_cards.js:154-171`），缺的是卡牌 JSON 内容，参数通道就绪。

### #S7 双管强度评估 ——评估完成（暂不改动）
- **数值对照**（相对 standard=1.0；`WEAPON_DEFAULTS`，`js/tank_weapons.js:12-47`）：持续 DPS 双管 1.00 = 电磁炮 1.00 < 弹夹炮 1.08~1.17。按持续 DPS 双管**不过强**。
- **体感来源**：一次齐射 2.0 alpha（全游戏最高单次点击伤害）+ 双发独立穿深判定（"至少一发穿"概率高）；与 #S2（AI 呆板）联动放大体感；电磁炮优势（×2.5 弹速、×2.0 穿深、贯穿）是情境性的。
- **结论**：暂不削 DPS；如调应调爆发体感；待实战/TTK 数据支撑。本条不转入实施，留观察。

### #S9 ESC 菜单商店按钮缺失 ——待处理
- **证据**（2026-10-14 在 2a872a4 复核）：`tank_mvp.html:444-453` pauseScreen 仍仅 3 按钮（继续/控制/终止结算）；2026-09-14 §4.12 摘除 `pauseShopBtn`（`js/tank_screens.js` `buildPauseViewModel`）；§4.13 商店回归只落地结算内嵌版，ESC 菜单入口漏恢复。
- **根因**：退场时摘除，回归时漏恢复 ESC 菜单入口。

### #S10(a) HP 升级后显示 250/249 ——待处理（产品决策：购买 hp_up 回满至新上限）
- **证据**（2026-10-14 在 2a872a4 复核）：`buyRunShopItem` → `addModifier` → `refreshStats`（`js/tank_model.js:296`）：`tank.hp = min(maxHp, hp + dHp)`；HUD `tank_mvp.html:3497`。
- **根因**：#A12 差量同步设计——上限提升时当前 hp 只按增量抬升不回满；结算界面不回血（进节点才满血 `tank_mvp.html:1456/2450`）。同步逻辑工作正常，与用户预期冲突。**决策**：购买 hp_up 时 hp 回满至新 maxHp。

### #S10(b) TAB 面板非战斗态冻结 ——待处理
- **证据**（2026-10-14 在 2a872a4 复核）：`updateStatusPanel`（`tank_mvp.html:1268`）刷新仍挂在 battle update 链上；settlement/map 下 loop 只调 `draw()` 不调 `update()` → 面板定格在打开瞬间。
- **根因**：面板刷新挂在战斗 update 链上，非战斗态无刷新 tick。

### #S10(c) 商店购买后需退出才看到更新数字 ——待处理（同 #S10(b) 根因）
- **证据**：三家商店购买回调都即时重绘自身（`tank_mvp.html:2002` / `:2084-2091` / `:2389/2407`）；但玩家属性数字只在 TAB 面板显示，结算界面购买后因 #S10(b) 冻结。
- **根因**：同 #S10(b)——面板不在商店，问题在面板刷新而非商店。

### #S11 地图边缘道路/河流裁剪错误 ——待处理
- **证据**（2026-10-14 在 2a872a4 复核）：`js/tank_nodegen.js:2703-2715`（strip 出界路段**整段删除**而非裁剪，注释明示"整段须在界内"）；道路端帽 `lineCap='butt'`、河流按段绘制（`js/tank_battledraw.js:221-243`）依旧。
- **根因**：无"沿地图边缘线裁剪"逻辑；边缘截断面恒为垂直于中心线的端帽，而非沿边界线的裁剪。

### #S12 河流有中心线、无水流纹理 ——待处理
- **证据**（2026-10-14 在 2a872a4 复核，#R1 后）：`js/tank_battledraw.js:221-243` water-chain 改为不透明底（`#3578a8`，重叠同色无缝合并）+ 无描边 + **沿段向单线高光**（`:233`，旧版错轴高光已修正为沿段向）——但仍是**静态中心高光线**，无水流纹理、无逐帧动画。
- **根因**：绘制分支只有平色填充+描边+静态高光中心线。需求：去掉中心线，加水流纹理（或动态）。

### #S13 树/建筑/沙包纹理过于简单 ——待处理（现状描述，非 bug）
- **证据**（2026-10-14 在 2a872a4 复核）：§4.59 已升级树冠（bush/tree/fallen 高光叶点）、§4.61 已升级沙袋（缝线/高光/结头）与树桩/碎石；**建筑仍极简**——`js/tank_rules.js:127` `drawStyle:'box'` → `js/tank_battledraw.js:166-175`（纯色矩形+2px 描边+"楼房"文字标签），"不够直观"主要落在这处。
- **根因**：程序化几何占位绘制。`ASSET_DEFS` 已支持"有图 drawImage / 无图烘焙"双通道，是贴图替换的现成接入点。


---
