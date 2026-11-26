//! 오픈스트리트맵에서 LVCC · 베네시안 엑스포 둘레의 건물 · 길 · 모노레일 · 출입구를 받아 작은 지도 파일로 줄인다.
//!
//! - 받는 곳은 Overpass(사람이 가끔 쓰는 공용 서버)다. 폰이 부르지 않는다. 사람이 다시 받을 때만 이 명령을 부르고,
//!   손질한 파일(`data/osm-map.json`)을 저장소에 넣는다. 짓기(GitHub Actions)는 바깥에 묻지 않는다.
//! - 물음은 상자 하나에 한 번, 모두 두 번이다. 사이에 쉬고, 서버가 바쁘다고 하면 오래 쉬고 한 번 더 묻는다.
//! - 자료는 ODbL이다. 손질한 파일도 ODbL로 두고, 지도 아래에 "© OpenStreetMap 기여자"를 보인다(`data/출처.md`).
//! - 좌표는 장소 자료(`data/places.json`)의 `geoRef`로 미터로 바꾼다: x는 동쪽, z는 남쪽이 늘어난다. 지도 · 3D · GPS가 같은 자를 쓴다.

use serde_json::{json, Value};
use std::collections::BTreeSet;
use std::path::{Path, PathBuf};
use std::time::Duration;

pub const OVERPASS: &str = "https://overpass-api.de/api/interpreter";
const USER_AGENT: &str = "ces-2027-data-tool (map refresh, a few queries by hand)";

/// 받는 상자 하나: 남 · 서 · 북 · 동.
pub struct Area {
    pub k: &'static str,
    pub ko: &'static str,
    pub s: f64,
    pub w: f64,
    pub n: f64,
    pub e: f64,
}

/// LVCC 캠퍼스(웨스트 홀 · 퐁텐블로 · 웨스트게이트 · 리조트 월드 포함)와 베네시안 캠퍼스(윈 · 스피어 포함).
pub const AREAS: [Area; 2] = [
    Area { k: "lvcc", ko: "LVCC 둘레", s: 36.1250, w: -115.1690, n: 36.1400, e: -115.1440 },
    Area { k: "ven", ko: "베네시안 엑스포 둘레", s: 36.1165, w: -115.1730, n: 36.1290, e: -115.1555 },
];

/// 받는 것: 건물 윤곽 · 큰 실내 영역(사우스 홀) · 길 · 모노레일 · 정거장 · 출입구.
pub fn query(a: &Area) -> String {
    let b = format!("{},{},{},{}", a.s, a.w, a.n, a.e);
    format!(
        "[out:json][timeout:90];(way[\"building\"]({b});relation[\"building\"]({b});way[\"indoor\"=\"area\"][\"name\"]({b});\
way[\"highway\"~\"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|pedestrian)$\"]({b});\
way[\"railway\"=\"monorail\"]({b});node[\"railway\"~\"^(station|subway_entrance)$\"]({b});way[\"railway\"=\"station\"]({b});node[\"public_transport\"=\"station\"]({b});\
node[\"entrance\"]({b}););out geom;"
    )
}

/// 위도 · 경도 → 미터. 장소 자료의 `geoRef`와 같은 값을 쓴다.
#[derive(Clone, Copy, Debug)]
pub struct GeoRef {
    pub lat: f64,
    pub lng: f64,
    pub mx: f64,
    pub mz: f64,
}

impl GeoRef {
    pub fn from_places(places: &Value) -> Result<GeoRef, String> {
        let g = &places["geoRef"];
        let f = |k: &str| g[k].as_f64().ok_or_else(|| format!("장소 자료의 geoRef.{k}가 없다"));
        Ok(GeoRef { lat: f("lat")?, lng: f("lng")?, mx: f("mx")?, mz: f("mz")? })
    }
    pub fn xz(&self, lat: f64, lng: f64) -> (f64, f64) {
        ((lng - self.lng) * self.mx, (self.lat - lat) * self.mz)
    }
}

/// 받은 답을 그대로 둘 폴더의 파일 이름.
pub fn raw_name(a: &Area) -> String {
    format!("osm-{}.json", a.k)
}

