// scripts/test-browser-3d.cjs — R1（2026-10-27）3D 可玩切片浏览器链。
// 覆盖：WebGL 初始化 / 世界生成（玩家+敌军+友军）/ 屏幕射线拾取 / 主炮开火 /
//   友军命令与击发目标权威 / 截图产物。
// 用法: node scripts/test-browser-3d.cjs
// 退出码: 0=全过 / 1=断言失败 / 2=脚本异常 / 86=环境拒绝 spawn
'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright-core');
const { launchBrowser } = require('./lib/browser-launch.cjs');

const ROOT = path.join(__dirname, '..');
const DEFAULT_PORT = 8000;
const ALT_PORT = 8123;
const SHOT_DIR = path.join(ROOT, 'tmp', 'r1-3d');

const FAILS = [];
function check(name, cond, detail) {
  const ok = !!cond;
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${detail ? ' | ' + detail : ''}`);
  if (!ok) FAILS.push(name);
}
const wait = ms => new Promise(r => setTimeout(r, ms));

function probeOurApi(url, timeoutMs = 1500) {
  return new Promise(resolve => {
    const req = http.get(url, res => {
      let body = '';
      res.on('data', c => { body += c; });
      res.on('end', () => { try { JSON.parse(body); resolve(true); } catch { resolve(false); } });
    });
    req.setTimeout(timeoutMs, () => { req.destroy(); resolve(false); });
    req.on('error', () => resolve(false));
  });
}

function startServer(port) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['server.js'], {
      cwd: ROOT,
      env: { ...process.env, PORT: String(port) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let log = '';
    child.stdout.on('data', d => { log += d; });
    child.stderr.on('data', d => { log += d; });
    const api = `http://127.0.0.1:${port}/api/tanks`;
    const deadline = Date.now() + 10000;
    const poll = async () => {
      if (await probeOurApi(api, 800)) { resolve(child); return; }
      if (child.exitCode !== null) { reject(new Error(`server.js exited early (${child.exitCode})\n${log}`)); return; }
      if (Date.now() > deadline) { reject(new Error(`server.js not ready\n${log}`)); return; }
      setTimeout(poll, 400);
    };
    poll();
  });
}

async function ensureServer() {
  if (await probeOurApi(`http://127.0.0.1:${DEFAULT_PORT}/api/tanks`)) {
    return { base: `http://127.0.0.1:${DEFAULT_PORT}`, child: null };
  }
  const child = await startServer(ALT_PORT);
  return { base: `http://127.0.0.1:${ALT_PORT}`, child };
}

