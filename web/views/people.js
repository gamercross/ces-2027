// 남의 명함 받기 · 만난 사람: 남의 QR을 카메라로 읽거나 주소를 손으로 넣어 "만난 사람"으로 폰에만 남긴다.
// 카메라는 이 화면에서 단추를 눌렀을 때만 켠다. 화면을 떠나면 꺼진다(scan.js). 밖으로 보내지 않고, 일기 보내기 묶음에도 들어가지 않는다.

import { el, out } from '../dom.js';
import { getExhibitors } from '../data.js';
import { getInterests } from '../store.js';
import { cameraSupport, envOf, startScan } from '../scan.js';
import { kindKo, parseScan, removePerson, safeHref, upsert } from '../people.js';
import { getPeople, setPeople } from '../people-store.js';

const today = () => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
const nameOf = (p) => p.nick || p.links[0]?.label || '이름 없음';
const field = (label, input, hint) => el('label', { class: 'field' }, el('span', { class: 'label', text: label }), input, hint && el('span', { class: 'hint', text: hint }));

export async function render() {
  const data = await getExhibitors().catch(() => null);
  const byId = new Map((data?.ex || []).map((r) => [r[0], r]));
  const companies = getInterests().map((it) => byId.get(it.id)).filter(Boolean).map((r) => ({ id: r[0], name: r[1], booth: r[7][0] || '' }));
  const holder = el('div');
  let scanner = null;
  const stopCam = () => { if (scanner) { scanner.stop(); scanner = null; } };

  // ---- 목록 ----
  function list(message) {
    stopCam();
    const people = getPeople().sort((a, b) => (b.met || '').localeCompare(a.met || ''));
    const status = el('p', { class: 'note', role: 'status', text: message || '' });
    const rows = people.map((p) => {
      const del = el('button', { class: 'linkish', type: 'button', text: '지우기' });
      del.addEventListener('click', () => {
        if (del.dataset.ask) {
          setPeople(removePerson(getPeople(), p.id));
          list(`${nameOf(p)} 님을 지웠다.`);
          return;
        }
        del.dataset.ask = '1';
        del.textContent = '정말 지우기';
        setTimeout(() => { if (del.isConnected) { delete del.dataset.ask; del.textContent = '지우기'; } }, 4000);
      });
      const diaryHref = p.exId ? `#/diary/new/${encodeURIComponent(p.exId)}` : p.company ? `#/diary/new/n:${encodeURIComponent(p.company)}` : '';
      return el('li', { class: 'entry' },
        el('div', { class: 'name' }, nameOf(p), p.company ? el('span', { class: 'tag', text: p.company }) : null, p.met ? el('span', { class: 'tag mint', text: p.met }) : null),
        p.links.length ? el('ul', { class: 'stack' }, p.links.map((l) => el('li', {}, linkNode(l)))) : null,
        p.booth ? el('p', { class: 'note', text: `부스 ${p.booth}` }) : null,
        p.note ? el('p', { text: p.note }) : null,
        el('div', { class: 'row-actions' },
          el('button', { class: 'linkish', type: 'button', text: '고치기', onclick: () => form(p) }),
          del,
          diaryHref ? el('a', { href: diaryHref, text: `${p.company} 일기 쓰기` }) : null));
    });
    holder.replaceChildren(el('div', { class: 'page' },
      el('section', { class: 'panel' },
        el('h1', { text: '만난 사람' }),
        el('p', { class: 'lead', text: '남의 명함 QR을 읽거나 주소를 적어 남긴다. 이 폰에만 남고 밖으로 보내지 않는다. 일기를 보낼 때도 들어가지 않는다.' }),
        el('p', { class: 'note', text: `만난 사람 ${people.length}명` }),
        status),
      people.length
        ? el('section', { class: 'panel' }, el('ul', { class: 'stack' }, rows))
        : el('section', { class: 'panel' }, el('p', { class: 'note', text: '아직 없다. 아래 단추로 첫 사람을 남긴다.' })),
      el('div', { class: 'dock' },
        el('button', { class: 'btn', type: 'button', text: '남의 명함 받기', onclick: () => form(null) }),
        el('a', { class: 'btn ghost', href: '#/card', text: '내 명함' }))));
    window.scrollTo(0, 0);
  }

  // ---- 받기 · 고치기 ----
  function form(person) {
    stopCam();
    const d = person ? { ...person, links: [...person.links] } : { id: '', nick: '', links: [], met: today(), company: '', exId: '', booth: '', note: '' };
    const links = d.links;

    const nick = el('input', { name: 'nick', maxlength: 20, autocomplete: 'off', placeholder: '내가 부르는 이름', value: d.nick });
    const date = el('input', { type: 'date', name: 'met', value: d.met || today() });
    const known = companies.find((c) => c.id === d.exId);
    const pick = el('select', { name: 'company' },
      el('option', { value: '', text: companies.length ? '관심 회사에서 고른다' : '관심 회사가 없다' }),
      !known && d.exId ? el('option', { value: d.exId, selected: true, text: d.company || d.exId }) : null,
      companies.map((c) => el('option', { value: c.id, selected: c.id === d.exId, text: c.name })));
    const other = el('input', { name: 'other', maxlength: 80, placeholder: '목록에 없으면 회사 이름을 적는다', value: d.exId ? '' : d.company });
    const note = el('textarea', { name: 'note', rows: 3, maxlength: 200, placeholder: '한 줄 메모 (무슨 이야기를 했나)' });
    note.value = d.note || '';
    const error = el('p', { class: 'error', role: 'alert', hidden: true });

    // 주소 칸
    const chips = el('ul', { class: 'stack', 'aria-label': '읽은 주소' });
    const addStatus = el('p', { class: 'note', role: 'status' });
    function drawLinks() {
      chips.replaceChildren(...links.map((l, i) => el('li', { class: 'entry link-row' },
        el('span', { class: 'link-text' }, el('b', { text: kindKo(l.kind) }), ` ${l.label}`),
        el('button', { class: 'linkish', type: 'button', 'aria-label': `${l.label} 빼기`, text: '빼기', onclick: () => { links.splice(i, 1); drawLinks(); } }))));
      if (!links.length) chips.replaceChildren(el('li', { class: 'note', text: '아직 읽은 주소가 없다.' }));
    }
    const addLink = (text, hint, by) => {
      const r = parseScan(text, hint);
      if (!r.ok) { addStatus.textContent = `${by}: ${r.why}`; return false; }
      if (links.some((l) => l.key === r.link.key)) { addStatus.textContent = `이미 넣었다: ${r.link.label}`; return true; }
      links.push(r.link);
      drawLinks();
      addStatus.textContent = `${by === '카메라' ? '읽었다' : '넣었다'}: ${kindKo(r.link.kind)} ${r.link.label}`;
      return true;
    };

    // 손으로 넣기
    const addr = el('input', { name: 'addr', maxlength: 300, autocapitalize: 'off', autocomplete: 'off', spellcheck: 'false', inputmode: 'url', placeholder: '주소나 아이디', 'aria-label': '주소나 아이디' });
    const hint = el('select', { 'aria-label': '아이디만 적었을 때' },
      el('option', { value: 'github', text: '아이디면 깃허브' }), el('option', { value: 'discord', text: '아이디면 디스코드' }));
    const addByHand = () => { if (addLink(addr.value, hint.value, '손으로')) addr.value = ''; };
    addr.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); addByHand(); } });

    // 카메라로 읽기
    const can = cameraSupport(envOf(window));
    const video = el('video', { class: 'scan-video', playsinline: true, muted: true, hidden: true, 'aria-label': '카메라 화면' });
    const camNote = el('p', { class: can.ok ? 'note' : 'note warn', role: 'status', text: can.ok ? '카메라는 단추를 누를 때만 켠다. 상대의 QR을 화면 가운데에 둔다.' : `이 폰에서는 카메라로 읽을 수 없다. ${can.why} 아래 "손으로 넣기"를 쓴다.` });
    const camBtn = el('button', { class: 'btn', type: 'button', text: '카메라로 읽기', disabled: !can.ok });
    async function toggleCam() {
      if (scanner) { stopCam(); video.hidden = true; camBtn.textContent = '카메라로 읽기'; camNote.textContent = '카메라를 껐다.'; return; }
      camBtn.disabled = true;
      camNote.textContent = '카메라를 켜는 중이다. 권한을 물으면 허용한다.';
      video.hidden = false;
      const r = await startScan(video, (text) => { addLink(text, 'auto', '카메라'); camNote.textContent = addStatus.textContent; });
      camBtn.disabled = false;
      if (!r.ok) {
        video.hidden = true;
        camNote.className = 'note warn';
        camNote.textContent = `${r.why} 아래 "손으로 넣기"로 이어서 적는다.`;
        return;
      }
      scanner = r;
      camBtn.textContent = '그만 읽기';
      camNote.className = 'note';
      camNote.textContent = '읽는 중이다. 읽으면 아래 주소에 들어간다. 다 읽었으면 그만 읽기를 누른다.';
    }
    camBtn.addEventListener('click', toggleCam);
    drawLinks();

    const node = el('form', { class: 'panel form', novalidate: true },
      el('h1', { text: person ? '만난 사람 고치기' : '남의 명함 받기' }),
      el('p', { class: 'lead', text: '남의 QR을 읽거나 주소를 적는다. 깃허브 · 디스코드 · 링크드인 · 웹 주소(https)를 받는다. 이 폰에만 남는다.' }),
      el('h2', { text: '카메라로 읽기' }), camNote, camBtn, video,
      el('h2', { text: '손으로 넣기' }),
      el('p', { class: 'note', text: '주소를 적거나 붙여 넣는다. 아이디만 적으면 오른쪽 고름대로 본다.' }),
      el('div', { class: 'inline' }, addr, hint),
      el('button', { class: 'btn ghost', type: 'button', text: '주소 더하기', onclick: addByHand }),
      el('h2', { text: '읽은 주소' }), chips, addStatus,
      el('h2', { text: '이 사람' }),
      field('별명', nick, '내가 부르는 이름이다. 비워 두면 주소로 보인다.'),
      field('만난 날', date),
      field('어디서', pick), field('', other),
      field('한 줄 메모', note),
      error,
      el('div', { class: 'dock' },
        el('button', { class: 'btn', type: 'submit', text: '폰에 남기기' }),
        el('button', { class: 'btn ghost', type: 'button', text: '그만두기', onclick: () => list() })));

    node.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const fail = (msg, input) => { error.textContent = msg; error.hidden = false; input?.focus(); };
      // 주소 칸에 적다 만 것이 있으면 같이 넣는다.
      if (addr.value.trim() && !addLink(addr.value, hint.value, '손으로')) return fail('주소 칸의 글을 고치거나 비운다.', addr);
      if (!links.length) return fail('주소를 하나 이상 넣는다 (카메라로 읽거나 손으로 적는다).', addr);
      if (!/^\d{4}-\d\d-\d\d$/.test(date.value)) return fail('만난 날을 고른다.', date);
      const chosen = companies.find((c) => c.id === pick.value);
      const keep = !chosen && pick.value && pick.value === d.exId;
      const company = chosen ? chosen.name : keep ? d.company : other.value.trim();
      const result = upsert(getPeople(), {
        id: d.id, nick: nick.value, links, met: date.value, company,
        exId: chosen ? chosen.id : keep ? d.exId : '',
        booth: chosen ? chosen.booth : keep ? d.booth : '',
        note: note.value,
      });
      if (!setPeople(result.list)) return fail('이 폰에 저장하지 못했다. 사생활 보호 창이면 보통 창으로 다시 연다.');
      const who = nameOf(result.person);
      list(result.merged ? `${who} 님을 남겼다. 같은 주소를 가진 사람 ${result.merged}명과 한 사람으로 합쳤다.` : `${who} 님을 폰에 남겼다.`);
    });
    holder.replaceChildren(el('div', { class: 'page' }, node));
    window.scrollTo(0, 0);
  }

  list('');
  return holder;
}

// 저장해 둔 주소를 열 때도 https인지 다시 본다. 새 창으로 열고 연 쪽을 넘기지 않는다.
function linkNode(l) {
  const href = safeHref(l.url);
  if (!href) return el('span', { class: 'link-text' }, el('b', { text: kindKo(l.kind) }), ` ${l.label}`);
  return out(href, `${kindKo(l.kind)} ${l.label}`, 'link-text');
}
