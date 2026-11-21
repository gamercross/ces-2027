// 듣기: 부스에서 상대의 말을 받아 적고(영어) 한국어로 옮긴다. 멈추면 그 회사의 일기 초안이 된다.
// 소리와 글은 이 폰에만 남는다. 폰이 못 하는 것은 숨기지 않고 "이 폰에서는 안 됨"으로 보인다. 그때는 손으로 적는다.

import { el } from '../dom.js';
import { getExhibitors, getPhrases, getSettings } from '../data.js';
import { getDiary, load, save, setDiary } from '../store.js';
import { capabilities, dictate, installDictation, makeDraft, summarize, translate } from '../speech.js';
import { capRows, currentMode, modePicker, showBig } from '../talk-ui.js';

const pad = (n) => String(n).padStart(2, '0');
const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const clock = (secs) => `${Math.floor(secs / 60)}:${pad(Math.floor(secs % 60))}`;
const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const WHY = {
  'not-allowed': '마이크를 허락하지 않았다',
  'service-not-allowed': '이 폰이 받아쓰기를 막아 두었다',
  network: '인터넷이 없다',
  'audio-capture': '마이크를 잡지 못했다',
  'language-not-supported': '이 폰이 영어 받아쓰기를 돕지 않는다',
  stopped: '폰이 받아쓰기를 멈췄다',
};

