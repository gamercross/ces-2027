// 현장 안내: 자료(data/onsite.json)를 화면에 쓸 글과 전화 링크로 바꾸는 셈. 화면과 따로 두어 Node에서도 시험한다.
// 이 앱은 신고를 받지 않는다. 공식 안내에 적힌 번호를 보여 주고, 누르면 폰의 전화 앱이 열릴 뿐이다.

// "702-590-7911" → "tel:+17025907911". 미국 번호 열 자리가 아니면 null (이상한 글로 전화를 걸지 않는다).
export function telHref(tel) {
  const digits = String(tel || '').replace(/\D/g, '');
  return digits.length === 10 ? `tel:+1${digits}` : null;
}

// 줄 하나에서 걸 수 있는 전화들: [{ tel, href }]
export function telsOf(line) {
  return [line.tel, ...(line.tels || [])].filter(Boolean).map((tel) => ({ tel, href: telHref(tel) })).filter((t) => t.href);
}

// 줄의 출처: 줄에 따로 있으면 그것, 없으면 묶음의 것.
export const sourceOf = (data, section, line) => data.sources[line.src || section.src];

// 자료가 쓸 만한 꼴인가. 아니면 null.
export function clean(data) {
  if (!data || !data.sources || !Array.isArray(data.sections) || !/^\d{4}-\d\d-\d\d$/.test(data.read || '')) return null;
  const ok = data.sections.every((s) => s.k && s.ko && data.sources[s.src] && Array.isArray(s.lines) && s.lines.length
    && s.lines.every((l) => l.ko && (l.text || l.tel) && (!l.src || data.sources[l.src])));
  return ok ? data : null;
}

// 물어보기에서 찾을 줄(askall.js의 entry 꼴 재료). 줄마다 하나.
export function askRows(data) {
  const out = [];
  for (const s of data?.sections || []) {
    for (const l of s.lines) {
      const src = sourceOf(data, s, l);
      const nums = telsOf(l).map((t) => t.tel).join(' ');
      out.push({
        title: `현장 · ${l.ko}`,
        text: [s.ko, l.text, l.dial, nums].filter(Boolean).join(' '),
        show: l.text || `${nums}${l.dial ? ` (${l.dial})` : ''}`,
        src: src ? { ko: src.ko, url: src.url, read: data.read } : null,
      });
    }
  }
  return out;
}
