// 「항구의 길」 규칙 엔진. 시간·Math.random 을 쓰지 않는 결정적 상태 머신.
// 모든 무작위는 g.rng 로만 진행하므로 같은 시드 + 같은 행동 순서 = 같은 결과. 서버와 브라우저가 함께 사용한다.
import { ECONOMY, TILES, BOARD_SIZE, PORT_IDS, REGION_PORTS, CARGO, CONTRACT_RANGES, contractReward, EVENTS, SHIPS, normalizeHarborSettings, boardSizeOf, levelLimit, tilesOf } from './data.js';
import { randInt, pick, weightedPick, shuffle } from '../rng.js';

export const SCHEMA_VERSION = 1;
export class GameError extends Error {}
const fail = (msg) => { throw new GameError(msg); };
const LOG_KEEP = 80;

export function restoreGame(g) {
  if (!g) return;
  g.owners ||= {};
}

export function createGame(members, settingsIn, seed) {
  const settings = normalizeHarborSettings(settingsIn);
  if (members.length < 2 || members.length > SHIPS.length) fail('항구의 길은 2~4명이 함께합니다.');
  const rng = { s: seed >>> 0, n: 0 };
  const players = members.map((m, i) => ({
    id: m.id, name: m.name, ship: i, color: SHIPS[i].color,
    cash: ECONOMY.startCash, pos: 0, cargo: null, bankrupt: false, bankruptRound: 0, turns: 0,
    stats: { delivered: 0, deliveryIncome: 0, tollPaid: 0, tollEarned: 0, supply: 0 },
  }));
  const g = {
    schema: SCHEMA_VERSION, game: 'harbor', boardSize: BOARD_SIZE, seed: seed >>> 0, rng, settings, players,
    doubles: 0, fund: 0,
    owners: {}, order: shuffle(rng, players.map(p => p.id)), turnIdx: 0, round: 1, phase: 'play',
    pending: null, pendingSeq: 0, log: [], logSeq: 0, lastRoll: null, results: null,
  };
  log(g, null, `출항! 차례 순서: ${g.order.map(id => P(g, id).name).join(' → ')}. 모두 ${ECONOMY.startCash}씩 들고 시작합니다.`, 'system');
  setPending(g, { kind: 'roll', pid: g.order[0] });
  return g;
}

// ---------- 조회 도우미 (화면에서도 사용) ----------
export const P = (g, id) => g.players.find(p => p.id === id);
export const alive = (g) => g.players.filter(p => !p.bankrupt);
export const portsOf = (g, pid) => PORT_IDS.filter(i => g.owners[i]?.pid === pid);
export const buybackOf = (g, i) => { const o = g.owners[i]; return o ? TILES[i].buyback[o.level] : 0; };
export const ownedRegions = (g, pid) => g.boardSize ? Object.keys(REGION_PORTS).filter(r => REGION_PORTS[r].every(i => g.owners[i]?.pid === pid)) : [];
export const tollOf = (g, i) => {
  const o = g.owners[i];
  return o ? TILES[i].toll[o.level] * (ownedRegions(g, o.pid).includes(TILES[i].region) ? ECONOMY.regionMultiplier : 1) : 0;
};
export const takeoverCost = (g, i) => {
  const o = g.owners[i], t = TILES[i];
  return Math.ceil((t.price + t.upgrade * o.level) * ECONOMY.takeoverRate / 5) * 5;
};
export const liquidValue = (g, pid) => portsOf(g, pid).reduce((a, i) => a + buybackOf(g, i), 0);
export const worthOf = (g, p) => p.cash + liquidValue(g, p.id);
export const currentPid = (g) => g.order[g.turnIdx];

export function awaiting(g) {
  if (g.phase === 'over' || !g.pending) return [];
  return [g.pending.pid];
}

