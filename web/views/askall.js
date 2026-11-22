// 물어보기: 앱 안에 이미 있는 자료를 한 칸에서 찾는다. 자주 묻는 것은 답을 미리 적어 두었다.
// 서버도 열쇠도 없다. 자료는 폰에 담아 둔 것이라 인터넷 없이도 된다. 찾는 셈은 askall.js (화면과 따로).
// 영어로 부스에서 묻는 화면 "물어볼 말"(#/ask)과는 다르다. 이 화면(#/q)은 앱 안 자료를 찾는다.

import { el, num, out } from '../dom.js';
import { getFinder, getInfo, getOnsite, getPhrases, getPlaces, getSeparate, getTransit } from '../data.js';
import { mapsLink } from '../maps.js';
import { buildEntries, companyHits, resolveBasis, searchAll } from '../askall.js';
import { companyRow } from '../company.js';
import { getInterests } from '../store.js';

const SHOW = 5;
const IDEAS = ['배지', '셔틀', '삼성', '가격'];
const STATUS_KO = { confirmed: '2027 확인됨', check: '확인 필요' };

// 이 화면만 읽는 자료. 세션 일정은 다른 쪽에서 만드는 것이라 없으면 건너뛴다.
let faqOnce = null;
let sessionsOnce = null;
const readJson = (path) => fetch(path).then((r) => { if (!r.ok) throw new Error(path); return r.json(); });
const getFaq = () => (faqOnce ||= readJson('data/faq.json').catch((e) => { faqOnce = null; throw e; }));
const getSessions = () => (sessionsOnce ||= readJson('data/sessions.json').catch(() => null));

const mdOf = (read) => { const m = /^\d{4}-(\d\d)-(\d\d)/.exec(read || ''); return m ? `${Number(m[1])}/${Number(m[2])}` : ''; };

// 출처와 확인한 날짜 한 줄.
function proofLine(src, extra) {
  if (!src) return null;
  return el('small', { class: 'proof wrap' }, `${mdOf(src.read)} 확인 · `, out(src.url, src.ko || '출처'), extra ? ` · ${extra}` : '');
}

function hitCard(h, places) {
  return el('li', { class: 'entry' },
    el('div', { class: 'name' }, h.title, h.status ? el('span', { class: h.status === 'confirmed' ? 'tag mint' : 'tag', text: STATUS_KO[h.status] }) : null, h.live ? el('span', { class: 'tag', text: '라이브 표시' }) : null),
    h.show && el('p', { lang: h.en ? 'en' : null, text: h.show }),
    el('small', { class: 'proof wrap' }, `${h.spot}`),
    h.src ? proofLine(h.src, h.more ? `출처 ${h.more + 1}개` : '') : el('small', { class: 'proof wrap', text: h.note || '' }),
    el('div', { class: 'row-actions' }, el('a', { href: h.to, text: h.toKo }), (h.place && places && mapsLink(places, h.place)) ? out(mapsLink(places, h.place), '구글맵에서 열기') : null));
}

// 자주 묻는 것 한 장: 물음 · 답 · 근거(어느 자료의 어느 줄, 출처, 확인한 날짜) · 가는 링크.
function faqCard(item, docs) {
  const basis = item.basis.map((b) => resolveBasis(b, docs));
  return el('article', { class: 'entry' },
    el('h3', { text: item.q }),
    el('p', { text: item.a }),
    el('div', { class: 'block' },
      el('p', { class: 'note' }, el('b', { text: '근거 ' })),
      el('ul', { class: 'stack' }, basis.map((b) => el('li', {},
        el('span', { text: b.ko }),
        b.sources.length
          ? el('small', { class: 'proof wrap' }, `${mdOf(b.read)} 확인 · `, b.sources.flatMap((s, i) => [i ? ' · ' : '', out(s.url, s.ko)]))
          : el('small', { class: 'proof wrap', text: b.app ? `${mdOf(b.read)} 확인 · 앱 안의 글` : '앱에 담아 둔 자료 (영어는 초안)' }))))),
    el('div', { class: 'row-actions' }, item.links.map((l) => el('a', { href: l.to, text: l.ko }))));
}

// 많은 줄은 다섯 개씩 보인다.
function cap(list, make) {
  const box = el('ul', { class: 'stack' });
  const more = el('button', { class: 'btn ghost wide', type: 'button' });
  let shown = 0;
  const add = () => {
    box.append(...list.slice(shown, shown + SHOW).map(make));
    shown = Math.min(list.length, shown + SHOW);
    more.hidden = shown >= list.length;
    more.textContent = `더 보기 (${num(list.length - shown)}개 남음)`;
  };
  more.addEventListener('click', add);
  add();
  return [box, more];
}

