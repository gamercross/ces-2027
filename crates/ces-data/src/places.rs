//! 장소 자료(`data/places.json`)를 읽고 살핀다. 부스 → 장소 규칙도 그 파일에 있다.

use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};

/// 장소를 정하지 못한 부스에 붙는 기호.
pub const UNKNOWN: &str = "UNKNOWN";
/// 홀 기호만 알고 장소 자료에 없는 곳에 붙는 기호의 앞머리 (`HALL_XX`).
pub const HALL_PREFIX: &str = "HALL_";

const KINDS: [&str; 4] = ["hall", "room", "out", "hotel"];
const SPOTS: [&str; 2] = ["guess", "official"];

/// 장소 기호가 "정하지 못함"인지.
pub fn is_unplaced(place: &str) -> bool {
    place == UNKNOWN || place.starts_with(HALL_PREFIX)
}

/// 읽어 둔 장소 자료.
pub struct Places {
    /// 파일 그대로.
    pub json: Value,
    /// 장소 기호 → 한글 이름 · 영어 이름.
    pub names: BTreeMap<String, (String, String)>,
    pub rules: Rules,
}

impl Places {
    /// 파일을 읽는다. 잘못이 하나라도 있으면 모두 모아 돌려준다.
    pub fn load(path: &std::path::Path) -> Result<Places, String> {
        let text = std::fs::read_to_string(path).map_err(|e| format!("{}: {e}", path.display()))?;
        let json: Value = serde_json::from_str(&text).map_err(|e| format!("{}: JSON이 아니다: {e}", path.display()))?;
        Places::from_json(json)
    }

    pub fn from_json(json: Value) -> Result<Places, String> {
        let problems = check(&json);
        if !problems.is_empty() {
            return Err(format!("장소 자료에 잘못 {}개:\n- {}", problems.len(), problems.join("\n- ")));
        }
        let mut names = BTreeMap::new();
        for p in json["places"].as_array().into_iter().flatten() {
            names.insert(str_of(p, "k").to_string(), (str_of(p, "ko").to_string(), str_of(p, "en").to_string()));
        }
        let rules = Rules::from_json(&json)?;
        Ok(Places { json, names, rules })
    }

    /// 장소 수 · 그 가운데 부스 자리가 짐작인 곳.
    pub fn counts(&self) -> (usize, usize) {
        let places = self.json["places"].as_array().map(Vec::as_slice).unwrap_or(&[]);
        (places.len(), places.iter().filter(|p| p["boothSpots"] == "guess").count())
    }
}

fn str_of<'a>(v: &'a Value, key: &str) -> &'a str {
    v.get(key).and_then(Value::as_str).unwrap_or("")
}

fn point(v: &Value) -> Option<(f64, f64)> {
    let a = v.as_array()?;
    if a.len() != 2 {
        return None;
    }
    Some((a[0].as_f64()?, a[1].as_f64()?))
}

