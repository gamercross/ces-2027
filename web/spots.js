// 홀 안 부스 자리를 짐작한다 (reference/미리보기판의 "부스 자리 계산"에서 옮겼다).
// 정식 배치도가 열리기 전이라, 숫자 부스는 앞자리(백의 자리 위)를 통로로, 뒤 두 자리를 통로 안 순서로 읽어
// 홀 칸(reg)에 고르게 펼친다. 홀수 · 짝수는 통로 양쪽이다. 글자 부스는 칸에 차례로 놓는다. 모두 짐작이다.
// 홀 모양이 네모가 아니면(실제 윤곽) 칸 안에서 잡은 자리를 그 줄 · 그 열의 홀 폭에 맞춰 늘인다: 차례는 그대로, 점은 홀 모양 안을 고르게 덮는다.

import { bbox, worldOf } from './geo.js';
import { splitBooth } from './route.js';

const NUMERIC = /^\d+[a-zA-Z]?$/;

// 다각형을 가로줄(z = v) 또는 세로줄(x = v)로 자른 구간 가운데 at이 든 구간 [a, b]. 없으면 null.
function spanAt(poly, v, vertical, at) {
  const cuts = [];
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, az] = vertical ? [poly[j][1], poly[j][0]] : poly[j], [bx, bz] = vertical ? [poly[i][1], poly[i][0]] : poly[i];
    if ((az > v) !== (bz > v)) cuts.push(ax + ((v - az) / (bz - az)) * (bx - ax));
  }
  cuts.sort((a, b) => a - b);
  for (let i = 0; i + 1 < cuts.length; i += 2) if (at >= cuts[i] && at <= cuts[i + 1]) return [cuts[i], cuts[i + 1]];
  return null;
}
// 칸(reg) 안의 자리 (x, z)를 홀 모양(area)의 그 줄 폭 · 그 열 높이에 맞춰 늘인다. 가장자리에서 pad만큼 띄운다.
export function spread(area, reg, x, z, pad = 6) {
  const [x0, z0, x1, z1] = reg;
  const row = spanAt(area, z, false, x);
  if (row && row[1] - row[0] > 2 * pad && x1 > x0) x = row[0] + pad + ((x - x0) / (x1 - x0)) * (row[1] - row[0] - 2 * pad);
  const col = spanAt(area, x, true, z);
  if (col && col[1] - col[0] > 2 * pad && z1 > z0) z = col[0] + pad + ((z - z0) / (z1 - z0)) * (col[1] - col[0] - 2 * pad);
  return [x, z];
}

// 전시사 자료의 부스를 모두 놓는다. "장소|부스 글" → { x, z }(세계 좌표).
// official은 정식 배치도에서 옮긴 자리(data/booth-spots.json)다. 거기에 있는 부스는 짐작 대신 그 자리를 쓰고 official: true가 붙는다.
export function boothSpots(places, exhibitors, official) {
  const W = worldOf(places);
  const byPlace = new Map();
  for (const row of exhibitors.ex) {
    for (const b of row[7]) {
      const { code, place } = splitBooth(b);
      if (!byPlace.has(place)) byPlace.set(place, new Set());
      byPlace.get(place).add(code);
    }
  }
  const spots = new Map();
  for (const p of places.places) {
    const codes = [...(byPlace.get(p.k) || [])].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
    if (!codes.length) continue;
    const local = new Map();
    const numeric = p.kind === 'hall' && p.reg ? codes.filter((c) => NUMERIC.test(c)) : [];
    if (numeric.length) {
      const nums = numeric.map((c) => parseInt(c, 10));
      const aisles = nums.map((n) => Math.floor(n / 100));
      const aMin = Math.min(...aisles);
      const nA = Math.max(...aisles) - aMin + 1;
      const nS = Math.floor(Math.max(...nums.map((n) => n % 100)) / 2) + 1;
      const [x0, z0, x1, z1] = p.reg;
      const wd = x1 - x0, dd = z1 - z0;
      const ratio = (a, b) => Math.max(a, b) / Math.max(0.001, Math.min(a, b));
      const alongX = ratio(wd / nA / 2, dd / nS) <= ratio(dd / nA / 2, wd / nS);
      for (const code of numeric) {
        const n = parseInt(code, 10);
        const a = Math.floor(n / 100) - aMin;
        const pos = n % 100;
        const slot = pos >> 1;
        const side = pos & 1 ? -1 : 1;
        const sfx = /[a-zA-Z]$/.test(code) ? 0.18 : 0;
        let cx, cz;
        if (alongX) {
          const ca = wd / nA, cs = dd / nS;
          cx = x0 + (a + 0.5) * ca + side * ca * 0.24;
          cz = z0 + (slot + 0.5 + sfx) * cs;
        } else {
          const ca = dd / nA, cs = wd / nS;
          cz = z0 + (a + 0.5) * ca + side * ca * 0.24;
          cx = x0 + (slot + 0.5 + sfx) * cs;
        }
        // 홀 모양에 맞춰 늘인다(부스 점이 놓일 곳 boothArea가 따로 있으면 그 안: 회의실 띠를 비우려고).
        local.set(code, spread(p.boothArea || p.poly, p.reg, cx, cz));
      }
    }
    const rest = codes.filter((c) => !local.has(c));
    if (rest.length) {
      const b = bbox(p.poly);
      const [x0, z0, x1, z1] = p.reg || [b[0] + 8, b[1] + 8, b[2] - 8, b[3] - 8];
      const wd = x1 - x0, dd = z1 - z0;
      const cols = Math.max(1, Math.round(Math.sqrt((rest.length * wd) / dd)));
      const rows = Math.ceil(rest.length / cols);
      rest.forEach((code, i) => local.set(code, [x0 + ((i % cols) + 0.5) * (wd / cols), z0 + (Math.floor(i / cols) + 0.5) * (dd / rows)]));
    }
    const known = official?.places?.[p.k] || {};
    for (const [code, [x, z]] of local) {
      const real = Array.isArray(known[code]) && known[code].length === 2 && known[code].every(Number.isFinite) ? known[code] : null;
      const [wx, wz] = W(p.c, ...(real || [x, z]));
      spots.set(`${p.k}|${code}`, real ? { x: wx, z: wz, official: true } : { x: wx, z: wz });
    }
  }
  return spots;
}

// "글@장소" 한 부스의 자리. 없으면 null.
export function spotOf(spots, booth) {
  if (!booth) return null;
  const { code, place } = splitBooth(booth);
  return spots.get(`${place}|${code}`) || null;
}
