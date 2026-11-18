// run-tests.js — Node 测试链独立运行 + 汇总
//
// 背景：此前 package.json 的 "test" 是 41 个文件的 && 长链，任一失败即中断后续，
// 且长链难以看出整体通过率。改为本脚本逐个独立运行：单个失败不影响后续，
// 最后输出汇总表（含各文件耗时），退出码为失败项数（0 = 全绿）。
//
// 用法：
//   node scripts/run-tests.js            # 全量
//   node scripts/run-tests.js ai         # 只跑文件名包含 "ai" 的测试（可多个关键词）
//   RT_EXTRA=scripts/__tmp.js node scripts/run-tests.js   # 追加额外测试文件（调试用）
'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
// #U-超时（2026-10-16）：单测上限 180s → 300s。`test-strip.js` 是唯一的重负载 Node 测试
// （strip 节点 ≈10 屏宽、covers 700~1100，含 generateStrip + 多轮 nodeLayoutMetrics），
// 实测 141~177s，随机器负载波动；原 180s 上限余量过薄，会把「断言全过但稍慢」误判为失败
// （runner 只报「超时」并吞掉断言结果）。放宽到 300s 以容忍负载抖动，同时仍能捕获真死循环。
const PER_TEST_TIMEOUT_MS = 300 * 1000;
const FAIL_TAIL_LINES = 25;

