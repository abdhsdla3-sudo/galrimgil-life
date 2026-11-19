// 앱 진입점: 라우팅, 서버 통신, 홈(입장번호·게임 선택)/참가/대기실 화면
import { $, h, toast, modal, copyText, won, roomChat } from './util.js';
import { PRESETS, LENGTH_LIMITS, TIME_LIMITS, SPEEDS, normalizeSettings, presetSettings, defaultSettings, estimateMinutes, stageTurns } from '/game/settings.js';
import { PACKS } from '/game/content.js';
import { ROUND_OPTIONS, TIME_OPTIONS, THEMES, normalizeHarborSettings, defaultHarborSettings } from '/game/harbor/data.js';
import { GameScreen } from './game-ui.js';
import { HarborScreen } from './harbor-ui.js';
import { GAME_META, gameMeta, artSlot } from './games.js';
import { resumeBgm } from './audio.js';

const app = $('#app');
const S = { roomId: null, token: null, memberId: null, room: null, es: null, game: null, lastVersion: -1 };

// ---------- 저장된 참가 정보 ----------
const SEAT_PREFIX = 'glg.seat.';
const seatKey = (id) => SEAT_PREFIX + id;
function loadSeat(id) { try { return JSON.parse(localStorage.getItem(seatKey(id))); } catch { return null; } }
function saveSeat(id, seat) { try { localStorage.setItem(seatKey(id), JSON.stringify({ ...loadSeat(id), ...seat, at: Date.now() })); } catch { /* 사생활 보호 모드 */ } }
function clearSeat(id) { try { localStorage.removeItem(seatKey(id)); } catch { /* 무시 */ } }
function allSeats() {
  const out = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k?.startsWith(SEAT_PREFIX)) continue;
      const seat = loadSeat(k.slice(SEAT_PREFIX.length));
      if (seat?.token) out.push({ id: k.slice(SEAT_PREFIX.length), ...seat });
    }
  } catch { /* 저장소 사용 불가 */ }
  return out.sort((a, b) => (b.at || 0) - (a.at || 0));
}
const lastName = () => { try { return localStorage.getItem('glg.name') || ''; } catch { return ''; } };
const rememberName = (n) => { try { localStorage.setItem('glg.name', String(n || '').trim()); } catch { /* 무시 */ } };
const recoveryCode = () => `${S.roomId}.${S.token}`;

