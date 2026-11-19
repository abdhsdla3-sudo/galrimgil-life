// 「항구의 길」 게임 화면. 서버가 보낸 상태를 그리고, 내 차례의 선택만 서버로 보낸다.
import { h, modal, copyText } from './util.js';
import { PORT_IDS, REGIONS, REGION_PORTS, ECONOMY, SHIPS, DEFAULT_ACTION_TEXT, BOARD_SIZE, boardSizeOf, levelLimit, tilesOf, regionNameOf } from '/game/harbor/data.js';
import { portsOf, buybackOf, tollOf, worthOf, liquidValue, ownedRegions } from '/game/harbor/engine.js';
import { artSlot, loadManifest } from './games.js';
import { sfx } from './audio.js';

const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const TYPE_LABEL = { start: '출항지', port: '항구', market: '화물 시장', event: '해상 이벤트', shelter: '폭풍 피난소', charter: '쾌속선', tax: '항로 관리비', fund: '선원 조합' };
const TYPE_ICON = { start: '⚓', market: '📦', event: '🌊', shelter: '⛈', charter: '⛴', tax: '🧾', fund: '💰' };
const LEVEL_NAME = ['부두', '창고', '대형 항만', '해상 기지'];
const money = n => n.toLocaleString('ko-KR');

// 칸 번호 → 격자 위치 (왼쪽 위에서 시계 방향)
export function tileCell(i, size = BOARD_SIZE) {
  const edge = size / 4;
  const side = edge + 1;
  if (i <= edge) return [1, i + 1];
  if (i <= edge * 2) return [i - edge + 1, side];
  if (i <= edge * 3) return [side, side - (i - edge * 2)];
  return [side - (i - edge * 3), 1];
}

// 선박 말: 색 + 서로 다른 실루엣 (이미지가 있으면 이미지 사용)
const SHIP_PATHS = [
  // 돛단배: 큰 삼각 돛
  '<path d="M30 6 L30 40 L12 40Z" /><path d="M34 12 L34 40 L50 40Z" opacity=".75"/><path d="M6 44 H58 L50 56 H14Z"/>',
  // 증기선: 굴뚝 두 개
  '<rect x="18" y="18" width="8" height="16" rx="2"/><rect x="32" y="12" width="8" height="22" rx="2"/><rect x="12" y="32" width="40" height="8" rx="2"/><path d="M4 42 H60 L52 56 H12Z"/>',
  // 정크선: 살대 돛 세 장
  '<path d="M14 10 H30 V38 H10Z"/><path d="M34 6 H52 L56 38 H34Z" opacity=".8"/><path d="M4 42 Q32 38 60 42 L54 56 H10Z"/>',
  // 예인선: 높은 조타실과 범퍼
  '<rect x="24" y="14" width="18" height="14" rx="3"/><rect x="14" y="28" width="38" height="10" rx="3"/><path d="M4 40 H60 V46 Q60 56 48 56 H16 Q4 56 4 46Z"/><circle cx="10" cy="48" r="4" fill="#13294b"/>',
];
export function shipIcon(idx, color, { size = 28, title } = {}) {
  const box = h('span.ship', { style: { '--ship': color, width: size + 'px', height: size + 'px' }, role: title ? 'img' : undefined, 'aria-label': title, 'aria-hidden': title ? undefined : 'true' });
  box.innerHTML = `<svg viewBox="0 0 64 64" fill="${color}" stroke="#0b1730" stroke-width="2.5" stroke-linejoin="round">${SHIP_PATHS[idx % 4]}</svg>`;
  const src = `/assets/harbor/ship-${(idx % 4) + 1}.png`;
  loadManifest().then(set => {
    if (!set.has(src)) return;
    const img = h('img', { src, alt: '' });
    img.addEventListener('load', () => { box.replaceChildren(img); box.classList.add('has-img'); });
  });
  return box;
}

export class HarborScreen {
  constructor(root, deps) {
    this.root = root; this.d = deps;
    this.disp = {}; this.lastRollSeq = null; this.lastPending = null; this.prevCash = null; this.selected = null;
    this.build();
    this.timer = setInterval(() => this.renderTimer(), 500);
  }
  destroy() {
    this.destroyed = true;
    clearInterval(this.timer); clearTimeout(this.stepTimer);
    document.querySelectorAll('.modal-back').forEach(m => m.remove());
  }
  get me() { return this.d.S.memberId; }
  P(id) { return this.g.players.find(p => p.id === id); }

