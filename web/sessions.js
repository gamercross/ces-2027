// 세션 일정: 공식 일정(data/sessions.json)을 날짜별로 나누고 · 낱말로 찾고 · 내 일정에 넣고 빼는 셈.
// 화면과 따로 두어 Node에서도 시험한다. 내 일정은 깊게 4와 같은 자리(store.js의 getEvents/setEvents, days.js의 cleanEvent)를 쓴다.

import { cleanEvent } from './days.js';

// 내 일정에 넣은 세션은 이 이름표로 알아본다 (파일로 주고받아도 같은 세션이면 겹치지 않는다).
export const eventId = (s) => `ses-${s.id}`;
export const isIn = (s, events) => events.some((e) => e.id === eventId(s));

// 내 일정 한 줄로. 꼴이 맞지 않으면 null.
export function asEvent(s) {
  // 일정 이름은 60자까지다. 넘으면 59자와 "…"로 줄여 끊긴 글이 되지 않게 한다. 장소는 80자까지.
  const name = s.title.length > 60 ? `${s.title.slice(0, 59)}…` : s.title;
  return cleanEvent({ id: eventId(s), date: s.date, from: s.from, to: s.to, name, place: s.place });
}

// 넣거나 뺀다. { events, added } — 이미 있으면 빼고, 없으면 넣는다. 넣을 수 없는 꼴이면 그대로 돌려주고 added는 null.
export function toggle(s, events) {
  if (isIn(s, events)) return { events: events.filter((e) => e.id !== eventId(s)), added: false };
  const ev = asEvent(s);
  return ev ? { events: [...events, ev], added: true } : { events, added: null };
}

// 받은 자료가 쓸 만한 꼴인가. 아니면 null (화면은 "받지 못했다"를 보인다).
export function clean(data) {
  if (!data || !Array.isArray(data.items) || !data.items.length || !/^\d{4}-\d\d-\d\d/.test(data.v || '')) return null;
  const items = data.items.filter((s) => s && s.id && /^\d{4}-\d\d-\d\d$/.test(s.date) && s.title && /^\d\d:\d\d$/.test(s.from) && /^\d\d:\d\d$/.test(s.to) && /^https:\/\/www\.ces\.tech\//.test(s.url));
  return items.length ? { ...data, items } : null;
}

export const daysOf = (items) => [...new Set(items.map((s) => s.date))].sort();
export const onDay = (items, date) => items.filter((s) => s.date === date).sort((a, b) => a.from.localeCompare(b.from) || a.title.localeCompare(b.title));

const haystack = (s) => `${s.title} ${s.place} ${s.track} ${(s.topics || []).join(' ')}`.toLowerCase();
// 낱말로 찾는다: 띄어 쓴 낱말이 모두 들어 있는 것. 제목 · 곳 · 트랙 · 주제에서 찾는다. 빈 글이면 전부.
export function search(items, query) {
  const words = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return items;
  return items.filter((s) => { const h = haystack(s); return words.every((w) => h.includes(w)); });
}

// 두 때가 겹치는가: 같은 날이고, 하나가 끝나기 전에 다른 하나가 시작한다. 끝과 시작이 맞닿는 것은 겹치지 않는다.
export const overlaps = (a, b) => a.date === b.date && a.from < b.to && b.from < a.to;

// 내 주제 이름과 분야를 세션 제목 · 트랙 · 주제와 맞추고, 날짜와 시간에 맞춰 고른다.
// 점수가 높은 것부터 담되, 내 일정 · 이미 고른 세션과 때가 겹치는 것은 건너뛴다. 아직 자료 밖의 관심은 만들지 않는다.
// 돌려주는 것: 날짜 · 시간 차례의 열 곳 이하. skipped(건너뛴 수)는 두 번째 인자 없이 쓰려면 recommendWithSkips를 쓴다.
export function recommendWithSkips(items, topics, events = [], limit = 10) {
  const words = [...new Set((topics || []).flatMap((topic) => [
    ...String(topic.name || '').toLowerCase().split(/\s+/),
    ...(topic.cats || []).map((cat) => String(cat).toLowerCase()),
  ]).map((word) => word.trim()).filter((word) => word.length >= 2))];
  if (!words.length) return { picks: [], skipped: 0 };
  const mine = (events || []).map((e) => ({ date: e.date, from: e.from, to: e.to, id: e.id }));
  const ranked = items.map((session) => {
    const hay = haystack(session);
    const score = words.reduce((sum, word) => sum + (hay.includes(word) ? 1 : 0), 0);
    return { session, score };
  }).filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.session.date.localeCompare(b.session.date) || a.session.from.localeCompare(b.session.from));
  const picks = [];
  let skipped = 0;
  for (const { session } of ranked) {
    if (picks.length >= limit) break;
    // 이미 내 일정에 넣은 세션은 자기 자신과 겹친 것으로 보지 않는다.
    const clash = mine.some((e) => e.id !== eventId(session) && overlaps(e, session)) || picks.some((p) => overlaps(p, session));
    if (clash) { skipped += 1; continue; }
    picks.push(session);
  }
  picks.sort((a, b) => a.date.localeCompare(b.date) || a.from.localeCompare(b.from));
  return { picks, skipped };
}
export const recommend = (items, topics, events = [], limit = 10) => recommendWithSkips(items, topics, events, limit).picks;

