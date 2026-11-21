// 말과 글: 읽어 주기 · 받아쓰기 · 번역 · 녹음. 키도 서버도 쓰지 않고 폰(브라우저)이 가진 기능만 쓴다.
// 두 길이 있고, 쓰는 사람이 화면에서 고른다 (2026-11-21 정함). 고르기 전의 기본값은 config/settings.json의 speech다:
//   on-device      폰 안에서만. 소리와 글이 폰 밖으로 나가지 않는다. 안 되는 폰이 많다.
//   device-service 폰의 음성 인식 서비스를 쓴다. 인터넷이 있어야 하고 소리가 구글 · 애플로 간다.
// 안 되는 기능은 숨기지 않고 "이 폰에서는 안 됨"과 까닭을 돌려준다.

export const MODES = ['on-device', 'device-service'];
// 쓰는 사람이 고른 길(chosen)이 있으면 그것, 없으면 설정의 기본값, 그것도 없으면 폰 안에서만.
export const modeOf = (settings, chosen) => (MODES.includes(chosen) ? chosen : MODES.includes(settings?.speech) ? settings.speech : 'on-device');
// 폰 밖 길은 한 번 확인을 받은 뒤에만 쓴다. 확인이 없으면 폰 안에서만으로 돌아간다.
export const allowedMode = (mode, consent) => (mode === 'device-service' && !consent ? 'on-device' : mode);
export const SERVICE_NOTE = '인터넷이 필요하고 소리가 구글 · 애플로 간다.';

const SR = (g) => g.SpeechRecognition || g.webkitSpeechRecognition || null;

// 이 폰에서 무엇이 되는지. env는 시험할 때 넣는다 (기본은 지금 창).
// model은 폰 안 받아쓰기 모델의 형편이다: { can(돌릴 수 있는 브라우저인가), ready(받아 두었나), mb(받을 크기), name }.
// 돌려주는 것마다 { ok, why }.
export async function capabilities(mode, env, model) {
  const g = env || globalThis;
  const out = {};
  out.speak = g.speechSynthesis && g.SpeechSynthesisUtterance ? { ok: true, why: '' } : { ok: false, why: '이 브라우저는 글을 읽어 주지 못한다' };
  out.record = g.navigator?.mediaDevices?.getUserMedia && g.MediaRecorder ? { ok: true, why: '' } : { ok: false, why: '이 브라우저는 녹음을 하지 못한다' };

  const Rec = SR(g);
  if (!Rec) out.dictate = { ok: false, why: '이 브라우저에는 받아쓰기가 없다' };
  else if (mode === 'device-service') out.dictate = { ok: true, why: '폰의 음성 인식 서비스를 쓴다. 인터넷이 있어야 하고 소리가 폰 밖(구글 · 애플)으로 간다' };
  else if (typeof Rec.available !== 'function') out.dictate = { ok: false, why: '폰 안에서만 하는 받아쓰기를 이 브라우저가 돕지 않는다' };
  else {
    let state = 'unavailable';
    try { state = await Rec.available({ langs: ['en-US'], processLocally: true }); } catch { /* 물을 수 없으면 안 되는 것으로 본다 */ }
    out.dictate = state === 'available'
      ? { ok: true, why: '폰 안에서 받아 적는다. 소리가 폰 밖으로 나가지 않는다', local: true }
      : { ok: false, why: state === 'downloadable' || state === 'downloading' ? '폰 안에서 받아 적으려면 말 꾸러미를 먼저 받아야 한다 (이 화면의 "받기")' : '폰 안에서만 하는 받아쓰기가 이 폰에는 없다', installable: state === 'downloadable' };
  }
  // 폰 안에서만 길인데 폰이 스스로 못 하면, 누를 때 받는 작은 모델로 한다.
  if (mode === 'on-device' && !out.dictate.ok && !out.dictate.installable && model?.can) {
    out.dictate = model.ready
      ? { ok: true, engine: 'model', why: `폰 안 모델(${model.name})로 받아 적는다. 소리가 폰 밖으로 나가지 않는다. 말이 끊길 때마다 한 줄씩 나온다` }
      : { ok: false, engine: 'model', downloadable: true, mb: model.mb, why: `폰 안 받아쓰기 모델을 받으면 된다 (약 ${model.mb}MB, 이 화면의 "모델 받기")` };
  }

  const T = g.Translator;
  if (!T || typeof T.availability !== 'function') out.translate = { ok: false, why: '폰 안에서 하는 번역이 이 브라우저에는 없다' };
  else {
    let state = 'unavailable';
    try { state = await T.availability({ sourceLanguage: 'en', targetLanguage: 'ko' }); } catch { /* 물을 수 없으면 안 되는 것으로 본다 */ }
    out.translate = state === 'available'
      ? { ok: true, why: '이미 준비된 폰 안 번역기를 쓴다' }
      : { ok: false, why: state === 'downloadable' || state === 'downloading' ? '폰 안 번역 꾸러미가 아직 준비되지 않았다. 받는 크기를 확인할 수 없어 자동으로 받지 않는다' : '폰 안에서 하는 번역이 이 폰에는 없다' };
  }
  return out;
}

