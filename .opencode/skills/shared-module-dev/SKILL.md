---
name: shared-module-dev
description: Use when adding or modifying shared JavaScript modules in js/ or adding scripts in prototypes (tank_mvp.html, tank_designer.html, tank_compare.html). Enforces global script order and dual Node/Browser exports.
---

# Rogue Tank — 共享 JS 模块开发与加载规范

项目 `js/` 目录下的共享模块在浏览器端是传统的全局 `<script>` 顺序加载（非 ES Module），在 Node 侧通过文件底部的双重导出支持 CommonJS 测试。

## 1. 严格的加载顺序

浏览器端没有 `import/export`，顶层声明自动挂载到全局窗口。必须严格遵守以下加载依赖顺序（所有原型页面与 HTML 需保持一致）：

1. `js/tank_rules.js` — **必须最先加载**（提供全局 `RULES` 配置）。
2. `js/tank_utils.js` — 数学与基础几何工具（`rotate`, `distToSegment`, `reflectDir`, `partCorners` 等）。
3. `js/tank_geometry.js` / `js/tank_cover.js` / `js/tank_halfgeom.js` —依赖 `RULES` 和 `utils`。
4. `js/tank_presets.js` / `js/tank_schema.js` — 字段与预设表。
5. `js/tank_model.js` — 依赖规则、几何与半形（`makeTank`, `applyTankConfig`, `computeStats`）。
6. `js/tank_move.js` / `js/tank_physics.js` / `js/tank_entity.js` / `js/tank_fx.js` / `js/tank_paint.js` / `js/tank_battledraw.js` — 高层战斗/渲染/物理系统（battledraw 在 paint 之后加载，依赖 tank_paint/tank_geometry/tank_cover）。
7. `js/tank_listio.js` — I/O 适配层。

## 2. 双重导出模式 (Dual-Environment Module Pattern)

所有 `js/tank_*.js` 模块顶部必须包含 `'use strict';`，底部必须包含 Node.js 兼容导出：

```javascript
'use strict';

// 模块逻辑，使用全局变量（如 RULES, rotate 等）
function myUtility() { ... }

// 底部双向兼容导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    myUtility,
  };
}
```

## 3. 开发注意事项与避坑法则

- **绝不重复声明顶层函数/变量**：如果某个工具函数（如 OBB 投影、旋转）在多个地方用到，统一提升收口至 `js/tank_utils.js`，避免在原型或别处重复声明。
- **单一实例**：`tank_entity.js` 中的 `entities` 数组是全局唯一实体注册表，不得在页面脚本中重新定义同名全局变量。
- **纯逻辑剥离**：核心计算逻辑（如弹道判定、散布计算、掩体暴露率）尽量编写为无 DOM、无 Canvas ctx 依赖的纯函数，以便在 `scripts/` 下编写 Node.js 脚本进行单元测试。
- **提交前校验**：修改或新增共享模块后，必须运行 `npm run check`（检测顶层函数重复及 HTML 脚本语法冒烟）与 `npm test`（运行逻辑单测）。
