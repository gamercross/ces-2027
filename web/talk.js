// 대화: 회사마다 넣는 대화(듣기 · 붙여넣기 · 손으로). 화면과 따로 두어 Node에서도 시험한다.
//
// 복사한 대화 기록(파파고 · 구글 번역 꼴도 읽는다)을 붙여 넣으면 줄마다 영어 / 한국어로 나누고(글자로 가림),
// 위 줄 · 아래 줄 짝을 짓는다. 모양이 달라 짝을 못 지으면 그대로 한 덩어리로 둔다.
// 짝의 who는 누가 한 말인지다: them = 상대가 영어로 말했다(영어 줄이 원문) · me = 내가 한국어로 말했다(한국어 줄이 원문).
// 이 앱은 번역하지 않는다. 붙인 글에 없는 말을 만들어 넣지 않는다.

export const MAX_PASTE = 8000;
export const MAX_PAIRS = 200;

// 줄의 말: ko(한글이 글자의 4분의 1 이상) · en · none(글자가 없다: 숫자 · 기호)
export function langOf(s) {
  const ko = (s.match(/[가-힣ㄱ-ㅎㅏ-ㅣ]/g) || []).length;
  const en = (s.match(/[A-Za-z]/g) || []).length;
  if (!ko && !en) return 'none';
  return ko >= (ko + en) * 0.25 ? 'ko' : 'en';
}

// 화면 글자 · 시간 · 날짜 · 앱 이름처럼 대화가 아닌 줄.
const NOISE = [
  /^(오전|오후)?\s*\d{1,2}:\d{2}(:\d{2})?(\s?(AM|PM|am|pm))?$/,
  /^\d{4}[.\-/]\s?\d{1,2}[.\-/]\s?\d{1,2}\.?(\s.*\d{1,2}:\d{2}.*)?$/,
  /^(papago|파파고|네이버 파파고|naver papago|google translate|google 번역|구글 번역|구글 번역기)$/i,
  /^(복사|복사됨|공유|저장|삭제|copy|copied|share|save|delete|대화|대화 모드|conversation|번역|translate|translation|translated|번역됨|원문)$/i,
];
const isNoise = (s) => NOISE.some((re) => re.test(s));

// "영어: …" · "한국어: …" · "English: …" · "원문: …" · "상대: …" 같은 이름표를 뗀다.
const LABEL = /^(영어|한국어|한글|영문|국문|english|korean|eng|kor|en|ko|원문|번역|번역문|상대|상대방|나|me|you|speaker\s*\d|화자\s*\d)\s*[:：]\s*(.*)$/i;

// 한 줄에 원문과 번역이 같이 있는 모양: 탭 · | · 띄어 쓴 / · → · ⇒ · => · -> · ↔
const INLINE = /\t+|\s[|/]\s|\s*(?:→|⇒|➜|↔|=>|->)\s*/;

// 붙인 글을 줄로 가른다: [{ lang: 'en' | 'ko', text, brk }]. brk는 앞에 빈 줄이 있었다는 뜻이다.
export function readLines(raw) {
  const out = [];
  let brk = false;
  let app = '';
  let pending = '';
  const whole = String(raw || '');
  if (/papago|파파고/i.test(whole)) app = 'papago';
  else if (/google\s*(translate|번역)|구글\s*번역/i.test(whole)) app = 'google';
  for (const piece of whole.replace(/[​-‍﻿]/g, '').split(/\r?\n/)) {
    const line = piece.trim();
    if (!line) { brk = true; continue; }
    if (isNoise(line)) continue;
    const parts = INLINE.test(line) ? line.split(INLINE).map((p) => p.trim()).filter(Boolean) : [line];
    const items = parts.length === 2 && langOf(parts[0]) !== 'none' && langOf(parts[1]) !== 'none' && langOf(parts[0]) !== langOf(parts[1]) ? parts : [line];
    for (const item of items) {
      let text = item;
      let hint = '';
      const m = text.match(LABEL);
      if (m) { text = m[2].trim(); hint = /^(영어|영문|english|eng|en)$/i.test(m[1]) ? 'en' : /^(한국어|한글|국문|korean|kor|ko)$/i.test(m[1]) ? 'ko' : ''; }
      if (!text) continue;
      const lang = hint || langOf(text);
      if (lang === 'none') {
        // 숫자 · 기호뿐인 줄은 앞 줄에 붙인다(앞 줄이 없으면 다음 줄 앞에 붙인다).
        if (out.length && !brk) out[out.length - 1].text += ` ${text}`; else pending = pending ? `${pending} ${text}` : text;
      } else {
        out.push({ lang, text: pending ? `${pending} ${text}` : text, brk });
        pending = '';
      }
      brk = false;
    }
  }
  return { lines: out, app };
}

