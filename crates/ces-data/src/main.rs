//! `ces-data` 명령줄.

use ces_data::places::Places;
use ces_data::shrink::{build, Intro, Tables};
use ces_data::source::{Dir, Http, Source};
use ces_data::{fetch, time};
use serde_json::Value;
use std::path::{Path, PathBuf};
use std::process::ExitCode;

const HELP: &str = "\
ces-data: CES 공식 전시사 검색에서 자료를 받아 줄이고 찾기 색인을 만든다

쓰는 법:
  ces-data build [고름]         받아서 exhibitors.json · logos.json · search-index.txt · meta.json · places.json을 쓴다
  ces-data check-places [고름]  장소 자료만 살핀다
  ces-data sessions [고름]      CES 공식 일정(ces.tech/schedule)에서 기조연설 · 세션을 받아 sessions.json을 쓴다 (--out · --from · --save-raw)
  ces-data sort-diary --in <폴더나 파일> [--in ...] [--out <파일>]
                                폰에서 내보낸 일기 파일들을 네 태그로 나누고 회사로 묶은 한 장(마크다운)으로 만든다
  ces-data osm [--from <폴더>] [--save-raw <폴더>] [--out <파일>]
                                오픈스트리트맵에서 LVCC · 베네시안 둘레의 건물 · 길 · 모노레일 · 출입구를 받아
                                data/osm-map.json(ODbL)을 쓴다. 사람이 다시 받을 때만 부른다 (물음 두 번)
  ces-data check-links --in <파일> [--in ...]
                                자료 파일에 적은 출처 링크가 살아 있는지 본다. 없어진 주소가 있으면 실패로 끝난다

고름:
  --out <폴더>         쓰는 곳 (기본 dist/data)
  --places <파일>      장소 자료 (기본 data/places.json)
  --settings <파일>    설정 (기본 config/settings.json)
  --categories <파일>  분야 한글 이름 (기본 data/categories.json)
  --aliases <파일>     찾기 별칭 (기본 data/aliases.json)
  --from <폴더>        공식 사이트 대신 받아 둔 폴더에서 읽는다
  --save-raw <폴더>    받은 답을 그대로 이 폴더에 둔다 (공개 레포에 올리지 않는다)
  --in <폴더나 파일>   sort-diary: 내보낸 일기 파일(.json)이나 그것이 든 폴더. 여러 번 적을 수 있다 (공개 레포에 올리지 않는다)
  --made-at <때>       sort-diary: 한 장에 적을 만든 때 (적지 않으면 지금)
";

struct Args {
    out: PathBuf,
    places: PathBuf,
    settings: PathBuf,
    categories: PathBuf,
    aliases: PathBuf,
    from: Option<PathBuf>,
    save_raw: Option<PathBuf>,
    inputs: Vec<PathBuf>,
    out_given: bool,
    made_at: Option<String>,
}

fn parse_args(rest: &[String]) -> Result<Args, String> {
    let mut a = Args {
        out: "dist/data".into(),
        places: "data/places.json".into(),
        settings: "config/settings.json".into(),
        categories: "data/categories.json".into(),
        aliases: "data/aliases.json".into(),
        from: None,
        save_raw: None,
        inputs: Vec::new(),
        out_given: false,
        made_at: None,
    };
    let mut it = rest.iter();
    while let Some(flag) = it.next() {
        let mut value = || it.next().map(PathBuf::from).ok_or_else(|| format!("{flag} 뒤에 값이 없다"));
        match flag.as_str() {
            "--out" => {
                a.out = value()?;
                a.out_given = true;
            }
            "--in" => a.inputs.push(value()?),
            "--made-at" => a.made_at = Some(value()?.to_string_lossy().into_owned()),
            "--places" => a.places = value()?,
            "--settings" => a.settings = value()?,
            "--categories" => a.categories = value()?,
            "--aliases" => a.aliases = value()?,
            "--from" => a.from = Some(value()?),
            "--save-raw" => a.save_raw = Some(value()?),
            other => return Err(format!("모르는 고름: {other}")),
        }
    }
    Ok(a)
}

