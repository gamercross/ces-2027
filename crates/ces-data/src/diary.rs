//! 모인 일기를 네 태그로 나눠 한 장으로 만든다 (이슈 #18의 첫 조각).
//!
//! 폰의 일기 화면에서 내보낸 파일(`web/diary.js`의 꼴)을 읽어, "누구에게"(학생 · 취준생 · 정년 · 장년)로 나눈
//! 마크다운 한 장을 쓴다. 이 한 장은 보낸 글을 그대로 묶은 초안이다. 맞다고 확정하는 것은 사람이 한다.
//! 모은 파일과 만든 한 장에는 별명과 일기가 들어 있으니 공개 레포에 올리지 않는다.

use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};

/// 내보낸 파일의 이름표와 판 번호 (`web/diary.js`와 같아야 한다).
pub const FORMAT: &str = "ces-2027-diary";
pub const VERSION: u64 = 1;

/// 네 태그: 기호와 한글 이름. 한 장에 이 차례로 나온다.
pub const TAGS: [(&str, &str); 4] = [("stu", "학생"), ("job", "취준생"), ("ret", "정년"), ("mid", "장년")];

#[derive(Clone, Debug, PartialEq)]
pub struct Entry {
    pub author: String,
    pub id: String,
    pub date: String,
    pub company: String,
    pub booth: String,
    pub saw: String,
    pub felt: String,
    /// 누구에게 (태그 기호).
    pub tags: Vec<String>,
}

fn text(v: &Value, key: &str) -> String {
    v.get(key).and_then(Value::as_str).unwrap_or("").split_whitespace().collect::<Vec<_>>().join(" ")
}

/// 내보낸 파일 하나를 읽는다.
pub fn read_bundle(json: &Value) -> Result<Vec<Entry>, String> {
    if json.get("app").and_then(Value::as_str) != Some(FORMAT) {
        return Err("일기를 내보낸 파일이 아니다".into());
    }
    if json.get("v").and_then(Value::as_u64) != Some(VERSION) {
        return Err(format!("판 번호가 다르다 (읽을 수 있는 판: {VERSION})"));
    }
    let author = text(&json["author"], "nick");
    let entries = json.get("entries").and_then(Value::as_array).ok_or("entries가 없다")?;
    Ok(entries
        .iter()
        .map(|e| Entry {
            author: author.clone(),
            id: text(e, "id"),
            date: text(e, "date"),
            company: text(e, "company"),
            booth: text(e, "booth"),
            saw: text(e, "saw"),
            felt: text(e, "felt"),
            tags: e["for"].as_array().into_iter().flatten().filter_map(Value::as_str).filter(|t| TAGS.iter().any(|(k, _)| k == t)).map(str::to_string).collect(),
        })
        .filter(|e| !e.saw.is_empty() || !e.felt.is_empty())
        .collect())
}

/// 여러 파일의 일기를 합친다. 같은 사람이 같은 일기를 두 번 보냈으면 나중 것만 남긴다.
pub fn merge(bundles: Vec<Vec<Entry>>) -> Vec<Entry> {
    let mut by_key: BTreeMap<(String, String), Entry> = BTreeMap::new();
    for e in bundles.into_iter().flatten() {
        by_key.insert((e.author.clone(), e.id.clone()), e);
    }
    let mut all: Vec<Entry> = by_key.into_values().collect();
    all.sort_by(|a, b| a.date.cmp(&b.date).then_with(|| a.company.to_lowercase().cmp(&b.company.to_lowercase())).then_with(|| a.author.cmp(&b.author)));
    all
}

fn section(out: &mut String, title: &str, entries: &[&Entry]) {
    out.push_str(&format!("\n## {title} ({}개)\n", entries.len()));
    if entries.is_empty() {
        out.push_str("\n아직 없다.\n");
        return;
    }
    let mut day = "";
    for e in entries {
        if e.date != day {
            day = &e.date;
            out.push_str(&format!("\n### {}\n\n", if day.is_empty() { "날짜 없음" } else { day }));
        }
        let booth = e.booth.split('@').next().unwrap_or("");
        let company = if e.company.is_empty() { "회사 없음" } else { &e.company };
        out.push_str(&format!("- **{company}**{}{}\n", if booth.is_empty() { String::new() } else { format!(" (부스 {booth})") }, if e.author.is_empty() { String::new() } else { format!(" · {}", e.author) }));
        if !e.saw.is_empty() {
            out.push_str(&format!("  - 본 것: {}\n", e.saw));
        }
        if !e.felt.is_empty() {
            out.push_str(&format!("  - 느낀 점: {}\n", e.felt));
        }
    }
}

