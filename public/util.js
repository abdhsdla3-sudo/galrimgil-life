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

export function roomChat(send) {
  const input = h('input', { maxlength: 120, placeholder: '메시지 입력', 'aria-label': '채팅 메시지', required: true });
  const list = h('div.chat-list', { role: 'log', 'aria-label': '채팅 기록' });
  const button = h('button', { type: 'submit' }, '보내기');
  const form = h('form.chat-form', { onsubmit: async e => {
    e.preventDefault();
    const message = input.value.trim();
    if (!message || button.disabled) return;
    button.disabled = true;
    try { if (await send('chat', { message }) && input.value.trim() === message) input.value = ''; }
    finally { button.disabled = false; }
  } }, input, button);
  let seq;
  return {
    input, node: h('div.room-chat', list, form),
    update(messages) {
      const next = messages.at(-1)?.seq ?? 0;
      if (next === seq) return;
      seq = next;
      list.replaceChildren(...messages.map(m => h('div.chat-message', h('b', m.name), ' ', m.message)));
      list.scrollTop = list.scrollHeight;
    },
  };
}
