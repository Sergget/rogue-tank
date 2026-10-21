---
name: role-render-fx
description: Use when the task touches tank sprites, texture baking, procedural drawing, battle effects, damage floating text, audio synthesis or the battle draw layer in Rogue Tank. Owns the render and audio modules plus tank_bench.html wiring.
---

# Role: render-fx（渲染、贴图与音频）

**系统归口**（wiki 正文，2026-10-21 起）：纹理/材质/立体感/阴影 → `docs/specs/map/textures.md`；地面烘焙与相机像素对齐 → `docs/specs/map/ground-camera.md`；特效/视效 → `docs/specs/combat/fx-visual.md`；音频 → `docs/specs/combat/audio.md`；烘焙工具与贴图涂装规范 → `docs/specs/editor/bake-modules.md` + `visual-spec.md`。**索引见各卷 `index.md`**；`docs/specs/<卷>.md` 仅为 §N 兼容索引页（**勿当正文写**）。
**项目状态**：`docs/DEVELOPMENT.md` §3
**改 specs 前必读**：`docs/WIKI-STYLE.md` + `AGENTS.md` §2.3（wiki 三步：改主题页 → 对齐兼容页摘要 → 跑 `node scripts/wiki-check.js`）

## 1. 你拥有的文件

- `js/tank_assets.js` — `ASSET_DEFS` + 离屏烘焙缓存 + `_texPatch`/`_texGrain` + 材质 pass
- `js/tank_paint.js` — 程序化坦克渲染（迷彩/板缝/磨损/履带）
- `js/tank_fx.js` — 战斗特效（`spawnRailDischarge`/`drawRailArcs`/`railArcCount`）
- `js/tank_dmgtext.js` — 伤害飘字（pen/block/bounce/he/dot 五色）
- `js/tank_audio.js` — `SOUND_DEFS` + 惰性 AudioContext（全合成零资产）
- `js/tank_battledraw.js` — mvp 战斗场景绘制层（`drawTank`/`drawShells`/`drawCover`/`drawFoliage`/部署物/`railChargeProgress`）
- `scripts/audit-textures.js` — 贴图审核标准（七指标 + 三类评分 + 双向区间）
- `scripts/bake-assets.js` / `scripts/test-render.js` / `scripts/test-assets.js` / `scripts/test-audio.js`
- `tank_bench.html` 渲染接线（**页面单写者，见 `rogue-tank-roles` §1**）
- 贴图管线 Python：`scripts/optimize_sprites.py` / `clean_sprite_bg.py` / `prepare_covers.py` / `covers-anchor-check.py`

## 2. 现行口径（2026-10-19 核实）

1. **贴图审核 v2/v3 标准**（#TEX 批次）：v2 七指标达标线 80，当前基线 **97/100、14/14 达标**；v3 三条（`variation`/`edgeWear`/`continuity`）**14/14 PASS**。二者均纳入 `test-render.js` ⑦ 强制回归。
2. **整车图案框**：炮塔图案按「车体 bbox − 座圈偏移」取景（不是炮塔自身 bbox）；网格类贴图按 `originX/Y` 对齐板缝；`weatherSeed` 逐车平移。
3. **`SPRITE_SCALE=3` 超采样烘焙 + 双线性降采样**；`paintMaterialPass`（内侧 AO/倒角/受光高光池/拉丝/细颗粒/积尘）。
4. **世界固定光源**：右下 `+x/+y`。三处阴影统一。树冠受光是左上、蔽光右下。
5. **电磁炮三色**（2026-10-19 #U41）：炮管=灰（`barrelGrey*`，与涂装无关）、基底=蓝（`baseBlue*`，只填导轨之间缝隙）、弧光=白（`arcWhite` 纯白芯 + `arcHalo` 冷白晕）。`barrelWidMult=2.2`（纯视觉）。待机态白芯压到 0.18，**白的主载体是充能电弧与击发放电**。
6. **特效拆为分层结构，绘制期零渐变分配**。
7. **`tank_fx.updateFx` 会重新赋值 FX 数组**——读当前长度必须走访问器，不能读导出的数组引用。
8. **2.5D 立体感**：车体/炮塔按世界光反向偏移出两层侧壁（先于履带绘制，避免盖掉链节）。
9. **精灵目视确认是未完成项**：5 车 `sprite.enabled` 仍为 false，需在设计器勾「画布显示精灵」逐车确认（见 `docs/PLAN.md` §1 第 5 条）。

## 3. 硬约束

- 渲染模块**纯 ctx、无 DOM 依赖**，Node 可测。
- 离线生图垫片 `mini-canvas` 需保持 CTM 与 `lighter` 语义、双线性降采样与渐变 CTM 同步——否则 Node 链出现假失败。
- **改动烘焙几何/包络后必须重导出** `node tools/dump-cover-refs.mjs`，否则 `test-cover-gen.js` 的 `--check` 断言挂一条假失败（见 `docs/PLAN.md` §2.5）。
- 精灵图命名现状混杂（`Leapard_1_hull` vs `leopard1-turret` vs `tiger-I_*`），统一为 `<id>_<part>.png` 是未完成项（`docs/PLAN.md` §1 第 6 条）；坦克 id `Leapard_1` 本身**不改**。
- 音频全合成、零资产；`SOUND_DEFS` 是唯一来源。

## 4. 边界

- 贴图**几何与包络**归你，但 `RULES` 侧的尺寸参数归 `role-systems`。
- 地图地物（covers）的绘制样式由 `RULES.coverTiers.drawStyle` 驱动，改样式前先确认 tier 定义（`role-mapgen` 消费方）。

## 5. 验证

`node scripts/test-render.js`（真实光栅化逐像素回归，29 项）、`test-assets.js`、`test-audio.js`、`test-cover-gen.js`、`node scripts/audit-textures.js`（达标线 80）。
**视觉类改动必须给目视证据**（离屏 1×/5×/10× 出图），纯 Node 断言不足。全链交给 `role-verify-docs`。
