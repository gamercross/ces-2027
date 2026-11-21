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

// 캠퍼스마다 갈 수 있는 날. C Space는 넷째 날(1/9)에 열지 않는다 (data/info.json의 show.note).
const DAYS_OPEN = { cs: [1, 2, 3] };
const ALL_DAYS = [1, 2, 3, 4];

// 날짜 미정인 곳을 캠퍼스로 채운다: LVCC 첫날, 베네시안 둘째 날, C Space와 그 밖은 셋째 날.
// limit(하루에 볼 곳, 사람마다 정한다. 0이면 없음)를 주면, 하루가 그 수를 넘을 때 걷는 차례의 뒤쪽부터 자리가 있는
// 다음 날로 넘긴다. 내가 이미 날짜를 정한 곳은 옮기지 않는다. 어느 날에도 자리가 없으면 제 날에 그대로 둔다.
// { items(걷는 차례로 다시 선 목록), filled(채운 수), moved(다른 날로 넘긴 수), over(자리가 없어 넘친 수) }
// limit은 수 하나(모든 날 같음)이거나, 날마다의 한도 [0, 첫날, 둘째 날, …]다 (쓸 시간으로 셈한 것, web/days.js).
export function fillDays(items, firstBooth, table, limit = 0) {
  const limitOf = (d) => (Array.isArray(limit) ? (limit[d] ?? 0) : limit);
  const anyLimit = Array.isArray(limit) ? true : limit >= 1;
  const campusOf = (it) => { const booth = firstBooth(it.id); return booth ? table.get(splitBooth(booth).place)?.campus || null : null; };
  const baseDay = (campus) => (campus === 'lvcc' ? 1 : campus === 'ven' ? 2 : 3);
  const fresh = items.filter((it) => !it.day);
  if (!anyLimit) {
    const next = items.map((it) => (it.day ? it : { ...it, day: baseDay(campusOf(it)) }));
    return { items: sortRoute(next, firstBooth, table), filled: fresh.length, moved: 0, over: 0 };
  }
  const count = [0, 0, 0, 0, 0];
  for (const it of items) if (it.day) count[it.day] += 1;
  // 새로 채울 곳을 제 날 · 걷는 차례로 세워, 앞에서부터 자리를 준다.
  const queue = fresh
    .map((it, n) => { const campus = campusOf(it); return { it, n, campus, base: baseDay(campus), key: walkKey(firstBooth(it.id), table) }; })
    .sort((a, b) => a.base - b.base || compareKeys(a.key, b.key) || a.n - b.n);
  const dayOf = new Map();
  let moved = 0, over = 0;
  for (const q of queue) {
    const open = DAYS_OPEN[q.campus] || ALL_DAYS;
    const at = open.indexOf(q.base);
    const tryOrder = [...open.slice(at), ...open.slice(0, at)];
    const day = tryOrder.find((d) => count[d] < limitOf(d));
    if (day === undefined) { over += 1; dayOf.set(q.it.id, q.base); count[q.base] += 1; continue; }
    if (day !== q.base) moved += 1;
    dayOf.set(q.it.id, day);
    count[day] += 1;
  }
  const next = items.map((it) => (it.day ? it : { ...it, day: dayOf.get(it.id) }));
  return { items: sortRoute(next, firstBooth, table), filled: fresh.length, moved, over };
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
