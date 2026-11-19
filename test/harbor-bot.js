// 「항구의 길」 테스트 봇: 엔진에 직접 행동을 보내 한 판을 끝까지 진행한다.
import { createGame, act, awaiting, defaultActionFor, P, portsOf, buybackOf } from '../game/harbor/engine.js';
import { TILES } from '../game/harbor/data.js';
import { botRng } from './bot.js';

// style: random | buyer(항구 위주) | trader(배송 위주) | default(기본 행동만)
export function harborBotAction(g, pid, r, style = 'random') {
  const pd = g.pending;
  const p = P(g, pid);
  if (style === 'default') return defaultActionFor(g, pid);
  switch (pd.kind) {
    case 'roll': return { type: 'roll' };
    case 'shelter': return p.cash >= 250 && r() < 0.4 ? { type: 'release' } : { type: 'roll' };
    case 'takeover': return { type: p.cash - pd.cost >= 150 && r() < 0.6 ? 'takeover' : 'pass' };
    case 'charter': return style === 'trader' && p.cargo ? { type: 'sail', tile: p.cargo.dest } : { type: 'pass' };
    case 'buy': {
      const keep = p.cash - pd.price;
      const want = style === 'buyer' ? keep >= 40 : style === 'trader' ? keep >= 250 : r() < 0.75;
      return { type: want ? 'buy' : 'pass' };
    }
    case 'upgrade': return { type: (style === 'trader' ? r() < 0.3 : r() < 0.8) ? 'upgrade' : 'pass' };
    case 'market': {
      if (style === 'buyer' && r() < 0.5) return { type: 'pass' };
      const best = pd.contracts.map((c, i) => [c.reward / c.dist, i]).sort((a, b) => b[0] - a[0])[0][1];
      return { type: 'contract', index: style === 'trader' ? (pd.contracts[1].reward > pd.contracts[0].reward * 1.4 ? 1 : best) : Math.floor(r() * 2) };
    }
    case 'settle': {
      const list = portsOf(g, pid).sort((a, b) => buybackOf(g, a) - buybackOf(g, b));
      return { type: 'sell', tile: list[Math.floor(r() * list.length)] };
    }
  }
  return defaultActionFor(g, pid);
}

export function playHarbor(n, settings, seed, { style = 'random', onStep } = {}) {
  const members = Array.from({ length: n }, (_, i) => ({ id: 'p' + i, name: '선장' + (i + 1) }));
  const g = createGame(members, settings, seed);
  const r = botRng(seed ^ 0x51ed);
  const actions = [];
  let steps = 0;
  while (g.phase !== 'over') {
    if (++steps > 5000) throw new Error('진행 불능: 최대 단계 초과');
    const [pid] = awaiting(g);
    if (!pid) throw new Error('진행 불능: 대기 중인 플레이어 없음');
    const st = typeof style === 'function' ? style(pid) : style;
    const a = harborBotAction(g, pid, r, st);
    act(g, pid, a);
    actions.push([pid, a]);
    onStep?.(g, pid, a);
  }
  return { g, actions, members };
}

export const tileName = (i) => TILES[i].name;
