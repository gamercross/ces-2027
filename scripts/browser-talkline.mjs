// Playwright CLI test for R61: 남의 명함을 받자마자 "무슨 대화를 했나" 두 칸(대화 한 줄 · 이름). 390 x 844 폰 크기, 밝게 (360 · 390 × 글자 네 단계도).
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
  check(s.title === '무슨 대화를 했나', '붙여넣기: 사람이 남자마자 "무슨 대화를 했나" 창이 뜬다');
  check(s.inputs === 2 && s.buttons.join(',') === '넘기기', `칸은 둘(대화 한 줄 · 이름), 단추는 글자 단추 "넘기기" 하나다(${s.inputs} · ${s.buttons.join(',')})`);
  check(await page.evaluate(() => { const [a, b] = [...document.querySelectorAll('.pcard input')]; return a.name === 'talk' && b.name === 'nick' && a.getBoundingClientRect().top < b.getBoundingClientRect().top; }), '대화 한 줄이 위, 이름이 아래');
  check(s.focused === 'talk', '대화 칸에 바로 손이 간다(키보드가 그대로 남는다)');
  check((await page.locator('input[name=talk]').getAttribute('placeholder')) === '예: 로봇 팔 데모 · 채용 물어봄', '예시 글 하나');
  check(Number(await page.locator('input[name=talk]').getAttribute('maxlength')) === 200 && Number(await page.locator('.pcard input[name=nick]').getAttribute('maxlength')) === 20, '글자 수 한도 200 · 20(고치기의 메모 · 이름 칸과 같다)');
  let list = await people();
  check(list.length === 1 && list[0].note === '' && list[0].nick === '', '적기 전에 이미 폰에 남았다');
  await shot('1-두칸-붙여넣기-아이폰-390.png');
  await page.locator('input[name=talk]').fill('로봇 팔 데모 · 채용 물어봄');
  s = await sheet();
  check(s.buttons.join(',') === '넘기기,저장', '적으면 "저장"이 나온다');
  await page.locator('input[name=talk]').press('Enter');
  await settle(200);
  s = await sheet();
  check(s && s.focused === 'nick', '대화 칸에서 엔터 → 이름 칸으로 간다(창은 그대로)');
  await page.locator('.pcard input[name=nick]').fill('김로봇');
  await shot('2-두칸-적는중-390.png');
  await page.locator('.pcard input[name=nick]').press('Enter');
  await page.locator('.pcard-note').waitFor();
  list = await people();
  check(list.length === 1 && list[0].note === '로봇 팔 데모 · 채용 물어봄' && list[0].nick === '김로봇', '이름 칸에서 엔터 → 저장. 한 줄은 메모, 이름은 부르는 이름에 들어간다(새 칸이 아니다)');
  check((await page.locator('.pcard-name').textContent()) === '김로봇' && (await page.locator('.pcard .contacts').textContent()).includes('github.com/robot-arm-kim'), '이름을 적으면 카드 제목이 이름이고 주소는 그 아래 줄');
  check((await page.locator('.pcard-note').textContent()) === '로봇 팔 데모 · 채용 물어봄', '카드에 대화 한 줄이 보인다');
  await shot('3-이름적은뒤-카드-390.png');
  await page.locator('.pcard button', { hasText: '고치기' }).click();
  check((await page.locator('.pcard textarea[name=note]').inputValue()) === '로봇 팔 데모 · 채용 물어봄' && (await page.locator('.pcard input[name=nick]').inputValue()) === '김로봇', '고치기의 메모 · 이름 칸에 같은 글이 있다');
  await page.locator('.pcard button', { hasText: '닫기' }).click();
  await page.locator('.pcard button', { hasText: '닫기' }).click();
  await noSideScroll('명함 받기');

  // 넘기기: 비워도 저장돼 있다
  await paste('github.com/skip-me');
  await page.getByRole('button', { name: '넘기기', exact: true }).click();
  await settle(300);
  list = await people();
  check(!(await page.locator('.pcard-back:not([hidden])').count()) && list.length === 2 && list.some((p) => p.links[0].key === 'github:skip-me' && p.note === '' && p.nick === ''), '"넘기기"를 누르면 창만 닫히고 사람은 이미 남아 있다');
  check((await page.locator('p[role=status]', { hasText: '폰에 남겼다' }).count()) >= 1, '받기 화면에 "폰에 남겼다" 한 줄이 남는다');
  // 이름만 적어도 저장
  await paste('github.com/only-name');
  await page.locator('.pcard input[name=nick]').fill('수아');
  s = await sheet();
  check(s.buttons.join(',') === '넘기기,저장', '이름만 적어도 "저장"이 나온다');
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await page.locator('.pcard-name', { hasText: '수아' }).waitFor();
  list = await people();
  check(list.some((p) => p.links[0].key === 'github:only-name' && p.nick === '수아' && p.note === ''), '이름만 적고 저장하면 이름만 들어가고 메모는 비어 있다');
  await page.locator('.pcard button', { hasText: '닫기' }).click();
  // 둘 다 빈 채 엔터 두 번 = 넘기기
  await paste('github.com/enter-empty');
  await page.locator('input[name=talk]').press('Enter');
  await page.locator('.pcard input[name=nick]').press('Enter');
  await settle(300);
  check(!(await page.locator('.pcard-back:not([hidden])').count()) && (await people()).length === 4, '둘 다 빈 채 엔터는 넘기기와 같다');
  // 이미 있는 사람: 칸 없이 그 사람 카드
  await paste('https://github.com/robot-arm-kim');
  s = await sheet();
  check(s.title === '김로봇' && (await people()).length === 4, '이미 있는 사람을 다시 읽으면 새 줄 없이 그 사람 카드가 열린다');
  await page.locator('.pcard button', { hasText: '닫기' }).click();
  // 이름 없이 넘긴 사람의 카드: 제목은 지금처럼 주소
  await page.evaluate(() => { location.hash = '#/people'; });
  await page.locator('.stops .stop').first().waitFor();
  await page.locator('.stops .stop-open', { hasText: 'github.com/skip-me' }).click();
  await page.locator('.pcard-name').waitFor();
  check((await page.locator('.pcard-name').textContent()) === 'github.com/skip-me', '이름 없이 넘긴 사람의 카드 제목은 지금처럼 주소');
  await settle(300);
  await shot('4-이름없이-넘긴-카드-390.png');
  await page.locator('.pcard button', { hasText: '닫기' }).click();

  // ---- 키보드: 보이는 높이가 줄면 창이 그만큼 올라온다 ----
  await page.evaluate(() => {
    const fake = new EventTarget();
    Object.assign(fake, { height: innerHeight, offsetTop: 0, scale: 1, width: innerWidth });
    Object.defineProperty(window, 'visualViewport', { configurable: true, get: () => fake });
    window.__vv = fake;
    location.hash = '#/people/new';
  });
  await page.locator('h1', { hasText: '남의 명함 받기' }).waitFor();
  await settle();
  await paste('github.com/keyboard-up');
  const KB = 336;
  const lifted = await page.evaluate((kb) => {
    window.__vv.height = innerHeight - kb;
    window.__vv.dispatchEvent(new Event('resize'));
    const low = Math.max(...[...document.querySelectorAll('.pcard input')].map((x) => x.getBoundingClientRect().bottom));
    const p = document.querySelector('.pcard').getBoundingClientRect();
    return { input: low, sheet: p.bottom, top: innerHeight - kb };
  }, KB);
  check(lifted.sheet <= lifted.top + 1 && lifted.input <= lifted.top, `키보드(${KB}px)가 뜨면 창 아래끝이 키보드 위(${Math.round(lifted.sheet)} ≤ ${lifted.top})에 있고 두 칸이 가리지 않는다`);
  if (SHOTS) {
    await page.evaluate((kb) => { const k = document.createElement('div'); k.id = '__kb'; k.textContent = '키보드 자리 (흉내)'; Object.assign(k.style, { position: 'fixed', left: 0, right: 0, bottom: 0, height: `${kb}px`, background: '#c9c9c9', color: '#333', display: 'grid', placeItems: 'center', font: '700 16px sans-serif', zIndex: 99 }); document.body.append(k); }, KB);
    await shot('5-키보드가-떴을때-흉내-390.png');
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
  await page.getByRole('button', { name: '카메라 켜기' }).click();
  await page.getByRole('button', { name: '그만 읽기' }).waitFor();
  await page.evaluate(() => { window.__qr = 'https://www.linkedin.com/in/booth-lee'; });
  await page.locator('.pcard-back:not([hidden])').waitFor();
  await settle(300);
  s = await sheet();
  check(s.title === '무슨 대화를 했나' && s.inputs === 2 && s.buttons.join(',') === '넘기기', '카메라: QR을 읽자마자 같은 두 칸 창이 뜬다');
  check((await people()).length === 1, '카메라: 적기 전에 이미 폰에 남았다');
  check(await page.evaluate(() => !document.querySelector('video.scan-video').srcObject), '카메라: 읽으면 카메라는 꺼진다');
  await shot('6-두칸-카메라-390.png');
  await page.locator('input[name=talk]').fill('자율주행 센서 · 링크드인 팔로우');
  await page.locator('.pcard input[name=nick]').fill('이부스');
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await page.locator('.pcard-note').waitFor();
  const cam = (await people())[0];
  check(cam.note === '자율주행 센서 · 링크드인 팔로우' && cam.nick === '이부스' && (await page.locator('.pcard-name').textContent()) === '이부스', '카메라: "저장"을 누르면 메모 · 이름에 들어가고 카드 제목이 이름');
  await page.locator('.pcard button', { hasText: '닫기' }).click();
  await page.goto(`${URL}#/people`);
  await page.locator('.stops .stop').first().waitFor();
  check((await page.locator('.stops .stop').count()) === 1 && (await page.locator('.stops .name').first().textContent()) === '이부스', '만난 사람 목록은 지금처럼(한 사람, 이름으로)');

  // ---- 360 · 390px · 글자 네 단계 (가장 큰 단계는 밝게 · 어둡게 그림) ----
  for (const width of [360, 390]) for (const text of [1, 2, 3, 4]) for (const theme of text === 4 && width === 360 ? ['light', 'dark'] : ['light']) {
    await fresh({ width, height: width === 360 ? 740 : 844, text, theme, noReader: true });
    await paste('github.com/big-text');
    await page.locator('input[name=talk]').fill('로봇 팔 데모 · 채용 물어봄');
    await page.locator('.pcard input[name=nick]').fill('김로봇');
    s = await sheet();
    check(s.small === 0, `${width}px · 글자 ${text}단계 · ${theme}: 누르는 곳이 모두 44px 이상`);
    await noSideScroll(`${width}px · 글자 ${text}단계 · ${theme}`);
    if (width === 360 && text === 4) await shot(theme === 'light' ? '7-360-가장큰글자.png' : '8-360-가장큰글자-어둡게.png');
  }
  return checks.map((c) => `됨 | ${c.what}`).join('\n');
}
