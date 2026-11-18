import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../server/index.js';
import { RoomManager } from '../server/rooms.js';
import { runBot, joinBots, readSSE } from '../scripts/bots.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'glg-'));
async function call(base, p, body, token) {
  const res = await fetch(base + p, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json() };
}
const quickSettings = { preset: 'custom', startStage: 'adult', lengths: { growth: 8, early: 10, late: 10 }, packs: { extraJobs: true, special: true, joint: true, extra: true } };

test('방 생성·참가 규칙: 비밀번호 오류, 정원 초과, 입장 잠금, 닉네임 도용 불가, 진행 중 신규 참가 거부', async () => {
  const dir = tmp();
  const s = await startServer({ port: 0, dataDir: dir, quiet: true });
  const base = `http://localhost:${s.port}`;
  try {
    const host = (await call(base, '/api/rooms', { name: '방장', password: 'pw12', capacity: 3, settings: quickSettings })).body;
    assert.ok(host.roomId.length >= 16, '추측하기 어려운 방 ID');
    const id = host.roomId;
    assert.equal((await call(base, `/api/rooms/${id}/join`, { name: '친구', password: 'wrong' })).status, 403);
    const a = await call(base, `/api/rooms/${id}/join`, { name: '친구', password: 'pw12' });
    assert.equal(a.status, 200);
    assert.equal((await call(base, `/api/rooms/${id}/join`, { name: '친구', password: 'pw12' })).status, 409, '같은 닉네임 거부');
    // 잠금
    await call(base, `/api/rooms/${id}/act`, { type: 'lock', locked: true }, host.token);
    assert.equal((await call(base, `/api/rooms/${id}/join`, { name: '셋째', password: 'pw12' })).status, 423);
    await call(base, `/api/rooms/${id}/act`, { type: 'lock', locked: false }, host.token);
    assert.equal((await call(base, `/api/rooms/${id}/join`, { name: '셋째', password: 'pw12' })).status, 200);
    assert.equal((await call(base, `/api/rooms/${id}/join`, { name: '넷째', password: 'pw12' })).status, 409, '정원 초과');
    // 방장이 아닌 사람은 시작 불가
    assert.equal((await call(base, `/api/rooms/${id}/act`, { type: 'start' }, a.body.token)).status, 403);
    // 준비 안 된 사람이 있으면 시작 불가
    assert.equal((await call(base, `/api/rooms/${id}/act`, { type: 'start' }, host.token)).status, 400);
    // 잘못된 토큰
    assert.equal((await call(base, `/api/rooms/${id}/resume`, { token: 'x'.repeat(32) })).status, 401);
  } finally { await s.close(); }
});

test('중복 요청, 오래된 화면의 요청, 잘못된 차례는 거부', async () => {
  const dir = tmp();
  const s = await startServer({ port: 0, dataDir: dir, quiet: true });
  const base = `http://localhost:${s.port}`;
  try {
    const host = (await call(base, '/api/rooms', { name: '방장', password: 'pw12', capacity: 4, settings: quickSettings })).body;
    const id = host.roomId;
    const [b] = await joinBots(base, id, 'pw12', 1);
    await call(base, `/api/rooms/${id}/act`, { type: 'ready', ready: true }, b.token);
    assert.equal((await call(base, `/api/rooms/${id}/act`, { type: 'start' }, host.token)).status, 200);
    const late = await call(base, `/api/rooms/${id}/join`, { name: '늦은친구', password: 'pw12' });
    assert.equal(late.status, 409, '진행 중 게임 신규 참가 거부');
    const room = s.rooms.rooms.get(id);
    const pid0 = room.game.pending.id;
    const body = { type: 'game', actionId: 'same-1', pendingId: pid0, action: { type: 'simul', index: 0 } };
    const r1 = await call(base, `/api/rooms/${id}/act`, body, host.token);
    const r2 = await call(base, `/api/rooms/${id}/act`, body, host.token);
    assert.equal(r1.status, 200);
    assert.equal(r2.body.duplicate, true, '같은 actionId 재전송은 한 번만 처리');
    assert.equal(room.version, r1.body.version);
    // 동시 요청: 같은 순간 두 명이 응답해도 둘 다 정상 처리
    await call(base, `/api/rooms/${id}/act`, { type: 'game', pendingId: room.game.pending.id, action: { type: 'simul', index: 1 } }, b.token);
    assert.equal(room.game.pending.sub, 'firstJob');
    const stale = await call(base, `/api/rooms/${id}/act`, { type: 'game', pendingId: pid0, action: { type: 'simul', index: 0 } }, host.token);
    assert.equal(stale.status, 409, '이전 단계에 대한 늦은 요청 거부');
    await Promise.all([host, b].map((t, i) => call(base, `/api/rooms/${id}/act`, { type: 'game', pendingId: room.game.pending.id, action: { type: 'simul', index: [...room.game.pending.perPlayer[t.memberId]].findIndex(o => !o.disabled) } }, t.token)));
    assert.equal(room.game.pending.kind, 'turn');
    const notMe = room.game.pending.pid === host.memberId ? b : host;
    const wrong = await call(base, `/api/rooms/${id}/act`, { type: 'game', pendingId: room.game.pending.id, action: { type: 'roll' } }, notMe.token);
    assert.equal(wrong.status, 400);
    assert.match(wrong.body.error, /차례/);
  } finally { await s.close(); }
});