  build() {
    this.top = h('header.hbar');
    this.hero = artSlot('/assets/harbor/hero-port.png', 'port', { cls: 'hero-art' });
    this.center = h('div.hcenter');
    this.board = h('div.hboard', { role: 'group' }, this.center);
    this.players = h('section.hplayers', { 'aria-label': '참가자와 잔액' });
    this.detail = h('section.hdetail', { 'aria-live': 'polite' });
    this.action = h('section.haction', { 'aria-live': 'polite' });
    this.logBox = h('details.hlog', h('summary', '최근 거래'), this.logList = h('ol.hlog-list'));
    this.rules = h('details.hrules', h('summary', '규칙 보기'));
    this.root.replaceChildren(h('div.harbor',
      this.top,
      h('div.hbody',
        h('div.hmain', this.board),
        this.players,
        this.detail,
        h('div.hextra', this.logBox, this.rules),
        this.action)));
  }

  update(room) {
    const prev = this.g;
    this.room = room;
    this.g = room.game;
    this.serverOffset = room.now - Date.now();
    const g = this.g;
    if (!prev) {
      this.size = boardSizeOf(g);
      this.tileData = tilesOf(g);
      this.tiles = this.tileData.map(t => {
        const [r, c] = tileCell(t.i, this.size);
        return h('button.htile.t-' + t.type, { type: 'button', style: { gridRow: r, gridColumn: c }, onclick: () => this.tileModal(t.i) });
      });
      this.board.style.setProperty('--side', this.size / 4 + 1);
      this.board.setAttribute('aria-label', `항로 ${this.size}칸`);
      this.board.prepend(...this.tiles);
      this.rules.append(rulesBody(this.size));
    }
    const pd = g.pending;
    // 주사위가 새로 굴려졌으면 연출 후 이동
    const roll = g.lastRoll && g.lastRoll.seq !== this.lastRollSeq ? g.lastRoll : null;
    const firstLoad = !prev;
    if (roll) { this.lastRollSeq = roll.seq; if (!firstLoad) this.showDice(roll); }
    if (firstLoad) for (const p of g.players) this.disp[p.id] = p.pos;
    // 내 차례 알림
    const myTurnNow = pd?.pid === this.me && pd.kind === 'roll';
    if (!firstLoad && myTurnNow && this.lastPending?.pid !== this.me) { sfx('turn'); if (document.hidden) document.title = '🔔 내 차례! — 항구의 길'; }
    if (pd?.id !== this.lastPending?.id) this.busy = false;
    this.lastPending = pd;
    // 금액 변화 표시
    const before = this.prevCash;
    this.prevCash = Object.fromEntries(g.players.map(p => [p.id, p.cash]));
    this.deltas = before ? Object.fromEntries(g.players.map(p => [p.id, p.cash - (before[p.id] ?? p.cash)])) : {};
    if (!document.hidden) document.title = `${g.phase === 'over' ? '결과' : `${g.round}라운드`} — 항구의 길`;
    this.renderTop();
    this.renderPlayers();
    this.renderTiles();
    this.renderCenter();
    this.renderDetail();
    if (pd?.pid === this.me && pd.id === prev?.pending?.id) this.renderTimer();
    else this.renderAction();
    this.renderLog();
    this.animateMoves(firstLoad);
    if (g.phase === 'over' && !this.resultsShown) { this.resultsShown = true; if (!firstLoad) sfx('fanfare'); }
  }

  // ---------- 상단 ----------
  renderTop() {
    const g = this.g, r = this.room;
    put(this.top,
      h('div.hbrand', h('b', '항구의 길'), r.code ? h('span.hcode', '방 ', h('span.mono', r.code)) : null),
      h('div.hround', g.phase === 'over' ? '항해 종료' : `${g.round} / ${g.settings.rounds} 라운드`),
      h('div.hmenu',
        h('button.small', { onclick: () => this.routeModal() }, '항로 목록'),
        h('button.small', { onclick: () => this.recoveryModal() }, '복구 코드'),
        h('button.small', { onclick: () => this.d.leaveToHome() }, '게임 선택으로')));
  }
  recoveryModal() {
    const code = this.d.recoveryCode();
    modal(h('div', h('h3', '내 복구 코드'), h('p.small', '다른 기기에서 첫 화면 "다른 기기에서 이어하기"에 넣으면 같은 자리로 돌아옵니다. 다른 사람에게 보여 주지 마세요.'), h('code.code', code), h('button', { onclick: () => copyText(code) }, '복사')));
  }

