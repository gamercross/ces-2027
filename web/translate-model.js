// 폰 안 영한 번역 모델: 누를 때만 받고, 한 번 받으면 폰에 남아 인터넷 없이 된다. 영어 → 한국어만 한다.
// 받는 것: 실행기(같은 주소의 vendor/speech/) · 단어 사전 둘(같은 주소의 vendor/translate/) · 모델 파일(huggingface.co).
// 내 글은 어디로도 보내지 않는다. 이 조각은 듣기 · 물어볼 말 화면에서 쓴다 (받아쓰기 모델 조각과 같은 실행기를 쓴다).

import { canRun, getModelInfo, KEEP, MODEL_CACHE, runtimeFiles, runtimeUrl, toMB } from './speech-model.js';
import { load, save } from './store.js';

const ON_KEY = 'translationModel.v1';

const tokenizerFiles = (info) => info.translation.tokenizer.files;
const tokenizerUrl = (info, f) => new URL(info.translation.tokenizer.dir + f.name, document.baseURI).href;
const modelUrl = (t, f) => `${t.host}${t.id}/resolve/${t.revision}/${f.as || f.name}`;
const modelBytes = (t) => t.files.reduce((a, f) => a + f.bytes, 0);

// 받을 것 전체의 크기 (실행기 · 단어 사전 · 모델).
export const totalBytes = (info) => [...runtimeFiles(info), ...tokenizerFiles(info)].reduce((a, f) => a + f.bytes, 0) + modelBytes(info.translation);

// 이 폰에 없는 것만 센 받을 크기: 받아쓰기 모델을 받아 두었으면 실행기는 이미 있다.
async function missing(info) {
  const t = info.translation;
  const keep = (await caches.has(KEEP)) ? await caches.open(KEEP) : null;
  const models = (await caches.has(MODEL_CACHE)) ? await caches.open(MODEL_CACHE) : null;
  const list = [];
  for (const f of runtimeFiles(info)) if (!(await keep?.match(runtimeUrl(info, f)))) list.push({ name: f.name, bytes: f.bytes });
  for (const f of tokenizerFiles(info)) if (!(await keep?.match(tokenizerUrl(info, f)))) list.push({ name: f.name, bytes: f.bytes });
  for (const f of t.files) if (!(await models?.match(modelUrl(t, f)))) list.push({ name: f.name, bytes: f.bytes });
  return list;
}

// 다 받아 두었는가.
export async function translationReady(info) {
  try { return (await missing(info)).length === 0; } catch { return false; }
}

export const isOn = () => load(ON_KEY, 'off') === 'on';
export const setOn = (on) => save(ON_KEY, on ? 'on' : 'off');

// 화면이 쓰는 한 줄: { can, ready, on, mb(아직 받을 크기), full(전체 크기), name, ... }
export async function translateStatus() {
  try {
    const info = await getModelInfo();
    if (!info.translation?.enabled) return { can: false, ready: false, on: false, mb: 0, full: 0, name: '' };
    const can = canRun();
    const ready = can && (await translationReady(info));
    const need = can ? await missing(info) : [];
    const t = info.translation;
    return { can, ready, on: ready && isOn(), mb: toMB(need.reduce((a, f) => a + f.bytes, 0)), full: toMB(totalBytes(info)), name: t.ko, license: t.license, by: t.by, source: t.source };
  } catch {
    return { can: false, ready: false, on: false, mb: 0, full: 0, name: '' };
  }
}

// 받는 데 걸리는 시간을 계산으로 보인다 (실제 회선이 아니다).
export function estimate(bytes, mbps) {
  const secs = (bytes * 8) / (mbps * 1e6);
  return secs < 90 ? `약 ${Math.max(10, Math.round(secs / 10) * 10)}초` : `약 ${Math.round(secs / 60)}분`;
}

let worker = null;
let loading = null;
const waiting = new Map();
let progressTo = null;
let idle = 0;

function startWorker(info) {
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    worker = new Worker(new URL('./translate-model.worker.js', import.meta.url), { type: 'module' });
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
    worker.postMessage({ type: 'load', runtime: info.runtime, model: info.translation });
  }).catch((e) => { worker?.terminate(); worker = null; loading = null; throw e; });
  return loading;
}

