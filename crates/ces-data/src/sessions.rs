//! CES 공식 일정(ces.tech/schedule)에서 기조연설 · 세션을 받아 줄인다.
//!
//! 일정 사이트는 날짜마다 한 쪽(`?date=YYYY-MM-DD`)을 글(HTML)로 준다. 별도 자료 주소는 없어 쪽에서 읽는다.
//! 지키는 것: robots.txt가 막은 주소(`?q=` · `?type=` · `?topics=` …)는 묻지 않는다. 날짜 쪽만 천천히(기본 2초 간격) 묻는다.
//! 하루에 한 번만 묻는 것은 Actions 캐시가 맡는다(.github/workflows/pages.yml).
//! 못 받으면 못 받았다고 알리고, 짐작해서 채우지 않는다.

use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::time::Duration;

pub const ORIGIN: &str = "https://www.ces.tech";
const USER_AGENT: &str = "Mozilla/5.0 (ces-2027 data refresh)";

/// 일정 한 줄.
#[derive(Debug, Clone, PartialEq)]
pub struct Session {
    pub id: String,
    pub date: String,
    pub from: String,
    pub to: String,
    pub title: String,
    pub place: String,
    pub topics: Vec<String>,
    pub track: String,
    pub url: String,
    /// 공식 목록에 생중계(라이브) 표시가 붙었는가. 보는 주소는 목록에 없다.
    pub live: bool,
}

/// 쪽(글) 하나를 가져오는 곳: 공식 사이트나 받아 둔 폴더.
pub trait Pages {
    /// `date`가 None이면 날짜 없는 일정 쪽(날짜 탭을 읽는 데만 쓴다).
    fn page(&mut self, date: Option<&str>) -> Result<String, String>;
}

fn file_for(date: Option<&str>) -> String {
    format!("schedule-{}.html", date.unwrap_or("index"))
}

pub struct Http {
    agent: ureq::Agent,
    delay: Duration,
    save_to: Option<PathBuf>,
    pub calls: usize,
}

impl Http {
    pub fn new(save_to: Option<PathBuf>) -> Result<Http, String> {
        let delay_ms = std::env::var("CES_SCHEDULE_DELAY_MS").ok().and_then(|s| s.parse().ok()).unwrap_or(2000u64);
        let config = ureq::Agent::config_builder().timeout_global(Some(Duration::from_secs(60))).user_agent(USER_AGENT).build();
        if let Some(dir) = &save_to {
            std::fs::create_dir_all(dir).map_err(|e| format!("{}: {e}", dir.display()))?;
        }
        Ok(Http { agent: config.into(), delay: Duration::from_millis(delay_ms), save_to, calls: 0 })
    }
}

impl Pages for Http {
    fn page(&mut self, date: Option<&str>) -> Result<String, String> {
        let url = match date {
            Some(d) => format!("{ORIGIN}/schedule?date={d}"),
            None => format!("{ORIGIN}/schedule"),
        };
        let mut last = String::new();
        for wait in [0u64, 3, 8] {
            if wait > 0 {
                std::thread::sleep(Duration::from_secs(wait));
            }
            let got = self.agent.get(&url).header("Accept", "text/html").call().map_err(|e| e.to_string()).and_then(|mut r| r.body_mut().read_to_string().map_err(|e| e.to_string()));
            match got {
                Ok(text) => {
                    self.calls += 1;
                    if let Some(dir) = &self.save_to {
                        let path = dir.join(file_for(date));
                        std::fs::write(&path, &text).map_err(|e| format!("{}: {e}", path.display()))?;
                    }
                    std::thread::sleep(self.delay);
                    return Ok(text);
                }
                Err(e) => last = e,
            }
        }
        Err(format!("공식 일정을 받지 못했다 ({url}): {last}"))
    }
}

pub struct Dir {
    pub dir: PathBuf,
}

impl Pages for Dir {
    fn page(&mut self, date: Option<&str>) -> Result<String, String> {
        let path = self.dir.join(file_for(date));
        std::fs::read_to_string(&path).map_err(|e| format!("{}: {e}", path.display()))
    }
}

