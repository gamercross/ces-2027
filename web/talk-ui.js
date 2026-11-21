// 물어볼 말 · 듣기 화면이 같이 쓰는 조각: 크게 띄우기, "이 폰에서 되는 것" 줄.

import { el } from './dom.js';
import { load, save } from './store.js';
import { allowedMode, dictate, modeOf, SERVICE_NOTE, speak } from './speech.js';

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

// 영한 번역 모델 후보는 기본으로 끈다. 라이선스와 크기는 고정했지만 package_check와
// 브라우저 회귀 시험이 끝나기 전에는 받기 단추를 켜지 않는다.
export function translationModelPicker(settings) {
  const box = el('div', { class: 'block' });
  const enabled = settings?.translationModel === 'on';
  box.replaceChildren(
    el('div', { class: 'label', text: '폰 안 영한 번역 모델' }),
    el('div', { class: 'segs', role: 'group', 'aria-label': '폰 안 영한 번역 모델' },
      el('button', { class: 'seg', type: 'button', text: '끄기', 'aria-pressed': !enabled ? 'true' : 'false', onclick: () => { save('translationModel.v1', 'off'); draw(); } }),
      el('button', { class: 'seg', type: 'button', text: '받기 후보 · 아직 못 받음', disabled: true, 'aria-pressed': enabled ? 'true' : 'false' })),
    el('p', { class: 'note', text: '기본 끔. 후보는 Helsinki-NLP/opus-mt-tc-big-en-ko의 ONNX 변환본(CC-BY-4.0), 약 235 MiB이다. package_check와 회귀 시험이 끝나지 않아 아직 받지 않는다.' }));
  function draw() {
    box.querySelectorAll('button')[0].setAttribute('aria-pressed', load('translationModel.v1', 'off') === 'off' ? 'true' : 'false');
  }
  return box;
}

// 받아쓰기를 시작한다: 폰이 가진 것으로, 아니면 받아 둔 폰 안 모델로. 돌려주는 것: { stop() } 또는 null.
export async function startDictation(mode, cap, handlers, stream) {
  if (cap.engine === 'model') {
    try { const m = await import('./speech-model.js'); return await m.startModelDictation(handlers, stream); } catch { return null; }
  }
  return dictate(mode, cap.local, handlers, undefined, stream?.getAudioTracks()[0]);
}

// 폰 안 받아쓰기 모델을 받는 칸. 받기 전에 크기와 받는 곳을 보이고 확인받는다. 끝나면 onDone()을 부른다.
export function modelBox(cap, onDone) {
  const box = el('div', { class: 'block' });
  const status = el('p', { class: 'note', role: 'status' });
  async function download(button) {
    button.disabled = true;
    try {
      const m = await import('./speech-model.js');
      await m.downloadModel(({ loaded, total }) => { status.textContent = `받는 중이다: ${m.toMB(loaded)} / ${m.toMB(total)}MB. 이 화면을 열어 둔다.`; });
      status.textContent = '다 받았다. 이제 인터넷 없이도 받아 적는다.';
      onDone();
    } catch (e) {
      button.disabled = false;
      status.textContent = `받지 못했다 (${String(e.message || e).slice(0, 80)}). 인터넷을 보고 다시 누른다. 받다 만 것은 이어서 받는다.`;
    }
  }
  function draw(asking) {
    box.replaceChildren(...[
      cap.downloadable && !asking ? el('div', { class: 'actions' }, el('button', { class: 'btn ghost', type: 'button', text: `폰 안 받아쓰기 모델 받기 (약 ${cap.mb}MB)`, onclick: () => draw(true) })) : null,
      cap.downloadable && asking ? el('div', { class: 'panel band ask', role: 'alertdialog', 'aria-label': '폰 안 받아쓰기 모델 받기' },
        el('p', {}, el('b', { text: `약 ${cap.mb}MB를 받는다. 와이파이에서 받기를 권한다.` }), ' 한 번 받으면 이 폰에 남아 인터넷 없이도 된다. 영어만 받아 적는다.'),
        el('p', { class: 'note', text: '모델 파일은 huggingface.co에서 받는다. 내 소리와 글은 어디로도 보내지 않는다. 받은 것은 이 화면에서 지울 수 있다.' }),
        el('div', { class: 'actions' },
          el('button', { class: 'btn', type: 'button', text: '받는다', onclick: (ev) => download(ev.target) }),
          el('button', { class: 'btn ghost', type: 'button', text: '그만둔다', onclick: () => draw(false) }))) : null,
      cap.engine === 'model' && cap.ok ? el('div', { class: 'row-actions' }, el('span', { class: 'note', text: '폰 안 받아쓰기 모델이 이 폰에 있다.' }), el('button', { class: 'linkish', type: 'button', text: '모델 지우기', onclick: async () => {
        const m = await import('./speech-model.js');
        await m.removeModel();
        onDone();
      } })) : null,
      status,
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
