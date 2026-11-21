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

// 따로 신청하는 곳 (깊게 7): 공식 출처만, 줄마다 출처와 확인 날짜, 2027 안내가 없는 줄은 "확인 필요"와 작년 것.
{
  const sepData = await json('data/separate.json');
  const sep = await import('../web/separate.js');
  const OFFICIAL = /^https:\/\/(www\.ces\.tech|www\.samsung\.com|news\.samsung\.com|www\.nvidia\.com|www\.hyundai\.com|www\.lg\.com|www\.qualcomm\.com|waymo\.com|zoox\.com|www\.vegasmeansbusiness\.com)\//;
  const isDate = (s) => /^\d{4}-\d\d-\d\d$/.test(s);
  const groups = new Set(sepData.groups.map((g) => g.k));
  const ids = new Set(sepData.items.map((it) => it.id));
  const shapeOk = sepData.items.every((it) => it.id && groups.has(it.group) && it.org && it.what && it.who && ['confirmed', 'check'].includes(it.status) && it.apply && (it.apply.url === null || OFFICIAL.test(it.apply.url)) && it.apply.ko && (it.date === null || isDate(it.date)) && (it.deadline === null || isDate(it.deadline)) && (it.watchFrom === null || isDate(it.watchFrom)));
  check(shapeOk && ids.size === sepData.items.length && isDate(sepData.read), `따로 신청 자료: ${sepData.items.length}줄의 꼴이 맞다 (모둠 · 상태 · 날짜 · 신청 링크)`);
  const sources = sepData.items.flatMap((it) => it.sources);
  check(sepData.items.every((it) => it.sources.length > 0) && sources.every((s) => OFFICIAL.test(s.url) && isDate(s.read) && s.ko), `따로 신청 자료: 줄마다 출처와 확인 날짜가 있고, 출처 ${sources.length}개가 모두 CES 공식 · 회사 공식 사이트다`);
  const waiting = sepData.items.filter((it) => it.status === 'check');
  check(['삼성', '엔비디아', '현대차그룹'].every((org) => sepData.items.some((it) => it.org === org && it.group === 'watch' && it.status === 'check' && it.last && it.last.startsWith('작년(CES 2026)') && it.apply.url === null && it.watchFrom)), `삼성 · 엔비디아 · 현대차그룹: 2027 안내가 없어 "확인 필요"로 두고 작년에 한 것과 다시 볼 날을 적었다 (확인 필요 ${waiting.length}줄 · 확인됨 ${sepData.items.length - waiting.length}줄)`);
  const allText = JSON.stringify(sepData.items);
  const rides = sepData.items.filter((it) => it.group === 'ride');
  check(rides.length >= 3 && !/무료/.test(JSON.stringify(rides.filter((it) => it.id !== 'ride-loop')).replace(/무료라는 말은 없다|무료라고 적지 않는다/g, '')) && rides.find((it) => it.id === 'ride-loop').what.includes('자율주행 아님') && !/@[a-z]+\.[a-z]/i.test(allText), '이동: 자율주행 택시 줄에는 확인되지 않은 "무료"가 없고, 베가스 루프는 자율주행 아님으로 적었다. 자료에 메일 주소가 없다');
  const waymo = sepData.items.find((it) => it.id === 'key-waymo');
  check(waymo.date === '2027-01-05' && waymo.from === '18:30' && waymo.to === '19:45' && /Palazzo/.test(waymo.where), 'Waymo 기조연설은 1/5 18:30 ~ 19:45 베네시안 Palazzo Ballroom이다 (CES 일정표)');
  const badge = sepData.items.find((it) => it.id === 'ces-badge');
  check(badge.what.includes('운영팀이 등록') && badge.apply.url === null && badge.apply.ko.includes('따로 할 일 없음') && badge.todo.includes('여권') && badge.deadline === null && !/달러|\$\d/.test(JSON.stringify(badge)), '배지: 연수단은 운영팀이 등록 · 따로 할 일 없음 · 받는 곳에서 여권 보이기로 적고, 값과 마감은 넣지 않았다');
  // 띠와 일정으로 바꾸는 셈 (지어낸 값으로 본다).
  const fake = [
    { id: 'a', org: '가', what: '표', status: 'check', deadline: '2027-01-03', watchFrom: '2026-12-01', date: '2027-01-06', from: '17:00', to: '18:30', where: '어디', place: '' },
    { id: 'b', org: '나', what: '안내', status: 'check', deadline: null, watchFrom: '2026-12-20', date: null, from: null, to: null, where: '', place: '' },
    { id: 'c', org: '다', what: '끝난 것', status: 'confirmed', deadline: '2026-12-01', watchFrom: '2026-11-01', date: '2027-01-06', from: '11:00', to: null, where: '', place: '' },
  ];
  const due = sep.dueSoon(fake, {}, '2026-12-28');
  check(due.length === 1 && due[0].item.id === 'a' && due[0].left === 6 && sep.dueSoon(fake, {}, '2026-12-26').length === 0 && sep.dueSoon(fake, { a: 'x' }, '2026-12-28').length === 0 && sep.dueSoon(fake, {}, '2027-01-04').length === 0, '마감 띠: 7일 안일 때만 보이고, 신청했다고 표시했거나 지난 것은 뺀다');
  check(sep.toWatch(fake, '2026-12-05').map((it) => it.id).join() === 'a' && sep.toWatch(fake, '2026-12-25').map((it) => it.id).join() === 'a,b' && sep.toWatch(fake, '2026-11-20').length === 0, '다시 볼 띠: 적어 둔 날이 된 "확인 필요" 줄만 보인다');
  const on = sep.toggleApplied(fake[0], {}, [{ id: 'mine', date: '2027-01-06', from: '19:00', to: '20:00', name: '내 일정', place: '' }], '2026-12-28');
  const off = sep.toggleApplied(fake[0], on.applied, on.events, '2026-12-29');
  const noTime = sep.toggleApplied(fake[2], {}, [], '2026-12-28');
  check(on.applied.a === '2026-12-28' && on.events.length === 2 && on.events[1].id === 'sep-a' && on.events[1].from === '17:00' && off.events.length === 1 && off.events[0].id === 'mine' && !off.applied.a && noTime.applied.c && noTime.events.length === 0, '신청함 표시: 날짜와 시간이 정해진 것은 내 일정에 들어가고, 풀면 빠진다. 내가 넣은 일정은 건드리지 않는다');
  const sum = sep.summary(sepData);
  check(sum.watch.slice(0, 3).join() === '삼성,엔비디아,현대차그룹' && sum.rides[0] === 'Waymo' && sum.apply.some((t) => t.includes('레노버')), `첫 화면 카드: ${sum.watch.join(' · ')} · 따로 표 ${sum.apply.length}곳 · 가기 전에 ${sum.rides[0]} 앱`);
  const homeJs = await readFile(join(dist, 'views/home.js'), 'utf8');
  check(homeJs.includes("import('../separate.js')") && !/^import [^;]*separate\.js/m.test(homeJs) && homeJs.includes('separateSeen.v1') && homeJs.includes('CES 배지와 따로 신청해야 하는 곳'), '첫 화면: 따로 신청 카드는 처음 한 번 크게 보이고(닫은 것을 폰에 적는다), 그 셈과 자료는 첫 화면을 그린 뒤에 읽는다');
}

