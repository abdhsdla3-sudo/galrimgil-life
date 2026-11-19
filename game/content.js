// 게임 콘텐츠 데이터 (서버·클라이언트 공용, 순수 데이터)
// 금액 단위: 만원(정수)

export const STATS = { smart: '지성', body: '체력', sense: '감성', social: '사교' };
export const STAT_KEYS = Object.keys(STATS);
export const STAT_MAX = 12;
export const STAGES = { growth: '성장기', early: '성인 전반', late: '성인 후반' };

export const PACKS = {
  extraJobs: { name: '추가 진로', desc: '의사·크리에이터·스마트팜 농부 직업과 각 직업 전용 사건이 추가됩니다.' },
  special: { name: '특별 지역', desc: '성인기마다 2칸 더 긴 대신 큰 기회·위험이 있는 "바람섬" 우회로가 생깁니다.' },
  joint: { name: '공동 사건', desc: '"모두의 광장" 칸에서 전원이 동시에 기부·투자·참석을 선택하는 사건이 열립니다.' },
  extra: { name: '확장 사건', desc: '연쇄 사건과 상황별 사건이 더 늘어납니다. 추가 진로와 함께 켜면 직업 연계 사건도 등장합니다.' },
};

export const PLAYER_COLORS = ['#e4572e', '#2e86ab', '#f3a712', '#4caf50', '#9c27b0', '#00a6a6', '#d81b60', '#795548', '#3f51b5', '#8bc34a', '#ff7043', '#607d8b'];
export const PLAYER_MARKS = ['●', '▲', '■', '◆', '★', '♥', '♣', '♠', '✚', '⬟', '☾', '✿'];

// ---------- 직업 ----------
// type: stable(조건 충족 승진) / challenge(판정 승진) / growth(성과 누적 승진) / free(아르바이트)
export const JOBS = {
  office: { name: '회사원', type: 'stable', req: { smart: 3, social: 2 }, ranks: ['사원', '대리', '과장', '부장', '임원'], salary: [30, 39, 51, 65, 82], promo: { stats: ['smart', 'social'], sum: [7, 9, 11, 13] }, desc: '두 능력 합이 기준을 넘으면 월급날 자동 승진. 구조조정 위험이 조금 있다.' },
  civil: { name: '공무원', type: 'stable', req: { smart: 4 }, ranks: ['9급', '7급', '5급', '과장', '국장'], salary: [28, 34, 42, 52, 66], promo: { stats: ['smart'], sum: [5, 6, 8, 10] }, safe: true, desc: '실직하지 않는 안정 직업. 월급 상승폭은 작다.' },
  nurse: { name: '간호사', type: 'stable', req: { body: 3, social: 3 }, ranks: ['신규', '일반', '책임', '수간호사', '간호부장'], salary: [33, 42, 53, 66, 81], promo: { stats: ['body', 'social'], sum: [7, 9, 11, 14] }, desc: '체력과 사교 합으로 승진. 야간 근무 사건이 있다.' },
  teacher: { name: '교사', type: 'stable', req: { smart: 4, social: 3 }, degree: true, ranks: ['신규 교사', '담임', '부장 교사', '교감', '교장'], salary: [30, 38, 48, 60, 74], promo: { stats: ['smart', 'social'], sum: [9, 11, 13, 15] }, safe: true, desc: '학위 필요. 실직하지 않으며 추억을 얻는 사건이 많다.' },
  athlete: { name: '운동선수', type: 'challenge', req: { body: 5 }, ranks: ['연습생', '2군', '1군', '스타', '전설'], salary: [15, 35, 70, 120, 180], promo: { stat: 'body', target: [6, 8, 10, 12] }, desc: '월급날·직업 칸에서 승진 도전(주사위+체력). 연속 2회 실패 시 강등. 성인 후반에 은퇴 사건.' },
  musician: { name: '뮤지션', type: 'challenge', req: { sense: 5 }, ranks: ['버스커', '인디', '데뷔', '히트메이커', '레전드'], salary: [12, 30, 65, 115, 170], promo: { stat: 'sense', target: [6, 8, 10, 12] }, desc: '감성으로 승진 도전. 대박과 슬럼프가 극단적이다.' },
  founder: { name: '창업가', type: 'challenge', req: { social: 3, sense: 3 }, startCost: 60, ranks: ['예비 창업', '스타트업', '성장 기업', '중견 기업', '유니콘'], salary: [23, 39, 65, 107, 165], promo: { stat: 'social', target: [5, 7, 9, 12] }, desc: '시작 비용 60. 사교로 투자 유치 도전. 실패하면 폐업 위험.' },
  chef: { name: '요리사', type: 'growth', req: { sense: 2, body: 2 }, ranks: ['보조', '라인 쿡', '수셰프', '셰프', '오너 셰프'], salary: [26, 36, 49, 66, 86], promo: { xp: [3, 6, 10, 15] }, desc: '월급날마다 성과 +1, 직업 사건으로 추가 성과. 성과가 쌓이면 승진.' },
  developer: { name: '개발자', type: 'growth', req: { smart: 3, sense: 2 }, ranks: ['주니어', '미들', '시니어', '리드', 'CTO'], salary: [30, 42, 56, 72, 92], promo: { xp: [3, 6, 10, 15] }, desc: '성과 누적형. 야근 사건이 번아웃을 부를 수 있다.' },
  researcher: { name: '연구원', type: 'growth', req: { smart: 5 }, degree: true, ranks: ['연구 보조', '연구원', '선임', '책임', '연구소장'], salary: [28, 38, 52, 70, 90], promo: { xp: [3, 6, 10, 15] }, desc: '학위 필요. 논문·특허 사건으로 큰 성과를 얻는다.' },
  doctor: { name: '의사', type: 'stable', pack: 'extraJobs', req: { smart: 7 }, degree: true, ranks: ['인턴', '레지던트', '전문의', '과장', '병원장'], salary: [30, 43, 68, 90, 115], promo: { stats: ['smart', 'body'], sum: [10, 12, 14, 16] }, desc: '학위·지성 7 필요. 초반 월급은 낮고 후반이 높다.' },
  creator: { name: '크리에이터', type: 'challenge', pack: 'extraJobs', req: { sense: 3, social: 3 }, ranks: ['새싹', '실버', '골드', '다이아', '레전드'], salary: [23, 38, 62, 97, 145], promo: { stat: 'sense', target: [5, 7, 9, 12] }, desc: '구독자 판정으로 승진. 논란 사건에 주의.' },
  farmer: { name: '스마트팜 농부', type: 'growth', pack: 'extraJobs', req: { body: 3 }, ranks: ['귀농 1년차', '재배사', '농장주', '브랜드 농장', '농업 법인'], salary: [25, 35, 48, 64, 83], promo: { xp: [3, 6, 10, 15] }, desc: '날씨 사건에 영향. 수확 사건으로 성과가 크게 쌓인다.' },
  parttime: { name: '아르바이트', type: 'free', req: {}, ranks: ['아르바이트'], salary: [18], promo: null, desc: '조건 없음. 언제든 재취업 기회로 이어지는 회복 경로.' },
};
export const JOB_TYPE_NAMES = { stable: '조건형', challenge: '도전형', growth: '축적형', free: '자유형' };

export const JOB_CHANGE_COST = 30; // 전직 교육비

