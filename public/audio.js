// 효과음과 배경 음악: WebAudio로 직접 합성 (외부 음원 없음, 자체 작곡 멜로디)
let ctx = null;
const pref = { sfx: load('sfx', true), bgm: load('bgm', false) };
function load(k, d) { try { const v = localStorage.getItem('glg.' + k); return v === null ? d : v === '1'; } catch { return d; } }
function save(k, v) { try { localStorage.setItem('glg.' + k, v ? '1' : '0'); } catch { /* 저장 불가 환경 */ } }
function ac() { ctx ||= new (window.AudioContext || window.webkitAudioContext)(); if (ctx.state === 'suspended') ctx.resume(); return ctx; }

function tone(freq, start, dur, { type = 'triangle', vol = 0.08 } = {}) {
  const a = ac();
  const o = a.createOscillator(); const g = a.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(0, a.currentTime + start);
  g.gain.linearRampToValueAtTime(vol, a.currentTime + start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + start + dur);
  o.connect(g).connect(a.destination);
  o.start(a.currentTime + start); o.stop(a.currentTime + start + dur + 0.05);
}
const SFX = {
  dice: () => { for (let i = 0; i < 6; i++) tone(300 + Math.random() * 400, i * 0.05, 0.05, { type: 'square', vol: 0.03 }); },
  step: () => tone(660, 0, 0.06, { type: 'sine', vol: 0.04 }),
  good: () => [523, 659, 784].forEach((f, i) => tone(f, i * 0.08, 0.18)),
  bad: () => [392, 330, 262].forEach((f, i) => tone(f, i * 0.1, 0.2, { type: 'sawtooth', vol: 0.04 })),
  coin: () => { tone(988, 0, 0.08, { type: 'square', vol: 0.03 }); tone(1319, 0.07, 0.2, { type: 'square', vol: 0.03 }); },
  turn: () => [587, 880].forEach((f, i) => tone(f, i * 0.12, 0.25, { type: 'sine', vol: 0.07 })),
  fanfare: () => [523, 523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.13, 0.3)),
};
export function sfx(name) { if (pref.sfx) try { SFX[name]?.(); } catch { /* 오디오 불가 */ } }

// 배경 음악: 장조 5음계 기반 자체 멜로디 루프
const MELODY = [0, 2, 4, 7, 4, 2, 0, -1, 0, 4, 7, 9, 7, 4, 2, 4, 5, 4, 2, 0, 2, 4, 2, -3];
const BASS = [0, 0, 5, 5, 3, 3, 4, 4];
const SCALE = (n) => 261.63 * Math.pow(2, ({ '-3': -5, '-1': -1, 0: 0, 2: 2, 4: 4, 5: 5, 7: 7, 9: 9 }[n] ?? n) / 12);
let bgmTimer = null;
function playBar(i) {
  const beat = 0.32;
  for (let k = 0; k < 4; k++) {
    const n = MELODY[(i * 4 + k) % MELODY.length];
    tone(SCALE(n) * 2, k * beat, beat * 0.9, { type: 'triangle', vol: 0.025 });
  }
  tone(SCALE(BASS[i % BASS.length]) / 2, 0, beat * 3.8, { type: 'sine', vol: 0.03 });
}
function startBgm() { if (bgmTimer) return; let i = 0; playBar(i++); bgmTimer = setInterval(() => playBar(i++), 1280); }
function stopBgm() { clearInterval(bgmTimer); bgmTimer = null; }
export const audioPrefs = () => ({ ...pref });
export function setAudio(k, v) { pref[k] = v; save(k, v); if (k === 'bgm') (v ? startBgm() : stopBgm()); }
export function resumeBgm() { if (pref.bgm) startBgm(); }
