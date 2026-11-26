// 오프라인 점검: 한 번 온라인으로 연 뒤 네트워크를 끊고(context.setOffline + 시험용 서버가 연결을 끊음) 화면마다 열어 보고 써 본다.
// 화면 · 기능 코드는 건드리지 않는다. 결과는 표(기능 × 됨 · 일부 · 안 됨)로 찍고, 마크다운으로도 남길 수 있다.
//
// 쓰는 법:  node tests/offline.mjs <지은 dist 폴더> [--browser=chromium|webkit] [--out=표.md]
//   dist는 CI의 "짓기"가 만든 것과 같은 꼴이다(scripts/stamp.mjs까지 돌린 것). 자료가 없는 dist면 자료 쪽 시험은 "안 됨"으로 나온다.
//   Playwright는 npm 설치 없이 playwright-cli(전역)의 것을 쓴다. 다른 곳의 것을 쓰려면 PLAYWRIGHT_CORE=<playwright-core 폴더>.
//   브라우저 실행 파일이 Playwright 판과 어긋나면 PW_CHROMIUM=<실행 파일> · PW_WEBKIT=<실행 파일>로 알려 준다.
//   CI(.github/workflows/pages.yml의 "인터넷을 끊고 써 보기")는 playwright-core를 따로 받아 PLAYWRIGHT_CORE로 알려 주고 Chromium으로 돈다.
// 끝낼 때: 예상과 다른 것이 있으면 1, 없으면 0. "예상"은 아래 step()의 expect(기본 '됨')다.
//   알려진 한계(밖의 지도 · 공식 사이트 · 아이폰에 없는 기능)는 expect를 '안 됨' · '일부'로 적어 두어 시험이 실패하지 않는다.

import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { join, extname } from 'node:path';

const args = process.argv.slice(2);
const dist = args.find((a) => !a.startsWith('--')) || 'dist';
const opt = (k, d) => (args.find((a) => a.startsWith(`--${k}=`)) || '').slice(k.length + 3) || d;
const browserName = opt('browser', 'chromium');
const outFile = opt('out', '');
const PORT = Number(opt('port', '47610'));
const ORIGIN = `http://127.0.0.1:${PORT}`;

const need = createRequire(process.env.PLAYWRIGHT_CORE ? `${process.env.PLAYWRIGHT_CORE}/package.json` : '/opt/homebrew/lib/node_modules/@playwright/cli/package.json');
const pw = need(process.env.PLAYWRIGHT_CORE ? '.' : 'playwright-core');

// ---------- 시험용 서버: 끊으면 연결을 그냥 끊는다(비행기 모드처럼) ----------
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8' };
const net = { up: true, served: [], variant: 0, failPrefix: null, failed: [] };
const baseVersion = async () => JSON.parse(await readFile(join(dist, 'version.json'), 'utf8')).v;
const server = createServer(async (req, res) => {
  if (!net.up) { req.socket.destroy(); return; }
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (net.failPrefix && path !== '/sw.js' && path !== '/version.json' && net.failPrefix(path)) { net.failed.push(path); req.socket.destroy(); return; }
  try {
    let file = join(dist, path);
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    let body = await readFile(file);
    // 새 판 흉내: 판 이름만 바꾼다(담는 목록은 그대로). 현장에서 새 판이 올라온 것과 같은 모양이다.
    if (net.variant && (path === '/sw.js' || path === '/version.json')) body = Buffer.from(String(body).split(await baseVersion()).join(`${await baseVersion()}-new${net.variant}`));
    net.served.push(path);
    res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(body);
  } catch { res.writeHead(404); res.end('없다'); }
}).listen(PORT, '127.0.0.1');

// ---------- 결과 모으기 ----------
const rows = [];
let unexpected = 0;
const mark = { '됨': '됨', '일부': '일부', '안 됨': '안 됨', '모름': '모름' };
// run: () => status 또는 { status, note }. 던지면 "안 됨"으로 센다. expect: 예상한 결과(기본 '됨').
async function step(area, item, run, expect = '됨') {
  let status = '안 됨', note = '';
  try {
    const r = await run();
    if (typeof r === 'string') status = r; else if (r === true) status = '됨'; else if (r === false) status = '안 됨'; else if (r) { status = r.status; note = r.note || ''; }
  } catch (e) { status = '안 됨'; note = `오류: ${String(e.message || e).split('\n')[0].slice(0, 140)}`; }
  const same = status === expect;
  if (!same) unexpected += 1;
  rows.push({ area, item, status, note, expect, same });
  console.log(`${same ? ' ' : '!'} ${status.padEnd(4)} | ${area} | ${item}${note ? ` — ${note}` : ''}${same ? '' : `   (예상 ${expect})`}`);
}
const facts = [];
const fact = (what, value) => { facts.push({ what, value }); console.log(`  사실 | ${what}: ${value}`); };

// ---------- 브라우저 ----------
const launchOptions = {};
// Playwright 판과 받아 둔 브라우저 판이 어긋나면 받아 둔 Chrome for Testing을 직접 가리킨다(헤드리스 쉘은 듣기 화면에서 죽어서 쓰지 않는다).
if (browserName === 'chromium') { launchOptions.executablePath = process.env.PW_CHROMIUM || `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`; launchOptions.args = ['--headless=new']; }
if (browserName === 'webkit' && process.env.PW_WEBKIT) launchOptions.executablePath = process.env.PW_WEBKIT;
// 받아 둔 실행 파일이 없는 곳(CI의 리눅스)에서는 Playwright가 받은 Chromium을 새 헤드리스로 띄운다(channel: 'chromium'). 그것도 없으면 기본으로.
const browser = await pw[browserName].launch(launchOptions)
  .catch(() => (browserName === 'chromium' ? pw.chromium.launch({ channel: 'chromium' }) : Promise.reject(new Error('없다'))))
  .catch(() => pw[browserName].launch());
let ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, acceptDownloads: true, permissions: browserName === 'chromium' ? ['geolocation', 'clipboard-read', 'clipboard-write'] : ['geolocation'], geolocation: { latitude: 36.1338, longitude: -115.1577, accuracy: 20 } });
// 복사한 글을 시험이 읽을 수 있게 writeText를 한 겹 싼다(WebKit은 클립보드 읽기를 막아 둔다). 원래 복사도 그대로 부른다.
await ctx.addInitScript(() => {
  try {
    const c = navigator.clipboard, orig = c?.writeText?.bind(c);
    if (c && orig) c.writeText = async (t) => { try { sessionStorage.setItem('__clip', String(t)); } catch { /* 막힌 곳이면 그대로 */ } return orig(t).catch(() => {}); };
  } catch { /* 클립보드가 없는 곳 */ }
  // 책상 Safari(WebKit)에는 파일 공유 창이 있지만 창 없는 시험에서는 고를 사람이 없어 끝나지 않는다.
  // 그래서 여기서는 "공유 창이 없는 폰"으로 두어 내려받기 길을 보고, 공유 창 길은 아래 "일기 파일을 폰의 공유 창으로 건넨다"에서 흉내로 따로 본다.
  try { Object.defineProperty(Navigator.prototype, 'canShare', { value: undefined, configurable: true, writable: true }); } catch { /* 못 바꾸는 곳이면 그대로 */ }
});
let page = await ctx.newPage();
const external = new Set();      // 앱이 스스로 부른 바깥 주소
const failedOffline = new Map(); // 끊은 뒤 못 받은 것 → 어느 화면에서
let where = '처음 열기';
let offlineNow = false;
page.on('request', (r) => { const u = r.url(); if (!u.startsWith(ORIGIN) && !/^(data|blob|about|chrome-error):/.test(u)) external.add(u.slice(0, 120)); });
page.on('requestfailed', (r) => { if (offlineNow && r.url().startsWith(ORIGIN)) if (!r.url().includes('__nope')) failedOffline.set(new URL(r.url()).pathname, where); });
const errors = [];
page.on('pageerror', (e) => errors.push(`${where}: ${String(e.message).slice(0, 120)}`));

const sleep = (ms) => page.waitForTimeout(ms);
const go = async (hash, label = hash) => { where = label; await page.goto('about:blank'); await page.goto(`${ORIGIN}/${hash}`); await sleep(400); };
const view = () => page.evaluate(() => document.querySelector('#view')?.innerText || '');
const failedView = async () => /불러오지 못했/.test(await view());
// 밖으로 나가는 링크 가까이의 한 줄(끊겼을 때만 CSS가 그린다): 카드의 단추 줄 아래, 목록은 맨 위에 한 번. 없으면 'none'.
const netNote = (link) => link.evaluate((a) => {
  const group = a.closest('.actions, .pcard-links, .navbar, .row-actions'), list = a.closest('ul, ol');
  const under = group ? getComputedStyle(group, '::after').content : 'none';
  return under !== 'none' ? under : list ? getComputedStyle(list, '::before').content : 'none';
});
const store = (key) => page.evaluate((k) => { try { return JSON.parse(localStorage.getItem(`ces2027.${k}`)); } catch { return null; } }, key);

// 담아 둘 목록(sw.js의 FILES)을 읽는다.
const swText = await readFile(join(dist, 'sw.js'), 'utf8');
const listed = JSON.parse(`[${swText.match(/const FILES = \[(.*)\];/)[1]}]`);
async function walk(dir, base = '') { const out = []; for (const e of await readdir(join(dir, base), { withFileTypes: true })) { const rel = base ? `${base}/${e.name}` : e.name; if (e.isDirectory()) out.push(...await walk(dir, rel)); else out.push(rel); } return out; }
const allFiles = (await walk(dist)).filter((f) => !f.startsWith('.'));
const notListed = allFiles.filter((f) => f !== 'sw.js' && !listed.includes(f));
let bytesListed = 0;
for (const f of listed) bytesListed += await stat(join(dist, f === './' ? 'index.html' : f)).then((s) => s.size, () => 0);

