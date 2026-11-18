// 게임 진행 화면
import { $, h, toast, modal, copyText, won, sign } from './util.js';
import { BoardView, nodeInfo } from './board-view.js';
import { JOBS, JOB_TYPE_NAMES, STATS, STAT_KEYS, STAT_MAX, STAGES, CARDS, STATUSES, ASSETS, SPACE_TYPES, JOB_CHANGE_COST } from '/game/content.js';
import { progressInfo, netWorth, debtLimit, jobEligibility, xpThreshold, nextPlayerId } from '/game/engine.js';
import { AVG_MOVE, SPEEDS } from '/game/settings.js';
import { sfx, audioPrefs, setAudio } from './audio.js';

const STEP_MS = { slow: 320, normal: 190, fast: 90, instant: 0 };
const CARD_MS = { slow: 9000, normal: 6500, fast: 4000, instant: 2500 };
const PER_TURN = { slow: 35, normal: 25, fast: 18, instant: 14 };
const REL = { single: '싱글', met: '알아가는 중', dating: '연애 중', married: '결혼' };

export class GameScreen {
  constructor(root, deps) {
    this.root = root; this.d = deps;
    this.boardId = null; this.lastFeed = null; this.feedQueue = []; this.showingFeed = false;
    this.turnMarks = []; this.lastTurnKey = null; this.logFilter = 'all';
    this.speedLocal = (() => { try { return localStorage.getItem('glg.speed'); } catch { return null; } })();
    this.build();
    this.timer = setInterval(() => this.tickTimer(), 500);
  }
  destroy() { clearInterval(this.timer); document.querySelectorAll('.modal-back').forEach(m => m.remove()); }
  get me() { return this.d.S.memberId; }
  get speed() { return this.speedLocal || this.room?.settings.speed || 'normal'; }

  build() {
    this.top = h('header.gbar');
    this.boardBox = h('div.board-box');
    this.feedBox = h('div.feed-stack');
    this.actionBox = h('section.action');
    this.playersBox = h('section.players');
    this.logBox = h('section.log');
    this.board = new BoardView(this.boardBox, (n) => modal(nodeInfo(this.g.board, n, this.g.players)));
    this.main = h('div.game',
      this.top,
      h('div.game-body',
        h('div.board-wrap', this.boardBox, this.feedBox),
        h('aside.side', this.actionBox, this.playersBox)),
      this.logBox);
    this.root.replaceChildren(this.main);
  }

  async update(room) {
    this.room = room;
    this.serverOffset = room.now - Date.now();
    if (room.boardId !== this.boardId) {
      const { board } = await this.d.api(`/api/rooms/${room.id}/board`);
      this.boardId = room.boardId; this.boardData = board;
      this.board.setBoard(board);
      this.lastFeed = null;
    }
    if (this.room !== room) return; // 더 최신 상태가 이미 도착
    const g = { ...room.game, board: this.boardData };
    this.g = g;
    document.title = `${g.phase === 'over' ? '결과' : `${g.round}라운드`} — 갈림길 인생`;
    const curId = g.pending?.pid || g.order[g.turnIdx];
    // 턴 소요 시간 측정 (남은 시간 보정용)
    const key = `${g.order[g.turnIdx]}:${g.round}`;
    if (key !== this.lastTurnKey) {
      this.turnMarks.push(Date.now()); if (this.turnMarks.length > 25) this.turnMarks.shift();
      if (this.lastTurnKey && g.order[g.turnIdx] === this.me && g.phase === 'play') { sfx('turn'); if (document.hidden) document.title = '🔔 내 차례! — 갈림길 인생'; }
      this.lastTurnKey = key;
    }
    this.renderTop();
    this.renderPlayers();
    this.renderAction();
    this.renderLog();
    // 말 이동 연출 후 결과 카드
    const firstLoad = this.lastFeed === null;
    const newFeeds = firstLoad ? [] : g.feed.filter(f => f.seq > this.lastFeed);
    this.lastFeed = g.feed.length ? g.feed[g.feed.length - 1].seq : 0;
    const roll = g.lastRoll && g.lastRoll.seq !== this.lastRollSeq ? g.lastRoll : null;
    if (roll && !firstLoad) { this.lastRollSeq = roll.seq; this.showDice(roll); }
    else if (roll) this.lastRollSeq = roll.seq;
    this.animChain = (this.animChain || Promise.resolve()).then(() => this.board.animateTo(g.players, curId, firstLoad ? 0 : STEP_MS[this.speed], () => sfx('step')));
    await this.animChain;
    if (firstLoad) this.board.scrollTo(P(g, curId)?.pos);
    for (const f of newFeeds) this.pushFeed(f);
    if (g.phase === 'over' && !this.resultsShown) { this.resultsShown = true; this.showResults(); }
    if (this.highlightTurn !== key && g.phase === 'play') { this.highlightTurn = key; this.board.scrollTo(P(g, g.order[g.turnIdx])?.pos); }
  }