/// 네 태그로 나눈 한 장(마크다운)을 만든다. `made_at`은 만든 때(ISO)다.
pub fn one_page(entries: &[Entry], made_at: &str) -> String {
    let authors: BTreeSet<&str> = entries.iter().map(|e| e.author.as_str()).filter(|a| !a.is_empty()).collect();
    let companies: BTreeSet<String> = entries.iter().map(|e| e.company.to_lowercase()).filter(|c| !c.is_empty()).collect();
    let first = entries.iter().map(|e| e.date.as_str()).filter(|d| !d.is_empty()).min().unwrap_or("");
    let last = entries.iter().map(|e| e.date.as_str()).max().unwrap_or("");
    let mut out = String::from("# CES 2027 일기를 네 태그로 나눈 한 장 (초안)\n\n");
    out.push_str(&format!("- 만든 때: {made_at}\n"));
    out.push_str(&format!("- 일기 {}개 · 쓴 사람 {}명 · 회사 {}곳{}\n", entries.len(), authors.len(), companies.len(), if first.is_empty() { String::new() } else { format!(" · {first} ~ {last}") }));
    out.push_str("- 보내기를 누른 일기를 그대로 묶은 초안이다. 맞다고 확정한 줄만 지식으로 둔다.\n");
    out.push_str("- 한 일기가 여러 태그에 해당하면 그 태그마다 나온다. 별명과 일기가 들어 있으니 공개 레포에 올리지 않는다.\n");
    for (key, ko) in TAGS {
        let mine: Vec<&Entry> = entries.iter().filter(|e| e.tags.iter().any(|t| t == key)).collect();
        section(&mut out, ko, &mine);
    }
    let none: Vec<&Entry> = entries.iter().filter(|e| e.tags.is_empty()).collect();
    if !none.is_empty() {
        section(&mut out, "누구에게인지 고르지 않은 것", &none);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn bundle(nick: &str, entries: Value) -> Value {
        json!({ "app": FORMAT, "v": VERSION, "exportedAt": "2027-01-07T03:00:00Z", "author": { "nick": nick, "tag": "stu" }, "entries": entries })
    }

    #[test]
    fn 내보낸_파일을_읽는다() {
        let b = bundle("물개", json!([
            { "id": "a1", "date": "2027-01-06", "company": "Alpha Robotics", "exhibitorId": "ID01", "booth": "14731@LVCC_N", "saw": "로봇 팔\n시연", "felt": "", "for": ["stu", "job", "모름"] },
            { "id": "a2", "date": "2027-01-06", "company": "빈 일기", "saw": " ", "felt": "", "for": [] }
        ]));
        let got = read_bundle(&b).unwrap();
        assert_eq!(got.len(), 1, "본 것과 느낀 점이 모두 빈 일기는 뺀다");
        assert_eq!(got[0].saw, "로봇 팔 시연", "줄바꿈은 빈칸 하나로");
        assert_eq!(got[0].tags, ["stu", "job"], "모르는 태그는 뺀다");
        assert_eq!(got[0].author, "물개");
    }

    #[test]
    fn 다른_파일은_받지_않는다() {
        assert!(read_bundle(&json!({ "app": "something", "v": 1, "entries": [] })).is_err());
        assert!(read_bundle(&json!({ "app": FORMAT, "v": 2, "entries": [] })).is_err());
        assert!(read_bundle(&json!({ "app": FORMAT, "v": 1 })).is_err());
    }

    #[test]
    fn 합치고_네_태그로_나눈다() {
        let first = bundle("물개", json!([
            { "id": "a1", "date": "2027-01-07", "company": "Zeta Home", "booth": "52011A@VEN_AD", "saw": "조용한 주방 도우미", "felt": "부모님 집에 좋겠다", "for": ["ret", "mid"] },
            { "id": "a2", "date": "2027-01-06", "company": "Alpha Robotics", "booth": "14731@LVCC_N", "saw": "옛 글", "felt": "", "for": ["stu"] }
        ]));
        // 같은 사람이 a2를 고쳐서 다시 보냈다. 다른 사람의 a2는 다른 일기다.
        let again = bundle("물개", json!([{ "id": "a2", "date": "2027-01-06", "company": "Alpha Robotics", "booth": "14731@LVCC_N", "saw": "로봇 팔 시연", "felt": "배워 볼 만하다", "for": ["stu", "job"] }]));
        let other = bundle("고래", json!([{ "id": "a2", "date": "2027-01-06", "company": "Beta Cloud", "saw": "", "felt": "태그를 고르지 않았다", "for": [] }]));
        let all = merge(vec![read_bundle(&first).unwrap(), read_bundle(&again).unwrap(), read_bundle(&other).unwrap()]);
        assert_eq!(all.len(), 3);
        assert_eq!(all.iter().map(|e| e.company.as_str()).collect::<Vec<_>>(), ["Alpha Robotics", "Beta Cloud", "Zeta Home"], "날짜 · 회사 차례");
        assert_eq!(all[0].saw, "로봇 팔 시연", "나중에 보낸 것이 남는다");

        let page = one_page(&all, "2027-01-15T00:00:00Z");
        assert!(page.starts_with("# CES 2027 일기를 네 태그로 나눈 한 장 (초안)\n"));
        assert!(page.contains("- 일기 3개 · 쓴 사람 2명 · 회사 3곳 · 2027-01-06 ~ 2027-01-07\n"));
        let part = |title: &str| page.split("\n## ").find(|s| s.starts_with(title)).unwrap_or_else(|| panic!("{title} 칸이 없다")).to_string();
        assert!(part("학생 (1개)").contains("- **Alpha Robotics** (부스 14731) · 물개\n  - 본 것: 로봇 팔 시연\n  - 느낀 점: 배워 볼 만하다\n"));
        assert!(part("취준생 (1개)").contains("Alpha Robotics"));
        assert!(part("정년 (1개)").contains("### 2027-01-07\n\n- **Zeta Home** (부스 52011A) · 물개\n"));
        assert!(part("장년 (1개)").contains("부모님 집에 좋겠다"));
        assert!(part("누구에게인지 고르지 않은 것 (1개)").contains("- **Beta Cloud** · 고래\n  - 느낀 점: 태그를 고르지 않았다\n"));
    }

    #[test]
    fn 일기가_없어도_네_칸은_나온다() {
        let page = one_page(&[], "2027-01-15T00:00:00Z");
        assert!(page.contains("- 일기 0개 · 쓴 사람 0명 · 회사 0곳\n"));
        for (_, ko) in TAGS {
            assert!(page.contains(&format!("\n## {ko} (0개)\n\n아직 없다.\n")));
        }
        assert!(!page.contains("고르지 않은 것"));
    }
}
