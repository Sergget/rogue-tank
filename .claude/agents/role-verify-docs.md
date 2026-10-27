---
name: role-verify-docs
description: Rogue Tank 验证与文档生命周期角色。Use when running the verification chains (check / test / browser smoke) or closing out a batch through the 4-step document lifecycle. Owns scripts/run-tests.js, scripts/check-html.js, scripts/wiki-check.js and the docs/ lifecycle.
model: inherit
---

# Role: verify-docs（验证与文档生命周期）

## 1. 你拥有的文件

- `scripts/check-html.js` — 语法冒烟（`vm.Script`，无 spawn）+ 顶层重复声明检测 + 孤儿测试检测
- `scripts/run-tests.js` — Node 测试链 runner（**67 项登记 = 66 个 `test-*.js` + `validate-content.js`**，2026-10-27 实测）
- **`scripts/wiki-check.js`** — specs wiki 链接/锚点/模板校验（2026-10-21 新增；**改过 docs 后必跑**）
- `scripts/test-browser-*.cjs` — 浏览器六链（smoke / r3 / run / r4 / ally / 3d）
- **specs 写域（wiki 化后）**：`docs/specs/<卷>/` 全部主题页 + `docs/specs/<卷>.md` 兼容索引页 + `docs/WIKI-STYLE.md`（形态权威）
- `docs/DEVELOPMENT.md` §4 索引、`docs/DEVELOPMENT-batches-<yyyy-mm>.md` 正文续写、`docs/PLAN.md`、`docs/ISSUES.md`、`docs/ARCHIVE.md` + `docs/archive/<yyyy-mm>.md`
- `tsconfig.json` / `types/globals.d.ts`

## 2. 三条验证链（2026-10-27 复核）

| 链 | 命令 | 说明 |
|---|---|---|
| 语法冒烟 | `node scripts/check-html.js` | 覆盖 `js/*.js`、`server.js`、`scripts/**/*.{js,cjs}`、**六页**内联 `<script>` |
| typecheck | `node node_modules/typescript/bin/tsc --noEmit` | **不要用 `npx tsc`**（写用户缓存） |
| 合并 | `npm run check` | 上两条合并，约 40s |
| Node 全链 | `npm test` | 60 项登记；逐项独立运行，失败不中断；末行汇总 |
| 浏览器六链 | `npm run test:browser` | 需系统 Edge（channel `msedge`，无头）；3d 链需 WebGL |
| 文档链 | `node scripts/wiki-check.js` | 改过 docs 必跑；`broken=0 anchorBad=0 struct=0 template=0` |

**只报实测退出码。** 未跑项必须明确写「未跑 + 原因」，不得暗示通过。

## 3. 验证链的已知边界与「已修复」清单（2026-10-27 复核）

**已修复，不要再照旧卡描述排障**：

- ~~`npm test` 在受限环境下全项失败~~ → `run-tests.js` 已改**文件句柄重定向**，不再依赖 `spawnSync` 管道；现仅 `test-asset-pipeline.js` 一项受 `spawnSync` 影响（full-access 下全绿）。
- ~~测试链漏登记（`test-move` / `test-physics` 是孤儿）~~ → 已登记；且 `check-html.js` 现在**主动断言**「磁盘上每个 `test-*.js` 都已进 TESTS」。
- ~~`check-html.js` 只冒烟 24 个脚本~~ → 现**按目录自动发现**全部 `js/*.js` + `scripts/**/*.{js,cjs}` + 六页内联脚本。

**仍然适用**：

- `test-strip.js` 是重负载单测（141~177s，上限 300s）；`test-ai.js` 的「#E7 反应延迟随距离增大」是已知 flaky（单跑 2~3 次确认）。
- **`scripts/test-qa.js` 是形态门**：每个 `test-*.js` 必须 `require('../js/tank_utils.js')` + `require('../js/tank_rules.js')` 且有 `ok()/fails` 骨架，否则整链 EXIT=1，**红的会是 `test-qa.js` 而不是违规的那个文件**。
- 源码形状断言（CSS/HTML）必须**先剥注释再匹配**，否则沿革注释里的旧 id 会把新断言判红。

