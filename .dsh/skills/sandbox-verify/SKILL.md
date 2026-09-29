---
name: sandbox-verify
description: Use when running pwsh verification commands inside the DSH sandbox (workspace-write mode). Documents which commands are denied by the sandbox (EPERM), which equivalents actually work, and the PowerShell UTF-8 / interpolation pitfalls that cause false failures.
---

# Rogue Tank — 沙箱内验证命令避坑（DSH sandbox）

本 skill 固化本会话在 DSH 沙箱（workspace-write 模式、pwsh 受限模式）下实测的验证命令经验。
**目的**：让后续 agent 不再被沙箱策略拒绝和 PowerShell 编码问题误导，把"真失败"与"环境误报"分开。

## 1. 沙箱限制（2026-09-23 复测更新）

| 操作 | 结果 | 原因 |
|---|---|---|
| `node scripts/check-html.js` | **可直接跑**（2026-09-23 复测 EXIT=0 / `All checks passed`） | 该脚本已重构为 `fs` + `vm.Script` 实现，**不再有 spawnSync** ⇒ 不触发「禁止管道捕获」限制。早期「check-html 必然全量误报」的记录已失效 |
| `npm run check` | 可用（= `check-html.js` + `npm run typecheck`） | 同上；typecheck 需 `node_modules` 已存在（见 §3） |
| `node node_modules/typescript/bin/tsc --noEmit` | **仓库已装 node_modules 时可直接跑**（2026-09-23 实测 EXIT=0） | 不写 npm 缓存、不捕获子进程 ⇒ **不需要** `npm ci` |
| `npm install` / `npx tsc` / 任何 `npx` 远程拉包 | EPERM，写 `C:\Users\...\npm-cache` 失败 | 沙箱禁止写工作区外的 npm 缓存目录 ⇒ **不要用 npx**，改为直接调 `node node_modules/...` |
| `npm run test:browser` | 需系统 Edge + 放宽进程权限（`spawn EPERM`） | 唯一必须「正常环境补跑」的验证项 |

**结论**：沙箱内可实测的验证 = `node scripts/check-html.js` + `node node_modules/typescript/bin/tsc --noEmit`（两者合起来等价 `npm run check`）+ `npm test`；只有浏览器四链需补跑。

## 2. 可用的验证命令

| 想验证什么 | 用这个（可用） | 不要用（被拒/误导） |
|---|---|---|
| 语法冒烟（共享模块 + server.js + 五页内联脚本） | `node scripts/check-html.js`（**2026-09-23 起可直接跑**）或 `npm run check` | — |
| 逻辑单测 | `node scripts/test-<xxx>.js` 或 `npm test` | — |
| typecheck | `node node_modules/typescript/bin/tsc --noEmit`（node_modules 存在即可） | `npx tsc --noEmit`（npx 写缓存 → EPERM） |
| 启动服务器 | `node server.js`（端口被占 → `PORT=8123 node server.js`；EADDRINUSE 是「已有实例在跑」，不是失败） | — |
| HTTP 冒烟 | PowerShell `Invoke-WebRequest -UseBasicParsing`（可用） | — |

**跑 `npm test` 的注意点**：它用 `&&` 串联数十个脚本 ⇒ **任一失败即中断，后续脚本根本没跑**，日志尾部会停在失败处——别把「跑到 test-ai 就结束」误读为「后面全部通过」。定位 flaky 应单跑该脚本（例：`node scripts/test-ai.js`）。

## 3. typecheck 细节

- **直接跑**：`node node_modules/typescript/bin/tsc --noEmit`——仓库通常已装依赖，**2026-09-23 实测 EXIT=0**，不需要 `npm ci`。
- 若确实缺依赖：`npm ci --cache .npm-cache --no-audit --no-fund`（把缓存写进工作区绕开用户目录 EPERM），跑完删除 `.npm-cache/`（`node_modules` 通常 gitignored 可留）。
- 新增模块后 typecheck 报 `Cannot find name 'xxx'`：按项目惯例去 `types/globals.d.ts` 补 `declare`（如 `webkitAudioContext` 这类非标准 DOM 全局），**不要**在源码里用 `(window as any)` 或改编译选项。

## 4. PowerShell 自身坑（编码/语法，会造成假失败）

1. **UTF-8 乱码（最重要）**：PowerShell 默认按系统 ANSI（GBK）读 UTF-8 文件 → 中文变 `鈥?` 乱码；把乱码内容再写回文件会**损坏文件**（本会话曾因此把 tank_mvp.html 内联脚本提取出来 node --check 误报 SyntaxError）。
   - 读文件：优先用 read 工具；必须用 pwsh 时 `Get-Content -Encoding UTF8`。
   - 写文件：`Set-Content -Encoding UTF8`（或 `[System.IO.File]::WriteAllText(path, text, [System.Text.UTF8Encoding]::new($false))` 无 BOM）。
   - 改文件**一律用 edit/write 工具**，不要用 pwsh 拼接字符串回写（中文必损）。
2. **`${}` 插值**：`"inline#$i: $name"` 里 `$i:` 会被解析成"驱动器名+变量"报错。变量后紧跟 `:`、`_`、字母时用 `${i}`：`"inline#${i}: $name"`。
3. **`node --check` 只适用于 `.js`**：`.d.ts` 是 TypeScript（`declare` 语法），`node --check` 必然报错——那是 tsc 的检查范围，不要对 `.d.ts` 跑 node --check 并当成失败。
4. **`2>&1 | Select-Object` 时 stderr 被 PowerShell 渲染成 `RemoteException` 红色错误**：那只是显示层，看 `$LASTEXITCODE` 和实际内容判断，别被 `[stderr]` 前缀吓到。
5. **git 会重写行尾（LF → CRLF）**：`git commit` 后工作区文件被 git 触碰，**edit 工具会要求重新 read**（报 `file has not been read`）——重新 read 目标区间再 edit 即可，不是权限问题。
6. **`Measure-Object -Line` 不计空行**：归档分卷（含大量空行）用它算出的行数与 read 工具的 `total` 不一致（例：2026-09.md 实测 1169 vs 1588）。定位文件末尾请用 `Select-Object -Last N` 或 read 工具的 total。

## 5. 判断「真失败 vs 环境误报」的清单

- [ ] `node scripts/check-html.js` 是否 exit 0？**它现在可跑**——报 ✗ 就是真问题，别再假定为沙箱误报。
- [ ] `npm test`（或单测脚本）是否 exit 0？是 → 逻辑没坏。注意 `&&` 串联语义：失败处**之后的脚本根本没跑**。
- [ ] 是否命中已知 flaky？`scripts/test-ai.js` 的 `#E7 反应延迟随距离增大` 为随机抖动采样（DEVELOPMENT.md §4.32、§4.35 均有记录）——单跑 2~3 次确认，勿按真失败处理。
- [ ] 报错文本是否含 `EPERM` / `spawnSync` / `npm-cache` / `npx`？是 → 环境问题，换 §2 的等价命令。
- [ ] 中文内容是否乱码？是 → 编码问题，用 read 工具或 `-Encoding UTF8` 重读。

## 6. 报告时应注明（给主 agent / 用户）

- 明确写出未跑项与原因：`npm run test:browser` 需系统 Edge + 放宽进程权限（沙箱 `spawn EPERM`），**待正常环境补跑**。
- 明确写出「浏览器目测/试听未做（无浏览器）」。
- 只报实测退出码（`node scripts/check-html.js` / `tsc --noEmit` / `npm test`），并标注 flaky 的复跑结论。
