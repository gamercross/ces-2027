// 글로벌 어학연수 · CES 2027 준비 지도 — 보드 (세션마다 코드에 맞춰 고친다)
// 코드에 있는 것은 done, 일부만 된 것은 part, 아직 없는 것은 todo. 정할 것은 이름에 [제안].
// 근거: 요구사항.md · ROADMAP.md · 작업.md와 코드(crates · web · data · .github/workflows).
window.BOARD = {
  format: 1,
  title: '글로벌 어학연수 · CES 2027 준비 지도',
  sub: '우리 팀이 CES에서 정보와 위치를 헷갈리지 않게 · 만드는 중 · 세션 1 ~ 6 + 깊게 3 + 주제 판',
  start: 'v_big',
  frames: [
    {id: 'v_big', kicker: '처음 보는 사람에게', title: '준비 지도는 이렇게 돈다', layout: 'view', w: 1700, cols: 4, weight: 5,
     rows: {3: '쓰는 차례'},
     sub: '이게 뭐고, 누구를 돕나',
     desc: '위에서 아래로 읽는다: 누가 쓰나 → 받는 도움 → 쓰는 차례 → 앱이 하는 일 → 앱 → 남는 것 → 바탕. 실선은 코드에 있는 것, 점선은 아직이다.'},
    {id: 'v_flow', kicker: '처음 보는 사람에게', title: '한 번 쓰는 길', layout: 'view', w: 1700, cols: 4, weight: 4,
     sub: '어떤 차례로 쓰나',
     desc: '연수에 가기로 한 날부터: 온라인 명함(깃허브 · 디스코드 QR)을 만들고, 분야와 회사를 고르고, 동선을 짜고, 현장에서 내 위치와 다음 곳을 보고, 회사마다 일기를 쓴다.'},
    {id: 'v_data', kicker: '처음 보는 사람에게', title: '내 것은 어디로 가나', layout: 'view', w: 1400, cols: 3, weight: 3,
     sub: '폰에 남는 것과 모이는 것',
     desc: '명함 · 관심 · 동선 · 일기는 내 폰에만 남는다. 명함 QR은 보여 줄 때만 상대가 읽는다. 보내기를 누를 때만 한곳에 모여 네 태그(학생 · 취준생 · 정년 · 장년)로 정리된다.'},
    {id: 'plan', kicker: '만드는 사람에게', title: '만드는 순서', layout: 'time', w: 2400, weight: 4, button: '만드는 순서',
     sub: '이정표 다섯 · 이슈 차례는 ROADMAP.md',
     desc: '프리 프로토타입(기능)을 12/6에 닫고, 12/16까지 팀이 써 보는 프로토타입, 12/31 공개 판, 1/6 ~ 1/9 현장, 그 뒤 정리하고 비공개로 돌린다.'},
    {id: 'data', kicker: '만드는 사람에게', title: '데이터 지도 (계획)', layout: 'datamap', w: 1500, weight: 3,
     sub: '무엇이 어디에 놓이고 언제 사라지나',
     desc: '코드 전 계획이다. 저장 방식은 만들면서 정하고 이 지도를 고친다.'}
  ],
  elements: [
    // ── 한 장 그림 ──
    {f: 'v_big', id: 'v_team', t: 'bactor', n: '연수에 가는 우리 팀', sub: '학생 · 취준생 · 정년 · 장년', s: 'todo', col: 0.5, span: 2},
    {f: 'v_big', id: 'v_lead', t: 'bactor', n: '정리하는 사람', sub: '모인 일기를 네 태그로', s: 'todo', col: 2.5},
    {f: 'v_big', id: 'v_s_info', t: 'bservice', n: 'CES 2027 알아둘 것', sub: '날짜 · 홀 · 오가는 법', s: 'done', col: 0},
    {f: 'v_big', id: 'v_s_route', t: 'bservice', n: '관심 회사 동선', sub: '날짜 · 캠퍼스 · 걷는 차례', s: 'done', col: 1},
    {f: 'v_big', id: 'v_s_where', t: 'bservice', n: '내 위치와 다음 갈 곳', sub: '2D · 3D · 크게 보기', s: 'part', col: 2},
    {f: 'v_big', id: 'v_s_know', t: 'bservice', n: '올해의 IT 정보', sub: '네 태그로 정리한 한 장', s: 'todo', col: 3},
    {f: 'v_big', id: 'v_start', t: 'bevent', n: '연수에 가기로 함', s: 'todo', col: 0},
    {f: 'v_big', id: 'v_steps', t: 'bprocess', n: '준비하고 다녀오기', col: 1, span: 3, kids: ['v_p1', 'v_p2', 'v_p3', 'v_p4', 'v_p5'], s: 'part'},
    {f: 'v_big', id: 'v_p1', t: 'bprocess', n: '명함을 만든다', sub: '깃허브 · 디스코드 QR', s: 'done'},
    {f: 'v_big', id: 'v_p2', t: 'bprocess', n: '분야를 고른다', s: 'done'},
    {f: 'v_big', id: 'v_p3', t: 'bprocess', n: '관심을 등록한다', s: 'done'},
    {f: 'v_big', id: 'v_p4', t: 'bprocess', n: '동선을 짠다', s: 'done'},
    {f: 'v_big', id: 'v_p5', t: 'bprocess', n: '일기를 쓴다', sub: '현장에서', s: 'done'},
    {f: 'v_big', id: 'v_a_find', t: 'aservice', n: '분야로 회사 찾기', sub: '태그에 맞는 분야 먼저', s: 'done', col: 0},
    {f: 'v_big', id: 'v_a_route', t: 'aservice', n: '동선 짜기', s: 'done', col: 1},
    {f: 'v_big', id: 'v_a_locate', t: 'aservice', n: '내 위치 맞추기', sub: 'GPS는 캠퍼스와 홀 근처(짐작) · 홀 안은 부스 번호 · 따라가기', s: 'part', col: 2},
    {f: 'v_big', id: 'v_a_collect', t: 'aservice', n: '일기 모으기', sub: '네 태그로', s: 'part', col: 3},
    {f: 'v_big', id: 'v_app', t: 'acomp', n: '폰 앱 (웹)', sub: '오프라인으로도', s: 'part', col: 0, span: 2, see: 'data'},
    {f: 'v_big', id: 'v_build', t: 'acomp', n: '자료 짓는 도구', sub: 'Rust · Actions에서 돈다', s: 'done', col: 2},
    {f: 'v_big', id: 'v_hub', t: 'acomp', n: '[제안] 모으는 곳', sub: '구글 시트 한 장', s: 'cand', col: 3},
    {f: 'v_big', id: 'v_d_me', t: 'dobject', n: '나 · 관심 · 동선', sub: '내 폰에', s: 'part', col: 0},
    {f: 'v_big', id: 'v_d_diary', t: 'dobject', n: '회사 일기', sub: '내 폰에', s: 'done', col: 1},
    {f: 'v_big', id: 'v_d_ces', t: 'dobject', n: 'CES 전시사 자료', sub: '공식 검색에서 · 받은 날짜', s: 'done', col: 2},
    {f: 'v_big', id: 'v_d_four', t: 'dobject', n: '네 태그 정리 한 장', sub: '모인 뒤', s: 'part', col: 3},
    {f: 'v_big', id: 'v_t_pages', t: 'tservice', n: '웹 주소와 오프라인 저장', sub: 'GitHub Pages · 서비스 워커', s: 'part', col: 0.5, span: 2},
    {f: 'v_big', id: 'v_t_maps', t: 'tservice', n: '구글맵 길찾기', sub: '키 없는 링크', s: 'done', col: 2.5, span: 1.5},

    // ── 한 번 쓰는 길 ──
    {f: 'v_flow', id: 'f_start', t: 'bevent', n: '연수에 가기로 함', s: 'todo', col: 0},
    {f: 'v_flow', id: 'f_box', t: 'bprocess', n: '준비하고 다녀오기', col: 1, span: 3, kids: ['f_1', 'f_2', 'f_3', 'f_4', 'f_5', 'f_6'], s: 'part'},
    {f: 'v_flow', id: 'f_1', t: 'bprocess', n: '온라인 명함 만들기', sub: '태그 · 한 줄 · QR 둘', s: 'done'},
    {f: 'v_flow', id: 'f_2', t: 'bprocess', n: '주제 · 분야 고르기', sub: '주제 판(10개까지) · 나뉜 분야', s: 'done'},
    {f: 'v_flow', id: 'f_3', t: 'bprocess', n: '회사 보고 관심 등록', s: 'done'},
    {f: 'v_flow', id: 'f_4', t: 'bprocess', n: '동선 짜기', sub: '날짜 · 캠퍼스', s: 'done'},
    {f: 'v_flow', id: 'f_5', t: 'bprocess', n: '현장: 내 위치 · 다음 곳', s: 'part'},
    {f: 'v_flow', id: 'f_6', t: 'bprocess', n: '회사 일기 · 보내기', s: 'part'},
    {f: 'v_flow', id: 'f_a1', t: 'aservice', n: '분야로 회사 찾기', s: 'done', col: 1},
    {f: 'v_flow', id: 'f_a2', t: 'aservice', n: '동선 짜기', s: 'done', col: 2},
    {f: 'v_flow', id: 'f_a3', t: 'aservice', n: '위치 맞추기 · 길찾기', s: 'part', col: 3},

    // ── 내 것은 어디로 ──
    {f: 'v_data', id: 'd_me', t: 'bactor', n: '나', s: 'todo', col: 0},
    {f: 'v_data', id: 'd_lead', t: 'bactor', n: '정리하는 사람', s: 'todo', col: 2},
    {f: 'v_data', id: 'd_send', t: 'bevent', n: '보내기를 누름', s: 'part', col: 1},
    {f: 'v_data', id: 'd_app', t: 'acomp', n: '내 폰의 앱', s: 'part', col: 0},
    {f: 'v_data', id: 'd_hub', t: 'acomp', n: '[제안] 모으는 곳', sub: '구글 시트 한 장', s: 'cand', col: 1.5},
    {f: 'v_data', id: 'd_local', t: 'dobject', n: '명함 · 관심 · 동선 · 일기', sub: '내 폰에만', s: 'part', col: 0},
    {f: 'v_data', id: 'd_pool', t: 'dobject', n: '모인 일기', sub: '보낸 것만', s: 'todo', col: 1},
    {f: 'v_data', id: 'd_four', t: 'dobject', n: '네 태그 정리 한 장', sub: '학생 · 취준생 · 정년 · 장년', s: 'part', col: 2},

    // ── 만드는 순서 (time): 칸마다 단계 하나, 그 아래 작업 묶음 ──
    {f: 'plan', id: 'pl_now', t: 'plateau', n: '지금 · 11/20', d: '3D 미리 보기 판과 자료 스크립트 (reference/미리보기판)', s: 'done', col: 0},
    {f: 'plan', id: 'pl_m1', t: 'plateau', n: '프리 프로토타입', d: '기능을 만드는 단계. 12/6에 닫는다', s: 'part', col: 1},
    {f: 'plan', id: 'pl_m2', t: 'plateau', n: '프로토타입', d: '팀이 실제로 써 보는 단계. 12/16까지', s: 'part', col: 2},
    {f: 'plan', id: 'pl_m3', t: 'plateau', n: '공개 판', d: '정식 배치도와 다듬기. 12/31까지', s: 'todo', col: 3},
    {f: 'plan', id: 'pl_m4', t: 'plateau', n: '현장', d: 'CES 1/6 ~ 1/9', s: 'todo', col: 4},
    {f: 'plan', id: 'pl_m5', t: 'plateau', n: '정리 · 비공개', d: '1/15부터. 비공개 날짜는 정할 것', s: 'todo', col: 5},
    {f: 'plan', id: 'wp_preview', t: 'wp', n: '3D 미리 보기 판', s: 'done', col: 0, when: '11/19', who: 'Aside'},
    {f: 'plan', id: 'wp_data', t: 'wp', n: '전시사 자료 받기', s: 'done', col: 0, when: '11/19', who: 'Aside'},
    {f: 'plan', id: 'wp_rust', t: 'wp', n: 'Rust 자료 도구', s: 'done', col: 1, when: '11/20', who: 'Orca'},
    {f: 'plan', id: 'wp_places', t: 'wp', n: '장소 자료 · 구글맵 이름', s: 'done', col: 1, when: '11/20', who: 'Orca'},
    {f: 'plan', id: 'wp_home', t: 'wp', n: '첫 화면 · 알아둘 것', s: 'part', col: 1, when: '11/20 (아이콘은 정할 것)', who: 'Orca'},
    {f: 'plan', id: 'wp_onboard', t: 'wp', n: '명함 · 분야 · 관심', s: 'done', col: 1, when: '11/20', who: 'Orca'},
    {f: 'plan', id: 'wp_topics', t: 'wp', n: '주제 판 (출발 전 판)', s: 'done', col: 1, when: '11/21', who: 'Orca'},
    {f: 'plan', id: 'wp_route', t: 'wp', n: '동선 · 2D · 3D', s: 'part', col: 1, when: '11/20 (3D는 단순한 모양)', who: 'Orca'},
    {f: 'plan', id: 'wp_offline', t: 'wp', n: '오프라인 · 배포', s: 'part', col: 1, when: '11/20 (Pages 켜기 남음)', who: 'Orca'},
    {f: 'plan', id: 'wp_locate', t: 'wp', n: '내 위치 · 다음 곳', s: 'part', col: 2, when: '11/21 (GPS는 캠퍼스까지)', who: 'Orca'},
    {f: 'plan', id: 'wp_maps', t: 'wp', n: '구글맵 길찾기', s: 'done', col: 2, when: '11/21', who: 'Orca'},
    {f: 'plan', id: 'wp_diary', t: 'wp', n: '회사 일기 · 보내기', s: 'part', col: 2, when: '11/21 (모으는 곳은 정할 것)', who: 'Orca'},
    {f: 'plan', id: 'wp_test', t: 'wp', n: '팀 3 ~ 5명이 써 봄', s: 'todo', col: 2, when: '12/14 ~ 12/16', who: '나'},
    {f: 'plan', id: 'wp_floor', t: 'wp', n: '[제안] 정식 배치도', s: 'cand', col: 3, when: '열리면', who: 'Orca'},
    {f: 'plan', id: 'wp_public', t: 'wp', n: '공개 판 · 단톡방 안내', s: 'todo', col: 3, when: '~12/31', who: '나 · Aside'},
    {f: 'plan', id: 'wp_field', t: 'wp', n: '매일 일기 · 보내기', s: 'todo', col: 4, when: '1/6 ~ 1/9', who: '우리 팀'},
    {f: 'plan', id: 'wp_four', t: 'wp', n: '네 태그 정리 한 장', s: 'part', col: 5, when: '1/15 ~', who: '나'},
    {f: 'plan', id: 'wp_private', t: 'wp', n: '비공개 · 페이지 내리기', s: 'todo', col: 5, when: '정할 것', who: '나 · Aside'}
  ],
  relations: [
    ['v_s_info', 'v_team', 'serving'], ['v_s_route', 'v_team', 'serving'], ['v_s_where', 'v_team', 'serving'], ['v_s_know', 'v_lead', 'serving'],
    ['v_start', 'v_steps', 'triggering'],
    ['v_steps', 'v_s_route', 'realization'], ['v_steps', 'v_s_where', 'realization'], ['v_p5', 'v_s_know', 'realization'],
    ['v_a_find', 'v_p2', 'serving'], ['v_a_route', 'v_p4', 'serving'], ['v_a_locate', 'v_p5', 'serving'],
    ['v_app', 'v_d_me', 'access'], ['v_app', 'v_d_diary', 'access'], ['v_build', 'v_d_ces', 'access'], ['v_hub', 'v_d_four', 'access'],
    ['f_start', 'f_box', 'triggering'],
    ['f_a1', 'f_2', 'serving'], ['f_a2', 'f_4', 'serving'], ['f_a3', 'f_5', 'serving'],
    ['d_app', 'd_local', 'access'], ['d_send', 'd_hub', 'triggering'], ['d_hub', 'd_pool', 'access'], ['d_lead', 'd_four', 'access'],
    ['pl_now', 'pl_m1', 'triggering'], ['pl_m1', 'pl_m2', 'triggering'], ['pl_m2', 'pl_m3', 'triggering'], ['pl_m3', 'pl_m4', 'triggering'], ['pl_m4', 'pl_m5', 'triggering']
  ],
  flows: [['v_big', 'v_flow', '한 번 쓰는 길로'], ['v_flow', 'v_data', '남는 것은'], ['v_big', 'plan', '만드는 순서']],
  tour: [
    {t: '이게 뭐고 누구를 돕나', f: ['v_big'], ids: ['v_team', 'v_s_info', 'v_s_route', 'v_s_where', 'v_s_know'], p: '연수에 가는 우리 팀이 CES에서 정보와 위치를 헷갈리지 않게 돕는다. 다녀와서는 올해의 IT 정보를 네 태그로 나눈다.'},
    {t: '어떤 차례로 쓰나', f: ['v_flow'], ids: ['f_box'], p: '온라인 명함을 만들고(깃허브 · 디스코드 QR), 분야를 고르고, 관심 회사를 등록하면 동선이 나온다. 현장에서는 내 위치와 다음 곳을 보고 일기를 쓴다.'},
    {t: '내 것은 어디로 가나', f: ['v_data'], ids: ['d_local', 'd_send', 'd_four'], p: '내 것은 폰에만 남는다. 보내기를 누를 때만 모여서 네 태그 정리 한 장이 된다.'}
  ],
  lanes: {me: ['나', 'v_team'], app: ['폰 앱', 'v_app'], hub: ['모으는 곳', 'v_hub'], lead: ['정리하는 사람', 'v_lead']},
  usecases: [
    {id: 'uc_prep', f: 'plan', s: '동선 짜기', t: '관심 회사로 동선을 짠다', d: '출발 전, 폰에서', prop: true, lanes: ['me', 'app'], steps: [
      ['me', 'app', '온라인 명함을 만든다 (태그 · 한 줄 · 깃허브 · 디스코드)'],
      ['app', 'me', '명함 화면: QR 둘', '', {r: true}],
      ['app', 'me', '태그에 맞는 분야를 먼저 보여 준다', '', {r: true}],
      ['me', 'app', '분야를 고른다'],
      ['app', 'me', '그 분야 회사 목록', '', {r: true}],
      ['me', 'app', '마음에 드는 회사를 관심에 등록'],
      ['app', 'app', '날짜 · 캠퍼스 · 걷는 차례로 묶는다'],
      ['app', 'me', '날짜별 동선', '', {r: true}]
    ]},
    {id: 'uc_site', f: 'plan', s: '현장 길찾기', t: '현장에서 다음 곳을 찾는다', d: 'CES 날, 데이터가 약해도', prop: true, lanes: ['me', 'app'], steps: [
      ['me', 'app', '내 위치 보기'],
      ['app', 'app', 'GPS로 캠퍼스 · 홀을 맞춘다'],
      ['app', 'me', '지도에 내 자리 · 다음 갈 곳', '', {r: true}],
      ['me', 'app', '가까운 부스 번호를 넣는다', '', {alt: '홀 안에서 GPS가 흔들리면'}],
      ['app', 'me', '다음 곳까지 걷는 길 · 구글맵 길찾기', '', {r: true}]
    ]},
    {id: 'uc_diary', f: 'plan', s: '일기 모으기', t: '회사 일기를 모아 네 태그로 정리한다', d: '현장과 다녀온 뒤', prop: true, lanes: ['me', 'app', 'hub', 'lead'], steps: [
      ['me', 'app', '본 회사마다 일기를 쓴다 (네 태그)'],
      ['me', 'app', '보내기를 누른다'],
      ['app', 'hub', '내 일기를 보낸다'],
      ['hub', 'lead', '모인 일기'],
      ['lead', 'lead', '네 태그로 나눠 정리한다'],
      ['lead', 'me', '올해의 IT 정보 한 장을 나눈다', '', {r: true}]
    ]}
  ],
  dataMap: {
    stores: [
      {id: 'phone', n: '내 폰', l: 'app', life: '앱을 지우거나 브라우저 기록을 지울 때까지', d: '나 · 관심 · 동선 · 일기 — 다른 사람에게 가지 않는다. 서비스 워커가 화면 · 코어 · 자료도 폰에 담아 인터넷 없이 연다'},
      {id: 'site', n: '웹 주소 (GitHub Pages)', l: 'tec', life: '공개 판 동안', d: '앱 화면 · 폰용 코어(WASM) · CES 전시사 자료 · 찾기 색인 · 장소 자료'},
      {id: 'hub', n: '[제안] 모으는 곳', l: 'app', life: '정리가 끝날 때까지', d: '보내기를 누른 일기만. 방식은 정할 것(구글 시트 한 장 안)'}
    ],
    data: [
      {id: 'd_profile', st: 'phone', n: '내 온라인 명함', one: '별명 · 태그 하나 · 한 줄 소개 · 깃허브 · 디스코드', shape: ['별명', '태그(학생 · 취준생 · 정년 · 장년)', '한 줄', '깃허브 주소', '디스코드 주소', '고른 분야'], w: [[null, '처음 열 때 명함을 만든다']], r: [[null, '명함 화면의 QR 둘(폰에서 만든다) · 분야 추천 · 일기의 태그 기본값']], life: '내 폰에만 (localStorage ces2027.profile.v1)', never: '전화번호 · 주민번호 같은 민감한 것은 받지 않는다'},
      {id: 'd_topics', st: 'phone', n: '주제 판', one: '주제 10개까지, 주제마다 볼 회사와 네 태그 칸', shape: ['주제 이름', '공식 분야', '볼 회사', '학생 · 취준생 · 정년 · 장년 칸'], w: [[null, '주제 화면에서 후보(공식 분야 · 혁신상)를 고르거나 직접 적는다']], r: [[null, '출발 전 판 한 장(마크다운)으로 복사 · 파일. 넣은 회사는 관심과 동선으로 이어진다']], life: '내 폰에만 (localStorage ces2027.topics.v1)'},
      {id: 'd_interest', st: 'phone', n: '관심 회사', one: '등록한 회사와 날짜', shape: ['회사 id', '날짜(미정 또는 첫날 ~ 넷째 날)'], w: [[null, '회사 목록 · 찾기에서 관심 단추']], r: [[null, '동선 짜기']], life: '내 폰에만 (localStorage ces2027.interests.v1). 목록의 차례가 걷는 차례다'},
      {id: 'd_route', st: 'phone', n: '동선', one: '날짜별 걷는 차례', shape: ['날짜', '캠퍼스', '걷는 차례(부스 번호로 짐작)'], w: [[null, '앱이 관심 회사를 날짜 · 캠퍼스 · 홀 · 통로 차례로 세우고 내가 날짜를 바꾼다']], r: [[null, '현장에서 다음 갈 곳']]},
      {id: 'd_diary', st: 'phone', n: '회사 일기', one: '본 것 · 느낀 점 · 네 태그', shape: ['날짜', '회사', '본 것', '느낀 점', '누구에게(네 태그, 여럿)', '보낸 때'], w: [[null, '본 회사마다 쓴다']], r: [[null, '보내기 · 파일로 내보내기 · 글로 복사']], life: '내 폰에만 (localStorage ces2027.diary.v1). 보내기를 누른 것만 밖으로 나간다'},
      {id: 'd_ces', st: 'site', n: 'CES 전시사 자료', one: '공식 검색에서 받아 줄인 것', shape: ['이름', '부스@장소', '분야', '나라', '혁신상', '공식 링크', '받은 날짜'], w: [[null, 'Rust 자료 도구(ces-data)가 지을 때 공식 전시사 검색에서 받는다']], r: [[null, '찾기 · 동선 · 지도']], life: '자료를 새로 받을 때 판 이름(받은 날짜)이 바뀐다', never: '회사 소개 글은 설정(companyIntro)이 링크만이면 싣지 않는다'},
      {id: 'd_index', st: 'site', n: '찾기 색인', one: '낱말 → 전시사 줄 번호', shape: ['이름 낱말', '부스 · 장소 · 분야 · 나라 낱말', '한글 별칭'], w: [[null, '자료 도구가 줄이면서 만든다']], r: [[null, '폰의 코어(ces-core, WASM)가 읽고 찾는다']]},
      {id: 'd_places', st: 'site', n: '장소 자료', one: '홀 · 캠퍼스 모양과 구글맵 이름 · 주소', shape: ['캠퍼스 셋', '장소 31곳의 모양', '부스 → 장소 규칙', '구글맵 이름 · 주소', '부스 자리 짐작 표시', 'GPS 어림 자리(캠퍼스 · 홀 근처)'], w: [[null, 'data/places.json을 손으로 고친다 (공식 캠퍼스 지도 2026-09-29판)']], r: [[null, '자료 도구(부스에 장소 붙이기) · 지도 · 길찾기']], life: '정식 배치도가 열리면 홀마다 짐작 표시를 고친다'},
      {id: 'd_pool', st: 'hub', n: '모인 일기', one: '보내기를 누른 일기만', never: '보내지 않은 일기', w: [[null, '보내기를 누를 때. 지금은 파일(ces-2027-diary 1판)로 내려오고, 설정 collectorUrl에 주소가 있으면 그리로 간다']], r: [[null, '정리하는 사람이 자료 도구(ces-data sort-diary)로 네 태그 한 장 초안을 만든다']], shape: ['별명 · 태그', '일기(날짜 · 회사 · 부스 · 본 것 · 느낀 점 · 누구에게)']}
    ],
    flow: [
      {o: null, t: '받기', d: 'Rust 도구가 공식 자료를 받아 줄인다', dm: ['d_ces', 'd_index', 'd_places']},
      {o: null, t: '고르기', d: '나 · 분야 · 관심 · 동선이 폰에 쌓인다', dm: ['d_profile', 'd_topics', 'd_interest', 'd_route']},
      {o: null, t: '쓰기', d: '현장에서 회사 일기', dm: ['d_diary']},
      {o: null, t: '모으기', d: '보내기를 누른 일기만 한곳에', dm: ['d_pool']}
    ]
  },
  legend: ['**만드는 중이다.** 실선은 코드에 있는 것, 점선은 아직 없는 것이다. 세션이 끝날 때마다 코드에 맞춰 고친다.', '**[제안]** 붙은 것은 아직 정하지 않은 것이다.']
};
