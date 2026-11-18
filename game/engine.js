// 게임 규칙 엔진. 순수 함수형에 가까운 상태 머신이며 시간·Math.random 을 사용하지 않는다.
// 모든 무작위는 g.rng 로만 진행하므로 같은 시드 + 같은 행동 순서 = 같은 결과.
import { JOBS, JOB_TYPE_NAMES, JOB_CHANGE_COST, ASSETS, SHOP_LIST, CARDS, HAND_LIMIT, RANDOM_CARD_POOL, STATUSES, STATS, STAT_KEYS, STAT_MAX, STAGES,
  PARTNER_NAMES, CHILD_NAMES, TEMPERAMENTS, BACKGROUNDS, EVENTS, JOINT_EVENTS, PLAYER_COLORS, PLAYER_MARKS, SPACE_TYPES } from './content.js';
import { normalizeSettings } from './settings.js';
import { buildBoard } from './board.js';
import { nextRandom, randInt, pick, weightedPick, shuffle } from './rng.js';

export const SCHEMA_VERSION = 1;
export class GameError extends Error {}
const fail = (msg) => { throw new GameError(msg); };

const EVENT_MAP = Object.fromEntries(EVENTS.map(e => [e.id, e]));
const FINISH_BONUS = [150, 100, 60];
const MEMORY_VALUE = 15;
const ACHIEVEMENTS = {
  olympiad: ['올림피아드 수상', 30], medal: ['첫 메달', 30], president: ['반장 출신', 30], patent: ['특허 보유', 50],
  lastSeason: ['화려한 마지막 시즌', 50], recovered: ['오뚝이 인생(신용 회복)', 80], master: ['달인(능력 10 이상)', 40],
};

// ---------------- 생성 ----------------
export function createGame(members, settingsIn, seed) {
  const settings = normalizeSettings(settingsIn);
  const rng = { s: seed >>> 0, n: 0 };
  const board = buildBoard(settings, rng);
  const players = members.map((m, i) => ({
    id: m.id, name: m.name, color: PLAYER_COLORS[i % 12], mark: PLAYER_MARKS[i % 12],
    pos: board.start, stats: { smart: 1, body: 1, sense: 1, social: 1 }, cash: settings.startStage === 'growth' ? 20 : 0, debt: 0,
    assets: [], job: null, jobHistory: [], degree: false, relation: { state: 'single', partner: null, affection: 0 },
    children: [], childBoost: 0, pet: false, memories: 0, cards: [], statuses: [], flags: {}, chain: [], seen: {},
    finished: false, finishOrder: 0, turns: 0, record: [], unempPaydays: 0, turnBuff: {}, lastHelp: -99,
  }));
  const g = {
    schema: SCHEMA_VERSION, seed: seed >>> 0, rng, settings, board, players,
    order: shuffle(rng, players.map(p => p.id)), turnIdx: 0, round: 1, phase: 'prep',
    pending: null, pendingSeq: 0, log: [], logSeq: 0, feed: [], feedSeq: 0, finishCount: 0, results: null, jointCount: 0,
  };
  log(g, null, `게임 시작! 차례 순서: ${g.order.map(id => P(g, id).name).join(' → ')}`, 'system');
  if (settings.startStage === 'growth') {
    setPending(g, { kind: 'simul', sub: 'temperament', title: '어린 시절 성향', text: '모두 동시에 고릅니다. 고른 능력이 +2 됩니다.', who: players.map(p => p.id), responses: {},
      options: TEMPERAMENTS.map((t, i) => ({ label: t.label, desc: t.desc, value: i, default: i === 0 })) });
  } else {
    setPending(g, { kind: 'simul', sub: 'background', title: '성인 시작 준비: 배경 선택', text: '모두 동시에 고릅니다. 초기 능력·자금·학위가 정해지고, 이어서 첫 직업을 고릅니다.', who: players.map(p => p.id), responses: {},
      options: BACKGROUNDS.map((b, i) => ({ label: b.label, desc: b.desc, value: i, default: i === 3 })) });
  }
  return g;
}

// ---------------- 공용 도우미 ----------------
export const P = (g, id) => g.players.find(p => p.id === id);
const cur = (g) => P(g, g.order[g.turnIdx]);
const node = (g, id) => g.board.nodes[id];
export const stageOf = (g, p) => node(g, p.pos).stage;
const packOn = (g, pack) => !pack || !!g.settings.packs[pack];
const jobOn = (g, id) => packOn(g, JOBS[id].pack);
const hasStatus = (p, id) => p.statuses.some(s => s.id === id);
const fmt = (n) => (n > 0 ? '+' : '') + n;

function log(g, pid, text, kind = 'event', changes = []) {
  g.log.push({ seq: ++g.logSeq, round: g.round, pid, text, kind, changes });
  if (g.log.length > 600) g.log.splice(0, g.log.length - 600);
}
function feed(g, pid, title, text, lines, kind = 'event') {
  g.feed.push({ seq: ++g.feedSeq, pid, title, text, lines, kind });
  if (g.feed.length > 40) g.feed.splice(0, g.feed.length - 40);
}
function setPending(g, pend) { g.pending = { ...pend, id: ++g.pendingSeq }; }
function record(p, text) { p.record.push(text); }

export function debtLimit(p) {
  const rank = p.job && JOBS[p.job.id].type !== 'free' ? p.job.rank : 0;
  const assetVal = p.assets.reduce((a, x) => a + x.value, 0);
  return 200 + (p.job ? 60 * (rank + 1) : 0) + Math.floor(assetVal / 2);
}
export function netWorth(p) { return p.cash + p.assets.reduce((a, x) => a + x.value, 0) - p.debt; }

function updateCredit(g, p, ctx) {
  const over = p.debt > debtLimit(p);
  if (over && !hasStatus(p, 'credit')) { p.statuses.push({ id: 'credit', turns: -1, since: p.turns }); ctx?.lines.push('신용 경고 발생 (부채가 한도 초과)'); p.flags.hadCredit = true; }
  if (!over && hasStatus(p, 'credit')) {
    p.statuses = p.statuses.filter(s => s.id !== 'credit');
    ctx?.lines.push('신용 경고 해제!');
    if (p.flags.hadCredit) { p.flags.recovered = true; record(p, '부채 위기에서 회복했다'); }
  }
}

// 돈 변동. 지출이 현금을 넘으면 자동 대출 → 한도 초과 시 자산 강제 매각(70%) → 그래도 넘으면 신용 경고.
function money(g, p, amount, cause, ctx, { insurable = false } = {}) {
  if (!amount) return;
  if (amount > 0) { p.cash += amount; ctx.lines.push(`현금 ${fmt(amount)} (${cause})`); return; }
  let cost = -amount;
  if (insurable) {
    const ci = p.cards.indexOf('insurance');
    if (ci >= 0) { p.cards.splice(ci, 1); const saved = Math.floor(cost / 2); cost -= saved; ctx.lines.push(`생활 보험 사용: 손실 ${saved} 절감`); }
  }
  if (p.cash >= cost) { p.cash -= cost; ctx.lines.push(`현금 -${cost} (${cause})`); return; }
  const short = cost - p.cash;
  if (p.cash > 0) ctx.lines.push(`현금 -${p.cash} (${cause})`);
  p.cash = 0;
  p.debt += short;
  ctx.lines.push(`부족분 ${short} 자동 대출 → 부채 ${p.debt}`);
  while (p.debt > debtLimit(p) && p.assets.length) {
    p.assets.sort((a, b) => a.value - b.value);
    const a = p.assets.shift();
    const got = Math.floor(a.value * 0.7);
    p.debt = Math.max(0, p.debt - got);
    ctx.lines.push(`자산 강제 매각: ${a.name} (${got}으로 부채 상환)`);
    record(p, `빚 때문에 ${a.name}을(를) 팔았다`);
  }
  updateCredit(g, p, ctx);
}

