'use strict';

// 외부에 공개하지 않는 정적 빌드 미리보기 서버.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../docs');
const logoPreviewRoot = path.resolve(__dirname, '../mockups/logo-concepts');
const port = Number(process.env.PORT || 4175);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
http.createServer((req, res) => {
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
