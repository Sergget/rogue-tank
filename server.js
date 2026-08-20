// Local dev/test server for the Rogue Tank prototypes. Zero-dependency: serves the project
// directory over plain HTTP via Node's built-in `http` + `fs`. Essential because tank_mvp.html
// fetches tank_list.json and both prototypes load js/tank_paint.js — neither works over file://.
//
// Usage:
//   node server.js            -> http://localhost:8000/  (default)
//   PORT=9000 node server.js  -> http://localhost:9000/
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 8000;
const HOST = process.env.HOST || '127.0.0.1';

// ---------- 一型一文件内容目录（tanks / cards / bosses 同款 API） ----------
const CONTENT_DIRS = {
  '/api/tanks': path.join(ROOT, 'tanks'),
  '/api/cards': path.join(ROOT, 'cards'),
  '/api/bosses': path.join(ROOT, 'bosses'),
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.mjs':  'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.map':  'application/json'
};

// ---------- 一型一文件 API：GET 聚合 / POST·PUT 写 / DELETE 删 ----------
// GET    /api/<dir>           → 聚合 <dir>/*.json 为 { id → spec }（文件名排序，确定性输出）
// POST·PUT /api/<dir>/<id>    → 写单个文件（原子写：临时文件 + 改名）
// DELETE /api/<dir>/<id>      → 删除单个文件

function dirIdFromPath(urlPath, prefix){
  if (urlPath === prefix) return null;
  if (!urlPath.startsWith(prefix + '/')) return undefined;
  const id = decodeURIComponent(urlPath.slice(prefix.length + 1));
  // 防路径穿越/非法文件名：id 不得含路径分隔符或相对路径片段
  if (id === '' || id.includes('/') || id.includes('\\') || id.includes('..')) return null;
  return id;
}

function readAllFromDir(dir){
  const out = {};
  if (!fs.existsSync(dir)) return out;
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort();
  for (const f of files) {
    try {
      const spec = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      out[spec.id || f.slice(0, -5)] = spec;
    } catch (err) {
      console.error(`读取 ${f} 失败: ${err.message}`);
    }
  }
  return out;
}

function readBody(req, res, onDone){
  let body = '';
  const MAX_SIZE = 2 * 1024 * 1024; // 2MB limit
  let limitExceeded = false;
  req.on('data', chunk => {
    if (limitExceeded) return;
    if (body.length + chunk.length > MAX_SIZE) {
      limitExceeded = true;
      body = '';
      res.writeHead(413, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: false, error: 'Request body exceeds size limit of 2MB' }));
      req.resume();
      return;
    }
    body += chunk;
  });
  req.on('end', () => {
    if (!limitExceeded) onDone(body);
  });
}

// 处理单个一型一文件目录的 API 请求；返回 true 表示已处理（不再落到静态文件分支）
function handleContentApi(req, res, urlPath, prefix, dir){
  // GET /api/<dir> — 聚合读取
  if (req.method === 'GET' && urlPath === prefix) {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(readAllFromDir(dir), null, 2));
    return true;
  }

  const id = dirIdFromPath(urlPath, prefix);
  if (id === undefined) return false;

  if (id === null) {
    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ success: false, error: 'Invalid id' }));
    return true;
  }

  const file = path.join(dir, id + '.json');

  // POST/PUT /api/<dir>/<id> — 写单个文件（原子写）
  if (req.method === 'POST' || req.method === 'PUT') {
    readBody(req, res, body => {
      try {
        const spec = JSON.parse(body); // Validate JSON
        if (spec.id !== undefined && spec.id !== id) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ success: false, error: `body.id (${spec.id}) 与路径 id (${id}) 不一致` }));
          return;
        }
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const tmp = file + '.tmp';
        fs.writeFileSync(tmp, body, 'utf8');
        fs.renameSync(tmp, file);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: true, message: `${path.basename(dir)}/${id}.json saved` }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: false, error: 'Invalid JSON or write failed: ' + err.message }));
      }
    });
    return true;
  }

  // DELETE /api/<dir>/<id> — 删除单个文件
  if (req.method === 'DELETE') {
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: true, message: `${path.basename(dir)}/${id}.json deleted` }));
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: false, error: `${path.basename(dir)}/${id}.json not found` }));
    }
    return true;
  }

  return true;
}

const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const urlPath = decodeURIComponent(parsedUrl.pathname);

  // 一型一文件内容 API（tanks/cards/bosses）
  for (const prefix in CONTENT_DIRS) {
    if (handleContentApi(req, res, urlPath, prefix, CONTENT_DIRS[prefix])) return;
  }

  // Basic hygiene: only GET/HEAD. Everything else is 405.
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'Allow': 'GET, HEAD, POST, PUT, DELETE' });
    res.end();
    return;
  }
  let filePath = path.normalize(path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('403 Forbidden');
    return;
  }

  fs.stat(filePath, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream' };
    // Always fresh during dev: without explicit cache-control the browser may serve a stale copy of
    // the JS modules (e.g. tank_physics.js), which shows old (unfixed) behavior after editing.
    headers['Cache-Control'] = 'no-store';
    headers['Pragma'] = 'no-cache';
    headers['Expires'] = '0';
    res.writeHead(200, headers);
    if (req.method === 'HEAD') { res.end(); return; }
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, HOST, () => {
  console.log('Rogue Tank dev server');
  console.log(`  → http://${HOST}:${PORT}/                (index.html 首页)`);
  console.log(`  → http://${HOST}:${PORT}/tank_mvp.html    (正式游戏)`);
  console.log(`  → http://${HOST}:${PORT}/tank_bench.html  (装甲测试台)`);
  console.log(`  → http://${HOST}:${PORT}/tank_designer.html (坦克设计器)`);
  console.log(`  → http://${HOST}:${PORT}/tank_compare.html  (坦克对比)`);
  console.log(`  → content dirs (一型一文件): ${Object.keys(CONTENT_DIRS).join(', ')}`);
});
