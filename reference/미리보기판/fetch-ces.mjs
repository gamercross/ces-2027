// CES 2027 전시사 자료를 다시 받아 data/exhibitors.json 을 만든다.
// 쓰는 법: node scripts/fetch-ces.mjs   (Node 18 이상)
// 그다음: node scripts/build.mjs   (index.html 다시 만들기)
//
// 출처: CES 공식 전시사 검색 (exhibitors.ces.tech, Map Your Show 8.0).
// 이 사이트는 X-Requested-With 머리글이 없으면 403을 준다.
// 그래도 막히면 Aside가 브라우저 탭(exhibitors.ces.tech)에서 같은 요청을 돌린다 (루틴.md 4절).

import { writeFile, mkdir } from 'node:fs/promises';

const ORIGIN = 'https://exhibitors.ces.tech';
const BASE = ORIGIN + '/8_0/ajax/remote-proxy.cfm';
const HEADERS = {
  'X-Requested-With': 'XMLHttpRequest',
  'Accept': 'application/json, text/plain, */*',
  'Referer': ORIGIN + '/8_0/explore/exhibitor-gallery.cfm?featured=false',
  'User-Agent': 'Mozilla/5.0 (ces-2027-map data refresh)'
};

async function getJson(query) {
  const res = await fetch(BASE + '?' + query, { headers: HEADERS });
  if (!res.ok) throw new Error(`${res.status} ${query}`);
  return res.json();
}
async function options(fn) {
  const j = await getJson('action=getsearchoptions&function=' + fn);
  return j.DATA;
}
async function searchAll(type, value) {
  const out = [];
  for (let start = 0; start < 10000; start += 500) {
    const q = `action=search&searchtype=${type}` + (value != null ? `&search=${encodeURIComponent(value)}` : '') + `&searchsize=500&start=${start}`;
    const j = await getJson(q);
    const ex = j.DATA.results.exhibitor;
    if (!ex) break;
    out.push(...ex.hit.map((h) => h.fields));
    if (out.length >= ex.found || !ex.hit.length) break;
  }
  return out;
}

// 부스 문자열 + 홀 기호 -> 장소 기호 (src/template.html 의 PLACES 와 같아야 한다)
const PLACE_BY_HALL = {
  A: 'LVCC_N', E: 'LVCC_N_MTG', B: 'LVCC_C', D: 'LVCC_S_MTG', C: 'LVCC_S3', NN: 'LVCC_W', RR: 'LVCC_W_MTG', EE: 'LVCC_W_MTG', L: 'LVCC_CP',
  M: 'VEN_G', X: 'VEN_AD', H: 'VEN_L3', Y: 'VEN_L4', J: 'VEN_TOWER', U: 'VEN_TOWER',
  P: 'WYNN', QQ: 'WYNN', PP: 'WYNN', O: 'FONT', AAA: 'FONT', N: 'WESTGATE', TT: 'RW',
  AA: 'ARIA', GG: 'ARIA', Z: 'ARIA', CC: 'ARIA', UU: 'ARIA', DD: 'ARIA', SS: 'ARIA', II: 'ARIA',
  BB: 'VDARA', JJ: 'VDARA', YY: 'COSMO', ZZ: 'COSMO', HH: 'BEACH'
};
export function placeOf(booth, hall) {
  if (/^\d+[a-zA-Z]?$/.test(booth)) {
    const n = parseInt(booth, 10);
    if (n >= 3000 && n <= 7999) return 'LVCC_W';
    if (n >= 10000 && n <= 16999) return 'LVCC_N';
    if (n >= 20000 && n <= 28999) return 'LVCC_C';
    if (n >= 30000 && n <= 32999) return 'LVCC_S1';
    if (n >= 35000 && n <= 36999) return 'LVCC_S2';
    if (n >= 40000 && n <= 41999) return 'LVCC_S3';
    if (n >= 50000 && n <= 56999) return 'VEN_AD';
    if (n >= 60000 && n <= 63999) return 'VEN_G';
    return 'UNKNOWN';
  }
  if (/^CP\d+/.test(booth)) return 'LVCC_CP';
  if (/^Silver 3/.test(booth)) return 'LVCC_SILVER3';
  if (/^DL-/.test(booth)) return 'LVCC_DIAMOND';
  if (/^GL-/.test(booth)) return 'LVCC_GL';
  if (/^N\d{3}/.test(booth)) return 'LVCC_N_MTG';
  if (/^W\d{3}/.test(booth)) return 'LVCC_W_MTG';
  if (/^C\d{3}/.test(booth)) return 'LVCC_C_MTG';
  if (/^S\d{3}/.test(booth)) return 'LVCC_S_MTG';
  if (/^(Galileo|Marco Polo|Casanova)/.test(booth)) return 'VEN_L1';
  if (/^(Bellini|Titian|Veronese|Bassano)/.test(booth)) return 'VEN_L2';
  if (/^Venetian [A-Z]/.test(booth) && !/Palazzo/.test(booth)) return 'VEN_BALL';
  if (/^(Lido|Murano|San Polo)/.test(booth)) return 'VEN_L3';
  if (/^(Delfino|Lando|Marcello|Zeno)/.test(booth)) return 'VEN_L4';
  if (/^Suite \d/.test(booth) || /Venetian Palazzo Hospitality/.test(booth)) return 'VEN_TOWER';
  if (/^Wynn Encore/.test(booth)) return 'WYNN';
  if (/^Fontainebleau/.test(booth) || /^F[TLR]-/.test(booth)) return 'FONT';
  if (/^Westgate/.test(booth)) return 'WESTGATE';
  if (/^Resorts World/.test(booth)) return 'RW';
  if (/^(Aria|ARIA) Hospitality/.test(booth)) return 'ARIA';
  if (/^Vdara/.test(booth) || /^Silk/.test(booth)) return 'VDARA';
  if (/^Cosmopolitan/.test(booth) || /^Condesa/.test(booth)) return 'COSMO';
  if (/^Beach Lot/.test(booth)) return 'BEACH';
  return PLACE_BY_HALL[hall] || ('HALL_' + hall);
}
function parseIcons(s) {
  if (!s) return [];
  let t = String(s).trim();
  if (t.startsWith('"') && t.endsWith('"')) t = t.slice(1, -1);
  try { return JSON.parse(t); } catch { return []; }
}
function clean(s, max) {
  if (!s) return '';
  let t = s.replace(/\s+/g, ' ').trim();
  if (t.length > max) t = t.slice(0, max - 1).replace(/\s\S*$/, '') + '…';
  return t;
}