// ---------- 서버 요청 ----------
export async function api(path, body, method = body ? 'POST' : 'GET') {
  const res = await fetch(path, { method, headers: { 'content-type': 'application/json', ...(S.token ? { authorization: 'Bearer ' + S.token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let data = {};
  try { data = await res.json(); } catch { /* 빈 응답 */ }
  if (!res.ok || data.ok === false) { const e = new Error(data.error || `요청 실패 (${res.status})`); e.status = res.status; e.reason = data.reason; throw e; }
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
function go(path) { history.pushState({}, '', path); route(); }
function leaveToHome() {
  S.es?.close(); S.es = null; S.game?.destroy(); S.game = null;
  S.roomId = null; S.token = null; S.memberId = null; S.room = null;
  document.querySelectorAll('.modal-back').forEach(m => m.remove());
  go('/');
}
window.addEventListener('popstate', () => { S.es?.close(); S.es = null; S.game?.destroy(); S.game = null; route(); });

// ---------- 홈 ----------
const digits = (v) => String(v || '').replace(/\D/g, '').slice(0, 6);
const CODE_HINT = {
  bad_code: '숫자 6자리를 입력해 주세요.',
  not_found: '번호를 다시 확인해 주세요. 앞자리 0도 포함해야 합니다.',
  expired: '방장에게 새 번호를 받아 주세요.',
  full: '방장에게 정원을 늘려 달라고 하거나 다른 방을 찾아 주세요.',
  locked: '방장이 잠금을 풀면 다시 시도할 수 있어요.',
  started: '기존 참가자라면 처음 들어온 브라우저나 복구 코드로 돌아올 수 있어요.',
};

function renderHome() {
  document.title = '보드게임 마당';
  S.roomId = null; S.token = null;
  const codeInput = h('input#join-code.code-input', {
    name: 'code', inputmode: 'numeric', autocomplete: 'off', enterkeyhint: 'go', maxlength: 14, placeholder: '000000',
    'aria-label': '입장번호 6자리', 'aria-describedby': 'join-msg',
    oninput: (e) => { const v = digits(e.target.value); if (e.target.value !== v) e.target.value = v; },
    onpaste: (e) => { const t = e.clipboardData?.getData('text'); if (t != null) { e.preventDefault(); e.target.value = digits(t); } },
  });
  const msg = h('p#join-msg.join-msg', { 'aria-live': 'polite' });
  const submit = h('button.primary.big', { type: 'submit' }, '참여하기');
  const showMsg = (text, hint, kind = 'err') => { msg.className = 'join-msg ' + kind; msg.replaceChildren(h('b', text), hint ? h('span', ' ' + hint) : null); };
  const joinForm = h('form.card.join-card', { onsubmit: async (e) => {
    e.preventDefault();
    const code = digits(codeInput.value);
    codeInput.value = code;
    if (code.length !== 6) { showMsg(`입장번호는 숫자 6자리예요 (지금 ${code.length}자리).`, CODE_HINT.bad_code); codeInput.focus(); return; }
    submit.disabled = true; showMsg('방을 찾는 중…', '', 'info');
    try {
      const info = await api(`/api/codes/${code}`);
      const seat = loadSeat(info.roomId);
      if (seat?.token) return go('/r/' + info.roomId);
      const reason = info.status !== 'lobby' ? 'started' : info.locked ? 'locked' : info.count >= info.capacity ? 'full' : null;
      if (reason) {
        const text = { started: `「${info.gameName}」은(는) 이미 시작된 게임이에요.`, locked: '방장이 입장을 잠갔어요.', full: `정원(${info.capacity}명)이 가득 찼어요.` }[reason];
        showMsg(text, CODE_HINT[reason]);
        return;
      }
      go('/r/' + info.roomId);
    } catch (err) {
      showMsg(err.message, CODE_HINT[err.reason] || '');
      codeInput.focus();
    } finally { submit.disabled = false; }
  } },
    h('h2', '입장번호로 참여'),
    h('p.small', '친구에게 받은 숫자 6자리를 넣으면 바로 그 방으로 갑니다. 게임을 따로 고를 필요가 없어요.'),
    h('div.code-row', codeInput, submit),
    msg,
  );

  const continueBox = h('section.continue', { hidden: true });
  const createBox = h('div.create-box');
  const cards = Object.values(GAME_META).map(meta => {
    const btn = h('button.primary', { type: 'button', 'aria-controls': 'create-form', onclick: () => select(meta.id) }, '방 만들기');
    return h('article.card.game-card', { 'data-game': meta.id },
      artSlot(meta.card, meta.fallback, { cls: 'card-art', alt: `${meta.name} 대표 그림` }),
      h('div.game-card-body', h('h3', `${meta.name} · ${meta.players}`), h('p', meta.line), btn));
  });
  const select = (type) => {
    for (const c of cards) c.classList.toggle('chosen', c.dataset.game === type);
    createBox.replaceChildren(createForm(type));
    createBox.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    createBox.querySelector('input[name=name]')?.focus({ preventScroll: true });
  };

  const recover = h('form', { onsubmit: (e) => {
    e.preventDefault();
    const code = String(new FormData(recover).get('code') || '').trim();
    const [rid, tok] = code.split('.');
    if (!rid || !tok) return toast('복구 코드 형식이 올바르지 않습니다.', 'err');
    saveSeat(rid, { token: tok });
    go('/r/' + rid);
  } }, h('p.small', '게임 메뉴의 "내 복구 코드"를 붙여 넣으면 다른 기기에서도 같은 자리로 돌아갑니다.'),
    h('div.row', h('input', { name: 'code', placeholder: '복구 코드', autocomplete: 'off', 'aria-label': '복구 코드' }), h('button', { type: 'submit' }, '들어가기')));

  app.replaceChildren(h('main.home',
    h('header.hero', h('h1', '보드게임 마당'), h('p', '친구들과 각자의 화면에서 함께하는 한국어 보드게임')),
    joinForm,
    continueBox,
    h('section.games', { 'aria-labelledby': 'games-title' }, h('h2#games-title', '새 게임 열기'), h('div.game-cards', ...cards)),
    createBox,
    h('details.card.recover', h('summary', '다른 기기에서 이어하기 (복구 코드)'), recover),
  ));
  fillContinue(continueBox);
}

// 이 브라우저에 저장된 자리 중 아직 진행 중인 방을 보여 준다.
async function fillContinue(box) {
  const seats = allSeats().slice(0, 6);
  if (!seats.length) return;
  const checks = await Promise.all(seats.map(async (seat) => {
    try {
      const res = await fetch(`/api/rooms/${seat.id}/resume`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + seat.token }, body: '{}' });
      const j = await res.json().catch(() => ({}));
      if ([401, 404, 410].includes(res.status)) { clearSeat(seat.id); return null; }
      return res.ok ? { ...seat, ...j } : null;
    } catch { return null; }
  }));
  if (!box.isConnected) return;
  const draw = () => {
    const live = checks.filter(x => x && x.status !== 'over' && loadSeat(x.id)?.token === x.token);
    box.hidden = !live.length;
    if (!live.length) return box.replaceChildren();
    const rows = live.slice(0, 3).map(x => {
      const meta = gameMeta(x.gameType);
      return h('div.continue-row',
        h('button.continue-item', { type: 'button', onclick: () => go('/r/' + x.id) },
          h('b', meta.name), h('span', x.status === 'lobby' ? '대기실' : '게임 중'),
          x.code ? h('span.mono', `번호 ${x.code}`) : null, h('span', `${x.name || ''} 님의 자리`), h('span.go', '이어서 플레이 →')),
        h('button.continue-remove', { type: 'button', 'aria-label': `${meta.name}${x.code ? ' 방 번호 ' + x.code : ''} 이어하기 기록 삭제`, onclick: () => {
          if (!confirm('이 브라우저에서 이어하기 기록을 삭제할까요? 다시 들어가려면 복구 코드가 필요할 수 있어요.')) return;
          clearSeat(x.id);
          draw();
        } }, '삭제'));
    });
    box.replaceChildren(h('h2', '이어서 플레이'), h('div.continue-list', ...rows));
  };
  draw();
}

function createForm(type) {
  const meta = gameMeta(type);
  let settings = type === 'harbor' ? defaultHarborSettings() : defaultSettings();
  let cap = meta.defaultCap;
  const editor = h('div');
  const draw = () => editor.replaceChildren(type === 'harbor'
    ? harborSettingsEditor(settings, true, (s) => { settings = s; draw(); })
    : settingsEditor(settings, true, (s) => { settings = s; draw(); }, cap));
  draw();
  const capOut = h('b', cap + '명');
  const pwWrap = h('label', { hidden: true }, '추가 비밀번호 (2~40자, 친구에게 따로 알려 주세요)',
    h('input', { name: 'password', type: 'password', minlength: 2, maxlength: 40, autocomplete: 'new-password' }));
  const msg = h('p.join-msg', { 'aria-live': 'polite' });
  const form = h('form.card.create#create-form', { onsubmit: async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true; msg.textContent = '';
    try {
      rememberName(fd.get('name'));
      const usePw = !pwWrap.hidden;
      const r = await api('/api/rooms', { gameType: type, name: fd.get('name'), password: usePw ? fd.get('password') : '', capacity: cap, settings });
      saveSeat(r.roomId, { token: r.token, memberId: r.memberId, gameType: r.gameType, code: r.code, name: fd.get('name') });
      go('/r/' + r.roomId);
    } catch (err) { msg.className = 'join-msg err'; msg.textContent = err.message; btn.disabled = false; }
  } },
    h('h2', `「${meta.name}」 방 만들기`),
    h('label', '닉네임', h('input', { name: 'name', maxlength: 12, required: true, placeholder: '예: 별빛선장', value: lastName(), autocomplete: 'nickname' })),
    h('label.inline', h('input', { type: 'checkbox', onchange: (e) => { pwWrap.hidden = !e.target.checked; pwWrap.querySelector('input').required = e.target.checked; } }), '추가 비밀번호 걸기 (기본: 번호와 닉네임만으로 참가)'),
    pwWrap,
    h('label', `정원 (${meta.players}) `, capOut, h('input', { type: 'range', min: meta.min, max: meta.max, value: cap, oninput: (e) => { cap = Number(e.target.value); capOut.textContent = cap + '명'; if (type === 'life') draw(); } })),
    editor,
    msg,
    h('button.primary.big', { type: 'submit' }, '방 만들고 입장번호 받기'),
  );
  return form;
}

// ---------- 설정 편집기 ----------
export function harborSettingsEditor(settings, editable, onChange) {
  const s = normalizeHarborSettings(settings);
  const dis = !editable || undefined;
  const set = (patch) => onChange(normalizeHarborSettings({ ...s, ...patch }));
  return h('div.settings',
    h('div.field', h('b', '보드 테마'), h('div.seg', ...Object.entries(THEMES).map(([theme, title]) =>
      h('button' + (s.theme === theme ? '.on' : ''), { type: 'button', disabled: dis, 'aria-pressed': String(s.theme === theme), onclick: () => set({ theme }) }, title)))),
    h('div.field', h('b', '라운드 '), h('div.seg', ...ROUND_OPTIONS.map(n => h('button' + (s.rounds === n ? '.on' : ''), { type: 'button', disabled: dis, 'aria-pressed': String(s.rounds === n), onclick: () => set({ rounds: n }) }, `${n}라운드`))),
      h('div.small', '모든 선장이 한 번씩 차례를 마치면 1라운드. 마지막 라운드가 끝나면 현금 + 항구 환매가로 순위를 정합니다.')),
    h('div.field', h('b', '선택 제한 시간 '), h('div.seg', ...TIME_OPTIONS.map(t => h('button' + (s.timeLimit === t ? '.on' : ''), { type: 'button', disabled: dis, 'aria-pressed': String(s.timeLimit === t), onclick: () => set({ timeLimit: t }) }, `${t}초`))),
      h('div.small', '시간이 지나면 기본 행동이 적용됩니다: 주사위 굴리기 / 매입·확장·계약은 지나가기 / 정산은 환매가가 가장 낮은 항구 매각. 접속이 끊긴 사람 때문에 모두가 기다리지 않아요.')),
    h('div.estimate', `예상 플레이타임: 약 ${s.rounds * 2}~${s.rounds * 4}분 (4명 기준)`),
  );
}

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
  S.roomId = id; S.room = null; S.lastVersion = -1; S.token = null; S.memberId = null;
  const seat = loadSeat(id);
  if (seat?.token) {
    S.token = seat.token;
    try {
      const r = await api(`/api/rooms/${id}/resume`, { token: seat.token });
      S.memberId = r.memberId; saveSeat(id, { token: seat.token, memberId: r.memberId, gameType: r.gameType, code: r.code, name: r.name });
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
  app.replaceChildren(h('div.center', h('div.card', h('h2', '방에 들어갈 수 없어요'), h('p', msg), h('button.primary', { onclick: leaveToHome }, '게임 선택으로'))));
}
async function renderJoin(id) {
  let info;
  try { info = await api(`/api/rooms/${id}`); } catch (e) { return renderMissing(e.message); }
  const meta = gameMeta(info.gameType);
  document.title = `참가 — ${meta.name}`;
  const statusText = { lobby: '대기 중', playing: '게임 진행 중', over: '게임 종료' }[info.status];
  const blocked = info.status !== 'lobby' ? '이미 시작된 게임에는 새로 참가할 수 없습니다. 기존 참가자라면 처음 참가한 브라우저에서 이 링크를 열거나 아래에 복구 코드를 넣으세요.'
    : info.locked ? '방장이 입장을 잠갔습니다.' : info.count >= info.capacity ? '정원이 가득 찼습니다.' : null;
  const msg = h('p.join-msg', { 'aria-live': 'polite' });
  const form = h('form.card', { onsubmit: async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true; msg.textContent = '';
    try {
      rememberName(fd.get('name'));
      const r = await api(`/api/rooms/${id}/join`, { name: fd.get('name'), password: fd.get('password') || '' });
      S.token = r.token; S.memberId = r.memberId;
      saveSeat(id, { token: r.token, memberId: r.memberId, gameType: r.gameType, code: r.code, name: fd.get('name') });
      connect();
    } catch (err) {
      msg.className = 'join-msg err'; msg.textContent = err.message + (CODE_HINT[err.reason] ? ' ' + CODE_HINT[err.reason] : '');
      btn.disabled = false;
      (err.reason === 'password' ? form.querySelector('input[name=password]') : form.querySelector('input[name=name]'))?.focus();
    }
  } },
    h('h2', `「${meta.name}」 초대받은 방`),
    info.code ? h('p.join-code-line', '방 번호 ', h('b.mono', info.code)) : null,
    h('p', `상태: ${statusText} · 참가 ${info.count}/${info.capacity}명${info.locked ? ' · 🔒 잠김' : ''}`),
    blocked ? h('p.warn', blocked) : null,
    h('label', '닉네임', h('input', { name: 'name', maxlength: 12, required: true, value: lastName(), autocomplete: 'nickname', disabled: !!blocked || undefined })),
    info.hasPassword ? h('label', '방 비밀번호', h('input', { name: 'password', type: 'password', required: true, autocomplete: 'off', disabled: !!blocked || undefined })) : null,
    msg,
    h('div.row.wrap', h('button.primary.big', { type: 'submit', disabled: !!blocked || undefined }, '참가하기'), h('button', { type: 'button', onclick: leaveToHome }, '게임 선택으로')),
  );
  const rec = h('form', { onsubmit: (e) => {
    e.preventDefault();
    const code = String(new FormData(rec).get('code') || '').trim();
    const tok = code.includes('.') ? code.split('.')[1] : code;
    saveSeat(id, { token: tok }); openRoom(id);
  } }, h('div.row', h('input', { name: 'code', placeholder: '복구 코드', autocomplete: 'off', 'aria-label': '복구 코드' }), h('button', { type: 'submit' }, '복구')));
  app.replaceChildren(h('div.center', form, h('details.card', { open: blocked ? true : undefined }, h('summary', '기존 참가자 복구'), rec)));
  form.querySelector('input:not([disabled])')?.focus();
}

// ---------- 실시간 연결 ----------
function receiveRoom(room, close = () => S.es?.close()) {
  if (room.id !== S.roomId || room.version < S.lastVersion) return;
  setConn(true);
  if (room.version === S.lastVersion && room.now < S.room?.now) return;
  const previous = S.room?.id === room.id ? S.room : null;
  S.lastVersion = room.version;
  S.room = room;
  if (!room.members.some(m => m.id === S.memberId)) { clearSeat(S.roomId); close(); return renderMissing('이 방에서 내보내졌거나 자리가 없어졌습니다.'); }
  if (previous) {
    const last = previous.chat?.at(-1)?.seq ?? 0;
    const newest = room.chat?.findLast(m => m.seq > last && m.pid !== S.memberId);
    if (newest) toast(`채팅 · ${newest.name}: ${newest.message}`, 'chat', 4800);
  }
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
  const type = r.gameType || 'life';
  if (r.status === 'lobby') { S.game?.destroy(); S.game = null; return renderLobby(); }
  if (S.game && S.game.gameType !== type) { S.game.destroy(); S.game = null; }
  if (!S.game) {
    const deps = { S, send, api, recoveryCode, leaveToHome, settingsEditor };
    S.game = type === 'harbor' ? new HarborScreen(app, deps) : new GameScreen(app, deps);
    S.game.gameType = type;
  }
  S.game.update(r);
}

// ---------- 대기실 ----------
function renderLobby() {
  const r = S.room;
  const meta = gameMeta(r.gameType);
  document.title = `대기실 (${r.members.length}/${r.capacity}) — ${meta.name}`;
  const me = r.members.find(m => m.id === S.memberId);
  const isHost = r.hostId === S.memberId;
  const link = `${location.origin}/r/${r.id}`;
  const others = r.members.filter(m => m.id !== r.hostId);
  const allReady = others.every(m => m.ready);
  const startReason = r.members.length < meta.min ? `${meta.min}명 이상 모이면 시작할 수 있어요.` : !allReady ? '모든 참가자가 준비해야 시작할 수 있어요.' : null;
  const keepScroll = window.scrollY;
  if (S.lobbyChat?.id !== r.id) S.lobbyChat = { id: r.id, ...roomChat(send) };
  const chat = S.lobbyChat;
  const hadFocus = document.activeElement === chat.input;
  const showRecovery = () => modal(h('div', h('h3', '내 복구 코드'), h('p.small', '다른 컴퓨터나 브라우저에서 이 코드를 넣으면 같은 자리로 들어옵니다. 다른 사람에게 보여 주지 마세요.'), h('code.code', recoveryCode()), h('button', { onclick: () => copyText(recoveryCode()) }, '복사')));
  const invite = r.code
    ? h('div.code-panel',
      h('div.code-label', '방 번호'),
      h('div.code-line', h('output.room-code', { 'aria-label': `방 번호 ${r.code.split('').join(' ')}` }, r.code), h('button.primary.big', { onclick: () => copyText(r.code) }, '번호 복사')),
      h('p.small', `친구는 같은 사이트 첫 화면의 「입장번호로 참여」에 이 번호를 넣으면 됩니다.${r.hasPassword ? ' 추가 비밀번호도 따로 알려 주세요.' : ' 닉네임만 있으면 참가할 수 있어요.'}`))
    : h('p.small', '이 방은 업데이트 전에 만들어져 번호가 없습니다. 아래 링크로 초대하세요.');
  app.replaceChildren(h('div.lobby' + (r.gameType === 'harbor' ? '.harbor-lobby' : ''),
    h('header.bar', h('h1', `${meta.name} · 대기실`), h('div.row', h('button', { onclick: showRecovery }, '내 복구 코드'), h('button', { onclick: leaveToHome }, '게임 선택으로'))),
    h('div.lobby-grid',
      h('section.card',
        h('h2', '친구 초대'),
        invite,
        h('details.link-box', { open: r.code ? undefined : true }, h('summary', '초대 링크로 보내기'),
          h('div.row', h('input.link', { value: link, readonly: true, 'aria-label': '초대 링크', onclick: (e) => e.target.select() }), h('button', { onclick: () => copyText(link) }, '링크 복사'))),
        h('h2', `참가자 ${r.members.length}/${r.capacity}${r.locked ? ' · 🔒 입장 잠김' : ''}`),
        h('ul.members', ...r.members.map((m) => h('li',
          h('span.dot' + (m.online ? '.on' : ''), { title: m.online ? '접속 중' : '접속 끊김' }), h('b', m.name), m.id === r.hostId ? h('span.badge', '방장') : null, m.id === S.memberId ? h('span.badge.me', '나') : null,
          h('span.ready' + (m.ready || m.id === r.hostId ? '.yes' : ''), m.id === r.hostId ? '방장' : m.ready ? '준비 완료' : '대기 중'),
          isHost && m.id !== S.memberId ? h('span.host-tools', h('button.small', { onclick: () => send('transferHost', { target: m.id }) }, '방장 넘기기'), h('button.small.danger', { onclick: () => confirm(`${m.name} 님을 내보낼까요?`) && send('kick', { target: m.id }) }, '내보내기')) : null,
        ))),
        h('div.row.wrap',
          !isHost ? h('button.primary.big', { onclick: () => send('ready', { ready: !me.ready }) }, me.ready ? '준비 취소' : '준비 완료') : null,
          isHost ? h('button.primary.big', { disabled: !!startReason || undefined, onclick: () => send('start') }, '게임 시작') : null,
          isHost ? h('button', { onclick: () => send('lock', { locked: !r.locked }) }, r.locked ? '입장 잠금 해제' : '입장 잠그기') : null,
          isHost ? h('label.inline', '정원 ', h('select', { onchange: (e) => send('capacity', { capacity: Number(e.target.value) }) }, ...Array.from({ length: meta.max - meta.min + 1 }, (_, i) => i + meta.min).map(n => h('option', { value: n, selected: n === r.capacity, disabled: n < r.members.length || undefined }, n + '명')))) : null,
          h('button', { onclick: () => confirm('방에서 나갈까요?') && send('leave').then(() => { clearSeat(S.roomId); leaveToHome(); }) }, '나가기'),
        ),
        startReason && isHost ? h('p.small', startReason) : null,
        h('div.notices', ...r.notices.slice(-5).reverse().map(n => h('div.small', '· ' + n.text))),
      ),
      h('section.card', h('h2', '게임 설정', isHost ? '' : ' (방장만 변경)'),
        r.gameType === 'harbor'
          ? harborSettingsEditor(r.settings, isHost, (s) => send('settings', { settings: s }))
          : settingsEditor(r.settings, isHost, (s) => send('settings', { settings: s }), Math.max(2, r.members.length))),
      h('section.card.lobby-chat', h('h2', '방 채팅'), chat.node),
    ),
  ));
  chat.update(r.chat || []);
  if (hadFocus) chat.input.focus({ preventScroll: true });
  window.scrollTo(0, keepScroll);
}

document.addEventListener('click', () => resumeBgm(), { once: true });
route();
export { S, won };
