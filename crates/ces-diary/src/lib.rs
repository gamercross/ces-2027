//! 모인 일기를 네 태그로 나눠 한 장으로 만든다 (이슈 #18의 첫 조각).
//!
//! 폰의 일기 화면에서 내보낸 파일(`web/diary.js`의 꼴. 사진이 든 파일도 읽는다)을 읽어, "누구에게"(학생 · 취준생 · 정년 · 장년)로 나눈
//! 마크다운 한 장을 쓴다. 이 한 장은 보낸 글을 그대로 묶은 초안이다. 맞다고 확정하는 것은 사람이 한다.
//! 모은 파일과 만든 한 장에는 별명과 일기가 들어 있으니 공개 레포에 올리지 않는다.

pub mod abi;

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
    /// 일기에 사진이 든 파일이었나(R49). 사진 자체는 읽어 두지 않는다 — 한 장에는 "사진 있음"만 적는다.
    pub has_photo: bool,
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
            has_photo: e.get("photo").and_then(Value::as_str).is_some_and(|p| p.starts_with("data:image/")),
            tags: e["for"].as_array().into_iter().flatten().filter_map(Value::as_str).filter(|t| TAGS.iter().any(|(k, _)| k == t)).map(str::to_string).collect(),
        })
        .filter(|e| !e.saw.is_empty() || !e.felt.is_empty() || e.has_photo)
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

/// 한 사람의 한 줄 뒤에 붙는 꼬리: 누가 · 언제.
fn tail(e: &Entry) -> String {
    let who: Vec<&str> = [e.author.as_str(), e.date.as_str()].into_iter().filter(|s| !s.is_empty()).collect();
    if who.is_empty() { String::new() } else { format!(" ({})", who.join(", ")) }
}

