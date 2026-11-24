// 시간과 일정: 날마다 쓸 시간을 고치고, 전시 밖 내 일정을 넣는다. 갈 곳이 그 시간 안에 들어가게 날을 나눈다.
// 기본은 CES 공식 전시 시간이다. 우리 시간과 일정은 폰에서 넣거나 받은 파일을 불러온다(파일 주고받기는 설정의 내보내기에 있다). 폰에만 남는다.

import { el, out } from '../dom.js';
import { getInfo, getPlaces } from '../data.js';
import { getDayLimit, getEvents, getHours, getPace, setEvents, setHours, setPace } from '../store.js';
import { capacity, cleanEvent, eventsOn, hoursFor, PACES, toHHMM, updateEvent } from '../days.js';
import { mapsLink } from '../maps.js';

const dayKo = (date) => { const [, m, d] = date.split('-').map(Number); const w = '일월화수목금토'[new Date(`${date}T00:00:00`).getDay()]; return `${m}/${d} (${w})`; };

// 장소 이름으로 구글맵 주소를 만든다: 아는 곳(공개 장소 · CES 장소)이면 그 주소로, 아니면 적은 글로 찾는다.
export function placeLink(places, text) {
  const t = (text || '').trim();
  if (!t) return null;
  const known = [...(places.cityPlaces || []), ...places.places].find((p) => p.ko === t || p.en === t);
  if (known?.maps?.address) return places.mapsUrls.search.replace('{query}', encodeURIComponent(`${known.maps.query}, ${known.maps.address}`));
  if (known) return mapsLink(places, known);
  return places.mapsUrls.search.replace('{query}', encodeURIComponent(`${t}, Las Vegas`));
}

