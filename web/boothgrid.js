// 홀 안 부스 칸(대략): 부스마다 작은 네모 하나. 2D 지도 · 3D 지도 · 길 안내가 같은 자리를 쓴다.
// 정식 배치도가 열리기 전이라 자리와 크기는 대략이다. 부스 번호로 줄과 차례를 정해, 실제 홀 모양 안에 "줄과 통로"로 놓는다.
//
// 숫자 부스(홀마다 번호 대는 data/places.json의 boothRules.numbers. 모든 홀이 같은 규칙):
//   - 백의 자리 위(번호 ÷ 100) = 통로 번호. 한 통로의 부스는 한 토막이 되어, 짝수 번호는 통로 한쪽 줄 · 홀수 번호는 맞은편 줄에
//     끝 두 자리 차례로 선다(번호가 작을수록 앞).
//   - 토막을 번호 차례로 긴 통로를 따라 이어 붙인다. 토막 사이는 한 칸, 천의 자리(묶음)가 바뀌는 곳은 두 칸 띈다.
//     긴 통로가 차면 다음 긴 통로로 넘어간다. 긴 통로끼리는 줄의 등을 맞댄다.
//   - 긴 통로는 실제 홀 모양(오픈스트리트맵 윤곽) 안에서 줄마다 들어가는 만큼 길게 잡는다. 네모 크기는 홀마다 하나이고,
//     모든 부스가 들어가는 가장 큰 크기를 고른다(긴 통로가 동서인지 남북인지도 더 크게 들어가는 쪽).
// 글자 부스(회의실 · 스위트 · 야외의 이름)는 칸에 차례로 바둑판처럼 놓는다.
// 정식 배치도에서 옮긴 자리(data/booth-spots.json)는 [x, z] 또는 [x, z, 너비, 깊이]이고, 적힌 부스는 그 자리 · 크기를 쓴다.

import { bbox, centroid as centerOf, inside as insidePoly, worldOf } from './geo.js';
import { splitBooth } from './route.js';

const NUMERIC = /^\d+[a-zA-Z]?$/;
// 네모 한 변을 1로 볼 때: 통로 폭 · 토막 사이 · 묶음 사이 · 네모 사이 틈 · 홀 벽에서 띄우는 폭(미터).
export const GRID = { walk: 1, segGap: 1, groupGap: 2, gap: 0.12, pad: 4 };

// 다각형을 가로줄(z = v) 또는 세로줄(x = v)로 자른 구간들 [[a, b], ...] (작은 쪽부터).
export function spansAt(poly, v, vertical) {
  const cuts = [];
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, az] = vertical ? [poly[j][1], poly[j][0]] : poly[j], [bx, bz] = vertical ? [poly[i][1], poly[i][0]] : poly[i];
    if ((az > v) !== (bz > v)) cuts.push(ax + ((v - az) / (bz - az)) * (bx - ax));
  }
  cuts.sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i + 1 < cuts.length; i += 2) out.push([cuts[i], cuts[i + 1]]);
  return out;
}
// 두 구간 목록이 같이 덮는 곳.
function overlapSpans(a, b) {
  const out = [];
  for (const [a0, a1] of a) for (const [b0, b1] of b) { const lo = Math.max(a0, b0), hi = Math.min(a1, b1); if (hi > lo) out.push([lo, hi]); }
  return out.sort((p, q) => p[0] - q[0]);
}

// 구간 목록에서 [lo, hi]를 뺀다.
function cutOut(spans, lo, hi) {
  const out = [];
  for (const [a, b] of spans) { if (hi <= a || lo >= b) { out.push([a, b]); continue; } if (lo > a) out.push([a, lo]); if (hi < b) out.push([hi, b]); }
  return out;
}

// 숫자 부스 → 통로 토막들(번호 차례). 토막: { aisle, group, even: [글], odd: [글], len }.
export function segmentsOf(codes) {
  const nums = codes.map((c) => ({ c, n: parseInt(c, 10) })).sort((a, b) => a.n - b.n || a.c.localeCompare(b.c));
  const segs = [];
  for (const { c, n } of nums) {
    const aisle = Math.floor(n / 100);
    if (!segs.length || segs.at(-1).aisle !== aisle) segs.push({ aisle, group: Math.floor(aisle / 10), even: [], odd: [] });
    segs.at(-1)[n % 2 ? 'odd' : 'even'].push(c);
  }
  for (const s of segs) s.len = Math.max(s.even.length, s.odd.length);
  return segs;
}

