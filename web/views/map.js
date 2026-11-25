// 지도: 2D가 기본이다. 3D는 위 단추를 누를 때 불러온다.
// 손가락으로 크게 · 작게(두 손가락 벌리기 · 두 번 톡), 한 손가락 끌기. 확대 단계 셋: 캠퍼스 셋 → 홀 → 부스.
// 확대할수록 더 보인다: 캠퍼스에는 홀 이름, 홀에는 큰 회사 · 관심 회사 이름, 부스에는 부스 번호와 회사 이름(겹치면 숨기고, 글자는 13px 아래로 줄지 않는다).
// 위에 찾기 칸과 홀 바로 가기, 회사를 누르면 아래에서 올라오는 큰 카드. 관심 회사는 갈 곳 번호로 찍히고 차례대로 선이 이어진다.
// 전시사 자료는 첫 화면에 다 받지 않는다: 홀로 가까이 갈 때 그 홀의 것만 받는다(찾기 · 관심 회사가 있으면 전체). 홀 안 부스 자리는 짐작이다.

import { el, out } from '../dom.js';
import { getCategories, getExhibitors, getHall, getIndoorPaths, getInfo, getOfficialSpots, getPlaces, getSettings } from '../data.js';
import { boothColorer, legend, MODES } from '../colors.js';
import { getInterests, getWhere, hasInterest, load, save, setInterests, setWhere, toggleInterest } from '../store.js';
import { bbox, layout } from '../geo.js';
import { boothSpots, spotOf } from '../spots.js';
import { mapsLink } from '../maps.js';
import { findBooth, fixProblem, nearBooth, nearestArea, nearestCampus } from '../locate.js';
import { nextStop, splitBooth } from '../route.js';
import { dayByKey, dayKeyOf, dayList, dayRank } from '../days.js';
import { attachImage } from '../company-image.js';
import { boothLines, sessionBlock } from '../company-extra.js';
import { farText, guideTo } from '../guide.js';
import { HALL_GROUPS, shortName } from '../hallgroups.js';
import { markLabel, toggleMark } from '../alerts.js';
import { getMarks, setMarks } from '../notify.js';
import { getEvents } from '../store.js';
import { routeThroughAisle } from '../indoor-path.js';
import { T, mapScale, withAlpha } from '../tokens.js';
import { findBox } from '../mapfind.js';
import { createSheet } from '../mapsheet.js';
import { attachGestures } from '../mapgesture.js';
import { estimate, fmtDistance } from '../nav.js';
import { BOOTH_DOTS, MIN_FONT, clip, layoutLabels, levelOf, viewFor, widthOf } from '../mapmath.js';
import { tipBox } from '../tips.js';

const NS = 'http://www.w3.org/2000/svg';
const FILL = { hall: T.hall, room: T.room, out: T.out, hotel: T.hotel };

function svg(tag, attrs, ...kids) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) if (v != null) node.setAttribute(k, v);
  node.append(...kids);
  return node;
}
const pts = (poly) => poly.map(([x, z]) => `${x.toFixed(1)},${z.toFixed(1)}`).join(' ');
const boothKey = (booth) => { const { code, place } = splitBooth(booth); return `${place}|${code}`; };

// 홀 바로 가기 칩: 눌러서 그 홀로 날아간다. 묶음은 전시사 목록의 "위치" 거르기와 같다(`hallgroups.js`).
const HALL_CHIPS = HALL_GROUPS;

