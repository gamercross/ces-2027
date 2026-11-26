// 홀 안 부스 자리(대략). 자리와 크기는 web/boothgrid.js가 정한다(부스 번호 → 줄 · 차례 → 실제 홀 모양 안의 네모).
// 여기는 예전 이름(boothSpots · spotOf)을 그대로 두어, 지도 · 길 안내 · 갈 곳이 바뀌지 않고 같은 자리를 쓰게 한다.

import { boothBoxes } from './boothgrid.js';
import { splitBooth } from './route.js';


// 전시사 자료의 부스를 모두 놓는다. "장소|부스 글" → { x, z(가운데), w, d(네모 크기, 미터), official? }.
// official은 정식 배치도에서 옮긴 자리(data/booth-spots.json)다. 거기에 있는 부스는 대략 대신 그 자리를 쓰고 official: true가 붙는다.
export const boothSpots = (places, exhibitors, official) => boothBoxes(places, exhibitors, official);

// "글@장소" 한 부스의 자리. 없으면 null.
export function spotOf(spots, booth) {
  if (!booth) return null;
  const { code, place } = splitBooth(booth);
  return spots.get(`${place}|${code}`) || null;
}
