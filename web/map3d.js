// 3D 지도: 지도 탭에서 "3D"를 누를 때만 불러온다. 바깥 3D 엔진 없이 캔버스에 직접 그린다.
// 장소를 기둥으로 세우고(홀은 낮게, 호텔은 높게), 끌어서 돌린다.
// 2D와 같은 것을 같은 차례로 그린다: 그 날 차례 선 · 갈 곳 번호 · 길 안내 선 · 내 자리(views/map.js가 `set`으로 넘긴다).
// 글자는 2D 규칙대로 놓는다: 13px 아래로 줄이지 않고, 겹치면 숨기고, 다음에 갈 곳 → 갈 곳 → 홀 차례로 남긴다. 돌려도 글자는 화면을 향한다.
// 누르면 손가락 아래에 있는 것이 열린다: 갈 곳 번호 · 부스 점 → 회사, 홀 → 홀, (멀리 볼 때만) 캠퍼스 바닥 → 캠퍼스. 애매하면 아무것도 열지 않는다.

import { T, DAY_COLORS, rgbOf, withAlpha } from './tokens.js';
import { MIN_FONT, clip, layoutLabels, levelOf } from './mapmath.js';
import { shortName } from './hallgroups.js';

const FILL = { hall: rgbOf(T.hall), room: rgbOf(T.room), out: rgbOf(T.out), hotel: rgbOf(T.hotel) };
const DAY = DAY_COLORS;
const FONT = 'system-ui, -apple-system, "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", sans-serif';
const shade = ([r, g, b], k) => `rgb(${Math.round(r * k)},${Math.round(g * k)},${Math.round(b * k)})`;
// 손가락 크기: 점 가운데에서 이만큼 안이면 그 점을 누른 것으로 본다. 둘이 이만큼도 차이 나지 않으면 애매하다.
const REACH = 16;
const PIN_REACH = 8; // 번호 원의 테두리 밖으로 이만큼까지
const TIE = 3;
const EDGE = 10;

// 장소 하나의 바닥 높이와 꼭대기 높이.
function heights(p) {
  if (p.kind === 'hotel') return [0, p.height || 40];
  if (p.kind === 'room') return [p.floorY || 0, (p.floorY || 0) + 8];
  if (p.kind === 'hall') return [p.floorY || 0, (p.floorY || 0) + 14];
  return [0, 2];
}

const inPoly = (x, y, poly) => {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
};
// 점에서 다각형 테두리까지의 거리(px).
function edgeGap(x, y, poly) {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, ay] = poly[j], [bx, by] = poly[i];
    const dx = bx - ax, dy = by - ay;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(x - ax - dx * t, y - ay - dy * t));
  }
  return best;
}

// 눌린 자리(x, y)에서 무엇을 열지 고른다. 화면과 따로 두어 Node에서도 시험한다 (scripts/smoke.mjs).
// hits: { pins: [{ id, sx, sy, r }], booths: [{ key, sx, sy }], shapes: [{ p, polys }](뒤에 있는 것이 앞), campuses: [{ c, poly }], far(멀리 보는 중인가) }
// 돌려주는 것: { kind: 'pin' | 'booth' | 'place' | 'campus', … } 또는 null(빈 곳이거나 애매하다).
export function pickAt(x, y, hits) {
  // 1. 작은 것 먼저: 갈 곳 번호와 부스 점 가운데 손가락에 가장 가까운 것.
  const near = [];
  (hits.pins || []).forEach((p, at) => { const d = Math.max(0, Math.hypot(p.sx - x, p.sy - y) - p.r); if (d <= PIN_REACH) near.push({ kind: 'pin', id: p.id, d, at }); });
  for (const b of hits.booths || []) { const d = Math.hypot(b.sx - x, b.sy - y); if (d <= REACH) near.push({ kind: 'booth', key: b.key, d, at: -1 }); }
  if (near.length) {
    // 번호 원 안을 눌렀으면 그 번호다(원이 겹쳤으면 위에 그린 것). 원 밖이면 둘째보다 뚜렷이 가까워야 한다.
    near.sort((a, b) => a.d - b.d || b.at - a.at);
    const [first, second] = near;
    if (first.d > 0 && second && second.d - first.d < TIE) return null;
    return first.kind === 'pin' ? { kind: 'pin', id: first.id } : { kind: 'booth', key: first.key };
  }
  // 2. 홀 · 건물: 앞에 그린 것부터.
  const shapes = hits.shapes || [];
  for (let i = shapes.length - 1; i >= 0; i--) if (shapes[i].polys.some((poly) => inPoly(x, y, poly))) return { kind: 'place', p: shapes[i].p };
  // 3. 캠퍼스 바닥: 캠퍼스 이름이 보일 만큼 멀리 볼 때만, 홀 테두리에서 떨어진 곳만.
  if (!hits.far) return null;
  const campus = (hits.campuses || []).filter((h) => inPoly(x, y, h.poly));
  if (campus.length !== 1) return null;
  for (const s of shapes) for (const poly of s.polys) if (edgeGap(x, y, poly) < EDGE) return null;
  return { kind: 'campus', c: campus[0].c };
}