// ================= 1. 처음 열기(온라인) =================
const t0 = Date.now();
await page.goto(`${ORIGIN}/`);
await page.waitForFunction(() => location.hash === '#/home' && !!document.querySelector('.homepage'), null, { timeout: 15000 });
const firstShown = Date.now() - t0;
// 서비스 워커가 다 담을 때까지(담는 일이 첫 화면과 다투지 않게 첫 화면 뒤에 건다)
const version = JSON.parse(await readFile(join(dist, 'version.json'), 'utf8')).v;
let cached = 0, cachedAt = null;
for (let i = 0; i < 120; i++) {
  cached = await page.evaluate(async (v) => (await caches.has(`ces2027-${v}`)) ? (await (await caches.open(`ces2027-${v}`)).keys()).length : 0, version);
  if (cached >= listed.length) { cachedAt = Date.now() - t0; break; }
  await sleep(250);
}
fact('담아 둘 파일', `${listed.length}개 · ${(bytesListed / 1048576).toFixed(2)}MB (압축 전)`);
fact('담아 두지 않는 파일', notListed.join(', ') || '없음');
fact('처음 열어 홈이 뜨기까지(이 컴퓨터, 회선 제한 없음)', `${firstShown}ms`);
fact('다 담기기까지(이 컴퓨터, 회선 제한 없음)', cachedAt == null ? `못 담음(${cached}/${listed.length})` : `${cachedAt}ms`);
await step('처음 열기', `서비스 워커가 목록 ${listed.length}개를 모두 담는다(한 번 열었을 뿐, 다른 화면은 안 열었다)`, () => ({ status: cached >= listed.length ? '됨' : '안 됨', note: `${cached}/${listed.length}` }));
await step('처음 열기', '설정 칸 "인터넷 없이"가 "다 담았다"로 바뀐다', async () => {
  await page.goto(`${ORIGIN}/#/settings`);
  await page.waitForFunction(() => /다 담았다/.test(document.querySelector('#view')?.innerText || ''), null, { timeout: 8000 });
  return true;
});
await step('처음 열기', '다 담았다는 알림이 첫 화면 · 명함 화면에 보인다', async () => {
  await page.goto('about:blank'); await page.goto(`${ORIGIN}/#/card`); await sleep(500);
  const t = await view();
  return { status: /인터넷 없이|담아 둔|담았/.test(t) ? '됨' : '안 됨', note: '설정 탭을 열어야만 보인다' };
}, '안 됨');
await step('처음 열기', '바깥 주소를 스스로 부르지 않는다(글꼴 · 라이브러리 · 분석)', () => ({ status: external.size === 0 ? '됨' : '안 됨', note: [...external].join(' ') }));
await step('처음 열기', '새로 고침하면 서비스 워커가 화면을 맡는다(controller)', async () => { await page.reload(); await sleep(500); return page.evaluate(() => !!navigator.serviceWorker.controller); });

// ================= 2. 네트워크를 끊는다 =================
await ctx.setOffline(true);
net.up = false;
offlineNow = true;
await step('끊기', '브라우저가 끊긴 것으로 안다(navigator.onLine=false)와 "인터넷 없음" 띠가 보인다', async () => {
  await sleep(300);
  const r = await page.evaluate(() => ({ on: navigator.onLine, band: !document.getElementById('net').hidden }));
  return r.on === false && r.band;
});
// 서버가 끊긴 것도 확인(이제 주소를 직접 부르면 실패해야 시험이 맞다)
await step('끊기', '시험이 맞는지: 서버로 직접 묻는 것은 실패한다(캐시를 안 거치면 못 받는다)', async () => {
  const ok = await page.evaluate(async () => { try { const r = await fetch('/data/__nope.json?x=' + Date.now(), { cache: 'no-store' }); return r.ok; } catch { return false; } });
  errors.length = 0; // 이 시험이 일부러 낸 실패는 오류로 세지 않는다
  return !ok;
});

