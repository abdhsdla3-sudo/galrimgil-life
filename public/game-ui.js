// 게임 진행 화면
import { $, h, toast, modal, copyText, won, sign } from './util.js';
import { BoardView, nodeInfo, pawnLabels, SPACE_HELP } from './board-view.js';
import { JOBS, JOB_TYPE_NAMES, STATS, STAT_KEYS, STAT_MAX, STAGES, CARDS, STATUSES, ASSETS, SPACE_TYPES, JOB_CHANGE_COST } from '/game/content.js';
import { progressInfo, netWorth, debtLimit, jobEligibility, xpThreshold, nextPlayerId } from '/game/engine.js';
import { AVG_MOVE, SPEEDS } from '/game/settings.js';
import { sfx, audioPrefs, setAudio } from './audio.js';

const STEP_MS = { slow: 320, normal: 200, fast: 100, instant: 0 };
const CARD_MS = { slow: 6500, normal: 4800, fast: 3200, instant: 2000 };
const BANNER_MS = { slow: 1700, normal: 1300, fast: 900, instant: 700 };
const PER_TURN = { slow: 35, normal: 25, fast: 18, instant: 14 };
const REL = { single: '싱글', met: '알아가는 중', dating: '연애 중', married: '결혼' };
const ZOOMS = { all: '전체', fit: '맞춤', big: '크게' };
const STAT_SHORT = { smart: '지', body: '체', sense: '감', social: '사' };

export class GameScreen {
  constructor(root, deps) {
    this.root = root; this.d = deps;
    this.boardId = null;
    this.turnMarks = []; this.lastTurnKey = null; this.logFilter = 'all';
    this.prevCash = null; this.animating = false; this.dialogMin = null;
    this.speedLocal = load('glg.speed');
    this.build();
    this.board.meId = this.me;
    this.board.zoom = load('glg.zoom') || 'fit';
    this.timer = setInterval(() => this.tickTimer(), 500);
  }
  destroy() {
    this.destroyed = true;
    clearInterval(this.timer);
    clearTimeout(this.chatBubbleTimer);
    this.board.ro?.disconnect();
    document.querySelectorAll('.modal-back').forEach(m => m.remove());
  }
  get me() { return this.d.S.memberId; }
  get speed() { return this.speedLocal || this.room?.settings.speed || 'normal'; }

  build() {
    this.top = h('header.gbar');
    this.boardBox = h('div.board-box');
    this.hud = h('div.hud');
    this.stepBadge = h('div.step-badge');
    this.bannerBox = h('div.banner-layer');
    this.dialog = h('div.dialog-layer');
    this.zoomBar = h('div.zoom-bar');
    this.actionBox = h('section.action');
    this.playersBox = h('section.players');
    this.logBox = h('aside.log');
    this.buildChat();
    this.board = new BoardView(this.boardBox, (n) => modal(nodeInfo(this.g.board, n, this.g.players)));
    this.main = h('div.game',
      this.top,
      this.body = h('div.game-body' + (load('glg.logClosed') === '1' ? '.log-closed' : ''),
        this.logBox,
        h('div.board-wrap', this.boardBox, this.hud, this.stepBadge, this.zoomBar, this.dialog, this.bannerBox, this.chatBubble, this.chatPanel),
        h('aside.side', this.actionBox, this.playersBox)));
    this.root.replaceChildren(this.main);
    this.renderZoom();
  }

  async update(room) {
    const previous = this.room;
    this.room = room;
    this.serverOffset = room.now - Date.now();
    if (room.boardId !== this.boardId) {
      this.boardRequest ||= this.d.api(`/api/rooms/${room.id}/board`).finally(() => { this.boardRequest = null; });
      let board;
      try { ({ board } = await this.boardRequest); }
      catch (e) { if (this.room === room && !this.destroyed) toast(e.message, 'err'); return; }
      if (this.room !== room || this.destroyed) return;
      this.boardId = room.boardId; this.boardData = board;
      this.board.setBoard(board);
      this.g = null; this.prevCash = null; this.lastLogSeq = null;
    }
    this.renderChat(room.chat || []);
    const g = { ...room.game, board: this.boardData };
    const pd = g.pending;
    const gameKey = `${pd.id}:${g.logSeq}:${Object.keys(pd.responses || {}).length}`;
    if (this.g && gameKey === this.gameKey) {
      if (room.hostId !== previous?.hostId || room.members.some((m, i) => m.online !== previous?.members[i]?.online)) this.renderPlayers();
      this.tickTimer();
      return;
    }
    const firstLoad = !this.g;
    this.gameKey = gameKey;
    this.g = g;
    this.labels = pawnLabels(g.players);
    document.title = `${g.phase === 'over' ? '결과' : `${g.round}라운드`} — 갈림길 인생`;
    const curId = g.pending?.pid || g.order[g.turnIdx];
    // 턴 소요 시간 측정 (남은 시간 보정용)
    const key = g.phase === 'play' ? `${curId}:${P(g, curId).turns}` : null;
    const turnChanged = key !== this.lastTurnKey;
    if (turnChanged && key) {
      this.turnMarks.push(Date.now()); if (this.turnMarks.length > 25) this.turnMarks.shift();
      if (this.lastTurnKey && g.order[g.turnIdx] === this.me && g.phase === 'play') { sfx('turn'); if (document.hidden) document.title = '🔔 내 차례! — 갈림길 인생'; }
      this.lastTurnKey = key;
    }
    const roll = g.lastRoll && g.lastRoll.seq !== this.lastRollSeq ? g.lastRoll : null;
    const cashBefore = this.prevCash;
    this.prevCash = Object.fromEntries(g.players.map(p => [p.id, p.cash]));
    const moved = !firstLoad && g.players.some(p => (this.board.disp[p.id] ?? p.pos) !== p.pos);
    const moving = moved && !document.hidden && STEP_MS[this.speed] > 0;

    this.animating = moving;
    this.renderTop();
    this.renderPlayers();
    this.renderAction();
    this.renderLog();
    this.renderHud();
    if (roll && !firstLoad && !document.hidden) { this.lastRollSeq = roll.seq; this.showDice(roll); }
    else if (roll) this.lastRollSeq = roll.seq;
    this.animChain = (this.animChain || Promise.resolve()).then(() => {
      if (this.g !== g || this.destroyed) return;
      return this.board.animateTo(g.players, curId, moving ? STEP_MS[this.speed] : 0, (left, p) => {
        sfx('step');
        this.showSteps(p, left);
      }, () => this.g !== g || this.destroyed || document.hidden);
    });
    await this.animChain;
    if (this.g !== g || this.destroyed) return;
    this.showSteps(null);
    if (firstLoad || (moved && this.board.zoom === 'big' && !document.hidden)) this.board.scrollTo(P(g, curId)?.pos, 'instant');
    if (this.animating) { this.animating = false; this.renderAction(); }
    if (!firstLoad && previous?.game.pending.id !== pd.id && pd.kind === 'confirm' && pd.pid === this.me) {
      sfx(pd.lines.some(l => /실패|실직|강등/.test(l)) ? 'bad' : pd.lines.some(l => /성공|승진|결혼|탄생/.test(l)) ? 'good' : 'coin');
    }
    if (cashBefore) for (const p of g.players) {
      const d = p.cash - (cashBefore[p.id] ?? p.cash);
      if (d) this.board.floatText(p.id, `${d > 0 ? '+' : ''}${d}만`, d > 0 ? 'up' : 'down');
    }
    if (g.phase === 'over' && !this.resultsShown) { this.resultsShown = true; if (!firstLoad) sfx('fanfare'); this.showResults(); }
    if (key && this.highlightTurn !== key) {
      this.highlightTurn = key;
      const cur = P(g, g.order[g.turnIdx]);
      if (!firstLoad && pd.kind === 'turn' && cur) this.showBanner(cur);
    }
  }