export function defaultActionFor(g, pid) {
  const pd = g.pending;
  if (!pd || pd.pid !== pid || g.phase === 'over') return null;
  if (pd.kind === 'roll') return { type: 'roll' };
  if (pd.kind === 'shelter') return { type: 'roll' };
  if (pd.kind === 'settle') {
    const cheapest = portsOf(g, pid).sort((a, b) => buybackOf(g, a) - buybackOf(g, b))[0];
    return { type: 'sell', tile: cheapest };
  }
  return { type: 'pass' };
}

// ---------- 행동 ----------
export function act(g, pid, a) {
  if (g.phase === 'over') fail('게임이 이미 끝났습니다.');
  const pd = g.pending;
  if (!pd || pd.pid !== pid) fail(`지금은 ${P(g, pd?.pid)?.name ?? '다른 사람'}의 차례입니다.`);
  const p = P(g, pid);
  const tiles = tilesOf(g);
  const type = a?.type;
  switch (pd.kind) {
    case 'roll': {
      if (type !== 'roll') fail('주사위를 굴려 주세요.');
      const { value, double } = rollDice(g, p);
      g.doubles = double ? (g.doubles || 0) + 1 : 0;
      if (g.doubles === 3) {
        p.pos = TILES.find(t => t.type === 'shelter').i;
        return shelter(g, p);
      }
      move(g, p, value);
      return land(g, p);
    }
    case 'shelter': {
      if (type === 'release') {
        if (p.cash < ECONOMY.shelterFee) fail('출항 비용이 부족합니다.');
        transfer(g, p, ECONOMY.shelterFee, null, '피난소 출항비');
        p.sheltered = 0;
        return setPending(g, { kind: 'roll', pid });
      }
      if (type !== 'roll') fail('더블을 시도하거나 비용을 내고 출항하세요.');
      const { value, double } = rollDice(g, p);
      p.sheltered = double ? 0 : p.sheltered - 1;
      if (p.sheltered) {
        log(g, pid, `${p.name}: 폭풍이 계속됩니다 · 남은 대기 ${p.sheltered}차례`, 'event');
        return endTurn(g);
      }
      log(g, pid, `${p.name}: 피난소에서 출항합니다.`, 'event');
      move(g, p, value);
      return land(g, p);
    }
    case 'charter': {
      if (type === 'pass') return endTurn(g);
      if (type !== 'sail' || !Number.isInteger(a.tile) || TILES[a.tile]?.type !== 'port' || p.cash < ECONOMY.charterFee) fail('이동할 항구와 승선 비용을 확인하세요.');
      transfer(g, p, ECONOMY.charterFee, null, '쾌속선 승선료');
      const distance = (a.tile - p.pos + boardSizeOf(g)) % boardSizeOf(g);
      move(g, p, distance, true);
      return land(g, p);
    }
    case 'takeover': {
      if (type === 'pass') return endTurn(g);
      const o = g.owners[pd.tile];
      if (type !== 'takeover' || !o || o.pid === pid || o.level >= ECONOMY.maxLevel || p.cash < pd.cost) fail('이 항구를 인수할 수 없습니다.');
      const seller = P(g, o.pid);
      p.cash -= pd.cost;
      seller.cash += pd.cost;
      o.pid = pid;
      log(g, pid, `${p.name}: ${TILES[pd.tile].name} 인수 (${pd.cost} → ${seller.name})`, 'buy', [[pid, -pd.cost], [seller.id, pd.cost]]);
      return endTurn(g);
    }
    case 'buy': {
      if (type === 'pass') { log(g, pid, `${p.name}: ${tiles[pd.tile].name} 매입을 지나침`, 'pass'); return endTurn(g); }
      if (type !== 'buy') fail('매입 또는 지나가기를 고르세요.');
      const t = tiles[pd.tile];
      if (g.owners[pd.tile]) fail('이미 주인이 있는 항구입니다.');
      if (p.cash < t.price) fail('자금이 부족합니다.');
      p.cash -= t.price;
      g.owners[pd.tile] = { pid, level: 0 };
      log(g, pid, `${p.name}: ${t.name} 매입 (−${t.price})`, 'buy', [[pid, -t.price]]);
      return endTurn(g);
    }
    case 'upgrade': {
      if (type === 'pass') { log(g, pid, `${p.name}: ${tiles[pd.tile].name} 확장을 미룸`, 'pass'); return endTurn(g); }
      if (type !== 'upgrade') fail('확장 또는 지나가기를 고르세요.');
      const t = tiles[pd.tile], o = g.owners[pd.tile];
      if (o?.pid !== pid || o.level >= levelLimit(g)) fail('확장할 수 없는 항구입니다.');
      if (p.cash < t.upgrade) fail('자금이 부족합니다.');
      p.cash -= t.upgrade;
      o.level++;
      log(g, pid, `${p.name}: ${t.name} ${o.level}단계 확장 (−${t.upgrade}) · 이용료 ${tollOf(g, t.i)}`, 'upgrade', [[pid, -t.upgrade]]);
      return endTurn(g);
    }
    case 'market': {
      if (type === 'pass') { log(g, pid, `${p.name}: 화물 계약 없이 출항`, 'pass'); return endTurn(g); }
      if (type !== 'contract') fail('계약을 고르거나 지나가세요.');
      if (p.cargo) fail('이미 운송 중인 화물이 있습니다.');
      const c = pd.contracts[a.index];
      if (!c) fail('계약을 확인하세요.');
      p.cargo = { ...c, from: pd.tile };
      log(g, pid, `${p.name}: ${c.cargoName} 계약 — ${c.destName}까지 ${c.dist}칸, 보상 ${c.reward}`, 'contract');
      return endTurn(g);
    }
    case 'settle': {
      if (type !== 'sell') fail('항구를 매각해 정산하세요.');
      const i = Number(a.tile);
      if (g.owners[i]?.pid !== pid) fail('내 항구만 매각할 수 있습니다.');
      const v = buybackOf(g, i);
      delete g.owners[i];
      p.cash += v;
      log(g, pid, `${p.name}: ${tiles[i].name} 환매 (+${v})`, 'sell', [[pid, v]]);
      if (p.cash >= pd.owed) {
        transfer(g, p, pd.owed, pd.to, pd.reason, pd.logged);
        if (pd.logged) log(g, pid, `${p.name}: ${pd.reason} ${pd.owed} 정산 완료`, 'pay');
        return afterPayment(g, p, pd.tile);
      }
      setPending(g, { ...pd, kind: 'settle' });
      return;
    }
  }
  fail('알 수 없는 행동입니다.');
}

