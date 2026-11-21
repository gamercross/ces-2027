//! 찾기 색인: 낱말 → 그 낱말이 있는 전시사 줄 번호.
//!
//! 색인 글의 꼴 (UTF-8, 한 줄에 낱말 하나, 낱말은 바이트 차례로 서 있다):
//!
//! ```text
//! CESIDX 1 <줄 수>
//! <낱말>\t<이름에 있는 줄>\t<다른 곳에 있는 줄>
//! ```
//!
//! 줄 번호는 `exhibitors.json`의 `ex` 배열 자리다. 작은 것부터 쉼표로 잇고,
//! 첫 값 뒤로는 앞 값과의 차이를 적는다 (`3,2,10` → 3 · 5 · 15).
//! "다른 곳"은 부스 · 장소 · 분야 · 나라 · 별칭이다.

use crate::text::tokens;
use std::collections::{BTreeMap, BTreeSet};

/// 색인 글의 판 번호. 꼴이 바뀌면 올린다.
pub const FORMAT: u32 = 1;
const MAGIC: &str = "CESIDX";

/// 이름에서 낱말이 통째로 맞음 · 앞머리만 맞음 · 다른 곳에서 통째로 · 앞머리만.
const SCORE_NAME_EXACT: u8 = 4;
const SCORE_NAME_PREFIX: u8 = 3;
const SCORE_OTHER_EXACT: u8 = 2;
const SCORE_OTHER_PREFIX: u8 = 1;

/// 색인을 만든다 (자료 도구가 빌드 때 쓴다).
#[derive(Default)]
pub struct Builder {
    map: BTreeMap<String, (BTreeSet<u32>, BTreeSet<u32>)>,
}

impl Builder {
    pub fn new() -> Self {
        Self::default()
    }

    /// 전시사 이름의 낱말을 넣는다.
    pub fn add_name(&mut self, row: u32, text: &str) {
        for t in tokens(text) {
            self.map.entry(t).or_default().0.insert(row);
        }
    }

    /// 이름이 아닌 것(부스 · 장소 · 분야 · 나라)의 낱말을 넣는다.
    pub fn add_other(&mut self, row: u32, text: &str) {
        for t in tokens(text) {
            self.map.entry(t).or_default().1.insert(row);
        }
    }

    /// 별칭을 넣는다: `phrase`의 낱말이 모두 있는 줄에 `alias`의 낱말을 더한다.
    /// 예: `삼성` → `samsung`. 낱말이 모두 이름에 있으면 이름 쪽에, 아니면 다른 곳 쪽에 더한다.
    /// 더한 줄 수를 돌려준다.
    pub fn add_alias(&mut self, alias: &str, phrase: &str) -> usize {
        let want = tokens(phrase);
        let add = tokens(alias);
        if want.is_empty() || add.is_empty() {
            return 0;
        }
        let mut in_name: Option<BTreeSet<u32>> = None;
        let mut in_any: Option<BTreeSet<u32>> = None;
        for t in &want {
            let (name, other) = match self.map.get(t) {
                Some(e) => (e.0.clone(), e.1.clone()),
                None => (BTreeSet::new(), BTreeSet::new()),
            };
            let any: BTreeSet<u32> = name.union(&other).copied().collect();
            in_name = Some(match in_name {
                Some(s) => s.intersection(&name).copied().collect(),
                None => name,
            });
            in_any = Some(match in_any {
                Some(s) => s.intersection(&any).copied().collect(),
                None => any,
            });
        }
        let in_name = in_name.unwrap_or_default();
        let in_any = in_any.unwrap_or_default();
        for t in add {
            let e = self.map.entry(t).or_default();
            for &r in &in_any {
                if in_name.contains(&r) {
                    e.0.insert(r);
                } else {
                    e.1.insert(r);
                }
            }
        }
        in_any.len()
    }

    /// 낱말 수.
    pub fn len(&self) -> usize {
        self.map.len()
    }

    pub fn is_empty(&self) -> bool {
        self.map.is_empty()
    }

    /// 색인 글을 만든다. `rows`는 전시사 줄 수다.
    pub fn finish(self, rows: u32) -> String {
        let mut out = format!("{MAGIC} {FORMAT} {rows}\n");
        for (tok, (name, other)) in self.map {
            // 이름 쪽에 있는 줄은 다른 곳 쪽에 또 적지 않는다.
            let other: Vec<u32> = other.into_iter().filter(|r| !name.contains(r)).collect();
            let name: Vec<u32> = name.into_iter().collect();
            if name.is_empty() && other.is_empty() {
                continue;
            }
            out.push_str(&tok);
            out.push('\t');
            write_postings(&mut out, &name);
            out.push('\t');
            write_postings(&mut out, &other);
            out.push('\n');
        }
        out
    }
}

fn write_postings(out: &mut String, rows: &[u32]) {
    let mut prev = 0u32;
    for (i, &r) in rows.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        let v = if i == 0 { r } else { r - prev };
        out.push_str(&v.to_string());
        prev = r;
    }
}

