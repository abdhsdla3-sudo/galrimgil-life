// 「항구의 길」 데이터: 칸 배치, 가격표, 계약, 해상 이벤트, 설정
// 숫자는 이 파일에서만 조정한다. 엔진과 화면은 여기서 계산된 표를 그대로 사용한다.

export const ECONOMY = {
  startCash: 600,      // 시작 자금
  supply: 120,         // 출항지 보급금 (지나가거나 도착할 때, 이동 1회당 1번)
  tollRate: [0.55, 1.25, 2.0], // 시설 단계(0~2)별 이용료 = 매입가 × 비율
  upgradeRate: 0.5,    // 단계당 확장비 = 매입가 × 비율
  buybackRate: 0.8,  // 환매가 = (매입가 + 지불한 확장비) × 비율
  maxLevel: 2,
  contract: { base: 50, perStep: 14 }, // 배송 보상 = (기본 + 거리 × 칸당) × 화물 배율
};

export const ROUND_OPTIONS = [6, 8, 10, 12];
export const TIME_OPTIONS = [30, 60, 90];
export const PLAYER_LIMITS = { min: 2, max: 4, default: 4 };

// 24칸 순환 항로. 0번이 출항지, 시계 방향으로 진행한다.
// type: start | port | market | event
const LAYOUT = [
  ['start', '물빛 출항지'],
  ['port', '솔바람항', 100, 'west'],
  ['port', '물안개포구', 110, 'west'],
  ['market', '첫물 화물시장'],
  ['port', '등대곶', 130, 'west'],
  ['event', '잔물결 해역'],
  ['port', '갈매기항', 150, 'north'],
  ['port', '산호만', 160, 'north'],
  ['event', '안개 해협'],
  ['port', '은모래항', 180, 'north'],
  ['market', '바람길 화물시장'],
  ['port', '바람개비항', 200, 'east'],
  ['event', '고래 바다'],
  ['port', '노을부두', 210, 'east'],
  ['port', '고래목항', 230, 'east'],
  ['market', '석양 화물시장'],
  ['port', '진주포구', 240, 'south'],
  ['event', '소용돌이 목'],
  ['port', '해오름항', 260, 'south'],
  ['port', '별빛부두', 280, 'south'],
  ['market', '밤바다 화물시장'],
  ['port', '푸른돛항', 300, 'cape'],
  ['event', '등불 해역'],
  ['port', '달무리항', 330, 'cape'],
];

export const REGIONS = {
  west: { name: '서쪽 어촌', color: '#3fb6a8' },
  north: { name: '북쪽 산호섬', color: '#f2a65a' },
  east: { name: '동쪽 무역로', color: '#e96f5c' },
  south: { name: '남쪽 진주만', color: '#b48cd9' },
  cape: { name: '끝섬 곶', color: '#f4d35e' },
};

const round10 = (n) => Math.round(n / 10) * 10;
const round5 = (n) => Math.round(n / 5) * 5;

export function portNumbers(price) {
  const upgrade = round10(price * ECONOMY.upgradeRate);
  return {
    price,
    upgrade,
    toll: ECONOMY.tollRate.map(r => round5(price * r)),
    buyback: [0, 1, 2].map(lv => round5((price + upgrade * lv) * ECONOMY.buybackRate)),
  };
}

export const TILES = LAYOUT.map(([type, name, price, region], i) => ({
  i, type, name, short: shortName(name),
  ...(type === 'port' ? { region, ...portNumbers(price) } : {}),
}));
export const BOARD_SIZE = TILES.length;
export const PORT_IDS = TILES.filter(t => t.type === 'port').map(t => t.i);

function shortName(name) {
  return name.replace(/(화물시장|출항지|해역|해협|바다|목)$/, '').replace(/(항|포구|부두|만|곶)$/, '').trim() || name;
}

// 화물 종류: 거리 보상에 곱하는 배율
export const CARGO = [
  { id: 'fish', name: '건어물', mult: 1.0 },
  { id: 'salt', name: '천일염', mult: 1.05 },
  { id: 'tea', name: '섬 찻잎', mult: 1.1 },
  { id: 'pearl', name: '진주 상자', mult: 1.3 },
  { id: 'spice', name: '향신료', mult: 1.2 },
  { id: 'pottery', name: '청자 그릇', mult: 1.25 },
];
// 시장에서 제시하는 두 계약의 거리 범위 (가까운 계약 / 먼 계약)
export const CONTRACT_RANGES = [[3, 8], [9, 16]];

export const contractReward = (dist, cargo) => round5((ECONOMY.contract.base + ECONOMY.contract.perStep * dist) * cargo.mult);

// 해상 이벤트. kind 별 효과는 엔진에서 처리한다. weight 는 뽑힐 확률 가중치.
export const EVENTS = [
  { id: 'tailwind', name: '순풍', kind: 'move', steps: 2, weight: 3, text: '돛이 부풀어 2칸 더 나아갑니다.' },
  { id: 'catch', name: '풍어', kind: 'gain', amount: 90, weight: 3, text: '그물 가득 물고기를 건져 팔았습니다.' },
  { id: 'repair', name: '수리비', kind: 'pay', amount: 70, weight: 3, text: '암초에 긁힌 선체를 고칩니다.' },
  { id: 'festival', name: '항구 축제', kind: 'all', amount: 40, weight: 2, text: '섬 전체가 축제로 들썩여 모두가 수익을 얻습니다.' },
  { id: 'customs', name: '세관 검사', kind: 'cargoFee', amount: 50, weight: 2, text: '화물을 실은 배는 검사 수수료를 냅니다.' },
  { id: 'pirates', name: '해적 소문', kind: 'perPort', amount: 20, weight: 2, text: '보유 항구마다 경비를 세웁니다.' },
  { id: 'subsidy', name: '무역 보조금', kind: 'underdog', amount: 120, weight: 2, text: '항구가 가장 적은 선장에게 보조금이 나옵니다.' },
  { id: 'express', name: '급행 의뢰', kind: 'cargoBonus', amount: 60, weight: 2, text: '운송 중인 화물의 보상이 올라갑니다.' },
  { id: 'calm', name: '잔잔한 바다', kind: 'none', weight: 1, text: '아무 일도 없이 바다를 즐깁니다.' },
];

export const SHIPS = [
  { id: 'sloop', name: '돛단배', color: '#ff7a5c' },
  { id: 'steamer', name: '증기선', color: '#38d6c4' },
  { id: 'junk', name: '정크선', color: '#ffd166' },
  { id: 'tug', name: '예인선', color: '#c3a6ff' },
];

export function defaultHarborSettings() {
  return { rounds: 10, timeLimit: 60 };
}
export function normalizeHarborSettings(input) {
  const s = input && typeof input === 'object' ? input : {};
  const d = defaultHarborSettings();
  return {
    rounds: ROUND_OPTIONS.includes(Number(s.rounds)) ? Number(s.rounds) : d.rounds,
    timeLimit: TIME_OPTIONS.includes(Number(s.timeLimit)) ? Number(s.timeLimit) : d.timeLimit,
  };
}

// 시간 초과·연결 끊김 시 적용할 기본 행동 설명 (화면 안내용)
export const DEFAULT_ACTION_TEXT = {
  roll: '주사위 굴리기',
  buy: '지나가기',
  upgrade: '지나가기',
  market: '지나가기',
  settle: '환매가가 가장 낮은 항구 매각',
};
