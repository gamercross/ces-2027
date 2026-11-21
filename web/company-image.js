// 회사 줄의 "로고 보기": 설정(companyImage)을 켠 판에서만 단추가 보이고, 누를 때만 로고 자료를 받아 CES 공식 사이트의 로고 주소를 연다.
// 꺼져 있으면 로고 자료도 그림 주소도 아무것도 묻지 않는다. 그림은 우리 레포에 담지 않고, 서비스 워커도 미리 담지 않는다.
// 그림을 이 화면 안에 박지 않고 새 창으로 여는 까닭: 공식 서버가 로고에 `Cross-Origin-Resource-Policy: same-site`를 달아 다른 사이트(우리 주소)가 그림을 가져다 쓰지 못하게 한다.
// 링크는 그 막힘과 상관없이 열린다.

import { el, out } from './dom.js';
import { getSettings } from './data.js';

let opened; // 로고 자료는 처음 누를 때 한 번만 받는다.
function openOnce(data) {
  opened ||= Promise.all([fetch('data/logos.json').then((r) => (r.ok ? r.json() : null)), import('./logos.js')])
    .then(([logos, mod]) => ({ mod, open: mod.openLogos(logos, data) }))
    .catch(() => ({ mod: null, open: null }))
    .then((got) => { if (!got.open) opened = null; return got; }); // 못 받았으면 다음에 다시 받아 본다
  return opened;
}

export function attachImage(li, id, name, data) {
  getSettings().then((s) => {
    if (s?.companyImage !== true) return;
    const button = el('button', { class: 'linkish', type: 'button', text: '로고 보기' });
    button.addEventListener('click', async () => {
      button.disabled = true;
      const { mod, open } = await openOnce(data);
      if (!open) { button.disabled = false; button.textContent = '로고를 못 불러왔다. 다시 누른다'; return; }
      const url = mod.logoUrl(open, id);
      if (!url) { button.replaceWith(el('small', { class: 'note', text: '공식 자료에 로고가 없다' })); return; }
      const link = out(url, '로고 열기 (공식 사이트 · 새 창)');
      link.setAttribute('aria-label', `${name} 로고를 CES 공식 사이트에서 새 창으로 열기`);
      button.replaceWith(link);
    });
    // 줄 맨 아래에 따로 둔다 (위 단추 줄이 좁다).
    li.append(el('div', { class: 'row-actions' }, button));
  }).catch(() => {});
}