fn read_json(path: &Path) -> Result<Value, String> {
    let text = std::fs::read_to_string(path).map_err(|e| format!("{}: {e}", path.display()))?;
    serde_json::from_str(&text).map_err(|e| format!("{}: JSON이 아니다: {e}", path.display()))
}

fn write(path: &Path, text: &str) -> Result<(), String> {
    std::fs::write(path, text).map_err(|e| format!("{}: {e}", path.display()))
}

/// GitHub Actions에서는 주의 줄로, 아니면 그냥 적는다.
fn warn(msg: &str) {
    if std::env::var_os("GITHUB_ACTIONS").is_some() {
        println!("::warning::{msg}");
    } else {
        eprintln!("주의: {msg}");
    }
}

fn run_build(a: &Args) -> Result<(), String> {
    let places = Places::load(&a.places)?;
    let settings = read_json(&a.settings)?;
    let intro = Intro::parse(settings["companyIntro"].as_str().unwrap_or(""))?;
    let tables = Tables::from_json(&read_json(&a.categories)?, &read_json(&a.aliases)?);

    let mut log = |line: &str| println!("{line}");
    let (raw, fetched_at) = match &a.from {
        Some(dir) => {
            println!("받아 둔 폴더에서 읽는다: {}", dir.display());
            let mut src = Dir { dir: dir.clone() };
            let raw = fetch::fetch_all(&mut src, &mut log)?;
            let stamp = std::fs::read_to_string(dir.join("fetched-at.txt")).map(|s| s.trim().to_string()).ok();
            (raw, stamp.filter(|s| time::looks_iso(s)).unwrap_or_else(time::now_iso))
        }
        None => {
            println!("공식 사이트에서 받는다: {}", ces_data::source::ORIGIN);
            let mut src = Http::new(a.save_raw.clone())?;
            let raw = fetch::fetch_all(&mut src as &mut dyn Source, &mut log)?;
            let fetched_at = time::now_iso();
            if let Some(dir) = &a.save_raw {
                write(&dir.join("fetched-at.txt"), &fetched_at)?;
            }
            println!("물음 {}번", src.calls);
            (raw, fetched_at)
        }
    };

    let out = build(&raw, &places, intro, &tables, &fetched_at);
    std::fs::create_dir_all(&a.out).map_err(|e| format!("{}: {e}", a.out.display()))?;
    write(&a.out.join("exhibitors.json"), &out.exhibitors.to_string())?;
    write(&a.out.join("logos.json"), &out.logos.to_string())?;
    write(&a.out.join("search-index.txt"), &out.index)?;
    write(&a.out.join("meta.json"), &serde_json::to_string_pretty(&out.meta).map_err(|e| e.to_string())?)?;
    write(&a.out.join("places.json"), &places.json.to_string())?;
    for w in &out.warnings {
        warn(w);
    }
    let m = &out.meta;
    println!(
        "끝: 전시사 {} · 분야 {} · 나라 {} · 한국 {} · 혁신상 표시 {} · 부스 {} (장소 못 정함 {}) · 색인 낱말 {} · 받은 날짜 {} · 회사 소개 {}",
        m["exhibitors"], m["categories"], m["countries"], m["korea"], m["awards"], m["booths"], m["unplacedBooths"], m["indexWords"], m["v"].as_str().unwrap_or(""), intro.as_str()
    );
    println!("쓴 곳: {}", a.out.display());
    Ok(())
}

fn run_check_places(a: &Args) -> Result<(), String> {
    let places = Places::load(&a.places)?;
    let (count, guess) = places.counts();
    println!("장소 자료 잘못 0: 장소 {count}곳 (부스 자리 짐작 {guess}곳) · 캠퍼스 지도 {}판", places.json["edition"].as_str().unwrap_or(""));
    Ok(())
}

