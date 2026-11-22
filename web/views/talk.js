// 대화 칸: 회사마다 그 회사와 한 대화를 넣는다 — 듣기 · 붙여넣기 · 손으로.
// 번역은 번역 앱(파파고 · 구글 번역)이 한다. 대화 기록을 붙여 넣으면 줄마다 영어 / 한국어로 나누고 원문 · 번역 짝을 지어 보인다.
// 넣은 대화는 그 회사 일기 초안으로 이어진다(들은 것 칸은 상대가 한 영어 원문 줄만으로 채운다). 대화는 이 폰에만 남고, 파일로 내려받을 때만 그 파일에 든다.

import { el } from '../dom.js';
import { getExhibitors } from '../data.js';
import { getDiary, getTalks, setDiary, setTalks } from '../store.js';
import { countOf, draftFromTalk, handPair, makeTalk, MAX_PASTE, sourceKo, splitPaste } from '../talk.js';
import { copyGuide, translatorButton } from '../translator-ui.js';

const pad = (n) => String(n).padStart(2, '0');
const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const WHO_KO = { them: '상대가 한 말 (영어가 원문)', me: '내가 한 말 (한국어가 원문)' };

export async function render({ rest, go }) {
  let exId = '';
  let presetName = '';
  try {
    const first = rest[0] ? decodeURIComponent(rest[0]) : '';
    if (first.startsWith('n:')) presetName = first.slice(2); else exId = first;
  } catch { /* 깨진 주소면 비워 둔다 */ }
  const data = exId ? await getExhibitors().catch(() => null) : null;
  const row = data?.ex.find((r) => r[0] === exId);
  const company = row ? { id: row[0], name: row[1], booth: row[7][0] || '' } : { id: '', name: presetName, booth: '' };
  const nameBox = el('input', { maxlength: 80, placeholder: '회사 이름을 적는다', 'aria-label': '회사 이름', value: company.name });

  let mode = 'paste';
  let staged = null;
  const status = el('p', { class: 'note', role: 'status' });
  const modeBox = el('div');
  const stagedBox = el('div');
  const listBox = el('div');
  const who = () => (company.id ? company : { id: '', name: nameBox.value.trim(), booth: '' });
  const mine = () => getTalks().filter((t) => (company.id ? t.exId === company.id : !t.exId && t.company === nameBox.value.trim())).sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));

  // ── 넣을 대화(미리 보기) ──
  function drawStaged() {
    if (!staged) { stagedBox.replaceChildren(); return; }
    const head = el('h2', { text: staged.kind === 'block' ? '붙인 글 (짝을 못 지어 한 덩어리)' : `넣을 대화 ${staged.pairs.length}줄` });
    const body = [];
    if (staged.kind === 'block') {
      body.push(el('p', { class: 'note', text: '줄이 번갈아 나오지 않거나 한쪽 말뿐이라 원문 · 번역 짝을 짓지 못했다. 짝을 지으려면 번역 앱에서 원문과 번역이 번갈아 나오게 복사해 다시 붙인다. 이대로 저장해도 된다. 영어 줄만 일기 초안의 들은 것이 된다.' }),
        el('ol', { class: 'heard' }, staged.lines.map((l) => el('li', {}, el('span', { lang: l.lang, text: l.text }), el('small', { text: l.lang === 'en' ? '영어' : '한국어' })))));
    } else {
      body.push(el('p', { class: 'note', text: `${staged.app ? `${staged.app === 'papago' ? '파파고' : '구글 번역'}에서 온 글로 보인다. ` : ''}위 줄을 원문, 아래 줄을 번역으로 읽었다. 거꾸로 읽었으면 "말한 사람 바꾸기"를 누른다. 일기 초안의 들은 것에는 상대가 한 말의 영어 원문만 들어간다.` }),
        el('ol', { class: 'heard' }, staged.pairs.map((p, i) => el('li', {},
          el('span', { class: 'tag', text: p.who === 'them' ? '상대' : '나' }),
          p.en ? el('span', { lang: 'en', text: p.en }) : el('small', { text: '(영어 없음)' }),
          p.ko ? el('small', { text: p.ko }) : el('small', { text: '(한국어 없음)' }),
          el('div', { class: 'row-actions' },
            el('button', { class: 'linkish', type: 'button', text: '말한 사람 바꾸기', onclick: () => { p.who = p.who === 'them' ? 'me' : 'them'; drawStaged(); } }),
            el('button', { class: 'linkish', type: 'button', text: '이 줄 빼기', onclick: () => { staged.pairs.splice(i, 1); if (!staged.pairs.length) staged = null; drawStaged(); } }))))));
    }
    stagedBox.replaceChildren(el('section', { class: 'panel' }, head, ...body,
      el('div', { class: 'actions' },
        el('button', { class: 'btn', type: 'button', text: '저장하고 일기 초안 만들기', onclick: () => save(true) }),
        el('button', { class: 'btn ghost', type: 'button', text: '대화만 저장', onclick: () => save(false) }),
        el('button', { class: 'btn ghost', type: 'button', text: '비우기', onclick: () => { staged = null; drawStaged(); status.textContent = ''; } }))));
  }

  function save(withDraft) {
    if (!staged) return;
    const c = who();
    if (!c.name) { status.textContent = '회사 이름을 적는다.'; nameBox.focus(); return; }
    const talk = makeTalk(staged, c, today(), newId());
    let draft = null;
    if (withDraft) {
      draft = draftFromTalk(talk, talk.date, newId());
      talk.draftId = draft.id;
      if (!setDiary([...getDiary(), draft])) { status.textContent = '이 폰에 저장하지 못했다. 사생활 보호 창이면 보통 창으로 다시 연다.'; return; }
    }
    if (!setTalks([...getTalks(), talk])) { status.textContent = '이 폰에 저장하지 못했다. 사생활 보호 창이면 보통 창으로 다시 연다.'; return; }
    staged = null;
    drawStaged();
    drawList();
    status.textContent = '대화를 이 폰에 남겼다.';
    if (draft) go(`#/diary/edit/${draft.id}`);
  }

  // ── 넣는 길 셋 ──
  function drawMode() {
    const seg = (k, ko) => el('button', { class: 'seg', type: 'button', text: ko, 'aria-pressed': mode === k ? 'true' : 'false', onclick: () => { mode = k; drawMode(); } });
    let panel;
    if (mode === 'listen') {
      panel = el('div', { class: 'block' },
        el('p', { class: 'note', text: '마이크로 상대의 말을 받아 적는다(영어). 멈추면 대화가 여기 남고 일기 초안이 된다. 번역 앱으로 대화한다면 녹음하지 않고 "붙여넣기"를 쓴다.' }),
        el('div', { class: 'actions' }, el('a', { class: 'btn', href: `#/listen${company.id ? `/${encodeURIComponent(company.id)}` : ''}`, text: '듣기 열기' })));
    } else if (mode === 'hand') {
      const orig = el('input', { maxlength: 500, placeholder: '들은 말이나 한 말', 'aria-label': '원문' });
      const trans = el('input', { maxlength: 500, placeholder: '번역 (비워도 된다)', 'aria-label': '번역' });
      let pick = '';
      const picks = el('div', { class: 'segs', role: 'group', 'aria-label': '누가 한 말' });
      const drawPicks = () => picks.replaceChildren(...[['', '알아서'], ['them', '상대(영어)'], ['me', '나(한국어)']].map(([k, ko]) => el('button', { class: 'seg', type: 'button', text: ko, 'aria-pressed': pick === k ? 'true' : 'false', onclick: () => { pick = k; drawPicks(); } })));
      drawPicks();
      const add = () => {
        const p = handPair(orig.value, trans.value, pick);
        if (!p) { status.textContent = '먼저 글을 적는다.'; return; }
        if (staged?.kind === 'block') { status.textContent = '붙인 덩어리가 있다. 먼저 저장하거나 비운다.'; return; }
        staged = staged ? { ...staged, pairs: [...staged.pairs, p] } : { src: 'hand', kind: 'pairs', pairs: [p], app: '' };
        orig.value = '';
        trans.value = '';
        status.textContent = '';
        drawStaged();
        orig.focus();
      };
      orig.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); add(); } });
      trans.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); add(); } });
      panel = el('div', { class: 'block' },
        el('p', { class: 'note', text: '한 줄씩 적는다. 영어로 적으면 상대가 한 말, 한국어로 적으면 내가 한 말로 읽는다. 번역은 번역 앱에서 본 것을 옮겨 적는다(없으면 비운다).' }),
        el('label', { class: 'field' }, el('span', { class: 'label', text: '원문' }), orig),
        el('label', { class: 'field' }, el('span', { class: 'label', text: '번역' }), trans),
        el('div', { class: 'field' }, el('span', { class: 'label', text: '누가 한 말' }), picks),
        el('div', { class: 'actions' }, el('button', { class: 'btn', type: 'button', text: '줄 넣기', onclick: add })));
    } else {
      const box = el('textarea', { rows: 7, maxlength: MAX_PASTE, placeholder: '번역 앱에서 복사한 대화를 여기에 붙여 넣는다', 'aria-label': '붙여 넣을 대화' });
      const split = () => {
        const got = splitPaste(box.value);
        if (got.kind === 'empty') { status.textContent = '대화 줄을 찾지 못했다. 글이 비었거나 시간 · 앱 이름뿐이다.'; return; }
        if (staged && staged.src === 'hand') { status.textContent = '손으로 넣은 줄이 있다. 먼저 저장하거나 비운다.'; return; }
        staged = { src: 'paste', ...got };
        status.textContent = got.kind === 'pairs' ? `${got.pairs.length}줄로 나눴다. 아래에서 확인하고 저장한다.` : '짝을 짓지 못해 한 덩어리로 두었다. 아래에서 확인한다.';
        drawStaged();
        stagedBox.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      };
      const paste = el('button', { class: 'btn ghost', type: 'button', text: '복사한 글 붙이기', onclick: async () => {
        try { box.value = (await navigator.clipboard.readText()).slice(0, MAX_PASTE); status.textContent = box.value ? '붙였다. "나누기"를 누른다.' : '복사한 글이 없다.'; } catch { status.textContent = '이 폰이 붙이기를 막았다. 칸을 길게 눌러 "붙여넣기"를 고른다.'; }
      } });
      panel = el('div', { class: 'block' },
        copyGuide(),
        el('label', { class: 'field' }, el('span', { class: 'label', text: '번역 앱의 대화 기록' }), box),
        el('div', { class: 'actions' }, el('button', { class: 'btn', type: 'button', text: '나누기', onclick: split }), paste));
    }
    modeBox.replaceChildren(el('div', { class: 'segs', role: 'group', 'aria-label': '대화 넣는 길' }, seg('listen', '듣기'), seg('paste', '붙여넣기'), seg('hand', '손으로')), panel);
  }

  // ── 이 회사에 남긴 대화 ──
  function drawList() {
    const talks = mine();
    const diary = getDiary();
    const items = talks.map((t) => {
      const linked = t.draftId && diary.find((e) => e.id === t.draftId);
      return el('li', { class: 'entry' },
        el('div', { class: 'name' }, `${t.date} · ${sourceKo(t.src) || '대화'} · ${countOf(t)}줄`, t.app ? el('span', { class: 'tag mint', text: t.app === 'papago' ? '파파고' : '구글 번역' }) : null),
        el('details', {},
          el('summary', { text: '대화 보기 (이 폰에만)' }),
          el('ol', { class: 'heard' }, t.kind === 'block'
            ? (t.lines || []).map((l) => el('li', {}, el('span', { lang: l.lang, text: l.text }), el('small', { text: l.lang === 'en' ? '영어' : '한국어' })))
            : (t.pairs || []).map((p) => el('li', {}, el('span', { class: 'tag', text: p.who === 'them' ? '상대' : '나' }), p.en ? el('span', { lang: 'en', text: p.en }) : null, p.ko ? el('small', { text: p.ko }) : null)))),
        el('div', { class: 'row-actions' },
          linked ? el('a', { href: `#/diary/edit/${linked.id}`, text: linked.draft ? '일기 초안 열기' : '일기 열기' }) : el('button', { class: 'linkish', type: 'button', text: '일기 초안 만들기', onclick: () => {
            const draft = draftFromTalk(t, today(), newId());
            if (!setDiary([...getDiary(), draft])) { status.textContent = '이 폰에 저장하지 못했다.'; return; }
            setTalks(getTalks().map((x) => (x.id === t.id ? { ...x, draftId: draft.id } : x)));
            go(`#/diary/edit/${draft.id}`);
          } }),
          el('button', { class: 'linkish', type: 'button', text: '대화 지우기', onclick: () => { setTalks(getTalks().filter((x) => x.id !== t.id)); drawList(); status.textContent = '대화를 지웠다. 일기는 그대로다.'; } })));
    });
    listBox.replaceChildren(el('section', { class: 'panel' },
      el('h2', { text: `이 회사와 한 대화 ${talks.length}개` }),
      items.length ? el('ul', { class: 'stack' }, items) : el('p', { class: 'note', text: '아직 없다. 위에서 넣는다.' }),
      el('p', { class: 'note', text: '대화는 이 폰에만 남는다. 일기를 파일로 내려받을 때 그 파일에 든 일기와 이어진 대화가 같이 들어간다. 녹음은 어느 때도 가지 않는다.' })));
  }

  nameBox.addEventListener('change', drawList);
  drawMode();
  drawList();

  const open = translatorButton({ getText: () => '', label: '번역 앱 열기', cls: 'btn' });
  return el('div', { class: 'page' },
    el('section', { class: 'panel' },
      el('h1', {}, '대화', company.name ? ` · ${company.name}` : ''),
      el('p', { class: 'lead', text: '이 회사와 한 대화를 넣는다. 번역은 번역 앱으로 하고, 대화 기록을 여기에 붙여 넣는다. 넣은 대화는 일기 초안이 된다.' }),
      company.id ? (company.booth ? el('p', { class: 'note', text: `부스 ${company.booth.split('@')[0]}` }) : null) : el('label', { class: 'field' }, el('span', { class: 'label', text: '회사' }), nameBox),
      el('div', { class: 'actions' }, open.button, el('a', { class: 'btn ghost', href: `#/ask${company.id ? `/${encodeURIComponent(company.id)}` : ''}`, text: '물어볼 말' })),
      open.note),
    el('section', { class: 'panel' }, el('h2', { text: '대화 넣기' }), modeBox, status),
    stagedBox,
    listBox);
}
