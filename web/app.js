// 뼈대: 주소(#/…)에 맞는 화면을 그때 불러와 그린다. 첫 화면은 가볍게 둔다.

import { getProfile } from './store.js';
import { getInfo, getMeta, getSettings } from './data.js';
import { offline, startOffline } from './offline.js';

const VIEWS = {
  '': () => import('./views/home.js'),
  card: () => import('./views/card.js'),
  find: () => import('./views/find.js'),
  plan: () => import('./views/plan.js'),
  map: () => import('./views/map.js'),
  diary: () => import('./views/diary.js'),
  topics: () => import('./views/topics.js'),
};
const TAB_OF = { '': 'home', find: 'find', plan: 'plan', map: 'map', diary: 'diary', topics: 'topics' };

// 명함이 있으면 첫 화면이 쓸 자료를 화면 조각과 같이 받기 시작한다.
if (getProfile()) { getInfo().catch(() => {}); getMeta(); }

const view = document.getElementById('view');
let turn = 0;

function route() {
  const [name = '', ...rest] = location.hash.replace(/^#\/?/, '').split('/');
  return { name: name in VIEWS ? name : '', rest };
}

async function show() {
  const mine = ++turn;
  // 나눈 링크(#plan=<코드>)로 들어왔으면 동선 화면에서 받은 목록을 보인다.
  if (location.hash.startsWith('#plan=')) {
    sessionStorage.setItem('ces2027.incoming', location.hash.slice(1));
    location.replace('#/plan');
    return;
  }
  let { name, rest } = route();
  // 처음 들어오면 명함부터 만든다. "나중에"를 누르면 이번에는 묻지 않는다.
  if (name === '' && !getProfile() && !sessionStorage.getItem('ces2027.introLater')) {
    location.replace('#/card');
    return;
  }
  for (const a of document.querySelectorAll('.tabs a')) {
    if (a.dataset.tab === TAB_OF[name]) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  }
  refreshChip();
  try {
    const mod = await VIEWS[name]();
    if (mine !== turn) return;
    const node = await mod.render({ rest, go });
    if (mine !== turn) return;
    view.replaceChildren(node);
    startOffline();
  } catch (e) {
    if (mine !== turn) return;
    const p = document.createElement('p');
    p.className = 'panel';
    p.textContent = '화면을 불러오지 못했다. 인터넷을 확인하고 다시 열어 본다.';
    view.replaceChildren(p);
    startOffline();
    console.error(e);
  }
  window.scrollTo(0, 0);
}

export function go(hash) {
  if (location.hash === hash) show(); else location.hash = hash;
}

export function refreshChip() {
  const profile = getProfile();
  document.getElementById('me-chip').textContent = profile?.nick ? profile.nick : '내 명함';
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

window.addEventListener('hashchange', show);
show();

