// 지도 아래에서 올라오는 카드: 반쯤 → 끝까지 끌어올린다. 손잡이를 끌거나 누른다. 아래로 끌면 닫힌다.
// 카드는 지도 칸(host) 안에서만 움직인다. 지도는 카드가 덮지 않는 곳에서 그대로 눌리고 끌린다.

import { el } from './dom.js';

export function createSheet(host, { onClose, onChange } = {}) {
  const body = el('div', { class: 'sheet-body' });
  const grip = el('button', { class: 'sheet-grip', type: 'button', 'aria-label': '카드 크기 바꾸기' }, el('span', { class: 'sheet-bar' }));
  const node = el('section', { class: 'sheet', role: 'dialog', 'aria-label': '카드', hidden: true }, grip, body);
  let state = 'closed';

  const hostH = () => host.clientHeight || 600;
  const sizes = () => ({ half: Math.round(Math.min(Math.max(hostH() * 0.6, 320), 440)), full: Math.max(260, hostH() - 76) });
  const heightOf = (s) => (s === 'closed' ? 0 : sizes()[s]);
  function place(px) { node.style.setProperty('--sheet-h', `${px}px`); host.style.setProperty('--sheet-h', `${px}px`); }
  function setState(next) {
    state = next;
    node.dataset.state = next;
    node.hidden = next === 'closed';
    place(heightOf(next));
    host.dataset.sheet = next;
    if (next === 'closed') onClose?.();
    onChange?.(next);
  }
  // 열 때 아직 안 보이던 카드는 맨 위부터 보인다.
  function open(children, next = 'half') {
    body.replaceChildren(...[].concat(children).filter(Boolean));
    body.scrollTop = 0;
    setState(next === 'closed' ? 'half' : next);
  }
  const close = () => setState('closed');
  grip.addEventListener('click', () => { if (!dragged) setState(state === 'half' ? 'full' : 'half'); });

  let start = null;
  let dragged = false;
  grip.addEventListener('pointerdown', (ev) => {
    try { grip.setPointerCapture(ev.pointerId); } catch { /* 손가락이 아닌 이벤트면 붙잡지 않는다 */ }
    start = { y: ev.clientY, h: heightOf(state), t: performance.now() };
    dragged = false;
    node.classList.add('drag');
  });
  grip.addEventListener('pointermove', (ev) => {
    if (!start) return;
    const dy = ev.clientY - start.y;
    if (Math.abs(dy) > 6) dragged = true;
    if (dragged) place(Math.min(sizes().full, Math.max(70, start.h - dy)));
  });
  const release = (ev) => {
    if (!start) return;
    const dy = ev.clientY - start.y;
    const up = -dy / Math.max(1, performance.now() - start.t); // 위로 빠르게 끌면 +
    const h = Math.min(sizes().full, Math.max(0, start.h - dy));
    start = null;
    node.classList.remove('drag');
    if (!dragged) return;
    const { half, full } = sizes();
    if (h < half * 0.55 || (up < -0.6 && state === 'half')) setState('closed');
    else if (h > (half + full) / 2 || up > 0.6) setState('full');
    else setState('half');
    setTimeout(() => { dragged = false; }, 0);
  };
  grip.addEventListener('pointerup', release);
  grip.addEventListener('pointercancel', release);
  node.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') close(); });
  host.addEventListener('resize-sheet', () => { if (state !== 'closed') place(heightOf(state)); });
  return { node, open, close, setState, state: () => state, height: () => heightOf(state), expectedHeight: () => sizes().half };
}
