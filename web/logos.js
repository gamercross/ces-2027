// 회사 로고 주소를 셈하는 곳. 화면과 따로 두어 Node에서도 시험한다.
// 자료(data/logos.json)는 자료 도구가 전시사 줄(ex)과 같은 차례로 한 글자씩 적은 것이다. 그림은 CES 공식 사이트의 것을 그 주소 그대로 보인다.

const OFFICIAL_BASE = /^https:\/\/exhibitors\.ces\.tech\/mys_shared\//;
const KIND_CHARS = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
// 주소에 그대로 붙이는 파일 이름은 이 글자만 받는다.
const SAFE_FILE = /^[A-Za-z0-9._-]{3,80}$/;

// 전시사 자료(exhibitors)와 같은 판의 로고 자료만 쓴다. 다르면 null (줄 차례가 어긋나므로 쓰지 않는다).
export function openLogos(logos, exhibitors) {
  if (!logos || !exhibitors || logos.v !== exhibitors.v || !OFFICIAL_BASE.test(logos.base) || typeof logos.map !== 'string' || logos.map.length !== exhibitors.ex.length) return null;
  const at = new Map();
  exhibitors.ex.forEach((row, i) => at.set(row[0], i));
  return { logos, at };
}

// 회사 id의 로고 주소. 없으면 null.
export function logoUrl(open, id) {
  if (!open) return null;
  const i = open.at.get(id);
  if (i === undefined) return null;
  const { logos } = open;
  let file = logos.extra?.[i] ?? null;
  if (!file) {
    const k = KIND_CHARS.indexOf(logos.map[i]);
    const kind = k >= 0 ? logos.kinds[k] : null;
    if (!kind) return null;
    file = kind.startsWith('~') ? `${id.toLowerCase()}.${kind.slice(1)}` : `${id}.${kind}`;
  }
  return SAFE_FILE.test(file) ? logos.base + file : null;
}
