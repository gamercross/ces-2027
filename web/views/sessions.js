// 세션 일정: CES 공식 일정(기조연설 · 세션)을 날짜별로 보고, 낱말로 찾고, 내 일정에 넣는다.
// 자료(data/sessions.json)는 빌드 때 공식 사이트에서 받아 둔 것이다. 못 받은 날에는 못 받았다고 보이고, 짐작해 채우지 않는다.
// 이 화면은 누를 때 불러온다. 내 일정은 폰에만 남는다.

import { el, out } from '../dom.js';
import { getEvents, setEvents } from '../store.js';
import { clean, daysOf, isIn, isKeynote, onDay, recommend, search, toggle } from '../sessions.js';
import { placeLink } from './days.js';
import { getPlaces } from '../data.js';
import { getTopics } from '../store.js';

const dayKo = (date) => { const [, m, d] = date.split('-').map(Number); return `${m}/${d} (${'일월화수목금토'[new Date(`${date}T00:00:00`).getDay()]})`; };
const stamp = (v) => { const [y, m, d] = String(v).slice(0, 10).split('-'); return `${y}.${Number(m)}.${Number(d)}`; };
const OFFICIAL = 'https://www.ces.tech/schedule/';

async function load() {
  const res = await fetch('data/sessions.json');
  if (!res.ok) throw new Error(`sessions ${res.status}`);
  return clean(await res.json());
}

export async function render() {
  let data = null;
  try { data = await load(); } catch { data = null; }
  if (!data) {
    return el('div', { class: 'page' }, el('section', { class: 'panel' },
      el('h1', { text: '세션 일정' }),
      el('p', { text: '공식 일정을 받아 두지 못했다. 이번 판에는 세션 목록이 없다.' }),
      el('p', { class: 'note', text: '짐작해서 채우지 않는다. 아래 공식 일정에서 직접 본다. 내 일정과 동선은 그대로 쓸 수 있다.' }),
      el('div', { class: 'actions' }, out(OFFICIAL, 'CES 공식 일정 열기', 'btn'), el('a', { class: 'btn ghost', href: '#/days', text: '시간과 일정' }))));
  }

  const places = await getPlaces().catch(() => null);
  const days = daysOf(data.items);
  let day = days.find((d) => d >= '2027-01-06') || days[0];
  let q = '';
  const status = el('p', { class: 'note', role: 'status' });
  const list = el('ul', { class: 'stack' });
  const tabs = el('div', { class: 'segs', role: 'group', 'aria-label': '날짜' });
  const count = el('h2');
  const box = el('input', { type: 'search', placeholder: '낱말로 찾기 (예: AI, robot, Hyundai)', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', 'aria-label': '세션 찾기' });
  const recs = recommend(data.items, getTopics());

  function row(s, withDate) {
    const mine = isIn(s, getEvents());
    const link = places && s.place ? placeLink(places, s.place) : null;
    return el('li', { class: 'entry' },
      el('div', { class: 'name' }, s.title,
        isKeynote(s) ? el('span', { class: 'tag mint', text: '기조연설' }) : null,
        s.live ? el('span', { class: 'tag', text: '라이브 표시' }) : null),
      el('div', { class: 'where', text: `${withDate ? `${dayKo(s.date)} ` : ''}${s.from} ~ ${s.to}${s.place ? ` · ${s.place}` : ' · 장소 안내 없음'}` }),
      s.track || s.topics?.length ? el('div', { class: 'where', text: [s.track, ...(s.topics || [])].filter(Boolean).join(' · ') }) : null,
      el('div', { class: 'row-actions' },
        el('button', { class: 'pick', type: 'button', 'aria-pressed': mine ? 'true' : 'false', text: mine ? '내 일정에서 빼기' : '내 일정에 넣기', onclick: () => {
          const next = toggle(s, getEvents());
          if (next.added === null) { status.textContent = '이 세션은 시간이 맞지 않아 넣지 못했다.'; return; }
          setEvents(next.events);
          status.textContent = next.added ? `"${s.title}"을(를) 내 일정에 넣었다. 동선과 지도에 같이 보인다.` : `"${s.title}"을(를) 내 일정에서 뺐다.`;
          draw();
        } }),
        out(s.url, '공식 쪽'),
        link ? out(link, '구글맵') : null));
  }

  function draw() {
    const mineCount = data.items.filter((s) => isIn(s, getEvents())).length;
    tabs.replaceChildren(...days.map((d) => {
      const n = onDay(data.items, d).length;
      return el('button', { class: 'seg', type: 'button', 'aria-pressed': !q && d === day ? 'true' : 'false', text: `${dayKo(d)} ${n}`, onclick: () => { day = d; q = ''; box.value = ''; draw(); } });
    }));
    const found = q ? search(data.items, q).sort((a, b) => a.date.localeCompare(b.date) || a.from.localeCompare(b.from)) : onDay(data.items, day);
    count.textContent = q ? `찾은 세션 ${found.length}개` : `${dayKo(day)} 세션 ${found.length}개 · 내 일정에 넣은 것 ${mineCount}개`;
    list.replaceChildren(...(found.length ? found.map((s) => row(s, !!q)) : [el('li', { class: 'note', text: '맞는 세션이 없다. 다른 낱말로 찾아 본다.' })]));
  }
  box.addEventListener('input', () => { q = box.value.trim(); draw(); });

  draw();
  return el('div', { class: 'page' },
    el('section', { class: 'panel' },
      el('h1', { text: '세션 일정' }),
      el('p', { class: 'lead', text: 'CES 공식 일정의 기조연설과 세션이다. 하나를 내 일정에 넣으면 동선과 지도에 같이 보인다.' }),
      el('p', { class: 'note', text: '시각은 라스베이거스 시각이다. 일정은 바뀔 수 있다 — 운영팀 안내가 먼저다. 세션은 먼저 온 사람부터 앉는다(공식 안내).' }),
      el('p', { class: 'note' }, `${stamp(data.v)}에 받았다 · 출처 `, out(data.source?.url || OFFICIAL, data.source?.ko || 'CES 공식 일정'), `${data.skipped ? ` · 읽지 못한 카드 ${data.skipped}개` : ''}`),
      el('p', { class: 'note', text: '"라이브 표시"는 공식 목록에 붙은 생중계 표시다. 보는 주소는 목록에 없어서 공식 쪽에서 확인한다. 다시 보기 주소는 목록에 없다.' }),
      el('label', { class: 'field' }, el('span', { class: 'label', text: '찾기' }), box),
      tabs,
      status),
    recs.length ? el('section', { class: 'panel' },
      el('h2', { text: '내 주제와 맞는 세션' }),
      el('p', { class: 'note', text: '주제 판의 이름과 분야로 공식 세션을 거른 뒤, 먼저 오는 열 곳을 보인다.' }),
      el('ul', { class: 'stack' }, recs.map((s) => row(s, true)))) : null,
    el('section', { class: 'panel' }, count, list),
    el('section', { class: 'foot' }, el('div', { class: 'actions' }, el('a', { class: 'btn ghost', href: '#/plan', text: '동선 보기' }), el('a', { class: 'btn ghost', href: '#/days', text: '시간과 일정' }))));
}
