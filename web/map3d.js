// 3D 지도: 지도 탭에서 "3D"를 누를 때만 불러온다. 바깥 3D 엔진 없이 캔버스에 직접 그린다.
// 장소를 기둥으로 세우고(홀은 낮게, 호텔은 높게), 끌어서 돌리고, 관심 회사를 번호로 찍는다.
// 장소를 톡 누르면 그 장소가, 장소가 없는 캠퍼스 바닥을 누르면 캠퍼스가 골라진다.
// 가까이 보면 부스가 점으로 찍히고, 점을 누르면 그 부스가 골라진다.

import { T, DAY_COLORS, rgbOf, withAlpha } from './tokens.js';

const FILL = { hall: rgbOf(T.hall), room: rgbOf(T.room), out: rgbOf(T.out), hotel: rgbOf(T.hotel) };
const DAY = DAY_COLORS;
const shade = ([r, g, b], k) => `rgb(${Math.round(r * k)},${Math.round(g * k)},${Math.round(b * k)})`;

// 장소 하나의 바닥 높이와 꼭대기 높이.
function heights(p) {
  if (p.kind === 'hotel') return [0, p.height || 40];
  if (p.kind === 'room') return [p.floorY || 0, (p.floorY || 0) + 8];
  if (p.kind === 'hall') return [p.floorY || 0, (p.floorY || 0) + 14];
  return [0, 2];
}

