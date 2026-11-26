// 지도를 캔버스 · SVG로 그리는 코드가 쓰는 색. 값의 원본은 tokens.css다.
// 브라우저에서는 tokens.css에서 읽고, Node(시험)에서는 아래 기본값을 쓴다.
// 기본값은 tokens.css와 한 글자도 다르면 안 된다 (scripts/smoke.mjs가 맞춰 본다).

export const DEFAULTS = {
  bg: ['--bg', '#f2f2f2'], panel: ['--panel', '#ffffff'], panel2: ['--panel-2', '#ebebeb'],
  ink: ['--ink', '#111111'], ink2: ['--ink-2', '#5c5c5c'], accent: ['--accent', '#5a6f96'],
  mint: ['--mint', '#e8ecf3'], warn: ['--warn', '#a3342a'],
  qrBg: ['--qr-bg', '#ffffff'], qrInk: ['--qr-ink', '#111111'], wallBg: ['--wall-bg', '#2b2b2b'], wallInk: ['--wall-ink', '#000000'],
  hall: ['--map-hall', '#d8d8d8'], room: ['--map-room', '#e3e3e3'], out: ['--map-out', '#e9e9e9'], hotel: ['--map-hotel', '#dedede'],
  place: ['--map-place', '#e6e6e6'], road: ['--map-road', '#cfcfcf'], decor: ['--map-decor', '#ececec'], link: ['--map-link', '#a0a0a0'],
  plain: ['--map-plain', '#8f8f8f'], none: ['--map-none', '#c9c9c9'],
  badge: ['--map-badge', '#5f5f5f'], shuttle: ['--map-shuttle', '#3d3d3d'], transit: ['--map-transit', '#7a7a7a'], city: ['--map-city', '#b4b4b4'],
  korea: ['--map-korea', '#5a6f96'], best: ['--map-best', '#5a6f96'], honoree: ['--map-honoree', '#9fb0cf'],
  day0: ['--day-0', '#c4c4c4'], day1: ['--day-1', '#c6d0e3'], day2: ['--day-2', '#a5b5d2'], day3: ['--day-3', '#869bc0'], day4: ['--day-4', '#6f87b3'], day5: ['--day-5', '#dbe1ee'],
  gAi: ['--group-ai', '#94a7c9'], gMob: ['--group-mob', '#c9a48b'], gRob: ['--group-rob', '#c99496'], gHea: ['--group-hea', '#9dbba5'],
  gHom: ['--group-hom', '#cdbd85'], gEnt: ['--group-ent', '#b4a0c8'], gBiz: ['--group-biz', '#8fb8bc'],
};

const style = typeof document !== 'undefined' && document.documentElement ? getComputedStyle(document.documentElement) : null;
export const T = Object.fromEntries(Object.entries(DEFAULTS).map(([k, [name, base]]) => [k, (style && style.getPropertyValue(name).trim()) || base]));

// 날짜별 색 (미정 · 1/6 · 1/7 · 1/8 · 1/9 · 1/5 사전 일정)
export const DAY_COLORS = [T.day0, T.day1, T.day2, T.day3, T.day4, T.day5];
// 분야 묶음 일곱 (data/categories.json의 groups 기호)
export const GROUP_COLORS = { ai: T.gAi, mob: T.gMob, rob: T.gRob, hea: T.gHea, hom: T.gHom, ent: T.gEnt, biz: T.gBiz };

// #rrggbb → [r, g, b] (3D 지도가 면마다 어둡게 칠할 때)
export const rgbOf = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
// #rrggbb + 투명도 → 'rgba(…)'
export const withAlpha = (hex, a) => `rgba(${rgbOf(hex).join(',')},${a})`;

// 글자 크기 단계가 지도 글자에 주는 배율(1 ~ 1.3). 지도는 캔버스 · SVG라 CSS 글자를 따르지 않아 불러올 때 읽는다.
export function mapScale() {
  if (typeof document === 'undefined' || !document.documentElement) return 1;
  const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--scale-map'));
  return Number.isFinite(v) && v >= 1 && v <= 1.5 ? v : 1;
}
