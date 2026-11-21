// 녹음한 소리를 폰 안(IndexedDB)에 둔다. 일기 id가 열쇠다. 폰 밖으로 보내지 않는다.

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('ces2027', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('audio');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function run(mode, work) {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('audio', mode);
      const req = work(tx.objectStore('audio'));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
export const saveAudio = (id, blob) => run('readwrite', (s) => s.put(blob, id));
export const loadAudio = (id) => run('readonly', (s) => s.get(id));
export const dropAudio = (id) => run('readwrite', (s) => s.delete(id));