/// 장소 자료의 잘못을 모두 찾는다. 빈 목록이면 잘못이 없다.
pub fn check(json: &Value) -> Vec<String> {
    let mut bad = Vec::new();
    if str_of(json, "edition").is_empty() {
        bad.push("edition(캠퍼스 지도 판 날짜)이 없다".to_string());
    }
    if json["sources"].as_array().map_or(true, Vec::is_empty) {
        bad.push("sources(출처)가 없다".to_string());
    }

    let mut campuses = BTreeSet::new();
    for (i, c) in json["campuses"].as_array().into_iter().flatten().enumerate() {
        let k = str_of(c, "k");
        if k.is_empty() || str_of(c, "ko").is_empty() {
            bad.push(format!("campuses[{i}]: k 또는 ko가 없다"));
        }
        if !campuses.insert(k.to_string()) {
            bad.push(format!("캠퍼스 기호가 겹친다: {k}"));
        }
        let t = &c["toWorld"];
        if point(&t["origin"]).is_none() || point(&t["offset"]).is_none() || t["scale"].as_f64().map_or(true, |s| s <= 0.0) {
            bad.push(format!("캠퍼스 {k}: toWorld(origin · scale · offset)가 맞지 않다"));
        }
    }
    if campuses.is_empty() {
        bad.push("campuses가 비었다".to_string());
    }

    let venues: BTreeSet<String> = json["venues"].as_object().map(|o| o.keys().cloned().collect()).unwrap_or_default();
    for (k, v) in json["venues"].as_object().into_iter().flatten() {
        if str_of(v, "name").is_empty() || str_of(v, "address").is_empty() {
            bad.push(format!("venues.{k}: name 또는 address가 없다"));
        }
        if !v.get("addressChecked").is_some_and(|c| c.is_null() || c.is_string()) {
            bad.push(format!("venues.{k}: addressChecked는 확인한 날짜 글이거나 null이어야 한다"));
        }
    }

    let mut places = BTreeSet::new();
    for (i, p) in json["places"].as_array().into_iter().flatten().enumerate() {
        let k = str_of(p, "k");
        let at = if k.is_empty() { format!("places[{i}]") } else { format!("장소 {k}") };
        if k.is_empty() || str_of(p, "ko").is_empty() || str_of(p, "en").is_empty() {
            bad.push(format!("{at}: k · ko · en 가운데 빈 것이 있다"));
        }
        if !places.insert(k.to_string()) {
            bad.push(format!("장소 기호가 겹친다: {k}"));
        }
        if is_unplaced(k) {
            bad.push(format!("{at}: UNKNOWN · HALL_ 로 시작하는 기호는 쓰지 않는다"));
        }
        if !campuses.contains(str_of(p, "c")) {
            bad.push(format!("{at}: 없는 캠퍼스 `{}`", str_of(p, "c")));
        }
        if !KINDS.contains(&str_of(p, "kind")) {
            bad.push(format!("{at}: kind는 {KINDS:?} 가운데 하나"));
        }
        if !SPOTS.contains(&str_of(p, "boothSpots")) {
            bad.push(format!("{at}: boothSpots는 {SPOTS:?} 가운데 하나 (짐작이면 guess)"));
        }
        let poly: Vec<(f64, f64)> = p["poly"].as_array().into_iter().flatten().filter_map(point).collect();
        if poly.len() < 3 || poly.len() != p["poly"].as_array().map_or(0, Vec::len) {
            bad.push(format!("{at}: poly는 [x, z] 점 셋 이상"));
        } else if let Some(reg) = p.get("reg") {
            let r: Vec<f64> = reg.as_array().into_iter().flatten().filter_map(Value::as_f64).collect();
            let (x0, x1) = poly.iter().fold((f64::MAX, f64::MIN), |a, p| (a.0.min(p.0), a.1.max(p.0)));
            let (z0, z1) = poly.iter().fold((f64::MAX, f64::MIN), |a, p| (a.0.min(p.1), a.1.max(p.1)));
            if r.len() != 4 || r[0] >= r[2] || r[1] >= r[3] || r[0] < x0 || r[2] > x1 || r[1] < z0 || r[3] > z1 {
                bad.push(format!("{at}: reg는 [x0, z0, x1, z1]이고 poly 안에 있어야 한다"));
            }
        }
        match p.get("maps") {
            Some(Value::Null) => {}
            Some(m) => {
                if str_of(m, "query").is_empty() {
                    bad.push(format!("{at}: maps.query(구글맵에서 찾을 이름)가 없다"));
                }
                if !venues.contains(str_of(m, "venue")) {
                    bad.push(format!("{at}: maps.venue `{}`가 venues에 없다", str_of(m, "venue")));
                }
            }
            None => bad.push(format!("{at}: maps가 없다 (모르면 null)")),
        }
    }
    if places.is_empty() {
        bad.push("places가 비었다".to_string());
    }

    for (name, items) in [("landmarks", &json["landmarks"]), ("roads", &json["roads"]), ("decor", &json["decor"])] {
        for (i, it) in items.as_array().into_iter().flatten().enumerate() {
            if !campuses.contains(str_of(it, "c")) {
                bad.push(format!("{name}[{i}]: 없는 캠퍼스 `{}`", str_of(it, "c")));
            }
        }
    }
    for (i, l) in json["links"].as_array().into_iter().flatten().enumerate() {
        for end in ["from", "to"] {
            if !campuses.contains(str_of(&l[end], "c")) {
                bad.push(format!("links[{i}].{end}: 없는 캠퍼스"));
            }
        }
    }

    match Rules::from_json(json) {
        Ok(rules) => {
            for place in rules.places() {
                if !places.contains(place) {
                    bad.push(format!("부스 규칙이 없는 장소 `{place}`를 가리킨다"));
                }
            }
        }
        Err(e) => bad.push(e),
    }
    for form in ["search", "directions"] {
        let url = str_of(&json["mapsUrls"], form);
        if !url.starts_with("https://www.google.com/maps/") || url.contains("key=") {
            bad.push(format!("mapsUrls.{form}: 구글 Maps URLs(키 없음) 꼴이 아니다"));
        }
    }
    bad
}

