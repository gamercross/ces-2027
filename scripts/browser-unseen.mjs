// Playwright CLI test for R47: 동선의 "안 본 곳" 칩. 360 · 390px 폰 크기, 밝게, 글자 크기 네 단계.
// Run with: playwright-cli open about:blank
//           playwright-cli run-code "$(cat scripts/browser-unseen.mjs)"
// The app must be served from a stamped dist at http://127.0.0.1:47571/ (자료가 있는 지은 것). 위치는 시험 브라우저가 흉내 낸다.
// SHOTS를 채우면(레포 바탕의 상대 경로) 칩이 꺼진 · 켜진 · 다 본 날 그림을 그 폴더에 남긴다.
async (page) => {
  const URL = 'http://127.0.0.1:47571/';
  const SHOTS = '';
  const check = (ok, what) => { if (!ok) throw new Error(`안 됨: ${what}`); console.log(`됨 | ${what.slice(0, 140)}`); };
  const settle = (ms = 400) => page.waitForTimeout(ms);
  const shot = async (name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}${name}` }); };
  const api = (fn, arg) => page.evaluate(([src, a]) => { const m = document.querySelector('#view > .page').mapApi; return new Function('m', 'a', `return (${src})(m, a)`)(m, a); }, [fn.toString(), arg]);
  const interests = () => page.evaluate(() => JSON.parse(localStorage.getItem('ces2027.interests.v1') || '[]'));
  const chips = () => page.evaluate(() => [...document.querySelectorAll('.segs[aria-label="날짜"] .daychip')].map((c) => `${c.querySelector('.dc-day').textContent} ${c.querySelector('.dc-n').textContent}${c.getAttribute('aria-pressed') === 'true' ? '*' : ''}`));
  const rows = () => page.evaluate(() => [...document.querySelectorAll('.planpage .panel ol.stops > li.stop[data-booth]')].map((li) => ({ no: li.querySelector('.no').textContent, name: li.querySelector('.name').textContent, seen: li.classList.contains('seen') })));
  const unseen = () => page.locator('.segs[aria-label="날짜"] .unseen-chip');

  await page.context().grantPermissions(['geolocation']);
  await page.context().setGeolocation({ latitude: 36.1338, longitude: -115.1577, accuracy: 20 });
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto(URL);
  await page.evaluate(async () => { for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister(); for (const k of await caches.keys()) await caches.delete(k); localStorage.clear(); sessionStorage.clear(); });
  const ex = await page.evaluate(async () => { const d = await (await fetch('data/exhibitors.json')).json(); return d.ex.filter((x) => /@LVCC_N$/.test(x[7][0])).slice(0, 6).map((x) => ({ id: x[0], name: x[1] })); });
  await page.evaluate((ex) => {
    localStorage.setItem('ces2027.theme.v1', JSON.stringify('light'));
    localStorage.setItem('ces2027.profile.v1', JSON.stringify({ nick: '시험', tag: 'stu', line: '', github: '', discord: '' }));
    localStorage.setItem('ces2027.paper.v1', JSON.stringify({ has: true, asked: '2026-11-22', remindOn: '2027-01-01' }));
    // 1/6에 셋(둘째는 이미 봤다), 1/7에 둘, 날짜 미정 하나
    localStorage.setItem('ces2027.interests.v1', JSON.stringify([
      { id: ex[0].id, day: 1 }, { id: ex[1].id, day: 1, seen: true }, { id: ex[2].id, day: 1 },
      { id: ex[3].id, day: 2 }, { id: ex[4].id, day: 2 }, { id: ex[5].id, day: 0 }]));
    sessionStorage.setItem('ces2027.planDay', '1');
  }, ex);
  await page.goto('about:blank');
  await page.goto(`${URL}#/plan`);
  await page.locator('.segs[aria-label="날짜"]').waitFor();
  await settle(600);

  // 1. 칩이 날짜 칩 줄 맨 끝에 있다
  const order = await page.evaluate(() => [...document.querySelectorAll('.segs[aria-label="날짜"] > .seg')].map((c) => c.classList.contains('unseen-chip') ? '안 본 곳' : 'day'));
  check(order.at(-1) === '안 본 곳' && order.filter((x) => x === '안 본 곳').length === 1 && order.length === 4 && (await unseen().getAttribute('aria-label')) === '안 본 곳 5곳만 보기', `"안 본 곳" 칩이 날짜 칩 줄 맨 끝에 하나 있다 (${order.join(' · ')})`);
  check((await unseen().textContent()) === '안 본5곳' && (await unseen().getAttribute('aria-pressed')) === 'false', `처음에는 꺼져 있고 남은 안 본 곳 수가 보인다 (${await unseen().textContent()})`);
  check((await chips()).join(' | ') === '1/6 3곳* | 1/7 2곳 | 미정 1곳', `꺼져 있으면 칩의 곳 수는 전체다 (${(await chips()).join(' | ')})`);
  check((await rows()).map((r) => `${r.no}${r.seen ? '봤다' : ''}`).join() === '1,2봤다,3', '1/6에는 세 곳이 보이고 둘째는 "봤다"로 표시돼 있다');
  await shot('170-unseen-off.png');
  const before = JSON.stringify(await interests());

  // 2. 켜면 "봤다"를 누른 회사가 빠지고, 날짜 칩의 곳 수도 준다. 번호는 지도와 같다
  await unseen().click();
  await settle();
  check((await unseen().getAttribute('aria-pressed')) === 'true', '누르면 켜진다 (눌린 칩)');
  const on = await rows();
  check(on.length === 2 && on.every((r) => !r.seen) && on.map((r) => r.no).join() === '1,3' && !on.some((r) => r.name === ex[1].name), `"봤다"를 누른 회사가 목록에서 빠지고, 남은 줄의 번호는 지도와 같다 (${on.map((r) => r.no + ' ' + r.name.slice(0, 14)).join(' · ')})`);
  check((await chips()).join(' | ') === '1/6 2곳* | 1/7 2곳 | 미정 1곳', `날짜 칩의 곳 수도 같이 준다 (${(await chips()).join(' | ')})`);
  check((await page.locator('.planpage .panel h2').first().textContent()) === '1/6 (수) · 안 본 곳 2곳' || /안 본 곳 2곳/.test(await page.locator('.planpage .panel h2').first().textContent()), '머리 줄에 "안 본 곳 2곳"이 적힌다');
  check(JSON.stringify(await interests()) === before, '칩을 켜도 "봤다" 값(관심 회사의 seen)은 바뀌지 않는다');
  await shot('171-unseen-on.png');

  // 3. 켠 채로 "봤다"를 누르면 그 줄이 빠지고 한 줄 알림이 나온다
  await page.locator('li.stop', { hasText: ex[0].name }).locator('.seen-btn').click();
  await settle();
  check((await rows()).length === 1 && (await chips())[0] === '1/6 1곳*' && /안 본 곳에서 빠졌다/.test(await page.locator('.planpage [role=status]').first().textContent()), '켠 채로 "봤다"를 누르면 줄이 빠지고 칩이 줄고 "안 본 곳에서 빠졌다"가 알려 준다');
  // 4. 끄면 전체가 돌아오고 봤다 표시는 그대로
  await unseen().click();
  await settle();
  const off = await rows();
  check(off.length === 3 && off.filter((r) => r.seen).length === 2 && (await chips())[0] === '1/6 3곳*', '다시 누르면 꺼지고 전체가 돌아온다(봤다 표시는 그대로)');

  // 5. 켠 채로 이 탭 안에서 화면을 오가도 기억한다
  await unseen().click();
  await page.goto(`${URL}#/settings`);
  await page.locator('.setlist').waitFor();
  await page.goto(`${URL}#/plan`);
  await page.locator('.segs[aria-label="날짜"]').waitFor();
  check((await unseen().getAttribute('aria-pressed')) === 'true', '다른 화면에 다녀와도 켜져 있다(이 탭을 여는 동안)');
  // 6. 다 본 날: 한 줄 안내
  await page.locator('li.stop .seen-btn').first().click();
  await settle();
  check((await page.locator('.planpage .panel .note', { hasText: '이 날은 다 봤다' }).count()) === 1 && (await chips())[0] === '1/6 0곳*', '그 날을 다 보면 "이 날은 다 봤다"가 나오고 칩은 0곳이다');
  await shot('172-unseen-done.png');
  await unseen().click();

  // 7. 지도 길 안내의 "봤다"(같은 seen)도 걸러진다
  await page.evaluate((ex) => localStorage.setItem('ces2027.interests.v1', JSON.stringify([{ id: ex[0].id, day: 1 }, { id: ex[1].id, day: 1 }, { id: ex[2].id, day: 1 }])), ex);
  await page.goto('about:blank');
  await page.goto(`${URL}#/map/go/${encodeURIComponent(ex[0].id)}`);
  await page.waitForFunction(() => !!document.querySelector('#view > .page')?.mapApi, null, { timeout: 20000 });
  await page.waitForTimeout(1500);
  const spot = await api((m) => m.nav.spot);
  await page.evaluate((s) => { localStorage.setItem('ces2027.where.v1', JSON.stringify({ by: 'booth', campus: 'lvcc', place: 'LVCC_N', code: '1', x: s.x + 4, z: s.z + 4, at: Date.now() })); }, spot);
  await api((m) => m.drawMe());
  const bar = await page.evaluate(() => document.querySelector('.navbar').innerText);
  check(bar.includes('도착했다') && bar.includes('봤다'), `지도 길 안내가 도착을 알리고 "봤다"를 준다 (${bar.replace(/\n/g, ' · ')})`);
  await page.locator('.navbar').getByRole('button', { name: '봤다' }).click();
  await settle();
  check((await interests()).find((i) => i.id === ex[0].id)?.seen === true, '길 안내의 "봤다"가 같은 seen을 켠다');
  await page.goto('about:blank');
  await page.goto(`${URL}#/plan`);
  await page.locator('.segs[aria-label="날짜"]').waitFor();
  check((await chips())[0] === '1/6 3곳*', '지도에서 본 뒤에도 칩을 켜기 전에는 전체 세 곳이다');
  await unseen().click();
  await settle();
  const viaMap = await rows();
  check(viaMap.length === 2 && !viaMap.some((r) => r.name === ex[0].name) && (await chips())[0] === '1/6 2곳*', `지도 길 안내에서 "봤다"를 누른 회사가 "안 본 곳"에서 빠지고 칩의 곳 수도 준다 (${viaMap.map((r) => r.no).join()})`);
  await unseen().click();

  // 8. 360 · 390px × 글자 네 단계
  await page.evaluate((ex) => localStorage.setItem('ces2027.interests.v1', JSON.stringify([{ id: ex[0].id, day: 1 }, { id: ex[1].id, day: 1, seen: true }, { id: ex[2].id, day: 1 }, { id: ex[3].id, day: 2 }, { id: ex[5].id, day: 0 }])), ex);
  const results = [];
  for (const W of [360, 390]) {
    for (let n = 1; n <= 4; n++) {
      await page.setViewportSize({ width: W, height: 740 });
      await page.evaluate((s) => { localStorage.setItem('ces2027.text.v1', JSON.stringify(s)); sessionStorage.setItem('ces2027.planUnseen', '1'); }, n);
      await page.goto('about:blank');
      await page.goto(`${URL}#/plan`);
      await page.locator('.segs[aria-label="날짜"]').waitFor();
      await settle(300);
      const a = await page.evaluate(([w]) => {
        const row = document.querySelector('.segs[aria-label="날짜"]');
        const chip = row.querySelector('.unseen-chip').getBoundingClientRect();
        const visible = (n) => { const r = n.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
        const small = [...document.querySelectorAll('#view button, #view a.btn, #view a.pick')].filter(visible).filter((x) => { const r = x.getBoundingClientRect(); return r.height < 43.5 || r.width < 43.5; }).map((x) => `${x.className}:${Math.round(x.getBoundingClientRect().width)}x${Math.round(x.getBoundingClientRect().height)}`);
        return { w, side: document.documentElement.scrollWidth > w, chipH: Math.round(chip.height), chipW: Math.round(chip.width), rowScroll: row.scrollWidth > row.clientWidth + 1, small };
      }, [W]);
      results.push({ W, n, ...a });
      check(!a.side && a.chipH >= 44 && a.chipW >= 44 && a.small.length === 0, `${W}px · 글자 ${n}단계: 가로 넘침 없음 · 칩 ${a.chipW}x${a.chipH} · 누르는 곳 44px 이상${a.rowScroll ? ' (칩 줄은 옆으로 밀어 본다)' : ' (칩 줄이 한눈에 들어온다)'}`);
      if (W === 360 && (n === 1 || n === 4)) await shot(`173-unseen-text${n}.png`);
    }
  }
  await page.evaluate(() => { localStorage.setItem('ces2027.text.v1', JSON.stringify(1)); });
  return `됨: R47 안 본 곳 칩 (${results.length}가지 크기 · 글자 단계 + 기능)`;
}
