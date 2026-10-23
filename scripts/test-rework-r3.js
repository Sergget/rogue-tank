'use strict';
// scripts/test-rework-r3.js — R-3 阶段（特种弹药与曲射系统）自动化测试套件

const RULES_MOD = require('../js/tank_rules.js');
global.RULES = RULES_MOD.RULES;
const U = require('../js/tank_utils.js');
global.TAU = U.TAU; global.norm = U.norm; global.rotate = U.rotate; global.angDiff = U.angDiff;
global.segRayIntersect = U.segRayIntersect; global.partCorners = U.partCorners; global.partEdges = U.partEdges;
global.reflectDir = U.reflectDir; global.distToSegment = U.distToSegment; global.gaussian = U.gaussian;
const G = require('../js/tank_geometry.js');
global.ARMOR = G.ARMOR; global.BOUNCE_ANGLE = G.BOUNCE_ANGLE; global.HEIGHTS = G.HEIGHTS;
global.getPartZRange = G.getPartZRange; global.getGunHeight = G.getGunHeight;
global.hullPoly = G.hullPoly; global.turretPoly = G.turretPoly;
global.raycastTank = G.raycastTank; global.bestHitForPref = G.bestHitForPref; global.shellPartHit = G.shellPartHit;
global.aimPartPreference = G.aimPartPreference; global.moduleFromHit = G.moduleFromHit;
global.faceLabel = G.faceLabel; global.superstructureLabel = G.superstructureLabel;
global.gunRoot = G.gunRoot; global.gunTip = G.gunTip;
const M = require('../js/tank_model.js');
global.makeTank = M.makeTank; global.computeStats = M.computeStats; global.moduleMult = M.moduleMult;
global.debuffReloadRate = M.debuffReloadRate; global.setDebuff = M.setDebuff;
const C = require('../js/tank_cover.js');
global.COVER_TIERS = C.COVER_TIERS; global.findCoversOnPath = C.findCoversOnPath; global.getExposure = C.getExposure;
global.coverNormalAt = C.coverNormalAt; global.damageCover = C.damageCover; global.splashCoversAt = C.splashCoversAt;
global.covers = C.covers; global.spawnSmokeCloud = C.spawnSmokeCloud;
if (!global.entities) global.entities = [];
global.polyCorners = G.polyCorners; global.polyEdges = G.polyEdges;
const P = require('../js/tank_physics.js');
global.resolveHit = P.resolveHit; global.impactGeometry = P.impactGeometry; global.applyModuleDamage = P.applyModuleDamage;
const B = require('../js/tank_battledraw.js');   // PLAN §8.1.2 副炮塔绘制（纯位姿 secondaryTurretPose）
global.paintShade = global.paintShade || function(hex){ return hex; };   // tank_paint.js 全局（Node 下 drawSecondaryTurret 的 shade 依赖）
const SH = require('../js/tank_shield.js');
global.hasShield = SH.hasShield; global.shieldAbsorbs = SH.shieldAbsorbs; global.absorbDamage = SH.absorbDamage;
global.applyShield = SH.applyShield;
global.burstExplosion = function(){};
global.spawnMuzzleFlash = function(){};
global.spawnImpactFx = function(){};
global.spawnDmgText = function(){};
global.spawnSmoke = function(){};
global.spawnTracer = function(){};
global.playSound = function(){return true;};
global.pushLog = function(){};
global.isHostile = function(){return true;};
const F = require('../js/tank_fire.js');
const W = require('../js/tank_weapons.js');

