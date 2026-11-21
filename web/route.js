// 동선: 관심 회사를 날짜 · 캠퍼스 · 걷는 차례로 세운다 (reference/미리보기판의 "동선 순서로"에서 옮겼다).
// 화면과 따로 두어 Node에서도 시험한다.

const CAMPUS_ORDER = { lvcc: 0, ven: 1, cs: 2 };

// 장소 자료에서 장소 기호 → { order(지도에 놓인 차례), campus, campusOrder, ko }.
export function placeTable(places) {
  const table = new Map();
  places.places.forEach((p, order) => table.set(p.k, { order, campus: p.c, campusOrder: CAMPUS_ORDER[p.c] ?? 9, ko: p.ko }));
  return table;
}

// "14731@LVCC_N" → { code, place }
export function splitBooth(booth) {
  const at = booth.lastIndexOf('@');
  return { code: booth.slice(0, at), place: booth.slice(at + 1) };
}

// 부스 하나의 걷는 자리: 캠퍼스 → 장소 → 통로 → 통로 안 순서(통로마다 방향을 바꿔 지그재그) → 부스 글.
// 숫자 부스는 앞자리(백의 자리 위)를 통로, 뒤 두 자리를 통로 안 순서로 읽는다. 짐작이다.
export function walkKey(booth, table) {
  if (!booth) return [9, 99, 0, 0, ''];
  const { code, place } = splitBooth(booth);
  const p = table.get(place);
  if (!p) return [8, 99, 0, 0, code];
  const m = code.match(/^(\d+)[a-zA-Z]?$/);
  if (!m) return [p.campusOrder, p.order, 0, 0, code];
  const n = parseInt(m[1], 10);
  const aisle = Math.floor(n / 100);
  const slot = (n % 100) >> 1;
  return [p.campusOrder, p.order, aisle, aisle % 2 ? -slot : slot, code];
}

export function compareKeys(x, y) {
  for (let i = 0; i < x.length; i++) {
    if (x[i] < y[i]) return -1;
    if (x[i] > y[i]) return 1;
  }
  return 0;
}

// 날짜 차례, 그 안에서는 걷는 차례로 세운다. 날짜 미정(0)은 맨 뒤.
// firstBooth(id)는 그 회사의 첫 부스("글@장소")나 null을 돌려준다.
export function sortRoute(items, firstBooth, table) {
  const dayRank = (d) => (d ? d : 99);
  return items
    .map((it, n) => ({ it, n, key: walkKey(firstBooth(it.id), table) }))
    .sort((a, b) => dayRank(a.it.day) - dayRank(b.it.day) || compareKeys(a.key, b.key) || a.n - b.n)
    .map((x) => x.it);
}

// 날짜 미정인 곳을 캠퍼스로 채운다: LVCC 첫날, 베네시안 둘째 날, C Space와 그 밖은 셋째 날.
// 채운 수를 돌려준다. 고친 목록은 걷는 차례로 다시 선다.
export function fillDays(items, firstBooth, table) {
  let filled = 0;
  const next = items.map((it) => {
    if (it.day) return it;
    const booth = firstBooth(it.id);
    const campus = booth ? table.get(splitBooth(booth).place)?.campus : null;
    filled += 1;
    return { ...it, day: campus === 'lvcc' ? 1 : campus === 'ven' ? 2 : 3 };
  });
  return { items: sortRoute(next, firstBooth, table), filled };
}

// 다음 갈 곳: 날짜 차례(미정은 맨 뒤), 그 안에서는 목록 차례로 보아 아직 보지 않은 첫 곳.
// day를 주면 그 날짜 안에서만 찾는다.
export function nextStop(items, day) {
  const rank = (d) => (d ? d : 99);
  return items
    .map((it, n) => ({ it, n }))
    .filter((x) => !x.it.seen && (day == null || (x.it.day || 0) === day))
    .sort((a, b) => rank(a.it.day) - rank(b.it.day) || a.n - b.n)[0]?.it || null;
}
