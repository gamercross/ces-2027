// 온라인 명함: 별명 · 나(네 태그 가운데 하나) · 한 줄 · 링크드인 · 깃허브 · 디스코드 → 적은 것만 QR(셋까지).
// 처음 들어오면 환영 한 줄 → 명함 한 화면(별명 · 나만 필수, 나머지는 건너뛰어도 된다) → 만든 명함 + QR → "지도로".
// 설정 탭에서 다시 오면 QR 보기(#/card) · 고치기(#/card/edit). 명함은 이 폰에만 남는다. QR은 폰에서 만든다(인터넷 없이).

import { el } from '../dom.js';
import { getProfile, setProfile, TAGS, tagKo } from '../store.js';
import { getInfo, getSettings } from '../data.js';
import { tipLine } from '../tips.js';
import { dateOf, defaultRemind } from '../alerts.js';
import { checkAlerts, getPaper, setPaper } from '../notify.js';

// 종이 명함: 이벤트 부스에는 명함을 넣어야 하는 곳이 있다. 있는지 묻고, 없으면 준비할 것을 보인다. 답은 폰에만 남는다.
export function paperPanel(showFrom) {
  const box = el('section', { class: 'panel' });
  function draw() {
    // 다시 물을 날이 없으면 기본(전시 첫날의 8일 전)을 쓴다.
    const paper = { remindOn: defaultRemind(showFrom), ...(getPaper() || { has: null }) };
    const answer = (has) => { setPaper({ ...paper, has, asked: dateOf(new Date()) }); checkAlerts(); draw(); };
    const remind = el('input', { type: 'date', value: paper.remindOn || defaultRemind(showFrom), 'aria-label': '다시 물을 날' });
    remind.addEventListener('change', () => { if (remind.value) { setPaper({ ...(getPaper() || paper), remindOn: remind.value }); checkAlerts(); } });
    box.replaceChildren(...[
      el('h2', { text: '종이 명함' }),
      el('p', { text: '명함을 넣어야 응모되는 부스가 있다. 종이 명함이 있나요?' }),
      el('div', { class: 'segs', role: 'group', 'aria-label': '종이 명함이 있나요' },
        el('button', { class: 'seg', type: 'button', text: '있다', 'aria-pressed': paper.has === true ? 'true' : 'false', onclick: () => answer(true) }),
        el('button', { class: 'seg', type: 'button', text: '없다', 'aria-pressed': paper.has === false ? 'true' : 'false', onclick: () => answer(false) })),
      paper.has === true ? el('p', { class: 'note', text: '부스마다 한 장, 만나는 사람 몫도 넉넉히.' }) : null,
      paper.has === false ? el('div', { class: 'block' },
        el('h3', { text: 'QR 명함으로 대신' }),
        el('ul', { class: 'dots' },
          el('li', { text: '위 QR을 상대가 읽으면 링크드인 · 깃허브 · 디스코드가 열린다. 인터넷 없이도 보인다.' }),
          el('li', { text: '통에 넣는 응모는 QR로 안 된다. 종이 명함이 필요하다.' }))) : null,
      paper.has === false ? el('div', { class: 'block' },
        el('h3', { text: '종이 명함 만들기' }),
        el('ul', { class: 'dots' },
          el('li', { text: '이름 · 하는 일 한 줄(영문) · 이메일이나 깃허브. 뒷면에 QR을 넣어도 된다.' }),
          el('li', { text: '통에 넣으면 남이 본다. 공개돼도 되는 연락처만.' }),
          el('li', { text: '인쇄는 며칠 걸린다. 출발 한 주 전까지 맡긴다.' }))) : null,
      el('label', { class: 'field' }, el('span', { class: 'label', text: '출발 전에 다시 물을 날' }), remind),
      el('p', { class: 'note', text: '이 폰에만 남는다.' }),
    ].filter(Boolean));
  }
  draw();
  return box;
}

