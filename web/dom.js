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
