// 방 관리: 참가 인증, 대기실, 게임 행동 처리, 저장/복구, 만료 정리
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { normalizeSettings, defaultSettings } from '../game/settings.js';
import { createGame, restoreGame, act, awaiting, defaultActionFor, GameError, SCHEMA_VERSION } from '../game/engine.js';

export const ROOM_SCHEMA = 1;
const EXPIRE_MS = { lobby: 24 * 3600e3, playing: 30 * 24 * 3600e3, over: 3 * 24 * 3600e3 };
export const OFFLINE_GRACE_MS = 60e3;
const MAX_NAME = 12;

export class RoomError extends Error { constructor(msg, status = 400) { super(msg); this.status = status; } }
const err = (m, s) => { throw new RoomError(m, s); };

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const newId = (bytes) => crypto.randomBytes(bytes).toString('base64url');
function hashPassword(pw, salt = crypto.randomBytes(16).toString('hex')) {
  return { salt, hash: crypto.scryptSync(String(pw), salt, 32).toString('hex') };
}
function checkPassword(pw, rec) {
  const h = crypto.scryptSync(String(pw), rec.salt, 32);
  const want = Buffer.from(rec.hash, 'hex');
  return h.length === want.length && crypto.timingSafeEqual(h, want);
}
export function cleanName(name) {
  const n = String(name ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, MAX_NAME);
  if (!n) err('닉네임을 입력하세요.');
  return n;
}

export class RoomManager {
  constructor({ dataDir, now = () => Date.now(), onChange = () => {} }) {
    this.dir = dataDir ? path.join(dataDir, 'rooms') : null;
    if (this.dir) fs.mkdirSync(this.dir, { recursive: true });
    this.rooms = new Map();
    this.broken = new Map(); // 불러오지 못한 방: id → 이유
    this.now = now;
    this.onChange = onChange;
    this.conn = new Map(); // roomId → Map(memberId → 연결 수)
    if (this.dir) this.load();
  }

