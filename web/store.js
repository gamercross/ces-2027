// 폰에만 남기는 것: 명함 · 관심 · 동선 · 일기. 밖으로 보내지 않는다.
// 판 번호(v1)를 열쇠에 넣어, 꼴이 바뀌면 옛 것을 건드리지 않고 새로 쓴다.

const PREFIX = 'ces2027.';

export function load(name, fallback) {
  try {
    const text = localStorage.getItem(PREFIX + name);
    return text == null ? fallback : JSON.parse(text);
  } catch {
    return fallback;
  }
}

// 저장했으면 true. 저장 공간이 막혀 있으면(사생활 보호 창 등) false.
export function save(name, value) {
  try {
    localStorage.setItem(PREFIX + name, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

// 네 태그. 명함의 "나"와 일기의 "누구에게"에 쓴다.
export const TAGS = [
  { k: 'stu', ko: '학생' },
  { k: 'job', ko: '취준생' },
  { k: 'ret', ko: '정년' },
  { k: 'mid', ko: '장년' },
];
export const tagKo = (k) => TAGS.find((t) => t.k === k)?.ko || '';

export const getProfile = () => load('profile.v1', null);
export const setProfile = (profile) => save('profile.v1', profile);

// 관심 회사: [{ id, day }] — day는 0(날짜 미정) 또는 1 ~ 4(전시 첫날 ~ 넷째 날). 이 차례가 걷는 차례다.
export const getInterests = () => load('interests.v1', []);
export const setInterests = (list) => save('interests.v1', list);
export const hasInterest = (id) => getInterests().some((it) => it.id === id);
// 넣거나 뺀다. 넣었으면 true.
export function toggleInterest(id) {
  const list = getInterests();
  const at = list.findIndex((it) => it.id === id);
  if (at >= 0) list.splice(at, 1); else list.push({ id, day: 0 });
  setInterests(list);
  return at < 0;
}

// 내 위치: { by: 'gps' | 'booth', campus, place?, code?, x?, z?, meters?, at } — 폰에만 남는다.
export const getWhere = () => load('where.v1', null);
export function setWhere(where) {
  const ok = save('where.v1', where);
  // 내 자리가 바뀌면 알린다 (가까운 명함 이벤트 부스를 확인하려고).
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('ces-where'));
  return ok;
}

// 회사 일기: [{ id, date, exId, company, booth, saw, felt, for: [태그], sent }] — 폰에만 남는다.
// sent는 보내기(또는 내보내기)를 누른 때다. 보내기를 누른 일기만 폰 밖으로 나간다.
export const getDiary = () => load('diary.v1', []);
export const setDiary = (list) => save('diary.v1', list);

// 하루에 볼 곳: 사람마다 정한다. 0이면 정하지 않음. "날짜 채우기"가 이 수를 넘기지 않게 날을 나눈다.
export const getDayLimit = () => { const n = Number(load('dayLimit.v1', 0)); return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0; };
export const setDayLimit = (n) => save('dayLimit.v1', n);

// 날마다 쓸 시간: { '2027-01-06': { from: '10:00', to: '17:00' } | { off: true } } — 고친 날만 들어 있다. 없으면 공식 전시 시간.
export const getHours = () => load('hours.v1', {});
export const setHours = (hours) => save('hours.v1', hours);
// 내 일정(전시 밖): [{ id, date, from, to, name, place }]. 우리 일정은 폰에만 둔다.
export const getEvents = () => load('events.v1', []);
export const setEvents = (events) => save('events.v1', events);
// 한 곳에 쓰는 시간(분). 동선을 시간 안에 넣을 때 쓴다.
export const getPace = () => { const n = Number(load('pace.v1', 30)); return [15, 20, 30, 45, 60].includes(n) ? n : 30; };
export const setPace = (n) => save('pace.v1', n);

// 주제 판: [{ id, name, cats: [공식 분야 이름], notes: { stu, job, ret, mid }, ex: [회사 id] }] — 폰에만 남는다.
export const getTopics = () => load('topics.v1', []);
export const setTopics = (list) => save('topics.v1', list);

// 회사 대화: [{ id, exId, company, booth, date, src: 'listen' | 'paste' | 'hand', app, kind: 'pairs' | 'block', pairs | lines · text }] — 폰에만 남는다.
// 파일로 내보낼 때만 그 파일에 든 일기와 이어진 대화가 들어간다(녹음은 어느 때도 가지 않는다). 모양은 talk.js.
export const getTalks = () => load('talks.v1', []);
export const setTalks = (list) => save('talks.v1', list);
