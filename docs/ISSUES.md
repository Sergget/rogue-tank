# Rogue Tank — 工程问题清单（已核实）

> **临时文档**：只存放**待处理 / 处理中**的已核实问题。每条必须有代码证据（`file:line`）与复现/触发条件；绝不收录未核实项。
> 条目**修复并验证有效后**按 `AGENTS.md` 4 步生命周期收尾：结论同步 `DEVELOPMENT.md` / `specs/` → 删除本条目 → 原文归档 `docs/archive/<yyyy-mm>.md` → 联动下一步计划。
> 已解决并归档的历史条目（#1~#26、#44、#49、#60~#101、#A1~#A28、#B1~#B11、#C1~#C4/#C6、#C5、#D1~#D5、#A9、#E1~#E13、#F1~#F6、#G1~#G9、#H1~#H5（2026-09-21 视野批次）、#H1~#H4（2026-09-30 敌军基准/布雷/技能槽批次）、#I1~#I4、#J1~#J4、#K1~#K3、#A16、#L1~#L7（2026-10-06 整车精灵对齐批次）、#M1~#M3（2026-10-08 设计器精灵绘制批次）、#L8 + #M4（2026-10-08 白底清理与炮塔参数重算））：见 `docs/ARCHIVE.md` 索引表。
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

---
