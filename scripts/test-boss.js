// test-boss.js — Boss 系统测试（Node 端，Pure Logic）
// 运行：node scripts/test-boss.js
'use strict';

const U = require('../js/tank_utils.js');
global.TAU = U.TAU;
const RULES_MOD = require('../js/tank_rules.js');
global.RULES = RULES_MOD.RULES;

// 运行时函数（makeBossEntity/applyBossStage/updateBossStage）引用全局 addModifier/removeModifierBySource
global.addModifier = (t, m) => { t.modifiers = t.modifiers || []; t.modifiers.push(m); return t; };
global.removeModifierBySource = (t, s) => { t.modifiers = (t.modifiers || []).filter(m => m.source !== s); };
// #91 行为消费引用的全局：applyDamage / callStrike（可注入计数桩）
let dmgCalls = [];
global.applyDamage = (target, amount) => {
  dmgCalls.push({ target, amount });
  if (target && target.hp !== undefined) target.hp = Math.max(0, target.hp - amount);
};
let strikeCalls = [];
global.callStrike = (x, y, opts) => {
  strikeCalls.push({ x, y, opts });
  return [{ x, y, delay: opts.delay, radius: opts.radius }]; // fake 落弹记录
};

const {
  BOSS_WEAKSPOT_KEYS,
  validateBoss,
  validateBossStage,
  validateBossBehavior,
  BOSS_BEHAVIOR_STYLES,
  bossStageFor,
  bossStageIndex,
  bossInStage,
  makeBossEntity,
  applyBossStage,
  updateBossStage,
  updateBossBehavior,
  bossSummonWave,
  triggerBossHitReact,
  updateBossTrackRepair,
  updateBossLaser,
  bossCurrentStage,
  isWeakspotHit,
  LOOT_RARITIES
} = require('../js/tank_boss.js');

