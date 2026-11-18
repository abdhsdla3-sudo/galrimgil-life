import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, act, awaiting, defaultActionFor, P, shareAmounts, settlementFor, successProb, jobOptions, _internal } from '../game/engine.js';
import { presetSettings, normalizeSettings, estimateMinutes } from '../game/settings.js';
import { playToEnd } from './bot.js';

const strip = (g) => JSON.stringify(g);

test('2/4/8/12명 × 모든 프리셋이 시작부터 정산까지 완주', () => {
  for (const preset of ['short', 'standard', 'long']) for (const n of [2, 4, 8, 12]) {
    const { g } = playToEnd(n, presetSettings(preset), 77 + n);
    assert.equal(g.phase, 'over');
    assert.equal(g.results.length, n);
    assert.ok(g.players.every(p => p.finished));
    const orders = g.players.map(p => p.finishOrder).sort((a, b) => a - b);
    assert.deepEqual(orders, Array.from({ length: n }, (_, i) => i + 1));
  }
});

test('같은 시드 + 같은 행동 = 같은 결과 (저장/불러오기 후에도)', () => {
  const s = presetSettings('standard');
  const { g, actions, members } = playToEnd(4, s, 4242);
  // 처음부터 재생
  const g2 = createGame(members, s, 4242);
  for (const [pid, a] of actions) act(g2, pid, a);
  assert.equal(strip(g2), strip(g));
  // 중간에 JSON 저장 → 복원 후 이어서 재생
  const g3 = createGame(members, s, 4242);
  const half = Math.floor(actions.length / 2);
  for (const [pid, a] of actions.slice(0, half)) act(g3, pid, a);
  const restored = JSON.parse(JSON.stringify(g3));
  for (const [pid, a] of actions.slice(half)) act(restored, pid, a);
  assert.equal(strip(restored), strip(g));
});

test('최소·최대 길이, 성장기 생략, 콘텐츠 조합 16가지 모두 진행 불능 없음', () => {
  const packs = ['extraJobs', 'special', 'joint', 'extra'];
  for (let mask = 0; mask < 16; mask++) for (const [len, start] of [[8, 'growth'], [40, 'growth'], [10, 'adult']]) {
    const s = normalizeSettings({ startStage: start, lengths: { growth: len, early: len, late: len }, packs: Object.fromEntries(packs.map((k, i) => [k, !!(mask & (1 << i))])) });
    const { g } = playToEnd(3, s, mask * 31 + len);
    assert.equal(g.phase, 'over', `mask ${mask} len ${len} ${start}`);
  }
});

test('잘못된 차례·허용되지 않은 행동은 거부되고 상태가 바뀌지 않음', () => {
  const g = createGame([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], presetSettings('short'), 5);
  // 준비 단계: 동시 선택
  act(g, 'a', { type: 'simul', index: 0 });
  assert.throws(() => act(g, 'a', { type: 'simul', index: 1 }), /이미 선택/);
  act(g, 'b', { type: 'simul', index: 1 });
  // 첫 직업 동시 선택
  for (const id of ['a', 'b']) act(g, id, defaultActionFor(g, id));
  const turnPid = g.pending.pid;
  const other = turnPid === 'a' ? 'b' : 'a';
  const before = strip(g);
  assert.throws(() => act(g, other, { type: 'roll' }), /차례가 아닙니다/);
  assert.throws(() => act(g, turnPid, { type: 'choose', index: 0 }), /주사위/);
  assert.throws(() => act(g, turnPid, { type: 'useCard', index: 9 }), /없는 카드/);
  assert.throws(() => act(g, turnPid, { type: 'repay', amount: 0 }), /금액/);
  assert.equal(strip(g), before);
});

test('필수 정지: 관문 칸에서 남은 이동이 사라지고 분기에서 선택을 기다림', () => {
  const g = createGame([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], presetSettings('standard'), 11);
  act(g, 'a', { type: 'simul', index: 0 }); act(g, 'b', { type: 'simul', index: 0 });
  const gate = Object.values(g.board.nodes).find(n => n.gate === 'career');
  const p = P(g, g.pending.pid);
  // 관문 2칸 앞에 세우고 6칸 이동 시도
  const before2 = Object.values(g.board.nodes).find(n => n.next.length === 1 && g.board.nodes[n.next[0]].next.includes(gate.id) && g.board.nodes[n.next[0]].next.length === 1);
  p.pos = before2.id;
  p.turnBuff = {};
  g.pending.cards = [];
  p.cards = ['exact']; act(g, p.id, { type: 'useCard', index: 0, value: 6 });
  act(g, p.id, { type: 'roll' });
  assert.equal(p.pos, gate.id);
  assert.equal(g.pending.kind, 'choice');
  assert.equal(g.pending.src, 'career');
  assert.ok(g.pending.ctx.lines.some(l => l.includes('반드시 멈추는 칸')));
  act(g, p.id, { type: 'choose', index: 0 });
  // 다음 차례에 이 플레이어가 움직이면 갈림길 선택 대기
  while (g.pending.pid !== p.id || g.pending.kind !== 'turn') act(g, awaiting(g)[0], defaultActionFor(g, awaiting(g)[0]));
  act(g, p.id, { type: 'roll' });
  assert.equal(g.pending.kind, 'branch');
  assert.equal(g.pending.options.length, 2);
  act(g, p.id, { type: 'branch', index: 0 });
  assert.ok(p.degree, '캠퍼스 길 선택 시 학위');
  assert.ok(p.debt >= 120);
});

