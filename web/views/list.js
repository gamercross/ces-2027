// 전시사 목록: 공식 앱의 전시사 목록처럼 이름순 줄 + 글자 바로 가기 + 거르기(혁신상 · 한국 · 위치 · 나라 · 분야). 부스 번호순으로도 본다.
// 줄을 누르면 지도에서 그 회사 카드를 연다. 관심은 줄 오른쪽에서 바로 담는다(폰에만 남는다).
// 전시사 자료는 이 화면을 열 때 받는다(첫 화면에 싣지 않는다). 3,751곳을 한 번에 그리지 않고 아래로 내릴 때 조금씩 붙인다.

import { el, num, out } from '../dom.js';
import { getCategories, getExhibitors, getFinder, getPlaces, getSettings } from '../data.js';
import { hasInterest, toggleInterest } from '../store.js';
import { failed } from '../frame.js';
import { HALL_GROUPS, shortName } from '../hallgroups.js';
import { LETTERS, countryKo, filterRows, initialOf, letterStarts, placeGroups, sortRows } from '../exlist.js';

const STEP = 60;
// 고른 것은 이 화면을 떠났다 돌아와도 남는다(회사 카드를 보고 "뒤로"). 폰 저장소에는 두지 않는다.
const state = { q: '', award: false, korea: false, place: null, country: null, cat: null, by: 'name', open: null, scrollY: 0, shown: STEP };