const TESTS = [
  'scripts/test-qa.js',
  'scripts/test-covers.js',
  'scripts/test-cover-probe.js',      // 2026-10-29 B1：前向探测原语（tierBlocksMove 同源 / 实体不是地形 / 栅格同口径）
  'scripts/test-tanks.js',
  'scripts/test-hitpart.js',
  'scripts/test-tankcollision.js',
  // 2026-10-19 #AGENT：这两个文件早就在磁盘上却从未登记，属「孤儿测试」——永不执行、坏了没人发现。
  'scripts/test-move.js',
  'scripts/test-movement-braking.js',   // #AA4 2026-10-24：制动/滑行模型（刹车独立系统）
  'scripts/test-physics.js',
  'scripts/test-nodegen.js',
  'scripts/test-nodegen-snapshot.js',
  'scripts/test-nodegen-calibration.js',
  'scripts/test-camera.js',
  'scripts/test-minimap.js',
  'scripts/test-strip.js',
  'scripts/test-map.js',
  // 2026-11-02 M3-D：歼灭正名与 node.kind 枚举一致性审计（静态扫描 + 检测器负向自证）。
  'scripts/test-node-kinds.js',
  // 2026-11-03 M3-J：节点类型目标几何（护墙环扇区/瞄准容差）与敌方目标欲望。
  'scripts/test-node-objectives.js',
  'scripts/test-exit-reachability.js',
  'scripts/test-modes.js',
  'scripts/test-flow.js',
  'scripts/test-ai.js',
  'scripts/test-squad.js',
  'scripts/test-revive.js',
  'scripts/test-modifiers.js',
  'scripts/test-weight.js',
  'scripts/test-economy.js',
  'scripts/test-cards.js',
  'scripts/test-boss.js',
  'scripts/test-boss-spawn.js',   // #AB15/#AB16 2026-10-28：Boss 图建筑密度透传 + 出生净空
  'scripts/validate-content.js',
  'scripts/test-card-effects.js',
  // 2026-10-23：被动技能槽（分类判定/槽位视图/顶替撤除）+ 导弹越障与攻顶参数 + 侦查无人机停用
  'scripts/test-passive-skills.js',
  'scripts/test-extreme-combat.js',
  'scripts/test-extreme-geometry.js',
  'scripts/test-extreme-model.js',
  'scripts/test-extreme-cover.js',
  'scripts/test-assets.js',
  'scripts/test-trackmarks.js',   // #U41（2026-10-19）履带痕迹：盖章节流/差速/寿命/上限/clear
  'scripts/test-render.js',
  // 2026-10-23 贴图资产收口：P-16 SVG / P-16-3 圆角倒角两条路线与 AI 出图链已删除；
  // 保留的「程序生成 + 后期贴图接线」由本文件覆盖（烘焙基准导出 / 后处理 / 锚点验收）。
  'scripts/test-asset-pipeline.js',
  'scripts/test-audio.js',
  'scripts/test-dmgtext.js',
  'scripts/test-drone.js',
  'scripts/test-abilities.js',
  'scripts/test-fire.js',
  'scripts/test-weapon-keypress.js',
  'scripts/test-replay.js',
  'scripts/test-rework-r1.js',
  'scripts/test-rework-r2.js',
  'scripts/test-rework-r3.js',
  'scripts/test-rework-w5.js',
  'scripts/test-panels.js',
  'scripts/test-ammo-balance.js',
  'scripts/test-weapon-upgrade-balance.js',
  'scripts/test-bindings.js',
  // 2026-10-22（第五批）B1/B2 战斗内核契约：RULES 新字段 / 敌弹种中性 / 商店曲线 /
  // 击杀分 / 双管 0.8s / 曲射 2σ / 直线掩体部位裁剪 / Boss 简报与电磁炮蓄能。
  'scripts/test-batch5-combat.js',
  // 2026-10-26 §4.143：敌军难度缩放三层审计（entityMults 单键生效性 / maxSpeed 死键 /
  //   penCap 与 dmgFloor 二次改写 / 难度曲线快照 / Boss 与普通敌人同表不同语义）。
  //   锁事实防回潮：改 entityMults 前先看本文件打印的真实终值。
  'scripts/test-enemy-scaling-audit.js',
  // 2026-10-23：近期可落地机制三件套——撞击伤害（RULES.ramming）/ 隐蔽感知（RULES.camouflage）
  //   / 战术闪跃（RULES.abilities.flash_dash）。含「新 RULES 块必须有消费方」的死配置哨兵。
  'scripts/test-recent-mods.js',
  // 2026-10-24 #P1：视野-隐蔽判定三洞——I0 模拟时钟（13 处挂钟迁移）/ I1 高度表（coverTiers.height）
  //   / I2 高度分档视线（灌木≠楼房）+ 隐蔽值相对化 + 对称化开关（默认关，保留接入）。
  'scripts/test-vision-stealth-p1.js',
  // 2026-10-24 #P2：敌方警戒状态 UI 指示（? / !）——仅视口内显示、两档语义、纯函数归并。
  'scripts/test-alert-indicator.js',
  // 2026-10-26 AA-a：公路加成 HUD 文案口径（#AA1，roadBonusKmh 与 tankKmh 同源）+ bench fireCtx
  //   的 aimPoint 接线（#AA2）；后者是 AA-b 全量对齐形状断言的起点（docs/PLAN.md §6.4）。
  'scripts/test-hud-road-bonus.js',
  'scripts/test-bench-parity.js',
  // 2026-10-29 用户裁定：预设存档从「两个按钮」改为存档列表里的两条常驻条目。
  //   buildHomeViewModel 的 presets 入参 + 页面 HOME_PRESETS 与旧按钮删除的负向断言。
  'scripts/test-home-viewmodel.js',
  // 2026-10-26 #AA6：bench Enemy Lab 工具链——清场纯筛选（clearEnemyEntities）+ 两条生成路径的
  //   视口护栏接线（几何本体在 test-camera.js 的 #AA6 段）。
  'scripts/test-bench-tools.js',
  // 2026-11-01：卡牌文案口径——desc 不得出现引擎单位（px/rad）与实现标识符；
  //   含「真实历史样本必须被判出」的负向自证与「玩家可见术语不得误判」的正向反例。
  'scripts/test-card-text.js',
  // 2026-11-01：底部 HUD 共享渲染层（血量/速度/弹种槽/技能槽/被动槽）——
  //   两页共用 js/tank_hud_panel.js；含错误速度口径（直接乘 kmhFactor）的负向对照。
  'scripts/test-hud-panel.js',
  // 2026-11-01：通用卡牌选择器（分类多下拉 + 管理按键）——
  //   211 张卡四类完备性 + 技能组主动/被动切分 + 多下拉互斥 + 两种卡池形态等价。
  'scripts/test-card-picker.js',
  // 2026-11-01：卡牌选择器续补——副武器 F 按钮反馈（用户「副武器卡牌不生效」的根因）、
  //   已持有卡牌管理器、悬停详情 tooltip（含监听器不叠加与 tip 元素复用两条负向）。
  'scripts/test-card-picker-extra.js',
  // 2026-11-01：bench 底部 HUD 与卡牌选择器的**页面接线**回归——
  //   r3 浏览器链在本会话沙箱下必然 EPERM，接线写错在 CI 前无人发现，故补静态判据。
  'scripts/test-bench-hud-wiring.js',
  // 2026-10-26 #AA8：HUD 文本在亮 biome 上的可读性契约（左下目标卡 / 底部提示条的深色底衬与字号）。
  'scripts/test-hud-readability.js',
  // 2026-10-27 R0：渲染地基三件——I4 指针拾取唯一入口（pointerToWorld）、
  //   性能采样纯逻辑（tank_perf）、I3 渲染基线判定（32×18 网格容差 + 基线形状校验）。
  'scripts/test-pick.js',
  'scripts/test-perf.js',
  'scripts/test-render-baseline.js',
  // 2026-10-27 A0：友军指挥纯逻辑——六命令快照/校验/目标权威/状态机/决策输出。
  'scripts/test-ally-command.js',
  // 2026-10-27 R1：3D 渲染/场景纯逻辑——相机射线拾取、三角形批、tier 视觉、静态/坦克几何。
  'scripts/test-render3d.js',
  // 2026-10-27 P0：玩家侧暴露度反馈（js/tank_exposure.js）——有效触发距离口径与
  //   tank_ai.js enterDCamo 同源、三档分档判据、负向断言（Boss/友军/死亡/对称化开关）、
  //   纯增量纪律（零写实体）、battle 与 3D 两页接线契约。
  'scripts/test-exposure-feedback.js',
  // 2026-10-27 UI v1：界面版式令牌契约——七页接入 js/tank_ui.js、无重复 :root、
  //   废止色板绝迹、字号棘轮（只减不增）、圆角仅 0/pill。规范见 specs/combat/ui-layout.md。
  'scripts/test-ui-tokens.js',
  // 2026-10-27 用户需求：Boss 节点改用标准 strip 生成器（3×3 屏），网格无空区 / 出生点合法 / 确定性。
  'scripts/test-boss-map.js',
  // 2026-10-28 G1：完整 3~5 分钟遭遇的纯逻辑层（js/tank_encounter.js）——三波状态机 /
  //   telegraph→spawn→wave→breather 推进、victory/defeat 幂等、同 seed 确定性、
  //   全阻挡图的出生点兜底、intel 间隔、RULES.encounter 消费哨兵。
  'scripts/test-encounter.js',
  // 2026-10-28 §4.164 B0：压迫探针回归（数据工具 scripts/measure-press.cjs）。
  //   只锁恒真不变量——同 seed 逐帧摘要一致 / 无 NaN / **实体在正前方不算障碍**（负向，
  //   §4.160 曾把 spawnBlockedWhy 出生点判定当行进判定误判一整轮）/ 推出量与碰撞同步。
  //   本批不改行为，**不得**在此断言「敌人已经压上来」；门 ① 阈值属 B3。
  'scripts/test-ai-press.js',
  'scripts/test-ai-detour.js',        // 2026-10-29 B2：绕障状态机（侧别同源 / 承诺期 / 防打转）
  'scripts/test-hull-down.js',        // 2026-10-29 #AB18：hull-down 条件降档（静止+未开火才走车体口径）
  'scripts/test-survival-reinforce.js',   // 2026-10-29：生存补给站「增援」升级（档位通道 + 接线）
  // 2026-11-01 P2-G 守军语义兜底（PLAN §2.8.3 键名契约 v2）：RULES.encounter 三键默认值
  //   （garrisonMode=false / garrisonFallbackSeconds=0 关闭态 / garrisonVanguard={count,aheadOffsetPx}）+ 超时兜底
  //   纯逻辑（注入时钟、幂等、已点亮不擦除）+ 前哨车编成（恒接战 / 末波 0 / 负偏移钳 0 ⇒ 绝不背后刷怪）。
  'scripts/test-garrison-fallback.js',
  // 2026-11-01 P2-G 页面接线（转正自 tmp/verify-p2g-wiring.cjs 67 条 + verify-p2g-regression.cjs 20 条，
  //   合并为一份共 89 条，断言一条未丢）：键名契约 v2 / 守军·前锋分流（末波 0 / 负偏移钳 0 /
  //   纯函数不改入参）/ 超时兜底（幂等 + 关闭态恒不注入）/ 接线点真实调用 / 零回归总门 /
  //   出口解耦。零回归段**执行 tank_battle.html 分流块源码原文**（vm substring 抽取，非手写复刻），
  //   逐字段比对 k/cls/x/y/hull。
  'scripts/test-p2g-wiring.js',
  // 2026-11-01 E1/E3 防御点（PLAN §2.8.5）：纯几何选址复现性/难度单调/零回归指纹对拍/
  //   kind 回填率双向断言/C1 二次收尾对比式/点驱动墙 x 对齐/兼容层不变量。
  'scripts/test-defense-points.js',
  // 2026-11-01 E2 页面波次契约切换「组=一个防御点」（PLAN §2.8.5 B 裁定）：双入口助手/
  //   false 对拍改前基线逐字节（派生 JSON + 落位 sha256，vm 原文执行）/ points 波数=点数/
  //   label·lineXs·落位命中点 x / 扁平数组陷阱与文案切换负向断言。
  'scripts/test-e2-defense-point-waves.js',
];

