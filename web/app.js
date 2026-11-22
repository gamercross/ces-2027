// 뼈대: 주소(#/…)에 맞는 화면을 그때 불러와 그린다. 첫 화면은 가볍게 둔다.

import { getProfile } from './store.js';
import { getInfo, getMeta, getPlaces, getSettings } from './data.js';
import { offline, startOffline } from './offline.js';
import { alerts, checkAlerts, startAlerts } from './notify.js';
import { failed, frame, loading, missing } from './frame.js';

const VIEWS = {
  card: () => import('./views/card.js'),
  map: () => import('./views/map.js'),
  transit: () => import('./views/transit.js'),
  plan: () => import('./views/plan.js'),
  rec: () => import('./views/rec.js'),
  days: () => import('./views/days.js'),
  sessions: () => import('./views/sessions.js'),
  diary: () => import('./views/diary.js'),
  listen: () => import('./views/listen.js'),
  talk: () => import('./views/talk.js'),
  people: () => import('./views/people.js'),
  settings: () => import('./views/settings.js'),
  collect: () => import('./views/collect.js'),
};
// 어느 탭 아래의 화면인가: 지도(셔틀 · 오가는 법) · 동선(추천 · 시간과 일정 · 세션) · 일기(듣기 · 대화 칸 · 만난 사람) · 설정(명함 · 모은 일기).
const TAB_OF = { map: 'map', transit: 'map', plan: 'plan', rec: 'plan', days: 'plan', sessions: 'plan', diary: 'diary', listen: 'diary', talk: 'diary', people: 'diary', settings: 'settings', card: 'settings', collect: 'settings' };

// 메인 틀: 아래 탭은 넷(지도 · 동선 · 일기 · 설정). 앱을 열면 지도.
// 탭이 아닌 화면(명함 · 시간과 일정 · 듣기 …)은 위에 "뒤로"가 생기고, 돌아갈 곳은 TAB_OF의 탭이다.
const ROOTS = new Set(['map', 'plan', 'diary', 'settings']);
for (const k of Object.keys(VIEWS)) frame.views.add(k);

// 명함이 있으면 첫 화면(지도)이 쓸 자료(장소)를 화면 조각과 같이 받기 시작한다. 전시사 자료는 지도가 홀로 가까이 갈 때 홀마다 받는다.
if (getProfile()) { getInfo().catch(() => {}); getMeta(); getPlaces().catch(() => {}); }

// 지운 번역 기능이 폰에 남긴 설정(받아 둔 모델 표시 · 번역 앱 고름)을 치운다.
for (const k of ['translationModel.v1', 'translatorApp.v1', 'translatorPrep.v1']) { try { localStorage.removeItem(`ces2027.${k}`); } catch { /* 막힌 폰이면 그대로 둔다 */ } }

const view = document.getElementById('view');
let turn = 0;

