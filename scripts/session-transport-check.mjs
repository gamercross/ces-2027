const sessions = JSON.parse(await (await import('node:fs/promises')).readFile('data/sessions.json', 'utf8'));
const transport = JSON.parse(await (await import('node:fs/promises')).readFile('data/transport.json', 'utf8'));

let failed = 0;
const check = (ok, text) => {
  console.log(`${ok ? '됨' : '안 됨'} | ${text}`);
  if (!ok) failed++;
};

check(sessions.items.length >= 1, '세션 자료에 확인된 공식 일정이 하나 이상 있다');
check(sessions.items.every((it) => it.source?.url?.startsWith('https://www.ces.tech/') && /^\d{4}-\d\d-\d\d$/.test(it.source.read)), '세션 줄마다 공식 출처와 확인 날짜가 있다');
check(transport.items.length >= 3, '이동 자료에 셔틀 노선 세 곳 이상이 있다');
check(transport.items.every((it) => it.source.startsWith('https://www.ces.tech/') && it.board && it.hours), '이동 줄마다 공식 출처와 타는 곳과 시간 칸이 있다');

process.exitCode = failed ? 1 : 0;
