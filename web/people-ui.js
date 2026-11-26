// 만난 사람의 줄 · 카드 · 고치기. 일기 탭(맨 위 세 명)과 만난 사람 화면(전체)이 함께 쓴다.
// 줄: 이니셜 · 이름 · 회사 · 부스 · 만난 날 + 연락처 열기 하나. 줄을 누르면 카드(plancard.js의 큰 창)가 열린다.
// 폰에만 남고 일기 보내기 묶음에는 들어가지 않는다.

import { el, out } from './dom.js';
import { kindKo, NICK_MAX, NOTE_MAX, parseScan, removePerson, safeHref, setFollowed, upsert, withTalk } from './people.js';
import { dateOf } from './alerts.js';
import { checkAlerts } from './notify.js';
import { getPeople, setPeople } from './people-store.js';

export const nameOf = (p) => p.nick || p.links[0]?.label || '이름 없음';
const initialOf = (p) => [...nameOf(p)][0] || '?';
const dateKo = (iso) => (iso ? iso.slice(5).replace('-', '/') : '');
export const whereOf = (p) => [p.company, p.booth && `부스 ${p.booth.split('@')[0]}`, dateKo(p.met)].filter(Boolean).join(' · ');
const diaryHref = (p) => (p.exId ? `#/diary/new/${encodeURIComponent(p.exId)}` : p.company ? `#/diary/new/n:${encodeURIComponent(p.company)}` : '');

// 줄 하나: 누르면 카드, 오른쪽에 가장 먼저 읽은 연락처 열기.
export function personRow(p, onOpen) {
  const first = p.links.map((l) => safeHref(l.url)).find(Boolean);
  return el('li', { class: 'stop' },
    el('button', { class: 'stop-open', type: 'button', 'aria-label': `${nameOf(p)} 카드 열기`, onclick: (ev) => onOpen(p, ev.currentTarget) },
      el('span', { class: 'no av', text: initialOf(p) }),
      el('span', { class: 'stop-main' },
        el('span', { class: 'name', text: nameOf(p) }),
        el('span', { class: 'where', text: whereOf(p) || '이 폰에만 남는다' }))),
    first ? out(first, '열기', 'pick') : null);
}

function linkLine(l) {
  const href = safeHref(l.url);
  return el('li', { class: 'contact' },
    el('b', { text: kindKo(l.kind) }),
    href ? out(href, ` ${l.label}`, 'link-text') : el('span', { class: 'link-text', text: ` ${l.label}` }));
}

// 링크드인 팔로우함(R62): 카드 안 한 줄. 누르면 켜지고(그 날을 남긴다) 다시 누르면 꺼진다. 링크드인 주소가 있으면 옆에 "링크드인 열기".
// 만난 지 이틀이 지났는데 꺼져 있으면 탭 위 띠가 챙긴다(app.js · notify.js). 폰에만 남는다.
function followRow(p, ctx) {
  const box = el('input', { type: 'checkbox', name: 'followed', checked: !!p.followed });
  const label = el('label', { class: 'toggle follow-toggle' }, box, el('span', { text: p.followed ? `링크드인 팔로우함 · ${dateKo(p.followed)}` : '링크드인 팔로우함' }));
  box.addEventListener('change', () => {
    const r = setFollowed(getPeople(), p.id, box.checked, dateOf(new Date()));
    if (!r || !setPeople(r.list)) { box.checked = !box.checked; return; }
    checkAlerts();
    ctx.after(box.checked ? `${nameOf(r.person)} 님을 팔로우함으로 남겼다.` : `${nameOf(r.person)} 님의 팔로우함을 껐다.`);
    ctx.shell.update(personCard(r.person, ctx));
  });
  const li = p.links.find((l) => l.kind === 'linkedin');
  const href = li ? safeHref(li.url) : '';
  return el('div', { class: 'follow-row' }, label, href ? out(href, '링크드인 열기', 'linkish') : null);
}

