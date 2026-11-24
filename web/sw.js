// 서비스 워커: 한 번 열면 화면 · 코어 · 자료를 폰에 담아 두고, 다음부터는 인터넷 없이 연다.
// 새 판은 받아만 두고, 쓰는 판은 사용자가 "다시 열기"를 누를 때만 바꾼다(아래 "쓰는 판").
// 판 이름과 담아 둘 파일 목록은 지을 때 scripts/stamp.mjs가 채운다. 채우지 않은 채로는 아무것도 담지 않는다.
const VERSION = '__VERSION__';
const FILES = [/*__FILES__*/];
const PREFIX = 'ces2027-';
const CACHE = PREFIX + VERSION;

// ---- 쓰는 판 ----
// 새 판이 올라오면 새 담음(CACHE)에 통째로 받아 두지만, 화면에는 "쓰는 판"의 파일만 준다.
// 쓰는 판의 이름은 작은 담음(USE)에 적어 둔다. 앱을 껐다 켜도, 서비스 워커가 새로 바뀌어도 그대로다.
// 화면의 "새 판이 있다 · 다시 열기"를 누르면(web/offline.js의 reopen) 그때 쓰는 판을 새 판으로 바꾸고 옛 담음을 지운다.
// 그래서 전시장에서 앱이 저절로 다른 판으로 바뀌지 않는다. 새 판과 옛 조각이 섞일 일도 없다.
const USE = 'ces2027use';
let using = null; // 이 서비스 워커가 떠 있는 동안 외워 둔 쓰는 판의 담음 이름
async function readUse() {
  try {
    if (!(await caches.has(USE))) return null;
    const hit = await (await caches.open(USE)).match('use');
    const name = hit ? await hit.text() : '';
    return name.startsWith(PREFIX) && (await caches.has(name)) ? name : null;
  } catch { return null; }
}
async function writeUse(name) {
  await (await caches.open(USE)).put('use', new Response(name, { headers: { 'content-type': 'text/plain' } }));
  using = name;
}
// 쓰는 판의 담음 이름. 적어 둔 것이 없거나 그 담음이 사라졌으면 이 서비스 워커의 판이다.
async function inUse() {
  if (!using) using = (await readUse()) || CACHE;
  return using;
}
// 쓰는 판과 받아 둔 판 말고는 지운다(담다 끊겨 빈 껍데기로 남은 담음도 여기서 지워진다).
async function sweep() {
  const keep = new Set([CACHE, await inUse()]);
  const names = await caches.keys();
  await Promise.all(names.filter((name) => name.startsWith(PREFIX) && !keep.has(name)).map((name) => caches.delete(name)));
}

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
    // 쓰는 판을 적어 둔 적이 없으면(처음 깔렸거나, 이 장치를 넣기 전의 판에서 넘어왔으면) 이 판을 쓴다.
    // 적어 둔 것이 있으면 건드리지 않는다: 새 판은 받아만 둔다.
    if (!(await readUse())) await writeUse(CACHE);
    await sweep();
    await dropTranslation();
    await self.clients.claim();
  })());
});

// 화면이 묻는다(web/offline.js의 ask). 답은 같이 온 문(port)으로 돌려준다.
//   state: 받아 둔 판(latest)과 쓰는 판(using)의 이름. 둘이 다르면 화면이 "새 판이 있다"를 보인다.
//   use-latest: "다시 열기"를 눌렀다. 받아 둔 판이 다 담겨 있을 때만 쓰는 판을 바꾸고 옛 담음을 지운다.
self.addEventListener('message', (event) => {
  const what = event.data?.ces;
  const port = event.ports?.[0];
  if (!what || !port) return;
  event.waitUntil((async () => {
    try {
      if (what === 'use-latest' && (await caches.has(CACHE)) && (await (await caches.open(CACHE)).keys()).length >= FILES.length) {
        await writeUse(CACHE);
        await sweep();
      }
      port.postMessage({ latest: VERSION, using: (await inUse()).slice(PREFIX.length) });
    } catch (e) {
      port.postMessage({ error: String(e) });
    }
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
    const cache = await caches.open(await inUse());
    const hit = (await cache.match(request, { ignoreSearch: true })) || (request.mode === 'navigate' ? await cache.match('./') : undefined);
    if (hit) return hit;
    return fetch(request);
  })());
});
