---
name: sandbox-verify
description: Use when a verification command fails with EPERM/spawn/inconclusive results, or when running pwsh on Windows — separates genuine failures from environment limits and documents the PowerShell UTF-8 / interpolation pitfalls that cause false failures.
---

# Rogue Tank — 验证命令避坑（环境边界）

本 skill 固化受限环境（workspace-write / 无命名管道 / Windows pwsh）下实测的验证经验。
**目的**：把「真失败」与「环境误报」分开，不让后续 agent 被权限拒绝和 PowerShell 编码问题误导。

> 当前项目边界表的唯一维护点是 `AGENTS.md` §3.7；本节是它的执行摘要与踩坑记录。

## 1. 环境限制（2026-10-26 复测）

| 操作 | 结果 | 原因 |
|---|---|---|
| `node scripts/check-html.js` | **可直接跑**（EXIT=0 / `All checks passed`，约 1.5s） | `fs` + `vm.Script` 实现，**无 spawnSync** |
| `npm run check` | ✅ 可直接跑（EXIT=0，约 40s） | = `check-html.js` + `npm run typecheck` |
| `node node_modules/typescript/bin/tsc --noEmit` | ✅ 可直接跑 | 不写 npm 缓存、不捕获子进程 |
| `npm test` | ✅ 可直接跑 | `run-tests.js` 已把子进程 stdout/stderr 重定向到**临时文件句柄**（不再用管道） |
| `npm install` / `npx tsc` / 任何 `npx` 远程拉包 | EPERM，写用户 npm-cache 失败 | ⇒ **不要用 npx**，改为直接调 `node node_modules/...` |
| `npm run test:browser` | ⚠️ 受限环境 `spawn EPERM`（Edge 需 `--remote-debugging-pipe`）；**放宽权限后八链全绿** | playwright 启动浏览器需命名管道 |
| 进程级写 `docs/`、`js/`、`scripts/` | 受限模式下可能 denied | 改用 `write`/`edit` 工具，或一次性放宽权限 |

**结论**：两条主链（`npm run check` / `npm test`）可直接跑通；只有浏览器八链需要放宽进程权限，且失败时会打印 `INCONCLUSIVE` 并以**退出码 86** 退出（`scripts/lib/browser-launch.cjs`），不会伪装成代码失败。

## 2. 可用的验证命令

| 想验证什么 | 用这个（可用） | 不要用（被拒/误导） |
|---|---|---|
| 语法冒烟（共享模块 + server.js + **七页**内联脚本） | `node scripts/check-html.js` 或 `npm run check` | — |
| 逻辑单测 | `node scripts/test-<xxx>.js` 或 `npm test` | — |
| typecheck | `node node_modules/typescript/bin/tsc --noEmit` | `npx tsc --noEmit`（写缓存 → EPERM） |
| 启动服务器 | `node server.js`（端口被占 → `PORT=8123 node server.js`；EADDRINUSE 是「已有实例在跑」，不是失败） | — |
| HTTP 冒烟 | PowerShell `Invoke-WebRequest -UseBasicParsing` | — |

**跑 `npm test` 的注意点**：`run-tests.js` **逐项独立运行**，单项失败**不中断**后续，末行给 `N 通过 / M 失败` 汇总并列出失败项。所以：
- 看到汇总里的 `✗` 就单跑那一项定位：`node scripts/test-<name>.js`。
- 若链里报 `tools/cover-refs.json` 基准漂移，跑 `node tools/dump-cover-refs.mjs` 重导出（`scripts/test-asset-pipeline.js` 会直接指出是哪一步）。

## 3. typecheck 细节

- **直接跑**：`node node_modules/typescript/bin/tsc --noEmit`——仓库通常已装依赖，不需要 `npm ci`。
- 若确实缺依赖：`npm ci --cache .npm-cache --no-audit --no-fund`（把缓存写进工作区绕开用户目录 EPERM），跑完删除 `.npm-cache/`。
- 新增模块后 typecheck 报 `Cannot find name 'xxx'`：按项目惯例去 `types/globals.d.ts` 补 `declare`（如 `webkitAudioContext` 这类非标准 DOM 全局），**不要**在源码里用 `(window as any)` 或改编译选项。

## 4. PowerShell 自身坑（编码/语法，会造成假失败）

1. **UTF-8 乱码（最重要）**：PowerShell 默认按系统 ANSI（GBK）读 UTF-8 文件 → 中文变 `鈥?` 乱码；把乱码内容再写回文件会**损坏文件**。
   - 读文件：优先用 read 工具；必须用 pwsh 时 `Get-Content -Encoding UTF8`。
   - 写文件：`Set-Content -Encoding UTF8`（或 `[System.IO.File]::WriteAllText(path, text, [System.Text.UTF8Encoding]::new($false))` 无 BOM）。
   - 改文件**一律用 edit/write 工具**，不要用 pwsh 拼接字符串回写（中文必损）。
2. **`${}` 插值**：`"inline#$i: $name"` 里 `$i:` 会被解析成"驱动器名+变量"报错。变量后紧跟 `:`、`_`、字母时用 `${i}`。
3. **`node --check` 只适用于 `.js`**：`.d.ts` 是 TypeScript（`declare` 语法），`node --check` 必然报错——那是 tsc 的检查范围。
4. **`2>&1 | Select-Object` 时 stderr 被 PowerShell 渲染成 `RemoteException` 红色错误**：那只是显示层，看 `$LASTEXITCODE` 和实际内容判断。
5. **git 会重写行尾（LF → CRLF）**：`git commit` 后工作区文件被 git 触碰，**edit 工具会要求重新 read**——重新 read 目标区间再 edit 即可，不是权限问题。
6. **`Measure-Object -Line` 不计空行**：归档分卷（含大量空行）用它算出的行数与 read 工具的 `total` 不一致。定位文件末尾请用 `Select-Object -Last N` 或 read 工具的 total。

## 5. 判断「真失败 vs 环境误报」的清单

- [ ] `node scripts/check-html.js` 是否 exit 0？它现在可跑——报 ✗ 就是真问题。
- [ ] `npm test`（或单测脚本）是否 exit 0？是 → 逻辑没坏。
- [ ] 是否命中已知 flaky？`scripts/test-ai.js` 的 `#E7 反应延迟随距离增大` 为随机抖动采样——单跑 2~3 次确认，勿按真失败处理。
- [ ] 报错文本是否含 `EPERM` / `spawnSync` / `npm-cache` / `npx`？是 → 环境问题，换 §2 的等价命令。
- [ ] 中文内容是否乱码？是 → 编码问题，用 read 工具或 `-Encoding UTF8` 重读。

## 6. 报告时应注明（给主 agent / 用户）

- 明确写出未跑项与原因：`npm run test:browser` 需系统 Edge + 放宽进程权限，**待正常环境补跑**。
- 明确写出「浏览器目测/试听未做（无浏览器）」。
- 只报实测退出码，并标注 flaky 的复跑结论。
