// 일기 사진을 폰에서 줄인다(R49). 긴 변과 용량 상한을 정해 두고, 그 안에 들 때까지 화질 → 크기 차례로 줄인다.
// 셈(fitSize · plan)은 화면과 따로 두어 Node에서도 시험한다. 그리는 일(shrink)은 브라우저에서만 한다.

export const MAX_EDGE = 1024;       // 긴 변 상한(px)
export const MAX_BYTES = 150 * 1024; // 용량 상한(150KB). 파일로 내보내면 글자로 바뀌어 약 4/3배가 된다
export const MIN_EDGE = 480;         // 이보다는 줄이지 않는다
const QUALITIES = [0.72, 0.64, 0.56, 0.48, 0.4];

// 긴 변이 max를 넘으면 비율을 지켜 줄인다. 작은 사진은 늘리지 않는다.
export function fitSize(w, h, max = MAX_EDGE) {
  const long = Math.max(w, h);
  if (!(long > 0)) return { w: 0, h: 0 };
  const k = long > max ? max / long : 1;
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

// 줄이는 순서: 긴 변 1024에서 화질 다섯 단계, 그래도 크면 긴 변을 80%로 줄여 다시(480까지).
export function steps() {
  const out = [];
  for (let edge = MAX_EDGE; edge >= MIN_EDGE; edge = Math.floor(edge * 0.8)) for (const q of QUALITIES) out.push({ edge, q });
  return out;
}

// 사진 파일(Blob)을 상한 안의 JPEG로 줄인다. { blob, w, h } 또는 못 읽으면 던진다.
export async function shrink(file, { canvasFor = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h }) } = {}) {
  if (!file || !/^image\//.test(file.type || '')) throw new Error('사진 파일이 아니다');
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    let last = null;
    for (const { edge, q } of steps()) {
      const { w, h } = fitSize(bitmap.width, bitmap.height, edge);
      const canvas = canvasFor(w, h);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff'; // 투명한 사진(PNG)은 흰 바탕에 놓는다(JPEG는 투명을 못 담는다)
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(bitmap, 0, 0, w, h);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', q));
      if (!blob) throw new Error('사진을 줄이지 못했다');
      last = { blob, w, h };
      if (blob.size <= MAX_BYTES) return last;
    }
    return last;
  } finally {
    bitmap.close?.();
  }
}
