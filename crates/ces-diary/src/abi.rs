//! 폰(브라우저)에서 부르는 문. `ces-core`의 문(abi.rs)과 같은 방식이다: wasm-bindgen 없이 숫자와 메모리 주소만 주고받는다.
//! 붙이는 쪽은 `web/diarycore.js`다.
//!
//! 차례:
//! 1. `ces_diary_alloc(len)`으로 자리를 받아 일기 파일 하나의 글(UTF-8)을 적고 `ces_diary_add(ptr, len)`.
//!    이때 그 자리는 코어가 가져간다(다시 `ces_diary_free` 하지 않는다). 읽은 일기 수를 돌려주고, 못 읽으면 음수 +
//!    까닭을 `ces_diary_out_ptr()` / `ces_diary_out_len()`에 둔다. 파일마다 한 번씩 부른다.
//! 2. 만든 때를 `ces_diary_alloc` 자리에 적고 `ces_diary_page(ptr, len)` → 한 장(마크다운)의 길이. 글은 `ces_diary_out_ptr()`에 있다.
//!    그 자리는 부른 쪽이 `ces_diary_free`로 돌려준다. 같은 일기는 한 번만 센다(합치기는 `merge`).
//! 3. `ces_diary_reset()`으로 다 비운다. 고른 파일과 한 장은 이 안에만 있다 — 폰의 어떤 저장소에도 쓰지 않는다.

use crate::{merge, one_page, read_bundle, Entry};
use serde_json::Value;
use std::sync::Mutex;

/// 이 문의 판 번호. `web/diarycore.js`가 맞는지 본다.
pub const ABI: u32 = 1;

/// 파일을 못 읽은 까닭.
pub const NOT_JSON: i32 = -1;
pub const NOT_DIARY: i32 = -2;

struct State {
    bundles: Vec<Vec<Entry>>,
    out: Vec<u8>,
}

static STATE: Mutex<State> = Mutex::new(State { bundles: Vec::new(), out: Vec::new() });

fn state() -> std::sync::MutexGuard<'static, State> {
    STATE.lock().unwrap_or_else(|e| e.into_inner())
}

#[no_mangle]
pub extern "C" fn ces_diary_abi() -> u32 {
    ABI
}

/// `len` 바이트 자리를 내준다.
#[no_mangle]
pub extern "C" fn ces_diary_alloc(len: usize) -> *mut u8 {
    let mut v = Vec::<u8>::with_capacity(len.max(1));
    let p = v.as_mut_ptr();
    std::mem::forget(v);
    p
}

/// `ces_diary_alloc(len)`으로 받은 자리를 돌려준다.
///
/// # Safety
/// `ptr`은 같은 `len`으로 부른 `ces_diary_alloc`이 준 것이어야 하고, 한 번만 돌려준다.
#[no_mangle]
pub unsafe extern "C" fn ces_diary_free(ptr: *mut u8, len: usize) {
    if !ptr.is_null() {
        drop(Vec::from_raw_parts(ptr, 0, len.max(1)));
    }
}

/// 다 비운다: 읽어 둔 파일과 만든 한 장.
#[no_mangle]
pub extern "C" fn ces_diary_reset() {
    let mut st = state();
    st.bundles = Vec::new();
    st.out = Vec::new();
}

/// 일기 파일 하나(글)를 읽어 둔다. 읽은 일기 수를 돌려주고, 못 읽으면 음수와 까닭(`ces_out_*`).
///
/// # Safety
/// `ptr`은 같은 `len`으로 부른 `ces_diary_alloc`이 준 것이고 `len` 바이트가 다 적혀 있어야 한다. 부른 뒤 그 자리는 코어의 것이다.
#[no_mangle]
pub unsafe extern "C" fn ces_diary_add(ptr: *mut u8, len: usize) -> i32 {
    if ptr.is_null() {
        return NOT_JSON;
    }
    let bytes = Vec::from_raw_parts(ptr, len, len.max(1));
    let mut st = state();
    let parsed: Result<Value, String> = std::str::from_utf8(&bytes).map_err(|_| "글자 모양(UTF-8)이 아니다".to_string()).and_then(|t| serde_json::from_str(t).map_err(|e| format!("JSON이 아니다 ({e})")));
    let (code, msg) = match parsed {
        Err(m) => (NOT_JSON, m),
        Ok(json) => match read_bundle(&json) {
            Ok(entries) => {
                let n = entries.len() as i32;
                st.bundles.push(entries);
                (n, String::new())
            }
            Err(m) => (NOT_DIARY, m),
        },
    };
    st.out = msg.into_bytes();
    code
}

