// 온라인 명함: 별명 · 나(네 태그 가운데 하나) · 한 줄 · 깃허브 · 디스코드 → QR 두 개.
// 명함은 이 폰에만 남는다. QR은 폰에서 만든다(인터넷 없이).

import { el } from '../dom.js';
import { getProfile, setProfile, TAGS, tagKo } from '../store.js';

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
  const p = profile || {};
  const nick = el('input', { name: 'nick', required: true, maxlength: 20, autocomplete: 'nickname', placeholder: '부르는 이름', value: p.nick || '' });
  const line = el('input', { name: 'line', maxlength: 60, placeholder: '예: 로봇과 AI를 보러 간다', value: p.line || '' });
  const github = el('input', { name: 'github', maxlength: 80, autocapitalize: 'off', spellcheck: 'false', inputmode: 'url', placeholder: '아이디 또는 주소', value: p.github || '' });
  const discord = el('input', { name: 'discord', maxlength: 80, autocapitalize: 'off', spellcheck: 'false', placeholder: '아이디 또는 초대 주소', value: p.discord || '' });
  const tags = el('div', { class: 'choices', role: 'radiogroup', 'aria-label': '나' },
    TAGS.map((t) => el('label', { class: 'choice' },
      el('input', { type: 'radio', name: 'tag', value: t.k, checked: p.tag === t.k }), el('span', { text: t.ko }))));
  const error = el('p', { class: 'error', role: 'alert', hidden: true });

  const node = el('form', { class: 'panel form', novalidate: true },
    el('h1', { text: profile ? '명함 고치기' : '명함부터 만든다' }),
    el('p', { class: 'lead', text: '적은 것은 이 폰에만 남는다. 깃허브와 디스코드는 QR로 보여 줄 때만 상대가 읽는다.' }),
    field('별명', nick),
    el('div', { class: 'field' }, el('span', { class: 'label', text: '나' }), tags),
    field('한 줄', line),
    field('깃허브', github, '비워 두면 QR이 생기지 않는다'),
    field('디스코드', discord),
    error,
    el('div', { class: 'actions' },
      el('button', { class: 'btn', type: 'submit', text: '명함 만들기' }),
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
    done(next);
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

async function card(profile, edit) {
  const gh = githubUrl(profile.github) || '';
  const dc = discordText(profile.discord) || '';
  return el('div', { class: 'page' },
    el('section', { class: 'panel namecard' },
      el('p', { class: 'eyebrow', text: '글로벌 어학연수 · CES 2027' }),
      el('h1', { text: profile.nick }),
      el('p', {}, el('span', { class: 'tag mint', text: tagKo(profile.tag) })),
      profile.line && el('p', { class: 'lead', text: profile.line }),
      el('div', { class: 'qrs' },
        await qrBlock('깃허브', gh, gh.replace('https://', '')),
        await qrBlock('디스코드', dc))),
    el('section', { class: 'panel' },
      el('p', { class: 'note', text: '이 명함은 이 폰에만 남는다. QR은 폰에서 만들어서 인터넷이 없어도 보인다.' }),
      el('div', { class: 'actions' },
        el('a', { class: 'btn', href: '#/find', text: '회사 찾으러 가기' }),
        el('button', { class: 'btn ghost', type: 'button', text: '명함 고치기', onclick: edit }))));
}

export async function render({ go }) {
  const holder = el('div');
  const showCard = async (profile) => {
    holder.replaceChildren(await card(profile, () => holder.replaceChildren(form(profile, showCard, go))));
    document.getElementById('me-chip').textContent = profile.nick;
    window.scrollTo(0, 0);
  };
  const profile = getProfile();
  if (profile) await showCard(profile); else holder.replaceChildren(form(null, showCard, go));
  return holder;
}