test('12개 클라이언트가 실제 HTTP/SSE로 접속해 한 판을 끝까지 동기화', { timeout: 120000 }, async () => {
  const dir = tmp();
  const s = await startServer({ port: 0, dataDir: dir, quiet: true });
  const base = `http://localhost:${s.port}`;
  const ac = new AbortController();
  try {
    const host = (await call(base, '/api/rooms', { name: '방장', password: 'pw12', capacity: 12, settings: quickSettings })).body;
    const id = host.roomId;
    const bots = await joinBots(base, id, 'pw12', 11);
    const all = [{ ...host }, ...bots];
    // 각 클라이언트가 받은 최종 버전 기록
    const seen = new Map();
    all.forEach((c, i) => {
      runBot({ base, roomId: id, token: c.token, memberId: c.memberId, seed: i + 1, delay: 0, signal: ac.signal });
      readSSE(`${base}/api/rooms/${id}/stream`, c.token, (room) => seen.set(c.memberId, room), ac.signal).catch(() => {});
    });
    // 모두 준비될 때까지 기다린 뒤 시작
    for (let t = 0; t < 100; t++) { const r = s.rooms.rooms.get(id); if (r.members.every(m => m.ready)) break; await new Promise(r => setTimeout(r, 50)); }
    assert.equal((await call(base, `/api/rooms/${id}/act`, { type: 'start' }, host.token)).status, 200);
    for (let t = 0; t < 1200; t++) { if (s.rooms.rooms.get(id).status === 'over') break; await new Promise(r => setTimeout(r, 50)); }
    const room = s.rooms.rooms.get(id);
    assert.equal(room.status, 'over');
    assert.equal(room.game.results.length, 12);
    await new Promise(r => setTimeout(r, 300));
    for (const c of all) assert.equal(seen.get(c.memberId)?.version, room.version, '모든 클라이언트가 같은 최종 버전을 받음');
    // 동시 접속 상태 표시
    assert.ok(s.rooms.publicView(room).members.every(m => m.online));
  } finally { ac.abort(); await s.close(); }
});