// 관심 회사를 동선 차례대로, 날짜마다 번호를 붙여 돌려준다. rows는 id → 전시사 줄(받은 것만).
export function interestPins(rows, spots) {
  const counter = new Map();
  const pins = [];
  for (const it of getInterests()) {
    const row = rows.get(it.id);
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
  const L = layout(places);
  const placeBy = new Map(L.list.map((p) => [p.k, p]));
  const placeKo = new Map(places.places.map((p) => [p.k, p.ko]));
  const pad = (b, m) => [b[0] - m, b[1] - m, b[2] + m, b[3] + m];
  const all = pad(L.boxAll, 120);
  const LABEL = MIN_FONT * mapScale(); // 글자 크기 단계가 크면 지도 글자도 130%까지 키운다
  let view = [...all];

  // ---- 늦게 받는 자료: 처음에는 장소(places)만으로 그린다. 홀로 가까이 가면 그 홀의 전시사 줄을 받는다.
  let meta = null;                 // 분야 · 나라 · 링크 (홀 자료에도 같이 있다)
  const rows = new Map();          // id → 줄
  const boothEx = new Map();       // "장소|부스" → 줄들
  let spots = new Map();           // "장소|부스" → { x, z, official? }
  let boothList = [];              // 부스 점 + 글자 자료
  const loaded = new Set();        // 받은 홀
  let fullDone = false;
  let official = { places: {} };
  let info = null;
  let table = null;
  let indoorPaths = { halls: {}, read: '' };
  let fullOnce = null;
  const pending = new Map();
  let pins = [];
  let dayFocus = rest[0] === 'day' && rest[1] != null && Number.isFinite(Number(rest[1])) ? Number(rest[1]) : null; // 갈 곳 탭에서 "지도에서 보기"로 왔을 때 그 날
  let colorMode = MODES.some((m) => m.k === load('mapColor.v1', 'plain')) ? load('mapColor.v1', 'plain') : 'plain';
  const mapx = el('div', { class: 'mapx', 'data-level': 'campus' });
  const page = el('div', { class: 'page mappage' });
  // 첫 화면 위의 안내 칸 하나(web/tips.js). 설정 homeTip이 'map'이나 'both'일 때 붙이고, 아이폰 Safari 탭에서만 보인다(홈 화면 앱에서는 안 보인다). 닫을 수 있다. 홈(안)이 켜져 있으면 이 칸은 홈에 선다.
  if (!rest.length) getSettings().then((s) => { const box = ['map', 'both'].includes(s?.homeTip) && !['first', 'tab'].includes(s?.home) ? tipBox('map') : null; if (box) { page.prepend(box); window.dispatchEvent(new Event('resize')); } }).catch(() => {});
  const navbar = el('div', { class: 'navbar', hidden: true });
  let nav = null;            // 길 안내 중인 곳 { id, name, key, code, place, spot }
  let navFollow = true;      // 걸으면 지도가 따라온다 (손으로 끌면 멈춘다)
  let navOwnsFollow = false; // 따라가기를 안내가 켰나

  const addRows = (doc, only) => {
    meta ||= { cats: doc.cats, catsKo: doc.catsKo, countries: doc.countries, link: doc.link, v: doc.v };
    for (const raw of doc.ex) {
      const row = rows.get(raw[0]) || (rows.set(raw[0], raw), raw);
      for (const b of raw[7]) {
        const { code, place } = splitBooth(b);
        if (only && place !== only) continue;
        const key = `${place}|${code}`;
        const list = boothEx.get(key) || [];
        if (!list.includes(row)) list.push(row);
        boothEx.set(key, list);
      }
    }
  };
  function rebuild(only) {
    const got = boothSpots(places, { ex: [...rows.values()] }, official);
    spots = new Map(only ? [...spots, ...[...got].filter(([k]) => k.startsWith(`${only}|`))] : got);
    boothList = [...spots].map(([key, s]) => {
      const rs = boothEx.get(key) || [];
      const best = rs.reduce((a, r) => ((r[5] || 0) > (a?.[5] || 0) ? r : a), rs[0]);
      const bar = key.indexOf('|');
      return { key, x: s.x, z: s.z, code: key.slice(bar + 1), name: best?.[1] || '', award: best?.[5] || 0, n: rs.length };
    });
    colorOf = null;
    afterData();
  }
  async function ensureHall(k) {
    if (fullDone || loaded.has(k)) return;
    if (pending.has(k)) return pending.get(k);
    const job = (async () => {
      const [doc] = await Promise.all([getHall(k), getOfficialSpots().then((o) => { official = o; })]);
      if (!doc) { await ensureFull(); return; }
      if (fullDone) return;
      addRows(doc, k);
      loaded.add(k);
      rebuild(k);
    })().finally(() => pending.delete(k));
    pending.set(k, job);
    return job;
  }
  function ensureFull() {
    fullOnce ||= (async () => {
      const [doc, o] = await Promise.all([getExhibitors(), getOfficialSpots()]);
      official = o;
      addRows(doc);
      fullDone = true;
      rebuild();
    })().catch((e) => { fullOnce = null; throw e; });
    return fullOnce;
  }
  getInfo().then((i) => { info = i; }).catch(() => {});

  // ---- 그림 층
  const roads = svg('g', { fill: 'none', stroke: T.road, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' },
    ...places.roads.map((r) => svg('polyline', { points: pts(r.pts.map(([x, z]) => L.W(r.c, x, z))), 'stroke-width': r.w * (places.campuses.find((c) => c.k === r.c).toWorld.scale) })));
  const decor = svg('g', { fill: T.decor }, ...places.decor.map((d) => svg('polygon', { points: pts(d.poly.map(([x, z]) => L.W(d.c, x, z))) })));
  const links = svg('g', { fill: 'none', stroke: T.link, 'stroke-dasharray': '18 14', 'stroke-width': 5, opacity: 0.8 },
    ...places.links.map((k) => { const a = L.W(k.from.c, ...k.from.at), b = L.W(k.to.c, ...k.to.at); return svg('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1] }); }));
  const shapes = svg('g', { stroke: T.accent, 'stroke-width': 1.5, 'vector-effect': 'non-scaling-stroke' });
  const boothLayer = svg('g', {});
  const routeLayer = svg('g', { fill: 'none', 'pointer-events': 'none' });
  const marks = svg('g', {});
  const pinLayer = svg('g', {});
  const labelLayer = svg('g', { 'pointer-events': 'none', 'font-weight': 700 });
  const me = svg('g', { id: 'me-layer' });
  const board = svg('svg', { class: 'map', role: 'img', 'aria-label': 'CES 2027 캠퍼스 지도. 홀 안 부스 자리는 짐작이다.' }, roads, decor, links, shapes, boothLayer, routeLayer, marks, pinLayer, labelLayer, me);

  for (const p of L.list) {
    const shape = svg('polygon', { points: pts(p.world), fill: FILL[p.kind] || T.place, tabindex: 0, role: 'button', 'aria-label': p.ko });
    shape.dataset.k = p.k;
    shape.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); pickPlace(p); } });
    shapes.append(shape);
  }

  // ---- 보는 칸과 그리기
  const boardSize = () => ({ width: board.clientWidth || 360, height: board.clientHeight || 520 });
  const unitNow = () => widthOf(view) / boardSize().width;
  let lastUnit = 0;
  let drawn = null;       // 부스 점을 그려 둔 칸
  let chosenBooth = null;
  let routeTarget = null;
  let colorOf = null;
  let chip = null;
  const moving = { on: false };

  function sizeMarks() {
    const unit = unitNow();
    lastUnit = unit;
    for (const g of marks.children) g.querySelector('circle').setAttribute('r', (unit * (g.dataset.city ? 8 : 5)).toFixed(2));
    for (const g of pinLayer.children) {
      g.querySelector('circle').setAttribute('r', (unit * 11 * (LABEL / MIN_FONT)).toFixed(2));
      const t = g.querySelector('text');
      t.setAttribute('font-size', (unit * LABEL).toFixed(2));
    }
    for (const node of routeLayer.children) node.setAttribute('stroke-width', node.dataset.today ? 4 : 2.5);
  }
  // 한 프레임에 한 번: 보는 칸만 바꾼다. 점 · 글자는 손을 뗄 때(settle) 다시 놓는다.
  function draw() {
    board.setAttribute('viewBox', `${view[0].toFixed(2)} ${view[1].toFixed(2)} ${widthOf(view).toFixed(2)} ${(view[3] - view[1]).toFixed(2)}`);
    const unit = unitNow();
    if (!lastUnit || Math.abs(unit - lastUnit) / lastUnit > 0.004) { sizeMarks(); drawMe?.(); }
    mapx.dataset.level = levelOf(widthOf(view));
    if (!moving.on) { moving.on = true; labelLayer.style.opacity = '0'; }
    needDots();
  }
  function needDots() {
    const w = widthOf(view);
    if (w >= BOOTH_DOTS) { if (drawn) { boothLayer.replaceChildren(); drawn = null; } return; }
    if (!drawn || view[0] < drawn[0] || view[1] < drawn[1] || view[2] > drawn[2] || view[3] > drawn[3] || w / drawn.w > 1.4 || w / drawn.w < 0.55) drawBooths();
  }
  const setView = (v) => { view = v; };

  // 부스 점: 보이는 칸보다 조금 넓게 그려 두어, 끌 때 빈 곳이 보이지 않게 한다.
  function drawBooths() {
    const w = widthOf(view);
    if (w >= BOOTH_DOTS) { boothLayer.replaceChildren(); drawn = null; return; }
    const mx = (view[2] - view[0]) * 0.5, mz = (view[3] - view[1]) * 0.5;
    const box = [view[0] - mx, view[1] - mz, view[2] + mx, view[3] + mz];
    box.w = w;
    drawn = box;
    const unit = unitNow();
    const r = (unit * 5).toFixed(2);
    const marksNow = getMarks();
    colorOf ||= makeColorer();
    const nodes = [];
    for (const b of boothList) {
      if (b.x < box[0] || b.x > box[2] || b.z < box[1] || b.z > box[3]) continue;
      const on1 = b.key === chosenBooth;
      const marked = !!marksNow[b.key];
      const dot = svg('circle', { cx: b.x.toFixed(1), cy: b.z.toFixed(1), r: marked ? (Number(r) * 1.35).toFixed(2) : r, fill: colorOf(b.key), stroke: on1 ? T.ink : marked ? T.warn : T.panel, 'stroke-width': on1 || marked ? 3 : 1, 'vector-effect': 'non-scaling-stroke', 'pointer-events': 'none' });
      dot.dataset.key = b.key;
      nodes.push(dot);
      if (nodes.length >= 1500) break;
    }
    boothLayer.replaceChildren(...nodes);
  }
  function makeColorer() {
    if (!meta) return () => T.plain;
    return boothColorer(colorMode, { ...meta, ex: [...rows.values()] }, table || { groups: [] }, (key) => boothEx.get(key) || []);
  }

  // 놓을 글자 모으기 (확대 단계마다 다르다)
  function candidates(level, W, H) {
    const w = widthOf(view);
    const unit = w / W;
    const sx = (x) => (x - view[0]) / unit, sy = (z) => (z - view[1]) / unit;
    const near = (x, z, m = 60) => x > view[0] - m * unit && x < view[2] + m * unit && z > view[1] - m * unit && z < view[3] + m * unit;
    const cs = [];
    const marksOn = getMarks();
    const mine = new Map(pins.map((p) => [p.id, p]));
    if (level === 'campus') {
      for (const c of L.campuses) { const x = (c.box[0] + c.box[2]) / 2; cs.push({ id: `c:${c.k}`, x: sx(x), y: sy(c.box[1] - 55), text: c.ko, size: LABEL + 1, prio: 100, anchor: 'middle' }); }
    }
    for (const p of L.list) {
      if (!near(p.center[0], p.center[1], 40)) continue;
      const big = p.kind === 'hall' || p.kind === 'hotel';
      if (level === 'campus' && !big) continue;
      if (level !== 'campus' && !big && w > 900) continue;
      cs.push({ id: `p:${p.k}`, x: sx(p.center[0]), y: sy(p.center[1]), text: shortName(p.ko), size: LABEL, prio: big ? (level === 'hall' ? 60 : level === 'campus' ? 50 : 30) : 20, anchor: 'middle' });
    }
    for (const r of roadLabels) {
      if (level === 'booth' || !near(r.x, r.z, 20)) continue;
      cs.push({ id: `r:${r.name}:${r.x | 0}`, x: sx(r.x), y: sy(r.z), text: r.name, size: LABEL, prio: 12, anchor: 'middle', road: true });
    }
    for (const c of L.city) {
      if (!near(c.center[0], c.center[1], 40)) continue;
      cs.push({ id: `y:${c.k}`, x: sx(c.center[0]), y: sy(c.center[1]), text: c.ko, size: LABEL, prio: 70, anchor: 'start', dx: 12 });
    }
    for (const m of places.landmarks) {
      if (level === 'campus') break;
      const at = landmarkAt(m);
      if (!at || !near(at[0], at[1], 40)) continue;
      cs.push({ id: `m:${m.ko}`, x: sx(at[0]), y: sy(at[1]), text: m.ko, size: LABEL, prio: 65, anchor: 'start', dx: 9 });
    }
    if (level !== 'campus') {
      // 관심 · 동선 회사는 늘 이름이 보인다.
      for (const p of pins) if (near(p.x, p.z, 60)) cs.push({ id: `n:${p.id}`, x: sx(p.x), y: sy(p.z), text: clip(p.name, 12), size: LABEL, prio: 95, anchor: 'start', dx: 15, pin: true });
    }
    if (level === 'hall') {
      // 홀 단계: 혁신상 · 명함 이벤트 · 한국 회사 가운데 큰 회사 이름 (겹치면 숨는다).
      for (const b of boothList) {
        if (!b.name || !near(b.x, b.z, 20) || mine.has(boothEx.get(b.key)?.[0]?.[0])) continue;
        const marked = !!marksOn[b.key];
        const prio = marked ? 80 : b.award & 2 ? 55 : b.award ? 45 : 0;
        if (!prio) continue;
        cs.push({ id: `b:${b.key}`, x: sx(b.x), y: sy(b.z), text: clip(b.name, 12), size: LABEL, prio, anchor: 'start', dx: 8, dot: true });
      }
    }
    if (level === 'booth') {
      for (const b of boothList) {
        if (!near(b.x, b.z, 20)) continue;
        const rs = boothEx.get(b.key) || [];
        const interest = rs.find((r) => mine.has(r[0]));
        const marked = !!marksOn[b.key];
        const prio = interest ? 90 : marked ? 80 : b.key === chosenBooth ? 85 : b.award & 2 ? 50 : b.award ? 40 : 10;
        const label = interest ? interest[1] : b.name;
        cs.push({ id: `b:${b.key}`, x: sx(b.x), y: sy(b.z), text: `${b.code} ${clip(label, 9)}${b.n > 1 ? ` +${b.n - 1}` : ''}`, alts: [`${b.code} ${clip(label, 5)}`, b.code], size: LABEL, prio, anchor: 'start', dx: 9 });
      }
    }
    return cs;
  }
  // 길 이름: 이름이 있는 길의 가운데에 놓는다 (공식 LVCC 지도의 길 이름).
  const roadLabels = places.roads.filter((r) => r.name).map((r) => {
    const pts = r.pts.map(([x, z]) => L.W(r.c, x, z));
    let total = 0;
    for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    let left = total / 2;
    for (let i = 1; i < pts.length; i++) {
      const seg = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      if (left <= seg) { const t = left / seg; return { name: r.name, x: pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, z: pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t }; }
      left -= seg;
    }
    return { name: r.name, x: pts[0][0], z: pts[0][1] };
  });
  const landmarkAt = (m) => (m.at ? L.W(m.c, ...m.at) : (() => { const s = spots.get(`${m.place}|${m.booth}`); return s ? [s.x, s.z] : null; })());

  function relayout() {
    const { width: W, height: H } = boardSize();
    const level = levelOf(widthOf(view));
    const unit = widthOf(view) / W;
    const placed = layoutLabels(candidates(level, W, H), { width: W, height: H });
    const nodes = [];
    for (const c of placed) {
      const x = view[0] + (c.x + (c.dx || 0)) * unit, z = view[1] + (c.y + (c.dy || 0)) * unit;
      const t = svg('text', { x: x.toFixed(2), y: z.toFixed(2), 'font-size': (c.size * unit).toFixed(2), 'text-anchor': c.anchor === 'start' ? 'start' : 'middle', 'dominant-baseline': 'central', fill: T.ink, stroke: T.panel, 'stroke-width': (unit * 3.2).toFixed(2), 'stroke-linejoin': 'round', 'paint-order': 'stroke' });
      t.textContent = c.text;
      nodes.push(t);
      if (c.dot) nodes.push(svg('circle', { cx: (view[0] + c.x * unit).toFixed(2), cy: z.toFixed(2), r: (unit * 4).toFixed(2), fill: T.ink2, stroke: T.panel, 'stroke-width': unit * 1.5 }));
    }
    labelLayer.replaceChildren(...nodes);
    labelLayer.style.opacity = '1';
    moving.on = false;
    mapx.dataset.labels = String(placed.length);
  }

  // 손을 떼거나 날아가기가 끝났을 때: 점 · 글자를 다시 놓고, 보이는 홀의 자료를 받는다.
  let settleTimer = 0;
  function settle() {
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => {
      if (!mapx.isConnected) return;
      drawBooths();
      relayout();
      drawMe?.();
      loadVisible();
      paintChips();
    }, 40);
  }
  // 가까이 보는 홀(셋까지)의 전시사 줄을 받는다. 멀리서는 받지 않는다.
  function loadVisible() {
    const w = widthOf(view);
    if (w >= 1300) return;
    const near = L.list.filter((p) => { const b = bbox(p.world); return b[2] > view[0] && b[0] < view[2] && b[3] > view[1] && b[1] < view[3]; })
      .sort((a, b) => Math.hypot(a.center[0] - (view[0] + view[2]) / 2, a.center[1] - (view[1] + view[3]) / 2) - Math.hypot(b.center[0] - (view[0] + view[2]) / 2, b.center[1] - (view[1] + view[3]) / 2))
      .slice(0, 3);
    for (const p of near) ensureHall(p.k).catch(() => {});
  }

  // ---- 자료가 들어온 뒤: 관심 회사 번호 점과 선, 랜드마크, 점 · 글자
  function afterData() {
    pins = interestPins(rows, spots);
    drawPins();
    drawMarks();
    if (!mapx.isConnected) return;
    drawBooths();
    relayout();
    drawMe?.();
    rebuildChips();
  }
  function drawPins() {
    pinLayer.replaceChildren(...pins.map((pin) => {
      const g = svg('g', { 'data-pin': pin.id, role: 'button', tabindex: 0, 'aria-label': `${pin.no}번 ${pin.name}` },
        svg('circle', { cx: pin.x, cy: pin.z, fill: T.accent, stroke: T.panel, 'stroke-width': 1.5, 'vector-effect': 'non-scaling-stroke', opacity: dayFocus != null && pin.day !== dayFocus ? 0.25 : pin.seen ? 0.5 : 1 }));
      const text = svg('text', { x: pin.x, y: pin.z, 'text-anchor': 'middle', 'dominant-baseline': 'central', fill: T.panel, 'font-weight': 800, 'pointer-events': 'none' });
      text.textContent = String(pin.no);
      g.append(text);
      g.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); openCompany(rows.get(pin.id)); } });
      return g;
    }));
    // 오늘 동선(전시 기간이면 오늘, 아니면 번호가 있는 첫 날)은 굵은 실선, 다른 날은 얇은 점선. 관심 · 동선만 강조색 하나로 그린다.
    const today = todayIndex();
    const byDay = new Map();
    for (const p of pins) if (p.day) { if (!byDay.has(p.day)) byDay.set(p.day, []); byDay.get(p.day).push(p); }
    const routes = [...byDay].filter(([, list]) => list.length > 1).map(([day, list]) => ({ pts: list.map((p) => [p.x, p.z, splitBooth(p.booth).place]), color: T.accent, today: day === today, width: day === today ? 4 : 2.5, alpha: day === today ? 0.95 : dayFocus != null ? 0.15 : 0.45, dash: day === today ? null : '7 6' }));
    routeLayer.replaceChildren(...routes.map((r) => {
      const line = svg('polyline', { points: pts(r.pts), stroke: r.color, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'vector-effect': 'non-scaling-stroke', opacity: r.alpha, 'stroke-dasharray': r.dash });
      if (r.today) line.dataset.today = '1';
      return line;
    }));
    over.routes = routes;
    sizeMarks();
    sync3d();
  }
  // ---- 3D에도 같은 것을 그린다: 2D에 그리는 차례 선 · 길 안내 선 · 내 자리를 모아 3D에 넘긴다(3D는 그리기만 한다).
  const over = { routes: [], lines: [], dots: [] };
  const line3 = (points, color, width, dash) => { over.lines.push({ pts: points, color, width, dash }); };
  const dot3 = (at, r, fill, stroke, width) => { over.dots.push({ x: at[0], z: at[1], r, fill, stroke, width }); };
  function sync3d() {
    if (!three) return;
    const next = nextOfDay();
    const pin = next ? pins.find((p) => p.id === next.id && !p.seen) : null;
    three.set({
      pins: pins.map((p) => { const b = splitBooth(p.booth); return { id: p.id, key: `${b.place}|${b.code}`, x: p.x, z: p.z, k: b.place, no: p.no, day: p.day, name: p.name, alpha: dayFocus != null && p.day !== dayFocus ? 0.25 : p.seen ? 0.5 : 1 }; }),
      lines: [...over.routes, ...over.lines],
      dots: over.dots,
      // 다음에 갈 곳: 길 안내 중이면 가는 곳, 아니면 그 날의 다음 곳.
      next: nav ? { id: nav.id, name: nav.name, x: nav.spot.x, z: nav.spot.z, k: nav.place?.k } : pin ? { id: pin.id, name: pin.name, x: pin.x, z: pin.z, k: splitBooth(pin.booth).place } : null,
      quiet: !!nav,
    });
  }
  // 3D에서 지도가 가려지는 곳: 위 찾기 칸 · 아래 카드나 띠 · 오른쪽 단추. 3D는 그 안쪽(보이는 칸)에 맞춰 보고 글자도 거기에만 놓는다.
  function inset3d(withSheet, bottomPx) {
    const top = Math.max(TOP, topBar.offsetTop + topBar.offsetHeight + 6);
    const bottom = bottomPx ?? (withSheet || sheet.state() !== 'closed' ? sheet.expectedHeight() + 8 : navbar.hidden ? 26 : navbar.offsetHeight + 20);
    const f = frame.getBoundingClientRect(), c = ctls.getBoundingClientRect();
    // 카드가 열리면 오른쪽 단추는 숨는다(그때는 뺄 것이 없다).
    const shown = c.width > 0 && getComputedStyle(ctls).visibility !== 'hidden' && Number(getComputedStyle(ctls).opacity) > 0.5 && !(withSheet || sheet.state() !== 'closed');
    return { top, bottom, right: shown ? Math.max(0, f.right - c.left + 6) : 0, blocked: shown ? [[c.left - f.left - 6, c.top - f.top - 6, c.right - f.left, c.bottom - f.top + 6]] : [] };
  }
  // "다음 갈 곳"이 보는 날: 갈 곳 탭에서 넘겨 온 날 → 그 탭에서 고른 날 → 오늘 → 갈 곳이 남은 첫 날. 그 날의 회사만 보이고, 남은 곳이 없으면 띠를 안 보인다.
  function nextOfDay() {
    const list = getInterests();
    let day = dayFocus;
    if (day == null) { try { const saved = sessionStorage.getItem('ces2027.planDay'); if (saved !== null && Number.isFinite(Number(saved))) day = Number(saved); } catch { /* 저장이 막혀도 지도는 된다 */ } }
    if (day == null) { const d = new Date(); day = info ? dayKeyOf(info, `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`) : null; }
    if (day == null) day = list.filter((it) => !it.seen).map((it) => it.day || 0).sort((a, b) => dayRank(a) - dayRank(b))[0] ?? null;
    return day == null ? null : nextStop(list, day);
  }
  function todayIndex() {
    if (dayFocus != null) return dayFocus;
    const d = new Date();
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const key = info ? dayKeyOf(info, iso) : null;
    if (key) return key;
    return pins.filter((p) => p.day).map((p) => p.day).sort((a, b) => dayRank(a) - dayRank(b))[0] ?? 9;
  }
  function drawMarks() {
    const nodes = [];
    for (const m of places.landmarks) {
      const at = landmarkAt(m);
      if (!at) continue;
      const g = svg('g', {}, svg('circle', { cx: at[0], cy: at[1], fill: m.kind === 'badge' ? T.badge : m.kind === 'shuttle' ? T.shuttle : T.transit, stroke: T.panel, 'stroke-width': 1.5, 'vector-effect': 'non-scaling-stroke' }));
      nodes.push(g);
    }
    for (const c of L.city) {
      const g = svg('g', { tabindex: 0, role: 'button', 'aria-label': `${c.ko} (전시장 밖, 자리는 어림)` }, svg('circle', { cx: c.center[0], cy: c.center[1], fill: T.city, stroke: T.ink, 'stroke-width': 1.5, 'vector-effect': 'non-scaling-stroke' }));
      g.dataset.city = c.k;
      g.style.cursor = 'pointer';
      g.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); pickCity(c); } });
      nodes.push(g);
    }
    marks.replaceChildren(...nodes);
    sizeMarks();
  }
  drawMarks();

  // ---- 카드(아래에서 올라온다)와 날아가기
  const sheet = createSheet(mapx, { onChange: () => { paintNav(); requestAnimationFrame(() => setHeight()); }, onClose: () => { if (chosenBooth) { chosenBooth = null; routeTarget = null; drawBooths(); three?.chooseBooth(null); drawMe(); } } });
  const frame = el('div', { class: 'map-frame' }, board);
  let three = null;
  const in3d = () => solid.getAttribute('aria-pressed') === 'true';
  let gesture = null;

  // 화면에 보이는 칸(찾기 칸 아래 ~ 카드 위)의 가운데에 box를 놓는다.
  const TOP = 118;
  function goBox(box, { withSheet = false, ms = 420, bottom: bottomPx, side = 12 } = {}) {
    // 3D의 "전체"는 그려진 장소만 본다(전시장 밖 점은 3D에 없다).
    if (in3d()) { three?.look(box === all ? null : box, inset3d(withSheet, bottomPx)); return; }
    const { width, height } = boardSize();
    const bottom = bottomPx ?? (withSheet ? sheet.expectedHeight() + 8 : 26);
    gesture.animateTo(viewFor(box, width, height, { top: TOP, bottom, side }), ms, true);
  }
  function flyTo(x, z, w = 200) {
    const { width, height } = boardSize();
    const half = [x - w / 2, z - w * 0.28, x + w / 2, z + w * 0.28];
    gesture.animateTo(viewFor(half, width, height, { top: TOP, bottom: sheet.expectedHeight() + 8 }), 460, true);
  }
  const wrapBox = (list) => { const b = bbox(list.flatMap((p) => p.world)); return pad(b, 28); };

  // 회사 한 곳의 카드
  // 회사를 넣을 수 있는 날: 전시 나흘. 1/5는 전시장이 안 여는 날이라 뺀다(내 일정만).
  const infoDays = () => (info ? dayList(info) : []).filter((d) => !d.pre).map((d) => ({ key: d.key, ko: d.ko.split(' ')[0] }));
  async function openCompany(row, key) {
    if (!row) return;
    const id = row[0];
    if (!rows.has(id)) await ensureFull().catch(() => {});
    const bk = key || (row[7][0] ? boothKey(row[7][0]) : null);
    const bar = bk ? bk.indexOf('|') : -1;
    const place = bk ? placeBy.get(bk.slice(0, bar)) : null;
    if (bk && !spots.has(bk)) { if (place) await ensureHall(place.k).catch(() => {}); }
    chosenBooth = bk && spots.has(bk) ? bk : null;
    routeTarget = null;
    three?.chooseBooth(chosenBooth);
    if (!info) info = await getInfo().catch(() => null);
    sheet.open(companyCard(rows.get(id) || row, bk, place), 'half');
    const spot = bk ? spots.get(bk) : null;
    if (spot) { if (in3d()) goBox([spot.x - 110, spot.z - 110, spot.x + 110, spot.z + 110], { withSheet: true }); else flyTo(spot.x, spot.z, 200); } else if (place) goBox(wrapBox([place]), { withSheet: true });
    drawBooths();
    drawMe();
  }
  function companyCard(row, bk, place) {
    const [id, name, , country, cats, award] = row;
    const bar = bk ? bk.indexOf('|') : -1;
    const spot = bk ? spots.get(bk) : null;
    const code = bk ? bk.slice(bar + 1) : '';
    const korea = meta?.countries?.indexOf('South Korea');
    const catKo = cats && meta ? cats.split('.').map((c) => meta.catsKo[c] || meta.cats[c]).filter(Boolean).slice(0, 3).join(' · ') : '';
    const box = el('div', { class: 'card' });
    const interestBtn = el('button', { class: 'btn', type: 'button' });
    const paint = () => {
      const on = hasInterest(id);
      interestBtn.textContent = on ? '관심 중 · 빼기' : '관심 담기';
      interestBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
      interestBtn.classList.toggle('ghost', on);
      dayRow.replaceChildren(...infoDays().map((d) => {
        const cur = getInterests().find((it) => it.id === id)?.day || 0;
        return el('button', { class: 'seg', type: 'button', text: d.ko, 'aria-pressed': cur === d.key ? 'true' : 'false', 'aria-label': `${d.ko}의 갈 곳에 넣기`, onclick: () => {
          const list = getInterests();
          const at = list.findIndex((it) => it.id === id);
          if (at >= 0) list[at] = { ...list[at], day: d.key }; else list.push({ id, day: d.key });
          setInterests(list);
          afterInterests();
          paint();
        } });
      }));
    };
    const dayRow = el('div', { class: 'segs', role: 'group', 'aria-label': '갈 곳에 넣기' });
    interestBtn.addEventListener('click', () => { toggleInterest(id); afterInterests(); paint(); });
    const guide = bk ? guideBlock(bk, place, spot, row) : null;
    const logoBox = el('div', { class: 'card-logo' });
    attachImage(logoBox, id, name, meta);
    const head = el('div', { class: 'card-head' },
      el('h2', { text: name }),
      // 부스가 둘 이상인 회사는 자리마다 한 줄(눌러서 그 자리로), 하나뿐이면 한 줄
      boothLines(row[7], (k) => { const p = placeBy.get(k); return p ? shortName(p.ko) : ''; }, { now: bk ? row[7].find((b) => boothKey(b) === bk) : null, pick: (b) => openCompany(rows.get(id) || row, boothKey(b)) })
        || el('p', { class: 'card-where', text: bk ? `부스 ${code} · ${place ? shortName(place.ko) : '장소 모름'}` : '부스 미정' }),
      el('p', { class: 'card-tags' },
        spot && !spot.official ? el('span', { class: 'tag', text: '자리는 짐작' }) : null,
        award ? el('span', { class: 'tag mint', text: award & 2 ? '최고 혁신상' : '혁신상' }) : null,
        country >= 0 && country === korea ? el('span', { class: 'tag mint', text: '한국' }) : null),
      catKo ? el('p', { class: 'note', text: catKo }) : null);
    paint();
    box.append(head,
      el('div', { class: 'card-actions' }, interestBtn, el('p', { class: 'label', text: '갈 곳에 넣기' }), dayRow),
      guide || '', // 부스가 없는 회사는 길 안내 칸이 없다 (null을 그대로 붙이면 "null" 글자가 보인다)
      sessionBlock(name),
      el('div', { class: 'row-actions' }, meta?.link ? out(meta.link.replace('{id}', encodeURIComponent(id)), '공식 링크') : null, el('a', { href: `#/talk/${encodeURIComponent(id)}`, text: '대화' }), markBlock(bk)),
      logoBox);
    return box;
  }
  const afterInterests = () => { pins = interestPins(rows, spots); drawPins(); relayout(); drawMe(); };
  // 명함 넣는 이벤트가 있는 부스인지 사람이 표시한다. 공식 자료에는 없다.
  function markBlock(key) {
    if (!key) return null;
    const mark = getMarks()[key];
    return el('button', { class: 'linkish', type: 'button', text: mark ? `명함 이벤트 있음 (${markLabel(mark)})` : '명함 이벤트 있음으로 표시', 'aria-pressed': mark ? 'true' : 'false', onclick: () => {
      setMarks(toggleMark(getMarks(), key));
      drawBooths();
      relayout();
      three?.redraw();
      const row = (boothEx.get(key) || [])[0];
      if (row) openCompany(row, key);
    } });
  }
  // 여기서 가는 길: 같은 홀이면 짐작 길(홀 입구나 내 자리에서), 다른 캠퍼스면 구글맵.
  function guideBlock(key, place, spot, row) {
    const bar = key.indexOf('|');
    const where = getWhere();
    const g = guideTo(where, { place: key.slice(0, bar), code: key.slice(bar + 1) }, (k) => placeBy.get(k));
    const route = mapsLink(places, place, 'directions');
    const at = myPoint(where);
    const sameHall = g.kind === 'same-place' || (g.kind === 'unknown' || g.kind === 'same-campus') && !!indoorPaths.halls[place?.k];
    return el('div', { class: 'card-way' },
      el('p', { class: 'label', text: '여기까지 길' }),
      el('p', { class: 'note', text: g.lines[0] }),
      el('div', { class: 'actions' },
        spot && row ? el('button', { class: 'btn', type: 'button', text: '길 안내 시작', onclick: () => startNav(row, key) }) : null,
        spot && place && (g.kind === 'same-place' || sameHall) && g.kind !== 'other-campus' ? el('button', { class: 'btn', type: 'button', text: at ? '내 자리에서 길 보기' : '홀 입구에서 길 보기', onclick: async () => {
          indoorPaths = await getIndoorPaths().catch(() => indoorPaths);
          const hall = indoorPaths.halls[place.k];
          if (!hall) { if (route) window.open(route, '_blank', 'noopener'); return; }
          routeTarget = key;
          const entry = L.W(place.c, ...hall.entrance);
          const aisle = hall.aisle.map(([x, z]) => L.W(place.c, x, z));
          const from = (where?.by === 'booth' && where.place === place.k) || (where?.by === 'gps' && where.area?.places.includes(place.k)) ? at : null;
          const path = routeThroughAisle(from, [spot.x, spot.z], aisle, entry);
          const xs = path.map(([x]) => x), zs = path.map(([, z]) => z);
          goBox(pad([Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)], 40), { withSheet: true });
          drawMe();
        } }) : null,
        g.kind === 'unknown' ? el('button', { class: 'btn ghost', type: 'button', text: '내 자리 넣기', onclick: () => { sheet.close(); boothInput.scrollIntoView({ block: 'center', behavior: 'smooth' }); boothInput.focus({ preventScroll: true }); } }) : null,
        route && (g.maps || g.kind === 'other-campus') ? out(route, '구글맵 길찾기', g.kind === 'other-campus' || g.kind === 'outside' ? 'btn' : 'btn ghost') : null),
      indoorPaths.halls[place?.k] ? el('p', { class: 'note', text: '홀 안 길은 짐작이다.' }) : null);
  }

  // 부스(점)를 누르면: 회사가 하나면 그 회사 카드, 여럿이면 목록.
  async function pickBooth(key) {
    const rs = boothEx.get(key) || [];
    if (rs.length === 1) return openCompany(rs[0], key);
    chosenBooth = key;
    routeTarget = null;
    const bar = key.indexOf('|');
    const place = placeBy.get(key.slice(0, bar));
    const spot = spots.get(key);
    sheet.open(el('div', { class: 'card' },
      el('div', { class: 'card-head' }, el('h2', { text: `부스 ${key.slice(bar + 1)}` }),
        el('p', { class: 'card-where', text: `${place ? shortName(place.ko) : '장소 모름'} · 회사 ${rs.length}곳` }),
        spot && !spot.official ? el('p', { class: 'card-tags' }, el('span', { class: 'tag', text: '자리는 짐작' })) : null),
      companyButtons(rs, key)), 'half');
    if (spot) { if (in3d()) goBox([spot.x - 110, spot.z - 110, spot.x + 110, spot.z + 110], { withSheet: true }); else flyTo(spot.x, spot.z, 200); }
    three?.chooseBooth(key);
    drawBooths();
  }
  function companyButtons(list, key, first = 30) {
    const wrap = el('div', { class: 'pick-list' });
    let shown = 0;
    const more = el('button', { class: 'btn ghost wide', type: 'button' });
    const add = () => {
      wrap.append(...list.slice(shown, shown + first).map((r) => {
        const b = r[7][0] ? splitBooth(r[7][0]) : null;
        return el('button', { class: 'pick-row', type: 'button', onclick: () => openCompany(r, key || (r[7][0] ? boothKey(r[7][0]) : null)) }, el('b', { text: r[1] }), el('span', { text: b ? `부스 ${b.code}` : '부스 미정' }));
      }));
      shown = Math.min(list.length, shown + first);
      more.hidden = shown >= list.length;
      more.textContent = `더 보기 (${list.length - shown}곳 남음)`;
    };
    more.addEventListener('click', add);
    add();
    return el('div', {}, wrap, more);
  }

  // 공식 지도의 홀별 부스 번호 범위 (data/places.json의 boothRules.numbers)
  const boothRange = (k) => (places.boothRules?.numbers || []).filter((r) => r.place === k).map((r) => `${r.from}–${r.to}`).join(' · ');
  // 홀(장소)을 누르면: 그 홀로 날아가 카드가 열린다.
  async function pickPlace(p) {
    chosenBooth = null;
    routeTarget = null;
    three?.choose(p.k);
    const link = mapsLink(places, p);
    const route = mapsLink(places, p, 'directions');
    const here = pins.filter((pin) => pin.booth.endsWith(`@${p.k}`));
    const listBox = el('div', { class: 'card-list' }, el('p', { class: 'note', text: '회사를 불러오는 중이다.' }));
    sheet.open(el('div', { class: 'card' },
      el('div', { class: 'card-head' }, el('h2', { text: shortName(p.ko) }),
        el('p', { class: 'card-where', text: p.theme }),
        boothRange(p.k) ? el('p', { class: 'note', text: `부스 번호 ${boothRange(p.k)}` }) : null,
        el('p', { class: 'card-tags' }, p.boothSpots === 'guess' ? el('span', { class: 'tag', text: '자리는 짐작' }) : null)),
      here.length ? el('p', { class: 'note', text: `내 관심 ${here.length}곳: ${here.map((h) => h.name).slice(0, 3).join(' · ')}${here.length > 3 ? ' …' : ''}` }) : null,
      el('div', { class: 'actions' }, link ? out(link, '구글맵에서 열기', 'btn ghost') : null, route ? out(route, '걸어서 길찾기', 'btn ghost') : null),
      listBox), 'half');
    goBox(wrapBox([p]), { withSheet: true });
    await ensureHall(p.k).catch(() => {});
    const mineRows = [...rows.values()].filter((r) => r[7].some((b) => splitBooth(b).place === p.k)).sort((a, b) => a[1].localeCompare(b[1], 'en'));
    listBox.replaceChildren(el('h3', { text: `이 홀의 회사 ${mineRows.length}곳` }), mineRows.length ? companyButtons(mineRows, null) : el('p', { class: 'note', text: '받은 자료에는 이 홀의 회사가 없다.' }));
  }
  // 캠퍼스를 누르면(3D의 바닥): 그 캠퍼스의 홀 단추.
  function pickCampus(c) {
    three?.choose(null);
    const mine = L.list.filter((p) => p.c === c.k && (p.kind === 'hall' || p.kind === 'hotel'));
    sheet.open(el('div', { class: 'card' }, el('div', { class: 'card-head' }, el('h2', { text: c.ko }), el('p', { class: 'card-where', text: c.sub })),
      el('div', { class: 'pick-list' }, mine.map((p) => el('button', { class: 'pick-row', type: 'button', onclick: () => pickPlace(p) }, el('b', { text: shortName(p.ko) }), el('span', { text: p.kind === 'hall' ? '홀' : '호텔' }))))), 'half');
    goBox(pad(c.box, 40), { withSheet: true });
  }
  // 전시장 밖의 공개 장소를 누르면: 이름 · 내 일정 · 구글맵.
  function pickCity(c) {
    three?.choose(null);
    const mine = getEvents().filter((e) => e.place === c.ko || e.place === c.en);
    const query = encodeURIComponent(`${c.maps.query}, ${c.maps.address}`);
    sheet.open(el('div', { class: 'card' },
      el('div', { class: 'card-head' }, el('h2', { text: c.ko }), el('p', { class: 'card-where', text: `전시장 밖 · 자리는 어림이다${c.maps.addressChecked ? '' : ' (주소는 확인 전)'}` })),
      mine.length ? el('ul', { class: 'stack' }, mine.map((e) => el('li', {}, el('b', { text: e.name }), el('span', { text: `${e.date.slice(5).replace('-', '/')} ${e.from} ~ ${e.to}` })))) : el('p', { class: 'note', text: '여기서 하는 내 일정은 없다.' }),
      el('div', { class: 'actions' }, out(places.mapsUrls.search.replace('{query}', query), '구글맵에서 열기', 'btn'), out(places.mapsUrls.directions.replace('{query}', query), '구글맵 길찾기', 'btn ghost'))), 'half');
    flyTo(c.center[0], c.center[1], 600);
  }

  // ---- 눌렀을 때: 번호 점 → 부스 점(가장 가까운 것, 손가락 크기) → 홀 → 장소
  board.addEventListener('click', (ev) => {
    const pin = ev.target.closest?.('[data-pin]');
    if (pin) { openCompany(rows.get(pin.dataset.pin)); return; }
    const city = ev.target.closest?.('[data-city]');
    if (city) { pickCity(L.city.find((c) => c.k === city.dataset.city)); return; }
    const w = widthOf(view);
    if (w < BOOTH_DOTS) {
      const [wx, wz] = gesture.toWorld(ev.clientX, ev.clientY);
      const reach = unitNow() * 22;
      let best = null, bestD = reach;
      for (const b of boothList) {
        const dx = b.x - wx, dz = b.z - wz;
        if (Math.abs(dx) > reach || Math.abs(dz) > reach) continue;
        const d = Math.hypot(dx, dz);
        if (d < bestD) { best = b; bestD = d; }
      }
      if (best) { pickBooth(best.key); return; }
    }
    const k = ev.target.dataset?.k;
    if (k) pickPlace(placeBy.get(k));
  });

  // ---- 2D · 3D
  const flat = el('button', { class: 'ctl ctl-wide', type: 'button', text: '2D', 'aria-pressed': 'true', 'aria-label': '2D 지도' });
  const solid = el('button', { class: 'ctl ctl-wide', type: 'button', text: '3D', 'aria-pressed': 'false', 'aria-label': '3D 지도 (누를 때 불러온다)' });
  void flat;
  async function mode(is3d) {
    flat.setAttribute('aria-pressed', is3d ? 'false' : 'true');
    solid.setAttribute('aria-pressed', is3d ? 'true' : 'false');
    solid.textContent = is3d ? '2D' : '3D';
    solid.setAttribute('aria-label', is3d ? '2D 지도로 돌아가기' : '3D 지도 (누를 때 불러온다)');
    if (!is3d) { frame.replaceChildren(board); requestAnimationFrame(() => { draw(); settle(); }); return; }
    frame.replaceChildren(el('p', { class: 'note map-wait', text: '3D를 불러오는 중이다.' }));
    try {
      // 3D는 여기서 처음 불러온다. 첫 화면에는 싣지 않는다. 부스 점이 있어야 해서 전시사 자료를 다 받는다.
      await ensureFull().catch(() => {});
      three ??= (await import('../map3d.js')).create(L, places, { onPlace: (p) => pickPlace(p), onCampus: (c) => pickCampus(c), onBooth: (key) => pickBooth(key), onPin: (id) => openCompany(rows.get(id)), booths: boothList, colorOf: (key) => (colorOf ||= makeColorer())(key), isMarked: (key) => !!getMarks()[key], scale: LABEL / MIN_FONT, inset: () => inset3d() });
      page.three = three;
      // 2D에서 보던 곳(찾기 칸 아래 ~ 띠 위)을 3D에서도 그대로 본다.
      const { width, height } = boardSize();
      const unit = widthOf(view) / width;
      const seen = inset3d();
      const box = [view[0] + 12 * unit, view[1] + TOP * unit, view[2] - 12 * unit, view[1] + Math.max(TOP + 60, height - seen.bottom) * unit];
      frame.replaceChildren(three.node);
      drawMe();
      three.look(box, seen);
    } catch {
      frame.replaceChildren(board);
      flat.setAttribute('aria-pressed', 'true');
      solid.setAttribute('aria-pressed', 'false');
      solid.textContent = '3D';
      frame.prepend(el('p', { class: 'note map-wait', text: '3D를 불러오지 못했다. 2D로 본다.' }));
    }
  }
  solid.addEventListener('click', () => mode(!in3d()));
  const zoomBy = (f) => { if (in3d()) three?.zoom(f); else { const v = view; const cx = (v[0] + v[2]) / 2, cz = (v[1] + v[3]) / 2; gesture.zoomTo(f, cx, cz); } };
  const plus = el('button', { class: 'ctl', type: 'button', text: '+', 'aria-label': '크게', onclick: () => zoomBy(in3d() ? 0.8 : 0.5) });
  const minus = el('button', { class: 'ctl', type: 'button', text: '−', 'aria-label': '작게', onclick: () => zoomBy(in3d() ? 1.25 : 2) });
  const locate = el('button', { class: 'ctl', type: 'button', 'aria-label': '내 위치', onclick: () => { navFollow = true; if (nav) navView(); else gpsButton.click(); } }, (() => { const s = svg('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' }); s.append(svg('circle', { cx: 12, cy: 12, r: 3.5 }), svg('path', { d: 'M12 3v3M12 18v3M3 12h3M18 12h3' })); return s; })());

  // ---- 위: 찾기 칸 · 홀 바로 가기
  const finder = findBox({
    places: places.places,
    // 찾는 글자를 넣기 시작하면 열려 있던 카드를 닫는다 (펼친 카드 밑에 결과 줄이 숨던 것). 길 안내는 그대로 둔다.
    onType: () => { if (sheet.state() !== 'closed') sheet.close(); },
    ranges: places.boothRules?.numbers || [],
    onPlace: (p) => pickPlace(placeBy.get(p.k)),
    onCompany: async (row, f) => {
      // 찾은 자료로 지도 자료를 채운다(전체), 그 부스로 날아가 카드를 연다.
      try { await ensureFull(); } catch { /* 전체를 못 받아도 줄은 있다 */ }
      openCompany(rows.get(row[0]) || row);
    },
  });
  const chips = el('div', { class: 'chips', role: 'group', 'aria-label': '홀 바로 가기' });
  const chipBoxes = [];
  function paintChips() {
    const mx = (view[0] + view[2]) / 2, mz = (view[1] + view[3]) / 2;
    const cur = chipBoxes.find((c) => c.box && mx >= c.box[0] && mx <= c.box[2] && mz >= c.box[1] && mz <= c.box[3] && widthOf(view) < 1300);
    for (const c of chipBoxes) c.node.setAttribute('aria-pressed', c === cur || (c.all && widthOf(view) >= 1300 && !cur) ? 'true' : 'false');
  }
  function buildChips() {
    chipBoxes.length = 0;
    const defs = [{ ko: '전체', all: true, box: null }, ...HALL_CHIPS.map(([ko, keys]) => ({ ko, list: keys.map((k) => placeBy.get(k)).filter(Boolean) })).filter((d) => d.list.length).map((d) => ({ ko: d.ko, box: wrapBox(d.list) }))];
    if (pins.length) defs.push({ ko: '내 갈 곳', box: pad(bbox(pins.map((p) => [p.x, p.z])), 90) });
    for (const d of defs) {
      d.node = el('button', { class: 'chip-go', type: 'button', text: d.ko, 'aria-pressed': 'false', onclick: () => { sheet.close(); finder.clear(); goBox(d.box || all); } });
      chipBoxes.push(d);
    }
    // 맨 앞: 전시사 목록(공식 앱의 전시사 A–Z 목록 + 거르기). 홀 칩이 아니라 다른 화면으로 가는 칩이다.
    const listIcon = svg('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' });
    listIcon.append(svg('path', { d: 'M4 6h16M4 12h16M4 18h10' }));
    const listChip = el('a', { class: 'chip-go chip-list', href: '#/list', 'aria-label': '전시사 목록 (이름순 · 거르기)' }, listIcon, '목록');
    chips.replaceChildren(listChip, ...chipBoxes.map((d) => d.node));
    paintChips();
  }
  buildChips();
  const rebuildChips = () => { buildChips(); };

  // 내 위치: GPS로는 어느 캠퍼스인지까지, 홀 안은 가까운 부스 번호로 맞춘다. 위치는 폰 밖으로 나가지 않는다.
  const whereText = el('p', { class: 'big' });
  const whereNote = el('p', { class: 'note', role: 'status' });
  const nextBox = el('div', { class: 'block' });
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
    const next = nextOfDay();
    const nextPin = next ? pins.find((p) => p.id === next.id) : null;
    const at = myPoint(where);
    const unit = (view[2] - view[0]) / 360;
    me.replaceChildren();
    over.lines = [];
    over.dots = [];
    if (nav) drawNav(at, where);
    paintNav();
    const chosenSpot = !nav && chosenBooth ? spots.get(chosenBooth) : null;
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
        line3(path, T.warn, 4, '7 5');
        dot3(entry, 7, T.panel, T.warn, 2);
        me.append(
          svg('polyline', { points: pts(path), fill: 'none', stroke: T.warn, 'stroke-width': 4, 'stroke-dasharray': '7 5', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'vector-effect': 'non-scaling-stroke', 'pointer-events': 'none', 'aria-label': '홀 안 짐작 길' }, title),
          svg('circle', { cx: entry[0], cy: entry[1], r: 7, fill: T.panel, stroke: T.warn, 'stroke-width': 2, 'vector-effect': 'non-scaling-stroke', 'pointer-events': 'none' }));
      }
    } else if (at && chosenSpot) {
      line3([at, [chosenSpot.x, chosenSpot.z]], T.warn, 3);
      me.append(svg('line', { x1: at[0], y1: at[1], x2: chosenSpot.x, y2: chosenSpot.z, stroke: T.warn, 'stroke-width': 3, 'stroke-linecap': 'round', 'vector-effect': 'non-scaling-stroke', 'pointer-events': 'none' }));
    }
    if (at && nextPin) { line3([at, [nextPin.x, nextPin.z]], T.ink, 2, '6 5'); me.append(svg('line', { x1: at[0], y1: at[1], x2: nextPin.x, y2: nextPin.z, stroke: T.ink, 'stroke-width': 2, 'stroke-dasharray': '6 5', 'vector-effect': 'non-scaling-stroke', 'pointer-events': 'none' })); }
    if (at) {
      // 부스로 맞췄으면 작은 점, GPS(캠퍼스까지)면 넓은 고리로 보인다.
      const wide = where.by === 'gps';
      dot3(at, wide ? (where.area ? 34 : 60) : 16, withAlpha(T.accent, 0.18), T.accent, 1.5);
      dot3(at, 6, T.accent, T.panel, 2);
      me.append(
        svg('circle', { cx: at[0], cy: at[1], r: (unit * (wide ? (where.area ? 34 : 60) : 16)).toFixed(1), fill: withAlpha(T.accent, 0.18), stroke: T.accent, 'stroke-width': 1.5, 'vector-effect': 'non-scaling-stroke', 'pointer-events': 'none' }),
        svg('circle', { cx: at[0], cy: at[1], r: (unit * 6).toFixed(1), fill: T.accent, stroke: T.panel, 'stroke-width': 2, 'vector-effect': 'non-scaling-stroke', 'pointer-events': 'none' }));
    }
    sync3d();
    if (!where) whereText.textContent = '아직 내 위치를 모른다.';
    else if (where.by === 'booth') whereText.textContent = `${placeBy.get(where.place)?.ko || '장소 모름'} · 부스 ${where.code} 근처`;
    else if (where.area) whereText.textContent = `${where.area.ko} 근처 (GPS, 짐작)`;
    else if (where.inside) whereText.textContent = `${L.campuses.find((c) => c.k === where.campus)?.ko} 안 (GPS)`;
    else whereText.textContent = `가장 가까운 곳은 ${L.campuses.find((c) => c.k === where.campus)?.ko}, 약 ${where.meters >= 1000 ? `${(where.meters / 1000).toFixed(where.meters >= 10000 ? 0 : 1)}km` : `${where.meters}m`} 떨어져 있다 (GPS)`;
    if (!next) {
      nextBox.replaceChildren(el('p', { class: 'note', text: pins.length ? '이 날 갈 곳이 남아 있지 않다.' : '관심 회사를 넣으면 다음 갈 곳이 나온다.' }));
      return;
    }
    const row = rows.get(next.id);
    const booth = row?.[7]?.[0];
    const place = booth ? placeBy.get(booth.slice(booth.lastIndexOf('@') + 1)) : null;
    const route = mapsLink(places, place, 'directions');
    nextBox.replaceChildren(
      el('h3', { text: `다음 갈 곳: ${row ? row[1] : '자료에서 빠진 회사'}` }),
      el('p', { class: 'note', text: booth ? `${place ? place.ko : '장소 모름'} · 부스 ${booth.slice(0, booth.lastIndexOf('@'))} (자리는 짐작)` : '부스 미정' }),
      el('div', { class: 'actions' },
        route && navMaps !== next.id ? out(route, '구글맵 길찾기', 'btn') : null,
        nextPin ? el('button', { class: 'btn ghost', type: 'button', text: '지도에서 보기', onclick: () => { if (in3d()) mode(false); goBox([nextPin.x - 140, nextPin.z - 140, nextPin.x + 140, nextPin.z + 140]); } }) : null,
        el('a', { class: 'btn ghost', href: '#/plan', text: '갈 곳에서 보기' })));
  }
  board.addEventListener('viewchange', drawMe);

  // GPS로 받은 자리 하나를 쓴다: 캠퍼스 → (짐작으로) 홀 · 건물. 지도는 그 자리를 가운데로 옮긴다.
  let lastCampus = null;
  let acceptedFix = null;
  // 위치를 받는 일의 지금 상태(받는 중 · 거부 · 못 받음 · 흔들림). 길 안내 띠에도 같은 말을 보인다.
  let gpsNote = '';
  const gpsSay = (text) => { whereNote.textContent = text; gpsNote = text; if (nav) paintNav(); };
  function useFix(lat, lng, accuracy, following) {
    const now = Date.now();
    const issue = fixProblem(acceptedFix, { lat, lng, accuracy, at: now }, 150, 3);
    if (issue === 'accuracy') {
      gpsSay(`위치가 흔들린다 (정확도 약 ${Number.isFinite(accuracy) ? `${Math.round(accuracy)}m` : '모름'}). 자리를 바꾸지 않았다. 부스 번호로 맞춘다.`);
      return false;
    }
    if (following && issue === 'jump') {
      gpsSay('위치가 갑자기 바뀌어 보인다. 자리를 바꾸지 않았다. 다음 위치를 기다린다.');
      return false;
    }
    gpsNote = '';
    const near = nearestCampus(places, lat, lng);
    const area = near.inside && accuracy <= 100 ? nearestArea(places, lat, lng) : null;
    const where = { by: 'gps', lat, lng, accuracy: Math.round(accuracy), campus: area ? area.c : near.k, inside: near.inside, meters: Math.round(near.meters), area: area ? { ko: area.ko, places: area.places, meters: Math.round(area.meters) } : null, at: Date.now() };
    setWhere(where);
    acceptedFix = { lat, lng, accuracy, at: now };
    whereNote.textContent = !near.inside ? '캠퍼스 밖이다. 현장에 가면 다시 누른다.'
      : area ? 'GPS로 본 홀 · 건물은 짐작이다 (자리가 어림값이고 실내에서는 GPS가 흔들린다). 홀 안에서는 가까운 부스 번호를 적는다.'
      : accuracy > 100 ? 'GPS 정확도가 낮아 캠퍼스까지만 맞췄다. 홀 안에서는 가까운 부스 번호를 적는다.'
        : 'GPS는 캠퍼스까지만 맞췄다. 홀 안에서는 가까운 부스 번호를 적는다.';
    const at = myPoint(where);
    if (nav) { lastCampus = where.campus; drawMe(); if (navFollow) navView(at); return true; }
    if (!at) { drawMe(); return true; }
    if (in3d()) { three?.look([at[0] - 260, at[1] - 260, at[0] + 260, at[1] + 260]); drawMe(); return true; }
    if (following && lastCampus === where.campus) {
      // 따라가기: 보는 크기는 그대로 두고 내 자리를 가운데로.
      const w = view[2] - view[0], h = view[3] - view[1];
      setView([at[0] - w / 2, at[1] - h / 2, at[0] + w / 2, at[1] + h / 2]);
      draw();
      settle();
    } else {
      goBox(area ? [at[0] - 260, at[1] - 260, at[0] + 260, at[1] + 260] : pad(L.campuses.find((c) => c.k === where.campus).box, 40));
    }
    lastCampus = where.campus;
    return true;
  }
  // 위치를 못 쓸 때(허락하지 않았거나 브라우저가 위치를 주지 않을 때)의 한 줄. 길 안내 판은 이때 부스 번호 칸을 바로 보인다.
  const NO_GPS = '위치를 못 쓴다. 가까운 부스 번호를 적는다.';
  const noGps = () => { gpsSay(NO_GPS); };
  const gpsError = (error) => {
    gpsSay(error?.code === 1 ? NO_GPS : '위치를 받지 못했다. 다시 누르거나 부스 번호로 맞춘다.');
  };
  const gpsButton = el('button', { class: 'btn', type: 'button', text: 'GPS로 찾기', onclick: () => {
    if (!('geolocation' in navigator)) return noGps();
    gpsSay('위치를 받는 중이다. 위치를 묻는 창이 뜨면 허락한다.');
    navigator.geolocation.getCurrentPosition((pos) => useFix(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy, false),
      gpsError, { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 });
  } });
  // 따라가기: 걸으면 지도가 나를 따라온다. 배터리를 아끼려고 20초에 한 번만 고치고, 화면이 꺼지거나 지도를 떠나면 멈춘다.
  let FOLLOW_EVERY = 20000;
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
    }, (error) => {
      // 권한을 거부했을 때만 끈다. 잠깐 못 받은 것(실내 · 터널)은 계속 기다린다.
      if (error?.code === 1) { stopFollow(); gpsSay(NO_GPS); }
      else gpsSay('위치를 잠깐 받지 못했다. 계속 기다린다. 급하면 부스 번호로 맞춘다.');
    }, { enableHighAccuracy: true, maximumAge: FOLLOW_EVERY, timeout: 60000 });
  }
  function startFollow() {
    if (!('geolocation' in navigator)) return noGps();
    following = true;
    lastFix = 0;
    followButton.textContent = '따라가기 끄기';
    followButton.setAttribute('aria-pressed', 'true');
    whereNote.textContent = `따라가기를 켰다. 위치 정확도를 살펴 ${FOLLOW_EVERY / 1000}초에 한 번 내 자리를 고친다.`;
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
  // 가까운 부스 번호로 내 자리를 맞춘다. 맞춘 자리(hit)와 알릴 말(note)을 돌려준다. 못 찾으면 hit이 없다.
  function fitBooth(text) {
    const exact = findBooth(spots, text);
    const hit = exact[0] || nearBooth(spots, text);
    if (!hit) return { hit: null, note: '그 부스를 찾지 못했다. 번호를 다시 본다.' };
    setWhere({ by: 'booth', campus: placeBy.get(hit.place)?.c, place: hit.place, code: hit.code, x: hit.x, z: hit.z, at: Date.now() });
    return { hit, note: exact.length > 1 ? `같은 이름의 부스가 ${exact.length}곳 있어 첫 곳으로 맞췄다.` : exact.length ? '부스 번호로 맞췄다. 자리는 짐작이다.' : `그 번호는 자료에 없어 가장 가까운 ${hit.code}로 맞췄다.` };
  }
  boothForm.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const text = boothInput.value.trim();
    if (!text) return;
    const { hit, note } = fitBooth(text);
    whereNote.textContent = note;
    if (!hit) return;
    if (solid.getAttribute('aria-pressed') === 'true') mode(false);
    goBox([hit.x - 160, hit.z - 160, hit.x + 160, hit.z + 160]);
  });
  // 길 안내 판 안의 같은 칸: 위치를 못 쓸 때 판에서 바로 맞춘다(아래 묶음까지 굴리지 않게). 맞추면 판이 거리 · 분으로 바뀐다.
  const navInput = el('input', { type: 'text', inputmode: 'text', autocapitalize: 'off', autocomplete: 'off', spellcheck: 'false', placeholder: '가까운 부스 번호', 'aria-label': '가까운 부스 번호' });
  const navForm = el('form', { class: 'inline nav-form', hidden: true }, el('label', { class: 'field' }, navInput), el('button', { class: 'btn', type: 'submit', text: '맞추기' }));
  navForm.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const text = navInput.value.trim();
    if (!text) return;
    const { hit, note } = fitBooth(text);
    if (!hit) { gpsSay(note); return; }
    navInput.value = '';
    navInput.blur();
    whereNote.textContent = note;
    gpsNote = '';
    navFollow = true;
    drawMe();
    navView();
  });
  const navHead = el('div', { class: 'nav-head', role: 'status', 'aria-live': 'polite' }); // 읽어 주는 것은 이름 · 한 줄뿐(칸 · 단추는 읽어 주는 자리 밖)
  const navActs = el('div', { class: 'nav-actions' });
  navbar.append(navHead, navForm, navActs);
  const mePanel = el('section', { class: 'panel' },
    el('h2', { text: '내 위치' }),
    whereText,
    el('div', { class: 'actions' }, gpsButton, followButton),
    boothForm,
    whereNote,
    nextBox,
    el('p', { class: 'note', text: '위치는 이 폰 안에서만 쓴다. 홀 안은 부스 번호로 맞춘다.' }));



  // ---- 길 안내: 목적지까지 선 · 남은 거리 · 걷는 시간 · 방향. 걸으면 지도가 따라온다.
  const placeCampus = (k) => places.campuses.find((c) => c.k === k);
  function navEstimate(target, where, at) {
    const coarse = where?.by === 'gps' && !where.area;
    const campusFrom = placeCampus(where?.campus) || null;
    return estimate(at, [target.spot.x, target.spot.z], { campusFrom, campusTo: placeCampus(target.place?.c), me: where?.by === 'gps' && Number.isFinite(where.lat) ? { lat: where.lat, lng: where.lng } : null, coarse });
  }
  function drawNav(at, where) {
    const unit = (view[2] - view[0]) / 360;
    const t = [nav.spot.x, nav.spot.z];
    const line = (points, dash) => (line3(points, T.panel, 8), line3(points, T.accent, 4.5, dash), [
      svg('polyline', { points: pts(points), fill: 'none', stroke: T.panel, 'stroke-width': 8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'vector-effect': 'non-scaling-stroke', 'pointer-events': 'none' }),
      svg('polyline', { points: pts(points), fill: 'none', stroke: T.accent, 'stroke-width': 4.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-dasharray': dash, 'vector-effect': 'non-scaling-stroke', 'pointer-events': 'none' })]);
    const hall = indoorPaths.halls[nav.place?.k];
    const here = (where?.by === 'booth' && where.place === nav.place?.k) || (where?.by === 'gps' && where.area?.places.includes(nav.place?.k));
    if (hall && nav.place && (here || !at || routeTarget === nav.key)) {
      // 같은 홀 안이면 홀 입구와 큰 통로를 따라가는 짐작 길
      const entry = L.W(nav.place.c, ...hall.entrance);
      const aisle = hall.aisle.map(([x, z]) => L.W(nav.place.c, x, z));
      const path = routeThroughAisle(here ? at : null, t, aisle, entry);
      if (at && !here) path.unshift(at);
      me.append(...line(path, null));
    } else if (at) me.append(...line([at, t], '12 9'));
    dot3(t, 15, withAlpha(T.accent, 0.16), T.accent, 3);
    dot3(t, 5, T.accent);
    me.append(
      svg('circle', { cx: t[0], cy: t[1], r: (unit * 15).toFixed(1), fill: withAlpha(T.accent, 0.16), stroke: T.accent, 'stroke-width': 3, 'vector-effect': 'non-scaling-stroke', 'pointer-events': 'none' }),
      svg('circle', { cx: t[0], cy: t[1], r: (unit * 5).toFixed(1), fill: T.accent, 'pointer-events': 'none' }));
  }
  async function startNav(row, key) {
    const spot = spots.get(key);
    if (!row || !spot) return;
    const bar = key.indexOf('|');
    sheet.close();
    indoorPaths = await getIndoorPaths().catch(() => indoorPaths);
    nav = { id: row[0], name: row[1], key, code: key.slice(bar + 1), place: placeBy.get(key.slice(0, bar)), spot };
    chosenBooth = key;
    routeTarget = null;
    navFollow = true;
    three?.chooseBooth(key);
    // 걸을 때 따라오게 위치를 받는다 (안내를 끝내면 같이 끈다).
    if (!following && 'geolocation' in navigator) { FOLLOW_EVERY = 5000; navOwnsFollow = true; startFollow(); }
    // 내 자리를 아직 모르면 띠가 "받는 중"부터 말한다(첫 위치가 오면 바뀐다).
    if (!myPoint(getWhere())) gpsNote = 'geolocation' in navigator ? '위치를 받는 중이다. 위치를 묻는 창이 뜨면 허락한다.' : NO_GPS;
    navKey = '';
    drawMe();
    drawBooths();
    navView();
  }
  function endNav() {
    nav = null;
    routeTarget = null;
    chosenBooth = null;
    navKey = '';
    if (navOwnsFollow) { navOwnsFollow = false; stopFollow('길 안내를 끝냈다. 따라가기도 껐다.'); FOLLOW_EVERY = 20000; }
    drawBooths();
    drawMe();
  }
  // 목적지와 내 자리가 한 화면에 들어오게. 내 자리를 모르면 목적지로.
  function navView(atArg) {
    if (!nav) return;
    const at = atArg || myPoint(getWhere());
    const t = [nav.spot.x, nav.spot.z];
    const bottom = navbar.hidden ? 26 : (navbar.offsetHeight || 96) + 14;
    const where = getWhere();
    const same = at && (!where?.campus || where.campus === nav.place?.c);
    goBox(pad(bbox(same ? [at, t] : [t, t]), same ? 40 : 110), { bottom, ms: 520, side: 64 });
  }
  // 아래 띠: 안내 중이면 목적지 · 남은 거리 · 걷는 시간 · 방향, 아니면 "다음 갈 곳"에서 안내를 시작한다.
  let navKey = '';
  let navMaps = null; // 판에 구글맵 단추가 서 있는 회사(없으면 null)
  function paintNav() {
    if (sheet.state() !== 'closed') { navbar.hidden = true; navKey = ''; navMaps = null; boothForm.hidden = false; mapx.style.removeProperty('--nav-h'); return; }
    const where = getWhere();
    const at = myPoint(where);
    let target = nav;
    let kind = 'nav';
    if (!target) {
      const nx = nextOfDay();
      const pin = nx ? pins.find((p) => p.id === nx.id && !p.seen) : null;
      if (pin) { const b = splitBooth(pin.booth); target = { id: pin.id, name: pin.name, key: `${b.place}|${b.code}`, code: b.code, place: placeBy.get(b.place), spot: { x: pin.x, z: pin.z } }; kind = 'next'; }
    }
    if (!target) { if (!navbar.hidden) { navbar.hidden = true; mapx.style.removeProperty('--nav-h'); } navKey = ''; navMaps = null; boothForm.hidden = false; return; }
    const est = at ? navEstimate(target, where, at) : null;
    // 전시장 밖(라스베이거스 밖이거나 전시장 사이)이면 지도에 내 자리를 찍지 못한다. 그 까닭을 띠에 말한다.
    const outside = !est && where?.by === 'gps' && where.inside === false;
    let sub;
    if (!est && kind === 'nav') sub = gpsNote || (outside ? `전시장 밖이다 · 가장 가까운 전시장까지 약 ${farText(where.meters)}. 전시장에 들어가면 거리 · 분이 나온다` : '가까운 부스 번호를 적는다.');
    else if (!est) sub = `${target.place ? target.place.ko.replace(/ \(.*\)$/, '') : '장소 모름'} · 부스 ${target.code}`;
    else if (est.arrived) sub = `도착했다 · 부스 ${target.code}를 찾는다`;
    else if (!est.sameCampus) sub = `${fmtDistance(est.meters)} · 다른 캠퍼스 · 걸어서 약 ${est.minutes}분 또는 셔틀`;
    else sub = `${fmtDistance(est.meters)} · 걸어서 ${est.minutes}분 · ${est.word}${est.coarse ? ' (대략)' : ' (짐작)'}`;
    const key = [kind, target.id, sub].join('|');
    if (key === navKey && !navbar.hidden) return;
    navKey = key;
    const seen = () => { setInterests(getInterests().map((x) => (x.id === target.id ? { ...x, seen: true } : x))); endNav(); afterInterests(); };
    // 판 안에 다음에 누를 것(2026-11-24, 편의성 점검 6절 2 · 4번). 검정 단추는 판에 하나다.
    //   내 자리를 모를 때(위치를 못 쓰거나 아직 못 받았을 때): "가까운 부스 번호" 칸 + 맞추기
    //   다른 캠퍼스: "구글맵으로 가기" + 글자 단추 "셔틀 보기"
    const needBooth = kind === 'nav' && !est && !outside;
    const far = kind === 'nav' && !!est && !est.arrived && !est.sameCampus;
    const farRoute = kind === 'nav' && (outside || far) && target.place ? mapsLink(places, target.place, 'directions') : null;
    navHead.replaceChildren(el('b', { text: kind === 'nav' ? `→ ${target.name}` : `다음 갈 곳 · ${target.name}` }), el('span', { class: 'nav-sub', text: sub }));
    navForm.hidden = !needBooth;
    // 같은 칸을 두 곳에 두지 않는다: 판에 칸이 있는 동안 아래 "내 위치" 묶음의 칸은 숨긴다. 판의 구글맵도 아래 묶음의 것과 겹치지 않게 한다(drawMe).
    boothForm.hidden = needBooth;
    navMaps = farRoute ? target.id : null;
    navActs.className = far ? 'nav-actions far' : 'nav-actions';
    navActs.replaceChildren(...[
      kind === 'next' ? el('button', { class: 'btn', type: 'button', text: '길 안내', onclick: () => startNav(rows.get(target.id), target.key) }) : null,
      kind === 'nav' && outside ? el('button', { class: 'btn ghost', type: 'button', text: '다시 잡기', onclick: () => gpsButton.click() }) : null,
      farRoute ? out(farRoute, far ? '구글맵으로 가기' : '구글맵', 'btn') : null,
      far ? el('a', { class: 'btn ghost', href: '#/transit', text: '셔틀 보기' }) : null,
      kind === 'nav' && est?.arrived ? el('button', { class: 'btn', type: 'button', text: '다녀왔다', onclick: seen }) : null,
      kind === 'nav' ? el('button', { class: 'btn ghost', type: 'button', text: '끝내기', onclick: endNav }) : null].filter(Boolean));
    navbar.hidden = false;
    requestAnimationFrame(() => mapx.style.setProperty('--nav-h', `${navbar.offsetHeight + 8}px`));
  }

  // ---- 색 칠하기 (지도 아래 묶음)
  const legendBox = el('div', { class: 'legend', 'aria-label': '부스 점의 색' });
  function paintLegend() {
    legendBox.replaceChildren(...legend(colorMode, table || { groups: [] }).map((l) => el('span', { class: 'swatch' }, el('i', { style: `background:${l.color}` }), l.ko)));
    legendBox.hidden = colorMode === 'plain';
  }
  const colorButtons = MODES.map((m) => el('button', { class: 'seg', type: 'button', text: m.k === 'plain' ? '색: 한 색' : m.ko, 'aria-pressed': m.k === colorMode ? 'true' : 'false', onclick: async (ev) => {
    colorMode = m.k;
    save('mapColor.v1', colorMode);
    if (m.k === 'group' && !table) table = await getCategories().catch(() => null);
    colorOf = null;
    for (const b of colorButtons) b.setAttribute('aria-pressed', b === ev.currentTarget ? 'true' : 'false');
    paintLegend();
    drawBooths();
    three?.redraw();
    // 점은 가까이 봐야 찍힌다. 멀리 보고 있으면 알려 준다.
    if (!in3d() && widthOf(view) > BOOTH_DOTS) whereNote.textContent = '부스 점은 지도를 가까이 봐야 찍힌다. 홀을 누르거나 홀 바로 가기를 누른다.';
  } }));
  paintLegend();
  if (colorMode === 'group') getCategories().then((t) => { table = t; colorOf = null; paintLegend(); drawBooths(); }).catch(() => {});

  // ---- 갈 곳 탭에서 온 날: 그 날의 번호만 진하게 보이고, 위에 한 줄로 알린다("1/6 갈 곳 5곳만 보는 중 · 모두 보기").
  const daybar = el('div', { class: 'daybar', hidden: true });
  function paintDayBar() {
    if (dayFocus == null) { daybar.hidden = true; return; }
    const n = pins.filter((p) => p.day === dayFocus).length;
    const ko = dayFocus ? `${((info ? dayByKey(info, dayFocus)?.ko : '') || '').split(' ')[0]} 갈 곳` : '날짜 없는 곳';
    daybar.replaceChildren(
      el('span', { class: 'daybar-text', text: `${ko} ${n}곳만 보는 중` }),
      el('button', { class: 'pick', type: 'button', text: '모두 보기', onclick: () => { dayFocus = null; paintDayBar(); drawPins(); drawMe(); } }));
    daybar.hidden = false;
  }
  // ---- 조립
  const topBar = el('div', { class: 'mapx-top' }, finder.node, chips, daybar);
  const ctls = el('div', { class: 'ctls' }, plus, minus, locate, solid);
  mapx.append(el('h1', { class: 'sr-only', text: '지도' }), frame,
    topBar,
    ctls,
    navbar,
    sheet.node);
  const setHeight = () => {
    const tabs = document.querySelector('.tabs');
    const top = mapx.getBoundingClientRect().top + window.scrollY;
    // 지도 칸은 화면에서 위 머리와 아래 탭을 뺀 만큼. 아래에 다음 묶음이 한 줄쯤 보여 끌어내릴 곳을 남긴다.
    // 카드가 열려 있으면 아래 묶음이 가려지므로 탭 바로 위까지 닿는다
    const peek = mapx.dataset.sheet === 'half' || mapx.dataset.sheet === 'full' ? 8 : 64;
    mapx.style.height = `${Math.max(440, Math.round(window.innerHeight - top - (tabs?.offsetHeight || 68) - peek))}px`;
    mapx.dispatchEvent(new Event('resize-sheet'));
  };
  page.append(mapx,
    el('section', { class: 'panel' },
      el('h2', { text: '지도 보기' }),
      el('div', { class: 'segs', role: 'group', 'aria-label': '부스 점 칠하기' }, colorButtons),
      legendBox,
      el('div', { class: 'actions' }, el('a', { class: 'btn ghost', href: '#/transit', text: '셔틀 · 오가는 법' })),
      el('p', { class: 'note', text: `부스 자리는 짐작이다 (${places.edition}판, 정식 배치도 전). 붉은 테두리는 명함 넣는 부스.` })),
    mePanel);

  board.addEventListener('pointerdown', () => { navFollow = false; }, true);
  gesture = attachGestures(board, { getView: () => view, setView, draw, onSettle: settle, ratio: () => { const s = boardSize(); return s.height / s.width; } });
  const onResize = () => { if (!mapx.isConnected) { window.removeEventListener('resize', onResize); return; } setHeight(); settle(); };
  window.addEventListener('resize', onResize);

  // 화면에 붙은 뒤에야 크기를 알 수 있다.
  requestAnimationFrame(() => {
    setHeight();
    const { width, height } = boardSize();
    view = viewFor(all, width, height, { top: TOP, bottom: 20 });
    draw();
    settle();
    const idle = window.requestIdleCallback || ((f) => setTimeout(f, 300));
    // 관심 회사가 있으면 번호 점을 그리려고 전체 자료를 첫 그림 뒤에 받는다.
    if (getInterests().length) idle(() => { ensureFull().catch(() => {}); });
    // 다른 화면의 "지도" 단추로 왔으면 그 회사로 간다.
    if (rest[0] === 'at' && rest[1]) ensureFull().then(() => { const row = rows.get(rest[1]); const want = rest[2] ? decodeURIComponent(rest[2]) : null; openCompany(row, row && want && row[7].some((b) => boothKey(b) === want) ? want : undefined); }).catch(() => {});
    if (dayFocus != null) ensureFull().then(async () => { info ||= await getInfo().catch(() => null); const list = pins.filter((p) => p.day === dayFocus); paintDayBar(); drawPins(); if (list.length) goBox(pad(bbox(list.map((p) => [p.x, p.z])), 110)); }).catch(() => {});
    if (rest[0] === 'go' && rest[1]) ensureFull().then(() => { const row = rows.get(rest[1]); const b = row?.[7]?.[0]; if (row && b) startNav(row, boothKey(b)); }).catch(() => {});
  });
  page.mapApi = {
    board, mapx, sheet, L, places, pad,
    get view() { return view; },
    get spots() { return spots; },
    get rows() { return rows; },
    get boothEx() { return boothEx; },
    get level() { return levelOf(widthOf(view)); },
    fit: (box) => { const { width, height } = boardSize(); view = viewFor(box, width, height, { top: TOP, bottom: 20 }); draw(); settle(); },
    goBox, flyTo, drawMe, openCompany, startNav, endNav, get nav() { return nav; }, pickPlace, ensureHall, ensureFull, relayout, settle,
  };
  return page;
}