function addStat(p, k, n, ctx, cause) {
  const before = p.stats[k];
  p.stats[k] = Math.max(0, Math.min(STAT_MAX, before + n));
  const d = p.stats[k] - before;
  if (d) ctx.lines.push(`${STATS[k]} ${fmt(d)}${cause ? ` (${cause})` : ''}`);
  if (p.stats[k] >= 10) p.flags.master = true;
}
function addStatus(p, id, turns, ctx) {
  const s = p.statuses.find(x => x.id === id);
  if (s) { s.turns = Math.max(s.turns, turns); s.since = p.turns; } else p.statuses.push({ id, turns, since: p.turns });
  ctx.lines.push(`상태: ${STATUSES[id].name} (${turns < 0 || turns >= 90 ? '해제 조건까지' : turns + '턴'})`);
}
function addCard(g, p, id, ctx) {
  const cid = id === 'random' ? pick(g.rng, RANDOM_CARD_POOL) : id;
  p.cards.push(cid);
  ctx.lines.push(`카드 획득: ${CARDS[cid].name}`);
  if (p.cards.length > HAND_LIMIT) { const d = p.cards.shift(); ctx.lines.push(`손패 초과로 ${CARDS[d].name} 버림`); }
}

function setJob(g, p, id, rank, ctx, how) {
  const old = p.job;
  const xp = old ? Math.floor(old.xp / 2) : 0;
  if (old) p.jobHistory.push({ id: old.id, rank: old.rank });
  p.job = { id, rank, xp: JOBS[id].type === 'growth' ? xp : 0, fails: 0 };
  p.unempPaydays = 0;
  const j = JOBS[id];
  ctx.lines.push(`직업: ${j.name} (${j.ranks[rank]})${how ? ' — ' + how : ''}`);
  if (old) ctx.lines.push(`전직: 능력·카드·자산 유지 / 이전 직급 상실, 성과 절반 이월`);
  record(p, old ? `${JOBS[old.id].name}에서 ${j.name}(으)로 전직` : `${j.name}(으)로 사회생활 시작`);
}
function loseJob(g, p, ctx) {
  if (!p.job) return;
  p.jobHistory.push({ id: p.job.id, rank: p.job.rank });
  record(p, `${JOBS[p.job.id].name} 일을 잃었다`);
  ctx.lines.push(`실직: ${JOBS[p.job.id].name}`);
  p.job = null; p.unempPaydays = 0;
}
function rankChange(g, p, d, ctx) {
  if (!p.job) return;
  const j = JOBS[p.job.id];
  const r = Math.max(0, Math.min(j.ranks.length - 1, p.job.rank + d));
  if (r === p.job.rank) { if (d > 0) money(g, p, 20, '최고 직급 보너스', ctx); return; }
  p.job.rank = r; p.job.fails = 0;
  ctx.lines.push(`${d > 0 ? '승진' : '강등'}: ${j.name} ${j.ranks[r]}`);
  if (d > 0) record(p, `${j.name} ${j.ranks[r]}(으)로 승진`); else record(p, `${j.name} ${j.ranks[r]}(으)로 강등`);
}
export function xpThreshold(g, jobId, rank) {
  const j = JOBS[jobId];
  if (!j.promo?.xp || rank >= j.promo.xp.length) return null;
  const f = Math.min(1.6, Math.max(0.5, (g.settings.lengths.early + g.settings.lengths.late) / 42));
  return Math.max(1, Math.round(j.promo.xp[rank] * f));
}
function checkGrowthPromo(g, p, ctx) {
  if (!p.job || JOBS[p.job.id].type !== 'growth') return;
  const t = xpThreshold(g, p.job.id, p.job.rank);
  if (t !== null && p.job.xp >= t) rankChange(g, p, 1, ctx);
}
export function stablePromoReady(p) {
  if (!p.job) return false;
  const j = JOBS[p.job.id];
  if (j.type !== 'stable' || p.job.rank >= j.ranks.length - 1) return false;
  return j.promo.stats.reduce((a, k) => a + p.stats[k], 0) >= j.promo.sum[p.job.rank];
}

export function jobEligibility(g, p, id) {
  const j = JOBS[id];
  const missing = [];
  for (const [k, v] of Object.entries(j.req)) if (p.stats[k] < v) missing.push(`${STATS[k]} ${v - p.stats[k]} 부족`);
  if (j.degree && !p.degree) missing.push('학위 필요');
  return missing;
}

// ---------------- 판정 ----------------
export function checkMod(p, stat, opts = {}) {
  let m = stat === 'luck' ? 0 : p.stats[stat];
  const notes = [];
  if (stat === 'body' && hasStatus(p, 'injured')) { m -= 2; notes.push('부상 -2'); }
  if (stat === 'social' && hasStatus(p, 'heartbreak')) { m -= 1; notes.push('실연 -1'); }
  if (stat === 'sense' && hasStatus(p, 'inspired')) { m += 2; notes.push('영감 +2'); }
  if (hasStatus(p, 'cheered')) { m += 2; notes.push('응원 +2'); }
  if (opts.affectionBonus) { m += p.relation.affection; notes.push(`호감도 +${p.relation.affection}`); }
  return { m, notes };
}
export const successProb = (mod, target) => Math.max(0, Math.min(6, 7 + mod - target)) / 6;
function describeCheck(p, chk) {
  const { m, notes } = checkMod(p, chk.stat, chk);
  const statName = chk.stat === 'luck' ? '운(보정 없음)' : `${STATS[chk.stat]} 보정 ${m}`;
  return { text: `판정: 주사위(1~6) + ${statName}${notes.length ? ` [${notes.join(', ')}]` : ''} ≥ ${chk.target}`, prob: Math.round(successProb(m, chk.target) * 100) };
}
function promoCheckSpec(p) {
  const j = p.job ? JOBS[p.job.id] : null;
  if (!j) return null;
  if (j.type === 'challenge') {
    if (p.job.rank >= j.ranks.length - 1) return { stat: j.promo.stat, target: 10, success: [{ cash: 60 }, { memory: 1 }], fail: [], label: '최고 직급 특별 무대' };
    return { stat: j.promo.stat, target: j.promo.target[p.job.rank], success: [{ rankUp: 1 }], fail: [{ promoFail: 1 }], label: `승진 도전 → ${j.ranks[p.job.rank + 1]}` };
  }
  const st = j.type === 'stable' ? j.promo.stats[0] : (Object.keys(j.req)[0] || 'social');
  return { stat: st, target: 8, success: [{ xp: 2 }, { cash: 20 }], fail: [{ status: 'burnout', turns: 1 }], label: '실력 발휘' };
}

