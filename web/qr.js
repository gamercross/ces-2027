// QR 코드를 폰에서 만든다 (인터넷 없이, 바깥 라이브러리 없이).
// 바이트 방식(UTF-8) · 오류 정정 M · 판 1 ~ 10 (213바이트까지). 명함의 주소 한 줄에는 넉넉하다.

// QR의 바탕과 칸 색은 디자인 토큰(순백 대신 카드색, 검정 대신 남색 글자색). 대비는 13:1 안팎이라 읽힌다.
import { T } from './tokens.js';

// 판마다 [블록 하나의 오류 정정 낱말 수, [블록 수, 블록의 자료 낱말 수] ...] (오류 정정 M)
const BLOCKS = [
  null,
  [10, [1, 16]], [16, [1, 28]], [26, [1, 44]], [18, [2, 32]], [24, [2, 43]],
  [16, [4, 27]], [18, [4, 31]], [22, [2, 38], [2, 39]], [22, [3, 36], [2, 37]], [26, [4, 43], [1, 44]],
];
const ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];
export const MAX_BYTES = 213;

// GF(256) 표 (다항식 0x11d)
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
for (let i = 0, x = 1; i < 255; i++) {
  EXP[i] = x;
  LOG[x] = i;
  x <<= 1;
  if (x & 0x100) x ^= 0x11d;
}
for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
const mul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);

function ecWords(data, count) {
  let gen = [1];
  for (let i = 0; i < count; i++) {
    const next = new Array(gen.length + 1).fill(0);
    for (let j = 0; j < gen.length; j++) {
      next[j] ^= gen[j];
      next[j + 1] ^= mul(gen[j], EXP[i]);
    }
    gen = next;
  }
  const rem = new Array(count).fill(0);
  for (const d of data) {
    const factor = d ^ rem.shift();
    rem.push(0);
    for (let j = 0; j < count; j++) rem[j] ^= mul(gen[j + 1], factor);
  }
  return rem;
}

function dataCapacity(version) {
  const [, ...groups] = BLOCKS[version];
  return groups.reduce((sum, [n, size]) => sum + n * size, 0);
}

function pickVersion(byteLength) {
  for (let v = 1; v <= 10; v++) {
    const header = 4 + (v < 10 ? 8 : 16);
    if (Math.ceil((header + byteLength * 8) / 8) <= dataCapacity(v)) return v;
  }
  throw new Error(`QR에 담기에 너무 길다 (${byteLength}바이트, ${MAX_BYTES}바이트까지)`);
}

// 자료 낱말 + 오류 정정 낱말을 섞어 놓은 차례로 돌려준다.
function codewords(bytes, version) {
  const bits = [];
  const push = (value, length) => { for (let i = length - 1; i >= 0; i--) bits.push((value >> i) & 1); };
  push(0b0100, 4);
  push(bytes.length, version < 10 ? 8 : 16);
  for (const b of bytes) push(b, 8);
  const capacity = dataCapacity(version) * 8;
  push(0, Math.min(4, capacity - bits.length));
  while (bits.length % 8) bits.push(0);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(''), 2));
  for (let pad = 0xec; data.length < capacity / 8; pad ^= 0xec ^ 0x11) data.push(pad);

  const [ecCount, ...groups] = BLOCKS[version];
  const blocks = [];
  let at = 0;
  for (const [n, size] of groups) {
    for (let i = 0; i < n; i++) {
      const d = data.slice(at, at + size);
      at += size;
      blocks.push({ d, e: ecWords(d, ecCount) });
    }
  }
  const out = [];
  const longest = Math.max(...blocks.map((b) => b.d.length));
  for (let i = 0; i < longest; i++) for (const b of blocks) if (i < b.d.length) out.push(b.d[i]);
  for (let i = 0; i < ecCount; i++) for (const b of blocks) out.push(b.e[i]);
  return out;
}

const MASKS = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

function bch(value, generator, bits) {
  let rem = value << bits;
  const top = (n) => 31 - Math.clz32(n);
  while (rem && top(rem) >= top(generator)) rem ^= generator << (top(rem) - top(generator));
  return (value << bits) | rem;
}

