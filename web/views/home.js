// 첫 화면: 며칠 남았나 · 지금 갈 곳 · 바로 가기. 날짜 · 캠퍼스 · 오가는 법 · 배지 · 자료는 "알아둘 것", 알림 · 인터넷 없이 · 화면 색은 "설정".

import { el, out } from '../dom.js';
import { getExhibitors, getInfo, getPlaces, getSeparate } from '../data.js';
import { getInterests, getProfile, load, save, setInterests } from '../store.js';
import { dateOf, defaultRemind } from '../alerts.js';
import { alerts, checkAlerts, getPaper, setPaper } from '../notify.js';
import { hasView } from '../frame.js';

// 지금 갈 곳: 동선의 다음 곳을 첫 화면 맨 위에. 현장에서 앱을 열면 한 번에 길찾기까지 닿게.
// 전시사 자료(330KB쯤)는 첫 화면을 그린 뒤에, 관심 회사가 있을 때만 읽는다.
function nowBox() {
  const box = el('section', { class: 'panel next now', 'aria-live': 'polite' }, el('h2', { text: '지금 갈 곳' }));
  async function paint() {
    const list = getInterests();
    if (!list.length) {
      box.replaceChildren(el('h2', { text: '지금 갈 곳' }),
        el('p', { text: '관심 회사를 고르면 다음 갈 곳이 여기 뜬다.' }),
        el('div', { class: 'actions' }, el('a', { class: 'btn', href: '#/find', text: '회사 고르러 가기' })));
      return;
    }
    let route, data, places, info, mapsLink;
    try {
      [route, data, places, info, { mapsLink }] = await Promise.all([import('../route.js'), getExhibitors(), getPlaces(), getInfo(), import('../maps.js')]);
    } catch {
      box.replaceChildren(el('h2', { text: '지금 갈 곳' }), el('p', { class: 'note', text: '전시사 자료를 아직 받지 못했다. 동선 탭에서 다시 본다.' }));
      return;
    }
    const next = route.nextStop(getInterests());
    if (!next) {
      box.replaceChildren(el('h2', { text: '지금 갈 곳' }), el('p', { text: '동선의 회사를 다 봤다.' }),
        el('div', { class: 'actions' }, el('a', { class: 'btn ghost', href: '#/diary', text: '일기 쓰기' })));
      return;
    }
    const row = data.ex.find((r) => r[0] === next.id);
    const booth = row?.[7]?.[0] || null;
    const place = booth ? places.places.find((p) => p.k === route.splitBooth(booth).place) : null;
    const day = next.day ? info.show.days[next.day - 1]?.ko : '날짜 미정';
    const link = mapsLink(places, place, 'directions');
    box.replaceChildren(
      el('h2', { text: '지금 갈 곳' }),
      el('p', { class: 'big', text: row ? row[1] : '자료에서 빠진 회사' }),
      el('p', { class: 'note', text: [day, booth ? `${place ? place.ko : '장소 모름'} · 부스 ${route.splitBooth(booth).code} (자리는 짐작)` : '부스 미정'].filter(Boolean).join(' · ') }),
      el('div', { class: 'actions' },
        link ? out(link, '구글맵 길찾기', 'btn') : null,
        el('a', { class: 'btn ghost', href: '#/map', text: '지도에서 보기' }),
        el('button', { class: 'btn ghost', type: 'button', text: '봤다', onclick: () => {
          setInterests(getInterests().map((x) => (x.id === next.id ? { ...x, seen: true } : x)));
          paint();
        } })));
  }
  paint();
  return box;
}

