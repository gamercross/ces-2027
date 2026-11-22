// Playwright CLI test for R48: 설정 "관심 회사 링크"(공식 전시사 쪽 링크를 줄마다 글로 복사 · 파일로). 360 · 390px 폰 크기, 밝게, 글자 크기 네 단계.
// Run with: playwright-cli open about:blank
//           playwright-cli run-code "$(cat scripts/browser-links.mjs)"
// The app must be served from a stamped dist at http://127.0.0.1:47571/ (자료가 있는 지은 것).
// SHOTS를 채우면(레포 바탕의 상대 경로) 설정 줄 · 복사한 뒤 · 관심 회사가 없을 때 그림을 그 폴더에 남긴다.
async (page) => {
  const URL = 'http://127.0.0.1:47571/';
  const SHOTS = '';
  const check = (ok, what) => { if (!ok) throw new Error(`안 됨: ${what}`); console.log(`됨 | ${what.slice(0, 150)}`); };
  const settle = (ms = 400) => page.waitForTimeout(ms);
  const shot = async (name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}${name}` }); };
  const readDownload = async (dl) => { const s = await dl.createReadStream(); const chunks = []; for await (const c of s) chunks.push(c); return Buffer.concat(chunks).toString('utf8'); };

  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  const requests = [];
  page.on('request', (r) => requests.push(r.url()));
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto(URL);
  await page.evaluate(async () => { for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister(); for (const k of await caches.keys()) await caches.delete(k); localStorage.clear(); sessionStorage.clear(); });
  const ex = await page.evaluate(async () => { const d = await (await fetch('data/exhibitors.json')).json(); return { link: d.link, rows: d.ex.slice(0, 3).map((x) => ({ id: x[0], name: x[1] })) }; });
  const seed = (list) => page.evaluate((l) => {
    localStorage.setItem('ces2027.theme.v1', JSON.stringify('light'));
    localStorage.setItem('ces2027.profile.v1', JSON.stringify({ nick: '시험', tag: 'stu', line: '', github: '', discord: '' }));
    localStorage.setItem('ces2027.paper.v1', JSON.stringify({ has: true, asked: '2026-11-22', remindOn: '2027-01-01' }));
    localStorage.setItem('ces2027.interests.v1', JSON.stringify(l));
  }, list);

  // 1. 관심 회사가 없으면 단추는 눌리지 않고 이유를 한 줄로 말한다
  await seed([]);
  await page.goto('about:blank');
  await page.goto(`${URL}#/settings`);
  await page.locator('.setlist').waitFor();
  await settle();
  const row0 = page.locator('.setrow', { hasText: '회사 링크' });
  check((await row0.count()) === 1 && (await row0.textContent()).includes('관심 회사가 아직 없다') && (await row0.locator('button:disabled').count()) === 2, '관심 회사가 없으면 줄에 "관심 회사가 아직 없다"가 있고 두 단추는 눌리지 않는다');
  await row0.scrollIntoViewIfNeeded();
  await shot('180-links-empty.png');

  // 2. 관심 회사가 있으면: 주소 줄 수가 보이고, 하나는 자료에서 빠진 회사(건너뛴다)
  await seed([{ id: ex.rows[0].id, day: 1 }, { id: ex.rows[1].id, day: 2, seen: true }, { id: 'NO-SUCH-ID', day: 0 }, { id: ex.rows[2].id, day: 1 }]);
  requests.length = 0;
  await page.goto('about:blank');
  await page.goto(`${URL}#/settings`);
  await page.locator('.setlist').waitFor();
  await settle();
  const row = page.locator('.setrow', { hasText: '회사 링크' });
  check((await row.textContent()).includes('관심 회사 4곳의 공식 주소') && (await row.locator('button').allTextContents()).join() === '복사,파일로', `줄에 "관심 회사 4곳의 공식 주소"과 글자 단추 둘(복사 · 파일로)이 있다`);
  check(!requests.some((u) => /exhibitors\.json|data\/halls/.test(u)), '설정 화면을 열 때는 전시사 자료를 받지 않는다(누를 때만)');
  await row.scrollIntoViewIfNeeded();
  await shot('181-links-row.png');

  // 3. 복사: 줄마다 "회사 이름 — 공식 주소"
  await row.getByRole('button', { name: '관심 회사 공식 링크 복사' }).click();
  const hint = row.locator('xpath=following-sibling::li[1]').locator('.setrow-hint');
  await hint.waitFor({ state: 'visible' });
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  const lines = clip.trim().split('\n');
  const want = (r) => `${r.name} — ${ex.link.replace('{id}', encodeURIComponent(r.id))}`;
  check(lines.length === 4 && /^CES 2027 관심 회사 3곳의 공식 전시사 쪽 링크 \(자료 \d{4}-\d\d-\d\d에 받음\)$/.test(lines[0]), `복사한 글의 머리는 "관심 회사 3곳"이다(자료에서 빠진 하나는 건너뛴다): ${lines[0]}`);
  check(lines[1] === want(ex.rows[0]) && lines[2] === want(ex.rows[1]) && lines[3] === want(ex.rows[2]), '그 아래는 관심 목록 차례로 줄마다 "회사 이름 — 공식 주소"다');
  check(lines.slice(1).every((l) => /^.+ — https:\/\/exhibitors\.ces\.tech\/.+exhid=\S+$/.test(l)), '주소는 모두 CES 공식 전시사 쪽(https://exhibitors.ces.tech)이다');
  check((await hint.textContent()) === '3곳의 링크를 복사했다.', '"3곳의 링크를 복사했다."로 알린다');
  await row.scrollIntoViewIfNeeded();
  await shot('182-links-copied.png');

  // 4. 파일로: 같은 글
  const [dl] = await Promise.all([page.waitForEvent('download'), row.getByRole('button', { name: '관심 회사 공식 링크 파일로' }).click()]);
  check(dl.suggestedFilename() === 'ces2027-관심회사-공식링크.txt' && (await readDownload(dl)) === clip, `파일로 내려받으면 복사한 것과 같은 글이다 (${dl.suggestedFilename()})`);

  // 5. 로그인하지 않는다 · 어디로도 보내지 않는다: 이 화면에서 바깥 주소로 나간 요청이 없다
  check(!requests.some((u) => !u.startsWith(URL)), `바깥 주소로 나간 요청이 없다 (${requests.filter((u) => !u.startsWith(URL)).join(' ') || '없음'})`);

  // 6. 360 · 390px × 글자 네 단계
  await seed([{ id: ex.rows[0].id, day: 1 }, { id: ex.rows[1].id, day: 2 }]);
  const results = [];
  for (const W of [360, 390]) {
    for (let n = 1; n <= 4; n++) {
      await page.setViewportSize({ width: W, height: 740 });
      await page.evaluate((s) => localStorage.setItem('ces2027.text.v1', JSON.stringify(s)), n);
      await page.goto('about:blank');
      await page.goto(`${URL}#/settings`);
      await page.locator('.setlist').waitFor();
      await settle(300);
      const a = await page.evaluate((w) => {
        const r = [...document.querySelectorAll('.setrow')].find((x) => x.textContent.includes('회사 링크'));
        const rb = r.getBoundingClientRect();
        const btns = [...r.querySelectorAll('button')].map((b) => b.getBoundingClientRect());
        const main = r.querySelector('.setrow-main').getBoundingClientRect();
        return { w, side: document.documentElement.scrollWidth > w, rowH: Math.round(rb.height), small: btns.filter((b) => b.width < 43.5 || b.height < 43.5).length, inside: btns.every((b) => b.right <= rb.right + 1) && main.right <= btns[0].left + 1, gap: Math.round(btns[1].left - btns[0].right) };
      }, W);
      results.push(a);
      check(!a.side && a.rowH >= 56 && a.small === 0 && a.inside && a.gap >= 0, `${W}px · 글자 ${n}단계: 가로 넘침 없음 · 줄 높이 ${a.rowH}px · 단추 둘이 44px 이상이고 글과 겹치지 않는다`);
      if (W === 360 && n === 4) { await page.locator('.setrow', { hasText: '회사 링크' }).scrollIntoViewIfNeeded(); await shot('183-links-text4.png'); }
    }
  }
  await page.evaluate(() => localStorage.setItem('ces2027.text.v1', JSON.stringify(1)));
  return `됨: R48 관심 회사 링크 (${results.length}가지 크기 · 글자 단계 + 기능)`;
}