let fails = 0;
function ok(cond, label) {
  if (cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}`); fails++; }
}

console.log('=== 开始 R-3 阶段特种弹药与曲射系统自动化测试 (test-rework-r3.js) ===');

// 1. 测试 APFSDS 双次模块抽取与最高倍率/双效果生效
{
  const target = M.makeTank({ team: 'enemy', hp: 500 });
  const shooter = M.makeTank({ team: 'player', ammoKey: 'apfsds' });

  // 模拟 APFSDS 击穿命中车体前部
  const hit = { part: 'hull', faceKey: 'front', x: target.x + 20, y: target.y, nx: 1, ny: 0, t: 10 };
  const res = P.resolveHit({ shooter, pen: 300, dmg: 100, ammoKey: 'apfsds' }, target, hit, false);

  ok(res.outcome === 'PEN', 'APFSDS 成功击穿重装甲目标');
  ok(res.modKey !== undefined, 'APFSDS 成功触发模块/成员判定');
  ok(res.dmg > 0, 'APFSDS 造成有效扣血');
  console.log('✓ APFSDS 击穿与双次模块判定测试通过');
}

// 2. 曲射武器规则配置（2026-09-14 定案：HEC 弹种移除；2026-09-15 用户裁定：主武器曲射机制移除，
//    曲射仅由副武器迫击炮承担——mortar isArc + ignoreCover 落点机制保留）
{
  ok(global.RULES.ammoTypes.hec === undefined, 'HEC 弹种已从 RULES.ammoTypes 移除（2026-09-14 定案）');
  // 2026-10-20 task-7 改写：原断言 `W.WEAPON_DEFAULTS.primary.howitzer === undefined`
  //   （「榴弹炮主武器类型已移除（2026-09-15 用户裁定）」）**口径已过期**。2026-10-19/20 #W-I
  //   用户裁定把榴弹炮曲射机制**作为「曲射模式」加回**——注意它是**模式参数表**而非可安装的
  //   主武器类型：`RULES.weaponTypes.primary` 仍不含 howitzer（下表第二条断言继续守这条），
  //   卡牌经**副武器槽**装载 howitzer（`WEAPON_DEFAULTS.secondary.howitzer` 只占类型位，
  //   实际参数读 `primary.howitzer` 单一口径，见 js/tank_weapons.js:63-71）。
  //   ⇒ 改为双层断言：「不可安装为主武器类型」+「参数表确实存在且是曲射模式形状」。
  //   这样既保留 2026-09-15「主武器曲射机制移除」的原意（不能把 howitzer 当主炮装），
  //   又不会误杀 #W-I 合法加回的模式参数表。
  ok(W.WEAPON_DEFAULTS.primary.howitzer !== undefined,
     '#W-I（2026-10-20）：曲射模式参数表 WEAPON_DEFAULTS.primary.howitzer 存在（不再是独立主武器类型）');
  ok(W.WEAPON_DEFAULTS.primary.howitzer.isArc === true
     && typeof W.WEAPON_DEFAULTS.primary.howitzer.arcSpeed === 'number'
     && typeof W.WEAPON_DEFAULTS.primary.howitzer.splashRadius === 'number'
     && typeof W.WEAPON_DEFAULTS.primary.howitzer.moveSpeedRatio === 'number',
     '#W-I：该表是曲射**模式**形状（isArc + arcSpeed + splashRadius + moveSpeedRatio），非直射武器参数');
  ok(global.RULES.weaponTypes.primary.indexOf('howitzer') === -1, 'RULES.weaponTypes.primary 不再包含 howitzer（不可安装为主武器类型）');
  ok(W.WEAPON_DEFAULTS.secondary.howitzer !== undefined
     && typeof W.WEAPON_DEFAULTS.secondary.howitzer.range === 'number',
     '#W-I：副武器槽 howitzer 只占类型位（实际参数读 primary.howitzer 单一口径）');

  const mortar = W.WEAPON_DEFAULTS.secondary.mortar;
  ok(mortar && mortar.isArc === true, '迫击炮副武器配置包含 isArc 属性');
  ok(mortar.aoe >= 80, '迫击炮具备范围杀伤 (aoe)');
  console.log('✓ 曲射武器规则配置测试通过（主武器曲射已移除，副武器迫击炮承担）');
}

// 3. 行为测试：曲射弹药（mortar 载荷 ignoreCover:true）越过全高掩体命中其后方目标（ignoreCover 真实管线）
{
  const shooter = M.makeTank({ id:'s1', team:'player', x:0, y:0, hullAngle:0, turretAngle:0 });
  const target = M.makeTank({ id:'t1', team:'enemy', x:400, y:0, hullAngle:0, turretAngle:0 });
  const initialHp = target.hp;
  C.covers.length = 0;
  // 在两者正中间放置一个坚固不可逾越的全高掩体
  const cov = { x:200, y:0, w:60, h:40, angle:0, tier:'full', hp:Infinity };
  C.covers.push(cov);

  // 发射一枚普通 AP 弹（应被全高掩体阻挡）。
  // 注意：弹体出生点必须在射手车体轮廓之外（hull 前缘 ~41.5px），否则 stepShells
  // 的 raycast 会在 t=0 命中射手自身（isHostile 测试桩恒 true，不排除友军）。
  const apShells = [{
    x:45, y:0, fx:45, fy:0, dx:1, dy:0, speed:600, pen:200, dmg:80,
    ammo: global.RULES.ammoTypes.ap, ammoKey:'ap', shooter, hitPref:'auto',
    canBounce:false, bounced:false, dist:10, dead:false
  }];
  const apCtx = {
    shells: apShells, entities:[shooter, target], covers:C.covers, RULES:global.RULES, COVER_TIERS:C.COVER_TIERS,
    raycastTank:G.raycastTank, shellPartHit:G.shellPartHit, getPartZRange:G.getPartZRange, getExposure:G.getExposure,
    findCoversOnPath:C.findCoversOnPath, resolveHit:P.resolveHit,
    pushLog:()=>{}
  };
  for(let f=0; f<90; f++){ F.stepShells(1/60, apCtx); if(apShells[0].dead) break; }
  ok(apShells[0].dead && target.hp === initialHp, '普通 AP 弹被全高掩体拦截，未伤及后方目标');

  // 发射一枚曲射弹药（同 mortar 载荷：ignoreCover:true、isArc 曲射、AOE 溅射）——应越过掩体命中目标
  const mortarAmmo = { color: '#ffb454', tail: 'rgba(255,180,84,0.7)', splashRadius: 90, ignoreCover: true };
  const arcShells = [{
    x:45, y:0, fx:45, fy:0, dx:1, dy:0, speed:350, pen:60, dmg:60,
    targetX: 400, targetY: 0, totalDist: 355,
    ammo: mortarAmmo, ammoKey:'mortar', shooter, hitPref:'auto',
    isArc: true, splashRadius: 90,
    canBounce:false, bounced:false, dist:10, dead:false
  }];
  const arcCtx = {
    shells: arcShells, entities:[shooter, target], covers:C.covers, RULES:global.RULES, COVER_TIERS:C.COVER_TIERS,
    raycastTank:G.raycastTank, shellPartHit:G.shellPartHit, getPartZRange:G.getPartZRange, getExposure:G.getExposure,
    findCoversOnPath:C.findCoversOnPath, resolveHit:P.resolveHit, applySplashAt:P.applySplashAt,
    pushLog:()=>{}
  };
  for(let f=0; f<90; f++){ F.stepShells(1/60, arcCtx); if(arcShells[0].dead) break; }
  ok(arcShells[0].dead && target.hp < initialHp, '曲射弹药（ignoreCover）成功越过全高掩体并对后方目标造成伤害');
  C.covers.length = 0;
}

// 4. 行为测试：2σ 散布截断与重分布（保证 100% 弹着点在 [-2σ, 2σ] 夹角内）
{
  const sigma = 0.05;
  let outOfBounds = 0;
  const SAMPLES = 2000;
  for(let i=0; i<SAMPLES; i++){
    const val = U.gaussian(sigma);
    if(Math.abs(val) > 2 * sigma + 1e-9) outOfBounds++;
  }
  ok(outOfBounds === 0, `高斯散布在 ${SAMPLES} 次采样中 100% 落在 2σ 边界内 (outOfBounds=${outOfBounds})`);
}

// 5. 阶段六 6.2：副炮塔（secondary turret）自主开火循环
{
  const turret = M.makeTank({ team: 'enemy', x: 100, y: 100, hullAngle: 0, turretAngle: 0 });
  turret.weapons = {
    primary: { type: 'standard', stats: {} },
    secondary: { type: 'turret', stats: W.getWeaponDefaults('secondary', 'turret') }
  };
  turret.stats = Object.assign({}, turret.stats, {
    reload: 3, damage: 100, penetration: 120, shellSpeed: 600, sigma: 0.02
  });
  const target = M.makeTank({ team: 'player', x: 300, y: 100, hp: 1000 });
  const turretShells = [];
  const tctx = {
    shells: turretShells, nearestEnemyTo: (t) => target,
    gunRoot: G.gunRoot, gunTip: G.gunTip,
    gaussian: U.gaussian, spawnMuzzleFlash: () => {}, playSound: () => {},
    findCoversOnPath: C.findCoversOnPath, COVER_TIERS: C.COVER_TIERS,
    debuffReloadRate: M.debuffReloadRate, computeAmmoConfig: null,
    RULES: global.RULES
  };
  // 初始无弹；装填计时器递减至 0 前不放
  turret.secondaryReloadT = 0;
  ok(W.updateSecondaryTurret(turret, 1/60, tctx) === true, '副炮塔对范围内敌人自主开火（入弹）');
  ok(turretShells.length === 1, '副炮塔开火产生 1 发炮弹入 shells');
  const sh = turretShells[0];
  ok(Math.abs(sh.pen - 120 * 0.75) < 0.01, `副炮塔穿深 = 主炮×0.75（${sh.pen} ≈ 90）`);
  // 2026-10-20 task-7 改写：原断言 `sh.dmg ≈ 100×0.6 = 60` 口径已过期。
  //   #4（2026-10-19 用户裁定）：「副炮塔固定使用 ap 弹、**伤害为基础参数的 1/2**、其他参数与
  //   主炮**基础**参数绑定、不受其他技能影响」⇒ js/tank_weapons.js:293-304 现行实现为
  //     dmg = t.base.damage × damageFromBaseRatio(0.5)，**不再**乘 damageMult(0.6)/ammo.dmg。
  //   且 ignoreModifiers=true ⇒ 读 `t.base` 而非 `t.stats`：本测试把 stats.damage 设成 100，
  //   但出厂 base.damage = 34 ⇒ 现行正确期望 = 34 × 0.5 = 17（实测 17，吻合）。
  //   同时把「读 base 而非 stats」这条 #4 语义显式锁进断言（否则将来改回 stats 也不会被察觉）。
  ok(Math.abs(sh.dmg - turret.base.damage * 0.5) < 0.01,
     `#4（2026-10-19）：副炮塔伤害 = 基础伤害×1/2（${sh.dmg} ≈ ${turret.base.damage}×0.5=17）`);
  ok(Math.abs(sh.dmg - turret.stats.damage * 0.6) > 1,
     '#4：副炮塔伤害不读 t.stats（stats.damage=100 也不影响，ignoreModifiers=true）');
  // 2026-10-20 task-7 改写：原断言 `secondaryReloadT > 3`（「主炮装填×1.6 ≈4.8s」）口径已过期。
  //   装填同受 #4 约束读 `t.base.reload`（出厂 1.3）而非 stats.reload（测试设的 3）
  //   ⇒ 现行正确期望 = base.reload × reloadMult(1.6) = 1.3 × 1.6 = 2.08s（实测 2.08）。
  ok(Math.abs(turret.secondaryReloadT - turret.base.reload * 1.6) < 0.01,
     `#4（2026-10-19）：副炮塔装填 = 基础装填×1.6（${turret.secondaryReloadT.toFixed(2)}s ≈ ${turret.base.reload}×1.6=2.08s）`);
  ok(turret.reloadT === undefined || turret.reloadT === 0, '副炮塔开火不占用主炮 reloadT（解耦）');
  const want = Math.atan2(100 - 100, 300 - 100);   // target 在正右方 → 0
  ok(Math.abs(turret.secondaryTurretAngle - want) < 1e-6, `副炮塔炮塔角独立转向目标方向（θ≈0，实际 ${turret.secondaryTurretAngle.toFixed(3)}）`);
  // 冷却中不再开火
  const before = turretShells.length;
  ok(W.updateSecondaryTurret(turret, 1/60, tctx) === false, '装填冷却中副炮塔不开火');
  ok(turretShells.length === before, '冷却中不产生新弹');

  // 5a2. #U42（2026-10-19 用户反馈「副炮塔似乎没有效果」）：弹道起点必须来自副炮塔本身。
  //   旧实现直接复用主炮 gunRoot/gunTip ⇒ 弹与炮口特效都从主炮口飞出，与主炮无法区分。
  {
    const t2 = M.makeTank({ team: 'player', x: 100, y: 100, hullAngle: 0, turretAngle: 0 });
    t2.weapons = { primary: { type: 'standard', stats: {} }, secondary: { type: 'turret', stats: W.getWeaponDefaults('secondary', 'turret') } };
    t2.secondaryReloadT = 0;
    const shells2 = [];
    const ctx2 = Object.assign({}, tctx, { shells: shells2 });
    ok(W.updateSecondaryTurret(t2, 1/60, ctx2) === true, '#U42 副炮塔开火');
    const s2 = shells2[0];
    const mainTip = G.gunTip(t2);
    ok(!!s2, '#U42 产生炮弹');
    ok(s2 && Math.hypot(s2.x - mainTip.x, s2.y - mainTip.y) > 5,
      `#U42 弹道起点不在主炮口（距主炮口 ${s2 ? Math.hypot(s2.x - mainTip.x, s2.y - mainTip.y).toFixed(1) : 'n/a'}px > 5）`);
    ok(s2 && s2.fromSecondaryTurret === true, '#U42 弹体带 fromSecondaryTurret 标记（绘制层据此缩小）');
  }

  // 5b. PLAN §8.1.2 玩家侧副炮塔挂载 UI：绘制层纯位姿 secondaryTurretPose + drawSecondaryTurret
  {
    // (a) 非 turret 型 → 无副炮塔位姿（不绘制）
    const std = M.makeTank({ team: 'player', x: 0, y: 0, hullAngle: 0 });
    std.weapons = { primary: { type: 'standard', stats: {} }, secondary: { type: 'mortar', stats: {} } };
    ok(B.secondaryTurretPose(std) === null, '§8.1.2 非 turret 副武器 → secondaryTurretPose 返回 null（不绘制副炮塔）');

    // (b) turret 型 → 位姿叠在主炮塔上方（#U42 新口径），炮塔角跟随独立 secondaryTurretAngle
    const pt = M.makeTank({ team: 'player', x: 100, y: 100, hullAngle: 0, turretAngle: 0 });
    pt.weapons = { primary: { type: 'standard', stats: {} }, secondary: { type: 'turret', stats: W.getWeaponDefaults('secondary', 'turret') } };
    pt.secondaryTurretAngle = Math.PI / 2;
    const pose = B.secondaryTurretPose(pt);
    ok(!!pose, '§8.1.2 turret 型 → secondaryTurretPose 返回位姿');
    // #U42（2026-10-19 用户裁定「用 1 个缩小版的自身炮塔叠在当前炮塔上方」）：
    //   旧口径是「车体尾后 hullLen×0.28 的小圆盘」，与主炮塔无视觉关联 ⇒ 玩家判定「副炮塔没效果」。
    //   现行锚点 = 主炮塔座圈（turretPivot）附近，**不再是车尾**。
    const piv = G.turretPivot(pt);
    ok(Math.abs(pose.x - piv.x) < 1e-6 + Math.abs(pt.turLen * pose.scale * 0.45), '§8.1.2 副炮塔锚定在主炮塔座圈（非车尾）');
    // 2026-10-20 task-7 改写：原断言 `pose.x > pt.x`（「副炮塔沿主炮塔朝向前移」）**口径已过期**。
    //   沿革：#U42（2026-10-19）定为「座圈中心沿朝向前移一点」→ 同日 #W2 用户反馈
    //   「位置在主炮塔**后半部分**」⇒ git 8920013（#4 副炮塔改造）把锚点改为复用
    //   `cupolaAnchor()`（js/tank_paint.js:1468-1487，车长塔绘制公式的纯函数抽取），
    //   现行 ccx = cxm − L×0.08 即炮塔包围盒中心**后方** 8%，纵向 cym − W×0.44。
    //   ⇒ 断言改为：锚点落在主炮塔范围内、且**不是**已废弃的车尾口径（t.x − hullLen×0.28）。
    ok(pose.x < piv.x,
       '§8.1.2 副炮塔锚点 = 主炮塔后半部分（#W2 2026-10-19 用户反馈；cupolaAnchor ccx = cxm−L×0.08）');
    // 反证：必须显著远离「车尾」旧口径，且与座圈中心的偏移小于一个炮塔半径（读作「叠在主炮塔上」）
    const oldTailX = pt.x - (pt.hullLen || 120) * 0.28;
    ok(Math.abs(pose.x - oldTailX) > 1,
       `§8.1.2 副炮塔不在车尾（pose.x=${pose.x.toFixed(1)} vs 旧车尾口径 ${oldTailX.toFixed(1)}）`);
    ok(Math.abs(pose.x - piv.x) < Math.max(20, (pt.turLen || 38) * 0.5),
       `§8.1.2 副炮塔与座圈中心偏移在炮塔半径内（|${pose.x.toFixed(1)}−${piv.x}|=${Math.abs(pose.x - piv.x).toFixed(2)}）`);
    ok(Math.abs(pose.angle - Math.PI / 2) < 1e-9, '§8.1.2 副炮塔炮管角读取独立 secondaryTurretAngle（与主炮解耦）');
    ok(Math.abs(pose.scale - 0.62) < 1e-9, '§8.1.2 副炮塔缩放 = 主炮塔的 0.62（缩小版自身炮塔）');
    ok(pose.barrelLen > 0 && pose.barrelLen < (pt.turLen || 34) * 1.2, '§8.1.2 副炮塔炮管按缩放缩短（不超过主炮塔量级）');

    // (c) drawSecondaryTurret 以最小 ctx stub 驱动不抛错并消耗位姿
    const calls = [];
    const fake = new Proxy({}, {
      get: (o, k) => {
        if (k === 'save' || k === 'restore' || k === 'beginPath' || k === 'arc' || k === 'fill' ||
            k === 'stroke' || k === 'moveTo' || k === 'lineTo' || k === 'translate' || k === 'rotate' ||
            k === 'closePath') {
          return (...a) => { calls.push(k); };
        }
        return undefined;
      },
      set: () => true
    });
    const drew = B.drawSecondaryTurret(fake, pt);
    ok(drew === true && calls.length > 0, '§8.1.2 drawSecondaryTurret 绘制副炮塔（含 translate/rotate/arc）');
    // 殉爆后不绘制
    pt.ammoBlew = true;
    ok(B.drawSecondaryTurret(fake, pt) === false, '§8.1.2 弹药架殉爆（ammoBlew）后不绘制副炮塔');
    pt.ammoBlew = false;
  }
}

