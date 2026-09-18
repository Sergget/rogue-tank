---
name: doc-workflow
description: Use when completing any feature, refactoring, or bug fix in rogue-tank to strictly execute the 4-step document lifecycle (DEVELOPMENT.md §4 + specs 归口, PLAN.md/ISSUES.md, ARCHIVE.md). 流程权威见根目录 AGENTS.md §2。
---

# Rogue Tank — 文档生命周期与同步指引

本项目维护严格的文档分工与 4 步生命周期。**流程权威：根目录 `AGENTS.md` §2**（本文档是其执行摘要，二者冲突时以 AGENTS.md 为准）。内容权威：`docs/DEVELOPMENT.md`（长期权威，含 §4 批次落地结论）+ `docs/specs/` 五卷系统规范（现行口径唯一权威）；`docs/PLAN.md` 与 `docs/ISSUES.md` 是临时文档（只存未完成条目）；`docs/ARCHIVE.md` + `docs/archive/<yyyy-mm>.md` 是只读归档（分卷严禁全文读取，按索引 Grep 切片）。

## 4 步生命周期（完成任意任务时必须顺次执行）

当任意功能/重构/修复实现并验证通过后，在收尾前**必须**依次执行以下 4 步：

### Step 1: 同步结论
- ① 现行细则写入对应系统规范卷：战斗→`docs/specs/combat.md`、地图→`map.md`、卡牌→`cards.md`、Boss→`boss.md`、编辑器→`editor.md`。被取代的旧值改写为现行值并留沿革注记。
- ② `docs/DEVELOPMENT.md` **新增一个 §4.x 编号条目**（下一个编号 = 现有最大 +1；简结论 + specs 归口指针 + `npm run check` / `npm test` / `test:browser` 三链验证记录），标题带日期锚点。
- ③ 保证 `DEVELOPMENT.md` 即使不依赖 PLAN/ISSUES 也能独立说明项目最新完整状态；路线顺序变化时同步 §3。

### Step 2: 从临时文档中删除
- 从 `docs/PLAN.md` 或 `docs/ISSUES.md` 中**完全删除**已完成的条目块；临时文档只保留未完成项。

### Step 3: 原文归档
- 将 Step 2 被删条目的**完整原文**追加到当月分卷 `docs/archive/<yyyy-mm>.md` 底部，标注来源文档、条目编号、删除日期（例：`### [2026-09-17] 归档自 ISSUES.md #C1~#C6`）。
- 在 `docs/ARCHIVE.md` 索引表**表尾**加一行（索引按日期升序；主文件保持极小，只增不删）。

### Step 4: 联动下一步计划
- 检查改动是否影响后续开发顺序，必要时同步更新 `DEVELOPMENT.md` §3（待办与下一步）与 `docs/PLAN.md` §1（待办总览表）。

---

## 注意事项
1. **绝不凭空发明"未证实的问题"**：写入 ISSUES.md 前必须有明确的代码证据（`file:line`）或复现场景；条目含 现象/核实结论/根因/证据/复现/修复方向/状态。
2. **冲突判定**：现行口径以 `docs/specs/<system>.md` 为准；演进顺序与状态以 `DEVELOPMENT.md`（§3 > §4 后条目）为准；归档仅供追溯。
3. **未完成条目**：保持在 `PLAN.md` / `ISSUES.md` 中（标注 `待处理`/`处理中`），不得提前删除。
4. **引用纪律**：禁止把临时文档当作权威引用目标；引用已归档条目改指 `docs/archive/<yyyy-mm>.md`；同文档内同一数值只允许一个唯一口径小节，其余位置指向它；禁止「本轮/本批」类无日期锚点表述。
5. **主文档历史条目不回改**：被推翻的设计在 §4 原文加「已被 §4.x/§y 取代」注记，不删原文。
