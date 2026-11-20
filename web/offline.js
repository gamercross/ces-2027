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
  navigator.serviceWorker.register('sw.js').catch(() => {});
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

// 홈 화면에 추가: 브라우저가 물어볼 수 있게 되면 단추를 보인다.
window.addEventListener('beforeinstallprompt', (ev) => {
  ev.preventDefault();
  offline.install = ev;
  changed();
});
window.addEventListener('appinstalled', () => { offline.install = null; changed(); });
