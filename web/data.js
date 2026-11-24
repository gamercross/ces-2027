// 자료를 읽는 곳. 한 번 읽은 것은 다시 읽지 않는다. 큰 것(전시사 · 색인 · 코어)은 쓸 때만 읽는다.

const once = new Map();
function cached(key, make) {
  if (!once.has(key)) {
    once.set(key, make().catch((e) => { once.delete(key); throw e; }));
  }
  return once.get(key);
}

async function getJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path} ${res.status}`);
  return res.json();
}

const SETTINGS_DEFAULT = { companyIntro: 'link-only', companyImage: true, collector: 'file', collectorUrl: '', codysseyIcon: false, privateOn: null, speech: 'on-device', homeTip: 'card' };

export const getSettings = () => cached('settings', () => getJson('data/settings.json').catch(() => SETTINGS_DEFAULT));
export const getInfo = () => cached('info', () => getJson('data/info.json'));
// 전시사 자료 요약. 받지 못한 날은 null.
export const getMeta = () => cached('meta', () => getJson('data/meta.json').catch(() => null));
export const getPlaces = () => cached('places', () => getJson('data/places.json'));
export const getExhibitors = () => cached('exhibitors', () => getJson('data/exhibitors.json'));
// 홀 하나의 전시사 줄(지도가 가까이 갈 때 받는다). 없으면 null — 그때는 전체를 쓴다.
const hallDocs = new Map();
export const getHall = (k) => { if (!hallDocs.has(k)) hallDocs.set(k, getJson(`data/halls/${k}.json`).catch(() => null)); return hallDocs.get(k); };
export const getCategories = () => cached('categories', () => getJson('data/categories.json'));
// 정식 배치도에서 옮긴 부스 자리. 없거나 비어 있으면 모든 자리가 짐작이다.
export const getOfficialSpots = () => cached('officialSpots', () => getJson('data/booth-spots.json').catch(() => ({ places: {} })));
export const getIndoorPaths = () => cached('indoorPaths', () => getJson('data/indoor-paths-guess.json'));
export const getTransit = () => cached('transit', () => getJson('data/transit.json'));

// 찾기: 코어(WASM) + 색인 + 전시사 + 장소 이름.
export const getFinder = () => cached('finder', async () => {
  const { loadCore } = await import('./core.js');
  const [core, index, data, places] = await Promise.all([
    loadCore(fetch('core.wasm')),
    fetch('data/search-index.txt').then((r) => { if (!r.ok) throw new Error('색인'); return r.arrayBuffer(); }),
    getExhibitors(),
    getPlaces(),
  ]);
  core.loadIndex(new Uint8Array(index));
  return { core, data, placeKo: new Map(places.places.map((p) => [p.k, p.ko])) };
});
// 세션 일정(공식 일정에서 받아 둔 것). 쓸 수 없는 꼴이면 읽지 못한 것으로 친다.
export const getSessions = () => cached('sessions', async () => {
  const { clean } = await import('./sessions.js');
  const doc = clean(await getJson('data/sessions.json'));
  if (!doc) throw new Error('data/sessions.json을 쓸 수 없다');
  return doc;
});
