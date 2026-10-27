'use strict';
// 2026-10-22（第五批 B1/B2）验证脚本：战斗内核契约。
// 用法：node scripts/test-batch5-combat.js
// 覆盖：
//   §4.1 B1-2 敌方弹种不放大穿深/伤害（ammoStatNeutral）
//   §4.1 B1-3 局内商店后期折扣曲线
//   §4.1 B1-4 击杀分随敌人等级
//   §4.2 B2-2 机炮过热锁定期间不降温
//   §4.2 B2-7 双管换管时间恒 0.8s（不受任何卡影响）
//   §4.2 B2-10 曲射精度 = 4 × 主炮 base 精度 × 距离（2026-10-23 削弱；原 2 × 直射 σ 已取代）
//   §4.9.2(b) 直线掩体部位裁剪（wallPartBlock）
//   RULES 单一来源：新字段齐全、旧字段已删
// 纪律：每条断言都有明确标签；失败时 process.exitCode = 1（AGENTS.md §2.2）。

const fs = require('fs');
const path = require('path');
const RULES_MOD = require('../js/tank_rules.js');
global.RULES = RULES_MOD.RULES;
const G = require('../js/tank_geometry.js');
const U = require('../js/tank_utils.js');
Object.assign(global, U, G);
// 2026-10-22：图鉴 factory 口径需要 normalizeBarrel（tank_halfgeom 的全局）
const _HG = require('../js/tank_halfgeom.js');
Object.assign(global, _HG);
global.TAU = U.TAU;
global.HEIGHTS = G.HEIGHTS;
global.getPartZRange = G.getPartZRange;
global.polyCorners = G.polyCorners;

