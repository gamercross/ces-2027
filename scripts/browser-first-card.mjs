// Playwright CLI test for 처음 들어오면 명함 만들기 (다시 짓기 3단계). 360 x 740 폰 크기, 밝게.
// Run with: playwright-cli open about:blank
//           playwright-cli run-code "$(cat scripts/browser-first-card.mjs)"
// The app must be served from a stamped dist at http://127.0.0.1:47551/.
// SHOTS를 채우면(레포 바탕의 상대 경로) 처음 · 명함 · QR · 설정 그림을 그 폴더에 남긴다.
async (page) => {
  const URL = 'http://127.0.0.1:47551/';
  const SHOTS = 'docs/screens/';
  const checks = [];
  const check = (ok, what) => {
    checks.push({ ok, what });
    if (!ok) throw new Error(`안 됨: ${what}`);
  };
  const noSideScroll = async (what) => check(await page.evaluate(() => document.documentElement.scrollWidth <= 360), `${what}: 360px 폭에서 옆으로 밀리지 않는다`);
  const shot = async (name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}${name}` }); };
  await page.setViewportSize({ width: 360, height: 740 });
  await page.addInitScript(() => { localStorage.setItem('ces2027.theme.v1', JSON.stringify('light')); });
  await page.goto(URL);
  // 처음 여는 폰처럼: 서비스 워커 · 담아 둔 것 · 명함을 지운다.
  await page.evaluate(async () => {
    for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
    for (const k of await caches.keys()) await caches.delete(k);
    localStorage.removeItem('ces2027.profile.v1');
    sessionStorage.clear();
  });
  await page.goto('about:blank');
  await page.goto(URL);

  // 1. 처음: 환영 한 줄 + 명함 한 화면. 뒤로 · 지금 탭 표시는 없다.
  await page.getByRole('heading', { name: '명함부터 만든다' }).waitFor();
  check((await page.evaluate(() => location.hash)) === '#/card' && (await page.locator('.welcome').innerText()).includes('환영한다'), '처음 열면 환영 한 줄과 "명함부터 만든다" 화면이다');
  check(await page.locator('#back').isHidden() && (await page.locator('.tabs a[aria-current=page]').count()) === 0, '처음 명함 화면에는 "뒤로"도 지금 탭 표시도 없다');
  check((await page.getByLabel('별명').evaluate((n) => getComputedStyle(n).fontSize)) === '18px' && (await page.locator('.choice span').first().evaluate((n) => n.getBoundingClientRect().height)) >= 52, '큰 글씨(입력 18px)와 큰 고르기(52px 이상)다');
  await noSideScroll('처음 명함');
  await shot('80-first-open.png');

  // 2. 꼭 필요한 칸만 필수
  await page.getByRole('button', { name: '명함 만들기' }).click();
  check((await page.locator('.error').innerText()) === '별명을 적는다.', '별명을 비우면 "별명을 적는다."로 막힌다');
  await page.getByLabel('별명').fill('재엽');
  await page.getByRole('button', { name: '명함 만들기' }).click();
  check((await page.locator('.error').innerText()).startsWith('나를 하나 고른다'), '나를 안 고르면 막힌다');
  await page.getByRole('radio', { name: '학생' }).check({ force: true });
  await shot('81-first-filled.png');

  // 3. 한 줄 · 깃허브 · 디스코드는 건너뛰어도 만들어진다
  await page.getByRole('button', { name: '명함 만들기' }).click();
  await page.getByText('명함이 만들어졌다').waitFor();
  check((await page.locator('.qr svg').count()) === 0 && (await page.locator('.note').first().innerText()).includes('QR이 생긴다') && (await page.getByRole('link', { name: '지도로' }).count()) === 1, '선택 칸을 건너뛰면 QR 대신 안내가 나오고 "지도로" 단추가 있다');
  await noSideScroll('명함(QR 없음)');

  // 4. 고쳐서 QR 둘
  await page.getByRole('button', { name: '명함 고치기' }).click();
  await page.getByLabel('깃허브 (선택)').fill('octocat');
  await page.getByLabel('디스코드 (선택)').fill('jaeyeup');
  await page.getByRole('button', { name: '명함 고치기 끝' }).click();
  await page.locator('.qr svg').first().waitFor();
  check((await page.locator('.qr svg').count()) === 2, '깃허브 · 디스코드를 적으면 QR이 둘 보인다');
  await noSideScroll('명함(QR 둘)');
  await shot('82-card-qr.png');

  // 5. 지도로, 다시 들어오면 바로 지도
  await page.getByRole('link', { name: '지도로' }).click();
  await page.waitForTimeout(500);
  check((await page.evaluate(() => location.hash)) === '#/map', '"지도로"가 지도를 연다');
  await page.goto('about:blank');
  await page.goto(URL);
  await page.waitForTimeout(1200);
  check((await page.evaluate(() => location.hash)) === '#/map', '다시 들어오면 명함 없이 바로 지도다');

  // 6. 설정에서 QR 보기 · 고치기
  await page.goto('about:blank');
  await page.goto(`${URL}#/settings`);
  await page.getByRole('link', { name: 'QR 보기' }).waitFor();
  await noSideScroll('설정');
  await shot('83-settings-card.png');
  await page.getByRole('link', { name: '명함 고치기' }).click();
  await page.getByRole('heading', { name: '명함 고치기' }).waitFor();
  check((await page.getByLabel('별명').inputValue()) === '재엽', '설정의 "명함 고치기"는 적어 둔 별명으로 열린다');
  await page.goto('about:blank');
  await page.goto(`${URL}#/settings`);
  await page.getByRole('link', { name: 'QR 보기' }).click();
  await page.locator('.qr svg').first().waitFor();
  check((await page.locator('.tabs a[aria-current=page]').innerText()) === '설정', '설정의 "QR 보기"는 QR 둘이 있는 명함을 연다');

  // 7. 처음 화면에서 "나중에": 명함 없이 지도
  await page.evaluate(() => { localStorage.removeItem('ces2027.profile.v1'); sessionStorage.clear(); });
  await page.goto('about:blank');
  await page.goto(URL);
  await page.getByRole('button', { name: '나중에' }).click();
  await page.waitForTimeout(800);
  check((await page.evaluate(() => location.hash)) === '#/map', '"나중에"를 누르면 지도로 간다');
  return checks.map((c) => `됨 | ${c.what}`).join('\n');
}
