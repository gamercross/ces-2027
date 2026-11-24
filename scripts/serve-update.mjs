// 시험용 서버: 옛 판 → 새 판으로 넘어가는 것을 흉내 낸다 (scripts/browser-update.mjs가 쓴다).
// 쓰는 법: node scripts/serve-update.mjs dist 47572
//   처음에는 dist 그대로(옛 판)를 준다.
//   /__switch 를 부르면 "새 판"을 준다: store.js에 새 이름(export) 하나가 생기고, 화면 조각(views/*.js)이 그 이름을 가져다 쓰고, sw.js · version.json의 판 이름이 바뀐다.
//     → 옛 store.js와 새 화면 조각이 섞이면 "이름을 못 찾는다"로 화면이 안 열린다. 실제 배포에서 생기는 일과 같다.
//   부를 때마다 새 이름이 달라진다(차례 번호). /__reset 을 부르면 다시 옛 판을 준다.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';

const dir = process.argv[2] || 'dist';
const port = Number(process.argv[3] || 47572);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8' };
// 판 이름은 물을 때마다 읽는다 (서버를 띄워 둔 채 dist를 다시 지어도 맞게).
const baseOf = async () => JSON.parse(await readFile(join(dir, 'version.json'), 'utf8')).v;
let turn = 0; // 0 = 옛 판, n = n번째 새 판

function next(path, body, base) {
  if (!turn) return body;
  const name = `__next${turn}`;
  if (path === '/store.js') return `${body}\nexport const ${name} = true;\n`;
  if (/^\/views\/[^/]+\.js$/.test(path)) return `import { ${name} } from '../store.js';\n${body}`;
  if (path === '/sw.js' || path === '/version.json') return String(body).split(base).join(`${base}-next${turn}`);
  return body;
}

createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (path === '/__switch') { turn += 1; res.writeHead(200, { 'cache-control': 'no-store' }); res.end(`새 판 ${turn}`); return; }
  if (path === '/__reset') { turn = 0; res.writeHead(200, { 'cache-control': 'no-store' }); res.end('옛 판'); return; }
  try {
    let file = join(dir, path);
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    const rel = file.slice(dir.length).replace(/\\/g, '/');
    const text = ['.js', '.json'].includes(extname(file));
    const body = next(rel.startsWith('/') ? rel : `/${rel}`, await readFile(file, text ? 'utf8' : undefined), turn ? await baseOf() : '');
    // GitHub Pages와 같은 머리글. 이 고장은 머리글과 상관없이 난다(no-store로도 났다).
    res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream', 'cache-control': 'max-age=600' });
    res.end(body);
  } catch { res.writeHead(404); res.end('없다'); }
}).listen(port, '127.0.0.1', () => baseOf().then((base) => console.log(`열림 http://127.0.0.1:${port}/ (옛 판 ${base})`)));
