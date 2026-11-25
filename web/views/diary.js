// 회사 일기: 본 회사마다 날짜 · 본 것 · 느낀 점 · 누구에게(네 태그)를 쓴다. 폰에만 남는다.
// 일기 탭 맨 위에는 "만난 사람"이 있어 누구를 만났는지 바로 보인다(6단계).
// 보내기를 누른 일기만 폰 밖으로 나간다. 모으는 곳은 아직 정하지 않아, 지금은 파일로 내보낸다.
// 일기마다 사진 한 장(R49)을 넣을 수 있다: 폰에서 줄여(긴 변 1024px · 150KB 안, web/photo.js) 이 폰(IndexedDB, web/photo-store.js)에만 둔다. 파일로 내려받을 때만 그 파일에 들어가고 모으는 곳 주소로는 가지 않는다.
// 듣기에서 만든 초안(draft)은 사람이 다듬어 남긴 뒤에만 보낸다. 들은 글(원문 · 번역)과 녹음은 모으는 곳 주소로는 보내지 않는다. 파일로 내려받을 때만 일기와 이어진 대화(들은 글)가 그 파일에 들어가고, 녹음은 어느 때도 가지 않는다.

import { el } from '../dom.js';
import { getExhibitors, getSettings } from '../data.js';
import { getDiary, getInterests, getProfile, getTalks, load, save, setDiary, TAGS, tagKo } from '../store.js';
import { asText, bundle, collectorUrl, fileName, talksFor } from '../diary.js';
import { handFile } from '../handoff.js';
import { countAt } from '../people.js';
import { getPeople } from '../people-store.js';
import { createCardShell } from '../plancard.js';
import { personCard, personRow } from '../people-ui.js';

