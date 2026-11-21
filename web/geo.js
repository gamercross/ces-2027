// 장소 자료의 좌표를 한 장(세계 좌표)에 놓는다. 지도 · 3D · 위치 맞추기가 같이 쓴다.

// 캠퍼스 기호 → (x, z) => [세계 x, 세계 z]
export function worldOf(places) {
  const by = new Map();
  for (const c of places.campuses) {
    const { origin, scale, offset } = c.toWorld;
    by.set(c.k, (x, z) => [(x - origin[0]) * scale + offset[0], (z - origin[1]) * scale + offset[1]]);
  }
  return (campus, x, z) => by.get(campus)(x, z);
}

export function bbox(points) {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const [x, z] of points) {
    if (x < x0) x0 = x;
    if (z < z0) z0 = z;
    if (x > x1) x1 = x;
    if (z > z1) z1 = z;
  }
  return [x0, z0, x1, z1];
}

export function centroid(points) {
  let x = 0, z = 0;
  for (const p of points) { x += p[0]; z += p[1]; }
  return [x / points.length, z / points.length];
}

// 점이 다각형 안에 있나 (짝홀 규칙).
export function inside(point, poly) {
  const [x, z] = point;
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) hit = !hit;
  }
  return hit;
}

// 장소마다 세계 좌표 다각형과 가운데를 붙여 돌려준다.
export function layout(places) {
  const W = worldOf(places);
  const list = places.places.map((p, order) => {
    const poly = p.poly.map(([x, z]) => W(p.c, x, z));
    return { ...p, order, world: poly, center: centroid(poly) };
  });
  const campuses = places.campuses.map((c) => {
    const mine = list.filter((p) => p.c === c.k).flatMap((p) => p.world);
    return { ...c, box: bbox(mine) };
  });
  // 전시장 밖 공개 장소 (자리는 어림).
  const city = (places.cityPlaces || []).map((p) => ({ ...p, center: W(p.c, p.at[0], p.at[1]) }));
  return { W, list, campuses, city, box: bbox(list.flatMap((p) => p.world)), boxAll: bbox([...list.flatMap((p) => p.world), ...city.map((p) => p.center)]) };
}
