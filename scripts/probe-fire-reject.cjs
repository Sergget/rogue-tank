'use strict';

// probe-fire-reject.cjs — 击发被拒的原因直方图（B4 / #AB12，数据工具，不含断言）
//
// 回答的问题：#AB12「41.4 秒只打出 11 发，理论上限 16~29」到底是
//   ① 装填门控（正常现象）② 射程/目标 ③ 炮管被掩体截停 ④ 探针自己的伪影？
//
// 做法：不靠浏览器，直接驱动 `tryFirePrimary` 的真实门控链（`tryFire` → `fireTank`），
//   每 100ms 尝试一次，记录 `shooter._lastFireReject`（B4 新增的 dev 原因码）与当时距离。
//
// 读法：
//   · `reload` 占大头 ⇒ 正常（装填中本来就不该发），说明「11 发」是装填节奏的必然结果；
//   · `no-target` 占大头 ⇒ 敌人不在射程/实体表，属真缺陷；
//   · `barrel-blocked` 占大头 ⇒ 炮管插进掩体，属真缺陷（且带装填惩罚，会连锁放大）；
//   · 多类均摊 ⇒ 还有未埋点的入口。
//
// 用法：node scripts/probe-fire-reject.cjs
//   FIRE_SECONDS=40  观测时长
//   FIRE_DIST=600    敌人初始距离

const U = require('../js/tank_utils.js');
const RULES_MOD = require('../js/tank_rules.js');
const RULES = RULES_MOD.RULES;

global.RULES = RULES;
Object.assign(global, {
  TAU: U.TAU, partCorners: U.partCorners, distToSegment: U.distToSegment,
  segRayIntersect: U.segRayIntersect, norm: U.norm, rotate: U.rotate, angDiff: U.angDiff,
  simNow: U.simNow, setSimNow: U.setSimNow, advanceSimNow: U.advanceSimNow
});

const CV = require('../js/tank_cover.js');
Object.assign(global, {
  COVER_TIERS: CV.COVER_TIERS, covers: CV.covers,
  polyCorners: require('../js/tank_geometry.js').polyCorners, coverCorners: CV.coverCorners,
  findCoversOnPath: (a, b, c, d) => CV.findCoversOnPath(a, b, c, d, CV.covers)
});

const MODEL = require('../js/tank_model.js');
const GEO = require('../js/tank_geometry.js');
const ENT = require('../js/tank_entity.js');
const FIRE = require('../js/tank_fire.js');

const SECONDS = Number(process.env.FIRE_SECONDS || 40);
const START_DIST = Number(process.env.FIRE_DIST || 600);
const DT = 0.1;                       // 探针采样步长（与 measure-encounter 的 100ms 一致）

// ---------- 场景 ----------
CV.covers.length = 0;                 // 空场：先排除掩体因素，单独看门控
ENT.entities.length = 0;

function mkTank(id, team, x, y) {
  const t = MODEL.makeTank({ id, team, x, y, hullAngle: 0, turretAngle: 0 });
  t.team = team;
  if (typeof MODEL.computeStats === 'function') MODEL.computeStats(t);
  return t;
}

const player = mkTank('player', 'player', 0, 0);
ENT.entities.push(player);

const enemies = [];
for (let i = 0; i < 3; i++) {
  const e = mkTank('enemy_' + i, 'enemy', START_DIST + i * 40, (i - 1) * 60);
  e.hp = 1e6;                         // 不死化：只测击发门控，不测伤害
  ENT.entities.push(e);
  enemies.push(e);
}

const shells = [];
const noop = () => {};
const ctx = {
  shells,
  player,
  playerTeam: 'player',
  gunRoot: GEO.gunRoot,
  gunTip: GEO.gunTip,
  raycastTank: GEO.raycastTank,
  aimPartPreference: GEO.aimPartPreference,
  bestHitForPref: GEO.bestHitForPref,
  findCoversOnPath: global.findCoversOnPath,
  nearestEnemyTo: ENT.nearestEnemyTo,
  isHostile: ENT.isHostile,
  debuffReloadRate: () => 1,
  burstExplosion: noop, spawnMuzzleFlash: noop, spawnImpactFx: noop,
  playSound: noop, pushLog: noop, damageCover: noop,
  mouseWorld: { x: START_DIST, y: 0 }
};

// ---------- 驱动 ----------
const bands = [[0, 300], [300, 500], [500, 700], [700, 900], [900, Infinity]];
const bandLabel = (d) => {
  for (const [lo, hi] of bands) if (d >= lo && d < hi) return `${lo}-${hi === Infinity ? '∞' : hi}`;
  return '?';
};
const hist = new Map();     // reason -> Map(band -> count)
const totals = new Map();
let attempts = 0, accepted = 0;

U.setSimNow(0);
for (let step = 0; step < Math.round(SECONDS / DT); step++) {
  // 炮塔瞬间对准最近敌人（模拟探针的自动瞄准）
  const tgt = ENT.nearestEnemyTo(player);
  if (tgt) player.turretAngle = Math.atan2(tgt.y - player.y, tgt.x - player.x);
  ctx.mouseWorld = tgt ? { x: tgt.x, y: tgt.y } : { x: 1000, y: 0 };

  const dist = tgt ? Math.hypot(tgt.x - player.x, tgt.y - player.y) : Infinity;
  const band = bandLabel(dist);

  attempts++;
  const fired = FIRE.tryFirePrimary(ctx, false);
  const reason = player._lastFireReject || (fired ? 'accepted' : 'unknown');
  if (fired) accepted++;
  totals.set(reason, (totals.get(reason) || 0) + 1);
  if (!hist.has(reason)) hist.set(reason, new Map());
  const m = hist.get(reason);
  m.set(band, (m.get(band) || 0) + 1);

  // 推进模拟：装填计时、弹道飞行（只走到需要的最小面）
  player.reloadT = Math.max(0, player.reloadT - DT);
  U.advanceSimNow(DT * 1000);
}

// ---------- 输出 ----------
const pad = (s, n) => String(s).padEnd(n);
console.log(`=== 击发被拒原因直方图（#AB12 / B4）===`);
console.log(`场景：空场 · ${enemies.length} 敌 · 起始 ${START_DIST}px · ${SECONDS}s · 每 ${DT * 1000}ms 尝试一次`);
console.log(`玩家主武器：${(player.weapons && player.weapons.primary && player.weapons.primary.type) || '?'}`
  + ` · 装填 ${Number(player.stats && player.stats.reload).toFixed(2)}s`
  + ` ⇒ 理论上限 ${Math.floor(SECONDS / (player.stats && player.stats.reload || 1))} 发`);
console.log(`尝试 ${attempts} 次，受理 ${accepted} 次（${(accepted / attempts * 100).toFixed(1)}%）\n`);
console.log(pad('原因', 18) + pad('次数', 8) + pad('占比', 8) + '距离分档');
const rows = [...totals.entries()].sort((a, b) => b[1] - a[1]);
for (const [reason, n] of rows) {
  const detail = [...hist.get(reason).entries()].map(([b, c]) => `${b}:${c}`).join(' ');
  console.log(pad(reason, 18) + pad(n, 8) + pad((n / attempts * 100).toFixed(1) + '%', 8) + detail);
}
console.log('\n注：`reload` 属正常门控（装填中本就不该发）；其余原因若占大头才是真缺陷。');
