#!/usr/bin/env node
// gen-covers.mjs — 地图元素贴图「出图索引层」（受管 API / mock 程序化）
//
// 定位：把 `tools/cover-gen-prompts.md` 里的 prompt 直接投给托管出图 API，产出
// `tmp/covers-src/<key>.png` 供 `scripts/prepare_covers.py` 缩放到名义尺寸、清底、
// PNG-8 量化后落到 `assets/`。**本脚本不做像素后处理**，那条链仍归 prepare_covers.py。
//
// 为什么不让 AI 直接出 24×18：模型画不出这个尺度的细节（cover-gen-prompts.md §3），
// 一律按 ≥1024px 长边出图，再由 PIL 等比缩到名义尺寸。
//
// 凭据（只由本脚本在运行时读取，绝不打印、绝不写入任何其它文件）：
//   - 优先从进程环境读；缺失时用 `process.loadEnvFile('<repo>/.env')` 读仓库根 `.env`
//   - 键名见 tools/cover-gen-prompts.json → providers.<p>.envKeys
//   - 任何报错信息都会过 maskSecrets() 掩码（形如 abcd...wxyz）后才输出
//
// 用法：
//   node tools/gen-covers.mjs --provider mock --force          # 不出网，用仓库 bake 代码出图，验证整条链
//   node tools/gen-covers.mjs --provider gemini                # 真正调用（需 GEMINI_API_KEY）
//   node tools/gen-covers.mjs --provider replicate --only tree,tree_canopy
//   node tools/gen-covers.mjs --dry                            # 只打印将要发什么，不发请求
//
// 退出码：0 全部成功（或 --dry）；1 有失败。

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const MD_PATH = path.join(ROOT, 'tools', 'cover-gen-prompts.md');
const SPEC_PATH = path.join(ROOT, 'tools', 'cover-gen-prompts.json');

// ---------- 凭据：只在运行时读，永不回显 ----------
function loadEnvFile() {
  const p = path.join(ROOT, '.env');
  if (!fs.existsSync(p)) return false;
  try {
    process.loadEnvFile(p);   // Node ≥ 20.12 内置；不解析、不打印
    return true;
  } catch {
    return false;
  }
}

function maskSecret(s) {
  if (!s) return '<empty>';
  if (s.length <= 8) return '*'.repeat(s.length);
  return `${s.slice(0, 4)}...${s.slice(-4)}`;
}

// 报错文本里若混进凭据（部分 SDK 会把 header 回显），统一掩码后再输出
function sanitize(msg, secrets) {
  let out = String(msg == null ? '' : msg);
  for (const s of secrets) if (s && out.includes(s)) out = out.split(s).join(maskSecret(s));
  return out;
}

// ---------- 参数 ----------
function parseArgs(argv) {
  const o = { provider: 'mock', model: '', only: null, force: false, dry: false,
              variants: 1, out: 'tmp/covers-src' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--provider') o.provider = argv[++i];
    else if (a === '--model') o.model = argv[++i];
    else if (a === '--only') o.only = argv[++i].split(',').map(s => s.trim()).filter(Boolean);
    else if (a === '--variants') o.variants = Math.max(1, Number(argv[++i]) || 1);
    else if (a === '--out') o.out = argv[++i];
    else if (a === '--force') o.force = true;
    else if (a === '--dry') o.dry = true;
    else if (a === '-h' || a === '--help') { printHelp(); process.exit(0); }
    else { console.error(`未知参数：${a}`); printHelp(); process.exit(2); }
  }
  return o;
}

function printHelp() {
  console.log(`用法：node tools/gen-covers.mjs [选项]

  --provider <mock|gemini|replicate|openai>  出图后端（默认 mock，不出网）
  --model <id>                              覆盖默认模型
  --only key1,key2                          只生成指定 key
  --variants N                              每个 key 出 N 张（v2+ 存为 <key>_v2.png）
  --out <dir>                               输出目录（默认 tmp/covers-src）
  --force                                   已存在的文件也重出
  --dry                                     只打印请求摘要，不发请求

凭据：GEMINI_API_KEY / REPLICATE_API_TOKEN / OPENAI_API_KEY（或统一的 COVER_API_KEY），
      优先取进程环境，其次读仓库根 .env（只由本脚本读取，不打印）。`);
}

