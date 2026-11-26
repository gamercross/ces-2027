// 홈: 앱을 열면 처음 보이는 화면. 아래 탭 다섯의 가운데이고(11/26), 머리의 앱 이름을 눌러도 온다.
// 놓는 것은 셋뿐이다: ① "홈 화면에 추가" 안내 칸(아이폰 Safari 탭에서만, 닫을 수 있다. web/tips.js)
//   ② 지금 할 일 하나(명함이 없으면 명함 만들기, 있으면 갈 곳) ③ 자료 파일(data/home.json)에 적힌 안내 칸들.
// 할 일 아래에 "한눈에 보기"(11/26 이재엽이 고름): 다른 탭을 한 줄씩(갈 곳 · 일기 · 만난 사람 · 내 명함). 명함을 만든 뒤에만 보인다.
// 첫 화면이라 가볍게 둔다: 전시사 자료는 읽지 않는다(갈 곳은 폰에 담아 둔 수만 센다).

import { el, out } from '../dom.js';
import { getDiary, getInterests, getProfile } from '../store.js';
import { getExhibitors, getHome, getInfo } from '../data.js';
import { getPeople } from '../people-store.js';
import { dayList } from '../days.js';
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

const todayStr = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// 한눈에 보기의 갈 곳 줄: 오늘이 전시 날이면 오늘, 아니면 남은 곳이 있는 첫 날(갈 곳 탭이 처음 여는 날과 같은 차례).
// 돌려주는 것: { text, nextId } — 다음 곳의 이름은 전시사 자료를 읽은 뒤에 채운다.
export function planLine(interests, info, today = todayStr()) {
  if (!interests.length) return { text: '아직 담은 곳이 없다', nextId: null };
  const days = info ? dayList(info).filter((d) => !d.pre) : [];
  const left = (key) => interests.filter((it) => (it.day || 0) === key && !it.seen);
  const now = days.find((d) => d.date === today);
  const day = now || days.find((d) => left(d.key).length);
  if (!day) { const undated = left(0).length; return { text: undated ? `날짜 없는 곳 ${undated}곳` : '담은 곳을 다 다녀왔다', nextId: null }; }
  const rest = left(day.key);
  if (!rest.length) return { text: `${now ? '오늘' : day.ko} 남은 곳 없음`, nextId: null };
  return { text: `${now ? '오늘' : day.ko} 남은 ${rest.length}곳`, nextId: rest[0].id };
}

// 한눈에 보기의 일기 줄: 오늘 적은 수 · 아직 보내지 않은 수(초안은 빼고 센다).
export function diaryLine(diary, today = todayStr()) {
  if (!diary.length) return '아직 없다';
  const ready = diary.filter((e) => !e.draft);
  return `오늘 ${diary.filter((e) => e.date === today).length}개 · 보내지 않은 ${ready.filter((e) => !e.sent).length}개`;
}

const chevron = () => { const NS = 'http://www.w3.org/2000/svg'; const s = document.createElementNS(NS, 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); const p = document.createElementNS(NS, 'path'); p.setAttribute('d', 'm9 5 7 7-7 7'); s.append(p); return s; };

function glance(info) {
  const rows = [];
  const plan = planLine(getInterests(), info);
  const planText = el('span', { text: plan.text });
  rows.push(['갈 곳', planText, '#/plan']);
  rows.push(['일기', el('span', { text: diaryLine(getDiary()) }), '#/diary']);
  const met = getPeople().length;
  rows.push(['만난 사람', el('span', { text: met ? `${met}명` : '아직 없다' }), '#/people']);
  rows.push(['내 명함', el('span', { text: 'QR 보기' }), '#/card']);
  // 다음 곳의 이름: 전시사 자료는 첫 화면을 그린 뒤에 읽는다(첫 화면 2초).
  if (plan.nextId) getExhibitors().then((d) => { const row = d?.ex?.find((r) => r[0] === plan.nextId); if (row) planText.textContent = `${plan.text} · 다음 ${row[1]}`; }).catch(() => {});
  return el('section', { class: 'panel glance' }, el('h2', { text: '한눈에 보기' }),
    el('ul', {}, ...rows.map(([name, text, href]) => el('li', {}, el('a', { href }, el('b', { text: name }), text, chevron())))));
}

function cardNode(c) {
  const link = c.action ? (c.action.href.startsWith('#/') ? el('a', { class: 'pick', href: c.action.href, text: c.action.label }) : out(c.action.href, c.action.label, 'pick')) : null;
  return el('section', { class: 'panel home-card' }, el('h2', { text: c.title }), ...c.text.map((t) => el('p', { text: t })), link ? el('div', { class: 'actions' }, link) : null);
}

export async function render() {
  const [home, info] = await Promise.all([getHome().catch(() => null), getInfo().catch(() => null)]);
  const profile = getProfile();
  const page = el('div', { class: 'page homepage' }, el('section', { class: 'head' }, el('h1', { text: 'CES 2027 준비 지도' })));
  // 안내 칸: 아이폰 Safari 탭으로 열렸을 때만 "홈 화면에 추가"가 보인다(닫을 수 있다). 명함 전이면 "먼저 …"로 말한다. 이 안내는 여기에만 있다.
  const box = tipBox(profile ? 'after' : 'before');
  if (box) page.append(box);
  // 지금 할 일 하나.
  const now = oneThing(profile, getInterests());
  page.append(el('section', { class: 'panel home-now' }, el('h2', { text: now.title }), el('p', { class: 'lead', text: now.text }), el('a', { class: 'btn wide', href: now.href, text: now.label })));
  if (profile) page.append(glance(info));
  for (const c of cleanCards(home)) page.append(cardNode(c));
  return page;
}
