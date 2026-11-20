// 지은 것(dist)을 폰이 쓰는 그대로 읽어 본다: 첫 화면, 코어(core.wasm), 자료, 찾기.
// 쓰는 법: node scripts/smoke.mjs dist
// 전시사 자료가 없으면(공식 사이트에서 받지 못한 날) 코어만 지어낸 색인으로 본다.

import { readFile, appendFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { loadCore } from '../web/core.js';

const dist = process.argv[2] || 'dist';
const lines = [];
let failed = 0;
function check(ok, what) {
  lines.push(`${ok ? '됨' : '안 됨'} | ${what}`);
  if (!ok) failed += 1;
}
const exists = (p) => stat(join(dist, p)).then(() => true, () => false);
const json = async (p) => JSON.parse(await readFile(join(dist, p), 'utf8'));

const html = await readFile(join(dist, 'index.html'), 'utf8');
check(html.includes('글로벌 어학연수') && html.includes('비공식'), '첫 화면에 이름과 "비공식"이 있다');
check(!/[?&]key=/.test(html), '첫 화면에 API 키 자리가 없다');

const wasm = await readFile(join(dist, 'core.wasm'));
const core = await loadCore(wasm);
check(true, `코어를 읽었다 (core.wasm ${(wasm.length / 1024).toFixed(1)} KB)`);

// 명함 QR: 다른 QR 구현과 칸마다 맞춰 본 값(2026-11-20)에서 바뀌지 않았는지 본다.
const { qrCells } = await import('../web/qr.js');
const print = (text) => {
  const cells = qrCells(text);
  let x = 2166136261;
  for (const row of cells) for (const v of row) { x ^= v; x = Math.imul(x, 16777619) >>> 0; }
  return `${cells.length}:${x.toString(16)}`;
};
const QR = [['https://github.com/octocat', '25:da63c817'], ['seal.bot', '21:a6c1afb1'], ['https://discord.gg/' + 'a'.repeat(150), '53:cd12c59a']];
check(QR.every(([text, want]) => print(text) === want), '명함 QR이 맞춰 본 값과 같다 (판 1 · 2 · 9)');
let tooLong = false;
try { qrCells('a'.repeat(214)); } catch { tooLong = true; }
check(tooLong, 'QR에 담기에 긴 글(214바이트)은 거절한다');

const info = await json('data/info.json');
check(info.show.days.length === 4 && info.campuses.length === 3 && info.badge.spots.length > 0 && info.moving.length > 0 && /^\d{4}-\d\d-\d\d$/.test(info.read), `알아둘 것: 날짜 4 · 캠퍼스 3 · 오가는 법 ${info.moving.length} · 배지 ${info.badge.spots.length}곳 · 읽은 날짜 ${info.read}`);
const isCes = (s) => s && /^https:\/\/www\.ces\.tech\//.test(s.url) && /^\d{4}-\d\d-\d\d$/.test(s.read);
check(isCes(info.show.source) && isCes(info.movingSource) && isCes(info.badge.source) && info.campuses.every((c) => isCes(c.source)) && info.recheck.includes('다시 확인'), '알아둘 것: 묶음마다 CES 공식 출처와 확인한 날짜가 있고 "가기 전에 다시 확인" 안내가 있다');
const settings = await json('data/settings.json');
check(['companyIntro', 'collector', 'collectorUrl', 'codysseyIcon', 'privateOn'].every((k) => k in settings), `아직 정하지 않은 넷의 자리가 설정에 있다 (회사 소개 ${settings.companyIntro} · 모으는 곳 ${settings.collector}${settings.collectorUrl ? ' 주소 있음' : ' 주소 비어 있음'} · 아이콘 ${settings.codysseyIcon} · 비공개 날 ${settings.privateOn})`);
for (const f of ['app.js', 'store.js', 'views/home.js', 'views/card.js', 'views/find.js', 'views/plan.js', 'qr.js', 'route.js']) check(await exists(f), `${f}가 있다`);

// 동선: 날짜 채우기와 걷는 차례.
const { placeTable, sortRoute, fillDays } = await import('../web/route.js');
const placesAll = await json('data/places.json');
const walkTable = placeTable(placesAll);
const booth = { a: '4376@LVCC_W', b: '62401@VEN_G', c: '61300@VEN_G', d: 'Aria Hospitality Suites@ARIA', e: null, f: '14731@LVCC_N', g: '14702@LVCC_N', h: '14650@LVCC_N' };
const firstBooth = (id) => booth[id];
const filled = fillDays(['b', 'e', 'f', 'd', 'a', 'c', 'g', 'h'].map((id) => ({ id, day: 0 })), firstBooth, walkTable);
check(filled.filled === 8 && filled.items.map((it) => `${it.id}${it.day}`).join(' ') === 'a1 h1 f1 g1 c2 b2 d3 e3', `동선: 날짜 채우기와 걷는 차례 (${filled.items.map((it) => `${it.id}${it.day}`).join(' ')})`);
const moved = sortRoute(filled.items.map((it) => (it.id === 'a' ? { ...it, day: 0 } : it.id === 'd' ? { ...it, day: 1 } : it)), firstBooth, walkTable);
check(moved.map((it) => `${it.id}${it.day}`).join(' ') === 'h1 f1 g1 d1 c2 b2 e3 a0', '동선: 날짜를 바꾸면 그 날짜로 가고 미정은 맨 뒤');
// 내 위치와 구글맵.
const { nearestCampus, findBooth, nearBooth } = await import('../web/locate.js');
const { mapsLink } = await import('../web/maps.js');
const { nextStop } = await import('../web/route.js');
const atLvcc = nearestCampus(placesAll, 36.1318, -115.1519);
const atAria = nearestCampus(placesAll, 36.1075, -115.1760);
const atSeoul = nearestCampus(placesAll, 37.5665, 126.978);
check(atLvcc.k === 'lvcc' && atLvcc.inside && atAria.k === 'cs' && atAria.inside && !atSeoul.inside && atSeoul.meters > 9000000, `GPS로 캠퍼스를 고른다 (LVCC 안 ${Math.round(atLvcc.meters)}m · 아리아 안 ${Math.round(atAria.meters)}m · 서울은 밖 ${Math.round(atSeoul.meters / 1000)}km)`);
const { nearestArea } = await import('../web/locate.js');
const areaN = nearestArea(placesAll, 36.1324, -115.1523);
const areaKeys = new Set(placesAll.places.map((p) => p.k));
check(areaN?.ko === 'LVCC 노스 홀' && nearestArea(placesAll, 36.2, -115.3) === null && placesAll.gpsAreas.every((a) => a.approx === true && a.places.every((k) => areaKeys.has(k))), `GPS로 홀 · 건물 근처를 짐작한다 (어림 자리 ${placesAll.gpsAreas.length}곳, 모두 짐작 표시)`);
const fakeSpots = new Map([['LVCC_N|14731', { x: 1, z: 2 }], ['LVCC_N|14702A', { x: 3, z: 4 }], ['WYNN|Wynn Encore Latour 2', { x: 5, z: 6 }]]);
check(findBooth(fakeSpots, ' 14731 ')[0]?.place === 'LVCC_N' && findBooth(fakeSpots, 'wynn encore latour 2').length === 1 && findBooth(fakeSpots, '99').length === 0 && nearBooth(fakeSpots, '14705')?.code === '14702A' && nearBooth(fakeSpots, '20000') === null, '부스 번호로 맞춘다 (같은 번호 · 가까운 번호 · 없는 번호)');
const hall = placesAll.places.find((p) => p.k === 'LVCC_N');
const link = mapsLink(placesAll, hall, 'directions');
check(link.startsWith('https://www.google.com/maps/dir/?api=1&destination=Las%20Vegas%20Convention%20Center%20North%20Hall') && link.includes('travelmode=walking') && !/[?&]key=/.test(link) && mapsLink(placesAll, placesAll.places.find((p) => p.k === 'BEACH')) === null, '구글맵 길찾기 주소는 키 없는 Maps URLs다');
const stops = [{ id: 'x', day: 0 }, { id: 'y', day: 2, seen: true }, { id: 'z', day: 2 }, { id: 'w', day: 1, seen: true }];
check(nextStop(stops)?.id === 'z' && nextStop(stops, 1) === null && nextStop(stops.map((s) => ({ ...s, seen: true }))) === null, '다음 갈 곳: 날짜 차례로 아직 보지 않은 첫 곳');

// 일기: 폰이 내보내는 꼴과, 그 파일을 Rust 자료 도구가 네 태그로 나누는지.
const diary = await import('../web/diary.js');
const who = { nick: '물개', tag: 'stu', github: 'octocat', discord: 'seal.bot' };
const wrote = [
  { id: 'a1', date: '2027-01-06', exId: 'ID01', company: 'Alpha Robotics', booth: '14731@LVCC_N', saw: '로봇 팔 시연', felt: '배워 볼 만하다', for: ['stu', 'job'], sent: null },
  { id: 'a2', date: '2027-01-07', exId: '', company: 'Zeta Home', booth: '', saw: '조용한 주방 도우미', felt: '', for: ['ret'], sent: null },
  { id: 'a3', date: '2027-01-07', exId: '', company: 'Beta Cloud', booth: '', saw: '', felt: '태그 없이 적었다', for: [], sent: null },
];
const pack = diary.bundle(wrote, who, new Date('2027-01-07T03:00:00Z'));
const packText = JSON.stringify(pack);
check(pack.app === 'ces-2027-diary' && pack.v === 1 && pack.entries.length === 3 && pack.author.nick === '물개' && !packText.includes('octocat') && !packText.includes('seal.bot') && !('sent' in pack.entries[0]), '일기 묶음에는 일기와 별명 · 태그만 들어간다 (깃허브 · 디스코드는 없다)');
check(diary.collectorUrl({ collectorUrl: '' }) === '' && diary.collectorUrl({}) === '' && diary.collectorUrl({ collectorUrl: 'http://x.example/a' }) === '' && diary.collectorUrl({ collectorUrl: ' https://x.example/a ' }) === 'https://x.example/a', '모으는 곳 주소가 비어 있으면 보내는 길이 꺼진다 (https만 받는다)');
check(diary.fileName(who, new Date(2027, 0, 7)) === 'ces2027-일기-물개-20270107.json' && diary.asText(wrote, who, (k) => ({ stu: '학생', job: '취준생', ret: '정년', mid: '장년' }[k])).includes('- Alpha Robotics (학생 · 취준생에게)'), '내보내는 파일 이름과 단톡방용 글');
{
  const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { execFileSync } = await import('node:child_process');
  const bins = [process.env.CES_DATA_BIN, 'target/release/ces-data', 'target/debug/ces-data'].filter(Boolean);
  let bin = null;
  for (const b of bins) if (await stat(b).then(() => true, () => false)) { bin = b; break; }
  if (!bin) {
    lines.push('주의 | 자료 도구를 짓지 않아 일기 정리 도구는 보지 않았다');
  } else {
    const dir = await mkdtemp(join(tmpdir(), 'ces-diary-'));
    await writeFile(join(dir, diary.fileName(who, new Date(2027, 0, 7))), JSON.stringify(pack, null, 2));
    await writeFile(join(dir, 'other.json'), '{"app":"something-else"}');
    const page = execFileSync(bin, ['sort-diary', '--in', dir], { encoding: 'utf8' });
    await rm(dir, { recursive: true, force: true });
    const part = (title) => page.split('\n## ').find((s) => s.startsWith(title)) || '';
    check(page.includes('- 일기 3개 · 쓴 사람 1명 · 회사 3곳 · 2027-01-06 ~ 2027-01-07') && part('학생 (1개)').includes('**Alpha Robotics** (부스 14731) · 물개') && part('취준생 (1개)').includes('Alpha Robotics') && part('정년 (1개)').includes('Zeta Home') && part('장년 (0개)').includes('아직 없다') && part('누구에게인지 고르지 않은 것 (1개)').includes('Beta Cloud'), '폰이 내보낸 일기 파일을 Rust 자료 도구가 네 태그로 나눈 한 장으로 만든다');
  }
}

// 지도와 오프라인.
const appJs = await readFile(join(dist, 'app.js'), 'utf8');
check(!html.includes('map3d') && !appJs.includes('map3d') && (await exists('map3d.js')), '3D 지도는 첫 화면에 싣지 않고 지도 화면에서 그때 불러온다');
const sw = await readFile(join(dist, 'sw.js'), 'utf8');
const version = await json('version.json').catch(() => null);
const swFiles = JSON.parse(`[${(sw.match(/const FILES = \[(.*)\];/) || [])[1] || ''}]`);
check(!!version && sw.includes(JSON.stringify(version.v)) && !sw.includes('__VERSION__'), `판 이름이 찍혔다 (${version?.v})`);
const mustCache = ['./', 'index.html', 'app.js', 'app.css', 'core.js', 'core.wasm', 'qr.js', 'route.js', 'map3d.js', 'views/home.js', 'views/card.js', 'views/find.js', 'views/plan.js', 'views/map.js', 'views/diary.js', 'diary.js', 'locate.js', 'maps.js', 'data/places.json', 'data/info.json', 'version.json', 'manifest.webmanifest', 'icon/icon-192.png'];
const missing = mustCache.filter((f) => !swFiles.includes(f));
const gone = [];
for (const f of swFiles) if (f !== './' && !(await exists(f))) gone.push(f);
check(missing.length === 0 && gone.length === 0, `서비스 워커가 담아 둘 파일 ${swFiles.length}개 (빠진 것 ${missing.join(' ') || '없음'} · 없는 파일 ${gone.join(' ') || '없음'})`);
const manifest = await json('manifest.webmanifest');
let iconsOk = manifest.display === 'standalone' && manifest.icons.length >= 2;
for (const icon of manifest.icons) iconsOk = iconsOk && (await exists(icon.src));
check(iconsOk, '홈 화면에 추가: 매니페스트와 아이콘이 있다');
const cats = await json('data/categories.json');
check(cats.groups.length === 7 && ['stu', 'job', 'ret', 'mid'].every((k) => cats.audiences[k].length > 0), `분야 묶음 ${cats.groups.length}개 · 네 태그마다 먼저 보일 분야가 있다${cats.audiencesDraft ? ' (초안)' : ''}`);

if (await exists('data/meta.json')) {
  const meta = await json('data/meta.json');
  const data = await json('data/exhibitors.json');
  const places = await json('data/places.json');
  check(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(meta.fetchedAt), `받은 날짜가 자료에 있다 (${meta.fetchedAt})`);
  check(meta.source === 'https://exhibitors.ces.tech/8_0/', '출처가 CES 공식 전시사 검색이다');
  check(data.n === data.ex.length && data.n === meta.exhibitors && data.n > 0, `전시사 ${data.n}곳`);
  check(places.places.every((p) => p.boothSpots === 'guess' || p.boothSpots === 'official'), `장소 ${places.places.length}곳마다 부스 자리가 짐작인지 적혀 있다`);
  check(!/[?&]key=/.test(JSON.stringify(places.mapsUrls)), '구글맵 주소는 키 없는 Maps URLs다');

  // 부스 자리 짐작: 장소가 정해진 부스는 모두 제 장소 모양 안에 놓여야 한다.
  const { boothSpots, spotOf } = await import('../web/spots.js');
  const { layout, inside } = await import('../web/geo.js');
  const L = layout(places);
  const spots = boothSpots(places, data);
  let placed = 0, outside = 0;
  for (const row of data.ex) for (const b of row[7]) {
    const spot = spotOf(spots, b);
    if (!spot) continue;
    placed += 1;
    const p = L.list.find((x) => b.endsWith(`@${x.k}`));
    if (!inside([spot.x, spot.z], p.world)) outside += 1;
  }
  check(placed === meta.booths - meta.unplacedBooths && outside === 0, `부스 자리 짐작: ${placed}개가 제 장소 모양 안에 있다 (밖 ${outside})`);
  const rows = core.loadIndex(await readFile(join(dist, 'data/search-index.txt')));
  check(rows === data.n, `찾기 색인의 줄 수가 전시사 수와 같다 (${rows})`);
  const names = (q) => core.search(q, 5).map((i) => data.ex[i][1]);
  const first = data.ex[0][1];
  check(core.search(first, 50).some((i) => data.ex[i][1] === first), `이름으로 찾는다 ("${first}")`);
  for (const q of ['samsung', '삼성', '로봇', '한국']) {
    const got = names(q);
    check(got.length > 0, `"${q}" → ${got.slice(0, 3).join(' · ') || '없음'}`);
  }
  check(core.search('', 5).length === 0, '빈 말은 0건');
  lines.push(`자료 | 전시사 ${meta.exhibitors} · 분야 ${meta.categories} · 나라 ${meta.countries} · 한국 ${meta.korea} · 부스 ${meta.booths} (장소 못 정함 ${meta.unplacedBooths}) · 색인 낱말 ${meta.indexWords} · 회사 소개 ${meta.companyIntro}`);
} else {
  lines.push('주의 | 전시사 자료가 없다 (공식 사이트에서 받지 못했다). 코어만 본다');
  const rows = core.loadIndex(new TextEncoder().encode('CESIDX 1 2\nalpha\t0\t1\nbeta\t1\t\n'));
  check(rows === 2 && String(core.search('al', 5)) === '0,1', '코어가 지어낸 색인으로 찾는다');
}

const table = ['무엇 | 본 것', '--- | ---', ...lines].join('\n');
console.log(table);
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `### 지은 것 살피기\n\n${table}\n`);
if (failed) {
  console.error(`안 된 것 ${failed}개`);
  process.exit(1);
}
