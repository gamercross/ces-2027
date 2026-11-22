// 알아둘 것: 날짜 · 캠퍼스 · 오가는 법 · 배지 · 자료. 한 번에 한 묶음만 보이고, 묶음마다 확인한 날짜와 출처는 한 줄이다.

import { el, num, out } from '../dom.js';
import { getInfo, getMeta } from '../data.js';

const md = (read) => { const [, m, d] = read.split('-'); return `${Number(m)}/${Number(d)}`; };
const proof = (s) => (s ? el('p', { class: 'proof wrap' }, `${md(s.read)} 확인 · `, out(s.url, '출처')) : null);

export async function render() {
  const [info, meta] = await Promise.all([getInfo(), getMeta()]);
  const show = info.show;

  const GROUPS = [
    { k: 'days', ko: '날짜', body: () => [
      el('ul', { class: 'rows' }, show.days.map((d) => el('li', {}, el('b', { text: d.ko }), el('span', { text: d.hours })))),
      el('p', { class: 'note', text: show.note }),
      proof(show.source)] },
    { k: 'campus', ko: '캠퍼스', body: () => info.campuses.map((c) => el('div', { class: 'block' },
      el('h3', { text: c.ko }),
      el('p', { class: 'note', text: c.sub }),
      el('ul', { class: 'rows' }, c.halls.map((h) => el('li', {}, el('b', { text: h.ko }), el('span', { text: h.what })))),
      proof(c.source))) },
    { k: 'move', ko: '오가는 법', body: () => [
      el('ul', { class: 'stack' }, info.moving.map((m) => el('li', {}, el('b', { text: m.ko }), el('span', { text: m.what })))),
      el('p', { class: 'note' }, '셔틀 시간표는 ', el('a', { href: '#/transit', text: '셔틀' }), ' · 자율주행은 ', el('a', { href: '#/apply', text: '따로 신청' }), '.'),
      proof(info.movingSource)] },
    { k: 'badge', ko: '배지', body: () => [
      el('p', { text: info.badge.rule }),
      el('ul', { class: 'stack' }, info.badge.spots.map((s) => el('li', {}, el('b', { text: s.ko }), el('span', { text: s.hours })))),
      el('p', { class: 'note', text: info.badge.more }),
      proof(info.badge.source)] },
    { k: 'data', ko: '자료', body: () => [
      meta ? el('p', { class: 'big', text: `전시사 ${num(meta.exhibitors)}곳 · 분야 ${num(meta.categories)}개 · 한국 ${num(meta.korea)}곳` }) : el('p', { class: 'big', text: '전시사 자료를 아직 받지 못했다.' }),
      meta ? el('ul', { class: 'rows' },
        el('li', {}, el('b', { text: '받은 날' }), el('span', { text: meta.v })),
        el('li', {}, el('b', { text: '출처' }), el('span', {}, out('https://exhibitors.ces.tech/8_0/', 'CES 공식 전시사 검색'))),
        el('li', {}, el('b', { text: '부스 자리' }), el('span', { text: meta.places.boothSpotsGuess > 0 ? `홀 안은 짐작 (${meta.places.edition}판, 정식 배치도 전)` : `공식 배치도 (${meta.places.edition}판)` }))) : null,
      el('p', { class: 'note' }, '알아둘 것은 CES 공식 안내에서 읽었다: ', info.sources.flatMap((s, i) => [i ? ' · ' : '', out(s.url, s.ko)]))] },
  ];

  let now = 'days';
  const tabs = el('div', { class: 'segs', role: 'group', 'aria-label': '알아둘 것' });
  const body = el('section', { class: 'panel', 'aria-live': 'polite' });
  function paint() {
    tabs.replaceChildren(...GROUPS.map((g) => el('button', { class: 'seg', type: 'button', 'aria-pressed': g.k === now ? 'true' : 'false', text: g.ko, onclick: () => { now = g.k; paint(); } })));
    const g = GROUPS.find((x) => x.k === now);
    body.replaceChildren(el('h2', { text: g.ko }), ...g.body().filter(Boolean));
  }
  paint();
  return el('div', { class: 'page' },
    el('section', { class: 'head' }, el('h1', { text: '알아둘 것' }), el('p', { class: 'lead', text: '가기 전에 공식 안내를 다시 확인한다.' })),
    tabs, body);
}
