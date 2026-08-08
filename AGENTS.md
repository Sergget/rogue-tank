# Rogue Tank Agent Instructions

This document provides high-signal guidance for OpenCode agents working on the Rogue Tank project.

## Project Overview
- **Type**: Node-based map progression + in-game score-driven construction tactical tank Roguelike (top-down 2D).
- **Core Prototypes**:
    - `tank_mvp.html`: Full-screen Canvas prototype for core combat feel.
    - `tank_designer.html`: Polygon vertex editor for tank geometries and armor.
    - `tank_compare.html`: Tabular tank data comparison/editing page.
- **Shared Modules** (`js/`): `tank_model.js` (tank config/stat math), `tank_geometry.js` (polygons/raycast), `tank_physics.js`, `tank_cover.js`, `tank_rules.js` (all tunable mechanism constants), `tank_paint.js`, `tank_entity.js`, `tank_halfgeom.js`, `tank_fx.js`, `tank_utils.js`.

## Documentation Map (read before starting work)

Each doc has one clear job. **`PLAN.md` 与 `ISSUES.md` 是临时文档**：只存放"未验证/未完成"的工作，条目完成即删除；`DEVELOPMENT.md` 是唯一的长期权威文档；被删除的条目原文归档进 `ARCHIVE.md`。

| Doc | 角色 | Responsibility | Update when | Lifecycle |
|---|---|---|---|---|
| `DEVELOPMENT.md` | 长期权威 | Project-level strategy: finalized design decisions, system status, tech debt, open questions, suggested next steps. | A design decision is finalized, a system is implemented, tech debt is paid down, or an entry's conclusion lands. | 长期维护，唯一可信来源。 |
| `PLAN.md` | **临时** | Near-term concrete development plan: features/refactors with execution plan, dependencies, validation path, decision checklist. | Planning upcoming work, or updating status of an in-flight item (it's a plan, not a commitment). | 条目实现并验证完成后**删除该条目**。 |
| `ISSUES.md` | **临时** | **Verified** problems only: reproducible evidence (`file:line` + scenario), root cause, impact, status (`待处理`/`处理中`/`已解决`). | A confirmed issue is found (add numbered entry) or an existing one gets fixed. | 修复验证有效后**删除该条目**。 |
| `ARCHIVE.md` | 只读归档 | 从 PLAN/ISSUES 删除的完整条目的**原文**（按删除日期分组，标注来源文档与条目编号）。 | 任意条目走完生命周期被删除时。 | 只增不删。 |
| `AGENTS.md` (this file) | Agent workflow guidance: overview, commands, architecture, task doc division of labor. | Workflow or conventions change. | — |

Conventions:
- Never invent "suspected but unproven" issues — verify with code evidence first, then record in `ISSUES.md`.
- **条目的 4 步生命周期（删除必走，缺一不可）** —— 当修复确认有效 / 功能实现并验证通过后：
  1. **同步**：先把结论写入 `DEVELOPMENT.md`（§2 定型设计 / §3 已实现系统 / §5.5 数值表 / §6 下一步顺序），确保 DEVELOPMENT.md 不依赖该条目也能独立说明；
  2. **删除**：从 `PLAN.md` / `ISSUES.md` 中删除对应条目；
  3. **归档**：将被删条目的**原文**追加到 `ARCHIVE.md`（标注来源文档、条目编号、删除日期）；
  4. 若结论影响后续规划顺序，同步更新 DEVELOPMENT.md §6。
- 未验证完成的条目**不得提前删除**（保持 `待处理`/`处理中` 状态即可）。
- When a dialog confirms a design decision / completes a plan item / fixes an issue, run the 4-step lifecycle above before finishing, so decisions don't live only in chat history.
- If doc descriptions conflict, `DEVELOPMENT.md`'s "已定型设计与决策" section is authoritative (ARCHIVE.md 仅供参考追溯，不参与判定)。

## Key Development Workflows

### Running the Prototypes (dev server — required, not optional)
- Both prototypes must be served over HTTP — they `fetch('tank_list.json')` and load the shared `js/tank_paint.js`, neither of which works when opened directly via `file://`.
- Start the local server with `npm start` (or `npm run dev`, or double-click `start.bat`), then open:
    - `http://127.0.0.1:8000/` → tank_mvp.html (default port 8000; override with `PORT=9000`)
    - `http://127.0.0.1:8000/tank_designer.html`
    - `http://127.0.0.1:8000/tank_compare.html`
- `npm run check` runs a syntax smoke check over the shared module, `server.js`, and every inline `<script>` in both prototypes (no browser needed).

### Testing Tank Combat
- Launch `tank_mvp.html` via the dev server.
- Use the "Tank Selection" dropdown in the HUD to load different tank configurations from `tank_list.json` for comparison.

### Designing & Testing Tank Geometries
- Launch `tank_designer.html` via the dev server.
- This tool allows editing hull/turret polygons, armor per-face, and testing armor penetration (「甲弹对抗」 mode).
- Saving in the designer writes back to `tank_list.json` (`POST /api/tank_list`); reloading the list in `tank_mvp.html`/`tank_compare.html` picks up the change (`applyTankConfig()` in `js/tank_model.js`).

### Architecture Notes
- **Node-based Map**: The game uses a node-based map progression, not infinite waves. Each node is a distinct, bounded battlefield.
- **Cover System**:
    - `full` (full-height) cover provides 100% deterministic block.
    - `half` (half-height) cover uses a probabilistic model based on distance, relative positions, and multiple cover multipliers.
- **Ricochet**: Projectiles can genuinely ricochet off surfaces at incidence angles >70°, potentially causing secondary hits. Secondary ricochets are not allowed.
- **Entities Registry**: Centralized `entities` array (`id`, `team`, `spawn`) manages all in-game units (player, enemies, etc.) via `isHostile`, `nearestEnemyTo`, `resetEntity`.

## High-Priority Technical Debt / Next Steps (from `DEVELOPMENT.md`)
1.  **Attribute System**: Implement `base`/`modifiers`/`stats` three-layer structure for all tank attributes. This is critical for card-based upgrades and skills.
2.  **Map & Camera**: Implement Camera + Node Map + Mini-map systems, including random node content generation.
3.  **Enemy AI**: Implement enemy AI (active when near camera, passive when far) and friendly strongholds (passive defense, score contribution).
4.  **Death/Resurrection**: Implement the death and resurrection state machine.