// 폰 안의 번역기. 없으면 null을 돌려준다.
const translators = new Map();
export async function translate(text, from, to, env) {
  const g = env || globalThis;
  const t = String(text || '').trim();
  if (!t || !g.Translator || typeof g.Translator.create !== 'function') return null;
  const key = `${from}>${to}`;
  try {
    if (typeof g.Translator.availability !== 'function' || (await g.Translator.availability({ sourceLanguage: from, targetLanguage: to })) !== 'available') return null;
    if (!translators.has(key)) translators.set(key, await g.Translator.create({ sourceLanguage: from, targetLanguage: to }));
    return await translators.get(key).translate(t);
  } catch {
    translators.delete(key);
    return null;
  }
}

// 번역 사이트로 넘기는 주소 (키 없음). 글이 폰 밖으로 나가므로 device-service일 때만 단추를 보인다.
export function translateLink(text, from, to) {
  return `https://translate.google.com/?sl=${from}&tl=${to}&op=translate&text=${encodeURIComponent(String(text || '').slice(0, 1500))}`;
}

// 영어로 읽어 준다. on-device면 폰 안에 있는 목소리만 쓴다. 읽기 시작했으면 true.
export function speak(text, mode, env) {
  const g = env || globalThis;
  if (!g.speechSynthesis || !g.SpeechSynthesisUtterance) return false;
  const voices = g.speechSynthesis.getVoices().filter((v) => /^en[-_]/i.test(v.lang));
  const voice = mode === 'on-device' ? voices.find((v) => v.localService) : (voices.find((v) => v.localService) || voices[0]);
  if (mode === 'on-device' && voices.length && !voice) return false;
  const u = new g.SpeechSynthesisUtterance(text);
  u.lang = 'en-US';
  u.rate = 0.92;
  if (voice) u.voice = voice;
  g.speechSynthesis.cancel();
  g.speechSynthesis.speak(u);
  return true;
}

// 받아쓰기를 시작한다. 줄이 정해질 때마다 onLine(글), 아직 듣는 중인 글은 onInterim(글), 끝나면 onEnd(까닭).
// 돌려주는 것: { stop() } 또는 null(이 폰에서는 안 됨).
// track: 녹음도 같이 할 때 그 마이크 줄기. 새 브라우저는 같은 줄기로 받아 적어 녹음과 부딪치지 않는다.
export function dictate(mode, local, handlers, env, track) {
  const g = env || globalThis;
  const Rec = SR(g);
  if (!Rec) return null;
  const rec = new Rec();
  rec.lang = 'en-US';
  rec.continuous = true;
  rec.interimResults = true;
  if (mode === 'on-device') {
    if (!local) return null;
    rec.processLocally = true;
  }
  let wanted = true;
  rec.onresult = (ev) => {
    let interim = '';
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const text = ev.results[i][0].transcript.trim();
      if (!text) continue;
      if (ev.results[i].isFinal) handlers.onLine?.(text); else interim += `${text} `;
    }
    handlers.onInterim?.(interim.trim());
  };
  rec.onerror = (ev) => { if (ev.error !== 'no-speech' && ev.error !== 'aborted') { wanted = false; handlers.onEnd?.(ev.error); } };
  // 브라우저가 조용하면 스스로 멈춘다. 듣는 중이면 다시 건다.
  const start = () => { if (track) rec.start(track); else rec.start(); };
  rec.onend = () => { if (wanted) { try { start(); } catch { wanted = false; handlers.onEnd?.('stopped'); } } };
  try { start(); } catch { return null; }
  return { stop() { wanted = false; try { rec.stop(); } catch { /* 이미 멈췄다 */ } } };
}

// 폰 안에서 받아 적는 데 쓰는 말 꾸러미(영어)를 받는다. 받았으면 true.
export async function installDictation(env) {
  const Rec = SR(env || globalThis);
  if (!Rec || typeof Rec.install !== 'function') return false;
  try { return (await Rec.install({ langs: ['en-US'], processLocally: true })) === true; } catch { return false; }
}

// 폰 안에 요약기가 있으면 들은 글을 줄인다. 없으면 null (그때는 앞 세 줄을 쓴다).
export async function summarize(text, env) {
  const g = env || globalThis;
  const t = String(text || '').trim();
  if (t.length < 200 || !g.Summarizer || typeof g.Summarizer.availability !== 'function') return null;
  try {
    if ((await g.Summarizer.availability()) !== 'available') return null;
    const s = await g.Summarizer.create({ type: 'key-points', format: 'plain-text', length: 'short' });
    const got = await s.summarize(t);
    s.destroy?.();
    return String(got || '').trim() || null;
  } catch {
    return null;
  }
}

// 받아 적은 줄들로 일기 초안을 만든다. 느낀 점과 "누구에게"는 비워 둔다 (사람이 쓴다).
// lines: [{ t(초), en, ko }]. summary가 있으면 그것을, 없으면 들은 글의 앞 세 줄을 "본 것"에 넣고 다듬으라고 적는다.
export function makeDraft(company, lines, date, id, summary) {
  const heard = lines.filter((l) => (l.en || '').trim()).map((l) => ({ t: Math.max(0, Math.round(l.t || 0)), en: l.en.trim().slice(0, 500), ko: (l.ko || '').trim().slice(0, 500) }));
  const head = heard.slice(0, 3).map((l) => l.ko || l.en).join(' ');
  return {
    id,
    date,
    exId: company.id || '',
    company: company.name || '',
    booth: company.booth || '',
    saw: summary ? `(폰이 줄인 글이다. 다듬는다) ${summary}`.slice(0, 600) : head ? `(들은 글의 앞부분이다. 다듬는다) ${head}`.slice(0, 600) : '',
    felt: '',
    for: [],
    sent: null,
    draft: true,
    heard,
  };
}