let fails = 0;
function ok(cond, label) {
  if (cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}`); fails++; }
}
// #I1/I2：浮点近似的统一助手（本文件此前无 close）
function close(a, b, eps) { return Math.abs(a - b) <= (eps || 1e-9); }

const boss = {
  id: 'b1', name: 'B',
  stages: [
    { id: 'p1', hpFrom: 1.0, hpTo: 0.6, weakspots: ['ammo'] },
    { id: 'p2', hpFrom: 0.6, hpTo: 0.2, weakspots: ['engine'] },
    { id: 'p3', hpFrom: 0.2, hpTo: 0.0, weakspots: [] }
  ],
  loot: { score: 500, cardRarity: 'legendary', cards: 3 }
};

// 1) 合法 boss
ok(validateBoss(boss).length === 0, '合法 boss 无错误');

// 2) 阶段判定
ok(bossStageFor(boss, 1.0).id === 'p1', '满血 → p1');
ok(bossStageFor(boss, 0.6).id === 'p2', '0.6 → p2（边界归下段）');
ok(bossStageFor(boss, 0.2).id === 'p3', '0.2 → p3');
ok(bossStageFor(boss, 0.0).id === 'p3', '0 → p3');
ok(bossStageFor(boss, 0.99).id === 'p1', '0.99 → p1');
ok(bossStageIndex(boss, 0.5) === 1, '索引正确');
ok(bossInStage(boss, 0.3, 'p2') === true && bossInStage(boss, 0.3, 'p3') === false, 'bossInStage 正确');

// 3) 校验：非法阶段
ok(validateBossStage({ id: 'x', hpFrom: 0.5, hpTo: 0.5 }, 0).length > 0, 'hpFrom 不大于 hpTo 报错');
ok(validateBossStage({ id: 'x', hpFrom: 1.5, hpTo: 0.5 }, 0).length > 0, '阈值越界报错');
ok(validateBossStage({ id: 'x', hpFrom: 1, hpTo: 0.5, weakspots: ['nope'] }, 0).length > 0, '非法 weakspot 报错');

// 4) 校验：阶段不连续 / 首末阈值
const bad1 = { id: 'x', name: 'X', stages: [{ id: 'p1', hpFrom: 0.9, hpTo: 0.4 }, { id: 'p2', hpFrom: 0.4, hpTo: 0.0 }] };
ok(validateBoss(bad1).length > 0, '首阶段 hpFrom ≠ 1 报错');
const bad2 = { id: 'x', name: 'X', stages: [{ id: 'p1', hpFrom: 1, hpTo: 0.5 }, { id: 'p2', hpFrom: 0.6, hpTo: 0.0 }] };
ok(validateBoss(bad2).some(e => e.includes('不衔接')), '阶段阈值不衔接报错');
const bad3 = { id: 'x', name: 'X', stages: [{ id: 'p1', hpFrom: 1, hpTo: 0.4 }] };
ok(validateBoss(bad3).length > 0, '末阶段 hpTo ≠ 0 报错');

// 5) loot 校验
ok(validateBoss({ id: 'x', name: 'X', stages: [{ id: 'p1', hpFrom: 1, hpTo: 0 }], loot: { cardRarity: 'supermythic' } }).length > 0, '非法 loot.cardRarity 报错');
// #E13（2026-09-20）：神话档（mythic）已并入 loot 稀有度白名单（最高档）
ok(LOOT_RARITIES[LOOT_RARITIES.length - 1] === 'mythic', '#E13: loot 稀有度最高档为 mythic');

// 6) 枚举
ok(BOSS_WEAKSPOT_KEYS.includes('track') && BOSS_WEAKSPOT_KEYS.includes('ammo'), '弱点枚举含履带/弹药架');

// 7) 运行时：makeBossEntity + 阶段切换（fake env + addModifier shim）
const bossDef = {
  id: 'b1', name: 'B', tankId: 'dummy', scale: 1.8,
  stages: [
    { id: 'p1', hpFrom: 1.0, hpTo: 0.6, ai: { mode: 'hold', params: { anchorRange: 300 } }, onEnter: { modifiers: [{ stat: 'armor.hull.front', mode: 'add', value: 80 }] } },
    { id: 'p2', hpFrom: 0.6, hpTo: 0.2, ai: { mode: 'charge' }, onEnter: { modifiers: [{ stat: 'turnRate', mode: 'mult', value: 2 }] } },
    { id: 'p3', hpFrom: 0.2, hpTo: 0.0, onEnter: { modifiers: [] } }
  ],
  loot: { score: 500, cardRarity: 'legendary', cards: 3 }
};
let spawnCount = 0;
const env = {
  spawnTank(spec) { spawnCount++; return Object.assign({ id: spec.id, team: spec.team, x: spec.x, y: spec.y, hullAngle: spec.hullAngle, modifiers: [], hp: 1000, maxHp: 1000, stats: { maxHp: 1000 } }, spec); },
  configureTank() {}
};
const bossEntity = makeBossEntity(bossDef, env);
ok(spawnCount === 1 && bossEntity.isBoss === true && bossEntity.boss === bossDef, 'makeBossEntity 生成带元数据实体');
ok(bossEntity.stageId === 'p1'
   && bossEntity.modifiers.some(m => m.value === 80 && m.source === 'boss-stage:p1')
   && bossEntity.modifiers.filter(m => m.source === 'boss-base').length === 8,
   '首阶段 modifiers 已应用（含 8 项 boss tuning，#91 含 penMul）');
// #91 penMul：RULES.boss.tuning.penMul 缺省 fallback 1.4（tank-model 未落地时）
const penMods = bossEntity.modifiers.filter(m => m.stat === 'penetration' && m.source === 'boss-base');
ok(penMods.length === 1 && penMods[0].mode === 'mult' && penMods[0].value === 1.4 && penMods[0].scope === 'run',
   '#91 penetration mult boss-base 应用（fallback 1.4）');
ok(bossEntity.hp === 1000 && bossEntity.maxHp === 1000, 'boss 满血出生（stats.maxHp）');

// 阶段切换：hp 降到 0.6 以下 → p2，旧 p1 modifier 移除、新 p2 modifier 叠加
bossEntity.hp = 500;  // ratio 0.5
const r = updateBossStage(bossEntity);
ok(r.changed === true && r.from === 'p1' && r.to === 'p2', '跨阶段触发（p1→p2）');
ok(bossEntity.stageId === 'p2'
   && bossEntity.modifiers.some(m => m.stat === 'turnRate' && m.source === 'boss-stage:p2')
   && !bossEntity.modifiers.some(m => m.source === 'boss-stage:p1')
   && bossEntity.modifiers.filter(m => m.source === 'boss-base').length === 8,
   '旧阶段 modifier 已移除、新阶段已叠加（tuning 保留）');
// 同阶段不重复触发
const r2 = updateBossStage(bossEntity);
ok(r2.changed === false, '同阶段不重复触发');
// 末阶段
bossEntity.hp = 100;  // ratio 0.1
const r3 = updateBossStage(bossEntity);
ok(r3.to === 'p3'
   && !bossEntity.modifiers.some(m => m.source && m.source.startsWith('boss-stage:'))
   && bossEntity.modifiers.filter(m => m.source === 'boss-base').length === 8,
   '末阶段 阶段 modifiers 清空，仅保留 boss tuning');

// 8) 阶段 AI 字段校验（P-51）
ok(validateBossStage({ id: 'x', hpFrom: 1, hpTo: 0.5, ai: { mode: 'skirmish', params: { keepDist: 800 } } }, 0).length === 0, '合法 ai 通过');
ok(validateBossStage({ id: 'x', hpFrom: 1, hpTo: 0.5 }, 0).length === 0, '缺 ai 仍合法（向后兼容）');
const badMode = validateBossStage({ id: 'x', hpFrom: 1, hpTo: 0.5, ai: { mode: 'rush' } }, 0);
ok(badMode.some(e => e.includes('ai.mode 非法 rush')), '非法 ai.mode 报错');
const badParams = validateBossStage({ id: 'x', hpFrom: 1, hpTo: 0.5, ai: { mode: 'charge', params: [1, 2] } }, 0);
ok(badParams.some(e => e.includes('ai.params 应为对象')), 'params 非对象报错');
ok(validateBossStage({ id: 'x', hpFrom: 1, hpTo: 0.5, ai: 'charge' }, 0).length > 0, 'ai 非对象报错');

// 9) stageAI：makeBossEntity 后为首阶段 ai；跨阶段切换后跟随更新（无 ai 阶段 → null）
const aiEnt = makeBossEntity(bossDef, env);
ok(aiEnt.stageAI === bossDef.stages[0].ai, 'makeBossEntity 后 stageAI 为首阶段 ai');
bossEntity.hp = 500;  // ratio 0.5 → p2
updateBossStage(bossEntity);
ok(bossEntity.stageAI === bossDef.stages[1].ai && bossEntity.stageAI.mode === 'charge', '阶段切换后 stageAI 更新');
bossEntity.hp = 100;  // ratio 0.1 → p3（无 ai）
updateBossStage(bossEntity);
ok(bossEntity.stageAI === null, '无 ai 阶段 → stageAI null');

// 10) bossCurrentStage / isWeakspotHit
ok(bossCurrentStage({}) === null && bossCurrentStage(null) === null, '非 Boss/无数据 → bossCurrentStage null');
const we = { boss: boss, hp: 900, maxHp: 1000 };  // ratio 0.9 → p1（weakspots ammo）
ok(bossCurrentStage(we) === boss.stages[0], 'bossCurrentStage 返回当前阶段对象');
ok(isWeakspotHit(we, 'ammo') === true, '命中当前阶段弱点 → true');
ok(isWeakspotHit(we, 'track') === false, '非弱点模块 → false');
ok(isWeakspotHit({}, 'ammo') === false && isWeakspotHit(null, 'ammo') === false, '非 Boss 实体 → false');
we.hp = 500;  // ratio 0.5 → p2（weakspots engine）
ok(isWeakspotHit(we, 'engine') === true && isWeakspotHit(we, 'ammo') === false, '阶段切换后弱点跟随更新');
ok(isWeakspotHit({ boss: boss, hp: 100, maxHp: 0 }, 'engine') === false, 'maxHp=0 除零防护不抛错且返回 false');

// 11) #91 behavior 校验
ok(BOSS_BEHAVIOR_STYLES.includes('crush') && BOSS_BEHAVIOR_STYLES.includes('skirmish_long'), '#91 行为风格枚举完整');
ok(validateBossBehavior({ style: 'command', barrage: { shots: 3, delay: 3.5, interval: 9, radius: 110, dmgMult: 0.8 } }).length === 0,
   '#91 合法 behavior（command+barrage）通过');
ok(validateBossBehavior({ style: 'weave', chargeInterval: 7, chargeSpeed: 1.6 }).length === 0, '#91 合法 behavior（weave）通过');
ok(validateBossBehavior({ style: 'fortify' }).length === 0 && validateBossBehavior({ style: 'skirmish_long' }).length === 0, '#91 纯 style behavior 通过');
const bb1 = validateBoss({ id: 'x', name: 'X', stages: [{ id: 'p1', hpFrom: 1, hpTo: 0 }], behavior: { style: 'dance' } });
ok(bb1.some(e => e.includes('behavior.style 非法 dance')), '#91 非法 style 报错');
const bb2 = validateBossBehavior({ style: 'command', barrage: { shots: 0 } });
ok(bb2.some(e => e.includes('barrage.shots 应为正整数')), '#91 barrage.shots 非法报错');
const bb3 = validateBossBehavior({ style: 'crush', contact: { dmg: -5 } });
ok(bb3.some(e => e.includes('contact.dmg 应为非负数')), '#91 contact.dmg 负数报错');
const bb4 = validateBossBehavior({ style: 'weave', chargeSpeed: 'fast' });
ok(bb4.some(e => e.includes('chargeSpeed 应为正数')), '#91 chargeSpeed 非数值报错');
ok(validateBossBehavior('weave').some(e => e.includes('应为对象')), '#91 behavior 非对象报错');
// tuning.penMul 白名单放行
ok(validateBoss({ id: 'x', name: 'X', stages: [{ id: 'p1', hpFrom: 1, hpTo: 0 }], tuning: { penMul: 1.2 } }).length === 0,
   '#91 tuning.penMul 白名单放行');

// 12) #91 behavior 存取：makeBossEntity 把顶层 behavior 存到 t.bossStyle / t.bossBehavior + 计时器初始化
const mkEnv = () => ({
  spawnTank(spec) { return Object.assign({ modifiers: [], hp: 1000, maxHp: 1000, stats: { maxHp: 1000 }, hullLen: 128 }, spec); },
  configureTank() {}
});
const behBossDef = {
  id: 'bc', name: 'C', tankId: 'dummy',
  behavior: { style: 'command', barrage: { shots: 3, delay: 3.5, interval: 9, radius: 110, dmgMult: 0.8 },
              extraIgnored: true },
  stages: [{ id: 'p1', hpFrom: 1, hpTo: 0 }],
  loot: {}
};
const behEnt = makeBossEntity(behBossDef, mkEnv());
ok(behEnt.bossStyle === 'command' && behEnt.bossBehavior === behBossDef.behavior, '#91 makeBossEntity 存 bossStyle/bossBehavior');
ok(behEnt.barrageCdT === 9 && behEnt.contactCdT === 0 && behEnt.chargeTimerT === 0, '#91 行为计时器初始化（首轮炮击延迟=interval）');
// 无 behavior 的 boss 不设置行为字段
const plainEnt = makeBossEntity(bossDef, mkEnv());
ok(plainEnt.bossStyle === undefined && plainEnt.bossBehavior === undefined, '#91 无 behavior 时行为字段不设置');
// per-boss tuning.penMul 覆盖 fallback
const penEnt = makeBossEntity(Object.assign({}, bossDef, { tuning: Object.assign({}, bossDef.tuning, { penMul: 2 }) }), mkEnv());
ok(penEnt.modifiers.some(m => m.stat === 'penetration' && m.value === 2 && m.source === 'boss-base'),
   '#91 per-boss tuning.penMul 覆盖缺省');

// 13) #91 updateBossBehavior：crush 碾压接触（伤害走 applyDamage + 击退 + 边界钳制 + cd 冷却）
const crushDef = {
  id: 'bsf', name: 'S', tankId: 'dummy',
  behavior: { style: 'crush', contact: { dmg: 120, knockback: 260, cd: 1.5 } },
  stages: [{ id: 'p1', hpFrom: 1, hpTo: 0 }]
};
dmgCalls = [];
const crushEnt = makeBossEntity(crushDef, mkEnv());
crushEnt.x = 0; crushEnt.y = 0;
const player = { hp: 500, maxHp: 500, x: 100, y: 0, hullLen: 64 }; // dist=100 < radSum≈76.8? no…
// hullLen 128+64 → radSum=(128+64)/2*0.8=76.8；dist 100 未接触 → 先验证不触发
let evs = updateBossBehavior(crushEnt, 0.016, player);
ok(evs.length === 0 && dmgCalls.length === 0, '#91 crush 距离外不触发接触');
player.x = 60; // dist=60 < 76.8 → 接触
evs = updateBossBehavior(crushEnt, 0.016, player);   // 无 bounds → 不钳制
ok(evs.length === 1 && evs[0].type === 'contact' && evs[0].dmg === 120, '#91 crush 接触产生 contact 事件');
ok(dmgCalls.length === 1 && dmgCalls[0].target === player && dmgCalls[0].amount === 120, '#91 crush 伤害经 applyDamage 路径');
ok(player.hp === 380, '#91 crush 伤害扣减玩家 hp（500-120）');
ok(Math.abs(player.x - 320) < 0.001 && player.y === 0, '#91 crush 击退沿撞击方向推 knockback px');
// maxX=200 钳制：再撞一次应被夹回
crushEnt.contactCdT = 0; player.hp = 500; dmgCalls = [];
player.x = 70; // 重新贴近
evs = updateBossBehavior(crushEnt, 0.016, player, { bounds: { minX: -1000, maxX: 200, minY: -1000, maxY: 1000 } });
ok(player.x <= 200, '#91 击退受世界边界钳制');
// cd 内不重复触发
dmgCalls = [];
evs = updateBossBehavior(crushEnt, 0.1, player);
ok(evs.length === 0 && dmgCalls.length === 0, '#91 crush 冷却期内不重复触发');

// 14) #91 updateBossBehavior：weave 周期冲刺（timed modifier + 到期回收）+ 缺省碾压参数
const weaveDef = {
  id: 'btt', name: 'W', tankId: 'dummy',
  behavior: { style: 'weave', chargeInterval: 7, chargeSpeed: 1.6 },
  stages: [{ id: 'p1', hpFrom: 1, hpTo: 0 }]
};
const weaveEnt = makeBossEntity(weaveDef, mkEnv());
weaveEnt.x = 0; weaveEnt.y = 0;
const wp = { hp: 900, maxHp: 900, x: 50, y: 0, hullLen: 64 };
evs = updateBossBehavior(weaveDef ? weaveEnt : null, 7.1, wp);
const chargeEv = evs.find(e => e.type === 'chargeStart');
ok(!!chargeEv && chargeEv.speedMul === 1.6 && Math.abs(chargeEv.durationSec - 1.2) < 0.001, '#91 weave 冲刺间隔到点触发 chargeStart');
ok(weaveEnt.modifiers.some(m => m.stat === 'maxSpeed' && m.mode === 'mult' && m.value === 1.6
   && m.source === 'boss-charge' && m.scope === 'timed'), '#91 冲刺期 maxSpeed × chargeSpeed timed modifier 已加');
ok(typeof weaveEnt.bossChargeUntil === 'number', '#91 冲刺到期时间戳已记录');
// 到期回收：把时间戳拨回过去 → 下帧移除 modifier
weaveEnt.bossChargeUntil = Date.now() - 1;
evs = updateBossBehavior(weaveEnt, 0.016, wp);
ok(!weaveEnt.modifiers.some(m => m.source === 'boss-charge') && weaveEnt.bossChargeUntil === undefined,
   '#91 冲刺到期后 boss-charge modifier 回收');
// 缺省碾压（weave 无 contact 配置 → WEAVE_CONTACT_DEFAULTS dmg 100 / kb 240 / cd 1.5）
dmgCalls = [];
weaveEnt.contactCdT = 0;   // 清掉首轮接触冷却，单独验证缺省参数
wp.x = 40; wp.y = 0;
evs = updateBossBehavior(weaveEnt, 0.016, wp);
const contactEv = evs.find(e => e.type === 'contact');
ok(!!contactEv && contactEv.dmg === 100, '#91 weave 缺省碾压伤害 100 生效');
ok(Math.abs(wp.x - 280) < 0.001, '#91 weave 缺省击退 240 px');

// 15) #91 updateBossBehavior：command 炮击压制（callStrike 自定义 delay/radius/dmgMult/shellCount + 计时节律）
strikeCalls = [];
const cmdPlayer = { hp: 800, maxHp: 800, x: 333, y: 444, hullLen: 64 };
evs = updateBossBehavior(behEnt, 1.0, cmdPlayer); // dt 累计 1 < interval 9 → 未触发
ok(strikeCalls.length === 0, '#91 command 首轮炮击前（interval 内）不触发');
behEnt.barrageCdT = 0.01; // 拨到触发点
evs = updateBossBehavior(behEnt, 0.02, cmdPlayer);
ok(strikeCalls.length === 1, '#91 command interval 到点呼叫一轮炮击');
const sc = strikeCalls[0];
ok(sc.x === 333 && sc.y === 444, '#91 炮击落点取玩家当前位置附近散布');
ok(sc.opts.owner === behEnt && sc.opts.delay === 3.5 && sc.opts.radius === 110
   && sc.opts.dmgMult === 0.8 && sc.opts.shellCount === 3, '#91 callStrike 收到自定义 delay/radius/dmgMult/shots');
ok(evs.some(e => e.type === 'barrage'), '#91 产生 barrage 事件');
ok(behEnt.barrageCdT === 9, '#91 炮击后节律计时器重置为 interval');
// 目标死亡 → 不开火
strikeCalls = [];
cmdPlayer.hp = 0;
behEnt.barrageCdT = 0;
evs = updateBossBehavior(behEnt, 0.02, cmdPlayer);
ok(strikeCalls.length === 0, '#91 目标已毁不开火');
// 非 Boss 实体安全
ok(updateBossBehavior(null, 0.016, cmdPlayer).length === 0 && updateBossBehavior(plainEnt, 0.016, cmdPlayer).length === 0,
   '#91 非 Boss/无行为实体 updateBossBehavior 安全返回空');

// --- #I4（2026-09-21 用户裁定「boss 几乎完全是站桩等玩家」）：Boss 随机走位层 ---
{
  const wanderDef = Object.assign({}, behBossDef, { id: 'bw' });
  const wEnt = makeBossEntity(wanderDef, mkEnv());
  wEnt.x = 0; wEnt.y = 0; wEnt.hullAngle = 0;
  const pAlive = { hp: 800, maxHp: 800, x: 300, y: 0, hullLen: 64 };
  const bounds = { minX: -2000, maxX: 2000, minY: -2000, maxY: 2000 };
  // 确定性 rng 桩（避免 Math.random 抖动）
  let seedN = 1;
  const rngStub = () => { seedN = (seedN * 1103515245 + 12345) % 2147483648; return seedN / 2147483648; };
  // 1) 生成走位覆盖：turn ∈ {-1,0,1}、move ∈ {0,1}，且有航点
  let anyMove = false;
  for (let i = 0; i < 40; i++) {
    updateBossBehavior(wEnt, 0.1, pAlive, { bounds, rng: rngStub });
    const ov = wEnt._bossMoveOverride;
    if (ov && ov.move === 1) anyMove = true;
  }
  const ov1 = wEnt._bossMoveOverride;
  ok(!!ov1 && (ov1.turn === -1 || ov1.turn === 0 || ov1.turn === 1) && (ov1.move === 0 || ov1.move === 1),
     `#I4 Boss 随机走位：产生 _bossMoveOverride {turn,move}（turn=${ov1 && ov1.turn} move=${ov1 && ov1.move}）`);
  ok(anyMove, '#I4 走位层在若干帧内产生前进指令（move=1，不再站桩）');
  // 2) 航点环绕玩家：距离落在 [distMin, distMax]（含边界钳制）
  const wc = RULES.ai.bossWander;
  const dWP = Math.hypot((wEnt._bw ? wEnt._bw.x : 0) - pAlive.x, (wEnt._bw ? wEnt._bw.y : 0) - pAlive.y);
  ok(dWP >= (wc.distMin - 1) && dWP <= (wc.distMax + 1),
     `#I4 航点环绕玩家且保持交战距离（${dWP.toFixed(0)}px ∈ [${wc.distMin}, ${wc.distMax}]）`);
  // 3) 航点被钳制在节点边界内
  ok(wEnt._bw.x >= bounds.minX && wEnt._bw.x <= bounds.maxX && wEnt._bw.y >= bounds.minY && wEnt._bw.y <= bounds.maxY,
     '#I4 航点钳制进节点边界内');
  // 4) 激光期冻结 → 不产生走位覆盖（车体静止由接入层保证）
  wEnt.bossLaserHoldMove = true;
  updateBossBehavior(wEnt, 0.1, pAlive, { bounds, rng: rngStub });
  ok(wEnt._bossMoveOverride === null, '#I4 激光期（bossLaserHoldMove）不产生走位覆盖');
  wEnt.bossLaserHoldMove = false;
  // 5) crush 风格豁免（冲撞碾压为身份，保持原追击语义）
  const crushW = makeBossEntity(crushDef, mkEnv());
  updateBossBehavior(crushW, 0.1, pAlive, { bounds, rng: rngStub });
  ok(crushW._bossMoveOverride === null, '#I4 crush 风格豁免走位覆盖（保留冲撞追击）');
  // 6) 目标死亡 → 无走位
  const pDead = { hp: 0, maxHp: 800, x: 300, y: 0, hullLen: 64 };
  updateBossBehavior(wEnt, 0.1, pDead, { bounds, rng: rngStub });
  ok(wEnt._bossMoveOverride === null, '#I4 目标已毁不产生走位覆盖');
}