  // ---------- 참가자 ----------
  renderPlayers() {
    const g = this.g, cur = g.pending?.pid;
    const order = g.order.map(id => this.P(id));
    put(this.players,
      h('div.hasset-head', h('h2', '자산 현황'), h('button.small', { onclick: () => this.assetsModal(this.me) }, '내 자산 상세')),
      h('ol.hplist', ...order.map(p => {
      const m = this.room.members.find(x => x.id === p.id);
      const d = this.deltas[p.id];
      const ports = portsOf(g, p.id).length;
      return h('li.hp' + (p.id === cur ? '.turn' : '') + (p.bankrupt ? '.out' : '') + (p.id === this.me ? '.mine' : ''), { style: { '--pc': p.color } },
        shipIcon(p.ship, p.color, { size: 30, title: SHIPS[p.ship].name }),
        h('div.hp-main',
          h('div.hp-name', h('b', p.name), p.id === this.me ? h('span.tag', '나') : null, m && !m.online ? h('span.tag.off', '연결 끊김') : null, p.id === cur ? h('span.tag.now', '차례') : null),
          h('div.hp-sub', p.bankrupt ? '파산' : `항구 ${ports}곳 · 순자산 ${money(worthOf(g, p))}`)),
        h('button.hp-cash', { onclick: () => this.assetsModal(p.id), 'aria-label': `${p.name} 자산 상세` },
          h('span.cash-label', '현금'), money(p.cash), d ? h('span.delta' + (d > 0 ? '.up' : '.down'), (d > 0 ? '+' : '') + d) : null));
    })));
  }

  assetsModal(pid) {
    const g = this.g, p = this.P(pid);
    if (!p) return;
    const ports = portsOf(g, pid);
    const regions = ownedRegions(g, pid);
    modal(h('div.hassets', h('h3', shipIcon(p.ship, p.color, { size: 34 }), ` ${p.name} 자산`),
      h('dl.asset-totals', ...[['현금', p.cash], ['항구 환매가', liquidValue(g, pid)], ['순자산', worthOf(g, p)]].map(([k, v]) =>
        h('div', h('dt', k), h('dd', money(v))))),
      h('p', regions.length ? `확보한 권역 · ${regions.map(r => REGIONS[r].name).join(', ')} (${regions.length}/3)` : '확보한 권역 없음'),
      h('p', p.cargo ? `운송 중 · ${p.cargo.cargoName} → ${p.cargo.destName} (+${p.cargo.reward})` : '운송 중인 화물 없음'),
      h('h4', `보유 항구 ${ports.length}곳`),
      ports.length ? h('ul.asset-ports', ...ports.map(i => h('li', h('b', this.tileData[i].name),
        h('span', LEVEL_NAME[g.owners[i].level]),
        h('span', `이용료 ${money(tollOf(g, i))} · 환매 ${money(buybackOf(g, i))}`))))
        : h('p', '보유한 항구가 없습니다.')));
  }

  routeModal() {
    const dialog = modal(h('div.hassets', h('h3', this.g.boardSize ? '세계 항로' : '항로'),
      h('ol.route-list', ...this.tileData.map(t => h('li',
        h('button', { onclick: () => {
          dialog.close();
          this.tileModal(t.i);
        } }, h('span', t.name), h('small', t.country || TYPE_LABEL[t.type])))))));
  }

