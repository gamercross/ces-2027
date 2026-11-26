// Playwright CLI test for R61: 남의 명함을 받자마자 "무슨 대화를 했나" 한 줄 칸. 390 x 844 폰 크기, 밝게.
// Run with: playwright-cli open about:blank
//           playwright-cli run-code "$(cat scripts/browser-talkline.mjs)"
// The app must be served from a stamped dist at http://127.0.0.1:47571/ (자료가 있는 지은 것).
// 두 길을 다 본다: ① 앱 안 카메라(카메라 · QR 읽기를 흉내 낸다) ② 주소 붙여넣기(아이폰: QR 읽기가 없는 폰을 흉내 낸다).
// 키보드는 브라우저가 띄우지 않으므로 보이는 높이(visualViewport)를 흉내 내어 창이 위로 올라오는지 본다.
// SHOTS를 채우면(끝에 / 붙인 폴더) 그 폴더에 그림을 남긴다.
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
  const people = () => page.evaluate(() => JSON.parse(localStorage.getItem('ces2027.people.v1') || '[]'));
  const noSideScroll = async (what) => { const W = page.viewportSize().width; check(await page.evaluate((w) => document.documentElement.scrollWidth <= w, W), `${what}: ${W}px 폭에서 옆으로 밀리지 않는다`); };
  // 창 안에 보이는 것: 글 칸 수 · 보이는 단추 이름
  const sheet = () => page.evaluate(() => {
    const p = document.querySelector('.pcard-back:not([hidden]) .pcard');
    if (!p) return null;
    const seen = (x) => x.checkVisibility() && x.getBoundingClientRect().width > 0;
    return {
      inputs: [...p.querySelectorAll('input, textarea, select')].filter(seen).length,
      buttons: [...p.querySelectorAll('button, a')].filter(seen).map((b) => b.textContent.trim()),
      title: p.querySelector('.pcard-tools-title, .pcard-name')?.textContent || '',
      focused: document.activeElement?.name || '',
      small: [...p.querySelectorAll('button, a, input')].filter(seen).map((b) => b.getBoundingClientRect()).filter((r) => r.height < 44 || r.width < 44).length,
    };
  });
  // 처음부터: 명함은 있고 만난 사람은 없다. noReader면 QR 읽기가 없는 폰(아이폰)처럼 연다.
  const fresh = async ({ width = 390, height = 844, text = 1, theme = 'light', noReader = false } = {}) => {
    await page.setViewportSize({ width, height });
    await page.goto(URL);
    await page.evaluate(async ({ text, theme }) => {
      for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
      for (const k of await caches.keys()) await caches.delete(k);
      localStorage.clear(); sessionStorage.clear();
      localStorage.setItem('ces2027.theme.v1', JSON.stringify(theme));
      localStorage.setItem('ces2027.text.v1', JSON.stringify(text));
      localStorage.setItem('ces2027.profile.v1', JSON.stringify({ nick: '시험', tag: 'stu', line: '', github: '', discord: '' }));
      localStorage.setItem('ces2027.paper.v1', JSON.stringify({ has: true, asked: '2026-11-22', remindOn: '2027-01-01' }));
    }, { text, theme });
    await page.goto('about:blank');
    await page.goto(`${URL}#/diary`);
    await page.locator('.met').waitFor();
    if (noReader) await page.evaluate(() => { delete window.BarcodeDetector; });
    else await page.evaluate(() => { if (!window.BarcodeDetector) window.BarcodeDetector = class { detect() { return Promise.resolve([]); } }; });
    await page.evaluate(() => { location.hash = '#/people/new'; });
    await page.locator('h1', { hasText: '남의 명함 받기' }).waitFor();
    await settle();
  };
  const paste = async (addr) => {
    if (!(await page.locator('.paste input[name=addr]').isVisible())) await page.getByRole('button', { name: '주소 붙여넣기', exact: true }).click();
    await page.locator('.paste input[name=addr]').fill(addr);
    await page.locator('.paste button[type=submit]').click();
    await page.locator('.pcard-back:not([hidden])').waitFor();
    await settle(300);
  };

  // ---- ② 붙여넣기 길 (아이폰: 앱 안 카메라가 없다) ----
  await fresh({ noReader: true });
  check(await page.locator('.paste').isVisible(), '아이폰: 붙여 넣는 칸이 처음부터 펴져 있다');
  await paste('https://github.com/robot-arm-kim');
  let s = await sheet();
  check(s.title === '무슨 대화를 했나', '붙여넣기: 사람이 남자마자 "무슨 대화를 했나" 칸이 뜬다');
  check(s.inputs === 1 && s.buttons.join(',') === '넘기기', `칸은 하나, 단추는 글자 단추 "넘기기" 하나다(${s.buttons.join(',')})`);
  check(s.focused === 'talk', '칸에 바로 손이 간다(키보드가 그대로 남는다)');
  check((await page.locator('input[name=talk]').getAttribute('placeholder')) === '예: 로봇 팔 데모 · 채용 물어봄', '예시 글 하나');
  check(Number(await page.locator('input[name=talk]').getAttribute('maxlength')) === 200, '글자 수 한도 200(고치기의 메모 칸과 같다)');
  let list = await people();
  check(list.length === 1 && list[0].note === '', '적기 전에 이미 폰에 남았다');
  await shot('2-후-한줄칸-붙여넣기-아이폰-390.png');
  await page.locator('input[name=talk]').fill('로봇 팔 데모 · 채용 물어봄');
  s = await sheet();
  check(s.buttons.join(',') === '넘기기,저장', '적으면 "저장"이 나온다');
  await shot('3-후-적는중-390.png');
  await page.locator('input[name=talk]').press('Enter');
  await page.locator('.pcard-note').waitFor();
  list = await people();
  check(list.length === 1 && list[0].note === '로봇 팔 데모 · 채용 물어봄', '엔터(완료)로 저장하면 그 사람의 메모에 들어간다(새 칸이 아니다)');
  check((await page.locator('.pcard-note').textContent()) === '로봇 팔 데모 · 채용 물어봄', '저장 뒤에는 그 사람 카드가 열리고 한 줄이 보인다');
  await shot('4-후-적은뒤-카드-390.png');
  await page.locator('.pcard button', { hasText: '고치기' }).click();
  check((await page.locator('.pcard textarea[name=note]').inputValue()) === '로봇 팔 데모 · 채용 물어봄', '고치기의 메모 칸에 같은 한 줄이 있다');
  await page.locator('.pcard button', { hasText: '닫기' }).click();
  await page.locator('.pcard button', { hasText: '닫기' }).click();
  await noSideScroll('명함 받기');

  // 넘기기: 비워도 저장돼 있다
  await paste('github.com/skip-me');
  await page.getByRole('button', { name: '넘기기', exact: true }).click();
  await settle(300);
  list = await people();
  check(!(await page.locator('.pcard-back:not([hidden])').count()) && list.length === 2 && list.some((p) => p.links[0].key === 'github:skip-me' && p.note === ''), '"넘기기"를 누르면 창만 닫히고 사람은 이미 남아 있다');
  check((await page.locator('p[role=status]', { hasText: '폰에 남겼다' }).count()) >= 1, '받기 화면에 "폰에 남겼다" 한 줄이 남는다');
  // 빈 칸에서 엔터 = 넘기기
  await paste('github.com/enter-empty');
  await page.locator('input[name=talk]').press('Enter');
  await settle(300);
  check(!(await page.locator('.pcard-back:not([hidden])').count()) && (await people()).length === 3, '빈 칸에서 엔터는 넘기기와 같다');
  // 이미 있는 사람: 한 줄 칸 없이 그 사람 카드
  await paste('https://github.com/robot-arm-kim');
  s = await sheet();
  check(s.title !== '무슨 대화를 했나' && (await people()).length === 3, '이미 있는 사람을 다시 읽으면 새 줄 없이 그 사람 카드가 열린다');
  await page.locator('.pcard button', { hasText: '닫기' }).click();

  // ---- 키보드: 보이는 높이가 줄면 창이 그만큼 올라온다 ----
  await page.evaluate(() => {
    const fake = new EventTarget();
    Object.assign(fake, { height: innerHeight, offsetTop: 0, scale: 1, width: innerWidth });
    Object.defineProperty(window, 'visualViewport', { configurable: true, get: () => fake });
    window.__vv = fake;
    location.hash = '#/people';
  });
  await settle();
  await page.evaluate(() => { location.hash = '#/people/new'; });
  await page.locator('h1', { hasText: '남의 명함 받기' }).waitFor();
  await settle();
  await paste('github.com/keyboard-up');
  const KB = 336;
  const lifted = await page.evaluate((kb) => {
    window.__vv.height = innerHeight - kb;
    window.__vv.dispatchEvent(new Event('resize'));
    const r = document.querySelector('input[name=talk]').getBoundingClientRect();
    const p = document.querySelector('.pcard').getBoundingClientRect();
    return { input: r.bottom, sheet: p.bottom, top: innerHeight - kb };
  }, KB);
  check(lifted.sheet <= lifted.top + 1 && lifted.input <= lifted.top, `키보드(${KB}px)가 뜨면 창 아래끝이 키보드 위(${Math.round(lifted.sheet)} ≤ ${lifted.top})에 있고 칸이 가리지 않는다`);
  if (SHOTS) {
    await page.evaluate((kb) => { const k = document.createElement('div'); k.id = '__kb'; k.textContent = '키보드 자리 (흉내)'; Object.assign(k.style, { position: 'fixed', left: 0, right: 0, bottom: 0, height: `${kb}px`, background: '#c9c9c9', color: '#333', display: 'grid', placeItems: 'center', font: '700 16px sans-serif', zIndex: 99 }); document.body.append(k); }, KB);
    await shot('5-후-키보드가-떴을때-흉내-390.png');
    await page.evaluate(() => document.getElementById('__kb').remove());
  }
  await page.evaluate(() => { window.__vv.height = innerHeight; window.__vv.dispatchEvent(new Event('resize')); });
  check(await page.evaluate(() => document.querySelector('.pcard-back').style.bottom === ''), '키보드가 내려가면 창도 제자리로');
  await page.getByRole('button', { name: '넘기기', exact: true }).click();

  // ---- ① 앱 안 카메라 길 (카메라와 QR 읽기를 흉내 낸다) ----
  await fresh();
  await page.evaluate(() => {
    window.BarcodeDetector = class { detect() { return Promise.resolve(window.__qr ? [{ rawValue: window.__qr }] : []); } };
    const c = document.createElement('canvas'); c.width = 64; c.height = 64; c.getContext('2d').fillRect(0, 0, 64, 64);
    navigator.mediaDevices.getUserMedia = async () => c.captureStream(5);
    location.hash = '#/people';
  });
  await settle();
  await page.evaluate(() => { location.hash = '#/people/new'; });
  await page.getByRole('button', { name: '카메라 켜기' }).waitFor();
  await settle();
  check(await page.getByRole('button', { name: '카메라 켜기' }).isEnabled(), '카메라가 되는 폰: "카메라 켜기"가 눌린다');
  await shot('1-전-받기화면-카메라-390.png');
  await page.getByRole('button', { name: '카메라 켜기' }).click();
  await page.getByRole('button', { name: '그만 읽기' }).waitFor();
  await page.evaluate(() => { window.__qr = 'https://www.linkedin.com/in/booth-lee'; });
  await page.locator('.pcard-back:not([hidden])').waitFor();
  await settle(300);
  s = await sheet();
  check(s.title === '무슨 대화를 했나' && s.inputs === 1 && s.buttons.join(',') === '넘기기', '카메라: QR을 읽자마자 같은 한 줄 칸이 뜬다');
  check((await people()).length === 1, '카메라: 적기 전에 이미 폰에 남았다');
  check(await page.evaluate(() => !document.querySelector('video.scan-video').srcObject), '카메라: 읽으면 카메라는 꺼진다');
  await shot('6-후-한줄칸-카메라-390.png');
  await page.locator('input[name=talk]').fill('자율주행 센서 · 링크드인 팔로우');
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await page.locator('.pcard-note').waitFor();
  check((await people())[0].note === '자율주행 센서 · 링크드인 팔로우', '카메라: "저장"을 누르면 메모에 들어가고 카드가 열린다');
  await page.locator('.pcard button', { hasText: '닫기' }).click();
  await page.goto(`${URL}#/people`);
  await page.locator('.stops .stop').first().waitFor();
  check((await page.locator('.stops .stop').count()) === 1, '만난 사람 목록은 지금처럼(한 사람)');

  // ---- 360px · 글자 가장 큰 단계 · 어둡게 ----
  for (const [theme, name] of [['light', '7-후-360-가장큰글자.png'], ['dark', '8-후-360-가장큰글자-어둡게.png']]) {
    await fresh({ width: 360, height: 740, text: 4, theme, noReader: true });
    await paste('github.com/big-text');
    await page.locator('input[name=talk]').fill('로봇 팔 데모 · 채용 물어봄');
    s = await sheet();
    check(s.small === 0, `360px · 글자 4단계 · ${theme}: 누르는 곳이 모두 44px 이상`);
    await noSideScroll(`360px · 글자 4단계 · ${theme}`);
    await shot(name);
  }
  return checks.map((c) => `됨 | ${c.what}`).join('\n');
}
