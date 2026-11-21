// 지도의 부스 점을 칠하는 법 (reference/미리보기판의 exColor · boothColor에서 옮겼다).
// 분야 묶음 · 한국 회사 · 혁신상 가운데 하나를 골라 칠한다. 색은 눈이 편한 파스텔로 바꿨다.
// 화면과 따로 두어 Node에서도 시험한다.

// 색의 원본은 tokens.css(--map-* · --group-*)다. 여기서는 이름만 붙여 쓴다.
import { T, GROUP_COLORS } from './tokens.js';

export { GROUP_COLORS };
export const PLAIN = T.plain;
const NONE = T.none;
const KOREA = T.korea;
const BEST = T.best;
const HONOREE = T.honoree;

export const MODES = [
  { k: 'plain', ko: '한 색' },
  { k: 'group', ko: '분야' },
  { k: 'korea', ko: '한국' },
  { k: 'award', ko: '혁신상' },
];

// 전시사 줄마다 가장 많이 걸친 분야 묶음의 기호(없으면 null). 같으면 묶음 차례가 앞선 것.
export function rowGroups(data, table) {
  const groupOfCat = data.cats.map((c) => table.groups.findIndex((g) => g.cats.includes(c)));
  const out = new Map();
  for (const row of data.ex) {
    const count = table.groups.map(() => 0);
    if (row[4]) for (const c of row[4].split('.')) if (groupOfCat[c] >= 0) count[groupOfCat[c]] += 1;
    let best = -1;
    count.forEach((n, i) => { if (n > 0 && (best < 0 || n > count[best])) best = i; });
    out.set(row[0], best >= 0 ? table.groups[best].k : null);
  }
  return out;
}

// 부스 하나의 색을 돌려주는 함수를 만든다. rowsAt(key)는 그 부스의 전시사 줄들이다.
export function boothColorer(mode, data, table, rowsAt) {
  if (mode === 'korea') {
    const korea = data.countries.indexOf('South Korea');
    return (key) => (rowsAt(key).some((r) => r[3] === korea) ? KOREA : NONE);
  }
  if (mode === 'award') {
    return (key) => {
      const rows = rowsAt(key);
      if (rows.some((r) => r[5] & 2)) return BEST;
      return rows.some((r) => r[5] & 1) ? HONOREE : NONE;
    };
  }
  if (mode === 'group') {
    const groups = rowGroups(data, table);
    const order = table.groups.map((g) => g.k);
    return (key) => {
      // 한 부스에 회사가 여럿이면 가장 많은 묶음으로 칠한다.
      const count = new Map();
      for (const r of rowsAt(key)) { const g = groups.get(r[0]); if (g) count.set(g, (count.get(g) || 0) + 1); }
      let best = null;
      for (const g of order) if (count.has(g) && (best === null || count.get(g) > count.get(best))) best = g;
      return best ? GROUP_COLORS[best] : NONE;
    };
  }
  return () => PLAIN;
}

// 그 칠하기의 범례: [{ color, ko }]
export function legend(mode, table) {
  if (mode === 'korea') return [{ color: KOREA, ko: '한국 회사' }, { color: NONE, ko: '그 밖' }];
  if (mode === 'award') return [{ color: BEST, ko: '최고 혁신상' }, { color: HONOREE, ko: '혁신상' }, { color: NONE, ko: '없음' }];
  if (mode === 'group') return [...table.groups.map((g) => ({ color: GROUP_COLORS[g.k] || NONE, ko: g.ko })), { color: NONE, ko: '분야 없음' }];
  return [];
}
