# Rogue Tank — 工程问题清单（已核实）

> **本文档是临时文档**：只存放**待处理 / 处理中**的已核实问题。
> 条目**修复并验证有效后**，按 `AGENTS.md` 定义的 4 步生命周期：先把结论同步进 `DEVELOPMENT.md` → **删除本条目** → 原文归档到 `ARCHIVE.md`。

## QA Test Infrastructure Issues（2026-08-19）

### #27 test-qa.js: missing global.TAU shim
- **File**: `scripts/test-qa.js`
- **Issue**: Missing `global.TAU = U.TAU` shim required by QA compliance check
- **Impact**: QA compliance check fails; does not affect game code or runtime
- **Status**: 待处理

### #28 test-qa.js: missing global.RULES shim
- **File**: `scripts/test-qa.js`
- **Issue**: Missing `global.RULES = RULES_MOD.RULES` shim required by QA compliance check
- **Impact**: QA compliance check fails; does not affect game code or runtime
- **Status**: 待处理

### #29 QA script has issues - review above
- **File**: `scripts/test-qa.js`
- **Issue**: QA script self-check reports 5/6 checks passed but has above issues
- **Impact**: Developer workflow interruption; does not affect game code
- **Status**: 待处理

### #30 test-audio.js: missing require('../js/tank_utils.js')
- **File**: `scripts/test-audio.js`
- **Issue**: Missing `require('../js/tank_utils.js')` at top of script
- **Impact**: Test script cannot run; does not affect game code or audio system
- **Status**: 待处理

### #31 test-audio.js: missing require('../js/tank_rules.js')
- **File**: `scripts/test-audio.js`
- **Issue**: Missing `require('../js/tank_rules.js')` at top of script
- **Impact**: Test script cannot run; does not affect game code or audio system
- **Status**: 待处理

### #32 test-boss.js: missing require('../js/tank_utils.js')
- **File**: `scripts/test-boss.js`
- **Issue**: Missing `require('../js/tank_utils.js')` at top of script
- **Impact**: Test script cannot run; does not affect boss code
- **Status**: 待处理

### #33 test-boss.js: missing require('../js/tank_rules.js')
- **File**: `scripts/test-boss.js`
- **Issue**: Missing `require('../js/tank_rules.js')` at top of script
- **Impact**: Test script cannot run; does not affect boss code
- **Status**: 待处理

### #34 test-camera.js: missing require('../js/tank_utils.js')
- **File**: `scripts/test-camera.js`
- **Issue**: Missing `require('../js/tank_utils.js')` at top of script
- **Impact**: Test script cannot run; does not affect camera code
- **Status**: 待处理

### #35 test-camera.js: missing require('../js/tank_rules.js')
- **File**: `scripts/test-camera.js`
- **Issue**: Missing `require('../js/tank_rules.js')` at top of script
- **Impact**: Test script cannot run; does not affect camera code
- **Status**: 待处理

### #36 test-card-effects.js: missing require('../js/tank_utils.js')
- **File**: `scripts/test-card-effects.js`
- **Issue**: Missing `require('../js/tank_utils.js')` at top of script
- **Impact**: Test script cannot run; does not affect card effects code
- **Status**: 待处理

### #37 test-cards.js: missing require('../js/tank_utils.js')
- **File**: `scripts/test-cards.js`
- **Issue**: Missing `require('../js/tank_utils.js')` at top of script
- **Impact**: Test script cannot run; does not affect cards code
- **Status**: 待处理

### #38 test-dmgtext.js: missing require('../js/tank_utils.js')
- **File**: `scripts/test-dmgtext.js`
- **Issue**: Missing `require('../js/tank_utils.js')` at top of script
- **Impact**: Test script cannot run; does not affect dmgtext code
- **Status**: 待处理

### #39 test-dmgtext.js: missing require('../js/tank_rules.js')
- **File**: `scripts/test-dmgtext.js`
- **Issue**: Missing `require('../js/tank_rules.js')` at top of script
- **Impact**: Test script cannot run; does not affect dmgtext code
- **Status**: 待处理

### #40 test-economy.js: missing require('../js/tank_utils.js')
- **File**: `scripts/test-economy.js`
- **Issue**: Missing `require('../js/tank_utils.js')` at top of script
- **Impact**: Test script cannot run; does not affect economy code
- **Status**: 待处理

### #41 test-extreme-geometry.js: missing global.TAU shim
- **File**: `scripts/test-extreme-geometry.js`
- **Issue**: Missing `global.TAU = U.TAU` shim
- **Impact**: QA compliance check fails; does not affect geometry code
- **Status**: 待处理

### #42 test-flow.js: missing require('../js/tank_utils.js')
- **File**: `scripts/test-flow.js`
- **Issue**: Missing `require('../js/tank_utils.js')` at top of script
- **Impact**: Test script cannot run; does not affect flow code
- **Status**: 待处理