// ctx: { shell, companies: [{id,name,booth}], after(message) } — after는 바뀐 뒤 화면 목록을 다시 그린다.
export function personCard(p, ctx) {
  const { shell } = ctx;
  const del = el('button', { class: 'btn ghost warn-btn', type: 'button', text: '지우기' });
  del.addEventListener('click', () => {
    if (del.dataset.ask) {
      setPeople(removePerson(getPeople(), p.id));
      shell.close();
      ctx.after(`${nameOf(p)} 님을 지웠다.`);
      return;
    }
    del.dataset.ask = '1';
    del.textContent = '정말 지우기';
    setTimeout(() => { if (del.isConnected) { delete del.dataset.ask; del.textContent = '지우기'; } }, 4000);
  });
  const href = diaryHref(p);
  return [
    el('div', { class: 'pcard-top' },
      el('span', { class: 'no big-no av', text: initialOf(p) }),
      el('span', { class: 'pcard-sub', text: p.met ? `${p.met} 만남` : '만난 날 모름' }),
      el('button', { class: 'btn ghost pcard-close', type: 'button', text: '닫기', onclick: () => shell.close() })),
    el('h2', { class: 'pcard-name', text: nameOf(p) }),
    whereOf(p) ? el('p', { class: 'pcard-where', text: [p.company, p.booth && `부스 ${p.booth.split('@')[0]}`].filter(Boolean).join(' · ') || ' ' }) : null,
    p.links.length ? el('ul', { class: 'contacts' }, p.links.map(linkLine)) : null,
    p.note ? el('p', { class: 'pcard-note', text: p.note }) : null,
    followRow(p, ctx),
    el('div', { class: 'actions' },
      href ? el('a', { class: 'btn', href, text: `${p.company} 일기 쓰기` }) : null,
      el('button', { class: 'btn ghost', type: 'button', text: '고치기', onclick: () => shell.update(personEdit(p, ctx)) })),
    del,
  ];
}

// 받자마자 뜨는 두 칸(R61): "무슨 대화를 했나" 한 줄(위) + 부르는 이름(아래). 사람은 이미 폰에 남아 있어 "넘기기"를 눌러도 된다.
// 하나라도 적으면 "저장"이 나온다. 한 줄은 그 사람의 메모, 이름은 고치기의 이름 칸과 같은 자리 · 같은 글자 수다.
// 저장하면 그 사람 카드가 열리고, 이름을 적었으면 카드 제목이 이름이 된다(주소는 그 아래 줄). 회사 · 연락처는 카드의 "고치기"에서 적는다.
// 엔터: 한 줄 칸에서는 이름 칸으로, 이름 칸에서는 저장(둘 다 비었으면 넘기기).
export function talkLine(p, ctx) {
  const { shell } = ctx;
  const line = el('input', { name: 'talk', type: 'text', maxlength: NOTE_MAX, autocomplete: 'off', enterkeyhint: 'next', placeholder: '예: 로봇 팔 데모 · 채용 물어봄' });
  const nick = el('input', { name: 'nick', type: 'text', maxlength: NICK_MAX, autocomplete: 'off', enterkeyhint: 'done', placeholder: '내가 부르는 이름 (비워도 된다)' });
  const status = el('p', { class: 'note', role: 'status' });
  const save = el('button', { class: 'btn', type: 'submit', text: '저장', hidden: true });
  const skip = el('button', { class: 'linkish', type: 'button', text: '넘기기', onclick: () => shell.close() });
  const typed = () => !!(line.value.trim() || nick.value.trim());
  for (const box of [line, nick]) box.addEventListener('input', () => { save.hidden = !typed(); });
  line.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && !ev.isComposing) { ev.preventDefault(); nick.focus(); } });
  const form = el('form', { class: 'talkline' },
    el('label', { class: 'field' }, el('span', { class: 'pcard-tools-title', text: '무슨 대화를 했나' }), line),
    el('label', { class: 'field' }, el('span', { class: 'label', text: '이름' }), nick),
    status,
    el('div', { class: 'talkline-actions' }, skip, save));
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    if (!typed()) { shell.close(); return; }
    const r = withTalk(getPeople(), p.id, { note: line.value, nick: nick.value });
    if (!r || !setPeople(r.list)) { status.textContent = '이 폰에 저장하지 못했다. 사생활 보호 창이면 보통 창으로 다시 연다.'; return; }
    ctx.after(`${nameOf(r.person)} 님을 남겼다.`);
    shell.update(personCard(r.person, ctx));
  });
  return [el('p', { class: 'pcard-sub talkline-saved', text: `폰에 남겼다 · ${nameOf(p)}` }), form];
}

