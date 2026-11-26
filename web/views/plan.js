// 갈 곳: 화면의 질문은 "지금 어디로 가지?" 하나다. 날짜 한 줄(‹ 1월 6일 (수) ›) → 다음에 갈 곳 한 곳 크게 → 그다음 곳들 → 다녀온 곳은 한 줄로 접는다.
// 줄 번호는 지도의 번호와 같다. 자세한 것과 고치기는 회사 카드(큰 창), 날짜 나누기 · 줄 세우기 · 보내기는 "목록 고치기"에 둔다. 모두 폰에만 남는다.
// 기준: docs/디자인/동선_쉽게_안.md의 안 1 (2026-11-23).

import { el, out } from '../dom.js';
import { getExhibitors, getInfo, getMeta, getPlaces, getSettings } from '../data.js';
import { getDayLimit, getEvents, getHours, getInterests, getPace, setDayLimit, setInterests } from '../store.js';
import { clock, dayLimits, dayList, eventsOn, hoursFor, timeline, toMin } from '../days.js';
import { placeLink } from './days.js';
import { getMarks } from '../notify.js';
import { fillDays, placeTable, sortRoute, splitBooth } from '../route.js';
import { campusHop, hopSlot } from '../nav.js';
import { alertBands } from '../bands.js';
import { createCardShell } from '../plancard.js';
import { boothLines, sessionBlock } from '../company-extra.js';
import { mergeItems, planText, readCode, shareLink } from '../share.js';
import { halves, hops, splitDay } from '../halfday.js';

const DAY_KEY = 'ces2027.planDay';
// 날짜를 화면에 보일 때: "1월 6일 (수)" (긴 꼴) · "1/6" (칩).
const longDay = (d) => { if (!d.date) return '날짜 없음'; const [, m, n] = d.date.split('-').map(Number); return `${m}월 ${n}일 ${d.ko.split(' ')[1] || ''}`.trim(); };
const chipDay = (d) => (d.date ? d.ko.split(' ')[0] : '날짜 없음');
// "10:00" → "10시", "9:30" → "9시 30분"
const hourKo = (min) => `${Math.floor(min / 60)}시${min % 60 ? ` ${min % 60}분` : ''}`;
// 줄에 쓰는 짧은 홀 이름: "LVCC 노스 홀" → "노스 홀", "베네시안 엑스포 홀 G · 유레카 파크 (1층)" → "베네시안 홀 G". 온 이름은 큰 카드에 보인다.
const rowHall = (ko) => ko.replace('LVCC ', '').replace('베네시안 엑스포 ', '베네시안 ').replace(/ \(.*\)$/, '').split(' · ')[0];
const chevron = (left) => {
  const NS = 'http://www.w3.org/2000/svg';
  const icon = document.createElementNS(NS, 'svg');
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', left ? 'm14.5 5-7 7 7 7' : 'm9.5 5 7 7-7 7');
  icon.append(path);
  return icon;
};
const tick = () => {
  const NS = 'http://www.w3.org/2000/svg';
  const icon = document.createElementNS(NS, 'svg');
  icon.setAttribute('viewBox', '0 0 16 16');
  icon.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', 'M3 8.5l3.2 3L13 4.5');
  icon.append(path);
  return icon;
};

