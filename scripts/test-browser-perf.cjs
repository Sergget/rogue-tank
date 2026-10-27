// scripts/test-browser-perf.cjs — G1（2026-10-28）性能预算与降级浏览器链。
//
// Node 链（scripts/test-perf.js）只测 governor 门控；这条链测**页面接线**：
//   档位真的改画布尺寸了吗？粒子/炮弹真的被裁了吗？降级之后还能开车开火吗（不许为了帧数牺牲手感）？
//   基线用的 ?tier= 与 ?w=&h= 两个入口是否照设计工作？
//
// 覆盖：1080p / Deck 两档实机尺度 / 手动喂帧时间的逐级降→逐级升 / 分辨率比例与画面比例保持 /
//   粒子硬上限 / 炮弹硬上限 / 降级后玩法无损（能开火、能移动、模拟步长不变）/ F1 清单可读。
// 用法: node scripts/test-browser-perf.cjs
// 退出码: 0=全过 / 1=断言失败 / 2=脚本异常
'use strict';

const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright-core');
const { launchBrowser } = require('./lib/browser-launch.cjs');

const ROOT = path.join(__dirname, '..');
const DEFAULT_PORT = 8000;
const ALT_PORT = 8126;

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

async function openPage(browser, base, query, viewport) {
  const page = await browser.newPage({ viewport: viewport || { width: 1280, height: 720 } });
  const errors = [];
  page.on('console', m => {
    if (m.type() === 'error' && !String(m.text()).includes('Failed to load resource')) errors.push(m.text());
  });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  await page.goto(`${base}/tank_3d.html${query || ''}`, { waitUntil: 'load', timeout: 30000 });
  const ready = await page.waitForFunction(
    () => window.__TEST3D__ && window.__TEST3D__.ready === true, null, { timeout: 30000 }
  ).then(() => true).catch(() => false);
  return { page, ready, errors };
}

/** 用固定帧时间序列驱动 governor（不改画质之外的任何状态）——比在 swiftshader 上等真实掉帧可靠。 */
async function feedFrames(page, ms, seconds) {
  return page.evaluate(({ ms, seconds }) => {
    const P = window.__TEST3D__.perf();
    const dt = ms / 1000;
    const n = Math.ceil(seconds / dt);
    for (let i = 0; i < n; i++) P.feed(dt);
    return window.__TEST3D__.perf();
  }, { ms, seconds });
}

/**
 * 把战场复位到「可以安静测性能」的状态。
 * 做法是**拉高血量**而不是清场：主炮 `tryFire` 要求场上存在目标实体（tank_fire.js:944），
 * 清场后开枪必然返回 false——那是正确的玩法逻辑，不是性能缺陷。留敌人在场才能测「降级后还能打」。
 * 血量 ×100 是因为软件渲染下帧时间 80ms+、模拟近乎实时，不拉高的话玩家会在测量期间被打死，
 * 页面进终局冻结，后续断言会误报成「降级毁了手感」。
 */
async function stabilize(page, opts) {
  return page.evaluate((o) => {
    window.__TEST3D__.setTimeScale(1);
    const p = window.__TEST3D__.player();
    if (p) p.hp = p.stats.maxHp * (o && o.invuln === false ? 1 : 100);
    if (o && o.clearShells) window.__TEST3D__.clearShells();
    return p ? p.hp : 0;
  }, opts || {});
}

/** 等首波敌人入场（telegraph 期间场上无敌人，没有目标就打不了炮）。 */
async function waitForEnemy(page, timeoutMs) {
  return page.waitForFunction(
    () => window.__TEST3D__.state().enemies > 0, null, { timeout: timeoutMs || 20000 }
  ).then(() => true).catch(() => false);
}

