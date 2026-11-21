//! 공식 전시사 검색에서 받는 차례 (`reference/미리보기판/fetch-ces.mjs`에서 옮겼다).
//!
//! 1. 전시사 전부 (`exhibitorgallery` 검색, 500곳씩)
//! 2. 분야 목록과 분야마다 전시사 (`category` 검색)
//! 3. 나라 목록과 나라마다 전시사 (`country` 검색)

use crate::source::{encode, Source};
use serde_json::Value;

const PAGE: usize = 500;
const VIEW_ALL: f64 = 999_999_999.0;

/// 받은 그대로의 자료.
pub struct Raw {
    /// 전시사마다 `fields` 객체.
    pub exhibitors: Vec<Value>,
    /// 공식 분야 이름 (사이트가 준 차례).
    pub cats: Vec<String>,
    /// 분야마다 전시사 id (`cats`와 같은 차례).
    pub cat_members: Vec<Vec<String>>,
    /// 나라 이름과 그 나라 전시사 id (사이트가 준 차례).
    pub countries: Vec<(String, Vec<String>)>,
}

fn get_json(src: &mut dyn Source, query: &str) -> Result<Value, String> {
    let text = src.get(query)?;
    let v: Value = serde_json::from_str(&text).map_err(|e| format!("답이 JSON이 아니다 ({query}): {e}"))?;
    if v.get("SUCCESS").and_then(Value::as_bool) == Some(false) {
        return Err(format!("사이트가 실패라고 답했다 ({query}): {}", v.get("ERRORMESSAGE").and_then(Value::as_str).unwrap_or("")));
    }
    Ok(v)
}

fn options(src: &mut dyn Source, function: &str) -> Result<Vec<Value>, String> {
    let query = format!("action=getsearchoptions&function={function}");
    let v = get_json(src, &query)?;
    v.get("DATA").and_then(Value::as_array).cloned().ok_or_else(|| format!("답에 DATA 목록이 없다 ({query})"))
}

/// 한 검색의 전시사를 끝까지 받는다.
fn search_all(src: &mut dyn Source, kind: &str, value: Option<&str>) -> Result<Vec<Value>, String> {
    let mut out = Vec::new();
    for start in (0..10_000).step_by(PAGE) {
        let search = value.map(|v| format!("&search={}", encode(v))).unwrap_or_default();
        let query = format!("action=search&searchtype={kind}{search}&searchsize={PAGE}&start={start}");
        let v = get_json(src, &query)?;
        let ex = &v["DATA"]["results"]["exhibitor"];
        let Some(hits) = ex.get("hit").and_then(Value::as_array) else { break };
        out.extend(hits.iter().map(|h| h["fields"].clone()));
        let found = ex.get("found").and_then(Value::as_f64).unwrap_or(0.0);
        if hits.is_empty() || out.len() as f64 >= found {
            break;
        }
    }
    Ok(out)
}

/// 값이 글이든 숫자든 글로 읽는다.
pub fn text_of(v: &Value) -> Option<String> {
    match v {
        Value::String(s) => Some(s.clone()),
        Value::Number(n) => Some(n.to_string()),
        _ => None,
    }
}

/// 전부 받는다. `log`는 걸음마다 한 줄씩 받는다.
pub fn fetch_all(src: &mut dyn Source, log: &mut dyn FnMut(&str)) -> Result<Raw, String> {
    log("전시사 목록을 받는다");
    let exhibitors = search_all(src, "exhibitorgallery", None)?;
    if exhibitors.is_empty() {
        return Err("전시사가 하나도 오지 않았다".into());
    }
    log(&format!("전시사 {}곳", exhibitors.len()));

    let cats: Vec<String> = options(src, "getsearchcategories&exhibitorgallery=true")?
        .iter()
        .filter(|d| d.get("fieldvalue").and_then(Value::as_f64) != Some(VIEW_ALL))
        .filter_map(|d| d.get("fielddisplay").and_then(Value::as_str).map(str::to_string))
        .collect();
    let mut cat_members = Vec::with_capacity(cats.len());
    for c in &cats {
        let query = format!("action=search&searchtype=category&search={}&searchsize=50&start=0", encode(c));
        let v = get_json(src, &query)?;
        let hits = v["DATA"]["results"]["category"]["hit"].as_array().cloned().unwrap_or_default();
        let same = hits.iter().find(|h| h["fields"]["category_t"].as_str().is_some_and(|t| t.eq_ignore_ascii_case(c)));
        let ids = same
            .or(hits.first())
            .and_then(|h| h["fields"]["exhid_t"].as_str())
            .map(|s| s.split(',').map(str::trim).filter(|s| !s.is_empty()).map(str::to_string).collect())
            .unwrap_or_default();
        cat_members.push(ids);
    }
    log(&format!("분야 {}개", cats.len()));

    let names: Vec<String> = options(src, "getcountries")?.iter().filter_map(|d| d.get("fieldvalue").and_then(text_of)).collect();
    let mut countries = Vec::with_capacity(names.len());
    for name in names {
        let ids = search_all(src, "country", Some(&name))?.iter().filter_map(|f| f.get("exhid_l").and_then(text_of)).collect();
        countries.push((name, ids));
    }
    log(&format!("나라 {}곳", countries.len()));

    Ok(Raw { exhibitors, cats, cat_members, countries })
}