export async function render() {
  document.body.classList.remove('pcard-open');
  const meta = await getMeta();
  if (!meta) {
    return el('section', { class: 'panel' }, el('h1', { text: '갈 곳' }), el('p', { text: '전시사 자료를 아직 받지 못했다. 인터넷에 닿으면 다시 열어 본다.' }),
      el('div', { class: 'actions' }, el('button', { class: 'btn', type: 'button', text: '다시 열기', onclick: () => location.reload() }), el('a', { class: 'btn ghost', href: '#/map', text: '지도로' })));
  }
  const [data, places, info, settings] = await Promise.all([getExhibitors(), getPlaces(), getInfo(), getSettings()]);
  const table = placeTable(places);
  const byId = new Map(data.ex.map((r) => [r[0], r]));
  const firstBooth = (id) => byId.get(id)?.[7]?.[0] || null;
  // 날짜: 1/5(전시 전날, 내 일정만) · 1/6 ~ 1/9 · 날짜 없음. 번호는 저장된 것과 같다(1/5만 5번이고, 보이는 차례는 맨 앞).
  const days = [...dayList(info), { key: 0, ko: '날짜 없음', hours: '', date: null }];
  const dayOf = (key) => days.find((d) => d.key === key);
  const koreaAt = data.countries?.indexOf('South Korea');
  const nameOf = (id) => byId.get(id)?.[1] || '자료에서 빠진 회사';

  const holder = el('div', { class: 'page' });
  const navHolder = el('div', { class: 'page' });
  const pageNote = el('p', { class: 'note', role: 'status' });
  const toolNote = el('p', { class: 'note', role: 'status' });
  // 알림 글은 화면 위 줄과 "목록 고치기" 카드 안 줄에 함께 쓴다(카드가 덮고 있어도 보이게).
  const status = { set textContent(t) { pageNote.textContent = t; toolNote.textContent = t; } };
  const shell = createCardShell();
  window.addEventListener('hashchange', () => { shell.close(); hideToast(); }, { once: true });

  // 탭 바로 위에 뜨는 한 줄. "OO 다녀왔다 · 일기 쓰기"는 다음에 무엇을 누를 때까지 있고(stay), "OO 뺐다 · 되돌리기"는 6초 뜬다.
  // 띠가 있는 동안 화면 아래 여백을 띠 높이만큼 늘린다(끝까지 굴리면 "목록 고치기 · 지도에서 보기" 줄이 띠 위로 올라온다).
  const toast = el('div', { class: 'toast', role: 'status', hidden: true });
  const onNextPress = (ev) => { if (!toast.contains(ev.target)) hideToast(); };
  function hideToast() {
    clearTimeout(showToast.t);
    clearTimeout(showToast.arm);
    document.removeEventListener('click', onNextPress, true);
    toast.hidden = true;
    toast.replaceChildren();
    toast.parentNode?.style.removeProperty('--toast-h');
  }
  function showToast(text, action, stay = false) {
    hideToast();
    toast.replaceChildren(el('span', { class: 'toast-text', text }), action);
    toast.hidden = false;
    // 지금 이 누름이 띠를 바로 지우지 않게, 다음 누름부터 듣는다.
    if (stay) showToast.arm = setTimeout(() => document.addEventListener('click', onNextPress, true), 0);
    else showToast.t = setTimeout(hideToast, 6000);
    toast.parentNode?.style.setProperty('--toast-h', `${toast.offsetHeight + 12}px`);
  }

  // 지금 보는 날: 넘겨 둔 날 → 오늘 → 갈 곳이 남은 첫 날 → 넣은 곳이 있는 첫 날 → 전시 첫날.
  const today = () => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
  let shown = null;
  // 넘겨 볼 수 있는 날: 전시 나흘은 늘, 1/5는 그 날 넣은 내 일정이 있을 때만, "날짜 없음"은 날짜 없는 곳이 있을 때만.
  const liveDays = (list, events) => days.filter((d) => (d.pre ? eventsOn(events, d.date).length > 0 : d.key ? true : list.some((it) => !it.day)));
  function chooseDay(list, live) {
    const ok = (k) => live.some((d) => d.key === k);
    if (shown !== null && ok(shown)) return shown;
    let saved = null;
    try { saved = sessionStorage.getItem(DAY_KEY); } catch { /* 저장이 막혀도 화면은 된다 */ }
    if (saved !== null && ok(Number(saved))) return Number(saved);
    const now = live.find((d) => d.date === today());
    if (now) return now.key;
    const of = (d) => list.filter((it) => (it.day || 0) === d.key);
    return (live.find((d) => of(d).some((it) => !it.seen)) || live.find((d) => of(d).length) || live.find((d) => d.key === 1) || live[0]).key;
  }
  const showDay = (key) => { shown = key; try { sessionStorage.setItem(DAY_KEY, String(key)); } catch { /* 저장이 막혀도 화면은 된다 */ } };

  // 카드와 줄이 함께 쓰는 고치기. 고친 뒤에는 줄과 (열려 있으면) 카드를 다시 그린다.
  let openId = null;
  let foldOpen = false; // "다녀온 곳 · 보기"를 펼쳤나
  const change = (fn, note) => { setInterests(fn(getInterests())); status.textContent = note || ''; draw(); };
  const diaryLink = (id) => el('a', { class: 'pick', href: `#/diary/new/${id}`, text: '일기 쓰기' });
  // 다녀왔다: 그 곳이 목록에서 빠져 "다녀온 곳"으로 가고, 아래에 "일기 쓰기"가 다음에 무엇을 누를 때까지 뜬다(카드가 열려 있으면 카드 안에 같은 단추가 있다).
  const setSeen = (id, seen) => {
    change((l) => l.map((x) => (x.id === id ? { ...x, seen } : x)));
    if (seen && !shell.isOpen && byId.has(id)) showToast(`${nameOf(id)} 다녀왔다.`, diaryLink(id), true);
    else hideToast();
  };
  const setDay = (id, key) => { showDay(key); change((l) => l.map((x) => (x.id === id ? { ...x, day: key } : x)), `${longDay(dayOf(key))}${key ? '로' : '으로'} 옮겼다.`); };
  const removeItem = (id) => {
    const at = getInterests().findIndex((x) => x.id === id);
    const it = getInterests()[at];
    shell.close(); openId = null;
    change((l) => l.filter((x) => x.id !== id));
    if (!it) return;
    showToast(`${nameOf(id)} 뺐다.`, el('button', { class: 'pick', type: 'button', text: '되돌리기', onclick: () => {
      const list = getInterests();
      if (!list.some((x) => x.id === id)) list.splice(Math.min(at, list.length), 0, it);
      hideToast();
      setInterests(list); draw();
    } }));
  };

  // 때(분): 날마다 draw가 채운다. null이면 내 시간 밖, 없으면 때를 어림하지 않는 날(1/5 · 날짜 없음).
  const whenOf = new Map();
  const whenText = (id) => { if (!whenOf.has(id)) return ''; const at = whenOf.get(id); return at === null ? '내 시간 밖' : `${clock(at)}쯤`; };
  const tagsOf = (row) => [
    row?.[5] ? el('span', { class: 'tag mint', text: row[5] & 2 ? '최고 혁신상' : '혁신상' }) : null,
    row && koreaAt >= 0 && row[3] === koreaAt ? el('span', { class: 'tag mint', text: '한국' }) : null,
  ].filter(Boolean);
  // 곳: "LVCC 노스 홀 · 부스 14731". short면 줄에 맞게 홀 이름을 줄인다.
  const whereOf = (id, short) => {
    const booth = firstBooth(id);
    const row = byId.get(id);
    const place = booth ? table.get(splitBooth(booth).place) : null;
    return booth ? `${place ? (short ? rowHall(place.ko) : place.ko) : '장소 모름'} · 부스 ${splitBooth(booth).code}` : (row ? '부스 미정' : '새로 받은 자료에 없다');
  };
  // 캠퍼스가 바뀌는 자리의 한 줄: "LVCC에서 베네시안까지 걸어서 약 29분 또는 셔틀". 분은 지도의 길 안내 띠와 같은 어림이다(web/nav.js).
  // 같은 캠퍼스 안이거나 부스 · 캠퍼스를 모르는 곳이면 빈 글이다(아무것도 더하지 않는다).
  const campusBy = new Map(places.campuses.map((c) => [c.k, c]));
  const campusOf = (id) => { const booth = firstBooth(id); return booth ? campusBy.get(table.get(splitBooth(booth).place)?.campus) || null : null; };
  const campusName = (c) => c.ko.replace(/ 캠퍼스$/, '');
  const hopText = (fromId, toId) => {
    const from = fromId ? campusOf(fromId) : null, to = campusOf(toId);
    const min = campusHop(from, to);
    return min ? `${campusName(from)}에서 ${campusName(to)}까지 걸어서 약 ${min}분 또는 셔틀` : '';
  };
  // 때 어림에 더하는 이동 시간(R58): 그 날 차례에서 한 칸 앞과 캠퍼스가 다른 곳 앞에만 있다(분은 위 한 줄의 어림을 5분 단위로 올린 것).
  // [0, 둘째 곳 앞, 셋째 곳 앞, …]. 같은 캠퍼스 안 · 부스를 모르는 곳은 0이다.
  const travelOf = (items) => items.map((it, i) => (i ? hopSlot(campusOf(items[i - 1].id), campusOf(it.id)) : 0));
  // 날마다 걷는 시간의 합 [0, 첫날, …]: "하루에 n곳쯤"과 날마다 나누기가 그만큼 덜 센다.
  const travelByDay = (list) => [0, 1, 2, 3, 4].map((k) => (k ? travelOf(list.filter((it) => it.day === k)).reduce((a, b) => a + b, 0) : 0));
  // 반나절에 캠퍼스 하나(R69, 설정 halfDay). 날짜가 있는 날에 캠퍼스가 둘 이상이면 한 칸: 오전 · 오후에 어느 캠퍼스인지와 단추 하나.
  // 아직 섞여 있으면 저절로 나눈 안("이대로 나누기"), 나눴으면 "오전 · 오후 바꾸기". 누르면 그 날 차례만 다시 선다(폰에만 남는다).
  const campusKey = (id) => campusOf(id)?.k || null;
  const halfBand = (items, dayKey) => {
    const half = halves(items, campusKey);
    if (!half) return null;
    const nameOfCampus = (h) => campusName(campusBy.get(h.campus));
    const ko = (h) => `${nameOfCampus(h)} ${h.n}곳`;
    const apply = (order, note) => change((l) => splitDay(l, dayKey, campusKey, order), note);
    const swap = () => apply([half.pm.campus, half.am.campus, ...half.extra.map((h) => h.campus)], `바꿨다: 오전 ${nameOfCampus(half.pm)} · 오후 ${nameOfCampus(half.am)}`);
    const split = () => apply([half.am, half.pm, ...half.extra].map((h) => h.campus), `나눴다: 오전 ${nameOfCampus(half.am)} · 오후 ${nameOfCampus(half.pm)}`);
    return el('section', { class: 'panel halfday', 'aria-label': '반나절 나누기' },
      el('p', { class: 'note', text: half.grouped ? '반나절에 캠퍼스 하나' : `캠퍼스를 ${hops(items, campusKey)}번 오간다. 반나절에 하나씩 나누면` }),
      el('p', { class: 'halfday-plan' }, el('span', { text: `오전 · ${ko(half.am)}` }), el('span', { text: `오후 · ${ko(half.pm)}` })),
      half.extra.length ? el('p', { class: 'note', text: `${half.extra.map(ko).join(' · ')}은 반나절에 안 들어간다. 다른 날로 옮긴다.` }) : null,
      el('button', { class: 'pick', type: 'button', text: half.grouped ? '오전 · 오후 바꾸기' : '이대로 나누기', onclick: half.grouped ? swap : split }));
  };
  const openCard = (id, from) => { openId = id; hideToast(); shell.open(card(id), from); };

  // ---- 줄: 번호 · 이름 · 때와 곳. 줄 전체가 눌리고 회사 카드가 열린다. 다녀온 곳의 줄에만 오른쪽에 "다녀옴" 칸이 있다(눌러서 되돌린다).
  function item(it, no) {
    const row = byId.get(it.id);
    const open = el('button', { class: 'stop-open', type: 'button', 'aria-label': `${no}번 ${nameOf(it.id)} 카드 열기`, onclick: (ev) => openCard(it.id, ev.currentTarget) },
      el('span', { class: 'no', text: String(no) }),
      el('span', { class: 'stop-main' },
        el('span', { class: 'name', text: nameOf(it.id) }),
        el('span', { class: 'where', text: [it.seen ? '' : whenText(it.id), whereOf(it.id, true)].filter(Boolean).join(' · ') }),
        tagsOf(row).length ? el('span', { class: 'stop-tags' }, tagsOf(row)) : null));
    const check = it.seen ? el('button', { class: 'check on', type: 'button', 'aria-pressed': 'true', 'aria-label': `${nameOf(it.id)} 다녀옴 표시 지우기`, onclick: () => { setSeen(it.id, false); status.textContent = `${nameOf(it.id)}을(를) 갈 곳으로 되돌렸다.`; } },
      el('i', {}, tick()), '다녀옴') : null;
    return el('li', { class: it.seen ? 'stop done' : 'stop', 'data-booth': firstBooth(it.id) ? 'y' : 'n' }, open, check);
  }
  // 내 일정: 번호 없는 점선 칸. "12:00 ~ 13:00 · 팀 점심 (내 일정)"
  const eventRow = (e, withDate) => {
    const link = placeLink(places, e.place);
    return el('li', { class: 'meal' },
      el('span', { class: 'meal-text', text: `${withDate ? `${e.date.slice(5).replace('-', '/')} ` : ''}${e.from} ~ ${e.to} · ${e.name}${e.place ? ` · ${e.place}` : ''} (내 일정)` }),
      link ? out(link, '지도', 'pick') : null);
  };

  // ---- 회사 카드(큰 창): 이름 · 부스 · 길 안내(검정 하나) · 다녀왔다 · 일기 쓰기 · 공식 쪽, 그 아래 다른 날로 옮기기와 빼기.
  function card(id) {
    const it = getInterests().find((x) => x.id === id);
    if (!it) { shell.close(); return null; }
    const row = byId.get(id);
    const booth = firstBooth(id);
    const same = getInterests().filter((x) => (x.day || 0) === (it.day || 0));
    const at = same.findIndex((x) => x.id === id);
    const day = dayOf(it.day || 0);
    const more = (row?.[7]?.length || 0) - 1;
    return [
      el('div', { class: 'pcard-top' },
        el('span', { class: 'pcard-sub', text: `${longDay(day).replace(/ \(.*\)$/, '')} ${at + 1}번째${whenOf.has(id) ? ` · ${whenText(id)}` : ''}` }),
        el('button', { class: 'btn ghost pcard-close', type: 'button', text: '닫기', onclick: () => shell.close() })),
      el('h2', { class: 'pcard-name', text: nameOf(id) }),
      el('p', { class: 'pcard-place' }, `${whereOf(id)}${more > 0 ? ` 외 ${more}곳` : ''} `, booth ? el('span', { class: 'tag', text: '자리는 짐작' }) : null, ...tagsOf(row)),
      booth ? el('a', { class: 'btn wide', href: `#/map/go/${encodeURIComponent(id)}`, text: '길 안내' }) : null,
      el('div', { class: 'pcard-links' },
        el('button', { class: 'pick', type: 'button', text: it.seen ? '다녀옴 · 되돌리기' : '다녀왔다', 'aria-pressed': it.seen ? 'true' : 'false', 'aria-label': `${nameOf(id)} ${it.seen ? '다녀옴 표시 지우기' : '다녀왔다고 표시'}`, onclick: () => setSeen(id, !it.seen) }),
        row ? diaryLink(id) : null,
        row && data.link ? out(data.link.replace('{id}', encodeURIComponent(id)), '공식 쪽', 'pick') : null),
      // 부스가 둘 이상인 회사는 자리마다 한 줄(눌러서 지도의 그 자리로). 길 안내 아래에 선다.
      boothLines(row?.[7], (k) => table.get(k)?.ko || '', { pick: (b) => { const sb = splitBooth(b); location.hash = `#/map/at/${encodeURIComponent(id)}/${encodeURIComponent(`${sb.place}|${sb.code}`)}`; } }),
      row ? sessionBlock(nameOf(id), { compact: true }) : null,
      el('p', { class: 'label', text: '다른 날로 옮기기' }),
      el('div', { class: 'segs', role: 'group', 'aria-label': `${nameOf(id)} 날짜` },
        // 1/5는 전시장이 안 여는 날이라 회사를 넣지 못한다(내 일정만).
        days.filter((d) => !d.pre).map((d) => el('button', { class: 'seg', type: 'button', text: chipDay(d), 'aria-pressed': d.key === (it.day || 0) ? 'true' : 'false', 'aria-label': `${nameOf(id)} ${longDay(d)}${d.key ? '로' : '으로'}`, onclick: () => setDay(id, d.key) }))),
      el('button', { class: 'pick warn-btn pcard-remove', type: 'button', text: '갈 곳에서 빼기', 'aria-label': `${nameOf(id)} 갈 곳에서 빼기`, onclick: () => removeItem(id) }),
    ];
  }

  function draw() {
    const list = getInterests();
    const events = getEvents();
    const savedHours = getHours();
    const pace = getPace();
    const limits = dayLimits(info, savedHours, events, pace, getDayLimit(), travelByDay(list));
    const sections = [];
    whenOf.clear();

    const showDates = new Set(days.map((x) => x.date).filter(Boolean));
    const inShow = events.some((e) => showDates.has(e.date));
    if (!list.length) {
      sections.push(el('section', { class: 'panel' },
        el('p', { text: '관심 회사를 고르면 갈 곳이 생긴다.' }),
        el('div', { class: 'actions' }, el('a', { class: 'btn', href: '#/map', text: '지도에서 회사 찾기' }))));
    }
    if (!list.length && !inShow) navHolder.replaceChildren();
    if (list.length || inShow) {
      const live = liveDays(list, events);
      showDay(chooseDay(list, live));
      const d = dayOf(shown);
      const items = list.filter((it) => (it.day || 0) === d.key);
      const numberOf = new Map(items.map((it, i) => [it.id, i + 1]));
      const todo = items.filter((it) => !it.seen);
      const done = items.filter((it) => it.seen);
      const evs = d.date ? eventsOn(events, d.date) : [];
      // 1/5와 날짜 없음은 걷는 시간을 어림하지 않는다(쓸 시간 · 몇 곳쯤이 없다).
      const hours = d.date && !d.pre ? hoursFor(d.date, savedHours, info) : null;
      const when = hours ? timeline(items.length, hours, evs, pace, travelOf(items)) : [];
      items.forEach((it, i) => { if (hours) whenOf.set(it.id, when[i]); });

      // 날짜 한 줄: ‹ 1월 6일 (수) · 남은 4곳 ›. 남은 곳 = 그 날 회사 가운데 "다녀왔다"를 누르지 않은 곳(내 일정은 세지 않는다).
      // 다 다녀왔으면 "다 다녀옴", 그 날 넣은 회사가 없으면 수를 적지 않는다. 글자만 더한다(단추 · 칩은 늘리지 않는다, 2026-11-24 이재엽).
      const left = items.length ? (todo.length ? `남은 ${todo.length}곳` : '다 다녀옴') : '';
      const at = live.findIndex((x) => x.key === d.key);
      const step = (to, left) => el('button', { class: 'daynav-btn', type: 'button', disabled: !to, 'aria-label': to ? `${left ? '앞 날' : '다음 날'}: ${longDay(to)}` : (left ? '앞 날 없음' : '다음 날 없음'), onclick: () => { if (!to) return; showDay(to.key); status.textContent = ''; hideToast(); draw(); document.querySelector(`.daynav-btn[data-side="${left ? 'prev' : 'next'}"]`)?.focus({ preventScroll: true }); }, 'data-side': left ? 'prev' : 'next' }, chevron(left));
      navHolder.replaceChildren(el('div', { class: 'daynav', role: 'group', 'aria-label': '날짜' },
        step(live[at - 1], true),
        el('h2', { class: 'daynav-now', 'aria-live': 'polite' }, el('span', { class: 'daynav-day', text: longDay(d) }), left ? el('span', { class: 'daynav-left', text: `· ${left}` }) : null),
        step(live[at + 1], false)));

      // 이동 시간 한 줄은 날짜가 있는 날에만(날짜 없는 곳은 아직 차례가 아니다).
      const hopOf = d.key ? hopText : () => '';
      // 다음에 갈 곳: 고른 날의 첫 안 간 곳 하나를 가장 크게. 검정 단추는 "길 안내" 하나.
      // 날짜 없는 곳(관심만 담은 곳): 다른 날을 보고 있어도 한 줄로 알린다. 그 날이 비었으면 빈 화면 말 아래 단추로 크게, 아니면 아래에 작게(2026-11-24).
      const noDate = d.key ? list.filter((it) => !it.day && !it.seen).length : 0;
      const goNoDate = () => { showDay(0); status.textContent = ''; hideToast(); draw(); window.scrollTo(0, 0); holder.querySelector('.nextup-open')?.focus({ preventScroll: true }); };
      const next = todo[0];
      if (settings?.halfDay && d.key && !d.pre) { const band = halfBand(items, d.key); if (band) sections.push(band); }
      if (next) {
        const hasBooth = !!firstBooth(next.id);
        // 바로 앞에 다녀온 곳(그 날 차례에서 한 칸 앞)과 캠퍼스가 다르면 걸어서 몇 분쯤인지 한 줄.
        const hop = hopOf(items[items.indexOf(next) - 1]?.id, next.id);
        sections.push(el('section', { class: 'panel nextup' },
          el('button', { class: 'nextup-open', type: 'button', 'aria-label': `${nameOf(next.id)} 카드 열기`, onclick: (ev) => openCard(next.id, ev.currentTarget) },
            el('span', { class: 'note', text: ['다음에 갈 곳', whenText(next.id)].filter(Boolean).join(' · ') }),
            el('span', { class: 'big', text: nameOf(next.id) }),
            el('span', { class: 'note', text: whereOf(next.id) })),
          hop ? el('p', { class: 'hop', text: hop }) : null,
          el('div', { class: 'nextup-go' },
            hasBooth ? el('a', { class: 'btn', href: `#/map/go/${encodeURIComponent(next.id)}`, text: '길 안내' }) : null,
            el('button', { class: 'pick', type: 'button', text: '다녀왔다', 'aria-label': `${nameOf(next.id)} 다녀왔다고 표시`, onclick: () => setSeen(next.id, true) }))));
      } else {
        sections.push(el('section', { class: 'panel nextup' },
          el('p', { class: 'big', text: items.length ? '이 날 갈 곳을 다 다녀왔다.' : '이 날 넣은 곳이 없다.' }),
          items.length ? null
            : noDate ? el('button', { class: 'btn', type: 'button', text: `날짜 없는 곳 ${noDate}곳 보기`, onclick: goNoDate })
              : el('p', { class: 'note', text: '지도에서 회사를 고르고 "갈 곳에 넣기"에서 이 날을 누른다.' })));
      }

      // 그다음 곳들: 내 일정은 때에 맞는 자리에 점선 칸으로 끼운다.
      const rest = todo.slice(1);
      const kids = [];
      const waiting = [...evs];
      let before = next;
      for (const it of rest) {
        const t = whenOf.get(it.id);
        while (waiting.length && typeof t === 'number' && (toMin(waiting[0].from) ?? 0) <= t) kids.push(eventRow(waiting.shift()));
        // 앞 줄과 캠퍼스가 다른 줄 위에만 한 줄(같은 캠퍼스 안에는 없다).
        const hop = hopOf(before.id, it.id);
        if (hop) kids.push(el('li', { class: 'hop', text: hop }));
        kids.push(item(it, numberOf.get(it.id)));
        before = it;
      }
      // 때를 모르는 날이면 내 일정이 먼저, 아니면 남은 일정은 맨 뒤에 선다.
      if (hours) kids.push(...waiting.map((e) => eventRow(e))); else kids.unshift(...waiting.map((e) => eventRow(e)));
      if (kids.length) {
        sections.push(el('section', { class: 'after' },
          el('h3', { class: 'subhead', text: rest.length ? `그다음 ${rest.length}곳` : '이 날 내 일정' }),
          el('ol', { class: 'stops' }, kids)));
      }

      // 이 날에 대해 알아야 할 한 줄(있을 때만)
      const room = hours ? limits[d.key] : null;
      // 내 시간에 안 들어가는 곳: 하루에 들어가는 수를 넘은 곳과 때가 "내 시간 밖"으로 나온 곳 가운데 많은 쪽(이동 시간으로 밀린 곳도 센다).
      const over = hours && !hours.off ? Math.max(items.length - room, when.filter((t) => t === null).length) : 0;
      const allMarks = getMarks();
      const cardCount = todo.filter((it) => (byId.get(it.id)?.[7] || []).some((b) => { const a = b.lastIndexOf('@'); return allMarks[`${b.slice(a + 1)}|${b.slice(0, a)}`]; })).length;
      const notes = [
        d.pre ? el('p', { class: 'note', text: d.note }) : null,
        !d.key ? el('p', { class: 'note', text: '날짜를 정하지 않은 곳이다. 이름을 눌러 날짜를 고른다.' }) : null,
        hours?.off ? el('p', { class: 'note', text: '이 날은 안 보는 날로 정했다.' }) : null,
        // 그 날에 들어가는 수를 넘으면 알려 준다 (막지는 않는다).
        over > 0 ? el('p', { class: 'note warn', text: `${over}곳이 내 시간에 안 들어간다. 다른 날로 옮기거나 내 시간을 늘린다.` }) : null,
        cardCount ? el('p', { class: 'note', text: `명함 넣는 부스 ${cardCount}곳 · 명함 ${cardCount}장 필요` }) : null,
      ].filter(Boolean);
      if (notes.length) sections.push(el('div', { class: 'daynotes' }, notes));

      // 다녀온 곳: 한 줄로 접는다. "보기"를 누르면 줄이 펼쳐지고, 줄의 "다녀옴" 칸을 눌러 되돌린다.
      if (done.length) {
        const names = done.length === 1 ? nameOf(done[0].id) : `${nameOf(done[0].id)} 외 ${done.length - 1}곳`;
        sections.push(el('section', { class: 'visited' },
          el('div', { class: 'fold' },
            el('span', { class: 'fold-text', text: `다녀온 곳 ${done.length} (${names})` }),
            el('button', { class: 'pick', type: 'button', 'aria-expanded': foldOpen ? 'true' : 'false', 'aria-label': foldOpen ? '다녀온 곳 접기' : `다녀온 곳 ${done.length}곳 보기`, text: foldOpen ? '접기' : '보기', onclick: () => { foldOpen = !foldOpen; draw(); document.querySelector('.fold .pick')?.focus({ preventScroll: true }); } })),
          foldOpen ? el('ol', { class: 'stops' }, done.map((it) => item(it, numberOf.get(it.id)))) : null));
      }

      if (noDate && items.length) {
        sections.push(el('div', { class: 'fold nodate' },
          el('span', { class: 'fold-text', text: `날짜 없는 곳 ${noDate}곳` }),
          el('button', { class: 'pick', type: 'button', 'aria-label': `날짜 없는 곳 ${noDate}곳 보기`, text: '보기', onclick: goNoDate })));
      }

      sections.push(el('div', { class: 'fold foot-links' },
        toolsBtn,
        items.length ? el('a', { class: 'pick', href: d.key ? `#/map/day/${d.key}` : '#/map', text: '지도에서 보기' }) : null));
    }

    // 전시 기간 밖의 내 일정 (공항 이동 같은 것).
    const others = events.filter((e) => !showDates.has(e.date)).sort((a, b) => a.date.localeCompare(b.date) || a.from.localeCompare(b.from));
    if (others.length) {
      sections.push(el('section', { class: 'after' },
        el('h3', { class: 'subhead', text: `전시 밖 내 일정 ${others.length}개` }),
        el('ol', { class: 'stops' }, others.map((e) => eventRow(e, true)))));
    }
    holder.replaceChildren(...sections);
    // 카드가 열려 있으면 바뀐 모습으로 다시 그린다.
    if (shell.isOpen && openId) { const c = card(openId); if (c) shell.update(c); }
  }

  // ---- 목록 고치기(큰 창): 날짜 나누기 · 줄 세우기 · 하루에 볼 곳 · 다른 사람에게 보내기 · 받은 목록 넣기. 검정 단추는 없다.
  // 하루에 볼 곳은 사람마다 다르다. 여기서 정한 수를 "날마다 나누기"가 지킨다. 폰에만 남는다.
  const limitSelect = el('select', { 'aria-label': '하루에 볼 곳' },
    [0, 5, 6, 8, 10, 12, 15, 20].map((n) => el('option', { value: n, selected: n === getDayLimit(), text: n ? `${n}곳` : '정하지 않음' })));
  if (getDayLimit() && ![5, 6, 8, 10, 12, 15, 20].includes(getDayLimit())) limitSelect.prepend(el('option', { value: getDayLimit(), selected: true, text: `${getDayLimit()}곳` }));
  limitSelect.addEventListener('change', () => {
    setDayLimit(Number(limitSelect.value));
    status.textContent = Number(limitSelect.value) ? `하루에 ${limitSelect.value}곳으로 정했다.` : '하루에 볼 곳을 정하지 않았다.';
    draw();
    roomNote.textContent = roomText();
  });
  // "10시 ~ 18시 · 하루에 14곳쯤 볼 수 있다" (보고 있는 날)
  const roomNote = el('p', { class: 'note' });
  const roomText = () => {
    const d = dayOf(shown);
    if (!d?.date || d.pre) return '';
    const hours = hoursFor(d.date, getHours(), info);
    if (hours.off) return `${longDay(d)}은 안 보는 날로 정했다.`;
    return `${longDay(d)} · ${hourKo(hours.from)} ~ ${hourKo(hours.to)} · 하루에 ${dayLimits(info, getHours(), getEvents(), getPace(), getDayLimit(), travelByDay(getInterests()))[d.key]}곳쯤 볼 수 있다`;
  };
  const fill = () => {
    const limit = getDayLimit();
    // 날마다 들어가는 수: 쓸 시간(내 일정을 뺀 것)으로 셈한 수와 내가 정한 수 가운데 작은 것.
    const { items, filled, moved, over } = fillDays(getInterests(), firstBooth, table, dayLimits(info, getHours(), getEvents(), getPace(), limit, travelByDay(getInterests())));
    setInterests(items);
    shell.close();
    status.textContent = !filled ? '날짜 없는 곳이 없다. 가까운 곳끼리 줄만 다시 세웠다.'
      : `날짜 없던 ${filled}곳을 날마다 나눴다.${moved ? ` ${moved}곳은 자리가 없어 다음 날로 넘겼다.` : ''}${over ? ` ${over}곳은 들어갈 날이 없다.` : ''}`;
    draw();
  };
  const sort = () => {
    setInterests(sortRoute(getInterests(), firstBooth, table));
    shell.close();
    status.textContent = '가까운 곳끼리 줄을 세웠다.';
    draw();
  };
  // 다른 사람에게 보내기: 폰의 공유 창으로 글(날마다 회사 · 부스)과 받는 링크를 보낸다. 공유 창이 없으면 복사한다. 우리 서버는 거치지 않는다.
  const shareDays = days.filter((d) => !d.pre).map((d) => ({ key: d.key, ko: d.key ? `${d.ko} ${d.hours}` : d.ko, short: chipDay(d) }));
  const placeKo = new Map(places.places.map((p) => [p.k, p.ko]));
  const send = async () => {
    const list = getInterests();
    if (!list.length) { status.textContent = '아직 관심 회사가 없다.'; return; }
    const text = `${planText(list, shareDays, byId, placeKo)}\n\n받는 링크: ${shareLink(location.href, list)}`;
    try {
      if (navigator.share) { await navigator.share({ title: 'CES 2027 갈 곳', text }); status.textContent = ''; return; }
    } catch (e) { if (e?.name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(text); status.textContent = '복사했다. 단톡방에 붙여 넣는다.'; } catch { status.textContent = '복사하지 못했다.'; }
  };
  // 받은 글이나 링크: 내게 없는 것이 몇 곳인지 보이고, 더할지 묻는다(큰 창 안에서).
  function offer(text, from) {
    const got = readCode(text, [...byId.keys()]);
    if (!got.length) { status.textContent = '받은 글에서 회사를 찾지 못했다.'; return; }
    const { added } = mergeItems(getInterests(), got);
    openId = null;
    shell.open([
      el('div', { class: 'pcard-top' }, el('h2', { class: 'pcard-tools-title', text: '받은 목록' }), el('button', { class: 'btn ghost pcard-close', type: 'button', text: '닫기', onclick: () => shell.close() })),
      el('p', { class: 'pcard-where', text: `${got.length}곳 가운데 내게 없는 것 ${added}곳` }),
      el('p', { class: 'note', text: got.slice(0, 5).map((it) => byId.get(it.id)[1]).join(' · ') + (got.length > 5 ? ' …' : '') }),
      el('div', { class: 'actions' },
        el('button', { class: 'btn', type: 'button', text: `${added}곳 더하기`, disabled: added === 0, onclick: () => {
          setInterests(mergeItems(getInterests(), got).items);
          shell.close();
          status.textContent = `${added}곳을 더했다.`;
          draw();
        } }),
        el('button', { class: 'btn ghost', type: 'button', text: '버리기', onclick: () => { shell.close(); status.textContent = ''; } })),
    ], from);
  }
  const codeInput = el('input', { autocapitalize: 'off', autocomplete: 'off', spellcheck: 'false', placeholder: '받은 글이나 링크를 붙여 넣는다', 'aria-label': '받은 목록 글이나 링크' });
  const codeForm = el('form', { class: 'inline' }, el('label', { class: 'field' }, el('span', { class: 'label', text: '받은 목록 넣기' }), codeInput), el('button', { class: 'btn ghost', type: 'submit', text: '넣기' }));
  codeForm.addEventListener('submit', (ev) => { ev.preventDefault(); if (codeInput.value.trim()) { const text = codeInput.value; codeInput.value = ''; offer(text, toolsBtn); } });
  const toolRow = (title, sub, onclick) => el('li', {}, el('button', { class: 'pick-row', type: 'button', onclick }, el('b', { text: title }), el('span', { text: sub })));
  const tools = () => {
    const none = getInterests().filter((it) => !it.day).length;
    roomNote.textContent = roomText();
    return [
      el('div', { class: 'pcard-top' }, el('h2', { class: 'pcard-tools-title', text: '목록 고치기' }), el('button', { class: 'btn ghost pcard-close', type: 'button', text: '닫기', onclick: () => shell.close() })),
      el('ul', { class: 'pick-list' },
        toolRow('날짜 없는 곳을 날마다 나누기', none ? `날짜 없음 ${none}곳을 홀이 같은 곳끼리 같은 날에 넣는다` : '지금은 날짜 없는 곳이 없다', fill),
        toolRow('가까운 곳끼리 줄 세우기', '부스 번호로 걷는 차례를 짐작해 다시 세운다', sort),
        toolRow('다른 사람에게 보내기', '회사와 날짜만 간다. 명함 · 일기는 안 간다', send)),
      toolNote,
      el('div', { class: 'tools' },
        el('label', { class: 'field' }, el('span', { class: 'label', text: '하루에 볼 곳' }), limitSelect),
        roomNote,
        codeForm),
    ];
  };
  const toolsBtn = el('button', { class: 'pick', type: 'button', text: '목록 고치기', onclick: (ev) => { openId = null; hideToast(); toolNote.textContent = ''; shell.open(tools(), ev.currentTarget); } });
  // 곧 시작하는 내 일정 · 오늘 명함 몇 장(알림을 못 쓰는 폰에서도 보이게). 있을 때만 한 줄 띠로 뜬다. 종이 명함 물음은 설정의 "종이 명함" 줄에만 있다.
  const bands = alertBands();

  draw();
  // 링크로 들어왔으면(#plan=…) 받은 목록부터 보인다.
  let arrived = null;
  try { arrived = sessionStorage.getItem('ces2027.incoming'); if (arrived) sessionStorage.removeItem('ces2027.incoming'); } catch { /* 저장이 막혀도 화면은 된다 */ }
  if (arrived) setTimeout(() => offer(arrived, toolsBtn), 0);

  return el('div', { class: 'page planpage' },
    el('h1', { class: 'sr-only', text: '갈 곳' }),
    navHolder,
    pageNote,
    bands,
    holder,
    el('div', { class: 'row-actions', role: 'group', 'aria-label': '갈 곳 더 보기' }, el('a', { href: '#/sessions', text: '강연 일정' }), el('a', { href: '#/rec', text: '추천 회사' }), el('a', { href: '#/days', text: '내 시간' })),
    el('p', { class: 'note', text: '일정은 바뀔 수 있다 — 운영팀 안내가 먼저.' }),
    toast,
    shell.node);
}
