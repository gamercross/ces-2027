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

  let now = data.sections[0].k;
  const tabs = el('div', { class: 'segs', role: 'group', 'aria-label': '묶음' });
  const body = el('section', { class: 'panel', 'aria-live': 'polite' });
  function draw() {
    tabs.replaceChildren(...data.sections.map((s) => el('button', { class: 'seg', type: 'button', 'aria-pressed': s.k === now ? 'true' : 'false', text: s.ko.split(' · ')[0], onclick: () => { now = s.k; draw(); } })));
    const s = data.sections.find((x) => x.k === now);
    body.replaceChildren(
      el('h2', { text: s.ko }),
      s.note ? el('p', { class: 'note', text: s.note }) : null,
      s.k === 'urgent' ? el('p', { class: 'note', text: data.urgent.extra }) : null,
      el('ul', { class: 'stack' }, s.lines.map((l) => line(s, l))),
      proof(data.sources[s.src]));
  }
  draw();

  return el('div', { class: 'page' },
    el('section', { class: 'head' },
      el('h1', { text: '현장 안내' }),
      el('p', { class: 'lead', text: '이 앱은 신고를 받지 않는다. 번호를 누르면 전화가 걸린다.' })),
    tabs, body,
    el('section', { class: 'foot' }, el('p', { text: `${md(data.read)} CES 공식 안내에서 읽었다. ${String(data.recheck).split(/(?<=[.다])\s+/)[0]}` })));
}