// ---------------- 효과 ----------------
function applyEffects(g, p, effects, ctx) {
  for (const e of effects || []) applyEffect(g, p, e, ctx);
  updateCredit(g, p, ctx);
}
function applyEffect(g, p, e, ctx) {
  const cause = ctx.cause;
  if (e.cash !== undefined) money(g, p, e.cash, cause, ctx, { insurable: e.cash < 0 });
  if (e.stat) for (const [k, v] of Object.entries(e.stat)) addStat(p, k, v, ctx);
  if (e.statJob && p.job) { const j = JOBS[p.job.id]; const k = j.promo?.stats?.[0] || j.promo?.stat || Object.keys(j.req)[0] || 'social'; addStat(p, k, e.statJob, ctx); }
  if (e.memory) { p.memories = Math.max(0, p.memories + e.memory); ctx.lines.push(`추억 ${fmt(e.memory)}`); }
  if (e.card) addCard(g, p, e.card, ctx);
  if (e.status) addStatus(p, e.status, e.turns || 1, ctx);
  if (e.flag) { p.flags[e.flag] = true; }
  if (e.degree) { p.degree = true; p.flags.degree = true; ctx.lines.push('학위 취득'); }
  if (e.debt) { p.debt += e.debt; ctx.lines.push(`부채 +${e.debt} → ${p.debt}`); }
  if (e.meet) {
    const name = ctx.newPartner || pick(g.rng, PARTNER_NAMES);
    p.relation = { state: 'met', partner: name, affection: 0 };
    ctx.lines.push(`${name}님을 알게 되었다`);
  }
  if (e.affection) {
    const r = p.relation;
    if (r.state !== 'single') {
      r.affection = Math.max(0, Math.min(8, r.affection + e.affection));
      ctx.lines.push(`${r.partner} 호감도 ${fmt(e.affection)} → ${r.affection}`);
      if (r.state === 'met' && r.affection >= 2) { r.state = 'dating'; ctx.lines.push(`${r.partner}님과 연인이 되었다!`); record(p, `${r.partner}님과 연애 시작`); }
      if (r.affection === 0 && r.state !== 'married') { ctx.lines.push(`${r.partner}님과 멀어졌다`); record(p, `${r.partner}님과 이별`); p.relation = { state: 'single', partner: null, affection: 0 }; addStatus(p, 'heartbreak', 2, ctx); }
    }
  }
  if (e.marry && p.relation.state !== 'single') {
    p.relation.state = 'married';
    ctx.lines.push(`${p.relation.partner}님과 결혼! (월급날 배우자 수입 +10)`);
    record(p, `${p.relation.partner}님과 결혼`);
    money(g, p, -30, '결혼식', ctx);
    p.memories += 2; ctx.lines.push('추억 +2');
  }
  if (e.child) {
    const name = CHILD_NAMES[(p.children.length + g.players.indexOf(p)) % CHILD_NAMES.length];
    p.children.push(name); ctx.lines.push(`아이 "${name}" 탄생! (월급날 양육비 6)`); record(p, `아이 ${name} 탄생`);
    p.memories += 1;
  }
  if (e.childBoost) { p.childBoost += e.childBoost; ctx.lines.push('자녀 정산 보너스 +30'); }
  if (e.pet && !p.pet) { p.pet = true; ctx.lines.push('반려동물 가족이 생겼다 (월급날 비용 2)'); record(p, '반려동물 입양'); }
  if (e.xp && p.job) { p.job.xp = Math.max(0, p.job.xp + e.xp); ctx.lines.push(`성과 ${fmt(e.xp)} → ${p.job.xp}`); checkGrowthPromo(g, p, ctx); }
  if (e.rankUp) rankChange(g, p, e.rankUp, ctx);
  if (e.rankDown) rankChange(g, p, -e.rankDown, ctx);
  if (e.promoFail && p.job) {
    p.job.fails++;
    ctx.lines.push(`승진 실패 (연속 ${p.job.fails}회)`);
    if (p.job.fails >= 2) { rankChange(g, p, -1, ctx); p.job.fails = 0; }
  }
  if (e.loseJob) loseJob(g, p, ctx);
  if (e.setJob) setJob(g, p, e.setJob.id, e.setJob.rank || 0, ctx);
  if (e.asset) gainAsset(p, e.asset, ctx);
  if (e.assetValue) for (const a of p.assets) if (a.cat === e.assetValue.cat) { const old = a.value; a.value = Math.max(1, Math.round(a.value * (100 + e.assetValue.pct) / 100)); ctx.lines.push(`${a.name} 가치 ${old} → ${a.value}`); }
  if (e.payday) payday(g, p, ctx, false, '특별 상여(월급 1회분)');
  if (e.clearBad) { const n = p.statuses.length; p.statuses = p.statuses.filter(s => !STATUSES[s.id].bad || s.id === 'credit'); if (n !== p.statuses.length) ctx.lines.push('나쁜 상태 해제'); }
  if (e.fromOthers) shareMoney(g, p, e.fromOthers, 'from', ctx);
  if (e.toOthers) shareMoney(g, p, e.toOthers, 'to', ctx);
  if (e.jobSelect) ctx.after = { jobSelect: e.jobSelect };
}
function gainAsset(p, id, ctx) {
  const a = ASSETS[id];
  p.assets.push({ id, name: a.name, cat: a.cat, value: a.value, income: a.income });
  ctx.lines.push(`자산 획득: ${a.name} (가치 ${a.value})`);
  if (a.memory) { p.memories += a.memory; ctx.lines.push(`추억 +${a.memory}`); }
}
// "모두에게 주고/받기": 총액 = 기준액 × min(상대 수, 3). 인원이 늘어도 총액이 폭증하지 않고 1인 부담이 줄어든다.
export function shareAmounts(base, others) {
  if (others <= 0) return { total: 0, each: 0 };
  const total = base * Math.min(others, 3);
  return { total, each: Math.max(1, Math.floor(total / others)) };
}
function shareMoney(g, p, base, dir, ctx) {
  const others = g.players.filter(o => o.id !== p.id);
  const { each } = shareAmounts(base, others.length);
  let sum = 0;
  for (const o of others) {
    if (dir === 'from') { const amt = Math.min(o.cash, each); o.cash -= amt; sum += amt; if (amt) log(g, o.id, `${p.name}에게 ${amt} 지급`, 'money', [`현금 -${amt}`]); }
    else { o.cash += each; sum += each; log(g, o.id, `${p.name}에게서 ${each} 받음`, 'money', [`현금 +${each}`]); }
  }
  if (dir === 'from') { p.cash += sum; ctx.lines.push(`다른 플레이어들에게서 총 ${sum} 받음 (1인당 최대 ${each})`); }
  else money(g, p, -sum, `모두에게 1인당 ${each}`, ctx);
}

// ---------------- 월급날 ----------------
function payday(g, p, ctx, landed, label = '월급날') {
  const parts = [];
  let inc = 0;
  if (p.job) {
    const j = JOBS[p.job.id];
    const s = j.salary[p.job.rank];
    inc += s; parts.push(`월급 ${s}`);
    if (landed) { const b = Math.floor(s / 2); inc += b; parts.push(`정확히 도착 보너스 ${b}`); }
  } else if (stageOf(g, p) !== 'growth') {
    if (p.unempPaydays < 3) { inc += 15; parts.push('실업 급여 15'); }
    p.unempPaydays++;
  }
  if (p.relation.state === 'married') { inc += 10; parts.push('배우자 수입 10'); }
  for (const a of p.assets) if (a.income) { inc += a.income; parts.push(`${a.name} ${a.income}`); }
  if (inc) money(g, p, inc, `${label}: ${parts.join(', ')}`, ctx);
  let cost = 0; const cp = [];
  if (p.children.length) { cost += 6 * p.children.length; cp.push(`양육비 ${6 * p.children.length}`); }
  if (p.pet) { cost += 2; cp.push('반려동물 2'); }
  if (p.debt > 0) { const it = Math.ceil(p.debt * 0.05); cost += it; cp.push(`이자 ${it}`); }
  if (cost) money(g, p, -cost, cp.join(', '), ctx);
  if (p.job) {
    const j = JOBS[p.job.id];
    if (j.type === 'growth') { p.job.xp++; ctx.lines.push(`성과 +1 → ${p.job.xp}`); checkGrowthPromo(g, p, ctx); }
    if (j.type === 'stable' && stablePromoReady(p)) rankChange(g, p, 1, ctx);
  }
  updateCredit(g, p, ctx);
}

// ---------------- 대기 중인 입력 ----------------
export function awaiting(g) {
  const pd = g.pending;
  if (!pd || g.phase === 'over') return [];
  if (pd.kind === 'simul') return pd.who.filter(id => !(id in pd.responses));
  return [pd.pid];
}

function defaultIndex(options) {
  let i = options.findIndex(o => o.default && !o.disabled);
  if (i < 0) i = options.findIndex(o => !o.disabled);
  return Math.max(0, i);
}
export function defaultActionFor(g, pid) {
  const pd = g.pending;
  if (!pd) return null;
  switch (pd.kind) {
    case 'turn': return { type: 'roll' };
    case 'branch': return { type: 'branch', index: 0 };
    case 'choice': return { type: 'choose', index: defaultIndex(pd.options) };
    case 'reroll': return { type: 'reroll', use: false };
    case 'simul': return { type: 'simul', index: defaultIndex(pd.perPlayer?.[pid] || pd.options) };
  }
  return null;
}