export async function render({ rest }) {
  const [info, separate, phrases, sessions, faq, transit, onsite, places] = await Promise.all([getInfo(), getSeparate(), getPhrases(), getSessions(), getFaq().catch(() => ({ items: [] })), getTransit().catch(() => null), getOnsite().catch(() => null), getPlaces().catch(() => null)]);
  const docs = { info, separate, phrases };
  const entries = buildEntries({ info, separate, phrases, sessions, transit, onsite, places });

  const input = el('input', { type: 'search', inputmode: 'search', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', placeholder: '배지, 셔틀, 삼성, 가격', 'aria-label': '앱 안 자료에서 찾을 말' });
  const results = el('div', { class: 'page' });
  const note = el('p', { class: 'note', role: 'status' });

  const ask = (text) => { input.value = text; run(); input.focus(); };

  function idle() {
    const sessionCount = Array.isArray(sessions?.items) ? sessions.items.length : 0;
    note.textContent = sessionCount
      ? `궁금한 말을 적는다. 공식 세션 ${num(sessionCount)}개도 같이 찾는다.`
      : '궁금한 말을 적는다. 낱말도 되고 물음 그대로도 된다.';
    results.replaceChildren(
      el('section', { class: 'panel' },
        el('h2', { text: '자주 묻는 것' }),
                el('div', { class: 'fields' }, faq.items.map((it) => el('button', { class: 'field-link', type: 'button', onclick: () => ask(it.q) }, el('span', { text: it.q }))))),
      el('section', { class: 'panel' },
        el('h2', { text: '이런 말로 찾아 본다' }),
        el('div', { class: 'segs' }, IDEAS.map((w) => el('button', { class: 'seg', type: 'button', text: w, onclick: () => ask(w) })))));
  }

  let turn = 0;
  async function run() {
    const mine = ++turn;
    const q = input.value.trim();
    if (!q) { idle(); return; }
    const found = searchAll(q, entries, faq);
    const companyBox = el('section', { class: 'panel', hidden: true });
    const empty = el('section', { class: 'panel', hidden: true },
      el('h2', { text: '맞는 것이 없다' }),
      el('p', { text: '앱 안 자료에 없다. 낱말을 바꿔 본다(예: 배지 · 셔틀).' }),
      el('p', { class: 'note' }, out('https://www.ces.tech/', 'CES 공식 사이트'), '에서 확인한다.'));
    const parts = [];
    if (found.faq.length) {
      const top = found.faq.slice(0, 3);
      const later = found.faq.slice(3);
      parts.push(el('section', { class: 'panel band' },
        el('h2', { text: `자주 묻는 것 ${found.faq.length}` }),
        top.map((it) => faqCard(it, docs)),
        later.length ? el('details', {}, el('summary', { text: `더 보기 (${later.length}개)` }), later.map((it) => faqCard(it, docs))) : null));
    }
    for (const g of found.groups) {
      parts.push(el('section', { class: 'panel' }, el('h2', { text: `${g.ko} ${g.hits.length}` }), ...cap(g.hits, (h) => hitCard(h, places))));
    }
    parts.push(companyBox, empty);
    results.replaceChildren(...parts);
    const some = found.faq.length > 0 || found.groups.length > 0;
    note.textContent = some ? '맞는 것을 갈래별로 보인다. 줄마다 출처와 확인한 날짜가 있다.' : '앱 안 자료를 찾는 중이다.';
    // 회사는 찾기 자료(코어)를 그때 불러와 찾는다.
    let finder = null;
    try { finder = await getFinder(); } catch { finder = null; }
    if (mine !== turn) return;
    const { rows, total } = finder ? companyHits(q, finder, SHOW) : { rows: [], total: 0 };
    if (rows.length) {
      const paintCount = () => {};
      companyBox.hidden = false;
      companyBox.replaceChildren(
        el('h2', { text: `회사 ${num(total)}` }),
                el('ol', { class: 'hits' }, rows.map((r) => companyRow(r, finder.data, finder.placeKo, paintCount))),
        el('div', { class: 'row-actions' }, el('a', { href: '#/find', text: `회사 화면에서 더 보기 (관심 ${getInterests().length}곳)` })));
    }
    if (!some && !rows.length) {
      empty.hidden = false;
      note.textContent = finder ? '맞는 것이 없다.' : '회사 자료를 불러오지 못했다. 앱 안 자료에서는 맞는 것이 없다.';
    } else if (!some) note.textContent = '앱 안 자료에서는 맞는 것이 없고, 회사가 있다.';
    else note.textContent = '맞는 것을 갈래별로 보인다. 줄마다 출처와 확인한 날짜가 있다.';
  }
  input.addEventListener('input', run);

  if (rest[0]) { try { input.value = decodeURIComponent(rest[0]); } catch { /* 깨진 주소는 비운다 */ } }
  run();

  return el('div', { class: 'page' },
    el('section', { class: 'panel' },
      el('h1', { text: '물어보기' }),
      el('p', { class: 'lead' }, '앱 안 자료에서만 찾는다. 인터넷 없이도 된다. 영어로 묻는 말은 ', el('a', { href: '#/ask', text: '물어볼 말' }), '.'),
      note),
    results,
    // 한 손으로 닿게 찾기 칸을 아래에 붙여 둔다.
    el('div', { class: 'dock' }, el('label', { class: 'field' }, input)));
}