// 이 시험 브라우저가 IndexedDB에 사진(Blob)을 담을 수 있나. Playwright의 WebKit은 임시 창이라 Blob 저장이 막힌다(앱이 "사생활 보호 창이면…"이라고 말하는 그 경우).
// 못 담는 브라우저에서는 사진이 든 시험의 예상을 "안 됨"으로 바꾼다 — 앱의 잘못이 아니라 시험 창의 한계이고, 실제 아이폰에서 사람이 봐야 하는 것이다.
const blobOk = await page.evaluate(async () => {
  try {
    const db = await new Promise((res, rej) => { const r = indexedDB.open('ces2027-probe', 1); r.onupgradeneeded = () => r.result.createObjectStore('a'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    await new Promise((res, rej) => { const tx = db.transaction('a', 'readwrite'); tx.objectStore('a').put(new Blob(['x'], { type: 'image/jpeg' }), 'k'); tx.oncomplete = res; tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });
    db.close(); indexedDB.deleteDatabase('ces2027-probe');
    return true;
  } catch { return false; }
});
fact('이 시험 브라우저가 IndexedDB에 사진(Blob)을 담을 수 있나', blobOk ? '담을 수 있다' : '못 담는다(임시 창의 한계 · 사진이 든 시험은 "안 됨"이 예상)');

// ================= 3. 첫 실행 · 명함 · QR =================
await step('첫 실행', '앱을 열면(주소만) 홈이 열리고, 홈의 "명함 만들기"를 누르면 명함부터 만드는 화면이다', async () => {
  await go('', '첫 실행');
  await page.waitForFunction(() => location.hash === '#/home' && !!document.querySelector('.home-now'), null, { timeout: 8000 });
  const home = await view();
  await page.locator('.home-now a', { hasText: '명함 만들기' }).click();
  await page.waitForFunction(() => location.hash === '#/card', null, { timeout: 8000 });
  await page.locator('form.panel').waitFor({ timeout: 8000 });
  return /명함부터 만든다/.test(home) && /명함부터 만든다/.test(await view());
});
await step('첫 실행', '별명 · 나 · 깃허브 · 디스코드를 적고 "명함 만들기" → QR 두 개가 폰 안에서 그려진다', async () => {
  await page.getByLabel('별명').fill('시험');
  await page.getByRole('radio', { name: '학생' }).check({ force: true });
  await page.getByText('더 적기').click().catch(() => {});
  await page.getByLabel('깃허브', { exact: true }).fill('https://github.com/octocat');
  await page.getByLabel('디스코드', { exact: true }).fill('https://discord.gg/abc123');
  await page.getByRole('button', { name: '명함 만들기' }).click();
  await page.locator('.qr svg').first().waitFor({ timeout: 8000 });
  const n = await page.locator('.qr svg').count();
  return { status: n === 2 ? '됨' : '일부', note: `QR ${n}개` };
});
await step('첫 실행', '명함이 이 폰에 남는다(localStorage ces2027.profile.v1)', async () => (await store('profile.v1'))?.nick === '시험');

// ================= 4. 지도 =================
await step('지도', '지도 탭: 그림(SVG) · 캠퍼스 셋 · 홀 칩이 열린다', async () => {
  await go('#/map', '지도');
  await page.locator('svg.map').waitFor({ timeout: 12000 });
  const t = await view();
  return /LVCC 캠퍼스/.test(t) && /베네시안 캠퍼스/.test(t) && !(await failedView());
});
const viewBox = () => page.evaluate(() => document.querySelector('#view > .page')?.mapApi?.view?.slice() || null);
await step('지도', '확대 · 축소 단추(+ −)로 크기가 바뀐다', async () => {
  const a = await viewBox();
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '+').click()); await sleep(500);
  const b = await viewBox();
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '−').click()); await sleep(500);
  return a && b && (b[2] - b[0]) < (a[2] - a[0]);
});
await step('지도', '홀 칩(노스)을 누르면 그 홀로 간다(확대 셋: 캠퍼스 → 홀 → 부스)', async () => {
  const a = await viewBox();
  await page.getByRole('button', { name: '노스', exact: true }).click(); await sleep(900);
  const b = await viewBox();
  return a && b && (b[2] - b[0]) < (a[2] - a[0]);
});
let company = null;
await step('지도', '찾기: 회사 이름을 적으면 전시사 자료(전시사 3천여 곳)에서 결과가 나온다', async () => {
  await page.locator('.find-field input').fill('samsung');
  await page.locator('.results .result').first().waitFor({ timeout: 8000 });
  const n = await page.locator('.results .result').count();
  company = await page.locator('.results .result').first().innerText();
  return { status: n > 0 ? '됨' : '안 됨', note: `${n}건 · 첫 결과 ${company.split('\n')[0]}` };
});
await step('지도', '결과를 누르면 그 부스로 가고 회사 카드(이름 · 부스 · 관심 · 갈 곳)가 올라온다', async () => {
  await sleep(400);
  await page.locator('.results .result').first().click();
  await page.locator('.sheet .card h2').waitFor({ timeout: 8000 });
  await sleep(500);
  const t = await page.locator('.sheet').innerText();
  return { status: /관심/.test(t) ? '됨' : '안 됨', note: t.replace(/\n+/g, ' · ').slice(0, 90) };
});
await step('지도', '부스 번호로도 찾는다(14731) · 홀 이름으로도 찾는다', async () => {
  await page.locator('.find-field input').fill('14731');
  await page.locator('.results .result').first().waitFor({ timeout: 8000 });
  const a = await page.locator('.results .result').count();
  await page.locator('.find-field input').fill('사우스');
  await sleep(500);
  const b = await page.locator('.results .result').count();
  return a > 0 && b > 0;
});
await step('지도', '세션(강연)도 찾기에 나온다', async () => {
  await page.locator('.find-field input').fill('keynote');
  await sleep(700);
  const t = await page.locator('.results').innerText().catch(() => '');
  return /keynote/i.test(t);
});
await page.locator('.find-field input').fill('');
await step('지도', '관심 회사를 담으면(카드의 "관심 담기") 폰에 남고 번호 점으로 나온다', async () => {
  await go('#/map/at/' + encodeURIComponent((await page.evaluate(async () => { const d = await (await fetch('data/exhibitors.json')).json(); return d.ex.find((x) => /@LVCC_N$/.test(x[7][0]))[0]; }))), '지도 카드');
  await page.locator('.sheet .card h2').waitFor({ timeout: 12000 });
  await page.getByRole('button', { name: '관심 담기' }).click();
  await sleep(400);
  return (await store('interests.v1'))?.length === 1;
});
await step('지도', '카드의 "1/6의 갈 곳에 넣기"로 날짜를 정한다', async () => {
  await page.getByRole('button', { name: /1\/6의 갈 곳에 넣기/ }).click();
  await sleep(400);
  return (await store('interests.v1'))?.[0]?.day === 1;
});
await step('지도', '길 안내: 내 위치(GPS)를 잡으면 선 · 남은 거리 · 걷는 시간 · 방향이 나온다(GPS는 폰 안에서 잡힌다)', async () => {
  await page.getByRole('button', { name: '길 안내 시작' }).click();
  await page.waitForFunction(() => /걸어서/.test(document.querySelector('.navbar')?.innerText || ''), null, { timeout: 15000 });
  const t = await page.locator('.navbar').innerText();
  return { status: /\d+m|km/.test(t) && /걸어서 \d+분/.test(t) ? '됨' : '일부', note: t.replace(/\n/g, ' · ').slice(0, 80) };
});
await page.getByRole('button', { name: '끝내기' }).click().catch(() => {});
await step('지도', '다른 캠퍼스(베네시안)로 길 안내를 하면 걷는 시간이 나온다', async () => {
  const id = await page.evaluate(async () => { const d = await (await fetch('data/exhibitors.json')).json(); return d.ex.find((x) => /@VEN_/.test(x[7][0]))?.[0]; });
  await go('#/map/at/' + encodeURIComponent(id), '지도 다른 캠퍼스');
  await page.locator('.sheet .card h2').waitFor({ timeout: 12000 });
  await page.getByRole('button', { name: '길 안내 시작' }).click();
  await page.waitForFunction(() => /걸어서|분/.test(document.querySelector('.navbar')?.innerText || ''), null, { timeout: 15000 });
  const t = await page.locator('.navbar').innerText();
  return { status: /걸어서 (약 )?\d+분/.test(t) ? '일부' : '안 됨', note: `${t.replace(/\n/g, ' · ').slice(0, 90)} — 직선 거리로 어림한 걸음 시간이고, 셔틀 시간은 "오가는 법" 화면에 따로 있다` };
}, '일부');
await step('지도', '다른 캠퍼스로 가는 "구글맵 길찾기"는 밖의 지도다(주소는 폰 안에서 만들지만 열려면 인터넷이 있어야 한다)', async () => {
  const href = await page.locator('a', { hasText: '구글맵' }).first().getAttribute('href');
  return { status: /^https:\/\/www\.google\.com\/maps/.test(href || '') ? '안 됨' : '모름', note: '우리 지도의 길 안내(선 · 거리)는 됨, 구글맵으로 넘어가는 것만 안 됨' };
}, '안 됨');
await step('지도', '끊겼을 때 구글맵 단추 아래에 "구글맵은 인터넷이 있어야 열린다" 한 줄이 보인다', async () => {
  const t = await netNote(page.locator('a', { hasText: '구글맵' }).first());
  return { status: /구글맵은 인터넷이 있어야 열린다/.test(t) ? '됨' : '안 됨', note: t };
});
await step('지도', '3D 지도(누를 때만 불러오는 조각 map3d.js)가 열린다', async () => {
  await go('#/map', '지도 3D');
  await page.locator('svg.map').waitFor({ timeout: 12000 });
  await page.getByRole('button', { name: /3D/ }).first().click();
  await page.locator('.map-frame canvas').waitFor({ timeout: 10000 });
  return true;
});
await step('지도', '지도 위의 내 위치 · 따라가기 · 부스 번호로 맞추기', async () => {
  await go('#/map', '지도 내 위치');
  await page.locator('svg.map').waitFor();
  // 같은 칸이 길 안내 판에도 하나 있다(nav-form, 평소엔 숨어 있다). 지도 아래 묶음의 것을 쓴다.
  const fit = page.locator('form.inline:not(.nav-form)', { has: page.locator('input[placeholder^="가까운 부스 번호"]') });
  await fit.locator('input').fill('14731');
  await fit.getByRole('button', { name: '맞추기' }).click();
  await sleep(500);
  return !!(await store('where.v1'));
});
await step('지도', '"셔틀 · 오가는 법"(LVCC ↔ 베네시안 셔틀 노선 · 시간표 · 타는 곳)이 열린다', async () => {
  await go('#/transit', '오가는 법');
  await sleep(500);
  const t = await view();
  return /Tech Express/.test(t) && /LVCC/.test(t) && /베네시안/.test(t) && !(await failedView());
});
await step('지도', '오가는 법의 셔틀 시간표(몇 분마다)가 폰 안 자료에서 나온다', async () => {
  await go('#/transit', '오가는 법 시간표');
  await page.getByRole('button', { name: /전시장 사이와 공항/ }).click().catch(() => {});
  await sleep(400);
  return /20분|30분|10분|매 \d+|07:30/.test(await view()) || (await page.evaluate(async () => (await (await fetch('data/transit.json')).json()).schedules.express.length > 0));
});
await step('지도', '오가는 법의 "지도" 링크 · 출처는 밖(구글맵 · 공식 사이트)으로 나간다', async () => {
  const n = await page.locator('#view a[target=_blank]').count();
  return { status: n > 0 ? '안 됨' : '모름', note: `밖으로 나가는 링크 ${n}개` };
}, '안 됨');

// ================= 5. 전시사 목록 =================
await step('전시사 목록', '목록이 열리고 3천여 곳이 줄로 나온다', async () => {
  await go('#/list', '전시사 목록');
  await page.locator('.exlist .ex-row').first().waitFor({ timeout: 12000 });
  return /\d,\d{3}곳/.test(await page.locator('.list-count').innerText());
});
await step('전시사 목록', '이름 찾기 · 거르기 칩(혁신상 · 한국 · 위치)이 줄을 줄인다', async () => {
  const all = await page.locator('.list-count').innerText();
  await page.locator('.list-filters button', { hasText: '혁신상' }).click(); await sleep(400);
  const a = await page.locator('.list-count').innerText();
  await page.locator('.list-filters button', { hasText: '한국' }).click(); await sleep(400);
  const b = await page.locator('.list-count').innerText();
  await page.locator('.list-top input[type="search"]').fill('samsung'); await sleep(500);
  const c = await page.locator('.list-count').innerText();
  return all !== a && a !== b && b !== c;
});
await step('전시사 목록', '줄의 "관심"을 누르면 관심 목록에 더해진다', async () => {
  const before = (await store('interests.v1'))?.length || 0;
  await page.locator('.list-count button', { hasText: '풀기' }).first().click().catch(() => {});
  await page.locator('.list-top input[type="search"]').fill('');
  await sleep(500);
  await page.locator('.ex-like').first().click();
  await sleep(400);
  return ((await store('interests.v1'))?.length || 0) > before;
});

// ================= 6. 갈 곳 =================
await step('갈 곳', '갈 곳 탭: 이 날의 "다음 한 곳"이 크게 나온다(길 안내 · 다녀왔다 단추)', async () => {
  await go('#/plan', '갈 곳');
  await sleep(600);
  const t = await view();
  return /다녀왔다/.test(t) && /길 안내/.test(t) && !(await failedView());
});
await step('갈 곳', '"다녀왔다"를 누르면 그 곳이 "다녀온 곳"으로 접힌다 → "보기"로 펼치고 "접기"로 접는다', async () => {
  await page.getByRole('button', { name: /다녀왔다고 표시/ }).first().click();
  await sleep(500);
  const seen = ((await store('interests.v1')) || []).filter((x) => x.seen).length;
  const t = await view();
  const fold = await page.getByRole('button', { name: /다녀온 곳 \d+곳 보기/ }).count();
  if (fold) { await page.getByRole('button', { name: /다녀온 곳 \d+곳 보기/ }).click(); await sleep(300); }
  const folded = await page.getByRole('button', { name: '다녀온 곳 접기' }).count();
  if (folded) await page.getByRole('button', { name: '다녀온 곳 접기' }).click();
  return { status: /다녀온 곳/.test(t) && fold && folded ? '됨' : '안 됨', note: `다녀옴 표시 ${seen}곳` };
});
await step('갈 곳', '강연 일정 · 추천 회사 · 내 시간(시간과 일정)이 열린다', async () => {
  const out = [];
  for (const h of ['#/sessions', '#/rec', '#/days']) { await go(h, `갈 곳 ${h}`); await sleep(500); out.push(!(await failedView()) && (await view()).length > 80); }
  return out.every(Boolean);
});