async function main() {
  console.log('전시사 목록 받는 중…');
  const all = await searchAll('exhibitorgallery', null);
  console.log('전시사', all.length);

  const cats = (await options('getsearchcategories&exhibitorgallery=true')).filter((d) => d.fieldvalue !== 999999999).map((d) => d.fielddisplay);
  const exCats = new Map();
  for (const [ci, c] of cats.entries()) {
    const j = await getJson(`action=search&searchtype=category&search=${encodeURIComponent(c)}&searchsize=50&start=0`);
    const hits = j.DATA.results.category?.hit || [];
    const hit = hits.find((h) => (h.fields.category_t || '').toLowerCase() === c.toLowerCase()) || hits[0];
    for (const id of (hit?.fields?.exhid_t || '').split(',').map((s) => s.trim()).filter(Boolean)) {
      if (!exCats.has(id)) exCats.set(id, []);
      exCats.get(id).push(ci);
    }
  }
  console.log('분야', cats.length);

  const countries = (await options('getcountries')).map((d) => d.fieldvalue);
  const byCountry = {};
  for (const c of countries) byCountry[c] = (await searchAll('country', c)).map((f) => f.exhid_l);
  const sorted = Object.entries(byCountry).sort((a, b) => b[1].length - a[1].length).map(([c]) => c);
  const cIdx = new Map(sorted.map((c, i) => [c, i]));
  const exCountry = new Map();
  for (const [c, ids] of Object.entries(byCountry)) for (const id of ids) exCountry.set(id, cIdx.get(c));
  console.log('나라', sorted.length);

  const ex = all.map((f) => {
    const icons = parseIcons(f.exhicons_l);
    let award = 0;
    if (icons.some((ic) => ic.columnname === 'innovation')) award |= 1;
    if (icons.some((ic) => ic.columnname === 'boi')) award |= 2;
    const booths = (f.booths_la || []).map((b, i) => { const code = b.replace('randomstring', ''); return code + '@' + placeOf(code, (f.hallid_la || [])[i]); });
    const ks = (exCats.get(f.exhid_l) || []).sort((a, b) => a - b);
    return [f.exhid_l, f.exhname_t.trim(), clean(f.exhdesc_t, 320), exCountry.has(f.exhid_l) ? exCountry.get(f.exhid_l) : -1, ks.join('.'), award, f.exhfeatured_t ? 1 : 0, booths];
  }).sort((a, b) => a[1].localeCompare(b[1], 'en', { sensitivity: 'base' }));

  const unknown = ex.flatMap((r) => r[7]).filter((s) => /@(UNKNOWN|HALL_)/.test(s));
  if (unknown.length) console.warn('장소를 못 정한 부스 (src/template.html PLACES 와 이 파일 placeOf 를 고칠 것):', unknown.slice(0, 20));

  const fetchedAt = new Date().toISOString();
  const data = { v: fetchedAt.slice(0, 10), fetchedAt, src: ORIGIN + '/8_0/', n: ex.length, cats, countries: sorted, ex };
  await mkdir('data', { recursive: true });
  await writeFile('data/exhibitors.json', JSON.stringify(data));
  const kor = ex.filter((r) => r[3] === sorted.indexOf('South Korea')).length;
  console.log(`끝: 전시사 ${ex.length} · 한국 ${kor} · 혁신상 표시 ${ex.filter((r) => r[5]).length} · ${data.v}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e.message); process.exit(1); });
