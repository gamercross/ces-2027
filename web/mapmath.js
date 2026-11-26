// 지도의 셈: 확대 단계 · 보는 칸 옮기기 · 글자 자리 정하기. 화면과 따로 두어 Node에서도 시험한다 (scripts/smoke.mjs).
// 보는 칸(view)은 세계 좌표의 [x0, z0, x1, z1]이고, 화면 한 칸(px)이 세계 몇 칸인지가 unit이다.

// 확대 단계 셋: 캠퍼스 셋(멀리) → 홀 → 부스(가까이). 칸 너비(w, 실제 미터)가 기준이다. 홀 하나는 300 ~ 550m라 홀 칩은 홀 단계, 더 가까이(330m 아래) 가면 부스 단계.
export const LEVEL_HALL = 1300;
export const LEVEL_BOOTH = 330;
export const BOOTH_DOTS = 360;
export const MIN_W = 90;
export const MAX_W = 3800;
export const MIN_FONT = 13;

export const levelOf = (w) => (w >= LEVEL_HALL ? 'campus' : w >= LEVEL_BOOTH ? 'hall' : 'booth');

export const widthOf = (view) => view[2] - view[0];

// 화면 비율에 맞게 칸을 넓혀서 box가 다 보이게 한다.
export function fitBox(box, ratio) {
  let [x0, z0, x1, z1] = box;
  const w = x1 - x0, h = z1 - z0;
  if (h / w > ratio) { const grow = (h / ratio - w) / 2; x0 -= grow; x1 += grow; } else { const grow = (w * ratio - h) / 2; z0 -= grow; z1 += grow; }
  return [x0, z0, x1, z1];
}

const clampW = (w, lo = MIN_W, hi = MAX_W) => Math.min(hi, Math.max(lo, w));

// 한 점(px, pz)을 그대로 둔 채 칸을 factor배로(1보다 작으면 가까이) 바꾼다. 너비는 한계 안에 둔다.
export function zoomBox(view, factor, px, pz) {
  const w = widthOf(view);
  const f = clampW(w * factor) / w;
  return [px - (px - view[0]) * f, pz - (pz - view[1]) * f, px + (view[2] - px) * f, pz + (view[3] - pz) * f];
}

export const panBox = (view, dx, dz) => [view[0] + dx, view[1] + dz, view[2] + dx, view[3] + dz];

// 두 칸 사이를 t(0 ~ 1)만큼 지난 칸. 너비는 곱셈으로 섞어 확대가 고르게 느껴지게 한다.
export function mixBox(a, b, t) {
  const wa = widthOf(a), wb = widthOf(b), ha = a[3] - a[1], hb = b[3] - b[1];
  const w = wa * (wb / wa) ** t, h = ha * (hb / ha) ** t;
  const cx = (a[0] + a[2]) / 2 + ((b[0] + b[2]) / 2 - (a[0] + a[2]) / 2) * t;
  const cz = (a[1] + a[3]) / 2 + ((b[1] + b[3]) / 2 - (a[1] + a[3]) / 2) * t;
  return [cx - w / 2, cz - h / 2, cx + w / 2, cz + h / 2];
}
export const easeOut = (t) => 1 - (1 - t) ** 3;

// 글자 하나의 너비(px)를 어림한다: 한글 · 한자는 한 칸, 영문 대문자 0.66, 숫자 0.6, 그 밖 0.56.
export function textWidth(text, px) {
  let n = 0;
  for (const ch of String(text)) {
    const c = ch.codePointAt(0);
    n += c >= 0x1100 ? 1 : /[A-Z]/.test(ch) ? 0.66 : /\d/.test(ch) ? 0.6 : ch === ' ' ? 0.32 : 0.56;
  }
  return n * px;
}

// 긴 이름을 자른다 (글자 수 기준).
export const clip = (text, max) => { const s = String(text); return [...s].length > max ? `${[...s].slice(0, max - 1).join('')}…` : s; };

