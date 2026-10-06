// ============================================================================
// diagnose-difficulty.js — AI 代打难度评估（诊断脚本，不在 npm test 链内）。
// 运行：node scripts/diagnose-difficulty.js [--bots reckless,average,careful]
//        [--diffs 0,3,6] [--seeds 6] [--nodes 5]
//
// 目的：把「难度合不合理」变成可比较的数字，而不是凭感觉调参。
// 方法：tank_sim.runReplay（确定性 headless 全链战斗）× playerPolicy bot 档位
//   × difficultyLevel（env 透传）× seed，统计每格：整轮通关率 / 节点胜率 /
//   平均用时 / 平均剩余血量 / 平均击杀 / 平均复活次数 / 平均消耗血条数。
//   2026-10-06：代打无限复活，血量消耗（条数）作为难度参考——
//   死亡不再终结战斗，而是计一次复活+消耗一整条血继续。
//   改参数前后跑同一批 seed，直接对比。
//
// 保真度边界（沿用 tank_sim 已知取舍）：Boss 节点为重坦占位、不模拟复活/卡牌/
//   Boss 召唤物；结论覆盖常规节点战斗难度，不覆盖 Boss 战与卡牌构筑流派。
// ============================================================================
'use strict';

const path = require('path');
const ROOT = path.join(__dirname, '..');

// ---------- 全局装配（沿用 test-replay.js 约定：依赖模块先于消费者挂到 global） ----------
const U = require('../js/tank_utils.js');
global.TAU = U.TAU; global.norm = U.norm; global.rotate = U.rotate;
global.segRayIntersect = U.segRayIntersect; global.partCorners = U.partCorners;
global.partEdges = U.partEdges; global.reflectDir = U.reflectDir;
global.distToSegment = U.distToSegment; global.gaussian = U.gaussian; global.angDiff = U.angDiff;
const R = require('../js/tank_rules.js');
global.RULES = R.RULES;
const NG = require('../js/tank_nodegen.js');
global.createRNG = NG.createRNG;
global.generateNode = NG.generateNode;
global.pickTemplate = NG.pickTemplate;
const HG = require('../js/tank_halfgeom.js');
for (const k of Object.keys(HG)) global[k] = HG[k];
const G = require('../js/tank_geometry.js');
for (const k of Object.keys(G)) global[k] = G[k];
const MD = require('../js/tank_model.js');
for (const k of Object.keys(MD)) global[k] = MD[k];
const P = require('../js/tank_physics.js');
for (const k of Object.keys(P)) if (global[k] === undefined) global[k] = P[k];
const ENT = require('../js/tank_entity.js');
for (const k of Object.keys(ENT)) global[k] = ENT[k];
const MOVE = require('../js/tank_move.js');
for (const k of Object.keys(MOVE)) global[k] = MOVE[k];
const COV = require('../js/tank_cover.js');
for (const k of Object.keys(COV)) global[k] = COV[k];
const AI = require('../js/tank_ai.js');
for (const k of Object.keys(AI)) global[k] = AI[k];
const CARDS = require('../js/tank_cards.js');
if (CARDS.computeAmmoConfig) global.computeAmmoConfig = CARDS.computeAmmoConfig;
if (CARDS.applyCardEffects) global.applyCardEffects = CARDS.applyCardEffects;
if (CARDS.drawCardChoices) global.drawCardChoices = CARDS.drawCardChoices;
const ECO = require('../js/tank_economy.js');
if (ECO.applyUpgrades) global.applyUpgrades = ECO.applyUpgrades;
const MAP = require('../js/tank_map.js');
for (const k of Object.keys(MAP)) global[k] = MAP[k];
const FIRE = require('../js/tank_fire.js');
for (const k of Object.keys(FIRE)) global[k] = FIRE[k];

const SIM = require('../js/tank_sim.js');
const fs0 = require('fs');

// ---------- 构筑：坦克 / 卡牌 draft / 永久升级 ----------
// 可选坦克（排除 dummy 标靶）
const TANKS = fs0.readdirSync(path.join(ROOT, 'tanks'))
  .filter(f => f.endsWith('.json') && f !== 'dummy.json')
  .map(f => f.slice(0, -5));

