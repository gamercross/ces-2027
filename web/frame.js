// 앱의 틀: 모든 화면이 함께 쓰는 자리 — 불러오는 중 · 비었다 · 오류 · 없는 화면 — 와 지금 있는 화면 목록.
// 새 화면은 app.js의 VIEWS에 한 줄, TAB_OF에 어느 탭 아래인지 한 줄이면 이 틀(뒤로 · 탭 표시 · 불러오는 중 · 오류)에 꽂힌다.
// 기준 문서는 ../design.md의 "메인 틀".

import { el } from './dom.js';

// app.js가 채운다. 지금 있는 화면 목록이다.
export const frame = { views: new Set() };
export const hasView = (name) => frame.views.has(name);

const online = () => typeof navigator === 'undefined' || navigator.onLine !== false;

// 불러오는 중: 조금 걸릴 때만(느린 망) 보인다. 자리를 미리 잡아 화면이 덜 튄다.
export function loading(text = '불러오는 중이다.') {
  return el('section', { class: 'panel wait', 'aria-busy': 'true', role: 'status' },
    el('p', { class: 'big', text }),
    el('p', { class: 'note', text: online() ? '망이 느리면 조금 걸린다.' : '인터넷이 없다. 폰에 담아 둔 것으로 연다.' }));
}

// 비었다: 왜 비었는지와 다음에 할 일 하나.
export function empty({ title, text, href, action }) {
  return el('section', { class: 'panel empty' },
    title ? el('h2', { text: title }) : null,
    el('p', { text }),
    href ? el('div', { class: 'actions' }, el('a', { class: 'btn', href, text: action })) : null);
}

// 오류: 무엇이 안 됐는지, 인터넷 탓인지, 다시 해 볼 단추.
export function failed({ retry, home = true } = {}) {
  return el('section', { class: 'panel notice', role: 'alert' },
    el('h2', { text: '화면을 불러오지 못했다' }),
    el('p', { text: online() ? '잠깐 망이 끊겼을 수 있다. 다시 열어 본다.' : '인터넷이 없다. 한 번 열어 둔 화면은 인터넷 없이 열린다. 이 화면은 아직 폰에 담기지 않았다.' }),
    el('div', { class: 'actions' },
      retry ? el('button', { class: 'btn', type: 'button', text: '다시 열기', onclick: retry }) : null,
      home ? el('a', { class: 'btn ghost', href: '#/map', text: '지도로' }) : null));
}

// 없는 화면: 주소가 틀렸거나 없어진 화면. 말없이 지도로 보내지 않는다.
export function missing(name) {
  return el('section', { class: 'panel' },
    el('h1', { text: '없는 화면이다' }),
    el('p', { text: `"${name}" 화면은 이 판에 없다. 새 판에서 생길 수 있다.` }),
    el('div', { class: 'actions' }, el('a', { class: 'btn', href: '#/map', text: '지도로' })));
}
