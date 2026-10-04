'use strict';

// 외부에 공개하지 않는 정적 빌드 미리보기 서버.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../docs');
const logoPreviewRoot = path.resolve(__dirname, '../mockups/logo-concepts');
const port = Number(process.env.PORT || 4175);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
// Game detail pages are rendered on request by the Pages Functions in production (functions/_lib/game-route.js);
// the preview runs the same handler with a docs/-backed ASSETS binding.
const GAME_ROUTE = /^(?:\/(ja|zh-cn|ko|zh-tw))?\/games\/([^/.]+)\/?$/;
let gameHandler;
function previewAssets() {
  return {
    async fetch(request) {
      const pathname = decodeURIComponent(new URL(request.url).pathname);
      let file = path.resolve(root, '.' + pathname);
      if (!file.startsWith(root + path.sep)) return new Response('Bad path', { status: 400 });
      for (const candidate of [file, path.join(file, 'index.html'), file + '.html']) {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
          return new Response(fs.readFileSync(candidate), { headers: { 'Content-Type': types[path.extname(candidate)] || 'application/octet-stream' } });
        }
      }
      return new Response('Not found', { status: 404 });
    },
  };
}
async function serveGame(req, res, code) {
  try {
    if (!gameHandler) {
      globalThis.caches = globalThis.caches || { default: { match: async () => undefined, put: async () => {} } };
      gameHandler = (await import(require('node:url').pathToFileURL(path.resolve(__dirname, '../functions/_lib/game-route.js')).href)).handleGameRequest;
    }
    const request = new Request(new URL(req.url, 'http://gamerscroll.com'), { method: req.method, headers: { host: 'gamerscroll.com' } });
    const response = await gameHandler({ request, env: { ASSETS: previewAssets() }, next: async () => new Response('Not found', { status: 404 }) }, code);
    res.writeHead(response.status, { 'Content-Type': response.headers.get('content-type') || 'text/plain', 'Cache-Control': 'no-store' });
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(String(error && error.stack || error));
  }
}
http.createServer((req, res) => {
  const gameRoute = GAME_ROUTE.exec(new URL(req.url, 'http://localhost').pathname);
  if (gameRoute) return serveGame(req, res, gameRoute[1] || 'en');
  let file;
  try {
    const url = new URL(req.url, 'http://localhost');
    const pathname = decodeURIComponent(url.pathname);
    const isLogoPreview = pathname === '/logo-preview' || pathname.startsWith('/logo-preview/');
    const base = isLogoPreview ? logoPreviewRoot : root;
    const relativePath = isLogoPreview ? pathname.slice('/logo-preview'.length) || '/' : pathname;
    file = path.resolve(base, '.' + relativePath);
    if (file !== base && !file.startsWith(base + path.sep)) throw new Error('Invalid path');
    if (fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (isLogoPreview && !['.html', '.svg', '.png'].includes(path.extname(file))) throw new Error('Invalid preview file type');
    if (!fs.statSync(file).isFile()) throw new Error('Not a file');
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('찾을 수 없는 페이지입니다.');
    return;
  }
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
}).listen(port, '127.0.0.1', () => console.log(`Preview: http://127.0.0.1:${port}/`));
