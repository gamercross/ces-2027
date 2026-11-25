// 홈(안): 앱을 열면 처음 보이는 화면. 설정 home이 'first'나 'tab'일 때만 쓴다(꺼져 있으면 지금처럼 열면 지도다).
// 놓는 것은 셋뿐이다: ① "홈 화면에 추가" 안내 칸(아이폰 Safari 탭에서만, 닫을 수 있다. web/tips.js)
//   ② 지금 할 일 하나(명함이 없으면 명함 만들기, 있으면 갈 곳) ③ 자료 파일(data/home.json)에 적힌 안내 칸들.
// 첫 화면이라 가볍게 둔다: 전시사 자료는 읽지 않는다(갈 곳은 폰에 담아 둔 수만 센다).

import { el, out } from '../dom.js';
import { getInterests, getProfile } from '../store.js';
import { getHome, getSettings } from '../data.js';
import { tipBox } from '../tips.js';

// 자료 파일의 한 칸을 화면에 쓸 꼴로 고른다. 제목이 없거나 꼴이 틀린 칸은 버린다. 글은 세 줄까지.
export function cleanCards(data) {
  const cards = Array.isArray(data?.cards) ? data.cards : [];
  return cards.map((c) => {
    const title = typeof c?.title === 'string' ? c.title.trim() : '';
    if (!title) return null;
    const text = (Array.isArray(c.text) ? c.text : typeof c.text === 'string' ? [c.text] : []).filter((t) => typeof t === 'string' && t.trim()).slice(0, 3);
    const label = typeof c.action?.label === 'string' ? c.action.label.trim() : '';
    const href = typeof c.action?.href === 'string' ? c.action.href.trim() : '';
    const action = label && (/^#\//.test(href) || /^https:\/\//.test(href)) ? { label, href } : null;
    return { title, text, action };
  }).filter(Boolean);
}

// 지금 할 일 하나. 명함이 없으면 명함부터, 있으면 갈 곳(담은 곳이 없으면 지도에서 고르기).
export function oneThing(profile, interests) {
  if (!profile) return { title: '명함부터 만든다', text: '별명과 나만 있으면 된다. 이 폰에만 남는다.', label: '명함 만들기', href: '#/card' };
  const left = interests.filter((it) => !it.seen).length;
  if (!interests.length) return { title: '갈 곳을 고른다', text: '지도에서 회사를 찾아 담는다.', label: '지도 열기', href: '#/map' };
  return { title: left ? `갈 곳 ${left}곳` : '담은 곳을 다 다녀왔다', text: left ? '다음에 갈 곳과 길 안내가 있다.' : '지도에서 더 고를 수 있다.', label: left ? '갈 곳 열기' : '지도 열기', href: left ? '#/plan' : '#/map' };
}

function cardNode(c) {
  const link = c.action ? (c.action.href.startsWith('#/') ? el('a', { class: 'pick', href: c.action.href, text: c.action.label }) : out(c.action.href, c.action.label, 'pick')) : null;
  return el('section', { class: 'panel home-card' }, el('h2', { text: c.title }), ...c.text.map((t) => el('p', { text: t })), link ? el('div', { class: 'actions' }, link) : null);
}

export async function render() {
  const [settings, home] = await Promise.all([getSettings(), getHome().catch(() => null)]);
  const profile = getProfile();
  const page = el('div', { class: 'page homepage' }, el('section', { class: 'head' }, el('h1', { text: 'CES 2027 준비 지도' })));
  // 안내 칸: 설정 homeTip이 꺼져 있지 않으면 여기에 보인다(지도 위 칸을 이 화면으로 옮겼다). 명함 전이면 "먼저 …"로 말한다.
  if ((settings?.homeTip ?? 'off') !== 'off') { const box = tipBox(profile ? 'map' : 'home'); if (box) page.append(box); }
  // 지금 할 일 하나(설정 homeNow가 false면 안 그린다).
  if (settings?.homeNow !== false) {
    const now = oneThing(profile, getInterests());
    page.append(el('section', { class: 'panel home-now' }, el('h2', { text: now.title }), el('p', { class: 'lead', text: now.text }), el('a', { class: 'btn wide', href: now.href, text: now.label })));
  }
  for (const c of cleanCards(home)) page.append(cardNode(c));
  return page;
}
