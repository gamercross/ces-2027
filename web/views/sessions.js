// 세션 일정: CES 공식 일정(기조연설 · 세션)을 날짜별로 보고, 낱말로 찾고, 내 일정에 넣는다.
// 자료(data/sessions.json)는 빌드 때 공식 사이트에서 받아 둔 것이다. 못 받은 날에는 못 받았다고 보이고, 짐작해 채우지 않는다.
// 이 화면은 누를 때 불러온다. 내 일정은 폰에만 남는다.

import { el, out } from '../dom.js';
import { getEvents, setEvents } from '../store.js';
import { clean, daysOf, isIn, isKeynote, onDay, recommendWithSkips, search, shareText, toggle } from '../sessions.js';
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
      el('p', { text: '공식 일정을 받아 두지 못했다. 공식 쪽에서 직접 본다.' }),
            el('div', { class: 'actions' }, out(OFFICIAL, '공식 일정', 'btn'), el('a', { class: 'btn ghost', href: '#/days', text: '내 일정' }))));
  }

  const places = await getPlaces().catch(() => null);
  const days = daysOf(data.items);
  let day = days.find((d) => d >= '2027-01-06') || days[0];
  let q = '';
  let shown = 10;
  const status = el('p', { class: 'note', role: 'status' });
  const list = el('ul', { class: 'stack' });
  const tabs = el('div', { class: 'segs', role: 'group', 'aria-label': '날짜' });
  const count = el('h2');
  const box = el('input', { type: 'search', placeholder: '찾기 (예: AI, robot)', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', 'aria-label': '세션 찾기' });
  const recBox = el('div', { class: 'page' });

  // 세션을 남에게 건넨다: 폰의 나누기 창이 있으면 그것, 없으면 글을 복사한다. 우리 서버는 거치지 않는다.
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
    return el('li', { class: 'entry' },
      el('div', { class: 'name' }, s.title,
        isKeynote(s) ? el('span', { class: 'tag mint', text: '기조연설' }) : null,
        s.live ? el('span', { class: 'tag', text: '생중계' }) : null),
      el('div', { class: 'where', text: `${withDate ? `${dayKo(s.date)} ` : ''}${s.from} ~ ${s.to}${s.place ? ` · ${s.place}` : ' · 장소 미정'}` }),
      s.track || s.topics?.length ? el('div', { class: 'where', text: [s.track, ...(s.topics || [])].filter(Boolean).join(' · ') }) : null,
      el('div', { class: 'row-actions' },
        el('button', { class: 'pick', type: 'button', 'aria-pressed': mine ? 'true' : 'false', text: mine ? '빼기' : '넣기', onclick: () => {
          const next = toggle(s, getEvents());
          if (next.added === null) { status.textContent = '시간이 맞지 않아 넣지 못했다.'; return; }
          setEvents(next.events);
          status.textContent = next.added ? '내 일정에 넣었다.' : '내 일정에서 뺐다.';
          draw();
        } }),
        el('button', { class: 'linkish', type: 'button', text: '나누기', onclick: () => share(s) }),
        out(s.url, '공식'),
        link ? out(link, '지도') : null));
  }

  function draw() {
    const mineCount = data.items.filter((s) => isIn(s, getEvents())).length;
    tabs.replaceChildren(...days.map((d) => {
      const n = onDay(data.items, d).length;
      return el('button', { class: 'seg', type: 'button', 'aria-pressed': !q && d === day ? 'true' : 'false', text: `${dayKo(d)} ${n}`, onclick: () => { day = d; q = ''; shown = 10; box.value = ''; draw(); } });
    }));
    const found = q ? search(data.items, q).sort((a, b) => a.date.localeCompare(b.date) || a.from.localeCompare(b.from)) : onDay(data.items, day);
    count.textContent = q ? `찾은 세션 ${found.length}개` : `${dayKo(day)} ${found.length}개${mineCount ? ` · 내 일정 ${mineCount}` : ''}`;
    const { picks, skipped } = recommendWithSkips(data.items, getTopics(), getEvents());
    recBox.replaceChildren(...(picks.length ? [el('section', { class: 'panel' },
      el('h2', { text: '내 주제 세션' }),
      el('p', { class: 'note', text: `${picks.length}곳${skipped ? ` · 시간이 겹쳐 ${skipped}곳 뺐다` : ''}` }),
      el('ul', { class: 'stack' }, picks.map((s) => row(s, true))))] : []));
    list.replaceChildren(...(found.length ? found.slice(0, shown).map((s) => row(s, !!q)) : [el('li', { class: 'note', text: '맞는 세션이 없다. 다른 낱말로 찾는다.' })]),
      ...(found.length > shown ? [el('li', {}, el('button', { class: 'btn ghost wide', type: 'button', text: `더 보기 (${found.length - shown}개 남음)`, onclick: () => { shown += 15; draw(); } }))] : []));
  }
  box.addEventListener('input', () => { q = box.value.trim(); shown = 10; draw(); });

  draw();
  return el('div', { class: 'page' },
    el('section', { class: 'head' },
      el('h1', { text: '세션 일정' }),
      el('p', { class: 'lead', text: '넣으면 동선과 지도에도 보인다.' })),
    el('div', { class: 'page' }, box, tabs, status),
    recBox,
    el('section', { class: 'panel' }, count, list),
    el('section', { class: 'foot' },
      el('p', {}, `라스베이거스 시각 · 바뀔 수 있다 · ${stamp(data.v)} 받음 · `, out(data.source?.url || OFFICIAL, '출처'), data.skipped ? ` · 못 읽은 카드 ${data.skipped}` : ''),
      el('div', { class: 'actions' }, el('a', { class: 'btn ghost', href: '#/plan', text: '동선' }), el('a', { class: 'btn ghost', href: '#/days', text: '내 일정' }))));
}
