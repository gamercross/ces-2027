// Playwright CLI test for 세션 찾기 · 거르기 칩(공식 앱 검색의 세션 칸 · 일정의 "거르기 · 주요" 칩). 360 · 390px, 밝게.
// Run with: playwright-cli open about:blank
//           playwright-cli run-code "$(cat scripts/browser-sessions.mjs)"
// The app must be served from a stamped dist at http://127.0.0.1:47571/ (자료가 있는 지은 것).
async (page) => {
  const URL = 'http://127.0.0.1:47571/';
  const SHOTS = 'docs/screens/';
  const checks = [];
  const check = (ok, what) => { checks.push({ ok, what }); if (!ok) throw new Error(`안 됨: ${what}`); };
  await page.addInitScript(() => { localStorage.setItem('ces2027.theme.v1', JSON.stringify('light')); localStorage.setItem('ces2027.profile.v1', JSON.stringify({ nick: '시험', tag: 'stu', line: '', github: '', discord: '' })); });
  const noOverflow = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  const titles = () => page.evaluate(() => [...document.querySelectorAll('.entry.session .title')].map((x) => x.textContent));
  const countText = () => page.locator('section.panel > h2').first().innerText();

  for (const w of [360, 390]) {
    await page.setViewportSize({ width: w, height: 740 });
    await page.goto('about:blank');
    await page.goto(`${URL}#/map`);
    if (w === 360) await page.evaluate(async () => { for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister(); for (const k of await caches.keys()) await caches.delete(k); localStorage.removeItem('ces2027.events.v1'); });
    // 1. 지도 찾기 칸: 영어 낱말이면 회사 줄 뒤에 세션 줄 둘까지
    const input = page.locator('.find-field input');
    await input.waitFor({ timeout: 15000 });
    await input.fill('robot');
    await page.waitForFunction(() => [...document.querySelectorAll('.results .result span')].some((x) => x.textContent.startsWith('강연 ·')), null, { timeout: 15000 });
    const res = await page.evaluate(() => [...document.querySelectorAll('.results .result')].map((r) => ({ t: r.querySelector('b').textContent, s: r.querySelector('span').textContent })));
    const ses = res.filter((r) => r.s.startsWith('강연 ·'));
    const firstSes = res.findIndex((r) => r.s.startsWith('강연 ·'));
    const visible = await page.evaluate(() => { const box = document.querySelector('.results').getBoundingClientRect(); return [...document.querySelectorAll('.results .result')].filter((r) => r.querySelector('span').textContent.startsWith('강연 ·')).every((r) => r.getBoundingClientRect().bottom <= box.bottom + 1); });
    check(ses.length === 2 && firstSes === 2 && visible && ses.every((r) => /^강연 · \d+\/\d+ \d\d:\d\d · /.test(r.s)), `${w}px 지도 찾기 "robot": 회사 두 줄 뒤에 세션 줄 둘, 내리지 않아도 보인다 (${ses.map((r) => r.t).join(' / ')})`);
    if (w === 360) await page.screenshot({ path: `${SHOTS}180-find-sessions-360.png` });
    await input.fill('로봇');
    await page.waitForTimeout(700);
    const koSes = await page.evaluate(() => [...document.querySelectorAll('.results .result span')].filter((x) => x.textContent.startsWith('강연 ·')).length);
    check(koSes === 0, `${w}px 한글 낱말에는 세션 줄을 붙이지 않는다(세션 자료가 영어다)`);
    await input.fill('robot');
    await page.waitForFunction(() => [...document.querySelectorAll('.results .result span')].some((x) => x.textContent.startsWith('강연 ·')), null, { timeout: 15000 });
    const pickTitle = ses[0].t;
    await page.locator('.results .result', { hasText: pickTitle }).first().click();
    await page.waitForFunction(() => location.hash.startsWith('#/sessions/q/'), null, { timeout: 10000 });
    await page.locator('.entry.session').first().waitFor({ timeout: 15000 });
    const found = await titles();
    const tab = await page.evaluate(() => document.querySelector('.tabs a[aria-current="page"]')?.dataset.tab);
    check(found.includes(pickTitle) && /^찾은 강연 \d+개/.test(await countText()) && (await page.locator('input[aria-label="강연 찾기"]').inputValue()) === pickTitle && tab === 'plan', `${w}px 세션 줄을 누르면 세션 일정이 그 제목으로 찾은 채 열린다 (${await countText()})`);

    // 2. 거르기 칩: 기조연설 · 생중계 · 내 일정 · 분야
    await page.goto('about:blank');
    await page.goto(`${URL}#/sessions`);
    await page.locator('.entry.session').first().waitFor({ timeout: 15000 });
    const chipNames = await page.evaluate(() => [...document.querySelectorAll('.chips[aria-label="강연 거르기"] .chip-go')].map((b) => b.textContent));
    check(chipNames.join(' ') === '기조연설 생중계 내 일정 분야 ▾', `${w}px 날짜 칩 아래에 거르기 칩 넷 (${chipNames.join(' · ')})`);
    const dayCount0 = await page.evaluate(() => [...document.querySelectorAll('.daychip .dc-n')].map((x) => x.textContent).join(' '));
    await page.locator('.chips .chip-go', { hasText: '생중계' }).click();
    const liveRows = await page.evaluate(() => [...document.querySelectorAll('.entry.session')].map((r) => r.textContent.includes('생중계')));
    const dayCount1 = await page.evaluate(() => [...document.querySelectorAll('.daychip .dc-n')].map((x) => x.textContent).join(' '));
    check(liveRows.length > 0 && liveRows.every(Boolean) && dayCount1 !== dayCount0 && (await countText()).includes('(거름)'), `${w}px "생중계"를 켜면 생중계 세션만 남고 날짜 칩의 개수도 준다 (${dayCount0} → ${dayCount1})`);
    await page.locator('.chips .chip-go', { hasText: '생중계' }).click();
    await page.locator('.chips .chip-go', { hasText: '분야' }).click();
    await page.locator('.list-pick').waitFor();
    const picks = await page.evaluate(() => [...document.querySelectorAll('.list-pick .chip-go')].map((b) => b.textContent));
    check(picks[0] === '모든 분야' && picks.some((t) => t.startsWith('모빌리티')) && picks.at(-1).startsWith('그 밖'), `${w}px "분야 ▾"를 누르면 분야 묶음이 세션 수와 같이 나온다 (${picks.length - 1}개)`);
    if (w === 360) await page.screenshot({ path: `${SHOTS}181-sessions-topic-picker-360.png` });
    await page.locator('.list-pick .chip-go', { hasText: /^모빌리티/ }).click();
    const chipNow = await page.locator('.chips .chip-go', { hasText: '분야' }).innerText();
    const mob = await page.evaluate(() => [...document.querySelectorAll('.entry.session')].length);
    check(chipNow === '분야: 모빌리티' && (await page.locator('.list-pick').isHidden()), `${w}px 모빌리티를 고르면 칩이 "분야: 모빌리티"가 되고 창이 닫힌다 (이 날 ${mob}줄)`);
    if (w === 360) { await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: `${SHOTS}182-sessions-chips-360.png` }); }
    await page.locator('.chips .chip-go', { hasText: '분야' }).click();
    await page.locator('.list-pick .chip-go', { hasText: '모든 분야' }).click();
    await page.locator('.chips .chip-go', { hasText: '내 일정' }).click();
    const empty = await page.locator('.stack .note').first().innerText();
    check(empty.includes('거르기 칩을 끄거나'), `${w}px 내 일정이 비었을 때 "내 일정"을 켜면 거르기를 끄라고 한 줄로 말한다`);
    await page.locator('.chips .chip-go', { hasText: '내 일정' }).click();
    await page.locator('.chips .chip-go', { hasText: '기조연설' }).click();
    const keyRows = await page.evaluate(() => [...document.querySelectorAll('.entry.session')].map((r) => r.textContent.includes('기조연설')));
    check(keyRows.every(Boolean), `${w}px "기조연설"을 켜면 기조연설만 (${keyRows.length}줄)`);
    check(await noOverflow(), `${w}px 옆으로 밀리지 않는다`);
    const small = await page.evaluate(() => [...document.querySelectorAll('.chips[aria-label="강연 거르기"] .chip-go')].filter((b) => { const r = b.getBoundingClientRect(); return r.height < 44 || r.width < 44; }).length);
    check(small === 0, `${w}px 거르기 칩은 누르는 곳 44px 이상`);
  }

  // 3. 가장 큰 글자에서도 넘치지 않는다
  await page.setViewportSize({ width: 360, height: 740 });
  await page.evaluate(() => localStorage.setItem('ces2027.text.v1', JSON.stringify(4)));
  await page.goto('about:blank');
  await page.goto(`${URL}#/sessions`);
  await page.locator('.entry.session').first().waitFor({ timeout: 15000 });
  check(await noOverflow(), '가장 큰 글자에서도 세션 화면이 옆으로 밀리지 않는다');
  await page.evaluate(() => localStorage.removeItem('ces2027.text.v1'));
  return checks.map((c) => `됨 | ${c.what}`).join('\n');
}
