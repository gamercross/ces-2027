// 밝게 · 어둡게 · 자동(폰 설정 따름). 첫 그림 전에 <html data-theme>를 정한다(깜빡임 없게). 고르는 곳은 설정 화면.
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
    if (meta) meta.setAttribute('content', dark ? '#141a2b' : '#e9edf4');
  }
  apply();
  if (mq && mq.addEventListener) mq.addEventListener('change', apply);
  window.cesTheme = { apply: apply, pref: pref };
})();
