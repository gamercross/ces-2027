// 설정의 내보내기 줄 둘: "갈 곳 목록"(문서 · 표 파일)과 "시간 · 일정 파일"(불러오기 · 내보내기).
// 2026-11-23에 갈 곳 탭의 "마크다운 · CSV"와 시간과 일정의 "파일" 칩에서 옮겼다(파일 꼴을 고르는 일은 설정 한 곳에서).
// 폰 안에서만 만든다. 전시사 자료는 첫 화면에 싣지 않으므로 단추를 누를 때 받는다.

import { el } from '../dom.js';
import { getExhibitors, getInfo, getMeta, getPlaces } from '../data.js';
import { getEvents, getHours, getInterests, getPace, setEvents, setHours, setPace } from '../store.js';
import { dayList, makeFile, mergeIn, readFile } from '../days.js';
import { planCsv, planMd } from '../share.js';
import { mergeMarks } from '../alerts.js';
import { getMarks, setMarks } from '../notify.js';

const pad = (n) => String(n).padStart(2, '0');
const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = el('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const line = (label, state, ...buttons) => el('li', { class: 'setrow' },
  el('div', { class: 'setrow-main' }, el('b', { text: label }), el('span', { class: 'setrow-state', text: state })),
  el('span', { class: 'setrow-btns' }, buttons));

// 갈 곳 목록: 날마다 회사 · 부스 · 장소를 문서(마크다운)나 표(CSV) 파일로.
function planRows() {
  const n = getInterests().length;
  const status = el('p', { class: 'setrow-hint', role: 'status', hidden: true });
  const say = (t) => { status.textContent = t; status.hidden = false; };
  const make = async (kind) => {
    try {
      const [data, places, info, meta] = await Promise.all([getExhibitors(), getPlaces(), getInfo(), getMeta().catch(() => null)]);
      const days = [...dayList(info).filter((d) => !d.pre).map((d) => ({ key: d.key, ko: `${d.ko} ${d.hours}`, short: d.ko.split(' ')[0] })), { key: 0, ko: '날짜 없음', short: '날짜 없음' }];
      const byId = new Map(data.ex.map((r) => [r[0], r]));
      const placeKo = new Map(places.places.map((p) => [p.k, p.ko]));
      const list = getInterests();
      if (kind === 'md') download(`ces2027-갈곳-${today()}.md`, planMd(list, days, byId, placeKo, meta?.v || data.v, today()), 'text/markdown;charset=utf-8');
      else download(`ces2027-갈곳-${today()}.csv`, planCsv(list, days, byId, placeKo, data), 'text/csv;charset=utf-8');
      say(`갈 곳 ${list.length}곳을 ${kind === 'md' ? '문서' : '표'} 파일로 내보냈다.`);
    } catch { say('목록을 만들지 못했다. 전시사 자료가 폰에 없을 수 있다.'); }
  };
  return [
    line('갈 곳 목록', n ? `${n}곳 · 날마다 회사와 부스` : '관심 회사가 아직 없다',
      el('button', { class: 'pick', type: 'button', text: '문서로', 'aria-label': '갈 곳 목록을 문서 파일(마크다운)로', disabled: n === 0, onclick: () => make('md') }),
      el('button', { class: 'pick', type: 'button', text: '표로', 'aria-label': '갈 곳 목록을 표 파일(CSV)로', disabled: n === 0, onclick: () => make('csv') })),
    el('li', { class: 'setrow-more' }, status),
  ];
}

// 시간 · 일정 파일: 한 사람이 내보내 단톡방에 올리면 나머지가 불러온다. 명함 넣는 부스 표시도 함께 간다. 레포에는 올리지 않는다.
function dayRows() {
  const status = el('p', { class: 'setrow-hint', role: 'status', hidden: true });
  const say = (t) => { status.textContent = t; status.hidden = false; };
  // 파일 고르는 칸은 "불러오기"를 누를 때 잠깐 만들고, 고르거나 그만두면 치운다(설정 줄 안에 두지 않는다).
  const load = async (file) => {
    const got = readFile(await file.text());
    if (!got.events.length && !Object.keys(got.hours).length && got.pace == null && !got.eventBooths.length) { say(`불러오지 못했다: ${got.problems.join(' · ') || '시간도 일정도 없다'}.`); return; }
    const merged = mergeIn({ hours: getHours(), events: getEvents() }, got);
    const marked = mergeMarks(getMarks(), got.eventBooths);
    if (marked.added) setMarks(marked.marks);
    setHours(merged.hours);
    setEvents(merged.events);
    if (got.pace) setPace(got.pace);
    say(`파일에서 시간 ${merged.hoursSet}일 · 일정 ${merged.added}개${marked.added ? ` · 명함 넣는 부스 ${marked.added}곳(팀이 표시)` : ''}를 넣었다${got.events.length - merged.added ? ` (이미 있는 ${got.events.length - merged.added}개는 건너뜀)` : ''}.${got.problems.length ? ` 뺀 것: ${got.problems.join(' · ')}.` : ''}`);
  };
  const choose = () => {
    document.getElementById('dayfile-pick')?.remove();
    const pick = el('input', { class: 'file-hidden', id: 'dayfile-pick', type: 'file', accept: '.json,application/json', 'aria-label': '시간 · 일정 파일 고르기', tabindex: '-1' });
    pick.addEventListener('change', () => { const file = pick.files?.[0]; pick.remove(); if (file) load(file); });
    pick.addEventListener('cancel', () => pick.remove());
    document.body.append(pick);
    pick.click();
  };
  return [
    line('시간 · 일정 파일', '팀이 올린 파일을 불러오거나 내 것을 내보낸다',
      el('button', { class: 'pick', type: 'button', text: '불러오기', 'aria-label': '시간 · 일정 파일 불러오기', onclick: choose }),
      el('button', { class: 'pick', type: 'button', text: '내보내기', 'aria-label': '내 시간 · 일정을 파일로 내보내기', onclick: () => {
        download(`ces2027-시간과일정-${today()}.json`, JSON.stringify(makeFile(getHours(), getEvents(), getPace(), getMarks()), null, 2), 'application/json;charset=utf-8');
        say('파일을 내려받았다. 단톡방으로 건넨다.');
      } })),
    el('li', { class: 'setrow-more' }, status),
  ];
}

export const fileRows = () => [...planRows(), ...dayRows()];
