// 3D 지도: 지도 탭에서 "3D"를 누를 때만 불러온다. 바깥 3D 엔진 없이 캔버스에 직접 그린다.
// 장소를 기둥으로 세우고(홀은 낮게, 호텔은 높게), 끌어서 돌리고, 관심 회사를 번호로 찍는다.

const FILL = { hall: [201, 214, 238], room: [226, 220, 239], out: [217, 230, 220], hotel: [236, 220, 203] };
const DAY = ['#b9c0cf', '#f4b9a7', '#a9c6ee', '#a8d8bf', '#f1d38a'];
const shade = ([r, g, b], k) => `rgb(${Math.round(r * k)},${Math.round(g * k)},${Math.round(b * k)})`;

// 장소 하나의 바닥 높이와 꼭대기 높이.
function heights(p) {
  if (p.kind === 'hotel') return [0, p.height || 40];
  if (p.kind === 'room') return [p.floorY || 0, (p.floorY || 0) + 8];
  if (p.kind === 'hall') return [p.floorY || 0, (p.floorY || 0) + 14];
  return [0, 2];
}

export function create(L, places, pins) {
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
    ctx.fillStyle = '#e9edf4';
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
    ctx.strokeStyle = '#cfd6e2';
    for (const r of places.roads) {
      ctx.lineWidth = Math.max(1, r.w * k * 0.8);
      ctx.beginPath();
      r.pts.forEach(([x, z], i) => { const [wx, wz] = L.W(r.c, x, z); const [sx, sy] = project(wx, 0, wz); if (i) ctx.lineTo(sx, sy); else ctx.moveTo(sx, sy); });
      ctx.stroke();
    }

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
      for (const s of sides) {
        const light = 0.72 + 0.16 * Math.abs(Math.cos(Math.atan2(s.b[1] - s.a[1], s.b[0] - s.a[0]) + cam.yaw));
        face([project(s.a[0], y0, s.a[1]), project(s.b[0], y0, s.b[1]), project(s.b[0], y1, s.b[1]), project(s.a[0], y1, s.a[1])], shade(base, light));
      }
      face(p.world.map(([x, z]) => project(x, y1, z)), shade(base, 1), '#56679a');
      if (p.kind === 'hall' || p.kind === 'hotel' || cam.span < 1100) labels.push({ text: p.ko.replace('LVCC ', '').replace('베네시안 엑스포 ', '').replace(/ \(.*\)$/, ''), at: project(p.center[0], y1, p.center[1]) });
    }

    for (const pin of pins) {
      const place = L.list.find((p) => pin.booth.endsWith(`@${p.k}`));
      const top = place ? heights(place)[1] : 0;
      const [sx, sy] = project(pin.x, top, pin.z);
      const [, ty] = project(pin.x, top + 26, pin.z);
      ctx.strokeStyle = '#1f2a44';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx, ty); ctx.stroke();
      ctx.beginPath(); ctx.arc(sx, ty, 9, 0, Math.PI * 2); ctx.fillStyle = DAY[pin.day]; ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#1f2a44';
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
        ctx.strokeStyle = 'rgba(244,241,234,0.9)';
        ctx.strokeText(l.text, l.at[0], l.at[1] - 3);
        ctx.fillStyle = '#1f2a44';
        ctx.fillText(l.text, l.at[0], l.at[1] - 3);
      }
    }
  }

  // 한 손가락으로 끌면 돈다. 두 손가락은 크게 · 작게.
  const touch = new Map();
  let gap = 0;
  canvas.addEventListener('pointerdown', (ev) => { touch.set(ev.pointerId, [ev.clientX, ev.clientY]); canvas.setPointerCapture?.(ev.pointerId); });
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
  const lift = (ev) => { touch.delete(ev.pointerId); gap = 0; };
  canvas.addEventListener('pointerup', lift);
  canvas.addEventListener('pointercancel', lift);
  canvas.addEventListener('wheel', (ev) => { ev.preventDefault(); cam.span = Math.min(7000, Math.max(150, cam.span * (ev.deltaY > 0 ? 1.15 : 0.87))); draw(); }, { passive: false });
  new ResizeObserver(draw).observe(canvas);

  return { node: canvas, look, zoom: (f) => { cam.span = Math.min(7000, Math.max(150, cam.span * f)); draw(); }, cam };
}
