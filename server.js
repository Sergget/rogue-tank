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

const server = http.createServer((req, res) => {
  // Basic hygiene: only GET/HEAD. Everything else is 405.
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'Allow': 'GET, HEAD' });
    res.end();
    return;
  }

  // Resolve the requested path safely inside ROOT (block path traversal / dir escapes).
  const urlPath = decodeURIComponent(new URL(req.url, `http://${req.headers.host || 'localhost'}`).pathname);
  let filePath = path.normalize(path.join(ROOT, urlPath === '/' ? 'tank_mvp.html' : urlPath));
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
    if (ext === '.html') headers['Cache-Control'] = 'no-store'; // always fresh during dev
    res.writeHead(200, headers);
    if (req.method === 'HEAD') { res.end(); return; }
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, HOST, () => {
  console.log('Rogue Tank dev server');
  console.log(`  → http://${HOST}:${PORT}/            (tank_mvp.html)`);
  console.log(`  → http://${HOST}:${PORT}/tank_designer.html`);
  console.log(`  → tank_list.json + js/tank_paint.js served from project root`);
});