// ================= 7. 세션 =================
await step('세션', '강연 일정: 날짜 칩 · 분야 · 기조연설 거르기 · 찾기', async () => {
  await go('#/sessions', '세션');
  await page.locator('.pick-row, .entry, li').first().waitFor();
  const a = await view();
  await page.getByRole('button', { name: /^1\/7/ }).click(); await sleep(400);
  const b = await view();
  await page.getByRole('button', { name: '기조연설' }).click(); await sleep(400);
  const c = await view();
  await page.locator('input[type=search]').fill('robot'); await sleep(500);
  const d = await view();
  return a !== b && b !== c && c !== d && /\d+개/.test(a);
});
await step('세션', '"내 일정에 넣기"가 폰에 남는다', async () => {
  await go('#/sessions', '세션 내 일정');
  await page.getByRole('button', { name: '내 일정에 넣기' }).first().click();
  await sleep(400);
  return ((await store('events.v1')) || []).length > 0;
});
await step('세션', '세션 카드의 "공식 쪽" 링크는 CES 공식 사이트로 나간다', async () => {
  const href = await page.getByRole('link', { name: '공식 쪽' }).first().getAttribute('href');
  return { status: /^https:\/\/www\.ces\.tech/.test(href || '') ? '안 됨' : '모름', note: '목록과 시간은 됨, 공식 설명 쪽은 인터넷이 있어야 열린다' };
}, '안 됨');
await step('세션', '끊겼을 때 세션 목록 맨 위에 "구글맵 · 공식 사이트는 인터넷이 있어야 열린다"가 한 번만 보인다(줄마다 되풀이하지 않는다)', async () => {
  const perRow = await page.locator('.row-actions').first().evaluate((n) => getComputedStyle(n, '::after').content);
  const t = await netNote(page.getByRole('link', { name: '공식 쪽' }).first());
  return { status: /공식 사이트는 인터넷이 있어야 열린다/.test(t) && perRow === 'none' ? '됨' : '안 됨', note: t };
});

// ================= 8. 일기 =================
const png = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 1600; c.height = 1200; const x = c.getContext('2d'); for (let i = 0; i < 40; i++) { x.fillStyle = `hsl(${i * 9} 70% 55%)`; x.fillRect(i * 40, (i * 31) % 1200, 120, 90); } return c.toDataURL('image/png').split(',')[1]; });
await step('일기', '일기 쓰기: 회사 · 본 것 · 느낀 점 · 누구에게를 적고 "폰에 남기기"', async () => {
  await go('#/diary/new', '일기 쓰기');
  await page.locator('textarea[name=saw]').fill('오프라인 시험: 로봇 시연을 봤다.');
  await page.locator('details.more > summary').click(); // 나머지 칸은 "더 적기" 아래 접혀 있다
  await page.locator('textarea[name=felt]').fill('해 볼 것: 명함 먼저 건네기.');
  await page.locator('input[name=other]').fill('시험 회사');
  await page.locator('input[name=for]').first().check({ force: true });
  await page.getByRole('button', { name: '폰에 남기기' }).click();
  await sleep(700);
  const list = await store('diary.v1');
  return { status: list?.length === 1 ? '됨' : '안 됨', note: `일기 ${list?.length || 0}개` };
});
await step('일기', '일기 사진 한 장: 폰에서 150KB 안으로 줄여 IndexedDB에 둔다', async () => {
  await go('#/diary/new', '일기 사진');
  await page.locator('details.more > summary').click(); // 나머지 칸은 "더 적기" 아래 접혀 있다
  await page.locator('input[name=other]').fill('사진 회사');
  await page.locator('textarea[name=saw]').fill('사진 시험');
  await page.locator('input[type=file]').setInputFiles({ name: 'p.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await page.waitForFunction(() => /로 줄였다/.test(document.querySelector('#view')?.innerText || ''), null, { timeout: 15000 }); // 줄이는 동안은 남기지 않는다
  await page.getByRole('button', { name: '폰에 남기기' }).click();
  await sleep(900);
  const info = await page.evaluate(async () => {
    const list = JSON.parse(localStorage.getItem('ces2027.diary.v1') || '[]');
    const e = list.find((x) => x.photo);
    if (!e) return null;
    const db = await new Promise((res, rej) => { const r = indexedDB.open('ces2027', 2); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const blob = await new Promise((res) => { const q = db.transaction('photo').objectStore('photo').get(e.id); q.onsuccess = () => res(q.result); });
    db.close();
    return blob ? { size: blob.size, type: blob.type, meta: e.photo } : null;
  });
  fact('일기 사진 한 장(1600x1200 그림) 줄인 뒤 크기', info ? `${(info.size / 1024).toFixed(0)}KB ${info.type}` : '없음');
  return { status: info && info.size <= 150 * 1024 ? '됨' : '안 됨', note: info ? `${(info.size / 1024).toFixed(0)}KB` : '사진이 안 남았다' };
}, blobOk ? '됨' : '안 됨');
await step('일기', '일기 목록 → 카드 열기 → 고치기 → 다시 남기기(사진 그대로)', async () => {
  await go('#/diary', '일기 목록');
  await sleep(500);
  await page.getByRole('button', { name: /시험 회사|사진 회사/ }).first().click().catch(async () => { await page.locator('.stop-open').first().click(); });
  await sleep(500);
  await page.getByRole('link', { name: /고치기|다듬기/ }).first().click();
  await page.locator('textarea[name=felt]').fill('고쳤다.');
  await page.getByRole('button', { name: '폰에 남기기' }).click();
  await sleep(700);
  return (await store('diary.v1')).some((e) => e.felt === '고쳤다.');
});
await step('일기', '앱을 껐다 켜도(새로 열기) 일기 · 사진이 그대로 있다', async () => {
  await go('', '다시 열기');
  await page.waitForFunction(() => location.hash === '#/home', null, { timeout: 8000 });
  const list = await store('diary.v1');
  const photo = await page.evaluate(async () => { const db = await new Promise((res) => { const r = indexedDB.open('ces2027', 2); r.onsuccess = () => res(r.result); }); const n = await new Promise((res) => { const q = db.transaction('photo').objectStore('photo').count(); q.onsuccess = () => res(q.result); }); db.close(); return n; });
  return { status: list?.length === 2 && photo === 1 ? '됨' : '안 됨', note: `일기 ${list?.length} · 사진 ${photo}` };
}, blobOk ? '됨' : '안 됨');

// ================= 9. 만난 사람 · 명함 받기 =================
await step('만난 사람', '명함 받기(주소 붙여넣기): 주소를 적어 남기면 만난 사람에 쌓인다 · 남자마자 "무슨 대화를 했나" 두 칸(대화 한 줄 · 이름)이 뜬다(R61)', async () => {
  await go('#/people/new', '명함 받기');
  // 앱 안 카메라가 안 되는 폰에서는 붙여 넣는 칸이 처음부터 펴져 있다. 접혀 있을 때만 편다.
  if (!(await page.locator('input[name=addr]').isVisible())) await page.getByRole('button', { name: '주소 붙여넣기' }).click();
  await page.locator('input[name=addr]').fill('https://github.com/torvalds');
  await page.getByRole('button', { name: '남기기' }).click();
  await sleep(700);
  const list = await store('people.v1');
  const talk = (await page.locator('input[name=talk]').isVisible()) && (await page.locator('.pcard input[name=nick]').isVisible());
  return { status: list?.length === 1 && talk ? '됨' : '안 됨', note: `두 칸 ${talk ? '뜸' : '안 뜸'} · 만난 사람 ${list?.length || 0}명 (key: ${await page.evaluate(() => Object.keys(localStorage).filter((k) => /people|met/.test(k)).join(','))})` };
});
// 카메라로 QR을 읽는 기능(BarcodeDetector)은 브라우저마다 다르다: Mac의 Chromium에는 있고, 리눅스(CI)의 Chromium과 WebKit에는 없다. 있는 곳에서만 "됨"을 기대한다.
const canScan = await page.evaluate(() => 'BarcodeDetector' in window).catch(() => false);
await step('만난 사람', '명함 받기(카메라 QR): 이 화면에서 카메라로 읽을 수 있나(인터넷과는 상관없다)', async () => {
  await go('#/people/new', '명함 받기 카메라');
  const off = await page.locator('button', { hasText: '카메라 켜기' }).evaluate((b) => b.disabled || b.hidden);
  const note = (await page.locator('.note').first().innerText().catch(() => '')).slice(0, 80);
  return { status: off ? '일부' : '됨', note: off ? `이 브라우저는 못 읽는다: ${note}` : '단추가 켜져 있다(실제 읽기는 폰 카메라로 봐야 한다)' };
}, canScan ? '됨' : '일부');
await step('만난 사람', '앱 안 카메라가 안 되는 폰에서만 "기본 카메라로 비추고 주소를 복사해 붙여 넣는다" 한 줄이 보이고 붙여 넣는 칸이 펴져 있다. 되는 폰에서는 안 보인다', async () => {
  const look = () => page.evaluate(() => ({ note: document.querySelector('#view .panel .note')?.innerText || '', cam: !document.querySelector('#view .panel button.btn')?.hidden, paste: !document.querySelector('form.paste')?.hidden }));
  const here = await look();
  // 다른 쪽 폰을 흉내 낸다: 읽는 기능이 있으면 지우고, 없으면 있는 척한다(단추와 글만 본다. 카메라는 켜지 않는다).
  await page.evaluate((has) => { if (has) delete window.BarcodeDetector; else window.BarcodeDetector = class { detect() { return []; } }; }, canScan);
  await page.evaluate(() => { location.hash = '#/people'; });
  await sleep(400);
  await page.evaluate(() => { location.hash = '#/people/new'; });
  await sleep(700);
  const other = await look();
  const [none, can] = canScan ? [other, here] : [here, other];
  const ok = /기본 카메라/.test(none.note) && !/BarcodeDetector|브라우저/.test(none.note) && !none.cam && none.paste && !/기본 카메라/.test(can.note) && can.cam && !can.paste;
  return { status: ok ? '됨' : '안 됨', note: none.note };
});
await step('만난 사람', '만난 사람 목록 · 찾기', async () => {
  await go('#/people', '만난 사람');
  await sleep(400);
  return /만난 사람 1명/.test(await view());
});

// ================= 10. 내보내기 · 보내기 · 모은 일기 · 회사 링크 =================
let exported = null;
await step('내보내기', '설정 "내보내기 — 파일로": 일기 · 대화 · 사진이 JSON 파일 하나로 내려온다', async () => {
  await go('#/settings', '설정 내보내기');
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }), page.getByRole('button', { name: '일기 · 대화 · 사진 전부 파일로' }).click()]);
  const path = await dl.path();
  exported = JSON.parse(await readFile(path, 'utf8'));
  fact('내보내기 파일 이름', dl.suggestedFilename());
  fact('내보내기 파일 크기(일기 2 · 사진 1)', `${((await stat(path)).size / 1024).toFixed(0)}KB`);
  return { status: (exported.entries || []).length >= 2 ? '됨' : '일부', note: `${dl.suggestedFilename()} · 일기 ${(exported.entries || []).length}개` };
}, blobOk ? '됨' : '일부');
await step('내보내기', '일기 탭 "보내기"(모으는 곳 주소가 없으면 파일로)와 "글로 복사"', async () => {
  await go('#/diary', '일기 보내기');
  await sleep(400);
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }), page.getByRole('button', { name: '보내기', exact: true }).click()]);
  await dl.path();
  await page.getByRole('button', { name: '글로 복사' }).click();
  await sleep(300);
  const clip = await page.evaluate(() => sessionStorage.getItem('__clip') || '');
  return { status: /오프라인 시험|사진 시험/.test(clip) ? '됨' : '일부', note: `복사한 글 ${clip.length}자` };
});
await step('내보내기', '일기 파일을 폰의 공유 창으로 건넨다(되는 폰에서). 공유 창을 닫으면 아무것도 안 나가고, 안 되는 폰은 내려받는다', async () => {
  // 책상 브라우저에는 폰의 공유 창이 없어, 건네는 조각(handoff.js)에 "된다"고 답하는 흉내를 끼워 본다. 실제 공유 창(AirDrop · 파일에 저장)은 아이폰에서 봐야 한다.
  const r = await page.evaluate(async () => {
    const keep = [navigator.share, navigator.canShare];
    let got = null;
    navigator.canShare = (d) => !!d?.files?.length;
    navigator.share = async (d) => { got = d.files[0].name; };
    const { handFile } = await import('./handoff.js');
    const how = await handFile('시험.json', '{}');
    navigator.share = async () => { throw new DOMException('닫음', 'AbortError'); };
    const cancel = await handFile('시험.json', '{}');
    [navigator.share, navigator.canShare] = keep;
    return { how, got, cancel };
  });
  const sources = (await Promise.all(['views/diary.js', 'views/settings.js'].map((f) => readFile(join(dist, f), 'utf8'))));
  return { status: r.how === 'shared' && r.got === '시험.json' && r.cancel === 'cancel' && sources.every((s) => /handFile\(/.test(s)) ? '됨' : '안 됨', note: `건넴 ${r.how} · 닫음 ${r.cancel} (일기 "보내기"와 설정 "내보내기"가 쓴다)` };
});
await step('내보내기', '모은 일기 열기: 받은 일기 파일을 고르면 폰 안(diary.wasm)에서 네 태그 × 회사 한 장이 나온다', async () => {
  await go('#/collect', '모은 일기');
  await page.locator('input[type=file]').setInputFiles({ name: '일기.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(exported)) });
  await sleep(1500);
  const t = await view();
  return !(await failedView()) && /시험 회사|사진 회사|학생|태그/.test(t) && !/못 읽|실패/.test(t);
});
await step('내보내기', '"한장.md 내려받기"와 "복사"', async () => {
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }), page.getByRole('button', { name: /한장\.md 내려받기/ }).click()]);
  await dl.path();
  await page.getByRole('button', { name: '복사', exact: true }).click().catch(() => {});
  return true;
});
await step('내보내기', '설정 "회사 링크": 관심 회사의 공식 주소를 글로 복사 · 파일로(주소 목록을 만드는 것까지는 됨, 주소 자체는 공식 사이트)', async () => {
  await go('#/settings', '설정 회사 링크');
  await page.getByRole('button', { name: '관심 회사 공식 링크 복사' }).click();
  await sleep(600);
  const clip = await page.evaluate(() => sessionStorage.getItem('__clip') || '');
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }), page.getByRole('button', { name: '관심 회사 공식 링크 파일로' }).click()]);
  await dl.path();
  return { status: /https:\/\//.test(clip) ? '됨' : '안 됨', note: `${clip.split('\n').length}줄` };
});
await step('내보내기', '갈 곳 목록 내보내기(문서로 · 표로)와 시간 · 일정 파일 내보내기', async () => {
  await go('#/settings', '설정 갈 곳 내보내기');
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }), page.getByRole('button', { name: '갈 곳 목록을 표 파일(CSV)로' }).click()]);
  await dl.path();
  return true;
});

