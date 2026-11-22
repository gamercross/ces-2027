// Playwright CLI test for 전시사 목록(#/list): 공식 앱의 전시사 A–Z 목록 + 거르기를 우리 앱에. 360 · 390px 폰 크기, 밝게.
// Run with: playwright-cli open about:blank
//           playwright-cli run-code "$(cat scripts/browser-list.mjs)"
// The app must be served from a stamped dist at http://127.0.0.1:47571/ (자료가 있는 지은 것).
async (page) => {
  const URL = 'http://127.0.0.1:47571/';
  const SHOTS = 'docs/screens/';
  const checks = [];
  const check = (ok, what) => { checks.push({ ok, what }); if (!ok) throw new Error(`안 됨: ${what}`); };
  await page.addInitScript(() => { localStorage.setItem('ces2027.theme.v1', JSON.stringify('light')); localStorage.setItem('ces2027.profile.v1', JSON.stringify({ nick: '시험', tag: 'stu', line: '', github: '', discord: '' })); });
  const rows = () => page.locator('.exlist .ex-row');
  const countText = () => page.locator('.list-count').innerText();
  const noOverflow = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  const smallTaps = () => page.evaluate(() => [...document.querySelectorAll('.list-page button, .list-page .ex-open, .list-filters .chip-go')].filter((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && !b.disabled && (r.height < 44 || r.width < 44); }).map((b) => b.textContent.trim()).slice(0, 5));

  for (const w of [360, 390]) {
    await page.setViewportSize({ width: w, height: 740 });
    await page.goto('about:blank');
    await page.goto(`${URL}#/map`);
    if (w === 360) await page.evaluate(async () => { for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister(); for (const k of await caches.keys()) await caches.delete(k); localStorage.removeItem('ces2027.interests.v1'); });
    await page.locator('.chips .chip-list').waitFor({ timeout: 15000 });
    const firstChip = await page.evaluate(() => document.querySelector('.mapx-top .chips').firstElementChild?.textContent.trim());
    check(firstChip === '목록', `${w}px 지도: 칩 줄 맨 앞에 "목록"이 있다`);
    if (w === 360) { await page.waitForTimeout(800); await page.screenshot({ path: `${SHOTS}174-map-chip-list-360.png` }); }

    // 1. 목록을 열면: 제목 · 몇 곳 · 받은 날짜, 지도 탭 아래, 뒤로
    const t0 = Date.now();
    await page.locator('.chips .chip-list').click();
    await rows().first().waitFor({ timeout: 15000 });
    const ms = Date.now() - t0;
    const head = await page.locator('.list-top .note').first().innerText();
    const tab = await page.evaluate(() => document.querySelector('.tabs a[aria-current="page"]')?.dataset.tab);
    const backShown = await page.evaluate(() => !document.getElementById('back').hidden);
    check((await page.evaluate(() => location.hash)) === '#/list' && /공식 전시사 목록/.test(head) && /\d{4}\.\d+\.\d+ 받음/.test(head) && tab === 'map' && backShown, `${w}px 목록: "${head}", 지도 탭 아래, 뒤로가 있다 (연 뒤 첫 줄까지 ${ms}ms)`);
    const first = await rows().count();
    check(first <= 60 && first >= 40, `${w}px 처음에는 줄을 조금만 그린다 (${first}줄, 3,751곳을 한 번에 그리지 않는다)`);
    check(await noOverflow(), `${w}px 옆으로 밀리지 않는다`);
    const small = await smallTaps();
    check(small.length === 0, `${w}px 누르는 곳은 모두 44px 이상 (작은 것: ${small.join(', ') || '없음'})`);
    if (w === 360) { await page.waitForTimeout(400); await page.screenshot({ path: `${SHOTS}170-list-360.png` }); }
    if (w === 390) { await page.waitForTimeout(400); await page.screenshot({ path: `${SHOTS}173-list-390.png` }); }

    // 2. 내리면 더 붙는다
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForFunction((n) => document.querySelectorAll('.exlist .ex-row').length > n, first, { timeout: 5000 });
    check(true, `${w}px 아래로 내리면 다음 줄을 붙인다`);

    // 3. 글자로 바로 가기: S
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.locator('.list-jump button', { hasText: /^S$/ }).click();
    await page.waitForTimeout(300);
    const top = await page.evaluate(() => { const strip = document.querySelector('.list-jump').getBoundingClientRect().bottom; const r = [...document.querySelectorAll('.exlist .ex-row')].find((x) => x.getBoundingClientRect().top >= strip - 2); return r?.querySelector('.name').textContent; });
    const stickTop = await page.evaluate(() => Math.round(document.querySelector('.list-jump').getBoundingClientRect().top));
    check(/^s/i.test(top || '') && stickTop <= 2, `${w}px "S"를 누르면 S로 시작하는 이름으로 가고(${top}), 글자 줄은 위에 붙어 있다`);

    // 4. 거르기: 혁신상 → 176곳
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.locator('.list-filters button', { hasText: '혁신상' }).click();
    const c1 = await countText();
    const tagsOk = await page.evaluate(() => [...document.querySelectorAll('.exlist .ex-row')].every((r) => /혁신상/.test(r.textContent)));
    check(/^176곳 \/ 3,751/.test(c1) && c1.includes('풀기') && tagsOk, `${w}px 혁신상을 누르면 혁신상 회사만 남는다 (${c1.split('\n')[0]})`);

    // 5. 위치 고르기 → 노스, 부스 번호순 → 바로 가기가 위치로
    await page.locator('.list-filters button', { hasText: '위치' }).click();
    await page.locator('.list-pick').waitFor();
    const pickOk = await page.evaluate(() => { const p = document.querySelector('.list-pick'); const r = p.getBoundingClientRect(); return r.right <= window.innerWidth && [...p.querySelectorAll('.chip-go')].length >= 11; });
    check(pickOk, `${w}px 위치 고르기 창이 열리고 위치가 11곳 넘게 있다`);
    if (w === 360) await page.screenshot({ path: `${SHOTS}172-list-picker-360.png` });
    await page.locator('.list-pick .chip-go', { hasText: /^노스/ }).click();
    await page.locator('.list-sort button', { hasText: '부스순' }).click();
    await page.waitForTimeout(200);
    const north = await page.evaluate(() => [...document.querySelectorAll('.exlist .ex-row .where')].filter((_, i) => i % 1 === 0).map((x) => x.textContent).filter((t) => t.includes('부스')));
    const chipNow = await page.locator('.list-filters button', { hasText: '위치' }).innerText();
    const nums = north.map((t) => Number((/부스 (\d+)/.exec(t) || [])[1])).filter(Number.isFinite);
    check(chipNow.includes('노스') && north.every((t) => t.startsWith('노스')) && nums.every((n, i) => i === 0 || nums[i - 1] <= n), `${w}px 위치 "노스" + 부스 번호순: 노스 홀 부스만 번호 차례로 (${(await countText()).split('\n')[0]})`);
    if (w === 360) { await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: `${SHOTS}171-list-filter-360.png` }); }
    await page.locator('.list-count button', { hasText: '풀기' }).click();
    await page.locator('.list-sort button', { hasText: '이름순' }).click();
    check(/^3,751곳$/.test((await countText()).trim()), `${w}px "거르기 풀기"로 다시 3,751곳`);

    // 6. 찾기: 영어 · 한글
    await page.locator('.list-top input[type="search"]').fill('samsung');
    await page.waitForTimeout(250);
    const sam = await page.evaluate(() => [...document.querySelectorAll('.exlist .ex-row .name')].map((x) => x.textContent));
    check(sam.length > 0 && sam.every((n) => /samsung/i.test(n)), `${w}px "samsung"으로 거르면 그 이름만 (${sam.length}곳)`);
    await page.locator('.list-top input[type="search"]').fill('삼성');
    await page.waitForFunction(() => [...document.querySelectorAll('.exlist .ex-row .name')].some((x) => /samsung/i.test(x.textContent)), null, { timeout: 15000 });
    check(true, `${w}px 한글 "삼성"도 찾는다 (한글 별칭 색인)`);
    await page.locator('.list-top input[type="search"]').fill('');
    await page.waitForTimeout(250);

    // 7. 관심 담기 → 폰에 남고 동선에 나온다
    const like = rows().first().locator('.ex-like');
    await like.click();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('ces2027.interests.v1') || '[]').length);
    check((await like.getAttribute('aria-pressed')) === 'true' && saved === 1, `${w}px 줄의 "관심"을 누르면 담기고 폰에 남는다`);
    await like.click();

    // 8. 줄을 누르면 지도에서 카드, 뒤로면 목록이 그대로
    await page.locator('.list-filters button', { hasText: '한국' }).click();
    await page.evaluate(() => window.scrollTo(0, 400));
    const y0 = await page.evaluate(() => window.scrollY);
    const target = rows().nth(4);
    const name = await target.locator('.name').innerText();
    await target.locator('.ex-open').click();
    await page.locator('.sheet .card h2').waitFor({ timeout: 15000 });
    const cardName = await page.locator('.sheet .card h2').innerText();
    check(cardName === name, `${w}px 줄을 누르면 지도에서 그 회사 카드가 열린다 (${name})`);
    await page.goBack();
    await rows().first().waitFor({ timeout: 15000 });
    await page.waitForTimeout(300);
    const back = await page.evaluate(() => ({ y: window.scrollY, chip: document.querySelector('.list-filters button[aria-pressed="true"]')?.textContent }));
    check(back.chip === '한국' && Math.abs(back.y - y0) < 80, `${w}px 뒤로 오면 고른 거르기(한국)와 보던 자리가 남는다 (${back.y} / ${y0})`);
    await page.locator('.list-count button', { hasText: '풀기' }).click();
  }

  // 9. 가장 큰 글자(150%)에서도 넘치지 않는다
  await page.setViewportSize({ width: 360, height: 740 });
  await page.evaluate(() => localStorage.setItem('ces2027.text.v1', JSON.stringify(4)));
  await page.goto('about:blank');
  await page.goto(`${URL}#/list`);
  await rows().first().waitFor({ timeout: 15000 });
  const clipped = await page.evaluate(() => [...document.querySelectorAll('.list-page .chip-go, .list-page .btn, .list-page .pick')].filter((b) => b.getBoundingClientRect().width > 0 && b.scrollWidth > b.clientWidth + 1 && !b.closest('.list-filters')).map((b) => b.textContent.trim()).slice(0, 5));
  check((await noOverflow()) && clipped.length === 0, `가장 큰 글자에서도 옆으로 밀리지 않고 단추 글자가 잘리지 않는다 (잘린 것: ${clipped.join(', ') || '없음'})`);
  await page.evaluate(() => localStorage.removeItem('ces2027.text.v1'));
  return checks.map((c) => `됨 | ${c.what}`).join('\n');
}
