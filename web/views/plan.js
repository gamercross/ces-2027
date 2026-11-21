// 동선: 관심 회사를 날짜 · 캠퍼스 · 걷는 차례로 세운다. 날짜는 바꿀 수 있다. 폰에만 남는다.

import { el, out } from '../dom.js';
import { getExhibitors, getInfo, getMeta, getPlaces } from '../data.js';
import { getDayLimit, getEvents, getHours, getInterests, getPace, setDayLimit, setInterests } from '../store.js';
import { capacity, clock, dayLimits, eventsOn, hoursFor, timeline } from '../days.js';
import { placeLink } from './days.js';
import { markLabel, toggleMark } from '../alerts.js';
import { getMarks, setMarks } from '../notify.js';
import { fillDays, nextStop, placeTable, sortRoute, splitBooth } from '../route.js';
import { mapsLink } from '../maps.js';
import { mergeItems, planCode, planCsv, planMd, planText, readCode, shareLink } from '../share.js';

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = el('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

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
  const days = [...info.show.days.map((d, i) => ({ key: i + 1, ko: d.ko, hours: d.hours, date: d.date })), { key: 0, ko: '날짜 미정', hours: '', date: null }];

  const holder = el('div', { class: 'page' });
  const status = el('p', { class: 'note', role: 'status' });

  // at: 그 곳을 볼 때쯤(분). null이면 그 날 쓸 시간 밖이다. undefined면 시간을 보이지 않는다(날짜 미정).
  function item(it, no, at) {
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
    // 이 회사의 부스 가운데 "명함 넣는 이벤트 있음"으로 표시한 것 (없으면 첫 부스에 표시한다).
    const keysOf = (row?.[7] || []).map((b) => { const at = b.lastIndexOf('@'); return `${b.slice(at + 1)}|${b.slice(0, at)}`; });
    const markKey = keysOf.find((k) => getMarks()[k]) || null;
    const eventButton = keysOf.length ? el('button', { class: 'pick', type: 'button', text: '명함 이벤트', 'aria-pressed': markKey ? 'true' : 'false', 'aria-label': `${row[1]} 명함 넣는 이벤트 ${markKey ? '표시 지우기' : '있음으로 표시'}`, onclick: () => {
      setMarks(toggleMark(getMarks(), markKey || keysOf[0]));
      status.textContent = markKey ? '명함 이벤트 표시를 지웠다.' : '명함 넣는 이벤트가 있는 부스로 표시했다. 공식 자료가 아니라 내가 표시한 것이다.';
      draw();
    } }) : null;
    const seen = el('button', { class: 'pick', type: 'button', text: it.seen ? '봤다' : '아직', 'aria-pressed': it.seen ? 'true' : 'false', 'aria-label': `${row ? row[1] : '회사'} 봤다고 표시`, onclick: () => {
      setInterests(getInterests().map((x) => (x.id === it.id ? { ...x, seen: !x.seen } : x)));
      status.textContent = it.seen ? '아직 보지 않은 곳으로 돌렸다.' : '봤다고 표시했다. 다음 갈 곳이 바뀐다.';
      draw();
    } });
    const route = mapsLink(places, placeOf(it.id), 'directions');
    // 같은 날짜 안에서 한 칸 위 · 아래로 옮긴다 (걷는 차례를 손으로 고칠 때).
    const move = (step) => {
      const list = getInterests();
      const same = list.map((x, n) => ({ x, n })).filter((v) => (v.x.day || 0) === (it.day || 0));
      const at = same.findIndex((v) => v.x.id === it.id);
      const other = same[at + step];
      if (at < 0 || !other) return;
      [list[same[at].n], list[other.n]] = [list[other.n], list[same[at].n]];
      setInterests(list);
      status.textContent = '차례를 바꿨다.';
      draw();
    };
    const up = el('button', { class: 'pick', type: 'button', text: '위로', 'aria-label': `${row ? row[1] : '회사'} 한 칸 위로`, onclick: () => move(-1) });
    const down = el('button', { class: 'pick', type: 'button', text: '아래로', 'aria-label': `${row ? row[1] : '회사'} 한 칸 아래로`, onclick: () => move(1) });
    return el('li', { class: it.seen ? 'stop seen' : 'stop' },
      el('span', { class: 'no', text: String(no) }),
      el('div', { class: 'stop-main' },
        el('div', { class: 'name' }, row ? row[1] : '자료에서 빠진 회사', markKey ? el('span', { class: 'tag', text: `명함 이벤트 (${markLabel(getMarks()[markKey])})` }) : null),
        el('div', { class: 'where', text: (at === undefined ? '' : at === null ? '시간 밖 · ' : `${clock(at)}쯤 · `) + (booth ? `${place ? place.ko : '장소 모름'} ${splitBooth(booth).code}${row[7].length > 1 ? ` 밖에 ${row[7].length - 1}곳` : ''}` : (row ? '부스 미정' : '새로 받은 자료에 없다')) })),
      el('div', { class: 'stop-side' }, seen, eventButton, select, up, down, remove, route ? out(route, '길찾기') : null, row ? el('a', { href: `#/diary/new/${it.id}`, text: '일기' }) : null));
  }

  function draw() {
    const list = getInterests();
    const sections = [];
    if (!list.length) {
      sections.push(el('section', { class: 'panel' },
        el('p', { text: '아직 관심 회사가 없다. 회사 화면에서 추천이나 분야를 보고 "관심"을 누르면 여기에 동선이 생긴다.' }),
        el('div', { class: 'actions' }, el('a', { class: 'btn', href: '#/find', text: '회사 고르러 가기' }))));
    }
    const next = nextStop(list);
    if (!list.length) {
      // 관심이 없어도 내 일정은 아래에 보인다.
    } else if (next) {
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
    // 내 일정 한 줄.
    const eventRow = (e) => {
      const link = placeLink(places, e.place);
      return el('li', { class: 'stop event' },
        el('span', { class: 'no', text: '일' }),
        el('div', { class: 'stop-main' },
          el('div', { class: 'name', text: e.name }),
          el('div', { class: 'where', text: `${e.from} ~ ${e.to}${e.place ? ` · ${e.place}` : ''} · 이 시간에는 동선을 짜지 않는다` })),
        el('div', { class: 'stop-side' }, link ? out(link, '구글맵') : null));
    };
    const events = getEvents();
    const savedHours = getHours();
    const pace = getPace();
    const limits = dayLimits(info, savedHours, events, pace, getDayLimit());
    for (const d of days) {
      const items = list.filter((it) => (it.day || 0) === d.key);
      const evs = d.date ? eventsOn(events, d.date) : [];
      if (!items.length && !evs.length) continue;
      const hours = d.date ? hoursFor(d.date, savedHours, info) : null;
      const when = hours ? timeline(items.length, hours, evs, pace) : [];
      const kids = evs.map(eventRow);
      let lastCampus = null;
      items.forEach((it, i) => {
        const booth = firstBooth(it.id);
        const campus = booth ? table.get(splitBooth(booth).place)?.campus : null;
        if (campus !== lastCampus) {
          kids.push(el('li', { class: 'campus', text: campus ? campusKo.get(campus) : '장소를 모르는 곳' }));
          lastCampus = campus;
        }
        kids.push(item(it, i + 1, hours ? when[i] : undefined));
      });
      const room = hours ? limits[d.key] : null;
      const allMarks = getMarks();
      const cardCount = items.filter((it) => (byId.get(it.id)?.[7] || []).some((b) => { const at = b.lastIndexOf('@'); return allMarks[`${b.slice(at + 1)}|${b.slice(0, at)}`]; })).length;
      sections.push(el('section', { class: 'panel' },
        el('h2', { text: `${d.ko} · ${items.length}곳` }),
        hours ? el('p', { class: 'note', text: hours.off
          ? '이 날은 전시를 보지 않는 날로 정했다.'
          : `${cardCount ? `명함 ${cardCount}장 필요 (명함 이벤트 부스, 사람이 표시). ` : ''}쓸 시간 ${clock(hours.from)} ~ ${clock(hours.to)}${hours.mine ? ' (내가 고침)' : ' (공식 전시 시간)'} · 한 곳 ${pace}분 · ${room}곳까지 들어간다.` }) : null,
        // 그 날에 들어가는 수를 넘으면 알려 준다 (막지는 않는다).
        hours && items.length > room ? el('p', { class: 'note warn', text: `${items.length - room}곳이 넘친다. 날짜를 옮기거나, 시간을 늘리거나, 그대로 둔다.` }) : null,
        el('ol', { class: 'stops' }, kids)));
    }
    // 전시 기간 밖의 내 일정 (공항 이동 같은 것).
    const showDates = new Set(info.show.days.map((d) => d.date));
    const others = events.filter((e) => !showDates.has(e.date)).sort((a, b) => a.date.localeCompare(b.date) || a.from.localeCompare(b.from));
    if (others.length) {
      sections.push(el('section', { class: 'panel' },
        el('h2', { text: `전시 기간 밖의 일정 ${others.length}개` }),
        el('ol', { class: 'stops' }, others.map((e) => eventRow({ ...e, name: `${e.date.slice(5).replace('-', '/')} ${e.name}` })))));
    }
    holder.replaceChildren(...sections);
  }

  // 하루에 볼 곳은 사람마다 다르다. 여기서 정한 수를 "날짜 채우기"가 지킨다. 폰에만 남는다.
  const limitSelect = el('select', { 'aria-label': '하루에 볼 곳' },
    [0, 5, 6, 8, 10, 12, 15, 20].map((n) => el('option', { value: n, selected: n === getDayLimit(), text: n ? `${n}곳까지` : '정하지 않음' })));
  if (getDayLimit() && ![5, 6, 8, 10, 12, 15, 20].includes(getDayLimit())) limitSelect.prepend(el('option', { value: getDayLimit(), selected: true, text: `${getDayLimit()}곳까지` }));
  limitSelect.addEventListener('change', () => {
    setDayLimit(Number(limitSelect.value));
    status.textContent = Number(limitSelect.value)
      ? `하루 ${limitSelect.value}곳까지로 정했다. "날짜 채우기"가 날짜 미정인 곳을 이 수에 맞춰 나눈다. 이미 정한 날짜는 옮기지 않는다.`
      : '하루에 볼 곳을 정하지 않았다. "날짜 채우기"는 캠퍼스로만 나눈다.';
    draw();
  });
  const fill = el('button', { class: 'btn', type: 'button', text: '날짜 채우기', onclick: () => {
    const limit = getDayLimit();
    // 날마다 들어가는 수: 쓸 시간(내 일정을 뺀 것)으로 셈한 수와 내가 정한 수 가운데 작은 것.
    const { items, filled, moved, over } = fillDays(getInterests(), firstBooth, table, dayLimits(info, getHours(), getEvents(), getPace(), limit));
    setInterests(items);
    status.textContent = !filled ? '날짜 미정인 곳이 없다. 걷는 차례로 다시 세웠다.'
      : `날짜 미정 ${filled}곳을 캠퍼스로 채웠다 (LVCC 첫날, 베네시안 둘째 날, C Space와 그 밖은 셋째 날).${moved || over || limit ? ` 그 날의 시간${limit ? `과 하루 ${limit}곳` : ''}에 들어가지 않는 ${moved}곳은 자리가 있는 다음 날로 넘겼다.${over ? ` ${over}곳은 넘길 날이 없어 그대로 두었다.` : ''}` : ''} 바꿔도 된다.`;
    draw();
  } });
  const sort = el('button', { class: 'btn ghost', type: 'button', text: '걷는 차례로', onclick: () => {
    setInterests(sortRoute(getInterests(), firstBooth, table));
    status.textContent = '날짜마다 캠퍼스 · 홀 · 통로 차례로 세웠다.';
    draw();
  } });

  // 나누기와 내보내기 (미리 보기 판의 "목록 코드 · 링크 · 글 · 마크다운 · CSV"에서 옮겼다).
  const shareDays = days.map((d) => ({ key: d.key, ko: d.key ? `${d.ko} ${d.hours}` : d.ko, short: d.key ? d.ko.split(' ')[0] : '미정' }));
  const placeKo = new Map(places.places.map((p) => [p.k, p.ko]));
  const todayText = () => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
  const copy = async (text, ok) => { try { await navigator.clipboard.writeText(text); status.textContent = ok; } catch { status.textContent = '복사하지 못했다. 파일로 받는다.'; } };
  const need = (fn) => () => { const list = getInterests(); if (!list.length) { status.textContent = '아직 관심 회사가 없다.'; return; } fn(list); };
  const incoming = el('div');
  // 받은 코드나 링크: 내게 없는 것이 몇 곳인지 보이고, 더할지 묻는다.
  function offer(text) {
    const got = readCode(text, [...byId.keys()]);
    if (!got.length) { incoming.replaceChildren(); status.textContent = '코드에서 회사를 찾지 못했다. 코드를 다시 본다.'; return; }
    const { added } = mergeItems(getInterests(), got);
    incoming.replaceChildren(el('section', { class: 'panel notice' },
      el('h2', { text: '받은 목록' }),
      el('p', { text: `받은 목록에 ${got.length}곳이 있고, 그 가운데 내게 없는 것이 ${added}곳이다.` }),
      el('p', { class: 'note', text: got.slice(0, 5).map((it) => byId.get(it.id)[1]).join(' · ') + (got.length > 5 ? ' …' : '') }),
      el('div', { class: 'actions' },
        el('button', { class: 'btn', type: 'button', text: `${added}곳 더하기`, disabled: added === 0, onclick: () => {
          setInterests(mergeItems(getInterests(), got).items);
          incoming.replaceChildren();
          status.textContent = `받은 목록에서 ${added}곳을 더했다. 날짜는 보낸 사람이 정한 대로다.`;
          draw();
        } }),
        el('button', { class: 'btn ghost', type: 'button', text: '버리기', onclick: () => { incoming.replaceChildren(); status.textContent = '받은 목록을 버렸다.'; } }))));
  }
  const codeInput = el('input', { autocapitalize: 'off', autocomplete: 'off', spellcheck: 'false', placeholder: '받은 코드나 링크', 'aria-label': '받은 목록 코드나 링크' });
  const codeForm = el('form', { class: 'inline' }, el('label', { class: 'field' }, codeInput), el('button', { class: 'btn ghost', type: 'submit', text: '코드 넣기' }));
  codeForm.addEventListener('submit', (ev) => { ev.preventDefault(); if (codeInput.value.trim()) offer(codeInput.value); });
  const sharePanel = el('section', { class: 'panel' },
    el('h2', { text: '나누기와 내보내기' }),
    el('p', { class: 'note', text: '링크나 코드에는 회사와 날짜만 들어간다. 명함 · 일기 · 봤다는 표시는 들어가지 않는다.' }),
    el('div', { class: 'actions' },
      el('button', { class: 'btn', type: 'button', text: '링크 복사', onclick: need((list) => copy(shareLink(location.href, list), '링크를 복사했다. 받은 사람이 열면 자기 목록에 더할지 묻는다.')) }),
      el('button', { class: 'btn ghost', type: 'button', text: '코드 복사', onclick: need((list) => copy(planCode(list), '목록 코드를 복사했다.')) }),
      el('button', { class: 'btn ghost', type: 'button', text: '글로 복사', onclick: need((list) => copy(planText(list, shareDays, byId, placeKo), '단톡방에 붙여 넣을 글을 복사했다.')) })),
    codeForm,
    el('div', { class: 'actions' },
      el('button', { class: 'btn ghost', type: 'button', text: '마크다운 파일', onclick: need((list) => { download(`ces2027-동선-${todayText()}.md`, planMd(list, shareDays, byId, placeKo, data.v, todayText()), 'text/markdown;charset=utf-8'); status.textContent = '마크다운 파일로 내려받았다. 내 노트에 둘 수 있다.'; }) }),
      el('button', { class: 'btn ghost', type: 'button', text: 'CSV 파일', onclick: need((list) => { download(`ces2027-동선-${todayText()}.csv`, planCsv(list, shareDays, byId, placeKo, data), 'text/csv;charset=utf-8'); status.textContent = 'CSV 파일로 내려받았다. 표 프로그램에서 열 수 있다.'; }) })));
  // 링크로 들어왔으면(#plan=…) 받은 목록부터 보인다.
  const arrived = sessionStorage.getItem('ces2027.incoming');
  if (arrived) { sessionStorage.removeItem('ces2027.incoming'); offer(arrived); }

  draw();
  return el('div', { class: 'page' },
    incoming,
    el('section', { class: 'panel' },
      el('h1', { text: '동선' }),
      el('p', { class: 'lead', text: '관심 회사를 날짜와 캠퍼스로 묶고 걷는 차례로 세운다.' }),
      el('p', { class: 'note', text: '일정은 바뀔 수 있다 — 운영팀 안내가 먼저다. 시간과 내 일정은 내가 적어 둔 것이다.' }),
      el('div', { class: 'actions' }, el('a', { class: 'btn ghost', href: '#/days', text: '시간과 일정 고치기' })),
      el('label', { class: 'field' }, el('span', { class: 'label', text: '하루에 볼 곳 (내가 정한다)' }), limitSelect),
      status,
      el('p', { class: 'note', text: '걷는 차례는 부스 번호로 짐작한 것이다 (정식 배치도 전). 이 목록은 이 폰에만 남는다.' })),
    holder,
    sharePanel,
    // 한 손으로 닿게 아래에 붙여 둔다.
    el('div', { class: 'dock' }, fill, sort));
}
