// 지도 맨 위 찾기 칸: 회사 이름 · 부스 번호 · 분야 · 한글 별칭 · 홀 이름으로 찾는다. 고르면 지도가 그 부스로 날아가 카드가 열린다.
// 찾기 자료(코어 · 색인 · 전시사)는 글자를 칠 때 불러온다. 첫 화면에는 싣지 않는다.

import { el } from './dom.js';
import { getFinder, getMeta } from './data.js';
import { splitBooth } from './route.js';

const SHOW = 8;

// opts: { places: [{ k, ko, ... }], onCompany(row, data, finder), onPlace(place) }
// 부스 번호만 적었을 때 공식 지도의 번호 범위로 어느 홀인지 짐작한다. ranges: [{ from, to, place }]
export function hallOfNumber(q, ranges) {
  const m = /^(\d{3,5})[a-zA-Z]?$/.exec(String(q).trim());
  if (!m) return null;
  const n = Number(m[1]);
  return ranges.find((r) => n >= r.from && n <= r.to) || null;
}

export function findBox({ places, ranges = [], onCompany, onPlace }) {
  const input = el('input', { type: 'search', inputmode: 'search', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'search', placeholder: '회사 · 부스 번호 · 홀 찾기', 'aria-label': '회사 이름 · 부스 번호 · 분야 · 홀 찾기' });
  const list = el('ul', { class: 'results', role: 'listbox', 'aria-label': '찾은 것', hidden: true });
  const note = el('p', { class: 'results-note', role: 'status', hidden: true });
  const node = el('div', { class: 'find' }, el('label', { class: 'find-field' }, input), note, list);
  let turn = 0;
  let current = [];

  const clear = () => { list.replaceChildren(); list.hidden = true; note.hidden = true; current = []; };
  const say = (text) => { list.replaceChildren(); list.hidden = true; note.textContent = text; note.hidden = false; };

  function pick(item) {
    clear();
    input.value = '';
    input.blur();
    if (item.place) onPlace(item.place); else onCompany(item.row, item.finder);
  }
  function show(items) {
    current = items;
    note.hidden = true;
    list.replaceChildren(...items.map((it, i) => el('li', { role: 'option' },
      el('button', { class: 'result', type: 'button', onclick: () => pick(it) },
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
    let finder;
    try {
      if (!(await getMeta())) { if (!hallHits.length) say('전시사 자료를 아직 받지 못했다.'); return; }
      finder = await getFinder();
    } catch {
      if (!hallHits.length) say('찾기 자료를 불러오지 못했다. 인터넷을 확인한다.');
      return;
    }
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
    if (!items.length) { say('맞는 회사가 없다.'); return; }
    show(items);
  }
  input.addEventListener('input', find);
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') { ev.preventDefault(); if (current[0]) pick(current[0]); }
    if (ev.key === 'Escape') { clear(); input.value = ''; }
  });
  return { node, input, clear };
}
