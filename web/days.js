// 날마다 쓸 시간 · 내 일정 · 한 곳에 쓰는 시간. 모두 폰에만 남는다 (우리 일정은 공개 레포에 두지 않는다).
// 기본 시간은 CES 공식 전시 시간(data/info.json)이고, 사람이 폰에서 고치거나 받은 파일을 불러와 넣는다.
// 화면과 따로 두어 Node에서도 시험한다.

export const FORMAT = 'ces-2027-myplan';
export const VERSION = 1;
export const PACES = [15, 20, 30, 45, 60];
export const DEFAULT_PACE = 30;

const HHMM = /^([01]?\d|2[0-3]):([0-5]\d)$/;
const DATE = /^\d{4}-\d\d-\d\d$/;
export const toMin = (s) => { const m = HHMM.exec(String(s || '').trim()); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
export const toHHMM = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
// 화면에 보일 때: 9:05
export const clock = (min) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;

// 그 날에 쓸 시간. 내가 고친 것이 있으면 그것, 없으면 공식 전시 시간. { from, to (분), off, mine }
export function hoursFor(date, saved, info) {
  const official = info.show.days.find((d) => d.date === date);
  const base = { from: toMin(official?.open) ?? 9 * 60, to: toMin(official?.close) ?? 18 * 60, off: false, mine: false };
  const s = saved?.[date];
  if (!s) return base;
  if (s.off) return { ...base, off: true, mine: true };
  const from = toMin(s.from), to = toMin(s.to);
  return from != null && to != null && to > from ? { from, to, off: false, mine: true } : base;
}

export function eventsOn(events, date) {
  return (events || []).filter((e) => e.date === date).sort((a, b) => (toMin(a.from) ?? 0) - (toMin(b.from) ?? 0));
}

// 일정이 차지하는 구간을 [from, to] 안으로 잘라 겹친 것끼리 합친다.
function busy(hours, events) {
  const cut = events
    .map((e) => [Math.max(hours.from, toMin(e.from) ?? 0), Math.min(hours.to, toMin(e.to) ?? 0)])
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0]);
  const out = [];
  for (const [a, b] of cut) {
    if (out.length && a <= out[out.length - 1][1]) out[out.length - 1][1] = Math.max(out[out.length - 1][1], b);
    else out.push([a, b]);
  }
  return out;
}

// 그 날 전시를 볼 수 있는 시간(분): 쓸 시간에서 내 일정을 뺀 것.
export function freeMinutes(hours, events) {
  if (hours.off) return 0;
  return hours.to - hours.from - busy(hours, events).reduce((a, [x, y]) => a + (y - x), 0);
}

// 그 시간에 몇 곳까지 볼 수 있나.
export function capacity(hours, events, pace) {
  return Math.floor(freeMinutes(hours, events) / pace);
}

// 동선의 차례대로 "몇 시쯤"을 어림한다. 내 일정이 있는 시간은 건너뛴다. 시간 밖이면 null.
export function timeline(count, hours, events, pace) {
  const out = [];
  if (hours.off) return Array.from({ length: count }, () => null);
  const blocks = busy(hours, events);
  let t = hours.from;
  for (let i = 0; i < count; i++) {
    // 이 한 곳이 일정과 겹치면 일정이 끝난 뒤로 민다.
    for (const [a, b] of blocks) if (t < b && t + pace > a) t = b;
    if (t + pace > hours.to) { out.push(null); continue; }
    out.push(t);
    t += pace;
  }
  return out;
}

// "날짜 채우기"에 줄 하루하루의 한도: 시간으로 볼 수 있는 수와 내가 정한 수 가운데 작은 것. [0, 첫날, …]
export function dayLimits(info, savedHours, events, pace, dayLimit) {
  return [0, ...info.show.days.map((d) => {
    const byTime = capacity(hoursFor(d.date, savedHours, info), eventsOn(events, d.date), pace);
    return dayLimit ? Math.min(dayLimit, byTime) : byTime;
  })];
}

const text = (v, max) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);
const newId = () => `e${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// 일정 하나를 다듬는다. 꼴이 맞지 않으면 null.
export function cleanEvent(e) {
  const date = text(e?.date, 10), from = text(e?.from, 5), to = text(e?.to, 5), name = text(e?.name, 60);
  if (!DATE.test(date) || toMin(from) == null || toMin(to) == null || toMin(to) <= toMin(from) || !name) return null;
  return { id: text(e.id, 20) || newId(), date, from: toHHMM(toMin(from)), to: toHHMM(toMin(to)), name, place: text(e.place, 80) };
}

// 받은 파일(글)을 읽는다. { hours, events, pace, problems } — 꼴이 맞지 않는 줄은 빼고 problems에 적는다.
export function readFile(raw) {
  let json;
  try { json = JSON.parse(raw); } catch { return { hours: {}, events: [], pace: null, problems: ['JSON이 아니다'] }; }
  if (json?.app !== FORMAT || json?.v !== VERSION) return { hours: {}, events: [], pace: null, problems: [`이 앱의 일정 파일이 아니다 (app: ${FORMAT}, v: ${VERSION})`] };
  const problems = [];
  const hours = {};
  for (const h of Array.isArray(json.hours) ? json.hours : []) {
    const date = text(h?.date, 10);
    if (!DATE.test(date)) { problems.push('날짜가 맞지 않는 시간 줄을 뺐다'); continue; }
    if (h.off === true) { hours[date] = { off: true }; continue; }
    const from = toMin(h.from), to = toMin(h.to);
    if (from == null || to == null || to <= from) { problems.push(`${date}: 시작 · 끝 시간이 맞지 않아 뺐다`); continue; }
    hours[date] = { from: toHHMM(from), to: toHHMM(to) };
  }
  const events = [];
  for (const e of Array.isArray(json.events) ? json.events : []) {
    const ok = cleanEvent(e);
    if (ok) events.push(ok); else problems.push('꼴이 맞지 않는 일정 하나를 뺐다');
  }
  const pace = PACES.includes(json.perStopMinutes) ? json.perStopMinutes : null;
  return { hours, events, pace, problems };
}

// 내 시간과 일정을 파일 꼴로. 단톡방으로 건네고 받는 사람이 불러온다. 레포에는 올리지 않는다.
export function makeFile(savedHours, events, pace) {
  return {
    app: FORMAT,
    v: VERSION,
    hours: Object.entries(savedHours || {}).sort().map(([date, h]) => (h.off ? { date, off: true } : { date, from: h.from, to: h.to })),
    events: (events || []).map((e) => ({ date: e.date, from: e.from, to: e.to, name: e.name, place: e.place || '' })),
    perStopMinutes: pace,
  };
}

// 받은 것을 내 것에 더한다: 시간은 그 날짜를 덮어쓰고, 일정은 같은 것(날짜 · 시작 · 이름)이 없을 때만 더한다.
export function mergeIn(mine, incoming) {
  const hours = { ...(mine.hours || {}), ...incoming.hours };
  const key = (e) => `${e.date}|${e.from}|${e.name}`;
  const have = new Set((mine.events || []).map(key));
  const fresh = incoming.events.filter((e) => !have.has(key(e)));
  return { hours, events: [...(mine.events || []), ...fresh], added: fresh.length, hoursSet: Object.keys(incoming.hours).length };
}