// 16) #B6 共享 spec 不被 Boss scale 污染（跨节点炮塔逐渐前移的根因回归）
//   tank_model.applyTankConfig 历史上让 t.turretPivotOffset 直接引用 spec.turret.pivot
//   （tankListData 缓存常驻），Boss 的 scale ×s 原地 *= 会把 ×s 永久写回配置，使后续
//   每个 Boss 节点再 ×s，同型敌军与玩家跨节点加载到逐次前移的 pivot。
{
  const MD = require('../js/tank_model.js');
  const sharedSpec = {
    id: 'shared', hull: { verts: [[-50, -25], [50, -25], [50, 25], [-50, 25]], faces: {} },
    turret: { verts: [[-20, -15], [20, -15], [20, 15], [-20, 15]], faces: {}, pivot: { dx: 7, dy: 0 } },
    anchors: { hull_front: { dx: 32, dy: 0 }, gun_root: { dx: 17, dy: 0 } }
  };
  const pivot0 = JSON.stringify(sharedSpec.turret.pivot);
  const anchors0 = JSON.stringify(sharedSpec.anchors);
  const pollutionEnv = {
    spawnTank(s) { return MD.makeTank(Object.assign({}, s)); },
    configureTank(t) { MD.applyTankConfig(t, sharedSpec); }
  };
  const scaledBoss = makeBossEntity({ id: 'p', name: 'P', tankId: 'shared', scale: 2, stages: [{ id: 'p1', hpFrom: 1, hpTo: 0 }] }, pollutionEnv);
  ok(JSON.stringify(sharedSpec.turret.pivot) === pivot0,
     '#B6 Boss scale 后共享 spec.turret.pivot 未被改写（' + pivot0 + '）');
  ok(JSON.stringify(sharedSpec.anchors) === anchors0, '#B6 Boss scale 后共享 spec.anchors 未被改写');
  // 实例自身仍应正确缩放（×2）
  ok(scaledBoss.turretPivotOffset.dx === 14 && scaledBoss.anchors.hull_front.dx === 64,
     '#B6 Boss 实例自身几何仍按 scale 缩放（pivot 14 / anchor 64）');
  // 之后加载同型配置的实体（玩家/普通敌军）必须拿到出厂 pivot，而非累积值
  const later = MD.makeTank({ id: 'later', team: 'player', x: 0, y: 0 });
  MD.applyTankConfig(later, sharedSpec);
  ok(later.turretPivotOffset.dx === 7, '#B6 后续实体（玩家）加载到出厂 pivot dx=7，无跨节点累积前移');
  // 连续三个 Boss 节点 → 配置保持出厂值，实例各自独立
  let drift = 0;
  for (const n of [4, 9, 14]) {
    const b = makeBossEntity({ id: 'p' + n, name: 'P', tankId: 'shared', scale: 2, stages: [{ id: 'p1', hpFrom: 1, hpTo: 0 }] }, pollutionEnv);
    drift = b.turretPivotOffset.dx;
  }
  ok(drift === 14 && sharedSpec.turret.pivot.dx === 7,
     '#B6 连续 3 个 Boss 节点后实例 pivot 仍 14、配置仍 7（无 ×2 雪球）');
}

