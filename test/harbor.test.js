import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, act, awaiting, defaultActionFor, GameError, P, portsOf, worthOf, tollOf, _internal } from '../game/harbor/engine.js';
import { TILES, ECONOMY, BOARD_SIZE, PORT_IDS, REGION_PORTS, CONTRACT_RANGES, normalizeHarborSettings } from '../game/harbor/data.js';
import { randInt } from '../game/rng.js';
import { playHarbor } from './harbor-bot.js';

const members = (n) => Array.from({ length: n }, (_, i) => ({ id: 'p' + i, name: '선장' + (i + 1) }));
const fresh = (n = 2, settings = {}) => createGame(members(n), settings, 42);
const cur = (g) => P(g, g.pending.pid);

test('더블은 같은 선장의 추가 굴림, 세 번째 더블은 피난소, 유료 출항으로 복귀', () => {
  const g = fresh();
  const p = cur(g), seed = Array.from({ length: 100 }, (_, i) => i + 1).find(s => {
    const rng = { s, n: 0 };
    return randInt(rng, 1, 6) === randInt(rng, 1, 6);
  });
  for (let i = 0; i < 3; i++) {
    p.pos = 0;
    g.rng = { s: seed, n: 0 };
    act(g, p.id, { type: 'roll' });
    assert.equal(g.lastRoll.dice[0], g.lastRoll.dice[1]);
    if (i < 2) {
      if (g.pending.kind !== 'roll') act(g, p.id, defaultActionFor(g, p.id));
      assert.equal(g.pending.pid, p.id);
    }
  }
  assert.equal(TILES[p.pos].type, 'shelter');
  assert.equal(p.sheltered, 2);
  _internal.endTurn(g);
  assert.equal(g.pending.kind, 'shelter');
  const cash = p.cash;
  act(g, p.id, { type: 'release' });
  assert.equal(p.cash, cash - ECONOMY.shelterFee);
  assert.equal(p.sheltered, 0);
  assert.equal(g.pending.kind, 'roll');
});

test('인수 대금은 소유자에게 지급, 해상 기지는 인수 금지, 세 권역 완성은 즉시 승리', () => {
  const g = fresh(), p = cur(g), other = g.players.find(x => x !== p);
  for (const i of REGION_PORTS.west) g.owners[i] = { pid: other.id, level: 0 };
  const i = REGION_PORTS.west[0];
  const fee = TILES[i].toll[0] * ECONOMY.regionMultiplier;
  assert.equal(tollOf(g, i), fee);
  p.pos = i;
  const cash = other.cash;
  _internal.land(g, p);
  assert.equal(g.pending.kind, 'takeover');
  const cost = g.pending.cost;
  act(g, p.id, { type: 'takeover' });
  assert.equal(other.cash, cash + fee + cost);
  assert.equal(g.owners[i].pid, p.id);
  assert.equal(tollOf(g, REGION_PORTS.west[1]), TILES[REGION_PORTS.west[1]].toll[0]);
  g.owners[i].level = ECONOMY.maxLevel;
  other.pos = i;
  _internal.land(g, other);
  assert.notEqual(g.pending.kind, 'takeover');
  for (const region of ['west', 'north', 'east']) {
    for (const i of REGION_PORTS[region]) g.owners[i] = { pid: p.id, level: 0 };
  }
  _internal.endTurn(g);
  assert.equal(g.results[0].pid, p.id);
});

test('관리비가 기금에 쌓이고 선원 조합에서 지급된다. 쾌속선은 유효한 항구로 이동', () => {
  const g = fresh(), p = cur(g), other = g.players.find(x => x !== p);
  p.pos = TILES.find(t => t.type === 'tax').i;
  _internal.land(g, p);
  assert.equal(g.fund, ECONOMY.harborTax);
  other.pos = TILES.find(t => t.type === 'fund').i;
  _internal.land(g, other);
  assert.equal(other.cash, ECONOMY.startCash + ECONOMY.harborTax);
  assert.equal(g.fund, 0);
  p.pos = TILES.find(t => t.type === 'charter').i;
  _internal.land(g, p);
  assert.throws(() => act(g, p.id, { type: 'sail', tile: 0 }), GameError);
  const dest = PORT_IDS.find(i => i > p.pos);
  act(g, p.id, { type: 'sail', tile: dest });
  assert.equal(p.pos, dest);
  assert.equal(g.pending.kind, 'buy');
  assert.equal(p.cash, ECONOMY.startCash - ECONOMY.harborTax - ECONOMY.charterFee);
});

