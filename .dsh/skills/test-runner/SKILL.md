---
name: test-runner
description: Use when running or verifying tests and syntax checks in rogue-tank — the exact commands, their real scope, and how to tell a genuine failure from a sandbox limitation.
---

# Rogue Tank — 测试与校验

## 命令（沙箱内实测，2026-10-19）

| 目的 | 命令 | 说明 |
|---|---|---|
| 语法冒烟 + 类型 | `npm run check` | `check-html.js`（`vm.Script`，无 spawn）+ `tsc --noEmit`。约 7s |
| 只跑语法冒烟 | `node scripts/check-html.js` | 覆盖 `js/*.js`、`server.js`、`scripts/**/*.{js,cjs}`、五页内联 `<script>`，并断言「磁盘上所有 `scripts/test-*.js` 都已登记进测试链」 |
| Node 全链 | `npm test` | `scripts/run-tests.js` 逐项独立运行，**失败不中断后续**，末行给通过/失败汇总。单测上限 300s |
| 单项 | `node scripts/test-<name>.js` | 定位 flaky / 复现时用 |
| 浏览器四链 | `npm run test:browser` | smoke / r3 / run / r4；需系统 Edge（channel `msedge`，无头） |

## 实际覆盖范围（勿低估）

- `check-html.js` **按目录自动发现** `scripts/` 下全部 `.js`/`.cjs`，不是手抄白名单。
- 测试链现有 **47** 个 `scripts/test-*.js`（2026-10-19 实测）。新增测试文件后**必须**登记进 `scripts/run-tests.js` 的 `TESTS` 数组，否则 `check-html.js` 会以「孤儿测试」直接判红。

## 判定标准

1. `npm run check` exit 0，末行 `All checks passed`。
2. `npm test` exit 0，汇总行 `N 通过 / 0 失败`。
3. `npm run test:browser` 输出 `ALL PASS`。
4. 新增 `js/` 模块 → 同时更新 `tsconfig.json` 的 include。

## 真失败 vs 环境限制

- 报 **`spawn EPERM`** 且栈里有 `launch` → 浏览器链的沙箱限制（命名管道），**不是代码缺陷**。`scripts/lib/browser-launch.cjs` 会打印固定提示并以退出码 **86** 退出（`INCONCLUSIVE`）。此时在允许 spawn 的环境重跑。
- 报 **`EPERM` + `npm-cache`/`npx`** → 不要用 `npx`，改 `node node_modules/typescript/bin/tsc --noEmit`。
- `test-ai.js` 的「#E7 反应延迟随距离增大」是**已知 flaky**（随机抖动采样）：单跑 2~3 次确认，勿按真失败处理。
- `test-strip.js` 是重负载项（141~177s），别当成卡死。

## 报告纪律

- 只报**实测退出码**；未跑项必须显式写「未跑 + 原因」，不得暗示通过。
- 不为「确认」反复重跑同一链超过 2 次（flaky 项除外）。

配套角色卡：`role-verify-docs`（含文档 4 步生命周期）。
