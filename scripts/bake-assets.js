#!/usr/bin/env node
// bake-assets.js — Node 环境一键批量烘焙 assets/ 贴图（P-26 / DEVELOPMENT.md §2.10）。
// 用 playwright（可选工具链依赖）+ 系统 Edge 加载 tools/bake.html 执行导出逻辑，把 PNG 写到 assets/。
// playwright 未安装时降级：提示改用 tools/bake.html 手动烘焙后退出（不 crash）。
// CLI：node scripts/bake-assets.js [--force] （--force 全量重烘焙，跳过已存在文件默认跳过）
// 输出每个资产的路径与大小；退出码 0/1
'use strict';

const fs = require('fs');
const path = require('path');

// playwright 是可选工具链依赖（驱动系统 Edge 无头烘焙）。以运行时字符串动态 require：
// ① 未安装时捕获异常并降级（见 main() 开头），不 crash；
// ② 模块说明符不在编译期字面量位置，tsc 不做静态模块解析——typecheck 不再报 TS2307。
function tryRequire(name) {
  try {
    return require(name);
  } catch (e) {
    return null;
  }
}
const playwright = tryRequire('playwright');
const msedge = playwright ? playwright.executablePath() : null; // 依赖系统已装 Edge (msedge channel)

// ── 配置 ────────────────────────────────────────────────────────────────────
const ROOT = path.join(__dirname, '..');
const ASSET_DEFS_PATH = path.join(ROOT, 'js', 'tank_assets.js');
const HTML_PATH = path.join(ROOT, 'tools', 'bake.html');
const ASSETS_DIR = path.join(ROOT, 'assets');

// 从 js/tank_assets.js 里提取 ASSET_DEFS 的 key 列表
function extractAssetDefKeys() {
  const src = fs.readFileSync(ASSET_DEFS_PATH, 'utf8');
  // 匹配 const ASSET_DEFS = { ... } 块中的键名
  const keys = [];
  const matches = src.match(/^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:/m);
  if (matches) {
    // 逐行/逐块提取键名 - 更健壮的方法
    const block = src;
    const keyRegex = /^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:/gm;
    let m;
    while ((m = keyRegex.exec(block)) !== null) {
      // 检查紧随其后是否是 {，表示这是一个对象键
      const idx = m.index + m[0].length;
      if (block[idx] && block[idx] === '{') {
        keys.push(m[1]);
      }
    }
  }
  return keys;
}

// 获取所有需要导出的 key（含 canopy 层信息）
function getExportKeys() {
  const keys = extractAssetDefKeys();
  return keys;
}

// 检查文件是否存在
function fileExists(p) {
  return fs.existsSync(p);
}

