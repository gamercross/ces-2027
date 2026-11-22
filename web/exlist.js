// 전시사 목록의 속: 거르기 · 줄 세우기 · 첫 글자 색인 · 위치 묶음. 화면 없이 Node에서 시험한다.
// 줄 하나(전시사 자료 ex의 한 줄): [id, name, intro, country(나라 번호), cats("4.19.26"), award(1 혁신상 · 2 최고), featured, booths(["14731@LVCC_N"])]

const placeOfBooth = (b) => b.slice(b.lastIndexOf('@') + 1);
const codeOfBooth = (b) => b.slice(0, b.lastIndexOf('@'));

// 첫 글자: 영문 A–Z, 그 밖(숫자 · 기호 · 한글)은 "#"
export const LETTERS = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', '#'];
export function initialOf(name) {
  const c = String(name || '').trim().charAt(0).toUpperCase();
  return c >= 'A' && c <= 'Z' ? c : '#';
}

// 나라 이름: 많이 나오는 나라만 우리말로 적고, 나머지는 공식 자료의 영어 그대로 둔다.
const COUNTRY_KO = {
  'United States': '미국', China: '중국', 'South Korea': '한국', Taiwan: '대만', 'Hong Kong SAR': '홍콩', France: '프랑스', Japan: '일본',
  Canada: '캐나다', Germany: '독일', Netherlands: '네덜란드', 'United Kingdom': '영국', Italy: '이탈리아', Switzerland: '스위스', Israel: '이스라엘',
  India: '인도', Spain: '스페인', Singapore: '싱가포르', Belgium: '벨기에', Sweden: '스웨덴', Australia: '호주', Turkey: '튀르키예', Austria: '오스트리아',
  Poland: '폴란드', Denmark: '덴마크', Finland: '핀란드', Norway: '노르웨이', Ukraine: '우크라이나', Brazil: '브라질', Mexico: '멕시코', Thailand: '태국',
  Vietnam: '베트남', Malaysia: '말레이시아', Portugal: '포르투갈', Ireland: '아일랜드', Greece: '그리스', 'United Arab Emirates': '아랍에미리트',
  'Saudi Arabia': '사우디아라비아', 'Czech Republic': '체코', Hungary: '헝가리', Estonia: '에스토니아', Lithuania: '리투아니아', 'New Zealand': '뉴질랜드',
};
export const countryKo = (en) => COUNTRY_KO[en] || en;

// 위치 묶음: 홀 칩 묶음(groups: [[이름, [장소 기호]]]) 다음에, 묶음 밖 장소를 하나씩 회사 수가 많은 차례로 둔다.
// placeKo(k) → 장소 이름. 회사가 하나도 없는 묶음은 뺀다. 돌려주는 것: [{ key, ko, keys, n }]
export function placeGroups(groups, placeKo, ex) {
  const companies = new Map(); // 장소 → 회사 수 (한 회사가 같은 장소에 부스 둘이면 한 번)
  for (const row of ex) for (const p of new Set((row[7] || []).map(placeOfBooth))) companies.set(p, (companies.get(p) || 0) + 1);
  const countIn = (keys) => ex.filter((row) => (row[7] || []).some((b) => keys.includes(placeOfBooth(b)))).length;
  const inGroup = new Set(groups.flatMap(([, keys]) => keys));
  const out = groups.map(([ko, keys]) => ({ key: ko, ko, keys, n: countIn(keys) })).filter((g) => g.n > 0);
  const rest = [...companies.keys()].filter((k) => !inGroup.has(k)).map((k) => ({ key: k, ko: placeKo(k) || k, keys: [k], n: companies.get(k) }));
  rest.sort((a, b) => b.n - a.n || a.ko.localeCompare(b.ko, 'ko'));
  return [...out, ...rest];
}

// 거르기. f: { q, award, korea, place: [장소 기호] | null, country: 나라 번호 | null, cat: 분야 번호(글) | null }
// ctx: { koreaAt: 한국의 나라 번호, hits: 찾기 코어가 돌려준 줄 번호 Set(한글로 찾을 때) | null }
// q가 영문 · 숫자면 이름 · 부스 번호에 든 것으로 거른다. 한글이면 ctx.hits(한글 별칭 · 분야 이름 색인)를 쓴다.
export function filterRows(ex, f, ctx = {}) {
  const q = String(f.q || '').trim().toLowerCase();
  const hangul = /[ㄱ-힝]/.test(q);
  const out = [];
  for (let i = 0; i < ex.length; i++) {
    const row = ex[i];
    if (f.award && !row[5]) continue;
    if (f.korea && row[3] !== ctx.koreaAt) continue;
    if (f.country != null && row[3] !== f.country) continue;
    if (f.cat != null && !String(row[4] || '').split('.').includes(String(f.cat))) continue;
    if (f.place && !(row[7] || []).some((b) => f.place.includes(placeOfBooth(b)))) continue;
    if (q) {
      if (hangul) { if (!ctx.hits || !ctx.hits.has(i)) continue; }
      else if (!String(row[1]).toLowerCase().includes(q) && !(row[7] || []).some((b) => codeOfBooth(b).toLowerCase().startsWith(q))) continue;
    }
    out.push(row);
  }
  return out;
}

// 줄 세우기. by: 'name'(이름 A–Z, 숫자 · 기호는 맨 끝 "#") | 'booth'(위치 묶음 차례 → 부스 번호).
// 부스 차례에서는 거른 위치(place)가 있으면 그 안의 부스를, 없으면 첫 부스를 쓴다. placeOrder: 장소 기호 → 차례 번호
export function sortRows(rows, by, { placeOrder = new Map(), place = null } = {}) {
  const list = rows.slice();
  if (by === 'booth') {
    const boothOf = (row) => (row[7] || []).find((b) => !place || place.includes(placeOfBooth(b))) || null;
    const num = (code) => { const m = /^(\d+)/.exec(code); return m ? Number(m[1]) : Infinity; };
    const keyOf = (row) => { const b = boothOf(row); if (!b) return [Infinity, Infinity, '']; const p = placeOfBooth(b), c = codeOfBooth(b); return [placeOrder.has(p) ? placeOrder.get(p) : 9999, num(c), c]; };
    const keys = new Map(list.map((row) => [row, keyOf(row)]));
    list.sort((a, b) => { const x = keys.get(a), y = keys.get(b); return x[0] - y[0] || x[1] - y[1] || x[2].localeCompare(y[2]) || String(a[1]).localeCompare(String(b[1]), 'en'); });
    return list;
  }
  list.sort((a, b) => {
    const ia = initialOf(a[1]), ib = initialOf(b[1]);
    if (ia !== ib) return ia === '#' ? 1 : ib === '#' ? -1 : ia.localeCompare(ib);
    return String(a[1]).localeCompare(String(b[1]), 'en', { sensitivity: 'base', numeric: true });
  });
  return list;
}

// 이름순으로 세운 줄에서 글자마다 처음 나오는 자리. 돌려주는 것: Map(글자 → 줄 번호)
export function letterStarts(sorted) {
  const at = new Map();
  sorted.forEach((row, i) => { const c = initialOf(row[1]); if (!at.has(c)) at.set(c, i); });
  return at;
}
