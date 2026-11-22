// 모은 일기 열기 (R46): 받은 일기 파일(ces2027-일기-*.json) 여러 개를 한 번에 골라 네 태그 × 회사로 묶은 한 장을 본다.
// 정리는 폰 안의 diary.wasm(crates/ces-diary)이 하고, 이 화면을 열 때만 받는다(첫 화면에 싣지 않는다). 인터넷 없이도 된다.
// 고른 파일과 한 장은 이 화면의 메모리에만 있고 폰 저장소에 쓰지 않는다. 화면을 나가면 사라진다.

import { el } from '../dom.js';
import { loadDiaryCore, parseOnePage } from '../diarycore.js';

const nowIso = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
  const a = el('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function render() {
  const holder = el('div', { class: 'page listpage collectpage' });
  const status = el('p', { class: 'note', role: 'status' });
  const skipped = el('ul', { class: 'coll-skipped' });
  const summary = el('p', { class: 'coll-summary', hidden: true });
  const chips = el('div', { class: 'segs', role: 'group', 'aria-label': '누구에게', hidden: true });
  const body = el('div', { class: 'coll-body' });
  const input = el('input', { type: 'file', multiple: true, accept: '.json,application/json', class: 'file-hidden', 'aria-label': '일기 파일 고르기', tabindex: '-1' });
  const pickBtn = el('button', { class: 'btn', type: 'button', text: '파일 고르기', onclick: () => input.click() });
  const saveBtn = el('button', { class: 'btn', type: 'button', text: '한장.md 내려받기', hidden: true });
  const copyBtn = el('button', { class: 'pick', type: 'button', text: '복사', hidden: true });
  const actions = el('div', { class: 'actions coll-actions' }, saveBtn, copyBtn);

  let core = null;
  let page = '';
  let shown = 0;
  let view = null;

  async function ensureCore() {
    if (core) return core;
    status.textContent = '정리 도구를 받는 중이다.';
    core = await loadDiaryCore(fetch('diary.wasm'));
    return core;
  }

  function drawTag() {
    const tag = view.tags[shown];
    for (const [i, b] of [...chips.children].entries()) b.setAttribute('aria-pressed', i === shown ? 'true' : 'false');
    const cards = tag.list.map((c) => el('section', { class: 'coll-co' },
      el('div', { class: 'coll-co-head' },
        el('h3', { text: c.name || '회사 없음' }),
        el('span', { class: 'where', text: [c.booth ? `부스 ${c.booth}` : '', c.count > 1 ? `일기 ${c.count}개` : ''].filter(Boolean).join(' · ') })),
      c.parts.map((p) => el('div', { class: 'coll-part' },
        p.label ? el('p', { class: 'label', text: p.label }) : null,
        el('ul', {}, p.lines.map((t) => el('li', { text: t })))))));
    body.replaceChildren(
      el('h2', { text: `${tag.title} · 일기 ${tag.entries}개 · 회사 ${tag.companies}곳` }),
      ...(cards.length ? cards : [el('p', { class: 'note', text: '아직 없다.' })]));
  }

  function draw() {
    view = parseOnePage(page);
    summary.textContent = view.head.find((l) => l.startsWith('일기 ')) || '';
    summary.hidden = false;
    // 일기가 있는 칸만 칩으로 둔다. 네 태그는 늘 보이고, "고르지 않은 것"은 있을 때만 생긴다.
    chips.replaceChildren(...view.tags.map((t, i) => el('button', { class: 'seg', type: 'button', text: `${t.title.length > 6 ? '미정' : t.title} ${t.entries}`, 'aria-label': `${t.title} 일기 ${t.entries}개`, 'aria-pressed': 'false', onclick: () => { shown = i; drawTag(); } })));
    chips.hidden = false;
    // 일기가 가장 먼저 나오는 칸부터 보인다.
    shown = Math.max(0, view.tags.findIndex((t) => t.entries > 0));
    drawTag();
    saveBtn.hidden = false;
    copyBtn.hidden = false;
    pickBtn.className = 'pick';
    pickBtn.textContent = '다시 고르기';
  }

  input.addEventListener('change', async () => {
    const files = [...input.files];
    input.value = '';
    if (!files.length) return;
    try {
      const c = await ensureCore();
      c.reset();
      skipped.replaceChildren();
      let ok = 0;
      for (const f of files) {
        const r = c.add(await f.text());
        if (r.ok) ok += 1; else skipped.append(el('li', { class: 'note warn', text: `${f.name}: 건너뛴다. ${r.why}` }));
      }
      if (!ok) {
        page = '';
        status.textContent = '일기 파일을 읽지 못했다. 단톡방에서 받은 ces2027-일기-…json 파일을 고른다.';
        summary.hidden = chips.hidden = saveBtn.hidden = copyBtn.hidden = true;
        body.replaceChildren();
        return;
      }
      page = c.page(nowIso());
      status.textContent = `파일 ${ok}개를 읽었다.${ok < files.length ? ` ${files.length - ok}개는 건너뛰었다.` : ''} 이 폰에는 남기지 않는다.`;
      draw();
    } catch (e) {
      console.error(e);
      status.textContent = '정리 도구를 받지 못했다. 인터넷에서 앱을 한 번 열어 두면 그 뒤로는 인터넷 없이 된다.';
    }
  });
  saveBtn.addEventListener('click', () => { download('한장.md', page); status.textContent = '한장.md를 내려받았다. 별명과 일기가 들어 있으니 공개 레포에 올리지 않는다.'; });
  copyBtn.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(page); status.textContent = '한 장을 복사했다.'; } catch { status.textContent = '복사하지 못했다. 내려받기를 쓴다.'; }
  });

  holder.append(
    el('section', { class: 'head' }, el('h1', { text: '모은 일기' })),
    el('section', { class: 'panel' },
      el('p', { text: '받은 일기 파일을 한 번에 고르면 네 태그로 나눈 한 장이 나온다.' }),
      el('div', { class: 'actions coll-pick' }, pickBtn, input),
      status, skipped, summary),
    chips,
    el('section', { class: 'panel coll-panel' }, body),
    actions);
  return holder;
}
