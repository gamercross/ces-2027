// Playwright CLI test for 마무리 셋(11/22) + 갈 곳 안 1(11/23): ① 날짜 한 줄 · 1/5는 내 일정만 ② 회사 카드의 "이 회사 강연"과 부스 자리마다 한 줄 ③ 설정 "이 폰의 내 자료 지우기".
// Run with: playwright-cli open about:blank
//           playwright-cli run-code "$(cat scripts/browser-finish.mjs)"
// URL은 지은 것 한 벌(dist)을 가리킨다. W는 폰 폭(360 또는 390). SHOTS를 채우면 그 폴더(끝에 /)에 화면 사진을 남긴다.
// 돌려주는 JSON의 checks가 모두 pass여야 한다.
async (page) => {
  const URL = 'http://127.0.0.1:47571/';
  const W = 360, H = 740;
  const SHOTS = '';
  const out = { w: W, checks: [], shots: [] };
  const ok = (name, pass, detail) => out.checks.push({ name, pass: !!pass, ...(pass ? {} : { detail }) });

  await page.setViewportSize({ width: W, height: H });
  await page.goto(URL);
  await page.evaluate(async () => { for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister(); for (const k of await caches.keys()) await caches.delete(k); localStorage.clear(); sessionStorage.clear(); });

  // 자료에서 시험할 회사: 세션이 있는 Abbott(부스 둘) · 부스가 많은 회사 · 세션이 없는 회사
  const pick = await page.evaluate(async () => {
    const d = await (await fetch('data/exhibitors.json')).json();
    const by = (n) => d.ex.find((r) => r[1] === n);
    const big = d.ex.find((r) => r[7].length >= 6 && r[7].every((b) => /LVCC/.test(b)));
    const one = d.ex.filter((r) => r[7].length === 1 && /@LVCC_N$/.test(r[7][0]) && !/abbott|deloitte|pwc/i.test(r[1])).slice(0, 8);
    return { abbott: by('Abbott')?.[0], deloitte: by('Deloitte')?.[0], big: big?.[0], bigN: big?.[7].length, one: one.map((r) => r[0]) };
  });
  const profile = { nick: '재엽', tag: 'stu', line: '로봇과 AI를 보러 간다', github: 'https://github.com/gamercross', discord: 'jy' };
  const ids = [pick.deloitte, pick.abbott, ...pick.one.slice(0, 4)];
  const days = [1, 1, 2, 3, 4, 0];
  const interests = ids.map((id, i) => ({ id, day: days[i] }));
  const diary = [{ id: 'e1', date: '2027-01-06', exId: pick.one[0], company: '시험', booth: '', saw: '로봇 팔', felt: '', for: ['stu'], sent: null }];
  const prepare = ({ state, profile: pf, interests: it, diary: dy }) => {
    localStorage.clear(); sessionStorage.clear();
    if (state.profile) localStorage.setItem('ces2027.profile.v1', JSON.stringify(pf));
    if (state.data) { localStorage.setItem('ces2027.interests.v1', JSON.stringify(it)); localStorage.setItem('ces2027.diary.v1', JSON.stringify(dy)); }
    if (state.text) localStorage.setItem('ces2027.text.v1', JSON.stringify(state.text));
    if (state.events) localStorage.setItem('ces2027.events.v1', JSON.stringify(state.events));
  };
  const open = async (hash, state) => {
    await page.goto('about:blank');
    await page.goto(URL);
    await page.evaluate(prepare, { state, profile, interests, diary });
    await page.goto('about:blank');
    await page.goto(`${URL}${hash}`);
    await page.waitForTimeout(hash.startsWith('#/map') ? 2200 : 1000);
  };
  const shot = async (name) => { if (SHOTS) { await page.screenshot({ path: `${SHOTS}${name}-${W}.png` }); out.shots.push(name); } };
  // 가로로 넘치는가(페이지 전체)
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  // 눌리는 것 중 44px 아래인 것
  const smallTaps = (scope) => page.evaluate((sel) => [...document.querySelectorAll(`${sel} a, ${sel} button`)].filter((n) => { const r = n.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (r.height < 43.5 || r.width < 43.5) && !n.classList.contains('linkish'); }).map((n) => `${n.tagName}.${n.className}:${Math.round(n.getBoundingClientRect().width)}x${Math.round(n.getBoundingClientRect().height)}`).slice(0, 5), scope);

  const STATE = { profile: true, data: true };

  // ---- ① 날짜: 갈 곳은 날짜 한 줄(‹ 1월 6일 (수) ›), 1/5는 내 일정이 있을 때만 · 지도의 이 날 보기 · 세션 일정
  const PRE = [{ id: 'p1', date: '2027-01-05', from: '18:00', to: '19:00', name: '사전 모임', place: '' }];
  for (const text of [1, 4]) {
    await open('#/plan', { ...STATE, text: text === 1 ? 0 : text });
    const nav = await page.evaluate(() => ({
      chips: document.querySelectorAll('.planpage .daychip, .planpage .segs[aria-label="날짜"]').length,
      day: document.querySelector('.daynav-day')?.textContent,
      btns: [...document.querySelectorAll('.daynav-btn')].map((n) => ({ w: Math.round(n.getBoundingClientRect().width), h: Math.round(n.getBoundingClientRect().height), off: n.disabled })),
    }));
    ok(`${W} 글자${text} 갈 곳: 날짜 칩 줄 없이 날짜 한 줄(1월 6일 (수))이고, 1/5에 내 일정이 없으면 앞 날이 없다`, nav.chips === 0 && nav.day === '1월 6일 (수)' && nav.btns.length === 2 && nav.btns[0].off && !nav.btns[1].off, JSON.stringify(nav));
    ok(`${W} 글자${text} 갈 곳: 날짜 넘기는 단추가 44px 이상이고 가로로 넘치지 않는다`, nav.btns.every((c) => c.w >= 44 && c.h >= 44) && (await overflow()) <= 0, `page ${await overflow()} ${JSON.stringify(nav.btns)}`);
    if (text === 1) {
      await shot('140-finish-plan-chips');
      // 회사 카드의 날짜 고르기: 1/5가 없고 넘치지 않는다
      await page.locator('.nextup-open').click();
      await page.locator('.pcard').waitFor({ timeout: 3000 });
      const seg = await page.evaluate(() => { const g = document.querySelector('.pcard .segs[aria-label$="날짜"]'); return { t: [...g.querySelectorAll('.seg')].map((s) => s.textContent).join(' '), scroll: g.scrollWidth - g.clientWidth }; });
      ok(`${W} 갈 곳 카드: 날짜 고르기는 1/6 · 1/7 · 1/8 · 1/9 · 날짜 없음이고(1/5 없음) 넘치지 않는다`, seg.t === '1/6 1/7 1/8 1/9 날짜 없음' && seg.scroll <= 1 && (await overflow()) <= 0, JSON.stringify(seg));
      // 1/5에 내 일정이 있으면 앞 날로 넘겨 그 일정과 사전 일정 안내를 본다(회사 줄은 없다)
      await open('#/plan', { ...STATE, events: PRE });
      await page.locator('.daynav-btn[data-side="prev"]').click();
      await page.waitForTimeout(300);
      const pre = await page.evaluate(() => ({ day: document.querySelector('.daynav-day')?.textContent, note: document.querySelector('.daynotes .note')?.textContent, stops: document.querySelectorAll('.planpage .stops .stop').length, meal: document.querySelector('.meal-text')?.textContent, go: document.querySelectorAll('.nextup a.btn').length }));
      ok(`${W} 갈 곳: 1월 5일에는 내 일정과 사전 일정 안내만 보이고 회사 · 길 안내는 없다`, pre.day === '1월 5일 (화)' && /1\/6에 연다/.test(pre.note || '') && pre.stops === 0 && /사전 모임 \(내 일정\)/.test(pre.meal || '') && pre.go === 0, JSON.stringify(pre));
    }
  }

  // 지도의 "이 날 보기" (1/6 = 1번)
  await open('#/map/day/1', STATE);
  const bar = await page.evaluate(() => document.querySelector('.daybar')?.textContent || '');
  ok(`${W} 지도: "이 날 보기"에서 1/6 갈 곳이 보인다`, /1\/6 갈 곳 2곳만 보는 중/.test(bar) && /모두 보기/.test(bar), bar);
  ok(`${W} 지도: 가로 넘침 없음`, (await overflow()) <= 0, await overflow());
  await shot('142-finish-map-day');

  // 세션 일정: 칩은 1/5 ~ 1/9(1/4는 칩에 없다)
  await open('#/sessions', STATE);
  const tabs = await page.evaluate(() => { const g = document.querySelector('.segs[aria-label="날짜"]'); return { t: [...g.querySelectorAll('.daychip .dc-day')].map((s) => s.textContent), scroll: g.scrollWidth - g.clientWidth, h: Math.round(g.querySelector('.daychip').getBoundingClientRect().height) }; });
  ok(`${W} 세션 일정: 날짜 칩은 1/5 ~ 1/9, 1/4는 없다`, tabs.t.join(' ') === '1/5 1/6 1/7 1/8 1/9', JSON.stringify(tabs));
  ok(`${W} 세션 일정: 칩 줄이 넘치지 않는다`, tabs.scroll <= 1 && tabs.h >= 44 && (await overflow()) <= 0, JSON.stringify(tabs));
  await shot('143-finish-sessions-tabs');

  // ---- ② 회사 카드: 세션 줄과 부스 줄 (지도)
  await open(`#/map/at/${encodeURIComponent(pick.abbott)}`, STATE);
  await page.locator('.card').waitFor({ timeout: 6000 });
  await page.locator('.card-sessions:not([hidden])').waitFor({ timeout: 6000 }).catch(() => {});
  const mc = await page.evaluate(() => {
    const s = document.querySelector('.card-sessions');
    const lines = [...document.querySelectorAll('.card-sessions a.pick-row')].map((a) => ({ h: Math.round(a.getBoundingClientRect().height), href: a.getAttribute('href'), t: a.textContent }));
    const booths = [...document.querySelectorAll('.card-booths button.pick-row')].map((b) => ({ t: b.textContent, cur: b.getAttribute('aria-current') }));
    return { stray: /null|undefined/.test(document.querySelector('.card').textContent), sessionsShown: !!s && !s.hidden, lines, booths, label: document.querySelector('.card-sessions .label')?.textContent, over: document.documentElement.scrollWidth - innerWidth };
  });
  ok(`${W} 지도 카드(Abbott): 세션 줄이 있고 누르는 곳이 44px 이상, 공식 주소로 간다`, mc.sessionsShown && mc.lines.length >= 1 && mc.lines.every((l) => l.h >= 44 && /^https:\/\/www\.ces\.tech\//.test(l.href) && /\d+\/\d+ \(.\) \d+:\d\d ~ \d+:\d\d · /.test(l.t)), JSON.stringify(mc.lines));
  ok(`${W} 지도 카드(Abbott): 부스 둘이 한 줄씩 보이고 하나는 "지금 보는 곳", 깨진 글자("null")가 없다`, !mc.stray && mc.booths.length === 2 && mc.booths.filter((b) => b.cur === 'true').length === 1, JSON.stringify(mc.booths));
  const scrollTo = (sel) => page.evaluate((s) => document.querySelector(s)?.scrollIntoView({ block: 'center' }), sel);
  await shot('144-finish-map-card-sessions');
  await scrollTo('.card-sessions');
  await page.waitForTimeout(200);
  await shot('144b-finish-map-card-sessions-list');
  // 둘째 부스 줄을 누르면 그 부스로 카드가 바뀐다
  const otherText = mc.booths.find((b) => b.cur !== 'true')?.t;
  await page.locator('.card-booths button.pick-row:not([aria-current="true"])').click();
  await page.waitForTimeout(900);
  const after = await page.evaluate(() => [...document.querySelectorAll('.card-booths button.pick-row')].map((b) => ({ t: b.textContent, cur: b.getAttribute('aria-current') })));
  ok(`${W} 지도 카드: 둘째 부스 줄을 누르면 "지금 보는 곳"이 그 줄로 옮겨 간다`, after.find((b) => b.cur === 'true')?.t.startsWith(otherText.replace(/지금 보는 곳$/, '').trim()), JSON.stringify(after));
  ok(`${W} 지도 카드: 누르는 것이 모두 44px 이상`, (await smallTaps('.card')).length === 0, JSON.stringify(await smallTaps('.card')));
  // 세션이 없는 회사: 줄이 숨는다
  await open(`#/map/at/${encodeURIComponent(pick.one[0])}`, STATE);
  await page.locator('.card').waitFor({ timeout: 6000 });
  await page.waitForTimeout(800);
  const none = await page.evaluate(() => { const s = document.querySelector('.card-sessions'); return { hidden: !s || s.hidden || getComputedStyle(s).display === 'none', booths: document.querySelectorAll('.card-booths').length, where: document.querySelector('.card-where')?.textContent }; });
  ok(`${W} 지도 카드(세션 없는 회사): 세션 줄이 숨고, 부스 하나는 한 줄로 보인다`, none.hidden && none.booths === 0 && /부스/.test(none.where || ''), JSON.stringify(none));
  // 부스가 많은 회사: 앞의 넷 + 나머지 보기
  await open(`#/map/at/${encodeURIComponent(pick.big)}`, STATE);
  await page.locator('.card').waitFor({ timeout: 6000 });
  const big = await page.evaluate(() => ({ lines: document.querySelectorAll('.card-booths .pick-row').length, more: document.querySelector('.card-booths .linkish')?.textContent, label: document.querySelector('.card-booths .label')?.textContent }));
  ok(`${W} 지도 카드(부스 많은 회사): 앞의 몇 곳만 먼저 보이고 "나머지 보기"가 있다`, big.lines >= 4 && big.lines < pick.bigN && /나머지 \d+곳 보기/.test(big.more || '') && big.label === `부스 ${pick.bigN}곳`, JSON.stringify({ ...big, n: pick.bigN }));
  await shot('145-finish-map-card-many-booths');
  ok(`${W} 지도 카드: 가로 넘침 없음`, (await overflow()) <= 0, await overflow());

  // ---- 갈 곳 카드
  await open('#/plan', STATE);
  await page.locator('.nextup-open').click();
  await page.locator('.pcard').waitFor({ timeout: 3000 });
  await page.locator('.card-sessions:not([hidden])').waitFor({ timeout: 6000 }).catch(() => {});
  const pc = await page.evaluate(() => ({ title: document.querySelector('.pcard .card-sessions.compact .sessions-title')?.textContent, when: [...document.querySelectorAll('.pcard .card-sessions.compact .note')].map((n) => n.textContent), links: document.querySelectorAll('.pcard .card-sessions a, .pcard .card-sessions button').length, name: document.querySelector('.pcard-name')?.textContent, booths: document.querySelectorAll('.pcard .card-booths').length }));
  ok(`${W} 갈 곳 카드(Deloitte): "이 회사 강연 n개"가 누르는 줄 없이 한 칸으로 보인다`, pc.name === 'Deloitte' && /^이 회사 강연 \d+개$/.test(pc.title || '') && pc.when.length >= 1 && pc.links === 0, JSON.stringify(pc));
  await shot('146-finish-plan-card-sessions');
  // 부스 둘인 회사(1/6의 그다음 곳: Abbott)
  await page.locator('.pcard-close').click();
  await page.locator('.after .stop-open').first().click();
  await page.locator('.pcard .card-booths').waitFor({ timeout: 3000 });
  const pb = await page.evaluate(() => ({ name: document.querySelector('.pcard-name')?.textContent, lines: [...document.querySelectorAll('.pcard .card-booths .pick-row')].map((b) => b.textContent), small: [...document.querySelectorAll('.pcard .card-booths .pick-row')].filter((n) => n.getBoundingClientRect().height < 43.5).length, over: document.documentElement.scrollWidth - innerWidth }));
  ok(`${W} 갈 곳 카드(Abbott): 부스 둘이 한 줄씩이고 줄이 44px 이상, 넘침 없음`, pb.name === 'Abbott' && pb.lines.length === 2 && pb.small === 0 && pb.over <= 0, JSON.stringify(pb));
  await shot('147-finish-plan-card-booths');
  await page.locator('.pcard .card-booths button.pick-row').nth(1).click();
  await page.waitForTimeout(1500);
  ok(`${W} 갈 곳 카드: 부스 줄을 누르면 지도에서 그 부스 카드가 열린다`, /^#\/map\/at\//.test(await page.evaluate(() => location.hash)) && (await page.locator('.card .card-booths').count()) === 1, await page.evaluate(() => location.hash));

  // 글자 가장 크게(4단계)에서도 카드가 깨지지 않는다
  await open(`#/map/at/${encodeURIComponent(pick.abbott)}`, { ...STATE, text: 4 });
  await page.locator('.card').waitFor({ timeout: 6000 });
  await page.locator('.card-sessions:not([hidden])').waitFor({ timeout: 6000 }).catch(() => {});
  const t4 = await page.evaluate(() => ({ over: document.documentElement.scrollWidth - innerWidth, lines: [...document.querySelectorAll('.card .pick-row')].every((n) => n.scrollWidth <= n.clientWidth + 1) }));
  ok(`${W} 글자4 지도 카드: 가로 넘침 · 줄 안 잘림 없음`, t4.over <= 0 && t4.lines, JSON.stringify(t4));
  await scrollTo('.card-sessions');
  await page.waitForTimeout(200);
  await shot('148-finish-text4-map-card');

  // ---- ③ 설정: 이 폰의 내 자료 지우기 (두 번 확인)
  await open('#/settings', STATE);
  const rows = await page.evaluate(() => [...document.querySelectorAll('.setrow-main')].map((r) => r.textContent));
  ok(`${W} 설정: "받아 둔 모델"과 "이 폰의 내 자료"가 다른 줄이다`, rows.some((r) => r.startsWith('받아 둔 모델')) && rows.some((r) => r.startsWith('이 폰의 내 자료')) && !rows.some((r) => r.startsWith('저장 공간')), JSON.stringify(rows));
  await scrollTo('#mine-open');
  await page.waitForTimeout(200);
  await shot('149-finish-settings-mine-row');
  // 폰 안에 앱 껍데기 캐시와 녹음을 만들어 둔다(지운 뒤에도 캐시는 남고 녹음은 사라져야 한다)
  await page.evaluate(async () => {
    await (await caches.open('ces2027-shell-test')).put('/shell', new Response('1'));
    await new Promise((res, rej) => { const q = indexedDB.open('ces2027', 1); q.onupgradeneeded = () => q.result.createObjectStore('audio'); q.onsuccess = () => { const tx = q.result.transaction('audio', 'readwrite'); tx.objectStore('audio').put(new Blob(['x']), 'e1'); tx.oncomplete = () => { q.result.close(); res(); }; }; q.onerror = () => rej(q.error); });
  });
  await page.locator('#mine-open').click();
  await page.locator('.pcard').waitFor({ timeout: 3000 });
  const s1 = await page.evaluate(() => ({ title: document.querySelector('.pcard-tools-title')?.textContent, exp: document.querySelector('#mine-export')?.textContent, expOff: document.querySelector('#mine-export')?.disabled, next: document.querySelector('#mine-next')?.textContent, wipe: !!document.querySelector('#mine-wipe'), text: document.querySelector('.pcard-body').textContent, over: document.documentElement.scrollWidth - innerWidth, keysBefore: Object.keys(localStorage).filter((k) => k.startsWith('ces2027.')).length }));
  ok(`${W} 지우기 첫 확인: 내보내기를 먼저 권하고 단추가 둘(내보내기 · 넘어가기), 아직 지우지 않는다`, s1.title === '이 폰의 내 자료 지우기' && /내보내/.test(s1.exp) && s1.expOff === false && /넘어가기/.test(s1.next) && !s1.wipe && /내보내 두는 것을 권한다/.test(s1.text) && s1.keysBefore > 0 && s1.over <= 0, JSON.stringify(s1));
  ok(`${W} 지우기 첫 확인: 누르는 것이 44px 이상`, (await smallTaps('.pcard')).length === 0, JSON.stringify(await smallTaps('.pcard')));
  await shot('150-finish-mine-step1');
  // 내보내기가 파일을 내려보낸다
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 4000 }).catch(() => null), page.locator('#mine-export').click()]);
  ok(`${W} 지우기 첫 확인: "일기 내보내기"가 파일을 내려보낸다`, !!dl && /\.json$/.test(dl.suggestedFilename()), dl && dl.suggestedFilename());
  ok(`${W} 지우기 첫 확인: 내보내도 자료는 그대로 있다`, (await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('ces2027.')).length)) === s1.keysBefore, 'keys');
  await page.locator('#mine-next').click();
  await page.waitForTimeout(200);
  const s2 = await page.evaluate(() => ({ title: document.querySelector('.pcard-tools-title')?.textContent, wipe: document.querySelector('#mine-wipe')?.textContent, keys: Object.keys(localStorage).filter((k) => k.startsWith('ces2027.')).length, text: document.querySelector('.pcard-body').textContent }));
  ok(`${W} 지우기 둘째 확인: "정말 지울까?"와 "지금 지운다" 단추, 아직 지우지 않았다`, s2.title === '정말 지울까?' && s2.wipe === '지금 지운다' && s2.keys === s1.keysBefore && /되돌릴 수 없다/.test(s2.text), JSON.stringify(s2));
  await shot('151-finish-mine-step2');
  // 둘째 확인에서 "그만두기"를 누르면 아무것도 지우지 않는다
  await page.locator('.pcard-body button', { hasText: '그만두기' }).click();
  await page.waitForTimeout(200);
  ok(`${W} 지우기: 둘째 확인에서 그만두면 닫히고 자료는 그대로다`, (await page.locator('.pcard-back').isHidden()) && (await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('ces2027.')).length)) === s1.keysBefore, 'cancel');
  await page.locator('#mine-open').click();
  await page.locator('#mine-next').click();
  await page.locator('#mine-wipe').click();
  await page.waitForTimeout(300);
  await shot('152-finish-mine-done');
  await page.waitForURL(/#\/card$/, { timeout: 6000 });
  await page.waitForTimeout(800);
  const done = await page.evaluate(async () => ({
    hash: location.hash,
    // ces2027.boot.v1은 내 자료가 아니라 앱이 본 판 이름이다(index.html이 열 때마다 다시 적는다, #87). 앱 껍데기 캐시처럼 남아도 된다.
    keys: Object.keys(localStorage).filter((k) => k.startsWith('ces2027.') && k !== 'ces2027.boot.v1'),
    sess: Object.keys(sessionStorage).filter((k) => k.startsWith('ces2027.')),
    caches: (await caches.keys()).filter((k) => k.startsWith('ces2027')),
    dbs: (await indexedDB.databases?.())?.map((d) => d.name) || [],
    h1: document.querySelector('#view h1')?.textContent,
    nick: !!document.querySelector('#view input'),
    tabsHidden: document.body.dataset.tab,
  }));
  ok(`${W} 지운 뒤: 처음 들어온 것처럼 첫 실행 명함(#/card)부터 시작한다`, done.hash === '#/card' && done.nick && done.tabsHidden === 'intro', JSON.stringify(done));
  ok(`${W} 지운 뒤: 내 자료 열쇠(명함 · 일기 · 갈 곳 · 설정)가 하나도 남지 않고, 녹음 보관소도 없다`, done.keys.length === 0 && !done.dbs.includes('ces2027'), JSON.stringify(done));
  ok(`${W} 지운 뒤: 앱 껍데기 캐시는 남는다`, done.caches.includes('ces2027-shell-test'), JSON.stringify(done.caches));
  await shot('153-finish-mine-after-first-card');
  // 열쇠를 쓰지 않는 새 첫 화면이 다시 정상으로 쓰이는지: 명함을 만들면 지도로 간다
  return JSON.stringify({ ...out, pass: out.checks.every((c) => c.pass), failed: out.checks.filter((c) => !c.pass) });
}
