// 온라인 명함: 별명 · 나(네 태그 가운데 하나) · 한 줄 · 깃허브 · 디스코드 → QR 두 개.
// 처음 들어오면 환영 한 줄 → 명함 한 화면(별명 · 나만 필수, 나머지는 건너뛰어도 된다) → 만든 명함 + QR → "지도로".
// 설정 탭에서 다시 오면 QR 보기(#/card) · 고치기(#/card/edit). 명함은 이 폰에만 남는다. QR은 폰에서 만든다(인터넷 없이).

import { el } from '../dom.js';
import { getProfile, setProfile, TAGS, tagKo } from '../store.js';
import { getInfo } from '../data.js';
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
          el('li', { text: '위 QR을 상대가 읽으면 깃허브와 디스코드가 열린다. 인터넷 없이도 보인다.' }),
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

function field(label, input, hint) {
  return el('label', { class: 'field' }, el('span', { class: 'label', text: label }), input, hint && el('span', { class: 'hint', text: hint }));
}

function form(profile, done, go) {
  const first = !profile;
  const p = profile || {};
  const nick = el('input', { name: 'nick', required: true, maxlength: 20, autocomplete: 'nickname', placeholder: '부르는 이름', enterkeyhint: 'next', value: p.nick || '' });
  const line = el('input', { name: 'line', maxlength: 60, placeholder: '예: 로봇과 AI를 보러 간다', value: p.line || '' });
  const github = el('input', { name: 'github', maxlength: 80, autocapitalize: 'off', spellcheck: 'false', inputmode: 'url', placeholder: '아이디 또는 주소', value: p.github || '' });
  const discord = el('input', { name: 'discord', maxlength: 80, autocapitalize: 'off', spellcheck: 'false', placeholder: '아이디 또는 초대 주소', value: p.discord || '' });
  const tags = el('div', { class: 'choices', role: 'radiogroup', 'aria-label': '나' },
    TAGS.map((t) => el('label', { class: 'choice' },
      el('input', { type: 'radio', name: 'tag', value: t.k, checked: p.tag === t.k }), el('span', { text: t.ko }))));
  const error = el('p', { class: 'error', role: 'alert', hidden: true });

  const node = el('form', { class: 'panel form big', novalidate: true },
    first ? el('p', { class: 'welcome', text: '환영한다. CES 2027 준비 지도다.' }) : null,
    el('h1', { text: profile ? '명함 고치기' : '명함부터 만든다' }),
    el('p', { class: 'lead', text: first ? '별명과 나만 있으면 된다. 나머지는 건너뛰어도 된다. 이 폰에만 남는다.' : '이 폰에만 남는다. QR로 보여 줄 때만 상대가 읽는다.' }),
    field('별명', nick),
    el('div', { class: 'field' }, el('span', { class: 'label', text: '나' }), tags),
    field('한 줄 (선택)', line),
    field('깃허브 (선택)', github, '비워 두면 QR이 생기지 않는다'),
    field('디스코드 (선택)', discord),
    error,
    el('div', { class: 'dock' },
      el('button', { class: 'btn', type: 'submit', text: profile ? '명함 고치기 끝' : '명함 만들기' }),
      profile
        ? el('button', { class: 'btn ghost', type: 'button', text: '그만두기', onclick: () => done(profile) })
        : el('button', { class: 'btn ghost', type: 'button', text: '나중에', onclick: () => { sessionStorage.setItem('ces2027.introLater', '1'); go('#/'); } })));

  node.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const fail = (msg, input) => { error.textContent = msg; error.hidden = false; input?.focus(); };
    const next = {
      nick: nick.value.trim(),
      tag: node.querySelector('input[name=tag]:checked')?.value || '',
      line: line.value.trim(),
      github: github.value.trim(),
      discord: discord.value.trim(),
    };
    if (!next.nick) return fail('별명을 적는다.', nick);
    if (!next.tag) return fail('나를 하나 고른다 (학생 · 취준생 · 정년 · 장년).', node.querySelector('input[name=tag]'));
    if (githubUrl(next.github) === null) return fail('깃허브는 아이디(영문 · 숫자 · -)나 github.com 주소로 적는다.', github);
    if (discordText(next.discord) === null) return fail('디스코드는 아이디나 discord.gg · discord.com 주소로 적는다.', discord);
    if (!setProfile(next)) return fail('이 폰에 저장하지 못했다. 사생활 보호 창이면 보통 창으로 다시 연다.');
    done(next, first);
  });
  return node;
}

async function qrBlock(title, text, shown) {
  const box = el('figure', { class: 'qr' });
  if (!text) {
    box.append(el('div', { class: 'qr-empty', text: `${title} 주소를 적으면 QR이 생긴다` }), el('figcaption', { text: title }));
    return box;
  }
  try {
    const { qrSvg } = await import('../qr.js');
    box.append(qrSvg(text, `${title} QR`));
  } catch {
    box.append(el('div', { class: 'qr-empty', text: 'QR을 만들지 못했다' }));
  }
  box.append(el('figcaption', {}, el('b', { text: title }), el('span', { text: shown || text })));
  return box;
}

async function card(profile, edit, showFrom, first) {
  const gh = githubUrl(profile.github) || '';
  const dc = discordText(profile.discord) || '';
  const noQr = !gh && !dc;
  return el('div', { class: 'page' },
    el('section', { class: 'panel namecard' },
      el('p', { class: 'eyebrow', text: first ? '명함이 만들어졌다' : '글로벌 어학연수 · CES 2027' }),
      el('h1', { text: profile.nick }),
      el('p', {}, el('span', { class: 'tag mint', text: tagKo(profile.tag) })),
      profile.line && el('p', { class: 'lead', text: profile.line }),
      el('div', { class: 'qrs' },
        await qrBlock('깃허브', gh, gh.replace('https://', '')),
        await qrBlock('디스코드', dc))),
    first ? null : paperPanel(showFrom),
    el('section', { class: 'panel' },
      el('p', { class: 'note', text: noQr ? '깃허브나 디스코드를 적으면 QR이 생긴다. "명함 고치기"에서 언제든 적는다.' : '폰에서 만든 QR이라 인터넷 없이도 보인다.' }),
      el('div', { class: 'actions' },
        el('a', { class: 'btn', href: '#/map', text: '지도로' }),
        first ? null : el('a', { class: 'btn ghost', href: '#/people', text: '남의 명함 받기' }),
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
