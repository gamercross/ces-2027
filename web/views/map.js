// 지도: 2D가 기본이다. 3D는 "3D"를 누를 때 불러온다. "크게 보기"는 캠퍼스 셋을 한 화면에 보인다.
// 관심 회사는 동선 번호로 찍힌다. 홀 안 부스 자리는 짐작이다.

import { el, out } from '../dom.js';
import { getExhibitors, getInfo, getPlaces } from '../data.js';
import { getInterests } from '../store.js';
import { layout } from '../geo.js';
import { boothSpots, spotOf } from '../spots.js';
import { mapsLink } from '../maps.js';
import { findBooth, nearBooth, nearestArea, nearestCampus } from '../locate.js';
import { nextStop } from '../route.js';
import { getWhere, setWhere } from '../store.js';
import { companyRow } from '../company.js';

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
    if (spot) pins.push({ ...spot, id: it.id, seen: !!it.seen, no, day, name: row[1], booth });
  }
  return pins;
}

export async function render({ rest = [] } = {}) {
  const places = await getPlaces();
  const [data, info] = await Promise.all([getExhibitors().catch(() => null), getInfo()]);
  const L = layout(places);
  const spots = data ? boothSpots(places, data) : new Map();
  const pins = data ? interestPins(data, spots) : [];
  const placeKo = new Map(places.places.map((p) => [p.k, p.ko]));
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

  const detail = el('div', { class: 'panel', 'aria-live': 'polite' }, el('p', { class: 'note', text: '장소를 누르면 이름 · 구글맵 링크 · 그 장소의 회사가 나온다. 3D에서도 누를 수 있다.' }));
  // 그 장소에 부스가 있는 회사 (이름 차례). 많으면 조금씩 보인다.
  function companyList(rows) {
    const list = el('ol', { class: 'hits' });
    const more = el('button', { class: 'btn ghost wide', type: 'button' });
    let shown = 0;
    const add = () => {
      list.append(...rows.slice(shown, shown + 20).map((r) => companyRow(r, data, placeKo)));
      shown = Math.min(rows.length, shown + 20);
      more.hidden = shown >= rows.length;
      more.textContent = `더 보기 (${rows.length - shown}곳 남음)`;
    };
    more.addEventListener('click', add);
    add();
    return [list, more];
  }
  const rowsAt = (keys) => (data?.ex || []).filter((r) => r[7].some((b) => keys.includes(b.slice(b.lastIndexOf('@') + 1))));
  const in3d = () => solid.getAttribute('aria-pressed') === 'true';
  // 2D로 넘어가 그 칸을 보인다.
  const to2d = (box) => { focus = box; if (in3d()) mode(false); else fit(box); };
  function pick(p, scroll) {
    for (const node of shapes.children) node.setAttribute('stroke-width', node.dataset.k === p.k ? 4 : 1.5);
    three?.choose(p.k);
    const link = mapsLink(places, p);
    const route = mapsLink(places, p, 'directions');
    const here = pins.filter((pin) => pin.booth.endsWith(`@${p.k}`));
    const rows = rowsAt([p.k]);
    const box = pad([Math.min(...p.world.map((w) => w[0])), Math.min(...p.world.map((w) => w[1])), Math.max(...p.world.map((w) => w[0])), Math.max(...p.world.map((w) => w[1]))], 30);
    // replaceChildren은 null을 글자 "null"로 찍으므로 빈 것은 걸러서 넣는다.
    detail.replaceChildren(...[
      el('h2', { text: p.ko }),
      el('p', { text: p.theme }),
      here.length ? el('p', { class: 'note', text: `내 관심 ${here.length}곳: ${here.map((h) => h.name).slice(0, 4).join(' · ')}${here.length > 4 ? ' …' : ''}` }) : null,
      el('p', { class: 'note', text: `${p.shapeGuess ? '이 장소는 공식 지도에 그려져 있지 않아 자리와 모양이 어림이다. ' : ''}${p.boothSpots === 'guess' ? '이 안의 부스 자리는 짐작이다 (정식 배치도 전).' : '부스 자리는 공식 배치도다.'}` }),
      el('div', { class: 'actions' },
        in3d() ? el('button', { class: 'btn', type: 'button', text: '2D 지도에서 보기', onclick: () => to2d(box) }) : null,
        link ? out(link, '구글맵에서 열기', in3d() ? 'btn ghost' : 'btn') : null,
        link ? out(route, '걸어서 길찾기', 'btn ghost') : null),
      link ? null : el('p', { class: 'note', text: '구글맵에서 쓸 이름을 아직 모른다.' }),
      el('h3', { text: `이 장소의 회사 ${rows.length}곳` }),
      ...(rows.length ? companyList(rows) : [el('p', { class: 'note', text: '받은 자료에는 이 장소의 회사가 없다.' })]),
    ].filter(Boolean));
    if (scroll) detail.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  // 캠퍼스를 누르면(3D의 바닥): 그 캠퍼스의 장소들과 회사 수.
  function pickCampus(c, scroll) {
    three?.choose(null);
    const mine = L.list.filter((p) => p.c === c.k);
    const count = new Map(mine.map((p) => [p.k, 0]));
    for (const r of data?.ex || []) for (const k of new Set(r[7].map((b) => b.slice(b.lastIndexOf('@') + 1)))) if (count.has(k)) count.set(k, count.get(k) + 1);
    detail.replaceChildren(
      el('h2', { text: c.ko }),
      el('p', { text: c.sub }),
      el('p', { class: 'note', text: `장소 ${mine.length}곳 · 회사 ${rowsAt(mine.map((p) => p.k)).length}곳. 장소를 누르면 그곳의 회사가 나온다.` }),
      el('div', { class: 'actions' }, el('button', { class: 'btn', type: 'button', text: '2D 지도에서 보기', onclick: () => to2d(pad(c.box, 40)) })),
      el('div', { class: 'fields' }, mine.filter((p) => count.get(p.k) > 0).map((p) => el('button', { class: 'field-link', type: 'button', onclick: () => pick(p, true) },
        el('span', { text: p.ko.replace('LVCC ', '').replace('베네시안 엑스포 ', '') }), el('small', { text: String(count.get(p.k)) })))));
    if (scroll) detail.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
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
    const g = svg('g', {}, svg('circle', { cx: pin.x, cy: pin.z, fill: DAY_FILL[pin.day], stroke: '#1f2a44', 'stroke-width': 1.5, 'vector-effect': 'non-scaling-stroke', opacity: pin.seen ? 0.45 : 1 }), svg('title', {}));
    g.querySelector('title').textContent = `${pin.no}. ${pin.name}`;
    const text = svg('text', { x: pin.x, y: pin.z, 'text-anchor': 'middle', 'dominant-baseline': 'central', fill: '#1f2a44', 'font-weight': 700, 'pointer-events': 'none' });
    text.textContent = String(pin.no);
    g.append(text);
    pinLayer.append(g);
  }

  // 가까이 보면 부스를 점으로 찍는다 (보이는 칸 안의 것만). 누르면 그 부스의 회사가 나온다. 자리는 짐작이다.
  const boothLayer = svg('g', {});
  shapes.after(boothLayer);
  const boothEx = new Map();
  for (const row of data?.ex || []) for (const b of row[7]) { const at = b.lastIndexOf('@'); const key = `${b.slice(at + 1)}|${b.slice(0, at)}`; if (!boothEx.has(key)) boothEx.set(key, []); boothEx.get(key).push(row); }
  const boothList = [...spots].map(([key, s]) => ({ key, x: s.x, z: s.z }));
  const BOOTH_ZOOM = 560;
  let boothFrame = 0;
  let chosenBooth = null;
  function pickBooth(key) {
    chosenBooth = key;
    const bar = key.indexOf('|');
    const place = L.list.find((p) => p.k === key.slice(0, bar));
    const rows = boothEx.get(key) || [];
    for (const node of boothLayer.children) node.setAttribute('fill', node.dataset.key === key ? '#56679a' : '#9aa9cc');
    detail.replaceChildren(
      el('h2', { text: `부스 ${key.slice(bar + 1)}` }),
      el('p', { class: 'note', text: `${place ? place.ko : '장소 모름'} · 자리는 짐작이다` }),
      el('ol', { class: 'hits' }, rows.map((r) => companyRow(r, data, placeKo))));
  }
  function drawBooths() {
    boothFrame = 0;
    const [x0, z0, x1, z1] = view;
    const w = x1 - x0;
    if (w > BOOTH_ZOOM) { boothLayer.replaceChildren(); return; }
    // 화면에서 반지름 5px쯤 되게 (손가락으로 누를 수 있게).
    const r = ((w / 360) * 5).toFixed(2);
    const nodes = [];
    for (const b of boothList) {
      if (b.x < x0 || b.x > x1 || b.z < z0 || b.z > z1) continue;
      const dot = svg('circle', { cx: b.x.toFixed(1), cy: b.z.toFixed(1), r, fill: b.key === chosenBooth ? '#56679a' : '#9aa9cc', stroke: '#f4f1ea', 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke' });
      dot.dataset.key = b.key;
      nodes.push(dot);
      if (nodes.length >= 900) break;
    }
    boothLayer.replaceChildren(...nodes);
  }
  boothLayer.addEventListener('click', (ev) => { const key = ev.target?.dataset?.key; if (key) pickBooth(key); });
  board.addEventListener('viewchange', () => { if (!boothFrame) boothFrame = requestAnimationFrame(drawBooths); });

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
      three ??= (await import('../map3d.js')).create(L, places, pins, { onPlace: (p) => pick(p, true), onCampus: (c) => pickCampus(c, true) });
      frame.replaceChildren(three.node);
      three.look(focus);
    } catch {
      frame.replaceChildren(el('p', { class: 'note map-wait', text: '3D를 불러오지 못했다. 2D로 본다.' }));
    }
  }
  flat.addEventListener('click', () => mode(false));
  solid.addEventListener('click', () => mode(true));
  const go = (box) => { focus = box; if (solid.getAttribute('aria-pressed') === 'true') three?.look(box); else fit(box || all); };

  // 내 위치: GPS로는 어느 캠퍼스인지까지, 홀 안은 가까운 부스 번호로 맞춘다. 위치는 폰 밖으로 나가지 않는다.
  const whereText = el('p', { class: 'big' });
  const whereNote = el('p', { class: 'note', role: 'status' });
  const nextBox = el('div', { class: 'block' });
  const placeBy = new Map(L.list.map((p) => [p.k, p]));
  function myPoint(where) {
    if (where?.by === 'booth') return [where.x, where.z];
    if (where?.by === 'gps' && where.area) {
      const centers = where.area.places.map((k) => placeBy.get(k)?.center).filter(Boolean);
      if (centers.length) return [centers.reduce((a, c) => a + c[0], 0) / centers.length, centers.reduce((a, c) => a + c[1], 0) / centers.length];
    }
    if (where?.by === 'gps' && where.inside) { const c = L.campuses.find((x) => x.k === where.campus); return c ? [(c.box[0] + c.box[2]) / 2, (c.box[1] + c.box[3]) / 2] : null; }
    return null;
  }
  function drawMe() {
    const where = getWhere();
    const next = nextStop(getInterests());
    const nextPin = next ? pins.find((p) => p.id === next.id) : null;
    const at = myPoint(where);
    const unit = (view[2] - view[0]) / 360;
    me.replaceChildren();
    if (at && nextPin) me.append(svg('line', { x1: at[0], y1: at[1], x2: nextPin.x, y2: nextPin.z, stroke: '#1f2a44', 'stroke-width': 2, 'stroke-dasharray': '6 5', 'vector-effect': 'non-scaling-stroke', 'pointer-events': 'none' }));
    if (at) {
      // 부스로 맞췄으면 작은 점, GPS(캠퍼스까지)면 넓은 고리로 보인다.
      const wide = where.by === 'gps';
      me.append(
        svg('circle', { cx: at[0], cy: at[1], r: (unit * (wide ? (where.area ? 34 : 60) : 16)).toFixed(1), fill: 'rgba(86,103,154,0.18)', stroke: '#56679a', 'stroke-width': 1.5, 'vector-effect': 'non-scaling-stroke', 'pointer-events': 'none' }),
        svg('circle', { cx: at[0], cy: at[1], r: (unit * 6).toFixed(1), fill: '#56679a', stroke: '#f4f1ea', 'stroke-width': 2, 'vector-effect': 'non-scaling-stroke', 'pointer-events': 'none' }));
    }
    if (!where) whereText.textContent = '아직 내 위치를 모른다.';
    else if (where.by === 'booth') whereText.textContent = `${placeBy.get(where.place)?.ko || '장소 모름'} · 부스 ${where.code} 근처`;
    else if (where.area) whereText.textContent = `${where.area.ko} 근처 (GPS, 짐작)`;
    else if (where.inside) whereText.textContent = `${L.campuses.find((c) => c.k === where.campus)?.ko} 안 (GPS)`;
    else whereText.textContent = `가장 가까운 곳은 ${L.campuses.find((c) => c.k === where.campus)?.ko}, 약 ${where.meters >= 1000 ? `${(where.meters / 1000).toFixed(where.meters >= 10000 ? 0 : 1)}km` : `${where.meters}m`} 떨어져 있다 (GPS)`;
    if (!next) {
      nextBox.replaceChildren(el('p', { class: 'note', text: pins.length ? '동선의 회사를 다 봤다.' : '관심 회사를 넣으면 다음 갈 곳이 나온다.' }));
      return;
    }
    const row = data?.ex.find((r) => r[0] === next.id);
    const booth = row?.[7]?.[0];
    const place = booth ? placeBy.get(booth.slice(booth.lastIndexOf('@') + 1)) : null;
    const route = mapsLink(places, place, 'directions');
    nextBox.replaceChildren(
      el('h3', { text: `다음 갈 곳: ${row ? row[1] : '자료에서 빠진 회사'}` }),
      el('p', { class: 'note', text: booth ? `${place ? place.ko : '장소 모름'} · 부스 ${booth.slice(0, booth.lastIndexOf('@'))} (자리는 짐작)` : '부스 미정' }),
      el('div', { class: 'actions' },
        route ? out(route, '구글맵 길찾기', 'btn') : null,
        nextPin ? el('button', { class: 'btn ghost', type: 'button', text: '지도에서 보기', onclick: () => { if (solid.getAttribute('aria-pressed') === 'true') mode(false); focus = null; fit([nextPin.x - 140, nextPin.z - 140, nextPin.x + 140, nextPin.z + 140]); } }) : null,
        el('a', { class: 'btn ghost', href: '#/plan', text: '동선에서 표시' })));
  }
  board.addEventListener('viewchange', drawMe);

  // GPS로 받은 자리 하나를 쓴다: 캠퍼스 → (짐작으로) 홀 · 건물. 지도는 그 자리를 가운데로 옮긴다.
  let lastCampus = null;
  function useFix(lat, lng, following) {
    const near = nearestCampus(places, lat, lng);
    const area = near.inside ? nearestArea(places, lat, lng) : null;
    const where = { by: 'gps', campus: area ? area.c : near.k, inside: near.inside, meters: Math.round(near.meters), area: area ? { ko: area.ko, places: area.places, meters: Math.round(area.meters) } : null, at: Date.now() };
    setWhere(where);
    whereNote.textContent = !near.inside ? '캠퍼스 밖이다. 현장에 가면 다시 누른다.'
      : area ? 'GPS로 본 홀 · 건물은 짐작이다 (자리가 어림값이고 실내에서는 GPS가 흔들린다). 홀 안에서는 가까운 부스 번호를 적는다.'
      : 'GPS는 캠퍼스까지만 맞췄다. 홀 안에서는 가까운 부스 번호를 적는다.';
    const at = myPoint(where);
    if (!at) { drawMe(); return; }
    if (in3d()) { three?.look([at[0] - 260, at[1] - 260, at[0] + 260, at[1] + 260]); drawMe(); return; }
    if (following && lastCampus === where.campus) {
      // 따라가기: 보는 크기는 그대로 두고 내 자리를 가운데로.
      const w = view[2] - view[0], h = view[3] - view[1];
      view = [at[0] - w / 2, at[1] - h / 2, at[0] + w / 2, at[1] + h / 2];
      apply();
    } else {
      focus = null;
      fit(area ? [at[0] - 260, at[1] - 260, at[0] + 260, at[1] + 260] : pad(L.campuses.find((c) => c.k === where.campus).box, 40));
    }
    lastCampus = where.campus;
  }
  const noGps = () => { whereNote.textContent = '이 브라우저는 위치를 알려 주지 않는다. 부스 번호로 맞춘다.'; };
  const gpsButton = el('button', { class: 'btn', type: 'button', text: 'GPS로 찾기', onclick: () => {
    if (!('geolocation' in navigator)) return noGps();
    whereNote.textContent = '위치를 받는 중이다.';
    navigator.geolocation.getCurrentPosition((pos) => useFix(pos.coords.latitude, pos.coords.longitude, false),
      () => { whereNote.textContent = '위치를 받지 못했다. 위치 허락을 켜거나 부스 번호로 맞춘다.'; }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 });
  } });
  // 따라가기: 걸으면 지도가 나를 따라온다. 배터리를 아끼려고 20초에 한 번만 고치고, 화면이 꺼지거나 지도를 떠나면 멈춘다.
  const FOLLOW_EVERY = 20000;
  let watchId = null;
  let lastFix = 0;
  const followButton = el('button', { class: 'btn ghost', type: 'button', text: '따라가기 켜기', 'aria-pressed': 'false' });
  function stopFollow(note) {
    if (watchId != null) navigator.geolocation.clearWatch(watchId);
    watchId = null;
    followButton.textContent = '따라가기 켜기';
    followButton.setAttribute('aria-pressed', 'false');
    if (note) whereNote.textContent = note;
  }
  function startFollow() {
    if (!('geolocation' in navigator)) return noGps();
    lastFix = 0;
    followButton.textContent = '따라가기 끄기';
    followButton.setAttribute('aria-pressed', 'true');
    whereNote.textContent = '따라가기를 켰다. 20초에 한 번 내 자리를 고친다.';
    watchId = navigator.geolocation.watchPosition((pos) => {
      // 지도를 떠났으면 멈춘다.
      if (!frame.isConnected) { stopFollow(); return; }
      if (document.hidden || Date.now() - lastFix < FOLLOW_EVERY) return;
      lastFix = Date.now();
      useFix(pos.coords.latitude, pos.coords.longitude, true);
    }, () => stopFollow('위치를 받지 못해 따라가기를 껐다. 위치 허락을 켜거나 부스 번호로 맞춘다.'), { enableHighAccuracy: false, maximumAge: FOLLOW_EVERY, timeout: 60000 });
  }
  followButton.addEventListener('click', () => (watchId == null ? startFollow() : stopFollow('따라가기를 껐다.')));
  // 화면을 다시 켜면 바로 한 번 고친다.
  document.addEventListener('visibilitychange', () => { if (!document.hidden) lastFix = 0; });
  const boothInput = el('input', { type: 'text', inputmode: 'text', autocapitalize: 'off', autocomplete: 'off', spellcheck: 'false', placeholder: '가까운 부스 번호 (예: 14731)', 'aria-label': '가까운 부스 번호' });
  const boothForm = el('form', { class: 'inline' }, el('label', { class: 'field' }, boothInput), el('button', { class: 'btn ghost', type: 'submit', text: '맞추기' }));
  boothForm.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const text = boothInput.value.trim();
    if (!text) return;
    const exact = findBooth(spots, text);
    const hit = exact[0] || nearBooth(spots, text);
    if (!hit) { whereNote.textContent = '그 부스를 찾지 못했다. 번호를 다시 본다.'; return; }
    setWhere({ by: 'booth', campus: placeBy.get(hit.place)?.c, place: hit.place, code: hit.code, x: hit.x, z: hit.z, at: Date.now() });
    whereNote.textContent = exact.length > 1 ? `같은 이름의 부스가 ${exact.length}곳 있어 첫 곳으로 맞췄다.` : exact.length ? '부스 번호로 맞췄다. 자리는 짐작이다.' : `그 번호는 자료에 없어 가장 가까운 ${hit.code}로 맞췄다.`;
    if (solid.getAttribute('aria-pressed') === 'true') mode(false);
    focus = null;
    fit([hit.x - 160, hit.z - 160, hit.x + 160, hit.z + 160]);
  });
  const mePanel = el('section', { class: 'panel' },
    el('h2', { text: '내 위치와 다음 갈 곳' }),
    whereText,
    el('div', { class: 'actions' }, gpsButton, followButton),
    boothForm,
    whereNote,
    nextBox,
    el('p', { class: 'note', text: '위치는 이 폰 안에서만 쓴다. GPS로는 어느 캠퍼스인지와, 짐작으로 어느 홀 · 건물 근처인지까지 본다(자리가 어림값이다). 홀 안은 부스 번호로 맞춘다.' }));

  const page = el('div', { class: 'page' },
    el('section', { class: 'panel' },
      el('h1', { text: '지도' }),
      frame,
      el('div', { class: 'segs' },
        el('button', { class: 'seg', type: 'button', text: '크게 보기', onclick: () => go(null) }),
        L.campuses.map((c) => el('button', { class: 'seg', type: 'button', text: c.ko.replace(' 캠퍼스', ''), onclick: () => go(pad(c.box, 40)) }))),
      el('div', { class: 'segs' }, flat, solid,
        el('button', { class: 'seg', type: 'button', text: '크게', 'aria-label': '지도 크게', onclick: () => (solid.getAttribute('aria-pressed') === 'true' ? three?.zoom(0.8) : zoom(0.7)) }),
        el('button', { class: 'seg', type: 'button', text: '작게', 'aria-label': '지도 작게', onclick: () => (solid.getAttribute('aria-pressed') === 'true' ? three?.zoom(1.25) : zoom(1.4)) })),
      el('p', { class: 'note', text: `홀 안 부스 자리는 짐작이다 (공식 캠퍼스 지도 ${places.edition}판, 정식 배치도 전). 캠퍼스 사이 거리는 줄여서 그렸다.` }),
      pins.length
        ? el('p', { class: 'note', text: `번호는 내 동선의 차례다. 색은 날짜다: ${info.show.days.map((d, i) => `${d.ko.split(' ')[0]} ${['분홍', '파랑', '초록', '노랑'][i]}`).join(' · ')} · 미정 회색.` })
        : el('p', { class: 'note' }, '관심 회사를 넣으면 지도에 번호로 찍힌다. ', el('a', { href: '#/find', text: '회사 고르러 가기' }))),
    detail,
    mePanel);
  // 화면에 붙은 뒤에야 크기를 알 수 있다.
  requestAnimationFrame(() => {
    fit(all);
    // 회사 화면의 "지도"에서 왔으면 그 회사의 첫 부스로 간다.
    const row = rest[0] === 'at' ? data?.ex.find((r) => r[0] === rest[1]) : null;
    const booth = row?.[7]?.[0];
    const spot = spotOf(spots, booth);
    if (spot) {
      fit([spot.x - 110, spot.z - 110, spot.x + 110, spot.z + 110]);
      const at = booth.lastIndexOf('@');
      drawBooths();
      pickBooth(`${booth.slice(at + 1)}|${booth.slice(0, at)}`);
    }
  });
  page.mapApi = { board, layer: me, get view() { return view; }, fit, L, places, spots, pad };
  return page;
}