  // ---------- 상단 ----------
  renderTop() {
    const g = this.g;
    const prog = progressInfo(g);
    const avgPct = Math.round(prog.reduce((a, x) => a + x.pct, 0) / prog.length);
    const cur = P(g, g.order[g.turnIdx]);
    const remainTurns = prog.reduce((a, x) => a + (x.left > 0 ? x.left / AVG_MOVE : 0), 0);
    const per = this.observedPerTurn() ?? PER_TURN[this.speed];
    const remMin = Math.round(remainTurns * per / 60);
    const stage = cur ? STAGES[g.board.nodes[cur.pos].stage] : '';
    const simul = g.pending?.kind === 'simul' && g.phase !== 'over';
    const waiting = new Set(awaitingIds(g));
    put(this.top,
      h('b.logo', '갈림길 인생'),
      g.phase === 'over' ? h('span.pill', '게임 종료') : h('span.pill', `${g.round}라운드 · ${stage}`),
      // 차례 순서 줄: 지금 차례인 사람이 크게, 끝난 사람은 흐리게
      h('div.order', { title: '차례 순서' }, ...g.order.map(id => {
        const p = P(g, id);
        const isCur = g.phase === 'play' && !simul && id === cur?.id;
        return h('span.oslot' + (isCur ? '.cur' : '') + (p.finished ? '.done' : '') + (simul && waiting.has(id) ? '.wait' : ''),
          { title: `${p.name}${id === this.me ? ' (나)' : ''}${p.finished ? ' · 은퇴' : ''}${g.orderRolls?.[id]?.length ? ' · 순서 주사위 ' + g.orderRolls[id].join(' → ') : ''}`, onmouseenter: () => this.board.spotlight(id), onmouseleave: () => this.board.spotlight(null), onclick: () => this.board.scrollTo(this.board.disp[id] ?? p.pos) },
          this.avatar(p), isCur ? h('b.oname', id === this.me ? '내 차례' : `${p.name} 차례`) : null);
      })),
      simul ? h('span.turn-chip.all', `모두 선택 중 ${g.pending.who.length - waiting.size}/${g.pending.who.length}`) : null,
      this.timerEl = h('span.timer'),
      h('span.spacer'),
      h('span.progress', { title: '모든 플레이어의 평균 진행률' }, h('span.bar', h('i', { style: { width: avgPct + '%' } })), ` ${avgPct}%`),
      g.phase !== 'over' ? h('span.small', { title: this.observedPerTurn() ? '실제 차례 소요 시간으로 보정' : '' }, `남은 약 ${Math.max(1, Math.round(remMin * 0.8))}~${Math.max(2, Math.round(remMin * 1.3))}분`) : null,
      h('select.speed', { title: '내 화면의 연출 속도 (결과에는 영향 없음)', onchange: (e) => { this.speedLocal = e.target.value; save('glg.speed', e.target.value); } },
        ...Object.entries(SPEEDS).map(([k, v]) => h('option', { value: k, selected: this.speed === k }, '연출: ' + v))),
      h('button.small', { 'aria-controls': 'game-chat', 'aria-expanded': String(!this.chatPanel.hidden), onclick: (e) => this.toggleChat(e.currentTarget) }, '채팅'),
      h('button.small', { onclick: () => this.menu() }, '메뉴'),
    );
    this.tickTimer();
  }
  renderZoom() {
    put(this.zoomBar, h('span.small', '보드'), ...Object.entries(ZOOMS).map(([k, v]) => h('button.small' + (this.board.zoom === k ? '.on' : ''), {
      onclick: () => { this.board.setZoom(k); save('glg.zoom', k); this.renderZoom(); this.centerBoard('instant'); },
    }, v)), this.board.zoom !== 'all' ? h('button.small', { onclick: () => this.centerBoard() }, '현재 말 보기') : null);
  }
  centerBoard(behavior) {
    if (!this.g) return;
    const id = this.g.pending?.pid || this.g.order[this.g.turnIdx];
    this.board.scrollTo(this.board.disp[id] ?? P(this.g, id)?.pos, behavior);
  }
  buildChat() {
    this.chatInput = h('input', { maxlength: 120, placeholder: '메시지 입력', 'aria-label': '채팅 메시지', required: true });
    this.chatList = h('div.chat-list', { role: 'log', 'aria-label': '채팅 기록' });
    this.chatBubble = h('div.chat-bubble', { hidden: true });
    const bubbles = h('input', { type: 'checkbox', checked: load('glg.chatBubbles') === '1', onchange: e => {
      save('glg.chatBubbles', e.target.checked ? '1' : '0');
      if (!e.target.checked) this.chatBubble.hidden = true;
    } });
    const send = h('button.small', { type: 'submit' }, '보내기');
    const form = h('form.chat-form', { onsubmit: async e => {
      e.preventDefault();
      const message = this.chatInput.value.trim();
      if (!message || send.disabled) return;
      send.disabled = true;
      try {
        if (await this.d.send('chat', { message }) && this.chatInput.value.trim() === message) this.chatInput.value = '';
      } finally { send.disabled = false; }
    } }, this.chatInput, send);
    this.chatPanel = h('section.chat-panel#game-chat', { hidden: true, 'aria-label': '방 채팅' },
      h('header', h('b', '방 채팅'), h('label.inline', bubbles, '말풍선 표시')), this.chatList, form);
  }
  toggleChat(button) {
    this.chatPanel.hidden = !this.chatPanel.hidden;
    button.setAttribute('aria-expanded', String(!this.chatPanel.hidden));
    if (!this.chatPanel.hidden) {
      this.chatList.scrollTop = this.chatList.scrollHeight;
      this.chatInput.focus({ preventScroll: true });
    }
  }
  renderChat(messages) {
    const newest = messages.at(-1);
    const seq = newest?.seq ?? 0;
    if (seq === this.chatSeq) return;
    const isNew = this.chatSeq !== undefined && seq > this.chatSeq;
    this.chatSeq = seq;
    put(this.chatList, ...messages.map(m => h('div.chat-message', h('b', m.name), ' ', m.message)));
    this.chatList.scrollTop = this.chatList.scrollHeight;
    if (isNew && load('glg.chatBubbles') === '1') {
      put(this.chatBubble, h('b', newest.name), ' ', newest.message);
      this.chatBubble.hidden = false;
      clearTimeout(this.chatBubbleTimer);
      this.chatBubbleTimer = setTimeout(() => { this.chatBubble.hidden = true; }, 4500);
    }
  }
  avatar(p, cls = '') {
    return h('span.av' + cls, { style: { background: p.color } }, this.labels?.[p.id] || p.name.slice(0, 1));
  }
  // 보드 왼쪽 위: 지금 차례인 사람 정보
  renderHud() {
    const g = this.g, pd = g.pending;
    if (!pd || g.phase === 'over') { put(this.hud); this.hud.hidden = true; return; }
    this.hud.hidden = false;
    if (pd.kind === 'simul') {
      const waiting = awaitingIds(g);
      put(this.hud, h('div.hud-all', h('b', pd.title), h('div.small', `모두 동시에 고르는 중 · 남은 사람 ${waiting.length}명`),
        h('div.hud-wait', ...waiting.map(id => this.avatar(P(g, id), '.sm')))));
      this.hud.style.borderColor = '';
      return;
    }
    const p = P(g, pd.pid || g.order[g.turnIdx]);
    const node = g.board.nodes[p.pos];
    const job = p.job ? `${JOBS[p.job.id].name} · ${JOBS[p.job.id].ranks[p.job.rank]}` : (node.stage === 'growth' ? '학생' : '무직');
    const payType = node.stage === 'growth' ? 'allowance' : 'payday';
    const dist = this.board.distanceTo(p.pos, payType);
    this.hud.style.borderColor = p.color;
    put(this.hud,
      h('div.hud-head', { style: { background: p.color } }, this.avatar(p, '.lg'), h('div', h('b.hud-name', p.name, p.id === this.me ? ' (나)' : ''), h('div.hud-sub', waitText(pd, p.id === this.me)))),
      h('div.hud-body', { onclick: () => this.playerDetail(p), title: '눌러서 자세히 보기' },
        h('div.hud-row', h('span', '💼 ', job), h('b.hud-cash', won(p.cash))),
        p.debt ? h('div.hud-row.neg', `부채 ${p.debt} / 한도 ${debtLimit(p)}`) : null,
        h('div.hud-stats', ...STAT_KEYS.map(k => h('span.hs', { title: STATS[k] }, STAT_SHORT[k], h('b', p.stats[k])))),
        dist ? h('div.hud-row.small', `${payType === 'payday' ? '💰 월급날' : '🪙 용돈 칸'}까지 ${dist}칸`) : null));
  }
  showSteps(p, left) {
    if (!p || !left) { this.stepBadge.classList.remove('on'); return; }
    put(this.stepBadge, this.avatar(p, '.sm'), ` 앞으로 ${left}칸`);
    this.stepBadge.style.borderColor = p.color;
    this.stepBadge.classList.add('on');
  }
  showBanner(p) {
    const mine = p.id === this.me;
    const el = h('div.turn-banner' + (mine ? '.mine' : ''), { style: { '--pc': p.color } },
      this.avatar(p, '.xl'), h('div', h('div.tb-main', mine ? '내 차례!' : `${p.name} 님의 차례`), mine ? h('div.tb-sub', '주사위를 굴리세요') : null));
    this.bannerBox.replaceChildren(el);
    setTimeout(() => el.classList.add('out'), BANNER_MS[this.speed]);
    setTimeout(() => el.remove(), BANNER_MS[this.speed] + 400);
  }
  observedPerTurn() {
    const t = this.turnMarks;
    if (t.length < 6) return null;
    const ds = t.slice(1).map((x, i) => (x - t[i]) / 1000).filter(x => x < 300).sort((a, b) => a - b);
    return ds.length ? ds[Math.floor(ds.length / 2)] : null;
  }
  tickTimer() {
    const r = this.room;
    if (!this.timerEl || !r) return;
    if (r.deadline && r.game?.pending?.id === r.deadline.pendingId) {
      const left = Math.max(0, Math.ceil((r.deadline.at - (Date.now() + this.serverOffset)) / 1000));
      this.timerEl.textContent = `⏱ ${left}초`;
      this.timerEl.classList.toggle('urgent', left <= 10);
    } else this.timerEl.textContent = '';
    // 상태 변화가 없어도 "연결 끊긴 플레이어 자동 진행" 버튼이 제때 나타나도록 확인
    if (this.g && r.status === 'playing') {
      const key = awaitingIds(this.g).filter(pid => { const m = r.members.find(x => x.id === pid); return m && !m.online && (Date.now() + this.serverOffset - m.lastSeen) > 60000; }).join(',');
      if (key !== this.offlineKey) { this.offlineKey = key; this.renderAction(); }
    }
  }
  menu() {
    const a = audioPrefs();
    const m = modal(h('div.menu',
      h('h3', '메뉴'),
      h('button', { onclick: () => { m.close(); this.rulesModal(); } }, '규칙 요약'),
      h('button', { onclick: () => { m.close(); this.legendModal(); } }, '칸 종류 보기'),
      h('button', { onclick: () => modal(h('div', h('h3', '내 복구 코드'), h('p.small', '다른 컴퓨터·브라우저에서 첫 화면의 "이어하기"에 넣으면 내 자리로 돌아옵니다. 다른 사람에게 보여 주지 마세요.'), h('code.code', this.d.recoveryCode()), h('button', { onclick: () => copyText(this.d.recoveryCode()) }, '복사'))) }, '내 복구 코드'),
      h('button', { onclick: () => copyText(`${location.origin}/r/${this.room.id}`) }, '방 링크 복사'),
      h('label.inline', h('input', { type: 'checkbox', checked: a.sfx, onchange: (e) => setAudio('sfx', e.target.checked) }), '효과음'),
      h('label.inline', h('input', { type: 'checkbox', checked: a.bgm, onchange: (e) => setAudio('bgm', e.target.checked) }), '배경 음악'),
      h('p.small', '창을 닫아도 게임은 서버에 계속 저장됩니다. 같은 링크로 다시 들어오면 이어서 진행합니다.'),
      h('button', { onclick: () => { m.close(); this.d.leaveToHome(); } }, '첫 화면으로 (게임은 유지)'),
    ));
  }
  rulesModal() {
    modal(h('div.rules', { html: RULES_HTML }), { wide: true });
  }
  legendModal() {
    const used = new Set(Object.values(this.g.board.nodes).map(n => n.type));
    modal(h('div', h('h3', '칸 종류'), h('div.legend', ...Object.entries(SPACE_TYPES).filter(([k]) => used.has(k)).map(([k, t]) =>
      h('div.lg-item', h('span.lg-icon', t.icon), h('div', h('b', t.name), h('div.small', SPACE_HELP[k] || '')))))), { wide: true });
  }

