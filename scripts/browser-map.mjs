// Playwright CLI test for 다시 짓기 4단계: 지도 자세히. 360 x 740 · 390 x 780 폰 크기, 밝게.
// Run with: playwright-cli open about:blank
//           playwright-cli run-code "$(cat scripts/browser-map.mjs)"
// The app must be served from a stamped dist at http://127.0.0.1:47571/ (자료가 있는 지은 것, 홀 자료 data/halls/ 포함).
// SHOTS를 채우면(레포 바탕의 상대 경로) 지도 단계별 · 카드 · 찾기 그림을 그 폴더에 남긴다.
async (page) => {
  const URL = 'http://127.0.0.1:47571/';
  const SHOTS = 'docs/screens/';
  const checks = [];
  const info = [];
  const check = (ok, what) => {
    checks.push({ ok, what });
    if (!ok) throw new Error(`안 됨: ${what}`);
  };
  const api = (fn, arg) => page.evaluate(([src, a]) => { const m = document.querySelector('#view > .page').mapApi; return new Function('m', 'a', `return (${src})(m, a)`)(m, a); }, [fn.toString(), arg]);
  const shot = async (name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}${name}` }); };
  const settle = (ms = 900) => page.waitForTimeout(ms);
  // 글자 점검: 화면 안 글자의 크기(px)와 겹침
  const labelsReport = () => api((m) => {
    const svg = m.board; const r = svg.getBoundingClientRect(); const unit = (m.view[2] - m.view[0]) / r.width;
    const texts = [...svg.querySelectorAll('g[pointer-events="none"] text')].map((t) => { const b = t.getBoundingClientRect(); return { s: t.textContent, px: parseFloat(t.getAttribute('font-size')) / unit, x: b.x, y: b.y, w: b.width, h: b.height }; })
      .filter((b) => b.x >= r.left - 1 && b.x + b.w <= r.right + 1 && b.y >= r.top - 1 && b.y + b.h <= r.bottom + 1);
    let overlap = 0;
    for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) { const a = texts[i], b = texts[j]; if (a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5) overlap++; }
    return { n: texts.length, minPx: Math.round(Math.min(...texts.map((t) => t.px), 99) * 10) / 10, overlap, sample: texts.slice(0, 6).map((t) => t.s) };
  });
  const noSideScroll = async (what) => { const W = page.viewportSize().width; check(await page.evaluate((w) => document.documentElement.scrollWidth <= w, W), `${what}: ${W}px 폭에서 옆으로 밀리지 않는다`); };
  // 손짓 흉내(pointer 이벤트): 끌기 · 두 손가락 벌리기 · 두 번 톡
  const fire = (type, id, x, y) => page.evaluate(([t, i, px, py]) => document.querySelector('svg.map').dispatchEvent(new PointerEvent(t, { pointerId: i, clientX: px, clientY: py, bubbles: true, pointerType: 'touch', isPrimary: i === 1 })), [type, id, x, y]);
  const center = async () => { const b = await page.locator('svg.map').boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height * 0.55, b }; };

  await page.addInitScript(() => { localStorage.setItem('ces2027.theme.v1', JSON.stringify('light')); localStorage.setItem('ces2027.profile.v1', JSON.stringify({ nick: '시험', tag: 'stu', line: '', github: '', discord: '' })); });
  for (const [W, H] of [[360, 740], [390, 780]]) {
    await page.setViewportSize({ width: W, height: H });
    await page.goto(URL);
    await page.evaluate(async () => { for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister(); for (const k of await caches.keys()) await caches.delete(k); localStorage.removeItem('ces2027.interests.v1'); });
    await page.goto('about:blank');
    await page.goto(`${URL}#/map`);
    await page.locator('svg.map').waitFor();
    await settle(1800);
    const tag = `${W}px`;

    // 1. 캠퍼스 단계: 캠퍼스 이름 · 홀 이름, 13px 이상, 겹침 없음, 홀 칩 한 줄
    let lr = await labelsReport();
    check((await api((m) => m.level)) === 'campus' && lr.n >= 5 && lr.minPx >= 13 && lr.overlap === 0, `${tag} 캠퍼스 단계: 홀 · 캠퍼스 이름 ${lr.n}개, 가장 작은 글자 ${lr.minPx}px(13px 이상), 겹침 ${lr.overlap}`);
    const chipN = await page.locator('.chip-go').count();
    check(chipN >= 9 && (await page.locator('.chips').evaluate((n) => getComputedStyle(n).flexWrap === 'nowrap')) && (await page.locator('.mapx').evaluate((n) => n.getBoundingClientRect().height)) >= 440, `${tag} 위에 홀 칩 한 줄(${chipN}개)과 화면을 채우는 지도 칸`);
    await noSideScroll(`${tag} 캠퍼스 단계`);
    if (W === 360) await shot('91-after-campus.png');

    // 2. 홀 바로 가기 → 홀 단계: 홀 이름 · 큰 회사 이름
    await page.getByRole('button', { name: '노스', exact: true }).click();
    await settle(1500);
    lr = await labelsReport();
    check((await api((m) => m.level)) === 'hall' && lr.n >= 4 && lr.minPx >= 13 && lr.overlap === 0, `${tag} 홀 단계(노스 칩): 이름 ${lr.n}개 · ${lr.sample.slice(0, 3).join(' / ')} · 가장 작은 글자 ${lr.minPx}px · 겹침 ${lr.overlap}`);
    check((await page.evaluate(() => performance.getEntriesByType('resource').some((r) => /data\/halls\/LVCC_N\.json/.test(r.name)))), `${tag} 노스 홀로 가까이 가자 그 홀의 자료(data/halls/LVCC_N.json)만 받았다`);
    check(!(await page.evaluate(() => performance.getEntriesByType('resource').some((r) => /data\/exhibitors\.json/.test(r.name)))), `${tag} 전시사 전체 자료는 아직 받지 않았다`);
    await noSideScroll(`${tag} 홀 단계`);
    await shot(W === 360 ? '92-after-hall.png' : '96-after-hall-390.png');

    // 3. 두 번 톡 → 부스 단계: 부스 번호 + 회사 이름
    const c = await center();
    const w0 = await api((m) => m.view[2] - m.view[0]);
    await fire('pointerdown', 1, c.x, c.y); await fire('pointerup', 1, c.x, c.y);
    await page.waitForTimeout(90);
    await fire('pointerdown', 1, c.x, c.y); await fire('pointerup', 1, c.x, c.y);
    await settle(1300);
    const w1 = await api((m) => m.view[2] - m.view[0]);
    lr = await labelsReport();
    check(w1 < w0 * 0.6 && (await api((m) => m.level)) === 'booth' && lr.n >= 4 && lr.minPx >= 13 && lr.overlap === 0 && lr.sample.some((s) => /\d{4,5}/.test(s)), `${tag} 두 번 톡으로 부스 단계: 부스 번호와 회사 이름 ${lr.n}개 · ${lr.sample.slice(0, 2).join(' / ')} · 가장 작은 글자 ${lr.minPx}px · 겹침 ${lr.overlap}`);
    if (W === 360) await shot('93-after-booth.png');

    // 4. 한 손가락 끌기 · 두 손가락 벌리기
    const c0 = await api((m) => [(m.view[0] + m.view[2]) / 2, (m.view[1] + m.view[3]) / 2]);
    const wBefore = await api((m) => m.view[2] - m.view[0]);
    await fire('pointerdown', 1, c.x, c.y);
    for (let i = 1; i <= 8; i++) await fire('pointermove', 1, c.x - i * 10, c.y);
    await fire('pointerup', 1, c.x - 80, c.y);
    await settle(500);
    const c1 = await api((m) => [(m.view[0] + m.view[2]) / 2, (m.view[1] + m.view[3]) / 2]);
    const wAfter = await api((m) => m.view[2] - m.view[0]);
    check(c1[0] - c0[0] > 20 && Math.abs(wAfter - wBefore) < 1, `${tag} 한 손가락 끌기: 지도가 손가락 반대로 ${Math.round(c1[0] - c0[0])}칸 움직이고 크기는 그대로다`);
    await fire('pointerdown', 1, c.x - 30, c.y); await fire('pointerdown', 2, c.x + 30, c.y);
    for (let i = 1; i <= 6; i++) { await fire('pointermove', 1, c.x - 30 - i * 8, c.y); await fire('pointermove', 2, c.x + 30 + i * 8, c.y); }
    await fire('pointerup', 1, c.x - 80, c.y); await fire('pointerup', 2, c.x + 80, c.y);
    await settle(500);
    const wPinch = await api((m) => m.view[2] - m.view[0]);
    check(wPinch < wAfter * 0.75, `${tag} 두 손가락 벌리기: 칸 너비 ${Math.round(wAfter)} → ${Math.round(wPinch)} (가까이)`);

    // 5. 부스 점을 누르면 아래에서 카드가 올라온다 (자리 짐작 · 관심 · 동선 · 길)
    await api((m) => m.fit(m.pad([m.L.list.find((p) => p.k === 'LVCC_N').world[0][0] + 60, m.L.list.find((p) => p.k === 'LVCC_N').world[0][1] + 10, m.L.list.find((p) => p.k === 'LVCC_N').world[0][0] + 220, m.L.list.find((p) => p.k === 'LVCC_N').world[0][1] + 140], 0)));
    await settle(1300);
    const dot = await api((m) => {
      const r = m.board.getBoundingClientRect();
      const one = [...document.querySelectorAll('circle[data-key]')].map((c) => ({ c, key: c.dataset.key })).filter((d) => (m.boothEx.get(d.key) || []).length === 1);
      for (const d of one) { const b = d.c.getBoundingClientRect(); if (b.y > r.top + 150 && b.y < r.bottom - 330 && b.x > r.left + 20 && b.x < r.right - 70) return { x: b.x + b.width / 2, y: b.y + b.height / 2, key: d.key, name: m.boothEx.get(d.key)[0][1] }; }
      return null;
    });
    check(!!dot, `${tag} 눌러 볼 부스 점이 있다`);
    await page.mouse.click(dot.x, dot.y);
    await page.locator('.sheet .card h2').waitFor();
    await settle(900);
    const cardInfo = await page.evaluate(() => ({ h2: document.querySelector('.sheet .card h2').textContent, state: document.querySelector('.sheet').dataset.state, text: document.querySelector('.sheet').innerText, h2px: parseFloat(getComputedStyle(document.querySelector('.sheet .card h2')).fontSize), sheetH: Math.round(document.querySelector('.sheet').getBoundingClientRect().height), mapH: Math.round(document.querySelector('.mapx').getBoundingClientRect().height) }));
    check(cardInfo.h2 === dot.name && cardInfo.state === 'half' && cardInfo.text.includes('자리 짐작') && cardInfo.text.includes('관심 담기') && cardInfo.text.includes('동선에 넣기') && cardInfo.text.includes('여기까지 길') && cardInfo.text.includes('공식 링크') && cardInfo.h2px >= 24, `${tag} 부스를 누르면 반쯤 올라온 카드: ${cardInfo.h2}(${cardInfo.h2px}px) · 부스 · 홀 · 자리 짐작 · 관심 · 동선 · 길 · 공식 링크`);
    const spotShown = await page.evaluate(() => { const s = document.querySelector('.sheet').getBoundingClientRect(); const d = document.querySelector('circle[data-key].on, circle[data-key]'); const b = [...document.querySelectorAll('circle[data-key]')].map((c) => c.getBoundingClientRect()).filter((r2) => r2.y > 120 && r2.y < s.top - 10); return b.length; });
    check(spotShown > 0, `${tag} 카드가 올라와도 위의 지도에 부스 점이 보인다 (${spotShown}개)`);
    await noSideScroll(`${tag} 카드`);
    await shot(W === 360 ? '94-after-card.png' : '97-after-card-390.png');

    // 6. 카드 끌어올림 · 관심 · 동선에 넣기
    await page.locator('.sheet-grip').click();
    await page.waitForTimeout(400);
    check((await page.locator('.sheet').getAttribute('data-state')) === 'full', `${tag} 손잡이를 누르면 끝까지 올라온다`);
    await page.locator('.sheet-grip').click();
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: '관심 담기' }).click();
    await page.getByRole('button', { name: /6일에 동선으로 넣기|1\/6.*동선으로 넣기/ }).first().click().catch(() => {});
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('ces2027.interests.v1') || '[]'));
    check(stored.length === 1 && stored[0].day >= 0, `${tag} 관심 담기 · 동선에 넣기가 폰에 남는다 (${JSON.stringify(stored[0] || null)})`);
    await page.waitForTimeout(500);
    check((await page.locator('g[data-pin]').count()) === 1, `${tag} 동선에 넣은 회사에 번호 점이 찍힌다`);

    // 7. 손잡이를 아래로 끌면 닫힌다
    await page.evaluate(() => { const g = document.querySelector('.sheet-grip'); const r = g.getBoundingClientRect(); const f = (t, y) => g.dispatchEvent(new PointerEvent(t, { pointerId: 5, clientX: r.x + 20, clientY: y, bubbles: true })); f('pointerdown', r.y + 10); f('pointermove', r.y + 120); f('pointermove', r.y + 260); f('pointerup', r.y + 260); });
    await page.waitForTimeout(500);
    check((await page.locator('.sheet').getAttribute('data-state')) === 'closed', `${tag} 손잡이를 아래로 끌면 카드가 닫힌다`);

    // 8. 찾기: 이름으로 찾아 고르면 그 부스로 날아가 카드가 열린다
    await page.locator('.find-field input').fill('1NCE');
    await page.locator('.results .result').first().waitFor({ timeout: 8000 });
    const hit = await page.locator('.results .result').first().innerText();
    if (W === 360) await shot('95-after-search.png');
    await page.locator('.results .result').first().click();
    await page.locator('.sheet .card h2').waitFor();
    await settle(1300);
    check((await page.locator('.sheet .card h2').innerText()).includes('1NCE') && (await api((m) => m.level)) === 'booth', `${tag} 찾기: "1NCE" → ${hit.replace(/\n/g, ' · ')} → 그 부스로 날아가 카드가 열린다`);
    // 부스 번호로 찾기
    await page.locator('.find-field input').fill('14731');
    await page.locator('.results .result').first().waitFor({ timeout: 8000 });
    check((await page.locator('.results .result').first().innerText()).includes('1NCE'), `${tag} 부스 번호(14731)로 찾으면 그 회사가 나온다`);
    await page.locator('.find-field input').fill('');
  }

  // 8b. 내 동선: 같은 날 회사 둘이면 번호 점 둘과 차례대로 이은 선
  const two = await page.evaluate(async () => { const d = await (await fetch('data/exhibitors.json')).json(); return d.ex.filter((r) => r[7].length && /@LVCC_N$/.test(r[7][0])).slice(0, 2).map((r) => ({ id: r[0], name: r[1] })); });
  await page.evaluate((two2) => localStorage.setItem('ces2027.interests.v1', JSON.stringify(two2.map((x) => ({ id: x.id, day: 1 })))), two);
  await page.goto('about:blank');
  await page.goto(`${URL}#/map`);
  await page.locator('svg.map').waitFor();
  await page.waitForFunction(() => document.querySelectorAll('g[data-pin]').length === 2, null, { timeout: 15000 });
  const lines2 = await page.evaluate(() => ({ pins: [...document.querySelectorAll('g[data-pin] text')].map((x) => x.textContent), lines: document.querySelectorAll('svg.map polyline[stroke-linecap="round"]').length, chip: [...document.querySelectorAll('.chip-go')].some((c) => c.textContent === '내 동선') }));
  check(lines2.pins.join() === '1,2' && lines2.lines >= 1 && lines2.chip, `내 동선: 번호 점 ${lines2.pins.join('·')}과 선 ${lines2.lines}줄, 칩에 "내 동선"이 생긴다`);
  await page.getByRole('button', { name: '내 동선', exact: true }).click();
  await settle(1500);
  const nm = await labelsReport();
  check(nm.sample.length > 0 && nm.minPx >= 13 && nm.overlap === 0, `"내 동선" 칩: 관심 회사 이름이 늘 보인다 (${nm.sample.slice(0, 2).join(' / ')})`);
  // 8c. 다른 화면의 "지도" 링크(#/map/at/<회사>)로 오면 그 회사 카드가 열린다
  await page.goto('about:blank');
  await page.goto(`${URL}#/map/at/${encodeURIComponent(two[1].id)}`);
  await page.locator('.sheet .card h2').waitFor({ timeout: 15000 });
  check((await page.locator('.sheet .card h2').innerText()) === two[1].name, '다른 화면의 "지도" 링크로 오면 그 회사 카드가 열린다');
  await page.evaluate(() => localStorage.removeItem('ces2027.interests.v1'));

  // 9. 3D 단추 하나로 그때 불러온다, 다시 누르면 2D (카드를 닫으면 오른쪽 단추가 나온다)
  await api((m) => m.sheet.close());
  await settle(400);
  await page.getByRole('button', { name: /3D 지도/ }).click();
  await page.locator('.map-frame canvas').waitFor({ timeout: 15000 });
  check((await page.locator('.chips').count()) === 1 && (await page.locator('.ctl-wide').innerText()) === '2D', '3D 단추를 누르면 3D가 열리고 위 찾기 칸 · 홀 칩은 그대로다');
  await page.getByRole('button', { name: /2D 지도로/ }).click();
  await page.locator('svg.map').waitFor();
  check(true, '2D 단추로 돌아온다');

  // 10. 끌기 · 확대가 부드러운가: CPU 4배 느리게 한 프레임 간격
  const client = await page.context().newCDPSession(page);
  await client.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await api((m) => m.fit(m.pad(m.L.list.find((p) => p.k === 'LVCC_S3').world.reduce((b, [x, z]) => [Math.min(b[0], x), Math.min(b[1], z), Math.max(b[2], x), Math.max(b[3], z)], [1e9, 1e9, -1e9, -1e9]), 20)));
  await settle(1500);
  const frames = await page.evaluate(async () => {
    const svg = document.querySelector('svg.map'); const r = svg.getBoundingClientRect();
    const fire = (t, y, x) => svg.dispatchEvent(new PointerEvent(t, { pointerId: 1, clientX: x, clientY: y, bubbles: true, pointerType: 'touch', isPrimary: true }));
    const gaps = []; let last = performance.now(); let n = 0;
    fire('pointerdown', r.top + 300, r.left + 250);
    await new Promise((res) => { const step = (now) => { gaps.push(now - last); last = now; fire('pointermove', r.top + 300, r.left + 250 - n * 3); n += 1; if (n < 50) requestAnimationFrame(step); else res(); }; requestAnimationFrame(step); });
    fire('pointerup', r.top + 300, r.left + 100);
    gaps.sort((a, b) => a - b);
    return { median: Math.round(gaps[Math.floor(gaps.length / 2)]), p95: Math.round(gaps[Math.floor(gaps.length * 0.95)]) };
  });
  await client.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  check(frames.p95 <= 50, `끌기(CPU 4배 느리게, 부스 점이 가득한 홀): 프레임 간격 중앙값 ${frames.median}ms · 95% ${frames.p95}ms`);
  return checks.map((c) => `됨 | ${c.what}`).join('\n');
}
