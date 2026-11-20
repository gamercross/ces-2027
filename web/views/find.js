// 회사 찾기: 이름 · 분야 · 부스 번호 · 장소로. 찾기 자료(코어 · 색인 · 전시사)는 이 화면에서 불러온다.

import { el, out } from '../dom.js';
import { getFinder, getMeta } from '../data.js';

const LIMIT = 30;

function hit(row, data, placeKo) {
  const [id, name, intro, country, , award, , booths] = row;
  // 같은 장소의 부스는 한 줄로 모은다.
  const byPlace = new Map();
  for (const b of booths) {
    const at = b.lastIndexOf('@');
    const place = placeKo.get(b.slice(at + 1)) || '장소 모름';
    byPlace.set(place, [...(byPlace.get(place) || []), b.slice(0, at)]);
  }
  const where = [...byPlace].map(([place, codes]) => `${place} ${codes.slice(0, 3).join(' · ')}${codes.length > 3 ? ` 밖에 ${codes.length - 3}곳` : ''}`);
  return el('li', {},
    el('div', { class: 'name' }, name, award ? el('span', { class: 'tag mint', text: award & 2 ? '최고 혁신상' : '혁신상' }) : null),
    el('div', { class: 'where', text: [...where, country >= 0 ? data.countries[country] : null].filter(Boolean).join(' / ') }),
    intro && el('div', { class: 'where', text: intro }),
    out(data.link.replace('{id}', encodeURIComponent(id)), '공식 전시사 페이지'));
}

export async function render() {
  const meta = await getMeta();
  if (!meta) {
    return el('section', { class: 'panel' }, el('h1', { text: '회사 찾기' }), el('p', { text: '전시사 자료를 아직 받지 못했다.' }));
  }
  const input = el('input', { type: 'search', inputmode: 'search', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', placeholder: '삼성, 로봇, 14731', 'aria-label': '회사 이름 · 분야 · 부스 번호 · 장소' });
  const note = el('p', { class: 'note', text: '찾기 자료를 불러오는 중이다.' });
  const list = el('ol', { class: 'hits' });
  let turn = 0;

  async function find() {
    const mine = ++turn;
    let finder;
    try {
      finder = await getFinder();
    } catch {
      note.textContent = '찾기 자료를 불러오지 못했다. 인터넷을 확인하고 다시 적어 본다.';
      return;
    }
    if (mine !== turn) return;
    const q = input.value.trim();
    const rows = q ? finder.core.search(q, LIMIT) : [];
    list.replaceChildren(...rows.map((i) => hit(finder.data.ex[i], finder.data, finder.placeKo)));
    note.textContent = !q
      ? '이름 · 분야 · 부스 번호 · 장소로 찾는다. 한글로도 된다 (삼성, 로봇, 한국).'
      : rows.length ? `${rows.length === LIMIT ? `먼저 ${LIMIT}곳` : `${rows.length}곳`}. 부스 자리는 짐작이다.` : '맞는 회사가 없다.';
  }
  input.addEventListener('input', find);
  find();

  return el('div', { class: 'page' },
    el('section', { class: 'panel' },
      el('h1', { text: '회사 찾기' }),
      el('label', { class: 'field' }, input),
      note,
      list),
    el('p', { class: 'foot', text: `CES 공식 전시사 검색에서 ${meta.v}에 받은 자료다.` }));
}
