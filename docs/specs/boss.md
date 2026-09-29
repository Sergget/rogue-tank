# 战术坦克 Roguelike — Boss 战与首领机制规范 (Boss Spec)

> 权威子文档：由主文档 docs/DEVELOPMENT.md 索引。
> 涉及模块：js/tank_boss.js, bosses/*.json, js/tank_ai.js

---

## 1. Boss 战设计定位
- 周期首领机制：每第 `RULES.nodeMap.bossInterval`（默认 5）个节点为 Boss 关卡（由 `js/tank_map.js` 的 `isBossNodeIndex` 周期标记并在进入战斗时懒指定定义；Boss 战清空常规敌人，不混编杂兵）。
- 设计范式：FTL 多阶段 + Into the Breach 弱点机制——阶段切换制造节奏变化，弱点部位制造瞄准博弈。

## 2. 数据契约 (bosses/<id>.json)
validateBoss 校验；bossStageFor 按 hp 比例取当前阶段：

    {
      "id": "...",
      "name": "...",
      "desc": "...",
      "tankId": "...",          // 底盘 tank JSON
      "stages": [
        { "hpThreshold": 1.0, "modifiers": [...], "ai": { "mode": "hold", "params": {} }, ... },
        { "hpThreshold": 0.6, "modifiers": [...] },
        { "hpThreshold": 0.25, "modifiers": [...] }
      ],
      "summons": [ { "tankId": "...", "count": 2 } ],
      "loot": { "score": 500, "cards": 2, "cardRarity": "rare" }
    }

当前池：5 个 Boss（均 3 阶段、掉落齐全，audit --strict 全绿）。

## 3. 运行时机制 (makeBossEntity / applyBossStage / updateBossStage)
- **阶段切换**：血量阈值触发 applyBossStage——挂 run scope modifiers（数值强度跃升），run 结束清除。
- **随从 summons**：入场 spawnTank 伴随单位（team:enemy，nodeSpawn 标记计入清敌判定）；复用同一敌对 AI 双态状态机。
- **击败掉落 loot.score**：finishNode 时叠加进节点通关得分。
- **AI 复用**：Boss 与 summons 走 aiDecideEnemy 同一管线（含 P-19 多态状态机 Stunned/Flank/Defensive/Search&Destroy/Patrol）。

## 4. 数据驱动行为与弱点实装（P-51，2026-08-24 落地）
- **阶段声明式行为脚本**：`stages[].ai = { mode:'hold'|'charge'|'skirmish', params }`；`validateBossStage` 校验枚举；`applyBossStage` 设置 `entity.stageAI`；js/tank_ai.js 消费三模式——`hold`=复用友军消极防御 `_passiveDefend`；`skirmish`=keepDist 风筝倒车；`charge`=基线激进。参数源 `RULES.boss.aiModes`（skirmish.keepDist 默认 640），读取带内联 fallback。
- **弱点命中增益**：命中模块与当前阶段 weakspots 匹配时（`isWeakspotHit` + `moduleFromHit`），从 `RULES.boss.weakspot`（dmgMul:1.5 / penAdd:15 / ignoreBounce:true）构造 `resolveHit` opts 注入增益（物理语义见 specs/combat.md §2「resolveHit 可选增益 opts」）。
- **Boss 战利品奖励链**：`loot.cards > 0` 时 settlement→reward 追加 N 轮三选一，卡池按 `CARD_RARITIES.indexOf(c.rarity) >= indexOf(loot.cardRarity)` 过滤（不足 3 张逐档放宽至全池兑底）；结算界面显示追加卡牌行。
- **当前 ai.mode 分配（5 Boss × 3 阶段共 15 个）**：commander hold/skirmish/charge；fortress hold/charge/charge；siege_fort hold/skirmish/charge；sniper skirmish×3（keepDist 900/800/700）；twin_track skirmish/hold/charge。
- **测试**：scripts/test-boss.js（+16 断言）/ scripts/test-ai.js（+15）/ scripts/test-physics.js（新建，19 断言）；npm run check / npm test 全绿。

## 5. Boss 机制（P-51 同期批次落地，2026-08-24）

- **几何放大**：`makeBossEntity` 在 `configureTank` 后按 `boss.scale`（现统一 2.0）缩放 hullSpec.verts / turretSpec.verts / hullLen / hullWid / turLen / turWid / turretPivotOffset / anchors / trackWidth / trackOffset；turret barrel.len 不缩放（随 turLen 比例放大）。**（#B6 修订 2026-09-16：缩放为整体替换新对象，绝不原地写共享 spec——曾因原地 `*=` 污染 `tankListData` 缓存导致炮塔跨节点雪球前移，见 DEVELOPMENT.md §4.18。）**
- **数据驱动调参**：`bosses/*.json` 新增 `tuning` 块（缺省回退 `RULES.boss.tuning`），以 `addModifier source:'boss-base' scope:'run'` 叠乘 maxHp/maxSpeed/turnRate/turretTurnRate/shellSpeed/reload/damage；效果为同级普通敌人基准上降机动（×0.5/0.6）、提射速（reload×0.6）、提伤害（×1.5）、血量×8。
- **难度叠加**：Boss 生成后经 `applyDifficultyMults(bossEntity, currentNode.entityMults, applyPlayerCap=false)` 叠加同级难度基准（并重设满血），再被 tuning 拉离基准，最终表现为传统 Boss（高血/高伤/高射速、低机动）。
- **出生即交战与防风筝机制**：`makeBossEntity` 出生即设置 `t.aiTriggerDist = RULES.boss.tuning.engageDist` (99999) + `t.aiEngaged = true` + `t.aiState = 'chase'`；`aiDecideEnemy` 对 Boss 建立快路径：跳过 patrol 早退判定，在非 hold/skirmish 阶段始终以 `move = 1` 朝玩家或最后记忆点主动推进并锁定开火，弱化近距倒车，从机制上根除被玩家远距离无限放风筝。

## 6. 2026-09-20 #E9 用户反馈修订（现行口径）

**用户反馈**：① boss 周围小兵没有持续生成，要随血量下降分波次生成；② boss 早期阶段缺少行动、被击中后很多时候没有反应；③ 残血后行动速度太快；④ 增加蓄能激光（主炮发射，蓄能时炮塔转速大幅下降、炮线上生成虚线与红色透明填充预警，完毕时区域内连续快速掉血）。

- **分波次召唤（取代一次性投放）**：`bossSummonWave(entity, difficulty)` 按血量阈值逐波触发——默认 `RULES.boss.summonWaves.hpFrom = [0.75, 0.5, 0.25]`（`bosses/*.json` 的 `summons[i].hpFrom` 可覆盖），每波只触发一次（`bossSummonWavesDone`）；单波敌数 = `summons[i].count × (1 + (countDiffMul−1)×diffNorm)`（**难度越高集中生成越多**，`countDiffMul` 1.6）。spawn 位置为 Boss 周围 `spawnRadiusMin~Max`（160~320px）环形，且保证在有效触发距离之外（不脸刷）；接入层 `tank_mvp.spawnBossSummonWave`（进入阶段时检查）。**旧实现在 enterBattle 一次性生成，已删除**。
- **开场行动（早期阶段不站桩）**：`makeBossEntity` 置 `bossOpeningT = RULES.boss.openingSeconds`(1.6s)；期间 `updateBossBehavior` 持续以 `openingScanRate`(0.9 rad/s) 转动炮塔扫描（有可读动作），之后进入常规阶段行为。
- **受击反馈（被击中必有反应）**：`triggerBossHitReact(t, weak)` ——命中即触发短暂顿挫：`bossHitReactT`(0.35s，弱点命中 ×1.6) + `timed maxSpeed ×slowMul`(0.35，0.25s) + 渲染层可读的炮塔抖动窗口；冷却 `hitReact.cooldown`(0.45s) 防高射速下抖动到无法瞄准。接入层在 `resolveHit` 包装里按目标 `isBoss` 调用（`opts.dmgMul>1` 视为弱点命中）。
- **残血减速（修复「残血后太快」）**：`applyBossStage` 对阶段 `onEnter.modifiers` 中的**乘性机动增益**（`maxSpeed`/`turnRate`/`turretTurnRate` 且 `mode:'mult'` 且 `value>1`）施加上限 `RULES.boss.stageSpeedCapMul`（1.15/1.1/1.15）——`bosses/*.json` 里 ×1.2~1.8 的阶段加速不会再失控。
- **蓄能激光（主炮专属机制）**：`updateBossLaser(t, dt, target, opts)`，参数收口 `RULES.boss.laser`（唯一口径）：

| 字段 | 值 | 说明 |
|---|---|---|
| `ranges` | `[0.98, 0.72, 0.45, 0.18]` | 各阶段启用/加强激光的血量比例阈值（`hpRatio ≤ ranges[阶段序]` 时解锁） |
| `chargeSeconds` | 2.6 | 蓄能时长（期间炮塔转速 ×`chargeTurretTurnMul` 0.18，玩家可绕侧） |
| `fireSeconds` | 1.5 | 射击持续时长 |
| `cooldown` | 9 | 两次激光间隔（随阶段索引 ×(1−0.12·idx)，下限 ×0.5） |
| `width` / `length` | 34 / 1400 | 光束宽度（沿炮线法向全宽）/ 长度（px） |
| `dpsRatio` | 0.55 | 每秒伤害 = Boss 标准伤害 × 该系数（带内目标**连续快速掉血**） |
| `telegraphDash` / `telegraphColor` | `[16,12]` / `rgba(255,64,48,0.28)` | 警示虚线参数 / 红色透明填充 |

  事件流（供绘制层）：蓄能期 `laserCharge{progress}` → 射击期 `laserFire`；`tank_mvp.html` 写入 `bossLaserFx` 并绘制「虚线警示带 + 红色透明填充」（越接近发射越亮）与实心光束。命中判定为点到射线段的距离 ≤ `width/2 + 目标半宽`，经 `applyDamage` 结算（敌对阵营过滤，与玩家/友军/Boss 通用）。

## 7. 2026-09-21 #G 用户反馈修订（现行口径）

**用户反馈**：① boss 发射激光时炮塔转速太快；② 部分 boss 没有召唤敌人。

### 7.1 激光炮塔转速：timed modifier 取代逐帧叠加（#G1）——**已被 #H4/#I1 取代**

- ~~timed modifier 源 `boss-laser-turn` + `chargeTurretTurnMul`/`fireTurretTurnMul` 乘数~~ **已废弃**：乘数方案在 Boss 基础 `turretTurnRate`（经 tuning ×0.6 与难度乘子压低）上再乘 0.15~0.18，实际角速度 ≈ 0（用户实测「炮塔又不转动了」）。历史上它修复了「蓄能期每帧叠加同源修饰器被加法聚合钳到 0、射击期恢复全速甩头」的问题，但最终被更稳的固定角速度直驱取代。
- **现行口径**：`updateBossLaser` 直接推进 `t.turretAngle`，角速度 = `RULES.boss.laser.laserTurnSpeed`（**0.35 rad/s**，#I1 由 0.55 再降），固定绝对值、不受 modifier/难度影响；激光期置 `bossLaserHoldTurret`（抑制 AI 转炮）与 `bossLaserHoldMove`（**车体冻结**，#I1）。详见 `specs/combat.md` §11.3 与 §12.1/§12.2。

### 7.2 召唤波次兜底（#G2）

- `RULES.boss.summonWaves` 新增 `defaultPool`（缺省 `[{ tankId:'dummy', count:2 }]`）与 `defaultWaves`（3）。
- `bossSummonWave` 在配置 `summons` 为空**且**实体 `t.boss.id` 存在时，用 `defaultPool` 自动补足 3 波（`hpFrom` 依次取 1.0 / 配置缺省），使「未声明 summons 的 Boss」也有分波召唤行为；**裸测试实体**（无 `t.boss.id`）的空 summons 仍返回 `null`（不污染 Node 单测）。
- `bosses/*.json` 全部 5 个 Boss 已补 **3 波 `summons`**（`hpFrom` = 1.0 / 0.66 / 0.33，对应 100% / 67% / 33% HP 触发）：`commander` [dummy×2, tiger-I×1, panzer-IV×2]、`fortress` [dummy×2, panzer-IV×1, tiger-I×1]、`siege_fort` [dummy×2, panzer-IV×1, tiger-I×1]、`sniper` [dummy×2, hummel×1, Leapard_1×2]、`twin_track` [dummy×2, Leapard_1×1, tiger-I×1]。全部通过 `validateBoss` 校验。

---

## 8. 2026-09-21 #I 批次：激光定桩/降速 + 掩体阻断 + 随机走位（现行口径）

**用户反馈**：① boss 发射激光时车体不能移动，炮塔转速再降低；② 激光路径被建筑物阻挡时虚线框要反映出来；③（地图，见 `specs/map.md` §13.4）增加建筑密度，特别是 boss 战地图；④ 增加 boss 随机移动、瞄准等动作（现在几乎完全站桩）。

### 8.1 激光期车体冻结 + 炮塔再降速（#I1）
- `t.bossLaserHoldMove = true`（蓄能+射击全程）：接入层跳过 `driveTank`，车体定桩（此前仅 `bossLaserHoldTurret` 抑制炮塔）。
- `RULES.boss.laser.laserTurnSpeed` **0.55 → 0.35 rad/s**；仍为固定角速度直驱。单周期转角 41 帧 × 0.035 = 1.435 rad < π/2 ⇒ 走位窗口量化成立。
- 细则见 `specs/combat.md` §12.1。

### 8.2 蓄能虚线与光束反映掩体阻挡（#I2）
- `_laserBeamBlockDist()`：沿光束求最近全高掩体（`structure + vision`：building/full/intact/rock/ruined）的**入口距离**（Liang-Barsky 射线×OBB）；`laserCharge`/`laserFire` 事件携带 `blockedDist`。
- 伤害口径改为**光束级截断**（目标沿光束投影 > blockDist 不掉血，`laserBlocked` 事件）；绘制层按 `blockedDist` 截断虚线/光束并画阻挡标记。
- 细则见 `specs/combat.md` §12.2。

### 8.3 Boss 随机走位（反站桩）（#I4）
- `RULES.ai.bossWander`（interval 2.2~4.6s、环绕玩家 240~520px、waypointReach 90、clampMargin 140）；`updateBossBehavior` 写 `t._bossMoveOverride = { turn, move }`，mvp AI 循环对 Boss 替换车体输入（**炮塔照常锁定玩家瞄准开火**）。
- 豁免：`crush` 风格、weave 冲刺窗口、激光期、目标已毁。hold/skirmish/command/fortify 均获得机动。
- 细则见 `specs/combat.md` §12.3。

### 8.4 建筑密度（#I3）
- 地图侧现行口径见 `specs/map.md` §13.4（参数提升 + Boss 节点 ×1.6 + 修复 `fits()` 道路误判导致的密度参数空转）；战斗侧摘要见 `specs/combat.md` §12.4。

## 9. 2026-09-23 #J 批次：召唤小兵速度锚定 + Boss 履带随机自修（现行口径）

> **编号注记（2026-09-23 文档整改）**：本批次原在本卷标题写作 `#I5`，与 `docs/DEVELOPMENT.md` §4.33 的 `#J` 指同一批用户反馈；为与 `DEVELOPMENT.md` / `ARCHIVE.md` 的批次编号一致，统一为 **#J**（`#I` 批已由 §8 完整占用 #I1~#I4）。

**用户反馈**：① boss 召唤的小兵移动速度太快，boss 容易被频繁断履带。

### 9.1 召唤小兵机动锚定（spawnBossSummonWave）

- 接入层 `tank_mvp.spawnBossSummonWave` 沿用与节点敌军/增援**相同的 P-46 锚定链**：`applyEnemyAppearanceAndStats(s, spec, playerAnchorStats || player.stats, currentNode.entityMults)`（仅取外观与类型，数值基准 = 玩家出击基准 × 兵种 profile × 难度 `entityMults`），而非直挂 `applyTankConfig` 照搬 `tanks/*.json` 的原始机动值——后者绕过难度/玩家基准锚定，机动常暴超。此前裸 `applyTankConfig` 已删除。

### 9.2 Boss 履带断落随机自修（updateBossTrackRepair）

- 履带被击断（`resolveHit` → module `track` → `target.trackBroken=true` + `immobT = trackLock`，缺省 8s）后，boss **不再被动整场站桩等锁归零**。改用 `updateBossTrackRepair(t, dt, opts)` 逐帧消费（接入层在 boss AI 循环后调用）：
  - `RULES.boss.trackRepair = { enabled, windowSeconds: 8, chance: 0.4 }`。
  - **断裂瞬间**：预定一个 `(0, windowSeconds]` 内均匀随机的决策时点 + 一次性 `rng() < chance` 的命中判定；单次决策、不重复 roll。
  - **到达决策时点**：命中 → 立即清零 `trackBroken`/`immobT`/`speed`（事件 `{ type:'trackRepair' }`）；未命中 → 保持锁定直至 `trackLock` 自然归零（`driveTank` 倒计时）。
  - **每次断裂独立**：恢复（broken→false）后清空调度；再次被击断 → 重新预定新时点/新 roll。
  - 非 Boss 实体/`disabled`/`死亡` 安全返回空，rng 可透传入（浏览器接入层复用 `battleState.reinforceRng`）。
- 界面反馈：`trackRepair` 事件触发 `spawnTrackRepairFx`（`spawnImpactFx` + `burstExplosion` 微型火星） + `'ui'` 音效 + `pushLog('⚙ BOSS 履带自动修复 — 恢复机动')` 日志。
- 验证：`scripts/test-boss.js` 覆盖未断/命中/未命中/再次断裂/非 Boss 五路断言；Node 测试 `npm test` PASS，浏览器 `npm run test:browser` 四链 ALL PASS。

---
