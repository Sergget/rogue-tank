# 战术坦克 Roguelike — Boss 战与首领机制规范 (Boss Spec)

> 权威子文档：由主文档 docs/DEVELOPMENT.md 索引。
> 涉及模块：js/tank_boss.js, bosses/*.json, js/tank_ai.js

---

## 1. Boss 战设计定位
- 线性节点推进链的终关首领（assignBossNode 放置于 run.nodes 最后一关；Boss 战不混普通敌军）。
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

## 5. Boss 机制（本轮落地）

- **几何放大**：`makeBossEntity` 在 `configureTank` 后按 `boss.scale`（现统一 2.0）缩放 hullSpec.verts / turretSpec.verts / hullLen / hullWid / turLen / turWid / turretPivotOffset / anchors / trackWidth / trackOffset；turret barrel.len 不缩放（随 turLen 比例放大）。
- **数据驱动调参**：`bosses/*.json` 新增 `tuning` 块（缺省回退 `RULES.boss.tuning`），以 `addModifier source:'boss-base' scope:'run'` 叠乘 maxHp/maxSpeed/turnRate/turretTurnRate/shellSpeed/reload/damage；效果为同级普通敌人基准上降机动（×0.5/0.6）、提射速（reload×0.6）、提伤害（×1.5）、血量×8。
- **难度叠加**：Boss 生成后经 `applyDifficultyMults(bossEntity, currentNode.entityMults, applyPlayerCap=false)` 叠加同级难度基准（并重设满血），再被 tuning 拉离基准，最终表现为传统 Boss（高血/高伤/高射速、低机动）。
- **出生即交战与防风筝机制**：`makeBossEntity` 出生即设置 `t.aiTriggerDist = RULES.boss.tuning.engageDist` (99999) + `t.aiEngaged = true` + `t.aiState = 'chase'`；`aiDecideEnemy` 对 Boss 建立快路径：跳过 patrol 早退判定，在非 hold/skirmish 阶段始终以 `move = 1` 朝玩家或最后记忆点主动推进并锁定开火，弱化近距倒车，从机制上根除被玩家远距离无限放风筝。
