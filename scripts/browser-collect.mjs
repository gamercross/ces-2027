// Playwright CLI test for R46: 설정 > 모은 일기 열기. 360 · 390px 폰 크기, 밝게, 글자 크기 네 단계.
// Run with: playwright-cli open about:blank
//           playwright-cli run-code "$(cat scripts/browser-collect.mjs)"
// The app must be served from a stamped dist at http://127.0.0.1:47571/ (자료가 있는 지은 것).
// SHOTS를 채우면(레포 바탕의 상대 경로) 설정 줄 · 고른 뒤 · 칸마다 · 못 읽은 파일 그림을 그 폴더에 남긴다.
// 일기 파일은 지어낸 것이다(가짜 별명 · 지어낸 회사). 진짜 일기를 넣지 않는다.
async (page) => {
  const URL = 'http://127.0.0.1:47571/';
  const SHOTS = '';
  const check = (ok, what) => { if (!ok) throw new Error(`안 됨: ${what}`); };
  const settle = (ms = 500) => page.waitForTimeout(ms);
  const shot = async (name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}${name}` }); };

  const bundle = (nick, tag, entries) => JSON.stringify({ app: 'ces-2027-diary', v: 1, exportedAt: '2027-01-08T03:00:00Z', author: { nick, tag }, entries });
  const e = (id, date, company, booth, saw, felt, tags) => ({ id, date, company, exhibitorId: '', booth, saw, felt, for: tags });
  const FILES = [
    { name: 'ces2027-일기-가짜가-20270108.json', mimeType: 'application/json', buffer: Buffer.from(bundle('가짜 가', 'stu', [
      e('a1', '2027-01-06', 'Alpha Robotics (지어낸 회사)', '14731@LVCC_N', '로봇 팔이 컵을 집어 옮긴다', '코드를 몰라도 가르칠 수 있다면 배워 볼 만하다', ['stu', 'job']),
      e('a2', '2027-01-07', 'Zeta Home (지어낸 회사)', '52011A@VEN_AD', '조용한 주방 도우미', '부모님 집에 좋겠다', ['ret', 'mid'])])) },
    { name: 'ces2027-일기-가짜나-20270108.json', mimeType: 'application/json', buffer: Buffer.from(bundle('가짜 나', 'job', [
      e('a1', '2027-01-06', 'alpha robotics (지어낸 회사)', '', '같은 팔을 공장 줄에 세 대 세워 두었다', '', ['job']),
      e('b1', '2027-01-08', 'Beta Cloud (지어낸 회사)', '', '', '태그를 고르지 않았다', [])])) },
    // 같은 사람이 같은 일기를 다시 보낸 파일: 같은 일기는 한 번만 센다
    { name: 'ces2027-일기-가짜가-20270109.json', mimeType: 'application/json', buffer: Buffer.from(bundle('가짜 가', 'stu', [
      e('a1', '2027-01-06', 'Alpha Robotics (지어낸 회사)', '14731@LVCC_N', '로봇 팔이 컵을 집어 옮긴다', '코드를 몰라도 가르칠 수 있다면 배워 볼 만하다', ['stu', 'job'])])) },
  ];
  const JUNK = { name: 'notes.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":"world"}') };

  const audit = (what, W) => page.evaluate(([label, w]) => {
    const view = document.querySelector('#view');
    const tabs = document.querySelector('.tabs').getBoundingClientRect();
    const visible = (n) => { const r = n.getBoundingClientRect(); const s = getComputedStyle(n); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
    const small = [...view.querySelectorAll('button, a.btn, a.pick, a.seg')].filter((n) => visible(n) && !n.closest('.coll-pick .file-hidden')).filter((n) => { const r = n.getBoundingClientRect(); return r.height < 43.5 || r.width < 43.5; }).map((n) => `${n.className}:${Math.round(n.getBoundingClientRect().width)}x${Math.round(n.getBoundingClientRect().height)}`);
    const tiny = [...view.querySelectorAll('*')].filter((n) => visible(n) && n.childNodes.length && [...n.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim()) && parseFloat(getComputedStyle(n).fontSize) < 12.5).length;
    window.scrollTo(0, document.documentElement.scrollHeight);
    const last = [...view.querySelectorAll('.page > *')].filter(visible).map((n) => n.getBoundingClientRect().bottom).sort((a, b) => b - a)[0] || 0;
    return { label, side: document.documentElement.scrollWidth > w, small, tiny, hidden: Math.round(last - tabs.top) };
  }, [what, W]);

  // 처음부터: 이 화면을 열기 전에는 diary.wasm을 받지 않는다 (첫 화면 2초를 지킨다).
  const requested = [];
  page.on('request', (r) => { const u = r.url(); if (/diary\.wasm|diarycore|views\/collect/.test(u)) requested.push(u.replace(URL, '')); });
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto(URL);
  await page.evaluate(async () => { for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister(); for (const k of await caches.keys()) await caches.delete(k); localStorage.clear(); sessionStorage.clear(); });
  await page.evaluate(() => { localStorage.setItem('ces2027.theme.v1', JSON.stringify('light')); localStorage.setItem('ces2027.profile.v1', JSON.stringify({ nick: '시험', tag: 'stu', line: '', github: '', discord: '' })); localStorage.setItem('ces2027.paper.v1', JSON.stringify({ has: true, asked: '2026-11-22', remindOn: '2027-01-01' })); });
  requested.length = 0;
  await page.goto('about:blank');
  await page.goto(`${URL}#/map`);
  await page.locator('#view').waitFor();
  await settle(1200);
  check(!requested.some((u) => /diary\.wasm|collect/.test(u)), `지도(첫 화면)에서는 모은 일기 코드와 diary.wasm을 받지 않는다 (${requested.join(' ') || '받은 것 없음'})`);

  // 1. 설정에서 "모은 일기 열기" 줄을 눌러 들어간다
  await page.goto(`${URL}#/settings`);
  await page.locator('.setlist').waitFor();
  await settle();
  const row = page.locator('.setrow', { hasText: '모은 일기 열기' });
  check((await row.count()) === 1 && (await row.locator('a.pick').textContent()).trim() === '열기', '설정의 내보내기 묶음에 "모은 일기 열기" 줄이 있다');
  check((await page.locator('.setrow').allTextContents()).findIndex((t) => t.includes('내보내기')) + 1 === (await page.locator('.setrow').allTextContents()).findIndex((t) => t.includes('모은 일기 열기')), '"모은 일기 열기"가 "내보내기" 바로 아래에 있다');
  await shot('130-collect-settings.png');
  await row.locator('a.pick').click();
  await page.locator('.collectpage').waitFor();
  await settle();
  check((await page.locator('h1').textContent()) === '모은 일기' && (await page.locator('.back').isVisible()) && (await page.locator('.tabs a[data-tab="settings"]').getAttribute('aria-current')) === 'page', '"모은 일기" 화면이 설정 탭 아래에서 열리고 "뒤로"가 있다');
  check(requested.some((u) => /views\/collect/.test(u)) && !requested.some((u) => /diary\.wasm/.test(u)), '화면 코드는 이때 받고, diary.wasm은 파일을 고를 때 받는다');
  check((await page.locator('#view .btn:visible').count()) === 1 && (await page.locator('#view .btn:visible').textContent()) === '파일 고르기', '처음에는 검정 단추가 "파일 고르기" 하나다');
  await shot('131-collect-empty.png');

  // 저장소 스냅샷: 고르기 전
  const snap = () => page.evaluate(async () => ({ ls: JSON.stringify(Object.entries(localStorage).sort()), ss: JSON.stringify(Object.entries(sessionStorage).sort()), caches: JSON.stringify(await Promise.all((await caches.keys()).map(async (k) => [k, (await (await caches.open(k)).keys()).length]))), idb: JSON.stringify(await indexedDB.databases?.() ?? []) }));
  const before = await snap();

  // 2. 파일 넷(일기 파일 셋 + 일기 파일이 아닌 것 하나)을 한 번에 고른다
  await page.locator('.file-hidden').setInputFiles([...FILES, JUNK]);
  await page.locator('.coll-summary:not([hidden])').waitFor();
  await settle();
  check(requested.some((u) => /diary\.wasm/.test(u)), 'diary.wasm은 파일을 고른 뒤에 받았다');
  const summary = await page.locator('.coll-summary').textContent();
  check(/^일기 4개 · 쓴 사람 2명 · 회사 3곳 · 2027-01-06 ~ 2027-01-08$/.test(summary), `같은 일기는 한 번만 센다: 일기 파일 3개의 5개 일기 → "${summary}"`);
  const status = await page.locator('.collectpage [role=status]').first().textContent();
  check(/파일 3개를 읽었다/.test(status) && /1개는 건너뛰었다/.test(status) && /폰에는 남기지 않는다/.test(status), `읽은 수와 건너뛴 수와 "남기지 않는다"가 한 줄에 있다 (${status})`);
  check((await page.locator('.coll-skipped li').textContent()).includes('notes.json: 건너뛴다') && (await page.locator('.coll-skipped li').textContent()).includes('일기를 내보낸 파일이 아니다'), '일기 파일이 아닌 파일은 이름과 까닭을 말하고 건너뛴다');
  const chipTexts = await page.locator('.collectpage .segs .seg').allTextContents();
  check(chipTexts.join('|') === '학생 1|취준생 2|정년 1|장년 1|미정 1', `칸 칩에 일기 수가 있다 (${chipTexts.join(' | ')})`);
  check((await page.locator('.seg[aria-pressed="true"]').textContent()) === '학생 1', '일기가 있는 첫 칸(학생)이 먼저 보인다');
  check((await page.locator('.coll-co h3').allTextContents()).join() === 'Alpha Robotics (지어낸 회사)', '학생 칸에는 Alpha 한 곳이 있다');
  await shot('132-collect-student.png');
  await page.locator('.seg', { hasText: '취준생' }).click();
  const jobCo = await page.locator('.coll-co').allTextContents();
  check(jobCo.length === 1 && jobCo[0].includes('Alpha Robotics') && jobCo[0].includes('부스 14731') && jobCo[0].includes('일기 2개') && jobCo[0].includes('(가짜 가, 2027-01-06)') && jobCo[0].includes('(가짜 나, 2027-01-06)'), '취준생 칸: 대소문자가 다른 같은 회사는 한 칸으로 묶이고 쓴 사람과 날짜가 붙는다');
  await shot('133-collect-job.png');
  await page.locator('.seg', { hasText: '미정' }).click();
  check((await page.locator('.coll-body h2').textContent()).startsWith('누구에게인지 고르지 않은 것') && (await page.locator('.coll-co').textContent()).includes('태그를 고르지 않았다'), '"미정" 칸에는 누구에게인지 고르지 않은 일기가 있다');
  check((await page.locator('#view .btn:visible').allTextContents()).join() === '한장.md 내려받기' && (await page.locator('.pick', { hasText: '다시 고르기' }).count()) === 1, '고른 뒤 검정 단추는 "한장.md 내려받기" 하나이고 "다시 고르기"는 글자 단추다');

  // 3. 내려받기: 한장.md
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('.btn', { hasText: '한장.md 내려받기' }).click()]);
  check(dl.suggestedFilename() === '한장.md', `내려받는 파일 이름은 한장.md (${dl.suggestedFilename()})`);
  const md = await (async () => { const s = await dl.createReadStream(); const chunks = []; for await (const c of s) chunks.push(c); return Buffer.concat(chunks).toString('utf8'); })();
  check(md.startsWith('# CES 2027 일기를 네 태그로 나눈 한 장 (초안)\n') && md.includes('- 일기 4개 · 쓴 사람 2명 · 회사 3곳 · 2027-01-06 ~ 2027-01-08') && ['## 학생 (일기 1개 · 회사 1곳)', '## 취준생 (일기 2개 · 회사 1곳)', '## 정년 (일기 1개 · 회사 1곳)', '## 장년 (일기 1개 · 회사 1곳)', '## 누구에게인지 고르지 않은 것 (일기 1개 · 회사 1곳)'].every((h) => md.includes(h)), '내려받은 한 장의 머리 · 일기 수 · 네 태그 칸 · 미정 칸이 맞다');
  check(!/notes\.json|hello/.test(md), '건너뛴 파일의 내용은 한 장에 없다');

  // 4. 폰에 남지 않는다
  const after = await snap();
  check(before.ls === after.ls && before.ss === after.ss && before.caches === after.caches && before.idb === after.idb, '고른 파일과 한 장은 폰 저장소(localStorage · sessionStorage · 캐시 · IndexedDB)에 아무것도 쓰지 않았다');
  check(!(await page.evaluate(() => JSON.stringify(Object.entries(localStorage)).includes('가짜'))), '폰 저장소 어디에도 가짜 별명이 없다');
  // 다시 고르면 처음 고른 것은 지워지고 새로 고른 것만 남는다
  await page.locator('.file-hidden').setInputFiles([FILES[1]]);
  await settle(300);
  check(/^일기 2개 · 쓴 사람 1명/.test(await page.locator('.coll-summary').textContent()), '다시 고르면 앞에 고른 파일은 빠지고 새로 고른 것만 센다');
  await page.locator('.file-hidden').setInputFiles([JUNK]);
  await settle(300);
  check((await page.locator('.coll-summary').isHidden()) && (await page.locator('.coll-co').count()) === 0 && /일기 파일을 읽지 못했다/.test(await page.locator('.collectpage [role=status]').first().textContent()), '일기 파일이 하나도 없으면 한 장을 보이지 않고 어떤 파일을 고를지 알려 준다');
  await shot('134-collect-none.png');

  // 5. 360 · 390px × 글자 크기 네 단계
  const results = [];
  for (const W of [360, 390]) {
    for (let n = 1; n <= 4; n++) {
      await page.setViewportSize({ width: W, height: 740 });
      await page.evaluate((s) => localStorage.setItem('ces2027.text.v1', JSON.stringify(s)), n);
      await page.goto('about:blank');
      await page.goto(`${URL}#/collect`);
      await page.locator('.collectpage').waitFor();
      await settle(400);
      await page.locator('.file-hidden').setInputFiles([...FILES, JUNK]);
      await page.locator('.coll-summary:not([hidden])').waitFor();
      await settle(300);
      const r = await audit(`${W}px · 글자 ${n}단계`, W);
      results.push(r);
      check(!r.side && r.small.length === 0 && r.tiny === 0 && r.hidden <= 0, `${r.label}: 가로 넘침 없음 · 누르는 곳 44px 이상 · 12px 글자 없음 · 아래 탭에 안 가림 (${JSON.stringify(r)})`);
      if (W === 360 && (n === 1 || n === 4)) await shot(`135-collect-text${n}.png`);
    }
  }
  await page.evaluate(() => localStorage.setItem('ces2027.text.v1', JSON.stringify(1)));

  // 6. 비행기 모드: 앱을 담아 둔 뒤 인터넷을 끄고 열어도 된다
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('about:blank');
  await page.goto(`${URL}#/settings`);
  // 서비스 워커가 담기를 끝낼 때까지(담는 파일이 백 개가 넘는다) 기다린다.
  await page.waitForFunction(async () => { const r = await navigator.serviceWorker.getRegistration(); const c = (await caches.keys()).find((k) => k.startsWith('ces2027-')); return !!r?.active && !!c && (await (await caches.open(c)).keys()).length > 100; }, null, { timeout: 60000 });
  await settle(1500);
  const cached = await page.evaluate(async () => { const c = (await caches.keys()).find((k) => k.startsWith('ces2027-')); const keys = (await (await caches.open(c)).keys()).map((r) => new URL(r.url).pathname.split('/').pop()); return ['diary.wasm', 'diarycore.js', 'collect.js'].filter((f) => keys.includes(f)); });
  check(cached.length === 3, `담아 둔 목록에 diary.wasm · diarycore.js · collect.js가 있다 (${cached.join(' ')})`);
  await page.reload();
  await settle(800);
  await page.context().setOffline(true);
  await page.evaluate(() => { location.hash = '#/collect'; });
  await page.locator('.collectpage').waitFor({ timeout: 10000 });
  await page.locator('.file-hidden').setInputFiles(FILES);
  await page.locator('.coll-summary:not([hidden])').waitFor({ timeout: 10000 });
  check(/^일기 4개 · 쓴 사람 2명/.test(await page.locator('.coll-summary').textContent()) && !(await page.locator('.collectpage [role=status]').first().textContent()).includes('받지 못했다'), '인터넷을 끈 채로(비행기 모드) 파일을 고르면 한 장이 나온다');
  await shot('136-collect-offline.png');
  await page.context().setOffline(false);

  return `됨: R46 모은 일기 열기 (${results.length}가지 크기 · 글자 단계 + 기능)`;
}