// ================= 11. 설정 =================
await step('설정', '글자 크기 네 단계가 바로 바뀐다', async () => {
  await go('#/settings', '설정');
  await page.getByRole('button', { name: '가장 크게' }).click(); await sleep(300);
  const big = await page.evaluate(() => getComputedStyle(document.querySelector('.setrow-main b')).fontSize);
  await page.getByRole('button', { name: '기본', exact: true }).click(); await sleep(300);
  const base = await page.evaluate(() => getComputedStyle(document.querySelector('.setrow-main b')).fontSize);
  return parseFloat(big) > parseFloat(base);
});
await step('설정', '화면 색(어둡게)이 바뀌고 다시 열어도 남는다', async () => {
  await page.getByRole('button', { name: '어둡게' }).click();
  await page.waitForLoadState('load'); await sleep(900);
  const t = await page.evaluate(() => document.documentElement.dataset.theme || '');
  await page.getByRole('button', { name: '자동' }).click(); await page.waitForLoadState('load'); await sleep(600);
  return t === 'dark';
});
await step('설정', '"인터넷 없이" 칸: "다 담았다"와 담긴 판 이름', async () => {
  await go('#/settings', '설정 인터넷 없이');
  await page.waitForFunction(() => /다 담았다/.test(document.querySelector('#view')?.innerText || ''), null, { timeout: 6000 });
  return /판 \d{4}-\d\d-\d\d/.test(await view());
});
await step('설정', '"홈 화면에 추가" 단추: 아이폰 사파리에는 안 뜬다(beforeinstallprompt가 없다). 앱 안에 아이폰용 안내 글이 있나', async () => {
  const sources = (await Promise.all(['views/settings.js', 'views/card.js', 'offline.js', 'index.html', 'tips.js'].map((f) => readFile(join(dist, f), 'utf8')))).join('\n');
  const hasGuide = /공유 단추|공유 아이콘|홈 화면에 추가.{0,20}(공유|사파리)/.test(sources);
  const tipAt = JSON.parse(await readFile(join(dist, 'data/settings.json'), 'utf8')).homeTip;
  return { status: hasGuide ? '됨' : '안 됨', note: hasGuide ? `안내 글을 지어 두었다(web/tips.js). 보이는 자리는 설정 homeTip = ${tipAt}` : '앱 안에 아이폰용 안내가 없다' };
});
await step('설정', '자료 출처 카드(받은 날 · 공식 출처 링크)', async () => {
  await page.getByRole('button', { name: '출처' }).click();
  await sleep(400);
  return /받은 날/.test(await page.locator('.pcard, .sheet, #view').first().innerText());
});

// ================= 12. 나머지 화면 · 못 받는 것 =================
await step('듣기 · 대화', '듣기(녹음) · 대화 칸 화면이 열린다', async () => {
  const out = [];
  for (const h of ['#/listen', '#/talk']) { await go(h, h); await sleep(500); out.push(!(await failedView())); }
  return out.every(Boolean);
});
await step('듣기 · 대화', '폰 안 받아쓰기 모델(약 15MB 실행기 + 모델): 미리 받지 않았으면 인터넷 없이는 못 쓴다', async () => {
  const lazy = await page.evaluate(async () => { const c = await caches.keys(); return { keys: c }; });
  const has = listed.some((f) => f.startsWith('vendor/'));
  return { status: has ? '됨' : '안 됨', note: '미리 담는 목록에 없다(누를 때 받는다). 받아 두지 않았다면 현장에서 못 쓴다' };
}, '안 됨');
await step('회사 줄', '"로고 보기"(설정 companyImage 켬): 로고 자료(logos.json)는 미리 담지 않고 로고 그림은 공식 사이트다', async () => {
  const pre = listed.includes('data/logos.json');
  return { status: pre ? '일부' : '안 됨', note: '누를 때 받는 자료 + 공식 사이트 그림' };
}, '안 됨');

// ================= 13. 끊은 채 모든 화면 한 바퀴: 못 받은 것 모으기 =================
const ROUTES = ['#/home', '#/map', '#/list', '#/plan', '#/rec', '#/days', '#/sessions', '#/diary', '#/diary/new', '#/people', '#/people/new', '#/settings', '#/card', '#/card/edit', '#/collect', '#/transit', '#/listen', '#/talk'];
await step('끊은 채 한 바퀴', `화면 ${ROUTES.length}곳을 차례로 열어도 "화면을 불러오지 못했다"가 없다`, async () => {
  const bad = [];
  for (const h of ROUTES) { await go(h, `한 바퀴 ${h}`); await sleep(300); if (await failedView()) bad.push(h); }
  return { status: bad.length ? '안 됨' : '됨', note: bad.join(' ') };
});
await step('끊은 채 한 바퀴', '화면을 여는 동안 받지 못한 주소가 없다(받아 둔 것만으로 모두 열린다)', async () => {
  const miss = [...failedOffline.entries()].map(([p, w]) => `${p} ← ${w}`);
  return { status: miss.length ? '일부' : '됨', note: miss.join(' / ') };
});
await step('끊은 채 한 바퀴', '자바스크립트 오류가 없다', () => ({ status: errors.length ? '일부' : '됨', note: errors.slice(0, 3).join(' / ') }));