// 글자 자리 정하기: 먼저 온 것(prio가 큰 것)부터 놓고, 이미 놓은 것과 겹치거나 화면 밖으로 나가면 숨긴다.
// cands: [{ id, x, y, text, alts?, size, prio, anchor: 'middle' | 'start', dx, dy, flip? }] (x · y는 화면 px). alts는 text가 안 들어갈 때 쓸 더 짧은 글.
// flip이 있으면 오른쪽(start)에 안 들어갈 때 왼쪽에 놓아 본다(놓인 글자의 side가 'left'가 된다).
// blocked: 글자를 놓으면 안 되는 칸들 [[x0, y0, x1, y1]] (3D 지도의 갈 곳 번호 · 화면 단추).
// 돌려주는 것: 놓은 글자들 [{ ...cand, rect: [x0, y0, x1, y1] }]
export function layoutLabels(cands, bounds, { pad = 3, max = 160, cell = 48, blocked = [] } = {}) {
  const order = [...cands].sort((a, b) => b.prio - a.prio);
  const grid = new Map();
  const out = [];
  const keep = (rect) => { for (let gx = Math.floor(rect[0] / cell); gx <= Math.floor(rect[2] / cell); gx++) for (let gy = Math.floor(rect[1] / cell); gy <= Math.floor(rect[3] / cell); gy++) { const k = `${gx},${gy}`; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(rect); } };
  for (const rect of blocked) keep(rect);
  const fits = (rect) => {
    if (rect[0] < 2 || rect[1] < 2 || rect[2] > bounds.width - 2 || rect[3] > bounds.height - 2) return false;
    for (let gx = Math.floor(rect[0] / cell); gx <= Math.floor(rect[2] / cell); gx++) {
      for (let gy = Math.floor(rect[1] / cell); gy <= Math.floor(rect[3] / cell); gy++) {
        for (const o of grid.get(`${gx},${gy}`) || []) if (rect[0] < o[2] && o[0] < rect[2] && rect[1] < o[3] && o[1] < rect[3]) return false;
      }
    }
    return true;
  };
  for (const c of order) {
    if (out.length >= max) break;
    // 긴 글이 안 들어가면 짧은 글(alts)로 한 번 더 해 본다. 그래도 안 되면(flip) 왼쪽에 놓아 본다.
    const tries = [c.text, ...(c.alts || [])].map((text) => [text, false]);
    if (c.flip && c.anchor === 'start') tries.push([c.text, true]);
    for (const [text, left] of tries) {
      const w = textWidth(text, c.size);
      const h = c.size * 1.25;
      const y = c.y + (c.dy || 0);
      const x0 = left ? c.x - (c.dx || 0) - w : c.anchor === 'start' ? c.x + (c.dx || 0) : c.x + (c.dx || 0) - w / 2;
      const rect = [x0 - pad, y - h / 2 - pad, x0 + w + pad, y + h / 2 + pad];
      if (!fits(rect)) continue;
      out.push(left ? { ...c, text, rect, side: 'left' } : { ...c, text, rect });
      keep(rect);
      break;
    }
  }
  return out;
}

// box가 화면의 "보이는 칸"(위 top px · 아래 bottom px · 양옆 side px를 뺀 곳) 안에 다 들어오게 하는 보는 칸.
// W · H는 지도 화면 크기(px). 위에는 찾기 칸 · 아래에는 카드가 덮으니, 그 둘을 피해 가운데에 놓는다.
export function viewFor(box, W, H, { top = 0, bottom = 0, side = 12 } = {}) {
  const bw = Math.max(1, box[2] - box[0]), bh = Math.max(1, box[3] - box[1]);
  const visH = Math.max(60, H - top - bottom);
  const unit = Math.max(bw / Math.max(60, W - 2 * side), bh / visH);
  const cx = (box[0] + box[2]) / 2, cz = (box[1] + box[3]) / 2;
  const w = unit * W, h = unit * H;
  const centerY = top + visH / 2;
  return [cx - w / 2, cz - centerY * unit, cx + w / 2, cz - centerY * unit + h];
}
