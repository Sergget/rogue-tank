// scripts/test-browser-encounter.cjs — G1（2026-10-28）完整遭遇浏览器链。
// Node 链（scripts/test-encounter.js）只测波次状态机；这条链测**页面接线**：
//   敌人真的进场了吗？有进攻意志吗（不龟缩）？抢修/补员生效吗？胜负与结算画出来了吗？
// 覆盖：telegraph→spawn→wave→breather→victory 全链路 / defeat 链路 / R 重开 /
//   进攻意志（aiEngaged + lastKnownPlayerPos）/ 敌人主动推进 / HUD 可读 / 无 console error。
// 用法: node scripts/test-browser-encounter.cjs
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
const ALT_PORT = 8124;
const SHOT_DIR = path.join(ROOT, 'tmp', 'g1-encounter');

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

async function waitPhase(page, phase, timeoutMs) {
  return page.waitForFunction(
    p => window.__TEST3D__ && window.__TEST3D__.encounter && window.__TEST3D__.encounter().phase === p,
    phase, { timeout: timeoutMs }
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
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors = [];
    page.on('console', m => {
      if (m.type() === 'error' && !String(m.text()).includes('Failed to load resource')) errors.push(m.text());
    });
    page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

    await page.goto(`${server.base}/tank_3d.html`, { waitUntil: 'load', timeout: 30000 });
    const ready = await page.waitForFunction(
      () => window.__TEST3D__ && window.__TEST3D__.ready === true, null, { timeout: 30000 }
    ).then(() => true).catch(() => false);
    check('3D 页面启动', ready);
    if (!ready) throw new Error('3D 页面未就绪');

    // --- 1) 遭遇已接管：初始处于 telegraph（不再是开局 6 敌沙盒）---
    const init = await page.evaluate(() => window.__TEST3D__.encounter());
    check('遭遇已启用且起始为 telegraph', init.enabled === true && init.phase === 'telegraph',
      `phase=${init.phase} wave=${init.waveIndex}/${init.waveCount}`);
    check('波次总数为 3', init.waveCount === 3, `waveCount=${init.waveCount}`);
    check('telegraph 期间场上无敌人（不预生成）', init.enemyAlive === 0, `enemyAlive=${init.enemyAlive}`);

    // 来袭预警可读：中央提示 + 屏幕红闪层可见
    // 2026-10-28：必须**条件等待**而不是取瞬时值。telegraph 只有 2s，而 HUD 每 150ms
    // 才重绘一次；`ready` 之后立刻取值会撞上「首帧还没跑 update()、文案尚未生成」的窗口
    // （页面侧已修为不显示空框，所以这里会读到 display:none —— 那是正确行为，不是缺陷）。
    const warn = await page.waitForFunction(() => {
      const el = document.getElementById('encWarn');
      const txt = el ? el.querySelector('.txt') : null;
      const text = txt ? txt.textContent : '';
      if (!el || el.style.display !== 'block' || !text) return null;   // 还没就绪，继续等
      return { display: el.style.display, text };
    }, null, { timeout: 5000 }).then(h => h.jsonValue()).catch(() => null);
    check('来袭预警可读（方位提示非空 + 提示层可见）',
      !!warn && warn.display === 'block' && /第\s*1\s*波来袭/.test(warn.text), JSON.stringify(warn));

    // --- 2) 首波入场 + 进攻意志 ---
    // intel（lastKnownPlayerPos）必须在**入场首帧**抓：AI 一旦自己看到玩家就会清除记忆点
    // （js/tank_ai.js:823），等几帧再读会读到「已清除」，那是正常行为不是缺陷。
    const firstFrame = await page.evaluate(() => new Promise(res => {
      let tries = 0;
      const tick = () => {
        const es = window.__TEST3D__.entities().filter(x => x.team === 'enemy' && x.hp > 0);
        if (es.length) {
          const p = window.__TEST3D__.player();
          res({
            n: es.length,
            intel: es.filter(x => x.lastKnownPlayerPos).length,
            react: es.filter(x => (x.aiReactT || 0) > 0).length,
            // 出生坐标 + 到玩家距离：用于判断出生点是「采样命中」还是「走了兜底路径」
            coords: es.map(x => [Math.round(x.x), Math.round(x.y), Math.round(Math.hypot(x.x - p.x, x.y - p.y))]),
            why: es.map(x => window.__TEST3D__.spawnBlockedWhy(x.x, x.y)),
          });
          return;
        }
        if (++tries > 900) { res({ n: 0, intel: 0, react: 0, coords: [] }); return; }
        requestAnimationFrame(tick);
      };
      tick();
    }));
    check('首波入场首帧即获知玩家方位（lastKnownPlayerPos）',
      firstFrame.n > 0 && firstFrame.intel === firstFrame.n, JSON.stringify(firstFrame));
    console.log(`INFO | 首波出生点：[x,y,距玩家] ${JSON.stringify(firstFrame.coords)}`
      + ` · 该点当前判定 ${JSON.stringify(firstFrame.why)}`);
    check('敌人入场带反应延迟（防出场即齐射）',
      firstFrame.n > 0 && firstFrame.react === firstFrame.n, JSON.stringify(firstFrame));

    const spawned = await waitPhase(page, 'wave', 15000);
    const w1 = await page.evaluate(() => {
      const e = window.__TEST3D__.encounter();
      const es = window.__TEST3D__.entities().filter(x => x.team === 'enemy' && x.hp > 0);
      const p = window.__TEST3D__.player();
      const dists = es.map(x => Math.hypot(x.x - p.x, x.y - p.y));
      return {
        phase: e.phase, waveIndex: e.waveIndex, alive: es.length,
        engaged: es.filter(x => x.aiEngaged === true).length,
        minDist: dists.length ? Math.min(...dists) : -1,
        maxDist: dists.length ? Math.max(...dists) : -1,
      };
    });
    check('首波已入场（3 辆）', spawned && w1.alive === 3, JSON.stringify(w1));
    check('波次敌人全部带进攻意志（aiEngaged）', w1.engaged === w1.alive && w1.alive > 0,
      `engaged=${w1.engaged}/${w1.alive}`);
    check('出生点不在贴脸距离（≥380px）', w1.minDist >= 380, `minDist=${Math.round(w1.minDist)}`);
    check('出生点不过远（≤900px，防干等）', w1.maxDist <= 901, `maxDist=${Math.round(w1.maxDist)}`);

    // --- 3) 敌人主动推进（防「玩家龟缩 = 无限局」回归）---
    const before = await page.evaluate(() => {
      const p = window.__TEST3D__.player();
      const es = window.__TEST3D__.entities().filter(x => x.team === 'enemy' && x.hp > 0);
      return { d: es.length ? Math.min(...es.map(x => Math.hypot(x.x - p.x, x.y - p.y))) : -1 };
    });
    await wait(4000);
    const after = await page.evaluate(() => {
      const p = window.__TEST3D__.player();
      const es = window.__TEST3D__.entities().filter(x => x.team === 'enemy' && x.hp > 0);
      return { min: es.length ? Math.min(...es.map(x => Math.hypot(x.x - p.x, x.y - p.y))) : -1 };
    });
    check('玩家静止不动时敌人仍在推进（防龟缩）',
      after.min >= 0 && after.min < before.d - 40, `before=${Math.round(before.d)} after=${Math.round(after.min)}`);

    // --- 4) 难度探针：只在敌人**真正进入交战距离后**才测 ---
    // spawn 后立刻测量会把「敌人跑过来的时间」算进去，得到的是虚低的承伤率。
    const gotClose = await page.waitForFunction(() => {
      const p = window.__TEST3D__.player();
      const es = window.__TEST3D__.entities().filter(x => x.team === 'enemy' && x.hp > 0);
      return es.length > 0 && Math.min(...es.map(x => Math.hypot(x.x - p.x, x.y - p.y))) < 620;
    }, null, { timeout: 25000 }).then(() => true).catch(() => false);
    check('敌人能在合理时间内压到接战距离', gotClose);
    await page.evaluate(() => { const p = window.__TEST3D__.player(); p.hp = p.stats.maxHp; });

    const s0 = await page.evaluate(() => {
      const p = window.__TEST3D__.player();
      return { hp: p.hp, maxHp: p.stats.maxHp };
    });
    await wait(4000);
    const s1 = await page.evaluate(() => window.__TEST3D__.player().hp);
    const dps = (s0.hp - s1) / 4;
    console.log(`INFO | 难度探针（交战中·静止不还击）：4 秒掉 ${Math.round(s0.hp - s1)}/${Math.round(s0.maxHp)} 血`
      + ` ⇒ ${dps.toFixed(1)} hp/s，站着不动理论存活 ${dps > 0 ? (s0.maxHp / dps).toFixed(0) : '∞'}s`);

    // 探针 2：玩家**持续倒车**（最朴素的机动，不带掩体）的承伤率 → 机动收益的下界。
    await page.evaluate(() => { const p = window.__TEST3D__.player(); p.hp = p.stats.maxHp; });
    const hpA = await page.evaluate(() => window.__TEST3D__.player().hp);
    await page.keyboard.down('s');
    await wait(4000);
    await page.keyboard.up('s');
    const hpB = await page.evaluate(() => window.__TEST3D__.player().hp);
    console.log(`INFO | 难度探针（交战中·持续倒车）：4 秒掉 ${Math.round(hpA - hpB)} 血`
      + ` ⇒ ${((hpA - hpB) / 4).toFixed(1)} hp/s（静止基线 ${dps.toFixed(1)} hp/s）`);

    // 后续断言要依赖玩家活着，这里把血量补满（探针阶段玩家是「不还击的靶子」）
    await page.evaluate(() => {
      const p = window.__TEST3D__.player();
      p.hp = p.stats.maxHp;
    });

    // --- 4) 清波 → 喘息（抢修 + 补员）---
    const hpBefore = await page.evaluate(() => {
      window.__TEST3D__.clearShells();              // 清掉飞行中的炮弹，否则流弹会在喘息期把玩家补死
      const p = window.__TEST3D__.player();
      p.hp = Math.max(1, p.stats.maxHp * 0.5);      // 制造伤势，验证抢修
      window.__TEST3D__.killAllEnemies();
      return p.hp;
    });
    const breather = await waitPhase(page, 'breather', 15000);
    const br = await page.evaluate(() => {
      const e = window.__TEST3D__.encounter();
      const p = window.__TEST3D__.player();
      return { phase: e.phase, hp: p.hp, maxHp: p.stats.maxHp, allies: e.allyAlive, timer: e.timer };
    });
    check('清波后进入喘息窗口', breather && br.phase === 'breather', JSON.stringify(br));
    check('喘息期抢修生效（玩家回血）', br.hp > hpBefore + 1,
      `${Math.round(hpBefore)} → ${Math.round(br.hp)} / ${Math.round(br.maxHp)}`);

    // 补员：把友军清空 → 等 W2 入场 → 清掉 W2 → **下一次**喘息应补员
    // （reinforce 只在 breather 事件里发生一次，已经过去的 breather 不会再补）
    await page.evaluate(() => {
      for (const a of window.__TEST3D__.entities()) if (a.team === 'ally') a.hp = 0;
    });
    await waitPhase(page, 'wave', 25000);
    await page.evaluate(() => {
      window.__TEST3D__.clearShells();
      const p = window.__TEST3D__.player();
      p.hp = p.stats.maxHp;
      window.__TEST3D__.killAllEnemies();
    });
    const br2 = await waitPhase(page, 'breather', 25000);
    const allyAfter = await page.evaluate(() => window.__TEST3D__.encounter().allyAlive);
    check('友军全灭后下一次喘息会补员（A0 指挥可验证）', br2 && allyAfter > 0,
      `breather=${br2} allyAlive=${allyAfter}`);

    // --- 5) 推到胜利（连清剩余波次）---
    // 这里验证的是**波次链路**而非难度，所以每轮把玩家补满、清掉飞行中的炮弹 ——
    // 难度由上面的探针 INFO 给出，不在这里判红。
    for (let i = 0; i < 6; i++) {
      const done = await page.evaluate(() => window.__TEST3D__.encounter().outcome);
      if (done) break;
      await page.evaluate(() => {
        window.__TEST3D__.clearShells();
        const p = window.__TEST3D__.player();
        p.hp = p.stats.maxHp;
        window.__TEST3D__.killAllEnemies();
      });
      const ok = await page.waitForFunction(
        () => {
          const e = window.__TEST3D__.encounter();
          return e.outcome || e.phase === 'wave';
        }, null, { timeout: 25000 }
      ).then(() => true).catch(() => false);
      if (!ok) break;
    }
    const win = await page.waitForFunction(
      () => window.__TEST3D__.encounter().outcome === 'victory', null, { timeout: 30000 }
    ).then(() => true).catch(() => false);
    const winSt = await page.evaluate(() => {
      const e = window.__TEST3D__.encounter();
      const el = document.getElementById('encResult');
      const title = el ? el.querySelector('.title').textContent : '';
      const grade = el ? el.querySelector('.grade').textContent : '';
      return {
        outcome: e.outcome, stats: e.stats,
        resultShown: el ? el.style.display : null, title, grade,
      };
    });
    check('三波全清 → 胜利', win && winSt.outcome === 'victory', JSON.stringify(winSt.stats));
    check('胜利结算层可见且文案正确', winSt.resultShown === 'flex' && winSt.title === '任务完成',
      `${winSt.resultShown} / ${winSt.title}`);
    check('清波数 = 3', winSt.stats && winSt.stats.wavesCleared === 3, JSON.stringify(winSt.stats));
    check('评级已给出（S/A/B）', ['S', 'A', 'B'].indexOf(winSt.grade) >= 0, `grade=${winSt.grade}`);

    fs.mkdirSync(SHOT_DIR, { recursive: true });
    await page.locator('#c').screenshot({ path: path.join(SHOT_DIR, 'victory.png') });

    // --- 6) R 重开 → 回到 telegraph ---
    await page.keyboard.press('r');
    await wait(600);
    const re = await page.evaluate(() => {
      const e = window.__TEST3D__.encounter();
      const el = document.getElementById('encResult');
      return { phase: e.phase, outcome: e.outcome, waveIndex: e.waveIndex, resultShown: el ? el.style.display : null };
    });
    check('R 键重开：结算层关闭且回到第 1 波 telegraph',
      re.outcome === null && re.waveIndex === 0 && re.resultShown === 'none', JSON.stringify(re));

    // --- 7) defeat 链路 ---
    await page.evaluate(() => window.__TEST3D__.damagePlayer(999999));
    const lost = await page.waitForFunction(
      () => window.__TEST3D__.encounter().outcome === 'defeat', null, { timeout: 15000 }
    ).then(() => true).catch(() => false);
    const loseSt = await page.evaluate(() => {
      const el = document.getElementById('encResult');
      return {
        outcome: window.__TEST3D__.encounter().outcome,
        title: el ? el.querySelector('.title').textContent : '',
        grade: el ? el.querySelector('.grade').textContent : '',
        shown: el ? el.style.display : null,
      };
    });
    check('玩家阵亡 → 失败', lost && loseSt.outcome === 'defeat', JSON.stringify(loseSt));
    check('失败结算层可见且文案正确', loseSt.shown === 'flex' && loseSt.title === '任务失败',
      `${loseSt.shown} / ${loseSt.title}`);
    check('失败不给评级（不发安慰奖）', loseSt.grade === '—', `grade=${loseSt.grade}`);

    // 终局后敌人不应继续开火（冻结）
    const frozen = await page.evaluate(async () => {
      const before = window.__TEST3D__.state().shells;
      await new Promise(r => setTimeout(r, 800));
      return { before, after: window.__TEST3D__.state().shells };
    });
    check('终局冻结战斗（不再新增炮弹）', frozen.after <= frozen.before, JSON.stringify(frozen));

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
    else console.log('\ntest-browser-encounter: 全部通过');
  }
})();
