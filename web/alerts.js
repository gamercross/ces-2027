// 명함 이벤트 알림: 종이 명함이 있는지, 어느 부스에 "명함 넣는 이벤트"가 있는지, 오늘 몇 장이 필요한지.
// 이벤트 부스는 공식 자료에 없다. 사람이 표시한 것만 보이고("내가 표시" · "팀이 표시"), 짐작하지 않는다.
// 서버가 없다. 앱을 열 때와 내 자리가 바뀔 때 확인해서 알린다. 앱이 닫혀 있을 때 정해진 시각에 알리지는 못한다.
// 계산은 화면과 따로 두어 Node에서도 시험한다.

const pad = (n) => String(n).padStart(2, '0');
export const dateOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// 종이 명함을 다시 물을 때인가. paper: { has: true | false | null, asked: 'YYYY-MM-DD', remindOn: 'YYYY-MM-DD' }
// 처음(답이 없을 때) 한 번, 그리고 정해 둔 날(remindOn)이 되었을 때 그날 뒤로 묻지 않았으면 한 번 더.
export function shouldAskPaper(paper, today) {
  if (!paper || paper.has == null) return 'first';
  if (paper.remindOn && today >= paper.remindOn && (!paper.asked || paper.asked < paper.remindOn)) return 'again';
  return null;
}

// 출발 전에 다시 물을 날의 기본값: 전시 첫날의 8일 전 (인쇄에 걸리는 날을 남긴다).
export function defaultRemind(showFrom) {
  const [y, m, d] = showFrom.split('-').map(Number);
  return dateOf(new Date(y, m - 1, d - 8));
}

// 오늘(그 날짜)의 동선에서 명함 이벤트 부스가 있는 회사들. marks: { '장소|부스 글': { by } }
// interests: [{ id, day, seen }], dayOfDate(date) → 날짜 번호(1 ~ 5) 또는 null, boothsOf(id) → ['글@장소', …]
export function cardsNeeded(interests, marks, date, dayOfDate, boothsOf) {
  const day = dayOfDate(date);
  if (!day) return [];
  const out = [];
  for (const it of interests) {
    if ((it.day || 0) !== day || it.seen) continue;
    const hit = (boothsOf(it.id) || []).map((b) => { const at = b.lastIndexOf('@'); return `${b.slice(at + 1)}|${b.slice(0, at)}`; }).find((key) => marks[key]);
    if (hit) out.push({ id: it.id, key: hit, by: marks[hit].by });
  }
  return out;
}

// 내 자리 가까이에 있는 이벤트 부스. 부스 번호로 맞춘 자리면 같은 장소에서 통로가 가까운 것(짐작),
// GPS로 본 자리면 그 홀 · 건물 안의 것 전부(짐작). 캠퍼스만 아는 자리로는 알리지 않는다.
export function nearMarks(where, marks) {
  if (!where) return [];
  const keys = Object.keys(marks);
  const num = (code) => { const m = /^(\d+)[a-zA-Z]?$/.exec(code || ''); return m ? parseInt(m[1], 10) : null; };
  if (where.by === 'booth') {
    const mine = num(where.code);
    return keys.filter((key) => {
      const bar = key.indexOf('|');
      if (key.slice(0, bar) !== where.place) return false;
      const n = num(key.slice(bar + 1));
      // 숫자 부스끼리는 통로 다섯 개 안, 글자 부스는 같은 장소면 가깝다고 본다.
      return mine == null || n == null ? true : Math.abs(Math.floor(n / 100) - Math.floor(mine / 100)) <= 5;
    });
  }
  const places = where.area?.places || [];
  return keys.filter((key) => places.includes(key.slice(0, key.indexOf('|'))));
}

// 같은 알림을 하루에 한 번만: sent는 { 열쇠: 'YYYY-MM-DD' }.
export function fresh(sent, key, today) {
  return (sent || {})[key] !== today;
}

// 라스베이거스의 지금: { date: 'YYYY-MM-DD', min: 0 ~ 1439 }. 일정 시각은 라스베이거스 시각이라 폰의 시간대와 상관없이 이 시각으로 견준다.
export function vegasNow(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return { date: `${get('year')}-${get('month')}-${get('day')}`, min: Number(get('hour')) * 60 + Number(get('minute')) };
}

// 곧 시작하는 내 일정: 지금부터 ahead분 안에 시작하는 것(이미 시작한 것은 뺀다). 때가 이른 것부터. [{ ...일정, inMin }]
export function soonEvents(events, now, ahead = 30) {
  const at = (hhmm) => { const m = /^(\d\d):(\d\d)$/.exec(hhmm || ''); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
  return (events || [])
    .filter((e) => e.date === now.date && at(e.from) != null)
    .map((e) => ({ ...e, inMin: at(e.from) - now.min }))
    .filter((e) => e.inMin >= 0 && e.inMin <= ahead)
    .sort((x, y) => x.inMin - y.inMin);
}

// 이 폰에서 알림(Notification)을 쓸 수 있는 상태. 서버 없이 쓰는 길만 본다.
// 'granted' 쓸 수 있다 · 'default' 물어볼 수 있다 · 'denied' 막아 두었다 · 'unsupported' 이 브라우저는 안 된다
export function notifyState(env) {
  const g = env || globalThis;
  if (!('Notification' in g) || !g.navigator || !('serviceWorker' in g.navigator)) return 'unsupported';
  return g.Notification.permission;
}

// 이벤트 부스 표시를 고친다. 새 객체를 돌려준다.
export function toggleMark(marks, key, by = 'me') {
  const next = { ...marks };
  if (next[key]) delete next[key]; else next[key] = { by };
  return next;
}

// 팀 파일에서 받은 표시를 더한다. 내가 이미 표시한 것은 그대로 둔다. { marks, added }
export function mergeMarks(marks, keys) {
  const next = { ...marks };
  let added = 0;
  for (const key of keys || []) {
    if (typeof key !== 'string' || !/^[A-Z0-9_]+\|.{1,60}$/.test(key) || next[key]) continue;
    next[key] = { by: 'team' };
    added += 1;
  }
  return { marks: next, added };
}

export const markLabel = (mark) => (mark?.by === 'team' ? '팀이 표시' : '내가 표시');
