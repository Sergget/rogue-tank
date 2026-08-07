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
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const urlPath = decodeURIComponent(parsedUrl.pathname);

  // Handle API endpoints (POST /api/tank_list or /tank_list.json to update tank_list.json)
  if ((req.method === 'POST' || req.method === 'PUT') && (urlPath === '/api/tank_list' || urlPath === '/tank_list.json')) {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        JSON.parse(body); // Validate JSON
        const targetFile = path.join(ROOT, 'tank_list.json');
        fs.writeFileSync(targetFile, body, 'utf8');
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: true, message: 'tank_list.json updated successfully' }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: false, error: 'Invalid JSON body: ' + err.message }));
      }
    });
    return;
  }

  // Basic hygiene: only GET/HEAD. Everything else is 405.
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'Allow': 'GET, HEAD, POST, PUT' });
    res.end();
    return;
  }
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
  console.log(`  → http://${HOST}:${PORT}/            (tank_mvp.html)`);
  console.log(`  → http://${HOST}:${PORT}/tank_designer.html`);
  console.log(`  → tank_list.json + js/tank_paint.js served from project root`);
});