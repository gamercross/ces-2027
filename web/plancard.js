// 갈 곳 탭의 회사 카드를 담는 큰 창: 아래에서 화면 대부분을 덮고 올라온다. 바깥을 누르거나 "닫기" · Esc로 닫는다.
// 알맹이(무엇을 보일지)는 plan.js가 채우고, 여기는 여닫기 · 초점 · 스크롤 잠금만 맡는다.

import { el } from './dom.js';

export function createCardShell() {
  const body = el('div', { class: 'pcard-body' });
  const panel = el('section', { class: 'pcard', role: 'dialog', 'aria-modal': 'true', 'aria-label': '회사 카드', tabindex: '-1' }, body);
  const back = el('div', { class: 'pcard-back', hidden: true }, panel);
  let opener = null;

  const onKey = (ev) => { if (ev.key === 'Escape') close(); };
  // 키보드가 뜨면 창이 키보드 위로 올라온다(R61: 받자마자 뜨는 한 줄 칸이 가리지 않게). 보이는 높이(visualViewport)만큼만 덮는다.
  const vv = globalThis.visualViewport;
  const lift = () => {
    // 손가락으로 키운 때(scale ≠ 1)는 키보드가 아니라서 그대로 둔다.
    const gap = Math.abs((vv.scale || 1) - 1) > 0.01 ? 0 : Math.max(0, Math.round(document.documentElement.clientHeight - vv.height - vv.offsetTop));
    back.style.bottom = gap ? `${gap}px` : '';
    panel.style.maxHeight = gap ? `${Math.round(vv.height * 0.9)}px` : '';
  };
  back.addEventListener('click', (ev) => { if (ev.target === back) close(); });

  function open(children, from) {
    opener = from || document.activeElement;
    body.replaceChildren(...[].concat(children).filter(Boolean));
    back.hidden = false;
    document.body.classList.add('pcard-open');
    document.addEventListener('keydown', onKey);
    if (vv) { vv.addEventListener('resize', lift); vv.addEventListener('scroll', lift); lift(); }
    body.scrollTop = 0;
    panel.focus({ preventScroll: true });
  }
  // 카드 안에서 무언가 바꾼 뒤 다시 그린다 (읽던 자리는 그대로).
  function update(children) {
    const at = body.scrollTop;
    body.replaceChildren(...[].concat(children).filter(Boolean));
    body.scrollTop = at;
  }
  function close() {
    if (back.hidden) return;
    back.hidden = true;
    document.body.classList.remove('pcard-open');
    document.removeEventListener('keydown', onKey);
    if (vv) { vv.removeEventListener('resize', lift); vv.removeEventListener('scroll', lift); back.style.bottom = ''; panel.style.maxHeight = ''; }
    if (opener?.isConnected) opener.focus({ preventScroll: true });
    opener = null;
  }
  return { node: back, open, update, close, get isOpen() { return !back.hidden; } };
}
