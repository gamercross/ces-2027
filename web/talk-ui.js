// 물어볼 말 · 듣기 화면이 같이 쓰는 조각: 크게 띄우기, "이 폰에서 되는 것" 줄.

import { el } from './dom.js';
import { load, save } from './store.js';
import { allowedMode, modeOf, SERVICE_NOTE, speak } from './speech.js';

export const MODE_KO = { 'on-device': '폰 안에서만', 'device-service': '폰의 음성 인식 서비스' };

// 지금 길: 쓰는 사람이 고른 것. 폰 밖 길은 확인을 받은 적이 있을 때만이다.
export const currentMode = (settings) => allowedMode(modeOf(settings, load('speechMode.v1', null)), load('speechConsent.v1', null));

// 길을 고르는 칸. 폰 밖 길을 처음 고를 때는 한 줄로 알리고 한 번 확인받는다. 바꾸면 onChange()를 부른다.
export function modePicker(mode, onChange) {
  const box = el('div', { class: 'block' });
  const set = (next) => { save('speechMode.v1', next); onChange(); };
  function draw(asking) {
    box.replaceChildren(...[
      el('div', { class: 'label', text: '받아쓰기 · 번역을 어디서 하나' }),
      el('div', { class: 'segs', role: 'group', 'aria-label': '받아쓰기와 번역을 하는 곳' },
        el('button', { class: 'seg', type: 'button', text: MODE_KO['on-device'], 'aria-pressed': mode === 'on-device' ? 'true' : 'false', onclick: () => { if (mode !== 'on-device') set('on-device'); else draw(false); } }),
        el('button', { class: 'seg', type: 'button', text: MODE_KO['device-service'], 'aria-pressed': mode === 'device-service' ? 'true' : 'false', onclick: () => {
          if (mode === 'device-service') return;
          if (load('speechConsent.v1', null)) set('device-service'); else draw(true);
        } })),
      asking ? el('div', { class: 'panel band ask', role: 'alertdialog', 'aria-label': '폰의 음성 인식 서비스로 바꾸기' },
        el('p', {}, el('b', { text: SERVICE_NOTE }), ' 상대의 말소리가 폰 밖으로 나가니, 녹음을 알릴 때 이것도 같이 알린다. 키나 우리 서버는 쓰지 않는다.'),
        el('div', { class: 'actions' },
          el('button', { class: 'btn', type: 'button', text: '알겠다 · 이 길로 한다', onclick: () => { save('speechConsent.v1', new Date().toISOString().slice(0, 10)); set('device-service'); } }),
          el('button', { class: 'btn ghost', type: 'button', text: '그만둔다', onclick: () => draw(false) }))) : null,
      el('p', { class: 'note', text: mode === 'on-device' ? '지금: 폰 안에서만. 소리와 글이 폰 밖으로 나가지 않는다. 안 되는 폰이 많다.' : `지금: 폰의 음성 인식 서비스. ${SERVICE_NOTE} 글 옮기기는 폰 안의 번역기가 없으면 번역 사이트 링크로 한다.` }),
    ].filter(Boolean));
    if (asking) box.querySelector('[role=alertdialog] button')?.focus();
  }
  draw(false);
  return box;
}

// 되는 것은 "됨", 안 되는 것은 숨기지 않고 "이 폰에서는 안 됨"과 까닭을 보인다.
export function capText(cap) {
  return cap.ok ? `됨${cap.why ? ` · ${cap.why}` : ''}` : `이 폰에서는 안 됨 · ${cap.why}`;
}
export function capRows(pairs) {
  return el('ul', { class: 'rows' }, pairs.map(([label, cap]) => el('li', {}, el('b', { text: label }), el('span', { text: capText(cap) }))));
}

// 영어 글을 화면 가득 크게 띄운다. 상대에게 폰을 보여 줄 때 쓴다.
export function showBig(en, ko, mode, canSpeak) {
  const back = document.activeElement;
  const close = el('button', { class: 'btn ghost', type: 'button', text: '닫기' });
  const status = el('p', { class: 'note', role: 'status' });
  const say = el('button', { class: 'btn', type: 'button', text: '읽어 주기', disabled: !canSpeak.ok, onclick: () => {
    status.textContent = speak(en, mode) ? '' : '읽어 주지 못했다. 이 폰 안에 영어 목소리가 없다.';
  } });
  const node = el('div', { class: 'bigview', role: 'dialog', 'aria-modal': 'true', 'aria-label': '크게 보기' },
    el('div', { class: 'big-text' },
      el('p', { class: 'big-en', lang: 'en', text: en }),
      ko ? el('p', { class: 'big-ko', text: ko }) : null),
    el('div', {},
      canSpeak.ok ? null : el('p', { class: 'note', text: `읽어 주기: ${capText(canSpeak)}` }),
      status,
      el('div', { class: 'actions' }, say, close)));
  const done = () => {
    globalThis.speechSynthesis?.cancel();
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('hashchange', done);
    node.remove();
    back?.focus?.();
  };
  const onKey = (ev) => { if (ev.key === 'Escape') done(); };
  close.addEventListener('click', done);
  document.addEventListener('keydown', onKey);
  window.addEventListener('hashchange', done);
  document.body.append(node);
  close.focus();
  return node;
}
