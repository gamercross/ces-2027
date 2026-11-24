// 오프라인: 서비스 워커가 화면 · 코어 · 자료를 폰에 담아 둔다. 담겼는지와 판 이름을 여기서 안다.

export const offline = { ready: false, version: null, install: null, update: false };
const changed = () => window.dispatchEvent(new Event('ces-offline'));

if ('serviceWorker' in navigator) {
  // 새 판: 서비스 워커가 바뀌어 이 화면을 맡으면, 지금 열린 화면은 옛 판이다. "다시 열기"를 권한다.
  // (처음 깔릴 때도 맡는 일이 생기지만, 그때는 전에 맡던 것이 없으니 알리지 않는다.)
  let had = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (had) { offline.update = true; changed(); }
    had = true;
  });
  // 현장에서 낡은 판에 갇히지 않게: 화면으로 돌아올 때 새 판이 있는지 묻는다 (10분에 한 번까지).
  let asked = Date.now();
  document.addEventListener('visibilitychange', () => {
    if (document.hidden || Date.now() - asked < 10 * 60 * 1000) return;
    asked = Date.now();
    navigator.serviceWorker.getRegistration().then((reg) => reg?.update()).catch(() => {});
  });
  navigator.serviceWorker.ready.then(async () => {
    try {
      const res = await fetch('version.json');
      if (res.ok) {
        offline.version = (await res.json()).v;
        offline.ready = await caches.has(`ces2027-${offline.version}`);
      }
    } catch { /* 판 이름이 없으면 그대로 둔다 */ }
    changed();
  });
}

// 서비스 워커를 건다. 첫 화면이 그려진 뒤에 부른다: 폰에 담는 일(파일 서른몇 개)이 첫 화면과 회선을 다투지 않게.
let started = false;
export function startOffline() {
  if (started || !('serviceWorker' in navigator)) return;
  started = true;
  const go = () => navigator.serviceWorker.register('sw.js').catch(() => {});
  if ('requestIdleCallback' in window) requestIdleCallback(go, { timeout: 3000 }); else setTimeout(go, 1200);
}

// 홈 화면에 추가: 브라우저가 물어볼 수 있게 되면 단추를 보인다.
window.addEventListener('beforeinstallprompt', (ev) => {
  ev.preventDefault();
  offline.install = ev;
  changed();
});
window.addEventListener('appinstalled', () => { offline.install = null; changed(); });

// ---- 새 판으로 다시 열기 ----
// Safari(WebKit)는 화면을 다시 열 때 미리 받는 조각(app.js · store.js …)을 서비스 워커에 묻지 않고 메모리에 든 옛 것으로 쓴다.
// 그러면 새로 부르는 화면 조각(새 판)이 옛 조각을 만나 이름을 못 찾고 "화면을 불러오지 못했다"가 뜬다.
// 그래서 다시 열기 전에, 새 서비스 워커가 담아 둔 파일을 이 화면에서 한 번씩 받아 메모리의 것을 새 것으로 바꾼다(폰 안에서 받는 것이라 금방이다).
// index.html 맨 위의 작은 글도 같은 일을 한다(Safari의 새로 고침으로 열었을 때). 거기와 같은 열쇠(BOOT)를 쓴다.
const BOOT = 'ces2027.boot.v1';
async function controllerVersion() {
  const res = await fetch('version.json', { cache: 'reload' });
  return res.ok ? (await res.json()).v : null;
}
export async function freshen() {
  if (!('caches' in window) || !navigator.serviceWorker?.controller) return null;
  // 새 서비스 워커가 다 켜진 뒤에 받는다 (켜지는 중이면 잠깐 기다린다).
  const reg = await navigator.serviceWorker.getRegistration();
  const worker = reg?.active;
  if (worker && worker.state === 'activating') await new Promise((done) => { worker.addEventListener('statechange', done, { once: true }); setTimeout(done, 3000); });
  const v = await controllerVersion();
  if (!v || !(await caches.has(`ces2027-${v}`))) return null;
  const cache = await caches.open(`ces2027-${v}`);
  await Promise.all((await cache.keys()).map((request) => fetch(request.url, { cache: 'reload' }).catch(() => null)));
  try { localStorage.setItem(BOOT, `ces2027-${v}`); } catch { /* 막힌 폰이면 index.html이 한 번 더 받는다 */ }
  return v;
}
export async function reopen() {
  try { await freshen(); } catch { /* 못 받아도 다시 연다 */ }
  location.reload();
}
// 화면 조각을 못 불러왔을 때: 판이 섞인 탓이면(새 판이 깔렸거나 이름을 못 찾는 오류) 새로 받아 한 번만 저절로 다시 연다.
// 같은 판에서 두 번 하지 않는다(진짜 고장이면 "화면을 불러오지 못했다"를 그대로 보인다).
export async function healOnce(error) {
  if (!navigator.serviceWorker?.controller || navigator.onLine === false) return false;
  if (!offline.update && !(error instanceof SyntaxError)) return false;
  try {
    const v = await controllerVersion();
    if (!v || sessionStorage.getItem('ces2027.healed') === v) return false;
    sessionStorage.setItem('ces2027.healed', v);
  } catch { return false; }
  await reopen();
  return true;
}