// ================= 14. 저장 · 자료가 사라질 위험 =================
const storageInfo = await page.evaluate(async () => {
  const est = await navigator.storage?.estimate?.().catch(() => null);
  const persisted = await navigator.storage?.persisted?.().catch(() => null);
  return { usage: est?.usage, quota: est?.quota, persisted };
});
fact('이 브라우저의 저장 한도(quota) · 쓰는 양(usage)', `${storageInfo.quota ? `${(storageInfo.quota / 1048576).toFixed(0)}MB` : '모름'} · ${storageInfo.usage ? `${(storageInfo.usage / 1048576).toFixed(1)}MB` : '모름'}`);
fact('storage.persisted()', String(storageInfo.persisted));
await step('저장', '앱이 "지우지 마라"를 부탁한다(navigator.storage.persist())', async () => {
  const text = (await Promise.all(allFiles.filter((f) => f.endsWith('.js') || f === 'index.html').map((f) => readFile(join(dist, f), 'utf8')))).join('\n');
  const called = /storage\.persist\s*\(/.test(text);
  return { status: called ? '됨' : '안 됨', note: called ? '' : '코드 어디에도 persist() 호출이 없다' };
});
await step('저장', '일기는 localStorage(글) + IndexedDB(사진 · 녹음)에 있다', async () => {
  const keys = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('ces2027.')));
  fact('localStorage 열쇠', keys.join(', '));
  return keys.includes('ces2027.diary.v1') && keys.includes('ces2027.profile.v1');
});

// ================= 15. 내 자료 지우기(맨 끝) =================
await step('설정', '"이 폰의 내 자료 지우기"는 두 번 묻고, 지우면 처음처럼 홈으로 돌아간다(앱 파일은 그대로)', async () => {
  await go('#/settings', '설정 지우기');
  await page.locator('#mine-open').click();
  await page.locator('#mine-next').click();
  await page.locator('#mine-wipe').click();
  // 지운 뒤 0.9초 있다가 다시 연다. 다시 여는 동안에는 물어볼 수 없어서(문서가 바뀐다) 잠깐씩 다시 묻는다.
  let home = false;
  for (let i = 0; i < 40 && !home; i++) {
    home = await page.evaluate(() => location.hash === '#/home' && !localStorage.getItem('ces2027.profile.v1') && !!document.querySelector('.home-now')).catch(() => false);
    if (!home) await sleep(300);
  }
  if (!home) return { status: '안 됨', note: '지운 뒤 12초 안에 홈이 뜨지 않았다' };
  await sleep(300);
  const keep = await page.evaluate(async (v) => caches.has(`ces2027-${v}`), version);
  return { status: keep ? '됨' : '일부', note: keep ? '앱 파일은 남았다' : '앱 파일까지 지워졌다' };
});
await step('끊은 채 한 바퀴', '지운 뒤에도 인터넷 없이 처음부터 다시 쓸 수 있다(명함 만들기)', async () => {
  await page.locator('.home-now a', { hasText: '명함 만들기' }).click();
  await page.locator('form.panel').waitFor({ timeout: 8000 });
  await page.getByLabel('별명').fill('다시');
  await page.getByRole('radio', { name: '정년' }).check({ force: true });
  await page.getByRole('button', { name: '명함 만들기' }).click();
  await sleep(800);
  return (await store('profile.v1'))?.nick === '다시';
});

// ================= 16. 가는 동안 판이 바뀌면 =================
// 온라인으로 돌려 "새 판"을 올린 뒤, 새 판을 받다 끊긴다. 옛 판이 그대로 남아 열려야 한다.
await ctx.setOffline(false);
net.up = true;
offlineNow = false;
await step('밖으로 나가는 링크', '인터넷이 돌아오면 "인터넷이 있어야 열린다" 줄이 사라진다', async () => {
  await go('#/sessions', '돌아온 뒤 세션');
  const t = await netNote(page.getByRole('link', { name: '공식 쪽' }).first());
  return { status: t === 'none' ? '됨' : '안 됨', note: t };
});
await step('판 바뀜', '새 판을 받는 도중에 끊기면(담는 파일 중 하나가 안 와도) 옛 판이 그대로 열린다(새 판은 통째로 받거나 아예 안 받는다)', async () => {
  await go('#/settings', '판 바뀜');
  const before = await page.evaluate(async () => (await (await fetch('version.json')).json()).v);
  net.variant = 1;
  net.failPrefix = (p) => p.startsWith('/data/halls/'); // 새 판 담는 도중 홀 자료가 끊긴다
  const reg = await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); await r.update().catch(() => {}); return !!r; });
  await sleep(2500);
  // 끊긴 새 판의 담음은 빈 껍데기로 남을 수 있다(caches.open이 이름을 먼저 만든다). 빈 것은 해가 없다 — 옛 판이 가득 차 있고 새 판은 비어 있으면 "옛 판 그대로"다.
  const sizes = await page.evaluate(async () => { const out = {}; for (const k of (await caches.keys()).filter((n) => n.startsWith('ces2027-'))) out[k] = (await (await caches.open(k)).keys()).length; return out; });
  const keys = Object.keys(sizes);
  const stillOld = sizes[`ces2027-${before}`] >= listed.length && keys.filter((k) => k !== `ces2027-${before}`).every((k) => sizes[k] === 0);
  fact('새 판이 끊긴 뒤 담음 이름과 파일 수', JSON.stringify(sizes));
  // 이제 완전히 끊고 열어 본다
  await ctx.setOffline(true); net.up = false; offlineNow = true;
  await go('#/map', '판 바뀜 뒤 지도');
  await page.locator('svg.map').waitFor({ timeout: 10000 });
  const bandShown = await page.evaluate(() => !document.getElementById('update').hidden);
    fact('끊긴 새 판 때문에 "새 판이 있다" 띠가 뜨나', String(bandShown));
  return { status: stillOld && reg && !bandShown ? '됨' : '안 됨', note: `담긴 판 ${keys.length}개 · 홀 자료 ${net.failed.length}번 끊음` };
});
const cacheSizes = () => page.evaluate(async () => { const out = {}; for (const k of (await caches.keys()).filter((n) => n.startsWith('ces2027-'))) out[k] = (await (await caches.open(k)).keys()).length; return out; });
const pageVersion = () => page.evaluate(async () => (await (await fetch('version.json')).json()).v).catch(() => '');
await step('판 바뀜', '새 판을 끝까지 받아도 "다시 열기"를 누르기 전에는 쓰던 판 그대로다(끊은 채 앱을 새로 열어도). "새 판이 있다" 띠는 다시 뜬다', async () => {
  await ctx.setOffline(false); net.up = true; offlineNow = false; net.failPrefix = null;
  await go('#/settings', '판 바뀜 2');
  const before = await pageVersion();
  await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); await r.update().catch(() => {}); });
  await page.locator('#update:not([hidden])').waitFor({ timeout: 20000 });
  await ctx.setOffline(true); net.up = false; offlineNow = true;
  await go('#/map', '판 바뀜 뒤 새로 열기');
  await page.locator('svg.map').waitFor({ timeout: 10000 });
  const band = await page.locator('#update:not([hidden])').waitFor({ timeout: 8000 }).then(() => true, () => false);
  const v = await pageVersion();
  const sizes = await cacheSizes();
  const both = sizes[`ces2027-${before}`] >= listed.length && sizes[`ces2027-${before}-new1`] >= listed.length;
  fact('새 판을 받아 둔 채(누르기 전) 담음 이름과 파일 수', JSON.stringify(sizes));
  return { status: v === before && band && both && !(await failedView()) ? '됨' : '안 됨', note: `쓰는 판 ${v} · 띠 ${band}` };
});
await step('판 바뀜', '띠의 "닫기"를 누르면 띠가 사라지고 새로 열어도 안 뜬다. 설정의 "인터넷 없이" 줄에는 "새 판이 있다"와 "다시 열기"가 남는다', async () => {
  await page.locator('#update-close').click();
  await sleep(300);
  const gone = await page.evaluate(() => document.getElementById('update').hidden);
  await go('#/settings', '띠를 닫은 뒤 설정');
  await page.waitForFunction(() => /새 판이 있다/.test(document.querySelector('.setlist')?.innerText || ''), null, { timeout: 8000 });
  const still = await page.evaluate(() => ({ band: !document.getElementById('update').hidden, button: !document.getElementById('set-reopen')?.hidden }));
  return { status: gone && !still.band && still.button && (await pageVersion()) !== '' ? '됨' : '안 됨', note: `닫은 뒤 띠 ${still.band ? '보임' : '없음'} · 설정의 다시 열기 ${still.button ? '있음' : '없음'}` };
});
await step('판 바뀜', '끊은 채 설정의 "다시 열기"를 누르면 그때 새 판으로 열리고, 옛 판은 지워지고, 띠는 없다', async () => {
  await page.locator('#set-reopen').click();
  await sleep(3500);
  const v = await pageVersion();
  const names = Object.keys(await cacheSizes());
  const band = await page.evaluate(() => !document.getElementById('update').hidden);
  return { status: /-new1$/.test(v) && names.length === 1 && /-new1$/.test(names[0]) && !band && !(await failedView()) ? '됨' : '안 됨', note: `판 ${v} · 담음 ${names.length}개` };
});
await step('판 바뀜', '띠를 닫은 뒤에도 더 새 판을 받으면 띠가 다시 뜬다(닫은 것은 그 판에만 듣는다)', async () => {
  await ctx.setOffline(false); net.up = true; offlineNow = false;
  // 한 번 닫아 둔다(지금 판 다음의 판 -new2에 대해). 그 뒤 -new3이 올라오면 다시 떠야 한다.
  net.variant = 2;
  await go('#/settings', '더 새 판');
  await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); await r.update().catch(() => {}); });
  await page.locator('#update:not([hidden])').waitFor({ timeout: 20000 });
  await page.locator('#update-close').click();
  net.variant = 3;
  await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); await r.update().catch(() => {}); });
  const again = await page.locator('#update:not([hidden])').waitFor({ timeout: 20000 }).then(() => true, () => false);
  const v = await pageVersion();
  await page.locator('#update-go').click();
  await sleep(3500);
  const now = await pageVersion();
  await ctx.setOffline(true); net.up = false; offlineNow = true;
  return { status: again && /-new1$/.test(v) && /-new3$/.test(now) ? '됨' : '안 됨', note: `닫은 뒤 더 새 판에서 띠 ${again ? '다시 뜸' : '안 뜸'} · 누르기 전 ${v} → 누른 뒤 ${now}` };
});
await step('판 바뀜', '새 판으로 바꾼 뒤 끊은 채 화면들이 열린다(지도 · 갈 곳 · 일기 · 설정)', async () => {
  const bad = [];
  for (const h of ['#/map', '#/plan', '#/diary', '#/settings']) { await go(h, `새 판 ${h}`); await sleep(500); if (await failedView()) bad.push(h); }
  return { status: bad.length ? '안 됨' : '됨', note: bad.join(' ') };
});

