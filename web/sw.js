// 서비스 워커: 한 번 열면 화면 · 코어 · 자료를 폰에 담아 두고, 다음부터는 인터넷 없이 연다.
// 판 이름과 담아 둘 파일 목록은 지을 때 scripts/stamp.mjs가 채운다. 채우지 않은 채로는 아무것도 담지 않는다.
const VERSION = '__VERSION__';
const FILES = [/*__FILES__*/];
const PREFIX = 'ces2027-';
const CACHE = PREFIX + VERSION;

// 2026-11-22에 지운 폰 안 영한 번역 모델이 폰에 남긴 것(약 250MB)을 비운다.
// 받아쓰기 모델의 파일은 건드리지 않는다: 번역 모델의 주소(opus-mt-en-ko)와 단어 사전(vendor/translate/)만 지운다.
const OLD_TRANSLATION = ['/opus-mt-en-ko', '/vendor/translate/'];
async function dropTranslation() {
  for (const name of ['ces2027keep-speech-v1', 'transformers-cache']) {
    try {
      if (!(await caches.has(name))) continue;
      const cache = await caches.open(name);
      for (const request of await cache.keys()) if (OLD_TRANSLATION.some((part) => request.url.includes(part))) await cache.delete(request);
    } catch { /* 지우지 못해도 앱은 그대로 쓴다 */ }
  }
}

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
    await dropTranslation();
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

// 앱 밖의 곳(보드 · 테스터 안내)은 담아 두지 않고, 앱 화면으로 돌려주지도 않는다. 그대로 인터넷에서 받는다.
const OUTSIDE = ['board/', 'testers/'];

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || !FILES.length) return;
  const inside = url.pathname.slice(new URL(self.registration.scope).pathname.length);
  if (OUTSIDE.some((dir) => inside === dir.slice(0, -1) || inside.startsWith(dir))) return;
// 누를 때만 받는 것(폰 안 받아쓰기 모델의 실행기)은 미리 담지 않는다. 받아 둔 것이 있으면 그것을, 없으면 인터넷에서 준다.
const LAZY = ['vendor/', 'data/logos.json'];

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
