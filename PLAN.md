# 功能与重构计划（Features & Refactoring Plan）

> 本文档是**临时文档**：只存放 "进行中 / 待实施" 的计划条目。
> 条目**实现并验证完成后**，按 `AGENTS.md` 定义的 4 步生命周期：先把结论同步进 `DEVELOPMENT.md` → **删除本条目** → 原文归档到 `ARCHIVE.md`。
> 本文档不保存已完成的历史（历史计划见 `ARCHIVE.md`）。

---

## 当前进行中条目

### P-09 卡牌/Boss 数据驱动框架 + 内容批量（进行中）

**阶段 A —— 框架 + 工具 + 示例（已完成 2026-08-15）**：卡牌/Boss schema（`js/tank_cards.js` / `js/tank_boss.js` 纯逻辑）、一型一文件 `cards/`+`bosses/` + `/api/cards`+`/api/bosses` 端点、`scripts/validate-content.js` + `scripts/audit-content.js`、`tools/content_designer.html` 编辑器、子 agent `@card-author`/`@boss-author`/`@balance-auditor`、示例内容（11 卡 + 1 Boss）。定型见 DEVELOPMENT §2.13/§2.14，验证见 §3.8。

**阶段 B —— 内容批量（待实施）**：
- **卡牌 ≥100 张**：稀有度分布按权重 common 50% / rare 30% / epic 15% / legendary 5%，5 流派（重甲/狙击/机动/爆破/支援）全覆盖；效果类型覆盖 modifier/ammo/ability/passive/drone/economy 六类；拟真坦克主题。
- **Boss ≥5 种**：强化坦克 + 多阶段机制（每阶段换打法/弱点/威胁），打法彼此区分；5 Boss 提案见 DEVELOPMENT §2.14。
- **Boss 运行时接入**：节点链末端为 Boss 战（生成 boss 实体、阶段触发、掉落结算）。
- 验证：`node scripts/validate-content.js` 通过、`node scripts/audit-content.js --strict` 无警告、`npm test` 全绿。

---

## 后续里程碑缺口清单（规划中，非近期；归属一览）

以下缺口为 2026-08-13 规划讨论确认的后续里程碑构成项（设计决策见 DEVELOPMENT.md §2.10/§2.11/§5.6），具体执行方案在对应里程碑启动时细化；排期顺序以 DEVELOPMENT.md §6 为准。

| 缺口 | 归属里程碑（DEVELOPMENT.md §6） | 状态 |
|---|---|---|
| 视线遮挡查询函数（`vision:true` 目前只有渲染、无"两点间视线是否被遮"判定；敌人 AI 索敌（开放问题 1）与玩家被发现判定的公共前置；实现为纯函数模块） | 条目 7 敌人 AI 双态 + 友军据点 | 待实施 |
| 玩家进度持久化（存档）（永久升级 + 死亡时局内得分→商店点数转化需要 localStorage；定存档结构/写入时机/版本化） | 条目 10 经济与数值落地 | 待实施 |
| 卡牌池/商店商品/永久升级树内容设计（modifiers 管道就绪但无内容，纯设计工作） | 条目 10 经济与数值落地 | 待实施 |
| 坦克车型多样性（所有 `tanks/` 条目共用箭镞车体+豹2A6炮塔模板，差异只在数值；需定型几何模板 + 多色/迷彩方案，设计器已支持缺内容资产） | 条目 11 坦克纹理化 + 车型多样性内容 | 待实施 |

> 2026-08-15 已删除并归档：条目 6 摄像机 + 节点地图 + 小地图（含流程状态机 / UI 界面层约定 / 性能剔除三个捆绑前置）——P-08 已完成，原文见 `ARCHIVE.md`。
