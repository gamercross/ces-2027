// 깊은 설정: 앞 화면에서 권하지 않는 실험. 영어 ↔ 한국어 번역은 번역 앱으로 하고(번역 앱 준비), 폰 안 영한 번역 모델은 여기에만 둔다. 기본 꺼짐.

import { el } from '../dom.js';
import { getSettings } from '../data.js';
import { translationModelPicker } from '../talk-ui.js';

export async function render() {
  const settings = await getSettings();
  return el('div', { class: 'page' },
    el('section', { class: 'panel' },
      el('h1', { text: '깊은 설정' }),
      el('p', { class: 'lead', text: '실험으로 쓰는 것들이다. 번역은 번역 앱으로 한다. 앞 화면은 이것을 권하지 않는다.' }),
      el('div', { class: 'actions' }, el('a', { class: 'btn ghost', href: '#/translate', text: '번역 앱 준비' }))),
    el('section', { class: 'panel' },
      el('h2', { text: '폰 안 영한 번역 모델 (기본 꺼짐)' }),
      el('p', { class: 'note', text: '영어를 한국어로만 옮기고 약 250MB를 받는다. 폰의 메모리가 모자라 탭이 닫힐 수 있고 아이폰에서는 확인하지 않았다. 듣기에서 영어 줄을 한국어로 옮길 때만 쓴다.' }),
      translationModelPicker(settings, () => {})));
}
