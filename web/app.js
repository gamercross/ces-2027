// 첫 화면. 가볍게 연다: 자료 요약(meta.json)만 먼저 읽고,
// 찾기 자료(코어 · 색인 · 전시사 · 장소)는 찾기 칸을 누를 때 불러온다.

const $ = (id) => document.getElementById(id);
const num = (n) => Number(n).toLocaleString('ko-KR');

async function getJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path} ${res.status}`);
  return res.json();
}

async function showData() {
  let meta;
  try {
    meta = await getJson('data/meta.json');
  } catch {
    $('data-line').textContent = '전시사 자료를 아직 받지 못했다.';
    return;
  }
  $('data-line').textContent = `전시사 ${num(meta.exhibitors)}곳 · 분야 ${num(meta.categories)}개 · 한국 ${num(meta.korea)}곳`;
  $('data-date').textContent = meta.v;
  $('data-guess').textContent = meta.places.boothSpotsGuess > 0
    ? `홀 안 자리는 짐작이다 (공식 캠퍼스 지도 ${meta.places.edition}판, 정식 배치도 전)`
    : `공식 배치도 (${meta.places.edition}판)`;
  $('data-facts').hidden = false;
  $('find').hidden = false;
}

let ready = null;
function loadFind() {
  ready ??= (async () => {
    const { loadCore } = await import('./core.js');
    const [core, index, data, places] = await Promise.all([
      loadCore(fetch('core.wasm')),
      fetch('data/search-index.txt').then((r) => r.arrayBuffer()),
      getJson('data/exhibitors.json'),
      getJson('data/places.json'),
    ]);
    core.loadIndex(new Uint8Array(index));
    const placeKo = new Map(places.places.map((p) => [p.k, p.ko]));
    return { core, data, placeKo };
  })();
  return ready;
}

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

function renderHit(row, data, placeKo) {
  const [id, name, , country, , award, , booths] = row;
  const li = el('li');
  const head = el('div', 'name', name);
  if (award) head.append(el('span', 'badge', award & 2 ? '최고 혁신상' : '혁신상'));
  const where = booths.map((b) => {
    const at = b.lastIndexOf('@');
    const place = b.slice(at + 1);
    return `${b.slice(0, at)} · ${placeKo.get(place) || '장소 모름'}`;
  });
  if (country >= 0) where.push(data.countries[country]);
  const link = el('a', '', '공식 전시사 페이지');
  link.href = data.link.replace('{id}', encodeURIComponent(id));
  link.rel = 'noopener';
  li.append(head, el('div', 'where', where.join(' / ')), link);
  return li;
}

let turn = 0;
async function find() {
  const mine = ++turn;
  const q = $('q').value.trim();
  const note = $('find-note');
  let got;
  try {
    got = await loadFind();
  } catch {
    note.textContent = '찾기 자료를 불러오지 못했다. 인터넷을 확인하고 다시 눌러 본다.';
    ready = null;
    return;
  }
  if (mine !== turn) return;
  const { core, data, placeKo } = got;
  const rows = q ? core.search(q, 30) : [];
  $('hits').replaceChildren(...rows.map((i) => renderHit(data.ex[i], data, placeKo)));
  note.textContent = !q ? '이름 · 분야 · 부스 번호 · 장소로 찾는다.' : rows.length ? `${rows.length === 30 ? '먼저 30곳' : `${rows.length}곳`}. 부스 자리는 짐작이다.` : '맞는 회사가 없다.';
}

$('q').addEventListener('focus', () => { loadFind().catch(() => { ready = null; }); }, { once: true });
$('q').addEventListener('input', find);
showData();
