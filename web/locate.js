// 내 위치 맞추기. GPS로는 어느 캠퍼스인지까지, 홀 안은 가까운 부스 번호로 맞춘다.
// 캠퍼스의 위도 · 경도는 어림값이라 가까운 캠퍼스를 고르는 데만 쓴다.

const R = 6371000;
const rad = (d) => (d * Math.PI) / 180;

// 두 곳 사이 거리(m).
export function meters(lat1, lng1, lat2, lng2) {
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// 정확도가 낮거나 갑자기 튄 위치는 내 자리를 옮기지 않는다.
export function fixProblem(previous, next, maxAccuracy = 150, maxSpeed = 3) {
  if (![next?.lat, next?.lng, next?.accuracy, next?.at].every(Number.isFinite) || next.accuracy > maxAccuracy) return 'accuracy';
  if (previous) {
    const elapsed = Math.max(0, (next.at - previous.at) / 1000);
    const allowed = 35 + elapsed * maxSpeed + next.accuracy + previous.accuracy;
    if (meters(next.lat, next.lng, previous.lat, previous.lng) > allowed) return 'jump';
  }
  return null;
}

// 가장 가까운 캠퍼스와 거리. inside는 그 캠퍼스 둘레(반지름) 안인지.
export function nearestCampus(places, lat, lng) {
  let best = null;
  for (const c of places.campuses) {
    if (!c.geo) continue;
    const m = meters(lat, lng, c.geo.lat, c.geo.lng);
    if (!best || m < best.meters) best = { k: c.k, ko: c.ko, meters: m, inside: m <= c.geo.radiusM };
  }
  return best;
}

// 캠퍼스 다음으로, 어느 홀 · 건물 근처인지 짐작한다. 장소 자료의 gpsAreas는 어림 자리라 결과는 늘 짐작이다.
// limit(m)보다 멀면 null.
export function nearestArea(places, lat, lng, limit = 350) {
  let best = null;
  for (const a of places.gpsAreas || []) {
    const m = meters(lat, lng, a.lat, a.lng);
    if (!best || m < best.meters) best = { ko: a.ko, c: a.c, places: a.places, meters: m };
  }
  return best && best.meters <= limit ? best : null;
}

// 적은 부스 글과 같은 부스를 찾는다. 같은 글이 여러 장소에 있으면 모두 돌려준다.
// spots는 web/spots.js의 "장소|부스 글" → 자리.
export function findBooth(spots, text) {
  const want = text.trim().toLowerCase();
  if (!want) return [];
  const out = [];
  for (const [key, spot] of spots) {
    const bar = key.indexOf('|');
    if (key.slice(bar + 1).toLowerCase() === want) out.push({ place: key.slice(0, bar), code: key.slice(bar + 1), x: spot.x, z: spot.z });
  }
  return out;
}

// 숫자 부스 번호가 자료에 없을 때, 같은 장소의 가장 가까운 번호를 찾는다 (옆 부스에 서 있을 때).
export function nearBooth(spots, text) {
  const n = /^\d+$/.test(text.trim()) ? parseInt(text.trim(), 10) : null;
  if (n == null) return null;
  let best = null;
  for (const [key, spot] of spots) {
    const bar = key.indexOf('|');
    const m = key.slice(bar + 1).match(/^(\d+)[a-zA-Z]?$/);
    if (!m) continue;
    const gap = Math.abs(parseInt(m[1], 10) - n);
    if (gap <= 30 && (!best || gap < best.gap)) best = { place: key.slice(0, bar), code: key.slice(bar + 1), x: spot.x, z: spot.z, gap };
  }
  return best;
}
