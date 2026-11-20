//! 받기 → 줄이기 → 색인을 지어낸 작은 답으로 끝까지 돌려 본다.
//! 공식 전시사 자료는 레포에 두지 않는다. 여기 회사 이름은 지어낸 것이다.

use ces_core::Index;
use ces_data::fetch::fetch_all;
use ces_data::places::{check, Places};
use ces_data::shrink::{build, Intro, Tables};
use ces_data::source::{file_name, Dir};
use serde_json::{json, Value};
use std::path::PathBuf;

fn repo(path: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..").join(path)
}

fn read(path: &str) -> Value {
    serde_json::from_str(&std::fs::read_to_string(repo(path)).unwrap()).unwrap()
}

fn exhibitor(id: &str, name: &str, booths: &[&str], halls: &[&str], extra: Value) -> Value {
    let mut fields = json!({
        "exhid_l": id,
        "exhname_t": name,
        "booths_la": booths.iter().map(|b| format!("{b}randomstring")).collect::<Vec<_>>(),
        "hallid_la": halls,
    });
    for (k, v) in extra.as_object().unwrap() {
        fields[k] = v.clone();
    }
    json!({ "fields": fields, "id": format!("{id}-Exhibitor-CES27") })
}

fn page(hits: Vec<Value>, found: f64) -> Value {
    json!({ "SUCCESS": true, "DATA": { "totalhits": found, "results": { "exhibitor": { "found": found, "hit": hits } } } })
}

/// 지어낸 답을 폴더에 쓴다. 파일 이름은 도구가 물음에서 만드는 이름과 같다.
fn fake_site(dir: &std::path::Path) {
    let put = |query: &str, body: Value| std::fs::write(dir.join(file_name(query)), body.to_string()).unwrap();
    let zeta = exhibitor("ID03", " Zeta  Home ", &["52011A", "Wynn Encore Latour 2"], &["X", "P"], json!({ "exhdesc_t": "Zeta Home makes quiet kitchen helpers for small homes. Second sentence." }));
    let alpha = exhibitor(
        "ID01",
        "Alpha Robotics",
        &["14731"],
        &["A"],
        json!({ "exhdesc_t": "Alpha builds arms.", "exhicons_l": "\"[{\"columnname\":\"innovation\",\"title\":\"Innovation Awards Honoree\"}]\"", "exhfeatured_t": "1" }),
    );
    let samsung = exhibitor("ID02", "Samsung Electronics, Inc.", &["CP120", "Mystery Room"], &["L", "QX"], json!({}));
    // 전시사 목록은 두 쪽으로 온다 (found 3, 첫 쪽 2곳).
    put("action=search&searchtype=exhibitorgallery&searchsize=500&start=0", page(vec![zeta.clone(), alpha.clone()], 3.0));
    put("action=search&searchtype=exhibitorgallery&searchsize=500&start=500", page(vec![samsung.clone()], 3.0));
    put(
        "action=getsearchoptions&function=getsearchcategories&exhibitorgallery=true",
        json!({ "DATA": [
            { "fieldvalue": 999999999, "fielddisplay": "- View All -" },
            { "fieldvalue": 1, "fielddisplay": "Robotics" },
            { "fieldvalue": 2, "fielddisplay": "Smart Home & Appliances" },
            { "fieldvalue": 3, "fielddisplay": "Brand New Field" }
        ] }),
    );
    let cat = |name: &str, ids: &str| json!({ "DATA": { "results": { "category": { "found": 1, "hit": [{ "fields": { "category_t": name, "exhid_t": ids } }] } } } });
    put("action=search&searchtype=category&search=Robotics&searchsize=50&start=0", cat("Robotics", "ID01, ID03, "));
    put("action=search&searchtype=category&search=Smart%20Home%20%26%20Appliances&searchsize=50&start=0", cat("Smart Home & Appliances", "ID03"));
    put("action=search&searchtype=category&search=Brand%20New%20Field&searchsize=50&start=0", json!({ "DATA": { "results": {} } }));
    put("action=getsearchoptions&function=getcountries", json!({ "DATA": [{ "fieldvalue": "Japan", "fielddisplay": "Japan" }, { "fieldvalue": "South Korea", "fielddisplay": "South Korea" }] }));
    put("action=search&searchtype=country&search=Japan&searchsize=500&start=0", page(vec![alpha], 1.0));
    put("action=search&searchtype=country&search=South%20Korea&searchsize=500&start=0", page(vec![zeta, samsung], 2.0));
}

