// 테스트용 봇: 엔진에 직접 행동을 보내 한 판을 끝까지 진행한다.
import { createGame, act, awaiting, defaultActionFor, P } from '../game/engine.js';

// 간단한 결정적 의사 난수 (봇 전략용, 게임 RNG와 분리)
export function botRng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

export function botAction(g, pid, r, style = 'random') {
  const pd = g.pending;
  const p = P(g, pid);
  const pickEnabled = (opts) => {
    const en = opts.map((o, i) => [o, i]).filter(([o]) => !o.disabled);
    if (!en.length) return 0;
    if (style === 'default') return defaultActionFor(g, pid).index;
    if (style === 'money') { const buy = en.find(([o]) => String(o.value).startsWith('buy:')); if (buy && r() < 0.7) return buy[1]; }
    if (style === 'love') { const lv = en.find(([o]) => /데이트|프러포즈|아이|연락처|산책|대화/.test(o.label)); if (lv) return lv[1]; }
    return en[Math.floor(r() * en.length)][1];
  };
  if (pd.kind === 'turn') {
    const usable = (pd.cards || []).map((c, i) => [c, i]).filter(([c]) => !c.reason);
    if (usable.length && r() < 0.4) {
      const [c, i] = usable[0];
      const others = g.players.filter(o => o.id !== pid);
      return { type: 'useCard', index: i, value: 1 + Math.floor(r() * 6), stat: ['smart', 'body', 'sense', 'social'][Math.floor(r() * 4)], target: others[0]?.id };
    }
    if (pd.canRepay && r() < 0.3) return { type: 'repay', amount: Math.max(1, Math.floor(p.cash / 2)) };
    return { type: 'roll' };
  }
  if (pd.kind === 'branch') return { type: 'branch', index: Math.floor(r() * pd.options.length) };
  if (pd.kind === 'choice') return { type: 'choose', index: pickEnabled(pd.options) };
  if (pd.kind === 'reroll') return { type: 'reroll', use: r() < 0.7 };
  if (pd.kind === 'simul') return { type: 'simul', index: pickEnabled(pd.perPlayer?.[pid] || pd.options) };
  return null;
}

export function playToEnd(n, settings, seed, { style = 'random', maxSteps = 200000, onStep } = {}) {
  const members = Array.from({ length: n }, (_, i) => ({ id: 'p' + i, name: '플레이어' + (i + 1) }));
  const g = createGame(members, settings, seed);
  const r = botRng(seed ^ 0x9e3779b9);
  const actions = [];
  let steps = 0;
  while (g.phase !== 'over') {
    if (++steps > maxSteps) throw new Error('진행 불능: 최대 단계 초과');
    const who = awaiting(g);
    if (!who.length) throw new Error('진행 불능: 대기 중인 플레이어 없음 ' + JSON.stringify(g.pending?.kind));
    const pid = who[0];
    const st = typeof style === 'function' ? style(pid) : style;
    let a = botAction(g, pid, r, st);
    try { act(g, pid, a); } catch (e) {
      if (e.name !== 'Error' && e.constructor.name === 'GameError') { a = defaultActionFor(g, pid); act(g, pid, a); } else throw e;
    }
    actions.push([pid, a]);
    onStep?.(g, pid, a);
  }
  return { g, actions, members };
}
