'use strict';

// scripts/probe-crosshair.cjs — 「精确瞄准器」可见性探针（数据工具，无断言）
//
// 2026-10-30 用户反馈「新设计的瞄准器完全看不到」。两个独立根因：
//   ① 坐标空间：drawCrosshairReticle 在 ctx.restore() 之后（屏幕空间）用 mouseWorld（世界坐标）
//      绘制 ⇒ 地图宽 8000px 时整组图形落在画布外；
//   ② 持久化：normalizeProfile 的 settings 逐字段守卫没有 aimStyle ⇒ 刷新后回默认。
// 本探针在真页面上验证修好之后的效果：切到 crosshair、把鼠标放到屏幕内某点、
//   读画布像素统计琥珀色（准星色 rgba(255,180,84,*)）像素数，并给出准星中心位置。
//
// 用法：node scripts/probe-crosshair.cjs
// 输出：琥珀像素数 + 质心 + 期望位置（屏幕坐标）。crosshair 生效时琥珀像素应 > 100 且质心贴近鼠标。

const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright-core');
const { launchBrowser } = require('./lib/browser-launch.cjs');

const ROOT = path.join(__dirname, '..');
const DEFAULT_PORT = 8000;
const ALT_PORT = 8142;
const wait = ms => new Promise(r => setTimeout(r, ms));

function probeOurApi(url, timeoutMs = 1200) {
  return new Promise(resolve => {
    const req = http.get(url, res => { res.resume(); resolve(true); });
    req.setTimeout(timeoutMs, () => { req.destroy(); resolve(false); });
    req.on('error', () => resolve(false));
  });
}

function startServer(port) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['server.js'], {
      cwd: ROOT, env: Object.assign({}, process.env, { PORT: String(port) }), stdio: 'ignore'
    });
    child.on('error', reject);
    setTimeout(() => resolve(child), 900);
  });
}

async function ensureServer() {
  if (await probeOurApi(`http://127.0.0.1:${DEFAULT_PORT}/api/tanks`)) {
    return { base: `http://127.0.0.1:${DEFAULT_PORT}`, child: null };
  }
  return { base: `http://127.0.0.1:${ALT_PORT}`, child: await startServer(ALT_PORT) };
}