// ================= #E9（2026-09-20）Boss 修订：分波召唤 / 蓄能激光 / 受击反馈 / 残血减速 =================
{
  // --- 分波次召唤：按血量阈值逐波触发，难度放大单波敌数 ---
  const waveBoss = {
    id: 'bw', name: 'BW', tankId: 'dummy',
    summons: [{ tankId: 'panzer-IV', count: 2 }, { tankId: 'tiger-I', count: 1 }],
    stages: [{ id: 'p1', hpFrom: 1, hpTo: 0 }]
  };
  const wEnt = makeBossEntity(waveBoss, mkEnv());
  wEnt.maxHp = 1000; wEnt.hp = 1000;
  ok(bossSummonWave(wEnt, 0.5) === null, '#E9 满血时不召唤（未跨阈值）');
  wEnt.hp = 700;   // 70% < hpFrom[0]=0.75 → 第 1 波
  const w1 = bossSummonWave(wEnt, 0.5);
  ok(w1 && w1.waveIndex === 0 && w1.tankId === 'panzer-IV', '#E9 血量跨 75% → 触发第 1 波');
  ok(bossSummonWave(wEnt, 0.5) === null, '#E9 同一波不重复触发');
  wEnt.hp = 400;   // 40% < hpFrom[1]=0.5 → 第 2 波
  const w2 = bossSummonWave(wEnt, 1.0);
  ok(w2 && w2.waveIndex === 1 && w2.tankId === 'tiger-I', '#E9 血量跨 50% → 触发第 2 波');
  // 难度放大：同一波 count ×(1 + (countDiffMul-1)×diffNorm)
  const hi = makeBossEntity(waveBoss, mkEnv());
  hi.maxHp = 1000; hi.hp = 700;
  const wHi = bossSummonWave(hi, 1.0);
  const lo = makeBossEntity(waveBoss, mkEnv());
  lo.maxHp = 1000; lo.hp = 700;
  const wLo = bossSummonWave(lo, 0.0);
  ok(wHi.count > wLo.count, `#E9 难度越高单波敌数越多（${wHi.count} > ${wLo.count}）`);

  // --- 蓄能激光：蓄能期发 laserCharge（含 progress），射击期发 laserFire 并对带内目标掉血 ---
  const laserBoss = {
    id: 'bl', name: 'BL', tankId: 'dummy',
    stages: [{ id: 'p1', hpFrom: 1, hpTo: 0 }]
  };
  const lEnt = makeBossEntity(laserBoss, mkEnv());
  lEnt.x = 0; lEnt.y = 0; lEnt.turretAngle = 0;
  lEnt.stats.damage = 100;
  lEnt.hp = lEnt.maxHp * 0.9;   // #E9：激光在首阶段阈值（ranges[0]=0.98）以下才解锁
  const inBeam = { id: 'p', team: 'player', x: 300, y: 0, hp: 1000, maxHp: 1000, hullWid: 34, hullLen: 64 };
  const offBeam = { id: 'o', team: 'player', x: 300, y: 400, hp: 1000, maxHp: 1000, hullWid: 34, hullLen: 64 };
  const ents = [inBeam, offBeam, lEnt];
  const isH = (a, b) => a !== b;
  lEnt.bossLaserCdT = 0;
  let sawCharge = false, sawFire = false;
  const chargeS = RULES.boss.laser.chargeSeconds, fireS = RULES.boss.laser.fireSeconds;
  for (let i = 0; i < Math.ceil((chargeS + fireS + 0.2) / 0.1); i++) {
    const evs = updateBossLaser(lEnt, 0.1, inBeam, { entities: ents, isHostile: isH });
    for (const e of evs) { if (e.type === 'laserCharge') sawCharge = true; if (e.type === 'laserFire') sawFire = true; }
  }
  ok(sawCharge, '#E9 蓄能期发出 laserCharge 事件（供渲染层画虚线警示带）');
  ok(sawFire, '#E9 蓄能完毕进入射击期发出 laserFire 事件');
  ok(inBeam.hp < 1000, `#E9 炮线带内目标持续掉血（hp=${inBeam.hp.toFixed(1)}）`);
  ok(offBeam.hp === 1000, '#E9 炮线带外目标不受伤害');
  ok(lEnt.bossLaserCdT > 0, '#E9 射击结束进入冷却');

  // --- #H4（2026-09-21）：激光期炮塔固定角速度直驱（用户裁定「固定、较慢的速度转动」）---
  {
    const tEnt = makeBossEntity(laserBoss, mkEnv());
    tEnt.x = 0; tEnt.y = 0; tEnt.turretAngle = 0;
    tEnt.stats.damage = 100;
    tEnt.hp = tEnt.maxHp * 0.9;
    tEnt.bossLaserCdT = 0;   // 立即进入蓄能（makeBossEntity 初始冷却 = chargeSeconds×2）
    const tgt = { id: 'p', team: 'player', x: 0, y: -600, hp: 1000, maxHp: 1000, hullWid: 34 };  // 目标在正上方（angle -π/2）
    const cfgL = RULES.boss.laser;
    const expectStep = (cfgL.laserTurnSpeed !== undefined ? cfgL.laserTurnSpeed : 0.55) * 0.1;
    // 目标方向 -π/2（与当前 0 差 -π/2）→ 每帧向目标转 expectStep，到向即停。
    // #I1：转速由 0.55 降到 0.35 ⇒ 需帧数按 cfg 动态计算（0.35 时需 ≈45 帧转过 π/2）。
    let turned = 0, holdSeen = false;
    const needFrames = Math.ceil((Math.PI / 2) / Math.max(1e-6, expectStep)) + 8;
    for (let i = 0; i < needFrames; i++) {
      const evs = updateBossLaser(tEnt, 0.1, tgt, { entities: [tEnt], isHostile: (a, b) => a !== b });
      for (const ev of evs) if (ev.type === 'laserCharge' || ev.type === 'laserFire') holdSeen = holdSeen || tEnt.bossLaserHoldTurret === true;
      turned = tEnt.turretAngle;
    }
    // 期望：固定角速度持续转（不是 0 冻结），且 #I1 降速后**单次激光周期内转不满** π/2
    //（41 帧 × 0.035 = 1.435 rad < 1.571）——这正是「给玩家走位机会」的量化表达。
    ok(holdSeen, '#H4 激光期 bossLaserHoldTurret=true（接入层据此跳过 AI 转炮）');
    const laserFrames = Math.ceil((RULES.boss.laser.chargeSeconds + RULES.boss.laser.fireSeconds) / 0.1);
    const capTurn = Math.min(laserFrames * expectStep, Math.PI / 2);
    ok(Math.abs(turned) > 1.0 && Math.abs(turned) <= (Math.PI / 2) + 1e-6 && close(Math.abs(turned), capTurn, 0.06),
       `#H4/#I1 固定角速度直驱：turretAngle ${turned.toFixed(3)}（限速转 ${capTurn.toFixed(3)}，转速 ${cfgL.laserTurnSpeed}rad/s 恒定；降速后单周期转不满 π/2 ⇒ 走位窗口）`);
    // 转速恒定断言：单帧转角 = laserTurnSpeed×dt（未对齐时）；到向即停后不再越摆
    const tEnt2 = makeBossEntity(laserBoss, mkEnv());
    tEnt2.x = 0; tEnt2.y = 0; tEnt2.turretAngle = 0; tEnt2.stats.damage = 100;
    tEnt2.hp = tEnt2.maxHp * 0.9; tEnt2.bossLaserCdT = 0;
    updateBossLaser(tEnt2, 0.1, tgt, { entities: [tEnt2], isHostile: (a, b) => a !== b });
    ok(Math.abs(tEnt2.turretAngle - (-expectStep)) < 1e-9,
       `#H4 单帧转角 = laserTurnSpeed×dt（${tEnt2.turretAngle.toFixed(4)} ≈ -${expectStep.toFixed(4)}，固定较慢、不受难度乘子影响）`);
    // 激光结束后 hold 释放：推进 charge+fire 全程 + 余量（冷却期 hold 必须 = false）
    let endHold = null;
    for (let i = 0; i < Math.ceil((chargeS + fireS + 0.4) / 0.1); i++) {
      updateBossLaser(tEnt, 0.1, tgt, { entities: [tEnt], isHostile: (a, b) => a !== b });
      endHold = tEnt.bossLaserHoldTurret;
    }
    ok(endHold === false, '#H4 激光结束 hold 释放（AI 转炮恢复）');

    // --- #I1（2026-09-21）：激光期车体冻结标志（bossLaserHoldMove，接入层据此跳过 driveTank）---
    {
      const mEnt = makeBossEntity(laserBoss, mkEnv());
      mEnt.x = 0; mEnt.y = 0; mEnt.turretAngle = 0; mEnt.stats.damage = 100;
      mEnt.hp = mEnt.maxHp * 0.9; mEnt.bossLaserCdT = 0;
      let sawHoldMove = false;
      for (let i = 0; i < 5; i++) {
        updateBossLaser(mEnt, 0.1, { id: 'p', team: 'player', x: 300, y: 0, hp: 1000, hullWid: 34 },
          { entities: [mEnt], isHostile: (a, b) => a !== b });
        if (mEnt.bossLaserHoldMove === true) sawHoldMove = true;
      }
      ok(sawHoldMove, '#I1 蓄能期 bossLaserHoldMove=true（接入层据此冻结车体）');
      // 转速再降低：单帧转角 = laserTurnSpeed(0.35)×dt
      const stepCfg = RULES.boss.laser.laserTurnSpeed;
      ok(close(stepCfg, 0.35, 1e-9), `#I1 laserTurnSpeed 0.55 → 0.35（实际 ${stepCfg}）`);
      // 激光结束 move 释放
      for (let i = 0; i < Math.ceil((RULES.boss.laser.chargeSeconds + RULES.boss.laser.fireSeconds + 0.4) / 0.1); i++) {
        updateBossLaser(mEnt, 0.1, { id: 'p', team: 'player', x: 300, y: 0, hp: 1000, hullWid: 34 },
          { entities: [mEnt], isHostile: (a, b) => a !== b });
      }
      ok(mEnt.bossLaserHoldMove === false, '#I1 激光结束 bossLaserHoldMove 释放（车体恢复 AI 驱动）');
    }

    // --- #I2（2026-09-21）：蓄能虚线/光束事件携带 blockedDist（绘制层据此截断）---
    {
      const bEnt = makeBossEntity(laserBoss, mkEnv());
      bEnt.x = 0; bEnt.y = 0; bEnt.turretAngle = 0; bEnt.stats.damage = 100;
      bEnt.hp = bEnt.maxHp * 0.9; bEnt.bossLaserCdT = 0;
      const tv = { id: 'p', team: 'player', x: 300, y: 0, hp: 1000, maxHp: 1000, hullWid: 34, hullLen: 64 };
      const wall = { tier: 'building', x: 150, y: 0, w: 60, h: 120, angle: 0, hp: 3 };
      let sawChargeB = null, sawFireB = null, sawBlockedEvt = false;
      for (let i = 0; i < Math.ceil((RULES.boss.laser.chargeSeconds + RULES.boss.laser.fireSeconds + 0.2) / 0.1); i++) {
        const evs = updateBossLaser(bEnt, 0.1, tv, { entities: [tv], isHostile: (a, b) => a !== b, covers: [wall] });
        for (const ev of evs) {
          if (ev.type === 'laserCharge') sawChargeB = ev;
          if (ev.type === 'laserFire') sawFireB = ev;
          if (ev.type === 'laserBlocked') sawBlockedEvt = true;
        }
      }
      // 建筑入口 = 150-30 = 120（光束从炮口 x≈32 出发，入口距离相对炮口 ≈ 88）
      const muzzle = (bEnt.hullLen || 64) * 0.5;
      const expect = 120 - muzzle;
      ok(sawChargeB && sawChargeB.blockedDist !== undefined && close(sawChargeB.blockedDist, expect, 3),
         `#I2 蓄能虚线 blockedDist=${sawChargeB && sawChargeB.blockedDist !== undefined ? sawChargeB.blockedDist.toFixed(1) : 'null'} ≈ 建筑入口 ${expect.toFixed(1)}（虚线截断到掩体）`);
      ok(sawFireB && sawFireB.blockedDist !== undefined && close(sawFireB.blockedDist, expect, 3),
         `#I2 光束 blockedDist 同口径（${sawFireB && sawFireB.blockedDist !== undefined ? sawFireB.blockedDist.toFixed(1) : 'null'}）`);
      ok(sawBlockedEvt, '#I2 掩体后方目标收到 laserBlocked（不掉血）');
      ok(tv.hp === 1000, `#I2 被建筑遮挡的目标不掉血（hp=${tv.hp}）`);
      // 无掩体：blockedDist = 全长
      let sawFull = null;
      const bEnt2 = makeBossEntity(laserBoss, mkEnv());
      bEnt2.x = 0; bEnt2.y = 0; bEnt2.turretAngle = 0; bEnt2.stats.damage = 100;
      bEnt2.hp = bEnt2.maxHp * 0.9; bEnt2.bossLaserCdT = 0;
      for (let i = 0; i < Math.ceil((RULES.boss.laser.chargeSeconds + 0.2) / 0.1); i++) {
        const evs = updateBossLaser(bEnt2, 0.1, tv, { entities: [tv], isHostile: (a, b) => a !== b, covers: [] });
        for (const ev of evs) if (ev.type === 'laserCharge') sawFull = ev;
      }
      ok(sawFull && close(sawFull.blockedDist, RULES.boss.laser.length, 1e-6),
         '#I2 无掩体时 blockedDist = 光束全长（不截断）');
    }
  }

  // --- #H4：全高掩体阻挡光束（用户裁定「会被建筑、岩石等全高掩体阻挡」）---
  {
    const cEnt = makeBossEntity(laserBoss, mkEnv());
    cEnt.x = 0; cEnt.y = 0; cEnt.turretAngle = 0;
    cEnt.stats.damage = 100;
    cEnt.hp = cEnt.maxHp * 0.9; cEnt.bossLaserCdT = 0;
    const behind = { id: 'b', team: 'player', x: 300, y: 0, hp: 1000, maxHp: 1000, hullWid: 34, hullLen: 64 };
    const inOpen = { id: 'o', team: 'player', x: 300, y: 0, hp: 1000, maxHp: 1000, hullWid: 34, hullLen: 64 };
    // 建筑掩体（structure+vision）横在炮口与目标之间；岩石同判据
    const wall = { tier: 'building', x: 150, y: 0, w: 60, h: 120, angle: 0, hp: 3 };
    const rock = { tier: 'rock', x: 150, y: 0, w: 60, h: 120, angle: 0, hp: Infinity, verts: null };
    const bush = { tier: 'bush', x: 150, y: 0, w: 60, h: 120, angle: 0, hp: 1 };
    const coversB = [wall];
    // 蓄能 2.6s → 射击 1.5s：先驱动进 fire 期，再采 2 帧伤害
    const runFire = (covers) => {
      const e2 = makeBossEntity(laserBoss, mkEnv());
      e2.x = 0; e2.y = 0; e2.turretAngle = 0; e2.stats.damage = 100;
      e2.hp = e2.maxHp * 0.9; e2.bossLaserCdT = 0;
      const v = { id: 'v', team: 'player', x: 300, y: 0, hp: 1000, maxHp: 1000, hullWid: 34, hullLen: 64 };
      const ents2 = [v];
      for (let i = 0; i < Math.ceil(RULES.boss.laser.chargeSeconds / 0.1); i++)
        updateBossLaser(e2, 0.1, v, { entities: ents2, isHostile: (a, b) => a !== b, covers });
      updateBossLaser(e2, 0.1, v, { entities: ents2, isHostile: (a, b) => a !== b, covers });
      updateBossLaser(e2, 0.1, v, { entities: ents2, isHostile: (a, b) => a !== b, covers });
      return v.hp;
    };
    const hpWall = runFire(coversB);
    ok(hpWall === 1000, `#H4 建筑（building）挡住光束：被挡目标不掉血（hp=${hpWall}）`);
    const hpRock = runFire([rock]);
    ok(hpRock === 1000, `#H4 岩石（rock）同样阻挡（hp=${hpRock}）`);
    const hpBush = runFire([bush]);
    ok(hpBush < 1000, `#H4 灌木不阻挡光束（hp=${hpBush.toFixed(1)} < 1000）`);
    const hpNone = runFire([]);
    ok(hpNone < 1000, `#H4 无掩体时正常掉血（hp=${hpNone.toFixed(1)}）`);
    void behind; void inOpen;
  }

  // --- 受击反馈：命中触发短暂顿挫 + 冷却门控 ---
  const hEnt = makeBossEntity(laserBoss, mkEnv());
  hEnt.hp = hEnt.maxHp;
  hEnt.bossHitReactCdT = 0;
  ok(triggerBossHitReact(hEnt, false) === true, '#E9 命中触发受击反馈');
  ok(hEnt.bossHitReactT > 0, '#E9 受击反馈窗口 > 0');
  ok(triggerBossHitReact(hEnt, false) === false, '#E9 冷却期内不重复触发（防高射速抖动）');

  // --- 残血减速：阶段机动倍率受 stageSpeedCapMul 上限约束 ---
  const fastBoss = {
    id: 'bf', name: 'BF', tankId: 'dummy',
    stages: [
      { id: 'p1', hpFrom: 1, hpTo: 0.5 },
      { id: 'p2', hpFrom: 0.5, hpTo: 0, onEnter: { modifiers: [{ stat: 'maxSpeed', mode: 'mult', value: 5.0 }] } }
    ]
  };
  const fEnt = makeBossEntity(fastBoss, mkEnv());
  applyBossStage(fEnt, fastBoss.stages[1]);
  const speedMod = fEnt.modifiers.filter(m => m.source === 'boss-stage:p2' && m.stat === 'maxSpeed')[0];
  ok(speedMod && speedMod.value === RULES.boss.stageSpeedCapMul.maxSpeed,
     `#E9 残血阶段机动倍率被上限钳制（${speedMod && speedMod.value} = cap）`);
}