// ---------------- 차례 ----------------
function startTurn(g) {
  const p = cur(g);
  p.turnBuff = {};
  // 뒤처진 플레이어 보정: 순자산 최하위이고 1위와 200 이상 차이 나면 4턴마다 카드 1장
  if (g.players.length >= 3 && p.turns - p.lastHelp >= 4) {
    const worths = g.players.map(netWorth);
    if (netWorth(p) === Math.min(...worths) && Math.max(...worths) - netWorth(p) >= 200) {
      const ctx = { lines: [], cause: '응원의 바람' };
      addCard(g, p, 'random', ctx); p.lastHelp = p.turns;
      log(g, p.id, '뒤처진 플레이어 보정: 응원의 바람', 'event', ctx.lines);
    }
  }
  setPending(g, { kind: 'turn', pid: p.id });
  refreshTurnCards(g);
}
function cardUsable(g, p, cid) {
  const c = CARDS[cid];
  if (c.timing === 'fail') return '판정 실패 직후에만 사용';
  if (c.timing === 'passive') return '지출 사건에서 자동 발동';
  if (p.turnBuff[cid]) return '이번 차례에 이미 사용';
  if (cid === 'datePass') { if (!['met', 'dating', 'married'].includes(p.relation.state)) return '만난 사람이나 연인이 없음'; if (hasStatus(p, 'heartbreak')) return '실연 상태'; }
  if (cid === 'cheer' && g.players.length < 2) return '대상 없음';
  if (cid === 'comeback' && !(p.cash < 50 || (!p.job && stageOf(g, p) !== 'growth'))) return '현금 50 미만이거나 무직일 때만';
  if (cid === 'referral' && stageOf(g, p) === 'growth') return '성인기부터 사용';
  if (cid === 'lesson' && STAT_KEYS.every(k => p.stats[k] >= STAT_MAX)) return '모든 능력 최대';
  return null;
}
function refreshTurnCards(g) {
  const p = cur(g);
  g.pending.cards = p.cards.map(cid => ({ id: cid, reason: cardUsable(g, p, cid) }));
  g.pending.canRepay = p.debt > 0 && p.cash > 0;
}

function endTurn(g) {
  const p = cur(g);
  for (const s of p.statuses) if (s.turns > 0 && s.turns < 90 && s.since < p.turns) s.turns--;
  p.statuses = p.statuses.filter(s => s.turns !== 0);
  p.turns++;
  if (p.turnBuff.extra && !p.finished) { log(g, p.id, '한 번 더!', 'system'); startTurn(g); return; }
  if (g.players.every(x => x.finished)) return settle(g);
  for (let k = 1; k <= g.order.length; k++) {
    const idx = (g.turnIdx + k) % g.order.length;
    if (!P(g, g.order[idx]).finished) {
      if (idx <= g.turnIdx) g.round++;
      g.turnIdx = idx; break;
    }
  }
  startTurn(g);
}
export function nextPlayerId(g) {
  for (let k = 1; k <= g.order.length; k++) {
    const id = g.order[(g.turnIdx + k) % g.order.length];
    if (!P(g, id).finished) return id;
  }
  return null;
}

// ---------------- 이동 ----------------
function rollMove(g, p) {
  const parts = [];
  let v = randInt(g.rng, 1, 6);
  parts.push(`주사위 ${v}`);
  if (p.turnBuff.exact) { v = p.turnBuff.exact; parts.push(`정조준 → ${v}`); }
  if (p.turnBuff.dash) { v += 2; parts.push('질주 +2'); }
  if (hasStatus(p, 'motivated')) { v += 1; parts.push('의욕 +1'); }
  if (hasStatus(p, 'burnout')) { v -= 1; parts.push('번아웃 -1'); }
  if (p.assets.some(a => a.cat === 'car') && v < 2) { v = 2; parts.push('자동차 최소 2'); }
  v = Math.max(1, v);
  return { v, text: parts.join(', ') };
}

function moveSteps(g, p, steps, ctx) {
  while (steps > 0) {
    const n = node(g, p.pos);
    if (n.next.length > 1) {
      const options = n.branch.map((b, i) => ({ label: b.label, desc: b.desc, to: b.to, value: i }));
      setPending(g, { kind: 'branch', pid: p.id, at: n.id, steps, options, ctx: { lines: ctx.lines, path: ctx.path } });
      return;
    }
    stepTo(g, p, n.next[0], ctx);
    steps--;
    const m = node(g, p.pos);
    if (m.stop) { if (steps > 0) ctx.lines.push(`${m.label}: 반드시 멈추는 칸 (남은 ${steps}칸 소멸)`); steps = 0; }
    else if (steps > 0) passBy(g, p, m, ctx);
  }
  land(g, p, ctx);
}
function stepTo(g, p, to, ctx) {
  const before = node(g, p.pos).stage;
  p.pos = to; ctx.path.push(to);
  const after = node(g, to).stage;
  if (before !== after) { ctx.lines.push(`★ ${STAGES[after]} 진입`); record(p, `${STAGES[after]}에 들어섰다`); }
}
function passBy(g, p, n, ctx) {
  if (n.type === 'payday') payday(g, p, ctx, false, '월급날 통과');
  if (n.type === 'allowance') money(g, p, 5, '용돈', ctx);
}

// ---------------- 칸 도착 ----------------
function land(g, p, ctx) {
  const n = node(g, p.pos);
  ctx.cause = SPACE_TYPES[n.type].name;
  const title = `${p.name} — ${n.label || SPACE_TYPES[n.type].name} 칸`;
  switch (n.type) {
    case 'start': return finishAction(g, p, ctx, title);
    case 'payday': payday(g, p, ctx, true); if (p.job && JOBS[p.job.id].type === 'challenge') return presentPromo(g, p, ctx); return finishAction(g, p, ctx, title);
    case 'allowance': money(g, p, 10, '용돈날', ctx); return finishAction(g, p, ctx, title);
    case 'card': addCard(g, p, 'random', ctx); return finishAction(g, p, ctx, title);
    case 'shop': return presentShop(g, p, ctx);
    case 'together': if (g.settings.packs.joint) return startJoint(g, p, ctx); break;
    case 'gate':
      if (n.gate === 'career') return presentCareerGate(g, p, ctx);
      if (n.gate === 'firstJob') { if (!p.job || JOBS[p.job.id].type === 'free') return presentJobSelect(g, p, ctx, 'first'); return finishAction(g, p, ctx, title); }
      if (n.gate === 'midlife') return presentMidlife(g, p, ctx);
      break;
    case 'goal': return finishPlayer(g, p, ctx);
  }
  return presentEvent(g, p, n.type === 'together' ? 'event' : n.type, ctx);
}

function finishAction(g, p, ctx, title, text = '') {
  updateCredit(g, p, ctx);
  if (ctx.lines.length || title) {
    feed(g, p.id, title || p.name, text, ctx.lines.slice());
    log(g, p.id, title + (text ? ` · ${text}` : ''), 'event', ctx.lines.slice());
  }
  if (ctx.after?.jobSelect) {
    const mode = ctx.after.jobSelect;
    return presentJobSelect(g, p, { lines: [], path: [], cause: '직업 선택', returnTo: ctx.returnTo }, mode);
  }
  if (ctx.returnTo === 'turn') { setPending(g, { kind: 'turn', pid: p.id }); refreshTurnCards(g); return; }
  endTurn(g);
}

