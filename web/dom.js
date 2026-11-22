// 화면 조각을 만드는 작은 도우미. 글은 늘 textContent로 넣는다(innerHTML을 쓰지 않는다).

export function el(tag, attrs, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    node.append(kid);
  }
  return node;
}

export const num = (n) => Number(n).toLocaleString('ko-KR');

// 바깥 링크. 새 창으로 열고 연 쪽을 넘기지 않는다.
export function out(href, text, cls) {
  return el('a', { href, target: '_blank', rel: 'noopener noreferrer', class: cls, text });
}

// 닫기 · 지우기에 쓰는 × 그림. 색은 글자색(currentColor)을 따른다. 읽어 주는 이름은 단추에 붙인다.
export function cross() {
  const NS = 'http://www.w3.org/2000/svg';
  const icon = document.createElementNS(NS, 'svg');
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', 'M6 6l12 12M18 6L6 18');
  icon.append(path);
  return icon;
}
