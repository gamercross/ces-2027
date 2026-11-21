// 물어볼 말 · 듣기 화면이 같이 쓰는 조각: 크게 띄우기, "이 폰에서 되는 것" 줄.

import { el } from './dom.js';
import { speak } from './speech.js';

export const MODE_KO = { 'on-device': '폰 안에서만', 'device-service': '폰의 음성 인식 서비스' };

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