  // ---------- 플레이어 목록 ----------
  renderPlayers() {
    const g = this.g;
    const prog = Object.fromEntries(progressInfo(g).map(x => [x.pid, x]));
    const curId = g.order[g.turnIdx];
    const nextId = nextPlayerId(g);
    const waiting = new Set(awaitingIds(g));
    const members = Object.fromEntries(this.room.members.map(m => [m.id, m]));
    const ordered = g.order.map(id => P(g, id));
    const simul = g.pending?.kind === 'simul';
    put(this.playersBox, h('h3', `플레이어 ${g.players.length}명`, h('span.small', ' · 이름에 마우스를 올리면 말이 강조됩니다')),
      h('div.plist' + (g.players.length > 6 ? '.dense' : ''), ...ordered.map(p => {
        const mem = members[p.id];
        const job = p.job ? `${JOBS[p.job.id].name} ${JOBS[p.job.id].ranks[p.job.rank]}` : (g.board.nodes[p.pos].stage === 'growth' ? '학생' : '무직');
        const isCur = p.id === curId && g.phase === 'play' && !simul;
        return h('button.pcard' + (isCur ? '.cur' : '') + (p.id === this.me ? '.me' : '') + (p.finished ? '.done' : ''),
          { style: { borderColor: p.color, '--pc': p.color }, onclick: () => this.playerDetail(p), onmouseenter: () => this.board.spotlight(p.id), onmouseleave: () => this.board.spotlight(null) },
          h('div.prow', this.avatar(p), h('b.pname', p.name), p.id === this.me ? h('span.badge.me', '나') : null, h('span.dot' + (mem?.online ? '.on' : ''), { title: mem?.online ? '접속 중' : '연결 끊김' }),
            isCur ? h('span.badge', '차례') : p.id === nextId && g.phase === 'play' && !simul ? h('span.badge.next', '다음') : null,
            simul && waiting.has(p.id) ? h('span.badge.wait', '선택 중') : null,
            simul && !waiting.has(p.id) && g.phase !== 'over' ? h('span.badge.okb', '✓') : null,
            p.finished ? h('span.badge', `은퇴 ${p.finishOrder}위`) : null),
          h('div.prow.small', job, ' · ', REL[p.relation.state], p.children.length ? ` · 자녀 ${p.children.length}` : ''),
          h('div.prow.small', `💰 ${won(p.cash)}`, p.debt ? h('span.neg', ` 부채 ${p.debt}`) : null, ` · 순자산 ${won(netWorth(p))}`),
          h('div.prow.small', h('span.bar.thin', h('i', { style: { width: prog[p.id].pct + '%', background: p.color } })), ` ${prog[p.id].pct}%`,
            ...p.statuses.map(s => h('span.st' + (STATUSES[s.id].bad ? '.bad' : ''), { title: STATUSES[s.id].desc }, STATUSES[s.id].name)),
            p.cards.length ? h('span.small', ` 🃏${p.cards.length}`) : null),
        );
      })));
  }