// ---------------- 사건 선택/표시 ----------------
function whenOk(g, p, w = {}) {
  if (w.minStat) for (const [k, v] of Object.entries(w.minStat)) if (p.stats[k] < v) return false;
  if (w.hasJob && !p.job) return false;
  if (w.unemployed && p.job) return false;
  if (w.jobType && (!p.job || JOBS[p.job.id].type !== w.jobType)) return false;
  if (w.notJobType && p.job && JOBS[p.job.id].type === w.notJobType) return false;
  if (w.notSafeJob && p.job && JOBS[p.job.id].safe) return false;
  if (w.jobId && p.job?.id !== w.jobId) return false;
  if (w.relation && !w.relation.includes(p.relation.state)) return false;
  if (w.minAffection && p.relation.affection < w.minAffection) return false;
  if (w.minChildren && p.children.length < w.minChildren) return false;
  if (w.noPet && p.pet) return false;
  if (w.notStatus && hasStatus(p, w.notStatus)) return false;
  if (w.notCredit && hasStatus(p, 'credit')) return false;
  if (w.flag && !p.flags[w.flag]) return false;
  if (w.notFlag && p.flags[w.notFlag]) return false;
  if (w.degree && !p.degree) return false;
  if (w.hasAssetCat && !p.assets.some(a => a.cat === w.hasAssetCat)) return false;
  return true;
}
export function eventAvailable(g, p, e, space, stage) {
  if (!e.spaces.includes(space) || !e.stages.includes(stage)) return false;
  if (!packOn(g, e.pack)) return false;
  if (e.requires && !e.requires.every(k => g.settings.packs[k])) return false;
  if (e.when?.jobId && !jobOn(g, e.when.jobId)) return false;
  if (!whenOk(g, p, e.when)) return false;
  if (e.once && p.seen[e.id] !== undefined) return false;
  if (e.cooldown && p.seen[e.id] !== undefined && p.turns - p.seen[e.id] < e.cooldown) return false;
  return true;
}
function pickEvent(g, p, space) {
  const stage = stageOf(g, p);
  for (let i = 0; i < p.chain.length; i++) {
    const e = EVENT_MAP[p.chain[i]];
    if (e && e.spaces.includes(space) && e.stages.includes(stage) && packOn(g, e.pack)) { p.chain.splice(i, 1); return e; }
  }
  const list = EVENTS.filter(e => !e.chainOnly && eventAvailable(g, p, e, space, stage));
  // 같은 사건이 너무 자주 나오지 않도록 최근 본 사건 가중치 감소
  return weightedPick(g.rng, list, e => (e.weight || 1) * (p.seen[e.id] !== undefined && p.turns - p.seen[e.id] < 6 ? 0.3 : 1));
}
const fill = (s, p, ctx) => (s || '').replaceAll('{partner}', p.relation.partner || '그 사람').replaceAll('{newPartner}', ctx.newPartner || '').replaceAll('{child}', p.children[p.children.length - 1] || '아이');

function presentEvent(g, p, space, ctx) {
  const e = pickEvent(g, p, space);
  if (!e) { money(g, p, 10, '평범한 하루', ctx); return finishAction(g, p, ctx, `${p.name} — 평범한 하루`, '특별한 일 없이 하루가 지나갔다.'); }
  p.seen[e.id] = p.turns;
  if (e.text.includes('{newPartner}')) ctx.newPartner = pick(g.rng, PARTNER_NAMES);
  ctx.cause = fill(e.title, p, ctx);
  if (!e.options) {
    applyEffects(g, p, e.effects, ctx);
    return finishAction(g, p, ctx, `${p.name} — ${fill(e.title, p, ctx)}`, fill(e.text, p, ctx));
  }
  const options = e.options.map((o, i) => describeOption(g, p, o, i));
  // 모든 선택지가 막히면(비용 부족 등) 진행 불능을 막는 대체 선택지
  if (options.every(o => o.disabled)) options.push({ label: '형편이 안 되어 넘어간다', value: options.length, desc: '변화 없음', default: true, fallback: true });
  setPending(g, { kind: 'choice', pid: p.id, src: 'event', eventId: e.id, title: `${p.name} — ${fill(e.title, p, ctx)}`, text: fill(e.text, p, ctx), options, ctx });
}
function describeOption(g, p, o, i) {
  const out = { label: o.label, value: i, desc: o.desc || effectSummary(o.effects), default: !!o.default };
  if (o.cost) { out.cost = o.cost; if (p.cash < o.cost) out.disabled = `현금 부족 (필요 ${o.cost}, 보유 ${p.cash})`; }
  if (o.when && !whenOk(g, p, o.when)) out.disabled = '조건 불충족';
  let chk = o.check;
  if (o.promoCheck) { chk = promoCheckSpec(p); if (!chk) out.disabled = '직업 없음'; else out.desc = chk.label; }
  if (chk) { const d = describeCheck(p, chk); out.check = d.text; out.prob = d.prob; out.succ = effectSummary(o.success || chk.success); out.fail = effectSummary(o.fail || chk.fail) || '변화 없음'; }
  if (o.buy) { const a = ASSETS[o.buy]; const r = buyReason(p, a.price); if (r) out.disabled = r; out.desc = `${a.desc}. 가치 ${a.value}`; out.cost = a.price; }
  return out;
}
export function effectSummary(effects) {
  if (!effects || !effects.length) return '';
  return effects.map(e => {
    if (e.cash !== undefined) return `현금 ${fmt(e.cash)}`;
    if (e.stat) return Object.entries(e.stat).map(([k, v]) => `${STATS[k]} ${fmt(v)}`).join(', ');
    if (e.memory) return `추억 ${fmt(e.memory)}`;
    if (e.card) return e.card === 'random' ? '카드 1장' : `카드: ${CARDS[e.card].name}`;
    if (e.status) return `${STATUSES[e.status].name} ${e.turns || 1}턴`;
    if (e.xp) return `성과 ${fmt(e.xp)}`;
    if (e.affection) return `호감도 ${fmt(e.affection)}`;
    if (e.meet) return '새 인연';
    if (e.marry) return '결혼 (식 비용 30)';
    if (e.child) return '자녀 +1';
    if (e.pet) return '반려동물';
    if (e.rankUp) return '승진';
    if (e.rankDown) return '강등';
    if (e.promoFail) return '승진 실패 누적';
    if (e.loseJob) return '실직';
    if (e.setJob) return `${JOBS[e.setJob.id].name}(으)로 전직`;
    if (e.debt) return `부채 +${e.debt}`;
    if (e.asset) return `자산: ${ASSETS[e.asset].name}`;
    if (e.degree) return '학위';
    if (e.jobSelect) return '직업 선택';
    if (e.payday) return '월급 1회분';
    if (e.statJob) return '직업 핵심 능력 +1';
    if (e.fromOthers) return '모두에게서 받기';
    if (e.toOthers) return '모두에게 주기';
    if (e.clearBad) return '나쁜 상태 해제';
    return '';
  }).filter(Boolean).join(', ');
}
function buyReason(p, price) {
  if (hasStatus(p, 'credit')) return '신용 경고 중에는 구매 불가';
  const loan = Math.max(0, price - p.cash);
  if (p.debt + loan > debtLimit(p)) return `대출 한도 부족 (한도 ${debtLimit(p)}, 현재 부채 ${p.debt})`;
  return null;
}