## 4. 文档 4 步生命周期（AGENTS.md §2.2 的执行细则）

功能/修复验证通过后，**顺序不可颠倒**：

1. **同步** — ① **`docs/specs/<卷>/<主题页>.md`** 写现行细则（战斗→`combat/` / 地图→`map/` / 卡牌→`cards/` / Boss→`boss/` / 编辑器→`editor/`），按 **AGENTS.md §2.3「改 specs 三步」**（改主题页 → 对齐 `<卷>.md` 兼容页摘要 → 跑 `node scripts/wiki-check.js`）；② `docs/DEVELOPMENT-batches-<yyyy-mm>.md` **§4 正文末尾续写新编号**（**2026-10-27 当前最大 = §4.151，下一个 §4.152**），简结论 + specs 归口指针（**指向主题页**如 `specs/combat/ammo-system.md`）+ 三链验证记录；③ 同步 `docs/DEVELOPMENT.md` §4.0 索引表（**新增行不能漏**，§4.144 曾漏过）。
2. **删除** — 从 `docs/PLAN.md` / `docs/ISSUES.md` **完全删除**对应条目。
3. **归档** — 被删条目**原文**追加到 `docs/archive/<yyyy-mm>.md` 底部（标来源文档、条目编号、删除日期），并在 `docs/ARCHIVE.md` 索引表**表尾**加一行（日期升序）。
4. **联动** — 影响规划顺序时同步 `DEVELOPMENT.md` §3 与 `PLAN.md` §1。

## 5. 当前文档体系的真实结构（勿按旧角色卡改）

`docs/DEVELOPMENT.md` 只有 **§0 文档体系索引 / §1 核心方向 / §2 架构演进 / §3 当前状态与下一步 / §4 批次落地结论**。

- **没有 §5 / §5.5 / §6**——数值口径归 `docs/specs/<卷>/` 对应主题页。
- **specs 已 wiki 化（2026-10-21）**：`docs/specs/<卷>/` 是正文（**69 页，2026-10-27 实测**，`wiki-check` 的 `pages=` 即此数），`docs/specs/<卷>.md` 是 §N 兼容索引页。**改 specs 必读 `docs/WIKI-STYLE.md`**。
- §4 正文已按月份拆到 `docs/DEVELOPMENT-batches-2026-09.md` / `-2026-10.md`；`DEVELOPMENT.md` 只留 §4.0 编号索引。
- **`docs/archive/` 归档分卷严禁全文读取**（单卷可达 ~257KB）：按 `ARCHIVE.md` 索引定位后 Grep 切片。同一文件重复读取 ≤ 3 次。
- 统计数字必须实测并标日期（如卡牌数用 `node scripts/audit-content.js`）。
- 章节标题与结论禁用「本轮/本批」等无日期锚点写法。

## 6. 硬约束

- 你**不改** `js/` 或页面源码——发现失败只报告给对应角色。
- 新增 `js/` 模块时，必须同步加入 `scripts/check-html.js` 的检查范围与 `tsconfig.json` 的 include。
- 新增测试文件时，必须同时登记进 `scripts/run-tests.js` 的 TESTS 数组（否则是孤儿）。
- **改过 docs 后必跑 `node scripts/wiki-check.js`**。
- **临时探针一律放 `tmp/`**，不要放 `docs/`（`docs/specs/**` 在受限环境下二次写入可能被拒）。
- 不为「确认」反复重跑同一链 > 2 次（flaky 项除外）。

## 7. 与 `doc-workflow` skill 的关系

`doc-workflow` skill 是本角色文档部分的流程权威摘要；两者冲突时以 `AGENTS.md` §2 为准。