/// 읽어 둔 파일들을 합쳐 네 태그로 나눈 한 장(마크다운)을 만든다. 한 장의 바이트 수를 돌려준다.
///
/// # Safety
/// `ptr`에서 `len` 바이트를 읽을 수 있어야 한다.
#[no_mangle]
pub unsafe extern "C" fn ces_diary_page(ptr: *const u8, len: usize) -> usize {
    let made_at = if ptr.is_null() || len == 0 { "" } else { std::str::from_utf8(std::slice::from_raw_parts(ptr, len)).unwrap_or("") };
    let mut st = state();
    let all = merge(st.bundles.clone());
    st.out = one_page(&all, made_at).into_bytes();
    st.out.len()
}

/// 합친 뒤 일기가 몇 개인가(같은 일기는 한 번만 센다).
#[no_mangle]
pub extern "C" fn ces_diary_count() -> u32 {
    let st = state();
    merge(st.bundles.clone()).len() as u32
}

/// 마지막으로 만든 글(한 장 또는 못 읽은 까닭)이 놓인 자리와 길이.
#[no_mangle]
pub extern "C" fn ces_diary_out_ptr() -> *const u8 {
    state().out.as_ptr()
}

#[no_mangle]
pub extern "C" fn ces_diary_out_len() -> usize {
    state().out.len()
}

#[cfg(test)]
mod tests {
    use super::*;

    unsafe fn put(bytes: &[u8]) -> *mut u8 {
        let p = ces_diary_alloc(bytes.len());
        std::ptr::copy_nonoverlapping(bytes.as_ptr(), p, bytes.len());
        p
    }
    unsafe fn out() -> String {
        String::from_utf8(std::slice::from_raw_parts(ces_diary_out_ptr(), ces_diary_out_len()).to_vec()).unwrap()
    }

    #[test]
    fn 문으로_파일을_읽고_한_장을_만든다() {
        let file = r#"{"app":"ces-2027-diary","v":1,"author":{"nick":"가짜 가"},"entries":[{"id":"a1","date":"2027-01-06","company":"Alpha","saw":"본 것","felt":"","for":["stu"]}]}"#;
        unsafe {
            assert_eq!(ces_diary_abi(), ABI);
            ces_diary_reset();
            assert_eq!(ces_diary_add(put(file.as_bytes()), file.len()), 1);
            // 같은 파일을 한 번 더 골라도 같은 일기는 한 번만 센다.
            assert_eq!(ces_diary_add(put(file.as_bytes()), file.len()), 1);
            assert_eq!(ces_diary_count(), 1);
            // 일기 파일이 아닌 것과 JSON이 아닌 것은 까닭과 함께 거절한다.
            let other = r#"{"app":"other","v":1}"#;
            assert_eq!(ces_diary_add(put(other.as_bytes()), other.len()), NOT_DIARY);
            assert!(out().contains("일기를 내보낸 파일이 아니다"));
            let junk = b"not json";
            assert_eq!(ces_diary_add(put(junk), junk.len()), NOT_JSON);
            let bad = [0xffu8, 0xfe];
            assert_eq!(ces_diary_add(put(&bad), bad.len()), NOT_JSON);

            let at = "2027-01-15T00:00:00Z".as_bytes();
            let ap = put(at);
            let n = ces_diary_page(ap, at.len());
            ces_diary_free(ap, at.len());
            let page = out();
            assert_eq!(n, page.len());
            assert!(page.contains("## 학생 (일기 1개 · 회사 1곳)") && page.contains("- 만든 때: 2027-01-15T00:00:00Z"));
            // 비우면 처음처럼 일기 0개.
            ces_diary_reset();
            assert_eq!(ces_diary_count(), 0);
            assert_eq!(ces_diary_out_len(), 0);
        }
    }
}