  playerDetail(p) {
    const g = this.g;
    p = P(g, p.id);
    const j = p.job ? JOBS[p.job.id] : null;
    let promo = '';
    if (j) {
      if (p.job.rank >= j.ranks.length - 1) promo = '최고 직급';
      else if (j.type === 'stable') promo = `다음 승진: ${j.promo.stats.map(k => STATS[k]).join('+')} 합 ${j.promo.sum[p.job.rank]} 이상이면 월급날 자동 (현재 ${j.promo.stats.reduce((a, k) => a + p.stats[k], 0)})`;
      else if (j.type === 'challenge') promo = `다음 승진: 직업 칸·월급날 도착 시 주사위+${STATS[j.promo.stat]} ≥ ${j.promo.target[p.job.rank]} (연속 2회 실패 시 강등, 현재 실패 ${p.job.fails})`;
      else if (j.type === 'growth') promo = `다음 승진: 성과 ${xpThreshold(g, p.job.id, p.job.rank)} (현재 ${p.job.xp}). 월급날마다 +1`;
      else promo = '직급 없음. 직장 칸에서 다른 직업으로 옮길 수 있음';
    }
    modal(h('div.detail',
      h('h2', this.avatar(p, '.lg'), ' ', p.name, p.finished ? ` · 은퇴 ${p.finishOrder}위` : ''),
      h('div.grid2',
        h('div',
          h('h4', '능력'), ...STAT_KEYS.map(k => h('div.stat', h('span', STATS[k]), h('span.bar', h('i', { style: { width: (p.stats[k] / STAT_MAX * 100) + '%' } })), h('b', p.stats[k]))),
          h('h4', '직업'), h('p', j ? `${j.name} (${JOB_TYPE_NAMES[j.type]}) · ${j.ranks[p.job.rank]} · 월급 ${j.salary[p.job.rank]}` : '없음', p.degree ? ' · 🎓 학위' : ''),
          h('p.small', promo),
          p.jobHistory.length ? h('p.small', '경력: ' + p.jobHistory.map(x => `${JOBS[x.id].name}(${JOBS[x.id].ranks[x.rank]})`).join(' → ')) : null,
          h('h4', '관계·가족'),
          h('p', REL[p.relation.state], p.relation.partner ? ` · ${p.relation.partner} (호감도 ${p.relation.affection})` : '', p.children.length ? ` · 자녀: ${p.children.join(', ')}` : '', p.pet ? ' · 🐾 반려동물' : ''),
          h('p.small', `추억 ${p.memories}개 (정산 시 개당 15)`),
        ),
        h('div',
          h('h4', '돈'), h('p', `현금 ${won(p.cash)} · 부채 ${p.debt} / 한도 ${debtLimit(p)} · 순자산 ${won(netWorth(p))}`),
          h('h4', '자산'), p.assets.length ? h('ul', ...p.assets.map(a => h('li', `${a.name} — 평가 ${a.value}${a.income ? ` · 월급날 수입 ${a.income}` : ''}${a.cat === 'treasure' ? ' · 정산 때 감정' : ''}`))) : h('p.small', '없음'),
          h('h4', `카드 ${p.cards.length}/5`), p.cards.length ? h('ul', ...p.cards.map(c => h('li', h('b', CARDS[c].name), ` — ${CARDS[c].desc}`))) : h('p.small', '없음'),
          h('h4', '상태'), p.statuses.length ? h('ul', ...p.statuses.map(s => h('li', `${STATUSES[s.id].name}: ${STATUSES[s.id].desc} (${s.turns < 0 || s.turns >= 90 ? '해제 조건까지' : `${s.turns}턴 남음`})`))) : h('p.small', '없음'),
        ),
      ),
      h('h4', '직업 조건'), h('div.jobs', ...Object.entries(JOBS).filter(([, x]) => !x.pack || g.settings.packs[x.pack]).map(([id, x]) => {
        const miss = jobEligibility(g, p, id);
        return h('div.job' + (miss.length ? '.no' : '.ok'), h('b', x.name), h('span.small', ` ${JOB_TYPE_NAMES[x.type]} · 월급 ${x.salary[0]}~${x.salary.at(-1)}`), h('div.small', miss.length ? miss.join(', ') : '조건 충족'));
      })),
      h('h4', '인생 기록'), h('ol.small', ...p.record.map(r => h('li', r))),
    ), { wide: true });
  }