// ---------- 이동과 도착 ----------
function rollDice(g, p) {
  const dice = [randInt(g.rng, 1, 6)];
  if (g.boardSize) dice.push(randInt(g.rng, 1, 6));
  const value = dice.reduce((sum, face) => sum + face, 0);
  const double = dice[0] === dice[1];
  g.lastRoll = { seq: (g.lastRoll?.seq || 0) + 1, pid: p.id, value, dice };
  p.turns++;
  log(g, p.id, `${p.name}: 주사위 ${dice.join(' + ')}${double ? ' · 더블' : ''}`, 'roll');
  return { value, double };
}

function shelter(g, p) {
  p.sheltered = 2;
  g.doubles = 0;
  log(g, p.id, `${p.name}: 폭풍 피난소로 들어갑니다 · 최대 2차례 대기`, 'event');
  return endTurn(g);
}

function move(g, p, steps, express = false) {
  let passedStart = false;
  for (let s = 0; s < steps; s++) {
    p.pos = (p.pos + 1) % boardSizeOf(g);
    if (p.pos === 0 && !passedStart) {
      passedStart = true;
      p.cash += ECONOMY.supply;
      p.stats.supply += ECONOMY.supply;
      log(g, p.id, `${p.name}: 출항지 보급금 +${ECONOMY.supply}`, 'supply', [[p.id, ECONOMY.supply]]);
    }
    if (p.cargo && p.cargo.dest === p.pos && (!express || s === steps - 1)) deliver(g, p);
  }
}