test('서버 재시작 후 진행 중인 게임과 재접속 권한 복구', async () => {
  const dir = tmp();
  let s = await startServer({ port: 0, dataDir: dir, quiet: true });
  let base = `http://localhost:${s.port}`;
  const host = (await call(base, '/api/rooms', { name: '방장', password: 'pw12', capacity: 4, settings: quickSettings })).body;
  const id = host.roomId;
  const [b] = await joinBots(base, id, 'pw12', 1);
  await call(base, `/api/rooms/${id}/act`, { type: 'ready', ready: true }, b.token);
  await call(base, `/api/rooms/${id}/act`, { type: 'start' }, host.token);
  // 몇 수 진행
  const room = s.rooms.rooms.get(id);
  for (let i = 0; i < 25 && room.status === 'playing'; i++) {
    const pd = room.game.pending;
    const pid = pd.kind === 'simul' ? pd.who.find(x => !(x in pd.responses)) : pd.pid;
    const tok = pid === host.memberId ? host.token : b.token;
    const { defaultActionFor } = await import('../game/engine.js');
    await call(base, `/api/rooms/${id}/act`, { type: 'game', pendingId: pd.id, action: defaultActionFor(room.game, pid) }, tok);
  }
  const snapshot = JSON.stringify(room.game);
  const version = room.version;
  await s.close();
  s = await startServer({ port: 0, dataDir: dir, quiet: true });
  base = `http://localhost:${s.port}`;
  try {
    const r2 = s.rooms.rooms.get(id);
    assert.equal(r2.version, version);
    assert.equal(JSON.stringify(r2.game), snapshot, '난수 상태·대기 입력·로그까지 동일');
    const res = await call(base, `/api/rooms/${id}/resume`, { token: b.token });
    assert.equal(res.status, 200);
    assert.equal(res.body.memberId, b.memberId);
  } finally { await s.close(); }
});

test('저장 형식 버전이 다르거나 손상된 방은 이유와 함께 안내', async () => {
  const dir = tmp();
  fs.mkdirSync(path.join(dir, 'rooms'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'rooms', 'oldroom12345678.json'), JSON.stringify({ schema: 999, id: 'oldroom12345678', members: [] }));
  fs.writeFileSync(path.join(dir, 'rooms', 'brokenroom12345.json'), '{oops');
  const s = await startServer({ port: 0, dataDir: dir, quiet: true });
  const base = `http://localhost:${s.port}`;
  try {
    const a = await call(base, '/api/rooms/oldroom12345678');
    assert.equal(a.status, 410); assert.match(a.body.error, /버전/);
    const b = await call(base, '/api/rooms/brokenroom12345');
    assert.equal(b.status, 410); assert.match(b.body.error, /손상/);
  } finally { await s.close(); }
});

test('방장 연결 끊김 → 권한 이전, 시간 초과 → 기본 행동, 만료 방 정리', () => {
  const dir = tmp();
  let now = 1_000_000;
  const rm = new RoomManager({ dataDir: dir, now: () => now });
  const host = rm.create({ name: '방장', password: 'pw12', capacity: 4, settings: { ...quickSettings, timeLimit: 30 } });
  const j = rm.join(host.roomId, { name: '친구', password: 'pw12' });
  const room = rm.get(host.roomId);
  rm.connect(room, j.memberId); // 친구만 접속 중
  rm.action(host.roomId, j.token, { type: 'ready', ready: true });
  rm.action(host.roomId, host.token, { type: 'start' });
  now += 61_000;
  rm.tick();
  assert.equal(room.hostId, j.memberId, '접속 중인 참가자에게 방장 이전');
  // 시간 제한 30초: 대기 입력이 기본 행동으로 진행
  const pid0 = room.game.pending.id;
  now += 31_000;
  rm.tick();
  assert.notEqual(room.game.pending.id, pid0);
  // 연결 끊긴 플레이어 자동 진행 (제한 시간 없음)
  room.settings.timeLimit = 0; room.deadline = null;
  const waiting = room.game.pending.kind === 'simul' ? room.game.pending.who.filter(x => !(x in room.game.pending.responses)) : [room.game.pending.pid];
  if (waiting.includes(host.memberId)) {
    const before = room.game.pending.id;
    rm.action(host.roomId, j.token, { type: 'autoResolve' });
    assert.ok(room.game.pending.id !== before || Object.keys(room.game.pending.responses || {}).includes(host.memberId));
  }
  // 만료: 진행 중 방은 30일 무활동 + 접속자 없음이면 삭제
  rm.disconnect(room, j.memberId);
  now += 31 * 24 * 3600e3;
  rm.tick();
  assert.equal(rm.rooms.has(host.roomId), false);
  assert.equal(fs.existsSync(path.join(dir, 'rooms', host.roomId + '.json')), false);
});