/// 글 속 `&#x27;` 같은 것을 풀어 쓴다.
pub fn unescape(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut rest = s;
    while let Some(i) = rest.find('&') {
        out.push_str(&rest[..i]);
        rest = &rest[i..];
        let Some(end) = rest.find(';').filter(|&e| e <= 10) else {
            out.push('&');
            rest = &rest[1..];
            continue;
        };
        let name = &rest[1..end];
        let ch = match name {
            "amp" => Some('&'),
            "lt" => Some('<'),
            "gt" => Some('>'),
            "quot" => Some('"'),
            "apos" => Some('\''),
            "nbsp" => Some(' '),
            _ => name
                .strip_prefix("#x")
                .or_else(|| name.strip_prefix("#X"))
                .and_then(|h| u32::from_str_radix(h, 16).ok())
                .or_else(|| name.strip_prefix('#').and_then(|d| d.parse().ok()))
                .and_then(char::from_u32),
        };
        match ch {
            Some(c) => {
                out.push(c);
                rest = &rest[end + 1..];
            }
            None => {
                out.push('&');
                rest = &rest[1..];
            }
        }
    }
    out.push_str(rest);
    out
}

fn clean(s: &str) -> String {
    unescape(s).split_whitespace().collect::<Vec<_>>().join(" ")
}

/// `marker` 뒤 첫 `>`부터 다음 `<`까지의 글.
fn text_after(chunk: &str, marker: &str) -> Option<String> {
    let at = chunk.find(marker)? + marker.len();
    let from = at + chunk[at..].find('>')? + 1;
    let to = from + chunk[from..].find('<')?;
    Some(clean(&chunk[from..to]))
}

/// `9:00 AM-9:40 AM` → ("09:00", "09:40"). 꼴이 다르면 None.
pub fn parse_range(s: &str) -> Option<(String, String)> {
    let (a, b) = s.split_once('-')?;
    Some((parse_clock(a)?, parse_clock(b)?))
}

fn parse_clock(s: &str) -> Option<String> {
    let s = s.trim();
    let (hm, ap) = s.rsplit_once(' ')?;
    let (h, m) = hm.split_once(':')?;
    let (h, m): (u32, u32) = (h.trim().parse().ok()?, m.trim().parse().ok()?);
    if !(1..=12).contains(&h) || m > 59 {
        return None;
    }
    let pm = match ap.trim().to_ascii_uppercase().as_str() {
        "AM" => false,
        "PM" => true,
        _ => return None,
    };
    Some(format!("{:02}:{m:02}", h % 12 + if pm { 12 } else { 0 }))
}

/// 글자 뭉치(FNV-1a)를 짧은 이름으로. 내 일정이 이 이름으로 세션을 알아본다.
pub fn short_id(url: &str) -> String {
    let mut h: u32 = 0x811c_9dc5;
    for b in url.bytes() {
        h ^= u32::from(b);
        h = h.wrapping_mul(0x0100_0193);
    }
    format!("{h:08x}")
}

/// 날짜 탭(`href="?date=2027-01-05"`)에서 날짜를 모은다.
pub fn parse_dates(html: &str) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    let key = "href=\"?date=";
    let mut rest = html;
    while let Some(i) = rest.find(key) {
        rest = &rest[i + key.len()..];
        let d: String = rest.chars().take(10).collect();
        let ok = d.len() == 10 && d.bytes().enumerate().all(|(i, c)| if i == 4 || i == 7 { c == b'-' } else { c.is_ascii_digit() });
        if ok && !out.contains(&d) {
            out.push(d);
        }
    }
    out.sort();
    out
}

