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
console.log(errors ? `검사 실패 ${errors}건` : `검사 통과: 파일 ${files.length}개, 사건 ${EVENTS.length}개`);
process.exit(errors ? 1 : 0);
