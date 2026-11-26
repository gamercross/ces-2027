// 만난 사람의 셈: 읽은 글(QR · 손으로 넣은 글)을 살피고, 사람으로 만들고, 같은 사람을 합친다.
// 화면과 따로 두어 Node에서도 시험한다. 폰에만 남기며 밖으로 보내지 않는다 (일기 보내기 묶음에도 넣지 않는다).

export const MAX_URL = 300;

const KIND_KO = { github: '깃허브', discord: '디스코드', linkedin: '링크드인', web: '웹 주소' };
export const kindKo = (k) => KIND_KO[k] || KIND_KO.web;

const hostIs = (host, root) => host === root || host.endsWith(`.${root}`);

// 읽은 글 하나를 살핀다. https 주소만 받고, 주소 없이 아이디만 있으면 어느 쪽 것인지(hint: 'github' | 'discord' | 'auto')로 푼다.
// 'auto'(카메라용): 우리 앱의 QR은 깃허브는 주소, 디스코드는 아이디 글자이므로 아이디만 있으면 디스코드로 본다.
// 돌려주는 것: { ok: true, link: { kind, url, label, key } } 또는 { ok: false, why }
export function parseScan(input, hint = 'github') {
  const s = String(input ?? '').trim();
  if (!s) return { ok: false, why: '비어 있다. 주소나 아이디를 적는다.' };
  if (/[\s<>"]/.test(s) && !/^https?:\/\//i.test(s)) return { ok: false, why: '주소나 아이디로 읽을 수 없다.' };
  if (/^http:\/\//i.test(s)) return { ok: false, why: 'https가 아닌 주소(http)는 받지 않는다.' };
  if (/^https:\/\//i.test(s)) return fromUrl(s);
  // 다른 꼴의 글(mailto: · tel: · BEGIN:VCARD · wifi 같은 것)은 연락처를 담고 있을 수 있어 받지 않는다.
  if (/^[a-z][a-z0-9+.-]*:/i.test(s) && !/^[a-z0-9.-]+\.[a-z]{2,}(?::\d+)?\//i.test(s)) return { ok: false, why: 'https 주소가 아닌 QR이라 받지 않는다.' };
  // 주소 앞부분을 뺀 글: github.com/아이디 · discord.gg/코드 · linkedin.com/in/아이디 · 일반 도메인
  if (/^(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?::\d+)?(?:[/?#]|$)/i.test(s) && !/^@/.test(s)) {
    // "seal.bot" 같은 디스코드 아이디와 구분: 경로가 있거나 알려진 주소일 때만 주소로 본다.
    const host = s.split(/[/?#:]/)[0].toLowerCase();
    const known = ['github.com', 'discord.gg', 'discord.com', 'discordapp.com', 'linkedin.com'].some((r) => hostIs(host, r));
    if (known || /[/]/.test(s)) return fromUrl(`https://${s}`);
  }
  const id = s.replace(/^@/, '');
  if (hint === 'auto') hint = /^[\w.]{2,32}$/.test(id) ? 'discord' : 'github';
  if (hint === 'discord') {
    if (/^[\w.]{2,32}$/.test(id)) return { ok: true, link: { kind: 'discord', url: '', label: id, key: `discord:${id.toLowerCase()}` } };
    return { ok: false, why: '디스코드 아이디는 영문 · 숫자 · 밑줄 · 점 2 ~ 32자다.' };
  }
  if (/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(id)) {
    const url = `https://github.com/${id}`;
    return { ok: true, link: { kind: 'github', url, label: `github.com/${id}`, key: `github:${id.toLowerCase()}` } };
  }
  return { ok: false, why: '깃허브 아이디는 영문 · 숫자 · - 로 39자까지다.' };
}

function fromUrl(text) {
  if (text.length > MAX_URL) return { ok: false, why: `주소가 너무 길다 (${MAX_URL}자까지).` };
  let u;
  try { u = new URL(text); } catch { return { ok: false, why: '주소 꼴이 아니다.' }; }
  if (u.protocol !== 'https:') return { ok: false, why: 'https 주소만 받는다.' };
  if (u.username || u.password) return { ok: false, why: '아이디나 비밀번호가 들어 있는 주소는 받지 않는다.' };
  const host = u.hostname.toLowerCase();
  if (!host.includes('.') || /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.startsWith('[')) return { ok: false, why: '회사나 사람의 웹 주소가 아니다.' };
  const parts = u.pathname.split('/').filter(Boolean);
  if (hostIs(host, 'github.com') && parts.length === 1 && /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/.test(parts[0])) {
    return { ok: true, link: { kind: 'github', url: `https://github.com/${parts[0]}`, label: `github.com/${parts[0]}`, key: `github:${parts[0].toLowerCase()}` } };
  }
  if (host === 'discord.gg' && parts.length === 1) {
    return { ok: true, link: { kind: 'discord', url: `https://discord.gg/${parts[0]}`, label: `discord.gg/${parts[0]}`, key: `discord:${parts[0].toLowerCase()}` } };
  }
  if (hostIs(host, 'discord.com') || hostIs(host, 'discordapp.com')) {
    const url = `https://${host}${u.pathname.replace(/\/$/, '')}${u.search}`;
    return { ok: true, link: { kind: 'discord', url, label: url.replace('https://', ''), key: `discord:${url.replace('https://', '').toLowerCase()}` } };
  }
  if (hostIs(host, 'linkedin.com') && parts[0] === 'in' && parts[1]) {
    return { ok: true, link: { kind: 'linkedin', url: `https://www.linkedin.com/in/${parts[1]}`, label: `linkedin.com/in/${parts[1]}`, key: `linkedin:${parts[1].toLowerCase()}` } };
  }
  const path = u.pathname === '/' ? '' : u.pathname.replace(/\/$/, '');
  const kind = hostIs(host, 'linkedin.com') ? 'linkedin' : hostIs(host, 'github.com') ? 'github' : 'web';
  const url = `https://${host}${u.port ? `:${u.port}` : ''}${path}${u.search}`;
  return { ok: true, link: { kind, url, label: `${host}${path}`, key: `web:${host}${path}${u.search}`.toLowerCase() } };
}

// 저장해 둔 주소를 열 때 다시 한 번 살핀다 (폰에 남은 값이 바뀌어도 https만 연다).
export function safeHref(url) {
  if (typeof url !== 'string' || !/^https:\/\//i.test(url)) return '';
  const r = fromUrl(url);
  return r.ok ? r.link.url : '';
}

// 읽은 글로 사람을 만든다. link가 틀리면 만들지 않는다.
export function personFromScan(text, ctx = {}) {
  const r = parseScan(text, ctx.hint);
  if (!r.ok) return r;
  return { ok: true, person: makePerson({ ...ctx, links: [r.link] }) };
}

// 만난 사람 한 줄 메모의 글자 수 한도. 고치기의 메모 칸과 받자마자 뜨는 "무슨 대화를 했나" 칸이 같이 쓴다.
export const NOTE_MAX = 200;
// 부르는 이름의 글자 수 한도. 고치기의 이름 칸과 받자마자 뜨는 이름 칸이 같이 쓴다.
export const NICK_MAX = 20;

const clip = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
const isDate = (s) => typeof s === 'string' && /^\d{4}-\d\d-\d\d$/.test(s);

export function makePerson(p) {
  return {
    id: clip(p.id, 40) || `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    nick: clip(p.nick, NICK_MAX),
    links: (Array.isArray(p.links) ? p.links : []).filter((l) => l && l.key && (l.kind === 'discord' || safeHref(l.url))).map((l) => ({ kind: l.kind, url: l.url || '', label: clip(l.label, 120), key: clip(l.key, 400) })),
    met: isDate(p.met) ? p.met : '',
    company: clip(p.company, 80),
    exId: clip(p.exId, 40),
    booth: clip(p.booth, 40),
    note: clip(p.note, NOTE_MAX),
  };
}

// 폰에 남은 목록이 이상해도 화면이 깨지지 않게 걸러 낸다.
export function cleanPeople(list) {
  if (!Array.isArray(list)) return [];
  return list.filter((p) => p && typeof p === 'object' && typeof p.id === 'string').map(makePerson);
}

const keysOf = (p) => new Set(p.links.map((l) => l.key));
const shares = (a, b) => { const k = keysOf(a); return b.links.some((l) => k.has(l.key)); };

function mergeTwo(winner, other) {
  const seen = keysOf(winner);
  const links = [...winner.links, ...other.links.filter((l) => !seen.has(l.key))];
  const pick = (a, b) => a || b;
  const met = winner.met && other.met ? (winner.met < other.met ? winner.met : other.met) : pick(winner.met, other.met);
  return { ...winner, links, met, nick: pick(winner.nick, other.nick), note: pick(winner.note, other.note), company: pick(winner.company, other.company), exId: winner.company ? winner.exId : other.exId, booth: winner.company ? winner.booth : other.booth };
}

// 사람 하나를 목록에 넣는다. 같은 주소를 가진 사람이 이미 있으면 한 사람으로 합친다.
// - 고치는 사람(같은 id가 목록에 있음): 그 사람 자리에 놓고, 같은 주소를 가진 다른 사람을 합쳐 넣는다.
// - 새 사람: 먼저 있던 사람의 id를 쓰고, 새로 적은 값이 비어 있지 않으면 그 값이 이긴다.
// 돌려주는 것: { list, person, merged: 합쳐진 사람 수 }
export function upsert(list, incoming) {
  const person = makePerson(incoming);
  const editing = list.some((p) => p.id === person.id);
  const others = list.filter((p) => p.id !== person.id && shares(p, person));
  let base = person;
  let absorb = others;
  if (!editing && others.length) {
    // 새로 읽은 것이 이미 있는 사람이면, 먼저 있던 사람에게 새 값을 얹는다.
    base = { ...mergeTwo(person, others[0]), id: others[0].id };
    absorb = others.slice(1);
  }
  for (const o of absorb) base = mergeTwo(base, o);
  const dropped = new Set(absorb.map((o) => o.id));
  const next = list.filter((p) => !dropped.has(p.id));
  const idx = next.findIndex((p) => p.id === base.id);
  if (idx >= 0) next[idx] = base; else next.push(base);
  return { list: next, person: base, merged: others.length };
}

// 이미 남은 사람에게 받자마자 적은 두 칸을 넣는다(R61: "무슨 대화를 했나" 한 줄 → 메모, 이름 → 부르는 이름).
// 비운 칸은 그대로 두고, 둘 다 비었거나 그 사람이 없으면 null.
export function withTalk(list, id, { note = '', nick = '' } = {}) {
  const p = list.find((x) => x.id === id);
  const text = typeof note === 'string' ? note.trim() : '';
  const name = typeof nick === 'string' ? nick.trim() : '';
  if (!p || (!text && !name)) return null;
  return upsert(list, { ...p, note: text || p.note, nick: name || p.nick });
}

export const removePerson = (list, id) => list.filter((p) => p.id !== id);

// 회사에서 만난 사람 수: 회사 번호가 있으면 번호로, 없으면 적은 이름으로 센다.
const norm = (s) => String(s || '').trim().toLowerCase();
export function sameCompany(person, entry) {
  if (person.exId && entry.exId) return person.exId === entry.exId;
  return !!person.company && norm(person.company) === norm(entry.company);
}
export const countAt = (people, entry) => people.filter((p) => sameCompany(p, entry)).length;
