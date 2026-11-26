// 길 안내의 셈: 남은 거리 · 걷는 시간 · 방향. 화면과 따로 두어 Node에서도 시험한다 (scripts/smoke.mjs).
// 지도 좌표(world)는 실제 미터다(장소 자료의 geoRef). 캠퍼스가 같든 다르든 두 점 사이 곧은 거리를 쓰고, 길을 돌아가는 몫을 조금 더한다.
// 걷는 시간은 사람이 많은 전시장을 걷는 속도(분당 70m)로 센다.

export const WALK_M_PER_MIN = 70;
export const ARRIVED_M = 30;

// 지도 한 칸이 몇 미터인가: 지금은 모든 캠퍼스가 실제 미터라 1이다(toWorld.scale이 1). 옛 자료(줄여 그린 캠퍼스)를 읽을 때만 1보다 크다.
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

// from: [x, z] 내 자리(지도 좌표) · to: [x, z] 목적지 · opt: { campusFrom, campusTo(캠퍼스 자료), coarse(GPS가 캠퍼스까지만 맞았나) }
// 돌려주는 것: { meters, minutes, word, sameCampus, arrived, coarse }
export function estimate(from, to, opt = {}) {
  const { campusFrom, campusTo, coarse = false } = opt;
  const dx = to[0] - from[0], dz = to[1] - from[1];
  const sameCampus = !campusFrom || !campusTo || campusFrom.k === campusTo.k;
  const meters = Math.hypot(dx, dz) * mPerUnit(campusTo || campusFrom);
  // 곧게 가는 거리보다 길을 돌아가니 조금 더 센다.
  const walk = meters * 1.25;
  return { meters: walk, minutes: Math.max(1, Math.round(walk / WALK_M_PER_MIN)), word: bearingWord(dx, dz), deg: bearingDeg(dx, dz), sameCampus, arrived: sameCampus && walk <= ARRIVED_M && !coarse, coarse };
}

// 캠퍼스가 바뀌는 걸음(갈 곳 탭의 한 줄): 걸어서 몇 분쯤인가. 두 캠퍼스 가운데(geo) 사이의 실제 거리에 길 안내와 같은 셈을 쓴다.
// 같은 캠퍼스이거나 캠퍼스 · 자리를 모르면 null.
export function campusHop(campusFrom, campusTo) {
  if (!campusFrom?.geo || !campusTo?.geo || campusFrom.k === campusTo.k) return null;
  const walk = geoMeters(campusFrom.geo.lat, campusFrom.geo.lng, campusTo.geo.lat, campusTo.geo.lng) * 1.25;
  return Math.max(1, Math.round(walk / WALK_M_PER_MIN));
}

// 때 어림(갈 곳의 "10:30쯤")에 더하는 이동 시간(R58): 위의 분을 5분 단위로 올린다.
// 때가 5분 단위로 서고, 걷는 시간보다 일찍 닿는다고 적지 않기 위해서다. 캠퍼스가 같거나 모르면 0.
export const HOP_STEP = 5;
export function hopSlot(campusFrom, campusTo) {
  const min = campusHop(campusFrom, campusTo);
  return min ? Math.ceil(min / HOP_STEP) * HOP_STEP : 0;
}