test('기존 24칸 저장 방은 주사위 한 개와 기존 순환 경계를 사용', () => {
  const g = fresh();
  delete g.boardSize;
  const p = cur(g);
  p.pos = 23;
  act(g, p.id, { type: 'roll' });
  assert.equal(g.lastRoll.dice.length, 1);
  assert.ok(p.pos < 6);
  assert.equal(p.stats.supply, ECONOMY.supply);
});

test('보드 데이터: 40칸, 출항지 1·항구·시장·이벤트 배치, 가격표가 단계별로 증가', () => {
  assert.equal(BOARD_SIZE, 40);
  assert.equal(TILES[0].type, 'start');
  assert.ok(PORT_IDS.length >= 12);
  for (const type of ['market', 'event']) assert.ok(TILES.some(t => t.type === type));
  for (const i of PORT_IDS) {
    const t = TILES[i];
    assert.ok(t.toll[0] < t.toll[1] && t.toll[1] < t.toll[2], t.name);
    assert.ok(t.buyback[0] < t.price && t.buyback[2] > t.buyback[0], t.name);
  }
  assert.ok(TILES.slice(1, 5).some(t => t.type === 'port' && t.price <= ECONOMY.startCash / 4), '초반 칸에 싼 항구');
});

test('2·3·4인 × 여러 전략 × 시드 300판이 진행 불능 없이 끝까지 진행', () => {
  for (const n of [2, 3, 4]) {
    for (let seed = 1; seed <= 100; seed++) {
      const style = (pid) => ['random', 'buyer', 'trader', 'default'][(Number(pid.slice(1)) + seed) % 4];
      const { g } = playHarbor(n, { rounds: [6, 8, 10, 12][seed % 4] }, seed * 101, { style });
      assert.equal(g.phase, 'over');
      assert.equal(g.results.length, n);
      assert.equal(g.results[0].rank, 1);
      for (const p of g.players) assert.ok(p.cash >= 0, '음수 현금 없음');
      for (const r of g.results) if (!r.bankrupt) assert.equal(r.total, r.cash + r.portValue);
    }
  }
});

test('같은 시드 + 같은 행동 = 같은 결과 (저장 후 재생 일치)', () => {
  const { g, actions } = playHarbor(4, {}, 777, { style: 'random' });
  const g2 = createGame(members(4), {}, 777);
  for (const [pid, a] of actions) act(g2, pid, a);
  assert.equal(JSON.stringify(g2), JSON.stringify(g));
  const mid = createGame(members(3), {}, 9);
  act(mid, mid.pending.pid, { type: 'roll' });
  const copy = JSON.parse(JSON.stringify(mid));
  const pid = mid.pending.pid;
  act(mid, pid, defaultActionFor(mid, pid));
  act(copy, pid, defaultActionFor(copy, pid));
  assert.equal(JSON.stringify(copy), JSON.stringify(mid), 'JSON 복원 후 이어서 진행해도 동일');
});

test('라운드: 생존자가 한 번씩 차례를 마치면 다음 라운드, 설정 라운드 후 종료', () => {
  const g = fresh(3, { rounds: 6 });
  assert.equal(g.round, 1);
  let turns = 0;
  while (g.round === 1) { const pid = awaiting(g)[0]; act(g, pid, defaultActionFor(g, pid)); if (g.pending?.kind === 'roll') turns++; }
  assert.ok(turns >= 3, '더블 추가 굴림을 포함해 모두가 차례를 진행');
  assert.equal(normalizeHarborSettings({ rounds: 99 }).rounds, 10);
});