function presentPromo(g, p, ctx) {
  const spec = promoCheckSpec(p);
  const d = describeCheck(p, spec);
  setPending(g, { kind: 'choice', pid: p.id, src: 'promo', title: `${p.name} — 월급날 승진 도전`, text: `${JOBS[p.job.id].name}: ${spec.label}`, ctx,
    options: [{ label: '도전한다', value: 0, check: d.text, prob: d.prob, succ: effectSummary(spec.success), fail: effectSummary(spec.fail) || '변화 없음', default: true }, { label: '다음 기회에', value: 1, desc: '변화 없음' }] });
}
function presentShop(g, p, ctx) {
  const options = SHOP_LIST.map(id => {
    const a = ASSETS[id];
    const loan = Math.max(0, a.price - p.cash);
    return { label: `${a.name} 구매 (${a.price})`, value: 'buy:' + id, cost: a.price, desc: `${a.desc} · 가치 ${a.value}${loan ? ` · 대출 ${loan} 포함` : ''}`, disabled: buyReason(p, a.price) || undefined };
  });
  p.assets.forEach((a, i) => options.push({ label: `${a.name} 매각 (+${Math.floor(a.value * 0.8)})`, value: 'sell:' + i, desc: '평가액의 80%로 판매' }));
  options.push({ label: '구경만 한다', value: 'pass', default: true, desc: '변화 없음' });
  setPending(g, { kind: 'choice', pid: p.id, src: 'shop', title: `${p.name} — 마켓`, text: '자산을 사거나 팔 수 있다. 현금이 부족하면 대출 한도 안에서 빌린다.', options, ctx });
}
function presentCareerGate(g, p, ctx) {
  const options = STAT_KEYS.map(k => {
    const before = Object.keys(JOBS).filter(id => jobOn(g, id) && !jobEligibility(g, p, id).length);
    p.stats[k]++;
    const after = Object.keys(JOBS).filter(id => jobOn(g, id) && !jobEligibility(g, p, id).length && !before.includes(id));
    p.stats[k]--;
    return { label: `${STATS[k]} 보완 (+1)`, value: k, desc: after.length ? `새로 가능: ${after.map(id => JOBS[id].name).join(', ')}` : `현재 ${p.stats[k]}` };
  });
  const low = STAT_KEYS.reduce((a, k) => (p.stats[k] < p.stats[a] ? k : a), STAT_KEYS[0]);
  options.find(o => o.value === low).default = true;
  setPending(g, { kind: 'choice', pid: p.id, src: 'career', title: `${p.name} — 진로의 문`, text: '성장기를 마쳤다. 진로 상담으로 부족한 능력 하나를 보완한다. 다음 이동 때 대학/사회 갈림길을 고른다.', options, ctx });
}
function presentMidlife(g, p, ctx) {
  const options = [
    { label: '자기계발', value: 'self', desc: '가장 높은 능력 +1, 카드 1장', default: true },
    { label: '전직 상담', value: 'change', desc: `직업을 바꾼다 (교육비 ${JOB_CHANGE_COST})` },
    { label: '가족·친구와 시간', value: 'family', desc: '추억 +2, 호감도 +1' },
    { label: '재테크 공부', value: 'money', desc: '지성 +1, 현금 +30' },
  ];
  setPending(g, { kind: 'choice', pid: p.id, src: 'midlife', title: `${p.name} — 인생 중간 점검`, text: '인생의 절반을 지났다. 다음 단계를 준비한다.', options, ctx });
}
export function jobOptions(g, p, mode) {
  const opts = [];
  for (const [id, j] of Object.entries(JOBS)) {
    if (!jobOn(g, id)) continue;
    if (mode === 'change' && p.job?.id === id) continue;
    const miss = jobEligibility(g, p, id);
    let cost = mode === 'change' && !p.turnBuff.referral ? JOB_CHANGE_COST : 0;
    if (j.startCost) cost += j.startCost;
    const o = { label: `${j.name} · ${JOB_TYPE_NAMES[j.type]}`, value: id, cost: cost || undefined,
      desc: `월급 ${j.salary[0]}${j.salary.length > 1 ? '~' + j.salary[j.salary.length - 1] : ''} · ${j.desc}` };
    if (miss.length) o.disabled = miss.join(', ');
    else if (cost && p.cash < cost) o.disabled = `현금 부족 (필요 ${cost})`;
    opts.push(o);
  }
  if (mode === 'change') opts.push({ label: '지금 직업 유지', value: 'keep', default: true, desc: '변화 없음' });
  else {
    const best = opts.filter(o => !o.disabled && o.value !== 'parttime').sort((a, b) => JOBS[b.value].salary[0] - JOBS[a.value].salary[0])[0];
    (best || opts.find(o => o.value === 'parttime')).default = true;
  }
  return opts;
}
function presentJobSelect(g, p, ctx, mode) {
  const titles = { first: '첫 직장 선택', free: '새 직업 선택', change: '전직 상담' };
  setPending(g, { kind: 'choice', pid: p.id, src: 'job', mode, title: `${p.name} — ${titles[mode]}`,
    text: mode === 'change' ? '전직하면 능력·카드·자산은 유지, 직급은 처음부터, 성과는 절반만 이어진다.' : '조건을 충족한 직업을 고른다. 부족한 능력은 옆에 표시된다.',
    options: jobOptions(g, p, mode), ctx });
}

// ---------------- 공동 사건 ----------------
function startJoint(g, p, ctx) {
  const ev = JOINT_EVENTS[g.jointCount++ % JOINT_EVENTS.length];
  const perPlayer = {};
  for (const o of g.players) perPlayer[o.id] = ev.options.map((x, i) => ({ label: x.label, value: i, default: !!x.default, disabled: o.cash < x.amount ? `현금 부족 (보유 ${o.cash})` : undefined }));
  log(g, p.id, `${p.name}이(가) 모두의 광장에 도착: ${ev.title}`, 'joint', ctx.lines.slice());
  setPending(g, { kind: 'simul', sub: 'joint', jointId: ev.id, trigger: p.id, title: `공동 사건: ${ev.title}`, text: ev.text, who: g.players.map(x => x.id), responses: {}, perPlayer, ctx });
}
function resolveJoint(g, pd) {
  const ev = JOINT_EVENTS.find(e => e.id === pd.jointId);
  const startIdx = g.order.indexOf(pd.trigger);
  const ordered = g.order.slice(startIdx).concat(g.order.slice(0, startIdx)).map(id => P(g, id)); // 적용 순서: 도착한 플레이어부터 차례 순서대로
  const amt = (p) => ev.options[pd.responses[p.id]]?.amount || 0;
  const lines = [];
  const ctxs = new Map(ordered.map(p => [p.id, { lines: [], cause: ev.title }]));
  const n = g.players.length;
  if (ev.kind === 'pool') {
    const total = ordered.reduce((a, p) => a + amt(p), 0);
    const target = ev.target * n;
    const ok = total >= target;
    lines.push(`모인 금액 ${total} / 목표 ${target} → ${ok ? '성공!' : '실패 (기부금 절반 반환)'}`);
    const top = Math.max(...ordered.map(amt));
    for (const p of ordered) {
      const a = amt(p); if (!a) continue;
      const c = ctxs.get(p.id);
      money(g, p, -a, '축제 기부', c);
      if (ok) { p.memories += 1; c.lines.push('추억 +1'); if (a === top) addStat(p, 'social', 1, c, '최다 기부'); }
      else money(g, p, Math.floor(a / 2), '기부금 반환', c);
    }
  } else if (ev.kind === 'fund') {
    const mult = pick(g.rng, [0.5, 0.8, 1.2, 1.5, 2]);
    lines.push(`펀드 수익 배수: ×${mult}`);
    for (const p of ordered) { const a = amt(p); if (!a) continue; const c = ctxs.get(p.id); money(g, p, -a, '펀드 투자', c); money(g, p, Math.floor(a * mult), `펀드 정산 ×${mult}`, c); }
  } else if (ev.kind === 'gather') {
    const att = ordered.filter(p => amt(p) > 0);
    lines.push(`참석 ${att.length}명 / 전체 ${n}명`);
    for (const p of att) {
      const c = ctxs.get(p.id);
      money(g, p, -10, '동창회 회비', c);
      if (att.length >= 2) addStat(p, 'social', 1, c);
      if (att.length >= Math.ceil(n / 2)) { p.memories += 1; c.lines.push('추억 +1'); }
      if (att.length === n) addCard(g, p, 'random', c);
    }
  }
  for (const p of ordered) {
    const c = ctxs.get(p.id);
    updateCredit(g, p, c);
    const choice = ev.options[pd.responses[p.id]]?.label || '-';
    lines.push(`${p.name}: ${choice}${c.lines.length ? ' → ' + c.lines.join(', ') : ''}`);
  }
  feed(g, null, `공동 사건 결과: ${ev.title}`, '', lines, 'joint');
  log(g, null, `공동 사건 결과: ${ev.title}`, 'joint', lines);
}

