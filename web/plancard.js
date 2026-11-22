// 동선의 회사 카드를 담는 큰 창: 아래에서 화면 대부분을 덮고 올라온다. 바깥을 누르거나 "닫기" · Esc로 닫는다.
// 알맹이(무엇을 보일지)는 plan.js가 채우고, 여기는 여닫기 · 초점 · 스크롤 잠금만 맡는다.

import { el } from './dom.js';

export function createCardShell() {
  const body = el('div', { class: 'pcard-body' });
  const panel = el('section', { class: 'pcard', role: 'dialog', 'aria-modal': 'true', 'aria-label': '회사 카드', tabindex: '-1' }, body);
  const back = el('div', { class: 'pcard-back', hidden: true }, panel);
  let opener = null;

  const onKey = (ev) => { if (ev.key === 'Escape') close(); };
  back.addEventListener('click', (ev) => { if (ev.target === back) close(); });

  function open(children, from) {
    opener = from || document.activeElement;
    body.replaceChildren(...[].concat(children).filter(Boolean));
    back.hidden = false;
    document.body.classList.add('pcard-open');
    document.addEventListener('keydown', onKey);
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
    if (opener?.isConnected) opener.focus({ preventScroll: true });
    opener = null;
  }
  return { node: back, open, update, close, get isOpen() { return !back.hidden; } };
}
