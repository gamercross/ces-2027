// 지도: 2D가 기본이다. 3D는 "3D"를 누를 때 불러온다. "크게 보기"는 캠퍼스 셋을 한 화면에 보인다.
// 관심 회사는 동선 번호로 찍힌다. 홀 안 부스 자리는 짐작이다.

import { el, out } from '../dom.js';
import { getCategories, getExhibitors, getIndoorPaths, getInfo, getOfficialSpots, getPlaces } from '../data.js';
import { boothColorer, legend, MODES } from '../colors.js';
import { load, save } from '../store.js';
import { getInterests } from '../store.js';
import { layout } from '../geo.js';
import { boothSpots, spotOf } from '../spots.js';
import { mapsLink } from '../maps.js';
import { findBooth, fixProblem, nearBooth, nearestArea, nearestCampus } from '../locate.js';
import { nextStop } from '../route.js';
import { getWhere, setWhere } from '../store.js';
import { companyRow } from '../company.js';
import { guideTo } from '../guide.js';
import { markLabel, toggleMark } from '../alerts.js';
import { getMarks, setMarks } from '../notify.js';
import { getEvents } from '../store.js';
import { routeThroughAisle } from '../indoor-path.js';
import { T, DAY_COLORS, withAlpha } from '../tokens.js';
import { findBox } from '../mapfind.js';