export function create(L, places, pins, on = {}) {
  // 누를 수 있게, 그린 모양을 화면 좌표로 기억해 둔다 (뒤에 그린 것이 앞에 있다).
  let hitShapes = [];
  let hitCampuses = [];
  let hitBooths = [];
  let chosen = null;
  let chosenBooth = null;
  // 부스: 가까이 볼 때만 점으로 찍는다. 장소의 꼭대기 높이에 올려놓는다.
  const BOOTH_SPAN = 620;
  const topOf = new Map(L.list.map((p) => [p.k, heights(p)[1]]));
  const booths = (on.booths || []).map((b) => ({ ...b, top: topOf.get(b.key.slice(0, b.key.indexOf('|'))) ?? 0 }));
  const inPoly = (x, y, poly) => {
    let hit = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
  };
  const canvas = document.createElement('canvas');
  canvas.className = 'map';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'CES 2027 캠퍼스 3D 지도. 끌어서 돌린다. 홀 안 부스 자리는 짐작이다.');
  const ctx = canvas.getContext('2d');
  const cam = { yaw: -0.5, pitch: 0.95, cx: 0, cz: 0, span: 3000 };

  function look(box) {
    const b = box || [L.box[0] - 120, L.box[1] - 120, L.box[2] + 120, L.box[3] + 120];
    cam.cx = (b[0] + b[2]) / 2;
    cam.cz = (b[1] + b[3]) / 2;
    cam.span = Math.max(b[2] - b[0], b[3] - b[1]) * 1.15;
    draw();
  }

  function draw() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth || 328, h = canvas.clientHeight || 420;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = T.bg;
    ctx.fillRect(0, 0, w, h);
    const k = Math.min(w, h) / cam.span;
    const cos = Math.cos(cam.yaw), sin = Math.sin(cam.yaw), sp = Math.sin(cam.pitch), cp = Math.cos(cam.pitch);
    // 세계 (x, 높이 y, z) → 화면. depth가 클수록 앞이다.
    const project = (x, y, z) => {
      const dx = x - cam.cx, dz = z - cam.cz;
      const rx = dx * cos - dz * sin, rz = dx * sin + dz * cos;
      return [w / 2 + rx * k, h / 2 + (rz * sp - y * cp) * k, rz];
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
    ctx.strokeStyle = T.road;
    for (const r of places.roads) {
      ctx.lineWidth = Math.max(1, r.w * k * 0.8);
      ctx.beginPath();
      r.pts.forEach(([x, z], i) => { const [wx, wz] = L.W(r.c, x, z); const [sx, sy] = project(wx, 0, wz); if (i) ctx.lineTo(sx, sy); else ctx.moveTo(sx, sy); });
      ctx.stroke();
    }

    // 캠퍼스 바닥: 누르면 캠퍼스가 골라진다.
    hitCampuses = L.campuses.map((c) => {
      const [x0, z0, x1, z1] = [c.box[0] - 40, c.box[1] - 40, c.box[2] + 40, c.box[3] + 40];
      const poly = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]].map(([x, z]) => project(x, 0, z));
      face(poly, withAlpha(T.panel2, 0.55));
      return { c, polys: [poly] };
    });
    hitShapes = [];
    const solids = L.list.map((p) => ({ p, depth: project(p.center[0], 0, p.center[1])[2] })).sort((a, b) => a.depth - b.depth);
    const labels = [];
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
      hitShapes.push({ p, polys });
      if (p.kind === 'hall' || p.kind === 'hotel' || cam.span < 1100) labels.push({ text: p.ko.replace('LVCC ', '').replace('베네시안 엑스포 ', '').replace(/ \(.*\)$/, ''), at: project(p.center[0], y1, p.center[1]) });
    }

    // 부스 점 (자리는 짐작). 화면 안에 든 것만, 많으면 900개까지.
    hitBooths = [];
    if (cam.span <= BOOTH_SPAN) {
      for (const b of booths) {
        const [sx, sy] = project(b.x, b.top, b.z);
        if (sx < -6 || sy < -6 || sx > w + 6 || sy > h + 6) continue;
        hitBooths.push({ key: b.key, sx, sy });
        if (hitBooths.length >= 900) break;
      }
      for (const b of hitBooths) {
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

    for (const pin of pins) {
      const place = L.list.find((p) => pin.booth.endsWith(`@${p.k}`));
      const top = place ? heights(place)[1] : 0;
      const [sx, sy] = project(pin.x, top, pin.z);
      const [, ty] = project(pin.x, top + 26, pin.z);
      ctx.strokeStyle = T.ink;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx, ty); ctx.stroke();
      ctx.beginPath(); ctx.arc(sx, ty, 9, 0, Math.PI * 2); ctx.fillStyle = DAY[pin.day]; ctx.fill(); ctx.stroke();
      ctx.fillStyle = T.ink;
      ctx.font = '700 10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(pin.no), sx, ty + 0.5);
    }

    if (cam.span < 2600) {
      ctx.font = '700 11px system-ui, -apple-system, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      for (const l of labels) {
        ctx.lineWidth = 3;
        ctx.strokeStyle = withAlpha(T.panel, 0.9);
        ctx.strokeText(l.text, l.at[0], l.at[1] - 3);
        ctx.fillStyle = T.ink;
        ctx.fillText(l.text, l.at[0], l.at[1] - 3);
      }
    }
  }

  // 한 손가락으로 끌면 돈다. 두 손가락은 크게 · 작게.
  const touch = new Map();
  let gap = 0;
  canvas.addEventListener('pointerdown', (ev) => { touch.set(ev.pointerId, [ev.clientX, ev.clientY]); try { canvas.setPointerCapture(ev.pointerId); } catch { /* 잡지 못해도 끌기는 된다 */ } });
  canvas.addEventListener('pointermove', (ev) => {
    if (!touch.has(ev.pointerId)) return;
    const before = touch.get(ev.pointerId);
    touch.set(ev.pointerId, [ev.clientX, ev.clientY]);
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
  // 끌지 않고 톡 누르면 장소를(없으면 캠퍼스를) 고른다.
  let down = null;
  canvas.addEventListener('pointerdown', (ev) => { down = touch.size === 1 ? [ev.clientX, ev.clientY] : null; });
  function tap(ev) {
    if (!down || Math.hypot(ev.clientX - down[0], ev.clientY - down[1]) > 8) return;
    const r = canvas.getBoundingClientRect();
    const x = ev.clientX - r.left, y = ev.clientY - r.top;
    // 부스 점이 보일 때는 가장 가까운 점(손가락 크기 안)을 먼저 고른다.
    let near = null;
    for (const b of hitBooths) {
      const d = Math.hypot(b.sx - x, b.sy - y);
      if (d <= 16 && (!near || d < near.d)) near = { key: b.key, d };
    }
    if (near) { chosenBooth = near.key; draw(); on.onBooth?.(near.key); return; }
    for (let i = hitShapes.length - 1; i >= 0; i--) {
      if (hitShapes[i].polys.some((poly) => inPoly(x, y, poly))) { chosen = hitShapes[i].p.k; draw(); on.onPlace?.(hitShapes[i].p); return; }
    }
    const campus = hitCampuses.find((h) => h.polys.some((poly) => inPoly(x, y, poly)));
    if (campus) { chosen = null; draw(); on.onCampus?.(campus.c); }
  }
  const lift = (ev) => { touch.delete(ev.pointerId); gap = 0; };
  canvas.addEventListener('pointerup', (ev) => { tap(ev); down = null; });
  canvas.addEventListener('pointerup', lift);
  canvas.addEventListener('pointercancel', lift);
  canvas.addEventListener('wheel', (ev) => { ev.preventDefault(); cam.span = Math.min(7000, Math.max(150, cam.span * (ev.deltaY > 0 ? 1.15 : 0.87))); draw(); }, { passive: false });
  new ResizeObserver(draw).observe(canvas);

  return {
    node: canvas,
    look,
    zoom: (f) => { cam.span = Math.min(7000, Math.max(150, cam.span * f)); draw(); },
    // 고른 장소를 밝게 칠한다 (null이면 지운다).
    choose: (k) => { if (chosen !== k) { chosen = k; draw(); } },
    // 고른 부스를 짙게 칠한다.
    chooseBooth: (key) => { if (chosenBooth !== key) { chosenBooth = key; draw(); } },
    // 칠하기를 바꿨을 때 다시 그린다.
    redraw: () => draw(),
    // 시험할 때 쓴다: 지금 화면에 찍힌 부스 점들.
    boothsOnScreen: () => hitBooths.map((b) => ({ ...b })),
    // 시험할 때 쓴다: 장소 꼭대기 가운데의 화면 자리.
    screenOf: (k) => { const h = hitShapes.find((s) => s.p.k === k); if (!h) return null; const top = h.polys[h.polys.length - 1]; return [top.reduce((a, p) => a + p[0], 0) / top.length, top.reduce((a, p) => a + p[1], 0) / top.length]; },
    cam,
  };
}