### #43 test-flow.js: missing require('../js/tank_rules.js')
- **File**: `scripts/test-flow.js`
- **Issue**: Missing `require('../js/tank_rules.js')` at top of script
- **Impact**: Test script cannot run; does not affect flow code
- **Status**: 待处理

### #44 test-flow.js: only 0 edge-case patterns found (expected >= 3 for robustness coverage)
- **File**: `scripts/test-flow.js`
- **Issue**: Only 0 edge-case patterns found, expected >= 3 for robustness coverage
- **Impact**: Reduced test robustness; does not affect flow code
- **Status**: 待处理

### #45 test-hitpart.js: missing global.TAU shim
- **File**: `scripts/test-hitpart.js`
- **Issue**: Missing `global.TAU = U.TAU` shim
- **Impact**: QA compliance check fails; does not hitpart code
- **Status**: 待处理

### #46 test-map.js: missing require('../js/tank_utils.js')
- **File**: `scripts/test-map.js`
- **Issue**: Missing `require('../js/tank_utils.js')` at top of script
- **Impact**: Test script cannot run; does not affect map code
- **Status**: 待处理

### #47 test-map.js: missing global.TAU shim
- **File**: `scripts/test-map.js`
- **Issue**: Missing `global.TAU = U.TAU` shim
- **Impact**: QA compliance check fails; does not affect map code
- **Status**: 待处理

### #48 test-modifiers.js: missing require('../js/tank_utils.js')
- **File**: `scripts/test-modifiers.js`
- **Issue**: Missing `require('../js/tank_utils.js')` at top of script
- **Impact**: Test script cannot run; does not affect modifiers code
- **Status**: 待处理

### #49 test-modifiers.js: only 0 edge-case patterns found (expected >= 3 for robustness coverage)
- **File**: `scripts/test-modifiers.js`
- **Issue**: Only 0 edge-case patterns found, expected >= 3 for robustness coverage
- **Impact**: Reduced test robustness; does not affect modifiers code
- **Status**: 待处理

### #50 test-nodegen.js: missing require('../js/tank_utils.js')
- **File**: `scripts/test-nodegen.js`
- **Issue**: Missing `require('../js/tank_utils.js')` at top of script
- **Impact**: Test script cannot run; does not affect nodegen code
- **Status**: 待处理

### #51 test-nodegen.js: missing global.TAU shim
- **File**: `scripts/test-nodegen.js`
- **Issue**: Missing `global.TAU = U.TAU` shim
- **Impact**: QA compliance check fails; does not affect nodegen code
- **Status**: 待处理

### #52 test-nodegen.js: missing global.RULES shim
- **File**: `scripts/test-nodegen.js`
- **Issue**: Missing `global.RULES = RULES_MOD.RULES` shim
- **Impact**: QA compliance check fails; does not affect nodegen code
- **Status**: 待处理

### #53 test-revive.js: missing require('../js/tank_utils.js')
- **File**: `scripts/test-revive.js`
- **Issue**: Missing `require('../js/tank_utils.js')` at top of script
- **Impact**: Test script cannot run; does not affect revive code
- **Status**: 待处理

### #54 test-revive.js: missing global.TAU shim
- **File**: `scripts/test-revive.js`
- **Issue**: Missing `global.TAU = U.TAU` shim
- **Impact**: QA compliance check fails; does not affect revive code
- **Status**: 待处理

### #55 test-tanks.js: missing require('../js/tank_utils.js')
- **File**: `scripts/test-tanks.js`
- **Issue**: Missing `require('../js/tank_utils.js')` at top of script
- **Impact**: Test script cannot run; does not affect tanks code
- **Status**: 待处理

### #56 test-tanks.js: missing global.TAU shim
- **File**: `scripts/test-tanks.js`
- **Issue**: Missing `global.TAU = U.TAU` shim
- **Impact**: QA compliance check fails; does not affect tanks code
- **Status**: 待处理

### #57 test-tanks.js: missing global.RULES shim
- **File**: `scripts/test-tanks.js`
- **Issue**: Missing `global.RULES = RULES_MOD.RULES` shim
- **Impact**: QA compliance check fails; does not affect tanks code
- **Status**: 待处理

### #60 audit-content.js: 无警告但分布异常
- **File**: `scripts/audit-content.js`
- **Issue**: 卡牌稀有度/流派/效果类型分布与预期略有偏差（common 55张/49.5% 期望~50%，legendary 6张/5.4% 期望~5%）。无实际影响，仅为统计分布差异。
- **Impact**: 无，仅为抽卡概率统计差异
- **Status**: 待处理

---

> 已解决并归档的历史条目（#1~#26 及修复记录、附注特性）：见 `ARCHIVE.md`.

---