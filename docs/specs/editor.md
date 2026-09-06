# 战术坦克 Roguelike — 坦克编辑器与工具链规范 (Tank Designer & Tooling Spec)

> 权威子文档：由主文档 docs/DEVELOPMENT.md 索引。
> 涉及页面与模块：tank_designer.html, tank_compare.html, js/tank_halfgeom.js, js/tank_presets.js, js/tank_schema.js, tools/bake.html

---

## 1. 坦克设计器 (tank_designer.html)
- **多边形顶点编辑**：车体/炮塔多边形自由编辑（半侧对称几何，js/tank_halfgeom.js halfFromFull 镜像重建全形）；逐边装甲厚度设定（front/side/rear faces）。
- **双中心分离**：turret.axis（炮塔自身旋转轴，局部帧内）与 turret.pivot（绕车体旋转中心，相对车体）完全分开；运行时 applyTankConfig 归一化平移保证"局部原点=旋转轴"不变量；设计器提供青色自身中心标记 + 橙色旋转中心标记 + 一键居中对齐按钮，防旋转甩尾。
- **炮管/炮盾预设**：js/tank_presets.js BARREL_PRESETS/MANTLE_PRESETS 表；normalizeBarrel 归一化（len/width/muzzle/evac/jacket 缺省兜底）。
- **模块/成员位置不再支持自定义**（2026-08-26 P-49 定案）：命中判定改为几何分区+概率抽取（规范见 specs/combat.md），旧 json 的 modules 字段加载时静默忽略。
- **属性耦合链实时反馈**（2026-09-06）：设计器「基础参数」面板实时展示基于出厂几何与战斗参数推导的耦合结果——穿深/单发伤害→装填时间与散布惩罚倍率、车体尺寸→最大可用马力上限，以及车体面积物理缩放的内部模块易损因子（`moduleSizeFactor`，0.70x~1.30x，基于 2500 px² 标定：大车体内部宽敞不易损，小车体内部紧凑易损）。
- **甲弹对抗内置测试**：入射角/等效厚度/跳弹判定实时预览。
- **保存链路**：POST /api/tanks/<id> 写回 tanks/<id>.json；mvp/compare 重载列表即生效。

---

## 5. P-49 模块/成员概率分区系统与设计器耦合链（2026-09-06 落地）
- **模块/成员几何概率分区与耦合链全线实施**：
  - 废除设计器自定义模块/成员悬浮或坐标点挂载，全部改为基于多边形几何分区与概率判定。
  - **炮塔四象限分区**：以炮塔几何中心为局部坐标系原点（按炮塔朝向旋转）。左前（炮手 50%、炮闩 5%）、右前（车长 30%、装填手 30%、炮闩 5%）、左后/右后（弹药架各 50%）。象限内互斥抽取。
  - **车体纵轴区段**：以前置/后置炮塔构型按纵轴段划分驾驶员、弹药架及发动机区间（前置：前 10% 驾驶员/弹药架，中 40% 弹药架，后 50% 发动机；后置：前 50% 发动机，中 10% 驾驶员/弹药，后 40% 弹药架）。
  - **新键 breech（炮闩）**：MODULE_LABELS / tank_physics case / 修理清除表等全线接通。受损或重伤期间坦克短时完全无法开火，修理箱可清。
  - **属性耦合链**：装甲厚度→重量上升；车体尺寸变大→可用马力上限提升、最大设计重上限提升，且车体面积物理缩放降低内部模块被击中的易损因子（`moduleSizeFactor` 在 `[0.7, 1.3]` 钳制）；基础穿深/伤害变大→装填时间与散布倍率（三扩系数）惩罚上升。
  - **参数双层限制**：80t 玩家设计上限限制（deriveWeight 限制出厂几何）；局内卡牌与局前升级可突破该限制，但受限于 240t 运行时总硬上限。
  - **卡牌概率修正**：增强火控卡可加成炮手/炮闩被中率，装填卡可提升弹药架/装填手被中率。单项加成加法计且 ≤25%，修正后单区概率 clamp ≤90% 保留正常击穿无额外受损的「余量」。
  - 坦克设计器 `tank_designer.html` 与对比器 `tank_compare.html` 实时回显全套耦合参数、易损因子以及派生重量状态。
  - 测试链全链路覆盖模块概率抽样统计断言，测试全绿。