/// 쪽 하나(하루)에서 세션을 읽는다. 읽지 못한 카드 수도 돌려준다.
pub fn parse_day(html: &str, date: &str) -> (Vec<Session>, usize) {
    let mut out = Vec::new();
    let mut skipped = 0;
    for chunk in html.split("group/card").skip(1) {
        let chunk = chunk.split("</li>").next().unwrap_or(chunk);
        let url = chunk.find("href=\"").and_then(|i| {
            let s = &chunk[i + 6..];
            s.find('"').map(|e| s[..e].to_string())
        });
        let title = chunk.find("aria-label=\"").and_then(|i| {
            let s = &chunk[i + 12..];
            s.find('"').map(|e| clean(&s[..e]))
        });
        let range = text_after(chunk, "f-heading-4\"").and_then(|t| parse_range(&t));
        let (Some(url), Some(title), Some((from, to))) = (url, title, range) else {
            skipped += 1;
            continue;
        };
        if !url.starts_with("https://www.ces.tech/schedule/") || title.is_empty() {
            skipped += 1;
            continue;
        }
        let place = text_after(chunk, "mt-space-1 text-secondary f-caption-2\"").unwrap_or_default();
        let mut topics = Vec::new();
        let mut rest = chunk;
        while let Some(i) = rest.find("data-topic-label=\"") {
            rest = &rest[i + 18..];
            if let Some(e) = rest.find('"') {
                let t = clean(&rest[..e]);
                if !t.is_empty() && !topics.contains(&t) {
                    topics.push(t);
                }
            }
        }
        let track = chunk
            .find("Conference Track")
            .and_then(|i| text_after(&chunk[i..], "<a "))
            .unwrap_or_default();
        out.push(Session { id: short_id(&url), date: date.to_string(), from, to, title, place, topics, track, live: chunk.contains("#live-outline-28"), url });
    }
    (out, skipped)
}

/// 받은 것 전부. `days`는 공식 날짜 탭, `skipped`는 읽지 못한 카드 수.
pub struct Fetched {
    pub days: Vec<String>,
    pub items: Vec<Session>,
    pub skipped: usize,
}

pub fn fetch_all(src: &mut dyn Pages, log: &mut dyn FnMut(&str)) -> Result<Fetched, String> {
    log("일정 날짜 탭을 읽는다");
    let days = parse_dates(&src.page(None)?);
    if days.is_empty() {
        return Err("일정 쪽에서 날짜 탭을 찾지 못했다 (쪽 모양이 바뀌었을 수 있다)".into());
    }
    let mut items: Vec<Session> = Vec::new();
    let mut skipped = 0;
    for d in &days {
        let (day, bad) = parse_day(&src.page(Some(d))?, d);
        log(&format!("{d}: 일정 {}개", day.len()));
        skipped += bad;
        for s in day {
            if !items.iter().any(|x| x.id == s.id) {
                items.push(s);
            }
        }
    }
    if items.is_empty() {
        return Err("일정이 하나도 읽히지 않았다 (쪽 모양이 바뀌었을 수 있다)".into());
    }
    items.sort_by(|a, b| (&a.date, &a.from, &a.title).cmp(&(&b.date, &b.from, &b.title)));
    Ok(Fetched { days, items, skipped })
}

/// 폰이 읽는 자료(`sessions.json`).
pub fn to_json(f: &Fetched, fetched_at: &str) -> Value {
    json!({
        "v": fetched_at,
        "source": { "ko": "CES 공식 일정", "url": format!("{ORIGIN}/schedule/") },
        "zone": "라스베이거스 시각",
        "days": f.days,
        "skipped": f.skipped,
        "items": f.items.iter().map(|s| json!({
            "id": s.id, "date": s.date, "from": s.from, "to": s.to, "title": s.title,
            "place": s.place, "topics": s.topics, "track": s.track, "url": s.url, "live": s.live,
        })).collect::<Vec<_>>(),
    })
}

pub fn write_json(dir: &Path, f: &Fetched, fetched_at: &str) -> Result<(), String> {
    std::fs::create_dir_all(dir).map_err(|e| format!("{}: {e}", dir.display()))?;
    let path = dir.join("sessions.json");
    std::fs::write(&path, to_json(f, fetched_at).to_string()).map_err(|e| format!("{}: {e}", path.display()))
}

#[cfg(test)]
mod tests {
    use super::*;

    const CARD: &str = r##"
<li class=" "><div class="relative pb-24 px-space-5 rounded-lg bg-layer text-primary transition group/card">
<a href="https://www.ces.tech/schedule/tech-trends-2027/" class="absolute inset-0" aria-label="Tech Trends 2027: AI&#x27;s Circular Mobility &amp; More"></a>
<p class="text-tertiary f-heading-4">9:00 AM-9:40 AM</p>
<p class="mt-space-1 text-secondary f-caption-2">LVCC, West Hall, Level 2, W232</p>
<a href="https://www.ces.tech/schedule/?topics=Artificial&#x2B;Intelligence" data-topic-label="Artificial Intelligence" data-type="labels"><span>Artificial Intelligence</span></a>
<a href="x" data-topic-label="Enterprise" data-type="labels"></a>
<svg><use xlink:href="#live-outline-28" /></svg>
<h5 class="f-caption-2 font-medium">Conference Track</h5>
<a href="https://www.ces.tech/schedule/?track=Research&#x2B;Summit" class="x">Research Summit</a>
</div></li>
<li><div class="group/card">
<a href="https://www.ces.tech/schedule/late-night/" aria-label="Event - Reception"></a>
<p class="text-tertiary f-heading-4">12:30 PM-1:00 PM</p>
</div></li>
<li><div class="group/card"><a href="https://www.ces.tech/schedule/broken/" aria-label="No time"></a></div></li>
"##;