/// Overpass에서 받는다. 상자마다 한 번. `save_to`를 주면 받은 답을 그대로 둔다(저장소 밖에 둔다).
pub fn fetch(save_to: Option<&Path>, log: &mut dyn FnMut(&str)) -> Result<Vec<String>, String> {
    let config = ureq::Agent::config_builder().timeout_global(Some(Duration::from_secs(150))).user_agent(USER_AGENT).http_status_as_error(false).build();
    let agent: ureq::Agent = config.into();
    if let Some(dir) = save_to {
        std::fs::create_dir_all(dir).map_err(|e| format!("{}: {e}", dir.display()))?;
    }
    let mut out = Vec::new();
    for (i, a) in AREAS.iter().enumerate() {
        if i > 0 {
            std::thread::sleep(Duration::from_secs(5));
        }
        let body = format!("data={}", crate::source::encode(&query(a)));
        let mut last = String::new();
        let mut got = None;
        for wait in [0u64, 30] {
            if wait > 0 {
                log(&format!("서버가 바쁘다({last}). {wait}초 쉬고 한 번 더 묻는다"));
                std::thread::sleep(Duration::from_secs(wait));
            }
            let res = agent.post(OVERPASS).header("Content-Type", "application/x-www-form-urlencoded").send(body.as_str());
            match res {
                Ok(mut r) if r.status() == 200 => {
                    got = Some(r.body_mut().with_config().limit(64 * 1024 * 1024).read_to_string().map_err(|e| e.to_string())?);
                    break;
                }
                Ok(r) => last = format!("답 {}", r.status()),
                Err(e) => last = e.to_string(),
            }
        }
        let text = got.ok_or_else(|| format!("오픈스트리트맵에서 받지 못했다 ({}): {last}", a.ko))?;
        log(&format!("{} 받음 ({} KB)", a.ko, text.len() / 1024));
        if let Some(dir) = save_to {
            let path = dir.join(raw_name(a));
            std::fs::write(&path, &text).map_err(|e| format!("{}: {e}", path.display()))?;
        }
        out.push(text);
    }
    Ok(out)
}

/// 받아 둔 폴더에서 읽는다.
pub fn read_dir(dir: &PathBuf) -> Result<Vec<String>, String> {
    AREAS.iter().map(|a| { let p = dir.join(raw_name(a)); std::fs::read_to_string(&p).map_err(|e| format!("{}: {e}", p.display())) }).collect()
}

/// 이름을 우리 말로. 표에 없는 이름은 버린다(작게 두고, 영어 이름을 화면에 내지 않으려고).
const KO: [(&str, &str); 35] = [
    ("North Drive", "노스 길"),
    ("Paradise Road", "패러다이스 길"),
    ("South Las Vegas Boulevard", "라스베이거스 대로"),
    ("Las Vegas Boulevard South", "라스베이거스 대로"),
    ("Convention Center Drive", "컨벤션 센터 길"),
    ("East Desert Inn Road", "데저트 인 길"),
    ("West Desert Inn Road", "데저트 인 길"),
    ("Desert Inn Road", "데저트 인 길"),
    ("Sands Avenue", "샌즈 길"),
    ("East Sands Avenue", "샌즈 길"),
    ("Joe W. Brown Drive", "조 브라운 길"),
    ("Sierra Vista Drive", "시에라 비스타 길"),
    ("Elvis Presley Boulevard", "엘비스 프레슬리 길"),
    ("Spring Mountain Road", "스프링 마운틴 길"),
    ("Koval Lane", "코벌 길"),
    ("Fashion Show Drive", "패션 쇼 길"),
    ("Riviera Boulevard", "리비에라 길"),
    ("Las Vegas Convention Center", "LVCC 본관"),
    ("Las Vegas Convention Center West Hall Expansion", "LVCC 웨스트 홀"),
    ("Venetian Expo", "베네시안 엑스포"),
    ("Palazzo Tower", "팔라초 타워"),
    ("Venetian Tower", "베네시안 타워"),
    ("Venezia Tower", "베네치아 타워"),
    ("Wynn Las Vegas", "윈"),
    ("Encore Las Vegas", "앙코르"),
    ("Encore", "앙코르"),
    ("Sphere", "스피어"),
    ("Fontainebleau Resort & Casino", "퐁텐블로"),
    ("Westgate Las Vegas Resort & Casino", "웨스트게이트"),
    ("Resorts World Las Vegas", "리조트 월드"),
    ("Fashion Show Mall", "패션 쇼 몰"),
    ("Convention Center", "모노레일 컨벤션 센터역"),
    ("Westgate", "모노레일 웨스트게이트역"),
    ("Central Station", "루프 센트럴역"),
    ("LVCC West Station", "루프 웨스트 홀역"),
];

