---
name: doc-workflow
description: Use when completing any feature, refactoring, or bug fix in rogue-tank to strictly execute the 4-step document lifecycle (DEVELOPMENT.md, PLAN.md/ISSUES.md, ARCHIVE.md).
---

# Rogue Tank — 文档生命周期与同步指引

本项目维护严格的文档分工与 4 步生命周期。`DEVELOPMENT.md` 是唯一的长期权威文档；`PLAN.md` 与 `ISSUES.md` 是临时文档（只存未完成条目）；`ARCHIVE.md` 是只读归档。

## 4 步生命周期（完成任意任务时必须顺次执行）

当任意功能/重构/修复实现并验证通过后，在收尾前**必须**依次执行以下 4 步：

### Step 1: 同步至 DEVELOPMENT.md
- 将定型的设计决策同步写进 `DEVELOPMENT.md` §2（按系统分类）。
- 将已实现的系统/组件同步写进 `DEVELOPMENT.md` §3。
- 若改动涉及基础数值或计算公式，同步更新 §5.5 数值参考表。
- 保证 `DEVELOPMENT.md` 即使不依赖 PLAN/ISSUES 也能独立说明项目最新完整状态。

### Step 2: 从临时文档中删除
- 从 `PLAN.md` 或 `ISSUES.md` 中**完全删除**已完成的条目块。

### Step 3: 原文归档至 ARCHIVE.md
- 将 Step 2 被删条目的**完整原文**追加到 `ARCHIVE.md` 底部。
- 标注删除日期（YYYY-MM-DD）与来源文档/编号（例：`### [2026-08-15] 归档自 PLAN.md P-01`）。

### Step 4: 联动下一步计划
- 检查改动是否影响后续开发顺序，必要时同步调整 `DEVELOPMENT.md` §6（建议的下一步顺序）。

---

## 注意事项
1. **绝不凭空发明“未证实的问题”**：写入 ISSUES.md 前必须有明确的代码证据或复现场景。
2. **冲突判定**：若各文档发生冲突，永远以 `DEVELOPMENT.md` §2 为准。
3. **未完成条目**：保持在 `PLAN.md` / `ISSUES.md` 中（标注 `进行中` / `待处理`），不得提前删除。