/// 읽어 둔 색인 (폰에서 쓴다).
pub struct Index {
    text: String,
    rows: u32,
    entries: Vec<Entry>,
}

/// 한 낱말의 자리: 색인 글 안의 바이트 범위 셋.
struct Entry {
    tok: (u32, u32),
    name: (u32, u32),
    other: (u32, u32),
}

impl Index {
    /// 색인 글을 읽는다. 꼴이 다르면 까닭을 돌려준다.
    pub fn parse(text: String) -> Result<Index, &'static str> {
        if text.len() > u32::MAX as usize {
            return Err("색인이 너무 크다");
        }
        let head_end = text.find('\n').ok_or("색인 머리 줄이 없다")?;
        let mut head = text[..head_end].split(' ');
        if head.next() != Some(MAGIC) {
            return Err("색인 글이 아니다");
        }
        let format: u32 = head.next().and_then(|s| s.parse().ok()).ok_or("색인 판 번호를 못 읽었다")?;
        if format != FORMAT {
            return Err("색인 판 번호가 다르다");
        }
        let rows: u32 = head.next().and_then(|s| s.trim().parse().ok()).ok_or("색인 줄 수를 못 읽었다")?;

        let mut entries = Vec::new();
        let mut at = head_end + 1;
        let mut prev: Option<(u32, u32)> = None;
        while at < text.len() {
            let end = text[at..].find('\n').map(|i| at + i).unwrap_or(text.len());
            let line = &text[at..end];
            if !line.is_empty() {
                let t1 = line.find('\t').ok_or("색인 줄에 칸이 모자라다")?;
                let t2 = line[t1 + 1..].find('\t').map(|i| t1 + 1 + i).ok_or("색인 줄에 칸이 모자라다")?;
                let tok = (at as u32, (at + t1) as u32);
                if let Some(p) = prev {
                    if text.as_bytes()[p.0 as usize..p.1 as usize] >= text.as_bytes()[tok.0 as usize..tok.1 as usize] {
                        return Err("색인 낱말이 차례대로 서 있지 않다");
                    }
                }
                prev = Some(tok);
                entries.push(Entry {
                    tok,
                    name: ((at + t1 + 1) as u32, (at + t2) as u32),
                    other: ((at + t2 + 1) as u32, end as u32),
                });
            }
            at = end + 1;
        }
        let index = Index { text, rows, entries };
        // 줄 번호가 줄 수를 넘는 색인은 받지 않는다 (찾을 때 범위를 다시 보지 않아도 되게).
        for e in &index.entries {
            for range in [e.name, e.other] {
                let mut ok = true;
                index.each_row(range, |r| ok &= r < rows);
                if !ok {
                    return Err("색인의 줄 번호가 줄 수를 넘는다");
                }
            }
        }
        Ok(index)
    }

    /// 전시사 줄 수.
    pub fn rows(&self) -> u32 {
        self.rows
    }

    /// 낱말 수.
    pub fn len(&self) -> usize {
        self.entries.len()
    }

    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    fn slice(&self, r: (u32, u32)) -> &str {
        &self.text[r.0 as usize..r.1 as usize]
    }

    /// 한 칸의 줄 번호를 차례로 넘긴다. 읽지 못한 값은 건너뛴다.
    fn each_row(&self, range: (u32, u32), mut f: impl FnMut(u32)) {
        let s = self.slice(range);
        if s.is_empty() {
            return;
        }
        let mut cur = 0u32;
        for (i, part) in s.split(',').enumerate() {
            let Ok(v) = part.parse::<u32>() else { continue };
            cur = if i == 0 { v } else { cur.saturating_add(v) };
            f(cur);
        }
    }

    /// 찾는다. 줄 번호를 잘 맞는 차례로 `limit`개까지 돌려준다.
    ///
    /// 찾는 말의 낱말이 모두 있어야 한다. 낱말은 앞머리만 맞아도 된다(`sam` → `samsung`).
    /// 이름에서 맞은 것이 먼저, 통째로 맞은 것이 먼저, 같으면 이름 차례다.
    pub fn search(&self, query: &str, limit: usize) -> Vec<u32> {
        let q = tokens(query);
        if q.is_empty() || limit == 0 || self.rows == 0 {
            return Vec::new();
        }
        let n = self.rows as usize;
        let mut total = vec![0u16; n];
        let mut matched = vec![0u16; n];
        let mut best = vec![0u8; n];
        for word in &q {
            best.iter_mut().for_each(|b| *b = 0);
            let start = self.entries.partition_point(|e| self.slice(e.tok) < word.as_str());
            for e in &self.entries[start..] {
                let tok = self.slice(e.tok);
                if !tok.starts_with(word.as_str()) {
                    break;
                }
                let exact = tok.len() == word.len();
                let (sn, so) = if exact { (SCORE_NAME_EXACT, SCORE_OTHER_EXACT) } else { (SCORE_NAME_PREFIX, SCORE_OTHER_PREFIX) };
                self.each_row(e.name, |r| {
                    let b = &mut best[r as usize];
                    *b = (*b).max(sn);
                });
                self.each_row(e.other, |r| {
                    let b = &mut best[r as usize];
                    *b = (*b).max(so);
                });
            }
            for r in 0..n {
                if best[r] > 0 {
                    total[r] += best[r] as u16;
                    matched[r] += 1;
                }
            }
        }
        let need = q.len() as u16;
        let mut hits: Vec<u32> = (0..n as u32).filter(|&r| matched[r as usize] == need).collect();
        hits.sort_by(|&a, &b| total[b as usize].cmp(&total[a as usize]).then(a.cmp(&b)));
        hits.truncate(limit);
        hits
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample() -> Index {
        let mut b = Builder::new();
        // 줄 0 ~ 3. 이름 차례로 서 있다고 본다.
        b.add_name(0, "Hyundai Mobis");
        b.add_other(0, "5131 LVCC 웨스트 홀 Vehicle Tech & Advanced Mobility 모빌리티·자동차 South Korea");
        b.add_name(1, "Samsara Robotics");
        b.add_other(1, "8501 LVCC 노스 홀 Robotics 로봇 United States");
        b.add_name(2, "Samsung Electronics, Inc.");
        b.add_other(2, "Wynn Encore Latour 윈 · 앙코르 South Korea");
        b.add_name(3, "Zeta Home");
        b.add_other(3, "52011 베네시안 엑스포 홀 A-D Smart Home & Appliances 스마트홈·가전 Samsung partner");
        assert_eq!(b.add_alias("삼성", "samsung"), 2);
        assert_eq!(b.add_alias("현대 모비스", "hyundai mobis"), 1);
        Index::parse(b.finish(4)).expect("색인을 읽는다")
    }

    #[test]
    fn 만든_색인을_다시_읽는다() {
        let ix = sample();
        assert_eq!(ix.rows(), 4);
        assert!(ix.len() > 20);
    }

    #[test]
    fn 이름에서_맞은_것이_먼저다() {
        let ix = sample();
        // "samsung"은 2번의 이름, 3번의 다른 곳에 있다.
        assert_eq!(ix.search("samsung", 10), [2, 3]);
        // 앞머리 "sam"은 Samsara(1) · Samsung(2) 이름과 3번의 다른 곳.
        assert_eq!(ix.search("sam", 10), [1, 2, 3]);
        // 통째로 맞은 것이 앞머리만 맞은 것보다 먼저다.
        assert_eq!(ix.search("robotics", 10), [1]);
    }

    #[test]
    fn 낱말이_모두_있어야_한다() {
        let ix = sample();
        assert_eq!(ix.search("samsung electronics", 10), [2]);
        assert_eq!(ix.search("korea 웨스트", 10), [0]);
        assert!(ix.search("samsung mobis", 10).is_empty());
    }

    #[test]
    fn 한글_별칭과_분야로_찾는다() {
        let ix = sample();
        assert_eq!(ix.search("삼성", 10), [2, 3]);
        assert_eq!(ix.search("현대", 10), [0]);
        assert_eq!(ix.search("로봇", 10), [1]);
        assert_eq!(ix.search("5131", 10), [0]);
    }

    #[test]
    fn 빈_말과_개수_제한() {
        let ix = sample();
        assert!(ix.search("", 10).is_empty());
        assert!(ix.search(" · ", 10).is_empty());
        assert_eq!(ix.search("s", 2).len(), 2);
        assert!(ix.search("samsung", 0).is_empty());
    }

    #[test]
    fn 잘못된_색인은_받지_않는다() {
        assert!(Index::parse("".into()).is_err());
        assert!(Index::parse("CESIDX 9 1\n".into()).is_err());
        assert!(Index::parse("NOPE 1 1\n".into()).is_err());
        assert!(Index::parse("CESIDX 1 1\nabc\t0\n".into()).is_err());
        // 줄 번호가 줄 수를 넘는다.
        assert!(Index::parse("CESIDX 1 2\nabc\t0,5\t\n".into()).is_err());
        // 낱말 차례가 어긋났다.
        assert!(Index::parse("CESIDX 1 2\nb\t0\t\na\t1\t\n".into()).is_err());
        assert!(Index::parse("CESIDX 1 0\n".into()).is_ok());
    }

    #[test]
    fn 차이로_적은_줄_번호() {
        let mut b = Builder::new();
        for r in [3u32, 5, 15] {
            b.add_name(r, "alpha");
        }
        b.add_other(5, "alpha beta");
        let text = b.finish(16);
        assert_eq!(text, "CESIDX 1 16\nalpha\t3,2,10\t\nbeta\t\t5\n");
        let ix = Index::parse(text).unwrap();
        assert_eq!(ix.search("alpha", 10), [3, 5, 15]);
    }
}
