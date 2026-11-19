// 앱 진입점: 라우팅, 서버 통신, 홈/참가/대기실 화면
import { $, h, toast, modal, copyText, won } from './util.js';
import { PRESETS, LENGTH_LIMITS, TIME_LIMITS, SPEEDS, normalizeSettings, presetSettings, defaultSettings, estimateMinutes, stageTurns } from '/game/settings.js';
import { PACKS } from '/game/content.js';
import { GameScreen } from './game-ui.js';
import { resumeBgm } from './audio.js';

const app = $('#app');
const S = { roomId: null, token: null, memberId: null, room: null, es: null, game: null, lastVersion: -1 };

// ---------- 저장된 참가 정보 ----------
const seatKey = (id) => 'glg.seat.' + id;
function loadSeat(id) { try { return JSON.parse(localStorage.getItem(seatKey(id))); } catch { return null; } }
function saveSeat(id, seat) { try { localStorage.setItem(seatKey(id), JSON.stringify(seat)); } catch { /* 사생활 보호 모드 */ } }
function clearSeat(id) { try { localStorage.removeItem(seatKey(id)); } catch { /* 무시 */ } }
const recoveryCode = () => `${S.roomId}.${S.token}`;

// ---------- 서버 요청 ----------
export async function api(path, body, method = body ? 'POST' : 'GET') {
  const res = await fetch(path, { method, headers: { 'content-type': 'application/json', ...(S.token ? { authorization: 'Bearer ' + S.token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let data = {};
  try { data = await res.json(); } catch { /* 빈 응답 */ }
  if (!res.ok || data.ok === false) { const e = new Error(data.error || `요청 실패 (${res.status})`); e.status = res.status; throw e; }
  return data;
}
export async function send(type, extra = {}) {
  const { roomId, token } = S;
  try {
    const result = await api(`/api/rooms/${roomId}/act`, { type, actionId: crypto.randomUUID?.() || String(Math.random()), ...extra });
    if (result.state && S.roomId === roomId && S.token === token) receiveRoom(result.state);
    return result;
  } catch (e) { toast(e.message, 'err'); if (e.status === 401) leaveToHome(); }
}

// ---------- 라우팅 ----------
function route() {
  const m = location.pathname.match(/^\/r\/([A-Za-z0-9_-]+)$/);
  if (m) return openRoom(m[1]);
  renderHome();
}
function leaveToHome() { S.es?.close(); S.es = null; S.game?.destroy(); S.game = null; history.pushState({}, '', '/'); route(); }
window.addEventListener('popstate', route);

// ---------- 홈 ----------
function renderHome() {
  document.title = '갈림길 인생';
  let settings = defaultSettings();
  let cap = 8;
  const editor = h('div');
  const draw = () => editor.replaceChildren(settingsEditor(settings, true, (s) => { settings = s; draw(); }, cap));
  draw();
  const capOut = h('b', '8명');
  const form = h('form.card.create', { onsubmit: async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    try {
      const r = await api('/api/rooms', { name: fd.get('name'), password: fd.get('password'), capacity: cap, settings });
      saveSeat(r.roomId, { token: r.token, memberId: r.memberId });
      history.pushState({}, '', '/r/' + r.roomId);
      route();
    } catch (err) { toast(err.message, 'err'); }
  } },
    h('h2', '방 만들기'),
    h('label', '닉네임', h('input', { name: 'name', maxlength: 12, required: true, placeholder: '예: 별빛여행자' })),
    h('label', '방 비밀번호 (친구에게 따로 알려 주세요)', h('input', { name: 'password', type: 'password', minlength: 2, maxlength: 40, required: true, autocomplete: 'new-password' })),
    h('label', '정원 ', capOut, h('input', { type: 'range', min: 2, max: 12, value: 8, oninput: (e) => { cap = Number(e.target.value); capOut.textContent = cap + '명'; draw(); } })),
    editor,
    h('button.primary.big', { type: 'submit' }, '방 만들고 초대 링크 받기'),
  );
  const recover = h('form.card', { onsubmit: (e) => {
    e.preventDefault();
    const code = String(new FormData(recover).get('code') || '').trim();
    const [rid, tok] = code.split('.');
    if (!rid || !tok) return toast('복구 코드 형식이 올바르지 않습니다.', 'err');
    saveSeat(rid, { token: tok });
    history.pushState({}, '', '/r/' + rid); route();
  } }, h('h3', '다른 컴퓨터에서 이어하기'), h('p.small', '게임 중 메뉴의 "내 복구 코드"를 붙여 넣으면 같은 자리로 돌아갑니다.'),
    h('div.row', h('input', { name: 'code', placeholder: '복구 코드', autocomplete: 'off' }), h('button', { type: 'submit' }, '들어가기')));
  app.replaceChildren(h('div.home',
    h('header.hero', h('h1', '갈림길 인생'), h('p', '주사위 한 번, 선택 한 번. 친구들과 각자의 컴퓨터에서 서로 다른 인생을 살아 보는 온라인 보드게임 (2~12명)')),
    h('div.home-grid', form, h('div', recover, howToCard())),
  ));
}
function howToCard() {
  return h('div.card.howto', h('h3', '이렇게 놀아요'), h('ol',
    h('li', '방을 만들고 초대 링크와 비밀번호를 친구에게 보냅니다.'),
    h('li', '친구는 링크에서 닉네임과 비밀번호로 참가하고 "준비"를 누릅니다.'),
    h('li', '방장이 시작하면 차례대로 주사위를 굴려 이동하고, 칸마다 사건과 선택이 펼쳐집니다.'),
    h('li', '성장기 → 진로 → 성인 전반 → 중간 점검 → 성인 후반 → 은퇴 후 최종 정산!'),
    h('li', '창을 닫아도 게임은 저장됩니다. 같은 링크로 돌아오면 이어서 할 수 있어요.'),
  ));
}

// ---------- 설정 편집기 (홈·대기실 공용) ----------
export function settingsEditor(settings, editable, onChange, players) {
  const s = normalizeSettings(settings);
  const set = (patch, keepPreset = false) => onChange(normalizeSettings({ ...s, ...patch, preset: keepPreset ? s.preset : 'custom' }));
  const dis = !editable || undefined;
  const turns = stageTurns(s);
  const est = estimateMinutes(s, players);
  const lengthRow = (k, label) => {
    const [lo, hi] = LENGTH_LIMITS[k];
    const off = k === 'growth' && s.startStage === 'adult';
    const out = h('span.small', off ? '생략' : `${s.lengths[k]}칸 · 1인 약 ${turns[k]}턴`);
    return h('label.len' + (off ? '.off' : ''), h('span', label), h('input', { type: 'range', min: lo, max: hi, value: s.lengths[k], disabled: dis || off,
      oninput: (e) => { out.textContent = `${e.target.value}칸 · 조정 중…`; },
      onchange: (e) => set({ lengths: { ...s.lengths, [k]: Number(e.target.value) } }) }), out);
  };
  return h('div.settings',
    h('div.presets', ...Object.entries(PRESETS).map(([k, p]) => h('button' + (s.preset === k ? '.on' : ''), { type: 'button', disabled: dis, onclick: () => onChange(presetSettings(k, s)) }, p.name)),
      h('button' + (s.preset === 'custom' ? '.on' : ''), { type: 'button', disabled: dis, onclick: () => set({}) }, '직접 설정')),
    h('div.field', h('b', '시작 단계 '),
      h('label.inline', h('input', { type: 'radio', name: 'st', checked: s.startStage === 'growth', disabled: dis, onchange: () => set({ startStage: 'growth' }) }), '성장기부터'),
      h('label.inline', h('input', { type: 'radio', name: 'st', checked: s.startStage === 'adult', disabled: dis, onchange: () => set({ startStage: 'adult' }) }), '성인기부터 (배경·첫 직업 준비 단계 진행)')),
    h('div.field', h('b', '단계별 길이'), h('div.small', '칸 수 = 주 경로 길이. 주사위 평균 3.4칸 이동 기준 1인당 예상 턴 수를 함께 표시합니다. 관문·갈림길 칸은 따로 추가됩니다.'),
      lengthRow('growth', '성장기'), lengthRow('early', '성인 전반'), lengthRow('late', '성인 후반')),
    h('div.field', h('b', '콘텐츠'), ...Object.entries(PACKS).map(([k, p]) => h('label.pack', h('input', { type: 'checkbox', checked: s.packs[k], disabled: dis, onchange: (e) => set({ packs: { ...s.packs, [k]: e.target.checked } }) }), h('span', h('b', p.name), ' — ', p.desc)))),
    h('div.field', h('b', '진행 속도 '),
      h('select', { disabled: dis, onchange: (e) => set({ speed: e.target.value }, true) }, ...Object.entries(SPEEDS).map(([k, v]) => h('option', { value: k, selected: s.speed === k }, v))),
      h('label.inline', h('input', { type: 'checkbox', checked: s.skipRepeat, disabled: dis, onchange: (e) => set({ skipRepeat: e.target.checked }, true) }), '다른 플레이어의 결과 미리보기 생략'),
      h('div.small', '연출 속도는 결과에 영향을 주지 않습니다. 각자 화면에서 따로 바꿀 수도 있습니다.')),
    h('div.field', h('b', '선택 시간 제한 '),
      h('select', { disabled: dis, onchange: (e) => set({ timeLimit: Number(e.target.value) }, true) }, ...TIME_LIMITS.map(t => h('option', { value: t, selected: s.timeLimit === t }, t ? `${t}초` : '제한 없음 (기본)'))),
      h('div.small', '시간이 끝나면 기본 행동이 적용됩니다: 주사위 굴리기 / 첫 번째 갈림길 / ★표시된 안전한 선택지 / 동시 선택은 비용 없는 선택지. 제한이 없어도 연결이 60초 이상 끊긴 사람은 다른 참가자가 "자동 진행"할 수 있습니다.')),
    h('div.estimate', `예상 플레이타임 (${players}명): 약 ${est.low}~${est.high}분 · 1인 약 ${est.turnsPerPlayer}턴`,
      h('div.small', '근거: 1인 1턴 ≈ 이동 연출 + 사건 선택 (보통 속도 약 25초) × 인원 × 턴 수 + 공동 사건·준비 시간. 고민 시간에 따라 실제 시간은 크게 달라질 수 있습니다. 게임 중에는 실제 진행 속도로 남은 시간을 다시 계산합니다.')),
  );
}

// ---------- 방 열기 ----------
async function openRoom(id) {
  S.roomId = id; S.room = null; S.lastVersion = -1;
  const seat = loadSeat(id);
  if (seat?.token) {
    S.token = seat.token;
    try {
      const r = await api(`/api/rooms/${id}/resume`, { token: seat.token });
      S.memberId = r.memberId; saveSeat(id, { token: seat.token, memberId: r.memberId });
      return connect();
    } catch (e) {
      if (e.status === 404 || e.status === 410) return renderMissing(e.message);
      clearSeat(id); S.token = null;
      toast('저장된 참가 정보가 유효하지 않아 다시 참가해야 합니다.', 'err');
    }
  }
  renderJoin(id);
}
function renderMissing(msg) {
  app.replaceChildren(h('div.center', h('div.card', h('h2', '방에 들어갈 수 없어요'), h('p', msg), h('button.primary', { onclick: leaveToHome }, '처음으로'))));
}
async function renderJoin(id) {
  let info;
  try { info = await api(`/api/rooms/${id}`); } catch (e) { return renderMissing(e.message); }
  const statusText = { lobby: '대기 중', playing: '게임 진행 중', over: '게임 종료' }[info.status];
  const blocked = info.status !== 'lobby' ? '이미 시작된 게임에는 새로 참가할 수 없습니다. 기존 참가자라면 처음 참가한 브라우저에서 이 링크를 열거나 아래에 복구 코드를 넣으세요.'
    : info.locked ? '방장이 입장을 잠갔습니다.' : info.count >= info.capacity ? '정원이 가득 찼습니다.' : null;
  const form = h('form.card', { onsubmit: async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    try {
      const r = await api(`/api/rooms/${id}/join`, { name: fd.get('name'), password: fd.get('password') });
      S.token = r.token; S.memberId = r.memberId; saveSeat(id, { token: r.token, memberId: r.memberId });
      connect();
    } catch (err) { toast(err.message, 'err'); }
  } },
    h('h2', '갈림길 인생 — 초대받은 방'),
    h('p', `상태: ${statusText} · 참가 ${info.count}/${info.capacity}명${info.locked ? ' · 🔒 잠김' : ''}`),
    blocked ? h('p.warn', blocked) : null,
    h('label', '닉네임', h('input', { name: 'name', maxlength: 12, required: true, disabled: !!blocked || undefined })),
    h('label', '방 비밀번호', h('input', { name: 'password', type: 'password', required: true, disabled: !!blocked || undefined })),
    h('button.primary.big', { type: 'submit', disabled: !!blocked || undefined }, '참가하기'),
  );
  const rec = h('form.card', { onsubmit: (e) => {
    e.preventDefault();
    const code = String(new FormData(rec).get('code') || '').trim();
    const tok = code.includes('.') ? code.split('.')[1] : code;
    saveSeat(id, { token: tok }); openRoom(id);
  } }, h('h3', '기존 참가자 복구'), h('div.row', h('input', { name: 'code', placeholder: '복구 코드', autocomplete: 'off' }), h('button', { type: 'submit' }, '복구')));
  app.replaceChildren(h('div.center', form, rec));
}

// ---------- 실시간 연결 ----------
function receiveRoom(room, close = () => S.es?.close()) {
  if (room.id !== S.roomId || room.version < S.lastVersion) return;
  setConn(true);
  if (room.version === S.lastVersion && room.now < S.room?.now) return;
  S.lastVersion = room.version;
  S.room = room;
  if (!room.members.some(m => m.id === S.memberId)) { clearSeat(S.roomId); close(); return renderMissing('이 방에서 내보내졌거나 자리가 없어졌습니다.'); }
  render();
}

function connect() {
  S.es?.close();
  if (document.querySelector('meta[name="room-sync"][content="poll"]')) {
    const id = S.roomId;
    let closed = false, timer;
    const close = () => { closed = true; clearTimeout(timer); };
    const poll = async () => {
      try {
        const room = await api(`/api/rooms/${id}/state`);
        if (!closed) {
          setConn(true);
          const previous = S.room;
          if (room.version !== previous?.version || room.members.some((m, i) => m.online !== previous.members[i]?.online)) {
            receiveRoom(room, close);
          }
        }
      } catch (e) {
        if (closed) return;
        setConn(false);
        if ([401, 404, 410].includes(e.status)) {
          if (e.status === 401) clearSeat(id);
          close();
          renderMissing(e.message);
        }
      } finally {
        if (!closed) timer = setTimeout(poll, document.hidden ? 5000 : 1200);
      }
    };
    S.es = { close };
    void poll();
    return;
  }
  const es = new EventSource(`/api/rooms/${S.roomId}/stream?token=${encodeURIComponent(S.token)}`);
  S.es = es;
  let failures = 0;
  es.addEventListener('state', (ev) => {
    failures = 0;
    receiveRoom(JSON.parse(ev.data), () => es.close());
  });
  es.onerror = () => {
    setConn(false);
    if (++failures >= 5) {
      // 방이 삭제되었거나 인증이 무효인지 확인
      api(`/api/rooms/${S.roomId}`).catch(e => { if (e.status === 404 || e.status === 410) { es.close(); renderMissing(e.message); } });
    }
  };
}
function setConn(ok) { document.body.classList.toggle('offline', !ok); }

function render() {
  const r = S.room;
  if (r.status === 'lobby') { S.game?.destroy(); S.game = null; return renderLobby(); }
  if (!S.game) { S.game = new GameScreen(app, { S, send, api, recoveryCode, leaveToHome, settingsEditor }); }
  S.game.update(r);
}

// ---------- 대기실 ----------
function renderLobby() {
  const r = S.room;
  document.title = `대기실 (${r.members.length}/${r.capacity}) — 갈림길 인생`;
  const me = r.members.find(m => m.id === S.memberId);
  const isHost = r.hostId === S.memberId;
  const link = `${location.origin}/r/${r.id}`;
  const others = r.members.filter(m => m.id !== r.hostId);
  const allReady = others.every(m => m.ready);
  const startReason = r.members.length < 2 ? '2명 이상 모이면 시작할 수 있어요.' : !allReady ? '모든 참가자가 준비해야 시작할 수 있어요.' : null;
  const keepScroll = window.scrollY;
  app.replaceChildren(h('div.lobby',
    h('header.bar', h('h1', '갈림길 인생 · 대기실'), h('button', { onclick: () => modal(h('div', h('h3', '내 복구 코드'), h('p.small', '다른 컴퓨터나 브라우저에서 이 코드를 넣으면 같은 자리로 들어옵니다. 다른 사람에게 보여 주지 마세요.'), h('code.code', recoveryCode()), h('button', { onclick: () => copyText(recoveryCode()) }, '복사'))) }, '내 복구 코드')),
    h('div.lobby-grid',
      h('section.card',
        h('h2', '친구 초대'),
        h('div.row', h('input.link', { value: link, readonly: true, onclick: (e) => e.target.select() }), h('button.primary', { onclick: () => copyText(link) }, '링크 복사')),
        h('p.small', '링크와 함께 방 비밀번호를 알려 주세요. 링크는 추측하기 어려운 무작위 주소입니다.'),
        h('h2', `참가자 ${r.members.length}/${r.capacity}${r.locked ? ' · 🔒 입장 잠김' : ''}`),
        h('ul.members', ...r.members.map((m, i) => h('li',
          h('span.dot' + (m.online ? '.on' : '')), h('b', m.name), m.id === r.hostId ? h('span.badge', '방장') : null, m.id === S.memberId ? h('span.badge.me', '나') : null,
          h('span.ready' + (m.ready || m.id === r.hostId ? '.yes' : ''), m.id === r.hostId ? '방장' : m.ready ? '준비 완료' : '대기 중'),
          isHost && m.id !== S.memberId ? h('span.host-tools', h('button.small', { onclick: () => send('transferHost', { target: m.id }) }, '방장 넘기기'), h('button.small.danger', { onclick: () => confirm(`${m.name} 님을 내보낼까요?`) && send('kick', { target: m.id }) }, '내보내기')) : null,
        ))),
        h('div.row.wrap',
          !isHost ? h('button.primary.big', { onclick: () => send('ready', { ready: !me.ready }) }, me.ready ? '준비 취소' : '준비 완료') : null,
          isHost ? h('button.primary.big', { disabled: !!startReason || undefined, onclick: () => send('start') }, '게임 시작') : null,
          isHost ? h('button', { onclick: () => send('lock', { locked: !r.locked }) }, r.locked ? '입장 잠금 해제' : '입장 잠그기') : null,
          isHost ? h('label.inline', '정원 ', h('select', { onchange: (e) => send('capacity', { capacity: Number(e.target.value) }) }, ...Array.from({ length: 11 }, (_, i) => i + 2).map(n => h('option', { value: n, selected: n === r.capacity, disabled: n < r.members.length || undefined }, n + '명')))) : null,
          h('button', { onclick: () => confirm('방에서 나갈까요?') && send('leave').then(() => { clearSeat(S.roomId); leaveToHome(); }) }, '나가기'),
        ),
        startReason && isHost ? h('p.small', startReason) : null,
        h('div.notices', ...r.notices.slice(-5).reverse().map(n => h('div.small', '· ' + n.text))),
      ),
      h('section.card', h('h2', '게임 설정', isHost ? '' : ' (방장만 변경)'),
        settingsEditor(r.settings, isHost, (s) => send('settings', { settings: s }), Math.max(2, r.members.length))),
    ),
  ));
  window.scrollTo(0, keepScroll);
}

document.addEventListener('click', () => resumeBgm(), { once: true });
route();
export { S, won };
