// 주제 판(출발 전 판): 올해의 IT 주제를 10개까지 정하고, 주제마다 볼 회사와 네 태그 칸을 적는다.
// docs/기록틀.md 1절의 꼴이다. 화면과 따로 두어 Node에서도 시험한다.

export const MAX_TOPICS = 10;

const newId = () => `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// 새 주제. cats는 CES 공식 분야 이름들.
export function newTopic(name, cats = []) {
  return { id: newId(), name: String(name || '').trim().slice(0, 40), cats: [...cats], notes: { stu: '', job: '', ret: '', mid: '' }, ex: [] };
}

// 분야마다 전시사 수와 혁신상 수.
export function categoryStats(data) {
  const stats = data.cats.map((cat, i) => ({ cat, i, count: 0, awards: 0 }));
  for (const row of data.ex) {
    if (!row[4]) continue;
    for (const c of row[4].split('.')) {
      stats[c].count += 1;
      if (row[5] > 0) stats[c].awards += 1;
    }
  }
  return stats;
}

// 주제 후보: 공식 분야를, 내 태그에 맞는 것 먼저 · 혁신상이 많은 것 먼저 · 전시사가 많은 것 먼저로 세운다.
// 이미 주제에 든 분야는 뺀다. 후보일 뿐이고 주제를 정하는 것은 사람이다.
export function candidates(data, table, tag, topics) {
  const used = new Set(topics.flatMap((t) => t.cats));
  const mine = new Set((tag && table.audiences?.[tag]) || []);
  return categoryStats(data)
    .filter((s) => s.count > 0 && !used.has(s.cat))
    .map((s) => ({ ...s, ko: table.ko[s.cat] || s.cat, mine: mine.has(s.cat) }))
    .sort((a, b) => Number(b.mine) - Number(a.mine) || b.awards - a.awards || b.count - a.count || a.cat.localeCompare(b.cat));
}

const inTopicCats = (row, catIndex) => !!row[4] && row[4].split('.').some((c) => catIndex.has(Number(c)));

// 주제에 넣은 회사 줄 (넣은 차례). 새로 받은 자료에서 빠진 회사는 건너뛴다.
export function pinned(topic, data) {
  const byId = new Map(data.ex.map((r) => [r[0], r]));
  return topic.ex.map((id) => byId.get(id)).filter(Boolean);
}

// 볼 회사 후보: 주제의 분야에 든 회사 가운데 혁신상을 받은 곳 (최고 혁신상 먼저, 그다음 이름 차례). 이미 넣은 곳은 뺀다.
// others는 혁신상이 없는 나머지 회사 수다.
export function suggestions(topic, data) {
  const catIndex = new Set(topic.cats.map((c) => data.cats.indexOf(c)).filter((i) => i >= 0));
  const have = new Set(topic.ex);
  const awards = [];
  let others = 0;
  for (const row of data.ex) {
    if (have.has(row[0]) || !inTopicCats(row, catIndex)) continue;
    if (row[5] > 0) awards.push(row); else others += 1;
  }
  awards.sort((a, b) => (b[5] & 2) - (a[5] & 2) || a[1].localeCompare(b[1]));
  return { awards, others };
}

const cell = (s) => String(s || '').replace(/\s+/g, ' ').replace(/\|/g, '/').trim();

// 출발 전 판 한 장 (마크다운). 내 노트(my-os)에 붙여 넣거나 팀과 나눈다.
// tags는 [{ k, ko }], placeKo는 장소 기호 → 한글 이름.
export function boardMarkdown(topics, data, placeKo, tags, today) {
  const lines = [
    '# CES 2027 출발 전 판',
    '',
    `- 만든 날: ${today}`,
    `- 전시사 자료: CES 공식 전시사 검색, ${data.v}에 받음`,
    '- 부스 자리는 짐작이다. 가기 전에 공식 안내로 다시 확인한다.',
    '',
    `| # | 주제 | 볼 곳 | ${tags.map((t) => t.ko).join(' | ')} |`,
    `|---|---|---|${tags.map(() => '---').join('|')}|`,
  ];
  topics.forEach((t, n) => {
    const see = pinned(t, data).map((r) => {
      const first = r[7][0];
      if (!first) return r[1];
      const at = first.lastIndexOf('@');
      return `${r[1]} (${placeKo.get(first.slice(at + 1)) || '장소 모름'} ${first.slice(0, at)})`;
    });
    lines.push(`| ${n + 1} | ${cell(t.name)} | ${cell(see.join(', ')) || '아직 없음'} | ${tags.map((tag) => cell(t.notes?.[tag.k])).join(' | ')} |`);
  });
  if (!topics.length) lines.push('| | 아직 주제가 없다 | | ' + tags.map(() => '').join(' | ') + ' |');
  lines.push('', '칸마다 "이 사람에게 무엇이 달라지나 · 해 볼 것 하나"를 적는다.');
  return lines.join('\n') + '\n';
}

// 팀 주제(data/topics.json)에서 아직 내 판에 없는 것을 새 주제로 만든다. 10개를 넘기지 않는다.
export function fromTeam(team, mine, data) {
  const have = new Set(mine.map((t) => t.name));
  const out = [];
  for (const t of team?.topics || []) {
    if (!t?.name || have.has(t.name) || mine.length + out.length >= MAX_TOPICS) continue;
    out.push(newTopic(t.name, (t.cats || []).filter((c) => data.cats.includes(c))));
  }
  return out;
}
