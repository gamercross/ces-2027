// Playwright CLI test: 옛 판에서 새 판으로 넘어가기 (11/22 폰 확인 2차 A번: "다시 열기"를 누르면 "화면을 불러오지 못했다").
// Run with: node scripts/serve-update.mjs dist 47572          (시험용 서버: 옛 판을 주다가 /__switch에서 새 판을 준다)
//           playwright-cli open --browser=webkit about:blank  (이 고장은 WebKit · Safari에서 난다. Chromium으로도 돌릴 수 있다)
//           playwright-cli run-code "$(cat scripts/browser-update.mjs)"
// 고장의 까닭: WebKit은 화면을 다시 열 때 미리 받는 조각(app.js · store.js …)을 서비스 워커에 묻지 않고 메모리의 옛 것으로 쓴다.
//   새로 부르는 화면 조각(새 판)이 옛 조각을 만나 이름을 못 찾는다. 그래서 다시 열기 전에 새 파일을 한 번씩 받아 둔다(web/offline.js · index.html).
// 11/24부터 새 판은 받아만 두고 "다시 열기"를 누를 때만 쓴다(web/sw.js의 "쓰는 판"). 누르기 전에는 옛 화면에 옛 조각만 가서 섞이지 않는다.
// 세 길을 본다: ① 띠의 "다시 열기"(새 판으로) ② 누르지 않고 브라우저의 새로 고침(쓰던 판 그대로, 그 뒤에 누르면 새 판) ③ 누르지 않고 다른 탭(쓰던 판 그대로).
async (page) => {
  const URL = 'http://127.0.0.1:47572/';
  const checks = [];
  const check = (ok, what) => { checks.push({ ok: !!ok, what }); };
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)); });
  const state = () => page.evaluate(async () => ({
    fail: !!document.querySelector('#view [role="alert"]'),
    text: (document.querySelector('#view')?.innerText || '').slice(0, 24).replace(/\n/g, ' / '),
    band: !document.getElementById('update').hidden,
    v: await fetch('version.json').then((r) => r.json()).then((j) => j.v).catch(() => ''),
    caches: (await caches.keys()).filter((k) => k.startsWith('ces2027-2')).join(','),
  })).catch(() => null);
  // 화면이 자리 잡을 때까지(저절로 다시 여는 것까지) 기다린 뒤의 모습
  const settled = async (ms = 6000) => { let last = null; const end = Date.now() + ms; while (Date.now() < end) { await page.waitForTimeout(500); const s = await state(); if (s) last = s; } return last || {}; };
  const tabs = async (tag) => {
    for (const [t, ko] of [['plan', '갈 곳'], ['diary', '일기'], ['map', '지도'], ['settings', '설정']]) {
      await page.locator(`.tabs a[data-tab="${t}"]`).click();
      await page.waitForTimeout(1200);
      const s = await state();
      check(s && !s.fail, `${tag}: ${ko} 탭이 열린다${s?.fail ? ` — ${s.text}` : ''}`);
    }
  };
  // 옛 판을 열고 서비스 워커가 맡게 한 뒤, 새 판을 올리고 브라우저의 새로 고침을 한 번 한다 → "새 판이 있다" 띠
  const untilBand = async (tag) => {
    await page.request.get(`${URL}__reset`);
    await page.goto(`${URL}#/settings`);
    await page.evaluate(async () => {
      for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
      for (const k of await caches.keys()) await caches.delete(k);
      localStorage.clear(); sessionStorage.clear();
      localStorage.setItem('ces2027.profile.v1', JSON.stringify({ nick: '시험', tag: 'stu', line: '', github: '', discord: '' }));
    });
    await page.goto('about:blank');
    await page.goto(`${URL}#/settings`);
    await page.locator('.setlist').first().waitFor();
    let old = null;
    for (let i = 0; i < 40; i++) { old = await page.evaluate(async () => !!navigator.serviceWorker.controller && (await caches.keys()).some((k) => k.startsWith('ces2027-2'))); if (old) break; await page.waitForTimeout(500); }
    const before = await state();
    await page.request.get(`${URL}__switch`);
    await page.reload();
    await page.locator('#update:not([hidden])').waitFor({ timeout: 30000 });
    const s = await state();
    check(old && s.band && s.v === before.v && s.caches.includes('next'), `${tag}: 옛 판(${before.v})이 열려 있을 때 새 판을 받아 두고 "새 판이 있다" 띠가 뜬다. 쓰는 판은 그대로다(${s.v}) — 담음 ${s.caches}`);
  };

  await page.setViewportSize({ width: 390, height: 780 });

  // ① 띠의 "다시 열기"
  await untilBand('띠의 다시 열기');
  await page.locator('#update-go').click();
  let s = await settled();
  check(!s.fail && /설정/.test(s.text) && !s.band && s.v.includes('next'), `띠의 다시 열기: 누르면 새 판으로 설정 화면이 열린다("화면을 불러오지 못했다"가 아니다) — ${s.text} · 판 ${s.v}`);
  await tabs('띠의 다시 열기 뒤');

  // ② 띠를 누르지 않고 브라우저의 새로 고침: 쓰던 판 그대로 열리고 띠가 다시 뜬다. 그 뒤에 누르면 새 판.
  await untilBand('브라우저의 새로 고침');
  await page.reload();
  s = await settled();
  check(!s.fail && /설정/.test(s.text) && !s.v.includes('next') && s.band, `브라우저의 새로 고침: 누르기 전에는 쓰던 판 그대로 설정 화면이 열리고 띠가 다시 뜬다 — ${s.text} · 판 ${s.v}`);
  await tabs('브라우저의 새로 고침 뒤(쓰던 판)');
  await page.locator('#update-go').click();
  s = await settled();
  check(!s.fail && !s.band && s.v.includes('next') && !s.caches.includes(','), `새로 고침 뒤에 "다시 열기"를 누르면 새 판으로 열리고 옛 담음은 지워진다 — ${s.text} · 판 ${s.v}`);
  await tabs('새로 고침 뒤 다시 열기 뒤');

  // ③ 누르지 않고 다른 탭을 누름: 쓰던 판의 화면 조각이 와서 그대로 열린다(저절로 다시 열리지 않는다).
  await untilBand('다시 열지 않고 탭');
  await page.locator('.tabs a[data-tab="plan"]').click();
  s = await settled(3000);
  check(!s.fail && !s.v.includes('next') && s.band && (await page.evaluate(() => location.hash)) === '#/plan', `다시 열지 않고 탭: 갈 곳 탭이 쓰던 판 그대로 열리고 띠는 남아 있다 — ${s.text}`);
  await tabs('다시 열지 않고 탭 뒤');

  // 뒷정리: 시험용 서비스 워커와 담아 둔 것을 지운다
  await page.request.get(`${URL}__reset`);
  await page.evaluate(async () => { for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister(); for (const k of await caches.keys()) await caches.delete(k); localStorage.clear(); sessionStorage.clear(); });

  const failed = checks.filter((c) => !c.ok);
  if (failed.length) throw new Error(`안 됨 ${failed.length}개 / ${checks.length}개\n${failed.map((c) => `- ${c.what}`).join('\n')}\n콘솔 오류: ${[...new Set(errors)].slice(0, 4).join(' | ')}`);
  return { ok: true, count: checks.length, checks: checks.map((c) => c.what) };
}
