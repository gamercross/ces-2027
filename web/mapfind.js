// 지도 탭 위의 찾기 칸: 회사 이름 · 분야 · 부스 번호 · 장소로 찾고, 줄마다 관심 · 지도 · 대화 · 공식 단추가 있다.
// 회사 탭이 없어지면서 find.js에서 옮겼다. 찾기 자료(코어 · 색인 · 전시사)는 글자를 칠 때 불러온다.

import { el, num } from './dom.js';
import { getFinder, getMeta } from './data.js';
import { companyRow } from './company.js';
import { getInterests } from './store.js';

const PAGE = 20;

// 많은 줄은 조금씩 보인다.
function pagedList(rows, makeRow) {
  const list = el('ol', { class: 'hits' });
  const more = el('button', { class: 'btn ghost wide', type: 'button' });
  let shown = 0;
  const add = () => {
    list.append(...rows.slice(shown, shown + PAGE).map(makeRow));
    shown = Math.min(rows.length, shown + PAGE);
    more.hidden = shown >= rows.length;
    more.textContent = `더 보기 (${num(rows.length - shown)}곳 남음)`;
  };
  more.addEventListener('click', add);
  add();
  return el('div', { class: 'page' }, list, more);
}

export function findBox() {
  const input = el('input', { type: 'search', inputmode: 'search', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', placeholder: '회사 찾기: 삼성, 로봇, 14731', 'aria-label': '회사 이름 · 분야 · 부스 번호 · 장소' });
  const note = el('p', { class: 'note', role: 'status' });
  const results = el('div', { class: 'page' });
  const plan = el('a', { class: 'chip', href: '#/plan' });
  const paintPlan = () => { plan.textContent = `관심 ${getInterests().length}곳 · 동선`; };
  paintPlan();
  let turn = 0;
  async function find() {
    const mine = ++turn;
    const q = input.value.trim();
    if (!q) { results.replaceChildren(); note.textContent = ''; return; }
    let finder;
    try {
      if (!(await getMeta())) { note.textContent = '전시사 자료를 아직 받지 못했다.'; return; }
      finder = await getFinder();
    } catch {
      note.textContent = '찾기 자료를 불러오지 못했다. 인터넷을 확인한다.';
      return;
    }
    if (mine !== turn) return;
    const rows = finder.core.search(q, 200).map((i) => finder.data.ex[i]);
    note.textContent = rows.length ? (rows.length === 200 ? '먼저 200곳' : `${rows.length}곳`) : '맞는 회사가 없다.';
    results.replaceChildren(pagedList(rows, (r) => companyRow(r, finder.data, finder.placeKo, paintPlan)));
  }
  input.addEventListener('input', find);
  return el('section', { class: 'panel' },
    el('label', { class: 'field' }, input),
    note, results,
    el('div', { class: 'actions' }, plan));
}