/// 부스 글자 뒤에 무엇이 와야 하나.
#[derive(Clone, Copy, PartialEq, Debug)]
enum Then {
    Any,
    /// 숫자 하나 이상.
    Digit,
    /// 숫자 셋 이상.
    Digits3,
    /// 영어 큰 글자.
    Upper,
}

struct TextRule {
    starts: Vec<String>,
    contains: Vec<String>,
    then: Then,
    without: Option<String>,
    place: String,
}

/// 부스 번호 · 이름 → 장소.
///
/// 차례: ① 숫자 부스는 번호 대로, ② 글자 부스는 위에서부터 맞는 규칙, ③ 남으면 홀 기호로.
pub struct Rules {
    numbers: Vec<(u32, u32, String)>,
    text: Vec<TextRule>,
    halls: BTreeMap<String, String>,
}

fn strings(v: &Value) -> Vec<String> {
    match v {
        Value::String(s) => vec![s.clone()],
        Value::Array(a) => a.iter().filter_map(Value::as_str).map(str::to_string).collect(),
        _ => Vec::new(),
    }
}

impl Rules {
    pub fn from_json(json: &Value) -> Result<Rules, String> {
        let b = &json["boothRules"];
        let mut numbers = Vec::new();
        for (i, r) in b["numbers"].as_array().into_iter().flatten().enumerate() {
            let (from, to) = (r["from"].as_u64(), r["to"].as_u64());
            let place = str_of(r, "place");
            match (from, to) {
                (Some(f), Some(t)) if f <= t && t <= u32::MAX as u64 && !place.is_empty() => numbers.push((f as u32, t as u32, place.to_string())),
                _ => return Err(format!("boothRules.numbers[{i}]: from · to · place가 맞지 않다")),
            }
        }
        let mut sorted: Vec<&(u32, u32, String)> = numbers.iter().collect();
        sorted.sort();
        for w in sorted.windows(2) {
            if w[1].0 <= w[0].1 {
                return Err(format!("boothRules.numbers: 번호 대가 겹친다 ({} ~ {} 와 {} ~ {})", w[0].0, w[0].1, w[1].0, w[1].1));
            }
        }
        let mut text = Vec::new();
        for (i, r) in b["text"].as_array().into_iter().flatten().enumerate() {
            let then = match r.get("then").and_then(Value::as_str) {
                None => Then::Any,
                Some("digit") => Then::Digit,
                Some("3digits") => Then::Digits3,
                Some("upper") => Then::Upper,
                Some(other) => return Err(format!("boothRules.text[{i}]: 모르는 then `{other}`")),
            };
            let rule = TextRule {
                starts: strings(&r["starts"]),
                contains: strings(&r["contains"]),
                then,
                without: r.get("without").and_then(Value::as_str).map(str::to_string),
                place: str_of(r, "place").to_string(),
            };
            if rule.place.is_empty() || (rule.starts.is_empty() && rule.contains.is_empty()) {
                return Err(format!("boothRules.text[{i}]: place와 starts 또는 contains가 있어야 한다"));
            }
            if rule.then != Then::Any && rule.starts.is_empty() {
                return Err(format!("boothRules.text[{i}]: then은 starts와 같이 쓴다"));
            }
            text.push(rule);
        }
        let mut halls = BTreeMap::new();
        for (code, place) in b["halls"].as_object().into_iter().flatten() {
            match place.as_str() {
                Some(p) if !p.is_empty() => halls.insert(code.clone(), p.to_string()),
                _ => return Err(format!("boothRules.halls.{code}: 장소 기호가 없다")),
            };
        }
        if numbers.is_empty() && text.is_empty() && halls.is_empty() {
            return Err("boothRules가 비었다".to_string());
        }
        Ok(Rules { numbers, text, halls })
    }