// 한 변이 s(미터)인 네모로 홀(area)을 채워 본다. 긴 통로가 x 방향이면 alongX. 다 들어가면 code → [x, z], 아니면 null.
// 긴 통로 하나 = [한쪽 줄][통로][맞은편 줄]. 줄의 두 가운데 높이에서 모두 홀 안인 구간만 쓴다.
// holes: 비워 둘 네모들 [x0, z0, x1, z1] (홀 안에 그린 회의실 · 다른 층의 방. 홀 부스가 그 위에 겹쳐 보이지 않게).
export function packHall(segs, area, s, alongX, holes = []) {
  const [x0, z0, x1, z1] = bbox(area);
  const [lo, hi] = alongX ? [z0, z1] : [x0, x1];
  const pitch = s * (2 + GRID.walk);
  const pad = GRID.pad;
  const at = new Map();
  let si = 0, done = 0; // 지금 놓는 토막과 그 토막에서 놓은 칸 수
  let prevGroup = null;
  for (let t = lo + pad; t + pitch <= hi - pad && si < segs.length; t += pitch) {
    const ca = t + s / 2, cb = t + s * (1.5 + GRID.walk);
    let spans = overlapSpans(spansAt(area, ca, !alongX), spansAt(area, cb, !alongX));
    for (const h of holes) {
      const [h0, h1, k0, k1] = alongX ? [h[1], h[3], h[0], h[2]] : [h[0], h[2], h[1], h[3]];
      if (h1 > t && h0 < t + pitch) spans = cutOut(spans, k0 - pad, k1 + pad);
    }
    for (const [a, b] of spans) {
      let pos = a + pad; // 이 구간에서 다음 칸이 놓일 자리(왼쪽 끝)
      const end = b - pad;
      while (si < segs.length) {
        const seg = segs[si];
        if (done === 0 && prevGroup !== null) pos += s * (seg.group !== prevGroup ? GRID.groupGap : GRID.segGap);
        const room = Math.floor((end - pos) / s + 1e-9);
        if (room <= 0) break;
        const take = Math.min(room, seg.len - done);
        for (let k = 0; k < take; k += 1) {
          const u = pos + (k + 0.5) * s;
          const i = done + k;
          if (seg.even[i]) at.set(seg.even[i], alongX ? [u, ca] : [ca, u]);
          if (seg.odd[i]) at.set(seg.odd[i], alongX ? [u, cb] : [cb, u]);
        }
        pos += take * s;
        done += take;
        if (done >= seg.len) { prevGroup = seg.group; si += 1; done = 0; } else break;
      }
      if (si >= segs.length) break;
    }
  }
  return si >= segs.length ? at : null;
}

// 홀 하나의 숫자 부스: 모두 들어가는 가장 큰 네모(두 방향을 다 해 보고 더 큰 쪽). 돌려주는 것: { at, s, alongX, lines }.
export function hallLayout(codes, area, holes = []) {
  const segs = segmentsOf(codes);
  let best = null;
  for (const alongX of [true, false]) {
    let lo = 0.5, hi = 40, got = null;
    if (!packHall(segs, area, lo, alongX, holes)) continue;
    for (let i = 0; i < 22; i += 1) {
      const mid = (lo + hi) / 2;
      const r = packHall(segs, area, mid, alongX, holes);
      if (r) { lo = mid; got = r; } else hi = mid;
    }
    got ||= packHall(segs, area, lo, alongX, holes);
    if (!best || lo > best.s) best = { at: got, s: lo, alongX };
  }
  return best;
}

// 전시사 자료의 부스를 모두 네모로 놓는다. "장소|부스 글" → { x, z(가운데, 세계 좌표 미터), w(동서 너비), d(남북 깊이), official? }.
export function boothBoxes(places, exhibitors, official) {
  const W = worldOf(places);
  const byPlace = new Map();
  for (const row of exhibitors.ex) {
    for (const b of row[7]) {
      const { code, place } = splitBooth(b);
      if (!byPlace.has(place)) byPlace.set(place, new Set());
      byPlace.get(place).add(code);
    }
  }
  const boxes = new Map();
  for (const p of places.places) {
    const codes = [...(byPlace.get(p.k) || [])].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
    if (!codes.length) continue;
    const local = new Map();
    const area = p.boothArea || p.poly;
    const numeric = p.kind === 'hall' ? codes.filter((c) => NUMERIC.test(c)) : [];
    let size = null;
    if (numeric.length) {
      // 이 홀 모양 안에 그린 방(회의실)의 자리는 비운다.
      const holes = places.places.filter((q) => q !== p && q.c === p.c && q.kind === 'room' && insidePoly(centerOf(q.poly), p.poly)).map((q) => bbox(q.poly));
      const H = hallLayout(numeric, area, holes);
      if (H) {
        const e = H.s * (1 - GRID.gap);
        size = [e, e];
        for (const [code, xz] of H.at) local.set(code, xz);
      }
    }
    const rest = codes.filter((c) => !local.has(c));
    if (rest.length) {
      const b = bbox(p.poly);
      const [x0, z0, x1, z1] = p.reg || [b[0] + 8, b[1] + 8, b[2] - 8, b[3] - 8];
      const wd = x1 - x0, dd = z1 - z0;
      const cols = Math.max(1, Math.round(Math.sqrt((rest.length * wd) / dd)));
      const rows = Math.ceil(rest.length / cols);
      const cell = Math.min(wd / cols, dd / rows) * 0.8;
      size ||= [cell, cell];
      rest.forEach((code, i) => local.set(code, [x0 + ((i % cols) + 0.5) * (wd / cols), z0 + (Math.floor(i / cols) + 0.5) * (dd / rows)]));
    }
    const known = official?.places?.[p.k] || {};
    for (const [code, [x, z]] of local) {
      const o = known[code];
      const real = Array.isArray(o) && (o.length === 2 || o.length === 4) && o.every(Number.isFinite) ? o : null;
      const [wx, wz] = W(p.c, ...(real ? [real[0], real[1]] : [x, z]));
      const [w, d] = real?.length === 4 ? [real[2], real[3]] : size;
      boxes.set(`${p.k}|${code}`, real ? { x: wx, z: wz, w, d, official: true } : { x: wx, z: wz, w, d });
    }
  }
  return boxes;
}

// 네모의 네 모서리 [[x, z] × 4] (2D 그리기 · 3D 세우기가 같이 쓴다).
export const boxCorners = (b) => [[b.x - b.w / 2, b.z - b.d / 2], [b.x + b.w / 2, b.z - b.d / 2], [b.x + b.w / 2, b.z + b.d / 2], [b.x - b.w / 2, b.z + b.d / 2]];

// 홀마다 네모 수 (보고 · 시험용).
export function countByPlace(boxes) {
  const n = {};
  for (const k of boxes.keys()) { const p = k.slice(0, k.indexOf('|')); n[p] = (n[p] || 0) + 1; }
  return n;
}
