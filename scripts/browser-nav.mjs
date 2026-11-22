// Playwright CLI test for 길 안내(이동 안내 모드): 목적지까지 선 · 남은 거리 · 걷는 시간 · 방향, 걸으면 따라오고, 도착하면 "봤다".
// Run with: playwright-cli open about:blank
//           playwright-cli run-code "$(cat scripts/browser-nav.mjs)"
// The app must be served from a stamped dist at http://127.0.0.1:47581/ (자료가 있는 지은 것). 위치는 시험 브라우저가 흉내 낸다.
async (page) => {
  const URL = 'http://127.0.0.1:47581/';
  const SHOTS = 'docs/screens/';
  const checks = [];
  const check = (ok, what) => { checks.push({ ok, what }); if (!ok) throw new Error(`안 됨: ${what}`); };
  const api = (fn, arg) => page.evaluate(([src, a]) => { const m = document.querySelector('#view > .page').mapApi; return new Function('m', 'a', `return (${src})(m, a)`)(m, a); }, [fn.toString(), arg]);
  const bar = () => page.evaluate(() => { const n = document.querySelector('.navbar'); return n.hidden ? null : n.innerText; });
  await page.context().grantPermissions(['geolocation']);
  await page.context().setGeolocation({ latitude: 36.1338, longitude: -115.1577, accuracy: 20 }); // LVCC 웨스트 홀 근처
  await page.setViewportSize({ width: 360, height: 740 });
  await page.addInitScript(() => { localStorage.setItem('ces2027.theme.v1', JSON.stringify('light')); localStorage.setItem('ces2027.profile.v1', JSON.stringify({ nick: '시험', tag: 'stu', line: '', github: '', discord: '' })); });
  await page.goto(URL);
  await page.evaluate(async () => { for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister(); for (const k of await caches.keys()) await caches.delete(k); localStorage.removeItem('ces2027.where.v1'); localStorage.removeItem('ces2027.interests.v1'); });
  const row = await page.evaluate(async () => { const d = await (await fetch('data/exhibitors.json')).json(); const r = d.ex.find((x) => /@LVCC_N$/.test(x[7][0])); return { id: r[0], name: r[1], booth: r[7][0] }; });

  // 1. 카드의 "길 안내 시작": 내 위치(GPS)가 잡히면 선 · 거리 · 걷는 시간 · 방향
  await page.goto('about:blank');
  await page.goto(`${URL}#/map/at/${encodeURIComponent(row.id)}`);
  await page.locator('.sheet .card h2').waitFor({ timeout: 15000 });
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: '길 안내 시작' }).click();
  await page.waitForFunction(() => /걸어서/.test(document.querySelector('.navbar').innerText), null, { timeout: 15000 });
  let text = await bar();
  check(text.startsWith(`→ ${row.name}`) && /\d+m|km/.test(text) && /걸어서 \d+분/.test(text) && /(북|동|남|서)(북|동|남|서)?쪽/.test(text) && text.includes('끝내기'), `길 안내를 시작하면 아래 띠에 목적지 · 남은 거리 · 걷는 시간 · 방향 · 끝내기가 나온다 (${text.replace(/\n/g, ' · ')})`);
  check((await page.locator('.sheet').getAttribute('data-state')) === 'closed', '안내 중에는 카드가 접히고 지도가 넓게 보인다');
  const lines = await page.evaluate(() => document.querySelectorAll('#me-layer polyline').length);
  check(lines >= 2, `내 위치에서 목적지까지 선이 그어진다 (${lines}줄)`);
  const fits = await api((m) => { const t = m.nav.spot; const v = m.view; return t.x > v[0] && t.x < v[2] && t.z > v[1] && t.z < v[3]; });
  check(fits, '내 자리와 목적지가 한 화면에 들어온다');
  const noScroll = await page.evaluate(() => document.documentElement.scrollWidth <= 360);
  check(noScroll, '360px 폭에서 옆으로 밀리지 않는다');
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${SHOTS}98-nav.png` });

  // 2. 걸으면(위치가 바뀌면) 내 자리를 새로 잡는다 (너무 빠른 점프는 버린다: 초속 3m)
  const lat0 = await page.evaluate(() => JSON.parse(localStorage.getItem('ces2027.where.v1') || 'null')?.lat);
  await page.waitForTimeout(5500);
  await page.context().setGeolocation({ latitude: 36.13392, longitude: -115.1577, accuracy: 20 });
  await page.waitForFunction((l) => { const w = JSON.parse(localStorage.getItem('ces2027.where.v1') || 'null'); return w && Math.abs(w.lat - l) > 0.00005; }, lat0, { timeout: 20000 });
  check(true, '걸어서 위치가 바뀌면 내 자리를 새로 잡는다 (5초마다 확인)');
  await page.context().setGeolocation({ latitude: 40.0, longitude: -115.1577, accuracy: 20 });
  await page.waitForTimeout(6500);
  const lat1 = await page.evaluate(() => JSON.parse(localStorage.getItem('ces2027.where.v1') || 'null')?.lat);
  check(lat1 < 36.2, '갑자기 수십 km를 뛴 위치는 버린다 (내 자리가 튀지 않는다)');
  await page.context().setGeolocation({ latitude: 36.13392, longitude: -115.1577, accuracy: 20 });

  // 3. 손으로 끌면 따라오기가 멈춘다
  await page.evaluate(() => { const svg = document.querySelector('svg.map'); const r = svg.getBoundingClientRect(); const f = (t, x) => svg.dispatchEvent(new PointerEvent(t, { pointerId: 1, clientX: x, clientY: r.top + 300, bubbles: true, pointerType: 'touch', isPrimary: true })); f('pointerdown', r.left + 200); for (let i = 1; i <= 6; i++) f('pointermove', r.left + 200 - i * 12); f('pointerup', r.left + 128); });
  await page.waitForTimeout(700);
  const v1 = await api((m) => m.view.slice());
  await page.context().setGeolocation({ latitude: 36.13396, longitude: -115.15771, accuracy: 20 });
  await page.waitForTimeout(6500);
  const v2 = await api((m) => m.view.slice());
  check(Math.abs(v2[0] - v1[0]) < 1 && Math.abs(v2[1] - v1[1]) < 1, '손으로 끌면 지도가 그 자리에 남는다 (위치가 바뀌어도 끌려가지 않는다)');

  // 4. 도착: 목적지 가까이로 맞추면 "도착했다" + "봤다"
  const spot = await api((m) => m.nav.spot);
  await page.evaluate((s) => { localStorage.setItem('ces2027.where.v1', JSON.stringify({ by: 'booth', campus: 'lvcc', place: 'LVCC_N', code: '1', x: s.x + 4, z: s.z + 4, at: Date.now() })); }, spot);
  await api((m) => m.drawMe());
  text = await bar();
  check(text && text.includes('도착했다') && text.includes('봤다'), `목적지 가까이(30m 안)면 "도착했다"와 "봤다"가 나온다 (${(text || '').replace(/\n/g, ' · ')})`);
  await page.getByRole('button', { name: '끝내기' }).click();
  check((await bar()) === null || !(await bar()).includes('끝내기'), '끝내기를 누르면 안내 띠가 사라진다');

  // 5. 동선의 "다음 갈 곳": 관심 회사가 있으면 띠에서 바로 안내를 시작한다
  await page.evaluate((r) => { localStorage.setItem('ces2027.interests.v1', JSON.stringify([{ id: r.id, day: 1 }])); localStorage.removeItem('ces2027.where.v1'); }, row);
  await page.goto('about:blank');
  await page.goto(`${URL}#/map`);
  await page.waitForFunction(() => document.querySelectorAll('g[data-pin]').length === 1, null, { timeout: 15000 });
  await page.waitForTimeout(600);
  text = await bar();
  check(text && text.includes('다음 갈 곳') && text.includes(row.name) && text.includes('길 안내'), `관심 회사가 있으면 지도 아래 띠에 "다음 갈 곳"과 "길 안내"가 있다 (${(text || '').replace(/\n/g, ' · ')})`);
  await page.getByRole('button', { name: '길 안내', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.navbar').innerText.startsWith('→'), null, { timeout: 15000 });
  check(true, '"길 안내"를 누르면 그 회사로 안내가 시작된다');
  // 동선 탭의 "길 안내" 링크(#/map/go/<회사>)
  await page.goto('about:blank');
  await page.goto(`${URL}#/map/go/${encodeURIComponent(row.id)}`);
  await page.waitForFunction(() => document.querySelector('.navbar') && /^→/.test(document.querySelector('.navbar').innerText), null, { timeout: 15000 });
  check(true, '#/map/go/<회사> 주소로 오면 바로 길 안내가 시작된다');

  // 6. 폰이 라스베이거스 밖이면(서울) 띠가 그 까닭과 거리를 말하고 구글맵을 준다. 카드에는 "다른 캠퍼스"가 아니라 "전시장 밖" (폰 확인 2차 C · D)
  await page.evaluate(() => { localStorage.removeItem('ces2027.interests.v1'); localStorage.removeItem('ces2027.where.v1'); });
  await page.context().setGeolocation({ latitude: 37.5665, longitude: 126.978, accuracy: 30 });
  await page.goto('about:blank');
  await page.goto(`${URL}#/map/go/${encodeURIComponent(row.id)}`);
  await page.waitForFunction(() => /전시장 밖/.test(document.querySelector('.navbar')?.innerText || ''), null, { timeout: 15000 });
  text = await bar();
  const farLink = await page.locator('.navbar a', { hasText: '구글맵' }).getAttribute('href');
  check(/가장 가까운 전시장까지 약 [\d,]+km/.test(text) && text.includes('다시 잡기') && text.includes('끝내기') && /^https:\/\/www\.google\.com\/maps\/dir\//.test(farLink || ''), `라스베이거스 밖이면 띠에 "전시장 밖 · 거리"와 다시 잡기 · 구글맵 · 끝내기가 나온다 (${text.replace(/\n/g, ' · ')})`);
  const fits360 = await page.evaluate(() => { const n = document.querySelector('.navbar'); return document.documentElement.scrollWidth <= 360 && [...n.querySelectorAll('.btn')].every((b) => b.getBoundingClientRect().height >= 44 && b.scrollWidth <= b.clientWidth + 1); });
  check(fits360, '띠의 단추 셋이 360px 안에 들고 글자가 잘리지 않는다 (누르는 곳 44px 이상)');
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${SHOTS}98b-nav-far.png` });
  await page.getByRole('button', { name: '끝내기' }).click();
  await page.goto('about:blank');
  await page.goto(`${URL}#/map/at/${encodeURIComponent(row.id)}`);
  await page.locator('.sheet .card h2').waitFor({ timeout: 15000 });
  const way = await page.locator('.card-way').innerText();
  check(way.includes('전시장 밖이다') && !way.includes('다른 캠퍼스'), `카드의 "여기까지 길"도 "전시장 밖"이라고 말한다 (${way.split('\n')[1] || way})`);

  // 7. 위치를 거부하면 띠가 거부했다고 말한다 (예전에는 "내 위치를 먼저 잡는다"만 남았다)
  await page.evaluate(() => { localStorage.removeItem('ces2027.where.v1'); });
  await page.context().clearPermissions();
  await page.goto('about:blank');
  await page.goto(`${URL}#/map/go/${encodeURIComponent(row.id)}`);
  await page.waitForFunction(() => /^→/.test(document.querySelector('.navbar')?.innerText || ''), null, { timeout: 15000 });
  await page.getByRole('button', { name: '내 위치 잡기' }).click();
  await page.waitForFunction(() => /거부/.test(document.querySelector('.navbar')?.innerText || ''), null, { timeout: 15000 });
  check(true, '위치를 거부하면 띠에 "위치 권한을 거부했다"가 나온다');
  await page.context().grantPermissions(['geolocation']);
  await page.evaluate(() => { localStorage.removeItem('ces2027.interests.v1'); localStorage.removeItem('ces2027.where.v1'); });
  return checks.map((c) => `됨 | ${c.what}`).join('\n');
}