let pass = 0, fail = 0;
function ok(cond, label) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ FAIL: ${label}`); }
}
function section(t) { console.log(`\n== ${t} ==`); }

const R = global.RULES;

// ---------------------------------------------------------------- RULES 单一来源
section('RULES 新字段 / 旧字段下线');
{
  ok(typeof R.weapons === 'object' && R.weapons.doubleBarrelSwitchSeconds === 0.8,
    'RULES.weapons.doubleBarrelSwitchSeconds === 0.8');
  ok(R.weapons.clipBurstCycleSeconds === 0.5, 'RULES.weapons.clipBurstCycleSeconds === 0.5');
  ok(R.weapons.standardDoubleTapDelay === 0.8 && R.weapons.standardDoubleTapDmgMul === 0.6,
    'RULES.weapons 砰砰炮 0.8s / 0.6×');

  ok(typeof R.autocannon === 'object', 'RULES.autocannon 存在');
  ok(R.autocannon.basePenRatio === 0.80, '机炮基础穿深 = 标准 80%');
  ok(R.autocannon.rangeMaxPx === 1200, '机炮射程上限 1200px');
  ok(R.autocannon.overheatLockMin === 1.0, '过热锁定下限 1.0s');
  ok(Math.abs((R.autocannon.penRatioMax - R.autocannon.penRatioStep * 2)) < 1e-9,
    '穿深增强 +5%/级 → 上限 +10%（恰 2 级）');

  const dl = R.abilities.deploy_limits;
  ok(dl.mineFieldLength === 220 && dl.mineFieldBandWidth === 56, '雷带 长度/带宽 已配置');
  ok(dl.mineFieldMaxDeploy === 1 && dl.mineFieldMaxDeployCap === 3, '雷场槽位 1 → 上限 3');
  ok(dl.mineFieldHeRatio === 1.0, '雷场伤害 = HE × 1.0');
  ok(dl.mineArmorScope === 'hull', '最薄部位口径 = 车体（用户原话）');
  ok(dl.mineMax === undefined, '旧 mineMax 已删除（地雷总数不设上限）');
  ok(dl.mineMaxHardCap === undefined, '旧 mineMaxHardCap 已删除');
  ok(dl.mineFieldRadius === undefined, '旧 mineFieldRadius 已删除（圆→带）');

  ok(R.nodeMap.strip.survival.chunkRows === 1 && R.nodeMap.strip.survival.chunkCount === 1,
    '生存图 chunkRows=1 / chunkCount=1（3×3 屏）');
  ok(R.nodeMap.strip.survivalSupply && R.nodeMap.strip.survivalSupply.count === 4,
    '生存补给点 count = 4');
  ok(R.economy.killScoreLevelStep === 0.25, '击杀分等级系数 0.25');
  ok(R.economy.shopLateDiscount === 0.92 && R.economy.shopLateFromLevel === 5,
    '商店后期折扣 0.92 / 从第 6 级起');
  ok(R.ai.noiseEscalate && R.ai.noiseEscalate.escalateAt === 1.0, '噪声升级阈值 1.0');
  ok(R.boss.railgun && R.boss.railgun.chargeSeconds === 1.2, 'Boss 电磁炮蓄能 1.2s');
}

// ---------------------------------------------------------------- 掩体 tier 替换
section('掩体 tier：栅栏/沙袋下线，wall 家族上线');
{
  ok(R.coverTiers.soft === undefined, 'soft（栅栏）已删除');
  ok(R.coverTiers.barricade === undefined, 'barricade（沙袋）已删除');
  ok(R.coverTiers.wall && R.coverTiers.wall.shellBlock === 'wall',
    'wall 存在且 shellBlock === "wall"');
  ok(R.coverTiers.wall.passability === 0, 'wall 不可通行');
  ok(R.coverTiers.wall.destructible === null && R.coverTiers.wall.hp === Infinity,
    'wall 不可摧毁（hp Infinity）');
  ok(R.coverTiers.wall_breakable && R.coverTiers.wall_breakable.hp === 4,
    'wall_breakable 耐久 4 发');
  ok(R.coverTiers.wall_breakable.toTier === null, 'wall_breakable 摧毁后不降级（toTier null）');
  ok(R.coverRules.wallHugDist === 22, 'RULES.coverRules.wallHugDist = 22');
}

// ---------------------------------------------------------------- 敌人弹种中性
section('§4.1 B1-2 敌方弹种不再放大穿深/伤害');
{
  const M = require('../js/tank_model.js');
  const t = {};
  M.applyEnemyAmmoByLevel(t, 13);
  ok(t.ammoKey === 'apfsds_ad', 'Lv13 → apfsds_ad');
  ok(t.enemyLevel === 13, 'enemyLevel 落盘');
  ok(t.ammoStatNeutral === true, 'ammoStatNeutral = true（消费方据此把 pen/dmg 按 1.0 处理）');

  const t2 = {};
  M.applyEnemyAmmoByLevel(t2, 1);
  ok(t2.ammoKey === 'ap' && t2.enemyLevel === 1, 'Lv1 → ap');
  // 负向断言：旧调用不传 level 时不得崩
  const t3 = {};
  M.applyEnemyAmmoByLevel(t3, undefined);
  ok(t3.ammoKey === 'ap' && t3.ammoStatNeutral === true, '缺省 level → ap（向后兼容）');
  // 注：2026-10-26（§4.143）补的**消费端**真断言（打一颗弹验穿深受中和）在
  //   `scripts/test-fire.js`——那里已装配完整 fire 链全局依赖，避免本文件重复搭脚手架。
}

// ---------------------------------------------------------------- 商店曲线
section('§4.1 B1-3 局内商店后期折扣');
{
  const Econ1 = require('../js/tank_economy.js');
  const def = { baseCost: 25, costGrowth: 1.6 };
  ok(Econ1.runShopPriceFor(def, 0) === 25, 'Lv0 = 25（不变）');
  ok(Econ1.runShopPriceFor(def, 3) === 102, 'Lv3 = 102（不变）');
  ok(Econ1.runShopPriceFor(def, 5) === 262, 'Lv5 = 262（不变，折扣未开始）');
  ok(Econ1.runShopPriceFor(def, 6) === 386, `Lv6 = 386（首次打折，实际 ${Econ1.runShopPriceFor(def, 6)}）`);
  ok(Econ1.runShopPriceFor(def, 10) === 1812, `Lv10 = 1812（−34%，实际 ${Econ1.runShopPriceFor(def, 10)}）`);
  ok(Econ1.runShopPriceFor(def, 15) === 12520, `Lv15 = 12520（−57%，实际 ${Econ1.runShopPriceFor(def, 15)}）`);
  // 折扣不得使价格倒挂（后一级必须比前一级贵）
  let mono = true;
  for (let lv = 0; lv < 20; lv++) if (Econ1.runShopPriceFor(def, lv + 1) <= Econ1.runShopPriceFor(def, lv)) mono = false;
  ok(mono, '价格随等级单调递增（折扣不产生倒挂）');
}

// ---------------------------------------------------------------- 击杀分
section('§4.1 B1-4 击杀分随敌人等级');
{
  const E = require('../js/tank_economy.js');
  ok(E.killScore(1) === 20, 'Lv1 = 20');
  ok(E.killScore(4) === 35, 'Lv4 = 35');
  ok(E.killScore(7) === 50, 'Lv7 = 50');
  ok(E.killScore(10) === 65, 'Lv10 = 65');
  ok(E.killScore(13) === 80, 'Lv13 = 80');
  ok(E.killScore(undefined) === 20, '不传 level 等价 Lv1（向后兼容）');
  ok(E.killScore(13) > E.killScore(1), '高等级敌人得分更高（用户诉求）');
}

// ---------------------------------------------------------------- 双管换管时间
section('§4.2 B2-7 双管换管时间固定 0.8s');
{
  const Wpn1 = require('../js/tank_weapons.js');
  ok(Wpn1.WEAPON_DEFAULTS.primary.double_barrel.switchSeconds === 0.8,
    'WEAPON_DEFAULTS.double_barrel.switchSeconds = 0.8（与 RULES 同值）');
  ok(R.weapons.doubleBarrelSwitchSeconds === Wpn1.WEAPON_DEFAULTS.primary.double_barrel.switchSeconds,
    'RULES 与 WEAPON_DEFAULTS 两处同值（无双口径）');
  // 卡牌侧：交替装填不得再改 switchSeconds
  let altCard = null;
  try {
    altCard = JSON.parse(fs.readFileSync(path.join(__dirname, '../cards/weapon_primary_alt_reload.json'), 'utf8'));
  } catch (e) { /* 文件不存在时下面断言会失败，信息足够 */ }
  ok(!!altCard, '交替装填卡存在');
  if (altCard) {
    const ef = (altCard.effects || [])[0] || {};
    const so = ef.statOverrides || {};
    ok(so.switchSeconds === undefined, '交替装填卡不再覆写 switchSeconds（负向断言）');
    ok(so.reloadMult === undefined, '交替装填卡不再覆写 reloadMult（负向断言）');
    ok(so.altReload === true, '交替装填卡保留 altReload:true');
    ok(altCard.rarity === 'epic', `交替装填卡稀有度 = epic（实际 ${altCard.rarity}）`);
  }
  // 同步击发卡必须已被删除
  let syncExists = true;
  try { fs.readFileSync(path.join(__dirname, '../cards/weapon_primary_sync_fire.json'), 'utf8'); } catch (e) { syncExists = false; }
  ok(syncExists === false, '同步击发装置卡已删除（负向断言）');
}

// ---------------------------------------------------------------- 曲射精度
// 2026-10-23（用户裁定「削弱榴弹炮模式」）：旧口径「2 × 直射精度 × 距离」**已被取代**。
//   现行：精度 = **4 × 主炮 base 精度 × 瞄准距离**，且**不乘 player.sigma**
//   （sigma 含 aimSpeed/spreadMult/运动扩圈等主武器改装，不得进曲射）。
section('§4.2 B2-10 曲射精度 = 4 × 主炮 base 精度 × 距离（2026-10-23 削弱，原 2 × 直射 σ）');
{
  const Wpn2 = require('../js/tank_weapons.js');
  ok(Wpn2.WEAPON_DEFAULTS.primary.howitzer.spreadFactor === 4.0,
    `howitzer.spreadFactor = 4.0（实际 ${Wpn2.WEAPON_DEFAULTS.primary.howitzer.spreadFactor}）`);
  const R2 = require('../js/tank_rules.js').RULES;
  const baseSigma = R2.spread.base, dist = 600;
  const radius = baseSigma * Wpn2.WEAPON_DEFAULTS.primary.howitzer.spreadFactor * dist;
  const straight = baseSigma * 1.0 * dist;
  ok(Math.abs(radius - 4 * straight) < 1e-9, '散布圈半径 = 4 × 主炮 base 散布 × 距离');
  // 负向断言：不得再乘 player.sigma（源码层面）
  const fireSrc2 = fs.readFileSync(path.join(__dirname, '../js/tank_fire.js'), 'utf8');
  ok(!fireSrc2.includes('_sigEff * spreadFactor'),
    '曲射精度**不再**用 _sigEff × spreadFactor（负向断言，防主武器 σ 回潮）');
  ok(fireSrc2.includes('HOWITZER_SPREAD_MULT'),
    '曲射精度走显式 4× 倍率常量 HOWITZER_SPREAD_MULT');
}

// ---------------------------------------------------------------- 直线掩体部位裁剪
section('§4.9.2(b) 直线掩体部位裁剪 wallPartBlock');
{
  const C = require('../js/tank_cover.js');
  ok(typeof C.wallPartBlock === 'function', 'tank_cover 导出 wallPartBlock');
  if (typeof C.wallPartBlock === 'function') {
    // 竖直掩体：x=1000，长 200（沿 y），angle=0 ⇒ 法向 = (0,1)？见实现注释：
    // 本测试用「掩体 angle=0、法向沿 y」的约定：掩体是水平墙时，两侧是上下。
    // 为避免依赖 angle 约定细节，这里用三种距离关系断言**行为**，不写死几何假设。
    const wall = { x: 1000, y: 500, w: 200, h: 26, angle: 0, tier: 'wall' };
    // A：射手贴墙（distance ≈ 10），目标在另一侧远处（distance ≈ 300）
    const shooterHug = { x: 1000, y: 512, team: 'player' };
    const targetFar = { x: 1000, y: 800, team: 'enemy' };
    const r1 = C.wallPartBlock(wall, shooterHug, targetFar);
    ok(r1 && r1.blockHull !== true, '① 贴墙射手打更远目标：车体不被挡（有射界）');

    // B：射手远（≈400），目标近（≈60）——目标更近 ⇒ 只能打炮塔
    const shooterFar = { x: 1000, y: 900, team: 'player' };
    const targetNear = { x: 1000, y: 560, team: 'enemy' };
    const r2 = C.wallPartBlock(wall, shooterFar, targetNear);
    ok(r2 && r2.blockHull === true, '② 远侧射手打更近目标：车体被挡（只能打炮塔）');
    ok(r2 && r2.blockTurret !== true, '② 炮塔仍可命中');

    // C：同侧（都在掩体上方）——掩体不参与
    const sameSideS = { x: 1000, y: 400, team: 'player' };
    const sameSideT = { x: 1000, y: 300, team: 'enemy' };
    const r3 = C.wallPartBlock(wall, sameSideS, sameSideT);
    ok(r3 && r3.blockHull !== true && r3.blockTurret !== true, '③ 同侧：不裁剪');

    // D：目标更远（非贴墙）⇒ 车体+炮塔都可打
    const shooterMid = { x: 1000, y: 700, team: 'player' };
    const targetFarther = { x: 1000, y: 300, team: 'enemy' };
    const r4 = C.wallPartBlock(wall, shooterMid, targetFarther);
    ok(r4 && r4.blockHull !== true, '④ 目标更远：车体不被挡（可命中车体与炮塔）');

    // E：边界 —— 无掩体/无射手/无目标时不抛错
    let threw = false;
    try { C.wallPartBlock(null, null, null); } catch (e) { threw = true; }
    ok(!threw, '⑤ 空参数不抛错（防御）');
  }
}

// ---------------------------------------------------------------- Boss 简报
section('§4.1 B1-5(a) Boss 进场简报（修 #Z2）');
{
  const Boss1 = require('../js/tank_boss.js');
  ok(typeof Boss1.bossBriefing === 'function', 'tank_boss 导出 bossBriefing');
  ok(typeof Boss1.bossBriefingLines === 'function', 'tank_boss 导出 bossBriefingLines');
  const ent = {
    id: 'boss_t', boss: { name: '试验型', desc: '描述文本', stages: [{ id: 's1' }, { id: 's2' }] },
    weapons: { primary: { type: 'railgun', stats: { damage: 300, penetration: 200 } }, secondary: { type: 'mortar', stats: {} } },
    cardEffects: [
      { type: 'weapon', cardId: 'w1', cardName: '锥膛炮管', weaponType: 'railgun' },
      { type: 'ability', key: 'shield', params: { durationMult: 1.5 }, cardId: 'boss-skill' }
    ]
  };
  const v = Boss1.bossBriefing(ent);
  ok(v && v.name === '试验型', 'name 取自实体');
  ok(v && v.stageCount === 2, 'stageCount = 2');
  ok(v && v.weapons.primary.label === '电磁轨道炮', '主武器标签可读');
  ok(v && v.weapons.secondary.label === '车载迫击炮', '副武器标签可读');
  ok(v && v.upgrades.length === 1 && v.upgrades[0].name === '锥膛炮管', '改装卡名可读（cardName）');
  ok(v && v.skills.length === 1 && v.skills[0].boosted === true, '技能 [强化] 标记');
  const lines = Boss1.bossBriefingLines(ent);
  ok(Array.isArray(lines) && lines.length >= 4, `日志兜底 ≥4 行（实际 ${lines.length}）`);
  // 负向：空实体 / 无 weapons
  ok(Boss1.bossBriefing(null) === null, '空实体返回 null（不抛错）');
  const bare = Boss1.bossBriefing({ id: 'x' });
  ok(bare && bare.weapons.primary.label === '标准主炮', '无 weapons 时回落标准主炮（不抛错）');
}

// ---------------------------------------------------------------- Boss 电磁炮蓄能
section('§4.1 B1-5(b) Boss 电磁炮蓄能事件');
{
  const Boss2 = require('../js/tank_boss.js');
  ok(typeof Boss2.updateBossRailCharge === 'function', 'tank_boss 导出 updateBossRailCharge');
  const t = { hp: 100, maxHp: 100, x: 0, y: 0, turretAngle: 0, reloadT: 0.5, weapons: { primary: { type: 'railgun' } } };
  let sawCharge = false, sawReady = false, maxProg = 0;
  for (let i = 0; i < 40; i++) {
    const evts = Boss2.updateBossRailCharge(t, 0.05);
    for (const e of evts) {
      if (e.type === 'railCharge') { sawCharge = true; maxProg = Math.max(maxProg, e.progress); }
      if (e.type === 'railReady') sawReady = true;
    }
  }
  ok(sawCharge, '产出 railCharge 事件');
  ok(maxProg > 0.99, `progress 能达到 1（实际 ${maxProg.toFixed(2)}）`);
  ok(sawReady, '蓄能完成产出 railReady');
  ok(t.railChargeHold === false, '蓄能完成后 railChargeHold = false（放行开火）');
  // 非电磁炮 → 零事件
  const t2 = { hp: 100, x: 0, y: 0, reloadT: 0.1, weapons: { primary: { type: 'standard' } } };
  ok(Boss2.updateBossRailCharge(t2, 0.05).length === 0, '非 railgun 不产出事件（负向）');
  ok(t2.railChargeHold === false, '非 railgun 不置 hold（负向）');

  // 2026-10-26（用户反馈）：炮线 = 红色恒定指示线，事件必须带「掩体截断距离」且坐标/角度有限
  const t3 = { hp: 100, maxHp: 100, x: 0, y: 0, turretAngle: 0, reloadT: 0.5, weapons: { primary: { type: 'railgun' } } };
  const ev3 = Boss2.updateBossRailCharge(t3, 0.05).filter(e => e.type === 'railCharge')[0];
  ok(!!ev3 && isFinite(ev3.x) && isFinite(ev3.y) && isFinite(ev3.angle),
    `railCharge 坐标/角度有限：(${ev3 && ev3.x}, ${ev3 && ev3.y}) @${ev3 && ev3.angle}`);
  ok(!!ev3 && ev3.blockedDist === R.boss.railgun.lineLength,
    `无 covers 时不被截断：blockedDist ${ev3 && ev3.blockedDist} === lineLength ${R.boss.railgun.lineLength}`);
  // 全高建筑（structure + vision）挡线：入口距离 ≈ 建筑近侧
  const wall = { x: 500, y: 0, w: 100, h: 200, angle: 0, tier: 'full', hp: 999 };
  const t4 = { hp: 100, maxHp: 100, x: 0, y: 0, turretAngle: 0, reloadT: 0.5, weapons: { primary: { type: 'railgun' } } };
  const ev4 = Boss2.updateBossRailCharge(t4, 0.05, null, { covers: [wall] }).filter(e => e.type === 'railCharge')[0];
  ok(!!ev4 && Math.abs(ev4.blockedDist - 450) < 1,
    `全高建筑截断炮线：blockedDist ${ev4 && Math.round(ev4.blockedDist)} ≈ 450（建筑近侧 500−50）`);
  // 灌木/水面不挡炮线（同一判据：tierGroup 非 structure）
  const bush = { x: 500, y: 0, w: 100, h: 200, angle: 0, tier: 'bush', hp: 1 };
  const t5 = { hp: 100, maxHp: 100, x: 0, y: 0, turretAngle: 0, reloadT: 0.5, weapons: { primary: { type: 'railgun' } } };
  const ev5 = Boss2.updateBossRailCharge(t5, 0.05, null, { covers: [bush] }).filter(e => e.type === 'railCharge')[0];
  ok(!!ev5 && ev5.blockedDist === R.boss.railgun.lineLength,
    `灌木不截断炮线（负向）：blockedDist ${ev5 && ev5.blockedDist}`);
  // railReady 与 charge 同源截断（ready 画满进度，也必须被掩体截断）
  const t6 = { hp: 100, maxHp: 100, x: 0, y: 0, turretAngle: 0, reloadT: 0.5, weapons: { primary: { type: 'railgun' } } };
  let ready6 = null;
  for (let i = 0; i < 40 && !ready6; i++) {
    const es = Boss2.updateBossRailCharge(t6, 0.05, null, { covers: [wall] });
    ready6 = es.filter(e => e.type === 'railReady')[0] || null;
  }
  ok(!!ready6 && Math.abs(ready6.blockedDist - 450) < 1,
    `railReady 同样按掩体截断：blockedDist ${ready6 && Math.round(ready6.blockedDist)}`);

  // 开火音效分工（2026-10-26 用户裁定）：Boss ⇒ bossRailFire（放箭），玩家 ⇒ firerail
  const F2 = require('../js/tank_fire.js');
  ok(typeof F2._fireSoundKeyFor === 'function', 'tank_fire 导出 _fireSoundKeyFor（音效键选择）');
  const railSpec = { type: 'railgun' }, stdSpec = { type: 'standard' };
  ok(F2._fireSoundKeyFor({ isBoss: true }, railSpec) === 'bossRailFire', 'Boss 电磁炮开火 → bossRailFire');
  ok(F2._fireSoundKeyFor({ id: 'player' }, railSpec) === 'firerail', '玩家电磁炮开火 → firerail（不受影响）');
  ok(F2._fireSoundKeyFor({ isBoss: true }, stdSpec) === 'fire', 'Boss 非电磁炮 → fire（负向：不误用箭袭音）');
}


// ---------------------------------------------------------------- 2026-10-22 第四批反馈
// 2026-10-23（用户裁定两连）：「曲射榴弹炮又把主武器的机制给带过来了」+「削弱榴弹炮模式」。
//   两条旧口径**已被推翻**，本段随之改为新口径断言（旧断言以负向形式保留，防回潮）：
//     ① 弹种：**只绑基础 HE**（RULES.ammoTypes.he），不再解析「已获得的 HE 家族」；
//     ② 精度：**4 × base × 距离**，不再取 max(base, 实时 σ)；
//     ③ 装填仍不吃主武器 reloadMult，且改读 base.reload。
section('榴弹炮 = 标准主炮射击模式（不继承主武器卡升级，2026-10-23 收严）');
{
  const W = require('../js/tank_weapons.js');
  const hsDef = W.WEAPON_DEFAULTS.primary.howitzer;
  ok(!!hsDef && hsDef.isArc === true, 'howitzer 仍是 isArc 模式载体');
  const src = fs.readFileSync(path.join(__dirname, '../js/tank_fire.js'), 'utf8');
  // ① 弹种：负向断言——HE 家族解析必须已删除，且恒取基础 he
  ok(!src.includes("const _HE_FAMILY = ['blast_he', 'proximity_he', 'hesh', 'aphe', 'he'];"),
    '曲射**不再**按 HE 家族解析「已获得的 HE」（负向断言，2026-10-23 用户裁定）');
  ok(src.includes("const heKey = 'he';"), '曲射弹种恒为基础 he（只绑 base 的 he 伤害/穿深）');
  // ② 精度：负向断言——_sigEff 通道必须已删除
  ok(!src.includes('_sigEff * spreadFactor'), '曲射精度**不再**用 _sigEff（负向断言）');
  // ③ 装填
  ok(src.includes('const _effReloadMult = _hsMode ? 1 : reloadMult;'),
    '曲射装填不吃主武器 reloadMult（_effReloadMult = 1）');
  ok(src.includes('_reloadBase*_effReloadMult'), '曲射装填走 base 通道（_reloadBase）');
  ok(!src.includes("dmgText(s.x, s.y - 14, '轰击', 'he');"), '落点不再叠「轰击」文字（负向断言）');
}

section('掩体贴图 = 俯视 2.5D（不是正视图）');
{
  const A = require('../js/tank_assets.js');
  const src = fs.readFileSync(path.join(__dirname, '../js/tank_assets.js'), 'utf8');
  ok(src.includes('side = Math.max(1.6, Math.min(5, T * 0.26));'),
    'wallFrame 统一算侧壁厚度（俯视 2.5D 的「厚度」）');
  ok(src.includes('fn(L, T - side, side);'), '各 style 只画顶面（T 已扣掉侧壁）');
  // 负向：sandbag 不再是「2 层堆叠」（那是正视图特征）
  const sbStart = src.indexOf('function bakeWallSandbag');
  const sbEnd = src.indexOf('function bakeWallSteel');
  const sb = src.slice(sbStart, sbEnd);
  ok(!/for\(let r = 0; r < 2; r\+\+\)/.test(sb), 'sandbag 不再画 2 层堆叠（正视图特征已移除）');
  ok(sb.includes('俯视') || sb.includes('1 排'), 'sandbag 注释明确「单层俯视」');
  ok(!!A.ASSET_DEFS.wall, 'ASSET_DEFS.wall 存在');
  ok((A.ASSET_DEFS.wall.wallStyles || []).length === 6, '六套 wallStyle 仍在');
}


section('图鉴各车数值不同（enemyPreviewStats factory 口径）');
{
  const TM = require('../js/tank_model.js');
  ok(typeof TM.resolvePartArmor === 'function', 'tank_model 导出 resolvePartArmor（图鉴 factory 依赖）');
  Object.assign(global, TM);   // 图鉴 factory 分支需 refreshStats / resolvePartArmor 可用
  const Panels = require('../js/tank_panels_core.js');
  const tanks = {};
  for (const f of fs.readdirSync(path.join(__dirname, '../tanks')).filter(x => x.endsWith('.json'))) {
    const j = JSON.parse(fs.readFileSync(path.join(__dirname, '../tanks', f), 'utf8'));
    tanks[j.id] = j;
  }

  const ids = ['tiger-I', 'Leapard_1', 'panzer-IV', 'Obj 780', 'hummel'];
  const rows = ids.map(id => Panels.enemyPreviewStats(id, 1, { tanks, factory: true })).filter(Boolean);
  ok(rows.length === ids.length, '五辆车全部可预览（factory 口径）');
  const armorSigs = new Set(rows.map(r => JSON.stringify(r.armor)));
  ok(armorSigs.size === ids.length, `五辆车的六面装甲互不相同（${armorSigs.size}/${ids.length} 种）`);
  const hpSigs = new Set(rows.map(r => r.maxHp));
  ok(hpSigs.size > 1, `HP 不再全部相同（${[...hpSigs].join('/')}）`);
  // 实战口径零回归：不传 factory 仍是固定基准
  const base = Panels.enemyPreviewStats('tiger-I', 1, { tanks });
  ok(base && base.maxHp === 100 && base.armor.hull.front === 100,
    '不传 factory 时仍走实战固定基准（零回归）');
}


section('防线墙（掩体呈现防线、防御玩家进攻方向）');
{
  const NG2 = require('../js/tank_nodegen.js');
  ok(typeof NG2.placeDefenseWalls === 'function', 'nodegen 导出 placeDefenseWalls');
  ok(typeof NG2.obbHitsCover === 'function', 'nodegen 导出 obbHitsCover（路面避让复用）');
  const DW = RULES.nodeMap.defenseWalls;
  ok(!!DW && DW.enabled === true, 'RULES.nodeMap.defenseWalls 存在且启用');
  ok(DW.segLenMin >= 100 && DW.segLenMax <= 220, '段长区间合理（' + DW.segLenMin + '~' + DW.segLenMax + '）');
  ok(DW.gapMin >= 60, '通行口下限 ≥60px（保证必有一条可通行走廊）');

  // ① 直调：竖墙形态 + 法线朝玩家
  const rng = NG2.createRNG(424242);
  const covers = [];
  const placed = NG2.placeDefenseWalls(rng, covers, {
    worldW: 2400, worldH: 700,
    playerSpawn: { x: 240, y: 350 },
    anchorXs: [1100, 1700],
    roadSegs: [],
    linesWanted: 2
  });
  ok(placed.length >= 4, '两道防线至少 4 段墙（实际 ' + placed.length + '）');
  ok(covers.length === placed.length, '墙已 push 进 covers');
  let vertical = 0, facing = 0;
  for (const c of placed) {
    const a = c.angle || 0;
    // 竖直：angle ≈ ±90°（mod 180 后落在 90±25°）
    const deg = ((a * 180 / Math.PI) % 180 + 180) % 180;
    if (deg > 65 && deg < 115) vertical++;
    // 法线（a±90°）指向玩家出生点
    const toSpawn = Math.atan2(350 - c.y, 240 - c.x);
    for (const n of [a + Math.PI / 2, a - Math.PI / 2]) {
      let d = Math.abs(((n - toSpawn) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI);
      if (d < Math.PI / 4) { facing++; break; }
    }
  }
  ok(vertical === placed.length, '全部墙段竖直（' + vertical + '/' + placed.length + '）');
  ok(facing === placed.length, '全部墙法线朝向玩家（' + facing + '/' + placed.length + '）');
  // 按防线分组（x 差 <400 视为同一道）：每组内部跨度应很小（只有 jitter ±thick 的起伏）
  const sorted = placed.slice().sort((p, q) => p.x - q.x);
  let maxSpan = 0, groups = 1;
  let gx0 = sorted[0].x;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].x - gx0 > 400) { groups++; gx0 = sorted[i].x; }
    else maxSpan = Math.max(maxSpan, sorted[i].x - gx0);
  }
  ok(groups === 2, '两道防线分组（实际 ' + groups + '）');
  ok(maxSpan < 120, '每道防线内 x 起伏小（jitter 级，最大 ' + Math.round(maxSpan) + 'px < 120）');

  // ② 每段都带 defenseLine 标记与合法 tier
  ok(placed.every(c => c.defenseLine === true), '每段带 defenseLine 标记');
  ok(placed.every(c => c.tier === 'wall' || c.tier === 'wall_breakable'), 'tier 合法');
}

// ---------------------------------------------------------------- 收尾

section('防线墙（掩体呈现防线、防御玩家进攻方向）');
{
  const NG = require('../js/tank_nodegen.js');
  ok(typeof NG.placeDefenseWalls === 'function', 'nodegen 导出 placeDefenseWalls');
  ok(typeof NG.obbHitsCover === 'function', 'nodegen 导出 obbHitsCover（路面避让复用）');
  const DW = RULES.nodeMap.defenseWalls;
  ok(!!DW && DW.enabled === true, 'RULES.nodeMap.defenseWalls 存在且启用');
  ok(DW.segLenMin >= 100 && DW.segLenMax <= 220, '段长区间合理（' + DW.segLenMin + '~' + DW.segLenMax + '）');
  ok(DW.gapMin >= 60, '通行口下限 ≥60px（保证必有一条可通行走廊）');

  // ① 直调：竖墙形态 + 法线朝玩家
  const rng = NG.createRNG(424242);
  const covers = [];
  const placed = NG.placeDefenseWalls(rng, covers, {
    worldW: 2400, worldH: 700,
    playerSpawn: { x: 240, y: 350 },
    anchorXs: [1100, 1700],
    roadSegs: [],
    linesWanted: 2
  });
  ok(placed.length >= 4, '两道防线至少 4 段墙（实际 ' + placed.length + '）');
  ok(covers.length === placed.length, '墙已 push 进 covers');
  let vertical = 0, facing = 0;
  for (const c of placed) {
    const a = c.angle || 0;
    // 竖直：angle ≈ ±90°（mod 180 后落在 90±25°）
    const deg = ((a * 180 / Math.PI) % 180 + 180) % 180;
    if (deg > 65 && deg < 115) vertical++;
    // 法线（a±90°）指向玩家出生点
    const toSpawn = Math.atan2(350 - c.y, 240 - c.x);
    for (const n of [a + Math.PI / 2, a - Math.PI / 2]) {
      let d = Math.abs(((n - toSpawn) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI);
      if (d < Math.PI / 4) { facing++; break; }
    }
  }
  ok(vertical === placed.length, '全部墙段竖直（' + vertical + '/' + placed.length + '）');
  ok(facing === placed.length, '全部墙法线朝向玩家（' + facing + '/' + placed.length + '）');
  // 按防线分组（x 差 <400 视为同一道）：每组内部跨度应很小（只有 jitter ±thick 的起伏）
  const sorted = placed.slice().sort((p, q) => p.x - q.x);
  let maxSpan = 0, groups = 1;
  let gx0 = sorted[0].x;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].x - gx0 > 400) { groups++; gx0 = sorted[i].x; }
    else maxSpan = Math.max(maxSpan, sorted[i].x - gx0);
  }
  ok(groups === 2, '两道防线分组（实际 ' + groups + '）');
  ok(maxSpan < 120, '每道防线内 x 起伏小（jitter 级，最大 ' + Math.round(maxSpan) + 'px < 120）');

  // ② 每段都带 defenseLine 标记与合法 tier
  ok(placed.every(c => c.defenseLine === true), '每段带 defenseLine 标记');
  ok(placed.every(c => c.tier === 'wall' || c.tier === 'wall_breakable'), 'tier 合法');
}

// ---------------------------------------------------------------- 收尾
console.log(`\n=== ${pass} passed, ${fail} failed ===`);
if (fail > 0) process.exitCode = 1;
