// HTTP 서버: 정적 파일, REST API, 실시간 동기화(Server-Sent Events). 외부 의존성 없음.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RoomManager, RoomError } from './rooms.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function startServer({ port = Number(process.env.PORT) || 3000, host = process.env.HOST || '0.0.0.0', dataDir = process.env.DATA_DIR || path.join(ROOT, 'data'), quiet = false } = {}) {
  const streams = new Map(); // roomId → Set(res)
  const say = (...a) => { if (!quiet) console.log(new Date().toISOString(), ...a); };

  const broadcast = (room) => {
    const set = streams.get(room.id);
    if (!set?.size) return;
    const data = `event: state\ndata: ${JSON.stringify(rooms.publicView(room))}\n\n`;
    for (const res of set) res.write(data);
  };
  // 연결 수 변화 등으로 짧은 시간에 여러 번 바뀌면 한 번만 전송
  const pendingBroadcast = new Set();
  const scheduleBroadcast = (room) => {
    if (pendingBroadcast.has(room.id)) return;
    pendingBroadcast.add(room.id);
    setImmediate(() => { pendingBroadcast.delete(room.id); const r = rooms.rooms.get(room.id); if (r) broadcast(r); });
  };
  const rooms = new RoomManager({ dataDir, onChange: scheduleBroadcast });
  say(`방 ${rooms.rooms.size}개 복구${rooms.broken.size ? `, 불러오지 못한 방 ${rooms.broken.size}개` : ''}`);

  // 간단한 요청 제한 (IP별)
  const hits = new Map();
  const limited = (ip, key, max, windowMs) => {
    const k = ip + '|' + key; const now = Date.now();
    const arr = (hits.get(k) || []).filter(t => now - t < windowMs);
    arr.push(now); hits.set(k, arr);
    return arr.length > max;
  };

  const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json' };
  const sendFile = (res, file) => {
    fs.readFile(file, (e, buf) => {
      if (e) { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); return res.end('없는 파일입니다.'); }
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff' });
      res.end(buf);
    });
  };
  const json = (res, status, obj) => {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(JSON.stringify(obj));
  };
  const readBody = (req) => new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > 64 * 1024) { reject(new RoomError('요청이 너무 큽니다.', 413)); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch { reject(new RoomError('잘못된 요청 형식')); } });
    req.on('error', reject);
  });
  const tokenOf = (req, url) => (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || url.searchParams.get('token') || '';
  const ipOf = (req) => (process.env.TRUST_PROXY ? String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() : '') || req.socket.remoteAddress || '?';

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://local');
    const p = url.pathname;
    try {
      if (p === '/healthz') return json(res, 200, { ok: true, rooms: rooms.rooms.size });
      if (p.startsWith('/api/')) {
        const ip = ipOf(req);
        if (limited(ip, 'api', 600, 60e3)) throw new RoomError('요청이 너무 많습니다. 잠시 후 다시 시도하세요.', 429);
        if (p === '/api/rooms' && req.method === 'POST') {
          if (limited(ip, 'create', 20, 3600e3)) throw new RoomError('방을 너무 많이 만들었습니다. 잠시 후 다시 시도하세요.', 429);
          const r = rooms.create(await readBody(req));
          say('방 생성', r.roomId.slice(0, 4) + '…');
          return json(res, 200, r);
        }
        const m = p.match(/^\/api\/rooms\/([A-Za-z0-9_-]{8,32})(?:\/([a-z]+))?$/);
        if (!m) throw new RoomError('없는 주소입니다.', 404);
        const [, id, sub] = m;
        if (!sub && req.method === 'GET') return json(res, 200, rooms.info(id));
        if (sub === 'join' && req.method === 'POST') {
          if (limited(ip, 'join:' + id, 12, 300e3)) throw new RoomError('참가 시도가 너무 많습니다. 5분 뒤 다시 시도하세요.', 429);
          return json(res, 200, rooms.join(id, await readBody(req)));
        }
        if (sub === 'resume' && req.method === 'POST') return json(res, 200, rooms.resume(id, tokenOf(req, url) || (await readBody(req)).token));
        if (sub === 'act' && req.method === 'POST') return json(res, 200, rooms.action(id, tokenOf(req, url), await readBody(req)));
        if (sub === 'board' && req.method === 'GET') {
          const room = rooms.get(id); rooms.auth(room, tokenOf(req, url));
          return json(res, 200, { boardId: room.boardId, board: rooms.board(room) });
        }
        if (sub === 'stream' && req.method === 'GET') {
          const room = rooms.get(id);
          const me = rooms.auth(room, tokenOf(req, url));
          res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' });
          res.write('retry: 2000\n\n');
          const set = streams.get(id) || new Set(); streams.set(id, set); set.add(res);
          rooms.connect(room, me.id);
          res.write(`event: state\ndata: ${JSON.stringify(rooms.publicView(room))}\n\n`);
          const ping = setInterval(() => res.write(': ping\n\n'), 20e3);
          req.on('close', () => { clearInterval(ping); set.delete(res); const r = rooms.rooms.get(id); if (r) rooms.disconnect(r, me.id); });
          return;
        }
        throw new RoomError('없는 주소입니다.', 404);
      }
      // 정적 파일
      if (req.method !== 'GET' && req.method !== 'HEAD') throw new RoomError('허용되지 않는 요청', 405);
      if (p === '/' || /^\/r\/[A-Za-z0-9_-]+$/.test(p)) return sendFile(res, path.join(ROOT, 'public', 'index.html'));
      const base = p.startsWith('/game/') ? path.join(ROOT, 'game') : path.join(ROOT, 'public');
      const rel = p.startsWith('/game/') ? p.slice(6) : p.slice(1);
      const file = path.resolve(base, decodeURIComponent(rel));
      if (!file.startsWith(base + path.sep)) throw new RoomError('잘못된 경로', 400);
      return sendFile(res, file);
    } catch (e) {
      if (e instanceof RoomError) return json(res, e.status, { ok: false, error: e.message });
      console.error(e);
      return json(res, 500, { ok: false, error: '서버 오류가 발생했습니다.' });
    }
  });

  const timer = setInterval(() => { try { rooms.tick(); } catch (e) { console.error(e); } }, 1000);
  server.on('close', () => clearInterval(timer));
  return new Promise((resolve) => server.listen(port, host, () => {
    say(`갈림길 인생 서버 실행: http://localhost:${server.address().port}`);
    resolve({ server, rooms, port: server.address().port, close: () => new Promise(r => { clearInterval(timer); for (const s of streams.values()) for (const res of s) res.end(); server.closeAllConnections?.(); server.close(r); }) });
  }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startServer();
}
