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

// 알림을 누르면 앱을 앞으로 가져와 그 화면을 연다 (열려 있지 않으면 새로 연다).
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const hash = event.notification.data?.hash || '#/';
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of all) {
      if ('focus' in client) { await client.focus(); client.postMessage({ go: hash }); return; }
    }
    await self.clients.openWindow(`./${hash}`);
  })());
});

// 누를 때만 받는 것(폰 안 받아쓰기 모델의 실행기)은 미리 담지 않는다. 받아 둔 것이 있으면 그것을, 없으면 인터넷에서 준다.
const LAZY = ['vendor/'];

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin || !FILES.length) return;
  const inside = new URL(request.url).pathname.slice(new URL(self.registration.scope).pathname.length);
  if (LAZY.some((dir) => inside.startsWith(dir))) {
    event.respondWith(caches.match(request).then((hit) => hit || fetch(request)));
    return;
  }
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = (await cache.match(request, { ignoreSearch: true })) || (request.mode === 'navigate' ? await cache.match('./') : undefined);
    if (hit) return hit;
    return fetch(request);
  })());
});
