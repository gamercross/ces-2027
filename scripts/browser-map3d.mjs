// Playwright CLI test for 3D 지도: 그 날 차례 선 · 다음에 갈 곳 이름 · 누른 곳 = 열리는 카드.
// 360 x 740 · 390 x 780, 밝게 · 어둡게, 글자 네 단계.
// Run with: playwright-cli open about:blank
//           playwright-cli run-code "$(cat scripts/browser-map3d.mjs)"
// The app must be served from a stamped dist at http://127.0.0.1:47571/ (자료가 있는 지은 것, 홀 자료 data/halls/ 포함).
// SHOTS를 채우면(레포 바탕의 상대 경로) 3D 그림을 그 폴더에 남긴다.
async (page) => {
  const URL = 'http://127.0.0.1:47571/';
  const SHOTS = '';
  const checks = [];
  const check = (ok, what) => { checks.push({ ok, what }); if (!ok) throw new Error(`안 됨: ${what}`); };
  const shot = async (name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}${name}` }); };
  const three = (fn, arg) => page.evaluate(([src, a]) => { const t = document.querySelector('#view > .page').three; return new Function('t', 'a', `return (${src})(t, a)`)(t, a); }, [fn.toString(), arg]);
  const api = (fn, arg) => page.evaluate(([src, a]) => { const m = document.querySelector('#view > .page').mapApi; return new Function('m', 'a', `return (${src})(m, a)`)(m, a); }, [fn.toString(), arg]);
  const settle = (ms = 500) => page.waitForTimeout(ms);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const canvasBox = () => page.locator('canvas.map').boundingBox();
  const tapAt = async (x, y) => { const b = await canvasBox(); await page.mouse.click(b.x + x, b.y + y); await settle(700); };
  const sheet = () => page.evaluate(() => { const s = document.querySelector('.sheet'); return { state: s.dataset.state, title: s.querySelector('h2')?.innerText || '', where: s.querySelector('.card-where')?.innerText || '' }; });
  const closeSheet = async () => { if ((await sheet()).state !== 'closed') { await page.locator('.sheet').getByRole('button', { name: '닫기' }).click(); await settle(500); } };
  // 보이는 칸(위 찾기 칸 아래 ~ 아래 띠 위, 오른쪽 단추 밖)을 8px 간격으로 훑어 조건에 맞는 자리를 찾는다.
  const findSpot = (kind) => three((t, k) => {
    const { band } = t.labelsOnScreen();
    for (let y = band[0] + 8; y < band[1] - 8; y += 8) for (let x = 12; x < t.node.clientWidth - 70; x += 8) {
      const w = t.whatAt(x, y);
      if (k === 'campus' && w.kind === 'campus') return { x, y, ...w };
      if (k === 'floor-none' && w.kind === null && w.floor) return { x, y, ...w };
      if (k === 'none' && w.kind === null && !w.floor) return { x, y, ...w };
      if (k === 'place' && w.kind === 'place') return { x, y, ...w };
    }
    return null;
  }, kind);
  // 캔버스의 한 점 색 (r, g, b)
  const pixel = (x, y) => page.evaluate(([px, py]) => { const c = document.querySelector('canvas.map'); const k = c.width / c.clientWidth; return [...c.getContext('2d').getImageData(Math.round(px * k), Math.round(py * k), 1, 1).data].slice(0, 3); }, [x, y]);
  const token = (name) => page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);
  const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const px = (n) => Math.round(n * 10) / 10;
  const far = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));
  const overlaps = (rects) => { let n = 0; for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) { const a = rects[i], b = rects[j]; if (a[0] < b[2] - 0.5 && b[0] < a[2] - 0.5 && a[1] < b[3] - 0.5 && b[1] < a[3] - 0.5) n++; } return n; };

  // 앞서 돈 시험이 남긴 것을 지운다: 위치 허락(남아 있으면 내 자리가 GPS로 바뀐다. 이 시험은 부스 번호로 맞춘 자리만 쓴다) · 끊어 둔 인터넷.
  await page.context().clearPermissions();
  await page.context().setOffline(false);
  // 시험용 갈 곳: 1/6에 노스 · 센트럴 홀 다섯, 1/7에 베네시안 둘 (편의성 점검과 같은 꼴에 다른 날 선을 보려고 하나 더).
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto(URL);
  const seed = await page.evaluate(async () => {
    const d = await (await fetch('data/exhibitors.json')).json();
    const by = (name, hall) => d.ex.find((x) => x[1] === name && x[7][0]) || d.ex.find((x) => new RegExp(`^\\d+@${hall}$`).test(x[7][0] || ''));
    const day1 = [by('1NCE', 'LVCC_N'), by('Dennisson Technologies', 'LVCC_N'), by('3M', 'LVCC_N'), by('2Pi', 'LVCC_C'), by('Bosch', 'LVCC_C')];
    const day2 = d.ex.filter((x) => /^\d+@VEN_G$/.test(x[7][0] || '')).slice(0, 2);
    return { list: [...day1.map((r) => ({ id: r[0], day: 1 })), ...day2.map((r) => ({ id: r[0], day: 2 }))], names: day1.map((r) => r[1]), first: { id: day1[0][0], name: day1[0][1], booth: day1[0][7][0] }, me: day1[2][7][0] };
  });
  const open3d = async ({ theme = 'light', text = 1, w = 360, h = 740, where = null, hash = '#/map/day/1' } = {}) => {
    await page.setViewportSize({ width: w, height: h });
    await page.goto(URL);
    await page.evaluate(async ([s, th, tx, wh]) => {
      for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
      for (const k of await caches.keys()) await caches.delete(k);
      localStorage.setItem('ces2027.theme.v1', JSON.stringify(th));
      localStorage.setItem('ces2027.text.v1', JSON.stringify(tx));
      localStorage.setItem('ces2027.profile.v1', JSON.stringify({ nick: '시험', tag: 'stu', line: '', github: '', discord: '' }));
      localStorage.setItem('ces2027.interests.v1', JSON.stringify(s));
      if (wh) localStorage.setItem('ces2027.where.v1', JSON.stringify(wh)); else localStorage.removeItem('ces2027.where.v1');
      try { sessionStorage.removeItem('ces2027.planDay'); } catch { /* 없어도 된다 */ }
    }, [seed.list, theme, text, where]);
    await page.goto('about:blank');
    await page.goto(`${URL}${hash}`);
    await page.locator('svg.map').waitFor();
    await page.waitForFunction(() => document.querySelectorAll('svg.map [data-pin]').length >= 7, null, { timeout: 15000 });
    await settle(1200);
    await page.getByRole('button', { name: /3D 지도/ }).click();
    await page.locator('canvas.map').waitFor();
    await settle(600);
  };
  // 3D 화면 하나를 잰다: 그 날 번호 다섯이 보이는 칸 안에, 차례 선이 번호 차례로, 다음 곳 이름이 읽히게, 글자 13px 이상 · 겹침 없음.
  const measure = async (tag) => {
    const s = await three((t) => ({ pins: t.pinsOnScreen(), lines: t.linesOnScreen(), l: t.labelsOnScreen(), w: t.node.clientWidth, h: t.node.clientHeight }));
    const day = s.pins.filter((p) => seed.list.slice(0, 5).some((it) => it.id === p.id));
    const inBand = day.every((p) => p.sx - p.r >= 0 && p.sx + p.r <= s.w && p.sy - p.r >= s.l.band[0] - 1 && p.sy + p.r <= s.l.band[1] + 1);
    check(day.length === 5 && inBand, `${tag} 3D를 켜면 2D에서 보던 그 날의 번호 다섯이 모두 보이는 칸(찾기 칸 아래 ~ 아래 띠 위) 안에 있다`);
    const today = s.lines.filter((l) => l.today);
    check(today.length === 1 && today[0].pts.length === 5 && !today[0].dash && today[0].width === 4, `${tag} 그 날 차례 선이 하나, 다섯 곳을 잇는 굵은 실선이다 (2D와 같은 굵기)`);
    // 선의 꺾이는 점이 번호 차례(1 → 5)의 번호가 꽂힌 자리에 있다
    const order = seed.list.slice(0, 5).map((it) => s.pins.find((p) => p.id === it.id));
    // 가까이 꽂힌 번호 원은 서로 비켜 줄기가 기울 수 있다(R67): 선은 줄기가 꽂힌 자리를 지나고, 원은 그 자리에서 멀지 않다.
    check(today[0].pts.every(([x, y], i) => Math.abs(x - order[i].bx) < 1 && Math.abs(y - order[i].by) < 1 && Math.hypot(order[i].sx - order[i].bx, order[i].sy - order[i].by) < 120 && order[i].sy < order[i].by), `${tag} 선은 번호 1 → 5 차례로 번호가 꽂힌 자리를 지난다`);
    // 실제로 그려졌나: 선 위의 점들(구간마다 셋)의 색이 강조색에 가깝다. 번호 원 · 글자에 가린 점이 있어 절반 넘게 맞으면 된다.
    const accent = rgb(await token('--accent'));
    let on = 0, all = 0;
    for (let i = 1; i < today[0].pts.length; i++) for (const f of [0.35, 0.5, 0.65]) {
      const [a, b] = [today[0].pts[i - 1], today[0].pts[i]];
      all += 1;
      if (far(await pixel(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f), accent) <= 28) on += 1;
    }
    check(on / all > 0.5, `${tag} 차례 선이 강조색으로 그려져 있다 (선 위의 점 ${all}개 가운데 ${on}개가 강조색 ${accent.join(',')})`);
    check(s.l.next === seed.first.name.slice(0, 16) && !!s.l.nextRect && s.l.nextRect[0] >= 0 && s.l.nextRect[2] <= s.w && s.l.nextRect[1] >= s.l.band[0] && s.l.nextRect[3] <= s.l.band[1] && s.l.nextSize >= 13,
      `${tag} 다음에 갈 곳 이름 "${s.l.next}"이 보이는 칸 안에 ${px(s.l.nextSize)}px로 놓였다`);
    const rects = [...s.l.labels.map((x) => x.rect), s.l.nextRect];
    const minPx = Math.min(...s.l.labels.map((x) => x.size), s.l.nextSize);
    const names = s.l.labels.filter((x) => x.id.startsWith('n:')).map((x) => x.text);
    check(minPx >= 13 && overlaps(rects) === 0, `${tag} 글자 ${rects.length}개 · 가장 작은 글자 ${px(minPx)}px(13px 이상) · 겹침 ${overlaps(rects)}`);
    // 360px · 글자 4단계만 둘: 아래 카드가 올라와 글자를 놓을 칸이 140px쯤이고, 실제 크기의 노스 홀에 갈 곳 셋이 붙어 있다(번호는 다 보이고 다음 곳 이름은 남는다, R67).
    check(names.length >= (tag === '360 글자 4단계' ? 2 : 3), `${tag} 나머지 갈 곳 이름이 ${names.length}개 보인다 (${names.join(' / ')})`);
    // 번호 원과 글자가 겹치지 않는다
    const pinRects = s.pins.map((p) => [p.sx - p.r, p.sy - p.r, p.sx + p.r, p.sy + p.r]);
    const hit = rects.filter((r) => pinRects.some((p) => r[0] < p[2] - 0.5 && p[0] < r[2] - 0.5 && r[1] < p[3] - 0.5 && p[1] < r[3] - 0.5)).length;
    check(hit === 0, `${tag} 글자가 번호 원을 가리지 않는다`);
    const W = page.viewportSize().width;
    check(await page.evaluate((w) => document.documentElement.scrollWidth <= w, W), `${tag} ${W}px 폭에서 옆으로 밀리지 않는다`);
    return s;
  };

  // ---- 1. 360px 밝게: 차례 선 · 이름
  await open3d();
  await measure('360 밝게');
  await shot('221-map3d-day-360.png');

  // ---- 2. 누른 곳 = 열리는 카드
  // 2-1. 화면 가운데 둘레(편의성 점검에서 "베네시안 캠퍼스"가 뜨던 곳): 손가락 아래의 홀이 열린다
  let b = await canvasBox();
  // 가운데에 번호 점(갈 곳)이 서 있으면 그 회사가 열리는 것이 맞다. 가운데에서 가장 가까운, 홀이 서 있는 곳을 누른다(실제 좌표로 바꾼 뒤 R66).
  const midAt = await three((t, [w, h]) => { for (let r = 0; r <= 120; r += 12) for (let k = 0; k < 8; k += 1) { const x = w / 2 + r * Math.cos((k * Math.PI) / 4), y = h / 2 + r * Math.sin((k * Math.PI) / 4); if (t.whatAt(x, y).kind === 'place') return [x, y]; } return [w / 2, h / 2]; }, [b.width, b.height]);
  const mid = await three((t, [x, y]) => t.whatAt(x, y), midAt);
  await tapAt(midAt[0], midAt[1]);
  let sh = await sheet();
  const midKo = mid.kind === 'place' ? await api((m, k) => m.L.list.find((p) => p.k === k).ko, mid.name) : '';
  check(mid.kind === 'place' && sh.state !== 'closed' && midKo.includes(sh.title) && !sh.title.includes('캠퍼스'), `가운데를 누르면 손가락 아래의 홀 "${sh.title}" 카드가 열린다 (다른 캠퍼스 카드가 아니다)`);
  await shot('222-map3d-tap-hall-360.png');
  await closeSheet();
  // 2-2. 갈 곳 번호를 누르면 그 회사 카드
  await page.getByRole('button', { name: '내 갈 곳', exact: true }).click();
  await settle(600);
  let pin = await three((t, id) => t.pinsOnScreen().find((p) => p.id === id), seed.first.id);
  await tapAt(pin.sx, pin.sy);
  sh = await sheet();
  check(sh.state !== 'closed' && sh.title === seed.first.name, `번호 1을 누르면 그 회사 "${sh.title}" 카드가 열린다`);
  await closeSheet();
  // 2-3. 가까이 본 채 홀 밖 바닥을 누르면 아무것도 열리지 않는다(캠퍼스 카드는 멀리 볼 때만)
  await page.getByRole('button', { name: '노스', exact: true }).click();
  await settle(600);
  let spot = await findSpot('floor-none');
  check(!!spot && (await three((t) => t.cam.span)) < 1300, `홀을 가까이 볼 때 홀 밖 바닥(${spot?.floor})은 누를 것이 아니다`);
  await tapAt(spot.x, spot.y);
  check((await sheet()).state === 'closed' && (await page.locator('canvas.map').getAttribute('data-tap')) === 'none', '가까이 본 채 바닥을 눌러도 캠퍼스 카드가 뜨지 않는다');
  // 2-4. 부스 점: 가까이 가서 점을 누르면 그 부스의 회사
  await page.getByRole('button', { name: '크게' }).click();
  await page.getByRole('button', { name: '크게' }).click();
  await settle(500);
  const dot = await three((t) => { const { band } = t.labelsOnScreen(); return t.boothsOnScreen().find((d) => /\|\d+$/.test(d.key) && d.sx > 20 && d.sx < t.node.clientWidth - 80 && d.sy > band[0] + 20 && d.sy < band[1] - 20 && t.whatAt(d.sx, d.sy).kind === 'booth' && t.whatAt(d.sx, d.sy).name === d.key) || null; });
  check(!!dot, `부스 단계에서 화면에 부스 점이 찍힌다 (${dot?.key})`);
  await tapAt(dot.sx, dot.sy);
  sh = await sheet();
  const code = dot.key.slice(dot.key.indexOf('|') + 1);
  check(sh.state !== 'closed' && (sh.title === `부스 ${code}` || sh.where.includes(code)), `부스 점 ${code}을 누르면 그 부스의 카드가 열린다 ("${sh.title}" · ${sh.where.replace(/\n/g, ' ')})`);
  await shot('223-map3d-tap-booth-360.png');
  await closeSheet();
  // 2-5. 멀리(전체): 캠퍼스 이름이 보이고, 캠퍼스 바닥을 누르면 그 캠퍼스 · 빈 곳은 아무것도
  await page.getByRole('button', { name: '전체', exact: true }).click();
  await settle(600);
  spot = await findSpot('campus');
  const campusKo = await api((m, k) => m.L.campuses.find((c) => c.k === k).ko, spot.name);
  check(!!spot && spot.name === spot.floor, `멀리 볼 때 캠퍼스 바닥(${campusKo})은 누를 수 있다`);
  await tapAt(spot.x, spot.y);
  sh = await sheet();
  check(sh.state !== 'closed' && sh.title === campusKo, `캠퍼스 바닥을 누르면 손가락 아래의 "${sh.title}" 카드가 열린다`);
  await shot('224-map3d-tap-campus-360.png');
  await closeSheet();
  await page.getByRole('button', { name: '전체', exact: true }).click();
  await settle(600);
  spot = await findSpot('none');
  check(!!spot, '멀리 볼 때 캠퍼스 밖 빈 곳이 있다');
  await tapAt(spot.x, spot.y);
  check((await sheet()).state === 'closed' && (await page.locator('canvas.map').getAttribute('data-tap')) === 'none', '빈 곳을 누르면 아무것도 열리지 않는다');

  // ---- 3. 돌려도 글자는 화면을 향하고(눕거나 돌지 않는다) 차례 선과 다음 곳 이름이 남는다
  await open3d();
  b = await canvasBox();
  const yaw0 = await three((t) => t.cam.yaw);
  const drag = (type, x, y) => page.evaluate(([t, px, py]) => document.querySelector('canvas.map').dispatchEvent(new PointerEvent(t, { pointerId: 7, clientX: px, clientY: py, bubbles: true, pointerType: 'touch', isPrimary: true })), [type, x, y]);
  const y0 = b.y + b.height * 0.5;
  await drag('pointerdown', b.x + 120, y0);
  for (let i = 1; i <= 8; i++) await drag('pointermove', b.x + 120 + i * 10, y0);
  await drag('pointerup', b.x + 200, y0);
  await settle(300);
  const turned = await three((t) => ({ yaw: t.cam.yaw, l: t.labelsOnScreen(), lines: t.linesOnScreen() }));
  const flat = [...turned.l.labels.map((x) => x.rect), turned.l.nextRect].filter(Boolean);
  check(Math.abs(turned.yaw - yaw0) > 0.5 && turned.l.next === seed.first.name.slice(0, 16) && !!turned.l.nextRect && overlaps(flat) === 0 && turned.l.labels.every((x) => x.size >= 13) && turned.lines.some((l) => l.today && l.pts.length === 5),
    `끌어서 돌려도(${(turned.yaw - yaw0).toFixed(2)}rad) 차례 선이 남고, 글자 ${flat.length}개는 눕지 않고 화면을 향해 겹침 없이 놓인다 (다음 곳 "${turned.l.next}")`);
  await shot('225-map3d-turned-360.png');

  // ---- 4. 다른 날 선은 얇은 점선, 이 날 보기 중에는 더 흐리게 (2D와 같다)
  const dim = (await three((t) => t.linesOnScreen())).find((l) => !l.today);
  await page.getByRole('button', { name: '모두 보기' }).click();
  await settle(400);
  const lines1 = await three((t) => t.linesOnScreen());
  const other = lines1.find((l) => !l.today);
  check(lines1.filter((l) => l.today).length === 1 && !!other && other.dash === '7 6' && other.width === 2.5 && other.alpha === 0.45 && dim?.alpha === 0.15,
    `다른 날(1/7) 선은 얇은 점선이고, 이 날 보기 중에는 더 흐리다 (투명도 ${dim?.alpha} → 모두 보기 ${other?.alpha})`);

  // ---- 5. 길 안내 중: 2D와 같은 길 선 (흰 테두리 + 강조색, 내 자리에서 가는 곳까지) · 짐작 표시
  const meSpot = await api((m, booth) => { const at = booth.lastIndexOf('@'); const key = `${booth.slice(at + 1)}|${booth.slice(0, at)}`; const s = m.spots.get(key); return { place: booth.slice(at + 1), code: booth.slice(0, at), x: s.x, z: s.z }; }, seed.me);
  await open3d({ where: { by: 'booth', campus: 'lvcc', place: meSpot.place, code: meSpot.code, x: meSpot.x, z: meSpot.z, at: Date.now() } });
  await page.locator('.navbar').getByRole('button', { name: '길 안내', exact: true }).click();
  await page.waitForFunction(() => /걸어서/.test(document.querySelector('.navbar').innerText), null, { timeout: 15000 });
  await settle(900);
  const nav = await three((t) => ({ lines: t.linesOnScreen(), l: t.labelsOnScreen(), w: t.node.clientWidth }));
  const accent = await token('--accent');
  const way = nav.lines.find((l) => l.width === 4.5 && l.color === accent);
  const casing = nav.lines.find((l) => l.width === 8);
  const bar = await page.locator('.navbar').innerText();
  check(!!way && !!casing && way.pts.length >= 2, `길 안내 중에 3D에도 길 선이 그려진다 (점 ${way?.pts.length}개, 흰 테두리 + 강조색)`);
  check(way.pts.every(([x, y]) => x >= 0 && x <= nav.w && y >= nav.l.band[0] - 30 && y <= nav.l.band[1] + 2), '길 선(내 자리 ~ 가는 곳)이 한 화면에 든다');
  check(nav.l.next === seed.first.name.slice(0, 16) && bar.includes('짐작') && bar.includes(seed.first.name), `가는 곳 이름 "${nav.l.next}"이 지도에 있고 아래 띠에 "(짐작)"이 그대로 있다`);
  await shot('226-map3d-nav-360.png');
  await page.locator('.navbar').getByRole('button', { name: '끝내기' }).click();
  await settle(400);
  check(!(await three((t) => t.linesOnScreen())).some((l) => l.width === 4.5), '끝내기를 누르면 길 선이 지워진다');

  // ---- 6. 390px · 어둡게 · 글자 네 단계
  await open3d({ w: 390, h: 780 });
  await measure('390 밝게');
  await shot('227-map3d-day-390.png');
  await open3d({ theme: 'dark' });
  await measure('360 어둡게');
  await shot('228-map3d-day-dark-360.png');
  for (const text of [2, 3, 4]) {
    await open3d({ text });
    const s = await measure(`360 글자 ${text}단계`);
    check(s.l.nextSize >= 13 * (text === 2 ? 1.15 : 1.3), `글자 ${text}단계에서 지도 글자도 커진다 (다음 곳 이름 ${s.l.nextSize.toFixed(1)}px)`);
    if (text === 4) await shot('229-map3d-day-text4-360.png');
  }
  await open3d({ theme: 'dark', text: 4, w: 390, h: 780 });
  await measure('390 어둡게 글자 4단계');

  // ---- 7. 인터넷 없이: 한 번 연 뒤 끊고 다시 열어도 3D가 열리고 차례 선이 그려진다
  await open3d();
  await page.evaluate(() => navigator.serviceWorker.ready);
  // 서비스 워커가 이 화면을 맡고, 첫 화면과 3D 조각이 폰에 담길 때까지 기다린다(담기기 전에 끊으면 다시 열리지 않는다).
  await page.waitForFunction(async () => !!navigator.serviceWorker.controller && !!(await caches.match('./')) && !!(await caches.match('map3d.js')), null, { timeout: 30000 });
  await page.context().setOffline(true);
  try {
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('svg.map').waitFor();
  await page.waitForFunction(() => document.querySelectorAll('svg.map [data-pin]').length >= 7, null, { timeout: 15000 });
  await settle(800);
  await page.getByRole('button', { name: /3D 지도/ }).click();
  await page.locator('canvas.map').waitFor();
  await settle(600);
  const off = await three((t) => ({ pins: t.pinsOnScreen().length, lines: t.linesOnScreen().length, next: t.labelsOnScreen().next }));
  check(off.pins === 7 && off.lines >= 1 && off.next === seed.first.name.slice(0, 16), `인터넷 없이도 3D가 열리고 번호 ${off.pins}개 · 차례 선 · 다음 곳 이름이 그려진다`);
  } finally { await page.context().setOffline(false); }

  // ---- 8. 3D 겉모습(R67): 둘레 건물 · 길 · 모노레일(오픈스트리트맵) · 출처 한 줄 · 홀을 가까이 보면 지붕을 벗기고 부스 칸 상자
  await open3d({ hash: '#/map' });
  await page.locator('.chip-go', { hasText: /^웨스트$/ }).click();
  await settle(1200);
  const ext = await page.evaluate(() => { const c = document.querySelector('canvas.map'); const cr = document.querySelector('.map-credit'); const rough = document.querySelector('.map-rough'); return { open: c.dataset.open, faces: Number(c.dataset.faces), ms: Number(c.dataset.ms), credit: cr?.textContent, creditShown: !!cr && cr.getBoundingClientRect().height > 0, rough: rough && getComputedStyle(rough).display !== 'none', level: document.querySelector('.mapx').dataset.level }; });
  const boxes = await three((t) => t.boothsOnScreen().filter((b) => b.key.startsWith('LVCC_W|')).length);
  check(ext.open.split(',').includes('LVCC_W') && boxes >= 100 && ext.faces > 500 && ext.credit === '© OpenStreetMap 기여자' && ext.creditShown && ext.rough && ext.level !== 'campus',
    `3D 웨스트 홀: 지붕을 벗기고 부스 칸 상자 ${boxes}개 · 그린 면 ${ext.faces}개(둘레 건물 포함, 한 번 그리는 데 ${ext.ms}ms) · 아래 "${ext.credit}" · 위 "부스 자리는 대략" 한 줄`);

  check(errors.length === 0, `화면 오류 없음 (${errors.length}건${errors.length ? `: ${errors[0]}` : ''})`);
  return JSON.stringify(checks, null, 2);
}