// ---------- 자산 ----------
export const ASSETS = {
  studio: { name: '원룸 오피스텔', cat: 'home', price: 120, value: 120, income: 4, desc: '월급날 임대 수입 4' },
  apartment: { name: '햇살 아파트', cat: 'home', price: 380, value: 400, income: 0, memory: 1, desc: '가치가 높고 구매 시 추억 +1' },
  shop: { name: '골목 상가', cat: 'biz', price: 260, value: 240, income: 16, desc: '월급날 임대 수입 16' },
  car: { name: '중고 자동차', cat: 'car', price: 70, value: 40, income: 0, desc: '보유 시 이동 주사위 최소 2' },
  stock: { name: '우량주 묶음', cat: 'stock', price: 60, value: 60, income: 0, desc: '시장 사건으로 가치 변동' },
  antique: { name: '수상한 골동품', cat: 'treasure', price: 50, value: 50, income: 0, desc: '최종 정산 때 감정(0.2~4배)' },
  islandHouse: { name: '바람섬 별장', cat: 'home', pack: 'special', price: 200, value: 230, income: 8, memory: 1, desc: '섬 전용. 월급날 수입 8, 추억 +1' },
};
export const SHOP_LIST = ['studio', 'apartment', 'shop', 'car', 'stock', 'antique'];

// ---------- 카드 ----------
// timing: turn(내 차례 시작, 주사위 전) / fail(판정 실패 직후) / passive(자동)
export const CARDS = {
  dash: { name: '질주', timing: 'turn', desc: '이번 이동 +2', consumesTurn: false },
  exact: { name: '정조준', timing: 'turn', desc: '이번 이동 칸 수를 1~6 중 직접 선택', needsValue: true },
  lesson: { name: '원데이 클래스', timing: 'turn', desc: '원하는 능력 +1', needsStat: true },
  datePass: { name: '데이트 티켓', timing: 'turn', desc: '만난 사람/연인 호감도 +1 (비용 없음)' },
  cheer: { name: '응원 편지', timing: 'turn', desc: '다른 플레이어 1명에게 "응원받음"(다음 판정 +2) 부여', needsTarget: true },
  referral: { name: '추천서', timing: 'turn', desc: '이번 차례에 전직 상담을 받는다(교육비 면제, 새 직업 2단계 시작)' },
  comeback: { name: '오뚝이', timing: 'turn', desc: '현금 +80, 번아웃·실연 해제. 현금 50 미만이거나 무직일 때만' },
  retry: { name: '다시 한 번', timing: 'fail', desc: '실패한 판정을 한 번 다시 굴린다' },
  insurance: { name: '생활 보험', timing: 'passive', desc: '다음 지출 사건의 손실을 절반으로 줄인다(자동)' },
};
export const HAND_LIMIT = 5;
export const RANDOM_CARD_POOL = ['dash', 'exact', 'lesson', 'datePass', 'cheer', 'retry', 'insurance', 'referral', 'dash', 'retry', 'lesson'];

// ---------- 상태 ----------
// 같은 상태를 다시 얻으면 남은 턴을 큰 값으로 갱신(중첩 없음). 턴 수는 본인 차례가 끝날 때 1 감소.
export const STATUSES = {
  burnout: { name: '번아웃', desc: '이동 -1 (최소 1)', bad: true },
  injured: { name: '부상', desc: '체력 판정 -2', bad: true },
  heartbreak: { name: '실연', desc: '사교 판정 -1, 데이트 불가', bad: true },
  inspired: { name: '영감', desc: '감성 판정 +2' },
  motivated: { name: '의욕 충만', desc: '이동 +1' },
  cheered: { name: '응원받음', desc: '다음 판정 1회 +2 (사용 시 해제)' },
  credit: { name: '신용 경고', desc: '부채가 한도 초과. 자산 구매 불가. 부채가 한도 이하가 되면 해제', bad: true },
};

export const PARTNER_NAMES = ['서하늘', '윤바다', '한가람', '정새벽', '오다온', '문채운', '권나래', '배은솔', '임도윤', '송이현', '류하람', '최별하', '남궁솔', '조은결', '황보담', '노을빛'];
export const CHILD_NAMES = ['콩이', '별이', '봄이', '솔이', '단비', '하랑', '도담', '아라', '가온', '누리'];

// ---------- 성장기 성향 / 성인 시작 배경 ----------
export const TEMPERAMENTS = [
  { label: '책벌레', desc: '지성 +2', effects: [{ stat: { smart: 2 } }] },
  { label: '골목대장', desc: '체력 +2', effects: [{ stat: { body: 2 } }] },
  { label: '공상가', desc: '감성 +2', effects: [{ stat: { sense: 2 } }] },
  { label: '인싸', desc: '사교 +2', effects: [{ stat: { social: 2 } }] },
];
export const BACKGROUNDS = [
  { label: '대학 졸업', desc: '지성 5·사교 3·감성 2·체력 2, 학위, 현금 60, 학자금 부채 120', set: { smart: 5, social: 3, sense: 2, body: 2 }, cash: 60, debt: 120, degree: true },
  { label: '체육 특기생', desc: '체력 6·사교 3·지성 2·감성 2, 현금 100', set: { body: 6, social: 3, smart: 2, sense: 2 }, cash: 100 },
  { label: '예술 전공', desc: '감성 6·사교 3·지성 2·체력 2, 현금 80, 카드 "영감" 대신 원데이 클래스', set: { sense: 6, social: 3, smart: 2, body: 2 }, cash: 80, card: 'lesson' },
  { label: '사회 경험파', desc: '사교 5·체력 3·지성 3·감성 2, 현금 160', set: { social: 5, body: 3, smart: 3, sense: 2 }, cash: 160 },
];

// ---------- 칸 종류 ----------
export const SPACE_TYPES = {
  start: { name: '출발', icon: '🚩' },
  event: { name: '사건', icon: '❔' },
  study: { name: '배움', icon: '📘' },
  play: { name: '놀이', icon: '⚽' },
  art: { name: '창작', icon: '🎨' },
  friend: { name: '친구', icon: '🤝' },
  lucky: { name: '행운', icon: '🍀' },
  risk: { name: '위기', icon: '⚡' },
  card: { name: '카드', icon: '🃏' },
  allowance: { name: '용돈', icon: '🪙' },
  payday: { name: '월급날', icon: '💰' },
  job: { name: '직장', icon: '💼' },
  love: { name: '인연', icon: '💗' },
  shop: { name: '마켓', icon: '🏠' },
  together: { name: '모두의 광장', icon: '🎪' },
  island: { name: '바람섬', icon: '🏝' },
  gate: { name: '관문', icon: '⛩' },
  goal: { name: '은퇴', icon: '🏁' },
};