// box(세계 좌표)가 화면의 보이는 칸(위 top · 아래 bottom · 오른쪽 right를 뺀 곳)에 다 들어오는 span.
export function spanFor(box, w, h, { yaw, pitch, top = 0, bottom = 0, right = 0, side = 16 }) {
  const cos = Math.cos(yaw), sin = Math.sin(yaw), sp = Math.sin(pitch);
  const hx = (box[2] - box[0]) / 2, hz = (box[3] - box[1]) / 2;
  let ex = 1, ey = 1;
  for (const [dx, dz] of [[hx, hz], [hx, -hz]]) { ex = Math.max(ex, Math.abs(dx * cos - dz * sin)); ey = Math.max(ey, Math.abs((dx * sin + dz * cos) * sp)); }
  const k = Math.min(Math.max(60, w - right - 2 * side) / (2 * ex), Math.max(60, h - top - bottom) / (2 * ey));
  return Math.min(7000, Math.max(150, Math.min(w, h) / k));
}

export function create(L, places, on = {}) {
  // 누를 수 있게, 그린 모양을 화면 좌표로 기억해 둔다 (뒤에 그린 것이 앞에 있다).
  let hits = { pins: [], booths: [], shapes: [], campuses: [], far: true };
  let chosen = null;
  let chosenBooth = null;
  let moving = false;
  // 2D와 같이 그릴 것: 갈 곳 번호 · 선(차례 · 길 안내) · 점(내 자리 · 가는 곳) · 다음에 갈 곳.
  let scene = { pins: [], lines: [], dots: [], next: null, quiet: false };
  const SCALE = on.scale || 1;
  const LABEL = MIN_FONT * SCALE;
  // 부스: 가까이 볼 때만 점으로 찍는다. 장소의 꼭대기 높이에 올려놓는다.
  const BOOTH_SPAN = 620;
  const topOf = new Map(L.list.map((p) => [p.k, heights(p)[1]]));
  const booths = (on.booths || []).map((b) => ({ ...b, top: topOf.get(b.key.slice(0, b.key.indexOf('|'))) ?? 0 }));
  // 세계의 한 점이 놓일 높이: 장소를 알면 그 꼭대기, 모르면 그 자리에 선 가장 높은 것의 꼭대기(없으면 바닥).
  const topAt = (x, z, k) => (k != null && topOf.has(k) ? topOf.get(k) : L.list.reduce((top, p) => (inPoly(x, z, p.world) ? Math.max(top, topOf.get(p.k)) : top), 0));
  const canvas = document.createElement('canvas');
  canvas.className = 'map';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'CES 2027 캠퍼스 3D 지도. 끌어서 돌린다. 홀 안 부스 자리는 짐작이다.');
  const ctx = canvas.getContext('2d');
  const cam = { yaw: -0.5, pitch: 0.95, cx: 0, cz: 0, span: 3000, top: 0, bottom: 0, right: 0 };
  const size = () => [canvas.clientWidth || 328, canvas.clientHeight || 420];

  // box가 보이는 칸(위 찾기 칸 · 아래 카드나 띠 · 오른쪽 단추를 뺀 곳)의 가운데에 오게 본다.
  function look(box, { top = cam.top, bottom = cam.bottom, right = cam.right } = {}) {
    const b = box || [L.box[0] - 120, L.box[1] - 120, L.box[2] + 120, L.box[3] + 120];
    const [w, h] = size();
    cam.cx = (b[0] + b[2]) / 2;
    cam.cz = (b[1] + b[3]) / 2;
    cam.top = top;
    cam.bottom = Math.min(bottom, Math.max(0, h - top - 120));
    cam.right = Math.min(right, w / 3);
    cam.span = spanFor(b, w, h, cam);
    draw();
  }

  function draw() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const [w, h] = size();
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.setLineDash([]);
    ctx.fillStyle = T.bg;
    ctx.fillRect(0, 0, w, h);
    const k = Math.min(w, h) / cam.span;
    const midX = (w - cam.right) / 2;
    const midY = cam.top + (h - cam.top - cam.bottom) / 2;
    const cos = Math.cos(cam.yaw), sin = Math.sin(cam.yaw), sp = Math.sin(cam.pitch), cp = Math.cos(cam.pitch);
    // 세계 (x, 높이 y, z) → 화면. depth가 클수록 앞이다.
    const project = (x, y, z) => {
      const dx = x - cam.cx, dz = z - cam.cz;
      const rx = dx * cos - dz * sin, rz = dx * sin + dz * cos;
      return [midX + rx * k, midY + (rz * sp - y * cp) * k, rz];
    };
    const face = (points, color, stroke) => {
      ctx.beginPath();
      points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
    };

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = T.road;
    for (const r of places.roads) {
      ctx.lineWidth = Math.max(1, r.w * k * 0.8);
      ctx.beginPath();
      r.pts.forEach(([x, z], i) => { const [wx, wz] = L.W(r.c, x, z); const [sx, sy] = project(wx, 0, wz); if (i) ctx.lineTo(sx, sy); else ctx.moveTo(sx, sy); });
      ctx.stroke();
    }

    // 캠퍼스 바닥: 멀리 볼 때 누르면 캠퍼스가 골라진다.
    const level = levelOf(cam.span);
    const campuses = L.campuses.map((c) => {
      const [x0, z0, x1, z1] = [c.box[0] - 40, c.box[1] - 40, c.box[2] + 40, c.box[3] + 40];
      const poly = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]].map(([x, z]) => project(x, 0, z));
      face(poly, withAlpha(T.panel2, 0.55));
      return { c, poly };
    });
    // 글자를 놓을 수 있는 칸: 위 찾기 칸 · 아래 카드나 띠를 뺀 곳.
    const inset = on.inset ? on.inset() : null;
    const band = { top: inset?.top ?? cam.top, width: w, height: 0 };
    band.height = Math.max(40, h - band.top - (inset?.bottom ?? cam.bottom));
    const shapes = [];
    const solids = L.list.map((p) => ({ p, depth: project(p.center[0], 0, p.center[1])[2] })).sort((a, b) => a.depth - b.depth);
    const cands = [];
    for (const { p } of solids) {
      const [y0, y1] = heights(p);
      const base = FILL[p.kind] || [221, 227, 238];
      const n = p.world.length;
      // 옆면은 뒤쪽 것부터 그린다.
      const sides = p.world.map((a, i) => {
        const b = p.world[(i + 1) % n];
        return { a, b, depth: project((a[0] + b[0]) / 2, 0, (a[1] + b[1]) / 2)[2] };
      }).sort((s, t) => s.depth - t.depth);
      const polys = [];
      for (const s of sides) {
        const light = 0.72 + 0.16 * Math.abs(Math.cos(Math.atan2(s.b[1] - s.a[1], s.b[0] - s.a[0]) + cam.yaw));
        const quad = [project(s.a[0], y0, s.a[1]), project(s.b[0], y0, s.b[1]), project(s.b[0], y1, s.b[1]), project(s.a[0], y1, s.a[1])];
        face(quad, shade(base, light));
        polys.push(quad);
      }
      const top = p.world.map(([x, z]) => project(x, y1, z));
      face(top, p.k === chosen ? T.mint : shade(base, 1), T.accent);
      if (p.k === chosen) { ctx.lineWidth = 3; ctx.strokeStyle = T.ink; ctx.stroke(); }
      polys.push(top);
      shapes.push({ p, polys });
      // 이름: 캠퍼스 단계에는 홀 · 호텔만, 가까이 가면 회의실 · 야외까지 (2D와 같다).
      const big = p.kind === 'hall' || p.kind === 'hotel';
      if (big || (level !== 'campus' && cam.span <= 900)) {
        const name = shortName(p.ko);
        const half = name.length * LABEL * 0.5 + 8;
        const at = project(p.center[0], y1, p.center[1]);
        // 가운데가 보이는 칸 밖이면, 칸 안으로 당긴 자리가 그 지붕 위일 때 거기에 놓는다(홀 안을 가까이 볼 때도 이름이 보이게).
        const x = Math.min(Math.max(at[0], half), w - half), y = Math.min(Math.max(at[1], band.top + LABEL), band.top + band.height - LABEL);
        if ((x === at[0] && y === at[1]) || inPoly(x, y, top)) cands.push({ id: `p:${p.k}`, x, y, text: name, size: LABEL, prio: big ? (level === 'hall' ? 60 : level === 'campus' ? 50 : 30) : 20, anchor: 'middle' });
      }
    }
    if (level === 'campus') {
      for (const { c, poly } of campuses) cands.push({ id: `c:${c.k}`, x: poly.reduce((a, q) => a + q[0], 0) / 4, y: Math.min(...poly.map((q) => q[1])) - LABEL, text: c.ko, size: LABEL + 1, prio: 100, anchor: 'middle' });
    }

    // 부스 점 (자리는 짐작). 화면 안에 든 것만, 많으면 900개까지.
    const dots = [];
    if (cam.span <= BOOTH_SPAN) {
      for (const b of booths) {
        const [sx, sy] = project(b.x, b.top, b.z);
        if (sx < -6 || sy < -6 || sx > w + 6 || sy > h + 6) continue;
        dots.push({ key: b.key, sx, sy, b });
        if (dots.length >= 900) break;
      }
      for (const b of dots) {
        const on1 = b.key === chosenBooth;
        ctx.beginPath();
        ctx.arc(b.sx, b.sy, on1 ? 6 : 3.5, 0, Math.PI * 2);
        ctx.fillStyle = on.colorOf ? on.colorOf(b.key) : T.plain;
        ctx.fill();
        // 명함 이벤트로 표시한 부스는 붉은 테두리.
        const marked = on.isMarked ? on.isMarked(b.key) : false;
        ctx.lineWidth = on1 || marked ? 3 : 1;
        ctx.strokeStyle = on1 ? T.ink : marked ? T.warn : T.panel;
        ctx.stroke();
      }
    }

    // 선: 그 날 차례 · 길 안내 (2D와 같은 색 · 굵기 · 점선). 점마다 그 자리의 꼭대기 높이에 놓는다.
    const lines = [];
    for (const l of scene.lines) {
      if (l.pts.length < 2) continue;
      const at = l.pts.map(([x, z, pk]) => project(x, topAt(x, z, pk), z));
      ctx.globalAlpha = l.alpha ?? 1;
      ctx.strokeStyle = l.color;
      ctx.lineWidth = l.width;
      ctx.setLineDash(l.dash ? String(l.dash).split(' ').map(Number) : []);
      ctx.beginPath();
      at.forEach(([sx, sy], i) => (i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy)));
      ctx.stroke();
      lines.push({ color: l.color, width: l.width, dash: l.dash || null, alpha: l.alpha ?? 1, today: !!l.today, pts: at.map(([sx, sy]) => [sx, sy]) });
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    // 점: 내 자리 · 가는 곳 (2D와 같은 크기).
    for (const d of scene.dots) {
      const [sx, sy] = project(d.x, topAt(d.x, d.z, d.k), d.z);
      ctx.beginPath();
      ctx.arc(sx, sy, d.r * SCALE, 0, Math.PI * 2);
      if (d.fill) { ctx.fillStyle = d.fill; ctx.fill(); }
      if (d.stroke) { ctx.strokeStyle = d.stroke; ctx.lineWidth = d.width || 1.5; ctx.stroke(); }
    }

    // 갈 곳 번호: 뒤에 있는 것부터, 다음에 갈 곳은 맨 위에 조금 크게.
    const next = scene.next;
    const R = 11 * SCALE;
    const pinHits = [];
    const blocked = [];
    const drawn = scene.pins.map((pin) => {
      const top = topAt(pin.x, pin.z, pin.k);
      const [sx, sy, depth] = project(pin.x, top, pin.z);
      const [, ty] = project(pin.x, top + 26, pin.z);
      return { pin, sx, sy, ty: Math.min(ty, sy - 4), depth, isNext: !!next && pin.id === next.id };
    }).sort((a, b) => a.isNext - b.isNext || a.depth - b.depth);
    for (const d of drawn) {
      const r = d.isNext ? R + 2 : R;
      ctx.globalAlpha = d.pin.alpha ?? 1;
      ctx.strokeStyle = T.ink;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(d.sx, d.sy); ctx.lineTo(d.sx, d.ty); ctx.stroke();
      ctx.beginPath(); ctx.arc(d.sx, d.ty, r, 0, Math.PI * 2); ctx.fillStyle = DAY[d.pin.day] || DAY[0]; ctx.fill();
      ctx.lineWidth = d.isNext ? 3 : 1.5;
      ctx.stroke();
      ctx.fillStyle = T.ink;
      ctx.font = `800 ${LABEL}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(d.pin.no), d.sx, d.ty + 0.5);
      pinHits.push({ id: d.pin.id, sx: d.sx, sy: d.ty, r });
      blocked.push([d.sx - r - 2, d.ty - r - 2, d.sx + r + 2, d.ty + r + 2]);
    }
    ctx.globalAlpha = 1;
    hits = { pins: pinHits, booths: dots, shapes, campuses, far: level === 'campus' };

    // ---- 글자: 보이는 칸(위 찾기 칸 · 아래 카드 · 오른쪽 단추를 뺀 곳) 안에만 놓는다.
    const bandTop = band.top;
    for (const r of inset?.blocked || []) blocked.push(r);
    const shifted = blocked.map(([x0, y0, x1, y1]) => [x0, y0 - bandTop, x1, y1 - bandTop]);
    const text = (label, x, y, size, anchor, weight) => {
      ctx.font = `${weight} ${size}px ${FONT}`;
      ctx.textAlign = anchor === 'start' ? 'left' : 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 3.2;
      ctx.strokeStyle = T.panel;
      ctx.strokeText(label, x, y);
      ctx.fillStyle = T.ink;
      ctx.fillText(label, x, y);
    };
    // 다음에 갈 곳의 이름은 늘 읽히게 먼저 놓는다: 오른쪽 → 왼쪽(조금 아래 · 위로도) → 아래 → 위 → 대각선 가운데, 다른 번호를 가리지 않는 첫 자리.
    // 그런 자리가 없으면 다른 번호를 가장 덜 가리는 자리에 놓는다(이름이 빠지는 것보다 낫다).
    let nextRect = null;
    if (next) {
      const here = drawn.find((d) => d.isNext);
      const [nx, ny] = here ? [here.sx, here.ty] : project(next.x, topAt(next.x, next.z, next.k), next.z);
      const r = (here ? R + 2 : 15 * SCALE) + 5;
      const label = clip(next.name, 16);
      const fs = LABEL + 2;
      ctx.font = `800 ${fs}px ${FONT}`;
      const tw = ctx.measureText(label).width, th = fs * 1.25;
      const mid = ny - th / 2;
      const spots = [[nx + r, mid], [nx - r - tw, mid], [nx + r, mid + th / 2], [nx + r, mid - th / 2], [nx - r - tw, mid + th / 2], [nx - r - tw, mid - th / 2],
        [nx - tw / 2, ny + r], [nx - tw / 2, ny - r - th],
        [nx + r * 0.7, ny - r * 0.7 - th], [nx - r * 0.7 - tw, ny - r * 0.7 - th], [nx + r * 0.7, ny + r * 0.7], [nx - r * 0.7 - tw, ny + r * 0.7]];
      // 그 자리가 others를 가리는 넓이. 화면 · 보이는 칸 밖이면 놓지 못한다(Infinity).
      const cover = (x0, y0, others) => (x0 >= 4 && x0 + tw <= w - 4 && y0 >= bandTop + 2 && y0 + th <= bandTop + band.height - 2
        ? others.reduce((sum, o) => sum + Math.max(0, Math.min(x0 + tw, o[2]) - Math.max(x0, o[0])) * Math.max(0, Math.min(y0 + th, o[3]) - Math.max(y0, o[1])), 0) : Infinity);
      const mine = blocked.filter((o) => !(here && Math.abs((o[0] + o[2]) / 2 - nx) < 0.5 && Math.abs((o[1] + o[3]) / 2 - ny) < 0.5));
      const spot = spots.find(([x0, y0]) => cover(x0, y0, mine) === 0)
        || spots.filter(([x0, y0]) => cover(x0, y0, inset?.blocked || []) === 0).sort((a, b) => cover(a[0], a[1], mine) - cover(b[0], b[1], mine))[0];
      if (spot) {
        text(label, spot[0], spot[1] + th / 2, fs, 'start', 800);
        nextRect = [spot[0], spot[1], spot[0] + tw, spot[1] + th];
        shifted.push([spot[0] - 3, spot[1] - 3 - bandTop, spot[0] + tw + 3, spot[1] + th + 3 - bandTop]);
      }
    }
    // 갈 곳 이름은 늘 후보다(다른 날 · 다녀온 곳은 뒤로). 캠퍼스 단계에서는 번호만 보이고 이름은 가까이 가면 나온다.
    if (level !== 'campus') {
      for (const d of drawn) if (!d.isNext) cands.push({ id: `n:${d.pin.id}`, x: d.sx, y: d.ty, text: clip(d.pin.name, 12), size: LABEL, prio: (d.pin.alpha ?? 1) < 1 ? 70 : 95, anchor: 'start', dx: R + 8, flip: true });
    }
    // 끌어서 돌리는 동안에는 부스 글자를 놓지 않는다(손을 떼면 놓는다). 길 안내 중에도 놓지 않는다(길 · 가는 곳 · 갈 곳 이름만 남긴다).
    if (!moving && !scene.quiet && dots.length) {
      const mine = new Set(scene.pins.map((p) => p.key));
      for (const { b, sx, sy, key } of dots) {
        if (mine.has(key)) continue;
        const marked = on.isMarked ? on.isMarked(key) : false;
        if (level === 'booth') {
          const prio = marked ? 80 : key === chosenBooth ? 85 : b.award & 2 ? 50 : b.award ? 40 : 10;
          cands.push({ id: `b:${key}`, x: sx, y: sy, text: `${b.code} ${clip(b.name, 9)}${b.n > 1 ? ` +${b.n - 1}` : ''}`, alts: [`${b.code} ${clip(b.name, 5)}`, b.code], size: LABEL, prio, anchor: 'start', dx: 9 });
        } else if (b.name) {
          const prio = marked ? 80 : b.award & 2 ? 55 : b.award ? 45 : 0;
          if (prio) cands.push({ id: `b:${key}`, x: sx, y: sy, text: clip(b.name, 12), size: LABEL, prio, anchor: 'start', dx: 9 });
        }
      }
    }
    const placed = layoutLabels(cands.map((c) => ({ ...c, y: c.y - bandTop })), band, { blocked: shifted });
    for (const c of placed) text(c.text, c.side === 'left' ? c.rect[0] + 3 : c.x + (c.dx || 0), c.y + bandTop, c.size, c.side === 'left' ? 'start' : c.anchor, 700);
    canvas.dataset.labels = String(placed.length + (nextRect ? 1 : 0));
    shown = { lines, band: [bandTop, bandTop + band.height], nextRect, next: nextRect ? clip(next.name, 16) : null, labels: placed.map((c) => ({ id: c.id, text: c.text, size: c.size, rect: [c.rect[0], c.rect[1] + bandTop, c.rect[2], c.rect[3] + bandTop] })) };
  }
  let shown = { next: null, nextRect: null, band: [0, 0], lines: [], labels: [] };

  // 한 손가락으로 끌면 돈다. 두 손가락은 크게 · 작게.
  const touch = new Map();
  let gap = 0;
  canvas.addEventListener('pointerdown', (ev) => { touch.set(ev.pointerId, [ev.clientX, ev.clientY]); try { canvas.setPointerCapture(ev.pointerId); } catch { /* 잡지 못해도 끌기는 된다 */ } });
  canvas.addEventListener('pointermove', (ev) => {
    if (!touch.has(ev.pointerId)) return;
    const before = touch.get(ev.pointerId);
    touch.set(ev.pointerId, [ev.clientX, ev.clientY]);
    moving = true;
    if (touch.size === 1) {
      cam.yaw += (ev.clientX - before[0]) * 0.008;
      cam.pitch = Math.min(1.45, Math.max(0.35, cam.pitch + (ev.clientY - before[1]) * 0.006));
    } else if (touch.size === 2) {
      const [a, b] = [...touch.values()];
      const now = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (gap > 0 && now > 0) cam.span = Math.min(7000, Math.max(150, cam.span * (gap / now)));
      gap = now;
    }
    draw();
  });
  // 끌지 않고 톡 누르면 손가락 아래에 있는 것을 고른다.
  let down = null;
  canvas.addEventListener('pointerdown', (ev) => { down = touch.size === 1 ? [ev.clientX, ev.clientY] : null; });
  function tap(ev) {
    if (!down || Math.hypot(ev.clientX - down[0], ev.clientY - down[1]) > 8) return;
    const r = canvas.getBoundingClientRect();
    const hit = pickAt(ev.clientX - r.left, ev.clientY - r.top, hits);
    canvas.dataset.tap = hit ? hit.kind : 'none';
    if (!hit) return;
    if (hit.kind === 'pin') on.onPin?.(hit.id);
    else if (hit.kind === 'booth') { chosenBooth = hit.key; draw(); on.onBooth?.(hit.key); }
    else if (hit.kind === 'place') { chosen = hit.p.k; draw(); on.onPlace?.(hit.p); }
    else { chosen = null; draw(); on.onCampus?.(hit.c); }
  }
  const lift = (ev) => { touch.delete(ev.pointerId); gap = 0; if (!touch.size && moving) { moving = false; draw(); } };
  canvas.addEventListener('pointerup', (ev) => { tap(ev); down = null; });
  canvas.addEventListener('pointerup', lift);
  canvas.addEventListener('pointercancel', lift);
  canvas.addEventListener('wheel', (ev) => { ev.preventDefault(); cam.span = Math.min(7000, Math.max(150, cam.span * (ev.deltaY > 0 ? 1.15 : 0.87))); draw(); }, { passive: false });
  new ResizeObserver(draw).observe(canvas);

  return {
    node: canvas,
    look,
    zoom: (f) => { cam.span = Math.min(7000, Math.max(150, cam.span * f)); draw(); },
    // 2D와 같이 그릴 것을 받는다: { pins, lines, dots, next, quiet(길 안내 중) }.
    set: (next) => { scene = { pins: next.pins || [], lines: next.lines || [], dots: next.dots || [], next: next.next || null, quiet: !!next.quiet }; draw(); },
    // 고른 장소를 밝게 칠한다 (null이면 지운다).
    choose: (k) => { if (chosen !== k) { chosen = k; draw(); } },
    // 고른 부스를 짙게 칠한다.
    chooseBooth: (key) => { if (chosenBooth !== key) { chosenBooth = key; draw(); } },
    // 칠하기를 바꿨을 때 다시 그린다.
    redraw: () => draw(),
    // 시험할 때 쓴다: 지금 화면에 찍힌 부스 점 · 갈 곳 번호 · 놓인 글자.
    boothsOnScreen: () => hits.booths.map(({ key, sx, sy }) => ({ key, sx, sy })),
    pinsOnScreen: () => hits.pins.map((p) => ({ ...p })),
    labelsOnScreen: () => ({ next: shown.next, nextRect: shown.nextRect, nextSize: LABEL + 2, band: shown.band, labels: shown.labels.map((l) => ({ ...l })) }),
    linesOnScreen: () => shown.lines.map((l) => ({ ...l })),
    // 시험할 때 쓴다: 그 자리를 누르면 무엇이 열리나(열지는 않는다). floor는 그 자리의 캠퍼스 바닥.
    whatAt: (x, y) => { const hit = pickAt(x, y, hits); const floor = hits.campuses.find((c) => inPoly(x, y, c.poly))?.c.k || null; return { kind: hit?.kind || null, name: hit ? hit.id || hit.key || hit.p?.k || hit.c?.k : null, floor }; },
    // 시험할 때 쓴다: 장소 꼭대기 가운데의 화면 자리.
    screenOf: (k) => { const s = hits.shapes.find((x) => x.p.k === k); if (!s) return null; const top = s.polys[s.polys.length - 1]; return [top.reduce((a, p) => a + p[0], 0) / top.length, top.reduce((a, p) => a + p[1], 0) / top.length]; },
    cam,
  };
}