export async function render() {
  const [info, places] = await Promise.all([getInfo(), getPlaces()]);
  const holder = el('div', { class: 'page' });
  const status = el('p', { class: 'note', role: 'status' });
  const src = info.show.source;
  let now = 'hours';
  let editing = null; // 지금 고치고 있는 일정의 이름표
  const [, sm, sd] = src.read.split('-');

  function hoursPanel() {
    const saved = getHours();
    const pace = getPace();
    const events = getEvents();
    const rows = info.show.days.map((d) => {
      const h = hoursFor(d.date, saved, info);
      const from = el('input', { type: 'time', value: toHHMM(h.from), 'aria-label': `${d.ko} 시작` });
      const to = el('input', { type: 'time', value: toHHMM(h.to), 'aria-label': `${d.ko} 끝` });
      const off = el('input', { type: 'checkbox', checked: h.off });
      const store = () => {
        const next = { ...getHours() };
        if (off.checked) next[d.date] = { off: true };
        else if (from.value && to.value && to.value > from.value) next[d.date] = { from: from.value, to: to.value };
        else { status.textContent = `${d.ko}: 끝이 시작보다 늦어야 한다.`; return; }
        setHours(next);
        status.textContent = `${d.ko} 시간을 남겼다.`;
        draw();
      };
      from.addEventListener('change', store);
      to.addEventListener('change', store);
      off.addEventListener('change', store);
      const cap = capacity(h, eventsOn(events, d.date), pace);
      const limit = getDayLimit();
      return el('li', { class: 'entry' },
        el('div', { class: 'name' }, d.ko, h.mine ? el('span', { class: 'tag mint', text: '내가 고침' }) : el('span', { class: 'tag', text: `공식 ${d.hours}` })),
        el('div', { class: 'times' }, from, el('span', { text: '~' }), to),
        el('label', { class: 'toggle' }, off, el('span', { text: '이 날은 안 본다' })),
        el('p', { class: 'note', text: h.off ? '갈 곳을 넣지 않는다.' : `한 곳 ${pace}분이면 ${cap}곳쯤 볼 수 있다${limit && limit < cap ? ` (내가 정한 ${limit}곳)` : ''}` }));
    });
    const paceSelect = el('select', { 'aria-label': '한 곳에 쓰는 시간' }, PACES.map((p) => el('option', { value: p, selected: p === pace, text: `${p}분` })));
    paceSelect.addEventListener('change', () => { setPace(Number(paceSelect.value)); status.textContent = `한 곳 ${paceSelect.value}분으로 정했다.`; draw(); });
    return el('section', { class: 'panel' },
      el('h2', { text: '날마다 쓸 시간' }),
      el('p', { class: 'note' }, `기본은 공식 전시 시간 (${Number(sm)}/${Number(sd)} 확인 · `, out(src.url, '출처'), '). 고친 것은 이 폰에만 남는다.'),
      el('ul', { class: 'stack' }, rows),
      el('label', { class: 'field' }, el('span', { class: 'label', text: '한 곳에 쓰는 시간' }), paceSelect),
      el('div', { class: 'actions' }, el('button', { class: 'btn ghost', type: 'button', text: '공식 시간으로', onclick: () => { setHours({}); status.textContent = '공식 시간으로 되돌렸다.'; draw(); } })));
  }

  function eventsPanel() {
    const events = [...getEvents()].sort((a, b) => a.date.localeCompare(b.date) || a.from.localeCompare(b.from));
    const target = editing && events.find((e) => e.id === editing);
    if (editing && !target) editing = null;
    const date = el('input', { type: 'date', required: true, value: target?.date || info.show.from, 'aria-label': '날짜' });
    const from = el('input', { type: 'time', required: true, value: target?.from || '19:00', 'aria-label': '시작' });
    const to = el('input', { type: 'time', required: true, value: target?.to || '21:00', 'aria-label': '끝' });
    const name = el('input', { maxlength: 60, required: true, placeholder: '예: 저녁 모임', 'aria-label': '일정 이름', value: target?.name || '' });
    const place = el('input', { maxlength: 80, placeholder: '장소 (아래에서 골라도 된다)', list: 'known-places', 'aria-label': '장소', value: target?.place || '' });
    const known = el('datalist', { id: 'known-places' }, [...(places.cityPlaces || []), ...places.places.filter((p) => p.kind === 'hall' || p.kind === 'hotel')].map((p) => el('option', { value: p.ko })));
    const form = el('form', { class: 'form', id: 'event-form' },
      el('label', { class: 'field' }, el('span', { class: 'label', text: '날짜' }), date),
      el('div', { class: 'field' }, el('span', { class: 'label', text: '시작 ~ 끝' }), el('div', { class: 'times' }, from, el('span', { text: '~' }), to)),
      el('label', { class: 'field' }, el('span', { class: 'label', text: '이름' }), name),
      el('label', { class: 'field' }, el('span', { class: 'label', text: '장소' }), place, known),
      el('div', { class: 'actions' },
        el('button', { class: 'btn', type: 'submit', text: target ? '남기기' : '넣기' }),
        target ? el('button', { class: 'btn ghost', type: 'button', text: '그만두기', onclick: () => { editing = null; status.textContent = ''; draw(); } }) : null));
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      if (target) {
        const got = updateEvent(getEvents(), target.id, { date: date.value, from: from.value, to: to.value, name: name.value, place: place.value });
        if (!got.ok) { status.textContent = '날짜 · 시간 · 이름을 본다. 끝은 시작보다 늦어야 한다.'; return; }
        setEvents(got.events);
        editing = null;
        status.textContent = '고쳤다.';
        draw();
        return;
      }
      const e = cleanEvent({ date: date.value, from: from.value, to: to.value, name: name.value, place: place.value });
      if (!e) { status.textContent = '날짜 · 시간 · 이름을 본다. 끝은 시작보다 늦어야 한다.'; return; }
      setEvents([...getEvents(), e]);
      status.textContent = '넣었다. 그 시간에는 갈 곳을 넣지 않는다.';
      draw();
    });
    return el('section', { class: 'panel' },
      el('h2', { text: `내 일정 ${events.length}개` }),
      el('p', { class: 'note', text: target ? `"${target.name}"을(를) 고치는 중이다.` : '모임 · 공연 · 이동 같은 전시 밖 일정. 갈 곳과 지도에도 보인다.' }),
      events.length ? el('ul', { class: 'stack' }, events.map((e) => {
        const link = placeLink(places, e.place);
        return el('li', { class: 'entry' },
          el('div', { class: 'name', text: e.name }),
          el('div', { class: 'where', text: `${dayKo(e.date)} ${e.from} ~ ${e.to}${e.place ? ` · ${e.place}` : ''}` }),
          el('div', { class: 'row-actions' },
            link ? out(link, '지도') : null,
            el('button', { class: 'linkish', type: 'button', text: '고치기', onclick: () => { editing = e.id; status.textContent = ''; draw(); document.getElementById('event-form')?.scrollIntoView({ block: 'center' }); } }),
            el('button', { class: 'linkish', type: 'button', text: '지우기', onclick: () => { setEvents(getEvents().filter((x) => x.id !== e.id)); status.textContent = '지웠다.'; draw(); } })));
      })) : null,
      form);
  }

  function draw() {
    holder.replaceChildren(
      el('section', { class: 'head' },
        el('h1', { text: '시간과 일정' }),
        el('p', { class: 'lead', text: '일정은 바뀔 수 있다 — 운영팀 안내가 먼저' })),
      el('div', { class: 'segs', role: 'group', 'aria-label': '보기' }, [['hours', '시간'], ['events', '내 일정']].map(([k, ko]) => el('button', { class: 'seg', type: 'button', text: ko, 'aria-pressed': k === now ? 'true' : 'false', onclick: () => { now = k; status.textContent = ''; draw(); } }))),
      status,
      now === 'hours' ? hoursPanel() : eventsPanel(),
      el('div', { class: 'dock' }, el('a', { class: 'btn', href: '#/plan', text: '갈 곳' })));
  }
  draw();
  return holder;
}