function deliver(g, p) {
  const c = p.cargo;
  p.cash += c.reward;
  p.stats.delivered++;
  p.stats.deliveryIncome += c.reward;
  p.cargo = null;
  log(g, p.id, `${p.name}: ${c.cargoName} 배송 완료 @${c.destName} (+${c.reward})`, 'deliver', [[p.id, c.reward]]);
}

function land(g, p, fromEvent = false) {
  const t = tilesOf(g)[p.pos];
  if (t.type === 'start') { log(g, p.id, `${p.name}: 출항지에 정박`, 'info'); return endTurn(g); }
  if (t.type === 'shelter') return shelter(g, p);
  if (t.type === 'charter') {
    if (p.cash >= ECONOMY.charterFee) return setPending(g, { kind: 'charter', pid: p.id, tile: t.i });
    return endTurn(g);
  }
  if (t.type === 'tax') {
    if (charge(g, p, ECONOMY.harborTax, null, '항로 관리비', false, t.i)) return afterPayment(g, p, t.i);
    return;
  }
  if (t.type === 'fund') {
    p.cash += g.fund;
    log(g, p.id, `${p.name}: 선원 조합 기금 +${g.fund}`, 'event', [[p.id, g.fund]]);
    g.fund = 0;
    return endTurn(g);
  }
  if (t.type === 'port') {
    const o = g.owners[t.i];
    if (!o) {
      if (p.cash >= t.price) return setPending(g, { kind: 'buy', pid: p.id, tile: t.i, price: t.price });
      log(g, p.id, `${p.name}: ${t.name} 매입 자금 부족 (필요 ${t.price})`, 'info');
      return endTurn(g);
    }
    if (o.pid === p.id) {
      if (o.level >= levelLimit(g)) { log(g, p.id, `${p.name}: 최대로 확장된 ${t.name}에 정박`, 'info'); return endTurn(g); }
      if (p.cash >= t.upgrade) return setPending(g, { kind: 'upgrade', pid: p.id, tile: t.i, cost: t.upgrade, level: o.level });
      log(g, p.id, `${p.name}: ${t.name} 확장 자금 부족 (필요 ${t.upgrade})`, 'info');
      return endTurn(g);
    }
    const fee = tollOf(g, t.i);
    if (charge(g, p, fee, o.pid, `${t.name} 이용료`, false, t.i)) afterPayment(g, p, t.i);
    return;
  }
  if (t.type === 'market') {
    if (p.cargo) { log(g, p.id, `${p.name}: 운송 중인 화물이 있어 새 계약 없이 출항`, 'info'); return endTurn(g); }
    return setPending(g, { kind: 'market', pid: p.id, tile: t.i, contracts: makeContracts(g, t.i) });
  }
  if (t.type === 'event') {
    const e = fromEvent ? EVENTS.find(x => x.id === 'calm') : weightedPick(g.rng, EVENTS, x => x.weight);
    return applyEvent(g, p, e);
  }
}

function makeContracts(g, from) {
  const size = boardSizeOf(g);
  const used = new Set();
  return CONTRACT_RANGES.map(([lo, hi]) => {
    const choices = PORT_IDS.filter(i => i < size).map(i => [i, (i - from + size) % size]).filter(([i, d]) => d >= lo && d <= hi && !used.has(i));
    const [dest, dist] = pick(g.rng, choices);
    used.add(dest);
    const cargo = pick(g.rng, CARGO);
    return { cargo: cargo.id, cargoName: cargo.name, dest, destName: tilesOf(g)[dest].name, dist, reward: contractReward(dist, cargo) };
  });
}