// 물어볼 말 · 듣기 (깊게 6): 질문 묶음, 두 길의 자리, 폰이 못 하는 것은 안 된다고 돌려주는지, 일기 초안의 꼴.
{
  const speech = await import('../web/speech.js');
  const phrases = await json('data/phrases.json');
  const WANT = ['product', 'price', 'launch', 'korea', 'jobs', 'card', 'event'];
  const items = phrases.packs.flatMap((p) => p.items);
  check(WANT.every((k) => phrases.packs.some((p) => p.k === k && p.items.length >= 3)) && items.every((it) => it.ko && /^[\x20-\x7e]+$/.test(it.en)) && /record/i.test(phrases.notice.en) && phrases.notice.ko, `질문 묶음: ${phrases.packs.length}묶음 ${items.length}줄이 한국어 · 영어 짝으로 들어 있고(제품 · 가격 · 출시 · 한국 판매 · 채용 · 명함 교환 · 이벤트), 녹음을 알리는 말이 있다`);
  check(settings.speech === 'on-device' && speech.modeOf({}) === 'on-device' && speech.modeOf({ speech: 'x' }) === 'on-device' && speech.modeOf({ speech: 'device-service' }) === 'device-service' && speech.modeOf(settings, 'device-service') === 'device-service' && speech.modeOf(settings, 'nope') === 'on-device' && speech.modeOf({ speech: 'device-service' }, 'on-device') === 'on-device', '받아쓰기 · 번역을 어디서 하나: 두 길을 다 두고 쓰는 사람이 고른다. 고르기 전 기본값은 "폰 안에서만"이다');
  const talkUi = await readFile(join(dist, 'talk-ui.js'), 'utf8');
  check(speech.allowedMode('device-service', null) === 'on-device' && speech.allowedMode('device-service', '2026-11-21') === 'device-service' && speech.allowedMode('on-device', null) === 'on-device' && /인터넷이 필요하고 소리가 구글 · 애플로 간다/.test(speech.SERVICE_NOTE) && talkUi.includes('speechConsent.v1') && talkUi.includes('SERVICE_NOTE'), '폰의 음성 인식 서비스 길: "인터넷이 필요하고 소리가 구글 · 애플로 간다"를 보이고 한 번 확인받은 뒤에만 쓴다 (확인이 없으면 폰 안에서만)');
  const bare = await speech.capabilities('on-device', { navigator: {} });
  check(Object.values(bare).every((c) => c.ok === false && c.why.length > 0), '아무 기능도 없는 폰: 읽어 주기 · 받아쓰기 · 번역 · 녹음을 "안 됨"과 까닭으로 돌려준다 (숨기지 않는다)');
  class OnlyService {}
  const onlyService = { navigator: {}, webkitSpeechRecognition: OnlyService };
  const a = await speech.capabilities('on-device', onlyService);
  const b = await speech.capabilities('device-service', onlyService);
  check(a.dictate.ok === false && b.dictate.ok === true && /폰 밖/.test(b.dictate.why), '폰 밖 받아쓰기만 있는 폰: 기본 길(폰 안에서만)에서는 안 됨, 폰의 음성 인식 서비스 길에서는 됨이고 소리가 폰 밖으로 간다고 적는다');
  class Local {}
  Local.available = async (o) => (o.processLocally ? 'available' : 'unavailable');
  const full = await speech.capabilities('on-device', { navigator: { mediaDevices: { getUserMedia() {} } }, MediaRecorder: class {}, speechSynthesis: {}, SpeechSynthesisUtterance: class {}, SpeechRecognition: Local, Translator: { availability: async () => 'available', create: async () => ({ translate: async (t) => `ko:${t}` }) } });
  check(full.dictate.ok && full.dictate.local === true && full.translate.ok && full.record.ok && full.speak.ok, '폰 안에서 다 되는 폰: 네 가지가 모두 됨이고 받아쓰기는 폰 안에서 한다');
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
  check(speech.translateLink('a b', 'en', 'ko').startsWith('https://translate.google.com/?sl=en&tl=ko') && !/[?&]key=/.test(speech.translateLink('a', 'en', 'ko')), '번역 사이트 링크에는 키가 없다 (폰 밖 길에서만 보인다)');
  const talkCode = (await Promise.all(['speech.js', 'talk-ui.js', 'audio-store.js', 'views/ask.js', 'views/listen.js'].map((f) => readFile(join(dist, f), 'utf8')))).join('\n');
  check(!/fetch\(|XMLHttpRequest|sendBeacon|WebSocket/.test(talkCode), '말 기능 코드는 스스로 어디로도 보내지 않는다 (fetch · XHR · beacon · 소켓 없음)');
}
check(['companyIntro', 'collector', 'collectorUrl', 'codysseyIcon', 'privateOn'].every((k) => k in settings), `아직 정하지 않은 넷의 자리가 설정에 있다 (회사 소개 ${settings.companyIntro} · 모으는 곳 ${settings.collector}${settings.collectorUrl ? ' 주소 있음' : ' 주소 비어 있음'} · 아이콘 ${settings.codysseyIcon} · 비공개 날 ${settings.privateOn})`);
check(settings.codysseyIcon === false || (typeof settings.codysseyIcon === 'string' && (await exists(settings.codysseyIcon))), `코디세이 아이콘: ${settings.codysseyIcon ? `그림이 있다 (${settings.codysseyIcon})` : '글자만'}`);
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
  const soft = (hex) => { const n = parseInt(hex.slice(1), 16); const [r, gg, b] = [n >> 16, (n >> 8) & 255, n & 255]; return Math.max(r, gg, b) >= 200 && Math.min(r, gg, b) >= 60; };
  check(colors.every(soft) && C.legend('group', tbl).length === tbl.groups.length + 1 && C.legend('plain', tbl).length === 0 && new Set(Object.values(C.GROUP_COLORS)).size === 7, `지도 색은 모두 파스텔이고(${colors.length}가지) 범례가 칠하기마다 있다`);
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
  check(code === 'eUUaAAN.2,ellagio' && link === 'https://example.test/ces-2027/#plan=eUUaAAN.2,ellagio' && JSON.stringify(back) === JSON.stringify(mine) && JSON.stringify(odd) === JSON.stringify([{ id: ids[1], day: 4 }, { id: 'short', day: 0 }]) && merged.added === 1 && merged.items.length === 3 && merged.items[0].day === 2, '목록 코드 · 링크: 만들고 다시 읽으면 같다. 없는 회사 · 겹친 것은 빼고, 받은 것은 내게 없는 것만 더한다');
  const byId = new Map([[ids[0], [ids[0], 'Alpha | Mobility', '', 0, '0', 2, 0, ['W317@LVCC_W_MTG', '5131@LVCC_W']]], [ids[2], [ids[2], 'Bellagio "Suites"', '', -1, '', 0, 0, []]]]);
  const days = [{ key: 1, ko: '1/6 (수)', short: '1/6' }, { key: 2, ko: '1/7 (목)', short: '1/7' }, { key: 0, ko: '날짜 미정', short: '미정' }];
  const pk = new Map([['LVCC_W_MTG', '웨스트 홀 회의실'], ['LVCC_W', '웨스트 홀']]);
  const fakeData = { cats: ['Robotics'], catsKo: ['로봇'], countries: ['South Korea'], link: 'https://exhibitors.ces.tech/x?exhid={id}' };
  const text = Sh.planText(mine, days, byId, pk);
  const md = Sh.planMd(mine, days, byId, pk, '2026-11-20', '2026-12-20');
  const csv = Sh.planCsv(mine, days, byId, pk, fakeData);
  check(text.includes('■ 1/7 (목)\n1. Alpha | Mobility · 웨스트 홀 회의실 W317') && text.includes('목록 코드: eUUaAAN.2,ellagio') && md.includes('| 1 | Alpha / Mobility | W317, 5131 | 웨스트 홀 회의실, 웨스트 홀 |') && md.includes('## 날짜 미정') && csv.startsWith('\ufeff날짜,순서,회사') && csv.includes('"1/7","1","Alpha | Mobility","W317 / 5131","웨스트 홀 회의실 / 웨스트 홀","South Korea","로봇","https://exhibitors.ces.tech/x?exhid=0013000001MeUUaAAN"') && csv.includes('"Bellagio ""Suites"""'), '동선 내보내기: 단톡방 글 · 마크다운 표 · CSV');
}

