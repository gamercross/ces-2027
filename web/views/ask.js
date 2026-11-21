// 물어볼 말: 한국어 질문을 고르면 영어가 보인다. 크게 띄우고 읽어 준다.
// 묶음의 질문은 미리 번역해 둔 자료(data/phrases.json)라 인터넷 없이도 된다.
// 직접 적은 글을 옮기는 일과 상대의 답을 받아 적는 일은 폰이 할 수 있을 때만 된다 (안 되면 안 된다고 보인다).

import { el, out } from '../dom.js';
import { getPhrases, getSettings } from '../data.js';
import { capabilities, speak, translate, translateLink } from '../speech.js';
import { capRows, capText, currentMode, modelBox, modePicker, showBig, startDictation, translationModelPicker } from '../talk-ui.js';
import { modelStatus } from '../speech-model.js';
import { translateStatus, translateText } from '../translate-model.js';

export async function render({ rest, go }) {
  const [phrases, settings] = await Promise.all([getPhrases(), getSettings()]);
  const mode = currentMode(settings);
  const caps = await capabilities(mode, undefined, await modelStatus(), await translateStatus());
  const back = rest[0] ? `#/listen/${rest[0]}` : null;
  let pack = phrases.packs[0];

  const sayRow = (en, ko) => el('div', { class: 'row-actions' },
    el('button', { class: 'say', type: 'button', text: '크게 띄우기', onclick: () => showBig(en, ko, mode, caps.speak) }),
    caps.speak.ok ? el('button', { class: 'say', type: 'button', text: '읽어 주기', onclick: () => speak(en, mode) }) : null);

  const list = el('ul', { class: 'stack' });
  const picks = el('div', { class: 'segs', role: 'group', 'aria-label': '질문 묶음' });
  function drawPack() {
    picks.replaceChildren(...phrases.packs.map((p) => el('button', { class: 'seg', type: 'button', text: p.ko, 'aria-pressed': p === pack ? 'true' : 'false', onclick: () => { pack = p; drawPack(); } })));
    list.replaceChildren(...pack.items.map((it) => el('li', { class: 'entry' },
      el('div', { class: 'name', text: it.ko }),
      el('p', { class: 'en', lang: 'en', text: it.en }),
      sayRow(it.en, it.ko))));
  }
  drawPack();

  // 글을 옮기는 칸 하나. from → to. 폰 안의 번역기가 없으면 안 된다고 보이고, 폰 밖 길(설정)일 때만 번역 사이트 링크를 준다.
  function turner(title, hint, from, to, withDictation) {
    const box = el('textarea', { rows: 3, maxlength: 600, placeholder: hint, lang: from, 'aria-label': title });
    const result = el('div', { class: 'block', 'aria-live': 'polite' });
    const status = el('p', { class: 'note', role: 'status' });
    const link = el('p', { class: 'note' });
    const paintLink = () => {
      if (mode !== 'device-service') return;
      const text = box.value.trim();
      link.replaceChildren(...(text ? [out(translateLink(text, from, to), '번역 사이트에서 열기'), ' (적은 글이 폰 밖, 구글 번역으로 나간다)'] : []));
    };
    box.addEventListener('input', paintLink);
    const turn = el('button', { class: 'btn', type: 'button', text: to === 'en' ? '영어로 바꾸기' : '한국어로 바꾸기', disabled: !caps.translate.ok || (caps.translate.engine === 'model' && to !== 'ko'), onclick: async () => {
      const text = box.value.trim();
      if (!text) { status.textContent = '먼저 글을 적는다.'; return; }
      status.textContent = '옮기는 중이다. 처음에는 번역 꾸러미를 받느라 오래 걸릴 수 있다.';
      const got = caps.translate.engine === 'model' ? await translateText(text) : await translate(text, from, to);
      if (!got) { status.textContent = '옮기지 못했다. 이 폰 안의 번역기가 이 말을 돕지 않는다.'; return; }
      status.textContent = '폰 안에서 옮긴 글이다. 틀릴 수 있다.';
      const en = to === 'en' ? got : text;
      const ko = to === 'en' ? text : got;
      result.replaceChildren(...[el('p', { class: 'en', lang: to, text: got }), to === 'en' ? sayRow(en, ko) : null].filter(Boolean));
    } });
    const big = from === 'en' ? null : el('button', { class: 'btn ghost', type: 'button', text: '적은 글 크게', onclick: () => { const t = box.value.trim(); if (t) showBig(t, '', mode, { ok: false, why: '한국어 글이다' }); else status.textContent = '먼저 글을 적는다.'; } });

    let session = null;
    const mic = withDictation ? el('button', { class: 'btn ghost', type: 'button', text: '받아 적기', disabled: !caps.dictate.ok }) : null;
    mic?.addEventListener('click', async () => {
      if (session) { const s = session; session = null; mic.textContent = '받아 적기'; status.textContent = '받아 적기를 멈추는 중이다.'; await s.stop(); status.textContent = '받아 적기를 멈췄다.'; return; }
      session = await startDictation(mode, caps.dictate, {
        onLine: (text) => { box.value = `${box.value}${box.value ? ' ' : ''}${text}`.slice(0, 600); paintLink(); },
        onInterim: (text) => { status.textContent = text ? `듣는 중: ${text}` : '듣는 중이다.'; },
        onEnd: (why) => { session = null; mic.textContent = '받아 적기'; status.textContent = `받아 적기가 멈췄다 (${why}). 마이크 허락과 인터넷을 본다.`; },
      });
      if (!session) { status.textContent = '받아 적기를 시작하지 못했다.'; return; }
      mic.textContent = '받아 적기 멈추기';
      status.textContent = '듣는 중이다.';
    });
    window.addEventListener('hashchange', () => session?.stop(), { once: true });

    return el('section', { class: 'panel' },
      el('h2', { text: title }),
      el('label', { class: 'field' }, el('span', { class: 'label', text: from === 'ko' ? '한국어로 적는다' : '영어를 적거나 받아 적는다' }), box),
      caps.translate.ok && !(caps.translate.engine === 'model' && to === 'en') ? null : el('p', { class: 'note', text: caps.translate.ok ? '글 옮기기: 폰 안 번역 모델은 영어를 한국어로만 옮긴다. 위 묶음의 질문은 미리 옮겨 두어 그대로 쓸 수 있다.' : `글 옮기기: ${capText(caps.translate)}.${to === 'en' ? ' 위 묶음의 질문은 미리 옮겨 두어 그대로 쓸 수 있다.' : ''}` }),
      withDictation && !caps.dictate.ok ? el('p', { class: 'note', text: `받아 적기: ${capText(caps.dictate)}. 손으로 적어도 된다.` }) : null,
      el('div', { class: 'actions' }, turn, mic, big),
      link, status, result);
  }

  return el('div', { class: 'page' },
    el('section', { class: 'panel' },
      el('h1', { text: '물어볼 말' }),
      el('p', { class: 'lead', text: '한국어 질문을 고르면 영어가 보인다. 크게 띄워 보여 주거나 읽어 준다. 묶음의 질문은 인터넷 없이도 된다.' }),
      back ? el('div', { class: 'actions' }, el('a', { class: 'btn ghost', href: back, text: '듣기로 돌아가기' })) : null),
    el('section', { class: 'panel notice' },
      el('h2', { text: '녹음하기 전에 알리는 말' }),
      el('div', { class: 'name', text: phrases.notice.ko }),
      el('p', { class: 'en', lang: 'en', text: phrases.notice.en }),
      sayRow(phrases.notice.en, phrases.notice.ko)),
    el('section', { class: 'panel' },
      el('h2', { text: '질문 묶음' }),
      picks, list,
      el('p', { class: 'note', text: '영어는 미리 옮겨 둔 초안이다. 어색한 말은 자료 파일(data/phrases.json)에서 고친다.' })),
    turner('직접 적어 묻기', '예: 이 로봇은 몇 시간 움직이나요?', 'ko', 'en', false),
    turner('상대의 답', '상대가 한 말을 적거나 받아 적는다', 'en', 'ko', true),
    el('section', { class: 'panel' },
      el('h2', { text: '이 폰에서 되는 것' }),
      capRows([['읽어 주기', caps.speak], ['글 옮기기', caps.translate], ['받아 적기', caps.dictate]]),
      caps.dictate.engine === 'model' ? modelBox(caps.dictate, () => go(location.hash)) : null,
      modePicker(mode, () => go(location.hash)),
      translationModelPicker(settings, () => go(location.hash))));
}
