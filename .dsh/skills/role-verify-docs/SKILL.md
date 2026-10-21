---
name: role-verify-docs
description: Use when running the verification chains (check / test / browser smoke) or closing out a batch through the 4-step document lifecycle in Rogue Tank. Owns scripts/run-tests.js, scripts/check-html.js and the docs/ lifecycle.
---

# Role: verify-docs（验证与文档生命周期）

## 1. 你拥有的文件

- `scripts/check-html.js` — 语法冒烟（`vm.Script`，无 spawn）+ 顶层重复声明检测
- `scripts/run-tests.js` — Node 测试链 runner（**48 项**，失败不中断后续）
- **`scripts/wiki-check.js`** — specs wiki 链接/锚点/模板校验（2026-10-21 新增；**改过 docs 后必跑**）
- `scripts/test-browser-*.cjs` — 浏览器四链（smoke / r3 / run / r4）
- **specs 写域（wiki 化后）**：`docs/specs/<卷>/` 全部主题页 + `docs/specs/<卷>.md` 兼容索引页 + `docs/WIKI-STYLE.md`（形态权威）
- `docs/DEVELOPMENT.md` §4 续写、`docs/PLAN.md`、`docs/ISSUES.md`、`docs/ARCHIVE.md` + `docs/archive/<yyyy-mm>.md`
- `tsconfig.json` / `types/globals.d.ts`

## 2. 三条验证链（沙箱内实测，2026-10-19）

| 链 | 命令 | 沙箱内实测 |
|---|---|---|
| 语法冒烟 | `node scripts/check-html.js` | ✅ 可直接跑，EXIT=0（无 spawnSync） |
| typecheck | `node node_modules/typescript/bin/tsc --noEmit` | ✅ EXIT=0。**不要用 `npx tsc`**（写用户缓存 → EPERM） |
| 合并 | `npm run check` | ✅ EXIT=0（约 7.4s） |
| Node 全链 | `npm test` | ⚠️ 见 §3 |
| 浏览器四链 | `npm run test:browser` | ❌ 沙箱内 `browserType.launch: spawn EPERM`（需系统 Edge + 放宽进程权限） |

**只报实测退出码。** 未跑项必须明确写「未跑 + 原因」，不得暗示通过。

## 3. 已知的验证链缺陷（修复中，见工作记录）

- `npm test` 在沙箱内**全项失败**：`run-tests.js:89` 的 `spawnSync({encoding:'utf8'})` 依赖管道捕获，沙箱禁止 → `spawnSync … EPERM`。**单跑** `node scripts/test-xxx.js` 正常（实测 `test-qa.js` EXIT=0）。
- 测试链**漏登记**：磁盘上有 `scripts/test-move.js`、`scripts/test-physics.js`，但 `run-tests.js` 的 TESTS 数组里没有 → 孤儿测试，永不执行。
- `check-html.js` 只冒烟 24 个脚本，磁盘上 46 个 `test-*.js` 中其余 22 个无语法兜底。
- `test-strip.js` 是重负载单测（141~177s），单测上限 300s；`test-ai.js` 的「#E7 反应延迟随距离增大」是**已知 flaky**（单跑 2~3 次确认）。

## 4. 文档 4 步生命周期（AGENTS.md §2.2 的执行细则）

功能/修复验证通过后，**顺序不可颠倒**：

1. **同步** — ① **`docs/specs/<卷>/<主题页>.md`** 写现行细则（战斗→`combat/` / 地图→`map/` / 卡牌→`cards/` / Boss→`boss/` / 编辑器→`editor/`），按 **AGENTS.md §2.3「改 specs 三步」**（改主题页 → 对齐 `<卷>.md` 兼容页摘要 → 跑 `node scripts/wiki-check.js`）；② `docs/DEVELOPMENT.md` **§4 正文末尾续写新编号**（当前最大 **§4.114**，下一个是 §4.115），简结论 + specs 归口指针（**指向主题页**如 `specs/combat/ammo-system.md`）+ 三链验证记录。
2. **删除** — 从 `docs/PLAN.md` / `docs/ISSUES.md` **完全删除**对应条目。
3. **归档** — 被删条目**原文**追加到 `docs/archive/<yyyy-mm>.md` 底部（标来源文档、条目编号、删除日期），并在 `docs/ARCHIVE.md` 索引表**表尾**加一行（日期升序）。
4. **联动** — 影响规划顺序时同步 `DEVELOPMENT.md` §3 与 `PLAN.md` §1。

## 5. 当前文档体系的真实结构（勿按旧角色卡改）

`docs/DEVELOPMENT.md` 只有 **§0 文档体系索引 / §1 核心方向 / §2 架构演进 / §3 当前状态与下一步 / §4 批次落地结论**。

- **没有 §5 / §5.5 / §6**——旧角色卡引用的「§5.5 numerical reference table」「§6 next steps」已不存在。数值口径归 `docs/specs/<卷>/` 对应主题页。
- **specs 已 wiki 化（2026-10-21）**：`docs/specs/<卷>/` 是正文（59 页），`docs/specs/<卷>.md` 是 §N 兼容索引页（编号不变、只放摘要 + 详见链接）。**改 specs 必读 `docs/WIKI-STYLE.md`**。
- §4 正文已按月份拆到 `docs/DEVELOPMENT-batches-2026-09.md` / `-2026-10.md`；`DEVELOPMENT.md` 只留 §4.0 编号索引（§4.1~§4.26）与拆分链接。
- **`docs/archive/` 归档分卷严禁全文读取**（单卷可达 ~257KB）：按 `ARCHIVE.md` 索引定位后 Grep 切片。同一文件重复读取 ≤ 3 次。
- 统计数字必须实测并标日期（如卡牌数用 `node scripts/audit-content.js`）。
- 章节标题与结论禁用「本轮/本批」等无日期锚点写法。

## 6. 硬约束

- 你**不改** `js/` 或页面源码——发现失败只报告给对应角色。
- 新增 `js/` 模块时，必须同步加入 `scripts/check-html.js` 的检查范围与 `tsconfig.json` 的 include。
- 新增测试文件时，必须同时登记进 `scripts/run-tests.js` 的 TESTS 数组（否则是孤儿）。
- **改过 docs 后必跑 `node scripts/wiki-check.js`**（断链 / 失效锚点 / 兼容页结构 / wiki 页模板）；`broken=0 anchorBad=0 struct=0 template=0` 才算过。
- **`docs/specs/**` 在沙箱下二次写入会 EPERM**（`write` 可建新文件，但覆盖/删除被拒）⇒ 大量改动用 `edit` 逐处改；**临时探针一律放 `tmp/`**，不要放 `docs/`（那里删不掉）。
- 不为「确认」反复重跑同一链 > 2 次（flaky 项除外）。

## 7. 与 `doc-workflow` skill 的关系

`doc-workflow` skill 是本角色文档部分的流程权威摘要；两者冲突时以 `AGENTS.md` §2 为准。