const today = () => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const clock = (secs) => `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;

// 들은 글: 줄마다 원문(영어)과 번역(한국어). 접어 둔다.
function heardBox(e) {
  if (!e.heard?.length) return null;
  return el('details', {},
    el('summary', { text: `들은 글 ${e.heard.length}줄 (원문 · 번역, 이 폰에만)` }),
    el('ol', { class: 'heard' }, e.heard.map((l) => el('li', {}, el('span', { lang: 'en', text: l.t > 0 ? `${clock(l.t)} ${l.en}` : l.en }), l.ko ? el('small', { text: l.ko }) : null))));
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

// 사진: 카드에서 폰 안에서 꺼내 보인다.
function photoBox(e) {
  if (!e.photo) return null;
  const box = el('div', { class: 'photo-box' });
  const note = el('p', { class: 'note', text: '사진 한 장 · 이 폰에만. 파일로 내보낼 때만 같이 간다.' });
  box.append(note);
  (async () => {
    try {
      const { loadPhoto } = await import('../photo-store.js');
      const blob = await loadPhoto(e.id);
      if (!blob) { note.textContent = '사진이 이 폰에 없다.'; return; }
      const url = URL.createObjectURL(blob);
      const img = el('img', { class: 'photo', src: url, alt: `${e.company || '회사'} 일기에 넣은 사진`, width: e.photo.w || undefined, height: e.photo.h || undefined });
      img.addEventListener('load', () => URL.revokeObjectURL(url), { once: true });
      box.prepend(img);
    } catch { note.textContent = '사진을 꺼내지 못했다.'; }
  })();
  return box;
}

// 일기 쓰기: 필수는 "본 것" 한 칸이다. 날짜는 오늘로 채우고, 회사는 갈 곳의 "일기 쓰기"에서 오면 미리 채운다(없어도 된다).
// 첫 화면은 "본 것" 칸 + "폰에 남기기"뿐이다. 나머지 칸(회사 · 날짜 · 느낀 점 · 사진 · 누구에게 · 대화)은 "더 적기" 아래 접는다(2026-11-24, 편의성 점검 6절 3번).
// 이미 적힌 칸이 있는 일기를 고칠 때와, 적다 만 느낀 점이 돌아올 때는 펴 둔다(적힌 것이 숨지 않게).
// 적던 글은 폰에 남겨 앱을 닫아도 돌아온다(남기기 전까지). 누구에게는 마지막에 고른 것을 기억한다.
const DRAFT = 'diaryDraft.v1';
const LAST_TAGS = 'diaryTags.v1';

function form(entry, preset, companies, done) {
  // 만난 사람에서 온 링크: 회사 번호(관심 목록에 없어도 그 회사)나 "n:이름"(목록에 없는 회사 이름)
  let byName = '';
  try { byName = preset?.startsWith('n:') ? decodeURIComponent(preset.slice(2)) : ''; } catch { /* 깨진 주소면 비워 둔다 */ }
  const fresh = !entry;
  // 새 일기: 적다 만 글이 같은 회사 것이면 돌려 놓는다.
  const saved = fresh ? load(DRAFT, null) : null;
  const want = byName ? '' : preset || '';
  const back = saved && (saved.exId || '') === want && (saved.byName || '') === byName ? saved : null;
  const lastTags = load(LAST_TAGS, null);
  const e = entry || { date: today(), exId: byName ? '' : preset || '', company: byName, saw: back?.saw || '', felt: back?.felt || '', for: Array.isArray(lastTags) ? lastTags : getProfile()?.tag ? [getProfile().tag] : [] };
  const known = companies.find((c) => c.id === e.exId);
  const pick = el('select', { name: 'company', 'aria-label': '회사' },
    el('option', { value: '', text: companies.length ? '회사는 나중에 · 관심 회사에서 고른다' : '회사는 나중에' }),
    companies.map((c) => el('option', { value: c.id, selected: c.id === e.exId, text: c.name })));
  const other = el('input', { name: 'other', maxlength: 80, placeholder: '목록에 없는 회사 이름', value: known ? '' : e.company || '' });
  const date = el('input', { type: 'date', name: 'date', required: true, value: e.date });
  const saw = el('textarea', { name: 'saw', rows: 4, maxlength: 600, placeholder: '무엇을 봤나 (제품 · 시연 · 들은 말)' });
  saw.value = e.saw || '';
  const felt = el('textarea', { name: 'felt', rows: 2, maxlength: 600, placeholder: '무엇이 달라질 것 같나 · 해 볼 것 하나 (선택)' });
  felt.value = e.felt || '';
  const tags = el('div', { class: 'choices', role: 'group', 'aria-label': '누구에게' },
    TAGS.map((t) => el('label', { class: 'choice' }, el('input', { type: 'checkbox', name: 'for', value: t.k, checked: e.for?.includes(t.k) }), el('span', { text: t.ko }))));
  const error = el('p', { class: 'error', role: 'alert', hidden: true });
  // 사진 한 장: 고르면 폰에서 줄여 미리 보인다. "폰에 남기기"를 누를 때 이 폰에 담는다.
  let photoNew = null; // { blob, w, h }
  let photoGone = false;
  let photoUrl = '';
  const photoImg = el('img', { class: 'photo', alt: '넣을 사진', hidden: true });
  const photoNote = el('p', { class: 'note', role: 'status' });
  const photoFile = el('input', { type: 'file', accept: 'image/*', class: 'file-hidden', 'aria-label': '사진 고르기', tabindex: '-1' });
  const photoPick = el('button', { class: 'pick', type: 'button', onclick: () => photoFile.click() });
  const photoDrop = el('button', { class: 'pick', type: 'button', text: '사진 빼기', hidden: true });
  const showPhoto = (blob, w, h) => {
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    photoUrl = blob ? URL.createObjectURL(blob) : '';
    if (blob) { photoImg.src = photoUrl; if (w) photoImg.width = w; if (h) photoImg.height = h; }
    photoImg.hidden = !blob;
    photoDrop.hidden = !blob;
    photoPick.textContent = blob ? '사진 바꾸기' : '사진 넣기';
  };
  showPhoto(null);
  if (entry?.photo) {
    photoNote.textContent = '사진을 꺼내는 중이다.';
    import('../photo-store.js').then(({ loadPhoto }) => loadPhoto(entry.id)).then((blob) => {
      if (photoNew || photoGone) return;
      if (blob) { showPhoto(blob, entry.photo.w, entry.photo.h); photoNote.textContent = ''; } else photoNote.textContent = '사진이 이 폰에 없다.';
    }).catch(() => { photoNote.textContent = '사진을 꺼내지 못했다.'; });
  }
  photoFile.addEventListener('change', async () => {
    const file = photoFile.files?.[0];
    photoFile.value = '';
    if (!file) return;
    photoNote.textContent = '사진을 줄이는 중이다.';
    try {
      const { shrink, MAX_BYTES, MAX_EDGE } = await import('../photo.js');
      const r = await shrink(file);
      photoNew = r;
      photoGone = false;
      showPhoto(r.blob, r.w, r.h);
      photoNote.textContent = `${r.w} × ${r.h} · ${Math.max(1, Math.round(r.blob.size / 1024))}KB로 줄였다 (긴 변 ${MAX_EDGE}px · ${MAX_BYTES / 1024}KB 안). 이 폰에만 남는다.`;
    } catch { photoNote.textContent = '이 사진을 읽지 못했다. 다른 사진을 고른다.'; }
  });
  photoDrop.addEventListener('click', () => { photoNew = null; photoGone = true; showPhoto(null); photoNote.textContent = '사진을 뺐다. 남기기를 누르면 적용된다.'; });
  const field = (label, input, hint) => el('label', { class: 'field' }, el('span', { class: 'label', text: label }), input, hint && el('span', { class: 'hint', text: hint }));
  // 듣기 · 붙여넣기는 이 회사 일기의 일부다(맨 위 단추가 아니라 여기 있다).
  const tail = known || e.exId ? `/${encodeURIComponent(known?.id || e.exId)}` : '';
  const talkRow = el('div', { class: 'row-actions' },
    el('span', { class: 'label', text: '대화' }),
    el('a', { href: `#/listen${tail}`, text: '듣기' }),
    el('a', { href: `#/talk${tail}`, text: '대화 붙여넣기' }));

  const keepDraft = () => { if (fresh) save(DRAFT, saw.value || felt.value ? { exId: want, byName, saw: saw.value, felt: felt.value } : null); };
  saw.addEventListener('input', keepDraft);
  felt.addEventListener('input', keepDraft);

  // 어느 회사 일기인지: 회사 칸이 접혀 있어도 제목 아래 한 줄로 보인다(회사가 없으면 줄도 없다). 회사를 바꾸면 따라 바뀐다.
  const whoLine = el('p', { class: 'note diary-who' });
  const paintWho = () => { const c = companies.find((x) => x.id === pick.value); whoLine.textContent = c ? c.name : other.value.trim(); whoLine.hidden = !whoLine.textContent; };
  pick.addEventListener('change', paintWho);
  other.addEventListener('input', paintWho);
  paintWho();
  // "더 적기": 고칠 때는 적힌 칸이 하나라도 있으면 펴 둔다. 새로 쓸 때는 접어 둔다(미리 채운 회사 · 날짜 · 누구에게는 적은 것으로 치지 않는다).
  const filled = entry ? Boolean(entry.company || entry.exId || entry.felt || entry.photo || entry.heard?.length || entry.audio || (entry.for || []).length) : Boolean(back?.felt);
  const more = el('details', { class: 'more', open: filled },
    el('summary', { text: '더 적기' }),
    el('div', { class: 'more-body' },
      field('회사', pick), field('', other),
      field('날짜', date),
      entry ? el('div', { class: 'entry' }, heardBox(entry), entry.audio ? el('p', { class: 'note', text: '녹음은 일기 카드에서 듣는다.' }) : null) : null,
      field('느낀 점', felt),
      el('div', { class: 'field photo-field' }, el('span', { class: 'label', text: '사진 (한 장, 선택)' }), photoImg, el('div', { class: 'row-actions' }, photoPick, photoDrop, photoFile), photoNote),
      el('div', { class: 'field' }, el('span', { class: 'label', text: '누구에게 (여럿 가능)' }), tags),
      talkRow));

  const node = el('form', { class: 'panel form', novalidate: true },
    el('h1', { text: entry?.draft ? '일기 초안 다듬기' : entry ? '일기 고치기' : '일기 쓰기' }),
    whoLine,
    entry?.draft ? el('p', { class: 'note', text: '초안이다. 다듬어 남기기 전에는 보내지 않는다.' }) : null,
    field('본 것', saw),
    more,
    error,
    el('div', { class: 'dock' },
      el('button', { class: 'btn', type: 'submit', text: '폰에 남기기' }),
      el('button', { class: 'btn ghost', type: 'button', text: '그만두기', onclick: () => { if (fresh) save(DRAFT, null); done(); } })));
  node.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    // 접힌 칸이 틀렸으면 펴고 그 칸으로 간다.
    const fail = (msg, input) => { error.textContent = msg; error.hidden = false; if (input && more.contains(input)) more.open = true; input?.focus(); };
    const chosen = companies.find((c) => c.id === pick.value);
    const company = chosen ? chosen.name : other.value.trim();
    if (!/^\d{4}-\d\d-\d\d$/.test(date.value)) return fail('날짜를 고른다.', date);
    if (!saw.value.trim() && !felt.value.trim()) return fail('본 것을 한 줄 적는다.', saw);
    // 관심 목록에 없는 회사의 초안이면, 이름을 바꾸지 않은 한 그 회사 번호와 부스를 그대로 둔다.
    const same = !chosen && entry && company === entry.company;
    const id = entry?.id || newId();
    // 사진: 새로 고른 것은 이 폰에 먼저 담는다. 저장 공간이 모자라면 글도 남기지 않고 까닭을 말한다(사진만 빼고 남길 수 있게).
    let photoMeta = photoGone ? null : entry?.photo || null;
    if (photoNew) {
      try {
        const { savePhoto } = await import('../photo-store.js');
        await savePhoto(id, photoNew.blob);
        photoMeta = { bytes: photoNew.blob.size, w: photoNew.w, h: photoNew.h };
      } catch (err) {
        const { isFull } = await import('../photo-store.js');
        return fail(isFull(err) ? '저장 공간이 모자라 사진을 못 담았다. "사진 빼기"로 글만 남기거나, 설정의 저장 공간에서 비우고 다시 누른다.' : '사진을 이 폰에 담지 못했다. 사생활 보호 창이면 보통 창으로 다시 연다. "사진 빼기"로 글만 남길 수 있다.');
      }
    }
    const next = {
      id,
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
      // 이어진 대화(대화 칸)도 그대로 둔다.
      ...(entry?.talkId ? { talkId: entry.talkId } : {}),
      ...(photoMeta ? { photo: photoMeta } : {}),
    };
    const list = getDiary().filter((x) => x.id !== next.id);
    list.push(next);
    if (!setDiary(list)) return fail('이 폰에 저장하지 못했다. 사생활 보호 창이면 보통 창으로 다시 연다.');
    if (photoGone && entry?.photo) { try { const { dropPhoto } = await import('../photo-store.js'); await dropPhoto(id); } catch { /* 없으면 지울 것도 없다 */ } }
    save(LAST_TAGS, next.for);
    if (fresh) save(DRAFT, null);
    done('일기를 폰에 남겼다.');
  });
  return node;
}

