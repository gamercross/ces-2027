// Playwright CLI test for R49: 일기 사진 한 장. 360 · 390px 폰 크기, 밝게, 글자 크기 네 단계.
// Run with: playwright-cli open about:blank
//           playwright-cli run-code "$(cat scripts/browser-photo.mjs)"
// The app must be served from a stamped dist at http://127.0.0.1:47571/ (자료가 있는 지은 것).
// SHOTS를 채우면(레포 바탕의 상대 경로) 쓰기 칸 · 카드 · 저장 공간 모자람 · 한 장 그림을 그 폴더에 남긴다.
// 사진은 지어낸 것이다(화면에서 만든 무늬). 진짜 사람 사진을 넣지 않는다.
async (page) => {
  const URL = 'http://127.0.0.1:47571/';
  const SHOTS = '';
  const check = (ok, what) => { if (!ok) throw new Error(`안 됨: ${what}`); console.log(`됨 | ${what.slice(0, 120)}`); };
  const settle = (ms = 500) => page.waitForTimeout(ms);
  const shot = async (name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}${name}` }); };
  const readDownload = async (dl) => { const s = await dl.createReadStream(); const chunks = []; for await (const c of s) chunks.push(c); return Buffer.concat(chunks).toString('utf8'); };

  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto(URL);
  await page.evaluate(async () => { for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister(); for (const k of await caches.keys()) await caches.delete(k); localStorage.clear(); sessionStorage.clear(); });
  await page.evaluate(() => { localStorage.setItem('ces2027.theme.v1', JSON.stringify('light')); localStorage.setItem('ces2027.profile.v1', JSON.stringify({ nick: '시험', tag: 'stu', line: '', github: '', discord: '' })); localStorage.setItem('ces2027.paper.v1', JSON.stringify({ has: true, asked: '2026-11-22', remindOn: '2027-01-01' })); });

  // 지어낸 큰 사진: 2400 x 1600의 알록달록한 잡음 무늬(줄이기가 일해야 150KB 안에 든다)
  await page.goto('about:blank');
  const makePng = (w, h) => page.evaluate(async ([W, H]) => {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'); const d = g.createImageData(W, H);
    for (let i = 0; i < d.data.length; i += 4) { d.data[i] = Math.random() * 255; d.data[i + 1] = (i / 4 % W) / W * 255; d.data[i + 2] = Math.random() * 255; d.data[i + 3] = 255; }
    g.putImageData(d, 0, 0);
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    return await new Promise((resolve) => { const fr = new FileReader(); fr.onload = () => resolve(fr.result.split(',')[1]); fr.readAsDataURL(blob); });
  }, [w, h]);
  const BIG = { name: 'booth-photo.png', mimeType: 'image/png', buffer: Buffer.from(await makePng(2400, 1600), 'base64') };
  // 크기 · 글자 단계를 돌며 여러 번 고를 때는 작은 것으로 (줄이기가 일하는 것은 위에서 이미 봤다)
  const MID = { name: 'booth-photo-small.png', mimeType: 'image/png', buffer: Buffer.from(await makePng(900, 600), 'base64') };
  const NOT_IMAGE = { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('사진이 아니다') };

  // 앱이 쓰는 같은 문(web/idb.js)으로 폰의 사진을 읽는다(없는 DB를 시험이 먼저 만들어 버리지 않게).
  const idbGet = (id) => page.evaluate(async (key) => { const { run } = await import('./idb.js'); const v = await run('photo', 'readonly', (s) => s.get(key)); return v ? { type: v.type, size: v.size } : null; }, id);
  const diaryEntries = () => page.evaluate(() => JSON.parse(localStorage.getItem('ces2027.diary.v1') || '[]'));
  const audit = (what, W) => page.evaluate(([label, w]) => {
    const view = document.querySelector('#view');
    const tabs = document.querySelector('.tabs').getBoundingClientRect();
    const visible = (n) => { const r = n.getBoundingClientRect(); const s = getComputedStyle(n); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
    const small = [...view.querySelectorAll('button, a.btn, a.pick')].filter((n) => visible(n) && !n.classList.contains('file-hidden')).filter((n) => { const r = n.getBoundingClientRect(); return r.height < 43.5 || r.width < 43.5; }).map((n) => `${n.className}:${Math.round(n.getBoundingClientRect().width)}x${Math.round(n.getBoundingClientRect().height)}`);
    const wide = [...view.querySelectorAll('img.photo')].filter(visible).some((n) => n.getBoundingClientRect().right > w + 1);
    const tiny = [...view.querySelectorAll('*')].filter((n) => visible(n) && [...n.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim()) && parseFloat(getComputedStyle(n).fontSize) < 12.5).length;
    return { label, side: document.documentElement.scrollWidth > w, small, tiny, wide };
  }, [what, W]);

  // 1. 일기 쓰기: 사진 칸이 있고, 사진이 아닌 파일은 거절한다
  await page.goto(`${URL}#/diary/new`);
  await page.locator('form.form').waitFor();
  await settle();
  const field = page.locator('.photo-field');
  check((await field.count()) === 1 && (await field.locator('.label').textContent()).includes('사진 (한 장, 선택)') && (await field.locator('.pick', { hasText: '사진 넣기' }).count()) === 1 && (await field.locator('.pick', { hasText: '사진 빼기' }).isHidden()), '쓰기 칸에 "사진 (한 장, 선택)"과 "사진 넣기"가 있고 "사진 빼기"는 숨어 있다');
  await field.scrollIntoViewIfNeeded();
  await shot('160-photo-form-empty.png');
  await field.locator('.file-hidden').setInputFiles([NOT_IMAGE]);
  await page.getByText('이 사진을 읽지 못했다').waitFor();
  check((await field.locator('img.photo').isHidden()), '사진이 아닌 파일은 "이 사진을 읽지 못했다"로 거절하고 미리 보기가 없다');

  // 2. 큰 사진을 고르면 폰에서 줄인다: 긴 변 1024 · 150KB 안
  await field.locator('.file-hidden').setInputFiles([BIG]);
  await field.locator('img.photo').waitFor({ state: 'visible', timeout: 30000 });
  const note = await field.locator('.note').textContent();
  const m = note.match(/(\d+) × (\d+) · (\d+)KB로 줄였다/);
  check(m && Math.max(+m[1], +m[2]) <= 1024 && +m[3] <= 150 && +m[1] / +m[2] > 1.4 && +m[1] / +m[2] < 1.6, `큰 사진(2400x1600, ${(BIG.buffer.length / 1048576).toFixed(1)}MB)이 폰에서 줄었다: ${note}`);
  check((await field.locator('.pick', { hasText: '사진 바꾸기' }).count()) === 1 && (await field.locator('.pick', { hasText: '사진 빼기' }).isVisible()), '고른 뒤 "사진 바꾸기"와 "사진 빼기"가 보인다');
  check((await idbGet('none')) === null, '남기기 전에는 폰에 담지 않았다');
  await field.scrollIntoViewIfNeeded();
  await shot('161-photo-form-picked.png');
  await page.locator('textarea[name=saw]').fill('로봇 팔이 컵을 집어 옮긴다 (시험용 지어낸 글)');
  await page.locator('input[name=other]').fill('Alpha Robotics (지어낸 회사)');

  // 3. 저장 공간이 모자랄 때: 한 줄로 알리고 글도 남기지 않는다. 사진을 빼면 글만 남길 수 있다
  await page.evaluate(() => { const real = IDBObjectStore.prototype.put; window.__realPut = real; IDBObjectStore.prototype.put = function () { throw new DOMException('꾸민 저장 공간 모자람', 'QuotaExceededError'); }; });
  await page.getByRole('button', { name: '폰에 남기기' }).click();
  await page.locator('.error:not([hidden])').waitFor();
  const full = await page.locator('.error').textContent();
  check(full.includes('저장 공간이 모자라 사진을 못 담았다') && full.includes('사진 빼기') && (await diaryEntries()).length === 0, `저장 공간이 모자라면 안내 한 줄이 나오고 글도 남기지 않는다 (${full})`);
  await page.locator('.error').scrollIntoViewIfNeeded();
  await shot('162-photo-full.png');
  await page.evaluate(() => { IDBObjectStore.prototype.put = window.__realPut; });

  // 4. 남기기: 사진은 IndexedDB에, 글(localStorage)에는 표시만
  await page.getByRole('button', { name: '폰에 남기기' }).click();
  await page.locator('.stops .stop').first().waitFor();
  await settle();
  const saved = await diaryEntries();
  check(saved.length === 1 && saved[0].photo && saved[0].photo.bytes <= 150 * 1024 && saved[0].photo.w <= 1024 && !JSON.stringify(saved).includes('data:image'), '글에는 사진 표시(크기)만 있고 사진 자체는 글 저장소(localStorage)에 없다');
  const stored = await idbGet(saved[0].id);
  check(stored && stored.type === 'image/jpeg' && stored.size === saved[0].photo.bytes, `사진은 이 폰의 IndexedDB에 JPEG ${Math.round(stored.size / 1024)}KB로 담겼다`);
  await page.locator('.stop-open').first().click();
  await page.locator('.pcard .photo-box img.photo').waitFor();
  check((await page.locator('.pcard .photo-box .note').textContent()).includes('이 폰에만'), '일기 카드에 사진이 보이고 "이 폰에만" 안내가 있다');
  await shot('163-photo-card.png');
  await page.locator('.pcard-close').click();

  // 5. 파일로 내보내기(일기 탭 보내기): 사진이 그 파일에 들어간다
  const [dl1] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '보내기' }).click()]);
  const sent = JSON.parse(await readDownload(dl1));
  check(sent.v === 1 && sent.entries[0].photo.startsWith('data:image/jpeg;base64,') && sent.entries[0].photo.length < 210000 && sent.entries.length === 1, `보내기 파일에 사진이 들어간다 (판 번호 ${sent.v} 그대로, 사진 글자 ${Math.round(sent.entries[0].photo.length / 1024)}KB)`);
  await settle();
  check((await page.locator('.band .note, [role=status]').allTextContents()).join(' ').includes('사진 1장 포함'), '보냈다는 안내에 "사진 1장 포함"이 있다');

  // 6. 설정의 "파일로"도 같다
  await page.goto(`${URL}#/settings`);
  await page.locator('.setlist').waitFor();
  check((await page.locator('.setrow', { hasText: '내보내기' }).first().textContent()).includes('사진 1장'), '설정의 내보내기 줄에 "사진 1장"이 보인다');
  const [dl2] = await Promise.all([page.waitForEvent('download'), page.locator('.setrow', { hasText: '내보내기' }).first().getByRole('button', { name: '일기 · 대화 · 사진 전부 파일로' }).click()]);
  const all = JSON.parse(await readDownload(dl2));
  check(all.entries[0].photo === sent.entries[0].photo, '설정의 "파일로"에도 같은 사진이 들어간다');

  // 7. 받는 쪽: 사진이 든 파일을 모은 일기 열기가 깨지지 않고 읽고, 한 장에는 "사진 있음"만 적는다
  await page.goto(`${URL}#/collect`);
  await page.locator('.collectpage').waitFor();
  await page.locator('.file-hidden').setInputFiles([{ name: 'ces2027-일기-시험-사진.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(all)) }]);
  await page.locator('.coll-summary:not([hidden])').waitFor();
  check(/^일기 1개 · 쓴 사람 1명/.test(await page.locator('.coll-summary').textContent()) && (await page.locator('.coll-co').textContent()).includes('사진 있음'), '모은 일기 열기가 사진이 든 파일(약 ' + Math.round(JSON.stringify(all).length / 1024) + 'KB)을 읽고 카드에 "사진 있음"을 보인다');
  await shot('164-photo-collect.png');
  const [dl3] = await Promise.all([page.waitForEvent('download'), page.locator('.btn', { hasText: '한장.md 내려받기' }).click()]);
  const md = await readDownload(dl3);
  check(md.includes('- 사진 있음 (시험, ') && !md.includes('data:image') && md.length < 3000, `한장.md에는 사진을 넣지 않고 "사진 있음"만 적힌다 (${md.length}자)`);

  // 8. 고치기: 사진이 나오고, 빼면 폰에서도 지워진다
  await page.goto(`${URL}#/diary/edit/${saved[0].id}`);
  await page.locator('.photo-field img.photo').waitFor({ state: 'visible' });
  check((await page.locator('.photo-field .pick', { hasText: '사진 바꾸기' }).count()) === 1, '고치기에서 담아 둔 사진이 미리 보인다');
  await page.locator('.photo-field .pick', { hasText: '사진 빼기' }).click();
  check((await page.locator('.photo-field img.photo').isHidden()) && (await idbGet(saved[0].id)) !== null, '"사진 빼기"는 남기기를 누르기 전에는 폰의 사진을 지우지 않는다');
  await page.getByRole('button', { name: '폰에 남기기' }).click();
  await page.locator('.stops .stop').first().waitFor();
  await settle();
  check(!(await diaryEntries())[0].photo && (await idbGet(saved[0].id)) === null, '남기면 글에서 사진 표시도, 폰의 사진도 지워진다');

  // 9. 다시 넣고 일기를 지우면 사진도 같이 지워진다
  await page.goto(`${URL}#/diary/edit/${saved[0].id}`);
  await page.locator('form.form').waitFor();
  await page.locator('.photo-field .file-hidden').setInputFiles([BIG]);
  await page.locator('.photo-field img.photo').waitFor({ state: 'visible', timeout: 30000 });
  await page.getByRole('button', { name: '폰에 남기기' }).click();
  await page.locator('.stops .stop').first().waitFor();
  await settle();
  check((await idbGet(saved[0].id)) !== null, '다시 넣으면 폰에 사진이 있다');
  await page.locator('.stop-open').first().click();
  await page.locator('.pcard .warn-btn').click();
  await page.locator('.pcard .warn-btn').click();
  await settle(800);
  check((await diaryEntries()).length === 0 && (await idbGet(saved[0].id)) === null, '일기를 지우면 폰의 사진도 같이 지워진다');

  // 10. 사진 없는 옛 일기는 그대로 쓰인다 (기존 꼴)
  await page.evaluate(() => localStorage.setItem('ces2027.diary.v1', JSON.stringify([{ id: 'old1', date: '2027-01-06', exId: '', company: '옛 일기', booth: '', saw: '사진 없는 일기', felt: '', for: ['stu'], sent: null }])));
  await page.goto('about:blank');
  await page.goto(`${URL}#/diary`);
  await page.locator('.stops .stop').first().waitFor();
  await page.locator('.stop-open').first().click();
  await page.locator('.pcard').waitFor();
  check((await page.locator('.pcard .photo-box').count()) === 0, '사진 없는 옛 일기의 카드에는 사진 칸이 없다');
  await page.locator('.pcard-close').click();

  // 11. 360 · 390px × 글자 네 단계: 쓰기 칸(사진 들어간 채) · 카드
  const results = [];
  await page.evaluate(() => localStorage.removeItem('ces2027.diary.v1'));
  for (const W of [360, 390]) {
    for (let n = 1; n <= 4; n++) {
      await page.setViewportSize({ width: W, height: 740 });
      await page.evaluate((s) => localStorage.setItem('ces2027.text.v1', JSON.stringify(s)), n);
      await page.goto('about:blank');
      await page.goto(`${URL}#/diary/new`);
      await page.locator('form.form').waitFor();
      console.log(`  … ${W}px 글자 ${n}단계 사진 고르기`);
      await page.locator('.photo-field .file-hidden').setInputFiles([MID]);
      await page.locator('.photo-field img.photo').waitFor({ state: 'visible', timeout: 30000 });
      const a = await audit(`${W}px · 글자 ${n}단계 · 쓰기`, W);
      results.push(a);
      check(!a.side && a.small.length === 0 && a.tiny === 0 && !a.wide, `${a.label}: 가로 넘침 없음 · 누르는 곳 44px 이상 · 12px 글자 없음 · 사진이 칸 안에 든다 (${JSON.stringify(a)})`);
      if (W === 360 && n === 4) { await page.locator('.photo-field').scrollIntoViewIfNeeded(); await shot('165-photo-form-text4.png'); }
    }
  }
  await page.evaluate(() => localStorage.setItem('ces2027.text.v1', JSON.stringify(1)));
  return `됨: R49 일기 사진 한 장 (${results.length}가지 크기 · 글자 단계 + 기능)`;
}
