// 뼈대: 주소(#/…)에 맞는 화면을 그때 불러와 그린다. 첫 화면은 가볍게 둔다.

import { getProfile } from './store.js';
import { getInfo, getMeta, getPlaces, getSettings } from './data.js';
import { closeBand, healOnce, keepData, offline, reopen, startOffline } from './offline.js';
import { alerts, checkAlerts, closeFollowBand, startAlerts } from './notify.js';
import { failed, frame, loading, missing } from './frame.js';

const VIEWS = {
  home: () => import('./views/home.js'),
  card: () => import('./views/card.js'),
  map: () => import('./views/map.js'),
  list: () => import('./views/list.js'),
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
// 어느 탭 아래의 화면인가: 지도(전시사 목록 · 셔틀 · 오가는 법) · 갈 곳(추천 · 시간과 일정 · 강연 일정) · 일기(듣기 · 대화 칸 · 만난 사람) · 설정(명함 · 모은 일기).
const TAB_OF = { home: 'home', map: 'map', list: 'map', transit: 'map', plan: 'plan', rec: 'plan', days: 'plan', sessions: 'plan', diary: 'diary', listen: 'diary', talk: 'diary', people: 'diary', settings: 'settings', card: 'settings', collect: 'settings' };

// 메인 틀: 아래 탭은 다섯(지도 · 갈 곳 · 홈 · 일기 · 설정, 11/26). 앱을 열면 홈.
// 탭이 아닌 화면(명함 · 시간과 일정 · 듣기 …)은 위에 "뒤로"가 생기고, 돌아갈 곳은 TAB_OF의 탭이다.
const ROOTS = new Set(['home', 'map', 'plan', 'diary', 'settings']);

// 홈(11/26 이재엽이 그림을 보고 정함): 앱을 열면 홈이 먼저 뜬다. 아래 탭은 다섯이고 홈이 가운데다(지도 · 갈 곳 · 홈 · 일기 · 설정). 가운데 홈 칸은 늘 강조색이다(app.css). 머리의 앱 이름을 눌러도 홈으로 온다.
// 설정 home이 'off'면 예전처럼 열면 지도다(명함이 없으면 명함부터). 그때는 홈 탭이 없고 앱 이름도 지도로 간다.
const homeMode = getSettings().then((s) => (s?.home === 'off' ? 'off' : 'on'));
homeMode.then((mode) => {
  // 다음에 열 때 index.html이 지도 조각을 미리 받을지 정하도록 적어 둔다(홈이 꺼져 있을 때만 받는다).
  try { if (mode === 'off') localStorage.setItem('ces2027.homeMode.v1', 'off'); else localStorage.removeItem('ces2027.homeMode.v1'); } catch { /* 막힌 폰이면 그대로 둔다 */ }
  if (mode !== 'off') return;
  document.querySelector('.tabs a[data-tab="home"]')?.remove();
  const brand = document.querySelector('.brand');
  brand.setAttribute('href', '#/map');
  brand.setAttribute('aria-label', '지도');
});
for (const k of Object.keys(VIEWS)) frame.views.add(k);

// 홈을 꺼 두어 첫 화면이 지도인 폰만: 명함이 있으면 지도가 쓸 자료(장소)를 화면 조각과 같이 받기 시작한다. 홈이 첫 화면이면 받지 않는다(홈은 폰에 담아 둔 것만 쓴다).
const homeWasOff = (() => { try { return localStorage.getItem('ces2027.homeMode.v1') === 'off'; } catch { return false; } })();
if (getProfile() && homeWasOff) { getInfo().catch(() => {}); getMeta(); getPlaces().catch(() => {}); }

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
  // 나눈 링크(#plan=<코드>)로 들어왔으면 갈 곳 화면에서 받은 목록을 보인다.
  if (location.hash.startsWith('#plan=')) {
    sessionStorage.setItem('ces2027.incoming', location.hash.slice(1));
    replaceTo('#/plan');
    return;
  }
  const { name, rest, lost } = route();
  // 앱을 열면(주소에 화면이 없으면) 지도. 처음 들어오면 명함부터 만든다. "나중에"를 누르면 이번에는 묻지 않는다.
  if (name === '' && !lost) {
    // 열면 홈이 먼저다. 처음 연 사람도 홈에서 "명함 만들기"로 간다. 홈을 꺼 두었으면(설정 home: off) 예전처럼 명함 · 지도.
    const mode = await homeMode;
    if (mine !== turn) return;
    replaceTo(mode !== 'off' ? '#/home' : !getProfile() && !sessionStorage.getItem('ces2027.introLater') ? '#/card' : '#/map');
    return;
  }
  stamp();
  frameFor(lost ? 'lost' : name, lost ? [] : rest);
  const first = !view.dataset.shown;
  // 느린 망: 0.25초 넘게 걸리면 "불러오는 중"을 보인다 (앞 화면이 그대로 남아 헷갈리지 않게).
  const wait = setTimeout(() => { if (mine === turn) view.replaceChildren(loading()); }, 250);
  try {
    let mod = null;
    // 화면 조각을 못 불러오면: 새 판과 옛 조각이 섞인 것일 수 있다. 새로 받아 한 번만 저절로 다시 연다.
    if (!lost) { try { mod = await VIEWS[name](); } catch (e) { if (await healOnce(e)) return; throw e; } }
    const node = lost ? missing(lost) : await mod.render({ rest, go });
    if (mine !== turn) return;
    view.replaceChildren(node);
    startOffline();
    if (getProfile()) keepData();
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

// 인터넷이 끊기면 위에 한 줄로 알린다. 폰에 담아 둔 화면 · 갈 곳 · 지도는 그대로 열린다.
const net = document.getElementById('net');
function paintNet() {
  const off = navigator.onLine === false;
  net.hidden = !off;
  // 끊겼을 때만 밖으로 나가는 단추(구글맵 · 공식 사이트) 아래에 한 줄이 보인다 (app.css의 [data-offline]).
  document.documentElement.toggleAttribute('data-offline', off);
}
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

// 새 판이 있으면 탭 위에 알리고, 누르면 새 파일을 받아 둔 뒤 다시 연다(offline.js의 reopen). 폰에 남긴 것(명함 · 관심 · 갈 곳 · 일기)은 그대로다.
window.addEventListener('ces-offline', () => { document.getElementById('update').hidden = !offline.band; });
// "닫기": 이 판의 띠는 다시 안 뜬다(더 새 판을 받으면 다시 뜬다). 설정의 "인터넷 없이" 줄에서 언제든 "다시 열기"를 누를 수 있다.
document.getElementById('update-close').addEventListener('click', closeBand);
document.getElementById('update-go').addEventListener('click', (ev) => { ev.currentTarget.disabled = true; reopen(); });

// 알림을 누르고 들어오면 그 화면으로 간다.
navigator.serviceWorker?.addEventListener('message', (ev) => { if (typeof ev.data?.go === 'string' && ev.data.go.startsWith('#/')) go(ev.data.go); });
// 탭 위의 띠는 한 번에 하나만 보인다. 차례(위가 먼저):
//   ⓪ 새 판이 있다(#update) — 다시 열어야 나머지 화면 · 자료가 맞는다. 이것이 보이면 아래 띠(#notice)는 숨긴다
//   ① 가까이에 명함 이벤트 부스가 있는데 알림을 못 쓰거나 띄우지 못할 때 → "명함 열기" (지금 그 자리를 지나면 늦는다)
//   ② 전시 날 저녁에 보내지 않은 일기가 있을 때 → "일기 열기" (그날 밤에만 뜬다. 일기 탭에서는 안 보인다: 거기에 보내기가 있다)
//   ③ 링크드인 이틀(R62): 만난 지 이틀이 지났는데 "팔로우함"이 없는 사람 → "보기" + "닫기" (며칠 안에만 하면 되고, 닫을 수 있다. 만난 사람 화면에서는 안 보인다)
let noticeTo = '#/card';
function paintNotice() {
  const bar = document.getElementById('notice');
  const newer = !document.getElementById('update').hidden;
  const near = !newer && alerts.near.length > 0 && (alerts.state !== 'granted' || alerts.fallback);
  const diary = !newer && !near && alerts.unsent > 0 && document.body.dataset.tab !== 'diary';
  const follow = !newer && !near && !diary && alerts.follow > 0 && !location.hash.startsWith('#/people');
  bar.hidden = !near && !diary && !follow;
  const text = document.getElementById('notice-text');
  if (near) text.textContent = `${alerts.error ? `${alerts.error} ` : ''}가까이에 명함 넣는 이벤트 부스 ${alerts.near.length}곳 (사람이 표시한 것)`;
  if (diary) text.textContent = `보내지 않은 일기 ${alerts.unsent}개`;
  if (follow) text.textContent = `링크드인 팔로우 안 한 사람 ${alerts.follow}명`;
  const goBtn = document.getElementById('notice-go');
  goBtn.textContent = follow ? '보기' : diary ? '일기 열기' : '명함 열기';
  // 링크드인 띠의 단추는 톤 단추다(검정 단추는 그 화면의 할 일 하나에 둔다). 다른 띠는 지금처럼.
  goBtn.className = follow ? 'pick' : 'btn';
  document.getElementById('notice-close').hidden = !follow;
  noticeTo = follow ? '#/people/follow' : diary ? '#/diary' : '#/card';
}
window.addEventListener('ces-alerts', paintNotice);
window.addEventListener('ces-offline', paintNotice);
window.addEventListener('hashchange', paintNotice);
document.getElementById('notice-go').addEventListener('click', () => go(noticeTo));
document.getElementById('notice-close').addEventListener('click', () => closeFollowBand());

window.addEventListener('hashchange', show);
show();

