// 내 명함 QR을 잠금 화면 배경 그림으로 만든다(R60). 담는 것은 QR 하나와 별명 한 줄뿐이다.
// 폰에서 그린다(인터넷 없이, 바깥 라이브러리 없이). QR은 명함 화면과 같은 길(qr.js)로 만든다.
// 화면 색(밝게 · 어둡게)과 상관없이 QR은 늘 검정 칸 · 흰 바탕이다: 어느 카메라로도 잘 읽히게.

import { qrCells } from './qr.js';
import { T } from './tokens.js';

// 그림의 색(tokens.css): 무채색 바탕 + 흰 카드 + 검정 QR. 잠금 화면의 흰 시계가 잘 보이게 바탕은 짙은 회색이다. 밝게 · 어둡게 모두 같다.
export const PAPER = { bg: T.wallBg, card: T.qrBg, ink: T.wallInk };

// 그림 크기: 이 폰 화면의 너비 · 높이 × 기기 픽셀 비율(아이폰 15 = 393 × 852 × 3 = 1179 × 2556).
// 가로로 돌려 둔 때에도 세로 그림을 만든다. 너무 크면(긴 변 4096 넘게) 비율을 지켜 줄인다.
export function wallSize(w, h, dpr) {
  let W = Math.round(Math.min(w, h) * (dpr || 1));
  let H = Math.round(Math.max(w, h) * (dpr || 1));
  if (!(W > 0 && H > 0)) { W = 1179; H = 2556; }
  const k = Math.min(1, 4096 / H);
  return { w: Math.round(W * k), h: Math.round(H * k) };
}

// 자리 셈(그리지 않고 수만): 잠금 화면의 시계(위 40%)와 손전등 · 카메라 단추(아래 14%)를 피해 그 사이 가운데에 카드를 둔다.
// QR 한 칸은 정수 픽셀(흐려지지 않게), 둘레 흰 여백은 QR 칸 다섯 개 이상(표준은 넷).
// 돌려주는 것: { card: {x, y, w, h}, qr: {x, y, size, cell, n}, quiet, nick: {x, y, size, maxWidth}, safe: {top, bottom} }
export function wallLayout(W, H, n) {
  const safe = { top: Math.round(H * 0.40), bottom: Math.round(H * 0.86) };
  const room = safe.bottom - safe.top;
  // QR 넓이: 폭의 56%, 남은 높이의 60%를 넘지 않게.
  const want = Math.min(W * 0.56, room * 0.6);
  const cell = Math.max(1, Math.floor(want / n));
  const size = cell * n;
  const quiet = Math.max(cell * 5, Math.round(W * 0.06));
  const nickSize = Math.max(16, Math.round(W * 0.055));
  const gap = Math.round(nickSize * 0.4);
  const cardW = size + quiet * 2;
  const cardH = quiet + size + gap + Math.round(nickSize * 1.3) + Math.round(quiet * 0.8);
  const x = Math.round((W - cardW) / 2);
  const y = Math.round(safe.top + (room - cardH) / 2);
  return {
    card: { x, y, w: cardW, h: cardH },
    qr: { x: x + quiet, y: y + quiet, size, cell, n },
    quiet,
    nick: { x: W / 2, y: y + quiet + size + gap + Math.round(nickSize * 0.65), size: nickSize, maxWidth: size },
    safe,
  };
}

// 캔버스에 그린다. ctx는 2D 그리기 판, text는 QR에 담는 글(명함 QR과 같다), nick은 별명.
export function drawWallpaper(ctx, W, H, text, nick) {
  const cells = qrCells(text);
  const L = wallLayout(W, H, cells.length);
  ctx.fillStyle = PAPER.bg;
  ctx.fillRect(0, 0, W, H);
  const r = Math.round(L.quiet * 0.35);
  ctx.fillStyle = PAPER.card;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(L.card.x, L.card.y, L.card.w, L.card.h, r);
  else ctx.rect(L.card.x, L.card.y, L.card.w, L.card.h);
  ctx.fill();
  ctx.fillStyle = PAPER.ink;
  const { x, y, cell } = L.qr;
  for (let row = 0; row < cells.length; row++) {
    for (let c = 0; c < cells.length; c++) {
      if (!cells[row][c]) continue;
      let run = 1;
      while (c + run < cells.length && cells[row][c + run]) run += 1;
      ctx.fillRect(x + c * cell, y + row * cell, run * cell, cell);
      c += run - 1;
    }
  }
  // 별명 한 줄: QR 폭 안에 들지 않으면 글자를 줄이고, 그래도 길면 끝을 … 로.
  let size = L.nick.size;
  const font = (s) => `700 ${s}px -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif`;
  ctx.font = font(size);
  while (size > L.nick.size * 0.6 && ctx.measureText(nick).width > L.nick.maxWidth) { size -= 2; ctx.font = font(size); }
  let line = nick;
  while (line.length > 1 && ctx.measureText(line).width > L.nick.maxWidth) line = line.slice(0, -1);
  if (line !== nick) line = `${line.slice(0, -1)}…`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(line, L.nick.x, L.nick.y);
  return L;
}

// 그림 파일(PNG)을 만든다. 돌려주는 것: { blob, w, h }
export async function wallpaperBlob(text, nick, screenW, screenH, dpr) {
  const { w, h } = wallSize(screenW, screenH, dpr);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  drawWallpaper(canvas.getContext('2d'), w, h, text, nick);
  const blob = await new Promise((ok, bad) => canvas.toBlob((b) => (b ? ok(b) : bad(new Error('그림을 만들지 못했다'))), 'image/png'));
  return { blob, w, h };
}

// 건넨다: 폰의 공유 창이 되면 그 창으로(아이폰은 "이미지 저장"으로 사진에 들어간다), 안 되면 내려받기.
// 돌려주는 것: 'shared' · 'cancel'(공유 창을 닫았다) · 'saved'(내려받았다)
export async function handImage(blob, name) {
  try {
    const file = new File([blob], name, { type: 'image/png' });
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
        return 'shared';
      } catch (e) {
        if (e?.name === 'AbortError') return 'cancel';
      }
    }
  } catch { /* 공유 창이 없는 폰: 내려받기로 */ }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'saved';
}