fn built(intro: Intro) -> ces_data::shrink::Output {
    static NEXT: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
    let n = NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    let dir = std::env::temp_dir().join(format!("ces-data-test-{}-{n}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    fake_site(&dir);
    let raw = fetch_all(&mut Dir { dir: dir.clone() }, &mut |_| {}).expect("받는다");
    std::fs::remove_dir_all(&dir).ok();
    let places = Places::load(&repo("data/places.json")).expect("장소 자료");
    let tables = Tables::from_json(&read("data/categories.json"), &read("data/aliases.json"));
    build(&raw, &places, intro, &tables, "2026-11-20T01:02:03Z")
}

#[test]
fn 받아서_줄인다() {
    let out = built(Intro::LinkOnly);
    let x = &out.exhibitors;
    assert_eq!(x["n"], 3);
    assert_eq!(x["v"], "2026-11-20");
    assert_eq!(x["fetchedAt"], "2026-11-20T01:02:03Z");
    assert_eq!(x["src"], "https://exhibitors.ces.tech/8_0/");
    assert_eq!(x["cats"], json!(["Robotics", "Smart Home & Appliances", "Brand New Field"]));
    assert_eq!(x["catsKo"], json!(["로봇", "스마트홈·가전", ""]));
    // 나라는 전시사가 많은 차례.
    assert_eq!(x["countries"], json!(["South Korea", "Japan"]));
    // 이름 차례로 서고, 부스마다 장소가 붙는다. 소개는 싣지 않는다.
    assert_eq!(
        x["ex"],
        json!([
            ["ID01", "Alpha Robotics", "", 1, "0", 1, 1, ["14731@LVCC_N"]],
            ["ID02", "Samsung Electronics, Inc.", "", 0, "", 0, 0, ["CP120@LVCC_CP", "Mystery Room@HALL_QX"]],
            ["ID03", "Zeta Home", "", 0, "0.1", 0, 0, ["52011A@VEN_AD", "Wynn Encore Latour 2@WYNN"]]
        ])
    );
    let m = &out.meta;
    assert_eq!((m["exhibitors"].as_u64(), m["korea"].as_u64(), m["awards"].as_u64()), (Some(3), Some(2), Some(1)));
    assert_eq!((m["booths"].as_u64(), m["unplacedBooths"].as_u64()), (Some(5), Some(1)));
    assert_eq!(m["companyIntro"], "link-only");
    assert_eq!(m["places"]["edition"], "2026-09-29");
    // 사람이 볼 것 둘: 한글 이름이 없는 분야, 장소를 못 정한 부스.
    assert_eq!(out.warnings.len(), 2, "{:?}", out.warnings);
    assert!(out.warnings.iter().any(|w| w.contains("Brand New Field")));
    assert!(out.warnings.iter().any(|w| w.contains("Mystery Room@HALL_QX")));
}

#[test]
fn 설정을_바꾸면_첫_문장이_실린다() {
    let out = built(Intro::FirstSentence);
    assert_eq!(out.exhibitors["intro"], "first-sentence");
    assert_eq!(out.exhibitors["ex"][0][2], "Alpha builds arms.");
    assert_eq!(out.exhibitors["ex"][1][2], "");
    assert_eq!(out.exhibitors["ex"][2][2], "Zeta Home makes quiet kitchen helpers for small homes.");
}

#[test]
fn 만든_색인으로_코어가_찾는다() {
    let out = built(Intro::LinkOnly);
    let ix = Index::parse(out.index).expect("코어가 색인을 읽는다");
    assert_eq!(ix.rows(), 3);
    assert_eq!(ix.search("samsung", 10), [1]);
    assert_eq!(ix.search("삼성", 10), [1], "별칭 낱말과 한글로 부르는 이름");
    assert_eq!(ix.search("로봇", 10), [0, 2], "분야 한글 이름. 이름에 robotics가 있는 줄이 먼저");
    assert_eq!(ix.search("robot", 10), [0, 2]);
    assert_eq!(ix.search("한국", 10), [1, 2]);
    assert_eq!(ix.search("14731", 10), [0], "부스 번호");
    assert_eq!(ix.search("노스 홀", 10), [0], "장소 한글 이름");
    assert_eq!(ix.search("wynn", 10), [2]);
    assert_eq!(ix.search("japan robotics", 10), [0]);
    assert!(ix.search("quiet kitchen", 10).is_empty(), "소개 글은 색인에 넣지 않는다");
}

#[test]
fn 장소_자료에_잘못이_없다() {
    let json = read("data/places.json");
    assert_eq!(check(&json), Vec::<String>::new());
    let places = Places::from_json(json).unwrap();
    let (count, guess) = places.counts();
    assert_eq!(count, 30);
    assert_eq!(guess, 30, "정식 배치도가 열리기 전이라 모든 곳이 짐작이다");
}

#[test]
fn 장소_자료의_잘못을_찾는다() {
    let mut json = read("data/places.json");
    json["places"][0]["c"] = json!("mars");
    json["places"][1]["boothSpots"] = json!("maybe");
    json["places"][2]["maps"] = json!({ "venue": "NOWHERE", "query": "" });
    json["boothRules"]["halls"]["A"] = json!("LVCC_MOON");
    json["mapsUrls"]["search"] = json!("https://www.google.com/maps/search/?api=1&key=SECRET&query={query}");
    let bad = check(&json);
    for want in ["없는 캠퍼스 `mars`", "boothSpots", "maps.query", "maps.venue `NOWHERE`", "`LVCC_MOON`", "mapsUrls.search"] {
        assert!(bad.iter().any(|b| b.contains(want)), "`{want}`가 없다: {bad:?}");
    }
    assert_eq!(bad.len(), 6, "{bad:?}");
}

#[test]
fn 부스에서_장소를_정한다() {
    let places = Places::load(&repo("data/places.json")).unwrap();
    let cases = [
        ("5131", "NN", "LVCC_W"),
        ("14731", "A", "LVCC_N"),
        ("20101", "B", "LVCC_C"),
        ("31018", "D", "LVCC_S1"),
        ("36001", "D", "LVCC_S2"),
        ("40112", "C", "LVCC_S3"),
        ("52011A", "X", "VEN_AD"),
        ("60215", "M", "VEN_G"),
        ("99999", "A", "UNKNOWN"),
        ("CP120", "L", "LVCC_CP"),
        ("Silver 3 - 2", "L", "LVCC_SILVER3"),
        ("DL-4", "NN", "LVCC_DIAMOND"),
        ("GL-12", "B", "LVCC_GL"),
        ("N253", "E", "LVCC_N_MTG"),
        ("W218", "RR", "LVCC_W_MTG"),
        ("C107", "B", "LVCC_C_MTG"),
        ("S225", "D", "LVCC_S_MTG"),
        ("Marco Polo 701", "H", "VEN_L1"),
        ("Titian 2201", "H", "VEN_L2"),
        ("Venetian H", "H", "VEN_BALL"),
        ("Venetian Palazzo Hospitality Suites", "J", "VEN_TOWER"),
        ("San Polo 3401", "H", "VEN_L3"),
        ("Zeno 4601", "Y", "VEN_L4"),
        ("Suite 29-207", "U", "VEN_TOWER"),
        ("Wynn Encore Latour 2", "P", "WYNN"),
        ("FT-12", "O", "FONT"),
        ("Fontainebleau Ballroom", "AAA", "FONT"),
        ("Westgate Suite", "N", "WESTGATE"),
        ("Resorts World Suite", "TT", "RW"),
        ("ARIA Hospitality Suites", "AA", "ARIA"),
        ("Vdara Suite", "BB", "VDARA"),
        ("Condesa 3", "YY", "COSMO"),
        ("Beach Lot", "HH", "BEACH"),
        ("Somewhere Else", "GG", "ARIA"),
        ("Somewhere Else", "QX", "HALL_QX"),
        ("Somewhere Else", "", "UNKNOWN"),
    ];
    for (booth, hall, want) in cases {
        assert_eq!(places.rules.place_of(booth, hall), want, "{booth} · {hall}");
    }
}
