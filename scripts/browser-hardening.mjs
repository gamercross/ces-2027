// Playwright CLI test for R12, R21 and R24.
// Run with: playwright-cli open about:blank
//           playwright-cli run-code "$(cat scripts/browser-hardening.mjs)"
// The app must be served from a stamped dist at http://127.0.0.1:47130/.
async (page) => {
  const URL = 'http://127.0.0.1:47130/';
  const checks = [];
  const check = (ok, what) => {
    checks.push({ ok, what });
    if (!ok) throw new Error(`안 됨: ${what}`);
  };
  const context = page.context();
  await page.setViewportSize({ width: 360, height: 740 });
  await page.addInitScript(() => {
    localStorage.setItem('ces2027.eventBooths.v1', JSON.stringify({ 'LVCC_N|10000': { by: 'team' } }));
    localStorage.setItem('ces2027.where.v1', JSON.stringify({ by: 'booth', campus: 'lvcc', place: 'LVCC_N', code: '10000', x: 10, z: 10, at: 0 }));
    window.__geo = { watches: new Map(), cleared: [], next: 0 };
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
      getCurrentPosition(_success, error) { error({ code: 1 }); },
      watchPosition(success, error) { const id = ++window.__geo.next; window.__geo.watches.set(id, { success, error }); return id; },
      clearWatch(id) { window.__geo.cleared.push(id); window.__geo.watches.delete(id); },
    } });
    Object.defineProperty(window, 'Notification', { configurable: true, value: { permission: 'denied' } });
    window.__notificationCalls = [];
  });
  await page.route('**/data/exhibitors.json', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      ex: [
        ['fixture-start', '시험 시작 회사', '', -1, '', 0, '', ['10000@LVCC_N']],
        ['fixture-target', '시험 목적 회사', '', -1, '', 0, '', ['10100@LVCC_N']],
      ],
      catsKo: {},
      cats: {},
      countries: [],
      link: 'https://example.test/{id}',
    }),
  }));
  await page.goto(`${URL}#/map/at/fixture-target`);
  await page.getByRole('heading', { name: '부스 10100' }).waitFor();

  await page.getByRole('button', { name: '내 자리에서 길 보기' }).click();
  check(await page.locator('svg.map polyline[aria-label="홀 안 짐작 길"]').count() === 1,
    'R21: 부스까지의 홀 안 길을 짐작으로 그린다');

  await page.getByRole('button', { name: 'GPS로 찾기' }).click();
  await page.getByText('위치 권한을 거부했다. 브라우저 설정에서 허락하거나 부스 번호로 맞춘다.').waitFor();
  check(true, 'R12: 위치 권한을 거부하면 부스 번호로 맞추는 방법을 알린다');

  await page.getByRole('button', { name: '따라가기 켜기' }).click();
  const state = await page.evaluate(() => ({ id: window.__geo.next }));
  await page.evaluate((id) => window.__geo.watches.get(id).success({ coords: { latitude: 36.1324, longitude: -115.1523, accuracy: 400 } }), state.id);
  check(JSON.parse(await page.evaluate(() => localStorage.getItem('ces2027.where.v1'))).by === 'booth',
    'R12: 정확도가 낮은 위치는 저장하지 않는다');
  await page.evaluate((id) => window.__geo.watches.get(id).success({ coords: { latitude: 36.1324, longitude: -115.1523, accuracy: 20 } }), state.id);
  const accepted = await page.evaluate(() => localStorage.getItem('ces2027.where.v1'));
  check(JSON.parse(accepted).by === 'gps', 'R12: 정확도가 괜찮은 위치는 저장한다');
  await page.evaluate(() => { const now = Date.now; Date.now = () => now() + 21000; });
  await page.evaluate((id) => window.__geo.watches.get(id).success({ coords: { latitude: 36.2, longitude: -115.1, accuracy: 10 } }), state.id);
  check(await page.evaluate(() => localStorage.getItem('ces2027.where.v1')) === accepted,
    'R12: 갑자기 멀리 튄 위치는 저장하지 않는다');

  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  check(await page.evaluate((id) => window.__geo.cleared.includes(id), state.id),
    'R12: 화면이 뒤로 가면 위치 감시를 멈춘다');
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForFunction((id) => window.__geo.next > id, state.id);
  check(await page.getByRole('button', { name: '따라가기 끄기' }).count() === 1,
    'R12: 화면으로 돌아오면 따라가기를 다시 켠다');

  await page.waitForFunction(() => !!navigator.serviceWorker?.controller);
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    Object.defineProperty(reg, 'showNotification', {
      configurable: true,
      value: async (title) => { window.__notificationCalls.push(title); },
    });
  });
  await page.waitForFunction(() => document.querySelector('#notice')?.hidden === false);
  check((await page.locator('#notice-text').textContent()).includes('가까이에 명함 넣는 이벤트 부스'),
    'R24: 권한이 막혀도 가까운 이벤트 부스를 화면 띠로 알린다');
  await page.evaluate(async () => {
    Notification.permission = 'granted';
    const { checkAlerts } = await import('./notify.js');
    await Promise.all([checkAlerts(), checkAlerts()]);
    await checkAlerts();
    window.dispatchEvent(new Event('pageshow'));
    await checkAlerts();
  });
  check(await page.evaluate(() => window.__notificationCalls.length) === 1,
    'R24: 앱으로 돌아오거나 여러 번 확인해도 같은 알림을 하루에 한 번만 보낸다');
  const failedNotice = await page.evaluate(async () => {
    localStorage.setItem('ces2027.alerts.v1', '{}');
    const reg = await navigator.serviceWorker.ready;
    Object.defineProperty(reg, 'showNotification', {
      configurable: true,
      value: async () => { throw new Error('test notification failure'); },
    });
    const { alerts, checkAlerts } = await import('./notify.js');
    await checkAlerts();
    return { fallback: alerts.fallback, error: alerts.error };
  });
  check(failedNotice.fallback && failedNotice.error.includes('알림을 띄우지 못해')
    && await page.locator('#notice').isVisible()
    && (await page.locator('#notice-text').textContent()).includes('알림을 띄우지 못해'),
  'R24: 알림을 띄우지 못해도 오류와 함께 화면 띠로 알린다');

  await page.unroute('**/data/exhibitors.json');
  const client = await context.newCDPSession(page);
  await client.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: '지도' }).waitFor();
  check(await page.evaluate(async () => (await fetch('data/places.json')).ok),
    'R12 · R21: 받은 지도 자료와 앱 화면을 인터넷 없이 다시 연다');
  await client.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  return JSON.stringify(checks, null, 2);
}
