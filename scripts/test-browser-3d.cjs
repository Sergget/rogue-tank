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

    const st = await page.evaluate(() => window.__TEST3D__.state());
    check('玩家已生成', !!st.player && st.player.hp > 0, JSON.stringify(st.player));
    check('战场含敌军', st.enemies > 0, `enemies=${st.enemies}`);
    check('友军编队 2 辆', st.allies === 2, `allies=${st.allies}`);
    check('节点尺寸合理', st.node && st.node.w > 800 && st.node.h > 500, JSON.stringify(st.node));

    // 屏幕中心拾取 ≈ 相机目标，且落在地图内（视野大于战场时相机会居中）
    const pick = await page.evaluate(() => {
      const s = window.__TEST3D__.state();
      return { hit: window.__TEST3D__.pick(640, 360), target: s.cam.target, node: s.node };
    });
    const pickDist = pick.hit ? Math.hypot(pick.hit.x - pick.target.x, pick.hit.y - pick.target.z) : Infinity;
    const inWorld = pick.hit && pick.hit.x >= 0 && pick.hit.y >= 0
      && pick.hit.x <= pick.node.w && pick.hit.y <= pick.node.h;
    check('屏幕中心射线命中地面且落在战场内', !!pick.hit && inWorld && pickDist < 120,
      `dist=${pickDist.toFixed(1)} inWorld=${inWorld}`);

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

    // 友军命令：集火指定目标
    const target = await page.evaluate(() => {
      const es = window.__TEST3D__.entities().filter(e => e.team === 'enemy' && e.hp > 0);
      return es.length ? es[0].id : null;
    });
    const issued = await page.evaluate(tid => window.__TEST3D__.issue({ order: 'focus', targetId: tid }), target);
    check('友军集火命令下发', issued.issued.length === 2 && !issued.reason, JSON.stringify(issued));
    const allies = await page.evaluate(() => window.__TEST3D__.allies());
    check('友军任务目标一致', allies.every(a => a.order === 'focus' && a.targetId === target),
      JSON.stringify(allies.map(a => [a.order, a.targetId])));
    const fireTargets = await page.evaluate(() => window.__TEST3D__.allies().map(a => window.__TEST3D__.fireTarget(a.id)));
    check('击发目标 ≡ 任务目标', fireTargets.every(id => id === target), JSON.stringify(fireTargets));

    const retreat = await page.evaluate(() => window.__TEST3D__.issue({ order: 'retreat' }));
    check('撤退解除集火', retreat.issued.length === 2 && !retreat.reason, JSON.stringify(retreat));

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
