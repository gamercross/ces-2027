// 공식 전시사 검색의 정식 배치도가 열렸는지 본다 (validHalls가 비어 있으면 닫힘).
// 쓰는 법: node scripts/check-floorplan.mjs   → 한 줄 JSON을 찍고, GitHub Actions면 GITHUB_OUTPUT에 open=true|false를 쓴다.
// 사이트를 읽지 못한 날은 "모름"으로 끝낸다(닫혔다고 단정하지 않는다).

import { appendFile } from 'node:fs/promises';
import { isOpen, parseValidHalls } from './floorplan-lib.mjs';

const URL_ = 'https://exhibitors.ces.tech/8_0/';
let state = 'unknown';
let halls = null;
try {
  const res = await fetch(URL_, { headers: { 'user-agent': 'ces-2027-floorplan-watch (personal study project)' } });
  if (res.ok) {
    halls = parseValidHalls(await res.text());
    state = halls === null ? 'unknown' : isOpen(halls) ? 'open' : 'closed';
  }
} catch { state = 'unknown'; }
console.log(JSON.stringify({ state, halls, checked: new Date().toISOString().replace(/\.\d+Z$/, 'Z'), url: URL_ }));
if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `state=${state}\n`);
