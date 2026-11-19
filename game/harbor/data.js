// 「항구의 길」 데이터: 칸 배치, 가격표, 계약, 해상 이벤트, 설정
// 숫자는 이 파일에서만 조정한다. 엔진과 화면은 여기서 계산된 표를 그대로 사용한다.

export const ECONOMY = {
  startCash: 600,      // 시작 자금
  supply: 120,         // 출항지 보급금 (지나가거나 도착할 때, 이동 1회당 1번)
  tollRate: [0.55, 1.25, 2.0, 2.75], // 시설 단계별 이용료 = 매입가 × 비율
  upgradeRate: 0.5,    // 단계당 확장비 = 매입가 × 비율
  buybackRate: 0.8,  // 환매가 = (매입가 + 지불한 확장비) × 비율
  maxLevel: 3,
  regionMultiplier: 2,
  takeoverRate: 1.6,
  charterFee: 80,
  shelterFee: 100,
  harborTax: 90,
  contract: { base: 50, perStep: 14 }, // 배송 보상 = (기본 + 거리 × 칸당) × 화물 배율
};

export const ROUND_OPTIONS = [6, 8, 10, 12];
export const TIME_OPTIONS = [30, 60, 90];
export const THEMES = { world: '세계 도시', korea: '한국 지역' };
export const DICE_POWER = {
  light: { name: '약하게', min: 2, max: 5, chance: 48 },
  medium: { name: '보통', min: 6, max: 8, chance: 69 },
  strong: { name: '강하게', min: 9, max: 12, chance: 48 },
};
export const ITEMS = {
  deed: { name: '인수 방어권', icon: '🛡', effect: '상대의 다음 인수 시도를 자동으로 한 번 막습니다. 상대는 인수 대금을 내지 않습니다.' },
  toll: { name: '통행권', icon: '🎟', effect: '다음 상대 도시 이용료를 자동으로 한 번 면제합니다.' },
  supply: { name: '보급 상자', icon: '🧰', effect: '내 차례 주사위를 굴리기 전에 쓰면 현금 120을 받습니다.' },
};
export const PLAYER_LIMITS = { min: 2, max: 8, default: 8 };
export const WAGERS = [50, 100, 200];

// 기존 저장 방의 칸 번호를 유지하기 위해 신규 칸은 뒤에 추가한다.
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
  ['shelter', '폭풍 피난소'],
  ['port', '유리등대', 190, 'isles'],
  ['port', '흰돌항', 210, 'isles'],
  ['market', '여울 화물시장'],
  ['port', '해무부두', 230, 'isles'],
  ['tax', '항로 관리소'],
  ['event', '까치섬 소식'],
  ['port', '은빛수로', 250, 'strait'],
  ['charter', '쾌속선 선착장'],
  ['port', '흑진주항', 270, 'strait'],
  ['port', '바다숲항', 290, 'strait'],
  ['fund', '선원 조합'],
  ['port', '청람포구', 280, 'ocean'],
  ['event', '돌고래 항로'],
  ['port', '구름곶', 300, 'ocean'],
  ['port', '금빛등대', 320, 'ocean'],
];

export const REGIONS = {
  west: { name: '대한민국', color: '#3fb6a8' },
  north: { name: '동아시아', color: '#f2a65a' },
  east: { name: '동남아시아', color: '#e96f5c' },
  south: { name: '인도양·중동', color: '#b48cd9' },
  cape: { name: '지중해', color: '#f4d35e' },
  isles: { name: '북유럽', color: '#6fa8e8' },
  strait: { name: '북아메리카', color: '#79bc57' },
  ocean: { name: '태평양·오세아니아', color: '#e879ab' },
};

const WORLD_NAMES = [
  '부산 출항지', '인천', '여수', '대한해협 화물시장', '제주', '동중국해',
  '상하이', '도쿄', '태평양 해상 소식', '홍콩', '남중국해 화물시장',
  '마닐라', '남중국해 소식', '싱가포르', '방콕', '말라카 해협 화물시장',
  '콜롬보', '인도양', '뭄바이', '두바이', '수에즈 화물시장',
  '아테네', '지중해 소식', '바르셀로나', '폭풍 피난소', '런던', '암스테르담',
  '북해 화물시장', '코펜하겐', '항로 관리소', '대서양 해상 소식', '뉴욕', '쾌속선 선착장',
  '밴쿠버', '샌프란시스코', '선원 조합', '호놀룰루', '남태평양',
  '시드니', '오클랜드',
];
const PORT_COUNTRIES = {
  인천: '대한민국', 여수: '대한민국', 제주: '대한민국', 상하이: '중국',
  도쿄: '일본', 홍콩: '중국 특별행정구', 마닐라: '필리핀', 싱가포르: '싱가포르',
  방콕: '태국', 콜롬보: '스리랑카', 뭄바이: '인도', 두바이: '아랍에미리트',
  아테네: '그리스', 바르셀로나: '스페인', 런던: '영국', 암스테르담: '네덜란드',
  코펜하겐: '덴마크', 뉴욕: '미국', 밴쿠버: '캐나다', 샌프란시스코: '미국',
  호놀룰루: '미국', 시드니: '호주', 오클랜드: '뉴질랜드',
};
const LEGACY_REGION_NAMES = { west: '서쪽 어촌', north: '북쪽 산호섬', east: '동쪽 무역로', south: '남쪽 진주만', cape: '끝섬 곶' };

const round10 = (n) => Math.round(n / 10) * 10;
const round5 = (n) => Math.round(n / 5) * 5;

