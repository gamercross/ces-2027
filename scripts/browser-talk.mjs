// Playwright CLI test for R39 ~ R41 (번역 앱 · 대화 칸 · 붙여넣기). 360 x 740 폰 크기.
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

  // 1. 번역 앱 준비
  await page.goto(`${URL}#/translate`);
  await page.getByRole('heading', { name: '번역 앱 준비' }).waitFor();
  const prepText = await page.locator('#view').innerText();
  check(['파파고', '구글 번역', '오프라인 팩', '플레이 스토어', '앱 스토어', '공식 도움말'].every((w) => prepText.includes(w)), '번역 앱 준비: 두 앱의 깔기 · 한국어 영어 오프라인 팩 · 공식 도움말이 보인다');
  await page.getByLabel('파파고 앱을 깔았다').check();
  await page.reload();
  await page.getByRole('heading', { name: '번역 앱 준비' }).waitFor();
  check(await page.getByLabel('파파고 앱을 깔았다').isChecked(), '번역 앱 준비: 체크가 폰에 남는다');
  await page.getByLabel('번역 앱에 넘길 글').fill('얼마예요?');
  await page.getByRole('button', { name: '파파고로 열기' }).click();
  const c1 = await page.evaluate(() => window.__calls);
  check(c1.some((c) => c[0] === 'copy' && c[1] === '얼마예요?') && c1.some((c) => c[0] === 'open' && c[1].startsWith('https://papago.naver.com/?sk=ko&tk=en&st=')), '번역 앱 열기: 글을 복사해 두고 파파고를 연다 (데스크톱 브라우저라 웹 번역 주소)');
  await noSideScroll('번역 앱 준비');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}55-translate-prep.png`, fullPage: false });

  // 2. 회사 카드
  await page.goto(`${URL}#/find`);
  await page.locator('input[type=search]').fill(first.name);
  await page.locator('#view .hits li').first().waitFor();
  const row = page.locator('#view .hits li').first();
  check(await row.getByRole('link', { name: '대화' }).count() === 1 && await row.getByRole('button', { name: '번역 앱' }).count() === 1, '회사 카드: "대화"와 "번역 앱" 단추가 있다');
  await page.evaluate(() => { window.__calls = []; });
  await row.getByRole('button', { name: '번역 앱' }).click();
  const c2 = await page.evaluate(() => window.__calls);
  check(c2.some((c) => c[0] === 'copy') && c2.some((c) => c[0] === 'open'), '회사 카드: 번역 앱을 누르면 복사하고 연다');
  await noSideScroll('회사 카드');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}56-company-translator.png` });

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
  await page.getByRole('button', { name: '저장하고 일기 초안 만들기' }).click();
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
  await page.getByLabel('원문', { exact: true }).fill('Nice to meet you');
  await page.getByLabel('번역', { exact: true }).fill('만나서 반갑습니다');
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

  // 6. 영한 모델은 앞 화면에서 권하지 않고 깊은 설정에 있다
  await page.goto(`${URL}#/ask`);
  await page.getByRole('heading', { name: '물어볼 말' }).waitFor();
  const askText = await page.locator('#view').innerText();
  check(!askText.includes('영한 번역 모델 받기') && askText.includes('번역 앱 열기') && askText.includes('깊은 설정'), '물어볼 말: 영한 번역 모델 받기를 권하지 않고 "번역 앱 열기"와 깊은 설정 링크가 있다');
  await noSideScroll('물어볼 말');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}59-ask-translator.png` });
  await page.goto(`${URL}#/listen`);
  await page.getByRole('heading', { name: '듣기' }).waitFor();
  check(!(await page.locator('#view').innerText()).includes('영한 번역 모델 받기'), '듣기: 영한 번역 모델 받기를 권하지 않는다');
  await page.goto(`${URL}#/deep`);
  await page.getByRole('heading', { name: '깊은 설정' }).waitFor();
  check((await page.locator('#view').innerText()).includes('폰 안 영한 번역 모델'), '깊은 설정: 폰 안 영한 번역 모델 칸이 있다 (기본 꺼짐)');
  await noSideScroll('깊은 설정');
  return checks.map((c) => `됨 | ${c.what}`).join('\n');
}
