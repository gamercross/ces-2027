// 첫 화면: 이름 · 며칠 남았나 · CES 2027 알아둘 것(날짜 · 캠퍼스 셋 · 오가는 법 · 배지) · 전시사 자료.

import { el, num, out } from '../dom.js';
import { getInfo, getMeta } from '../data.js';
import { getProfile, tagKo } from '../store.js';

function daysLeft(show) {
  const day = 86400000;
  const today = new Date();
  const at = (s) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  const now = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  if (now < at(show.from)) return `${Math.round((at(show.from) - now) / day)}일 남았다`;
  if (now <= at(show.to)) return `${Math.round((now - at(show.from)) / day) + 1}일째`;
  return '끝났다';
}

function section(title, ...kids) {
  return el('section', { class: 'panel' }, el('h2', { text: title }), ...kids);
}

export async function render() {
  const [info, meta] = await Promise.all([getInfo(), getMeta()]);
  const profile = getProfile();
  const show = info.show;

  const hero = el('section', { class: 'hero' },
    el('p', { class: 'eyebrow', text: `${show.city} · 2027년 1월 6일 ~ 9일` }),
    el('h1', { text: 'CES 2027 준비 지도' }),
    el('p', { class: 'count', text: daysLeft(show) }),
    el('p', { class: 'lead', text: profile
      ? `${profile.nick}${profile.tag ? ` · ${tagKo(profile.tag)}` : ''}. 분야를 고르고 관심 회사를 모아 둔다.`
      : '우리 팀이 정보와 위치를 헷갈리지 않게 하는 준비 지도다. 명함부터 만든다.' }),
    el('div', { class: 'actions' },
      el('a', { class: 'btn', href: '#/card', text: profile ? '내 명함 보기' : '명함 만들기' }),
      el('a', { class: 'btn ghost', href: '#/find', text: '회사 찾기' })),
  );

  const days = section('날짜와 시간',
    el('ul', { class: 'rows' }, show.days.map((d) => el('li', {}, el('b', { text: d.ko }), el('span', { text: d.hours })))),
    el('p', { class: 'note', text: show.note }));

  const campuses = section('캠퍼스 셋',
    info.campuses.map((c) => el('div', { class: 'block' },
      el('h3', { text: c.ko }),
      el('p', { class: 'note', text: c.sub }),
      el('ul', { class: 'rows' }, c.halls.map((h) => el('li', {}, el('b', { text: h.ko }), el('span', { text: h.what })))))));

  const moving = section('오가는 법',
    el('ul', { class: 'stack' }, info.moving.map((m) => el('li', {}, el('b', { text: m.ko }), el('span', { text: m.what })))));

  const badge = section('배지 받는 곳',
    el('p', { text: info.badge.rule }),
    el('ul', { class: 'stack' }, info.badge.spots.map((s) => el('li', {}, el('b', { text: s.ko }), el('span', { text: s.hours })))),
    el('p', { class: 'note', text: info.badge.more }));

  const data = section('전시사 자료',
    meta
      ? el('p', { class: 'big', text: `전시사 ${num(meta.exhibitors)}곳 · 분야 ${num(meta.categories)}개 · 한국 ${num(meta.korea)}곳` })
      : el('p', { class: 'big', text: '전시사 자료를 아직 받지 못했다.' }),
    meta && el('ul', { class: 'rows' },
      el('li', {}, el('b', { text: '받은 날짜' }), el('span', { text: meta.v })),
      el('li', {}, el('b', { text: '출처' }), el('span', {}, out('https://exhibitors.ces.tech/8_0/', 'CES 공식 전시사 검색'))),
      el('li', {}, el('b', { text: '부스 자리' }), el('span', { text: meta.places.boothSpotsGuess > 0
        ? `홀 안 자리는 짐작이다 (공식 캠퍼스 지도 ${meta.places.edition}판, 정식 배치도 전)`
        : `공식 배치도 (${meta.places.edition}판)` }))));

  const sources = el('section', { class: 'foot' },
    el('p', { text: `알아둘 것은 CES 공식 안내에서 ${info.read}에 읽었다. 가기 전에 공식 안내를 다시 확인한다.` }),
    el('p', {}, info.sources.flatMap((s, i) => [i ? ' · ' : '', out(s.url, s.ko)])),
    el('p', { text: '연수에 가는 참가자가 만든 비공식 안내다. CES(CTA)나 코디세이 운영 측의 공식 자료가 아니다.' }));

  return el('div', { class: 'page' }, hero, days, campuses, moving, badge, data, sources);
}
