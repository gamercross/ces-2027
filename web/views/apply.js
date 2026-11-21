// 따로 신청하는 곳: CES 배지 말고 따로 신청 · 표 · 초대가 있어야 하는 곳, 배지만 있으면 되는 큰 일정, 자율주행 이동.
// 줄마다 출처와 확인한 날짜를 보인다. 2027 안내가 없는 줄은 "확인 필요"와 작년에 한 것을 보인다. 표시는 폰에만 남는다.

import { el, out } from '../dom.js';
import { getPlaces, getSeparate } from '../data.js';
import { getEvents, load, save, setEvents } from '../store.js';
import { canPlan, dueSoon, STATUS_KO, toggleApplied, toWatch } from '../separate.js';
import { placeLink } from './days.js';

const pad = (n) => String(n).padStart(2, '0');
const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const md = (date) => { const [, m, d] = date.split('-').map(Number); return `${m}/${d}`; };
const MARK = { watch: ['안내를 봤다', '안내를 봤다고 표시함'], apply: ['신청함', '신청했다고 표시함'], badge: ['갈 것', '가기로 표시함'], press: null, ride: ['앱을 받았다', '앱을 받았다고 표시함'] };

export async function render() {
  const [data, places] = await Promise.all([getSeparate(), getPlaces()]);
  const holder = el('div', { class: 'page' });
  const status = el('p', { class: 'note', role: 'status' });
  save('separateSeen.v1', today());

  function row(it) {
    const applied = load('applied.v1', {});
    const on = !!applied[it.id];
    const when = it.date ? `${md(it.date)}${it.from ? ` ${it.from}${it.to ? ` ~ ${it.to}` : ''}` : ''}` : '';
    const link = it.place ? placeLink(places, it.place) : null;
    // 표시할 것이 없는 줄(운영팀이 해 주는 배지)은 단추를 두지 않는다.
    const mark = it.mark === false ? null : MARK[it.group];
    return el('li', { class: 'entry' },
      el('div', { class: 'name' }, `${it.org} · ${it.what}`, el('span', { class: it.status === 'confirmed' ? 'tag mint' : 'tag', text: STATUS_KO[it.status] })),
      el('div', { class: 'where', text: [when, it.where].filter(Boolean).join(' · ') }),
      el('p', {}, el('b', { text: '누가 ' }), it.who),
      el('p', {}, el('b', { text: '신청 ' }), it.apply.url ? out(it.apply.url, it.apply.ko) : it.apply.ko),
      it.last ? el('p', {}, el('b', { text: '작년 ' }), it.last) : null,
      it.todo ? el('p', {}, el('b', { text: '할 일 ' }), it.todo) : null,
      it.watchFrom && it.status === 'check' ? el('p', { class: 'note', text: `${md(it.watchFrom)}부터 다시 본다.` }) : null,
      el('small', { class: 'proof wrap' }, `${md(it.sources[0].read)} 확인 · `, it.sources.flatMap((s, i) => [i ? ' · ' : '', out(s.url, s.ko)])),
      el('div', { class: 'row-actions' },
        mark ? el('button', { class: 'pick', type: 'button', 'aria-pressed': on ? 'true' : 'false', text: on ? mark[1] : mark[0], onclick: () => {
          const next = toggleApplied(it, load('applied.v1', {}), getEvents(), today());
          save('applied.v1', next.applied);
          setEvents(next.events);
          status.textContent = next.applied[it.id]
            ? `"${it.org}"에 표시했다.${canPlan(it) ? ' 내 일정에 넣었다. 동선과 지도에 같이 보인다.' : ''}`
            : `"${it.org}"의 표시를 풀었다.${canPlan(it) ? ' 내 일정에서도 뺐다.' : ''}`;
          draw();
        } }) : null,
        link ? out(link, '구글맵에서 열기') : null));
  }

  function draw() {
    const applied = load('applied.v1', {});
    const due = dueSoon(data.items, applied, today());
    const watch = toWatch(data.items, today());
    holder.replaceChildren(...[
      el('section', { class: 'panel' },
        el('h1', { text: '따로 신청하는 곳' }),
        el('p', { class: 'lead', text: 'CES 배지 말고 따로 신청 · 표 · 초대가 있어야 하는 곳과, 배지만 있으면 되는 큰 일정을 모았다.' }),
        el('p', { class: 'note', text: `${md(data.read)}에 CES 공식 사이트와 회사 공식 사이트에서 읽은 것이다. 2027 안내가 아직 없는 곳은 "확인 필요"로 두고 작년에 한 것을 적었다. 짐작해서 채우지 않았다. 표시는 이 폰에만 남는다.` }),
        status),
      due.length ? el('section', { class: 'panel band ask' }, el('h2', { text: '마감이 가깝다' }), el('ul', { class: 'dots' }, due.map((x) => el('li', { text: `${x.item.org} ${x.item.what}: ${x.left === 0 ? '오늘까지' : `${x.left}일 남음`} (${md(x.item.deadline)})` })))) : null,
      watch.length ? el('section', { class: 'panel band' }, el('h2', { text: '2027 안내가 나왔는지 볼 때다' }), el('ul', { class: 'dots' }, watch.map((it) => el('li', { text: `${it.org}: ${it.todo}` })))) : null,
      ...data.groups.map((g) => {
        const items = data.items.filter((it) => it.group === g.k);
        return items.length ? el('section', { class: 'panel' }, el('h2', { text: `${g.ko} ${items.length}` }), el('p', { class: 'note', text: g.note }), el('ul', { class: 'stack' }, items.map(row))) : null;
      }),
      el('div', { class: 'dock' }, el('a', { class: 'btn', href: '#/', text: '첫 화면으로' }), el('a', { class: 'btn ghost', href: '#/days', text: '시간과 일정' })),
    ].filter(Boolean));
  }
  draw();
  return holder;
}
