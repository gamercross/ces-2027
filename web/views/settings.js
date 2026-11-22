// 설정: 명함 · 화면 테마(밝게 · 어둡게 · 자동) · 알림 · 인터넷 없이 쓰기 · 내보내기. 짧게, 한 묶음에 한 가지.

import { el, num, out } from '../dom.js';
import { getInfo, getMeta } from '../data.js';
import { getDiary, getProfile, getTalks, getTheme, setTheme, tagKo } from '../store.js';
import { bundle, fileName, talksFor } from '../diary.js';
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
    el('p', { class: 'note', text: alerts.state === 'denied' || alerts.state === 'unsupported' ? '대신 동선 탭 위에 띠로 보인다. 아이폰은 홈 화면에 추가한 뒤에 켤 수 있다.' : '아이폰은 홈 화면에 추가한 뒤에 켤 수 있다.' }),
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

// 명함: 이 폰에만 남는다. 만들기 · 고치기는 명함 화면에서.
function cardBox() {
  const profile = getProfile();
  return el('section', { class: 'panel' },
    el('h2', { text: '명함' }),
    profile
      ? el('p', {}, el('b', { text: profile.nick }), ' ', el('span', { class: 'tag mint', text: tagKo(profile.tag) }))
      : el('p', { class: 'note', text: '아직 명함이 없다.' }),
    profile?.line ? el('p', { class: 'note', text: profile.line }) : null,
    el('div', { class: 'actions' }, profile
      ? [el('a', { class: 'btn', href: '#/card', text: 'QR 보기' }), el('a', { class: 'btn ghost', href: '#/card/edit', text: '명함 고치기' })]
      : el('a', { class: 'btn', href: '#/card', text: '명함 만들기' })));
}

// 내보내기: 일기 전부와 폰에 있는 대화를 파일 하나로. 녹음은 어느 때도 들어가지 않는다.
function exportBox() {
  const status = el('p', { class: 'note', role: 'status' });
  const ready = getDiary().filter((e) => !e.draft);
  const button = el('button', { class: 'btn', type: 'button', text: '일기 · 대화 전부 파일로', disabled: ready.length === 0, onclick: () => {
    const text = JSON.stringify(bundle(ready, getProfile(), new Date(), talksFor(ready, getTalks(), true)), null, 2);
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' }));
    const a = el('a', { href: url, download: fileName(getProfile()) });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status.textContent = `일기 ${ready.length}개와 폰에 있는 대화를 파일로 내보냈다.`;
  } });
  return el('section', { class: 'panel' },
    el('h2', { text: '내보내기' }),
    el('p', { class: 'note', text: ready.length ? `다듬어 남긴 일기 ${ready.length}개와 대화를 한 파일로. 녹음은 안 간다.` : '내보낼 일기가 아직 없다.' }),
    el('div', { class: 'actions' }, button), status);
}

// 자료: 어디서 언제 받은 것인지. 공식 출처와 받은 날짜는 늘 화면에 보인다.
async function dataBox() {
  const [meta, info] = await Promise.all([getMeta().catch(() => null), getInfo().catch(() => null)]);
  const md = (read) => { const [, m, d] = String(read || '').split('-'); return m ? `${Number(m)}/${Number(d)}` : ''; };
  return el('section', { class: 'panel' },
    el('h2', { text: '자료' }),
    meta
      ? el('p', {}, `전시사 ${num(meta.exhibitors)}곳 · 받은 날 ${meta.v} · `, out('https://exhibitors.ces.tech/8_0/', 'CES 공식 전시사 검색'))
      : el('p', { class: 'note', text: '전시사 자료를 아직 받지 못했다.' }),
    info ? el('p', { class: 'note' }, `날짜와 시간 · 오가는 법: ${md(info.show.source.read)} 확인 · `, out(info.show.source.url, '출처')) : null,
    el('p', { class: 'note', text: '부스 자리는 정식 배치도 전이라 홀 안은 짐작이다.' }));
}

export async function render() {
  return el('div', { class: 'page' },
    el('section', { class: 'head' }, el('h1', { text: '설정' })),
    cardBox(), themeBox(), notifyBox(), offlineBox(), exportBox(), await dataBox());
}
