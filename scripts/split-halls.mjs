// 전시사 자료(exhibitors.json)를 홀마다 나눈다: data/halls/<장소>.json = 그 장소에 부스가 있는 회사 줄 + 같은 설명(분야 · 나라 · 링크).
// 지도는 첫 화면에 전시사 자료를 다 받지 않고, 홀로 가까이 갈 때 그 홀의 것만 받는다 (찾기 · 관심 회사는 전체를 쓴다).
// 쓰는 법: node scripts/split-halls.mjs dist   (전시사 자료가 없는 날에는 아무것도 하지 않는다)

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const dist = process.argv[2] || 'dist';
const file = join(dist, 'data/exhibitors.json');
const text = await readFile(file, 'utf8').catch(() => null);
if (!text) {
  console.log('전시사 자료가 없어 홀로 나누지 않았다.');
  process.exit(0);
}
const { ex, ...meta } = JSON.parse(text);
const byPlace = new Map();
for (const row of ex) {
  const seen = new Set();
  for (const booth of row[7]) {
    const place = booth.slice(booth.lastIndexOf('@') + 1);
    if (!place || seen.has(place)) continue;
    seen.add(place);
    if (!byPlace.has(place)) byPlace.set(place, []);
    byPlace.get(place).push(row);
  }
}
const dir = join(dist, 'data/halls');
await mkdir(dir, { recursive: true });
const counts = {};
let bytes = 0;
for (const [place, rows] of byPlace) {
  if (!/^[A-Za-z0-9_]+$/.test(place)) continue;
  const out = JSON.stringify({ ...meta, hall: place, ex: rows });
  bytes += out.length;
  counts[place] = rows.length;
  await writeFile(join(dir, `${place}.json`), out);
}
await writeFile(join(dir, 'index.json'), JSON.stringify({ v: meta.v, halls: counts }));
console.log(`홀 ${Object.keys(counts).length}곳으로 나눴다 (합계 ${(bytes / 1024).toFixed(0)} KB, 전체 ${(text.length / 1024).toFixed(0)} KB)`);
