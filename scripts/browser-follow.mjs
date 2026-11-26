// Playwright CLI test for R62: 링크드인 이틀 — 만난 사람 카드의 "링크드인 팔로우함" + 이틀이 지나면 탭 위 띠. 390 x 844 폰 크기, 밝게.
// Run with: playwright-cli open about:blank
//           playwright-cli run-code "$(cat scripts/browser-follow.mjs)"
// The app must be served from a stamped dist at http://127.0.0.1:47571/ (자료가 있는 지은 것).
// 시계를 돌린다(page.clock): 1월 6일 아침에 명함을 받고 → 1월 7일(아직 이틀 전) → 1월 8일 아침(48시간 지남) → 1월 9일.
// 띠는 한 번에 하나: 새 판 띠 · 보내지 않은 일기 띠가 있을 때 링크드인 띠가 겹쳐 뜨지 않는지도 본다.
// SHOTS를 채우면(끝에 / 붙인 폴더) 그 폴더에 그림을 남긴다.
async (page) => {
  const URL = 'http://127.0.0.1:47571/';
  const SHOTS = '';
  const checks = [];
  const check = (ok, what) => {
    checks.push({ ok, what });
    if (!ok) throw new Error(`안 됨: ${what}`);
  };
  const shot = async (name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}${name}` }); };
  const settle = (ms = 500) => page.waitForTimeout(ms);
  const people = () => page.evaluate(() => JSON.parse(localStorage.getItem('ces2027.people.v1') || '[]'));
  const noSideScroll = async (what) => { const W = page.viewportSize().width; check(await page.evaluate((w) => document.documentElement.scrollWidth <= w, W), `${what}: ${W}px 폭에서 옆으로 밀리지 않는다`); };
  const bands = () => page.evaluate(() => ({
    notice: !document.getElementById('notice').hidden,
    update: !document.getElementById('update').hidden,
    text: document.getElementById('notice-text').textContent,
    close: !document.getElementById('notice-close').hidden,
  }));
  // 시계를 그 때로 놓고 앱을 다시 연다(앱을 열 때 센다).
  const openAt = async (iso, hash = '#/home') => {
    await page.clock.setFixedTime(new Date(iso));
    await page.goto('about:blank');
    await page.goto(`${URL}${hash}`);
    await settle(900);
  };
  const DAY1 = '2027-01-06T09:00:00';

  await page.clock.install({ time: new Date(DAY1) });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(URL);
  await page.evaluate(async () => {
    for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
    for (const k of await caches.keys()) await caches.delete(k);
    localStorage.clear(); sessionStorage.clear();
    localStorage.setItem('ces2027.theme.v1', JSON.stringify('light'));
    localStorage.setItem('ces2027.profile.v1', JSON.stringify({ nick: '시험', tag: 'stu', line: '', linkedin: '', github: '', discord: '' }));
    localStorage.setItem('ces2027.paper.v1', JSON.stringify({ has: true, asked: '2026-11-22', remindOn: '2027-01-01' }));
  });

  // 1월 6일 9시: 두 사람을 받는다(링크드인 하나 · 깃허브 하나)
  await openAt(DAY1, '#/people/new');
  const receive = async (addr, nick) => {
    if (!(await page.locator('.paste input[name=addr]').isVisible())) await page.getByRole('button', { name: '주소 붙여넣기', exact: true }).click();
    await page.locator('.paste input[name=addr]').fill(addr);
    await page.locator('.paste button[type=submit]').click();
    await page.locator('.pcard input[name=nick]').waitFor();
    await page.locator('.pcard input[name=nick]').fill(nick);
    await page.getByRole('button', { name: '저장', exact: true }).click();
    await page.locator('.pcard-name', { hasText: nick }).waitFor();
  };
  await receive('https://www.linkedin.com/in/booth-lee', '이부스');
  check(await page.locator('.pcard .follow-row').isVisible(), '만난 사람 카드에 "링크드인 팔로우함" 한 줄이 있다');
  check((await page.locator('.pcard .follow-row a', { hasText: '링크드인 열기' }).getAttribute('href')) === 'https://www.linkedin.com/in/booth-lee', '링크드인 주소가 있으면 옆에 "링크드인 열기"');
  check(!(await page.locator('.pcard input[name=followed]').isChecked()), '처음에는 꺼져 있다');
  await page.locator('.pcard button', { hasText: '닫기' }).first().click();
  await receive('github.com/robot-arm-kim', '김로봇');
  check((await page.locator('.pcard .follow-row').isVisible()) && !(await page.locator('.pcard .follow-row a').count()), '링크드인 주소가 없어도 표시는 할 수 있다(열기 단추는 없다)');
  await page.locator('.pcard button', { hasText: '닫기' }).first().click();
  const got = await people();
  check(got.length === 2 && got.every((p) => p.metAt === new Date(DAY1).getTime() && p.followed === ''), '받은 순간(metAt)이 남고 팔로우함은 비어 있다');

  // 1월 7일 저녁(34시간): 아직 띠가 없다
  await openAt('2027-01-07T19:00:00');
  check(!(await bands()).notice, '이틀(48시간)이 안 지났으면 띠가 없다');

  // 1월 8일 10시(49시간): 띠가 뜬다
  await openAt('2027-01-08T10:00:00');
  let b = await bands();
  check(b.notice && b.text === '링크드인 팔로우 안 한 사람 2명' && b.close && !b.update, `이틀이 지나면 홈에 띠 하나: "${b.text}" + 보기 · 닫기`);
  check((await page.locator('#notice-go').getAttribute('class')) === 'pick', '띠의 "보기"는 톤 단추(검정 단추는 홈의 할 일 하나)');
  await shot('3-후-띠가-뜬-홈-390.png');
  // 보기 → 모인 목록
  await page.locator('#notice-go').click();
  await page.waitForFunction(() => location.hash === '#/people/follow');
  await page.locator('.stops .stop').first().waitFor();
  check((await page.locator('.stops .stop').count()) === 2 && (await page.locator('h2').first().textContent()).includes('2명'), '"보기"를 누르면 그 사람들만 모인 목록');
  check((await bands()).notice === false, '만난 사람 화면에서는 띠가 안 보인다');
  await shot('4-후-모인-목록-390.png');
  // 카드에서 켠다 → 목록에서 빠진다
  await page.locator('.stop-open', { hasText: '이부스' }).click();
  await page.locator('.pcard .follow-row').waitFor();
  await page.locator('.pcard .follow-toggle').click();
  await settle(300);
  check((await page.locator('.pcard .follow-toggle').textContent()).includes('링크드인 팔로우함 · 01/08') && (await page.locator('.pcard input[name=followed]').isChecked()), '누르면 켜지고 켠 날이 보인다');
  check((await people()).find((p) => p.nick === '이부스').followed === '2027-01-08', '켠 날이 폰에 남는다');
  await shot('2-후-만난사람-카드-390.png');
  await page.locator('.pcard button', { hasText: '닫기' }).first().click();
  check((await page.locator('.stops .stop').count()) === 1, '켠 사람은 모인 목록에서 빠진다');
  // 끄기 → 다시 비운다
  await page.locator('.stop-open', { hasText: '김로봇' }).click();
  await page.locator('.pcard .follow-toggle').click();
  await settle(200);
  await page.locator('.pcard .follow-toggle').click();
  await settle(200);
  check(!(await page.locator('.pcard input[name=followed]').isChecked()) && (await people()).find((p) => p.nick === '김로봇').followed === '', '다시 누르면 꺼진다');
  await page.locator('.pcard button', { hasText: '닫기' }).first().click();

  // 홈으로: 남은 1명. 닫으면 그날은 안 뜬다
  await openAt('2027-01-08T11:00:00');
  b = await bands();
  check(b.notice && b.text === '링크드인 팔로우 안 한 사람 1명', `켠 사람은 띠에서도 빠진다: "${b.text}"`);
  await page.locator('#notice-close').click();
  await settle(300);
  check(!(await bands()).notice, '"닫기"를 누르면 띠가 닫힌다');
  await openAt('2027-01-08T20:00:00');
  check(!(await bands()).notice, '닫은 날에는 다시 열어도 안 뜬다');
  // 다음 날, 새로 이틀이 지난 사람이 없으면 안 뜬다
  await openAt('2027-01-09T09:00:00');
  check(!(await bands()).notice, '다음 날이어도 새로 이틀이 지난 사람이 없으면 안 뜬다(같은 사람으로 조르지 않는다)');
  // 1월 7일 15시에 만난 사람이 1월 9일 15시에 이틀을 넘긴다. 닫은 날(1/8)이 지났으니 1월 9일 16시에 다시 뜬다
  await page.evaluate(() => {
    const list = JSON.parse(localStorage.getItem('ces2027.people.v1'));
    list.push({ id: 'p-late', nick: '박센서', links: [], met: '2027-01-07', metAt: new Date('2027-01-07T15:00:00').getTime(), company: '', exId: '', booth: '', note: '', followed: '' });
    localStorage.setItem('ces2027.people.v1', JSON.stringify(list));
  });
  await openAt('2027-01-09T16:00:00');
  b = await bands();
  check(b.notice && b.text === '링크드인 팔로우 안 한 사람 2명', `닫은 날 뒤 새로 이틀이 지난 사람이 생기면 다시 뜬다: "${b.text}"`);

  // 띠는 한 번에 하나: 보내지 않은 일기(전시 날 저녁)가 있으면 그 띠가 먼저다
  await page.evaluate(() => localStorage.setItem('ces2027.diary.v1', JSON.stringify([{ id: 'd1', at: '2027-01-09', exId: '', company: '가짜', saw: '본 것', felt: '', tags: [], sent: false }])));
  await openAt('2027-01-09T19:30:00-08:00'); // 라스베이거스 저녁(전시가 끝난 뒤)
  b = await bands();
  check(b.notice && b.text.startsWith('보내지 않은 일기') && !b.close, `보내지 않은 일기 띠가 있으면 그것 하나만(링크드인 띠는 뒤): "${b.text}"`);
  // 새 판 띠가 있으면 아래 띠는 숨는다
  await page.evaluate(async () => { const { offline } = await import('./offline.js'); offline.band = true; window.dispatchEvent(new Event('ces-offline')); });
  b = await bands();
  check(b.update && !b.notice, '새 판 띠가 있으면 그것 하나만 보인다');
  await page.evaluate(() => localStorage.removeItem('ces2027.diary.v1'));

  // 지우기 · 내보내기: 이 폰의 내 자료 지우기에 같이 지워진다
  const left = await page.evaluate(async () => { const { clearMine } = await import('./store.js'); clearMine(); return Object.keys(localStorage).filter((k) => /people|followBand/.test(k)).length; });
  check(left === 0, '"이 폰의 내 자료 지우기"가 부르는 지우기 뒤에는 만난 사람 · 띠 닫은 기록이 남지 않는다');

  // 360px · 글자 네 단계: 띠와 카드
  for (const text of [1, 2, 3, 4]) {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.evaluate((t) => {
      localStorage.setItem('ces2027.theme.v1', JSON.stringify('light'));
      localStorage.setItem('ces2027.text.v1', JSON.stringify(t));
      localStorage.setItem('ces2027.profile.v1', JSON.stringify({ nick: '시험', tag: 'stu', line: '', github: '', discord: '' }));
      localStorage.setItem('ces2027.people.v1', JSON.stringify([{ id: 'p1', nick: '이부스', links: [{ kind: 'linkedin', url: 'https://www.linkedin.com/in/booth-lee', label: 'linkedin.com/in/booth-lee', key: 'linkedin:booth-lee' }], met: '2027-01-06', metAt: new Date('2027-01-06T09:00:00').getTime(), company: '', exId: '', booth: '', note: '자율주행 센서', followed: '' }]));
    }, text);
    await openAt('2027-01-08T10:00:00');
    const small = await page.evaluate(() => [...document.querySelectorAll('#notice:not([hidden]) button:not([hidden])')].map((x) => x.getBoundingClientRect()).filter((r) => r.height < 44 || r.width < 44).length);
    check((await bands()).notice && small === 0, `360px · 글자 ${text}단계: 띠가 뜨고 단추는 44px 이상`);
    const covered = await page.evaluate(() => { scrollTo(0, document.documentElement.scrollHeight); const last = [...document.querySelectorAll('#view > *')].filter((x) => x.getBoundingClientRect().height > 0).pop(); return last.getBoundingClientRect().bottom - document.getElementById('notice').getBoundingClientRect().top; });
    check(covered <= 0, `360px · 글자 ${text}단계: 끝까지 내리면 홈의 마지막 칸이 띠에 가리지 않는다(${Math.round(covered)}px)`);
    await page.evaluate(() => scrollTo(0, 0));
    await noSideScroll(`360px · 글자 ${text}단계 홈`);
    if (text === 4) await shot('5-후-360-가장큰글자-띠.png');
    await page.evaluate(() => { location.hash = '#/people'; });
    await page.locator('.stop-open').first().click();
    await page.locator('.pcard .follow-row').waitFor();
    const tiny = await page.evaluate(() => [...document.querySelectorAll('.pcard .follow-row :is(label, a)')].map((x) => x.getBoundingClientRect()).filter((r) => r.height < 44).length);
    check(tiny === 0, `360px · 글자 ${text}단계: 팔로우함 · 링크드인 열기가 44px 이상`);
    await noSideScroll(`360px · 글자 ${text}단계 카드`);
    if (text === 4) await shot('6-후-360-가장큰글자-카드.png');
  }
  return checks.map((c) => `됨 | ${c.what}`).join('\n');
}
