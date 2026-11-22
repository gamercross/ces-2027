// 설정: 맨 위에 글자 크기(네 단계) · 화면 색, 아래는 "이름 왼쪽 · 상태나 단추 오른쪽" 한 줄 목록. 설명 문단은 상태가 문제일 때만 한 줄.
// 명함 · 알림 · 인터넷 없이 · 저장 공간 · 내보내기 · 자료. 폰 안에서만 일어나고 밖으로 보내지 않는다.

import { el, num, out } from '../dom.js';
import { getInfo, getMeta } from '../data.js';
import { getDiary, getProfile, getTalks, getTextSize, getTheme, setTextSize, setTheme, tagKo } from '../store.js';
import { bundle, fileName, talksFor } from '../diary.js';
import { offline } from '../offline.js';
import { alerts, askPermission, checkAlerts, getPaper } from '../notify.js';
import { paperPanel } from './card.js';
import { createCardShell } from '../plancard.js';

const THEMES = [
  { k: 'auto', ko: '자동' },
  { k: 'light', ko: '밝게' },
  { k: 'dark', ko: '어둡게' },
];
const SIZES = [
  { n: 1, ko: '기본' },
  { n: 2, ko: '크게' },
  { n: 3, ko: '더 크게' },
  { n: 4, ko: '가장 크게' },
];

// 한 줄: 왼쪽에 이름(+ 상태 한 줄), 오른쪽에 글자 단추 하나. 줄 높이 56px 이상.
function row(label, state, action) {
  return el('li', { class: 'setrow' },
    el('div', { class: 'setrow-main' }, el('b', { text: label }), state ? el('span', { class: 'setrow-state', text: state }) : null),
    action || null);
}
const rowState = (label) => { const s = el('span', { class: 'setrow-state' }); return { s, main: el('div', { class: 'setrow-main' }, el('b', { text: label }), s) }; };

// ---- 맨 위: 글자 크기 + 화면 색
function sizeBox() {
  const buttons = SIZES.map((s) => el('button', { class: 'seg', type: 'button', 'data-text-pick': String(s.n), text: s.ko, onclick: () => {
    setTextSize(s.n);
    window.cesText?.apply();
    paint();
  } }));
  function paint() {
    const now = getTextSize();
    for (const b of buttons) b.setAttribute('aria-pressed', b.dataset.textPick === String(now) ? 'true' : 'false');
  }
  paint();
  return el('section', { class: 'panel' },
    el('h2', { text: '글자 크기' }),
    el('div', { class: 'segs textsegs', role: 'group', 'aria-label': '글자 크기' }, buttons),
    // 고르면 바로 바뀌는 보기: 줄 하나와 같은 꼴
    el('div', { class: 'stop preview', 'aria-label': '글자 크기 보기' },
      el('div', { class: 'stop-open' },
        el('span', { class: 'no', text: '1' }),
        el('span', { class: 'stop-main' },
          el('span', { class: 'name', text: '1NCE' }),
          el('span', { class: 'where', text: 'LVCC 노스 홀 · 부스 14731' })))));
}

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
  return el('div', { class: 'setgroup' },
    el('p', { class: 'label', text: '화면 색' }),
    el('div', { class: 'segs', role: 'group', 'aria-label': '화면 색' }, buttons));
}

// ---- 줄들
function cardRow() {
  const profile = getProfile();
  if (!profile) return [row('명함', '아직 없다', el('a', { class: 'pick', href: '#/card', text: '명함 만들기' }))];
  return [
    row('명함', `${profile.nick} · ${tagKo(profile.tag)}`, el('a', { class: 'pick', href: '#/card', text: 'QR 보기' })),
    row('명함 내용', '별명 · 한 줄 · 깃허브 · 디스코드', el('a', { class: 'pick', href: '#/card/edit', text: '명함 고치기' })),
  ];
}

