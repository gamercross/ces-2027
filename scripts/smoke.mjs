// 지은 것(dist)을 폰이 쓰는 그대로 읽어 본다: 첫 화면, 코어(core.wasm), 자료, 찾기.
// 쓰는 법: node scripts/smoke.mjs dist
// 전시사 자료가 없으면(공식 사이트에서 받지 못한 날) 코어만 지어낸 색인으로 본다.

import { readFile, appendFile, stat , readdir} from 'node:fs/promises';
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
{
  const model = await json('data/speech-model.json');
  const { totalBytes, toMB } = await import('../web/speech-model.js');
  const expected = [...model.runtime.files.filter((f) => !f.notice), ...model.dictation.files].reduce((n, f) => n + f.bytes, 0);
  const ui = await readFile(join(dist, 'talk-ui.js'), 'utf8');
  check(model.dictation.revision.length === 40 && model.dictation.license === 'MIT' && model.dictation.licenseSource.startsWith('https://github.com/moonshine-ai/moonshine/')
    && totalBytes(model) === expected && toMB(expected) === 45 && /와이파이에서 받기를 권한다/.test(ui),
  `폰 안 받아쓰기 모델: 판 · MIT 출처가 고정되고 받기 전에 ${toMB(expected)}MB와 와이파이 권장을 보인다 (${(expected / 1048576).toFixed(1)} MiB)`);
}

// 오가는 법(교통): 줄마다 CES 공식 출처와 확인 날짜, 2027 안내가 없거나 어긋나는 줄은 "확인 필요".
{
  const transit = await json('data/transit.json');
  const places = await json('data/places.json');
  const tr = await import('../web/transit.js');
  const isDate = (s) => /^\d{4}-\d\d-\d\d$/.test(s);
  const kinds = new Set(['hotel', 'cspace', 'express', 'airport', 'media', 'monorail', 'loop', 'rideshare', 'hub']);
  const ids = new Set(transit.lines.map((l) => l.id));
  const shapeOk = transit.lines.every((l) => l.id && kinds.has(l.kind) && l.ko && ['confirmed', 'check'].includes(l.status) && Array.isArray(l.stops) && l.stops.every((s) => s.ko && s.board && s.query) && (l.schedule === null || transit.schedules[l.schedule]));
  check(shapeOk && ids.size === transit.lines.length && isDate(transit.read), `교통 자료: ${transit.lines.length}줄의 꼴이 맞다 (종류 · 상태 · 타는 곳 · 시간표)`);
  const srcs = transit.lines.flatMap((l) => l.sources);
  const CES = /^https:\/\/www\.ces\.tech\//;
  check(transit.lines.every((l) => l.sources.length > 0) && srcs.every((s) => CES.test(s.url) && isDate(s.read) && s.ko) && CES.test(transit.guide.url) && CES.test(transit.flyer.url), `교통 자료: 줄마다 출처와 확인 날짜가 있고 출처 ${srcs.length}개가 모두 CES 공식 사이트(ces.tech)다`);
  const parts = Object.values(transit.schedules).flat().flatMap((d) => d.parts);
  check(parts.every((p) => transit.parts[p.part] && /^\d\d:\d\d$/.test(p.from) && /^\d\d:\d\d$/.test(p.to) && p.from < p.to && Number.isInteger(p.every) && p.every > 0), `교통 자료: 시간표 ${parts.length}토막의 시각 · 간격이 맞다`);
  const checks = transit.lines.filter((l) => l.status === 'check');
  check(checks.length > 0 && checks.every((l) => l.todo && l.note), `교통 자료: "확인 필요" 줄은 ${checks.length}개이고 모두 무엇을 확인할지(할 일)를 적었다`);
  const text = JSON.stringify(transit);
  check([...text.matchAll(/작년/g)].every((m) => text.slice(m.index, m.index + 12).startsWith('작년(CES 2026)')) && !/@[a-z]+\.[a-z]/i.test(text), '교통 자료: 작년 것을 적을 때는 "작년(CES 2026)"이라고 밝혔고, 메일 주소는 없다');
  const link = tr.stopLink(places, transit.lines.find((l) => l.id === 'r9').stops[1]);
  const link2 = tr.stopLink(places, transit.lines.find((l) => l.id === 'r2').stops[0]);
  check(link.startsWith('https://www.google.com/maps/search/?api=1&query=') && link.includes(encodeURIComponent('201 Sands Ave')) && link2.includes(encodeURIComponent('Treasure Island Las Vegas, Las Vegas, NV')) && !/[?&]key=/.test(link + link2), '교통 자료: 타는 곳의 구글맵 주소는 Maps URLs(키 없음)이고, 장소 자료의 주소를 쓴다');
  const tt = tr.timetable(transit, transit.lines.find((l) => l.id === 'r9'));
  check(tt.length === 3 && tt[1].parts[0] === '하루 내내 7:30 ~ 18:30 · 10분마다', '교통 자료: Tech Express 시간표가 전단대로 읽힌다 (수 ~ 금 7:30 ~ 18:30, 10분마다)');
  const n = tr.counts(transit);
  const root = (p) => readFile(new URL(`../${p}`, import.meta.url), 'utf8');
  const [app, mapJs, pagesYml, linksYml] = await Promise.all([root('web/app.js'), root('web/views/map.js'), root('.github/workflows/pages.yml'), root('.github/workflows/links.yml')]);
  check(/transit: \(\) => import\('\.\/views\/transit\.js'\)/.test(app) && !/from '\.\/transit\.js'/.test(app + mapJs) && mapJs.includes("#/transit"), '교통 화면은 누를 때 불러온다 (첫 화면 조각에 고정 import 없음). 지도 탭에는 링크만 있다');
  check(pagesYml.includes('data/transit.json') && linksYml.includes('--in data/transit.json'), '교통 자료는 배포에 담기고, 출처 링크 살피기(check-links)가 이 파일도 본다');
  lines.push(`교통 | 줄 ${n.total}개: 2027 확인됨 ${n.confirmed} · 확인 필요 ${n.check} · 읽은 날짜 ${transit.read}`);
}

// 회사 사진 · 로고: 공식 자료에 있는 로고 파일 이름만 싣고, 설정이 꺼져 있으면 그림 주소로 아무것도 묻지 않는다.
{
  const lg = await import('../web/logos.js');
  const fake = { v: '2026-11-21', ex: [['A1'], ['B2'], ['C3'], ['D4'], ['E5']] };
  const logos = { v: '2026-11-21', base: 'https://exhibitors.ces.tech/mys_shared/CES27/logos/', kinds: ['png', '~jpg'], map: '01---', extra: { 4: 'odd-name.PNG' } };
  const open = lg.openLogos(logos, fake);
  check(lg.logoUrl(open, 'A1') === `${logos.base}A1.png` && lg.logoUrl(open, 'B2') === `${logos.base}b2.jpg` && lg.logoUrl(open, 'C3') === null && lg.logoUrl(open, 'E5') === `${logos.base}odd-name.PNG` && lg.logoUrl(open, 'ZZ') === null, '로고 주소: 전시사 id에서 공식 주소를 셈한다 (id.png · 소문자 id.jpg · 따로 적은 이름 · 없음)');
  check(lg.openLogos({ ...logos, v: 'old' }, fake) === null && lg.openLogos({ ...logos, base: 'https://example.com/' }, fake) === null && lg.openLogos({ ...logos, map: '0' }, fake) === null && lg.logoUrl(lg.openLogos({ ...logos, extra: { 4: '../x.png' } }, fake), 'E5') === null, '로고 주소: 판이 다르거나 · 공식 사이트 주소가 아니거나 · 줄 수가 다르거나 · 파일 이름이 이상하면 쓰지 않는다');
  check(typeof settings.companyImage === 'boolean', `설정 companyImage(회사 카드의 로고 단추)가 있다 (지금 ${settings.companyImage ? '켬' : '끔'})`);
  // 꺼져 있으면: 설정 하나만 묻고 로고 자료도 그림 주소도 묻지 않으며, 줄에 아무것도 더하지 않는다.
  const asked = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => { asked.push(String(url)); return { ok: true, status: 200, json: async () => ({ companyImage: false }) }; };
  const { attachImage } = await import('../web/company-image.js');
  let touched = 0;
  const li = { querySelector: () => { touched += 1; return null; } };
  attachImage(li, 'A1', '이름', fake);
  await new Promise((r) => setTimeout(r, 30));
  globalThis.fetch = realFetch;
  check(asked.length === 1 && asked[0] === 'data/settings.json' && touched === 0, `로고: 설정이 꺼져 있으면 설정 말고는 아무것도 묻지 않고 줄도 그대로다 (물은 것 ${asked.join() || '없음'})`);
  if (await exists('data/logos.json') && await exists('data/exhibitors.json')) {
    const real = await json('data/logos.json');
    const ex = await json('data/exhibitors.json');
    const opened = lg.openLogos(real, ex);
    const urls = ex.ex.map((row) => lg.logoUrl(opened, row[0]));
    const got = urls.filter(Boolean);
    check(opened && real.base === 'https://exhibitors.ces.tech/mys_shared/CES27/logos/' && got.length === real.n && got.every((u) => /^https:\/\/exhibitors\.ces\.tech\/mys_shared\/CES27\/logos\/[A-Za-z0-9_-]+\.(png|jpe?g)$/i.test(u)), `로고 자료: 전시사 ${ex.ex.length}곳 가운데 ${got.length}곳에 공식 로고 주소가 있고, 모두 exhibitors.ces.tech의 로고 폴더다`);
    const size = (await stat(join(dist, 'data/logos.json'))).size;
    lines.push(`로고 | 공식 자료에 로고 ${got.length}곳 (${((got.length / ex.ex.length) * 100).toFixed(0)}%) · data/logos.json ${(size / 1024).toFixed(1)} KB`);
  }
}
// 듣기 (깊게 6): 두 길의 자리, 폰이 못 하는 것은 안 된다고 돌려주는지, 일기 초안의 꼴.
{
  const speech = await import('../web/speech.js');
  check(!(await exists('data/phrases.json')) && !(await exists('translator.js')) && !(await exists('translator-ui.js')) && !(await exists('translate-model.js')) && !(await exists('translate-model.worker.js')) && !(await exists('views/translate.js')) && !(await exists('views/ask.js')) && !(await exists('views/deep.js')) && !(await exists('vendor/translate/source-tokenizer.json')), '번역 코드 · 물어볼 말 자료 · 영한 번역 모델의 단어 사전은 지은 것에 없다 (2026-11-22에 지웠다)');
  check(settings.speech === 'on-device' && speech.modeOf({}) === 'on-device' && speech.modeOf({ speech: 'x' }) === 'on-device' && speech.modeOf({ speech: 'device-service' }) === 'device-service' && speech.modeOf(settings, 'device-service') === 'device-service' && speech.modeOf(settings, 'nope') === 'on-device' && speech.modeOf({ speech: 'device-service' }, 'on-device') === 'on-device', '받아쓰기를 어디서 하나: 두 길을 다 두고 쓰는 사람이 고른다. 고르기 전 기본값은 "폰 안에서만"이다');
  check(settings.companyImage === true && !('translationModel' in settings) && !('translation' in (await json('data/speech-model.json'))), '회사 로고는 켬으로 두고, 영한 번역 모델의 설정과 목록은 없다');
  const talkUi = await readFile(join(dist, 'talk-ui.js'), 'utf8');
  check(speech.allowedMode('device-service', null) === 'on-device' && speech.allowedMode('device-service', '2026-11-21') === 'device-service' && speech.allowedMode('on-device', null) === 'on-device' && /인터넷이 필요하고 소리가 구글 · 애플로 간다/.test(speech.SERVICE_NOTE) && talkUi.includes('speechConsent.v1') && talkUi.includes('SERVICE_NOTE'), '폰의 음성 인식 서비스 길: "인터넷이 필요하고 소리가 구글 · 애플로 간다"를 보이고 한 번 확인받은 뒤에만 쓴다 (확인이 없으면 폰 안에서만)');
  const bare = await speech.capabilities('on-device', { navigator: {} });
  check(Object.values(bare).every((c) => c.ok === false && c.why.length > 0), '아무 기능도 없는 폰: 읽어 주기 · 받아쓰기 · 녹음을 "안 됨"과 까닭으로 돌려준다 (숨기지 않는다)');
  class OnlyService {}
  const onlyService = { navigator: {}, webkitSpeechRecognition: OnlyService };
  const a = await speech.capabilities('on-device', onlyService);
  const b = await speech.capabilities('device-service', onlyService);
  check(a.dictate.ok === false && b.dictate.ok === true && /폰 밖/.test(b.dictate.why), '폰 밖 받아쓰기만 있는 폰: 기본 길(폰 안에서만)에서는 안 됨, 폰의 음성 인식 서비스 길에서는 됨이고 소리가 폰 밖으로 간다고 적는다');
  class Local {}
  Local.available = async (o) => (o.processLocally ? 'available' : 'unavailable');
  const full = await speech.capabilities('on-device', { navigator: { mediaDevices: { getUserMedia() {} } }, MediaRecorder: class {}, speechSynthesis: {}, SpeechSynthesisUtterance: class {}, SpeechRecognition: Local });
  check(full.dictate.ok && full.dictate.local === true && full.record.ok && full.speak.ok, '폰 안에서 다 되는 폰: 세 가지가 모두 됨이고 받아쓰기는 폰 안에서 한다');
  let used = null;
  const voices = [{ lang: 'en-US', localService: false }, { lang: 'ko-KR', localService: true }];
  const synth = (list) => ({ speechSynthesis: { getVoices: () => list, cancel() {}, speak(u) { used = u; } }, SpeechSynthesisUtterance: class { constructor(t) { this.text = t; } } });
  const refused = speech.speak('Hi', 'on-device', synth(voices));
  const spoke = speech.speak('Hi', 'device-service', synth(voices));
  check(refused === false && spoke === true && used.lang === 'en-US', '읽어 주기: 폰 안에서만 길에서는 폰 밖 목소리를 쓰지 않는다');
  const draft = speech.makeDraft({ id: 'x1', name: '지어낸 회사', booth: '100@LVCC_N' }, [{ t: 3.4, en: ' Hello there. ', ko: '안녕하세요.' }, { t: 9, en: '', ko: '' }, { t: 12, en: 'Price is nine dollars.', ko: '' }], '2027-01-06', 'd1');
  check(draft.draft === true && draft.felt === '' && draft.for.length === 0 && draft.sent === null && draft.heard.length === 2 && draft.heard[0].t === 3 && draft.heard[0].en === 'Hello there.' && draft.saw.includes('안녕하세요.') && draft.saw.includes('Price is nine dollars.') && draft.exId === 'x1' && draft.date === '2027-01-06', '일기 초안: 날짜 · 회사 · 들은 글(원문 · 번역)이 들어가고 느낀 점과 "누구에게"는 비어 있다');
  const { bundle } = await import('../web/diary.js');
  const sentKeys = Object.keys(bundle([{ ...draft, audio: { bytes: 1 } }], { nick: 'a' }).entries[0]);
  const diaryView = await readFile(join(dist, 'views/diary.js'), 'utf8');
  check(!sentKeys.includes('heard') && !sentKeys.includes('audio') && diaryView.includes('const ready = all.filter((e) => !e.draft)') && diaryView.includes('const unsent = ready.filter'), '보내는 묶음에는 들은 글과 녹음이 없고, 초안은 다듬어 남기기 전에는 보내지 않는다');
  const talkCode = (await Promise.all(['speech.js', 'talk-ui.js', 'audio-store.js', 'views/listen.js'].map((f) => readFile(join(dist, f), 'utf8')))).join('\n');
  check(!/fetch\(|XMLHttpRequest|sendBeacon|WebSocket/.test(talkCode), '말 기능 코드는 스스로 어디로도 보내지 않는다 (fetch · XHR · beacon · 소켓 없음)');
}
check(['companyIntro', 'collector', 'collectorUrl', 'codysseyIcon', 'companyImage', 'privateOn'].every((k) => k in settings), `정한 것과 아직 정하지 않은 항목의 자리가 설정에 있다 (회사 소개 ${settings.companyIntro} · 모으는 곳 ${settings.collector}${settings.collectorUrl ? ' 주소 있음' : ' 주소 비어 있음'} · 아이콘 ${settings.codysseyIcon} · 로고 ${settings.companyImage} · 비공개 날 ${settings.privateOn})`);
check(settings.codysseyIcon === false || (typeof settings.codysseyIcon === 'string' && (await exists(settings.codysseyIcon))), `코디세이 아이콘: ${settings.codysseyIcon ? `그림이 있다 (${settings.codysseyIcon})` : '글자만'}`);
for (const f of ['app.js', 'store.js', 'views/map.js', 'views/settings.js', 'theme.js', 'views/card.js', 'views/plan.js', 'views/rec.js', 'qr.js', 'route.js']) check(await exists(f), `${f}가 있다`);

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
const { nearestCampus, findBooth, nearBooth, fixProblem } = await import('../web/locate.js');
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
check(fixProblem(null, { lat: 36.1324, lng: -115.1523, accuracy: 80, at: 1000 }) === null
  && fixProblem(null, { lat: 36.1324, lng: -115.1523, accuracy: 300, at: 1000 }) === 'accuracy'
  && fixProblem({ lat: 36.1324, lng: -115.1523, accuracy: 10, at: 1000 }, { lat: 36.14, lng: -115.15, accuracy: 10, at: 2000 }) === 'jump',
'GPS가 튀면 낮은 정확도 · 갑작스러운 점프를 버린다');
{
  const paths = await json('data/indoor-paths-guess.json');
  const { routeThroughAisle } = await import('../web/indoor-path.js');
  const start = [10, 0], target = [90, 8], aisle = [[0, 0], [100, 0]];
  const route = routeThroughAisle(start, target, aisle, [0, 0]);
  check(paths.source === 'https://www.ces.tech/media/1kqatmqa/lvcc-map-ces-2027.pdf' && paths.approx === true
    && Object.keys(paths.halls).length >= 8 && Object.values(paths.halls).every((h) => h.entrance.length === 2 && h.aisle.length >= 2)
    && route[0] === start && route.at(-1) === target && route.length >= 4
    && routeThroughAisle(null, target, aisle, [0, 0])[0].join() === '0,0',
  `홀 입구 · 큰 통로 짐작 길: 공식 지도 출처 ${paths.read}, 홀 ${Object.keys(paths.halls).length}곳, 자리가 없으면 홀 입구부터 잇는다`);
}
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
    check(page.includes('- 일기 3개 · 쓴 사람 1명 · 회사 3곳 · 2027-01-06 ~ 2027-01-07') && part('학생 (일기 1개 · 회사 1곳)').includes('### Alpha Robotics (부스 14731)') && part('학생 (일기 1개 · 회사 1곳)').includes('- 로봇 팔 시연 (물개, 2027-01-06)') && part('취준생 (일기 1개 · 회사 1곳)').includes('Alpha Robotics') && part('정년 (일기 1개 · 회사 1곳)').includes('Zeta Home') && part('장년 (일기 0개 · 회사 0곳)').includes('아직 없다') && part('누구에게인지 고르지 않은 것 (일기 1개 · 회사 1곳)').includes('Beta Cloud'), '폰이 내보낸 일기 파일을 Rust 자료 도구가 네 태그로 나누고 회사로 묶은 한 장으로 만든다');
  }
}

