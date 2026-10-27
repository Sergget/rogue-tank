# Rogue Tank — 文档导航

> **摘要**：`docs/` 下四份主文档与五卷 specs 的关系、以及「我想干什么该读哪份」的决策表。
> **适用版本**：现行（2026-10-21）
> **相关**：[specs 总目录](./specs/README.md) · [Wiki 风格规范](./WIKI-STYLE.md) · [项目工作指引](../AGENTS.md)

## 文档地图

```
AGENTS.md                      ← 工作流唯一权威（分工、生命周期、命令）
.claude/                       ← Agent 配置（2026-10-27 由 .dsh/ 迁入）
    ├── agents/role-*.md       ← 6 个 subagent 角色卡（写域唯一权威）
    └── skills/                ← 流程 skill（roles / doc-workflow / verify / module / test）
└── docs/
    ├── README.md              ← 你在这里（总导航）
    ├── WIKI-STYLE.md          ← specs 的形态与写法规范（wiki 化）
    ├── DEVELOPMENT.md         ← 长期权威：§0 索引 / §1 方向 / §2 架构 / §3 状态 / §4 批次结论
    ├── PLAN.md                ← 临时：只存未完成待办
    ├── ISSUES.md              ← 临时：只存已核实的未修问题
    ├── ARCHIVE.md             ← 只读：完结条目索引（正文在 archive/<yyyy-mm>.md）
    ├── archive/               ← 归档分卷（严禁全文读取，按索引切片）
    └── specs/                 ← 系统规范的现行口径
        ├── README.md          ← specs 总目录（wiki 首页）
        ├── combat.md          ← §N 兼容索引（正文在 combat/）
        ├── map.md / cards.md / boss.md / editor.md    ← 同上
        └── combat/ map/ ...   ← 一主题一页的 wiki 正文
```

**关系一句话**：`DEVELOPMENT.md` 记「演进与状态」，`specs/` 记「现在怎么做」，`PLAN.md`/`ISSUES.md` 记「还没做完的」，`ARCHIVE.md` 记「做完归档的」。冲突时：**现行口径以 `specs/<卷>/` 为准，演进顺序以 `DEVELOPMENT.md`（§3 > §4 后条目）为准**。

## 我该读哪个

| 我想…… | 读这里 | 不要读 |
|---|---|---|
| 改代码前搞清某个机制现在怎么跑 | `specs/<卷>/` 对应主题页（从 [specs 总目录](./specs/README.md) 进） | 归档分卷 |
| 确认为什么某个数值是这个值 | 主题页里的「数值唯一口径」小节 → 再回 `js/tank_rules.js` / `js/tank_weapons.js` | 主题页的其它重复描述 |
| 查一个历史决定/为什么被推翻 | `specs/<卷>/changelog.md`、`DEVELOPMENT.md` §4、`ARCHIVE.md` | 主题页正文 |
| 追一个 `§N` 引用（代码注释/旧文档里） | `specs/<卷>.md`（兼容索引）→ 点「详见」 | — |
| 知道现在该做什么 | `DEVELOPMENT.md` §3 → `PLAN.md` §1 | `ISSUES.md`（只存问题） |
| 看某个已知 bug 修没修 | `ISSUES.md`（无条目 = 无已知未修问题） | — |
| 新增一个批次结论 | `DEVELOPMENT.md` §4 末尾续写新编号（见 `AGENTS.md` §2.2 四步） | 不要把结论只写进对话 |
| 拆分/新增 specs 页面 | [WIKI-STYLE.md](./WIKI-STYLE.md) | — |

## 三条硬规则

1. **`specs/<卷>.md` 的 `§N` 编号是外部契约**——只增不改、不重排。重组内容用 wiki 页，编号留兼容索引。
2. **同一数值只允许一个家**——主题页之间用链接，不复制数值。
3. **被推翻的结论不静默删除**——原文进 `changelog.md` 或 `## 沿革`，并标「已被 X 取代」。

## 相关页面
- [specs 总目录](./specs/README.md) — 五卷入口
- [Wiki 风格规范](./WIKI-STYLE.md) — 页面模板与链接语法
- [AGENTS.md](../AGENTS.md) — 工作流与文档生命周期
