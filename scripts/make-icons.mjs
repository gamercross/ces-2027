// 홈 화면 아이콘을 만든다 (바깥 도구 없이). 쓰는 법: node scripts/make-icons.mjs
// 코디세이 아이콘이 아니다. 중립 그림이다: 파스텔 바탕에 남색 위치 표시.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const BG = [226, 220, 239];
const INK = [31, 42, 68];
const DOT = [244, 220, 203];

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, tail]);
}

// 위치 표시(물방울 꼴) 안에 있나. 좌표는 0 ~ 1.
function inPin(x, y) {
  const cx = 0.5, cy = 0.42, r = 0.2;
  if (Math.hypot(x - cx, y - cy) <= r) return true;
  // 아래 꼬리: 원의 아래쪽에서 (0.5, 0.78)로 모이는 세모.
  if (y > cy && y <= 0.78) {
    const half = r * 0.92 * (1 - (y - cy) / (0.78 - cy));
    return Math.abs(x - cx) <= half;
  }
  return false;
}

function png(size) {
  const ss = 4;
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let py = 0; py < size; py++) {
    raw[py * (size * 3 + 1)] = 0;
    for (let px = 0; px < size; px++) {
      let ink = 0, dot = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const x = (px + (sx + 0.5) / ss) / size, y = (py + (sy + 0.5) / ss) / size;
          if (Math.hypot(x - 0.5, y - 0.42) <= 0.085) dot += 1; else if (inPin(x, y)) ink += 1;
        }
      }
      const a = ink / (ss * ss), d = dot / (ss * ss), b = 1 - a - d;
      const at = py * (size * 3 + 1) + 1 + px * 3;
      for (let i = 0; i < 3; i++) raw[at + i] = Math.round(BG[i] * b + INK[i] * a + DOT[i] * d);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

mkdirSync('web/icon', { recursive: true });
for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  writeFileSync(`web/icon/${name}`, png(size));
  console.log(`web/icon/${name} ${size}px`);
}