// ---------- 사건 ----------
// when: 발생 조건 / weight: 가중치 / once: 1회만 / cooldown: 재발생까지 내 차례 수 / pack: 콘텐츠 팩
// options[].check: { stat, target } 주사위(1~6)+능력 >= target 이면 성공
export const EVENTS = [
  // ===== 성장기: 배움 =====
  { id: 'g_study_quiz', spaces: ['study'], stages: ['growth'], title: '받아쓰기 대회', text: '반 대표로 받아쓰기 대회에 나가게 되었다.', options: [
    { label: '밤새 연습한다', check: { stat: 'smart', target: 6 }, success: [{ stat: { smart: 2 } }, { memory: 1 }], fail: [{ stat: { smart: 1 } }] , default: true },
    { label: '친구들과 같이 공부', effects: [{ stat: { smart: 1, social: 1 } }] },
  ] },
  { id: 'g_study_library', spaces: ['study'], stages: ['growth'], title: '도서관의 비밀 서가', text: '도서관 구석에서 오래된 과학 잡지를 발견했다.', options: [
    { label: '끝까지 읽는다', effects: [{ stat: { smart: 2 } }], default: true },
    { label: '그림만 따라 그린다', effects: [{ stat: { sense: 2 } }] },
  ] },
  { id: 'g_study_tutor', spaces: ['study'], stages: ['growth'], title: '과외 제안', text: '부모님이 과외를 붙여 줄지 물어보신다.', options: [
    { label: '과외 받기', cost: 10, desc: '현금 -10', effects: [{ stat: { smart: 2 } }] },
    { label: '혼자 해 볼게요', check: { stat: 'smart', target: 5 }, success: [{ stat: { smart: 2 } }], fail: [{ status: 'burnout', turns: 1 }], default: true },
  ] },
  { id: 'g_study_olympiad', spaces: ['study'], stages: ['growth'], when: { minStat: { smart: 4 } }, once: true, title: '과학 올림피아드', text: '선생님이 올림피아드 출전을 권했다.', options: [
    { label: '도전한다', check: { stat: 'smart', target: 9 }, success: [{ stat: { smart: 2 } }, { cash: 30 }, { flag: 'olympiad' }, { memory: 1 }], fail: [{ stat: { smart: 1 } }], default: true },
    { label: '이번엔 쉰다', effects: [{ status: 'motivated', turns: 1 }] },
  ] },
  // ===== 성장기: 놀이 =====
  { id: 'g_play_soccer', spaces: ['play'], stages: ['growth'], title: '운동장 축구', text: '점심시간, 축구 경기에 한 명이 모자라다.', options: [
    { label: '공격수로 뛴다', check: { stat: 'body', target: 6 }, success: [{ stat: { body: 2 } }, { memory: 1 }], fail: [{ stat: { body: 1 } }, { status: 'injured', turns: 1 }], default: true },
    { label: '응원단장이 된다', effects: [{ stat: { social: 2 } }] },
  ] },
  { id: 'g_play_tree', spaces: ['play'], stages: ['growth'], title: '뒷산 나무 타기', text: '친구들이 뒷산 큰 나무 꼭대기에 올라가자고 한다.', options: [
    { label: '올라간다', check: { stat: 'body', target: 5 }, success: [{ stat: { body: 2 } }], fail: [{ status: 'injured', turns: 2 }], default: true },
    { label: '아래에서 지도를 그린다', effects: [{ stat: { sense: 1, smart: 1 } }] },
  ] },
  { id: 'g_play_club', spaces: ['play'], stages: ['growth'], when: { minStat: { body: 4 } }, once: true, title: '스카우트 제의', text: '체육 선생님이 운동부 입단을 권한다.', options: [
    { label: '운동부 입단', effects: [{ stat: { body: 2 } }, { flag: 'sportsClub' }], next: 'g_chain_tournament', default: true },
    { label: '취미로만 할래요', effects: [{ stat: { body: 1, social: 1 } }] },
  ] },
  { id: 'g_chain_tournament', chainOnly: true, spaces: ['play', 'event', 'study', 'art', 'friend'], stages: ['growth'], title: '운동부 첫 대회', text: '운동부에서 처음으로 지역 대회에 나간다.', options: [
    { label: '주전으로 출전', check: { stat: 'body', target: 8 }, success: [{ stat: { body: 2 } }, { cash: 20 }, { memory: 1 }, { flag: 'medal' }], fail: [{ stat: { body: 1 } }, { memory: 1 }], default: true },
  ] },
  // ===== 성장기: 창작 =====
  { id: 'g_art_contest', spaces: ['art'], stages: ['growth'], title: '그림 공모전', text: '동네 그림 공모전 포스터가 붙었다.', options: [
    { label: '출품한다', check: { stat: 'sense', target: 6 }, success: [{ stat: { sense: 2 } }, { cash: 15 }], fail: [{ stat: { sense: 1 } }], default: true },
    { label: '친구 작품을 돕는다', effects: [{ stat: { sense: 1, social: 1 } }] },
  ] },
  { id: 'g_art_band', spaces: ['art'], stages: ['growth'], title: '방과 후 밴드', text: '학교 밴드가 보컬을 찾는다.', options: [
    { label: '오디션 본다', check: { stat: 'sense', target: 7 }, success: [{ stat: { sense: 2, social: 1 } }, { flag: 'band' }, { memory: 1 }], fail: [{ stat: { sense: 1 } }], default: true },
    { label: '관객으로 즐긴다', effects: [{ status: 'inspired', turns: 2 }] },
  ] },
  { id: 'g_art_diary', spaces: ['art'], stages: ['growth'], title: '그림일기', text: '방학 숙제로 매일 그림일기를 쓰게 되었다.', options: [
    { label: '꼼꼼히 쓴다', effects: [{ stat: { sense: 1, smart: 1 } }], default: true },
    { label: '몰아서 쓴다', check: { stat: 'sense', target: 5 }, success: [{ stat: { sense: 2 } }], fail: [{ memory: 1 }] },
  ] },
  // ===== 성장기: 친구 =====
  { id: 'g_friend_new', spaces: ['friend'], stages: ['growth'], title: '전학생', text: '낯선 동네에서 전학생이 왔다.', options: [
    { label: '먼저 말을 건다', effects: [{ stat: { social: 2 } }, { memory: 1 }], default: true },
    { label: '쪽지를 건넨다', effects: [{ stat: { social: 1, sense: 1 } }] },
  ] },
  { id: 'g_friend_fight', spaces: ['friend'], stages: ['growth'], title: '절친과 다툼', text: '사소한 일로 절친과 말다툼을 했다.', options: [
    { label: '먼저 사과한다', check: { stat: 'social', target: 5 }, success: [{ stat: { social: 2 } }, { memory: 1 }], fail: [{ stat: { social: 1 } }], default: true },
    { label: '혼자 생각해 본다', effects: [{ stat: { smart: 1, sense: 1 } }] },
  ] },
  { id: 'g_friend_president', spaces: ['friend'], stages: ['growth'], when: { minStat: { social: 4 } }, once: true, title: '반장 선거', text: '친구들이 반장 선거에 나가라고 부추긴다.', options: [
    { label: '출마한다', check: { stat: 'social', target: 8 }, success: [{ stat: { social: 2, smart: 1 } }, { flag: 'president' }, { memory: 1 }], fail: [{ stat: { social: 1 } }], default: true },
    { label: '친구 선거 캠프장', effects: [{ stat: { social: 1 } }, { card: 'cheer' }] },
  ] },
  // ===== 성장기: 일반 =====
  { id: 'g_ev_lost', spaces: ['event'], stages: ['growth'], title: '길 잃은 강아지', text: '하굣길에 길 잃은 강아지를 만났다.', options: [
    { label: '주인을 찾아 준다', effects: [{ stat: { social: 1 } }, { cash: 10 }, { memory: 1 }], default: true },
    { label: '집에 데려가자고 조른다', check: { stat: 'social', target: 6 }, success: [{ pet: true }, { memory: 2 }], fail: [{ memory: 1 }] },
  ] },
  { id: 'g_ev_game', spaces: ['event'], stages: ['growth'], title: '게임기 유혹', text: '친구가 새 게임기를 빌려 주겠다고 한다.', options: [
    { label: '빌려서 실컷 논다', effects: [{ status: 'motivated', turns: 1 }, { memory: 1 }] },
    { label: '숙제 먼저', effects: [{ stat: { smart: 1 } }], default: true },
  ] },
  { id: 'g_ev_market', spaces: ['event'], stages: ['growth'], title: '벼룩시장', text: '학교 벼룩시장에서 물건을 팔 수 있다.', options: [
    { label: '장난감을 판다', check: { stat: 'social', target: 5 }, success: [{ cash: 25 }], fail: [{ cash: 5 }], default: true },
    { label: '손수 만든 팔찌를 판다', check: { stat: 'sense', target: 6 }, success: [{ cash: 30 }, { stat: { sense: 1 } }], fail: [{ stat: { sense: 1 } }] },
  ] },
  { id: 'g_ev_sick', spaces: ['event', 'risk'], stages: ['growth'], title: '독감', text: '독감에 걸려 일주일을 앓았다.', effects: [{ status: 'injured', turns: 1 }, { stat: { smart: 1 } }], auto: true },
  { id: 'g_risk_broken', spaces: ['risk'], stages: ['growth'], title: '깨진 유리창', text: '공놀이를 하다 이웃집 유리창을 깼다.', options: [
    { label: '솔직하게 사과하고 변상', cost: 15, effects: [{ stat: { social: 1 } }], default: true },
    { label: '모른 척한다', check: { stat: 'body', target: 7 }, success: [], fail: [{ cash: -30 }, { stat: { social: -1 } }] },
  ] },
  { id: 'g_risk_slump', spaces: ['risk'], stages: ['growth'], title: '성적 하락', text: '시험을 망쳐 기운이 빠졌다.', options: [
    { label: '다시 마음을 잡는다', check: { stat: 'smart', target: 6 }, success: [{ stat: { smart: 1 } }, { status: 'motivated', turns: 1 }], fail: [{ status: 'burnout', turns: 1 }], default: true },
    { label: '취미로 기분 전환', effects: [{ stat: { sense: 1 } }] },
  ] },
  { id: 'g_lucky_talent', spaces: ['lucky'], stages: ['growth'], title: '숨은 재능 발견', text: '우연히 해 본 일에 놀라운 재능을 보였다.', options: [
    { label: '지성 +2', effects: [{ stat: { smart: 2 } }], default: true },
    { label: '체력 +2', effects: [{ stat: { body: 2 } }] },
    { label: '감성 +2', effects: [{ stat: { sense: 2 } }] },
    { label: '사교 +2', effects: [{ stat: { social: 2 } }] },
  ] },
  { id: 'g_lucky_grandma', spaces: ['lucky'], stages: ['growth'], title: '할머니의 용돈', text: '시골 할머니 댁에서 두둑한 용돈을 받았다.', effects: [{ cash: 30 }, { memory: 1 }], auto: true },

  // ===== 성인: 일반 사건 =====
  { id: 'a_ev_reunion', spaces: ['event'], stages: ['early', 'late'], title: '동창 모임', text: '오랜만에 동창 모임 연락이 왔다.', options: [
    { label: '참석한다', cost: 10, effects: [{ stat: { social: 1 } }, { memory: 1 }], default: true },
    { label: '일이 바빠 거절', effects: [{ xp: 1 }] },
  ] },
  { id: 'a_ev_course', spaces: ['event', 'study'], stages: ['early', 'late'], title: '야간 강좌', text: '퇴근 후 들을 수 있는 강좌가 열렸다.', options: [
    { label: '경영 강좌', cost: 15, effects: [{ stat: { smart: 1, social: 1 } }] },
    { label: '요가 강좌', cost: 15, effects: [{ stat: { body: 2 } }] },
    { label: '사진 강좌', cost: 15, effects: [{ stat: { sense: 2 } }] },
    { label: '이번엔 쉰다', effects: [], default: true },
  ] },
  { id: 'a_ev_moving', spaces: ['event'], stages: ['early', 'late'], title: '이사 철', text: '집주인이 보증금을 올려 달라고 한다.', options: [
    { label: '올려 준다', cost: 30, effects: [], default: true },
    { label: '협상한다', check: { stat: 'social', target: 7 }, success: [{ cash: -5 }], fail: [{ cash: -45 }] },
  ] },
  { id: 'a_ev_hobby', spaces: ['event'], stages: ['early', 'late'], title: '주말 취미', text: '주말에 새 취미를 시작해 볼까?', options: [
    { label: '등산 동호회', effects: [{ stat: { body: 1 } }, { memory: 1 }], default: true },
    { label: '밴드 동호회', cost: 10, effects: [{ stat: { sense: 1, social: 1 } }, { memory: 1 }] },
    { label: '부업 공부', effects: [{ stat: { smart: 1 } }, { cash: 10 }] },
  ] },
  { id: 'a_ev_volunteer', spaces: ['event'], stages: ['early', 'late'], title: '봉사 활동', text: '동네 복지관에서 일손이 필요하다.', options: [
    { label: '참여한다', effects: [{ stat: { social: 1 } }, { memory: 2 }], default: true },
    { label: '기부로 대신', cost: 20, effects: [{ memory: 1 }, { card: 'random' }] },
  ] },
  { id: 'a_ev_lottery', spaces: ['event'], stages: ['early', 'late'], cooldown: 4, title: '복권 한 장', text: '편의점에서 복권을 살까 고민된다.', options: [
    { label: '산다 (5)', cost: 5, check: { stat: 'luck', target: 6 }, success: [{ cash: 60 }], fail: [], desc: '주사위 6이 나오면 +60' },
    { label: '사지 않는다', effects: [], default: true },
  ] },
  { id: 'a_ev_parents', spaces: ['event'], stages: ['late'], title: '부모님 건강', text: '부모님이 건강 검진에서 재검 판정을 받으셨다.', options: [
    { label: '휴가 내고 돌본다', effects: [{ memory: 2 }, { xp: -1 }], default: true },
    { label: '좋은 병원비를 댄다', cost: 40, effects: [{ memory: 1 }] },
  ] },
  { id: 'a_ev_health', spaces: ['event', 'risk'], stages: ['late'], title: '건강 신호', text: '요즘 쉽게 지친다.', options: [
    { label: '운동을 시작한다', effects: [{ stat: { body: 1 } }], default: true },
    { label: '종합 검진', cost: 20, effects: [{ status: 'motivated', turns: 2 }] },
  ] },
  { id: 'a_ev_neighbor', spaces: ['event'], stages: ['early', 'late'], title: '층간 소음', text: '윗집 소음이 계속된다.', options: [
    { label: '정중히 대화', check: { stat: 'social', target: 6 }, success: [{ stat: { social: 1 } }, { memory: 1 }], fail: [{ status: 'burnout', turns: 1 }], default: true },
    { label: '이어폰을 산다', cost: 10, effects: [] },
  ] },
  // ===== 성인: 위기 =====
  { id: 'a_risk_phone', spaces: ['risk'], stages: ['early', 'late'], title: '휴대폰 파손', text: '휴대폰을 떨어뜨려 화면이 깨졌다.', effects: [{ cash: -25 }], auto: true },
  { id: 'a_risk_scam', spaces: ['risk'], stages: ['early', 'late'], title: '수상한 투자 권유', text: '"원금 보장 300%" 투자 권유 문자가 왔다.', options: [
    { label: '무시한다', effects: [{ stat: { smart: 1 } }], default: true },
    { label: '조금만 넣어 본다', cost: 40, check: { stat: 'smart', target: 9 }, success: [{ cash: 50 }], fail: [{ status: 'burnout', turns: 1 }] },
  ] },
  { id: 'a_risk_accident', spaces: ['risk'], stages: ['early', 'late'], title: '교통사고', text: '빗길에 접촉 사고가 났다.', options: [
    { label: '보험 처리', cost: 20, effects: [], default: true },
    { label: '직접 합의', check: { stat: 'social', target: 7 }, success: [{ cash: -5 }], fail: [{ cash: -50 }, { status: 'injured', turns: 1 }] },
  ] },
  { id: 'a_risk_restructure', spaces: ['risk', 'job'], stages: ['early', 'late'], when: { hasJob: true, notSafeJob: true, notJobType: 'free' }, cooldown: 6, title: '구조조정 바람', text: '회사가 대규모 구조조정을 발표했다.', options: [
    { label: '성과로 버틴다', check: { stat: 'smart', target: 7 }, success: [{ xp: 1 }], fail: [{ loseJob: true }], default: true },
    { label: '희망퇴직 신청 (위로금 +80)', effects: [{ loseJob: true }, { cash: 80 }] },
  ] },
  { id: 'a_risk_burnout', spaces: ['risk'], stages: ['early', 'late'], when: { hasJob: true }, title: '끝없는 야근', text: '몇 주째 야근이 이어지고 있다.', options: [
    { label: '버틴다', effects: [{ xp: 2 }, { status: 'burnout', turns: 2 }] },
    { label: '휴가를 쓴다', effects: [{ memory: 1 }], default: true },
  ] },
  { id: 'a_risk_market', spaces: ['risk'], stages: ['early', 'late'], when: { hasAssetCat: 'stock' }, title: '주가 급락', text: '시장이 크게 흔들렸다.', effects: [{ assetValue: { cat: 'stock', pct: -40 } }], auto: true },
  { id: 'a_risk_repair', spaces: ['risk'], stages: ['early', 'late'], when: { hasAssetCat: 'home' }, title: '배관 누수', text: '집 배관이 터졌다.', effects: [{ cash: -35 }], auto: true },
  // ===== 성인: 행운 =====
  { id: 'a_lucky_bonus', spaces: ['lucky'], stages: ['early', 'late'], when: { hasJob: true }, title: '특별 상여금', text: '회사 실적이 좋아 특별 상여금이 나왔다.', effects: [{ payday: true }], auto: true },
  { id: 'a_lucky_found', spaces: ['lucky'], stages: ['early', 'late'], title: '잊고 있던 적금', text: '오래 전 들어 둔 적금이 만기되었다.', effects: [{ cash: 50 }], auto: true },
  { id: 'a_lucky_boom', spaces: ['lucky'], stages: ['early', 'late'], when: { hasAssetCat: 'home' }, title: '동네 개발 호재', text: '집 근처에 지하철역이 생긴다!', effects: [{ assetValue: { cat: 'home', pct: 30 } }], auto: true },
  { id: 'a_lucky_stock', spaces: ['lucky'], stages: ['early', 'late'], when: { hasAssetCat: 'stock' }, title: '주가 상승', text: '보유한 주식이 크게 올랐다.', effects: [{ assetValue: { cat: 'stock', pct: 60 } }], auto: true },
  { id: 'a_lucky_gift', spaces: ['lucky'], stages: ['early', 'late'], title: '행운의 응모', text: '응모했던 경품에 당첨되었다.', options: [
    { label: '현금으로 받는다 (+40)', effects: [{ cash: 40 }], default: true },
    { label: '카드 2장으로 받는다', effects: [{ card: 'random' }, { card: 'random' }] },
  ] },
  { id: 'a_lucky_party', spaces: ['lucky'], stages: ['early', 'late'], title: '집들이 초대', text: '모두를 집들이에 초대했다. 다들 선물을 들고 왔다!', effects: [{ fromOthers: 10 }, { memory: 1 }], auto: true },
  { id: 'a_lucky_treat', spaces: ['lucky'], stages: ['early', 'late'], title: '한턱 내기', text: '기분 좋은 일이 생겼다. 모두에게 한턱 낼까?', options: [
    { label: '한턱 낸다', effects: [{ toOthers: 8 }, { stat: { social: 1 } }, { memory: 1 }], default: true },
    { label: '조용히 축하', effects: [{ cash: 10 }] },
  ] },
  // ===== 성인: 배움 =====
  { id: 'a_study_cert', spaces: ['study'], stages: ['early', 'late'], title: '자격증 시험', text: '업무에 도움이 될 자격증 시험이 있다.', options: [
    { label: '응시한다', cost: 10, check: { stat: 'smart', target: 7 }, success: [{ stat: { smart: 2 } }, { xp: 1 }], fail: [{ stat: { smart: 1 } }], default: true },
    { label: '다음에', effects: [] },
  ] },
  { id: 'a_study_grad', spaces: ['study'], stages: ['early'], when: { notFlag: 'degree' }, once: true, title: '야간 대학', text: '일과 병행할 수 있는 야간 대학 과정이 있다.', options: [
    { label: '입학한다 (학위 취득)', cost: 80, effects: [{ degree: true }, { stat: { smart: 1 } }, { status: 'burnout', turns: 1 }] },
    { label: '지금은 아니다', effects: [], default: true },
  ] },
  { id: 'a_study_gym', spaces: ['study'], stages: ['early', 'late'], title: '퍼스널 트레이닝', text: '헬스장에서 PT 할인 행사를 한다.', options: [
    { label: '등록한다', cost: 20, effects: [{ stat: { body: 2 } }], default: true },
    { label: '홈트로 버틴다', check: { stat: 'body', target: 6 }, success: [{ stat: { body: 1 } }], fail: [] },
  ] },
  // ===== 성인: 인연 =====
  { id: 'a_love_meet', spaces: ['love', 'event', 'friend'], weight: 1.5, stages: ['early', 'late'], when: { relation: ['single'] }, title: '새로운 만남', text: '친구 소개로 {newPartner}님을 만났다.', options: [
    { label: '연락처를 교환한다', effects: [{ meet: true }, { affection: 1 }], default: true },
    { label: '일에 집중한다', effects: [{ xp: 1 }] },
  ] },
  { id: 'a_love_date', spaces: ['love', 'event'], weight: 1.5, stages: ['early', 'late'], when: { relation: ['met', 'dating'], notStatus: 'heartbreak' }, title: '{partner}님과 데이트', text: '{partner}님과 주말 약속을 잡았다.', options: [
    { label: '근사한 레스토랑', cost: 25, effects: [{ affection: 2 }] },
    { label: '한강 산책', check: { stat: 'social', target: 6 }, success: [{ affection: 2 }], fail: [{ affection: 1 }], default: true },
    { label: '바빠서 미룬다', effects: [{ affection: -1 }, { xp: 1 }] },
  ] },
  { id: 'a_love_propose', spaces: ['love', 'event'], stages: ['early', 'late'], when: { relation: ['dating'], minAffection: 3 }, weight: 3, title: '프러포즈의 순간', text: '{partner}님과 함께한 시간이 쌓였다. 마음을 전할까?', options: [
    { label: '프러포즈한다', check: { stat: 'social', target: 9, affectionBonus: true }, success: [{ marry: true }], fail: [{ affection: -1 }], default: true },
    { label: '조금 더 기다린다', effects: [{ affection: 1 }] },
  ] },
  { id: 'a_love_family', spaces: ['love'], stages: ['early', 'late'], when: { relation: ['married'] }, cooldown: 2, title: '가족 회의', text: '{partner}님과 앞으로의 가족 계획을 이야기했다.', options: [
    { label: '아이를 갖자', when: { maxChildren: 1 }, effects: [{ child: 1 }], desc: '자녀 +1 (월급날마다 양육비 6, 정산 +60·추억)' },
    { label: '둘만의 여행', cost: 30, effects: [{ memory: 2 }], default: true },
    { label: '반려동물 입양', when: { noPet: true }, effects: [{ pet: true }, { memory: 1 }] },
  ] },
  { id: 'a_love_child', spaces: ['love', 'event'], stages: ['early', 'late'], when: { minChildren: 1 }, cooldown: 3, title: '아이의 성장', text: '{child}가 학교에서 상장을 받아 왔다!', options: [
    { label: '크게 축하한다', cost: 15, effects: [{ memory: 2 }], default: true },
    { label: '학원을 보낸다', cost: 30, effects: [{ childBoost: 1 }], desc: '자녀 정산 보너스 +30' },
  ] },
  { id: 'a_life_relationship', turnOnly: true, spaces: ['love'], stages: ['early', 'late'], when: { relation: ['single', 'met', 'dating'], notStatus: 'heartbreak' }, title: '만남과 데이트', text: '주말에 시간을 내서 인연을 쌓을 수 있다.', options: [
    { label: '친구에게 소개를 부탁한다', when: { relation: ['single'] }, effects: [{ meet: true }, { affection: 1 }] },
    { label: '함께 산책한다', when: { relation: ['met', 'dating'] }, effects: [{ affection: 1 }] },
    { label: '공연을 함께 본다', when: { relation: ['met', 'dating'] }, cost: 24, effects: [{ affection: 2 }, { memory: 1 }] },
    { label: '돌아가기', cancel: true, default: true },
  ] },
  { id: 'a_life_family', turnOnly: true, spaces: ['love'], stages: ['early', 'late'], when: { relation: ['married'] }, title: '가족과 함께', text: '{partner}님과 가족 계획을 세운다.', options: [
    { label: '아이를 맞이한다', when: { maxChildren: 1 }, effects: [{ child: 1 }], desc: '자녀 +1 · 월급날 양육비 6 · 정산 +60' },
    { label: '가족 사진을 찍는다', cost: 20, effects: [{ memory: 2 }, { affection: 1 }] },
    { label: '둘이서 여행을 간다', cost: 45, effects: [{ memory: 3 }, { clearBad: true }] },
    { label: '돌아가기', cancel: true, default: true },
  ] },
  { id: 'a_life_child', turnOnly: true, spaces: ['love'], stages: ['early', 'late'], when: { minChildren: 1 }, title: '자녀 교육과 진로', text: '{child}의 관심사를 키우고 학업과 진로를 도와준다.', options: [
    { label: '교육비를 지원한다', cost: 35, when: { notFlag: 'childEducation' }, effects: [{ flag: 'childEducation' }, { childBoost: 2 }], desc: '자녀 정산 보너스 +60 · 장학금·취업 선택지 열림' },
    { label: '장학금에 지원한다', when: { flag: 'childEducation', notFlag: 'childScholarship', childReady: true }, effects: [{ flag: 'childScholarship' }, { cash: 45 }] },
    { label: '취업 준비를 돕는다', cost: 25, when: { flag: 'childEducation', notFlag: 'childWorking', childReady: true }, effects: [{ flag: 'childWorking' }, { memory: 1 }], desc: '이후 월급날마다 자녀 생활비 지원 +18 · 추억 +1' },
    { label: '돌아가기', cancel: true, default: true },
  ] },
  { id: 'a_child_fair', spaces: ['love', 'event', 'lucky'], stages: ['early', 'late'], when: { minChildren: 1 }, once: true, title: '가족 벼룩시장', text: '{child}와 함께 안 쓰는 물건을 팔아 보기로 했다.', options: [
    { label: '작은 가판대를 꾸민다', cost: 15, check: { stat: 'social', target: 8 }, success: [{ cash: 55 }, { memory: 1 }], fail: [{ cash: 15 }] },
    { label: '함께 구경한다', effects: [{ memory: 1 }], default: true },
  ] },
  { id: 'a_child_recital', spaces: ['love', 'event'], stages: ['early', 'late'], when: { minChildren: 1 }, once: true, title: '첫 발표회', text: '{child}의 발표회에 초대받았다.', options: [
    { label: '꽃을 준비하고 참석한다', cost: 20, effects: [{ memory: 2 }, { stat: { social: 1 } }] },
    { label: '응원 편지를 보낸다', effects: [{ memory: 1 }], default: true },
  ] },
  { id: 'a_love_crisis', spaces: ['love', 'risk'], stages: ['early', 'late'], when: { relation: ['dating', 'married'] }, cooldown: 4, title: '서운함이 쌓였다', text: '{partner}님이 요즘 너무 바쁘다며 서운해한다.', options: [
    { label: '진심으로 대화', check: { stat: 'social', target: 6, affectionBonus: true }, success: [{ affection: 1 }, { memory: 1 }], fail: [{ affection: -2 }], default: true },
    { label: '선물로 마음을 푼다', cost: 30, effects: [{ affection: 1 }] },
  ] },
  { id: 'a_love_solo', spaces: ['love'], stages: ['late'], when: { relation: ['single'], noPet: true }, title: '혼자만의 시간', text: '혼자 사는 삶도 나쁘지 않다.', options: [
    { label: '반려동물 입양', cost: 10, effects: [{ pet: true }, { memory: 1 }], default: true },
    { label: '새 인연을 찾는다', effects: [{ meet: true }] },
  ] },
  // ===== 직장 (공통) =====
  { id: 'j_unemployed', spaces: ['job'], stages: ['early', 'late'], when: { unemployed: true }, title: '재취업 박람회', text: '구직 박람회가 열렸다. 새 출발을 할 수 있다.', options: [
    { label: '직업을 고른다', effects: [{ jobSelect: 'free' }], default: true },
  ] },
  { id: 'j_parttime', spaces: ['job'], stages: ['early', 'late'], when: { jobType: 'free' }, title: '단골손님의 제안', text: '아르바이트 가게 단골이 정식 채용을 제안한다.', options: [
    { label: '직업을 고른다 (전직 비용 없음)', effects: [{ jobSelect: 'free' }], default: true },
    { label: '지금 일을 유지', effects: [{ cash: 15 }] },
  ] },
  { id: 'j_challenge', spaces: ['job'], stages: ['early', 'late'], when: { jobType: 'challenge' }, title: '승진 도전 기회', text: '큰 무대(투자 설명회)에 설 기회가 찾아왔다.', options: [
    { label: '도전한다', promoCheck: true, default: true },
    { label: '실력을 다진다', effects: [{ statJob: 1 }] },
  ] },
  { id: 'j_growth', spaces: ['job'], stages: ['early', 'late'], when: { jobType: 'growth' }, title: '큰 프로젝트', text: '팀의 사활이 걸린 프로젝트를 맡았다.', options: [
    { label: '야근하며 완성', effects: [{ xp: 2 }, { status: 'burnout', turns: 1 }], default: true },
    { label: '정시 퇴근하며 꾸준히', effects: [{ xp: 1 }] },
  ] },
  { id: 'j_stable', spaces: ['job'], stages: ['early', 'late'], when: { jobType: 'stable' }, title: '사내 교육', text: '승진에 도움이 되는 사내 교육이 열렸다.', options: [
    { label: '교육 이수', effects: [{ statJob: 1 }], default: true },
    { label: '동료와 회식', cost: 10, effects: [{ stat: { social: 1 } }, { memory: 1 }] },
  ] },
  { id: 'j_offer', spaces: ['job'], stages: ['early', 'late'], when: { hasJob: true }, cooldown: 4, title: '스카우트 제안', text: '다른 분야에서 함께 일하자는 제안이 왔다.', options: [
    { label: '전직을 검토한다', effects: [{ jobSelect: 'change' }] },
    { label: '지금 자리를 지킨다', effects: [{ xp: 1 }], default: true },
  ] },
  // ===== 직업 전용 =====
  { id: 'j_office_pt', spaces: ['job'], stages: ['early', 'late'], when: { jobId: 'office' }, title: '중요한 발표', text: '임원 앞에서 분기 실적을 발표한다.', options: [
    { label: '데이터로 승부', check: { stat: 'smart', target: 7 }, success: [{ stat: { smart: 1 } }, { cash: 20 }], fail: [{ status: 'burnout', turns: 1 }], default: true },
    { label: '입담으로 승부', check: { stat: 'social', target: 7 }, success: [{ stat: { social: 1 } }, { cash: 20 }], fail: [{ stat: { social: -1 } }] },
  ] },
  { id: 'j_civil_complaint', spaces: ['job'], stages: ['early', 'late'], when: { jobId: 'civil' }, title: '민원 폭주', text: '민원 창구가 북새통이다.', options: [
    { label: '친절하게 응대', effects: [{ stat: { social: 1 } }, { memory: 1 }], default: true },
    { label: '규정대로 처리', effects: [{ stat: { smart: 1 } }] },
  ] },
  { id: 'j_nurse_night', spaces: ['job'], stages: ['early', 'late'], when: { jobId: 'nurse' }, title: '야간 응급실', text: '야간 응급실에 환자가 몰려왔다.', options: [
    { label: '끝까지 버틴다', check: { stat: 'body', target: 7 }, success: [{ stat: { body: 1 } }, { cash: 25 }, { memory: 1 }], fail: [{ status: 'burnout', turns: 2 }], default: true },
    { label: '교대 인력을 부른다', effects: [{ stat: { social: 1 } }] },
  ] },
  { id: 'j_teacher_class', spaces: ['job'], stages: ['early', 'late'], when: { jobId: 'teacher' }, title: '졸업식', text: '처음 맡은 반 아이들이 졸업한다.', effects: [{ memory: 2 }, { stat: { social: 1 } }], auto: true },
  { id: 'j_athlete_retire', spaces: ['job', 'event'], stages: ['late'], when: { jobId: 'athlete' }, once: true, title: '은퇴의 갈림길', text: '몸이 예전 같지 않다. 선수 생활을 정리할 때가 왔다.', options: [
    { label: '은퇴 후 코치로 전직', effects: [{ setJob: { id: 'teacher', rank: 1, ignoreReq: true } }, { memory: 2 }], desc: '교사(코치) 담임 단계로 전직, 학위 무시' },
    { label: '마지막 시즌에 도전', check: { stat: 'body', target: 10 }, success: [{ cash: 150 }, { memory: 2 }, { flag: 'lastSeason' }], fail: [{ status: 'injured', turns: 2 }, { rankDown: 1 }], default: true },
  ] },
  { id: 'j_musician_viral', spaces: ['job'], stages: ['early', 'late'], when: { jobId: 'musician' }, title: '영상 역주행', text: '몇 년 전 공연 영상이 갑자기 화제가 됐다.', options: [
    { label: '신곡을 바로 낸다', check: { stat: 'sense', target: 8 }, success: [{ rankUp: 1 }, { cash: 40 }], fail: [{ cash: 10 }], default: true },
    { label: '팬미팅을 연다', effects: [{ stat: { social: 1 } }, { memory: 1 }, { cash: 20 }] },
  ] },
  { id: 'j_founder_invest', spaces: ['job'], stages: ['early', 'late'], when: { jobId: 'founder' }, title: '자금 위기', text: '다음 달 인건비가 부족하다.', options: [
    { label: '개인 대출로 버틴다', effects: [{ debt: 60 }, { xp: 1 }], default: true },
    { label: '사업 축소', effects: [{ rankDown: 1 }, { cash: 30 }] },
    { label: '폐업 후 재정비', effects: [{ loseJob: true }, { cash: 50 }] },
  ] },
  { id: 'j_chef_review', spaces: ['job'], stages: ['early', 'late'], when: { jobId: 'chef' }, title: '미식 평론가 방문', text: '유명 평론가가 가게에 찾아왔다.', options: [
    { label: '시그니처 메뉴', check: { stat: 'sense', target: 7 }, success: [{ xp: 3 }], fail: [{ xp: 1 }], default: true },
    { label: '평소대로', effects: [{ xp: 1 }] },
  ] },
  { id: 'j_dev_launch', spaces: ['job'], stages: ['early', 'late'], when: { jobId: 'developer' }, title: '서비스 출시 전날', text: '출시 전날 치명적인 버그가 발견됐다.', options: [
    { label: '밤새 고친다', check: { stat: 'smart', target: 7 }, success: [{ xp: 3 }], fail: [{ xp: 1 }, { status: 'burnout', turns: 2 }], default: true },
    { label: '출시를 미루자고 설득', check: { stat: 'social', target: 6 }, success: [{ xp: 1 }], fail: [{ xp: -1 }] },
  ] },
  { id: 'j_research_paper', spaces: ['job'], stages: ['early', 'late'], when: { jobId: 'researcher' }, title: '논문 마감', text: '국제 학회 논문 마감이 코앞이다.', options: [
    { label: '새 실험을 추가', check: { stat: 'smart', target: 8 }, success: [{ xp: 3 }, { flag: 'patent' }], fail: [{ xp: 1 }], default: true },
    { label: '있는 결과로 제출', effects: [{ xp: 1 }] },
  ] },
  { id: 'j_doctor_er', spaces: ['job'], stages: ['early', 'late'], pack: 'extraJobs', when: { jobId: 'doctor' }, title: '어려운 수술', text: '아무도 맡지 않으려는 수술이다.', options: [
    { label: '집도한다', check: { stat: 'smart', target: 9 }, success: [{ cash: 60 }, { stat: { smart: 1 } }, { memory: 1 }], fail: [{ status: 'burnout', turns: 2 }], default: true },
    { label: '전문가에게 넘긴다', effects: [{ stat: { social: 1 } }] },
  ] },
  { id: 'j_creator_drama', spaces: ['job'], stages: ['early', 'late'], pack: 'extraJobs', when: { jobId: 'creator' }, title: '논란 발생', text: '예전 영상 하나가 논란이 되었다.', options: [
    { label: '정면 사과', check: { stat: 'social', target: 7 }, success: [{ stat: { social: 1 } }], fail: [{ rankDown: 1 }], default: true },
    { label: '잠시 쉬어 간다', effects: [{ status: 'burnout', turns: 1 }, { memory: 1 }] },
  ] },
  { id: 'j_farmer_harvest', spaces: ['job'], stages: ['early', 'late'], pack: 'extraJobs', when: { jobId: 'farmer' }, title: '수확 철', text: '올해 농사가 끝났다. 날씨는 어땠을까?', options: [
    { label: '직판 행사', check: { stat: 'social', target: 6 }, success: [{ xp: 3 }, { cash: 30 }], fail: [{ xp: 1 }], default: true },
    { label: '도매로 넘긴다', effects: [{ xp: 1 }, { cash: 20 }] },
  ] },
  // ===== 확장 사건 (extra) =====
  { id: 'x_side_project', pack: 'extra', spaces: ['event'], stages: ['early'], once: true, title: '주말 사이드 프로젝트', text: '친구가 주말에 같이 앱을 만들자고 한다.', options: [
    { label: '같이 한다', effects: [{ stat: { smart: 1, sense: 1 } }, { flag: 'sideProject' }], next: 'x_side_result', default: true },
    { label: '사양한다', effects: [] },
  ] },
  { id: 'x_side_result', pack: 'extra', chainOnly: true, spaces: ['event', 'job', 'study', 'lucky', 'risk'], stages: ['early', 'late'], title: '사이드 프로젝트 출시', text: '주말마다 만든 앱을 드디어 공개했다.', options: [
    { label: '마케팅에 투자', cost: 20, check: { stat: 'social', target: 7 }, success: [{ cash: 120 }, { memory: 1 }], fail: [{ memory: 1 }] },
    { label: '조용히 공개', check: { stat: 'luck', target: 5 }, success: [{ cash: 60 }], fail: [], default: true },
  ] },
  { id: 'x_old_friend', pack: 'extra', spaces: ['event'], stages: ['early', 'late'], once: true, title: '옛 친구의 부탁', text: '어릴 적 친구가 급하게 돈을 빌려 달라고 한다.', options: [
    { label: '빌려준다 (50)', cost: 50, effects: [{ flag: 'lentMoney' }], next: 'x_old_friend_return' },
    { label: '정중히 거절', effects: [], default: true },
  ] },
  { id: 'x_old_friend_return', pack: 'extra', chainOnly: true, spaces: ['event', 'lucky', 'love', 'job'], stages: ['early', 'late'], title: '돌아온 친구', text: '그때 돈을 빌려 간 친구가 찾아왔다.', options: [
    { label: '반갑게 맞는다', check: { stat: 'social', target: 5 }, success: [{ cash: 90 }, { memory: 2 }], fail: [{ cash: 50 }], default: true },
  ] },
  { id: 'x_doctor_switch', pack: 'extra', requires: ['extraJobs'], spaces: ['study', 'event'], stages: ['early'], when: { degree: true, minStat: { smart: 6 } }, once: true, title: '의대 편입 공고', text: '학위 소지자 대상 의대 편입 모집 공고가 났다.', options: [
    { label: '편입한다 (의사로 전직)', cost: 60, effects: [{ setJob: { id: 'doctor', rank: 0 } }] },
    { label: '관심 없다', effects: [], default: true },
  ] },
  { id: 'x_inheritance', pack: 'extra', spaces: ['lucky'], stages: ['late'], once: true, title: '먼 친척의 유산', text: '얼굴도 모르는 먼 친척이 유산을 남겼다.', options: [
    { label: '골동품을 받는다', effects: [{ asset: 'antique' }, { asset: 'antique' }] },
    { label: '현금으로 받는다 (+70)', effects: [{ cash: 70 }], default: true },
  ] },
  { id: 'x_rival', pack: 'extra', spaces: ['risk', 'job'], stages: ['early', 'late'], when: { hasJob: true }, cooldown: 5, title: '라이벌 등장', text: '능력 있는 동료가 같은 자리를 노린다. 누군가에게 도움을 청할까?', options: [
    { label: '정면 승부', promoCheck: true, default: true },
    { label: '협력한다', effects: [{ xp: 1 }, { stat: { social: 1 } }] },
  ] },
  // ===== 바람섬 (special) =====
  { id: 's_island_treasure', pack: 'special', spaces: ['island'], stages: ['early', 'late'], title: '해변의 유리병', text: '모래 속에서 오래된 유리병을 발견했다.', options: [
    { label: '열어 본다', check: { stat: 'luck', target: 4 }, success: [{ asset: 'antique' }, { cash: 30 }], fail: [{ memory: 1 }], default: true },
  ] },
  { id: 's_island_house', pack: 'special', spaces: ['island'], stages: ['early', 'late'], when: { notCredit: true }, title: '섬 별장 매물', text: '바다가 보이는 별장이 싸게 나왔다.', options: [
    { label: '구매한다 (200)', buy: 'islandHouse' },
    { label: '구경만 한다', effects: [{ memory: 1 }], default: true },
  ] },
  { id: 's_island_storm', pack: 'special', spaces: ['island'], stages: ['early', 'late'], title: '태풍 경보', text: '섬에 태풍이 몰려온다.', options: [
    { label: '마을을 돕는다', check: { stat: 'body', target: 7 }, success: [{ memory: 2 }, { stat: { body: 1 } }], fail: [{ status: 'injured', turns: 2 }], default: true },
    { label: '숙소에 머문다', cost: 20, effects: [] },
  ] },
  { id: 's_island_festival', pack: 'special', spaces: ['island'], stages: ['early', 'late'], title: '바람섬 축제', text: '섬 주민들의 축제에 초대받았다.', options: [
    { label: '노래 무대에 선다', check: { stat: 'sense', target: 6 }, success: [{ cash: 50 }, { memory: 1 }], fail: [{ memory: 1 }], default: true },
    { label: '사진만 남긴다', effects: [{ stat: { sense: 1 } }] },
  ] },
  { id: 's_island_retreat', pack: 'special', spaces: ['island'], stages: ['early', 'late'], title: '명상 휴양', text: '섬의 휴양소에서 머리를 비운다.', effects: [{ clearBad: true }, { status: 'motivated', turns: 2 }], auto: true },
];

// 공동 사건 (모두의 광장)
export const JOINT_EVENTS = [
  { id: 'jt_festival', title: '동네 축제 준비', text: '마을 축제 예산을 모은다. 목표: 인원 × 12. 달성하면 기부자 전원 추억 +1, 최다 기부자 사교 +1.', kind: 'pool', target: 12,
    options: [{ label: '기부 안 함', amount: 0, default: true }, { label: '10 기부', amount: 10 }, { label: '30 기부', amount: 30 }] },
  { id: 'jt_fund', title: '공동 투자 펀드', text: '함께 펀드에 투자한다. 결과 배수(0.5~2배)는 참가자 모두에게 같게 적용된다.', kind: 'fund',
    options: [{ label: '투자 안 함', amount: 0, default: true }, { label: '20 투자', amount: 20 }, { label: '50 투자', amount: 50 }] },
  { id: 'jt_reunion', title: '대동창회', text: '모두 모이는 동창회. 참석자 수가 많을수록 참석자 모두 얻는 것이 크다(참석 비용 10).', kind: 'gather',
    options: [{ label: '불참', amount: 0, default: true }, { label: '참석 (10)', amount: 10 }] },
];