const stamp = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`; };
const placeOfBooth = (b) => b.slice(b.lastIndexOf('@') + 1);
const codeOfBooth = (b) => b.slice(0, b.lastIndexOf('@'));

export async function render() {
  let data, places;
  try { [data, places] = await Promise.all([getExhibitors(), getPlaces()]); } catch { return failed({ retry: () => location.reload() }); }
  // 분야를 고르면 그 분야의 CES 공식 토픽 기사로 가는 링크 한 줄(R71, 설정 topicLinks).
  const settings = await getSettings().catch(() => ({}));
  const catTable = settings.topicLinks ? await getCategories().catch(() => null) : null;
  const ex = data.ex;
  const placeKo = new Map(places.places.map((p) => [p.k, p.ko]));
  const short = (k) => shortName(placeKo.get(k) || k);
  const koreaAt = data.countries.indexOf('South Korea');
  const groups = placeGroups(HALL_GROUPS, short, ex);
  const placeOrder = new Map();
  groups.forEach((g, i) => g.keys.forEach((k) => placeOrder.set(k, i)));
  const groupOfPlace = new Map();
  groups.forEach((g) => g.keys.forEach((k) => groupOfPlace.set(k, g)));
  const tally = (pick) => { const m = new Map(); for (const row of ex) for (const k of pick(row)) m.set(k, (m.get(k) || 0) + 1); return m; };
  const countries = [...tally((row) => (row[3] == null ? [] : [row[3]]))].map(([i, n]) => ({ key: i, ko: countryKo(data.countries[i]), n })).sort((a, b) => b.n - a.n);
  const cats = [...tally((row) => (row[4] ? row[4].split('.') : []))].map(([c, n]) => ({ key: c, ko: data.catsKo?.[c] || data.cats?.[c] || c, n })).sort((a, b) => b.n - a.n);
  const catsOf = (row) => (row[4] ? row[4].split('.').map((c) => data.catsKo?.[c] || data.cats?.[c]).filter(Boolean).slice(0, 2).join(' · ') : '');
  let hits = null; // 한글로 찾을 때 찾기 코어가 돌려준 줄 번호
  let sorted = [];
  let items = [];   // 그릴 차례: { head } 또는 { row }
  let heads = new Map(); // 글자 · 위치 묶음 → items 자리

  // ---- 위: 제목 · 찾기 · 거르기 칩 · 줄 세우기 · 바로 가기
  const count = el('p', { class: 'list-count', role: 'status' });
  const said = el('p', { class: 'sr-only', role: 'status' }); // 관심을 담고 뺀 것을 읽어 주는 곳(단추 글자가 바뀌니 눈에는 따로 안 보인다)
  const input = el('input', { type: 'search', inputmode: 'search', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'search', placeholder: '이름 · 부스 번호 · 분야(한글)', 'aria-label': '전시사 이름 · 부스 번호 · 분야로 거르기', value: state.q });
  const chips = el('div', { class: 'chips list-filters', role: 'group', 'aria-label': '거르기' });
  const picker = el('div', { class: 'list-pick', hidden: true });
  const extra = el('div', { class: 'list-extra' }); // 고른 분야의 공식 기사 한 줄 (있을 때만)
  const sortSegs = el('div', { class: 'list-sort', role: 'group', 'aria-label': '줄 세우기' });
  const jump = el('div', { class: 'chips list-jump', role: 'group', 'aria-label': '바로 가기' });
  const list = el('ul', { class: 'exlist', 'aria-label': '전시사' });
  const more = el('li', { class: 'ex-more', 'aria-hidden': 'true' });

  const groupName = () => groups.find((g) => g.keys === state.place || (state.place && g.keys.join() === state.place.join()))?.ko;
  const active = () => state.award || state.korea || state.place || state.country != null || state.cat != null;

  function paintChips() {
    const chip = (text, pressed, onclick, label) => el('button', { class: 'chip-go', type: 'button', text, 'aria-pressed': pressed ? 'true' : 'false', 'aria-label': label, onclick });
    const opener = (key, ko, value) => chip(value ? `${ko}: ${value}` : `${ko} ▾`, !!value || state.open === key, () => { state.open = state.open === key ? null : key; paintPicker(); paintChips(); }, `${ko} 고르기${value ? ` (지금 ${value})` : ''}`);
    chips.replaceChildren(
      chip('혁신상', state.award, () => { state.award = !state.award; refresh(); }),
      chip('한국', state.korea, () => { state.korea = !state.korea; refresh(); }),
      opener('place', '위치', groupName()),
      opener('country', '나라', state.country != null ? countryKo(data.countries[state.country]) : ''),
      opener('cat', '분야', state.cat != null ? cats.find((c) => c.key === state.cat)?.ko : ''));
    paintExtra();
  }
  // 칩 아래 한 줄: 고른 분야의 CES 공식 기사(인터넷이 없으면 글만).
  function paintExtra() {
    const lines = [];
    const catEn = state.cat != null ? data.cats?.[state.cat] : null;
    const url = catEn && catTable?.topics?.[catEn];
    if (url) {
      const ko = cats.find((c) => c.key === state.cat)?.ko || catEn;
      lines.push(navigator.onLine === false
        ? el('p', { class: 'note', text: `${ko} 공식 기사는 인터넷이 있어야 열린다.` })
        : el('p', { class: 'topic-line' }, out(url, `${ko} · CES 공식 기사 보기`, 'pick')));
    }
    extra.replaceChildren(...lines);
    extra.hidden = !lines.length;
  }
  if (settings.topicLinks) { addEventListener('online', paintExtra); addEventListener('offline', paintExtra); addEventListener('hashchange', () => { removeEventListener('online', paintExtra); removeEventListener('offline', paintExtra); }, { once: true }); }
  function paintPicker() {
    if (!state.open) { picker.hidden = true; picker.replaceChildren(); return; }
    const defs = {
      place: { ko: '위치', all: '모든 위치', list: groups, now: groupName(), set: (g) => { state.place = g ? g.keys : null; } },
      country: { ko: '나라', all: '모든 나라', list: countries, now: state.country, set: (c) => { state.country = c ? c.key : null; } },
      cat: { ko: '분야', all: '모든 분야', list: cats, now: state.cat, set: (c) => { state.cat = c ? c.key : null; } },
    }[state.open];
    const pick = (opt) => { defs.set(opt); state.open = null; refresh(); input.blur(); };
    const isNow = (opt) => (state.open === 'place' ? opt.ko === defs.now : opt.key === defs.now);
    picker.replaceChildren(
      el('div', { class: 'panel-head' }, el('h2', { text: `${defs.ko} 고르기` }), el('button', { class: 'pick', type: 'button', text: '닫기', onclick: () => { state.open = null; paintPicker(); paintChips(); } })),
      el('div', { class: 'pick-wrap' },
        el('button', { class: 'chip-go', type: 'button', text: defs.all, 'aria-pressed': defs.now == null ? 'true' : 'false', onclick: () => pick(null) }),
        defs.list.map((opt) => el('button', { class: 'chip-go', type: 'button', 'aria-pressed': isNow(opt) ? 'true' : 'false', 'aria-label': `${opt.ko} ${opt.n}곳`, onclick: () => pick(opt) }, opt.ko, el('span', { class: 'chip-n', text: ` ${num(opt.n)}` })))));
    picker.hidden = false;
  }
  function paintSort() {
    sortSegs.replaceChildren(...[['name', '이름순'], ['booth', '부스순']].map(([k, ko]) => el('button', { class: 'pick', type: 'button', text: ko, 'aria-pressed': state.by === k ? 'true' : 'false', onclick: () => { if (state.by === k) return; state.by = k; refresh(); } })));
  }
  function paintJump() {
    if (state.by === 'name') {
      jump.setAttribute('aria-label', '글자로 바로 가기');
      jump.replaceChildren(...LETTERS.map((c) => el('button', { class: 'chip-go jump-key', type: 'button', text: c, disabled: !heads.has(c), 'aria-label': c === '#' ? '숫자 · 기호로 시작하는 이름으로' : `${c}로 시작하는 이름으로`, onclick: () => goHead(c) })));
    } else {
      jump.setAttribute('aria-label', '위치로 바로 가기');
      jump.replaceChildren(...groups.filter((g) => heads.has(g.ko)).map((g) => el('button', { class: 'chip-go', type: 'button', text: g.ko, onclick: () => goHead(g.ko) })));
    }
    jump.hidden = jump.childElementCount < (state.by === 'name' ? 1 : 2); // 위치 하나만 남으면 바로 가기 줄은 숨긴다
  }

  // ---- 줄
  function boothFor(row) {
    const booths = row[7] || [];
    return (state.place && booths.find((b) => state.place.includes(placeOfBooth(b)))) || booths[0] || null;
  }
  function rowNode(row) {
    const id = row[0];
    const b = boothFor(row);
    const others = (row[7] || []).length - 1;
    const atKey = b && b !== row[7][0] ? `/${encodeURIComponent(`${placeOfBooth(b)}|${codeOfBooth(b)}`)}` : '';
    const where = b ? `${short(placeOfBooth(b))} · 부스 ${codeOfBooth(b)}${others > 0 ? ` · 외 ${others}곳` : ''}` : '부스 미정';
    const tags = [
      row[5] ? el('span', { class: 'tag mint', text: row[5] & 2 ? '최고 혁신상' : '혁신상' }) : null,
      koreaAt >= 0 && row[3] === koreaAt ? el('span', { class: 'tag mint', text: '한국' }) : null,
    ].filter(Boolean);
    const cat = catsOf(row);
    const open = el('a', { class: 'ex-open', href: `#/map/at/${encodeURIComponent(id)}${atKey}`, 'aria-label': `${row[1]}, ${where}. 지도에서 카드 열기`, onclick: () => { state.scrollY = window.scrollY; } },
      el('span', { class: 'name', text: row[1] }),
      el('span', { class: 'where', text: where }),
      cat ? el('span', { class: 'where clamp', text: cat }) : null,
      tags.length ? el('span', { class: 'stop-tags' }, tags) : null);
    const like = el('button', { class: 'pick ex-like', type: 'button' });
    const paintLike = () => { const on = hasInterest(id); like.textContent = on ? '관심 중' : '관심'; like.setAttribute('aria-pressed', on ? 'true' : 'false'); like.setAttribute('aria-label', `${row[1]} ${on ? '관심에서 빼기' : '관심 담기'}`); };
    like.addEventListener('click', () => { const added = toggleInterest(id); paintLike(); said.textContent = `${row[1]}을(를) ${added ? '관심에 담았다. 갈 곳에 나온다' : '관심에서 뺐다'}.`; });
    paintLike();
    return el('li', { class: 'ex-row' }, open, like);
  }
  const headNode = (text) => el('li', { class: 'ex-head', 'data-head': text, text });

  function build() {
    sorted = sortRows(filterRows(ex, state, { koreaAt, hits }), state.by, { placeOrder, place: state.place });
    items = [];
    heads = new Map();
    let last = null;
    for (const row of sorted) {
      let h;
      if (state.by === 'name') h = initialOf(row[1]);
      else { const b = boothFor(row); h = b ? (groupOfPlace.get(placeOfBooth(b))?.ko || short(placeOfBooth(b))) : '부스 미정'; }
      if (h !== last) { heads.set(h, items.length); items.push({ head: h }); last = h; }
      items.push({ row });
    }
  }
  let drawn = 0;
  function drawUpTo(n) {
    const end = Math.min(items.length, n);
    if (end <= drawn) return;
    const nodes = items.slice(drawn, end).map((it) => (it.head ? headNode(it.head) : rowNode(it.row)));
    more.before(...nodes);
    drawn = end;
    more.hidden = drawn >= items.length;
  }
  function goHead(key) {
    const at = heads.get(key);
    if (at == null) return;
    drawUpTo(at + STEP);
    list.querySelector(`[data-head="${CSS.escape(key)}"]`)?.scrollIntoView({ block: 'start' });
  }
  const countLine = () => `${num(sorted.length)}곳${active() || state.q.trim() ? ` / ${num(ex.length)}` : ''}`;
  function paintCount() {
    count.replaceChildren(...[el('b', { text: countLine() }), active() ? el('button', { class: 'pick', type: 'button', text: '풀기', 'aria-label': '거르기 풀기', onclick: () => { Object.assign(state, { award: false, korea: false, place: null, country: null, cat: null, open: null }); refresh(); } }) : null].filter(Boolean));
  }
  function paintList(keepScroll) {
    list.replaceChildren(more);
    drawn = 0;
    if (!sorted.length) {
      list.prepend(el('li', { class: 'ex-empty' }, el('p', { text: '맞는 회사가 없다.' }), el('p', { class: 'note', text: '낱말을 줄이거나 거르기를 푼다.' })));
      more.hidden = true;
      return;
    }
    drawUpTo(keepScroll ? Math.max(STEP, state.shown) : STEP);
  }
  function refresh(keepScroll = false) {
    build();
    paintChips();
    paintPicker();
    paintSort();
    paintJump();
    paintCount();
    paintList(keepScroll);
    if (!keepScroll) { state.scrollY = 0; state.shown = STEP; }
  }

  // 찾기: 영문 · 숫자는 바로, 한글은 찾기 코어(한글 별칭 · 분야 이름)를 불러와 거른다.
  let turn = 0;
  async function onInput() {
    const mine = ++turn;
    state.q = input.value;
    const q = state.q.trim();
    hits = null;
    if (/[ㄱ-힝]/.test(q)) {
      try { const f = await getFinder(); if (mine !== turn) return; hits = new Set(f.core.search(q, 800)); } catch { hits = new Set(); }
    }
    if (mine !== turn) return;
    refresh();
  }
  input.addEventListener('input', onInput);
  input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); input.blur(); } });

  // 아래로 내리면 다음 줄을 붙인다.
  const io = 'IntersectionObserver' in window ? new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { drawUpTo(drawn + STEP); state.shown = drawn; } }, { rootMargin: '600px 0px' }) : null;
  io?.observe(more);

  const page = el('div', { class: 'page list-page' },
    el('section', { class: 'list-top' },
      el('h1', { text: '전시사' }),
      el('p', { class: 'note', text: `CES 공식 전시사 목록 · ${stamp(data.fetchedAt)} 받음` }),
      el('label', { class: 'find-field' }, input),
      chips, extra, picker),
    jump, el('div', { class: 'list-bar' }, count, sortSegs), said, list);

  const back = state.scrollY;
  if (state.q.trim() && /[ㄱ-힝]/.test(state.q)) { try { const f = await getFinder(); hits = new Set(f.core.search(state.q.trim(), 800)); } catch { hits = new Set(); } }
  refresh(true);
  // 카드를 보고 돌아왔으면 보던 자리로 (뼈대가 화면을 그린 뒤 맨 위로 올리므로 그 다음에).
  if (back > 0) setTimeout(() => window.scrollTo(0, back), 0);
  return page;
}
