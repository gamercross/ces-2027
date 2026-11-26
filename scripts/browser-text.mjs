// Playwright CLI test for 다시 짓기 7단계: 설정 + 글자 크기 네 단계. 360 · 390px 폰 크기, 밝게.
// Run with: playwright-cli open about:blank
//           playwright-cli run-code "$(cat scripts/browser-text.mjs)"
// The app must be served from a stamped dist at http://127.0.0.1:47571/ (자료가 있는 지은 것).
// SHOTS를 채우면(레포 바탕의 상대 경로) 네 단계 × 설정 · 갈 곳 · 갈 곳 카드 그림을 그 폴더에 남긴다.
async (page) => {
  const URL = 'http://127.0.0.1:47571/';
  const SHOTS = '';
  const checks = [];
  const check = (ok, what) => {
    checks.push({ ok, what });
    if (!ok) throw new Error(`안 됨: ${what}`);
  };
  const settle = (ms = 600) => page.waitForTimeout(ms);
  const NAMES = ['기본', '크게', '더 크게', '가장 크게'];
  const RATIO = [1, 1.15, 1.3, 1.5];

  // 화면 하나를 살핀다: 가로 넘침 · 글자 잘림 · 누르는 곳 · 탭이 안 가림
  const audit = (what, W) => page.evaluate(([label, w]) => {
    const view = document.querySelector('#view');
    const tabs = document.querySelector('.tabs').getBoundingClientRect();
    const scrollers = (n) => { for (let p = n; p && p !== document.body; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll') return true; } return false; };
    const visible = (n) => { const r = n.getBoundingClientRect(); const s = getComputedStyle(n); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && n.checkVisibility(); }; // 접힌 "더 적기" 안의 칸은 보이는 것으로 치지 않는다
    const side = document.documentElement.scrollWidth > w;
    // 글자 잘림: 글자를 담은 칸이 안의 글보다 좁은데 가로로 밀리지도 않는 것(말줄임 · 숨김)
    const clipped = [...view.querySelectorAll('*')].filter((n) => {
      if (!visible(n) || scrollers(n) || n.closest('svg, canvas, .mapx')) return false;
      const s = getComputedStyle(n);
      if (!(s.overflowX === 'hidden' || s.overflowX === 'clip' || s.textOverflow === 'ellipsis')) return false;
      if (s.display.includes('webkit-box') || n.classList.contains('sr-only')) return false;
      return n.scrollWidth > n.clientWidth + 1;
    }).map((n) => `${n.tagName}.${n.className}`.slice(0, 40));
    const small = [...view.querySelectorAll('button, a.btn, a.pick, a.seg, a.stop-open, .stop-open')].filter((n) => { if (!visible(n) || n.closest('.mapx, .pcard-back[hidden]')) return false; const r = n.getBoundingClientRect(); return r.height < 43.5 || r.width < 43.5; }).map((n) => `${n.tagName}.${n.className}:${Math.round(n.getBoundingClientRect().width)}x${Math.round(n.getBoundingClientRect().height)}`);
    // 맨 아래까지 내려 마지막 내용이 탭에 가리는지
    window.scrollTo(0, document.documentElement.scrollHeight);
    const last = [...view.querySelectorAll('.page > *, .page > * > *')].filter(visible).map((n) => n.getBoundingClientRect().bottom).sort((a, b) => b - a)[0] || 0;
    return { label, side, clipped: [...new Set(clipped)], small: [...new Set(small)], hidden: Math.round(last - tabs.top), docW: document.documentElement.scrollWidth };
  }, [what, W]);

  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto(URL);
  await page.evaluate(async () => { for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister(); for (const k of await caches.keys()) await caches.delete(k); localStorage.clear(); sessionStorage.clear(); });
  const seed = await page.evaluate(async () => {
    const d = await (await fetch('data/exhibitors.json')).json();
    const pick = (hall, n) => d.ex.filter((r) => r[7]?.some((b) => b.endsWith(`@${hall}`))).slice(0, n);
    const a = [...pick('LVCC_N', 3), ...pick('LVCC_C', 2)], b = pick('VEN_G', 2);
    const g = (id) => ({ kind: 'github', url: `https://github.com/${id}`, label: `github.com/${id}`, key: `github:${id}` });
    return {
      interests: [...a.map((r) => ({ id: r[0], day: 1 })), ...b.map((r) => ({ id: r[0], day: 2 }))],
      people: [{ id: 'p1', nick: '민수', links: [g('minsu')], met: '2027-01-06', company: a[0][1], exId: a[0][0], booth: a[0][7][0], note: '로봇 팔 이야기' }, { id: 'p2', nick: '', links: [g('suah')], met: '2027-01-07', company: '', exId: '', booth: '', note: '' }],
      diary: [{ id: 'e1', date: '2027-01-06', exId: a[0][0], company: a[0][1], booth: a[0][7][0], saw: '로봇 팔이 컵을 집는 시연을 아주 오래 봤다', felt: '', for: ['stu'], sent: null }],
    };
  });
  await page.evaluate((s) => {
    localStorage.setItem('ces2027.theme.v1', JSON.stringify('light'));
    localStorage.setItem('ces2027.profile.v1', JSON.stringify({ nick: '재엽', tag: 'stu', line: '한 줄 소개가 조금 길어도 괜찮다', github: 'https://github.com/gamercross', discord: 'jy' }));
    localStorage.setItem('ces2027.paper.v1', JSON.stringify({ has: true, asked: '2026-11-22', remindOn: '2027-01-01' }));
    localStorage.setItem('ces2027.interests.v1', JSON.stringify(s.interests));
    localStorage.setItem('ces2027.people.v1', JSON.stringify(s.people));
    localStorage.setItem('ces2027.diary.v1', JSON.stringify(s.diary));
  }, seed);

  // 1. 설정 맨 위: 글자 크기 네 칩 + 보기, 고르면 바로 바뀌고 폰에 남는다
  await page.goto('about:blank');
  await page.goto(`${URL}#/settings`);
  await page.locator('.textsegs .seg').first().waitFor();
  const chipNames = await page.locator('.textsegs .seg').allTextContents();
  check(chipNames.join(',') === NAMES.join(','), `글자 크기 칩 넷(${chipNames.join(' · ')})`);
  check((await page.locator('.settingspage > section.panel').first().locator('h2').textContent()) === '글자 크기', '글자 크기는 설정 맨 위 묶음이다');
  check((await page.locator('.preview .name').count()) === 1, '고르면 바로 바뀌는 보기 한 줄이 있다');
  const dataText = () => page.evaluate(() => document.documentElement.getAttribute('data-text'));
  const bodyPx = () => page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.setrow-main b')).fontSize));
  check((await dataText()) === '1' && Math.round(await bodyPx()) === 16, '처음은 기본(100%, 본문 16px)');
  for (let n = 2; n <= 4; n++) {
    await page.locator('.textsegs .seg').nth(n - 1).click();
    await settle(200);
    const px = await bodyPx();
    check((await dataText()) === String(n) && Math.abs(px - 16 * RATIO[n - 1]) < 0.6, `"${NAMES[n - 1]}"를 누르면 바로 적용(본문 ${px.toFixed(1)}px = ${RATIO[n - 1] * 100}%)`);
  }
  const stored = await page.evaluate(() => localStorage.getItem('ces2027.text.v1'));
  check(stored === '4', '고른 단계는 폰에 남는다(ces2027.text.v1)');
  // 첫 그림 전에 걸린다: 새로 열면 첫 줄이 이미 그 단계다(문서 머리의 스크립트가 정한다)
  await page.goto('about:blank');
  await page.goto(`${URL}#/settings`);
  await page.locator('.textsegs .seg').first().waitFor();
  check((await dataText()) === '4' && (await page.locator('.textsegs .seg[aria-pressed="true"]').textContent()) === '가장 크게', '다시 열어도 그대로이고 칩도 맞는다');
  check(await page.evaluate(() => { const s = document.querySelector('script[src="theme.js"]'); return !!s && s.parentElement.tagName === 'HEAD' && !s.async && !s.defer && s.type !== 'module'; }), 'theme.js가 문서 머리에서 막고 돌아 첫 그림 전에 단계를 건다');
  const wrap = await page.locator('.textsegs').evaluate((n) => getComputedStyle(n).flexWrap);
  check(wrap === 'wrap' && (await page.locator('.textsegs .seg').first().evaluate((n) => n.getBoundingClientRect().width)) < 200, '큰 단계에서는 글자 크기 칩이 2 × 2로 접힌다');

  // 2. 네 단계 × (360 · 390) × 화면: 가로 넘침 0 · 글자 잘림 0 · 누르는 곳 44px · 탭이 안 가림
  const screens = [['홈', '#/home', null], ['지도', '#/map', null], ['갈 곳', '#/plan', null], ['갈 곳 카드', '#/plan', 'card'], ['일기', '#/diary', null], ['만난 사람 카드', '#/diary', 'person'], ['일기 쓰기', '#/diary/new', null], ['일기 쓰기 더 적기', '#/diary/new', 'more'], ['설정', '#/settings', null], ['명함 QR', '#/card', null], ['지도 회사 카드', '#/map', 'mapcard']];
  const problems = [];
  let audited = 0;
  for (const [W, H] of [[360, 740], [390, 780]]) {
    await page.setViewportSize({ width: W, height: H });
    for (let n = 1; n <= 4; n++) {
      await page.evaluate((v) => localStorage.setItem('ces2027.text.v1', JSON.stringify(v)), n);
      for (const [ko, hash, extra] of screens) {
        await page.goto('about:blank');
        await page.goto(`${URL}${hash}`);
        if (hash === '#/map') await page.locator('svg.map').waitFor();
        else if (hash === '#/plan') await page.locator('.stops .stop').first().waitFor();
        else if (hash === '#/diary') await page.locator('.met').waitFor();
        else if (hash === '#/home') await page.locator('.home-now').waitFor();
        else await settle(500);
        await settle(extra === 'mapcard' ? 1500 : 500);
        if (extra === 'card') { await page.locator('.stops .stop-open').first().click(); await page.locator('.pcard').waitFor(); }
        if (extra === 'more') { await page.locator('details.more > summary').click(); await settle(200); }
        if (extra === 'person') { await page.locator('.met .stop-open').first().click(); await page.locator('.pcard').waitFor(); }
        if (extra === 'mapcard') { await page.getByRole('button', { name: '노스', exact: true }).click(); await settle(1500); await page.evaluate(async () => { const m = document.querySelector('#view > .page').mapApi; await m.ensureFull(); const row = [...m.rows.values()].find((r) => r[7]?.[0]?.endsWith('@LVCC_N')); await m.openCompany(row); }); await settle(900); }
        if (SHOTS && W === 360 && ['설정', '갈 곳', '갈 곳 카드'].includes(ko)) await page.screenshot({ path: `${SHOTS}12${n}-text${n}-${{ 설정: 'settings', '갈 곳': 'plan', '갈 곳 카드': 'plan-card' }[ko]}.png` });
        if (SHOTS && W === 360 && n === 4 && ['일기', '지도', '지도 회사 카드'].includes(ko)) await page.screenshot({ path: `${SHOTS}125-text4-${{ 일기: 'diary', 지도: 'map', '지도 회사 카드': 'map-card' }[ko]}.png` });
        const r = await audit(`${W}px ${NAMES[n - 1]} ${ko}`, W);
        audited++;
        // 카드가 열려 있으면 탭 가림은 카드 창이 정한다
        const bad = [];
        if (r.side) bad.push(`가로로 밀림(${r.docW}px)`);
        if (r.clipped.length) bad.push(`글자 잘림 ${r.clipped.join(',')}`);
        if (r.small.length) bad.push(`작은 누름 ${r.small.slice(0, 3).join(',')}`);
        if (!extra && r.hidden > 2) bad.push(`탭에 가림 ${r.hidden}px`);
        if (bad.length) problems.push(`${r.label}: ${bad.join(' / ')}`);
      }
    }
  }
  check(problems.length === 0, `네 단계 × 360 · 390px × 화면 열하나(${audited}가지): 가로 넘침 0 · 글자 잘림 0 · 누르는 곳 44px 이상 · 탭이 안 가림${problems.length ? ` — 문제 ${problems.length}: ${problems.slice(0, 6).join(' | ')}` : ''}`);

  console.log(JSON.stringify(checks.map((c) => `${c.ok ? '됨' : '안 됨'} | ${c.what}`), null, 1));
  return `${checks.length}개 통과`;
}