  // ---------- 보드 ----------
  renderTiles() {
    const g = this.g, me = this.P(this.me);
    const cur = g.pending ? this.P(g.pending.pid) : null;
    for (const t of this.tileData) {
      const el = this.tiles[t.i];
      const o = g.owners[t.i];
      const owner = o ? this.P(o.pid) : null;
      const isDest = me?.cargo?.dest === t.i;
      const pawns = g.players.filter(p => !p.bankrupt && this.disp[p.id] === t.i);
      el.classList.toggle('dest', isDest);
      el.classList.toggle('here', !!cur && this.disp[cur.id] === t.i);
      el.classList.toggle('owned', !!owner);
      el.classList.toggle('occupied', pawns.length > 0);
      el.style.setProperty('--band', t.type === 'port' ? REGIONS[t.region].color : '');
      el.style.setProperty('--owner', owner?.color || 'transparent');
      el.setAttribute('aria-label', this.tileLabel(t.i));
      put(el,
        h('span.ht-band'),
        h('span.ht-name', TYPE_ICON[t.type] ? h('span.ht-icon', TYPE_ICON[t.type]) : null, t.short),
        t.type === 'port'
          ? (owner ? h('span.ht-own', h('span.ht-toll', String(tollOf(g, t.i)))) : h('span.ht-price', String(t.price)))
          : null,
        isDest ? h('span.ht-dest', { title: '내 배송 목적지' }, '📦') : null,
        h('span.ht-pawns', ...pawns.map(p => shipIcon(p.ship, p.color, { size: 22 }))));
    }
  }
  tileLabel(i) {
    const g = this.g, t = this.tileData[i], o = g.owners[i];
    const here = g.players.filter(p => !p.bankrupt && this.disp[p.id] === i).map(p => p.name);
    let s = `${i}번 칸 ${t.name}, ${TYPE_LABEL[t.type]}`;
    if (t.country) s += `, ${t.country}`;
    if (t.type === 'port') s += o ? `, 소유 ${this.P(o.pid).name}, ${LEVEL_NAME[o.level]}, 이용료 ${tollOf(g, i)}` : `, 빈 항구, 매입가 ${t.price}`;
    if (this.P(this.me)?.cargo?.dest === i) s += ', 내 배송 목적지';
    if (here.length) s += `, 정박: ${here.join(', ')}`;
    return s;
  }
  animateMoves(firstLoad) {
    clearTimeout(this.stepTimer);
    const g = this.g;
    const step = () => {
      if (this.destroyed) return;
      let moving = false;
      for (const p of g.players) {
        const d = this.disp[p.id];
        if (d === undefined || d === p.pos) { this.disp[p.id] = p.pos; continue; }
        const dist = (p.pos - d + this.size) % this.size;
        if (dist > 12 || reduceMotion() || document.hidden) { this.disp[p.id] = p.pos; continue; }
        this.disp[p.id] = (d + 1) % this.size;
        moving = true;
      }
      this.renderTiles();
      if (moving) this.stepTimer = setTimeout(step, 150); else { this.renderCenter(); this.renderDetail(); }
    };
    if (firstLoad) { for (const p of g.players) this.disp[p.id] = p.pos; return; }
    this.stepTimer = setTimeout(step, this.diceShowing ? 450 : 0);
  }
  showDice(roll) {
    if (reduceMotion() || document.hidden) return;
    this.diceShowing = true;
    sfx('dice');
    setTimeout(() => { this.diceShowing = false; }, 450);
  }

  // ---------- 가운데 안내 ----------
  renderCenter() {
    const g = this.g;
    if (g.phase === 'over') return put(this.center, this.resultsView());
    const pd = g.pending, cur = this.P(pd.pid);
    const roll = g.lastRoll;
    const lines = g.log.filter(l => l.kind !== 'roll' && l.kind !== 'round').slice(-2);
    put(this.center,
      this.hero,
      h('div.hc-turn', { style: { '--pc': cur.color } }, shipIcon(cur.ship, cur.color, { size: 34 }), h('b', pd.pid === this.me ? '내 차례' : `${cur.name}의 차례`)),
      roll ? h('div.hc-dice' + (this.diceShowing ? '.rolling' : ''), { 'aria-label': `최근 주사위 ${(roll.dice || [roll.value]).join(' + ')}, 합계 ${roll.value}` },
        ...(roll.dice || [roll.value]).map(face => h('span.die', String(face))),
        roll.dice?.length === 2 ? h('b', `합계 ${roll.value}${roll.dice[0] === roll.dice[1] ? ' · 더블' : ''}`) : null) : null,
      h('div.hc-lines', ...lines.map(l => h('p.hc-line.k-' + l.kind, l.text))));
  }

