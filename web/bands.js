// 동선 탭 맨 위의 띠: 알림을 못 쓰는 폰에서도 같은 내용을 보인다 — 종이 명함 물음 · 곧 시작하는 일정 · 오늘 명함 몇 장.
// (첫 화면이 없어지면서 home.js에서 옮겼다.)

import { el } from './dom.js';
import { dateOf, defaultRemind } from './alerts.js';
import { alerts, checkAlerts, getPaper, setPaper } from './notify.js';

// 알림을 못 쓰는 폰에서도 같은 내용을 보이는 띠: 종이 명함 물음 · 오늘 명함 몇 장.
export function alertBands(showFrom) {
  const box = el('div', { class: 'page' });
  function paint() {
    // 화면에 붙었다가 떨어진 뒤에는 더 그리지 않는다.
    if (box.isConnected) box.dataset.seen = '1';
    else if (box.dataset.seen) { window.removeEventListener('ces-alerts', paint); return; }
    const paper = getPaper();
    const answer = (has) => { setPaper({ remindOn: defaultRemind(showFrom), ...(paper || {}), has, asked: dateOf(new Date()) }); checkAlerts(); };
    box.replaceChildren(...[
      alerts.paper ? el('section', { class: 'panel band ask' },
        el('div', { class: 'band-line' },
          el('h2', { text: alerts.paper === 'again' ? '종이 명함은 준비됐나요?' : '종이 명함이 있나요?' }),
          el('div', { class: 'actions' },
            el('button', { class: 'pick', type: 'button', text: '있다', onclick: () => answer(true) }),
            el('button', { class: 'pick', type: 'button', text: '없다', onclick: () => { answer(false); location.hash = '#/card'; } })))) : null,
      alerts.soon.length ? el('section', { class: 'panel band' },
        el('h2', { text: `곧 시작하는 일정 ${alerts.soon.length}개` }),
        el('ul', { class: 'dots' }, alerts.soon.slice(0, 3).map((e) => el('li', { text: `${e.inMin}분 뒤 ${e.from} · ${e.name}${e.place ? ` (${e.place})` : ''}` }))),
                el('div', { class: 'actions' }, el('a', { class: 'btn', href: '#/days', text: '일정' }))) : null,
      alerts.needs.length ? el('section', { class: 'panel band' },
        el('h2', { text: `오늘 명함 ${alerts.needs.length}장 필요` }),
        el('p', { text: `${alerts.needs.slice(0, 3).map((n) => n.name).join(' · ')}${alerts.needs.length > 3 ? ' …' : ''}` }),
        el('div', { class: 'actions' },
          el('a', { class: 'btn', href: '#/plan', text: '동선' }),
          paper?.has === false ? el('a', { class: 'btn ghost', href: '#/card', text: '명함' }) : null)) : null,
    ].filter(Boolean));
  }
  paint();
  window.addEventListener('ces-alerts', paint);
  return box;
}
