// Playwright CLI test for R63: 목표 숫자 — 설정에서 "대화 몇 명 · 링크드인 몇 명"을 정하면 일기 탭 맨 위에 지금 / 목표 한 줄. 390 x 844 폰 크기, 밝게.
// Run with: playwright-cli open about:blank
//           playwright-cli run-code "$(cat scripts/browser-goal.mjs)"
// The app must be served from a stamped dist at http://127.0.0.1:47571/ (자료가 있는 지은 것).
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
  const noSideScroll = async (what) => { const W = page.viewportSize().width; check(await page.evaluate((w) => document.documentElement.scrollWidth <= w, W), `${what}: ${W}px 폭에서 옆으로 밀리지 않는다`); };
  const goalNow = () => page.evaluate(() => JSON.parse(localStorage.getItem('ces2027.goal.v1') || 'null'));
  const person = (id, nick, followed) => ({ id, nick, links: [], met: '2027-01-06', metAt: Date.parse('2027-01-06T09:00:00'), company: '', exId: '', booth: '', note: '', followed });
  const seed = (n, f) => page.evaluate(([list]) => localStorage.setItem('ces2027.people.v1', JSON.stringify(list)), [Array.from({ length: n }, (_, i) => person(`p${i}`, `사람${i + 1}`, i < f ? '2027-01-06' : ''))]);
  const diaryTop = async () => {
    await page.goto('about:blank');
    await page.goto(`${URL}#/diary`);
    await page.locator('.met').waitFor();
    await settle(300);
    return page.evaluate(() => {
      const g = document.querySelector('.goal a');
      const first = document.querySelector('.listpage > section:not(.head)');
      return g ? { text: g.querySelector('.goal-nums').textContent, hits: [...g.querySelectorAll('.goal-hit')].map((x) => x.textContent), href: g.getAttribute('href'), label: g.getAttribute('aria-label'), first: first?.classList.contains('goal') } : null;
    });
  };

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
  await seed(3, 1);

  // 목표가 없으면 일기 탭 맨 위에 줄이 없다
  check((await diaryTop()) === null, '목표가 없으면 일기 탭 맨 위에 목표 줄이 없다');
  await shot('2-후-일기-목표없음-390.png');

  // 설정의 "목표" 줄
  await page.goto(`${URL}#/settings`);
  await page.locator('.setlist').waitFor();
  await settle();
  const row = page.locator('.setrow', { has: page.locator('b', { hasText: /^목표$/ }) });
  check((await row.locator('.setrow-state').textContent()) === '정하지 않았다', '설정에 "목표" 줄이 있고 처음에는 "정하지 않았다"');
  await shot('1-후-설정-목표줄-390.png');
  await row.getByRole('button', { name: '정하기' }).click();
  await page.locator('.pcard input[name=goal-talk]').waitFor();
  const talk = page.locator('.pcard input[name=goal-talk]');
  const li = page.locator('.pcard input[name=goal-linkedin]');
  check((await talk.getAttribute('inputmode')) === 'numeric' && (await li.getAttribute('inputmode')) === 'numeric' && (await talk.getAttribute('maxlength')) === '2', '칸 둘은 숫자 자판 · 두 자리까지');
  check((await page.locator('.pcard .field .label').allTextContents()).join(',') === '대화 (만난 사람),링크드인 (팔로우함)', '칸마다 보이는 이름: 대화 (만난 사람) · 링크드인 (팔로우함)');
  // 틀린 값: 저장하지 않고 칸 아래에 알린다
  await talk.fill('1a');
  await page.getByRole('button', { name: '저장', exact: true }).click();
  check((await page.locator('.pcard .field-error:not([hidden])').count()) === 1 && (await goalNow()) === null, '숫자가 아니면 그 칸 아래에 한 줄로 알리고 저장하지 않는다');
  await talk.fill('10');
  check((await page.locator('.pcard .field-error:not([hidden])').count()) === 0, '고쳐 적으면 알림이 사라진다');
  await li.fill('5');
  await shot('1-후-설정-목표정하기-390.png');
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await settle(300);
  const g1 = await goalNow();
  check(g1?.talk === 10 && g1?.linkedin === 5 && (await row.locator('.setrow-state').textContent()) === '대화 10명 · 링크드인 5명', `저장하면 이 폰에 남고 줄에 보인다(${JSON.stringify(g1)})`);

  // 일기 탭 맨 위: 대화 3 / 10 · 링크드인 1 / 5
  let top = await diaryTop();
  check(top && top.text === '대화 3 / 10 · 링크드인 1 / 5' && top.hits.length === 0 && top.first, `일기 탭 맨 위에 한 줄: "${top?.text}"`);
  check(top.href === '#/people' && /목표: 대화 3명, 목표 10명/.test(top.label), '줄은 만난 사람 목록으로 가고, 읽어 주는 이름이 뜻을 말한다');
  await shot('3-후-일기-목표있음-390.png');
  // 목표에 닿으면 숫자만 강조색
  await seed(11, 5);
  top = await diaryTop();
  const hitColor = await page.evaluate(() => { const h = document.querySelector('.goal-hit'); const n = document.querySelector('.goal-nums'); return { hit: getComputedStyle(h).color, base: getComputedStyle(n).color, accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() }; });
  check(top.text === '대화 11 / 10 · 링크드인 5 / 5' && top.hits.join(',') === '11,5' && hitColor.hit !== hitColor.base && /목표에 닿음/.test(top.label), `목표에 닿거나 넘은 숫자만 강조색(${hitColor.hit}), 글은 그대로: "${top.text}"`);
  check(!(await page.locator('.goal').textContent()).match(/축하|달성|🎉/), '축하 글 · 그림은 없다');
  await shot('4-후-일기-목표넘음-390.png');
  await page.locator('.goal a').click();
  await page.waitForFunction(() => location.hash === '#/people');
  check(true, '줄을 누르면 만난 사람 목록');

  // 하나만 정하면 그것만
  await page.evaluate(() => localStorage.setItem('ces2027.goal.v1', JSON.stringify({ talk: null, linkedin: 3 })));
  top = await diaryTop();
  check(top.text === '링크드인 5 / 3', `목표를 하나만 정하면 그것만: "${top.text}"`);
  // 비우면 목표 없음
  await page.goto(`${URL}#/settings`);
  await page.locator('.setlist').waitFor();
  await row.getByRole('button', { name: '정하기' }).click();
  await page.locator('.pcard input[name=goal-linkedin]').fill('');
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await settle(300);
  check((await row.locator('.setrow-state').textContent()) === '정하지 않았다' && (await diaryTop()) === null, '칸을 비우고 저장하면 목표가 없어지고 줄도 사라진다');
  // 홈 한눈에 보기 "만난 사람" 줄은 그대로
  await page.evaluate(() => localStorage.setItem('ces2027.goal.v1', JSON.stringify({ talk: 10, linkedin: 5 })));
  await page.goto('about:blank');
  await page.goto(`${URL}#/home`);
  await page.locator('.glance').waitFor();
  const homeRow = await page.locator('.glance a[href="#/people"] span').textContent();
  check(homeRow === '11명', `홈 한눈에 보기의 만난 사람 줄은 그대로: "${homeRow}"`);
  // 지우기 · 내보내기
  const left = await page.evaluate(async () => { const { clearMine } = await import('./store.js'); clearMine(); return localStorage.getItem('ces2027.goal.v1'); });
  check(left === null, '"이 폰의 내 자료 지우기"가 부르는 지우기 뒤에는 목표가 남지 않는다');
  const sent = await page.evaluate(async () => { localStorage.setItem('ces2027.goal.v1', JSON.stringify({ talk: 10, linkedin: 5 })); const { bundle } = await import('./diary.js'); return JSON.stringify(bundle([{ id: 'd1', date: '2027-01-06', company: 'A', saw: 'x' }], { nick: '시험', tag: 'stu' }, new Date(), [])); });
  check(!/goal|linkedin|talk"?:\s*10/.test(sent), '일기 내보내기 묶음에는 목표가 없다');

  // 360px · 글자 네 단계 · 밝게 · 어둡게
  for (const theme of ['light', 'dark']) for (const text of [1, 2, 3, 4]) {
    if (theme === 'dark' && text < 4) continue;
    await page.setViewportSize({ width: 360, height: 740 });
    await page.evaluate(([th, t]) => {
      localStorage.setItem('ces2027.theme.v1', JSON.stringify(th));
      localStorage.setItem('ces2027.text.v1', JSON.stringify(t));
      localStorage.setItem('ces2027.profile.v1', JSON.stringify({ nick: '시험', tag: 'stu', line: '', github: '', discord: '' }));
      localStorage.setItem('ces2027.goal.v1', JSON.stringify({ talk: 10, linkedin: 5 }));
    }, [theme, text]);
    await seed(11, 1);
    top = await diaryTop();
    const tap = await page.evaluate(() => document.querySelector('.goal a').getBoundingClientRect().height);
    check(top && tap >= 44, `360px · 글자 ${text}단계 · ${theme}: 목표 줄이 보이고 44px 이상(${Math.round(tap)}px)`);
    await noSideScroll(`360px · 글자 ${text}단계 · ${theme} 일기`);
    if (text === 4) await shot(theme === 'light' ? '5-후-360-가장큰글자-일기.png' : '7-후-360-가장큰글자-일기-어둡게.png');
    await page.goto(`${URL}#/settings`);
    await page.locator('.setlist').waitFor();
    await row.getByRole('button', { name: '정하기' }).click();
    await page.locator('.pcard input[name=goal-talk]').waitFor();
    await settle(300);
    const small = await page.evaluate(() => [...document.querySelectorAll('.pcard :is(input, button)')].map((x) => x.getBoundingClientRect()).filter((r) => r.height < 44).length);
    check(small === 0, `360px · 글자 ${text}단계 · ${theme}: 목표 정하기의 칸 · 단추가 44px 이상`);
    await noSideScroll(`360px · 글자 ${text}단계 · ${theme} 목표 정하기`);
    if (text === 4 && theme === 'light') await shot('6-후-360-가장큰글자-목표정하기.png');
    await page.getByRole('button', { name: '닫기', exact: true }).first().click();
  }
  return checks.map((c) => `됨 | ${c.what}`).join('\n');
}