  // ---------- 현재 칸 상세 ----------
  renderDetail() {
    const g = this.g;
    if (g.phase === 'over') return put(this.detail);
    const pid = g.pending.pid;
    const p = this.P(pid);
    const i = this.disp[pid] ?? p.pos;
    const me = this.P(this.me);
    put(this.detail,
      h('h2', '현재 칸'),
      this.tileInfo(i, { compact: true }),
      me && !me.bankrupt ? h('p.small.mycargo', me.cargo ? `내 화물: ${me.cargo.cargoName} → ${me.cargo.destName} · 보상 ${me.cargo.reward} (지나가거나 도착하면 자동 배송)` : '내 화물: 없음 (화물 시장에서 계약)') : null);
  }
  tileInfo(i, { compact = false } = {}) {
    const g = this.g, t = this.tileData[i], o = g.owners[i];
    const owner = o ? this.P(o.pid) : null;
    const head = h('div.ti-head', { style: { '--band': t.type === 'port' ? REGIONS[t.region].color : '#38d6c4' } },
      h('b', t.name), h('span.small', t.type === 'port' ? [t.country, regionNameOf(g, t.region)].filter((s, n, arr) => s && arr.indexOf(s) === n).join(' · ') : TYPE_LABEL[t.type]));
    if (t.type !== 'port') {
      const desc = { start: `지나가거나 도착하면 보급금 ${ECONOMY.supply}을 받습니다 (이동 1번에 1회).`, market: '목적지와 보상이 다른 계약 두 개 중 하나를 고르거나 지나갑니다. 화물은 한 번에 한 건.', event: '순풍·풍어·수리비 같은 바다의 사건이 일어납니다.',
        shelter: `최대 2차례 대기. 더블이 나오거나 ${ECONOMY.shelterFee}를 내면 먼저 출항합니다.`,
        charter: `${ECONOMY.charterFee}를 내면 원하는 항구로 이동합니다.`,
        tax: `관리비 ${ECONOMY.harborTax}를 내면 선원 조합 기금에 쌓입니다.`,
        fund: `정박한 선장이 쌓인 기금을 받습니다. 현재 ${g.fund}.` }[t.type];
      return h('div.tileinfo', head, h('p', desc));
    }
    return h('div.tileinfo', head,
      h('p', owner ? h('span', '소유자 ', shipIcon(owner.ship, owner.color, { size: 18 }), ' ', h('b', owner.name), ` · ${LEVEL_NAME[o.level]} · 현재 이용료 ${money(tollOf(g, i))}`) : `빈 항구 · 매입가 ${t.price}`),
      h('table.ti-table',
        h('tr', h('th', '단계'), ...LEVEL_NAME.slice(0, levelLimit(g) + 1).map((name, lv) => h('th' + (o?.level === lv ? '.cur' : ''), name))),
        h('tr', h('td', '기본료'), ...t.toll.slice(0, levelLimit(g) + 1).map((v, lv) => h('td' + (o?.level === lv ? '.cur' : ''), String(v)))),
        compact ? null : h('tr', h('td', '환매가'), ...t.buyback.slice(0, levelLimit(g) + 1).map((v, lv) => h('td' + (o?.level === lv ? '.cur' : ''), String(v))))),
      compact ? null : h('p.small', `매입가 ${t.price} · 확장비 단계당 ${t.upgrade} · 내 항구에 다시 도착하면 확장할 수 있어요.`));
  }
  tileModal(i) {
    const here = this.g.players.filter(p => !p.bankrupt && p.pos === i);
    modal(h('div', this.tileInfo(i), here.length ? h('p.small', '정박 중: ', ...here.map(p => h('span.chip', shipIcon(p.ship, p.color, { size: 16 }), ' ', p.name))) : null));
  }

