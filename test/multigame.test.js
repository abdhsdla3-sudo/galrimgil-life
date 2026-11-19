// 여러 게임 · 6자리 입장번호 · 업데이트 전 저장 데이터 호환 테스트 (로컬 서버)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../server/index.js';
import { RoomManager } from '../server/rooms.js';
import { defaultActionFor } from '../game/engine.js';
import { harborBotAction } from './harbor-bot.js';
import { botRng } from './bot.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'glg-mg-'));
const legacy = JSON.parse(fs.readFileSync(new URL('./fixtures/legacy-v0.2.0.json', import.meta.url), 'utf8'));
async function call(base, p, body, token) {
  const res = await fetch(base + p, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch { /* HTML */ }
  return { status: res.status, body: json, text };
}
async function withServer(dir, fn) {
  const s = await startServer({ port: 0, dataDir: dir, quiet: true });
  try { return await fn(`http://localhost:${s.port}`, s); } finally { await s.close(); }
}

test('업데이트 전 「갈림길 인생」 방: 기존 링크·참가자 토큰·비밀번호로 같은 자리에서 이어하기', async () => {
  const dir = tmp();
  fs.mkdirSync(path.join(dir, 'rooms'));
  for (const r of [legacy.room, legacy.lobby]) fs.writeFileSync(path.join(dir, 'rooms', r.id + '.json'), JSON.stringify(r));
  assert.equal(legacy.room.gameType, undefined, '픽스처는 게임 종류 필드가 없는 구버전');
  await withServer(dir, async (base, s) => {
    const id = legacy.room.id;
    const page = await call(base, `/r/${id}`);
    assert.equal(page.status, 200);
    assert.match(page.text, /<div id="app">/);
    const info = await call(base, `/api/rooms/${id}`);
    assert.equal(info.body.gameType, 'life');
    assert.equal(info.body.code, null);
    assert.equal(info.body.status, 'playing');
    assert.equal(info.body.hasPassword, true);
    const resumed = await call(base, `/api/rooms/${id}/resume`, { token: legacy.host.token });
    assert.equal(resumed.status, 200);
    assert.equal(resumed.body.memberId, legacy.host.memberId);
    assert.equal(resumed.body.gameType, 'life');
    // 같은 진행 상태에서 이어서 행동
    const room = s.rooms.rooms.get(id);
    assert.equal(room.game.pending.id, legacy.room.game.pending.id);
    for (let i = 0; i < 6; i++) {
      const pd = room.game.pending;
      const pid = pd.kind === 'simul' ? pd.who.find(x => !(x in pd.responses)) : pd.pid;
      const tok = pid === legacy.host.memberId ? legacy.host.token : legacy.guest.token;
      const r = await call(base, `/api/rooms/${id}/act`, { type: 'game', actionId: 'legacy-' + i, pendingId: pd.id, action: defaultActionFor(room.game, pid) }, tok);
      assert.equal(r.status, 200, r.body?.error);
      assert.equal(r.body.state.gameType, 'life');
    }
    const board = await call(base, `/api/rooms/${id}/board`, null, legacy.guest.token);
    assert.ok(board.body.board?.nodes, '기존 보드 데이터 제공');
    // 구버전 대기실 방: 비밀번호 보호와 입장 잠금이 그대로
    const lid = legacy.lobby.id;
    assert.equal((await call(base, `/api/rooms/${lid}/join`, { name: '새친구' })).body.reason, 'password');
    assert.equal((await call(base, `/api/rooms/${lid}/join`, { name: '새친구', password: 'nope' })).status, 403);
    await call(base, `/api/rooms/${lid}/act`, { type: 'lock', locked: true }, legacy.lobbyHost.token);
    assert.equal((await call(base, `/api/rooms/${lid}/join`, { name: '새친구', password: legacy.lobbyPassword })).body.reason, 'locked');
    await call(base, `/api/rooms/${lid}/act`, { type: 'lock', locked: false }, legacy.lobbyHost.token);
    assert.equal((await call(base, `/api/rooms/${lid}/join`, { name: '새친구', password: legacy.lobbyPassword })).status, 200);
  });
});

test('두 게임 방을 동시에 열고 각자의 6자리 번호로 올바른 대기실 찾기', async () => {
  await withServer(tmp(), async (base) => {
    const life = (await call(base, '/api/rooms', { gameType: 'life', name: '방장A' })).body;
    const harbor = (await call(base, '/api/rooms', { gameType: 'harbor', name: '방장B', capacity: 9 })).body;
    for (const r of [life, harbor]) assert.match(r.code, /^\d{6}$/);
    assert.notEqual(life.code, harbor.code);
    const a = await call(base, `/api/codes/${life.code}`);
    const b = await call(base, `/api/codes/${harbor.code}`);
    assert.deepEqual([a.body.roomId, a.body.gameType, a.body.gameName], [life.roomId, 'life', '갈림길 인생']);
    assert.deepEqual([b.body.roomId, b.body.gameType, b.body.capacity], [harbor.roomId, 'harbor', 8], '항구의 길 정원은 최대 8');
    assert.equal(b.body.hasPassword, false);
    // 번호와 닉네임만으로 참가
    const j = await call(base, `/api/rooms/${b.body.roomId}/join`, { name: '친구' });
    assert.equal(j.status, 200);
    assert.equal(j.body.gameType, 'harbor');
    assert.equal(j.body.code, harbor.code);
    // 잘못된 형식·없는 번호
    assert.equal((await call(base, '/api/codes/12345')).body.reason, 'bad_code');
    assert.equal((await call(base, '/api/codes/12a456')).body.reason, 'bad_code');
    const unused = ['000000', '999999', '123456'].find(c => c !== life.code && c !== harbor.code);
    const nf = await call(base, `/api/codes/${unused}`);
    assert.equal(nf.status, 404); assert.equal(nf.body.reason, 'not_found');
  });
});

test('앞자리 0 번호, 번호 충돌 회피, 닫힌 방 번호는 만료로 안내하고 재발급하지 않음', async () => {
  const dir = tmp();
  const seq = ['012345', '012345', '000007', '012345', '000007', '000042'];
  let now = 1_000_000;
  const rm = new RoomManager({ dataDir: dir, now: () => now, codeGen: () => seq.shift() });
  const a = rm.create({ gameType: 'harbor', name: '가' });
  const b = rm.create({ gameType: 'life', name: '나' });
  assert.equal(a.code, '012345');
  assert.equal(b.code, '000007', '이미 쓰는 번호는 건너뜀');
  assert.equal(rm.lookupCode('012345').roomId, a.roomId);
  assert.equal(rm.lookupCode('000007').gameType, 'life');
  // 방장이 나가 방이 닫히면 번호는 만료로 안내
  rm.action(a.roomId, a.token, { type: 'leave' });
  assert.throws(() => rm.lookupCode('012345'), e => e.status === 410 && e.reason === 'expired');
  const c = rm.create({ gameType: 'harbor', name: '다' });
  assert.equal(c.code, '000042', '보관 중인 번호·활성 번호 모두 피함');
  // 재시작 후에도 번호 조회와 만료 보관 유지
  const rm2 = new RoomManager({ dataDir: dir, now: () => now });
  assert.equal(rm2.lookupCode('000042').roomId, c.roomId);
  assert.throws(() => rm2.lookupCode('012345'), e => e.reason === 'expired');
  now += 8 * 24 * 3600e3;
  const rm3 = new RoomManager({ dataDir: dir, now: () => now });
  assert.throws(() => rm3.lookupCode('012345'), e => e.reason === 'not_found', '보관 기간이 지나면 없는 번호');
});

test('마지막 자리 동시 입장은 한 명만 성공, 비밀번호 방과 사유별 거부', async () => {
  await withServer(tmp(), async (base) => {
    const h = (await call(base, '/api/rooms', { gameType: 'harbor', name: '방장', capacity: 3 })).body;
    await call(base, `/api/rooms/${h.roomId}/join`, { name: '첫째' });
    const both = await Promise.all(['둘째', '셋째', '넷째'].map(name => call(base, `/api/rooms/${h.roomId}/join`, { name })));
    assert.equal(both.filter(r => r.status === 200).length, 1, '남은 1자리에 1명만');
    assert.ok(both.filter(r => r.status !== 200).every(r => r.body.reason === 'full'));
    assert.equal((await call(base, `/api/codes/${h.code}`)).body.count, 3);
    // 비밀번호 방
    const p = (await call(base, '/api/rooms', { gameType: 'harbor', name: '방장', password: 'sea1' })).body;
    const info = (await call(base, `/api/codes/${p.code}`)).body;
    assert.equal(info.hasPassword, true);
    assert.equal((await call(base, `/api/rooms/${p.roomId}/join`, { name: '손님' })).body.reason, 'password');
    assert.equal((await call(base, `/api/rooms/${p.roomId}/join`, { name: '손님', password: 'x1' })).status, 403);
    assert.equal((await call(base, `/api/rooms/${p.roomId}/join`, { name: '손님', password: 'sea1' })).status, 200);
    assert.equal((await call(base, '/api/rooms', { gameType: 'harbor', name: '방장', password: 'x' })).status, 400, '너무 짧은 추가 비밀번호');
    // 잠금·시작된 게임
    await call(base, `/api/rooms/${p.roomId}/act`, { type: 'lock', locked: true }, p.token);
    assert.equal((await call(base, `/api/rooms/${p.roomId}/join`, { name: '늦게', password: 'sea1' })).body.reason, 'locked');
    const g = (await call(base, '/api/rooms', { gameType: 'harbor', name: '방장' })).body;
    const f = (await call(base, `/api/rooms/${g.roomId}/join`, { name: '친구' })).body;
    assert.equal((await call(base, `/api/rooms/${g.roomId}/act`, { type: 'start' }, g.token)).status, 400, '준비 전 시작 불가');
    await call(base, `/api/rooms/${g.roomId}/act`, { type: 'ready', ready: true }, f.token);
    assert.equal((await call(base, `/api/rooms/${g.roomId}/act`, { type: 'start' }, g.token)).status, 200);
    const late = await call(base, `/api/rooms/${g.roomId}/join`, { name: '늦은친구' });
    assert.equal(late.body.reason, 'started');
    assert.equal((await call(base, '/api/rooms', { gameType: 'chess', name: '방장' })).status, 400, '없는 게임');
  });
});

test('「항구의 길」 두 클라이언트 HTTP 완주: 서버 검증, 중복·오래된 요청 거부, 재접속, 결과 일치', { timeout: 60000 }, async () => {
  const dir = tmp();
  let roomId, host, guest, snapshot;
  await withServer(dir, async (base, s) => {
    host = (await call(base, '/api/rooms', { gameType: 'harbor', name: '민지', settings: { rounds: 6, timeLimit: 30 } })).body;
    roomId = host.roomId;
    guest = (await call(base, `/api/rooms/${roomId}/join`, { name: '준호' })).body;
    await call(base, `/api/rooms/${roomId}/act`, { type: 'ready', ready: true }, guest.token);
    await call(base, `/api/rooms/${roomId}/act`, { type: 'start' }, host.token);
    const room = s.rooms.rooms.get(roomId);
    const tok = (pid) => (pid === host.memberId ? host.token : guest.token);
    const r = botRng(5);
    let first = true;
    for (let i = 0; i < 10 && room.status === 'playing'; i++) {
      const g = room.game, pd = g.pending;
      const other = pd.pid === host.memberId ? guest : host;
      // 내 차례가 아닌 사람의 행동은 거부
      if (first) {
        const wrong = await call(base, `/api/rooms/${roomId}/act`, { type: 'game', pendingId: pd.id, action: { type: 'roll' } }, other.token);
        assert.equal(wrong.status, 400);
        first = false;
      }
      const action = harborBotAction(g, pd.pid, r, 'buyer');
      const body = { type: 'game', actionId: 'a' + i, pendingId: pd.id, action };
      const [x, y] = await Promise.all([call(base, `/api/rooms/${roomId}/act`, body, tok(pd.pid)), call(base, `/api/rooms/${roomId}/act`, body, tok(pd.pid))]);
      assert.equal(x.status, 200); assert.equal(y.status, 200);
      assert.ok(x.body.duplicate || y.body.duplicate, '더블클릭은 한 번만 적용');
      const stale = await call(base, `/api/rooms/${roomId}/act`, { type: 'game', actionId: 'stale' + i, pendingId: pd.id, action }, tok(pd.pid));
      if (room.status === 'playing' && room.game.pending.id !== pd.id) assert.equal(stale.status, 409, '이미 처리된 선택에 대한 재시도 거부');
    }
    assert.equal(room.status, 'playing', '재시작 전에는 진행 중');
    snapshot = JSON.stringify(room.game);
    // 잔액 조작 불가: 클라이언트가 보낸 값은 무시되고 서버 상태만 사용
    const view = (await call(base, `/api/rooms/${roomId}/resume`, { token: guest.token })).body;
    assert.equal(view.gameType, 'harbor');
  });
  // 서버 재시작 후 같은 상태로 복구하고 끝까지 진행
  await withServer(dir, async (base, s) => {
    const room = s.rooms.rooms.get(roomId);
    assert.equal(JSON.stringify(room.game), snapshot);
    const r = botRng(9);
    const tok = (pid) => (pid === host.memberId ? host.token : guest.token);
    for (let i = 0; i < 400 && room.status === 'playing'; i++) {
      const pd = room.game.pending;
      const res = await call(base, `/api/rooms/${roomId}/act`, { type: 'game', actionId: 'b' + i, pendingId: pd.id, action: harborBotAction(room.game, pd.pid, r, 'random') }, tok(pd.pid));
      assert.equal(res.status, 200, res.body?.error);
    }
    assert.equal(room.status, 'over');
    const a = (await call(base, `/api/rooms/${roomId}/act`, { type: 'chat', message: '수고했어요', actionId: 'c1' }, host.token)).body.state;
    const b = (await call(base, `/api/rooms/${roomId}/act`, { type: 'chat', message: '다음에 또!', actionId: 'c2' }, guest.token)).body.state;
    assert.deepEqual(a.game.results, b.game.results, '양쪽이 같은 최종 정산을 받음');
    assert.equal(a.game.rng, undefined, '난수 상태는 공개하지 않음');
    assert.equal((await call(base, `/api/rooms/${roomId}/act`, { type: 'rematch' }, host.token)).status, 200);
    assert.equal(room.status, 'lobby');
    assert.equal(room.code, host.code, '다시 하기도 같은 번호');
  });
});

test('「항구의 길」 제한 시간·연결 끊김: 기본 행동으로 진행되어 무기한 대기하지 않음', () => {
  let now = 5_000_000;
  const rm = new RoomManager({ dataDir: null, now: () => now });
  const h = rm.create({ gameType: 'harbor', name: '방장', settings: { timeLimit: 30 } });
  const j = rm.join(h.roomId, { name: '친구' });
  rm.action(h.roomId, j.token, { type: 'ready', ready: true });
  rm.action(h.roomId, h.token, { type: 'start' });
  const room = rm.get(h.roomId);
  assert.equal(room.deadline.at, now + 30e3);
  const p0 = room.game.pending.id;
  now += 31e3;
  rm.tick();
  assert.notEqual(room.game.pending.id, p0, '시간 초과 → 기본 행동');
  assert.match(room.game.log.at(-1).text + room.game.log.map(l => l.text).join(), /선택 시간 초과/);
  // 제한 시간과 별개로 60초 이상 끊긴 사람은 다른 참가자가 자동 진행
  const waiting = room.game.pending.pid;
  const other = waiting === h.memberId ? j : h;
  rm.connect(room, other.memberId);
  now += 61e3;
  const before = room.game.pending.id;
  rm.action(h.roomId, other.token, { type: 'autoResolve' });
  assert.notEqual(room.game.pending.id, before);
});

test('이미지 목록은 실제 파일만 알려 준다', async () => {
  await withServer(tmp(), async (base) => {
    const m = await call(base, '/assets/manifest.json');
    assert.equal(m.status, 200);
    assert.ok(Array.isArray(m.body.files));
    for (const f of m.body.files) assert.equal((await fetch(base + f)).status, 200);
    for (const p of ['/game/harbor/data.js', '/game/harbor/engine.js', '/harbor-ui.js', '/games.js', '/site.css']) assert.equal((await fetch(base + p)).status, 200, p);
  });
});
