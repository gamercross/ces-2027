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
