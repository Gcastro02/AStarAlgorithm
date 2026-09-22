/* ============================================================================
 * dev-server.js — OPTIONAL. Not needed to view the demo.
 *
 * The demo is plain HTML/CSS/JS with no build step: open index.html directly
 * in a browser and it works. This tiny static server exists only because some
 * embedded preview panes and editor integrations refuse to load relative paths
 * from file:// URLs.
 *
 *   node tools/dev-server.js [rootDir] [port]
 * ==========================================================================*/

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const PORT = Number(process.argv[3] || 5173);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.md': 'text/plain; charset=utf-8',
};

http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  const file = path.resolve(ROOT, rel);

  if (!file.startsWith(ROOT)) {
    res.writeHead(403).end('forbidden');
    return;
  }

  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('not found: ' + rel);
      return;
    }
    res.writeHead(200, {
      'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'cache-control': 'no-store',
    }).end(data);
  });
}).listen(PORT, () => console.log(`dev server on http://localhost:${PORT} serving ${ROOT}`));