(async () => {
  let browser = null;
  let server = null;
  try {
    server = await ensureServer();
    browser = await launchBrowser(chromium, {
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    });

    // ================= 1) 1080p 目标机档（perf=manual：阶梯只吃喂进来的帧时间，可复现）=================
    const hi = await openPage(browser, server.base, '?w=1920&h=1080&perf=manual');
    check('1080p 页面启动', hi.ready);
    if (!hi.ready) throw new Error('3D 页面未就绪');
    await stabilize(hi.page);

    const p0 = await hi.page.evaluate(() => window.__TEST3D__.perf());
    check('1080p：基准分辨率来自 URL', p0.base.w === 1920 && p0.base.h === 1080, JSON.stringify(p0.base));
    check('1080p：manual 模式下真实帧不参与档位', p0.manual === true && p0.changes === 0, `manual=${p0.manual} changes=${p0.changes}`);
    check('1080p：起始档为 high 且分辨率不缩放',
      p0.tier === 'high' && p0.canvas.w === 1920 && p0.canvas.h === 1080,
      `${p0.tier} ${p0.canvas.w}×${p0.canvas.h}`);
    check('性能护栏已启用（not 被 enabled=false 关掉）', p0.enabled === true, `enabled=${p0.enabled}`);
    check('high 档粒子上限是有限正数', Number.isFinite(p0.particleCap) && p0.particleCap > 0, `cap=${p0.particleCap}`);

    // 1080p 下真的能开火（判定与输入链路不受分辨率影响）
    const hasTarget = await waitForEnemy(hi.page);
    const fired = await hi.page.evaluate(async () => {
      window.__TEST3D__.setTimeScale(1);
      const p = window.__TEST3D__.player();
      let n = 0;
      for (let i = 0; i < 4; i++) { p.reloadT = 0; if (window.__TEST3D__.fire()) n++; }
      await new Promise(r => setTimeout(r, 300));
      return { n, shots: window.__TEST3D__.state().shotsFired };
    });
    check('1080p 下主炮可开火（有目标时）', hasTarget && fired.n > 0 && fired.shots >= fired.n,
      `hasTarget=${hasTarget} fired=${fired.n} shotsFired=${fired.shots}`);

    // ---- 逐级降级：22ms 阈值以上持续 2s 才降，先连喂 3s 保证跨过窗口 ----
    const down1 = await feedFrames(hi.page, 30, 3);
    check('持续 30ms 帧 → 降到 mid', down1.tier === 'mid' && down1.level === 1, `tier=${down1.tier} lvl=${down1.level}`);
    const midExpectW = Math.round(1920 * down1.resolutionScale);
    check('mid 档画布尺寸 = 基准 × resolutionScale',
      Math.abs(down1.canvas.w - midExpectW) <= 1, `canvas=${down1.canvas.w} 期望≈${midExpectW}`);
    check('mid 档保持画面比例（16:9 不许被拉变形）',
      Math.abs(down1.canvas.w / down1.canvas.h - 16 / 9) < 0.01,
      `${down1.canvas.w}×${down1.canvas.h} = ${(down1.canvas.w / down1.canvas.h).toFixed(3)}`);
    check('mid 档粒子上限比 high 低', down1.particleCap < p0.particleCap, `${p0.particleCap} → ${down1.particleCap}`);

    // 降档必须告诉玩家：画面突然变糊而不解释，会被当成 bug。
    // 而且必须**独立于战斗 toast**（实测「友军受阻」会把画质提示顶掉），所以读专属元素。
    const dropToast = await hi.page.evaluate(() => {
      const el = document.getElementById('perfNotice');
      return { display: el ? el.style.display : null, text: el ? el.textContent : '' };
    });
    check('降档时给出说明（画质自动降至「中」，独立提示位）',
      dropToast.display === 'block' && /画质自动降至/.test(dropToast.text) && /中/.test(dropToast.text),
      JSON.stringify(dropToast));

    const down2 = await feedFrames(hi.page, 30, 3);
    check('继续超预算 → 降到 deck', down2.tier === 'deck' && down2.level === 2, `tier=${down2.tier} lvl=${down2.level}`);
    const down3 = await feedFrames(hi.page, 30, 6);
    check('deck 是地板：不会越界、不会报错', down3.tier === 'deck' && down3.level === 2, `tier=${down3.tier}`);
    check('降级次数记录在案（changes 单调，用于诊断抖动）', down3.changes >= 2, `changes=${down3.changes}`);

    // ---- 降级后玩法无损：能移动、能开炮（红线：手感不为帧数让路）----
    await stabilize(hi.page, { clearShells: true });
    const hasTarget2 = await waitForEnemy(hi.page);
    const playable = await hi.page.evaluate(async () => {
      const p = window.__TEST3D__.player();
      p.reloadT = 0;
      const n = window.__TEST3D__.fire() ? 1 : 0;
      return { x0: p.x, y0: p.y, fired: n, tier: window.__TEST3D__.perf().tier };
    });
    check('deck 档下主炮仍能开火', hasTarget2 && playable.fired === 1,
      `tier=${playable.tier} hasTarget=${hasTarget2} fired=${playable.fired}`);
    // 采样最大值而不是只看末帧：撞上掩体/友军后速度会归零，
    // 「末帧速度」会把「能开车但撞了墙」误判成「油门没响应」。
    await hi.page.keyboard.down('w');
    let maxSpeed = 0, last = null;
    for (let i = 0; i < 10; i++) {
      await wait(250);
      const s = await hi.page.evaluate(() => {
        const p = window.__TEST3D__.player();
        return { x: p.x, y: p.y, hp: p.hp, speed: p.speed || 0 };
      });
      if (s.speed > maxSpeed) maxSpeed = s.speed;
      last = s;
    }
    await hi.page.keyboard.up('w');
    const afterMove = await hi.page.evaluate(() => {
      const p = window.__TEST3D__.player();
      return { x: p.x, y: p.y, hp: p.hp, outcome: window.__TEST3D__.encounter().outcome };
    });
    const movedDist = Math.hypot(afterMove.x - playable.x0, afterMove.y - playable.y0);
    // 判「能驾驶」看**速度**而不是位移：软件渲染下帧时间 80ms+，位移随帧率大幅波动，
    // 但「油门有没有响应」是玩家真正能感知的那件事。
    check('deck 档下车辆仍可驾驶（油门有响应）',
      maxSpeed > 20 || movedDist > 20,
      `maxSpeed=${maxSpeed.toFixed(1)} moved=${movedDist.toFixed(1)}px hp=${Math.round(last ? last.hp : 0)} outcome=${afterMove.outcome}`);

    check('降级不影响开火链路（炮弹上限仍 >0）', down3.maxShells > 0, `maxShells=${down3.maxShells}`);

    // ---- 降级后瞄准精度（我引入分辨率缩放，最怕的就是拾取坐标没跟着缩放）----
    // 做法：取一个敌人的世界坐标 → 投到屏幕 → 在投到的点上反查地面/实体 →
    // 误差必须在几像素级。如果屏幕坐标与世界坐标的换算漏了 resolutionScale，
    // 这里会直接暴露成几十上百像素的偏差，而玩家感受到的是「明明瞄准了却打偏」。
    const aim = await hi.page.evaluate(() => {
      const es = window.__TEST3D__.entities().filter(e => e.team === 'enemy' && e.hp > 0);
      if (!es.length) return null;
      const e = es[0];
      const s = window.__TEST3D__.enemyScreen(e.id);
      const c = document.getElementById('c');
      const back = window.__TEST3D__.pick(s.x, s.y);
      return { id: e.id, world: { x: e.x, y: e.y }, screen: s, back, canvas: [c.width, c.height] };
    });
    if (aim) {
      const err = aim.back ? Math.hypot(aim.back.x - aim.world.x, aim.back.y - aim.world.y) : Infinity;
      check('降级后屏幕↔世界坐标换算仍一致（瞄准不偏）', err < 40,
        `${aim.id} 误差=${err.toFixed(1)}px @${aim.canvas.join('×')}`);
    } else {
      console.log('SKIP | 降级后瞄准精度（场上无敌军，无法取样）');
    }

    // ---- 逐级回升：10ms 持续 8s 才升一级，且不跳档 ----
    const up1 = await feedFrames(hi.page, 10, 10);
    check('帧时间富余 → 从 deck 回升到 mid（逐级）', up1.tier === 'mid' && up1.level === 1, `tier=${up1.tier}`);
    const up2 = await feedFrames(hi.page, 10, 10);
    check('继续富余 → 回到 high', up2.tier === 'high' && up2.level === 0, `tier=${up2.tier}`);
    check('回到 high 后画布恢复 1080p',
      up2.canvas.w === 1920 && up2.canvas.h === 1080, `${up2.canvas.w}×${up2.canvas.h}`);
    // 升档保持静默：变清晰不需要解释，战斗中途多一次弹字只是噪音
    const upToast = await hi.page.evaluate(() => {
      const el = document.getElementById('perfNotice');
      return el ? el.textContent : '';
    });
    check('升档不弹字（只有降档需要说明）', !/画质自动降至「高」|升至/.test(upToast), JSON.stringify(upToast));

    check('1080p 全程无 console error', hi.errors.length === 0, JSON.stringify(hi.errors.slice(0, 3)));
    await hi.page.close();

    // ================= 1b) 真实掉帧时护栏自己会救场（不靠喂帧）=================
    // CI 的 swiftshader 是纯软件光栅化，1080p 实测 80ms+/帧 —— 这恰好是一次真实的
    // 「性能不足」实况。护栏必须能自己降级，否则它只会在测试里通过、在玩家机器上失灵。
    const real = await openPage(browser, server.base, '?w=1920&h=1080');
    check('真实掉帧场景页面启动', real.ready);
    if (real.ready) {
      const st = await real.page.evaluate(async () => {
        for (let i = 0; i < 12; i++) {
          await new Promise(r => setTimeout(r, 500));
          const p = window.__TEST3D__.perf();
          if (p.level > 0) break;
        }
        return window.__TEST3D__.perf();
      });
      const slow = st.emaMs !== null && st.emaMs > 22;
      check('真实帧时间超标时护栏自动降级（软件渲染实测）',
        !slow || st.level > 0, `ema=${st.emaMs} tier=${st.tier} lvl=${st.level}`);
      check('降级后画布随之缩小（确实省了像素）',
        st.level === 0 || st.canvas.w < st.base.w, `${st.canvas.w}/${st.base.w}`);
      console.log(`INFO | 软件渲染 1080p 实测 EMA ${st.emaMs}ms ⇒ 自动降到 ${st.tier}`);
      await real.page.close();
    }

    // ================= 2) Deck 档（1280×800 实机尺度 + 起始 deck）=================
    const deckRes = await openPage(browser, server.base, '?w=1280&h=800&tier=deck', { width: 1280, height: 800 });
    check('Deck 页面启动', deckRes.ready);
    if (deckRes.ready) {
      const d = await deckRes.page.evaluate(() => window.__TEST3D__.perf());
      check('Deck：起始档为 deck', d.tier === 'deck' && d.level === 2, `tier=${d.tier}`);
      const expect = Math.round(1280 * d.resolutionScale);
      check('Deck：起始即按 deck 缩放渲染分辨率', Math.abs(d.canvas.w - expect) <= 1,
        `canvas=${d.canvas.w} 期望≈${expect}`);
      check('Deck：粒子上限是三档最低', d.particleCap === 160 || d.particleCap < 260, `cap=${d.particleCap}`);
      check('Deck：扬尘间隔被拉长（环境氛围先降）', d.dustIntervalS >= 0.2, `dust=${d.dustIntervalS}`);

      // 真实帧时间不越界：deck 档在 1280×800 下应稳定（swiftshader 上只做「不崩」断言）
      const alive = await deckRes.page.evaluate(async () => {
        await new Promise(r => setTimeout(r, 1500));
        return window.__TEST3D__.perf();
      });
      check('Deck：跑 1.5s 后档位不漂移（无抖动降级）', alive.tier === 'deck', `tier=${alive.tier} changes=${alive.changes}`);
      check('Deck 无 console error', deckRes.errors.length === 0, JSON.stringify(deckRes.errors.slice(0, 3)));
      await deckRes.page.close();
    }

    // ================= 3) 缺省入口 + 粒子/炮弹硬上限 =================
    const def = await openPage(browser, server.base, '');
    check('缺省入口页面启动', def.ready);
    if (def.ready) {
      const d = await def.page.evaluate(() => window.__TEST3D__.perf());
      // 缺省档位是 high，但真实帧慢时护栏会降级 —— 所以断言「基准分辨率」与
      // 「画布 = 基准 × 当前档比例」，而不是死认 1280（那会随机器性能抖动）。
      check('缺省基准分辨率跟随视口（本用例视口 1280×720，且未被 ?w=&h= 钉死）',
        d.baseAuto === true && d.base.w === 1280 && d.base.h === 720,
        `auto=${d.baseAuto} base=${JSON.stringify(d.base)} vp=${JSON.stringify(d.viewport)}`);
      check('缺省入口画布 = 基准 × 当前档 resolutionScale',
        Math.abs(d.canvas.w - Math.round(d.base.w * d.resolutionScale)) <= 1,
        `${d.canvas.w} vs ${Math.round(d.base.w * d.resolutionScale)} @${d.tier}`);

      // 粒子硬上限：连开数炮 + 行驶扬尘，读取峰值与当前值
      await stabilize(def.page, { clearShells: true });
      await waitForEnemy(def.page);
      await def.page.keyboard.down('w');
      const part = await def.page.evaluate(async () => {
        window.__TEST3D__.setTimeScale(1);
        const p = window.__TEST3D__.player();
        for (let i = 0; i < 8; i++) { p.reloadT = 0; window.__TEST3D__.fire(); }
        await new Promise(r => setTimeout(r, 1200));
        return window.__TEST3D__.perf();
      });
      await def.page.keyboard.up('w');
      check('粒子数始终不超过档位上限（硬上限生效）',
        part.particleCap === null || part.particles <= part.particleCap,
        `${part.particles}/${part.particleCap}`);
      check('粒子峰值被记录且非零（开火/扬尘确实产出粒子）', part.particlePeak > 0, `peak=${part.particlePeak}`);
      check('炮弹数不超过档位上限', part.shells <= part.maxShells, `${part.shells}/${part.maxShells}`);

      // F1 清单要能读到档位（人工验收靠它）。
      // 清单默认是**可见**的（初始态由 CSS 决定），所以先按一次是「收起」；
      // 这里连按到可见为止，再断言内容——不预设初始可见性，避免 CSS 一改测试就假红。
      const hud = await def.page.evaluate(async () => {
        const el = document.getElementById('r1Check');
        const fire = () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F1', bubbles: true }));
        const vis = () => getComputedStyle(el).display !== 'none';
        const first = vis();
        if (vis()) fire();
        const toggledOff = !vis();          // 第一次按必须真的收起（证明按键链路通）
        if (!vis()) fire();
        const backOn = vis();
        return {
          first, toggledOff, backOn,
          text: el.textContent, perf: window.__TEST3D__.perf(),
        };
      });
      const hudOk = hud.toggledOff && hud.backOn && /性能护栏/.test(hud.text)
        && new RegExp(`${hud.perf.canvas.w}×${hud.perf.canvas.h}`).test(hud.text);
      check('F1 清单可开关且显示性能档位与渲染分辨率', hudOk,
        `初始可见=${hud.first} 按一次收起=${hud.toggledOff} 再按显示=${hud.backOn} canvas=${hud.perf.canvas.w}×${hud.perf.canvas.h}`
        + ` | ${(hud.text.match(/性能护栏[^□]*/) || [''])[0].slice(0, 70)}`);
      check('缺省入口无 console error', def.errors.length === 0, JSON.stringify(def.errors.slice(0, 3)));
      await def.page.close();
    }

    // ================= 4) 画面几何不变形（#AB1：基准比例必须跟随视口）=================
    // 画布由 CSS 用 100vw/100vh 拉满视口，所以渲染分辨率一旦写死 1280×720，
    // 16:10 视口（Deck 尺度 1280×800）就会被纵向拉伸 1.111 倍：圆掩体变竖椭圆。
    // 断言的是「比例」而不是「像素数」——分辨率会随性能档缩放，比例不该变。
    const deck = await openPage(browser, server.base, '', { width: 1280, height: 800 });
    check('16:10 视口（1280×800）页面启动', deck.ready);
    if (deck.ready) {
      const s = await deck.page.evaluate(() => window.__TEST3D__.perf());
      check('16:10 视口：基准分辨率跟随视口且未被钉死',
        s.baseAuto === true && s.base.w === 1280 && s.base.h === 800,
        `auto=${s.baseAuto} base=${s.base.w}×${s.base.h} vp=${s.viewport.w}×${s.viewport.h}`);
      // 变形比 = 横向缩放 / 纵向缩放，1.0 表示等比。
      const dist = (s.viewport.w / s.canvas.w) / (s.viewport.h / s.canvas.h);
      check('16:10 视口：画布比例与视口一致（变形比≈1，修复前为 1.111）',
        Math.abs(dist - 1) <= 0.01,
        `变形比=${dist.toFixed(4)} canvas=${s.canvas.w}×${s.canvas.h} vp=${s.viewport.w}×${s.viewport.h} @${s.tier}`);

      // 视口变化后必须等比重算，否则拖拽/全屏又回到拉伸状态（250ms 防抖，留 700ms 余量）。
      await deck.page.setViewportSize({ width: 1600, height: 900 });
      await wait(700);
      const s2 = await deck.page.evaluate(() => window.__TEST3D__.perf());
      check('视口改为 1600×900 后基准分辨率跟随重算',
        s2.base.w === 1600 && s2.base.h === 900,
        `base=${s2.base.w}×${s2.base.h} vp=${s2.viewport.w}×${s2.viewport.h}`);
      check('16:10 视口无 console error', deck.errors.length === 0, JSON.stringify(deck.errors.slice(0, 3)));
      await deck.page.close();
    }

    // 反向保证：显式 ?w=&h= 时**不许**跟随视口——基线截图与三档对照靠它可复现。
    const pin = await openPage(browser, server.base, '?w=1280&h=720&perf=manual', { width: 1280, height: 800 });
    check('钉死尺度的页面启动', pin.ready);
    if (pin.ready) {
      const p = await pin.page.evaluate(() => window.__TEST3D__.perf());
      check('显式 ?w=&h= 时基准被钉死、不跟随视口（基线可复现）',
        p.baseAuto === false && p.base.w === 1280 && p.base.h === 720,
        `auto=${p.baseAuto} base=${p.base.w}×${p.base.h} vp=${p.viewport.w}×${p.viewport.h}`);
      await pin.page.close();
    }
  } catch (err) {
    console.error(err && err.stack ? err.stack : String(err));
    process.exitCode = 2;
  } finally {
    if (browser) await browser.close();
    if (server && server.child) server.child.kill();
  }
  if (!process.exitCode) {
    if (FAILS.length) { console.error(`\n${FAILS.length} 项失败`); process.exitCode = 1; }
    else console.log('\ntest-browser-perf: 全部通过');
  }
})();
