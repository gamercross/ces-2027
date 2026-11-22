// 홀 묶음: [이름, 장소 기호들]. 지도의 "홀 바로 가기" 칩과 전시사 목록의 "위치" 거르기가 같은 묶음 · 같은 차례를 쓴다.
export const HALL_GROUPS = [
  ['웨스트', ['LVCC_W', 'LVCC_W_MTG']],
  ['센트럴', ['LVCC_C', 'LVCC_C_MTG', 'LVCC_CP']],
  ['노스', ['LVCC_N', 'LVCC_N_MTG']],
  ['사우스', ['LVCC_S1', 'LVCC_S2', 'LVCC_S3', 'LVCC_S_MTG']],
  ['베네시안 A-D', ['VEN_AD']],
  ['베네시안 G', ['VEN_G']],
  ['아리아', ['ARIA']],
  ['윈', ['WYNN']],
  ['퐁텐블로', ['FONT']],
  ['웨스트게이트', ['WESTGATE']],
];

// 장소 이름을 줄에 맞게 줄인다: "LVCC 노스 홀" → "노스 홀", 괄호 설명은 뺀다.
export const shortName = (ko) => ko.replace('LVCC ', '').replace('베네시안 엑스포 ', '').replace(/ \(.*\)$/, '');