// ---------- prompt 解析（唯一的 prompt 正文在 md 里） ----------
function readPrompts() {
  const md = fs.readFileSync(MD_PATH, 'utf8');
  const styleBlock = extractFenceAfter(md, /^## 1\./m);
  const negativeBlock = extractFenceAfter(md, /^## 2\./m);
  if (!styleBlock) throw new Error('未能从 cover-gen-prompts.md §1 解析全局风格前缀代码块');

  const items = new Map();
  // 按 `### Pn` 标题切片（不用前瞻正则：`\s*$` 在多行模式下会立刻命中行尾）
  const heads = [...md.matchAll(/^### (P\d+)[^\n]*$/gm)];
  for (let i = 0; i < heads.length; i++) {
    const id = heads[i][1];
    const from = heads[i].index + heads[i][0].length;
    const to = i + 1 < heads.length ? heads[i + 1].index : md.length;
    const body = md.slice(from, to);
    const fence = body.match(/```[^\n]*\n([\s\S]*?)```/);
    if (!fence) continue;
    const item = fence[1].trim();
    const prompt = item.includes('[STYLE]')
      ? item.replace('[STYLE]', styleBlock.trim())
      : `${styleBlock.trim()}\n${item}`;
    items.set(id, prompt);
  }
  if (items.size < 10) throw new Error(`prompt 解析不完整：只解析到 ${items.size} 条（应为 10）`);
  return { items, negative: (negativeBlock || '').trim() };
}

function extractFenceAfter(md, headingRe) {
  const h = md.search(headingRe);
  if (h < 0) return '';
  const rest = md.slice(h);
  const fence = rest.match(/```[^\n]*\n([\s\S]*?)```/);
  return fence ? fence[1] : '';
}

// ---------- 后端适配 ----------
const sleep = ms => new Promise(r => setTimeout(r, ms));

// 运行时基准（画布尺寸 + 画布内锚点）：单一来源 tools/cover-refs.json
function loadRefs() {
  const p = path.join(ROOT, 'tools', 'cover-refs.json');
  if (!fs.existsSync(p)) throw new Error('缺少 tools/cover-refs.json —— 先运行 node tools/dump-cover-refs.mjs');
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

// 出图分辨率：保持最终画布宽高比，最长边 = longest（模型画不出 24×18 这个尺度的细节）
function genSizeFor(canvas, longest) {
  const [w, h] = canvas;
  const s = longest / Math.max(w, h);
  return [Math.max(64, Math.round(w * s)), Math.max(64, Math.round(h * s))];
}

// 托管 API 大多只接受离散宽高比，取最接近的一档
const ASPECTS = [[1, 1], [3, 2], [4, 3], [16, 9], [2, 1], [3, 1], [4, 1]];
function nearestAspect(ar) {
  let best = ASPECTS[0], bestErr = Infinity;
  for (const [a, b] of ASPECTS) {
    const err = Math.abs(Math.log((a / b) / ar));
    if (err < bestErr) { bestErr = err; best = [a, b]; }
  }
  return `${best[0]}:${best[1]}`;
}

async function postJSON(url, headers, body, timeoutMs) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs || 180000);
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: Object.assign({ 'content-type': 'application/json' }, headers),
      body: JSON.stringify(body),
      signal: ac.signal
    });
    const text = await r.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* 非 JSON 响应原样保留到错误信息 */ }
    if (!r.ok) {
      const detail = json ? (json.error && (json.error.message || json.error) || json) : text.slice(0, 400);
      throw new Error(`${r.status} ${r.statusText}: ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 400)}`);
    }
    return json;
  } finally {
    clearTimeout(t);
  }
}

function decodeB64(b64) {
  return Buffer.from(b64, 'base64');
}

