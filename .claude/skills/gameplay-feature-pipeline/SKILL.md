---
name: gameplay-feature-pipeline
description: Use whenever adding, changing or removing a mechanic in rogue-tank — a new RULES block, weapon, ability, card, deployable, status effect, enemy behaviour or resource. Walks the five-step landing path (RULES → js module → page wiring → tests → specs page) and guards the traps that silently half-land a feature: dead config, single-page wiring, unregistered tests, and key tables that drift. Trigger this even for a "small tweak" — the traps scale with the change, not with its size.
---

# Rogue Tank — 机制落地五步

一个机制只有**配置、逻辑、接线、测试、规范**五处都落地才算完成。缺任何一处，症状都是「能跑但拿不到」——#AA3 那次漂移四轮没人发现，根因正是 `typeof x === 'function'` 守卫把「没接线」伪装成了「已关闭」。

## 第 0 步：先读常数，不要背数字

本仓库的键表会变，文档里的数字会滞后。动手前从代码取真值：

```bash
grep -n "ABILITY_KEYS_RUNTIME\|ABILITY_KEYS_INNATE" js/tank_abilities.js
grep -n "^const ABILITY_KEYS" js/tank_cards.js
ls scripts/test-*.js | wc -l          # 测试桩数量
ls cards/*.json | wc -l               # 卡牌数量
```

写进注释或文档的「N 个键」「N 张卡」必须当次实测。`AGENTS.md` 里的这类数字也可能落后于代码（2026-10-28 实测：`ABILITY_KEYS_RUNTIME` 已是 6 键含 `flash_dash`，而 AGENTS 写的 5 键）。

## 五步

| 步 | 落点 | 关键动作 |
|---|---|---|
| 1 配置 | `js/tank_rules.js` 的 `RULES` | 全部可调参数进这里，别散落在逻辑里。**`RULES` 只有一个写者**（`role-systems`），其他角色提需求 |
| 2 逻辑 | `js/tank_*.js` 纯函数 | 无 DOM、无 ctx、可 Node 测试；底部双端导出 |
| 3 接线 | `tank_battle.html` **与** `tank_bench.html` | 两页都要接，见下方「只在一页接线」 |
| 4 测试 | `scripts/test-*.js` | 必须登记进 `scripts/run-tests.js` 的 `TESTS`，并满足 `test-qa.js` 形态契约 |
| 5 规范 | `docs/specs/<卷>/<主题页>.md` + DEVELOPMENT `§4.x` | 走 `doc-workflow` 的 4 步生命周期 |

## 静默失败清单

### 1. 死配置
加了 `RULES` 块却没有消费方。`test-recent-mods.js` 的 ⑤ 段是**手工维护的消费方断言**，不是自动扫描——新增块必须在 ⑤ 段补一条：

```js
ok(all.includes('RULES.yourBlock'), 'RULES.yourBlock 有消费方');
```

### 2. 只在一页接线
bench 是**测量仪**，不允许有独立机制口径。同一张卡在 battle 与 bench 必须同行为。`test-bench-parity.js` 锁的是「battle 键集 ⊆ bench 键集」+ 驱动接线，**不是**「两边大致像」。

### 3. 孤儿测试
磁盘上有 `scripts/test-*.js` 却没进 `TESTS` 数组 → `check-html.js` 直接判红。历史上这类文件「永不执行、坏了没人发现」，所以是硬错误。同理：漏 `require('../js/tank_utils.js')` 或 `tank_rules.js` 时，红的是 `test-qa.js` 本身，不是你的新测试。

### 4. 键表漂移（能力键是四处 + 一份卡）
新增一个技能键，要同时改：

1. `js/tank_abilities.js` → `ABILITY_KEYS_RUNTIME`
2. `js/tank_abilities.js` → `ABILITY_LABELS`
3. `js/tank_abilities.js` → `tryActivateAbility` 里的 `case '<key>'`
4. `js/tank_cards.js` → `ABILITY_KEYS`（卡牌可授予表）
5. `cards/<key>.json`（带 ability 效果、`key` 与上表一致）

漏第 4 处 = 卡牌永远抽不到（死键）；漏第 3 处 = 抽到但按了没反应。两者都不报错。

### 5. 专属热键回潮
能力**统一走技能池 1/2/3**，不要再给单个能力加专属键。G/H/V 三种专属键已按 #H3 / #U42 两轮裁定退役；只在 bench 保留 `benchTestStrike: 'g'` 作为无卡自动补卡的测试入口。

### 6. 假绿
测试脚本必须设 `process.exitCode`（`process.exitCode = fail === 0 ? 0 : 1`）。没有退出码的脚本只会打印 ✓，`run-tests.js` 当它通过。

## 下线一个机制（反向清单）

删除比新增更容易留尾巴，五项都要清：

1. `RULES` 块 + 所有消费方
2. 模块导出与页面接线（两页）
3. 卡牌 JSON 与 `ABILITY_KEYS` 条目
4. **配负向断言防回潮**——只测「能用」永远发现不了「拿不到」。范例：`test-rework-r1.js`（W9 死键）、`test-flow.js` §8b（`restartRun`）、`test-cards.js`（`CARD_TAGS`）
5. specs 主题页：「已作废（日期），见 changelog」，**不删编号**（编号是外部契约）

## 完成判据

```bash
npm run check        # 语法 + tsc，末行 All checks passed
npm test             # 汇总 N 通过 / 0 失败
npm run test:browser # 改动触及页面接线时
node scripts/wiki-check.js   # 改过 docs 时：broken=0 anchorBad=0
```

判断自己是否真的落地，问一句：**这个机制在 bench 里能不能单独验证？** 不能，就说明接线漏了。

## 相关

- `shared-module-dev` — 模块分层、加载顺序、双端导出、单实例注册表
- `test-runner` — 命令的真实范围、真失败 vs 环境限制
- `doc-workflow` — specs 主题页 + §4.x 的写法与归档
- `rogue-tank-roles` — 六个角色卡与写域不相交
