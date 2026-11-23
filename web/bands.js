// 갈 곳 탭의 띠: 알림을 못 쓰는 폰에서도 같은 내용을 보인다 — 곧 시작하는 내 일정 · 오늘 명함 몇 장. 있을 때만 한 줄로 뜬다.
// 종이 명함 물음은 여기 없다(2026-11-23): 갈 곳과 상관없는 물음이라 설정의 "종이 명함" 줄에만 둔다.
// 띠의 단추는 글자 단추다(검정 단추는 화면에 "길 안내" 하나).

import { el } from './dom.js';
import { alerts, getPaper } from './notify.js';

export function alertBands() {
  const box = el('div', { class: 'page bands' });
  function paint() {
    // 화면에 붙었다가 떨어진 뒤에는 더 그리지 않는다.
    if (box.isConnected) box.dataset.seen = '1';
    else if (box.dataset.seen) { window.removeEventListener('ces-alerts', paint); return; }
    const paper = getPaper();
    box.replaceChildren(...[
      alerts.soon.length ? el('section', { class: 'panel band' },
        el('div', { class: 'band-line' },
          el('h2', { text: `곧 시작하는 내 일정 ${alerts.soon.length}개` }),
          el('a', { class: 'pick', href: '#/days', text: '내 일정' })),
        el('ul', { class: 'dots' }, alerts.soon.slice(0, 3).map((e) => el('li', { text: `${e.inMin}분 뒤 ${e.from} · ${e.name}${e.place ? ` (${e.place})` : ''}` })))) : null,
      alerts.needs.length ? el('section', { class: 'panel band' },
        el('div', { class: 'band-line' },
          el('h2', { text: `오늘 명함 ${alerts.needs.length}장 필요` }),
          paper?.has === false ? el('a', { class: 'pick', href: '#/card', text: 'QR 명함' }) : null),
        el('p', { class: 'note', text: `${alerts.needs.slice(0, 3).map((n) => n.name).join(' · ')}${alerts.needs.length > 3 ? ' …' : ''}` })) : null,
    ].filter(Boolean));
    box.hidden = !box.childElementCount;
  }
  paint();
  window.addEventListener('ces-alerts', paint);
  return box;
}
