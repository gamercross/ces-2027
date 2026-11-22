// 녹음한 소리를 폰 안(IndexedDB)에 둔다. 일기 id가 열쇠다. 폰 밖으로 보내지 않는다.
import { run } from './idb.js';

export const saveAudio = (id, blob) => run('audio', 'readwrite', (s) => s.put(blob, id));
export const loadAudio = (id) => run('audio', 'readonly', (s) => s.get(id));
export const dropAudio = (id) => run('audio', 'readwrite', (s) => s.delete(id));
// 녹음 전부(이 폰의 내 자료 지우기). 데이터베이스째 지운다 — 같은 데이터베이스('ces2027')에 둔 일기 사진(photo 칸)도 같이 지워진다. 없으면 그냥 끝난다.
export const dropAllAudio = () => new Promise((resolve) => {
  try {
    const req = indexedDB.deleteDatabase('ces2027');
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  } catch { resolve(); }
});
