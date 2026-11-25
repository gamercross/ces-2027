// 안내 한 칸: 글과 "언제 보이나"를 여기 한 곳에 둔다. 어느 화면에든 한 줄(tipLine)이나 닫을 수 있는 칸(tipBox)으로 붙인다.
// 지금은 "홈 화면에 추가" 하나뿐이다. 다른 안내가 생기면 TIPS에 한 줄을 더한다(칸은 늘 하나만 보인다: 위에서부터 첫 번째).

import { el } from './dom.js';
import { load, save } from './store.js';

// 아이폰 · 아이패드의 브라우저 탭으로 열렸나. 홈 화면 앱으로 열렸으면 null.
//   'safari': Safari 탭이다. 공유 단추에 "홈 화면에 추가"가 있다.
//   'inapp' : 카카오톡 같은 앱 안의 창이다. 먼저 Safari로 옮겨야 한다.
// 왜 알리나: 아이폰은 Safari 탭과 홈 화면 앱의 자료가 따로이고, 탭에만 둔 자료는 오래 안 쓰면 지워질 수 있다.
export function homeKind(nav = navigator, standalone = nav.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches) {
  if (standalone) return null;
  const ua = nav.userAgent || '';
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && nav.maxTouchPoints > 1);
  if (!ios) return null;
  return /KAKAOTALK|NAVER|Instagram|FBAN|FBAV|Line\/|DaumApps|CriOS|FxiOS|EdgiOS/i.test(ua) ? 'inapp' : 'safari';
}

// 안내들. where: 'card'(첫 명함 화면의 한 줄) · 'map'(지도 위의 칸).
export const TIPS = [
  {
    id: 'home',
    when: () => homeKind(),
    text: (kind, where) => (kind === 'inapp'
      ? 'Safari로 연 뒤 공유 단추에서 "홈 화면에 추가"를 누른다.'
      : where === 'card'
        ? '먼저 아래 공유 단추에서 "홈 화면에 추가"를 누른다. 그 아이콘으로 열어 명함을 만든다.'
        : '아래 공유 단추에서 "홈 화면에 추가"를 누른다. 인터넷 없이도 열린다.'),
  },
];

const CLOSED = 'tipsClosed.v1';
const closedIds = () => load(CLOSED, []);

// 지금 보일 안내 하나. 없으면 null. { id, text }
export function currentTip(where, ids = null) {
  const closed = closedIds();
  for (const tip of TIPS) {
    if (ids && !ids.includes(tip.id)) continue;
    if (where !== 'card' && closed.includes(tip.id)) continue;
    const kind = tip.when();
    if (kind) return { id: tip.id, text: tip.text(kind, where) };
  }
  return null;
}

// 한 줄(단추 없음). 보일 것이 없으면 null.
export function tipLine(where, ids) {
  const tip = currentTip(where, ids);
  return tip ? el('p', { class: 'tip-line', 'data-tip': tip.id, text: tip.text }) : null;
}

// 닫을 수 있는 칸 하나. 닫으면 이 폰에서는 다시 안 뜬다. 보일 것이 없으면 null.
export function tipBox(where, ids) {
  const tip = currentTip(where, ids);
  if (!tip) return null;
  const box = el('aside', { class: 'tip-box', 'data-tip': tip.id, role: 'note' },
    el('p', { text: tip.text }),
    el('button', { class: 'pick', type: 'button', text: '닫기', 'aria-label': '안내 닫기', onclick: () => {
      save(CLOSED, [...new Set([...closedIds(), tip.id])]);
      box.remove();
      window.dispatchEvent(new Event('resize'));
    } }));
  return box;
}
