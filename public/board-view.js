// SVG 보드 렌더링과 말 이동 연출
import { SPACE_TYPES, STAGES } from '/game/content.js';
import { h } from './util.js';

const NS = 'http://www.w3.org/2000/svg';
const s = (tag, attrs = {}, ...kids) => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) el.setAttribute(k, v);
  for (const k of kids) if (k) el.append(k instanceof Node ? k : document.createTextNode(k));
  return el;
};
const TYPE_COLOR = {
  start: '#ffe9a8', event: '#fdf3dc', study: '#d9ecff', play: '#dff5d8', art: '#f8dcf3', friend: '#ffe3cf', lucky: '#c9f2c0', risk: '#ffd0c8',
  card: '#e7defc', allowance: '#fff2b3', payday: '#ffe08a', job: '#d6e4f0', love: '#ffd6e5', shop: '#d7f0ea', together: '#ffe0b3', island: '#bfe9ef', gate: '#f2c9a0', goal: '#ffd36b',
};
const STAGE_BG = { growth: '#eaf6e3', early: '#fff1df', late: '#eee8fb' };
const STAGE_INK = { growth: '#35634c', early: '#854821', late: '#584476' };

export class BoardView {
  constructor(container, onNodeClick) {
    this.container = container;
    this.onNodeClick = onNodeClick;
    this.disp = {}; // pid → 표시 위치
    this.pos = {}; // pid → 말의 화면 좌표
    this.anim = Promise.resolve();
  }
  setBoard(board) {
    this.board = board;
    const svg = s('svg', { viewBox: `0 0 ${board.width} ${board.height}`, class: 'board-svg', role: 'img', 'aria-label': '게임 보드' });
    const nodes = Object.values(board.nodes);
    svg.append(s('defs', {},
      s('pattern', { id: 'board-grain', width: 16, height: 16, patternUnits: 'userSpaceOnUse' },
        s('circle', { cx: 4, cy: 4, r: 1, fill: '#624c38', opacity: .15 })),
    ));
    // 단계 배경
    const bands = {};
    const labels = s('g', { class: 'stage-labels' });
    const labelX = board.width / 2;
    for (const n of nodes) { const b = (bands[n.stage] ||= { minY: 1e9, maxY: -1e9 }); b.minY = Math.min(b.minY, n.y); b.maxY = Math.max(b.maxY, n.y); }
    for (const [st, b] of Object.entries(bands)) {
      const y = Math.max(0, b.minY - 76);
      const band = { x: 6, y, width: board.width - 12, height: b.maxY + 72 - y, rx: 22 };
      svg.append(s('rect', { ...band, fill: STAGE_BG[st], stroke: STAGE_INK[st], 'stroke-opacity': .36, 'stroke-width': 2 }));
      svg.append(s('rect', { ...band, fill: 'url(#board-grain)' }));
      labels.append(s('rect', { x: labelX - 50, y: y + 4, width: 100, height: 23, rx: 9, fill: STAGE_INK[st] }));
      labels.append(s('text', { x: labelX, y: y + 21, class: 'stage-label' }, STAGES[st]));
    }
    // 연결선
    const tracks = s('g', { class: 'tracks' });
    const edges = s('g', { class: 'edges' });
    for (const n of nodes) for (const t of n.next) {
      const m = board.nodes[t];
      const line = { x1: n.x, y1: n.y, x2: m.x, y2: m.y };
      tracks.append(s('line', { ...line, class: n.next.length > 1 ? 'track fork' : 'track' }));
      edges.append(s('line', { ...line, class: 'edge' }));
    }
    svg.append(tracks, edges, labels);
    // 칸
    this.nodeEls = {};
    const gN = s('g', { class: 'nodes' });
    for (const n of nodes) {
      const t = SPACE_TYPES[n.type];
      const big = n.gate || n.type === 'start';
      const w = big ? 70 : 58, hh = big ? 62 : 54;
      const g = s('g', { class: `node t-${n.type}${n.stop ? ' stop' : ''}`, transform: `translate(${n.x},${n.y})`, tabindex: 0, 'data-id': n.id });
      const tile = { x: -w / 2, y: -hh / 2, width: w, height: hh, rx: 12 };
      g.append(s('rect', { ...tile, y: tile.y + 4, class: 'tile-base' }));
      g.append(s('rect', { ...tile, fill: TYPE_COLOR[n.type], class: 'tile-face' }));
      g.append(s('text', { y: -4, class: 'node-icon' }, t.icon));
      g.append(s('text', { y: 18, class: 'node-name' }, n.label || t.name));
      if (n.stop) g.append(s('text', { y: -hh / 2 - 4, class: 'stop-tag' }, '정지'));
      if (n.lane && !board.nodes[Object.keys(board.nodes).find(k => board.nodes[k].next.includes(n.id))]?.lane) {
        g.append(s('text', { y: hh / 2 + 13, class: 'lane-tag' }, n.lane));
      }
      g.append(s('title', {}, `${n.label || t.name}${n.stop ? ' (반드시 멈춤)' : ''}${n.lane ? ' · ' + n.lane : ''}`));
      g.addEventListener('click', () => this.onNodeClick?.(n));
      g.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.onNodeClick?.(n); });
      gN.append(g);
      this.nodeEls[n.id] = g;
    }
    svg.append(gN);
    this.pawnLayer = s('g', { class: 'pawns' });
    this.fxLayer = s('g', { class: 'fx' });
    svg.append(this.pawnLayer, this.fxLayer);
    this.container.replaceChildren(svg);
    this.svg = svg;
    this.pawns = {};
    this.disp = {};
    this.labels = null;
    this.fit();
    if (!this.ro) { this.ro = new ResizeObserver(() => this.fit()); this.ro.observe(this.container); }
  }
  // 화면 크기에 맞춰 보드 크기 조절. 'all' 전체가 한눈에 | 'fit' 가로 맞춤 | 'big' 가로 맞춤의 1.6배
  setZoom(mode) { this.zoom = mode; this.fit(); }
  fit() {
    if (!this.svg || !this.board) return;
    const c = this.container;
    c.classList.toggle('z-all', this.zoom === 'all');
    const cw = c.clientWidth - 16, ch = c.clientHeight - 16;
    if (cw <= 0) return;
    const fitW = cw / this.board.width;
    let k = fitW;
    if (this.zoom === 'all') k = Math.min(fitW, ch / this.board.height);
    else if (this.zoom === 'big') k = fitW * 1.6;
    k = Math.max(0.3, Math.min(k, this.zoom === 'big' ? 3.2 : 2));
    this.svg.style.width = Math.round(this.board.width * k) + 'px';
    this.svg.style.height = Math.round(this.board.height * k) + 'px';
  }
  highlight(ids) {
    for (const el of Object.values(this.nodeEls || {})) el.classList.remove('hl');
    for (const id of ids || []) this.nodeEls?.[id]?.classList.add('hl');
  }
  // 같은 칸의 말들은 격자로 펼쳐 겹치지 않게 표시
  layoutPawns(players, currentId, meId = this.meId) {
    this.meId = meId;
    this.labels ||= pawnLabels(players);
    const groups = {};
    for (const p of players) (groups[this.disp[p.id] ?? p.pos] ||= []).push(p);
    const active = players.find(p => p.id === currentId && !p.finished);
    const activeNode = active ? this.nodeEls[this.disp[active.id] ?? active.pos] : null;
    if (this.activeNode !== activeNode) {
      this.activeNode?.classList.remove('active');
      activeNode?.classList.add('active');
      this.activeNode = activeNode;
    }
    for (const [nid, list] of Object.entries(groups)) {
      const n = this.board.nodes[nid];
      if (!n) continue;
      // 차례인 말을 맨 앞 줄에 둔다
      list.sort((a, b) => (b.id === currentId) - (a.id === currentId));
      const cols = list.length <= 3 ? list.length : list.length <= 6 ? 3 : 4;
      const gap = list.length > 6 ? 19 : 24;
      list.forEach((p, i) => {
        const r = Math.floor(i / cols), c = i % cols;
        const inRow = Math.min(cols, list.length - r * cols);
        const x = n.x + (c - (inRow - 1) / 2) * gap;
        const y = n.y - 36 - r * (gap - 5);
        let el = this.pawns[p.id];
        if (!el) {
          const label = this.labels[p.id] || p.name.slice(0, 1);
          el = s('g', { class: 'pawn' + (p.id === meId ? ' me' : ''), 'data-pid': p.id });
          el.append(s('ellipse', { cx: 0, cy: 14, rx: 10, ry: 3.5, class: 'pawn-shadow' }));
          el.append(s('circle', { r: 13, fill: p.color, class: 'pawn-body' }));
          el.append(s('text', { y: label.length > 1 ? 3.5 : 5, class: 'pawn-mark' + (label.length > 1 ? ' two' : '') }, label));
          if (p.id === meId) el.append(s('text', { x: 12, y: -7, class: 'pawn-me' }, '★'));
          const name = p.id === meId ? `${p.name} (나)` : p.name;
          const w = Math.max(36, [...name].length * 12 + 14);
          el.append(s('g', { class: 'ptag', transform: 'translate(0,-22)' },
            s('rect', { x: -w / 2, y: -17, width: w, height: 20, rx: 10, fill: p.color }),
            s('text', { y: -2.5, class: 'ptag-text' }, name),
            s('path', { d: 'M -5 3 L 5 3 L 0 8 Z', fill: p.color })));
          el.append(s('title', {}, name));
          el.addEventListener('mouseenter', () => this.pawnLayer.append(el));
          this.pawnLayer.append(el);
          this.pawns[p.id] = el;
        }
        el.setAttribute('transform', `translate(${x},${y})`);
        el.classList.toggle('current', p.id === currentId);
        el.classList.toggle('finished', !!p.finished);
        this.pos[p.id] = { x, y };
      });
    }
    // 차례인 말은 항상 맨 위에 그린다
    const cur = this.pawns[currentId];
    if (cur && this.pawnLayer.lastChild !== cur) this.pawnLayer.append(cur);
  }
  // 플레이어 목록에서 가리킨 말을 강조
  spotlight(pid) {
    for (const [id, el] of Object.entries(this.pawns || {})) el.classList.toggle('spot', id === pid);
    if (pid && this.pawns?.[pid]) this.pawnLayer.append(this.pawns[pid]);
  }
  // 말 위로 떠오르는 글자 (돈 변화 등)
  floatText(pid, text, kind, delay = 0) {
    const at = this.pos?.[pid];
    if (!at || !this.fxLayer) return;
    setTimeout(() => {
      const t = s('text', { x: at.x, y: at.y - 26, class: 'float-num ' + kind }, text);
      this.fxLayer.append(t);
      setTimeout(() => t.remove(), 2400);
    }, delay);
  }
  // 이전 표시 위치에서 새 위치까지 길을 따라 이동 (BFS)
  pathBetween(from, to) {
    if (from === to) return [];
    const prev = { [from]: null }; const q = [from];
    while (q.length) {
      const x = q.shift();
      if (x === to) break;
      for (const y of this.board.nodes[x].next) if (!(y in prev)) { prev[y] = x; q.push(y); }
    }
    if (!(to in prev)) return [to];
    const path = []; for (let x = to; x !== from; x = prev[x]) path.unshift(x);
    return path.length > 20 ? [to] : path;
  }
  async animateTo(players, currentId, stepMs, onStep, skip) {
    for (const p of players) {
      const from = this.disp[p.id] ?? p.pos;
      if (from === p.pos) continue;
      const path = stepMs > 0 ? this.pathBetween(from, p.pos) : [p.pos];
      for (const [i, nid] of path.entries()) {
        this.disp[p.id] = nid;
        this.layoutPawns(players, currentId);
        if (stepMs > 0 && !skip?.()) {
          onStep?.(path.length - 1 - i, p);
          await new Promise(r => setTimeout(r, stepMs));
        }
      }
    }
    for (const p of players) this.disp[p.id] = p.pos;
    this.layoutPawns(players, currentId);
  }
  scrollTo(nodeId, behavior = 'smooth') {
    const n = this.board?.nodes[nodeId];
    if (!n || this.zoom === 'all') return;
    const c = this.container;
    const board = this.svg.getBoundingClientRect(), view = c.getBoundingClientRect();
    c.scrollTo({
      top: c.scrollTop + board.top - view.top - c.clientTop + n.y * board.height / this.board.height - c.clientHeight / 2,
      left: c.scrollLeft + board.left - view.left - c.clientLeft + n.x * board.width / this.board.width - c.clientWidth / 2,
      behavior,
    });
  }
  // from 다음 칸부터 가장 가까운 type 칸까지의 칸 수
  distanceTo(from, type) {
    const seen = new Set([from]); let q = [from];
    for (let d = 1; q.length && d < 120; d++) {
      const nq = [];
      for (const x of q) for (const y of this.board.nodes[x]?.next || []) {
        if (seen.has(y)) continue;
        if (this.board.nodes[y].type === type) return d;
        seen.add(y); nq.push(y);
      }
      q = nq;
    }
    return null;
  }
}