// 画布琥珀像素统计（准星主色 255,180,84；容差放宽到暖色系）
async function amberStats(page) {
  return page.evaluate(() => {
    const c = document.querySelector('canvas');
    const g = c.getContext('2d');
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let n = 0, sx = 0, sy = 0;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], gg = d[i + 1], b = d[i + 2];
      if (r > 200 && gg > 120 && gg < 215 && b < 130) {
        const px = (i / 4) % c.width, py = Math.floor((i / 4) / c.width);
        n++; sx += px; sy += py;
      }
    }
    return { count: n, cx: n ? Math.round(sx / n) : -1, cy: n ? Math.round(sy / n) : -1,
             w: c.width, h: c.height };
  });
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
    const pageErrors = [];
    page.on('pageerror', e => pageErrors.push('PAGEERROR: ' + e.message));

    // 2026-10-30 修正：键名以 tank_economy 为准（savesMetaKey='rogue-tank-saves-meta'、
    //   槽位键 = saveSlotPrefix+id = 'rogue-tank-save:'+id）。此前写成 'rt_saves_v1' /
    //   'rt_save_<id>' ⇒ 预置存档**从未被读到**，脚本一直跑在默认档上。
    const savesMetaKey = 'rogue-tank-saves-meta';
    const slotKey = 'rogue-tank-save:probe-crosshair';
    const slotId = 'probe-crosshair';
    await page.goto(`${server.base}/tank_battle.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.evaluate(({ savesMetaKey, slotKey, slotId }) => {
      localStorage.setItem(savesMetaKey, JSON.stringify({
        activeSaveId: slotId,
        saves: [{ id: slotId, name: 'Probe-Crosshair', updatedAt: 1 }]
      }));
      localStorage.setItem(slotKey, JSON.stringify({
        version: 1, points: 0, upgrades: {}, stats: { runs: 0, kills: 0 },
        selectedTankId: 'Leapard_1', ammoLoadout: ['ap', 'he', 'heat'],
        bonusRevives: 0, difficultyLevel: 0, settings: { aimStyle: 'crosshair' }
      }));
    }, { savesMetaKey, slotKey, slotId });
    await page.reload({ waitUntil: 'load', timeout: 30000 });
    await wait(1200);
    await page.evaluate(() => { const b = document.querySelector('.enter-btn'); if (b) b.click(); });
    await page.waitForFunction(() => !!document.getElementById('loadStartBtn'), null, { timeout: 8000 });
    await page.waitForFunction(
      () => { const b = document.getElementById('loadStartBtn'); return b && !b.disabled; },
      null, { timeout: 10000 }).catch(() => {});
    await page.evaluate(() => { const b = document.getElementById('loadStartBtn'); if (b) b.click(); });
    const inBattle = await page.waitForFunction(
      () => window.__TEST__ && window.__TEST__.flowState() === 'battle', null, { timeout: 25000 }
    ).then(() => true).catch(() => false);
    if (!inBattle) throw new Error('battle 未就绪');
    await wait(1500);

    const style = await page.evaluate(() => {
      const p = window.__TEST__.player();
      // 走 __TEST__.profile()（profile 在页面闭包里，不是全局）
      let aim = 'no-hook';
      try {
        const pr = window.__TEST__.profile();
        aim = (pr && pr.settings) ? String(pr.settings.aimStyle) : 'no-settings';
      } catch (e) { aim = 'err:' + e.message; }
      return { aimStyle: aim, player: p ? { x: Math.round(p.x), y: Math.round(p.y) } : null };
    });

    // 把鼠标放到屏幕中心偏右（canvas 内），触发 mousemove → mouseWorld
    const canvasBox = await page.evaluate(() => {
      const c = document.querySelector('canvas');
      const r = c.getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height };
    });
    const mx = canvasBox.x + canvasBox.w * 0.62;
    const my = canvasBox.y + canvasBox.h * 0.5;
    await page.mouse.move(mx, my);
    await wait(400);

    const snap = async () => {
      const mwScreen = await page.evaluate(() => {
        const T = window.__TEST__;
        const m = T.mouseWorld(); const cm = T.cam();
        return { x: (m.x - cm.x) * cm.zoom + cm.vw / 2, y: (m.y - cm.y) * cm.zoom + cm.vh / 2,
                 mx: m.x, my: m.y, zoom: cm.zoom, style: T.aimStyle() };
      });
      const box = await page.evaluate(({ x, y }) => {
        const c = document.querySelector('canvas');
        const g = c.getContext('2d');
        const R = 80;
        const x0 = Math.max(0, Math.round(x) - R), y0 = Math.max(0, Math.round(y) - R);
        const w = Math.min(c.width - x0, R * 2), h = Math.min(c.height - y0, R * 2);
        const d = g.getImageData(x0, y0, w, h).data;
        let amber = 0, lit = 0;
        for (let i = 0; i < d.length; i += 4) {
          const r = d[i], gg = d[i + 1], b = d[i + 2];
          if (r > 200 && gg > 120 && gg < 215 && b < 130) amber++;
          if (r > 120 && gg > 90 && b < 100) lit++;
        }
        // 相机 E12 每帧缓动（随鼠标外扩），mouseWorld 的屏幕位置在两次 evaluate 间会漂几像素
        //   ⇒ 中心点取 ±6px 窗口内**最琥珀**的像素，避免采样正好落在准星边缘。
        const win = 13;
        const wd = g.getImageData(Math.round(x) - 6, Math.round(y) - 6, win, win).data;
        let best = [0, 0, 0], bestScore = -1;
        for (let i = 0; i < wd.length; i += 4) {
          const r = wd[i], gg = wd[i + 1], b = wd[i + 2];
          const score = r - Math.abs(gg - 180) - Math.abs(b - 84);
          if (score > bestScore) { bestScore = score; best = [r, gg, b]; }
        }
        return { amber, lit, center: best, w, h };
      }, { x: mwScreen.x, y: mwScreen.y });
      const all = await amberStats(page);
      return { mwScreen, box, all };
    };

    const ch = await snap();
    console.log(`=== 瞄准器可见性探针 ===`);
    console.log(`pageerror: ${pageErrors.length}${pageErrors.length ? ' → ' + pageErrors[0] : ''}`);
    console.log(`aimStyle = ${ch.mwScreen.style}（期望 crosshair；存档预置后刷新读取 = ${style.aimStyle}）`);
    console.log(`画布 ${ch.all.w}×${ch.all.h} · 鼠标客户端 (${Math.round(mx)}, ${Math.round(my)})`);
    console.log(`mouseWorld (${Math.round(ch.mwScreen.mx)}, ${Math.round(ch.mwScreen.my)}) → 屏幕 (${Math.round(ch.mwScreen.x)}, ${Math.round(ch.mwScreen.y)}) · zoom ${ch.mwScreen.zoom}`);
    console.log(`准星点周围 160×160：琥珀 ${ch.box.amber} / 暖色 ${ch.box.lit} · 中心像素 rgb(${ch.box.center.join(',')})`);
    console.log(`全画布琥珀 ${ch.all.count} 个 · 质心 (${ch.all.cx}, ${ch.all.cy})`);

    // 对照组：切回 default，同一位置同帧间隔再测——两组差异即 crosshair 的贡献
    await page.evaluate(() => {
      const pr = window.__TEST__.profile();
      if (!pr.settings) pr.settings = {};
      pr.settings.aimStyle = 'default';
    });
    await wait(300);
    const df = await snap();
    console.log(`对照组 default：准星点周围 160×160 琥珀 ${df.box.amber} / 暖色 ${df.box.lit} · 中心像素 rgb(${df.box.center.join(',')})`);
    console.log(`全画布琥珀 ${df.all.count} 个 · 质心 (${df.all.cx}, ${df.all.cy})`);
    console.log(`增量（crosshair − default）：周围琥珀 ${ch.box.amber - df.box.amber} · 周围暖色 ${ch.box.lit - df.box.lit}`);
    // 判据说明：琥珀「>200 通道阈值」只抓得住最亮的一圈笔画，准星线宽 1.5px 且半透明，
    //   叠在地面后多数像素落在 150~220 —— 用**中心点色相**判定更可靠：
    //   crosshair 在 mouseWorld 屏幕位置画 rgb(255,180,84,0.95) 的 2px 中心点，
    //   default 样式在该点没有任何图形。故取 r 通道差 + 色相形状两条同时成立。
    const cA = ch.box.center, cD = df.box.center;
    const amberish = c => (c[0] > 190 && c[1] > 120 && c[1] < 215 && c[2] < 130);
    const okFix = (cA[0] - cD[0] >= 25) && amberish(cA);
    console.log(`中心点色相：crosshair rgb(${cA.join(',')}) 是琥珀=${amberish(cA)} · default rgb(${cD.join(',')}) 是琥珀=${amberish(cD)} · Δr=${cA[0] - cD[0]}`);
    console.log(okFix
      ? '结论：准星绘制在 mouseWorld 的屏幕位置（中心点呈琥珀），修复生效'
      : '结论：中心点不是琥珀 —— 准星仍未绘制或位置不对');
    if (!okFix) process.exitCode = 1;
  } catch (err) {
    console.error(err && err.stack ? err.stack : String(err));
    process.exitCode = 2;
  } finally {
    if (browser) await browser.close();
    if (server && server.child) server.child.kill();
  }
})();
