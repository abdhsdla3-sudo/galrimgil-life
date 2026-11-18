// 방 설정, 프리셋, 예상 플레이타임 (서버·클라이언트 공용)

export const LENGTH_LIMITS = { growth: [8, 30], early: [10, 40], late: [10, 40] };
export const AVG_MOVE = 3.4; // 주사위 평균 3.5 - 강제 정지·분기 손실 보정
export const TIME_LIMITS = [0, 30, 60, 120];
export const SPEEDS = { slow: '느리게', normal: '보통', fast: '빠르게', instant: '즉시' };

export const PRESETS = {
  short: { name: '짧은 여정', settings: { startStage: 'adult', lengths: { growth: 12, early: 14, late: 14 }, packs: { extraJobs: false, special: false, joint: true, extra: false } } },
  standard: { name: '기본 여정', settings: { startStage: 'growth', lengths: { growth: 14, early: 22, late: 20 }, packs: { extraJobs: true, special: false, joint: true, extra: true } } },
  long: { name: '긴 여정', settings: { startStage: 'growth', lengths: { growth: 22, early: 32, late: 30 }, packs: { extraJobs: true, special: true, joint: true, extra: true } } },
};

export function defaultSettings() {
  return {
    preset: 'standard',
    ...structuredClone(PRESETS.standard.settings),
    speed: 'normal',
    skipRepeat: false,
    timeLimit: 0,
  };
}

const clampInt = (v, lo, hi, d) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
};

// 신뢰할 수 없는 입력을 안전한 설정으로 정규화
export function normalizeSettings(input) {
  const d = defaultSettings();
  const s = input && typeof input === 'object' ? input : {};
  const out = {
    preset: ['short', 'standard', 'long', 'custom'].includes(s.preset) ? s.preset : 'custom',
    startStage: s.startStage === 'adult' ? 'adult' : 'growth',
    lengths: {},
    packs: {},
    speed: SPEEDS[s.speed] ? s.speed : d.speed,
    skipRepeat: !!s.skipRepeat,
    timeLimit: TIME_LIMITS.includes(Number(s.timeLimit)) ? Number(s.timeLimit) : 0,
  };
  for (const k of ['growth', 'early', 'late']) {
    const [lo, hi] = LENGTH_LIMITS[k];
    out.lengths[k] = clampInt(s.lengths?.[k], lo, hi, d.lengths[k]);
  }
  for (const k of ['extraJobs', 'special', 'joint', 'extra']) out.packs[k] = !!(s.packs?.[k] ?? d.packs[k]);
  return out;
}

export function presetSettings(key, base) {
  const p = PRESETS[key];
  const b = normalizeSettings(base || defaultSettings());
  if (!p) return { ...b, preset: 'custom' };
  return normalizeSettings({ ...b, ...structuredClone(p.settings), preset: key });
}

// 단계별 예상 턴 수(플레이어 1명 기준)
export function stageTurns(settings) {
  const s = normalizeSettings(settings);
  const extra = s.packs.special ? 2 : 0; // 바람섬 우회로 선택 시
  const growth = s.startStage === 'growth' ? Math.ceil((s.lengths.growth + 4) / AVG_MOVE) : 0;
  const early = Math.ceil((s.lengths.early + 8 + extra) / AVG_MOVE); // 진로 갈래길 + 관문
  const late = Math.ceil((s.lengths.late + 2 + extra) / AVG_MOVE);
  return { growth, early, late, total: growth + early + late };
}

// 예상 플레이타임(분) 범위
// 근거: 한 사람 차례 = 이동 연출 + 사건 읽기/선택. 보통 속도 기준 약 25초(빠르게 18, 느리게 35, 즉시 14).
// 공동 사건/준비 단계는 동시 입력이라 인원 증가 영향이 작다. 고민 시간에 따라 ±40% 차이 날 수 있다.
export function estimateMinutes(settings, players) {
  const s = normalizeSettings(settings);
  const n = Math.min(12, Math.max(2, Number(players) || 2));
  const t = stageTurns(s);
  const perTurnSec = { slow: 35, normal: 25, fast: 18, instant: 14 }[s.speed] * (s.skipRepeat ? 0.85 : 1);
  const jointSec = s.packs.joint ? (t.total / 6) * 30 : 0; // 공동 사건(동시 선택)
  const prepSec = s.startStage === 'adult' ? 90 : 45;
  const base = (t.total * n * perTurnSec + jointSec + prepSec + 120) / 60;
  return { low: Math.round(base * 0.75), high: Math.round(base * 1.4), turnsPerPlayer: t.total, stage: t };
}
