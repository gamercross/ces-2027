//! 낱말 나누기. 색인을 만들 때와 찾을 때 같은 규칙을 쓴다.

/// 글을 찾기용 낱말로 나눈다.
///
/// 소문자로 바꾸고, 글자 · 숫자가 아닌 것(빈칸 · 쉼표 · `&` · `/` 같은 것)에서 끊는다.
/// 한글도 글자로 본다. 같은 낱말이 여러 번 나와도 한 번만 돌려준다.
pub fn tokens(s: &str) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    let mut cur = String::new();
    for ch in s.chars() {
        if ch.is_alphanumeric() {
            cur.extend(ch.to_lowercase());
        } else if !cur.is_empty() {
            push_unique(&mut out, std::mem::take(&mut cur));
        }
    }
    if !cur.is_empty() {
        push_unique(&mut out, cur);
    }
    out
}

fn push_unique(out: &mut Vec<String>, t: String) {
    if !out.contains(&t) {
        out.push(t);
    }
}

#[cfg(test)]
mod tests {
    use super::tokens;

    #[test]
    fn 소문자로_바꾸고_기호에서_끊는다() {
        assert_eq!(tokens("Samsung Electronics Co., Ltd. (C-Lab)"), ["samsung", "electronics", "co", "ltd", "c", "lab"]);
        assert_eq!(tokens("IoT/Sensors & AI"), ["iot", "sensors", "ai"]);
    }

    #[test]
    fn 한글과_숫자도_낱말이다() {
        assert_eq!(tokens("LVCC 노스 홀 14731"), ["lvcc", "노스", "홀", "14731"]);
    }

    #[test]
    fn 같은_낱말은_한_번만() {
        assert_eq!(tokens("AI ai Ai"), ["ai"]);
        assert!(tokens("  ·  ").is_empty());
    }
}
