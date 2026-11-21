// 지은 것(dist)에 판 이름을 찍고, 서비스 워커가 담아 둘 파일 목록을 채운다.
// 쓰는 법: node scripts/stamp.mjs dist
// 판 이름 = 자료 받은 날짜 + 커밋 앞 일곱 글자. 자료나 코드가 바뀌면 판 이름이 바뀌고 폰이 새로 담는다.

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const dist = process.argv[2] || 'dist';

async function walk(dir, base = '') {
  const out = [];
  for (const entry of await readdir(join(dir, base), { withFileTypes: true })) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...await walk(dir, rel));
    else out.push(rel);
  }
  return out;
}

const meta = await readFile(join(dist, 'data/meta.json'), 'utf8').then(JSON.parse, () => null);
const sha = (process.env.GITHUB_SHA || '').slice(0, 7) || `local${Date.now().toString(36)}`;
const version = `${meta?.v || 'nodata'}-${sha}`;
await writeFile(join(dist, 'version.json'), JSON.stringify({ v: version, data: meta?.v || null, built: new Date().toISOString().replace(/\.\d+Z$/, 'Z') }));

// 누를 때만 받는 것(폰 안 받아쓰기 모델의 실행기, 15MB쯤)은 미리 담지 않는다 (web/sw.js의 LAZY와 같은 곳).
const LAZY = ['vendor/'];
const files = (await walk(dist)).filter((f) => f !== 'sw.js' && !f.startsWith('.') && !LAZY.some((dir) => f.startsWith(dir))).sort();
const list = ['./', ...files];
const swPath = join(dist, 'sw.js');
const sw = await readFile(swPath, 'utf8');
if (!sw.includes("'__VERSION__'") || !sw.includes('/*__FILES__*/')) throw new Error('sw.js에 채울 자리가 없다 (이미 찍었거나 꼴이 바뀌었다)');
await writeFile(swPath, sw.replace("'__VERSION__'", JSON.stringify(version)).replace('/*__FILES__*/', list.map((f) => JSON.stringify(f)).join(', ')));
console.log(`판 이름 ${version} · 담아 둘 파일 ${list.length}개`);