// 세션 하나를 남에게 건네는 글: 제목 · 날짜와 때 · 곳 · 공식 쪽 링크. 우리 서버는 거치지 않는다(받는 쪽이 공식 쪽을 연다).
const WEEK = '일월화수목금토';
export function shareText(s) {
  const [, m, d] = s.date.split('-').map(Number);
  const w = WEEK[new Date(`${s.date}T00:00:00`).getDay()];
  return `${s.title}\n${m}/${d} (${w}) ${s.from} ~ ${s.to} 라스베이거스 시각${s.place ? ` · ${s.place}` : ''}\n${s.url}`;
}

// 기조연설 먼저 보려면: 제목이 "Keynote"로 시작하는 것 (공식 제목 규칙).
export const isKeynote = (s) => /^keynote\b/i.test(s.title);

// ---- 거르기 (공식 앱 일정의 "거르기 · 주요" 칩에 맞춘 것)
// f: { keynote, live, mine, topics: [주제 이름] | null }. 내 일정(mine)은 events로 본다.
export function filterSessions(items, f = {}, events = []) {
  return items.filter((s) => (!f.keynote || isKeynote(s)) && (!f.live || s.live) && (!f.mine || isIn(s, events))
    && (!f.topics || (s.topics || []).some((t) => f.topics.includes(t))));
}
// 분야 묶음: 분야표(data/categories.json)의 묶음 차례대로, 묶음에 없는 주제는 끝의 "그 밖"으로. 세션이 없는 묶음은 뺀다.
// 돌려주는 것: [{ k, ko, topics, n }] (n은 그 묶음 주제가 하나라도 있는 세션 수)
export function topicGroups(items, groups = []) {
  const all = [...new Set(items.flatMap((s) => s.topics || []))];
  const used = new Set(groups.flatMap((g) => g.cats || []));
  const out = groups.map((g) => ({ k: g.k, ko: g.ko, topics: (g.cats || []).filter((t) => all.includes(t)) }));
  const rest = all.filter((t) => !used.has(t)).sort();
  if (rest.length) out.push({ k: 'etc', ko: '그 밖', topics: rest });
  return out.map((g) => ({ ...g, n: items.filter((s) => (s.topics || []).some((t) => g.topics.includes(t))).length })).filter((g) => g.n > 0);
}

// ---- 회사와 세션 잇기
// 공식 자료에는 회사와 세션을 잇는 값이 없다. 그래서 짐작하지 않고, 세션 제목이 스스로 밝힌 이름이 회사 이름과 "같을 때만" 잇는다.
// 제목이 이름을 밝히는 자리는 셋이다: 끝의 "presented by 이름" · "hosted by 이름", 끝의 괄호 "(이름 and 이름)", 기조연설 제목("Keynote - 이름 Keynote").
// 제목 속에 이름이 들어 있다는 것만으로는 잇지 않는다 (예: 회사 이름이 "The Future"인 줄이 "…the Future of…" 세션에 붙으면 안 된다).
const LEGAL = /\s(inc|incorporated|corp|corporation|co|ltd|limited|llc|gmbh|sa|ag|plc|company|holdings)$/;

// 이름을 견주는 꼴: 소문자 · 악센트 뗌 · 기호는 빈칸 · "&"는 and · 끝의 회사 형태(Inc. Co. Ltd …)는 뗌. 세 글자 미만이면 ''(견주지 않는다).
export function nameKey(name) {
  let s = String(name || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9가-힣]+/g, ' ').trim();
  while (LEGAL.test(s)) s = s.replace(LEGAL, '').trim();
  return s.length >= 3 ? s : '';
}

const splitNames = (text) => String(text || '').split(/\s*(?:,|&|;|\band\b)\s*/i).map((x) => x.trim()).filter(Boolean);

// 세션 제목이 스스로 밝힌 이름들(견주는 꼴).
export function partiesOf(title) {
  const t = String(title || '').trim();
  const out = [];
  const by = /(?:presented|hosted|sponsored) by\s+(.+)$/i.exec(t);
  if (by) out.push(...splitNames(by[1]));
  const paren = /\(([^()]+)\)\s*$/.exec(t);
  if (paren) out.push(...splitNames(paren[1]));
  const key = /^keynote\s*[-–:]\s*(.+)$/i.exec(t);
  if (key) {
    for (const part of String(key[1]).split(/\s*(?:\band\b|:|&)\s*/i)) {
      const name = part.replace(/\bkeynote\b/gi, '').trim();
      if (name) out.push(name);
    }
  }
  return [...new Set(out.map(nameKey).filter(Boolean))];
}

// 이름 → 세션들 (날짜 · 시간 차례). 받은 세션 전체에서 한 번 만든다.
export function indexByParty(items) {
  const index = new Map();
  for (const s of items || []) {
    for (const key of partiesOf(s.title)) {
      if (!index.has(key)) index.set(key, []);
      index.get(key).push(s);
    }
  }
  for (const list of index.values()) list.sort((a, b) => a.date.localeCompare(b.date) || a.from.localeCompare(b.from) || a.title.localeCompare(b.title));
  return index;
}

// 그 회사 이름과 같은 이름을 밝힌 세션들. 없으면 [].
export const forCompany = (index, name) => { const key = nameKey(name); return key ? (index.get(key) || []) : []; };

// "1/7 (수) 9:00 ~ 9:40 · 곳" — 라스베이거스 시각이다. 곳이 없으면 "장소 미정".
export function whenWhere(s) {
  const [, m, d] = s.date.split('-').map(Number);
  const w = WEEK[new Date(`${s.date}T00:00:00`).getDay()];
  const clock = (t) => t.replace(/^0/, '');
  return `${m}/${d} (${w}) ${clock(s.from)} ~ ${clock(s.to)} · ${s.place || '장소 미정'}`;
}
