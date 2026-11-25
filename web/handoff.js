// 만든 파일을 폰 밖으로 건넨다. 폰의 공유 창(AirDrop · 파일에 저장 · 메신저가 한 번에 보인다)을 쓸 수 있으면 그것으로, 아니면 내려받기.
// 공유 창은 인터넷 없이도 열린다. 어디로 건넬지는 사람이 고른다: 앱은 어디로도 보내지 않는다.

// 내려받기: 폰의 "다운로드"에 떨어진다.
export function download(name, text, type = 'application/json;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// 공유 창으로 파일을 건넬 수 있는 폰인가.
export function canHand(name, text, type = 'application/json') {
  try {
    if (typeof File !== 'function' || !navigator.share || !navigator.canShare) return null;
    const file = new File([text], name, { type });
    return navigator.canShare({ files: [file] }) ? file : null;
  } catch { return null; }
}

// 건넨다. 돌려주는 것: 'shared'(공유 창에서 골랐다) · 'cancel'(공유 창을 닫았다, 아무것도 안 나갔다) · 'saved'(내려받았다).
export async function handFile(name, text, type = 'application/json') {
  const file = canHand(name, text, type);
  if (file) {
    try {
      await navigator.share({ files: [file] });
      return 'shared';
    } catch (e) {
      if (e?.name === 'AbortError') return 'cancel';
      // 공유 창을 못 띄웠으면(권한 · 크기 등) 내려받기로 넘어간다.
    }
  }
  download(name, text, `${type};charset=utf-8`);
  return 'saved';
}
