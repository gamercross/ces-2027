// Playwright CLI test for R40 ~ R41 (대화 칸 · 붙여넣기) and the removal of the translation screens (2026-11-22). 360 x 740 폰 크기.
// Run with: playwright-cli open about:blank
//           playwright-cli run-code "$(cat scripts/browser-talk.mjs)"
// The app must be served from a stamped dist at http://127.0.0.1:47130/ (exhibitors.json 자료가 있는 지은 것).
// SHOTS를 채우면(레포 바탕의 상대 경로) 화면 그림을 그 폴더에 남긴다.
async (page) => {
  const URL = 'http://127.0.0.1:47130/';
  const SHOTS = 'docs/screens/';
  const checks = [];
  const check = (ok, what) => {
    checks.push({ ok, what });
    if (!ok) throw new Error(`안 됨: ${what}`);
  };
  const noSideScroll = async (what) => check(await page.evaluate(() => document.documentElement.scrollWidth <= 360), `${what}: 360px 폭에서 옆으로 밀리지 않는다`);
  await page.setViewportSize({ width: 360, height: 740 });
  await page.addInitScript(() => {
    if (!localStorage.getItem('ces2027.profile.v1')) localStorage.setItem('ces2027.profile.v1', JSON.stringify({ nick: '시험', tag: 'stu', github: '', discord: '' }));
    window.__calls = [];
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (t) => { window.__calls.push(['copy', t]); }, readText: async () => '' } });
    window.open = (...a) => { window.__calls.push(['open', a[0]]); return null; };
  });
  await page.goto(URL);
  // 같은 주소에서 먼저 열었던 다른 판의 서비스 워커와 담아 둔 것을 지운다.
  await page.evaluate(async () => {
    for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
    for (const k of await caches.keys()) await caches.delete(k);
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.reload();
  const first = await page.evaluate(async () => { const d = await (await fetch('data/exhibitors.json')).json(); return { id: d.ex[0][0], name: d.ex[0][1] }; });

  // 1. 번역 화면은 없다 (번역 앱 준비 · 물어볼 말 · 깊은 설정은 2026-11-22에 지웠다)
  for (const gone of ['translate', 'ask', 'deep']) {
    await page.goto(`${URL}#/${gone}`);
    await page.getByRole('heading', { name: '없는 화면이다' }).waitFor();
  }
  check(true, '번역 앱 준비 · 물어볼 말 · 깊은 설정 주소는 "없는 화면이다"로 열린다');

  // 2. 회사 카드
  await page.goto(`${URL}#/find`);
  await page.locator('input[type=search]').fill(first.name);
  await page.locator('#view .hits li').first().waitFor();
  const row = page.locator('#view .hits li').first();
  check(await row.getByRole('link', { name: '대화' }).count() === 1 && await row.getByRole('button', { name: '번역 앱' }).count() === 0, '회사 카드: "대화" 단추가 있고 "번역 앱" 단추는 없다');
  await noSideScroll('회사 카드');

  // 3. 대화 칸: 붙여넣기 → 나누기 → 일기 초안
  await page.goto(`${URL}#/talk/${encodeURIComponent(first.id)}`);
  await page.getByRole('heading', { name: /^대화 · /, level: 1 }).waitFor();
  await page.getByLabel('붙여 넣을 대화').fill('Papago\n2027.01.06. 오후 2:31\nHello, welcome to our booth.\n안녕하세요, 저희 부스에 오신 것을 환영합니다.\n\nHow much is the base model?\n기본 모델은 얼마예요?\n\nIt costs $99.\n99달러입니다.');
  await page.getByRole('button', { name: '나누기', exact: true }).click();
  await page.getByRole('heading', { name: '넣을 대화 3줄' }).waitFor();
  check(await page.locator('#view .heard li').count() === 3, '붙여넣기: 파파고 꼴 글이 세 짝으로 나뉜다');
  await page.getByRole('button', { name: '말한 사람 바꾸기' }).first().click();
  check((await page.locator('#view .heard li .tag').first().innerText()) === '나', '붙여넣기: "말한 사람 바꾸기"가 상대 ↔ 나를 바꾼다');
  await page.getByRole('button', { name: '말한 사람 바꾸기' }).first().click();
  await noSideScroll('대화 칸');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}57-talk-paste.png`, fullPage: false });
  await page.getByRole('button', { name: '초안 만들기' }).click();
  await page.getByRole('heading', { name: '일기 초안 다듬기' }).waitFor();
  const saw = await page.locator('textarea[name=saw]').inputValue();
  check(saw.includes('Hello, welcome to our booth. / How much is the base model? / It costs $99.') && !saw.includes('안녕하세요') && !saw.includes('99달러'), '일기 초안: 들은 것 칸에 상대가 한 영어 원문 줄만 들어간다 (번역 줄은 없다)');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}58-talk-diary-draft.png` });
  await page.getByRole('button', { name: '폰에 남기기' }).click();
  await page.getByRole('heading', { name: '일기' }).first().waitFor();
  const stored = await page.evaluate(() => ({ talks: JSON.parse(localStorage.getItem('ces2027.talks.v1') || '[]'), diary: JSON.parse(localStorage.getItem('ces2027.diary.v1') || '[]') }));
  check(stored.talks.length === 1 && stored.talks[0].pairs.length === 3 && stored.diary.length === 1 && stored.diary[0].talkId === stored.talks[0].id && stored.diary[0].draft === undefined, '대화는 폰에 남고, 다듬어 남긴 일기가 그 대화와 이어져 있다');

  // 4. 짝을 못 지으면 한 덩어리 · 손으로
  await page.goto(`${URL}#/talk/${encodeURIComponent(first.id)}`);
  await page.getByLabel('붙여 넣을 대화').fill('Hello\nHow are you');
  await page.getByRole('button', { name: '나누기', exact: true }).click();
  await page.getByRole('heading', { name: /한 덩어리/ }).waitFor();
  await page.getByRole('button', { name: '비우기' }).click();
  await page.getByRole('button', { name: '손으로', exact: true }).click();
  await page.getByLabel('들은 말이나 한 말', { exact: true }).first().fill('Nice to meet you');
  check(await page.getByLabel('번역', { exact: true }).count() === 0, '손으로 넣기: 번역 칸이 없다');
  await page.getByRole('button', { name: '줄 넣기' }).click();
  await page.getByRole('heading', { name: '넣을 대화 1줄' }).waitFor();
  await page.getByRole('button', { name: '대화만 저장' }).click();
  await page.getByRole('heading', { name: '이 회사와 한 대화 2개' }).waitFor();
  check(true, '짝을 못 지은 글은 한 덩어리로 보이고, 손으로 넣은 줄을 저장하면 이 회사의 대화가 둘이 된다');

  // 5. 파일로 내려받기에 대화가 든다
  await page.goto(`${URL}#/diary`);
  await page.getByRole('button', { name: '전부 파일로' }).waitFor();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '전부 파일로' }).click()]);
  const chunks = [];
  for await (const chunk of await download.createReadStream()) chunks.push(chunk);
  const file = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  check(file.talks?.length === 2 && file.entries.length === 1 && !JSON.stringify(file).includes('audio') && !('talkId' in file.entries[0]), '내보내기 파일에 일기와 대화가 들어 있고 녹음은 없다');

  // 6. 듣기에는 번역 칸이 없다
  await page.goto(`${URL}#/listen`);
  await page.getByRole('heading', { name: '듣기' }).waitFor();
  const listenText = await page.locator('#view').innerText();
  check(!/번역|한국어로|물어볼 말|깊은 설정/.test(listenText) && listenText.includes('받아쓰기') && listenText.includes('손으로 적기'), '듣기: 번역 · 한국어로 · 물어볼 말 · 깊은 설정이 없고 받아쓰기와 손으로 적기는 있다');
  await noSideScroll('듣기');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}60-listen.png` });
  return checks.map((c) => `됨 | ${c.what}`).join('\n');
}
