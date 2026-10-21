# 抽卡规则与保底

> **摘要**：`drawCardChoices` 的资格过滤五条、装备/弹种/稀有度三类保底、Boss 轮加权。
> **适用版本**：现行（2026-10-21）
> **源自**：`docs/specs/cards.md` §9（2026-10-21 拆分）
> **相关**：[稀有度、权重与验证工具链](./rarity-tools.md) · [三板块设计定稿](./design-blocks.md) · [兼容索引](../cards.md)

> **动机**（原 §9 首条）：玩家没有任何主动技能 / 副武器未安装时，候选卡若全是"升级类"会语义莫名其妙（升级谁？）。抽卡必须先提供**装备卡**。

> **本页承载原 §9 的八个主题段**：抽卡资格过滤（原 **9.1~9.4**）/ 各类保底（原 **9.5~9.7**）/ Boss 轮加权（原 **9.8**）。

## 入口与参数

（原 §9 第 2 条）

`tank_cards.js` 的 `drawCardChoices(pool, n, { rng, ammoLoadout, owned })`。

`owned = { abilities: string[], primaryWeapon: string, secondaryWeapon: string, cards?: {[id]:count} }` —— 玩家当前持有的主动技能 key 列表、主/副武器类型与已拥卡计数（mvp `drawRewardCards` 从 `player.cardEffects`（type `'ability'` 去重 key）、`player.weapons.primary/secondary.type` 与 `cardStackCount` 组装传入；无则空数组 / `'standard'` / `'none'`）。

## 资格过滤五条（现行）

（#A23 / #A28；2026-10-16~17 #U18/#U20/#U22 扩充）

`cardEligible` 在**可用池阶段**剔除下列卡，**在小池 early-return 与保底之前执行**；普通轮、刷新、Boss 追加轮复用同一规则：

1. **装备/能力资格**：未持有所需武器的 `upgrade` 卡 / 槽已占的 secondary `install` 卡 / 未持有 `requiresAbility` 所指能力的 ability 升级卡（#A23/#A28，原口径）；
2. **`maxStacks` 上限**（原口径）。**#U44（2026-10-19 用户反馈「出现过、但不再持有的主、副武器、技能似乎就不再出现了，可以再次出现，允许玩家再次选择」）——安装类卡豁免**：`maxStacks` 只约束「当前仍在生效」的卡；**weapon `install` 卡与 ability 基础卡（无 `requiresAbility`）** 的重复资格改由「当前是否持有该型/该技能」动态判定（即第 1、3 条），达历史 `maxStacks` 不再一刀切拉黑。判定助手 `_isSwapBackCard(card)`（`js/tank_cards.js`），`cardEligible` 与 `applyCardEffects` 首行**两处同源**。语义：换掉双联火炮后双联安装卡重新进入候选、放下护盾后基础盾卡重新可抽（`install` 同型幂等、ability 重复入 `cardEffects` 无副作用）。**仍受 `maxStacks` 约束**：weapon `upgrade`、ability 升级卡（`requiresAbility`）、modifier/ammo/passive/drone/economy（叠加有上限，重复无收益）。回归 `scripts/test-cards.js` #U44 段；
3. **已持技能去重**（#U18）：ability 键玩家已持有，且本卡不带 `requiresAbility`（即非该能力的升级）⇒ 不合格——原行为是抽到零收益的重复技能卡占掉一个候选位；
4. **属性达限过滤**（#U20）：按 `RULES.parameterLimits` 点分路径取边界，模拟下一级后越界即不合格（口径同商店侧 `runShopLimitBlocked`）。**边界补齐（#U40，2026-10-19）**：`parameterLimits` 新增 `aimSpeed`（0.1~6；真实坦克 spec 基准包络 1.0~2.5，与 `makeTank` 缺省 0.15 两套量纲并存）/ `trackLock`（3~20s，基准 8s）/ `fireControlCrit` / `loaderAmmoCrit`（0~0.25 = `critBonusCap` 同源）——此前四参数无 limits ⇒ 满级精度/履带/暴击卡仍反复出现（用户反馈「射速、精度等升级满级后不该再出现」）；`computeStats` 聚合侧同步补 `aimSpeed.max` / `trackLock.min` 无条件钳制（对齐 crit 通道既有行为）。
5. **「取最优」被动去重**（#U22）：`spall_liner`（取 min）/ `overmatch`（取 max）与已持同键被动比较，本卡不更优即不合格（这些被动按「取最强、不叠加」结算，弱档无收益）。

## 装备保底

（原 §9 第 3~4 条）

- `abilities` 为空且池内有 `type:'ability'` 卡 → **保底抽取 1 张** ability 卡；
- `secondaryWeapon` 为 none/缺省且池内有 `type:'weapon' && slot==='secondary'` 卡 → **保底抽取 1 张**副武器安装卡。

## 弹种升级卡保底

（2026-09-17 #C3 用户裁定「升级卡加权/保底」路线 → 2026-09-19 #D5 用户反馈「弹种升级速度太快」下调为概率触发 → 2026-10-10 #O4 再调参；排在装备保底之后）