test('출항지를 지나가거나 도착하면 그 이동에서 보급금을 한 번만 받는다', () => {
  const g = fresh();
  const p = cur(g);
  p.pos = BOARD_SIZE - 3; const c0 = p.cash;
  _internal.move(g, p, 5);
  assert.equal(p.cash, c0 + ECONOMY.supply);
  p.pos = BOARD_SIZE - 4; const c1 = p.cash;
  _internal.move(g, p, 4); // 0 에 도착
  assert.equal(p.pos, 0);
  assert.equal(p.cash, c1 + ECONOMY.supply);
});

test('매입·지나가기, 내 항구 재도착 시 해상 기지까지 확장, 다른 사람 항구 이용료', () => {
  const g = fresh();
  const a = cur(g), b = g.players.find(p => p !== a);
  a.pos = 0;
  _internal.move(g, a, 1); _internal.land(g, a);
  assert.equal(g.pending.kind, 'buy');
  act(g, a.id, { type: 'buy' });
  assert.equal(g.owners[1].pid, a.id);
  assert.equal(a.cash, ECONOMY.startCash - TILES[1].price);
  // 같은 사람이 아니면 매입 행동 불가
  assert.throws(() => act(g, a.id, { type: 'roll' }), GameError);
  // b 가 a 의 항구에 도착 → 이용료
  b.pos = 0; const bc = b.cash, ac = a.cash;
  _internal.move(g, b, 1); _internal.land(g, b);
  assert.equal(b.cash, bc - TILES[1].toll[0]);
  assert.equal(a.cash, ac + TILES[1].toll[0]);
  if (g.pending.kind === 'takeover') act(g, b.id, { type: 'pass' });
  for (let lv = 1; lv <= ECONOMY.maxLevel; lv++) {
    assert.equal(g.pending.pid, a.id);
    a.pos = 0; _internal.move(g, a, 1); _internal.land(g, a);
    assert.equal(g.pending.kind, 'upgrade');
    act(g, a.id, { type: 'upgrade' });
    assert.equal(g.owners[1].level, lv);
    act(g, b.id, defaultActionFor(g, b.id)); // b 차례 진행
    while (g.pending.pid !== a.id || g.pending.kind !== 'roll') act(g, g.pending.pid, defaultActionFor(g, g.pending.pid));
  }
  a.pos = 0; _internal.move(g, a, 1); _internal.land(g, a);
  assert.notEqual(g.pending.kind, 'upgrade', '최대 단계에서는 확장 없음');
});

test('화물 시장: 서로 다른 목적지 계약 2개, 한 번에 한 건, 목적지 통과 시 자동 보상', () => {
  const g = fresh();
  const a = cur(g);
  a.pos = 2; _internal.move(g, a, 1); _internal.land(g, a);
  assert.equal(g.pending.kind, 'market');
  const [c1, c2] = g.pending.contracts;
  assert.notEqual(c1.dest, c2.dest);
  for (const [k, c] of [c1, c2].entries()) {
    const [lo, hi] = CONTRACT_RANGES[k];
    assert.ok(c.dist >= lo && c.dist <= hi);
    assert.equal(TILES[c.dest].type, 'port');
  }
  act(g, a.id, { type: 'contract', index: 1 });
  assert.equal(a.cargo.dest, c2.dest);
  // 시장에 다시 와도 새 계약 없음
  while (g.pending.pid !== a.id) act(g, g.pending.pid, defaultActionFor(g, g.pending.pid));
  a.pos = 9; _internal.move(g, a, 1); _internal.land(g, a);
  assert.notEqual(g.pending.kind, 'market');
  // 목적지를 지나가면 배송
  const cash = a.cash;
  a.pos = (c2.dest - 1 + BOARD_SIZE) % BOARD_SIZE;
  _internal.move(g, a, 3);
  assert.equal(a.cargo, null);
  assert.ok(a.cash >= cash + c2.reward);
  assert.equal(a.stats.delivered, 1);
});

