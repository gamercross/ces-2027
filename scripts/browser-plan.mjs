// Playwright CLI test for 다시 짓기 5단계: 동선. 360 x 740 폰 크기, 밝게.
// Run with: playwright-cli open about:blank
//           playwright-cli run-code "$(cat scripts/browser-plan.mjs)"
// The app must be served from a stamped dist at http://127.0.0.1:47571/ (자료가 있는 지은 것).
// SHOTS를 채우면(레포 바탕의 상대 경로) 동선 · 카드 · 그 날 지도 그림을 그 폴더에 남긴다.
async (page) => {
  const URL = 'http://127.0.0.1:47571/';
  const SHOTS = '';
  const checks = [];
  const check = (ok, what) => {
    checks.push({ ok, what });
    if (!ok) throw new Error(`안 됨: ${what}`);
  };
  const shot = async (name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}${name}` }); };
  const settle = (ms = 700) => page.waitForTimeout(ms);
  const noSideScroll = async (what) => { const W = page.viewportSize().width; check(await page.evaluate((w) => document.documentElement.scrollWidth <= w, W), `${what}: ${W}px 폭에서 옆으로 밀리지 않는다`); };

  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto(URL);
  await page.evaluate(async () => { for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister(); for (const k of await caches.keys()) await caches.delete(k); localStorage.clear(); sessionStorage.clear(); });
  // 관심 회사: 노스 3 · 센트럴 2(1/6), 베네시안 G 2(1/7)
  const seed = await page.evaluate(async () => {
    const d = await (await fetch('data/exhibitors.json')).json();
    const pick = (hall, n) => d.ex.filter((r) => r[7]?.some((b) => b.endsWith(`@${hall}`))).slice(0, n).map((r) => r[0]);
    return [...pick('LVCC_N', 3).map((id) => ({ id, day: 1 })), ...pick('LVCC_C', 2).map((id) => ({ id, day: 1 })), ...pick('VEN_G', 2).map((id) => ({ id, day: 2 }))];
  });
  await page.evaluate((s) => { localStorage.setItem('ces2027.theme.v1', JSON.stringify('light')); localStorage.setItem('ces2027.profile.v1', JSON.stringify({ nick: '시험', tag: 'stu', line: '', github: '', discord: '' })); localStorage.setItem('ces2027.interests.v1', JSON.stringify(s)); localStorage.setItem('ces2027.paper.v1', JSON.stringify({ has: true, asked: '2026-11-22', remindOn: '2027-01-01' })); }, seed);
  await page.goto('about:blank');
  await page.goto(`${URL}#/plan`);
  await page.locator('.stops .stop').first().waitFor();
  await settle();

  // 1. 날짜 칩 + 그 날 차례
  const chips = await page.locator('.segs[aria-label="날짜"] .seg').evaluateAll((ns) => ns.map((n) => `${n.querySelector('.dc-day').textContent} ${n.querySelector('.dc-n').textContent}`));
  check(chips.length === 2 && chips[0] === '1/6 5곳' && chips[1] === '1/7 2곳', `날짜 칩: 날마다 몇 곳인지 보인다(${chips.join(' / ')}), 합은 관심 회사 수 ${seed.length}`);
  check(await page.locator('.segs[aria-label="날짜"]').evaluate((n) => getComputedStyle(n).position === 'sticky'), '날짜 칩은 위에 붙어 있다');
  check((await page.locator('.dock').count()) === 0, '아래 도크가 없다(탭 위를 가리지 않는다)');
  const second = await page.locator('.stops .stop').nth(1).evaluate((n) => Math.round(n.getBoundingClientRect().bottom));
  check(second < 740 - 68, `첫 화면(스크롤 전)에 날짜 칩 · 지금 갈 곳 · 줄 둘이 다 보인다(둘째 줄 아래 ${second}px, 탭 위 ${740 - 68}px)`);
  check((await page.locator('.band').count()) <= 1, '알림 띠는 한 줄 띠다');
  check((await page.locator('.stops .stop').count()) === 5, '첫 날 5곳만 보인다(다른 날은 칩을 눌러야 보인다)');
  const nums = await page.locator('.stops .stop .no').allTextContents();
  check(nums.join(',') === '1,2,3,4,5', `번호는 그 날 차례(${nums.join(',')})`);
  const rowH = await page.locator('.stops .stop').evaluateAll((ns) => ns.map((n) => Math.round(n.getBoundingClientRect().height)));
  check(rowH.every((h) => h >= 64 && h <= 130), `줄 높이 64 ~ 130px(${rowH.join(',')}) — 한 줄에 단추가 여럿 붙지 않는다`);
  const small = await page.locator('.stops .stop button, .stops .stop a').evaluateAll((ns) => ns.filter((n) => { const r = n.getBoundingClientRect(); return r.height < 43.5 || r.width < 43.5; }).length);
  check(small === 0, '줄의 누르는 곳은 모두 44px 이상');
  const pageH = await page.evaluate(() => document.body.scrollHeight);
  check(pageH < 2200, `동선 한 장의 길이 ${pageH}px(이전 3,143px)`);
  await noSideScroll('동선');
  await shot('100-plan-day.png');

  // 2. 줄을 누르면 큰 카드
  await page.locator('.stops .stop .stop-open').nth(1).click();
  await page.locator('.pcard').waitFor();
  await settle(300);
  const name = (await page.locator('.pcard-name').textContent()).trim();
  check(name.length > 1 && (await page.locator('.pcard-where').textContent()).includes('부스'), `카드에 이름(${name})과 홀 · 부스가 크게 보인다`);
  const nameSize = await page.locator('.pcard-name').evaluate((n) => parseFloat(getComputedStyle(n).fontSize));
  check(nameSize >= 24, `카드의 이름은 ${nameSize}px`);
  check(await page.locator('.pcard a[href^="#/map/at/"]').count() === 1 && await page.locator('.pcard a[href^="#/map/go/"]').count() === 1, '카드에 "지도에서 보기" · "길 안내"가 있다');
  const sub = (await page.locator('.pcard-sub').textContent());
  check(/2번째/.test(sub), `카드가 차례를 안다(${sub.trim()})`);
  await noSideScroll('카드');
  await shot('101-plan-card.png');
  // 아래로 → 차례가 3번째로, 줄도 바뀐다
  await page.locator('.pcard button', { hasText: '아래로' }).click();
  await settle(300);
  check(/3번째/.test(await page.locator('.pcard-sub').textContent()), '아래로: 카드가 3번째로 바뀐다');
  const order = await page.locator('.stops .stop .name').allTextContents();
  check(order[2] === name, '아래로: 뒤의 줄도 그 회사가 3번째다');
  // 날짜 1/7로 → 첫 날 줄에서 사라지고 보는 날이 따라간다
  await page.locator('.pcard .segs .seg').nth(1).click();
  await settle(300);
  check(/1\/7/.test(await page.locator('.pcard-sub').textContent()), '날짜를 바꾸면 카드가 1/7로 바뀐다');
  await page.getByRole('button', { name: '닫기', exact: true }).click();
  await settle(300);
  check((await page.locator('.pcard-back').isHidden()) && !(await page.evaluate(() => document.body.classList.contains('pcard-open'))), '닫기: 카드가 닫히고 화면이 다시 밀린다');
  check((await page.locator('.stops .stop').count()) === 3, '보는 날이 1/7로 따라가 3곳이 보인다');

  // 2-2. 카드에서 빼면 되돌리기가 나온다
  const before = await page.locator('.stops .stop').count();
  await page.locator('.stops .stop .stop-open').first().click();
  await page.locator('.pcard button', { hasText: '관심에서 빼기' }).click();
  await settle(300);
  check((await page.locator('.stops .stop').count()) === before - 1 && (await page.locator('.undo:not([hidden])').count()) === 1, '빼기: 줄이 줄고 "되돌리기" 한 줄이 나온다');
  await page.locator('.undo .pick').click();
  await settle(300);
  check((await page.locator('.stops .stop').count()) === before && (await page.locator('.undo[hidden]').count()) === 1, '되돌리기: 줄이 돌아온다');

  // 2-3. 차례 정리 카드
  await page.getByRole('button', { name: '차례 정리', exact: true }).click();
  await page.locator('.pcard').waitFor();
  const toolBtns = await page.locator('.pcard').evaluate((n) => ['날짜 채우기', '걷는 차례로', '링크', '코드', '글', '마크다운', 'CSV', '넣기'].filter((x) => [...n.querySelectorAll('button')].some((b) => b.textContent.trim() === x)));
  check(toolBtns.length === 8, `차례 정리 카드에 날짜 채우기 · 걷는 차례로 · 나누기 · 받은 목록이 있다(${toolBtns.join(' ')})`);
  await noSideScroll('차례 정리');
  await shot('103-plan-tools.png');
  await page.locator('.pcard button', { hasText: '걷는 차례로' }).click();
  await settle(300);
  check((await page.locator('.pcard-back').isHidden()) && /걷는 차례로 세웠다/.test(await page.locator('.planpage > p[role="status"]').textContent()), '걷는 차례로: 카드가 닫히고 결과 한 줄이 보인다');

  // 3. 봤다는 줄에서 한 번에
  await page.locator('.stops .stop .seen-btn').first().click();
  await settle(300);
  check((await page.locator('.stops .stop.seen').count()) === 1, '줄의 "봤다"로 한 번에 표시된다');

  // 4. 그 날 지도: 번호가 같다(앞에서 한 곳을 1/7로 옮겼으니 1/6은 4곳)
  await page.locator('.segs[aria-label="날짜"] .seg').first().click();
  await settle(300);
  const planNames = await page.locator('.stops .stop .name').allTextContents();
  await page.getByRole('link', { name: '이 날 지도에서 보기' }).click();
  await page.locator('svg.map').waitFor();
  await page.locator('.daybar:not([hidden])').waitFor();
  await settle(1800);
  const pinNums = await page.locator('g[data-pin] text').allTextContents();
  const mapDay1 = await page.evaluate(() => [...document.querySelectorAll('g[data-pin]')].filter((g) => g.querySelector('circle').getAttribute('opacity') !== '0.25').map((g) => g.querySelector('text').textContent));
  check(mapDay1.join(',') === '1,2,3,4' && pinNums.length === 7, `지도에서 그 날 번호(${mapDay1.join(',')})가 동선과 같다, 다른 날은 흐리다(${pinNums.length - mapDay1.length}개)`);
  const bar = (await page.locator('.daybar-text').textContent()).trim();
  check(/1\/6/.test(bar) && /4곳/.test(bar), `지도 위에 "${bar}"`);
  check(planNames.length === 4, '동선 줄 수와 같다');
  await noSideScroll('그 날 지도');
  await shot('102-map-day.png');

  console.log(JSON.stringify(checks.map((c) => `${c.ok ? '됨' : '안 됨'} | ${c.what}`), null, 1));
  return `${checks.length}개 통과`;
}