/// 공식 일정을 받아 `sessions.json`을 쓴다. 못 받으면 파일을 쓰지 않고 실패로 끝난다(짐작해서 채우지 않는다).
fn run_sessions(a: &Args) -> Result<(), String> {
    use ces_data::sessions as s;
    let mut log = |line: &str| println!("{line}");
    let (fetched, at) = match &a.from {
        Some(dir) => {
            println!("받아 둔 폴더에서 읽는다: {}", dir.display());
            let f = s::fetch_all(&mut s::Dir { dir: dir.clone() }, &mut log)?;
            let stamp = std::fs::read_to_string(dir.join("fetched-at.txt")).map(|t| t.trim().to_string()).ok();
            (f, stamp.filter(|t| time::looks_iso(t)).unwrap_or_else(time::now_iso))
        }
        None => {
            println!("공식 일정에서 받는다: {}/schedule", s::ORIGIN);
            let mut src = s::Http::new(a.save_raw.clone())?;
            let f = s::fetch_all(&mut src, &mut log)?;
            let at = time::now_iso();
            if let Some(dir) = &a.save_raw {
                write(&dir.join("fetched-at.txt"), &at)?;
            }
            println!("물음 {}번", src.calls);
            (f, at)
        }
    };
    s::write_json(&a.out, &fetched, &at)?;
    println!("끝: 날짜 {} · 일정 {} · 읽지 못한 카드 {} · 받은 날짜 {}", fetched.days.len(), fetched.items.len(), fetched.skipped, at);
    println!("쓴 곳: {}", a.out.join("sessions.json").display());
    Ok(())
}

/// 오픈스트리트맵에서 받아 지도 파일 한 장으로 줄인다. 못 받으면 파일을 쓰지 않는다.
fn run_osm(a: &Args) -> Result<(), String> {
    use ces_data::osm;
    let geo = osm::GeoRef::from_places(&read_json(&a.places)?)?;
    let mut log = |line: &str| println!("{line}");
    let (answers, at) = match &a.from {
        Some(dir) => {
            println!("받아 둔 폴더에서 읽는다: {}", dir.display());
            let stamp = std::fs::read_to_string(dir.join("fetched-at.txt")).map(|s| s.trim().to_string()).ok();
            (osm::read_dir(dir)?, stamp.filter(|s| time::looks_iso(s)).unwrap_or_else(time::now_iso))
        }
        None => {
            println!("오픈스트리트맵(Overpass)에서 받는다: {} · 물음 {}번", osm::OVERPASS, osm::AREAS.len());
            let got = osm::fetch(a.save_raw.as_deref(), &mut log)?;
            let at = time::now_iso();
            if let Some(dir) = &a.save_raw {
                write(&dir.join("fetched-at.txt"), &at)?;
            }
            (got, at)
        }
    };
    let v = osm::shrink(&answers, &geo, &at)?;
    let out = if a.out_given { a.out.clone() } else { PathBuf::from("data/osm-map.json") };
    let text = osm::to_text(&v);
    write(&out, &text)?;
    let c = &v["counts"];
    println!("끝: 건물 {} (우리 말 이름 {} · 높이를 아는 곳 {}) · 길 {} · 모노레일 {} · 정거장 {} · 출입구 {} · {} KB · 받은 때 {}", c["buildings"], c["named"], c["withHeight"], c["roads"], c["rail"], c["stations"], c["entrances"], text.len() / 1024, at);
    println!("쓴 곳: {}", out.display());
    Ok(())
}