fn ko_name(tags: &Value, kind: &str) -> Option<&'static str> {
    let name = tags["name"].as_str()?;
    // 정거장 이름("Westgate")이 호텔 건물 이름과 겹치지 않게 정거장만 역 이름을 쓴다.
    let station = kind == "station";
    KO.iter().find(|(en, ko)| *en == name && (station == ko.ends_with('역'))).map(|(_, ko)| *ko)
}

fn pts_of(geom: &Value, g: &GeoRef) -> Vec<(f64, f64)> {
    geom.as_array().into_iter().flatten().filter_map(|p| Some(g.xz(p["lat"].as_f64()?, p["lon"].as_f64()?))).collect()
}

/// 다각형 넓이(제곱미터, 부호 없음).
pub fn area(ring: &[(f64, f64)]) -> f64 {
    let n = ring.len();
    (0..n).map(|i| { let (a, b) = (ring[i], ring[(i + 1) % n]); a.0 * b.1 - b.0 * a.1 }).sum::<f64>().abs() / 2.0
}

fn seg_dist(p: (f64, f64), a: (f64, f64), b: (f64, f64)) -> f64 {
    let (dx, dz) = (b.0 - a.0, b.1 - a.1);
    let len = dx * dx + dz * dz;
    let t = if len == 0.0 { 0.0 } else { (((p.0 - a.0) * dx + (p.1 - a.1) * dz) / len).clamp(0.0, 1.0) };
    ((p.0 - a.0 - t * dx).powi(2) + (p.1 - a.1 - t * dz).powi(2)).sqrt()
}

/// 점을 줄인다(더글러스-포이커). 끝점은 남긴다.
pub fn simplify(pts: &[(f64, f64)], tol: f64) -> Vec<(f64, f64)> {
    if pts.len() < 3 {
        return pts.to_vec();
    }
    let mut keep = vec![false; pts.len()];
    keep[0] = true;
    keep[pts.len() - 1] = true;
    let mut stack = vec![(0usize, pts.len() - 1)];
    while let Some((i, j)) = stack.pop() {
        let (mut best, mut at) = (0.0, 0);
        for k in i + 1..j {
            let d = seg_dist(pts[k], pts[i], pts[j]);
            if d > best {
                best = d;
                at = k;
            }
        }
        if best > tol {
            keep[at] = true;
            stack.push((i, at));
            stack.push((at, j));
        }
    }
    pts.iter().zip(keep).filter(|(_, k)| *k).map(|(p, _)| *p).collect()
}

/// 닫힌 테두리를 줄인다: 맨 끝의 겹친 점을 빼고, 가장 먼 두 점으로 나눠 줄인다.
fn simplify_ring(ring: &[(f64, f64)], tol: f64) -> Vec<(f64, f64)> {
    let mut r = ring.to_vec();
    if r.len() > 1 && r[0] == r[r.len() - 1] {
        r.pop();
    }
    if r.len() < 4 {
        return r;
    }
    let far = (1..r.len()).max_by(|&a, &b| dist(r[0], r[a]).total_cmp(&dist(r[0], r[b]))).unwrap_or(1);
    let mut first = simplify(&r[..=far], tol);
    let mut back: Vec<(f64, f64)> = r[far..].to_vec();
    back.push(r[0]);
    let second = simplify(&back, tol);
    first.pop();
    first.extend(second);
    first.pop();
    first
}

fn dist(a: (f64, f64), b: (f64, f64)) -> f64 {
    ((a.0 - b.0).powi(2) + (a.1 - b.1).powi(2)).sqrt()
}

/// 나눠진 바깥 테두리 조각(관계의 outer)을 끝점끼리 이어 닫힌 테두리로 만든다.
fn join_rings(mut parts: Vec<Vec<(f64, f64)>>) -> Vec<Vec<(f64, f64)>> {
    let mut rings = Vec::new();
    let close = |a: (f64, f64), b: (f64, f64)| dist(a, b) < 0.05;
    while let Some(mut cur) = parts.pop() {
        loop {
            if cur.len() > 2 && close(cur[0], cur[cur.len() - 1]) {
                break;
            }
            let end = cur[cur.len() - 1];
            let Some(i) = parts.iter().position(|p| close(p[0], end) || close(p[p.len() - 1], end)) else { break };
            let mut next = parts.remove(i);
            if !close(next[0], end) {
                next.reverse();
            }
            cur.extend(next.into_iter().skip(1));
        }
        if cur.len() > 3 {
            rings.push(cur);
        }
    }
    rings
}