// ---------------- 종료/정산 ----------------
function finishPlayer(g, p, ctx) {
  p.finished = true;
  p.finishOrder = ++g.finishCount;
  ctx.lines.push(`${p.finishOrder}번째로 은퇴! 은퇴 순위 보너스 ${FINISH_BONUS[p.finishOrder - 1] || 0} (정산 시 반영)`);
  record(p, `${p.finishOrder}번째로 은퇴`);
  feed(g, p.id, `${p.name} — 은퇴`, '이제부터 차례는 건너뛰지만, 공동 사건 참여와 다른 사람의 효과는 계속 받습니다.', ctx.lines.slice(), 'finish');
  log(g, p.id, `${p.name} 은퇴 (${p.finishOrder}번째)`, 'system', ctx.lines.slice());
  endTurn(g);
}
export function settlementFor(g, p, appraise) {
  const rows = [];
  rows.push(['현금', p.cash]);
  for (const a of p.assets) {
    let v = a.value;
    if (a.cat === 'treasure') { const m = appraise(); v = Math.round(a.value * m); rows.push([`자산: ${a.name} (감정 ×${m})`, v]); }
    else rows.push([`자산: ${a.name}`, v]);
  }
  if (p.debt) rows.push(['부채', -p.debt]);
  const fb = FINISH_BONUS[p.finishOrder - 1] || 0;
  if (fb) rows.push([`은퇴 순위 보너스 (${p.finishOrder}위)`, fb]);
  if (p.relation.state === 'married') rows.push([`배우자 ${p.relation.partner}`, 100]);
  if (p.children.length) rows.push([`자녀 ${p.children.length}명`, 60 * p.children.length + 30 * p.childBoost]);
  if (p.pet) rows.push(['반려동물', 20]);
  if (p.memories) rows.push([`추억 ${p.memories}개 × ${MEMORY_VALUE}`, p.memories * MEMORY_VALUE]);
  if (p.job && p.job.rank > 0) rows.push([`최종 직급 ${JOBS[p.job.id].ranks[p.job.rank]}`, p.job.rank * 40]);
  for (const [k, [name, v]] of Object.entries(ACHIEVEMENTS)) if (p.flags[k]) rows.push([`업적: ${name}`, v]);
  return { rows, total: rows.reduce((a, r) => a + r[1], 0) };
}
function settle(g) {
  const appraise = () => pick(g.rng, [0.2, 0.5, 1, 1.5, 2, 4]);
  const res = g.players.map(p => {
    const s = settlementFor(g, p, appraise);
    const job = p.job ? `${JOBS[p.job.id].name} ${JOBS[p.job.id].ranks[p.job.rank]}` : '무직';
    const summary = `${job} · ${p.relation.state === 'married' ? '기혼' : p.relation.state === 'single' ? '싱글' : '연애 중'}${p.children.length ? ` · 자녀 ${p.children.length}` : ''} · 추억 ${p.memories}`;
    return { pid: p.id, name: p.name, color: p.color, mark: p.mark, rows: s.rows, total: s.total, cash: p.cash, finishOrder: p.finishOrder, summary, record: p.record.slice() };
  });
  // 동점 규칙: 총점 → 현금 → 먼저 은퇴한 순
  res.sort((a, b) => b.total - a.total || b.cash - a.cash || a.finishOrder - b.finishOrder);
  res.forEach((r, i) => { r.rank = i + 1; });
  g.results = res;
  g.phase = 'over';
  g.pending = { kind: 'over', id: ++g.pendingSeq };
  log(g, null, `게임 종료! 1위: ${res[0].name} (${res[0].total})`, 'system');
  feed(g, null, '최종 정산', `1위 ${res[0].name}`, res.map(r => `${r.rank}위 ${r.name}: ${r.total}`), 'over');
}

// ---------------- 행동 처리 ----------------
export function act(g, pid, a) {
  if (g.phase === 'over') fail('게임이 끝났습니다.');
  const pd = g.pending;
  if (!a || typeof a.type !== 'string') fail('잘못된 요청');
  if (pd.kind === 'simul') return actSimul(g, pid, a);
  if (pd.pid !== pid) fail('지금은 내 차례가 아닙니다.');
  const p = P(g, pid);
  switch (pd.kind) {
    case 'turn': return actTurn(g, p, a);
    case 'branch': {
      if (a.type !== 'branch') fail('갈림길을 선택해야 합니다.');
      const opt = pd.options[a.index];
      if (!opt) fail('없는 길입니다.');
      const n = node(g, pd.at);
      const b = n.branch[a.index];
      const ctx = { lines: pd.ctx.lines, path: pd.ctx.path, cause: b.label };
      ctx.lines.push(`갈림길: ${b.label} 선택`);
      applyEffects(g, p, b.effects, ctx);
      if (b.effects?.length) record(p, `${b.label}을(를) 택했다`);
      stepTo(g, p, b.to, ctx);
      let steps = pd.steps - 1;
      const m = node(g, p.pos);
      if (m.stop) steps = 0; else if (steps > 0) passBy(g, p, m, ctx);
      return moveSteps(g, p, steps, ctx);
    }
    case 'choice': {
      if (a.type !== 'choose') fail('선택지를 골라야 합니다.');
      const opt = pd.options[a.index];
      if (!opt) fail('없는 선택지입니다.');
      if (opt.disabled) fail(`선택할 수 없습니다: ${opt.disabled}`);
      return resolveChoice(g, p, pd, a.index);
    }
    case 'reroll': {
      if (a.type !== 'reroll') fail('다시 굴릴지 선택해야 합니다.');
      const ctx = pd.ctx;
      if (a.use) {
        const ci = p.cards.indexOf('retry');
        if (ci < 0) fail('카드가 없습니다.');
        p.cards.splice(ci, 1);
        ctx.lines.push('"다시 한 번" 카드 사용');
        return runCheck(g, p, pd.check, ctx, pd.title, pd.text, true);
      }
      applyEffects(g, p, pd.check.fail, ctx);
      return finishAction(g, p, ctx, pd.title, pd.text);
    }
  }
  fail('처리할 수 없는 상태');
}

function actTurn(g, p, a) {
  const pd = g.pending;
  if (a.type === 'roll') {
    const r = rollMove(g, p);
    const ctx = { lines: [`이동 ${r.v}칸 (${r.text})`], path: [], cause: '이동' };
    g.lastRoll = { pid: p.id, v: r.v, text: r.text, seq: g.pendingSeq };
    return moveSteps(g, p, r.v, ctx);
  }
  if (a.type === 'repay') {
    const amt = Math.floor(Number(a.amount));
    if (!(amt > 0)) fail('갚을 금액을 입력하세요.');
    const x = Math.min(amt, p.cash, p.debt);
    if (x <= 0) fail('갚을 수 있는 금액이 없습니다.');
    p.cash -= x; p.debt -= x;
    const ctx = { lines: [`부채 상환 ${x} → 남은 부채 ${p.debt}`] };
    updateCredit(g, p, ctx);
    log(g, p.id, `${p.name} 부채 상환`, 'money', ctx.lines);
    refreshTurnCards(g);
    return;
  }
  if (a.type === 'useCard') {
    const idx = Number(a.index);
    const cid = p.cards[idx];
    if (!cid) fail('없는 카드입니다.');
    const reason = cardUsable(g, p, cid);
    if (reason) fail(`사용할 수 없습니다: ${reason}`);
    const ctx = { lines: [], cause: CARDS[cid].name };
    if (cid === 'exact') { const v = Math.floor(Number(a.value)); if (!(v >= 1 && v <= 6)) fail('1~6 사이 값을 고르세요.'); p.turnBuff.exact = v; ctx.lines.push(`이번 이동 ${v}칸으로 고정`); }
    if (cid === 'lesson') { if (!STAT_KEYS.includes(a.stat)) fail('능력을 고르세요.'); addStat(p, a.stat, 1, ctx); }
    if (cid === 'cheer') {
      const t = P(g, a.target);
      if (!t || t.id === p.id) fail('다른 플레이어를 고르세요.');
      addStatus(t, 'cheered', 99, ctx); ctx.lines.push(`${t.name}에게 응원 전달`);
    }
    if (cid === 'datePass') applyEffect(g, p, { affection: 1 }, ctx);
    if (cid === 'comeback') { money(g, p, 80, '오뚝이', ctx); p.statuses = p.statuses.filter(s => !['burnout', 'heartbreak'].includes(s.id)); }
    p.cards.splice(idx, 1);
    p.turnBuff[cid] = cid === 'exact' ? p.turnBuff.exact : true;
    if (cid === 'dash') ctx.lines.push('이번 이동 +2');
    log(g, p.id, `${p.name} 카드 사용: ${CARDS[cid].name}`, 'card', ctx.lines);
    feed(g, p.id, `${p.name} — 카드 "${CARDS[cid].name}"`, CARDS[cid].desc, ctx.lines.slice(), 'card');
    if (cid === 'referral') return presentJobSelect(g, p, { lines: [], path: [], cause: '추천서', returnTo: 'turn' }, 'change');
    refreshTurnCards(g);
    return;
  }
  fail('지금은 주사위 굴리기, 카드 사용, 부채 상환만 할 수 있습니다.');
}

