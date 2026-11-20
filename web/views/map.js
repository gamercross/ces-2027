// 지도: 2D가 기본이다. 3D는 "3D"를 누를 때 불러온다. "크게 보기"는 캠퍼스 셋을 한 화면에 보인다.
// 관심 회사는 동선 번호로 찍힌다. 홀 안 부스 자리는 짐작이다.

import { el, out } from '../dom.js';
import { getExhibitors, getInfo, getPlaces } from '../data.js';
import { getInterests } from '../store.js';
import { layout } from '../geo.js';
import { boothSpots, spotOf } from '../spots.js';

const NS = 'http://www.w3.org/2000/svg';
const FILL = { hall: '#c9d6ee', room: '#e2dcef', out: '#d9e6dc', hotel: '#ecdccb' };
const DAY_FILL = ['#b9c0cf', '#f4b9a7', '#a9c6ee', '#a8d8bf', '#f1d38a'];

function svg(tag, attrs, ...kids) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) if (v != null) node.setAttribute(k, v);
  node.append(...kids);
  return node;
}
const pts = (poly) => poly.map(([x, z]) => `${x.toFixed(1)},${z.toFixed(1)}`).join(' ');

// 구글맵에서 열 주소 (Maps URLs, API 키 없음).
export function mapsLink(places, place, kind = 'search') {
  if (!place.maps) return null;
  const venue = places.venues[place.maps.venue];
  const query = [place.maps.query, venue?.address].filter(Boolean).join(', ');
  return places.mapsUrls[kind].replace('{query}', encodeURIComponent(query));
}

// 관심 회사를 동선 차례대로, 날짜마다 번호를 붙여 돌려준다.
export function interestPins(data, spots) {
  const byId = new Map(data.ex.map((r) => [r[0], r]));
  const counter = new Map();
  const pins = [];
  for (const it of getInterests()) {
    const row = byId.get(it.id);
    const booth = row?.[7]?.[0];
    const spot = spotOf(spots, booth);
    const day = it.day || 0;
    const no = (counter.get(day) || 0) + 1;
    counter.set(day, no);
    if (spot) pins.push({ ...spot, no, day, name: row[1], booth });
  }
  return pins;
}

