// 서비스 워커: 한 번 열면 화면 · 코어 · 자료를 폰에 담아 두고, 다음부터는 인터넷 없이 연다.
// 판 이름과 담아 둘 파일 목록은 지을 때 scripts/stamp.mjs가 채운다. 채우지 않은 채로는 아무것도 담지 않는다.
const VERSION = '__VERSION__';
const FILES = [/*__FILES__*/];
const PREFIX = 'ces2027-';
const CACHE = PREFIX + VERSION;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // 브라우저가 들고 있던 옛 것 말고 새로 받아 담는다.
    await cache.addAll(FILES.map((path) => new Request(path, { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith(PREFIX) && name !== CACHE).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin || !FILES.length) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = (await cache.match(request, { ignoreSearch: true })) || (request.mode === 'navigate' ? await cache.match('./') : undefined);
    if (hit) return hit;
    return fetch(request);
  })());
});
