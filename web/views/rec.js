// 추천: 공식 자료만 근거로(혁신상 · 한국 기업 · 내 분야) 먼저 볼 만한 회사. 까닭을 한 줄로 보이고, 한 곳씩 눌러 관심에 담는다.
// 갈 곳 탭 아래의 화면이다 (회사 탭이 없어지면서 find.js에서 옮겼다).

import { el, num } from '../dom.js';
import { getCategories, getExhibitors, getMeta, getPlaces } from '../data.js';
import { companyRow } from '../company.js';
import { getInterests, getProfile, getTopics } from '../store.js';
import { recommend } from '../recommend.js';

const CHIPS = [['all', '추천'], ['award', '혁신상'], ['korea', '한국'], ['mine', '내 분야']];

export async function render() {
  const meta = await getMeta();
  if (!meta) {
    return el('section', { class: 'panel' }, el('h1', { text: '추천' }), el('p', { text: '전시사 자료를 아직 받지 못했다.' }));
  }
  const [data, table, places] = await Promise.all([getExhibitors(), getCategories(), getPlaces()]);
  const placeKo = new Map(places.places.map((p) => [p.k, p.ko]));
  const profile = getProfile();
  const link = el('a', { class: 'chip', href: '#/plan' });
  const paintLink = () => { link.textContent = `관심 ${getInterests().length}곳 · 갈 곳`; };
  paintLink();

  let chip = 'all';
  let shown = 6;
  let recs = null;
  const body = el('div', { class: 'page' });
  const chips = el('div', { class: 'segs', role: 'group', 'aria-label': '보기' });
  function draw(recount) {
    // 담은 곳이 목록에서 바로 사라지지 않게, 거르기를 바꿀 때만 다시 뽑는다.
    if (recount || !recs) recs = recommend(data, table, { tag: profile?.tag, topics: getTopics(), have: new Set(getInterests().map((it) => it.id)), filter: chip === 'all' ? null : chip });
    const more = el('button', { class: 'btn ghost wide', type: 'button', text: `더 보기 (${num(recs.length - shown)}곳 남음)`, hidden: shown >= recs.length, onclick: () => { shown += 6; draw(false); } });
    body.replaceChildren(
      el('section', { class: 'panel' },
        el('h2', { text: `${CHIPS.find((c) => c[0] === chip)[1]} ${num(recs.length)}곳` }),
        recs.length
          ? el('ol', { class: 'hits' }, recs.slice(0, shown).map((r) => {
            const li = companyRow(r.row, data, placeKo, paintLink);
            li.prepend(el('div', { class: 'why', text: r.why.join(' · ') }));
            return li;
          }))
          : el('p', { class: 'note', text: chip === 'mine' ? '내 분야가 없다. 설정의 명함에서 태그를 고른다.' : '추천할 곳이 없다.' }),
        more));
  }
  function paintChips() {
    chips.replaceChildren(...CHIPS.map(([k, ko]) => el('button', { class: 'seg', type: 'button', text: ko, 'aria-pressed': k === chip ? 'true' : 'false', onclick: () => { chip = k; shown = 6; draw(true); paintChips(); } })));
  }
  draw(true);
  paintChips();
  return el('div', { class: 'page' },
    el('section', { class: 'head' },
      el('h1', { text: '추천' }),
      el('p', { class: 'lead' }, el('a', { href: '#/plan', text: '← 갈 곳' }), ' · 이름 · 분야 · 부스 번호로 찾으려면 ', el('a', { href: '#/map', text: '지도' }), '.')),
    chips, body,
    el('div', { class: 'dock' }, link));
}