const NS = 'http://www.w3.org/2000/svg';
const FILL = { hall: T.hall, room: T.room, out: T.out, hotel: T.hotel };
const DAY_FILL = DAY_COLORS;

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
  const [data, info, official, table, indoorPaths] = await Promise.all([getExhibitors().catch(() => null), getInfo(), getOfficialSpots(), getCategories(), getIndoorPaths()]);
  const L = layout(places);
  const spots = data ? boothSpots(places, data, official) : new Map();
  const pins = data ? interestPins(data, spots) : [];
  const placeKo = new Map(places.places.map((p) => [p.k, p.ko]));
  const pad = (b, m) => [b[0] - m, b[1] - m, b[2] + m, b[3] + m];
  const all = pad(L.boxAll, 120);
  let view = [...all];

  const roads = svg('g', { fill: 'none', stroke: T.road, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' },
    ...places.roads.map((r) => svg('polyline', { points: pts(r.pts.map(([x, z]) => L.W(r.c, x, z))), 'stroke-width': r.w * (places.campuses.find((c) => c.k === r.c).toWorld.scale) })));
  const decor = svg('g', { fill: T.decor }, ...places.decor.map((d) => svg('polygon', { points: pts(d.poly.map(([x, z]) => L.W(d.c, x, z))) })));
  const links = svg('g', { fill: 'none', stroke: T.link, 'stroke-dasharray': '18 14', 'stroke-width': 5, opacity: 0.8 },
    ...places.links.map((k) => { const a = L.W(k.from.c, ...k.from.at), b = L.W(k.to.c, ...k.to.at); return svg('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1] }); }));
  const shapes = svg('g', { stroke: T.accent, 'stroke-width': 1.5, 'vector-effect': 'non-scaling-stroke' });
  const labels = svg('g', { 'text-anchor': 'middle', fill: T.ink, 'font-weight': 700 });
  const campusLabels = svg('g', { 'text-anchor': 'middle', fill: T.ink2, 'font-weight': 700 });
  const marks = svg('g', {});
  const pinLayer = svg('g', {});
  const me = svg('g', { id: 'me-layer' });
  const board = svg('svg', { class: 'map', role: 'img', 'aria-label': 'CES 2027 캠퍼스 지도. 홀 안 부스 자리는 짐작이다.' }, roads, decor, links, shapes, campusLabels, labels, marks, pinLayer, me);

  const detail = el('div', { class: 'panel', 'aria-live': 'polite' }, el('p', { class: 'note', text: '장소나 부스 점을 누르면 회사가 나온다. 가까이 봐야 점이 찍힌다.' }));
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
      el('p', { class: 'note', text: `${p.shapeGuess ? '모양과 자리는 어림이다. ' : ''}${p.boothSpots === 'guess' ? '부스 자리는 짐작이다.' : '부스 자리는 공식 배치도다.'}` }),
      el('div', { class: 'actions' },
        in3d() ? el('button', { class: 'btn', type: 'button', text: '2D로 보기', onclick: () => to2d(box) }) : null,
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
      el('p', { class: 'note', text: `장소 ${mine.length}곳 · 회사 ${rowsAt(mine.map((p) => p.k)).length}곳` }),
      el('div', { class: 'actions' }, el('button', { class: 'btn', type: 'button', text: '2D 지도에서 보기', onclick: () => to2d(pad(c.box, 40)) })),
      el('div', { class: 'fields' }, mine.filter((p) => count.get(p.k) > 0).map((p) => el('button', { class: 'field-link', type: 'button', onclick: () => pick(p, true) },
        el('span', { text: p.ko.replace('LVCC ', '').replace('베네시안 엑스포 ', '') }), el('small', { text: String(count.get(p.k)) })))));
    if (scroll) detail.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  for (const p of L.list) {
    const shape = svg('polygon', { points: pts(p.world), fill: FILL[p.kind] || T.place, tabindex: 0, role: 'button', 'aria-label': p.ko });
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
    const g = svg('g', {}, svg('circle', { cx: at[0], cy: at[1], fill: m.kind === 'badge' ? T.badge : m.kind === 'shuttle' ? T.shuttle : T.transit }), svg('title', {}));
    g.lastChild.textContent = m.ko;
    const text = svg('text', { x: at[0], y: at[1], fill: T.ink, 'pointer-events': 'none' });
    text.textContent = m.ko;
    g.append(text);
    marks.append(g);
  }
  for (const c of L.city) {
    const g = svg('g', { tabindex: 0, role: 'button', 'aria-label': `${c.ko} (전시장 밖, 자리는 어림)` }, svg('circle', { cx: c.center[0], cy: c.center[1], fill: T.city, stroke: T.ink, 'stroke-width': 1.5, 'vector-effect': 'non-scaling-stroke' }), svg('title', {}));
    g.dataset.city = c.k;
    g.querySelector('title').textContent = c.ko;
    const text = svg('text', { x: c.center[0], y: c.center[1], fill: T.ink, 'font-weight': 700, 'pointer-events': 'none' });
    text.textContent = c.ko;
    g.append(text);
    g.style.cursor = 'pointer';
    g.addEventListener('click', () => pickCity(c));
    g.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); pickCity(c); } });
    marks.append(g);
  }
  for (const pin of pins) {
    const g = svg('g', {}, svg('circle', { cx: pin.x, cy: pin.z, fill: DAY_FILL[pin.day], stroke: T.ink, 'stroke-width': 1.5, 'vector-effect': 'non-scaling-stroke', opacity: pin.seen ? 0.45 : 1 }), svg('title', {}));
    g.querySelector('title').textContent = `${pin.no}. ${pin.name}`;
    const text = svg('text', { x: pin.x, y: pin.z, 'text-anchor': 'middle', 'dominant-baseline': 'central', fill: T.ink, 'font-weight': 700, 'pointer-events': 'none' });
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
  // 부스 점을 무엇으로 칠할까: 한 색 · 분야 묶음 · 한국 · 혁신상. 고른 것은 폰에 남는다.
  let colorMode = MODES.some((m) => m.k === load('mapColor.v1', 'plain')) ? load('mapColor.v1', 'plain') : 'plain';
  const noRows = [];
  let colorOf = data ? boothColorer(colorMode, data, table, (key) => boothEx.get(key) || noRows) : () => T.plain;
  const legendBox = el('div', { class: 'legend', 'aria-label': '부스 점의 색' });
  function paintLegend() {
    legendBox.replaceChildren(...legend(colorMode, table).map((l) => el('span', { class: 'swatch' }, el('i', { style: `background:${l.color}` }), l.ko)));
    legendBox.hidden = colorMode === 'plain';
  }
  let boothFrame = 0;
  let chosenBooth = null;
  let routeTarget = null;
  // 부스를 누르면(2D의 점, 3D의 점): 그 부스의 회사 카드와 관심 단추.
  function pickBooth(key, scroll) {
    chosenBooth = key;
    routeTarget = null;
    const bar = key.indexOf('|');
    const place = L.list.find((p) => p.k === key.slice(0, bar));
    const rows = boothEx.get(key) || [];
    const spot = spots.get(key);
    drawBooths();
    three?.chooseBooth(key);
    detail.replaceChildren(...[
      el('h2', { text: `부스 ${key.slice(bar + 1)}` }),
      el('p', { class: 'note', text: `${place ? place.ko : '장소 모름'} · ${spot?.official ? '자리는 공식 배치도다' : '자리는 짐작이다'}` }),
      in3d() && spot ? el('div', { class: 'actions' }, el('button', { class: 'btn ghost', type: 'button', text: '2D 지도에서 보기', onclick: () => to2d([spot.x - 110, spot.z - 110, spot.x + 110, spot.z + 110]) })) : null,
      el('ol', { class: 'hits' }, rows.map((r) => companyRow(r, data, placeKo))),
      markBlock(key),
      guideBlock(key, place, spot),
    ].filter(Boolean));
    drawMe();
    if (scroll) detail.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  // 명함 넣는 이벤트가 있는 부스인지 사람이 표시한다. 공식 자료에는 없다.
  function markBlock(key) {
    const mark = getMarks()[key];
    return el('div', { class: 'block guide' },
      el('h3', { text: '명함 넣는 이벤트' }),
      el('div', { class: 'actions' },
        el('button', { class: 'pick', type: 'button', text: mark ? `이벤트 있음 (${markLabel(mark)})` : '이벤트 있음으로 표시', 'aria-pressed': mark ? 'true' : 'false', onclick: () => {
          setMarks(toggleMark(getMarks(), key));
          drawBooths();
          three?.redraw();
          pickBooth(key);
        } })),
      el('p', { class: 'note', text: '공식 자료에는 없다. 본 사람이 표시하고 파일로 주고받는다.' }));
  }
  // 여기서 가는 길: 내 자리에서 고른 부스까지. 같은 곳이면 부스 번호 쪽으로, 다른 캠퍼스면 구글맵 길찾기.
  function guideBlock(key, place, spot) {
    const bar = key.indexOf('|');
    const where = getWhere();
    const g = guideTo(where, { place: key.slice(0, bar), code: key.slice(bar + 1) }, (k) => placeBy.get(k));
    const open = mapsLink(places, place);
    const route = mapsLink(places, place, 'directions');
    const at = myPoint(where);
    return el('div', { class: 'block guide' },
      el('h3', { text: '여기서 가는 길' }),
      ...g.lines.map((line) => el('p', { class: 'note', text: line })),
      indoorPaths.halls[place?.k] ? el('p', { class: 'note', text: '홀 안 길은 짐작이다. 실제 통로와 다를 수 있다.' }) : null,
      el('div', { class: 'actions' },
        g.kind !== 'other-campus' && spot && place && indoorPaths.halls[place.k] ? el('button', { class: 'btn', type: 'button', text: at ? '내 자리에서 길 보기' : '홀 입구에서 길 보기', onclick: () => {
          const hall = indoorPaths.halls[place.k];
          const entry = L.W(place.c, ...hall.entrance);
          const where = getWhere();
          const from = (where?.by === 'booth' && where.place === place.k)
            || (where?.by === 'gps' && where.area?.places.includes(place.k)) ? at : null;
          const aisle = hall.aisle.map(([x, z]) => L.W(place.c, x, z));
          const path = routeThroughAisle(from, [spot.x, spot.z], aisle, entry);
          routeTarget = key;
          const xs = path.map(([x]) => x), zs = path.map(([, z]) => z);
          const box = pad([Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)], 60);
          if (in3d()) to2d(box); else { focus = null; fit(box); }
          drawMe();
          frame.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        } }) : null,
        g.kind === 'unknown' ? el('button', { class: 'btn', type: 'button', text: '내 자리 넣기', onclick: () => { boothInput.scrollIntoView({ block: 'center', behavior: 'smooth' }); boothInput.focus({ preventScroll: true }); } }) : null,
        g.maps && route ? out(route, '구글맵 길찾기', g.kind === 'other-campus' ? 'btn' : 'btn ghost') : null,
        open ? out(open, '구글맵에서 열기', 'btn ghost') : null));
  }
  // 전시장 밖의 공개 장소를 누르면: 이름 · 내 일정 · 구글맵.
  function pickCity(c) {
    three?.choose(null);
    const mine = getEvents().filter((e) => e.place === c.ko || e.place === c.en);
    const query = encodeURIComponent(`${c.maps.query}, ${c.maps.address}`);
    detail.replaceChildren(...[
      el('h2', { text: c.ko }),
      el('p', { class: 'note', text: `${c.en}. 전시장 밖이라 자리는 어림이다.${c.maps.addressChecked ? '' : ' 주소는 확인 전이다.'}` }),
      mine.length ? el('ul', { class: 'stack' }, mine.map((e) => el('li', {}, el('b', { text: e.name }), el('span', { text: `${e.date.slice(5).replace('-', '/')} ${e.from} ~ ${e.to}` })))) : el('p', { class: 'note', text: '여기서 하는 내 일정은 없다.' }),
      el('div', { class: 'actions' },
        out(places.mapsUrls.search.replace('{query}', query), '구글맵에서 열기', 'btn'),
        out(places.mapsUrls.directions.replace('{query}', query), '구글맵 길찾기', 'btn ghost')),
    ]);
    detail.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  function drawBooths() {
    boothFrame = 0;
    const [x0, z0, x1, z1] = view;
    const w = x1 - x0;
    if (w > BOOTH_ZOOM) { boothLayer.replaceChildren(); return; }
    // 화면에서 반지름 5px쯤 되게 (손가락으로 누를 수 있게).
    const r = ((w / 360) * 5).toFixed(2);
    const marks = getMarks();
    const nodes = [];
    for (const b of boothList) {
      if (b.x < x0 || b.x > x1 || b.z < z0 || b.z > z1) continue;
      // 고른 부스는 짙은 테두리로 보인다 (색은 칠하기에 쓰고 있어서).
      const on1 = b.key === chosenBooth;
      // 명함 이벤트로 표시한 부스는 붉은 테두리로 두른다.
      const marked = !!marks[b.key];
      const dot = svg('circle', { cx: b.x.toFixed(1), cy: b.z.toFixed(1), r: marked ? (Number(r) * 1.35).toFixed(2) : r, fill: colorOf(b.key), stroke: on1 ? T.ink : marked ? T.warn : T.panel, 'stroke-width': on1 || marked ? 3 : 1, 'vector-effect': 'non-scaling-stroke' });
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
      const city = !!g.dataset.city;
      g.querySelector('circle').setAttribute('r', (unit * (city ? 7 : 4)).toFixed(1));
      const t = g.querySelector('text');
      t.setAttribute('font-size', (unit * (city ? 10 : 9)).toFixed(1));
      t.setAttribute('dx', (unit * (city ? 10 : 6)).toFixed(1));
      t.setAttribute('dy', (unit * 3).toFixed(1));
      // 공개 장소는 멀리서도 이름이 보인다.
      t.style.display = city || w < 900 ? '' : 'none';
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
      three ??= (await import('../map3d.js')).create(L, places, pins, { onPlace: (p) => pick(p, true), onCampus: (c) => pickCampus(c, true), onBooth: (key) => pickBooth(key, true), booths: boothList, colorOf: (key) => colorOf(key), isMarked: (key) => !!getMarks()[key] });
      page.three = three;
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
    const chosenSpot = chosenBooth ? spots.get(chosenBooth) : null;
    if (routeTarget && chosenSpot) {
      const bar = routeTarget.indexOf('|');
      const place = placeBy.get(routeTarget.slice(0, bar));
      const hall = indoorPaths.halls[place?.k];
      if (hall && place) {
        const from = (where?.by === 'booth' && where.place === place.k)
          || (where?.by === 'gps' && where.area?.places.includes(place.k)) ? at : null;
        const aisle = hall.aisle.map(([x, z]) => L.W(place.c, x, z));
        const entry = L.W(place.c, ...hall.entrance);
        const path = routeThroughAisle(from, [chosenSpot.x, chosenSpot.z], aisle, entry);
        const title = svg('title');
        title.textContent = `홀 안 짐작 길 · ${indoorPaths.read} 확인`;
        me.append(
          svg('polyline', { points: pts(path), fill: 'none', stroke: T.warn, 'stroke-width': 4, 'stroke-dasharray': '7 5', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'vector-effect': 'non-scaling-stroke', 'pointer-events': 'none', 'aria-label': '홀 안 짐작 길' }, title),
          svg('circle', { cx: entry[0], cy: entry[1], r: 7, fill: T.panel, stroke: T.warn, 'stroke-width': 2, 'vector-effect': 'non-scaling-stroke', 'pointer-events': 'none' }));
      }
    } else if (at && chosenSpot) {
      me.append(svg('line', { x1: at[0], y1: at[1], x2: chosenSpot.x, y2: chosenSpot.z, stroke: T.warn, 'stroke-width': 3, 'stroke-linecap': 'round', 'vector-effect': 'non-scaling-stroke', 'pointer-events': 'none' }));
    }
    if (at && nextPin) me.append(svg('line', { x1: at[0], y1: at[1], x2: nextPin.x, y2: nextPin.z, stroke: T.ink, 'stroke-width': 2, 'stroke-dasharray': '6 5', 'vector-effect': 'non-scaling-stroke', 'pointer-events': 'none' }));
    if (at) {
      // 부스로 맞췄으면 작은 점, GPS(캠퍼스까지)면 넓은 고리로 보인다.
      const wide = where.by === 'gps';
      me.append(
        svg('circle', { cx: at[0], cy: at[1], r: (unit * (wide ? (where.area ? 34 : 60) : 16)).toFixed(1), fill: withAlpha(T.accent, 0.18), stroke: T.accent, 'stroke-width': 1.5, 'vector-effect': 'non-scaling-stroke', 'pointer-events': 'none' }),
        svg('circle', { cx: at[0], cy: at[1], r: (unit * 6).toFixed(1), fill: T.accent, stroke: T.panel, 'stroke-width': 2, 'vector-effect': 'non-scaling-stroke', 'pointer-events': 'none' }));
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
  let acceptedFix = null;
  function useFix(lat, lng, accuracy, following) {
    const now = Date.now();
    const issue = fixProblem(acceptedFix, { lat, lng, accuracy, at: now }, 150, 3);
    if (issue === 'accuracy') {
      whereNote.textContent = `위치가 흔들린다 (정확도 약 ${Number.isFinite(accuracy) ? `${Math.round(accuracy)}m` : '모름'}). 자리를 바꾸지 않았다. 부스 번호로 맞춘다.`;
      return false;
    }
    if (following && issue === 'jump') {
      whereNote.textContent = '위치가 갑자기 바뀌어 보인다. 자리를 바꾸지 않았다. 다음 위치를 기다린다.';
      return false;
    }
    const near = nearestCampus(places, lat, lng);
    const area = near.inside && accuracy <= 100 ? nearestArea(places, lat, lng) : null;
    const where = { by: 'gps', campus: area ? area.c : near.k, inside: near.inside, meters: Math.round(near.meters), area: area ? { ko: area.ko, places: area.places, meters: Math.round(area.meters) } : null, at: Date.now() };
    setWhere(where);
    acceptedFix = { lat, lng, accuracy, at: now };
    whereNote.textContent = !near.inside ? '캠퍼스 밖이다. 현장에 가면 다시 누른다.'
      : area ? 'GPS로 본 홀 · 건물은 짐작이다 (자리가 어림값이고 실내에서는 GPS가 흔들린다). 홀 안에서는 가까운 부스 번호를 적는다.'
      : accuracy > 100 ? 'GPS 정확도가 낮아 캠퍼스까지만 맞췄다. 홀 안에서는 가까운 부스 번호를 적는다.'
        : 'GPS는 캠퍼스까지만 맞췄다. 홀 안에서는 가까운 부스 번호를 적는다.';
    const at = myPoint(where);
    if (!at) { drawMe(); return true; }
    if (in3d()) { three?.look([at[0] - 260, at[1] - 260, at[0] + 260, at[1] + 260]); drawMe(); return true; }
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
    return true;
  }
  const noGps = () => { whereNote.textContent = '이 브라우저는 위치를 알려 주지 않는다. 부스 번호로 맞춘다.'; };
  const gpsError = (error) => {
    whereNote.textContent = error?.code === 1
      ? '위치 권한을 거부했다. 브라우저 설정에서 허락하거나 부스 번호로 맞춘다.'
      : '위치를 받지 못했다. 다시 누르거나 부스 번호로 맞춘다.';
  };
  const gpsButton = el('button', { class: 'btn', type: 'button', text: 'GPS로 찾기', onclick: () => {
    if (!('geolocation' in navigator)) return noGps();
    whereNote.textContent = '위치를 받는 중이다.';
    navigator.geolocation.getCurrentPosition((pos) => useFix(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy, false),
      gpsError, { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 });
  } });
  // 따라가기: 걸으면 지도가 나를 따라온다. 배터리를 아끼려고 20초에 한 번만 고치고, 화면이 꺼지거나 지도를 떠나면 멈춘다.
  const FOLLOW_EVERY = 20000;
  let watchId = null;
  let lastFix = 0;
  let following = false;
  const followButton = el('button', { class: 'btn ghost', type: 'button', text: '따라가기 켜기', 'aria-pressed': 'false' });
  function stopFollow(note) {
    if (watchId != null) navigator.geolocation.clearWatch(watchId);
    watchId = null;
    following = false;
    followButton.textContent = '따라가기 켜기';
    followButton.setAttribute('aria-pressed', 'false');
    if (note) whereNote.textContent = note;
  }
  function watchFollow() {
    if (!following || document.hidden || !('geolocation' in navigator)) return;
    watchId = navigator.geolocation.watchPosition((pos) => {
      // 지도를 떠났으면 멈춘다.
      if (!frame.isConnected) { stopFollow(); return; }
      if (document.hidden || Date.now() - lastFix < FOLLOW_EVERY) return;
      if (useFix(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy, true)) lastFix = Date.now();
    }, (error) => stopFollow(error?.code === 1
      ? '위치 권한을 거부했다. 따라가기를 껐다. 브라우저 설정에서 허락하거나 부스 번호로 맞춘다.'
      : '위치를 받지 못해 따라가기를 껐다. 다시 켜거나 부스 번호로 맞춘다.'), { enableHighAccuracy: true, maximumAge: FOLLOW_EVERY, timeout: 60000 });
  }
  function startFollow() {
    if (!('geolocation' in navigator)) return noGps();
    following = true;
    lastFix = 0;
    followButton.textContent = '따라가기 끄기';
    followButton.setAttribute('aria-pressed', 'true');
    whereNote.textContent = '따라가기를 켰다. 위치 정확도를 살펴 20초에 한 번 내 자리를 고친다.';
    watchFollow();
  }
  followButton.addEventListener('click', () => (following ? stopFollow('따라가기를 껐다.') : startFollow()));
  // 화면이 뒤로 가면 위치 감시를 멈추고, 돌아오면 새 감시를 건다.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (watchId != null) navigator.geolocation.clearWatch(watchId);
      watchId = null;
    } else if (following) {
      lastFix = 0;
      watchFollow();
    }
  });
  window.addEventListener('hashchange', () => {
    if (!location.hash.startsWith('#/map')) stopFollow();
  });
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
    el('h2', { text: '내 위치' }),
    whereText,
    el('div', { class: 'actions' }, gpsButton, followButton),
    boothForm,
    whereNote,
    nextBox,
    el('p', { class: 'note', text: '위치는 이 폰 안에서만 쓴다. 홀 안은 부스 번호로 맞춘다.' }));

  const colorButtons = MODES.map((m) => el('button', { class: 'seg', type: 'button', text: m.k === 'plain' ? '색: 한 색' : m.ko, 'aria-pressed': m.k === colorMode ? 'true' : 'false', onclick: (ev) => {
    colorMode = m.k;
    save('mapColor.v1', colorMode);
    colorOf = data ? boothColorer(colorMode, data, table, (key) => boothEx.get(key) || noRows) : colorOf;
    for (const b of colorButtons) b.setAttribute('aria-pressed', b === ev.currentTarget ? 'true' : 'false');
    paintLegend();
    drawBooths();
    three?.redraw();
    // 점은 가까이 봐야 찍힌다. 멀리 보고 있으면 알려 준다.
    if (!in3d() && view[2] - view[0] > BOOTH_ZOOM) whereNote.textContent = '부스 점은 지도를 가까이 봐야 찍힌다. 홀을 누르거나 "크게"를 누른다.';
  } }));
  paintLegend();

  const page = el('div', { class: 'page' },
    findBox(),
    el('section', { class: 'panel' },
      el('h1', { text: '지도' }),
      frame,
      el('div', { class: 'segs' },
        el('button', { class: 'seg', type: 'button', text: '크게 보기', onclick: () => go(null) }),
        L.campuses.map((c) => el('button', { class: 'seg', type: 'button', text: c.ko.replace(' 캠퍼스', ''), onclick: () => go(pad(c.box, 40)) }))),
      el('div', { class: 'segs' }, flat, solid,
        el('button', { class: 'seg', type: 'button', text: '크게', 'aria-label': '지도 크게', onclick: () => (solid.getAttribute('aria-pressed') === 'true' ? three?.zoom(0.8) : zoom(0.7)) }),
        el('button', { class: 'seg', type: 'button', text: '작게', 'aria-label': '지도 작게', onclick: () => (solid.getAttribute('aria-pressed') === 'true' ? three?.zoom(1.25) : zoom(1.4)) })),
      el('div', { class: 'segs', role: 'group', 'aria-label': '부스 점 칠하기' }, colorButtons),
      legendBox,
      el('div', { class: 'actions' }, el('a', { class: 'btn ghost', href: '#/transit', text: '셔틀 · 오가는 법' })),
      el('p', { class: 'note', text: `부스 자리는 짐작이다 (${places.edition}판, 정식 배치도 전). 붉은 테두리는 명함 넣는 부스.` }),
      pins.length
        ? el('p', { class: 'note', text: `번호는 동선 차례, 색은 날짜: ${info.show.days.map((d, i) => `${d.ko.split(' ')[0]} ${['분홍', '파랑', '초록', '노랑'][i]}`).join(' · ')}.` })
        : el('p', { class: 'note', text: '위 찾기 칸에서 회사를 찾아 관심에 넣으면 번호로 찍힌다.' })),
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
