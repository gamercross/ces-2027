// Playwright CLI test: 실제 아이폰(Safari)에서 찾은 것(11/22 폰 확인 1 · 2 · 4 · 5 · 8 · 9 · 10 · 11번). 360 x 740 · 390 x 780, 밝게 · 어둡게, 글자 기본 · 가장 크게.
// Run with: playwright-cli open about:blank                                      (Chromium)
//           playwright-cli open --browser=webkit --device="iPhone 15" about:blank  (WebKit, 아이폰 기기 프로필)
//           playwright-cli run-code "$(cat scripts/browser-phone.mjs)"
// The app must be served from a stamped dist at http://127.0.0.1:47571/ (자료가 있는 지은 것, 세션 일정 data/sessions.json 포함).
// 안 된 것을 모두 모은 뒤 한 번에 알린다(고치기 전에 무엇이 실패하는지 보려고).
// 주의: 날짜 칸이 튀어나오는 것은 iOS Safari만의 일이다(iOS가 날짜 칸을 content-box로 바꾼다). Mac의 WebKit · Chromium에서는 고치기 전에도 칸이 맞는다.
//       그래서 폭을 재는 것과 함께 "날짜 칸의 appearance가 none"(iOS가 손대지 않게 하는 값)도 본다.
async (page) => {
  const URL = 'http://127.0.0.1:47571/';
  const SHOTS = '';
  const checks = [];
  const check = (ok, what) => { checks.push({ ok: !!ok, what }); };
  const shot = async (name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}${name}` }); };
  const settle = (ms = 500) => page.waitForTimeout(ms);
  const noSideScroll = async (what) => { const W = page.viewportSize().width; check(await page.evaluate((w) => document.documentElement.scrollWidth <= w, W), `${what}: ${W}px 폭에서 옆으로 밀리지 않는다`); };
  const open = async (hash, { theme = 'light', text = 1 } = {}) => {
    await page.evaluate(([t, n]) => { localStorage.setItem('ces2027.theme.v1', JSON.stringify(t)); localStorage.setItem('ces2027.text.v1', JSON.stringify(n)); }, [theme, text]);
    await page.goto('about:blank');
    await page.goto(`${URL}${hash}`);
  };

  for (const [W, H] of [[360, 740], [390, 780]]) {
    await page.setViewportSize({ width: W, height: H });
    await page.goto(URL);
    await page.evaluate(async () => {
      for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
      for (const k of await caches.keys()) await caches.delete(k);
      localStorage.clear(); sessionStorage.clear();
      localStorage.setItem('ces2027.profile.v1', JSON.stringify({ nick: '시험', tag: 'stu', line: '', github: '', discord: '' }));
    });

    // ---- 일기 쓰기: 날짜 칸(1번) · 입력 안내 글(8번) ----
    for (const theme of ['light', 'dark']) for (const text of [1, 4]) {
      const tag = `${W}px ${theme === 'light' ? '밝게' : '어둡게'} 글자 ${text}`;
      await open('#/diary/new', { theme, text });
      await page.locator('input[name="date"]').waitFor();
      await settle(300);
      check((await page.evaluate(() => document.documentElement.dataset.theme)) === theme, `${tag} 일기 쓰기: 화면 색이 고른 대로 걸렸다(시험이 다른 색으로 재지 않게)`);
      const m = await page.evaluate(() => {
        const date = document.querySelector('input[name="date"]');
        const other = document.querySelector('input[name="other"]');
        const panel = date.closest('.panel');
        const ps = getComputedStyle(panel);
        const inner = panel.getBoundingClientRect().right - parseFloat(ps.paddingRight);
        const cs = getComputedStyle(date);
        const os = getComputedStyle(other);
        const cv = document.createElement('canvas').getContext('2d');
        cv.font = `${os.fontWeight} ${os.fontSize} ${os.fontFamily}`;
        const room = other.clientWidth - parseFloat(os.paddingLeft) - parseFloat(os.paddingRight);
        return {
          dateRight: date.getBoundingClientRect().right, otherRight: other.getBoundingClientRect().right, inner,
          dateW: date.getBoundingClientRect().width, otherW: other.getBoundingClientRect().width,
          appearance: cs.appearance || cs.webkitAppearance, boxSizing: cs.boxSizing, minWidth: cs.minWidth,
          hint: other.placeholder, hintW: cv.measureText(other.placeholder).width, room,
        };
      });
      check(m.dateRight <= m.inner + 0.5 && Math.abs(m.dateW - m.otherW) <= 0.5, `${tag} 일기 쓰기: 날짜 칸의 오른쪽 끝(${m.dateRight.toFixed(1)})이 카드 안쪽 끝(${m.inner.toFixed(1)})을 넘지 않고 폭이 다른 칸과 같다(${m.dateW.toFixed(1)} · ${m.otherW.toFixed(1)})`);
      check(m.appearance === 'none' && m.boxSizing === 'border-box', `${tag} 일기 쓰기: 날짜 칸은 appearance none · border-box다(iOS가 칸 폭을 바꾸지 않게) — 지금 ${m.appearance} · ${m.boxSizing}`);
      check(m.hintW <= m.room, `${tag} 일기 쓰기: 입력 안내 글 "${m.hint}"(${Math.round(m.hintW)}px)이 칸(${Math.round(m.room)}px) 안에서 잘리지 않는다`);
      await noSideScroll(`${tag} 일기 쓰기`);
      if (W === 360) await shot(`폰확인-${theme === 'light' ? '밝게' : '어둡게'}-${text}-일기쓰기.png`);
    }

    // ---- 세션 일정: 안내 글 줄바꿈(9번) · 줄의 단추 넷(10번) ----
    for (const text of [1, 4]) {
      const tag = `${W}px 글자 ${text}`;
      await open('#/sessions', { text });
      await page.locator('.session').first().waitFor({ timeout: 15000 });
      await settle(300);
      const s = await page.evaluate(() => {
        // 줄이 바뀌는 자리마다 앞 글자가 띄어쓰기인지 본다
        const p = document.querySelector('.head .lead');
        const node = p.firstChild; const str = node.textContent; const r = document.createRange();
        const top = (i) => { r.setStart(node, i); r.setEnd(node, i + 1); const b = r.getClientRects()[0]; return b ? Math.round(b.top) : null; };
        const bad = [];
        let last = top(0);
        for (let i = 1; i < str.length; i++) { const t = top(i); if (t === null) continue; if (last !== null && t > last + 2 && !/\s/.test(str[i - 1]) && !/\s/.test(str[i])) bad.push(`${str.slice(Math.max(0, i - 4), i)} / ${str.slice(i, i + 3)}`); last = t; }
        // 단추 넷이 있는 줄(지도 링크가 있는 세션)을 고른다
        const row = [...document.querySelectorAll('.session .row-actions')].find((x) => x.children.length === 4) || document.querySelector('.session .row-actions');
        const bs = [...row.children].map((b) => { const q = b.getBoundingClientRect(); return { t: b.textContent, x: q.left, r: q.right, y: Math.round(q.top), w: q.width, h: q.height }; });
        const gaps = bs.slice(1).map((b, i) => (b.y === bs[i].y ? b.x - bs[i].r : null)).filter((g) => g !== null);
        return { bad, bs, gaps };
      });
      check(s.bad.length === 0, `${tag} 세션 일정: 안내 글이 낱말 가운데서 줄이 바뀌지 않는다${s.bad.length ? ` — ${s.bad.join(' , ')}` : ''}`);
      check(s.bs.length >= 3 && s.bs.every((b) => b.w >= 44 && b.h >= 44), `${tag} 세션 줄의 단추 ${s.bs.map((b) => `${b.t} ${Math.round(b.w)}×${Math.round(b.h)}`).join(' · ')}: 누르는 곳이 44px 이상이다`);
      check(s.gaps.every((g) => g >= 8), `${tag} 세션 줄의 단추 사이가 8px 이상 떨어진다(${s.gaps.map((g) => Math.round(g)).join(' · ')})`);
      await noSideScroll(`${tag} 세션 일정`);
      if (W === 360) await shot(`폰확인-${text}-세션일정.png`);
    }

    // ---- 지도: + 단추(4번) · 찾기 칸 지우기(5번) · 회사 카드(2 · 11번, 닫기 단추) ----
    for (const text of [1, 4]) {
      const tag = `${W}px 글자 ${text}`;
      await open('#/map', { text });
      await page.locator('svg.map').waitFor();
      await settle(1500);
      const ctl = await page.locator('.ctl').first().evaluate((n) => { const c = getComputedStyle(n); return { sel: c.userSelect || c.webkitUserSelect, wsel: c.webkitUserSelect, ta: c.touchAction }; });
      check((ctl.sel === 'none' || ctl.wsel === 'none') && ctl.ta === 'manipulation', `${tag} 지도 + · − 단추: 두 번 눌러도 글자가 선택되지 않는다(user-select ${ctl.sel} · touch-action ${ctl.ta})`);

      // 3번 가리기: 손가락(pointer · touch)으로 끌고 벌리면 지도가 움직인다. 미러링의 쓸기는 바퀴 스크롤이라 이 길을 타지 않는다.
      if (text === 1) {
        const api = (fn) => page.evaluate((src) => { const m = document.querySelector('#view > .page').mapApi; return new Function('m', `return (${src})(m)`)(m); }, fn.toString());
        const fire = (type, id, x, y) => page.evaluate(([t, i, px, py]) => document.querySelector('svg.map').dispatchEvent(new PointerEvent(t, { pointerId: i, clientX: px, clientY: py, bubbles: true, pointerType: 'touch', isPrimary: i === 1 })), [type, id, x, y]);
        const b = await page.locator('svg.map').boundingBox(); const c = { x: b.x + b.width / 2, y: b.y + b.height * 0.55 };
        const mid = () => api((m) => [(m.view[0] + m.view[2]) / 2, (m.view[1] + m.view[3]) / 2, m.view[2] - m.view[0]]);
        const touch = await page.locator('svg.map').evaluate((n) => [getComputedStyle(n).touchAction, getComputedStyle(n.closest('.mapx')).touchAction]);
        const m0 = await mid(); const y0 = await page.evaluate(() => window.scrollY);
        await fire('pointerdown', 1, c.x, c.y);
        for (let i = 1; i <= 8; i++) await fire('pointermove', 1, c.x - i * 10, c.y + i * 6);
        await fire('pointerup', 1, c.x - 80, c.y + 48);
        await settle(500);
        const m1 = await mid();
        check(touch[0] === 'none' && m1[0] - m0[0] > 20 && m0[1] - m1[1] > 10 && Math.abs(m1[2] - m0[2]) < 1 && (await page.evaluate(() => window.scrollY)) === y0, `${tag} 지도 한 손가락 끌기: 지도가 손가락을 따라 움직이고(가로 ${Math.round(m1[0] - m0[0])} · 세로 ${Math.round(m0[1] - m1[1])}칸) 페이지는 그대로다(지도 touch-action ${touch[0]})`);
        await fire('pointerdown', 1, c.x - 30, c.y); await fire('pointerdown', 2, c.x + 30, c.y);
        for (let i = 1; i <= 6; i++) { await fire('pointermove', 1, c.x - 30 - i * 8, c.y); await fire('pointermove', 2, c.x + 30 + i * 8, c.y); }
        await fire('pointerup', 1, c.x - 80, c.y); await fire('pointerup', 2, c.x + 80, c.y);
        await settle(500);
        const m2 = await mid();
        check(m2[2] < m1[2] * 0.75, `${tag} 지도 두 손가락 벌리기: 칸 너비 ${Math.round(m1[2])} → ${Math.round(m2[2])} (가까이)`);
      }

      // 찾기 칸 지우기: 글자가 있을 때만 보이고, 누르면 칸이 비고 결과 줄이 닫힌다
      const input = page.locator('.find-field input');
      const wipe = page.locator('.find-clear');
      const hasWipe = (await wipe.count()) === 1;
      check(hasWipe && !(await wipe.isVisible()), `${tag} 찾기 칸: 글자가 없으면 지우기 단추가 보이지 않는다`);
      await input.fill('Samsung');
      await page.locator('.results .result').first().waitFor({ timeout: 15000 });
      if (hasWipe) {
        const w = await page.evaluate(() => {
          const b = document.querySelector('.find-clear').getBoundingClientRect(); const f = document.querySelector('.find').getBoundingClientRect();
          const t = document.querySelector('.find-tag'); const tb = t.getBoundingClientRect(); const tv = getComputedStyle(t).visibility !== 'hidden' && getComputedStyle(t).display !== 'none' && tb.width > 0;
          const hit = tv && b.left < tb.right && tb.left < b.right && b.top < tb.bottom && tb.top < b.bottom;
          return { w: b.width, h: b.height, inside: b.left >= f.left - 0.5 && b.right <= f.right + 0.5 && b.top >= f.top - 0.5 && b.bottom <= f.bottom + 0.5, hit, label: document.querySelector('.find-clear').getAttribute('aria-label') };
        });
        check((await wipe.isVisible()) && w.w >= 44 && w.h >= 44 && w.inside && !w.hit && !!w.label, `${tag} 찾기 칸: 글자를 넣으면 지우기 단추가 보인다(${Math.round(w.w)}×${Math.round(w.h)}, 칸 안, "비공식"과 겹치지 않음, 이름 "${w.label}")`);
        if (W === 360) await shot(`폰확인-${text}-찾기칸-지우기.png`);
        await wipe.click();
        await settle(200);
        check((await input.inputValue()) === '' && !(await page.locator('.results').isVisible()) && !(await wipe.isVisible()), `${tag} 찾기 칸: 지우기를 누르면 칸이 비고 결과 줄이 닫히고 단추도 사라진다`);
        await input.fill('Samsung');
        await page.locator('.results .result').first().waitFor({ timeout: 15000 });
      }
      await page.locator('.results .result').first().click();
      await page.locator('.sheet .card h2').waitFor({ timeout: 15000 });
      await settle(900);
      const sheet = page.locator('.sheet');
      check((await sheet.getAttribute('data-state')) === 'half', `${tag} 회사 카드가 반쯤 열린다`);
      check(!/(^|\s)(null|undefined)(\s|$)/.test(await page.locator('.sheet-body').innerText()), `${tag} 회사 카드에 "null" 같은 빈 값 글자가 보이지 않는다`);

      // 2번: 카드가 열려 있는 동안 화면(페이지)이 위아래로 밀리지 않는다
      const ob = await page.evaluate(() => getComputedStyle(document.documentElement).overscrollBehaviorY);
      check(ob === 'none', `${tag} 카드가 열려 있으면 페이지의 overscroll-behavior가 none이다(지금 ${ob})`);
      const wheel = (sel, dy) => page.evaluate(([s, d]) => { const ev = new WheelEvent('wheel', { deltaY: d, bubbles: true, cancelable: true }); document.querySelector(s).dispatchEvent(ev); return ev.defaultPrevented; }, [sel, dy]);
      const bodyInfo = await page.evaluate(() => { const b = document.querySelector('.sheet-body'); b.scrollTop = 0; return { more: b.scrollHeight > b.clientHeight + 1 }; });
      check(await wheel('.sheet-body .card h2', -40), `${tag} 카드 글이 맨 위일 때 아래로 쓸면(바퀴) 페이지로 넘기지 않는다`);
      if (bodyInfo.more) check(!(await wheel('.sheet-body .card h2', 40)), `${tag} 카드 글이 더 있으면 위로 쓸 때는 카드 안 글이 굴러간다(막지 않는다)`);
      // 손잡이를 아래로 쓸면(바퀴 · 미러링의 쓸기) 닫힌다
      const y0 = await page.evaluate(() => window.scrollY);
      const p1 = await wheel('.sheet-grip', -60); const p2 = await wheel('.sheet-grip', -60);
      await settle(400);
      check(p1 && p2 && (await page.evaluate(() => window.scrollY)) === y0, `${tag} 손잡이 위에서 쓸어도(바퀴) 페이지가 움직이지 않는다`);
      check((await sheet.getAttribute('data-state')) === 'closed', `${tag} 손잡이를 아래로 쓸면(바퀴) 카드가 닫힌다`);
      check((await page.evaluate(() => getComputedStyle(document.documentElement).overscrollBehaviorY)) !== 'none', `${tag} 카드가 닫히면 페이지는 다시 예전처럼 굴러간다`);

      // 다시 열어 손가락 끌기(pointer)로도 닫히는지 본다
      const reopen = async () => { await input.fill('Samsung'); await page.locator('.results .result').first().waitFor({ timeout: 15000 }); await page.locator('.results .result').first().click(); await page.locator('.sheet .card h2').waitFor({ timeout: 15000 }); await settle(900); };
      await settle(400);
      await reopen();
      await page.evaluate(() => { const g = document.querySelector('.sheet-grip'); const r = g.getBoundingClientRect(); const f = (t, y) => g.dispatchEvent(new PointerEvent(t, { pointerId: 5, clientX: r.x + 20, clientY: y, bubbles: true })); f('pointerdown', r.y + 10); f('pointermove', r.y + 120); f('pointermove', r.y + 260); f('pointerup', r.y + 260); });
      await settle(400);
      check((await sheet.getAttribute('data-state')) === 'closed', `${tag} 손잡이를 손가락으로 아래로 끌면 카드가 닫힌다`);

      // 11번: 끝까지 펼치면 홀 칩 줄이 카드 위로 비죽 나오지 않는다
      await reopen();
      await page.locator('.sheet-grip').click();
      await settle(500);
      const full = await page.evaluate(() => {
        const s = document.querySelector('.sheet').getBoundingClientRect(); const c = document.querySelector('.chips'); const cb = c.getBoundingClientRect();
        const hidden = getComputedStyle(c).visibility === 'hidden' || getComputedStyle(c).display === 'none';
        return { state: document.querySelector('.sheet').dataset.state, peek: hidden ? 0 : Math.max(0, Math.min(s.top, cb.bottom) - cb.top) };
      });
      check(full.state === 'full' && full.peek === 0, `${tag} 카드를 끝까지 펼치면 홀 칩 줄이 카드 위로 비죽 나오지 않는다(나온 높이 ${Math.round(full.peek)}px)`);
      if (W === 360) await shot(`폰확인-${text}-지도카드-펼침.png`);
      await page.locator('.sheet-grip').click();
      await settle(500);
      check((await page.locator('.chips').evaluate((n) => getComputedStyle(n).visibility)) === 'visible', `${tag} 카드를 반으로 내리면 홀 칩 줄이 다시 보인다`);

      // 카드 닫기 단추: 44px 이상, 손잡이 줄과 겹치지 않고, 누르면 닫힌다
      const shut = page.locator('.sheet-close');
      const hasShut = (await shut.count()) === 1;
      check(hasShut, `${tag} 회사 카드에 닫기 단추가 있다`);
      if (hasShut) {
        const c = await page.evaluate(() => {
          const b = document.querySelector('.sheet-close'); const q = b.getBoundingClientRect(); const bar = document.querySelector('.sheet-bar').getBoundingClientRect(); const h = document.querySelector('.sheet .card h2').getBoundingClientRect(); const s = document.querySelector('.sheet').getBoundingClientRect();
          const over = (a, z) => a.left < z.right && z.left < a.right && a.top < z.bottom && z.top < a.bottom;
          return { w: q.width, h: q.height, label: b.getAttribute('aria-label'), bar: over(q, bar), title: over(q, h), inside: q.right <= s.right + 0.5 && q.top >= s.top - 0.5 };
        });
        check(c.w >= 44 && c.h >= 44 && !!c.label && !c.bar && !c.title && c.inside, `${tag} 카드 닫기 단추: ${Math.round(c.w)}×${Math.round(c.h)}, 이름 "${c.label}", 손잡이 · 제목과 겹치지 않는다`);
        if (W === 360) await shot(`폰확인-${text}-지도카드-닫기.png`);
        await shut.click();
        await settle(400);
        check((await sheet.getAttribute('data-state')) === 'closed', `${tag} 카드 닫기 단추를 누르면 카드가 닫힌다`);
      }
      await noSideScroll(`${tag} 지도`);
    }
  }

  // 다음 시험이 가장 큰 글자 · 어둡게로 시작하지 않게 되돌린다
  await page.evaluate(() => { localStorage.removeItem('ces2027.theme.v1'); localStorage.removeItem('ces2027.text.v1'); });

  const failed = checks.filter((c) => !c.ok);
  if (failed.length) throw new Error(`안 됨 ${failed.length}개 / ${checks.length}개\n${failed.map((c) => `- ${c.what}`).join('\n')}`);
  return { ok: true, count: checks.length, checks: checks.map((c) => c.what) };
}