  // ---------- 상단 ----------
  renderTop() {
    const g = this.g;
    const prog = progressInfo(g);
    const avgPct = Math.round(prog.reduce((a, x) => a + x.pct, 0) / prog.length);
    const cur = P(g, g.order[g.turnIdx]);
    const nextId = nextPlayerId(g);
    const nxt = nextId && nextId !== cur?.id ? P(g, nextId) : null;
    const remainTurns = prog.reduce((a, x) => a + (x.left > 0 ? x.left / AVG_MOVE : 0), 0);
    const per = this.observedPerTurn() ?? PER_TURN[this.speed];
    const remMin = Math.round(remainTurns * per / 60);
    const stage = cur ? STAGES[g.board.nodes[cur.pos].stage] : '';
    put(this.top, 
      h('b.logo', '갈림길 인생'),
      g.phase === 'over' ? h('span.pill', '게임 종료') : h('span.pill', `${g.round}라운드 · ${stage}`),
      g.phase === 'play' && cur ? h('span.turn', h('span.mk', { style: { background: cur.color } }, cur.mark), ` ${cur.name}${cur.id === this.me ? ' (나)' : ''} 차례`, nxt ? h('span.small', ` · 다음: ${nxt.name}`) : null) : null,
      g.phase === 'prep' ? h('span.turn', '준비 단계 · 모두 동시에 선택') : null,
      h('span.progress', { title: '모든 플레이어의 평균 진행률' }, h('span.bar', h('i', { style: { width: avgPct + '%' } })), ` ${avgPct}%`),
      g.phase !== 'over' ? h('span.small', `남은 예상 약 ${Math.max(1, Math.round(remMin * 0.8))}~${Math.max(2, Math.round(remMin * 1.3))}분${this.observedPerTurn() ? ' (실측 보정)' : ''}`) : null,
      this.timerEl = h('span.timer'),
      h('span.spacer'),
      h('select.speed', { title: '내 화면의 연출 속도 (결과에는 영향 없음)', onchange: (e) => { this.speedLocal = e.target.value; try { localStorage.setItem('glg.speed', e.target.value); } catch { /* 무시 */ } } },
        ...Object.entries(SPEEDS).map(([k, v]) => h('option', { value: k, selected: this.speed === k }, '연출: ' + v))),
      h('button.small', { onclick: () => this.menu() }, '메뉴'),
    );
    this.tickTimer();
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

  // ---------- 플레이어 목록 ----------
  renderPlayers() {
    const g = this.g;
    const prog = Object.fromEntries(progressInfo(g).map(x => [x.pid, x]));
    const curId = g.order[g.turnIdx];
    const nextId = nextPlayerId(g);
    const waiting = new Set(awaitingIds(g));
    const members = Object.fromEntries(this.room.members.map(m => [m.id, m]));
    const ordered = g.order.map(id => P(g, id));
    put(this.playersBox, h('h3', `플레이어 ${g.players.length}명`, h('span.small', ' (눌러서 상세 보기)')),
      h('div.plist' + (g.players.length > 6 ? '.dense' : ''), ...ordered.map(p => {
        const mem = members[p.id];
        const job = p.job ? `${JOBS[p.job.id].name} ${JOBS[p.job.id].ranks[p.job.rank]}` : (g.board.nodes[p.pos].stage === 'growth' ? '학생' : '무직');
        return h('button.pcard' + (p.id === curId && g.phase === 'play' ? '.cur' : '') + (p.id === this.me ? '.me' : '') + (p.finished ? '.done' : ''),
          { style: { borderColor: p.color }, onclick: () => this.playerDetail(p) },
          h('div.prow', h('span.mk', { style: { background: p.color } }, p.mark), h('b.pname', p.name), h('span.dot' + (mem?.online ? '.on' : ''), { title: mem?.online ? '접속 중' : '연결 끊김' }),
            p.id === curId && g.phase === 'play' ? h('span.badge', '차례') : p.id === nextId && g.phase === 'play' ? h('span.badge.next', '다음') : null,
            waiting.has(p.id) && g.pending.kind === 'simul' ? h('span.badge.wait', '선택 중') : null,
            g.pending.kind === 'simul' && !waiting.has(p.id) && g.phase !== 'over' ? h('span.badge.okb', '✓') : null,
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
      h('h2', h('span.mk', { style: { background: p.color } }, p.mark), ' ', p.name, p.finished ? ` · 은퇴 ${p.finishOrder}위` : ''),
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

  // ---------- 행동 패널 ----------
  renderAction() {
    const g = this.g, pd = g.pending;
    const box = this.actionBox;
    put(box);
    if (!pd || g.phase === 'over') { add(box, h('h3', '게임 종료'), h('button.primary', { onclick: () => this.showResults() }, '결과 보기')); return; }
    const mine = pd.kind === 'simul' ? pd.who.includes(this.me) && !(this.me in pd.responses) : pd.pid === this.me;
    const actor = pd.pid ? P(g, pd.pid) : null;
    const go = (action) => this.d.send('game', { action, pendingId: pd.id });
    const defaultNote = (opts) => {
      if (!this.room.settings.timeLimit) return null;
      const d = opts.find(o => o.default && !o.disabled) || opts.find(o => !o.disabled);
      return h('p.small.note', `시간 초과 시 기본 행동: ${d ? d.label : '첫 번째'}`);
    };
    const offlineWaiters = awaitingIds(g).filter(pid => { const m = this.room.members.find(x => x.id === pid); return m && !m.online && (Date.now() + this.serverOffset - m.lastSeen) > 60000; });
    const autoBtn = offlineWaiters.length ? h('button.warnbtn', { onclick: () => this.d.send('autoResolve') }, `연결 끊긴 ${offlineWaiters.map(id => P(g, id).name).join(', ')} 자동 진행`) : null;

    if (pd.kind === 'simul') {
      const opts = pd.perPlayer?.[this.me] || pd.options;
      const done = pd.who.filter(id => id in pd.responses).length;
      add(box, h('h3', pd.title), h('p', pd.text), h('p.small', `응답 ${done}/${pd.who.length}명 · 결과는 모두 고른 뒤 차례 순서대로 적용됩니다.`));
      if (mine) add(box, h('div.opts', ...opts.map((o, i) => optionButton(o, () => go({ type: 'simul', index: i })))), defaultNote(opts));
      else if (pd.who.includes(this.me)) add(box, h('p.ok', '선택 완료! 다른 사람을 기다리는 중…'));
      add(box, autoBtn || '');
      return;
    }
    if (!mine) {
      add(box, h('h3', `${actor.name} 님 차례`), h('p.small', waitText(pd)));
      if (pd.kind === 'choice' || pd.kind === 'branch') add(box, h('div.preview', h('b', pd.title || '갈림길'), pd.text ? h('p.small', pd.text) : null, h('div.opts.ro', ...pd.options.map(o => optionButton(o, null)))));
      add(box, autoBtn || '');
      return;
    }
    const me = P(g, this.me);
    if (pd.kind === 'turn') {
      add(box, h('h3.mine', '내 차례!'), h('button.primary.big.dice', { onclick: () => { sfx('dice'); go({ type: 'roll' }); } }, '🎲 주사위 굴리기'));
      const cards = pd.cards || [];
      if (cards.length) {
        add(box, h('h4', '카드 (주사위 전에 사용, 차례를 쓰지 않음)'));
        add(box, h('div.cards', ...cards.map((c, i) => cardControl(c, i, me, g, (extra) => go({ type: 'useCard', index: i, ...extra })))));
      }
      if (pd.canRepay) {
        const inp = h('input', { type: 'number', min: 1, max: Math.min(me.cash, me.debt), value: Math.min(me.cash, me.debt), style: { width: '90px' } });
        add(box, h('div.row', h('span.small', `부채 ${me.debt} 상환: `), inp, h('button.small', { onclick: () => go({ type: 'repay', amount: Number(inp.value) }) }, '갚기')));
      }
      add(box, defaultNote([{ label: '주사위 굴리기' }]) || '');
      return;
    }
    if (pd.kind === 'branch') {
      add(box, h('h3.mine', '갈림길! 길을 고르세요'), h('p.small', `남은 이동 ${pd.steps}칸`), h('div.opts', ...pd.options.map((o, i) => optionButton(o, () => go({ type: 'branch', index: i })))), defaultNote(pd.options) || '');
      this.board.highlight(pd.options.map(o => o.to));
      return;
    }
    this.board.highlight([]);
    if (pd.kind === 'choice') {
      add(box, h('h3.mine', pd.title), h('p', pd.text), pd.ctx?.lines?.length ? h('div.lines.small', ...pd.ctx.lines.map(l => h('div', l))) : '',
        h('div.opts', ...pd.options.map((o, i) => optionButton(o, () => go({ type: 'choose', index: i })))), defaultNote(pd.options) || '');
      return;
    }
    if (pd.kind === 'reroll') {
      add(box, h('h3.mine', '판정 실패…'), h('div.lines.small', ...pd.ctx.lines.map(l => h('div', l))), h('p', '"다시 한 번" 카드로 다시 굴릴까요?'),
        h('div.row', h('button.primary', { onclick: () => go({ type: 'reroll', use: true }) }, '카드 사용해서 다시 굴리기'), h('button', { onclick: () => go({ type: 'reroll', use: false }) }, '결과 받아들이기')));
    }
  }

  // ---------- 기록 ----------
  renderLog() {
    const g = this.g;
    const filters = { all: '전체', me: '내 기록', money: '돈 변화', joint: '공동 사건' };
    const list = g.log.slice().reverse().filter(e => this.logFilter === 'all' || (this.logFilter === 'me' && e.pid === this.me) || (this.logFilter === 'money' && e.changes.some(c => /현금|부채|자산/.test(c))) || (this.logFilter === 'joint' && e.kind === 'joint')).slice(0, 120);
    put(this.logBox, 
      h('div.log-head', h('b', '기록'), ...Object.entries(filters).map(([k, v]) => h('button.small' + (this.logFilter === k ? '.on' : ''), { onclick: () => { this.logFilter = k; this.renderLog(); } }, v))),
      h('div.log-list', ...list.map(e => {
        const p = e.pid ? P(g, e.pid) : null;
        return h('div.log-item', p ? h('span.mk.sm', { style: { background: p.color } }, p.mark) : h('span.mk.sm.sys', 'ⓘ'), h('span.small.r', `R${e.round}`), ' ', h('b', e.text),
          e.changes.length ? h('div.small.changes', e.changes.join(' · ')) : null);
      })));
  }

  // ---------- 연출 ----------
  showDice(roll) {
    const p = P(this.g, roll.pid);
    const el = h('div.dice-pop', h('div.die', String(roll.v)), h('div.small', `${p?.name}: ${roll.text}`));
    this.boardBox.parentElement.append(el);
    sfx('dice');
    setTimeout(() => el.remove(), Math.max(900, CARD_MS[this.speed] / 3));
  }
  pushFeed(f) {
    const g = this.g;
    const mineOrBig = f.pid === this.me || ['joint', 'finish', 'over', 'system'].includes(f.kind);
    const good = f.lines.some(l => /성공|승진|결혼|탄생|\+\d/.test(l)), bad = f.lines.some(l => /실패|실직|강등|강제 매각|신용 경고|대출/.test(l));
    if (f.pid === this.me) sfx(bad && !good ? 'bad' : good ? 'good' : 'coin');
    if (f.kind === 'over') sfx('fanfare');
    if (this.room.settings.skipRepeat && !mineOrBig) { toast(`${f.title}`, 'info', 2200); return; }
    const p = f.pid ? P(g, f.pid) : null;
    const card = h('div.feed' + (f.pid === this.me ? '.mine' : '') + `.k-${f.kind}`, { style: p ? { borderColor: p.color } : {}, onclick: () => card.remove() },
      h('b', f.title), f.text ? h('p.small', f.text) : null, h('div.lines', ...f.lines.map(l => h('div', l))));
    this.feedBox.prepend(card);
    while (this.feedBox.children.length > 3) this.feedBox.lastChild.remove();
    setTimeout(() => card.classList.add('out'), CARD_MS[this.speed] * (mineOrBig ? 1.4 : 1));
    setTimeout(() => card.remove(), CARD_MS[this.speed] * (mineOrBig ? 1.4 : 1) + 500);
  }

  showResults() {
    const g = this.g, r = g.results;
    if (!r) return;
    const isHost = this.room.hostId === this.me;
    const body = h('div.results',
      h('h2', '🏁 최종 정산'),
      h('p.small', '총점 = 현금 + 자산 평가액(골동품은 감정) − 부채 + 공개 보너스(은퇴 순위·가족·추억·직급·업적). 동점이면 현금 → 먼저 은퇴한 순.'),
      ...r.map((x, i) => h('details.res' + (i === 0 ? '.win' : ''), { open: i < 3 || undefined, style: { borderColor: x.color, animationDelay: (r.length - i) * 0.25 + 's' } },
        h('summary', h('span.rank', `${x.rank}위`), h('span.mk', { style: { background: x.color } }, x.mark), h('b', ` ${x.name}`), h('span.total', won(x.total)), h('div.small', x.summary)),
        h('table', ...x.rows.map(([k, v]) => h('tr', h('td', k), h('td.num' + (v < 0 ? '.neg' : ''), sign(v))))),
        h('div.small', h('b', '인생 기록: '), x.record.join(' → ')),
      )),
      h('div.row',
        isHost ? h('button.primary', { onclick: () => this.d.send('rematch') }, '같은 멤버로 다시 하기') : h('p.small', '방장이 "다시 하기"를 누르면 같은 방 대기실로 돌아갑니다.'),
        h('button', { onclick: () => copyText(r.map(x => `${x.rank}위 ${x.name} ${x.total} — ${x.summary}`).join('\n')) }, '결과 복사')),
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
function waitText(pd) {
  return { turn: '주사위를 굴리거나 카드를 쓰는 중', branch: '갈림길에서 길을 고르는 중', choice: '사건에서 선택하는 중', reroll: '다시 굴릴지 고민 중' }[pd.kind] || '';
}
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
<h3>한 턴의 순서</h3>
<ol><li>(선택) 카드 사용·부채 상환 — 차례를 소비하지 않음</li><li>주사위(1~6) 굴리기 → 보정 적용 순서: 정조준(값 고정) → 질주 +2 → 의욕 +1 → 번아웃 −1 → 자동차 최소 2 → 최소 1</li>
<li>한 칸씩 이동. 갈림길이면 길을 고름. <b>정지</b> 칸(관문·은퇴)을 만나면 남은 이동은 사라짐. 지나가는 월급날·용돈 칸은 그대로 받음</li>
<li>멈춘 칸의 사건 → 선택 → 판정(주사위+능력 ≥ 목표, 성공 확률 % 표시) → 결과·상태 변화</li><li>상태 턴 수 감소 → 다음 플레이어</li></ol>
<h3>단계</h3><p>성장기 → 진로의 문(능력 보완) → 캠퍼스 길(학위·학자금) / 사회 길(아르바이트·현금) → 첫 직장 → 성인 전반 → 인생 중간 점검 → 성인 후반 → 은퇴</p>
<h3>직업</h3><ul><li><b>조건형</b>: 능력 합이 기준 이상이면 월급날 자동 승진</li><li><b>도전형</b>: 직업 칸·월급날 도착 때 승진 판정, 연속 2회 실패 시 강등</li><li><b>축적형</b>: 성과(월급날 +1, 사건)로 승진</li>
<li>전직: 교육비 ${JOB_CHANGE_COST}, 능력·카드·자산 유지, 직급 초기화, 성과 절반 이월. 실직하면 실업 급여(3회)와 재취업 사건, 아르바이트로 회복</li></ul>
<h3>관계와 가족</h3><p>만남 → 호감도 2 이상 연애 → 호감도 3 이상 프러포즈(사교+호감도 판정) → 결혼(배우자 수입 +10, 정산 +100). 자녀는 양육비 6, 정산 +60.</p>
<h3>돈</h3><ul><li>지출이 현금보다 크면 자동 대출. 부채 한도 = 200 + 직업 있으면 60×(직급+1) + 자산 평가액의 절반</li><li>한도 초과 시 가장 싼 자산부터 70%에 강제 매각 → 그래도 넘으면 신용 경고(구매 불가). 한도 아래로 내려오면 해제, "오뚝이" 업적</li><li>월급날 이자: 부채의 5%(올림)</li><li>"모두에게" 효과 총액 = 기준액 × min(상대 수, 3) → 12명이어도 과도하지 않음</li></ul>
<h3>카드 (최대 5장, 넘치면 가장 오래된 카드 버림)</h3><p>같은 카드는 한 차례에 한 번. 다시 한 번은 판정 실패 직후, 생활 보험은 지출 사건에서 자동.</p>
<h3>상태</h3><p>같은 상태는 겹치지 않고 남은 턴을 더 큰 값으로 갱신. 얻은 차례에는 줄지 않고 다음 차례부터 감소.</p>
<h3>은퇴와 정산</h3><p>은퇴 칸에 도착한 순서대로 150 / 100 / 60 보너스. 은퇴한 사람은 차례를 건너뛰지만 공동 사건과 다른 사람의 효과는 계속 받음. 모두 은퇴하면 정산: 현금 + 자산(골동품 감정 0.2~4배) − 부채 + 배우자 100 + 자녀 60 + 반려동물 20 + 추억×15 + 직급×40 + 업적. 동점은 현금 → 먼저 은퇴한 순.</p>
<h3>뒤처진 플레이어</h3><p>3명 이상일 때 순자산 꼴찌이고 1위와 200 이상 차이 나면 4턴마다 차례 시작 시 카드 1장.</p>`;
