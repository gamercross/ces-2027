// 회사: 분야를 고르거나(내 태그에 맞는 분야 먼저) 이름 · 분야 · 부스 번호로 찾고, 관심에 넣는다.

import { el, num } from '../dom.js';
import { getCategories, getExhibitors, getFinder, getMeta, getPlaces } from '../data.js';
import { companyRow } from '../company.js';
import { getInterests, getProfile, tagKo } from '../store.js';

const PAGE = 40;

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

function planLink() {
  const link = el('a', { class: 'chip', href: '#/plan' });
  const paint = () => { link.textContent = `관심 ${getInterests().length}곳 · 동선 보기`; };
  paint();
  return { link, paint };
}

async function categoryPage(index, go) {
  const [data, places, table] = await Promise.all([getExhibitors(), getPlaces(), getCategories()]);
  const name = data.cats[index];
  if (name == null) { go('#/find'); return el('div'); }
  const placeKo = new Map(places.places.map((p) => [p.k, p.ko]));
  const korea = data.countries.indexOf('South Korea');
  const all = data.ex.filter((r) => r[4] && r[4].split('.').includes(String(index)));
  const plan = planLink();
  const holder = el('div');
  const onlyKorea = el('input', { type: 'checkbox' });
  const onlyAward = el('input', { type: 'checkbox' });
  const count = el('p', { class: 'note' });
  const draw = () => {
    const rows = all.filter((r) => (!onlyKorea.checked || r[3] === korea) && (!onlyAward.checked || r[5] > 0));
    count.textContent = `${num(rows.length)}곳. 이름 차례다. 부스 자리는 짐작이다.`;
    holder.replaceChildren(pagedList(rows, (r) => companyRow(r, data, placeKo, plan.paint)));
  };
  onlyKorea.addEventListener('change', draw);
  onlyAward.addEventListener('change', draw);
  draw();
  return el('div', { class: 'page' },
    el('section', { class: 'panel' },
      el('p', {}, el('a', { href: '#/find', text: '분야 전체' })),
      el('h1', { text: table.ko[name] || name }),
      el('p', { class: 'note', text: `CES 공식 분야: ${name}` }),
      count),
    holder,
    // 한 손으로 닿게 아래에 붙여 둔다.
    el('div', { class: 'dock' },
      el('label', { class: 'toggle' }, onlyKorea, el('span', { text: '한국 회사만' })),
      el('label', { class: 'toggle' }, onlyAward, el('span', { text: '혁신상만' })),
      plan.link));
}

function fieldLinks(names, data, counts, table) {
  return el('div', { class: 'fields' }, names.filter((n) => data.cats.includes(n)).map((n) => {
    const i = data.cats.indexOf(n);
    return el('a', { class: 'field-link', href: `#/find/c/${i}` }, el('span', { text: table.ko[n] || n }), el('small', { text: num(counts[i]) }));
  }));
}

async function frontPage() {
  const [data, table] = await Promise.all([getExhibitors(), getCategories()]);
  const counts = data.cats.map(() => 0);
  for (const r of data.ex) if (r[4]) for (const c of r[4].split('.')) counts[c] += 1;
  const profile = getProfile();
  const mine = profile?.tag && table.audiences?.[profile.tag];
  const plan = planLink();

  const input = el('input', { type: 'search', inputmode: 'search', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', placeholder: '삼성, 로봇, 14731', 'aria-label': '회사 이름 · 분야 · 부스 번호 · 장소' });
  const note = el('p', { class: 'note', text: '이름 · 분야 · 부스 번호 · 장소로 찾는다. 한글로도 된다.' });
  const results = el('div');
  const fields = el('div', { class: 'page' },
    mine && el('section', { class: 'panel' },
      el('h2', { text: `${tagKo(profile.tag)}에게 맞는 분야${table.audiencesDraft ? ' (초안)' : ''}` }),
      fieldLinks(mine, data, counts, table)),
    table.groups.map((g) => el('section', { class: 'panel' }, el('h2', { text: g.ko }), fieldLinks(g.cats, data, counts, table))),
    el('p', { class: 'foot', text: `CES 공식 분야 ${data.cats.length}개를 묶었다. 숫자는 그 분야를 고른 전시사 수다. 분야를 고르지 않은 전시사는 찾기로 찾는다.` }));

  let turn = 0;
  async function find() {
    const mineTurn = ++turn;
    const q = input.value.trim();
    fields.hidden = !!q;
    if (!q) { results.replaceChildren(); note.textContent = '이름 · 분야 · 부스 번호 · 장소로 찾는다. 한글로도 된다.'; return; }
    let finder;
    try {
      finder = await getFinder();
    } catch {
      note.textContent = '찾기 자료를 불러오지 못했다. 인터넷을 확인하고 다시 적어 본다.';
      return;
    }
    if (mineTurn !== turn) return;
    const rows = finder.core.search(q, 200).map((i) => finder.data.ex[i]);
    note.textContent = rows.length ? `${rows.length === 200 ? '먼저 200곳' : `${rows.length}곳`}. 잘 맞는 차례다.` : '맞는 회사가 없다.';
    results.replaceChildren(pagedList(rows, (r) => companyRow(r, finder.data, finder.placeKo, plan.paint)));
  }
  input.addEventListener('input', find);

  return el('div', { class: 'page' },
    el('section', { class: 'panel' },
      el('h1', { text: '회사' }),
      note),
    results,
    fields,
    // 한 손으로 닿게 찾기 칸을 아래에 붙여 둔다.
    el('div', { class: 'dock' }, el('label', { class: 'field' }, input), plan.link));
}

export async function render({ rest, go }) {
  const meta = await getMeta();
  if (!meta) {
    return el('section', { class: 'panel' }, el('h1', { text: '회사' }), el('p', { text: '전시사 자료를 아직 받지 못했다.' }));
  }
  if (rest[0] === 'c') return categoryPage(Number(rest[1]), go);
  return frontPage();
}
