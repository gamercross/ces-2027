// 번역 앱 준비: 영어 ↔ 한국어 번역은 번역 앱(파파고 · 구글 번역)이 한다. 출발 전에 앱을 깔고 한국어 · 영어 오프라인 팩을 받아 둔다.
// 이 앱은 번역하지 않는다: 글을 복사해 두고 번역 앱을 열어 줄 뿐이다. 체크한 것은 이 폰에만 남는다.

import { el, out } from '../dom.js';
import { load, save } from '../store.js';
import { APP_LIST } from '../translator.js';
import { copyGuide, currentApp, setCurrentApp, translatorButton } from '../translator-ui.js';

export async function render() {
  const done = load('translatorPrep.v1', {});
  const mark = (key, on) => { const next = { ...load('translatorPrep.v1', {}), [key]: on }; save('translatorPrep.v1', next); };

  const check = (key, label) => {
    const box = el('input', { type: 'checkbox', checked: !!done[key] });
    box.addEventListener('change', () => mark(key, box.checked));
    return el('label', { class: 'toggle' }, box, el('span', { text: label }));
  };

  const cards = APP_LIST.map((app) => el('section', { class: 'panel' },
    el('h2', { text: app.ko }),
    el('ol', { class: 'dots' },
      el('li', {}, el('b', { text: '앱 깔기' }), ' 안드로이드 ', out(app.android, '플레이 스토어'), ' · 아이폰 ', out(app.ios, '앱 스토어')),
      el('li', {}, el('b', { text: '오프라인 팩' }), ` (와이파이에서). ${app.offline}.`),
      el('li', {}, el('b', { text: '공식 도움말' }), ' ', out(app.help.url, app.help.ko))),
    check(`${app.k}App`, `${app.ko} 앱을 깔았다`),
    check(`${app.k}Pack`, `${app.ko} 한국어 · 영어 오프라인 팩을 받았다`)));

  const sample = el('textarea', { rows: 3, maxlength: 600, placeholder: '번역할 글을 적는다 (비워도 앱은 열린다)', 'aria-label': '번역 앱에 넘길 글' });
  const trial = APP_LIST.map((app) => translatorButton({ getText: () => sample.value, appKey: app.k, label: `${app.ko}로 열기`, cls: 'btn ghost' }));
  const pref = el('div', { class: 'segs', role: 'group', 'aria-label': '카드의 번역 앱 단추가 여는 앱' });
  const drawPref = () => pref.replaceChildren(...APP_LIST.map((app) => el('button', { class: 'seg', type: 'button', text: app.ko, 'aria-pressed': currentApp() === app.k ? 'true' : 'false', onclick: () => { setCurrentApp(app.k); drawPref(); } })));
  drawPref();

  return el('div', { class: 'page' },
    el('section', { class: 'panel' },
      el('h1', { text: '번역 앱 준비' }),
      el('p', { class: 'lead', text: '번역은 파파고 · 구글 번역으로 한다. 출발 전에 깔고 오프라인 팩을 받아 둔다.' }),
      el('p', { class: 'note', text: '이 앱은 번역하지 않는다. 단추가 글을 복사하고 번역 앱을 연다.' })),
    cards,
    el('section', { class: 'panel' },
      el('h2', { text: '지금 열어 보기' }),
      sample,
      el('div', { class: 'actions' }, ...trial.map((t) => t.button)),
      ...trial.map((t) => t.note),
      el('div', { class: 'field' }, el('span', { class: 'label', text: '카드의 "번역 앱" 단추가 여는 앱' }), pref)),
    el('section', { class: 'panel' },
      el('h2', { text: '대화 기록' }),
      el('p', { class: 'note', text: '대화한 뒤 기록을 회사의 "대화" 칸에 붙여 넣는다.' }),
      copyGuide(),
      el('div', { class: 'actions' }, el('a', { class: 'btn ghost', href: '#/find', text: '회사에서 대화 넣기' }))),
    el('p', { class: 'foot' }, '앱 안 번역 모델은 ', el('a', { href: '#/deep', text: '깊은 설정' }), '(기본 꺼짐).'));
}