// 주제 판: 후보 세우기 · 볼 회사 후보 · 출발 전 판 한 장.
{
  const T = await import('../web/topics.js');
  const fake = { v: '2026-11-20', cats: ['Robotics', 'Health', 'Audio'], ex: [
    ['A', 'Alpha Robotics', '', 0, '0', 2, 0, ['14731@LVCC_N']],
    ['B', 'Beta Health', '', 0, '1', 1, 0, []],
    ['C', 'Core Bots', '', 0, '0.1', 1, 0, ['52011A@VEN_AD']],
    ['D', 'Delta Sound', '', 0, '2', 0, 0, []],
    ['E', 'Echo Bots', '', 0, '0', 0, 0, []],
  ] };
  const tbl = { ko: { Robotics: '로봇', Health: '헬스케어', Audio: '오디오' }, audiences: { ret: ['Health'] } };
  const order = (tag, topics) => T.candidates(fake, tbl, tag, topics).map((c) => `${c.ko}${c.mine ? '*' : ''}:${c.awards}/${c.count}`).join(' ');
  check(order(null, []) === '로봇:2/3 헬스케어:2/2 오디오:0/1' && order('ret', []) === '헬스케어*:2/2 로봇:2/3 오디오:0/1' && order(null, [{ cats: ['Robotics'] }]) === '헬스케어:2/2 오디오:0/1', '주제 후보: 내 태그에 맞는 분야 먼저, 혁신상이 많은 차례, 이미 든 분야는 뺀다');
  const topic = { ...T.newTopic('로봇 | 팔', ['Robotics']), ex: ['C', 'ZZ'], notes: { stu: '배워 볼 만하다\n둘째 줄', job: '', ret: '', mid: '' } };
  const sug = T.suggestions(topic, fake);
  check(sug.awards.map((r) => r[0]).join('') === 'A' && sug.others === 1 && T.pinned(topic, fake).map((r) => r[0]).join('') === 'C', '주제의 볼 회사 후보: 혁신상 받은 곳(최고 혁신상 먼저), 넣은 곳과 자료에서 빠진 곳은 뺀다');
  const md = T.boardMarkdown([topic], fake, new Map([['VEN_AD', '베네시안 엑스포 홀 A-D']]), [{ k: 'stu', ko: '학생' }, { k: 'job', ko: '취준생' }, { k: 'ret', ko: '정년' }, { k: 'mid', ko: '장년' }], '2026-12-20');
  check(md.includes('| # | 주제 | 볼 곳 | 학생 | 취준생 | 정년 | 장년 |') && md.includes('| 1 | 로봇 / 팔 | Core Bots (베네시안 엑스포 홀 A-D 52011A) | 배워 볼 만하다 둘째 줄 |  |  |  |') && md.includes('2026-11-20에 받음'), '출발 전 판 한 장: 주제 · 볼 곳 · 네 태그 칸 (docs/기록틀.md 1절의 꼴)');
  const team = { topics: [{ name: '로봇 | 팔' }, { name: '소리', cats: ['Audio', 'Nope'] }] };
  const got = T.fromTeam(team, [topic], fake);
  const full = Array.from({ length: T.MAX_TOPICS }, (_, i) => T.newTopic(`주제 ${i}`));
  check(got.length === 1 && got[0].name === '소리' && String(got[0].cats) === 'Audio' && T.fromTeam(team, full, fake).length === 0, `팀 주제 가져오기: 없는 것만, 없는 분야는 빼고, ${T.MAX_TOPICS}개를 넘기지 않는다`);
  const teamFile = await json('data/topics.json');
  check(Array.isArray(teamFile.topics) && teamFile.topics.length <= T.MAX_TOPICS && teamFile.topics.every((t) => t.name && (t.cats || []).every((c) => c in cats.ko)), `팀 주제 자리(data/topics.json): ${teamFile.topics.length}개`);
}