  // ---------- 행동 패널 + 가운데 선택 창 ----------
  renderAction() {
    const g = this.g, pd = g.pending;
    if (!g) return;
    const box = this.actionBox;
    put(box);
    box.classList.remove('mine');
    if (!pd || g.phase === 'over') { add(box, h('h3', '게임 종료'), h('button.primary', { onclick: () => this.showResults() }, '결과 보기')); put(this.dialog); return; }
    const mine = pd.kind === 'simul' ? pd.who.includes(this.me) && !(this.me in pd.responses) : pd.pid === this.me;
    const actor = pd.pid ? P(g, pd.pid) : null;
    const go = async (action) => {
      if (this.g.pending.id !== pd.id || this.submitting === pd.id || this.animating) return;
      this.submitting = pd.id;
      this.renderAction();
      try { await this.d.send('game', { action, pendingId: pd.id }); }
      finally {
        if (this.submitting === pd.id) this.submitting = null;
        if (!this.destroyed && this.g.pending.id === pd.id) this.renderAction();
      }
    };
    const defaultNote = (opts) => {
      if (!this.room.settings.timeLimit) return null;
      const d = opts.find(o => o.default && !o.disabled) || opts.find(o => !o.disabled);
      return h('p.small.note', `시간 초과 시 기본 행동: ${d ? d.label : '첫 번째'}`);
    };
    const offlineWaiters = awaitingIds(g).filter(pid => { const m = this.room.members.find(x => x.id === pid); return m && !m.online && (Date.now() + this.serverOffset - m.lastSeen) > 60000; });
    const autoBtn = offlineWaiters.length ? h('button.warnbtn', { onclick: () => this.d.send('autoResolve') }, `연결 끊긴 ${offlineWaiters.map(id => P(g, id).name).join(', ')} 자동 진행`) : null;
    const hint = h('p.hint', '👉 보드 가운데 창에서 고르세요');
    let center = null; // { title, text, lines, body, dock }
    if (this.animating || (mine && this.submitting === pd.id)) {
      add(box, h('h3', this.animating ? '말 이동 중…' : '행동 처리 중…'));
      put(this.dialog);
      this.board.highlight([]);
      return;
    }

    if (pd.kind === 'simul') {
      const opts = pd.perPlayer?.[this.me] || pd.options;
      const done = pd.who.filter(id => id in pd.responses).length;
      add(box, h('h3', pd.title), h('p.small', `응답 ${done}/${pd.who.length}명`));
      if (mine) {
        box.classList.add('mine');
        add(box, hint);
        center = { title: pd.title, text: pd.text, sub: `모두 동시에 고릅니다 · 응답 ${done}/${pd.who.length}명`, body: [h('div.opts', ...opts.map((o, i) => optionButton(o, () => go({ type: 'simul', index: i })))), defaultNote(opts)] };
      } else {
        if (pd.who.includes(this.me)) add(box, h('p.ok', pd.sub === 'order' ? `주사위 ${pd.responses[this.me]} · 다른 사람을 기다리는 중…` : '선택 완료! 다른 사람을 기다리는 중…'));
        if (pd.sub === 'order') center = { title: pd.title, text: pd.text };
      }
      add(box, autoBtn);
    } else if (!mine) {
      box.style.setProperty('--pc', actor.color);
      add(box, h('div.wait-head', this.avatar(actor, '.lg'), h('div', h('h3', `${actor.name} 님 차례`), h('div.small', waitText(pd)))));
      if (pd.kind === 'choice' || pd.kind === 'branch') center = { title: pd.title || '갈림길', text: pd.text, body: [h('div.opts.ro', ...pd.options.map(o => optionButton(o, null)))] };
      if (pd.kind === 'reroll') center = { title: pd.title, text: '판정에 실패했습니다. 다시 굴릴지 선택하는 중입니다.', lines: pd.ctx.lines };
      if (pd.kind === 'confirm' && !this.room.settings.skipRepeat) center = { title: pd.title, text: pd.text, lines: pd.lines };
      if (center) center = { ...center, actor, sub: '다른 플레이어의 차례' };
      add(box, autoBtn);
    } else {
      const me = P(g, this.me);
      box.classList.add('mine');
      box.style.setProperty('--pc', me.color);
      if (pd.kind === 'turn') {
        const roll = () => { sfx('dice'); go({ type: 'roll' }); };
        add(box, h('h3.mine', '🎲 내 차례!'), h('button.primary.big.dice', { onclick: roll }, '🎲 주사위 굴리기'));
        if (pd.canPlan) add(box, h('button', { onclick: () => go({ type: 'life' }) }, '생활 선택'));
        if (g.round === 1 && !me.turns && g.orderRolls) {
          add(box, h('p.small', `시작 순서 · ${g.order.map(id => `${P(g, id).name} ${g.orderRolls[id]?.join('→')}`).join(' · ')}`));
        }
        const cards = pd.cards || [];
        if (cards.length) {
          add(box, h('h4', '카드 (주사위 전에 사용, 차례를 쓰지 않음)'));
          add(box, h('div.cards', ...cards.map((c, i) => cardControl(c, i, me, g, (extra) => go({ type: 'useCard', index: i, ...extra })))));
        }
        if (pd.canRepay) {
          const inp = h('input', { type: 'number', min: 1, max: Math.min(me.cash, me.debt), value: Math.min(me.cash, me.debt), style: { width: '90px' } });
          add(box, h('div.row', h('span.small', `부채 ${me.debt} 상환: `), inp, h('button.small', { onclick: () => go({ type: 'repay', amount: Number(inp.value) }) }, '갚기')));
        }
        add(box, defaultNote([{ label: '주사위 굴리기' }]));
        center = { dock: true, body: [h('button.primary.big.dice.dock-dice', { onclick: roll }, '🎲 주사위 굴리기'), cards.length ? h('div.small.dock-note', `카드 ${cards.length}장 · 오른쪽 패널에서 먼저 쓸 수 있어요`) : null] };
      } else if (pd.kind === 'confirm') {
        const label = pd.returnTo === 'turn' ? '이동 준비로 돌아가기' : '결과 확인하고 차례 넘기기';
        add(box, h('h3.mine', '차례 결과'), hint);
        center = { title: pd.title, text: pd.text, lines: pd.lines, body: [h('button.primary', { onclick: () => go({ type: 'confirm' }) }, label)] };
      } else if (pd.kind === 'branch') {
        add(box, h('h3.mine', '갈림길!'), hint);
        center = { title: '갈림길! 길을 고르세요', sub: `남은 이동 ${pd.steps}칸 · 보드에서 깜빡이는 칸이 각 길의 첫 칸`, body: [h('div.opts.row-opts', ...pd.options.map((o, i) => optionButton(o, () => go({ type: 'branch', index: i })))), defaultNote(pd.options)] };
        this.board.highlight(pd.options.map(o => o.to));
      } else if (pd.kind === 'choice') {
        add(box, h('h3.mine', pd.title), hint);
        center = { title: pd.title, text: pd.text, lines: pd.ctx?.lines, body: [h('div.opts', ...pd.options.map((o, i) => optionButton(o, () => go({ type: 'choose', index: i })))), defaultNote(pd.options)] };
      } else if (pd.kind === 'reroll') {
        add(box, h('h3.mine', '판정 실패…'), hint);
        center = { title: '판정 실패…', text: '"다시 한 번" 카드로 다시 굴릴까요?', lines: pd.ctx?.lines,
          body: [h('div.row', h('button.primary', { onclick: () => go({ type: 'reroll', use: true }) }, '카드 사용해서 다시 굴리기'), h('button', { onclick: () => go({ type: 'reroll', use: false }) }, '결과 받아들이기'))] };
      }
    }
    if (!(mine && pd.kind === 'branch')) this.board.highlight([]);
    this.renderDialog(center, pd);
  }
  renderDialog(c, pd) {
    if (!c || this.animating) { put(this.dialog); return; }
    const me = c.actor || P(this.g, this.me);
    if (c.dock) { put(this.dialog, h('div.dock', { style: { '--pc': me.color } }, ...c.body)); return; }
    if (this.dialogMin === pd.id) {
      put(this.dialog, h('button.dlg-min', { style: { '--pc': me.color }, onclick: () => { this.dialogMin = null; this.renderAction(); } }, '▲ 선택 창 열기: ', c.title));
      return;
    }
    put(this.dialog, h('div.dlg' + (c.actor ? '.spectator' : ''), { style: { '--pc': me.color } },
      h('div.dlg-head', this.avatar(me), h('b', c.title), h('span.spacer'), h('button.small', { title: '창을 접고 보드 보기', onclick: () => { this.dialogMin = pd.id; this.renderAction(); } }, '보드 보기 ▼')),
      h('div.dlg-body',
        c.sub ? h('div.small', c.sub) : null,
        c.text ? h('p.dlg-text', c.text) : null,
        c.lines?.length ? h('div.lines', ...c.lines.map(l => lineChip(l))) : null,
        ...(c.body || []))));
  }

