// 물어보기의 셈: 앱 안 자료(알아둘 것 · 따로 신청 · 세션 · 부스 질문 · 자주 묻는 것)를 한 칸에서 찾는다.
// 화면과 따로 두어 Node에서도 시험한다 (scripts/smoke.mjs). 서버도 열쇠도 없다.
// 낱말을 나누고, 자료의 글과 견줘 점수를 매길 뿐이다. 자료에 없는 말은 없다고 돌려준다.

// 물음에 늘 붙는 말. 찾는 데 쓰지 않는다.
const STOP = new Set(['어떻게', '어떤', '뭐야', '어디', '언제', '누가', '무엇', '뭐', '몇', '있나', '있는', '있어', '하나', '해야', '된다', '되나', '할까', '인가', '이런', '그냥', '알려', '알려줘', '주세요', '좀', '대해', '내가', '것은', '것이', '시에', '적은']);
// 낱말 끝에 붙는 말(조사 · 어미). 한 번만 뗀다. 긴 것부터.
const TAILS = ['에서는', '으로는', '에서', '으로', '에게', '까지', '부터', '이나', '이랑', '에는', '해야', '는', '은', '이', '가', '을', '를', '에', '로', '의', '도', '만', '와', '과', '나', '랑', '서', '까', '요', '니', '냐', '죠'];
const ASKING = new Set(['나', '까', '니', '냐', '죠', '요']);
// 같은 뜻으로 보는 말 (자료에 적힌 낱말로 이어 준다).
const SYN = {
  가격: ['값', '요금', '유료', '무료'], 값: ['가격', '요금', '유료', '무료'], 요금: ['값', '가격', '유료', '무료'], 비용: ['값', '요금', '가격'],
  버스: ['셔틀'], 택시: ['waymo', 'zoox', '자율주행'], 웨이모: ['waymo'], 죽스: ['zoox'], 엔비디아: ['nvidia'], 삼성: ['samsung'], 현대차: ['현대차그룹', 'hyundai'], 엘지: ['lg'], 퀄컴: ['qualcomm'], 레노버: ['lenovo'],
  신분증: ['여권'], 입장: ['배지'], 티켓: ['표', '초대'], 연설: ['기조연설'], 키노트: ['기조연설'], 시간: ['시', 'hours'], 공항: ['공항'], 전철: ['모노레일'], 지하철: ['모노레일'],
};

export const GROUPS = [
  { k: 'info', ko: '알아둘 것' },
  { k: 'separate', ko: '따로 신청하는 곳 · 이동' },
  { k: 'sessions', ko: '세션 일정' },
  { k: 'phrases', ko: '부스에서 쓸 질문' },
];

const SESSIONS_LINK = '#/sessions';

const lower = (s) => String(s || '').toLowerCase().normalize('NFC');
const md = (date) => { const m = /^(\d{4})-(\d\d)-(\d\d)/.exec(date || ''); return m ? `${Number(m[2])}/${Number(m[3])}` : ''; };

// 물음을 낱말로 나눈다. 한글 낱말은 조사를 뗀 것(strong)과 앞 두 글자(weak)를 같이 든다.
export function words(text) {
  const parts = lower(text).match(/[가-힣]+|[a-z]+|\d+/g) || [];
  const out = [];
  for (const raw of parts) {
    if (/^[가-힣]+$/.test(raw)) {
      let stem = raw;
      for (const tail of TAILS) {
        // 묻는 끝말(가나 · 받나 · 갈까)은 한 글자만 남아도 뗀다. 그러면 낱말이 못 되어 버려진다.
        const need = ASKING.has(tail) ? 1 : 2;
        if (raw.endsWith(tail) && raw.length - tail.length >= need) { stem = raw.slice(0, -tail.length); break; }
      }
      if (STOP.has(raw) || STOP.has(stem)) continue;
      if (stem.length < 2) continue;
      out.push({ raw, strong: [...new Set([stem, raw])], weak: raw.length >= 3 ? [raw.slice(0, 2)] : [], syn: SYN[stem] || SYN[raw] || [] });
    } else if (/^\d+$/.test(raw)) {
      if (raw.length >= 2) out.push({ raw, strong: [raw], weak: [], syn: [] });
    } else if (raw.length >= 2) {
      out.push({ raw, strong: [raw], weak: [], syn: SYN[raw] || [] });
    }
  }
  return out;
}

