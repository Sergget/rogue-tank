---
name: test-runner
description: Use when running or verifying tests and syntax checks in rogue-tank — the exact commands, their real scope, and how to tell a genuine failure from an environment limitation.
---

# Rogue Tank — 测试与校验

## 命令（2026-10-27 实测）

| 目的 | 命令 | 说明 |
|---|---|---|
| 语法冒烟 + 类型 | `npm run check` | `check-html.js`（`vm.Script`，无 spawn）+ `tsc --noEmit`。约 40s（含 6 页内联脚本） |
| 只跑语法冒烟 | `node scripts/check-html.js` | 覆盖 `js/*.js`、`server.js`、`scripts/**/*.{js,cjs}`、**六页**内联 `<script>`，并断言「磁盘上所有 `scripts/test-*.js` 都已登记进测试链」 |
| Node 全链 | `npm test` | `scripts/run-tests.js` 逐项独立运行，**失败不中断后续**，末行给通过/失败汇总。单测上限 300s |
| 单项 | `node scripts/test-<name>.js` | 定位 flaky / 复现时用 |
| 浏览器六链 | `npm run test:browser` | smoke / r3 / run / r4 / ally / 3d；需系统 Edge（channel `msedge`，无头）；3d 链需 WebGL（SwiftShader 兜底） |
| 渲染基线 | `npm run baseline` | R0 三场景固定截图 + 性能采样；默认 `--check`，首次 `-- --write`；基线在 `tmp/render-baseline/`，不入库 |
| 文档链 | `node scripts/wiki-check.js` | 改过 docs 必跑 |

## 实际覆盖范围（勿低估）

- `check-html.js` **按目录自动发现** `scripts/` 下全部 `.js`/`.cjs`，不是手抄白名单。
- 测试链现有 **64** 个 `scripts/test-*.js` + `scripts/validate-content.js` = **65 项登记**（2026-10-27 实测）。新增测试文件后**必须**登记进 `TESTS` 数组，否则 `check-html.js` 以「孤儿测试」判红。
- 卡牌数量、specs 页数等统计数字**必须实测**（`node scripts/audit-content.js`、`find docs/specs -mindepth 2 -name '*.md' | wc -l`），不要抄旧文档。

## 测试脚本的形态契约（`test-qa.js` 是「测试的测试」）

`scripts/test-qa.js` 逐个扫描 `test-*.js`，**硬性**要求：① 含 `'use strict'`；② `require('../js/tank_utils.js')` **且** `require('../js/tank_rules.js')`；③ 有 `function ok(` 或 `let fails =` 断言骨架（①~③ 缺任一即判「非合规」并让整链 EXIT=1）。`global.TAU` / `global.RULES` shim 与 ≥3 条边界模式只是 warn。

**踩坑形态**：新测试漏 `require` 时，`npm test` 里红的是 **`test-qa.js` 自己**，不是你的新测试 —— 看到 `test-qa` 失败先查「谁没 require」。

**配套纪律**：源码形状断言（CSS / HTML / 内联脚本）**必须先剥注释再匹配**——`//` 或 `/* */` 里提到被删的 id / 键名属合法沿革，直接正则会把注释当代码判红。

## 判定标准

1. `npm run check` exit 0，末行 `All checks passed`。
2. `npm test` exit 0，汇总行 `N 通过 / 0 失败`。
3. `npm run test:browser` 输出 `ALL PASS`。
4. `node scripts/wiki-check.js` → `broken=0 anchorBad=0 struct=0 template=0`（改过 docs 时）。
5. 新增 `js/` 模块 → 同时更新 `tsconfig.json` 的 include。

## 真失败 vs 环境限制

- 报 **`spawn EPERM`** 且栈里有 `launch` → 浏览器链的命名管道限制，**不是代码缺陷**。`scripts/lib/browser-launch.cjs` 会打印固定提示并以退出码 **86** 退出（`INCONCLUSIVE`）。此时在允许 spawn 的环境重跑。
- `test-asset-pipeline.js` 在受限环境下必然红（`spawnSync` 管道 stdio → EPERM，`status === null`），**full-access 下全绿**。别当代码回归。
- 报 **`EPERM` + `npm-cache`/`npx`** → 不要用 `npx`，改 `node node_modules/typescript/bin/tsc --noEmit`。
- `test-ai.js` 的「#E7 反应延迟随距离增大」是**已知 flaky**（随机抖动采样）：单跑 2~3 次确认，勿按真失败处理。
- `test-strip.js` 是重负载项（141~177s），别当成卡死。

## 报告纪律

- 只报**实测退出码**；未跑项必须显式写「未跑 + 原因」，不得暗示通过。
- 不为「确认」反复重跑同一链超过 2 次（flaky 项除外）。

配套角色卡：`role-verify-docs`（含文档 4 步生命周期）。
