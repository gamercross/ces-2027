// 일기 사진 한 장을 폰 안(IndexedDB)에 둔다. 일기 id가 열쇠다. 일기 글(localStorage)과 따로 둬서 글이 사진 때문에 못 남는 일이 없게 한다.
// 사진은 폰 밖으로 가지 않는다 — 일기를 "파일로" 내려받을 때만 그 파일 안에 들어간다(web/diary.js).
import { run } from './idb.js';

export const savePhoto = (id, blob) => run('photo', 'readwrite', (s) => s.put(blob, id));
export const loadPhoto = (id) => run('photo', 'readonly', (s) => s.get(id));
export const dropPhoto = (id) => run('photo', 'readwrite', (s) => s.delete(id));
// 이 폰의 일기 사진을 전부 지운다("이 폰의 내 자료 지우기"가 부른다).
export const clearPhotos = () => run('photo', 'readwrite', (s) => s.clear());

// 저장 공간이 모자라서 못 담은 것인가(브라우저마다 이름이 다르다).
export const isFull = (e) => e?.name === 'QuotaExceededError' || e?.code === 22 || /quota/i.test(String(e?.message || ''));

// 파일로 내보낼 사진: { 일기 id: 데이터 주소 }. 사진이 없거나 못 꺼내면 그 일기는 뺀다.
export async function photosFor(entries) {
  const out = {};
  for (const e of entries) {
    if (!e.photo) continue;
    try {
      const blob = await loadPhoto(e.id);
      if (blob) out[e.id] = await toDataUrl(blob);
    } catch { /* 못 꺼내면 글만 간다 */ }
  }
  return out;
}

function toDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}