export function portNumbers(price) {
  const upgrade = round10(price * ECONOMY.upgradeRate);
  return {
    price,
    upgrade,
    toll: ECONOMY.tollRate.map(r => round5(price * r)),
    buyback: ECONOMY.tollRate.map((_, lv) => round5((price + upgrade * lv) * ECONOMY.buybackRate)),
  };
}

export const TILES = LAYOUT.map(([type, , price, region], i) => ({
  i, type, name: WORLD_NAMES[i], short: shortName(WORLD_NAMES[i]), country: PORT_COUNTRIES[WORLD_NAMES[i]],
  ...(type === 'port' ? { region, ...portNumbers(price) } : {}),
}));
export const BOARD_SIZE = TILES.length;
export const LEGACY_BOARD_SIZE = 24;
export const PORT_IDS = TILES.filter(t => t.type === 'port').map(t => t.i);
export const REGION_PORTS = Object.fromEntries(Object.keys(REGIONS).map(region => [region, PORT_IDS.filter(i => TILES[i].region === region)]));
export const boardSizeOf = g => g.boardSize ?? LEGACY_BOARD_SIZE;
export const levelLimit = g => boardSizeOf(g) === LEGACY_BOARD_SIZE ? 2 : ECONOMY.maxLevel;
const LEGACY_TILES = TILES.slice(0, LEGACY_BOARD_SIZE).map((t, i) => {
  const name = LAYOUT[i][1];
  return { ...t, name, short: shortName(name), country: undefined };
});
const KOREA_CITIES = [
  '서울 출발', '서울', '인천', '수도권 물류센터', '수원', '황금 카드',
  '춘천', '강릉', '황금 카드', '속초', '강원 물류센터', '대전', '황금 카드',
  '세종', '청주', '충청 물류센터', '전주', '황금 카드', '광주', '목포', '호남 물류센터',
  '여수', '황금 카드', '순천', '구금소', '대구', '안동', '영남 물류센터',
  '포항', '지역 관리비', '황금 카드', '부산', '전국 여행', '울산', '창원',
  '지역 기금', '제주시', '황금 카드', '서귀포', '성산',
];
const KOREA_REGIONS = { west: '수도권', north: '강원', east: '충청', south: '호남 서부', cape: '호남 남해안', isles: '경북', strait: '부울경', ocean: '제주' };
const GLOBAL_OVERRIDES = { 0: '세계 항로 출발', 1: '케이프타운', 2: '몸바사', 3: '아프리카 물류센터', 4: '잔지바르', 24: '구금소', 32: '세계 일주' };
const PUBLIC_COUNTRIES = { 1: '남아프리카공화국', 2: '케냐', 4: '탄자니아' };
const SPECIAL_SHORT = { start: '출발', market: '화물', event: '카드', shelter: '구금소', charter: '여행', tax: '관리비', fund: '기금', bet: '홀짝' };
function themeTiles(theme) {
  return TILES.map(t => {
    const korea = theme === 'korea';
    const type = t.i === 37 ? 'bet' : t.type;
    const name = type === 'bet' ? '홀짝 승부' : korea ? KOREA_CITIES[t.i] : type === 'event' ? '황금 카드' : GLOBAL_OVERRIDES[t.i] || t.name;
    return { ...t, type, name, short: SPECIAL_SHORT[type] || name,
      country: korea ? (t.type === 'port' ? '대한민국' : undefined) : PUBLIC_COUNTRIES[t.i] || t.country };
  });
}
const THEME_TILES = { korea: themeTiles('korea'), world: themeTiles('world') };
export const tilesOf = g => g.boardSize ? THEME_TILES[g.settings?.theme] || TILES : LEGACY_TILES;
export const regionNameOf = (g, region) => {
  if (!g.boardSize) return LEGACY_REGION_NAMES[region];
  if (g.settings?.theme === 'korea') return KOREA_REGIONS[region];
  return g.settings?.theme === 'world' && region === 'west' ? '아프리카' : REGIONS[region].name;
};

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
  { id: 'catamaran', name: '쌍동선', color: '#ff8acb' },
  { id: 'ferry', name: '여객선', color: '#87bdff' },
  { id: 'cargo', name: '화물선', color: '#9ddd73' },
  { id: 'sub', name: '잠수함', color: '#ffad70' },
];

export function defaultHarborSettings() {
  return { rounds: 10, timeLimit: 60, theme: 'world' };
}
export function normalizeHarborSettings(input) {
  const s = input && typeof input === 'object' ? input : {};
  const d = defaultHarborSettings();
  return {
    rounds: ROUND_OPTIONS.includes(Number(s.rounds)) ? Number(s.rounds) : d.rounds,
    timeLimit: TIME_OPTIONS.includes(Number(s.timeLimit)) ? Number(s.timeLimit) : d.timeLimit,
    theme: Object.hasOwn(THEMES, s.theme) ? s.theme : d.theme,
  };
}

// 시간 초과·연결 끊김 시 적용할 기본 행동 설명 (화면 안내용)
export const DEFAULT_ACTION_TEXT = {
  order: '순서 주사위 굴리기',
  roll: '주사위 굴리기',
  buy: '지나가기',
  upgrade: '지나가기',
  market: '지나가기',
  settle: '환매가가 가장 낮은 항구 매각',
  takeover: '인수 없이 출항',
  charter: '쾌속선 이용 없이 출항',
  shelter: '주사위로 탈출 시도',
  bet: '베팅 없이 지나가기',
};