function runCheck(g, p, chk, ctx, title, text, isRetry = false) {
  const { m, notes } = checkMod(p, chk.stat, chk);
  if (hasStatus(p, 'cheered')) p.statuses = p.statuses.filter(s => s.id !== 'cheered');
  const d = randInt(g.rng, 1, 6);
  const ok = d + m >= chk.target;
  ctx.lines.push(`${isRetry ? '재판정' : '판정'}: 주사위 ${d} + 보정 ${m}${notes.length ? `(${notes.join(', ')})` : ''} = ${d + m} / 목표 ${chk.target} → ${ok ? '성공' : '실패'}`);
  if (ok) { applyEffects(g, p, chk.success, ctx); return finishAction(g, p, ctx, title, text); }
  if (!isRetry && p.cards.includes('retry')) {
    setPending(g, { kind: 'reroll', pid: p.id, check: chk, ctx, title, text, lastRoll: d });
    return;
  }
  applyEffects(g, p, chk.fail, ctx);
  return finishAction(g, p, ctx, title, text);
}

function resolveChoice(g, p, pd, idx) {
  const ctx = pd.ctx;
  const opt = pd.options[idx];
  ctx.lines.push(`선택: ${opt.label}`);
  const title = pd.title, text = pd.text;
  switch (pd.src) {
    case 'event': {
      const e = EVENT_MAP[pd.eventId];
      const o = e.options[idx];
      if (opt.fallback || !o) return finishAction(g, p, ctx, title, text);
      ctx.cause = title.replace(/^.*? — /, '');
      if (o.cost) money(g, p, -o.cost, '선택 비용', ctx);
      if (o.next) p.chain.push(o.next);
      if (o.buy) { buyAsset(g, p, o.buy, ctx); return finishAction(g, p, ctx, title, text); }
      applyEffects(g, p, o.effects, ctx);
      if (o.check) return runCheck(g, p, { ...o.check, success: o.success, fail: o.fail }, ctx, title, text);
      if (o.promoCheck) return runCheck(g, p, promoCheckSpec(p), ctx, title, text);
      return finishAction(g, p, ctx, title, text);
    }
    case 'promo':
      if (opt.value === 0) return runCheck(g, p, promoCheckSpec(p), ctx, title, text);
      return finishAction(g, p, ctx, title, text);
    case 'shop': {
      const v = opt.value;
      if (v.startsWith('buy:')) buyAsset(g, p, v.slice(4), ctx);
      else if (v.startsWith('sell:')) {
        const a = p.assets.splice(Number(v.slice(5)), 1)[0];
        money(g, p, Math.floor(a.value * 0.8), `${a.name} 매각`, ctx);
        record(p, `${a.name} 매각`);
      }
      return finishAction(g, p, ctx, title, text);
    }
    case 'career': addStat(p, opt.value, 1, ctx, '진로 상담'); return finishAction(g, p, ctx, title, text);
    case 'midlife': {
      if (opt.value === 'self') { const k = STAT_KEYS.reduce((a, k2) => (p.stats[k2] > p.stats[a] ? k2 : a), STAT_KEYS[0]); addStat(p, k, 1, ctx); addCard(g, p, 'random', ctx); }
      if (opt.value === 'family') { p.memories += 2; ctx.lines.push('추억 +2'); applyEffect(g, p, { affection: 1 }, ctx); }
      if (opt.value === 'money') { addStat(p, 'smart', 1, ctx); money(g, p, 30, '재테크', ctx); }
      if (opt.value === 'change') ctx.after = { jobSelect: 'change' };
      return finishAction(g, p, ctx, title, text);
    }
    case 'job': {
      const v = opt.value;
      if (v !== 'keep') {
        const j = JOBS[v];
        const changing = pd.mode === 'change';
        let cost = changing && !p.turnBuff.referral ? JOB_CHANGE_COST : 0;
        if (j.startCost) cost += j.startCost;
        if (cost) money(g, p, -cost, changing ? '전직 교육비' : '창업 비용', ctx);
        setJob(g, p, v, changing && p.turnBuff.referral ? 1 : 0, ctx, changing && p.turnBuff.referral ? '추천서로 2단계 시작' : '');
      }
      ctx.after = null;
      return finishAction(g, p, ctx, title, text);
    }
  }
  fail('알 수 없는 선택');
}
function buyAsset(g, p, id, ctx) {
  const a = ASSETS[id];
  const r = buyReason(p, a.price);
  if (r) fail(r);
  money(g, p, -a.price, `${a.name} 구매`, ctx);
  gainAsset(p, id, ctx);
  record(p, `${a.name} 구매`);
}

function actSimul(g, pid, a) {
  const pd = g.pending;
  if (a.type !== 'simul') fail('지금은 동시 선택 중입니다.');
  if (!pd.who.includes(pid)) fail('이번 선택 대상이 아닙니다.');
  if (pid in pd.responses) fail('이미 선택했습니다.');
  const opts = pd.perPlayer?.[pid] || pd.options;
  const o = opts[a.index];
  if (!o) fail('없는 선택지입니다.');
  if (o.disabled) fail(`선택할 수 없습니다: ${o.disabled}`);
  pd.responses[pid] = a.index;
  if (awaiting(g).length) return;
  // 모두 응답 → 차례 순서대로 적용
  if (pd.sub === 'temperament') {
    for (const id of g.order) { const p = P(g, id); const ctx = { lines: [] }; applyEffects(g, p, TEMPERAMENTS[pd.responses[id]].effects, ctx); record(p, `어린 시절 "${TEMPERAMENTS[pd.responses[id]].label}"`); log(g, id, `${p.name}: ${TEMPERAMENTS[pd.responses[id]].label}`, 'event', ctx.lines); }
    feed(g, null, '어린 시절 성향 결정', '', g.order.map(id => `${P(g, id).name}: ${TEMPERAMENTS[pd.responses[id]].label}`), 'system');
    g.phase = 'play';
    return startTurn(g);
  }
  if (pd.sub === 'background') {
    for (const id of g.order) {
      const p = P(g, id); const b = BACKGROUNDS[pd.responses[id]];
      p.stats = { ...b.set }; p.cash = b.cash; p.debt = b.debt || 0; p.degree = !!b.degree; if (b.degree) p.flags.degree = true;
      if (b.card) p.cards.push(b.card);
      record(p, `배경: ${b.label}`);
    }
    const perPlayer = {};
    for (const p of g.players) perPlayer[p.id] = jobOptions(g, p, 'first');
    setPending(g, { kind: 'simul', sub: 'firstJob', title: '첫 직업 선택', text: '모두 동시에 고릅니다. 회색 직업은 조건이 부족합니다.', who: g.players.map(p => p.id), responses: {}, perPlayer });
    return;
  }
  if (pd.sub === 'firstJob') {
    const lines = [];
    for (const id of g.order) {
      const p = P(g, id); const o = pd.perPlayer[id][pd.responses[id]];
      const ctx = { lines: [], cause: '첫 직업' };
      if (JOBS[o.value].startCost) money(g, p, -JOBS[o.value].startCost, '창업 비용', ctx);
      setJob(g, p, o.value, 0, ctx);
      lines.push(`${p.name}: ${JOBS[o.value].name}`);
      log(g, id, `${p.name} 첫 직업`, 'event', ctx.lines);
    }
    feed(g, null, '첫 직업 결정', '', lines, 'system');
    g.phase = 'play';
    return startTurn(g);
  }
  if (pd.sub === 'joint') {
    resolveJoint(g, pd);
    const p = P(g, pd.trigger);
    return finishAction(g, p, pd.ctx, `${p.name} — 모두의 광장`, '');
  }
}

// 테스트 전용 내부 함수 노출
export const _internal = { money, updateCredit, payday };

// ---------------- 진행 정보 ----------------
export function progressInfo(g) {
  // 각 플레이어의 남은 칸(최단 경로) 기반 진행률
  const dist = {};
  const ids = Object.keys(g.board.nodes);
  const goal = ids.find(id => g.board.nodes[id].type === 'goal');
  dist[goal] = 0;
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of ids) {
      const n = g.board.nodes[id];
      if (!n.next.length) continue;
      const d = Math.min(...n.next.map(x => (dist[x] ?? Infinity))) + 1;
      if (d < (dist[id] ?? Infinity)) { dist[id] = d; changed = true; }
    }
  }
  const total = dist[g.board.start];
  return g.players.map(p => ({ pid: p.id, left: p.finished ? 0 : dist[p.pos], pct: p.finished ? 100 : Math.round(100 * (1 - dist[p.pos] / total)) }));
}