// ── 主逻辑 ─────────────────────────────────────────────────────────────────
async function main() {
  const force = process.argv.includes('--force');

  // playwright 缺失（可选依赖）时降级：清晰提示后退出，不 crash。
  if (!playwright) {
    console.error('✗ 未安装 playwright 模块（可选工具链依赖，用于驱动系统 Edge 烘焙）。');
    console.error('  跳过命令行浏览器导出；请改用 tools/bake.html 手动烘焙，');
    console.error('  或安装 playwright 后重试：node scripts/bake-assets.js [--force]');
    process.exit(1);
  }

  // 提取 ASSET_DEFS 以知道要导出哪些资产
  let assetDefKeys;
  try {
    assetDefKeys = extractAssetDefKeys();
  } catch (e) {
    console.error('✗ 无法读取 ASSET_DEFS:', e.message);
    process.exit(1);
  }

  const keys = assetDefKeys;
  console.log(`发现 ${keys.length} 个资产档位需要烘焙`);

  // 启动 playwright browser (系统 Edge)
  const browser = await playwright.chromium.launch({
    executablePath: msedge,
    headless: 'new'
  });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();

  // 结果追踪
  let successCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  const details = [];

  // 等待 bake.html 加载完成（它会在 onload 里调用 bakeAll()）
  console.log('正在加载烘焙页面...');
  await page.goto('file://' + HTML_PATH, { waitUntil: 'networkidle' });
  await page.waitForSelector('#grid', { state: 'visible', timeout: 10000 });
  console.log('页面加载完成，开始逐资产导出...');

  // 对于每个 key，在页面上下文中 bake 并导出 PNG
  for (const key of keys) {
    const def = require('vm').runInNewContext(
      // 我们通过 evaluate 来访问页面上的 ASSET_DEFS
      ``,
      { ASSET_DEFS: null } // placeholder
    );
    // 直接用 page.evaluate 访问全局 ASSET_DEFS
    const pageDefs = await page.evaluate(() => ASSET_DEFS);
    if (!pageDefs[key]) {
      console.log(`  ⚡ 跳过 ${key}: ASSET_DEFS 中无此键`);
      errorCount++;
      details.push({ key, status: 'skipped', reason: 'not in ASSET_DEFS' });
      continue;
    }

    const pageDef = pageDefs[key];
    const w = pageDef.w, h = pageDef.h;

    // 尝试导出 base.png
    try {
      // 检查文件是否已存在且不需要 --force
      const baseName = key + '.png';
      const basePath = path.join(ASSETS_DIR, baseName);

      if (!force && fileExists(basePath)) {
        console.log(`  ↷ 跳过 ${key} base (已存在): ${baseName}`);
        skippedCount++;
        details.push({ key, filename: baseName, status: 'skipped', outPath: basePath });
        // 仍然确保 canopy 也检查
        if (pageDef.bakeCanopy) {
          const canopyName = key + '_canopy.png';
          const canopyPath = path.join(ASSETS_DIR, canopyName);
          if (!force && fileExists(canopyPath)) {
            console.log(`  ↷ 跳过 ${key} canopy (已存在): ${canopyName}`);
            skippedCount++;
            details.push({ key, filename: canopyName, status: 'skipped', outPath: canopyPath });
          }
        }
        continue;
      }

      // 在页面上下文中 bake：调用 bakeAssetCanvas 并取 toDataURL
      console.log(`  → 正在导出 ${key} base...`);
      const baseDataURL = await page.evaluate((k, w, h) => {
        const d = ASSET_DEFS[k];
        if (!d) return null;
        const spr = bakeAssetCanvas(k, w, h, 'base');
        if (!spr) return null;
        return spr.canvas.toDataURL('image/png');
      }, key, w, h);

      if (baseDataURL && baseDataURL.startsWith('data:image/png')) {
        // Node 解码 dataURL 并写文件
        const base64Data = baseDataURL.replace(/^data:image\/png;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        if (!fs.existsSync(ASSETS_DIR)) {
          fs.mkdirSync(ASSETS_DIR, { recursive: true });
        }
        fs.writeFileSync(basePath, buffer);
        console.log(`    ✓ 已写入 ${basePath} (${buffer.byteLength} bytes)`);
        successCount++;
        details.push({ key, filename: baseName, status: 'ok', outPath: basePath, sizeBytes: buffer.byteLength });

        // 同理导出 canopy 如果有
        if (pageDef.bakeCanopy) {
          const canopyDataURL = await page.evaluate((k, w, h) => {
            const d = ASSET_DEFS[k];
            if (!d || !d.bakeCanopy) return null;
            const spr = bakeAssetCanvas(k, w, h, 'canopy');
            if (!spr) return null;
            return spr.canvas.toDataURL('image/png');
          }, key, w, h);

          if (canopyDataURL && canopyDataURL.startsWith('data:image/png')) {
            var canopyName = key + '_canopy.png';
            const canopyPath = path.join(ASSETS_DIR, canopyName);
            const canopy64Data = canopyDataURL.replace(/^data:image\/png;base64,/, '');
            const canopyBuffer = Buffer.from(canopy64Data, 'base64');
            fs.writeFileSync(canopyPath, canopyBuffer);
            console.log(`    ✓ 已写入 ${canopyPath} (${canopyBuffer.byteLength} bytes)`);
            successCount++;
            details.push({ key, filename: canopyName, status: 'ok', outPath: canopyPath, sizeBytes: canopyBuffer.byteLength });
          } else {
            console.log(`    ✗ 导出 ${key} canopy 失败: 无法获取 data URL`);
            errorCount++;
            details.push({ key, filename: canopyName, status: 'error', reason: 'canopy data URL failed' });
          }
        }
      } else {
        console.log(`    ✗ 导出 ${key} base 失败: 无法获取 data URL`);
        errorCount++;
        details.push({ key, filename: baseName, status: 'error', reason: 'base data URL failed' });
      }
    } catch (e) {
      console.error(`  ✗ ${key}: ${e.message}`);
      errorCount++;
      details.push({ key, filename: key + '.png', status: 'error', reason: e.message });
    }
  }

  // 等待一段时间确保所有 IO 完成
  await new Promise(r => setTimeout(r, 1000));

  await browser.close();

  // 汇总
  console.log('\n=== 烘焙结果 ===');
  console.log(`总资产: ${keys.length}`);
  console.log(`成功导出: ${successCount}`);
  console.log(`跳过(已存在): ${skippedCount}`);
  console.log(`错误: ${errorCount}`);

  if (errorCount > 0) {
    console.log('\n详情:');
    for (const d of details) {
      process.stderr.write(`  [${d.status}] ${d.key} - ${d.filename || ''} ${d.reason ? '- ' + d.reason : ''}\n`);
    }
    process.exit(1);
  } else {
    console.log('\n✓ 所有资产烘焙完成');
    process.exit(0);
  }
}

main().catch(e => {
  console.error('✗ 未处理的错误:', e);
  process.exit(1);
});