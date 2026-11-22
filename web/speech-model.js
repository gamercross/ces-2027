// 폰 안 받아쓰기 모델: 누를 때만 받고, 한 번 받으면 폰에 남아 인터넷 없이 된다.
// 받는 것: 실행기(같은 주소의 vendor/speech/)와 모델 파일(huggingface.co). 내 소리와 글은 어디로도 보내지 않는다.
// 이 조각은 듣기 화면에서 누를 때만 불러온다.

import { resample, RATE, Segmenter } from './pcm.js';

// 앱의 판이 바뀌어도 지워지지 않게, 서비스 워커가 지우는 이름(ces2027-…)과 다르게 짓는다.
export const KEEP = 'ces2027keep-speech-v1';
export const MODEL_CACHE = 'transformers-cache';

let infoOnce = null;
export function getModelInfo() {
  if (!infoOnce) infoOnce = fetch('data/speech-model.json').then((r) => { if (!r.ok) throw new Error('모델 목록'); return r.json(); }).catch((e) => { infoOnce = null; throw e; });
  return infoOnce;
}

export const runtimeFiles = (info) => info.runtime.files.filter((f) => !f.notice);
export const runtimeUrl = (info, f) => new URL(info.runtime.dir + f.name, document.baseURI).href;
const modelUrl = (info, f) => `${info.dictation.host}${info.dictation.id}/resolve/${info.dictation.revision}/${f.name}`;
export const totalBytes = (info) => [...runtimeFiles(info), ...info.dictation.files].reduce((a, f) => a + f.bytes, 0);
export const toMB = (bytes) => Math.round(bytes / 1048576);

// 이 브라우저가 모델을 돌릴 수 있는 꼴인가 (돌려 보기 전에 아는 것만).
export function canRun(g = globalThis) {
  return !!(g.WebAssembly && g.Worker && g.caches && (g.AudioContext || g.webkitAudioContext) && g.navigator?.mediaDevices?.getUserMedia);
}

// 다 받아 두었는가.
export async function modelReady(info) {
  try {
    // 없는 곳을 열면 빈 곳이 생긴다. 있는지부터 본다.
    if (!(await caches.has(KEEP)) || !(await caches.has(MODEL_CACHE))) return false;
    const keep = await caches.open(KEEP);
    for (const f of runtimeFiles(info)) if (!(await keep.match(runtimeUrl(info, f)))) return false;
    const models = await caches.open(MODEL_CACHE);
    for (const f of info.dictation.files) if (!(await models.match(modelUrl(info, f)))) return false;
    return true;
  } catch {
    return false;
  }
}

// 화면이 쓰는 한 줄: { can, ready, mb }
export async function modelStatus() {
  try {
    const info = await getModelInfo();
    return { can: canRun(), ready: canRun() && (await modelReady(info)), mb: toMB(totalBytes(info)), name: info.dictation.ko };
  } catch {
    return { can: false, ready: false, mb: 0, name: '' };
  }
}

let worker = null;
let loading = null;
const waiting = new Map();
let progressTo = null;

function startWorker(info) {
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    worker = new Worker(new URL('./speech-model.worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (ev) => {
      const m = ev.data;
      if (m.type === 'ready') resolve(worker);
      else if (m.type === 'progress') progressTo?.(m);
      else if (m.type === 'text') { waiting.get(m.id)?.resolve(m); waiting.delete(m.id); }
      else if (m.type === 'error') {
        if (m.id != null && waiting.has(m.id)) { waiting.get(m.id).reject(new Error(m.message)); waiting.delete(m.id); }
        else reject(new Error(m.message));
      }
    };
    worker.onerror = (e) => reject(new Error(e.message || '일꾼을 열지 못했다'));
    worker.postMessage({ type: 'load', runtime: info.runtime, model: info.dictation });
  }).catch((e) => { worker?.terminate(); worker = null; loading = null; throw e; });
  return loading;
}

