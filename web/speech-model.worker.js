// 폰 안 받아쓰기 모델을 돌리는 일꾼. 화면이 멈추지 않게 따로 돈다. 소리는 이 폰 밖으로 나가지 않는다.
// 실행기(vendor/speech/)는 같은 주소에서, 모델 파일은 huggingface.co에서 받는다. 한 번 받으면 폰에 남는다.

let asr = null;

self.onmessage = async (ev) => {
  const m = ev.data;
  try {
    if (m.type === 'load') {
      const base = new URL(m.runtime.dir, new URL('./', self.location.href));
      const { pipeline, env } = await import(new URL(m.runtime.entry, base).href);
      env.allowLocalModels = false;
      // 실행기 파일은 앱이 따로 담아 둔다 (speech-model.js의 KEEP). 두 번 담지 않는다.
      env.useWasmCache = false;
      env.backends.onnx.wasm.wasmPaths = { mjs: new URL(m.runtime.mjs, base).href, wasm: new URL(m.runtime.wasm, base).href };
      // GitHub Pages에서는 여러 가닥으로 돌릴 수 없다 (그에 필요한 머리글을 줄 수 없다).
      env.backends.onnx.wasm.numThreads = 1;
      asr = await pipeline('automatic-speech-recognition', m.model.id, {
        revision: m.model.revision,
        dtype: m.model.dtype,
        device: 'wasm',
        progress_callback: (p) => { if (p.status === 'progress' && p.file) self.postMessage({ type: 'progress', file: p.file, loaded: p.loaded || 0, total: p.total || 0 }); },
      });
      self.postMessage({ type: 'ready' });
    } else if (m.type === 'run') {
      if (!asr) throw new Error('모델을 아직 읽지 않았다');
      const began = performance.now();
      const out = await asr(m.audio);
      self.postMessage({ type: 'text', id: m.id, text: String(out?.text || '').trim(), ms: Math.round(performance.now() - began) });
    }
  } catch (e) {
    self.postMessage({ type: 'error', id: m.id, message: String(e?.message || e) });
  }
};