// 일이 끝나고 얼마 뒤에는 일꾼을 닫아 폰의 메모리를 돌려준다. 다음에 쓸 때 폰에 받아 둔 것을 다시 읽는다.
const IDLE_MS = 60000;
function stopWorker() {
  clearTimeout(idle);
  worker?.terminate();
  worker = null;
  loading = null;
  for (const w of waiting.values()) w.reject(new Error('번역을 멈췄다'));
  waiting.clear();
}

// 받는다. onProgress({ loaded, total })는 받은 크기를 알린다. 끝나면 모델이 돌 준비가 된 것이다. 받다 만 것은 이어서 받는다.
export async function downloadTranslation(onProgress) {
  const info = await getModelInfo();
  const t = info.translation;
  const need = await missing(info);
  const total = need.reduce((a, f) => a + f.bytes, 0);
  const got = new Map();
  const tell = () => onProgress?.({ loaded: Math.min(total, [...got.values()].reduce((a, b) => a + b, 0)), total });
  const keep = await caches.open(KEEP);
  const todo = (name) => need.some((f) => f.name === name);
  for (const f of runtimeFiles(info)) {
    if (!todo(f.name)) continue;
    const url = runtimeUrl(info, f);
    const res = await fetch(url, { cache: 'reload' });
    if (!res.ok) throw new Error(`실행기를 받지 못했다 (${f.name})`);
    await keep.put(url, res);
    got.set(f.name, f.bytes);
    tell();
  }
  for (const f of tokenizerFiles(info)) {
    if (!todo(f.name)) continue;
    const url = tokenizerUrl(info, f);
    const res = await fetch(url, { cache: 'reload' });
    if (!res.ok) throw new Error(`단어 사전을 받지 못했다 (${f.name})`);
    await keep.put(url, res);
    got.set(f.name, f.bytes);
    tell();
  }
  progressTo = (m) => { got.set(`m:${m.file}`, m.loaded); tell(); };
  try { await startWorker(info); } finally { progressTo = null; }
  for (const f of t.files) got.set(`m:${f.name}`, f.bytes);
  tell();
  setOn(true);
  // 받는 동안 쓴 메모리는 바로 돌려준다.
  stopWorker();
  return true;
}

// 지운다 (폰의 자리를 돌려받는다). 받아쓰기 모델이 폰에 있으면 같이 쓰는 실행기는 남긴다.
export async function removeTranslation() {
  stopWorker();
  const info = await getModelInfo();
  const t = info.translation;
  setOn(false);
  const models = (await caches.has(MODEL_CACHE)) ? await caches.open(MODEL_CACHE) : null;
  let dictationHeld = false;
  if (models) {
    for (const req of await models.keys()) {
      if (req.url.includes(`/${t.id}/`)) await models.delete(req);
      else if (req.url.includes(`/${info.dictation.id}/`)) dictationHeld = true;
    }
    if (!(await models.keys()).length) await caches.delete(MODEL_CACHE);
  }
  if (await caches.has(KEEP)) {
    if (dictationHeld) {
      const keep = await caches.open(KEEP);
      for (const f of tokenizerFiles(info)) await keep.delete(tokenizerUrl(info, f));
    } else await caches.delete(KEEP);
  }
}

let nextId = 1;
async function run(info, text) {
  clearTimeout(idle);
  const w = await startWorker(info);
  const id = nextId++;
  const done = new Promise((resolve, reject) => waiting.set(id, { resolve, reject }));
  w.postMessage({ type: 'run', id, text });
  try { return await done; } finally { idle = setTimeout(stopWorker, IDLE_MS); }
}

// 글을 문장으로 나눈다 (너무 긴 글은 한 번에 못 옮긴다). 한 토막은 300자 안쪽.
export function pieces(text) {
  const out = [];
  let cur = '';
  for (const s of String(text || '').replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s+/)) {
    if (cur && (cur + ' ' + s).length > 300) { out.push(cur); cur = s; } else cur = cur ? `${cur} ${s}` : s;
  }
  if (cur) out.push(cur);
  return out.flatMap((p) => (p.length > 400 ? p.match(/.{1,300}(\s|$)/g) : [p])).map((p) => p.trim()).filter(Boolean);
}

// 한 줄씩 차례로 돌린다 (폰 일꾼은 하나다). 옮긴 한국어를 돌려주고, 못 하면 null.
let chain = Promise.resolve();
export function translateText(text) {
  const job = chain.then(async () => {
    const info = await getModelInfo();
    const got = [];
    for (const p of pieces(text)) got.push((await run(info, p)).text);
    return got.join(' ').trim() || null;
  });
  chain = job.catch(() => {});
  return job.catch(() => null);
}
