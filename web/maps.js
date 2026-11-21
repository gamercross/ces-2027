// 구글맵은 Maps URLs만 쓴다 (API 키 없음). 주소 꼴은 장소 자료(data/places.json)의 mapsUrls에 있다.

// 장소를 구글맵에서 열거나(search) 그리로 걸어가는 길을 찾는(directions) 주소. 이름을 모르면 null.
export function mapsLink(places, place, kind = 'search') {
  if (!place?.maps) return null;
  const venue = places.venues[place.maps.venue];
  const query = [place.maps.query, venue?.address].filter(Boolean).join(', ');
  return places.mapsUrls[kind].replace('{query}', encodeURIComponent(query));
}
