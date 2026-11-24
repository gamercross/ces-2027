// 오프라인: 서비스 워커가 화면 · 코어 · 자료를 폰에 담아 둔다. 담겼는지와 판 이름을 여기서 안다.

// late: 담기를 시작한 지 30초가 넘었거나 담다가 실패했는데 아직 못 담았다. 설정의 "인터넷 없이" 줄이 "아직 담지 못했다"고 말한다.
export const offline = { ready: false, version: null, install: null, update: false, late: false };
const changed = () => window.dispatchEvent(new Event('ces-offline'));
const LATE_MS = 30000;
function late() { if (!offline.ready && !offline.late) { offline.late = true; changed(); } }

if ('serviceWorker' in navigator) {
  // 새 판: 서비스 워커는 새 판을 받아만 두고, 화면에는 쓰던 판을 그대로 준다(web/sw.js의 "쓰는 판").
  // 받아 둔 판이 쓰는 판과 다르면 "새 판이 있다 · 다시 열기"를 보인다. 누르기 전에는 앱을 껐다 켜도 쓰던 판 그대로다.
  // 서비스 워커가 바뀔 때(새 판을 다 받았을 때)와 앱을 열 때 본다.
  navigator.serviceWorker.addEventListener('controllerchange', look);
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
    if (offline.ready) offline.late = false;
    changed();
    look();
  });
  // 인터넷이 돌아오면 못 담은 것을 다시 담아 본다 (앱을 껐다 켜지 않아도).
  window.addEventListener('online', () => { if (started && !offline.ready) register(); });
}

// 서비스 워커에게 묻는다(web/sw.js의 message). 답이 없으면 null.
async function ask(what) {
  const reg = await navigator.serviceWorker.getRegistration();
  const worker = reg?.active;
  if (!worker) return null;
  return new Promise((done) => {
    const pipe = new MessageChannel();
    const timer = setTimeout(() => done(null), 4000);
    pipe.port1.onmessage = (ev) => { clearTimeout(timer); done(ev.data?.error ? null : ev.data); };
    worker.postMessage({ ces: what }, [pipe.port2]);
  });
}
// 받아 둔 새 판이 있는지 본다. 있으면 띠를 보인다(app.js).
async function look() {
  const s = await ask('state').catch(() => null);
  if (!s) return;
  const update = s.latest !== s.using;
  if (update !== offline.update) { offline.update = update; changed(); }
}

// 서비스 워커를 건다. 첫 화면이 그려진 뒤에 부른다: 폰에 담는 일(파일 서른몇 개)이 첫 화면과 회선을 다투지 않게.
let started = false;
// 담기는 "전부 아니면 하나도 아니다"라서, 받다가 끊기면 서비스 워커가 깔리지 않고 버려진다(redundant). 그때 바로 "아직 담지 못했다"로 바꾼다.
async function register() {
  try {
    const reg = await navigator.serviceWorker.register('sw.js');
    const worker = reg.installing;
    if (worker && !reg.active) worker.addEventListener('statechange', () => { if (worker.state === 'redundant') late(); });
  } catch { late(); }
}
export function startOffline() {
  if (started || !('serviceWorker' in navigator)) return;
  started = true;
  if ('requestIdleCallback' in window) requestIdleCallback(register, { timeout: 3000 }); else setTimeout(register, 1200);
  setTimeout(late, LATE_MS);
}

// 폰에 남긴 것(명함 · 갈 곳 · 일기 · 사진)을 저절로 지우지 말아 달라고 폰에 부탁한다. 들어줄지는 폰이 정한다(화면은 바뀌지 않는다).
// 명함을 만든 뒤에 한 번만 부탁한다: 남길 것이 생기기 전에는 묻지 않는다.
let begged = false;
export async function keepData() {
  if (begged || !navigator.storage?.persist) return;
  begged = true;
  try { if (!(await navigator.storage.persisted())) await navigator.storage.persist(); } catch { /* 못 부탁해도 앱은 그대로 쓴다 */ }
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
// "다시 열기": 받아 둔 새 판이 있으면 서비스 워커에게 그 판을 쓰라고 한 뒤(이때만 판이 바뀐다), 새 파일을 한 번씩 받아 두고 다시 연다.
export async function reopen() {
  try { await ask('use-latest'); await freshen(); } catch { /* 못 바꿔도 다시 연다 */ }
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
