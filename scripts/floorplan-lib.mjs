// 정식 배치도(공식 전시사 검색의 Floor Plan)가 열렸는지 보고, 열리면 부스 좌표를 이 레포의 좌표로 옮기는 셈.
// 화면과 따로 두어 Node에서도 시험한다 (scripts/smoke.mjs). 바깥 패키지를 쓰지 않는다.
// 배치도의 실제 꼴(그림 · 좌표가 든 응답 · PDF)은 열려 봐야 안다. 그래서 여기서는 "꼴을 안 가리는 부분"만 미리 만들었다:
// 열렸는지 보기, 좌표 옮기기, 틀린 것 거르기, 모자라는 부스 세기.

// 공식 전시사 검색 첫 화면의 `validHalls = [...]`에서 홀 목록을 읽는다. 읽지 못하면 null.
export function parseValidHalls(html) {
  const m = /validHalls\s*=\s*(\[[^\]]*\])/.exec(String(html || ''));
  if (!m) return null;
  try { const list = JSON.parse(m[1].replace(/'/g, '"')); return Array.isArray(list) ? list : null; } catch { return null; }
}
export const isOpen = (halls) => Array.isArray(halls) && halls.length > 0;

// 점들의 바깥 상자 [x0, y0, x1, y1]
export function bboxOf(points) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of points) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  return [x0, y0, x1, y1];
}

// 배치도 그림의 좌표(plan.bbox 또는 booths 전체의 상자)를 그 장소의 모양(poly) 상자에 맞춰 늘이고 옮긴다.
// opt.swap: 배치도가 옆으로 누워 있으면(x · y가 바뀌어 있으면) true · opt.flipX / opt.flipY: 방향이 거꾸로면 true
// 돌려주는 것: { spots: { 부스: [x, z] }, outside: [부스…] (장소 상자에서 10% 넘게 벗어난 것), box }
export function convert(input, place, opt = {}) {
  const raw = Object.entries(input.booths || {}).filter(([, p]) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite));
  if (!raw.length) return { spots: {}, outside: [], box: null };
  const pts = raw.map(([, [x, y]]) => (opt.swap ? [y, x] : [x, y]));
  const src = input.plan?.bbox ? (opt.swap ? [input.plan.bbox[1], input.plan.bbox[0], input.plan.bbox[3], input.plan.bbox[2]] : input.plan.bbox) : bboxOf(pts);
  const dst = bboxOf(place.poly);
  const sx = (dst[2] - dst[0]) / (src[2] - src[0] || 1), sy = (dst[3] - dst[1]) / (src[3] - src[1] || 1);
  const spots = {};
  const outside = [];
  const padX = (dst[2] - dst[0]) * 0.1, padY = (dst[3] - dst[1]) * 0.1;
  raw.forEach(([code], i) => {
    let [x, y] = pts[i];
    let nx = dst[0] + (x - src[0]) * sx, ny = dst[1] + (y - src[1]) * sy;
    if (opt.flipX) nx = dst[0] + dst[2] - nx;
    if (opt.flipY) ny = dst[1] + dst[3] - ny;
    spots[code] = [Math.round(nx * 10) / 10, Math.round(ny * 10) / 10];
    if (nx < dst[0] - padX || nx > dst[2] + padX || ny < dst[1] - padY || ny > dst[3] + padY) outside.push(code);
  });
  return { spots, outside, box: dst };
}

// data/booth-spots.json에 한 장소의 자리를 합친다 (다른 장소 · 이미 적은 부스는 그대로, 같은 부스는 새 값).
export function merge(existing, place, spots, meta = {}) {
  const base = existing && typeof existing === 'object' ? existing : { places: {} };
  return {
    ...base,
    edition: meta.edition ?? base.edition ?? null,
    source: meta.source ?? base.source ?? null,
    places: { ...(base.places || {}), [place]: { ...((base.places || {})[place] || {}), ...spots } },
  };
}

// 그 장소의 전시사 부스 가운데 정식 자리가 든 것과 빠진 것. booths: 부스 글 목록(전시사 자료에서)
export function coverage(booths, spots) {
  const have = new Set(Object.keys(spots || {}));
  const all = [...new Set(booths)];
  const missing = all.filter((b) => !have.has(b));
  return { total: all.length, have: all.length - missing.length, missing };
}

// places.json 본문에서 한 장소의 boothSpots를 official로 바꾼 글. 못 찾으면 null.
export function markOfficial(placesText, place) {
  const re = new RegExp(`("k": "${place}",[^\\n]*?"boothSpots": ")guess(")`);
  return re.test(placesText) ? placesText.replace(re, '$1official$2') : null;
}
