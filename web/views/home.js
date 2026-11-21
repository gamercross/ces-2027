// 첫 화면: 이름 · 며칠 남았나 · CES 2027 알아둘 것(날짜 · 캠퍼스 셋 · 오가는 법 · 배지) · 전시사 자료.

import { el, num, out } from '../dom.js';
import { getInfo, getMeta } from '../data.js';
import { getProfile, tagKo } from '../store.js';
import { offline } from '../offline.js';
import { dateOf, defaultRemind } from '../alerts.js';
import { alerts, askPermission, checkAlerts, getPaper, setPaper } from '../notify.js';

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
        el('h2', { text: alerts.paper === 'again' ? '출발이 가깝다: 종이 명함은 준비됐나요?' : '종이 명함이 있나요?' }),
        el('p', { class: 'note', text: '이벤트 부스에는 명함을 넣어야 응모가 되는 곳이 있다. 없으면 준비할 것을 알려 준다.' }),
        el('div', { class: 'actions' },
          el('button', { class: 'btn', type: 'button', text: '있다', onclick: () => answer(true) }),
          el('button', { class: 'btn ghost', type: 'button', text: '없다', onclick: () => { answer(false); location.hash = '#/card'; } }))) : null,
      alerts.needs.length ? el('section', { class: 'panel band' },
        el('h2', { text: `오늘 명함 ${alerts.needs.length}장 필요` }),
        el('p', { text: `오늘 동선에 명함 넣는 이벤트 부스가 있다: ${alerts.needs.slice(0, 4).map((n) => n.name).join(' · ')}${alerts.needs.length > 4 ? ' …' : ''}.` }),
        el('p', { class: 'note', text: '이벤트 부스는 공식 자료가 아니라 사람이 표시한 것이다.' }),
        el('div', { class: 'actions' },
          el('a', { class: 'btn', href: '#/plan', text: '동선 보기' }),
          paper?.has === false ? el('a', { class: 'btn ghost', href: '#/card', text: 'QR 명함 열기' }) : null)) : null,
    ].filter(Boolean));
  }
  paint();
  window.addEventListener('ces-alerts', paint);
  return box;
}

// 알림: 켜기 단추와, 이 폰에서 되는 것 · 안 되는 것.
function notifyBox() {
  const state = el('p', { class: 'big' });
  const button = el('button', { class: 'btn', type: 'button', text: '알림 켜기', hidden: true, onclick: async () => { await askPermission(); checkAlerts(); } });
  function paint() {
    state.textContent = { granted: '알림이 켜져 있다.', default: '알림을 켤 수 있다.', denied: '알림을 막아 두었다. 대신 이 화면의 띠로 보인다.', unsupported: '이 브라우저에서는 알림을 쓸 수 없다. 대신 이 화면의 띠로 보인다.' }[alerts.state];
    button.hidden = alerts.state !== 'default';
  }
  paint();
  window.addEventListener('ces-alerts', paint);
  return el('section', { class: 'panel' }, el('h2', { text: '알림' }), state,
    el('p', { class: 'note', text: '알리는 것: 오늘 동선에 명함 넣는 이벤트 부스가 있을 때, 그 부스 가까이 갔을 때. 서버가 없어서 앱을 열 때와 내 자리가 바뀔 때만 확인한다. 앱이 닫혀 있으면 정해진 시각에 울리지 않는다.' }),
    el('p', { class: 'note', text: '아이폰은 홈 화면에 추가한 뒤에야 알림을 켤 수 있다. 막아 두었으면 폰의 설정에서 이 앱의 알림을 다시 켠다.' }),
    el('div', { class: 'actions' }, button));
}

