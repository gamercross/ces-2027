// 번역 앱 열기: 영어 ↔ 한국어 번역은 번역 앱(파파고 · 구글 번역)이 한다. 이 앱은 번역하지 않고, 고른 글을 복사해 두고 앱을 연다.
// 화면과 따로 두어 Node에서도 시험한다. 키도 서버도 쓰지 않는다. 글은 폰의 복사 칸과 번역 앱으로만 간다.
//
// 열기: 안드로이드 크롬은 앱이 그 주소를 처리할 수 있으면 앱으로(패키지를 정한 인텐트), 못 하면 웹 번역으로 돌아간다.
// 아이폰 · 그 밖은 앱 주소를 확인한 것이 없어 웹 번역 주소를 연다(앱이 깔려 있으면 폰이 앱으로 넘길 수도 있다). 실제 폰에서 확인하지 않았다.

export const APPS = {
  papago: {
    k: 'papago',
    ko: '파파고',
    pkg: 'com.naver.labs.translator',
    site: 'https://papago.naver.com/',
    android: 'https://play.google.com/store/apps/details?id=com.naver.labs.translator',
    ios: 'https://apps.apple.com/kr/app/id1147874819',
    // 공식 도움말 주소를 찾지 못했다. 스토어 소개(공식)에 "오프라인 번역"이 적혀 있다.
    help: { url: 'https://apps.apple.com/kr/app/id1147874819', ko: '파파고 앱 소개 (공식 스토어)' },
    offline: '앱 왼쪽 위 메뉴에서 "오프라인 번역"을 열고 한국어와 영어 언어팩을 받는다 (앱 판마다 메뉴 이름이 다를 수 있다)',
    web: (text, from, to) => `https://papago.naver.com/?sk=${from}&tk=${to}${text ? `&st=${encodeURIComponent(text)}` : ''}`,
  },
  google: {
    k: 'google',
    ko: '구글 번역',
    pkg: 'com.google.android.apps.translate',
    site: 'https://translate.google.com/',
    android: 'https://play.google.com/store/apps/details?id=com.google.android.apps.translate',
    ios: 'https://apps.apple.com/app/id414706506',
    help: { url: 'https://support.google.com/translate/answer/6142473?hl=ko', ko: '구글 번역: 오프라인으로 사용할 언어 다운로드 (공식 도움말)' },
    offline: '앱에서 언어를 고르고 그 옆의 "다운로드"를 누른다. 한국어와 영어를 둘 다 받는다 (와이파이에서)',
    web: (text, from, to) => `https://translate.google.com/?sl=${from}&tl=${to}&op=translate${text ? `&text=${encodeURIComponent(text)}` : ''}`,
  },
};
export const APP_LIST = [APPS.papago, APPS.google];
export const DEFAULT_APP = 'papago';
export const appOf = (k) => APPS[k] || APPS[DEFAULT_APP];

// 복사해 넣는 글의 길이 한도 (주소에 실리는 글이 너무 길면 앱이 못 받는다).
export const MAX_TEXT = 1500;

// 한글이 많으면 한국어 → 영어, 아니면 영어 → 한국어.
export function directionOf(text) {
  const t = String(text || '');
  const ko = (t.match(/[가-힣ㄱ-ㅎㅏ-ㅣ]/g) || []).length;
  const en = (t.match(/[A-Za-z]/g) || []).length;
  return ko && ko >= (ko + en) * 0.25 ? { from: 'ko', to: 'en' } : en ? { from: 'en', to: 'ko' } : { from: 'ko', to: 'en' };
}

// 안드로이드면 앱이 그 주소를 처리할 때 앱으로, 못 하면 웹 번역으로 돌아가는 인텐트 주소.
export function androidIntent(app, text) {
  const { from, to } = directionOf(text);
  const web = app.web(text, from, to);
  const rest = web.replace(/^https:\/\//, '');
  return `intent://${rest}#Intent;scheme=https;package=${app.pkg};S.browser_fallback_url=${encodeURIComponent(web)};end`;
}

// 열 계획: 복사할 글과 열 주소. ua는 브라우저의 userAgent.
export function openPlan(appKey, text, ua = '') {
  const app = appOf(appKey);
  const t = String(text || '').trim().slice(0, MAX_TEXT);
  const { from, to } = directionOf(t);
  const android = /Android/i.test(ua);
  return {
    app: app.k,
    copy: t,
    from,
    to,
    kind: android ? 'app' : 'web',
    url: android ? androidIntent(app, t) : app.web(t, from, to),
    web: app.web(t, from, to),
  };
}

// 지금 고른 글. 단추를 누르면 고른 글이 풀리는 폰이 있어, 고른 지 30초 안의 것을 기억해 둔다.
let last = { text: '', at: 0 };
export function rememberSelection(env = globalThis) {
  const s = env.getSelection?.()?.toString().trim();
  if (s) last = { text: s.slice(0, MAX_TEXT), at: Date.now() };
}
export function pickText(fallback = '', env = globalThis, now = Date.now()) {
  const s = env.getSelection?.()?.toString().trim();
  if (s) return s.slice(0, MAX_TEXT);
  if (last.text && now - last.at < 30000) return last.text;
  return String(fallback || '').trim().slice(0, MAX_TEXT);
}
if (typeof document !== 'undefined') document.addEventListener('selectionchange', () => rememberSelection());

// 복사하고 연다. 돌려주는 것: { copied, plan }. 복사 칸을 못 쓰면 copied는 false(글은 화면에 보여 손으로 복사하게 한다).
export async function openTranslator(appKey, text, env = globalThis) {
  const plan = openPlan(appKey, text, env.navigator?.userAgent || '');
  let copied = false;
  if (plan.copy) {
    try { await env.navigator.clipboard.writeText(plan.copy); copied = true; } catch { copied = false; }
  }
  if (plan.kind === 'app') env.location.href = plan.url;
  else env.open(plan.url, '_blank', 'noopener,noreferrer');
  return { copied, plan };
}

// 상태 글: 단추 아래에 한 줄로 보인다.
export function openedNote({ copied, plan }) {
  const app = appOf(plan.app);
  const what = plan.copy ? (copied ? '글을 복사했다. ' : '글을 복사하지 못했다. 글을 길게 눌러 복사한다. ') : '';
  return plan.kind === 'app'
    ? `${what}${app.ko} 앱을 연다. 안 열리면 웹 번역으로 간다. 입력 칸에 글이 비어 있으면 붙여 넣는다.`
    : `${what}${app.ko} 웹 번역을 연다. 앱이 깔려 있으면 앱을 직접 열어 붙여 넣는다.`;
}