function notifyRow() {
  const { s, main } = rowState('알림');
  const hint = el('p', { class: 'setrow-hint', role: 'status' });
  const button = el('button', { class: 'pick', type: 'button', text: '켜기', hidden: true, onclick: async () => { await askPermission(); checkAlerts(); } });
  function paint() {
    s.textContent = { granted: '켜져 있다', default: '꺼져 있다', denied: '막혀 있다', unsupported: '쓸 수 없다' }[alerts.state] || '';
    // 상태가 문제일 때만 한 줄: 왜 안 되고 어디서 켜는가
    hint.textContent = alerts.state === 'denied' ? '알림이 막혀 있다. 브라우저 주소창 옆 사이트 설정에서 알림을 허용한다. 막혀 있어도 동선 탭 위에 띠로 보인다.'
      : alerts.state === 'unsupported' ? '이 브라우저는 알림을 못 쓴다(아이폰은 홈 화면에 추가한 뒤에 켤 수 있다). 대신 동선 탭 위에 띠로 보인다.'
      : alerts.error || '';
    hint.hidden = !hint.textContent;
    button.hidden = alerts.state !== 'default';
  }
  paint();
  window.addEventListener('ces-alerts', paint);
  return [el('li', { class: 'setrow' }, main, button), el('li', { class: 'setrow-more' }, hint)];
}

function offlineRow() {
  const { s, main } = rowState('인터넷 없이');
  const button = el('button', { class: 'pick', type: 'button', text: '홈 화면에 추가', hidden: true, onclick: async () => {
    const ask = offline.install;
    if (!ask) return;
    ask.prompt();
    await ask.userChoice.catch(() => {});
    offline.install = null;
    paint();
  } });
  function paint() {
    const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    const ready = offline.ready ? '인터넷 없이 열린다' : ('serviceWorker' in navigator ? '담는 중이다' : '이 브라우저는 안 된다');
    s.textContent = `${ready}${offline.version ? ` · 판 ${offline.version}${standalone ? ' · 홈 화면' : ''}` : ''}`;
    button.hidden = !offline.install;
  }
  paint();
  window.addEventListener('ces-offline', paint);
  return el('li', { class: 'setrow' }, main, button);
}

// 저장 공간: 이 폰에서 앱이 쓰는 크기와 "비우기"(받아 둔 받아쓰기 모델 · 옛 번역 모델 찌꺼기). 일기 · 명함 · 동선은 지우지 않는다.
function storageRow() {
  const { s, main } = rowState('저장 공간');
  const note = el('p', { class: 'setrow-hint', role: 'status', hidden: true });
  const button = el('button', { class: 'pick', type: 'button', text: '비우기', hidden: true });
  async function paint() {
    try {
      const est = await navigator.storage?.estimate?.();
      if (!est || typeof est.usage !== 'number') { s.textContent = '이 브라우저는 크기를 알려 주지 않는다'; return; }
      const mb = est.usage / 1048576;
      s.textContent = `약 ${mb >= 10 ? Math.round(mb) : mb.toFixed(1)}MB 쓴다`;
      button.hidden = false;
    } catch { s.textContent = '크기를 알 수 없다'; }
  }
  button.addEventListener('click', async () => {
    if (!button.dataset.ask) {
      button.dataset.ask = '1';
      button.textContent = '정말 비우기';
      note.hidden = false;
      note.textContent = '받아 둔 받아쓰기 모델과 옛 번역 모델을 지운다. 일기 · 명함 · 동선은 그대로다.';
      setTimeout(() => { if (button.isConnected) { delete button.dataset.ask; button.textContent = '비우기'; } }, 5000);
      return;
    }
    delete button.dataset.ask;
    button.textContent = '비우기';
    try {
      for (const name of ['ces2027keep-speech-v1', 'transformers-cache']) { if (await caches.has(name)) await caches.delete(name); }
      note.textContent = '비웠다. 받아쓰기 모델은 필요할 때 다시 받는다.';
    } catch { note.textContent = '비우지 못했다.'; }
    note.hidden = false;
    paint();
  });
  paint();
  return [el('li', { class: 'setrow' }, main, button), el('li', { class: 'setrow-more', hidden: false }, note)];
}

// 내보내기: 일기 전부와 폰에 있는 대화를 파일 하나로. 녹음은 어느 때도 들어가지 않는다.
function exportRow() {
  const ready = getDiary().filter((e) => !e.draft);
  const status = el('p', { class: 'setrow-hint', role: 'status', hidden: true });
  const button = el('button', { class: 'pick', type: 'button', text: '파일로', 'aria-label': '일기 · 대화 전부 파일로', disabled: ready.length === 0, onclick: () => {
    const text = JSON.stringify(bundle(ready, getProfile(), new Date(), talksFor(ready, getTalks(), true)), null, 2);
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' }));
    const a = el('a', { href: url, download: fileName(getProfile()) });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status.textContent = `일기 ${ready.length}개와 폰에 있는 대화를 파일로 내보냈다. 녹음은 안 간다.`;
    status.hidden = false;
  } });
  return [row('내보내기', ready.length ? `일기 ${ready.length}개 · 대화 ${getTalks().length}개` : '내보낼 일기가 아직 없다', button), el('li', { class: 'setrow-more' }, status)];
}