    #[test]
    fn 시간을_24시로() {
        assert_eq!(parse_range("9:00 AM-9:40 AM"), Some(("09:00".into(), "09:40".into())));
        assert_eq!(parse_range("12:30 PM-1:00 PM"), Some(("12:30".into(), "13:00".into())));
        assert_eq!(parse_range("12:00 AM-1:00 AM"), Some(("00:00".into(), "01:00".into())));
        assert_eq!(parse_range("11:00 AM - 11:40 AM"), Some(("11:00".into(), "11:40".into())));
        assert_eq!(parse_range("Livestream"), None);
        assert_eq!(parse_range("13:00 PM-14:00 PM"), None);
    }

    #[test]
    fn 글_속_기호를_푼다() {
        assert_eq!(unescape("AI&#x27;s &amp; more &#x2B; &#65; & done"), "AI's & more + A & done");
    }

    #[test]
    fn 카드를_읽는다() {
        let (items, skipped) = parse_day(CARD, "2027-01-06");
        assert_eq!(skipped, 1, "시간이 없는 카드는 건너뛴다");
        assert_eq!(items.len(), 2);
        let s = &items[0];
        assert_eq!(s.title, "Tech Trends 2027: AI's Circular Mobility & More");
        assert_eq!((s.from.as_str(), s.to.as_str()), ("09:00", "09:40"));
        assert_eq!(s.place, "LVCC, West Hall, Level 2, W232");
        assert_eq!(s.topics, vec!["Artificial Intelligence", "Enterprise"]);
        assert_eq!(s.track, "Research Summit");
        assert!(s.live);
        assert_eq!(s.url, "https://www.ces.tech/schedule/tech-trends-2027/");
        assert_eq!(s.id.len(), 8);
        // 곳이 없고 생중계 표시도 없는 줄
        assert_eq!(items[1].place, "");
        assert!(!items[1].live);
        assert_eq!(items[1].from, "12:30");
    }

    #[test]
    fn 날짜_탭() {
        let html = r#"<a href="?date=2027-01-05" class="a"></a><a href="?date=2027-01-04"></a><a href="?date=2027-01-05"></a><a href="?date=oops"></a>"#;
        assert_eq!(parse_dates(html), vec!["2027-01-04", "2027-01-05"]);
    }

    struct Fake;
    impl Pages for Fake {
        fn page(&mut self, date: Option<&str>) -> Result<String, String> {
            match date {
                None => Ok(r#"<a href="?date=2027-01-06"></a><a href="?date=2027-01-07"></a>"#.into()),
                Some("2027-01-06") => Ok(CARD.into()),
                Some(_) => Ok("<p>빈 날</p>".into()),
            }
        }
    }

    #[test]
    fn 하루씩_받아_모은다() {
        let mut log = |_: &str| {};
        let f = fetch_all(&mut Fake, &mut log).unwrap();
        assert_eq!(f.days, vec!["2027-01-06", "2027-01-07"]);
        assert_eq!(f.items.len(), 2);
        let j = to_json(&f, "2026-11-21T00:00:00Z");
        assert_eq!(j["items"].as_array().unwrap().len(), 2);
        assert_eq!(j["source"]["url"], "https://www.ces.tech/schedule/");
    }

    struct Empty;
    impl Pages for Empty {
        fn page(&mut self, _: Option<&str>) -> Result<String, String> {
            Ok("<p>모양이 바뀜</p>".into())
        }
    }

    #[test]
    fn 모양이_바뀌면_못_받았다고_한다() {
        let mut log = |_: &str| {};
        assert!(fetch_all(&mut Empty, &mut log).is_err());
    }
}