// 지도와 오프라인.
const appJs = await readFile(join(dist, 'app.js'), 'utf8');
check(!html.includes('map3d') && !appJs.includes('map3d') && (await exists('map3d.js')), '3D 지도는 첫 화면에 싣지 않고 지도 화면에서 그때 불러온다');
// 첫 화면: 미리 받는 조각이 모두 있고, 3D · 코어 · 큰 자료는 미리 받지 않는다.
const preloads = [...html.matchAll(/<link rel="(?:modulepreload|preload)" href="([^"]+)"/g)].map((m) => m[1]);
let preloadOk = preloads.length > 0;
for (const f of preloads) preloadOk = preloadOk && (await exists(f)) && !/map3d|core\.|exhibitors|search-index|views\/(map|find|plan|diary)/.test(f);
check(preloadOk, `첫 화면이 미리 받는 조각 ${preloads.length}개가 모두 있고, 3D · 코어 · 전시사 자료는 거기에 없다`);
// 말 기능(물어볼 말 · 듣기)은 누를 때 불러온다: 첫 화면이 싣는 조각 어디에도 고정으로 물려 있지 않다.
{
  const firstScreen = (await Promise.all(['app.js', 'store.js', 'data.js', 'offline.js', 'notify.js', 'alerts.js', 'dom.js', 'views/home.js', 'views/card.js'].map((f) => readFile(join(dist, f), 'utf8')))).join('\n');
  const fixed = [...firstScreen.matchAll(/^import [^;]*from '([^']+)';/gm)].map((m) => m[1]);
  const lazy = /speech|talk-ui|audio-store|views\/(ask|listen)/;
  check(!fixed.some((f) => lazy.test(f)) && !preloads.some((f) => lazy.test(f) || f.includes('phrases')) && appJs.includes("ask: () => import('./views/ask.js')") && appJs.includes("listen: () => import('./views/listen.js')"), '물어볼 말 · 듣기 · 질문 묶음은 첫 화면에 싣지 않고 누를 때 불러온다');
}
check(html.includes('id="update"') && appJs.includes('offline.update') && appJs.includes('startOffline'), '새 판 안내 자리가 있고, 서비스 워커는 첫 화면 뒤에 건다');
const sw = await readFile(join(dist, 'sw.js'), 'utf8');
const version = await json('version.json').catch(() => null);
const swFiles = JSON.parse(`[${(sw.match(/const FILES = \[(.*)\];/) || [])[1] || ''}]`);
check(!!version && sw.includes(JSON.stringify(version.v)) && !sw.includes('__VERSION__'), `판 이름이 찍혔다 (${version?.v})`);
const mustCache = ['./', 'index.html', 'app.js', 'app.css', 'core.js', 'core.wasm', 'qr.js', 'route.js', 'map3d.js', 'views/home.js', 'views/card.js', 'views/find.js', 'views/plan.js', 'views/map.js', 'views/diary.js', 'views/topics.js', 'views/days.js', 'views/ask.js', 'views/listen.js', 'views/apply.js', 'separate.js', 'data/separate.json', 'speech.js', 'talk-ui.js', 'audio-store.js', 'data/phrases.json', 'topics.js', 'share.js', 'colors.js', 'days.js', 'recommend.js', 'guide.js', 'alerts.js', 'notify.js', 'diary.js', 'locate.js', 'maps.js', 'data/places.json', 'data/topics.json', 'data/booth-spots.json', 'data/info.json', 'version.json', 'manifest.webmanifest', 'icon/icon-192.png'];
const missing = mustCache.filter((f) => !swFiles.includes(f));
const gone = [];
for (const f of swFiles) if (f !== './' && !(await exists(f))) gone.push(f);
check(missing.length === 0 && gone.length === 0, `서비스 워커가 담아 둘 파일 ${swFiles.length}개 (빠진 것 ${missing.join(' ') || '없음'} · 없는 파일 ${gone.join(' ') || '없음'})`);
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

const table = ['무엇 | 본 것', '--- | ---', ...lines].join('\n');
console.log(table);
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `### 지은 것 살피기\n\n${table}\n`);
if (failed) {
  console.error(`안 된 것 ${failed}개`);
  process.exit(1);
}