(async () => {
  let browser = null;
  let server = null;
  try {
    server = await ensureServer();
    browser = await launchBrowser(chromium, {
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors = [];
    page.on('console', m => {
      if (m.type() === 'error' && !String(m.text()).includes('Failed to load resource')) errors.push(m.text());
    });
    page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

    await page.goto(`${server.base}/tank_3d.html`, { waitUntil: 'load', timeout: 30000 });
    const ready = await page.waitForFunction(
      () => window.__TEST3D__ && window.__TEST3D__.ready === true,
      null,
      { timeout: 30000 }
    ).then(() => true).catch(() => false);
    const boot = await page.evaluate(() => {
      const el = document.getElementById('boot');
      return el ? { display: el.style.display, text: el.textContent } : null;
    });
    check('R1 页面启动（WebGL 可用）', ready, JSON.stringify(boot));
    if (!ready) throw new Error('R1 页面未就绪：' + JSON.stringify(boot));

    // G1（2026-10-28）：敌人改由波次投放——进入时处于 telegraph（场上 0 敌），
    // 等首波入场后再断言。旧断言「战场含敌军」隐含「开局预生成 6 敌」，已不成立。
    const waveIn = await page.waitForFunction(
      () => window.__TEST3D__.state().enemies > 0, null, { timeout: 15000 }
    ).then(() => true).catch(() => false);
    const st = await page.evaluate(() => window.__TEST3D__.state());
    check('玩家已生成', !!st.player && st.player.hp > 0, JSON.stringify(st.player));
    check('首波敌人入场（波次投放，非预生成）', waveIn && st.enemies > 0, `enemies=${st.enemies}`);
    check('友军编队 2 辆', st.allies === 2, `allies=${st.allies}`);
    check('节点尺寸合理', st.node && st.node.w > 800 && st.node.h > 500, JSON.stringify(st.node));

    // 屏幕中心拾取 ≈ 相机目标，且落在地图内（视野大于战场时相机会居中）
    // 2026-10-28：中心坐标必须**从画布实际尺寸算**，不能写死 (640,360)。
    // 性能护栏会按机器帧时间把渲染分辨率降到 0.85/0.7（canvas 变 1088×612 / 896×504），
    // 写死的坐标就不再是画面中心，射线会打到别处 —— 那是断言的问题，不是拾取的问题。
    const pick = await page.evaluate(() => {
      const s = window.__TEST3D__.state();
      const c = document.getElementById('c');
      const cx = c.width / 2, cy = c.height / 2;
      return { hit: window.__TEST3D__.pick(cx, cy), target: s.cam.target, node: s.node, canvas: [c.width, c.height] };
    });
    const pickDist = pick.hit ? Math.hypot(pick.hit.x - pick.target.x, pick.hit.y - pick.target.z) : Infinity;
    const inWorld = pick.hit && pick.hit.x >= 0 && pick.hit.y >= 0
      && pick.hit.x <= pick.node.w && pick.hit.y <= pick.node.h;
    check('屏幕中心射线命中地面且落在战场内', !!pick.hit && inWorld && pickDist < 120,
      `dist=${pickDist.toFixed(1)} inWorld=${inWorld} canvas=${pick.canvas.join('×')}`);

    // 主炮开火：对准最近敌人方向后调用 fire
    const fired = await page.evaluate(() => {
      const st = window.__TEST3D__.state();
      const es = window.__TEST3D__.entities().filter(e => e.team === 'enemy' && e.hp > 0);
      if (!es.length) return { ok: false, reason: 'no-enemy' };
      const p = window.__TEST3D__.player();
      const t = es[0];
      window.__TEST3D__.setMouse(t.x, t.y);
      p.turretAngle = Math.atan2(t.y - p.y, t.x - p.x);
      const before = st.shells;
      const ok = window.__TEST3D__.fire();
      return { ok, before, after: window.__TEST3D__.state().shells, reloadT: p.reloadT };
    });
    check('主炮开火（炮弹入列或进入装填）', fired.ok && (fired.after > fired.before || fired.reloadT > 0),
      JSON.stringify(fired));

    // 连续开火：装填完成后必须能再次击发（R1 曾因主循环不递减 reloadT 只能打一发）
    await wait(1800);
    const fired2 = await page.evaluate(() => {
      const p = window.__TEST3D__.player();
      const es = window.__TEST3D__.entities().filter(e => e.team === 'enemy' && e.hp > 0);
      if (es.length) {
        const t = es[0];
        window.__TEST3D__.setMouse(t.x, t.y);
        p.turretAngle = Math.atan2(t.y - p.y, t.x - p.x);
      }
      const before = window.__TEST3D__.state().shells;
      const ok = window.__TEST3D__.fire();
      const st = window.__TEST3D__.state();
      return { ok, before, after: st.shells, shots: st.shotsFired, reloadT: p.reloadT };
    });
    check('装填完成后可再次开火', fired2.ok && fired2.after > fired2.before, JSON.stringify(fired2));

    // 友军命令：Z/X/C 快捷键（命令转盘暂时关闭）
    const targetInfo = await page.evaluate(() => {
      const es = window.__TEST3D__.entities().filter(e => e.team === 'enemy' && e.hp > 0);
      if (!es.length) return null;
      const e = es[0];
      e.hp = Math.max(e.hp, 10000);   // 防止飞行中的炮弹在按键前把目标打死
      // 友军也可能被溅射打死；命令测试期间保活
      for (const a of window.__TEST3D__.entities()) {
        if (a.team === 'ally') a.hp = Math.max(a.hp, 10000);
      }
      window.__TEST3D__.setMouse(e.x, e.y);
      return { id: e.id };
    });
    check('存在可集火敌人', !!targetInfo, JSON.stringify(targetInfo));
    if (!targetInfo) throw new Error('没有存活敌人');
    const target = targetInfo.id;
    await wait(80);
    await page.keyboard.press('c');
    await wait(200);
    const allies = await page.evaluate(() => window.__TEST3D__.allies());
    check('C 键集火下发', allies.length > 0 && allies.every(a => a.order === 'focus' && !!a.targetId),
      JSON.stringify(allies.map(a => [a.order, a.targetId])));
    const fireTargets = await page.evaluate(() => window.__TEST3D__.allies().map(a => window.__TEST3D__.fireTarget(a.id)));
    check('击发目标 ≡ 任务目标', fireTargets.every((id, i) => id === allies[i].targetId),
      JSON.stringify(fireTargets));

    const moved = await page.evaluate(() => {
      const p = window.__TEST3D__.player();
      window.__TEST3D__.setMouse(p.x + 220, p.y + 120);
      return true;
    });
    await wait(80);
    await page.keyboard.press('x');
    await wait(200);
    const moveOrders = await page.evaluate(() => window.__TEST3D__.allies().map(a => a.order));
    check('X 键移动下发', moved && moveOrders.every(o => o === 'move'), JSON.stringify(moveOrders));

    await page.keyboard.press('z');
    await wait(200);
    const followOrders = await page.evaluate(() => window.__TEST3D__.allies().map(a => a.order));
    check('Z 键跟随下发', followOrders.every(o => o === 'follow'), JSON.stringify(followOrders));
    const wheel = await page.evaluate(() => window.__TEST3D__.allyWheelState());
    check('命令转盘暂时关闭', wheel.open === false, JSON.stringify(wheel));

    // 截图产物
    fs.mkdirSync(SHOT_DIR, { recursive: true });
    const shot = path.join(SHOT_DIR, 'r1-3d.png');
    await page.locator('#c').screenshot({ path: shot });
    check('3D 截图已生成', fs.existsSync(shot) && fs.statSync(shot).size > 1000, shot);

    check('全程无 console error / page error', errors.length === 0, JSON.stringify(errors.slice(0, 3)));
  } catch (err) {
    console.error(err && err.stack ? err.stack : String(err));
    process.exitCode = 2;
  } finally {
    if (browser) await browser.close();
    if (server && server.child) server.child.kill();
  }
  if (!process.exitCode) {
    if (FAILS.length) { console.error(`\n${FAILS.length} 项失败`); process.exitCode = 1; }
    else console.log('\ntest-browser-3d: 全部通过');
  }
})();
