// 폰용 코어(core.wasm)를 붙인다.
// wasm-bindgen 없이 숫자와 메모리 주소만 주고받는다. 문의 차례는 crates/ces-core/src/abi.rs에 있다.

const ABI = 1;

// source: fetch 응답(또는 그 약속)이나 바이트. 브라우저와 Node(시험)에서 같이 쓴다.
export async function loadCore(source) {
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
  if (x.ces_abi() !== ABI) throw new Error('코어 판 번호가 다르다');
  const enc = new TextEncoder();
  // 메모리가 늘면 buffer가 바뀌므로 자리를 받은 뒤에 다시 본다.
  const put = (bytes) => {
    const ptr = x.ces_alloc(bytes.length);
    new Uint8Array(x.memory.buffer, ptr, bytes.length).set(bytes);
    return ptr;
  };
  return {
    // 찾기 색인(search-index.txt의 바이트)을 읽어 둔다. 전시사 줄 수를 돌려준다.
    loadIndex(bytes) {
      const rows = x.ces_load_index(put(bytes), bytes.length);
      if (rows < 0) throw new Error('찾기 색인을 읽지 못했다');
      return rows;
    },
    // 찾는다. exhibitors.json의 ex 배열 자리(줄 번호)를 잘 맞는 차례로 돌려준다.
    search(query, limit = 50) {
      const bytes = enc.encode(query);
      const ptr = put(bytes);
      const n = x.ces_search(ptr, bytes.length, limit);
      x.ces_free(ptr, bytes.length);
      return n ? Array.from(new Uint32Array(x.memory.buffer, x.ces_result_ptr(), n)) : [];
    },
  };
}
