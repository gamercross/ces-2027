// 영한 번역 모델이 쓰는 단어 사전(토크나이저) 두 개를 만든다: 원문(영어)용 · 번역문(한국어)용.
// 쓰는 법: node scripts/fetch-translate-tokenizers.mjs dist [받아 둘 폴더]
// 까닭: 이 모델(OPUS-MT tc-big)은 영어 사전과 한국어 사전이 따로다. 변환본 저장소들에는 Transformers.js가 읽는
//   tokenizer.json이 없고, 한 장짜리 사전(원본의 vocab.json은 한국어 쪽이다)으로는 영어가 엉뚱한 번호로 바뀌어 번역이 깨진다.
// 하는 일: 원본 저장소의 고정한 판에서 source.spm · target.spm을 받고 sha256을 맞춘 뒤(파이썬 없이 이 파일이 직접 읽는다),
//   Transformers.js가 읽는 tokenizer.json 둘을 dist/vendor/translate/에 쓴다. 쓴 것의 sha256도 못 박아 두었다(같은 입력이면 같은 출력).
// 목록은 data/speech-model.json의 translation.tokenizer. 하나라도 다르면 실패로 끝난다.

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

// SentencePiece 모델(protobuf)에서 조각 목록만 읽는다: ModelProto.pieces(1) = { piece(1), score(2, float), type(3) }.
function varint(b, i) {
  let r = 0n;
  let s = 0n;
  for (;;) {
    const x = b[i++];
    r |= BigInt(x & 127) << s;
    if (!(x & 128)) break;
    s += 7n;
  }
  return [Number(r), i];
}
export function readPieces(buf) {
  const out = [];
  let i = 0;
  while (i < buf.length) {
    let tag;
    [tag, i] = varint(buf, i);
    const field = tag >> 3;
    const wire = tag & 7;
    if (wire === 2) {
      let len;
      [len, i] = varint(buf, i);
      const sub = buf.subarray(i, i + len);
      i += len;
      if (field === 1) {
        let j = 0;
        let piece = '';
        let score = 0;
        while (j < sub.length) {
          let t;
          [t, j] = varint(sub, j);
          const f = t >> 3;
          const w = t & 7;
          if (w === 2) { let l; [l, j] = varint(sub, j); if (f === 1) piece = Buffer.from(sub.subarray(j, j + l)).toString('utf8'); j += l; }
          else if (w === 5) { if (f === 2) score = Buffer.from(sub.subarray(j, j + 4)).readFloatLE(0); j += 4; }
          else if (w === 0) { [, j] = varint(sub, j); }
          else if (w === 1) j += 8;
          else throw new Error(`읽을 수 없는 꼴 ${w}`);
        }
        out.push([piece, score]);
      }
    } else if (wire === 0) [, i] = varint(buf, i);
    else if (wire === 5) i += 4;
    else if (wire === 1) i += 8;
    else throw new Error(`읽을 수 없는 꼴 ${wire}`);
  }
  return out;
}

// 조각 번호 = 목록 순서 (원본 사전과 한 칸도 다르지 않음을 Tigre의 vocab.json으로 맞춰 보았다). 32000번은 <pad>.
export function tokenizerJson(spm, withEos) {
  const vocab = readPieces(spm);
  if (vocab.length !== 32000) throw new Error(`조각 수가 다르다 (${vocab.length})`);
  vocab.push(['<pad>', 0]);
  const special = (id, content) => ({ id, content, single_word: false, lstrip: false, rstrip: false, normalized: false, special: true });
  return {
    version: '1.0',
    truncation: null,
    padding: null,
    added_tokens: [special(0, '<unk>'), special(2, '</s>'), special(32000, '<pad>')],
    normalizer: { type: 'Sequence', normalizers: [{ type: 'NFKC' }, { type: 'Replace', pattern: { Regex: ' {2,}' }, content: ' ' }, { type: 'Strip', strip_left: true, strip_right: true }] },
    pre_tokenizer: { type: 'Metaspace', replacement: '▁', prepend_scheme: 'always', split: true },
    post_processor: withEos ? { type: 'TemplateProcessing', single: [{ Sequence: { id: 'A', type_id: 0 } }, { SpecialToken: { id: '</s>', type_id: 0 } }], pair: [{ Sequence: { id: 'A', type_id: 0 } }, { Sequence: { id: 'B', type_id: 0 } }], special_tokens: { '</s>': { id: '</s>', ids: [2], tokens: ['</s>'] } } } : null,
    decoder: { type: 'Metaspace', replacement: '▁', prepend_scheme: 'always', split: true },
    model: { type: 'Unigram', unk_id: 0, vocab, byte_fallback: false },
  };
}

if (process.argv[1]?.endsWith('fetch-translate-tokenizers.mjs')) {
  const [dist = 'dist', keep] = process.argv.slice(2);
  const info = JSON.parse(await readFile(new URL('../data/speech-model.json', import.meta.url), 'utf8')).translation.tokenizer;
  const out = join(dist, info.dir);
  await mkdir(out, { recursive: true });
  if (keep) await mkdir(keep, { recursive: true });
  const spm = {};
  for (const f of info.from) {
    let bytes = keep ? await readFile(join(keep, f.name)).catch(() => null) : null;
    let how = '받아 둔 것';
    if (!bytes || bytes.length !== f.bytes || sha(bytes) !== f.sha256) {
      const res = await fetch(f.url, { headers: { 'user-agent': 'ces-2027 build (generic)' } });
      if (!res.ok) throw new Error(`${f.name}: 받지 못했다 (${res.status}) ${f.url}`);
      bytes = Buffer.from(await res.arrayBuffer());
      how = '새로 받음';
    }
    if (bytes.length !== f.bytes || sha(bytes) !== f.sha256) throw new Error(`${f.name}: 못 박아 둔 것과 다르다 (크기 ${bytes.length} / ${f.bytes}, sha256 ${sha(bytes)}). 쓰지 않는다`);
    if (keep) await writeFile(join(keep, f.name), bytes);
    spm[f.name] = bytes;
    console.log(`${f.name} · ${(bytes.length / 1048576).toFixed(2)}MB · sha256 맞음 · ${how}`);
  }
  for (const f of info.files) {
    const text = JSON.stringify(tokenizerJson(spm[f.from], f.eos));
    const bytes = Buffer.from(text, 'utf8');
    if (bytes.length !== f.bytes || sha(bytes) !== f.sha256) throw new Error(`${f.name}: 만든 것이 못 박아 둔 것과 다르다 (크기 ${bytes.length} / ${f.bytes}, sha256 ${sha(bytes)})`);
    await writeFile(join(out, f.name), bytes);
    console.log(`${f.name} · ${(bytes.length / 1048576).toFixed(2)}MB · sha256 맞음 · 만듦`);
  }
  console.log(`놓은 곳: ${out}`);
}
