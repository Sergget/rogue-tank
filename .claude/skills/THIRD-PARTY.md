# 第三方技能归属（THIRD-PARTY）

本目录下以下两个技能为外部引入，非本仓库原创：

| 本地路径 | 上游 | 版本 |
|---|---|---|
| `game-feel/` | https://github.com/gamedev-skills/awesome-gamedev-agent-skills `skills/disciplines/game-feel` | commit `19d93f97c9c1ea0f8b306e77aa81e0d3e352d3e9` |
| `physics-tuning/` | 同上仓库 `skills/disciplines/physics-tuning` | 同一 commit |
| `qa-plan/` `test-evidence-review/` `bug-triage/` `perf-profile/` | https://github.com/Donchitos/Claude-Code-Game-Studios `.claude/skills/<name>` | 2026-10-28 拉取（main） |
| `.claude/agents/{creative-director,lead-programmer,qa-lead,qa-tester}.md` | 同上 `.claude/agents/` | 同上 |
| `.claude/hooks/yaml-helper.sh` | 同上 `.claude/hooks/yaml-helper.sh` | 同上（MIT） |

- **许可**：Apache License 2.0，全文见本目录 `LICENSE-Apache-2.0.txt`。
- **引入方式**：整目录 vendor（`SKILL.md` + `references/`），未装上游 router、未装任何引擎包——上游默认安装为 router + 77 技能，其中 21 个是本仓库用不到的引擎技能。
- **本地改动**：仅在各 `SKILL.md` **末尾追加**「本仓库适配（rogue-tank）」一节，把上游的 Godot/Unity 示例映射到本仓库的模块与已知事故点（震屏落点、边界钳制顺序、`segRayIntersect` 扫掠、`renderCamPos` 渲染/物理分离）。正文其余部分保持原文，便于按上游 commit 比对升级。
- **未引入**：`three.js` / `Phaser` / `PixiJS` / `Godot` / `Unity` / `Unreal` 共 21 个引擎技能（本仓库是原生 Canvas + WebGL1 单 shader）；`create-game-assets`（与 2026-10-23「本仓库不出图」裁定冲突）；`roguelike`（上游假设网格回合制，与本仓库实时节点图不符）。

## Claude-Code-Game-Studios（2026-10-28，MIT）

**只引方法，不引流程。** 上游是一套自带钩子与目录约定的工作室流水线；整套安装会与 `AGENTS.md` 形成两套并行流程，并因 `PreToolUse` 钩子（`validate-write.sh` / `validate-read.sh` 等）在每次读写时触发而打断无人值守运行。故：

| 引入 | 用途 |
|---|---|
| `creative-director` | 战略决策：机制/地图等重大设计（产出 specs 主题页结论，供用户审核） |
| `lead-programmer` | 把战略拆成 `PLAN.md` 的可验收条目 |
| `qa-lead` | 测试范围/计划 + 通过判定 |
| `qa-tester` | 执行测试、报缺陷 |
| `qa-plan` / `test-evidence-review` / `bug-triage` / `perf-profile` | 上述四个角色的判定方法；各文件顶部已插入「本仓库适配」节，把 `design/`·`production/`·story 体系改指 specs / PLAN / ISSUES |
| `yaml-helper.sh` | 四个技能的 `!` 前奏依赖它；**读不到 `project.yaml` 时恒返回空并 exit 0**，故不创建 `project.yaml` 也不会报错 |

**明确不引入**：`settings.json`（15 个钩子）、上游 `CLAUDE.md`（与 `AGENTS.md` 冲突，且要求每次写入前询问）、`project.yaml` / `production/` 目录约定、`story-*` / `sprint-*` / `create-epics`（与 `PLAN.md` 重复）、`gate-check`（项目阶段门，会写 `project.yaml` 与 `production/stage.txt`）、全部引擎专员 agent。
