---
name: sandbox-verify
description: Use when running pwsh verification commands inside the DSH sandbox (workspace-write mode). Documents which commands are denied by the sandbox (EPERM), which equivalents actually work, and the PowerShell UTF-8 / interpolation pitfalls that cause false failures.
---

# Rogue Tank — 沙箱内验证命令避坑（DSH sandbox）

本 skill 固化本会话在 DSH 沙箱（workspace-write 模式、pwsh 受限模式）下实测的验证命令经验。
**目的**：让后续 agent 不再被沙箱策略拒绝和 PowerShell 编码问题误导，把"真失败"与"环境误报"分开。

## 1. 沙箱硬限制（不可绕过，别试）

| 被拒操作 | 报错 | 原因 |
|---|---|---|
| `npm run check`（check-html.js 内部） | 每个文件 ✗，`node --check` 却通过 | check-html.js 用 `spawnSync(..., {encoding})` 默认 pipe stdio 捕获子进程输出 → 沙箱 EPERM（禁止管道捕获）。**不是代码问题** |
| `npm install` / `npx tsc` | EPERM，写 `C:\Users\...\npm-cache` 失败 | 沙箱禁止写工作区外的 npm 缓存目录 |
| `npx` 触发远程拉包 | FetchError / EPERM | 同上：npm 需要写缓存 |

**结论**：沙箱内 `npm run check` 的 check-html.js 部分**必然全量误报**；typecheck（tsc）**不可运行**（除非先成功 `npm ci --cache <工作区内目录>` 装好依赖，见 §3）。

## 2. 可用的验证命令（替代方案）

| 想验证什么 | 用这个（可用） | 不要用（沙箱被拒/误导） |
|---|---|---|
| 语法冒烟（单个/全部 JS） | `node --check <file>`（逐个跑，PowerShell 循环） | `npm run check` / check-html.js |
| 逻辑单测 | `node scripts/test-<xxx>.js` 或 `npm test`（npm test 不写缓存、不捕获子进程输出，可用） | — |
| typecheck | 见 §3（需先装依赖） | `npx tsc --noEmit` |
| 启动服务器 | `node server.js`（如端口被占 → `PORT=8123 node server.js`，EADDRINUSE 是"已有实例在跑"，不是失败） | — |
| HTTP 冒烟 | PowerShell `Invoke-WebRequest -UseBasicParsing`（可用） | — |

**npm test 可用**：实测 `npm test`（串联 node 脚本）exit 0 正常输出，因为它不通过 pipe 捕获子进程、不写 npm 缓存。这是沙箱内最可靠的整库验证。

## 3. 实在需要 typecheck 时（可选，谨慎）

```
npm ci --cache .npm-cache --no-audit --no-fund
node node_modules/typescript/bin/tsc --noEmit
```
- `--cache .npm-cache`：把 npm 缓存写进工作区（沙箱允许），绕过用户目录 EPERM。
- 跑完务必删除 `.npm-cache/`（node_modules 是否删看仓库约定，通常 gitignored 可留）。
- 新增模块后 typecheck 报 `Cannot find name 'xxx'`：按项目惯例去 `types/globals.d.ts` 补 `declare`（如 `webkitAudioContext` 这类非标准 DOM 全局），**不要**在源码里用 `(window as any)` 或改编译选项。

## 4. PowerShell 自身坑（编码/语法，会造成假失败）

1. **UTF-8 乱码（最重要）**：PowerShell 默认按系统 ANSI（GBK）读 UTF-8 文件 → 中文变 `鈥?` 乱码；把乱码内容再写回文件会**损坏文件**（本会话曾因此把 tank_mvp.html 内联脚本提取出来 node --check 误报 SyntaxError）。
   - 读文件：优先用 read 工具；必须用 pwsh 时 `Get-Content -Encoding UTF8`。
   - 写文件：`Set-Content -Encoding UTF8`（或 `[System.IO.File]::WriteAllText(path, text, [System.Text.UTF8Encoding]::new($false))` 无 BOM）。
   - **从 HTML 提取内联脚本做语法检查**：不要用 PowerShell 字符串处理（编码必坏），改用 Node 脚本复刻 check-html.js 的做法（`fs.readFileSync(..., 'utf8')` + 正则提取 + `node --check`，全部在 Node 侧 UTF-8 处理）。
2. **`${}` 插值**：`"inline#$i: $name"` 里 `$i:` 会被解析成"驱动器名+变量"报错。变量后紧跟 `:`、`_`、字母时用 `${i}`：`"inline#${i}: $name"`。
3. **`node --check` 只适用于 `.js`**：`.d.ts` 是 TypeScript（`declare` 语法），`node --check` 必然报错——那是 tsc 的检查范围，不要对 `.d.ts` 跑 node --check 并当成失败。
4. **`2>&1 | Select-Object` 时 stderr 被 PowerShell 渲染成 `RemoteException` 红色错误**：那只是显示层，看 `$LASTEXITCODE` 和实际内容判断，别被 `[stderr]` 前缀吓到。

## 5. 判断"真失败 vs 环境误报"的清单

- [ ] `node --check <file>` 直接跑该文件是否 exit 0？是 → 语法没坏，check-html.js 的 ✗ 是沙箱误报。
- [ ] `npm test`（或单测脚本）是否 exit 0？是 → 逻辑没坏。
- [ ] 报错文本是否含 `EPERM` / `spawnSync` / `npm-cache` / `RemoteException`？是 → 环境问题。
- [ ] 中文内容是否乱码？是 → 编码问题，用 read 工具或 `-Encoding UTF8` 重读。

## 6. 报告时应注明（给主 agent / 用户）

- 明确写出"typecheck 因沙箱禁 npm install 跳过，需正常环境补跑 `npm install && npm run check`"。
- 明确写出"浏览器目测/试听未做（无浏览器）"。
- 只报 `node --check` + `npm test` 的实测退出码，不要引用 check-html.js 的 ✗ 列表。
