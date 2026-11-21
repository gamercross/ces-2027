//! 받은 자료를 줄이고 찾기 색인을 만든다.

use crate::fetch::{text_of, Raw};
use crate::places::{is_unplaced, Places};
use ces_core::Builder;
use serde_json::{json, Value};
use std::collections::{BTreeMap, HashMap};

/// 공식 전시사 상세 주소. `{id}`에 전시사 id를 넣는다.
pub const DETAIL_LINK: &str = "https://exhibitors.ces.tech/8_0/exhibitor/exhibitor-details.cfm?exhid={id}";
/// `ex` 한 줄의 칸 차례.
pub const FIELDS: [&str; 8] = ["id", "name", "intro", "country", "cats", "award", "featured", "booths"];
const INTRO_MAX: usize = 200;

/// 회사 소개를 어떻게 실을지. 아직 정하지 않은 칸이라 설정으로 바꾼다.
#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Intro {
    /// 소개는 싣지 않고 공식 링크만.
    LinkOnly,
    /// 공식 소개의 첫 문장.
    FirstSentence,
}

impl Intro {
    pub fn parse(s: &str) -> Result<Intro, String> {
        match s {
            "link-only" => Ok(Intro::LinkOnly),
            "first-sentence" => Ok(Intro::FirstSentence),
            other => Err(format!("companyIntro는 link-only 또는 first-sentence다 (지금: {other})")),
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Intro::LinkOnly => "link-only",
            Intro::FirstSentence => "first-sentence",
        }
    }
}

/// 우리가 붙이는 표: 분야 한글 이름과 찾기 별칭.
#[derive(Default)]
pub struct Tables {
    /// 공식 분야 이름 → 한글 이름.
    pub cat_ko: BTreeMap<String, String>,
    /// 한글 낱말 → 영어 낱말 (`삼성` → `samsung`).
    pub alias_words: Vec<(String, String)>,
    /// 공식 전시사 이름 → 한글로 부르는 이름.
    pub alias_names: Vec<(String, String)>,
}

impl Tables {
    /// `data/categories.json`과 `data/aliases.json`에서 읽는다.
    pub fn from_json(categories: &Value, aliases: &Value) -> Tables {
        let pairs = |v: &Value| -> Vec<(String, String)> { v.as_object().into_iter().flatten().filter_map(|(k, v)| Some((k.clone(), v.as_str()?.to_string()))).collect() };
        Tables { cat_ko: pairs(&categories["ko"]).into_iter().collect(), alias_words: pairs(&aliases["words"]), alias_names: pairs(&aliases["names"]) }
    }
}

/// 만든 것.
pub struct Output {
    pub exhibitors: Value,
    /// 회사 로고 파일 이름(data/logos.json). 사진을 켠 설정에서만 쓴다.
    pub logos: Value,
    pub index: String,
    pub meta: Value,
    /// 사람이 볼 것 (장소를 못 정한 부스, 한글 이름이 없는 분야).
    pub warnings: Vec<String>,
}

/// 빈칸을 하나로 줄인다.
fn clean(s: &str) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// 소개의 첫 문장. 길면 낱말 끝에서 자르고 `…`을 붙인다.
pub fn first_sentence(desc: &str, max: usize) -> String {
    let t = clean(desc);
    let chars: Vec<char> = t.chars().collect();
    let mut end = chars.len();
    for i in 0..chars.len().saturating_sub(1) {
        // 너무 앞에서 끊기는 것(`Inc. ` 같은 줄임말)은 넘긴다.
        if i >= 30 && matches!(chars[i], '.' | '!' | '?') && chars[i + 1] == ' ' {
            end = i + 1;
            break;
        }
    }
    if end <= max {
        return chars[..end].iter().collect();
    }
    let mut cut = max.saturating_sub(1);
    while cut > 0 && chars[cut] != ' ' {
        cut -= 1;
    }
    if cut == 0 {
        cut = max.saturating_sub(1);
    }
    let mut out: String = chars[..cut].iter().collect();
    out.truncate(out.trim_end().len());
    out.push('…');
    out
}

