// 폰의 diary.wasm이 자료 도구(`ces-data sort-diary`)와 같은 한 장을 만드는지 견준다 (R46).
// 쓰는 법: node scripts/diary-wasm.mjs <ces_diary.wasm> <ces-data 실행 파일> [일기 파일이 든 폴더]
// 일기 파일은 지어낸 것(crates/ces-data/tests/fixtures/diary)만 쓴다. 진짜 일기를 넣지 않는다.

import { execFileSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { loadDiaryCore, parseOnePage } from '../web/diarycore.js';

const [wasmPath, toolPath, dir = 'crates/ces-data/tests/fixtures/diary'] = process.argv.slice(2);
if (!wasmPath || !toolPath) throw new Error('쓰는 법: node scripts/diary-wasm.mjs <ces_diary.wasm> <ces-data> [폴더]');

const lines = [];
let failed = 0;
const check = (ok, what) => { lines.push(`${ok ? '됨' : '안 됨'} | ${what}`); if (!ok) failed += 1; };

const files = (await readdir(dir)).filter((f) => f.endsWith('.json')).sort();
const texts = await Promise.all(files.map((f) => readFile(join(dir, f), 'utf8')));
const MADE_AT = '2027-01-15T00:00:00Z';
const core = await loadDiaryCore(await readFile(wasmPath));

// 1. 같은 파일들로 폰 코어와 자료 도구가 같은 한 장을 만든다 (글자 하나까지).
core.reset();
const reads = texts.map((t) => core.add(t));
check(reads.every((r) => r.ok), `일기 파일 ${files.length}개를 폰 코어가 읽는다 (${reads.map((r) => r.entries).join(' · ')}개)`);
const page = core.page(MADE_AT);
const cli = execFileSync(toolPath, ['sort-diary', '--in', dir, '--made-at', MADE_AT], { encoding: 'utf8' });
check(page === cli, `폰 코어의 한 장이 \`sort-diary\`의 한 장과 글자 하나까지 같다 (${page.length}자)`);

// 2. 같은 일기는 한 번만 센다: 파일을 두 번 골라도, 순서를 바꿔도 그대로.
const once = core.count();
core.reset();
for (const t of [...texts, ...texts].reverse()) core.add(t);
check(core.count() === once && core.page(MADE_AT) === cli, `같은 파일을 두 번 · 거꾸로 골라도 일기 ${once}개 그대로, 한 장도 같다`);

// 3. 일기 파일이 아닌 것은 까닭과 함께 거절하고 나머지는 읽는다.
core.reset();
const bad = [core.add('{"app":"other","v":1}'), core.add('이건 JSON이 아니다'), core.add('{"app":"ces-2027-diary","v":9,"entries":[]}'), core.add(texts[0])];
check(!bad[0].ok && /일기를 내보낸 파일이 아니다/.test(bad[0].why) && !bad[1].ok && /JSON이 아니다/.test(bad[1].why) && !bad[2].ok && /판 번호/.test(bad[2].why) && bad[3].ok,
  '일기 파일이 아닌 것 · JSON이 아닌 것 · 판 번호가 다른 것은 까닭을 말하고 거절한다. 나머지 파일은 읽는다');

// 4. 비우면 아무것도 남지 않는다 (고른 파일과 한 장은 이 안에만 있다).
core.reset();
check(core.count() === 0 && core.page(MADE_AT).includes('- 일기 0개 · 쓴 사람 0명 · 회사 0곳'), '비우면 일기 0개로 돌아간다');

// 5. 화면이 읽는 꼴.
const parsed = parseOnePage(cli);
const names = parsed.tags.map((t) => t.title);
check(names.slice(0, 4).join(',') === '학생,취준생,정년,장년' && parsed.head.length >= 3, `한 장을 화면 꼴로 읽는다 (칸: ${names.join(' · ')})`);
const withCompanies = parsed.tags.filter((t) => t.list.length);
check(withCompanies.length >= 2 && withCompanies.every((t) => t.list.every((c) => c.name && c.parts.length)) && parsed.tags.every((t) => t.list.length === t.companies), '칸마다 회사 수와 회사 줄 수가 맞고, 회사마다 본 것 · 느낀 점이 있다');

const text = lines.join('\n');
console.log(text);
if (failed) { console.error(`\n안 된 것 ${failed}개`); process.exit(1); }
console.log(`\n모두 됨 (${lines.length}개)`);
