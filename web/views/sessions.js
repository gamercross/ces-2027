// 강연 일정(공식 일정의 세션): CES 공식 일정(기조연설 · 세션)을 날짜별로 보고, 낱말로 찾고, 내 일정에 넣는다.
// 자료(data/sessions.json)는 빌드 때 공식 사이트에서 받아 둔 것이다. 못 받은 날에는 못 받았다고 보이고, 짐작해 채우지 않는다.
// 이 화면은 누를 때 불러온다. 내 일정은 폰에만 남는다.

import { el, out } from '../dom.js';
import { getEvents, setEvents } from '../store.js';
import { clean, daysOf, isIn, isKeynote, onDay, recommendWithSkips, search, shareText, toggle } from '../sessions.js';
import { placeLink } from './days.js';
import { getInfo, getPlaces } from '../data.js';
import { dayList } from '../days.js';
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
      el('h1', { text: '강연 일정' }),
      el('p', { text: '공식 일정을 받아 두지 못했다. 공식 쪽에서 직접 본다.' }),
            el('div', { class: 'actions' }, out(OFFICIAL, '공식 일정', 'btn'), el('a', { class: 'btn ghost', href: '#/days', text: '내 일정' }))));
  }

  const places = await getPlaces().catch(() => null);
  // 날짜 칩은 1/5(전시 전날) ~ 1/9. 1/4는 매체 전용이라 칩에 넣지 않는다(찾기에서는 나온다).
  const info = await getInfo().catch(() => null);
  const planDates = new Set(info ? dayList(info).map((d) => d.date) : []);
  const allDays = daysOf(data.items);
  const days = planDates.size && allDays.some((d) => planDates.has(d)) ? allDays.filter((d) => planDates.has(d)) : allDays;
  let day = days.find((d) => d >= '2027-01-06') || days[0];
  let q = '';
  let shown = 7;
  let recShown = 2;
  const status = el('p', { class: 'note', role: 'status' });
  const list = el('ul', { class: 'stack' });
  const tabs = el('div', { class: 'segs', role: 'group', 'aria-label': '날짜' });
  const count = el('h2');
  const box = el('input', { type: 'search', placeholder: '찾기 (예: AI, robot)', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', 'aria-label': '강연 찾기' });
  const recBox = el('div', { class: 'page' });

  // 강연 하나를 남에게 건넨다: 폰의 나누기 창이 있으면 그것, 없으면 글을 복사한다. 우리 서버는 거치지 않는다.
  async function share(s) {
    const text = shareText(s);
    try {
      if (navigator.share) { await navigator.share({ title: s.title, text }); status.textContent = ''; return; }
    } catch (e) { if (e?.name === 'AbortError') return; }
    try {
      await navigator.clipboard.writeText(text);
      status.textContent = '복사했다. 단톡방에 붙여 넣는다.';
    } catch {
      status.textContent = `복사하지 못했다: ${text.replace(/\n/g, ' / ')}`;
    }
  }

  function row(s, withDate) {
    const mine = isIn(s, getEvents());
    const link = places && s.place ? placeLink(places, s.place) : null;
    return el('li', { class: 'entry session' },
      el('div', { class: 'name' }, el('span', { class: 'title', text: s.title }),
        isKeynote(s) ? el('span', { class: 'tag mint', text: '기조연설' }) : null,
        s.live ? el('span', { class: 'tag', text: '생중계' }) : null),
      el('div', { class: 'where one', text: `${withDate ? `${dayKo(s.date)} ` : ''}${s.from} ~ ${s.to}${s.place ? ` · ${s.place}` : ' · 장소 미정'}` }),
      s.track || s.topics?.length ? el('div', { class: 'where one', text: [s.track, ...(s.topics || [])].filter(Boolean).join(' · ') }) : null,
      el('div', { class: 'row-actions' },
        el('button', { class: 'pick', type: 'button', 'aria-pressed': mine ? 'true' : 'false', text: mine ? '내 일정에서 빼기' : '내 일정에 넣기', onclick: () => {
          const next = toggle(s, getEvents());
          if (next.added === null) { status.textContent = '시간이 맞지 않아 넣지 못했다.'; return; }
          setEvents(next.events);
          status.textContent = next.added ? '내 일정에 넣었다.' : '내 일정에서 뺐다.';
          draw();
        } }),
        out(s.url, '공식 쪽'),
        link ? out(link, '지도') : null,
        el('button', { class: 'linkish', type: 'button', text: '보내기', 'aria-label': `${s.title} 다른 사람에게 보내기`, onclick: () => share(s) })));
  }

  function draw() {
    const mineCount = data.items.filter((s) => isIn(s, getEvents())).length;
    tabs.replaceChildren(...days.map((d) => {
      const n = onDay(data.items, d).length;
      return el('button', { class: 'seg daychip', type: 'button', 'aria-pressed': !q && d === day ? 'true' : 'false', 'aria-label': `${dayKo(d)} 강연 ${n}개`, onclick: () => { day = d; q = ''; shown = 7; box.value = ''; draw(); } },
        el('span', { class: 'dc-day', text: dayKo(d).replace(/ \(.*\)/, '') }), el('span', { class: 'dc-n', text: `${n}개` }));
    }));
    const found = q ? search(data.items, q).sort((a, b) => a.date.localeCompare(b.date) || a.from.localeCompare(b.from)) : onDay(data.items, day);
    count.textContent = q ? `찾은 강연 ${found.length}개` : `${dayKo(day)} ${found.length}개${mineCount ? ` · 내 일정 ${mineCount}` : ''}`;
    const { picks, skipped } = recommendWithSkips(data.items, getTopics(), getEvents());
    recBox.replaceChildren(...(picks.length ? [el('section', { class: 'panel' },
      el('h2', { text: `내 주제 강연 ${picks.length}개${skipped ? ` · 때가 겹쳐 ${skipped}개 뺌` : ''}` }),
      el('ul', { class: 'stack' }, picks.slice(0, recShown).map((s) => row(s, true))),
      picks.length > recShown ? el('button', { class: 'btn ghost wide', type: 'button', text: `더 보기 (${picks.length - recShown}개 남음)`, onclick: () => { recShown += 4; draw(); } }) : null)] : []));
    list.replaceChildren(...(found.length ? found.slice(0, shown).map((s) => row(s, !!q)) : [el('li', { class: 'note', text: '맞는 강연이 없다. 다른 낱말로 찾는다.' })]),
      ...(found.length > shown ? [el('li', {}, el('button', { class: 'btn ghost wide', type: 'button', text: `더 보기 (${found.length - shown}개 남음)`, onclick: () => { shown += 10; draw(); } }))] : []));
  }
  box.addEventListener('input', () => { q = box.value.trim(); shown = 7; draw(); });

  draw();
  return el('div', { class: 'page' },
    el('section', { class: 'head' },
      el('h1', { text: '강연 일정' }),
      el('p', { class: 'lead', text: '넣으면 갈 곳과 지도에도 보인다. 시각은 라스베이거스 기준이다.' })),
    el('div', { class: 'page' }, box, tabs, status),
    recBox,
    el('section', { class: 'panel' }, count, list),
    el('section', { class: 'foot' },
      el('p', {}, `라스베이거스 시각 · 바뀔 수 있다 · ${stamp(data.v)} 받음 · `, out(data.source?.url || OFFICIAL, '출처'), data.skipped ? ` · 못 읽은 카드 ${data.skipped}` : ''),
      el('div', { class: 'actions' }, el('a', { class: 'btn ghost', href: '#/plan', text: '갈 곳' }), el('a', { class: 'btn ghost', href: '#/days', text: '내 일정' }))));
}
