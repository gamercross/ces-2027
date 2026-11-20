// 오프라인: 서비스 워커가 화면 · 코어 · 자료를 폰에 담아 둔다. 담겼는지와 판 이름을 여기서 안다.

export const offline = { ready: false, version: null, install: null };
const changed = () => window.dispatchEvent(new Event('ces-offline'));

if ('serviceWorker' in navigator) {
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