  // ---------- 행동 ----------
  renderAction() {
    const g = this.g;
    if (g.phase === 'over') return put(this.action, h('div.hact-row', ...this.resultButtons()));
    const pd = g.pending, me = this.P(this.me);
    const mine = pd.pid === this.me;
    this.timerEl = h('p.htimer');
    if (!mine) {
      const cur = this.P(pd.pid);
      const m = this.room.members.find(x => x.id === pd.pid);
      const offlineLong = m && !m.online && this.room.now - m.lastSeen > 60e3;
      put(this.action, h('div.hwait', shipIcon(cur.ship, cur.color, { size: 26 }), h('b', waitText(pd, cur, this.tileData))), this.timerEl,
        offlineLong ? h('button', { onclick: () => this.d.send('autoResolve') }, `${cur.name} 기본 행동으로 진행`) : null);
      return this.renderTimer();
    }
    const send = (action) => {
      if (this.busy) return;
      this.busy = true;
      this.action.querySelectorAll('button').forEach(b => { b.disabled = true; });
      this.d.send('game', { pendingId: pd.id, action }).then(r => { if (!r) { this.busy = false; this.renderAction(); } });
    };
    const t = pd.tile !== undefined ? this.tileData[pd.tile] : null;
    let body;
    if (pd.kind === 'roll') {
      body = [h('p.hprompt', '주사위를 굴려 항로를 나아가세요.'),
        h('button.hbtn.primary', { onclick: () => send({ type: 'roll' }) }, h('span.main', g.boardSize ? '🎲 주사위 두 개 굴리기' : '🎲 주사위 굴리기'), h('span.sub', `출항지까지 ${(this.size - me.pos) % this.size || this.size}칸 · 보급금 ${ECONOMY.supply}`))];
    } else if (pd.kind === 'shelter') {
      body = [h('p.hprompt', `폭풍 피난소 · 최대 ${me.sheltered}차례 대기`),
        h('button.hbtn.primary', { onclick: () => send({ type: 'roll' }) }, '주사위 굴려 출항 시도'),
        h('button.hbtn', { disabled: me.cash < ECONOMY.shelterFee, onclick: () => send({ type: 'release' }) }, `출항비 ${ECONOMY.shelterFee} 내기`)];
    } else if (pd.kind === 'charter') {
      const dest = h('select', { 'aria-label': '이동할 항구' }, ...PORT_IDS.map(i => h('option', { value: i },
        `${this.tileData[i].name}${g.owners[i]?.pid !== this.me && g.owners[i] ? ` · 이용료 ${tollOf(g, i)}` : ''}`)));
      body = [h('p.hprompt', '쾌속선으로 이동할 항구를 고르세요.'), dest,
        h('button.hbtn.primary', { onclick: () => send({ type: 'sail', tile: Number(dest.value) }) }, `쾌속선 이용 · ${ECONOMY.charterFee}`),
        h('button.hbtn', { onclick: () => send({ type: 'pass' }) }, '지나가기')];
    } else if (pd.kind === 'takeover') {
      body = [h('p.hprompt', `${t.name}의 이용료 정산을 마쳤어요. 현재 시설을 포함해 인수할 수 있습니다.`),
        h('button.hbtn.primary', { onclick: () => send({ type: 'takeover' }) }, `인수 · ${money(pd.cost)}`, h('span.sub', `인수 후 현금 ${money(me.cash - pd.cost)}`)),
        h('button.hbtn', { onclick: () => send({ type: 'pass' }) }, '인수 없이 출항')];
    } else if (pd.kind === 'buy') {
      const completesRegion = g.boardSize && REGION_PORTS[t.region].every(i => i === t.i || g.owners[i]?.pid === me.id);
      const fee = completesRegion ? t.toll[0] * ECONOMY.regionMultiplier : t.toll[0];
      body = [h('p.hprompt', `${iga(t.name)} 비어 있어요. 매입 후 이용료 ${fee}.${completesRegion ? ' 이 항구를 사면 권역이 완성됩니다.' : ''}`),
        h('button.hbtn.primary', { onclick: () => send({ type: 'buy' }) }, h('span.main', `${t.short} 부두 매입 · ${t.price}`), h('span.sub', `구매 후 잔액 ${me.cash - t.price}`)),
        h('button.hbtn', { onclick: () => send({ type: 'pass' }) }, h('span.main', '지나가기'), h('span.sub', `잔액 ${me.cash} 유지`))];
    } else if (pd.kind === 'upgrade') {
      const lv = pd.level;
      const multiplier = ownedRegions(g, me.id).includes(t.region) ? ECONOMY.regionMultiplier : 1;
      body = [h('p.hprompt', `내 항구 ${t.name}에 돌아왔어요. 확장하면 이용료가 ${t.toll[lv] * multiplier} → ${t.toll[lv + 1] * multiplier}로 오릅니다.`),
        h('button.hbtn.primary', { onclick: () => send({ type: 'upgrade' }) }, h('span.main', `${LEVEL_NAME[lv + 1]}로 확장 · ${t.upgrade}`), h('span.sub', `확장 후 잔액 ${me.cash - t.upgrade}`)),
        h('button.hbtn', { onclick: () => send({ type: 'pass' }) }, h('span.main', '지나가기'), h('span.sub', `잔액 ${me.cash} 유지`))];
    } else if (pd.kind === 'market') {
      body = [h('p.hprompt', '화물 계약을 하나 고르세요. 목적지를 지나가거나 도착하면 보상을 받습니다.'),
        ...pd.contracts.map((c, i) => h('button.hbtn' + (i === 1 ? '.alt' : ''), { onclick: () => send({ type: 'contract', index: i }) },
          h('span.main', `${c.cargoName} → ${c.destName} · 보상 ${c.reward}`), h('span.sub', `${c.dist}칸 앞 · 칸당 ${Math.round(c.reward / c.dist)}`))),
        h('button.hbtn', { onclick: () => send({ type: 'pass' }) }, h('span.main', '계약 없이 출항'), h('span.sub', '빈 배로 계속'))];
    } else if (pd.kind === 'settle') {
      const short = pd.owed - me.cash;
      body = [h('p.hprompt.warn', `${pd.reason} ${pd.owed}을 내려면 ${short}이 부족해요. 항구를 환매가로 팔아 정산하세요.`),
        ...portsOf(g, this.me).sort((a, b) => buybackOf(g, a) - buybackOf(g, b)).map(i => h('button.hbtn', { onclick: () => send({ type: 'sell', tile: i }) },
          h('span.main', `${this.tileData[i].name} 매각 · +${buybackOf(g, i)}`), h('span.sub', `매각 후 현금 ${me.cash + buybackOf(g, i)} / 필요 ${pd.owed}`)))];
    }
    put(this.action, h('div.hact-row', ...body), this.timerEl);
    if (this.busy) this.action.querySelectorAll('button').forEach(b => { b.disabled = true; });
    this.renderTimer();
  }
  renderTimer() {
    const el = this.timerEl, dl = this.room?.deadline, pd = this.g?.pending;
    if (!el || !pd || !dl || dl.pendingId !== pd.id) { if (el) el.textContent = ''; return; }
    const left = Math.max(0, Math.ceil((dl.at - (Date.now() + this.serverOffset)) / 1000));
    el.textContent = `남은 시간 ${left}초 · 시간이 지나면 「${DEFAULT_ACTION_TEXT[pd.kind]}」`;
    el.classList.toggle('urgent', left <= 10);
  }

