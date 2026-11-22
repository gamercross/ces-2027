// 번역 앱 열기 조각: 단추 · 대화 기록 복사하는 법. 회사 카드 · 부스 카드 · 물어볼 말 · 대화 칸 · 번역 앱 화면이 같이 쓴다.
// 첫 화면이 싣지 않는다 (회사 · 지도 · 물어볼 말 화면과 같이 누를 때 불러온다).

import { el, out } from './dom.js';
import { load, save } from './store.js';
import { APP_LIST, appOf, DEFAULT_APP, openedNote, openTranslator, pickText } from './translator.js';

export const currentApp = () => appOf(load('translatorApp.v1', DEFAULT_APP)).k;
export const setCurrentApp = (k) => save('translatorApp.v1', appOf(k).k);

// 단추 하나: 고른 글(없으면 getText의 글)을 복사해 두고 쓰는 번역 앱을 연다. 위 단추 아래에 한 줄로 알린다.
// appKey를 주면 그 앱으로, 안 주면 내가 정해 둔 앱(기본 파파고)으로 연다.
export function translatorButton({ getText, appKey, label, cls = 'btn ghost' }) {
  const note = el('span', { class: 'note', role: 'status' });
  const k = () => appKey || currentApp();
  const button = el('button', { class: cls, type: 'button', text: label || '번역 앱 열기', onclick: async () => {
    const text = pickText(getText ? getText() : '');
    note.textContent = '여는 중이다.';
    try { note.textContent = openedNote(await openTranslator(k(), text)); } catch { note.textContent = '열지 못했다. 번역 앱을 직접 연다.'; }
  } });
  return { button, note };
}

// 줄 안에 두는 작은 단추 (회사 카드 · 부스 카드). 알림 글은 줄 아래로 간다.
export function translatorRow(getText) {
  const { button, note } = translatorButton({ getText, label: '번역 앱', cls: 'linkish' });
  return { button, note };
}

// 대화 기록 복사하는 법. 버튼 이름은 앱 판마다 다를 수 있다. 실제 폰에서 확인한 것이 아니다.
export function copyGuide() {
  return el('details', { class: 'more' },
    el('summary', { text: '파파고 · 구글 번역에서 대화 기록 복사하는 법' }),
    el('p', { class: 'note', text: '번역 앱의 대화 화면에서 글을 복사해 이 칸에 붙여 넣는다. 녹음하지 않아도 된다. 앱 판마다 버튼 이름이 다를 수 있고, 실제 폰에서는 아직 확인하지 않았다.' }),
    el('div', { class: 'block' },
      el('h3', { text: '파파고' }),
      el('ol', { class: 'dots' },
        el('li', { text: '대화를 한 뒤 대화 화면에서 말풍선 하나를 길게 누른다. "복사"가 보이면 누른다.' }),
        el('li', { text: '여러 줄을 한꺼번에 복사하는 메뉴(공유 · 내보내기)가 있으면 그것으로 복사한다. 없으면 말풍선을 위에서부터 하나씩 복사해 붙여 넣는다.' }),
        el('li', { text: '이 칸에 붙여 넣는다. 원문과 번역이 번갈아 있으면 짝으로 나뉜다.' }))),
    el('div', { class: 'block' },
      el('h3', { text: '구글 번역' }),
      el('ol', { class: 'dots' },
        el('li', { text: '대화 모드의 말풍선을 길게 누르거나 글자를 눌러 선택한다. "복사"가 보이면 누른다.' }),
        el('li', { text: '받아 적기(전사) 화면이면 글을 눌러 "전체 선택" 다음 "복사"를 누른다.' }),
        el('li', { text: '이 칸에 붙여 넣는다.' })),
      el('p', { class: 'note' }, out('https://support.google.com/translate/answer/9724492?hl=ko', '구글 번역: 받아 적기 글 복사 (공식 도움말)'))),
    el('p', { class: 'note', text: '줄이 번갈아 나오지 않거나 한쪽 말뿐이면 짝을 짓지 않고 그대로 한 덩어리로 둔다. 이름표(영어: · 한국어:)나 시간은 알아서 뗀다.' }));
}

export { APP_LIST };
