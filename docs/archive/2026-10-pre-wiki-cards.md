# 2026-10-21 wiki 化拆分前快照 —— `docs/specs/cards.md`

> **来源**：`docs/specs/cards.md`（2026-10-21 wiki 化拆分前的单卷原文）
> **快照目的**：wiki 化是结构性破坏（正文从单卷迁到 `docs/specs/cards/` 的 9 个主题页）。万一迁移中有内容丢失，可据本快照逐节比对。
> **原文件实测**：**294 行 / 17 个 `##`+`###` 编号标题**（含 §0 主题索引）
> **当前状态**：`docs/specs/cards.md` 已改为 §N 兼容索引页；正文见 [cards/index.md](../specs/cards/index.md)。
> **规范**：`docs/WIKI-STYLE.md`

---

## 为什么这里不是逐字转载

本文件原本计划内联 294 行原文。实测该路径在沙箱下**只允许创建、不允许二次写入**（`write` 可建文件，但随后任何 append / 覆盖 / 删除均被拒：PowerShell、`cmd`、`.NET File.Open`、`node fs` 全部返回 `EPERM` / `Access denied`）。因此改用**等价且更可靠**的留存方式：

1. **原文在 git 对象库里逐字保存**——拆分前的 `docs/specs/cards.md` 已随提交 **`57be2ca`**（`docs(specs): 五卷主题化重构 —— 卷首主题索引 + 数值去重 + 实质错误修正（编号零变更）`）入库。
2. **可随时还原**（在仓库根目录执行）：

```bash
# 查看原文
git show 57be2ca:docs/specs/cards.md | less

# 还原成文件（另存，不覆盖兼容索引页）
git show 57be2ca:docs/specs/cards.md > /tmp/cards-pre-wiki.md
```

3. 下方给出**分节行号清单**，即使不还原全文，也能按节定位到上面的 git 原文里核对任何一段。

## 分节行号清单（拆分前 `cards.md`）

| 节 | 行范围 | 节 | 行范围 |
|---|---|---|---|
| §0 主题索引 | 8–36 | §8.2 基础数值梯度 | 151–164 |
| §1 设计定位 | 37–40 | §8.3 机制卡定案 | 165–199 |
| §2 数据契约 | 41–56 | §8.4 技能卡定案 | 200–220 |
| §3 七大效果类型 | 57–90 | §8.5 技能卡总表 | 221–240 |
| §4 稀有度分层与流派 | 91–99 | §9 装备优先抽卡 | 241–267 |
| §5 堆叠与验证工具链 | 100–109 | §10 升级覆盖面 | 268–284 |
| §6 被动卡接线结论 | 110–130 | §11 局内卡牌查看器 | 285–293 |
| §7 模块暴击修饰器 | 131–138 | — | — |
| §8 三板块设计定稿（引言） | 139–145 | — | — |
| §8.1 设计裁定 | 146–150 | — | — |

## 拆分后页面映射（原节 → 主题页）

| 原节 | 目标页 |
|---|---|
| §0 | [cards/index.md](../specs/cards/index.md)（吸收为主题导航） |
| §1、§2 | [overview-contract.md](../specs/cards/overview-contract.md) |
| §3 | [effect-types.md](../specs/cards/effect-types.md) |
| §4、§5 | [rarity-tools.md](../specs/cards/rarity-tools.md) |
| §6、§7 | [passive-crit.md](../specs/cards/passive-crit.md) |
| §8、§8.1、§8.2、§8.4、§8.5 | [design-blocks.md](../specs/cards/design-blocks.md) |
| §8.3 | [weapon-cards.md](../specs/cards/weapon-cards.md)（35 行独立成页） |
| §9 | [draw-rules.md](../specs/cards/draw-rules.md) |
| §10 | [upgrade-coverage.md](../specs/cards/upgrade-coverage.md) |
| §11 | [card-viewer.md](../specs/cards/card-viewer.md) |
| 各节沿革（tags 下线 / commander_sight / startScore / P-42 tag 维度） | [changelog.md](../specs/cards/changelog.md) |

> **若将来需要把原文内联进本文件**，请在**沙箱外**（或获得写权限后）执行上表第 2 条命令并追加到本文件末尾即可。