function loadCardPool(){
  const dir = path.join(ROOT, 'cards');
  const pool = [];
  for (const f of fs0.readdirSync(dir)){
    if (!f.endsWith('.json')) continue;
    try { pool.push(JSON.parse(fs0.readFileSync(path.join(dir, f), 'utf8'))); }
    catch (e) { /* 跳过坏文件 */ }
  }
  return pool;
}

// 确定性 rng（与 sim 内部分开走，保证同 seed 同构筑、跨难度可比）
function mulberry32(seed){
  let s = seed >>> 0;
  return function(){
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 开局 draft：每轮抽 3 张随机拿 1 张（模拟真实 3 选 1），走 drawCardChoices 真实流程
function draftCards(pool, n, rng){
  const cards = [];
  const saved = Math.random;
  Math.random = rng;
  try {
    for (let i = 0; i < n; i++){
      const choices = CARDS.drawCardChoices(pool, 3, { rng: rng });
      if (!choices || !choices.length) break;
      cards.push(choices[Math.floor(rng() * choices.length)]);
    }
  } finally { Math.random = saved; }
  return cards;
}

function parseUpgrades(spec){
  const out = {};
  for (const part of spec.split(',')){
    const [idRaw, lvRaw] = part.split(':').map(s => (s || '').trim());
    const def = ECO.UPGRADE_DEFS.find(u => u.id === idRaw);
    if (!def){ console.error(`未知升级: ${idRaw}`); process.exit(2); }
    if (!def.stat){ console.error(`升级 ${idRaw} 为特殊消费项（无数值效果），已跳过`); continue; }
    out[idRaw] = Math.max(1, Math.min(def.maxLevel, Number(lvRaw) || 1));
  }
  return out;
}

// ---------- bot 档位（playerPolicy 实现；全部确定性，不引入随机流） ----------
// 2026-10-05 根因定位：sim 伤害管线本身保真（同套 resolveHit/装甲模型），
// degenerate（125 命中仅 2 穿透、0 击杀）源于 bot 战术层——旧 bot 只会正面
// 对冲、炮弹全打在正面（入射角 ~50°、等效 160~172 > 穿深 90~135 → BLOCK）。
// 真实玩家会绕侧（侧甲 30~80，穿深 135 稳穿），因此三档 bot 统一改为环绕
// 机动（orbit）：炮塔始终指向最近敌人，车体向其侧翼环绕点机动，
// 档位差异只在瞄准精度 / 环绕距离 / 激进程度——这正是"玩家水平"的可度量定义。
function aimTurret(t, out, helpers, adv, aimTol){
  const GEO = helpers.GEO;
  const desH = Math.atan2(adv.y - t.y, adv.x - t.x);
  out.turretDesired = desH;
  out.fire = Math.abs(GEO.angDiff(desH, t.turretAngle)) < aimTol;
  return desH;
}
function driveTo(t, out, helpers, wx, wy, reverse){
  const GEO = helpers.GEO;
  const moveA = Math.atan2(wy - t.y, wx - t.x);
  const hd = GEO.angDiff(moveA, t.hullAngle);
  if (reverse){
    // 倒车：车尾朝目标方向
    const hdR = GEO.angDiff(moveA + Math.PI, t.hullAngle);
    out.turn = Math.abs(hdR) < 0.08 ? 0 : (hdR > 0 ? 1 : -1);
    out.move = Math.abs(hdR) < 0.5 ? -1 : 0;
  } else {
    out.turn = Math.abs(hd) < 0.08 ? 0 : (hd > 0 ? 1 : -1);
    out.move = Math.abs(hd) < 0.5 ? 1 : 0;
  }
}
// 环绕点：以目标为圆心、当前方位再转 orbitAngle、半径 orbitDist。
// bot 永不抵达（目标也在动）→ 持续绕侧，炮弹自然落在侧/尾装甲带。
function orbitPolicy(aimTol, orbitAngle, orbitDist, minDist){
  return function(t, aiCtx, out, helpers){
    const ENT = helpers.ENT;
    const adv = ENT.nearestEnemyTo(t);
    if (!adv){ out.turn = 0; out.move = 0; out.fire = false; return; }
    const dAdv = Math.hypot(adv.x - t.x, adv.y - t.y);
    aimTurret(t, out, helpers, adv, aimTol);
    if (minDist && dAdv < minDist){
      // 太近：倒车拉开（炮塔继续指敌、保持开火）
      driveTo(t, out, helpers, adv.x, adv.y, true);
      return;
    }
    const baseA = Math.atan2(t.y - adv.y, t.x - adv.x);
    const wa = baseA + orbitAngle;
    driveTo(t, out, helpers, adv.x + Math.cos(wa) * orbitDist, adv.y + Math.sin(wa) * orbitDist, false);
  };
}

const BOTS = {
  // 莽夫：绕侧但瞄得糙（~17°就开火）、贴得近（340px）——激进但吃弹多
  reckless: orbitPolicy(0.30, 0.79, 340, 0),
  // 普通玩家：~7°开火、430px 环绕——基准档
  average: orbitPolicy(0.12, 1.22, 430, 0),
  // 谨慎玩家：~3.4°开火、520px 环绕、300px 内倒车拉开——纪律性最好
  careful: orbitPolicy(0.06, 1.31, 520, 300)
};

// ---------- CLI ----------
function parseArgs(){
  const o = { bots: ['reckless', 'average', 'careful'], diffs: [0, 3, 6], seeds: 6, nodes: 5,
              tank: 'tiger-I', cards: 0, upgrades: null, cardPool: null };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++){
    const a = argv[i];
    if (a === '--bots') o.bots = argv[++i].split(',').map(s => s.trim()).filter(Boolean);
    else if (a === '--diffs') o.diffs = argv[++i].split(',').map(Number);
    else if (a === '--seeds') o.seeds = Number(argv[++i]);
    else if (a === '--nodes') o.nodes = Number(argv[++i]);
    else if (a === '--tank') o.tank = argv[++i];
    else if (a === '--cards') o.cards = Math.max(0, Number(argv[++i]) | 0);
    else if (a === '--upgrades') o.upgrades = parseUpgrades(argv[++i]);
    else { console.error(`未知参数: ${a}`); process.exit(2); }
  }
  for (const b of o.bots) if (!BOTS[b]){ console.error(`未知 bot 档位: ${b}`); process.exit(2); }
  if (!TANKS.includes(o.tank)){ console.error(`未知坦克: ${o.tank}（可选：${TANKS.join(', ')})`); process.exit(2); }
  if (o.cards > 0) o.cardPool = loadCardPool();
  return o;
}

// ---------- sweep ----------
function runCell(botName, diff, seeds, nodeCount, o){
  const t0 = Date.now();
  let runWins = 0, nodeWins = 0, nodeTotal = 0, timeouts = 0;
  let durSum = 0, hpSum = 0, killSum = 0, reviveSum = 0, hpBarsSum = 0;
  const perNode = {};  // idx -> {win, timeout, loss, dur, hp, kills, n}
  for (let s = 0; s < seeds; s++){
    const seed = 1000 + s * 77;   // 固定 seed 序列：改参数前后可比
    // 构筑：同 seed 固定 draft（跨难度/跨 bot 可比），经 playerBuild 每节点重应用
    const rng = mulberry32(seed ^ 0x9e3779b9);
    const cards = o.cards > 0 ? draftCards(o.cardPool, o.cards, rng) : [];
    const build = (cards.length || o.upgrades) ? { upgradeLevels: o.upgrades || {}, cards: cards } : undefined;
    const res = SIM.runReplay({
      seed: seed,
      nodeCount: nodeCount,
      env: { difficultyLevel: diff },
      playerTankId: o.tank,
      playerPolicy: BOTS[botName],
      playerBuild: build,
      infiniteRevive: true  // 2026-10-06：代打无限复活，血量消耗作为难度参考
    });
    const nodes = res.results || [];
    let allWin = nodes.length > 0;
    for (const n of nodes){
      nodeTotal++;
      const pn = perNode[n.index] || (perNode[n.index] = { win: 0, timeout: 0, loss: 0, dur: 0, hp: 0, kills: 0, n: 0, boss: !!n.boss, revives: 0, hpBars: 0 });
      pn.n++;
      if (n.outcome === 'win'){ nodeWins++; pn.win++; }
      else {
        allWin = false;
        if (n.outcome === 'timeout'){ timeouts++; pn.timeout++; }
        else pn.loss++;
      }
      durSum += n.duration || 0; pn.dur += n.duration || 0;
      hpSum += n.playerHpPct || 0; pn.hp += n.playerHpPct || 0;
      killSum += n.kills || 0; pn.kills += n.kills || 0;
      // 2026-10-06：复活与血量消耗统计
      reviveSum += n.revives || 0; pn.revives += n.revives || 0;
      hpBarsSum += n.hpBarsConsumed || 0; pn.hpBars += n.hpBarsConsumed || 0;
    }
    if (allWin) runWins++;
  }
  return {
    bot: botName, diff: diff, runs: seeds,
    runWinPct: runWins / seeds,
    nodeWinPct: nodeTotal ? nodeWins / nodeTotal : 0,
    timeoutPct: nodeTotal ? timeouts / nodeTotal : 0,
    avgDur: nodeTotal ? durSum / nodeTotal : 0,
    avgHpPct: nodeTotal ? hpSum / nodeTotal : 0,
    avgKills: nodeTotal ? killSum / nodeTotal : 0,
    avgRevives: nodeTotal ? reviveSum / nodeTotal : 0,  // 2026-10-06
    avgHpBars: nodeTotal ? hpBarsSum / nodeTotal : 0,  // 2026-10-06：平均消耗血条数
    perNode: perNode,
    ms: Date.now() - t0
  };
}

function main(){
  const o = parseArgs();
  const buildDesc = `tank=${o.tank}` +
    (o.cards > 0 ? ` cards=${o.cards}(${o.cardPool.length}池)` : '') +
    (o.upgrades ? ` upgrades=${Object.entries(o.upgrades).map(([k, v]) => `${k}:${v}`).join(',')}` : '');
  console.log(`# AI 代打难度评估  bots=${o.bots.join(',')} diffs=${o.diffs.join(',')} seeds=${o.seeds} nodes=${o.nodes} ${buildDesc}`);
  console.log('# 指标：整轮通关率 | 节点胜率 | 超时率 | 节点均用时(s) | 节点均剩血量 | 节点均击杀');
  const rows = [];
  for (const b of o.bots){
    for (const d of o.diffs){
      const r = runCell(b, d, o.seeds, o.nodes, o);
      rows.push(r);
      console.log(
        `bot=${r.bot} diff=${r.diff}` +
        ` | 通关 ${(r.runWinPct * 100).toFixed(0)}%` +
        ` | 节点胜 ${(r.nodeWinPct * 100).toFixed(0)}%` +
        ` | 超时 ${(r.timeoutPct * 100).toFixed(0)}%` +
        ` | 用时 ${r.avgDur.toFixed(1)}s` +
        ` | 剩血 ${(r.avgHpPct * 100).toFixed(0)}%` +
        ` | 击杀 ${r.avgKills.toFixed(1)}` +
        ` | 复活 ${r.avgRevives.toFixed(1)}` +  // 2026-10-06
        ` | 耗血 ${r.avgHpBars.toFixed(1)}条` +  // 2026-10-06
        ` | ${r.ms}ms`
      );
      // 逐节点明细：定位胜率断崖在第几个节点（boss 节点单独标注）
      const idxs = Object.keys(r.perNode).map(Number).sort((a, b) => a - b);
      for (const i of idxs){
        const p = r.perNode[i];
        console.log(
          `    node${i}${p.boss ? '(BOSS)' : ''}: 胜 ${(p.win / p.n * 100).toFixed(0)}%` +
          ` 超时 ${(p.timeout / p.n * 100).toFixed(0)}% 阵亡 ${(p.loss / p.n * 100).toFixed(0)}%` +
          ` | 用时 ${(p.dur / p.n).toFixed(1)}s 剩血 ${(p.hp / p.n * 100).toFixed(0)}% 击杀 ${(p.kills / p.n).toFixed(1)}`
        );
      }
    }
  }
  // 写入 JSON 供改参数前后对比（cardPool 太大，只存数量）
  const fs = require('fs');
  const outPath = path.join(ROOT, 'scripts', '.diagnose-difficulty-last.json');
  const slimCfg = Object.assign({}, o, { cardPool: o.cardPool ? o.cardPool.length : 0 });
  fs.writeFileSync(outPath, JSON.stringify({ at: new Date().toISOString(), cfg: slimCfg, rows: rows }, null, 2));
  console.log(`# JSON 已写入 scripts/.diagnose-difficulty-last.json（改参数后重跑可 diff 对比）`);
}

main();
