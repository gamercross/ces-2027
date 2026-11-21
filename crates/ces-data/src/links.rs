//! 자료 파일에 적은 출처 링크가 살아 있는지 본다 (`ces-data check-links`).
//!
//! 자료 파일(JSON) 어디에 있든 `"url": "https://…"` 꼴의 값을 모아 하나씩 열어 본다.
//! 없어진 주소(404 · 410)만 "죽음"으로 치고, 자동 접속을 막는 곳(403 등)과 받지 못한 곳은 "확인 못 함"으로 둔다.

use serde_json::Value;
use std::collections::BTreeSet;
use std::time::Duration;

/// 링크 하나를 열어 본 결과.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum State {
    /// 열린다 (200 ~ 399).
    Alive,
    /// 없어졌다 (404 · 410).
    Dead,
    /// 자동 접속을 막거나 받지 못했다. 사람이 브라우저로 본다.
    Unknown,
}

impl State {
    pub fn ko(self) -> &'static str {
        match self {
            State::Alive => "살아 있음",
            State::Dead => "죽음",
            State::Unknown => "확인 못 함",
        }
    }
}

/// 답의 상태 숫자로 가른다. 받지 못했으면 `None`.
pub fn classify(status: Option<u16>) -> State {
    match status {
        Some(200..=399) => State::Alive,
        Some(404 | 410) => State::Dead,
        _ => State::Unknown,
    }
}

/// JSON 안의 `url` 값(https)을 모두 모은다. 같은 주소는 한 번만, 글자 차례로.
pub fn collect(json: &Value) -> Vec<String> {
    fn walk(v: &Value, out: &mut BTreeSet<String>) {
        match v {
            Value::Object(map) => {
                for (k, child) in map {
                    match child {
                        Value::String(s) if k == "url" && s.starts_with("https://") => {
                            out.insert(s.clone());
                        }
                        _ => walk(child, out),
                    }
                }
            }
            Value::Array(list) => list.iter().for_each(|child| walk(child, out)),
            _ => {}
        }
    }
    let mut out = BTreeSet::new();
    walk(json, &mut out);
    out.into_iter().collect()
}

/// 링크를 하나씩 열어 본다. 사이에 조금 쉰다.
pub fn check(urls: &[String]) -> Vec<(String, Option<u16>, State)> {
    // 폰 브라우저처럼 묻는다. 우리가 누구인지는 싣지 않는다.
    let config = ureq::Agent::config_builder()
        .timeout_global(Some(Duration::from_secs(30)))
        .user_agent("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36")
        .http_status_as_error(false)
        .build();
    let agent: ureq::Agent = config.into();
    let mut out = Vec::new();
    for url in urls {
        let status = agent.get(url).call().ok().map(|res| res.status().as_u16());
        out.push((url.clone(), status, classify(status)));
        std::thread::sleep(Duration::from_millis(300));
    }
    out
}

/// 살핀 것을 표(마크다운)로 적는다.
pub fn table(rows: &[(String, Option<u16>, State)]) -> String {
    let mut out = String::from("| 상태 | 답 | 주소 |\n|---|---|---|\n");
    for (url, status, state) in rows {
        let code = status.map(|s| s.to_string()).unwrap_or_else(|| "받지 못함".into());
        out.push_str(&format!("| {} | {} | {} |\n", state.ko(), code, url));
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn collects_https_urls_once_in_order() {
        let v = json!({
            "items": [
                { "apply": { "url": "https://b.example/x", "ko": "신청" }, "sources": [{ "url": "https://a.example/1" }, { "url": "https://b.example/x" }] },
                { "apply": { "url": null }, "sources": [{ "url": "http://plain.example/" }, { "ko": "url", "note": "https://not-a-url-key.example" }] }
            ]
        });
        assert_eq!(collect(&v), vec!["https://a.example/1".to_string(), "https://b.example/x".to_string()]);
    }

    #[test]
    fn only_gone_pages_are_dead() {
        assert_eq!(classify(Some(200)), State::Alive);
        assert_eq!(classify(Some(301)), State::Alive);
        assert_eq!(classify(Some(404)), State::Dead);
        assert_eq!(classify(Some(410)), State::Dead);
        assert_eq!(classify(Some(403)), State::Unknown);
        assert_eq!(classify(Some(503)), State::Unknown);
        assert_eq!(classify(None), State::Unknown);
    }

    #[test]
    fn table_lists_every_row() {
        let t = table(&[("https://a.example/".into(), Some(200), State::Alive), ("https://b.example/".into(), None, State::Unknown)]);
        assert!(t.contains("| 살아 있음 | 200 | https://a.example/ |"));
        assert!(t.contains("| 확인 못 함 | 받지 못함 | https://b.example/ |"));
    }
}
