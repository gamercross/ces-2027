//! 받은 날짜를 적는 데 쓰는 시각 (바깥 크레이트 없이).

use std::time::{SystemTime, UNIX_EPOCH};

/// 지금 시각을 `2026-11-20T04:05:06Z` 꼴(UTC)로 돌려준다.
pub fn now_iso() -> String {
    let secs = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    iso_from_unix(secs)
}

/// 유닉스 초를 ISO 글로 바꾼다.
pub fn iso_from_unix(secs: u64) -> String {
    let days = (secs / 86_400) as i64;
    let rem = secs % 86_400;
    let (y, m, d) = civil_from_days(days);
    format!("{y:04}-{m:02}-{d:02}T{:02}:{:02}:{:02}Z", rem / 3600, rem % 3600 / 60, rem % 60)
}

/// 1970-01-01부터 센 날 수를 (해, 달, 날)로 바꾼다.
fn civil_from_days(z: i64) -> (i64, u32, u32) {
    let z = z + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    let y = yoe + era * 400 + if m <= 2 { 1 } else { 0 };
    (y, m, d)
}

/// ISO 글이 맞는지 가볍게 본다 (`YYYY-MM-DDThh:mm:ssZ`).
pub fn looks_iso(s: &str) -> bool {
    let b = s.as_bytes();
    b.len() == 20
        && b.iter().enumerate().all(|(i, &c)| match i {
            4 | 7 => c == b'-',
            10 => c == b'T',
            13 | 16 => c == b':',
            19 => c == b'Z',
            _ => c.is_ascii_digit(),
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 유닉스_초를_날짜로() {
        assert_eq!(iso_from_unix(0), "1970-01-01T00:00:00Z");
        assert_eq!(iso_from_unix(951_782_400), "2000-02-29T00:00:00Z");
        assert_eq!(iso_from_unix(1_794_960_000 + 3_723), "2026-11-18T01:02:03Z");
        assert_eq!(iso_from_unix(1_798_761_599), "2026-12-31T23:59:59Z");
    }

    #[test]
    fn 꼴을_본다() {
        assert!(looks_iso(&now_iso()));
        assert!(!looks_iso("2026-11-20"));
        assert!(!looks_iso("2026-11-20 04:05:06Z"));
    }
}
