import { el, out } from '../dom.js';
import { getTransport } from '../data.js';

export async function render() {
  const data = await getTransport();
  return el('div', { class: 'page' },
    el('section', { class: 'panel' },
      el('h1', { text: '이동과 셔틀' }),
      el('p', { class: 'lead', text: 'CES 공식 셔틀 노선과 타는 곳을 모았다.' }),
      el('small', { class: 'proof' }, `${data.read || '확인 날짜 없음'} 확인 · `, out(data.source.url, data.source.ko))),
    el('section', { class: 'panel' },
      el('ul', { class: 'stack' }, (data.items || []).map((it) => el('li', { class: 'entry' },
        el('div', { class: 'name', text: it.name }),
        el('p', { text: `${it.route} · ${it.days}` }),
        el('p', { class: 'note', text: `타는 곳: ${it.board}` }),
        el('p', { class: 'note', text: `시간: ${it.hours}` }),
        el('div', { class: 'row-actions' }, out(it.source, '공식 교통 안내')),
        it.status === 'check' ? el('span', { class: 'tag', text: '확인 필요' }) : null)))));
}