## 2. 参数对比页 (tank_compare.html)
- 表格化列出 tanks/ 全部配置：标量数值字段可编辑（极速/穿深/装填/装甲等）、枚举字段下拉（heightClass/muzzle 样式）、结构化字段按「火力→防护→机动→杂项」四组分区展示（分组语义对齐 RUN_SHOP_DEFS）。
- **单位直标编辑**（2026-08-26）：极速以 km/h 输入/显示、炮管长度以 m 输入/显示；换算只在 UI 层，tanks/*.json 存储格式不变。原「真实单位标定」只读栏随单位直标取消；弹速保持 px/s 裸设定（无真实单位换算显示）。
- **P-48 对比器单位标定与分组重构（2026-09-06 落地）**：
  - 极速 km/h、炮管长度 m 直标编辑落地，换算仅在 UI 渲染层与 RULES 参数字段联动，存储 JSON 格式与物理单位不乱。
  - 精度改用单一「100m 散布(m)」定义：双输入框实时联动，换算公式为 `spread100m = 100 × SPREAD.base × spreadMult`；反向 `spreadMult = 100m散布(m) ÷ (100 × SPREAD.base)`。
  - 参数列按 Firepower (火力)、Armor (防护)、Mobility (机动)、Misc (杂项) 四类分组，组头带对应图标渲染，功重比等指标迁入机动组尾部。
  - 彻底移除原「真实单位标定」只读栏。
- **精度 100m 口径设定**（2026-08-26）：三扩系数 spreadMult 不再裸输入，改以两个联动输入框设定——「静止散布@100m(m)」（σ_eff = SPREAD.base × spreadMult）与「最差散布@100m(m)」（σ_worst = SPREAD.worstCase() × spreadMult）。映射公式：spread100m(m) = SPREAD_100M_DIST(=100, m) × σ(rad)，小角近似弧长（PX_PER_METER 分子分母相消）；反向 spreadMult = 输入 ÷ (100 × σ基准)。两量同源于 spreadMult 单参数无法独立设定，故双输入框实时联动回显。
- 编辑后重组同构对象保存回写；几何字段只读提示交设计器处理。

## 3. 字段架构表 (js/tank_schema.js)
- FIELD_ROWS 单一来源：designer/compare 共用字段清单+枚举，杜绝两页字段定义漂移（当前 designer 页不消费 FIELD_ROWS，仅 compare 渲染）。
- 每行带 `group` 四分类标记（'firepower'/'armor'/'mobility'/'misc'，对齐 RUN_SHOP_DEFS 分组语义），compare 页按组序 火力→防护→机动→杂项 分节渲染。
- 可选 `edit` 元数据（单位直标，纯数据描述）：`{ unit, factor:[RULES子键,系数键], op:'div'|'mul' }`——op='div' 存储值=输入÷系数（maxSpeed：px/s = km/h ÷ RULES.speed.kmhFactor=0.4）；op='mul' 存储值=输入×系数（barrel.len：px = m × RULES.scale.PX_PER_METER）。系数唯一权威为 RULES 对应键。
- 可选 `special:'spread100m'` 标记：compare 页用「100m 散布范围(m)」联动输入框替换普通数字框（见 §2）。

## 4. 资产烘焙工具 (tools/bake.html)
- 遍历 ASSET_DEFS 离屏烘焙 + 锚点十字标注 + 合成预览，canvas.toBlob 逐张导出 PNG 到 assets/。
- file:// 可直开，零服务器依赖。

## 6. 坦克贴图与战术涂装视觉规范 (Tank Visual & Camo Spec)

- **多边形图案叠层 (Polygon Pattern Overlay)**：
  - 基于 `tank_paint.js` 的 `paintClipLocal` 进行多边形裁剪后叠层渲染；
  - 包含 4 套标准战术迷彩（`texture` 字段）：
    1. `camo-forest`（森林迷彩）：深绿/墨绿/暗褐斑块交错；
    2. `camo-desert`（沙漠伪装）：沙黄/浅褐/风蚀斑点；
    3. `camo-urban`（城市灰）：深灰/铸铁灰/沥青方块迷彩；
    4. `camo-winter`（雪地斑驳）：灰白底色 + 暗灰线条痕迹。
- **装甲质感与防滑涂层 (Armor Texture & Wear)**：
  - **焊缝 (Weld Seams)**：在装甲边缘与多边形顶点连接处绘制双重微弱高光/阴影线条；
  - **边缘磨损 (Edge Wear)**：车体与炮塔外角处叠加 5%~10% 的露底漆防锈色（dark rust）；
  - **铸造颗粒 (Cast Armor)**：对重型/中型坦克炮塔增加微弱噪点与铸造线。
