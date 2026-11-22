// 첫 화면 시간을 잰다 (R11). playwright-cli의 run-code로 돌린다:
//   playwright-cli open about:blank
//   playwright-cli run-code "$(cat scripts/measure.mjs)"
// 주소는 아래 URL을 고친다. 지은 것(판 이름을 찍은 dist)을 gzip으로 내주는 서버가 떠 있어야 한다.
//
// 조건: 폰 크기 360x740 · CPU 4배 느리게 · 느린 4G(받기 1.6Mbps · 올리기 750kbps · 지연 150ms) · 캐시 끔.
// 재는 것: 첫 그림(FCP)과 "화면이 다 그려진 때"(명함 적는 칸이나 지도가 나타난 때).
async (page) => {
  const URL = 'http://127.0.0.1:47130/';
  const RUNS = 5;
  const SLOW_4G = { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 };
  const client = await page.context().newCDPSession(page);
  await client.send('Network.enable');
  await page.setViewportSize({ width: 360, height: 740 });
  await page.addInitScript(() => {
    window.__t = {};
    new PerformanceObserver((list) => { for (const e of list.getEntries()) if (e.name === 'first-contentful-paint') window.__t.fcp = e.startTime; }).observe({ type: 'paint', buffered: true });
    const seen = () => {
      if (!window.__t.view && document.querySelector('#view form.form, #view svg.map')) window.__t.view = performance.now();
    };
    new MutationObserver(seen).observe(document, { childList: true, subtree: true });
  });
  const origin = new URL_(URL).origin;
  function URL_(u) { const m = u.match(/^(https?:\/\/[^/]+)/); return { origin: m[1] }; }
  const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

  async function once({ profile, offline }) {
    if (!offline) {
      // 처음 여는 폰처럼: 서비스 워커와 담아 둔 것을 지운다.
      await client.send('Storage.clearDataForOrigin', { origin, storageTypes: 'service_workers,cache_storage' });
      await client.send('Network.clearBrowserCache');
    }
    await client.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await client.send('Network.emulateNetworkConditions', offline ? { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 } : SLOW_4G);
    await client.send('Network.setCacheDisabled', { cacheDisabled: !offline });
    await page.goto('about:blank');
    await page.goto(URL + (profile ? '#/' : ''), { waitUntil: 'commit' });
    await page.waitForFunction(() => window.__t && window.__t.view && window.__t.fcp, null, { timeout: 30000 });
    await page.waitForTimeout(400);
    return page.evaluate(() => {
      const res = performance.getEntriesByType('resource');
      return { fcp: Math.round(window.__t.fcp), view: Math.round(window.__t.view), requests: res.length + 1, kb: Math.round((res.reduce((a, r) => a + (r.transferSize || 0), 0) + (performance.getEntriesByType('navigation')[0]?.transferSize || 0)) / 102.4) / 10, screen: location.hash || '#/', h1: document.querySelector('#view h1')?.textContent };
    });
  }
  async function many(label, opt) {
    const runs = [];
    for (let i = 0; i < RUNS; i++) runs.push(await once(opt));
    return { label, fcp: median(runs.map((r) => r.fcp)), view: median(runs.map((r) => r.view)), worst: Math.max(...runs.map((r) => r.view)), requests: runs[0].requests, kb: runs[0].kb, screen: runs[0].screen, h1: runs[0].h1 };
  }

  const out = [];
  // 1. 처음 여는 사람: 폰에 아무것도 없다 → 명함 적는 화면.
  await client.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await client.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await page.goto(URL);
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  out.push(await many('처음 여는 사람 (명함 적는 화면)', { profile: false }));
  // 2. 명함이 있는 사람이 새 폰 · 지운 브라우저로 여는 때 → 첫 화면(지도).
  await page.evaluate(() => localStorage.setItem('ces2027.profile.v1', JSON.stringify({ nick: '시험', tag: 'stu', line: '', github: '', discord: '' })));
  out.push(await many('명함이 있는 사람 (지도)', { profile: true }));
  // 3. 두 번째 열기: 서비스 워커가 다 담은 뒤, 네트워크를 끊고 연다.
  await client.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await client.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await client.send('Network.setCacheDisabled', { cacheDisabled: false });
  await page.goto(URL + '#/');
  await page.waitForFunction(async () => { const reg = await navigator.serviceWorker.ready; const keys = await caches.keys(); return !!reg.active && keys.length > 0 && !!navigator.serviceWorker.controller; }, null, { timeout: 30000 });
  out.push(await many('두 번째 열기 (네트워크 없음)', { profile: true, offline: true }));
  await client.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await client.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  return JSON.stringify(out, null, 1);
}