  // ---------- 기록 (왼쪽) ----------
  renderLog() {
    const g = this.g;
    const filters = { all: '전체', me: '나', money: '돈', joint: '공동' };
    const lastSeen = this.lastLogSeq ?? Infinity;
    this.lastLogSeq = g.log.length ? g.log[g.log.length - 1].seq : 0;
    const list = g.log.slice().reverse().filter(e => this.logFilter === 'all' || (this.logFilter === 'me' && e.pid === this.me) || (this.logFilter === 'money' && e.changes.some(c => /현금|부채|자산/.test(c))) || (this.logFilter === 'joint' && e.kind === 'joint')).slice(0, 150);
    const keep = this.logList?.scrollTop || 0;
    this.logList = h('div.log-list', ...list.map(e => {
      const p = e.pid ? P(g, e.pid) : null;
      return h('div.log-item' + (e.seq > lastSeen ? '.new' : '') + (p ? '' : '.sys'), { style: p ? { borderLeftColor: p.color } : {} },
        h('div.log-top', p ? this.avatar(p, '.sm') : h('span.av.sm.sys', 'ⓘ'), p ? h('b.log-name', { style: { color: p.color } }, p.name) : null, h('span.small.r', `${e.round}R`)),
        h('div.log-text', e.text),
        e.changes.length ? h('div.changes', ...e.changes.map(c => lineChip(c, true))) : null);
    }));
    put(this.logBox,
      h('div.log-head', h('button.small.log-toggle', { title: '기록 접기/펼치기', onclick: () => { const c = this.body.classList.toggle('log-closed'); save('glg.logClosed', c ? '1' : '0'); setTimeout(() => this.board.fit(), 50); } }, '◀'), h('b', '📜 기록'), h('span.spacer'), ...Object.entries(filters).map(([k, v]) => h('button.small' + (this.logFilter === k ? '.on' : ''), { onclick: () => { this.logFilter = k; this.lastLogSeq = null; this.renderLog(); } }, v))),
      this.logList);
    this.logList.scrollTop = keep;
  }