// 날마다 쓸 시간 · 내 일정: 쓸 시간에서 일정을 빼고, 그만큼만 동선에 넣는다. (시험 값은 지어낸 것이다.)
{
  const D = await import('../web/days.js');
  const inf = { show: { days: [{ date: '2027-01-06', open: '10:00', close: '18:00' }, { date: '2027-01-07', open: '09:00', close: '18:00' }, { date: '2027-01-08', open: '09:00', close: '18:00' }, { date: '2027-01-09', open: '09:00', close: '16:00' }] } };
  const saved = { '2027-01-07': { from: '10:00', to: '14:00' }, '2027-01-08': { off: true }, '2027-01-09': { from: '15:00', to: '09:00' } };
  const evs = [{ date: '2027-01-07', from: '11:00', to: '12:00', name: '모임' }, { date: '2027-01-07', from: '11:30', to: '12:30', name: '겹침' }, { date: '2027-01-07', from: '19:00', to: '21:00', name: '밤' }];
  const h6 = D.hoursFor('2027-01-06', saved, inf), h7 = D.hoursFor('2027-01-07', saved, inf), h8 = D.hoursFor('2027-01-08', saved, inf), h9 = D.hoursFor('2027-01-09', saved, inf);
  const on7 = D.eventsOn(evs, '2027-01-07');
  check(!h6.mine && h6.from === 600 && h7.mine && h7.to === 840 && h8.off && !h9.mine && h9.to === 960 && D.freeMinutes(h7, on7) === 150 && D.capacity(h7, on7, 30) === 5 && D.capacity(h8, [], 30) === 0 && String(D.dayLimits(inf, saved, evs, 30, 0)) === '0,16,5,0,14' && String(D.dayLimits(inf, saved, evs, 30, 10)) === '0,10,5,0,10', '날마다 쓸 시간: 기본은 공식 전시 시간, 고친 날은 그 시간, 일정(겹친 것은 한 번만)을 빼고 몇 곳인지 센다');
  check(String(D.timeline(6, h7, on7, 30).map((t) => (t == null ? 'x' : D.clock(t)))) === '10:00,10:30,12:30,13:00,13:30,x' && D.timeline(2, h8, [], 30).every((t) => t === null), '몇 시쯤: 일정이 있는 시간은 건너뛰고, 쓸 시간을 넘으면 "시간 밖"');
  const file = JSON.stringify({ app: 'ces-2027-myplan', v: 1, hours: [{ date: '2027-01-06', from: '9:30', to: '17:00' }, { date: '2027-01-08', off: true }, { date: '나쁜 날', from: '1', to: '2' }, { date: '2027-01-09', from: '12:00', to: '11:00' }], events: [{ date: '2027-01-07', from: '11:00', to: '12:00', name: '모임', place: '스피어' }, { date: '2027-01-07', from: '13:00', to: '12:00', name: '거꾸로' }, { date: '2027-01-10', from: '06:00', to: '08:00', name: '  이동  ' }], perStopMinutes: 20 });
  const got = D.readFile(file);
  const merged = D.mergeIn({ hours: { '2027-01-07': saved['2027-01-07'] }, events: [D.cleanEvent(evs[0])] }, got);
  const back = D.readFile(JSON.stringify(D.makeFile(merged.hours, merged.events, 20)));
  check(got.hours['2027-01-06'].from === '09:30' && got.hours['2027-01-08'].off === true && Object.keys(got.hours).length === 2 && got.events.length === 2 && got.events[1].name === '이동' && got.pace === 20 && got.problems.length === 3 && merged.added === 1 && merged.events.length === 2 && back.events.length === 2 && back.problems.length === 0 && D.readFile('{"app":"x"}').problems.length === 1 && D.readFile('nope').problems.length === 1, '일정 파일: 불러오면 맞는 줄만 넣고 뺀 것을 알린다. 같은 일정은 두 번 넣지 않는다. 내보낸 것을 다시 읽을 수 있다');
  const limited = fillDays(['b', 'c', 'a', 'h', 'f', 'g'].map((id) => ({ id, day: 0 })), firstBooth, walkTable, [0, 2, 1, 0, 9]);
  check(limited.items.map((it) => `${it.id}${it.day}`).join(' ') === 'a1 h1 c2 f4 g4 b4' && limited.moved === 3, '날짜 채우기가 날마다 다른 한도를 지킨다 (보지 않는 날에는 넣지 않는다)');
}

// 추천 즐겨찾기: 공식 자료만 근거로, 까닭과 함께.
{
  const R = await import('../web/recommend.js');
  const tbl = { ko: { Robotics: '로봇', Health: '헬스케어', Audio: '오디오' }, audiences: { stu: ['Robotics'] } };
  const fake = { cats: ['Robotics', 'Health', 'Audio'], countries: ['United States', 'South Korea'], ex: [
    ['A', 'Alpha', '', 1, '0', 2, 0, []],      // 최고 혁신상 · 한국 · 내 분야
    ['B', 'Beta', '', 0, '1', 1, 0, []],       // 혁신상
    ['C', 'Core', '', 1, '2', 0, 0, []],       // 한국
    ['D', 'Delta', '', 0, '0.1', 0, 0, []],    // 내 분야
    ['E', 'Echo', '', 0, '2', 0, 0, []],       // 까닭 없음
    ['F', 'Fox', '', 0, '1', 0, 0, []],        // 주제 판의 분야
  ] };
  const all = R.recommend(fake, tbl, { tag: 'stu', topics: [{ cats: ['Health'] }], have: new Set(['B']) });
  const names = (list) => list.map((r) => r.row[0]).join('');
  check(names(all) === 'ADFC' && all[0].why.join(' · ') === '최고 혁신상 2027 · 한국 기업 · 내 분야: 로봇' && all[1].why[0] === '내 분야: 로봇 · 헬스케어' && names(R.recommend(fake, tbl, { tag: 'stu', filter: 'award' })) === 'AB' && names(R.recommend(fake, tbl, { filter: 'korea' })) === 'AC' && names(R.recommend(fake, tbl, { filter: 'mine' })) === '' && all.every((r) => r.why.length > 0), '추천: 혁신상 · 한국 기업 · 내 분야(태그와 주제 판)로만 뽑고, 까닭을 붙이고, 관심에 있는 곳과 까닭 없는 곳은 뺀다');
}

// 전시사 목록 (공식 앱의 A–Z 목록 + 거르기): 진짜 자료로 거르기 · 줄 세우기 · 글자 자리 · 위치 묶음을 본다.
{
  const X = await import('../web/exlist.js');
  const { HALL_GROUPS } = await import('../web/hallgroups.js');
  const doc = await json('data/exhibitors.json');
  const pl = await json('data/places.json');
  const ko = new Map(pl.places.map((p) => [p.k, p.ko]));
  const koreaAt = doc.countries.indexOf('South Korea');
  const groups = X.placeGroups(HALL_GROUPS, (k) => ko.get(k) || k, doc.ex);
  const byName = X.sortRows(X.filterRows(doc.ex, {}), 'name');
  const starts = X.letterStarts(byName);
  const inOrder = byName.every((r, i) => i === 0 || X.initialOf(byName[i - 1][1]) <= X.initialOf(r[1]) || X.initialOf(r[1]) === '#');
  const hashLast = byName.slice(starts.get('#') ?? byName.length).every((r) => X.initialOf(r[1]) === '#');
  const award = X.filterRows(doc.ex, { award: true });
  const korea = X.filterRows(doc.ex, { korea: true }, { koreaAt });
  const north = groups.find((g) => g.ko === '노스');
  const inNorth = X.filterRows(doc.ex, { place: north.keys });
  const byBooth = X.sortRows(inNorth, 'booth', { placeOrder: new Map(north.keys.map((k) => [k, 0])), place: north.keys });
  const nums = byBooth.map((r) => Number(/^(\d+)/.exec(r[7].find((b) => north.keys.some((k) => b.endsWith(`@${k}`))).split('@')[0])?.[1] ?? Infinity));
  const named = X.filterRows(doc.ex, { q: 'samsung' });
  const booth = X.filterRows(doc.ex, { q: '14731' });
  const covered = new Set(groups.flatMap((g) => g.keys));
  const allPlaces = new Set(doc.ex.flatMap((r) => r[7].map((b) => b.slice(b.lastIndexOf('@') + 1))));
  check(byName.length === doc.ex.length && inOrder && hashLast && starts.get('A') === 0 && award.length > 0 && award.every((r) => r[5]) && korea.length > 0 && korea.every((r) => r[3] === koreaAt)
    && inNorth.length === north.n && nums.every((n, i) => i === 0 || nums[i - 1] <= n) && named.length > 0 && named.every((r) => /samsung/i.test(r[1])) && booth.some((r) => r[7].includes('14731@LVCC_N'))
    && [...allPlaces].every((p) => covered.has(p)) && groups.slice(0, 3).map((g) => g.ko).join(' ') === '웨스트 센트럴 노스' && X.countryKo('South Korea') === '한국' && X.countryKo('Narnia') === 'Narnia',
    `전시사 목록: ${doc.ex.length}곳 이름순(A ~ Z, 숫자 · 기호는 맨 끝 #), 혁신상 ${award.length} · 한국 ${korea.length} · 노스 ${inNorth.length}곳 부스 번호순, 이름 · 부스 번호로 거르기, 위치 묶음 ${groups.length}개가 모든 장소를 덮는다`);
}

// 세션 거르기 칩(기조연설 · 생중계 · 내 일정 · 분야 묶음)과 지도 찾기 칸의 세션 줄: 진짜 세션 자료로.
{
  const SS = await import('../web/sessions.js');
  const MF = await import('../web/mapfind.js');
  const doc = SS.clean(await json('data/sessions.json'));
  const cats = await json('data/categories.json');
  const items = doc.items;
  const groups = SS.topicGroups(items, cats.groups);
  const covered = new Set(groups.flatMap((g) => g.topics));
  const allTopics = new Set(items.flatMap((s) => s.topics || []));
  const key = SS.filterSessions(items, { keynote: true });
  const live = SS.filterSessions(items, { live: true });
  const one = items.find((s) => s.topics?.length);
  const mine = SS.filterSessions(items, { mine: true }, [SS.asEvent(one)]);
  const mob = groups.find((g) => g.k === 'mob');
  const inMob = SS.filterSessions(items, { topics: mob.topics });
  const both = SS.filterSessions(items, { keynote: true, topics: mob.topics });
  const hits = MF.sessionHits(items, 'robot', SS.search);
  check(key.length > 0 && key.every(SS.isKeynote) && live.length > 0 && live.every((s) => s.live) && mine.length === 1 && mine[0].id === one.id
    && inMob.length === mob.n && inMob.every((s) => s.topics.some((t) => mob.topics.includes(t))) && both.length <= Math.min(key.length, inMob.length)
    && [...allTopics].every((t) => covered.has(t)) && groups.at(-1).k === 'etc' && groups[0].ko === cats.groups[0].ko
    && hits.length === 2 && hits.every((h) => /robot/i.test(`${h.session.title} ${h.session.topics.join(' ')} ${h.session.track}`) && /^강연 · \d+\/\d+ \d\d:\d\d · /.test(h.sub)) && hits[0].session.date <= hits[1].session.date
    && MF.sessionHits(items, '로봇', SS.search).length === 0 && MF.sessionHits(items, 'ai', SS.search).length === 0,
    `세션 거르기: 기조연설 ${key.length} · 생중계 ${live.length} · 내 일정 · 분야 묶음 ${groups.length}개(${groups.map((g) => `${g.ko} ${g.n}`).join(' · ')})가 모든 주제를 덮고, 지도 찾기 칸은 영어 낱말이면 세션을 두 줄까지 이른 차례로 보인다`);
}

// 부스까지 길 안내.
{
  const G = await import('../web/guide.js');
  const P = { LVCC_N: { ko: '노스 홀', c: 'lvcc' }, LVCC_C: { ko: '센트럴 홀', c: 'lvcc' }, VEN_G: { ko: '홀 G', c: 'ven' } };
  const placeOf = (k) => P[k];
  const me = { by: 'booth', campus: 'lvcc', place: 'LVCC_N', code: '14731' };
  const kinds = [
    G.guideTo(null, { place: 'LVCC_N', code: '11835' }, placeOf),
    G.guideTo(me, { place: 'LVCC_N', code: '11835' }, placeOf),
    G.guideTo(me, { place: 'LVCC_N', code: '14702A' }, placeOf),
    G.guideTo(me, { place: 'LVCC_C', code: '20145' }, placeOf),
    G.guideTo(me, { place: 'VEN_G', code: '60101' }, placeOf),
    G.guideTo({ by: 'gps', campus: 'lvcc', area: { places: ['LVCC_N'] } }, { place: 'LVCC_N', code: 'N253' }, placeOf),
  ];
  check(kinds.map((g) => g.kind).join(' ') === 'unknown same-place same-place same-campus other-campus same-place' && kinds[1].lines[1].includes('작아지는') && kinds[1].lines[1].includes('147번대') && kinds[2].lines[1].includes('같은 통로') && !kinds[1].maps && kinds[3].maps && kinds[4].maps && kinds[5].lines[0].includes('짐작'), '부스까지 길 안내: 같은 곳이면 부스 번호 쪽으로, 같은 캠퍼스의 다른 곳 · 다른 캠퍼스면 구글맵, 내 자리를 모르면 묻는다');
  const far = G.guideTo({ by: 'gps', campus: 'lvcc', inside: false, meters: 9612345 }, { place: 'LVCC_N', code: '11835' }, placeOf);
  check(far.kind === 'outside' && far.maps && far.lines[0] === '전시장 밖이다 (가장 가까운 전시장까지 약 9,612km).' && !far.lines.join(' ').includes('다른 캠퍼스') && G.farText(420) === '420m' && G.farText(4560) === '4.6km' && kinds[4].lines[0].startsWith('가는 곳이 다른 캠퍼스다'), '전시장 밖(GPS로 어느 캠퍼스 안도 아님)이면 "다른 캠퍼스"가 아니라 "전시장 밖 · 거리"라고 말한다 (폰 확인 2차 D)');
  check((placesAll.cityPlaces || []).length >= 3 && placesAll.cityPlaces.every((p) => p.shapeGuess === true && p.maps.query && p.maps.address && (p.maps.addressChecked === null || /^\d{4}-\d\d-\d\d$/.test(p.maps.addressChecked))), `전시장 밖 공개 장소 ${(placesAll.cityPlaces || []).length}곳: 자리는 어림으로 표시, 주소는 확인한 날 또는 미확인`);
}