test('같은 칸에서 정박료가 생기면 배송 보상을 먼저 받고 정산한다', () => {
  const g = fresh();
  const a = cur(g), b = g.players.find(p => p !== a);
  const dest = 9;
  g.owners[dest] = { pid: b.id, level: 2 };
  a.cash = 0;
  a.cargo = { cargo: 'fish', cargoName: '건어물', dest, destName: TILES[dest].name, dist: 5, reward: 600, from: 3 };
  a.pos = dest - 1;
  _internal.move(g, a, 1); _internal.land(g, a);
  assert.equal(a.cash, 600 - TILES[dest].toll[2]);
  assert.equal(g.pending.kind, 'roll', '부족하지 않으므로 정산 없이 다음 차례');
  const lines = g.log.map(l => l.kind);
  assert.ok(lines.lastIndexOf('deliver') < lines.lastIndexOf('toll'));
});

test('돈이 부족하면 항구 매각으로 정산, 모두 팔아도 부족하면 파산하고 생존자 1명이면 즉시 종료', () => {
  const g = fresh();
  const a = cur(g), b = g.players.find(p => p !== a);
  g.owners[1] = { pid: a.id, level: 0 };
  g.owners[2] = { pid: a.id, level: 0 };
  g.owners[13] = { pid: b.id, level: 0 };
  a.cash = 50;
  const toll = TILES[13].toll[0];
  a.pos = 12; _internal.move(g, a, 1); _internal.land(g, a);
  assert.equal(g.pending.kind, 'settle');
  assert.equal(g.pending.owed, toll);
  assert.deepEqual(defaultActionFor(g, a.id), { type: 'sell', tile: 1 }, '기본: 가장 싼 항구');
  assert.throws(() => act(g, a.id, { type: 'sell', tile: 13 }), GameError, '남의 항구는 못 판다');
  const bCash = b.cash;
  act(g, a.id, { type: 'sell', tile: 1 });
  assert.equal(g.pending.kind, 'roll', '한 곳만 팔아도 정산 완료');
  assert.equal(b.cash, bCash + toll);
  assert.equal(a.cash, 50 + TILES[1].buyback[0] - toll);
  assert.equal(g.owners[2].pid, a.id, '필요한 만큼만 매각');
  // 파산: 현금·항구로도 부족
  const g2 = fresh();
  const x = cur(g2), y = g2.players.find(p => p !== x);
  g2.owners[23] = { pid: y.id, level: 2 };
  g2.owners[1] = { pid: x.id, level: 0 };
  x.cash = 10;
  x.pos = 22; _internal.move(g2, x, 1); _internal.land(g2, x);
  assert.equal(x.bankrupt, true);
  assert.equal(portsOf(g2, x.id).length, 0);
  assert.equal(g2.owners[1], undefined, '파산자의 항구는 다시 빈 항구');
  assert.equal(g2.phase, 'over');
  assert.equal(g2.results[0].pid, y.id);
  assert.equal(g2.results[1].bankrupt, true);
});

test('동점은 공동 순위', () => {
  const g = fresh(3, { rounds: 6 });
  for (const p of g.players) p.cash = 500;
  g.players[2].cash = 400;
  g.round = 6; g.turnIdx = 2;
  _internal.endTurn(g);
  assert.equal(g.phase, 'over');
  assert.deepEqual(g.results.map(r => r.rank), [1, 1, 3]);
  assert.equal(worthOf(g, g.players[0]), 500);
});

test('기본 행동은 항상 유효하다 (시간 초과·연결 끊김 처리용)', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const g = createGame(members(4), { rounds: 6 }, seed);
    let n = 0;
    while (g.phase !== 'over' && n++ < 3000) {
      const pid = awaiting(g)[0];
      act(g, pid, defaultActionFor(g, pid));
    }
    assert.equal(g.phase, 'over');
  }
});

test('인원 제한: 1명 또는 5명이면 생성 불가', () => {
  assert.throws(() => createGame(members(1), {}, 1), GameError);
  assert.throws(() => createGame(members(5), {}, 1), GameError);
});
