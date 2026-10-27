# 界面组件与状态

> **摘要**：按钮五态、面板、卡片、进度条、输入框、徽标与提示条的规格，跨七页共用。
> **适用版本**：现行（2026-10-27）；按钮五态与卡片/进度条/弹窗尺寸为 设计预留（未落地，2026-10-27）
> **源自**：新建（2026-10-27，无原节；七页内联样式实测审计）
> **相关**：[界面版式与设计令牌](./ui-layout.md) · [HUD 与界面](./hud-ui.md) · [特效与视效](./fx-visual.md)

## 落地状态

| 节 | 状态 |
|---|---|
| 面板 / 提示条 Toast | **已落地**（2026-10-27 P0 统一了色板与圆角） |
| 按钮五态 / 卡片 180px / 进度条三档 / 输入框尺寸 | **未落地**（P2） |

令牌取值一律见 [界面版式与设计令牌 · 设计令牌](./ui-layout.md#设计令牌)，本页不重复写色号。

## 按钮（五态矩阵）

**现役缺陷**：全项目只有 `:hover` + `.active`（选中），**缺 `:active`（按下）与 `:focus-visible`（键盘焦点环）**。这是个键鼠游戏，TAB 可达的按钮**没有任何焦点提示**，键盘用户无法定位当前焦点。

| 态 | 选择器 | 边框 | 文字 | 填充 |
|---|---|---|---|---|
| 常态 | — | `--amber-dim` | `--amber` | `transparent` |
| 悬停 | `:hover` | `--amber` | `--amber` | `rgba(255,180,84,.10)` |
| **按下** | `:active` | `--amber` | `--bg-1` | `--amber`（反白，即时反馈） |
| 选中 | `.active` | `--green` | `--green` | `rgba(126,217,87,.15)` |
| 禁用 | `.gray` / `:disabled` | `--line` | `--text-dim` | 透明 + `opacity:.45` |
| **焦点** | `:focus-visible` | — | — | `outline:2px solid var(--blue); outline-offset:1px` |

- **焦点环用蓝色**：蓝 ≠ 琥珀（可交互）、≠ 绿（选中）、≠ 红（危险），是唯一不与既有语义冲突的色位。
- `.active` 的**选中语义保留**——现役 4 页共用这个类做「已选中」判定，改语义会牵连视觉预期。
- 尺寸：高 `--ctl-h`(28) / `--ctl-h-sm`(24) / `--ctl-h-lg`(36)；`padding:0 var(--sp-3)`；`font:500 13px/1 var(--font-mono)`；`letter-spacing:1px`；`text-transform:uppercase`（沿用现役英文大写标签）。

**点击区下限 24×24px**：本项目的输入设备是鼠标。移动端「最小 88×88 逻辑像素」标准在此**不适用**——生搬会破坏 HUD 紧凑性。鼠标精度下限取 24×24。

## 面板（`.section`）

```
border: var(--bd);
background: var(--bg-2);
padding: var(--sp-3);
标题 h3: font 500 11px/1.4 var(--font-mono); letter-spacing:2px;
         color: var(--text-dim); text-transform:uppercase; margin:0 0 var(--sp-2);
```

**面板标题用 `--text-dim` 而非琥珀**：标题是结构标签，不是强调。用琥珀会让整页「发亮」，削弱琥珀作为「可交互」的独占性。现役 `designer.css` 用 `--amber` 是唯一例外，需向此对齐。

## 卡片

| 组件 | 现役宽 | 目标 |
|---|---|---|
| `#cardRow .card`（卡牌三选一） | 180px | **180px**（基准款，不动） |
| `#loadTankList .tank-card`（整备选车） | 158px | **180px** |
| `#shopUpgradeList .shop-card`（商店升级） | 178px | **180px** |

通用：`border:var(--bd); background:var(--bg-2); padding:var(--sp-3); cursor:pointer;`
悬停 `border-color:--amber; background:rgba(255,180,84,.08)`；选中 `border-color:--green; background:rgba(126,217,87,.08)`（现役一致，保留）。

`#cardRow .card` 的 `min-height:140px` 保留——它是 640px 弹窗高度的基准之一。

## 进度条（三档）

| Token | 高 | 用途 | 现役 |
|---|---|---|---|
| `--bar-thin` | 4px | 装填细条 | `#reloadTrack` 5 → 4 |
| `--bar` | 10px | 标准（`.bar-track`、技能/热量） | 10 ✅ |
| `--bar-lg` | 12px | 生命主条 | `#playerHpTrack` 12 ✅、`#statusPanel .hp-track` 12 ✅、`#bossHpTrack` **14 → 12** |

**Boss 血条 14→12 的理由**：Boss 条的层级感靠**宽度 560px**（玩家条的 2.3 倍）建立，不靠高度差 2px。统一到 12 后两处可共用同一套样式。

通用：`background:var(--bg-canvas); border:var(--bd);` 填充色按语义（血=绿 / Boss=红渐变 / 经验=琥珀 / 技能=蓝）。

## 输入控件

```
height: var(--ctl-h);              /* 28 */
background: var(--bg-canvas);
border: var(--bd);
color: var(--text);
font: 13px var(--font-mono);
padding: 0 var(--sp-2);
```

`:focus-visible` → `border-color:var(--amber)`（现役 `select:focus` 已如此，保留）。

现役分歧：数字输入宽 80/76/64/56 四种、内边距 2~5px 五种、字号 10/11/12 三种 ⇒ 统一宽度按语义（`--w-num` 72 / `--w-text` 160）、字号 13px。

## 徽标与状态点

| 类型 | 规格 |
|---|---|
| `.badge`（分类标签） | `font:700 11px var(--font-mono); padding:1px 8px; border-radius:var(--r-pill)`；实心底 + 深色字（`color:var(--bg-0)`） |
| `.dot`（弹种圆点） | `9×9; border-radius:50%; border:1px solid rgba(255,255,255,.3)` ✅ 现役统一，保留 |
| `.pill`（损伤状态） | `padding:3px 8px; border:1px solid var(--red); color:var(--red); border-radius:0` |

**徽标是唯一保留圆角（pill）的组件族**：它符合「状态标记」的通用语义，且四页已有三分之二在用。徽标用实心而非描边——它是分类标记而非可交互元素，实心更易扫读。

## 提示条 Toast

| 类型 | 规格 |
|---|---|
| 普通（`.gain-toast-line`） | `--scrim-3` 底 + 1px `--amber` 边框 + 13px `--amber` 文字 + `padding:8px 16px` |
| 警告（`.dmg-toast-line`） | `rgba(40,8,8,.95)` 底 + 2px `--red` 边框 + 16px `--red` 文字 |
| 位置 | `bottom:128px; left:50%` 居中，位于底部 HUD 上方 |

现役 `#gainToast` 118 / `#allyToast` 128 / `#supplyPromptHud` 120 —— 三者都是「底部 HUD 上方」却各取一个值。**统一 128px**：底部 HUD 高 60 + gap 18 ≈ 100，128 保证既不压 HUD（含 Boss 血条 104+12）也不压提示。

## 相关页面
- [界面版式与设计令牌](./ui-layout.md) — 栅格、安全区、字号阶梯与全部令牌取值
- [HUD 与界面](./hud-ui.md) — 底部三区、装填环、技能槽的**行为**口径
- [特效与视效](./fx-visual.md) — 伤害飘字与装填环的配色来源
