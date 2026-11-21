// 주제 판 (출발 전 판): 올해의 IT 주제를 10개까지 정하고, 주제마다 볼 회사와 네 태그 칸을 적는다.
// 후보는 공식 분야와 혁신상으로 뽑아 주지만, 주제를 정하는 것은 사람이다. 폰에만 남는다.

import { el, num } from '../dom.js';
import { getCategories, getExhibitors, getMeta, getPlaces, getTeamTopics } from '../data.js';
import { companyRow } from '../company.js';
import { getProfile, getTopics, hasInterest, setTopics, tagKo, TAGS, toggleInterest } from '../store.js';
import { boardMarkdown, candidates, fromTeam, MAX_TOPICS, newTopic, pinned, suggestions } from '../topics.js';

const today = () => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
  const a = el('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// 주제 하나를 고쳐서 남긴다.
function update(id, change) {
  setTopics(getTopics().map((t) => (t.id === id ? change({ ...t, notes: { ...t.notes } }) : t)));
}

async function listPage(go) {
  const [data, table, places, team] = await Promise.all([getExhibitors(), getCategories(), getPlaces(), getTeamTopics()]);
  const placeKo = new Map(places.places.map((p) => [p.k, p.ko]));
  const holder = el('div', { class: 'page' });
  const status = el('p', { class: 'note', role: 'status' });

  function add(topic) {
    const list = getTopics();
    if (list.length >= MAX_TOPICS) { status.textContent = `주제는 ${MAX_TOPICS}개까지다. 하나를 지우고 넣는다.`; return false; }
    setTopics([...list, topic]);
    return true;
  }

  function draw() {
    const topics = getTopics();
    const profile = getProfile();
    const cands = candidates(data, table, profile?.tag, topics);
    const teamNew = fromTeam(team, topics, data);
    const name = el('input', { maxlength: 40, placeholder: '예: AI 에이전트', 'aria-label': '새 주제 이름' });
    const own = el('form', { class: 'inline' }, el('label', { class: 'field' }, name), el('button', { class: 'btn ghost', type: 'submit', text: '주제로' }));
    own.addEventListener('submit', (ev) => {
      ev.preventDefault();
      if (!name.value.trim()) { name.focus(); return; }
      const topic = newTopic(name.value);
      if (add(topic)) go(`#/topics/${topic.id}`);
    });
    const md = () => boardMarkdown(getTopics(), data, placeKo, TAGS, today());

    holder.replaceChildren(...[
      el('section', { class: 'panel' },
        el('h1', { text: '주제 판' }),
        el('p', { class: 'lead', text: `가기 전에 올해 볼 주제를 ${MAX_TOPICS}개까지 정하고, 주제마다 볼 회사와 "누구에게 무엇이 달라지나"를 적는다. 이 판은 이 폰에만 남는다.` }),
        el('p', { class: 'note', text: `주제 ${topics.length}개 · 볼 회사 ${topics.reduce((a, t) => a + pinned(t, data).length, 0)}곳` }),
        status),
      topics.length ? el('section', { class: 'panel' },
        el('h2', { text: '내 주제' }),
        el('ol', { class: 'stack' }, topics.map((t, n) => {
          const filled = TAGS.filter((tag) => (t.notes?.[tag.k] || '').trim()).length;
          return el('li', { class: 'entry' },
            el('a', { class: 'topic-link', href: `#/topics/${t.id}` },
              el('span', { class: 'no', text: String(n + 1) }),
              el('span', { class: 'topic-name' }, el('b', { text: t.name || '이름 없는 주제' }),
                el('small', { text: `${t.cats.map((c) => table.ko[c] || c).join(' · ') || '분야를 고르지 않음'} · 볼 회사 ${pinned(t, data).length}곳 · 네 칸 가운데 ${filled}칸 적음` }))));
        }))) : null,
      teamNew.length ? el('section', { class: 'panel' },
        el('h2', { text: '팀 주제' }),
        el('p', { class: 'note', text: `팀이 같이 정한 주제 가운데 내 판에 없는 것이 ${teamNew.length}개 있다.` }),
        el('div', { class: 'actions' }, el('button', { class: 'btn', type: 'button', text: `팀 주제 ${teamNew.length}개 가져오기`, onclick: () => { setTopics([...getTopics(), ...teamNew]); status.textContent = `팀 주제 ${teamNew.length}개를 가져왔다.`; draw(); } }))) : null,
      el('section', { class: 'panel' },
        el('h2', { text: '주제 더하기' }),
        own,
        el('p', { class: 'note', text: `아래는 후보다: CES 공식 분야를${profile?.tag ? ` ${tagKo(profile.tag)}에게 맞는 것 먼저${table.audiencesDraft ? '(초안)' : ''}, 그다음` : ''} 혁신상이 많은 차례로 세웠다. 누르면 그 분야가 주제가 되고, 이름과 분야는 안에서 고칠 수 있다.` }),
        el('div', { class: 'fields' }, cands.slice(0, 16).map((c) => el('button', { class: c.mine ? 'field-link mine' : 'field-link', type: 'button', onclick: () => {
          const topic = newTopic(c.ko, [c.cat]);
          if (add(topic)) { status.textContent = `"${c.ko}"를 주제로 넣었다.`; draw(); }
        } }, el('span', { text: c.ko }), el('small', { text: `혁신상 ${c.awards} · ${num(c.count)}곳` }))))),
      el('div', { class: 'dock' },
        el('button', { class: 'btn', type: 'button', text: '출발 전 판 복사', disabled: topics.length === 0, onclick: async () => {
          try { await navigator.clipboard.writeText(md()); status.textContent = '출발 전 판을 글(마크다운)로 복사했다. 내 노트에 붙여 넣을 수 있다.'; } catch { status.textContent = '복사하지 못했다. "파일로"를 쓴다.'; }
        } }),
        el('button', { class: 'btn ghost', type: 'button', text: '파일로', disabled: topics.length === 0, onclick: () => { download(`ces2027-출발전판-${today()}.md`, md()); status.textContent = '출발 전 판을 파일로 내려받았다.'; } })),
    ].filter(Boolean));
  }
  draw();
  return holder;
}

async function topicPage(id, go) {
  const [data, table, places] = await Promise.all([getExhibitors(), getCategories(), getPlaces()]);
  const placeKo = new Map(places.places.map((p) => [p.k, p.ko]));
  const holder = el('div', { class: 'page' });
  const status = el('p', { class: 'note', role: 'status' });
  const find = () => getTopics().find((t) => t.id === id);
  if (!find()) { go('#/topics'); return holder; }

  // 회사 한 줄에 "주제에 넣기 / 빼기"를 더한다. 넣으면 관심에도 들어가 동선으로 이어진다.
  function row(r, isPinned) {
    const li = companyRow(r, data, placeKo);
    const button = el('button', { class: 'pick', type: 'button', text: isPinned ? '주제에서 빼기' : '주제에 넣기', 'aria-label': `${r[1]} ${isPinned ? '이 주제에서 빼기' : '이 주제에 넣기'}`, onclick: () => {
      update(id, (t) => ({ ...t, ex: isPinned ? t.ex.filter((x) => x !== r[0]) : [...t.ex.filter((x) => x !== r[0]), r[0]] }));
      if (!isPinned && !hasInterest(r[0])) toggleInterest(r[0]);
      status.textContent = isPinned ? '주제에서 뺐다. 관심에는 그대로 있다.' : '주제에 넣었다. 관심에도 넣어서 동선에 나온다.';
      draw();
    } });
    li.querySelector('.row-actions').prepend(button);
    return li;
  }

  let shown = 10;
  function draw() {
    const t = find();
    if (!t) { go('#/topics'); return; }
    const mine = pinned(t, data);
    const { awards, others } = suggestions(t, data);

    const name = el('input', { maxlength: 40, value: t.name, 'aria-label': '주제 이름' });
    name.addEventListener('change', () => { update(id, (x) => ({ ...x, name: name.value.trim().slice(0, 40) })); status.textContent = '이름을 고쳤다.'; });

    const catBoxes = table.groups.map((g) => el('div', { class: 'block' },
      el('h3', { text: g.ko }),
      el('div', { class: 'toggles' }, g.cats.filter((c) => data.cats.includes(c)).map((c) => {
        const box = el('input', { type: 'checkbox', checked: t.cats.includes(c) });
        box.addEventListener('change', () => {
          update(id, (x) => ({ ...x, cats: box.checked ? [...x.cats.filter((y) => y !== c), c] : x.cats.filter((y) => y !== c) }));
          shown = 10;
          draw();
        });
        return el('label', { class: 'toggle' }, box, el('span', { text: table.ko[c] || c }));
      }))));

    const notes = TAGS.map((tag) => {
      const area = el('textarea', { rows: 2, maxlength: 300, placeholder: '달라지는 것 · 해 볼 것 하나' });
      area.value = t.notes?.[tag.k] || '';
      area.addEventListener('change', () => { update(id, (x) => ({ ...x, notes: { ...x.notes, [tag.k]: area.value.trim() } })); status.textContent = `${tag.ko} 칸을 남겼다.`; });
      return el('label', { class: 'field' }, el('span', { class: 'label', text: tag.ko }), area);
    });

    const more = el('button', { class: 'btn ghost wide', type: 'button', text: `더 보기 (${awards.length - shown}곳 남음)`, hidden: shown >= awards.length, onclick: () => { shown += 10; draw(); } });

    holder.replaceChildren(
      el('section', { class: 'panel form' },
        el('p', {}, el('a', { href: '#/topics', text: '주제 판' })),
        el('label', { class: 'field' }, el('span', { class: 'label', text: '주제' }), name),
        el('p', { class: 'note', text: t.cats.length ? `분야: ${t.cats.map((c) => table.ko[c] || c).join(' · ')}` : '분야를 고르지 않았다. 분야를 고르면 볼 회사 후보가 나온다.' }),
        el('details', { class: 'more' }, el('summary', { text: '분야 고치기' }), ...catBoxes),
        status),
      el('section', { class: 'panel form' },
        el('h2', { text: '누구에게 무엇이 달라지나' }),
        el('p', { class: 'note', text: '칸마다 한두 줄. 가기 전에는 생각을, 다녀와서는 본 것으로 고친다.' }),
        ...notes),
      el('section', { class: 'panel' },
        el('h2', { text: `볼 회사 ${mine.length}곳` }),
        mine.length ? el('ol', { class: 'hits' }, mine.map((r) => row(r, true))) : el('p', { class: 'note', text: '아직 없다. 아래 후보에서 넣거나, 회사 화면에서 찾아 관심에 넣는다.' })),
      el('section', { class: 'panel' },
        el('h2', { text: `후보: 혁신상을 받은 회사 ${awards.length}곳` }),
        t.cats.length
          ? el('p', { class: 'note', text: `이 주제의 분야에서 혁신상을 받은 곳이다(최고 혁신상 먼저). 혁신상이 없는 회사는 ${num(others)}곳 더 있다.` })
          : el('p', { class: 'note', text: '분야를 고르면 후보가 나온다.' }),
        el('ol', { class: 'hits' }, awards.slice(0, shown).map((r) => row(r, false))),
        more,
        t.cats.length ? el('div', { class: 'fields' }, t.cats.map((c) => el('a', { class: 'field-link', href: `#/find/c/${data.cats.indexOf(c)}` }, el('span', { text: `${table.ko[c] || c} 회사 모두` }), el('small', { text: '보기' })))) : null),
      el('section', { class: 'panel' },
        el('button', { class: 'linkish', type: 'button', text: '이 주제 지우기', onclick: () => { setTopics(getTopics().filter((x) => x.id !== id)); go('#/topics'); } }),
        el('p', { class: 'note', text: '주제를 지워도 관심과 동선은 그대로다.' })));
  }
  draw();
  return holder;
}

export async function render({ rest, go }) {
  const meta = await getMeta();
  if (!meta) return el('section', { class: 'panel' }, el('h1', { text: '주제 판' }), el('p', { text: '전시사 자료를 아직 받지 못했다.' }));
  return rest[0] ? topicPage(rest[0], go) : listPage(go);
}