// 종이 명함 · 명함 이벤트 부스 · 알림.
{
  const A = await import('../web/alerts.js');
  check(A.shouldAskPaper(null, '2026-11-21') === 'first' && A.shouldAskPaper({ has: null }, '2026-11-21') === 'first' && A.shouldAskPaper({ has: false, asked: '2026-11-21', remindOn: '2026-12-29' }, '2026-12-28') === null && A.shouldAskPaper({ has: false, asked: '2026-11-21', remindOn: '2026-12-29' }, '2026-12-29') === 'again' && A.shouldAskPaper({ has: true, asked: '2026-12-30', remindOn: '2026-12-29' }, '2027-01-02') === null && A.defaultRemind('2027-01-06') === '2026-12-29', '종이 명함 묻기: 처음 한 번, 정해 둔 날(기본은 전시 8일 전)에 한 번 더, 그 뒤에는 묻지 않는다');
  let marks = A.toggleMark({}, 'LVCC_N|14731');
  marks = A.mergeMarks(marks, ['VEN_G|61300', 'LVCC_N|14731', 'nope', 7, 'LVCC_C|20145']).marks;
  const boothsOf = (id) => ({ a: ['14731@LVCC_N'], b: ['9@LVCC_W', '61300@VEN_G'], c: ['20145@LVCC_C'], d: ['11111@LVCC_N'] }[id]);
  const mine = [{ id: 'a', day: 1 }, { id: 'b', day: 1 }, { id: 'c', day: 2 }, { id: 'd', day: 1 }, { id: 'a2', day: 1 }];
  const dayOf = (date) => ({ '2027-01-06': 1, '2027-01-07': 2 }[date] || null);
  const day1 = A.cardsNeeded(mine, marks, '2027-01-06', dayOf, boothsOf);
  check(Object.keys(marks).length === 3 && A.markLabel(marks['LVCC_N|14731']) === '내가 표시' && A.markLabel(marks['VEN_G|61300']) === '팀이 표시' && day1.map((n) => n.id + ':' + n.by).join(' ') === 'a:me b:team' && A.cardsNeeded(mine.map((it) => ({ ...it, seen: true })), marks, '2027-01-06', dayOf, boothsOf).length === 0 && A.cardsNeeded(mine, marks, '2026-12-01', dayOf, boothsOf).length === 0 && Object.keys(A.toggleMark(marks, 'LVCC_N|14731')).length === 2, '명함 이벤트 부스: 사람이 표시한 것만(내가 · 팀이), 그날 동선에서 아직 안 본 곳만 센다');
  check(String(A.nearMarks({ by: 'booth', place: 'LVCC_N', code: '14706' }, marks)) === 'LVCC_N|14731' && A.nearMarks({ by: 'booth', place: 'LVCC_N', code: '10100' }, marks).length === 0 && String(A.nearMarks({ by: 'gps', campus: 'ven', area: { places: ['VEN_AD', 'VEN_G'] } }, marks)) === 'VEN_G|61300' && A.nearMarks({ by: 'gps', campus: 'lvcc', inside: true }, marks).length === 0 && A.nearMarks(null, marks).length === 0, '가까운 이벤트 부스: 부스 번호로 맞춘 자리면 통로가 가까운 것, GPS면 그 홀 안의 것, 캠퍼스만 알면 알리지 않는다');
  check(A.fresh({}, 'morning', '2027-01-06') && !A.fresh({ morning: '2027-01-06' }, 'morning', '2027-01-06') && A.fresh({ morning: '2027-01-06' }, 'morning', '2027-01-07') && A.notifyState({}) === 'unsupported' && A.notifyState({ Notification: { permission: 'denied' }, navigator: { serviceWorker: {} } }) === 'denied', '알림: 같은 알림은 하루에 한 번, 알림을 못 쓰는 브라우저를 가려낸다');
  const swText = await readFile(join(dist, 'sw.js'), 'utf8');
  check(swText.includes('notificationclick') && html.includes('id="notice"') && !/PushManager|pushManager|subscribe\(/.test(swText + (await readFile(join(dist, 'app.js'), 'utf8')) + (await readFile(join(dist, 'notify.js'), 'utf8'))), '알림은 서버 없이: 서비스 워커가 알림 누르기를 받고, 푸시 구독은 쓰지 않는다. 못 쓰는 폰을 위한 띠 자리가 있다');
}

// 지도 색칠: 분야 묶음 · 한국 · 혁신상.
{
  const C = await import('../web/colors.js');
  const tbl = { groups: [{ k: 'ai', ko: 'AI·컴퓨팅', cats: ['Artificial Intelligence', 'Computing'] }, { k: 'rob', ko: '로봇·제조', cats: ['Robotics'] }, { k: 'hea', ko: '건강', cats: ['Health'] }] };
  const fake = { cats: ['Artificial Intelligence', 'Computing', 'Robotics', 'Health', 'Unknown'], countries: ['United States', 'South Korea'], ex: [
    ['A', 'a', '', 1, '0.1.2', 0, 0, []],   // AI 둘 · 로봇 하나 → AI
    ['B', 'b', '', 0, '2', 2, 0, []],       // 로봇, 최고 혁신상
    ['C', 'c', '', 0, '0.2', 1, 0, []],     // AI 하나 · 로봇 하나 → 차례가 앞선 AI, 혁신상
    ['D', 'd', '', 0, '4', 0, 0, []],       // 묶음에 없는 분야
    ['E', 'e', '', -1, '', 0, 0, []],       // 분야 없음
  ] };
  const byId = new Map(fake.ex.map((r) => [r[0], r]));
  const at = { one: ['A'], mix: ['B', 'C', 'B'], none: ['D', 'E'], empty: [] };
  const rowsAt = (key) => at[key].map((id) => byId.get(id));
  const groups = C.rowGroups(fake, tbl);
  const paint = (mode) => Object.keys(at).map((k) => C.boothColorer(mode, fake, tbl, rowsAt)(k));
  const g = paint('group'), k = paint('korea'), a = paint('award'), p = paint('plain');
  check([...groups.values()].join(',') === 'ai,rob,ai,,' && g[0] === C.GROUP_COLORS.ai && g[1] === C.GROUP_COLORS.rob && g[2] === g[3] && g[2] !== g[0] && k[0] !== k[1] && k[1] === k[2] && a[1] !== a[0] && a[0] === a[2] && new Set(p).size === 1 && p[0] === C.PLAIN, '지도 색칠: 분야 묶음(회사가 여럿이면 많은 쪽) · 한국 · 혁신상 · 한 색');
  const colors = [...Object.values(C.GROUP_COLORS), ...C.legend('korea', tbl).map((l) => l.color), ...C.legend('award', tbl).map((l) => l.color), C.PLAIN];
  const muted = (hex) => { const n = parseInt(hex.slice(1), 16); const [r, gg, b] = [n >> 16, (n >> 8) & 255, n & 255]; return (Math.max(r, gg, b) - Math.min(r, gg, b)) / Math.max(r, gg, b, 1) <= 0.45; };
  check(colors.every(muted) && C.legend('group', tbl).length === tbl.groups.length + 1 && C.legend('plain', tbl).length === 0 && new Set(Object.values(C.GROUP_COLORS)).size === 7, `지도 색은 모두 채도를 낮춘 색이고(${colors.length}가지) 범례가 칠하기마다 있다`);
  const realTable = await json('data/categories.json');
  check(realTable.groups.every((gr) => gr.k in C.GROUP_COLORS), '분야 묶음 일곱에 모두 색이 있다');
}

// 나누기와 내보내기: 목록 코드 · 링크 · 글 · 마크다운 · CSV.
{
  const Sh = await import('../web/share.js');
  const ids = ['0013000001MeUUaAAN', '0013A00001a1LD1QAM', 'MYS_Bellagio', 'short'];
  const mine = [{ id: ids[0], day: 2 }, { id: ids[2], day: 0 }];
  const code = Sh.planCode(mine);
  const link = Sh.shareLink('https://example.test/ces-2027/#/plan', mine);
  const back = Sh.readCode(link, ids);
  const odd = Sh.readCode(' 1LD1QAM.9 , zzzzzzz.1,short.-3,1LD1QAM.1,, ', ids);
  const merged = Sh.mergeItems(mine, [{ id: ids[1], day: 1 }, { id: ids[0], day: 4 }]);
  check(code === 'eUUaAAN.2,ellagio' && link === 'https://example.test/ces-2027/#plan=eUUaAAN.2,ellagio' && JSON.stringify(back) === JSON.stringify(mine) && JSON.stringify(odd) === JSON.stringify([{ id: ids[1], day: 5 }, { id: 'short', day: 0 }]) && merged.added === 1 && merged.items.length === 3 && merged.items[0].day === 2, '목록 코드 · 링크: 만들고 다시 읽으면 같다. 없는 회사 · 겹친 것은 빼고, 받은 것은 내게 없는 것만 더한다');
  const byId = new Map([[ids[0], [ids[0], 'Alpha | Mobility', '', 0, '0', 2, 0, ['W317@LVCC_W_MTG', '5131@LVCC_W']]], [ids[2], [ids[2], 'Bellagio "Suites"', '', -1, '', 0, 0, []]]]);
  const days = [{ key: 1, ko: '1/6 (수)', short: '1/6' }, { key: 2, ko: '1/7 (목)', short: '1/7' }, { key: 0, ko: '날짜 미정', short: '미정' }];
  const pk = new Map([['LVCC_W_MTG', '웨스트 홀 회의실'], ['LVCC_W', '웨스트 홀']]);
  const fakeData = { cats: ['Robotics'], catsKo: ['로봇'], countries: ['South Korea'], link: 'https://exhibitors.ces.tech/x?exhid={id}' };
  const text = Sh.planText(mine, days, byId, pk);
  const md = Sh.planMd(mine, days, byId, pk, '2026-11-20', '2026-12-20');
  const csv = Sh.planCsv(mine, days, byId, pk, fakeData);
  check(text.includes('■ 1/7 (목)\n1. Alpha | Mobility · 웨스트 홀 회의실 W317') && text.includes('목록 코드: eUUaAAN.2,ellagio') && md.includes('| 1 | Alpha / Mobility | W317, 5131 | 웨스트 홀 회의실, 웨스트 홀 |') && md.includes('## 날짜 미정') && csv.startsWith('\ufeff날짜,순서,회사') && csv.includes('"1/7","1","Alpha | Mobility","W317 / 5131","웨스트 홀 회의실 / 웨스트 홀","South Korea","로봇","https://exhibitors.ces.tech/x?exhid=0013000001MeUUaAAN"') && csv.includes('"Bellagio ""Suites"""'), '동선 내보내기: 단톡방 글 · 마크다운 표 · CSV');
}

// 지도와 오프라인.
const appJs = await readFile(join(dist, 'app.js'), 'utf8');
check(!html.includes('map3d') && !appJs.includes('map3d') && (await exists('map3d.js')), '3D 지도는 첫 화면에 싣지 않고 지도 화면에서 그때 불러온다');
// 첫 화면: 미리 받는 조각이 모두 있고, 3D · 코어 · 큰 자료는 미리 받지 않는다.
const preloads = [...html.matchAll(/<link rel="(?:modulepreload|preload)" href="([^"]+)"/g)].map((m) => m[1]);
let preloadOk = preloads.length > 0;
for (const f of preloads) preloadOk = preloadOk && (await exists(f)) && !/map3d|core\.|exhibitors|search-index|views\/(plan|diary)/.test(f);
check(preloadOk, `첫 화면이 미리 받는 조각 ${preloads.length}개가 모두 있고, 3D · 코어 · 전시사 자료는 거기에 없다`);
// 말 기능(듣기)은 누를 때 불러온다: 첫 화면이 싣는 조각 어디에도 고정으로 물려 있지 않다.
{
  const firstScreen = (await Promise.all(['app.js', 'store.js', 'data.js', 'offline.js', 'notify.js', 'alerts.js', 'dom.js', 'views/map.js', 'views/card.js'].map((f) => readFile(join(dist, f), 'utf8')))).join('\n');
  const fixed = [...firstScreen.matchAll(/^import [^;]*from '([^']+)';/gm)].map((m) => m[1]);
  const lazy = /speech|talk-ui|audio-store|talk\.js|views\/(listen|talk)/;
  check(!fixed.some((f) => lazy.test(f)) && !preloads.some((f) => lazy.test(f)) && appJs.includes("listen: () => import('./views/listen.js')"), '듣기는 첫 화면에 싣지 않고 누를 때 불러온다');
}
check(html.includes('id="update"') && appJs.includes('offline.update') && appJs.includes('startOffline'), '새 판 안내 자리가 있고, 서비스 워커는 첫 화면 뒤에 건다');
const sw = await readFile(join(dist, 'sw.js'), 'utf8');
const version = await json('version.json').catch(() => null);
const swFiles = JSON.parse(`[${(sw.match(/const FILES = \[(.*)\];/) || [])[1] || ''}]`);
check(!!version && sw.includes(JSON.stringify(version.v)) && !sw.includes('__VERSION__'), `판 이름이 찍혔다 (${version?.v})`);
const mustCache = ['./', 'index.html', 'app.js', 'app.css', 'tokens.css', 'tokens.js', 'frame.js', 'core.js', 'core.wasm', 'qr.js', 'route.js', 'map3d.js', 'views/card.js', 'views/plan.js', 'plancard.js', 'people-ui.js', 'views/rec.js', 'views/map.js', 'mapfind.js', 'views/list.js', 'exlist.js', 'hallgroups.js', 'bands.js', 'views/settings.js', 'views/diary.js', 'views/days.js', 'views/listen.js', 'views/talk.js', 'talk.js', 'speech.js', 'talk-ui.js', 'audio-store.js', 'share.js', 'colors.js', 'days.js', 'recommend.js', 'guide.js', 'alerts.js', 'notify.js', 'diary.js', 'locate.js', 'maps.js', 'data/places.json', 'data/booth-spots.json', 'data/info.json', 'version.json', 'manifest.webmanifest', 'icon/icon-192.png'];
// 디자인 토큰: tokens.css가 값의 원본이고, 지도 코드가 쓰는 tokens.js의 기본값이 한 글자도 다르지 않아야 한다.
// 화면 파일(app.css · views · 지도 코드)이 색을 직접 적지 않는 것도 본다 (design.md).
{
  const css = await readFile(join(dist, 'tokens.css'), 'utf8');
  const { DEFAULTS } = await import('../web/tokens.js');
  const bad = Object.entries(DEFAULTS).filter(([, [name, value]]) => !new RegExp(`${name}:\\s*${value};`, 'i').test(css)).map(([k]) => k);
  check(bad.length === 0, `디자인 토큰: tokens.js의 기본값 ${Object.keys(DEFAULTS).length}개가 tokens.css와 같다 (다른 것 ${bad.join(' ') || '없음'})`);
  const hexIn = async (f) => (await readFile(join(dist, f), 'utf8')).match(/#[0-9a-fA-F]{6}\b/g) || [];
  const strays = [];
  for (const f of ['app.css', 'colors.js', 'map3d.js', 'views/map.js', 'qr.js']) if ((await hexIn(f)).length) strays.push(f);
  check(strays.length === 0, `색 값을 화면 파일에 직접 적지 않는다 (tokens.css 한 곳): 어긴 파일 ${strays.join(' ') || '없음'}`);
  const shadow = [];
  for (const f of ['app.css']) if (/box-shadow|text-shadow|filter:\s*drop-shadow|gradient\(/.test(await readFile(join(dist, f), 'utf8'))) shadow.push(f);
  check(shadow.length === 0, '그림자 · 그라데이션이 없다 (design.md: 하지 않는 것)');
  // 메인 틀 (design.md "메인 틀"): 아래 탭 다섯, 뒤로 · 인터넷 없음 자리, 불러오는 중 · 오류 · 없는 화면은 frame.js 한 곳.
  const html = await readFile(join(dist, 'index.html'), 'utf8');
  const app = await readFile(join(dist, 'app.js'), 'utf8');
  const tabs = (html.match(/data-tab="/g) || []).length;
  check(tabs === 4 && html.includes('id="back"') && html.includes('id="net"') && html.includes('href="frame.js"'), `메인 틀: 아래 탭 ${tabs}개(넷) · 뒤로 · 인터넷 없음 줄이 있고 frame.js를 첫 화면과 같이 받는다`);
  // 2단계(11/22): 탭 넷 틀. 첫 화면 · 회사 탭이 없고, 열면 지도, 합친 화면은 알맞은 탭 아래에 선다. 지운 화면의 파일은 지은 것에 없다.
  {
    const views = [...app.matchAll(/^  (\w+): \(\) => import\('\.\/views\/(\w+)\.js'\),$/gm)].map((m) => m[1]);
    const tabOf = Object.fromEntries([...(app.match(/const TAB_OF = \{([^}]*)\}/)?.[1] || '').matchAll(/(\w+): '(\w+)'/g)].map((m) => [m[1], m[2]]));
    const want = { map: 'map', list: 'map', transit: 'map', plan: 'plan', rec: 'plan', days: 'plan', sessions: 'plan', diary: 'diary', listen: 'diary', talk: 'diary', people: 'diary', settings: 'settings', card: 'settings', collect: 'settings' };
    const gone = ['views/home.js', 'views/find.js', 'views/topics.js', 'views/askall.js', 'views/apply.js', 'views/onsite.js', 'views/info.js', 'askall.js', 'onsite.js', 'separate.js', 'topics.js', 'data/separate.json', 'data/onsite.json', 'data/topics.json', 'data/faq.json'];
    const stillThere = [];
    for (const f of gone) if (await exists(f)) stillThere.push(f);
    check(Object.entries(want).every(([k, v]) => tabOf[k] === v) && views.length === Object.keys(want).length && /replaceTo\(!getProfile\(\) && !sessionStorage\.getItem\('ces2027\.introLater'\) \? '#\/card' : '#\/map'\)/.test(app) && /new Set\(\['map', 'plan', 'diary', 'settings'\]\)/.test(app) && stillThere.length === 0,
      `탭 넷 틀: 앱을 열면 지도(명함이 없으면 명함부터), 화면 ${views.length}개가 지도 · 동선 · 일기 · 설정 아래에 서고, 첫 화면 · 회사 · 주제 판 · 알아둘 것 · 따로 신청 · 현장 안내 · 물어보기의 코드와 자료는 지은 것에 없다 (남은 것 ${stillThere.join(' ') || '없음'})`);
    const planV = await readFile(join(dist, 'views/plan.js'), 'utf8');
    const diaryV = await readFile(join(dist, 'views/diary.js'), 'utf8');
    const transitV = await readFile(join(dist, 'views/transit.js'), 'utf8');
    const mapfindV = await readFile(join(dist, 'mapfind.js'), 'utf8');
    const mapV3 = await readFile(join(dist, 'views/map.js'), 'utf8');
    check(planV.includes('다음에 갈 곳') && planV.includes('alertBands(') && ['#/rec', '#/days', '#/sessions'].every((h) => planV.includes(h)) && ['#/listen', '#/talk', '#/people'].every((h) => diaryV.includes(h)) && transitV.includes('info.moving') && mapV3.includes('findBox(') && mapV3.includes('#/transit') && mapV3.includes("href: '#/list'") && mapfindV.includes('getFinder'),
      '합친 자리: 갈 곳 맨 위에 "다음에 갈 곳" 한 곳과 띠, 갈 곳 아래에 강연 일정 · 추천 회사 · 내 시간, 일기 안에 듣기 · 대화 칸 · 만난 사람, 지도 위에 찾기 칸과 셔틀 · 오가는 법 · 전시사 목록');
    // 갈 곳(2026-11-23, 안 1): 날짜 한 줄(‹ 1월 6일 (수) · 남은 n곳 ›) → 다음에 갈 곳 한 곳 크게 → 그다음 곳들 → 다녀온 곳 접기 → "목록 고치기 · 지도에서 보기".
    // 줄에는 줄 전체 단추 하나(다녀온 곳의 줄에만 "다녀옴" 칸), 고치기는 회사 카드, 지도와 같은 번호, 도크 없음. "안 본 곳" 칩(R47)은 다녀온 곳 접기가 대신한다.
    const pcardV = await readFile(join(dist, 'plancard.js'), 'utf8');
    const rowFn = planV.slice(planV.indexOf('function item('), planV.indexOf('// ---- 회사 카드(큰 창)'));
    const rowButtons = (rowFn.match(/el\('button'/g) || []).length;
    const cardFn = planV.slice(planV.indexOf('function card('), planV.indexOf('function draw('));
    const toolsFn = planV.slice(planV.indexOf('// ---- 목록 고치기(큰 창)'), planV.indexOf('const toolsBtn ='));
    const storeV = await readFile(join(dist, 'store.js'), 'utf8');
    check(rowFn.includes('stop-open') && rowButtons === 2 && rowFn.includes("it.seen ? el('button', { class: 'check on'") && !rowFn.includes('select') && !rowFn.includes("'빼기'")
      && ['daynav', 'daynav-left', '남은 ${todo.length}곳', "'다 다녀옴'", '다음에 갈 곳', '그다음 ${rest.length}곳', '다녀온 곳 ${done.length}', '목록 고치기', '지도에서 보기', '날짜 없는 곳 ${noDate}곳 보기', "class: 'fold nodate'", '!it.day && !it.seen', '일기 쓰기', '#/diary/new/', '#/map/at/', '#/map/go/', '#/map/day/'].every((t) => planV.includes(t))
      && !['차례 정리', '날짜 채우기', '걷는 차례로', '날짜 미정', "'아직'", "'봤다'", '안 본 곳', 'daychip', "'마크다운'", "'CSV'", "'코드'"].some((t) => planV.includes(t))
      // 회사 카드: 검정 단추는 "길 안내" 하나, 1/5는 날짜 고르기에 없다, 위로 · 아래로 · 대화 · 명함 이벤트 · 로고는 없다
      && (cardFn.match(/class: 'btn( wide)?'/g) || []).length === 1 && cardFn.includes("text: '길 안내'") && cardFn.includes('days.filter((d) => !d.pre)') && cardFn.includes('갈 곳에서 빼기') && cardFn.includes('공식 쪽') && cardFn.includes('자리는 짐작')
      && !["'위로'", "'아래로'", '#/talk/', '명함 이벤트', 'attachImage', 'mapsLink('].some((t) => planV.includes(t))
      // 목록 고치기: 말 바꾸기 다섯, 검정 단추 없음
      && ['날짜 없는 곳을 날마다 나누기', '가까운 곳끼리 줄 세우기', '하루에 볼 곳', '다른 사람에게 보내기', '받은 목록 넣기', 'navigator.share'].every((t) => toolsFn.includes(t)) && !/class: 'btn'/.test(toolsFn.slice(toolsFn.indexOf('const codeInput')))
      && planV.includes("showToast(`${nameOf(id)} 다녀왔다.`") && /setTimeout\(hideToast, 6000\)/.test(planV)
      && /it\?\.day === 5 \? \{ \.\.\.it, day: 0 \}/.test(storeV) && /filter\(\(d\) => !d\.pre\)/.test(mapV3)
      && pcardV.includes('Escape') && pcardV.includes("role: 'dialog'") && !/class: 'dock'/.test(planV) && !planV.includes('<select')
      && /rest\[0\] === 'day'/.test(mapV3) && mapV3.includes('dayFocus') && mapV3.includes('function nextOfDay()') && mapV3.includes('곳만 보는 중') && mapV3.includes("text: '모두 보기'") && !mapV3.includes('nextStop(getInterests())'),
      '갈 곳(안 1): 날짜 한 줄에 그 날 남은 곳 수(칩 없음) · 다음에 갈 곳 한 곳 크게 · 그다음 곳들 · 다녀온 곳 접기(다녀옴 칸으로 되돌림) · 날짜 없는 곳 n곳 보기(빈 날은 검정 단추, 아니면 작은 한 줄) · 목록 고치기 · 지도에서 보기 · 회사 카드의 검정 단추는 길 안내 하나 · 1/5에는 회사를 넣지 못한다(카드 · 지도 · 저장 읽기) · "다녀왔다" 뒤 일기 쓰기 6초 · 지도의 다음 갈 곳은 고른 날의 회사만 · 아래 도크 없음');
    // 다시 짓기 6단계 일기 + 만난 사람: 일기 첫 묶음이 만난 사람(최근 세 명 + 명함 받기), 맨 위 회색 단추 셋 없음, 읽자마자 저장, 일기는 본 것 한 칸이면 된다.
    const peopleV = await readFile(join(dist, 'views/people.js'), 'utf8');
    const peopleUiV = await readFile(join(dist, 'people-ui.js'), 'utf8');
    check(diaryV.includes("class: 'panel met'") && diaryV.includes('slice(0, 3)') && diaryV.includes('#/people/new') && !diaryV.includes("class: 'segs'")
      && diaryV.includes("class: 'dock solo'") && diaryV.includes('본 것을 한 줄 적는다') && diaryV.includes('diaryDraft.v1') && diaryV.includes('#/listen') && diaryV.includes('#/talk')
      && peopleV.includes("rest[0] === 'new'") && peopleV.includes('result.merged > 0') && peopleV.includes('fresh: true') && /camBtn\.disabled = !can\.ok|disabled: !can\.ok/.test(peopleV) && !peopleV.includes("el('h2', { text: '카메라로 읽기' })")
      && peopleUiV.includes('safeHref') && peopleUiV.includes('removePerson'),
      '일기 + 만난 사람: 일기 첫 묶음이 "만난 사람"(최근 세 명 · 명함 받기 · 전체), 맨 위 회색 단추 셋이 없고, 검정 단추는 "일기 쓰기" 하나 · 명함을 읽으면(또는 붙여 넣으면) 바로 저장하고 같은 사람은 새 줄을 만들지 않는다 · 일기는 본 것 한 칸이면 저장되고 적던 글이 남는다 · 듣기 · 대화는 일기 쓰기 안에 있다');
    // 서비스 워커: 지운 영한 번역 모델이 폰에 남긴 것만 비우고 받아쓰기 모델 파일은 건드리지 않는다.
    const { default: vm } = await import('node:vm');
    const handlers = {};
    const store = new Map([
      ['ces2027-old', new Map()],
      ['ces2027keep-speech-v1', new Map([['https://x/vendor/speech/a.js', 1], ['https://x/vendor/translate/source-tokenizer.json', 1]])],
      ['transformers-cache', new Map([['https://huggingface.co/TigreGotico/opus-mt-en-ko-onnx/resolve/3f/int8/encoder_model.onnx', 1], ['https://huggingface.co/onnx-community/moonshine-tiny-ONNX/resolve/a6/x.onnx', 1]])],
    ]);
    const fakeCaches = { keys: async () => [...store.keys()], has: async (n) => store.has(n), delete: async (n) => store.delete(n), open: async (n) => ({ keys: async () => [...store.get(n).keys()].map((url) => ({ url })), delete: async (r) => store.get(n).delete(r.url) }) };
    const ctx = { self: { addEventListener: (k, f) => { handlers[k] = f; }, clients: { claim: async () => {} }, registration: { scope: 'https://x/' }, location: { origin: 'https://x' } }, caches: fakeCaches, Request: class {}, URL };
    vm.runInNewContext(sw.replace("'__VERSION__'", "'t'"), ctx);
    let pending;
    handlers.activate({ waitUntil: (p) => { pending = p; } });
    await pending;
    check(!store.has('ces2027-old') && !store.get('ces2027keep-speech-v1').has('https://x/vendor/translate/source-tokenizer.json') && store.get('ces2027keep-speech-v1').has('https://x/vendor/speech/a.js') && [...store.get('transformers-cache').keys()].length === 1 && [...store.get('transformers-cache').keys()][0].includes('moonshine') && /translationModel\.v1/.test(app),
      '서비스 워커: 켜질 때 이미 받아 둔 영한 번역 모델과 단어 사전만 폰에서 비우고(받아쓰기 모델 파일은 그대로), 번역 설정 열쇠도 치운다');
    // 3단계(11/22): 처음 들어오면 명함. 환영 한 줄 → 한 화면(별명 · 나만 필수) → 명함 + QR 둘 → "지도로". 설정에서 QR 보기 · 고치기.
    const cardV = await readFile(join(dist, 'views/card.js'), 'utf8');
    const settingsV = await readFile(join(dist, 'views/settings.js'), 'utf8');
    const cssV = await readFile(join(dist, 'app.css'), 'utf8');
    const required = (cardV.match(/return fail\('[^']*'/g) || []).filter((m) => /별명을 적는다|나를 하나 고른다/.test(m)).length;
    check(/class: 'welcome'/.test(cardV) && cardV.includes('환영한다') && required === 2 && cardV.includes("text: '더 적기 (선택)'") && ["field('한 줄', line)", "linkField('링크드인'", "linkField('깃허브'", "linkField('디스코드'"].every((w) => cardV.includes(w)) && !/\(선택\)', (line|github|discord|linkedin)/.test(cardV) && cardV.includes("href: '#/map', text: '지도로'") && /rest\[0\] === 'edit'/.test(cardV) && settingsV.includes("href: '#/card', text: 'QR 보기'") && settingsV.includes("href: '#/card/edit'") && /const intro = name === 'card' && !getProfile\(\)/.test(app) && /\.form\.big \.choices \{ grid-template-columns: 1fr 1fr/.test(cssV) && /\.form\.big \.field input \{ font-size: calc\(18px \* var\(--scale\)\)/.test(cssV),
      '처음 들어오면 명함: 환영 한 줄과 한 화면(별명 · 나만 꼭 필요하고 한 줄 · 링크드인 · 깃허브 · 디스코드는 "더 적기 (선택)" 아래), 만든 뒤 명함과 QR 그리고 "지도로", 설정 탭의 "QR 보기" · "명함 고치기", 큰 글씨(18px, 글자 크기 단계를 따른다)와 2 × 2 고르기');
    // 링크드인 칸(11/24, R56 안): 주소 전체 · 아이디 둘 다 받고, 적으면 QR이 맨 앞에 서고, 옛 꼴의 명함 · QR · 일기 파일은 그대로 읽힌다.
    {
      const C = await import('../web/views/card.js');
      const P = await import('../web/people.js');
      const li = 'https://www.linkedin.com/in/jaeyeup-lee';
      const same = ['jaeyeup-lee', '@jaeyeup-lee', 'linkedin.com/in/jaeyeup-lee', 'https://www.linkedin.com/in/jaeyeup-lee/', 'https://kr.linkedin.com/in/jaeyeup-lee?utm_source=share&utm_medium=ios_app', 'https://www.linkedin.com/in/jaeyeup-lee/details/experience/', 'https://www.linkedin.com/mwlite/in/jaeyeup-lee'];
      const ko = 'https://www.linkedin.com/in/%EC%9E%AC%EC%97%BD-%EC%9D%B4-123';
      check(same.every((t) => C.linkedinUrl(t) === li) && C.linkedinUrl('') === '' && C.linkedinUrl('  ') === '' && C.linkedinUrl('재엽-이-123') === ko && C.linkedinUrl(`${ko}/`) === ko,
        `링크드인 칸: 주소 전체(www. · kr. · 뒤에 ?… 가 붙은 것 포함)와 아이디만 적은 것 ${same.length}가지가 같은 프로필 주소가 되고, 비우면 건너뛰고, 한글 아이디는 QR에 담을 수 있는 꼴이 된다`);
      const wrong = ['https://www.linkedin.com/company/acme', 'https://lnkd.in/abc', 'Jaeyeup Lee', 'ab', 'https://linkedin.com.evil.example/in/abc', 'https://evil.example/linkedin.com/in/abc', 'javascript:alert(1)', 'a'.repeat(101), '가'.repeat(21), '%E0%A4%A'];
      const longest = [C.linkedinUrl('a'.repeat(100)), C.linkedinUrl('가'.repeat(20))];
      let qrOk = true;
      try { for (const t of [li, ko, ...longest]) qrCells(t); } catch { qrOk = false; }
      check(wrong.every((t) => C.linkedinUrl(t) === null) && longest.every((t) => t && t.length <= C.LINKEDIN_MAX) && qrOk && cardV.includes("class: 'field-error'") && /\.field-error \{/.test(cssV) && /addEventListener\('change', ok\)/.test(cardV),
        `링크드인 칸: 회사 쪽 · 줄인 주소 · 이름 · 남의 사이트 같은 틀린 글 ${wrong.length}가지는 받지 않고 그 칸 아래에 한 줄로 알린다. 받은 주소는 가장 긴 것도 인터넷 없이 QR이 된다`);
      const oldCard = { nick: '물개', tag: 'stu', line: '', github: 'octocat', discord: 'seal.bot' }; // 옛 꼴: 링크드인 칸이 없다
      const newCard = { ...oldCard, linkedin: 'linkedin.com/in/jaeyeup-lee' };
      const kinds = (p) => C.cardLinks(p).map((l) => l.kind).join(' ');
      const oldLinks = C.cardLinks(oldCard);
      check(kinds(newCard) === 'linkedin github discord' && C.cardLinks(newCard)[0].text === li && C.cardLinks(newCard)[0].shown === 'linkedin.com/in/jaeyeup-lee' && kinds({ ...oldCard, github: '', linkedin: 'jaeyeup-lee' }) === 'linkedin discord' && /\.qr\.lead \{[^}]*grid-column: 1 \/ -1/.test(cssV) && /links\.length % 2 === 1/.test(cardV) && !cardV.includes('주소를 적으면 QR이 생긴다`'),
        '내 명함의 QR 차례는 링크드인 → 깃허브 → 디스코드이고 적은 것만 보인다(빈 자리 표시 없음). 홀수 개면 맨 앞 것이 크게 한 줄을 차지한다');
      check(kinds(oldCard) === 'github discord' && oldLinks[0].text === QR[0][0] && oldLinks[1].text === QR[1][0] && kinds({ nick: '물개', tag: 'stu' }) === '' && kinds(null) === '' && kinds({ ...oldCard, linkedin: 'https://lnkd.in/abc' }) === 'github discord',
        '옛 꼴의 명함(링크드인 칸이 없다)은 그대로 읽힌다: 깃허브 · 디스코드 QR에 담기는 글이 전과 같고, 주소가 하나도 없는 명함 · 폰에 남은 틀린 값에도 깨지지 않는다');
      const got = P.parseScan(li, 'auto'), pasted = P.parseScan('linkedin.com/in/jaeyeup-lee'), gotKo = P.parseScan(ko, 'auto');
      check(got.ok && got.link.kind === 'linkedin' && got.link.url === li && pasted.ok && pasted.link.key === got.link.key && gotKo.ok && gotKo.link.kind === 'linkedin' && P.kindKo(got.link.kind) === '링크드인'
        && P.parseScan(QR[0][0], 'auto').link?.kind === 'github' && P.parseScan(QR[1][0], 'auto').link?.kind === 'discord' && P.safeHref(li) === li,
        '명함을 받는 쪽: 링크드인 QR과 붙여 넣은 링크드인 주소가 같은 사람(링크드인)으로 읽히고, 옛 QR(깃허브 주소 · 디스코드 아이디)도 전과 같이 읽힌다');
      const when = new Date('2027-01-07T03:00:00Z');
      const outNew = JSON.stringify(diary.bundle(wrote, newCard, when)), outOld = JSON.stringify(diary.bundle(wrote, oldCard, when));
      check(outNew === outOld && !/linkedin|jaeyeup-lee/.test(outNew + diary.asText(wrote, newCard, () => '') + diary.fileName(newCard)) && diary.bundle(wrote, newCard, when).v === 1,
        '일기 파일 · 내보내기: 링크드인을 적은 명함으로 내보내도 옛 명함과 글자 하나 다르지 않다(판 1 그대로, 명함에서는 별명과 태그만 간다)');
    }
    // 4단계(11/22): 지도 자세히. 확대 단계 셋 · 글자 13px · 겹치면 숨김 · 홀마다 나눠 받기 · 손짓 · 카드.
    {
      const mm = await import('../web/mapmath.js');
      const ratio = 1.5;
      const box = [0, 0, 400, 100];
      const fit = mm.fitBox(box, ratio);
      const z = mm.zoomBox([0, 0, 360, 540], 0.5, 90, 135);
      const tiny = mm.zoomBox([0, 0, 100, 150], 0.1, 50, 75);
      const huge = mm.zoomBox([0, 0, 3000, 4500], 5, 0, 0);
      const vf = mm.viewFor([100, 100, 300, 160], 360, 600, { top: 120, bottom: 300 });
      check(mm.levelOf(3000) === 'campus' && mm.levelOf(1300) === 'campus' && mm.levelOf(900) === 'hall' && mm.levelOf(519) === 'booth' && mm.levelOf(100) === 'booth' && mm.MIN_FONT === 13, '확대 단계 셋: 칸 너비 1300 이상은 캠퍼스, 520 ~ 1300은 홀, 520 아래는 부스이고 글자는 13px 아래로 줄지 않는다');
      check(Math.abs((fit[3] - fit[1]) / (fit[2] - fit[0]) - ratio) < 1e-9 && fit[0] <= 0 && fit[2] >= 400 && fit[1] <= 0 && fit[3] >= 100, '보는 칸 맞추기: 상자가 다 보이고 화면 비율과 같다');
      check(Math.abs(z[0] - 45) < 1e-9 && Math.abs(z[2] - 225) < 1e-9 && Math.abs(z[1] - 67.5) < 1e-9 && mm.widthOf(tiny) >= mm.MIN_W - 1e-9 && mm.widthOf(huge) <= mm.MAX_W + 1e-9, '확대 · 축소는 누른 점을 그대로 두고, 너비는 한계(90 ~ 3800) 안이다');
      const sx = (x) => (x - vf[0]) / ((vf[2] - vf[0]) / 360);
      const sy = (z2) => (z2 - vf[1]) / ((vf[2] - vf[0]) / 360);
      check(sx(100) >= 11.9 && sx(300) <= 348.1 && sy(100) >= 119.9 && sy(160) <= 300.1, '찾기 칸(위)과 카드(아래)를 피해 보이는 칸 가운데에 놓는다');
      const cands = [
        { id: 'a', x: 100, y: 100, text: '노스 홀', size: 13, prio: 60, anchor: 'middle' },
        { id: 'b', x: 105, y: 102, text: '센트럴 홀', size: 13, prio: 50, anchor: 'middle' },
        { id: 'c', x: 200, y: 200, text: '11735 Union bio', alts: ['11735 Uni', '11735'], size: 13, prio: 30, anchor: 'start', dx: 9 },
        { id: 'd', x: 205, y: 203, text: '11736 Other', alts: ['11736 Oth'], size: 13, prio: 20, anchor: 'start', dx: 9 },
        { id: 'e', x: 355, y: 300, text: '밖으로 나감', size: 13, prio: 99, anchor: 'start' },
      ];
      const placed = mm.layoutLabels(cands, { width: 360, height: 600 });
      let over = 0;
      for (let i2 = 0; i2 < placed.length; i2++) for (let j = i2 + 1; j < placed.length; j++) { const a = placed[i2].rect, b = placed[j].rect; if (a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3]) over++; }
      check(placed.some((p) => p.id === 'a') && !placed.some((p) => p.id === 'b') && !placed.some((p) => p.id === 'e') && over === 0 && placed.every((p) => p.size >= 13) && placed.find((p) => p.id === 'c')?.text === '11735 Union bio', '글자 놓기: 중요한 것부터 놓고 겹치거나 화면 밖으로 나가는 것은 숨기며 글자는 13px 이상이다');
      const crowded = mm.layoutLabels([{ id: 'x', x: 50, y: 50, text: '11735 Union bio', alts: ['11735 U', '11735'], size: 13, prio: 90, anchor: 'start' }, { id: 'y', x: 50, y: 52, text: '높은 것', size: 13, prio: 99, anchor: 'start' }], { width: 360, height: 600 });
      check(crowded.length === 1 && crowded[0].id === 'y', '좁은 곳에서는 높은 순위 하나만 남고 나머지는 숨는다');
      // 길 안내의 셈 (web/nav.js)
      const nv = await import('../web/nav.js');
      const lvcc = { k: 'lvcc', toWorld: { scale: 1 }, geo: { lat: 36.1313, lng: -115.1525 } };
      const ven = { k: 'ven', toWorld: { scale: 0.5 }, geo: { lat: 36.1216, lng: -115.1658 } };
      const near = nv.estimate([0, 0], [300, -300], { campusFrom: lvcc, campusTo: lvcc });
      const scaled = nv.estimate([0, 0], [100, 0], { campusFrom: ven, campusTo: ven });
      const far = nv.estimate([0, 0], [0, 0], { campusFrom: lvcc, campusTo: ven });
      const here = nv.estimate([0, 0], [10, 10], { campusFrom: lvcc, campusTo: lvcc });
      const coarse = nv.estimate([0, 0], [10, 10], { campusFrom: lvcc, campusTo: lvcc, coarse: true });
      check(nv.bearingWord(10, -10) === '북동쪽' && nv.bearingWord(0, 50) === '남쪽' && nv.bearingWord(-30, 0) === '서쪽' && nv.fmtDistance(42) === '40m' && nv.fmtDistance(433) === '450m' && nv.fmtDistance(1530) === '1.5km'
        && near.sameCampus && Math.abs(near.meters - 530.33) < 0.5 && near.minutes === 8 && near.word === '북동쪽' && Math.abs(scaled.meters - 250) < 0.01 && !far.sameCampus && far.meters > 1900 && far.meters < 2300 && here.arrived && !coarse.arrived,
      '길 안내 셈: 방향(북동쪽 · 남쪽 …) · 거리(40m · 450m · 1.5km) · 걷는 시간(분당 70m) · 줄여 그린 캠퍼스는 그만큼 더 멀다 · 다른 캠퍼스는 실제 위도 · 경도 거리 · 30m 안이면 도착이고 GPS가 캠퍼스까지만 맞았으면 도착으로 치지 않는다');
      // 홀마다 나눈 자료
      const idx = await json('data/halls/index.json').catch(() => null);
      if (idx && (await exists('data/exhibitors.json'))) {
        const full = await json('data/exhibitors.json');
        const bad = [];
        const idsAt = new Map();
        for (const [k, n] of Object.entries(idx.halls)) {
          const doc = await json(`data/halls/${k}.json`);
          if (doc.ex.length !== n || doc.hall !== k || !doc.cats || !doc.catsKo || !doc.countries || !doc.link) bad.push(k);
          for (const r of doc.ex) { if (!r[7].some((b) => b.endsWith(`@${k}`))) bad.push(`${k}:${r[0]}`); idsAt.set(r[0], (idsAt.get(r[0]) || 0) + 1); }
        }
        const missing = full.ex.filter((r) => r[7].length && !idsAt.has(r[0]) && r[7].some((b) => /^[A-Za-z0-9_]+$/.test(b.slice(b.lastIndexOf('@') + 1)))).length;
        const sizes = await Promise.all(Object.keys(idx.halls).map(async (k) => (await readFile(join(dist, `data/halls/${k}.json`))).length));
        const biggest = Math.max(...sizes);
        const fullSize = (await readFile(join(dist, 'data/exhibitors.json'))).length;
        check(bad.length === 0 && missing === 0 && biggest < fullSize * 0.4 && swFiles.includes('data/halls/index.json') && (await readFile(new URL('../.github/workflows/pages.yml', import.meta.url), 'utf8')).includes('scripts/split-halls.mjs dist'), `전시사 자료는 홀 ${Object.keys(idx.halls).length}곳으로 나뉜다: 홀 자료마다 그 홀에 부스가 있는 회사만(${bad.length ? bad.slice(0, 3).join(' ') : '어긋남 없음'}), 빠진 회사 ${missing}곳, 가장 큰 홀 ${(biggest / 1024).toFixed(0)} KB(전체 ${(fullSize / 1024).toFixed(0)} KB), 오프라인에도 담긴다`);
      } else {
        lines.push('주의 | 전시사 자료가 없어 홀 나누기는 보지 않았다');
      }
      // 지도 코드: 첫 열기에 전시사 자료를 받지 않고, 손짓 · 카드 · 칩 · 3D를 갖췄는지
      const mapSrc = await readFile(join(dist, 'views/map.js'), 'utf8');
      const gestSrc = await readFile(join(dist, 'mapgesture.js'), 'utf8');
      const sheetSrc = await readFile(join(dist, 'mapsheet.js'), 'utf8');
      const appJs2 = await readFile(join(dist, 'app.js'), 'utf8');
      const hallSrc = await readFile(join(dist, 'hallgroups.js'), 'utf8');
      const htmlNow = await readFile(join(dist, 'index.html'), 'utf8');
      check((mapSrc.match(/getExhibitors\(/g) || []).length === 1 && !/getExhibitors\(/.test(appJs2) && !/^import .*map3d/m.test(mapSrc) && mapSrc.includes("import('../map3d.js')") && mapSrc.includes('HALL_GROUPS') && ['웨스트', '센트럴', '노스', '사우스', '베네시안'].every((w) => hallSrc.includes(w)) && /ensureHall\(/.test(mapSrc) && !htmlNow.includes('map3d'),
        '지도 첫 열기: 전시사 전체 자료는 찾기 · 3D · 관심 회사가 있을 때만 받고(홀로 가까이 가면 그 홀 것만), 3D는 단추를 누를 때 불러오며, 홀 바로 가기 칩이 있다');
      // 공식 지도 기준: 길 이름 · 홀별 부스 번호 범위
      const pl = await json('data/places.json');
      const mf = await import('../web/mapfind.js');
      const named = new Set(pl.roads.filter((r) => r.name).map((r) => r.name));
      check(['Las Vegas Blvd', 'Paradise Rd', 'Desert Inn Rd', 'Convention Center Dr', 'Sierra Vista Dr', 'Elvis Presley Dr', 'North Rd', 'Joe W. Brown Dr'].every((n) => named.has(n)) && mapSrc.includes('roadLabels') && mapSrc.includes('boothRange(')
        && mf.hallOfNumber('14731', pl.boothRules.numbers)?.place === 'LVCC_N' && mf.hallOfNumber('30001', pl.boothRules.numbers)?.place === 'LVCC_S1' && mf.hallOfNumber('5000A', pl.boothRules.numbers)?.place === 'LVCC_W' && mf.hallOfNumber('2999', pl.boothRules.numbers) === null && mf.hallOfNumber('삼성', pl.boothRules.numbers) === null,
      '공식 LVCC 지도의 길 이름 여덟이 지도에 글자로 나오고, 홀 카드에 부스 번호 범위가 있으며, 회사 자료에 없는 부스 번호도 번호 범위로 어느 홀인지 알려 준다');
      // 정식 배치도 자동 반영의 셈 (scripts/floorplan-lib.mjs · check-floorplan.mjs · import-booth-spots.mjs)
      const fp = await import('../scripts/floorplan-lib.mjs');
      const place = { k: 'T', poly: [[100, 200], [300, 200], [300, 260], [100, 260]] };
      const got = fp.convert({ plan: { bbox: [0, 0, 1000, 300] }, booths: { A1: [0, 0], A2: [1000, 300], A3: [500, 150], B1: [2000, 150], bad: ['x', 1] } }, place);
      const swapped = fp.convert({ booths: { A1: [0, 0], A2: [300, 1000] } }, place, { swap: true });
      const merged = fp.merge({ about: 'x', edition: null, source: null, places: { OLD: { 1: [1, 2] }, T: { A1: [9, 9], Z: [5, 5] } } }, 'T', { A1: [1, 1] }, { edition: '2026-12-01', source: 'u' });
      const cov = fp.coverage(['A1', 'A2', 'A2', 'A9'], { A1: [1, 1], A2: [2, 2] });
      const text = '{ "k": "T", "c": "x", "boothSpots": "guess", "maps": {} },\n{ "k": "U", "boothSpots": "guess" }';
      const marked = fp.markOfficial(text, 'T');
      check(fp.parseValidHalls('var validHalls = [];') !== null && fp.parseValidHalls('validHalls = []').length === 0 && fp.parseValidHalls("validHalls = ['a', 'b']").join() === 'a,b' && fp.parseValidHalls('<p>없음</p>') === null && !fp.isOpen([]) && fp.isOpen(['LVCC_N']) && !fp.isOpen(null)
        && got.spots.A1.join() === '100,200' && got.spots.A2.join() === '300,260' && got.spots.A3.join() === '200,230' && got.outside.join() === 'B1' && !('bad' in got.spots) && swapped.spots.A2.join() === '300,260' && merged.places.OLD[1].join() === '1,2' && merged.places.T.A1.join() === '1,1' && merged.places.T.Z.join() === '5,5' && merged.edition === '2026-12-01'
        && cov.total === 3 && cov.have === 2 && cov.missing.join() === 'A9' && marked.includes('"boothSpots": "official"') && marked.split('official').length === 2 && fp.markOfficial(text, 'Q') === null,
      '정식 배치도 자동 반영의 셈: validHalls 읽기 · 배치도 좌표를 장소 상자에 맞춰 옮기기(방향 바꿈 포함) · 벗어난 것 거르기 · booth-spots.json에 합치기 · 모자라는 부스 세기 · 한 장소만 official로 바꾸기');
      const wf = await readFile(new URL('../.github/workflows/floorplan-watch.yml', import.meta.url), 'utf8');
      check(wf.includes('cron:') && wf.includes('check-floorplan.mjs') && wf.includes("steps.plan.outputs.state == 'open'") && wf.includes('gh issue create') && wf.includes('issues: write') && wf.includes('gh issue list --label floorplan --state open'), '정식 배치도 감시: 매일 한 번 공식 사이트를 보고, 열렸을 때만 이슈 하나를 만든다(이미 열린 이슈가 있으면 또 만들지 않는다)');
      check(/startNav\(/.test(mapSrc) && /길 안내 시작/.test(mapSrc) && /function endNav/.test(mapSrc) && /navFollow/.test(mapSrc) && /map\/go|rest\[0\] === 'go'/.test(mapSrc) && /estimate\(/.test(mapSrc) && /\/\/ ---- 길 안내/.test(mapSrc),
        '길 안내: 카드의 "길 안내 시작" · 아래 띠(남은 거리 · 걷는 시간 · 방향 · 끝내기) · 걸으면 지도가 따라오고 손으로 끌면 멈춘다 · 다음 갈 곳에서도 시작한다(#/map/go/<회사>)');
      check(/pointerType|pointers\.size === 2/.test(gestSrc) && /DOUBLE_MS/.test(gestSrc) && /addEventListener\('wheel'/.test(gestSrc) && /requestAnimationFrame/.test(gestSrc) && /swallow/.test(gestSrc) && /sheet-grip/.test(sheetSrc) && /'half'/.test(sheetSrc) && /'full'/.test(sheetSrc) && /closed/.test(sheetSrc),
        '손짓: 한 손가락 끌기 · 두 손가락 벌리기 · 두 번 톡 · 휠, 프레임마다 한 번만 그리고 끌고 난 뒤 click은 막는다. 카드는 반쯤 → 끝까지 끌어올리고 아래로 끌면 닫힌다');
    }
  }
  check(['loading()', 'failed(', 'missing(', 'history.back()'].every((w) => app.includes(w)) && !/p\.textContent = '화면을 불러오지 못했다/.test(app), '메인 틀: 느린 망엔 "불러오는 중", 못 불러오면 "다시 열기", 없는 주소는 첫 화면으로 말없이 보내지 않고 알린다, 뒤로는 앱 안 기록을 따른다');
  // 테마와 짧은 화면 (design.md "테마" · "글과 길이"): 밝게 · 어둡게 · 자동, 탭마다 강조색, 첫 화면은 지금 할 일만.
  const tokCss = await readFile(join(dist, 'tokens.css'), 'utf8');
  const themeJs = await readFile(join(dist, 'theme.js'), 'utf8');
  const settingsJs = await readFile(join(dist, 'views/settings.js'), 'utf8');
  const mapV2 = await readFile(join(dist, 'views/map.js'), 'utf8');
  const appCss = await readFile(join(dist, 'app.css'), 'utf8');
  const darkBlock = (tokCss.split(':root[data-theme="dark"]')[1] || '').split('/* 탭마다')[0];
  const darkVars = new Set([...darkBlock.matchAll(/--([a-z0-9-]+):/g)].map((m) => m[1]));
  const lightVars = [...tokCss.split(':root[data-theme="dark"]')[0].matchAll(/--((?:bg|panel|panel-2|ink|ink-2|accent|on-accent|mint|peach|lilac|warn|map-[a-z]+|day-\d|group-[a-z]+|tab-[a-z]+(?:-soft)?))\s*:/g)].map((m) => m[1]);
  const lacking = lightVars.filter((v) => !darkVars.has(v));
  check(lacking.length === 0 && /--qr-bg/.test(tokCss) && !darkVars.has('qr-bg') && !darkVars.has('qr-ink'), `어둡게: 밝게의 색 ${lightVars.length}개가 모두 어둡게에도 있다 (빠진 것 ${lacking.join(' ') || '없음'}). QR 색은 어둡게에서도 그대로다`);
  // 다시 짓기 8단계 디자인 마감: 제목 24px 한 줄 · 12px 글자 없음 · 두 겹 도크 없음(solo만 탭 위) · 링크 모양 회색 칩 없음 · 선택된 탭은 굵은 선 · 지도 머리 접기 · 카드가 열리면 아래 묶음 가림 · 종이 명함 질문은 설정에만(2026-11-23, 갈 곳의 띠에서 뺐다) · 첫 명함은 필수 둘 다음에 바로 단추.
  {
    const cardJs = await readFile(join(dist, 'views/card.js'), 'utf8');
    const planJs = await readFile(join(dist, 'views/plan.js'), 'utf8');
    const viewsDir = await readdir(join(dist, 'views'));
    let linkChips = 0;
    for (const f of viewsDir.filter((x) => x.endsWith('.js'))) linkChips += ((await readFile(join(dist, 'views', f), 'utf8')).match(/class: 'seg', href|class: 'chip-go', href/g) || []).length;
    const dockRule = appCss.match(/(?:^|\n)\.dock \{[^}]*\}/)?.[0] || '';
    const formStart = cardJs.indexOf("el('div', { class: 'field' }, el('span', { class: 'label', text: '나' }), tags)");
    check(/--fs-title: calc\(24px \* var\(--scale-head\)\)/.test(tokCss) && /--fs-fine: calc\(13px \* var\(--scale\)\)/.test(tokCss)
      && !/position: sticky/.test(dockRule) && /\.dock\.solo \{[^}]*position: sticky/.test(appCss) && linkChips === 0
      && /\.tabs a\[aria-current="page"\] svg \{[^}]*stroke-width: 2\.[5-9]/.test(appCss)
      && /body\[data-tab="map"\]:not\(\.sub\) \.brand \{ display: none; \}/.test(appCss) && mapV2.includes('find-tag') === false && (await readFile(join(dist, 'mapfind.js'), 'utf8')).includes('find-tag')
      && appCss.includes('.mappage:has(.mapx[data-sheet="half"]') && /\.mapx-top \{[^}]*background: var\(--bg\)/.test(appCss)
      && !cardJs.includes('paperPanel(showFrom),\n') && settingsJs.includes('paperPanel(showFrom)') && !/종이 명함이 있나요|setPaper|class: 'btn'/.test(await readFile(join(dist, 'bands.js'), 'utf8'))
      && formStart > 0 && cardJs.indexOf("class: 'dock'", formStart) > 0 && cardJs.indexOf("class: 'dock'", formStart) < cardJs.indexOf("field('한 줄', line)", formStart)
      && planJs.includes('boothLines(') && (await readFile(join(dist, 'company-extra.js'), 'utf8')).includes('부스 ${booths.length}곳'),
      '디자인 마감: 제목은 24px 한 줄 · 12px 글자가 없다(13px부터) · 아래 도크를 걷고 "일기 쓰기"만 탭 바로 위에 붙는다 · 링크 모양 회색 칩이 없다 · 선택된 탭은 굵은 선 · 지도 탭은 머리를 접고 "비공식"을 찾기 칸에 · 카드가 열리면 지도 아래 묶음을 가린다 · 종이 명함 질문은 설정에만 있고 갈 곳의 띠에는 검정 단추가 없다 · 첫 명함은 필수 둘 다음에 바로 단추 · 부스가 여럿인 회사는 카드에 모두 보인다');
    // 실제 아이폰에서 찾은 것(11/22 폰 확인): 날짜 · 시간 칸의 기본 모양 끄기 · 카드가 열리면 페이지가 당겨지지 않기 · 카드의 바퀴 쓸기 · × 단추 둘 · + 단추 글자 선택 막기 · 세션 안내 글 줄바꿈과 단추 사이.
    const sheetJs = await readFile(join(dist, 'mapsheet.js'), 'utf8');
    const findJs = await readFile(join(dist, 'mapfind.js'), 'utf8');
    check(/input\[type="date"\], input\[type="time"\] \{[^}]*appearance: none/.test(appCss)
      && /html:has\(\.mapx\[data-sheet="half"\], \.mapx\[data-sheet="full"\]\) \{ overscroll-behavior-y: none; \}/.test(appCss) && /\.mapx\[data-sheet="full"\] \.chips \{ visibility: hidden; \}/.test(appCss)
      && /addEventListener\('wheel'/.test(sheetJs) && /passive: false/.test(sheetJs) && sheetJs.includes("'aria-label': '카드 닫기'") && findJs.includes("'aria-label': '찾는 글자 지우기'")
      && /\.find:has\(input:not\(:placeholder-shown\)\) \.find-clear \{ display: flex; \}/.test(appCss) && /\.find-clear, \.sheet-close \{[^}]*width: var\(--tap-min\); height: var\(--tap-min\)/.test(appCss)
      && /\.ctl \{[^}]*user-select: none;[^}]*touch-action: manipulation/.test(appCss) && /\.lead \{[^}]*word-break: keep-all/.test(appCss) && /\.session \.row-actions \{[^}]*gap: var\(--s2\)/.test(appCss)
      && !mapV2.includes("      guide,\n"),
      '폰에서 찾은 것: 날짜 · 시간 칸은 기본 모양을 꺼 카드 밖으로 나가지 않는다 · 카드가 열리면 페이지가 당겨지지 않고 카드가 바퀴 쓸기를 받는다 · 찾기 칸 지우기와 카드 닫기(×, 44px, 이름 있음) · + 단추 글자가 선택되지 않는다 · 세션 안내 글은 낱말에서 줄을 바꾸고 단추 사이는 8px · 부스 없는 회사 카드에 "null"이 없다');
    // 폰 확인 2차: 새 판으로 다시 열기 전에 새 파일을 받아 둔다(띠 · 새로 고침 · 저절로 한 번) · 카드 자리의 입력은 지도가 받지 않는다 · 화면 글자는 선택되지 않는다 · 카드는 열 때마다 맨 위 · 찾기 시작하면 카드를 닫는다.
    const offJs = await readFile(join(dist, 'offline.js'), 'utf8');
    const appJs2 = await readFile(join(dist, 'app.js'), 'utf8');
    const gestJs2 = await readFile(join(dist, 'mapgesture.js'), 'utf8');
    const htmlBoot = await readFile(join(dist, 'index.html'), 'utf8');
    check(/export async function freshen\(\)/.test(offJs) && /fetch\(request\.url, \{ cache: 'reload' \}\)/.test(offJs) && /export async function healOnce/.test(offJs) && offJs.includes("'ces2027.boot.v1'")
      && /getElementById\('update-go'\)[^\n]*reopen\(\)/.test(appJs2) && /healOnce\(e\)/.test(appJs2)
      && htmlBoot.includes('"ces2027.boot.v1"') && htmlBoot.indexOf('"ces2027.boot.v1"') < htmlBoot.indexOf('<link rel="modulepreload" href="app.js">') && /cache:"reload"/.test(htmlBoot)
      && /const onMap = /.test(gestJs2) && (gestJs2.match(/if \(!onMap\(ev\)\) return;/g) || []).length === 2
      && /body \{ -webkit-user-select: none; user-select: none; \}/.test(appCss) && /input, textarea, select,[^{]*\{ -webkit-user-select: text; user-select: text; \}/.test(appCss)
      && /setState\(next === 'closed' \? 'half' : next\);\n[^\n]*\n    body\.scrollTop = 0;/.test(sheetJs) && /onType\?\.\(\)/.test(findJs) && /onType: \(\) => \{ if \(sheet\.state\(\) !== 'closed'\) sheet\.close\(\); \}/.test(mapV2),
      '폰 확인 2차: 새 판으로 다시 열기 전에 새 파일을 받아 둔다(띠 · 새로 고침 · 화면 조각을 못 불러오면 한 번) · 카드 자리에서 시작한 입력은 지도가 받지 않는다 · 화면 글자는 길게 눌러도 선택되지 않는다(적는 칸은 된다) · 카드는 열 때마다 맨 위부터 · 찾는 글자를 넣으면 카드를 닫는다');
  }
  // 다시 짓기 7단계: 글자 크기 네 단계(기본 100 · 크게 115 · 더 크게 130 · 가장 크게 150%). 첫 그림 전에 걸리고, 제목은 상한, 지도 글자는 130%까지.
  {
    const scales = ['2', '3', '4'].map((n) => tokCss.match(new RegExp(':root\\[data-text="' + n + '"\\] \\{([^}]*)\\}'))?.[1] || '');
    const val = (block, name) => Number((block.match(new RegExp('--' + name + ': ([0-9.]+)')) || [])[1]);
    const body = [1, ...scales.map((b) => val(b, 'scale'))];
    const head = [1, ...scales.map((b) => val(b, 'scale-head'))];
    const mapS = [1, ...scales.map((b) => val(b, 'scale-map'))];
    const fsVars = ['title', 'now', 'h2', 'body', 'small', 'note', 'fine'].every((k) => new RegExp('--fs-' + k + ': calc\\(\\d+px \\* var\\(--scale(-head)?\\)\\)').test(tokCss));
    const sizeBox = settingsJs.slice(settingsJs.indexOf('function sizeBox'), settingsJs.indexOf('function themeBox'));
    check(JSON.stringify(body) === '[1,1.15,1.3,1.5]' && head.every((h, k) => h <= body[k] && h <= 1.25) && Math.max(...mapS) === 1.3 && fsVars
      && themeJs.includes("'ces2027.text.v1'") && themeJs.includes('data-text') && themeJs.includes('window.cesText')
      && (await readFile(join(dist, 'index.html'), 'utf8')).indexOf('theme.js') < (await readFile(join(dist, 'index.html'), 'utf8')).indexOf('<body')
      && ['기본', '크게', '더 크게', '가장 크게'].every((k) => sizeBox.includes("ko: '" + k + "'") || settingsJs.includes("ko: '" + k + "'")) && settingsJs.indexOf('sizeBox(),') > 0 && settingsJs.indexOf('sizeBox(),') < settingsJs.lastIndexOf('themeBox()')
      && mapV2.includes('mapScale()') && !/\bMIN_FONT\b.*size:/.test(mapV2.replace(/import .*\n/, '')),
      `글자 크기: 네 단계(배율 ${body.join(' · ')}, 제목은 ${head.join(' · ')}까지만, 지도 글자는 ${Math.max(...mapS)}배까지)를 첫 그림 전에 걸고 설정 맨 위에서 고른다`);
  }
  // 무채색 테마(11/22): 회색 단계 + 강조색 하나. 탭마다 다른 강조색 · 파스텔 면이 없다. 회색이 아닌 값은 강조색 계열 · 상태색 · 고를 때만 쓰는 분야 칠하기뿐이다.
  const lightCss = tokCss.split(':root[data-theme="dark"]')[0];
  const tokVal = (css, n) => (css.match(new RegExp(`--${n}:\\s*(#[0-9a-fA-F]{6});`)) || [])[1];
  const isGray = (hex) => { const n = parseInt(hex.slice(1), 16); return (n >> 16) === ((n >> 8) & 255) && ((n >> 8) & 255) === (n & 255); };
  const chroma = [...lightCss.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6});/g)].filter((m) => !isGray(m[2])).map((m) => m[1]);
  const okChroma = new Set(['accent', 'accent-soft', 'mint', 'warn', 'map-korea', 'map-best', 'map-honoree', 'day-1', 'day-2', 'day-3', 'day-4', 'day-5']);
  const strayChroma = chroma.filter((n) => !okChroma.has(n) && !n.startsWith('group-'));
  const accentHue = (hex) => { const n = parseInt(hex.slice(1), 16); const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255]; return b > g && g >= r; };
  check(!/--tab-/.test(tokCss) && !/body\[data-tab=/.test(tokCss) && !/--tab:/.test(appCss) && strayChroma.length === 0 && ['accent', 'accent-soft', 'mint', 'map-korea', 'map-best', 'map-honoree', 'day-1', 'day-2', 'day-3', 'day-4', 'day-5'].every((n) => accentHue(tokVal(lightCss, n))) && tokCss.includes('--btn:') && tokCss.includes('--on-btn:') && app.includes('document.body.dataset.tab'),
    `무채색 테마: 탭마다 다른 강조색이 없고, 회색이 아닌 색은 강조색 하나의 계열 · 상태색 · 분야 칠하기(고를 때만)뿐이다 (그 밖의 색 ${strayChroma.join(' ') || '없음'}), 단추는 검정 칠한 단추 + 글자 단추`);
  const headPos = (needle) => html.indexOf(needle);
  check(headPos('src="theme.js"') > 0 && headPos('src="theme.js"') < headPos('href="tokens.css"') + 1000 && /prefers-color-scheme: dark/.test(themeJs) && /'light'/.test(themeJs) && /'dark'/.test(themeJs) && ['자동', '밝게', '어둡게'].every((w) => settingsJs.includes(w)) && /ces2027\.theme\.v1/.test(themeJs) && settingsJs.includes('setTheme') && /settings: \(\) => import/.test(app) && html.includes('href="#/settings"'), '테마: 설정에서 자동 · 밝게 · 어둡게를 고르고, theme.js가 첫 그림 전에 폰 설정(prefers-color-scheme)을 읽어 정한다');
  check(!/askPermission|offline\.install/.test(mapV2) && /askPermission/.test(settingsJs) && ['명함', '알림', '인터넷 없이', '내보내기'].every((w) => settingsJs.includes(w)), '명함 · 알림 · 인터넷 없이 · 내보내기는 설정 탭에 있다');
  const tabN = (html.match(/<a href="#\/[a-z]+" data-tab=/g) || []).length;
  check(tabN === 4 && ['map', 'plan', 'diary', 'settings'].every((k) => html.includes(`data-tab="${k}"`)) && /\.segs \{[^}]*overflow-x: auto/.test(appCss), `아래 탭은 넷(지도 · 동선 · 일기 · 설정, ${tabN}개)이고, 칩 줄은 한 줄 가로 스크롤이다`);
}
const missing = mustCache.filter((f) => !swFiles.includes(f));
const gone = [];
for (const f of swFiles) if (f !== './' && !(await exists(f))) gone.push(f);
check(missing.length === 0 && gone.length === 0, `서비스 워커가 담아 둘 파일 ${swFiles.length}개 (빠진 것 ${missing.join(' ') || '없음'} · 없는 파일 ${gone.join(' ') || '없음'})`);
// 보드와 테스터 안내: 같은 주소 아래에 열리지만 앱이 미리 담지 않고, 서비스 워커가 앱 화면으로 돌려주지도 않는다.
{
  const outside = swFiles.filter((f) => f.startsWith('board/') || f.startsWith('testers/'));
  const boardOk = (await exists('board/index.html')) && (await exists('board/board-data.js')) && (await exists('board/board.single.html'));
  check(boardOk && outside.length === 0 && sw.includes("const OUTSIDE = ['board/', 'testers/']") && sw.includes('if (OUTSIDE.some(') && sw.includes('inside.startsWith(dir))) return;'), `보드가 /board/에 있고, 서비스 워커는 보드 · 테스터 안내를 미리 담지 않으며(${outside.length}개) 앱 화면으로 돌려주지도 않는다`);
  const boardData = await readFile(join(dist, 'board/board-data.js'), 'utf8');
  const win = {};
  new Function('window', boardData)(win);
  const BD = win.BOARD;
  const reqNos = BD.elements.filter((e) => e.t === 'requirement').map((e) => e.no);
  const wantNos = [...Array.from({ length: 14 }, (_, i) => `R${18 + i}`).filter((no) => !['R25', 'R29', 'R30', 'R31'].includes(no)), 'R40', 'R41'];
  const frontText = JSON.stringify(BD.elements.filter((e) => e.f === 'v_big' || e.f === 'v_flow'));
  const frontWords = ['날마다 쓸 시간', '내 일정', '추천', '길 안내', '종이 명함', '이벤트 부스', '명함 알림', '듣기', '녹음 알림', '대화 칸'];
  check(wantNos.every((no) => reqNos.includes(no)) && !reqNos.includes('R25') && !reqNos.includes('R39') && frontWords.every((w) => frontText.includes(w)) && Object.keys(BD.objectMap.objects).length >= 20 && BD.usecases.length >= 7 && BD.usecases.every((u) => !u.prop), `보드에 깊게 4 ~ 7이 보인다: 앞면 두 장에 낱말 ${frontWords.length}개, 뒷면에 요구 ${reqNos.length}개(R18 ~ R31(R25 · R29 ~ R31 제외) · R40 · R41, 지운 요구는 없다) · 객체 ${Object.keys(BD.objectMap.objects).length}개 · 순서도 ${BD.usecases.length}개`);
  const guide = await readFile(join(dist, 'testers/index.html'), 'utf8').catch(() => '');
  const guideWords = ['홈 화면에 추가', '비행기 모드', '켜기', '폰 안에서만', '폰의 음성 인식 서비스', '명함 QR', '링크드인 QR', '첫 화면', '안드로이드 크롬', '아이폰 사파리', '이름과 연락처는 적지 않는다', '일정은 바뀔 수 있', 'data-copy'];
  check(guideWords.every((w) => guide.includes(w)) && !/<input|<form|type="email"|type="tel"/.test(guide) && guide.includes('href="../app.css"'), `테스터 안내가 /testers/에 있다: 확인할 것 여덟 · 폰 둘 · 복사할 글, 이름과 연락처를 받는 칸이 없다`);
  // 안내에 적은 단추 · 글귀가 앱에 그대로 있는지 (앱의 글이 바뀌면 안내도 고친다).
  const appText = (await Promise.all(['views/settings.js', 'views/card.js', 'views/map.js', 'views/listen.js', 'views/diary.js', 'views/talk.js', 'talk-ui.js', 'app.js', 'index.html'].map((f) => readFile(join(dist, f), 'utf8')))).join('\n');
  const labels = ['명함부터 만든다', '명함 만들기', '명함 고치기 끝', '지도로', 'QR 보기', '명함 고치기', '인터넷 없이', '인터넷 없이 열린다', '켜기', '켜져 있다', '이벤트 있음으로 표시', '가까운 부스 번호', '맞추기', '가까이에 명함 넣는 이벤트 부스', '크게 띄우기', '읽어 주기', '이 폰에서 되는 것', '이 폰에서는 안 됨', '받아쓰기를 어디서 하나', '알겠다 · 이 길로 한다', '그만둔다', '상대에게 알렸다 · 듣기 시작', '알렸다 · 듣기 시작', '손으로 적기', '줄 넣기', '멈추고 일기 초안 만들기', '적은 것으로 초안 만들기', '일기 초안 다듬기', '나누기', '말한 사람 바꾸기', '초안 만들기', '폰에 남기기', '녹음 듣기', '새 판이 있다'];
  const missingLabels = labels.filter((l) => !appText.includes(l) || !guide.includes(l.replace(/&/g, '&amp;')));
  check(missingLabels.length === 0, `테스터 안내에 적은 단추와 글귀 ${labels.length}개가 앱과 안내에 그대로 있다 (없는 것: ${missingLabels.join(' / ') || '없음'})`);
  const daysJs = await readFile(join(dist, 'views/days.js'), 'utf8');
  const planJs = await readFile(join(dist, 'views/plan.js'), 'utf8');
  check(daysJs.includes('일정은 바뀔 수 있다 — 운영팀 안내가 먼저') && planJs.includes('일정은 바뀔 수 있다 — 운영팀 안내가 먼저'), '시간과 일정 · 동선 화면에 "일정은 바뀔 수 있다 — 운영팀 안내가 먼저"가 보인다');
}
const manifest = await json('manifest.webmanifest');
let iconsOk = manifest.display === 'standalone' && manifest.icons.length >= 2;
for (const icon of manifest.icons) iconsOk = iconsOk && (await exists(icon.src));
check(iconsOk, '홈 화면에 추가: 매니페스트와 아이콘이 있다');
// 하루에 볼 만큼만: 사람마다 정한 수를 넘으면 다음 날로 넘긴다. 내가 정한 날짜는 옮기지 않는다.
{
  const all0 = ['b', 'e', 'f', 'd', 'a', 'c', 'g', 'h'].map((id) => ({ id, day: 0 }));
  const show = (r) => r.items.map((it) => `${it.id}${it.day}`).join(' ');
  const two = fillDays(all0, firstBooth, walkTable, 2);
  const kept = fillDays([{ id: 'f', day: 1 }, { id: 'g', day: 1 }, { id: 'a', day: 0 }, { id: 'h', day: 0 }], firstBooth, walkTable, 2);
  const none = fillDays(all0, firstBooth, walkTable, 0);
  const roomy = fillDays(all0, firstBooth, walkTable, 10);
  check(show(two) === 'a1 h1 c2 b2 d3 e3 f4 g4' && two.filled === 8 && two.moved === 2 && two.over === 0 && show(kept) === 'f1 g1 a2 h2' && kept.moved === 2 && show(none) === show(roomy) && none.moved === 0 && roomy.moved === 0, `하루에 볼 만큼만: 하루 2곳이면 ${show(two)} (제 날에 먼저 넣고, 넘친 곳만 자리가 있는 날로), 정한 날짜는 그대로`);
}
const cats = await json('data/categories.json');
check(cats.groups.length === 7 && ['stu', 'job', 'ret', 'mid'].every((k) => cats.audiences[k].length > 0), `분야 묶음 ${cats.groups.length}개 · 네 태그마다 먼저 보일 분야가 있다${cats.audiencesDraft ? ' (초안)' : ''}`);

// 세션 일정 (R32): 공식 일정을 날짜별로 보고 · 낱말로 찾고 · 내 일정에 넣고 뺀다. 넣으면 동선이 그 시간을 비운다. 값은 지어낸 것이다.
{
  const ses = await import('../web/sessions.js');
  const { capacity, eventsOn, hoursFor } = await import('../web/days.js');
  const mk = (id, date, from, to, title, place, topics, track, live) => ({ id, date, from, to, title, place, topics, track, live, url: `https://www.ces.tech/schedule/sample-${id}/` });
  const fake = {
    v: '2026-11-21T00:00:00Z', source: { ko: 'CES 공식 일정', url: 'https://www.ces.tech/schedule/' }, zone: '라스베이거스 시각', days: ['2027-01-06', '2027-01-07'], skipped: 0,
    items: [
      mk('a0000001', '2027-01-06', '11:00', '11:40', 'Keynote - Sample Mobility', 'LVCC, West Hall, Level 2, W232', ['Artificial Intelligence', 'Robotics'], 'Research Summit', true),
      mk('a0000002', '2027-01-06', '09:00', '09:40', 'Sample Health Talk', '', ['Health'], 'Health Stage', false),
      mk('a0000003', '2027-01-07', '14:00', '14:40', 'Sample Retail Panel', 'ARIA, Level 2', ['Retail'], 'Retail', false),
      { ...mk('a0000004', '2027-01-07', '15:00', '14:00', 'Backwards', '', [], '', false) },
      { ...mk('a0000005', '2027-01-07', '10:00', '10:30', 'Not official', '', [], '', false), url: 'https://example.com/x' },
    ],
  };
  const cleaned = ses.clean(fake);
  check(cleaned?.items.length === 4 && ses.clean(null) === null && ses.clean({ v: fake.v, items: [] }) === null && ses.clean({ items: fake.items }) === null, '세션 일정: 공식 주소가 아닌 줄은 빼고, 비었거나 꼴이 틀린 자료는 받지 못한 것으로 본다');
  check(ses.daysOf(cleaned.items).join(' ') === '2027-01-06 2027-01-07' && ses.onDay(cleaned.items, '2027-01-06').map((s) => s.id).join(' ') === 'a0000002 a0000001', '세션 일정: 날짜별로 시간 차례로 보인다');
  check(ses.search(cleaned.items, 'robotics').length === 1 && ses.search(cleaned.items, 'robotics research').length === 1 && ses.search(cleaned.items, 'west retail').length === 0 && ses.search(cleaned.items, 'ARIA').length === 1 && ses.search(cleaned.items, '  ').length === 4, '세션 일정: 낱말로 찾는다 (제목 · 곳 · 트랙 · 주제, 낱말이 모두 들어 있는 것)');
  check(ses.recommend(cleaned.items, [{ name: '로봇', cats: ['Robotics'] }]).map((s) => s.id).join('') === 'a0000001' && ses.recommend(cleaned.items, []).length === 0, '세션 일정: 주제 판의 이름과 분야로 공식 세션을 추천한다');
  const a = cleaned.items.find((s) => s.id === 'a0000001');
  const base = capacity(hoursFor('2027-01-06', {}, info), [], 30);
  const put = ses.toggle(a, []);
  const withIt = capacity(hoursFor('2027-01-06', {}, info), eventsOn(put.events, '2027-01-06'), 30);
  const twice = ses.toggle(a, put.events);
  const again = ses.toggle(a, ses.toggle(a, put.events).events);
  const bad = ses.toggle({ ...a, id: 'bad', to: '10:00' }, []);
  check(put.added === true && put.events.length === 1 && put.events[0].id === 'ses-a0000001' && put.events[0].name === a.title && put.events[0].place === a.place && eventsOn(put.events, '2027-01-06').length === 1 && withIt < base && twice.added === false && twice.events.length === 0 && again.events.length === 1 && bad.added === null, `세션 일정: 내 일정에 넣으면 동선이 그 시간을 비우고(들어가는 곳 ${base} → ${withIt}), 다시 누르면 빠지고, 시간이 틀린 줄은 넣지 않는다`);
  const firstScreen = ['app.js', 'store.js', 'data.js', 'offline.js', 'notify.js', 'alerts.js', 'dom.js', 'views/map.js', 'views/card.js'];
  let leaked = [];
  for (const f of firstScreen) if (/^\s*import[^(\n]*sessions/m.test(await readFile(join(dist, f), 'utf8'))) leaked.push(f);
  check(leaked.length === 0 && /sessions: \(\) => import\('\.\/views\/sessions\.js'\)/.test(await readFile(join(dist, 'app.js'), 'utf8')), '세션 일정: 누를 때 불러온다 (첫 화면 조각에 고정 import가 없다)');
  if (await exists('data/sessions.json')) {
    const real = ses.clean(await json('data/sessions.json'));
    const ds = real ? ses.daysOf(real.items) : [];
    check(!!real && real.items.length > 0 && ds.every((d) => /^2027-01-/.test(d)) && real.items.every((s) => /^https:\/\/www\.ces\.tech\/schedule\//.test(s.url) && ses.asEvent(s)) && /^https:\/\/www\.ces\.tech\//.test(real.source.url), `세션 일정 자료: ${real?.items.length}개 · 날짜 ${ds.length}일 · 모두 공식 주소 · 내 일정으로 바꿀 수 있다 (받은 날짜 ${real?.v})`);
  } else {
    check(true, '세션 일정 자료(data/sessions.json)가 이번 판에는 없다: 공식 일정을 받지 못한 날이다. 화면은 "받지 못했다"를 보이고 앱은 그대로 열린다');
  }
  check(/받아 두지 못했다/.test(await readFile(join(dist, 'views/sessions.js'), 'utf8')), '세션 일정: 받지 못한 날에는 못 받았다고 보인다 (짐작해서 채우지 않는다)');
}

// 마무리 셋(11/22): ① 1/5 사전 일정 날짜 ② 회사 카드의 "이 회사 세션"과 부스 자리마다 한 줄 ③ 설정의 "이 폰의 내 자료 지우기".
{
  const D = await import('../web/days.js');
  const Rt = await import('../web/route.js');
  const Sh = await import('../web/share.js');
  const S = await import('../web/sessions.js');
  const pre = info.show.pre?.[0];
  const list = D.dayList(info);
  check(pre?.date === '2027-01-05' && isCes(pre.source) && /^\d{4}-\d\d-\d\d$/.test(pre.source.read) && list.map((d) => `${d.key}:${d.date.slice(5)}`).join(' ') === '5:01-05 1:01-06 2:01-07 3:01-08 4:01-09' && D.dayKeyOf(info, '2027-01-05') === 5 && D.dayKeyOf(info, '2027-01-06') === 1 && D.dayKeyOf(info, '2027-01-04') === null && D.dayByKey(info, 5)?.pre === true && D.dayByKey(info, 0) === null && info.show.days.length === 4,
    '날짜 칩: 1/5(화) 사전 일정이 맨 앞에 더해진다 (번호는 5, 전시 날 1 ~ 4는 그대로). 1/4는 넣지 않는다');
  const none = () => null;
  const tbl = new Map();
  const sorted = Rt.sortRoute([{ id: 'a', day: 2 }, { id: 'b', day: 5 }, { id: 'c', day: 0 }, { id: 'd', day: 1 }], none, tbl).map((it) => it.id).join('');
  const nx = Rt.nextStop([{ id: 'a', day: 2 }, { id: 'b', day: 5 }, { id: 'c', day: 0 }], undefined)?.id;
  const filled = Rt.fillDays([{ id: 'a', day: 5 }, { id: 'b', day: 0 }, { id: 'c', day: 0 }], none, tbl, [0, 1, 1, 1, 1]);
  const five = Sh.readCode(Sh.planCode([{ id: 'abcdefg1234', day: 5 }]), ['abcdefg1234']);
  check(sorted === 'bdac' && nx === 'b' && filled.items.find((it) => it.id === 'a').day === 5 && filled.items.every((it) => it.day >= 1) && five[0]?.day === 5 && Sh.planCode([{ id: 'abcdefg1234', day: 5 }]).endsWith('.5'),
    '1/5를 쓰는 곳: 동선 차례(1/5가 맨 앞 · 미정이 맨 뒤) · 다음 갈 곳 · 날짜 채우기(1/5에 넣은 곳은 그대로) · 나눈 코드가 5번 날짜를 지킨다');

  // 이 회사 세션: 세션 제목이 스스로 밝힌 이름이 회사 이름과 같을 때만 잇는다. 이름이 제목 속에 들어 있다는 것만으로는 잇지 않는다.
  const ses = (id, title) => ({ id, date: '2027-01-06', from: '09:00', to: '09:40', title, place: 'ARIA, Level 1', url: `https://www.ces.tech/schedule/${id}/` });
  const idx = S.indexByParty([
    ses('s1', 'Tech Trends 2027: Humans x Machines, presented by Deloitte'),
    ses('s2', 'Never Stop the Line: Agentic AI for Factories (Deloitte and SymphonyAI)'),
    ses('s3', 'Physical AI From Concept to Production, presented by NVIDIA'),
    ses('s4', 'Keynote - CTA State of the Industry Address and Stellantis Keynote'),
    ses('s5', 'Keynote - Waymo Keynote'),
    ses('s6', 'The Future of Robot Navigation'),
    ses('s7', 'Event - CTA Women in Tech Brunch, hosted by CTA, The Female Quotient & Black Girl Ventures'),
  ]);
  const ids = (name) => S.forCompany(idx, name).map((s) => s.id).join(' ');
  check(ids('Deloitte') === 's2 s1' && ids('NVIDIA Corporation') === 's3' && ids('Stellantis') === 's4' && ids('Waymo Inc.') === 's5' && ids('The Female Quotient') === 's7'
    && ids('The Future') === '' && ids('Circular') === '' && ids('AI') === '' && ids('SymphonyAI') === 's2' && ids('') === '' && S.nameKey('BXRX Inc.') === 'bxrx' && S.nameKey('DEPT®') === 'dept' && S.whenWhere(ses('x', 't')) === '1/6 (수) 9:00 ~ 9:40 · ARIA, Level 1' && S.whenWhere({ ...ses('x', 't'), place: '' }).endsWith('장소 미정'),
    '이 회사 세션: 제목이 밝힌 이름(presented by · hosted by · 끝의 괄호 · 기조연설)이 회사 이름과 같을 때만 잇는다. 제목 속에 이름이 든 것("The Future"…)이나 짧은 이름은 잇지 않는다');
  const extraJs = await readFile(join(dist, 'company-extra.js'), 'utf8');
  const mapJs = await readFile(join(dist, 'views/map.js'), 'utf8');
  const planJs2 = await readFile(join(dist, 'views/plan.js'), 'utf8');
  check(/sessionBlock\(name\)/.test(mapJs) && /boothLines\(row\[7\]/.test(mapJs) && /sessionBlock\(nameOf\(id\), \{ compact: true \}\)/.test(planJs2) && extraJs.includes('이 회사 강연 ${list.length}개') && /boothLines\(row\?\.\[7\]/.test(planJs2) && /import\('\.\/sessions\.js'\)/.test(extraJs) && !/^import[^(\n]*sessions\.js/m.test(extraJs) && /hidden: true/.test(extraJs) && /\.length < 2\) return null/.test(extraJs) && /\.pick-row/.test(await readFile(join(dist, 'app.css'), 'utf8')),
    '회사 카드(지도 · 갈 곳 둘 다): "이 회사 강연" 줄(갈 곳 카드는 누르는 줄 없는 한 칸)과 부스 자리마다 한 줄. 강연 셈은 누를 때 불러오고, 맞는 강연이 없으면 줄을 숨긴다');

  // 이 폰의 내 자료 지우기: ces2027. 열쇠만 지우고(앱 껍데기 캐시는 그대로), 두 번 확인하고, 먼저 내보내기를 권한다.
  const mem = () => { const m = new Map(); return { get length() { return m.size; }, key: (i) => [...m.keys()][i] ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), getItem: (k) => (m.has(k) ? m.get(k) : null) }; };
  const ls = mem(), ss = mem();
  for (const k of ['ces2027.profile.v1', 'ces2027.diary.v1', 'ces2027.people.v1', 'ces2027.interests.v1', 'ces2027.theme.v1', 'other.app']) ls.setItem(k, '1');
  ls.setItem('ces2027.profile.v1', JSON.stringify({ nick: '물개', tag: 'stu', line: '', linkedin: 'jaeyeup-lee', github: 'octocat', discord: 'seal.bot' }));
  const linkedinKept = () => [...Array(ls.length).keys()].some((i) => /jaeyeup-lee/.test(ls.getItem(ls.key(i)) || ''));
  const linkedinBefore = linkedinKept();
  ss.setItem('ces2027.introLater', '1'); ss.setItem('keep', '1');
  Object.defineProperty(globalThis, 'localStorage', { value: ls, configurable: true });
  Object.defineProperty(globalThis, 'sessionStorage', { value: ss, configurable: true });
  const { clearMine } = await import('../web/store.js');
  const cleared = clearMine();
  const settingsJs2 = await readFile(join(dist, 'views/settings.js'), 'utf8');
  const mineFn = settingsJs2.slice(settingsJs2.indexOf('function mineRow'), settingsJs2.indexOf('// 종이 명함: 있는지'));
  const storageFn = settingsJs2.slice(settingsJs2.indexOf('function storageRow'), settingsJs2.indexOf('// 일기 전부와 폰에 있는 대화를'));
  check(linkedinBefore && !linkedinKept() && ls.getItem('ces2027.profile.v1') === null && /linkedin: linkedin\.input\.value\.trim\(\)/.test(await readFile(join(dist, 'views/card.js'), 'utf8')),
    '이 폰의 내 자료 지우기: 링크드인은 명함과 같은 열쇠(profile.v1) 안에 있어 명함과 함께 지워진다');
  check(cleared === 6 && ls.length === 1 && ls.getItem('other.app') === '1' && ss.length === 1 && ss.getItem('keep') === '1'
    && mineFn.includes("'이 폰의 내 자료'") && mineFn.includes('downloadExport()') && mineFn.indexOf('const first') < mineFn.indexOf('const second') && mineFn.includes('clearMine()') && mineFn.includes("'#/'") && !/caches/.test(mineFn)
    && storageFn.includes("rowState('받아 둔 모델')") && !/저장 공간/.test(storageFn.replace(/이 브라우저는 크기를|저장 공간 비우기/g, '')) && /dropAllAudio/.test(settingsJs2),
    '설정 "이 폰의 내 자료 지우기": 두 번 확인(첫 확인에서 내보내기를 권한다) 뒤 ces2027. 자료만 지우고 처음 명함부터 다시 시작한다. 앱 파일(캐시)은 그대로고, "받아 둔 모델 비우기" 줄과 이름이 나뉘어 있다');
}

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
  const spots = boothSpots(places, data, await json('data/booth-spots.json'));
  let placed = 0, outside = 0;
  for (const row of data.ex) for (const b of row[7]) {
    const spot = spotOf(spots, b);
    if (!spot) continue;
    placed += 1;
    const p = L.list.find((x) => b.endsWith(`@${x.k}`));
    if (!inside([spot.x, spot.z], p.world)) outside += 1;
  }
  // 정식 배치도 자리: 적힌 부스는 그 자리를 쓰고, 나머지는 짐작 그대로다.
  const officialFile = await json('data/booth-spots.json');
  const someKey = [...spots.keys()].find((k) => k.startsWith('LVCC_N|'));
  const someCode = someKey.slice(someKey.indexOf('|') + 1);
  const withOfficial = boothSpots(places, data, { places: { LVCC_N: { [someCode]: [600, 700], 'nope': [1, 2], [someCode + 'x']: 'bad' } } });
  const moved = withOfficial.get(someKey);
  const expectAt = L.W('lvcc', 600, 700);
  let same = 0;
  for (const [k, v] of spots) { const w = withOfficial.get(k); if (k !== someKey && w.x === v.x && w.z === v.z && !w.official) same += 1; }
  check(moved.official === true && moved.x === expectAt[0] && moved.z === expectAt[1] && same === spots.size - 1 && withOfficial.size === spots.size, `정식 배치도 자리(data/booth-spots.json): 적힌 부스만 그 자리로 가고 나머지 ${same}개는 짐작 그대로다`);
  const officialCount = Object.values(officialFile.places || {}).reduce((a, o) => a + Object.keys(o).length, 0);
  const saysOfficial = places.places.filter((p) => p.boothSpots === 'official').map((p) => p.k);
  check(saysOfficial.every((k) => Object.keys(officialFile.places?.[k] || {}).length > 0), `공식 자리라고 적은 장소 ${saysOfficial.length}곳에는 정식 자리가 들어 있다 (지금 정식 자리 ${officialCount}개)`);
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

// 남의 명함 받기 · 만난 사람: 읽은 글 살피기 · 사람 만들기 · 같은 사람 합치기 · 카메라 읽기(꾸민 폰). 지어낸 값만 쓴다.
{
  const P = await import('../web/people.js');
  const S = await import('../web/scan.js');
  const ok = (t, h) => { const r = P.parseScan(t, h); return r.ok ? r.link : null; };
  const no = (t, h) => !P.parseScan(t, h).ok;
  const gh = ok('https://github.com/octocat/');
  const li = ok('https://kr.linkedin.com/in/jane-doe?trk=x');
  const dc = ok('https://discord.gg/AbC123');
  const web = ok('https://example.com/a/b/');
  check(gh?.kind === 'github' && gh.url === 'https://github.com/octocat' && ok('github.com/octocat')?.key === gh.key && ok('@octocat', 'github')?.key === gh.key && li?.kind === 'linkedin' && li.url === 'https://www.linkedin.com/in/jane-doe' && dc?.kind === 'discord' && web?.kind === 'web' && web.url === 'https://example.com/a/b', '남의 QR 살피기: 깃허브 · 링크드인 · 디스코드 · 웹 주소(https)를 받고, 주소를 가지런히 한다');
  check(ok('seal.bot', 'auto')?.kind === 'discord' && ok('seal.bot', 'discord')?.kind === 'discord' && ok('octocat', 'github')?.kind === 'github' && ok('my-name-1', 'auto')?.kind === 'github', '우리 앱의 QR 꼴(깃허브는 주소, 디스코드는 아이디 글자)을 그대로 받는다');
  check(['http://github.com/octocat', 'javascript:alert(1)', 'mailto:a@example.com', 'BEGIN:VCARD', 'https://user:pw@example.com/', 'https://localhost/', 'https://10.0.0.1/', 'data:text/html,hi', '', '   ', `https://example.com/${'a'.repeat(300)}`, 'a b c'].every((t) => no(t)), '받지 않는 글: http · javascript · mailto · 연락처 카드 · 비밀번호가 든 주소 · 짐작 못 할 주소 · 너무 긴 글 · 빈 글');
  check(ok('https://github.com.evil.example/octocat')?.kind === 'web' && ok('https://evilgithub.com/octocat')?.kind === 'web' && P.safeHref('http://example.com') === '' && P.safeHref('javascript:alert(1)') === '' && P.safeHref('https://example.com/x') === 'https://example.com/x', '이름만 닮은 주소(github.com.evil…)는 깃허브로 보지 않고, 저장된 주소도 열 때 https만 연다');
  const made = P.personFromScan('https://github.com/octocat', { nick: '  시험  ', met: '2027-01-06', company: '가짜회사', hint: 'auto' });
  check(made.ok && made.person.nick === '시험' && made.person.links.length === 1 && made.person.company === '가짜회사' && !P.personFromScan('http://x.example/', {}).ok, '읽은 글에서 사람 만들기');
  // 같은 사람 합치기
  const a = P.upsert([], { id: 'a1', nick: '가', links: [gh], met: '2027-01-07', note: '' });
  const b = P.upsert(a.list, { nick: '', links: [gh, dc], met: '2027-01-06', note: '로봇 이야기', company: '가짜회사', exId: 'x1' });
  const c = P.upsert(b.list, { nick: '다른 사람', links: [web], met: '2027-01-08' });
  check(a.merged === 0 && b.merged === 1 && b.list.length === 1 && b.person.id === 'a1' && b.person.nick === '가' && b.person.links.length === 2 && b.person.met === '2027-01-06' && b.person.note === '로봇 이야기' && b.person.exId === 'x1' && c.list.length === 2 && c.merged === 0, '같은 주소를 다시 읽으면 새 사람을 만들지 않고 먼저 있던 사람에 합친다 (주소는 겹치지 않게 늘고, 빈 칸은 채운다)');
  const edit = P.upsert(c.list, { ...c.list[1], links: [web, gh], nick: '합친 사람' });
  check(edit.list.length === 1 && edit.merged === 1 && edit.person.links.length === 3 && edit.person.nick === '합친 사람' && P.removePerson(edit.list, edit.person.id).length === 0, '고치다가 다른 사람의 주소를 넣으면 한 사람으로 합치고, 지우면 빠진다');
  check(P.cleanPeople('x').length === 0 && P.cleanPeople([null, 1, { id: 'q', links: [{ kind: 'web', key: 'k', url: 'javascript:alert(1)' }, { kind: 'web', key: 'k2', url: 'https://example.com/' }], met: 'bad' }]).map((p) => p.links.length + p.met).join() === '1', '폰에 남은 값이 망가져 있어도 걸러 낸다 (https가 아닌 주소 · 틀린 날짜)');
  const people = [{ company: '가짜회사', exId: 'x1' }, { company: ' 가짜회사 ', exId: '' }, { company: '다른회사', exId: 'x2' }, { company: '', exId: '' }];
  check(P.countAt(people, { exId: 'x1', company: '가짜회사' }) === 2 && P.countAt(people, { exId: 'x2', company: '이름이 다름' }) === 1 && P.countAt(people, { exId: '', company: '가짜회사' }) === 2 && P.countAt(people, { exId: '', company: '' }) === 0, '일기 목록의 "이 회사에서 만난 사람 수": 양쪽에 회사 번호가 있으면 번호로, 아니면 이름으로 센다');

  // 카메라 읽기: 꾸민 폰 셋 (BarcodeDetector 없음 · 권한 거부 · 있는 폰)
  const track = () => ({ stopped: 0, stop() { this.stopped += 1; } });
  const fakeWin = (extra) => ({ isSecureContext: true, document: { hidden: false, addEventListener() {}, removeEventListener() {} }, addEventListener() {}, removeEventListener() {}, navigator: { mediaDevices: { getUserMedia: async () => { throw new Error('부르면 안 된다'); } } }, ...extra });
  const fakeVideo = () => ({ srcObject: null, isConnected: true, muted: false, setAttribute() {}, play: async () => {} });
  let asked = 0;
  const noDet = fakeWin({ navigator: { mediaDevices: { getUserMedia: async () => { asked += 1; return { getTracks: () => [] }; } } } });
  const r1 = await S.startScan(fakeVideo(), () => {}, noDet);
  check(!r1.ok && /BarcodeDetector/.test(r1.why) && asked === 0 && !S.cameraSupport(S.envOf(noDet)).ok, '카메라 읽기(꾸민 폰 1 · 지원 안 함): 이 폰에서는 안 됨과 까닭을 말하고, 카메라는 켜지 않는다');
  const denied = fakeWin({ BarcodeDetector: class { async detect() { return []; } }, navigator: { mediaDevices: { getUserMedia: async () => { const e = new Error('x'); e.name = 'NotAllowedError'; throw e; } } } });
  const r2 = await S.startScan(fakeVideo(), () => {}, denied);
  check(!r2.ok && /거부/.test(r2.why) && /허용/.test(r2.why) && /찾지 못/.test(S.explainCameraError({ name: 'NotFoundError' })) && /다른 앱/.test(S.explainCameraError({ name: 'NotReadableError' })), '카메라 읽기(꾸민 폰 2 · 권한 거부): 까닭(거부 · 허용하는 법)을 보인다');
  const tr = track();
  const seen = [];
  let calls = 0;
  const has = fakeWin({
    BarcodeDetector: class { constructor(o) { this.o = o; } async detect() { calls += 1; return calls >= 2 ? [{ rawValue: 'https://github.com/octocat' }] : []; } },
    navigator: { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [tr] }) } },
  });
  const v = fakeVideo();
  const r3 = await S.startScan(v, (t) => seen.push(t), has);
  await new Promise((res) => setTimeout(res, 900));
  check(r3.ok && seen.length === 1 && seen[0] === 'https://github.com/octocat' && v.srcObject !== null, '카메라 읽기(꾸민 폰 3 · BarcodeDetector 있음): 읽은 주소가 들어오고, 같은 QR을 계속 비춰도 한 번만 들어온다');
  r3.stop();
  check(tr.stopped === 1 && v.srcObject === null, '그만 읽기: 카메라 트랙을 끄고 화면에서 뗀다');
  const tr2 = track();
  const gone = fakeVideo();
  const r4 = await S.startScan(gone, () => {}, fakeWin({ BarcodeDetector: class { async detect() { return []; } }, navigator: { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [tr2] }) } } }));
  gone.isConnected = false;
  await new Promise((res) => setTimeout(res, 600));
  check(r4.ok && tr2.stopped === 1, '화면을 떠나 카메라 화면이 사라지면 저절로 카메라를 끈다');

  // 지키는 선: 첫 화면 조각은 새 화면을 미리 읽지 않고, 일기 보내기 묶음에는 만난 사람이 없다.
  const first = ['app.js', 'store.js', 'data.js', 'offline.js', 'notify.js', 'alerts.js', 'dom.js', 'views/map.js', 'views/card.js'];
  const bad = [];
  for (const f of first) if (/^\s*import[^\n]*from\s+'[^']*\/(people|people-store|scan)\.js'/m.test(await readFile(new URL(`../web/${f}`, import.meta.url), 'utf8'))) bad.push(f);
  const appText = await readFile(new URL('../web/app.js', import.meta.url), 'utf8');
  const diaryText = await readFile(new URL('../web/diary.js', import.meta.url), 'utf8');
  const D = await import('../web/diary.js');
  const sent = JSON.stringify(D.bundle([{ id: 'e1', date: '2027-01-06', company: '가짜회사' }], { nick: '나', tag: 'stu' })) + D.asText([{ id: 'e1', date: '2027-01-06', company: '가짜회사' }], { nick: '나' }, () => '');
  check(bad.length === 0 && /people: \(\) => import\('\.\/views\/people\.js'\)/.test(appText) && !/people/.test(diaryText) && !/people|links|githubUrl/.test(sent), '첫 화면 조각은 새 화면을 미리 읽지 않고(누를 때 불러온다), 일기 보내기 묶음에는 만난 사람이 들어가지 않는다');
}

// 기준표 채우기 (11/21): 일정 고치기 · 날짜와 시간에 맞춘 세션 추천 · 세션 나누기 · 시작 전 알림.
{
  const { updateEvent } = await import('../web/days.js');
  const ses = await import('../web/sessions.js');
  const al = await import('../web/alerts.js');
  const isDate = (v) => /^\d{4}-\d\d-\d\d$/.test(v);
  // 일정 제자리 고치기.
  const evs = [{ id: 'e1', date: '2027-01-06', from: '19:00', to: '21:00', name: '저녁 모임', place: '' }, { id: 'ses-x', date: '2027-01-07', from: '09:00', to: '09:40', name: '세션', place: 'LVCC' }];
  const up = updateEvent(evs, 'e1', { from: '18:30', to: '20:00', name: '저녁 모임 (옮김)' });
  const upBad = updateEvent(evs, 'e1', { from: '22:00', to: '20:00' });
  const upNone = updateEvent(evs, 'nope', { name: 'x' });
  check(up.ok && up.events.length === 2 && up.events[0].id === 'e1' && up.events[0].from === '18:30' && up.events[0].name === '저녁 모임 (옮김)' && up.events[1] === evs[1] && !upBad.ok && upBad.events === evs && !upNone.ok, '내 일정 고치기: 이름표는 그대로 두고 시간 · 이름 · 장소만 바꾼다 (끝이 시작보다 이르거나 없는 일정이면 그대로)');
  const daysT = await readFile(join(dist, 'views/days.js'), 'utf8');
  check(/'고치기'/.test(daysT) && /'그만두기'/.test(daysT), '시간과 일정 화면에 "고치기" 단추가 있다');
  // 날짜와 시간에 맞춘 세션 추천.
  const mk = (id, date, from, to, title, topics) => ({ id, date, from, to, title, place: '', topics, track: '', live: false, url: `https://www.ces.tech/schedule/s-${id}/` });
  const items = [mk('r1', '2027-01-06', '09:00', '10:00', 'Robotics One', ['Robotics']), mk('r2', '2027-01-06', '09:30', '10:30', 'Robotics Two', ['Robotics']), mk('r3', '2027-01-06', '10:00', '11:00', 'Robot Three', []), mk('r4', '2027-01-07', '09:00', '10:00', 'Robotics Four', ['Robotics'])];
  const topics = [{ name: '로봇', cats: ['Robotics', 'Robot'] }];
  const free = ses.recommendWithSkips(items, topics);
  const busy = ses.recommendWithSkips(items, topics, [{ id: 'e1', date: '2027-01-06', from: '10:00', to: '12:00' }]);
  const mine = ses.recommend(items, topics, [{ id: ses.eventId(items[0]), date: '2027-01-06', from: '09:00', to: '10:00' }]);
  check(free.picks.map((s) => s.id).join(' ') === 'r1 r3 r4' && free.skipped === 1 && busy.picks.map((s) => s.id).join(' ') === 'r1 r4' && mine.some((s) => s.id === 'r1') && ses.overlaps(items[0], items[1]) && !ses.overlaps(items[0], mk('z', '2027-01-06', '10:00', '11:00', 'z', [])) && ses.recommend(items, []).length === 0, '세션 추천: 서로 · 내 일정과 때가 겹치는 것은 건너뛰고 날짜 · 시간 차례로 보인다 (맞닿는 것은 겹침이 아니고, 이미 넣은 세션은 자기와 겹치지 않는다)');
  const st = ses.shareText(items[0]);
  check(/^Robotics One\n1\/6 \(수\) 09:00 ~ 10:00 라스베이거스 시각\nhttps:\/\/www\.ces\.tech\/schedule\/s-r1\/$/.test(st), '세션 나누기: 제목 · 날짜와 때 · 공식 쪽 링크만 글로 건넨다 (서버를 거치지 않는다)');
  const sesT = await readFile(join(dist, 'views/sessions.js'), 'utf8');
  check(/navigator\.share/.test(sesT) && /clipboard/.test(sesT), '세션 일정: 나누기 단추가 폰의 나누기 창이나 복사를 쓴다');
  // 곧 시작하는 일정 알림.
  const vegas = al.vegasNow(new Date('2027-01-06T17:25:00Z'));
  const soon = al.soonEvents([{ id: 'a', date: '2027-01-06', from: '09:40', to: '10:00', name: 'A' }, { id: 'b', date: '2027-01-06', from: '09:00', to: '09:20', name: 'B' }, { id: 'c', date: '2027-01-06', from: '11:00', to: '11:20', name: 'C' }, { id: 'd', date: '2027-01-07', from: '09:30', to: '10:00', name: 'D' }], vegas, 30);
  const notifyT = await readFile(join(dist, 'notify.js'), 'utf8');
  check(vegas.date === '2027-01-06' && vegas.min === 565 && soon.length === 1 && soon[0].id === 'a' && soon[0].inMin === 15 && /soon:/.test(notifyT) && /setInterval/.test(notifyT), '일정 시작 전 알림: 라스베이거스 시각으로 30분 안에 시작하는 것만 고르고(이미 시작했거나 다른 날은 뺀다), 앱이 열려 있을 때 1분마다 본다');
}

// 대화 칸 (R40 · R41): 회사마다 대화 칸, 붙여넣은 대화 기록을 줄마다 나누고 짝짓는다. 번역 앱 열기는 2026-11-22에 지웠다. 예시 글은 지어낸 것이다.
{
  const talk = await import('../web/talk.js');
  const { bundle, talksFor } = await import('../web/diary.js');
  const papago = `Papago\n2027.01.06. 오후 2:31\nHello, welcome to our booth.\n안녕하세요, 저희 부스에 오신 것을 환영합니다.\n\nHow much is the base model?\n기본 모델은 얼마예요?\n\nIt costs $99.\n99달러입니다.`;
  const google = `Hi, are you from Korea?\n안녕하세요, 한국에서 오셨나요?\n네, 서울에서 왔어요.\nYes, I am from Seoul.\nNice to meet you\n만나서 반갑습니다`;
  const mixed = `영어: Thanks for stopping by.\n한국어: 들러 주셔서 감사합니다.\nHello → 안녕하세요\nWhat do you do? | 무슨 일을 하세요?\n저는 학생이에요 / I am a student`;
  const a = talk.splitPaste(papago);
  const b = talk.splitPaste(google);
  const c = talk.splitPaste(mixed);
  const sameLines = (got, want) => got.kind === 'pairs' && got.pairs.length === want.length && want.every(([who, en, ko], i) => got.pairs[i].who === who && got.pairs[i].en === en && got.pairs[i].ko === ko);
  check(sameLines(a, [['them', 'Hello, welcome to our booth.', '안녕하세요, 저희 부스에 오신 것을 환영합니다.'], ['them', 'How much is the base model?', '기본 모델은 얼마예요?'], ['them', 'It costs $99.', '99달러입니다.']]) && a.app === 'papago',
    '붙여넣기 나누기(파파고 꼴): 앱 이름 · 시간 줄을 떼고 빈 줄로 나뉜 원문 · 번역을 세 짝으로 만든다');
  check(sameLines(b, [['them', 'Hi, are you from Korea?', '안녕하세요, 한국에서 오셨나요?'], ['me', 'Yes, I am from Seoul.', '네, 서울에서 왔어요.'], ['them', 'Nice to meet you', '만나서 반갑습니다']]),
    '붙여넣기 나누기(구글 꼴): 영 한 · 한 영이 번갈아 나오면 위 줄을 원문으로 읽고 말한 사람(상대 · 나)을 나눈다');
  check(sameLines(c, [['them', 'Thanks for stopping by.', '들러 주셔서 감사합니다.'], ['them', 'Hello', '안녕하세요'], ['them', 'What do you do?', '무슨 일을 하세요?'], ['me', 'I am a student', '저는 학생이에요']]),
    '붙여넣기 나누기(섞인 꼴): "영어:" 이름표 · 한 줄의 → | / 짝을 함께 읽는다');
  const blockA = talk.splitPaste('We launch next spring.\nWe launch in Korea too.\n다음 봄에 출시합니다.');
  const blockB = talk.splitPaste('Hello\nHow are you');
  const none = talk.splitPaste('\n 2:31 PM \nPapago');
  check(blockA.kind === 'block' && blockA.lines.length === 3 && blockA.lines.map((l) => l.lang).join() === 'en,en,ko' && blockB.kind === 'block' && blockB.lines.every((l) => l.lang === 'en') && none.kind === 'empty',
    '붙여넣기 나누기: 줄 수가 안 맞거나 한쪽 말뿐이면 짝을 만들지 않고 그대로 한 덩어리로 두며(줄마다 영어 / 한국어로는 나눈다), 대화 줄이 없으면 비었다고 한다');
  check(talk.langOf('How much is it?') === 'en' && talk.langOf('얼마예요?') === 'ko' && talk.langOf('삼성 TV 가격은?') === 'ko' && talk.langOf('Where is the Samsung 부스') === 'en' && talk.langOf('2027') === 'none', '줄의 말은 글자로 가린다: 한글이 글자의 4분의 1 이상이면 한국어, 글자가 없으면 앞 줄에 붙인다');
  const company = { id: 'x1', name: '지어낸 회사', booth: '100@LVCC_N' };
  const t1 = talk.makeTalk({ ...c, src: 'paste' }, company, '2027-01-06', 't1');
  const heard = talk.heardOf(t1);
  const d1 = talk.draftFromTalk(t1, '2027-01-06', 'd1');
  check(heard.length === 3 && heard.every((h) => h.en && !/학생/.test(h.en + h.ko)) && d1.draft === true && d1.felt === '' && d1.for.length === 0 && d1.sent === null && d1.talkId === 't1' && d1.exId === 'x1'
    && d1.saw.includes('Thanks for stopping by. / Hello / What do you do?') && !d1.saw.includes('들러 주셔서') && !d1.saw.includes('student'),
  '붙인 대화 → 일기 초안: 들은 것 칸은 상대가 한 영어 원문 줄만 붙이고(번역 · 내가 한 말은 빼고), 느낀 점과 "누구에게"는 비워 둔다');
  const sourceWords = new Set(`${a.pairs.map((p) => p.en).join(' ')} ${b.pairs.map((p) => p.en).join(' ')} ${c.pairs.map((p) => p.en).join(' ')}`.toLowerCase().match(/[a-z$0-9']+/g));
  const sawWords = (talk.draftFromTalk(talk.makeTalk({ ...a, src: 'paste' }, company, '2027-01-06', 't2'), '2027-01-06', 'd2').saw.split(') ').pop().toLowerCase().match(/[a-z$0-9']+/g) || []);
  check(sawWords.length > 0 && sawWords.every((w) => sourceWords.has(w)), '일기 초안의 들은 것에는 붙인 글에 없는 말이 없다 (지어내지 않는다)');
  const tb = talk.makeTalk({ ...blockA, src: 'paste' }, company, '2027-01-06', 't3');
  check(talk.heardOf(tb).length === 2 && talk.heardOf(tb).every((h) => /launch/.test(h.en) && h.ko === ''), '짝을 못 지은 덩어리도 영어 줄만 들은 것이 된다 (한국어 줄은 번역으로 붙이지 않는다)');
  const hp = talk.handPair('How much?', '', '');
  const hq = talk.handPair('얼마예요?', 'How much?', '');
  check(hp.who === 'them' && hp.en === 'How much?' && hp.ko === '' && hq.who === 'me' && hq.ko === '얼마예요?' && hq.en === 'How much?' && talk.handPair('  ', '', '') === null && talk.handPair('Hi', '', 'me').who === 'me', '손으로 넣기: 영어는 상대가 한 말 · 한국어는 내가 한 말로 읽고 번역은 비워도 된다, 누른 쪽이 있으면 그것을 따른다');
  const ready = [{ id: 'e1', date: '2027-01-06', company: '지어낸 회사', saw: 's', felt: 'f', for: ['stu'], talkId: 't1', heard: [{ t: 0, en: 'x' }], audio: { bytes: 5 } }, { id: 'e2', date: '2027-01-06', company: '다른 회사', saw: 's', felt: 'f', for: [] }];
  const talks = [t1, tb];
  const withTalk = bundle(ready, { nick: 'a' }, new Date('2027-01-06T00:00:00Z'), talksFor(ready, talks));
  const plain = bundle(ready, { nick: 'a' });
  const allTalks = bundle(ready, { nick: 'a' }, new Date(), talksFor(ready, talks, true));
  check(withTalk.talks.length === 1 && withTalk.talks[0].id === 't1' && withTalk.talks[0].pairs.length === 4 && !('talks' in plain) && allTalks.talks.length === 2 && !JSON.stringify(withTalk).includes('audio') && !Object.keys(withTalk.entries[0]).some((k) => ['heard', 'audio', 'talkId'].includes(k)),
    '내보내기 파일: 파일로 내려받을 때만 일기와 이어진 대화가 들어가고(전부 파일로는 폰의 대화 전부), 모으는 곳 주소로 보내는 묶음에는 대화가 없고, 녹음은 어느 때도 없다');
  const diaryT = await readFile(join(dist, 'views/diary.js'), 'utf8');
  check(/bundle\(unsent, getProfile\(\)\);\s*\n\s*if \(sendTo\)/.test(diaryT) && diaryT.includes('talksFor(unsent, getTalks())') && diaryT.includes('...(entry?.talkId ? { talkId: entry.talkId } : {})'), '일기 화면: 모으는 곳 주소로는 대화 없이 보내고, 파일로 내려받을 때만 대화를 넣고, 다듬어 남겨도 대화 이음이 남는다');

  // 화면과 첫 화면
  const read = (f) => readFile(join(dist, f), 'utf8');
  const [talkV, listenV, companyJs, homeV, appT] = await Promise.all(['views/talk.js', 'views/listen.js', 'company.js', 'views/map.js', 'app.js'].map(read));
  check(['듣기', '붙여넣기', '손으로', '나누기', '초안 만들기', '말한 사람 바꾸기'].every((w) => talkV.includes(w)) && !/번역 앱|copyGuide|translator/.test(talkV + listenV + companyJs + homeV) && !/ask: |translate: |deep: /.test(appT) && /talk: \(\) => import\('\.\/views\/talk\.js'\)/.test(appT),
    '대화 칸: 듣기 · 붙여넣기 · 손으로 셋이 있고 번역 앱 열기 · 복사하는 법 안내는 없다. 대화 화면은 누를 때 불러온다');
  check(companyJs.includes("`#/talk/${encodeURIComponent(id)}`") && !homeV.includes("#/ask") && !homeV.includes("#/translate") && !listenV.includes('#/deep') && !listenV.includes('물어볼 말') && !talkV.includes('#/ask'),
    '회사 카드에는 "대화"만 있고, 지도 · 듣기 · 대화 칸에 번역 앱 · 물어볼 말 · 깊은 설정으로 가는 길이 없다');
  const talkCode2 = (await Promise.all(['talk.js', 'views/talk.js'].map(read))).join('\n');
  check(!/fetch\(|XMLHttpRequest|sendBeacon|WebSocket/.test(talkCode2) && !/innerHTML/.test(talkCode2), '대화 코드는 스스로 어디로도 보내지 않고, 붙인 글을 HTML로 넣지 않는다');
  const firstScreen2 = (await Promise.all(['app.js', 'store.js', 'data.js', 'offline.js', 'notify.js', 'alerts.js', 'dom.js', 'views/map.js', 'views/card.js'].map(read))).join('\n');
  const fixed2 = [...firstScreen2.matchAll(/^import [^;]*from '([^']+)';/gm)].map((m) => m[1]);
  check(!fixed2.some((f) => /talk\.js|views\/talk/.test(f)) && !preloads.some((f) => /talk/.test(f)), '대화 칸 코드는 첫 화면에 싣지 않는다');
  lines.push(`대화 칸 | 붙여넣기 예시 셋(파파고 ${a.pairs.length}짝 · 구글 ${b.pairs.length}짝 · 섞인 ${c.pairs.length}짝) · 한 덩어리 둘 · 들은 것은 원문 줄만`);
}


// 모은 일기 열기(R46): diary.wasm은 그 화면을 열 때만 받고, 폰에 남기지 않는다.
{
  const read = (p) => readFile(join(dist, p), 'utf8');
  const [appJs, settingsJs, collectJs, diaryCoreJs, sw, html] = await Promise.all(['app.js', 'views/settings.js', 'views/collect.js', 'diarycore.js', 'sw.js', 'index.html'].map(read));
  const dw = await readFile(join(dist, 'diary.wasm'));
  const { loadDiaryCore } = await import('../web/diarycore.js');
  const dcore = await loadDiaryCore(dw);
  check(dcore.add('{"app":"ces-2027-diary","v":1,"author":{"nick":"가짜"},"entries":[{"id":"1","date":"2027-01-06","company":"Alpha","saw":"본 것","felt":"","for":["stu"]}]}').ok && dcore.count() === 1 && dcore.page('2027-01-15T00:00:00Z').includes('## 학생 (일기 1개 · 회사 1곳)'),
    `모은 일기 코어(diary.wasm ${(dw.length / 1024).toFixed(0)} KB)가 일기 파일을 읽고 네 태그 한 장을 만든다`);
  check(appJs.includes("collect: () => import('./views/collect.js')") && /collect: 'settings'/.test(appJs) && settingsJs.includes("href: '#/collect'") && settingsJs.includes('모은 일기 열기'),
    '설정의 내보내기 묶음에 "모은 일기 열기"가 있고 누르면 모은 일기 화면(설정 탭 아래)이 열린다');
  const first = (await Promise.all(['app.js', 'store.js', 'data.js', 'offline.js', 'notify.js', 'alerts.js', 'dom.js', 'views/map.js', 'views/card.js'].map(read))).join('\n');
  check(!/diarycore|diary\.wasm|views\/collect/.test(first.replace("collect: () => import('./views/collect.js'),", '')) && !/diarycore|diary\.wasm|collect\.js/.test(html) && !preloads.some((p) => /collect|diarycore|diary\.wasm/.test(p)),
    '모은 일기 코드와 diary.wasm은 첫 화면에 싣지 않는다(그 화면을 열 때만 받는다)');
  check(sw.includes('"diary.wasm"') && sw.includes('"diarycore.js"') && sw.includes('"views/collect.js"'), '모은 일기 화면 · 코어는 인터넷 없이 담아 두는 목록에 있다(비행기 모드에서도 된다)');
  check(!/localStorage|sessionStorage|indexedDB|caches\.|save\(|setItem|sendBeacon|XMLHttpRequest|innerHTML/.test(collectJs + diaryCoreJs) && (collectJs.match(/fetch\(/g) || []).length === 1 && collectJs.includes("fetch('diary.wasm')"),
    '모은 일기 화면은 고른 파일과 한 장을 폰에 남기지 않고, 받는 것은 diary.wasm 하나뿐이다');
}

// 일기 사진 한 장(R49): 폰에서 줄이고, 이 폰에만 두고, 파일로 내보낼 때만 넣는다.
{
  const read = (p) => readFile(join(dist, p), 'utf8');
  const { fitSize, steps, MAX_EDGE, MAX_BYTES, MIN_EDGE } = await import('../web/photo.js');
  const { bundle, asText } = await import('../web/diary.js');
  const { isFull } = await import('../web/photo-store.js');
  const big = fitSize(4032, 3024);
  const tall = fitSize(3024, 4032);
  const small = fitSize(600, 400);
  const ladder = steps();
  check(MAX_EDGE === 1024 && MAX_BYTES === 150 * 1024 && big.w === 1024 && big.h === 768 && tall.w === 768 && tall.h === 1024 && small.w === 600 && small.h === 400 && fitSize(0, 0).w === 0,
    '일기 사진 줄이기: 긴 변 1024px 안으로 비율을 지켜 줄이고(4032x3024 → 1024x768) 작은 사진은 늘리지 않는다');
  check(ladder[0].edge === 1024 && ladder[0].q === 0.72 && ladder.at(-1).edge >= MIN_EDGE && ladder.at(-1).q === 0.4 && ladder.every((s, i) => i === 0 || s.edge < ladder[i - 1].edge || s.q < ladder[i - 1].q),
    `일기 사진 줄이기: 150KB 안에 들 때까지 화질(0.72 → 0.4) 다음 크기(80%, ${MIN_EDGE}px까지) 차례로 줄인다 (${ladder.length}단계)`);
  const entry = { id: 'e1', date: '2027-01-06', company: 'A', saw: '본 것', for: ['stu'], photo: { bytes: 1, w: 1, h: 1 } };
  const plain = bundle([entry], { nick: 'a' });
  const withPhoto = bundle([entry], { nick: 'a' }, new Date(), null, { e1: 'data:image/jpeg;base64,QUJD' });
  check(!('photo' in plain.entries[0]) && withPhoto.entries[0].photo === 'data:image/jpeg;base64,QUJD' && withPhoto.v === 1 && !JSON.stringify(plain).includes('bytes') && asText([entry], { nick: 'a' }, (k) => k).includes('사진 있음'),
    '내보내기 파일: 사진은 주었을 때만 그 일기의 photo 칸으로 들어가고(판 번호는 그대로 1), 글로 복사에는 "사진 있음"만 적힌다');
  check(isFull({ name: 'QuotaExceededError' }) && isFull({ code: 22 }) && !isFull(new Error('다른 오류')), '저장 공간이 모자란 오류를 알아본다');
  const [diaryV, settingsV, idbJs, sw] = await Promise.all(['views/diary.js', 'views/settings.js', 'idb.js', 'sw.js'].map(read));
  check(/bundle\(unsent, getProfile\(\)\);\s*\n\s*if \(sendTo\)/.test(diaryV) && diaryV.includes('talksFor(unsent, getTalks()), photos)') && settingsV.includes('talksFor(ready, getTalks(), true), photos)'),
    '사진은 파일로 내려받을 때만 들어가고, 모으는 곳 주소로 보내는 묶음에는 없다');
  check(diaryV.includes("await savePhoto(id, photoNew.blob)") && diaryV.includes('저장 공간이 모자라 사진을 못 담았다') && diaryV.includes('dropPhoto(e.id)') && idbJs.includes("indexedDB.open('ces2027', 2)") && idbJs.includes("'photo'"),
    '일기 사진: 이 폰(IndexedDB)에 담고, 저장 공간이 모자라면 한 줄로 알리고, 일기를 지우면 사진도 지운다');
  check(!/fetch\(|sendBeacon|XMLHttpRequest|innerHTML/.test((await Promise.all(['photo.js', 'photo-store.js'].map(read))).join('\n')), '사진 코드는 스스로 어디로도 보내지 않는다');
  check(['"photo.js"', '"photo-store.js"', '"idb.js"'].every((f) => sw.includes(f)), '사진 코드는 인터넷 없이 담아 두는 목록에 있다');
  const firstScreen = (await Promise.all(['app.js', 'store.js', 'data.js', 'offline.js', 'notify.js', 'alerts.js', 'dom.js', 'views/map.js', 'views/card.js'].map(read))).join('\n');
  check(!/photo/.test(firstScreen), '사진 코드는 첫 화면에 싣지 않는다');
}

// 회사 링크(R48): 관심 회사의 공식 주소를 줄마다 글로. 로그인하지 않고 어디로도 보내지 않는다.
{
  const read = (p) => readFile(join(dist, p), 'utf8');
  const { officialLinks } = await import('../web/share.js');
  const byId = new Map([['A1', ['A1', 'Alpha Robotics']], ['B/2', ['B/2', 'Beta 가나']]]);
  const link = 'https://exhibitors.ces.tech/8_0/exhibitor/exhibitor-details.cfm?exhid={id}';
  const r = officialLinks([{ id: 'B/2' }, { id: 'NOPE' }, { id: 'A1' }], byId, link, '2026-11-22');
  const lines = r.text.trim().split('\n');
  check(r.count === 2 && lines.length === 3 && lines[0] === 'CES 2027 관심 회사 2곳의 공식 전시사 쪽 링크 (자료 2026-11-22에 받음)' && lines[1] === 'Beta 가나 — https://exhibitors.ces.tech/8_0/exhibitor/exhibitor-details.cfm?exhid=B%2F2' && lines[2].startsWith('Alpha Robotics — ') && officialLinks([], byId, link, 'x').text === '',
    '회사 링크: 관심 목록 차례로 줄마다 "회사 이름 — 공식 주소"이고, 자료에서 빠진 회사는 건너뛰고, 주소의 id는 인코딩하고, 관심이 없으면 빈 글이다');
  const settingsV = await read('views/settings.js');
  const linksFn = settingsV.slice(settingsV.indexOf('function linksRow'), settingsV.indexOf('// 종이 명함: 있는지'));
  check(linksFn.includes("row('회사 링크'") && linksFn.includes('navigator.clipboard.writeText') && linksFn.includes('ces2027-관심회사-공식링크.txt') && /make = async \(\) => \{\s*const \[data, meta\] = await Promise\.all\(\[getExhibitors\(\)/.test(linksFn) && !/fetch\(|sendBeacon|XMLHttpRequest|innerHTML|window\.open|location/.test(linksFn),
    '설정의 "회사 링크": 복사 · 파일로 둘이고, 전시사 자료는 누를 때만 받고, 로그인하거나 어디로 보내는 코드가 없다');
}

const table = ['무엇 | 본 것', '--- | ---', ...lines].join('\n');
console.log(table);
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `### 지은 것 살피기\n\n${table}\n`);
if (failed) {
  console.error(`안 된 것 ${failed}개`);
  process.exit(1);
}