// 종이 명함: 있는지 · 없으면 QR 명함으로 대신. 묻는 곳은 동선 탭 위 띠와 여기 두 곳뿐이다(QR 화면에는 두지 않는다).
function paperRow(shell, showFrom) {
  const { s, main } = rowState('종이 명함');
  const paint = () => { const p = getPaper(); s.textContent = p?.has === true ? '있다' : p?.has === false ? '없다 · QR 명함으로 대신' : '아직 안 정했다'; };
  paint();
  window.addEventListener('ces-alerts', paint);
  const open = (ev) => shell.open([
    el('div', { class: 'pcard-top' }, el('h2', { class: 'pcard-tools-title', text: '종이 명함' }), el('button', { class: 'btn ghost pcard-close', type: 'button', text: '닫기', onclick: () => { shell.close(); paint(); } })),
    paperPanel(showFrom),
  ], ev.currentTarget);
  return el('li', { class: 'setrow' }, main, el('button', { class: 'pick', type: 'button', text: '바꾸기', onclick: open }));
}

// 권한: 막혀 있는 것만 한 줄(왜 안 되고 어디서 켜는가). 물어볼 수 없는 브라우저에서는 줄이 안 보인다.
function permissionRows() {
  const box = el('li', { class: 'setrow-more', hidden: true });
  const names = [['geolocation', '위치'], ['camera', '카메라']];
  (async () => {
    const blocked = [];
    for (const [name, ko] of names) {
      try { const r = await navigator.permissions?.query({ name }); if (r?.state === 'denied') blocked.push(ko); } catch { /* 이 브라우저는 물어볼 수 없다 */ }
    }
    if (!blocked.length) return;
    box.replaceChildren(el('p', { class: 'setrow-hint', text: `${blocked.join(' · ')} 권한이 막혀 있다. 브라우저 주소창 옆 사이트 설정에서 허용한다.` }));
    box.hidden = false;
  })();
  return box;
}

// 자료: 어디서 언제 받은 것인지. 공식 출처와 받은 날짜는 늘 볼 수 있다(눌러서 카드로).
async function dataRow(shell) {
  const [meta, info] = await Promise.all([getMeta().catch(() => null), getInfo().catch(() => null)]);
  const md = (read) => { const [, m, d] = String(read || '').split('-'); return m ? `${Number(m)}/${Number(d)}` : ''; };
  const open = (ev) => shell.open([
    el('div', { class: 'pcard-top' }, el('h2', { class: 'pcard-tools-title', text: '자료 출처' }), el('button', { class: 'btn ghost pcard-close', type: 'button', text: '닫기', onclick: () => shell.close() })),
    meta ? el('p', {}, `전시사 ${num(meta.exhibitors)}곳 · 받은 날 ${meta.v} · `, out('https://exhibitors.ces.tech/8_0/', 'CES 공식 전시사 검색')) : el('p', { class: 'note', text: '전시사 자료를 아직 받지 못했다.' }),
    info ? el('p', {}, `날짜와 시간 · 오가는 법: ${md(info.show.source.read)} 확인 · `, out(info.show.source.url, '출처')) : null,
    el('p', { class: 'note', text: '부스 자리는 정식 배치도 전이라 홀 안은 짐작이다.' }),
    el('p', { class: 'note', text: '이 앱은 사용 기록을 보내지 않는다. 명함 · 일기 · 동선은 이 폰에만 남는다.' }),
  ], ev.currentTarget);
  const when = meta ? `${md(meta.v)} 받음` : '받지 못했다';
  return row('자료', `${when} · CES 공식`, el('button', { class: 'pick', type: 'button', text: '출처', onclick: open }));
}

export async function render() {
  document.body.classList.remove('pcard-open');
  const shell = createCardShell();
  window.addEventListener('hashchange', () => shell.close(), { once: true });
  const showFrom = (await getInfo().catch(() => null))?.show.from || '2027-01-06';
  const list = el('ul', { class: 'setlist' },
    ...cardRow(), paperRow(shell, showFrom), ...notifyRow(), offlineRow(), ...storageRow(), ...exportRow(), permissionRows(), await dataRow(shell));
  return el('div', { class: 'page listpage settingspage' },
    el('section', { class: 'head' }, el('h1', { text: '설정' })),
    sizeBox(),
    el('section', { class: 'panel' }, themeBox(), list),
    shell.node);
}
