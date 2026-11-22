// 오가는 법: CES 공식 셔틀의 노선 · 다니는 시간 · 타는 곳. 묶음마다 칩 하나(한 번에 한 묶음), 카드마다 출처와 확인한 날짜.
// 2027 안내에서 읽지 못한 줄은 "확인 필요"로 두고 짐작해서 채우지 않는다. 자료는 data/transit.json.

import { el, out } from '../dom.js';
import { getPlaces } from '../data.js';
import { counts, GROUPS, STATUS_KO, stopLink, timetable } from '../transit.js';

const md = (date) => { const [, m, d] = date.split('-').map(Number); return `${m}/${d}`; };

export async function render() {
  const [data, places] = await Promise.all([fetch('data/transit.json').then((r) => { if (!r.ok) throw new Error(`transit ${r.status}`); return r.json(); }), getPlaces()]);
  const groups = GROUPS.filter((g) => data.lines.some((l) => g.kinds.includes(l.kind)));
  let now = groups[0].k;

  function row(line) {
    const times = timetable(data, line);
    const when = times.length ? times.map((t) => `${t.days} ${t.parts.join(' / ')}`) : (line.when ? [line.when] : []);
    return el('li', { class: 'entry' },
      el('div', { class: 'name' }, line.ko, el('span', { class: line.status === 'confirmed' ? 'tag mint' : 'tag', text: STATUS_KO[line.status] })),
      line.from || line.to ? el('div', { class: 'where', text: [line.from, line.to].filter(Boolean).join(' → ') }) : null,
      line.stops.length ? el('ul', { class: 'stack' }, line.stops.map((s) => el('li', {},
        el('span', {}, el('b', { text: `${s.ko} ` }), s.board),
        el('div', { class: 'row-actions' }, out(stopLink(places, s), '지도'))))) : null,
      line.arrive ? el('p', {}, el('b', { text: '내림 ' }), line.arrive) : null,
      when.length ? el('p', { class: 'where' }, times.length ? `${data.service.ko}` : null) : null,
      when.length ? el('ul', { class: 'stack' }, when.map((w) => el('li', { text: w }))) : null,
      line.fare ? el('p', {}, el('b', { text: '값 ' }), line.fare) : null,
      line.todo || line.note ? el('p', { class: 'note', text: line.todo || line.note }) : null,
      el('small', { class: 'proof wrap' }, `${md(line.sources[0].read)} 확인 · `, line.sources.flatMap((s, i) => [i ? ' · ' : '', out(s.url, line.sources.length > 1 ? `출처 ${i + 1}` : '출처')])));
  }

  const body = el('section', { class: 'panel', 'aria-live': 'polite' });
  const tabs = el('div', { class: 'segs', role: 'group', 'aria-label': '묶음' });
  function draw() {
    tabs.replaceChildren(...groups.map((g) => el('button', { class: 'seg', type: 'button', 'aria-pressed': g.k === now ? 'true' : 'false', text: g.ko, onclick: () => { now = g.k; draw(); } })));
    const g = groups.find((x) => x.k === now);
    const lines = data.lines.filter((l) => g.kinds.includes(l.kind));
    body.replaceChildren(el('h2', { text: `${g.ko} ${lines.length}` }), el('ul', { class: 'stack' }, lines.map(row)));
  }
  draw();

  return el('div', { class: 'page' },
    el('section', { class: 'head' },
      el('h1', { text: '오가는 법' }),
      el('p', { class: 'lead', text: `CES 공식 셔틀 · ${data.service.ko}. ${data.badge}` })),
    tabs, body,
    el('section', { class: 'foot' },
      el('p', { text: `${md(data.read)} 공식 교통 안내에서 읽었다. 라스베이거스 시간이다. 읽지 못한 줄은 "확인 필요"다.` }),
      el('p', {}, out(data.guide.url, data.guide.ko), ' · ', out(data.flyer.url, data.flyer.ko), ' · ', el('a', { href: '#/apply', text: '자율주행은 따로 신청' }))));
}
