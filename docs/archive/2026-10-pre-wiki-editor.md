# 2026-10-21 wiki 化拆分前快照 —— `docs/specs/editor.md`

> **来源**：`docs/specs/editor.md`（2026-10-21 wiki 化拆分前的单卷原文）
> **快照目的**：wiki 化是结构性破坏（正文从单卷迁到 `docs/specs/editor/` 的 8 个主题页）。万一迁移中有内容丢失，可据本快照逐节比对。
> **原文件实测**：**272 行 / 22 个 `##`+`###` 编号标题**（含 §0 主题索引）
> **⚠️ 原文件的 §7.5 位置异常**：编号为 7.5，但**物理位置错排**在 §7.6 / §7.7 之后（原顺序 7.4 → 7.6 → 7.7 → **7.5**）。拆分时已按编号顺序落位，**编号文字未改**。
> **当前状态**：`docs/specs/editor.md` 已改为 §N 兼容索引页；正文见 [editor/index.md](../specs/editor/index.md)。
> **规范**：`docs/WIKI-STYLE.md`

---

## 为什么这里不是逐字转载

本文件原本计划内联 272 行原文。实测该路径在沙箱下**只允许创建、不允许二次写入**（`write` 可建文件，但随后任何 append / 覆盖 / 删除均被拒：PowerShell、`cmd`、`.NET File.Open`、`node fs` 全部返回 `EPERM` / `Access denied`）。因此改用**等价且更可靠**的留存方式：

1. **原文在 git 对象库里逐字保存**——拆分前的 `docs/specs/editor.md` 已随提交 **`57be2ca`**（`docs(specs): 五卷主题化重构 —— 卷首主题索引 + 数值去重 + 实质错误修正（编号零变更）`）入库。
2. **可随时还原**（在仓库根目录执行）：

```bash
# 查看原文
git show 57be2ca:docs/specs/editor.md | less

# 还原成文件（另存，不覆盖兼容索引页）
git show 57be2ca:docs/specs/editor.md > /tmp/editor-pre-wiki.md
```

3. 下方给出**分节行号清单**，即使不还原全文，也能按节定位到上面的 git 原文里核对任何一段。

## 分节行号清单（拆分前 `editor.md`，按**文件物理顺序**）

| 节 | 行范围 | 备注 |
|---|---|---|
| §0 主题索引 | 8–36 | |
| §1 坦克设计器 | 37–48 | |
| §2 参数对比页 | 49–61 | |
| §3 字段架构表 | 62–69 | |
| §4 资产烘焙工具 | 70–75 | |
| §5 P-49 模块/成员概率分区 | 76–92 | |
| §6 坦克贴图与战术涂装视觉规范 | 93–128 | |
| §7 开发者面板（引言） | 129–137 | |
| §7.1 mvp 开发者面板 | 138–151 | |
| §7.2 卡牌选择器 | 152–161 | |
| §7.3 两页按键/文案统一 | 162–169 | |
| §7.4 HUD 渲染实现级合并 | 170–180 | |
| §7.6 内容工具与预览（NF-*） | 199–208 | **物理顺序在 7.5 之前** |
| §7.7 未纳入本轮 | 209–216 | **物理顺序在 7.5 之前** |
| §7.5 浏览器自动化测试链 | 181–198 | **编号 7.5，原位置在 7.7 之后** |
| §8 2026-10-20 批次（引言） | 217–221 | |
| §8.1 `applyTankConfig` 深拷贝 `spec.appearance` | 222–229 | |
| §8.2 叠加层基准与 `tank_paint.js` 统一 | 230–239 | |
| §8.3 `RULES.enemyAnchorBase.aimSpeed` | 240–253 | |
| §8.4 bench 卡牌面板按稀有度分组 | 254–261 | |
| §8.5 `content_designer.html` tags 编辑器移除 | 262–268 | |
| §8.6 设计器三项 | 269–271 | |

> **行号说明**：为让「物理错序」一目了然，上表按文件真实行序排列（7.6/7.7 在 7.5 之前），而非按编号排序。

## 拆分后页面映射（原节 → 主题页）

| 原节 | 目标页 |
|---|---|
| §0 | [editor/index.md](../specs/editor/index.md)（吸收为主题导航） |
| §1 | [designer.md](../specs/editor/designer.md) |
| §2、§3 | [compare-schema.md](../specs/editor/compare-schema.md) |
| §4、§5 | [bake-modules.md](../specs/editor/bake-modules.md) |
| §6 | [visual-spec.md](../specs/editor/visual-spec.md) |
| §7、§7.1、§7.2、§7.3、§7.4 | [devpanel.md](../specs/editor/devpanel.md) |
| §7.5 | [browser-tests.md](../specs/editor/browser-tests.md) |
| §7.6、§8、§8.1~§8.6 | [appearance-aimspeed.md](../specs/editor/appearance-aimspeed.md) |
| §7.7、§2 的精度沿革、§8.2/§8.3 的沿革 | [changelog.md](../specs/editor/changelog.md) |

> **若将来需要把原文内联进本文件**，请在**沙箱外**（或获得写权限后）执行上表第 2 条命令并追加到本文件末尾即可。
