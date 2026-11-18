// 상태 저장이 가능한 결정적 난수 (mulberry32). 상태는 게임 데이터에 함께 저장된다.
export function nextRandom(rng) {
  rng.s = (rng.s + 0x6d2b79f5) >>> 0;
  let t = rng.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  rng.n = (rng.n || 0) + 1;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const randInt = (rng, lo, hi) => lo + Math.floor(nextRandom(rng) * (hi - lo + 1));
export const pick = (rng, arr) => arr[Math.floor(nextRandom(rng) * arr.length)];
export function weightedPick(rng, items, wf) {
  const total = items.reduce((a, it) => a + wf(it), 0);
  if (total <= 0) return null;
  let r = nextRandom(rng) * total;
  for (const it of items) { r -= wf(it); if (r < 0) return it; }
  return items[items.length - 1];
}
export function shuffle(rng, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(nextRandom(rng) * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
