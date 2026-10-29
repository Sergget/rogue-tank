// test-render3d.js — R1（2026-10-27）3D 渲染/场景纯逻辑回归。
// 覆盖：相机矩阵与屏幕射线拾取（地面求交）/ 三角形批构建（盒/挤出/圆锥）/
//   tier 视觉参数 / 掩体多边形（矩形/verts/多段）/ 静态场景与坦克几何 / 动态 FX。
// 运行：node scripts/test-render3d.js
'use strict';

const U = require('../js/tank_utils.js');
const R = require('../js/tank_rules.js');
global.TAU = U.TAU;
global.RULES = R.RULES;
const R3D = require('../js/tank_render3d.js');
const S3D = require('../js/tank_scene3d.js');
global.createMeshBuilder = R3D.createMeshBuilder;

let fails = 0;
function ok(cond, label){
  if(cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}`); fails++; }
}

// ① 相机：eye 在目标上方，矩阵为 16 元素
{
  const cam = R3D.createOrbitCamera({ pitch: 0.95, distance: 1000, fovY: 0.85 });
  R3D.updateOrbitCamera(cam, { x: 500, z: 300 }, 16 / 9);
  ok(cam.eye.y > 500 && Math.abs(cam.eye.x - 500) < 1e-6, `相机在目标上方（eye.y=${cam.eye.y.toFixed(1)}）`);
  ok(cam.vp.length === 16 && cam.view.length === 16 && cam.proj.length === 16, '矩阵维度 4×4');
}

// ② 屏幕中心 → 目标点
{
  const cam = R3D.createOrbitCamera({ pitch: 0.95, distance: 1000 });
  R3D.updateOrbitCamera(cam, { x: 800, z: 600 }, 1280 / 720);
  const hit = R3D.rayGroundHit(cam, 640, 360, 1280, 720);
  ok(hit && Math.abs(hit.x - 800) < 1 && Math.abs(hit.y - 600) < 1,
     `屏幕中心拾取到相机目标（${hit ? hit.x.toFixed(1) + ',' + hit.y.toFixed(1) : 'null'}）`);
}

// ③ 屏幕下方比上方更靠近相机（俯视时 y 越大越近）
{
  const cam = R3D.createOrbitCamera({ pitch: 0.95, distance: 1000 });
  R3D.updateOrbitCamera(cam, { x: 0, z: 0 }, 1280 / 720);
  const top = R3D.rayGroundHit(cam, 640, 100, 1280, 720);
  const bottom = R3D.rayGroundHit(cam, 640, 620, 1280, 720);
  ok(top && bottom && bottom.y > top.y, `屏幕下方对应更近的世界 y（top=${top && top.y.toFixed(0)} bottom=${bottom && bottom.y.toFixed(0)}）`);
}

// ④ 射线方向已归一化
{
  const cam = R3D.createOrbitCamera({ pitch: 0.95, distance: 1000 });
  R3D.updateOrbitCamera(cam, { x: 0, z: 0 }, 1.5);
  const r = R3D.screenRay(cam, 1000, 200, 1280, 720);
  ok(Math.abs(Math.hypot(r.dx, r.dy, r.dz) - 1) < 1e-6, '射线方向单位化');
}

// ⑤ 批构建顶点数
{
  const b = R3D.createMeshBuilder();
  b.box(0, 0, 0, 10, 10, 10, [1, 0, 0, 1]);
  ok(b.data.length === 36 * 10, `盒体 36 顶点（${b.data.length / 10}）`);
  const b2 = R3D.createMeshBuilder();
  b2.ground(0, 0, 100, 100, 0, [0, 1, 0, 1]);
  ok(b2.data.length === 6 * 10, '地面四边形 6 顶点');
  const b3 = R3D.createMeshBuilder();
  b3.extrude([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }], 0, 20, [1, 1, 1, 1]);
  ok(b3.data.length === 24 * 10, `三角形挤出 24 顶点（${b3.data.length / 10}）`);
  const b4 = R3D.createMeshBuilder();
  b4.cone(0, 0, 0, 10, 30, 8, [0, 1, 0, 1]);
  ok(b4.data.length === 48 * 10, `圆锥 8 段 48 顶点（${b4.data.length / 10}）`);
}

// ⑥ tier 视觉覆盖全部 RULES.coverTiers
{
  const missing = Object.keys(R.RULES.coverTiers).filter(t => !S3D.TIER_VIS[t]);
  ok(missing.length === 0, `所有 tier 都有 3D 视觉参数（缺：${missing.join(',') || '无'}）`);
  ok(S3D.tierVisual('__nope').h === S3D.TIER_VIS.default.h, '未知 tier 回落 default');
}

// ⑦ 掩体多边形：矩形 / 旋转 / verts 多段
{
  const rect = S3D.coverPolygons({ x: 100, y: 100, w: 40, h: 20, angle: 0 });
  ok(rect.length === 1 && rect[0].length === 4, '矩形 1 个四边形');
  ok(rect[0].some(p => Math.abs(p.x - 120) < 1e-9) && rect[0].some(p => Math.abs(p.y - 110) < 1e-9), '矩形世界角点正确');
  const rot = S3D.coverPolygons({ x: 0, y: 0, w: 20, h: 10, angle: Math.PI / 2 });
  ok(rot[0].some(p => Math.abs(p.x - 5) < 1e-9 && Math.abs(p.y - 10) < 1e-9), '绕 Y 旋转 90° 后角点正确');
  const multi = S3D.coverPolygons({ x: 0, y: 0, angle: 0, verts: [[[0, 0], [10, 0], [0, 10]], [[20, 20], [30, 20], [20, 30]]] });
  ok(multi.length === 2 && multi[1][0].x === 20, 'verts 多段 → 两个子多边形');
}

// ⑧ 静态场景：地面 + 平地层 + 地物
{
  const node = { w: 800, h: 600, biome: 'grass' };
  const covers = [
    { tier: 'road', x: 400, y: 300, w: 800, h: 40, hp: 1 },
    { tier: 'water', x: 200, y: 200, w: 100, h: 80, hp: 1 },
    { tier: 'building', x: 500, y: 200, w: 80, h: 60, hp: 1, angle: 0 },
    { tier: 'tree', x: 100, y: 500, w: 40, h: 40, hp: 1 },
  ];
  const data = S3D.buildStaticScene({ node, covers });
  ok(data.length > 0 && data.length % 10 === 0, `静态场景顶点数据合法（${data.length / 10} 顶点）`);
  let flat = 0, solid = 0;
  for (let i = 0; i < data.length; i += 10) {
    if (data[i + 1] > 0 && data[i + 1] < 3) flat++;
    if (data[i + 1] > 20) solid++;
  }
  ok(flat > 0, `平地层贴地绘制（${flat} 顶点 y∈(0,3)）`);
  ok(solid > 0, `立体地物有高度（${solid} 顶点 y>20）`);
}

// ⑨ 坦克几何：车体 + 炮塔 + 炮管
{
  const hull = [{ x: -30, y: -15 }, { x: 30, y: -15 }, { x: 30, y: 15 }, { x: -30, y: 15 }];
  const turret = [{ x: -12, y: -10 }, { x: 12, y: -10 }, { x: 12, y: 10 }, { x: -12, y: 10 }];
  const t = { x: 0, y: 0, team: 'player', turretAngle: 0, hullLen: 60, hullWid: 30 };
  const hullOnly = S3D.buildTankMesh(t, { hullPoly: () => hull, turretPoly: null });
  const full = S3D.buildTankMesh(t, { hullPoly: () => hull, turretPoly: () => turret });
  ok(hullOnly.length > 0 && full.length > hullOnly.length, '炮塔 + 炮管增加几何');
  const allyMesh = S3D.buildTankMesh({ ...t, team: 'ally' }, { hullPoly: () => hull, turretPoly: () => turret });
  ok(allyMesh.length === full.length, '同几何不同队伍顶点数一致（只有颜色不同）');
}

// ⑨b 炮管方向：gunRoot → gunTip 的 +y 方向必须映射到世界 +z（不再镜像）
{
  const hull = [{ x: -30, y: -15 }, { x: 30, y: -15 }, { x: 30, y: 15 }, { x: -30, y: 15 }];
  const turret = [{ x: -12, y: -10 }, { x: 12, y: -10 }, { x: 12, y: 10 }, { x: -12, y: 10 }];
  const t = { x: 0, y: 0, team: 'player', hullAngle: 0, turretAngle: Math.PI / 2, hullLen: 60, hullWid: 30, barrel: { width: 18 } };
  const data = S3D.buildTankMesh(t, {
    hullPoly: () => hull,
    turretPoly: () => turret,
    gunRoot: () => ({ x: 0, y: 0 }),
    gunTip: () => ({ x: 0, y: 60 }),
  });
  let maxZ = -Infinity, maxX = -Infinity;
  for (let i = 0; i < data.length; i += 10) {
    maxZ = Math.max(maxZ, data[i + 2]);
    maxX = Math.max(maxX, data[i]);
  }
  ok(maxZ > 40, `炮管沿 gunTip 方向伸出（maxZ=${maxZ.toFixed(1)}）`);
  ok(maxX > 20, `车头前装甲/箭头在 +x（maxX=${maxX.toFixed(1)}）`);
  // 车头箭头颜色（0.98,0.88,0.30）必须存在
  let hasNose = false;
  for (let i = 0; i < data.length; i += 10) {
    if (Math.abs(data[i + 6] - 0.98) < 1e-6 && Math.abs(data[i + 7] - 0.88) < 1e-6) { hasNose = true; break; }
  }
  ok(hasNose, '车头方向箭头已绘制');
}

// ⑩ 动态 FX：炮弹与粒子
{
  const data = S3D.buildDynamicFx([{ x: 10, y: 20, z: 0 }], [{ x: 0, y: 0, z: 20, life: 0.5, maxLife: 1, size: 8 }]);
  ok(data.length === 72 * 10, `1 炮弹 + 1 粒子 = 72 顶点（${data.length / 10}）`);
  const alpha = data[36 * 10 + 9];   // 第 2 个盒体（粒子）首顶点 alpha
  ok(alpha > 0 && alpha < 1, `粒子透明度随寿命衰减（${alpha}）`);
}

// ⑪ 阵营环：玩家黄、友军淡绿、敌军红（2026-10-29 起玩家也画环）
{
  const ents = [
    { id: 'player', team: 'player', hp: 100, x: 0, y: 0, hullLen: 70, hullWid: 36 },
    { id: 'a1', team: 'ally', hp: 100, x: 100, y: 0, hullLen: 70, hullWid: 36 },
    { id: 'e1', team: 'enemy', hp: 100, x: 200, y: 0, hullLen: 70, hullWid: 36 },
    { id: 'dead', team: 'enemy', hp: 0, x: 300, y: 0, hullLen: 70, hullWid: 36 },
  ];
  const data = S3D.buildTeamRings(ents);
  ok(data.length > 0 && data.length % 10 === 0, `阵营环顶点数据合法（${data.length / 10}）`);
  // 顶点布局 [x,y,z,nx,ny,nz,r,g,b,a]：红通道 +6、绿通道 +7
  let green = 0, red = 0, yellow = 0, atPlayer = 0, atDead = 0;
  for (let i = 0; i < data.length; i += 10) {
    const x = data[i], rCh = data[i + 6], gCh = data[i + 7];
    if (Math.abs(gCh - 0.92) < 1e-6) green++;
    if (Math.abs(rCh - 1.0) < 1e-6 && Math.abs(gCh - 0.32) < 1e-6) red++;
    if (Math.abs(rCh - 1.0) < 1e-6 && Math.abs(gCh - 0.84) < 1e-6) yellow++;
    if (Math.abs(x) < 1) atPlayer++;
    if (Math.abs(x - 300) < 1) atDead++;
  }
  ok(green > 0, '友军淡绿环存在');
  ok(red > 0, '敌军红环存在');
  ok(yellow > 0 && atPlayer > 0, '玩家黄色高亮环存在（2026-10-29 新增）');
  ok(atDead === 0, '负向：死亡单位不画环');
}

// ⑫ 视觉悬挂：俯仰抬车头/车尾、侧倾抬左右、弹跳整体抬升
{
  const t = { x: 0, y: 0, hullAngle: 0 };
  const front = [20, 0, 0, 0, 1, 0, 1, 0, 1, 1];
  const rear = [-20, 0, 0, 0, 1, 0, 1, 0, 1, 1];
  S3D.applyTankTilt(front, t, 0.1, 0, 0);
  S3D.applyTankTilt(rear, t, 0.1, 0, 0);
  ok(front[1] > 0 && rear[1] < 0, `pitch 抬车头压车尾（前=${front[1].toFixed(2)} 后=${rear[1].toFixed(2)}）`);
  const left = [0, 0, -20, 0, 1, 0, 1, 0, 1, 1];
  const right = [0, 0, 20, 0, 1, 0, 1, 0, 1, 1];
  S3D.applyTankTilt(left, t, 0, 0.08, 0);
  S3D.applyTankTilt(right, t, 0, 0.08, 0);
  ok(right[1] > left[1], `roll 抬右侧（左=${left[1].toFixed(2)} 右=${right[1].toFixed(2)}）`);
  const bounce = [0, 0, 0, 0, 1, 0, 1, 0, 1, 1];
  S3D.applyTankTilt(bounce, t, 0, 0, 5);
  ok(bounce[1] === 5, 'bounce 整体抬升');
}

process.exitCode = fails ? 1 : 0;
if(fails) console.error(`\n${fails} 项失败`);
else console.log('\n全部通过');
