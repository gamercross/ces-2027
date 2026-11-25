// 길 안내의 셈: 남은 거리 · 걷는 시간 · 방향. 화면과 따로 두어 Node에서도 시험한다 (scripts/smoke.mjs).
// 지도 좌표(world)는 캠퍼스마다 줄여 그린 것이라 미터는 어림이다. 같은 캠퍼스는 지도 좌표 × 캠퍼스 배율,
// 다른 캠퍼스는 캠퍼스 중심의 실제 위도 · 경도 거리를 쓴다. 걷는 시간은 사람이 많은 전시장을 걷는 속도(분당 70m)로 센다.

export const WALK_M_PER_MIN = 70;
export const ARRIVED_M = 30;

// 캠퍼스의 지도 한 칸이 몇 미터쯤인가: toWorld.scale이 1보다 작으면 줄여 그린 것이라 그만큼 더 멀다.
export const mPerUnit = (campus) => 1 / (campus?.toWorld?.scale || 1);

// 지도는 위가 북쪽이고 z는 아래(남쪽)로 늘어난다. (dx, dz)가 가리키는 방향의 말.
const WORDS = ['북', '북동', '동', '남동', '남', '남서', '서', '북서'];
export function bearingWord(dx, dz) {
  if (!dx && !dz) return '';
  const deg = (Math.atan2(dx, -dz) * 180) / Math.PI;
  return `${WORDS[Math.round(((deg + 360) % 360) / 45) % 8]}쪽`;
}
// 방향 각도(도, 위쪽이 0, 시계 방향). 화살표를 돌리는 데 쓴다.
export const bearingDeg = (dx, dz) => (((Math.atan2(dx, -dz) * 180) / Math.PI) + 360) % 360;

export function fmtDistance(m) {
  if (!Number.isFinite(m)) return '';
  if (m < 100) return `${Math.max(10, Math.round(m / 10) * 10)}m`;
  if (m < 1000) return `${Math.round(m / 50) * 50}m`;
  return `${(m / 1000).toFixed(m < 10000 ? 1 : 0)}km`;
}

// 하버사인 미터
export function geoMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000, rad = (d) => (d * Math.PI) / 180;
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// from: [x, z] 내 자리(지도 좌표) · to: [x, z] 목적지 · opt: { campusFrom, campusTo(캠퍼스 자료), me(GPS {lat, lng} 또는 null), coarse(GPS가 캠퍼스까지만 맞았나) }
// 돌려주는 것: { meters, minutes, word, sameCampus, arrived, coarse }
export function estimate(from, to, opt = {}) {
  const { campusFrom, campusTo, me, coarse = false } = opt;
  const dx = to[0] - from[0], dz = to[1] - from[1];
  const sameCampus = !campusFrom || !campusTo || campusFrom.k === campusTo.k;
  let meters;
  if (sameCampus) meters = Math.hypot(dx, dz) * mPerUnit(campusTo || campusFrom);
  else if (me && campusTo?.geo) meters = geoMeters(me.lat, me.lng, campusTo.geo.lat, campusTo.geo.lng);
  else if (campusFrom?.geo && campusTo?.geo) meters = geoMeters(campusFrom.geo.lat, campusFrom.geo.lng, campusTo.geo.lat, campusTo.geo.lng);
  else meters = Math.hypot(dx, dz);
  // 곧게 가는 거리보다 길을 돌아가니 조금 더 센다.
  const walk = meters * 1.25;
  return { meters: walk, minutes: Math.max(1, Math.round(walk / WALK_M_PER_MIN)), word: bearingWord(dx, dz), deg: bearingDeg(dx, dz), sameCampus, arrived: sameCampus && walk <= ARRIVED_M && !coarse, coarse };
}

// 캠퍼스가 바뀌는 걸음(갈 곳 탭의 한 줄): 걸어서 몇 분쯤인가. 길 안내 띠가 다른 캠퍼스에 쓰는 어림 그대로다(캠퍼스 중심 사이 거리).
// 같은 캠퍼스이거나 캠퍼스 · 자리를 모르면 null.
export function campusHop(campusFrom, campusTo) {
  if (!campusFrom?.geo || !campusTo?.geo || campusFrom.k === campusTo.k) return null;
  return estimate([0, 0], [0, 0], { campusFrom, campusTo }).minutes;
}
