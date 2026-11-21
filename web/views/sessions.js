import { el, out } from '../dom.js';
import { getSessions } from '../data.js';
import { getEvents, setEvents } from '../store.js';

export async function render() {
  const data = await getSessions();
  const holder = el('div', { class: 'page' });
  const status = el('p', { class: 'note', role: 'status' });
  const search = el('input', { type: 'search', placeholder: '세션 · 연사 · 장소 찾기', 'aria-label': '세션 찾기' });
  const date = el('select', { 'aria-label': '날짜', value: '' });
  const items = data.items || [];
  const dates = [...new Set(items.map((it) => it.date).filter(Boolean))].sort();
  date.append(el('option', { value: '', text: '모든 날짜' }), ...dates.map((d) => el('option', { value: d, text: d })));

  function draw() {
    const q = search.value.trim().toLowerCase();
    const chosen = date.value;
    const got = items.filter((it) =>
      (!chosen || it.date === chosen) &&
      (!q || `${it.name} ${it.speaker || ''} ${it.where || ''}`.toLowerCase().includes(q)));
    holder.replaceChildren(el('section', { class: 'panel' },
      el('h1', { text: '세션 일정' }),
      el('p', { class: 'lead', text: '기조연설과 세션을 찾고 내 일정에 넣는다.' }),
      el('small', { class: 'proof' }, `${data.read || '확인 날짜 없음'} 확인 · `, out(data.source.url, data.source.ko)),
      el('label', { class: 'field' }, el('span', { class: 'label', text: '찾기' }), search),
      el('label', { class: 'field' }, el('span', { class: 'label', text: '날짜' }), date),
      status),
      el('section', { class: 'panel' },
        got.length ? el('ul', { class: 'stack' }, got.map((it) => {
          const mine = getEvents().some((e) => e.id === `session-${it.id}`);
          return el('li', { class: 'entry' },
            el('div', { class: 'name', text: it.name }),
            el('p', { class: 'where', text: `${it.date} · ${it.from || ''}${it.to ? ` ~ ${it.to}` : ''} · ${it.where || '장소 확인 필요'}` }),
            it.speaker ? el('p', { text: it.speaker }) : null,
            el('small', { class: 'proof' }, `${it.source.read} 확인 · `, out(it.source.url, it.source.ko)),
            el('div', { class: 'row-actions' },
              el('button', { class: 'pick', type: 'button', 'aria-pressed': mine ? 'true' : 'false', text: mine ? '내 일정에서 빼기' : '내 일정에 넣기', onclick: () => {
                const events = getEvents();
                const next = mine
                  ? events.filter((e) => e.id !== `session-${it.id}`)
                  : [...events, { id: `session-${it.id}`, date: it.date, from: it.from, to: it.to, name: it.name, place: it.place }];
                setEvents(next);
                status.textContent = mine ? '내 일정에서 뺐다.' : '내 일정에 넣었다.';
                draw();
              } }),
              it.live ? out(it.live, '생중계') : null,
              it.ondemand ? out(it.ondemand, '다시 보기') : null));
        })) : el('p', { class: 'note', text: '현재 보여 줄 공식 세션 일정이 없다. CES 공식 앱과 사이트의 2027 안내를 다시 확인한다.' })));
  }
  search.addEventListener('input', draw);
  date.addEventListener('change', draw);
  draw();
  return holder;
}
