# Rogue Tank Agent Instructions

This document provides high-signal guidance for OpenCode agents working on the Rogue Tank project.

## Project Overview
- **Type**: Node-based map progression + in-game score-driven construction tactical tank Roguelike (top-down 2D).
- **Core Prototypes**:
    - `tank_mvp.html`: Single-file Canvas prototype for core combat feel.
    - `tank_designer.html`: Polygon vertex editor for tank geometries and armor.

## Key Development Workflows

### Running the Prototypes (dev server — required, not optional)
- Both prototypes must be served over HTTP — they `fetch('tank_list.json')` and load the shared `js/tank_paint.js`, neither of which works when opened directly via `file://`.
- Start the local server with `npm start` (or `npm run dev`, or double-click `start.bat`), then open:
    - `http://127.0.0.1:8000/` → tank_mvp.html (default port 8000; override with `PORT=9000`)
    - `http://127.0.0.1:8000/tank_designer.html`
- `npm run check` runs a syntax smoke check over the shared module, `server.js`, and every inline `<script>` in both prototypes (no browser needed).

### Testing Tank Combat
- Launch `tank_mvp.html` via the dev server.
- Use the "Tank Selection" dropdown in the HUD to load different tank configurations from `tank_list.json` for comparison.

### Designing & Testing Tank Geometries
- Launch `tank_designer.html` via the dev server.
- This tool allows editing hull/turret polygons, armor per-face, and testing armor penetration.
- **Important**: The JSON exported from `tank_designer.html` is *not* automatically loaded by `tank_mvp.html`. Manual integration into `tank_mvp.html`'s hardcoded shapes is currently required for testing changes in the main prototype.

### Architecture Notes
- **Node-based Map**: The game uses a node-based map progression, not infinite waves. Each node is a distinct, bounded battlefield.
- **Cover System**:
    - `full` (full-height) cover provides 100% deterministic block.
    - `half` (half-height) cover uses a probabilistic model based on distance, relative positions, and multiple cover multipliers.
- **Ricochet**: Projectiles can genuinely ricochet off surfaces at incidence angles >78°, potentially causing secondary hits. Secondary ricochets are not allowed.
- **Entities Registry**: Centralized `entities` array (`id`, `team`, `spawn`) manages all in-game units (player, enemies, etc.) via `isHostile`, `nearestEnemyTo`, `resetEntity`.

## High-Priority Technical Debt / Next Steps (from `DEVELOPMENT.md`)
1.  **Attribute System**: Implement `base`/`modifiers`/`stats` three-layer structure for all tank attributes. This is critical for card-based upgrades and skills.
2.  **Map & Camera**: Implement Camera + Node Map + Mini-map systems, including random node content generation.
3.  **Enemy AI**: Implement enemy AI (active when near camera, passive when far) and friendly strongholds (passive defense, score contribution).
4.  **Death/Resurrection**: Implement the death and resurrection state machine.
