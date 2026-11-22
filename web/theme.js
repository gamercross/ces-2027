// 화면 색(밝게 · 어둡게 · 자동)과 글자 크기(네 단계). 첫 그림 전에 <html data-theme> · <html data-text>를 정한다(깜빡임 없게). 고르는 곳은 설정 화면.
(function () {
  var root = document.documentElement;
  var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  function pref() {
    try { var v = JSON.parse(localStorage.getItem('ces2027.theme.v1')); return v === 'light' || v === 'dark' ? v : 'auto'; } catch (e) { return 'auto'; }
  }
  function apply() {
    var p = pref();
    var dark = p === 'dark' || (p === 'auto' && !!mq && mq.matches);
    root.setAttribute('data-theme', dark ? 'dark' : 'light');
    root.setAttribute('data-theme-pref', p);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#161616' : '#f2f2f2');
  }
  // 글자 크기: 1 기본 · 2 크게 · 3 더 크게 · 4 가장 크게 (배율은 tokens.css). 폰에만 남는다.
  function textPref() {
    try { var n = Number(JSON.parse(localStorage.getItem('ces2027.text.v1'))); return n >= 1 && n <= 4 && n === Math.floor(n) ? n : 1; } catch (e) { return 1; }
  }
  function applyText() { root.setAttribute('data-text', String(textPref())); }
  apply();
  applyText();
  if (mq && mq.addEventListener) mq.addEventListener('change', apply);
  window.cesTheme = { apply: apply, pref: pref };
  window.cesText = { apply: applyText, pref: textPref };
})();
