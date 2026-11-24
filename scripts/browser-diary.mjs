// Playwright CLI test for 다시 짓기 6단계: 일기 + 만난 사람. 360 x 740 폰 크기, 밝게.
// Run with: playwright-cli open about:blank
//           playwright-cli run-code "$(cat scripts/browser-diary.mjs)"
// The app must be served from a stamped dist at http://127.0.0.1:47571/ (자료가 있는 지은 것).
// SHOTS를 채우면(레포 바탕의 상대 경로) 일기 · 만난 사람 카드 · 명함 받기 · 일기 쓰기 · 빈 화면 그림을 그 폴더에 남긴다.
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
  const gh = (id) => ({ kind: 'github', url: `https://github.com/${id}`, label: `github.com/${id}`, key: `github:${id}` });

  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto(URL);
  await page.evaluate(async () => { for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister(); for (const k of await caches.keys()) await caches.delete(k); localStorage.clear(); sessionStorage.clear(); });
  // 비어 있을 때 먼저
  await page.evaluate(() => { localStorage.setItem('ces2027.theme.v1', JSON.stringify('light')); localStorage.setItem('ces2027.profile.v1', JSON.stringify({ nick: '시험', tag: 'stu', line: '', github: '', discord: '' })); localStorage.setItem('ces2027.paper.v1', JSON.stringify({ has: true, asked: '2026-11-22', remindOn: '2027-01-01' })); });
  await page.goto('about:blank');
  await page.goto(`${URL}#/diary`);
  await page.locator('.met').waitFor();
  await settle();
  check((await page.locator('.met h2').textContent()).includes('0명') && (await page.locator('.met .note').first().textContent()).includes('아직 없다'), '비었을 때: "만난 사람 0명"과 한 줄 안내가 있다');
  check((await page.getByText('일기 0개', { exact: false }).count()) === 1, '비었을 때: "일기 0개"와 시작 안내가 있다');
  await shot('110-diary-empty.png');

  // 만난 사람 넷 · 일기 셋을 넣는다
  await page.evaluate(async () => {
    const d = await (await fetch('data/exhibitors.json')).json();
    const r = d.ex.find((x) => x[7]?.[0]?.endsWith('@LVCC_N'));
    const g = (id) => ({ kind: 'github', url: `https://github.com/${id}`, label: `github.com/${id}`, key: `github:${id}` });
    localStorage.setItem('ces2027.people.v1', JSON.stringify([
      { id: 'p1', nick: '민수', links: [g('minsu')], met: '2027-01-06', company: r[1], exId: r[0], booth: r[7][0], note: '로봇 팔 이야기' },
      { id: 'p2', nick: '', links: [g('suah')], met: '2027-01-07', company: '', exId: '', booth: '', note: '' },
      { id: 'p3', nick: '재엽', links: [{ kind: 'discord', url: '', label: 'jy#1', key: 'discord:jy#1' }], met: '2027-01-06', company: '', exId: '', booth: '', note: '' },
      { id: 'p4', nick: '하나', links: [g('hana')], met: '2027-01-05', company: '', exId: '', booth: '', note: '' },
    ]));
    localStorage.setItem('ces2027.diary.v1', JSON.stringify([
      { id: 'e1', date: '2027-01-06', exId: r[0], company: r[1], booth: r[7][0], saw: '로봇 팔이 컵을 집는 시연을 봤다', felt: '', for: ['stu'], sent: null },
      { id: 'e2', date: '2027-01-06', exId: '', company: '', booth: '', saw: '이름 모를 부스의 센서', felt: '해 볼 것 하나', for: [], sent: null },
      { id: 'e3', date: '2027-01-07', exId: '', company: '삼성', booth: '', saw: '냉장고', felt: '', for: ['job'], sent: '2027-01-07T01:00:00Z' },
    ]));
  });
  await page.reload();
  await page.locator('.met .stops .stop').first().waitFor();
  await settle();

  // 1. 첫 묶음 = 만난 사람
  const heading = (await page.locator('.met h2').textContent()).trim();
  check(heading === '만난 사람 4명', `첫 묶음은 "${heading}"`);
  const names = await page.locator('.met .stops .stop .name').allTextContents();
  check(names.length === 3 && names.includes('하나') === false, `최근 세 명이 보인다(가장 오래된 한 명은 전체 목록에서)(${names.join(' · ')})`);
  check((await page.locator('.met a[href="#/people"]').textContent()).includes('전체 4명'), '"전체 4명"이 있다');
  check((await page.locator('.met a[href="#/people/new"]').count()) === 1, '"명함 받기"가 묶음 머리에 있다');
  check((await page.locator('.segs').count()) === 0, '맨 위 회색 단추 셋(듣기 · 대화 칸 · 만난 사람)이 없다');
  const metBottom = await page.locator('.met').evaluate((n) => Math.round(n.getBoundingClientRect().bottom));
  check(metBottom < 740 - 68, `첫 화면(스크롤 전)에 만난 사람 묶음이 다 보인다(묶음 아래 ${metBottom}px, 탭 위 ${740 - 68}px)`);
  check((await page.locator('.dock .btn').count()) === 1 && (await page.locator('.dock .btn').textContent()).trim() === '일기 쓰기', '검정 단추는 "일기 쓰기" 하나');
  const small = await page.locator('.stops .stop button, .stops .stop a, .met .pick').evaluateAll((ns) => ns.filter((n) => { const r = n.getBoundingClientRect(); return r.height < 43.5 || r.width < 43.5; }).length);
  check(small === 0, '줄과 묶음의 누르는 곳은 모두 44px 이상');
  await noSideScroll('일기');
  await shot('111-diary.png');

  // 2. 만난 사람 카드
  await page.locator('.met .stops .stop-open').first().click();
  await page.locator('.pcard').waitFor();
  await settle(300);
  const pn = (await page.locator('.pcard-name').textContent()).trim();
  check(pn.length > 0 && (await page.locator('.pcard .contact').count()) >= 1, `카드에 이름(${pn})과 연락처가 있다`);
  check((await page.locator('.pcard button', { hasText: '고치기' }).count()) === 1 && (await page.locator('.pcard button', { hasText: '지우기' }).count()) === 1, '카드에 고치기 · 지우기가 있다');
  await noSideScroll('만난 사람 카드');
  await shot('112-person-card.png');
  // 고치기 → 메모를 바꿔 저장
  await page.locator('.pcard button', { hasText: '고치기' }).click();
  await page.locator('.pcard input[name=nick]').fill('민수형');
  await page.locator('.pcard button', { hasText: '저장' }).click();
  await settle(300);
  check((await page.locator('.pcard-name').textContent()).trim() === '민수형', '고치기: 이름이 바뀐다');
  await page.getByRole('button', { name: '닫기', exact: true }).click();
  check((await page.locator('.met .stops .name').allTextContents()).includes('민수형'), '닫으면 목록에도 바뀐 이름이 보인다');

  // 3. 일기 줄 → 일기 카드
  const dayHeads = await page.locator('.listpage section.panel > h2').allTextContents();
  check(dayHeads.includes('2027-01-07') && dayHeads.includes('2027-01-06') && !dayHeads.some((t) => /개/.test(t)), `날짜 묶음 제목은 날짜 하나(${dayHeads.join(' / ')})`);
  await page.locator('.stops .stop-open', { hasText: '로봇 팔이 컵을' }).click();
  await page.locator('.pcard').waitFor();
  check((await page.locator('.pcard').textContent()).includes('로봇 팔이 컵을 집는 시연을 봤다'), '일기 줄을 누르면 본 것 전체가 카드에 보인다');
  await shot('113-entry-card.png');
  await page.getByRole('button', { name: '닫기', exact: true }).click();

  // 4. 보내기는 한 줄 띠
  const band = (await page.locator('.band h2').textContent()).trim();
  check(band === '보내지 않은 일기 2개', `보내기 띠: ${band}`);
  check((await page.locator('.band .pick').count()) === 2, '띠에 보내기 · 글로 복사 둘뿐이다');

  // 5. 명함 받기: 붙여넣으면 바로 저장되고 이름 적기 카드가 열린다. 같은 사람은 다시 만들지 않는다
  await page.locator('.met a[href="#/people/new"]').click();
  await page.getByRole('button', { name: '주소 붙여넣기', exact: true }).waitFor();
  check((await page.locator('h1').textContent()).trim() === '남의 명함 받기', '남의 명함 받기 화면');
  check((await page.locator('.panel h2').count()) === 0, '구획 제목(카메라 / 손으로 / 읽은 주소 / 이 사람)이 없다');
  await page.getByRole('button', { name: '주소 붙여넣기', exact: true }).click();
  await page.locator('.paste input[name=addr]').fill('https://github.com/newone');
  await page.locator('.paste button[type=submit]').click();
  await page.locator('.pcard').waitFor();
  check((await page.locator('.pcard h2').first().textContent()).includes('이름 적기'), '붙여넣자 바로 저장되고 "이름 적기" 카드가 열린다');
  const saved1 = await page.evaluate(() => JSON.parse(localStorage.getItem('ces2027.people.v1')).length);
  check(saved1 === 5, `이름을 적기 전에 이미 폰에 남았다(${saved1}명)`);
  await shot('114-people-new.png');
  await page.locator('.pcard button', { hasText: '나중에' }).click();
  await page.locator('.paste input[name=addr]').fill('github.com/newone');
  await page.locator('.paste button[type=submit]').click();
  await page.locator('.pcard').waitFor();
  const saved2 = await page.evaluate(() => JSON.parse(localStorage.getItem('ces2027.people.v1')).length);
  check(saved2 === 5 && (await page.locator('p[role=status]', { hasText: '이미 있다' }).count()) >= 1, '같은 사람을 다시 읽으면 새 줄 없이 "이미 있다"');
  await page.getByRole('button', { name: '닫기', exact: true }).click();
  await noSideScroll('명함 받기');

  // 6. 전체 목록(찾기 칸은 여섯 명부터)
  await page.goto(`${URL}#/people`);
  await page.locator('.stops .stop').first().waitFor();
  check((await page.locator('.stops .stop').count()) === 5 && (await page.locator('h2').first().textContent()).includes('5명'), '전체 목록 5명');
  await noSideScroll('만난 사람 전체');

  // 7. 일기 쓰기: 본 것 한 칸이면 저장된다
  await page.goto(`${URL}#/diary/new`);
  await page.locator('textarea[name=saw]').waitFor();
  await shot('115-diary-new.png');
  // 첫 화면은 "본 것" 칸 + "폰에 남기기"뿐이다. 나머지 칸은 "더 적기" 아래 접혀 있다 (2026-11-24, 편의성 점검 6절 3번. 예전에는 칸 아홉이 다 보이고 저장은 화면 밖 y 945 ~ 971이었다)
  // 보이는 것을 센다: 접힌 칸은 checkVisibility()가 거짓이다
  const formNow = () => page.evaluate(() => {
    const tabs = innerHeight - document.querySelector('.tabs').offsetHeight;
    const seen = (x) => x.checkVisibility() && x.getBoundingClientRect().width > 0;
    const f = document.querySelector('form.form');
    const save = [...f.querySelectorAll('button')].find((b) => b.textContent === '폰에 남기기').getBoundingClientRect();
    return { open: f.querySelector('details.more').open, who: f.querySelector('.diary-who').hidden ? '' : f.querySelector('.diary-who').textContent,
      taps: [...f.querySelectorAll('textarea, input:not(.file-hidden), select, button, a, summary')].filter(seen).map((x) => (x.matches('textarea, input, select') ? x.name : x.textContent.trim())),
      saveY: Math.round(save.top + save.height / 2 + scrollY), saveOn: save.top >= 0 && save.bottom <= tabs, saveW: Math.round(save.width), saveH: Math.round(save.height),
      small: [...f.querySelectorAll('textarea, input:not(.file-hidden), select, button, a, summary, label.choice')].filter((x) => seen(x) && x.getBoundingClientRect().height < 43.5).length,
      blacks: [...document.querySelectorAll('.btn:not(.ghost)')].filter(seen).length, side: document.documentElement.scrollWidth > innerWidth };
  });
  let f = await formNow();
  check(!f.open && f.taps.join(' · ') === 'saw · 더 적기 · 폰에 남기기 · 그만두기' && f.saveOn && f.blacks === 1 && f.small === 0 && f.who === '', `일기 쓰기 첫 화면: 본 것 · 더 적기 · 폰에 남기기 · 그만두기뿐이고(${f.taps.length}곳, 전 14곳), "폰에 남기기"(${f.saveW} × ${f.saveH}, 가운데 y ${f.saveY})가 굴리지 않고 보인다`);
  await shot('205-diary-short-360.png');
  await page.locator('details.more > summary').click();
  f = await formNow();
  check(f.open && ['company', 'other', 'date', 'felt', '사진 넣기', 'for', '듣기', '대화 붙여넣기'].every((t) => f.taps.includes(t)) && f.small === 0 && !f.side, `"더 적기"를 누르면 회사 · 날짜 · 느낀 점 · 사진 · 누구에게 · 대화가 펴진다(${f.taps.length}곳)`);
  await page.evaluate(() => window.scrollTo(0, 0));
  // 편 것은 한 화면보다 길다. 그림은 화면을 그 길이만큼 늘려 찍는다(탭이 가운데에 끼지 않게).
  if (SHOTS) { const h = await page.evaluate(() => document.documentElement.scrollHeight); await page.setViewportSize({ width: 360, height: h }); await settle(500); await page.screenshot({ path: `${SHOTS}206-diary-more-open-360.png` }); await page.setViewportSize({ width: 360, height: 740 }); await settle(300); }
  await page.locator('details.more > summary').click();
  check(!(await formNow()).open, '다시 누르면 접힌다');
  await page.locator('button[type=submit]').click();
  check((await page.locator('.error:not([hidden])').count()) === 1, '비우고 남기면 "본 것을 한 줄 적는다"로 막힌다');
  await page.locator('textarea[name=saw]').fill('테스트 한 줄');
  // 적던 글은 폰에 남는다
  await page.goto('about:blank');
  await page.goto(`${URL}#/diary/new`);
  await page.locator('textarea[name=saw]').waitFor();
  check((await page.locator('textarea[name=saw]').inputValue()) === '테스트 한 줄', '앱을 닫았다 열어도 적던 글이 돌아온다');
  check((await page.locator('a[href^="#/listen"]').count()) === 1 && (await page.locator('a[href^="#/talk"]').count()) === 1, '듣기 · 대화 붙여넣기는 일기 쓰기 안에 있다');
  await noSideScroll('일기 쓰기');
  await page.locator('button[type=submit]').click();
  await page.locator('.met').waitFor();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('ces2027.diary.v1')).find((e) => e.saw === '테스트 한 줄'));
  check(stored && stored.company === '' && stored.for.length === 1, `본 것 한 칸만으로 저장됐다(회사 미정, 태그 ${stored?.for.join(',')})`);
  check((await page.locator('.stops .stop .name', { hasText: '회사 미정' }).count()) >= 1, '목록에 "회사 미정"으로 보인다');

  // 8. 다녀옴에서 연 일기(#/diary/new/<회사>)도 같다: 접혀 있고, 어느 회사 일기인지 제목 아래 한 줄로 보인다. 누른 수 2(적고 → 폰에 남기기), 굴리기 0
  const co = await page.evaluate(async () => { const d = await (await fetch('data/exhibitors.json')).json(); const r = d.ex.find((x) => x[7]?.[0]?.endsWith('@LVCC_N')); return { id: r[0], name: r[1] }; });
  await page.goto('about:blank');
  await page.goto(`${URL}#/diary/new/${co.id}`);
  await page.locator('textarea[name=saw]').waitFor();
  f = await formNow();
  check(!f.open && f.who === co.name && f.taps.length === 4 && f.saveOn, `다녀옴에서 열면 접혀 있고 제목 아래에 회사 이름(${f.who})이 보인다. "폰에 남기기" 가운데 y ${f.saveY}`);
  await shot('205-diary-short-company-360.png');
  await page.locator('textarea[name=saw]').fill('다녀온 곳에서 한 줄');
  await page.locator('button[type=submit]').click();
  await page.locator('.met').waitFor();
  const fromVisit = await page.evaluate(() => JSON.parse(localStorage.getItem('ces2027.diary.v1')).find((e) => e.saw === '다녀온 곳에서 한 줄'));
  check(fromVisit && fromVisit.exId === co.id && fromVisit.company === co.name && /^\d{4}-\d\d-\d\d$/.test(fromVisit.date), '접힌 채 남겨도 회사 · 날짜가 같이 저장된다');

  // 9. 고칠 때: 적힌 칸(회사 · 느낀 점 · 누구에게 …)이 있으면 펴 두고, 본 것만 적힌 일기는 접어 둔다. 적다 만 느낀 점이 돌아올 때도 펴 둔다
  await page.goto('about:blank');
  await page.goto(`${URL}#/diary/edit/e2`);
  await page.locator('textarea[name=saw]').waitFor();
  f = await formNow();
  check(f.open && (await page.locator('textarea[name=felt]').inputValue()) === '해 볼 것 하나', '고치기: 느낀 점이 적힌 일기는 "더 적기"가 펴져 있다');
  await page.evaluate(() => { const l = JSON.parse(localStorage.getItem('ces2027.diary.v1')); l.push({ id: 'bare', date: '2027-01-08', exId: '', company: '', booth: '', saw: '본 것만 적은 일기', felt: '', for: [], sent: null }); localStorage.setItem('ces2027.diary.v1', JSON.stringify(l)); });
  await page.goto('about:blank');
  await page.goto(`${URL}#/diary/edit/bare`);
  await page.locator('textarea[name=saw]').waitFor();
  check(!(await formNow()).open, '고치기: 본 것만 적힌 일기는 접혀 있다');
  // 접힌 칸이 틀리면 펴고 알린다
  await page.evaluate(() => { document.querySelector('input[name=date]').value = ''; });
  await page.locator('button[type=submit]').click();
  check((await formNow()).open && (await page.locator('.error:not([hidden])').textContent()) === '날짜를 고른다.', '접힌 칸(날짜)이 비면 "더 적기"를 펴고 알린다');
  await page.evaluate(() => localStorage.setItem('ces2027.diaryDraft.v1', JSON.stringify({ exId: '', byName: '', saw: '적다 만 글', felt: '적다 만 느낀 점' })));
  await page.goto('about:blank');
  await page.goto(`${URL}#/diary/new`);
  await page.locator('textarea[name=saw]').waitFor();
  check((await formNow()).open && (await page.locator('textarea[name=felt]').inputValue()) === '적다 만 느낀 점', '적다 만 느낀 점이 돌아올 때는 펴 둔다(적힌 것이 숨지 않게)');
  await page.evaluate(() => localStorage.removeItem('ces2027.diaryDraft.v1'));

  // 10. 360 · 390px × 밝게 · 어둡게 × 글자 네 단계: 첫 화면에 "폰에 남기기"가 굴리지 않고 보이고, 옆으로 안 밀리고, 누르는 곳 44px 이상, 검정 단추 하나. 편 것도 옆으로 안 밀린다
  await page.addInitScript(() => { try { const l = JSON.parse(sessionStorage.getItem('__look') || 'null'); if (l) { localStorage.setItem('ces2027.theme.v1', JSON.stringify(l.theme)); localStorage.setItem('ces2027.text.v1', JSON.stringify(l.text)); } } catch { /* 없으면 그대로 */ } });
  const saveYs = [];
  for (const W of [360, 390]) for (const theme of ['light', 'dark']) for (const size of [1, 2, 3, 4]) {
    await page.setViewportSize({ width: W, height: 740 });
    await page.evaluate((l) => sessionStorage.setItem('__look', JSON.stringify(l)), { theme, text: size });
    await page.goto('about:blank');
    await page.goto(`${URL}#/diary/new/${co.id}`);
    await page.locator('textarea[name=saw]').waitFor();
    await settle(250);
    const a = await formNow();
    if (W === 360 && theme === 'light') saveYs.push(a.saveY);
    if (W === 360 && ((theme === 'dark' && size === 1) || (theme === 'light' && size === 4))) await shot(`205-diary-short-${theme === 'dark' ? 'dark' : 'text4'}-360.png`);
    await page.locator('details.more > summary').click();
    const b = await formNow();
    check(!a.open && a.saveOn && !a.side && a.small === 0 && a.blacks === 1 && a.taps.length === 4 && b.open && !b.side && b.small === 0 && b.blacks === 1, `${W}px ${theme === 'dark' ? '어둡게' : '밝게'} 글자 ${size}: 일기 쓰기 첫 화면에 "폰에 남기기"가 보이고(y ${a.saveY}) 44px 이상 · 옆으로 안 밀림 · 검정 단추 하나, 편 것도 같다`);
  }
  await page.evaluate(() => { sessionStorage.removeItem('__look'); localStorage.setItem('ces2027.theme.v1', JSON.stringify('light')); localStorage.setItem('ces2027.text.v1', JSON.stringify(1)); });
  await page.setViewportSize({ width: 360, height: 740 });
  check(true, `"폰에 남기기" 가운데 y(360px 밝게, 글자 1 ~ 4): ${saveYs.join(' · ')} (전 945 · 가장 크게 1091)`);

  console.log(JSON.stringify(checks.map((c) => `${c.ok ? '됨' : '안 됨'} | ${c.what}`), null, 1));
  return `${checks.length}개 통과`;
}
