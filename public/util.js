// 공용 DOM/포맷 도우미
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// h('div.cls#id', {attrs}, ...children)
export function h(tag, attrs, ...children) {
  const [name, ...rest] = tag.split(/(?=[.#])/);
  const el = document.createElement(name || 'div');
  for (const r of rest) { if (r[0] === '.') el.classList.add(r.slice(1)); else el.id = r.slice(1); }
  if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) { children.unshift(attrs); attrs = null; }
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') for (const [sk, sv] of Object.entries(v)) { if (sk.startsWith('--')) el.style.setProperty(sk, sv); else el.style[sk] = sv; }
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}
export const won = (n) => `${Number(n).toLocaleString('ko-KR')}만`;
export const sign = (n) => (n > 0 ? '+' : '') + n;

let toastBox;
export function toast(msg, kind = 'info', ms = 3200) {
  toastBox ||= document.body.appendChild(h('div.toasts'));
  const t = h('div.toast.' + kind, msg);
  toastBox.append(t);
  setTimeout(() => t.classList.add('out'), ms);
  setTimeout(() => t.remove(), ms + 400);
}

export function modal(content, { onClose, wide = false, closable = true } = {}) {
  const close = () => { back.remove(); onClose?.(); document.removeEventListener('keydown', esc); };
  const esc = (e) => { if (e.key === 'Escape' && closable) close(); };
  const box = h('div.modal' + (wide ? '.wide' : ''), closable ? h('button.modal-x', { onclick: close, 'aria-label': '닫기', title: '닫기' }, '✕') : null, content);
  const back = h('div.modal-back', { onclick: (e) => { if (e.target === back && closable) close(); } }, box);
  document.body.append(back);
  document.addEventListener('keydown', esc);
  return { close, box };
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast('복사했습니다.', 'ok'); }
  catch { prompt('아래 내용을 복사하세요', text); }
}
