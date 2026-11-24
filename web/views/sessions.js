// 강연 일정(공식 일정의 세션): CES 공식 일정(기조연설 · 세션)을 날짜별로 보고, 낱말로 찾고, 내 일정에 넣는다. 화면의 말은 "강연"이다(2026-11-23, "세션"은 낯선 말).
// 자료(data/sessions.json)는 빌드 때 공식 사이트에서 받아 둔 것이다. 못 받은 날에는 못 받았다고 보이고, 짐작해 채우지 않는다.
// 이 화면은 누를 때 불러온다. 내 일정은 폰에만 남는다.

import { el, out } from '../dom.js';
import { getEvents, setEvents } from '../store.js';
import { clean, daysOf, filterSessions, isIn, isKeynote, onDay, recommendWithSkips, search, shareText, toggle, topicGroups } from '../sessions.js';
import { placeLink } from './days.js';
import { getCategories, getInfo, getPlaces } from '../data.js';
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

export async function render({ rest = [] } = {}) {
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
  // 지도 찾기 칸에서 세션을 골라 왔으면(#/sessions/q/<낱말>) 그 낱말로 찾은 채 연다.
  let q = rest[0] === 'q' && rest[1] ? decodeURIComponent(rest[1]).slice(0, 120) : '';
  let shown = 7;
  let recShown = 2;
  // 거르기 칩(공식 앱 일정의 "거르기 · 주요"): 기조연설 · 생중계 · 내 일정 · 분야 묶음. 이 화면 안에서만 쓴다.
  const filt = { keynote: false, live: false, mine: false, topics: null };
  let topicKey = null;
  let pickerOpen = false;
  const groups = topicGroups(data.items, (await getCategories().catch(() => null))?.groups || []);
  const status = el('p', { class: 'note', role: 'status' });
  const list = el('ul', { class: 'stack' });
  const tabs = el('div', { class: 'segs', role: 'group', 'aria-label': '날짜' });
  const chips = el('div', { class: 'chips', role: 'group', 'aria-label': '강연 거르기' });
  const picker = el('div', { class: 'list-pick', hidden: true });
  const count = el('h2');
  const box = el('input', { type: 'search', placeholder: '찾기 (예: AI, robot)', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', 'aria-label': '강연 찾기', value: q });
  const recBox = el('div', { class: 'page' });

  function paintChips() {
    const chip = (text, on, onclick, label) => el('button', { class: 'chip-go', type: 'button', text, 'aria-pressed': on ? 'true' : 'false', 'aria-label': label, onclick });
    const topicKo = groups.find((g) => g.k === topicKey)?.ko;
    chips.replaceChildren(
      chip('기조연설', filt.keynote, () => { filt.keynote = !filt.keynote; shown = 7; draw(); }),
      chip('생중계', filt.live, () => { filt.live = !filt.live; shown = 7; draw(); }),
      chip('내 일정', filt.mine, () => { filt.mine = !filt.mine; shown = 7; draw(); }),
      groups.length ? chip(topicKo ? `분야: ${topicKo}` : '분야 ▾', !!topicKo || pickerOpen, () => { pickerOpen = !pickerOpen; paintPicker(); paintChips(); }, `분야 고르기${topicKo ? ` (지금 ${topicKo})` : ''}`) : null);
  }
  function paintPicker() {
    if (!pickerOpen) { picker.hidden = true; picker.replaceChildren(); return; }
    const choose = (g) => { topicKey = g ? g.k : null; filt.topics = g ? g.topics : null; pickerOpen = false; shown = 7; draw(); };
    picker.replaceChildren(
      el('div', { class: 'panel-head' }, el('h2', { text: '분야 고르기' }), el('button', { class: 'pick', type: 'button', text: '닫기', onclick: () => { pickerOpen = false; paintPicker(); paintChips(); } })),
      el('div', { class: 'pick-wrap' },
        el('button', { class: 'chip-go', type: 'button', text: '모든 분야', 'aria-pressed': topicKey ? 'false' : 'true', onclick: () => choose(null) }),
        groups.map((g) => el('button', { class: 'chip-go', type: 'button', 'aria-pressed': g.k === topicKey ? 'true' : 'false', 'aria-label': `${g.ko} 강연 ${g.n}개`, onclick: () => choose(g) }, g.ko, el('span', { class: 'chip-n', text: ` ${g.n}` })))));
    picker.hidden = false;
  }
  const filtering = () => filt.keynote || filt.live || filt.mine || !!filt.topics;

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
    const events = getEvents();
    const mineCount = data.items.filter((s) => isIn(s, events)).length;
    const pool = filterSessions(data.items, filt, events);
    paintChips();
    paintPicker();
    tabs.replaceChildren(...days.map((d) => {
      const n = onDay(pool, d).length;
      return el('button', { class: 'seg daychip', type: 'button', 'aria-pressed': !q && d === day ? 'true' : 'false', 'aria-label': `${dayKo(d)} 강연 ${n}개`, onclick: () => { day = d; q = ''; shown = 7; box.value = ''; draw(); } },
        el('span', { class: 'dc-day', text: dayKo(d).replace(/ \(.*\)/, '') }), el('span', { class: 'dc-n', text: `${n}개` }));
    }));
    const found = q ? search(pool, q).sort((a, b) => a.date.localeCompare(b.date) || a.from.localeCompare(b.from)) : onDay(pool, day);
    count.textContent = q ? `찾은 강연 ${found.length}개` : `${dayKo(day)} ${found.length}개${filtering() ? ' (거름)' : mineCount ? ` · 내 일정 ${mineCount}` : ''}`;
    const { picks, skipped } = recommendWithSkips(data.items, getTopics(), getEvents());
    recBox.replaceChildren(...(picks.length ? [el('section', { class: 'panel' },
      el('h2', { text: `내 주제 강연 ${picks.length}개${skipped ? ` · 때가 겹쳐 ${skipped}개 뺌` : ''}` }),
      el('ul', { class: 'stack' }, picks.slice(0, recShown).map((s) => row(s, true))),
      picks.length > recShown ? el('button', { class: 'btn ghost wide', type: 'button', text: `더 보기 (${picks.length - recShown}개 남음)`, onclick: () => { recShown += 4; draw(); } }) : null)] : []));
    list.replaceChildren(...(found.length ? found.slice(0, shown).map((s) => row(s, !!q)) : [el('li', { class: 'note', text: filtering() ? '맞는 강연이 없다. 거르기 칩을 끄거나 다른 날을 본다.' : '맞는 강연이 없다. 다른 낱말로 찾는다.' })]),
      ...(found.length > shown ? [el('li', {}, el('button', { class: 'btn ghost wide', type: 'button', text: `더 보기 (${found.length - shown}개 남음)`, onclick: () => { shown += 10; draw(); } }))] : []));
  }
  box.addEventListener('input', () => { q = box.value.trim(); shown = 7; draw(); });

  draw();
  return el('div', { class: 'page' },
    el('section', { class: 'head' },
      el('h1', { text: '강연 일정' }),
      el('p', { class: 'lead', text: '넣으면 갈 곳과 지도에도 보인다. 시각은 라스베이거스 기준이다.' })),
    el('div', { class: 'page' }, box, tabs, chips, picker, status),
    recBox,
    el('section', { class: 'panel' }, count, list),
    el('section', { class: 'foot' },
      el('p', {}, `라스베이거스 시각 · 바뀔 수 있다 · ${stamp(data.v)} 받음 · `, out(data.source?.url || OFFICIAL, '출처'), data.skipped ? ` · 못 읽은 카드 ${data.skipped}` : ''),
      el('div', { class: 'actions' }, el('a', { class: 'btn ghost', href: '#/plan', text: '갈 곳' }), el('a', { class: 'btn ghost', href: '#/days', text: '내 일정' }))));
}