/// 혁신상 표시를 읽는다: 1 = 혁신상, 2 = 최고 혁신상 (둘 다면 3).
fn award_of(fields: &Value) -> u8 {
    let Some(raw) = fields.get("exhicons_l").and_then(Value::as_str) else { return 0 };
    let t = raw.trim();
    let t = t.strip_prefix('"').and_then(|s| s.strip_suffix('"')).unwrap_or(t);
    let Ok(Value::Array(icons)) = serde_json::from_str::<Value>(t) else { return 0 };
    let mut award = 0;
    for icon in &icons {
        match icon.get("columnname").and_then(Value::as_str) {
            Some("innovation") => award |= 1,
            Some("boi") => award |= 2,
            _ => {}
        }
    }
    award
}

fn truthy(v: Option<&Value>) -> bool {
    match v {
        Some(Value::String(s)) => !s.is_empty() && s != "0",
        Some(Value::Number(n)) => n.as_f64() != Some(0.0),
        Some(Value::Bool(b)) => *b,
        _ => false,
    }
}

struct Row {
    id: String,
    name: String,
    intro: String,
    country: i64,
    cats: Vec<usize>,
    award: u8,
    featured: u8,
    /// (부스 글, 장소 기호)
    booths: Vec<(String, String)>,
    /// 공식 로고 파일 이름(없으면 빈 글).
    logo: String,
}

/// 공식 로고가 놓인 곳. 그림은 우리 레포에 담지 않고 이 주소 그대로 보인다.
pub const LOGO_BASE: &str = "https://exhibitors.ces.tech/mys_shared/CES27/logos/";
const KIND_CHARS: &[u8] = b"0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

/// 로고 파일 이름으로 쓸 수 있는 글자만 받는다 (주소에 그대로 붙이므로).
fn safe_logo(file: &str) -> bool {
    !file.is_empty() && file.len() <= 80 && file.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'.' || b == b'-' || b == b'_') && file.contains('.')
}

/// 로고 파일 이름을 줄여 적는다. 전시사 줄(`ex`)과 같은 차례로 글자 하나씩 쓴다: `-`은 로고 없음, 나머지는 `kinds`의 번호.
/// 파일 이름이 전시사 id에 확장자를 붙인 것이면 확장자만(`png`), id를 소문자로 한 것이면 `~png`로 적는다. 그 밖의 이름은 `extra`에 줄 번호로 둔다.
pub fn logos_json<'a>(rows: impl Iterator<Item = (&'a str, &'a str)>, version: &str) -> Value {
    let mut kinds: Vec<String> = Vec::new();
    let mut map = String::new();
    let mut extra = serde_json::Map::new();
    let mut n = 0;
    for (i, (id, file)) in rows.enumerate() {
        if !safe_logo(file) {
            map.push('-');
            continue;
        }
        n += 1;
        let (stem, ext) = file.rsplit_once('.').unwrap_or((file, ""));
        let kind = if stem == id { Some(ext.to_string()) } else if stem == id.to_lowercase() { Some(format!("~{ext}")) } else { None };
        let slot = kind.and_then(|k| match kinds.iter().position(|x| *x == k) {
            Some(p) => Some(p),
            None if kinds.len() < KIND_CHARS.len() => {
                kinds.push(k);
                Some(kinds.len() - 1)
            }
            None => None,
        });
        match slot {
            Some(p) => map.push(KIND_CHARS[p] as char),
            None => {
                map.push('-');
                extra.insert(i.to_string(), Value::String(file.to_string()));
            }
        }
    }
    json!({
        "v": version,
        "base": LOGO_BASE,
        "n": n,
        "how": "map은 data/exhibitors.json의 ex와 같은 차례로 줄마다 한 글자다. - 는 로고 없음. 그 밖의 글자는 kinds의 번호(0-9 a-z A-Z). kinds의 png는 파일 이름이 전시사 id.png, ~png는 id를 소문자로 한 이름.png. extra는 줄 번호 → 파일 이름. 주소는 base + 파일 이름.",
        "kinds": kinds,
        "map": map,
        "extra": extra,
    })
}

