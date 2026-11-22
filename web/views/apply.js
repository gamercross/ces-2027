// 따로 신청하는 곳: CES 배지 말고 따로 신청 · 표 · 초대가 있어야 하는 곳, 배지만 있으면 되는 큰 일정, 자율주행 이동.
// 묶음마다 칩 하나(한 번에 한 묶음), 카드마다 이름 · 장소 · 할 일 한 줄 · 출처. 표시는 폰에만 남는다.

import { el, out } from '../dom.js';
import { getPlaces, getSeparate } from '../data.js';
import { getEvents, load, save, setEvents } from '../store.js';
import { canPlan, dueSoon, STATUS_KO, toggleApplied, toWatch } from '../separate.js';
import { placeLink } from './days.js';

const pad = (n) => String(n).padStart(2, '0');
const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const md = (date) => { const [, m, d] = date.split('-').map(Number); return `${m}/${d}`; };
const MARK = { watch: ['봤다', '봤음'], apply: ['신청했다', '신청함'], badge: ['갈 것', '갈 예정'], press: null, ride: ['앱 받음', '받았음'] };

const first = (t) => String(t || '').split(/(?<=[.다])\s+/)[0];
const CHIP = { watch: '안내 전', apply: '신청', badge: '배지만', press: '보도만', ride: '자율주행', reference: '참고' };

export async function render() {
  const [data, places] = await Promise.all([getSeparate(), getPlaces()]);
  const holder = el('div', { class: 'page' });
  const status = el('p', { class: 'note', role: 'status' });
  save('separateSeen.v1', today());
  const groups = data.groups.filter((g) => data.items.some((it) => it.group === g.k));
  let now = groups[0]?.k;

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
      el('p', { text: first(it.todo || it.who) }),
      it.group === 'watch' && it.last ? el('p', { class: 'note', text: first(it.last) }) : null,
      el('div', { class: 'row-actions' },
        mark ? el('button', { class: 'pick', type: 'button', 'aria-pressed': on ? 'true' : 'false', text: on ? mark[1] : mark[0], onclick: () => {
          const next = toggleApplied(it, load('applied.v1', {}), getEvents(), today());
          save('applied.v1', next.applied);
          setEvents(next.events);
          status.textContent = next.applied[it.id] ? `표시했다.${canPlan(it) ? ' 내 일정에도 넣었다.' : ''}` : `표시를 풀었다.${canPlan(it) ? ' 내 일정에서도 뺐다.' : ''}`;
          draw();
        } }) : null,
        it.apply.url ? out(it.apply.url, '신청') : null,
        link ? out(link, '지도') : null,
        ...it.sources.map((s, i) => out(s.url, it.sources.length > 1 ? `출처 ${i + 1}` : '출처'))),
      el('small', { class: 'proof', text: `${md(it.sources[0].read)} 확인${it.group === 'reference' ? ' · 기사만 근거' : ''}` }));
  }

  function draw() {
    const applied = load('applied.v1', {});
    const due = dueSoon(data.items, applied, today());
    const watch = toWatch(data.items, today());
    const g = groups.find((x) => x.k === now) || groups[0];
    const items = data.items.filter((it) => it.group === g.k);
    holder.replaceChildren(...[
      el('section', { class: 'head' },
        el('h1', { text: '따로 신청' }),
        el('p', { class: 'lead', text: '배지 말고 표나 신청이 필요한 곳.' })),
      due.length ? el('section', { class: 'panel band ask' }, el('h2', { text: '마감이 가깝다' }), el('ul', { class: 'dots' }, due.map((x) => el('li', { text: `${x.item.org} ${x.item.what}: ${x.left === 0 ? '오늘까지' : `${x.left}일 남음`}` })))) : null,
      watch.length ? el('section', { class: 'panel band' }, el('h2', { text: '2027 안내가 나왔나' }), el('ul', { class: 'dots' }, watch.map((it) => el('li', { text: `${it.org}: ${first(it.todo)}` })))) : null,
      el('div', { class: 'segs', role: 'group', 'aria-label': '묶음' }, groups.map((x) => el('button', { class: 'seg', type: 'button', 'aria-pressed': x.k === g.k ? 'true' : 'false', text: `${CHIP[x.k] || x.ko} ${data.items.filter((it) => it.group === x.k).length}`, onclick: () => { now = x.k; draw(); } }))),
      status,
      el('section', { class: 'panel' }, el('h2', { text: g.ko }), el('p', { class: 'note', text: first(g.note) }), el('ul', { class: 'stack' }, items.map(row))),
      el('section', { class: 'foot' }, el('p', { text: `${md(data.read)} CES · 회사 공식 사이트에서 읽었다. 짐작해 채우지 않았다. 표시는 이 폰에만 남는다.` })),
    ].filter(Boolean));
  }
  draw();
  return holder;
}
