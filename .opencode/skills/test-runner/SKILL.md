---
name: test-runner
description: Use when running test and syntax check commands in rogue-tank to verify codebase health.
---

# Rogue Tank — Test & Check Skill

Use this skill whenever running or verifying tests and syntax checks in `rogue-tank`.

## Key Commands

- `npm run check`: Executes syntax checks on `js/*.js`, `server.js`, and inline scripts in `tank_*.html` prototypes AND runs `tsc --noEmit` type checking.
- `npm test`: Runs Node-based unit test suite (`scripts/test-covers.js`, `scripts/test-tanks.js`, `scripts/test-hitpart.js`, `scripts/test-tankcollision.js`).

## Acceptance Criteria

1. Both `npm run check` and `npm test` MUST exit with status 0 and show `All checks passed` / no failed test assertions.
2. If adding new modules in `js/`, ensure they are checked by `scripts/check-html.js` and included in `tsconfig.json`.
