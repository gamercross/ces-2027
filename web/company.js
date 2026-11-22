// 회사 한 줄: 이름 · 혁신상 · 부스와 장소 · 나라 · 공식 링크 · 관심 단추 · 대화(듣기 · 붙여넣기 · 손으로, 일기 초안으로 이어짐) · 번역 앱 열기. 찾기와 분야 목록이 같이 쓴다.

import { el, out } from './dom.js';
import { hasInterest, toggleInterest } from './store.js';
import { splitBooth } from './route.js';
import { attachImage } from './company-image.js';
import { translatorRow } from './translator-ui.js';

// 같은 장소의 부스는 한 줄로 모은다.
export function whereText(booths, placeKo) {
  const byPlace = new Map();
  for (const b of booths) {
    const { code, place } = splitBooth(b);
    const ko = placeKo.get(place) || '장소 모름';
    byPlace.set(ko, [...(byPlace.get(ko) || []), code]);
  }
  return [...byPlace].map(([ko, codes]) => `${ko} ${codes.slice(0, 3).join(' · ')}${codes.length > 3 ? ` 밖에 ${codes.length - 3}곳` : ''}`).join(' / ');
}

export function companyRow(row, data, placeKo, onChange) {
  const [id, name, intro, country, cats, award, , booths] = row;
  const button = el('button', { class: 'pick', type: 'button' });
  const paint = () => {
    const on = hasInterest(id);
    button.setAttribute('aria-pressed', on ? 'true' : 'false');
    button.setAttribute('aria-label', `${name} ${on ? '관심에서 빼기' : '관심에 넣기'}`);
    button.textContent = on ? '관심 중' : '관심';
  };
  button.addEventListener('click', () => { toggleInterest(id); paint(); onChange?.(); });
  paint();
  const catKo = cats ? cats.split('.').map((c) => data.catsKo[c] || data.cats[c]).slice(0, 4).join(' · ') : '';
  const li = el('li', {},
    el('div', { class: 'name' }, name, award ? el('span', { class: 'tag mint', text: award & 2 ? '최고 혁신상' : '혁신상' }) : null),
    el('div', { class: 'where', text: [booths.length ? whereText(booths, placeKo) : '부스 미정', country >= 0 ? data.countries[country] : null].filter(Boolean).join(' / ') }),
    catKo && el('div', { class: 'where', text: catKo }),
    intro && el('div', { class: 'where intro', text: intro }),
    el('div', { class: 'row-actions' }, button,
      booths.some((b) => placeKo.has(splitBooth(b).place)) ? el('a', { href: `#/map/at/${encodeURIComponent(id)}`, text: '지도' }) : null,
      el('a', { href: `#/talk/${encodeURIComponent(id)}`, text: '대화' }),
      out(data.link.replace('{id}', encodeURIComponent(id)), '공식')));
  // 번역은 번역 앱으로 한다: 고른 글(없으면 회사 이름)을 복사해 두고 앱을 연다.
  const tr = translatorRow(() => name);
  li.querySelector('.row-actions').append(tr.button);
  li.append(tr.note);
  attachImage(li, id, name, data);
  return li;
}