export async function render() {
  const places = await getPlaces();
  const [data, info] = await Promise.all([getExhibitors().catch(() => null), getInfo()]);
  const L = layout(places);
  const spots = data ? boothSpots(places, data) : new Map();
  const pins = data ? interestPins(data, spots) : [];
  const pad = (b, m) => [b[0] - m, b[1] - m, b[2] + m, b[3] + m];
  const all = pad(L.box, 120);
  let view = [...all];

  const roads = svg('g', { fill: 'none', stroke: '#cfd6e2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' },
    ...places.roads.map((r) => svg('polyline', { points: pts(r.pts.map(([x, z]) => L.W(r.c, x, z))), 'stroke-width': r.w * (places.campuses.find((c) => c.k === r.c).toWorld.scale) })));
  const decor = svg('g', { fill: '#dfe3ea' }, ...places.decor.map((d) => svg('polygon', { points: pts(d.poly.map(([x, z]) => L.W(d.c, x, z))) })));
  const links = svg('g', { fill: 'none', stroke: '#8fa3c8', 'stroke-dasharray': '18 14', 'stroke-width': 5, opacity: 0.8 },
    ...places.links.map((k) => { const a = L.W(k.from.c, ...k.from.at), b = L.W(k.to.c, ...k.to.at); return svg('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1] }); }));
  const shapes = svg('g', { stroke: '#56679a', 'stroke-width': 1.5, 'vector-effect': 'non-scaling-stroke' });
  const labels = svg('g', { 'text-anchor': 'middle', fill: '#1f2a44', 'font-weight': 700 });
  const campusLabels = svg('g', { 'text-anchor': 'middle', fill: '#4b5878', 'font-weight': 700 });
  const marks = svg('g', {});
  const pinLayer = svg('g', {});
  const me = svg('g', { id: 'me-layer' });
  const board = svg('svg', { class: 'map', role: 'img', 'aria-label': 'CES 2027 캠퍼스 지도. 홀 안 부스 자리는 짐작이다.' }, roads, decor, links, shapes, campusLabels, labels, marks, pinLayer, me);

  const detail = el('div', { class: 'panel', 'aria-live': 'polite' }, el('p', { class: 'note', text: '장소를 누르면 이름과 구글맵 링크가 나온다.' }));
  function pick(p) {
    for (const node of shapes.children) node.setAttribute('stroke-width', node.dataset.k === p.k ? 4 : 1.5);
    const link = mapsLink(places, p);
    const route = mapsLink(places, p, 'directions');
    const here = pins.filter((pin) => pin.booth.endsWith(`@${p.k}`));
    detail.replaceChildren(
      el('h2', { text: p.ko }),
      el('p', { text: p.theme }),
      here.length ? el('p', { class: 'note', text: `내 관심 ${here.length}곳: ${here.map((h) => h.name).slice(0, 4).join(' · ')}${here.length > 4 ? ' …' : ''}` }) : null,
      el('p', { class: 'note', text: p.boothSpots === 'guess' ? '이 안의 부스 자리는 짐작이다 (정식 배치도 전).' : '부스 자리는 공식 배치도다.' }),
      link ? el('div', { class: 'actions' }, out(link, '구글맵에서 열기', 'btn'), out(route, '걸어서 길찾기', 'btn ghost')) : el('p', { class: 'note', text: '구글맵에서 쓸 이름을 아직 모른다.' }));
  }
  for (const p of L.list) {
    const shape = svg('polygon', { points: pts(p.world), fill: FILL[p.kind] || '#dde3ee', tabindex: 0, role: 'button', 'aria-label': p.ko });
    shape.dataset.k = p.k;
    shape.addEventListener('click', () => pick(p));
    shape.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); pick(p); } });
    shapes.append(shape);
    const short = p.ko.replace('LVCC ', '').replace('베네시안 엑스포 ', '').replace(/ \(.*\)$/, '');
    const text = svg('text', { x: p.center[0], y: p.center[1], 'dominant-baseline': 'middle', 'pointer-events': 'none' });
    text.textContent = short;
    text.dataset.big = p.kind === 'hall' || p.kind === 'hotel' ? '1' : '0';
    labels.append(text);
  }
  for (const c of L.campuses) {
    const text = svg('text', { x: (c.box[0] + c.box[2]) / 2, y: c.box[1] - 40, 'pointer-events': 'none' });
    text.textContent = c.ko;
    campusLabels.append(text);
  }
  for (const m of places.landmarks) {
    const at = m.at ? L.W(m.c, ...m.at) : (() => { const s = spots.get(`${m.place}|${m.booth}`); return s ? [s.x, s.z] : null; })();
    if (!at) continue;
    const g = svg('g', {}, svg('circle', { cx: at[0], cy: at[1], fill: m.kind === 'badge' ? '#8a6fb3' : m.kind === 'shuttle' ? '#3f8f86' : '#6b7896' }), svg('title', {}));
    g.lastChild.textContent = m.ko;
    const text = svg('text', { x: at[0], y: at[1], fill: '#1f2a44', 'pointer-events': 'none' });
    text.textContent = m.ko;
    g.append(text);
    marks.append(g);
  }
  for (const pin of pins) {
    const g = svg('g', {}, svg('circle', { cx: pin.x, cy: pin.z, fill: DAY_FILL[pin.day], stroke: '#1f2a44', 'stroke-width': 1.5, 'vector-effect': 'non-scaling-stroke' }), svg('title', {}));
    g.querySelector('title').textContent = `${pin.no}. ${pin.name}`;
    const text = svg('text', { x: pin.x, y: pin.z, 'text-anchor': 'middle', 'dominant-baseline': 'central', fill: '#1f2a44', 'font-weight': 700, 'pointer-events': 'none' });
    text.textContent = String(pin.no);
    g.append(text);
    pinLayer.append(g);
  }

  // 보는 칸을 바꾸면 글자와 점의 크기를 화면에 맞춘다.
  function apply() {
    const [x0, z0, x1, z1] = view;
    const w = x1 - x0;
    board.setAttribute('viewBox', `${x0} ${z0} ${w} ${z1 - z0}`);
    const unit = w / 360;
    labels.setAttribute('font-size', (unit * 11).toFixed(1));
    campusLabels.setAttribute('font-size', (unit * 13).toFixed(1));
    for (const t of labels.children) t.style.display = t.dataset.big === '1' ? (w < 2600 ? '' : 'none') : (w < 1100 ? '' : 'none');
    campusLabels.style.display = w >= 1500 ? '' : 'none';
    for (const g of marks.children) {
      g.querySelector('circle').setAttribute('r', (unit * 4).toFixed(1));
      const t = g.querySelector('text');
      t.setAttribute('font-size', (unit * 9).toFixed(1));
      t.setAttribute('dx', (unit * 6).toFixed(1));
      t.setAttribute('dy', (unit * 3).toFixed(1));
      t.style.display = w < 900 ? '' : 'none';
    }
    for (const g of pinLayer.children) {
      g.querySelector('circle').setAttribute('r', (unit * 9).toFixed(1));
      g.querySelector('text').setAttribute('font-size', (unit * 10).toFixed(1));
    }
    board.dispatchEvent(new CustomEvent('viewchange', { detail: { unit } }));
  }
  // 화면 비율에 맞게 칸을 넓혀서 다 보이게 한다.
  function fit(box) {
    const ratio = (board.clientHeight || 420) / (board.clientWidth || 360);
    let [x0, z0, x1, z1] = box;
    const w = x1 - x0, h = z1 - z0;
    if (h / w > ratio) { const grow = (h / ratio - w) / 2; x0 -= grow; x1 += grow; } else { const grow = (w * ratio - h) / 2; z0 -= grow; z1 += grow; }
    view = [x0, z0, x1, z1];
    apply();
  }
  function zoom(factor, cx, cz) {
    const [x0, z0, x1, z1] = view;
    const w = x1 - x0;
    if ((factor < 1 && w < 120) || (factor > 1 && w > 6000)) return;
    const px = cx ?? (x0 + x1) / 2, pz = cz ?? (z0 + z1) / 2;
    view = [px - (px - x0) * factor, pz - (pz - z0) * factor, px + (x1 - px) * factor, pz + (z1 - pz) * factor];
    apply();
  }
  const toWorldPoint = (ev) => {
    const r = board.getBoundingClientRect();
    return [view[0] + ((ev.clientX - r.left) / r.width) * (view[2] - view[0]), view[1] + ((ev.clientY - r.top) / r.height) * (view[3] - view[1])];
  };
  // 한 손가락은 옮기기, 두 손가락은 크게 · 작게.
  const touch = new Map();
  let gap = 0;
  board.addEventListener('pointerdown', (ev) => { touch.set(ev.pointerId, [ev.clientX, ev.clientY]); });
  board.addEventListener('pointermove', (ev) => {
    if (!touch.has(ev.pointerId)) return;
    const before = touch.get(ev.pointerId);
    touch.set(ev.pointerId, [ev.clientX, ev.clientY]);
    const r = board.getBoundingClientRect();
    if (touch.size === 1) {
      const dx = ((ev.clientX - before[0]) / r.width) * (view[2] - view[0]);
      const dz = ((ev.clientY - before[1]) / r.height) * (view[3] - view[1]);
      if (Math.abs(ev.clientX - before[0]) + Math.abs(ev.clientY - before[1]) > 0) { view = [view[0] - dx, view[1] - dz, view[2] - dx, view[3] - dz]; apply(); }
    } else if (touch.size === 2) {
      const [a, b] = [...touch.values()];
      const now = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (gap > 0 && now > 0) zoom(gap / now, ...toWorldPoint({ clientX: (a[0] + b[0]) / 2, clientY: (a[1] + b[1]) / 2 }));
      gap = now;
    }
  });
  const lift = (ev) => { touch.delete(ev.pointerId); gap = 0; };
  board.addEventListener('pointerup', lift);
  board.addEventListener('pointercancel', lift);
  board.addEventListener('pointerleave', lift);
  board.addEventListener('wheel', (ev) => { ev.preventDefault(); zoom(ev.deltaY > 0 ? 1.15 : 0.87, ...toWorldPoint(ev)); }, { passive: false });

  const frame = el('div', { class: 'map-frame' }, board);
  const flat = el('button', { class: 'seg', type: 'button', text: '2D', 'aria-pressed': 'true' });
  const solid = el('button', { class: 'seg', type: 'button', text: '3D', 'aria-pressed': 'false' });
  let three = null;
  let focus = null;
  async function mode(is3d) {
    flat.setAttribute('aria-pressed', is3d ? 'false' : 'true');
    solid.setAttribute('aria-pressed', is3d ? 'true' : 'false');
    if (!is3d) { frame.replaceChildren(board); fit(focus || all); return; }
    frame.replaceChildren(el('p', { class: 'note map-wait', text: '3D를 불러오는 중이다.' }));
    try {
      // 3D는 여기서 처음 불러온다. 첫 화면에는 싣지 않는다.
      three ??= (await import('../map3d.js')).create(L, places, pins);
      frame.replaceChildren(three.node);
      three.look(focus);
    } catch {
      frame.replaceChildren(el('p', { class: 'note map-wait', text: '3D를 불러오지 못했다. 2D로 본다.' }));
    }
  }
  flat.addEventListener('click', () => mode(false));
  solid.addEventListener('click', () => mode(true));
  const go = (box) => { focus = box; if (solid.getAttribute('aria-pressed') === 'true') three?.look(box); else fit(box || all); };

  const page = el('div', { class: 'page' },
    el('section', { class: 'panel' },
      el('h1', { text: '지도' }),
      el('div', { class: 'segs' },
        el('button', { class: 'seg', type: 'button', text: '크게 보기', onclick: () => go(null) }),
        L.campuses.map((c) => el('button', { class: 'seg', type: 'button', text: c.ko.replace(' 캠퍼스', ''), onclick: () => go(pad(c.box, 40)) }))),
      el('div', { class: 'segs' }, flat, solid,
        el('button', { class: 'seg', type: 'button', text: '크게', 'aria-label': '지도 크게', onclick: () => (solid.getAttribute('aria-pressed') === 'true' ? three?.zoom(0.8) : zoom(0.7)) }),
        el('button', { class: 'seg', type: 'button', text: '작게', 'aria-label': '지도 작게', onclick: () => (solid.getAttribute('aria-pressed') === 'true' ? three?.zoom(1.25) : zoom(1.4)) })),
      frame,
      el('p', { class: 'note', text: `홀 안 부스 자리는 짐작이다 (공식 캠퍼스 지도 ${places.edition}판, 정식 배치도 전). 캠퍼스 사이 거리는 줄여서 그렸다.` }),
      pins.length
        ? el('p', { class: 'note', text: `번호는 내 동선의 차례다. 색은 날짜다: ${info.show.days.map((d, i) => `${d.ko.split(' ')[0]} ${['분홍', '파랑', '초록', '노랑'][i]}`).join(' · ')} · 미정 회색.` })
        : el('p', { class: 'note' }, '관심 회사를 넣으면 지도에 번호로 찍힌다. ', el('a', { href: '#/find', text: '회사 고르러 가기' }))),
    detail);
  // 화면에 붙은 뒤에야 크기를 알 수 있다.
  requestAnimationFrame(() => fit(all));
  page.mapApi = { board, layer: me, get view() { return view; }, fit, L, places, spots, pad };
  return page;
}
