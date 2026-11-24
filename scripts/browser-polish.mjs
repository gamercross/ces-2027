// Playwright CLI test for 다시 짓기 8단계: 디자인 마감. 전 · 후 폰 사진(밝게 · 어둡게)과 화면마다 "처음 보이는 한 화면"의 글자 수 · 머리 · 제목 · 단추 · 12px 글자를 잰다.
// Run with: playwright-cli open about:blank
//           playwright-cli run-code "$(cat scripts/browser-polish.mjs)"
// URL은 지은 것 한 벌을 가리킨다(후: 이 저장소의 dist, 전: 5단계를 시작하던 main(2fca6bf)의 dist). SIDE는 '후'(모든 화면) 또는 '전'(그때 있던 화면만).
// SHOTS를 채우면(레포 바탕의 상대 경로) docs/screens/8x-<전|후>-<밝게|어둡게>-<번호>-<이름>.png를 남기고, 돌려주는 JSON이 글자 수 표의 원자료다.
async (page) => {
  const URL = 'http://127.0.0.1:47571/';
  const SIDE = '후';
  const SHOTS = '';
  const THEMES = ['light', 'dark'];
  const W = 360, H = 740, TABS = 68;
  const out = { side: SIDE, shots: [], metrics: [] };

  const seedAll = async () => page.evaluate(async () => {
    const d = await (await fetch('data/exhibitors.json')).json();
    const pick = (hall, n) => d.ex.filter((r) => r[7]?.some((b) => b.endsWith(`@${hall}`))).slice(0, n);
    const a = [...pick('LVCC_N', 3), ...pick('LVCC_C', 2)], b = pick('VEN_G', 2);
    const g = (id) => ({ kind: 'github', url: `https://github.com/${id}`, label: `github.com/${id}`, key: `github:${id}` });
    return {
      interests: [...a.map((r) => ({ id: r[0], day: 1 })), ...b.map((r) => ({ id: r[0], day: 2 }))],
      people: [{ id: 'p1', nick: '민수', links: [g('minsu')], met: '2027-01-06', company: a[0][1], exId: a[0][0], booth: a[0][7][0], note: '로봇 팔 이야기' }, { id: 'p2', nick: '', links: [g('suah')], met: '2027-01-07', company: '', exId: '', booth: '', note: '' }, { id: 'p3', nick: '하나', links: [g('hana')], met: '2027-01-05', company: '', exId: '', booth: '', note: '' }],
      diary: [{ id: 'e1', date: '2027-01-06', exId: a[0][0], company: a[0][1], booth: a[0][7][0], saw: '로봇 팔이 컵을 집는 시연을 봤다', felt: '', for: ['stu'], sent: null }, { id: 'e2', date: '2027-01-07', exId: '', company: '삼성', booth: '', saw: '냉장고', felt: '', for: ['job'], sent: '2027-01-07T01:00:00Z' }],
    };
  });

  // 처음 보이는 한 화면의 글자 수(공백 뺀 글자): 제목 · 단추 · 줄 · 설명으로 나눈다. 12px보다 작은 글자 · 회색 면 링크 단추 · 도크도 센다.
  const measure = () => page.evaluate(([vh, tabs]) => {
    const limit = vh - tabs;
    const kindOf = (n) => {
      if (n.closest('h1, h2, h3, .pcard-name, p.big')) return 'title';
      if (n.closest('button, a.btn, a.pick, a.seg, .seg, .chip-go, .pick, .linkish, .tabs, label.choice, input, select, textarea')) return 'button';
      if (n.closest('li, .stop, .entry, .setrow, .stops, .hits, .results')) return 'row';
      return 'note';
    };
    const count = { title: 0, button: 0, row: 0, note: 0 };
    const small = new Set();
    const walker = document.createTreeWalker(document.querySelector('#view'), NodeFilter.SHOW_TEXT);
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      const text = t.textContent.replace(/\s+/g, '');
      if (!text) continue;
      const el = t.parentElement;
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      if (r.width === 0 || r.height === 0 || s.visibility === 'hidden' || s.display === 'none' || el.closest('.sr-only, [hidden], svg, .mapx')) continue;
      if (r.top >= limit || r.bottom <= 0) continue;
      count[kindOf(el)] += text.length;
      if (parseFloat(s.fontSize) < 12.99) small.add(`${el.tagName}.${el.className}:${s.fontSize}`.slice(0, 50));
    }
    const bar = document.querySelector('.bar').getBoundingClientRect();
    const h1 = document.querySelector('#view h1');
    const h1s = h1 ? getComputedStyle(h1) : null;
    const prim = [...document.querySelectorAll('#view .btn:not(.ghost)')].filter((n) => { const r = n.getBoundingClientRect(); return r.top < limit && r.bottom > 0 && r.width > 0; }).length;
    const grayLinkChips = [...document.querySelectorAll('#view a.seg, #view a.chip-go')].filter((n) => n.getBoundingClientRect().width > 0).length;
    const docks = [...document.querySelectorAll('#view .dock')].filter((n) => getComputedStyle(n).position === 'sticky').length;
    const brand = getComputedStyle(document.querySelector('.brand')).display !== 'none';
    return { chars: count, total: count.title + count.button + count.row + count.note, small: [...small], barH: Math.round(bar.height), brand, h1: h1 ? { text: h1.textContent.trim().slice(0, 14), px: parseFloat(h1s.fontSize), lines: Math.round(h1.getBoundingClientRect().height / parseFloat(h1s.lineHeight)) } : null, primary: prim, grayLinkChips, stickyDocks: docks };
  }, [H, TABS]);

  await page.setViewportSize({ width: W, height: H });
  await page.goto(URL);
  await page.evaluate(async () => { for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister(); for (const k of await caches.keys()) await caches.delete(k); localStorage.clear(); sessionStorage.clear(); });
  const seed = await seedAll();
  const profile = { nick: '재엽', tag: 'stu', line: '로봇과 AI를 보러 간다', github: 'https://github.com/gamercross', discord: 'jy' };
  const prepare = ({ theme, state, profile: pf, seed: sd }) => {
    localStorage.clear(); sessionStorage.clear();
    localStorage.setItem('ces2027.theme.v1', JSON.stringify(theme));
    if (state.profile) localStorage.setItem('ces2027.profile.v1', JSON.stringify(pf));
    if (state.paper) localStorage.setItem('ces2027.paper.v1', JSON.stringify({ has: true, asked: '2026-11-22', remindOn: '2027-01-01' }));
    if (state.data) { localStorage.setItem('ces2027.interests.v1', JSON.stringify(sd.interests)); localStorage.setItem('ces2027.people.v1', JSON.stringify(sd.people)); localStorage.setItem('ces2027.diary.v1', JSON.stringify(sd.diary)); }
    if (state.text) localStorage.setItem('ces2027.text.v1', JSON.stringify(state.text));
  };
  // [번호, 이름, 해시, 상태, 동작, 있는 쪽]  — 동작: card(갈 곳 카드) person(만난 사람 카드) mapcard hall booth
  const SCREENS = [
    ['01', '처음명함', '#/card', { profile: false }, null, '전후'],
    ['02', 'QR', '#/card', { profile: true, data: true, paper: true }, null, '전후'],
    ['03', '지도캠퍼스', '#/map', { profile: true, data: true, paper: true }, null, '전후'],
    ['04', '지도홀', '#/map', { profile: true, data: true, paper: true }, 'hall', '후'],
    ['05', '지도부스', '#/map', { profile: true, data: true, paper: true }, 'booth', '후'],
    ['06', '회사카드', '#/map', { profile: true, data: true, paper: true }, 'mapcard', '후'],
    ['07', '갈 곳', '#/plan', { profile: true, data: true, paper: true }, null, '전후'],
    ['08', '갈 곳 카드', '#/plan', { profile: true, data: true, paper: true }, 'card', '후'],
    ['09', '일기', '#/diary', { profile: true, data: true, paper: true }, null, '전후'],
    ['10', '만난사람', '#/people', { profile: true, data: true, paper: true }, null, '전후'],
    ['11', '만난사람카드', '#/diary', { profile: true, data: true, paper: true }, 'person', '후'],
    ['12', '일기쓰기', '#/diary/new', { profile: true, data: true, paper: true }, null, '전후'],
    ['13', '설정', '#/settings', { profile: true, data: true, paper: true }, null, '전후'],
    ['14', '빈화면', '#/diary', { profile: true, paper: true }, null, '전후'],
    ['15', '글자가장큼', '#/settings', { profile: true, data: true, paper: true, text: 4 }, null, '후'],
  ];
  for (const theme of THEMES) {
    for (const [no, name, hash, state, act, sides] of SCREENS) {
      if (!sides.includes(SIDE)) continue;
      await page.goto('about:blank');
      await page.goto(URL);
      await page.evaluate(prepare, { theme, state, profile, seed });
      await page.goto('about:blank');
      await page.goto(`${URL}${hash}`);
      await page.waitForTimeout(hash === '#/map' ? 2200 : 900);
      try {
        if (act === 'card') { await page.locator('.stops .stop-open').first().click(); await page.locator('.pcard').waitFor({ timeout: 3000 }); }
        if (act === 'person') { await page.locator('.met .stop-open').first().click(); await page.locator('.pcard').waitFor({ timeout: 3000 }); }
        if (act === 'hall' || act === 'booth' || act === 'mapcard') {
          await page.getByRole('button', { name: '노스', exact: true }).click(); await page.waitForTimeout(1500);
          if (act === 'booth') await page.evaluate(() => { const m = document.querySelector('#view > .page').mapApi; const c = [...m.spots.values()][0]; m.flyTo(c.x, c.z, 200); });
          if (act === 'mapcard') await page.evaluate(async () => { const m = document.querySelector('#view > .page').mapApi; await m.ensureFull(); const row = [...m.rows.values()].find((r) => r[7]?.[0]?.endsWith('@LVCC_N')); await m.openCompany(row); });
          await page.waitForTimeout(1200);
        }
      } catch { out.shots.push(`${theme} ${no} ${name}: 동작을 못 해 그대로 찍었다`); }
      if (SHOTS) { await page.screenshot({ path: `${SHOTS}8x-${SIDE}-${theme === 'light' ? '밝게' : '어둡게'}-${no}-${name}.png` }); out.shots.push(`${theme} ${no} ${name}`); }
      if (theme === 'light' && !act) out.metrics.push({ no, name, ...(await measure()) });
    }
  }
  return JSON.stringify(out);
}
