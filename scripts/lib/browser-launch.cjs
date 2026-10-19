// scripts/lib/browser-launch.cjs — 浏览器链共享的 launch 包装（2026-10-19 #AGENT）
//
// 背景：`npm run test:browser` 在 DSH 沙箱（workspace-write）下必然失败，因为
// playwright 启动 Edge 需要 `--remote-debugging-pipe`（命名管道），而沙箱禁止子进程开管道：
//     browserType.launch: spawn EPERM
// 原先四条链各自把 20+ 行 playwright call log 原样吐到 stderr，看起来像代码崩了，
// 实际是环境限制 —— 每次都要人去翻日志才能区分「真失败」与「沙箱误报」。
//
// 本模块把该情形收敛成一句固定提示 + 专用退出码（EXIT_SANDBOX_DENIED），
// 让上层能一眼区分：环境没放开 / 页面真报错。

const EXIT_SANDBOX_DENIED = 86;

const SANDBOX_HINT = [
  '────────────────────────────────────────────────────────────',
  'INCONCLUSIVE: 浏览器链需要放宽进程权限（沙箱禁止子进程开命名管道）',
  '  playwright 启动 Edge 时报 "spawn EPERM" —— 这是 DSH 沙箱限制，不是代码缺陷。',
  '  处理：在允许 spawn 的环境重跑 `npm run test:browser`，或对本会话一次性放宽权限。',
  '  其余三项（check-html / tsc / npm test）不受影响，应在沙箱内全绿。',
  '────────────────────────────────────────────────────────────',
].join('\n');

/**
 * 启动浏览器；命中沙箱拒绝时打印固定提示并以 EXIT_SANDBOX_DENIED 退出。
 * @param {import('playwright-core').chromium} chromium playwright 的 chromium 对象
 * @param {object} [opts] 透传给 chromium.launch 的选项
 * @returns {Promise<import('playwright-core').Browser>}
 */
async function launchBrowser(chromium, opts) {
  try {
    return await chromium.launch(Object.assign({ channel: 'msedge', headless: true }, opts));
  } catch (err) {
    const msg = String((err && err.message) || err || '');
    const isEnvDenial = err && (err.code === 'EPERM' || /spawn EPERM|EPERM/.test(msg));
    if (isEnvDenial) {
      console.error(SANDBOX_HINT);
      process.exit(EXIT_SANDBOX_DENIED);
    }
    throw err;
  }
}

module.exports = { launchBrowser, EXIT_SANDBOX_DENIED, SANDBOX_HINT };
