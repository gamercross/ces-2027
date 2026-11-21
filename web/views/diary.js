// 회사 일기: 본 회사마다 날짜 · 본 것 · 느낀 점 · 누구에게(네 태그)를 쓴다. 폰에만 남는다.
// 보내기를 누른 일기만 폰 밖으로 나간다. 모으는 곳은 아직 정하지 않아, 지금은 파일로 내보낸다.
// 듣기에서 만든 초안(draft)은 사람이 다듬어 남긴 뒤에만 보낸다. 들은 글(원문 · 번역)과 녹음은 보내지 않고 폰에만 둔다.

import { el } from '../dom.js';
import { getExhibitors, getSettings } from '../data.js';
import { getDiary, getInterests, getProfile, setDiary, TAGS, tagKo } from '../store.js';
import { asText, bundle, collectorUrl, fileName } from '../diary.js';

const today = () => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const clock = (secs) => `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;

// 들은 글: 줄마다 원문(영어)과 번역(한국어). 접어 둔다.
function heardBox(e) {
  if (!e.heard?.length) return null;
  return el('details', {},
    el('summary', { text: `들은 글 ${e.heard.length}줄 (원문 · 번역, 이 폰에만)` }),
    el('ol', { class: 'heard' }, e.heard.map((l) => el('li', {}, el('span', { lang: 'en', text: `${clock(l.t)} ${l.en}` }), l.ko ? el('small', { text: l.ko }) : null))));
}

// 녹음: 누를 때 폰 안에서 꺼내 온다.
function audioBox(e, onDrop) {
  if (!e.audio) return null;
  const box = el('div', {});
  const note = el('span', { class: 'note', text: `녹음 ${clock(e.audio.secs || 0)} · ${(e.audio.bytes / 1048576).toFixed(1)}MB (이 폰에만)` });
  const play = el('button', { class: 'linkish', type: 'button', text: '녹음 듣기', onclick: async () => {
    try {
      const { loadAudio } = await import('../audio-store.js');
      const blob = await loadAudio(e.id);
      if (!blob) { note.textContent = '녹음이 이 폰에 없다.'; return; }
      const player = el('audio', { controls: true, src: URL.createObjectURL(blob) });
      play.replaceWith(player);
      player.play().catch(() => {});
    } catch { note.textContent = '녹음을 꺼내지 못했다.'; }
  } });
  const drop = el('button', { class: 'linkish', type: 'button', text: '녹음 지우기', onclick: async () => {
    try { const { dropAudio } = await import('../audio-store.js'); await dropAudio(e.id); } catch { /* 없으면 지울 것도 없다 */ }
    onDrop();
  } });
  box.append(el('div', { class: 'row-actions' }, note, play, drop));
  return box;
}

function form(entry, preset, companies, done) {
  const e = entry || { date: today(), exId: preset || '', company: '', saw: '', felt: '', for: getProfile()?.tag ? [getProfile().tag] : [] };
  const known = companies.find((c) => c.id === e.exId);
  const pick = el('select', { name: 'company' },
    el('option', { value: '', text: companies.length ? '관심 회사에서 고른다' : '관심 회사가 없다' }),
    companies.map((c) => el('option', { value: c.id, selected: c.id === e.exId, text: c.name })));
  const other = el('input', { name: 'other', maxlength: 80, placeholder: '목록에 없으면 회사 이름을 적는다', value: known ? '' : e.company || '' });
  const date = el('input', { type: 'date', name: 'date', required: true, value: e.date });
  const saw = el('textarea', { name: 'saw', rows: 3, maxlength: 600, placeholder: '무엇을 봤나 (제품 · 시연 · 들은 말)' });
  saw.value = e.saw || '';
  const felt = el('textarea', { name: 'felt', rows: 3, maxlength: 600, placeholder: '무엇이 달라질 것 같나 · 해 볼 것 하나' });
  felt.value = e.felt || '';
  const tags = el('div', { class: 'choices', role: 'group', 'aria-label': '누구에게' },
    TAGS.map((t) => el('label', { class: 'choice' }, el('input', { type: 'checkbox', name: 'for', value: t.k, checked: e.for?.includes(t.k) }), el('span', { text: t.ko }))));
  const error = el('p', { class: 'error', role: 'alert', hidden: true });
  const field = (label, input, hint) => el('label', { class: 'field' }, el('span', { class: 'label', text: label }), input, hint && el('span', { class: 'hint', text: hint }));

  const node = el('form', { class: 'panel form', novalidate: true },
    el('h1', { text: entry?.draft ? '일기 초안 다듬기' : entry ? '일기 고치기' : '일기 쓰기' }),
    entry?.draft ? el('p', { class: 'note', text: '듣기에서 만든 초안이다. "본 것"을 다듬고 느낀 점과 "누구에게"를 채워 남긴다. 남기기 전에는 보내지 않는다.' }) : null,
    field('회사', pick), field('', other),
    field('날짜', date),
    field('본 것', saw),
    entry ? el('div', { class: 'entry' }, heardBox(entry), entry.audio ? el('p', { class: 'note', text: '녹음은 일기 목록에서 듣는다.' }) : null) : null,
    field('느낀 점', felt),
    el('div', { class: 'field' }, el('span', { class: 'label', text: '누구에게 (여럿 골라도 된다)' }), tags),
    error,
    el('div', { class: 'dock' },
      el('button', { class: 'btn', type: 'submit', text: '폰에 남기기' }),
      el('button', { class: 'btn ghost', type: 'button', text: '그만두기', onclick: () => done() })));
  node.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const fail = (msg, input) => { error.textContent = msg; error.hidden = false; input?.focus(); };
    const chosen = companies.find((c) => c.id === pick.value);
    const company = chosen ? chosen.name : other.value.trim();
    if (!company) return fail('회사를 고르거나 이름을 적는다.', pick);
    if (!/^\d{4}-\d\d-\d\d$/.test(date.value)) return fail('날짜를 고른다.', date);
    if (!saw.value.trim() && !felt.value.trim()) return fail('본 것이나 느낀 점 가운데 하나는 적는다.', saw);
    // 관심 목록에 없는 회사의 초안이면, 이름을 바꾸지 않은 한 그 회사 번호와 부스를 그대로 둔다.
    const same = !chosen && entry && company === entry.company;
    const next = {
      id: entry?.id || newId(),
      date: date.value,
      exId: chosen ? chosen.id : same ? entry.exId || '' : '',
      company,
      booth: chosen ? chosen.booth : same ? entry.booth || '' : '',
      saw: saw.value.trim(),
      felt: felt.value.trim(),
      for: [...node.querySelectorAll('input[name=for]:checked')].map((i) => i.value),
      // 고친 일기는 다시 보내야 하므로 보낸 표시를 지운다.
      sent: null,
      // 들은 글과 녹음 표시는 그대로 둔다. 사람이 남겼으니 초안 표시는 뗀다.
      ...(entry?.heard ? { heard: entry.heard } : {}),
      ...(entry?.audio ? { audio: entry.audio } : {}),
    };
    const list = getDiary().filter((x) => x.id !== next.id);
    list.push(next);
    if (!setDiary(list)) return fail('이 폰에 저장하지 못했다. 사생활 보호 창이면 보통 창으로 다시 연다.');
    done('일기를 폰에 남겼다.');
  });
  return node;
}

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' }));
  const a = el('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function render({ rest, go }) {
  const [data, settings] = await Promise.all([getExhibitors().catch(() => null), getSettings()]);
  const byId = new Map((data?.ex || []).map((r) => [r[0], r]));
  const companies = getInterests().map((it) => byId.get(it.id)).filter(Boolean).map((r) => ({ id: r[0], name: r[1], booth: r[7][0] || '' }));
  const holder = el('div');
  const sendTo = collectorUrl(settings);

  function list(message) {
    const all = getDiary().sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
    const drafts = all.filter((e) => e.draft);
    const ready = all.filter((e) => !e.draft);
    const unsent = ready.filter((e) => !e.sent);
    const status = el('p', { class: 'note', role: 'status', text: message || '' });
    const markSent = (ids) => setDiary(getDiary().map((e) => (ids.includes(e.id) ? { ...e, sent: new Date().toISOString() } : e)));

    const send = el('button', { class: 'btn', type: 'button', text: `보내기 (${unsent.length}개)`, disabled: unsent.length === 0, onclick: async () => {
      const payload = bundle(unsent, getProfile());
      if (sendTo) {
        try {
          // 모으는 곳(설정의 collectorUrl)으로 보낸다. 답은 읽을 수 없어 도착은 모으는 곳에서 확인한다.
          await fetch(sendTo, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload) });
          markSent(unsent.map((e) => e.id));
          show(`${unsent.length}개를 모으는 곳으로 보냈다.`);
        } catch {
          status.textContent = '보내지 못했다. 인터넷을 확인하고 다시 누른다. 일기는 폰에 그대로 있다.';
        }
        return;
      }
      download(fileName(getProfile()), JSON.stringify(payload, null, 2));
      markSent(unsent.map((e) => e.id));
      show(`${unsent.length}개를 파일로 내보냈다. 이 파일을 정리하는 사람에게 건넨다.`);
    } });
    const fileAll = el('button', { class: 'btn ghost', type: 'button', text: '전부 파일로', disabled: ready.length === 0, onclick: () => {
      download(fileName(getProfile()), JSON.stringify(bundle(ready, getProfile()), null, 2));
      status.textContent = `일기 ${ready.length}개를 파일로 내보냈다.`;
    } });
    const copy = el('button', { class: 'btn ghost', type: 'button', text: '글로 복사', disabled: ready.length === 0, onclick: async () => {
      try { await navigator.clipboard.writeText(asText(ready, getProfile(), tagKo)); status.textContent = '글로 복사했다. 단톡방에 붙여 넣을 수 있다.'; } catch { status.textContent = '복사하지 못했다.'; }
    } });

    const days = [];
    let day = null;
    for (const e of all) {
      if (!day || day.date !== e.date) { day = { date: e.date, items: [] }; days.push(day); }
      day.items.push(e);
    }
    holder.replaceChildren(el('div', { class: 'page' },
      el('section', { class: 'panel' },
        el('h1', { text: '일기' }),
        el('p', { class: 'lead', text: '본 회사마다 본 것과 느낀 점을 적는다. 일기는 이 폰에만 남고, 보내기를 누른 것만 밖으로 나간다.' }),
        el('p', { class: 'note', text: `일기 ${ready.length}개 · 아직 보내지 않은 것 ${unsent.length}개${drafts.length ? ` · 다듬을 초안 ${drafts.length}개` : ''}` })),
      el('section', { class: 'panel' },
        el('h2', { text: '보내기' }),
        el('p', { class: 'note', text: sendTo
          ? '보내기를 누르면 아직 보내지 않은 일기와 별명 · 태그가 모으는 곳으로 간다. 깃허브 · 디스코드 · 관심 · 동선은 가지 않는다.'
          : settings.collector === 'file'
            ? '일기는 파일로 모은다. 보내기를 누르면 아직 보내지 않은 일기가 파일로 내려오고, 그 파일을 정리하는 사람에게 건넨다(단톡방 · 메일). 파일에는 일기와 별명 · 태그만 들어간다.'
            : '모으는 곳이 아직 정해지지 않았다. 지금은 보내기를 누르면 아직 보내지 않은 일기가 파일로 내려온다. 그 파일을 정리하는 사람에게 건넨다. 파일에는 일기와 별명 · 태그만 들어간다.' }),
        el('div', { class: 'actions' }, send, fileAll, copy),
        drafts.length ? el('p', { class: 'note', text: `초안 ${drafts.length}개는 보내지 않는다. 다듬어 남기면 보낼 수 있다. 들은 글과 녹음은 어느 때도 보내지 않는다.` }) : null,
        status),
      days.map((d) => el('section', { class: 'panel' },
        el('h2', { text: `${d.date} · ${d.items.length}개` }),
        el('ul', { class: 'stack' }, d.items.map((e) => el('li', { class: 'entry' },
          el('div', { class: 'name' }, e.company, e.draft ? el('span', { class: 'tag', text: '초안' }) : null, (e.for || []).map((k) => el('span', { class: 'tag mint', text: tagKo(k) }))),
          e.saw && el('p', {}, el('b', { text: '본 것 ' }), e.saw),
          e.felt && el('p', {}, el('b', { text: '느낀 점 ' }), e.felt),
          heardBox(e),
          audioBox(e, () => { setDiary(getDiary().map((x) => { if (x.id !== e.id) return x; const { audio, ...restOf } = x; return restOf; })); show('녹음을 지웠다. 글은 그대로다.'); }),
          el('div', { class: 'row-actions' },
            el('span', { class: 'note', text: e.draft ? '초안 · 다듬어야 보낸다' : e.sent ? `보냄 ${new Date(e.sent).toLocaleDateString('ko-KR')}` : '아직 보내지 않음' }),
            el('a', { href: `#/diary/edit/${e.id}`, text: e.draft ? '다듬기' : '고치기' }),
            el('button', { class: 'linkish', type: 'button', text: '지우기', onclick: async () => {
              setDiary(getDiary().filter((x) => x.id !== e.id));
              if (e.audio) { try { const { dropAudio } = await import('../audio-store.js'); await dropAudio(e.id); } catch { /* 없으면 지울 것도 없다 */ } }
              show('일기를 지웠다.');
            } }))))))),
      // 한 손으로 닿게 아래에 붙여 둔다.
      el('div', { class: 'dock' }, el('a', { class: 'btn', href: '#/diary/new', text: '일기 쓰기' }), el('a', { class: 'btn ghost', href: '#/listen', text: '듣고 초안 만들기' }))));
  }
  function show(message) {
    if (location.hash !== '#/diary') { sessionStorage.setItem('ces2027.diaryNote', message || ''); go('#/diary'); return; }
    list(message);
  }

  if (rest[0] === 'new' || rest[0] === 'edit') {
    const entry = rest[0] === 'edit' ? getDiary().find((e) => e.id === rest[1]) : null;
    if (rest[0] === 'edit' && !entry) { go('#/diary'); return holder; }
    holder.replaceChildren(form(entry, rest[0] === 'new' ? rest[1] : null, companies, show));
  } else {
    const note = sessionStorage.getItem('ces2027.diaryNote');
    sessionStorage.removeItem('ces2027.diaryNote');
    list(note || '');
  }
  return holder;
}
