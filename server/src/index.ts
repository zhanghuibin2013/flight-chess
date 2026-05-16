// 防控作战飞行棋 server entrypoint.
// In dev: just runs Socket.IO on PORT. In prod: also serves the built web/dist.

import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import url from 'node:url';
import { Server as IOServer } from 'socket.io';
import type { QuestionRow } from '@fkzz/shared';

import { RoomRegistry } from './rooms.js';
import { bindHandlers } from './net/handlers.js';

const PORT = Number(process.env.PORT ?? 3001);
const __filename = url.fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// data/questions.json lives at workspace root.
function loadQuestions(): QuestionRow[] {
  // Try several plausible paths (dev vs built).
  const candidates = [
    path.resolve(__dirname, '../../data/questions.json'),
    path.resolve(__dirname, '../../../data/questions.json'),
    path.resolve(process.cwd(), 'data/questions.json'),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        const text = fs.readFileSync(p, 'utf8');
        const data = JSON.parse(text);
        if (Array.isArray(data)) return data as QuestionRow[];
      }
    } catch (e) {
      console.warn(`failed to read ${p}:`, (e as Error).message);
    }
  }
  return [];
}

// Serve web/dist if present (production).
const webDist = path.resolve(__dirname, '../../web/dist');

const httpServer = http.createServer((req, res) => {
  if (!req.url) { res.statusCode = 400; res.end(); return; }
  if (req.url === '/healthz') { res.end('ok'); return; }
  if (!fs.existsSync(webDist)) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('Web build not present. Run "npm run build" or use the dev server.');
    return;
  }
  let p = req.url.split('?')[0]!;
  if (p === '/') p = '/index.html';
  const filePath = path.join(webDist, p);
  if (!filePath.startsWith(webDist)) { res.statusCode = 403; res.end(); return; }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      // SPA fallback to index.html
      fs.readFile(path.join(webDist, 'index.html'), (e2, idx) => {
        if (e2) { res.statusCode = 404; res.end('not found'); return; }
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(idx);
      });
      return;
    }
    const ext = path.extname(filePath);
    const ct: Record<string, string> = {
      '.html': 'text/html; charset=utf-8',
      '.js':   'application/javascript; charset=utf-8',
      '.css':  'text/css; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.svg':  'image/svg+xml',
      '.png':  'image/png',
      '.jpg':  'image/jpeg',
      '.jpeg': 'image/jpeg',
    };
    res.setHeader('Content-Type', ct[ext] ?? 'application/octet-stream');
    res.end(data);
  });
});

const io = new IOServer(httpServer, {
  cors: { origin: '*' },
});

const registry = new RoomRegistry();
let questions = loadQuestions();
console.log(`[server] loaded ${questions.length} Q&A rows`);

bindHandlers(io, registry, () => questions);

httpServer.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
});