// 고치기(이름 · 회사 · 메모 · 연락처). 방금 받은 사람에게는 이것 대신 talkLine(한 줄)이 먼저 뜬다(R61).
export function personEdit(p, ctx) {
  const { shell, companies } = ctx;
  const links = [...p.links];
  const nick = el('input', { name: 'nick', maxlength: NICK_MAX, autocomplete: 'off', placeholder: '내가 부르는 이름', value: p.nick });
  const known = companies.find((c) => c.id === p.exId);
  const pick = el('select', { name: 'company', 'aria-label': '어디서' },
    el('option', { value: '', text: companies.length ? '관심 회사에서 고른다' : '관심 회사가 없다' }),
    !known && p.exId ? el('option', { value: p.exId, selected: true, text: p.company || p.exId }) : null,
    companies.map((c) => el('option', { value: c.id, selected: c.id === p.exId, text: c.name })));
  const other = el('input', { name: 'other', maxlength: 80, placeholder: '목록에 없으면 회사 이름', value: p.exId ? '' : p.company });
  const note = el('textarea', { name: 'note', rows: 2, maxlength: NOTE_MAX, placeholder: '한 줄 메모 (무슨 이야기를 했나)' });
  note.value = p.note || '';
  const status = el('p', { class: 'note', role: 'status' });
  const linkBox = el('ul', { class: 'contacts' });
  const drawLinks = () => linkBox.replaceChildren(...links.map((l, i) => el('li', { class: 'contact' },
    el('b', { text: kindKo(l.kind) }), el('span', { class: 'link-text', text: ` ${l.label}` }),
    links.length > 1 ? el('button', { class: 'linkish', type: 'button', text: '빼기', 'aria-label': `${l.label} 빼기`, onclick: () => { links.splice(i, 1); drawLinks(); } }) : null)));
  drawLinks();
  const addr = el('input', { name: 'addr', maxlength: 300, autocapitalize: 'off', autocomplete: 'off', spellcheck: 'false', inputmode: 'url', placeholder: '연락처 더하기 (주소나 아이디)', 'aria-label': '연락처 더하기' });
  const addLink = () => {
    if (!addr.value.trim()) return true;
    const r = parseScan(addr.value, 'auto');
    if (!r.ok) { status.textContent = r.why; return false; }
    if (!links.some((l) => l.key === r.link.key)) links.push(r.link);
    addr.value = '';
    drawLinks();
    return true;
  };
  const save = () => {
    if (!addLink()) return;
    const chosen = companies.find((c) => c.id === pick.value);
    const keep = !chosen && pick.value && pick.value === p.exId;
    const company = chosen ? chosen.name : keep ? p.company : other.value.trim();
    const result = upsert(getPeople(), {
      id: p.id, nick: nick.value, links, met: p.met, company,
      exId: chosen ? chosen.id : keep ? p.exId : '',
      booth: chosen ? chosen.booth : keep ? p.booth : '',
      note: note.value, followed: p.followed, metAt: p.metAt,
    });
    if (!setPeople(result.list)) { status.textContent = '이 폰에 저장하지 못했다. 사생활 보호 창이면 보통 창으로 다시 연다.'; return; }
    ctx.after(`${nameOf(result.person)} 님을 남겼다.`);
    shell.update(personCard(result.person, ctx));
  };
  const field = (label, input) => el('label', { class: 'field' }, el('span', { class: 'label', text: label }), input);
  return [
    el('div', { class: 'pcard-top' },
      el('h2', { class: 'pcard-tools-title', text: '만난 사람 고치기' }),
      el('button', { class: 'btn ghost pcard-close', type: 'button', text: '닫기', onclick: () => shell.update(personCard(p, ctx)) })),
    field('이름', nick), field('어디서', pick), el('label', { class: 'field' }, other),
    field('메모', note),
    linkBox, el('label', { class: 'field' }, addr),
    status,
    el('div', { class: 'actions' }, el('button', { class: 'btn', type: 'button', text: '저장', onclick: save })),
  ];
}
