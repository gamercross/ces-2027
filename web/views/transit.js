// 오가는 법: CES 공식 셔틀의 노선 · 다니는 시간 · 타는 곳을 한곳에 모았다. 줄마다 출처와 확인한 날짜를 보인다.
// 2027 안내에서 읽지 못한 줄은 "확인 필요"로 두고 짐작해서 채우지 않는다. 자료는 data/transit.json.

import { el, out } from '../dom.js';
import { getPlaces } from '../data.js';
import { counts, GROUPS, STATUS_KO, stopLink, timetable } from '../transit.js';

const md = (date) => { const [, m, d] = date.split('-').map(Number); return `${m}/${d}`; };

export async function render() {
  const [data, places] = await Promise.all([fetch('data/transit.json').then((r) => { if (!r.ok) throw new Error(`transit ${r.status}`); return r.json(); }), getPlaces()]);
  const n = counts(data);

  function row(line) {
    const times = timetable(data, line);
    return el('li', { class: 'entry' },
      el('div', { class: 'name' }, line.ko, el('span', { class: line.status === 'confirmed' ? 'tag mint' : 'tag', text: STATUS_KO[line.status] })),
      line.from || line.to ? el('div', { class: 'where', text: [line.from, line.to].filter(Boolean).join(' → ') }) : null,
      line.stops.length ? el('p', {}, el('b', { text: '타는 곳' })) : null,
      line.stops.length ? el('ul', { class: 'stack' }, line.stops.map((s) => el('li', {},
        el('span', {}, el('b', { text: `${s.ko} ` }), s.board),
        el('div', { class: 'row-actions' }, out(stopLink(places, s), '구글맵에서 열기'))))) : null,
      line.arrive ? el('p', {}, el('b', { text: '내리는 곳 ' }), line.arrive) : null,
      times.length ? el('p', {}, el('b', { text: '언제 ' }), `${data.service.ko} 사이에 다닌다.`) : (line.when ? el('p', {}, el('b', { text: '언제 ' }), line.when) : null),
      times.length ? el('ul', { class: 'stack' }, times.map((t) => el('li', {}, el('b', { text: t.days }), el('span', { text: t.parts.join(' / ') })))) : null,
      line.fare ? el('p', {}, el('b', { text: '값 ' }), line.fare) : null,
      line.note ? el('p', { text: line.note }) : null,
      line.todo ? el('p', {}, el('b', { text: '할 일 ' }), line.todo) : null,
      el('small', { class: 'proof wrap' }, `${md(line.sources[0].read)} 확인 · `, line.sources.flatMap((s, i) => [i ? ' · ' : '', out(s.url, s.ko)])));
  }

  return el('div', { class: 'page' },
    el('section', { class: 'panel' },
      el('h1', { text: '오가는 법' }),
      el('p', { class: 'lead', text: `CES 공식 셔틀(${data.service.ko})과 그 밖의 길을 한곳에 모았다.` }),
      el('p', { class: 'note', text: `${md(data.read)}에 CES 공식 교통 안내와 CES 2027 무료 교통 전단에서 읽은 것이다. 2027 안내에서 읽지 못한 줄과 안내끼리 어긋나는 줄은 "확인 필요"로 두었다. 짐작해서 채우지 않았고, 작년 시간표는 쓰지 않았다.` }),
      el('p', { class: 'note', text: `${data.badge} 시간은 라스베이거스 시간이다.` }),
      el('p', { text: `줄 ${n.total}개: 2027 안내에서 확인한 것 ${n.confirmed} · 확인 필요 ${n.check}` }),
      el('p', { class: 'note', text: data.recheck }),
      el('small', { class: 'proof wrap' }, `${md(data.guide.read)} 확인 · `, out(data.guide.url, data.guide.ko), ' · ', out(data.flyer.url, data.flyer.ko))),
    ...GROUPS.map((g) => {
      const lines = data.lines.filter((l) => g.kinds.includes(l.kind));
      return lines.length ? el('section', { class: 'panel' }, el('h2', { text: `${g.ko} ${lines.length}` }), el('ul', { class: 'stack' }, lines.map(row))) : null;
    }),
    el('section', { class: 'panel' },
      el('h2', { text: '자율주행 이동' }),
      el('p', { text: 'Waymo · Zoox 같은 자율주행 택시는 CES 셔틀이 아니다. 앱을 받아 두어야 하고, 요금은 앱에서 본다.' }),
      el('div', { class: 'actions' }, el('a', { class: 'btn', href: '#/apply', text: '자율주행 이동 보기' }))),
    el('div', { class: 'dock' }, el('a', { class: 'btn', href: '#/', text: '첫 화면으로' }), el('a', { class: 'btn ghost', href: '#/map', text: '지도' })));
}
