// 보드 생성기: 설정과 시드로 결정적인 보드 그래프와 화면 좌표를 만든다.
import { shuffle } from './rng.js';

export const COLS = 11;
export const CELL = 76;
export const ROW_H = 190;

export function buildBoard(settings, rng) {
  const nodes = {};
  const items = []; // 레이아웃용 순서: {kind:'node', id} | {kind:'fork', lanes:[[id..],[id..]]}
  let seq = 0;
  let prev = []; // 다음 노드로 연결될 이전 노드 id 목록
  const mk = (type, stage, extra = {}) => {
    const id = 'n' + (seq++);
    nodes[id] = { id, type, stage, next: [], ...extra };
    for (const p of prev) nodes[p].next.push(id);
    prev = [id];
    return id;
  };
  const single = (type, stage, extra) => { const id = mk(type, stage, extra); items.push({ kind: 'node', id }); return id; };

  // 분기: 갈림길 노드(마지막 노드)의 branch 정보에 선택지 표시
  const fork = (stage, lanes) => {
    const fromId = prev[0];
    const laneIds = [];
    const ends = [];
    for (const lane of lanes) {
      prev = [fromId];
      const ids = [];
      lane.types.forEach((t, i) => {
        const id = mk(t, stage, { lane: lane.name });
        if (i === 0) {
          nodes[fromId].branch = nodes[fromId].branch || [];
          nodes[fromId].branch.push({ to: id, label: lane.name, desc: lane.desc, effects: lane.effects || [], when: lane.when });
        }
        ids.push(id);
      });
      laneIds.push(ids);
      ends.push(ids[ids.length - 1]);
    }
    prev = ends;
    items.push({ kind: 'fork', lanes: laneIds });
  };

  const bagFill = (len, bag, paydayType, paydayEvery) => {
    const out = [];
    let pool = [];
    for (let i = 1; i <= len; i++) {
      if (paydayType && i % paydayEvery === 0) { out.push(paydayType); continue; }
      if (!pool.length) pool = shuffle(rng, bag);
      out.push(pool.pop());
    }
    return out;
  };

  const { lengths, packs, startStage } = settings;

  // ----- 성장기 -----
  if (startStage === 'growth') {
    single('start', 'growth', { label: '탄생' });
    const types = bagFill(lengths.growth, ['study', 'play', 'art', 'friend', 'event', 'study', 'play', 'art', 'friend', 'lucky', 'risk', 'card'], 'allowance', 5);
    const forkAt = Math.floor(types.length / 2);
    types.forEach((t, i) => {
      single(t, 'growth');
      if (i === forkAt) {
        fork('growth', [
          { name: '도서관 골목', desc: '배움·창작 칸이 이어진다', types: ['study', 'art', 'study'] },
          { name: '운동장 골목', desc: '놀이·친구 칸이 이어진다', types: ['play', 'friend', 'play'] },
        ]);
      }
    });
    single('gate', 'growth', { gate: 'career', stop: true, label: '진로의 문' });
    fork('early', [
      { name: '캠퍼스 길', desc: '대학 진학: 학자금 부채 +120, 학위 취득, 지성 +1. 배움·인연 칸', types: ['study', 'love', 'event', 'study', 'friend', 'card'], effects: [{ debt: 120 }, { degree: true }, { stat: { smart: 1 } }] },
      { name: '사회 길', desc: '바로 사회로: 아르바이트로 시작, 현금 +40. 월급·사건 칸', types: ['event', 'payday', 'job', 'card', 'payday', 'event'], effects: [{ setJob: { id: 'parttime', rank: 0 } }, { cash: 40 }] },
    ]);
    single('gate', 'early', { gate: 'firstJob', stop: true, label: '첫 직장' });
  } else {
    single('start', 'early', { label: '사회 첫걸음' });
  }

  // ----- 성인 전반 / 후반 -----
  const adultBag = ['event', 'event', 'job', 'job', 'love', 'love', 'shop', 'card', 'risk', 'lucky', 'study'];
  if (packs.joint) adultBag.push('together');
  const adultStage = (stage, len) => {
    const types = bagFill(len, adultBag, 'payday', 5);
    const forkPoints = new Set();
    const forkCount = Math.max(1, Math.floor(len / 14));
    for (let k = 1; k <= forkCount; k++) forkPoints.add(Math.floor((len * k) / (forkCount + 1)));
    let forkNo = 0;
    types.forEach((t, i) => {
      single(t, stage);
      if (forkPoints.has(i)) {
        const lanes = [
          { name: '일 중심 길', desc: '직장·배움 칸', types: ['job', 'study', 'job'] },
          { name: '사람 중심 길', desc: '인연·마켓 칸', types: ['love', 'shop', 'love'] },
        ];
        if (packs.special && forkNo === 0) {
          lanes.push({ name: '바람섬 뱃길', desc: '2칸 더 길다. 섬 전용 사건(보물·별장·태풍)', types: ['island', 'island', 'lucky', 'island', 'island'] });
        }
        forkNo++;
        fork(stage, lanes);
      }
    });
  };
  adultStage('early', lengths.early);
  single('gate', 'late', { gate: 'midlife', stop: true, label: '인생 중간 점검' });
  adultStage('late', lengths.late);
  single('goal', 'late', { gate: 'goal', stop: true, label: '은퇴' });

  layout(nodes, items);
  const start = items[0].id;
  return { nodes, start, width: COLS * CELL + 40, height: Math.max(...Object.values(nodes).map(n => n.y)) + 90 };
}

function layout(nodes, items) {
  let row = 0, col = 0;
  const place = (id, c, r, off) => {
    const dirRight = r % 2 === 0;
    const x = 20 + CELL / 2 + (dirRight ? c : COLS - 1 - c) * CELL;
    nodes[id].x = x;
    nodes[id].y = 60 + r * ROW_H + off;
  };
  for (const it of items) {
    if (it.kind === 'node') {
      if (col >= COLS) { row++; col = 0; }
      place(it.id, col, row, 0);
      col++;
    } else {
      const w = Math.max(...it.lanes.map(l => l.length));
      if (col + w > COLS) { row++; col = 0; }
      const offs = it.lanes.length === 2 ? [-52, 52] : [-62, 0, 62];
      it.lanes.forEach((lane, li) => lane.forEach((id, i) => place(id, col + i, row, offs[li])));
      col += w;
    }
  }
}
