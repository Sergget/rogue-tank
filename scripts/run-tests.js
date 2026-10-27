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
  // 2026-10-26 #AA6：bench Enemy Lab 工具链——清场纯筛选（clearEnemyEntities）+ 两条生成路径的
  //   视口护栏接线（几何本体在 test-camera.js 的 #AA6 段）。
  'scripts/test-bench-tools.js',
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
