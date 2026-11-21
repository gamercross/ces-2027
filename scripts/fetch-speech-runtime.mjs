// 폰 안 받아쓰기 모델을 돌리는 실행기 파일을 받아, 못 박아 둔 sha256 · 크기와 맞는지 보고 dist/vendor/speech/에 놓는다.
// 쓰는 법: node scripts/fetch-speech-runtime.mjs dist [받아 둘 폴더]
// 목록은 data/speech-model.json. 패키지를 설치하지 않는다(설치 스크립트가 돌지 않는다). 파일만 받고, 하나라도 다르면 실패로 끝난다.
// 받아 둘 폴더를 주면 맞는 파일은 다시 받지 않는다 (Actions 캐시 · 내 컴퓨터).

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const [dist = 'dist', keep] = process.argv.slice(2);
const info = JSON.parse(await readFile(new URL('../data/speech-model.json', import.meta.url), 'utf8'));
const out = join(dist, info.runtime.dir);
await mkdir(out, { recursive: true });
if (keep) await mkdir(keep, { recursive: true });

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const good = (file, bytes) => bytes.length === file.bytes && sha(bytes) === file.sha256;

for (const file of info.runtime.files) {
  let bytes = keep ? await readFile(join(keep, file.name)).catch(() => null) : null;
  let how = '받아 둔 것';
  if (!bytes || !good(file, bytes)) {
    // 우리가 누구인지는 싣지 않는다.
    const res = await fetch(file.from, { headers: { 'user-agent': 'ces-2027 build (generic)' } });
    if (!res.ok) throw new Error(`${file.name}: 받지 못했다 (${res.status}) ${file.from}`);
    bytes = Buffer.from(await res.arrayBuffer());
    how = '새로 받음';
  }
  if (!good(file, bytes)) throw new Error(`${file.name}: 못 박아 둔 것과 다르다 (크기 ${bytes.length} / ${file.bytes}, sha256 ${sha(bytes)}). 쓰지 않는다`);
  await writeFile(join(out, file.name), bytes);
  if (keep) await writeFile(join(keep, file.name), bytes);
  console.log(`${file.name} · ${(bytes.length / 1048576).toFixed(2)}MB · sha256 맞음 · ${how}`);
}

// 같이 내주는 것의 이름 · 판 · 라이선스 · 출처. onnxruntime-web은 MIT 글을 여기에 싣는다.
const notice = `이 폴더의 파일은 다른 사람이 만든 것을 그대로 받아 놓은 것이다. 고치지 않았다.

${info.runtime.packages.map((p) => `- ${p.name} ${p.version} · ${p.license} · ${p.source}`).join('\n')}

@huggingface/transformers의 라이선스 글은 LICENSE-transformers.txt에 있다.

onnxruntime-web (ONNX Runtime)

MIT License

Copyright (c) Microsoft Corporation

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

받아쓰기 모델(${info.dictation.id}, ${info.dictation.license})은 이 폴더에 없다. 폰이 ${info.dictation.source} 에서 바로 받는다.
`;
await writeFile(join(out, 'NOTICE.txt'), notice);
console.log(`놓은 곳: ${out} (파일 ${info.runtime.files.length}개 + NOTICE.txt)`);