// 일기 탭: 맨 위가 "만난 사람"(최근 세 명 + 전체 + 명함 받기), 그 아래 날짜별 회사 일기, 보내기는 한 줄 띠, 검정 단추는 "일기 쓰기" 하나.
export async function render({ rest, go }) {
  document.body.classList.remove('pcard-open');
  const [data, settings] = await Promise.all([getExhibitors().catch(() => null), getSettings()]);
  const byId = new Map((data?.ex || []).map((r) => [r[0], r]));
  const companies = getInterests().map((it) => byId.get(it.id)).filter(Boolean).map((r) => ({ id: r[0], name: r[1], booth: r[7][0] || '' }));
  const holder = el('div');
  const sendTo = collectorUrl(settings);
  const shell = createCardShell();
  window.addEventListener('hashchange', () => shell.close(), { once: true });
  let note = '';
  let openId = null;

  // 이 회사에서 만난 사람 수. 만난 사람은 폰에만 남고 일기 파일에는 들어가지 않는다.
  const metCount = (e) => countAt(getPeople(), e);

  // 일기 카드(큰 창): 본 것 · 느낀 점 · 누구에게 · 들은 글 · 녹음 · 고치기 · 지우기
  function entryCard(e) {
    const n = metCount(e);
    const del = el('button', { class: 'btn ghost warn-btn', type: 'button', text: '지우기' });
    del.addEventListener('click', async () => {
      if (!del.dataset.ask) {
        del.dataset.ask = '1';
        del.textContent = '정말 지우기';
        setTimeout(() => { if (del.isConnected) { delete del.dataset.ask; del.textContent = '지우기'; } }, 4000);
        return;
      }
      setDiary(getDiary().filter((x) => x.id !== e.id));
      if (e.audio) { try { const { dropAudio } = await import('../audio-store.js'); await dropAudio(e.id); } catch { /* 없으면 지울 것도 없다 */ } }
      if (e.photo) { try { const { dropPhoto } = await import('../photo-store.js'); await dropPhoto(e.id); } catch { /* 없으면 지울 것도 없다 */ } }
      shell.close();
      show('일기를 지웠다.');
    });
    return [
      el('div', { class: 'pcard-top' },
        el('span', { class: 'pcard-sub', text: `${e.date} · ${e.draft ? '초안 · 다듬어야 보낸다' : e.sent ? `보냄 ${new Date(e.sent).toLocaleDateString('ko-KR')}` : '아직 보내지 않음'}` }),
        el('button', { class: 'btn ghost pcard-close', type: 'button', text: '닫기', onclick: () => shell.close() })),
      el('h2', { class: 'pcard-name', text: e.company || '회사 미정' }),
      (e.for || []).length ? el('p', { class: 'card-tags' }, ...(e.for || []).map((k) => el('span', { class: 'tag mint', text: tagKo(k) }))) : null,
      e.saw ? el('div', {}, el('p', { class: 'label', text: '본 것' }), el('p', { class: 'pcard-note', text: e.saw })) : null,
      e.felt ? el('div', {}, el('p', { class: 'label', text: '느낀 점' }), el('p', { class: 'pcard-note', text: e.felt })) : null,
      n ? el('p', { class: 'note' }, `이 회사에서 만난 사람 ${n}명 · `, el('a', { href: '#/people', text: '보기' })) : null,
      heardBox(e),
      photoBox(e),
      audioBox(e, () => { setDiary(getDiary().map((x) => { if (x.id !== e.id) return x; const { audio, ...restOf } = x; return restOf; })); shell.close(); show('녹음을 지웠다. 글은 그대로다.'); }),
      el('div', { class: 'actions' },
        el('a', { class: 'btn', href: `#/diary/edit/${e.id}`, text: e.draft ? '다듬기' : '고치기' }),
        e.exId ? el('a', { class: 'btn ghost', href: `#/talk/${encodeURIComponent(e.exId)}`, text: '대화' }) : null),
      del,
    ];
  }

  function list(message) {
    const all = getDiary().sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
    const drafts = all.filter((e) => e.draft);
    const ready = all.filter((e) => !e.draft);
    const unsent = ready.filter((e) => !e.sent);
    const status = el('p', { class: 'note', role: 'status', text: message || '' });
    const markSent = (ids) => setDiary(getDiary().map((e) => (ids.includes(e.id) ? { ...e, sent: new Date().toISOString() } : e)));

    const send = el('button', { class: 'pick', type: 'button', text: '보내기', disabled: unsent.length === 0, onclick: async () => {
      const payload = bundle(unsent, getProfile());
      if (sendTo) {
        // 모으는 곳 주소로는 일기 글만 간다 (대화 · 사진은 가지 않는다).
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
      // 파일로 내려받을 때는 그 일기와 이어진 대화와 일기 사진이 같이 들어간다.
      const photos = unsent.some((e) => e.photo) ? await (await import('../photo-store.js')).photosFor(unsent) : null;
      // 폰의 공유 창을 쓸 수 있으면 그것으로 건넨다(AirDrop · 파일에 저장 · 메신저가 한 번에 보인다). 아니면 내려받는다.
      const how = await handFile(fileName(getProfile()), JSON.stringify(bundle(unsent, getProfile(), new Date(), talksFor(unsent, getTalks()), photos), null, 2));
      if (how === 'cancel') { status.textContent = '보내지 않았다. 일기는 폰에 그대로 있다.'; return; }
      markSent(unsent.map((e) => e.id));
      const n = Object.keys(photos || {}).length;
      const with_ = n ? ` (사진 ${n}장 포함)` : '';
      show(how === 'shared' ? `${unsent.length}개를 건넸다${with_}.` : `${unsent.length}개를 파일로 내보냈다${with_}. 이 파일을 정리하는 사람에게 건넨다.`);
    } });
    const copy = el('button', { class: 'pick', type: 'button', text: '글로 복사', disabled: ready.length === 0, onclick: async () => {
      try { await navigator.clipboard.writeText(asText(ready, getProfile(), tagKo)); status.textContent = '글로 복사했다. 단톡방에 붙여 넣을 수 있다.'; } catch { status.textContent = '복사하지 못했다.'; }
    } });

    // 만난 사람: 최근 세 명
    const people = getPeople().sort((a, b) => (b.met || '').localeCompare(a.met || ''));
    const ctx = { shell, companies, after: (m) => show(m) };
    const metPanel = el('section', { class: 'panel met' },
      el('div', { class: 'panel-head' },
        el('h2', { text: `만난 사람 ${people.length}명` }),
        el('a', { class: 'pick', href: '#/people/new', text: '명함 받기' })),
      people.length
        ? el('ul', { class: 'stops' }, people.slice(0, 3).map((p) => personRow(p, (q, from) => shell.open(personCard(q, ctx), from))))
        : el('p', { class: 'note', text: '아직 없다. 남의 명함을 받으면 여기 맨 위에 남는다.' }),
      people.length > 3 ? el('a', { class: 'pick more', href: '#/people', text: `전체 ${people.length}명 ›` }) : null,
      el('p', { class: 'note', text: '이 폰에만 남는다. 일기와 함께 가지 않는다.' }));

    // 날짜별 일기
    const days = [];
    let day = null;
    for (const e of all) {
      if (!day || day.date !== e.date) { day = { date: e.date, items: [] }; days.push(day); }
      day.items.push(e);
    }
    const row = (e) => el('li', { class: e.sent ? 'stop seen' : 'stop' },
      el('button', { class: 'stop-open', type: 'button', 'aria-label': `${e.company || '회사 미정'} 일기 카드 열기`, onclick: (ev) => { openId = e.id; shell.open(entryCard(e), ev.currentTarget); } },
        el('span', { class: 'no av', text: [...(e.company || '일')][0] }),
        el('span', { class: 'stop-main' },
          el('span', { class: 'name' }, e.company || '회사 미정', e.draft ? el('span', { class: 'tag', text: '초안' }) : null, (e.for || []).map((k) => el('span', { class: 'tag mint', text: tagKo(k) }))),
          el('span', { class: 'where clamp', text: e.saw || e.felt || '' }))),
      el('span', { class: 'state', text: e.draft ? '초안' : e.sent ? '보냄' : '' }));

    // 보내기: 한 줄 띠
    const sendBand = all.length ? el('section', { class: 'panel band' },
      el('div', { class: 'band-line' },
        el('h2', { text: unsent.length ? `보내지 않은 일기 ${unsent.length}개` : '보낼 일기가 없다' }),
        el('div', { class: 'actions' }, send, copy)),
      drafts.length ? el('p', { class: 'note', text: `초안 ${drafts.length}개는 다듬어 남겨야 보낼 수 있다. 녹음은 안 간다.` }) : null,
      status) : el('section', { class: 'panel' }, el('p', { class: 'note', text: '일기 0개. 아래 "일기 쓰기"로 시작한다.' }), status);

    holder.replaceChildren(el('div', { class: 'page listpage' },
      el('section', { class: 'head' }, el('h1', { text: '일기' })),
      metPanel,
      ...(all.length ? days.map((d) => el('section', { class: 'panel' }, el('h2', { text: d.date }), el('ul', { class: 'stops' }, d.items.map(row)))) : []),
      sendBand,
      shell.node,
      // 한 손으로 닿게 탭 바로 위에 하나.
      el('div', { class: 'dock solo' }, el('a', { class: 'btn', href: '#/diary/new', text: '일기 쓰기' }))));
    if (shell.isOpen && openId) { const cur = getDiary().find((x) => x.id === openId); if (cur) shell.update(entryCard(cur)); }
  }
  function show(message) {
    if (location.hash !== '#/diary') { sessionStorage.setItem('ces2027.diaryNote', message || ''); go('#/diary'); return; }
    note = message || '';
    list(note);
  }

  if (rest[0] === 'new' || rest[0] === 'edit') {
    const entry = rest[0] === 'edit' ? getDiary().find((e) => e.id === rest[1]) : null;
    if (rest[0] === 'edit' && !entry) { go('#/diary'); return holder; }
    // 만난 사람에서 온 회사가 관심 목록에 없으면 이번 일기에서만 고를 수 있게 더한다.
    const want = rest[0] === 'new' && rest[1] && !rest[1].startsWith('n:') ? rest[1] : '';
    if (want && byId.has(want) && !companies.some((c) => c.id === want)) { const r = byId.get(want); companies.push({ id: r[0], name: r[1], booth: r[7][0] || '' }); }
    holder.replaceChildren(form(entry, rest[0] === 'new' ? rest[1] : null, companies, show));
  } else {
    const msg = sessionStorage.getItem('ces2027.diaryNote');
    sessionStorage.removeItem('ces2027.diaryNote');
    list(msg || '');
  }
  return holder;
}
