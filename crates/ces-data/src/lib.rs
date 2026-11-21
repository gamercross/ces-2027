//! 빌드 때 도는 자료 도구.
//!
//! 하는 일: CES 공식 전시사 검색(exhibitors.ces.tech)에서 전시사 · 분야 · 나라를 받아(`fetch`),
//! 부스마다 장소를 붙이고 줄여(`shrink`), 폰의 코어가 읽을 찾기 색인을 만든다.
//! 장소 자료(`data/places.json`)는 여기서 읽고 살핀다(`places`).

pub mod diary;
pub mod fetch;
pub mod links;
pub mod places;
pub mod sessions;
pub mod shrink;
pub mod source;
pub mod time;