const PROVIDERS = {
  async gemini({ prompt, negative, model, aspect, apiKey, secrets }) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    const text = negative ? `${prompt}\n\nAvoid: ${negative}` : prompt;
    const json = await postJSON(url, { 'x-goog-api-key': apiKey }, {
      contents: [{ parts: [{ text }] }],
      generationConfig: {
        responseModalities: ['IMAGE'],
        imageConfig: { aspectRatio: aspect }
      }
    });
    void secrets;
    const parts = (((json.candidates || [])[0] || {}).content || {}).parts || [];
    const inline = parts.find(p => p.inlineData || p.inline_data);
    if (!inline) {
      const reason = (json.candidates || [])[0] && (json.candidates[0].finishReason || '');
      const block = json.promptFeedback && json.promptFeedback.blockReason;
      throw new Error(`响应里没有图片${reason ? `（finishReason=${reason}）` : ''}${block ? `（blockReason=${block}）` : ''}`);
    }
    const d = inline.inlineData || inline.inline_data;
    return { bytes: decodeB64(d.data), ext: (d.mimeType || d.mime_type || 'image/png').includes('jpeg') ? 'jpg' : 'png' };
  },

  async replicate({ prompt, negative, model, aspect, apiKey }) {
    // 模型 id 形如 owner/name；aspect 映射为常见参数名（不同模型叫法不同，两个都带）
    const [owner, name] = model.split('/');
    if (!owner || !name) throw new Error('replicate 的 --model 需形如 owner/name');
    const url = `https://api.replicate.com/v1/models/${owner}/${name}/predictions`;
    const headers = { authorization: `Bearer ${apiKey}`, prefer: 'wait' };
    const input = {
      prompt: negative ? `${prompt}\n\nAvoid: ${negative}` : prompt,
      aspect_ratio: aspect,
      output_format: 'png',
      num_outputs: 1
    };
    let json = await postJSON(url, headers, { input });
    const deadline = Date.now() + 240000;
    while (json && (json.status === 'starting' || json.status === 'processing')) {
      if (Date.now() > deadline) throw new Error('replicate 轮询超时（4 分钟）');
      await sleep(2000);
      json = await (await fetch(json.urls.get, { headers: { authorization: `Bearer ${apiKey}` } })).json();
    }
    if (!json || json.status !== 'succeeded') throw new Error(`replicate 状态 ${json && json.status}: ${json && json.error}`);
    const out = Array.isArray(json.output) ? json.output[0] : json.output;
    if (!out) throw new Error('replicate 未返回输出 URL');
    const r = await fetch(out);
    if (!r.ok) throw new Error(`下载产物失败 ${r.status}`);
    return { bytes: Buffer.from(await r.arrayBuffer()), ext: 'png' };
  },

  async openai({ prompt, negative, model, apiKey }) {
    const text = negative ? `${prompt}\n\nAvoid: ${negative}` : prompt;
    const json = await postJSON('https://api.openai.com/v1/images/generations',
      { authorization: `Bearer ${apiKey}` },
      { model, prompt: text, size: '1024x1024', background: 'transparent', output_format: 'png', n: 1 });
    const item = (json.data || [])[0];
    if (!item) throw new Error('openai 响应里没有图片');
    if (item.b64_json) return { bytes: decodeB64(item.b64_json), ext: 'png' };
    const r = await fetch(item.url);
    if (!r.ok) throw new Error(`下载产物失败 ${r.status}`);
    return { bytes: Buffer.from(await r.arrayBuffer()), ext: 'png' };
  },

  // 不出网：用仓库自己的**离屏烘焙结果**出图（与游戏内回退视觉逐像素同源），
  // 用于验证「出图 → prepare_covers → assets → 游戏渲染」整条链路而不花一分钱。
  //
  // 关键：bake 函数按传入的 w/h 画图（树冠半径 R = max(w,h)*1.4 等），几何**依赖
  // 名义尺寸**。所以必须先在名义尺寸下烘焙（bakeAssetCanvas），再把成品整体放大到
  // 出图分辨率——直接拿 1024 当 w/h 会发现树冠半径被放大成 1.4×1024，比例全错。
  async mock({ key, spec, layer }) {
    const { createMiniCanvas } = await import('../scripts/lib/mini-canvas.js');
    globalThis.document = { createElement: t => (t === 'canvas' ? createMiniCanvas(32, 32) : null) };
    globalThis.Image = function () { this.src = ''; };
    globalThis.performance = { now: () => 0 };
    globalThis.RULES = (await import('../js/tank_rules.js')).default.RULES;
    const U = (await import('../js/tank_utils.js')).default;
    Object.assign(globalThis, U);
    globalThis.TAU = U.TAU;
    Object.assign(globalThis, (await import('../js/tank_geometry.js')).default);
    Object.assign(globalThis, (await import('../js/tank_cover.js')).default);
    const A = (await import('../js/tank_assets.js')).default;
    const def = A.ASSET_DEFS[key];
    const spr = A.bakeAssetCanvas(key, def.w, def.h, layer);
    if (!spr) throw new Error(`烘焙失败：${key}/${layer}`);

    // 放大到出图分辨率：缩放比按基准画布宽算（保持宽高比，等比放大烘焙精灵）
    const K = spec.genSize[0] / Math.max(1, spec.canvas[0]);
    const dw = Math.round(spr.canvas.width * K);
    const dh = Math.round(spr.canvas.height * K);
    const out = createMiniCanvas(dw, dh);
    const octx = out.getContext('2d');
    octx.imageSmoothingEnabled = false;
    // 逐像素最近邻放大（mini-canvas 的 drawImage 已支持缩放；这里显式走它便于测试）
    octx.drawImage(spr.canvas, 0, 0, spr.canvas.width, spr.canvas.height, 0, 0, dw, dh);
    return { bytes: out.toPNGBuffer(), ext: 'png' };
  }
};

