//! 자료를 받는 곳: 공식 사이트(`Http`)나 받아 둔 폴더(`Dir`).

use std::path::PathBuf;
use std::time::Duration;

/// CES 공식 전시사 검색 (Map Your Show 8.0).
pub const ORIGIN: &str = "https://exhibitors.ces.tech";
const PROXY: &str = "/8_0/ajax/remote-proxy.cfm";
const REFERER: &str = "/8_0/explore/exhibitor-gallery.cfm?featured=false";
const USER_AGENT: &str = "Mozilla/5.0 (ces-2027 data refresh)";

/// 물음 하나에 답 글(JSON) 하나.
pub trait Source {
    fn get(&mut self, query: &str) -> Result<String, String>;
}

/// 물음을 파일 이름으로 바꾼다 (받아 둔 답을 폴더에 두고 다시 읽을 때).
pub fn file_name(query: &str) -> String {
    let mut s: String = query.chars().map(|c| if c.is_ascii_alphanumeric() { c } else { '_' }).collect();
    s.push_str(".json");
    s
}

/// `encodeURIComponent`와 같은 규칙으로 물음 값을 싼다.
pub fn encode(value: &str) -> String {
    let mut out = String::new();
    for b in value.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'!' | b'~' | b'*' | b'\'' | b'(' | b')' => out.push(b as char),
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

/// 공식 사이트에서 받는다.
///
/// 이 사이트는 `X-Requested-With: XMLHttpRequest` 머리글이 없으면 403을 준다.
/// 물음은 하나씩, 사이에 쉬면서 보낸다.
pub struct Http {
    agent: ureq::Agent,
    delay: Duration,
    save_to: Option<PathBuf>,
    pub calls: usize,
}

impl Http {
    /// `save_to`를 주면 받은 답을 그 폴더에 그대로 둔다.
    pub fn new(save_to: Option<PathBuf>) -> Result<Http, String> {
        let delay_ms = std::env::var("CES_DELAY_MS").ok().and_then(|s| s.parse().ok()).unwrap_or(150u64);
        let config = ureq::Agent::config_builder().timeout_global(Some(Duration::from_secs(60))).user_agent(USER_AGENT).build();
        if let Some(dir) = &save_to {
            std::fs::create_dir_all(dir).map_err(|e| format!("{}: {e}", dir.display()))?;
        }
        Ok(Http { agent: config.into(), delay: Duration::from_millis(delay_ms), save_to, calls: 0 })
    }

    fn once(&self, url: &str) -> Result<String, String> {
        let mut res = self
            .agent
            .get(url)
            .header("X-Requested-With", "XMLHttpRequest")
            .header("Accept", "application/json, text/plain, */*")
            .header("Referer", &format!("{ORIGIN}{REFERER}"))
            .call()
            .map_err(|e| e.to_string())?;
        res.body_mut().read_to_string().map_err(|e| e.to_string())
    }
}

impl Source for Http {
    fn get(&mut self, query: &str) -> Result<String, String> {
        let url = format!("{ORIGIN}{PROXY}?{query}");
        let mut last = String::new();
        for wait in [0u64, 2, 6] {
            if wait > 0 {
                std::thread::sleep(Duration::from_secs(wait));
            }
            match self.once(&url) {
                Ok(text) => {
                    self.calls += 1;
                    if let Some(dir) = &self.save_to {
                        let path = dir.join(file_name(query));
                        std::fs::write(&path, &text).map_err(|e| format!("{}: {e}", path.display()))?;
                    }
                    std::thread::sleep(self.delay);
                    return Ok(text);
                }
                Err(e) => last = e,
            }
        }
        Err(format!("공식 사이트에서 받지 못했다 ({query}): {last}"))
    }
}

/// 받아 둔 폴더에서 읽는다 (시험할 때, 인터넷 없이 다시 지을 때).
pub struct Dir {
    pub dir: PathBuf,
}

impl Source for Dir {
    fn get(&mut self, query: &str) -> Result<String, String> {
        let path = self.dir.join(file_name(query));
        std::fs::read_to_string(&path).map_err(|e| format!("{}: {e}", path.display()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 물음_값을_싼다() {
        assert_eq!(encode("South Korea"), "South%20Korea");
        assert_eq!(encode("Vehicle Tech & Advanced Mobility"), "Vehicle%20Tech%20%26%20Advanced%20Mobility");
        assert_eq!(encode("IoT/Sensors"), "IoT%2FSensors");
        assert_eq!(encode("Côte d'Ivoire"), "C%C3%B4te%20d'Ivoire");
    }

    #[test]
    fn 물음을_파일_이름으로() {
        assert_eq!(file_name("action=search&searchtype=country&search=South%20Korea&searchsize=500&start=0"), "action_search_searchtype_country_search_South_20Korea_searchsize_500_start_0.json");
    }
}
