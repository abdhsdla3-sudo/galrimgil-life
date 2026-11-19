// 의존성 없는 간단한 검사: JS 구문, UTF-8 인코딩(BOM 금지), 콘텐츠 데이터 무결성
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dirs = ['game', 'server', 'public', 'test', 'scripts'];
let errors = 0;
const bad = (m) => { console.error('✖', m); errors++; };

const files = dirs.flatMap(d => fs.readdirSync(path.join(root, d), { recursive: true }).map(f => path.join(root, d, String(f))))
  .filter(f => /\.(js|html|css|md|json|svg)$/.test(f));
const decoder = new TextDecoder('utf-8', { fatal: true });
for (const f of files) {
  const buf = fs.readFileSync(f);
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) bad(`BOM 포함: ${f}`);
  try { decoder.decode(buf); } catch { bad(`UTF-8 아님: ${f}`); }
  if (f.endsWith('.js')) {
    try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); } catch (e) { bad(`구문 오류: ${f}\n${e.stderr}`); }
    const src = buf.toString('utf8');
    if (/console\.log\([^)]*token/i.test(src)) bad(`토큰을 로그로 남기는 코드: ${f}`);
  }
}

// 콘텐츠 무결성
const { EVENTS, JOBS, CARDS, STATUSES, ASSETS, SPACE_TYPES, RANDOM_CARD_POOL } = await import('../game/content.js');
const ids = new Set();
for (const e of EVENTS) {
  if (ids.has(e.id)) bad(`사건 id 중복: ${e.id}`);
  ids.add(e.id);
  for (const s of e.spaces) if (!SPACE_TYPES[s]) bad(`${e.id}: 없는 칸 종류 ${s}`);
  const effs = [...(e.effects || []), ...(e.options || []).flatMap(o => [...(o.effects || []), ...(o.success || []), ...(o.fail || [])])];
  for (const x of effs) {
    if (x.card && x.card !== 'random' && !CARDS[x.card]) bad(`${e.id}: 없는 카드 ${x.card}`);
    if (x.status && !STATUSES[x.status]) bad(`${e.id}: 없는 상태 ${x.status}`);
    if (x.asset && !ASSETS[x.asset]) bad(`${e.id}: 없는 자산 ${x.asset}`);
    if (x.setJob && !JOBS[x.setJob.id]) bad(`${e.id}: 없는 직업 ${x.setJob.id}`);
  }
  for (const o of e.options || []) { if (o.next && !EVENTS.some(y => y.id === o.next)) bad(`${e.id}: 없는 후속 사건 ${o.next}`); if (o.check && !(o.success && o.fail)) bad(`${e.id}: 판정 결과 누락`); }
  if (!e.options && !e.effects) bad(`${e.id}: 선택지도 효과도 없음`);
}
for (const c of RANDOM_CARD_POOL) if (!CARDS[c]) bad(`카드 풀에 없는 카드 ${c}`);

// 「항구의 길」 데이터 무결성
const H = await import('../game/harbor/data.js');
if (H.TILES.length !== 24) bad(`항구의 길: 칸 수 ${H.TILES.length} (24여야 함)`);
if (H.TILES[0].type !== 'start' || H.TILES.filter(t => t.type === 'start').length !== 1) bad('항구의 길: 출항지는 0번 칸 하나');
const names = new Set();
for (const t of H.TILES) {
  if (!['start', 'port', 'market', 'event'].includes(t.type)) bad(`항구의 길: ${t.name} 알 수 없는 칸 종류`);
  if (names.has(t.name)) bad(`항구의 길: 칸 이름 중복 ${t.name}`);
  names.add(t.name);
  if (t.type === 'port') {
    if (!H.REGIONS[t.region]) bad(`항구의 길: ${t.name} 없는 지역 ${t.region}`);
    if (!(t.price > 0 && t.upgrade > 0 && t.toll.length === 3 && t.buyback.length === 3)) bad(`항구의 길: ${t.name} 가격표 누락`);
    if (t.buyback.some((v, i) => i && v <= t.buyback[i - 1]) || t.toll.some((v, i) => i && v <= t.toll[i - 1])) bad(`항구의 길: ${t.name} 단계별 금액이 증가하지 않음`);
  }
}
for (const [lo, hi] of H.CONTRACT_RANGES) if (!H.PORT_IDS.some(i => H.TILES.some(m => m.type === 'market' && ((i - m.i + 24) % 24) >= lo && ((i - m.i + 24) % 24) <= hi))) bad(`항구의 길: 계약 거리 ${lo}~${hi}에 목적지가 없음`);
const kinds = ['move', 'gain', 'pay', 'all', 'cargoFee', 'perPort', 'underdog', 'cargoBonus', 'none'];
for (const e of H.EVENTS) if (!kinds.includes(e.kind) || !(e.weight > 0)) bad(`항구의 길: 이벤트 ${e.id} 설정 오류`);
for (const k of ['roll', 'buy', 'upgrade', 'market', 'settle']) if (!H.DEFAULT_ACTION_TEXT[k]) bad(`항구의 길: 기본 행동 안내 누락 ${k}`);
console.log(errors ? `검사 실패 ${errors}건` : `검사 통과: 파일 ${files.length}개, 사건 ${EVENTS.length}개, 항구의 길 칸 ${H.TILES.length}개`);
process.exit(errors ? 1 : 0);
