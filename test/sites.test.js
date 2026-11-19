// Sites 배포본(dist/server/index.js)을 실제로 빌드하고, node:sqlite 로 만든 D1 흉내 위에서 실행한다.
// 마이그레이션 0000 → 0001 을 순서대로 적용해 기존 데이터가 보존되는지도 확인한다.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { harborBotAction } from './harbor-bot.js';
import { botRng } from './bot.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const legacy = JSON.parse(fs.readFileSync(path.join(root, 'test/fixtures/legacy-v0.2.0.json'), 'utf8'));
let worker;

// Cloudflare D1 의 prepare/bind/first/run/batch 만 흉내 낸다. await 사이에 다른 요청이 끼어들 수 있어 동시성도 재현된다.
class D1 {
  constructor() { this.db = new DatabaseSync(':memory:'); }
  migrate(file) { for (const sql of fs.readFileSync(file, 'utf8').split('--> statement-breakpoint')) if (sql.trim()) this.db.exec(sql); }
  prepare(sql) { return new Stmt(this, sql, []); }
  async batch(stmts) {
    await tick();
    this.db.exec('BEGIN');
    try { const out = stmts.map(s => s.runSync()); this.db.exec('COMMIT'); return out; } catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
}
class Stmt {
  constructor(d1, sql, args) { this.d1 = d1; this.sql = sql; this.args = args; }
  bind(...args) { return new Stmt(this.d1, this.sql, args); }
  runSync() { const r = this.d1.db.prepare(this.sql).run(...this.args); return { meta: { changes: Number(r.changes) } }; }
  async first() { await tick(); const row = this.d1.db.prepare(this.sql).get(...this.args); return row ? { ...row } : null; }
  async run() { await tick(); return this.runSync(); }
}
const tick = () => new Promise(r => setImmediate(r));

function freshDb({ withLegacy = false } = {}) {
  const d1 = new D1();
  d1.migrate(path.join(root, 'drizzle/0000_rooms.sql'));
  if (withLegacy) {
    // 업데이트 전 배포본이 저장해 둔 행 (0001 적용 전)
    for (const r of [legacy.room, legacy.lobby]) d1.db.prepare('INSERT INTO rooms (id, expires_at, state) VALUES (?, ?, ?)').run(r.id, Date.now() + 86400e3, JSON.stringify(r));
  }
  d1.migrate(path.join(root, 'drizzle/0001_room_codes.sql'));
  return d1;
}
async function req(d1, p, body, token, ip = '1.2.3.4') {
  const res = await worker.fetch(new Request('https://site.test' + p, {
    method: body ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip, ...(token ? { authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  }), { DB: d1 });
  const type = res.headers.get('content-type') || '';
  return { status: res.status, type, body: type.includes('json') ? await res.json() : await res.text() };
}

before(async () => {
  execFileSync(process.execPath, [path.join(root, 'scripts/build-sites.js')], { cwd: root, stdio: 'pipe' });
  worker = (await import(pathToFileURL(path.join(root, 'dist/server/index.js')).href + '?t=' + Date.now())).default;
});

test('Sites: 마이그레이션 후 기존 방이 그대로 열리고 같은 자리로 이어진다', async () => {
  const d1 = freshDb({ withLegacy: true });
  const id = legacy.room.id;
  const page = await req(d1, `/r/${id}`);
  assert.equal(page.status, 200);
  assert.match(page.body, /room-sync/);
  const info = await req(d1, `/api/rooms/${id}`);
  assert.equal(info.body.gameType, 'life');
  assert.equal(info.body.status, 'playing');
  const res = await req(d1, `/api/rooms/${id}/resume`, { token: legacy.guest.token });
  assert.equal(res.body.memberId, legacy.guest.memberId);
  const state = await req(d1, `/api/rooms/${id}/state`, null, legacy.host.token);
  assert.equal(state.body.game.pending.id, legacy.room.game.pending.id);
  assert.equal((await req(d1, `/api/rooms/${legacy.lobby.id}/join`, { name: '새친구', password: 'bad' })).status, 403);
  assert.equal((await req(d1, `/api/rooms/${legacy.lobby.id}/join`, { name: '새친구', password: legacy.lobbyPassword })).status, 200);
});

test('Sites: 두 게임 번호 발급·조회, 번호 충돌 시 재발급, 동시 입장 정원 보장', async () => {
  const d1 = freshDb();
  const life = (await req(d1, '/api/rooms', { gameType: 'life', name: '가' })).body;
  const harbor = (await req(d1, '/api/rooms', { gameType: 'harbor', name: '나', capacity: 2 })).body;
  assert.match(life.code, /^\d{6}$/); assert.match(harbor.code, /^\d{6}$/);
  assert.notEqual(life.code, harbor.code);
  assert.equal((await req(d1, `/api/codes/${harbor.code}`)).body.roomId, harbor.roomId);
  assert.equal((await req(d1, `/api/codes/${life.code}`)).body.gameType, 'life');
  assert.equal((await req(d1, '/api/codes/abc')).body.reason, 'bad_code');
  // 이미 쓰는 번호를 미리 차지해 두면 UNIQUE 충돌 → 다른 번호로 재시도
  const taken = d1.db.prepare('SELECT COUNT(*) AS n FROM room_codes').get().n;
  assert.equal(Number(taken), 2);
  // 다음 생성의 첫 시도에서 번호 행을 '이미 존재'하게 만들어 실제 UNIQUE 충돌을 일으킨다
  const realBatch = d1.batch.bind(d1);
  let collided = 0;
  d1.batch = async (stmts) => {
    const codeStmt = stmts.find(s => /INSERT INTO room_codes/.test(s.sql));
    if (codeStmt && !collided) { collided++; d1.db.prepare('INSERT INTO room_codes VALUES (?, ?, ?, ?)').run(codeStmt.args[0], 'ghost', 'life', Date.now() + 1e9); }
    return realBatch(stmts);
  };
  const retried = await req(d1, '/api/rooms', { gameType: 'harbor', name: '재시도' }, null, '8.8.8.8');
  assert.equal(retried.status, 200);
  assert.equal(collided, 1);
  assert.equal((await req(d1, `/api/codes/${retried.body.code}`)).body.roomId, retried.body.roomId, '충돌한 번호 대신 새 번호');
  assert.equal(Number(d1.db.prepare("SELECT COUNT(*) AS n FROM rooms WHERE id = ?").get(retried.body.roomId).n), 1, '실패한 시도는 롤백되어 방 중복 없음');
  d1.batch = realBatch;
  const more = await Promise.all(Array.from({ length: 6 }, (_, i) => req(d1, '/api/rooms', { gameType: 'harbor', name: '방' + i }, null, '9.9.9.' + i)));
  const codes = more.map(r => r.body.code);
  assert.equal(new Set(codes).size, 6);
  // 마지막 한 자리에 동시 입장
  const joins = await Promise.all(['하나', '둘', '셋'].map((name, i) => req(d1, `/api/rooms/${harbor.roomId}/join`, { name }, null, '5.5.5.' + i)));
  assert.equal(joins.filter(r => r.status === 200).length, 1);
  assert.ok(joins.filter(r => r.status !== 200).every(r => r.body.reason === 'full'), JSON.stringify(joins.map(j => j.body)));
  // 방장이 나가면 번호는 만료 안내
  const solo = (await req(d1, '/api/rooms', { gameType: 'harbor', name: '혼자' }, null, '7.7.7.7')).body;
  await req(d1, `/api/rooms/${solo.roomId}/act`, { type: 'leave', actionId: 'l' }, solo.token);
  assert.equal((await req(d1, `/api/codes/${solo.code}`)).body.reason, 'expired');
});

test('Sites: 「항구의 길」 한 판 — 중복 요청은 한 번만, 결과는 양쪽 동일', { timeout: 60000 }, async () => {
  const d1 = freshDb();
  const h = (await req(d1, '/api/rooms', { gameType: 'harbor', name: '민지', password: 'sea1', settings: { rounds: 6 } })).body;
  assert.equal((await req(d1, `/api/rooms/${h.roomId}/join`, { name: '준호' })).body.reason, 'password');
  const g = (await req(d1, `/api/rooms/${h.roomId}/join`, { name: '준호', password: 'sea1' })).body;
  await req(d1, `/api/rooms/${h.roomId}/act`, { type: 'ready', ready: true, actionId: 'r' }, g.token);
  assert.equal((await req(d1, `/api/rooms/${h.roomId}/act`, { type: 'start', actionId: 's' }, h.token)).status, 200);
  const tok = (pid) => (pid === h.memberId ? h.token : g.token);
  const r = botRng(3);
  let state = (await req(d1, `/api/rooms/${h.roomId}/state`, null, h.token)).body;
  for (let i = 0; i < 400 && state.status === 'playing'; i++) {
    const pd = state.game.pending;
    const body = { type: 'game', actionId: 'x' + i, pendingId: pd.id, action: harborBotAction(state.game, pd.pid, r, 'random') };
    const [a, b] = await Promise.all([req(d1, `/api/rooms/${h.roomId}/act`, body, tok(pd.pid)), req(d1, `/api/rooms/${h.roomId}/act`, body, tok(pd.pid))]);
    assert.equal(a.status, 200, JSON.stringify(a.body)); assert.equal(b.status, 200, JSON.stringify(b.body));
    assert.equal(a.body.state.version, b.body.state.version, '같은 행동 두 번 → 버전 한 번만 증가');
    state = a.body.state;
  }
  assert.equal(state.status, 'over');
  const s1 = (await req(d1, `/api/rooms/${h.roomId}/state`, null, h.token)).body;
  const s2 = (await req(d1, `/api/rooms/${h.roomId}/state`, null, g.token)).body;
  assert.deepEqual(s1.game.results, s2.game.results);
  assert.equal(s1.game.rng, undefined);
});

test('Sites: 정적 파일과 이미지 목록 제공', async () => {
  const d1 = freshDb();
  for (const p of ['/', '/site.css', '/harbor-ui.js', '/game/harbor/engine.js', '/game/rng.js', '/assets/manifest.json']) {
    const r = await req(d1, p);
    assert.equal(r.status, 200, p);
  }
});
