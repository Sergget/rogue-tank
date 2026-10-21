# Boss 运行时机制

> **摘要**：`makeBossEntity` / `applyBossStage` / `updateBossStage` 的四条骨架与几何放大契约。
> **适用版本**：现行（2026-10-21）
> **源自**：`docs/specs/boss.md` §3、§5 第 1 条（2026-10-21 拆分）
> **相关**：[定位与数据契约](./overview-contract.md) · [数值倍率与难度叠加](./scaling.md) · [行为与弱点](./behavior.md)

## 运行时四件套

（原 §3）

- **阶段切换**：血量阈值触发 `applyBossStage` —— 挂 `run` scope modifiers（数值强度跃升），run 结束清除。
- **随从 `summons`**：入场 `spawnTank` 伴随单位（`team:enemy`，`nodeSpawn` 标记计入清敌判定）；复用同一敌对 AI 双态状态机。
- **击败掉落 `loot.score`**：`finishNode` 时叠加进节点通关得分。
- **AI 复用**：Boss 与 summons 走 `aiDecideEnemy` 同一管线（含 P-19 多态状态机 Stunned/Flank/Defensive/Search&Destroy/Patrol）。

## 几何放大

（原 §5 第 1 条）

`makeBossEntity` 在 `configureTank` 后按 `boss.scale`（现统一 **2.0**）缩放：

`hullSpec.verts` / `turretSpec.verts` / `hullLen` / `hullWid` / `turLen` / `turWid` / `turretPivotOffset` / `anchors` / `trackWidth` / `trackOffset`；**`turret barrel.len` 不缩放**（随 `turLen` 比例放大）。

> **#B6 修订（2026-09-16）：缩放为整体替换新对象，绝不原地写共享 spec**——曾因原地 `*=` 污染 `tankListData` 缓存导致炮塔跨节点雪球前移，见 `DEVELOPMENT.md` §4.18。

## 相关页面
- [定位与数据契约](./overview-contract.md) — `bosses/*.json` 的 `tankId` / `stages`
- [数值倍率与难度叠加](./scaling.md) — 阶段 modifiers 与 tuning 的叠乘关系
- [行为与弱点](./behavior.md) — AI 管线与阶段行为脚本