  // ---------- 기록 ----------
  renderLog() {
    const g = this.g;
    put(this.logList, ...g.log.slice(-40).reverse().map(l => {
      const p = l.pid ? this.P(l.pid) : null;
      return h('li.k-' + l.kind, { style: { '--pc': p?.color || '#9fb3c8' } }, h('span.lr', `${l.round}R`), l.text);
    }));
  }

  // ---------- 결과 ----------
  resultsView() {
    const r = this.g.results || [];
    return h('div.hresults',
      h('h2', '🏁 최종 정산'),
      h('p.small', this.g.log.at(-1)?.text),
      h('p.small', '순자산 = 현금 + 보유 항구 환매가'),
      h('ol.hres-list', ...r.map(x => h('li' + (x.rank === 1 ? '.win' : ''), { style: { '--pc': x.color } },
        h('span.rank', `${x.rank}위`), shipIcon(x.ship, x.color, { size: 26 }), h('b', x.name),
        h('span.total', x.bankrupt ? '파산' : String(x.total)),
        h('span.small.breakdown', x.bankrupt ? `${x.bankruptRound}라운드 파산` : `현금 ${x.cash} + 항구 ${x.portValue} (${x.ports.length}곳) · 배송 ${x.stats.delivered}건 · 이용료 수입 ${x.stats.tollEarned}`)))),
    );
  }
  resultButtons() {
    const isHost = this.room.hostId === this.me;
    const r = this.g.results || [];
    return [
      h('button.hbtn.primary', { onclick: () => this.d.leaveToHome() }, h('span.main', '게임 선택으로')),
      isHost ? h('button.hbtn', { onclick: () => this.d.send('rematch') }, h('span.main', '같은 멤버로 다시 하기')) : h('p.small', '방장이 "다시 하기"를 누르면 같은 방 대기실로 돌아갑니다.'),
      h('button.hbtn', { onclick: () => copyText(r.map(x => `${x.rank}위 ${x.name} ${x.bankrupt ? '파산' : x.total}`).join('\n')) }, h('span.main', '결과 복사')),
    ];
  }
}