// 줄 하나의 점수. title에 맞으면 크게, text에 맞으면 작게. 맞은 낱말이 절반이 안 되면 0.
function scoreText(ws, title, text) {
  if (!ws.length) return 0;
  let score = 0;
  let hit = 0;
  for (const w of ws) {
    let got = 0;
    for (const c of w.strong) { if (title.includes(c)) { got = Math.max(got, 8); } else if (text.includes(c)) got = Math.max(got, 3); }
    if (!got) for (const c of w.syn) { if (title.includes(c)) got = Math.max(got, 4); else if (text.includes(c)) got = Math.max(got, 2); }
    if (!got) for (const c of w.weak) { if (title.includes(c)) got = Math.max(got, 2); else if (text.includes(c)) got = Math.max(got, 1); }
    if (got) { hit += 1; score += got; }
  }
  if (hit < Math.ceil(ws.length / 2)) return 0;
  return score + (hit === ws.length ? 4 : 0);
}

// ---------- 자료 줄에서 출처 가져오기 ----------

// 경로(예: "badge", "moving.0", "items.samsung")를 따라가며 가장 가까운 출처를 모은다.
// 한 칸이 배열이면 숫자는 자리, 글은 id나 k로 줄을 찾는다. 부모에 `${칸}Source`가 있으면 그것이 그 칸의 출처다.
export function walk(doc, path) {
  let node = doc;
  let found = null;
  for (const seg of String(path).split('.')) {
    if (node == null || typeof node !== 'object') return null;
    let next;
    if (Array.isArray(node)) next = /^\d+$/.test(seg) ? node[Number(seg)] : node.find((x) => x && (x.id === seg || x.k === seg));
    else { next = node[seg]; if (node[`${seg}Source`]) found = node[`${seg}Source`]; }
    node = next;
    if (node && typeof node === 'object' && !Array.isArray(node)) { if (node.source) found = node.source; else if (node.sources) found = node.sources; }
  }
  if (node === undefined) return null;
  return { node, sources: found ? [found].flat().filter((s) => s && s.url && s.read) : [] };
}

// 자주 묻는 것의 근거 한 줄을 풀어 낸다: { ko, to?, sources: [{ko,url,read}], read?, text, ok }
export function resolveBasis(b, docs) {
  if (b.app) return { ko: b.app, to: b.to || null, sources: [], read: b.read || null, text: '', ok: true, app: true };
  const doc = docs[b.file];
  const at = doc && walk(doc, b.path);
  if (!at) return { ko: b.ko, sources: [], text: '', ok: false };
  return { ko: b.ko, sources: at.sources, read: at.sources[0]?.read || doc.read || null, text: JSON.stringify(at.node), ok: true };
}

// ---------- 찾을 줄 만들기 ----------

function entry(kind, o) { return { kind, ...o, t: lower(o.title), x: lower(o.text) }; }

