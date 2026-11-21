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
export const setWhere = (where) => save('where.v1', where);

// 회사 일기: [{ id, date, exId, company, booth, saw, felt, for: [태그], sent }] — 폰에만 남는다.
// sent는 보내기(또는 내보내기)를 누른 때다. 보내기를 누른 일기만 폰 밖으로 나간다.
export const getDiary = () => load('diary.v1', []);
export const setDiary = (list) => save('diary.v1', list);

// 주제 판: [{ id, name, cats: [공식 분야 이름], notes: { stu, job, ret, mid }, ex: [회사 id] }] — 폰에만 남는다.
export const getTopics = () => load('topics.v1', []);
export const setTopics = (list) => save('topics.v1', list);
