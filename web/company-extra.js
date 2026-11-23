// 회사 카드에 더하는 두 줄 묶음: "부스 자리마다 한 줄"과 "이 회사 강연"(공식 일정의 세션).
// 지도의 회사 카드와 갈 곳의 회사 카드가 같이 쓴다. 줄 모양은 `.pick-row`(높이 56px 이상, 줄 전체가 눌린다).

import { el } from './dom.js';
import { getSessions } from './data.js';
import { splitBooth } from './route.js';

// 부스가 둘 이상인 회사: 자리마다 한 줄 "홀 이름 · 부스 번호". 하나뿐이면 null(카드가 이미 한 줄로 보인다).
// nameOfPlace(장소 기호) → 보일 이름. now는 지금 보고 있는 부스("글@장소" 꼴)이고, pick(부스)을 주면 줄을 눌러 그 자리로 간다.
// 열 곳이 넘는 큰 회사는 앞의 넷만 먼저 보이고, "나머지 보기"로 펼친다(지금 보는 부스는 늘 보인다).
const FIRST_BOOTHS = 4;
export function boothLines(booths, nameOfPlace, { now, pick } = {}) {
  if ((booths || []).length < 2) return null;
  const box = el('div', { class: 'card-booths' });
  let all = false;
  const paint = () => {
    const keep = booths.filter((b, i) => all || i < FIRST_BOOTHS || b === now);
    box.replaceChildren(
      el('p', { class: 'label', text: `부스 ${booths.length}곳` }),
      el('ul', { class: 'pick-list', 'aria-label': '이 회사의 부스 자리' }, keep.map(line)),
      ...(booths.length > FIRST_BOOTHS ? [el('button', { class: 'linkish', type: 'button', text: all ? '접기' : `나머지 ${booths.length - keep.length}곳 보기`, onclick: () => { all = !all; paint(); } })] : []));
  };
  const line = (b) => {
    const { code, place } = splitBooth(b);
    const text = `${nameOfPlace(place) || '장소 모름'} · 부스 ${code}`;
    const here = b === now;
    if (!pick) return el('li', { class: 'pick-row static', text });
    return el('li', {}, el('button', { class: 'pick-row', type: 'button', 'aria-current': here ? 'true' : null, 'aria-label': `${text}${here ? ' (지금 보는 곳)' : ' 보기'}`, onclick: () => pick(b) },
      el('b', { text }), here ? el('span', { text: '지금 보는 곳' }) : null));
  };
  paint();
  return box;
}

// 세션 셈(sessions.js)은 누를 때 불러온다: 첫 화면 조각에 싣지 않는다.
let indexOnce = null;
const partyIndex = () => (indexOnce ||= Promise.all([getSessions(), import('./sessions.js')])
  .then(([doc, S]) => ({ S, index: S.indexByParty(doc.items) }))
  .catch((e) => { indexOnce = null; throw e; }));

const FIRST = 3;

// 이 회사 강연: 제목 + 때 · 날짜 · 곳. 줄을 누르면 공식 세션 쪽이 열린다.
// 자료를 받는 동안과 맞는 강연이 없을 때(또는 일정을 받아 두지 못했을 때)는 숨겨 둔다.
// compact(갈 곳의 회사 카드): 누르는 줄 없이 한 칸에 "이 회사 강연 n개"와 때 · 곳만 보인다(둘까지, 나머지는 강연 일정에서).
export function sessionBlock(companyName, { compact = false } = {}) {
  const box = el('section', { class: compact ? 'card-sessions compact' : 'card-sessions', hidden: true, 'aria-label': '이 회사 강연' });
  partyIndex().then(({ S, index }) => {
    const list = S.forCompany(index, companyName);
    if (!list.length) return;
    if (compact) {
      box.replaceChildren(
        el('p', { class: 'sessions-title', text: `이 회사 강연 ${list.length}개` }),
        ...list.slice(0, 2).map((s) => el('p', { class: 'note', text: S.whenWhere(s) })),
        ...(list.length > 2 ? [el('p', { class: 'note', text: `외 ${list.length - 2}개는 강연 일정에서 본다` })] : []));
      box.hidden = false;
      return;
    }
    let all = false;
    const paint = () => {
      const shown = all ? list : list.slice(0, FIRST);
      box.replaceChildren(
        el('p', { class: 'label', text: `이 회사 강연 ${list.length}개 · 라스베이거스 시각` }),
        el('ul', { class: 'pick-list' }, shown.map((s) => el('li', {}, el('a', { class: 'pick-row', href: s.url, target: '_blank', rel: 'noopener noreferrer', 'aria-label': `${s.title}, ${S.whenWhere(s)}. 공식 쪽에서 열린다` },
          el('b', { text: s.title }), el('span', { text: S.whenWhere(s) }))))),
        ...(list.length > FIRST ? [el('button', { class: 'linkish', type: 'button', text: all ? '접기' : `강연 ${list.length - FIRST}개 더 보기`, onclick: () => { all = !all; paint(); } })] : []),
        el('p', { class: 'note', text: '강연 제목에 회사 이름이 밝혀진 것만 보인다.' }));
    };
    paint();
    box.hidden = false;
  }).catch(() => { /* 일정을 받아 두지 못했으면 줄을 숨긴 채 둔다 */ });
  return box;
}