// 링크드인: 프로필 주소(linkedin.com/in/아이디, 앞에 www. · kr. 같은 것이 붙거나 뒤에 ?… 가 붙어도 된다)나 그 끝의 아이디를 받아 프로필 주소로.
// 비어 있으면 '', 틀리면 null. 회사 쪽(linkedin.com/company/…)이나 줄인 주소(lnkd.in)는 받지 않는다.
// 한글 같은 글자가 든 아이디는 QR에 담을 수 있게 % 꼴로 바꾼다. QR 한 장(213바이트)에 못 담게 길면 틀린 것으로 본다.
export const LINKEDIN_MAX = 213;
export function linkedinUrl(input) {
  const s = (input || '').trim();
  if (!s) return '';
  const m = s.match(/^(?:https?:\/\/)?(?:[a-z0-9-]+\.)?linkedin\.com\/(?:mwlite\/)?in\/([^/?#\s]+)(?:[/?#].*)?$/i);
  let id = m ? m[1] : s.replace(/^@/, '');
  try { id = decodeURIComponent(id); } catch { return null; }
  if (!/^[\p{L}\p{N}_-]{3,100}$/u.test(id)) return null;
  const url = `https://www.linkedin.com/in/${encodeURIComponent(id)}`;
  return url.length <= LINKEDIN_MAX ? url : null;
}

// 깃허브: 아이디나 주소를 받아 프로필 주소로.
export function githubUrl(input) {
  const s = (input || '').trim();
  if (!s) return '';
  const m = s.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9-]{1,39})\/?$/i) || s.match(/^@?([A-Za-z0-9-]{1,39})$/);
  return m ? `https://github.com/${m[1]}` : null;
}

