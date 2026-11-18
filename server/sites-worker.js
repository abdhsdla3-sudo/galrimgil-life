import { RoomManager, RoomError, ROOM_SCHEMA } from './rooms.js';
import { SCHEMA_VERSION } from '../game/engine.js';
import assets from 'sites-assets';

const EXPIRY = { lobby: 86400e3, playing: 30 * 86400e3, over: 3 * 86400e3 };
const HEARTBEAT_MS = 15000;
const ONLINE_MS = 35000;
const HEADERS = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
const json = (body, status = 200) => Response.json(body, { status, headers: HEADERS });
const fail = (message, status = 400) => { throw new RoomError(message, status); };

class HostedRooms extends RoomManager {
  isOnline(room, id) {
    return room.members.some(m => m.id === id && this.now() - m.lastSeen < ONLINE_MS);
  }
}

async function readBody(request) {
  const reader = request.body?.getReader();
  if (!reader) return {};
  const decoder = new TextDecoder();
  let size = 0;
  let text = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 65536) { await reader.cancel(); fail('요청이 너무 큽니다.', 413); }
    text += decoder.decode(value, { stream: true });
  }
  try {
    const body = JSON.parse(text + decoder.decode());
    if (body && typeof body === 'object' && !Array.isArray(body)) return body;
  } catch { /* 잘못된 JSON */ }
  fail('잘못된 요청 형식입니다.');
}

async function limit(db, key, max, windowMs, now) {
  const { hits } = await db.prepare(
    'INSERT INTO room_limits VALUES (?, ?, 1) ON CONFLICT(key) DO UPDATE SET hits = CASE WHEN expires_at <= ? THEN 1 ELSE hits + 1 END, expires_at = CASE WHEN expires_at <= ? THEN excluded.expires_at ELSE expires_at END RETURNING hits',
  ).bind(key, now + windowMs, now, now).first();
  if (hits > max) fail('요청이 너무 많습니다. 잠시 후 다시 시도하세요.', 429);
}

async function roomRequest(db, id, action, now) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const row = await db.prepare('SELECT revision, state FROM rooms WHERE id = ? AND expires_at > ?').bind(id, now).first();
    if (!row) fail('방을 찾을 수 없습니다. 링크를 확인하거나 만료되었는지 확인하세요.', 404);
    const room = JSON.parse(row.state);
    if (room.schema !== ROOM_SCHEMA || (room.game && room.game.schema !== SCHEMA_VERSION)) fail('저장 형식 버전이 다릅니다.', 410);
    const manager = new HostedRooms({ now: () => now });
    manager.rooms.set(id, room);
    const result = action(manager, room);
    const state = JSON.stringify(room);
    const exists = manager.rooms.has(id);
    if (exists && state === row.state) return result;
    const write = exists
      ? db.prepare('UPDATE rooms SET revision = revision + 1, expires_at = ?, state = ? WHERE id = ? AND revision = ?')
        .bind(Math.max(room.updatedAt, ...room.members.map(m => m.lastSeen)) + EXPIRY[room.status], state, id, row.revision)
      : db.prepare('DELETE FROM rooms WHERE id = ? AND revision = ?').bind(id, row.revision);
    if ((await write.run()).meta.changes === 1) return result;
  }
  fail('동시에 여러 요청이 들어왔습니다. 다시 시도해 주세요.', 409);
}

async function api(request, url, db) {
  const { method } = request;
  const now = Date.now();
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
  if (url.pathname === '/api/rooms' && method === 'POST') {
    await limit(db, 'create:' + ip, 20, 3600e3, now);
    const manager = new HostedRooms({ now: () => now });
    const result = manager.create(await readBody(request));
    const room = manager.get(result.roomId);
    await db.batch([
      db.prepare('DELETE FROM rooms WHERE expires_at <= ?').bind(now),
      db.prepare('DELETE FROM room_limits WHERE expires_at <= ?').bind(now),
      db.prepare('INSERT INTO rooms (id, expires_at, state) VALUES (?, ?, ?)').bind(room.id, now + EXPIRY.lobby, JSON.stringify(room)),
    ]);
    return json(result);
  }
  const match = /^\/api\/rooms\/([A-Za-z0-9_-]{8,32})(?:\/([a-z]+))?$/.exec(url.pathname);
  if (!match) fail('없는 주소입니다.', 404);
  const [, id, sub] = match;
  if (sub === 'join' && method === 'POST') {
    await limit(db, `join:${id}:${ip}`, 20, 300e3, now);
  }
  const body = method === 'POST' ? await readBody(request) : null;
  return json(await roomRequest(db, id, (manager, room) => {
    if (!sub && method === 'GET') return manager.info(id);
    if (sub === 'join' && method === 'POST') return manager.join(id, body);
    if (sub === 'resume' && method === 'POST') return manager.resume(id, token || body.token);
    const me = manager.auth(room, token);
    if (sub === 'board' && method === 'GET') return { boardId: room.boardId, board: manager.board(room) };
    if (sub === 'act' && method === 'POST') return manager.action(id, token, body);
    if (sub === 'state' && method === 'GET') {
      if (now - me.lastSeen >= HEARTBEAT_MS) me.lastSeen = now;
      manager.tick();
      return manager.publicView(room);
    }
    fail('없는 주소입니다.', 404);
  }, now));
}

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      if (url.pathname === '/healthz') {
        await env.DB.prepare('SELECT id FROM rooms LIMIT 1').first();
        return json({ ok: true });
      }
      if (url.pathname.startsWith('/api/')) return await api(request, url, env.DB);
      if (!['GET', 'HEAD'].includes(request.method)) fail('허용되지 않는 요청입니다.', 405);
      const path = url.pathname === '/' || /^\/r\/[A-Za-z0-9_-]{8,32}$/.test(url.pathname) ? '/index.html' : url.pathname;
      if (!Object.hasOwn(assets, path)) fail('없는 주소입니다.', 404);
      const [type, body] = assets[path];
      return new Response(request.method === 'HEAD' ? null : body, { headers: { ...HEADERS, 'content-type': type } });
    } catch (error) {
      if (error instanceof RoomError) return json({ ok: false, error: error.message }, error.status);
      console.error(error.message);
      return json({ ok: false, error: '서버 오류가 발생했습니다.' }, 500);
    }
  },
};
