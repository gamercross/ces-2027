// 모은 일기 정리용 코어(diary.wasm)를 붙인다. "모은 일기 열기" 화면을 열 때만 받는다(첫 화면에는 싣지 않는다).
// wasm-bindgen 없이 숫자와 메모리 주소만 주고받는다. 문의 차례는 crates/ces-diary/src/abi.rs에 있다.
// 브라우저와 Node(시험)에서 같이 쓴다. 고른 파일과 만든 한 장은 이 안(메모리)에만 있고 어디에도 저장하지 않는다.

const ABI = 1;

export async function loadDiaryCore(source) {
  let instance;
  if (source instanceof ArrayBuffer || ArrayBuffer.isView(source)) {
    ({ instance } = await WebAssembly.instantiate(source, {}));
  } else {
    const res = await source;
    ({ instance } = await WebAssembly.instantiate(await res.arrayBuffer(), {}));
  }
  return wrap(instance.exports);
}

function wrap(x) {
  if (x.ces_diary_abi() !== ABI) throw new Error('일기 코어 판 번호가 다르다');
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  // 메모리가 늘면 buffer가 바뀌므로 자리를 받은 뒤에 다시 본다.
  const put = (bytes) => {
    const ptr = x.ces_diary_alloc(bytes.length);
    new Uint8Array(x.memory.buffer, ptr, bytes.length).set(bytes);
    return ptr;
  };
  const out = () => dec.decode(new Uint8Array(x.memory.buffer, x.ces_diary_out_ptr(), x.ces_diary_out_len()).slice());
  return {
    // 일기 파일 하나(글)를 읽어 둔다. { ok: true, entries } 또는 { ok: false, why }.
    add(text) {
      const bytes = enc.encode(text);
      const n = x.ces_diary_add(put(bytes), bytes.length);
      return n >= 0 ? { ok: true, entries: n } : { ok: false, why: out() };
    },
    // 합친 일기 수(같은 일기는 한 번만 센다).
    count() { return x.ces_diary_count(); },
    // 네 태그로 나눈 한 장(마크다운). madeAt은 만든 때(ISO).
    page(madeAt) {
      const bytes = enc.encode(madeAt);
      const ptr = put(bytes);
      x.ces_diary_page(ptr, bytes.length);
      x.ces_diary_free(ptr, bytes.length);
      return out();
    },
    // 읽어 둔 파일과 한 장을 다 비운다.
    reset() { x.ces_diary_reset(); },
  };
}

// 한 장(마크다운)을 화면에 그릴 꼴로 읽는다. 한 장의 꼴은 crates/ces-diary의 one_page가 정한다.
// { head: [줄...], tags: [{ title, entries, companies, none, list: [{ name, booth, count, parts: [{ label, lines: [글] }] }] }] }
export function parseOnePage(md) {
  const sections = String(md).split('\n## ');
  const head = sections.shift().split('\n').filter((l) => l.startsWith('- ')).map((l) => l.slice(2));
  const tags = sections.map((block) => {
    const [titleLine, ...rest] = block.split('\n');
    const m = titleLine.match(/^(.+) \(일기 (\d+)개 · 회사 (\d+)곳\)$/);
    const list = [];
    for (const chunk of rest.join('\n').split('\n### ').slice(1)) {
      const [nameLine, ...body] = chunk.split('\n');
      const n = nameLine.match(/^(.*?)(?: \(부스 (.+?)\))?(?: · 일기 (\d+)개)?$/);
      const parts = [];
      for (const line of body) {
        if (line === '본 것' || line === '느낀 점' || line === '사진') parts.push({ label: line, lines: [] });
        else if (line.startsWith('- ') && parts.length) parts.at(-1).lines.push(line.slice(2));
        else if (line.startsWith('- ')) { parts.push({ label: '', lines: [line.slice(2)] }); }
      }
      list.push({ name: n[1], booth: n[2] || '', count: Number(n[3] || 1), parts });
    }
    return { title: m ? m[1] : titleLine, entries: m ? Number(m[2]) : 0, companies: m ? Number(m[3]) : 0, list };
  });
  return { head, tags };
}
