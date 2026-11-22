// 만난 사람: 남의 QR을 카메라로 읽거나 주소를 붙여 넣으면 읽자마자 "만난 사람"으로 폰에만 남는다(이름은 나중에 적어도 된다).
// 같은 사람(같은 연락처)을 다시 읽으면 새 줄을 만들지 않고 "이미 있다"고 알린다.
// 카메라는 단추를 눌렀을 때만 켠다. 화면을 떠나면 꺼진다(scan.js). 밖으로 보내지 않고, 일기 보내기 묶음에도 들어가지 않는다.
//   #/people      전체 목록(찾기 칸 하나) + "명함 받기"
//   #/people/new  남의 명함 받기: 카메라 한 칸 + "주소 붙여넣기"

import { el } from '../dom.js';
import { getExhibitors } from '../data.js';
import { getInterests } from '../store.js';
import { cameraSupport, envOf, startScan } from '../scan.js';
import { parseScan, upsert } from '../people.js';
import { getPeople, setPeople } from '../people-store.js';
import { createCardShell } from '../plancard.js';
import { nameOf, personCard, personEdit, personRow } from '../people-ui.js';

const today = () => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };

export async function render({ rest = [] } = {}) {
  document.body.classList.remove('pcard-open');
  const data = await getExhibitors().catch(() => null);
  const byId = new Map((data?.ex || []).map((r) => [r[0], r]));
  const companies = getInterests().map((it) => byId.get(it.id)).filter(Boolean).map((r) => ({ id: r[0], name: r[1], booth: r[7][0] || '' }));
  const shell = createCardShell();
  window.addEventListener('hashchange', () => shell.close(), { once: true });
  const holder = el('div', { class: 'page listpage' });
  let scanner = null;
  const stopCam = () => { if (scanner) { scanner.stop(); scanner = null; } };

  // ---- 전체 목록 ----
  const q = el('input', { type: 'search', class: 'people-q', placeholder: '이름 · 회사 찾기', autocomplete: 'off', 'aria-label': '만난 사람 찾기' });
  const listBox = el('ul', { class: 'stops' });
  const note = el('p', { class: 'note', role: 'status' });
  const ctx = { shell, companies, after: (m) => { note.textContent = m || ''; drawList(); } };
  const open = (p, from) => shell.open(personCard(p, ctx), from);
  function drawList() {
    const all = getPeople().sort((a, b) => (b.met || '').localeCompare(a.met || ''));
    const k = q.value.trim().toLowerCase();
    const shown = k ? all.filter((p) => `${nameOf(p)} ${p.company} ${p.links.map((l) => l.label).join(' ')}`.toLowerCase().includes(k)) : all;
    countText.textContent = `만난 사람 ${all.length}명`;
    q.hidden = all.length < 6;
    listBox.replaceChildren(...(shown.length ? shown.map((p) => personRow(p, open)) : [el('li', { class: 'note', text: all.length ? '찾는 사람이 없다.' : '아직 없다. 남의 명함을 받으면 여기 남는다.' })]));
  }
  const countText = el('h2', { text: '' });

  // ---- 받기: 읽자마자 남긴다 ----
  const scanNote = el('p', { class: 'note', role: 'status' });
  function keep(text, hint, by) {
    const r = parseScan(text, hint);
    if (!r.ok) { scanNote.textContent = `${by}: ${r.why}`; return false; }
    const result = upsert(getPeople(), { links: [r.link], met: today() });
    if (!setPeople(result.list)) { scanNote.textContent = '이 폰에 저장하지 못했다. 사생활 보호 창이면 보통 창으로 다시 연다.'; return false; }
    stopCam();
    video.hidden = true;
    camBtn.textContent = '카메라 켜기';
    const again = result.merged > 0;
    scanNote.textContent = again ? `이미 있다: ${nameOf(result.person)}` : `폰에 남겼다: ${nameOf(result.person)}`;
    const c = { shell, companies, after: (m) => { scanNote.textContent = m || ''; } };
    shell.open(again ? personCard(result.person, c) : personEdit(result.person, c, { fresh: true }), camBtn);
    return true;
  }
  const can = cameraSupport(envOf(window));
  const video = el('video', { class: 'scan-video', playsinline: true, muted: true, hidden: true, 'aria-label': '카메라 화면' });
  const camBtn = el('button', { class: 'btn', type: 'button', text: '카메라 켜기', disabled: !can.ok });
  const camNote = el('p', { class: can.ok ? 'note' : 'note warn', role: 'status', text: can.ok ? '누를 때만 켠다. QR을 화면 가운데에.' : `카메라로 읽을 수 없다. ${can.why} 주소를 붙여 넣는다.` });
  async function toggleCam() {
    if (scanner) { stopCam(); video.hidden = true; camBtn.textContent = '카메라 켜기'; camNote.textContent = '카메라를 껐다.'; return; }
    camBtn.disabled = true;
    camNote.textContent = '카메라를 켜는 중이다. 권한을 물으면 허용한다.';
    video.hidden = false;
    const r = await startScan(video, (text) => { keep(text, 'auto', '카메라'); });
    camBtn.disabled = false;
    if (!r.ok) {
      video.hidden = true;
      camNote.className = 'note warn';
      camNote.textContent = `${r.why} 아래 "주소 붙여넣기"로 이어간다.`;
      return;
    }
    scanner = r;
    camBtn.textContent = '그만 읽기';
    camNote.className = 'note';
    camNote.textContent = '읽는 중이다. 읽으면 바로 폰에 남는다.';
  }
  camBtn.addEventListener('click', toggleCam);

  const addr = el('input', { name: 'addr', maxlength: 300, autocapitalize: 'off', autocomplete: 'off', spellcheck: 'false', inputmode: 'url', placeholder: '주소나 아이디', 'aria-label': '주소나 아이디' });
  const hint = el('select', { 'aria-label': '아이디만 적었을 때' }, el('option', { value: 'github', text: '아이디면 깃허브' }), el('option', { value: 'discord', text: '아이디면 디스코드' }));
  const pasteForm = el('form', { class: 'paste', hidden: true },
    el('div', { class: 'inline' }, addr, hint),
    el('button', { class: 'btn ghost', type: 'submit', text: '남기기' }));
  pasteForm.addEventListener('submit', (ev) => { ev.preventDefault(); if (keep(addr.value, hint.value, '붙여넣기')) addr.value = ''; });
  const pasteBtn = el('button', { class: 'linkish', type: 'button', text: '주소 붙여넣기', 'aria-expanded': 'false', onclick: () => { pasteForm.hidden = !pasteForm.hidden; pasteBtn.setAttribute('aria-expanded', String(!pasteForm.hidden)); if (!pasteForm.hidden) addr.focus(); } });

  if (rest[0] === 'new') {
    holder.append(
      el('section', { class: 'head' }, el('h1', { text: '남의 명함 받기' })),
      el('section', { class: 'panel' }, camNote, camBtn, video, scanNote, pasteBtn, pasteForm),
      el('div', { class: 'segs', role: 'group', 'aria-label': '만난 사람' }, el('a', { class: 'seg', href: '#/people', text: '만난 사람 보기' })),
      shell.node);
  } else {
    drawList();
    holder.append(
      el('section', { class: 'head head-row' }, el('h1', { text: '만난 사람' }), el('a', { class: 'btn ghost', href: '#/people/new', text: '명함 받기' })),
      el('section', { class: 'panel' }, countText, q, note, listBox, el('p', { class: 'note', text: '이 폰에만 남는다. 일기와 함께 가지 않는다.' })),
      shell.node);
    q.addEventListener('input', drawList);
  }
  return holder;
}