// ---------- 主流程 ----------
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const spec = JSON.parse(fs.readFileSync(SPEC_PATH, 'utf8'));
  const refs = loadRefs();
  const { items, negative } = readPrompts();
  // 每个 key 的最终画布尺寸 / 锚点 / 出图宽高比全部从运行时基准派生
  for (const a of spec.assets) {
    const r = refs.assets[a.key];
    if (!r) throw new Error(`tools/cover-refs.json 缺少 ${a.key}（先运行 node tools/dump-cover-refs.mjs）`);
    a.canvas = r.canvas.slice();
    a.anchor = r.anchor.slice();
    a.longest = a.generateLongest || 1024;
    a.genSize = genSizeFor(r.canvas, a.longest);
    a.aspect = nearestAspect(r.canvas[0] / r.canvas[1]);
  }

  const provCfg = spec.providers[args.provider];
  if (!provCfg) { console.error(`未知 provider：${args.provider}`); process.exit(2); }
  const model = args.model || provCfg.defaultModel;

  // 凭据解析（只存在于本进程内存；不打印）
  const envLoaded = loadEnvFile();
  const secrets = [];
  let apiKey = null;
  for (const name of provCfg.envKeys) {
    const v = process.env[name];
    if (v) { apiKey = v; secrets.push(v); }
  }
  const needsKey = args.provider !== 'mock';
  if (needsKey && !apiKey && !args.dry) {
    console.error(`缺少凭据：${provCfg.envKeys.join(' 或 ')} 未设置` +
      `${envLoaded ? '（已尝试读取 .env）' : '（仓库根无 .env）'}`);
    console.error('请写入仓库根 .env（该文件已被 .gitignore 排除），或先跑 --provider mock 验证链路。');
    process.exit(1);
  }

  const outDir = path.isAbsolute(args.out) ? args.out : path.join(ROOT, args.out);
  fs.mkdirSync(outDir, { recursive: true });

  const assets = spec.assets.filter(a => !args.only || args.only.includes(a.key));
  if (!assets.length) { console.error('--only 未匹配到任何 key'); process.exit(2); }

  console.log(`provider=${args.provider} model=${model} out=${path.relative(ROOT, outDir)} ` +
              `keys=${assets.length} variants=${args.variants}` +
              (needsKey ? ` key=${apiKey ? maskSecret(apiKey) : '<未设置：--dry 不发送请求>'}` : ''));
  if (args.dry) {
    for (const a of assets) {
      const prompt = items.get(a.prompt);
      console.log(`\n[${a.key}] prompt=${a.prompt} canvas=${a.canvas.join('x')} ` +
        `gen=${a.genSize.join('x')} aspect=${a.aspect} anchor=(${a.anchor.join(', ')})`);
      console.log(prompt.split('\n').map(l => '  ' + l).join('\n'));
    }
    console.log('\n--dry：未发送任何请求。');
    return 0;
  }

  let failed = 0;
  const t0 = Date.now();
  for (const a of assets) {
    const layer = a.key.endsWith('_canopy') ? 'canopy' : 'base';
    // canopy 的 bake 函数挂在「基础 key」上（如 bush_canopy → ASSET_DEFS.bush.bakeCanopy）
    const baseKey = layer === 'canopy' ? a.key.slice(0, -'_canopy'.length) : a.key;
    const prompt = items.get(a.prompt);
    for (let v = 1; v <= args.variants; v++) {
      const file = v === 1 ? `${a.key}.png` : `${a.key}_v${v}.png`;
      const dst = path.join(outDir, file);
      if (!args.force && fs.existsSync(dst)) { console.log(`- ${file} 已存在（--force 可覆盖）`); continue; }
      const started = Date.now();
      try {
        const res = await PROVIDERS[args.provider]({
          key: baseKey, spec: a, layer, prompt, negative, model, aspect: a.aspect, apiKey, secrets
        });
        fs.writeFileSync(dst, res.bytes);
        console.log(`✓ ${file}  ${(res.bytes.length / 1024).toFixed(1)}K  ${Date.now() - started}ms`);
      } catch (e) {
        failed++;
        console.error(`✗ ${file}  ${sanitize(e && e.message, secrets)}`);
      }
    }
  }
  console.log(`\n完成：${assets.length - failed}/${assets.length} 个 key 成功，耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  if (failed) console.error('下一步：修复失败项后重跑；成功项可运行 scripts/prepare_covers.py --inplace 落盘。');
  else console.log('下一步：PYTHONPATH="$PWD/tmp/pylibs" python scripts/prepare_covers.py --dry → 确认后加 --inplace');
  return failed ? 1 : 0;
}

main().then(code => process.exit(code)).catch(e => {
  console.error('致命错误：' + (e && e.message ? e.message : e));
  process.exit(1);
});
