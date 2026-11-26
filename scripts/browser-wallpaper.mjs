// Playwright CLI test for 내 명함 "배경화면으로 저장" (R60). 390 x 844 · 기기 픽셀 비율 3(아이폰 크기).
// Run with: playwright-cli -s=wallpaper open about:blank
//           playwright-cli -s=wallpaper run-code "$(cat scripts/browser-wallpaper.mjs)"
// The app must be served from a stamped dist at URL below. BEFORE는 main으로 지은 dist(전 그림용, 비우면 건너뛴다).
// 만든 그림 속 QR이 실제로 읽히는지는 브라우저의 QR 읽기(BarcodeDetector)로 본다. 없는 브라우저면 칸을 하나하나 견준다.
async (page) => {
  const URL = 'http://127.0.0.1:47581/';
  const BEFORE = 'http://127.0.0.1:47582/';
  const SHOTS = ''; // 예: '/Users/<나>/Downloads/ces-그림-2026-11-26/배경화면/' (끝에 / )
  const checks = [];
  const check = (ok, what) => {
    checks.push({ ok, what });
    if (!ok) throw new Error(`안 됨: ${what}`);
  };
  const card = { nick: '물개', tag: 'stu', line: '로봇과 AI를 보러 간다', linkedin: 'seal-ces2027', github: 'octocat', discord: 'seal.bot' };
  const want = { linkedin: 'https://www.linkedin.com/in/seal-ces2027', github: 'https://github.com/octocat', discord: 'seal.bot' };
  const ctx = await page.context().browser().newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, acceptDownloads: true });
  try {
  const p = await ctx.newPage();
  const shot = async (name, target = p) => { if (SHOTS) await target.screenshot({ path: `${SHOTS}${name}`, scale: 'css' }); };
  await p.addInitScript((c) => {
    localStorage.setItem('ces2027.profile.v1', JSON.stringify(c));
    if (!localStorage.getItem('ces2027.theme.v1')) localStorage.setItem('ces2027.theme.v1', JSON.stringify('light'));
    // 처음에는 공유 창으로 파일을 못 건네는 폰처럼(맥의 크롬은 공유 창을 띄워 시험이 멈춘다). 6번에서 되는 폰을 흉내 낸다.
    navigator.canShare = () => false;
    // 내려받기 단추가 건네는 그림을 붙잡아 둔다(그대로 내려받기도 한다).
    const click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      if (this.download && this.href.startsWith('blob:')) {
        window.__walls = window.__walls || [];
        const name = this.download;
        window.__walls.push(fetch(this.href).then((r) => r.blob()).then((b) => new Promise((ok) => { const f = new FileReader(); f.onload = () => ok({ name, url: f.result, size: b.size, type: b.type }); f.readAsDataURL(b); })));
      }
      return click.call(this);
    };
  }, card);
  // 그림을 읽는다: 크기 · QR 글 · 둘레(시계 · 아래 단추 자리)가 바탕색 그대로인지.
  const readWall = (url) => p.evaluate(async (u) => {
    const img = new Image();
    img.src = u;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const px = (x, y) => [...g.getImageData(x, y, 1, 1).data].slice(0, 3).join(',');
    const W = c.width, H = c.height;
    // 시계 자리(위 40%)와 손전등 · 카메라 자리(아래 14%)에는 그림이 없다: 바탕색 한 가지.
    const bg = px(2, 2);
    let busy = 0;
    for (let y = 0; y < H; y += 8) {
      if (y > H * 0.40 && y < H * 0.86) continue;
      for (let x = 0; x < W; x += 8) if (px(x, y) !== bg) busy += 1;
    }
    let text = null;
    if ('BarcodeDetector' in window) {
      const found = await new BarcodeDetector({ formats: ['qr_code'] }).detect(c);
      text = found.map((f) => f.rawValue);
    }
    return { W, H, bg, busy, text };
  }, url);

  // 1. 전(main): 내 명함 QR 보기 — 단추가 없다.
  if (BEFORE) {
    await p.goto(`${BEFORE}#/card`);
    await p.locator('.qr.lead svg').waitFor();
    check(await p.getByRole('button', { name: '배경화면으로 저장' }).count() === 0, '전(main): 명함 QR 보기에 "배경화면으로 저장"이 없다');
    await shot('1-전-명함-QR보기-390.png');
    await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await shot('1-전-명함-QR보기-아래-390.png');
  }

  // 2. 후: 글자 단추 하나. 검정 단추는 그대로 하나("지도로").
  await p.goto(`${URL}#/card`);
  await p.locator('.qr.lead svg').waitFor();
  const btn = p.getByRole('button', { name: '배경화면으로 저장' });
  await btn.scrollIntoViewIfNeeded();
  const look = await btn.evaluate((n) => ({ cls: n.className, h: n.getBoundingClientRect().height, filled: document.querySelectorAll('.page .btn:not(.ghost)').length, picks: document.querySelectorAll('.wall-pick:not([hidden])').length }));
  check(look.cls === 'linkish' && look.h >= 44 && look.filled === 1 && look.picks === 0, `후: 명함 화면에 글자 단추 "배경화면으로 저장" 하나(높이 ${look.h}px)이고 검정 단추는 그대로 하나, 고르는 줄은 누르기 전에는 없다`);
  await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await shot('2-후-단추-390.png');

  // 3. QR이 셋이면 누른 뒤 고르는 줄 하나(맨 앞 링크드인이 골라져 있다) → 저장 → 내려받기(이 맥 브라우저는 공유 창으로 파일을 못 건넨다).
  await btn.click();
  const pressed = await p.locator('.wall-pick .seg[aria-pressed=true]').innerText();
  const segs = await p.locator('.wall-pick .seg').allInnerTexts();
  check(pressed === '링크드인' && segs.join(' ') === '링크드인 깃허브 디스코드' && await btn.isHidden(), '누르면 "배경화면에 담을 QR" 줄이 펴지고 링크드인 · 깃허브 · 디스코드 가운데 맨 앞(링크드인)이 골라져 있다');
  const seen = await p.evaluate(() => Math.round(document.querySelector('#wall-pick-save').getBoundingClientRect().bottom) <= Math.round(document.querySelector('.tabs').getBoundingClientRect().top));
  check(seen, '펴진 줄의 "저장"이 아래 탭에 가리지 않는다');
  await shot('3-후-고르는줄-390.png');
  const dl1 = p.waitForEvent('download');
  await p.getByRole('button', { name: '저장', exact: true }).click();
  const d1 = await dl1;
  if (SHOTS) await d1.saveAs(`${SHOTS}4-배경화면-그림-링크드인.png`);
  await p.locator('.wall .note').filter({ hasText: '내려받았다' }).waitFor();
  const w1 = await p.evaluate(() => Promise.all(window.__walls));
  const r1 = await readWall(w1[0].url);
  check(w1[0].type === 'image/png' && r1.W === 1170 && r1.H === 2532, `그림은 이 폰 화면 크기다: 390 × 844 × 3 = ${r1.W} × ${r1.H} PNG (${Math.round(w1[0].size / 1024)} KB)`);
  check(r1.busy === 0 && r1.bg === '43,43,43', `시계 자리(위 40%)와 손전등 · 카메라 자리(아래 14%)는 바탕(짙은 회색 ${r1.bg})뿐이다 (다른 점 ${r1.busy})`);
  check(r1.text === null || (r1.text.length === 1 && r1.text[0] === want.linkedin), `만든 그림 속 QR을 이 맥 브라우저의 QR 읽기로 읽으면 링크드인 주소 그대로다: ${JSON.stringify(r1.text)}`);
  await shot('5-후-저장한뒤-390.png');

  // 4. 깃허브를 고르면 깃허브 QR. 디스코드도.
  for (const [title, kind] of [['깃허브', 'github'], ['디스코드', 'discord']]) {
    await p.getByRole('button', { name: title, exact: true }).click();
    const dl = p.waitForEvent('download');
    await p.getByRole('button', { name: '저장', exact: true }).click();
    const d = await dl;
    if (SHOTS && kind === 'github') await d.saveAs(`${SHOTS}4-배경화면-그림-깃허브.png`);
    const all = await p.evaluate(() => Promise.all(window.__walls));
    const r = await readWall(all[all.length - 1].url);
    check(d.suggestedFilename() === `ces2027-qr-${kind}.png` && (r.text === null || r.text[0] === want[kind]), `"${title}"를 고르고 저장하면 그 QR이 담긴다: ${JSON.stringify(r.text)}`);
  }

  // 5. 어둡게 화면에서도 그림은 글자 하나 다르지 않다(QR은 늘 검정 · 흰).
  await p.evaluate(() => localStorage.setItem('ces2027.theme.v1', JSON.stringify('dark')));
  await p.goto('about:blank');
  await p.goto(`${URL}#/card`);
  await p.locator('.qr.lead svg').waitFor();
  await p.getByRole('button', { name: '배경화면으로 저장' }).click();
  await shot('6-후-어둡게-고르는줄-390.png');
  const dlDark = p.waitForEvent('download');
  await p.getByRole('button', { name: '저장', exact: true }).click();
  await dlDark;
  const wd = await p.evaluate(() => Promise.all(window.__walls));
  check(wd[0].url === w1[0].url, '어둡게 화면에서 만든 그림이 밝게에서 만든 것과 같다(QR 검정 · 흰, 바탕 회색)');
  await p.evaluate(() => localStorage.setItem('ces2027.theme.v1', JSON.stringify('light')));

  // 6. 폰의 공유 창이 되는 폰: 공유 창으로 그림 파일 하나를 건넨다. 닫으면 "저장하지 않았다."
  await p.addInitScript(() => {
    navigator.canShare = (d) => !!d?.files?.length;
    navigator.share = async (d) => {
      window.__shared = { n: d.files.length, name: d.files[0].name, type: d.files[0].type, size: d.files[0].size, active: navigator.userActivation?.isActive };
      if (window.__cancel) { const e = new Error('closed'); e.name = 'AbortError'; throw e; }
    };
  });
  await p.goto('about:blank');
  await p.goto(`${URL}#/card`);
  await p.locator('.qr.lead svg').waitFor();
  await p.waitForTimeout(600); // 미리 만들어 두는 틈
  await p.getByRole('button', { name: '배경화면으로 저장' }).click();
  await p.getByRole('button', { name: '저장', exact: true }).click();
  await p.locator('.wall .note').filter({ hasText: '건넸다' }).waitFor();
  const sh = await p.evaluate(() => window.__shared);
  check(sh.n === 1 && sh.name === 'ces2027-qr-linkedin.png' && sh.type === 'image/png' && sh.size > 1000 && sh.active !== false, `공유 창이 되는 폰: 그림 파일 하나를 누른 그때 공유 창으로 건넨다 ${JSON.stringify(sh)}`);
  await p.evaluate(() => { window.__cancel = true; });
  await p.getByRole('button', { name: '저장', exact: true }).click();
  await p.locator('.wall .note').filter({ hasText: '저장하지 않았다.' }).waitFor();
  check(true, '공유 창을 닫으면 "저장하지 않았다."');

  // 7. QR이 하나뿐이면 고르는 줄 없이 바로 저장한다.
  const ctx1 = await page.context().browser().newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, acceptDownloads: true });
  const p1 = await ctx1.newPage();
  await p1.addInitScript((c) => { localStorage.setItem('ces2027.profile.v1', JSON.stringify({ ...c, linkedin: '', discord: '' })); localStorage.setItem('ces2027.theme.v1', JSON.stringify('light')); navigator.canShare = () => false; }, card);
  await p1.goto(`${URL}#/card`);
  await p1.locator('.qr.lead svg').waitFor();
  const dl0 = p1.waitForEvent('download');
  await p1.getByRole('button', { name: '배경화면으로 저장' }).click();
  const d0 = await dl0;
  check(d0.suggestedFilename() === 'ces2027-qr-github.png' && await p1.locator('.wall-pick:not([hidden])').count() === 0, 'QR이 하나(깃허브)뿐이면 고르는 줄 없이 바로 그 QR 그림이 내려온다');
  // 7-1. "이 폰의 내 자료 지우기": 그림을 건넨 폰에서만 "사진 속 그림은 따로 지운다" 한 줄. 지우면 그 표시도 지워진다.
  const wipeLine = async (pg) => {
    await pg.goto(`${URL}#/settings`);
    await pg.locator('#mine-open').click();
    await pg.locator('#mine-next').waitFor();
    const has = await pg.locator('#mine-wall').count();
    await pg.getByRole('button', { name: '그만두기' }).first().click();
    return has;
  };
  const p2 = await ctx1.newPage();
  const fresh = await ctx.newPage();
  await fresh.addInitScript(() => localStorage.removeItem('ces2027.wallSaved.v1'));
  check(await wipeLine(p2) === 1 && await wipeLine(fresh) === 0, '지우기 첫 확인: 배경화면 그림을 건넨 폰에만 "사진에 있어 여기서 지워지지 않는다" 한 줄이 있고, 안 건넨 폰에는 없다');
  if (SHOTS) {
    await p2.locator('#mine-open').click();
    await p2.locator('#mine-wall').waitFor();
    await shot('9-후-지우기확인-한줄-390.png', p2);
  }
  await fresh.close();
  await ctx1.close();

  // 8. 360 · 390px × 밝게 · 어둡게 × 글자 네 단계: 고르는 줄까지 편 채 옆으로 밀리지 않고, 누르는 곳은 44px 이상.
  const bad = [];
  for (const width of [360, 390]) for (const theme of ['light', 'dark']) for (const size of [1, 2, 3, 4]) {
    await p.setViewportSize({ width, height: 740 });
    await p.evaluate(([t, s]) => { localStorage.setItem('ces2027.theme.v1', JSON.stringify(t)); localStorage.setItem('ces2027.text.v1', JSON.stringify(s)); }, [theme, size]);
    await p.goto('about:blank');
    await p.goto(`${URL}#/card`);
    await p.locator('.qr.lead svg').waitFor();
    await p.getByRole('button', { name: '배경화면으로 저장' }).click();
    const m = await p.evaluate((w) => {
      const over = document.documentElement.scrollWidth > w;
      const small = [...document.querySelectorAll('.wall button:not([hidden]), .wall .seg')].filter((n) => n.offsetParent && n.getBoundingClientRect().height < 44).length;
      const out = [...document.querySelectorAll('.wall-pick *')].filter((n) => { const b = n.getBoundingClientRect(); return b.right > w + 0.5; }).length;
      return { over, small, out };
    }, width);
    if (m.over || m.small || m.out) bad.push(`${width} ${theme} 글자${size} ${JSON.stringify(m)}`);
    if (SHOTS && width === 360 && size === 4 && theme === 'light') await shot('7-후-고르는줄-360-가장큰글자.png');
  }
  check(bad.length === 0, `360 · 390px × 밝게 · 어둡게 × 글자 네 단계(16가지)에서 고르는 줄까지 옆으로 밀리지 않고 누르는 곳은 44px 이상 ${bad.join(' | ')}`);

  // 9. 잠금 화면처럼: 그림 위에 시계와 아래 두 단추를 얹어 본다(흉내).
  const lock = await ctx.newPage();
  await lock.setContent(`<!doctype html><meta charset="utf-8"><style>
    html,body{margin:0;height:100%;font-family:-apple-system,system-ui,sans-serif}
    body{background:url(${w1[0].url}) center/cover no-repeat;color:#fff;position:relative;overflow:hidden}
    .date{position:absolute;top:92px;width:100%;text-align:center;font-size:20px;font-weight:600}
    .time{position:absolute;top:112px;width:100%;text-align:center;font-size:96px;font-weight:700;letter-spacing:-2px}
    .b{position:absolute;bottom:44px;width:50px;height:50px;border-radius:50%;background:rgba(80,80,80,.6)}
    .l{left:46px}.r{right:46px}
    .bar{position:absolute;bottom:8px;left:50%;width:134px;height:5px;margin-left:-67px;border-radius:3px;background:#fff}
    .tag{position:absolute;top:14px;left:12px;font-size:12px;opacity:.8}
  </style><div class="tag">흉내(실제 잠금 화면 아님)</div><div class="date">1월 6일 수요일</div><div class="time">9:41</div><div class="b l"></div><div class="b r"></div><div class="bar"></div>`);
  await lock.waitForTimeout(300);
  await shot('8-잠금화면-흉내-390.png', lock);
  await ctx.close();
  } catch (e) { checks.push({ ok: false, what: `멈춤: ${e.message.split('\n')[0]}` }); await ctx.close().catch(() => {}); }
  return checks.map((c) => `${c.ok ? '됨' : '안 됨'} | ${c.what}`).join('\n');
}