// 말에 쓰는 짧은 이름: 첫 글자, 겹치면 두 글자
export function pawnLabels(players) {
  const count = {};
  for (const p of players) { const k = [...p.name][0] || '?'; count[k] = (count[k] || 0) + 1; }
  return Object.fromEntries(players.map(p => {
    const ch = [...p.name];
    return [p.id, count[ch[0]] > 1 ? ch.slice(0, 2).join('') : (ch[0] || '?')];
  }));
}

export function nodeInfo(board, n, players) {
  const t = SPACE_TYPES[n.type];
  const here = players.filter(p => p.pos === n.id);
  return h('div.node-info',
    h('h3', `${t.icon} ${n.label || t.name}`),
    h('p', `${STAGES[n.stage]}${n.lane ? ' · ' + n.lane : ''}${n.stop ? ' · 반드시 멈추는 칸' : ''}`),
    n.branch ? h('div', h('b', '갈림길: '), n.branch.map(b => h('div.small', `${b.label} — ${b.desc}`))) : null,
    h('p', SPACE_HELP[n.type] || ''),
    h('div', h('b', `이 칸의 참가자 (${here.length}명)`), here.length ? here.map(p => h('div.chip', { style: { borderColor: p.color } }, `${p.mark} ${p.name}`)) : h('div.small', '없음')),
  );
}
export const SPACE_HELP = {
  start: '출발 칸.', event: '단계·능력·직업·관계에 따라 사건이 뽑힌다.', study: '능력을 키우는 사건.', play: '체력 위주 사건.', art: '감성 위주 사건.', friend: '사교 위주 사건.',
  lucky: '좋은 일이 일어난다.', risk: '위기 사건. 보험 카드가 손실을 줄인다.', card: '카드 1장을 얻는다(최대 5장).', allowance: '지나가면 용돈 5, 멈추면 10.',
  payday: '지나가면 월급, 정확히 멈추면 월급의 절반 보너스와 승진 기회(도전형).', job: '직업 사건·승진 도전·전직 제안. 무직이면 재취업 기회.', love: '만남·데이트·결혼·가족 사건.',
  shop: '자산을 사고팔 수 있다. 부족한 금액은 한도 안에서 대출.', together: '모든 플레이어가 동시에 선택하는 공동 사건.', island: '바람섬 전용 사건.',
  gate: '반드시 멈추는 관문. 단계 전환과 큰 선택이 있다.', goal: '은퇴 칸. 도착 순서대로 보너스를 받고 차례를 마친다.',
};