function applyEvent(g, p, e) {
  const head = `${e.name}`;
  switch (e.kind) {
    case 'move': {
      log(g, p.id, `${head}: ${p.name} ${e.steps}칸 더 전진`, 'event');
      move(g, p, e.steps);
      return land(g, p, true);
    }
    case 'gain':
      p.cash += e.amount;
      log(g, p.id, `${head}: ${p.name} +${e.amount}`, 'event', [[p.id, e.amount]]);
      return endTurn(g);
    case 'pay':
      log(g, p.id, `${head}: ${p.name} −${e.amount}`, 'event', [[p.id, -e.amount]]);
      if (charge(g, p, e.amount, null, e.name, true)) endTurn(g);
      return;
    case 'all': {
      const list = alive(g);
      for (const x of list) x.cash += e.amount;
      log(g, p.id, `${head}: 모두 +${e.amount} (${list.map(x => x.name).join(', ')})`, 'event', list.map(x => [x.id, e.amount]));
      return endTurn(g);
    }
    case 'cargoFee': {
      if (!p.cargo) { log(g, p.id, `${head}: ${p.name} 화물이 없어 그냥 통과`, 'event'); return endTurn(g); }
      log(g, p.id, `${head}: ${p.name} −${e.amount}`, 'event', [[p.id, -e.amount]]);
      if (charge(g, p, e.amount, null, e.name, true)) endTurn(g);
      return;
    }
    case 'perPort': {
      const n = portsOf(g, p.id).length;
      const fee = n * e.amount;
      if (!fee) { log(g, p.id, `${head}: ${p.name} 항구가 없어 피해 없음`, 'event'); return endTurn(g); }
      log(g, p.id, `${head}: ${p.name} 항구 ${n}곳 경비 −${fee}`, 'event', [[p.id, -fee]]);
      if (charge(g, p, fee, null, e.name, true)) endTurn(g);
      return;
    }
    case 'underdog': {
      const list = alive(g);
      const min = Math.min(...list.map(x => portsOf(g, x.id).length));
      const who = list.filter(x => portsOf(g, x.id).length === min);
      for (const x of who) x.cash += e.amount;
      log(g, p.id, `${head}: ${who.map(x => x.name).join(', ')} +${e.amount}`, 'event', who.map(x => [x.id, e.amount]));
      return endTurn(g);
    }
    case 'cargoBonus': {
      if (!p.cargo) { log(g, p.id, `${head}: ${p.name} 실은 화물이 없어 의뢰를 놓침`, 'event'); return endTurn(g); }
      p.cargo.reward += e.amount;
      log(g, p.id, `${head}: ${p.name}의 ${p.cargo.cargoName} 보상 +${e.amount} (총 ${p.cargo.reward})`, 'event');
      return endTurn(g);
    }
    default:
      log(g, p.id, `${head}: ${p.name} 아무 일 없음`, 'event');
      return endTurn(g);
  }
}

// ---------- 돈 지불 ----------
// 지불 가능하면 즉시 처리하고 true. 항구를 팔아야 하면 정산 대기(false). 모두 팔아도 부족하면 파산(true).
function charge(g, p, amount, toPid, reason, logged = false, tile) {
  if (p.cash >= amount) { transfer(g, p, amount, toPid, reason, logged); return true; }
  if (p.cash + liquidValue(g, p.id) < amount) { bankrupt(g, p, amount, toPid, reason); return true; }
  log(g, p.id, `${p.name}: ${reason} ${amount} 지불에 현금 ${amount - p.cash} 부족 — 항구를 매각해 정산해야 합니다`, 'warn');
  setPending(g, { kind: 'settle', pid: p.id, owed: amount, to: toPid, reason, logged, ...(tile === undefined ? {} : { tile }) });
  return false;
}
function afterPayment(g, p, tile) {
  if (g.boardSize && !p.bankrupt) {
    if (TILES[tile]?.type === 'tax') g.fund += ECONOMY.harborTax;
    const o = g.owners[tile];
    if (o && o.pid !== p.id && o.level < ECONOMY.maxLevel) {
      const cost = takeoverCost(g, tile);
      if (p.cash >= cost) return setPending(g, { kind: 'takeover', pid: p.id, tile, cost });
    }
  }
  return endTurn(g);
}
function transfer(g, p, amount, toPid, reason, logged = false) {
  p.cash -= amount;
  const to = toPid ? P(g, toPid) : null;
  if (to) {
    to.cash += amount;
    p.stats.tollPaid += amount; to.stats.tollEarned += amount;
    log(g, p.id, `${reason}: ${p.name} → ${to.name} ${amount}`, 'toll', [[p.id, -amount], [to.id, amount]]);
  } else if (!logged) {
    log(g, p.id, `${reason}: ${p.name} −${amount}`, 'pay', [[p.id, -amount]]);
  }
}
function bankrupt(g, p, amount, toPid, reason) {
  for (const i of portsOf(g, p.id)) { p.cash += buybackOf(g, i); delete g.owners[i]; }
  const paid = Math.min(p.cash, amount);
  const to = toPid ? P(g, toPid) : null;
  if (to) { to.cash += paid; to.stats.tollEarned += paid; }
  p.cash = 0;
  p.cargo = null;
  p.bankrupt = true;
  p.bankruptRound = g.round;
  log(g, p.id, `${p.name} 파산: ${reason} ${amount}을 낼 수 없어 항구를 모두 넘기고 항해를 마칩니다${to ? ` (${to.name}에게 ${paid} 지급)` : ''}`, 'bankrupt', to ? [[to.id, paid]] : []);
}