// 같은 말이 이어지는 줄과 빈 줄로 끊긴 곳을 한 덩이(run)로 묶는다.
function runsOf(lines) {
  const runs = [];
  for (const l of lines) {
    const last = runs[runs.length - 1];
    if (last && last.lang === l.lang && !l.brk) last.texts.push(l.text); else runs.push({ lang: l.lang, texts: [l.text], brk: l.brk });
  }
  return runs;
}

const pairOf = (first, x, y) => (first === 'en' ? { who: 'them', en: x, ko: y } : { who: 'me', en: y, ko: x });

// 짝짓기. 위 줄이 원문, 아래 줄이 번역이라고 읽는다. 두 길만 짝으로 인정하고, 아니면 null이다(그때는 그대로 한 덩어리).
//  1) 줄이 둘씩 말이 서로 다르게 이어진다 (영 한 · 한 영 · 영 한 · 한 영 …)
//  2) 같은 말이 몇 줄 이어진 덩이와 다른 말 덩이가 줄 수까지 같다 (영 영 한 한), 또는 빈 줄로 따로 떨어진 한 쌍이다
export function pairLines(lines) {
  if (lines.length < 2) return null;
  let pairs = [];
  if (lines.length % 2 === 0) {
    for (let i = 0; i < lines.length; i += 2) {
      if (lines[i].lang === lines[i + 1].lang) { pairs = null; break; }
      pairs.push(pairOf(lines[i].lang, lines[i].text, lines[i + 1].text));
    }
    if (pairs && pairs.length && pairs.length <= MAX_PAIRS) return pairs;
  }
  const runs = runsOf(lines);
  if (runs.length < 2 || runs.length % 2) return null;
  pairs = [];
  for (let i = 0; i < runs.length; i += 2) {
    const a = runs[i];
    const b = runs[i + 1];
    if (a.lang === b.lang) return null;
    const alone = a.brk === true && (i + 2 >= runs.length || runs[i + 2].brk === true);
    if (a.texts.length === b.texts.length) a.texts.forEach((x, k) => pairs.push(pairOf(a.lang, x, b.texts[k])));
    else if (alone) pairs.push(pairOf(a.lang, a.texts.join(' '), b.texts.join(' ')));
    else return null;
  }
  return pairs.length && pairs.length <= MAX_PAIRS ? pairs : null;
}

// 붙인 글을 나눈다. 돌려주는 것:
//   { kind: 'pairs', pairs: [{ who, en, ko }], app }  — 짝을 지었다
//   { kind: 'block', lines: [{ lang, text }], text, app } — 짝을 못 지어 한 덩어리로 둔다
//   { kind: 'empty' } — 대화 줄이 없다
export function splitPaste(raw) {
  const text = String(raw || '').slice(0, MAX_PASTE);
  const { lines, app } = readLines(text);
  if (!lines.length) return { kind: 'empty', app };
  const pairs = pairLines(lines);
  if (pairs) return { kind: 'pairs', pairs, app };
  return { kind: 'block', lines: lines.slice(0, MAX_PAIRS * 2).map(({ lang, text: t }) => ({ lang, text: t })), text: lines.map((l) => l.text).join('\n'), app };
}