// 받침에 따라 '이/가'를 붙인다 (한글이 아니면 '이(가)')
export function iga(word) {
  const c = String(word).trim().slice(-1).charCodeAt(0);
  if (c >= 0xac00 && c <= 0xd7a3) return word + ((c - 0xac00) % 28 ? '이' : '가');
  return word + '이(가)';
}

function waitText(pd, cur, tiles) {
  const t = pd.tile !== undefined ? tiles[pd.tile] : null;
  switch (pd.kind) {
    case 'roll': return `${iga(cur.name)} 주사위를 굴릴 차례`;
    case 'buy': return `${iga(cur.name)} ${t.name} 매입을 고민 중`;
    case 'upgrade': return `${iga(cur.name)} ${t.name} 확장을 고민 중`;
    case 'market': return `${iga(cur.name)} ${t.name}에서 화물 계약을 고르는 중`;
    case 'takeover': return `${iga(cur.name)} ${t.name} 인수를 고민 중`;
    case 'shelter': return `${iga(cur.name)} 피난소에서 출항을 준비 중`;
    case 'charter': return `${iga(cur.name)} 쾌속선 목적지를 고르는 중`;
    case 'settle': return `${iga(cur.name)} ${pd.reason} 정산을 위해 항구 매각 중`;
  }
  return `${cur.name}의 차례`;
}

function rulesBody(size) {
  const modern = size === BOARD_SIZE;
  return h('div.small',
    h('ul',
      h('li', modern ? '40칸 항로에서 주사위 두 개의 합만큼 이동합니다. 더블은 추가 굴림, 세 번 연속이면 피난소입니다.' : '24칸 항로에서 주사위 한 개를 굴려 이동합니다.'),
      h('li', `출항지를 지나가거나 도착하면 그 이동에서 보급금 ${ECONOMY.supply}을 한 번 받습니다.`),
      h('li', modern ? '내 항구는 해상 기지까지 확장할 수 있습니다. 다른 선장 항구는 이용료를 낸 뒤 인수할 수 있고, 해상 기지는 인수할 수 없습니다.' : '내 항구는 최대 두 단계까지 확장할 수 있습니다. 상대 항구에 도착하면 이용료를 냅니다.'),
      modern ? h('li', '한 권역을 모두 소유하면 이용료가 두 배, 세 권역을 확보하면 즉시 승리합니다. 피난소, 쾌속선, 관리비와 선원 조합 기금은 칸 상세에서 확인하세요.') : null,
      h('li', '화물 시장: 계약 두 개 중 하나를 고르거나 지나갑니다. 한 번에 한 건만 운송하고, 목적지를 지나가거나 도착하면 자동으로 보상을 받습니다(같은 칸 정박료보다 먼저).'),
      h('li', '해상 이벤트: 순풍, 풍어, 수리비, 항구 축제, 세관 검사, 해적 소문, 무역 보조금, 급행 의뢰.'),
      h('li', '돈이 부족하면 보유 항구를 표시된 환매가로 팔아 정산합니다. 모두 팔아도 부족하면 파산.'),
      h('li', '생존자가 한 명이면 즉시 종료. 마지막 라운드가 끝나면 현금 + 항구 환매가로 순위(동점은 공동 순위).'),
      h('li', '선택 제한 시간이 지나거나 연결이 끊기면 기본 행동(굴리기 / 지나가기 / 가장 싼 항구 매각)이 적용됩니다.')));
}

const put = (el, ...kids) => el.replaceChildren(...kids.flat().filter(k => k !== null && k !== undefined && k !== false && k !== ''));