/// 높이 글("99 m", "145")을 미터 수로.
fn meters_of(v: &Value) -> Option<f64> {
    let s = v.as_str()?.trim();
    let num: String = s.chars().take_while(|c| c.is_ascii_digit() || *c == '.').collect();
    num.parse::<f64>().ok().filter(|h| *h > 0.0)
}

fn flat(pts: &[(f64, f64)]) -> Value {
    Value::from(pts.iter().flat_map(|p| [p.0.round() as i64, p.1.round() as i64]).collect::<Vec<_>>())
}

/// 건물로 남기는 가장 작은 넓이(제곱미터). 작은 집 · 창고는 지도에서 뜻이 없어 뺀다.
pub const MIN_BUILDING_M2: f64 = 400.0;
/// 출입구는 큰 건물(홀 · 호텔) 가까이 있는 것만 남긴다.
const BIG_M2: f64 = 15_000.0;

/// 받은 답들을 작은 지도 파일 한 장으로 줄인다.
pub fn shrink(answers: &[String], g: &GeoRef, fetched_at: &str) -> Result<Value, String> {
    let mut seen = BTreeSet::new();
    let mut base = String::new();
    let mut elements = Vec::new();
    for text in answers {
        let v: Value = serde_json::from_str(text).map_err(|e| format!("오픈스트리트맵 답이 JSON이 아니다: {e}"))?;
        if let Some(b) = v["osm3s"]["timestamp_osm_base"].as_str() {
            base = b.to_string();
        }
        for e in v["elements"].as_array().into_iter().flatten() {
            let key = (e["type"].as_str().unwrap_or("").to_string(), e["id"].as_i64().unwrap_or(0));
            if seen.insert(key) {
                elements.push(e.clone());
            }
        }
    }
    let mut buildings: Vec<(i64, Option<&str>, Option<f64>, Option<i64>, Vec<(f64, f64)>)> = Vec::new();
    let mut areas = Vec::new();
    let mut roads = Vec::new();
    let mut rail = Vec::new();
    let mut stations: Vec<(&str, (f64, f64))> = Vec::new();
    let mut doors = Vec::new();
    for e in &elements {
        let t = &e["tags"];
        let id = e["id"].as_i64().unwrap_or(0);
        let kind = e["type"].as_str().unwrap_or("");
        // 정거장: 건물이기도 해서(모노레일역) 건물과 따로 본다. 루프(지하) 역은 들어가는 곳 점으로 있다.
        let is_station = t["railway"] == "station" || t["public_transport"] == "station" || t["railway"] == "subway_entrance";
        if let Some(name) = ko_name(t, "station").filter(|_| is_station) {
            let p: Vec<(f64, f64)> = match kind {
                "node" => vec![g.xz(e["lat"].as_f64().unwrap_or(0.0), e["lon"].as_f64().unwrap_or(0.0))],
                "way" => pts_of(&e["geometry"], g),
                _ => e["members"].as_array().into_iter().flatten().flat_map(|m| pts_of(&m["geometry"], g)).collect(),
            };
            if !p.is_empty() {
                let at = (p.iter().map(|q| q.0).sum::<f64>() / p.len() as f64, p.iter().map(|q| q.1).sum::<f64>() / p.len() as f64);
                if !stations.iter().any(|(n, q)| *n == name && dist(*q, at) < 150.0) {
                    stations.push((name, at));
                }
            }
        }
        if t["building"].is_string() && kind != "node" {
            let rings = if kind == "relation" {
                let parts: Vec<_> = e["members"].as_array().into_iter().flatten().filter(|m| m["role"] == "outer").map(|m| pts_of(&m["geometry"], g)).filter(|p| p.len() > 1).collect();
                join_rings(parts)
            } else {
                vec![pts_of(&e["geometry"], g)]
            };
            let h = meters_of(&t["height"]);
            let lv = t["building:levels"].as_str().and_then(|s| s.trim().parse::<i64>().ok());
            for ring in rings {
                if ring.len() < 4 || area(&ring) < MIN_BUILDING_M2 {
                    continue;
                }
                buildings.push((id, ko_name(t, "building"), h, lv, simplify_ring(&ring, 1.5)));
            }
        } else if t["indoor"] == "area" && kind == "way" {
            let ring = pts_of(&e["geometry"], g);
            if ring.len() > 3 && area(&ring) >= 5_000.0 {
                areas.push(json!([id, t["name"].as_str().unwrap_or(""), flat(&simplify_ring(&ring, 1.5))]));
            }
        } else if let Some(hw) = t["highway"].as_str().filter(|_| kind == "way") {
            let rank = match hw {
                "motorway" | "trunk" | "primary" => 1,
                "secondary" => 2,
                "tertiary" => 3,
                "pedestrian" => 5,
                _ => 4,
            };
            let pts = simplify(&pts_of(&e["geometry"], g), 2.0);
            if pts.len() > 1 {
                roads.push(json!([rank, ko_name(t, "road"), flat(&pts)]));
            }
        } else if t["railway"] == "monorail" && kind == "way" {
            let pts = simplify(&pts_of(&e["geometry"], g), 1.5);
            if pts.len() > 1 {
                rail.push(flat(&pts));
            }
        } else if t["entrance"].is_string() && kind == "node" {
            doors.push(g.xz(e["lat"].as_f64().unwrap_or(0.0), e["lon"].as_f64().unwrap_or(0.0)));
        }
    }
    buildings.sort_by_key(|b| b.0);
    let big: Vec<&Vec<(f64, f64)>> = buildings.iter().filter(|b| area(&b.4) >= BIG_M2).map(|b| &b.4).collect();
    let near_big = |p: (f64, f64)| big.iter().any(|r| (0..r.len()).any(|i| seg_dist(p, r[i], r[(i + 1) % r.len()]) < 12.0));
    let mut entrances: Vec<(f64, f64)> = doors.into_iter().filter(|p| near_big(*p)).collect();
    entrances.sort_by(|a, b| a.0.total_cmp(&b.0).then(a.1.total_cmp(&b.1)));
    entrances.dedup_by(|a, b| dist(*a, *b) < 3.0);
    let named = buildings.iter().filter(|b| b.1.is_some()).count();
    let with_h = buildings.iter().filter(|b| b.2.is_some() || b.3.is_some()).count();
    Ok(json!({
        "v": 1,
        "about": "LVCC · 베네시안 엑스포 둘레의 건물 윤곽 · 높이 · 길 · 모노레일 · 정거장 · 출입구. 오픈스트리트맵에서 받아 ces-data osm이 줄였다. 좌표는 미터(x 동쪽 · z 남쪽, data/places.json의 geoRef). 다시 받는 법은 data/출처.md.",
        "license": "ODbL 1.0 (Open Database License). 이 파일도 ODbL로 둔다.",
        "credit": "© OpenStreetMap 기여자",
        "copyright": "https://www.openstreetmap.org/copyright",
        "fetchedAt": fetched_at,
        "osmBase": base,
        "geoRef": { "lat": g.lat, "lng": g.lng, "mx": g.mx, "mz": g.mz },
        "areas_box": AREAS.iter().map(|a| json!({ "k": a.k, "ko": a.ko, "s": a.s, "w": a.w, "n": a.n, "e": a.e })).collect::<Vec<_>>(),
        "counts": { "buildings": buildings.len(), "named": named, "withHeight": with_h, "roads": roads.len(), "rail": rail.len(), "stations": stations.len(), "entrances": entrances.len() },
        "keys": { "buildings": "[OSM id, 우리 말 이름, 높이 m, 층 수, [x, z, x, z, ...]]", "roads": "[등급 1 큰길 ~ 4 작은 길 · 5 걷는 길, 우리 말 이름, [x, z, ...]]", "rail": "모노레일 선 [x, z, ...]", "stations": "[이름, x, z]", "entrances": "출입구 [x, z]", "areas": "큰 실내 영역 [OSM id, 이름, [x, z, ...]]" },
        "buildings": buildings.iter().map(|b| json!([b.0, b.1, b.2.map(|h| (h * 10.0).round() / 10.0), b.3, flat(&b.4)])).collect::<Vec<_>>(),
        "areas": areas,
        "roads": roads,
        "rail": rail,
        "stations": stations.iter().map(|(n, p)| json!([n, p.0.round() as i64, p.1.round() as i64])).collect::<Vec<_>>(),
        "entrances": entrances.iter().map(|p| json!([p.0.round() as i64, p.1.round() as i64])).collect::<Vec<_>>(),
    }))
}