// ================= 2026-09-23 用户反馈：Boss 履带断落随机自修 =================
{
  const trDef = { id: 'btr', name: 'TR', tankId: 'dummy', stages: [{ id: 'p1', hpFrom: 1, hpTo: 0 }] };
  const mkTr = () => {
    const t = makeBossEntity(trDef, mkEnv());
    t.x = 0; t.y = 0; t.hp = t.maxHp;
    return t;
  };
  // 确定性 rng 桩：可注入「时点 / roll」序列
  const seqRng = (vals) => { let i = 0; return () => vals[Math.min(i++, vals.length - 1)]; };
  // 1) 未断履带 → 无事件、无调度
  const t1 = mkTr();
  ok(updateBossTrackRepair(t1, 0.1, {}).length === 0 && t1._trackRepairAt === undefined,
     'trackRepair 未断履带 → 无事件无调度');
  // 2) 断履带（trackBroken+immobT）→ 预定随机时点；roll 成功 → 到点立即修复
  const t2 = mkTr();
  t2.trackBroken = true; t2.immobT = 8;
  const evs2 = updateBossTrackRepair(t2, 0.1, { rng: seqRng([0.5, 0.0]) }); // 时点 4s，roll 必成
  ok(evs2.length === 0 && t2._trackRepairAt !== undefined && t2._trackRepairAt <= 4 + 1e-9,
     'trackRepair 断履带即预定 (0,8s] 内随机时点');
  // 推进 4.05s → 触发修复事件 + 状态清零
  let sawRepair = false;
  for (let i = 0; i < 41; i++) {
    const evs = updateBossTrackRepair(t2, 0.1, { rng: seqRng([0.5, 0.0]) });
    if (evs.some(e => e.type === 'trackRepair')) sawRepair = true;
  }
  ok(sawRepair && t2.trackBroken === false && t2.immobT === 0 && t2._trackRepairAt === undefined,
     'trackRepair 到达决策点 roll 成功 → 立即修复（trackBroken/immobT 清零）');
  // 3) roll 失败 → 保持锁定，等 trackLock 自然归零
  const t3 = mkTr();
  t3.trackBroken = true; t3.immobT = 8;
  let repaired3 = false;
  for (let i = 0; i < 41; i++) {
    const evs = updateBossTrackRepair(t3, 0.1, { rng: seqRng([0.5, 0.99]) }); // roll 必败
    if (evs.some(e => e.type === 'trackRepair')) repaired3 = true;
  }
  ok(!repaired3 && t3.trackBroken === true && t3.immobT > 0 && t3._trackRepairAt === undefined,
     'trackRepair roll 失败 → 保持锁定（不重复 roll，等自然归零）');
  // 4) 修复后再次被击断 → 重新独立决策
  t2.trackBroken = true; t2.immobT = 8;
  updateBossTrackRepair(t2, 0.1, { rng: seqRng([0.9, 0.0]) });
  ok(t2._trackRepairAt !== undefined && t2._trackRepairAt <= 8 + 1e-9,
     'trackRepair 再次断裂 → 重新预定新时点（每次断裂独立决策）');
  // 5) 非 Boss 实体安全
  ok(updateBossTrackRepair(null, 0.1, {}).length === 0, 'trackRepair 非 Boss/空实体安全返回空');
}

console.log('test-boss: 完成所有检查');
if (fails === 0) console.log('test-boss: 全部通过');
else console.error(`test-boss: ${fails} 项失败`);
process.exit(fails === 0 ? 0 : 1);