  // ---------- 연출 ----------
  showDice(roll) {
    const p = P(this.g, roll.pid);
    const el = h('div.dice-pop', { style: { '--pc': p?.color } }, p ? h('div.dp-who', this.avatar(p, '.sm'), ` ${p.name}`) : null, h('div.die', String(roll.v)), h('div.small', roll.text));
    this.bannerBox.replaceChildren(el);
    sfx('dice');
    setTimeout(() => el.remove(), Math.max(1000, CARD_MS[this.speed] / 3));
  }
  showResults() {
    const g = this.g, r = g.results;
    if (!r) return;
    const isHost = this.room.hostId === this.me;
    const body = h('div.results',
      h('h2', '🏁 최종 정산'),
      h('p.small', '총점 = 현금 + 자산 평가액(골동품은 감정) − 부채 + 공개 보너스(은퇴 순위·가족·추억·직급·업적). 동점이면 현금 → 먼저 은퇴한 순.'),
      ...r.map((x, i) => h('details.res' + (i === 0 ? '.win' : ''), { open: i < 3 || undefined, style: { borderColor: x.color, animationDelay: (r.length - i) * 0.25 + 's' } },
        h('summary', h('span.rank', `${x.rank}위`), this.avatar(P(g, x.pid) || x), h('b', ` ${x.name}`), h('span.total', won(x.total)), h('div.small', x.summary)),
        h('table', ...x.rows.map(([k, v]) => h('tr', h('td', k), h('td.num' + (v < 0 ? '.neg' : ''), sign(v))))),
        h('div.small', h('b', '인생 기록: '), x.record.join(' → ')),
      )),
      h('div.row',
        isHost ? h('button.primary', { onclick: () => this.d.send('rematch') }, '같은 멤버로 다시 하기') : h('p.small', '방장이 "다시 하기"를 누르면 같은 방 대기실로 돌아갑니다.'),
        h('button', { onclick: () => copyText(r.map(x => `${x.rank}위 ${x.name} ${x.total} — ${x.summary}`).join('\n')) }, '결과 복사'),
        h('button', { onclick: () => this.d.leaveToHome() }, '게임 선택으로')),
    );
    modal(body, { wide: true });
  }
}

