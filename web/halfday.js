// 반나절에 캠퍼스 하나 (R69 안, 설정 halfDay. 기본은 꺼 둔다).
// 하루를 오전 · 오후로 나눠 반나절에 캠퍼스 하나씩 본다: 그 날 갈 곳을 캠퍼스끼리 모아 앞(오전) · 뒤(오후)로 세운다.
// 캠퍼스를 모르는 곳(부스 미정)은 맨 뒤에 둔다. 화면 없이 Node에서 시험한다. 폰 안의 자료만 쓰므로 인터넷 없이 된다.
// campusOf(id) → 캠퍼스 기호(문자) 또는 null

// 그 날 캠퍼스를 오가는 횟수(앞 곳과 캠퍼스가 다른 자리 수, 모르는 곳은 건너뛴다).
export function hops(items, campusOf) {
  let n = 0, last = null;
  for (const it of items) { const c = campusOf(it.id); if (!c) continue; if (last && c !== last) n += 1; last = c; }
  return n;
}

// 그 날의 반나절 나눔. 캠퍼스가 하나뿐이거나 없으면 null.
// 돌려주는 것: { am: { campus, n }, pm: { campus, n }, extra: [{ campus, n }], grouped }
//   grouped: 지금 차례가 이미 캠퍼스끼리 모여 있다(오가는 횟수가 캠퍼스 수 - 1). 그때 am · pm은 지금 차례 그대로다.
//   아니면 am · pm은 저절로 나눈 안이다: 곳이 많은 캠퍼스가 오전(같으면 먼저 나온 캠퍼스).
export function halves(items, campusOf) {
  const count = new Map();
  for (const it of items) { const c = campusOf(it.id); if (c) count.set(c, (count.get(c) || 0) + 1); }
  if (count.size < 2) return null;
  const grouped = hops(items, campusOf) === count.size - 1;
  const order = grouped ? [...count.keys()] : autoOrder(items, campusOf);
  const [am, pm, ...extra] = order.map((campus) => ({ campus, n: count.get(campus) }));
  return { am, pm, extra, grouped };
}

// 저절로 나눈 차례: 곳이 많은 캠퍼스부터, 같으면 먼저 나온 캠퍼스부터.
export function autoOrder(items, campusOf) {
  const first = new Map(), count = new Map();
  items.forEach((it, i) => { const c = campusOf(it.id); if (!c) return; if (!first.has(c)) first.set(c, i); count.set(c, (count.get(c) || 0) + 1); });
  return [...count.keys()].sort((a, b) => count.get(b) - count.get(a) || first.get(a) - first.get(b));
}

// 그 날(dayKey) 곳들을 캠퍼스 차례(order)대로 다시 세운 새 목록. 같은 캠퍼스 안의 차례는 그대로다.
// 다른 날의 곳은 자리도 차례도 그대로다. order에 없는 캠퍼스 · 모르는 곳은 그 날의 맨 뒤에 선다.
export function splitDay(list, dayKey, campusOf, order) {
  const at = [];
  list.forEach((it, i) => { if ((it.day || 0) === dayKey) at.push(i); });
  const rank = (it) => { const r = order.indexOf(campusOf(it.id)); return r < 0 ? order.length : r; };
  const sorted = at.map((i) => list[i]).map((it, i) => ({ it, i })).sort((a, b) => rank(a.it) - rank(b.it) || a.i - b.i).map((x) => x.it);
  const out = list.slice();
  at.forEach((i, k) => { out[i] = sorted[k]; });
  return out;
}
