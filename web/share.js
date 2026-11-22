// 내 목록(관심 · 동선)을 나누고 내보낸다. reference/미리보기판의 "목록 코드 · 링크 · 글 · 마크다운 · CSV"에서 옮겼다.
// 화면과 따로 두어 Node에서도 시험한다.
//
// 목록 코드: 회사 id의 뒤 일곱 글자와 날짜를 "abc1234.1,def5678" 꼴로 잇는다 (날짜 미정은 점 없이).
// 링크는 주소 뒤에 "#plan=<코드>"를 붙인 것이다. 받은 사람이 열면 자기 목록에 더할지 묻는다.

const SHORT = 7;
export const shortId = (id) => (id.length > SHORT ? id.slice(-SHORT) : id);
const clampDay = (d) => Math.max(0, Math.min(5, parseInt(d || '0', 10) || 0));

export function planCode(items) {
  return items.map((it) => shortId(it.id) + (it.day ? `.${it.day}` : '')).join(',');
}

export function shareLink(base, items) {
  return `${base.split('#')[0]}#plan=${planCode(items)}`;
}

// 코드나 링크를 읽어 [{ id, day }]로 돌려준다. 받은 자료에 없는 회사와 겹친 것은 뺀다.
// ids는 지금 자료의 회사 id 전부다.
export function readCode(text, ids) {
  let s = String(text || '').trim();
  const m = s.match(/plan=([^&\s]+)/);
  if (m) { try { s = decodeURIComponent(m[1]); } catch { s = m[1]; } }
  const byShort = new Map();
  for (const id of ids) if (!byShort.has(shortId(id))) byShort.set(shortId(id), id);
  const seen = new Set();
  const out = [];
  for (const part of s.split(',')) {
    const [short, day] = part.trim().split('.');
    const id = byShort.get(short);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, day: clampDay(day) });
  }
  return out;
}

// 받은 목록에서 내게 없는 것만 뒤에 더한다. { items, added }
export function mergeItems(mine, incoming) {
  const have = new Set(mine.map((it) => it.id));
  const fresh = incoming.filter((it) => !have.has(it.id));
  return { items: [...mine, ...fresh], added: fresh.length };
}

// 날짜마다 묶어 차례를 붙인다. days는 [{ key, ko, short }] (미정 포함), byId는 id → 전시사 줄.
function grouped(items, days, byId) {
  return days
    .map((d) => ({ d, rows: items.filter((it) => (it.day || 0) === d.key).map((it) => byId.get(it.id)).filter(Boolean) }))
    .filter((g) => g.rows.length);
}
const codesOf = (row) => row[7].map((b) => b.slice(0, b.lastIndexOf('@')));
const placesOf = (row, placeKo) => [...new Set(row[7].map((b) => placeKo.get(b.slice(b.lastIndexOf('@') + 1)) || '장소 모름'))];

// 단톡방에 붙여 넣을 글.
export function planText(items, days, byId, placeKo) {
  let t = '[CES 2027 내 동선]\n';
  for (const { d, rows } of grouped(items, days, byId)) {
    t += `\n■ ${d.ko}\n`;
    rows.forEach((r, j) => { t += `${j + 1}. ${r[1]} · ${`${placesOf(r, placeKo)[0] || '부스 미정'} ${codesOf(r)[0] || ''}`.trim()}\n`; });
  }
  t += `\n목록 코드: ${planCode(items)}\n(동선 화면의 "코드 넣기"에 붙여 넣으면 같은 목록을 더할 수 있다. 부스 자리는 짐작이다.)`;
  return t;
}

// 내 노트에 둘 마크다운.
export function planMd(items, days, byId, placeKo, dataDate, today) {
  let t = `---\n제목: "CES 2027 내 동선"\n종류: 연수기록\n날짜: ${today}\n출처: CES 2027 준비 지도 (전시사 자료 ${dataDate}에 받음)\n---\n\n# CES 2027 내 동선\n\n자리와 걷는 차례는 부스 번호로 짐작한 것이다. 공식 배치도로 다시 확인한다.\n`;
  for (const { d, rows } of grouped(items, days, byId)) {
    t += `\n## ${d.ko}\n\n| # | 회사 | 부스 | 장소 |\n|---|---|---|---|\n`;
    rows.forEach((r, j) => { t += `| ${j + 1} | ${r[1].replace(/\|/g, '/')} | ${codesOf(r).join(', ')} | ${placesOf(r, placeKo).join(', ')} |\n`; });
  }
  return t;
}

// 표 프로그램에서 열 CSV (엑셀이 한글을 읽도록 앞에 BOM을 둔다).
export function planCsv(items, days, byId, placeKo, data) {
  const q = (s) => `"${String(s == null ? '' : s).replace(/"/g, '""')}"`;
  let t = '﻿날짜,순서,회사,부스,장소,나라,분야,공식 페이지\n';
  for (const { d, rows } of grouped(items, days, byId)) {
    rows.forEach((r, j) => {
      const cats = r[4] ? r[4].split('.').map((c) => data.catsKo[c] || data.cats[c]).join(' / ') : '';
      t += [d.short, j + 1, r[1], codesOf(r).join(' / '), placesOf(r, placeKo).join(' / '), r[3] >= 0 ? data.countries[r[3]] : '', cats, data.link.replace('{id}', encodeURIComponent(r[0]))].map(q).join(',') + '\n';
    });
  }
  return t;
}
