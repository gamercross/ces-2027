// 오가는 법: 자료(data/transit.json)를 화면에 쓸 글과 링크로 바꾸는 셈. 화면과 따로 두어 Node에서도 시험한다.

export const STATUS_KO = { confirmed: '2027 확인됨', check: '확인 필요' };

// "07:30" → "7:30"
export const hm = (t) => t.replace(/^0/, '');

// 한 토막: "아침 (숙소 → 전시장) 7:30 ~ 10:30 · 20분마다"
export function partText(data, p) {
  const label = data.parts[p.part] || '';
  return `${label ? `${label} ` : ''}${hm(p.from)} ~ ${hm(p.to)} · ${p.every}분마다`;
}

// 노선의 시간표: [{ days, parts: [글] }]. 시간표가 없는 줄은 [].
export function timetable(data, line) {
  return (data.schedules[line.schedule] || []).map((d) => ({ days: d.days, parts: d.parts.map((p) => partText(data, p)) }));
}

// 타는 곳의 구글맵 주소(Maps URLs만). 장소 자료에 있는 곳은 그 주소를 쓰고, 없으면 이름과 라스베이거스로 찾는다.
export function stopLink(places, stop) {
  const venue = stop.venue && places.venues?.[stop.venue];
  const query = venue ? [stop.query, venue.address].filter(Boolean).join(', ') : `${stop.query}, Las Vegas, NV`;
  return places.mapsUrls.search.replace('{query}', encodeURIComponent(query));
}

// 화면에서 묶는 차례: 전시장 사이와 공항 · 호텔에서 전시장으로 · 그 밖의 길.
export const GROUPS = [
  { k: 'between', ko: '전시장 사이와 공항', kinds: ['express', 'cspace', 'airport'] },
  { k: 'hotel', ko: '호텔에서 전시장으로 (1 ~ 8번)', kinds: ['hotel'] },
  { k: 'other', ko: '그 밖의 길', kinds: ['media', 'monorail', 'loop', 'rideshare', 'hub'] },
];

// 확인된 줄과 확인 필요 줄의 수.
export function counts(data) {
  const check = data.lines.filter((l) => l.status === 'check').length;
  return { total: data.lines.length, confirmed: data.lines.length - check, check };
}