function pickTests() {
  let list = TESTS.slice();
  const filters = process.argv.slice(2).filter(a => !a.startsWith('-'));
  if (filters.length > 0) {
    list = list.filter(t => filters.some(f => t.includes(f)));
  }
  if (process.env.RT_EXTRA) {
    for (const extra of process.env.RT_EXTRA.split(',').map(s => s.trim()).filter(Boolean)) {
      if (!list.includes(extra)) list.push(extra);
    }
  }
  return list;
}

// 沙箱兼容的子进程捕获（2026-10-19 #AGENT）：
// 原先用 spawnSync({encoding:'utf8'}) 让 Node 通过**管道**拿 stdout/stderr，但 DSH 沙箱
// （workspace-write）禁止子进程打开命名管道，于是每一项都以 `spawnSync ... EPERM` 失败
// ——断言根本没跑就被判红。改为把子进程 stdout/stderr **重定向到临时文件**（普通文件句柄，
// 沙箱允许），退出后读回。行为与原实现等价：仍拿到退出码 + 全部输出 + 超时语义。
const fs = require('fs');
const os = require('os');

function runOne(test) {
  const t0 = Date.now();
  const tmpFile = path.join(os.tmpdir(), `rt-${process.pid}-${Math.random().toString(36).slice(2)}.log`);
  const fd = fs.openSync(tmpFile, 'w');
  let r;
  try {
    r = spawnSync(process.execPath, [test], {
      cwd: ROOT,
      timeout: PER_TEST_TIMEOUT_MS,
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', fd, fd],
    });
  } finally {
    fs.closeSync(fd);
  }
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  let output = '';
  try {
    output = fs.readFileSync(tmpFile, 'utf8');
    fs.unlinkSync(tmpFile);
  } catch (_) { /* 读不到就当作空输出，不掩盖退出码 */ }
  if (r.error) {
    // spawnSync 的 error 类型为 Error，无 code 字段；checkJs 下用 JSDoc 转型读取
    const errCode = /** @type {any} */ (r.error).code;
    const reason = errCode === 'ETIMEDOUT'
      ? `超时（>${PER_TEST_TIMEOUT_MS / 1000}s）`
      : `启动失败：${r.error.message}`;
    return { test, ok: false, secs, output: reason + (output ? `\n${output}` : '') };
  }
  return { test, ok: r.status === 0, secs, output, code: r.status };
}

