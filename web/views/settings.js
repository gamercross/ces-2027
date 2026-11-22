// 설정: 화면 테마(밝게 · 어둡게 · 자동) · 알림 · 인터넷 없이 쓰기. 짧게, 한 묶음에 한 가지.

import { el } from '../dom.js';
import { getTheme, setTheme } from '../store.js';
import { offline } from '../offline.js';
import { alerts, askPermission, checkAlerts } from '../notify.js';

const THEMES = [
  { k: 'auto', ko: '자동' },
  { k: 'light', ko: '밝게' },
  { k: 'dark', ko: '어둡게' },
];

function themeBox() {
  const buttons = THEMES.map((t) => el('button', { class: 'seg', type: 'button', 'data-theme-pick': t.k, text: t.ko, onclick: () => {
    setTheme(t.k);
    window.cesTheme?.apply();
    paint();
    // 지도 색은 불러올 때 읽는다. 다시 열어 같은 색으로 맞춘다.
    location.reload();
  } }));
  function paint() {
    const now = getTheme();
    for (const b of buttons) b.setAttribute('aria-pressed', b.dataset.themePick === now ? 'true' : 'false');
  }
  paint();
  return el('section', { class: 'panel' },
    el('h2', { text: '화면 색' }),
    el('div', { class: 'segs', role: 'group', 'aria-label': '화면 색' }, buttons),
    el('p', { class: 'note', text: '자동은 폰의 설정을 따른다.' }));
}

function notifyBox() {
  const state = el('p', { class: 'big' });
  const error = el('p', { class: 'note', role: 'status' });
  const button = el('button', { class: 'btn', type: 'button', text: '켜기', hidden: true, onclick: async () => { await askPermission(); checkAlerts(); } });
  function paint() {
    state.textContent = { granted: '켜져 있다', default: '꺼져 있다', denied: '막혀 있다', unsupported: '쓸 수 없다' }[alerts.state];
    error.textContent = alerts.error;
    button.hidden = alerts.state !== 'default';
  }
  paint();
  window.addEventListener('ces-alerts', paint);
  return el('section', { class: 'panel' }, el('h2', { text: '알림' }), state,
    el('p', { class: 'note', text: '일정이 30분 안에 시작할 때 · 명함 낼 부스가 가까울 때. 앱이 열려 있을 때만 알린다.' }),
    el('p', { class: 'note', text: alerts.state === 'denied' || alerts.state === 'unsupported' ? '대신 첫 화면에 띠로 보인다. 아이폰은 홈 화면에 추가한 뒤에 켤 수 있다.' : '아이폰은 홈 화면에 추가한 뒤에 켤 수 있다.' }),
    error, el('div', { class: 'actions' }, button));
}

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
    state.textContent = offline.ready ? '인터넷 없이 열린다' : ('serviceWorker' in navigator ? '담는 중이다' : '이 브라우저는 안 된다');
    version.textContent = offline.version ? `판 ${offline.version}${standalone ? ' · 홈 화면에서 열었다' : ''}` : '';
    button.hidden = !offline.install;
  }
  paint();
  window.addEventListener('ces-offline', paint);
  return el('section', { class: 'panel' }, el('h2', { text: '인터넷 없이' }), state,
    el('p', { class: 'note', text: '한 번 열어 두면 다음부터 인터넷 없이 열린다. 아이폰은 사파리 공유 단추 → 홈 화면에 추가.' }),
    el('div', { class: 'actions' }, button), version);
}

export async function render() {
  return el('div', { class: 'page' },
    el('section', { class: 'head' }, el('h1', { text: '설정' })),
    themeBox(), notifyBox(), offlineBox());
}