export async function render({ rest, go }) {
  const exId = rest[0] ? decodeURIComponent(rest[0]) : '';
  const [phrases, settings, data] = await Promise.all([getPhrases(), getSettings(), exId ? getExhibitors().catch(() => null) : null]);
  const row = data?.ex.find((r) => r[0] === exId);
  const company = row ? { id: row[0], name: row[1], booth: row[7][0] || '' } : { id: '', name: '', booth: '' };
  const mode = currentMode(settings);
  let caps = await capabilities(mode);

  const lines = [];
  const pending = [];
  let running = false;
  let startAt = 0;
  let session = null;
  let stream = null;
  let recorder = null;
  let chunks = [];
  let lock = null;
  let timer = 0;
  let saved = false;

  const status = el('p', { class: 'note', role: 'status' });
  const live = el('p', { class: 'live', 'aria-live': 'off' });
  const heard = el('ol', { class: 'heard' });
  const count = el('h2', { text: '받아 적은 글 0줄' });
  const time = el('span', { class: 'tag mint', hidden: true });
  const dock = el('div', { class: 'dock' });
  const capsBox = el('div');
  const nameBox = el('input', { maxlength: 80, placeholder: '회사 이름을 적는다', 'aria-label': '회사 이름' });
  const keep = el('input', { type: 'checkbox', checked: caps.record.ok, disabled: !caps.record.ok });
  const typed = el('input', { maxlength: 300, placeholder: '들은 말을 손으로 적는다 (영어나 한국어)', 'aria-label': '손으로 적기' });

  function addLine(text) {
    const line = { t: startAt ? (Date.now() - startAt) / 1000 : 0, en: text, ko: '' };
    lines.push(line);
    const ko = el('small', { text: caps.translate.ok ? '옮기는 중' : '' });
    heard.append(el('li', {}, el('span', { lang: 'en', text }), ko));
    count.textContent = `받아 적은 글 ${lines.length}줄`;
    if (caps.translate.ok) pending.push(translate(text, 'en', 'ko').then((got) => { line.ko = got || ''; ko.textContent = got || '(옮기지 못함)'; }));
    drawDock();
  }

  async function begin() {
    running = true;
    saved = false;
    startAt = Date.now();
    status.textContent = '';
    if (keep.checked && caps.record.ok) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        recorder = new MediaRecorder(stream, { audioBitsPerSecond: 32000 });
        chunks = [];
        recorder.ondataavailable = (ev) => { if (ev.data.size) chunks.push(ev.data); };
        recorder.start(5000);
      } catch {
        stream = null;
        recorder = null;
        status.textContent = '마이크를 쓰지 못했다 (허락을 본다). 녹음 없이 한다.';
      }
    }
    if (caps.dictate.ok) {
      session = dictate(mode, caps.dictate.local, {
        onLine: addLine,
        onInterim: (text) => { live.textContent = text; },
        onEnd: (why) => {
          session = null;
          live.textContent = '';
          if (!running) return;
          status.textContent = `받아쓰기가 멈췄다: ${WHY[why] || why}.${recorder ? ' 녹음은 계속한다. 녹음과 받아쓰기를 같이 못 하는 폰이면 "소리도 남기기"를 끄고 다시 한다.' : ''} 아래에 손으로 적어도 된다.`;
        },
      }, undefined, stream?.getAudioTracks()[0]);
      if (!session) status.textContent = '받아쓰기를 시작하지 못했다. 아래에 손으로 적는다.';
    }
    if (!recorder && !session) { running = false; startAt = 0; drawDock(); return; }
    try { lock = await navigator.wakeLock?.request('screen'); } catch { lock = null; }
    time.hidden = false;
    timer = setInterval(() => { time.textContent = `듣는 중 ${clock((Date.now() - startAt) / 1000)}`; }, 1000);
    time.textContent = '듣는 중 0:00';
    drawDock();
  }

  // 멈추고 일기 초안을 만든다. stay면 화면을 옮기지 않는다 (다른 화면으로 나갈 때).
  async function finish(stay) {
    if (saved) return;
    saved = true;
    const secs = startAt ? (Date.now() - startAt) / 1000 : 0;
    running = false;
    clearInterval(timer);
    time.hidden = true;
    live.textContent = '';
    session?.stop();
    session = null;
    let blob = null;
    if (recorder) {
      const rec = recorder;
      recorder = null;
      await new Promise((resolve) => { rec.onstop = resolve; try { rec.stop(); } catch { resolve(); } });
      if (chunks.length) blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
    }
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    try { await lock?.release(); } catch { /* 이미 풀렸다 */ }
    lock = null;
    if (!lines.length && !blob) { saved = false; status.textContent = '받아 적은 글도 녹음도 없다. 초안을 만들지 않았다.'; drawDock(); return; }
    status.textContent = '일기 초안을 만드는 중이다.';
    await Promise.race([Promise.allSettled(pending), new Promise((r) => setTimeout(r, 4000))]);
    let summary = await summarize(lines.map((l) => l.en).join(' '));
    if (summary && caps.translate.ok) summary = (await translate(summary, 'en', 'ko')) || summary;
    const who = company.id ? company : { id: '', name: nameBox.value.trim() || '회사 이름 없음', booth: '' };
    const entry = makeDraft(who, lines, today(), newId(), summary);
    if (blob) {
      try {
        const { saveAudio } = await import('../audio-store.js');
        await saveAudio(entry.id, blob);
        entry.audio = { bytes: blob.size, type: blob.type, secs: Math.round(secs) };
      } catch { /* 소리는 못 남겼어도 글은 남긴다 */ }
    }
    if (!setDiary([...getDiary(), entry])) { saved = false; status.textContent = '이 폰에 저장하지 못했다. 사생활 보호 창이면 보통 창으로 다시 연다.'; drawDock(); return; }
    sessionStorage.setItem('ces2027.diaryNote', '');
    if (!stay) go(`#/diary/edit/${entry.id}`);
  }
  // 듣는 중에 다른 화면으로 가면 그때까지 들은 것을 초안으로 남긴다.
  const leave = () => {
    if (location.hash.startsWith('#/listen')) return;
    window.removeEventListener('hashchange', leave);
    if (running || lines.length) finish(true);
  };
  window.addEventListener('hashchange', leave);

  function askFirst() {
    const box = el('section', { class: 'panel band ask', role: 'alertdialog', 'aria-label': '상대에게 알렸나요' },
      el('h2', { text: '상대에게 알렸나요?' }),
      el('p', { text: '말을 받아 적거나 녹음하기 전에 상대에게 먼저 알린다. 싫다고 하면 듣기를 쓰지 않고 손으로 적는다.' }),
      el('div', { class: 'actions' },
        el('button', { class: 'btn', type: 'button', text: '알렸다 · 듣기 시작', onclick: () => { save('listenAsked.v1', today()); box.remove(); begin(); } }),
        el('button', { class: 'btn ghost', type: 'button', text: '아직 · 알리는 말 띄우기', onclick: () => showBig(phrases.notice.en, phrases.notice.ko, mode, caps.speak) })));
    dock.before(box);
    box.querySelector('button').focus();
  }

  function drawDock() {
    const can = caps.dictate.ok || (caps.record.ok && keep.checked);
    const kids = [];
    if (running) kids.push(el('button', { class: 'btn', type: 'button', text: '멈추고 일기 초안 만들기', onclick: () => finish(false) }));
    else {
      kids.push(el('button', { class: 'btn', type: 'button', disabled: !can, text: can ? '상대에게 알렸다 · 듣기 시작' : '이 폰에서는 듣기가 안 됨', onclick: () => { if (load('listenAsked.v1', null)) begin(); else if (!document.querySelector('.band.ask[role=alertdialog]')) askFirst(); } }));
      if (lines.length) kids.push(el('button', { class: 'btn ghost', type: 'button', text: '적은 것으로 초안 만들기', onclick: () => finish(false) }));
    }
    dock.replaceChildren(...kids);
  }

  function drawCaps() {
    capsBox.replaceChildren(...[
      capRows([['받아쓰기', caps.dictate], ['한국어로', caps.translate], ['녹음', caps.record]]),
      caps.dictate.installable ? el('div', { class: 'actions' }, el('button', { class: 'btn ghost', type: 'button', text: '받아쓰기 말 꾸러미 받기', onclick: async (ev) => {
        ev.target.disabled = true;
        status.textContent = '말 꾸러미를 받는 중이다. 와이파이에서 받는다.';
        const ok = await installDictation();
        caps = await capabilities(mode);
        status.textContent = ok ? '말 꾸러미를 받았다.' : '말 꾸러미를 받지 못했다.';
        drawCaps();
        drawDock();
      } })) : null,
      modePicker(mode, () => { if (running || lines.length) status.textContent = '길을 바꿨다. 지금 듣는 것을 초안으로 남긴 다음부터 쓴다.'; else go(location.hash); })].filter(Boolean));
  }
  keep.addEventListener('change', drawDock);
  const addTyped = () => { const t = typed.value.trim(); if (t) { addLine(t); typed.value = ''; } };
  typed.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); addTyped(); } });
  drawCaps();
  drawDock();

  return el('div', { class: 'page' },
    el('section', { class: 'panel' },
      el('h1', {}, '듣기', company.name ? ` · ${company.name}` : ''),
      el('p', { class: 'lead', text: '상대의 말을 받아 적고 한국어로 옮긴다. 멈추면 이 회사의 일기 초안이 된다. 소리와 글은 이 폰에만 남는다.' }),
      company.id ? (company.booth ? el('p', { class: 'note', text: `부스 ${company.booth.split('@')[0]}` }) : null) : el('label', { class: 'field' }, el('span', { class: 'label', text: '회사' }), nameBox),
      el('div', { class: 'actions' }, el('a', { class: 'btn ghost', href: `#/ask${company.id ? `/${encodeURIComponent(company.id)}` : ''}`, text: '물어볼 말' }))),
    el('section', { class: 'panel notice' },
      el('h2', { text: '먼저 알린다' }),
      el('div', { class: 'name', text: phrases.notice.ko }),
      el('p', { class: 'en', lang: 'en', text: phrases.notice.en }),
      el('div', { class: 'row-actions' }, el('button', { class: 'say', type: 'button', text: '크게 띄우기', onclick: () => showBig(phrases.notice.en, phrases.notice.ko, mode, caps.speak) }))),
    el('section', { class: 'panel' },
      el('h2', { text: '이 폰에서 되는 것' }),
      capsBox,
      el('label', { class: 'toggle' }, keep, el('span', { text: caps.record.ok ? '소리도 남기기 (이 폰에만, 한 시간에 14MB쯤)' : '소리 남기기: 이 폰에서는 안 됨' }))),
    el('section', { class: 'panel' },
      el('div', { class: 'name' }, count, time),
      live, heard,
      el('div', { class: 'inline' }, el('label', { class: 'field' }, el('span', { class: 'label', text: '손으로 적기' }), typed), el('button', { class: 'btn ghost', type: 'button', text: '줄 넣기', onclick: addTyped })),
      status),
    dock);
}