// ---------- 차례·라운드 ----------
function endTurn(g) {
  if (alive(g).length <= 1) return finish(g, '생존 선장이 한 명만 남았습니다.');
  const player = P(g, currentPid(g));
  if (ownedRegions(g, player.id).length >= 3) return finish(g, '세 권역의 항구를 모두 확보했습니다.', player.id);
  if (g.doubles && !player.bankrupt && !player.sheltered) return setPending(g, { kind: 'roll', pid: player.id });
  g.doubles = 0;
  const n = g.order.length;
  let idx = g.turnIdx;
  for (let k = 0; k < n; k++) {
    idx++;
    if (idx >= n) {
      idx = 0;
      g.round++;
      if (g.round > g.settings.rounds) { g.round = g.settings.rounds; return finish(g, `${g.settings.rounds}라운드가 끝났습니다.`); }
      log(g, null, `— ${g.round}라운드 시작 —`, 'round');
    }
    if (!P(g, g.order[idx]).bankrupt) break;
  }
  g.turnIdx = idx;
  setPending(g, { kind: P(g, g.order[idx]).sheltered ? 'shelter' : 'roll', pid: g.order[idx] });
}

function finish(g, why, winner) {
  g.phase = 'over';
  g.pending = null;
  const rows = g.players.map(p => ({
    pid: p.id, name: p.name, ship: p.ship, color: p.color, bankrupt: p.bankrupt, bankruptRound: p.bankruptRound,
    cash: p.cash, ports: portsOf(g, p.id).map(i => ({ tile: i, name: tilesOf(g)[i].name, level: g.owners[i].level, buyback: buybackOf(g, i) })),
    portValue: liquidValue(g, p.id), total: worthOf(g, p), stats: p.stats,
  }));
  const score = (r) => r.pid === winner ? Infinity : r.bankrupt ? -1e9 + r.bankruptRound : r.total;
  rows.sort((a, b) => score(b) - score(a));
  rows.forEach((r, i) => { r.rank = i > 0 && score(rows[i - 1]) === score(r) ? rows[i - 1].rank : i + 1; });
  g.results = rows;
  log(g, null, `항해 종료 — ${why} 1위: ${rows.filter(r => r.rank === 1).map(r => r.name).join(', ')}`, 'system');
}

function setPending(g, pd) {
  g.pending = { ...pd, id: ++g.pendingSeq };
}

function log(g, pid, text, kind, changes = []) {
  g.log.push({ seq: ++g.logSeq, round: g.round, pid, text, kind, changes });
  if (g.log.length > LOG_KEEP) g.log.splice(0, g.log.length - LOG_KEEP);
}

export const _internal = { charge, move, land, endTurn };
