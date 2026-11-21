// 현장 안내: 급할 때 · 들어갈 때 · 도움이 필요할 때를 한곳에 모았다. 줄마다 출처와 읽은 날짜를 보인다.
// 이 앱은 신고를 받지 않는다. 공식 안내의 번호를 옮겨 적었고, 누르면 전화 앱이 열린다. 자료는 data/onsite.json (인터넷 없이도 열린다).

import { el, out } from '../dom.js';
import { getOnsite } from '../data.js';
import { clean, sourceOf, telsOf } from '../onsite.js';

const md = (date) => { const [, m, d] = date.split('-').map(Number); return `${m}/${d}`; };

export async function render() {
  const data = clean(await getOnsite().catch(() => null));
  if (!data) {
    return el('div', { class: 'page' }, el('section', { class: 'panel' },
      el('h1', { text: '현장 안내' }),
      el('p', { text: '현장 안내 자료를 읽지 못했다. 공식 안내에서 직접 본다.' }),
      el('div', { class: 'actions' }, out('https://www.ces.tech/attendee-guides/on-site-services/', 'CES 공식 현장 서비스', 'btn'), el('a', { class: 'btn ghost', href: '#/', text: '첫 화면으로' }))));
  }

  function line(section, l) {
    const src = sourceOf(data, section, l);
    const tels = telsOf(l);
    return el('li', { class: 'entry' },
      el('div', { class: 'name', text: l.ko }),
      l.text ? el('p', { text: l.text }) : null,
      l.dial ? el('div', { class: 'where', text: l.dial }) : null,
      tels.length || l.mail ? el('div', { class: 'row-actions' },
        tels.map((t) => el('a', { class: 'pick', href: t.href, text: `전화 ${t.tel}` })),
        l.mail ? out(`mailto:${l.mail}`, `이메일 ${l.mail}`) : null) : null,
      l.src ? proof(src) : null);
  }
  const proof = (src) => el('small', { class: 'proof wrap' }, `${md(src.read)} 확인 · `, out(src.url, src.ko));

  return el('div', { class: 'page' },
    el('section', { class: 'panel' },
      el('h1', { text: '현장 안내' }),
      el('p', { class: 'lead', text: '급할 때 · 들어갈 때 · 도움이 필요할 때를 한곳에 모았다.' }),
      el('p', { class: 'tag', text: '이 앱은 신고를 받지 않는다' }),
      el('p', { class: 'note', text: data.notice })),
    ...data.sections.map((s) => el('section', { class: 'panel', id: `onsite-${s.k}` },
      el('h2', { text: s.ko }),
      s.note ? el('p', { class: 'note', text: s.note }) : null,
      s.k === 'urgent' ? el('p', { class: 'note', text: data.urgent.extra }) : null,
      el('ul', { class: 'stack' }, s.lines.map((l) => line(s, l))),
      proof(data.sources[s.src]))),
    el('section', { class: 'panel' },
      el('h2', { text: '이 글을 읽는 법' }),
      el('p', { class: 'note', text: `${md(data.read)}에 CES 공식 안내 두 쪽에서 읽은 것이다. 공식 안내가 말한 것만 적었고, 줄마다 출처가 있다.` }),
      el('p', { class: 'note', text: data.recheck })),
    el('div', { class: 'dock' }, el('a', { class: 'btn', href: '#/', text: '첫 화면으로' }), el('a', { class: 'btn ghost', href: '#/q', text: '물어보기' })));
}
