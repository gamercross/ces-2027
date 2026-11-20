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

const SETTINGS_DEFAULT = { companyIntro: 'link-only', collector: 'undecided', collectorUrl: '', codysseyIcon: false, privateOn: null };

export const getSettings = () => cached('settings', () => getJson('data/settings.json').catch(() => SETTINGS_DEFAULT));
export const getInfo = () => cached('info', () => getJson('data/info.json'));
// 전시사 자료 요약. 받지 못한 날은 null.
export const getMeta = () => cached('meta', () => getJson('data/meta.json').catch(() => null));
export const getPlaces = () => cached('places', () => getJson('data/places.json'));
export const getExhibitors = () => cached('exhibitors', () => getJson('data/exhibitors.json'));
export const getCategories = () => cached('categories', () => getJson('data/categories.json'));
// 팀이 같이 쓰는 주제. 없거나 비어 있으면 각자 만든다.
export const getTeamTopics = () => cached('teamTopics', () => getJson('data/topics.json').catch(() => ({ topics: [] })));

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
