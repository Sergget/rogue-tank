# 第三方技能归属（THIRD-PARTY）

本目录下以下两个技能为外部引入，非本仓库原创：

| 本地路径 | 上游 | 版本 |
|---|---|---|
| `game-feel/` | https://github.com/gamedev-skills/awesome-gamedev-agent-skills `skills/disciplines/game-feel` | commit `19d93f97c9c1ea0f8b306e77aa81e0d3e352d3e9` |
| `physics-tuning/` | 同上仓库 `skills/disciplines/physics-tuning` | 同一 commit |

- **许可**：Apache License 2.0，全文见本目录 `LICENSE-Apache-2.0.txt`。
- **引入方式**：整目录 vendor（`SKILL.md` + `references/`），未装上游 router、未装任何引擎包——上游默认安装为 router + 77 技能，其中 21 个是本仓库用不到的引擎技能。
- **本地改动**：仅在各 `SKILL.md` **末尾追加**「本仓库适配（rogue-tank）」一节，把上游的 Godot/Unity 示例映射到本仓库的模块与已知事故点（震屏落点、边界钳制顺序、`segRayIntersect` 扫掠、`renderCamPos` 渲染/物理分离）。正文其余部分保持原文，便于按上游 commit 比对升级。
- **未引入**：`three.js` / `Phaser` / `PixiJS` / `Godot` / `Unity` / `Unreal` 共 21 个引擎技能（本仓库是原生 Canvas + WebGL1 单 shader）；`create-game-assets`（与 2026-10-23「本仓库不出图」裁定冲突）；`roguelike`（上游假设网格回合制，与本仓库实时节点图不符）。
