// 지도 손짓: 한 손가락 끌기 · 두 손가락 벌리기(확대 · 축소) · 두 번 톡(확대) · 휠.
// 보는 칸을 바꾸기만 하고 그리기는 맡긴 쪽(api.draw)이 한 프레임에 한 번 한다 (60fps를 노리고 DOM 쓰기를 프레임마다 한 번으로).
// 끌고 난 뒤에 손가락을 떼면서 생기는 click은 막는다 (끌다가 홀이 눌리지 않게).

import { easeOut, fitBox, mixBox, panBox, widthOf, zoomBox } from './mapmath.js';

const SLOP = 8;          // 이만큼(px) 움직여야 끌기다
const DOUBLE_MS = 300;   // 두 번 톡 사이
const DOUBLE_PX = 36;

// api: { getView(), setView(view), draw(), onSettle(), ratio() }
export function attachGestures(board, api) {
  const pointers = new Map();
  let moved = false;
  let frame = 0;
  let anim = 0;
  let lastTap = null;
  let swallow = false;
  let pinch = null;
  let down = null;

  const schedule = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; api.draw(); }); };
  const rect = () => board.getBoundingClientRect();
  const toWorld = (cx, cy) => {
    const r = rect(), v = api.getView();
    return [v[0] + ((cx - r.left) / r.width) * widthOf(v), v[1] + ((cy - r.top) / r.height) * (v[3] - v[1])];
  };
  const stopAnim = () => { if (anim) { cancelAnimationFrame(anim); anim = 0; } };
  const set = (v) => { api.setView(v); schedule(); };

  // 부드럽게 옮기기: box가 다 보이게(비율에 맞춰) ms 동안 간다. 끝나면 onSettle.
  function animateTo(box, ms = 340, exact = false) {
    stopAnim();
    const from = api.getView();
    const to = exact ? box : fitBox(box, api.ratio());
    const t0 = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - t0) / ms);
      api.setView(mixBox(from, to, easeOut(t)));
      api.draw();
      if (t < 1) anim = requestAnimationFrame(step); else { anim = 0; api.onSettle?.(); }
    };
    anim = requestAnimationFrame(step);
  }
  // 지도 위에 얹힌 것(아래 카드 · 찾기 칸 · 단추)의 자리에서 시작한 입력은 받지 않는다. 그 자리에 보이는 것이 지도일 때만 받는다.
  const onMap = (ev) => { const top = document.elementFromPoint(ev.clientX, ev.clientY); return !top || board.contains(top); };

  const zoomTo = (factor, cx, cz, animate = true) => {
    const next = zoomBox(api.getView(), factor, cx, cz);
    if (animate) animateTo(next, 260, true); else { set(next); api.onSettle?.(); }
  };

  board.addEventListener('pointerdown', (ev) => {
    if (!onMap(ev)) return;
    stopAnim();
    pointers.set(ev.pointerId, [ev.clientX, ev.clientY]);
    if (pointers.size === 1) { moved = false; swallow = false; down = { x: ev.clientX, y: ev.clientY, t: performance.now() }; }
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { dist: Math.hypot(a[0] - b[0], a[1] - b[1]), mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] };
      moved = true;
    }
  });
  board.addEventListener('pointermove', (ev) => {
    if (!pointers.has(ev.pointerId)) return;
    const before = pointers.get(ev.pointerId);
    pointers.set(ev.pointerId, [ev.clientX, ev.clientY]);
    const r = rect();
    if (pointers.size === 1) {
      if (!moved && down && Math.hypot(ev.clientX - down.x, ev.clientY - down.y) < SLOP) return;
      moved = true;
      const v = api.getView();
      set(panBox(v, -((ev.clientX - before[0]) / r.width) * widthOf(v), -((ev.clientY - before[1]) / r.height) * (v[3] - v[1])));
    } else if (pointers.size === 2 && pinch) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a[0] - b[0], a[1] - b[1]);
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      let v = api.getView();
      // 가운데가 움직인 만큼 옮기고, 벌린 만큼 그 가운데를 두고 확대한다.
      v = panBox(v, -((mid[0] - pinch.mid[0]) / r.width) * widthOf(v), -((mid[1] - pinch.mid[1]) / r.height) * (v[3] - v[1]));
      if (pinch.dist > 0 && dist > 0) { const [wx, wz] = [v[0] + ((mid[0] - r.left) / r.width) * widthOf(v), v[1] + ((mid[1] - r.top) / r.height) * (v[3] - v[1])]; v = zoomBox(v, pinch.dist / dist, wx, wz); }
      pinch = { dist, mid };
      set(v);
    }
  });
  const lift = (ev) => {
    const had = pointers.has(ev.pointerId);
    pointers.delete(ev.pointerId);
    if (!had) return;
    if (pointers.size < 2) pinch = null;
    if (pointers.size === 0) {
      if (moved) { swallow = true; api.onSettle?.(); setTimeout(() => { swallow = false; }, 120); } else if (down && ev.type === 'pointerup') {
        // 두 번 톡: 그 자리를 가운데로 두고 확대한다.
        const now = performance.now();
        if (lastTap && now - lastTap.t < DOUBLE_MS && Math.hypot(ev.clientX - lastTap.x, ev.clientY - lastTap.y) < DOUBLE_PX) {
          swallow = true;
          lastTap = null;
          const [wx, wz] = toWorld(ev.clientX, ev.clientY);
          zoomTo(0.42, wx, wz);
          setTimeout(() => { swallow = false; }, 120);
        } else lastTap = { t: now, x: ev.clientX, y: ev.clientY };
      }
    }
  };
  board.addEventListener('pointerup', lift);
  board.addEventListener('pointercancel', lift);
  // 끌고 난 뒤 · 두 번 톡 뒤의 click은 앞 화면에 닿지 않게 막는다.
  board.addEventListener('click', (ev) => { if (swallow) { ev.stopPropagation(); ev.preventDefault(); } }, true);
  board.addEventListener('wheel', (ev) => {
    if (!onMap(ev)) return;
    ev.preventDefault();
    stopAnim();
    const [wx, wz] = toWorld(ev.clientX, ev.clientY);
    set(zoomBox(api.getView(), ev.deltaY > 0 ? 1.18 : 0.85, wx, wz));
    clearTimeout(board.__wheel);
    board.__wheel = setTimeout(() => api.onSettle?.(), 120);
  }, { passive: false });

  return { animateTo, zoomTo, toWorld, stop: stopAnim, dragging: () => pointers.size > 0 && moved };
}
