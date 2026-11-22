// 폰 안 IndexedDB 한 곳('ces2027'): 녹음(audio)과 일기 사진(photo)을 둔다. 열쇠는 일기 id다. 폰 밖으로 보내지 않는다.
// 판 번호를 올리고 빠진 칸만 만든다(옛 판의 녹음은 그대로 둔다).

export const STORES = ['audio', 'photo'];

export function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('ces2027', 2);
    req.onupgradeneeded = () => { for (const name of STORES) if (!req.result.objectStoreNames.contains(name)) req.result.createObjectStore(name); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function run(store, mode, work) {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(store, mode);
      const req = work(tx.objectStore(store));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