/// 자료 파일의 출처 링크를 하나씩 열어 본다.
fn run_check_links(a: &Args) -> Result<(), String> {
    if a.inputs.is_empty() {
        return Err("--in <파일>이 있어야 한다 (예: --in data/transit.json)".into());
    }
    let mut urls = Vec::new();
    for path in &a.inputs {
        urls.extend(ces_data::links::collect(&read_json(path)?));
    }
    urls.sort();
    urls.dedup();
    println!("링크 {}개를 본다", urls.len());
    let rows = ces_data::links::check(&urls);
    let table = ces_data::links::table(&rows);
    print!("{table}");
    let count = |s| rows.iter().filter(|r| r.2 == s).count();
    let (alive, dead, unknown) = (count(ces_data::links::State::Alive), count(ces_data::links::State::Dead), count(ces_data::links::State::Unknown));
    let line = format!("살아 있음 {alive} · 죽음 {dead} · 확인 못 함 {unknown} (본 때 {})", time::now_iso());
    println!("{line}");
    if let Some(path) = std::env::var_os("GITHUB_STEP_SUMMARY") {
        use std::io::Write;
        if let Ok(mut f) = std::fs::OpenOptions::new().append(true).create(true).open(path) {
            let _ = writeln!(f, "### 출처 링크 살피기\n\n{line}\n\n{table}");
        }
    }
    for r in rows.iter().filter(|r| r.2 == ces_data::links::State::Unknown) {
        warn(&format!("확인 못 함 (사람이 브라우저로 본다): {}", r.0));
    }
    if dead > 0 {
        return Err(format!("없어진 주소가 {dead}개 있다. 자료 파일의 그 줄을 다시 확인한다"));
    }
    Ok(())
}

/// 내보낸 일기 파일들을 읽어 네 태그로 나눈 한 장을 쓴다.
fn run_sort_diary(a: &Args) -> Result<(), String> {
    if a.inputs.is_empty() {
        return Err("--in <폴더나 파일>이 있어야 한다".into());
    }
    let mut paths: Vec<PathBuf> = Vec::new();
    for input in &a.inputs {
        if input.is_dir() {
            let mut inside: Vec<PathBuf> = std::fs::read_dir(input).map_err(|e| format!("{}: {e}", input.display()))?.filter_map(|e| e.ok().map(|e| e.path())).filter(|p| p.extension().is_some_and(|x| x == "json")).collect();
            inside.sort();
            paths.extend(inside);
        } else {
            paths.push(input.clone());
        }
    }
    let mut bundles = Vec::new();
    for path in &paths {
        match read_json(path).and_then(|json| ces_data::diary::read_bundle(&json)) {
            Ok(entries) => bundles.push(entries),
            Err(e) => warn(&format!("{}: 건너뛴다 ({e})", path.display())),
        }
    }
    let files = bundles.len();
    let all = ces_data::diary::merge(bundles);
    let page = ces_data::diary::one_page(&all, &a.made_at.clone().unwrap_or_else(time::now_iso));
    if a.out_given {
        write(&a.out, &page)?;
        println!("끝: 파일 {files}개 · 일기 {}개 → {}", all.len(), a.out.display());
    } else {
        print!("{page}");
    }
    Ok(())
}

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let result = match args.first().map(String::as_str) {
        Some("build") => parse_args(&args[1..]).and_then(|a| run_build(&a)),
        Some("sessions") => parse_args(&args[1..]).and_then(|a| run_sessions(&a)),
        Some("check-places") => parse_args(&args[1..]).and_then(|a| run_check_places(&a)),
        Some("sort-diary") => parse_args(&args[1..]).and_then(|a| run_sort_diary(&a)),
        Some("osm") => parse_args(&args[1..]).and_then(|a| run_osm(&a)),
        Some("check-links") => parse_args(&args[1..]).and_then(|a| run_check_links(&a)),
        Some("--help" | "-h" | "help") | None => {
            print!("{HELP}");
            return ExitCode::SUCCESS;
        }
        Some(other) => Err(format!("모르는 명령: {other}\n\n{HELP}")),
    };
    match result {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            eprintln!("실패: {e}");
            ExitCode::FAILURE
        }
    }
}