function main() {
  const list = pickTests();
  if (list.length === 0) {
    console.error('run-tests: 没有匹配的测试文件');
    process.exit(2);
  }
  console.log(`run-tests: 共 ${list.length} 项，逐个独立运行（失败不中断后续）\n`);

  const results = [];
  const tAll0 = Date.now();
  for (const test of list) {
    const r = runOne(test);
    results.push(r);
    const mark = r.ok ? '✓' : '✗';
    console.log(`${mark} ${test} (${r.secs}s)${r.ok ? '' : `  ← 失败（exit=${r.code})`}`);
    if (!r.ok) {
      const tail = r.output.trim().split('\n').slice(-FAIL_TAIL_LINES).join('\n');
      console.log(`--- ${test} 输出尾部 ---\n${tail}\n--- 结束 ---`);
    }
  }
  const totalSecs = ((Date.now() - tAll0) / 1000).toFixed(1);
  const failed = results.filter(r => !r.ok);

  console.log('\n========================================');
  console.log(`测试汇总：${results.length - failed.length} 通过 / ${failed.length} 失败，共 ${results.length} 项，总耗时 ${totalSecs}s`);
  if (failed.length > 0) {
    console.log('失败项：');
    for (const f of failed) console.log(`  ✗ ${f.test} (${f.secs}s)`);
  }
  console.log('========================================');

  process.exit(failed.length === 0 ? 0 : 1);
}

main();
