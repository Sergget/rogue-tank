// test-camera.js — 摄像机跟随 + 视口剔除测试（Node 端，Pure Logic）
// 运行：node scripts/test-camera.js
'use strict';

const U = require('../js/tank_utils.js');
const RULES_MOD = require('../js/tank_rules.js');
global.TAU = U.TAU;
global.RULES = RULES_MOD.RULES;

const {
  createCamera,
  setZoom,
  updateCamera,
  updateCameraLead,
  visionRadiusForViewport,
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

// 8) P-39 缩放：setZoom 钳制 + 阻尼收敛 + zoom≠1 时互逆
const RULES = RULES_MOD.RULES;
const cz = createCamera({ vw: 800, vh: 600 });
ok(close(cz.minZoom, RULES.camera.minZoom) && close(cz.maxZoom, RULES.camera.maxZoom),
   'createCamera 从 RULES.camera 读缺省上下限');
ok(close(setZoom(cz, 99), cz.maxZoom) && close(cz.targetZoom, cz.maxZoom), 'setZoom 超上限 → 钳到 maxZoom');
ok(close(setZoom(cz, 0.01), cz.minZoom) && close(cz.targetZoom, cz.minZoom), 'setZoom 低于下限 → 钳到 minZoom');
setZoom(cz, 1.25);
for (let i = 0; i < 100; i++) updateCamera(cz, null, 0.05);
ok(close(cz.zoom, 1.25, 1e-3), 'updateCamera 多帧后 zoom 收敛到 targetZoom');
const zBefore = cz.zoom;
setZoom(cz, 99); // target=1.3
updateCamera(cz, null, 0.03);
ok(cz.zoom > zBefore && cz.zoom < cz.targetZoom + 1e-9, '阻尼中间帧：zoom 向 target 单调趋近且不超过');

// zoom≠1 的 worldToScreen/screenToWorld 双向互逆
const camR = createCamera({ vw: 800, vh: 600, bounds: { w: 2400, h: 1200 } });
camR.x = 900; camR.y = 500; camR.zoom = 1.7; camR.targetZoom = 1.7;
const pA = { x: 1234.5, y: 678.9 };
const sA = worldToScreen(camR, pA.x, pA.y);
const bA = screenToWorld(camR, sA.x, sA.y);
ok(close(bA.x, pA.x) && close(bA.y, pA.y), 'zoom=1.7：世界→屏幕→世界 互逆');
const sB = { x: 321, y: 456 };
const wB = screenToWorld(camR, sB.x, sB.y);
const bB = worldToScreen(camR, wB.x, wB.y);
ok(close(bB.x, sB.x) && close(bB.y, sB.y), 'zoom=1.7：屏幕→世界→屏幕 互逆');

// ================= #E12（2026-09-20）摄像机随鼠标向外延伸 =================
{
  const rc = /** @type {any} */ (RULES.camera) || {};
  const ratio = rc.mouseLeadRatio !== undefined ? rc.mouseLeadRatio : 0.30;
  const vR = (RULES.vision && RULES.vision.radius) || 900;

  // 1) 鼠标在视口正中 → 零外延
  const c0 = createCamera({ vw: 800, vh: 600, bounds: { w: 4000, h: 4000 } });
  updateCameraLead(c0, 400, 300, 1.0);
  ok(Math.abs(c0.leadX) < 0.5 && Math.abs(c0.leadY) < 0.5, '#E12 鼠标居中 → 外延≈0');

  // 2) 鼠标偏右 → leadX > 0，且量级 = vR×ratio（收敛后，zoom=1 无补偿）
  const c1 = createCamera({ vw: 800, vh: 600, bounds: { w: 4000, h: 4000 } });
  for (let i = 0; i < 200; i++) updateCameraLead(c1, 800, 300, 0.05);
  ok(c1.leadX > 0 && Math.abs(c1.leadX - vR * ratio) < 1.0,
     `#E12 鼠标到右缘 → 外延 = 视野半径×ratio（${c1.leadX.toFixed(1)} ≈ ${(vR * ratio).toFixed(1)}）`);
  ok(Math.abs(c1.leadY) < 0.5, '#E12 纯水平偏移不产生垂直外延');

  // 3) 外延方向随鼠标方向反转
  const c2 = createCamera({ vw: 800, vh: 600, bounds: { w: 4000, h: 4000 } });
  for (let i = 0; i < 200; i++) updateCameraLead(c2, 0, 600, 0.05);
  ok(c2.leadX < 0 && c2.leadY > 0, '#E12 左下方向 → leadX<0 且 leadY>0');

  // 4) zoom 反向补偿：zoom 越小外延越远（世界侧外延量不随缩放改变）
  const c3 = createCamera({ vw: 800, vh: 600, bounds: { w: 8000, h: 8000 } });
  c3.zoom = 0.8; c3.targetZoom = 0.8;
  for (let i = 0; i < 200; i++) updateCameraLead(c3, 800, 300, 0.05);
  ok(c3.leadX > c1.leadX, `#E12 zoom 补偿：0.8 倍缩放下外延更远（${c3.leadX.toFixed(1)} > ${c1.leadX.toFixed(1)}）`);

  // 5) updateCamera 把外延叠加到跟随目标上（视口中心朝鼠标侧前移）
  const c4 = createCamera({ vw: 800, vh: 600, bounds: { w: 8000, h: 8000 } });
  c4.x = 1000; c4.y = 1000;
  c4.leadX = 100; c4.leadY = 0;
  const tgt = { x: 1400, y: 1000 };
  for (let i = 0; i < 300; i++) updateCamera(c4, tgt, 0.03);
  ok(c4.x > 1450 && c4.x < 1500.5, `#E12 视口中心 = 目标 + 外延（x=${c4.x.toFixed(1)} ≈ 1500）`);

  // 6) 零外延（未调用 updateCameraLead）→ 与旧版跟随完全一致
  const c5 = createCamera({ vw: 800, vh: 600, bounds: { w: 8000, h: 8000 } });
  c5.x = 1000; c5.y = 1000;
  for (let i = 0; i < 300; i++) updateCamera(c5, tgt, 0.03);
  ok(Math.abs(c5.x - 1400) < 0.5, '#E12 缺省零外延 → 跟随中心等于目标（回归保障）');
}

// ================= #H5（2026-09-21）可见距离屏幕相对化：缩放完全自由 =================
// 用户裁定：「目前敌方渲染的距离写死成了像素，会受缩放影响，迫使玩家始终以最高倍率游玩，
// 失去一些细节」——#H1 窄轴收口与 #H2 深度拉远均以「固定像素可见距离」为前提，二者废弃；
// 可见半径改为屏幕相对：R = screenRadiusRatio × 窄半幅/zoom × (1+卡牌加成)，R×zoom 恒定。
{
  const bias = (RULES.vision && RULES.vision.bias) || 0.35;
  const ratio = (RULES.camera && RULES.camera.mouseLeadRatio) || 0.30;
  const baseR = (RULES.vision && RULES.vision.radius) || 900;
  const scrRatio = (RULES.vision && RULES.vision.screenRadiusRatio !== undefined)
    ? RULES.vision.screenRadiusRatio : 1.0;
  const dirs = [[1, 0], [0, 1], [-1, 0], [0, -1], [0.7071, 0.7071], [-0.7071, 0.7071]];
  // 屏幕从玩家出发沿方向 u 的前向边界（世界 px，含相机外延 zoomComp）
  const screenReach = (cam, ux, uy) => {
    const hw = cam.vw / 2 / cam.zoom, hh = cam.vh / 2 / cam.zoom;
    const lead = (baseR * ratio) / cam.zoom;
    const dx = Math.abs(ux) < 1e-9 ? Infinity : (hw + lead * Math.abs(ux)) / Math.abs(ux);
    const dy = Math.abs(uy) < 1e-9 ? Infinity : (hh + lead * Math.abs(uy)) / Math.abs(uy);
    return Math.min(dx, dy);
  };

  // 1) 核心公式：1080p/zoom1 → R = 1.0×540 = 540（屏幕相对；radius 900 不再决定可见距离）
  const camL = createCamera({ vw: 1920, vh: 1080, bounds: { w: 8000, h: 8000 } });
  const R1 = visionRadiusForViewport(camL, {});
  ok(close(R1, scrRatio * 540, 1e-6),
     `#H5 1080p/zoom1 可见半径 R=${R1.toFixed(1)} = ratio×窄半幅（固定像素 900 不再参与）`);

  // 2) 核心断言：R×zoom 恒定——zoom 0.8/1.0/1.3 下屏幕占比不变（缩放自由，无 gameplay 惩罚）
  {
    let okZoom = true;
    const ratios = [];
    for (const z of [0.8, 1.0, 1.3]) {
      const cz = createCamera({ vw: 1920, vh: 1080, bounds: { w: 8000, h: 8000 } });
      cz.zoom = z; cz.targetZoom = z;
      const Rz = visionRadiusForViewport(cz, {});
      ratios.push(Rz * z);
      if (!close(Rz * z, scrRatio * 540, 1e-6)) okZoom = false;
    }
    ok(okZoom, `#H5 R×zoom 恒定（${ratios.map(v => v.toFixed(1)).join(' / ')}）——缩放不改变敌人的屏幕出现位置`);
  }

  // 3) 各方向等距：6 鼠标方向的前向可见边界（屏幕相对）一致（屏幕相对圆与屏幕同比例缩放）
  {
    let isoOk = true;
    for (const [ux, uy] of dirs) {
      // 有效前向距离 = min((1+bias)R, 屏幕容量)；屏幕相对下两者均 ∝ 1/zoom → 同比例缩放
      const effZoom1 = Math.min((1 + bias) * R1, screenReach(camL, ux, uy));
      const cz = createCamera({ vw: 1920, vh: 1080, bounds: { w: 8000, h: 8000 } });
      cz.zoom = 1.3; cz.targetZoom = 1.3;
      const Rz = visionRadiusForViewport(cz, {});
      const effZoom13 = Math.min((1 + bias) * Rz, screenReach(cz, ux, uy));
      // 屏幕相对性：zoom 1.3 的世界距离 = zoom 1 的距离 / 1.3（同一屏幕位置）
      if (!close(effZoom13 * 1.3, effZoom1, 1e-6)) isoOk = false;
    }
    ok(isoOk, '#H5 6 方向前向可见边界屏幕相对一致（zoom 1.3 世界距离 = zoom 1 ÷ 1.3，同屏位）');
  }

  // 4) 轴向等距（#H1 目标在屏幕相对口径下保持）：同一 zoom 下横向/纵向/斜向的
  //    「屏幕占比」一致（R×zoom 同值，min(视野, 屏幕) 的屏幕位恒定）
  {
    const eff1 = Math.min((1 + bias) * R1, screenReach(camL, 1, 0));
    const eff2 = Math.min((1 + bias) * R1, screenReach(camL, 0, 1));
    ok(close(eff1, eff2, 1e-6), '#H5 同 zoom 下横向/纵向可见边界一致（等距目标保持）');
  }

  // 5) 超宽屏/竖屏同规则（窄半幅同为 540 → 同一 R；更宽的屏幕不获得距离优势）
  const camUW = createCamera({ vw: 2560, vh: 1080, bounds: { w: 8000, h: 8000 } });
  const camP = createCamera({ vw: 1080, vh: 1920, bounds: { w: 8000, h: 8000 } });
  ok(close(visionRadiusForViewport(camUW, {}), R1, 1e-6) && close(visionRadiusForViewport(camP, {}), R1, 1e-6),
     '#H5 21:9 超宽屏与竖屏窄半幅同为 540 → 同一可见半径');

  // 6) 卡牌加成：nominal +25% → 屏幕占比等比放大；但前向边界 (1+bias)R 受护栏截断
  //    （cap = (窄半幅+外延)/(1+bias) = 600——圆心偏移 bias×R 后前向仍须落在屏幕容量内）
  const RB = visionRadiusForViewport(camL, { nominal: baseR * 1.25 });
  const capL = (540 + baseR * ratio) / (1 + bias);
  ok(close(RB, Math.min(scrRatio * 540 * 1.25, capL), 1e-6),
     `#H5 卡牌视野加成 → R=${RB.toFixed(1)} = min(×1.25=${(scrRatio * 540 * 1.25).toFixed(0)}, 护栏 ${capL.toFixed(0)})（前向边界恒在屏幕容量内）`);

  // 7) 几何护栏（#H1 遗产）：极扁视口下外延占比大 → 收口兜底仍保持各方向等距
  {
    const camFlat = createCamera({ vw: 3840, vh: 600, bounds: { w: 20000, h: 20000 } });  // 窄半幅 300 < 外延 270 占比高
    camFlat.zoom = 1.3;
    const Rf = visionRadiusForViewport(camFlat, {});
    let flatOk = true;
    for (const [ux, uy] of dirs) {
      if (Math.min((1 + bias) * Rf, screenReach(camFlat, ux, uy)) < (1 + bias) * Rf - 1e-6) flatOk = false;
    }
    ok(flatOk, `#H5 极扁视口（窄半幅 300/zoom1.3）收口兜底 R=${Rf.toFixed(1)} 仍全方向等距`);
  }

  // 8) 缩放回归纯视觉偏好：minZoom 回 0.8（#H2 的 0.45 深度拉远下限不再需要）
  ok(close(RULES.camera.minZoom, 0.8, 1e-9), '#H5 minZoom 回 0.8（#H2 深度拉远移除，默认 zoom=1 全细节）');
}

console.log('test-camera: 完成所有检查');
if (fails === 0) console.log('test-camera: 全部通过');
else console.error(`test-camera: ${fails} 项失败`);
process.exit(fails === 0 ? 0 : 1);
