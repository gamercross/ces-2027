// 따로 신청하는 곳: 자료(data/separate.json)를 읽어 띠와 일정으로 바꾸는 셈. 화면과 따로 두어 Node에서도 시험한다.

export const STATUS_KO = { confirmed: '2027 확인됨', check: '확인 필요' };
const DAY = 86400000;
const days = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);

// 마감이 7일 안으로 다가온 것 (지난 것과 신청했다고 표시한 것은 뺀다). [{ item, left }]
export function dueSoon(items, applied, today) {
  return items
    .filter((it) => it.deadline && !applied[it.id])
    .map((it) => ({ item: it, left: days(today, it.deadline) }))
    .filter((x) => x.left >= 0 && x.left <= 7)
    .sort((a, b) => a.left - b.left);
}

// 2027 안내가 나왔는지 다시 볼 때가 된 것 (아직 "확인 필요"이고, 적어 둔 날이 됐다).
export function toWatch(items, today) {
  return items.filter((it) => it.status === 'check' && it.watchFrom && it.watchFrom <= today);
}

// 날짜와 시작 · 끝이 정해진 것만 내 일정으로 바꿀 수 있다.
export const canPlan = (it) => !!(it.date && it.from && it.to);
export const eventId = (it) => `sep-${it.id}`;
export function asEvent(it) {
  return canPlan(it) ? { id: eventId(it), date: it.date, from: it.from, to: it.to, name: `${it.org} ${it.what}`.slice(0, 60), place: it.place || it.where || '' } : null;
}

// 표시를 바꾼다. 돌려주는 것: { applied, events } — 표시하면 내 일정에 넣고, 풀면 뺀다.
export function toggleApplied(it, applied, events, today) {
  const next = { ...applied };
  let list = events.filter((e) => e.id !== eventId(it));
  if (next[it.id]) delete next[it.id];
  else {
    next[it.id] = today;
    const ev = asEvent(it);
    if (ev) list = [...list, ev];
  }
  return { applied: next, events: list };
}

// 첫 화면 카드에 쓸 줄: 기다리는 곳의 이름과, 따로 표가 있어야 하는 것.
export function summary(data) {
  const of = (g) => data.items.filter((it) => it.group === g);
  return {
    watch: of('watch').map((it) => it.org),
    apply: of('apply').filter((it) => it.status === 'check').map((it) => `${it.org} ${it.what}`),
    rides: of('ride').filter((it) => !/아님/.test(it.what)).map((it) => it.org),
    read: data.read,
  };
}