// 디스코드: 주소(discord.gg · discord.com)면 그대로, 아니면 아이디 글자 그대로.
export function discordText(input) {
  const s = (input || '').trim();
  if (!s) return '';
  if (/^https:\/\/(discord\.gg|discord\.com|discordapp\.com)\/[\w\-./?=&%]+$/i.test(s)) return s;
  if (/^https?:\/\//i.test(s)) return null;
  const id = s.replace(/^@/, '');
  return /^[\w.]{2,32}$/.test(id) ? id : null;
}

// 명함의 QR 차례: 링크드인 → 깃허브 → 디스코드. 적은 것만 돌려준다(옛 명함에는 링크드인 칸이 없다 — 없는 칸은 안 적은 것과 같다).
// 링크드인이 맨 앞인 까닭: 현장에서 가장 많이 주고받는다. 맨 앞 것은 QR이 홀수 개일 때 크게 한 줄을 차지한다(card의 lead).
// 돌려주는 것: [{ kind, title, text(QR에 담는 글), shown(QR 아래에 보이는 글) }]
export function cardLinks(profile) {
  const li = linkedinUrl(profile?.linkedin) || '';
  const gh = githubUrl(profile?.github) || '';
  const dc = discordText(profile?.discord) || '';
  let liShown = li.replace('https://www.', '');
  try { liShown = decodeURIComponent(liShown); } catch { /* 그대로 보인다 */ }
  return [
    li && { kind: 'linkedin', title: '링크드인', text: li, shown: liShown },
    gh && { kind: 'github', title: '깃허브', text: gh, shown: gh.replace('https://', '') },
    dc && { kind: 'discord', title: '디스코드', text: dc, shown: dc },
  ].filter(Boolean);
}

function field(label, input) {
  return el('label', { class: 'field' }, el('span', { class: 'label', text: label }), input);
}

// 주소 칸(링크드인 · 깃허브 · 디스코드): 틀리면 그 칸 바로 아래에 한 줄로 알린다. 칸을 떠날 때와 만들기를 누를 때 살핀다.
function linkField(label, input, check, why) {
  const error = el('span', { class: 'field-error', id: `${input.name}-error`, role: 'alert', hidden: true, text: why });
  input.setAttribute('aria-describedby', error.id);
  // 알림 줄은 이름표(label) 밖에 둔다: 화면 읽기 도구가 칸 이름과 알림을 섞어 읽지 않게.
  const node = el('div', { class: 'field' }, field(label, input), error);
  const ok = () => {
    const good = check(input.value) !== null;
    error.hidden = good;
    if (good) input.removeAttribute('aria-invalid'); else input.setAttribute('aria-invalid', 'true');
    return good;
  };
  input.addEventListener('change', ok);
  input.addEventListener('input', () => { if (!error.hidden) ok(); });
  return { node, input, ok };
}

function form(profile, done, go) {
  const first = !profile;
  const p = profile || {};
  const nick = el('input', { name: 'nick', required: true, maxlength: 20, autocomplete: 'nickname', placeholder: '부르는 이름', enterkeyhint: 'next', value: p.nick || '' });
  const line = el('input', { name: 'line', maxlength: 60, placeholder: '예: 로봇과 AI를 보러 간다', value: p.line || '' });
  const linkedin = linkField('링크드인', el('input', { name: 'linkedin', maxlength: 300, autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false', inputmode: 'url', placeholder: '프로필 주소 또는 아이디', value: p.linkedin || '' }),
    linkedinUrl, '프로필 주소(linkedin.com/in/…)나 그 끝의 아이디로 적는다.');
  const github = linkField('깃허브', el('input', { name: 'github', maxlength: 80, autocapitalize: 'off', spellcheck: 'false', inputmode: 'url', placeholder: '아이디 또는 주소', value: p.github || '' }),
    githubUrl, '아이디(영문 · 숫자 · -)나 github.com 주소로 적는다.');
  const discord = linkField('디스코드', el('input', { name: 'discord', maxlength: 80, autocapitalize: 'off', spellcheck: 'false', placeholder: '아이디 또는 초대 주소', value: p.discord || '' }),
    discordText, '아이디나 discord.gg · discord.com 주소로 적는다.');
  const links = [linkedin, github, discord];
  const tags = el('div', { class: 'choices', role: 'radiogroup', 'aria-label': '나' },
    TAGS.map((t) => el('label', { class: 'choice' },
      el('input', { type: 'radio', name: 'tag', value: t.k, checked: p.tag === t.k }), el('span', { text: t.ko }))));
  const error = el('p', { class: 'error', role: 'alert', hidden: true });

  // 아이폰 Safari 탭으로 처음 열었을 때만: 명함을 만들기 전에 "홈 화면에 추가"부터 하라는 한 줄(web/tips.js). 홈 화면 앱에서는 안 보인다.
  const homeSlot = first ? el('div', { class: 'tip-slot' }) : null;
  if (homeSlot) getSettings().then((s) => { const line = (s?.homeTip ?? 'card') === 'card' ? tipLine('card', ['home']) : null; if (line) homeSlot.append(line); }).catch(() => {});
  const node = el('form', { class: 'panel form big', novalidate: true },
    first ? el('p', { class: 'welcome', text: '환영한다. CES 2027 준비 지도다.' }) : null,
    el('h1', { text: profile ? '명함 고치기' : '명함부터 만든다' }),
    el('p', { class: 'lead', text: first ? '별명과 나만 있으면 된다. 나머지는 건너뛰어도 된다. 이 폰에만 남는다.' : '이 폰에만 남는다. QR로 보여 줄 때만 상대가 읽는다.' }),
    homeSlot,
    field('별명', nick),
    el('div', { class: 'field' }, el('span', { class: 'label', text: '나' }), tags),
    error,
    // 필수 둘 다음에 바로 단추: 스크롤 없이 한 화면에서 만든다. 선택 칸은 그 아래에 둔다.
    el('div', { class: 'dock' },
      el('button', { class: 'btn', type: 'submit', text: profile ? '명함 고치기 끝' : '명함 만들기' }),
      profile
        ? el('button', { class: 'btn ghost', type: 'button', text: '그만두기', onclick: () => done(profile) })
        : el('button', { class: 'btn ghost', type: 'button', text: '나중에', onclick: () => { sessionStorage.setItem('ces2027.introLater', '1'); go('#/'); } })),
    el('h2', { class: 'optional', text: '더 적기 (선택)' }),
    el('p', { class: 'hint', text: '주소는 적은 것만 QR이 된다.' }),
    field('한 줄', line),
    ...links.map((l) => l.node));

  node.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const fail = (msg, input) => { error.textContent = msg; error.hidden = false; input?.focus(); };
    const next = {
      nick: nick.value.trim(),
      tag: node.querySelector('input[name=tag]:checked')?.value || '',
      line: line.value.trim(),
      linkedin: linkedin.input.value.trim(),
      github: github.input.value.trim(),
      discord: discord.input.value.trim(),
    };
    if (!next.nick) return fail('별명을 적는다.', nick);
    if (!next.tag) return fail('나를 하나 고른다 (학생 · 취준생 · 정년 · 장년).', node.querySelector('input[name=tag]'));
    // 주소 칸은 그 칸 아래에 알린다. 틀린 칸을 다 표시하고 첫 칸으로 간다.
    const wrong = links.filter((l) => !l.ok());
    if (wrong.length) { error.hidden = true; wrong[0].input.focus(); return; }
    if (!setProfile(next)) return fail('이 폰에 저장하지 못했다. 사생활 보호 창이면 보통 창으로 다시 연다.');
    done(next, first);
  });
  return node;
}

async function qrBlock({ title, text, shown }, lead) {
  const box = el('figure', { class: lead ? 'qr lead' : 'qr' });
  try {
    const { qrSvg } = await import('../qr.js');
    box.append(qrSvg(text, `${title} QR`));
  } catch {
    box.append(el('div', { class: 'qr-empty', text: 'QR을 만들지 못했다' }));
  }
  box.append(el('figcaption', {}, el('b', { text: title }), el('span', { text: shown })));
  return box;
}

async function card(profile, edit, showFrom, first) {
  const links = cardLinks(profile);
  // 홀수 개(하나 · 셋)면 맨 앞 것을 크게 한 줄에 두고, 나머지는 둘씩 나란히 선다.
  const qrs = await Promise.all(links.map((l, i) => qrBlock(l, i === 0 && links.length % 2 === 1)));
  return el('div', { class: 'page' },
    el('section', { class: 'panel namecard' },
      el('p', { class: 'eyebrow', text: first ? '명함이 만들어졌다' : '글로벌 어학연수 · CES 2027' }),
      el('h1', { text: profile.nick }),
      el('p', {}, el('span', { class: 'tag mint', text: tagKo(profile.tag) })),
      profile.line && el('p', { class: 'lead', text: profile.line }),
      qrs.length ? el('div', { class: 'qrs' }, qrs) : null),
    el('section', { class: 'panel' },
      el('p', { class: 'note', text: qrs.length ? '폰에서 만든 QR이라 인터넷 없이도 보인다.' : '"명함 고치기"에서 링크드인 · 깃허브 · 디스코드를 적으면 QR이 생긴다.' }),
      el('div', { class: 'actions' },
        el('a', { class: 'btn', href: '#/map', text: '지도로' }),
        el('button', { class: 'btn ghost', type: 'button', text: '명함 고치기', onclick: edit }))));
}

export async function render({ go, rest = [] }) {
  const holder = el('div');
  const showFrom = (await getInfo().catch(() => null))?.show.from || '2027-01-06';
  const edit = (profile) => { holder.replaceChildren(form(profile, showCard, go)); window.scrollTo(0, 0); };
  const showCard = async (profile, first = false) => {
    holder.replaceChildren(await card(profile, () => edit(profile), showFrom, first));
    checkAlerts();
    window.scrollTo(0, 0);
  };
  const profile = getProfile();
  if (!profile) holder.replaceChildren(form(null, showCard, go));
  else if (rest[0] === 'edit') edit(profile);
  else await showCard(profile);
  return holder;
}
