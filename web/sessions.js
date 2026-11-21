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

// 내 주제 이름과 분야를 세션 제목 · 트랙 · 주제와 맞춘다. 아직 자료 밖의 관심은 만들지 않는다.
export function recommend(items, topics) {
  const words = [...new Set((topics || []).flatMap((topic) => [
    ...String(topic.name || '').toLowerCase().split(/\s+/),
    ...(topic.cats || []).map((cat) => String(cat).toLowerCase()),
  ]).map((word) => word.trim()).filter((word) => word.length >= 2))];
  if (!words.length) return [];
  return items.map((session) => {
    const hay = haystack(session);
    const score = words.reduce((sum, word) => sum + (hay.includes(word) ? 1 : 0), 0);
    return { session, score };
  }).filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.session.date.localeCompare(b.session.date) || a.session.from.localeCompare(b.session.from))
    .slice(0, 10)
    .map((item) => item.session);
}

// 기조연설 먼저 보려면: 제목이 "Keynote"로 시작하는 것 (공식 제목 규칙).
export const isKeynote = (s) => /^keynote\b/i.test(s.title);