/// 줄이고 색인을 만든다. `fetched_at`은 받은 시각(ISO)이다.
pub fn build(raw: &Raw, places: &Places, intro: Intro, tables: &Tables, fetched_at: &str) -> Output {
    let mut warnings = Vec::new();

    let mut ex_cats: HashMap<&str, Vec<usize>> = HashMap::new();
    for (ci, ids) in raw.cat_members.iter().enumerate() {
        for id in ids {
            ex_cats.entry(id.as_str()).or_default().push(ci);
        }
    }
    // 나라는 전시사가 많은 차례로 선다.
    let mut by_size: Vec<&(String, Vec<String>)> = raw.countries.iter().collect();
    by_size.sort_by(|a, b| b.1.len().cmp(&a.1.len()));
    let countries: Vec<&str> = by_size.iter().map(|c| c.0.as_str()).collect();
    let mut ex_country: HashMap<&str, usize> = HashMap::new();
    for (i, c) in by_size.iter().enumerate() {
        for id in &c.1 {
            ex_country.insert(id.as_str(), i);
        }
    }

    let mut rows: Vec<Row> = Vec::with_capacity(raw.exhibitors.len());
    for f in &raw.exhibitors {
        let Some(id) = f.get("exhid_l").and_then(text_of) else { continue };
        let name = clean(f.get("exhname_t").and_then(Value::as_str).unwrap_or(""));
        if name.is_empty() {
            continue;
        }
        let halls: Vec<&str> = f["hallid_la"].as_array().into_iter().flatten().map(|h| h.as_str().unwrap_or("")).collect();
        let booths = f["booths_la"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(Value::as_str)
            .enumerate()
            .map(|(i, b)| {
                let code = clean(&b.replace("randomstring", ""));
                let place = places.rules.place_of(&code, halls.get(i).copied().unwrap_or(""));
                (code, place)
            })
            .collect();
        let mut cats = ex_cats.get(id.as_str()).cloned().unwrap_or_default();
        cats.sort_unstable();
        cats.dedup();
        rows.push(Row {
            intro: match intro {
                Intro::LinkOnly => String::new(),
                Intro::FirstSentence => first_sentence(f.get("exhdesc_t").and_then(Value::as_str).unwrap_or(""), INTRO_MAX),
            },
            country: ex_country.get(id.as_str()).map_or(-1, |&i| i as i64),
            cats,
            award: award_of(f),
            featured: truthy(f.get("exhfeatured_t")) as u8,
            logo: f.get("exhlogo_t").and_then(text_of).unwrap_or_default(),
            booths,
            id,
            name,
        });
    }
    rows.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()).then_with(|| a.name.cmp(&b.name)).then_with(|| a.id.cmp(&b.id)));

    let cats_ko: Vec<&str> = raw.cats.iter().map(|c| tables.cat_ko.get(c).map_or("", String::as_str)).collect();
    let no_ko: Vec<&str> = raw.cats.iter().zip(&cats_ko).filter(|(_, ko)| ko.is_empty()).map(|(c, _)| c.as_str()).collect();
    if !no_ko.is_empty() {
        warnings.push(format!("한글 이름이 없는 분야 {}개 (data/categories.json에 더한다): {}", no_ko.len(), no_ko.join(" · ")));
    }

    // 찾기 색인
    let korea = countries.iter().position(|c| *c == "South Korea");
    let mut index = Builder::new();
    let mut row_by_name: HashMap<&str, Vec<u32>> = HashMap::new();
    for (i, r) in rows.iter().enumerate() {
        let i = i as u32;
        index.add_name(i, &r.name);
        row_by_name.entry(r.name.as_str()).or_default().push(i);
        for (code, place) in &r.booths {
            index.add_other(i, code);
            if let Some((ko, en)) = places.names.get(place) {
                index.add_other(i, ko);
                index.add_other(i, en);
            }
        }
        for &c in &r.cats {
            index.add_other(i, &raw.cats[c]);
            index.add_other(i, cats_ko[c]);
        }
        if r.country >= 0 {
            index.add_other(i, countries[r.country as usize]);
            if Some(r.country as usize) == korea {
                index.add_other(i, "한국");
            }
        }
    }
    for (ko, en) in &tables.alias_words {
        index.add_alias(ko, en);
    }
    for (official, ko) in &tables.alias_names {
        for &i in row_by_name.get(official.as_str()).into_iter().flatten() {
            index.add_name(i, ko);
        }
    }
    let words = index.len();
    let index = index.finish(rows.len() as u32);

    let all_booths: Vec<&(String, String)> = rows.iter().flat_map(|r| &r.booths).collect();
    let unplaced: Vec<String> = all_booths.iter().filter(|b| is_unplaced(&b.1)).map(|b| format!("{}@{}", b.0, b.1)).collect();
    if !unplaced.is_empty() {
        warnings.push(format!("장소를 못 정한 부스 {}개 (data/places.json의 boothRules를 고친다): {}", unplaced.len(), unplaced.iter().take(20).cloned().collect::<Vec<_>>().join(" · ")));
    }

    let version = fetched_at.get(..10).unwrap_or(fetched_at);
    let source = format!("{}/8_0/", crate::source::ORIGIN);
    let ex: Vec<Value> = rows
        .iter()
        .map(|r| {
            let cats = r.cats.iter().map(usize::to_string).collect::<Vec<_>>().join(".");
            let booths: Vec<String> = r.booths.iter().map(|(code, place)| format!("{code}@{place}")).collect();
            json!([r.id, r.name, r.intro, r.country, cats, r.award, r.featured, booths])
        })
        .collect();
    let exhibitors = json!({
        "v": version,
        "fetchedAt": fetched_at,
        "src": source,
        "link": DETAIL_LINK,
        "intro": intro.as_str(),
        "n": rows.len(),
        "cats": raw.cats,
        "catsKo": cats_ko,
        "countries": countries,
        "fields": FIELDS,
        "ex": ex,
    });
    let logos = logos_json(rows.iter().map(|r| (r.id.as_str(), r.logo.as_str())), version);
    let (place_count, guess_count) = places.counts();
    let meta = json!({
        "v": version,
        "fetchedAt": fetched_at,
        "source": source,
        "exhibitors": rows.len(),
        "categories": raw.cats.len(),
        "countries": countries.len(),
        "korea": korea.map_or(0, |k| rows.iter().filter(|r| r.country == k as i64).count()),
        "awards": rows.iter().filter(|r| r.award > 0).count(),
        "booths": all_booths.len(),
        "unplacedBooths": unplaced.len(),
        "indexWords": words,
        "logos": logos["n"],
        "companyIntro": intro.as_str(),
        "places": { "edition": places.json["edition"], "count": place_count, "boothSpotsGuess": guess_count },
    });
    Output { exhibitors, logos, index, meta, warnings }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 로고_이름을_줄여_적는다() {
        let rows = [("0013A1", "0013A1.png"), ("0013A2", "0013a2.png"), ("0013A3", ""), ("0013A4", "other.jpg"), ("0013A5", "../x.png"), ("0013A6", "0013A6.JPG")];
        let j = logos_json(rows.iter().copied(), "2026-11-21");
        assert_eq!(j["map"], "01--" .to_string() + "-2");
        assert_eq!(j["kinds"], json!(["png", "~png", "JPG"]));
        assert_eq!(j["extra"], json!({ "3": "other.jpg" }));
        assert_eq!(j["n"], 4);
        assert_eq!(j["base"], LOGO_BASE);
    }

    #[test]
    fn 첫_문장만() {
        let d = "1NCE offers a software platform for connected products that delivers IoT in +170 countries. The platform enables customers.";
        assert_eq!(first_sentence(d, 200), "1NCE offers a software platform for connected products that delivers IoT in +170 countries.");
        // 앞쪽 줄임말에서는 끊지 않는다.
        assert_eq!(first_sentence("Acme Inc. builds small robots for homes and schools. More.", 200), "Acme Inc. builds small robots for homes and schools.");
        assert_eq!(first_sentence("  no   end  mark ", 200), "no end mark");
        assert_eq!(first_sentence("", 200), "");
    }

    #[test]
    fn 길면_낱말_끝에서_자른다() {
        let d = "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma tau upsilon";
        let s = first_sentence(d, 40);
        assert!(s.chars().count() <= 40, "{s}");
        assert!(s.ends_with('…'));
        assert!(d.starts_with(s.trim_end_matches('…')));
        assert_eq!(first_sentence("가나다라마바사아자차카타파하", 5), "가나다라…");
    }

    #[test]
    fn 혁신상_표시() {
        let honoree = json!({ "exhicons_l": "\"[{\"columnname\":\"innovation\",\"iconfile\":\"a.png\",\"title\":\"Innovation Awards Honoree\"}]\"" });
        let both = json!({ "exhicons_l": "[{\"columnname\":\"boi\"},{\"columnname\":\"innovation\"}]" });
        assert_eq!(award_of(&honoree), 1);
        assert_eq!(award_of(&both), 3);
        assert_eq!(award_of(&json!({ "exhicons_l": "" })), 0);
        assert_eq!(award_of(&json!({})), 0);
    }

    #[test]
    fn 설정_값() {
        assert_eq!(Intro::parse("link-only"), Ok(Intro::LinkOnly));
        assert_eq!(Intro::parse("first-sentence"), Ok(Intro::FirstSentence));
        assert!(Intro::parse("전부").is_err());
    }
}
