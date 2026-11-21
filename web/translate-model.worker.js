// 폰 안 영한 번역 모델을 돌리는 일꾼. 화면이 멈추지 않게 따로 돈다. 글은 이 폰 밖으로 나가지 않는다.
// 실행기(vendor/speech/)와 단어 사전(vendor/translate/)은 같은 주소에서, 모델 파일은 huggingface.co의 고정한 판에서 받는다.
// 모델 파일은 받는 즉시 크기와 sha256을 못 박아 둔 것과 맞춘다. 맞지 않으면 쓰지 않는다. 한 번 받으면 폰에 남는다.
//
// 이 모델(OPUS-MT tc-big 영한)은 영어 사전과 한국어 사전이 따로다. 그래서 Transformers.js의 translation 파이프라인
// (사전 한 장으로 풀어 읽는다)은 쓰지 못하고, 인코더 · 디코더를 불러 해독을 직접 돈다 (욕심 내지 않는 해독: 한 걸음에 가장 높은 것 하나).
// 디코더는 이전 계산을 이어 쓰지 않는 한 장짜리라(받을 크기를 300MB 아래로 두려고) 걸음마다 앞부분을 다시 계산한다.

let T = null;
let enc = null;
let dec = null;
let src = null;
let tgt = null;

const PAD = 32000;
const EOS = 2;
const V = 32001;
const TOKENIZER_CONFIG = { tokenizer_class: 'MarianTokenizer', model_max_length: 512, unk_token: '<unk>', eos_token: '</s>', pad_token: '<pad>', clean_up_tokenization_spaces: false };

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

// 정해 둔 파일만 받는다 (목록에 없는 주소는 막는다). 받으면서 크기를 알리고, 다 받으면 크기 · sha256을 맞춘다.
function guardedFetch(model) {
  const base = `${model.host}${model.id}/resolve/${model.revision}/`;
  return async (input) => {
    const url = String(input?.url || input);
    const file = model.files.find((f) => url === `${base}${f.as || f.name}`);
    if (!file) return new Response('정해 둔 파일이 아니다', { status: 404 });
    const res = await fetch(`${base}${file.name}`, { cache: 'no-store' });
    if (!res.ok) return res;
    const bytes = new Uint8Array(file.bytes);
    let at = 0;
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (at + value.length > bytes.length) throw new Error(`${file.name}: 정해 둔 크기보다 크다`);
      bytes.set(value, at);
      at += value.length;
      self.postMessage({ type: 'progress', file: file.name, loaded: at, total: file.bytes });
    }
    if (at !== file.bytes) throw new Error(`${file.name}: 크기가 다르다 (${at} / ${file.bytes})`);
    const got = hex(await crypto.subtle.digest('SHA-256', bytes));
    if (got !== file.sha256) throw new Error(`${file.name}: 못 박아 둔 것과 다르다 (sha256 ${got.slice(0, 12)}…). 쓰지 않는다`);
    return new Response(bytes, { status: 200, headers: { 'content-type': file.name.endsWith('.json') ? 'application/json' : 'application/octet-stream', 'content-length': String(bytes.length) } });
  };
}

async function sameOriginJson(url, file) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`단어 사전을 읽지 못했다 (${file.name})`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length !== file.bytes || hex(await crypto.subtle.digest('SHA-256', bytes)) !== file.sha256) throw new Error(`${file.name}: 못 박아 둔 것과 다르다`);
  return JSON.parse(new TextDecoder().decode(bytes));
}

async function load(m) {
  const base = new URL(m.runtime.dir, new URL('./', self.location.href));
  T = await import(new URL(m.runtime.entry, base).href);
  const { env, AutoModelForSeq2SeqLM, PreTrainedTokenizer } = T;
  env.allowLocalModels = false;
  env.remoteHost = m.model.host;
  env.remotePathTemplate = `{model}/resolve/${m.model.revision}/`;
  env.useWasmCache = false;
  env.backends.onnx.wasm.wasmPaths = { mjs: new URL(m.runtime.mjs, base).href, wasm: new URL(m.runtime.wasm, base).href };
  env.backends.onnx.wasm.numThreads = 1;
  env.fetch = guardedFetch(m.model);

  const dir = new URL(m.model.tokenizer.dir, new URL('./', self.location.href));
  const [srcFile, tgtFile] = ['source-tokenizer.json', 'target-tokenizer.json'].map((n) => m.model.tokenizer.files.find((f) => f.name === n));
  src = new PreTrainedTokenizer(await sameOriginJson(new URL(srcFile.name, dir).href, srcFile), TOKENIZER_CONFIG);
  tgt = new PreTrainedTokenizer(await sameOriginJson(new URL(tgtFile.name, dir).href, tgtFile), TOKENIZER_CONFIG);

  // 폴더 이름(int8)을 주고 fp32 이름으로 읽는다: encoder_model.onnx · decoder_model_merged.onnx. 뒤의 것은 위 guardedFetch가 decoder_model.onnx로 바꿔 받는다.
  const model = await AutoModelForSeq2SeqLM.from_pretrained(m.model.id, { subfolder: 'int8', dtype: 'fp32', device: 'wasm' });
  enc = model.sessions.model;
  dec = model.sessions.decoder_model_merged;
  if (!enc || !dec) throw new Error('인코더나 디코더를 열지 못했다');
}

async function translate(text) {
  const { Tensor } = T;
  const inputs = src(text);
  const ids = inputs.input_ids;
  const n = ids.dims[1];
  const mask = new Tensor('int64', BigInt64Array.from({ length: n }, () => 1n), [1, n]);
  const hidden = (await enc.run({ input_ids: ids, attention_mask: mask })).last_hidden_state;
  const made = [PAD];
  const most = Math.min(120, n * 2 + 10);
  try {
    for (let i = 0; i < most; i++) {
      const o = await dec.run({ encoder_attention_mask: mask, input_ids: new Tensor('int64', BigInt64Array.from(made, BigInt), [1, made.length]), encoder_hidden_states: hidden }, ['logits']);
      const row = o.logits.data;
      const off = (made.length - 1) * V;
      let best = -1;
      let top = -Infinity;
      for (let k = 0; k < V; k++) {
        if (k === PAD) continue;
        if (row[off + k] > top) { top = row[off + k]; best = k; }
      }
      o.logits.dispose?.();
      if (best === EOS) break;
      made.push(best);
    }
  } finally {
    hidden.dispose?.();
  }
  return tgt.decode(made.slice(1), { skip_special_tokens: true }).trim();
}

self.onmessage = async (ev) => {
  const m = ev.data;
  try {
    if (m.type === 'load') {
      await load(m);
      self.postMessage({ type: 'ready' });
    } else if (m.type === 'run') {
      if (!enc) throw new Error('모델을 아직 읽지 않았다');
      const began = performance.now();
      const ko = await translate(m.text);
      self.postMessage({ type: 'text', id: m.id, text: ko, ms: Math.round(performance.now() - began) });
    }
  } catch (e) {
    self.postMessage({ type: 'error', id: m.id, message: String(e?.message || e) });
  }
};
