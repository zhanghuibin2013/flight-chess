// 防空作战飞行棋 server entrypoint.
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

// data/questions.json lives at workspace root. We probe several plausible
// locations (dev vs built layout) and remember the one we actually read /
// will write to, so the admin POST round-trips back to the same file.
const QUESTION_FILE_CANDIDATES = [
  path.resolve(__dirname, '../../data/questions.json'),
  path.resolve(__dirname, '../../../data/questions.json'),
  path.resolve(process.cwd(), 'data/questions.json'),
];

let questionFilePath: string = QUESTION_FILE_CANDIDATES[0]!;

function loadQuestions(): QuestionRow[] {
  for (const p of QUESTION_FILE_CANDIDATES) {
    try {
      if (fs.existsSync(p)) {
        const text = fs.readFileSync(p, 'utf8');
        const data = JSON.parse(text);
        if (Array.isArray(data)) {
          questionFilePath = p;
          return data as QuestionRow[];
        }
      }
    } catch (e) {
      console.warn(`failed to read ${p}:`, (e as Error).message);
    }
  }
  return [];
}

/** Lightweight runtime validation for an incoming question-bank payload. */
function validateQuestions(input: unknown): { ok: true; rows: QuestionRow[] } | { ok: false; error: string } {
  if (!Array.isArray(input)) return { ok: false, error: 'payload must be an array' };
  const rows: QuestionRow[] = [];
  for (let i = 0; i < input.length; i++) {
    const r = input[i] as any;
    if (!r || typeof r !== 'object') return { ok: false, error: `row ${i}: not an object` };
    if (typeof r.id !== 'string' || !r.id) return { ok: false, error: `row ${i}: missing id` };
    if (typeof r.prompt !== 'string' || !r.prompt.trim()) return { ok: false, error: `row ${i}: missing prompt` };
    if (!Array.isArray(r.options) || r.options.length < 2) return { ok: false, error: `row ${i}: at least 2 options required` };
    for (let j = 0; j < r.options.length; j++) {
      if (typeof r.options[j] !== 'string') return { ok: false, error: `row ${i} option ${j}: must be string` };
    }
    const kind = (r.kind === 'multi' || r.kind === 'judge' || r.kind === 'single') ? r.kind : 'single';
    if (kind === 'judge' && r.options.length !== 2) {
      return { ok: false, error: `row ${i}: judge questions need exactly 2 options` };
    }
    if (typeof r.answerIndex !== 'number' || r.answerIndex < 0 || r.answerIndex >= r.options.length) {
      return { ok: false, error: `row ${i}: answerIndex out of range` };
    }
    const row: QuestionRow = {
      id: r.id,
      prompt: r.prompt,
      options: r.options.slice(),
      answerIndex: r.answerIndex,
      kind,
    };
    if (kind === 'multi') {
      if (!Array.isArray(r.answerIndexes) || r.answerIndexes.length < 1) {
        return { ok: false, error: `row ${i}: multi needs answerIndexes[]` };
      }
      const seen = new Set<number>();
      for (const ix of r.answerIndexes) {
        if (typeof ix !== 'number' || ix < 0 || ix >= r.options.length) {
          return { ok: false, error: `row ${i}: answerIndexes contains out-of-range value` };
        }
        seen.add(ix);
      }
      row.answerIndexes = Array.from(seen).sort((a, b) => a - b);
      row.answerIndex = row.answerIndexes[0]!;
    }
    rows.push(row);
  }
  return { ok: true, rows };
}

function saveQuestions(rows: QuestionRow[]): void {
  const dir = path.dirname(questionFilePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(questionFilePath, JSON.stringify(rows, null, 2) + '\n', 'utf8');
}

// Serve web/dist if present (production).
const webDist = path.resolve(__dirname, '../../web/dist');

const httpServer = http.createServer((req, res) => {
  if (!req.url) { res.statusCode = 400; res.end(); return; }
  if (req.url === '/healthz') { res.end('ok'); return; }

  // ---- Admin: question-bank entry API ----
  // GET  /admin/questions  -> current rows
  // POST /admin/questions  -> body is full rows array; persists + reloads.
  if (req.url.split('?')[0] === '/admin/questions') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }
    if (req.method === 'GET') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(questions));
      return;
    }
    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; if (body.length > 2_000_000) { req.destroy(); } });
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          const v = validateQuestions(parsed);
          if (!v.ok) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ ok: false, error: v.error }));
            return;
          }
          saveQuestions(v.rows);
          questions = v.rows;
          console.log(`[server] saved & reloaded ${questions.length} Q&A rows -> ${questionFilePath}`);
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ ok: true, count: questions.length }));
        } catch (e) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ ok: false, error: (e as Error).message }));
        }
      });
      return;
    }
    res.statusCode = 405;
    res.end();
    return;
  }

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

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`[server] listening on http://0.0.0.0:${PORT}`);
});
