//! 폰(브라우저)에서 부르는 문.
//!
//! wasm-bindgen 없이 숫자와 메모리 주소만 주고받는다. 붙이는 쪽은 `web/core.js`다.
//!
//! 차례:
//! 1. `ces_alloc(len)`으로 자리를 받아 색인 글(UTF-8)을 적고 `ces_load_index(ptr, len)`.
//!    이때 그 자리는 코어가 가져간다 (다시 `ces_free` 하지 않는다).
//! 2. 찾는 말을 `ces_alloc` 자리에 적고 `ces_search(ptr, len, limit)` → 찾은 개수.
//!    그 자리는 부른 쪽이 `ces_free`로 돌려준다.
//! 3. `ces_result_ptr()`에서 u32(작은 끝 먼저)를 개수만큼 읽는다. 다음 찾기 전까지만 쓸 수 있다.

use crate::index::Index;
use std::sync::Mutex;

/// 이 문의 판 번호. `web/core.js`가 맞는지 본다.
pub const ABI: u32 = 1;

struct State {
    index: Option<Index>,
    out: Vec<u32>,
}

static STATE: Mutex<State> = Mutex::new(State { index: None, out: Vec::new() });

fn state() -> std::sync::MutexGuard<'static, State> {
    STATE.lock().unwrap_or_else(|e| e.into_inner())
}

#[no_mangle]
pub extern "C" fn ces_abi() -> u32 {
    ABI
}

/// `len` 바이트 자리를 내준다.
#[no_mangle]
pub extern "C" fn ces_alloc(len: usize) -> *mut u8 {
    let mut v = Vec::<u8>::with_capacity(len.max(1));
    let p = v.as_mut_ptr();
    std::mem::forget(v);
    p
}

/// `ces_alloc(len)`으로 받은 자리를 돌려준다.
///
/// # Safety
/// `ptr`은 같은 `len`으로 부른 `ces_alloc`이 준 것이어야 하고, 한 번만 돌려준다.
#[no_mangle]
pub unsafe extern "C" fn ces_free(ptr: *mut u8, len: usize) {
    if !ptr.is_null() {
        drop(Vec::from_raw_parts(ptr, 0, len.max(1)));
    }
}

/// 색인 글을 읽어 둔다. 전시사 줄 수를 돌려주고, 못 읽으면 -1.
///
/// # Safety
/// `ptr`은 같은 `len`으로 부른 `ces_alloc`이 준 것이고 `len` 바이트가 다 적혀 있어야 한다.
/// 부른 뒤 그 자리는 코어의 것이다.
#[no_mangle]
pub unsafe extern "C" fn ces_load_index(ptr: *mut u8, len: usize) -> i32 {
    if ptr.is_null() {
        return -1;
    }
    let bytes = Vec::from_raw_parts(ptr, len, len.max(1));
    let parsed = String::from_utf8(bytes).ok().and_then(|text| Index::parse(text).ok());
    let mut st = state();
    st.out.clear();
    match parsed {
        Some(ix) => {
            let rows = ix.rows();
            st.index = Some(ix);
            i32::try_from(rows).unwrap_or(i32::MAX)
        }
        None => {
            st.index = None;
            -1
        }
    }
}

/// 찾는다. 찾은 개수를 돌려준다 (색인이 없거나 글이 UTF-8이 아니면 0).
///
/// # Safety
/// `ptr`에서 `len` 바이트를 읽을 수 있어야 한다.
#[no_mangle]
pub unsafe extern "C" fn ces_search(ptr: *const u8, len: usize, limit: u32) -> u32 {
    let query = if ptr.is_null() || len == 0 { &[][..] } else { std::slice::from_raw_parts(ptr, len) };
    let mut st = state();
    let hits = match (std::str::from_utf8(query), st.index.as_ref()) {
        (Ok(q), Some(ix)) => ix.search(q, limit as usize),
        _ => Vec::new(),
    };
    st.out = hits;
    st.out.len() as u32
}

/// 마지막 찾기 결과가 놓인 자리.
#[no_mangle]
pub extern "C" fn ces_result_ptr() -> *const u32 {
    state().out.as_ptr()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::index::Builder;

    unsafe fn put(bytes: &[u8]) -> *mut u8 {
        let p = ces_alloc(bytes.len());
        std::ptr::copy_nonoverlapping(bytes.as_ptr(), p, bytes.len());
        p
    }

    #[test]
    fn 문으로_읽고_찾는다() {
        let mut b = Builder::new();
        b.add_name(0, "Alpha Robotics");
        b.add_name(1, "Beta Home");
        b.add_other(1, "robotics");
        let text = b.finish(2);
        unsafe {
            assert_eq!(ces_abi(), ABI);
            assert_eq!(ces_load_index(put(text.as_bytes()), text.len()), 2);

            let q = "robot".as_bytes();
            let qp = put(q);
            let n = ces_search(qp, q.len(), 10);
            ces_free(qp, q.len());
            assert_eq!(n, 2);
            let rows = std::slice::from_raw_parts(ces_result_ptr(), n as usize);
            assert_eq!(rows, [0, 1]);

            // 깨진 글은 0건.
            let bad = [0xffu8, 0xfe];
            let bp = put(&bad);
            assert_eq!(ces_search(bp, bad.len(), 10), 0);
            ces_free(bp, bad.len());

            // 색인이 아닌 글을 넣으면 -1, 그 뒤 찾기는 0건.
            let junk = b"not an index";
            assert_eq!(ces_load_index(put(junk), junk.len()), -1);
            let qp = put(q);
            assert_eq!(ces_search(qp, q.len(), 10), 0);
            ces_free(qp, q.len());
        }
    }
}