    /// 규칙이 가리키는 장소 기호 모두.
    pub fn places(&self) -> impl Iterator<Item = &str> {
        self.numbers.iter().map(|n| n.2.as_str()).chain(self.text.iter().map(|t| t.place.as_str())).chain(self.halls.values().map(String::as_str))
    }

    /// 부스 글과 홀 기호로 장소 기호를 정한다. 못 정하면 `UNKNOWN`이나 `HALL_<홀 기호>`.
    pub fn place_of(&self, booth: &str, hall: &str) -> String {
        if let Some(n) = booth_number(booth) {
            return self.numbers.iter().find(|(from, to, _)| (*from..=*to).contains(&n)).map(|r| r.2.clone()).unwrap_or_else(|| UNKNOWN.to_string());
        }
        for rule in &self.text {
            if rule.without.as_ref().is_some_and(|w| booth.contains(w.as_str())) {
                continue;
            }
            let by_start = rule.starts.iter().any(|s| booth.strip_prefix(s.as_str()).is_some_and(|rest| then_ok(rule.then, rest)));
            if by_start || rule.contains.iter().any(|c| booth.contains(c.as_str())) {
                return rule.place.clone();
            }
        }
        match self.halls.get(hall) {
            Some(p) => p.clone(),
            None if hall.is_empty() => UNKNOWN.to_string(),
            None => format!("{HALL_PREFIX}{hall}"),
        }
    }
}

/// 숫자 부스(`14731`, 뒤에 글자 하나가 붙은 `52011A`)면 그 번호.
fn booth_number(booth: &str) -> Option<u32> {
    let digits = booth.trim_end_matches(|c: char| c.is_ascii_alphabetic());
    if digits.is_empty() || booth.len() - digits.len() > 1 || !digits.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    digits.parse().ok()
}

fn then_ok(then: Then, rest: &str) -> bool {
    let digits = rest.bytes().take_while(u8::is_ascii_digit).count();
    match then {
        Then::Any => true,
        Then::Digit => digits >= 1,
        Then::Digits3 => digits >= 3,
        Then::Upper => rest.bytes().next().is_some_and(|b| b.is_ascii_uppercase()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 숫자_부스를_알아본다() {
        assert_eq!(booth_number("14731"), Some(14731));
        assert_eq!(booth_number("52011A"), Some(52011));
        assert_eq!(booth_number("52011AB"), None);
        assert_eq!(booth_number("CP100"), None);
        assert_eq!(booth_number("W201"), None);
        assert_eq!(booth_number(""), None);
        assert_eq!(booth_number("A"), None);
    }

    #[test]
    fn 뒤에_오는_것을_본다() {
        assert!(then_ok(Then::Digit, "100"));
        assert!(!then_ok(Then::Digit, "-100"));
        assert!(then_ok(Then::Digits3, "2011"));
        assert!(!then_ok(Then::Digits3, "20"));
        assert!(then_ok(Then::Upper, "Ballroom"));
        assert!(!then_ok(Then::Upper, "ballroom"));
        assert!(!then_ok(Then::Upper, ""));
    }
}
