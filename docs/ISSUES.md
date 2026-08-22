# Rogue Tank — 工程问题清单（已核实）

> **本文档是临时文档**：只存放**待处理 / 处理中**的已核实问题。
> 条目**修复并验证有效后**，按 `AGENTS.md` 定义的 4 步生命周期：先把结论同步进 `DEVELOPMENT.md` → **删除本条目** → 原文归档到 `ARCHIVE.md`。

## QA Test Infrastructure Issues（2026-08-19）

> 当前无待处理问题。

---

## #75 归档条目 #61~#74 的修复大部分缺失于工作区（2026-08-22）

**状态**：待处理

**证据**（HEAD=32b7241，08-20；以下文件与 HEAD 零内容差异 = 声称的修复不存在）：

| 条目 | DEVELOPMENT §3.24 / ARCHIVE 声称 | 工作区实况 |
|---|---|---|
| #61 | `tank_model.js` accel/brake 按修饰后 enginePower/weight 动态派生 | 仍为 `s.accel=(base.enginePower/base.weight)*…`，用 base |
| #62 | `cardStackCount` 按 `tank.cardEffects` 计数 | 仍按 `tank.modifiers.source` 过滤计数 |
| #63 | `applyUpgrades` 批量修饰 + 仅末次 refreshStats | 仍逐级 addModifier，无批量模式 |
| #64 | `AMMO_KEYS` 补 `'heat'` | `tank_cards.js` 全文无 `'heat'` |
| #70 | `driveTank` immobT 归零时清 `trackBroken` | `tank_move.js` 全文无 trackBroken 引用 |
| #71 | `updateFx` 补 shockwaves/scorchMarks 更新与过滤 | 全文无对应 filter/forEach |
| #74 | `halfFromFull` CCW 输入强制正向化 | 文件与 HEAD 零差异、无正向化逻辑 |

另：#65/#72 高概率缺失（computeStats 无 moduleMul 判空改造痕迹 / `t.attachments.forEach` 无存在性守卫）；#66~#69、#73 经复核存在（文件有实际改动或实现已在）。

**根因**：2026-08-22 会话将 #61~#74 归档为"已修复"，但至少上述 7 项的代码改动未留存于当前工作区（疑似被还原/未保存/会话间覆盖）。测试全绿不能证伪——现有断言未覆盖这些行为。

**影响**：DEVELOPMENT §3.24 与 ARCHIVE 对应记录失真；上述缺陷在代码中仍然存活。

**建议**：按 `ARCHIVE.md` 各条目原文逐项重做修复并补测试断言（先写红测再修），完成后重新走 4 步生命周期。

---

> 已解决并归档的历史条目（#1~#26, #44, #49, #60~#74 及修复记录、附注特性）：见 `ARCHIVE.md`.

---