function route() {
  const [name = '', ...rest] = location.hash.replace(/^#\/?/, '').split('/');
  if (name === '') return { name: '', rest };
  return name in VIEWS ? { name, rest } : { name: '', rest, lost: name };
}

// 뒤로: 앱 안에서 넘어온 화면이면 브라우저의 뒤로와 같고(스크롤 · 적던 것이 그대로), 주소로 바로 들어왔으면 그 탭의 첫 화면으로 간다.
// 몇 번째 화면인지(d)를 기록에 붙여 둔다. 주소를 바꿔 끼운 것(replace)은 같은 자리로 센다.
let depth = 0;
let replacing = false;
function stamp() {
  const d = history.state?.d;
  if (typeof d === 'number') depth = d;
  else { depth = replacing ? depth : depth + (show.ran ? 1 : 0); history.replaceState({ ...(history.state || {}), d: depth }, ''); }
  replacing = false;
  show.ran = true;
}
function replaceTo(hash) { replacing = true; location.replace(hash); }
const backButton = document.getElementById('back');
let parent = '#/map';
backButton.addEventListener('click', () => { if (depth > 0) history.back(); else go(parent); });

function frameFor(name, rest) {
  // 처음 들어와 명함을 만드는 동안(명함이 없을 때의 명함 화면)은 뒤로도 지금 탭 표시도 없다.
  const intro = name === 'card' && !getProfile();
  const root = (ROOTS.has(name) && !rest.length) || intro;
  const tab = intro ? 'intro' : TAB_OF[name] || 'map';
  parent = document.querySelector(`.tabs a[data-tab="${tab}"]`)?.getAttribute('href') || '#/map';
  backButton.hidden = root;
  document.body.dataset.tab = tab;
  document.body.classList.toggle('sub', !root);
  for (const a of document.querySelectorAll('.tabs a')) {
    if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  }
}

async function show() {
  const mine = ++turn;
  // 나눈 링크(#plan=<코드>)로 들어왔으면 동선 화면에서 받은 목록을 보인다.
  if (location.hash.startsWith('#plan=')) {
    sessionStorage.setItem('ces2027.incoming', location.hash.slice(1));
    replaceTo('#/plan');
    return;
  }
  const { name, rest, lost } = route();
  // 앱을 열면(주소에 화면이 없으면) 지도. 처음 들어오면 명함부터 만든다. "나중에"를 누르면 이번에는 묻지 않는다.
  if (name === '' && !lost) {
    replaceTo(!getProfile() && !sessionStorage.getItem('ces2027.introLater') ? '#/card' : '#/map');
    return;
  }
  stamp();
  frameFor(lost ? 'lost' : name, lost ? [] : rest);
  const first = !view.dataset.shown;
  // 느린 망: 0.25초 넘게 걸리면 "불러오는 중"을 보인다 (앞 화면이 그대로 남아 헷갈리지 않게).
  const wait = setTimeout(() => { if (mine === turn) view.replaceChildren(loading()); }, 250);
  try {
    const node = lost ? missing(lost) : await (await VIEWS[name]()).render({ rest, go });
    if (mine !== turn) return;
    view.replaceChildren(node);
    startOffline();
    // 화면을 바꿀 때마다 알릴 것을 다시 본다 (표시한 부스가 없으면 아무것도 읽지 않는다).
    if (!startAlerts()) checkAlerts();
  } catch (e) {
    if (mine !== turn) return;
    view.replaceChildren(failed({ retry: show }));
    startOffline();
    console.error(e);
  } finally {
    clearTimeout(wait);
  }
  view.dataset.shown = '1';
  window.scrollTo(0, 0);
  // 화면을 바꾸면 읽는 자리를 본문으로 옮긴다 (화면 읽기 도구). 첫 화면은 그대로 둔다.
  if (!first) view.focus({ preventScroll: true });
}

// 인터넷이 끊기면 위에 한 줄로 알린다. 폰에 담아 둔 화면 · 동선 · 지도는 그대로 열린다.
const net = document.getElementById('net');
function paintNet() { net.hidden = navigator.onLine !== false; }
window.addEventListener('online', paintNet);
window.addEventListener('offline', paintNet);
paintNet();

export function go(hash) {
  if (location.hash === hash) show(); else location.hash = hash;
}

// 코디세이 아이콘: 아직 정하지 않은 칸. 설정(codysseyIcon)에 그림 주소가 있을 때만 보인다.
getSettings().then((s) => {
  if (typeof s.codysseyIcon !== 'string' || !s.codysseyIcon) return;
  const img = document.createElement('img');
  img.src = s.codysseyIcon;
  img.alt = '코디세이';
  img.width = 24;
  img.height = 24;
  const slot = document.getElementById('brand-icon');
  img.addEventListener('load', () => { slot.replaceChildren(img); slot.hidden = false; });
});

// 새 판이 있으면 탭 위에 알리고, 누르면 다시 연다. 폰에 남긴 것(명함 · 관심 · 동선 · 일기)은 그대로다.
window.addEventListener('ces-offline', () => { document.getElementById('update').hidden = !offline.update; });
document.getElementById('update-go').addEventListener('click', () => location.reload());

// 알림을 누르고 들어오면 그 화면으로 간다.
navigator.serviceWorker?.addEventListener('message', (ev) => { if (typeof ev.data?.go === 'string' && ev.data.go.startsWith('#/')) go(ev.data.go); });
// 가까이에 명함 이벤트 부스가 있는데 알림을 못 쓰거나 띄우지 못하면, 탭 위에 띠로 보인다.
window.addEventListener('ces-alerts', () => {
  const bar = document.getElementById('notice');
  const show = alerts.near.length > 0 && (alerts.state !== 'granted' || alerts.fallback);
  bar.hidden = !show;
  if (show) document.getElementById('notice-text').textContent = `${alerts.error ? `${alerts.error} ` : ''}가까이에 명함 넣는 이벤트 부스 ${alerts.near.length}곳 (사람이 표시한 것)`;
});
document.getElementById('notice-go').addEventListener('click', () => go('#/card'));

window.addEventListener('hashchange', show);
show();