// 받는다. onProgress({ loaded, total })는 받은 크기를 알린다. 끝나면 모델이 돌 준비가 된 것이다.
export async function downloadModel(onProgress) {
  const info = await getModelInfo();
  const total = totalBytes(info);
  const got = new Map();
  const tell = () => onProgress?.({ loaded: Math.min(total, [...got.values()].reduce((a, b) => a + b, 0)), total });
  const keep = await caches.open(KEEP);
  for (const f of runtimeFiles(info)) {
    const url = runtimeUrl(info, f);
    if (!(await keep.match(url))) {
      const res = await fetch(url, { cache: 'reload' });
      if (!res.ok) throw new Error(`실행기를 받지 못했다 (${f.name})`);
      await keep.put(url, res);
    }
    got.set(f.name, f.bytes);
    tell();
  }
  progressTo = (m) => { got.set(`m:${m.file}`, m.loaded); tell(); };
  try { await startWorker(info); } finally { progressTo = null; }
  for (const f of info.dictation.files) got.set(`m:${f.name}`, f.bytes);
  tell();
  return true;
}

// 지운다 (폰의 자리를 돌려받는다).
export async function removeModel() {
  worker?.terminate();
  worker = null;
  loading = null;
  const info = await getModelInfo();
  await caches.delete(KEEP);
  if (!(await caches.has(MODEL_CACHE))) return;
  // 실행기가 스스로 담아 둔 것 가운데 이 모델의 것만 지운다 (판을 못 박지 않고 읽은 설정 한 장도 같이).
  const models = await caches.open(MODEL_CACHE);
  for (const req of await models.keys()) if (req.url.includes(`/${info.dictation.id}/`) || req.url.includes(`/${info.runtime.dir}`)) await models.delete(req);
  if (!(await models.keys()).length) await caches.delete(MODEL_CACHE);
}

let nextId = 1;
async function transcribe(info, audio) {
  const w = await startWorker(info);
  const id = nextId++;
  const done = new Promise((resolve, reject) => waiting.set(id, { resolve, reject }));
  w.postMessage({ type: 'run', id, audio }, [audio.buffer]);
  return done;
}

// 받아쓰기를 시작한다. stream이 없으면 마이크를 스스로 연다.
// 말이 끊길 때마다 그 토막을 모델에 넘기고, 글이 나오면 onLine(글). 돌려주는 것: { stop() } — stop은 마지막 토막까지 기다린다.
export async function startModelDictation(handlers, stream) {
  const info = await getModelInfo();
  await startWorker(info);
  const own = !stream;
  const media = stream || await navigator.mediaDevices.getUserMedia({ audio: true });
  const Ctx = globalThis.AudioContext || globalThis.webkitAudioContext;
  let ctx;
  try { ctx = new Ctx({ sampleRate: RATE }); } catch { ctx = new Ctx(); }
  const source = ctx.createMediaStreamSource(media);
  const node = ctx.createScriptProcessor(4096, 1, 1);
  const quiet = ctx.createGain();
  quiet.gain.value = 0;
  const seg = new Segmenter();
  let busy = 0;
  let stopped = false;
  let chain = Promise.resolve();
  const send = (piece) => {
    busy += 1;
    handlers.onInterim?.('폰 안에서 받아 적는 중이다');
    chain = chain.then(() => transcribe(info, piece)).then((m) => { if (m.text) handlers.onLine?.(m.text); }, (e) => handlers.onEnd?.(String(e.message || e))).finally(() => { busy -= 1; if (!busy) handlers.onInterim?.(stopped ? '' : '듣는 중이다'); });
  };
  node.onaudioprocess = (ev) => {
    if (stopped) return;
    const raw = ev.inputBuffer.getChannelData(0);
    const pcm = resample(new Float32Array(raw), ctx.sampleRate, RATE);
    for (const piece of seg.push(pcm)) send(piece);
  };
  source.connect(node);
  node.connect(quiet);
  quiet.connect(ctx.destination);
  if (ctx.state === 'suspended') await ctx.resume().catch(() => {});
  handlers.onInterim?.('듣는 중이다');
  return {
    async stop() {
      if (stopped) return;
      stopped = true;
      const last = seg.flush();
      if (last) send(last);
      node.disconnect();
      source.disconnect();
      if (own) media.getTracks().forEach((t) => t.stop());
      await Promise.race([chain, new Promise((r) => setTimeout(r, 15000))]);
      await ctx.close().catch(() => {});
    },
  };
}
