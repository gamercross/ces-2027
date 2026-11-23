// 지도 맨 위 찾기 칸: 회사 이름 · 부스 번호 · 분야 · 한글 별칭 · 홀 이름으로 찾는다. 고르면 지도가 그 부스로 날아가 카드가 열린다.
// 영어 낱말이면 세션도 두 줄까지 같이 보인다(공식 앱 검색의 전시사 · 세션 · 위치처럼). 세션을 고르면 세션 일정이 그 낱말로 열린다.
// 찾기 자료(코어 · 색인 · 전시사 · 세션)는 글자를 칠 때 불러온다. 첫 화면에는 싣지 않는다.

import { cross, el } from './dom.js';
import { getFinder, getMeta, getSessions } from './data.js';
import { splitBooth } from './route.js';

const SHOW = 8;
const SESSIONS = 2;
const dayMd = (date) => { const [, m, d] = date.split('-').map(Number); return `${m}/${d}`; };

// 세션 찾기 줄: 영어 · 숫자 낱말(세 글자 이상)일 때만, 이른 차례로 n개. searchSessions는 sessions.js의 search(첫 화면에 싣지 않으려고 받아 쓴다).
// 돌려주는 것: [{ session, title, sub }]
export function sessionHits(items, q, searchSessions, n = SESSIONS) {
  const t = String(q || '').trim();
  if (t.length < 3 || /[\u3131-\uD79D]/.test(t)) return [];
  return searchSessions(items, t).sort((a, b) => a.date.localeCompare(b.date) || a.from.localeCompare(b.from)).slice(0, n)
    .map((s) => ({ session: s, title: s.title, sub: `강연 · ${dayMd(s.date)} ${s.from} · ${(s.place || '장소 미정').split(',')[0]}` }));
}

// opts: { places: [{ k, ko, ... }], onCompany(row, data, finder), onPlace(place) }
// 부스 번호만 적었을 때 공식 지도의 번호 범위로 어느 홀인지 짐작한다. ranges: [{ from, to, place }]
export function hallOfNumber(q, ranges) {
  const m = /^(\d{3,5})[a-zA-Z]?$/.exec(String(q).trim());
  if (!m) return null;
  const n = Number(m[1]);
  return ranges.find((r) => n >= r.from && n <= r.to) || null;
}

export function findBox({ places, ranges = [], onCompany, onPlace }) {
  const input = el('input', { type: 'search', inputmode: 'search', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'search', placeholder: '회사 · 부스 번호 · 홀 찾기', 'aria-label': '회사 이름 · 부스 번호 · 분야 · 홀 · 세션 찾기' });
  const list = el('ul', { class: 'results', role: 'listbox', 'aria-label': '찾은 것', hidden: true });
  const note = el('p', { class: 'results-note', role: 'status', hidden: true });
  // 지우기(×): 글자가 있을 때만 보인다(app.css의 :placeholder-shown). 누르면 칸이 비고 결과 줄이 닫힌다.
  const wipe = el('button', { class: 'find-clear', type: 'button', 'aria-label': '찾는 글자 지우기', onclick: () => { input.value = ''; find(); input.focus(); } }, cross());
  const node = el('div', { class: 'find' }, el('label', { class: 'find-field' }, input), el('span', { class: 'tag find-tag', text: '비공식' }), wipe, note, list);
  let turn = 0;
  let current = [];

  const clear = () => { list.replaceChildren(); list.hidden = true; note.hidden = true; current = []; };
  const say = (text) => { list.replaceChildren(); list.hidden = true; note.textContent = text; note.hidden = false; };

  function pick(item) {
    clear();
    input.value = '';
    input.blur();
    if (item.session) location.hash = `#/sessions/q/${encodeURIComponent(item.session.title)}`;
    else if (item.place) onPlace(item.place); else onCompany(item.row, item.finder);
  }
  function show(items) {
    current = items;
    note.hidden = true;
    list.replaceChildren(...items.map((it, i) => el('li', { role: 'option' },
      el('button', { class: it.session ? 'result session' : 'result', type: 'button', title: it.session ? it.title : null, onclick: () => pick(it) },
        el('b', { text: it.title }), el('span', { text: it.sub })))));
    list.hidden = false;
  }
  async function find() {
    const mine = ++turn;
    const q = input.value.trim();
    if (!q) { clear(); return; }
    // 홀 이름은 바로 찾는다 (자료를 기다리지 않는다).
    const lower = q.toLowerCase();
    const hallHits = places.filter((p) => p.ko.toLowerCase().includes(lower) || p.en?.toLowerCase().includes(lower)).slice(0, 2)
      .map((p) => ({ place: p, title: p.ko, sub: '홀 · 장소' }));
    if (hallHits.length) show(hallHits);
    // 세션은 회사와 같이 받는다(영어 낱말일 때만). 못 받아도 회사 찾기는 그대로 된다.
    const sessionsP = q.length >= 3 && !/[ㄱ-힝]/.test(q)
      ? Promise.all([getSessions(), import('./sessions.js')]).then(([doc, mod]) => sessionHits(doc.items, q, mod.search)).catch(() => [])
      : Promise.resolve([]);
    let finder;
    try {
      if (!(await getMeta())) { if (!hallHits.length) say('전시사 자료를 아직 받지 못했다.'); return; }
      finder = await getFinder();
    } catch {
      if (!hallHits.length) say('찾기 자료를 불러오지 못했다. 인터넷을 확인한다.');
      return;
    }
    const sessionRows = await sessionsP;
    if (mine !== turn) return;
    const rows = finder.core.search(q, SHOW * 3).map((i) => finder.data.ex[i]).slice(0, SHOW);
    const items = [...hallHits, ...rows.map((row) => {
      const b = row[7][0];
      const where = b ? splitBooth(b) : null;
      return { row, finder, title: row[1], sub: where ? `${finder.placeKo.get(where.place) || '장소 모름'} · 부스 ${where.code}` : '부스 미정' };
    })];
    // 회사 자료에 없는 부스 번호도 공식 지도의 번호 범위로 홀은 알려 준다.
    const rule = rows.length ? null : hallOfNumber(q, ranges);
    const hall = rule ? places.find((p) => p.k === rule.place) : null;
    if (hall) items.push({ place: hall, title: hall.ko, sub: `부스 ${q.trim()} · 번호 범위 ${rule.from}–${rule.to}로 본 홀` });
    // 세션 줄은 회사 두 줄 다음에 끼운다(결과 칸을 내리지 않아도 보이게, 제목은 두 줄까지). 회사가 둘보다 적으면 그 뒤에.
    items.splice(hallHits.length + Math.min(2, rows.length), 0, ...sessionRows);
    if (!items.length) { say('맞는 회사 · 강연이 없다.'); return; }
    show(items);
  }
  input.addEventListener('input', find);
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') { ev.preventDefault(); if (current[0]) pick(current[0]); }
    if (ev.key === 'Escape') { clear(); input.value = ''; }
  });
  return { node, input, clear };
}
