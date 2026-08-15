// test-camera.js — 摄像机跟随 + 视口剔除测试（Node 端，Pure Logic）
// 运行：node scripts/test-camera.js
'use strict';

const {
  createCamera,
  updateCamera,
  clampCamera,
  worldToScreen,
  screenToWorld,
  viewBounds,
  aabbInView
} = require('../js/tank_camera.js');

let fails = 0;
function ok(cond, label) {
  if (cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}`); fails++; }
}
function close(a, b, eps) { return Math.abs(a - b) <= (eps || 1e-9); }

// 1) createCamera 默认值 / 边界
const cam = createCamera({ vw: 800, vh: 600, bounds: { w: 2400, h: 1200 } });
ok(close(cam.vw, 800) && close(cam.vh, 600), '视口尺寸生效');
ok(close(cam.x, 1200) && close(cam.y, 600), '初始中心 = 世界中心');
ok(close(cam.zoom, 1), '默认缩放 1');

// 2) worldToScreen / screenToWorld 互逆
const w = { x: 1200, y: 600 };
const s = worldToScreen(cam, w.x, w.y);
ok(close(s.x, 400) && close(s.y, 300), '世界中心 → 屏幕中心');
const back = screenToWorld(cam, s.x, s.y);
ok(close(back.x, w.x) && close(back.y, w.y), '屏幕→世界 互逆');
const s2 = worldToScreen(cam, 1400, 700);
ok(close(s2.x, 600) && close(s2.y, 400), '世界偏移 → 屏幕偏移（+200,+100）');
const w2 = screenToWorld(cam, 200, 100);
ok(close(w2.x, 1000) && close(w2.y, 400), '屏幕→世界 偏移互逆');

// 3) 缩放参与换算
const camZ = createCamera({ vw: 800, vh: 600, zoom: 2, bounds: { w: 2400, h: 1200 } });
const sz = worldToScreen(camZ, 1300, 650);
ok(close(sz.x, 600) && close(sz.y, 400), 'zoom=2：世界偏移 100px → 屏幕 200px');
const wz = screenToWorld(camZ, 200, 100);
ok(close(wz.x, 1100) && close(wz.y, 500), 'zoom=2 屏幕→世界 逆换算');

// 4) clampCamera：视口小于世界 → 中心被钳在边缘内；视口大于世界 → 居中
const camSmall = createCamera({ vw: 800, vh: 600, bounds: { w: 2400, h: 1200 } });
camSmall.x = 0; camSmall.y = 0; clampCamera(camSmall);
ok(close(camSmall.x, 400) && close(camSmall.y, 300), '钳制：中心不低于 (vw/2, vh/2)');
camSmall.x = 99999; camSmall.y = 99999; clampCamera(camSmall);
ok(close(camSmall.x, 2400 - 400) && close(camSmall.y, 1200 - 300), '钳制：中心不高于 (w-vw/2, h-vh/2)');

const camBig = createCamera({ vw: 3000, vh: 2000, bounds: { w: 2400, h: 1200 } });
camBig.x = 100; camBig.y = 100; clampCamera(camBig);
ok(close(camBig.x, 1200) && close(camBig.y, 600), '视口大于世界 → 强制居中');

// 5) updateCamera：指数阻尼逼近目标
const camF = createCamera({ vw: 800, vh: 600, bounds: { w: 2400, h: 1200 } });
const target = { x: 500, y: 400 };
updateCamera(camF, target, 0.1);
ok(camF.x > 500 && camF.y > 400, '跟随：中心向目标方向移动（1200→500）');
const d0 = Math.hypot(camF.x - 500, camF.y - 400);
for (let i = 0; i < 200; i++) updateCamera(camF, target, 0.1);
const d1 = Math.hypot(camF.x - 500, camF.y - 400);
ok(d1 < d0 && d1 < 0.5, '跟随：多帧后收敛到目标');

// 6) viewBounds
const vb = viewBounds(camF);
ok(close(vb.minX, camF.x - 400) && close(vb.maxX, camF.x + 400), 'viewBounds x 正确');
ok(close(vb.minY, camF.y - 300) && close(vb.maxY, camF.y + 300), 'viewBounds y 正确');

// 7) aabbInView：内/外/边界/外扩余量/zoom
const cv = createCamera({ vw: 800, vh: 600, bounds: { w: 2400, h: 1200 } });
ok(aabbInView(cv, 1200, 600, 0, 0), '中心物体在视口内');
ok(!aabbInView(cv, 3000, 600, 0, 0), '视口外物体剔除');
ok(!aabbInView(cv, -100, 600, 0, 0), '视口左侧外剔除');
ok(aabbInView(cv, 1200, 600, 800, 600, 0), '大物体跨视口边界保留');
ok(!aabbInView(cv, 700, 600, 0, 0, 0), '边界外 100px、无余量 → 剔除');
ok(aabbInView(cv, 700, 600, 0, 0, 256), '边界外 100px、余量 256 → 保留');
// 视口 AABB 应在边界处精确：x=800 中心恰在边缘（minX=800）→ 相交（≥）
ok(aabbInView(cv, 800, 600, 0, 0, 0), '恰在视口左边缘 → 相交保留');

console.log('test-camera: 完成所有检查');
if (fails === 0) console.log('test-camera: 全部通过');
else console.error(`test-camera: ${fails} 项失败`);
process.exit(fails === 0 ? 0 : 1);
