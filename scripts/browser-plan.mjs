// Playwright CLI test for 갈 곳 탭(안 1, 2026-11-23): 날짜 한 줄 → 다음에 갈 곳 한 곳 크게 → 그다음 곳들 → 다녀온 곳 접기.
// 360 · 390px, 밝게 · 어둡게, 글자 네 단계. 기준 문서는 docs/디자인/동선_쉽게_안.md.
// Run with: playwright-cli open about:blank
//           playwright-cli run-code "$(cat scripts/browser-plan.mjs)"
// The app must be served from a stamped dist at http://127.0.0.1:47571/ (자료가 있는 지은 것).
// SHOTS를 채우면(레포 바탕의 상대 경로) 갈 곳 · 카드 · 목록 고치기 · 그 날 지도 그림을 그 폴더에 남긴다.
async (page) => {
  const URL = 'http://127.0.0.1:47571/';
  const SHOTS = '';
  const checks = [];
  const check = (ok, what) => {
    checks.push({ ok, what });
    if (!ok) throw new Error(`안 됨: ${what}`);
  };
  const shot = async (name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}${name}` }); };
  const settle = (ms = 400) => page.waitForTimeout(ms);
  const noSideScroll = async (what) => { const W = page.viewportSize().width; check(await page.evaluate((w) => document.documentElement.scrollWidth <= w, W), `${what}: ${W}px 폭에서 옆으로 밀리지 않는다`); };
  const text = (sel) => page.locator(sel).first().textContent().then((t) => (t || '').trim());
  const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('ces2027.interests.v1') || '[]'));
  // 첫 화면(스크롤 전)에서 누를 수 있는 곳: 머리와 본문의 a · button · select · input 가운데 탭 막대 위에 가운데가 보이고 꺼져 있지 않은 것.
  const tappable = () => page.evaluate(() => {
    const bottom = innerHeight - document.querySelector('.tabs').offsetHeight;
    return [...document.querySelectorAll('header a, header button, main a, main button, main select, main input')].filter((n) => {
      const r = n.getBoundingClientRect();
      return !n.disabled && r.width > 0 && r.height > 0 && getComputedStyle(n).visibility !== 'hidden' && (r.top + r.bottom) / 2 > 0 && (r.top + r.bottom) / 2 < bottom;
    }).map((n) => (n.getAttribute('aria-label') || n.textContent).trim());
  });
  const smallTaps = (root) => page.evaluate((sel) => [...document.querySelectorAll(`${sel} button, ${sel} a`)].filter((n) => { const r = n.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (r.height < 43.5 || r.width < 43.5); }).map((n) => `${n.textContent.trim().slice(0, 10)}:${Math.round(n.getBoundingClientRect().width)}x${Math.round(n.getBoundingClientRect().height)}`), root);

  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto(URL);
  await page.evaluate(async () => { for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister(); for (const k of await caches.keys()) await caches.delete(k); localStorage.clear(); sessionStorage.clear(); });
  // 관심 회사: 1/6에 노스 3 · 센트럴 2(첫 곳은 다녀옴), 1/7에 베네시안 G 2, 날짜 없음 1. 내 일정: 1/6 12 ~ 13시 팀 점심(지어낸 예시).
  const seed = await page.evaluate(async () => {
    const d = await (await fetch('data/exhibitors.json')).json();
    const one = (r) => r[7].length === 1;
    const pick = (hall, n) => d.ex.filter((r) => one(r) && r[7][0].endsWith(`@${hall}`)).slice(0, n).map((r) => ({ id: r[0], name: r[1] }));
    const n = pick('LVCC_N', 3), c = pick('LVCC_C', 2), g = pick('VEN_G', 2), w = pick('LVCC_W', 1);
    return { names: Object.fromEntries([...n, ...c, ...g, ...w].map((x) => [x.id, x.name])),
      list: [{ id: n[0].id, day: 1, seen: true }, { id: n[1].id, day: 1 }, { id: n[2].id, day: 1 }, { id: c[0].id, day: 1 }, { id: c[1].id, day: 1 }, { id: g[0].id, day: 2 }, { id: g[1].id, day: 2 }, { id: w[0].id, day: 0 }] };
  });
  const nameOf = (i) => seed.names[seed.list[i].id];
  const put = async (extra = {}) => {
    await page.evaluate(({ s, extra }) => {
      localStorage.setItem('ces2027.theme.v1', JSON.stringify(extra.theme || 'light'));
      localStorage.setItem('ces2027.text.v1', JSON.stringify(extra.text || 1));
      localStorage.setItem('ces2027.profile.v1', JSON.stringify({ nick: '시험', tag: 'stu', line: '', github: '', discord: '' }));
      localStorage.setItem('ces2027.interests.v1', JSON.stringify(extra.list || s));
      localStorage.setItem('ces2027.events.v1', JSON.stringify(extra.events || [{ id: 'e1', date: '2027-01-06', from: '12:00', to: '13:00', name: '팀 점심', place: '' }]));
      sessionStorage.clear();
    }, { s: seed.list, extra });
    await page.goto('about:blank');
    await page.goto(`${URL}#/plan`);
    await page.locator('.daynav').waitFor();
    await settle(700);
  };
  await put();

  // 1. 이름과 틀: 탭 "갈 곳", 날짜 한 줄에 남은 곳 수, 다음에 갈 곳 한 곳 크게
  check((await text('.tabs a[data-tab="plan"] span')) === '갈 곳' && (await text('.planpage h1')) === '갈 곳', '탭과 머리의 이름은 "갈 곳"이다');
  check((await text('.daynav-day')) === '1월 6일 (수)' && (await text('.daynav-left')) === '· 남은 4곳', `날짜 한 줄: "${await text('.daynav-now')}" (다녀온 곳을 뺀 남은 수)`);
  check((await page.locator('.segs[aria-label="날짜"]').count()) === 0 && (await page.locator('.daychip').count()) === 0, '날짜 칩 줄은 없다("안 본 곳" 칩도 없다)');
  const nextText = await text('.nextup-open');
  check(nextText.startsWith('다음에 갈 곳 · 10:30쯤') && nextText.includes(nameOf(1)) && nextText.includes('LVCC 노스 홀 · 부스'), `다음에 갈 곳: 고른 날의 첫 안 간 곳(${nameOf(1)}), 때와 곳이 같이 보인다`);
  const nameSize = await page.locator('.nextup .big').evaluate((n) => parseFloat(getComputedStyle(n).fontSize));
  const biggest = await page.evaluate(() => Math.max(...[...document.querySelectorAll('main *')].filter((n) => n.childElementCount === 0 && n.textContent.trim() && n.getBoundingClientRect().width > 0 && !n.closest('.pcard-back')).map((n) => parseFloat(getComputedStyle(n).fontSize))));
  check(nameSize === 24 && biggest === 24, `다음에 갈 곳의 이름이 화면에서 가장 크다(${nameSize}px)`);
  const black = await page.evaluate(() => [...document.querySelectorAll('main .btn:not(.ghost)')].filter((n) => n.getBoundingClientRect().width > 0).map((n) => n.textContent.trim()));
  check(black.join() === '길 안내', `검정 단추는 화면에 하나(${black.join(' · ')})`);
  check((await page.locator('.band.ask').count()) === 0 && !(await page.locator('main').textContent()).includes('종이 명함'), '종이 명함 물음은 갈 곳에 없다');

  // 2. 그다음 곳들: 번호는 그 날 차례(지도와 같다), 내 일정은 때에 맞는 자리에 점선 칸
  check((await text('.subhead')) === '그다음 3곳', '"그다음 3곳"');
  const rows = await page.evaluate(() => [...document.querySelectorAll('.after .stops > li')].map((li) => (li.classList.contains('meal') ? `일정:${li.textContent.trim()}` : `${li.querySelector('.no').textContent}:${li.querySelector('.where').textContent}`)));
  check(rows.length === 4 && rows[0].startsWith('3:11:00쯤') && rows[1].startsWith('4:11:30쯤') && rows[2] === '일정:12:00 ~ 13:00 · 팀 점심 (내 일정)' && rows[3].startsWith('5:13:00쯤'), `줄: ${rows.join(' / ')}`);
  check(rows[0].includes('노스 홀 · 부스') && !rows[0].includes('LVCC'), '줄의 곳은 짧은 홀 이름 + "부스 번호"다');
  check((await page.locator('.after .stop button').count()) === 3 && (await page.locator('.seen-btn').count()) === 0, '줄에는 누르는 곳이 줄 전체 하나뿐이다("아직/봤다" 단추 없음)');
  check((await text('.fold-text')) === `다녀온 곳 1 (${nameOf(0)})` && (await page.locator('.stop.done').count()) === 0, `다녀온 곳은 한 줄로 접혀 있다("${await text('.fold-text')}")`);
  const taps = await tappable();
  check(taps.length <= 9, `첫 화면에서 누를 곳 ${taps.length}개(전 13개): ${taps.join(' · ')}`);
  check((await smallTaps('main')).length === 0, '누르는 곳은 모두 44px 이상');
  await noSideScroll('갈 곳');
  await shot('190-where-360.png');

  // 3. 다녀왔다 → 다음 곳이 바뀌고, 아래에 "OO 다녀왔다 · 일기 쓰기"가 6초 뜬다
  await page.locator('.nextup-go .pick').click();
  await settle(300);
  check((await text('.toast-text')) === `${nameOf(1)} 다녀왔다.` && (await page.locator('.toast a').getAttribute('href')) === `#/diary/new/${seed.list[1].id}` && (await text('.toast a')) === '일기 쓰기', `다녀왔다: 아래에 "${await text('.toast')}"가 뜬다(일기 쓰기로 한 번에)`);
  check((await text('.nextup-open')).includes(nameOf(2)) && (await text('.daynav-left')) === '· 남은 3곳' && (await text('.subhead')) === '그다음 2곳' && (await text('.fold-text')) === `다녀온 곳 2 (${nameOf(0)} 외 1곳)`, '다음에 갈 곳 · 남은 수 · 다녀온 곳이 같이 바뀐다');
  const toastBox = await page.locator('.toast').evaluate((n) => { const r = n.getBoundingClientRect(); return { bottom: Math.round(r.bottom), tabsTop: innerHeight - document.querySelector('.tabs').offsetHeight }; });
  check(toastBox.bottom <= toastBox.tabsTop, '알림 한 줄은 탭 바로 위에 뜬다(탭을 가리지 않는다)');
  await page.emulateMedia({ colorScheme: 'light' });
  await shot('191-where-toast-360.png');
  await page.waitForTimeout(6200);
  check(await page.locator('.toast').isHidden(), '6초 뒤에 사라진다');

  // 4. 다녀온 곳 보기 → "다녀옴" 칸으로 되돌린다
  await page.locator('.fold .pick').first().click();
  await settle(200);
  check((await page.locator('.stop.done').count()) === 2 && (await page.locator('.stop.done .check.on').count()) === 2 && (await text('.stop.done .check')) === '다녀옴', '보기: 다녀온 곳 줄에 체크된 "다녀옴" 칸이 있다');
  check(await page.locator('.stop.done .name').first().evaluate((n) => getComputedStyle(n).textDecorationLine.includes('line-through')), '다녀온 곳의 이름에는 줄이 간다');
  await page.evaluate(() => window.scrollTo(0, 9999));
  await shot('192-where-visited-open-360.png');
  await page.locator('.stop.done .check').nth(1).click();
  await settle(200);
  check((await text('.daynav-left')) === '· 남은 4곳' && (await text('.nextup-open')).includes(nameOf(1)) && (await stored())[1].seen === false, '"다녀옴" 칸을 누르면 갈 곳으로 돌아온다');
  await page.evaluate(() => window.scrollTo(0, 0));

  // 5. 회사 카드: 이름 · 부스 · 길 안내(검정 하나) · 다녀왔다 · 일기 쓰기 · 공식 쪽, 날짜에 1/5가 없다
  await page.locator('.after .stop-open').first().click();
  await page.locator('.pcard').waitFor();
  await settle(900);
  check((await text('.pcard-sub')).startsWith('1월 6일 3번째 · 11:00쯤') && (await text('.pcard-name')) === nameOf(2), `카드: "${await text('.pcard-sub')}" ${nameOf(2)}`);
  const place = await text('.pcard-place');
  check(place.includes('LVCC 노스 홀 · 부스') && place.includes('자리는 짐작'), `카드의 곳: ${place}`);
  const cardTaps = await page.evaluate(() => [...document.querySelectorAll('.pcard a, .pcard button')].filter((n) => n.getBoundingClientRect().width > 0).map((n) => n.textContent.trim()));
  check(cardTaps.join(' · ') === '닫기 · 길 안내 · 다녀왔다 · 일기 쓰기 · 공식 쪽 · 1/6 · 1/7 · 1/8 · 1/9 · 날짜 없음 · 갈 곳에서 빼기', `카드의 누를 곳 ${cardTaps.length}개(전 23개): ${cardTaps.join(' · ')}`);
  const cardBlack = await page.evaluate(() => [...document.querySelectorAll('.pcard .btn:not(.ghost)')].map((n) => n.textContent.trim()));
  check(cardBlack.join() === '길 안내', '카드의 검정 단추도 "길 안내" 하나');
  const firstView = await page.evaluate(() => { const b = innerHeight; return ['.pcard-name', '.pcard-place', '.pcard a.btn', '.pcard-links'].every((s) => document.querySelector(s).getBoundingClientRect().bottom <= b); });
  check(firstView, '카드 첫 화면에 이름 · 부스 · 길 안내 · 다녀왔다 · 일기 쓰기가 다 보인다');
  check((await smallTaps('.pcard')).length === 0, '카드의 누르는 곳은 모두 44px 이상');
  await noSideScroll('카드');
  await shot('193-where-card-360.png');
  await page.locator('.pcard .segs .seg', { hasText: '1/7' }).click();
  await settle(300);
  check((await text('.pcard-sub')).startsWith('1월 7일 1번째') && (await stored())[2].day === 2, `다른 날로 옮기기: 카드가 "${await text('.pcard-sub')}"로 바뀐다`);
  await page.keyboard.press('Escape');
  await settle(200);
  check((await page.locator('.pcard-back').isHidden()) && (await text('.daynav-day')) === '1월 7일 (목)' && (await text('.daynav-left')) === '· 남은 3곳', 'Esc로 닫히고 보는 날이 따라간다');
  // 빼면 되돌리기가 6초 뜬다
  await page.locator('.after .stop-open').last().click();
  await page.locator('.pcard button', { hasText: '갈 곳에서 빼기' }).click();
  await settle(300);
  check((await text('.daynav-left')) === '· 남은 2곳' && (await text('.toast-text')) === `${nameOf(6)} 뺐다.`, '갈 곳에서 빼기: 줄이 줄고 "되돌리기"가 뜬다');
  await page.locator('.toast .pick').click();
  await settle(300);
  check((await text('.daynav-left')) === '· 남은 3곳' && (await stored()).length === 8, '되돌리기: 줄이 돌아온다');

  // 6. 날짜 넘기기: 전시 나흘 + 날짜 없음. 1/5는 내 일정이 없으면 없다
  for (let i = 0; i < 3; i++) await page.locator('.daynav-btn[data-side="next"]').click();
  await settle(200);
  check((await text('.daynav-day')) === '날짜 없음' && (await page.locator('.daynav-btn[data-side="next"]').isDisabled()) && (await page.locator('.daynotes').textContent()).includes('목록 고치기'), '마지막은 "날짜 없음"이고, 날마다 나누라는 한 줄이 있다');
  await shot('197-where-nodate-360.png');
  for (let i = 0; i < 4; i++) await page.locator('.daynav-btn[data-side="prev"]').click();
  await settle(200);
  check((await text('.daynav-day')) === '1월 6일 (수)' && (await page.locator('.daynav-btn[data-side="prev"]').isDisabled()), '맨 앞은 1월 6일이다(1/5는 그 날 넣은 내 일정이 없으면 보이지 않는다)');

  // 7. 목록 고치기: 말 바꾸기 다섯, 검정 단추 없음
  await page.evaluate(() => { window.__copied = ''; Object.defineProperty(navigator, 'share', { value: undefined, configurable: true }); navigator.clipboard.writeText = async (t) => { window.__copied = t; }; });
  await page.getByRole('button', { name: '목록 고치기', exact: true }).click();
  await page.locator('.pcard').waitFor();
  const tools = await page.evaluate(() => ({ rows: [...document.querySelectorAll('.pcard .pick-row b')].map((b) => b.textContent), black: document.querySelectorAll('.pcard .btn:not(.ghost)').length, labels: [...document.querySelectorAll('.pcard .label')].map((l) => l.textContent), room: document.querySelector('.pcard .tools .note').textContent, old: ['차례 정리', '날짜 채우기', '걷는 차례로', '마크다운', 'CSV', '코드'].filter((w) => document.querySelector('.pcard').textContent.includes(w)) }));
  check(tools.rows.join(' / ') === '날짜 없는 곳을 날마다 나누기 / 가까운 곳끼리 줄 세우기 / 다른 사람에게 보내기' && tools.labels.join(' / ') === '하루에 볼 곳 / 받은 목록 넣기' && tools.black === 0 && tools.old.length === 0, `목록 고치기: ${tools.rows.join(' · ')} · ${tools.labels.join(' · ')}, 검정 단추 0`);
  check(/^1월 6일 \(수\) · 10시 ~ 18시 · 하루에 \d+곳쯤 볼 수 있다$/.test(tools.room), `"${tools.room}"`);
  check((await smallTaps('.pcard')).length === 0, '목록 고치기의 누르는 곳은 모두 44px 이상');
  await noSideScroll('목록 고치기');
  await shot('194-where-tools-360.png');
  await page.locator('.pcard .pick-row', { hasText: '다른 사람에게 보내기' }).click();
  await settle(300);
  const copied = await page.evaluate(() => window.__copied);
  check(copied.startsWith('[CES 2027 갈 곳]') && copied.includes('■ 1/6 (수)') && /받는 링크: http.*#plan=/.test(copied) && !copied.includes('1/5'), '다른 사람에게 보내기: 공유 창이 없으면 글(날마다 회사 · 부스)과 받는 링크를 복사한다');
  // 받은 목록 넣기: 받은 링크를 붙이면 내게 없는 곳 수를 보이고 묻는다
  await page.locator('.pcard input[aria-label="받은 목록 글이나 링크"]').fill(copied.match(/받는 링크: (\S+)/)[1]);
  await page.locator('.pcard form button').click();
  await settle(300);
  check((await text('.pcard-tools-title')) === '받은 목록' && (await text('.pcard .pcard-where')) === '8곳 가운데 내게 없는 것 0곳', `받은 목록 넣기: "${await text('.pcard .pcard-where')}"`);
  await page.locator('.pcard button', { hasText: '버리기' }).click();
  await page.getByRole('button', { name: '목록 고치기', exact: true }).click();
  await page.locator('.pcard .pick-row', { hasText: '날짜 없는 곳을 날마다 나누기' }).click();
  await settle(300);
  check((await page.locator('.pcard-back').isHidden()) && (await text('.planpage > p[role="status"]')) === '날짜 없던 1곳을 날마다 나눴다.' && (await stored()).every((it) => it.day >= 1 && it.day <= 4), `날마다 나누기: 카드가 닫히고 "${await text('.planpage > p[role="status"]')}"`);
  await page.getByRole('button', { name: '목록 고치기', exact: true }).click();
  await page.locator('.pcard .pick-row', { hasText: '가까운 곳끼리 줄 세우기' }).click();
  await settle(300);
  check((await text('.planpage > p[role="status"]')) === '가까운 곳끼리 줄을 세웠다.', '줄 세우기: 결과 한 줄이 보인다');

  // 8. 그 날 지도: 번호가 같고, 띠는 그 날 회사만
  const dayList = await page.evaluate(() => ({ next: document.querySelector('.nextup .big').textContent, n: document.querySelectorAll('.after .stop').length + 1 + Number((document.querySelector('.fold-text')?.textContent.match(/다녀온 곳 (\d+)/) || [0, 0])[1]) }));
  await page.getByRole('link', { name: '지도에서 보기' }).click();
  await page.locator('svg.map').waitFor();
  await page.locator('.daybar:not([hidden])').waitFor();
  await settle(1800);
  const bar = await text('.daybar');
  check(bar === `1/6 갈 곳 ${dayList.n}곳만 보는 중모두 보기`, `지도 위 띠: "${await text('.daybar-text')} · 모두 보기"`);
  const mapDay1 = await page.evaluate(() => [...document.querySelectorAll('g[data-pin]')].filter((g) => g.querySelector('circle').getAttribute('opacity') !== '0.25').map((g) => g.querySelector('text').textContent));
  check(mapDay1.length === dayList.n && mapDay1.join(',') === Array.from({ length: dayList.n }, (_, i) => i + 1).join(','), `지도에서 그 날 번호(${mapDay1.join(',')})가 갈 곳과 같다`);
  check((await text('.navbar .nav-head b')) === `다음 갈 곳 · ${dayList.next}`, `지도 아래 띠도 그 날의 다음 곳이다(${dayList.next})`);
  check((await page.evaluate(() => [...document.querySelectorAll('.bar .tag, .find-tag')].filter((n) => n.getBoundingClientRect().width > 0).length)) === 1, '지도에 "비공식"은 찾기 칸 안의 것 하나뿐이다');
  await noSideScroll('그 날 지도');
  await shot('195-where-map-day-360.png');
  // 그 날 갈 곳을 다 다녀왔으면 띠를 안 보인다(다른 날 회사로 길 안내를 걸지 않는다)
  await page.evaluate(() => { const l = JSON.parse(localStorage.getItem('ces2027.interests.v1')).map((it) => (it.day === 1 ? { ...it, seen: true } : it)); localStorage.setItem('ces2027.interests.v1', JSON.stringify(l)); });
  await page.reload();
  await page.locator('.daybar:not([hidden])').waitFor();
  await settle(1500);
  check(await page.locator('.navbar').isHidden(), '그 날 갈 곳이 남아 있지 않으면 지도 아래 띠가 없다');

  // 9. 1/5: 회사는 넣지 못한다(예전에 넣은 것은 "날짜 없음"으로 읽는다). 1/5에 넣은 내 일정이 있을 때만 그 날이 보인다
  await put({ list: [{ id: seed.list[1].id, day: 5 }, { id: seed.list[2].id, day: 1 }], events: [{ id: 'p1', date: '2027-01-05', from: '18:00', to: '19:00', name: '사전 모임', place: '' }] });
  check((await text('.daynav-day')) === '1월 6일 (수)' && !(await page.locator('.daynav-btn[data-side="prev"]').isDisabled()), '1/5에 내 일정이 있으면 앞 날로 넘길 수 있다');
  await page.locator('.daynav-btn[data-side="prev"]').click();
  await settle(200);
  check((await text('.daynav-day')) === '1월 5일 (화)' && (await page.locator('.stop').count()) === 0 && (await text('.meal')) === '18:00 ~ 19:00 · 사전 모임 (내 일정)' && (await page.locator('.nextup a.btn').count()) === 0, '1월 5일: 내 일정만 보이고 회사 · 길 안내는 없다');
  for (let i = 0; i < 5; i++) await page.locator('.daynav-btn[data-side="next"]').click();
  await settle(200);
  check((await text('.daynav-day')) === '날짜 없음' && (await text('.nextup .big')) === nameOf(1), '예전에 1/5로 넣은 회사는 "날짜 없음"에 보인다');
  await page.goto(`${URL}#/map/at/${encodeURIComponent(seed.list[2].id)}`);
  await page.locator('.sheet .card h2').waitFor({ timeout: 20000 });
  await settle(600);
  const mapDays = await page.evaluate(() => [...document.querySelectorAll('.sheet .card .segs[aria-label="갈 곳에 넣기"] .seg')].map((b) => b.textContent));
  check(mapDays.join(',') === '1/6,1/7,1/8,1/9', `지도 카드의 "갈 곳에 넣기"에도 1/5가 없다(${mapDays.join(' ')})`);

  // 10. 옮긴 것: 설정의 내보내기 줄 둘, 시간과 일정 칩은 둘, 강연 일정
  await page.goto(`${URL}#/settings`);
  await page.locator('.setlist').waitFor();
  const setRows = await page.evaluate(() => [...document.querySelectorAll('.setrow')].filter((r) => r.querySelector('.setrow-btns')).map((r) => `${r.querySelector('b').textContent}: ${[...r.querySelectorAll('button')].map((b) => b.textContent).join(' · ')}`));
  check(setRows.includes('갈 곳 목록: 문서로 · 표로') && setRows.includes('시간 · 일정 파일: 불러오기 · 내보내기') && (await page.locator('.setrow b', { hasText: '종이 명함' }).count()) === 1, `설정: ${setRows.join(' / ')}, 종이 명함 줄`);
  await page.evaluate(() => document.querySelector('.setrow-btns').scrollIntoView({ block: 'center' }));
  await noSideScroll('설정');
  await shot('198-settings-files-360.png');
  await page.goto(`${URL}#/days`);
  await page.locator('.segs[aria-label="보기"]').waitFor();
  check((await page.locator('.segs[aria-label="보기"] .seg').allTextContents()).join(',') === '시간,내 일정', '시간과 일정의 칩은 둘이다("파일"은 설정으로 옮겼다)');
  await page.goto(`${URL}#/sessions`);
  await page.locator('.session').first().waitFor({ timeout: 20000 });
  const ses = await page.evaluate(() => ({ h1: document.querySelector('h1').textContent, acts: [...document.querySelector('.session .row-actions').children].map((n) => n.textContent) }));
  check(ses.h1 === '강연 일정' && ses.acts[0] === '내 일정에 넣기' && ses.acts.includes('공식 쪽') && !ses.acts.includes('넣기') && !ses.acts.includes('공식'), `강연 일정의 줄 단추: ${ses.acts.join(' · ')}`);

  // 11. 360 · 390px × 밝게 · 어둡게 × 글자 네 단계: 옆으로 안 밀리고, 누르는 곳 44px, 카드도 같다
  for (const W of [360, 390]) {
    for (const theme of ['light', 'dark']) {
      for (const size of [1, 2, 3, 4]) {
        await page.setViewportSize({ width: W, height: 740 });
        await put({ theme, text: size });
        const tag = `${W}px ${theme === 'dark' ? '어둡게' : '밝게'} 글자 ${size}`;
        const side = await page.evaluate((w) => document.documentElement.scrollWidth <= w, W);
        const small = await smallTaps('main');
        const oneBlack = await page.evaluate(() => [...document.querySelectorAll('main .btn:not(.ghost)')].filter((n) => n.getBoundingClientRect().width > 0).length);
        const cut = await page.evaluate(() => [...document.querySelectorAll('.daynav-now, .nextup .big, .nextup .note, .stop .name, .stop .where, .meal-text, .fold-text')].filter((n) => n.scrollWidth > n.clientWidth + 1).length);
        if (SHOTS && W === 360 && ((theme === 'dark' && size === 1) || (theme === 'light' && size === 4))) await shot(theme === 'dark' ? '190-where-dark-360.png' : '196-where-text4-360.png');
        if (SHOTS && W === 390 && theme === 'light' && size === 1) await shot('190-where-390.png');
        await page.locator('.after .stop-open').first().click();
        await page.locator('.pcard').waitFor();
        await settle(500);
        const cardSide = await page.evaluate((w) => document.documentElement.scrollWidth <= w && document.querySelector('.pcard-body').scrollWidth <= document.querySelector('.pcard-body').clientWidth + 1, W);
        const cardSmall = await smallTaps('.pcard');
        const chipsSeen = await page.evaluate(() => { const box = document.querySelector('.pcard-body').getBoundingClientRect(); return [...document.querySelectorAll('.pcard .segs .seg')].every((b) => b.getBoundingClientRect().right <= box.right + 1); });
        if (SHOTS && W === 360 && ((theme === 'dark' && size === 1) || (theme === 'light' && size === 4))) await shot(theme === 'dark' ? '193-where-card-dark-360.png' : '196-where-card-text4-360.png');
        check(side && small.length === 0 && oneBlack === 1 && cut === 0 && cardSide && cardSmall.length === 0 && (size < 3 || chipsSeen), `${tag}: 옆으로 안 밀림 · 글자 안 잘림 · 누르는 곳 44px 이상 · 검정 단추 하나 · 카드도 같다${small.length || cardSmall.length ? ` (작은 것: ${[...small, ...cardSmall].join(', ')})` : ''}`);
      }
    }
  }
  await page.evaluate(() => { localStorage.setItem('ces2027.text.v1', JSON.stringify(1)); localStorage.setItem('ces2027.theme.v1', JSON.stringify('light')); });

  console.log(JSON.stringify(checks.map((c) => `${c.ok ? '됨' : '안 됨'} | ${c.what}`), null, 1));
  return `${checks.length}개 통과 · 첫 화면 누를 곳 ${taps.length}개`;
}