/// 손질한 파일을 한 줄짜리 묶음(요소마다 한 줄)으로 쓴다: 작게 두면서 git에서 바뀐 줄을 볼 수 있게.
pub fn to_text(v: &Value) -> String {
    let mut out = String::from("{\n");
    let obj = v.as_object().cloned().unwrap_or_default();
    let n = obj.len();
    for (i, (k, val)) in obj.iter().enumerate() {
        let comma = if i + 1 < n { "," } else { "" };
        match val.as_array().filter(|a| !a.is_empty() && a.iter().all(Value::is_array)) {
            Some(list) => {
                out.push_str(&format!("{}: [\n", Value::from(k.as_str())));
                for (j, item) in list.iter().enumerate() {
                    out.push_str(&format!("  {}{}\n", item, if j + 1 < list.len() { "," } else { "" }));
                }
                out.push_str(&format!("]{comma}\n"));
            }
            None => out.push_str(&format!("{}: {}{comma}\n", Value::from(k.as_str()), val)),
        }
    }
    out.push_str("}\n");
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    const G: GeoRef = GeoRef { lat: 36.13, lng: -115.16, mx: 89911.0, mz: 110950.0 };

    #[test]
    fn 위도_경도를_미터로() {
        let (x, z) = G.xz(36.129, -115.159);
        assert!((x - 89.911).abs() < 0.01 && (z - 110.95).abs() < 0.01);
    }

    #[test]
    fn 곧은_줄의_가운데_점은_뺀다() {
        let s = simplify(&[(0.0, 0.0), (5.0, 0.2), (10.0, 0.0), (10.0, 10.0)], 1.0);
        assert_eq!(s, vec![(0.0, 0.0), (10.0, 0.0), (10.0, 10.0)]);
    }

    #[test]
    fn 받은_답을_줄인다() {
        // 지어낸 작은 답: 큰 건물 하나 · 작은 건물 하나(빠진다) · 이름 있는 큰길 · 모노레일 · 정거장 · 출입구.
        let sq = |lat: f64, lng: f64, d: f64| json!([{ "lat": lat, "lon": lng }, { "lat": lat, "lon": lng + d }, { "lat": lat - d, "lon": lng + d }, { "lat": lat - d, "lon": lng }, { "lat": lat, "lon": lng }]);
        let answer = json!({ "osm3s": { "timestamp_osm_base": "2026-11-26T00:00:00Z" }, "elements": [
            { "type": "way", "id": 2, "tags": { "building": "yes", "name": "Venetian Expo", "height": "30 m" }, "geometry": sq(36.12, -115.165, 0.002) },
            { "type": "way", "id": 3, "tags": { "building": "house" }, "geometry": sq(36.12, -115.16, 0.0001) },
            { "type": "way", "id": 4, "tags": { "highway": "primary", "name": "Sands Avenue" }, "geometry": [{ "lat": 36.123, "lon": -115.17 }, { "lat": 36.123, "lon": -115.16 }] },
            { "type": "way", "id": 5, "tags": { "railway": "monorail" }, "geometry": [{ "lat": 36.124, "lon": -115.17 }, { "lat": 36.124, "lon": -115.16 }] },
            { "type": "node", "id": 6, "lat": 36.124, "lon": -115.165, "tags": { "railway": "station", "name": "Westgate" } },
            { "type": "node", "id": 7, "lat": 36.12, "lon": -115.164, "tags": { "entrance": "main" } },
            { "type": "node", "id": 8, "lat": 36.10, "lon": -115.10, "tags": { "entrance": "yes" } }
        ]});
        let text = answer.to_string();
        let v = shrink(&[text.clone(), text], &G, "2026-11-26T01:02:03Z").unwrap();
        assert_eq!(v["counts"]["buildings"], 1);
        assert_eq!(v["buildings"][0][1], "베네시안 엑스포");
        assert_eq!(v["buildings"][0][2], 30.0);
        assert_eq!(v["roads"][0][1], "샌즈 길");
        assert_eq!(v["stations"][0][0], "모노레일 웨스트게이트역");
        assert_eq!(v["entrances"].as_array().unwrap().len(), 1, "큰 건물 가까이 있는 출입구만 남는다");
        assert_eq!(v["osmBase"], "2026-11-26T00:00:00Z");
        assert_eq!(v["credit"], "© OpenStreetMap 기여자");
        let back: Value = serde_json::from_str(&to_text(&v)).unwrap();
        assert_eq!(back, v);
    }
}