// ================= 마무리 =================
// ================= 17. 처음 담는 도중에 끊기면 =================
// 새 폰처럼 빈 상태로 처음 연다. 담는 도중(홀 자료가 올 때) 연결이 끊긴다 → 서비스 워커는 "전부 아니면 하나도 아니다"로 담는다.
await ctx.close();
ctx = await browser.newContext({ viewport: { width: 390, height: 780 } });
page = await ctx.newPage();
offlineNow = false; net.up = true; net.variant = 0; net.failed.length = 0;
net.failPrefix = (p) => p.startsWith('/data/halls/');
await step('처음 담다 끊김', '담는 도중 연결이 끊기면 아무것도 담기지 않는다(반쯤 담긴 채로 남지 않는다)', async () => {
  where = '처음 담다 끊김';
  await page.goto(`${ORIGIN}/`);
  await sleep(4000);
  const info = await page.evaluate(async () => ({ keys: await caches.keys(), regs: (await navigator.serviceWorker.getRegistrations()).filter((r) => r.active).length }));
  const cachedNow = info.keys.filter((k) => k.startsWith('ces2027-'));
  fact('담다 끊긴 뒤 담음 · 활성 서비스 워커', `${cachedNow.join(',') || '없음'} · ${info.regs}`);
  return { status: info.regs === 0 ? '됨' : '안 됨', note: '서비스 워커가 깔리지 않았다 = 다음에 다시 시도한다' };
});
await step('처음 담다 끊김', '그 상태에서 설정을 열면 "아직 담지 못했다 · 와이파이에서 다시 연다"가 보인다', async () => {
  await page.goto(`${ORIGIN}/#/settings`);
  await page.waitForFunction(() => /아직 담지 못했다 · 와이파이에서 다시 연다/.test(document.querySelector('#view')?.innerText || ''), null, { timeout: 8000 }).catch(() => {});
  const t = await view();
  return { status: /아직 담지 못했다/.test(t) && !/담는 중이다|다 담았다/.test(t) ? '됨' : '안 됨', note: (t.match(/인터넷 없이\n?[^\n]*/) || [''])[0].replace(/\n/g, ' ') };
});
await step('처음 담다 끊김', '이 상태로 비행기 모드에 들어가 열면 앱이 안 열린다(캐시가 없다)', async () => {
  await ctx.setOffline(true); net.up = false;
  const ok = await page.goto(`${ORIGIN}/`, { timeout: 5000 }).then((r) => !!r && r.ok(), () => false);
  return { status: ok ? '됨' : '안 됨', note: '처음 열 때 한 번은 끊기지 않는 인터넷이 필요하다' };
}, '안 됨');
await step('처음 담다 끊김', '인터넷이 다시 되면, 앱을 다시 열 때 담기를 다시 시도해 끝까지 담는다', async () => {
  await ctx.setOffline(false); net.up = true; net.failPrefix = null;
  await page.goto(`${ORIGIN}/`);
  let n = 0;
  for (let i = 0; i < 40 && n < listed.length; i++) { await sleep(300); n = await page.evaluate(async (v) => (await caches.has(`ces2027-${v}`)) ? (await (await caches.open(`ces2027-${v}`)).keys()).length : 0, version); }
  return { status: n >= listed.length ? '됨' : '안 됨', note: `${n}/${listed.length}` };
});

// 담다 끊긴 채 앱을 열어 둔 사람: 인터넷이 돌아오면 앱을 껐다 켜지 않아도 다시 담고, 설정 줄이 "다 담았다"로 바뀐다.
await ctx.close();
ctx = await browser.newContext({ viewport: { width: 390, height: 780 } });
page = await ctx.newPage();
net.failPrefix = (p) => p.startsWith('/data/halls/');
await step('처음 담다 끊김', '앱을 열어 둔 채 인터넷이 돌아오면 저절로 다시 담고 "다 담았다"로 바뀐다', async () => {
  where = '열어 둔 채 다시 담기';
  await page.goto(`${ORIGIN}/#/settings`);
  await page.waitForFunction(() => /아직 담지 못했다/.test(document.querySelector('#view')?.innerText || ''), null, { timeout: 10000 });
  await ctx.setOffline(true);
  net.failPrefix = null;
  await sleep(300);
  await ctx.setOffline(false);
  await page.waitForFunction(() => /다 담았다/.test(document.querySelector('#view')?.innerText || ''), null, { timeout: 15000 });
  return true;
});

