// 테스트용 봇 클라이언트: 실제 HTTP/SSE 로 방에 참가해 자동으로 플레이한다.
// 사용법: node scripts/bots.js <서버주소> <방ID> <비밀번호> <봇 수> [--host-too 복구코드] [--delay ms]
// 예:     node scripts/bots.js http://localhost:3000 AbCd... test123 3
import { botAction, botRng } from '../test/bot.js';

export async function readSSE(url, token, onState, signal) {
  const res = await fetch(url, { headers: { authorization: 'Bearer ' + token }, signal });
  if (!res.ok) throw new Error('stream ' + res.status);
  const dec = new TextDecoder();
  let buf = '';
  for await (const chunk of res.body) {
    buf += dec.decode(chunk, { stream: true });
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, i); buf = buf.slice(i + 2);
      const data = block.split('\n').filter(l => l.startsWith('data: ')).map(l => l.slice(6)).join('\n');
      if (block.includes('event: state') && data) onState(JSON.parse(data));
    }
  }
}

export async function runBot({ base, roomId, token, memberId, seed = 1, delay = 150, style = 'random', log = () => {}, signal }) {
  const r = botRng(seed);
  let busy = false, last = null;
  const post = (body) => fetch(`${base}/api/rooms/${roomId}/act`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token }, body: JSON.stringify({ actionId: `${memberId}-${Math.random()}`, ...body }) }).then(x => x.json());
  const think = async () => {
    const room = last;
    if (busy || !room) return;
    if (room.status === 'lobby') {
      const me = room.members.find(m => m.id === memberId);
      if (me && !me.ready && room.hostId !== memberId) { busy = true; await post({ type: 'ready', ready: true }); busy = false; }
      return;
    }
    if (room.status !== 'playing') return;
    const g = room.game, pd = g.pending;
    const who = pd.kind === 'simul' ? pd.who.filter(id => !(id in pd.responses)) : [pd.pid];
    if (!who.includes(memberId)) return;
    busy = true;
    await new Promise(res => setTimeout(res, delay));
    let action = botAction(g, memberId, r, style);
    let out = await post({ type: 'game', action, pendingId: pd.id });
    if (!out.ok && !/최신/.test(out.error)) { log('재시도', out.error); }
    busy = false;
    setTimeout(think, 0);
  };
  readSSE(`${base}/api/rooms/${roomId}/stream`, token, (room) => { last = room; think(); }, signal).catch(e => { if (e.name !== 'AbortError') log('연결 종료', e.message); });
}

export async function joinBots(base, roomId, password, n, prefix = '봇') {
  const out = [];
  for (let i = 0; i < n; i++) {
    const res = await fetch(`${base}/api/rooms/${roomId}/join`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: `${prefix}${i + 1}`, password }) });
    const j = await res.json();
    if (!res.ok) throw new Error(j.error);
    out.push(j);
  }
  return out;
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('bots.js')) {
  const [base, roomId, password, count] = process.argv.slice(2);
  const delay = Number(process.argv[process.argv.indexOf('--delay') + 1]) || 400;
  if (!base) { console.log('사용법: node scripts/bots.js <서버주소> <방ID> <비밀번호> <봇 수>'); process.exit(1); }
  const bots = await joinBots(base, roomId, password, Number(count) || 1);
  bots.forEach((b, i) => runBot({ base, roomId, token: b.token, memberId: b.memberId, seed: i + 7, delay, log: (...a) => console.log(`봇${i + 1}`, ...a) }));
  console.log(`봇 ${bots.length}명 참가 완료. Ctrl+C 로 종료`);
}