export function buildEntries({ info, separate, phrases, sessions }) {
  const out = [];
  const where = (spot, to, toKo) => ({ spot, to, toKo });
  if (info) {
    const s = info.show;
    const at = where('첫 화면', '#/', '첫 화면에서 보기');
    out.push(entry('info', { title: `CES 2027 날짜 · ${s.city}`, text: `${s.from} ~ ${s.to}. 1월 6일 ~ 9일`, show: `${md(s.from)} ~ ${md(s.to)}`, src: s.source, ...at }));
    for (const d of s.days) out.push(entry('info', { title: `전시 시간 · ${d.ko}`, text: d.hours, show: `${d.hours} (라스베이거스 시각)`, src: s.source, ...where('첫 화면 · 날짜와 시간', '#/', '첫 화면에서 보기') }));
    out.push(entry('info', { title: '전시 시간 · C Space(아리아)', text: s.note, show: s.note, src: s.noteSource || s.source, ...where('첫 화면 · 날짜와 시간', '#/', '첫 화면에서 보기') }));
    for (const c of info.campuses) for (const h of c.halls) out.push(entry('info', { title: `${c.ko} · ${h.ko}`, text: `${c.sub}. ${h.what}`, show: h.what, src: c.source, ...where('첫 화면 · 캠퍼스 셋', '#/', '첫 화면에서 보기') }));
    for (const m of info.moving) out.push(entry('info', { title: `오가는 법 · ${m.ko}`, text: m.what, show: m.what, src: info.movingSource, ...where('첫 화면 · 오가는 법', '#/', '첫 화면에서 보기') }));
    const b = info.badge;
    out.push(entry('info', { title: '배지 받는 법', text: b.rule, show: b.rule, src: b.source, ...where('첫 화면 · 배지 받는 곳', '#/', '첫 화면에서 보기') }));
    for (const p of b.spots) out.push(entry('info', { title: `배지 받는 곳 · ${p.ko}`, text: `배지 ${p.hours}`, show: p.hours, src: b.source, ...where('첫 화면 · 배지 받는 곳', '#/', '첫 화면에서 보기') }));
    out.push(entry('info', { title: '배지 받는 곳 · 호텔', text: b.more, show: b.more, src: b.source, ...where('첫 화면 · 배지 받는 곳', '#/', '첫 화면에서 보기') }));
  }
  if (separate) {
    const groupKo = new Map(separate.groups.map((g) => [g.k, g.ko]));
    for (const it of separate.items) {
      const when = it.date ? `${md(it.date)}${it.from ? ` ${it.from}${it.to ? ` ~ ${it.to}` : ''}` : ''}` : '';
      out.push(entry('separate', {
        title: `${it.org} · ${it.what}`,
        text: [it.where, it.who, it.apply?.ko, it.last, it.todo, when].filter(Boolean).join(' '),
        show: [when, it.where, it.apply?.ko].filter(Boolean).join(' · '),
        status: it.status, src: it.sources?.[0] || null, more: Math.max(0, (it.sources?.length || 0) - 1),
        ...where(`따로 신청하는 곳 · ${groupKo.get(it.group) || ''}`, '#/apply', '따로 신청하는 곳에서 보기'),
      }));
    }
  }
  if (phrases) {
    for (const pack of phrases.packs) for (const it of pack.items) out.push(entry('phrases', { title: it.ko, text: `${pack.ko} ${it.en}`, show: it.en, en: true, src: null, note: '앱에 담아 둔 질문 · 영어는 미리 번역한 초안', ...where(`물어볼 말 · ${pack.ko}`, '#/ask', '물어볼 말에서 보기') }));
  }
  if (sessions) out.push(...sessionEntries(sessions));
  return out;
}

// 세션 일정(data/sessions.json). 꼴에 기대지 않는다: 제목 · 때 · 곳으로 보이는 글만 쓴다. 읽을 수 없으면 건너뛴다.
export function sessionEntries(json) {
  try {
    let list = Array.isArray(json) ? json : null;
    if (!list && json && typeof json === 'object') {
      list = ['sessions', 'items', 'events', 'list'].map((k) => json[k]).find(Array.isArray) || Object.values(json).find(Array.isArray);
    }
    if (!list) return [];
    const top = json && !Array.isArray(json) && typeof json === 'object' ? json : {};
    const str = (v) => (typeof v === 'string' ? v.trim() : v && typeof v === 'object' ? String(v.ko || v.en || '').trim() : typeof v === 'number' ? String(v) : '');
    const first = (it, keys) => keys.map((k) => str(it[k])).find(Boolean) || '';
    const link = typeof top.link === 'string' && top.link.startsWith('#/') ? top.link : SESSIONS_LINK;
    const out = [];
    for (const it of list) {
      if (!it || typeof it !== 'object') continue;
      const title = first(it, ['title', 'name', 'ko', 't', 'session']);
      if (!title) continue;
      const date = first(it, ['date', 'day']);
      const from = first(it, ['from', 'start', 'begin', 'time']);
      const to = first(it, ['to', 'end']);
      const when = first(it, ['when']) || [md(date) || date, from && to ? `${from} ~ ${to}` : from].filter(Boolean).join(' ');
      const place = first(it, ['where', 'place', 'room', 'venue', 'location', 'hall']);
      // 출처: 줄에 source가 있으면 그것, 없으면 자료 머리의 source에 줄의 url(그 세션 쪽)을 쓴다.
      // 확인한 날짜는 read, 없으면 받은 때(v)의 날짜 부분이다. 날짜를 못 찾으면 출처를 보이지 않는다.
      const head = [it.source, top.source].find((s) => s && typeof s === 'object' && s.url);
      const url = [str(it.url).startsWith('https://') ? str(it.url) : '', head && head.url].find(Boolean);
      const read = [head && head.read, it.read, top.read, top.v].map((v) => String(v || '').slice(0, 10)).find((v) => /^\d{4}-\d\d-\d\d$/.test(v));
      const src = url && read ? { ko: str(head && head.ko) || '세션 일정', url, read } : null;
      out.push(entry('sessions', {
        title, text: [when, place].filter(Boolean).join(' '), show: [when, place].filter(Boolean).join(' · '),
        src, note: src ? '' : '세션 일정 자료',
        spot: '세션 일정', to: link, toKo: '세션 일정에서 보기',
      }));
    }
    return out;
  } catch {
    return [];
  }
}

