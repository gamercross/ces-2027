// 정식 배치도에서 얻은 부스 좌표를 data/booth-spots.json에 넣는다 (먼저 보기만 하고, --write를 줘야 쓴다).
// 쓰는 법:
//   node scripts/import-booth-spots.mjs 입력.json                      (보기만: 몇 개가 들어가고 몇 개가 모자라고 몇 개가 어긋나는지)
//   node scripts/import-booth-spots.mjs 입력.json --write              (data/booth-spots.json에 합친다)
//   node scripts/import-booth-spots.mjs 입력.json --write --official   (그 장소의 부스를 다 넣었으면 places.json의 boothSpots도 official로)
//   옵션: --swap(x · y가 바뀐 배치도) --flipx --flipy(방향이 거꾸로) --exhibitors 전시사.json(모자라는 부스를 세려면)
// 입력.json: { "place": "LVCC_S3", "source": "배치도 주소", "edition": "받은 날짜", "plan": { "bbox": [x0, y0, x1, y1] }(선택), "booths": { "40112": [x, y], … } }
// 좌표는 배치도 그림의 값 그대로 두면 된다. 장소의 모양(poly) 상자에 맞춰 늘이고 옮긴다. 배치도의 꼴이 이 입력과 다르면 그 꼴을 이 입력으로 바꾸는 작은 변환을 먼저 한다.

import { readFile, writeFile } from 'node:fs/promises';
import { convert, coverage, markOfficial, merge } from './floorplan-lib.mjs';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const flag = (n) => args.includes(`--${n}`);
if (!file) { console.error('입력 파일이 있어야 한다. 위 쓰는 법을 본다.'); process.exit(1); }
const input = JSON.parse(await readFile(file, 'utf8'));
const placesText = await readFile('data/places.json', 'utf8');
const places = JSON.parse(placesText);
const place = places.places.find((p) => p.k === input.place);
if (!place) { console.error(`장소 ${input.place}가 data/places.json에 없다.`); process.exit(1); }

const { spots, outside, box } = convert(input, place, { swap: flag('swap'), flipX: flag('flipx'), flipY: flag('flipy') });
const n = Object.keys(spots).length;
console.log(`${place.ko}: 배치도 부스 ${n}개를 장소 상자 [${box?.map(Math.round).join(', ')}]에 맞췄다.`);
if (outside.length) console.log(`  장소 상자에서 10% 넘게 벗어난 것 ${outside.length}개(${outside.slice(0, 8).join(', ')}${outside.length > 8 ? ' …' : ''}). 방향(--swap · --flipx · --flipy)이 맞는지 본다.`);

let covered = null;
const exFile = args[args.indexOf('--exhibitors') + 1];
if (args.includes('--exhibitors') && exFile) {
  const ex = JSON.parse(await readFile(exFile, 'utf8'));
  const booths = ex.ex.flatMap((r) => r[7]).filter((b) => b.endsWith(`@${place.k}`)).map((b) => b.slice(0, b.lastIndexOf('@')));
  covered = coverage(booths, spots);
  console.log(`  전시사 부스 ${covered.total}개 가운데 정식 자리가 있는 것 ${covered.have}개, 모자란 것 ${covered.missing.length}개${covered.missing.length ? ` (${covered.missing.slice(0, 8).join(', ')}${covered.missing.length > 8 ? ' …' : ''})` : ''}.`);
}
if (!flag('write')) { console.log('보기만 했다. 합치려면 --write를 붙인다.'); process.exit(outside.length > n * 0.2 ? 2 : 0); }
if (outside.length > n * 0.2) { console.error('벗어난 것이 20%를 넘어 쓰지 않았다. 방향을 먼저 맞춘다.'); process.exit(2); }

const spotsFile = 'data/booth-spots.json';
const merged = merge(JSON.parse(await readFile(spotsFile, 'utf8')), place.k, spots, { edition: input.edition, source: input.source });
await writeFile(spotsFile, `${JSON.stringify(merged, null, 2)}\n`);
console.log(`${spotsFile}에 ${place.k} ${n}개를 합쳤다.`);
if (flag('official')) {
  if (!covered || covered.missing.length) { console.error('--official은 전시사 부스를 다 채웠을 때만 쓴다(--exhibitors로 세어 본다). places.json은 바꾸지 않았다.'); process.exit(3); }
  const next = markOfficial(placesText, place.k);
  if (!next) console.error('places.json에서 이 장소의 boothSpots를 못 찾았다(이미 official일 수 있다).');
  else { await writeFile('data/places.json', next); console.log(`data/places.json: ${place.k}의 boothSpots를 official로 바꿨다. 이제 화면의 "자리 짐작"이 이 장소에서는 공식 배치도로 바뀐다.`); }
}
console.log('다음: cargo run -p ces-data -- check-places 와 node scripts/smoke.mjs <지은 폴더>를 돌린다.');
