// 동선: 관심 회사를 날짜 · 캠퍼스 · 걷는 차례로 세운다. 날짜 칩 하나에 그 날 차례만 보이고, 번호는 지도의 번호와 같다.
// 줄은 가볍게(번호 · 이름 · 때와 곳 · 봤다), 자세한 것과 고치기는 회사 카드(큰 창)에 둔다. 날짜는 바꿀 수 있고 폰에만 남는다.

import { el, out } from '../dom.js';
import { getExhibitors, getInfo, getMeta, getPlaces } from '../data.js';
import { getDayLimit, getEvents, getHours, getInterests, getPace, setDayLimit, setInterests } from '../store.js';
import { clock, dayLimits, dayList, eventsOn, hoursFor, timeline } from '../days.js';
import { placeLink } from './days.js';
import { markLabel, toggleMark } from '../alerts.js';
import { getMarks, setMarks } from '../notify.js';
import { fillDays, nextStop, placeTable, sortRoute, splitBooth } from '../route.js';
import { mapsLink } from '../maps.js';
import { alertBands } from '../bands.js';
import { attachImage } from '../company-image.js';
import { createCardShell } from '../plancard.js';
import { boothLines, sessionBlock } from '../company-extra.js';
import { mergeItems, planCode, planCsv, planMd, planText, readCode, shareLink } from '../share.js';

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = el('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const DAY_KEY = 'ces2027.planDay';
const shortDay = (ko) => ko.split(' ').join('');

export async function render() {
  document.body.classList.remove('pcard-open');
  const meta = await getMeta();
  if (!meta) {
    return el('section', { class: 'panel' }, el('h1', { text: '동선' }), el('p', { text: '전시사 자료를 아직 받지 못했다. 인터넷에 닿으면 다시 열어 본다.' }),
      el('div', { class: 'actions' }, el('button', { class: 'btn', type: 'button', text: '다시 열기', onclick: () => location.reload() }), el('a', { class: 'btn ghost', href: '#/map', text: '지도로' })));
  }
  const [data, places, info] = await Promise.all([getExhibitors(), getPlaces(), getInfo()]);
  const table = placeTable(places);
  const campusKo = new Map(places.campuses.map((c) => [c.k, c.ko]));
  const byId = new Map(data.ex.map((r) => [r[0], r]));
  const placeBy = new Map(places.places.map((p) => [p.k, p]));
  const placeOf = (id) => { const b = byId.get(id)?.[7]?.[0]; return b ? placeBy.get(splitBooth(b).place) : null; };
  const firstBooth = (id) => byId.get(id)?.[7]?.[0] || null;
  // 날짜 칩: 1/5(사전 일정) · 1/6 ~ 1/9 · 날짜 미정. 번호는 저장된 것과 같다(1/5만 5번이고, 보이는 차례는 맨 앞).
  const days = [...dayList(info), { key: 0, ko: '날짜 미정', hours: '', date: null }];
  const dayOf = (key) => days.find((d) => d.key === key);
  const koreaAt = data.countries?.indexOf('South Korea');
  const nameOf = (id) => byId.get(id)?.[1] || '자료에서 빠진 회사';

  const holder = el('div', { class: 'page' });
  const nowHolder = el('div', { class: 'page' });
  const chipHolder = el('div', { class: 'segs', role: 'group', 'aria-label': '날짜' });
  const pageNote = el('p', { class: 'note', role: 'status' });
  const toolNote = el('p', { class: 'note', role: 'status' });
  // 알림 글은 화면 위 줄과 "차례 정리" 카드 안 줄에 함께 쓴다(카드가 덮고 있어도 보이게).
  const status = { set textContent(t) { pageNote.textContent = t; toolNote.textContent = t; } };
  let undo = null; // 방금 뺀 회사를 되돌리는 한 줄
  const undoBar = el('div', { class: 'undo', hidden: true });
  const showUndo = (id, at, it) => {
    undo = { id, at, it };
    undoBar.replaceChildren(el('span', { text: `${nameOf(id)} 뺐다` }), el('button', { class: 'pick', type: 'button', text: '되돌리기', onclick: () => {
      const list = getInterests();
      if (!list.some((x) => x.id === id)) list.splice(Math.min(undo.at, list.length), 0, undo.it);
      undo = null; undoBar.hidden = true;
      setInterests(list); draw();
    } }));
    undoBar.hidden = false;
    clearTimeout(showUndo.t);
    showUndo.t = setTimeout(() => { undo = null; undoBar.hidden = true; }, 6000);
  };
  const shell = createCardShell();
  window.addEventListener('hashchange', () => shell.close(), { once: true });

  // 지금 보는 날: 저장해 둔 날 → 오늘 → 동선이 있는 첫 날.
  const today = () => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
  let shown = null;
  function chooseDay(list, events) {
    const has = (k) => list.some((it) => (it.day || 0) === k) || (dayOf(k)?.date && eventsOn(events, dayOf(k).date).length > 0);
    const saved = Number(sessionStorage.getItem(DAY_KEY));
    if (shown !== null && has(shown)) return shown;
    if (Number.isFinite(saved) && sessionStorage.getItem(DAY_KEY) !== null && has(saved)) return saved;
    const now = days.find((d) => d.date === today());
    if (now && has(now.key)) return now.key;
    return days.find((d) => has(d.key))?.key ?? 1;
  }
  const showDay = (key) => { shown = key; try { sessionStorage.setItem(DAY_KEY, String(key)); } catch { /* 저장이 막혀도 화면은 된다 */ } };

  // 카드와 줄이 함께 쓰는 고치기. 고친 뒤에는 줄과 (열려 있으면) 카드를 다시 그린다.
  let openId = null;
  const change = (fn, note) => { setInterests(fn(getInterests())); if (note) status.textContent = note; draw(); };
  const setSeen = (id) => change((l) => l.map((x) => (x.id === id ? { ...x, seen: !x.seen } : x)), '');
  const setDay = (id, key) => { showDay(key); change((l) => l.map((x) => (x.id === id ? { ...x, day: key } : x)), '날짜를 바꿨다.'); };
  const removeItem = (id) => {
    const at = getInterests().findIndex((x) => x.id === id);
    const it = getInterests()[at];
    shell.close(); openId = null;
    change((l) => l.filter((x) => x.id !== id), '');
    if (it) showUndo(id, at, it);
  };
  // 같은 날짜 안에서 한 칸 위 · 아래로 옮긴다 (걷는 차례를 손으로 고칠 때).
  const move = (id, step) => {
    const list = getInterests();
    const it = list.find((x) => x.id === id);
    const same = list.map((x, n) => ({ x, n })).filter((v) => (v.x.day || 0) === (it.day || 0));
    const at = same.findIndex((v) => v.x.id === id);
    const other = same[at + step];
    if (at < 0 || !other) return;
    [list[same[at].n], list[other.n]] = [list[other.n], list[same[at].n]];
    change(() => list, '차례를 바꿨다.');
  };

  // 때(분): 날마다 draw가 채운다. null이면 쓸 시간 밖, 없으면 날짜 미정.
  const whenOf = new Map();
  const whenText = (id) => { if (!whenOf.has(id)) return ''; const at = whenOf.get(id); return at === null ? '시간 밖' : `${clock(at)}쯤`; };
  const tagsOf = (row) => [
    row?.[5] ? el('span', { class: 'tag mint', text: row[5] & 2 ? '최고 혁신상' : '혁신상' }) : null,
    row && koreaAt >= 0 && row[3] === koreaAt ? el('span', { class: 'tag mint', text: '한국' }) : null,
  ].filter(Boolean);
  const catsOf = (row, n) => (row?.[4] ? row[4].split('.').map((c) => data.catsKo?.[c] || data.cats?.[c]).filter(Boolean).slice(0, n).join(' · ') : '');
  const whereOf = (id) => {
    const booth = firstBooth(id);
    const row = byId.get(id);
    const place = booth ? table.get(splitBooth(booth).place) : null;
    return booth ? `${place ? place.ko : '장소 모름'} · 부스 ${splitBooth(booth).code}` : (row ? '부스 미정' : '새로 받은 자료에 없다');
  };

  // ---- 줄: 번호 · 이름 · 때와 곳 · 봤다. 누르면 카드.
  function item(it, no) {
    const row = byId.get(it.id);
    const when = whenText(it.id);
    const booth = firstBooth(it.id);
    const open = el('button', { class: 'stop-open', type: 'button', 'aria-label': `${no}번 ${nameOf(it.id)} 카드 열기`, onclick: (ev) => { openId = it.id; shell.open(card(it.id), ev.currentTarget); } },
      el('span', { class: 'no', text: String(no) }),
      el('span', { class: 'stop-main' },
        el('span', { class: 'name', text: nameOf(it.id) }),
        el('span', { class: 'where', text: [when, whereOf(it.id).replace(' · 부스', ' ·')].filter(Boolean).join(' · ') }),
        tagsOf(row).length ? el('span', { class: 'stop-tags' }, tagsOf(row)) : null));
    const seen = el('button', { class: 'pick seen-btn', type: 'button', text: it.seen ? '봤다' : '아직', 'aria-pressed': it.seen ? 'true' : 'false', 'aria-label': `${nameOf(it.id)} 봤다고 표시`, onclick: () => { status.textContent = it.seen ? '아직 안 본 곳으로 돌렸다.' : '봤다. 다음 갈 곳이 바뀐다.'; setSeen(it.id); } });
    return el('li', { class: it.seen ? 'stop seen' : 'stop', 'data-booth': booth ? 'y' : 'n' }, open, seen);
  }

  // ---- 회사 카드(큰 창): 크게 · 자세히, 그리고 이 회사를 고치는 단추 전부
  function card(id) {
    const it = getInterests().find((x) => x.id === id);
    if (!it) { shell.close(); return null; }
    const row = byId.get(id);
    const booth = firstBooth(id);
    const place = placeOf(id);
    const same = getInterests().filter((x) => (x.day || 0) === (it.day || 0));
    const at = same.findIndex((x) => x.id === id);
    const route = mapsLink(places, place, 'directions');
    const keys = (row?.[7] || []).map((b) => { const a = b.lastIndexOf('@'); return `${b.slice(a + 1)}|${b.slice(0, a)}`; });
    const markKey = keys.find((k) => getMarks()[k]) || null;
    const day = dayOf(it.day || 0);
    const cats = catsOf(row, 4);
    const logoBox = el('div', { class: 'card-logo' });
    if (row) attachImage(logoBox, id, row[1], data);
    return [
      el('div', { class: 'pcard-top' },
        el('span', { class: 'no big-no', text: String(at + 1) }),
        el('span', { class: 'pcard-sub', text: `${day ? day.ko : ''} ${at + 1}번째${whenOf.has(id) ? ` · ${whenText(id)}` : ''}` }),
        el('button', { class: 'btn ghost pcard-close', type: 'button', text: '닫기', onclick: () => shell.close() })),
      el('h2', { class: 'pcard-name', text: nameOf(id) }),
      // 부스가 둘 이상인 회사는 자리마다 한 줄(눌러서 지도의 그 자리로), 하나뿐이면 한 줄
      boothLines(row?.[7], (k) => table.get(k)?.ko || '', { pick: (b) => { const sb = splitBooth(b); location.hash = `#/map/at/${encodeURIComponent(id)}/${encodeURIComponent(`${sb.place}|${sb.code}`)}`; } })
        || el('p', { class: 'pcard-where', text: whereOf(id) }),
      el('p', { class: 'card-tags' }, ...tagsOf(row), booth ? el('span', { class: 'tag', text: '자리 짐작' }) : null),
      cats ? el('p', { class: 'pcard-cats', text: cats }) : null,
      row ? sessionBlock(nameOf(id)) : null,
      row ? el('div', { class: 'actions' },
        el('a', { class: 'btn', href: `#/map/at/${encodeURIComponent(id)}`, text: '지도에서 보기' }),
        el('a', { class: 'btn ghost', href: `#/map/go/${encodeURIComponent(id)}`, text: '길 안내' })) : null,
      el('div', { class: 'actions' },
        el('button', { class: 'btn ghost', type: 'button', text: it.seen ? '봤다 · 되돌리기' : '봤다', 'aria-pressed': it.seen ? 'true' : 'false', onclick: () => setSeen(id) }),
        route ? out(route, '구글맵 길찾기', 'btn ghost') : null),
      el('p', { class: 'label', text: '날짜' }),
      el('div', { class: 'segs', role: 'group', 'aria-label': `${nameOf(id)} 날짜` },
        days.map((d) => el('button', { class: 'seg', type: 'button', text: d.key ? shortDay(d.ko).replace(/\(.*\)/, '') : '미정', 'aria-pressed': d.key === (it.day || 0) ? 'true' : 'false', 'aria-label': `${nameOf(id)} ${d.ko}로`, onclick: () => setDay(id, d.key) }))),
      el('p', { class: 'label', text: `차례 ${at + 1} / ${same.length}` }),
      el('div', { class: 'actions' },
        el('button', { class: 'btn ghost', type: 'button', text: '위로', disabled: at <= 0, 'aria-label': `${nameOf(id)} 한 칸 위로`, onclick: () => move(id, -1) }),
        el('button', { class: 'btn ghost', type: 'button', text: '아래로', disabled: at >= same.length - 1, 'aria-label': `${nameOf(id)} 한 칸 아래로`, onclick: () => move(id, 1) })),
      el('div', { class: 'row-actions' },
        row ? el('a', { href: `#/diary/new/${id}`, text: '일기' }) : null,
        row ? el('a', { href: `#/talk/${encodeURIComponent(id)}`, text: '대화' }) : null,
        row && data.link ? out(data.link.replace('{id}', encodeURIComponent(id)), '공식 링크') : null,
        keys.length ? el('button', { class: 'linkish', type: 'button', 'aria-pressed': markKey ? 'true' : 'false', 'aria-label': `${nameOf(id)} 명함 넣는 이벤트 ${markKey ? '표시 지우기' : '있음으로 표시'}`, text: markKey ? `명함 이벤트 (${markLabel(getMarks()[markKey])})` : '명함 이벤트', onclick: () => { setMarks(toggleMark(getMarks(), markKey || keys[0])); status.textContent = markKey ? '표시를 지웠다.' : '명함 넣는 부스로 표시했다. 내가 표시한 것이다.'; draw(); } }) : null),
      logoBox,
      el('button', { class: 'btn ghost warn-btn', type: 'button', text: '관심에서 빼기', 'aria-label': `${nameOf(id)} 관심에서 빼기`, onclick: () => removeItem(id) }),
    ];
  }

  function draw() {
    const list = getInterests();
    const events = getEvents();
    const savedHours = getHours();
    const pace = getPace();
    const limits = dayLimits(info, savedHours, events, pace, getDayLimit());
    const sections = [];
    const next = nextStop(list);
    const eventRow = (e) => {
      const link = placeLink(places, e.place);
      return el('li', { class: 'stop event' },
        el('span', { class: 'no', text: '일' }),
        el('span', { class: 'stop-main' },
          el('span', { class: 'name', text: e.name }),
          el('span', { class: 'where', text: `${e.from} ~ ${e.to}${e.place ? ` · ${e.place}` : ''} · 내 일정` })),
        link ? out(link, '지도', 'pick') : null);
    };

    // 지금 갈 곳(맨 위 한 줄)
    if (!list.length) {
      sections.push(el('section', { class: 'panel' },
        el('p', { text: '관심 회사를 고르면 동선이 생긴다.' }),
        el('div', { class: 'actions' }, el('a', { class: 'btn', href: '#/map', text: '지도에서 회사 찾기' }))));
    }
    let now = null;
    if (next) {
      const booth = firstBooth(next.id);
      const route = mapsLink(places, placeOf(next.id), 'directions');
      now = el('section', { class: 'panel next now' },
        el('div', { class: 'now-text' },
          el('p', { class: 'note', text: `지금 갈 곳 · ${dayOf(next.day || 0)?.ko || ''}` }),
          el('p', { class: 'big', text: nameOf(next.id) }),
          el('p', { class: 'note', text: booth ? whereOf(next.id) : '부스 미정' })),
        el('div', { class: 'now-go' },
          el('a', { class: 'btn', href: `#/map/go/${encodeURIComponent(next.id)}`, text: '길 안내' }),
          route ? out(route, '길찾기', 'pick') : null));
    } else if (list.length) {
      now = el('section', { class: 'panel next now' }, el('p', { class: 'note', text: '지금 갈 곳' }), el('p', { text: '동선의 회사를 다 봤다.' }));
    }

    // 날짜 칩: 날마다 몇 곳인지 보이고, 하나를 누르면 그 날 차례만 보인다.
    whenOf.clear();
    const live = days.filter((d) => list.some((it) => (it.day || 0) === d.key) || (d.date && eventsOn(events, d.date).length));
    if (live.length) {
      showDay(chooseDay(list, events));
      chipHolder.replaceChildren(...live.map((d) => {
        const n = list.filter((it) => (it.day || 0) === d.key).length;
        return el('button', { class: 'seg daychip', type: 'button', 'aria-pressed': d.key === shown ? 'true' : 'false', 'aria-label': `${d.ko} ${n}곳 보기`, onclick: () => { showDay(d.key); draw(); } },
          el('span', { class: 'dc-day', text: d.key ? shortDay(d.ko).replace(/\(.*\)/, '') : '미정' }), el('span', { class: 'dc-n', text: `${n}곳` }));
      }));
    } else chipHolder.replaceChildren();
    chipHolder.hidden = !live.length;

    // 그 날의 줄
    const d = live.length ? dayOf(shown) : null;
    if (d) {
      const items = list.filter((it) => (it.day || 0) === d.key);
      const evs = d.date ? eventsOn(events, d.date) : [];
      // 1/5는 전시장을 열기 전이라 걷는 시간을 어림하지 않는다(쓸 시간 · 몇 곳까지가 없다).
      const hours = d.date && !d.pre ? hoursFor(d.date, savedHours, info) : null;
      const when = hours ? timeline(items.length, hours, evs, pace) : [];
      items.forEach((it, i) => { if (hours) whenOf.set(it.id, when[i]); });
      const kids = evs.map(eventRow);
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
      const room = hours ? limits[d.key] : null;
      const allMarks = getMarks();
      const cardCount = items.filter((it) => (byId.get(it.id)?.[7] || []).some((b) => { const at = b.lastIndexOf('@'); return allMarks[`${b.slice(at + 1)}|${b.slice(0, at)}`]; })).length;
      sections.push(el('section', { class: 'panel' },
        el('h2', { text: `${d.ko} · ${items.length}곳` }),
        d.pre ? el('p', { class: 'note', text: d.note }) : null,
        hours ? el('p', { class: 'note', text: hours.off
          ? '이 날은 안 보는 날이다.'
          : `${cardCount ? `명함 ${cardCount}장 필요 · ` : ''}${clock(hours.from)} ~ ${clock(hours.to)} · 한 곳 ${pace}분 · ${room}곳까지` }) : null,
        // 그 날에 들어가는 수를 넘으면 알려 준다 (막지는 않는다).
        hours && items.length > room ? el('p', { class: 'note warn', text: `${items.length - room}곳이 넘친다. 날짜를 옮기거나 시간을 늘린다.` }) : null,
        items.length ? el('ol', { class: 'stops' }, kids) : el('p', { class: 'note', text: '이 날 넣은 회사가 없다. 지도에서 회사 카드의 날짜로 넣는다.' }),
        items.length ? el('div', { class: 'actions' }, el('a', { class: 'btn ghost', href: `#/map/day/${d.key}`, text: '이 날 지도에서 보기' })) : null));
    }
    // 전시 기간 밖의 내 일정 (공항 이동 같은 것).
    const showDates = new Set(days.map((x) => x.date).filter(Boolean));
    const others = events.filter((e) => !showDates.has(e.date)).sort((a, b) => a.date.localeCompare(b.date) || a.from.localeCompare(b.from));
    if (others.length) {
      sections.push(el('section', { class: 'panel' },
        el('h2', { text: `전시 밖 일정 ${others.length}개` }),
        el('ol', { class: 'stops' }, others.map((e) => eventRow({ ...e, name: `${e.date.slice(5).replace('-', '/')} ${e.name}` })))));
    }
    nowHolder.replaceChildren(...(now ? [now] : []));
    holder.replaceChildren(...sections);
    // 카드가 열려 있으면 바뀐 모습으로 다시 그린다.
    if (shell.isOpen && openId) { const c = card(openId); if (c) shell.update(c); }
  }

  // 하루에 볼 곳은 사람마다 다르다. 여기서 정한 수를 "날짜 채우기"가 지킨다. 폰에만 남는다.
  const limitSelect = el('select', { 'aria-label': '하루에 볼 곳' },
    [0, 5, 6, 8, 10, 12, 15, 20].map((n) => el('option', { value: n, selected: n === getDayLimit(), text: n ? `${n}곳까지` : '정하지 않음' })));
  if (getDayLimit() && ![5, 6, 8, 10, 12, 15, 20].includes(getDayLimit())) limitSelect.prepend(el('option', { value: getDayLimit(), selected: true, text: `${getDayLimit()}곳까지` }));
  limitSelect.addEventListener('change', () => {
    setDayLimit(Number(limitSelect.value));
    status.textContent = Number(limitSelect.value)
      ? `하루 ${limitSelect.value}곳까지로 정했다.`
      : '하루 수를 정하지 않았다.';
    draw();
  });
  const fill = el('button', { class: 'btn', type: 'button', text: '날짜 채우기', onclick: () => {
    const limit = getDayLimit();
    // 날마다 들어가는 수: 쓸 시간(내 일정을 뺀 것)으로 셈한 수와 내가 정한 수 가운데 작은 것.
    const { items, filled, moved, over } = fillDays(getInterests(), firstBooth, table, dayLimits(info, getHours(), getEvents(), getPace(), limit));
    setInterests(items);
    status.textContent = !filled ? '채울 곳이 없다. 걷는 차례로 다시 세웠다.'
      : `${filled}곳을 캠퍼스로 채웠다.${moved ? ` ${moved}곳은 다음 날로 넘겼다.` : ''}${over ? ` ${over}곳은 들어갈 날이 없다.` : ''}`;
    shell.close();
    draw();
  } });
  const sort = el('button', { class: 'btn ghost', type: 'button', text: '걷는 차례로', onclick: () => {
    setInterests(sortRoute(getInterests(), firstBooth, table));
    status.textContent = '걷는 차례로 세웠다.';
    shell.close();
    draw();
  } });

  // 나누기와 내보내기 (미리 보기 판의 "목록 코드 · 링크 · 글 · 마크다운 · CSV"에서 옮겼다).
  const shareDays = days.map((d) => ({ key: d.key, ko: d.key ? `${d.ko} ${d.hours}` : d.ko, short: d.key ? d.ko.split(' ')[0] : '미정' }));
  const placeKo = new Map(places.places.map((p) => [p.k, p.ko]));
  const todayText = today;
  const copy = async (text, ok) => { try { await navigator.clipboard.writeText(text); status.textContent = ok; } catch { status.textContent = '복사하지 못했다.'; } };
  const need = (fn) => () => { const list = getInterests(); if (!list.length) { status.textContent = '아직 관심 회사가 없다.'; return; } fn(list); };
  const incoming = el('div');
  // 받은 코드나 링크: 내게 없는 것이 몇 곳인지 보이고, 더할지 묻는다.
  function offer(text) {
    const got = readCode(text, [...byId.keys()]);
    if (!got.length) { incoming.replaceChildren(); status.textContent = '코드에서 회사를 찾지 못했다.'; return; }
    const { added } = mergeItems(getInterests(), got);
    incoming.replaceChildren(el('section', { class: 'panel notice' },
      el('h2', { text: '받은 목록' }),
      el('p', { text: `${got.length}곳 가운데 내게 없는 것 ${added}곳` }),
      el('p', { class: 'note', text: got.slice(0, 5).map((it) => byId.get(it.id)[1]).join(' · ') + (got.length > 5 ? ' …' : '') }),
      el('div', { class: 'actions' },
        el('button', { class: 'btn', type: 'button', text: `${added}곳 더하기`, disabled: added === 0, onclick: () => {
          setInterests(mergeItems(getInterests(), got).items);
          incoming.replaceChildren();
          status.textContent = `${added}곳을 더했다.`;
          draw();
        } }),
        el('button', { class: 'btn ghost', type: 'button', text: '버리기', onclick: () => { incoming.replaceChildren(); status.textContent = ''; } }))));
  }
  const codeInput = el('input', { autocapitalize: 'off', autocomplete: 'off', spellcheck: 'false', placeholder: '받은 코드나 링크', 'aria-label': '받은 목록 코드나 링크' });
  const codeForm = el('form', { class: 'inline' }, el('label', { class: 'field' }, codeInput), el('button', { class: 'btn ghost', type: 'submit', text: '넣기' }));
  codeForm.addEventListener('submit', (ev) => { ev.preventDefault(); if (codeInput.value.trim()) { shell.close(); offer(codeInput.value); } });
  const tools = () => [
    el('div', { class: 'pcard-top' }, el('h2', { class: 'pcard-tools-title', text: '차례 정리' }), el('button', { class: 'btn ghost pcard-close', type: 'button', text: '닫기', onclick: () => shell.close() })),
    el('div', { class: 'actions' }, fill, sort),
    toolNote,
    sharePanel,
  ];
  const sharePanel = el('div', { class: 'tools' },
    el('label', { class: 'field' }, el('span', { class: 'label', text: '하루에 볼 곳' }), limitSelect),
    el('h2', { text: '나누기' }),
    el('p', { class: 'note', text: '회사와 날짜만 담긴다. 명함 · 일기는 안 간다.' }),
    el('div', { class: 'actions' },
      el('button', { class: 'btn', type: 'button', text: '링크', onclick: need((list) => copy(shareLink(location.href, list), '링크를 복사했다.')) }),
      el('button', { class: 'btn ghost', type: 'button', text: '코드', onclick: need((list) => copy(planCode(list), '코드를 복사했다.')) }),
      el('button', { class: 'btn ghost', type: 'button', text: '글', onclick: need((list) => copy(planText(list, shareDays, byId, placeKo), '글을 복사했다. 단톡방에 붙여 넣는다.')) })),
    codeForm,
    el('div', { class: 'actions' },
      el('button', { class: 'btn ghost', type: 'button', text: '마크다운', onclick: need((list) => { download(`ces2027-동선-${todayText()}.md`, planMd(list, shareDays, byId, placeKo, data.v, todayText()), 'text/markdown;charset=utf-8'); status.textContent = '내려받았다.'; }) }),
      el('button', { class: 'btn ghost', type: 'button', text: 'CSV', onclick: need((list) => { download(`ces2027-동선-${todayText()}.csv`, planCsv(list, shareDays, byId, placeKo, data), 'text/csv;charset=utf-8'); status.textContent = '내려받았다.'; }) })));
  // 링크로 들어왔으면(#plan=…) 받은 목록부터 보인다.
  const arrived = sessionStorage.getItem('ces2027.incoming');
  if (arrived) { sessionStorage.removeItem('ces2027.incoming'); offer(arrived); }

  draw();
  const toolsBtn = el('button', { class: 'btn ghost', type: 'button', text: '차례 정리', onclick: (ev) => { openId = null; toolNote.textContent = ''; shell.open(tools(), ev.currentTarget); } });
  return el('div', { class: 'page planpage' },
    incoming,
    nowHolder,
    alertBands(info.show.from),
    el('section', { class: 'head head-row' }, el('h1', { text: '동선' }), toolsBtn),
    pageNote,
    undoBar,
    chipHolder,
    holder,
    el('div', { class: 'row-actions', role: 'group', 'aria-label': '동선 더 보기' }, el('a', { href: '#/rec', text: '추천' }), el('a', { href: '#/days', text: '시간 · 내 일정' }), el('a', { href: '#/sessions', text: '세션' })),
    el('p', { class: 'note', text: '일정은 바뀔 수 있다 — 운영팀 안내가 먼저.' }),
    shell.node);
}
