// 사이트에서 고를 수 있는 게임 목록과 이미지 슬롯 (서버 server/games.js 와 같은 id 사용)
import { h } from './util.js';

export const GAME_META = {
  life: {
    id: 'life', name: '갈림길 인생', players: '2~12명', min: 2, max: 12, defaultCap: 8,
    line: '주사위와 선택으로 성장기부터 은퇴까지, 친구들과 서로 다른 인생을 살아 봐요.',
    card: '/assets/cards/life.png', fallback: 'life',
  },
  harbor: {
    id: 'harbor', name: '항구의 길', players: '2~4명', min: 2, max: 4, defaultCap: 4,
    line: '부산에서 출항해 세계 도시의 항구를 운영하고 화물을 배달하세요.',
    card: '/assets/cards/harbor.png', fallback: 'harbor',
  },
};
export const gameMeta = (t) => GAME_META[t] || GAME_META.life;

// public/assets 에 실제로 들어 있는 이미지 목록. 없는 파일은 요청하지 않고 대체 그림을 쓴다.
let manifest = null;
export function loadManifest() {
  manifest ||= fetch('/assets/manifest.json').then(r => (r.ok ? r.json() : { files: [] })).then(j => new Set(j.files || [])).catch(() => new Set());
  return manifest;
}

// 이미지 슬롯: 대체 그림을 먼저 그리고, 이미지가 있으면 덮어쓴다.
export function artSlot(src, fallback, { cls = '', alt = '' } = {}) {
  const box = h('div.art' + (cls ? '.' + cls : ''), { 'aria-hidden': alt ? undefined : 'true' }, fallbackArt(fallback));
  loadManifest().then(set => {
    if (!set.has(src)) return;
    const img = h('img', { src, alt, decoding: 'async' });
    img.addEventListener('load', () => { box.replaceChildren(img); box.classList.add('has-img'); });
  });
  return box;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
function svg(markup, viewBox = '0 0 400 300') {
  const el = document.createElementNS(SVG_NS, 'svg');
  el.setAttribute('viewBox', viewBox);
  el.setAttribute('preserveAspectRatio', 'xMidYMid slice');
  el.innerHTML = markup;
  return el;
}

// 이미지가 들어오기 전에 쓰는 단순한 벡터 그림
export function fallbackArt(kind) {
  if (kind === 'life') {
    return svg(`<rect width="400" height="300" fill="#ffe8c7"/><circle cx="320" cy="70" r="38" fill="#f6b73c"/>
      <path d="M0 230 Q120 170 200 210 T400 190 V300 H0Z" fill="#9ccc65"/><path d="M60 300 C120 230 170 230 200 180 C230 230 290 230 340 300" stroke="#e07a2f" stroke-width="18" fill="none" stroke-linecap="round"/>
      <path d="M200 180 V110" stroke="#e07a2f" stroke-width="14" stroke-linecap="round"/><circle cx="200" cy="100" r="16" fill="#3b2a1a"/>`);
  }
  if (kind === 'harbor' || kind === 'port') {
    return svg(`<rect width="400" height="300" fill="#13294b"/><circle cx="300" cy="80" r="44" fill="#ff7a5c"/>
      <path d="M0 190 Q100 170 200 190 T400 190 V300 H0Z" fill="#1d4e89"/><path d="M0 225 Q100 205 200 225 T400 225" stroke="#38d6c4" stroke-width="6" fill="none" stroke-dasharray="14 12"/>
      <path d="M40 190 L90 120 L140 190Z" fill="#f4e9d8"/><rect x="200" y="120" width="16" height="70" fill="#f4e9d8"/><path d="M190 120 H226 L208 96Z" fill="#ff7a5c"/>
      <path d="M260 210 h80 l-14 18 h-52z" fill="#f4e9d8"/><path d="M298 210 V168 l26 34z" fill="#ff7a5c"/>`);
  }
  return svg('<rect width="400" height="300" fill="#ddd"/>');
}
