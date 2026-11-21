// 추천 즐겨찾기: 동선을 짜기 쉽게 "먼저 볼 만한 회사"를 뽑는다.
// 근거는 CES 공식 자료뿐이다: 혁신상 표시 · 나라(한국) · 전시사가 고른 분야. 우리 평가는 넣지 않는다.
// 추천마다 까닭을 글로 돌려준다. 담는 것은 사람이 한 곳씩 누른다.

// 내 분야: 명함의 태그에 맞는 분야와, 주제 판에 넣은 분야.
export function myCats(table, tag, topics) {
  return new Set([...((tag && table.audiences?.[tag]) || []), ...(topics || []).flatMap((t) => t.cats || [])]);
}

// [{ row, why: [까닭…], score }] — 점수가 높은 차례, 같으면 이름 차례. 이미 관심에 있는 곳은 뺀다.
// 까닭이 하나도 없는 회사는 추천하지 않는다.
export function recommend(data, table, opts) {
  const { tag, topics, have, filter } = opts || {};
  const mine = myCats(table, tag, topics);
  const mineIndex = new Map(data.cats.map((c, i) => [i, mine.has(c) ? (table.ko[c] || c) : null]));
  const korea = data.countries.indexOf('South Korea');
  const skip = have || new Set();
  const out = [];
  for (const row of data.ex) {
    if (skip.has(row[0])) continue;
    const why = [];
    let score = 0;
    const best = (row[5] & 2) !== 0, honoree = (row[5] & 1) !== 0;
    if (best) { why.push('최고 혁신상 2027'); score += 4; } else if (honoree) { why.push('혁신상 2027'); score += 3; }
    const isKorea = row[3] === korea && korea >= 0;
    if (isKorea) { why.push('한국 기업'); score += 2; }
    const matched = row[4] ? row[4].split('.').map((c) => mineIndex.get(Number(c))).filter(Boolean) : [];
    if (matched.length) { why.push(`내 분야: ${matched.slice(0, 3).join(' · ')}`); score += 2 + Math.min(matched.length, 3) * 0.5; }
    if (!why.length) continue;
    if (filter === 'award' && !(best || honoree)) continue;
    if (filter === 'korea' && !isKorea) continue;
    if (filter === 'mine' && !matched.length) continue;
    out.push({ row, why, score });
  }
  out.sort((a, b) => b.score - a.score || a.row[1].localeCompare(b.row[1]));
  return out;
}
