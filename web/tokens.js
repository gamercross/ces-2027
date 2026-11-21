// 지도를 캔버스 · SVG로 그리는 코드가 쓰는 색. 값의 원본은 tokens.css다.
// 브라우저에서는 tokens.css에서 읽고, Node(시험)에서는 아래 기본값을 쓴다.
// 기본값은 tokens.css와 한 글자도 다르면 안 된다 (scripts/smoke.mjs가 맞춰 본다).

export const DEFAULTS = {
  bg: ['--bg', '#e9edf4'], panel: ['--panel', '#f4f1ea'], panel2: ['--panel-2', '#dfe7f1'],
  ink: ['--ink', '#1f2a44'], ink2: ['--ink-2', '#4b5878'], accent: ['--accent', '#56679a'],
  mint: ['--mint', '#cfe6dc'], warn: ['--warn', '#8a3b2f'],
  hall: ['--map-hall', '#c9d6ee'], room: ['--map-room', '#e2dcef'], out: ['--map-out', '#d9e6dc'], hotel: ['--map-hotel', '#ecdccb'],
  place: ['--map-place', '#dde3ee'], road: ['--map-road', '#cfd6e2'], decor: ['--map-decor', '#dfe3ea'], link: ['--map-link', '#8fa3c8'],
  plain: ['--map-plain', '#9aa9cc'], none: ['--map-none', '#c5cad3'],
  badge: ['--map-badge', '#8a6fb3'], shuttle: ['--map-shuttle', '#3f8f86'], transit: ['--map-transit', '#6b7896'], city: ['--map-city', '#f0b08a'],
  korea: ['--map-korea', '#e88f8f'], best: ['--map-best', '#dfa544'], honoree: ['--map-honoree', '#f0d98c'],
  day0: ['--day-0', '#b9c0cf'], day1: ['--day-1', '#f4b9a7'], day2: ['--day-2', '#a9c6ee'], day3: ['--day-3', '#a8d8bf'], day4: ['--day-4', '#f1d38a'],
  gAi: ['--group-ai', '#8fa8e6'], gMob: ['--group-mob', '#f0b08a'], gRob: ['--group-rob', '#e79a9a'], gHea: ['--group-hea', '#9ed3ab'],
  gHom: ['--group-hom', '#e9cf7c'], gEnt: ['--group-ent', '#c3a2df'], gBiz: ['--group-biz', '#93cdd3'],
};

const style = typeof document !== 'undefined' && document.documentElement ? getComputedStyle(document.documentElement) : null;
export const T = Object.fromEntries(Object.entries(DEFAULTS).map(([k, [name, base]]) => [k, (style && style.getPropertyValue(name).trim()) || base]));

// 날짜별 색 (미정 · 1/6 · 1/7 · 1/8 · 1/9)
export const DAY_COLORS = [T.day0, T.day1, T.day2, T.day3, T.day4];
// 분야 묶음 일곱 (data/categories.json의 groups 기호)
export const GROUP_COLORS = { ai: T.gAi, mob: T.gMob, rob: T.gRob, hea: T.gHea, hom: T.gHom, ent: T.gEnt, biz: T.gBiz };

// #rrggbb → [r, g, b] (3D 지도가 면마다 어둡게 칠할 때)
export const rgbOf = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
// #rrggbb + 투명도 → 'rgba(…)'
export const withAlpha = (hex, a) => `rgba(${rgbOf(hex).join(',')},${a})`;
