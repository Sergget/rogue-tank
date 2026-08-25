# Rogue Tank — Sub-Agent Usage Guide

This project has **12 configured sub-agents** in `.opencode/agents/` plus **4 skills** in `.opencode/skills/`. Each is specialized for a subsystem of the tank roguelike codebase.

## 1. Agent vs. Skill — What's the difference?

| | Sub-Agent (agents/) | Skill (skills/) |
|---|---|---|
| **Invocation** | `/task {agent: tank-combat, description: ...}` or `@tank-combat` | `/skill shared-module-dev` |
| **Mode** | `subagent` — runs as isolated Task session | Injects instructions into current conversation |
| **Visibility** | Hidden ones (`test-runner`) run automatically; visible ones appear in `@` autocomplete | Always loaded on demand via `/skill` |
| **Config file** | `.opencode/agents/<name>.md` (YAML frontmatter) | `.opencode/skills/<name>/SKILL.md` |

## 2. Quick Reference: When to Use Each Agent

| You want to... | Use | Why |
|---|---|---|
| Fix shell flight, bounces, module damage, sigma/spread, abilities/shield/strike/dmgtext | `@tank-combat` | Owns `js/tank_physics.js`, `tank_fx.js`, `tank_dmgtext.js`, `tank_abilities/shield/strike.js`, battle wiring in mvp/bench |
| Edit tank polygons, armor faces, barrel presets | `@tank-designer` | Owns `tank_designer.html`, `tank_halfgeom.js`, `tank_geometry.js` |
| Add/change RULES config, modify tank JSON format | `@tank-model` | Owns `tank_rules.js`, `tank_model.js`, `tanks/*.json`, `tank_listio.js` |
| Tune cover system, map elements, smoke/vision, destructible terrain | `@map-cover` | Owns `tank_cover.js` (covers + smokeClouds + hasLineOfSight), collision logic |
| Build flow state machine, node maps, camera/minimap, drones, economy/save/revival | `@node-map` | Owns `tank_flow/map/camera/minimap/nodegen/drone/economy/revive/entity/move` |
| Tune enemy/friendly AI decisions, AI states, Boss stage behavior consumption | `@enemy-ai` | Owns `js/tank_ai.js` (+ `scripts/test-ai.js`); reads entity fields only, outputs `{turn, move, turretDesired, fire}` |
| Author card content (`cards/<id>.json`) | `@card-author` | Owns `cards/`, `js/tank_cards.js` schema；拟真坦克调性 + 稀有度/流派预算 |
| Author boss content (`bosses/<id>.json`) | `@boss-author` | Owns `bosses/`, `js/tank_boss.js`；多阶段机制 + 弱点驱动 |
| Audit card/boss balance & schema | `@balance-auditor` | 只读审计：`validate-content.js` / `audit-content.js` |
| Write/run tests, verify changes | `@test-runner` | Runs `npm run check` + `npm test` + `npm run test:browser` (hidden — auto-invoked) |
| Update documentation lifecycle | `@docs-agent` | Manages DEVELOPMENT.md/PLAN.md/ISSUES.md/ARCHIVE.md |
| Have a task that spans multiple areas | **Tab** 切到 `orchestrator` | Primary agent：路由到多个 specialist 并行干活（各自独立上下文），再跑验证与文档 |

## 3. Automatic Workflow Patterns

### Pattern A: Single-subsystem change
```
Tab 切到 orchestrator → Fix the fire DOT damage calculation in resolveHit — it should apply once per tick, not per frame
```
→ Orchestrator routes to `@tank-combat`, waits, then `@test-runner`, then `@docs-agent`.

### Pattern B: Multi-file change (e.g., new RULES field + combat logic)
```
Tab 切到 orchestrator → Add a new ammo type "APCR-2" with 1.5x speed, 0.9x penetration, and a trail color option in RULES
```
→ Orchestrator dispatches `@tank-model` (add to RULES.ammoTypes) and `@tank-combat` (implement flight behavior) **in parallel** — separate contexts — then merges results and runs `@test-runner`.

### Pattern B2: Boss stage behavior change (declarative contract)
```
Tab 切到 orchestrator → Give boss_rammer a new "ambush" stage AI mode that holds fire until the player crosses a distance threshold, then charges
```
→ Orchestrator dispatches `@boss-author` (stage `ai: {mode: 'ambush'}` in `bosses/*.json`) and `@enemy-ai` (dispatch branch + `RULES.boss.aiModes` entry via tank-model + test case) **in parallel**, then runs `@test-runner`. The boundary is the thin declarative contract: `applyBossStage` sets `entity.stageAI`, `aiDecideEnemy` consumes it.

### Pattern C: Verification only (skip implementation)
```
@test-runner Verify the current state after my last edits
```
→ Runs checks directly.

### Pattern D: Documentation cleanup
```
@docs-agent Move PLAN.md P-04 entry to DEVELOPMENT.md and archive it
```
→ Only edits `DEVELOPMENT.md`, `ARCHIVE.md`, deletes the PLAN entry. (bash denied — this agent can only edit docs.)

## 4. Direct @Mention (manual)

You can skip the orchestrator and call sub-agents directly with `@` (or `/task`):

```
@tank-combat Can you change the fire DOT from 10% to 15% per second?
@map-cover How does the tree->stump destruction chain work in tank_cover.js?
@tank-model Add a new field to FIELD_ROWS for traverseLimit documentation
```

## 5. Skills (for instructions, not isolation)

Skills inject guidance into your current conversation. Use when you want the **full Build agent** to work on a topic with specialized rules:

```
/skill shared-module-dev
/skill doc-workflow
/skill test-runner
```

- `shared-module-dev` → enforces loading order, dual exports, no duplicate declarations
- `doc-workflow` → enforces the 4-step doc lifecycle
- `test-runner` → embeds the verification protocol (check + test acceptance criteria)

## 6. Agent Status Flags Reference

The sub-agent configs watch for these **status variables** in the code:

| Variable | Monitored by | Location |
|---|---|---|
| `player.ammoKey` (1/2/3/4 → ap/apcr/he/heat) | tank-combat | `tank_mvp.html` / bench |
| `flow.state` (map/battle/settlement/reward/gameover) | node-map | `js/tank_flow.js` |
| `t.aiState`, `t.aiEngaged`, `t.stageAI.mode` | enemy-ai | `js/tank_ai.js` (set by caller/boss runtime) |
| `RULES.boss.aiModes` | enemy-ai / tank-model | `tank_rules.js` + `tank_ai.js` `_bossStageAIModes` |
| `invuln`, `invulnT`, `_dead` | tank-combat | entity state |
| `cover.hp`, `cover.tier` (+ `toTier` chain) | map-cover | `tank_cover.js` |
| `smokeClouds[]` | map-cover | `tank_cover.js` |
| `shell.dec`, `bounced`, `canBounce`, `absorbed` | tank-combat | shell object |
| `debuffs{}`, `cardEffects{}` | tank-combat / node-map | entity object |
| `turret.pivot`, `turret.axis`, `traverseLimit` | tank-designer | tank JSON |
| `RULES.*` fields | tank-model | `tank_rules.js` |

Monitor these when making cross-cutting changes — breaking one of these invariants is the most common source of regressions.
