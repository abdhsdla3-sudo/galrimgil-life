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
    this.anim = Promise.resolve();
  }
  setBoard(board) {
    this.board = board;
    const svg = s('svg', { viewBox: `0 0 ${board.width} ${board.height}`, width: board.width, height: board.height, class: 'board-svg', role: 'img', 'aria-label': '게임 보드' });
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
    svg.append(this.pawnLayer);
    this.container.replaceChildren(svg);
    this.svg = svg;
    this.pawns = {};
    this.disp = {};
  }
  highlight(ids) {
    for (const el of Object.values(this.nodeEls || {})) el.classList.remove('hl');
    for (const id of ids || []) this.nodeEls?.[id]?.classList.add('hl');
  }
  // 같은 칸의 말들은 격자로 펼쳐 겹치지 않게 표시
  layoutPawns(players, currentId) {
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
      const cols = list.length <= 2 ? list.length : list.length <= 6 ? 3 : 4;
      list.forEach((p, i) => {
        const r = Math.floor(i / cols), c = i % cols;
        const rowsN = Math.ceil(list.length / cols);
        const x = n.x + (c - (Math.min(cols, list.length) - 1) / 2) * 15;
        const y = n.y - 30 - (rowsN - 1 - r) * 15;
        let el = this.pawns[p.id];
        if (!el) {
          el = s('g', { class: 'pawn' });
          el.append(s('circle', { r: 9, fill: p.color, stroke: '#fff', 'stroke-width': 2 }));
          el.append(s('text', { y: 4, class: 'pawn-mark' }, p.mark));
          el.append(s('title', {}, p.name));
          this.pawnLayer.append(el);
          this.pawns[p.id] = el;
        }
        el.setAttribute('transform', `translate(${x},${y})`);
        el.classList.toggle('current', p.id === currentId);
        el.classList.toggle('finished', !!p.finished);
      });
    }
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
  async animateTo(players, currentId, stepMs, onStep) {
    for (const p of players) {
      const from = this.disp[p.id] ?? p.pos;
      if (from === p.pos) continue;
      const path = stepMs > 0 ? this.pathBetween(from, p.pos) : [p.pos];
      for (const nid of path) {
        this.disp[p.id] = nid;
        this.layoutPawns(players, currentId);
        onStep?.(nid);
        if (stepMs > 0) await new Promise(r => setTimeout(r, stepMs));
      }
    }
    for (const p of players) this.disp[p.id] = p.pos;
    this.layoutPawns(players, currentId);
  }
  scrollTo(nodeId) {
    const n = this.board?.nodes[nodeId];
    if (!n) return;
    const c = this.container;
    const scale = this.svg.getBoundingClientRect().width / this.board.width || 1;
    c.scrollTo({ top: n.y * scale - c.clientHeight / 2, left: n.x * scale - c.clientWidth / 2, behavior: 'smooth' });
  }
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