function build(words, version, mask) {
  const n = version * 4 + 17;
  const cell = Array.from({ length: n }, () => new Uint8Array(n));
  const fixed = Array.from({ length: n }, () => new Uint8Array(n));
  const set = (r, c, on) => { cell[r][c] = on ? 1 : 0; fixed[r][c] = 1; };

  const finder = (r0, c0) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const rr = r0 + r, cc = c0 + c;
        if (rr < 0 || cc < 0 || rr >= n || cc >= n) continue;
        const ring = r >= 0 && r <= 6 && c >= 0 && c <= 6 && (r === 0 || r === 6 || c === 0 || c === 6);
        const core = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        set(rr, cc, ring || core);
      }
    }
  };
  finder(0, 0); finder(0, n - 7); finder(n - 7, 0);
  for (let i = 8; i < n - 8; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  const centers = ALIGN[version];
  for (const r of centers) {
    for (const c of centers) {
      // 위치 찾기 무늬 셋과 겹치는 자리만 건너뛴다 (타이밍 줄 위에는 놓는다).
      if ((r === 6 && c === 6) || (r === 6 && c === n - 7) || (r === n - 7 && c === 6)) continue;
      for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) set(r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
    }
  }
  set(n - 8, 8, true);

  // 꼴 정보 (오류 정정 M = 00, 가림 번호 3비트)
  const format = bch(mask, 0x537, 10) ^ 0x5412;
  for (let i = 0; i < 15; i++) {
    const on = (format >> i) & 1;
    if (i < 6) set(i, 8, on); else if (i < 8) set(i + 1, 8, on); else set(n - 15 + i, 8, on);
    if (i < 8) set(8, n - 1 - i, on); else if (i < 9) set(8, 15 - i, on); else set(8, 14 - i, on);
  }
  if (version >= 7) {
    const info = bch(version, 0x1f25, 12);
    for (let i = 0; i < 18; i++) {
      const on = (info >> i) & 1;
      set(Math.floor(i / 3), n - 11 + (i % 3), on);
      set(n - 11 + (i % 3), Math.floor(i / 3), on);
    }
  }

  // 자료를 오른쪽 아래부터 지그재그로 놓는다.
  let bit = 0;
  let up = true;
  for (let col = n - 1; col > 0; col -= 2) {
    if (col === 6) col -= 1;
    for (let i = 0; i < n; i++) {
      const r = up ? n - 1 - i : i;
      for (const c of [col, col - 1]) {
        if (fixed[r][c]) continue;
        const word = words[bit >> 3];
        let on = word !== undefined && ((word >> (7 - (bit & 7))) & 1) === 1;
        bit += 1;
        if (MASKS[mask](r, c)) on = !on;
        cell[r][c] = on ? 1 : 0;
      }
    }
    up = !up;
  }
  return cell;
}

// 읽기 나쁜 모양에 벌점을 준다 (표준의 네 규칙).
function penalty(cell) {
  const n = cell.length;
  let score = 0;
  for (let pass = 0; pass < 2; pass++) {
    for (let a = 0; a < n; a++) {
      let run = 1;
      for (let b = 1; b <= n; b++) {
        const same = b < n && (pass ? cell[b][a] === cell[b - 1][a] : cell[a][b] === cell[a][b - 1]);
        if (same) { run += 1; continue; }
        if (run >= 5) score += run - 2;
        run = 1;
      }
      const line = [];
      for (let b = 0; b < n; b++) line.push(pass ? cell[b][a] : cell[a][b]);
      const s = line.join('');
      for (const pattern of ['10111010000', '00001011101']) {
        for (let at = s.indexOf(pattern); at !== -1; at = s.indexOf(pattern, at + 1)) score += 40;
      }
    }
  }
  let dark = 0;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      dark += cell[r][c];
      if (r < n - 1 && c < n - 1 && cell[r][c] === cell[r][c + 1] && cell[r][c] === cell[r + 1][c] && cell[r][c] === cell[r + 1][c + 1]) score += 3;
    }
  }
  score += Math.floor(Math.abs((dark * 100) / (n * n) - 50) / 5) * 10;
  return score;
}

// 글을 QR 칸(1 = 어두움)으로 바꾼다. mask를 주면 그 가림을 쓴다(시험용).
export function qrCells(text, mask) {
  const bytes = new TextEncoder().encode(text);
  const version = pickVersion(bytes.length);
  const words = codewords(bytes, version);
  if (mask !== undefined) return build(words, version, mask);
  let best = null;
  for (let m = 0; m < 8; m++) {
    const cell = build(words, version, m);
    const score = penalty(cell);
    if (!best || score < best.score) best = { cell, score };
  }
  return best.cell;
}

// SVG 그림으로 만든다. 둘레에 네 칸 여백을 둔다. 읽히도록 흰 바탕에 짙은 칸을 쓴다.
export function qrSvg(text, label) {
  const cell = qrCells(text);
  const n = cell.length;
  const quiet = 4;
  const size = n + quiet * 2;
  let path = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!cell[r][c]) continue;
      let run = 1;
      while (c + run < n && cell[r][c + run]) run += 1;
      path += `M${c + quiet} ${r + quiet}h${run}v1h-${run}z`;
      c += run - 1;
    }
  }
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', label || 'QR 코드');
  svg.setAttribute('shape-rendering', 'crispEdges');
  const bg = document.createElementNS(ns, 'rect');
  bg.setAttribute('width', size);
  bg.setAttribute('height', size);
  bg.setAttribute('fill', T.panel);
  const fg = document.createElementNS(ns, 'path');
  fg.setAttribute('d', path);
  fg.setAttribute('fill', T.ink);
  svg.append(bg, fg);
  return svg;
}
