// 카메라로 QR 읽기: 브라우저가 가진 BarcodeDetector가 있을 때만 쓴다. 바깥 라이브러리는 없다.
// 없는 브라우저(아이폰 사파리 등)나 권한을 거부한 때는 까닭을 말해 주고 손으로 넣는 쪽으로 보낸다.
// 카메라는 사람이 단추를 눌렀을 때만 켜고, 그만 읽기 · 화면을 떠남 · 앱이 가려짐에서 끈다.

// env: { hasDetector, hasCamera, secure } → { ok, why }
export function cameraSupport(env) {
  if (!env.hasDetector) return { ok: false, why: '이 브라우저에는 QR을 읽는 기능(BarcodeDetector)이 없다. 아이폰 사파리 같은 곳이 그렇다.' };
  if (!env.secure) return { ok: false, why: '카메라는 https 주소에서만 켜진다. 이 주소에서는 켤 수 없다.' };
  if (!env.hasCamera) return { ok: false, why: '이 브라우저에서는 카메라를 켤 수 없다.' };
  return { ok: true, why: '' };
}

export const envOf = (w = globalThis) => ({
  hasDetector: typeof w.BarcodeDetector === 'function',
  hasCamera: !!w.navigator?.mediaDevices?.getUserMedia,
  secure: w.isSecureContext !== false,
});

// 카메라를 켜다 난 오류를 쉬운 말로.
export function explainCameraError(err) {
  const name = err?.name || '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return '카메라 권한을 거부했다. 브라우저 주소창 옆의 설정에서 카메라를 허용하면 다시 켤 수 있다.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return '이 폰에서 쓸 수 있는 카메라를 찾지 못했다.';
  if (name === 'NotReadableError' || name === 'AbortError') return '카메라를 다른 앱이 쓰고 있다. 그 앱을 닫고 다시 누른다.';
  return '카메라를 켜지 못했다.';
}

// video 위에 카메라를 켜고 QR을 찾는다. onText(글)가 읽을 때마다 불린다(같은 QR은 2초 안에 다시 부르지 않는다).
// 돌려주는 것: { ok: true, stop } 또는 { ok: false, why }
export async function startScan(video, onText, w = globalThis) {
  const env = envOf(w);
  const can = cameraSupport(env);
  if (!can.ok) return { ok: false, why: can.why };
  let detector;
  try { detector = new w.BarcodeDetector({ formats: ['qr_code'] }); } catch { return { ok: false, why: '이 브라우저는 QR 읽기를 지원한다고 하지만 쓸 수 없다.' }; }
  let stream;
  try {
    stream = await w.navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
  } catch (err) {
    return { ok: false, why: explainCameraError(err) };
  }
  let alive = true;
  let timer = 0;
  const stop = () => {
    alive = false;
    clearTimeout(timer);
    for (const track of stream.getTracks()) track.stop();
    video.srcObject = null;
    w.document?.removeEventListener('visibilitychange', onHide);
    w.removeEventListener?.('hashchange', stop);
    w.removeEventListener?.('pagehide', stop);
  };
  const onHide = () => { if (w.document.hidden) stop(); };
  video.srcObject = stream;
  video.setAttribute('playsinline', '');
  video.muted = true;
  // 재생이 시작되길 기다리지 않는다(첫 화면이 올 때까지 멈추는 폰이 있다). 막혀도 읽기는 이어 간다.
  Promise.resolve(video.play?.()).catch(() => {});
  w.document?.addEventListener('visibilitychange', onHide);
  w.addEventListener?.('hashchange', stop);
  w.addEventListener?.('pagehide', stop);
  const last = { text: '', at: 0 };
  const tick = async () => {
    if (!alive) return;
    // 화면에서 사라졌으면(다른 화면으로 바뀜) 끈다.
    if (!video.isConnected) { stop(); return; }
    try {
      const found = await detector.detect(video);
      const text = found?.[0]?.rawValue;
      if (typeof text === 'string' && text && alive) {
        const now = Date.now();
        if (text !== last.text || now - last.at > 2000) { last.text = text; last.at = now; onText(text); }
      }
    } catch { /* 한 장을 못 읽어도 다음 장으로 */ }
    if (alive) timer = setTimeout(tick, 250);
  };
  timer = setTimeout(tick, 250);
  return { ok: true, stop };
}
