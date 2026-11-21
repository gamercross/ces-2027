//! 폰에 보내는 작은 코어.
//!
//! 지금 하는 일은 찾기 하나다: 자료 도구가 빌드 때 만든 찾기 색인을 읽고,
//! 낱말로 전시사 줄 번호를 찾는다. 동선의 걷는 차례와 위치 맞추기는 화면 쪽(web/route.js · web/locate.js)에
//! 있고, 여기로 옮기지 않기로 했다 (2026-11-21).
//!
//! 의존이 없다. 자료 도구(`ces-data`)도 이 크레이트의 낱말 나누기와 색인 꼴을
//! 그대로 써서, 만드는 쪽과 찾는 쪽이 어긋나지 않는다.

pub mod abi;
pub mod index;
pub mod text;

pub use index::{Builder, Index};
pub use text::tokens;
