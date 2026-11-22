// 녹음한 소리를 폰 안(IndexedDB)에 둔다. 일기 id가 열쇠다. 폰 밖으로 보내지 않는다.
import { run } from './idb.js';

export const saveAudio = (id, blob) => run('audio', 'readwrite', (s) => s.put(blob, id));
export const loadAudio = (id) => run('audio', 'readonly', (s) => s.get(id));
export const dropAudio = (id) => run('audio', 'readwrite', (s) => s.delete(id));
