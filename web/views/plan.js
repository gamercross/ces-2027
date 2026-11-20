// 동선: 관심 회사를 날짜 · 캠퍼스 · 걷는 차례로 세운다. 날짜는 바꿀 수 있다. 폰에만 남는다.

import { el, out } from '../dom.js';
import { getExhibitors, getInfo, getMeta, getPlaces } from '../data.js';
import { getInterests, setInterests } from '../store.js';
import { fillDays, nextStop, placeTable, sortRoute, splitBooth } from '../route.js';
import { mapsLink } from '../maps.js';

export async function render() {
  const meta = await getMeta();
  if (!meta) {
    return el('section', { class: 'panel' }, el('h1', { text: '동선' }), el('p', { text: '전시사 자료를 아직 받지 못했다.' }));
  }
  const [data, places, info] = await Promise.all([getExhibitors(), getPlaces(), getInfo()]);
  const table = placeTable(places);
  const campusKo = new Map(places.campuses.map((c) => [c.k, c.ko]));
  const byId = new Map(data.ex.map((r) => [r[0], r]));
  const placeBy = new Map(places.places.map((p) => [p.k, p]));
  const placeOf = (id) => { const b = byId.get(id)?.[7]?.[0]; return b ? placeBy.get(splitBooth(b).place) : null; };
  const firstBooth = (id) => byId.get(id)?.[7]?.[0] || null;
  const days = [...info.show.days.map((d, i) => ({ key: i + 1, ko: d.ko, hours: d.hours })), { key: 0, ko: '날짜 미정', hours: '' }];

  const holder = el('div', { class: 'page' });
  const status = el('p', { class: 'note', role: 'status' });

  function item(it, no) {
    const row = byId.get(it.id);
    const booth = firstBooth(it.id);
    const place = booth ? table.get(splitBooth(booth).place) : null;
    const select = el('select', { 'aria-label': `${row ? row[1] : '회사'} 날짜` },
      days.map((d) => el('option', { value: d.key, selected: d.key === (it.day || 0), text: d.key ? d.ko : '미정' })));
    select.addEventListener('change', () => {
      setInterests(getInterests().map((x) => (x.id === it.id ? { ...x, day: Number(select.value) } : x)));
      status.textContent = '날짜를 바꿨다. "걷는 차례로"를 누르면 그 날짜 안에서 다시 선다.';
      draw();
    });
    const remove = el('button', { class: 'pick', type: 'button', text: '빼기', 'aria-label': `${row ? row[1] : '회사'} 관심에서 빼기`, onclick: () => {
      setInterests(getInterests().filter((x) => x.id !== it.id));
      status.textContent = '관심에서 뺐다.';
      draw();
    } });
    const seen = el('button', { class: 'pick', type: 'button', text: it.seen ? '봤다' : '아직', 'aria-pressed': it.seen ? 'true' : 'false', 'aria-label': `${row ? row[1] : '회사'} 봤다고 표시`, onclick: () => {
      setInterests(getInterests().map((x) => (x.id === it.id ? { ...x, seen: !x.seen } : x)));
      status.textContent = it.seen ? '아직 보지 않은 곳으로 돌렸다.' : '봤다고 표시했다. 다음 갈 곳이 바뀐다.';
      draw();
    } });
    const route = mapsLink(places, placeOf(it.id), 'directions');
    return el('li', { class: it.seen ? 'stop seen' : 'stop' },
      el('span', { class: 'no', text: String(no) }),
      el('div', { class: 'stop-main' },
        el('div', { class: 'name', text: row ? row[1] : '자료에서 빠진 회사' }),
        el('div', { class: 'where', text: booth ? `${place ? place.ko : '장소 모름'} ${splitBooth(booth).code}${row[7].length > 1 ? ` 밖에 ${row[7].length - 1}곳` : ''}` : (row ? '부스 미정' : '새로 받은 자료에 없다') })),
      el('div', { class: 'stop-side' }, seen, select, remove, route ? out(route, '길찾기') : null));
  }

  function draw() {
    const list = getInterests();
    if (!list.length) {
      holder.replaceChildren(el('section', { class: 'panel' },
        el('p', { text: '아직 관심 회사가 없다. 회사 화면에서 분야를 고르고 "관심"을 누르면 여기에 동선이 생긴다.' }),
        el('div', { class: 'actions' }, el('a', { class: 'btn', href: '#/find', text: '회사 고르러 가기' }))));
      return;
    }
    const sections = [];
    const next = nextStop(list);
    if (next) {
      const row = byId.get(next.id);
      const booth = firstBooth(next.id);
      const place = placeOf(next.id);
      const route = mapsLink(places, place, 'directions');
      const day = days.find((d) => d.key === (next.day || 0));
      sections.push(el('section', { class: 'panel next' },
        el('h2', { text: '다음 갈 곳' }),
        el('p', { class: 'big', text: row ? row[1] : '자료에서 빠진 회사' }),
        el('p', { class: 'note', text: [day?.ko, booth ? `${place ? place.ko : '장소 모름'} · 부스 ${splitBooth(booth).code} (자리는 짐작)` : '부스 미정'].filter(Boolean).join(' · ') }),
        el('div', { class: 'actions' },
          route ? out(route, '구글맵 길찾기', 'btn') : null,
          el('a', { class: 'btn ghost', href: '#/map', text: '지도에서 보기' }),
          el('button', { class: 'btn ghost', type: 'button', text: '봤다', onclick: () => {
            setInterests(getInterests().map((x) => (x.id === next.id ? { ...x, seen: true } : x)));
            status.textContent = '봤다고 표시했다.';
            draw();
          } }))));
    } else {
      sections.push(el('section', { class: 'panel next' }, el('h2', { text: '다음 갈 곳' }), el('p', { text: '동선의 회사를 다 봤다.' })));
    }
    for (const d of days) {
      const items = list.filter((it) => (it.day || 0) === d.key);
      if (!items.length) continue;
      const kids = [];
      let lastCampus = null;
      items.forEach((it, i) => {
        const booth = firstBooth(it.id);
        const campus = booth ? table.get(splitBooth(booth).place)?.campus : null;
        if (campus !== lastCampus) {
          kids.push(el('li', { class: 'campus', text: campus ? campusKo.get(campus) : '장소를 모르는 곳' }));
          lastCampus = campus;
        }
        kids.push(item(it, i + 1));
      });
      sections.push(el('section', { class: 'panel' },
        el('h2', { text: `${d.ko}${d.hours ? ` · ${d.hours}` : ''} · ${items.length}곳` }),
        el('ol', { class: 'stops' }, kids)));
    }
    holder.replaceChildren(...sections);
  }

  const fill = el('button', { class: 'btn', type: 'button', text: '날짜 채우기', onclick: () => {
    const { items, filled } = fillDays(getInterests(), firstBooth, table);
    setInterests(items);
    status.textContent = filled
      ? `날짜 미정 ${filled}곳을 캠퍼스로 채웠다 (LVCC 첫날, 베네시안 둘째 날, C Space와 그 밖은 셋째 날). 바꿔도 된다.`
      : '날짜 미정인 곳이 없다. 걷는 차례로 다시 세웠다.';
    draw();
  } });
  const sort = el('button', { class: 'btn ghost', type: 'button', text: '걷는 차례로', onclick: () => {
    setInterests(sortRoute(getInterests(), firstBooth, table));
    status.textContent = '날짜마다 캠퍼스 · 홀 · 통로 차례로 세웠다.';
    draw();
  } });

  draw();
  return el('div', { class: 'page' },
    el('section', { class: 'panel' },
      el('h1', { text: '동선' }),
      el('p', { class: 'lead', text: '관심 회사를 날짜와 캠퍼스로 묶고 걷는 차례로 세운다.' }),
      el('div', { class: 'actions' }, fill, sort),
      status,
      el('p', { class: 'note', text: '걷는 차례는 부스 번호로 짐작한 것이다 (정식 배치도 전). 이 목록은 이 폰에만 남는다.' })),
    holder);
}