// 바로 가기: 탭에 없는 자주 쓰는 일을 한 번에. 다른 화면(세션 · 만난 사람 · 물어보기 · 셔틀)은 그 화면이 앱에 들어오면 저절로 보인다.
const QUICK = [
  { view: 'sessions', href: '#/sessions', ko: '세션', icon: 'M5 6h14v13H5zM5 10h14M9 4v4M15 4v4' },
  { view: 'ask', href: '#/ask', ko: '물어볼 말', icon: 'M5 6h14v9H10l-4 3v-3H5z' },
  { view: 'q', href: '#/q', ko: '물어보기', icon: 'M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17zM9.6 9.6a2.4 2.4 0 1 1 3.4 2.2c-.6.3-1 .8-1 1.5v.5M12 16.6v.4' },
  { view: 'listen', href: '#/listen', ko: '듣고 쓰기', icon: 'M12 4a3 3 0 0 1 3 3v4a3 3 0 0 1-6 0V7a3 3 0 0 1 3-3zM6 11a6 6 0 0 0 12 0M12 17v3' },
  { view: 'people', href: '#/people', ko: '만난 사람', icon: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3.5 19a5.5 5.5 0 0 1 11 0M16 8h5M18.5 5.5v5' },
  { view: 'transit', href: '#/transit', ko: '셔틀', icon: 'M6 5h12v11H6zM6 11h12M8.5 19v-3M15.5 19v-3' },
  { view: 'translate', href: '#/translate', ko: '번역 앱', icon: 'M4 5h9M8.5 3v2M6 5c0 4 3 7 6 8M12 5c-1 4-4 7-8 8M13 20l4-9 4 9M14.5 17h5' },
  { view: 'apply', href: '#/apply', ko: '따로 신청', icon: 'M7 4h10v16H7zM10 9h4M10 13h4' },
  { view: 'onsite', href: '#/onsite', ko: '현장 안내', icon: 'M12 3l8 3v6c0 4.5-3.2 7.8-8 9-4.8-1.2-8-4.5-8-9V6zM12 8v5M12 15.5v.5' },
  { view: 'topics', href: '#/topics', ko: '주제 판', icon: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z' },
  { view: 'info', href: '#/info', ko: '알아둘 것', icon: 'M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17zM12 11v5M12 8v.4' },
  { view: 'settings', href: '#/settings', ko: '설정', icon: 'M5 7h9M18 7h1M5 17h1M10 17h9M16 5v4M8 15v4' },
];
function quickBox() {
  const ns = 'http://www.w3.org/2000/svg';
  const icon = (d) => {
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', d);
    svg.append(path);
    return svg;
  };
  return el('nav', { class: 'quick', 'aria-label': '바로 가기' },
    QUICK.filter((q) => hasView(q.view)).map((q) => el('a', { class: 'quick-link', href: q.href }, icon(q.icon), el('span', { text: q.ko }))));
}

// 알림을 못 쓰는 폰에서도 같은 내용을 보이는 띠: 종이 명함 물음 · 오늘 명함 몇 장.
function alertBands(showFrom) {
  const box = el('div', { class: 'page' });
  function paint() {
    // 화면에 붙었다가 떨어진 뒤에는 더 그리지 않는다.
    if (box.isConnected) box.dataset.seen = '1';
    else if (box.dataset.seen) { window.removeEventListener('ces-alerts', paint); return; }
    const paper = getPaper();
    const answer = (has) => { setPaper({ remindOn: defaultRemind(showFrom), ...(paper || {}), has, asked: dateOf(new Date()) }); checkAlerts(); };
    box.replaceChildren(...[
      alerts.paper ? el('section', { class: 'panel band ask' },
        el('h2', { text: alerts.paper === 'again' ? '종이 명함은 준비됐나요?' : '종이 명함이 있나요?' }),
        el('p', { class: 'note', text: '명함을 넣어야 응모되는 부스가 있다.' }),
        el('div', { class: 'actions' },
          el('button', { class: 'btn', type: 'button', text: '있다', onclick: () => answer(true) }),
          el('button', { class: 'btn ghost', type: 'button', text: '없다', onclick: () => { answer(false); location.hash = '#/card'; } }))) : null,
      alerts.soon.length ? el('section', { class: 'panel band' },
        el('h2', { text: `곧 시작하는 일정 ${alerts.soon.length}개` }),
        el('ul', { class: 'dots' }, alerts.soon.slice(0, 3).map((e) => el('li', { text: `${e.inMin}분 뒤 ${e.from} · ${e.name}${e.place ? ` (${e.place})` : ''}` }))),
                el('div', { class: 'actions' }, el('a', { class: 'btn', href: '#/days', text: '일정' }))) : null,
      alerts.needs.length ? el('section', { class: 'panel band' },
        el('h2', { text: `오늘 명함 ${alerts.needs.length}장 필요` }),
        el('p', { text: `${alerts.needs.slice(0, 3).map((n) => n.name).join(' · ')}${alerts.needs.length > 3 ? ' …' : ''}` }),
        el('div', { class: 'actions' },
          el('a', { class: 'btn', href: '#/plan', text: '동선' }),
          paper?.has === false ? el('a', { class: 'btn ghost', href: '#/card', text: '명함' }) : null)) : null,
    ].filter(Boolean));
  }
  paint();
  window.addEventListener('ces-alerts', paint);
  return box;
}

// 따로 신청하는 곳: 처음 한 번은 위에 한 줄로 보이고, 마감이 7일 안이거나 2027 안내를 다시 볼 때가 되면 띠로 보인다. 자료는 첫 화면을 그린 뒤에 읽는다.
function separateBoxes() {
  const top = el('div', { class: 'page' });
  async function paint() {
    let data, sep;
    try { [data, sep] = await Promise.all([getSeparate(), import('../separate.js')]); } catch { return; }
    const s = sep.summary(data);
    const today = dateOf(new Date());
    const due = sep.dueSoon(data.items, load('applied.v1', {}), today);
    const watch = sep.toWatch(data.items, today);
    const first = !load('separateSeen.v1', null);
    top.replaceChildren(...[
      first ? el('section', { class: 'panel band ask' },
        el('h2', { text: '따로 신청해야 하는 곳이 있다' }),
        el('p', { text: `${s.watch.join(' · ')}: 2027 안내 전이다. 배지 말고 표나 초대가 필요할 수 있다.` }),
        el('div', { class: 'actions' },
          el('a', { class: 'btn', href: '#/apply', text: '보기' }),
          el('button', { class: 'btn ghost', type: 'button', text: '닫기', onclick: () => { save('separateSeen.v1', today); paint(); } }))) : null,
      due.length ? el('section', { class: 'panel band ask' },
        el('h2', { text: '따로 신청: 마감이 가깝다' }),
        el('ul', { class: 'dots' }, due.map((x) => el('li', { text: `${x.item.org} ${x.item.what}: ${x.left === 0 ? '오늘까지' : `${x.left}일 남음`}` }))),
        el('div', { class: 'actions' }, el('a', { class: 'btn', href: '#/apply', text: '보기' }))) : null,
      !first && watch.length ? el('section', { class: 'panel band' },
        el('h2', { text: '2027 안내가 나왔나' }),
        el('p', { text: `${watch.map((it) => it.org).join(' · ')}: 작년엔 이맘때 나왔다.` }),
        el('div', { class: 'actions' }, el('a', { class: 'btn', href: '#/apply', text: '보기' }))) : null,
    ].filter(Boolean));
  }
  paint();
  return { top };
}

function daysLeft(show) {
  const day = 86400000;
  const today = new Date();
  const at = (s) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  const now = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  if (now < at(show.from)) return `${Math.round((at(show.from) - now) / day)}일 남았다`;
  if (now <= at(show.to)) return `${Math.round((now - at(show.from)) / day) + 1}일째`;
  return '끝났다';
}

export async function render() {
  const info = await getInfo();
  const profile = getProfile();
  const show = info.show;

  const hero = el('section', { class: 'hero' },
    el('p', { class: 'eyebrow', text: `${show.city} · 1/6 ~ 9` }),
    el('h1', { text: 'CES 2027' }),
    el('p', { class: 'count', text: daysLeft(show) }),
    // 명함이 있으면 단추를 두지 않는다: 내 명함은 위 오른쪽, 회사는 아래 탭, 물어보기는 바로 가기에 한 번씩만 있다.
    profile ? null : el('div', { class: 'actions' },
      el('a', { class: 'btn', href: '#/card', text: '명함 만들기' }),
      el('a', { class: 'btn ghost', href: '#/find', text: '회사 찾기' })),
  );

  const foot = el('section', { class: 'foot' },
    el('p', { text: '참가자가 만든 비공식 안내다. CES(CTA)나 코디세이의 공식 자료가 아니다.' }));

  const separate = separateBoxes();
  return el('div', { class: 'page' }, hero, nowBox(), alertBands(show.from), quickBox(), separate.top, foot);
}