// 손으로 넣은 한 줄: 영어는 상대가 한 말, 한국어는 내가 한 말로 읽는다(누른 쪽이 있으면 그것). 번역은 비워도 된다.
export function handPair(orig, trans, who) {
  const o = String(orig || '').trim().slice(0, 500);
  const t = String(trans || '').trim().slice(0, 500);
  if (!o && !t) return null;
  const lo = langOf(o || t);
  const w = who === 'them' || who === 'me' ? who : lo === 'ko' ? 'me' : 'them';
  const mine = w === 'me';
  return { who: w, en: mine ? t : o, ko: mine ? o : t };
}

// 대화에서 상대가 한 말(영어 원문 줄)과 그 번역. 일기 초안의 "들은 것"은 이 원문 줄만으로 채운다.
export function heardOf(talk) {
  if (!talk) return [];
  if (talk.kind === 'block') return (talk.lines || []).filter((l) => l.lang === 'en').map((l) => ({ t: 0, en: l.text.slice(0, 500), ko: '' }));
  return (talk.pairs || []).filter((p) => p.who === 'them' && p.en).map((p) => ({ t: p.t || 0, en: p.en.slice(0, 500), ko: (p.ko || '').slice(0, 500) }));
}

const SRC_KO = { listen: '듣기', paste: '붙여넣기', hand: '손으로' };
export const sourceKo = (s) => SRC_KO[s] || '';

// 일기 초안: "들은 것"(saw)에는 영어 원문 줄만 붙인다. 번역 줄 · 내가 한 말 · 지어낸 말은 넣지 않는다.
// 번역은 들은 글(heard)에 짝으로 남는다. 느낀 점과 "누구에게"는 비워 둔다.
export function draftFromTalk(talk, date, id) {
  const heard = heardOf(talk);
  const head = heard.slice(0, 4).map((l) => l.en).join(' / ');
  return {
    id,
    date: date || talk.date,
    exId: talk.exId || '',
    company: talk.company || '',
    booth: talk.booth || '',
    saw: head ? `(${SRC_KO[talk.src] || '대화'}로 넣은 대화에서 상대가 한 말의 원문이다. 다듬는다) ${head}`.slice(0, 600) : '',
    felt: '',
    for: [],
    sent: null,
    draft: true,
    heard,
    talkId: talk.id,
  };
}

// 저장할 대화 한 건. kind가 pairs면 pairs, block이면 lines · text를 담는다.
export function makeTalk(parts, company, date, id) {
  const base = { id, exId: company.id || '', company: company.name || '', booth: company.booth || '', date, src: parts.src, app: parts.app || '' };
  if (parts.kind === 'block') return { ...base, kind: 'block', lines: parts.lines.slice(0, MAX_PAIRS * 2), text: String(parts.text || '').slice(0, MAX_PASTE) };
  return { ...base, kind: 'pairs', pairs: parts.pairs.slice(0, MAX_PAIRS).map((p) => ({ who: p.who === 'me' ? 'me' : 'them', en: String(p.en || '').slice(0, 500), ko: String(p.ko || '').slice(0, 500), ...(p.t ? { t: Math.round(p.t) } : {}) })) };
}

// 파일로 내보낼 꼴: 같은 대화를 폰 밖으로 줄 때. 녹음은 담지 않는다.
export function talkOut(t) {
  return {
    id: t.id,
    date: t.date,
    exhibitorId: t.exId || '',
    company: t.company || '',
    booth: t.booth || '',
    source: t.src || '',
    kind: t.kind,
    ...(t.kind === 'block' ? { lines: (t.lines || []).map((l) => ({ lang: l.lang, text: l.text })) } : { pairs: (t.pairs || []).map((p) => ({ who: p.who, en: p.en, ko: p.ko })) }),
  };
}

export const countOf = (t) => (t.kind === 'block' ? (t.lines || []).length : (t.pairs || []).length);