/// 한 태그의 칸: 회사마다 묶어, 본 것과 느낀 점을 모은다. 일기가 많은 회사가 먼저다.
fn section(out: &mut String, title: &str, entries: &[&Entry]) {
    // 회사 이름은 큰 글자 · 작은 글자를 가리지 않고 묶는다. 보이는 이름은 처음 나온 것.
    let mut order: Vec<String> = Vec::new();
    let mut by_company: BTreeMap<String, Vec<&Entry>> = BTreeMap::new();
    for e in entries {
        let key = e.company.to_lowercase();
        if !by_company.contains_key(&key) {
            order.push(key.clone());
        }
        by_company.entry(key).or_default().push(e);
    }
    order.sort_by(|a, b| by_company[b].len().cmp(&by_company[a].len()).then_with(|| a.cmp(b)));
    out.push_str(&format!("\n## {title} (일기 {}개 · 회사 {}곳)\n", entries.len(), order.len()));
    if entries.is_empty() {
        out.push_str("\n아직 없다.\n");
        return;
    }
    for key in &order {
        let list = &by_company[key];
        let name = if list[0].company.is_empty() { "회사 없음" } else { &list[0].company };
        let booth = list.iter().map(|e| e.booth.split('@').next().unwrap_or("")).find(|b| !b.is_empty()).unwrap_or("");
        out.push_str(&format!("\n### {name}{}{}\n", if booth.is_empty() { String::new() } else { format!(" (부스 {booth})") }, if list.len() > 1 { format!(" · 일기 {}개", list.len()) } else { String::new() }));
        for (label, pick) in [("본 것", (|e: &Entry| e.saw.clone()) as fn(&Entry) -> String), ("느낀 점", |e: &Entry| e.felt.clone())] {
            let lines: Vec<String> = list.iter().filter(|e| !pick(e).is_empty()).map(|e| format!("- {}{}\n", pick(e), tail(e))).collect();
            if !lines.is_empty() {
                out.push_str(&format!("\n{label}\n\n{}", lines.concat()));
            }
        }
        // 사진(R49)은 한 장에 넣지 않고 "사진 있음"만 적는다.
        let photos: Vec<String> = list.iter().filter(|e| e.has_photo).map(|e| format!("- 사진 있음{}\n", tail(e))).collect();
        if !photos.is_empty() {
            out.push_str(&format!("\n사진\n\n{}", photos.concat()));
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
    out.push_str("- 태그마다 회사로 묶었다. 한 일기가 여러 태그에 해당하면 그 태그마다 나온다. 별명과 일기가 들어 있으니 공개 레포에 올리지 않는다.\n");
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
    fn 대화가_든_파일도_일기만_읽는다() {
        // 파일로 내려받은 묶음에는 이어진 대화(talks)가 같이 든다. 네 태그 정리는 일기만 읽고 대화는 지나간다.
        let mut b = bundle("물개", json!([{ "id": "a1", "date": "2027-01-06", "company": "Alpha Robotics", "saw": "로봇 팔", "felt": "", "for": ["stu"] }]));
        b["talks"] = json!([{ "id": "t1", "date": "2027-01-06", "exhibitorId": "ID01", "company": "Alpha Robotics", "source": "paste", "kind": "pairs", "pairs": [{ "who": "them", "en": "Hello", "ko": "안녕하세요" }] }]);
        let got = read_bundle(&b).unwrap();
        assert_eq!(got.len(), 1);
        assert_eq!(got[0].saw, "로봇 팔");
        assert!(!one_page(&got, "2027-01-07").contains("안녕하세요"), "대화는 네 태그 한 장에 들어가지 않는다");
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
        assert!(part("학생 (일기 1개 · 회사 1곳)").contains("### Alpha Robotics (부스 14731)\n\n본 것\n\n- 로봇 팔 시연 (물개, 2027-01-06)\n\n느낀 점\n\n- 배워 볼 만하다 (물개, 2027-01-06)\n"));
        assert!(part("취준생 (일기 1개 · 회사 1곳)").contains("Alpha Robotics"));
        assert!(part("정년 (일기 1개 · 회사 1곳)").contains("### Zeta Home (부스 52011A)\n\n본 것\n\n- 조용한 주방 도우미 (물개, 2027-01-07)\n"));
        assert!(part("장년 (일기 1개 · 회사 1곳)").contains("- 부모님 집에 좋겠다 (물개, 2027-01-07)"));
        let none = part("누구에게인지 고르지 않은 것 (일기 1개 · 회사 1곳)");
        assert!(none.contains("### Beta Cloud\n\n느낀 점\n\n- 태그를 고르지 않았다 (고래, 2027-01-06)\n"));
        assert!(!none.contains("본 것"), "본 것이 빈 회사에는 그 칸이 없다");
    }

    #[test]
    fn 같은_회사는_한_칸으로_묶는다() {
        let a = bundle("가짜 가", json!([
            { "id": "1", "date": "2027-01-06", "company": "Alpha Robotics", "booth": "14731@LVCC_N", "saw": "팔이 컵을 집는다", "felt": "", "for": ["stu"] },
            { "id": "2", "date": "2027-01-06", "company": "Solo Works", "saw": "혼자 본 곳", "felt": "", "for": ["stu"] }
        ]));
        let b = bundle("가짜 나", json!([{ "id": "1", "date": "2027-01-07", "company": "alpha robotics", "booth": "", "saw": "", "felt": "값이 궁금하다", "for": ["stu"] }]));
        let all = merge(vec![read_bundle(&a).unwrap(), read_bundle(&b).unwrap()]);
        let page = one_page(&all, "2027-01-15T00:00:00Z");
        let stu = page.split("\n## ").find(|s| s.starts_with("학생")).unwrap();
        assert!(stu.starts_with("학생 (일기 3개 · 회사 2곳)\n"));
        // 일기가 많은 회사가 먼저, 이름은 처음 나온 대로, 부스는 적힌 것으로.
        assert!(stu.contains("### Alpha Robotics (부스 14731) · 일기 2개\n\n본 것\n\n- 팔이 컵을 집는다 (가짜 가, 2027-01-06)\n\n느낀 점\n\n- 값이 궁금하다 (가짜 나, 2027-01-07)\n\n### Solo Works\n"));
    }

    #[test]
    fn 사진이_든_파일도_읽고_한_장에는_사진_있음만_적는다() {
        // 사진(R49)은 일기 한 개의 "photo"(데이터 주소)다. 한 장에는 사진을 넣지 않는다.
        let big = format!("data:image/jpeg;base64,{}", "QUJD".repeat(5000));
        let b = bundle("가짜 가", json!([
            { "id": "p1", "date": "2027-01-06", "company": "Alpha Robotics", "saw": "로봇 팔", "felt": "", "photo": big, "for": ["stu"] },
            { "id": "p2", "date": "2027-01-07", "company": "Alpha Robotics", "saw": "", "felt": "", "photo": "data:image/png;base64,AAAA", "for": ["stu"] },
            { "id": "p3", "date": "2027-01-07", "company": "Beta Cloud", "saw": "사진이 아닌 칸", "felt": "", "photo": { "x": 1 }, "for": ["stu"] },
            { "id": "p4", "date": "2027-01-07", "company": "Beta Cloud", "saw": "글자만 든 칸", "felt": "", "photo": "http://example.com/a.jpg", "for": ["stu"] }
        ]));
        let got = read_bundle(&b).unwrap();
        assert_eq!(got.iter().map(|e| e.has_photo).collect::<Vec<_>>(), [true, true, false, false], "데이터 주소만 사진으로 센다. 다른 꼴은 깨지지 않고 지나간다");
        assert_eq!(got.len(), 4, "글 없이 사진만 든 일기도 한 개로 센다");
        let page = one_page(&merge(vec![got]), "2027-01-15T00:00:00Z");
        assert!(!page.contains("data:image") && !page.contains("QUJD"), "한 장에는 사진이 들어가지 않는다");
        assert!(page.contains("### Alpha Robotics · 일기 2개\n\n본 것\n\n- 로봇 팔 (가짜 가, 2027-01-06)\n\n사진\n\n- 사진 있음 (가짜 가, 2027-01-06)\n- 사진 있음 (가짜 가, 2027-01-07)\n"), "회사 칸 끝에 \"사진 있음\"이 날짜 차례로 적힌다");
        assert!(!page.split("### Beta Cloud").nth(1).unwrap().contains("사진 있음"), "사진이 없는 회사에는 그 줄이 없다");
        // 사진이 없는 파일은 한 장이 이전과 똑같다.
        assert!(!one_page(&merge(vec![read_bundle(&bundle("가짜 나", json!([{ "id": "z", "date": "2027-01-06", "company": "Zeta", "saw": "본 것", "felt": "", "for": ["stu"] }]))).unwrap()]), "x").contains("사진"));
    }

    #[test]
    fn 일기가_없어도_네_칸은_나온다() {
        let page = one_page(&[], "2027-01-15T00:00:00Z");
        assert!(page.contains("- 일기 0개 · 쓴 사람 0명 · 회사 0곳\n"));
        for (_, ko) in TAGS {
            assert!(page.contains(&format!("\n## {ko} (일기 0개 · 회사 0곳)\n\n아직 없다.\n")));
        }
        assert!(!page.contains("고르지 않은 것"));
    }
}
