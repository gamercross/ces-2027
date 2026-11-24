// Playwright CLI test for 처음 들어오면 명함 만들기 (다시 짓기 3단계) + 링크드인 칸과 QR 셋 (11/24). 360 x 740 폰 크기, 밝게.
// Run with: playwright-cli open about:blank
//           playwright-cli run-code "$(cat scripts/browser-first-card.mjs)"
// The app must be served from a stamped dist at http://127.0.0.1:47551/.
// SHOTS를 채우면(레포 바탕의 상대 경로) 처음 · 명함 · QR · 설정 그림을 그 폴더에 남긴다.
async (page) => {
  const URL = 'http://127.0.0.1:47551/';
  const SHOTS = 'docs/screens/';
  const checks = [];
  const check = (ok, what) => {
    checks.push({ ok, what });
    if (!ok) throw new Error(`안 됨: ${what}`);
  };
  const noSideScroll = async (what) => check(await page.evaluate(() => document.documentElement.scrollWidth <= 360), `${what}: 360px 폭에서 옆으로 밀리지 않는다`);
  const shot = async (name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}${name}` }); };
  await page.setViewportSize({ width: 360, height: 740 });
  await page.addInitScript(() => { localStorage.setItem('ces2027.theme.v1', JSON.stringify('light')); });
  await page.goto(URL);
  // 처음 여는 폰처럼: 서비스 워커 · 담아 둔 것 · 명함을 지운다.
  await page.evaluate(async () => {
    for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
    for (const k of await caches.keys()) await caches.delete(k);
    localStorage.removeItem('ces2027.profile.v1');
    sessionStorage.clear();
  });
  await page.goto('about:blank');
  await page.goto(URL);

  // 1. 처음: 환영 한 줄 + 명함 한 화면. 뒤로 · 지금 탭 표시는 없다.
  await page.getByRole('heading', { name: '명함부터 만든다' }).waitFor();
  check((await page.evaluate(() => location.hash)) === '#/card' && (await page.locator('.welcome').innerText()).includes('환영한다'), '처음 열면 환영 한 줄과 "명함부터 만든다" 화면이다');
  check(await page.locator('#back').isHidden() && (await page.locator('.tabs a[aria-current=page]').count()) === 0, '처음 명함 화면에는 "뒤로"도 지금 탭 표시도 없다');
  check((await page.getByLabel('별명').evaluate((n) => getComputedStyle(n).fontSize)) === '18px' && (await page.locator('.choice span').first().evaluate((n) => n.getBoundingClientRect().height)) >= 52, '큰 글씨(입력 18px)와 큰 고르기(52px 이상)다');
  await noSideScroll('처음 명함');
  await shot('80-first-open.png');

  // 2. 꼭 필요한 칸만 필수
  await page.getByRole('button', { name: '명함 만들기' }).click();
  check((await page.locator('.error').innerText()) === '별명을 적는다.', '별명을 비우면 "별명을 적는다."로 막힌다');
  await page.getByLabel('별명').fill('재엽');
  await page.getByRole('button', { name: '명함 만들기' }).click();
  check((await page.locator('.error').innerText()).startsWith('나를 하나 고른다'), '나를 안 고르면 막힌다');
  await page.getByRole('radio', { name: '학생' }).check({ force: true });
  await shot('81-first-filled.png');

  // 2-1. 칸이 하나 늘어도 첫 화면은 그대로: 꼭 적을 것은 둘, 검정 단추 하나가 스크롤 없이 보이고, 선택 칸 넷은 그 아래다
  const firstView = await page.evaluate(() => {
    const top = (n) => Math.round(n.getBoundingClientRect().top);
    const tabs = top(document.querySelector('.tabs'));
    const btn = document.querySelector('.form button[type=submit]').getBoundingClientRect();
    const names = [...document.querySelectorAll('.form input:not([type=radio])')].map((n) => n.name);
    return { tabs, btnBottom: Math.round(btn.bottom), btnTop: top(document.querySelector('.form button[type=submit]')), names, firstOptional: top(document.querySelector('.form .optional')), filled: [...document.querySelectorAll('.form .btn:not(.ghost)')].length, required: document.querySelectorAll('.form [required]').length };
  });
  check(firstView.names.join(' ') === 'nick line linkedin github discord' && firstView.required === 1 && firstView.filled === 1 && firstView.btnBottom <= firstView.tabs && firstView.firstOptional > firstView.btnTop,
    `첫 실행 명함: 칸 차례는 별명 · (나) · 한 줄 · 링크드인 · 깃허브 · 디스코드, 검정 단추는 하나이고 스크롤 없이 보이며(아래 끝 ${firstView.btnBottom}px, 탭 ${firstView.tabs}px) 선택 칸은 모두 그 아래에 있다`);

  // 3. 한 줄 · 링크드인 · 깃허브 · 디스코드는 건너뛰어도 만들어진다
  await page.getByRole('button', { name: '명함 만들기' }).click();
  await page.getByText('명함이 만들어졌다').waitFor();
  check((await page.locator('.qr svg').count()) === 0 && (await page.locator('.qr, .qr-empty, .qrs').count()) === 0 && (await page.locator('.note').first().innerText()).includes('QR이 생긴다') && (await page.getByRole('link', { name: '지도로' }).count()) === 1, '선택 칸을 건너뛰면 빈 QR 자리 없이 안내 한 줄만 나오고 "지도로" 단추가 있다');
  await noSideScroll('명함(QR 없음)');

  // 4. 고쳐서 QR 둘 (링크드인 없이: 전과 같은 두 칸 나란히)
  await page.getByRole('button', { name: '명함 고치기' }).click();
  await page.getByLabel('깃허브', { exact: true }).fill('octocat');
  await page.getByLabel('디스코드', { exact: true }).fill('jaeyeup');
  await page.getByRole('button', { name: '명함 고치기 끝' }).click();
  await page.locator('.qr svg').first().waitFor();
  check((await page.locator('.qr svg').count()) === 2 && (await page.locator('.qr.lead').count()) === 0 && (await page.locator('.qr figcaption b').allInnerTexts()).join(' ') === '깃허브 디스코드', '깃허브 · 디스코드만 적으면 QR이 둘, 전처럼 나란히 보인다');
  await noSideScroll('명함(QR 둘)');
  await shot('82-card-qr.png');

  // 4-1. 링크드인: 틀리면 그 칸 바로 아래에 한 줄, 저장하지 않는다
  const li = page.getByLabel('링크드인', { exact: true });
  const liError = page.locator('#linkedin-error');
  await page.getByRole('button', { name: '명함 고치기' }).click();
  check((await li.inputValue()) === '' && await liError.isHidden(), '링크드인을 적지 않은 명함으로 고치기를 열면 링크드인 칸은 비어 있고 알림은 없다');
  await li.fill('https://www.linkedin.com/company/acme');
  await page.getByLabel('깃허브', { exact: true }).focus();
  const near = await page.evaluate(() => { const i = document.querySelector('input[name=linkedin]').getBoundingClientRect(); const e = document.querySelector('#linkedin-error').getBoundingClientRect(); return Math.round(e.top - i.bottom); });
  check(await liError.isVisible() && (await liError.innerText()) === '프로필 주소(linkedin.com/in/…)나 그 끝의 아이디로 적는다.' && near >= 0 && near <= 12 && (await li.getAttribute('aria-invalid')) === 'true' && (await li.getAttribute('aria-describedby')) === 'linkedin-error',
    `링크드인에 회사 쪽 주소를 적고 칸을 떠나면 그 칸 바로 아래(${near}px)에 한 줄로 알린다`);
  await noSideScroll('명함 고치기(링크드인 알림)');
  await page.getByRole('button', { name: '명함 고치기 끝' }).click();
  check((await page.getByRole('heading', { name: '명함 고치기' }).count()) === 1 && (await page.evaluate(() => document.activeElement?.name)) === 'linkedin' && (await page.evaluate(() => JSON.parse(localStorage.getItem('ces2027.profile.v1')).linkedin)) === '',
    '틀린 채로 "명함 고치기 끝"을 누르면 저장하지 않고 링크드인 칸으로 돌아간다');
  await li.fill('https://kr.linkedin.com/in/sample-id-2027/?utm_source=share');
  check(await liError.isHidden() && (await li.getAttribute('aria-invalid')) === null, '맞게 고치면 알림이 바로 사라진다');

  // 4-2. 적으면 QR 셋: 링크드인이 맨 앞에 크게, 깃허브 · 디스코드는 그 아래 나란히. 360 × 740 한 화면에 든다.
  await page.getByRole('button', { name: '명함 고치기 끝' }).click();
  await page.locator('.qr.lead svg').waitFor();
  const three = await page.evaluate(() => {
    const box = (n) => n.getBoundingClientRect();
    const svgs = [...document.querySelectorAll('.qr svg')].map(box);
    const lastText = Math.max(...[...document.querySelectorAll('.qr figcaption')].map((n) => box(n).bottom));
    return { titles: [...document.querySelectorAll('.qr figcaption b')].map((n) => n.textContent).join(' '), shown: document.querySelector('.qr.lead figcaption span').textContent, w: svgs.map((b) => Math.round(b.width)), lastText: Math.round(lastText), tabs: Math.round(box(document.querySelector('.tabs')).top), sameRow: Math.abs(svgs[1].top - svgs[2].top) < 1, below: svgs[1].top > svgs[0].bottom, label: document.querySelector('.qr.lead svg').getAttribute('aria-label'), saved: JSON.parse(localStorage.getItem('ces2027.profile.v1')).linkedin, filled: document.querySelectorAll('.page .btn:not(.ghost)').length };
  });
  check(three.titles === '링크드인 깃허브 디스코드' && three.shown === 'linkedin.com/in/sample-id-2027' && three.w[0] > three.w[1] && three.w[1] === three.w[2] && three.sameRow && three.below && three.filled === 1,
    `링크드인을 적으면 QR이 셋이고 차례는 링크드인 → 깃허브 → 디스코드다. 링크드인이 맨 앞에 크게(${three.w[0]}px), 나머지 둘은 그 아래 나란히(${three.w[1]}px)`);
  check(three.lastText <= three.tabs, `QR 셋과 그 아래 글이 360 × 740에서 스크롤 없이 보인다(글 아래 끝 ${three.lastText}px, 탭 ${three.tabs}px)`);
  await noSideScroll('명함(QR 셋)');
  // QR에 든 글: 폰의 QR 읽기(BarcodeDetector)가 있으면 그림을 다시 읽어 본다. 없으면 건너뛴다(스모크가 QR 칸을 맞춰 본다).
  const read = await page.evaluate(async () => {
    if (!('BarcodeDetector' in window)) return null;
    try {
      const out = [];
      for (const svg of document.querySelectorAll('.qr svg')) {
        const img = new Image();
        const copy = svg.cloneNode(true);
        copy.setAttribute('width', '600'); copy.setAttribute('height', '600');
        img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(copy));
        await img.decode();
        const c = document.createElement('canvas'); c.width = c.height = 600;
        const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 600, 600); g.drawImage(img, 0, 0, 600, 600);
        out.push((await new BarcodeDetector({ formats: ['qr_code'] }).detect(c))[0]?.rawValue || '');
      }
      return out;
    } catch { return null; }
  });
  if (read) check(read.join(' ') === 'https://www.linkedin.com/in/sample-id-2027 https://github.com/octocat jaeyeup', 'QR 그림을 다시 읽으면 링크드인 프로필 주소 · 깃허브 주소 · 디스코드 아이디가 차례로 나온다');
  else checks.push({ ok: true, what: '(건너뜀) 이 브라우저에는 QR 읽기가 없어 그림을 다시 읽지 못했다' });

  // 4-3. 인터넷 없이도 QR이 만들어진다
  await page.context().setOffline(true);
  await page.getByRole('button', { name: '명함 고치기' }).click();
  await page.getByRole('button', { name: '명함 고치기 끝' }).click();
  await page.locator('.qr.lead svg').waitFor();
  check((await page.locator('.qr svg').count()) === 3, '인터넷을 끊고 명함을 다시 열어도 QR 셋이 만들어진다');
  await page.context().setOffline(false);

  // 4-4. 링크드인만 적으면 QR 하나가 가장 크게
  await page.getByRole('button', { name: '명함 고치기' }).click();
  await page.getByLabel('깃허브', { exact: true }).fill('');
  await page.getByLabel('디스코드', { exact: true }).fill('');
  await page.getByRole('button', { name: '명함 고치기 끝' }).click();
  await page.locator('.qr.lead svg').waitFor();
  const one = await page.evaluate(() => ({ n: document.querySelectorAll('.qr').length, w: Math.round(document.querySelector('.qr.lead svg').getBoundingClientRect().width) }));
  check(one.n === 1 && one.w >= three.w[0] && one.w <= 220, `링크드인만 적으면 QR 하나가 가장 크게 보인다(${one.w}px)`);
  await page.getByRole('button', { name: '명함 고치기' }).click();
  await page.getByLabel('깃허브', { exact: true }).fill('octocat');
  await page.getByLabel('디스코드', { exact: true }).fill('jaeyeup');
  await page.getByRole('button', { name: '명함 고치기 끝' }).click();
  await page.locator('.qr.lead svg').waitFor();

  // 4-5. 폭 360 · 390, 밝게 · 어둡게, 글자 네 단계: 명함 고치기와 QR 보기가 옆으로 밀리지 않고, 칸은 44px 이상이며, QR은 어둡게에서도 흰 바탕이다
  const bad = [];
  for (const width of [360, 390]) for (const theme of ['light', 'dark']) for (const size of [1, 2, 3, 4]) {
    await page.setViewportSize({ width, height: 740 });
    await page.evaluate(([t, s]) => { localStorage.setItem('ces2027.theme.v1', JSON.stringify(t)); localStorage.setItem('ces2027.text.v1', JSON.stringify(s)); }, [theme, size]);
    for (const hash of ['#/card', '#/card/edit']) {
      await page.goto('about:blank');
      await page.goto(`${URL}${hash}`);
      await page.locator(hash === '#/card' ? '.qr.lead svg' : 'input[name=linkedin]').waitFor();
      if (hash === '#/card/edit') { await page.locator('input[name=linkedin]').fill('Sample Name'); await page.locator('input[name=github]').focus(); }
      const m = await page.evaluate((w) => {
        const over = document.documentElement.scrollWidth > w;
        const small = [...document.querySelectorAll('.page input:not([type=radio]), .page .btn, .form input:not([type=radio]), .form .btn')].filter((n) => n.getBoundingClientRect().height < 44).length;
        const clipped = [...document.querySelectorAll('.qr figcaption span, .field-error:not([hidden]), .form .label')].filter((n) => { const b = n.getBoundingClientRect(); return b.left < 0 || b.right > w + 0.5 || n.scrollWidth > n.clientWidth + 1; }).length;
        const svg = document.querySelector('.qr svg');
        const qrBg = svg ? getComputedStyle(svg.querySelector('rect') || svg).fill : '';
        return { over, small, clipped, qrBg };
      }, width);
      if (m.over || m.small || m.clipped || (hash === '#/card' && m.qrBg !== 'rgb(255, 255, 255)')) bad.push(`${width} ${theme} 글자${size} ${hash} ${JSON.stringify(m)}`);
    }
  }
  check(bad.length === 0, `360 · 390px × 밝게 · 어둡게 × 글자 네 단계(32가지)에서 명함 고치기(링크드인 알림이 뜬 채)와 QR 셋이 옆으로 밀리지 않고, 글이 잘리지 않고, 칸 · 단추는 44px 이상이고, QR 바탕은 흰색이다 ${bad.join(' | ')}`);
  await page.setViewportSize({ width: 360, height: 740 });
  await page.evaluate(() => { localStorage.setItem('ces2027.theme.v1', JSON.stringify('light')); localStorage.removeItem('ces2027.text.v1'); });
  await page.goto('about:blank');
  await page.goto(`${URL}#/card`);
  await page.locator('.qr.lead svg').waitFor();

  // 5. 지도로, 다시 들어오면 바로 지도
  await page.getByRole('link', { name: '지도로' }).click();
  await page.waitForTimeout(500);
  check((await page.evaluate(() => location.hash)) === '#/map', '"지도로"가 지도를 연다');
  await page.goto('about:blank');
  await page.goto(URL);
  await page.waitForTimeout(1200);
  check((await page.evaluate(() => location.hash)) === '#/map', '다시 들어오면 명함 없이 바로 지도다');

  // 6. 설정에서 QR 보기 · 고치기
  await page.goto('about:blank');
  await page.goto(`${URL}#/settings`);
  await page.getByRole('link', { name: 'QR 보기' }).waitFor();
  await noSideScroll('설정');
  await shot('83-settings-card.png');
  await page.getByRole('link', { name: '명함 고치기' }).click();
  await page.getByRole('heading', { name: '명함 고치기' }).waitFor();
  check((await page.getByLabel('별명').inputValue()) === '재엽', '설정의 "명함 고치기"는 적어 둔 별명으로 열린다');
  await page.goto('about:blank');
  await page.goto(`${URL}#/settings`);
  await page.getByRole('link', { name: 'QR 보기' }).click();
  await page.locator('.qr svg').first().waitFor();
  check((await page.locator('.tabs a[aria-current=page]').innerText()) === '설정' && (await page.locator('.qr svg').count()) === 3, '설정의 "QR 보기"는 QR 셋이 있는 명함을 연다');

  // 6-1. 옛 꼴의 명함(링크드인 칸이 없다)이 폰에 있어도 그대로 열린다. "이 폰의 내 자료 지우기"가 부르는 지우기는 링크드인까지 지운다.
  await page.evaluate(() => localStorage.setItem('ces2027.profile.v1', JSON.stringify({ nick: '옛명함', tag: 'job', github: 'octocat', discord: 'seal.bot' })));
  await page.goto('about:blank');
  await page.goto(`${URL}#/card`);
  await page.locator('.qr svg').first().waitFor();
  check((await page.locator('.qr figcaption b').allInnerTexts()).join(' ') === '깃허브 디스코드' && (await page.getByRole('heading', { name: '옛명함' }).count()) === 1, '옛 꼴의 명함(링크드인 칸 없음)은 전처럼 깃허브 · 디스코드 QR 둘로 열린다');
  await page.evaluate(() => localStorage.setItem('ces2027.profile.v1', JSON.stringify({ nick: '재엽', tag: 'stu', line: '', linkedin: 'sample-id-2027', github: 'octocat', discord: 'jaeyeup' })));
  const wiped = await page.evaluate(async () => { const { clearMine } = await import('./store.js'); clearMine(); return Object.keys(localStorage).filter((k) => /sample-id-2027/.test(localStorage.getItem(k) || '')).length + (localStorage.getItem('ces2027.profile.v1') ? 1 : 0); });
  check(wiped === 0, '"이 폰의 내 자료 지우기"가 부르는 지우기 뒤에는 폰에 링크드인이 남지 않는다');
  await page.evaluate(() => { localStorage.setItem('ces2027.theme.v1', JSON.stringify('light')); localStorage.setItem('ces2027.profile.v1', JSON.stringify({ nick: '재엽', tag: 'stu', line: '', linkedin: 'sample-id-2027', github: 'octocat', discord: 'jaeyeup' })); });

  // 7. 처음 화면에서 "나중에": 명함 없이 지도
  await page.evaluate(() => { localStorage.removeItem('ces2027.profile.v1'); sessionStorage.clear(); });
  await page.goto('about:blank');
  await page.goto(URL);
  await page.getByRole('button', { name: '나중에' }).click();
  await page.waitForTimeout(800);
  check((await page.evaluate(() => location.hash)) === '#/map', '"나중에"를 누르면 지도로 간다');
  return checks.map((c) => `됨 | ${c.what}`).join('\n');
}