const clean = (kids) => kids.flat().filter(k => k !== null && k !== undefined && k !== false && k !== '');
const put = (el, ...kids) => el.replaceChildren(...clean(kids));
const add = (el, ...kids) => el.append(...clean(kids));
const P = (g, id) => g.players.find(p => p.id === id);
function awaitingIds(g) {
  const pd = g.pending;
  if (!pd || g.phase === 'over') return [];
  if (pd.kind === 'simul') return pd.who.filter(id => !(id in pd.responses));
  return pd.pid ? [pd.pid] : [];
}
function waitText(pd, mine) {
  if (pd.kind === 'confirm') return mine ? '결과를 확인하고 차례를 넘겨요' : '차례 결과를 확인하는 중';
  if (mine) return { turn: '주사위를 굴릴 차례예요', branch: '갈림길에서 길을 골라요', choice: '사건에서 선택해요', reroll: '다시 굴릴지 골라요' }[pd.kind] || '';
  return { turn: '주사위를 굴리거나 카드를 쓰는 중', branch: '갈림길에서 길을 고르는 중', choice: '사건에서 선택하는 중', reroll: '다시 굴릴지 고민 중' }[pd.kind] || '';
}
// 결과 한 줄을 좋음/나쁨 색으로 구분해 표시
function lineChip(l, small) {
  const bad = /실패|실직|강등|강제 매각|신용 경고|자동 대출|버림|-\d|부채 \+/.test(l);
  const good = !bad && /성공|승진|결혼|탄생|획득|취득|해제|\+\d/.test(l);
  return h((small ? 'span' : 'div') + '.ln' + (good ? '.good' : bad ? '.bad' : ''), l);
}
function load(k) { try { return localStorage.getItem(k); } catch { return null; } }
function save(k, v) { try { localStorage.setItem(k, v); } catch { /* 저장 불가 환경 */ } }
function optionButton(o, onClick) {
  const b = h('button.opt' + (o.disabled ? '.dis' : '') + (o.default ? '.def' : ''), { disabled: !onClick || o.disabled ? true : undefined, onclick: onClick },
    h('div.opt-top', h('b', o.label), o.cost ? h('span.cost', `비용 ${o.cost}`) : null, o.prob !== undefined ? h('span.prob', `성공 ${o.prob}%`) : null),
    o.desc ? h('div.small', o.desc) : null,
    o.check ? h('div.small.chk', o.check) : null,
    o.succ !== undefined ? h('div.small', h('span.okc', '성공: '), o.succ || '변화 없음', ' / ', h('span.failc', '실패: '), o.fail) : null,
    o.disabled ? h('div.small.why', '✖ ' + o.disabled) : null,
  );
  if (o.default) b.title = '안전한 기본 선택지';
  return b;
}
function cardControl(c, i, me, g, use) {
  const def = CARDS[c.id];
  const extra = {};
  let input = null;
  if (def.needsValue) { input = h('select', ...[1, 2, 3, 4, 5, 6].map(v => h('option', { value: v }, v + '칸'))); }
  if (def.needsStat) { input = h('select', ...STAT_KEYS.map(k => h('option', { value: k }, STATS[k]))); }
  if (def.needsTarget) { input = h('select', ...g.players.filter(p => p.id !== me.id).map(p => h('option', { value: p.id }, p.name))); }
  return h('div.cardc' + (c.reason ? '.dis' : ''),
    h('b', def.name), h('div.small', def.desc), c.reason ? h('div.small.why', '사용 불가: ' + c.reason) : null,
    !c.reason ? h('div.row', input, h('button.small', { onclick: () => {
      if (def.needsValue) extra.value = Number(input.value);
      if (def.needsStat) extra.stat = input.value;
      if (def.needsTarget) extra.target = input.value;
      use(extra);
    } }, '사용')) : null);
}

const RULES_HTML = `
<h2>규칙 요약</h2>
<p>준비를 마치면 순서 주사위를 굴립니다. 높은 숫자부터 시작하며, 동점자만 다시 굴립니다.</p>
<h3>한 턴의 순서</h3>
<ol><li>이동 전에 카드 사용·부채 상환을 할 수 있습니다. 성인기에는 생활 활동을 한 가지 고를 수 있습니다.</li><li>주사위(1~6) 굴리기 → 보정 적용 순서: 정조준(값 고정) → 질주 +2 → 의욕 +1 → 번아웃 −1 → 자동차 최소 2 → 최소 1</li>
<li>한 칸씩 이동. 갈림길이면 길을 고름. <b>정지</b> 칸(관문·은퇴)을 만나면 남은 이동은 사라짐. 지나가는 월급날·용돈 칸은 그대로 받음</li>
<li>멈춘 칸의 사건 → 선택 → 판정(주사위+능력 ≥ 목표, 성공 확률 % 표시) → 결과·상태 변화</li><li>결과를 확인하고 차례를 넘깁니다.</li></ol>
<h3>단계</h3><p>성장기 → 진로의 문(능력 보완) → 캠퍼스 길(학위·학자금) / 사회 길(아르바이트·현금) → 첫 직장 → 성인 전반 → 인생 중간 점검 → 성인 후반 → 은퇴</p>
<h3>직업</h3><ul><li><b>조건형</b>: 능력 합이 기준 이상이면 월급날 자동 승진</li><li><b>도전형</b>: 직업 칸·월급날 도착 때 승진 판정, 연속 2회 실패 시 강등</li><li><b>축적형</b>: 성과(월급날 +1, 사건)로 승진</li>
<li>전직: 교육비 ${JOB_CHANGE_COST}, 능력·카드·자산 유지, 직급 초기화, 성과 절반 이월. 실직하면 실업 급여(3회)와 재취업 사건, 아르바이트로 회복</li></ul>
<h3>관계와 가족</h3><p>성인기의 생활 선택에서 만남·데이트를 할 수 있습니다. 호감도 2 이상이면 연애하고, 3 이상이면 프러포즈할 수 있습니다. 결혼하면 월급날 배우자 수입 +10과 정산 +100을 받습니다. 자녀 한 명당 양육비 6과 정산 +60이 적용됩니다. 교육을 지원하면 장학금과 월급날 생활비 지원 경로가 열립니다.</p>
<h3>돈</h3><ul><li>지출이 현금보다 크면 자동 대출. 부채 한도 = 200 + 직업 있으면 60×(직급+1) + 자산 평가액의 절반</li><li>한도 초과 시 가장 싼 자산부터 70%에 강제 매각 → 그래도 넘으면 신용 경고(구매 불가). 한도 아래로 내려오면 해제, "오뚝이" 업적</li><li>월급날 이자: 부채의 5%(올림)</li><li>"모두에게" 효과 총액 = 기준액 × min(상대 수, 3) → 12명이어도 과도하지 않음</li></ul>
<h3>카드 (최대 5장, 넘치면 가장 오래된 카드 버림)</h3><p>같은 카드는 한 차례에 한 번. 다시 한 번은 판정 실패 직후, 생활 보험은 지출 사건에서 자동.</p>
<h3>상태</h3><p>같은 상태는 겹치지 않고 남은 턴을 더 큰 값으로 갱신. 얻은 차례에는 줄지 않고 다음 차례부터 감소.</p>
<h3>은퇴와 정산</h3><p>은퇴 칸에 도착한 순서대로 150 / 100 / 60 보너스. 은퇴한 사람은 차례를 건너뛰지만 공동 사건과 다른 사람의 효과는 계속 받음. 모두 은퇴하면 정산: 현금 + 자산(골동품 감정 0.2~4배) − 부채 + 배우자 100 + 자녀 60 + 반려동물 20 + 추억×15 + 직급×40 + 업적. 동점은 현금 → 먼저 은퇴한 순.</p>
<h3>뒤처진 플레이어</h3><p>3명 이상일 때 순자산 꼴찌이고 1위와 200 이상 차이 나면 4턴마다 차례 시작 시 카드 1장.</p>`;