test('자금 부족 → 자동 대출 → 강제 매각 → 신용 경고 → 회복', () => {
  const g = createGame([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], presetSettings('short'), 3);
  const p = P(g, 'a');
  p.cash = 10; p.debt = 0; p.job = null;
  p.assets = [{ id: 'stock', name: '우량주 묶음', cat: 'stock', value: 60, income: 0 }];
  const ctx = { lines: [] };
  _internal.money(g, p, -400, '테스트 지출', ctx);
  assert.equal(p.cash, 0);
  assert.equal(p.assets.length, 0, '한도 초과로 자산 강제 매각');
  assert.equal(p.debt, 390 - 42, '매각 대금 70%로 부채 상환');
  assert.ok(p.statuses.some(s => s.id === 'credit'), '신용 경고');
  assert.ok(ctx.lines.some(l => l.includes('자동 대출')));
  // 회복: 부채가 한도(200) 이하로 내려가면 해제 + 업적
  p.debt = 150;
  _internal.updateCredit(g, p, ctx);
  assert.ok(!p.statuses.some(s => s.id === 'credit'));
  assert.ok(p.flags.recovered);
  // 월급날 이자 5% 올림
  p.cash = 0; p.debt = 101;
  _internal.payday(g, p, { lines: [] }, false);
  assert.equal(p.debt, 101);
  assert.equal(p.cash, 15 - 6, '실업 급여 15에서 이자 6(101×5% 올림) 지출');
});

test('"모두에게" 금액은 인원이 늘어도 총액 상한(기준×3)', () => {
  assert.deepEqual(shareAmounts(10, 1), { total: 10, each: 10 });
  assert.deepEqual(shareAmounts(10, 3), { total: 30, each: 10 });
  assert.deepEqual(shareAmounts(10, 11), { total: 30, each: 2 });
});

test('판정 확률 표시와 실제 판정식 일치', () => {
  assert.equal(successProb(3, 7), 3 / 6);
  assert.equal(successProb(0, 6), 1 / 6);
  assert.equal(successProb(10, 7), 1);
  assert.equal(successProb(0, 8), 0);
});

test('동점 처리: 총점 → 현금 → 먼저 은퇴', () => {
  const g = createGame([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }], presetSettings('short'), 1);
  for (const p of g.players) { p.cash = 100; p.assets = []; p.debt = 0; p.memories = 0; p.flags = {}; p.job = null; p.finished = true; }
  P(g, 'a').finishOrder = 3; P(g, 'b').finishOrder = 2; P(g, 'c').finishOrder = 1;
  // 은퇴 보너스 차이를 없애기 위해 계산값만 비교
  const s = (p) => settlementFor(g, p, () => 1).total - ([150, 100, 60][p.finishOrder - 1] || 0);
  assert.equal(s(P(g, 'a')), s(P(g, 'b')));
});

test('직업 선택지: 부족한 능력과 학위를 이유로 표시', () => {
  const g = createGame([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], presetSettings('standard'), 2);
  const p = P(g, 'a');
  p.stats = { smart: 2, body: 1, sense: 1, social: 1 };
  const opts = jobOptions(g, p, 'first');
  const teacher = opts.find(o => o.value === 'teacher');
  assert.match(teacher.disabled, /지성 2 부족/);
  assert.match(teacher.disabled, /학위 필요/);
  assert.ok(!opts.find(o => o.value === 'parttime').disabled);
});

test('같은 초기 능력에서 서로 다른 진로·전략이 다른 결과로 이어짐', () => {
  const styles = new Set();
  const jobs = new Set();
  for (let s = 0; s < 30; s++) {
    const { g } = playToEnd(4, presetSettings('standard'), 300 + s, { style: (pid) => ['random', 'money', 'love', 'default'][Number(pid.slice(1))] });
    for (const p of g.players) { if (p.job) jobs.add(p.job.id); styles.add(`${p.relation.state}`); }
  }
  assert.ok(jobs.size >= 8, `직업 다양성 ${jobs.size}`);
  assert.ok(styles.has('married') && styles.has('single'));
});

test('예상 플레이타임은 인원·길이에 따라 증가', () => {
  const a = estimateMinutes(presetSettings('short'), 2), b = estimateMinutes(presetSettings('long'), 12);
  assert.ok(b.low > a.high);
});