// ---------- 찾기 ----------

// 자주 묻는 것 맞추기. keys는 물음에 들어 있으면(공백 없이 견줌) 크게, 낱말이 keys의 일부면 작게 친다.
export function matchFaq(query, faq) {
  const ws = words(query);
  const qn = lower(query).replace(/\s+/g, '');
  if (!qn) return [];
  const hits = [];
  for (const it of faq?.items || []) {
    let score = 0;
    for (const key of it.keys || []) {
      const k = lower(key).replace(/\s+/g, '');
      if (k.length < 2) continue;
      if (qn.includes(k)) score += 10;
      else if (ws.some((w) => w.strong.some((c) => c.length >= 2 && k.includes(c)))) score += 5;
    }
    // 물음 글에 모든 낱말이 들어 있을 때만 쓴다 (낱말 하나만 겹친 물음은 끌어오지 않는다).
    const title = lower(it.q);
    if (ws.length && ws.every((w) => w.strong.some((c) => title.includes(c)))) score += 8 * ws.length;
    if (score > 0) hits.push({ item: it, score });
  }
  return hits.sort((a, b) => b.score - a.score);
}

// 갈래별로 찾는다. 회사는 따로(찾기 코어가 느리게 올 수 있어) companyHits로 찾는다.
export function searchAll(query, entries, faq) {
  const ws = words(query);
  const byKind = new Map();
  for (const e of entries) {
    const score = scoreText(ws, e.t, e.x);
    if (score > 0) byKind.set(e.kind, [...(byKind.get(e.kind) || []), { e, score }]);
  }
  const groups = GROUPS.map((g) => {
    const hits = (byKind.get(g.k) || []).sort((a, b) => b.score - a.score);
    return { ...g, score: hits[0]?.score || 0, hits: hits.map((h) => h.e) };
  }).filter((g) => g.hits.length).sort((a, b) => b.score - a.score);
  return { words: ws, faq: matchFaq(query, faq).map((h) => h.item), groups };
}

// 회사: 찾기 코어로 찾는다. 긴 물음은 낱말마다 찾아 여러 낱말에 걸린 회사를 앞에 둔다.
// finder = { core, data } (web/data.js의 getFinder). 돌려주는 것: { rows, total }
export function companyHits(query, finder, limit = 5) {
  const q = String(query || '').trim();
  if (!q) return { rows: [], total: 0 };
  let ids = finder.core.search(q, 200);
  if (!ids.length) {
    const count = new Map();
    for (const w of words(q).slice(0, 4)) for (const i of finder.core.search(w.strong[0], 100)) count.set(i, (count.get(i) || 0) + 1);
    ids = [...count].sort((a, b) => b[1] - a[1]).map(([i]) => i);
  }
  return { rows: ids.slice(0, limit).map((i) => finder.data.ex[i]), total: ids.length };
}