// ================= 18. 아이폰 Safari 탭으로 열었을 때의 안내 · 저녁의 일기 띠 =================
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
// 새 창을 연다. 설정 파일을 받는 길에서 home 값만 바꿔 끼울 수 있다(끼우지 않으면 지은 값 그대로).
const freshCtx = async ({ userAgent = IPHONE, app = false, home = null, cards = null } = {}) => {
  await ctx.close();
  ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, ...(userAgent ? { userAgent } : {}), serviceWorkers: 'block' });
  if (app) await ctx.addInitScript(() => { Object.defineProperty(Navigator.prototype, 'standalone', { get: () => true, configurable: true }); });
  page = await ctx.newPage();
  const base = JSON.parse(await readFile(join(dist, 'data/settings.json'), 'utf8'));
  if (home) await page.route('**/data/settings.json', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ...base, home }) }));
  if (cards) await page.route('**/data/home.json', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ cards }) }));
};
const tips = () => page.evaluate(() => [...document.querySelectorAll('.tip-box p, .tip-line')].map((n) => n.textContent).join(' / '));
await step('홈', '아이폰 Safari 탭으로 처음 열면 홈(아래 탭 다섯의 가운데가 켜짐)에 "홈 화면에 추가" 칸이 명함 만들기 위에 보인다(명함 전에는 한눈에 보기가 없다). 명함 화면과 지도에는 없고, 닫으면 다시 열어도 안 뜬다', async () => {
  await freshCtx();
  await page.goto(`${ORIGIN}/`);
  await page.locator('.homepage .home-now').waitFor({ timeout: 8000 });
  const first = await page.evaluate(() => ({ hash: location.hash, tip: document.querySelector('.tip-box p')?.textContent || '', above: !!document.querySelector('.tip-box + .home-now'), now: document.querySelector('.home-now a')?.textContent, tabs: [...document.querySelectorAll('.tabs a')].map((a) => a.textContent.trim()).join(' '), cur: document.querySelector('.tabs a[aria-current=page]')?.dataset.tab, glance: !!document.querySelector('.glance') }));
  await page.locator('.home-now a').click();
  await page.locator('form.panel').waitFor({ timeout: 8000 });
  const onCard = await tips();
  await page.evaluate(() => localStorage.setItem('ces2027.profile.v1', JSON.stringify({ nick: '시험', tag: 'student', line: '', github: '', discord: '' })));
  await page.goto('about:blank'); await page.goto(`${ORIGIN}/#/map`);
  await page.locator('svg.map').waitFor({ timeout: 10000 });
  await sleep(600);
  const onMap = await tips();
  await page.goto('about:blank'); await page.goto(`${ORIGIN}/`);
  await page.locator('.homepage .home-now').waitFor({ timeout: 8000 });
  const after = await page.locator('.tip-box p').innerText({ timeout: 4000 }).catch(() => '');
  await page.getByRole('button', { name: '안내 닫기' }).click();
  await page.goto('about:blank'); await page.goto(`${ORIGIN}/`);
  await page.locator('.homepage .home-now').waitFor({ timeout: 8000 });
  await sleep(400);
  const closed = await tips();
  const ok = first.hash === '#/home' && /먼저 아래 공유 단추에서 "홈 화면에 추가"/.test(first.tip) && first.above && first.now === '명함 만들기' && first.tabs === '지도 갈 곳 홈 일기 설정' && first.cur === 'home' && !first.glance
    && onCard === '' && onMap === '' && /인터넷 없이도 열린다/.test(after) && closed === '';
  return { status: ok ? '됨' : '안 됨', note: `${first.tip} · 명함 화면 "${onCard}" · 지도 "${onMap}" · 닫은 뒤 "${closed}"` };
});
await step('홈', '홈 화면 앱으로 열었거나 아이폰이 아니면 "홈 화면에 추가" 칸이 없다. 머리의 앱 이름과 아래 줄 가운데 홈은 44px 넘게 눌리고 홈으로 간다. 한눈에 보기 줄을 누르면 그 탭이다', async () => {
  await freshCtx({ app: true });
  await page.goto(`${ORIGIN}/`);
  await page.locator('.homepage .home-now').waitFor({ timeout: 8000 });
  await sleep(400);
  const inApp = await tips();
  await freshCtx({ userAgent: null });
  await page.goto(`${ORIGIN}/`);
  await page.locator('.homepage .home-now').waitFor({ timeout: 8000 });
  await sleep(400);
  const other = await tips();
  await page.evaluate(() => localStorage.setItem('ces2027.profile.v1', JSON.stringify({ nick: '시험', tag: 'student', line: '', github: '', discord: '' })));
  await page.goto('about:blank'); await page.goto(`${ORIGIN}/#/plan`);
  await sleep(800);
  const brand = await page.locator('.brand').evaluate((a) => { const r = a.getBoundingClientRect(); return { h: Math.round(r.height), w: Math.round(r.width), label: a.getAttribute('aria-label'), href: a.getAttribute('href') }; });
  await page.locator('.brand').click();
  await page.locator('.homepage .home-now').waitFor({ timeout: 8000 });
  const back = await page.evaluate(() => ({ hash: location.hash, now: document.querySelector('.home-now a')?.textContent }));
  // 아래 줄 가운데 "홈"으로도 온다(11/26 안). 명함이 있으면 할 일 아래에 한눈에 보기 줄 넷이 있고, 줄을 누르면 그 탭이다.
  await page.goto('about:blank'); await page.goto(`${ORIGIN}/#/diary`);
  await sleep(800);
  const tab = await page.locator('.tabs a[data-tab="home"]').evaluate((a) => { const r = a.getBoundingClientRect(); return { h: Math.round(r.height), w: Math.round(r.width) }; });
  await page.locator('.tabs a[data-tab="home"]').click();
  await page.locator('.homepage .glance').waitFor({ timeout: 8000 });
  const rows = await page.evaluate(() => [...document.querySelectorAll('.glance a b')].map((b) => b.textContent).join(' '));
  await page.locator('.glance a[href="#/people"]').click();
  await sleep(800);
  const went = await page.evaluate(() => location.hash);
  const ok = inApp === '' && other === '' && brand.h >= 44 && brand.w >= 44 && brand.label === '홈으로' && brand.href === '#/home' && back.hash === '#/home' && back.now === '지도 열기'
    && tab.h >= 44 && tab.w >= 44 && rows === '갈 곳 일기 만난 사람 내 명함' && went === '#/people';
  return { status: ok ? '됨' : '안 됨', note: `앱 이름 ${brand.w}x${brand.h} "${brand.label}" → ${back.hash} · 명함이 있고 담은 곳이 없으면 "${back.now}" · 아래 홈 칸 ${tab.w}x${tab.h} · 한눈에 보기 "${rows}" → ${went}` };
});
await step('홈', '안내 칸은 자료 파일(data/home.json)에 적은 대로 보이고, 비어 있으면 그 자리는 없다. 설정 home을 off로 두면 예전처럼 열면 명함부터이고 탭은 넷 · 앱 이름은 지도로 간다', async () => {
  await freshCtx({ userAgent: null, cards: [{ title: '자리 표시', text: ['시험용 칸이다.'], action: { label: '지도', href: '#/map' } }] });
  await page.goto(`${ORIGIN}/`);
  await page.locator('.homepage .home-now').waitFor({ timeout: 8000 });
  await sleep(400);
  const withCard = await page.evaluate(() => [...document.querySelectorAll('.home-card')].map((c) => `${c.querySelector('h2').textContent}|${c.querySelector('a')?.getAttribute('href')}`).join(' '));
  await freshCtx({ userAgent: null });
  await page.goto(`${ORIGIN}/`);
  await page.locator('.homepage .home-now').waitFor({ timeout: 8000 });
  await sleep(400);
  const shipped = await page.locator('.home-card').count();
  await freshCtx({ userAgent: null, home: 'off' });
  await page.goto(`${ORIGIN}/`);
  await page.locator('form.panel').waitFor({ timeout: 8000 });
  await sleep(400);
  const off = await page.evaluate(() => ({ hash: location.hash, brand: document.querySelector('.brand').getAttribute('href'), tabs: document.querySelectorAll('.tabs a').length }));
  const ok = withCard === '자리 표시|#/map' && shipped === 0 && off.hash === '#/card' && off.brand === '#/map' && off.tabs === 4;
  return { status: ok ? '됨' : '안 됨', note: `칸 "${withCard}" · 실은 파일의 칸 ${shipped}개 · off면 ${off.hash} · 탭 ${off.tabs}개` };
});
await step('일기 챙기기', '전시 날 저녁에 보내지 않은 일기가 있으면 탭 위 띠가 "보내지 않은 일기 1개 · 일기 열기"를 보이고, 일기 탭에서는 사라진다', async () => {
  await ctx.close();
  ctx = await browser.newContext({ viewport: { width: 390, height: 780 } });
  page = await ctx.newPage();
  await page.clock.install({ time: new Date('2027-01-07T03:00:00Z') }); // 라스베이거스 1/6 19:00, 전시가 끝난 뒤
  await page.goto(`${ORIGIN}/`);
  await page.evaluate(() => {
    localStorage.setItem('ces2027.profile.v1', JSON.stringify({ nick: '시험', tag: 'student', line: '', github: '', discord: '' }));
    localStorage.setItem('ces2027.diary.v1', JSON.stringify([{ id: 'd1', date: '2027-01-06', company: 'A', saw: '본 것', felt: '', tag: 'student' }]));
  });
  await page.goto('about:blank'); await page.goto(`${ORIGIN}/#/plan`);
  const text = await page.locator('#notice:not([hidden])').innerText({ timeout: 8000 }).catch(() => '');
  await page.locator('#notice-go').click().catch(() => {});
  await sleep(1200);
  const at = await page.evaluate(() => ({ hash: location.hash, hidden: document.getElementById('notice').hidden }));
  return { status: /보내지 않은 일기 1개/.test(text) && /일기 열기/.test(text) && at.hash === '#/diary' && at.hidden ? '됨' : '안 됨', note: `${text.replace(/\n/g, ' · ')} → ${at.hash}` };
});
await step('링크드인 이틀', '만난 지 이틀이 지났는데 "팔로우함"이 없는 사람이 있으면, 인터넷을 끊어도 탭 위 띠 "링크드인 팔로우 안 한 사람 n명 · 보기 · 닫기"가 뜨고 "보기"는 그 사람들만 모인 목록이다(R62)', async () => {
  await ctx.close();
  ctx = await browser.newContext({ viewport: { width: 390, height: 780 } });
  page = await ctx.newPage();
  await page.clock.install({ time: new Date('2027-01-08T18:00:00Z') }); // 1/6 받은 사람의 이틀 뒤
  await page.goto(`${ORIGIN}/`);
  await page.evaluate(() => {
    localStorage.setItem('ces2027.profile.v1', JSON.stringify({ nick: '시험', tag: 'student', line: '', github: '', discord: '' }));
    localStorage.setItem('ces2027.people.v1', JSON.stringify([
      { id: 'p1', nick: '이부스', links: [], met: '2027-01-06', metAt: Date.parse('2027-01-06T17:00:00Z'), company: '', exId: '', booth: '', note: '', followed: '' },
      { id: 'p2', nick: '김로봇', links: [], met: '2027-01-06', metAt: Date.parse('2027-01-06T17:00:00Z'), company: '', exId: '', booth: '', note: '', followed: '2027-01-07' },
    ]));
  });
  await page.goto('about:blank'); await page.goto(`${ORIGIN}/#/plan`);
  await page.locator('#notice:not([hidden])').waitFor({ timeout: 8000 }).catch(() => {});
  await ctx.setOffline(true);
  await page.evaluate(() => { location.hash = '#/diary'; });
  await sleep(800);
  const text = await page.locator('#notice:not([hidden])').innerText({ timeout: 8000 }).catch(() => '');
  // 이 새 창에는 서비스 워커가 없어 끊긴 채로는 만난 사람 화면 조각을 못 받는다(실제 폰은 담아 둔다 — 위 "끊은 채 한 바퀴"). 띠는 끊긴 채로 보고, 목록은 다시 이어 본다
  await ctx.setOffline(false);
  await page.locator('#notice-go').click().catch(() => {});
  await sleep(1200);
  const at = await page.evaluate(() => ({ hash: location.hash, rows: document.querySelectorAll('.stops .stop').length, hidden: document.getElementById('notice').hidden }));
  return { status: /링크드인 팔로우 안 한 사람 1명/.test(text) && /보기/.test(text) && /닫기/.test(text) && at.hash === '#/people/follow' && at.rows === 1 && at.hidden ? '됨' : '안 됨', note: `${text.replace(/\n/g, ' · ')} → ${at.hash} · ${at.rows}명` };
});

await ctx.close(); await browser.close(); server.close();

const count = (s) => rows.filter((r) => r.status === s).length;
console.log(`\n됨 ${count('됨')} · 일부 ${count('일부')} · 안 됨 ${count('안 됨')} · 모름 ${count('모름')} (합 ${rows.length})`);
console.log(unexpected ? `예상과 다른 것 ${unexpected}개` : '예상과 같다');
if (outFile) {
  const md = ['| 영역 | 확인한 것 | 결과 | 덧붙임 |', '|---|---|---|---|', ...rows.map((r) => `| ${r.area} | ${r.item} | ${r.status} | ${r.note.replace(/\|/g, '/')} |`), '', ...facts.map((f) => `- ${f.what}: ${f.value}`)].join('\n');
  await writeFile(outFile, md);
}
process.exit(unexpected ? 1 : 0);