// 6. 阶段七 7.2：多类型副武器（mortar, missile, rocket, mine_layer）运行时与 updateSecondaryWeapon
{
  const shooter = M.makeTank({ team: 'player', x: 100, y: 100, hullAngle: 0, turretAngle: 0 });
  const enemy = M.makeTank({ team: 'enemy', x: 300, y: 100, hp: 500 });
  const shells = [];
  const deployables = [];
  const ctx = {
    shells: shells,
    nearestEnemyTo: () => enemy,
    entities: [shooter, enemy],
    isHostile: (a, b) => a !== b,
    gunRoot: G.gunRoot,
    gunTip: G.gunTip,
    gaussian: () => 0,
    spawnMuzzleFlash: () => {},
    playSound: () => {},
    debuffReloadRate: () => 1,
    spawnMine: (opts) => { deployables.push(opts); return opts; },
    RULES: global.RULES
  };

  // 迫击炮
  shooter.weapons = { secondary: { type: 'mortar', stats: { range: 450, aoe: 90, reload: 8, damage: 60 } } };
  shooter.secondaryReloadT = 0;
  ok(W.updateSecondaryWeapon(shooter, 1/60, ctx) === true, '迫击炮开火成功');
  ok(shells.length === 1 && shells[0].isArc === true && shells[0].splashRadius === 90, '迫击炮弹生成且为曲射AOE');
  ok(shooter.secondaryReloadT === 8, '迫击炮装填重置为8s');

  // 导弹（2026-09-15 W2 锁定机制：±30° 扇形选最近目标 → 1s 锁定 → 自动发射；
  // 伤害机制跟随玩家 HEAT 升级链，未升级时按 HE，HE dmg 1.5 → 140×1.5=210）
  shells.length = 0;
  shooter.weapons = { secondary: { type: 'missile', stats: { reload: 12, damage: 140 } } };
  shooter.secondaryReloadT = 0;
  shooter._missileLock = null;
  shooter.turretAngle = 0;
  ok(W.updateSecondaryWeapon(shooter, 1/60, ctx) === false, '导弹首调仅开始锁定（不发射）');
  ok(shooter._missileLock && shooter._missileLock.target === enemy, '锁定目标 = 扇形内最近敌人');
  ok(W.updateSecondaryWeapon(shooter, 1.0, ctx) === true, '锁定 1s 后自动发射');
  ok(shells.length === 1 && shells[0].guided === true && shells[0].mode === 'lock', '导弹生成且为制导锁定弹');
  ok(shooter._missileLock === null, '发射后锁定状态清空');
  ok(shells[0].ammoKey === 'he' && shells[0].dmg === Math.round(140 * 1.5), '导弹伤害按 HE 弹种机制（140×dmg1.5=210）');

  // 锁定扇形外不锁定（敌人在正东、炮塔朝南 → 出 ±30° 扇形）
  shooter.secondaryReloadT = 0;
  shooter._missileLock = null;
  shooter.turretAngle = Math.PI / 2;
  ok(W.updateSecondaryWeapon(shooter, 1/60, ctx) === false && shooter._missileLock === null, '扇形外目标不锁定');
  shooter.turretAngle = 0;

  // 火箭巢（同跟随 HE 弹种：35×1.5≈53/发；#D4 逐发 burst：首发 1 发 + 队列 3）
  shells.length = 0;
  shooter.weapons = { secondary: { type: 'rocket', stats: { count: 4, reload: 10, damage: 35 } } };
  shooter.secondaryReloadT = 0;
  ok(W.updateSecondaryWeapon(shooter, 1/60, ctx) === true, '火箭巢开火成功（#D4 首发逐发）');
  ok(shells.length === 1 && !!shooter._rocketBurst && shooter._rocketBurst.left === 3
    && shells[0].ammoKey === 'he' && shells[0].dmg === Math.round(35 * 1.5),
    '#D4 火箭巢首发 1 发 + burst 队列 3（伤害按 HE 机制）');
  for (let i = 0; i < 3; i++) W.updateRocketBurst(shooter, 1, ctx);
  ok(shells.length === 4 && !shooter._rocketBurst, '#D4 逐发驱动补完 4 发（队列清空）');

  // 布雷器
  shooter.weapons = { secondary: { type: 'mine_layer', stats: { reload: 15, damage: 100 } } };
  shooter.secondaryReloadT = 0;
  ok(W.updateSecondaryWeapon(shooter, 1/60, ctx) === true, '布雷器布雷成功');
  ok(deployables.length === 1 && deployables[0].damage === 100, '地雷成功部署入注册表');

  // 7. 手动主动击发（#A21 起由左键/空格按激活槽位分发：secondary→fireActiveSecondary 目标=鼠标世界点）
  //    与双副武器槽位支持（secondarySlots 双槽构造属 #A22 范围，此处仅保留既有构造与断言）
  shells.length = 0;
  shooter.weapons = {
    secondarySlots: [
      { type: 'mortar', stats: { reload: 8, damage: 60, aoe: 90 } },
      { type: 'missile', stats: { reload: 12, damage: 140 } }
    ],
    activeSecondaryIndex: 0,
    secondary: { type: 'mortar', stats: { reload: 8, damage: 60, aoe: 90 } }
  };
  shooter.secondaryReloadT = 0;
  ok(typeof W.fireActiveSecondary === 'function', 'fireActiveSecondary 函数导出存在');
  ok(W.fireActiveSecondary(shooter, ctx, { x: 300, y: 100 }) === true, '手动主动击发迫击炮成功（#A21 左键/空格分发路径）');
  ok(shells.length === 1 && shells[0].isArc === true, '手动击发产生曲射炮弹');

  // 切换副武器至槽位 1（锁定式导弹）
  shooter.weapons.activeSecondaryIndex = 1;
  shooter.weapons.secondary = shooter.weapons.secondarySlots[1];
  shooter.secondaryReloadT = 0;
  shooter._missileInFlight = null;   // 2026-10-23：导弹单发在飞标记（弹体结束才可再发）
  shells.length = 0;
  ok(W.fireActiveSecondary(shooter, ctx, enemy) === true, '手动主动击发导弹成功（实敌 → 仍锁定追尾，target=敌）');
  ok(shells.length === 1 && shells[0].guided === true && shells[0].mode === 'lock', '手动击发导弹产生锁定式制导弹体');

  // 8. 线导式导弹与曲射越顶越过中间坦克测试
  shells.length = 0;
  shooter.weapons.secondary = { type: 'missile_wire', stats: { reload: 10, damage: 150 } };
  shooter.secondaryReloadT = 0;
  shooter._missileInFlight = null;   // 2026-10-23：清在飞标记
  ok(W.fireActiveSecondary(shooter, ctx, { x: 400, y: 200 }) === true, '手动击发线导反坦克导弹成功');
  ok(shells.length === 1 && shells[0].guided === true && shells[0].mode === 'wire', '线导导弹生成且 mode=wire');

  // 9. 行为测试：迫击炮曲射弹体在飞行途中越过中间坦克（不引爆），仅在落点爆炸
  {
    const s = M.makeTank({ id: 's2', team: 'player', x: 0, y: 0, hullAngle: 0, turretAngle: 0 });
    const midTank = M.makeTank({ id: 'mid1', team: 'enemy', x: 200, y: 0, hp: 500 });
    const farTarget = M.makeTank({ id: 'far1', team: 'enemy', x: 400, y: 0, hp: 500 });
    const midHpBefore = midTank.hp;
    const farHpBefore = farTarget.hp;
    const mortarShells = [];
    const mCtx = {
      shells: mortarShells, entities: [s, midTank, farTarget], covers: [], RULES: global.RULES, COVER_TIERS: C.COVER_TIERS,
      raycastTank: G.raycastTank, shellPartHit: G.shellPartHit, getPartZRange: G.getPartZRange, getExposure: G.getExposure,
      findCoversOnPath: C.findCoversOnPath, resolveHit: P.resolveHit, applySplashAt: P.applySplashAt,
      pushLog: () => {}, playSound: () => {}, spawnImpactFx: () => {}, burstExplosion: () => {}, spawnDmgText: () => {}
    };
    s.weapons = { secondary: { type: 'mortar', stats: { range: 450, aoe: 90, reload: 8, damage: 60 } } };
    s.secondaryReloadT = 0;
    W.fireActiveSecondary(s, mCtx, { x: 400, y: 0 });
    ok(mortarShells.length === 1 && mortarShells[0].isArc === true, '迫击炮发射曲射弹');
    // 飞行 30 帧（已越过 midTank 所在的 x=200 区域）
    for (let f = 0; f < 30; f++) { F.stepShells(1/60, mCtx); if (mortarShells[0].dead) break; }
    // 2026-10-20 task-7 判定：这两条是**代码真缺陷**（非断言过期），断言保持原样、**不放宽**。
    //   缺陷根因（已用 A/B 对照实测取证，见 ISSUES 候选）：
    //   `js/tank_fire.js` 的 `stepShells` 中，`if(s.isArc){ ... }` 块内的 `return` 只位于
    //   `if(s.dist >= s.totalDist){ ... return; }` 这个**内层**分支里（:1006）；`isArc` 块本身
    //   （:932~:1008）**没有兜底 return**。于是曲射弹在**尚未抵达落点的每一帧**都会掉进下方
    //   直射扫掠命中段（:1009 起），对沿途坦克做 raycast 并把命中结算（:1149 置 s.dead）。
    //   实测对照（同 seed、同参数）：
    //     · 有中间坦克：弹体在 dist=204.2 / totalDist=335.1 处即 dead，中间坦克掉血、远端目标 0 伤害；
    //     · 无中间坦克：弹体正常飞到 dist=344.2 才落点爆炸，远端目标正常掉血。
    //   ⇒ 违反「曲射弹越障、仅在落点爆炸」的核心玩法语义（docs/specs/combat.md 曲射口径）。
    //   修法方向（**未改**，待 Lead 决定立项并派 role-combat）：在 `isArc` 块末尾加
    //   `return;`（落点未到也直接结束本帧处理），或在 `if(s.isArc){` 之后立即短路直射段。
    ok(!mortarShells[0].dead && midTank.hp === midHpBefore, '曲射弹飞行中越过中间坦克未提前爆炸');
    // 继续飞行直到飞抵远端目标落点
    for (let f = 0; f < 60; f++) { F.stepShells(1/60, mCtx); if (mortarShells[0].dead) break; }
    ok(mortarShells[0].dead && farTarget.hp < farHpBefore, '曲射弹抵达目标落点并造成范围爆炸伤害');
    // 10. 迫击炮固定 HESH 机制 与 导弹/火箭随玩家 HEAT 升级链动态演化
    // (a) 迫击炮固定 hesh
    shells.length = 0;
    shooter.weapons.secondary = { type: 'mortar', stats: { reload: 8, damage: 60, aoe: 90 } };
    shooter.secondaryReloadT = 0;
    W.fireActiveSecondary(shooter, ctx, { x: 300, y: 100 });
    ok(shells.length === 1 && shells[0].ammoKey === 'hesh', '迫击炮弹种固定为 hesh 计算机制');

    // (b) 未升级 HEAT 时（ammoLoadout = ['ap', 'he']），导弹与火箭按 HE 机制
    shooter.ammoLoadout = ['ap', 'he'];
    shells.length = 0;
    shooter.weapons.secondary = { type: 'missile', stats: { reload: 12, damage: 140 } };
    shooter.secondaryReloadT = 0;
    shooter._missileInFlight = null;   // 2026-10-23：导弹单发在飞标记
    W.fireActiveSecondary(shooter, ctx, enemy);
    ok(shells.length === 1 && shells[0].ammoKey === 'he', '未升级 HEAT 时导弹按主武器 HE 计算');

    shells.length = 0;
    shooter.weapons.secondary = { type: 'rocket', stats: { count: 4, reload: 10, damage: 35 } };
    shooter.secondaryReloadT = 0;
    W.fireActiveSecondary(shooter, ctx, enemy);
    for (let i = 0; i < 3; i++) W.updateRocketBurst(shooter, 1, ctx);
    ok(shells.length === 4 && shells[0].ammoKey === 'he', '未升级 HEAT 时火箭按主武器 HE 计算（#D4 逐发补完）');

    // (c) 升级到 tandem_heat (T-HEAT) 后，导弹与火箭按 tandem_heat 机制
    shooter.ammoLoadout = ['ap', 'tandem_heat'];
    shells.length = 0;
    shooter.weapons.secondary = { type: 'missile', stats: { reload: 12, damage: 140 } };
    shooter.secondaryReloadT = 0;
    shooter._missileInFlight = null;   // 2026-10-23：导弹单发在飞标记
    W.fireActiveSecondary(shooter, ctx, enemy);
    ok(shells.length === 1 && shells[0].ammoKey === 'tandem_heat' && shells[0].pen > 300, '升级到 T-HEAT 时导弹按 tandem_heat 计算穿深与机制');

    shells.length = 0;
    shooter.weapons.secondary = { type: 'rocket', stats: { count: 4, reload: 10, damage: 35 } };
    shooter.secondaryReloadT = 0;
    W.fireActiveSecondary(shooter, ctx, enemy);
    for (let i = 0; i < 3; i++) W.updateRocketBurst(shooter, 1, ctx);
    ok(shells.length === 4 && shells[0].ammoKey === 'tandem_heat', '升级到 T-HEAT 时火箭按 tandem_heat 计算（#D4 逐发补完）');
  }
}

ok(fails === 0, '所有 R-3 测试项均断言通过');
console.log('test-rework-r3: 完成所有检查');
// 2026-10-20 task-7：原为 `console.log('test-rework-r3: 全部通过')` 无条件打印且**从不设置
// 退出码** ⇒ 本文件曾长期有真实断言红（7 项）却 EXIT=0，`scripts/run-tests.js` 按
// `r.status === 0` 判定，把这些红一律记为通过（假绿）。现改为按 fails 给退出码 + 有条件日志，
// 与 test-render.js / test-physics.js 的既有写法一致。
console.log(fails === 0 ? 'test-rework-r3: 全部通过' : `test-rework-r3: ${fails} 项失败`);
process.exitCode = fails === 0 ? 0 : 1;
