# 视野与镜头

> **摘要**：视野系统已于 2026-09-30 整体退役，现在只剩视口剔除；镜头外延仍有效。
> **适用版本**：现行（2026-10-21）
> **源自**：`docs/specs/combat.md` §13.5、§8.7（2026-10-21 拆分）
> **相关**：[敌方 AI](./enemy-ai.md) · [HUD 与界面](./hud-ui.md) · [沿革与已作废](./changelog.md)

## 视野系统退役的现行后果

（原 §13.5，#J3，2026-09-30）

**用户裁定**：「改为全屏幕渲染敌人，不再计算视野距离的问题。敌人 AI 是否被触发维持为距离 + 是否有直线视野（建筑或草丛、树冠等）」。

### 现行口径（三条）

1. **敌对实体一律渲染、一律可被命中**——画面上只剩 `aabbInView` 视口剔除（**纯性能，不是玩法机制**）。
2. **`RULES.vision` 仅作历史配置留档**——`__TEST__.visionZoom()` 调试钩子仍读名义值，不参与任何渲染/命中/剔除判定。
3. **敌人 AI 的接战判定照旧是「距离 + 直线视野」**——`js/tank_ai.js` 的 `cfg.engageRequiresLoS`（`RULES.ai.engageRequiresLoS = true`）要求激活时 `hasLineOfSight` 通过；遮挡由 `js/tank_cover.js hasLineOfSight` 按掩体的 **`vision: true`** 键判定。**这条与视野距离系统彼此独立，视野退役不改变它。**

### 遮挡判据（`vision: true`）

| 遮视线 | 不遮视线 |
|---|---|
| 建筑 `full` / `building` / `intact` / `ruined` / `rock`、树 `tree`、灌木 `bush`、倒树 `fallen` | 栅栏 `soft`、沙袋 `barricade`、残骸、水 / 泥 / 路 |

> tier 全集与逐键取值以 `RULES.coverTiers` 为唯一口径，表格见 [地图规范 §12.1](../map.md)。

### 退役范围（全部删除，不留死开关）

- `js/tank_camera.js`：`visionRadiusForViewport` / `visionCenter` / `visionClamped` 三个视野圆几何函数及其导出。
- `tank_mvp.html`：`entityHiddenByVision` 的剔除逻辑（保留同名函数恒返回 `false` 以兼容既有调用点）、视野虚线圈绘制、`visionRadiusEff` 的卡牌加成与屏幕相对计算。
- `js/tank_devpanel.js` + mvp/bench 接线 + `types/globals.d.ts`：dev 面板「无视野」开关（`noVision`）——它控制的正是已下线的剔除，留着会误导调试者以为还有视野机制。
- `cards/support_commander_periscope.json`（车长潜望镜 +15%）与 `cards/sniper_commander_sight.json`（车长观瞄镜 +25%）：唯一消费者是可见半径，视野下线后成**死效果卡**，按 2026-09-23 A 档先例整体删除；`tank_cards.js` 的 `PASSIVE_KEYS` 移除 `commander_sight`。卡池 168 → 166。
- `tank_fire.js` 的 `hiddenByVision` 命中剔除钩子随视野系统一并移除（否则会出现「看得见却打不中」）。

### 回归锚点

`scripts/test-camera.js` 删除原 #H5/#K1 视野圆断言段（被测对象已不存在），保留 `aabbInView` 视口剔除与 `minZoom` 断言；`scripts/test-browser-r4.cjs` F3 段断言 `entityHiddenByVision` 恒 `false` 且 `hasLineOfSight` + `engageRequiresLoS` 仍在。

## 镜头随鼠标外延

（原 §8.7，#E12，2026-09-20；仍为现行）

`tank_camera.updateCameraLead(cam, screenX, screenY, dt)`：外延距离 = `RULES.vision.radius × RULES.camera.mouseLeadRatio`（现行 **0.40**，2026-10-21 按 `RULES.camera` 核对；沿革：本节首次落地时为 0.30）× 归一化鼠标偏移（0~1，视口半宽/半高为满值；对角方向按向量长度钳到 1），并按 `cam.zoom` 反向补偿（`mouseLeadZoomComp`，缩放不改变世界侧外延量），经 `leadLerp`(5) 指数阻尼平滑；`updateCamera` 把 `cam.leadX/leadY` 叠加到跟随目标上（视口中心 = 玩家 + 外延）。

未调用 `updateCameraLead` 时外延恒 0（与旧版跟随逐字节一致）。

> **为什么它没跟着视野一起退役**：镜头外延是**摄像机跟随**的平滑量，与「能否看见敌人」无关。2026-09-21 #H1 曾把外延并入「视野绑定」的几何推导（已随 #J3 作废），但外延本身仍在用——当前唯一消费方是 `updateCamera`。

## 相关页面
- [敌方 AI](./enemy-ai.md) — `engageRequiresLoS` 与掩体遮蔽
- [沿革与已作废](./changelog.md) — 视野等距 / 屏幕相对化 / 视野卡几何的完整历史
- [HUD 与界面](./hud-ui.md) — 小地图与视口相关 UI
- [地图规范](../map.md) — 掩体 `vision` 键的 tier 取值