// 인터넷 없이 쓰기: 담겼는지 · 판 이름 · 홈 화면에 추가.
function offlineBox() {
  const state = el('p', { class: 'big' });
  const version = el('p', { class: 'note' });
  const button = el('button', { class: 'btn', type: 'button', text: '홈 화면에 추가', hidden: true, onclick: async () => {
    const ask = offline.install;
    if (!ask) return;
    ask.prompt();
    await ask.userChoice.catch(() => {});
    offline.install = null;
    paint();
  } });
  function paint() {
    const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    state.textContent = offline.ready ? '인터넷 없이 열 준비가 됐다.' : ('serviceWorker' in navigator ? '한 번 열어 두면 다음부터 인터넷 없이 열린다. 담는 중이다.' : '이 브라우저는 인터넷 없이 여는 것을 돕지 않는다.');
    version.textContent = offline.version ? `판 이름 ${offline.version}${standalone ? ' · 홈 화면에서 열었다' : ''}` : '';
    button.hidden = !offline.install;
  }
  paint();
  window.addEventListener('ces-offline', paint);
  return el('section', { class: 'panel' }, el('h2', { text: '인터넷 없이 쓰기' }), state,
    el('p', { class: 'note', text: '홈 화면에 추가해 두면 앱처럼 열린다. 아이폰은 사파리의 공유 단추에서, 안드로이드는 크롬 메뉴에서 "홈 화면에 추가"를 누른다.' }),
    el('div', { class: 'actions' }, button), version);
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

// 줄마다 붙는 작은 글: 확인한 날짜와 출처 링크. 줄에 source가 없으면 그 묶음의 것을 쓴다.
function proof(item, fallback) {
  const s = item?.source || fallback;
  if (!s) return null;
  const [, m, d] = s.read.split('-');
  return el('small', { class: 'proof' }, `${Number(m)}/${Number(d)} 확인 · `, out(s.url, '출처'));
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
    el('ul', { class: 'rows' }, show.days.map((d) => el('li', {}, el('b', { text: d.ko }), el('span', {}, d.hours, ' ', proof(d, show.source))))),
    el('p', { class: 'note' }, show.note, ' ', proof(null, show.noteSource)));

  const campuses = section('캠퍼스 셋',
    info.campuses.map((c) => el('div', { class: 'block' },
      el('h3', { text: c.ko }),
      el('p', { class: 'note', text: c.sub }),
      el('ul', { class: 'rows' }, c.halls.map((h) => el('li', {}, el('b', { text: h.ko }), el('span', {}, h.what, ' ', proof(h, c.source))))))));

  const moving = section('오가는 법',
    el('ul', { class: 'stack' }, info.moving.map((m) => el('li', {}, el('b', { text: m.ko }), el('span', { text: m.what }), proof(m, info.movingSource)))));

  const badge = section('배지 받는 곳',
    el('p', {}, info.badge.rule, ' ', proof(null, info.badge.source)),
    el('ul', { class: 'stack' }, info.badge.spots.map((s) => el('li', {}, el('b', { text: s.ko }), el('span', { text: s.hours }), proof(s, info.badge.source)))),
    el('p', { class: 'note' }, info.badge.more, ' ', proof(null, info.badge.source)));

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

  const talk = section('부스에서',
    el('p', { class: 'note', text: '영어로 물어볼 말을 미리 골라 크게 띄우고, 들은 말은 받아 적어 일기 초안으로 남긴다. 누를 때 불러온다.' }),
    el('div', { class: 'actions' },
      el('a', { class: 'btn ghost', href: '#/ask', text: '물어볼 말' }),
      el('a', { class: 'btn ghost', href: '#/listen', text: '듣고 일기 초안' })));

  const recheck = el('section', { class: 'panel notice' }, el('h2', { text: 'CES 2027 알아둘 것' }), el('p', { text: info.recheck }));
  const sources = el('section', { class: 'foot' },
    el('p', { text: '알아둘 것은 CES 공식 안내에서 읽은 것이다. 줄마다 확인한 날짜가 있다.' }),
    el('p', {}, info.sources.flatMap((s, i) => [i ? ' · ' : '', out(s.url, s.ko)])),
    el('p', { text: '연수에 가는 참가자가 만든 비공식 안내다. CES(CTA)나 코디세이 운영 측의 공식 자료가 아니다.' }));

  return el('div', { class: 'page' }, hero, alertBands(show.from), recheck, talk, days, campuses, moving, badge, data, notifyBox(), offlineBox(), sources);
}