  // ---------- 저장 ----------
  load() {
    for (const f of fs.readdirSync(this.dir)) {
      if (!f.endsWith('.json')) continue;
      const id = f.slice(0, -5);
      try {
        const room = JSON.parse(fs.readFileSync(path.join(this.dir, f), 'utf8'));
        if (room.schema !== ROOM_SCHEMA) { this.broken.set(id, `저장 형식 버전이 다릅니다 (저장 ${room.schema}, 서버 ${ROOM_SCHEMA}).`); continue; }
        if (room.game && room.game.schema !== SCHEMA_VERSION) { this.broken.set(id, `게임 데이터 버전이 다릅니다 (저장 ${room.game.schema}, 서버 ${SCHEMA_VERSION}).`); continue; }
        restoreGame(room.game);
        for (const m of room.members) m.lastSeen = this.now(); // 재시작 직후 바로 '오프라인 처리'되지 않도록 유예
        this.rooms.set(id, room);
      } catch (e) {
        this.broken.set(id, '저장 파일이 손상되어 불러올 수 없습니다.');
      }
    }
  }
  save(room) {
    room.updatedAt = this.now();
    if (!this.dir) return;
    const file = path.join(this.dir, room.id + '.json');
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(room));
    fs.renameSync(tmp, file);
  }
  commit(room) {
    room.version++;
    this.syncDeadline(room);
    this.save(room);
    this.onChange(room);
  }

  // ---------- 조회 ----------
  get(id) {
    const r = this.rooms.get(id);
    if (!r) {
      if (this.broken.has(id)) err('이 방은 불러올 수 없습니다: ' + this.broken.get(id), 410);
      err('방을 찾을 수 없습니다. 링크를 확인하거나 만료되었는지 확인하세요.', 404);
    }
    return r;
  }
  auth(room, token) {
    if (typeof token !== 'string' || token.length < 20) err('참가 정보가 없습니다.', 401);
    const h = sha(token);
    const m = room.members.find(x => x.tokenHash === h);
    if (!m) err('참가 정보가 올바르지 않습니다. 다시 참가하세요.', 401);
    return m;
  }
  info(id) {
    const r = this.get(id);
    return { id: r.id, status: r.status, count: r.members.length, capacity: r.capacity, locked: r.locked };
  }
  isOnline(room, mid) { return (this.conn.get(room.id)?.get(mid) || 0) > 0; }
  publicView(room) {
    const g = room.game;
    let game = null;
    if (g) { const { rng, seed, board, ...rest } = g; game = rest; }
    return {
      id: room.id, version: room.version, status: room.status, capacity: room.capacity, locked: room.locked, hostId: room.hostId,
      settings: room.settings, notices: room.notices.slice(-10), deadline: room.deadline || null, now: this.now(),
      members: room.members.map(m => ({ id: m.id, name: m.name, ready: m.ready, online: this.isOnline(room, m.id), lastSeen: m.lastSeen, joinedAt: m.joinedAt })),
      game, boardId: g ? room.boardId : null, chat: room.chat || [],
    };
  }
  board(room) { return room.game?.board || null; }

  // ---------- 생성/참가 ----------
  create({ name, password, capacity, settings }) {
    const n = cleanName(name);
    if (typeof password !== 'string' || password.length < 2 || password.length > 40) err('방 비밀번호는 2~40자로 정하세요.');
    const id = newId(12);
    const token = newId(24);
    const member = { id: 'm' + newId(6), name: n, tokenHash: sha(token), ready: true, joinedAt: this.now(), lastSeen: this.now() };
    const room = {
      schema: ROOM_SCHEMA, id, version: 0, createdAt: this.now(), updatedAt: this.now(), status: 'lobby',
      password: hashPassword(password), capacity: clampCap(capacity), locked: false, hostId: member.id,
      settings: normalizeSettings(settings || defaultSettings()), members: [member], game: null, notices: [], processed: {}, deadline: null, boardId: null,
    };
    this.rooms.set(id, room);
    this.commit(room);
    return { roomId: id, memberId: member.id, token };
  }
  join(id, { name, password }) {
    const room = this.get(id);
    if (!checkPassword(password ?? '', room.password)) err('비밀번호가 올바르지 않습니다.', 403);
    if (room.status !== 'lobby') err('이미 게임이 시작된 방입니다. 기존 참가자는 처음 참가한 브라우저나 복구 코드로 다시 들어올 수 있습니다.', 409);
    if (room.locked) err('방장이 입장을 잠갔습니다.', 423);
    if (room.members.length >= room.capacity) err(`정원(${room.capacity}명)이 가득 찼습니다.`, 409);
    const n = cleanName(name);
    if (room.members.some(m => m.name === n)) err('이미 같은 닉네임이 있습니다. 다른 닉네임을 쓰세요.', 409);
    const token = newId(24);
    const member = { id: 'm' + newId(6), name: n, tokenHash: sha(token), ready: false, joinedAt: this.now(), lastSeen: this.now() };
    room.members.push(member);
    this.notice(room, `${n} 님이 참가했습니다.`);
    this.commit(room);
    return { roomId: id, memberId: member.id, token };
  }
  resume(id, token) {
    const room = this.get(id);
    const m = this.auth(room, token);
    return { roomId: id, memberId: m.id, name: m.name };
  }
  notice(room, text) { room.notices.push({ t: this.now(), text }); if (room.notices.length > 30) room.notices.shift(); }

  // ---------- 연결 상태 ----------
  connect(room, mid) {
    const map = this.conn.get(room.id) || new Map();
    this.conn.set(room.id, map);
    map.set(mid, (map.get(mid) || 0) + 1);
    const m = room.members.find(x => x.id === mid);
    if (m) m.lastSeen = this.now();
    this.onChange(room);
  }
  disconnect(room, mid) {
    const map = this.conn.get(room.id);
    if (!map) return;
    map.set(mid, Math.max(0, (map.get(mid) || 1) - 1));
    const m = room.members.find(x => x.id === mid);
    if (m) m.lastSeen = this.now();
    this.onChange(room);
  }
  offlineLong(room, mid) {
    const m = room.members.find(x => x.id === mid);
    return !this.isOnline(room, mid) && (!m || this.now() - m.lastSeen >= OFFLINE_GRACE_MS);
  }

  // ---------- 행동 ----------
  action(id, token, body) {
    const room = this.get(id);
    const me = this.auth(room, token);
    me.lastSeen = this.now();
    const aid = typeof body.actionId === 'string' ? body.actionId.slice(0, 64) : null;
    const seen = (room.processed[me.id] ||= []);
    const withState = body.type === 'game' || body.type === 'chat';
    if (aid && seen.includes(aid)) return { ok: true, duplicate: true, version: room.version, ...(withState && { state: this.publicView(room) }) };
    const res = this.dispatch(room, me, body);
    if (res.removed) return { ok: true, removed: true };
    if (aid) { seen.push(aid); if (seen.length > 40) seen.shift(); }
    this.commit(room);
    return { ok: true, version: room.version, ...res, ...(withState && { state: this.publicView(room) }) };
  }

  dispatch(room, me, a) {
    const isHost = room.hostId === me.id;
    const host = () => { if (!isHost) err('방장만 할 수 있습니다.', 403); };
    const lobby = () => { if (room.status !== 'lobby') err('대기실에서만 할 수 있습니다.'); };
    switch (a.type) {
      case 'chat': {
        if (room.status === 'lobby') err('게임이 시작된 뒤 채팅할 수 있습니다.');
        const message = typeof a.message === 'string' ? a.message.trim() : '';
        if (!message || message.length > 120) err('메시지를 1~120자로 입력하세요.');
        room.chat ||= [];
        const last = room.chat.findLast(m => m.pid === me.id);
        if (last && this.now() - last.at < 700) err('잠시 후 다시 보내세요.', 429);
        room.chat.push({ seq: room.version + 1, at: this.now(), pid: me.id, name: me.name, message });
        if (room.chat.length > 30) room.chat.shift();
        return {};
      }
      case 'ready': lobby(); me.ready = !!a.ready; return {};
      case 'settings': host(); lobby(); room.settings = normalizeSettings(a.settings); this.resetReady(room); return {};
      case 'capacity': {
        host(); lobby();
        const c = clampCap(a.capacity);
        if (c < room.members.length) err(`현재 참가자(${room.members.length}명)보다 작게 줄일 수 없습니다.`);
        room.capacity = c; return {};
      }
      case 'lock': host(); room.locked = !!a.locked; this.notice(room, room.locked ? '방장이 입장을 잠갔습니다.' : '입장 잠금이 풀렸습니다.'); return {};
      case 'kick': {
        host(); lobby();
        const t = room.members.find(m => m.id === a.target);
        if (!t || t.id === me.id) err('대상을 확인하세요.');
        room.members = room.members.filter(m => m.id !== t.id);
        this.notice(room, `${t.name} 님이 내보내졌습니다.`);
        return {};
      }
      case 'leave': {
        lobby();
        room.members = room.members.filter(m => m.id !== me.id);
        this.notice(room, `${me.name} 님이 나갔습니다.`);
        if (!room.members.length) { this.remove(room.id); return { removed: true }; }
        if (isHost) { room.hostId = room.members[0].id; room.members[0].ready = true; this.notice(room, `${room.members[0].name} 님이 새 방장이 되었습니다.`); }
        return {};
      }
      case 'transferHost': {
        host();
        const t = room.members.find(m => m.id === a.target);
        if (!t) err('대상을 확인하세요.');
        room.hostId = t.id; t.ready = true;
        this.notice(room, `${t.name} 님이 방장이 되었습니다.`);
        return {};
      }
      case 'start': {
        host(); lobby();
        if (room.members.length < 2) err('2명 이상 모여야 시작할 수 있습니다.');
        const notReady = room.members.filter(m => !m.ready && m.id !== room.hostId);
        if (notReady.length) err(`준비하지 않은 참가자: ${notReady.map(m => m.name).join(', ')}`);
        const seed = crypto.randomBytes(4).readUInt32LE(0);
        room.game = createGame(room.members.map(m => ({ id: m.id, name: m.name })), room.settings, seed);
        room.boardId = newId(6);
        room.status = 'playing';
        room.locked = true;
        this.notice(room, '게임이 시작되었습니다!');
        return {};
      }
      case 'rematch': {
        host();
        if (room.status !== 'over') err('게임이 끝난 뒤에 할 수 있습니다.');
        room.status = 'lobby'; room.game = null; room.locked = false; room.deadline = null; room.boardId = null;
        this.resetReady(room);
        this.notice(room, '같은 멤버로 새 게임을 준비합니다.');
        return {};
      }
      case 'autoResolve': {
        if (room.status !== 'playing') err('진행 중인 게임이 없습니다.');
        const who = awaiting(room.game).filter(pid => this.offlineLong(room, pid));
        if (!who.length) err(`접속이 끊긴 지 ${OFFLINE_GRACE_MS / 1000}초가 지난 대기 플레이어가 없습니다.`);
        for (const pid of who) this.applyDefault(room, pid, '연결 끊김 자동 진행');
        return {};
      }
      case 'game': {
        if (room.status !== 'playing') err('진행 중인 게임이 없습니다.');
        const g = room.game;
        if (a.pendingId !== undefined && a.pendingId !== g.pending.id) err('화면이 최신 상태가 아닙니다. 잠시 후 다시 시도하세요.', 409);
        try { act(g, me.id, a.action || {}); } catch (e) { if (e instanceof GameError) err(e.message); throw e; }
        if (g.phase === 'over') room.status = 'over';
        return {};
      }
    }
    err('알 수 없는 요청입니다.');
  }
  resetReady(room) { for (const m of room.members) m.ready = m.id === room.hostId; }
  applyDefault(room, pid, why) {
    const g = room.game;
    const a = defaultActionFor(g, pid);
    if (!a) return;
    const name = g.players.find(p => p.id === pid)?.name;
    try { act(g, pid, a); } catch (e) {
      // 기본 행동이 막힌 경우 사용 가능한 첫 선택지로 대체 (진행 불능 방지)
      const opts = g.pending.kind === 'simul' ? (g.pending.perPlayer?.[pid] || g.pending.options) : g.pending.options;
      const i = opts ? opts.findIndex(o => !o.disabled) : -1;
      if (i < 0) throw e;
      act(g, pid, { ...a, index: i });
    }
    g.log.push({ seq: ++g.logSeq, round: g.round, pid, text: `${name}: ${why} (기본 행동 적용)`, kind: 'system', changes: [] });
    if (g.phase === 'over') room.status = 'over';
  }

  // ---------- 시간 제한 ----------
  syncDeadline(room) {
    const g = room.game;
    const lim = room.settings.timeLimit;
    if (!g || room.status !== 'playing' || !lim) { room.deadline = null; return; }
    if (room.deadline?.pendingId === g.pending.id) return;
    room.deadline = { pendingId: g.pending.id, at: this.now() + lim * 1000 };
  }

  // ---------- 주기 작업 ----------
  tick() {
    const now = this.now();
    for (const room of [...this.rooms.values()]) {
      // 만료 정리
      if (now - room.updatedAt > EXPIRE_MS[room.status]) {
        const anyOnline = room.members.some(m => this.isOnline(room, m.id));
        if (!anyOnline) { this.remove(room.id); continue; }
      }
      let changed = false;
      // 시간 초과 → 기본 행동
      if (room.status === 'playing' && room.deadline && now >= room.deadline.at && room.deadline.pendingId === room.game.pending.id) {
        for (const pid of awaiting(room.game)) this.applyDefault(room, pid, '선택 시간 초과');
        changed = true;
      }
      // 방장 이탈 → 접속 중인 가장 먼저 들어온 참가자에게 관리 권한 이전
      if (this.offlineLong(room, room.hostId)) {
        const next = room.members.filter(m => this.isOnline(room, m.id)).sort((a, b) => a.joinedAt - b.joinedAt)[0];
        if (next) {
          const old = room.members.find(m => m.id === room.hostId);
          room.hostId = next.id; next.ready = true;
          this.notice(room, `방장${old ? `(${old.name})` : ''}의 연결이 끊겨 ${next.name} 님이 방장 권한을 넘겨받았습니다.`);
          changed = true;
        }
      }
      if (changed) this.commit(room);
    }
  }
  remove(id) {
    this.rooms.delete(id);
    this.conn.delete(id);
    if (!this.dir) return;
    try { fs.unlinkSync(path.join(this.dir, id + '.json')); } catch { /* 이미 없음 */ }
  }
}

function clampCap(c) {
  const n = Math.round(Number(c));
  return Number.isFinite(n) ? Math.min(12, Math.max(2, n)) : 8;
}
