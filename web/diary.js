// 일기를 폰 밖으로 내보내는 꼴. 화면과 따로 두어 Node에서도 시험한다.
// 내보낸 파일은 자료 도구(`ces-data sort-diary`)가 읽어 네 태그로 나눈다(대화 `talks`는 읽지 않고 지나간다).

import { talkOut } from './talk.js';

export const FORMAT = 'ces-2027-diary';
export const VERSION = 1;

// 보낼 묶음. 명함에서는 별명과 태그만 넣는다(깃허브 · 디스코드는 넣지 않는다).
// talks를 주면(파일로 내려받을 때만) 그 대화가 같이 들어간다. 모으는 곳 주소로 보낼 때는 주지 않는다. 녹음은 어느 때도 넣지 않는다.
export function bundle(entries, profile, now = new Date(), talks = null) {
  return {
    app: FORMAT,
    v: VERSION,
    exportedAt: now.toISOString().replace(/\.\d+Z$/, 'Z'),
    author: { nick: profile?.nick || '', tag: profile?.tag || '' },
    entries: entries.map((e) => ({
      id: e.id,
      date: e.date,
      company: e.company || '',
      exhibitorId: e.exId || '',
      booth: e.booth || '',
      saw: e.saw || '',
      felt: e.felt || '',
      for: Array.isArray(e.for) ? e.for : [],
    })),
    ...(talks?.length ? { talks: talks.map(talkOut) } : {}),
  };
}

// 일기에 이어진 대화만 고른다 (일기의 talkId). all이 true면 폰에 있는 대화 전부.
export function talksFor(entries, talks, all = false) {
  if (all) return talks;
  const ids = new Set(entries.map((e) => e.talkId).filter(Boolean));
  return talks.filter((t) => ids.has(t.id));
}

// 단톡방에 붙여 넣을 글.
export function asText(entries, profile, tagKo) {
  const lines = [`CES 2027 일기 · ${profile?.nick || '이름 없음'}${profile?.tag ? ` (${tagKo(profile.tag)})` : ''}`];
  let day = '';
  for (const e of [...entries].sort((a, b) => a.date.localeCompare(b.date))) {
    if (e.date !== day) { day = e.date; lines.push('', `[${day}]`); }
    lines.push(`- ${e.company || '회사 없음'}${e.for?.length ? ` (${e.for.map(tagKo).join(' · ')}에게)` : ''}`);
    if (e.saw) lines.push(`  본 것: ${e.saw}`);
    if (e.felt) lines.push(`  느낀 점: ${e.felt}`);
  }
  return lines.join('\n');
}

// 모으는 곳 주소가 쓸 수 있는 꼴인지 (https만).
export function collectorUrl(settings) {
  const url = typeof settings?.collectorUrl === 'string' ? settings.collectorUrl.trim() : '';
  return /^https:\/\/[^\s]+$/.test(url) ? url : '';
}

export function fileName(profile, now = new Date()) {
  const nick = (profile?.nick || '이름없음').replace(/[^\p{L}\p{N}_-]+/gu, '');
  const pad = (n) => String(n).padStart(2, '0');
  return `ces2027-일기-${nick || '이름없음'}-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}.json`;
}