传入 `ammoLoadout` 时，若池内存在「`replaceAmmo` 链前驱已在 loadout 中」的弹种升级卡（即本回合可解锁/升级的新弹种），以 `RULES.cards.ammoUpgradeGuaranteeChance`（现行 **0.18**，沿革 0.4）概率**保证 1 张**进候选（单次抽取独立掷骰；`opts.ammoGuaranteeChance` 可覆盖，=1 复现 #C3 无条件保底语义）。

**节奏衰减（#O4）**：保底概率与稀有度内自然权重同步乘 `0.55ⁿ`（n = 本局已获链升级卡数，经 `owned.cards` 反查 `isAmmoUpgradeCard` 计数），保底与自然抽样双通道随链进度递减（整局探针：15 节点 7 张 → 3 张，−57%）。升级完成后（目标弹种入 loadout）保底自动消失、恢复稀有度权重抽样。

## 权重抽样

（原 §9 第 5 条）

剩余槽位按稀有度权重从其余可用卡抽样（`weightedRarity` 选稀有度 → 桶内加权随机取，升级卡权重 ×`paceFactor`）。保底不足时不改变抽取上限（`picked.length < count` 守卫）。

> 五档权重的基础值见 [稀有度、权重与验证工具链 · 稀有度五档](./rarity-tools.md#稀有度五档)。

## 实现注记

（原 §9 末条之一）

`abilityIdxs`/`weaponIdxs` 在 ability 卡 splice 之后静态下标会错位（误把被动卡当武器卡抽）——改为 `firstIdxWhere` 动态求值（每次 splice 后重查），`test-cards.js` 装备优先四态断言捕获验证；**#O4 起保底改随机取卡（`pickRandomWhere`）+ 返回前统一洗牌（`shufflePicked`）**——保底只决定「在候选集里」、不决定屏幕位置（修复前首位 `ability_aps` 500/500 次固定）。

## Boss 追加轮弹种升级必保底

（#S5，2026-10-14 用户要求「boss战后必然提供1个弹种升级选项」）

`drawRewardCards` 在 `pendingLootRounds > 0` 时传 `guaranteeAmmoUpgrade: true` → `drawCardChoices` 绕开概率掷骰与 pace 衰减**必抽 1 张**链升级卡（无链资格卡时静默跳过，不破坏抽取）。链过滤器（前驱资格）与 `cardEligible` 照常先行。

## Boss 轮稀有度保底与非普通卡加权

（2026-10-16 用户要求「确保至少 1 张传奇、2 张史诗，其余随意，非普通卡抽中几率调高」，现行口径）

- **池子侧：`bossLootPool()` 返回全池**（不再按 `cardRarity` 做稀有度下限过滤）。**沿革（被推翻的旧口径）**：原实现按 `CARD_RARITIES.indexOf(c.rarity) >= indexOf(loot.cardRarity)` 硬过滤，而 3 个 Boss 配 `legendary` ⇒ `epic` 整档被排除——电磁炮/机炮/双管/弹夹炮与全部副武器安装卡（共 28 张装备卡）在 Boss 轮永不可见；且 Boss 模式**每个节点都是 Boss 轮**，池子被砍到 26 张后逐轮枯竭（池内全 `maxStacks=1`），第 5 轮可用仅 1 张、第 6 轮归零，候选不足所需张数而卡死。**现行：稀有度诉求一律改由抽取层保底表达，不把任何稀有度踢出候选。**
- **抽取侧：`opts.guaranteeRarity` 按配比保底**——`{ legendary: 1, epic: 2 }` 表示候选集中**至少**含该档 N 张（从稀到常见逐项满足；已由装备/技能/弹种保底或自然命中同档则不重复追加；池内某档无可用卡则静默跳过）。
- **抽取侧：`opts.rarityWeights` 覆盖稀有度权重**——Boss 轮用 **`20/32/30/15/3`**（原 `50/30/15/4.5/0.5`），自由槽位的普通卡占比由 ~50% 降至 ~8%、传奇及以上由 ~4.4% 升至 ~25%。普通轮不传该选项，权重不变。
- **参数唯一口径**：`RULES.cards.bossRound`（`guarantee` + `rarityWeights`），消费方 `tank_mvp.drawRewardCards`（仅 `pendingLootRounds > 0` 时传入）。
- **容量上限（已知边界）**：`legendary` 全池 15 张且全为 `maxStacks=1`，Boss 模式每轮消耗 1 张 ⇒ 约第 12 轮后传奇抽完、保底**优雅降级为 0 传奇**（候选仍恒 5 张、不卡死）；`epic` 容量 45 张（`epic 37 × maxStacks` 合计）约 22 轮。**回归**：`scripts/test-cards.js` #BOSS-ROUND 段（保底 200/200、非普通卡占比、普通轮不受影响、池耗尽不缩水、全 0 权重不除零）。

## 相关页面
- [稀有度、权重与验证工具链](./rarity-tools.md) — 五档权重基础值与卡池分布
- [三板块设计定稿](./design-blocks.md) — `requiresAbility` 的持有资格定义
- [被动卡与模块暴击](./passive-crit.md) — 「取最优」去重涉及的被动键
