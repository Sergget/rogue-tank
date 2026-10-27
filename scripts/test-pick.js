// test-pick.js — R0 / I4（2026-10-27）指针拾取唯一入口回归。
// 背景：battle 与 bench 曾各自写 `screenToWorld(cam, e.clientX - r.left, ...)`；
//   真 3D 切片要求所有指针→世界换算走同一入口（将来换成地面射线求交）。
// 覆盖：① pointerToWorld 与 screenToWorld 同口径（含 rect 偏移）
//   ② 缩放/相机偏移下的已知值 ③ worldToScreen → pointerToWorld 往返
//   ④ rect 缺失/全零 ⑤ 页面负向断言：mousemove/滚轮不得再直连 screenToWorld
// 运行：node scripts/test-pick.js
'use strict';

const fs = require('fs');
const path = require('path');
const U = require('../js/tank_utils.js');
const R = require('../js/tank_rules.js');
global.TAU = U.TAU;
global.RULES = R.RULES;
const CAM = require('../js/tank_camera.js');

let fails = 0;
function ok(cond, label){
  if(cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}`); fails++; }
}

const cam = { x: 1200, y: 800, vw: 1280, vh: 720, zoom: 2 };
const rect = { left: 40, top: 90 };

// ① 同口径：pointerToWorld 就是 screenToWorld 去掉 rect 偏移
{
  const a = CAM.pointerToWorld(cam, rect, 400, 300);
  const b = CAM.screenToWorld(cam, 400 - 40, 300 - 90);
  ok(Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9,
     `pointerToWorld 与 screenToWorld 同口径（${a.x.toFixed(2)},${a.y.toFixed(2)}）`);
}

// ② 已知值：屏幕中心 → 相机中心
{
  const center = CAM.pointerToWorld(cam, { left: 0, top: 0 }, cam.vw / 2, cam.vh / 2);
  ok(Math.abs(center.x - cam.x) < 1e-9 && Math.abs(center.y - cam.y) < 1e-9,
     '屏幕中心拾取到相机中心');
  const zoomed = CAM.pointerToWorld(cam, { left: 0, top: 0 }, cam.vw / 2 + 20, cam.vh / 2);
  ok(Math.abs(zoomed.x - (cam.x + 10)) < 1e-9, 'zoom=2 时屏幕 +20px = 世界 +10px');
}

// ③ 往返：世界点 → 屏幕 → 指针（带 rect 偏移）应回到原点
{
  const world = { x: 1337.25, y: 642.75 };
  const s = CAM.worldToScreen(cam, world.x, world.y);
  const back = CAM.pointerToWorld(cam, rect, s.x + rect.left, s.y + rect.top);
  ok(Math.abs(back.x - world.x) < 1e-6 && Math.abs(back.y - world.y) < 1e-6,
     'worldToScreen → pointerToWorld 往返无损');
}

// ④ rect 缺失或全零等价于无偏移；亚像素 rect 不得被取整
{
  const p1 = CAM.pointerToWorld(cam, null, 100, 100);
  const p2 = CAM.pointerToWorld(cam, { left: 0, top: 0 }, 100, 100);
  ok(Math.abs(p1.x - p2.x) < 1e-9 && Math.abs(p1.y - p2.y) < 1e-9, 'rect 缺失按 0 偏移处理');
  const sub = CAM.pointerToWorld(cam, { left: 0.5, top: 0.25 }, 100.5, 100.25);
  ok(Math.abs(sub.x - p2.x) < 1e-9 && Math.abs(sub.y - p2.y) < 1e-9, '亚像素 rect 不取整');
}

// ⑤ 页面负向断言：拾取入口只有一个
{
  const root = path.join(__dirname, '..');
  const battle = fs.readFileSync(path.join(root, 'tank_battle.html'), 'utf8');
  const bench = fs.readFileSync(path.join(root, 'tank_bench.html'), 'utf8');
  ok(/pointerToWorld\(cam, r, e\.clientX, e\.clientY\)/.test(battle),
     'battle：鼠标与滚轮走 pointerToWorld');
  ok(/pointerToWorld\(cam, r, e\.clientX, e\.clientY\)/.test(bench),
     'bench：鼠标走 pointerToWorld');
  const rawCall = /screenToWorld\(cam,\s*e\.clientX/;
  ok(!rawCall.test(battle) && !rawCall.test(bench),
     '负向：页面不得再直连 screenToWorld 做指针换算');
}

process.exitCode = fails ? 1 : 0;
if(fails) console.error(`\n${fails} 项失败`);
else console.log('\n全部通过');
