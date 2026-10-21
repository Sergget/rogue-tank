# 对比页与字段架构表

> **摘要**：`tank_compare.html` 的表格编辑、单位直标与四分组；`tank_schema.js` 的 `FIELD_ROWS` 单一来源。
> **适用版本**：现行（2026-10-21）
> **源自**：`docs/specs/editor.md` §2、§3（2026-10-21 拆分）
> **相关**：[坦克设计器](./designer.md) · [资产烘焙工具](./bake-modules.md) · [兼容索引](../editor.md)

## 参数对比页

（原 §2）

表格化列出 `tanks/` 全部配置：标量数值字段可编辑（极速/穿深/装填/装甲等）、枚举字段下拉（`heightClass`/`muzzle` 样式）、结构化字段按「火力→防护→机动→杂项」四组分区展示（分组语义对齐 `RUN_SHOP_DEFS`）。编辑后重组同构对象保存回写；几何字段只读提示交设计器处理。

### P-48 单位标定与分组重构（现行）

（2026-09-06 落地）

- **极速 km/h、炮管长度 m** 直标编辑落地，换算仅在 UI 渲染层与 RULES 参数字段联动，**存储 JSON 格式与物理单位不乱**。
- **精度改用单一「100m 散布(m)」定义**：双输入框实时联动，换算公式为 `spread100m = 100 × SPREAD.base × spreadMult`；反向 `spreadMult = 100m散布(m) ÷ (100 × SPREAD.base)`。
- 参数列按 **Firepower（火力）/ Armor（防护）/ Mobility（机动）/ Misc（杂项）** 四类分组，组头带对应图标渲染，功重比等指标迁入机动组尾部。
- **彻底移除**原「真实单位标定」只读栏。
- 弹速保持 **px/s 裸设定**（无真实单位换算显示）。

> **沿革（不静默删除）**：§2 曾记「2026-08-26 单位直标编辑」为首次落地（原「真实单位标定」只读栏随单位直标取消）；**精度首版为双输入框**（静止 σ_eff / 最差 σ_worst 双口径联动），**P-48 简化为单一「100m 散布(m)」**。两版同源于 `spreadMult` 单参数。原文照录：**现行以 2026-09-06 P-48 版为准**。

## 字段架构表

（原 §3，`js/tank_schema.js`）

- **`FIELD_ROWS` 单一来源**：designer / compare 共用字段清单 + 枚举，杜绝两页字段定义漂移（**当前 designer 页不消费 `FIELD_ROWS`，仅 compare 渲染**）。
- 每行带 `group` 四分类标记（`'firepower'`/`'armor'`/`'mobility'`/`'misc'`，对齐 `RUN_SHOP_DEFS` 分组语义），compare 页按组序 火力→防护→机动→杂项 分节渲染。
- 可选 **`edit` 元数据**（单位直标，纯数据描述）：`{ unit, factor:[RULES子键,系数键], op:'div'|'mul' }` ——
  - `op='div'`：存储值 = 输入 ÷ 系数（`maxSpeed`：px/s = km/h ÷ `RULES.speed.kmhFactor` = **0.4**）；
  - `op='mul'`：存储值 = 输入 × 系数（`barrel.len`：px = m × `RULES.scale.PX_PER_METER`）。
  - **系数唯一权威为 RULES 对应键**。
- 可选 **`special:'spread100m'`** 标记：compare 页用「100m 散布范围(m)」联动输入框替换普通数字框（见上「P-48」）。

## 相关页面
- [坦克设计器](./designer.md) — 几何字段的唯一编辑入口（compare 只读）
- [资产烘焙工具](./bake-modules.md) — `ASSET_DEFS` 与 `FIELD_ROWS` 的区别
- [战斗规范 · 武器与装填](../combat/weapons-reload.md) — `SPREAD.base` 与 `spreadMult` 的运行时语义
