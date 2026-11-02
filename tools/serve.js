#!/usr/bin/env node
// Zero-dependency static server for development and tests.
//   node tools/serve.js [port] [--bind 0.0.0.0]
// Serves the repository root so /app/, /dev/ and /spike/ are all reachable.
// Correct MIME types for .webmanifest and .wasm matter: the manifest must be
// application/manifest+json for install, and the wasm must be
// application/wasm for streaming compilation.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const port = Number(args.find((a) => /^\d+$/.test(a)) || process.env.PORT || 8080);
const bindIdx = args.indexOf('--bind');
const host = bindIdx >= 0 ? args[bindIdx + 1] : '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.md': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

export function createServer(root = ROOT) {
  return http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    let rel = decodeURIComponent(url.pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.normalize(path.join(root, rel));
    if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) {
        if (!err && st.isDirectory()) { res.writeHead(301, { Location: url.pathname + '/' }); res.end(); return; }
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 ' + rel);
        return;
      }
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'Content-Length': st.size,
        'Cache-Control': 'no-cache',
        // Service workers are allowed at ./sw.js scope ./ by default; nothing else needed.
      });
      fs.createReadStream(file).pipe(res);
    });
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createServer();
  server.listen(port, host, () => {
    console.log(`Modem Warfare dev server: http://${host}:${port}/app/  (harness: /dev/harness.html, spike: /spike/)`);
  });
}
